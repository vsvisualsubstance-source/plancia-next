'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { appModules, buildAppBundle } = require('../build-app');

test('app bundle preserves module order and parses as one client scope', () => {
  const bundle = buildAppBundle();
  const positions = [
    '/* ---------- vocabolario dello show ---------- */',
    '/* ---------- template ---------- */',
    '/* ---------- motore dello show (simulazione locale del rig) ---------- */',
    '/* ---------- disegno widget ---------- */',
    '/* ---------- interazione ---------- */',
    'const DMX_OUTPUT=',
    '/* ---------- connessione al bridge ---------- */',
    '/* ---------- render del palco ---------- */',
    '/* ---------- interazione pianta/patch',
    '/* ---------- Gaia: MQTT',
    '/* ---------- disegno dei widget Gaia ---------- */',
    '/* ---------- interazione widget Gaia ---------- */',
    '/* ---------- simulazione:',
    '/* ---------- ciclo principale ---------- */',
    '/* ---------- impostazioni e template ---------- */',
    'migrateLegacyHeadSelectors();migrateHeadPresetWidgets();migrateUiShowTimeline();migrateUiConsolePages();migrateUiAudioPage();migrateUiNoChase();migrateUiOneDmxV8();migrateUiLaserPage();migrateUiLaserScenes();render();',
    '/* ---------- avvio ---------- */'
  ].map(marker => bundle.indexOf(marker));

  assert.equal(bundle.startsWith('(()=>{\n'), true);
  assert.equal(bundle.endsWith('\n})();\n'), true);
  assert.equal(appModules.length, 35);
  assert.equal(positions.every(position => position >= 0), true);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  assert.doesNotThrow(() => new vm.Script(bundle));
});

test('missing source modules fail the build explicitly', () => {
  assert.throws(() => buildAppBundle('missing-source-directory'));
});

test('Plancia opened on OPS itself talks to localhost (no hairpin on its own LAN IP)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', '70-gaia-mqtt.js'), 'utf8');
  const fn = src.slice(src.indexOf('function netLocalize'), src.indexOf('const net=()'));
  const netLocalize = new Function('OPS_LAN_IP', 'pageIsLocal', fn + 'return netLocalize;')('192.168.1.240', () => false);
  const ops = { broker: '192.168.1.240', nodered: '192.168.1.240', admin: '192.168.1.240', video: '192.168.1.240', osc: '192.168.1.240' };
  const local = netLocalize(ops, true);
  assert.equal(local.broker, 'localhost');
  assert.equal(local.nodered, 'localhost');
  assert.equal(local.video, '192.168.1.240');   // servizi Windows: l'IP di LAN funziona
  assert.equal(netLocalize(ops, false).broker, '192.168.1.240');   // tablet in rete: invariato
  assert.equal(netLocalize({ broker: '192.168.1.142' }, true).broker, '192.168.1.142');
});

test('the app starts only from the last module, after every module has been evaluated', () => {
  const fs = require('node:fs'), path = require('node:path');
  const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
  assert.equal(appModules[appModules.length - 1], '999-start.js');
  assert.match(src('999-start.js'), /^init\(\);$/m);
  // nessuna chiamata di avvio a livello di modulo nel vecchio punto di partenza
  assert.doesNotMatch(src('90-settings-and-bootstrap.js'), /^migrateLegacyHeadSelectors\(\);/m);
});

test('registered widget types live only in their module, not in the old dispatch switches', () => {
  const fs = require('node:fs'), path = require('node:path');
  const dir = path.join(__dirname, '..', 'src');
  const all = appModules.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const registered = [...all.matchAll(/registerWidget\('([^']+)'/g)].map(m => m[1]);
  assert.ok(registered.includes('laser'));
  const dispatch = ['00-core-state.js', '40-widget-rendering.js', '41-widget-interactions.js', '80-animation-loop.js', '95-help-tour.js'];
  for (const type of registered) for (const f of dispatch)
    assert.ok(!fs.readFileSync(path.join(dir, f), 'utf8').includes(`'${type}'`), `${type} compare ancora in ${f}`);
});
