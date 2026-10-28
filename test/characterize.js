'use strict';
// Test di caratterizzazione: fotografa il comportamento ATTUALE della Plancia
// e lo confronta con il riferimento in test/snapshots/characterization.json.
// Serve al refactor: qualunque differenza va spiegata (bug corretto) o e' una
// regressione. Gira nel browser headless (test/browser-harness.js) con una
// build di test che espone l'interno (window.__planciaTest).
//
//   npm run characterize            confronta con il riferimento
//   npm run characterize -- --update  riscrive il riferimento (solo per un cambio voluto)
//
// Cosa fotografa (senza id casuali):
//   widgets     argomenti OSC (argsOf) di ogni tipo, ai valori di default e a valori scelti
//   messages    messaggi davvero spediti al bridge da set/setXY/fire (OSC, canale, MIDI)
//   templates   pagine e widget di ogni template (tipo, posizione, indirizzo, modo)
//   migrations  un layout di vecchio formato passato per tutta la catena uiRev
//   layout      il layout dei dati veri: identico dopo un ricaricamento (idempotente)

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { startPlancia, sleep } = require('./browser-harness');

const ROOT = path.join(__dirname, '..');
const SNAP = path.join(__dirname, 'snapshots', 'characterization.json');
const UPDATE = process.argv.includes('--update');

// eseguito nella pagina: restituisce dati JSON senza id casuali
const PAGE_WIDGETS = `(()=>{const T=window.__planciaTest,out={};
  const pick=w=>({type:w.type,x:w.x,y:w.y,w:w.w,h:w.h,addr:w.addr||'',mode:w.mode||'',label:w.label||''});
  const probes={fader:[{value:.25}],knob:[{value:.75}],meter:[{value:.5}],button:[{value:1},{value:0,mode:'toggle'}],
    xy:[{value:.25,valueY:.75}],scenes:[{value:2},{mode:'multi',value:[1,0,1]}],color:[{value:{h:.5,s:1}},{value:{h:0,s:0}}],
    label:[{}],clock:[{}],timeline:[{}]};
  for(const type of Object.keys(T.DEF)){
    const [w,h]=T.DEF[type],base=T.W(type,0,0,w,h,{addr:'/prova/'+type,min:-1,max:1});
    const row={label:T.NAMES[type],size:[w,h],args:T.argsOf(base)};
    row.probes=(probes[type]||[]).map(o=>{const x=T.W(type,0,0,w,h,{addr:'/prova/'+type,min:-1,max:1,...o});return{set:o,args:T.argsOf(x)}});
    out[type]=row;
  }
  return out})()`;

const PAGE_MESSAGES = `(async()=>{const T=window.__planciaTest,raf=()=>new Promise(r=>requestAnimationFrame(()=>r()));
  window.__sent.length=0;
  const f=T.W('fader',0,0,2,5,{addr:'/dmx/master',min:0,max:255,midi:{ch:2,cc:7}});
  const b=T.W('button',0,0,2,2,{addr:'/dmx/blackout',mode:'toggle',oscChannel:'dmx'});
  const xy=T.W('xy',0,0,4,4,{addr:'/mh/pantilt',min:-1,max:1});
  T.set(f,.5);T.set(b,1);T.setXY(xy,.75,.25);await raf();await raf();
  T.fire('/dmx/scene',[3]);T.fire('/gaia/td/mood/calm',[1],'gaia');
  return window.__sent.map(m=>JSON.parse(JSON.stringify(m)))})()`;

const PAGE_TEMPLATES = `(()=>{const T=window.__planciaTest,out={};
  const pick=w=>[w.type,w.x,w.y,w.w,w.h,w.addr||'',w.mode||'',w.label||''];
  for(const[k,t]of Object.entries(T.TPL))out[k]={name:t.name,pages:t.pages().map(p=>({name:p.name,widgets:p.widgets.map(pick)}))};
  return out})()`;

// un layout di vecchio formato (prima delle migrazioni uiRev): selettore teste
// "MH 1..8", chase locale, due pagine DMX V8 doppie, niente pagine nuove
const PAGE_MIGRATIONS = `(()=>{const T=window.__planciaTest,W=T.W,P=T.P,saved=T.L;
  const legacy={pages:[
    P('Show',[W('timeline',0,0,10,3,{label:'Timeline',addr:'/show',cues:'0:00 Intro > 1'})]),
    P('Timeline',[W('timeline',0,0,16,4,{label:'Timeline',addr:'/show',cues:'0:00 A > 1\\n1:00 B > 2'})]),
    P('Teste mobili',[W('scenes',0,0,8,2,{addr:'/mh/select',mode:'multi',items:'MH 1\\nMH 2\\nMH 3\\nMH 4\\nMH 5\\nMH 6\\nMH 7\\nMH 8',value:[1,0,1,0,0,0,0,0]}),
      W('scenes',8,0,8,2,{addr:'/mh/position',items:'Centro\\nPubblico',cols:4})]),
    P('Regia',[W('scenes',0,0,4,2,{addr:'/dmx/chase',label:'Chase'})]),
    P('DMX V8',[W('tddevice',0,0,8,4,{fam:'dmx'})]),
    P('DMX V8',[W('tddevice',0,0,8,4,{fam:'dmx'})])],fixtures:[]};
  T.ensureStageData(legacy);T.L=legacy;
  const steps=[];
  for(const[name,fn]of T.migrations){fn();steps.push([name,T.L.uiRev||0])}
  const L=T.L,res={steps,uiRev:L.uiRev,pages:L.pages.map(p=>({name:p.name,widgets:p.widgets.map(w=>[w.type,w.addr||'',w.mode||'',w.label||''])})),
    laserScenes:(L.laserScenes||[]).map(s=>s.id)};
  T.L=saved;return res})()`;

