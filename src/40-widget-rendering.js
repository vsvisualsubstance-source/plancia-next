/* ---------- disegno widget ---------- */
const ICON={play:'<svg viewBox="0 0 12 12"><path d="M2.5 1.5v9l8-4.5z"/></svg>',pause:'<svg viewBox="0 0 12 12"><path d="M2 1.5h3v9H2zM7 1.5h3v9H7z"/></svg>',
  stop:'<svg viewBox="0 0 12 12"><path d="M2 2h8v8H2z"/></svg>',start:'<svg viewBox="0 0 12 12"><path d="M1.5 1.5h2v9h-2zM11 1.5v9L4 6z"/></svg>',
  loop:'<svg viewBox="0 0 12 12"><path d="M3 4h5.5L7 2.5 8 1.5 11.2 4.7 8 8 7 7l1.5-1.5H3a.5.5 0 0 0-.5.5v1H1V6a2 2 0 0 1 2-2zM9.5 6.5H11V7a2 2 0 0 1-2 2H4.5L6 10.5 5 11.5 1.8 8.3 5 5l1 1-1.5 1.5H9a.5.5 0 0 0 .5-.5z"/></svg>'};
let portraitUnit=48;
function place(el,w){
  if(stage.classList.contains('portrait')){
    el.style.left='0';el.style.top='';el.style.width='100%';
    el.style.height=`${Math.max(120,Math.round(w.h*portraitUnit))}px`;
  }else{
    el.style.left=w.x/COLS*100+'%'; el.style.top=w.y/ROWS*100+'%';
    el.style.width=w.w/COLS*100+'%'; el.style.height=w.h/ROWS*100+'%';
  }
  el.classList.toggle('hz',w.w>w.h);
}
function inner(w){
  const t=widgetType(w.type);if(t?.inner)return t.inner(w);
  switch(w.type){
    case 'scenes':{
      if(w.mode==='dmx-enum')return '<div class="sc"></div>';
      if(w.mode==='head-presets')return `<div class="hp">${(w.headPresets||[]).map((p,i)=>`<button data-head-preset="${i}" title="${esc(p.name)}">${esc(p.name)}</button>`).join('')}<button data-act="manage-presets">＋ Gestisci</button></div>`;
      // /dmx/scene con DMX Master: le scene vere di TD (catalogo), senza i
      // colori dei LOOKS locali, che con TD non corrispondono a niente
      const td=w.addr==='/dmx/scene'&&(!w.mode||w.mode==='push')?tdScenes():[];
      const it=td.length?td.map(s=>s.label||s.id):items(w),manage=w.addr==='/dmx/scene'&&(!w.mode||w.mode==='push')&&Array.isArray(tdParams().show_scene_catalog),c=colsOf(w,it.length+(manage?1:0)),lk=w.addr==='/dmx/scene'&&!td.length;
      if(w.mode==='head-select'&&!it.length)return '<div class="dv-empty">In attesa delle teste mobili pubblicate da DMX Master.</div>';
      // scene di TD: striscia con le palette salvate nella scena (front |
      // back, preview della nota TD 37), barretta col primo colore front
      return `<div class="sc" style="grid-template-columns:repeat(${c},minmax(0,1fr))">${it.map((n,i)=>{const look=td.length?tdSceneLook(td[i]):null,ic=look?look.ic:lk&&LOOKS[i]?lookHex(i):'';
        return `<div class="si" data-i="${i}" title="${esc(n)}"${ic?` style="--ic:${ic}"`:''}><span class="no">${String(i+1).padStart(2,'0')}</span><span class="nm">${esc(n)}</span><i class="chip"></i><i class="prog"></i>${look?.grad?`<i class="pal" style="background:${look.grad}"></i>`:''}</div>`}).join('')}${manage?'<div class="si si-manage" data-act="manage-scenes" title="Crea, ricattura, rinomina ed elimina le scene di DMX Master"><span class="nm">＋ Scene…</span></div>':''}</div>${lk?'<span class="simtag" title="DMX Master non collegato: look locali della Plancia, solo simulazione">SIMULAZIONE</span>':''}`}
    case 'timeline':{const cues=timelineCues(w),D=timelineDuration(w),controlled=isShowTimeline(w)&&showClock.authority;
      const sample=controlled?showClockSample():null,available=!!sample&&showClockFresh(sample),locked=controlled&&!available;
      const step=[5,10,15,30,60,120,300].find(s=>D/s<=12)||600; let ticks='';
      for(let t=0;t<D;t+=step)ticks+=`<span style="left:${t/D*100}%">${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}</span>`;
      const blocks=cues.map((c,i)=>{const e=(cues[i+1]?.t??D);const col=c.sceneId?tdSceneLook(tdScenes().find(s=>s.id===c.sceneId)).ic||w.color:c.scene!=null&&LOOKS[c.scene]?lookHex(c.scene):w.color;
        const target=[c.sceneId?c.sceneId:c.scene!=null?'SC '+(c.scene+1):'',c.params?.length?'DMX '+c.params.length:''].filter(Boolean).join(' · ');
        return `<div class="tl-blk" data-k="${i}" style="left:${c.t/D*100}%;width:${(e-c.t)/D*100}%;--ic:${col}"><span><i>${i+1}</i>${esc(c.name)}</span><em>${target}</em></div>`}).join('');
      return `<div class="tl${isShowTimeline(w)?' tl-tracks':''}" data-duration="${D}"><div class="tl-head"><span class="tl-name">${esc(w.label)}</span>
        <div class="tl-tr"><button data-act="start" aria-label="Inizio"${locked?' disabled':''}>${ICON.start}</button><button data-act="play" aria-label="Play/pausa"${locked?' disabled':''}>${ICON.play}</button><button data-act="stop" aria-label="Stop"${locked?' disabled':''}>${ICON.stop}</button><button data-act="loop" aria-label="Loop"${controlled?' disabled':''}>${ICON.loop}</button>${w.readonly?'':'<button data-act="edit-cues" aria-label="Modifica cue">CUE</button>'}</div>
        ${isShowTimeline(w)?`<button class="tl-live" data-act="live"${w.readonly?' disabled':''} title="${w.readonly?'Modalità di DMX Master: si cambia nella pagina Timeline':'LIVE: comandi tu dal tablet (per comporre e catturare le scene). TIMELINE: comanda la timeline dello show'}">—</button>`:''}<span class="tl-tc">00:00:00:00</span><span class="tl-cue"><span class="k">CUE</span><b>—</b></span><span class="tl-next"></span><span class="tl-bpm">${controlled?`TD · ${available?sample.source.toUpperCase():'OFFLINE · FERMO'}`:`${isShowTimeline(w)?'SIMULAZIONE · ':''}${w.bpm||120} BPM`} · ${Math.floor(D/60)}:${String(Math.round(D%60)).padStart(2,'0')}</span></div>
        ${isShowTimeline(w)?'<div class="tl-trk tl-trk-main"><div class="tl-vhead"><span class="k">LUCI</span></div>':''}<div class="tl-lane"><div class="tl-ruler">${ticks}</div><div class="tl-cues">${blocks}</div><div class="tl-ph"></div></div>${isShowTimeline(w)?'</div>'+videoLaneHtml(w,D)+laserLaneHtml(w,D):''}</div>`}
    default: return gInner(w);
  }
}
const noVal=new Set(['scenes','timeline']);
const showVal=w=>{const t=widgetType(w.type);if(t)return typeof t.showsValue==='function'?t.showsValue(w):t.showsValue;return!noVal.has(w.type)};
function build(w){
  const el=document.createElement('div');
  el.className='w t-'+w.type+(selId===w.id?' sel':''); el.dataset.id=w.id;
  el.style.setProperty('--c',w.color);
  const t=widgetType(w.type),addr=(t&&!t.showsAddr)||(w.type==='scenes'&&w.mode==='dmx-enum')?'':(w.addr||'nessun indirizzo');
  el.innerHTML=`<div class="box">${inner(w)}<span class="lab">${esc(w.label)}</span><span class="addr">${esc(addr)}</span>${showVal(w)?'<span class="val"></span>':''}</div><span class="rs"></span>`;
  place(el,w); paint(el,w); bind(el,w);
  if(t?.mounted)t.mounted(el,w);
  return el;
}
function paint(el,w){
  if(!el) return;
  const val=el.querySelector('.val'),t=widgetType(w.type);
  if(t){t.paint?.(el,w);if(val)val.textContent=t.valueText?t.valueText(w):fmt(out(w,w.value));return}
  const v=w.value;
  if(w.type==='scenes'){
    if(w.mode==='dmx-enum')paintTdEnum(el,w);
    else el.querySelectorAll('.si').forEach((n,i)=>n.classList.toggle('on',w.mode==='multi'||w.mode==='head-select'?!!(Array.isArray(v)&&+v[i]):v===i));
  }
  if(val) val.textContent=fmt(out(w,v));
}
const elOf=id=>stage.querySelector(`[data-id="${id}"]`);
function renderStage(){
  const portrait=!editing&&window.matchMedia('(max-width:760px) and (orientation:portrait)').matches;
  stage.classList.toggle('portrait',portrait);
  if(portrait)portraitUnit=clamp(stage.clientHeight/ROWS,44,56);
  const widgets=page().widgets;
  const ordered=portrait?[...widgets].sort((a,b)=>a.y-b.y||a.x-b.x):widgets;
  stage.replaceChildren(...ordered.map(build));
}
window.addEventListener('resize',()=>{
  const portrait=!editing&&window.matchMedia('(max-width:760px) and (orientation:portrait)').matches;
  if(portrait!==stage.classList.contains('portrait'))renderStage();
});
function refresh(w){const o=elOf(w.id); if(o) o.replaceWith(build(w))}
function renderTabs(){
  const t=$('#tabs'); t.innerHTML='';
  L.pages.forEach((p,i)=>{const b=document.createElement('button');b.className='tab';b.textContent=p.name;b.setAttribute('aria-current',i===pi);
    b.onclick=()=>{pi=i;selId=null;render()};t.appendChild(b)});
  if(editing){const b=document.createElement('button');b.className='tab add';b.textContent='+';b.title='Nuova pagina';b.onclick=addPage;t.appendChild(b)}
}
function render(){document.body.classList.toggle('editing',editing);$('#addbar').hidden=!editing;
  $('#editBtn').textContent=editing?'Fine griglia':'Modifica griglia';
  $('#editBtn').title=editing?'Termina la modifica della griglia dei widget. Le fixture del palco si modificano direttamente nella Pianta.':'Modifica solo la griglia dei widget; per spostare o aggiungere luci usa direttamente la Pianta.';
  $('#editBtn').classList.toggle('primary',editing);
  renderTabs();renderStage();renderInsp();syncHeadSelectors()}

