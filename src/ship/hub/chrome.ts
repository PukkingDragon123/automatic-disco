// The hub's machine UI: worn gunmetal housings with screwed corners and phosphor glass, painted in code at the
// screen's own resolution (9-slice frames, so every plate stays crisp at any size). The top status strip (ship,
// mission clock, where you are, ship vitals), floating room tags over the cutaway, the hover card, the room panel
// with its function keys, the room dock along the bottom, the exterior title plate and the settings plate.
import * as THREE from 'three';
import type { ShipHub } from './hub';
import { ROOMS, ROOM_IDS, SHIP_BOX, SHIP_NAME, SHIP_REG, type RoomId } from './layout';
import { canvas } from './tex';
import { PixelCanvas, makeRamp, ph } from '../../limbo/gfx/pixel';
import { csfx } from '../../ui/cineAudio';
import { settings, setSettings, resetSettings, type Quality } from '../../settings';
import { ui } from '../../ui/kit';

export interface RoomAction { id: string; label: string; key?: string; run: () => void; disabled?: () => string | false; primary?: boolean; hint?: string }

// ------------------------------------------------------------------ painted frames
/**
 * The UI hardware, hand-pixelled at 1x (shown at 2x, nearest): 24 x 24 nine-slice plates with 8 px corners.
 * steel: a worn gunmetal housing, ink outline, lit top-left bevel, shadowed bottom-right, a groove, screws in the
 * corners, scratches near the edges. crt: phosphor glass in a dark bezel with scanlines and an inner shadow.
 * key / keyHi: a raised Bakelite key with its thickness under it and an indicator lamp (lit when hot).
 */
function plate(kind: 'steel' | 'crt' | 'key' | 'keyHi' | 'tag' | 'amber'): string {
  const N = 24, pc = new PixelCanvas(N, N);
  const base = kind === 'crt' ? 0x0c1a12 : kind === 'tag' ? 0x1c2420 : kind === 'amber' ? 0x3a2e1a : kind === 'keyHi' ? 0x2c3e30 : kind === 'key' ? 0x2e3230 : 0x30363a;
  const R = makeRamp(base, 6, { spread: 0.55 }), INKC = 0x07090a;
  pc.fill(R[2]);
  // the face: two tones in soft clusters
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (ph(x >> 1, y >> 1, 7) < 0.22) pc.set(x, y, R[3]);
  // outline and bevel
  for (let i = 0; i < N; i++) { pc.set(i, 0, INKC); pc.set(i, N - 1, INKC); pc.set(0, i, INKC); pc.set(N - 1, i, INKC); }
  for (let i = 1; i < N - 1; i++) { pc.set(i, 1, R[5]); pc.set(1, i, R[4]); pc.set(i, N - 2, R[0]); pc.set(N - 2, i, R[1]); }
  if (kind === 'crt') {
    const G = makeRamp(0x0e2416, 5, { spread: 0.5 });
    for (let y = 3; y < N - 3; y++) for (let x = 3; x < N - 3; x++) pc.set(x, y, y % 2 ? G[1] : G[2]);
    for (let x = 3; x < N - 3; x++) { pc.set(x, 3, G[0]); pc.set(x, 4, G[0]); pc.set(x, N - 4, 0x3f8f58); }
    for (let y = 3; y < N - 3; y++) { pc.set(3, y, G[0]); }
    for (let i = 2; i < N - 2; i++) { pc.set(i, 2, R[0]); pc.set(2, i, R[0]); pc.set(i, N - 3, R[4]); pc.set(N - 3, i, R[4]); }
  } else if (kind === 'steel' || kind === 'amber') {
    for (let i = 4; i < N - 4; i++) { pc.set(i, 4, R[0]); pc.set(i, 5, R[4]); }
    for (const [x, y] of [[3, 3], [N - 4, 3], [3, N - 4], [N - 4, N - 4]]) { pc.set(x, y, R[5]); pc.set(x + 1, y, R[3]); pc.set(x, y + 1, R[3]); pc.set(x + 1, y + 1, R[0]); pc.set(x - 1, y + 1, R[1]); pc.set(x + 1, y - 1, R[1]); }
    for (const [x, y] of [[7, 2], [16, N - 3], [2, 15]]) { pc.set(x, y, R[5]); pc.set(x + 1, y, R[4]); }
    if (kind === 'amber') for (let y = 2; y < N - 2; y++) { pc.set(2, y, 0xd9a43a); pc.set(3, y, 0x98702c); }
  } else if (kind === 'key' || kind === 'keyHi') {
    for (let i = 1; i < N - 1; i++) { pc.set(i, N - 3, R[0]); pc.set(i, N - 4, R[1]); }
    const lit = kind === 'keyHi';
    pc.set(4, 10, lit ? 0x9fffb0 : 0x1e3a26); pc.set(5, 10, lit ? 0x7fd48a : 0x1a3222); pc.set(4, 11, lit ? 0x7fd48a : 0x1a3222); pc.set(5, 11, lit ? 0x3f8f58 : 0x14281a);
    pc.set(4, 9, R[0]); pc.set(5, 9, R[0]); pc.set(3, 10, R[0]); pc.set(3, 11, R[0]);
  } else {
    for (let y = 2; y < N - 2; y++) { pc.set(2, y, 0x7fd48a); pc.set(3, y, 0x3f8f58); }
  }
  const c = document.createElement('canvas'); c.width = N; c.height = N;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pc.data), N, N), 0, 0);
  return c.toDataURL();
}

