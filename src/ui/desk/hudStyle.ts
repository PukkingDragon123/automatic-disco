// The colony HUD's stylesheet: worn olive machine plates with screws, inset CRT glass in P1 green phosphor, amber for
// warnings, stamp red for alarms. Desktop layout regions (agreed in V6.md):
//   top bar (0-60 px, full width): colony plate + SHIP AI LINK (left), vitals strip (centre), time control (right)
//   right column (300 px): minimap, alerts feed
//   left column (340 px, under the bar): the selected-unit panel; the pod's works catalogue
//   bottom-right (500 x 330): the tool wheel
//   bottom-left (0-460 x bottom 300) is the inventory agent's crate HUD; bottom-centre the logistics build hotbar
import { keyURL, glassURL, tagURL } from './pxPanel';

let done = false;
export function installHudStyle() {
  if (done) return; done = true;
  const st = document.createElement('style'); st.id = 'cx-style';
  const U: Record<string, string> = {
    __KEY__: keyURL('olive'), __KEYD__: keyURL('olive', 'down'), __KEYL__: keyURL('olive', 'lit'), __KEYB__: keyURL('blue'), __KEYBL__: keyURL('blue', 'lit'),
    __KEYR__: keyURL('red'), __KEYA__: keyURL('amber'), __KEYS__: keyURL('steel'), __GLASS__: glassURL(), __GLASSA__: glassURL(true),
    __TI__: tagURL('info'), __TG__: tagURL('good'), __TW__: tagURL('warn'), __TB__: tagURL('bad'), __TC__: tagURL('crit'),
  };
  st.textContent = CSS.replace(/__[A-Z]+__/g, (m) => U[m] ?? m);
  document.head.appendChild(st);
}

