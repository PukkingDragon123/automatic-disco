// The colony HUD's stylesheet: worn olive machine plates with screws, inset CRT glass in P1 green phosphor, amber for
// warnings, stamp red for alarms. Desktop layout regions (agreed in V6.md):
//   top bar (0-60 px, full width): colony plate + SHIP AI LINK (left), vitals strip (centre), time control (right)
//   right column (300 px): minimap, alerts feed
//   left column (340 px, under the bar): the selected-unit panel; the pod's works catalogue
//   bottom-right (500 x 330): the tool wheel
//   bottom-left (0-460 x bottom 300) is the inventory agent's crate HUD; bottom-centre the logistics build hotbar
import { keyURL, plateURL, signURL } from './pxPanel';

let done = false;
export function installHudStyle() {
  if (done) return; done = true;
  const st = document.createElement('style'); st.id = 'cx-style';
  const U: Record<string, string> = {
    __TAB__: keyURL('rubber'), __TABON__: keyURL('rubber', 'lit'), __TABD__: keyURL('rubber', 'down'), __TABR__: keyURL('red'), __TABB__: keyURL('blue'),
    __PAPER__: plateURL('enamel', 3), __NI__: signURL('info'), __NG__: signURL('good'), __NW__: signURL('warn'), __NB__: signURL('bad'), __NC__: signURL('crit'),
  };
  st.textContent = CSS.replace(/__[A-Z]+__/g, (m) => U[m] ?? m);
  document.head.appendChild(st);
}

