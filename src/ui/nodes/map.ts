// The NODE MAP (N): the colony's logistics as a live schematic on one big phosphor glass. Every node is a real thing
// (the pod's stores, buildings, containers, deposits, harvest fields, construction sites) laid out where it stands in
// the world, nudged apart so the cards never overlap, and movable (or TIDY lays the chains out left to right). Drag
// from a node's output tab to another node to wire a ROUTE; the wire shows its filter, rate and priority, packets
// travel along it as workers carry loads, and a stalled wire says why. Logic nodes (unlocked by the logistics
// discipline or research) sit on wires. The inspector on the right edits whatever is selected.
// The schematic is pixel art: drawn at the art scale (1 art px = 2 screen px) with whole-pixel shapes, wires
// rasterised pixel by pixel and text in Body at 11 px, then shown at 2x with nearest-neighbour filtering. The housing,
// glass and keys around it are painted hardware (src/ui/build/hw.ts). The model is src/logistics/network.ts.
import './nodes.css';
import '../build/build.css';
import type { Factory } from '../../factory/factory';
import type { Worker } from '../../factory/workers';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import { STATUS_COL } from '../../factory/status';
import { isBelt } from '../../factory/defs';
import { LOGIC, LOGIC_NAME, isLogic, type LNode, type Route, type LogicKind, type Chain, type Template } from '../../logistics/network';
import { phosphor } from '../build/studio';
import { installHW, paintHW, SC } from '../build/hw';
import { Panel } from './panel';
import { Tutorial } from './tutorial';
import { el, toast } from '../kit';
import { sfx } from '../../audio/audio';
import { hex } from '../machine';

export type Tool = 'select' | 'wire' | 'field' | 'template' | LogicKind;
export type Sel = { k: 'node'; id: string } | { k: 'route'; id: number } | null;
interface Card { n: LNode; x: number; y: number; w: number; h: number }
const C = {
  bg0: '#060908', bg1: '#0a110d', bg2: '#0f1a14', g3: '#14261b', g4: '#1b3525', g5: '#264a32', g6: '#336240', g7: '#4a8457', g8: '#7fb88a', g9: '#b9dcbd',
  am: '#d9a43a', amd: '#725220', aml: '#ecd29a', rd: '#b8382e', rdl: '#e0998a', cr: '#d9d2bf', gm: '#4b4e50', rust: '#a65c25', moss: '#6f8f3a',
};
const KIND_COL: Record<string, string> = { pod: C.am, building: C.g8, container: C.cr, deposit: C.rust, field: C.moss, site: C.aml };
const D2 = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
/** card sizes in art px: physical nodes and logic nodes */
const CW = 128, CH = 30, LW = 86, LH = 24;
/** Body at its native size */
const FONT = '11px Body, monospace';

export class NodeMap {
  readonly root: HTMLDivElement;
  private glass: HTMLDivElement; private cv: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private toolsEl: HTMLDivElement; private topEl: HTMLDivElement; private botEl: HTMLDivElement; private hintEl: HTMLDivElement;
  readonly panel: Panel;
  readonly tut: Tutorial;
  isOpen = false;
  /** camera: centre in world metres, zoom in art px per metre */
  cam = { x: 0, z: 0, zoom: 7 };
  sel: Sel = null;
  multi = new Set<string>();
  tool: Tool = 'select';
  tpl: Template | null = null;
  private drag: { mode: 'pan' | 'node' | 'wire' | 'box' | 'maybe'; sx: number; sy: number; x: number; y: number; id?: string; ox?: number; oz?: number; on: boolean } | null = null;
  private hover: { node: string | null; route: number | null; port: boolean } = { node: null, route: null, port: false };
  private cards = new Map<string, Card>();
  /** display offsets (world metres) that keep untidied cards from overlapping */
  private disp = new Map<string, { x: number; z: number }>();
  private icons = new Map<string, HTMLImageElement>();
  private under: HTMLCanvasElement | null = null;
  private t = 0; private W = 0; private H = 0;
  private topKey = ''; private botT = 0;

  constructor(readonly f: Factory) {
    installHW();
    // on the body, over every other HUD piece (the crate HUD, the desk) while it is open
    const r = (this.root = el('div', 'nm', document.body));
    r.dataset.hw = 'house'; r.dataset.seed = '21';
    this.topEl = el('div', 'nm-top', r);
    this.toolsEl = el('div', 'nm-tools', r);
    this.glass = el('div', 'pl-glass nm-glass', r); this.glass.dataset.hw = 'glass'; this.glass.dataset.seed = '6'; this.glass.dataset.well = '1';
    this.cv = el('canvas', 'map', this.glass);
    this.ctx = this.cv.getContext('2d')!;
    el('div', 'nm-legend pl-s', this.glass, `<span><i style="background:${C.g8}"></i>MOVING</span><span><i style="background:${C.g6}"></i>READY</span><span><i style="background:${C.am}"></i>STALLED</span><span><i style="background:${C.gm}"></i>OFF</span><span>WHEEL ZOOM · DRAG PAN · DRAG FROM A RIGHT-HAND TAB TO WIRE</span>`);
    this.hintEl = el('div', 'nm-hint pl-s', this.glass);
    const side = el('div', 'pl-glass nm-side', r); side.dataset.hw = 'glass'; side.dataset.seed = '9'; side.dataset.well = '1';
    this.panel = new Panel(this, side);
    this.botEl = el('div', 'nm-bot pl-s', r);
    this.tut = new Tutorial(this, this.glass);
    r.addEventListener('pointerdown', (e) => e.stopPropagation());
    r.addEventListener('wheel', (e) => { e.stopPropagation(); }, { passive: true });
    this.cv.addEventListener('pointerdown', this.onDown);
    addEventListener('pointermove', this.onMove);
    addEventListener('pointerup', this.onUp);
    this.cv.addEventListener('wheel', this.onWheel, { passive: false });
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('keydown', this.onKey, true);
    addEventListener('resize', () => { if (this.isOpen) requestAnimationFrame(() => paintHW(this.root)); });
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
    this.under = null;
    this.topKey = '';
    this.renderTop(); this.renderBot();
    paintHW(this.root);
    this.fit();
    this.panel.dirty();
    this.renderTools();
    sfx('open', 0.8, 0.6);
    this.tut.opened();
  }
  close() {
    if (!this.isOpen) return; this.isOpen = false; this.root.classList.remove('on'); document.body.classList.remove('nm-open');
    const tb = document.querySelector('body > .toasts'), u = document.getElementById('ui'); if (tb && u) u.appendChild(tb); this.drag = null; this.setTool('select'); sfx('close', 0.8, 0.5); }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  // ------------------------------------------------------------------ view
  /** frame the colony: every node in view */
  fit() {
    this.size();
    const ns = this.L.nodes; if (!ns.length) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const n of ns) { const p = this.wpos(n); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    this.cam.x = (x0 + x1) / 2; this.cam.z = (z0 + z1) / 2;
    const zx = (this.W - CW - 30) / Math.max(10, x1 - x0), zz = (this.H - CH - 50) / Math.max(10, z1 - z0);
    this.cam.zoom = Math.max(2, Math.min(16, Math.min(zx, zz)));
  }
  /** the canvas fills the glass inside its bezel, at the art scale */
  private size() {
    const r = this.glass.getBoundingClientRect();
    const W = Math.max(10, Math.floor((r.width - 12) / SC)), H = Math.max(10, Math.floor((r.height - 12) / SC));
    if (W !== this.W || H !== this.H) { this.W = W; this.H = H; this.cv.width = W; this.cv.height = H; this.cv.style.width = W * SC + 'px'; this.cv.style.height = H * SC + 'px'; }
  }
  /** the map position of a node (with its overlap nudge) in world metres */
  wpos(n: LNode) { const d = this.disp.get(n.id); return { x: n.x + (d?.x ?? 0), z: n.z + (d?.z ?? 0) }; }
  sx(x: number) { return Math.round((x - this.cam.x) * this.cam.zoom + this.W / 2); }
  sy(z: number) { return Math.round((z - this.cam.z) * this.cam.zoom + this.H / 2); }
  wx(sx: number) { return (sx - this.W / 2) / this.cam.zoom + this.cam.x; }
  wz(sy: number) { return (sy - this.H / 2) / this.cam.zoom + this.cam.z; }
  cardSize(n: LNode) { return isLogic(n.kind) ? { w: LW, h: LH } : { w: CW, h: CH }; }

