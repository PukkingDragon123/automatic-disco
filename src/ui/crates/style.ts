// Styles for the grid inventory, the crate HUD and the coached tutorial: worn olive housings, CRT glass for the grids,
// Bakelite keys, stencilled plates. Frames are the machine kit's own 9-slices (--housing, --crt, --well, --key-*)
// drawn at --ik (2 at 1080p: one art pixel = two screen pixels), fonts at whole multiples of their pixel size.
let done = false;
export function injectCrateCSS() {
  if (done) return;
  done = true;
  const st = document.createElement('style');
  st.id = 'crate-css';
  st.textContent = CSS;
  document.head.appendChild(st);
  const set = () => document.documentElement.style.setProperty('--ik', String(innerHeight >= 1000 ? 2 : 1));
  set(); addEventListener('resize', set);
}
const CSS = `
:root { --ik: 2; --cell: calc(26px * var(--ik)); --crate-bottom: 16px; }
.inv-win, .crate-hud, .inv-coach { font-family: 'Pixelify', 'VT', monospace; color: var(--cream); image-rendering: pixelated; }
.inv-win button, .crate-hud button, .inv-coach button { font: inherit; color: inherit; }

/* ---------------- the window ---------------- */
.inv-win { position: fixed; z-index: 40; box-sizing: border-box; border-style: solid; border-width: calc(12px * var(--ik));
  border-image: var(--housing) 12 / calc(12px * var(--ik)) repeat; background: #15181c var(--plate-dp) 0 0 / calc(64px * var(--ik)); background-clip: padding-box;
  box-shadow: 0 calc(6px * var(--ik)) calc(18px * var(--ik)) rgba(0,0,0,.55); user-select: none; transform-origin: 50% 60%; }
.inv-win.pop { animation: inv-pop 260ms steps(7) both; }
@keyframes inv-pop { 0% { transform: translateY(14px) scale(.96); opacity: 0; filter: brightness(2); } 60% { opacity: 1; } 100% { transform: none; filter: none; } }
.inv-head { display: flex; align-items: center; gap: calc(5px * var(--ik)); padding: calc(3px * var(--ik)) calc(4px * var(--ik)) calc(4px * var(--ik)); border-bottom: calc(1px * var(--ik)) solid #0b0d0f; box-shadow: 0 calc(1px * var(--ik)) 0 #3a3d40; cursor: grab; }
.inv-head canvas.plate { width: calc(48px * var(--ik)); height: calc(24px * var(--ik)); flex: none; box-shadow: 0 0 0 calc(1px * var(--ik)) #0b0d0f; }
.inv-title { flex: 1; min-width: 0; }
.inv-title .lab { font-family: 'Superwide', 'Jersey'; font-size: calc(8px * var(--ik)); letter-spacing: calc(.5px * var(--ik)); color: var(--cream); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inv-title .kind { font-family: 'VT', monospace; font-size: calc(8px * var(--ik)); color: var(--stamp); opacity: .85; margin-top: calc(1px * var(--ik)); }
.inv-pri { display: flex; gap: calc(1px * var(--ik)); align-items: flex-end; }
.inv-pri i { display: block; width: calc(3px * var(--ik)); background: #2b2e31; box-shadow: inset 0 0 0 calc(1px * var(--ik)) #0b0d0f; }
.inv-pri i.on { background: var(--amber); }
.inv-key { border-style: solid; border-width: calc(4px * var(--ik)); border-image: var(--key-n) 8 fill / calc(4px * var(--ik)) repeat; background: none; padding: 0;
  min-width: calc(16px * var(--ik)); height: calc(16px * var(--ik)); box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center;
  font-family: 'Jersey', monospace; font-size: calc(8px * var(--ik)); color: var(--cream); cursor: pointer; line-height: 1; white-space: nowrap; }
.inv-key.w { padding: 0 calc(3px * var(--ik)); }
.inv-key:hover { border-image-source: var(--key-h); color: #fff8e0; }
.inv-key:active { border-image-source: var(--key-p); }
.inv-key.act { border-image-source: var(--key-a); color: var(--gold); }
.inv-key.dis { border-image-source: var(--key-d); color: #6a665c; pointer-events: none; }
.inv-key svg, .inv-key img { width: calc(8px * var(--ik)); height: calc(8px * var(--ik)); pointer-events: none; }

.inv-bar { display: flex; align-items: center; gap: calc(2px * var(--ik)); padding: calc(3px * var(--ik)) calc(3px * var(--ik)) 0; flex-wrap: wrap; }
.inv-bar .k { font-family: 'Superwide', 'Jersey'; font-size: calc(5px * var(--ik)); color: var(--stamp); letter-spacing: calc(.5px * var(--ik)); margin: 0 calc(2px * var(--ik)) 0 calc(1px * var(--ik)); }
.inv-search { flex: 1; min-width: calc(70px * var(--ik)); height: calc(16px * var(--ik)); box-sizing: border-box; border-style: solid; border-width: calc(6px * var(--ik));
  border-image: var(--well) 6 / calc(6px * var(--ik)) repeat; background: #041209; background-clip: padding-box; display: flex; align-items: center; }
.inv-search input { width: 100%; background: transparent; border: 0; outline: 0; color: var(--hot); font-family: 'VT', monospace; font-size: calc(8px * var(--ik)); padding: 0 calc(1px * var(--ik)); text-shadow: var(--phos-glow); caret-color: var(--glow); }
.inv-search input::placeholder { color: var(--dim); }
.inv-chip { font-family: 'Jersey', monospace; font-size: calc(8px * var(--ik)); height: calc(11px * var(--ik)); padding: 0 calc(3px * var(--ik)); border: 0; cursor: pointer;
  background: #202225; color: var(--stamp); box-shadow: inset 0 calc(-1px * var(--ik)) 0 #0b0d0f, inset 0 calc(1px * var(--ik)) 0 #3a3d40; display: inline-flex; align-items: center; gap: calc(2px * var(--ik)); }
.inv-chip:hover { color: var(--cream); background: #2b2e31; }
.inv-chip.on { background: #26402e; color: var(--hot); box-shadow: inset 0 calc(-1px * var(--ik)) 0 #0f1a14, inset 0 calc(1px * var(--ik)) 0 #4a8457; }
.inv-chip .n { color: var(--dim); }
.inv-chip.on .n { color: var(--glow); }
.inv-chip.none { opacity: .45; }

.inv-body { display: flex; align-items: stretch; }
.inv-man { flex: none; width: calc(112px * var(--ik)); margin: calc(3px * var(--ik)) calc(3px * var(--ik)) calc(3px * var(--ik)) 0; box-sizing: border-box; border-style: solid; border-width: calc(6px * var(--ik));
  border-image: var(--well) 6 / calc(6px * var(--ik)) repeat; background: #0a110d; background-clip: padding-box; display: flex; flex-direction: column; min-height: 0; }
.inv-man .mh { font-family: 'Superwide', 'Jersey'; font-size: calc(5px * var(--ik)); letter-spacing: calc(.5px * var(--ik)); color: var(--dim); padding: calc(1px * var(--ik)) calc(2px * var(--ik)) calc(2px * var(--ik)); border-bottom: calc(1px * var(--ik)) dashed #1b3525; }
.inv-man .ml { flex: 1; overflow-y: auto; max-height: calc(220px * var(--ik)); padding: calc(1px * var(--ik)) 0; }
.inv-man .mrow { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0 calc(2px * var(--ik)); padding: 0 calc(2px * var(--ik)); min-height: calc(10px * var(--ik)); font-family: 'VT', monospace; font-size: calc(8px * var(--ik)); color: var(--ink); cursor: pointer; position: relative; }
.inv-man .mrow:hover { background: #14261b; color: var(--hot); }
.inv-man .mrow img { image-rendering: pixelated; }
.inv-man .mrow .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.inv-man .mrow .n { color: var(--hot); text-shadow: var(--phos-glow); }
.inv-man .mrow .mf { grid-column: 2 / 4; height: calc(1px * var(--ik)); background: #14261b; display: block; margin-bottom: calc(1px * var(--ik)); }
.inv-man .mrow .mf b { display: block; height: 100%; background: var(--glow); }
.inv-man .mrow .mf.warn b { background: var(--amber); }
.inv-man .mrow .mf.bad b { background: var(--warn); }
.inv-man .mrow .mf.keep b { background: #6f99c5; }
.inv-man .mrow.empty { color: var(--dim); cursor: default; }
.inv-screen { flex: 1; display: flex; align-items: flex-start; justify-content: center; margin: calc(3px * var(--ik)); border-style: solid; border-width: calc(8px * var(--ik)); border-image: var(--crt) 8 / calc(8px * var(--ik)) repeat;
  background: #041209 var(--phos) 0 0 / calc(64px * var(--ik)); background-clip: padding-box; position: relative; }
.inv-screen::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 5; background: var(--scan), radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,.45) 100%); }
.inv-grid { position: relative; margin: calc(2px * var(--ik)); }
.inv-cell { position: absolute; box-sizing: border-box; border: calc(1px * var(--ik)) solid rgba(74, 132, 87, .22); background: rgba(10, 17, 13, .35); }
.inv-cell:nth-child(odd) { background: rgba(15, 26, 20, .32); }
.inv-stack { position: absolute; box-sizing: border-box; cursor: grab; z-index: 2; transition: opacity 120ms steps(3);
  background: linear-gradient(180deg, rgba(51, 98, 64, .28), rgba(20, 38, 27, .28)); box-shadow: inset 0 0 0 calc(1px * var(--ik)) rgba(127, 184, 138, .35); }
.inv-stack:hover { box-shadow: inset 0 0 0 calc(1px * var(--ik)) rgba(185, 220, 189, .85); background: rgba(51, 98, 64, .42); }
.inv-stack img { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -54%); pointer-events: none; image-rendering: pixelated; }
.inv-stack .cnt { position: absolute; right: calc(1px * var(--ik)); bottom: 0; font-family: 'VT', monospace; font-size: calc(8px * var(--ik)); color: var(--hot); text-shadow: 0 calc(1px * var(--ik)) 0 #041209, calc(1px * var(--ik)) 0 0 #041209, 0 0 calc(2px * var(--ik)) #041209; pointer-events: none; }
.inv-stack .fr { position: absolute; left: calc(2px * var(--ik)); right: calc(2px * var(--ik)); bottom: calc(1px * var(--ik)); height: calc(1px * var(--ik)); background: #14261b; pointer-events: none; }
.inv-stack .fr b { display: block; height: 100%; background: var(--glow); }
.inv-stack .fr.warn b { background: var(--amber); }
.inv-stack .fr.bad b { background: var(--warn); }
.inv-stack.cold::before { content: ''; position: absolute; left: calc(1px * var(--ik)); top: calc(1px * var(--ik)); width: calc(3px * var(--ik)); height: calc(3px * var(--ik)); background: #6f99c5; box-shadow: 0 0 0 calc(1px * var(--ik)) #041209; }
.inv-stack.dim { opacity: .18; }
.inv-stack.hit { box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--amber), 0 0 calc(4px * var(--ik)) rgba(217,164,58,.4); }
.inv-stack.lift { opacity: .3; }
.inv-ghost { position: fixed; z-index: 60; pointer-events: none; box-sizing: border-box; box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--hot); background: rgba(51, 98, 64, .35); }
.inv-ghost img { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -54%); image-rendering: pixelated; filter: drop-shadow(0 calc(2px * var(--ik)) 0 rgba(0,0,0,.6)); }
.inv-ghost .cnt { position: absolute; right: calc(1px * var(--ik)); bottom: 0; font-family: 'VT'; font-size: calc(8px * var(--ik)); color: var(--hot); }
.inv-drop { position: absolute; z-index: 3; pointer-events: none; box-sizing: border-box; border: calc(1px * var(--ik)) dashed var(--glow); background: rgba(127, 184, 138, .14); }
.inv-drop.bad { border-color: var(--warn); background: rgba(204, 98, 82, .16); }
.inv-drop.merge { border-color: var(--amber); background: rgba(217, 164, 58, .16); }

.inv-foot { display: flex; align-items: center; gap: calc(4px * var(--ik)); padding: 0 calc(4px * var(--ik)) calc(2px * var(--ik)); font-family: 'VT', monospace; font-size: calc(8px * var(--ik)); color: var(--stamp); }
.inv-meter { flex: 1; height: calc(5px * var(--ik)); background: #0b0d0f; box-shadow: inset 0 0 0 calc(1px * var(--ik)) #2b2e31; position: relative; }
.inv-meter b { position: absolute; left: calc(1px * var(--ik)); top: calc(1px * var(--ik)); bottom: calc(1px * var(--ik)); background: repeating-linear-gradient(90deg, var(--glow) 0 calc(3px * var(--ik)), transparent calc(3px * var(--ik)) calc(4px * var(--ik))); }
.inv-meter.full b { background: repeating-linear-gradient(90deg, var(--amber) 0 calc(3px * var(--ik)), transparent calc(3px * var(--ik)) calc(4px * var(--ik))); }
.inv-note { font-family: 'VT', monospace; font-size: calc(8px * var(--ik)); color: var(--amber); padding: 0 calc(4px * var(--ik)) calc(2px * var(--ik)); min-height: calc(9px * var(--ik)); }

/* ---------------- settings drawer ---------------- */
.inv-set { border-top: calc(1px * var(--ik)) solid #0b0d0f; box-shadow: inset 0 calc(1px * var(--ik)) 0 #3a3d40; padding: calc(3px * var(--ik)) calc(4px * var(--ik)) calc(2px * var(--ik)); display: grid; grid-template-columns: auto 1fr; gap: calc(3px * var(--ik)) calc(5px * var(--ik)); align-items: center; }
.inv-set .k { font-family: 'Superwide', 'Jersey'; font-size: calc(5px * var(--ik)); color: var(--stamp); letter-spacing: calc(.5px * var(--ik)); }
.inv-set input.lbl { font-family: 'Superwide', 'Jersey'; font-size: calc(7px * var(--ik)); color: var(--cream); background: #0b0d0f; border: 0; outline: 0; height: calc(12px * var(--ik)); padding: 0 calc(3px * var(--ik)); box-shadow: inset 0 0 0 calc(1px * var(--ik)) #3a3d40; text-transform: uppercase; width: calc(110px * var(--ik)); }
.inv-logos, .inv-paints, .inv-picks, .inv-crew { display: flex; flex-wrap: wrap; gap: calc(1px * var(--ik)); }
.inv-logos button, .inv-paints button { width: calc(14px * var(--ik)); height: calc(14px * var(--ik)); padding: 0; border: 0; cursor: pointer; background: #202225; box-shadow: inset 0 0 0 calc(1px * var(--ik)) #0b0d0f; display: flex; align-items: center; justify-content: center; }
.inv-logos button img { width: calc(12px * var(--ik)); height: calc(12px * var(--ik)); }
.inv-logos button.on, .inv-paints button.on { box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--hot), 0 0 0 calc(1px * var(--ik)) var(--amber); }
.inv-paints button i { display: block; width: calc(10px * var(--ik)); height: calc(10px * var(--ik)); box-shadow: inset 0 calc(1px * var(--ik)) 0 rgba(255,255,255,.18), inset 0 calc(-1px * var(--ik)) 0 rgba(0,0,0,.35); }
.inv-picks { max-height: calc(54px * var(--ik)); overflow-y: auto; padding: calc(1px * var(--ik)); background: #0b0d0f; box-shadow: inset 0 0 0 calc(1px * var(--ik)) #2b2e31; }
.inv-picks button { width: calc(16px * var(--ik)); height: calc(16px * var(--ik)); padding: 0; border: 0; background: #16181a; cursor: pointer; position: relative; }
.inv-picks button img { width: calc(14px * var(--ik)); height: calc(14px * var(--ik)); }
.inv-picks button.allow { background: #26402e; box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--glow); }
.inv-picks button.deny { background: #3a1a16; box-shadow: inset 0 0 0 calc(1px * var(--ik)) var(--warn); }
.inv-picks button.deny img { opacity: .5; }
.inv-picks button.deny::after { content: ''; position: absolute; left: 15%; right: 15%; top: 48%; height: calc(1px * var(--ik)); background: var(--warn); transform: rotate(-35deg); }
.inv-crew .w { font-family: 'VT'; font-size: calc(8px * var(--ik)); padding: 0 calc(3px * var(--ik)); height: calc(11px * var(--ik)); display: inline-flex; align-items: center; gap: calc(2px * var(--ik)); background: #202225; color: var(--cream); box-shadow: inset 0 0 0 calc(1px * var(--ik)) #0b0d0f; }
.inv-crew .w b { color: var(--warn); cursor: pointer; }
.inv-mode { display: flex; gap: calc(1px * var(--ik)); align-items: center; font-family: 'VT'; font-size: calc(8px * var(--ik)); color: var(--dim); }

/* ---------------- tooltip ---------------- */
.inv-tip { position: fixed; z-index: 70; pointer-events: none; max-width: calc(150px * var(--ik)); box-sizing: border-box; border-style: solid; border-width: calc(6px * var(--ik));
  border-image: var(--well) 6 / calc(6px * var(--ik)) repeat; background: #0a110d; background-clip: padding-box; padding: calc(1px * var(--ik)) calc(2px * var(--ik)); display: none;
  font-family: 'VT', monospace; font-size: calc(8px * var(--ik)); line-height: calc(9px * var(--ik)); color: var(--ink); text-shadow: var(--phos-glow); }
.inv-tip h4 { margin: 0 0 calc(1px * var(--ik)); font-family: 'Superwide', 'Jersey'; font-weight: normal; font-size: calc(6px * var(--ik)); color: var(--hot); letter-spacing: calc(.5px * var(--ik)); text-transform: uppercase; }
.inv-tip .g { color: var(--dim); }
.inv-tip .w { color: var(--amber); }
.inv-tip .r { color: var(--warn); }
.inv-tip .row { display: flex; justify-content: space-between; gap: calc(6px * var(--ik)); }

/* ---------------- the crate HUD ---------------- */
.crate-hud { position: fixed; left: 16px; bottom: var(--crate-bottom); z-index: 30; width: calc(214px * var(--ik)); box-sizing: border-box; border-style: solid; border-width: calc(12px * var(--ik));
  border-image: var(--housing) 12 / calc(12px * var(--ik)) repeat; background: #15181c var(--plate-dp) 0 0 / calc(64px * var(--ik)); background-clip: padding-box; user-select: none; }
.crate-hud .bed { position: relative; height: calc(70px * var(--ik)); border-style: solid; border-width: calc(8px * var(--ik)); border-image: var(--crt) 8 / calc(8px * var(--ik)) repeat; background: #061009; background-clip: padding-box; overflow: hidden; }
.crate-hud .bed::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: var(--scan); opacity: .5; }
.crate-hud canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; image-rendering: auto; cursor: pointer; }
.crate-hud .labels { position: absolute; left: 0; right: 0; bottom: 0; display: flex; pointer-events: none; z-index: 2; padding: calc(4px * var(--ik)) 0 calc(1px * var(--ik)); background: linear-gradient(180deg, transparent, rgba(4, 12, 7, .85) 55%); }
.crate-hud .labels div { flex: 1; text-align: center; font-family: 'Jersey', monospace; font-size: calc(8px * var(--ik)); color: var(--cream); text-shadow: 0 calc(1px * var(--ik)) 0 #041209, 0 0 calc(2px * var(--ik)) #041209; white-space: nowrap; overflow: hidden; }
.crate-hud .labels div span { color: var(--dim); font-family: 'VT'; }
.crate-hud .labels div.full span { color: var(--amber); }
.crate-hud .row { display: flex; align-items: center; gap: calc(3px * var(--ik)); margin-top: calc(3px * var(--ik)); }
.crate-hud .row .t { font-family: 'Superwide', 'Jersey'; font-size: calc(5px * var(--ik)); letter-spacing: calc(.5px * var(--ik)); color: var(--stamp); flex: 1; }
.crate-hud .dots { display: flex; gap: calc(2px * var(--ik)); }
.crate-hud .dots i { width: calc(4px * var(--ik)); height: calc(4px * var(--ik)); background: #202225; box-shadow: inset 0 0 0 calc(1px * var(--ik)) #0b0d0f; cursor: pointer; }
.crate-hud .dots i.on { background: var(--glow); box-shadow: inset 0 0 0 calc(1px * var(--ik)) #14261b, 0 0 calc(2px * var(--ik)) rgba(127,184,138,.6); }
.crate-hud .hov { position: absolute; z-index: 3; pointer-events: none; border: calc(1px * var(--ik)) solid rgba(185, 220, 189, .6); box-shadow: 0 0 calc(4px * var(--ik)) rgba(127,184,138,.35); display: none; }
.crate-hud.flash .bed { animation: crate-flash 600ms steps(6); }
@keyframes crate-flash { 0% { filter: brightness(1.8); } 100% { filter: none; } }

/* ---------------- the coached tutorial ---------------- */
.inv-coach-dim { position: fixed; z-index: 80; background: rgba(4, 8, 6, .62); pointer-events: none; transition: all 220ms steps(5); }
.inv-coach-ring { position: fixed; z-index: 81; pointer-events: none; box-sizing: border-box; border: calc(1px * var(--ik)) solid var(--amber); box-shadow: 0 0 0 calc(1px * var(--ik)) #041209, 0 0 calc(8px * var(--ik)) rgba(217,164,58,.45); transition: all 220ms steps(5); animation: coach-pulse 1.4s steps(4) infinite; }
@keyframes coach-pulse { 50% { box-shadow: 0 0 0 calc(1px * var(--ik)) #041209, 0 0 calc(14px * var(--ik)) rgba(217,164,58,.7); } }
.inv-coach { position: fixed; z-index: 82; width: calc(170px * var(--ik)); box-sizing: border-box; border-style: solid; border-width: calc(12px * var(--ik));
  border-image: var(--housing) 12 / calc(12px * var(--ik)) repeat; background: #15181c var(--plate-dp) 0 0 / calc(64px * var(--ik)); background-clip: padding-box; transition: left 220ms steps(5), top 220ms steps(5); }
.inv-coach .scr2 { border-style: solid; border-width: calc(8px * var(--ik)); border-image: var(--crt) 8 / calc(8px * var(--ik)) repeat; background: #041209 var(--phos) 0 0 / calc(64px * var(--ik)); background-clip: padding-box; padding: calc(2px * var(--ik)) calc(3px * var(--ik)); position: relative; }
.inv-coach .scr2::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: var(--scan); }
.inv-coach h3 { margin: 0 0 calc(2px * var(--ik)); font-family: 'Superwide', 'Jersey'; font-weight: normal; font-size: calc(7px * var(--ik)); color: var(--hot); letter-spacing: calc(.5px * var(--ik)); text-shadow: var(--phos-glow); }
.inv-coach p { margin: 0; font-family: 'VT', monospace; font-size: calc(8px * var(--ik)); line-height: calc(9px * var(--ik)); color: var(--ink); text-shadow: var(--phos-glow); }
.inv-coach p kbd { font-family: 'Jersey'; color: var(--amber); }
.inv-coach .ft { display: flex; align-items: center; gap: calc(3px * var(--ik)); margin-top: calc(3px * var(--ik)); }
.inv-coach .ft .steps { flex: 1; display: flex; gap: calc(2px * var(--ik)); }
.inv-coach .ft .steps i { width: calc(6px * var(--ik)); height: calc(3px * var(--ik)); background: #202225; box-shadow: inset 0 0 0 calc(1px * var(--ik)) #0b0d0f; }
.inv-coach .ft .steps i.on { background: var(--amber); }
.inv-coach .ft .steps i.done { background: var(--dim); }
.inv-coach .ok { color: var(--glow); font-family: 'VT'; font-size: calc(8px * var(--ik)); }
@media (prefers-reduced-motion: reduce) { .inv-win.pop, .crate-hud.flash .bed, .inv-coach-ring { animation: none; } }
`;