function summarizeLayout(L) {
  return JSON.stringify(L);
}

function diff(a, b, at = '', out = []) {
  if (out.length > 30) return out;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || a === null || b === null || typeof a !== 'object') {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${at || '/'}: atteso ${JSON.stringify(a)?.slice(0, 120)} · ora ${JSON.stringify(b)?.slice(0, 120)}`);
    return out;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${at}/${k}`, out);
  return out;
}

async function main() {
  const p = await startPlancia({ hooks: true });
  let snap;
  try {
    const layoutBefore = summarizeLayout(await p.ev('window.__planciaTest.L'));
    snap = {
      widgets: await p.ev(PAGE_WIDGETS),
      messages: await p.ev(PAGE_MESSAGES),
      templates: await p.ev(PAGE_TEMPLATES),
      migrations: await p.ev(PAGE_MIGRATIONS),
    };
    await p.reload();
    const layoutAfter = summarizeLayout(await p.ev('window.__planciaTest.L'));
    snap.layout = { idempotentOnReload: layoutBefore === layoutAfter, pages: JSON.parse(layoutAfter).pages.length };
    snap.inspector = await inspectorSnapshot(p);
    if (p.problems.length) throw new Error('errori nella pagina:\n  ' + p.problems.join('\n  '));
  } finally {
    p.close();
  }
  if (UPDATE || !fs.existsSync(SNAP)) {
    fs.mkdirSync(path.dirname(SNAP), { recursive: true });
    fs.writeFileSync(SNAP, JSON.stringify(snap, null, 1) + '\n');
    console.log(`riferimento ${UPDATE ? 'aggiornato' : 'creato'}: ${path.relative(ROOT, SNAP)}`);
    summary(snap);
    return;
  }
  const ref = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
  const d = diff(ref, snap);
  if (d.length) {
    console.log(`DIFFERENZE rispetto al riferimento (${d.length}${d.length > 30 ? '+' : ''}):\n  ` + d.join('\n  '));
    process.exitCode = 1;
  } else {
    summary(snap);
    console.log('identico al riferimento');
  }
  assert.ok(snap.layout.idempotentOnReload, 'il layout cambia da solo a ogni ricaricamento');
}

// ispettore di "Modifica griglia": per il primo widget di ogni tipo (e di ogni
// modo di scenes) l'HTML e i valori dei campi, entrando davvero in modifica e
// toccando il widget con un mouse vero
async function inspectorSnapshot(p) {
  await p.ev(`document.querySelector('#editBtn').click();1`);
  await sleep(500);
  const targets = await p.ev(`(()=>{const seen=new Set(),out=[];window.__planciaTest.L.pages.forEach((pg,pi)=>pg.widgets.forEach(w=>{
    const k=w.type==='scenes'?'scenes:'+(w.mode||'push'):w.type;if(seen.has(k))return;seen.add(k);out.push({k,pi,id:w.id})}));return out})()`);
  const out = {};
  for (const t of targets) {
    await p.ev(`document.querySelectorAll('#tabs > *')[${t.pi}].click();1`);
    await sleep(400);
    const c = await p.ev(`(()=>{const el=document.querySelector('[data-id="${t.id}"]'),r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await p.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await p.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await sleep(300);
    out[t.k] = await p.ev(`(()=>{const i=document.querySelector('#insp');
      return{html:i.innerHTML.replace(/\\s+/g,' ').trim(),
        fields:Object.fromEntries([...i.querySelectorAll('[id]')].filter(n=>'value' in n).map(n=>[n.id,n.type==='checkbox'?n.checked:n.value]))}})()`);
  }
  await p.ev(`document.querySelector('#editBtn').click();1`);
  return out;
}

function summary(s) {
  console.log(`  widget: ${Object.keys(s.widgets).length} tipi · messaggi: ${s.messages.length} · template: ${Object.keys(s.templates).length}` +
    ` · migrazioni: uiRev ${s.migrations.uiRev}, ${s.migrations.pages.length} pagine · layout idempotente: ${s.layout.idempotentOnReload}` +
    ` · ispettore: ${Object.keys(s.inspector || {}).length} tipi`);
}

main().catch(e => { console.error('caratterizzazione fallita:', e.message); process.exitCode = 2; });
