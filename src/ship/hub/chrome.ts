// The hub's machine UI: worn gunmetal housings with screwed corners and phosphor glass, painted in code at the
// screen's own resolution (9-slice frames, so every plate stays crisp at any size). The top status strip (ship,
// mission clock, where you are, ship vitals), floating room tags over the cutaway, the hover card, the room panel
// with its function keys, the room dock along the bottom, the exterior title plate and the settings plate.
import * as THREE from 'three';
import type { ShipHub } from './hub';
import { ROOMS, ROOM_IDS, SHIP_BOX, SHIP_NAME, SHIP_REG, type RoomId } from './layout';
import { canvas, rgb, rgba, shade, screw } from './tex';
import { csfx } from '../../ui/cineAudio';
import { settings, setSettings, resetSettings, type Quality } from '../../settings';
import { ui } from '../../ui/kit';

export interface RoomAction { id: string; label: string; key?: string; run: () => void; disabled?: () => string | false; primary?: boolean; hint?: string }

// ------------------------------------------------------------------ painted frames
function plate(kind: 'steel' | 'crt' | 'key' | 'keyHi' | 'tag' | 'amber'): string {
  const S = 2, W = 48 * S, [c, g] = canvas(W, W), r = 12 * S;
  const base = kind === 'crt' ? 0x0a140e : kind === 'tag' ? 0x1a1f1c : kind === 'amber' ? 0x2a2214 : kind.startsWith('key') ? (kind === 'keyHi' ? 0x2f4a36 : 0x2a2f2c) : 0x262b2e;
  // outer ink line, bevel lights and shadows, the face
  g.fillStyle = rgb(0x07090a); g.fillRect(0, 0, W, W);
  g.fillStyle = rgb(shade(base, kind === 'crt' ? 3.2 : 1.9)); g.fillRect(S, S, W - 2 * S, W - 2 * S);
  g.fillStyle = rgb(shade(base, 0.55)); g.fillRect(2 * S, 2 * S, W - 3 * S, W - 3 * S);
  g.fillStyle = rgb(base); g.fillRect(2 * S, 2 * S, W - 4 * S, W - 4 * S);
  // brushed grain across the face
  for (let i = 0; i < 260; i++) { g.fillStyle = rgba(i % 2 ? 0xffffff : 0x000000, 0.035); g.fillRect(2 * S + Math.random() * (W - 4 * S), 2 * S + Math.random() * (W - 4 * S), 6 * S, S * 0.5); }
  if (kind === 'crt') {
    // phosphor glass: scanlines, an inner shadow
    for (let y = 0; y < W; y += 2) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(2 * S, y, W - 4 * S, 1); }
    const ig = g.createLinearGradient(0, 2 * S, 0, 8 * S); ig.addColorStop(0, 'rgba(0,0,0,0.5)'); ig.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = ig; g.fillRect(2 * S, 2 * S, W - 4 * S, 6 * S);
    g.fillStyle = rgba(0x7fd48a, 0.25); g.fillRect(2 * S, W - 3 * S, W - 4 * S, S);
  } else if (kind === 'steel' || kind === 'amber') {
    // a raised rim with a groove, screws in the corners
    g.fillStyle = rgb(shade(base, 1.45)); g.fillRect(4 * S, 4 * S, W - 8 * S, S);
    g.fillStyle = rgb(shade(base, 0.6)); g.fillRect(4 * S, 5 * S, W - 8 * S, S * 0.5);
    for (const [x, y] of [[7 * S, 7 * S], [W - 7 * S, 7 * S], [7 * S, W - 7 * S], [W - 7 * S, W - 7 * S]]) screw(g, x, y, 2.2 * S, shade(base, 1.6), x + y);
    if (kind === 'amber') { g.fillStyle = rgb(0xd9a43a); g.fillRect(2 * S, 2 * S, 3 * S, W - 4 * S); }
  } else if (kind.startsWith('key')) {
    const hi = kind === 'keyHi';
    g.fillStyle = rgb(shade(base, hi ? 1.6 : 1.5)); g.fillRect(2 * S, 2 * S, W - 4 * S, S);
    g.fillStyle = rgb(shade(base, 0.5)); g.fillRect(2 * S, W - 4 * S, W - 4 * S, 2 * S);
    g.fillStyle = rgb(hi ? 0x7fd48a : 0x3f8f58); g.fillRect(4 * S, W / 2 - 3 * S, 2 * S, 6 * S);
  } else {
    g.fillStyle = rgb(0x7fd48a); g.fillRect(2 * S, 2 * S, 2 * S, W - 4 * S);
  }
  void r;
  return c.toDataURL();
}

