/* ---------- registro dei tipi di widget ---------- */
// Ogni tipo dichiara in un posto solo quello che prima era sparso negli switch
// di 00 (DEF, NAMES), 40 (interno, valore, indirizzo), 41 (tocco), 80 (loop) e
// 95 (aiuto). I tipi non ancora registrati passano ancora dagli switch: il
// refactor procede un tipo alla volta (REFACTOR.md, passo 2).
//
//   registerWidget('laser',{
//     size:[8,6], label:'Laser',            // dimensioni di default e nome nel menu
//     showsValue:false, showsAddr:false,    // valore e indirizzo OSC sotto l'etichetta
//     inner:w=>html,                        // contenuto del widget
//     onPointer:(e,el,w)=>…,                // tocco fuori da "Modifica griglia"
//     tick:(el,w,{repaint,now})=>…,         // a ogni fotogramma; repaint = dati cambiati o 1 s
//     help:w=>[titolo,testo]});             // passo della visita guidata "?"
//
// La registrazione avviene quando il modulo del widget viene valutato: tutto
// cio' che la usa gira dopo init() (src/999-start.js).
const WIDGET_TYPES=new Map();
function registerWidget(type,spec){
  WIDGET_TYPES.set(type,{showsValue:true,showsAddr:true,...spec,type});
  if(spec.size)DEF[type]=spec.size;
  if(spec.label)NAMES[type]=spec.label;
}
function widgetType(type){return WIDGET_TYPES.get(type)||null}