const CSS = /* css */`
.shub { position: fixed; inset: 0; z-index: 4; image-rendering: pixelated; pointer-events: none; font-family: 'Body'; color: #cfe8d2; --g: #7fd48a; --gd: #3f8f58; --gh: #c9f5cf; --am: #d9a43a; --ink: #07090a;
  --fs: 22px; --fl: 22px; --fx: 48px; --u: clamp(1px, 0.1vh, 2px); }
.shub * { box-sizing: border-box; }
.shub .pe { pointer-events: auto; }
.shub .frame { border: 16px solid transparent; border-image: var(--steel) 8 fill / 16px stretch; image-rendering: pixelated; }
.shub .crt { border: 16px solid transparent; border-image: var(--crt) 8 fill / 16px stretch; image-rendering: pixelated; color: var(--g); text-shadow: 0 0 calc(4 * var(--u)) rgba(127,212,138,0.55); }
/* top strip */
.shub .top { position: absolute; left: 0; right: 0; top: 0; height: 72px; white-space: nowrap; display: flex; align-items: stretch; gap: calc(8 * var(--u)); padding: 0 calc(10 * var(--u));
  border: 16px solid transparent; border-image: var(--steel) 8 fill / 16px stretch; image-rendering: pixelated; transition: transform 500ms cubic-bezier(.3,1.4,.5,1); }
.shub .top.off { transform: translateY(-120%); }
.shub .top .id { display: flex; align-items: center; gap: calc(10 * var(--u)); padding-right: calc(14 * var(--u)); border-right: calc(2 * var(--u)) solid #15191b; }
.shub .top .id canvas { width: calc(34 * var(--u)); height: calc(34 * var(--u)); }
.shub .top .id .n { font-family: 'Title'; font-size: 24px; color: #e4e0cf; line-height: 1; }
.shub .top .id .r { font-family: 'Body'; font-size: 22px; color: #8e968c; }
.shub .top .loc { flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; padding: 0 12px; font-size: 22px; white-space: nowrap; }
.shub .top .loc b { color: var(--gh); font-weight: normal; }
.shub .top .loc .sep { color: var(--gd); margin: 0 calc(10 * var(--u)); }
.shub .top .vit { display: flex; gap: calc(6 * var(--u)); align-items: center; }
.shub .top .v { display: flex; flex-direction: column; justify-content: center; min-width: 96px; padding: 0 8px; height: 100%; }
.shub .top .v .k { font-family: 'Body'; font-size: 11px; color: #6f8a74; display: flex; align-items: center; gap: calc(4 * var(--u)); }
.shub .top .v .k i { display: inline-block; width: calc(6 * var(--u)); height: calc(6 * var(--u)); background: var(--g); box-shadow: 0 0 calc(5 * var(--u)) var(--g); }
.shub .top .v .k i.w { background: var(--am); box-shadow: 0 0 calc(5 * var(--u)) var(--am); }
.shub .top .v .x { font-size: var(--fl); line-height: 1; color: var(--gh); }
.shub .top .clock { font-size: var(--fl); padding: 0 calc(12 * var(--u)); display: flex; flex-direction: column; justify-content: center; }
.shub .top .clock .k { font-family: 'Body'; font-size: 11px; color: #6f8a74; }
/* room tags */
.shub .tag { position: absolute; left: 0; top: 0; transform-origin: 0 100%; display: flex; flex-direction: column; align-items: flex-start; transition: opacity 250ms; white-space: nowrap; }
.shub .tag .b { display: flex; align-items: center; gap: calc(6 * var(--u)); padding: calc(3 * var(--u)) calc(9 * var(--u)) calc(3 * var(--u)) calc(7 * var(--u)); border: 16px solid transparent; border-image: var(--tag) 8 fill / 16px stretch; image-rendering: pixelated; }
.shub .tag .c { font-family: 'Body'; font-size: 22px; color: var(--gd); }
.shub .tag .n { font-family: 'Title'; font-size: 24px; color: #d8dccd; }
.shub .tag .ln { position: relative; width: calc(2 * var(--u)); height: calc(26 * var(--u)); background: linear-gradient(rgba(127,212,138,0.85), rgba(127,212,138,0.35)); }
.shub .tag .ln::after { content: ''; position: absolute; left: calc(-3 * var(--u)); bottom: calc(-4 * var(--u)); width: calc(8 * var(--u)); height: calc(8 * var(--u)); border: calc(2 * var(--u)) solid var(--g); box-sizing: border-box; background: rgba(10,30,14,0.6); }
.shub .tag.below { flex-direction: column-reverse; }
.shub .tag.below .ln { background: linear-gradient(rgba(127,212,138,0.35), rgba(127,212,138,0.85)); }
.shub .tag.below .ln::after { bottom: auto; top: calc(-4 * var(--u)); }
.shub .tag.h .b { border-image: var(--keyHi) 8 fill / 16px stretch; image-rendering: pixelated; }
.shub .tag.h .n { color: var(--gh); } .shub .tag.h .c { color: var(--g); }
.shub .tag.dim { opacity: 0; }
/* hover card */
.shub .card { position: absolute; width: calc(300 * var(--u)); padding: calc(10 * var(--u)) calc(12 * var(--u)); opacity: 0; transform: translateY(calc(6 * var(--u))); transition: opacity 140ms, transform 160ms; }
.shub .card.on { opacity: 1; transform: none; }
.shub .card .h { display: flex; justify-content: space-between; align-items: baseline; }
.shub .card .h .n { font-family: 'Title'; font-size: 24px; color: #e4e0cf; }
.shub .card .h .k { font-family: 'Body'; font-size: 22px; color: #1c2a20; background: var(--g); padding: 0 calc(5 * var(--u)); }
.shub .card .d { font-family: 'Body'; font-size: 22px; color: #8e968c; margin-top: calc(2 * var(--u)); }
.shub .card .ro { margin-top: calc(8 * var(--u)); padding: calc(6 * var(--u)) calc(8 * var(--u)); font-size: var(--fs); line-height: 1.25; }
.shub .card .ro div { display: flex; justify-content: space-between; gap: calc(10 * var(--u)); }
.shub .card .ro span:last-child { color: var(--gh); }
.shub .card .go { margin-top: calc(8 * var(--u)); font-family: 'Body'; font-size: 22px; color: var(--g); }
/* room panel */
.shub .panel { position: absolute; right: calc(18 * var(--u)); top: calc(76 * var(--u)); width: calc(400 * var(--u)); padding: calc(14 * var(--u)) calc(16 * var(--u)); transform: translateX(120%); transition: transform 420ms cubic-bezier(.3,1.25,.5,1); }
.shub .panel.on { transform: none; }
.shub .panel .code { font-family: 'Body'; font-size: 22px; color: var(--gd); }
.shub .panel .n { font-family: 'Title'; font-size: 48px; color: #ece8d8; line-height: 1.05; margin: calc(2 * var(--u)) 0 calc(4 * var(--u)); }
.shub .panel .role { font-size: var(--fl); color: #a9b3a5; line-height: 1.15; }
.shub .panel .ro { margin: calc(12 * var(--u)) 0; padding: calc(8 * var(--u)) calc(10 * var(--u)); font-size: var(--fl); line-height: 1.2; min-height: calc(60 * var(--u)); }
.shub .panel .ro div { display: flex; justify-content: space-between; }
.shub .panel .ro span:last-child { color: var(--gh); }
.shub .keys { display: flex; flex-direction: column; gap: calc(6 * var(--u)); }
.shub .key { position: relative; display: flex; align-items: center; gap: calc(10 * var(--u)); padding: calc(8 * var(--u)) calc(12 * var(--u)) calc(8 * var(--u)) calc(18 * var(--u)); cursor: pointer;
  border: 16px solid transparent; border-image: var(--key) 8 fill / 16px stretch; image-rendering: pixelated; font-family: 'Title'; font-size: 24px; color: #d8dccd;
  transition: transform 60ms; user-select: none; }
.shub .key:hover { border-image: var(--keyHi) 8 fill / 16px stretch; image-rendering: pixelated; color: #f0f6ee; }
.shub .key:active { transform: translateY(calc(2 * var(--u))); }
.shub .key .hk { margin-left: auto; font-family: 'Body'; font-size: 11px; color: #1c2a20; background: var(--gd); padding: 0 calc(5 * var(--u)); }
.shub .key:hover .hk { background: var(--g); }
.shub .key.pri { font-size: 24px; }
.shub .key.dis { cursor: default; color: #6c726c; } .shub .key.dis .hk { background: #3a403a; }
.shub .key .why { position: absolute; left: calc(18 * var(--u)); bottom: calc(-2 * var(--u)); font-family: 'Body'; font-size: 11px; color: var(--am); }
.shub .back { position: absolute; left: calc(18 * var(--u)); top: calc(76 * var(--u)); display: none; }
.shub .back.on { display: flex; }
/* dock */
.shub .dock { position: absolute; left: 50%; bottom: calc(14 * var(--u)); transform: translateX(-50%); display: flex; gap: calc(4 * var(--u)); padding: calc(6 * var(--u)); transition: transform 500ms cubic-bezier(.3,1.4,.5,1); }
.shub .dock.off { transform: translate(-50%, 180%); }
.shub .dock .d { display: flex; flex-direction: column; align-items: center; min-width: calc(92 * var(--u)); padding: calc(5 * var(--u)) calc(8 * var(--u)); cursor: pointer; border: 16px solid transparent; border-image: var(--key) 8 fill / 16px stretch; image-rendering: pixelated; }
.shub .dock .d:hover, .shub .dock .d.h { border-image: var(--keyHi) 8 fill / 16px stretch; image-rendering: pixelated; }
.shub .dock .d.on { border-image: var(--keyHi) 8 fill / 16px stretch; image-rendering: pixelated; transform: translateY(calc(-4 * var(--u))); }
.shub .dock .d .c { font-family: 'Body'; font-size: 11px; color: var(--gd); }
.shub .dock .d .n { font-family: 'Title'; font-size: 24px; color: #d8dccd; }
/* title */
.shub .title { position: absolute; left: calc(56 * var(--u)); bottom: calc(64 * var(--u)); width: calc(520 * var(--u)); transition: opacity 600ms, transform 600ms; }
.shub .title.off { opacity: 0; transform: translateX(calc(-30 * var(--u))); pointer-events: none !important; }
.shub .title .pre { font-family: 'Body'; font-size: 22px; color: #9aa49a; }
.shub .title .big { font-family: 'TitleXL'; font-size: 64px; color: #ece8d8; line-height: 1; margin: calc(6 * var(--u)) 0; text-shadow: 0 calc(3 * var(--u)) 0 #07090a; }
.shub .title .sub { font-size: var(--fl); color: var(--g); text-shadow: 0 0 calc(4 * var(--u)) rgba(127,212,138,0.5); margin-bottom: calc(18 * var(--u)); }
.shub .title .keys { width: calc(340 * var(--u)); }
.shub .title .hint { margin-top: calc(14 * var(--u)); font-family: 'Body'; font-size: 22px; color: #6f7a70; }
/* settings */
.shub .over { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: calc(560 * var(--u)); padding: calc(18 * var(--u)) calc(22 * var(--u)); display: none; }
.shub .over.on { display: block; animation: shub-in 260ms cubic-bezier(.3,1.4,.5,1); }
@keyframes shub-in { 0% { transform: translate(-50%, -46%); opacity: 0; } 100% { transform: translate(-50%, -50%); opacity: 1; } }
.shub .over .n { font-family: 'Title'; font-size: 24px; color: #ece8d8; margin-bottom: calc(12 * var(--u)); }
.shub .over .row { display: flex; align-items: center; gap: calc(10 * var(--u)); margin: calc(8 * var(--u)) 0; font-size: var(--fl); }
.shub .over .row .l { flex: 0 0 calc(150 * var(--u)); font-family: 'Body'; font-size: 22px; color: #9aa49a; }
.shub .over .row .opts { display: flex; gap: calc(4 * var(--u)); }
.shub .over .row .opts .key { padding: calc(4 * var(--u)) calc(10 * var(--u)); }
.shub .over .row .opts .key.sel { border-image: var(--keyHi) 8 fill / 16px stretch; image-rendering: pixelated; color: var(--gh); }
.shub .over input[type=range] { flex: 1; accent-color: #7fd48a; }
.shub .over .foot { display: flex; justify-content: space-between; margin-top: calc(14 * var(--u)); gap: calc(8 * var(--u)); }
.shub.hide > * { visibility: hidden; }
.shub .khint { position: absolute; left: 0; top: 0; display: none; flex-direction: column; gap: 2px; padding: 4px 10px; border: 16px solid transparent; border-image: var(--keyHi) 8 fill / 16px stretch; font-family: 'Title'; font-size: 24px; color: #e8f4e6; pointer-events: none; }
.shub .khint.on { display: flex; }
.shub .khint .go { font-family: 'Body'; font-size: 11px; color: #7fd48a; }
`;

