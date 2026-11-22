// The hub's UI as hardware over the living 3D ship (plates.ts): every room names itself on a plate of its own (engraved
// brass on the bridge, engraved steel in the hold, a hazard plate in engineering, enamel door plates elsewhere). Hover
// a room in the cutaway: its plate stands off it on a straight machined pointer rod, bolted at the room. Inside, its
// things carry small plates on rods; gauges are real dials whose needles swing, numbers turn on drum counters, and
// actions are toggle switches that throw when used. The room selector is a rail of machined push-buttons at the
// foot. No hand-drawn marks anywhere. Words are kept to names and numbers.
import * as THREE from 'three';
import type { ShipHub } from './hub';
import { ROOMS, ROOM_IDS, SHIP_NAME, SHIP_REG, type RoomId } from './layout';
import { settingsStamps, type Stamp } from './settings';
import { csfx } from '../../ui/cineAudio';
import { ui } from '../../ui/kit';
import { plate, railURL, buttonURL, toggleURL, lampURL, dialURL, ROOM_PLATE, K, type PlateKind } from './plates';

export interface RoomAction { id: string; label: string; key?: string; run: () => void; disabled?: () => string | false; primary?: boolean; hint?: string }

const ART = import.meta.glob('./assets/ui/[a-z]*.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
export const art = (n: string) => ART[`./assets/ui/${n}.png`] ?? '';
export const ICON: Record<RoomId, string> = { bridge: 'i_bridge', lab: 'i_lab', medbay: 'i_medbay', core: 'i_core', quarters: 'i_quarters', workshop: 'i_workshop', mess: 'i_mess', cargo: 'i_cargo', engineering: 'i_engineering' };

const CSS = /* css */`
.hd2 { position: fixed; inset: 0; z-index: 4; pointer-events: none; font-family: 'Body'; font-size: 22px; color: #2a2622; }
.hd2 .pe { pointer-events: auto; }
.hd2 svg.ink { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.hd2 .tag { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 10px; white-space: nowrap; }
.hd2 .tag img, .hd2 .stamp img { width: 40px; height: 40px; margin: -6px 0; image-rendering: pixelated; }
.hd2 .t { font-family: 'Body'; font-size: 22px; line-height: 22px; letter-spacing: 2px; }
.hd2 .s { font-family: 'Body'; font-size: 22px; line-height: 22px; opacity: 0.86; }
.hd2 .col { display: flex; flex-direction: column; gap: 4px; }
.hd2 .pp { display: inline-flex; gap: 2px; vertical-align: middle; }
.hd2 .pp i { display: inline-block; width: 6px; height: 14px; border: 2px solid currentColor; background: transparent; }
.hd2 .pp i.on { background: #b13c2b; }
.hd2 .stamp { position: relative; display: inline-flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; white-space: nowrap; transition: transform 70ms; }
.hd2 .stamp .tg { width: 20px; height: 32px; margin: -6px 2px -6px -8px; background: var(--tgUp) no-repeat 0 0 / 20px 32px; image-rendering: pixelated; flex: none; }
.hd2 .stamp.thrown .tg { background-image: var(--tgDn); }
.hd2 .stamp .lmp { position: absolute; left: 10px; top: -4px; width: 12px; height: 12px; background: var(--lampOff) no-repeat 0 0 / 12px 12px; image-rendering: pixelated; }
.hd2 .stamp.hot .lmp { background-image: var(--lampOn); }
.hd2 .dial { position: relative; display: inline-block; width: 56px; height: 40px; margin: -4px 4px -4px 0; background: var(--dial) no-repeat 0 0 / 56px 40px; image-rendering: pixelated; flex: none; }
.hd2 .dial i { position: absolute; left: 26px; top: 10px; width: 4px; height: 24px; background: linear-gradient(#b13c2b 0 70%, #13161c 70%); transform-origin: 2px 22px; }
.hd2 .dg { display: inline-block; min-width: 14px; padding: 0 1px; margin: 0 1px; text-align: center; background: #13161c; color: #e5dbc3; text-shadow: none; box-shadow: inset 0 2px 0 #2a323e, inset 0 -2px 0 #000; }
.hd2 .stamp span:not(.k) { font-family: 'Body'; font-size: 22px; line-height: 22px; letter-spacing: 2px; }
.hd2 .stamp:hover, .hd2 .stamp.hot:hover { filter: brightness(1.16) drop-shadow(0 6px 0 rgba(10,8,6,0.5)); transform: translateY(-2px); }
.hd2 .stamp.hot { filter: brightness(1.06) drop-shadow(0 4px 0 rgba(10,8,6,0.5)); }
.hd2 .stamp:active { transform: translateY(2px); filter: brightness(0.94) drop-shadow(0 2px 0 rgba(10,8,6,0.5)); }
.hd2 .stamp .k { font-family: 'Body'; font-size: 11px; line-height: 11px; padding: 2px 4px; margin-left: 2px; border: 2px solid currentColor; opacity: 0.7; }
.hd2 .stamp.dis { filter: grayscale(0.85) brightness(0.72) drop-shadow(0 4px 0 rgba(10,8,6,0.5)); cursor: default; }
.hd2 .stamps { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; max-width: 92vw; }
.hd2 .back { position: absolute; left: 28px; top: 24px; }
.hd2 .ship { position: absolute; left: 24px; top: 20px; }
.hd2 .ship .t { font-family: 'Title'; font-size: 24px; line-height: 24px; letter-spacing: 0; }
.hd2 .ship .s { font-size: 11px; line-height: 11px; }
.hd2 .tabs { position: absolute; left: 24px; bottom: 20px; display: flex; gap: 4px; align-items: center; padding: 10px 20px 8px; background-repeat: no-repeat; image-rendering: pixelated; filter: drop-shadow(0 4px 0 rgba(10,8,6,0.5)); }
.hd2 .tabs .tb { position: relative; width: 48px; height: 66px; cursor: pointer; }
.hd2 .tabs .tb .b { position: absolute; left: 0; top: 0; width: 48px; height: 52px; background: var(--btnUp) no-repeat 0 0 / 48px 52px; image-rendering: pixelated; }
.hd2 .tabs .tb:hover .b, .hd2 .tabs .tb.h .b { background-image: var(--btnHi); }
.hd2 .tabs .tb.on .b { background-image: var(--btnDn); }
.hd2 .tabs .tb img { position: absolute; left: 8px; top: 8px; width: 32px; height: 32px; image-rendering: pixelated; }
.hd2 .tabs .tb.on img { top: 12px; filter: brightness(0.85); }
.hd2 .tabs .tb .n { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; font-family: 'Body'; font-size: 11px; line-height: 11px; color: #b1b2aa; text-shadow: 0 1px 0 #000; }
.hd2 .tabs .tb.on .n { color: #e9cb89; }
.hd2 .title { position: absolute; left: 64px; bottom: 72px; transition: opacity 600ms; }
.hd2 .title.off { opacity: 0; visibility: hidden; transition: none; pointer-events: none !important; }
.hd2 .title .pre { font-family: 'Body'; font-size: 22px; color: #d6cab0; text-shadow: 2px 2px 0 #000; letter-spacing: 4px; }
.hd2 .title .big { font-family: 'TitleXL'; font-size: 64px; color: #e5dbc3; line-height: 64px; margin: 8px 0 4px; text-shadow: 4px 4px 0 #13161c; }
.hd2 .title .sub { font-family: 'Body'; font-size: 22px; color: #c1b59b; text-shadow: 2px 2px 0 #000; margin-bottom: 24px; }
.hd2 .title .row { display: flex; gap: 16px; }
.hd2 .card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 600px; padding: 28px 32px; display: none; }
.hd2 .card.on { display: block; }
.hd2 .card .t { font-family: 'Title'; font-size: 48px; line-height: 48px; margin-bottom: 20px; letter-spacing: 0; }
.hd2 .card .g { display: flex; flex-wrap: wrap; gap: 12px; }
.hd2 .khint { display: none; }
.hd2 .khint.on { display: flex; }
.hd2.hide > * { visibility: hidden; }
`;
let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  const r = document.documentElement.style;
  r.setProperty('--btnUp', `url(${buttonURL('up')})`); r.setProperty('--btnHi', `url(${buttonURL('hi')})`); r.setProperty('--btnDn', `url(${buttonURL('down')})`);
  r.setProperty('--tgUp', `url(${toggleURL(false)})`); r.setProperty('--tgDn', `url(${toggleURL(true)})`);
  r.setProperty('--lampOn', `url(${lampURL(true)})`); r.setProperty('--lampOff', `url(${lampURL(false)})`); r.setProperty('--dial', `url(${dialURL()})`);
}
const div = (cls: string, parent: HTMLElement, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };
const NS = 'http://www.w3.org/2000/svg';
/** numbers on drum counters: each digit in its own dark window */
const drum = (s: string) => s.replace(/<[^>]*>|\d/g, (m) => (m.length === 1 ? `<b class="dg">${m}</b>` : m));
const hsh = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/** a callout on screen: a tag, and the inked line from it to a 3D point */
interface Pin { off: () => void; el: HTMLElement; at: THREE.Vector3; side: 'l' | 'r' | 'u' | 'd'; text?: () => string; tx?: HTMLElement; line: SVGPathElement; under: SVGPathElement; dot: SVGCircleElement; seed: number; gauge?: () => number; ndl?: HTMLElement; g: number }

