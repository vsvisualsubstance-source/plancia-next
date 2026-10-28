'use strict';
// Smoke test della UI: bridge di prova + browser headless, ogni pagina aperta,
// zero eccezioni, uno screenshot per pagina (riferimento visivo prima/dopo un
// passo del refactor). Non fa parte di `node --test` perche' serve un browser:
//
//   npm run smoke                      (dati: data/state.json se c'e', altrimenti layout di default)
//   node test/ui-smoke.js --state <file> --out <cartella>
//
// Isolato dalla Plancia in esercizio: porta libera, copia dei dati in una
// cartella temporanea, OSC verso 127.0.0.1, timeline video/laser verso device
// inesistenti, pagina in simulazione (?broker=0.0.0.0, nessun comando MQTT).

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const arg = (name, def) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def; };
const OUT = path.resolve(arg('--out', path.join(ROOT, 'test-output', 'smoke')));
const STATE = arg('--state', path.join(ROOT, 'data', 'state.json'));
const BROWSERS = [
  process.env.SMOKE_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome',
].filter(Boolean);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const getJson = u => new Promise((res, rej) => http.get(u, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const waitHttp = async (url, ms) => { const end = Date.now() + ms; while (Date.now() < end) { try { await new Promise((res, rej) => http.get(url, r => { r.resume(); res(); }).on('error', rej)); return; } catch { await sleep(200); } } throw new Error('non risponde: ' + url); };

async function main() {
  const browser = BROWSERS.find(p => fs.existsSync(p));
  if (!browser) throw new Error('nessun browser Chromium/Edge trovato (SMOKE_BROWSER=...)');
  fs.mkdirSync(OUT, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plancia-smoke-'));
  const stateFile = path.join(tmp, 'state.json');
  if (fs.existsSync(STATE)) fs.copyFileSync(STATE, stateFile);
  const [port, oscIn, cdp] = await Promise.all([freePort(), freePort(), freePort()]);
  const procs = [];
  const cleanup = () => { for (const p of procs) { try { p.kill(); } catch { /* gia' chiuso */ } } };
  process.on('exit', cleanup);
  try {
    execSyncBuild();
    const bridge = spawn(process.execPath, ['bridge.js'], { cwd: ROOT, stdio: 'ignore', env: {
      ...process.env, PORT: String(port), OSC_IN: String(oscIn), PLANCIA_STATE_FILE: stateFile,
      OSC_HOST: '127.0.0.1', OSC_PORT: '9', GAIA_OSC_HOST: '127.0.0.1', GAIA_OSC_PORT: '9',
      PATCHDECK_ID: 'smoke-nessuno', LASER_ID: 'smoke-nessuno', PLANCIA_MQTT: 'mqtt://127.0.0.1:9' } });
    procs.push(bridge);
    await waitHttp(`http://127.0.0.1:${port}/`, 15000);
    const br = spawn(browser, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${cdp}`, `--user-data-dir=${path.join(tmp, 'profile')}`, '--window-size=1400,950', 'about:blank'], { stdio: 'ignore' });
    procs.push(br);
    let targets;
    for (let i = 0; i < 60 && !targets; i++) { try { targets = await getJson(`http://127.0.0.1:${cdp}/json`); } catch { await sleep(250); } }
    const page = targets.find(t => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));
    let id = 0; const pending = new Map(), problems = [];
    ws.on('message', m => {
      const d = JSON.parse(m);
      if (d.method === 'Runtime.exceptionThrown') problems.push('eccezione: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split('\n')[0]);
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') problems.push('console.error: ' + d.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200));
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    });
    const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.result?.value;
    await send('Runtime.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/?broker=0.0.0.0` });
    await sleep(6000);
    await ev('window.confirm=()=>false;window.alert=()=>{};window.prompt=()=>null;1');
    const tabs = await ev(`[...document.querySelectorAll('#tabs > *')].map(e=>e.textContent.trim())`) || [];
    if (!tabs.length) problems.push('nessuna pagina nella barra delle tab');
    const report = [];
    for (let i = 0; i < tabs.length; i++) {
      const before = problems.length;
      await ev(`document.querySelectorAll('#tabs > *')[${i}].click();1`);
      await sleep(1500);
      const widgets = await ev(`document.querySelectorAll('#stage .w').length`);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const file = `${String(i + 1).padStart(2, '0')}-${tabs[i].replace(/[^\w]+/g, '_')}.png`;
      fs.writeFileSync(path.join(OUT, file), Buffer.from(shot.result.data, 'base64'));
      const errs = problems.slice(before);
      report.push({ page: tabs[i], widgets, screenshot: file, problems: errs });
      console.log(`${errs.length ? 'ERRORI' : 'ok    '} ${tabs[i].padEnd(16)} widget ${String(widgets).padStart(2)}  ${file}${errs.length ? '\n  ' + errs.join('\n  ') : ''}`);
    }
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ when: new Date().toISOString(), problems, pages: report }, null, 2));
    ws.close();
    console.log(`\n${tabs.length} pagine, ${problems.length} problemi. Screenshot e report in ${OUT}`);
    process.exitCode = problems.length ? 1 : 0;
  } finally {
    cleanup();
  }
}

function execSyncBuild() {
  require('child_process').execFileSync(process.execPath, ['build-app.js'], { cwd: ROOT, stdio: 'ignore' });
}

main().catch(e => { console.error('smoke test fallito:', e.message); process.exitCode = 2; });