const CSS = `
.cx { position: fixed; inset: 0; pointer-events: none; z-index: 20; font-family: 'Pixelify', sans-serif; color: #d8d2b8; --ph: #8fe09a; --ph2: #5fae6c; --amb: #e2b04a; --red: #e0604a; --glass: #0b130e; --ink: #1a1c18; }
.cx * { box-sizing: border-box; }
.cx .pe { pointer-events: auto; }
.px-skin { background-size: 100% 100%; background-repeat: no-repeat; image-rendering: pixelated; }
.cx-plate { position: absolute; filter: drop-shadow(0 4px 0 rgba(10,12,8,0.55)); }
.cx-screw { position: absolute; width: 12px; height: 12px; image-rendering: pixelated; pointer-events: none; }
.cx-screw.tl { left: var(--in); top: var(--in); } .cx-screw.tr { right: var(--in); top: var(--in); } .cx-screw.bl { left: var(--in); bottom: var(--in); } .cx-screw.br { right: var(--in); bottom: var(--in); }
.cx-glass { position: relative; border-style: solid; border-width: 10px; border-image: url(__GLASS__) 5 fill / 10px round; image-rendering: pixelated; }
.cx-ph { color: #73b073; text-shadow: 2px 2px 0 #0f2219; font-family: 'VT', monospace; }
.cx-sten { font-family: 'Superwide', 'Jersey', sans-serif; letter-spacing: 2px; text-transform: uppercase; color: #d6cab0; text-shadow: 2px 2px 0 #222316; }
.cx-lbl { font-family: 'Jersey', sans-serif; font-size: 15px; letter-spacing: 1px; color: #cfc8a8; }
.cx-ico { image-rendering: pixelated; display: block; }
.cx-btn { pointer-events: auto; cursor: pointer; font-family: 'Jersey', sans-serif; font-size: 16px; letter-spacing: 1px; color: #e5dbc3; text-shadow: 2px 2px 0 #222316; background: none;
  border-style: solid; border-width: 10px 10px 12px; border-image: url(__KEY__) 5 5 6 fill / 10px 10px 12px stretch; image-rendering: pixelated; padding: 0 2px; line-height: 1; user-select: none; min-height: 36px; }
.cx-btn:hover { filter: brightness(1.12); }
.cx-btn:active { border-image-source: url(__KEYD__); }
.cx-btn.on { border-image-source: url(__KEYL__); color: #a8d09d; }
.cx-btn.blue { border-image-source: url(__KEYB__); } .cx-btn.blue.on { border-image-source: url(__KEYBL__); }
.cx-btn.red { border-image-source: url(__KEYR__); } .cx-btn.amber { border-image-source: url(__KEYA__); }
.cx-btn[disabled], .cx-btn.off { filter: grayscale(0.7) brightness(0.72); cursor: not-allowed; }

/* ---------------- top bar */
.cx-top { left: 0; right: 0; top: 0; height: 64px; display: flex; align-items: center; padding: 0 22px; gap: 14px; }
.cx-id { display: flex; align-items: center; gap: 10px; min-width: 340px; }
.cx-id .roundel { width: 40px; height: 40px; }
.cx-id .t1 { font-size: 13px; } .cx-id .t2 { font-size: 18px; color: var(--ph); font-family: 'VT', monospace; text-shadow: 0 0 6px rgba(127,212,138,0.45); line-height: 1; margin-top: 2px; }
.cx-link { display: flex; align-items: center; gap: 6px; padding: 3px 10px 4px 4px; font-size: 15px; }
.cx-link img { width: 30px; height: 30px; }
.cx-vitals { flex: 1; display: flex; justify-content: center; gap: 6px; }
.cx-vit { position: relative; width: 172px; height: 50px; padding: 0; pointer-events: auto; cursor: help; }
.cx-vit canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; image-rendering: pixelated; }
.cx-vit img { position: absolute; left: 4px; top: 7px; }
.cx-vit.crit { animation: cxBlink 0.8s steps(2) infinite; }
@keyframes cxBlink { 50% { filter: brightness(1.35) sepia(0.4) hue-rotate(-40deg) saturate(2); } }
.cx-time { display: flex; align-items: center; gap: 2px; padding: 4px 10px; height: 54px; position: relative; }
.cx-time .cx-btn { width: 46px; height: 42px; padding: 0; font-size: 17px; display: flex; align-items: center; justify-content: center; }
.cx-time .clock { width: 112px; height: 44px; margin-left: 4px; display: flex; flex-direction: column; justify-content: center; align-items: center; font-size: 17px; line-height: 1; }
.cx-time .clock small { font-size: 12px; opacity: 0.8; }
.cx-pausebar { position: absolute; left: 50%; top: 72px; transform: translateX(-50%); padding: 10px 26px; font-size: 22px; color: #d7a856; display: none; }
.cx-pausebar.on { display: block; animation: cxPulse 1.6s ease-in-out infinite; }
@keyframes cxPulse { 50% { opacity: 0.72; } }
body.cx-paused .cx-frame { box-shadow: inset 0 0 0 4px #b27d34, inset 0 0 0 6px #503a1a; }
.cx-frame { position: fixed; inset: 0; pointer-events: none; z-index: 19; transition: box-shadow 300ms; }
.cx-alarm { position: fixed; inset: 0; pointer-events: none; z-index: 18; box-shadow: inset 0 0 0 6px #b13c2b, inset 0 0 0 10px #672319, inset 0 0 120px 20px rgba(140,41,32,0.45); opacity: 0; }
.cx-alarm.on { animation: cxAlarm 1.2s ease-in-out infinite; }
@keyframes cxAlarm { 0%,100% { opacity: 0.15; } 50% { opacity: 0.9; } }
.cx-count { position: absolute; left: 50%; top: 122px; transform: translateX(-50%); padding: 10px 24px 12px; display: none; text-align: center; }
.cx-count.on { display: block; }
.cx-count .h { font-size: 13px; color: #d37867; } .cx-count .v { font-family: 'VT', monospace; font-size: 36px; color: #e0604a; text-shadow: 2px 2px 0 #401913; line-height: 1; }

/* ---------------- right column: minimap, alerts */
.cx-map { right: 8px; top: 72px; width: 296px; height: 318px; padding: 12px 14px; }
.cx-map .hd { display: flex; justify-content: space-between; align-items: baseline; margin: 0 2px 6px; font-size: 12px; }
.cx-map .scr { width: 268px; height: 268px; position: relative; }
.cx-map canvas { width: 248px; height: 248px; display: block; image-rendering: pixelated; pointer-events: auto; cursor: crosshair; }
.cx-alerts { right: 8px; top: 398px; width: 292px; display: flex; flex-direction: column; gap: 5px; }
.cx-al { pointer-events: auto; cursor: pointer; position: relative; display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; padding: 0 2px 0 6px; border-style: solid; border-width: 10px 12px 10px 12px; border-image: url(__TI__) 5 6 5 6 fill / 10px 12px 10px 12px round; image-rendering: pixelated; font-family: 'VT', monospace; font-size: 17px; line-height: 1.05; color: #c1b59b; text-shadow: 2px 2px 0 #13161c; animation: cxIn 260ms ease-out; }
.cx-al .lamp { display: none; }
.cx-al .tm { font-size: 15px; color: #8f856e; }
.cx-al .n { position: absolute; right: -10px; top: -12px; background: #bc913a; color: #13161c; font-family: 'VT', monospace; font-size: 14px; padding: 0 4px; text-shadow: none; outline: 2px solid #312715; }
.cx-al.good { border-image-source: url(__TG__); color: #a8d09d; }
.cx-al.warn { border-image-source: url(__TW__); color: #d8ac5b; }
.cx-al.bad { border-image-source: url(__TB__); color: #d37867; }
.cx-al.crit { border-image-source: url(__TC__); color: #efb67b; animation: cxIn 260ms ease-out, cxBlink2 0.8s steps(2) 6; }
@keyframes cxBlink2 { 50% { opacity: 0.2; } }
.cx-al.old { opacity: 0.55; }
@keyframes cxIn { from { transform: translateX(30px); opacity: 0; } }

/* ---------------- left: selection panel */
.cx-sel { left: 8px; top: 72px; width: 344px; padding: 16px 16px 18px; display: none; }
.cx-sel.on { display: block; animation: cxIn 200ms ease-out; }
.cx-sel .hd { display: grid; grid-template-columns: 68px 1fr; gap: 10px; align-items: center; margin-bottom: 8px; }
.cx-sel .pic { width: 68px; height: 68px; padding: 0; display: flex; align-items: center; justify-content: center; }
.cx-sel .nm { font-size: 17px; line-height: 1.1; } .cx-sel .ty { font-size: 13px; color: #b8b294; margin-top: 3px; letter-spacing: 1px; }
.cx-sel .scr { padding: 2px 4px; font-size: 17px; line-height: 1.35; }
.cx-row { display: grid; grid-template-columns: 96px 1fr 56px; gap: 8px; align-items: center; }
.cx-row .k { color: var(--ph2); font-size: 15px; } .cx-row .v { text-align: right; font-size: 16px; }
.cx-bar { height: 10px; background: #13161c; outline: 2px solid #0f2219; position: relative; image-rendering: pixelated; }
.cx-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: repeating-linear-gradient(90deg, #73b073 0 4px, #2c7240 4px 6px, #13161c 6px 8px); }
.cx-bar.warn i { background: repeating-linear-gradient(90deg, #d8ac5b 0 4px, #99702a 4px 6px, #13161c 6px 8px); } .cx-bar.crit i { background: repeating-linear-gradient(90deg, #d37867 0 4px, #9b4238 4px 6px, #13161c 6px 8px); }
.cx-sel .st { margin-top: 4px; color: var(--amb); font-size: 16px; }
.cx-sel .acts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }
.cx-sel .acts .cx-btn { font-size: 15px; }
.cx-works { margin-top: 10px; }
.cx-tabs { display: flex; gap: 3px; margin-bottom: 6px; }
.cx-tabs .cx-btn { flex: 1; font-size: 13px; padding: 3px 2px 4px; }
.cx-tiles { display: grid; grid-template-columns: 1fr; gap: 4px; max-height: 330px; overflow-y: auto; pointer-events: auto; }
.cx-tile { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 0 2px; border-style: solid; border-width: 10px 12px; border-image: url(__TI__) 5 6 fill / 10px 12px round; image-rendering: pixelated; cursor: pointer; pointer-events: auto; }
.cx-tile:hover { border-image-source: url(__TG__); }
.cx-tile.no { opacity: 0.62; }
.cx-tile .n { font-size: 15px; color: #e6dfc2; } .cx-tile .c { font-family: 'VT', monospace; font-size: 14px; color: #a8b290; line-height: 1.2; }
.cx-tile .c b { color: #d37867; font-weight: normal; } .cx-tile .c em { color: #73b073; font-style: normal; }

/* ---------------- control banner */
.cx-ctl { left: 50%; top: 72px; transform: translateX(-50%); padding: 12px 24px 13px; display: none; align-items: center; gap: 14px; }
.cx-ctl.on { display: flex; }
.cx-ctl .big { font-size: 20px; } .cx-ctl .keys { font-family: 'VT', monospace; font-size: 16px; color: #c8c2a4; }
.cx-ctl .keys b { color: #13161c; background: #c1b59b; padding: 0 4px; margin: 0 2px; font-weight: normal; box-shadow: 2px 2px 0 #222316; }

/* ---------------- tool wheel */
.cx-wheel { right: 8px; bottom: 8px; width: 492px; height: 328px; padding: 0; }
.cx-wheel canvas.dial { position: absolute; right: 12px; bottom: 12px; width: 304px; height: 304px; pointer-events: auto; cursor: pointer; image-rendering: pixelated; }
.cx-wheel .info { position: absolute; left: 14px; top: 30px; width: 158px; bottom: 64px; padding: 0 2px; font-size: 16px; line-height: 1.2; overflow: hidden; }
.cx-wheel .info .tn { font-size: 20px; } .cx-wheel .info .un { color: #c8c2a4; margin-top: 4px; } .cx-wheel .info .ds { color: #9fb08a; font-size: 14px; margin-top: 8px; line-height: 1.2; }
.cx-wheel .info .lv { margin-top: 8px; color: var(--amb); }
.cx-wheel .cfg { position: absolute; left: 14px; bottom: 14px; width: 158px; font-size: 14px; }
.cx-wheel .hd { position: absolute; left: 18px; top: 10px; font-size: 11px; }
.cx-slotcfg { right: 508px; bottom: 8px; width: 424px; padding: 16px 18px 18px; display: none; }
.cx-slotcfg.on { display: block; animation: cxIn 180ms ease-out; }
.cx-slotcfg .tg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin: 8px 0; }
.cx-slotcfg .tt { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 0; border-style: solid; border-width: 10px 12px; border-image: url(__TI__) 5 6 fill / 10px 12px round; image-rendering: pixelated; cursor: pointer; pointer-events: auto; font-size: 13px; font-family: 'VT', monospace; color: #c1b59b; }
.cx-slotcfg .tt:hover { border-image-source: url(__TW__); } .cx-slotcfg .tt.on { border-image-source: url(__TG__); color: #a8d09d; } .cx-slotcfg .tt.nu { opacity: 0.55; }
.cx-slotcfg .units { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.cx-slotcfg .up { margin-top: 8px; padding: 8px 10px; font-size: 15px; line-height: 1.3; }
.cx-tip { position: fixed; z-index: 60; pointer-events: none; max-width: 320px; padding: 0 4px; border-style: solid; border-width: 10px; border-image: url(__GLASS__) 5 fill / 10px round; image-rendering: pixelated; font-family: 'VT', monospace; font-size: 17px; line-height: 1.2; color: #a8d09d; text-shadow: 2px 2px 0 #0f2219; display: none; }
.cx-tip b { color: #e5dbc3; font-weight: normal; } .cx-tip .w { color: #d8ac5b; } .cx-tip .r { color: #d37867; }

/* ---------------- cannon sight */
.cn-view { position: fixed; inset: 0; z-index: 40; pointer-events: none; }
.cn-view canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.cn-bar { position: absolute; left: 0; right: 0; height: 9vh; background: #050706; animation: cnBar 600ms ease-out; }
.cn-bar.top { top: 0; } .cn-bar.bot { bottom: 0; }
@keyframes cnBar { from { height: 0; } }
.cn-tag { position: absolute; left: 40px; top: calc(9vh + 18px); font-family: 'Superwide', sans-serif; font-size: 16px; letter-spacing: 3px; color: #9fe0a8; }
.cn-help { position: absolute; left: 50%; bottom: calc(9vh + 16px); transform: translateX(-50%); font-family: 'VT', monospace; font-size: 18px; color: #c8d8c0; }
.cn-help span { background: #9fe0a8; color: #0a120c; padding: 0 5px; margin: 0 4px 0 14px; }
body.cannon-on .cx > :not(.cx-alarm) { opacity: 0; } body.cannon-on .overlay2d { opacity: 0; }

/* ---------------- failure */
.cf-screen { position: fixed; inset: 0; z-index: 70; pointer-events: none; }
.cf-wash { position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(40,6,4,0) 30%, rgba(30,4,2,0.75) 100%); opacity: 0; transition: opacity 2.4s; }
.cf-bar { position: absolute; left: 0; right: 0; height: 0; background: #040404; transition: height 1.6s cubic-bezier(.2,.7,.2,1); }
.cf-bar.top { top: 0; } .cf-bar.bot { bottom: 0; }
.cf-screen.on .cf-wash { opacity: 1; } .cf-screen.on .cf-bar { height: 12vh; }
.cf-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -46%); width: 760px; padding: 26px 34px 28px; background: rgba(10,10,9,0.86); border: 2px solid #3a2a22; border-radius: 4px; opacity: 0; transition: opacity 1s 0.8s, transform 1.4s 0.8s; box-shadow: 0 20px 60px rgba(0,0,0,0.7); }
.cf-screen.on .cf-card { opacity: 1; transform: translate(-50%, -50%); }
.cf-head { font-family: 'VT', monospace; font-size: 16px; color: #a89a80; letter-spacing: 1px; }
.cf-title { font-family: 'Superwide', sans-serif; font-size: 34px; letter-spacing: 4px; color: #f0e2c8; margin: 14px 0 12px; text-shadow: 0 0 18px rgba(224,96,74,0.35); }
.cf-body { font-family: 'VT', monospace; font-size: 22px; color: #d9cdb2; min-height: 58px; line-height: 1.3; }
.cf-detail { font-family: 'VT', monospace; font-size: 17px; color: #e0a080; margin-top: 8px; }
.cf-stats { display: flex; gap: 28px; margin: 18px 0 6px; font-family: 'Jersey', sans-serif; font-size: 14px; color: #8e8470; letter-spacing: 1px; }
.cf-stats b { display: block; font-family: 'VT', monospace; font-size: 26px; color: #e8dcc0; font-weight: normal; }
.cf-stamp { position: absolute; right: 30px; top: 60px; font-family: 'Superwide', sans-serif; font-size: 30px; letter-spacing: 3px; color: #c8382e; border: 4px solid #c8382e; padding: 6px 14px; transform: rotate(-9deg) scale(2.4); opacity: 0; mix-blend-mode: screen; }
.cf-screen.stamped .cf-stamp { animation: cfStamp 320ms cubic-bezier(.3,1.6,.5,1) forwards; }
@keyframes cfStamp { to { transform: rotate(-9deg) scale(1); opacity: 0.88; } }
.cf-btns { display: flex; gap: 14px; margin-top: 22px; opacity: 0; transition: opacity 600ms; }
.cf-screen.ready .cf-btns { opacity: 1; pointer-events: auto; }
.cf-btn { pointer-events: auto; cursor: pointer; font-family: 'Jersey', sans-serif; font-size: 20px; letter-spacing: 2px; color: #f0e6cc; background: linear-gradient(#5a3a2c, #3e261c); border: 2px solid #1c120c; border-radius: 3px; padding: 10px 18px 12px; box-shadow: inset 1px 1px 0 rgba(255,230,200,0.2), 0 3px 0 #120a06; }
.cf-btn.ship { background: linear-gradient(#2f5a82, #1f3d5b); } .cf-btn:hover { filter: brightness(1.18); }
.cf-btn small { display: block; font-family: 'VT', monospace; font-size: 15px; color: #d8b8a0; letter-spacing: 0; margin-top: 2px; }
.cf-btn i { font-style: normal; color: #ffb090; margin-right: 6px; }
`;