/* ---------- invio OSC ---------- */
// argomenti OSC: quelli dichiarati dal tipo (registro), altrimenti il valore nel suo range
function argsOf(w){
  const t=widgetType(w.type);if(t?.args)return t.args(w);
  switch(w.type){
    case 'scenes':
      if(w.mode==='head-select'&&w.addr==='/mh/select/heads')return (w.headValues||[]).filter((_,i)=>!!w.value?.[i]);
      return w.mode==='multi'?(w.value||[]).map(x=>+x?1:0):[w.value];
    default: return [out(w,w.value)];
  }
}
const queue=new Map(); let raf=0;
function send(w){if(!w.addr)return; queue.set(w.id,w); if(!raf) raf=requestAnimationFrame(flush)}
function flush(){raf=0; for(const w of queue.values()){
  const m={type:'osc',address:w.addr,args:argsOf(w),channel:w.oscChannel||'default'};
  emit(m); applyWidgets(m,w.id);
  if(w.midi&&w.midi.cc!==''&&w.midi.cc!=null) emit({type:'midi',ch:+w.midi.ch||1,cc:+w.midi.cc,value:Math.round((typeof w.value==='number'?w.value:0)*127)},true);
} queue.clear()}
function set(w,v){if(w.value===v)return; w.value=v; paint(elOf(w.id),w); send(w)}
function setXY(w,x,y){w.value=x;w.valueY=y;paint(elOf(w.id),w);send(w)}
function fire(address,args,channel){const m={type:'osc',address,args,channel:channel||'default'};emit(m);applyWidgets(m,null)}
function bus(a,args,src){model(a,args);timelineBus(a,args,src)}
