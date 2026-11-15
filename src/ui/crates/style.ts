// Styles for the stores. Everything is 2D pixel art painted at art resolution (one art pixel = --ik screen pixels,
// ui/crates/mat.ts) and shown with image-rendering: pixelated, so nothing is resampled: a container's panel is cut from
// its own material, its controls are tags, tabs and labels of that material, the HUD is a gunmetal plate of badges.
// Text is Departure Mono ('Body') at 22 px (11 px on small screens) and Spleen ('Title') at 24 px; numbers over words.
let done = false;
export function injectCrateCSS() {
  if (done) return;
  done = true;
  const st = document.createElement('style');
  st.id = 'crate-css';
  st.textContent = CSS;
  document.head.appendChild(st);
  const r = document.documentElement.style;
  const set = () => { const big = innerHeight >= 1000; r.setProperty('--ik', big ? '2' : '1'); r.setProperty('--fb', big ? '22px' : '11px'); r.setProperty('--ft', big ? '24px' : '11px'); r.setProperty('--ftf', big ? "'Title'" : "'Body'"); };
  set(); addEventListener('resize', set);
}
const INK = '#1e232c', LIGHT = '#e5dbc3', RED = '#b13c2b', AMBER = '#eecc8e', MOSS = '#8fb06a';
const a = (n: number) => `calc(${n}px * var(--ik))`;
/** a 1-art-pixel dark outline round light text (four hard shadows, no blur) */
const OUT = `text-shadow: ${a(1)} 0 0 ${INK}, ${a(-1)} 0 0 ${INK}, 0 ${a(1)} 0 ${INK}, 0 ${a(-1)} 0 ${INK}, ${a(1)} ${a(1)} 0 ${INK};`;
const CSS = `
:root { --ik: 2; --fb: 22px; --ft: 24px; --ftf: 'Title'; --crate-bottom: 16px; }
.inv-win, .crate-hud, .inv-coach, .inv-tip, .inv-card, .inv-ghost, .inv-hudcard { font-family: 'Body', monospace; font-size: var(--fb); line-height: var(--fb); color: ${LIGHT}; -webkit-font-smoothing: none; font-smooth: never; }
.inv-win button, .crate-hud button, .inv-coach button, .inv-win input { font-family: 'Body', monospace; font-size: var(--fb); line-height: var(--fb); color: inherit; }
.inv-t { font-family: var(--ftf), monospace; font-size: var(--ft); line-height: var(--ft); font-weight: normal; }
.inv-win, .crate-hud, .inv-coach, .inv-tip, .inv-card, .inv-set, .inv-hudcard, .crate-hud .badge, .inv-search, .inv-chip { background-repeat: no-repeat; image-rendering: pixelated; }
.inv-win img, .crate-hud img, .inv-coach img, .inv-card img, .inv-ghost img, .inv-hudcard img, .inv-win canvas { image-rendering: pixelated; display: block; }
.inv-win .r, .inv-card .r, .crate-hud .r { color: ${RED}; }
.inv-card .ok { color: ${MOSS}; }

/* ---------------- the panel ---------------- */
.inv-win { position: fixed; z-index: 40; user-select: none; filter: drop-shadow(0 ${a(4)} 0 rgba(8,9,10,.45)); }
.inv-win.pop { animation: inv-pop 240ms steps(5) both; }
@keyframes inv-pop { 0% { opacity: 0; transform: translateY(${a(8)}); } 100% { opacity: 1; transform: none; } }
.inv-win > div { position: absolute; }
.inv-head { display: flex; align-items: center; gap: ${a(4)}; padding: 0 ${a(2)}; box-sizing: border-box; cursor: grab; }
.inv-head canvas.plate { width: ${a(16)}; height: ${a(16)}; flex: none; }
.inv-head .lab { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; ${OUT} }
.inv-pri { display: flex; gap: ${a(1)}; }
.inv-pri img { width: ${a(6)}; height: ${a(6)}; }
.inv-ctl { cursor: pointer; flex: none; }
.inv-head .inv-ctl { width: ${a(16)}; height: ${a(16)}; }
.inv-ctl:active { transform: translateY(${a(1)}); }
.inv-ctrls { display: flex; align-items: center; gap: ${a(3)}; }
.inv-bar { display: flex; gap: ${a(1)}; flex: none; }
.inv-bar.srt img { width: ${a(16)}; height: ${a(16)}; }
.inv-bar.chips { flex: 1; min-width: 0; overflow: hidden; }
.inv-chip { width: ${a(18)}; height: ${a(16)}; padding: 0; border: 0; cursor: pointer; flex: none; background-size: ${a(18)} ${a(16)}; display: flex; align-items: center; justify-content: center; }
.inv-chip img { width: ${a(16)}; height: ${a(16)}; }
.inv-chip:active { transform: translateY(${a(1)}); }
.inv-search { width: ${a(64)}; height: ${a(16)}; flex: none; background-size: ${a(64)} ${a(16)}; position: relative; }
.inv-search input { position: absolute; left: ${a(4)}; top: ${a(2)}; width: ${a(56)}; height: ${a(12)}; padding: 0; border: 0; outline: 0; background: transparent; ${OUT} }
.inv-search input::placeholder { color: rgba(229,219,195,.55); }

/* the grid: sprites at whole-number scale, counts in Body with a hard outline, a freshness tick */
.inv-grid { position: absolute; }
.inv-stack { position: absolute; cursor: grab; }
.inv-stack img, .inv-ghost img { position: absolute; }
.inv-stack:hover img { filter: brightness(1.18); }
.inv-stack.dim { opacity: .28; filter: grayscale(1); }
.inv-stack.lift { opacity: .3; }
.inv-stack .cnt, .inv-ghost .cnt { position: absolute; right: ${a(3)}; bottom: ${a(2)}; color: ${LIGHT}; ${OUT} pointer-events: none; }
.inv-stack .fr { position: absolute; left: ${a(4)}; top: ${a(3)}; height: ${a(2)}; background: ${MOSS}; box-shadow: 0 ${a(1)} 0 ${INK}; }
.inv-stack .fr.warn { background: ${AMBER}; } .inv-stack .fr.bad { background: ${RED}; } .inv-stack .fr.keep { background: #a7c8d8; }
.inv-drop { position: absolute; pointer-events: none; box-sizing: border-box; border: ${a(2)} solid ${AMBER}; background: rgba(238,204,142,.14); }
.inv-drop.bad { border-color: ${RED}; background: rgba(177,60,43,.18); }
.inv-drop.merge { border-color: ${MOSS}; background: rgba(143,176,106,.18); }

/* the foot: the gauge in its painted well, the numbers to its right */
.inv-foot { height: ${a(12)}; }
.inv-foot .gauge { position: absolute; height: ${a(3)}; }
.inv-foot .gauge b { display: block; height: 100%; background: repeating-linear-gradient(90deg, ${MOSS} 0 ${a(2)}, #6f8f4e ${a(2)} ${a(3)}); }
.inv-foot .gauge b.full { background: repeating-linear-gradient(90deg, ${RED} 0 ${a(2)}, #8c2920 ${a(2)} ${a(3)}); }
.inv-foot .nums { position: absolute; right: 0; top: ${a(-2)}; display: flex; gap: ${a(6)}; white-space: nowrap; ${OUT} }
.inv-foot .mass { opacity: .8; }
.inv-note { position: absolute; z-index: 2; padding: ${a(2)} ${a(4)}; background: rgba(19,22,28,.86); box-shadow: 0 0 0 ${a(1)} ${RED}; color: ${LIGHT}; pointer-events: none; white-space: nowrap; }
.inv-note:empty { display: none; }

/* the settings plate under the panel */
.inv-set { position: absolute; left: 0; box-sizing: border-box; padding: ${a(8)} ${a(9)}; display: flex; flex-direction: column; gap: ${a(3)}; }
.inv-set .row { display: flex; align-items: center; gap: ${a(2)}; flex-wrap: wrap; min-height: ${a(16)}; }
.inv-set .gl { margin-right: ${a(3)}; flex: none; }
.inv-set .sp { flex: 1; }
.inv-set .opt { cursor: pointer; width: ${a(16)}; height: ${a(16)}; }
.inv-set .opt.sw { width: ${a(14)}; height: ${a(14)}; }
.inv-set .opt.pip { width: ${a(6)}; height: ${a(6)}; padding: ${a(2)} ${a(1)}; }
.inv-set .opt.link { width: ${a(14)}; height: ${a(14)}; }
.inv-set input.lbl { width: ${a(120)}; height: ${a(14)}; padding: 0 ${a(3)}; border: 0; outline: 0; background: rgba(10,11,13,.45); box-shadow: inset 0 ${a(1)} 0 rgba(0,0,0,.5), 0 ${a(1)} 0 rgba(255,246,220,.18); color: ${LIGHT}; text-transform: uppercase; ${OUT} }
.inv-picks { display: flex; flex-wrap: wrap; gap: ${a(1)}; flex: 1; }
.inv-picks button { width: ${a(18)}; height: ${a(18)}; padding: ${a(1)}; border: 0; cursor: pointer; background: rgba(10,11,13,.3); }
.inv-picks button img { width: ${a(16)}; height: ${a(16)}; }
.inv-picks button.allow { box-shadow: inset 0 0 0 ${a(1)} ${MOSS}; background: rgba(143,176,106,.3); }
.inv-picks button.deny { box-shadow: inset 0 0 0 ${a(1)} ${RED}; background: rgba(177,60,43,.3); }
.inv-picks button.deny img { opacity: .45; filter: grayscale(1); }
.inv-set .w { padding: 0 ${a(3)}; background: rgba(10,11,13,.4); ${OUT} }
.inv-set .w b { color: ${RED}; cursor: pointer; margin-left: ${a(3)}; font-weight: normal; }

/* the item card and the one-line tip */
.inv-card, .inv-tip { position: fixed; z-index: 70; pointer-events: none; display: none; color: ${INK}; }
.inv-tip { padding: ${a(3)} ${a(5)}; white-space: nowrap; box-sizing: border-box; }
.inv-card { box-sizing: border-box; padding: ${a(5)}; }
.inv-card .big { position: absolute; left: ${a(5)}; top: ${a(5)}; width: ${a(48)}; height: ${a(48)}; }
.inv-card .txt { position: absolute; left: ${a(58)}; top: ${a(5)}; right: ${a(5)}; }
.inv-card .nm { white-space: nowrap; overflow: hidden; margin-bottom: ${a(3)}; }
.inv-card .nums { display: grid; grid-template-columns: 1fr 1fr; row-gap: ${a(2)}; }
.inv-card .nums span { display: flex; align-items: center; gap: ${a(2)}; white-space: nowrap; }
.inv-card .gl, .inv-hudcard .gl { flex: none; }
.inv-ghost { position: fixed; z-index: 60; pointer-events: none; filter: drop-shadow(${a(2)} ${a(3)} 0 rgba(8,9,10,.5)); }

/* ---------------- the HUD: a gunmetal plate of three badges, bottom left ---------------- */
.crate-hud { position: fixed; left: 16px; bottom: var(--crate-bottom); z-index: 30; user-select: none; touch-action: pan-y; filter: drop-shadow(0 ${a(3)} 0 rgba(8,9,10,.4)); }
.crate-hud > div { position: absolute; }
.crate-hud .badges { overflow: hidden; }
.crate-hud .track { position: absolute; left: 0; top: 0; height: 100%; display: flex; transition: transform 220ms steps(6); }
.crate-hud .badge { position: relative; flex: none; cursor: pointer; }
.crate-hud .badge:hover { filter: brightness(1.12); }
.crate-hud .badge:active { transform: translateY(${a(1)}); }
.crate-hud .badge.pop { animation: hud-pop 520ms steps(8) both; }
@keyframes hud-pop { 0% { transform: translateY(${a(30)}) scale(.4); opacity: 0; } 55% { transform: translateY(${a(-6)}) scale(1.08); opacity: 1; } 80% { transform: translateY(${a(2)}) scale(.98); } 100% { transform: none; } }
.crate-hud .badge.flash::after { content: ''; position: absolute; inset: 0; box-shadow: inset 0 0 0 ${a(2)} ${AMBER}; animation: hud-flash 900ms steps(6) 3 both; pointer-events: none; }
@keyframes hud-flash { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
.crate-hud .badge .nm { position: absolute; left: ${a(2)}; top: ${a(43)}; white-space: nowrap; overflow: hidden; text-align: center; ${OUT} }
.crate-hud .badge .it { position: absolute; left: ${a(5)}; width: ${a(54)}; height: ${a(16)}; display: flex; align-items: center; gap: ${a(2)}; }
.crate-hud .badge .it img { width: ${a(16)}; height: ${a(16)}; }
.crate-hud .badge .it span { flex: 1; text-align: right; ${OUT} }
.crate-hud .badge .empty { position: absolute; left: 0; width: 100%; top: ${a(72)}; text-align: center; opacity: .55; ${OUT} }
.crate-hud .badge .bang { position: absolute; right: ${a(5)}; top: ${a(5)}; color: ${RED}; ${OUT} }
.crate-hud .row { display: flex; align-items: center; gap: ${a(4)}; }
.crate-hud .row img.arw { width: ${a(12)}; height: ${a(12)}; cursor: pointer; flex: none; }
.crate-hud .row img.arw.dis { opacity: .35; cursor: default; }
.crate-hud .dots { flex: 1; display: flex; justify-content: center; gap: ${a(2)}; }
.crate-hud .dots img { width: ${a(6)}; height: ${a(6)}; cursor: pointer; }
.crate-hud .row .n { ${OUT} }
.inv-hudcard { position: fixed; z-index: 70; pointer-events: none; display: none; color: ${INK}; box-sizing: border-box; padding: ${a(5)} ${a(6)}; }
.inv-hudcard .hd { display: flex; align-items: center; gap: ${a(4)}; margin-bottom: ${a(3)}; }
.inv-hudcard .hd span { flex: 1; text-align: right; }
.inv-hudcard .ls { display: grid; grid-template-columns: 1fr 1fr; column-gap: ${a(6)}; row-gap: ${a(1)}; }
.inv-hudcard .ls div { display: flex; align-items: center; gap: ${a(3)}; }
.inv-hudcard .ls img { width: ${a(16)}; height: ${a(16)}; }
.inv-hudcard .ls span { flex: 1; text-align: right; }
.inv-hudcard .mu { opacity: .6; }

/* ---------------- the coach ---------------- */
.inv-coach { position: fixed; z-index: 82; box-sizing: border-box; padding: ${a(6)} ${a(8)} ${a(6)}; color: ${INK}; display: flex; align-items: center; gap: ${a(6)}; }
.inv-coach .n { flex: none; width: ${a(14)}; height: ${a(14)}; display: flex; align-items: center; justify-content: center; background: ${INK}; color: ${AMBER}; }
.inv-coach .say { white-space: nowrap; }
.inv-coach .keys { display: flex; gap: ${a(2)}; }
.inv-coach .k { padding: 0 ${a(3)}; background: ${INK}; color: ${LIGHT}; white-space: nowrap; }
.inv-coach .skip { flex: none; width: ${a(12)}; height: ${a(12)}; cursor: pointer; margin-left: ${a(2)}; }
.inv-coach-arrow { position: fixed; z-index: 83; pointer-events: none; image-rendering: pixelated; animation: coach-bob 900ms steps(4) infinite; }
.inv-coach-arrow.l { --bx: ${a(-4)}; --by: 0px; } .inv-coach-arrow.r { --bx: ${a(4)}; --by: 0px; } .inv-coach-arrow.u { --bx: 0px; --by: ${a(-4)}; } .inv-coach-arrow.d { --bx: 0px; --by: ${a(4)}; }
@keyframes coach-bob { 0%, 100% { transform: none; } 50% { transform: translate(var(--bx), var(--by)); } }
.inv-coach-ring { position: fixed; z-index: 81; pointer-events: none; box-sizing: border-box; border: ${a(2)} dashed ${AMBER}; animation: coach-ring 1200ms steps(2) infinite; }
@keyframes coach-ring { 50% { border-color: ${LIGHT}; } }
`;