const CSS = `
.cx { position: fixed; inset: 0; pointer-events: none; z-index: 20; font-family: 'Body', monospace; font-size: 22px; color: #1e232c; }
.cx * { box-sizing: border-box; }
.cx .pe { pointer-events: auto; }
.px-skin { background-size: 100% 100%; background-repeat: no-repeat; image-rendering: pixelated; }
.cx-plate { position: absolute; }
.cx-ink { color: #1e232c; }
.cx-ph { color: #2a323e; font-family: 'Body', monospace; }
.cx-sten { font-family: 'Title', monospace; font-size: 24px; color: #1e232c; }
.cx-lbl { font-family: 'Body', monospace; font-size: 11px; color: #3d4346; }
.cx-glass { position: relative; border-style: solid; border-width: 16px; border-image: url(__PAPER__) 8 fill / 16px stretch; image-rendering: pixelated; }
.cx-btn { pointer-events: auto; cursor: pointer; font-family: 'Body', monospace; font-size: 22px; color: #e5dbc3; background: none; border-style: solid; border-width: 10px 10px 12px; border-image: url(__TAB__) 5 5 6 fill / 10px 10px 12px stretch; image-rendering: pixelated; padding: 0 2px; line-height: 1; user-select: none; min-height: 36px; }
.cx-btn:hover { filter: brightness(1.2); }
.cx-btn:active { border-image-source: url(__TABD__); }
.cx-btn.on { border-image-source: url(__TABON__); color: #efb67b; }
.cx-btn.blue { border-image-source: url(__TABB__); } .cx-btn.red, .cx-btn.amber { border-image-source: url(__TABR__); }
.cx-btn[disabled], .cx-btn.off { opacity: 0.55; cursor: not-allowed; }
.cx-ico { image-rendering: pixelated; display: block; }

/* ---------------- top: the colony note, the vital doodles, the time strip (no bar: they float) */
.cx-top { left: 0; right: 0; top: 0; height: 104px; display: flex; align-items: flex-start; padding: 8px 10px 0; gap: 12px; }
.cx-id { display: flex; align-items: center; gap: 10px; min-width: 360px; padding: 14px 18px 16px; position: relative; }
.cx-id .roundel { width: 40px; height: 40px; image-rendering: pixelated; }
.cx-id .t1 { font-size: 11px; color: #3d4346; } .cx-id .t2 { font-family: 'Title', monospace; font-size: 24px; line-height: 1; margin-top: 2px; }
.cx-link { display: flex; align-items: center; gap: 4px; padding: 0 4px; font-size: 11px; }
.cx-link img { width: 34px; height: 34px; }
.cx-vitals { flex: 1; display: flex; justify-content: center; gap: 4px; }
.cx-vit { position: relative; width: 104px; height: 96px; pointer-events: auto; cursor: help; }
.cx-vit canvas { position: absolute; left: 0; top: 0; width: 104px; height: 96px; image-rendering: pixelated; }
.cx-vit img { display: none; }
.cx-time { display: flex; align-items: center; gap: 2px; padding: 10px 14px 12px; position: relative; }
.cx-time .cx-btn { width: 50px; height: 44px; padding: 0; display: flex; align-items: center; justify-content: center; }
.cx-time .clock { width: 122px; height: 50px; margin-left: 6px; display: flex; flex-direction: column; justify-content: center; align-items: center; line-height: 1; border-style: solid; border-width: 8px; border-image: url(__PAPER__) 8 fill / 8px stretch; padding: 0; }
.cx-time .clock span { font-family: 'Title', monospace; font-size: 24px; } .cx-time .clock small { font-size: 11px; }
.cx-pausebar { position: absolute; left: 0; right: 0; margin: 0 auto; width: fit-content; top: 112px; padding: 12px 26px 14px; display: none; color: #8c2920; }
.cx-pausebar.on { display: block; }
.cx-frame { position: fixed; inset: 0; pointer-events: none; z-index: 19; }
body.cx-paused .cx-frame { box-shadow: inset 0 0 0 6px rgba(229,219,195,0.55); }
.cx-alarm { position: fixed; inset: 0; pointer-events: none; z-index: 18; box-shadow: inset 0 0 0 6px #b13c2b, inset 0 0 120px 30px rgba(140,41,32,0.45); opacity: 0; }
.cx-alarm.on { animation: cxAlarm 1.2s steps(6) infinite; }
@keyframes cxAlarm { 0%,100% { opacity: 0.15; } 50% { opacity: 0.85; } }
.cx-count { position: absolute; left: 0; right: 0; margin: 0 auto; width: fit-content; top: 166px; padding: 12px 24px 16px; display: none; text-align: center; }
.cx-count.on { display: block; }
.cx-count .h { font-size: 11px; color: #efb67b; } .cx-count .v { font-family: 'TitleL', monospace; font-size: 32px; color: #f4eadb; line-height: 1; }

/* ---------------- right: the pinned map, the notes */
.cx-map { right: 8px; top: 112px; width: 300px; height: 318px; padding: 16px 18px; }
.cx-map .hd { display: flex; justify-content: space-between; align-items: baseline; margin: 0 2px 4px; font-size: 11px; color: #e5dbc3; } .cx-map .hd .cx-sten, .cx-map .hd .cx-ph { color: #e5dbc3 !important; }
.cx-map .scr { width: 264px; height: 264px; position: relative; border: none; }
.cx-map canvas { width: 264px; height: 264px; display: block; image-rendering: pixelated; pointer-events: auto; cursor: crosshair; }
.cx-alerts { right: 10px; top: 438px; width: 296px; display: flex; flex-direction: column; gap: 4px; }
.cx-al { pointer-events: auto; cursor: pointer; position: relative; display: grid; grid-template-columns: 26px 1fr auto; gap: 6px; align-items: center; padding: 0 2px; border-style: solid; border-width: 14px 14px 14px 14px; border-image: url(__NI__) 7 fill / 14px stretch; image-rendering: pixelated; font-size: 11px; line-height: 1.25; color: #1e232c; animation: cxIn 260ms steps(4); }
.cx-al canvas { width: 26px; height: 26px; image-rendering: pixelated; }
.cx-al .tm { font-size: 11px; color: #54595c; }
.cx-al .n { position: absolute; right: -12px; top: -14px; background: #e5dbc3; color: #8c2920; font-size: 11px; padding: 0 3px; outline: 2px solid #1e232c; }
.cx-al.good { border-image-source: url(__NG__); } .cx-al.warn { border-image-source: url(__NW__); } .cx-al.bad { border-image-source: url(__NB__); } .cx-al.crit { border-image-source: url(__NC__); color: #e5dbc3; } .cx-al.bad { color: #e5dbc3; } .cx-al.crit .tm, .cx-al.bad .tm { color: #e9cb89; }
.cx-al.old { opacity: 0.6; }
@keyframes cxIn { from { opacity: 0; } }

/* ---------------- left: the living vignette of the selection */
.cx-sel { left: 8px; top: 112px; width: 372px; padding: 16px 18px 18px; display: none; }
.cx-sel.on { display: block; }
.cx-sel .view { position: relative; width: 336px; height: 236px; margin-bottom: 8px; }
.cx-sel .view canvas { position: absolute; inset: 0; width: 336px; height: 236px; image-rendering: pixelated; }
.cx-sel .hd { display: flex; flex-direction: column; margin-bottom: 4px; }
.cx-sel .nm { font-family: 'Title', monospace; font-size: 24px; line-height: 1; } .cx-sel .ty { font-size: 11px; color: #3d4346; margin-top: 4px; }
.cx-sel .pic { display: none; }
.cx-sel .scr { padding: 0; font-size: 11px; line-height: 1.6; border: none; }
.cx-row { display: grid; grid-template-columns: 92px 1fr 64px; gap: 8px; align-items: center; }
.cx-row .k { color: #3d4346; font-size: 11px; } .cx-row .v { text-align: right; font-size: 11px; }
.cx-bar { height: 8px; position: relative; image-rendering: pixelated; border-bottom: 2px solid #1e232c; }
.cx-bar i { position: absolute; left: 0; top: 0; bottom: 0; background: repeating-linear-gradient(105deg, #597033 0 2px, #7f8b3f 2px 4px); }
.cx-bar.warn i { background: repeating-linear-gradient(105deg, #99702a 0 2px, #bc913a 2px 4px); } .cx-bar.crit i { background: repeating-linear-gradient(105deg, #8c2920 0 2px, #b13c2b 2px 4px); }
.cx-sel .st { margin-top: 4px; color: #8c2920; font-size: 11px; }
.cx-sel .acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.cx-sel .acts .cx-btn { font-size: 11px; min-height: 34px; }
.cx-works { margin-top: 8px; }
.cx-tabs { display: flex; gap: 2px; margin-bottom: 4px; }
.cx-tabs .cx-btn { flex: 1; font-size: 11px; padding: 0; }
.cx-tiles { display: grid; grid-template-columns: 1fr; gap: 2px; max-height: 300px; overflow-y: auto; pointer-events: auto; }
.cx-tile { display: grid; grid-template-columns: 58px 1fr; gap: 8px; padding: 0 2px; border-style: solid; border-width: 14px; border-image: url(__NI__) 7 fill / 14px stretch; image-rendering: pixelated; cursor: pointer; pointer-events: auto; }
.cx-tile:hover { border-image-source: url(__NG__); } .cx-tile.no { opacity: 0.62; }
.cx-tile .n { font-size: 11px; color: #1e232c; } .cx-tile .c { font-size: 11px; color: #3d4346; line-height: 1.3; }
.cx-tile .c b { color: #8c2920; font-weight: normal; } .cx-tile .c em { color: #1f5532; font-style: normal; }

/* ---------------- control note */
.cx-ctl { left: 0; right: 0; margin: 0 auto; width: fit-content; top: 112px; padding: 14px 24px 16px; display: none; align-items: center; gap: 14px; }
.cx-ctl.on { display: flex; }
.cx-ctl .big { font-family: 'Title', monospace; font-size: 24px; } .cx-ctl .keys { font-size: 11px; color: #3d4346; }
.cx-ctl .keys b { color: #e5dbc3; background: #2f2e31; padding: 0 3px; margin: 0 2px; font-weight: normal; box-shadow: 0 2px 0 #18181b; }

/* ---------------- the tool ring */
.cx-wheel { right: 6px; bottom: 6px; width: 480px; height: 330px; padding: 0; }
.cx-wheel canvas.dial { position: absolute; right: 8px; bottom: 6px; width: 320px; height: 320px; pointer-events: auto; cursor: pointer; image-rendering: pixelated; }
.cx-wheel .info { position: absolute; left: 12px; top: 166px; width: 156px; padding: 0; font-size: 11px; line-height: 1.3; }
.cx-wheel .info .tn { font-family: 'Title', monospace; font-size: 24px; line-height: 1; } .cx-wheel .info .un { color: #3d4346; margin-top: 6px; }
.cx-wheel .info .wrow { display: grid; grid-template-columns: 64px 1fr; grid-template-rows: auto auto; gap: 2px 6px; margin-top: 6px; align-items: center; }
.cx-wheel .info .wrow > img:first-child { grid-row: 1 / 3; }
.cx-wheel .info .pips { display: flex; gap: 4px; } .cx-wheel .info .pips i { width: 10px; height: 10px; background: #3d4346; box-shadow: 2px 2px 0 #18181b; } .cx-wheel .info .pips i.on { background: #de8f4e; }
.cx-wheel .info .unit { width: 44px; height: 44px; } .cx-wheel .info .nou { font-family: 'Title', monospace; font-size: 24px; color: #8c2920; }
.cx-wheel .info .lv { margin-top: 6px; color: #8c2920; }
.cx-wheel .cfg { position: absolute; left: 10px; bottom: 16px; width: 156px; font-size: 11px; }
.cx-slotcfg { right: 492px; bottom: 8px; width: 430px; padding: 18px 20px 20px; display: none; }
.cx-slotcfg.on { display: block; }
.cx-slotcfg .tg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; margin: 6px 0; }
.cx-slotcfg .tt { display: flex; flex-direction: column; align-items: center; gap: 0; padding: 0; border-style: solid; border-width: 12px; border-image: url(__NI__) 7 fill / 12px stretch; image-rendering: pixelated; cursor: pointer; pointer-events: auto; font-size: 11px; color: #1e232c; }
.cx-slotcfg .tt:hover { border-image-source: url(__NW__); } .cx-slotcfg .tt.on { border-image-source: url(__NG__); } .cx-slotcfg .tt.nu { opacity: 0.55; }
.cx-slotcfg .units { display: flex; flex-wrap: wrap; gap: 2px; margin: 4px 0; }
.cx-slotcfg .up { margin-top: 6px; font-size: 11px; line-height: 1.4; }
.cx-tip { position: fixed; z-index: 60; pointer-events: none; max-width: 340px; padding: 0 2px; border-style: solid; border-width: 16px; border-image: url(__PAPER__) 8 fill / 16px stretch; image-rendering: pixelated; font-family: 'Body', monospace; font-size: 11px; line-height: 1.35; color: #1e232c; display: none; }
.cx-tip b { color: #8c2920; font-weight: normal; } .cx-tip .w { color: #745820; } .cx-tip .r { color: #8c2920; }

/* ---------------- the logistics hotbar in the HUD's materials (lead's request) */
.hb-slot { border-image-source: url(__PAPER__) !important; border-image-slice: 8 fill !important; }
.hb-slot.on, .hb-slot.drop { border-image-source: url(__NG__) !important; border-image-slice: 7 fill !important; }
.hb-slot .n { color: #1e232c !important; }

/* ---------------- cannon sight */
.cn-view { position: fixed; inset: 0; z-index: 40; pointer-events: none; }
.cn-view canvas { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; }
.cn-bar { position: absolute; left: 0; right: 0; height: 9vh; background: #13161c; }
.cn-bar.top { top: 0; } .cn-bar.bot { bottom: 0; }
.cn-tag { position: absolute; left: 40px; top: calc(9vh + 18px); font-family: 'Title', monospace; font-size: 24px; color: #e5dbc3; }
.cn-help { position: absolute; left: 0; right: 0; text-align: center; bottom: calc(9vh + 16px); font-family: 'Body', monospace; font-size: 22px; color: #e5dbc3; }
.cn-help span { background: #e5dbc3; color: #13161c; padding: 0 5px; margin: 0 4px 0 14px; }
body.cannon-on .cx > :not(.cx-alarm) { opacity: 0; } body.cannon-on .overlay2d { opacity: 0; }

/* ---------------- failure */
.cf-screen { position: fixed; inset: 0; z-index: 70; pointer-events: none; }
.cf-wash { position: absolute; inset: 0; background: rgba(30,4,2,0.45); opacity: 0; transition: opacity 2.4s; }
.cf-bar { position: absolute; left: 0; right: 0; height: 0; background: #13161c; transition: height 1.6s cubic-bezier(.2,.7,.2,1); }
.cf-bar.top { top: 0; } .cf-bar.bot { bottom: 0; }
.cf-screen.on .cf-wash { opacity: 1; } .cf-screen.on .cf-bar { height: 12vh; }
.cf-card { position: absolute; left: 0; right: 0; margin: 0 auto; top: 24vh; width: 800px; padding: 30px 38px 32px; opacity: 0; transition: opacity 1s 0.8s; color: #1e232c; }
.cf-screen.on .cf-card { opacity: 1; }
.cf-head { font-size: 11px; color: #3d4346; }
.cf-title { font-family: 'Title', monospace; font-size: 48px; color: #1e232c; margin: 14px 0 12px; }
.cf-body { font-size: 22px; color: #2a323e; min-height: 58px; line-height: 1.3; }
.cf-detail { font-size: 22px; color: #8c2920; margin-top: 8px; }
.cf-stats { display: flex; gap: 28px; margin: 18px 0 6px; font-size: 11px; color: #3d4346; }
.cf-stats b { display: block; font-family: 'Title', monospace; font-size: 24px; color: #1e232c; font-weight: normal; }
.cf-stamp { position: absolute; right: 30px; top: 50px; width: 300px; height: 96px; opacity: 0; image-rendering: pixelated; }
.cf-screen.stamped .cf-stamp { opacity: 0.95; }
.cf-btns { display: flex; gap: 14px; margin-top: 22px; opacity: 0; transition: opacity 600ms; }
.cf-screen.ready .cf-btns { opacity: 1; pointer-events: auto; }
.cf-btn { pointer-events: auto; cursor: pointer; font-family: 'Body', monospace; font-size: 22px; color: #1e232c; background: none; border-style: solid; border-width: 12px; border-image: url(__TABR__) 6 fill / 12px stretch; image-rendering: pixelated; padding: 2px 8px; }
.cf-btn.ship { border-image-source: url(__TABB__); }
.cf-btn small { display: block; font-size: 11px; color: #3d4346; margin-top: 2px; }
.cf-btn i { font-style: normal; color: #8c2920; margin-right: 6px; }
`;
