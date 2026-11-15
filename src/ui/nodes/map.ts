// The NODE MAP (N): the colony's logistics as a hand-drawn TABLE-TOP DIORAMA. A pencil map of the region lies on a
// workbench; every node stands on it as a live miniature (the pod, each building and container with its moving
// parts, rock piles for deposits, little trees for harvest fields, scaffolds for construction sites, and logic
// GADGETS: a splitter junction, a merger, a buffer silo, a counter, a gate arm, a timer clock, a sensor mast).
// Routes are inked wires drawn between them, item tokens ride along the wires as workers carry them, and each wire
// carries a paper luggage tag clipped on (its items, rate, priority, an IF stamp for conditions, and why it stalls).
// Workers walk the table as little pawns. Drag from a node's plug (the ink ring by its name tag) to another node to
// wire it; drag a miniature to tidy it; wheel to zoom, drag the table to pan, Q/E or right-drag to turn it.
// 3D: src/ui/build/vignette.ts (one shared layer, pixel art at 2x); ink: src/ui/build/ink.ts; the model:
// src/logistics/network.ts. The inspector sheet is ./panel.ts, the guide ./tutorial.ts.
import './nodes.css';
import '../build/build.css';
import * as THREE from 'three';
import type { Factory } from '../../factory/factory';
import type { Worker } from '../../factory/workers';
import { ITEMS, itemIcon, type ItemId } from '../../factory/items';
import { isBelt } from '../../factory/defs';
import { LOGIC, LOGIC_NAME, isLogic, type LNode, type Route, type LogicKind, type Chain, type Template } from '../../logistics/network';
import { attachLayer, addStage, drawStages, liveModel, VSC, type Stage, type Live } from '../build/vignette';
import { inkCurve, inkLine, bezAt, INK, PENCIL_R, PENCIL_B, PENCIL_G, AMBER, PAPER } from '../build/ink';
import { gbuf } from '../../gfx/gbuf';
import { Panel } from './panel';
import { Tutorial } from './tutorial';
import { el, toast } from '../kit';
import { sfx } from '../../audio/audio';

export type Tool = 'select' | 'wire' | 'field' | 'template' | LogicKind;
export type Sel = { k: 'node'; id: string } | { k: 'route'; id: number } | null;
/** a node on screen, in art px (1 art px = 2 screen px): its ground point, its tag and plug */
interface Card { n: LNode; x: number; y: number; tx: number; ty: number; tw: number; th: number; px: number; py: number; r: number }
const D2 = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const FONT = '11px Body, monospace';
const lam = (c: number) => gbuf(new THREE.MeshLambertMaterial({ color: c }));

export class NodeMap {
  readonly root: HTMLDivElement;
  private glass: HTMLDivElement; private cv: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private toolsEl: HTMLDivElement; private topEl: HTMLDivElement; private botEl: HTMLDivElement; private hintEl: HTMLDivElement;
  readonly panel: Panel;
  readonly tut: Tutorial;
  isOpen = false;
  /** the table camera: target on the map (world m), distance, yaw and pitch */
  cam = { x: 0, z: 0, dist: 60, yaw: 0, pitch: 0.95 };
  sel: Sel = null;
  multi = new Set<string>();
  tool: Tool = 'select';
  tpl: Template | null = null;
  private drag: { mode: 'pan' | 'node' | 'wire' | 'box' | 'maybe' | 'turn'; sx: number; sy: number; x: number; y: number; id?: string; ox?: number; oz?: number; on: boolean } | null = null;
  private hover: { node: string | null; route: number | null; port: boolean } = { node: null, route: null, port: false };
  private cards = new Map<string, Card>();
  private icons = new Map<string, HTMLImageElement>();
  private t = 0; private W = 0; private H = 0;
  private topKey = ''; private botT = 0;
  // the diorama
  private stage: Stage;
  private table = new THREE.Group();
  private minis = new Map<string, { o: THREE.Object3D; live: Live | null; kind: string; key: string }>();
  private pawns: THREE.InstancedMesh;
  private stageEl: HTMLDivElement;