let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  const r = document.documentElement.style;
  for (const k of ['steel', 'crt', 'key', 'keyHi', 'tag', 'amber'] as const) r.setProperty('--' + k, `url(${plate(k)})`);
}
const div = (cls: string, parent: HTMLElement, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };

/** the UNAA roundel, painted: a white globe grid over the two continents' blue */
function emblem(): HTMLCanvasElement {
  const [c, g] = canvas(68, 68), R = 30;
  g.fillStyle = '#e8e4d4'; g.beginPath(); g.arc(34, 34, R + 3, 0, 7); g.fill();
  g.fillStyle = '#1d3b5a'; g.beginPath(); g.arc(34, 34, R, 0, 7); g.fill();
  g.strokeStyle = 'rgba(232,228,212,0.7)'; g.lineWidth = 1.5;
  for (const k of [-0.5, 0, 0.5]) { g.beginPath(); g.ellipse(34, 34, R * Math.cos(k * 1.4) * 0.999 + 0.01, R, 0, 0, 7); g.stroke(); }
  for (const y of [-14, 0, 14]) { const w = Math.sqrt(R * R - y * y); g.beginPath(); g.moveTo(34 - w, 34 + y); g.lineTo(34 + w, 34 + y); g.stroke(); }
  g.fillStyle = '#d9a43a'; g.beginPath(); g.moveTo(34, 14); g.lineTo(39, 34); g.lineTo(34, 54); g.lineTo(29, 34); g.fill();
  return c;
}