  setTool(t: Tool) {
    if (isLogic(t as never)) { const id = 'logic.' + t; if (!this.L.unlocked(id)) { sfx('deny'); toast(`<b>${LOGIC_NAME[t as LogicKind]}</b>: ${this.L.lockWhy(id).toLowerCase()}`, 'warn', 2000); return; } }
    this.tool = this.tool === t && t !== 'select' ? 'select' : t;
    if (this.tool !== 'template') this.tpl = null;
    this.renderTools();
    const hint: Partial<Record<Tool, string>> = { wire: 'CLICK A SOURCE NODE, THEN ITS TARGET', field: 'CLICK THE GROUND TO MARK A HARVEST FIELD', template: `CLICK WHERE TO LAY ${this.tpl?.name ?? 'THE TEMPLATE'}` };
    const h = isLogic(this.tool as never) ? `CLICK THE GLASS TO PLACE A ${LOGIC_NAME[this.tool as LogicKind]}, THEN WIRE IT IN` : hint[this.tool] ?? '';
    this.hintEl.textContent = h; this.hintEl.classList.toggle('on', !!h);
  }
  layTemplate(t: Template) { this.tpl = t; this.tool = 'select'; this.setTool('template'); }
  select(s: Sel) { this.sel = s; this.multi.clear(); this.panel.dirty(); }

  // ------------------------------------------------------------------ the tool keys
  private renderTools() {
    const L = this.L;
    const tools: [Tool, string, string][] = [['select', 'SELECT', 'S'], ['wire', 'WIRE', 'W'], ['field', 'FIELD', 'F']];
    let h = `<div class="h pl-s">TOOLS</div>`;
    for (const [t, n, key] of tools) h += `<div class="nm-tool ${this.tool === t ? 'on' : ''}" data-t="${t}"><canvas width="24" height="24" data-g="${t}"></canvas><span class="nm2 pl-s">${n}</span><span class="hk pl-s">${key}</span></div>`;
    h += `<div class="nm-tool" data-a="fit"><canvas width="24" height="24" data-g="fit"></canvas><span class="nm2 pl-s">FIT</span><span class="hk pl-s">F</span></div>`;
    h += `<div class="h pl-s">LOGIC</div>`;
    for (const lk of LOGIC) {
      const ok = L.unlocked('logic.' + lk);
      h += `<div class="nm-tool ${this.tool === lk ? 'on' : ''} ${ok ? '' : 'lock'}" data-t="${lk}" title="${ok ? LOGIC_NAME[lk] : L.lockWhy('logic.' + lk)}"><canvas width="24" height="24" data-g="${lk}"></canvas><span class="nm2 pl-s">${ok ? LOGIC_NAME[lk] : 'LOCKED'}</span></div>`;
    }
    h += `<div class="nm-tool" data-a="tidy"><canvas width="24" height="24" data-g="tidy"></canvas><span class="nm2 pl-s">TIDY</span><span class="hk pl-s">T</span></div>`;
    this.toolsEl.innerHTML = h;
    this.toolsEl.querySelectorAll<HTMLCanvasElement>('canvas[data-g]').forEach((c) => glyph(c.getContext('2d')!, c.dataset.g!, !c.closest('.lock')));
    this.toolsEl.querySelectorAll<HTMLElement>('[data-t]').forEach((e) => e.addEventListener('click', () => { this.setTool(e.dataset.t as Tool); sfx('click', 1.2, 0.4); }));
    this.toolsEl.querySelector('[data-a="fit"]')!.addEventListener('click', () => { this.fit(); sfx('click', 1.2, 0.4); });
    this.toolsEl.querySelector('[data-a="tidy"]')!.addEventListener('click', () => this.tidy());
  }

  /** TIDY: lay every wired chain out left to right by depth, keeping each chain's rows together */
  tidy() {
    const L = this.L, ns = L.nodes.filter((n) => L.routes.some((r) => r.from === n.id || r.to === n.id));
    if (!ns.length) { toast('Nothing is wired yet', 'warn', 1400); return; }
    const depth = new Map<string, number>();
    for (const n of ns) if (!L.routes.some((r) => r.to === n.id)) depth.set(n.id, 0);
    for (let it = 0; it < 12; it++) for (const r of L.routes) { const d = depth.get(r.from); if (d !== undefined && (depth.get(r.to) ?? -1) < d + 1) depth.set(r.to, d + 1); }
    for (const n of ns) if (!depth.has(n.id)) depth.set(n.id, 0);
    const cols = new Map<number, LNode[]>();
    for (const n of ns) { const d = depth.get(n.id)!; if (!cols.has(d)) cols.set(d, []); cols.get(d)!.push(n); }
    let cx = 0, cz = 0; for (const n of ns) { cx += n.x; cz += n.z; } cx /= ns.length; cz /= ns.length;
    const D = Math.max(...cols.keys()), dx = (CW + 44) / this.cam.zoom, dz = (CH + 16) / this.cam.zoom;
    for (const [d, list] of cols) { list.sort((a, b) => a.z - b.z); list.forEach((n, i) => L.moveNode(n, cx + (d - D / 2) * dx, cz + (i - (list.length - 1) / 2) * dz)); }
    this.disp.clear();
    sfx('done', 1.1, 0.5);
  }

