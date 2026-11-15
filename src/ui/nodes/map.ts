// The NODE MAP (N): the colony's logistics as a machined PATCH BAY. Every node is a module bolted to a steel panel:
// a housing with corner screws, a glass window with the building's pixel picture (src/ui/build/art.ts; the pod, a
// deposit's ore or a field's tree for the others), an engraved name plate, a read-out strip, a status LED and two
// sockets, IN on the left and OUT on the right. The logic gadgets are physical modules: the splitter and merger have a
// knurled selector knob that turns to the output it deals to, the buffer a level gauge, the counter an odometer, the
// gate a toggle switch, the timer a clock dial, the sensor a needle meter. Routes are patch CABLES with jack plugs,
// dragged from an OUT socket to an IN socket; light pulses and item tokens travel along them, and each carries an
// engraved tag (its items, rate, priority lamps, a relay lamp for conditions, and why it stalls). The board lays
// itself out (chains in columns, the rest on shelves). Wheel zooms, dragging the panel pans.
// The model: src/logistics/network.ts. The inspector is ./panel.ts, the guide ./tutorial.ts.
import './nodes.css';
import '../build/build.css';
import type { Factory } from '../../factory/factory';
import type { Worker } from '../../factory/workers';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import { LOGIC, LOGIC_NAME, isLogic, type LNode, type Route, type LogicKind, type Chain, type Template } from '../../logistics/network';
import { VSC } from '../build/vignette';
import { art } from '../build/art';
import { bezAt } from '../build/ink';
import { Panel } from './panel';
import { Tutorial } from './tutorial';
import { el, toast } from '../kit';
import { sfx } from '../../audio/audio';

export type Tool = 'select' | 'wire' | 'field' | 'template' | LogicKind;
export type Sel = { k: 'node'; id: string } | { k: 'route'; id: number } | null;
/** a pinned card on the board, in art px (1 art px = 2 screen px): its centre, its rect and its plug */
interface Card { n: LNode; x: number; y: number; tx: number; ty: number; tw: number; th: number; px: number; py: number; r: number }
const D2 = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const FONT = '11px Body, monospace';
/** patch cable colours (by route), machined steel, LEDs */
const CABLES = ['#c0392b', '#e0a020', '#2f7fc0', '#3fa04a', '#d0602a', '#8e5ab0', '#2aa0a0'];
const STEEL = '#3d4650', STEEL_HI = '#6b7782', STEEL_LO = '#262c33';
const LED_G = '#7fe07a', LED_A = '#f0b040', LED_R = '#ff5a40';

export class NodeMap {
  readonly root: HTMLDivElement;
  private glass: HTMLDivElement; private cv: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private toolsEl: HTMLDivElement; private topEl: HTMLDivElement; private botEl: HTMLDivElement; private hintEl: HTMLDivElement;
  readonly panel: Panel;
  readonly tut: Tutorial;
  isOpen = false;
  /** the view: the board point at the middle of the glass (world m) and the zoom (art px per metre) */
  cam = { x: 0, z: 0, s: 6 };
  sel: Sel = null;
  multi = new Set<string>();
  tool: Tool = 'select';
  tpl: Template | null = null;
  private drag: { mode: 'pan' | 'node' | 'wire' | 'box' | 'maybe'; sx: number; sy: number; x: number; y: number; id?: string; ox?: number; oz?: number; on: boolean } | null = null;
  private hover: { node: string | null; route: number | null; port: boolean } = { node: null, route: null, port: false };
  private cards = new Map<string, Card>();
  private icons = new Map<string, HTMLImageElement>();
  private t = 0; private W = 0; private H = 0;
  private topKey = ''; private botT = 0; private bgKey = '';
  /** the board's own arrangement for cards nobody has moved: wired chains in columns by depth, the rest on shelves */
  private auto = new Map<string, [number, number]>(); private autoKey = '';

