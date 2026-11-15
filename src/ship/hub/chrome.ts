// The hub's UI, hand-drawn: no panels and no screens, just ink and paper over the living 3D ship. Room icons and
// paper tags are pixel art painted with lowpix's stroke brush (assets/ui); leader lines are inked by hand (a dark
// line under a pale one, wobbling a pixel, a red pin where they touch the room). Hover a room in the cutaway: an
// inked tag floats at it with a callout line. Inside a room, its things carry callouts; the key prop answers the
// pointer; using it moves the camera into a vignette whose state is told in callouts on the objects, with inked
// stamps to act. A small hand-drawn tab strip of room icons sits at the foot.
import * as THREE from 'three';
import type { ShipHub } from './hub';
import { ROOMS, ROOM_IDS, SHIP_NAME, SHIP_REG, type RoomId } from './layout';
import { ROOM_CALLOUTS, VIGNETTES, settingsStamps, type Callout, type Stamp, type VCtx } from './vignette';
import { csfx } from '../../ui/cineAudio';
import { ui } from '../../ui/kit';

export interface RoomAction { id: string; label: string; key?: string; run: () => void; disabled?: () => string | false; primary?: boolean; hint?: string }

const ART = import.meta.glob('./assets/ui/[a-z]*.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
export const art = (n: string) => ART[`./assets/ui/${n}.png`] ?? '';
export const ICON: Record<RoomId, string> = { bridge: 'i_bridge', lab: 'i_lab', medbay: 'i_medbay', core: 'i_core', quarters: 'i_quarters', workshop: 'i_workshop', mess: 'i_mess', cargo: 'i_cargo', engineering: 'i_engineering' };

const CSS = /* css */`
.hd2 { position: fixed; inset: 0; z-index: 4; pointer-events: none; font-family: 'Body'; font-size: 22px; color: #2a2622; image-rendering: pixelated; }
.hd2 .pe { pointer-events: auto; }
.hd2 svg.ink { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.hd2 .tag { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 8px; padding: 0 8px; border: 24px solid transparent; border-image: var(--tag) 12 fill / 24px stretch; white-space: nowrap; }
.hd2 .tag.hi { border-image: var(--tagHi) 12 fill / 24px stretch; }
.hd2 .tag img { width: 40px; height: 40px; margin: -12px 0; }
.hd2 .tag .t { font-family: 'Title'; font-size: 24px; color: #2a2622; line-height: 24px; }
.hd2 .tag .s { font-family: 'Body'; font-size: 22px; color: #5a4a3a; line-height: 22px; }
.hd2 .tag .col { display: flex; flex-direction: column; gap: 2px; margin: -14px 0; }
.hd2 .pp { display: inline-flex; gap: 2px; vertical-align: middle; }
.hd2 .pp i { display: inline-block; width: 6px; height: 14px; border: 2px solid #2a2622; background: #e2d8be; }
.hd2 .pp i.on { background: #b8402e; }
.hd2 .stamp { position: relative; display: inline-flex; align-items: center; gap: 8px; padding: 0 10px; cursor: pointer; border: 20px solid transparent; border-image: var(--stamp) 10 fill / 20px stretch; font-family: 'Title'; font-size: 24px; color: #2a2622; line-height: 24px; user-select: none; transform: rotate(var(--r, 0deg)); transition: transform 80ms; }
.hd2 .stamp:hover, .hd2 .stamp.hot { border-image: var(--stampHi) 10 fill / 20px stretch; color: #8a2a1e; }
.hd2 .stamp:active { transform: rotate(var(--r, 0deg)) translateY(2px); }
.hd2 .stamp img { width: 40px; height: 40px; margin: -14px 0 -14px -6px; }
.hd2 .stamp .k { font-family: 'Body'; font-size: 11px; color: #7a6a58; margin-left: 4px; }
.hd2 .stamp.dis { color: #9a8e7c; cursor: default; }
.hd2 .stamps { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; max-width: 92vw; }
.hd2 .back { position: absolute; left: 28px; top: 24px; }
.hd2 .ship { position: absolute; left: 24px; top: 20px; }
.hd2 .tabs { position: absolute; left: 24px; bottom: 20px; display: flex; gap: 4px; align-items: flex-end; }
.hd2 .tabs .tb { position: relative; width: 40px; height: 48px; cursor: pointer; transition: transform 120ms; }
.hd2 .tabs .tb img { width: 40px; height: 40px; display: block; filter: drop-shadow(0 2px 0 rgba(0,0,0,0.45)); }
.hd2 .tabs .tb .n { position: absolute; left: 0; right: 0; bottom: -2px; text-align: center; font-family: 'Body'; font-size: 11px; color: #d8ccb0; text-shadow: 0 1px 0 #000; }
.hd2 .tabs .tb:hover, .hd2 .tabs .tb.h { transform: translateY(-6px); }
.hd2 .tabs .tb.on { transform: translateY(-10px); }
.hd2 .tabs .tb.on::after { content: ''; position: absolute; left: 14px; right: 14px; bottom: -8px; height: 4px; background: #d8ccb0; box-shadow: 0 2px 0 #000; }
.hd2 .title { position: absolute; left: 64px; bottom: 72px; transition: opacity 600ms; }
.hd2 .title.off { opacity: 0; pointer-events: none !important; }
.hd2 .title .pre { font-family: 'Body'; font-size: 22px; color: #d8ccb0; text-shadow: 0 2px 0 #000; }
.hd2 .title .big { font-family: 'TitleXL'; font-size: 64px; color: #ece2c8; line-height: 64px; margin: 8px 0 4px; text-shadow: 4px 4px 0 #1a1612; }
.hd2 .title .sub { font-family: 'Body'; font-size: 22px; color: #c8b890; text-shadow: 0 2px 0 #000; margin-bottom: 22px; }
.hd2 .title .row { display: flex; gap: 12px; }
.hd2 .card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-0.6deg); width: 560px; padding: 12px 16px; border: 36px solid transparent; border-image: var(--card) 24 fill / 36px stretch; display: none; }
.hd2 .card.on { display: block; }
.hd2 .card .t { font-family: 'Title'; font-size: 48px; line-height: 48px; margin-bottom: 12px; }
.hd2 .card .g { display: flex; flex-wrap: wrap; gap: 10px; }
.hd2 .khint { display: none; }
.hd2 .khint.on { display: flex; }
.hd2.hide > * { visibility: hidden; }
`;
let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  const r = document.documentElement.style;
  r.setProperty('--tag', `url(${art('tag')})`); r.setProperty('--tagHi', `url(${art('tag_hi')})`); r.setProperty('--card', `url(${art('card')})`);
  r.setProperty('--stamp', `url(${art('stamp')})`); r.setProperty('--stampHi', `url(${art('stamp_hi')})`);
}
const div = (cls: string, parent: HTMLElement, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };
const NS = 'http://www.w3.org/2000/svg';
const hsh = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/** a callout on screen: a tag, and the inked line from it to a 3D point */
interface Pin { el: HTMLElement; at: THREE.Vector3; side: 'l' | 'r' | 'u' | 'd'; text?: () => string; tx?: HTMLElement; line: SVGPathElement; under: SVGPathElement; dot: SVGRectElement; seed: number }

