'use strict';
// Registro dei widget (05-widget-registry.js) nel browser: per ogni tipo
// registrato presente nel layout controlla che il contenuto venga da inner(),
// che valore e indirizzo seguano showsValue/showsAddr, che il tocco arrivi al
// tipo senza errori e che la visita guidata "?" mostri l'aiuto registrato.
// In piu' un tocco con effetto visibile per i tipi che lo permettono senza TD.
//   node test/widget-registry.js   (incluso in npm run check)

const assert = require('assert');
const { startPlancia, sleep } = require('./browser-harness');

// tocchi con effetto verificabile anche in simulazione (senza DMX Master)
const VISIBLE_TAPS = {
  fixgrid: { tap: '[data-fg-filter="mh"]', expect: `document.querySelector('[data-fg-filter="mh"]')?.classList.contains('on')` },
};

(async () => {
  const p = await startPlancia({ hooks: true });
  const checked = [];
  try {
    const types = await p.ev(`[...window.__planciaTest.WIDGET_TYPES.keys()]`);
    const tabs = await p.ev(`[...document.querySelectorAll('#tabs > *')].map(e=>e.textContent.trim())`);
    const pages = await p.ev(`window.__planciaTest.L.pages.map(p=>p.widgets.map(w=>w.type))`);
    for (const type of types) {
      const pageIdx = pages.findIndex(ws => ws.includes(type));
      if (pageIdx < 0) { console.log(`--     ${type}: nessun widget nel layout, saltato`); continue; }
      await p.ev(`document.querySelectorAll('#tabs > *')[${pageIdx}].click();1`);
      await sleep(1500);
      const before = p.problems.length;
      const r = await p.ev(`(()=>{const T=window.__planciaTest,spec=T.widgetType('${type}');
        const w=T.L.pages[${pageIdx}].widgets.find(x=>x.type==='${type}'),el=document.querySelector('[data-id="'+w.id+'"]');
        const tmp=document.createElement('div');tmp.innerHTML=spec.inner(w);
        const want=tmp.firstElementChild?.className||'',box=el.querySelector('.box');
        const r=el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
        return{inner:!want||!!box.querySelector(':scope > .'+want.split(' ')[0]),
          valueHidden:spec.showsValue||!el.querySelector('.val'),addrHidden:spec.showsAddr||!el.querySelector('.addr')?.textContent,
          help:spec.help?spec.help(w)[0]:null}})()`);
      await sleep(300);
      assert.ok(r.inner, `${type}: contenuto non creato da inner()`);
      assert.ok(r.valueHidden, `${type}: mostra il valore ma showsValue e' false`);
      assert.ok(r.addrHidden, `${type}: mostra l'indirizzo ma showsAddr e' false`);
      assert.deepEqual(p.problems.slice(before), [], `${type}: errori al tocco`);
      if (VISIBLE_TAPS[type]) {
        await p.ev(`document.querySelector('${VISIBLE_TAPS[type].tap}').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));1`);
        await sleep(400);
        assert.ok(await p.ev(VISIBLE_TAPS[type].expect), `${type}: il tocco non ha effetto`);
      }
      if (r.help) {
        await p.ev(`document.querySelector('#helpBtn').click();1`);
        let found = false;
        for (let i = 0; i < 30 && !found; i++) {
          const title = await p.ev(`document.querySelector('.tour-tip b, .tour-tip h3, .tour-tip strong')?.textContent||document.querySelector('.tour-tip')?.innerText.split(String.fromCharCode(10))[1]||''`);
          if (title.trim() === r.help) found = true;
          else if (!await p.ev(`(()=>{const b=[...document.querySelectorAll('.tour-tip button')].find(b=>/avanti/i.test(b.textContent));if(!b)return false;b.click();return true})()`)) break;
          await sleep(150);
        }
        await p.ev(`[...document.querySelectorAll('.tour-tip button')].find(b=>/chiudi/i.test(b.textContent))?.click();1`);
        assert.ok(found, `${type}: la visita guidata non mostra "${r.help}"`);
      }
      checked.push(type);
      console.log(`ok     ${type}${VISIBLE_TAPS[type] ? ' (tocco con effetto)' : ''}`);
    }
    assert.deepEqual(p.problems, []);
    console.log(`registro dei widget: ${checked.length} tipi verificati`);
  } finally { p.close(); }
})().catch(e => { console.error('registro dei widget:', e.message); process.exitCode = 1; });