  constructor(readonly f: Factory) {
    // on the body, over every other HUD piece while it is open
    const r = (this.root = el('div', 'cr nmap', document.body));
    this.stageEl = el('div', 'nm-stage', r);
    this.topEl = el('div', 'nm-top', r);
    this.toolsEl = el('div', 'nm-tools', r);
    this.glass = el('div', 'nm-glass', r);
    this.cv = el('canvas', 'map', this.glass);
    this.ctx = this.cv.getContext('2d')!;
    el('div', 'nm-legend cr-s', this.glass, `<span><i style="background:${INK}"></i>WIRE</span><span><i style="background:${PENCIL_G}"></i>MOVING</span><span><i style="background:${AMBER}"></i>STALLED</span><span><i style="background:${PENCIL_R}"></i>PICKED</span><span>WHEEL ZOOM · DRAG THE TABLE TO PAN · Q E TURN · DRAG FROM A PLUG TO WIRE</span>`);
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
    // the set: a workbench, the map sheet, lamp light from the upper left, pawns for the workers
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xf6ecd6, 0x5a4630, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d6, 2.4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0015;
    scene.add(sun, sun.target);
    scene.add(this.table);
    const pg = new THREE.ConeGeometry(0.42, 1.1, 6); pg.translate(0, 0.55, 0);
    const head = new THREE.IcosahedronGeometry(0.3, 0); head.translate(0, 1.2, 0);
    this.pawns = new THREE.InstancedMesh(mergeGeos([pg, head]), gbuf(new THREE.MeshLambertMaterial({ color: 0xffffff })), 64); this.pawns.count = 0; this.pawns.castShadow = true; this.pawns.frustumCulled = false;
    scene.add(this.pawns);
    const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 2000);
    this.stage = { el: this.stageEl, scene, cam, bg: 0x3a2c1e, tick: () => { this.place3d(sun); } };
    addStage(this.stage);
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
    attachLayer(this.root, 1);
    this.L.sync(true);
    this.buildTable();
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

