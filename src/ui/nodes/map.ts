// The NODE MAP (N): the colony's logistics as a live schematic on one big phosphor glass. Every node is a real thing
// (the pod's stores, buildings, containers, deposits, harvest fields, construction sites) laid out where it stands in
// the world, nudged apart so the cards never overlap, and movable (or TIDY lays the chains out left to right). Drag
// from a node's output tab to another node to wire a ROUTE; the wire shows its filter, rate and priority, packets
// travel along it as workers carry loads, and a stalled wire says why. Logic nodes (unlocked by the logistics
// discipline or research) sit on wires. The inspector on the right edits whatever is selected. The model is
// src/logistics/network.ts; this file draws and handles input only.
import './nodes.css';
import '../build/build.css';
import type { Factory } from '../../factory/factory';
import type { Worker } from '../../factory/workers';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import { STATUS_COL } from '../../factory/status';
import { isBelt } from '../../factory/defs';
import { LOGIC, LOGIC_NAME, isLogic, type LNode, type Route, type LogicKind, type Chain, type Template } from '../../logistics/network';
import { FEATURES } from '../../logistics/unlocks';
import { phosphor } from '../build/studio';
import { Panel } from './panel';
import { Tutorial } from './tutorial';
import { el, ui, toast } from '../kit';
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
const KIND_NAME: Record<string, string> = { pod: 'POD', building: 'MACHINE', container: 'CONTAINER', deposit: 'DEPOSIT', field: 'FIELD', site: 'SITE' };
const D2 = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export class NodeMap {
  readonly root: HTMLDivElement;
  private glass: HTMLDivElement; private cv: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private toolsEl: HTMLDivElement; private topEl: HTMLDivElement; private botEl: HTMLDivElement; private hintEl: HTMLDivElement;
  readonly panel: Panel;
  readonly tut: Tutorial;
  isOpen = false;
  cam = { x: 0, z: 0, zoom: 14 };
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
  private t = 0; private W = 0; private H = 0; private dpr = 1;
  private topKey = ''; private botT = 0;

  constructor(readonly f: Factory) {
    const r = (this.root = el('div', 'nm', ui()));
    for (const c of ['tl', 'tr', 'bl', 'br']) el('i', 'pl-screw ' + c, r);
    this.topEl = el('div', 'nm-top', r);
    this.toolsEl = el('div', 'nm-tools', r);
    this.glass = el('div', 'pl-crt nm-glass', r);
    this.cv = el('canvas', '', this.glass);
    this.ctx = this.cv.getContext('2d')!;
    el('div', 'nm-legend', this.glass, `<span><i style="background:${C.g8}"></i>MOVING</span><span><i style="background:${C.g6}"></i>READY</span><span><i style="background:${C.am}"></i>STALLED</span><span><i style="background:${C.gm}"></i>OFF</span><span>WHEEL ZOOM · DRAG PAN · DRAG A NODE'S OUTPUT TAB TO WIRE</span>`);
    this.hintEl = el('div', 'nm-hint', this.glass);
    const side = el('div', 'pl-crt nm-side', r);
    this.panel = new Panel(this, side);
    this.botEl = el('div', 'nm-bot', r);
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
    this.isOpen = true; this.root.classList.add('on');
    this.L.sync(true);
    this.under = null;
    this.fit();
    this.panel.dirty(); this.topKey = '';
    this.renderTools();
    sfx('open', 0.8, 0.6);
    this.tut.opened();
  }
  close() { if (!this.isOpen) return; this.isOpen = false; this.root.classList.remove('on'); this.drag = null; this.setTool('select'); sfx('close', 0.8, 0.5); }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  // ------------------------------------------------------------------ view
  /** frame the colony: every node in view */
  fit() {
    this.size();
    const ns = this.L.nodes; if (!ns.length) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const n of ns) { const p = this.wpos(n); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    this.cam.x = (x0 + x1) / 2; this.cam.z = (z0 + z1) / 2;
    const zx = (this.W - 260) / Math.max(10, x1 - x0), zz = (this.H - 140) / Math.max(10, z1 - z0);
    this.cam.zoom = Math.max(4, Math.min(34, Math.min(zx, zz)));
  }
  private size() {
    const r = this.glass.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const W = Math.max(10, Math.round(r.width)), H = Math.max(10, Math.round(r.height));
    if (W !== this.W || H !== this.H || dpr !== this.dpr) { this.W = W; this.H = H; this.dpr = dpr; this.cv.width = W * dpr; this.cv.height = H * dpr; }
  }
  /** the map position of a node (with its overlap nudge) in world metres */
  wpos(n: LNode) { const d = this.disp.get(n.id); return { x: n.x + (d?.x ?? 0), z: n.z + (d?.z ?? 0) }; }
  sx(x: number) { return (x - this.cam.x) * this.cam.zoom + this.W / 2; }
  sy(z: number) { return (z - this.cam.z) * this.cam.zoom + this.H / 2; }
  wx(sx: number) { return (sx - this.W / 2) / this.cam.zoom + this.cam.x; }
  wz(sy: number) { return (sy - this.H / 2) / this.cam.zoom + this.cam.z; }
  private get k() { return Math.max(0.8, Math.min(1.15, this.cam.zoom / 16)) * (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--k')) || 1); }
  private kk = 1; private kT = 0;
  cardSize(n: LNode) { const k = this.kk; return isLogic(n.kind) ? { w: 112 * k, h: 44 * k } : { w: 182 * k, h: 54 * k }; }

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

  // ------------------------------------------------------------------ the tool column
  private renderTools() {
    const L = this.L;
    const tools: [Tool, string, string, string | null][] = [['select', 'SELECT', 'S', null], ['wire', 'WIRE', 'W', null], ['field', 'FIELD', 'F', null]];
    let h = '';
    for (const [t, n, key] of tools) h += `<div class="nm-tool ${this.tool === t ? 'on' : ''}" data-t="${t}"><canvas width="80" height="80" data-g="${t}"></canvas><span class="nm2">${n}</span><span class="hk">${key}</span></div>`;
    h += `<div class="h">LOGIC</div>`;
    for (const lk of LOGIC) {
      const ok = L.unlocked('logic.' + lk);
      h += `<div class="nm-tool ${this.tool === lk ? 'on' : ''} ${ok ? '' : 'lock'}" data-t="${lk}" data-why="${ok ? '' : L.lockWhy('logic.' + lk)}"><canvas width="80" height="80" data-g="${lk}"></canvas><span class="nm2">${LOGIC_NAME[lk]}</span></div>`;
    }
    h += `<div class="h">VIEW</div><div class="nm-tool" data-a="fit"><canvas width="80" height="80" data-g="fit"></canvas><span class="nm2">FIT</span><span class="hk">F</span></div><div class="nm-tool" data-a="tidy"><canvas width="80" height="80" data-g="tidy"></canvas><span class="nm2">TIDY</span><span class="hk">T</span></div>`;
    this.toolsEl.innerHTML = h;
    this.toolsEl.querySelectorAll<HTMLCanvasElement>('canvas[data-g]').forEach((c) => this.glyph(c.getContext('2d')!, c.dataset.g!, 80, !c.closest('.lock')));
    this.toolsEl.querySelectorAll<HTMLElement>('[data-t]').forEach((e) => e.addEventListener('click', () => { this.setTool(e.dataset.t as Tool); sfx('click', 1.2, 0.4); }));
    this.toolsEl.querySelector('[data-a="fit"]')!.addEventListener('click', () => { this.fit(); sfx('click', 1.2, 0.4); });
    this.toolsEl.querySelector('[data-a="tidy"]')!.addEventListener('click', () => this.tidy());
  }
  /** hand-drawn tool and logic glyphs (straight strokes, phosphor on glass) */
  glyph(g: CanvasRenderingContext2D, kind: string, S: number, lit = true) {
    g.clearRect(0, 0, S, S);
    g.fillStyle = C.bg1; g.fillRect(4, 4, S - 8, S - 8);
    g.strokeStyle = C.g4; g.lineWidth = 2; g.strokeRect(5, 5, S - 10, S - 10);
    const col = lit ? C.g8 : C.g5;
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 4; g.lineCap = 'square'; g.lineJoin = 'miter';
    const L = (pts: number[][]) => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke(); };
    const R = (x: number, y: number, w: number, h: number) => g.fillRect(x, y, w, h);
    switch (kind) {
      case 'select': L([[24, 18], [24, 58], [34, 48], [42, 62], [48, 59], [41, 45], [54, 45], [24, 18]]); break;
      case 'wire': R(14, 30, 14, 14); R(52, 38, 14, 14); L([[28, 37], [40, 37], [40, 45], [52, 45]]); break;
      case 'field': for (let i = 0; i < 4; i++) L([[18 + i * 12, 60], [22 + i * 12, 40 - (i % 2) * 8]]); L([[14, 62], [66, 62]]); break;
      case 'split': L([[14, 40], [36, 40]]); L([[36, 40], [62, 22]]); L([[36, 40], [62, 40]]); L([[36, 40], [62, 58]]); R(32, 36, 8, 8); break;
      case 'merge': L([[18, 22], [44, 40]]); L([[18, 40], [44, 40]]); L([[18, 58], [44, 40]]); L([[44, 40], [66, 40]]); R(40, 36, 8, 8); break;
      case 'buffer': g.lineWidth = 3; g.strokeRect(22, 18, 36, 46); for (let i = 0; i < 4; i++) R(27, 50 - i * 9, 26, 5); g.fillStyle = C.am; R(16, 30, 4, 3); R(16, 54, 4, 3); break;
      case 'counter': g.lineWidth = 3; g.strokeRect(14, 24, 52, 32); g.font = '24px VT, monospace'; g.textAlign = 'center'; g.fillText('047', 40, 48); break;
      case 'gate': L([[12, 40], [30, 40]]); L([[50, 40], [68, 40]]); L([[30, 26], [30, 54]]); L([[50, 26], [50, 54]]); L([[30, 28], [48, 18]]); break;
      case 'timer': g.lineWidth = 3; g.strokeRect(18, 18, 44, 44); L([[40, 40], [40, 26]]); L([[40, 40], [50, 46]]); R(37, 12, 6, 5); break;
      case 'sensor': L([[16, 56], [28, 56], [34, 34], [42, 60], [50, 26], [56, 56], [66, 56]]); break;
      case 'fit': for (const [x, y, a, b] of [[16, 16, 1, 1], [64, 16, -1, 1], [16, 64, 1, -1], [64, 64, -1, -1]]) L([[x, y + 12 * b], [x, y], [x + 12 * a, y]]); R(32, 32, 16, 16); break;
      case 'tidy': R(14, 22, 14, 10); R(14, 48, 14, 10); R(52, 35, 14, 10); L([[28, 27], [40, 27], [40, 40], [52, 40]]); L([[28, 53], [40, 53], [40, 40]]); break;
    }
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
    const D = Math.max(...cols.keys()), dx = 230 / this.cam.zoom * this.kk, dz = 84 / this.cam.zoom * this.kk;
    for (const [d, list] of cols) { list.sort((a, b) => a.z - b.z); list.forEach((n, i) => L.moveNode(n, cx + (d - D / 2) * dx, cz + (i - (list.length - 1) / 2) * dz)); }
    this.disp.clear();
    sfx('done', 1.1, 0.5);
  }

  // ------------------------------------------------------------------ input
  private nodeAt(x: number, y: number): { id: string; port: boolean } | null {
    let best: { id: string; port: boolean } | null = null;
    for (const c of this.cards.values()) {
      const px = c.x + c.w / 2, py = c.y;
      if (D2(x, y, px, py) < 13 * this.kk && c.n.kind !== 'sensor') return { id: c.n.id, port: true };
      if (x >= c.x - c.w / 2 && x <= c.x + c.w / 2 && y >= c.y - c.h / 2 && y <= c.y + c.h / 2) best = { id: c.n.id, port: false };
    }
    return best;
  }
  private routeAt(x: number, y: number): number | null {
    let best: number | null = null, bd = 8;
    for (const r of this.L.routes) {
      const pts = this.wirePts(r); if (!pts) continue;
      for (let i = 0; i <= 24; i++) { const p = bez(pts, i / 24), d = D2(x, y, p[0], p[1]); if (d < bd) { bd = d; best = r.id; } }
    }
    return best;
  }
  private rel(e: PointerEvent | WheelEvent) { const r = this.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
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
    if (!d.on && D2(p.x, p.y, d.sx, d.sy) > 5) { d.on = true; if (d.mode === 'maybe') { d.mode = 'pan'; this.glass.classList.add('pan'); } }
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
      else if (D2(p.x, p.y, d.sx, d.sy) < 6) { this.drag = { ...d, on: true }; } // a click on the tab: keep wiring until the next click
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
    this.cam.zoom = Math.max(3, Math.min(48, this.cam.zoom * (e.deltaY > 0 ? 0.88 : 1.14)));
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
  /** the bezier control points of a wire, in screen px */
  wirePts(r: Route): number[][] | null {
    const a = this.cards.get(r.from), b = this.cards.get(r.to); if (!a || !b) return null;
    const x1 = a.x + a.w / 2, y1 = a.y, x2 = b.x - b.w / 2, y2 = b.y;
    const dx = Math.max(40 * this.kk, Math.abs(x2 - x1) * 0.5) * (x2 < x1 ? 1.6 : 1);
    return [[x1, y1], [x1 + dx, y1], [x2 - dx, y2], [x2, y2]];
  }

  // ------------------------------------------------------------------ drawing
  update(dt: number) {
    if (!this.isOpen) return;
    this.t += dt;
    this.kT -= dt; if (this.kT <= 0) { this.kT = 0.5; this.kk = this.k; }
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
    for (let it = 0; it < 2; it++) for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i], b = ns[j], sa = this.cardSize(a), sb = this.cardSize(b);
      const pa = this.wpos(a), pb = this.wpos(b);
      const ox = (sa.w + sb.w) / 2 / z + 10 / z - Math.abs(pa.x - pb.x), oz = (sa.h + sb.h) / 2 / z + 10 / z - Math.abs(pa.z - pb.z);
      if (ox <= 0 || oz <= 0) continue;
      const along = oz < ox * 0.6 ? 'z' : 'x';
      const s = along === 'z' ? (pa.z < pb.z ? -1 : 1) : (pa.x < pb.x ? -1 : 1);
      const push = (along === 'z' ? oz : ox) * 0.25;
      const move = (n: LNode, sg: number) => { if (n.tidy && !(this.drag?.mode === 'node' && this.drag.id === n.id)) return; if (this.drag?.mode === 'node' && this.drag.id === n.id) return; const d = this.disp.get(n.id) ?? { x: 0, z: 0 }; if (along === 'z') d.z += sg * push; else d.x += sg * push; this.disp.set(n.id, d); };
      move(a, s); move(b, -s);
    }
  }
  private img(src: string) { let i = this.icons.get(src); if (!i) { i = new Image(); i.src = src; this.icons.set(src, i); } return i; }
  private itemImg(id: ItemId) { return this.img(itemIcon(id, 32)); }
  private draw() {
    const g = this.ctx, W = this.W, H = this.H, L = this.L, k = this.kk;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    this.underlay(g);
    // cards first (wires attach to them)
    this.cards.clear();
    for (const n of L.nodes) { const p = this.wpos(n), s = this.cardSize(n); this.cards.set(n.id, { n, x: this.sx(p.x), y: this.sy(p.z), w: s.w, h: s.h }); }
    // fields: their ground, dashed
    for (const n of L.nodes) if (n.kind === 'field') { const fl = L.fieldOf(n); if (!fl) continue; const x = this.sx(fl.x), y = this.sy(fl.z), r = fl.r * this.cam.zoom; g.setLineDash([4, 4]); g.strokeStyle = 'rgba(111,143,58,0.55)'; g.lineWidth = 1; g.strokeRect(x - r, y - r, r * 2, r * 2); g.setLineDash([]); }
    // sensor probes and gate signals: dotted
    for (const n of L.nodes) {
      const c = this.cards.get(n.id); if (!c) continue;
      const links: string[] = [];
      if (n.kind === 'sensor' && n.cfg.probe) links.push(n.cfg.probe);
      for (const cd of [...(n.cfg.conds ?? []), ...L.routes.filter((r) => r.from === n.id || r.to === n.id).flatMap((r) => r.conds)]) if (cd.k === 'signal' && cd.node) links.push(cd.node);
      for (const id of links) { const o = this.cards.get(id); if (!o) continue; g.setLineDash([2, 4]); g.strokeStyle = n.sig || L.node(id)?.sig ? C.am : C.g5; g.lineWidth = 1.5; g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(c.x, c.y); g.stroke(); g.setLineDash([]); }
    }
    // wires
    const chains = L.chains();
    for (const r of L.routes) this.wire(g, r, chains);
    // construction supply runs (no wire): a faint dotted line while a load is on the way
    for (const [w, j] of L.live) if (!j.chain && j.src && j.dst) { const a = this.cards.get(j.src.id), b = this.cards.get(j.dst.id); if (!a || !b) continue; g.setLineDash([3, 5]); g.strokeStyle = 'rgba(236,210,154,0.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]); if (w.carry) { const pr = this.prog(w, j.src, j.dst); this.packet(g, a.x + (b.x - a.x) * pr, a.y + (b.y - a.y) * pr, w.carry.id); } }
    // packets on the wires
    for (const [w, j] of L.live) if (j.chain) this.chainPacket(g, w, j.chain, j.item);
    // nodes
    for (const c of this.cards.values()) this.card(g, c);
    // workers in the field (world positions)
    this.workers(g);
    // the wire being drawn
    const d = this.drag;
    if (d?.mode === 'wire' && d.on) {
      const a = this.cards.get(d.id!); if (a) {
        const h = this.hover.node ? L.node(this.hover.node) : null, src = L.node(d.id!)!;
        const bad = h && h.id !== src.id ? L.canWire(src, h) : null;
        g.strokeStyle = bad ? C.rd : C.aml; g.lineWidth = 2; g.setLineDash([6, 4]); g.lineDashOffset = -this.t * 30;
        const x1 = a.x + a.w / 2, y1 = a.y, x2 = d.x, y2 = d.y, dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
        g.beginPath(); g.moveTo(x1, y1); g.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
        if (bad) this.label(g, x2 + 12, y2 + 18, bad.toUpperCase(), C.rdl, 'left');
      }
    }
    if (d?.mode === 'box' && d.on) { g.strokeStyle = C.aml; g.lineWidth = 1; g.setLineDash([4, 3]); g.strokeRect(Math.min(d.sx, d.x), Math.min(d.sy, d.y), Math.abs(d.x - d.sx), Math.abs(d.y - d.sy)); g.setLineDash([]); }
    // a placing tool follows the cursor
    if (this.tool !== 'select' && this.tool !== 'wire') {
      const mx = this.g.input.mx - this.cv.getBoundingClientRect().left, my = this.g.input.my - this.cv.getBoundingClientRect().top;
      if (mx > 0 && my > 0 && mx < W && my < H) { g.globalAlpha = 0.55; g.strokeStyle = C.aml; g.setLineDash([4, 3]); if (this.tool === 'field') { const r = 8 * this.cam.zoom; g.strokeRect(mx - r, my - r, r * 2, r * 2); } else g.strokeRect(mx - 56 * k, my - 22 * k, 112 * k, 44 * k); g.setLineDash([]); g.globalAlpha = 1; }
    }
    void STATUS_COL;
  }
  /** the colony under the schematic: water, rock, the real footprints of every building and belt */
  private underlay(g: CanvasRenderingContext2D) {
    const W = this.W, H = this.H, z = this.cam.zoom, R = this.g.region, N = R.N;
    if (!this.under) {
      const c = document.createElement('canvas'); c.width = N; c.height = N;
      const cg = c.getContext('2d')!, img = cg.createImageData(N, N), dd = img.data;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const o = (j * N + i) * 4, water = R.isWater(i + 0.5, j + 0.5), rock = R.solid[j * N + i] === 1;
        if (water) { dd[o] = 8; dd[o + 1] = 22; dd[o + 2] = 24; dd[o + 3] = 255; }
        else if (rock) { dd[o] = 22; dd[o + 1] = 30; dd[o + 2] = 24; dd[o + 3] = 255; }
        else { const h = R.h[j * N + i], v = ((h * 2) | 0) & 1; dd[o] = 10 + v * 2; dd[o + 1] = 17 + v * 3; dd[o + 2] = 13 + v * 2; dd[o + 3] = 255; }
      }
      cg.putImageData(img, 0, 0);
      this.under = c;
    }
    g.globalAlpha = 0.9;
    g.drawImage(this.under, this.sx(0), this.sy(0), N * z, N * z);
    g.globalAlpha = 1;
    // grid: 4 m minor, 16 m major
    const step = z >= 10 ? 4 : 16;
    g.lineWidth = 1;
    for (let x = Math.floor(this.wx(0) / step) * step; x < this.wx(W); x += step) { g.strokeStyle = x % 16 === 0 ? 'rgba(74,132,87,0.16)' : 'rgba(74,132,87,0.07)'; const X = Math.round(this.sx(x)) + 0.5; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, H); g.stroke(); }
    for (let zz = Math.floor(this.wz(0) / step) * step; zz < this.wz(H); zz += step) { g.strokeStyle = zz % 16 === 0 ? 'rgba(74,132,87,0.16)' : 'rgba(74,132,87,0.07)'; const Y = Math.round(this.sy(zz)) + 0.5; g.beginPath(); g.moveTo(0, Y); g.lineTo(W, Y); g.stroke(); }
    // footprints
    for (const b of this.f.buildings) {
      g.fillStyle = isBelt(b.kind) ? 'rgba(74,132,87,0.22)' : 'rgba(74,132,87,0.14)';
      g.fillRect(this.sx(b.cx), this.sy(b.cz), b.fw * z - 1, b.fd * z - 1);
    }
    if (this.f.sites) for (const s of this.f.sites.list) { g.strokeStyle = 'rgba(236,210,154,0.4)'; g.setLineDash([3, 3]); g.strokeRect(this.sx(s.cx) + 0.5, this.sy(s.cz) + 0.5, s.fw * z - 1, s.fd * z - 1); g.setLineDash([]); }
    const core = this.f.hive.core;
    if (core) { const x = this.sx(core.x), y = this.sy(core.z); g.strokeStyle = 'rgba(217,164,58,0.35)'; g.lineWidth = 1; g.strokeRect(x - 2.4 * z, y - 2.4 * z, 4.8 * z, 4.8 * z); }
    // scale bar
    const m = z >= 14 ? 10 : z >= 6 ? 20 : 50, bw = m * z;
    g.fillStyle = C.g6; g.fillRect(W - bw - 18, H - 22, bw, 2); g.fillRect(W - bw - 18, H - 27, 1, 7); g.fillRect(W - 18, H - 27, 1, 7);
    g.font = '13px VT, monospace'; g.textAlign = 'right'; g.fillStyle = C.g7; g.fillText(`${m} m`, W - 18, H - 30); g.textAlign = 'left';
  }
  private label(g: CanvasRenderingContext2D, x: number, y: number, s: string, col: string, align: CanvasTextAlign = 'center') {
    g.font = `${Math.round(13 * this.kk)}px VT, monospace`;
    const w = g.measureText(s).width + 10, h = 16 * this.kk;
    const x0 = align === 'center' ? x - w / 2 : x;
    g.fillStyle = 'rgba(6,9,8,0.88)'; g.fillRect(x0, y - h / 2, w, h);
    g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(s, x0 + 5, y + 1); g.textBaseline = 'alphabetic';
  }
  /** a wire: colour by state, flow dashes, an arrow, the filter plate, the stall note */
  private wire(g: CanvasRenderingContext2D, r: Route, chains: Chain[]) {
    const pts = this.wirePts(r); if (!pts) return;
    const L = this.L, flow = L.flow(r.id), moving = r.inflight > 0 || this.t - 0 < 0 || (L.f.time - r.lastT < 12 && r.moved > 0);
    const sel = this.sel?.k === 'route' && this.sel.id === r.id, hov = this.hover.route === r.id;
    const col = !r.on ? C.gm : r.note && !moving ? C.am : moving ? C.g8 : C.g6;
    void chains;
    const path = () => { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.bezierCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1]); };
    if (sel || hov) { path(); g.strokeStyle = sel ? 'rgba(217,164,58,0.35)' : 'rgba(127,184,138,0.25)'; g.lineWidth = 9 * this.kk; g.stroke(); }
    path(); g.strokeStyle = C.bg0; g.lineWidth = 5 * this.kk; g.stroke();
    path(); g.strokeStyle = col; g.lineWidth = (sel ? 3 : 2.2) * this.kk;
    if (!r.on) g.setLineDash([3, 5]); else if (moving) { g.setLineDash([10, 6]); g.lineDashOffset = -this.t * 26; } else if (r.note) g.setLineDash([5, 4]);
    g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
    // arrow head
    const t0 = 0.72, p = bez(pts, t0), q = bez(pts, t0 + 0.02), a = Math.atan2(q[1] - p[1], q[0] - p[0]), s = 7 * this.kk;
    g.fillStyle = col; g.beginPath(); g.moveTo(p[0] + Math.cos(a) * s, p[1] + Math.sin(a) * s); g.lineTo(p[0] + Math.cos(a + 2.5) * s, p[1] + Math.sin(a + 2.5) * s); g.lineTo(p[0] + Math.cos(a - 2.5) * s, p[1] + Math.sin(a - 2.5) * s); g.fill();
    // the plate: filter icons, rate, priority, a condition mark
    const m = bez(pts, 0.42), k = this.kk, ic = 18 * k;
    const icons = r.filter.slice(0, 3);
    g.font = `${Math.round(13 * k)}px VT, monospace`;
    const rate = flow >= 1 ? `${Math.round(flow)}/MIN` : r.amount.mode === 'keep' ? `KEEP ${r.amount.n}` : r.amount.mode === 'batch' ? `×${r.amount.n}` : r.amount.mode === 'rate' ? `≤${r.amount.n}/M` : '';
    const tw = g.measureText(rate).width;
    const w = 8 + (icons.length ? icons.length * (ic + 2) : g.measureText('ANY').width + 4) + (rate ? tw + 8 : 0) + (r.conds.length ? 22 * k : 0) + 5 * 4 * k, h = 22 * k;
    const x0 = m[0] - w / 2, y0 = m[1] - h / 2;
    g.fillStyle = 'rgba(6,9,8,0.92)'; g.fillRect(x0, y0, w, h);
    g.strokeStyle = sel ? C.am : col; g.lineWidth = 1; g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    let cx = x0 + 5;
    if (icons.length) for (const id of icons) { const im = this.itemImg(id); if (im.complete) g.drawImage(im, cx, y0 + (h - ic) / 2, ic, ic); cx += ic + 2; }
    else { g.fillStyle = C.g7; g.textBaseline = 'middle'; g.fillText('ANY', cx, m[1] + 1); cx += g.measureText('ANY').width + 4; }
    if (rate) { g.fillStyle = moving ? C.g9 : C.g7; g.textBaseline = 'middle'; g.fillText(rate, cx + 3, m[1] + 1); cx += tw + 8; }
    if (r.conds.length) { g.fillStyle = C.am; g.fillText('IF', cx, m[1] + 1); cx += 22 * k; }
    for (let i = 0; i < 5; i++) { g.fillStyle = i < r.priority ? (r.priority >= 4 ? C.am : C.g8) : C.g4; g.fillRect(cx + i * 4 * k, y0 + h - 7 * k, 3 * k, 4 * k); }
    g.textBaseline = 'alphabetic';
    if (r.note && !moving) this.label(g, m[0], y0 + h + 10 * k, r.note, r.note === 'NOT CONNECTED' || r.note === 'NO WORKER ASSIGNED' ? C.rdl : C.am);
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
      g.strokeStyle = C.g8; g.lineWidth = 1.5; g.strokeRect(a.x + a.w / 2 + 8 * this.kk, a.y - 14 * this.kk, 8 * this.kk, 8 * this.kk);
      return;
    }
    const p = this.prog(w, ch.src, ch.dst), f = p * segs.length, i = Math.min(segs.length - 1, Math.floor(f));
    const pt = bez(segs[i], f - i);
    this.packet(g, pt[0], pt[1], item);
  }
  private packet(g: CanvasRenderingContext2D, x: number, y: number, item: ItemId) {
    const s = 20 * this.kk;
    g.fillStyle = 'rgba(217,164,58,0.25)'; g.fillRect(x - s / 2 - 3, y - s / 2 - 3, s + 6, s + 6);
    g.fillStyle = C.bg0; g.fillRect(x - s / 2, y - s / 2, s, s);
    g.strokeStyle = C.aml; g.lineWidth = 1.5; g.strokeRect(x - s / 2 + 0.5, y - s / 2 + 0.5, s - 1, s - 1);
    const im = this.itemImg(item); if (im.complete) g.drawImage(im, x - s / 2 + 2, y - s / 2 + 2, s - 4, s - 4);
  }
  /** one node card */
  private card(g: CanvasRenderingContext2D, c: Card) {
    const n = c.n, L = this.L, k = this.kk, x0 = Math.round(c.x - c.w / 2), y0 = Math.round(c.y - c.h / 2), w = Math.round(c.w), h = Math.round(c.h);
    const sel = (this.sel?.k === 'node' && this.sel.id === n.id) || this.multi.has(n.id), hov = this.hover.node === n.id;
    const tut = this.tut.highlight(n.id);
    const logic = isLogic(n.kind);
    const kc = logic ? C.g9 : KIND_COL[n.kind] ?? C.g8;
    // body
    if (tut) { const a = 0.4 + 0.3 * Math.sin(this.t * 6); g.strokeStyle = `rgba(217,164,58,${a})`; g.lineWidth = 6; g.strokeRect(x0 - 5, y0 - 5, w + 10, h + 10); }
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x0 + 3, y0 + 4, w, h);
    if (logic) {
      const ch = 8 * k;
      g.beginPath(); g.moveTo(x0 + ch, y0); g.lineTo(x0 + w - ch, y0); g.lineTo(x0 + w, y0 + ch); g.lineTo(x0 + w, y0 + h - ch); g.lineTo(x0 + w - ch, y0 + h); g.lineTo(x0 + ch, y0 + h); g.lineTo(x0, y0 + h - ch); g.lineTo(x0, y0 + ch); g.closePath();
      g.fillStyle = n.open || n.kind === 'sensor' || n.kind === 'split' || n.kind === 'merge' ? C.g3 : '#1e140c'; g.fill();
      g.strokeStyle = sel ? C.am : hov ? C.g9 : C.g7; g.lineWidth = sel ? 2 : 1; g.stroke();
    } else {
      g.fillStyle = n.kind === 'site' ? '#14130c' : C.bg2; g.fillRect(x0, y0, w, h);
      g.fillStyle = kc; g.fillRect(x0, y0, 4 * k, h);
      if (n.kind === 'site') { g.setLineDash([4, 3]); }
      g.strokeStyle = sel ? C.am : hov ? C.g8 : C.g6; g.lineWidth = sel ? 2 : 1; g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1); g.setLineDash([]);
    }
    // icon window
    const iw = h - 10 * k, ix = x0 + (logic ? 6 : 10) * k, iy = y0 + 5 * k;
    if (logic) { const tmp = this.glyphImg(n.kind); g.drawImage(tmp, ix, iy, iw, iw); }
    else {
      g.fillStyle = C.bg0; g.fillRect(ix, iy, iw, iw); g.strokeStyle = C.g4; g.lineWidth = 1; g.strokeRect(ix + 0.5, iy + 0.5, iw - 1, iw - 1);
      const src = this.nodeIcon(n);
      if (src) { const im = this.img(src); if (im.complete && im.naturalWidth) { const s = Math.min(iw / im.naturalWidth, iw / im.naturalHeight) * 0.92; g.imageSmoothingEnabled = !src.startsWith('data:image/png;base64,iVBOR') || true; g.drawImage(im, ix + (iw - im.naturalWidth * s) / 2, iy + (iw - im.naturalHeight * s) / 2, im.naturalWidth * s, im.naturalHeight * s); g.imageSmoothingEnabled = false; } }
    }
    // text
    const tx = ix + iw + 7 * k, tw = x0 + w - tx - 10 * k;
    g.textBaseline = 'alphabetic';
    g.font = `${Math.round(15 * k)}px Jersey, VT, monospace`;
    g.fillStyle = n.kind === 'site' ? C.aml : C.g9;
    g.fillText(clip(g, logic ? LOGIC_NAME[n.kind as LogicKind] : n.name, tw), tx, y0 + 18 * k);
    g.font = `${Math.round(12 * k)}px VT, monospace`;
    const [sub, sc] = this.subline(n);
    g.fillStyle = sc; g.fillText(clip(g, sub, tw), tx, y0 + (logic ? 34 : 33) * k);
    if (!logic) { g.fillStyle = C.g6; g.fillText(clip(g, KIND_NAME[n.kind] ?? '', tw), tx, y0 + 46 * k); }
    // status lamp
    const lc = this.lamp(n);
    if (lc) { g.fillStyle = lc; g.fillRect(x0 + w - 10 * k, y0 + 5 * k, 5 * k, 5 * k); }
    // ports: input tab on the left, output on the right
    const ins = n.kind !== 'deposit' && n.kind !== 'field' && n.kind !== 'sensor', outs = n.kind !== 'site' && n.kind !== 'sensor';
    if (ins) { g.fillStyle = L.routes.some((r) => r.to === n.id) ? C.g8 : C.g5; g.fillRect(x0 - 5 * k, c.y - 6 * k, 5 * k, 12 * k); }
    if (outs) { const hp = this.hover.node === n.id && this.hover.port; g.fillStyle = hp ? C.am : L.routes.some((r) => r.from === n.id) ? C.g8 : C.g5; g.fillRect(x0 + w, c.y - 7 * k, 7 * k, 14 * k); if (hp) { g.strokeStyle = C.aml; g.strokeRect(x0 + w - 2, c.y - 9 * k, 11 * k, 18 * k); } }
  }
  private glyphs = new Map<string, HTMLCanvasElement>();
  private glyphImg(kind: string) { let c = this.glyphs.get(kind); if (!c) { c = document.createElement('canvas'); c.width = c.height = 80; this.glyph(c.getContext('2d')!, kind, 80); this.glyphs.set(kind, c); } return c; }
  private nodeIcon(n: LNode): string | null {
    const L = this.L;
    switch (n.kind) {
      case 'pod': return phosphor('depot', 96, 96, [217, 164, 58]);
      case 'building': case 'container': { const b = L.bld(n); return b ? phosphor(b.kind, 96, 96) : null; }
      case 'site': { const s = L.site(n); return s ? phosphor(s.kind, 96, 96, [236, 210, 154]) : null; }
      case 'deposit': { const s = L.seam(n); return s ? itemIcon(s.item, 48) : null; }
      case 'field': { const y = L.fieldYields(n)[0]; return y ? itemIcon(y, 48) : null; }
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
    const L = this.L, top = (ids: ItemId[], f: (id: ItemId) => number) => ids.map((id) => [id, f(id)] as [ItemId, number]).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id, v]) => `${short(id)} ${v}`).join(' · ');
    switch (n.kind) {
      case 'pod': return [top(L.offers(n), (id) => L.level(n, id)) || 'EMPTY', C.g7];
      case 'container': { const s = top(L.offers(n), (id) => L.level(n, id)); return [s || 'EMPTY', s ? C.g8 : C.g6]; }
      case 'building': {
        const b = L.bld(n)!; if (!b) return ['', C.g6];
        if (b.recipe) { const o = Object.keys(b.recipe.out)[0]; return [`${b.status === 'working' ? 'MAKING' : b.status.toUpperCase()} ${o ? short(o) : ''}`.trim(), b.status === 'working' ? C.g8 : C.am]; }
        if (b.def.extract === 'node') { const s = L.f.seams[b.seam]; return [s ? `MINING ${short(s.item)}` : 'NO SEAM', C.g8]; }
        return [b.status === 'working' ? 'WORKING' : b.status.toUpperCase(), C.g7];
      }
      case 'deposit': { const s = L.seam(n); return s ? [s.drill ? 'BURIED: DRILL ONLY' : `${Math.floor(s.amount).toLocaleString('en-US')} LEFT`, s.drill ? C.am : C.g7] : ['', C.g6]; }
      case 'field': { const fl = L.fieldOf(n); return [`${fl?.r ?? 0} m · ${L.fieldYields(n).slice(0, 3).map(short).join(' ')}`, C.g7]; }
      case 'site': { const s = L.site(n); return s ? [s.stage === 'build' ? `BUILDING ${Math.round(Math.min(1, s.work / s.workNeed) * 100)}%` : `SUPPLY ${Math.round(L.f.sites.progress(s) * 200)}%`, C.aml] : ['', C.g6]; }
      case 'split': return [`${L.routes.filter((r) => r.from === n.id).length} OUT`, C.g7];
      case 'merge': return [`${L.routes.filter((r) => r.to === n.id).length} IN`, C.g7];
      case 'buffer': return [`${n.open ? 'FILLING' : 'FULL'} ${n.cfg.lo}-${n.cfg.hi}`, n.open ? C.g8 : C.am];
      case 'counter': return [`${n.count}/${n.cfg.n}`, n.open ? C.g8 : C.am];
      case 'gate': return [n.open ? 'OPEN' : 'SHUT', n.open ? C.g8 : C.am];
      case 'timer': { const P = n.cfg.period ?? 120, ph = L.f.time % P; return [`${n.open ? 'ON' : 'OFF'} ${Math.ceil(n.open ? (n.cfg.on ?? 40) - ph : P - ph)}s`, n.open ? C.g8 : C.am]; }
      case 'sensor': return [`${n.sig ? 'SIGNAL' : 'QUIET'} ${n.cfg.what === 'count' ? n.count : ''}`, n.sig ? C.am : C.g7];
      default: return ['', C.g6];
    }
  }
  /** workers as small arrows where they really are; idle ones blink amber */
  private workers(g: CanvasRenderingContext2D) {
    const k = this.kk;
    for (const w of this.f.workers.list) {
      if (w.c.dead || w.job === 'idle') continue;
      const x = this.sx(w.c.x), y = this.sy(w.c.z);
      if (x < -10 || y < -10 || x > this.W + 10 || y > this.H + 10) continue;
      const idle = !w.lj && (w.state === 'wait' || w.note.startsWith('NO') || w.note.startsWith('WAITING'));
      if (idle && Math.floor(this.t * 2) % 2) continue;
      const a = w.c.yaw, s = 6 * k;
      g.fillStyle = idle ? C.am : w.state === 'eat' ? C.g5 : C.g9;
      g.beginPath(); g.moveTo(x + Math.sin(a) * s, y + Math.cos(a) * s); g.lineTo(x + Math.sin(a + 2.4) * s * 0.8, y + Math.cos(a + 2.4) * s * 0.8); g.lineTo(x + Math.sin(a - 2.4) * s * 0.8, y + Math.cos(a - 2.4) * s * 0.8); g.closePath(); g.fill();
    }
  }

  // ------------------------------------------------------------------ the strips
  private renderTop() {
    const L = this.L, nx = L.nextTier(), tier = L.tier;
    const key = `${tier}|${nx?.at}|${L.auto}|${L.templates.length}|${this.tut.step}`;
    if (key === this.topKey) return;
    this.topKey = key;
    const segs = 24, on = nx ? Math.floor((nx.at / nx.need) * segs) : segs;
    this.topEl.innerHTML = `<span class="pl-stencil nm-title">LOGISTICS SCHEMATIC</span><span class="sub">COLONY NODE MAP · ${L.nodes.length} NODES · ${L.routes.length} ROUTES</span><span class="sp"></span>
      <div class="nm-disc"><div class="t">DISCIPLINE<b>LEVEL ${['0', 'I', 'II', 'III', 'IV', 'V'][tier]}</b></div><div class="bar">${Array.from({ length: segs }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</div>
      <div class="nx">${nx ? `NEXT: ${nx.names.join(', ').toUpperCase()} · ${nx.need - nx.at} ITEMS TO ROUTE` : 'EVERY LOGIC NODE LEARNED'}</div></div>
      <span class="nm-sw ${L.auto ? 'on' : ''}" data-a="auto" title="Free haulers guess their own work when no route wants them">AUTO-HAUL<span class="lever"></span></span>
      <span class="pl-btn" data-a="tpl">TEMPLATES</span><span class="pl-btn" data-a="tut">${this.tut.step > 0 && this.tut.step < 99 ? 'GUIDE ON' : 'FIRST CHAIN GUIDE'}</span><span class="pl-btn" data-a="close">CLOSE <span class="pl-key">N</span></span>`;
    this.topEl.querySelector('[data-a="auto"]')!.addEventListener('click', () => { L.auto = !L.auto; this.topKey = ''; sfx('click', 1, 0.5); toast(L.auto ? 'Free haulers will find their own work when no route wants them' : 'Haulers now carry only what the routes say', 'info', 2200); });
    this.topEl.querySelector('[data-a="tpl"]')!.addEventListener('click', () => { this.panel.showTemplates(); });
    this.topEl.querySelector('[data-a="tut"]')!.addEventListener('click', () => this.tut.start());
    this.topEl.querySelector('[data-a="close"]')!.addEventListener('click', () => this.close());
    void FEATURES;
  }
  private renderBot() {
    const L = this.L, ws = this.f.workers.list.filter((w) => !w.c.dead);
    const haul = ws.filter((w) => w.job === 'haul' || w.job === 'build'), busy = haul.filter((w) => !!w.lj), idle = haul.filter((w) => !w.lj && w.state === 'wait');
    const stalled = L.routes.filter((r) => r.on && r.note && r.inflight === 0), flow = L.routes.reduce((a, r) => a + L.flow(r.id), 0);
    const sites = this.f.sites?.list.length ?? 0;
    this.botEl.innerHTML = `<span>WORKERS <b>${ws.length}</b> · HAULING <b>${busy.length}</b>/<b>${haul.length}</b>${idle.length ? ` · <span class="amb">${idle.length} IDLE</span>` : ''}${ws.length - haul.length ? ` · ${ws.length - haul.length} ON OTHER JOBS` : ''}</span>
      <span>FLOW <b>${Math.round(flow)}</b> ITEMS/MIN</span><span>${stalled.length ? `<span class="amb">${stalled.length} ROUTE${stalled.length > 1 ? 'S' : ''} STALLED</span>` : 'NO STALLS'}</span><span>SITES <b>${sites}</b></span><span class="sp"></span>
      <span>LMB SELECT · DRAG TAB WIRE · SHIFT-DRAG BOX · DEL REMOVE · F FIT · T TIDY · ESC BACK</span>`;
  }
}
/** a cubic bezier point */
export function bez(p: number[][], t: number): [number, number] {
  const u = 1 - t;
  return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]];
}
function clip(g: CanvasRenderingContext2D, s: string, w: number) {
  if (g.measureText(s).width <= w) return s;
  let t = s; while (t.length > 1 && g.measureText(t + '…').width > w) t = t.slice(0, -1);
  return t + '…';
}
/** a short item name for card lines */
export function short(id: ItemId) { const n = (ITEMS[id]?.name ?? id).toUpperCase(); return n.length > 12 ? n.replace(/\s*\(.*\)/, '').slice(0, 12) : n; }
