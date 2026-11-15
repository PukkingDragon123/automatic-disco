// Styles for the stores: sheets of drafting paper pinned over the world, held by a few inked strokes and a strip of
// tape (ui/crates/ink.ts paints them to size), each the stage for a live 3D diorama (ui/crates/vignette.ts). Sort is
// a row of paper tabs, filter a row of rubber stamps, priority a row of pins. Text is Departure Mono ('Body') at 22 px
// (11 px on small screens) and Spleen ('Title') at 24 px, in ink; never resampled. No screens, no phosphor.
let done = false;
export function injectCrateCSS() {
  if (done) return;
  done = true;
  const st = document.createElement('style');
  st.id = 'crate-css';
  st.textContent = CSS;
  document.head.appendChild(st);
  const r = document.documentElement.style;
  const set = () => { const big = innerHeight >= 1000; r.setProperty('--ik', big ? '2' : '1'); r.setProperty('--fb', big ? '22px' : '11px'); };
  set(); addEventListener('resize', set);
}
const INK = '#1e232c', INK2 = '#726955', RED = '#b13c2b', PAPER = '#d6cab0';
const CSS = `
:root { --ik: 2; --fb: 22px; --ft: 24px; --crate-bottom: 16px; }
.inv-win, .crate-hud, .inv-coach, .inv-tip, .inv-plinth, .inv-tags { font-family: 'Body', monospace; font-size: var(--fb); line-height: var(--fb); color: ${INK}; -webkit-font-smoothing: none; }
.inv-win button, .crate-hud button, .inv-coach button, .inv-win input, .inv-set input { font-family: 'Body', monospace; font-size: var(--fb); line-height: var(--fb); color: inherit; }
.inv-t { font-family: 'Title', monospace; font-size: var(--ft); line-height: var(--ft); font-weight: normal; }
.inv-win, .crate-hud, .inv-coach, .inv-tip, .inv-plinth, .inv-set { background-repeat: no-repeat; background-size: 100% 100%; image-rendering: pixelated; }
.inv-vig { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 42; pointer-events: none; image-rendering: pixelated; }
.inv-win .r, .inv-tip .r, .inv-plinth .r { color: ${RED}; }
.inv-win .g, .inv-tip .g, .inv-plinth .g, .inv-coach .g { color: ${INK2}; }
.inv-tip .w, .inv-plinth .w { color: #8c2920; }

/* ---------------- the sheet ---------------- */
.inv-win { position: fixed; z-index: 39; box-sizing: border-box; width: calc(366px * var(--ik)); padding: calc(10px * var(--ik)) calc(12px * var(--ik)) calc(10px * var(--ik)); user-select: none; filter: drop-shadow(0 calc(5px * var(--ik)) 0 rgba(10,12,8,.35)); }
.inv-win.pop { animation: inv-pop 260ms steps(6) both; }
@keyframes inv-pop { 0% { opacity: 0; transform: translateY(calc(10px * var(--ik))); } 100% { opacity: 1; transform: none; } }
.inv-bar.srt { position: absolute; left: calc(26px * var(--ik)); top: calc(-13px * var(--ik)); display: flex; gap: calc(2px * var(--ik)); padding: 0; }
.inv-tab { border: 0; cursor: pointer; padding: calc(2px * var(--ik)) calc(5px * var(--ik)) calc(4px * var(--ik)); background: ${PAPER}; color: ${INK2};
  box-shadow: inset 0 calc(-2px * var(--ik)) 0 rgba(0,0,0,.12), inset calc(1px * var(--ik)) calc(1px * var(--ik)) 0 ${INK}, inset calc(-1px * var(--ik)) 0 0 ${INK}; }
.inv-tab:hover { color: ${INK}; }
.inv-tab.act { color: ${RED}; background: #e5dbc3; margin-top: calc(-2px * var(--ik)); padding-bottom: calc(6px * var(--ik)); }
.inv-head { display: flex; align-items: center; gap: calc(5px * var(--ik)); height: calc(26px * var(--ik)); padding: calc(2px * var(--ik)) calc(4px * var(--ik)) 0; cursor: grab; }
.inv-head canvas.plate { width: calc(24px * var(--ik)); height: calc(24px * var(--ik)); flex: none; image-rendering: pixelated; }
.inv-title { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.inv-title .lab { white-space: nowrap; overflow: hidden; }
.inv-title .kind { color: ${INK2}; white-space: nowrap; overflow: hidden; }
.inv-pri { display: flex; gap: calc(1px * var(--ik)); align-items: center; }
.inv-pri img, .inv-pins img { width: calc(12px * var(--ik)); height: calc(12px * var(--ik)); image-rendering: pixelated; }
.inv-ink { border: 0; background: none; cursor: pointer; color: ${INK}; padding: calc(2px * var(--ik)); display: inline-flex; align-items: center; gap: calc(2px * var(--ik)); }
.inv-ink svg { width: calc(12px * var(--ik)); height: calc(12px * var(--ik)); }
.inv-ink:hover, .inv-ink.act { color: ${RED}; }
.inv-ink.w { text-decoration: underline; text-decoration-thickness: calc(1px * var(--ik)); text-underline-offset: calc(2px * var(--ik)); }

.inv-bar { display: flex; align-items: center; gap: calc(3px * var(--ik)); padding: calc(2px * var(--ik)) calc(4px * var(--ik)) 0; flex-wrap: wrap; }
.inv-search { flex: 1; display: flex; align-items: center; gap: calc(3px * var(--ik)); height: calc(16px * var(--ik)); border-bottom: calc(1px * var(--ik)) dashed ${INK2}; }
.inv-search .pencil svg { width: calc(10px * var(--ik)); height: calc(10px * var(--ik)); color: ${INK2}; display: block; }
.inv-search input { flex: 1; background: transparent; border: 0; outline: 0; color: ${INK}; padding: 0; caret-color: ${RED}; }
.inv-search input::placeholder { color: #a99c84; }
.inv-stamp { position: relative; border: 0; cursor: pointer; width: calc(22px * var(--ik)); height: calc(22px * var(--ik)); background: none no-repeat center / 100% 100%; display: flex; align-items: center; justify-content: center; padding: 0; margin-right: calc(12px * var(--ik)); image-rendering: pixelated; }
.inv-stamp img { width: calc(16px * var(--ik)); height: calc(16px * var(--ik)); image-rendering: pixelated; opacity: .6; }
.inv-stamp.on img { opacity: 1; }
.inv-stamp:hover img { opacity: .9; }
.inv-stamp .all { color: ${INK2}; }
.inv-stamp.on .all { color: ${RED}; }
.inv-stamp .n { position: absolute; left: calc(20px * var(--ik)); bottom: calc(-2px * var(--ik)); color: ${INK2}; }
.inv-stamp.on .n { color: ${RED}; }

.inv-screen { position: relative; width: calc(340px * var(--ik)); height: calc(196px * var(--ik)); margin: calc(4px * var(--ik)) auto 0; cursor: grab; }
.inv-tags { position: fixed; left: 0; top: 0; z-index: 43; pointer-events: none; }
.inv-ctag { position: absolute; left: 0; top: 0; font-size: 11px; line-height: 11px; padding: 1px 2px;  background: #e5dbc3; color: ${INK}; box-shadow: inset 0 0 0 calc(1px * var(--ik)) ${INK}, calc(1px * var(--ik)) calc(1px * var(--ik)) 0 rgba(0,0,0,.35); margin: -6px 0 0 -2px; }
.inv-ctag.hit { background: #f0dea0; box-shadow: inset 0 0 0 calc(1px * var(--ik)) ${RED}, calc(1px * var(--ik)) calc(1px * var(--ik)) 0 rgba(0,0,0,.35); color: ${RED}; }
.inv-ctag.dim { opacity: .35; }
.inv-ctag.rot { color: ${RED}; }
.inv-ghost { position: fixed; z-index: 60; pointer-events: none; }
.inv-ghost img { image-rendering: pixelated; filter: drop-shadow(calc(3px * var(--ik)) calc(4px * var(--ik)) 0 rgba(0,0,0,.4)); display: block; }
.inv-ghost .cnt { position: absolute; right: 0; bottom: 0; padding: 0 calc(2px * var(--ik)); background: #e5dbc3; color: ${INK}; box-shadow: inset 0 0 0 calc(1px * var(--ik)) ${INK}; }

.inv-foot { display: flex; align-items: center; gap: calc(4px * var(--ik)); padding: calc(4px * var(--ik)) calc(4px * var(--ik)) 0; color: ${INK2}; }
.inv-meter { flex: 1; height: calc(6px * var(--ik)); position: relative; box-shadow: inset 0 0 0 calc(1px * var(--ik)) ${INK}; }
.inv-meter b { position: absolute; left: calc(1px * var(--ik)); top: calc(1px * var(--ik)); bottom: calc(1px * var(--ik)); background: repeating-linear-gradient(-45deg, ${INK} 0 calc(1px * var(--ik)), transparent calc(1px * var(--ik)) calc(3px * var(--ik))); }
.inv-meter.full b { background: repeating-linear-gradient(-45deg, ${RED} 0 calc(1px * var(--ik)), transparent calc(1px * var(--ik)) calc(3px * var(--ik))); }
.inv-note { color: ${RED}; padding: calc(1px * var(--ik)) calc(4px * var(--ik)) 0; min-height: var(--fb); }

/* ---------------- the settings tag ---------------- */
.inv-set { margin-top: calc(4px * var(--ik)); padding: calc(8px * var(--ik)) calc(10px * var(--ik)); display: grid; grid-template-columns: auto 1fr; gap: calc(3px * var(--ik)) calc(6px * var(--ik)); align-items: center; }
.inv-set .k { color: ${INK2}; }
.inv-set input.lbl { color: ${INK}; background: transparent; border: 0; border-bottom: calc(1px * var(--ik)) dashed ${INK2}; outline: 0; height: calc(16px * var(--ik)); padding: 0; text-transform: uppercase; width: calc(110px * var(--ik)); }
.inv-logos, .inv-paints, .inv-picks, .inv-crew, .inv-pins { display: flex; flex-wrap: wrap; gap: calc(1px * var(--ik)); align-items: center; }
.inv-logos button, .inv-paints button, .inv-pins button { width: calc(16px * var(--ik)); height: calc(16px * var(--ik)); padding: 0; border: 0; background: none; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.inv-logos button img { width: calc(12px * var(--ik)); height: calc(12px * var(--ik)); image-rendering: pixelated; opacity: .7; }
.inv-logos button.on img { opacity: 1; }
.inv-logos button.on, .inv-paints button.on { box-shadow: inset 0 0 0 calc(1px * var(--ik)) ${RED}; }
.inv-paints button i { display: block; width: calc(11px * var(--ik)); height: calc(9px * var(--ik)); box-shadow: inset 0 calc(-1px * var(--ik)) 0 rgba(0,0,0,.3); }
.inv-picks { max-height: calc(72px * var(--ik)); overflow-y: auto; scrollbar-width: none; }
.inv-picks button { width: calc(18px * var(--ik)); height: calc(18px * var(--ik)); padding: 0; border: 0; background: transparent; cursor: pointer; position: relative; }
.inv-picks button img { width: calc(16px * var(--ik)); height: calc(16px * var(--ik)); image-rendering: pixelated; }
.inv-picks button.allow { box-shadow: inset 0 0 0 calc(1px * var(--ik)) #2c7240; background: rgba(69,145,85,.18); }
.inv-picks button.deny { box-shadow: inset 0 0 0 calc(1px * var(--ik)) ${RED}; }
.inv-picks button.deny img { opacity: .35; }
.inv-picks button.deny::after { content: ''; position: absolute; left: 10%; right: 10%; top: 46%; height: calc(1px * var(--ik)); background: ${RED}; transform: rotate(-35deg); }
.inv-crew .w { color: ${INK}; }
.inv-crew .w b { color: ${RED}; cursor: pointer; }
.inv-set .hint, .inv-pins .hint { color: ${INK2}; margin-left: calc(3px * var(--ik)); }
.inv-set u { cursor: pointer; color: ${RED}; }

/* ---------------- notes and the item plinth ---------------- */
.inv-tip { position: fixed; z-index: 70; pointer-events: none; width: max-content; max-width: calc(170px * var(--ik)); box-sizing: border-box; padding: calc(7px * var(--ik)) calc(9px * var(--ik)); display: none; }
.inv-tip h4, .inv-plinth h4 { margin: 0; color: ${INK}; font-weight: normal; }
.inv-tip .row { display: flex; justify-content: space-between; gap: calc(6px * var(--ik)); }
.inv-tip img { vertical-align: top; image-rendering: pixelated; }
.inv-plinth { position: fixed; z-index: 70; pointer-events: none; width: calc(190px * var(--ik)); height: calc(120px * var(--ik)); display: none; }
.inv-plinth .stage { position: absolute; left: calc(6px * var(--ik)); top: calc(8px * var(--ik)); width: calc(84px * var(--ik)); height: calc(104px * var(--ik)); }
.inv-plinth .lead { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; z-index: 44; }
.inv-plinth .calls { position: absolute; left: calc(98px * var(--ik)); right: calc(8px * var(--ik)); top: calc(10px * var(--ik)); bottom: calc(8px * var(--ik)); display: flex; flex-direction: column; justify-content: space-between; }
.inv-plinth .calls b { color: ${RED}; font-weight: normal; }

/* ---------------- the crate HUD ---------------- */
.crate-hud { position: fixed; left: 16px; bottom: var(--crate-bottom); z-index: 30; box-sizing: border-box; user-select: none; filter: drop-shadow(0 calc(4px * var(--ik)) 0 rgba(10,12,8,.35)); }
.crate-hud .bed { position: absolute; overflow: hidden; }
.crate-hud canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; image-rendering: pixelated; cursor: pointer; }
.crate-hud .labels { position: absolute; left: 0; right: 0; bottom: 0; display: flex; pointer-events: none; z-index: 2; }
.crate-hud .labels > div { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: calc(1px * var(--ik)); }
.crate-hud .labels .nm { color: ${INK}; white-space: nowrap; overflow: hidden; max-width: 96%; }
.crate-hud .labels .g { width: 64%; height: calc(4px * var(--ik)); box-shadow: inset 0 0 0 calc(1px * var(--ik)) ${INK}; position: relative; }
.crate-hud .labels .g b { position: absolute; left: 0; top: 0; bottom: 0; background: repeating-linear-gradient(-45deg, ${INK} 0 calc(1px * var(--ik)), transparent calc(1px * var(--ik)) calc(3px * var(--ik))); }
.crate-hud .labels .full .g b { background: repeating-linear-gradient(-45deg, ${RED} 0 calc(1px * var(--ik)), transparent calc(1px * var(--ik)) calc(3px * var(--ik))); }
.crate-hud .row { position: absolute; display: flex; align-items: center; gap: calc(3px * var(--ik)); }
.crate-hud .row .t { color: ${INK2}; flex: 1; white-space: nowrap; }
.crate-hud .dots { display: flex; gap: calc(1px * var(--ik)); }
.crate-hud .dots img { width: calc(12px * var(--ik)); height: calc(12px * var(--ik)); cursor: pointer; image-rendering: pixelated; }
.crate-hud .inv-ink.dis { opacity: .3; pointer-events: none; }
.crate-hud .hov { position: absolute; z-index: 3; pointer-events: none; border: calc(1px * var(--ik)) dashed ${RED}; display: none; }
.crate-hud.flash { animation: crate-flash 600ms steps(6); }
@keyframes crate-flash { 0% { transform: translateY(calc(-4px * var(--ik))); } 100% { transform: none; } }

/* ---------------- the coached tutorial ---------------- */
.inv-coach-dim { position: fixed; z-index: 80; background: rgba(12, 14, 10, .55); pointer-events: none; }
.inv-coach-ring { position: fixed; z-index: 81; pointer-events: none; box-sizing: border-box; border: calc(2px * var(--ik)) dashed ${RED}; animation: coach-pulse 1.2s steps(2) infinite; }
@keyframes coach-pulse { 50% { border-color: #e7a092; } }
.inv-coach { position: fixed; z-index: 82; box-sizing: border-box; width: calc(200px * var(--ik)); padding: calc(10px * var(--ik)) calc(11px * var(--ik)) calc(9px * var(--ik)); filter: drop-shadow(0 calc(5px * var(--ik)) 0 rgba(10,12,8,.35)); }
.inv-coach .scr2 { padding: 0; }
.inv-coach h3 { margin: 0 0 calc(3px * var(--ik)); color: ${RED}; font-weight: normal; }
.inv-coach p { margin: 0; }
.inv-coach p kbd { font-family: 'Body', monospace; font-size: var(--fb); color: ${RED}; }
.inv-coach .ft { display: flex; align-items: center; gap: calc(3px * var(--ik)); margin-top: calc(5px * var(--ik)); }
.inv-coach .ft .steps { flex: 1; display: flex; gap: calc(1px * var(--ik)); }
.inv-coach .ft .steps img { width: calc(12px * var(--ik)); height: calc(12px * var(--ik)); image-rendering: pixelated; }
@media (prefers-reduced-motion: reduce) { .inv-win.pop, .crate-hud.flash, .inv-coach-ring { animation: none; } }
`;