  constructor(readonly f: Factory) {
    // on the body, over every other HUD piece while it is open
    const r = (this.root = el('div', 'cr nmap', document.body));
    this.topEl = el('div', 'nm-top', r);
    this.toolsEl = el('div', 'nm-tools', r);
    this.glass = el('div', 'nm-glass', r);
    this.cv = el('canvas', 'map', this.glass);
    this.ctx = this.cv.getContext('2d')!;
    el('div', 'nm-legend cr-s', this.glass, `<span><i style="background:${CABLES[0]}"></i>CABLE</span><span><i style="background:#fff2b8"></i>FLOWING</span><span><i style="background:${LED_A}"></i>STALLED</span><span><i style="background:#59606a"></i>OFF</span>`);
    this.hintEl = el('div', 'nm-hint cr-s', this.glass);
    const side = el('div', 'nm-side', r);
    this.panel = new Panel(this, side);
    this.botEl = el('div', 'nm-bot cr-s', r);
    this.tut = new Tutorial(this, this.glass);
    r.addEventListener('pointerdown', (e) => e.stopPropagation());
    r.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
    this.cv.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    this.cv.addEventListener('wheel', this.onWheel, { passive: false });
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', this.onKey, true);
    this.L.onChange.push(() => { this.panel.dirty(); this.topKey = ''; });
    this.renderTools();
  }
  get L() { return this.f.logistics; }
  get g() { return this.f.g; }
  dispose() { removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); document.removeEventListener('keydown', this.onKey, true); this.root.remove(); }

  open() {
    if (this.isOpen) return;
    this.isOpen = true; this.root.classList.add('on'); document.body.classList.add('nm-open');
    // the toast column comes up over the map while it is open (it lives in #ui, under everything here)
    const tb = document.querySelector('#ui > .toasts'); if (tb) document.body.appendChild(tb);
    this.L.sync(true);
    this.topKey = '';
    this.renderTop(); this.renderBot();
    this.fit();
    this.panel.dirty();
    this.renderTools();
    sfx('open', 0.8, 0.6);
    this.tut.opened();
  }
  close() {
    if (!this.isOpen) return; this.isOpen = false; this.root.classList.remove('on'); document.body.classList.remove('nm-open');
    const tb = document.querySelector('body > .toasts'), u = document.getElementById('ui'); if (tb && u) u.appendChild(tb);
    this.drag = null; this.setTool('select'); sfx('close', 0.8, 0.5);
  }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  // ------------------------------------------------------------------ view
  /** frame the colony: every node on the board in view */
  fit() {
    this.size();
    const ns = this.L.nodes; if (!ns.length) return;
    this.arrange();
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const n of ns) { const [x, z] = this.pos(n); x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    // as close as fits, but never so far out that the cards lose their second line; a board wider than the glass
    // starts at its left edge (where the chains begin) and pans
    this.cam.s = Math.max(5.2, Math.min(8, Math.min((this.W - 124) / Math.max(1, x1 - x0), (this.H - 96) / Math.max(1, z1 - z0))));
    this.cam.x = (x1 - x0) * this.cam.s > this.W - 124 ? x0 + (this.W / 2 - 66) / this.cam.s : (x0 + x1) / 2;
    this.cam.z = (z1 - z0) * this.cam.s > this.H - 96 ? z0 + (this.H / 2 - 50) / this.cam.s : (z0 + z1) / 2;
  }
  private size() {
    const r = this.glass.getBoundingClientRect();
    const W = Math.max(10, Math.floor(r.width / VSC)), H = Math.max(10, Math.floor(r.height / VSC));
    if (W !== this.W || H !== this.H) { this.W = W; this.H = H; this.cv.width = W; this.cv.height = H; this.cv.style.width = W * VSC + 'px'; this.cv.style.height = H * VSC + 'px'; }
  }
  /** a board point (world m) to art px on the glass */
  private proj(x: number, _y: number, z: number): [number, number, boolean] {
    return [Math.round(this.W / 2 + (x - this.cam.x) * this.cam.s), Math.round(this.H / 2 + (z - this.cam.z) * this.cam.s), true];
  }
  /** art px on the glass to a board point */
  private ground(ax: number, ay: number): [number, number] | null {
    return [this.cam.x + (ax - this.W / 2) / this.cam.s, this.cam.z + (ay - this.H / 2) / this.cam.s];
  }
  /** the steel panelling moves with the board */
  private board() {
    const gb = this.glass.getBoundingClientRect(), ox = Math.round(gb.left + (this.W / 2 - this.cam.x * this.cam.s) * VSC), oy = Math.round(gb.top + (this.H / 2 - this.cam.z * this.cam.s) * VSC);
    const bx = ((ox % 256) + 256) % 256, by = ((oy % 192) + 192) % 192, k = `${bx},${by}`;
    if (k !== this.bgKey) { this.bgKey = k; this.root.style.backgroundPosition = `${bx}px ${by}px`; }
  }
  setTool(t: Tool) {
    if (isLogic(t as never)) { const id = 'logic.' + t; if (!this.L.unlocked(id)) { sfx('deny'); toast(`<b>${LOGIC_NAME[t as LogicKind]}</b>: ${this.L.lockWhy(id).toLowerCase()}`, 'warn', 2000); return; } }
    this.tool = this.tool === t && t !== 'select' ? 'select' : t;
    if (this.tool !== 'template') this.tpl = null;
    this.renderTools();
    const hint: Partial<Record<Tool, string>> = { wire: 'CLICK A SOURCE, THEN ITS TARGET', field: 'CLICK THE MAP TO MARK A HARVEST FIELD', template: `CLICK WHERE TO LAY ${this.tpl?.name ?? 'THE TEMPLATE'}` };
    const h = isLogic(this.tool as never) ? `CLICK THE MAP TO SET DOWN A ${LOGIC_NAME[this.tool as LogicKind]}, THEN WIRE IT IN` : hint[this.tool] ?? '';
    this.hintEl.textContent = h; this.hintEl.classList.toggle('on', !!h);
  }
  layTemplate(t: Template) { this.tpl = t; this.tool = 'select'; this.setTool('template'); }
  select(s: Sel) { this.sel = s; this.multi.clear(); this.panel.dirty(); }

  // ------------------------------------------------------------------ the tool tray: chits with drawn glyphs
  private renderTools() {
    const L = this.L;
    const tools: [Tool, string, string][] = [['select', 'PICK', 'S'], ['wire', 'WIRE', 'W'], ['field', 'FIELD', 'F']];
    let h = `<div class="h cr-s">TOOLS</div>`;
    for (const [t, n, key] of tools) h += `<div class="nm-tool ${this.tool === t ? 'on' : ''}" data-t="${t}"><canvas width="24" height="24" data-g="${t}"></canvas><span class="nm2 cr-s">${n}</span><span class="hk cr-s">${key}</span></div>`;
    h += `<div class="nm-tool" data-a="fit"><canvas width="24" height="24" data-g="fit"></canvas><span class="nm2 cr-s">FIT</span></div>`;
    h += `<div class="h cr-s">GADGETS</div>`;
    for (const lk of LOGIC) {
      const ok = L.unlocked('logic.' + lk);
      h += `<div class="nm-tool ${this.tool === lk ? 'on' : ''} ${ok ? '' : 'lock'}" data-t="${lk}" title="${ok ? LOGIC_NAME[lk] : L.lockWhy('logic.' + lk)}"><canvas width="24" height="24" data-g="${lk}"></canvas><span class="nm2 cr-s">${ok ? LOGIC_NAME[lk] : 'LOCKED'}</span></div>`;
    }
    h += `<div class="nm-tool" data-a="tidy"><canvas width="24" height="24" data-g="tidy"></canvas><span class="nm2 cr-s">TIDY</span><span class="hk cr-s">T</span></div>`;
    this.toolsEl.innerHTML = h;
    this.toolsEl.querySelectorAll<HTMLCanvasElement>('canvas[data-g]').forEach((c) => glyph(c.getContext('2d')!, c.dataset.g!, !c.closest('.lock')));
    this.toolsEl.querySelectorAll<HTMLElement>('[data-t]').forEach((e) => e.addEventListener('click', () => { this.setTool(e.dataset.t as Tool); sfx('click', 1.2, 0.4); }));
    this.toolsEl.querySelector('[data-a="fit"]')!.addEventListener('click', () => { this.fit(); sfx('click', 1.2, 0.4); });
    this.toolsEl.querySelector('[data-a="tidy"]')!.addEventListener('click', () => this.tidy());
  }

  /** zoomed out far enough that cards drop their second line */
  private compact() { return this.cam.s < 5.2; }
  /** where a card sits on the board (world m): where the player pinned it, else the board's own arrangement */
  pos(n: LNode): [number, number] { return this.pinned(n) ? [n.x, n.z] : this.auto.get(n.id) ?? [n.x, n.z]; }
  private pinned(n: LNode) { return isLogic(n.kind) ? !!n.cfg.pin : !!n.tidy; }
  /** the board's arrangement: every wired chain left to right by depth (rows kept in world order), and below it,
   *  shelves of the unwired cards by kind. Recomputed when the nodes or the wires change. */
  private arrange() {
    const L = this.L;
    const key = this.W + '|' + L.nodes.map((n) => n.id + (this.pinned(n) ? '*' : '')).join(',') + '|' + L.routes.map((r) => r.from + '>' + r.to).join(',');
    if (key === this.autoKey) return;
    this.autoKey = key;
    this.auto.clear();
    // spacing in art px at the reference zoom (6 px per m): room for a card and a tag between columns
    const S0 = 6, CX = 200 / S0, CZ = 86 / S0, SX = 122 / S0, wired = new Set<string>();
    for (const r of L.routes) { wired.add(r.from); wired.add(r.to); }
    const depth = new Map<string, number>();
    for (const id of wired) if (!L.routes.some((r) => r.to === id)) depth.set(id, 0);
    for (let it = 0; it < 12; it++) for (const r of L.routes) { const d = depth.get(r.from); if (d !== undefined && (depth.get(r.to) ?? -1) < d + 1) depth.set(r.to, d + 1); }
    for (const id of wired) if (!depth.has(id)) depth.set(id, 0);
    let cx = 0, cz = 0; for (const n of L.nodes) { cx += n.x; cz += n.z; } cx /= Math.max(1, L.nodes.length); cz /= Math.max(1, L.nodes.length);
    const cols = new Map<number, LNode[]>();
    for (const n of L.nodes) if (wired.has(n.id)) { const d = depth.get(n.id)!; if (!cols.has(d)) cols.set(d, []); cols.get(d)!.push(n); }
    const D = cols.size ? Math.max(...cols.keys()) : 0;
    let rows = 0;
    for (const [d, list] of cols) { list.sort((a, b) => a.z - b.z); rows = Math.max(rows, list.length); list.forEach((n, i) => this.auto.set(n.id, [cx + (d - D / 2) * CX, cz + (i - (list.length - 1) / 2) * CZ])); }
    const ORDER = ['pod', 'container', 'building', 'site', 'deposit', 'field', 'split', 'merge', 'buffer', 'counter', 'gate', 'timer', 'sensor'];
    const rest = L.nodes.filter((n) => !wired.has(n.id)).sort((a, b) => (ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)) || a.x - b.x);
    const per = Math.max(3, Math.floor((this.W - 30) / (SX * S0))), z0 = cz + (Math.max(1, rows) / 2 + 0.75) * CZ + (rows ? 0.5 : 0) * CZ;
    // shelves start under the first column of the chains (or sit centred when nothing is wired)
    const xL = cols.size ? cx - (D / 2) * CX : null;
    rest.forEach((n, i) => { const row = Math.floor(i / per), inRow = Math.min(per, rest.length - row * per); this.auto.set(n.id, [xL !== null ? xL + (i % per) * SX : cx + ((i % per) - (inRow - 1) / 2) * SX, z0 + row * CZ]); });
  }
  /** TIDY (T): every card the player moved goes back into the board's arrangement */
  tidy() {
    for (const n of this.L.nodes) { if (isLogic(n.kind)) n.cfg.pin = false; else n.tidy = false; }
    this.autoKey = ''; this.arrange(); this.fit();
    sfx('done', 1.1, 0.5);
  }

  // ------------------------------------------------------------------ input
  private nodeAt(x: number, y: number): { id: string; port: boolean } | null {
    let best: { id: string; port: boolean } | null = null, bd = 1e9;
    for (const c of this.cards.values()) {
      if (c.n.kind !== 'sensor' && c.n.kind !== 'site' && D2(x, y, c.px, c.py) < 7) return { id: c.n.id, port: true };
      if (x >= c.tx && x <= c.tx + c.tw && y >= c.ty && y <= c.ty + c.th) return { id: c.n.id, port: false };
      const d = D2(x, y, c.x, c.y);
      if (d < c.r && d < bd) { bd = d; best = { id: c.n.id, port: false }; }
    }
    return best;
  }
  private routeAt(x: number, y: number): number | null {
    let best: number | null = null, bd = 6;
    for (const r of this.L.routes) {
      const pts = this.wirePts(r); if (!pts) continue;
      const m = this.tagRect(r); if (m && x >= m[0] && x <= m[0] + m[2] && y >= m[1] && y <= m[1] + m[3]) return r.id;
      for (let i = 0; i <= 32; i++) { const p = bezAt(pts, i / 32), d = D2(x, y, p[0], p[1]); if (d < bd) { bd = d; best = r.id; } }
    }
    return best;
  }
  /** a pointer position in art px on the overlay */
  private rel(e: PointerEvent | WheelEvent) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / VSC, y: (e.clientY - r.top) / VSC }; }
  private onDown = (e: PointerEvent) => {
    const p = this.rel(e), L = this.L;
    e.preventDefault();
    if (e.button === 1 || e.button === 2) { this.drag = { mode: 'pan', sx: p.x, sy: p.y, x: p.x, y: p.y, on: false, id: e.button === 2 ? 'r' : undefined }; return; }
    if (e.button !== 0) return;
    const hit = this.nodeAt(p.x, p.y);
    if (this.drag?.mode === 'wire') {
      const from = this.drag.id!; this.drag = null;
      if (hit && hit.id !== from) { const r = L.addRoute(from, hit.id); if (r) { this.select({ k: 'route', id: r.id }); sfx('done', 1.2, 0.5); this.tut.poke(); } }
      return;
    }
    if (!hit && (this.tool === 'field' || isLogic(this.tool as never) || this.tool === 'template')) {
      const gp = this.ground(p.x, p.y); if (!gp) return;
      const [wx, wz] = gp;
      if (this.tool === 'field') { const n = L.addField(wx, wz, 8); this.select({ k: 'node', id: n.id }); sfx('build', 1.3, 0.5); this.setTool('select'); }
      else if (this.tool === 'template' && this.tpl) { const miss = L.applyTemplate(this.tpl, wx, wz); toast(miss.length ? `Template laid, but: ${miss.join('; ')}` : `<b>${this.tpl.name}</b> laid: missing buildings are construction sites`, miss.length ? 'warn' : 'good', 2800); sfx('done', 1, 0.6); this.setTool('select'); }
      else { const n = L.addLogic(this.tool as LogicKind, wx, wz); if (n) { n.cfg.pin = true; this.select({ k: 'node', id: n.id }); sfx('build', 1.4, 0.5); this.setTool('select'); } }
      return;
    }
    if (hit && (hit.port || this.tool === 'wire' || e.altKey)) { this.drag = { mode: 'wire', sx: p.x, sy: p.y, x: p.x, y: p.y, id: hit.id, on: true }; sfx('click', 1.4, 0.3); return; }
    if (hit) {
      const n = L.node(hit.id)!;
      if (e.shiftKey) { if (this.multi.has(hit.id)) this.multi.delete(hit.id); else this.multi.add(hit.id); this.panel.dirty(); return; }
      this.select({ k: 'node', id: hit.id });
      const [ox, oz] = this.pos(n);
      this.drag = { mode: 'node', sx: p.x, sy: p.y, x: p.x, y: p.y, id: hit.id, ox, oz, on: false };
      return;
    }
    const r = this.routeAt(p.x, p.y);
    if (r !== null) { this.select({ k: 'route', id: r }); sfx('click', 1.3, 0.35); return; }
    this.drag = { mode: e.shiftKey ? 'box' : 'maybe', sx: p.x, sy: p.y, x: p.x, y: p.y, on: false };
  };
  private onMove = (e: PointerEvent) => {
    if (!this.isOpen) return;
    const p = this.rel(e), d = this.drag;
    if (!d) { const h = this.nodeAt(p.x, p.y); this.hover.node = h?.id ?? null; this.hover.port = !!h?.port; this.hover.route = h ? null : this.routeAt(p.x, p.y); return; }
    const lx = d.x, ly = d.y;
    d.x = p.x; d.y = p.y;
    if (!d.on && D2(p.x, p.y, d.sx, d.sy) > 3) { d.on = true; if (d.mode === 'maybe') d.mode = 'pan'; }
    if (!d.on) return;
    if (d.mode === 'pan') { this.cam.x -= (p.x - lx) / this.cam.s; this.cam.z -= (p.y - ly) / this.cam.s; }
    else if (d.mode === 'node') { const n = this.L.node(d.id!); if (n) { n.x = d.ox! + (p.x - d.sx) / this.cam.s; n.z = d.oz! + (p.y - d.sy) / this.cam.s; n.tidy = true; if (isLogic(n.kind)) n.cfg.pin = true; } }
    else if (d.mode === 'wire') { const h = this.nodeAt(p.x, p.y); this.hover.node = h?.id ?? null; }
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d || !this.isOpen) return;
    this.drag = null;
    const p = this.rel(e), L = this.L;
    if (d.mode === 'pan' && d.id === 'r' && !d.on) { if (this.tool !== 'select') this.setTool('select'); else this.select(null); return; }
    if (d.mode === 'wire') {
      const h = this.nodeAt(p.x, p.y);
      if (h && h.id !== d.id) { const r = L.addRoute(d.id!, h.id); if (r) { this.select({ k: 'route', id: r.id }); sfx('done', 1.2, 0.5); this.tut.poke(); } }
      else if (D2(p.x, p.y, d.sx, d.sy) < 3) this.drag = { ...d, on: true }; // a click on the plug: keep wiring until the next click
      return;
    }
    if (d.mode === 'node' && d.on) { const n = L.node(d.id!); if (n) L.moveNode(n, n.x, n.z); return; }
    if (d.mode === 'box') {
      const x0 = Math.min(d.sx, p.x), x1 = Math.max(d.sx, p.x), y0 = Math.min(d.sy, p.y), y1 = Math.max(d.sy, p.y);
      for (const c of this.cards.values()) if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) this.multi.add(c.n.id);
      this.sel = null; this.panel.dirty();
      return;
    }
    if (d.mode === 'maybe' && !d.on) this.select(null);
  };
  /** zoom about the cursor */
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.rel(e), a = this.ground(p.x, p.y)!;
    this.cam.s = Math.max(1.2, Math.min(14, this.cam.s * (e.deltaY > 0 ? 0.89 : 1.12)));
    const b = this.ground(p.x, p.y)!; this.cam.x += a[0] - b[0]; this.cam.z += a[1] - b[1];
  };
  private onKey = (e: KeyboardEvent) => {
    if (!this.isOpen) return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.ctrlKey || e.metaKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'p') return; // pause still works
    e.stopPropagation();
    if (k === 'Escape') { if (this.drag?.mode === 'wire') this.drag = null; else if (this.tool !== 'select') this.setTool('select'); else if (this.sel || this.multi.size) this.select(null); else this.close(); e.preventDefault(); return; }
    if (k === 'n') { this.close(); return; }
    if (k === 'f') { this.fit(); return; }
    if (k === 't') { this.tidy(); return; }
    if (k === 'w') { this.setTool('wire'); return; }
    if (k === 's') { this.setTool('select'); return; }
    if (k === 'Delete' || k === 'Backspace' || k === 'x') { this.deleteSel(); return; }
  };
  deleteSel() {
    const L = this.L, s = this.sel;
    if (s?.k === 'route') { L.removeRoute(s.id); this.select(null); sfx('crack', 1.4, 0.4); return; }
    if (s?.k === 'node') { const n = L.node(s.id); if (n && (isLogic(n.kind) || n.kind === 'field')) { L.removeNode(n.id); this.select(null); sfx('crack', 1.4, 0.4); } else toast('Only gadgets and fields come off the table: dismantle a building in build mode', 'info', 1800); }
  }

  // ------------------------------------------------------------------ geometry on the overlay
  /** a patch cable from the source module's OUT jack to the target's IN jack: it leaves and arrives level, and sags */
  wirePts(r: Route): number[][] | null {
    const a = this.cards.get(r.from), b = this.cards.get(r.to); if (!a || !b) return null;
    const ax = a.px + 7, ay = a.py, bx = b.tx - 10, by = b.ty + 18;
    const dx = bx - ax, L = Math.hypot(dx, by - ay) || 1, reach = Math.max(26, Math.abs(dx) * 0.4), sag = Math.min(30, 4 + L * 0.1);
    return [[ax, ay], [ax + reach, ay + sag], [bx - reach, by + sag], [bx, by]];
  }
  /** the engraved tag hangs just above the middle of its cable */
  private tagRect(r: Route): [number, number, number, number] | null { const pts = this.wirePts(r); if (!pts) return null; const m = bezAt(pts, 0.5); return [Math.round(m[0] - 29), Math.round(m[1] - 28), 58, 20]; }

  // ------------------------------------------------------------------ drawing
  update(dt: number) {
    if (!this.isOpen) return;
    this.t += dt;
    this.size();
    this.board();
    this.layoutCards();
    this.draw();
    this.panel.update(dt);
    this.tut.update(dt);
    this.renderTop();
    this.botT -= dt; if (this.botT <= 0) { this.botT = 0.5; this.renderBot(); }
  }
  /** every node's module: where its board point falls, then nudged apart until no two modules overlap */
  private layoutCards() {
    const g = this.ctx;
    this.cards.clear();
    const list: Card[] = [];
    this.arrange();
    for (const n of this.L.nodes) {
      const [bx, bz] = this.pos(n), [x, y] = this.proj(bx, 0, bz);
      const name = isLogic(n.kind) ? LOGIC_NAME[n.kind as LogicKind] : n.name;
      // zoomed out, a module keeps its window and its name plate; zoomed in, also its read-out strip
      const small = this.compact(), sel = this.sel?.k === 'node' && this.sel.id === n.id;
      const tw = small && !sel ? 76 : Math.min(94, Math.max(72, this.tw(g, name) + 14, this.tw(g, this.subline(n)[0]) + 14)), th = small && !sel ? 50 : 64;
      list.push({ n, x, y, tx: 0, ty: 0, tw, th, px: 0, py: 0, r: 0 });
    }
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ox = (a.tw + b.tw) / 2 + 22 - Math.abs(a.x - b.x), oy = (a.th + b.th) / 2 + 12 - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy * 1.3) { const d = (a.x <= b.x ? -1 : 1) * ox / 2; a.x += d; b.x -= d; } else { const d = (a.y <= b.y ? -1 : 1) * oy / 2; a.y += d; b.y -= d; }
      }
      if (!moved) break;
    }
    for (const c of list) {
      c.tx = Math.round(c.x - c.tw / 2); c.ty = Math.round(c.y - c.th / 2); c.x = c.tx + c.tw / 2; c.y = c.ty + c.th / 2;
      c.px = c.tx + c.tw + 3; c.py = c.ty + 18; c.r = Math.max(c.tw, c.th) / 2;
      this.cards.set(c.n.id, c);
    }
  }
  private img(src: string) { let i = this.icons.get(src); if (!i) { i = new Image(); i.src = src; this.icons.set(src, i); } return i; }
  private itemImg(id: ItemId, px = 16) { return this.img(itemIcon(id, px)); }
  private R(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  private text(g: CanvasRenderingContext2D, s: string, x: number, y: number, c: string) { g.font = FONT; g.textBaseline = 'top'; g.fillStyle = c; g.fillText(s, Math.round(x), Math.round(y)); }
  private tw(g: CanvasRenderingContext2D, s: string) { g.font = FONT; return Math.ceil(g.measureText(s).width); }
  /** a machined plate: dark outline, lit top and left edge, shaded bottom and right */
  private plate(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, body = STEEL, out = '#14181d') {
    this.R(g, x, y, w, h, out); this.R(g, x + 1, y + 1, w - 2, h - 2, body);
    this.R(g, x + 1, y + 1, w - 2, 1, STEEL_HI); this.R(g, x + 1, y + 1, 1, h - 2, STEEL_HI);
    this.R(g, x + 1, y + h - 2, w - 2, 1, STEEL_LO); this.R(g, x + w - 2, y + 1, 1, h - 2, STEEL_LO);
  }
  /** a recess cut into a plate */
  private recess(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = '#11161b') {
    this.R(g, x, y, w, h, STEEL_LO); this.R(g, x + 1, y + 1, w - 1, h - 1, STEEL_HI); this.R(g, x + 1, y + 1, w - 2, h - 2, fill);
  }
  private screw(g: CanvasRenderingContext2D, x: number, y: number) { this.R(g, x, y, 3, 3, '#14181d'); this.R(g, x, y, 2, 2, '#c4ccd2'); this.R(g, x + 1, y, 1, 2, '#6b7782'); }
  /** an LED in its bezel */
  private led(g: CanvasRenderingContext2D, x: number, y: number, col: string | null, on = true) {
    this.R(g, x - 1, y - 1, 6, 6, '#14181d'); this.R(g, x, y, 4, 4, col && on ? col : '#2a3038');
    if (col && on) this.R(g, x, y, 2, 1, 'rgba(255,255,255,0.7)');
  }
  /** a filled disk, pixel by pixel */
  private disk(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: string) { g.fillStyle = col; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6)); g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); } }
  private line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col: string, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); g.fillStyle = col;
    for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), w, w);
  }
  /** a socket: a dark ring with a hole, mounted on a module's edge */
  private socket(g: CanvasRenderingContext2D, x: number, y: number, lit: boolean) {
    this.disk(g, x, y, 4, '#14181d'); this.disk(g, x, y, 3, lit ? '#c49a3a' : '#8a96a2'); this.disk(g, x, y, 1, '#0a0d10'); this.R(g, x - 2, y - 3, 2, 1, '#f0f3f5');
  }
  /** a jack plug in a socket: a steel sleeve and a coloured boot, pointing along `dir` (+1 right, -1 left) */
  private jack(g: CanvasRenderingContext2D, x: number, y: number, dir: number, col: string) {
    const x0 = dir > 0 ? x : x - 8;
    this.R(g, x0, y - 2, 8, 5, '#14181d'); this.R(g, x0 + (dir > 0 ? 0 : 3), y - 1, 5, 3, '#c4ccd2'); this.R(g, x0 + (dir > 0 ? 0 : 3), y - 1, 5, 1, '#f0f3f5');
    this.R(g, x0 + (dir > 0 ? 5 : 0), y - 2, 3, 5, col); this.R(g, x0 + (dir > 0 ? 5 : 0), y - 2, 3, 1, 'rgba(255,255,255,0.35)');
  }
  private draw() {
    const g = this.ctx, W = this.W, H = this.H, L = this.L;
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    // signal leads (sensor probes, signal conditions): thin blue wires
    for (const n of L.nodes) {
      const c = this.cards.get(n.id); if (!c) continue;
      const links: string[] = [];
      if (n.kind === 'sensor' && n.cfg.probe) links.push(n.cfg.probe);
      for (const cd of [...(n.cfg.conds ?? []), ...L.routes.filter((r) => r.from === n.id || r.to === n.id).flatMap((r) => r.conds)]) if (cd.k === 'signal' && cd.node) links.push(cd.node);
      const selId = this.sel?.k === 'node' ? this.sel.id : null, selR = this.sel?.k === 'route' ? L.routes.find((r) => r.id === (this.sel as { id: number }).id) : null;
      // a signal lead shows while either end is picked or hovered (it would cross the whole bay otherwise)
      for (const id of links) { const o = this.cards.get(id), on = selId === n.id || selId === id || this.hover.node === n.id || this.hover.node === id || !!selR?.conds.some((cd) => cd.node === id); if (o && on) this.cable(g, [[o.x, o.ty + o.th], [o.x, o.ty + o.th + 20], [c.x, c.ty + c.th + 20], [c.x, c.ty + c.th]], n.sig || L.node(id)?.sig ? '#f0b040' : '#4a8ad0', 1, false, 0); }
    }
    for (const c of this.cards.values()) this.module(g, c);
    for (const r of L.routes) this.wire(g, r);
    for (const r of L.routes) this.routeTag(g, r);
    for (const [w, j] of L.live) if (!j.chain && j.src && j.dst && w.carry) { const r = L.routes.find((x) => x.from === j.src!.id && x.to === j.dst!.id), pts = r ? this.wirePts(r) : null; if (pts) { const pt = bezAt(pts, this.prog(w, j.src, j.dst)); this.token(g, pt[0], pt[1], w.carry.id); } }
    for (const [w, j] of L.live) if (j.chain) this.chainToken(g, w, j.chain, j.item);
    const d = this.drag;
    if (d?.mode === 'wire' && d.on) {
      const a = this.cards.get(d.id!); if (a) {
        const h = this.hover.node ? L.node(this.hover.node) : null, src = L.node(d.id!)!;
        const bad = h && h.id !== src.id ? L.canWire(src, h) : null;
        const ax = a.px + 7, ay = a.py;
        this.cable(g, [[ax, ay], [ax + 26, ay + 12], [d.x - 26, d.y + 12], [d.x, d.y]], bad ? '#e0533e' : CABLES[L.routes.length % CABLES.length], 3, false, 0);
        this.jack(g, a.px, a.py, 1, bad ? '#e0533e' : CABLES[L.routes.length % CABLES.length]);
        this.jack(g, d.x + 8, d.y, -1, bad ? '#e0533e' : CABLES[L.routes.length % CABLES.length]);
        if (bad) { const s = bad.toUpperCase(), w = this.tw(g, s) + 10; this.plate(g, d.x + 10, d.y + 8, w, 15, '#3a2020'); this.text(g, s, d.x + 15, d.y + 10, '#ff9a7a'); }
      }
    }
    if (d?.mode === 'box' && d.on) {
      const x0 = Math.min(d.sx, d.x), y0 = Math.min(d.sy, d.y), x1 = Math.max(d.sx, d.x), y1 = Math.max(d.sy, d.y);
      for (let x = x0; x < x1; x += 4) { this.R(g, x, y0, 2, 1, '#f0b040'); this.R(g, x, y1, 2, 1, '#f0b040'); }
      for (let y = y0; y < y1; y += 4) { this.R(g, x0, y, 1, 2, '#f0b040'); this.R(g, x1, y, 1, 2, '#f0b040'); }
    }
  }
  /** a cable along a bezier: shadow, body, a highlight along its top; `pulse` > 0 sends light pulses along it */
  private cable(g: CanvasRenderingContext2D, pts: number[][], col: string, w: number, sel: boolean, pulse: number) {
    let len = 0; for (let i = 0; i < 3; i++) len += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const n = Math.max(8, Math.ceil(len / 1.2)), P: [number, number][] = [];
    for (let i = 0; i <= n; i++) P.push(bezAt(pts, i / n));
    g.fillStyle = 'rgba(8,10,14,0.4)'; for (const [x, y] of P) g.fillRect(Math.round(x) + 2, Math.round(y) + 3, w, w);
    if (sel) { g.fillStyle = '#f0f3f5'; for (const [x, y] of P) g.fillRect(Math.round(x) - 1, Math.round(y) - 1, w + 2, w + 2); }
    g.fillStyle = '#14181d'; for (const [x, y] of P) g.fillRect(Math.round(x), Math.round(y) + 1, w, w);
    g.fillStyle = col; for (const [x, y] of P) g.fillRect(Math.round(x), Math.round(y), w, w);
    if (w > 1) { g.fillStyle = 'rgba(255,255,255,0.32)'; for (const [x, y] of P) g.fillRect(Math.round(x), Math.round(y), w, 1); }
    if (pulse > 0) for (let k = 0; k < pulse; k++) {
      const [x, y] = bezAt(pts, ((this.t * 0.45) + k / pulse) % 1);
      this.R(g, x - 2, y - 2, w + 4, w + 4, 'rgba(255,240,180,0.35)'); this.R(g, x - 1, y - 1, w + 2, w + 2, '#fff2b8');
    }
  }
  /** a patch cable: coloured per route, pulses of light run along it while goods move, grey when switched off */
  private wire(g: CanvasRenderingContext2D, r: Route) {
    const pts = this.wirePts(r); if (!pts) return;
    const L = this.L, moving = r.inflight > 0 || (L.f.time - r.lastT < 12 && r.moved > 0);
    const sel = this.sel?.k === 'route' && this.sel.id === r.id, hov = this.hover.route === r.id;
    const col = !r.on ? '#59606a' : CABLES[r.id % CABLES.length];
    this.cable(g, pts, col, 3, sel || hov, moving && r.on ? 3 : 0);
    const a = this.cards.get(r.from)!, b = this.cards.get(r.to)!;
    this.jack(g, a.px, a.py, 1, col);
    this.jack(g, b.tx - 2, b.ty + 18, -1, col);
  }
  /** the engraved tag on a cable: its items, rate, priority lamps, a relay lamp for conditions, and why it stalls */
  private routeTag(g: CanvasRenderingContext2D, r: Route) {
    const pts = this.wirePts(r), rc = this.tagRect(r); if (!pts || !rc) return;
    const L = this.L, flow = L.flow(r.id), moving = r.inflight > 0 || (L.f.time - r.lastT < 12 && r.moved > 0);
    const m = bezAt(pts, 0.5), sel = this.sel?.k === 'route' && this.sel.id === r.id, stalled = !!r.note && !moving;
    const icons = r.filter.slice(0, 3);
    const rate = flow >= 1 ? `${Math.round(flow)}/M` : r.amount.mode === 'keep' ? `KEEP${r.amount.n}` : r.amount.mode === 'batch' ? `X${r.amount.n}` : r.amount.mode === 'rate' ? `<${r.amount.n}` : '';
    const w = Math.max(rc[2], 10 + (icons.length ? icons.length * 17 : this.tw(g, 'ANY') + 2) + (rate ? this.tw(g, rate) + 4 : 0) + (r.conds.length ? 12 : 0)), h = rc[3];
    const x0 = Math.round(m[0] - w / 2), y0 = rc[1];
    this.R(g, Math.round(m[0]), y0 + h, 1, Math.round(m[1]) - y0 - h, '#c4ccd2'); this.R(g, Math.round(m[0]) + 1, y0 + h, 1, Math.round(m[1]) - y0 - h, '#14181d'); // the stem
    this.R(g, m[0] - 2, m[1] - 2, 5, 4, '#14181d'); this.R(g, m[0] - 1, m[1] - 1, 3, 2, '#c4ccd2'); // the clamp on the cable
    this.plate(g, x0, y0, w, h, sel ? '#4d5865' : '#2f3740', sel ? '#f0b040' : '#14181d');
    let cx = x0 + 5;
    if (icons.length) for (const id of icons) { const im = this.itemImg(id); if (im.complete && im.naturalWidth) g.drawImage(im, cx, y0 + 2, 16, 16); cx += 17; }
    else { this.text(g, 'ANY', cx, y0 + 4, '#8a96a2'); cx += this.tw(g, 'ANY') + 2; }
    if (rate) { this.text(g, rate, cx + 2, y0 + 4, moving ? LED_G : '#d8dee3'); cx += this.tw(g, rate) + 4; }
    if (r.conds.length) this.led(g, x0 + w - 8, y0 + 3, LED_A, true);
    for (let i = 0; i < 5; i++) this.R(g, x0 + 5 + i * 4, y0 + h - 3, 3, 1, i < r.priority ? (r.priority >= 4 ? '#ff6a50' : LED_A) : '#4d5865');
    if (stalled) { const s = r.note, tw = this.tw(g, s) + 8, on = Math.floor(this.t * 2) % 2 === 0; this.plate(g, x0, y0 + h + 1, tw, 13, '#2a2016'); this.text(g, s, x0 + 4, y0 + h + 2, on ? LED_A : '#a07020'); }
  }
  /** progress of a carrying worker from a source to a target, 0..1 */
  private prog(w: Worker, src: LNode, dst: LNode) {
    const [ax, az] = this.L.pos(src), [bx, bz] = this.L.pos(dst), tot = Math.max(0.5, D2(ax, az, bx, bz));
    return Math.max(0, Math.min(1, 1 - D2(w.c.x, w.c.z, bx, bz) / tot));
  }
  private chainToken(g: CanvasRenderingContext2D, w: Worker, ch: Chain, item: ItemId) {
    const segs = ch.path.map((r) => this.wirePts(r)).filter((p): p is number[][] => !!p);
    if (!segs.length || !w.carry) return;
    const p = this.prog(w, ch.src, ch.dst), f = p * segs.length, i = Math.min(segs.length - 1, Math.floor(f));
    const pt = bezAt(segs[i], f - i);
    this.token(g, pt[0], pt[1], item);
  }
  /** a load riding a cable: the item in a round steel bezel */
  private token(g: CanvasRenderingContext2D, x: number, y: number, item: ItemId) {
    const cx = Math.round(x), cy = Math.round(y) - 1;
    this.disk(g, cx + 1, cy + 2, 10, 'rgba(8,10,14,0.4)'); this.disk(g, cx, cy, 10, '#14181d'); this.disk(g, cx, cy, 9, '#9aa6b0'); this.disk(g, cx, cy, 8, '#1b2026');
    const im = this.itemImg(item); if (im.complete && im.naturalWidth) g.drawImage(im, cx - 8, cy - 8, 16, 16);
  }
  /** a node's module on the bay: a machined housing with corner screws, a glass window with its picture (or, for a
   *  gadget, its dial or switch), an engraved name plate, a read-out strip, a status LED, and its IN and OUT sockets */
  private module(g: CanvasRenderingContext2D, c: Card) {
    const n = c.n, L = this.L, { tx, ty, tw, th } = c;
    const sel = (this.sel?.k === 'node' && this.sel.id === n.id) || this.multi.has(n.id), hov = this.hover.node === n.id;
    const logic = isLogic(n.kind), flash = this.tut.highlight(n.id) && Math.floor(this.t * 3) % 2 === 0;
    this.R(g, tx + 3, ty + 4, tw, th, 'rgba(8,10,14,0.45)');
    if (sel || flash) this.R(g, tx - 2, ty - 2, tw + 4, th + 4, sel ? '#f0b040' : '#c8891e');
    this.plate(g, tx, ty, tw, th, hov ? '#4d5865' : n.kind === 'site' ? '#4a4636' : STEEL);
    for (const [sx, sy] of [[tx + 3, ty + 3], [tx + tw - 6, ty + 3], [tx + 3, ty + th - 6], [tx + tw - 6, ty + th - 6]]) this.screw(g, sx, sy);
    const cx = Math.round(tx + tw / 2), wx = cx - 18, wy = ty + 4;
    // the window (or the gadget's control face)
    this.recess(g, wx, wy, 36, 28, logic ? '#1b2026' : '#0f1a24');
    const b = L.bld(n), site = n.kind === 'site' ? L.site(n) : null;
    if (logic) this.control(g, n, wx + 1, wy + 1);
    else {
      if (b || site) {
        const im = this.img(art((b?.kind ?? site!.kind) as never, 'small'));
        if (site) g.globalAlpha = 0.45;
        if (im.complete && im.naturalWidth) g.drawImage(im, wx + 2, wy + 2, 32, 24);
        g.globalAlpha = 1;
        if (site) { const pr = site.stage === 'build' ? Math.min(1, site.work / site.workNeed) : this.f.sites.progress(site) * 0.5; for (let i = 0; i < 8; i++) this.R(g, wx + 3 + i * 4, wy + 23, 3, 2, i < Math.round(pr * 8) ? LED_A : '#2a3038'); }
      } else if (n.kind === 'pod') this.podGlyph(g, cx, wy + 3);
      else if (n.kind === 'deposit') { const sm = L.seam(n); if (sm) { const im = this.itemImg(sm.item, 24); if (im.complete && im.naturalWidth) g.drawImage(im, cx - 12, wy + 2, 24, 24); } }
      else if (n.kind === 'field') this.treeGlyph(g, cx, wy + 3);
      // the glass: a glint across the top left
      this.R(g, wx + 2, wy + 2, 6, 1, 'rgba(220,235,255,0.35)'); this.R(g, wx + 2, wy + 3, 3, 1, 'rgba(220,235,255,0.2)'); this.R(g, wx + 2, wy + 2, 1, 4, 'rgba(220,235,255,0.25)');
    }
    // the name plate and the read-out strip
    const name = clip(g, logic ? LOGIC_NAME[n.kind as LogicKind] : n.name, tw - 10);
    this.recess(g, tx + 4, ty + 34, tw - 8, 14, '#232930');
    this.text(g, name, tx + 7, ty + 35, '#d8dee3');
    if (th > 52) { const [sub, sc] = this.subline(n); this.recess(g, tx + 4, ty + 49, tw - 8, 12, '#0d1114'); this.text(g, clip(g, sub, tw - 12), tx + 7, ty + 49, sc); }
    this.led(g, tx + tw - 10, ty + 6, this.lamp(n), true);
    // sockets: IN on the left edge, OUT on the right (a site takes, a sensor only signals)
    if (n.kind !== 'deposit' && n.kind !== 'field') this.socket(g, tx - 2, ty + 18, L.routes.some((r) => r.to === n.id));
    if (n.kind !== 'site' && n.kind !== 'sensor') { const hp = this.hover.node === n.id && this.hover.port; this.socket(g, c.px, c.py, hp || L.routes.some((r) => r.from === n.id)); if (hp) this.R(g, c.px - 6, c.py - 6, 13, 1, '#f0b040'); }
  }
  /** a gadget's face: a selector knob, a gauge, an odometer, a toggle switch, a clock dial or a needle meter */
  private control(g: CanvasRenderingContext2D, n: LNode, x: number, y: number) {
    const L = this.L, cx = x + 17, cy = y + 13;
    const knob = (a: number, ticks: number[]) => {
      for (const t of ticks) this.line(g, cx + Math.cos(t) * 10, cy + Math.sin(t) * 10, cx + Math.cos(t) * 12, cy + Math.sin(t) * 12, '#c4ccd2');
      this.disk(g, cx, cy, 8, '#14181d'); this.disk(g, cx, cy, 7, '#7d8994');
      for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; this.R(g, cx + Math.round(Math.cos(t) * 7), cy + Math.round(Math.sin(t) * 7), 1, 1, i % 2 ? '#4d5865' : '#c4ccd2'); } // knurling
      this.disk(g, cx, cy, 4, '#9aa6b0'); this.R(g, cx - 2, cy - 3, 2, 1, '#f0f3f5');
      this.line(g, cx, cy, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, '#e0533e', 2);
    };
    switch (n.kind) {
      case 'split': case 'merge': {
        const rs = L.routes.filter((r) => (n.kind === 'split' ? r.from : r.to) === n.id), k = Math.max(1, rs.length);
        const base = n.kind === 'split' ? 0 : Math.PI, ticks = rs.map((_, i) => base + (k === 1 ? 0 : -0.9 + (1.8 * i) / (k - 1)));
        const sent = Object.values(n.sent ?? {}).reduce((a, b) => a + b, 0), at = ticks.length ? ticks[sent % ticks.length] : base;
        knob(at, ticks); break;
      }
      case 'buffer': {
        const hi = n.cfg.hi ?? 30, lv = Math.min(1, (L.chains.length ? n.count : 0) / Math.max(1, hi));
        this.recess(g, cx - 5, y + 1, 10, 24, '#0d1114'); const fh = Math.round(22 * (n.open ? 0.35 + lv * 0.4 : 0.95));
        this.R(g, cx - 4, y + 24 - fh, 8, fh, n.open ? LED_G : LED_A); this.R(g, cx - 4, y + 24 - fh, 8, 1, 'rgba(255,255,255,0.4)');
        for (const f of [0.25, 0.85]) this.R(g, cx + 6, y + 24 - Math.round(22 * f), 3, 1, '#c4ccd2');
        break;
      }
      case 'counter': {
        const s = String(Math.min(999, n.count)).padStart(3, '0');
        for (let i = 0; i < 3; i++) { this.recess(g, x + 2 + i * 11, y + 6, 10, 15, '#e9e2cc'); this.text(g, s[i], x + 4 + i * 11, y + 7, '#1d2329'); }
        break;
      }
      case 'gate': {
        this.recess(g, cx - 8, cy + 2, 16, 8, '#2a3038'); this.screw(g, cx - 7, cy + 4); this.screw(g, cx + 5, cy + 4);
        const ty2 = n.open ? cy - 10 : cy + 12; this.line(g, cx, cy + 5, cx, ty2, '#c4ccd2', 2);
        this.disk(g, cx + 1, ty2, 3, '#14181d'); this.disk(g, cx + 1, ty2, 2, n.open ? '#6fd06a' : '#e0533e');
        break;
      }
      case 'timer': {
        const P = n.cfg.period ?? 120, on = n.cfg.on ?? 40, ph = (L.f.time % P) / P;
        this.disk(g, cx, cy, 11, '#14181d'); this.disk(g, cx, cy, 10, '#e9e2cc');
        for (let i = 0; i < 40; i++) { const f = i / 40; if (f <= on / P) { const t = -Math.PI / 2 + f * Math.PI * 2; this.R(g, cx + Math.round(Math.cos(t) * 9), cy + Math.round(Math.sin(t) * 9), 1, 1, '#3fa04a'); } }
        for (let i = 0; i < 4; i++) { const t = (i / 4) * Math.PI * 2; this.R(g, cx + Math.round(Math.cos(t) * 8), cy + Math.round(Math.sin(t) * 8), 1, 1, '#1d2329'); }
        const t = -Math.PI / 2 + ph * Math.PI * 2; this.line(g, cx, cy, cx + Math.cos(t) * 8, cy + Math.sin(t) * 8, '#c0392b'); this.R(g, cx - 1, cy - 1, 2, 2, '#1d2329');
        break;
      }
      case 'sensor': {
        const th0 = n.cfg.th ?? 10, v = Math.min(1.4, n.count / Math.max(1, th0)) / 1.4;
        for (let i = 0; i <= 20; i++) { const t = Math.PI + (i / 20) * Math.PI; this.R(g, cx + Math.round(Math.cos(t) * 13), cy + 8 + Math.round(Math.sin(t) * 13), 1, 1, i > 14 ? '#e0533e' : '#c4ccd2'); }
        const t = Math.PI + v * Math.PI; this.line(g, cx, cy + 8, cx + Math.cos(t) * 11, cy + 8 + Math.sin(t) * 11, n.sig ? LED_A : '#f0f3f5'); this.disk(g, cx, cy + 8, 2, '#7d8994');
        break;
      }
    }
  }
  /** the pod in its window: a capsule on legs */
  private podGlyph(g: CanvasRenderingContext2D, cx: number, y: number) {
    const x = cx - 10;
    for (const lx of [2, 9, 16]) this.R(g, x + lx, y + 18, 2, 4, '#7d8994');
    this.R(g, x + 2, y + 9, 17, 10, '#d8d0bc'); this.R(g, x + 2, y + 9, 4, 10, '#efe8d6'); this.R(g, x + 2, y + 13, 17, 3, '#2f5d8a');
    for (let i = 0; i < 7; i++) { const w = Math.round(Math.sqrt(1 - ((i - 7) / 7) ** 2) * 8); this.R(g, x + 10 - w, y + 2 + i, w * 2 + 1, 1, '#c8891e'); }
    this.R(g, x + 6, y + 4, 2, 2, '#f0d890');
  }
  /** a tree for a harvest field */
  private treeGlyph(g: CanvasRenderingContext2D, cx: number, y: number) {
    this.R(g, cx - 1, y + 15, 2, 6, '#7a5a30');
    for (let i = 0; i < 14; i++) { const w = Math.floor(i / 2) + 1; this.R(g, cx - w, y + 1 + i, w * 2, 1, i % 3 === 0 ? '#2e6a24' : '#6fbf4a'); }
  }
  private lamp(n: LNode): string | null {
    const b = this.L.bld(n);
    if (b && (b.def.station || b.def.extract)) return b.status === 'working' ? LED_G : b.status === 'nopower' ? LED_R : b.status === 'idle' ? null : LED_A;
    if (n.kind === 'gate' || n.kind === 'timer' || n.kind === 'counter' || n.kind === 'buffer') return n.open ? LED_G : LED_A;
    if (n.kind === 'sensor') return n.sig ? LED_A : null;
    if (n.kind === 'container' || n.kind === 'pod') return this.L.routes.some((r) => (r.to === n.id || r.from === n.id) && r.inflight > 0) ? LED_G : null;
    return null;
  }
  /** the second line of a tag: what it holds, makes, or is doing */
  private subline(n: LNode): [string, string] {
    const L = this.L, top = (ids: ItemId[], f: (id: ItemId) => number) => ids.map((id) => [id, f(id)] as [ItemId, number]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id, v]) => `${short(id)} ${v}`).join(' ');
    const dim = '#8a96a2', warn = LED_A, INK = '#d8dee3', PENCIL_G = LED_G;
    switch (n.kind) {
      case 'pod': return [top(L.offers(n), (id) => L.level(n, id)) || 'EMPTY', dim];
      case 'container': { const s = top(L.offers(n), (id) => L.level(n, id)); return [s || 'EMPTY', s ? INK : dim]; }
      case 'building': {
        const b = L.bld(n)!; if (!b) return ['', dim];
        if (b.recipe) { const o = Object.keys(b.recipe.out)[0]; return [`${b.status === 'working' ? 'MAKING' : b.status.toUpperCase()} ${o ? short(o) : ''}`.trim(), b.status === 'working' ? PENCIL_G : warn]; }
        if (b.def.extract === 'node') { const s = L.f.seams[b.seam]; return [s ? `MINING ${short(s.item)}` : 'NO SEAM', PENCIL_G]; }
        return [b.status === 'working' ? 'WORKING' : b.status.toUpperCase(), dim];
      }
      case 'deposit': { const s = L.seam(n); return s ? [s.drill ? 'BURIED: DRILL ONLY' : `${Math.floor(s.amount)} LEFT`, s.drill ? warn : dim] : ['', dim]; }
      case 'field': { const fl = L.fieldOf(n); return [`${fl?.r ?? 0} M · ${L.fieldYields(n).slice(0, 2).map(short).join(' ')}`, dim]; }
      case 'site': { const s = L.site(n); return s ? [s.stage === 'build' ? `BUILDING ${Math.round(Math.min(1, s.work / s.workNeed) * 100)}%` : `SUPPLY ${Math.round(L.f.sites.progress(s) * 200)}%`, warn] : ['', dim]; }
      case 'split': return [`${L.routes.filter((r) => r.from === n.id).length} OUT`, dim];
      case 'merge': return [`${L.routes.filter((r) => r.to === n.id).length} IN`, dim];
      case 'buffer': return [`${n.open ? 'FILL' : 'FULL'} ${n.cfg.lo}-${n.cfg.hi}`, n.open ? PENCIL_G : warn];
      case 'counter': return [`${n.count}/${n.cfg.n}`, n.open ? PENCIL_G : warn];
      case 'gate': return [n.open ? 'OPEN' : 'SHUT', n.open ? PENCIL_G : warn];
      case 'timer': { const P = n.cfg.period ?? 120, ph = L.f.time % P; return [`${n.open ? 'ON' : 'OFF'} ${Math.ceil(n.open ? (n.cfg.on ?? 40) - ph : P - ph)}S`, n.open ? PENCIL_G : warn]; }
      case 'sensor': return [`${n.sig ? 'SIGNAL' : 'QUIET'} ${n.cfg.what === 'count' ? n.count : ''}`, n.sig ? warn : dim];
      default: return ['', dim];
    }
  }

  // ------------------------------------------------------------------ the strips
  private renderTop() {
    const L = this.L, nx = L.nextTier(), tier = L.tier;
    const key = `${tier}|${nx?.at}|${L.auto}|${L.templates.length}|${this.tut.step}|${L.nodes.length}|${L.routes.length}`;
    if (key === this.topKey) return;
    this.topKey = key;
    const segs = 30, on = nx ? Math.floor((nx.at / nx.need) * segs) : segs;
    this.topEl.innerHTML = `<span class="nm-title cr-tl">LOGISTICS</span><span class="cr-s nm-sub">${L.nodes.length} NODES<br>${L.routes.length} WIRES</span><span class="sp"></span>
      <div class="nm-disc"><div class="t cr-s">DISCIPLINE<b>LEVEL ${['0', 'I', 'II', 'III', 'IV', 'V'][tier]}</b></div><div class="bar">${Array.from({ length: segs }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>
      <div class="nx cr-s">${nx ? `NEXT: ${nx.names.join(', ').toUpperCase()} · ${nx.need - nx.at} TO ROUTE` : 'EVERY GADGET LEARNED'}</div></div>
      <span class="cr-chit sm ${L.auto ? 'on' : ''}" data-a="auto" title="Free haulers guess their own work when no route wants them">AUTO HAUL ${L.auto ? 'ON' : 'OFF'}</span>
      <span class="cr-chit" data-a="tpl">TEMPLATES</span><span class="cr-chit ${this.tut.step > 0 && this.tut.step < 99 ? 'on' : ''}" data-a="tut">GUIDE</span><span class="cr-chit" data-a="close">CLOSE <span class="cr-key">N</span></span>`;
    this.topEl.querySelector('[data-a="auto"]')!.addEventListener('click', () => { L.auto = !L.auto; this.topKey = ''; sfx('click', 1, 0.5); toast(L.auto ? 'Free haulers will find their own work when no route wants them' : 'Haulers now carry only what the wires say', 'info', 2200); });
    this.topEl.querySelector('[data-a="tpl"]')!.addEventListener('click', () => { this.panel.showTemplates(); });
    this.topEl.querySelector('[data-a="tut"]')!.addEventListener('click', () => this.tut.start());
    this.topEl.querySelector('[data-a="close"]')!.addEventListener('click', () => this.close());
  }
  private renderBot() {
    const L = this.L, ws = this.f.workers.list.filter((w) => !w.c.dead);
    const haul = ws.filter((w) => w.job === 'haul' || w.job === 'build'), busy = haul.filter((w) => !!w.lj), idle = haul.filter((w) => !w.lj && w.state === 'wait');
    const stalled = L.routes.filter((r) => r.on && r.note && r.inflight === 0), flow = L.routes.reduce((a, r) => a + L.flow(r.id), 0);
    const sites = this.f.sites?.list.length ?? 0;
    this.botEl.innerHTML = `<span>PAWNS <b>${ws.length}</b> · HAULING <b>${busy.length}</b>/<b>${haul.length}</b>${idle.length ? ` · <span class="amb">${idle.length} IDLE</span>` : ''}${ws.length - haul.length ? ` · ${ws.length - haul.length} ON OTHER JOBS` : ''}</span>
      <span>FLOW <b>${Math.round(flow)}</b> ITEMS/MIN</span><span>${stalled.length ? `<span class="amb">${stalled.length} WIRE${stalled.length > 1 ? 'S' : ''} STALLED</span>` : 'NO STALLS'}</span><span>SITES <b>${sites}</b></span><span class="sp"></span>
      <span>DRAG PLUG: WIRE · SHIFT-DRAG: BOX · DEL · F FIT · T TIDY · ESC</span>`;
  }
}
function clip(g: CanvasRenderingContext2D, s: string, w: number) {
  g.font = FONT;
  if (g.measureText(s).width <= w) return s;
  let t = s; while (t.length > 1 && g.measureText(t + '.').width > w) t = t.slice(0, -1);
  return t + '.';
}
/** a short item name for tag lines */
export function short(id: ItemId) { const n = (ITEMS[id]?.name ?? id).toUpperCase(); return n.length > 12 ? n.replace(/\s*\(.*\)/, '').slice(0, 12) : n; }
/** hand-placed 24 x 24 pixel glyphs for the tool chits, inked */
const GLYPH: Record<string, string[]> = {
  select: ['......................', '....#.................', '....##................', '....#O#...............', '....#OO#..............', '....#OOO#.............', '....#OOOO#............', '....#OOOOO#...........', '....#OOOOOO#..........', '....#OOOOOOO#.........', '....#OOOOOOOO#........', '....#OOOOO#####.......', '....#OO#OO#...........', '....#O#.#OO#..........', '....##..#OO#..........', '....#....#OO#.........', '.........#OO#.........', '..........##..........'],
  wire: ['......................', '......................', '..#####...............', '..#OOO#...............', '..#OOO#####...........', '..#OOO#...#...........', '..#####...#...........', '..........#...........', '..........#...........', '..........#...........', '..........#...#####...', '..........#####OOO#...', '..............#OOO#...', '..............#OOO#...', '..............#####...'],
  field: ['......................', '......................', '...#.....#.....#......', '...##...##....##......', '....#...#.....#.......', '...O#..O#.#..O#..#....', '..O.#.O.#.#.O.#.#.....', '....#...#.#...#.#.....', '....#...#.....#.......', '....#...#.....#.......', '######################', '#....#....#....#.....#'],
  fit: ['......................', '.####............####.', '.#..................#.', '.#..................#.', '.#..................#.', '......................', '........######........', '........#OOOO#........', '........#OOOO#........', '........######........', '......................', '.#..................#.', '.#..................#.', '.#..................#.', '.####............####.'],
  tidy: ['......................', '.#####................', '.#OOO#................', '.#########............', '..........#...........', '..........#...#####...', '..........#####OOO#...', '..........#...#####...', '..........#...........', '.#####....#...........', '.#OOO######...........', '.#####................'],
  split: ['......................', '..............#####...', '..............#OOO#...', '.............######...', '............#.........', '#####......#..........', '#OOO######O....#####..', '#####.....#####OOO#...', '...........#...#####..', '............#.........', '.............######...', '..............#OOO#...', '..............#####...'],
  merge: ['......................', '#####.................', '#OOO#.................', '######................', '......#...............', '.......#..............', '#####..O#######.#####.', '#OOO#####.....###OOO#.', '#####..O#.......#####.', '.......#..............', '......#...............', '######................', '#OOO#.................', '#####.................'],
  buffer: ['......................', '......##########......', '......#........#......', '..##..#.OOOOOO.#......', '......#........#......', '......#.OOOOOO.#......', '......#........#......', '......#.OOOOOO.#......', '..##..#........#......', '......#.OOOOOO.#......', '......#........#......', '......##########......'],
  counter: ['......................', '..##################..', '..#................#..', '..#.###..###..#.#..#..', '..#.#.#....#..#.#..#..', '..#.#.#..###..###..#..', '..#.#.#....#....#..#..', '..#.###..###....#..#..', '..#................#..', '..##################..'],
  gate: ['......................', '........#.....#.......', '.......#O.....#.......', '......#O......#.......', '.....#O.......#.......', '....#O........#.......', '######........########', '....#.........#.......', '....#.........#.......', '....#.........#.......', '....#.........#.......'],
  timer: ['......................', '........####..........', '.....##########.......', '....#..........#......', '...#.....#......#.....', '...#.....#......#.....', '...#.....#......#.....', '...#.....OOO....#.....', '...#.........O..#.....', '...#..........O.#.....', '....#..........#......', '.....##########.......'],
  sensor: ['......................', '......................', '..........#...........', '.........#.#..........', '.....#...#.#....#.....', '....#.#..#.#...#.#....', '#####.#.#...#.#...####', '......#.#...#.#.......', '.......#.....#........', '......................'],
};
/** paint a glyph into a 24 x 24 canvas: '#' the inked stroke, 'O' a red pencil fill */
export function glyph(g: CanvasRenderingContext2D, kind: string, lit = true, ink = '#1d2329', red = '#b23a2c') {
  g.clearRect(0, 0, 24, 24);
  const rows = GLYPH[kind] ?? [];
  const oy = Math.floor((24 - rows.length) / 2) + 1;
  const stroke = lit ? ink : '#8a8072', fill = lit ? red : '#c8bd9e';
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '.') return; g.fillStyle = ch === '#' ? stroke : fill; g.fillRect(i + 1, oy + j, 1, 1); }));
}