export class HubChrome {
  readonly root: HTMLDivElement;
  private svg: SVGSVGElement;
  private tabs = {} as Record<RoomId, HTMLElement>;
  private hoverPin: Pin | null = null;
  private pins: Pin[] = [];
  private stampsEl: HTMLElement; private backEl: HTMLElement; private titleEl: HTMLElement; private cardEl: HTMLElement; private hintEl: HTMLElement; private shipEl: HTMLElement; private tabsEl: HTMLElement;
  private mode = 'exterior'; private room: RoomId | null = null; private hov: RoomId | null = null;
  private roomActs: RoomAction[] = [];
  private titleKeys: RoomAction[] = [];
  private v = new THREE.Vector3();
  private shown = true;
  private offKey: () => void;
  constructor(readonly hub: ShipHub, readonly o: { hasSave: boolean; fromPlanet: boolean }) {
    style();
    this.root = div('hd2', ui()) as HTMLDivElement;
    this.svg = document.createElementNS(NS, 'svg') as SVGSVGElement; this.svg.classList.add('ink'); this.root.appendChild(this.svg);
    this.shipEl = div('ship tag', this.root, `<span class="col"><span class="t">${SHIP_NAME}</span><span class="s">${SHIP_REG}</span></span>`);
    plate(this.shipEl, 'steel', 7);
    this.tabsEl = div('tabs pe', this.root);
    new ResizeObserver(() => { const w = Math.floor(this.tabsEl.offsetWidth / K), h = Math.floor(this.tabsEl.offsetHeight / K); if (w > 8) { this.tabsEl.style.backgroundImage = `url(${railURL(w, h)})`; this.tabsEl.style.backgroundSize = `${w * K}px ${h * K}px`; } }).observe(this.tabsEl);
    for (const id of ROOM_IDS.slice().sort((a, b) => Number(ROOMS[a].code) - Number(ROOMS[b].code))) {
      const t = div('tb', this.tabsEl, `<span class="b"></span><img src="${art(ICON[id])}" alt=""><span class="n">${Number(ROOMS[id].code)}</span>`);
      t.addEventListener('click', (e) => { e.stopPropagation(); csfx('clamp', 0.45); csfx('relay', 0.3); this.hub.open(id); });
      t.addEventListener('pointerenter', () => { csfx('hover', 0.3); this.hover(id, 0, 0, true); });
      t.addEventListener('pointerleave', () => this.hover(null, 0, 0, true));
      this.tabs[id] = t;
    }
    this.stampsEl = div('stamps pe', this.root);
    this.backEl = div('back stamp pe', this.root, '<span>&lt; BACK</span><span class="k">ESC</span>');
    plate(this.backEl, 'steel', 3);
    this.backEl.addEventListener('click', (e) => { e.stopPropagation(); csfx('page', 0.4); this.hub.back(); });
    this.hintEl = div('khint tag', this.root);
    this.titleEl = div('title pe', this.root, `<div class="pre">UNAA SETTLEMENT PROGRAM</div><div class="big">${SHIP_NAME}</div><div class="sub">${SHIP_REG} · KEPLER-442</div>`);
    if (o.hasSave) this.titleKeys.push({ id: 'continue', label: 'CONTINUE', key: 'C', run: () => (this.hub.opts.onContinue ? this.hub.opts.onContinue() : this.hub.board()) });
    this.titleKeys.push({ id: 'new', label: 'NEW MISSION', key: 'N', run: () => (this.hub.opts.onNew ? this.hub.opts.onNew() : this.hub.board()) });
    this.titleKeys.push({ id: 'settings', label: 'SETTINGS', key: 'O', run: () => this.openSettings() });
    const row = div('row', this.titleEl);
    this.titleKeys.forEach((k, i) => this.stamp(row, { label: k.label, key: k.key, run: k.run, hot: i === 0 }, i, 'enamelBone'));
    this.cardEl = div('card pe', this.root);
    plate(this.cardEl, 'steel', 11);
    const keyH = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.ctrlKey || e.metaKey || this.hub.isLocked()) return;
      const k = e.key.toLowerCase();
      if (this.mode === 'exterior' && !this.cardEl.classList.contains('on')) { const a = this.titleKeys.find((x) => x.key?.toLowerCase() === k); if (a) { csfx('button', 0.5); a.run(); } return; }
      const list: Stamp[] = this.mode === 'room' ? this.roomActs.map((a) => ({ label: a.label, key: a.key, run: a.run, disabled: a.disabled })) : [];
      const a = list.find((x) => x.key?.toLowerCase() === k); if (a && !a.disabled?.()) { csfx('button', 0.5); a.run(); }
    };
    addEventListener('keydown', keyH); this.offKey = () => removeEventListener('keydown', keyH);
    this.root.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('.pe')) e.stopPropagation(); });
  }
  titleDefault() { this.titleKeys[0]?.run(); }

  /** a key: a plate with a toggle switch that throws when used (and springs back), a lamp lit on the primary */
  /** the material the current place speaks in (the room's own, or cream enamel outside) */
  private kind(): PlateKind { const id = this.room; return id ? ROOM_PLATE[id] : 'enamelBone'; }
  private stamp(parent: HTMLElement, s: Stamp, i = 0, kind: PlateKind = this.kind()) {
    const e = div('stamp pe' + (s.hot ? ' hot' : ''), parent, `<i class="tg"></i><i class="lmp"></i>${s.icon ? `<img src="${art(s.icon)}" alt="">` : ''}<span>${s.label}</span>${s.key ? `<span class="k">${s.key}</span>` : ''}`);
    plate(e, kind, 31 + i * 7 + s.label.length);
    const why = s.disabled?.();
    if (why) { e.classList.add('dis'); e.title = why; }
    e.addEventListener('click', (ev) => { ev.stopPropagation(); if (s.disabled?.()) { csfx('tick', 0.4); return; } csfx('clamp', 0.5); e.classList.add('thrown'); setTimeout(() => e.classList.remove('thrown'), 380); s.run(); });
    e.addEventListener('pointerenter', () => csfx('hover', 0.3));
    return e;
  }

  // ---------------------------------------------------------------- pins (tags with leader lines)
  private pin(at: THREE.Vector3 | [number, number, number], html: string, side: Pin['side'] = 'u', text?: () => string, kind: PlateKind = this.kind()): Pin {
    const el = div('tag', this.root, html);
    const off = plate(el, kind, 3 + Math.floor(hsh(at instanceof THREE.Vector3 ? at.x : at[0], at instanceof THREE.Vector3 ? at.z : at[2]) * 90));
    // the rod: a dark body with a lit steel edge, square cut; a hex-head bolt where it meets the room
    const under = document.createElementNS(NS, 'path'), line = document.createElementNS(NS, 'path'), dot = document.createElementNS(NS, 'circle');
    under.setAttribute('fill', 'none'); under.setAttribute('stroke', '#2a2f32'); under.setAttribute('stroke-width', '6'); under.setAttribute('stroke-linecap', 'butt');
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#b1b2aa'); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-linecap', 'butt'); line.setAttribute('transform', 'translate(-1,-1)');
    dot.setAttribute('r', '5'); dot.setAttribute('fill', '#8e9190'); dot.setAttribute('stroke', '#1c1e20'); dot.setAttribute('stroke-width', '2');
    this.svg.append(under, line, dot);
    return { off, el, at: at instanceof THREE.Vector3 ? at.clone() : new THREE.Vector3(...at), side, text, tx: (el.querySelector('.s') as HTMLElement) ?? undefined, line, under, dot, seed: Math.random() * 100, ndl: (el.querySelector('.dial i') as HTMLElement) ?? undefined, g: 0 };
  }
  private unpin(p: Pin) { p.off(); p.el.remove(); p.line.remove(); p.under.remove(); p.dot.remove(); }
  private clearPins() { this.pins.forEach((p) => this.unpin(p)); this.pins = []; }
  /** place a pin: the tag beside its 3D point, the inked line between, a red pin at the point */
  private place(p: Pin, cam: THREE.Camera, i: number) {
    this.v.copy(p.at).project(cam);
    const vis = this.v.z < 1 && Math.abs(this.v.x) < 1.05 && Math.abs(this.v.y) < 1.05;
    const vv = vis ? '' : 'hidden';
    p.el.style.visibility = vv; p.line.style.visibility = vv; p.under.style.visibility = vv; p.dot.style.visibility = vv;
    if (!vis) return;
    const ax = Math.round((this.v.x * 0.5 + 0.5) * innerWidth), ay = Math.round((-this.v.y * 0.5 + 0.5) * innerHeight);
    const w = p.el.offsetWidth, h = p.el.offsetHeight, d = 64 + (i % 3) * 22;
    let tx = ax, ty = ay;
    if (p.side === 'u') { tx = ax - w / 2 + 30; ty = ay - d - h; }
    else if (p.side === 'd') { tx = ax - w / 2 - 20; ty = ay + d; }
    else if (p.side === 'l') { tx = ax - d - w; ty = ay - h / 2 - 20; }
    else { tx = ax + d; ty = ay - h / 2 + 10; }
    tx = Math.round(Math.max(12, Math.min(innerWidth - w - 12, tx)) / K) * K; ty = Math.round(Math.max(12, Math.min(innerHeight - h - 96, ty)) / K) * K;
    p.el.style.transform = `translate(${tx}px, ${ty}px)`;
    const ex = Math.round(Math.max(tx + 12, Math.min(tx + w - 12, ax))), ey = Math.round(ay < ty ? ty + 10 : ay > ty + h ? ty + h - 10 : ty + h / 2);
    const path = `M${ex},${ey} L${ax},${ay}`;
    p.line.setAttribute('d', path); p.under.setAttribute('d', path);
    p.dot.setAttribute('cx', String(ax)); p.dot.setAttribute('cy', String(ay));
  }

  // ---------------------------------------------------------------- modes
  setMode(m: string, room: RoomId | null = null) {
    this.mode = m; this.room = room;
    const inside = m === 'overview' || m === 'room';
    this.titleEl.classList.toggle('off', m !== 'exterior');
    this.tabsEl.style.display = inside ? '' : 'none';
    this.shipEl.style.display = m === 'overview' ? '' : 'none';
    this.backEl.style.display = m === 'room' ? '' : 'none';
    for (const id of ROOM_IDS) this.tabs[id].classList.toggle('on', id === room);
    if (m !== 'room') this.closePanel();
  }
  /** the room is focused: its stamps (the first one opens its functions: the SHIP screen's panels) */
  openPanel(id: RoomId, acts: RoomAction[]) {
    this.roomActs = acts;
    this.clearPins();
    this.stampsEl.innerHTML = '';
    acts.forEach((a, i) => this.stamp(this.stampsEl, { label: a.label, key: a.key, run: a.run, disabled: a.disabled, icon: i === 0 ? ICON[id] : undefined, hot: i === 0 }, i));
    this.backEl.style.display = '';
  }
  closePanel() { this.clearPins(); this.stampsEl.innerHTML = ''; this.roomActs = []; }
  closeOverlay() { if (this.cardEl.classList.contains('on')) { this.cardEl.classList.remove('on'); csfx('page', 0.4); return true; } return false; }
  visible(on: boolean) { this.shown = on; this.root.classList.toggle('hide', !on); }

  // ---------------------------------------------------------------- hover (the cutaway, the tab strip)
  hover(id: RoomId | null, _x: number, _y: number, fromTag = false) {
    if (id === this.hov && !fromTag && (this.hoverPin || !id)) return;
    this.hov = id;
    for (const r of ROOM_IDS) this.tabs[r].classList.toggle('h', r === this.hov);
    if (this.hoverPin) { this.unpin(this.hoverPin); this.hoverPin = null; }
    if (!id || this.mode === 'exterior' || this.mode === 'boarding' || (this.mode === 'room' && id === this.room)) return;
    const r = ROOMS[id], up = r.x0 >= 0 || id === 'bridge';
    this.hoverPin = this.pin([id === 'bridge' ? 0 : (r.x0 + r.x1) / 2, 1.2, id === 'bridge' ? 21.5 : (r.z0 + r.z1) / 2], `<img src="${art(ICON[id])}" alt=""><span class="t">${r.name}</span>`, up ? 'u' : 'd', undefined, ROOM_PLATE[id]);
  }
  keyHint(label: string | null, x: number, y: number) {
    const e = this.hintEl;
    if (!label) { e.classList.remove('on'); return; }
    if (e.dataset.k !== this.kind()) { (e as any)._off?.(); (e as any)._off = plate(e, this.kind(), 5); e.className = e.className.replace(/\bpl-\w+/g, '') + ' pl-' + this.kind(); e.dataset.k = this.kind(); }
    e.innerHTML = `<span class="t">${label.split(' · ')[0]}</span>`;
    e.style.transform = `translate(${Math.round(Math.min(innerWidth - 480, x + 28) / K) * K}px, ${Math.round((y + 22) / K) * K}px)`;
    e.classList.add('on');
  }

  // ---------------------------------------------------------------- settings (a pinned card)
  openSettings() {
    const c = this.cardEl;
    const draw = () => { c.innerHTML = '<div class="t">SETTINGS</div>'; const g = div('g', c); settingsStamps(draw).forEach((s, i) => this.stamp(g, s, i, 'enamelBone')); this.stamp(g, { label: 'CLOSE', key: 'ESC', run: () => this.closeOverlay() }, 9, 'enamelBone'); };
    draw(); c.classList.add('on'); csfx('page', 0.5);
  }
  /** the settings card (the AI core's settings key) */
  coreSettings() { this.openSettings(); }

  // ---------------------------------------------------------------- frame
  private acc = 0;
  update(dt: number, _t: number, cam: THREE.PerspectiveCamera) {
    if (!this.shown) return;
    this.acc += dt;
    const live = this.acc > 0.5; if (live) this.acc = 0;
    this.pins.forEach((p, i) => {
      if (live && p.text && p.tx) p.tx.innerHTML = p.text();
      // a needle swings to its value with a little overshoot, like a damped movement
      if (p.gauge && p.ndl) { const v = Math.max(0, Math.min(1, p.gauge())); p.g += (v - p.g) * Math.min(1, dt * 3); p.ndl.style.transform = `rotate(${Math.round((p.g * 180 - 90) / 4.5) * 4.5}deg)`; }
      this.place(p, cam, i);
    });
    if (this.hoverPin) this.place(this.hoverPin, cam, 0);
  }
  dispose() { this.offKey(); this.root.remove(); }
}
