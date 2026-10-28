# Plancia-next: piano di refactor

Fork di sviluppo della Plancia, estratto dalla cartella `plancia/` del repo
`gaia` con tutta la storia (`git subtree split`, 67 commit fino a
`4a2d663`, 2026-10-28). La Plancia in esercizio resta in `gaia/plancia` e
non viene toccata da qui. Le correzioni che nel frattempo si fanno là si
portano qui con `tools/sync-from-gaia.sh`.

Si passa alla versione nuova solo quando dà vantaggi veri e regge uno show.

## Regole

- **Nessuna riscrittura totale.** Passi piccoli; ogni commit deve lasciare
  l'app funzionante e passare i test e lo smoke test UI.
- **Compatibilità**: stessi protocolli OSC/MQTT, stessa semantica di
  `addr`, `oscChannel`, `value`, `mode`, `midi`; layout JSON e progetti
  salvati devono caricarsi identici; catena delle migrazioni `uiRev`
  invariata (oggi fino a 7).
- **Niente framework e niente compilatore.** Il bundle resta servito dal
  bridge senza dipendenze (funziona offline in club). Se servono i tipi:
  JSDoc + `// @ts-check`, non TypeScript.
- **Prova accanto alla Plancia vera**: `run_dev.bat` (porta 8092, feedback
  OSC 9010, dati in `data/`, OSC verso nessuno, timeline video/laser
  verso device inesistenti). Il broker MQTT invece e' quello vero: i comandi
  MQTT dei widget arrivano davvero. Per una prova isolata: `?broker=0.0.0.0`.

## Stato di partenza (misurato, non presunto)

33 moduli in `src/`, concatenati da `build-app.js` in un'unica IIFE
(scope condiviso), piu' lato bridge `bridge.js`, `video-timeline.js`,
`laser-timeline.js`, `fixture-lib.js`, `stage-ai.js`.

Problemi concreti visti lavorandoci:

1. **Switch sul tipo di widget sparsi**: un widget nuovo (es. `laser`) tocca
   `00-core-state` (DEF, NAMES), `40-widget-rendering` (build, noVal, addr),
   `41-widget-interactions`, `80-animation-loop`, `95-help-tour`,
   `20-layout-and-templates`, `index.html`.
2. **Ordine di avvio implicito**: il primo `render()` parte dalla coda di
   `90-settings-and-bootstrap.js`, prima che i moduli successivi siano
   valutati. Le funzioni usate dal primo render vanno scritte come
   `function` (hoisting); un `const`/`let` lassu' da' errore. Trappola
   fragile.
3. **I/O che decide il comportamento**: la pagina senza MQTT chiedeva da
   sola l'uscita OSC a DMX Master, e il cambio di trasporto svuotava lo
   stato reale (bug delle teste "che si resettano", 2026-10-28).
4. **Messaggi in arrivo**: ogni OSC scorre tutti i widget di tutte le pagine
   (`applyWidgets`); il loop ridisegna su `G.dirty` o ogni secondo.
5. **Doppia verita' reale/simulato**: simulazione locale `SH` e uscita reale
   di DMX Master (`DMX_OUTPUT`, MQTT o riserva OSC) si mescolano nel Render
   caso per caso. E' l'area piu' soggetta a bug.

## Passi

0. **Rete di sicurezza** (prima di toccare l'architettura)
   - FATTO: `npm run smoke` (`test/ui-smoke.js`): bridge di prova su porta
     libera con copia dei dati, browser headless in simulazione, ogni pagina
     aperta, eccezioni ed errori di console raccolti, uno screenshot per
     pagina in `test-output/smoke/` (+ `report.json`). Prima del refactor:
     13 pagine, 0 problemi. Verificato che intercetta un errore inserito;
   - FATTO: `npm run characterize` (`test/characterize.js`): build di test
     con `window.__planciaTest` (opzione `testHooks` di `build-app.js`, assente
     nel bundle dei tablet) e confronto con `test/snapshots/characterization.json`:
     `argsOf` di tutti i 19 tipi di widget a valori scelti, messaggi davvero
     spediti al bridge (OSC con canale, MIDI CC), pagine dei 12 template,
     un layout di vecchio formato lungo tutta la catena `uiRev` (0 -> 7),
     layout dei dati veri identico dopo un ricaricamento. Deterministico;
     verificato che un pulsante invertito da' 4 differenze puntuali.
     Un cambio voluto si registra con `npm run characterize -- --update`.
   - `npm run check` = test unitari + caratterizzazione + smoke: da lanciare
     prima di ogni commit del refactor.
1. **Avvio esplicito**: `init()` chiamato in fondo al bundle; nessun
   effetto collaterale durante la valutazione dei moduli.
2. **Registro dei widget**: per tipo `{defaults, label, build, paint,
   onPointer, tick, help}`. Pilota su `laser`, `audiorigs`, `fixgrid`; poi
   un tipo per commit. Alla fine spariscono gli switch.
3. **Bus dei messaggi**: OSC e MQTT in arrivo indicizzati per indirizzo e
   topic; i widget si iscrivono a cio' che ascoltano.
4. **Involucro su `L`** (il layout condiviso resta la fonte di verita',
   sincronizzato a revisioni col bridge): notifica dei cambi e insieme dei
   widget da ridisegnare; il loop disegna solo quelli.
5. **Stato effettivo reale/simulato**: un solo selettore per fixture
   ("reale se fresco, altrimenti simulato"), usato da Render e widget, con
   test.
6. Solo se serve ancora: ES modules per cartella (`state/`, `widgets/`,
   `stage/`, `io/`, `engine/`, `gaia/`, `ui/`), con la build che li unisce.

## Uscita

Per tornare in `gaia`: quando un passo e' stabile e provato dal vivo con
`run_dev.bat`, si riporta in `gaia/plancia` (stesso albero di file) con un
commit normale, e si prova sulla Plancia in esercizio fuori dagli show.