  // ------------------------------------------------------------------ the table
  /** the map sheet: paper, pencil contours, water hatched in blue pencil, rock in graphite, belts as pencil lines */
  private buildTable() {
    const R = this.g.region, N = R.N, S = 2;
    for (const c of [...this.table.children]) this.table.remove(c);
    this.minis.clear();
    const cv = document.createElement('canvas'); cv.width = N * S; cv.height = N * S;
    const g = cv.getContext('2d')!, img = g.createImageData(N * S, N * S), d = img.data;
    const paper = [0xe9, 0xdf, 0xc4], P2 = [0xdc, 0xd0, 0xb0];
    for (let y = 0; y < N * S; y++) for (let x = 0; x < N * S; x++) {
      const wx = x / S, wz = y / S, i = Math.floor(wz) * N + Math.floor(wx), o = (y * N * S + x) * 4;
      let c = ((x * 7 + y * 13) % 29 === 0) ? P2 : paper;
      const hc = Math.floor(R.h[i] / 1.5), hr = Math.floor(R.h[Math.min(N * N - 1, i + 1)] / 1.5), hd = Math.floor(R.h[Math.min(N * N - 1, i + N)] / 1.5);
      if (hc !== hr || hc !== hd) c = [0xb4, 0xa4, 0x84];
      if (R.isWater(wx + 0.25, wz + 0.25)) c = ((x + y) % 4 === 0) ? [0x4a, 0x6e, 0x94] : [0xb8, 0xc8, 0xd2];
      else if (R.solid[i] === 1) c = ((x - y) % 3 === 0) ? [0x6a, 0x64, 0x5c] : [0xc8, 0xbe, 0xa6];
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(80,70,58,0.55)';
    for (const b of this.f.buildings) if (isBelt(b.kind)) g.fillRect(b.cx * S + 1, b.cz * S + 1, b.fw * S - 2, b.fd * S - 2);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(N, N), gbuf(new THREE.MeshLambertMaterial({ map: tex })));
    sheet.rotation.x = -Math.PI / 2; sheet.position.set(N / 2, 0, N / 2); sheet.receiveShadow = true;
    this.table.add(sheet);
    // the workbench under it: planks
    const wc = document.createElement('canvas'); wc.width = 64; wc.height = 64; const wg = wc.getContext('2d')!;
    for (let y = 0; y < 64; y++) { const plank = Math.floor(y / 16); for (let x = 0; x < 64; x++) { const v = ((x * 3 + plank * 17) % 23 === 0 ? -18 : 0) + (y % 16 === 0 ? -30 : 0) + (plank % 2 ? 6 : 0); wg.fillStyle = `rgb(${110 + v},${78 + v},${48 + v})`; wg.fillRect(x, y, 1, 1); } }
    const wt = new THREE.CanvasTexture(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(N / 8, N / 8); wt.magFilter = THREE.NearestFilter; wt.minFilter = THREE.NearestFilter; wt.colorSpace = THREE.SRGBColorSpace;
    const bench = new THREE.Mesh(new THREE.PlaneGeometry(N * 3, N * 3), gbuf(new THREE.MeshLambertMaterial({ map: wt })));
    bench.rotation.x = -Math.PI / 2; bench.position.set(N / 2, -0.4, N / 2); bench.receiveShadow = true;
    this.table.add(bench);
  }
  /** a node's miniature */
  private mini(n: LNode): { o: THREE.Object3D; live: Live | null; kind: string; key: string } {
    const L = this.L, b = L.bld(n);
    const key = n.kind + ':' + (b?.kind ?? L.site(n)?.kind ?? L.seam(n)?.item ?? '') + ':' + (b ? b.r : 0) + ':' + (L.fieldOf(n)?.r ?? 0);
    const old = this.minis.get(n.id);
    if (old && old.key === key) return old;
    if (old) this.table.remove(old.o);
    const grp = new THREE.Group();
    let live: Live | null = null;
    if (b) { const box = (this.g as unknown as { storage?: { containerOf?(b: unknown): unknown } }).storage?.containerOf?.(b) ?? undefined; live = liveModel(b.kind, () => { const e = this.minis.get(n.id); if (e) e.key = ''; }, box); grp.add(live.root); live.root.rotation.y = -b.r * Math.PI / 2; }
    else if (n.kind === 'site') {
      const s = L.site(n);
      if (s) { live = liveModel(s.kind); live.root.rotation.y = -s.r * Math.PI / 2; grp.add(live.root); const bx = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(s.fw, s.def.h + 0.3, s.fd)), gbuf(new THREE.LineBasicMaterial({ color: 0x2b2622 }), 0)); bx.position.y = (s.def.h + 0.3) / 2; grp.add(bx); }
    } else if (n.kind === 'pod') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 2.2, 8), lam(0xd8d0bc)); body.position.y = 1.1;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xc8891e)); dome.position.y = 2.2;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.62, 0.3, 8), lam(0x2f5d8a)); band.position.y = 1.4;
      grp.add(body, dome, band);
      for (let i = 0; i < 3; i++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), lam(0x4b4e50)); const a = i * Math.PI * 2 / 3; leg.position.set(Math.cos(a) * 1.8, 0.4, Math.sin(a) * 1.8); leg.rotation.z = Math.cos(a) * 0.4; leg.rotation.x = -Math.sin(a) * 0.4; grp.add(leg); }
    } else if (n.kind === 'deposit') {
      const s = L.seam(n), col = ITEMS[s?.item ?? '']?.side ?? 0x8a6a4a;
      for (let i = 0; i < 6; i++) { const r = 0.5 + ((i * 37) % 7) / 10; const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), lam(i % 2 ? col : 0x6a645c)); m.position.set(Math.cos(i * 2.1) * (0.4 + i * 0.25), r * 0.6, Math.sin(i * 2.1) * (0.4 + i * 0.25)); m.rotation.set(i, i * 2, 0); grp.add(m); }
    } else if (n.kind === 'field') {
      const r = L.fieldOf(n)?.r ?? 6;
      for (let i = 0; i < 9; i++) { const a = i * 2.4, d = r * (0.25 + ((i * 53) % 10) / 14); const t = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 6), lam(i % 3 ? 0x447d26 : 0x2e5a1c)); t.position.set(Math.cos(a) * d, 1.4, Math.sin(a) * d); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.6, 5), lam(0x5c3d20)); tr.position.set(t.position.x, 0.3, t.position.z); grp.add(t, tr); }
    } else if (isLogic(n.kind)) grp.add(gadget(n.kind as LogicKind));
    grp.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.table.add(grp);
    const e = { o: grp, live, kind: n.kind, key };
    this.minis.set(n.id, e);
    return e;
  }
  /** each frame: miniatures to their map places, pawns to the workers, the camera, the lamp */
  private place3d(sun: THREE.DirectionalLight) {
    const L = this.L, seen = new Set<string>();
    for (const n of L.nodes) {
      const m = this.mini(n); seen.add(n.id);
      m.o.position.set(n.x, 0, n.z);
      const b = L.bld(n), run = !!b && b.status === 'working';
      m.live?.tick(1 / 60, run || n.kind === 'site');
      if (n.kind === 'site') { const s = L.site(n); if (s && m.live) m.live.root.scale.y = 0.15 + 0.85 * Math.min(1, s.work / s.workNeed); }
      const mv = m.o.getObjectByName('mv');
      if (mv) { if (n.kind === 'timer') mv.rotation.z = -this.t * 2; else if (n.kind === 'gate') mv.rotation.z = n.open ? 1.3 : 0; else if (n.kind === 'sensor') mv.rotation.y = this.t * 1.5; else if (n.kind === 'counter') mv.rotation.x = -n.count * 0.4; }
    }
    for (const [id, m] of this.minis) if (!seen.has(id)) { this.table.remove(m.o); this.minis.delete(id); }
    const mtx = new THREE.Matrix4(), col = new THREE.Color();
    let k = 0;
    for (const w of this.f.workers.list) {
      if (w.c.dead || w.job === 'idle' || k >= 64) continue;
      const idle = !w.lj && (w.state === 'wait' || w.note.startsWith('NO') || w.note.startsWith('WAITING'));
      mtx.makeRotationY(w.c.yaw).setPosition(w.c.x, 0, w.c.z);
      this.pawns.setMatrixAt(k, mtx); this.pawns.setColorAt(k, col.setHex(idle ? 0xc8891e : w.carry ? 0x2f5d8a : 0xe8e0c8)); k++;
    }
    this.pawns.count = k; this.pawns.instanceMatrix.needsUpdate = true; if (this.pawns.instanceColor) this.pawns.instanceColor.needsUpdate = true;
    const c = this.stage.cam, cm = this.cam, cp = Math.cos(cm.pitch);
    c.position.set(cm.x + Math.sin(cm.yaw) * cp * cm.dist, Math.sin(cm.pitch) * cm.dist, cm.z + Math.cos(cm.yaw) * cp * cm.dist);
    c.lookAt(cm.x, 0, cm.z); c.updateMatrixWorld();
    sun.position.set(cm.x - 30, 50, cm.z + 22); sun.target.position.set(cm.x, 0, cm.z);
    const sc = sun.shadow.camera as THREE.OrthographicCamera, ext = Math.round(Math.max(30, cm.dist * 0.7));
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 1; sc.far = 200; sc.updateProjectionMatrix(); }
  }

  // ------------------------------------------------------------------ view
  /** frame the colony: every node in view */
  fit() {
    this.size();
    const ns = this.L.nodes; if (!ns.length) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const n of ns) { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); z0 = Math.min(z0, n.z); z1 = Math.max(z1, n.z); }
    this.cam.x = (x0 + x1) / 2; this.cam.z = (z0 + z1) / 2 + 4;
    this.cam.dist = Math.max(28, Math.min(160, Math.max(x1 - x0, (z1 - z0) * 1.6) * 1.35 + 14));
  }
  private size() {
    const r = this.glass.getBoundingClientRect();
    const W = Math.max(10, Math.floor(r.width / VSC)), H = Math.max(10, Math.floor(r.height / VSC));
    if (W !== this.W || H !== this.H) { this.W = W; this.H = H; this.cv.width = W; this.cv.height = H; this.cv.style.width = W * VSC + 'px'; this.cv.style.height = H * VSC + 'px'; }
  }
  /** a world point to art px on the overlay */
  private proj(x: number, y: number, z: number): [number, number, boolean] {
    const v = new THREE.Vector3(x, y, z).project(this.stage.cam), sb = this.stageEl.getBoundingClientRect(), gb = this.glass.getBoundingClientRect();
    return [((sb.left + (v.x * 0.5 + 0.5) * sb.width) - gb.left) / VSC, ((sb.top + (-v.y * 0.5 + 0.5) * sb.height) - gb.top) / VSC, v.z < 1];
  }
  /** art px on the overlay to a point on the table */
  private ground(ax: number, ay: number): [number, number] | null {
    const sb = this.stageEl.getBoundingClientRect(), gb = this.glass.getBoundingClientRect();
    const sx = gb.left + ax * VSC, sy = gb.top + ay * VSC;
    const ndc = new THREE.Vector2(((sx - sb.left) / sb.width) * 2 - 1, -((sy - sb.top) / sb.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.stage.cam);
    const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
    return [p.x, p.z];
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

  /** TIDY: line every wired chain up left to right by depth on the table, rows kept together */
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
    const D = Math.max(...cols.keys());
    for (const [d, list] of cols) { list.sort((a, b) => a.z - b.z); list.forEach((n, i) => L.moveNode(n, cx + (d - D / 2) * 9, cz + (i - (list.length - 1) / 2) * 7)); }
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
    if (e.button === 2) { this.drag = { mode: 'turn', sx: p.x, sy: p.y, x: p.x, y: p.y, ox: this.cam.yaw, on: false }; return; }
    if (e.button === 1) { this.drag = { mode: 'pan', sx: p.x, sy: p.y, x: p.x, y: p.y, on: true }; return; }
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
      else { const n = L.addLogic(this.tool as LogicKind, wx, wz); if (n) { this.select({ k: 'node', id: n.id }); sfx('build', 1.4, 0.5); this.setTool('select'); } }
      return;
    }
    if (hit && (hit.port || this.tool === 'wire' || e.altKey)) { this.drag = { mode: 'wire', sx: p.x, sy: p.y, x: p.x, y: p.y, id: hit.id, on: true }; sfx('click', 1.4, 0.3); return; }
    if (hit) {
      const n = L.node(hit.id)!;
      if (e.shiftKey) { if (this.multi.has(hit.id)) this.multi.delete(hit.id); else this.multi.add(hit.id); this.panel.dirty(); return; }
      this.select({ k: 'node', id: hit.id });
      this.drag = { mode: 'node', sx: p.x, sy: p.y, x: p.x, y: p.y, id: hit.id, ox: n.x, oz: n.z, on: false };
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
    if (d.mode === 'turn') { this.cam.yaw = d.ox! - (p.x - d.sx) * 0.01; return; }
    if (d.mode === 'pan') { const a = this.ground(lx, ly), b = this.ground(p.x, p.y); if (a && b) { this.cam.x -= b[0] - a[0]; this.cam.z -= b[1] - a[1]; } }
    else if (d.mode === 'node') { const n = this.L.node(d.id!), gp = this.ground(p.x, p.y); if (n && gp) { n.x = gp[0]; n.z = gp[1]; n.tidy = true; } }
    else if (d.mode === 'wire') { const h = this.nodeAt(p.x, p.y); this.hover.node = h?.id ?? null; }
  };
  private onUp = (e: PointerEvent) => {
    const d = this.drag; if (!d || !this.isOpen) return;
    this.drag = null;
    const p = this.rel(e), L = this.L;
    if (d.mode === 'turn') { if (!d.on) { if (this.tool !== 'select') this.setTool('select'); else this.select(null); } return; }
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
  private onWheel = (e: WheelEvent) => { e.preventDefault(); this.cam.dist = Math.max(10, Math.min(220, this.cam.dist * (e.deltaY > 0 ? 1.12 : 0.89))); };
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
    if (k === 'q') { this.cam.yaw += 0.2; return; }
    if (k === 'e') { this.cam.yaw -= 0.2; return; }
    if (k === 'Delete' || k === 'Backspace' || k === 'x') { this.deleteSel(); return; }
  };
  deleteSel() {
    const L = this.L, s = this.sel;
    if (s?.k === 'route') { L.removeRoute(s.id); this.select(null); sfx('crack', 1.4, 0.4); return; }
    if (s?.k === 'node') { const n = L.node(s.id); if (n && (isLogic(n.kind) || n.kind === 'field')) { L.removeNode(n.id); this.select(null); sfx('crack', 1.4, 0.4); } else toast('Only gadgets and fields come off the table: dismantle a building in build mode', 'info', 1800); }
  }

  // ------------------------------------------------------------------ geometry on the overlay
  /** a wire from one miniature to the next: a gentle inked arc on screen */
  wirePts(r: Route): number[][] | null {
    const a = this.cards.get(r.from), b = this.cards.get(r.to); if (!a || !b) return null;
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, bow = Math.min(40, L * 0.18);
    const nx = -dy / L * bow, ny = dx / L * bow;
    return [[a.x, a.y], [a.x + dx * 0.3 + nx, a.y + dy * 0.3 + ny], [a.x + dx * 0.7 + nx, a.y + dy * 0.7 + ny], [b.x, b.y]];
  }
  private tagRect(r: Route): [number, number, number, number] | null { const pts = this.wirePts(r); if (!pts) return null; const m = bezAt(pts, 0.5); return [Math.round(m[0] + 6), Math.round(m[1] - 10), 58, 22]; }

  // ------------------------------------------------------------------ drawing
  update(dt: number) {
    if (!this.isOpen) return;
    this.t += dt;
    this.size();
    drawStages(dt, this.t);
    this.layoutCards();
    this.draw();
    this.panel.update(dt);
    this.tut.update(dt);
    this.renderTop();
    this.botT -= dt; if (this.botT <= 0) { this.botT = 0.5; this.renderBot(); }
  }
  /** project every node: its ground point, its tag above the miniature (never on another tag) and its plug */
  private layoutCards() {
    const g = this.ctx;
    this.cards.clear();
    const taken: [number, number, number, number][] = [];
    for (const n of this.L.nodes) {
      const m = this.minis.get(n.id), h = m?.live ? m.live.size.y : n.kind === 'pod' ? 3.2 : n.kind === 'field' ? 2.5 : isLogic(n.kind) ? 1.8 : 1.4;
      const [x, y, ok] = this.proj(n.x, 0, n.z); if (!ok) continue;
      const [, ty] = this.proj(n.x, h + 0.4, n.z);
      const [rx] = this.proj(n.x + 1.2, 0, n.z);
      const name = isLogic(n.kind) ? LOGIC_NAME[n.kind as LogicKind] : n.name;
      const tw = Math.min(110, Math.max(this.tw(g, name), this.tw(g, this.subline(n)[0])) + 12), th = 26;
      const tx = Math.round(x - tw / 2); let tyy = Math.round(ty - th - 4);
      for (let k = 0; k < 6; k++) { const hit = taken.find((r) => tx < r[0] + r[2] && tx + tw > r[0] && tyy < r[1] + r[3] && tyy + th > r[1]); if (!hit) break; tyy = hit[1] - th - 2; }
      taken.push([tx, tyy, tw, th]);
      this.cards.set(n.id, { n, x, y, tx, ty: tyy, tw, th, px: tx + tw + 5, py: tyy + th / 2, r: Math.max(6, Math.abs(rx - x) * 1.4) });
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
    // fields: a dashed green pencil ring on the map
    for (const n of L.nodes) if (n.kind === 'field') { const fl = L.fieldOf(n); if (!fl) continue; const pts: [number, number][] = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; const [x, y] = this.proj(fl.x + Math.cos(a) * fl.r, 0, fl.z + Math.sin(a) * fl.r); pts.push([x, y]); } for (let i = 0; i < 48; i += 2) inkLine(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i, PENCIL_G); }
    // sensor probes and signal links: dotted blue pencil
    for (const n of L.nodes) {
      const c = this.cards.get(n.id); if (!c) continue;
      const links: string[] = [];
      if (n.kind === 'sensor' && n.cfg.probe) links.push(n.cfg.probe);
      for (const cd of [...(n.cfg.conds ?? []), ...L.routes.filter((r) => r.from === n.id || r.to === n.id).flatMap((r) => r.conds)]) if (cd.k === 'signal' && cd.node) links.push(cd.node);
      for (const id of links) { const o = this.cards.get(id); if (o) inkCurve(g, [[o.x, o.y], [o.x, o.y], [c.x, c.y], [c.x, c.y]], n.sig || L.node(id)?.sig ? AMBER : PENCIL_B, 7, 1, 1, 3); }
    }
    for (const r of L.routes) this.wire(g, r);
    for (const [w, j] of L.live) if (!j.chain && j.src && j.dst && w.carry) { const a = this.cards.get(j.src.id), b = this.cards.get(j.dst.id); if (a && b) { const pr = this.prog(w, j.src, j.dst); this.token(g, a.x + (b.x - a.x) * pr, a.y + (b.y - a.y) * pr, w.carry.id); } }
    for (const [w, j] of L.live) if (j.chain) this.chainToken(g, w, j.chain, j.item);
    for (const r of L.routes) this.routeTag(g, r);
    for (const c of this.cards.values()) this.card(g, c);
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
  /** an inked wire: ink when ready, a crawling green pencil line when goods move, amber dashes when stalled, red when picked */
  private wire(g: CanvasRenderingContext2D, r: Route) {
    const pts = this.wirePts(r); if (!pts) return;
    const L = this.L, moving = r.inflight > 0 || (L.f.time - r.lastT < 12 && r.moved > 0);
    const sel = this.sel?.k === 'route' && this.sel.id === r.id, hov = this.hover.route === r.id;
    if (sel || hov) inkCurve(g, pts, sel ? 'rgba(168,50,31,0.35)' : 'rgba(43,38,34,0.25)', r.id, 3);
    const col = sel ? PENCIL_R : !r.on ? '#8a8072' : r.note && !moving ? AMBER : INK;
    if (!r.on) inkCurve(g, pts, col, r.id, 1, 2, 3);
    else if (r.note && !moving) inkCurve(g, pts, col, r.id, 2, 4, 2);
    else inkCurve(g, pts, col, r.id, 2);
    if (moving && r.on) inkCurve(g, pts, PENCIL_G, r.id + 1, 1, 3, 5, -this.t * 10);
    const p = bezAt(pts, 0.7), q = bezAt(pts, 0.72), a = Math.atan2(q[1] - p[1], q[0] - p[0]);
    for (const s of [2.5, -2.5]) inkLine(g, p[0] + Math.cos(a + s) * 6, p[1] + Math.sin(a + s) * 6, p[0], p[1], r.id + s, col);
  }
  /** the luggage tag clipped to a wire: its items, rate, priority pips, an IF stamp, and why it stalls */
  private routeTag(g: CanvasRenderingContext2D, r: Route) {
    const pts = this.wirePts(r), rc = this.tagRect(r); if (!pts || !rc) return;
    const L = this.L, flow = L.flow(r.id), moving = r.inflight > 0 || (L.f.time - r.lastT < 12 && r.moved > 0);
    const m = bezAt(pts, 0.5), sel = this.sel?.k === 'route' && this.sel.id === r.id;
    const icons = r.filter.slice(0, 3);
    const rate = flow >= 1 ? `${Math.round(flow)}/M` : r.amount.mode === 'keep' ? `KEEP${r.amount.n}` : r.amount.mode === 'batch' ? `X${r.amount.n}` : r.amount.mode === 'rate' ? `<${r.amount.n}` : '';
    const w = Math.max(rc[2], 12 + (icons.length ? icons.length * 17 : this.tw(g, 'ANY') + 2) + (rate ? this.tw(g, rate) + 4 : 0)), h = rc[3];
    const x0 = rc[0], y0 = rc[1];
    inkLine(g, m[0], m[1], x0 + 4, y0 + h / 2, r.id * 3, INK);
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
  /** a node's name tag above its miniature, and its plug */
  private card(g: CanvasRenderingContext2D, c: Card) {
    const n = c.n, L = this.L;
    const sel = (this.sel?.k === 'node' && this.sel.id === n.id) || this.multi.has(n.id), hov = this.hover.node === n.id;
    const logic = isLogic(n.kind);
    // a pencil loop round the picked miniature (amber while the guide points at it)
    if (sel || (this.tut.highlight(n.id) && Math.floor(this.t * 3) % 2 === 0)) {
      const col = sel ? PENCIL_R : AMBER, pts: [number, number][] = [];
      for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2.15; pts.push([c.x + Math.cos(a) * (c.r + 4 + Math.sin(a * 3) * 1.5), c.y + Math.sin(a) * (c.r * 0.55 + 3)]); }
      for (let i = 0; i < 40; i++) inkLine(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i, col);
    }
    inkLine(g, c.tx + c.tw / 2, c.ty + c.th, c.x, c.y - 2, n.ref + 7, '#57504a'); // the tag's string
    this.paper(g, c.tx, c.ty, c.tw, c.th, sel ? PENCIL_R : hov ? '#57504a' : INK, logic ? '#e8e0c8' : n.kind === 'site' ? '#efe2b8' : PAPER);
    const [sub, sc] = this.subline(n);
    this.text(g, clip(g, logic ? LOGIC_NAME[n.kind as LogicKind] : n.name, c.tw - 10), c.tx + 5, c.ty + 2, INK);
    this.text(g, clip(g, sub, c.tw - 10), c.tx + 5, c.ty + 13, sc);
    const lc = this.lamp(n); if (lc) this.R(g, c.tx + c.tw - 6, c.ty + 3, 3, 3, lc);
    // the plug: an inked ring with a dot, where a wire starts
    if (n.kind !== 'site' && n.kind !== 'sensor') {
      const hp = this.hover.node === n.id && this.hover.port, col = hp ? PENCIL_R : L.routes.some((r) => r.from === n.id) ? INK : '#8a8072';
      this.R(g, c.px - 3, c.py - 4, 7, 9, PAPER);
      this.R(g, c.px - 2, c.py - 4, 5, 1, col); this.R(g, c.px - 2, c.py + 4, 5, 1, col); this.R(g, c.px - 3, c.py - 3, 1, 7, col); this.R(g, c.px + 3, c.py - 3, 1, 7, col);
      this.R(g, c.px - 1, c.py - 1, 3, 3, col);
    }
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
    this.topEl.innerHTML = `<span class="nm-title cr-tl">LOGISTICS TABLE</span><span class="cr-s nm-sub">THE COLONY IN MINIATURE<br>${L.nodes.length} NODES · ${L.routes.length} WIRES</span><span class="sp"></span>
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
      <span>CLICK PICK · DRAG A PLUG TO WIRE · SHIFT-DRAG BOX · DEL REMOVE · F FIT · T TIDY · ESC BACK</span>`;
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
/** merge a few geometries into one (the pawns) */
function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  for (const g0 of gs) { const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); pos.push(...(g.getAttribute('position').array as Float32Array)); nor.push(...(g.getAttribute('normal').array as Float32Array)); }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return o;
}
/** the logic gadgets as table-top contraptions (the moving part is named 'mv') */
function gadget(kind: LogicKind): THREE.Group {
  const g = new THREE.Group(), steel = lam(0x8f99a3), dark = lam(0x454d56), brass = lam(0xc49a3a), red = lam(0xa8321f), cream = lam(0xe8e0c8), wood = lam(0x7d562e);
  const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  const cyl = (r0: number, r1: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, n = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, n), m); o.position.set(x, y, z); g.add(o); return o; };
  box(2.2, 0.2, 2.2, wood, 0, 0.1, 0); // every gadget stands on a little board
  switch (kind) {
    case 'split': cyl(0.4, 0.4, 1.2, steel, 0, 0.8, 0); box(1.8, 0.4, 0.4, dark, 0, 1.2, 0).rotation.y = 0.5; box(1.8, 0.4, 0.4, dark, 0, 1.2, 0).rotation.y = -0.5; cyl(0.25, 0.25, 0.3, brass, 0, 1.55, 0); break;
    case 'merge': cyl(0.45, 0.35, 1.2, steel, 0, 0.8, 0); for (const a of [-0.7, 0, 0.7]) box(1.4, 0.3, 0.3, dark, Math.cos(a) * -0.6, 1.0, Math.sin(a) * 0.6).rotation.y = a; break;
    case 'buffer': cyl(0.7, 0.7, 1.8, steel, 0, 1.1, 0, 10); cyl(0.75, 0.2, 0.5, dark, 0, 2.25, 0, 10); box(0.2, 1.2, 0.05, brass, 0.71, 1.1, 0); break;
    case 'counter': { box(1.4, 1.0, 0.9, cream, 0, 0.7, 0); const wh = cyl(0.35, 0.35, 0.95, dark, 0, 0.75, 0.0, 10); wh.rotation.z = Math.PI / 2; wh.name = 'mv'; box(0.15, 0.3, 0.15, red, 0.5, 1.35, 0); break; }
    case 'gate': { box(0.3, 1.4, 0.3, dark, -0.8, 0.8, 0); const arm = new THREE.Group(); arm.position.set(-0.8, 1.35, 0); arm.name = 'mv'; g.add(arm); for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.12), i % 2 ? cream : red); s.position.set(0.25 + i * 0.42, 0, 0); arm.add(s); } break; }
    case 'timer': { box(0.2, 1.2, 0.2, dark, 0, 0.7, 0); const face = cyl(0.6, 0.6, 0.18, cream, 0, 1.6, 0, 12); face.rotation.x = Math.PI / 2; const hand = new THREE.Group(); hand.position.set(0, 1.6, 0.12); hand.name = 'mv'; g.add(hand); const hm = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.04), red); hm.position.y = 0.2; hand.add(hm); break; }
    case 'sensor': { box(0.15, 1.8, 0.15, steel, 0, 1.0, 0); const top = new THREE.Group(); top.position.set(0, 1.95, 0); top.name = 'mv'; g.add(top); const dish = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.3, 8, 1, true), cream); dish.rotation.z = Math.PI / 2; top.add(dish); const bulb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), red); bulb.position.y = 0.25; top.add(bulb); break; }
  }
  return g;
}

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
export function glyph(g: CanvasRenderingContext2D, kind: string, lit = true) {
  g.clearRect(0, 0, 24, 24);
  const rows = GLYPH[kind] ?? [];
  const oy = Math.floor((24 - rows.length) / 2) + 1;
  const stroke = lit ? INK : '#8a8072', fill = lit ? PENCIL_R : '#c8bd9e';
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '.') return; g.fillStyle = ch === '#' ? stroke : fill; g.fillRect(i + 1, oy + j, 1, 1); }));
}