export class HubChrome {
  readonly root: HTMLDivElement;
  private top: HTMLElement; private locEl: HTMLElement; private clockEl: HTMLElement; private vit: Record<string, HTMLElement> = {};
  private tags = {} as Record<RoomId, HTMLElement>;
  private card: HTMLElement; private panel: HTMLElement; private back: HTMLElement; private dock: HTMLElement; private titleEl: HTMLElement; private over: HTMLElement;
  private dockBtns = {} as Record<RoomId, HTMLElement>;
  private mode = 'exterior'; private room: RoomId | null = null; private hov: RoomId | null = null;
  private titleKeys: RoomAction[] = [];
  private v = new THREE.Vector3();
  private shown = true;
  constructor(readonly hub: ShipHub, readonly o: { hasSave: boolean; fromPlanet: boolean }) {
    style();
    this.root = div('shub', ui());
    // ---- the top strip
    this.top = div('top pe', this.root);
    const id = div('id', this.top); id.appendChild(emblem());
    div('', id, `<div class="n">${SHIP_NAME}</div><div class="r">${SHIP_REG}</div>`);
    this.locEl = div('loc crt', this.top);
    this.clockEl = div('clock', this.top);
    const vit = div('vit', this.top);
    for (const [k, lab] of [['pwr', 'REACTOR'], ['o2', 'O2'], ['hull', 'HULL'], ['crew', 'CREW']]) { const v = div('v', vit, `<div class="k"><i></i>${lab}</div><div class="x">--</div>`); this.vit[k] = v; }
    // ---- room tags
    for (const rid of ROOM_IDS) {
      const t = div('tag pe', this.root, `<div class="b"><span class="c">${ROOMS[rid].code}</span><span class="n">${ROOMS[rid].name}</span></div><div class="ln"></div>`);
      t.addEventListener('pointerenter', () => { if (this.mode === 'overview') this.hub.chrome.hover(rid, 0, 0, true); });
      t.addEventListener('pointerleave', () => { if (this.mode === 'overview') this.hub.chrome.hover(null, 0, 0, true); });
      t.addEventListener('click', (e) => { e.stopPropagation(); csfx('button', 0.5); this.hub.open(rid); });
      this.tags[rid] = t;
    }
    this.card = div('card frame', this.root);
    // ---- the panel and the back key
    this.panel = div('panel frame pe', this.root);
    this.back = div('back key pe', this.root, '◀ OVERVIEW <span class="hk">ESC</span>');
    this.back.addEventListener('click', (e) => { e.stopPropagation(); csfx('tick', 0.6); this.hub.overview(); });
    // ---- the dock
    this.dock = div('dock frame pe', this.root);
    for (const rid of ROOM_IDS.slice().sort((a, b) => Number(ROOMS[a].code) - Number(ROOMS[b].code))) {
      const d = div('d', this.dock, `<span class="c">${ROOMS[rid].code}</span><span class="n">${ROOMS[rid].short}</span>`);
      d.addEventListener('click', (e) => { e.stopPropagation(); csfx('button', 0.5); this.hub.open(rid); });
      d.addEventListener('pointerenter', () => { csfx('hover', 0.3); });
      this.dockBtns[rid] = d;
    }
    // ---- the title plate
    this.titleEl = div('title pe', this.root);
    this.titleKeys = [];
    if (o.hasSave) this.titleKeys.push({ id: 'continue', label: 'CONTINUE', key: 'C', primary: true, run: () => this.hub.opts.onContinue ? this.hub.opts.onContinue() : this.hub.board() });
    this.titleKeys.push({ id: 'new', label: 'NEW MISSION', key: 'N', primary: !o.hasSave, run: () => this.hub.opts.onNew ? this.hub.opts.onNew() : this.hub.board() });
    this.titleKeys.push({ id: 'settings', label: 'SETTINGS', key: 'O', run: () => this.openSettings() });
    this.titleEl.innerHTML = `<div class="pre">UNAA COLONY PROGRAM</div><div class="big">${SHIP_NAME}</div><div class="sub">${SHIP_REG} · HIGH ORBIT · KEPLER-442 ARM</div>`;
    const tk = div('keys', this.titleEl); this.keys(tk, this.titleKeys);
    div('hint', this.titleEl, 'ENTER  BOARD');
    // ---- settings
    this.over = div('over frame pe', this.root);
    const keyH = (e: KeyboardEvent) => {
      if (this.mode === 'exterior' && !this.over.classList.contains('on')) { const k = this.titleKeys.find((a) => a.key?.toLowerCase() === e.key.toLowerCase()); if (k) { csfx('button', 0.5); k.run(); } }
      else if (this.mode === 'room' && this.room && !e.ctrlKey && !e.metaKey) { const k = this.hub.getActions(this.room).find((a) => a.key?.toLowerCase() === e.key.toLowerCase()); if (k && !k.disabled?.()) { csfx('button', 0.5); k.run(); } }
    };
    addEventListener('keydown', keyH); this.offKey = () => removeEventListener('keydown', keyH);
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  private offKey: () => void;
  private hintEl: HTMLElement | null = null;
  /** the key prop's hint at the pointer (null hides it) */
  keyHint(label: string | null, x: number, y: number) {
    if (!this.hintEl) this.hintEl = div('khint', this.root);
    const e = this.hintEl;
    if (!label) { e.classList.remove('on'); return; }
    e.innerHTML = `<span>${label}</span><span class="go">CLICK TO USE</span>`;
    e.style.transform = `translate(${Math.round(Math.min(innerWidth - 420, x + 24))}px, ${Math.round(y + 20)}px)`;
    e.classList.add('on');
  }
  titleDefault() { this.titleKeys[0]?.run(); }

  private keys(parent: HTMLElement, acts: RoomAction[]) {
    parent.innerHTML = '';
    for (const a of acts) {
      const k = div('key' + (a.primary ? ' pri' : ''), parent, `<span>${a.label}</span>${a.key ? `<span class="hk">${a.key}</span>` : ''}`);
      const why = a.disabled?.();
      if (why) { k.classList.add('dis'); div('why', k, why); }
      k.addEventListener('click', (e) => { e.stopPropagation(); if (a.disabled?.()) { csfx('tick', 0.4); return; } csfx('button', 0.6); a.run(); });
      k.addEventListener('pointerenter', () => csfx('hover', 0.3));
    }
  }

  // ---------------------------------------------------------------- modes
  setMode(m: string, room: RoomId | null = null) {
    this.mode = m; this.room = room;
    const inside = m === 'overview' || m === 'room';
    this.top.classList.toggle('off', !inside && m !== 'boarding');
    this.dock.classList.toggle('off', !inside);
    this.titleEl.classList.toggle('off', m !== 'exterior');
    this.back.classList.toggle('on', m === 'room');
    for (const id of ROOM_IDS) this.dockBtns[id].classList.toggle('on', id === room);
    if (m !== 'room') this.closePanel();
    this.loc();
  }
  private loc() {
    const r = this.room ? ROOMS[this.room] : null;
    this.locEl.innerHTML = `D1<span class="sep">›</span>${r ? `<b>${r.name}</b>` : this.mode === 'boarding' ? 'BOARDING' : '<b>SHIP OVERVIEW</b>'}${this.o.fromPlanet ? '<span class="sep">·</span>AI LINK FROM SURFACE' : ''}`;
  }
  openPanel(id: RoomId, acts: RoomAction[]) {
    const r = ROOMS[id];
    this.panel.innerHTML = `<div class="code">${r.deck} · ${r.code}</div><div class="n">${r.name}</div><div class="role">${r.role}</div><div class="ro crt">${this.readout(id, 4)}</div>`;
    const k = div('keys', this.panel); this.keys(k, acts);
    this.panel.classList.add('on');
  }
  closePanel() { this.panel.classList.remove('on'); }
  closeOverlay() { if (this.over.classList.contains('on')) { this.over.classList.remove('on'); csfx('tick', 0.5); return true; } return false; }
  visible(on: boolean) { this.shown = on; this.root.classList.toggle('hide', !on); }

  /** the live lines for a room's readout */
  readout(id: RoomId, n = 3) {
    const t = this.hub.engine.time;
    const L: Record<RoomId, [string, string][]> = {
      bridge: [['ORBIT', '412 KM'], ['VELOCITY', '7.42 KM/S'], ['TARGETS', '5 WORLDS'], ['MONITOR', 'READY']],
      lab: [['SEQUENCER', 'IDLE'], ['TANKS', '3 / 3 LIVE'], ['SAMPLES', '24'], ['HULL 14', 'NOMINAL']],
      medbay: [['BEDS', '0 / 2'], ['CREW HEALTH', '100%'], ['SCANNER', 'CALIBRATED'], ['STOCK', 'FULL']],
      core: [['UNIT 07', 'ONLINE'], ['MEMORY', '96.1%'], ['UPLINK', 'LOCKED'], ['UPTIME', `${(412 + t / 3600).toFixed(1)} D`]],
      quarters: [['BUNKS', '8'], ['OCCUPIED', '3'], ['LOCKERS', '8'], ['LIGHTS', '22:00']],
      workshop: [['POD', 'READY'], ['CRANE', 'PARKED'], ['BAY HATCH', 'SEALED'], ['TOOLS', '42 / 42']],
      mess: [['GALLEY', 'OVEN 2 ON'], ['RATIONS', '214 D'], ['COFFEE', 'FRESH'], ['NEXT MEAL', '18:30']],
      cargo: [['HOLD', '61%'], ['CRATES', '48'], ['SPECIMENS', '2 SEALED'], ['MASS', '31.4 T']],
      engineering: [['REACTOR', `${(98 + Math.sin(t * 0.2)).toFixed(1)}%`], ['OUTPUT', `${(620 + Math.sin(t) * 12).toFixed(0)} MW`], ['COOLANT', 'NOMINAL'], ['LIFE SUPPORT', 'GREEN']],
    };
    return L[id].slice(0, n).map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join('');
  }

  // ---------------------------------------------------------------- hover
  hover(id: RoomId | null, x: number, y: number, fromTag = false) {
    if (fromTag && id !== this.hov) { this.hov = id; if (id) csfx('hover', 0.3); }
    else if (!fromTag) this.hov = id;
    for (const r of ROOM_IDS) { this.tags[r].classList.toggle('h', r === this.hov); this.dockBtns[r].classList.toggle('h', r === this.hov); }
    if (!this.hov || this.mode === 'exterior' || this.mode === 'boarding') { this.card.classList.remove('on'); return; }
    const r = ROOMS[this.hov];
    this.card.innerHTML = `<div class="h"><span class="n">${r.name}</span><span class="k">${r.code.slice(1)}</span></div><div class="d">${r.deck} · ${r.role}</div><div class="ro crt">${this.readout(this.hov, 3)}</div><div class="go">CLICK TO ENTER</div>`;
    if (!fromTag) {
      const W = this.card.offsetWidth || 320, H = this.card.offsetHeight || 180;
      let cx = x + 22, cy = y + 18;
      if (cx + W > innerWidth - 12) cx = x - W - 22;
      if (cy + H > innerHeight - 90) cy = innerHeight - 90 - H;
      this.card.style.left = cx + 'px'; this.card.style.top = cy + 'px';
    } else {
      const t = this.tags[this.hov].getBoundingClientRect();
      this.card.style.left = Math.min(innerWidth - 340, t.left) + 'px'; this.card.style.top = (t.bottom + 8) + 'px';
    }
    this.card.classList.add('on');
  }

  // ---------------------------------------------------------------- settings
  openSettings() {
    const o = this.over; o.innerHTML = '';
    div('n', o, 'SETTINGS · UNIT 07');
    const slider = (lab: string, key: 'master' | 'music' | 'sfx') => {
      const r = div('row', o); div('l', r, lab);
      const i = document.createElement('input'); i.type = 'range'; i.min = '0'; i.max = '1'; i.step = '0.05'; i.value = String(settings[key]); r.appendChild(i);
      const v = div('', r, Math.round(settings[key] * 100) + '');
      i.addEventListener('input', () => { setSettings({ [key]: Number(i.value) } as any); v.textContent = Math.round(Number(i.value) * 100) + ''; });
    };
    slider('MASTER', 'master'); slider('MUSIC', 'music'); slider('EFFECTS', 'sfx');
    const opts = <T,>(lab: string, vals: [T, string][], get: () => T, set: (v: T) => void) => {
      const r = div('row', o); div('l', r, lab); const b = div('opts', r);
      const draw = () => { b.innerHTML = ''; for (const [v, s] of vals) { const k = div('key' + (get() === v ? ' sel' : ''), b, s); k.addEventListener('click', (e) => { e.stopPropagation(); csfx('switch', 0.5); set(v); draw(); }); } };
      draw();
    };
    opts<Quality>('GRAPHICS', [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']], () => settings.quality, (v) => setSettings({ quality: v }));
    opts<number>('UI SCALE', [[0, 'AUTO'], [2, '2'], [3, '3'], [4, '4']], () => settings.uiScale, (v) => setSettings({ uiScale: v }));
    opts<boolean>('SCREEN SHAKE', [[true, 'ON'], [false, 'OFF']], () => settings.shake, (v) => setSettings({ shake: v }));
    const f = div('foot', o);
    const rs = div('key', f, 'DEFAULTS'); rs.addEventListener('click', (e) => { e.stopPropagation(); resetSettings(); this.openSettings(); });
    const cl = div('key', f, 'CLOSE <span class="hk">ESC</span>'); cl.addEventListener('click', (e) => { e.stopPropagation(); this.closeOverlay(); });
    o.classList.add('on'); csfx('cover', 0.5);
  }

  // ---------------------------------------------------------------- frame
  private acc = 0;
  private u() { return Math.max(1, Math.min(2, innerHeight / 1000)); }
  update(dt: number, t: number, cam: THREE.PerspectiveCamera) {
    if (!this.shown) return;
    // room tags: an annotated cutaway. Starboard rooms and the bridge are named above the ship, port rooms below,
    // each with a leader line down (or up) to the room
    const show = this.mode === 'overview';
    for (const id of ROOM_IDS) {
      const r = ROOMS[id], tag = this.tags[id], up = r.x0 >= 0 || id === 'bridge';
      const zc = (r.z0 + r.z1) / 2;
      this.v.set(id === 'bridge' ? 0 : (r.x0 + r.x1) / 2, 0.6, id === 'bridge' ? 22 : zc).project(cam);
      const ax = (this.v.x * 0.5 + 0.5) * innerWidth, ay = (-this.v.y * 0.5 + 0.5) * innerHeight, az = this.v.z;
      // the hull's edge beside the room: above the starboard rim, below the port keel
      this.v.set(up ? 10.9 : -10.9, up ? 3.6 : -3.4, id === 'bridge' ? 24 : zc).project(cam);
      const ey = (-this.v.y * 0.5 + 0.5) * innerHeight;
      const h = tag.offsetHeight || 40, w = tag.offsetWidth || 180;
      const lbY = up ? Math.max(76, ey - 18 - h) : Math.min(innerHeight - 110 - h, ey + 18);
      tag.classList.toggle('below', !up);
      const ln = tag.querySelector('.ln') as HTMLElement;
      const len = up ? Math.max(4, ay - (lbY + h)) : Math.max(4, lbY - ay);
      ln.style.height = Math.round(len) + 'px';
      const bx = Math.max(8, Math.min(innerWidth - w - 8, ax - 20));
      tag.style.transform = `translate(${Math.round(bx)}px, ${Math.round(up ? lbY : ay)}px)`;
      ln.style.marginLeft = Math.round(ax - bx - 1) + 'px';
      tag.classList.toggle('dim', !show || az > 1);
    }
    this.acc += dt;
    if (this.acc > 0.5) {
      this.acc = 0;
      const day = 412 + Math.floor(t / 600), mins = Math.floor((t * 4) % 1440);
      this.clockEl.innerHTML = `<div class="k">MISSION DAY ${day}</div><div>${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')} SHIP</div>`;
      const set = (k: string, v: string, warn = false) => { const e = this.vit[k]; e.querySelector('.x')!.textContent = v; e.querySelector('i')!.classList.toggle('w', warn); };
      set('pwr', `${(98 + Math.sin(t * 0.2)).toFixed(0)}%`); set('o2', this.hub.alarmOn ? '17.2%' : '20.9%', this.hub.alarmOn); set('hull', this.hub.alarmOn ? 'BREACH' : '100%', this.hub.alarmOn); set('crew', '8 / 8');
      if (this.mode === 'room' && this.room && this.panel.classList.contains('on')) { const ro = this.panel.querySelector('.ro'); if (ro) ro.innerHTML = this.readout(this.room, 4); }
    }
  }
  dispose() { this.offKey(); this.root.remove(); }
}
