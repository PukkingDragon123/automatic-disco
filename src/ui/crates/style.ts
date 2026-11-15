// Styles for the grid inventory, the crate HUD and the coached tutorial. Every surface is painted pixel-art hardware
// (ui/crates/hw.ts: enamel panels, phosphor glass with a socket per cell, Bakelite keys, recessed wells) shown at a
// whole-number scale --ik (2 at 1080p). Text is Departure Mono ('Body') at 22 px (11 px on small screens) and Spleen
// ('Title') at 24 px; nothing else, never resampled.
import { keyURL } from './hw';
let done = false;
export function injectCrateCSS() {
  if (done) return;
  done = true;
  const st = document.createElement('style');
  st.id = 'crate-css';
  st.textContent = CSS;
  document.head.appendChild(st);
  const r = document.documentElement.style;
  for (const k of ['n', 'h', 'p', 'a', 'd'] as const) r.setProperty('--ikey-' + k, `url(${keyURL(k)})`);
  const set = () => { const big = innerHeight >= 1000; r.setProperty('--ik', big ? '2' : '1'); r.setProperty('--fb', big ? '22px' : '11px'); };
  set(); addEventListener('resize', set);
}
const CSS = `
:root { --ik: 2; --fb: 22px; --ft: 24px; --crate-bottom: 16px; }
.inv-win, .crate-hud, .inv-coach, .inv-tip { font-family: 'Body', monospace; font-size: var(--fb); line-height: var(--fb); color: var(--cream); image-rendering: pixelated; -webkit-font-smoothing: none; }
.inv-win button, .crate-hud button, .inv-coach button, .inv-win input { font-family: 'Body', monospace; font-size: var(--fb); line-height: var(--fb); color: inherit; }
.inv-t { font-family: 'Title', monospace; font-size: var(--ft); line-height: var(--ft); font-weight: normal; }
.inv-win, .crate-hud, .inv-coach, .inv-tip, .inv-screen, .inv-search, .inv-man, .inv-set, .inv-meter, .crate-hud .bed { background-repeat: no-repeat; }

/* ---------------- the window: a painted panel (set in code to its exact size) ---------------- */
.inv-win { position: fixed; z-index: 40; box-sizing: border-box; padding: calc(8px * var(--ik)) calc(9px * var(--ik)) calc(12px * var(--ik)); background-color: #26281f; user-select: none;
  filter: drop-shadow(0 calc(4px * var(--ik)) 0 rgba(0,0,0,.45)); }
.inv-win.pop { animation: inv-pop 240ms steps(6) both; }
@keyframes inv-pop { 0% { opacity: 0; } 100% { opacity: 1; } }
.inv-head { display: flex; align-items: center; gap: calc(4px * var(--ik)); height: calc(28px * var(--ik)); padding: 0 calc(2px * var(--ik)); cursor: grab; }
.inv-head canvas.plate { width: calc(24px * var(--ik)); height: calc(24px * var(--ik)); flex: none; image-rendering: pixelated; }
.inv-title { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
.inv-title .lab { color: var(--cream); white-space: nowrap; overflow: hidden; text-shadow: 0 calc(1px * var(--ik)) 0 #131410; }
.inv-title .kind { color: var(--stamp); white-space: nowrap; overflow: hidden; text-shadow: 0 calc(1px * var(--ik)) 0 #131410; }
.inv-pri { display: flex; gap: calc(1px * var(--ik)); align-items: center; }
.inv-pri img { width: calc(6px * var(--ik)); height: calc(6px * var(--ik)); }
.inv-key, .inv-chip { border-style: solid; border-width: calc(4px * var(--ik)); border-image: var(--ikey-n) 4 fill / calc(4px * var(--ik)) repeat; background: none; padding: 0 calc(3px * var(--ik));
  min-width: calc(20px * var(--ik)); height: calc(20px * var(--ik)); box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: calc(3px * var(--ik)); cursor: pointer; white-space: nowrap; color: var(--cream); text-shadow: 0 calc(1px * var(--ik)) 0 #120c09; }
.inv-key:hover, .inv-chip:hover { border-image-source: var(--ikey-h); color: #fff8e0; }
.inv-key:active, .inv-chip:active { border-image-source: var(--ikey-p); }
.inv-key.act, .inv-chip.on { border-image-source: var(--ikey-a); color: #ecd29a; text-shadow: 0 calc(1px * var(--ik)) 0 #1a1207; }
.inv-key.dis { border-image-source: var(--ikey-d); color: #6a665c; pointer-events: none; }
.inv-key svg { width: calc(8px * var(--ik)); height: calc(8px * var(--ik)); pointer-events: none; }
.inv-key.sq { padding: 0; width: calc(20px * var(--ik)); }
.inv-chip { color: var(--stamp); }
.inv-chip .n { color: var(--dim); }
.inv-chip.on .n { color: #d9a43a; }

.inv-bar { display: flex; align-items: center; gap: calc(2px * var(--ik)); padding: calc(2px * var(--ik)) calc(2px * var(--ik)) 0; flex-wrap: wrap; }
.inv-bar .k { color: var(--stamp); margin: 0 calc(2px * var(--ik)); text-shadow: 0 calc(1px * var(--ik)) 0 #131410; }
.inv-search { flex: 1; min-width: calc(80px * var(--ik)); height: calc(20px * var(--ik)); box-sizing: border-box; display: flex; align-items: center; padding: 0 calc(5px * var(--ik)); }
.inv-search input { width: 100%; background: transparent; border: 0; outline: 0; color: var(--hot); padding: 0; text-shadow: var(--phos-glow); caret-color: var(--glow); }
.inv-search input::placeholder { color: var(--dim); }

.inv-body { display: flex; align-items: flex-start; gap: calc(3px * var(--ik)); padding: calc(3px * var(--ik)) calc(2px * var(--ik)) 0; }
.inv-screen { position: relative; flex: none; }
.inv-grid { position: absolute; }
.inv-stack { position: absolute; box-sizing: border-box; cursor: grab; z-index: 2; }
.inv-stack:hover { box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--hot); }
.inv-stack img { position: absolute; left: 50%; top: 50%; pointer-events: none; image-rendering: pixelated; }
.inv-stack .cnt, .inv-ghost .cnt { position: absolute; right: calc(2px * var(--ik)); bottom: calc(1px * var(--ik)); color: var(--hot); pointer-events: none;
  text-shadow: calc(1px * var(--ik)) 0 0 #060908, calc(-1px * var(--ik)) 0 0 #060908, 0 calc(1px * var(--ik)) 0 #060908, 0 calc(-1px * var(--ik)) 0 #060908; }
.inv-stack .fr { position: absolute; left: calc(3px * var(--ik)); right: calc(3px * var(--ik)); top: calc(2px * var(--ik)); height: calc(1px * var(--ik)); background: #14261b; pointer-events: none; }
.inv-stack .fr b, .inv-man .mf b { display: block; height: 100%; background: var(--glow); }
.inv-stack .fr.warn b, .inv-man .mf.warn b { background: var(--amber); }
.inv-stack .fr.bad b, .inv-man .mf.bad b { background: var(--warn); }
.inv-stack .fr.keep b, .inv-man .mf.keep b { background: #6f99c5; }
.inv-stack.dim { opacity: .2; }
.inv-stack.hit { box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--amber); }
.inv-stack.lift { opacity: .3; }
.inv-ghost { position: fixed; z-index: 60; pointer-events: none; box-sizing: border-box; box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--hot); }
.inv-ghost img { position: absolute; left: 50%; top: 50%; image-rendering: pixelated; filter: drop-shadow(calc(2px * var(--ik)) calc(2px * var(--ik)) 0 rgba(0,0,0,.6)); }
.inv-drop { position: absolute; z-index: 3; pointer-events: none; box-sizing: border-box; border: calc(1px * var(--ik)) dashed var(--glow); background: rgba(127, 184, 138, .16); }
.inv-drop.bad { border-color: var(--warn); background: rgba(204, 98, 82, .18); }
.inv-drop.merge { border-color: var(--amber); background: rgba(217, 164, 58, .18); }

.inv-man { flex: none; box-sizing: border-box; padding: calc(4px * var(--ik)) calc(4px * var(--ik)); display: flex; flex-direction: column; }
.inv-man .mh { color: var(--dim); padding: 0 calc(1px * var(--ik)) calc(2px * var(--ik)); text-shadow: var(--phos-glow); }
.inv-man .ml { flex: 1; overflow-y: auto; overflow-x: hidden; scrollbar-width: none; }
.inv-man .mrow { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0 calc(2px * var(--ik)); padding: 0 calc(1px * var(--ik)); height: calc(17px * var(--ik)); color: var(--ink); cursor: pointer; position: relative; text-shadow: var(--phos-glow); }
.inv-man .mrow:hover { background: rgba(51, 98, 64, .45); color: var(--hot); }
.inv-man .mrow img { image-rendering: pixelated; width: calc(16px * var(--ik)); height: calc(16px * var(--ik)); }
.inv-man .mrow .nm { white-space: nowrap; overflow: hidden; min-width: 0; }
.inv-man .mrow .n { color: var(--hot); }
.inv-man .mf { position: absolute; left: calc(18px * var(--ik)); right: calc(1px * var(--ik)); bottom: 0; height: calc(1px * var(--ik)); background: #14261b; }
.inv-man .mrow.empty { color: var(--dim); cursor: default; }

.inv-foot { display: flex; align-items: center; gap: calc(4px * var(--ik)); padding: calc(3px * var(--ik)) calc(3px * var(--ik)) 0; color: var(--stamp); text-shadow: 0 calc(1px * var(--ik)) 0 #131410; }
.inv-meter { flex: 1; height: calc(7px * var(--ik)); position: relative; background-color: #0a110d; box-shadow: inset 0 0 0 calc(1px * var(--ik)) #16181a, inset 0 calc(1px * var(--ik)) 0 calc(1px * var(--ik)) #060908; }
.inv-meter b { position: absolute; left: calc(2px * var(--ik)); top: calc(2px * var(--ik)); bottom: calc(2px * var(--ik)); background: repeating-linear-gradient(90deg, var(--glow) 0 calc(3px * var(--ik)), #14261b calc(3px * var(--ik)) calc(4px * var(--ik))); }
.inv-meter.full b { background: repeating-linear-gradient(90deg, var(--amber) 0 calc(3px * var(--ik)), #31220e calc(3px * var(--ik)) calc(4px * var(--ik))); }
.inv-note { color: var(--amber); padding: calc(1px * var(--ik)) calc(3px * var(--ik)) 0; min-height: var(--fb); }

/* ---------------- settings drawer ---------------- */
.inv-set { margin-top: calc(3px * var(--ik)); padding: calc(5px * var(--ik)) calc(6px * var(--ik)); display: grid; grid-template-columns: auto 1fr; gap: calc(3px * var(--ik)) calc(5px * var(--ik)); align-items: center; }
.inv-set .k { color: var(--dim); text-shadow: var(--phos-glow); }
.inv-set input.lbl { color: var(--hot); background: rgba(0,0,0,.35); border: 0; outline: 0; height: calc(18px * var(--ik)); padding: 0 calc(3px * var(--ik)); text-transform: uppercase; width: calc(120px * var(--ik)); text-shadow: var(--phos-glow); box-shadow: inset 0 0 0 calc(1px * var(--ik)) #1b3525; }
.inv-logos, .inv-paints, .inv-picks, .inv-crew { display: flex; flex-wrap: wrap; gap: calc(1px * var(--ik)); align-items: center; }
.inv-logos button, .inv-paints button { width: calc(16px * var(--ik)); height: calc(16px * var(--ik)); padding: 0; border-style: solid; border-width: calc(2px * var(--ik)); border-image: var(--ikey-n) 4 fill / calc(2px * var(--ik)) repeat; background: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.inv-logos button img { width: calc(12px * var(--ik)); height: calc(12px * var(--ik)); }
.inv-logos button.on, .inv-paints button.on { border-image-source: var(--ikey-a); }
.inv-paints button i { display: block; width: calc(10px * var(--ik)); height: calc(10px * var(--ik)); box-shadow: inset 0 calc(1px * var(--ik)) 0 rgba(255,255,255,.2), inset 0 calc(-1px * var(--ik)) 0 rgba(0,0,0,.4); }
.inv-picks { max-height: calc(76px * var(--ik)); overflow-y: auto; padding: calc(1px * var(--ik)); scrollbar-width: none; }
.inv-picks button { width: calc(18px * var(--ik)); height: calc(18px * var(--ik)); padding: 0; border: 0; background: transparent; cursor: pointer; position: relative; }
.inv-picks button img { width: calc(16px * var(--ik)); height: calc(16px * var(--ik)); image-rendering: pixelated; }
.inv-picks button:hover { box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--ink); }
.inv-picks button.allow { background: rgba(51, 98, 64, .7); box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--glow); }
.inv-picks button.deny { background: rgba(114, 36, 29, .6); box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--warn); }
.inv-picks button.deny img { opacity: .45; }
.inv-crew .w { padding: 0 calc(3px * var(--ik)); display: inline-flex; align-items: center; gap: calc(2px * var(--ik)); color: var(--hot); text-shadow: var(--phos-glow); }
.inv-crew .w b { color: var(--warn); cursor: pointer; }
.inv-mode { display: flex; gap: calc(2px * var(--ik)); align-items: center; color: var(--dim); flex-wrap: wrap; text-shadow: var(--phos-glow); }

/* ---------------- tooltip ---------------- */
.inv-tip { position: fixed; z-index: 70; pointer-events: none; width: max-content; max-width: calc(200px * var(--ik)); box-sizing: border-box; padding: calc(5px * var(--ik)) calc(6px * var(--ik)); display: none; color: var(--ink); text-shadow: var(--phos-glow); background-color: #0a110d; }
.inv-tip h4 { margin: 0 0 calc(2px * var(--ik)); color: var(--hot); font-weight: normal; }
.inv-tip .g { color: var(--dim); }
.inv-tip .w { color: var(--amber); }
.inv-tip .r { color: var(--warn); }
.inv-tip .row { display: flex; justify-content: space-between; gap: calc(6px * var(--ik)); }
.inv-tip img { vertical-align: top; image-rendering: pixelated; }

/* ---------------- the crate HUD ---------------- */
.crate-hud { position: fixed; left: 16px; bottom: var(--crate-bottom); z-index: 30; box-sizing: border-box; user-select: none; background-color: #26281f; filter: drop-shadow(0 calc(3px * var(--ik)) 0 rgba(0,0,0,.4)); }
.crate-hud .bed { position: absolute; overflow: hidden; }
.crate-hud canvas { position: absolute; left: calc(4px * var(--ik)); top: calc(4px * var(--ik)); width: calc(100% - 8px * var(--ik)); height: calc(100% - 8px * var(--ik)); image-rendering: pixelated; cursor: pointer; }
.crate-hud .labels { position: absolute; left: calc(4px * var(--ik)); right: calc(4px * var(--ik)); bottom: calc(4px * var(--ik)); display: flex; pointer-events: none; z-index: 2; }
.crate-hud .labels > div { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: calc(1px * var(--ik)); padding-bottom: calc(2px * var(--ik)); }
.crate-hud .labels .nm { color: var(--cream); white-space: nowrap; overflow: hidden; max-width: 96%;
  text-shadow: calc(1px * var(--ik)) 0 0 #060908, calc(-1px * var(--ik)) 0 0 #060908, 0 calc(1px * var(--ik)) 0 #060908, 0 calc(-1px * var(--ik)) 0 #060908; }
.crate-hud .labels .g { width: 70%; height: calc(3px * var(--ik)); background: #0a110d; box-shadow: 0 0 0 calc(1px * var(--ik)) #060908; position: relative; }
.crate-hud .labels .g b { position: absolute; left: 0; top: 0; bottom: 0; background: repeating-linear-gradient(90deg, var(--glow) 0 calc(2px * var(--ik)), #14261b calc(2px * var(--ik)) calc(3px * var(--ik))); }
.crate-hud .labels .full .g b { background: repeating-linear-gradient(90deg, var(--amber) 0 calc(2px * var(--ik)), #31220e calc(2px * var(--ik)) calc(3px * var(--ik))); }
.crate-hud .row { position: absolute; display: flex; align-items: center; gap: calc(3px * var(--ik)); }
.crate-hud .row .t { color: var(--stamp); flex: 1; white-space: nowrap; text-shadow: 0 calc(1px * var(--ik)) 0 #131410; }
.crate-hud .dots { display: flex; gap: calc(1px * var(--ik)); }
.crate-hud .dots img { width: calc(6px * var(--ik)); height: calc(6px * var(--ik)); cursor: pointer; }
.crate-hud .hov { position: absolute; z-index: 3; pointer-events: none; border: calc(1px * var(--ik)) solid rgba(185, 220, 189, .55); display: none; }
.crate-hud.flash .bed { animation: crate-flash 600ms steps(6); }
@keyframes crate-flash { 0% { filter: brightness(1.8); } 100% { filter: none; } }

/* ---------------- the coached tutorial ---------------- */
.inv-coach-dim { position: fixed; z-index: 80; background: rgba(4, 8, 6, .62); pointer-events: none; }
.inv-coach-ring { position: fixed; z-index: 81; pointer-events: none; box-sizing: border-box; border: calc(1px * var(--ik)) solid var(--amber); box-shadow: 0 0 0 calc(1px * var(--ik)) #060908; animation: coach-pulse 1.2s steps(2) infinite; }
@keyframes coach-pulse { 50% { border-color: #ecd29a; } }
.inv-coach { position: fixed; z-index: 82; box-sizing: border-box; width: calc(210px * var(--ik)); padding: calc(8px * var(--ik)) calc(9px * var(--ik)) calc(12px * var(--ik)); background-color: #26281f; filter: drop-shadow(0 calc(4px * var(--ik)) 0 rgba(0,0,0,.45)); }
.inv-coach .scr2 { padding: calc(5px * var(--ik)) calc(6px * var(--ik)); color: var(--ink); text-shadow: var(--phos-glow); }
.inv-coach h3 { margin: 0 0 calc(3px * var(--ik)); color: var(--hot); font-weight: normal; }
.inv-coach p { margin: 0; }
.inv-coach p kbd { font-family: 'Body', monospace; font-size: var(--fb); color: var(--amber); }
.inv-coach .ft { display: flex; align-items: center; gap: calc(3px * var(--ik)); margin-top: calc(4px * var(--ik)); }
.inv-coach .ft .steps { flex: 1; display: flex; gap: calc(1px * var(--ik)); }
.inv-coach .ft .steps img { width: calc(6px * var(--ik)); height: calc(6px * var(--ik)); }
@media (prefers-reduced-motion: reduce) { .inv-win.pop, .crate-hud.flash .bed, .inv-coach-ring { animation: none; } }
`;
/** paint a painted-hardware background onto an element at its exact size (whole art pixels at --ik) */
export function paintBg(el: HTMLElement, url: (w: number, h: number) => string, ik: number) {
  const w = Math.round(el.offsetWidth / ik), h = Math.round(el.offsetHeight / ik);
  if (w < 4 || h < 4) return;
  const key = `${w}x${h}`;
  if (el.dataset.bg === key) return;
  el.dataset.bg = key;
  el.style.backgroundImage = `url(${url(w, h)})`;
  el.style.backgroundSize = `${w * ik}px ${h * ik}px`;
}
