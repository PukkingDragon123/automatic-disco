// The NODE MAP (N): the colony's logistics as a CORK BOARD. Every node is pinned to it as a hand-painted pixel-art
// card (each building's own illustration from src/ui/build/art.ts, painted with lowpix's brush; a pod badge; a rock
// specimen tag for a deposit; a felt patch for a harvest field; a brass badge with a stamped glyph for each logic
// gadget: splitter, merger, buffer, counter, gate, timer, sensor). Routes are lengths of yarn strung between the pins;
// item tokens ride the yarn as workers carry them, and each length carries a paper luggage tag clipped on (its items,
// rate, priority pips, an IF stamp for conditions, and why it stalls). Drag from a card's brass plug to another card to
// wire it; drag a card to tidy it; wheel to zoom, drag the board (or right-drag) to pan.
// The model: src/logistics/network.ts. The inspector sheet is ./panel.ts, the guide ./tutorial.ts.
import './nodes.css';
import '../build/build.css';
import type { Factory } from '../../factory/factory';
import type { Worker } from '../../factory/workers';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import { LOGIC, LOGIC_NAME, isLogic, type LNode, type Route, type LogicKind, type Chain, type Template } from '../../logistics/network';
import { VSC } from '../build/vignette';
import { art } from '../build/art';
import { inkCurve, inkLine, bezAt, INK, PENCIL_R, PENCIL_B, PENCIL_G, AMBER, PAPER } from '../build/ink';
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
/** yarn colours: strung, moving (the lighter twist crawls), stalled, off */
const YARN = '#a82c22', YARN_LIT = '#f0846a', YARN_STALL = '#c8891e', YARN_OFF = '#6e665c';
const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

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
    el('div', 'nm-legend cr-s', this.glass, `<span><i style="background:${YARN}"></i>WIRE</span><span><i style="background:${YARN_LIT}"></i>MOVING</span><span><i style="background:${YARN_STALL}"></i>STALLED</span><span><i style="background:#f0e8d2"></i>PICKED</span>`);
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
    this.cam.x = (x0 + x1) / 2; this.cam.z = (z0 + z1) / 2;
    this.cam.s = Math.max(2, Math.min(8, Math.min((this.W - 124) / Math.max(1, x1 - x0), (this.H - 96) / Math.max(1, z1 - z0))));
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
  /** the cork moves with the board */
  private board() {
    const gb = this.glass.getBoundingClientRect(), ox = Math.round(gb.left + (this.W / 2 - this.cam.x * this.cam.s) * VSC), oy = Math.round(gb.top + (this.H / 2 - this.cam.z * this.cam.s) * VSC);
    const k = `${ox & 511},${oy & 511}`;
    if (k !== this.bgKey) { this.bgKey = k; this.root.style.backgroundPosition = `${ox & 511}px ${oy & 511}px`; }
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
    const S0 = 6, CX = 170 / S0, CZ = 86 / S0, SX = 122 / S0, wired = new Set<string>();
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
    rest.forEach((n, i) => { const row = Math.floor(i / per), inRow = Math.min(per, rest.length - row * per); this.auto.set(n.id, [cx + ((i % per) - (inRow - 1) / 2) * SX, z0 + row * CZ]); });
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
  /** a length of yarn from one pin to the next: it sags under its own weight */
  wirePts(r: Route): number[][] | null {
    const a = this.cards.get(r.from), b = this.cards.get(r.to); if (!a || !b) return null;
    const ax = a.px, ay = a.py, bx = b.tx + 2, by = b.ty + 8;
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, sag = Math.min(34, 6 + L * 0.12);
    return [[ax, ay], [ax + dx * 0.3, ay + dy * 0.3 + sag], [ax + dx * 0.7, ay + dy * 0.7 + sag], [bx, by]];
  }
  /** the tag hangs just above the middle of its yarn */
  private tagRect(r: Route): [number, number, number, number] | null { const pts = this.wirePts(r); if (!pts) return null; const m = bezAt(pts, 0.5); return [Math.round(m[0] - 29), Math.round(m[1] - 30), 58, 22]; }

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
  /** every node's card: where its board point falls, then nudged apart until no two cards overlap */
  private layoutCards() {
    const g = this.ctx;
    this.cards.clear();
    const list: Card[] = [];
    this.arrange();
    for (const n of this.L.nodes) {
      const [bx, bz] = this.pos(n), [x, y] = this.proj(bx, 0, bz);
      const name = isLogic(n.kind) ? LOGIC_NAME[n.kind as LogicKind] : n.name;
      const tw = Math.min(112, Math.max(56, this.tw(g, name) + 10, this.tw(g, this.subline(n)[0]) + 10)), th = 70;
      list.push({ n, x, y, tx: 0, ty: 0, tw, th, px: 0, py: 0, r: 0 });
    }
    for (let it = 0; it < 40; it++) {
      let moved = false;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ox = (a.tw + b.tw) / 2 + 14 - Math.abs(a.x - b.x), oy = (a.th + b.th) / 2 + 10 - Math.abs(a.y - b.y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy * 1.3) { const d = (a.x <= b.x ? -1 : 1) * ox / 2; a.x += d; b.x -= d; } else { const d = (a.y <= b.y ? -1 : 1) * oy / 2; a.y += d; b.y -= d; }
      }
      if (!moved) break;
    }
    for (const c of list) {
      c.tx = Math.round(c.x - c.tw / 2); c.ty = Math.round(c.y - c.th / 2); c.x = c.tx + c.tw / 2; c.y = c.ty + c.th / 2;
      c.px = c.tx + c.tw + 4; c.py = c.ty + 14; c.r = Math.max(c.tw, c.th) / 2;
      this.cards.set(c.n.id, c);
    }
  }
  private img(src: string) { let i = this.icons.get(src); if (!i) { i = new Image(); i.src = src; this.icons.set(src, i); } return i; }
  private itemImg(id: ItemId, px = 16) { return this.img(itemIcon(id, px)); }
  private R(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  private text(g: CanvasRenderingContext2D, s: string, x: number, y: number, c: string) { g.font = FONT; g.textBaseline = 'top'; g.fillStyle = c; g.fillText(s, Math.round(x), Math.round(y)); }
  private tw(g: CanvasRenderingContext2D, s: string) { g.font = FONT; return Math.ceil(g.measureText(s).width); }
  /** a scrap of paper with an inked edge, a drop shadow and a dog-ear (tags, chits) */
  private paper(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, edge = INK, fill = PAPER) {
    this.R(g, x + 2, y + 2, w, h, 'rgba(40,28,16,0.35)');
    this.R(g, x, y, w, h, fill);
    this.R(g, x + 1, y, w - 2, 1, edge); this.R(g, x + 1, y + h - 1, w - 2, 1, edge); this.R(g, x, y + 1, 1, h - 2, edge); this.R(g, x + w - 1, y + 1, 1, h - 2, edge);
    this.R(g, x + w - 4, y + 1, 3, 1, '#d8ccac');
  }
  private draw() {
    const g = this.ctx, W = this.W, H = this.H, L = this.L;
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    // sensor probes and signal links: dotted blue pencil
    for (const n of L.nodes) {
      const c = this.cards.get(n.id); if (!c) continue;
      const links: string[] = [];
      if (n.kind === 'sensor' && n.cfg.probe) links.push(n.cfg.probe);
      for (const cd of [...(n.cfg.conds ?? []), ...L.routes.filter((r) => r.from === n.id || r.to === n.id).flatMap((r) => r.conds)]) if (cd.k === 'signal' && cd.node) links.push(cd.node);
      for (const id of links) { const o = this.cards.get(id); if (o) inkCurve(g, [[o.x, o.y], [o.x, o.y], [c.x, c.y], [c.x, c.y]], n.sig || L.node(id)?.sig ? AMBER : PENCIL_B, 7, 1, 1, 3); }
    }
    for (const r of L.routes) this.wire(g, r);
    for (const c of this.cards.values()) this.card(g, c);
    for (const r of L.routes) this.routeTag(g, r);
    for (const [w, j] of L.live) if (!j.chain && j.src && j.dst && w.carry) { const r = L.routes.find((x) => x.from === j.src!.id && x.to === j.dst!.id), pts = r ? this.wirePts(r) : null; if (pts) { const pt = bezAt(pts, this.prog(w, j.src, j.dst)); this.token(g, pt[0], pt[1], w.carry.id); } }
    for (const [w, j] of L.live) if (j.chain) this.chainToken(g, w, j.chain, j.item);
    const d = this.drag;
    if (d?.mode === 'wire' && d.on) {
      const a = this.cards.get(d.id!); if (a) {
        const h = this.hover.node ? L.node(this.hover.node) : null, src = L.node(d.id!)!;
        const bad = h && h.id !== src.id ? L.canWire(src, h) : null;
        inkCurve(g, [[a.px, a.py], [a.px + 20, a.py], [d.x - 10, d.y], [d.x, d.y]], bad ? PENCIL_R : INK, 3, 1, 4, 2, -this.t * 14);
        if (bad) { const w = this.tw(g, bad.toUpperCase()) + 10; this.paper(g, d.x + 8, d.y + 6, w, 15, PENCIL_R); this.text(g, bad.toUpperCase(), d.x + 13, d.y + 8, PENCIL_R); }
      }
    }
    if (d?.mode === 'box' && d.on) { const x0 = Math.min(d.sx, d.x), y0 = Math.min(d.sy, d.y), x1 = Math.max(d.sx, d.x), y1 = Math.max(d.sy, d.y); for (const [a, b, c2, e2] of [[x0, y0, x1, y0], [x0, y1, x1, y1], [x0, y0, x0, y1], [x1, y0, x1, y1]]) inkLine(g, a, b, c2, e2, a + b, PENCIL_R); }
  }
  /** a length of yarn: red when strung, a lighter twist crawling along it while goods move, amber dashes when it
   *  stalls, grey when switched off, chalk white when picked */
  private wire(g: CanvasRenderingContext2D, r: Route) {
    const pts = this.wirePts(r); if (!pts) return;
    const L = this.L, moving = r.inflight > 0 || (L.f.time - r.lastT < 12 && r.moved > 0);
    const sel = this.sel?.k === 'route' && this.sel.id === r.id, hov = this.hover.route === r.id;
    const stalled = !!r.note && !moving;
    inkCurve(g, pts.map(([x, y]) => [x + 2, y + 3]), 'rgba(40,22,10,0.35)', r.id, 2);
    if (sel || hov) inkCurve(g, pts, sel ? 'rgba(240,232,210,0.55)' : 'rgba(240,232,210,0.3)', r.id, 4);
    const col = sel ? '#f0e8d2' : !r.on ? YARN_OFF : stalled ? YARN_STALL : YARN;
    if (!r.on) inkCurve(g, pts, col, r.id, 2, 3, 3);
    else if (stalled) inkCurve(g, pts, col, r.id, 2, 5, 2);
    else inkCurve(g, pts, col, r.id, 2);
    if (moving && r.on) inkCurve(g, pts, YARN_LIT, r.id + 1, 1, 2, 4, -this.t * 12);
    const p = bezAt(pts, 0.78), q = bezAt(pts, 0.8), a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    for (const sgn of [2.5, -2.5]) inkLine(g, p[0] + Math.cos(a + sgn) * 7, p[1] + Math.sin(a + sgn) * 7, p[0], p[1], r.id + sgn, col);
  }
  /** the luggage tag clipped to a wire: its items, rate, priority pips, an IF stamp, and why it stalls */
  private routeTag(g: CanvasRenderingContext2D, r: Route) {
    const pts = this.wirePts(r), rc = this.tagRect(r); if (!pts || !rc) return;
    const L = this.L, flow = L.flow(r.id), moving = r.inflight > 0 || (L.f.time - r.lastT < 12 && r.moved > 0);
    const m = bezAt(pts, 0.5), sel = this.sel?.k === 'route' && this.sel.id === r.id;
    const icons = r.filter.slice(0, 3);
    const rate = flow >= 1 ? `${Math.round(flow)}/M` : r.amount.mode === 'keep' ? `KEEP${r.amount.n}` : r.amount.mode === 'batch' ? `X${r.amount.n}` : r.amount.mode === 'rate' ? `<${r.amount.n}` : '';
    const w = Math.max(rc[2], 12 + (icons.length ? icons.length * 17 : this.tw(g, 'ANY') + 2) + (rate ? this.tw(g, rate) + 4 : 0)), h = rc[3];
    const x0 = Math.round(m[0] - w / 2), y0 = rc[1];
    inkLine(g, m[0], m[1], m[0], y0 + h, r.id * 3, INK); // the string from the clip up to the tag
    this.R(g, m[0] - 2, m[1] - 2, 4, 4, '#8f99a3'); this.R(g, m[0] - 2, m[1] - 2, 4, 1, '#c3cbd2'); // the clip on the wire
    this.paper(g, x0, y0, w, h, sel ? PENCIL_R : INK, r.note && !moving ? '#efd9a0' : PAPER);
    this.R(g, x0 + 3, y0 + h / 2 - 1, 2, 2, INK); // the eyelet
    let cx = x0 + 8;
    if (icons.length) for (const id of icons) { const im = this.itemImg(id); if (im.complete && im.naturalWidth) g.drawImage(im, cx, y0 + 3, 16, 16); cx += 17; }
    else { this.text(g, 'ANY', cx, y0 + 6, '#57504a'); cx += this.tw(g, 'ANY') + 2; }
    if (rate) { this.text(g, rate, cx + 2, y0 + 6, moving ? PENCIL_G : INK); cx += this.tw(g, rate) + 4; }
    for (let i = 0; i < 5; i++) this.R(g, x0 + 8 + i * 4, y0 + h - 3, 3, 2, i < r.priority ? (r.priority >= 4 ? PENCIL_R : INK) : '#c8bd9e');
    if (r.conds.length) { const sx = x0 + w - 16, sy = y0 - 6; this.R(g, sx, sy, 18, 11, PAPER); this.R(g, sx, sy, 18, 1, PENCIL_R); this.R(g, sx, sy + 10, 18, 1, PENCIL_R); this.R(g, sx, sy, 1, 11, PENCIL_R); this.R(g, sx + 17, sy, 1, 11, PENCIL_R); this.text(g, 'IF', sx + 3, sy + 0, PENCIL_R); }
    if (r.note && !moving) { const s = r.note, tw = this.tw(g, s) + 8; this.paper(g, x0, y0 + h + 2, tw, 14, AMBER, '#f6e6b8'); this.text(g, s, x0 + 4, y0 + h + 3, r.note === 'NOT CONNECTED' || r.note === 'NO WORKER ASSIGNED' ? PENCIL_R : '#6a4a10'); }
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
  /** an item token riding a wire: a little paper chit with the item drawn on it */
  private token(g: CanvasRenderingContext2D, x: number, y: number, item: ItemId) {
    const s = 20, x0 = Math.round(x - s / 2), y0 = Math.round(y - s / 2 - 3 + Math.sin(this.t * 6 + x) * 1.5);
    this.paper(g, x0, y0, s, s, INK);
    const im = this.itemImg(item); if (im.complete && im.naturalWidth) g.drawImage(im, x0 + 2, y0 + 2, 16, 16);
  }
  private glyphs = new Map<string, HTMLCanvasElement>();
  private glyphCv(kind: string) { let c = this.glyphs.get(kind); if (!c) { c = document.createElement('canvas'); c.width = 24; c.height = 24; glyph(c.getContext('2d')!, kind, true, '#3a2a10', '#7a1e14'); this.glyphs.set(kind, c); } return c; }
  /** a node pinned to the board: its picture, its name, what it holds or does, a lamp, the pin and the brass plug */
  private card(g: CanvasRenderingContext2D, c: Card) {
    const n = c.n, L = this.L, { tx, ty, tw, th } = c;
    const sel = (this.sel?.k === 'node' && this.sel.id === n.id) || this.multi.has(n.id), hov = this.hover.node === n.id;
    const logic = isLogic(n.kind), flash = this.tut.highlight(n.id) && Math.floor(this.t * 3) % 2 === 0;
    // the card: paper for buildings and the pod, a kraft tag for a deposit, felt for a field, enamel for a gadget
    const fill = n.kind === 'deposit' ? '#d7b47a' : n.kind === 'field' ? '#4f7d44' : logic ? '#e9e2cc' : n.kind === 'site' ? '#efe2b8' : PAPER;
    const ink = n.kind === 'field' ? '#f0e8d2' : INK;
    this.R(g, tx + 3, ty + 4, tw, th, 'rgba(40,22,10,0.4)');
    if (sel || flash) this.R(g, tx - 3, ty - 3, tw + 6, th + 6, sel ? '#f0e8d2' : AMBER);
    this.R(g, tx, ty, tw, th, fill);
    const edge = sel ? PENCIL_R : hov ? '#57504a' : n.kind === 'field' ? '#24381e' : INK;
    this.R(g, tx + 1, ty, tw - 2, 1, edge); this.R(g, tx + 1, ty + th - 1, tw - 2, 1, edge); this.R(g, tx, ty + 1, 1, th - 2, edge); this.R(g, tx + tw - 1, ty + 1, 1, th - 2, edge);
    if (n.kind === 'building' || n.kind === 'container' || n.kind === 'pod') this.R(g, tx + 3, ty + 44, tw - 6, 1, 'rgba(87,80,74,0.35)'); // the ruled line
    // the picture
    const cx = tx + tw / 2, py = ty + 4;
    const b = L.bld(n), site = n.kind === 'site' ? L.site(n) : null;
    if (b || site) {
      const im = this.img(art((b?.kind ?? site!.kind) as never, 'small'));
      if (site) g.globalAlpha = 0.45;
      if (im.complete && im.naturalWidth) g.drawImage(im, Math.round(cx - 24), py, 48, 36);
      g.globalAlpha = 1;
      if (site) { const pr = site.stage === 'build' ? Math.min(1, site.work / site.workNeed) : this.f.sites.progress(site) * 0.5; this.R(g, tx + 6, py + 37, tw - 12, 3, '#c8bd9e'); this.R(g, tx + 6, py + 37, Math.round((tw - 12) * pr), 3, AMBER); }
    } else if (n.kind === 'pod') this.pod(g, cx, py);
    else if (n.kind === 'deposit') { const sm = L.seam(n); if (sm) { const im = this.itemImg(sm.item, 32); if (im.complete && im.naturalWidth) g.drawImage(im, Math.round(cx - 16), py + 3, 32, 32); } }
    else if (n.kind === 'field') { const im = this.img(`${BASE}ui/craft/felt.png`); if (im.complete && im.naturalWidth) g.drawImage(im, Math.round(cx - 16), py + 3, 32, 32); this.tree(g, cx, py + 8); }
    else if (logic) {
      const im = this.img(`${BASE}ui/craft/badge.png`); if (im.complete && im.naturalWidth) g.drawImage(im, Math.round(cx - 18), py + 1, 36, 36);
      g.drawImage(this.glyphCv(n.kind), Math.round(cx - 12), py + 7);
    }
    const [sub, sc] = this.subline(n);
    this.text(g, clip(g, logic ? LOGIC_NAME[n.kind as LogicKind] : n.name, tw - 8), tx + 4, ty + 45, ink);
    this.text(g, clip(g, sub, tw - 8), tx + 4, ty + 56, n.kind === 'field' ? '#d8e8c8' : sc);
    const lc = this.lamp(n); if (lc) { this.R(g, tx + tw - 8, ty + 3, 5, 5, '#2b2622'); this.R(g, tx + tw - 7, ty + 4, 3, 3, lc); }
    // the pin
    const pin = this.img(`${BASE}ui/craft/pin.png`); if (pin.complete && pin.naturalWidth) g.drawImage(pin, Math.round(cx - 7), ty - 7, 14, 14);
    // the plug: a brass ring on the card's edge, where the yarn starts
    if (n.kind !== 'site' && n.kind !== 'sensor') {
      const hp = this.hover.node === n.id && this.hover.port, col = hp ? '#f0c24a' : L.routes.some((r) => r.from === n.id) ? '#c49a3a' : '#8a7a52';
      const x = c.px, y = c.py;
      this.R(g, x - 3, y - 4, 7, 9, '#2b2622');
      this.R(g, x - 2, y - 3, 5, 7, col); this.R(g, x - 1, y - 1, 3, 3, '#2b2622'); this.R(g, x - 2, y - 3, 5, 1, '#f0d890');
    }
  }
  /** the pod: a capsule on three legs, in pixels */
  private pod(g: CanvasRenderingContext2D, cx: number, y: number) {
    const x = Math.round(cx - 14);
    for (const [lx, h] of [[2, 6], [13, 7], [24, 6]] as const) this.R(g, x + lx, y + 28, 3, h, '#4b4e50');
    this.R(g, x + 3, y + 13, 23, 16, INK); this.R(g, x + 4, y + 14, 21, 14, '#d8d0bc'); this.R(g, x + 4, y + 14, 6, 14, '#efe8d6');
    this.R(g, x + 4, y + 19, 21, 4, '#2f5d8a');
    for (let i = 0; i < 9; i++) { const w = Math.round(Math.sqrt(1 - ((i - 9) / 9) ** 2) * 11); this.R(g, x + 14 - w, y + 4 + i, w * 2 + 1, 1, i === 0 ? INK : '#c8891e'); this.R(g, x + 14 - w - 1, y + 4 + i, 1, 1, INK); this.R(g, x + 14 + w + 1, y + 4 + i, 1, 1, INK); }
    this.R(g, x + 9, y + 7, 3, 2, '#f0d890');
  }
  /** a little tree stitched on a field's felt */
  private tree(g: CanvasRenderingContext2D, cx: number, y: number) {
    const x = Math.round(cx);
    this.R(g, x - 1, y + 14, 2, 6, '#5c3d20');
    for (let i = 0; i < 12; i++) { const w = Math.floor(i / 2) + 1; this.R(g, x - w, y + 2 + i, w * 2, 1, i % 3 === 0 ? '#2e5a1c' : '#7fbf4a'); }
  }
  private lamp(n: LNode): string | null {
    const b = this.L.bld(n);
    if (b && (b.def.station || b.def.extract)) return b.status === 'working' ? PENCIL_G : b.status === 'nopower' ? PENCIL_R : b.status === 'idle' ? '#8a8072' : AMBER;
    if (n.kind === 'gate' || n.kind === 'timer' || n.kind === 'counter' || n.kind === 'buffer') return n.open ? PENCIL_G : AMBER;
    if (n.kind === 'sensor') return n.sig ? AMBER : '#8a8072';
    return null;
  }
  /** the second line of a tag: what it holds, makes, or is doing */
  private subline(n: LNode): [string, string] {
    const L = this.L, top = (ids: ItemId[], f: (id: ItemId) => number) => ids.map((id) => [id, f(id)] as [ItemId, number]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id, v]) => `${short(id)} ${v}`).join(' ');
    const dim = '#57504a', warn = '#6a4a10';
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
export function glyph(g: CanvasRenderingContext2D, kind: string, lit = true, ink = INK, red = PENCIL_R) {
  g.clearRect(0, 0, 24, 24);
  const rows = GLYPH[kind] ?? [];
  const oy = Math.floor((24 - rows.length) / 2) + 1;
  const stroke = lit ? ink : '#8a8072', fill = lit ? red : '#c8bd9e';
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '.') return; g.fillStyle = ch === '#' ? stroke : fill; g.fillRect(i + 1, oy + j, 1, 1); }));
}