const CSS = /* css */`
.shub { position: fixed; inset: 0; z-index: 4; pointer-events: none; font-family: 'VT', monospace; color: #cfe8d2; --g: #7fd48a; --gd: #3f8f58; --gh: #c9f5cf; --am: #d9a43a; --ink: #07090a;
  --fs: clamp(13px, 1.25vh, 22px); --fl: clamp(18px, 1.9vh, 34px); --fx: clamp(28px, 3.6vh, 62px); --u: clamp(1px, 0.1vh, 2px); }
.shub * { box-sizing: border-box; }
.shub .pe { pointer-events: auto; }
.shub .frame { border: calc(12 * var(--u)) solid transparent; border-image: var(--steel) 24 fill / calc(12 * var(--u)) stretch; }
.shub .crt { border: calc(6 * var(--u)) solid transparent; border-image: var(--crt) 24 fill / calc(6 * var(--u)) stretch; color: var(--g); text-shadow: 0 0 calc(4 * var(--u)) rgba(127,212,138,0.55); }
/* top strip */
.shub .top { position: absolute; left: 0; right: 0; top: 0; height: calc(58 * var(--u)); display: flex; align-items: stretch; gap: calc(8 * var(--u)); padding: 0 calc(10 * var(--u));
  border: calc(10 * var(--u)) solid transparent; border-image: var(--steel) 24 fill / calc(10 * var(--u)) stretch; transition: transform 500ms cubic-bezier(.3,1.4,.5,1); }
.shub .top.off { transform: translateY(-120%); }
.shub .top .id { display: flex; align-items: center; gap: calc(10 * var(--u)); padding-right: calc(14 * var(--u)); border-right: calc(2 * var(--u)) solid #15191b; }
.shub .top .id canvas { width: calc(34 * var(--u)); height: calc(34 * var(--u)); }
.shub .top .id .n { font-family: 'Superwide', monospace; font-size: var(--fl); letter-spacing: calc(3 * var(--u)); color: #e4e0cf; line-height: 1; }
.shub .top .id .r { font-family: 'Jersey', monospace; font-size: var(--fs); color: #8e968c; letter-spacing: calc(2 * var(--u)); }
.shub .top .loc { flex: 1; display: flex; align-items: center; padding: 0 calc(12 * var(--u)); font-size: var(--fl); }
.shub .top .loc b { color: var(--gh); font-weight: normal; }
.shub .top .loc .sep { color: var(--gd); margin: 0 calc(10 * var(--u)); }
.shub .top .vit { display: flex; gap: calc(6 * var(--u)); align-items: center; }
.shub .top .v { display: flex; flex-direction: column; justify-content: center; min-width: calc(86 * var(--u)); padding: 0 calc(8 * var(--u)); height: 100%; }
.shub .top .v .k { font-family: 'Jersey', monospace; font-size: calc(var(--fs) * 0.82); color: #6f8a74; letter-spacing: calc(2 * var(--u)); display: flex; align-items: center; gap: calc(4 * var(--u)); }
.shub .top .v .k i { display: inline-block; width: calc(6 * var(--u)); height: calc(6 * var(--u)); background: var(--g); box-shadow: 0 0 calc(5 * var(--u)) var(--g); }
.shub .top .v .k i.w { background: var(--am); box-shadow: 0 0 calc(5 * var(--u)) var(--am); }
.shub .top .v .x { font-size: var(--fl); line-height: 1; color: var(--gh); }
.shub .top .clock { font-size: var(--fl); padding: 0 calc(12 * var(--u)); display: flex; flex-direction: column; justify-content: center; }
.shub .top .clock .k { font-family: 'Jersey', monospace; font-size: calc(var(--fs) * 0.82); color: #6f8a74; letter-spacing: calc(2 * var(--u)); }
/* room tags */
.shub .tag { position: absolute; left: 0; top: 0; transform-origin: 0 100%; display: flex; flex-direction: column; align-items: flex-start; transition: opacity 250ms; white-space: nowrap; }
.shub .tag .b { display: flex; align-items: center; gap: calc(6 * var(--u)); padding: calc(3 * var(--u)) calc(9 * var(--u)) calc(3 * var(--u)) calc(7 * var(--u)); border: calc(5 * var(--u)) solid transparent; border-image: var(--tag) 24 fill / calc(5 * var(--u)) stretch; }
.shub .tag .c { font-family: 'Jersey', monospace; font-size: var(--fs); color: var(--gd); }
.shub .tag .n { font-family: 'Superwide', monospace; font-size: calc(var(--fs) * 0.95); letter-spacing: calc(2 * var(--u)); color: #d8dccd; }
.shub .tag .ln { position: relative; width: calc(2 * var(--u)); height: calc(26 * var(--u)); background: linear-gradient(rgba(127,212,138,0.85), rgba(127,212,138,0.35)); }
.shub .tag .ln::after { content: ''; position: absolute; left: calc(-3 * var(--u)); bottom: calc(-4 * var(--u)); width: calc(8 * var(--u)); height: calc(8 * var(--u)); border: calc(2 * var(--u)) solid var(--g); box-sizing: border-box; background: rgba(10,30,14,0.6); }
.shub .tag.below { flex-direction: column-reverse; }
.shub .tag.below .ln { background: linear-gradient(rgba(127,212,138,0.35), rgba(127,212,138,0.85)); }
.shub .tag.below .ln::after { bottom: auto; top: calc(-4 * var(--u)); }
.shub .tag.h .b { border-image: var(--keyHi) 24 fill / calc(5 * var(--u)) stretch; }
.shub .tag.h .n { color: var(--gh); } .shub .tag.h .c { color: var(--g); }
.shub .tag.dim { opacity: 0; }
/* hover card */
.shub .card { position: absolute; width: calc(300 * var(--u)); padding: calc(10 * var(--u)) calc(12 * var(--u)); opacity: 0; transform: translateY(calc(6 * var(--u))); transition: opacity 140ms, transform 160ms; }
.shub .card.on { opacity: 1; transform: none; }
.shub .card .h { display: flex; justify-content: space-between; align-items: baseline; }
.shub .card .h .n { font-family: 'Superwide', monospace; font-size: var(--fl); color: #e4e0cf; letter-spacing: calc(2 * var(--u)); }
.shub .card .h .k { font-family: 'Jersey', monospace; font-size: var(--fs); color: #1c2a20; background: var(--g); padding: 0 calc(5 * var(--u)); }
.shub .card .d { font-family: 'Jersey', monospace; font-size: var(--fs); color: #8e968c; letter-spacing: calc(1 * var(--u)); margin-top: calc(2 * var(--u)); }
.shub .card .ro { margin-top: calc(8 * var(--u)); padding: calc(6 * var(--u)) calc(8 * var(--u)); font-size: var(--fs); line-height: 1.25; }
.shub .card .ro div { display: flex; justify-content: space-between; gap: calc(10 * var(--u)); }
.shub .card .ro span:last-child { color: var(--gh); }
.shub .card .go { margin-top: calc(8 * var(--u)); font-family: 'Jersey', monospace; font-size: var(--fs); color: var(--g); letter-spacing: calc(2 * var(--u)); }
/* room panel */
.shub .panel { position: absolute; right: calc(18 * var(--u)); top: calc(76 * var(--u)); width: calc(400 * var(--u)); padding: calc(14 * var(--u)) calc(16 * var(--u)); transform: translateX(120%); transition: transform 420ms cubic-bezier(.3,1.25,.5,1); }
.shub .panel.on { transform: none; }
.shub .panel .code { font-family: 'Jersey', monospace; font-size: var(--fs); color: var(--gd); letter-spacing: calc(3 * var(--u)); }
.shub .panel .n { font-family: 'Superwide', monospace; font-size: var(--fx); color: #ece8d8; line-height: 1.05; letter-spacing: calc(2 * var(--u)); margin: calc(2 * var(--u)) 0 calc(4 * var(--u)); }
.shub .panel .role { font-size: var(--fl); color: #a9b3a5; line-height: 1.15; }
.shub .panel .ro { margin: calc(12 * var(--u)) 0; padding: calc(8 * var(--u)) calc(10 * var(--u)); font-size: var(--fl); line-height: 1.2; min-height: calc(60 * var(--u)); }
.shub .panel .ro div { display: flex; justify-content: space-between; }
.shub .panel .ro span:last-child { color: var(--gh); }
.shub .keys { display: flex; flex-direction: column; gap: calc(6 * var(--u)); }
.shub .key { position: relative; display: flex; align-items: center; gap: calc(10 * var(--u)); padding: calc(8 * var(--u)) calc(12 * var(--u)) calc(8 * var(--u)) calc(18 * var(--u)); cursor: pointer;
  border: calc(6 * var(--u)) solid transparent; border-image: var(--key) 24 fill / calc(6 * var(--u)) stretch; font-family: 'Superwide', monospace; font-size: var(--fs); letter-spacing: calc(2 * var(--u)); color: #d8dccd;
  transition: transform 60ms; user-select: none; }
.shub .key:hover { border-image: var(--keyHi) 24 fill / calc(6 * var(--u)) stretch; color: #f0f6ee; }
.shub .key:active { transform: translateY(calc(2 * var(--u))); }
.shub .key .hk { margin-left: auto; font-family: 'Jersey', monospace; color: #1c2a20; background: var(--gd); padding: 0 calc(5 * var(--u)); }
.shub .key:hover .hk { background: var(--g); }
.shub .key.pri { font-size: var(--fl); }
.shub .key.dis { cursor: default; color: #6c726c; } .shub .key.dis .hk { background: #3a403a; }
.shub .key .why { position: absolute; left: calc(18 * var(--u)); bottom: calc(-2 * var(--u)); font-family: 'Jersey', monospace; font-size: calc(var(--fs) * 0.8); color: var(--am); letter-spacing: calc(1 * var(--u)); }
.shub .back { position: absolute; left: calc(18 * var(--u)); top: calc(76 * var(--u)); display: none; }
.shub .back.on { display: flex; }
/* dock */
.shub .dock { position: absolute; left: 50%; bottom: calc(14 * var(--u)); transform: translateX(-50%); display: flex; gap: calc(4 * var(--u)); padding: calc(6 * var(--u)); transition: transform 500ms cubic-bezier(.3,1.4,.5,1); }
.shub .dock.off { transform: translate(-50%, 180%); }
.shub .dock .d { display: flex; flex-direction: column; align-items: center; min-width: calc(92 * var(--u)); padding: calc(5 * var(--u)) calc(8 * var(--u)); cursor: pointer; border: calc(5 * var(--u)) solid transparent; border-image: var(--key) 24 fill / calc(5 * var(--u)) stretch; }
.shub .dock .d:hover, .shub .dock .d.h { border-image: var(--keyHi) 24 fill / calc(5 * var(--u)) stretch; }
.shub .dock .d.on { border-image: var(--keyHi) 24 fill / calc(5 * var(--u)) stretch; transform: translateY(calc(-4 * var(--u))); }
.shub .dock .d .c { font-family: 'Jersey', monospace; font-size: calc(var(--fs) * 0.85); color: var(--gd); }
.shub .dock .d .n { font-family: 'Superwide', monospace; font-size: calc(var(--fs) * 0.82); color: #d8dccd; letter-spacing: calc(1 * var(--u)); }
/* title */
.shub .title { position: absolute; left: calc(56 * var(--u)); bottom: calc(64 * var(--u)); width: calc(520 * var(--u)); transition: opacity 600ms, transform 600ms; }
.shub .title.off { opacity: 0; transform: translateX(calc(-30 * var(--u))); pointer-events: none !important; }
.shub .title .pre { font-family: 'Jersey', monospace; font-size: var(--fl); color: #9aa49a; letter-spacing: calc(6 * var(--u)); }
.shub .title .big { font-family: 'Superwide', monospace; font-size: calc(var(--fx) * 1.55); color: #ece8d8; letter-spacing: calc(8 * var(--u)); line-height: 1; margin: calc(6 * var(--u)) 0; text-shadow: 0 calc(3 * var(--u)) 0 #07090a; }
.shub .title .sub { font-size: var(--fl); color: var(--g); text-shadow: 0 0 calc(4 * var(--u)) rgba(127,212,138,0.5); margin-bottom: calc(18 * var(--u)); }
.shub .title .keys { width: calc(340 * var(--u)); }
.shub .title .hint { margin-top: calc(14 * var(--u)); font-family: 'Jersey', monospace; font-size: var(--fs); color: #6f7a70; letter-spacing: calc(2 * var(--u)); }
/* settings */
.shub .over { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: calc(560 * var(--u)); padding: calc(18 * var(--u)) calc(22 * var(--u)); display: none; }
.shub .over.on { display: block; animation: shub-in 260ms cubic-bezier(.3,1.4,.5,1); }
@keyframes shub-in { 0% { transform: translate(-50%, -46%); opacity: 0; } 100% { transform: translate(-50%, -50%); opacity: 1; } }
.shub .over .n { font-family: 'Superwide', monospace; font-size: var(--fl); color: #ece8d8; letter-spacing: calc(4 * var(--u)); margin-bottom: calc(12 * var(--u)); }
.shub .over .row { display: flex; align-items: center; gap: calc(10 * var(--u)); margin: calc(8 * var(--u)) 0; font-size: var(--fl); }
.shub .over .row .l { flex: 0 0 calc(150 * var(--u)); font-family: 'Jersey', monospace; font-size: var(--fs); color: #9aa49a; letter-spacing: calc(2 * var(--u)); }
.shub .over .row .opts { display: flex; gap: calc(4 * var(--u)); }
.shub .over .row .opts .key { padding: calc(4 * var(--u)) calc(10 * var(--u)); }
.shub .over .row .opts .key.sel { border-image: var(--keyHi) 24 fill / calc(6 * var(--u)) stretch; color: var(--gh); }
.shub .over input[type=range] { flex: 1; accent-color: #7fd48a; }
.shub .over .foot { display: flex; justify-content: space-between; margin-top: calc(14 * var(--u)); gap: calc(8 * var(--u)); }
.shub.hide > * { visibility: hidden; }
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
    div('', id, `<div class="n">${SHIP_NAME}</div><div class="r">${SHIP_REG} · UNAA COLONY PROGRAM</div>`);
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
    this.locEl.innerHTML = `DECK 1<span class="sep">›</span>${r ? `<b>${r.name}</b>` : this.mode === 'boarding' ? 'BOARDING' : '<b>SHIP OVERVIEW</b>'}${this.o.fromPlanet ? '<span class="sep">·</span>AI LINK FROM SURFACE' : ''}`;
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
    let top = Infinity, bot = -Infinity;
    for (const x of [SHIP_BOX.min.x, SHIP_BOX.max.x]) for (const y of [SHIP_BOX.min.y, SHIP_BOX.max.y]) for (const z of [SHIP_BOX.min.z, SHIP_BOX.max.z]) {
      this.v.set(x, y, z).project(cam); const sy = (-this.v.y * 0.5 + 0.5) * innerHeight; top = Math.min(top, sy); bot = Math.max(bot, sy);
    }
    top = Math.max(top, 70 * this.u()); bot = Math.min(bot, innerHeight - 110 * this.u());
    for (const id of ROOM_IDS) {
      const r = ROOMS[id], tag = this.tags[id], up = r.x0 >= 0 || id === 'bridge';
      this.v.set((r.x0 + r.x1) / 2 + (id === 'bridge' ? 0 : 0), 0.6, (r.z0 + r.z1) / 2).project(cam);
      const ax = (this.v.x * 0.5 + 0.5) * innerWidth, ay = (-this.v.y * 0.5 + 0.5) * innerHeight;
      const h = tag.offsetHeight || 30, lbY = up ? top - 10 * this.u() - h : bot + 10 * this.u();
      tag.classList.toggle('below', !up);
      const ln = tag.querySelector('.ln') as HTMLElement;
      const len = up ? Math.max(4, ay - (lbY + h)) : Math.max(4, lbY - ay);
      ln.style.height = len.toFixed(0) + 'px';
      const bx = Math.max(8, Math.min(innerWidth - (tag.offsetWidth || 160) - 8, ax - 12 * this.u()));
      tag.style.transform = `translate(${bx.toFixed(1)}px, ${(up ? lbY : ay).toFixed(1)}px)`;
      ln.style.marginLeft = (ax - bx - 1).toFixed(1) + 'px';
      tag.classList.toggle('dim', !show || this.v.z > 1);
    }
    this.acc += dt;
    if (this.acc > 0.5) {
      this.acc = 0;
      const day = 412 + Math.floor(t / 600), mins = Math.floor((t * 4) % 1440);
      this.clockEl.innerHTML = `<div class="k">MISSION DAY</div><div>${day} · ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}</div>`;
      const set = (k: string, v: string, warn = false) => { const e = this.vit[k]; e.querySelector('.x')!.textContent = v; e.querySelector('i')!.classList.toggle('w', warn); };
      set('pwr', `${(98 + Math.sin(t * 0.2)).toFixed(0)}%`); set('o2', this.hub.alarmOn ? '17.2%' : '20.9%', this.hub.alarmOn); set('hull', this.hub.alarmOn ? 'BREACH' : '100%', this.hub.alarmOn); set('crew', '8 / 8');
      if (this.mode === 'room' && this.room && this.panel.classList.contains('on')) { const ro = this.panel.querySelector('.ro'); if (ro) ro.innerHTML = this.readout(this.room, 4); }
    }
  }
  dispose() { this.offKey(); this.root.remove(); }
}