  // ------------------------------------------------------------------ input
  private nodeAt(x: number, y: number): { id: string; port: boolean } | null {
    let best: { id: string; port: boolean } | null = null;
    for (const c of this.cards.values()) {
      const px = c.x + c.w / 2, py = c.y;
      if (D2(x, y, px + 2, py) < 7 && c.n.kind !== 'sensor' && c.n.kind !== 'site') return { id: c.n.id, port: true };
      if (x >= c.x - c.w / 2 && x <= c.x + c.w / 2 && y >= c.y - c.h / 2 && y <= c.y + c.h / 2) best = { id: c.n.id, port: false };
    }
    return best;
  }
  private routeAt(x: number, y: number): number | null {
    let best: number | null = null, bd = 5;
    for (const r of this.L.routes) {
      const pts = this.wirePts(r); if (!pts) continue;
      for (let i = 0; i <= 32; i++) { const p = bez(pts, i / 32), d = D2(x, y, p[0], p[1]); if (d < bd) { bd = d; best = r.id; } }
    }
    return best;
  }
  /** a pointer position in art pixels on the schematic */
  private rel(e: PointerEvent | WheelEvent) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / SC, y: (e.clientY - r.top) / SC }; }
  private onDown = (e: PointerEvent) => {
    const p = this.rel(e), L = this.L;
    e.preventDefault();
    if (e.button === 2) { if (this.tool !== 'select') this.setTool('select'); else if (this.drag?.mode === 'wire') this.drag = null; else this.select(null); return; }
    if (e.button === 1) { this.drag = { mode: 'pan', sx: p.x, sy: p.y, x: p.x, y: p.y, ox: this.cam.x, oz: this.cam.z, on: true }; this.glass.classList.add('pan'); return; }
    if (e.button !== 0) return;
    const hit = this.nodeAt(p.x, p.y);
    // second click of a click-click wire: finish it on the node clicked
    if (this.drag?.mode === 'wire') {
      const from = this.drag.id!; this.drag = null;
      if (hit && hit.id !== from) { const r = L.addRoute(from, hit.id); if (r) { this.select({ k: 'route', id: r.id }); sfx('done', 1.2, 0.5); this.tut.poke(); } }
      return;
    }
    // placing tools
    if (!hit && (this.tool === 'field' || isLogic(this.tool as never) || this.tool === 'template')) {
      const wx = this.wx(p.x), wz = this.wz(p.y);
      if (this.tool === 'field') { const n = L.addField(wx, wz, 8); this.select({ k: 'node', id: n.id }); sfx('build', 1.3, 0.5); this.setTool('select'); }
      else if (this.tool === 'template' && this.tpl) { const miss = L.applyTemplate(this.tpl, wx, wz); toast(miss.length ? `Template laid, but: ${miss.join('; ')}` : `<b>${this.tpl.name}</b> laid: missing buildings are construction sites`, miss.length ? 'warn' : 'good', 2800); sfx('done', 1, 0.6); this.setTool('select'); }
      else { const n = L.addLogic(this.tool as LogicKind, wx, wz); if (n) { this.select({ k: 'node', id: n.id }); sfx('build', 1.4, 0.5); this.setTool('select'); } }
      return;
    }
    if (hit && (hit.port || this.tool === 'wire' || e.altKey)) { this.drag = { mode: 'wire', sx: p.x, sy: p.y, x: p.x, y: p.y, id: hit.id, on: true }; sfx('click', 1.4, 0.3); return; }
    if (hit) {
      const n = L.node(hit.id)!;
      if (e.shiftKey) { if (this.multi.has(hit.id)) this.multi.delete(hit.id); else this.multi.add(hit.id); this.panel.dirty(); return; }
      this.select({ k: 'node', id: hit.id });
      const w = this.wpos(n);
      this.drag = { mode: 'node', sx: p.x, sy: p.y, x: p.x, y: p.y, id: hit.id, ox: w.x, oz: w.z, on: false };
      return;
    }
    const r = this.routeAt(p.x, p.y);
    if (r !== null) { this.select({ k: 'route', id: r }); sfx('click', 1.3, 0.35); return; }
    this.drag = { mode: e.shiftKey ? 'box' : 'maybe', sx: p.x, sy: p.y, x: p.x, y: p.y, ox: this.cam.x, oz: this.cam.z, on: false };
  };
  private onMove = (e: PointerEvent) => {
    if (!this.isOpen) return;
    const p = this.rel(e), d = this.drag;
    if (!d) { const h = this.nodeAt(p.x, p.y); this.hover.node = h?.id ?? null; this.hover.port = !!h?.port; this.hover.route = h ? null : this.routeAt(p.x, p.y); return; }
    d.x = p.x; d.y = p.y;
    if (!d.on && D2(p.x, p.y, d.sx, d.sy) > 3) { d.on = true; if (d.mode === 'maybe') { d.mode = 'pan'; this.glass.classList.add('pan'); } }
    if (!d.on) return;
    if (d.mode === 'pan') { this.cam.x = d.ox! - (p.x - d.sx) / this.cam.zoom; this.cam.z = d.oz! - (p.y - d.sy) / this.cam.zoom; }
    else if (d.mode === 'node') { const n = this.L.node(d.id!); if (n) { this.disp.delete(n.id); n.x = d.ox! + (p.x - d.sx) / this.cam.zoom; n.z = d.oz! + (p.y - d.sy) / this.cam.zoom; n.tidy = true; } }
    else if (d.mode === 'wire') { const h = this.nodeAt(p.x, p.y); this.hover.node = h?.id ?? null; }
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d || !this.isOpen) return;
    this.drag = null; this.glass.classList.remove('pan');
    const p = this.rel(e), L = this.L;
    if (d.mode === 'wire') {
      const h = this.nodeAt(p.x, p.y);
      if (h && h.id !== d.id) { const r = L.addRoute(d.id!, h.id); if (r) { this.select({ k: 'route', id: r.id }); sfx('done', 1.2, 0.5); this.tut.poke(); } }
      else if (D2(p.x, p.y, d.sx, d.sy) < 3) { this.drag = { ...d, on: true }; } // a click on the tab: keep wiring until the next click
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
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = this.rel(e), wx = this.wx(p.x), wz = this.wz(p.y);
    this.cam.zoom = Math.max(1.5, Math.min(24, this.cam.zoom * (e.deltaY > 0 ? 0.88 : 1.14)));
    this.cam.x = wx - (p.x - this.W / 2) / this.cam.zoom; this.cam.z = wz - (p.y - this.H / 2) / this.cam.zoom;
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
    if (s?.k === 'node') { const n = L.node(s.id); if (n && (isLogic(n.kind) || n.kind === 'field')) { L.removeNode(n.id); this.select(null); sfx('crack', 1.4, 0.4); } else toast('Only logic nodes and fields come off the map: dismantle a building in build mode', 'info', 1800); }
  }

  // ------------------------------------------------------------------ geometry
  /** the bezier control points of a wire, in art px */
  wirePts(r: Route): number[][] | null {
    const a = this.cards.get(r.from), b = this.cards.get(r.to); if (!a || !b) return null;
    const x1 = a.x + a.w / 2 + 4, y1 = a.y, x2 = b.x - b.w / 2 - 3, y2 = b.y;
    const dx = Math.max(24, Math.abs(x2 - x1) * 0.5) * (x2 < x1 ? 1.6 : 1);
    return [[x1, y1], [x1 + dx, y1], [x2 - dx, y2], [x2, y2]];
  }

  // ------------------------------------------------------------------ drawing
  update(dt: number) {
    if (!this.isOpen) return;
    this.t += dt;
    this.size();
    this.relax();
    this.draw();
    this.panel.update(dt);
    this.tut.update(dt);
    this.renderTop();
    this.botT -= dt; if (this.botT <= 0) { this.botT = 0.5; this.renderBot(); }
  }
  /** nudge untidied cards apart (display only; they keep their world places) */
  private relax() {
    const ns = this.L.nodes, z = this.cam.zoom;
    for (const n of ns) { const d = this.disp.get(n.id); if (d) { d.x *= 0.995; d.z *= 0.995; } }
    for (let it = 0; it < 6; it++) for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i], b = ns[j], sa = this.cardSize(a), sb = this.cardSize(b);
      const pa = this.wpos(a), pb = this.wpos(b);
      const ox = (sa.w + sb.w) / 2 / z + 12 / z - Math.abs(pa.x - pb.x), oz = (sa.h + sb.h) / 2 / z + 8 / z - Math.abs(pa.z - pb.z);
      if (ox <= 0 || oz <= 0) continue;
      const along = oz < ox * 0.6 ? 'z' : 'x';
      const s = along === 'z' ? (pa.z < pb.z ? -1 : 1) : (pa.x < pb.x ? -1 : 1);
      const push = (along === 'z' ? oz : ox) * 0.5;
      const move = (n: LNode, sg: number) => { if (n.tidy || (this.drag?.mode === 'node' && this.drag.id === n.id)) return; const d = this.disp.get(n.id) ?? { x: 0, z: 0 }; if (along === 'z') d.z += sg * push; else d.x += sg * push; this.disp.set(n.id, d); };
      move(a, s); move(b, -s);
    }
  }
  private img(src: string) { let i = this.icons.get(src); if (!i) { i = new Image(); i.src = src; this.icons.set(src, i); } return i; }
  private itemImg(id: ItemId, px = 16) { return this.img(itemIcon(id, px)); }
  // pixel primitives (art px, whole pixels only)
  private R(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  private frame(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) { this.R(g, x + 1, y, w - 2, 1, c); this.R(g, x + 1, y + h - 1, w - 2, 1, c); this.R(g, x, y + 1, 1, h - 2, c); this.R(g, x + w - 1, y + 1, 1, h - 2, c); }
  private text(g: CanvasRenderingContext2D, s: string, x: number, y: number, c: string) { g.font = FONT; g.textBaseline = 'top'; g.fillStyle = c; g.fillText(s, Math.round(x), Math.round(y)); }
  private tw(g: CanvasRenderingContext2D, s: string) { g.font = FONT; return Math.ceil(g.measureText(s).width); }
  /** a bezier rasterised pixel by pixel: `w` 1 or 2 px, dashes of `on`/`off` px moving with `phase` */
  private curve(g: CanvasRenderingContext2D, pts: number[][], c: string, w = 1, on = 0, off = 0, phase = 0) {
    let len = 0, prev = bez(pts, 0); for (let i = 1; i <= 16; i++) { const q = bez(pts, i / 16); len += D2(prev[0], prev[1], q[0], q[1]); prev = q; }
    const n = Math.max(4, Math.ceil(len * 1.5));
    g.fillStyle = c;
    let lx = 1e9, ly = 1e9, k = 0;
    for (let i = 0; i <= n; i++) {
      const p = bez(pts, i / n), x = Math.round(p[0]), y = Math.round(p[1]);
      if (x === lx && y === ly) continue;
      lx = x; ly = y; k++;
      if (on && ((k + Math.floor(phase)) % (on + off)) >= on) continue;
      g.fillRect(x, y, w, w);
    }
  }
  /** a straight pixel line (Bresenham) */
  private line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: string, on = 0, off = 0) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, k = 0;
    g.fillStyle = c;
    for (let guard = 0; guard < 4000; guard++) { if (!on || (k++ % (on + off)) < on) g.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  private draw() {
    const g = this.ctx, W = this.W, H = this.H, L = this.L;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W, H);
    this.underlay(g);
    this.cards.clear();
    for (const n of L.nodes) { const p = this.wpos(n), s = this.cardSize(n); this.cards.set(n.id, { n, x: this.sx(p.x), y: this.sy(p.z), w: s.w, h: s.h }); }
    // fields: their ground, dashed
    for (const n of L.nodes) if (n.kind === 'field') { const fl = L.fieldOf(n); if (!fl) continue; const x = this.sx(fl.x - fl.r), y = this.sy(fl.z - fl.r), r2 = Math.round(fl.r * 2 * this.cam.zoom); this.line(g, x, y, x + r2, y, C.moss, 3, 3); this.line(g, x, y + r2, x + r2, y + r2, C.moss, 3, 3); this.line(g, x, y, x, y + r2, C.moss, 3, 3); this.line(g, x + r2, y, x + r2, y + r2, C.moss, 3, 3); }
    // sensor probes and signal links: dotted
    for (const n of L.nodes) {
      const c = this.cards.get(n.id); if (!c) continue;
      const links: string[] = [];
      if (n.kind === 'sensor' && n.cfg.probe) links.push(n.cfg.probe);
      for (const cd of [...(n.cfg.conds ?? []), ...L.routes.filter((r) => r.from === n.id || r.to === n.id).flatMap((r) => r.conds)]) if (cd.k === 'signal' && cd.node) links.push(cd.node);
      for (const id of links) { const o = this.cards.get(id); if (o) this.line(g, o.x, o.y, c.x, c.y, n.sig || L.node(id)?.sig ? C.am : C.g5, 1, 2); }
    }
    const chains = L.chains();
    for (const r of L.routes) this.wire(g, r, chains);
    // construction supply runs (no wire): a faint dotted line while a load is on the way
    for (const [w, j] of L.live) if (!j.chain && j.src && j.dst) { const a = this.cards.get(j.src.id), b = this.cards.get(j.dst.id); if (!a || !b) continue; this.line(g, a.x, a.y, b.x, b.y, C.amd, 1, 3); if (w.carry) { const pr = this.prog(w, j.src, j.dst); this.packet(g, a.x + (b.x - a.x) * pr, a.y + (b.y - a.y) * pr, w.carry.id); } }
    for (const [w, j] of L.live) if (j.chain) this.chainPacket(g, w, j.chain, j.item);
    for (const c of this.cards.values()) this.card(g, c);
    this.workers(g);
    // the wire being drawn
    const d = this.drag;
    if (d?.mode === 'wire' && d.on) {
      const a = this.cards.get(d.id!); if (a) {
        const h = this.hover.node ? L.node(this.hover.node) : null, src = L.node(d.id!)!;
        const bad = h && h.id !== src.id ? L.canWire(src, h) : null;
        const x1 = a.x + a.w / 2 + 4, y1 = a.y, x2 = d.x, y2 = d.y, dx = Math.max(24, Math.abs(x2 - x1) * 0.5);
        this.curve(g, [[x1, y1], [x1 + dx, y1], [x2 - dx, y2], [x2, y2]], bad ? C.rd : C.aml, 1, 4, 2, -this.t * 14);
        if (bad) this.label(g, x2 + 8, y2 + 10, bad.toUpperCase(), C.rdl, 'left');
      }
    }
    if (d?.mode === 'box' && d.on) { const x0 = Math.min(d.sx, d.x), y0 = Math.min(d.sy, d.y), x1 = Math.max(d.sx, d.x), y1 = Math.max(d.sy, d.y); this.line(g, x0, y0, x1, y0, C.aml, 2, 2); this.line(g, x0, y1, x1, y1, C.aml, 2, 2); this.line(g, x0, y0, x0, y1, C.aml, 2, 2); this.line(g, x1, y0, x1, y1, C.aml, 2, 2); }
    // a placing tool follows the cursor
    if (this.tool !== 'select' && this.tool !== 'wire') {
      const rc = this.cv.getBoundingClientRect(), mx = (this.g.input.mx - rc.left) / SC, my = (this.g.input.my - rc.top) / SC;
      if (mx > 0 && my > 0 && mx < W && my < H) { const hw = this.tool === 'field' ? 8 * this.cam.zoom : LW / 2, hh = this.tool === 'field' ? hw : LH / 2; this.line(g, mx - hw, my - hh, mx + hw, my - hh, C.aml, 2, 2); this.line(g, mx - hw, my + hh, mx + hw, my + hh, C.aml, 2, 2); this.line(g, mx - hw, my - hh, mx - hw, my + hh, C.aml, 2, 2); this.line(g, mx + hw, my - hh, mx + hw, my + hh, C.aml, 2, 2); }
    }
    // scanlines over the whole glass: a step darker every other art row
    g.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 1; y < H; y += 2) g.fillRect(0, y, W, 1);
  }
  /** the colony under the schematic: water, rock, the real footprints of every building and belt */
  private underlay(g: CanvasRenderingContext2D) {
    const W = this.W, H = this.H, z = this.cam.zoom, R = this.g.region, N = R.N;
    if (!this.under) {
      const c = document.createElement('canvas'); c.width = N; c.height = N;
      const cg = c.getContext('2d')!, img = cg.createImageData(N, N), dd = img.data;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = (j * N + i) * 4, water = R.isWater(i + 0.5, j + 0.5), rock = R.solid[j * N + i] === 1;
        if (water) { dd[o] = 8; dd[o + 1] = 24; dd[o + 2] = 26; }
        else if (rock) { dd[o] = 24; dd[o + 1] = 34; dd[o + 2] = 26; }
        else { const v = (Math.floor(R.h[j * N + i] * 1.5) & 1); dd[o] = 10 + v * 3; dd[o + 1] = 18 + v * 4; dd[o + 2] = 13 + v * 3; }
        dd[o + 3] = 255;
      }
      cg.putImageData(img, 0, 0);
      this.under = c;
    }
    g.drawImage(this.under, this.sx(0), this.sy(0), Math.round(N * z), Math.round(N * z));
    // a grid every 8 m, brighter every 32 m
    const step = 8;
    for (let x = Math.floor(this.wx(0) / step) * step; x < this.wx(W); x += step) this.R(g, this.sx(x), 0, 1, H, x % 32 === 0 ? 'rgba(74,132,87,0.22)' : 'rgba(74,132,87,0.09)');
    for (let zz = Math.floor(this.wz(0) / step) * step; zz < this.wz(H); zz += step) this.R(g, 0, this.sy(zz), W, 1, zz % 32 === 0 ? 'rgba(74,132,87,0.22)' : 'rgba(74,132,87,0.09)');
    for (const b of this.f.buildings) this.R(g, this.sx(b.cx), this.sy(b.cz), Math.max(1, b.fw * z - 1), Math.max(1, b.fd * z - 1), isBelt(b.kind) ? 'rgba(74,132,87,0.3)' : 'rgba(74,132,87,0.18)');
    if (this.f.sites) for (const s of this.f.sites.list) { const x = this.sx(s.cx), y = this.sy(s.cz), w = Math.round(s.fw * z), h = Math.round(s.fd * z); this.line(g, x, y, x + w, y, C.amd, 2, 2); this.line(g, x, y + h, x + w, y + h, C.amd, 2, 2); this.line(g, x, y, x, y + h, C.amd, 2, 2); this.line(g, x + w, y, x + w, y + h, C.amd, 2, 2); }
    // scale bar
    const m = z >= 7 ? 10 : z >= 3 ? 20 : 50, bw = Math.round(m * z);
    this.R(g, W - bw - 10, H - 12, bw, 1, C.g6); this.R(g, W - bw - 10, H - 15, 1, 4, C.g6); this.R(g, W - 11, H - 15, 1, 4, C.g6);
    this.text(g, `${m} M`, W - 10 - this.tw(g, `${m} M`), H - 27, C.g7);
  }
  /** a label plate: Body text on a dark plate with a 1 px rim */
  private label(g: CanvasRenderingContext2D, x: number, y: number, s: string, col: string, align: 'center' | 'left' = 'center') {
    const w = this.tw(g, s) + 8, h = 13, x0 = Math.round(align === 'center' ? x - w / 2 : x), y0 = Math.round(y - h / 2);
    this.R(g, x0, y0, w, h, C.bg0); this.frame(g, x0, y0, w, h, col === C.rdl ? C.rd : C.amd);
    this.text(g, s, x0 + 4, y0 + 1, col);
  }
  /** a wire: colour by state, flow dashes, an arrow, the filter plate, the stall note */
  private wire(g: CanvasRenderingContext2D, r: Route, chains: Chain[]) {
    const pts = this.wirePts(r); if (!pts) return;
    void chains;
    const L = this.L, flow = L.flow(r.id), moving = r.inflight > 0 || (L.f.time - r.lastT < 12 && r.moved > 0);
    const sel = this.sel?.k === 'route' && this.sel.id === r.id, hov = this.hover.route === r.id;
    const col = !r.on ? C.gm : r.note && !moving ? C.am : moving ? C.g8 : C.g6;
    // a dark bed under the wire, a glow when selected
    this.curve(g, pts.map((p) => [p[0] - 1, p[1] - 1]), sel ? C.amd : hov ? C.g5 : C.bg0, 3);
    if (!r.on) this.curve(g, pts, col, 1, 2, 3);
    else if (moving) { this.curve(g, pts, C.g5, 1); this.curve(g, pts, col, 1, 5, 3, -this.t * 12); }
    else if (r.note) this.curve(g, pts, col, 1, 3, 2);
    else this.curve(g, pts, col, 1);
    // the arrow head: a drawn chevron
    const p = bez(pts, 0.74), q = bez(pts, 0.76), a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    for (const s of [2.4, -2.4]) this.line(g, p[0] + Math.cos(a) * 4, p[1] + Math.sin(a) * 4, p[0] + Math.cos(a + s) * 4, p[1] + Math.sin(a + s) * 4, col);
    // the plate: filter icons, rate, priority pips, a condition mark
    const m = bez(pts, 0.42);
    const icons = r.filter.slice(0, 3);
    const rate = flow >= 1 ? `${Math.round(flow)}/MIN` : r.amount.mode === 'keep' ? `KEEP ${r.amount.n}` : r.amount.mode === 'batch' ? `X${r.amount.n}` : r.amount.mode === 'rate' ? `<${r.amount.n}/M` : '';
    const iw = icons.length ? icons.length * 17 : this.tw(g, 'ANY') + 2;
    const w = 6 + iw + (rate ? this.tw(g, rate) + 6 : 0) + (r.conds.length ? 16 : 0) + 20, h = 20;
    const x0 = Math.round(m[0] - w / 2), y0 = Math.round(m[1] - h / 2);
    this.R(g, x0, y0, w, h, C.bg0); this.frame(g, x0, y0, w, h, sel ? C.am : col);
    let cx = x0 + 3;
    if (icons.length) for (const id of icons) { const im = this.itemImg(id); if (im.complete && im.naturalWidth) g.drawImage(im, cx, y0 + 2, 16, 16); cx += 17; }
    else { this.text(g, 'ANY', cx + 1, y0 + 4, C.g7); cx += iw; }
    if (rate) { this.text(g, rate, cx + 3, y0 + 4, moving ? C.g9 : C.g7); cx += this.tw(g, rate) + 6; }
    if (r.conds.length) { this.text(g, 'IF', cx + 1, y0 + 4, C.am); cx += 16; }
    for (let i = 0; i < 5; i++) this.R(g, cx + 1 + i * 4, y0 + 13, 3, 3, i < r.priority ? (r.priority >= 4 ? C.am : C.g8) : C.g4);
    if (r.note && !moving) this.label(g, m[0], y0 + h + 9, r.note, r.note === 'NOT CONNECTED' || r.note === 'NO WORKER ASSIGNED' ? C.rdl : C.am);
  }
  /** progress of a carrying worker from a source to a target, 0..1 */
  private prog(w: Worker, src: LNode, dst: LNode) {
    const [ax, az] = this.L.pos(src), [bx, bz] = this.L.pos(dst), tot = Math.max(0.5, D2(ax, az, bx, bz));
    return Math.max(0, Math.min(1, 1 - D2(w.c.x, w.c.z, bx, bz) / tot));
  }
  private chainPacket(g: CanvasRenderingContext2D, w: Worker, ch: Chain, item: ItemId) {
    const segs = ch.path.map((r) => this.wirePts(r)).filter((p): p is number[][] => !!p);
    if (!segs.length) return;
    if (!w.carry) {
      // on its way to pick up: a hollow mark beside the source tab, blinking
      const a = this.cards.get(ch.src.id); if (!a || Math.floor(this.t * 2.5) % 2) return;
      this.frame(g, a.x + a.w / 2 + 8, a.y - 12, 6, 6, C.g8);
      return;
    }
    const p = this.prog(w, ch.src, ch.dst), f = p * segs.length, i = Math.min(segs.length - 1, Math.floor(f));
    const pt = bez(segs[i], f - i);
    this.packet(g, pt[0], pt[1], item);
  }
  /** a load on the wire: an amber-rimmed box with the item in it */
  private packet(g: CanvasRenderingContext2D, x: number, y: number, item: ItemId) {
    const s = 20, x0 = Math.round(x - s / 2), y0 = Math.round(y - s / 2);
    this.R(g, x0 - 1, y0 - 1, s + 2, s + 2, C.bg0); this.R(g, x0, y0, s, s, C.bg1); this.frame(g, x0, y0, s, s, C.aml);
    const im = this.itemImg(item); if (im.complete && im.naturalWidth) g.drawImage(im, x0 + 2, y0 + 2, 16, 16);
  }
  /** one node card */
  private card(g: CanvasRenderingContext2D, c: Card) {
    const n = c.n, L = this.L, x0 = Math.round(c.x - c.w / 2), y0 = Math.round(c.y - c.h / 2), w = c.w, h = c.h;
    const sel = (this.sel?.k === 'node' && this.sel.id === n.id) || this.multi.has(n.id), hov = this.hover.node === n.id;
    const logic = isLogic(n.kind);
    const kc = logic ? C.g9 : KIND_COL[n.kind] ?? C.g8;
    if (this.tut.highlight(n.id) && Math.floor(this.t * 3) % 2 === 0) { this.frame(g, x0 - 4, y0 - 4, w + 8, h + 8, C.am); this.frame(g, x0 - 3, y0 - 3, w + 6, h + 6, C.amd); }
    // a drop shadow, the body, a kind strip, the rim
    this.R(g, x0 + 2, y0 + 2, w, h, 'rgba(0,0,0,0.5)');
    const open = !logic || n.open || n.kind === 'sensor' || n.kind === 'split' || n.kind === 'merge';
    this.R(g, x0, y0, w, h, n.kind === 'site' ? '#15140c' : logic ? (open ? C.g3 : '#1e140c') : C.bg2);
    if (!logic) this.R(g, x0 + 1, y0 + 1, 2, h - 2, kc);
    const rim = sel ? C.am : hov ? C.g8 : logic ? C.g7 : C.g6;
    if (n.kind === 'site') { this.line(g, x0, y0, x0 + w - 1, y0, rim, 3, 2); this.line(g, x0, y0 + h - 1, x0 + w - 1, y0 + h - 1, rim, 3, 2); this.line(g, x0, y0, x0, y0 + h - 1, rim, 3, 2); this.line(g, x0 + w - 1, y0, x0 + w - 1, y0 + h - 1, rim, 3, 2); }
    else this.frame(g, x0, y0, w, h, rim);
    if (sel) this.frame(g, x0 + 1, y0 + 1, w - 2, h - 2, C.amd);
    // the icon window
    const iw = h - 6, ix = x0 + (logic ? 3 : 5), iy = y0 + 3;
    this.R(g, ix, iy, iw, iw, C.bg0);
    if (logic) g.drawImage(this.glyphImg(n.kind), ix + Math.floor((iw - 16) / 2), iy + Math.floor((iw - 16) / 2), 16, 16);
    else { const src = this.nodeIcon(n); if (src) { const im = this.img(src); if (im.complete && im.naturalWidth) g.drawImage(im, ix + Math.floor((iw - im.naturalWidth) / 2), iy + Math.floor((iw - im.naturalHeight) / 2)); } }
    // text: the name, and what it holds, makes or is doing
    const tx = ix + iw + 4, tw = x0 + w - tx - 8;
    this.text(g, clip(g, logic ? LOGIC_NAME[n.kind as LogicKind] : n.name, tw), tx, y0 + 3, n.kind === 'site' ? C.aml : C.g9);
    const [sub, sc] = this.subline(n);
    this.text(g, clip(g, sub, tw), tx, y0 + (logic ? 12 : 16), sc);
    // the status lamp
    const lc = this.lamp(n);
    if (lc) { this.R(g, x0 + w - 7, y0 + 3, 4, 4, lc); this.R(g, x0 + w - 7, y0 + 3, 1, 1, C.g9); }
    // ports: input on the left, output on the right
    const ins = n.kind !== 'deposit' && n.kind !== 'field' && n.kind !== 'sensor', outs = n.kind !== 'site' && n.kind !== 'sensor';
    if (ins) { this.R(g, x0 - 3, c.y - 4, 3, 8, L.routes.some((r) => r.to === n.id) ? C.g8 : C.g5); this.R(g, x0 - 3, c.y - 4, 3, 1, C.bg0); }
    if (outs) {
      const hp = this.hover.node === n.id && this.hover.port;
      this.R(g, x0 + w, c.y - 5, 4, 10, hp ? C.am : L.routes.some((r) => r.from === n.id) ? C.g8 : C.g5);
      this.R(g, x0 + w + 1, c.y - 1, 2, 2, C.bg0);
      if (hp) this.frame(g, x0 + w - 1, c.y - 7, 7, 14, C.aml);
    }
  }
  private glyphs = new Map<string, HTMLCanvasElement>();
  private glyphImg(kind: string) { let c = this.glyphs.get(kind); if (!c) { c = document.createElement('canvas'); c.width = c.height = 24; glyph(c.getContext('2d')!, kind, true, true); this.glyphs.set(kind, c); } return c; }
  private nodeIcon(n: LNode): string | null {
    const L = this.L;
    switch (n.kind) {
      case 'pod': return phosphor('depot', 24, 24, [217, 164, 58]);
      case 'building': case 'container': { const b = L.bld(n); return b ? phosphor(b.kind, 24, 24) : null; }
      case 'site': { const s = L.site(n); return s ? phosphor(s.kind, 24, 24, [236, 210, 154]) : null; }
      case 'deposit': { const s = L.seam(n); return s ? itemIcon(s.item, 22) : null; }
      case 'field': { const y = L.fieldYields(n)[0]; return y ? itemIcon(y, 22) : null; }
      default: return null;
    }
  }
  private lamp(n: LNode): string | null {
    const b = this.L.bld(n);
    if (b && (b.def.station || b.def.extract)) return hex(STATUS_COL[b.status]);
    if (n.kind === 'gate' || n.kind === 'timer' || n.kind === 'counter' || n.kind === 'buffer') return n.open ? C.g8 : C.am;
    if (n.kind === 'sensor') return n.sig ? C.am : C.g5;
    return null;
  }
  /** the second line of a card: what it holds, makes, or is doing */
  private subline(n: LNode): [string, string] {
    const L = this.L, top = (ids: ItemId[], f: (id: ItemId) => number) => ids.map((id) => [id, f(id)] as [ItemId, number]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id, v]) => `${short(id)} ${v}`).join(' ');
    switch (n.kind) {
      case 'pod': return [top(L.offers(n), (id) => L.level(n, id)) || 'EMPTY', C.g7];
      case 'container': { const s = top(L.offers(n), (id) => L.level(n, id)); return [s || 'EMPTY', s ? C.g8 : C.g6]; }
      case 'building': {
        const b = L.bld(n)!; if (!b) return ['', C.g6];
        if (b.recipe) { const o = Object.keys(b.recipe.out)[0]; return [`${b.status === 'working' ? 'MAKING' : b.status.toUpperCase()} ${o ? short(o) : ''}`.trim(), b.status === 'working' ? C.g8 : C.am]; }
        if (b.def.extract === 'node') { const s = L.f.seams[b.seam]; return [s ? `MINING ${short(s.item)}` : 'NO SEAM', C.g8]; }
        return [b.status === 'working' ? 'WORKING' : b.status.toUpperCase(), C.g7];
      }
      case 'deposit': { const s = L.seam(n); return s ? [s.drill ? 'BURIED: DRILL ONLY' : `${Math.floor(s.amount)} LEFT`, s.drill ? C.am : C.g7] : ['', C.g6]; }
      case 'field': { const fl = L.fieldOf(n); return [`${fl?.r ?? 0} M · ${L.fieldYields(n).slice(0, 2).map(short).join(' ')}`, C.g7]; }
      case 'site': { const s = L.site(n); return s ? [s.stage === 'build' ? `BUILDING ${Math.round(Math.min(1, s.work / s.workNeed) * 100)}%` : `SUPPLY ${Math.round(L.f.sites.progress(s) * 200)}%`, C.aml] : ['', C.g6]; }
      case 'split': return [`${L.routes.filter((r) => r.from === n.id).length} OUT`, C.g7];
      case 'merge': return [`${L.routes.filter((r) => r.to === n.id).length} IN`, C.g7];
      case 'buffer': return [`${n.open ? 'FILL' : 'FULL'} ${n.cfg.lo}-${n.cfg.hi}`, n.open ? C.g8 : C.am];
      case 'counter': return [`${n.count}/${n.cfg.n}`, n.open ? C.g8 : C.am];
      case 'gate': return [n.open ? 'OPEN' : 'SHUT', n.open ? C.g8 : C.am];
      case 'timer': { const P = n.cfg.period ?? 120, ph = L.f.time % P; return [`${n.open ? 'ON' : 'OFF'} ${Math.ceil(n.open ? (n.cfg.on ?? 40) - ph : P - ph)}S`, n.open ? C.g8 : C.am]; }
      case 'sensor': return [`${n.sig ? 'SIGNAL' : 'QUIET'} ${n.cfg.what === 'count' ? n.count : ''}`, n.sig ? C.am : C.g7];
      default: return ['', C.g6];
    }
  }
  /** workers as small arrows where they really are; idle ones blink amber */
  private workers(g: CanvasRenderingContext2D) {
    for (const w of this.f.workers.list) {
      if (w.c.dead || w.job === 'idle') continue;
      const x = this.sx(w.c.x), y = this.sy(w.c.z);
      if (x < -5 || y < -5 || x > this.W + 5 || y > this.H + 5) continue;
      const idle = !w.lj && (w.state === 'wait' || w.note.startsWith('NO') || w.note.startsWith('WAITING'));
      if (idle && Math.floor(this.t * 2) % 2) continue;
      const col = idle ? C.am : w.state === 'eat' ? C.g5 : C.g9;
      // a 5 px arrow pointing its way, in one of eight drawn turns
      const a = Math.round(((Math.atan2(Math.cos(w.c.yaw), Math.sin(w.c.yaw)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
      const fx = Math.round(Math.cos(a * Math.PI / 4)), fy = Math.round(Math.sin(a * Math.PI / 4));
      this.R(g, x - 1, y - 1, 3, 3, C.bg0); this.R(g, x, y, 1, 1, col);
      this.R(g, x + fx, y + fy, 1, 1, col); this.R(g, x + fx * 2, y + fy * 2, 1, 1, col);
      this.R(g, x - fy, y + fx, 1, 1, col); this.R(g, x + fy, y - fx, 1, 1, col);
    }
  }

  // ------------------------------------------------------------------ the strips
  private renderTop() {
    const L = this.L, nx = L.nextTier(), tier = L.tier;
    const key = `${tier}|${nx?.at}|${L.auto}|${L.templates.length}|${this.tut.step}|${L.nodes.length}|${L.routes.length}`;
    if (key === this.topKey) return;
    const first = !this.topKey;
    this.topKey = key;
    const segs = 30, on = nx ? Math.floor((nx.at / nx.need) * segs) : segs;
    this.topEl.innerHTML = `<div class="ttl"><span class="pl-stencil">LOGISTICS SCHEMATIC</span><span class="sub pl-s">COLONY NODE MAP · ${L.nodes.length} NODES · ${L.routes.length} ROUTES</span></div><span class="sp"></span>
      <div class="nm-disc pl-glass" data-hw="glass" data-seed="13"><div class="t pl-s">DISCIPLINE<b>LEVEL ${['0', 'I', 'II', 'III', 'IV', 'V'][tier]}</b></div><div class="bar">${Array.from({ length: segs }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>
      <div class="nx pl-s">${nx ? `NEXT: ${nx.names.join(', ').toUpperCase()} · ${nx.need - nx.at} TO ROUTE` : 'EVERY LOGIC NODE LEARNED'}</div></div>
      <span class="nm-sw pl-s ${L.auto ? 'on' : ''}" data-a="auto" title="Free haulers guess their own work when no route wants them"><span class="lever"></span>AUTO<br>HAUL</span>
      <span class="pl-btn" data-a="tpl">TEMPLATES</span><span class="pl-btn ${this.tut.step > 0 && this.tut.step < 99 ? 'on' : ''}" data-a="tut">GUIDE</span><span class="pl-btn" data-a="close">CLOSE <span class="pl-key">N</span></span>`;
    this.topEl.querySelector('[data-a="auto"]')!.addEventListener('click', () => { L.auto = !L.auto; this.topKey = ''; sfx('click', 1, 0.5); toast(L.auto ? 'Free haulers will find their own work when no route wants them' : 'Haulers now carry only what the routes say', 'info', 2200); });
    this.topEl.querySelector('[data-a="tpl"]')!.addEventListener('click', () => { this.panel.showTemplates(); });
    this.topEl.querySelector('[data-a="tut"]')!.addEventListener('click', () => this.tut.start());
    this.topEl.querySelector('[data-a="close"]')!.addEventListener('click', () => this.close());
    if (first) paintHW(this.topEl); else requestAnimationFrame(() => paintHW(this.topEl));
  }
  private renderBot() {
    const L = this.L, ws = this.f.workers.list.filter((w) => !w.c.dead);
    const haul = ws.filter((w) => w.job === 'haul' || w.job === 'build'), busy = haul.filter((w) => !!w.lj), idle = haul.filter((w) => !w.lj && w.state === 'wait');
    const stalled = L.routes.filter((r) => r.on && r.note && r.inflight === 0), flow = L.routes.reduce((a, r) => a + L.flow(r.id), 0);
    const sites = this.f.sites?.list.length ?? 0;
    this.botEl.innerHTML = `<span>WORKERS <b>${ws.length}</b> · HAULING <b>${busy.length}</b>/<b>${haul.length}</b>${idle.length ? ` · <span class="amb">${idle.length} IDLE</span>` : ''}${ws.length - haul.length ? ` · ${ws.length - haul.length} ON OTHER JOBS` : ''}</span>
      <span>FLOW <b>${Math.round(flow)}</b> ITEMS/MIN</span><span>${stalled.length ? `<span class="amb">${stalled.length} ROUTE${stalled.length > 1 ? 'S' : ''} STALLED</span>` : 'NO STALLS'}</span><span>SITES <b>${sites}</b></span><span class="sp"></span>
      <span>LMB SELECT · DRAG A TAB TO WIRE · SHIFT-DRAG BOX · DEL REMOVE · F FIT · T TIDY · ESC BACK</span>`;
  }
}
/** a cubic bezier point */
export function bez(p: number[][], t: number): [number, number] {
  const u = 1 - t;
  return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]];
}
function clip(g: CanvasRenderingContext2D, s: string, w: number) {
  g.font = FONT;
  if (g.measureText(s).width <= w) return s;
  let t = s; while (t.length > 1 && g.measureText(t + '.').width > w) t = t.slice(0, -1);
  return t + '.';
}
/** a short item name for card lines */
export function short(id: ItemId) { const n = (ITEMS[id]?.name ?? id).toUpperCase(); return n.length > 12 ? n.replace(/\s*\(.*\)/, '').slice(0, 12) : n; }

/** hand-placed 24 x 24 pixel glyphs for the tool keys and logic nodes (phosphor on glass) */
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
/** paint a glyph into a 24 x 24 canvas: '#' the stroke, 'O' the lit fill; `node` drops the background */
export function glyph(g: CanvasRenderingContext2D, kind: string, lit = true, node = false) {
  g.clearRect(0, 0, 24, 24);
  const rows = GLYPH[kind] ?? [];
  const oy = Math.floor((24 - rows.length) / 2) + 1;
  const stroke = lit ? (node ? C.g9 : C.g8) : C.g5, fill = lit ? C.g6 : C.g4;
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '.') return; g.fillStyle = ch === '#' ? stroke : fill; g.fillRect(i + 1, oy + j, 1, 1); }));
}