export class HubChrome {
  readonly root: HTMLDivElement;
  private svg: SVGSVGElement;
  private tabs = {} as Record<RoomId, HTMLElement>;
  private hoverPin: Pin | null = null;
  private pins: Pin[] = [];
  private stampsEl: HTMLElement; private backEl: HTMLElement; private titleEl: HTMLElement; private cardEl: HTMLElement; private hintEl: HTMLElement; private shipEl: HTMLElement; private tabsEl: HTMLElement;
  private mode = 'exterior'; private room: RoomId | null = null; private hov: RoomId | null = null;
  private vig: { id: RoomId; ctx: VCtx } | null = null;
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
    this.tabsEl = div('tabs pe', this.root);
    for (const id of ROOM_IDS.slice().sort((a, b) => Number(ROOMS[a].code) - Number(ROOMS[b].code))) {
      const t = div('tb', this.tabsEl, `<img src="${art(ICON[id])}" alt=""><span class="n">${Number(ROOMS[id].code)}</span>`);
      t.addEventListener('click', (e) => { e.stopPropagation(); csfx('page', 0.5); this.hub.open(id); });
      t.addEventListener('pointerenter', () => { csfx('hover', 0.3); this.hover(id, 0, 0, true); });
      t.addEventListener('pointerleave', () => this.hover(null, 0, 0, true));
      this.tabs[id] = t;
    }
    this.stampsEl = div('stamps pe', this.root);
    this.backEl = div('back stamp pe', this.root, '<span>&lt; BACK</span><span class="k">ESC</span>');
    this.backEl.style.setProperty('--r', '-1.5deg');
    this.backEl.addEventListener('click', (e) => { e.stopPropagation(); csfx('page', 0.4); this.hub.back(); });
    this.hintEl = div('khint tag hi', this.root);
    this.titleEl = div('title pe', this.root, `<div class="pre">UNAA COLONY PROGRAM</div><div class="big">${SHIP_NAME}</div><div class="sub">${SHIP_REG} · HIGH ORBIT · KEPLER-442</div>`);
    if (o.hasSave) this.titleKeys.push({ id: 'continue', label: 'CONTINUE', key: 'C', run: () => (this.hub.opts.onContinue ? this.hub.opts.onContinue() : this.hub.board()) });
    this.titleKeys.push({ id: 'new', label: 'NEW MISSION', key: 'N', run: () => (this.hub.opts.onNew ? this.hub.opts.onNew() : this.hub.board()) });
    this.titleKeys.push({ id: 'settings', label: 'SETTINGS', key: 'O', run: () => this.openSettings() });
    const row = div('row', this.titleEl);
    this.titleKeys.forEach((k, i) => this.stamp(row, { label: k.label, key: k.key, run: k.run, hot: i === 0 }, i));
    this.cardEl = div('card pe', this.root);
    const keyH = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.ctrlKey || e.metaKey || this.hub.isLocked()) return;
      const k = e.key.toLowerCase();
      if (this.mode === 'exterior' && !this.cardEl.classList.contains('on')) { const a = this.titleKeys.find((x) => x.key?.toLowerCase() === k); if (a) { csfx('button', 0.5); a.run(); } return; }
      const list: Stamp[] = this.vig ? this.vigStamps() : this.mode === 'room' ? this.roomActs.map((a) => ({ label: a.label, key: a.key, run: a.run, disabled: a.disabled })) : [];
      const a = list.find((x) => x.key?.toLowerCase() === k); if (a && !a.disabled?.()) { csfx('button', 0.5); a.run(); }
    };
    addEventListener('keydown', keyH); this.offKey = () => removeEventListener('keydown', keyH);
    this.root.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('.pe')) e.stopPropagation(); });
  }
  titleDefault() { this.titleKeys[0]?.run(); }

  /** an inked stamp (a key): a little rotated, as if pressed by hand */
  private stamp(parent: HTMLElement, s: Stamp, i = 0) {
    const e = div('stamp pe' + (s.hot ? ' hot' : ''), parent, `${s.icon ? `<img src="${art(s.icon)}" alt="">` : ''}<span>${s.label}</span>${s.key ? `<span class="k">${s.key}</span>` : ''}`);
    e.style.setProperty('--r', `${((hsh(i, s.label.length) - 0.5) * 3).toFixed(1)}deg`);
    const why = s.disabled?.();
    if (why) { e.classList.add('dis'); e.title = why; }
    e.addEventListener('click', (ev) => { ev.stopPropagation(); if (s.disabled?.()) { csfx('tick', 0.4); return; } csfx('button', 0.6); s.run(); });
    e.addEventListener('pointerenter', () => csfx('hover', 0.3));
    return e;
  }

  // ---------------------------------------------------------------- pins (tags with leader lines)
  private pin(at: THREE.Vector3 | [number, number, number], html: string, side: Pin['side'] = 'u', text?: () => string, hi = false): Pin {
    const el = div('tag' + (hi ? ' hi' : ''), this.root, html);
    const under = document.createElementNS(NS, 'path'), line = document.createElementNS(NS, 'path'), dot = document.createElementNS(NS, 'rect');
    under.setAttribute('fill', 'none'); under.setAttribute('stroke', '#16120e'); under.setAttribute('stroke-width', '6'); under.setAttribute('stroke-linecap', 'square'); under.setAttribute('shape-rendering', 'crispEdges');
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#e2d8be'); line.setAttribute('stroke-width', '2'); line.setAttribute('stroke-linecap', 'square'); line.setAttribute('shape-rendering', 'crispEdges');
    dot.setAttribute('width', '8'); dot.setAttribute('height', '8'); dot.setAttribute('fill', '#b8402e'); dot.setAttribute('stroke', '#16120e'); dot.setAttribute('stroke-width', '2');
    this.svg.append(under, line, dot);
    return { el, at: at instanceof THREE.Vector3 ? at.clone() : new THREE.Vector3(...at), side, text, tx: (el.querySelector('.s') as HTMLElement) ?? undefined, line, under, dot, seed: Math.random() * 100 };
  }
  private unpin(p: Pin) { p.el.remove(); p.line.remove(); p.under.remove(); p.dot.remove(); }
  private clearPins() { this.pins.forEach((p) => this.unpin(p)); this.pins = []; }
  private callout(c: Callout, hi = false) {
    const html = `${c.icon ? `<img src="${art(c.icon)}" alt="">` : ''}<span class="col">${c.title ? `<span class="t">${c.title}</span>` : ''}<span class="s">${c.text()}</span></span>`;
    this.pins.push(this.pin(c.at, html, c.side ?? 'u', c.text, hi));
  }
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
    tx = Math.round(Math.max(12, Math.min(innerWidth - w - 12, tx))); ty = Math.round(Math.max(12, Math.min(innerHeight - h - 96, ty)));
    p.el.style.transform = `translate(${tx}px, ${ty}px)`;
    const ex = Math.round(Math.max(tx + 12, Math.min(tx + w - 12, ax))), ey = Math.round(ay < ty ? ty + 10 : ay > ty + h ? ty + h - 10 : ty + h / 2);
    const mx = Math.round((ex + ax) / 2 + (hsh(p.seed, 1) - 0.5) * 6), my = Math.round((ey + ay) / 2 + (hsh(p.seed, 2) - 0.5) * 6);
    const path = `M${ex},${ey} L${mx},${my} L${ax},${ay}`;
    p.line.setAttribute('d', path); p.under.setAttribute('d', path);
    p.dot.setAttribute('x', String(ax - 4)); p.dot.setAttribute('y', String(ay - 4));
  }

  // ---------------------------------------------------------------- modes
  setMode(m: string, room: RoomId | null = null) {
    this.mode = m; this.room = room;
    const inside = m === 'overview' || m === 'room';
    this.titleEl.classList.toggle('off', m !== 'exterior');
    this.tabsEl.style.display = inside ? '' : 'none';
    this.shipEl.style.display = m === 'overview' ? '' : 'none';
    this.backEl.style.display = m === 'room' || this.vig ? '' : 'none';
    for (const id of ROOM_IDS) this.tabs[id].classList.toggle('on', id === room);
    if (m !== 'room') this.closePanel();
    if (m === 'exterior' || m === 'overview') this.closeVignette(false);
  }
  /** the room is focused: its callouts, and its stamps (the first one uses the key prop) */
  openPanel(id: RoomId, acts: RoomAction[]) {
    this.vig = null;
    this.roomActs = acts;
    this.clearPins();
    for (const c of ROOM_CALLOUTS[id]) this.callout(c);
    this.stampsEl.innerHTML = '';
    acts.forEach((a, i) => this.stamp(this.stampsEl, { label: a.label, key: a.key, run: a.run, disabled: a.disabled, icon: i === 0 ? ICON[id] : undefined, hot: i === 0 }, i));
    this.backEl.style.display = '';
  }
  closePanel() { this.clearPins(); this.stampsEl.innerHTML = ''; this.roomActs = []; }
  // ---------------------------------------------------------------- vignettes
  private settingsOn = false;
  private vigStamps(): Stamp[] {
    if (!this.vig) return [];
    if (this.vig.id === 'core' && this.settingsOn) return [...settingsStamps(() => this.drawVig()), { label: 'DONE', key: 'O', run: () => { this.settingsOn = false; this.drawVig(); } }];
    return VIGNETTES[this.vig.id].stamps(this.vig.ctx);
  }
  openVignette(id: RoomId, ctx: Omit<VCtx, 'redraw'>) {
    this.vig = { id, ctx: { ...ctx, redraw: () => this.drawVig() } };
    this.settingsOn = false;
    this.hintEl.classList.remove('on');
    this.drawVig();
    this.backEl.style.display = '';
  }
  private drawVig() {
    if (!this.vig) return;
    this.clearPins(); this.stampsEl.innerHTML = '';
    for (const c of VIGNETTES[this.vig.id].callouts) this.callout(c, true);
    this.vigStamps().forEach((s, i) => this.stamp(this.stampsEl, s, i));
  }
  closeVignette(restore = true) {
    if (!this.vig) return false;
    const id = this.vig.id; this.vig = null; this.settingsOn = false;
    this.clearPins(); this.stampsEl.innerHTML = '';
    if (restore) this.openPanel(id, this.hub.getActions(id));
    return true;
  }
  inVignette() { return !!this.vig; }
  closeOverlay() { if (this.cardEl.classList.contains('on')) { this.cardEl.classList.remove('on'); csfx('page', 0.4); return true; } return false; }
  visible(on: boolean) { this.shown = on; this.root.classList.toggle('hide', !on); }

  // ---------------------------------------------------------------- hover (the cutaway, the tab strip)
  hover(id: RoomId | null, _x: number, _y: number, fromTag = false) {
    if (id === this.hov && !fromTag && (this.hoverPin || !id)) return;
    this.hov = id;
    for (const r of ROOM_IDS) this.tabs[r].classList.toggle('h', r === this.hov);
    if (this.hoverPin) { this.unpin(this.hoverPin); this.hoverPin = null; }
    if (!id || this.mode === 'exterior' || this.mode === 'boarding' || (this.mode === 'room' && id === this.room) || this.vig) return;
    const r = ROOMS[id], up = r.x0 >= 0 || id === 'bridge';
    this.hoverPin = this.pin([id === 'bridge' ? 0 : (r.x0 + r.x1) / 2, 1.2, id === 'bridge' ? 21.5 : (r.z0 + r.z1) / 2], `<img src="${art(ICON[id])}" alt=""><span class="col"><span class="t">${r.name}</span><span class="s">${r.role}</span></span>`, up ? 'u' : 'd', undefined, true);
  }
  keyHint(label: string | null, x: number, y: number) {
    const e = this.hintEl;
    if (!label || this.vig) { e.classList.remove('on'); return; }
    e.innerHTML = `<span class="col"><span class="t">${label}</span><span class="s">CLICK TO USE</span></span>`;
    e.style.transform = `translate(${Math.round(Math.min(innerWidth - 480, x + 28))}px, ${Math.round(y + 22)}px)`;
    e.classList.add('on');
  }

  // ---------------------------------------------------------------- settings (a pinned card)
  openSettings() {
    const c = this.cardEl;
    const draw = () => { c.innerHTML = '<div class="t">SETTINGS</div>'; const g = div('g', c); settingsStamps(draw).forEach((s, i) => this.stamp(g, s, i)); this.stamp(g, { label: 'CLOSE', key: 'ESC', run: () => this.closeOverlay() }, 9); };
    draw(); c.classList.add('on'); csfx('page', 0.5);
  }
  /** the AI core's settings, inside its vignette */
  coreSettings() { if (this.vig?.id === 'core') { this.settingsOn = true; this.drawVig(); } else this.openSettings(); }

  // ---------------------------------------------------------------- frame
  private acc = 0;
  update(dt: number, _t: number, cam: THREE.PerspectiveCamera) {
    if (!this.shown) return;
    this.acc += dt;
    const live = this.acc > 0.5; if (live) this.acc = 0;
    this.pins.forEach((p, i) => { if (live && p.text && p.tx) p.tx.innerHTML = p.text(); this.place(p, cam, i); });
    if (this.hoverPin) this.place(this.hoverPin, cam, 0);
  }
  dispose() { this.offKey(); this.root.remove(); }
}
