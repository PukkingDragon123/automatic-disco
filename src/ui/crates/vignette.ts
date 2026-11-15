// Living 3D vignettes for the stores. One overlay renderer draws every open container window as a small diorama on
// its sheet of paper: the real container (its lowpix body, opened: closed kinds are shown cut away), standing on a
// block of earth, its contents as real 3D items standing in the cells of its own interior (the grid is chalked on the
// container's floor). Items are their lowpix sprites extruded into thin pixel slabs (each opaque pixel gets its own
// coloured edge), so they read as made objects, not cards. Pointer picking runs on the interior floor plane. The
// same renderer turns an item on a little plinth when it is hovered.
import * as THREE from 'three';
import type { Container, Stack } from '../../inv/container';
import { ContainerModel } from '../../inv/models';
import { itemDef, itemPix, type ItemId } from '../../factory/items';
import { earth, planks } from '../../inv/tex';
import { gbuf } from '../../gfx/gbuf';
import { RAMPS } from '../../art/palette';

// ------------------------------------------------------------------ extruded pixel items
const geoCache = new Map<ItemId, { face: THREE.BufferGeometry; edge: THREE.BufferGeometry; tex: THREE.Texture }>();
/** an item as a 1 x 1 slab one pixel deep: front and back faces carry the sprite, the rim of every opaque pixel is
 *  a strip in that pixel's colour (centred on the origin, standing in the xy plane, facing +z) */
export function itemSlab(id: ItemId) {
  let g = geoCache.get(id);
  if (g) return g;
  const p = itemPix(id), S = 32, D = 2.2 / S;
  const tex = new THREE.DataTexture(new Uint8Array(p.d), S, S, THREE.RGBAFormat);
  tex.flipY = true; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const face = new THREE.PlaneGeometry(1, 1);
  const back = new THREE.PlaneGeometry(1, 1); back.rotateY(Math.PI); back.translate(0, 0, -D / 2);
  face.translate(0, 0, D / 2);
  const faces = mergeTwo(face, back);
  const pos: number[] = [], nor: number[] = [], col: number[] = [], c = new THREE.Color();
  const a = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && p.d[(y * S + x) * 4 + 3] > 0;
  const quad = (v: number[][], n: number[]) => { for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...v[i]); nor.push(...n); col.push(c.r, c.g, c.b); } };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!a(x, y)) continue;
    const i = (y * S + x) * 4; c.setRGB(p.d[i] / 255, p.d[i + 1] / 255, p.d[i + 2] / 255, THREE.SRGBColorSpace).multiplyScalar(0.72);
    const x0 = x / S - 0.5, x1 = (x + 1) / S - 0.5, y0 = 0.5 - (y + 1) / S, y1 = 0.5 - y / S, z0 = -D / 2, z1 = D / 2;
    if (!a(x - 1, y)) quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
    if (!a(x + 1, y)) quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]);
    if (!a(x, y - 1)) quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]);
    if (!a(x, y + 1)) quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]);
  }
  const edge = new THREE.BufferGeometry();
  edge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); edge.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); edge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g = { face: faces, edge, tex };
  geoCache.set(id, g);
  return g;
}
function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const out = new THREE.BufferGeometry(), A = a.toNonIndexed(), Bg = b.toNonIndexed();
  for (const k of ['position', 'normal', 'uv']) {
    const x = A.getAttribute(k) as THREE.BufferAttribute, y = Bg.getAttribute(k) as THREE.BufferAttribute;
    const arr = new Float32Array(x.array.length + y.array.length); arr.set(x.array as Float32Array); arr.set(y.array as Float32Array, x.array.length);
    out.setAttribute(k, new THREE.BufferAttribute(arr, x.itemSize));
  }
  return out;
}
const edgeMat = gbuf(new THREE.MeshLambertMaterial({ vertexColors: true }), 1);
const faceMats = new Map<ItemId, THREE.Material>();
/** a mesh of the item, size s world units tall */
export function itemMesh(id: ItemId, s: number): THREE.Group {
  const g = itemSlab(id);
  let fm = faceMats.get(id);
  if (!fm) { fm = gbuf(new THREE.MeshLambertMaterial({ map: g.tex, alphaTest: 0.5, side: THREE.FrontSide }), 1); faceMats.set(id, fm); }
  const grp = new THREE.Group();
  const f = new THREE.Mesh(g.face, fm), e = new THREE.Mesh(g.edge, edgeMat);
  f.castShadow = e.castShadow = true; f.receiveShadow = true;
  grp.add(f, e); grp.scale.setScalar(s);
  return grp;
}

// ------------------------------------------------------------------ the shared overlay renderer
export interface View { el: HTMLElement; scene: THREE.Scene; cam: THREE.PerspectiveCamera; tick?(dt: number): void; alive: boolean }
class Overlay {
  readonly canvas: HTMLCanvasElement;
  readonly r: THREE.WebGLRenderer | null = null;
  views: View[] = [];
  private raf = 0; private last = 0;
  constructor() {
    const c = (this.canvas = document.createElement('canvas'));
    c.className = 'inv-vig';
    document.body.appendChild(c);
    try {
      this.r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: false, powerPreference: 'low-power' });
      this.r.outputColorSpace = THREE.SRGBColorSpace; this.r.setClearColor(0x000000, 0); this.r.setScissorTest(true);
      this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFShadowMap;
    } catch (e) { console.warn('stores vignette: no WebGL', e); }
    const loop = (t: number) => { this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }
  add(v: View) { this.views.push(v); }
  remove(v: View) { v.alive = false; this.views = this.views.filter((q) => q !== v); }
  private frame(t: number) {
    const r = this.r; if (!r) return;
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000); this.last = t;
    const W = innerWidth, H = innerHeight;
    // one art pixel is --ik screen pixels: the vignettes render at art resolution and are blown up crisp
    const pr = (devicePixelRatio || 1) / (innerHeight >= 1000 ? 2 : 1);
    if (this.canvas.width !== Math.round(W * pr) || this.canvas.height !== Math.round(H * pr)) { r.setPixelRatio(pr); r.setSize(W, H, false); }
    this.canvas.style.display = this.views.length ? '' : 'none';
    if (!this.views.length) return;
    r.setScissor(0, 0, W, H); r.setViewport(0, 0, W, H); r.clear();
    for (const v of this.views) {
      const b = v.el.getBoundingClientRect();
      if (b.width < 4 || b.height < 4 || b.right < 0 || b.bottom < 0 || b.left > W || b.top > H) continue;
      v.tick?.(dt);
      v.cam.aspect = b.width / b.height; v.cam.updateProjectionMatrix();
      const y = H - b.bottom;
      r.setScissor(b.left, y, b.width, b.height); r.setViewport(b.left, y, b.width, b.height);
      r.render(v.scene, v.cam);
    }
  }
  dispose() { cancelAnimationFrame(this.raf); this.r?.dispose(); this.canvas.remove(); }
}
let OV: Overlay | null = null;
export const overlay = () => (OV ??= new Overlay());
export function disposeOverlay() { OV?.dispose(); OV = null; }

/** a diorama's light: a warm key from the upper left with soft shadows, a cool sky and a warm ground bounce */
function lights(scene: THREE.Scene, span: number) {
  scene.add(new THREE.HemisphereLight(0xd8e2dc, 0x6a5440, 1.35));
  const key = new THREE.DirectionalLight(0xffe6c2, 2.3); key.position.set(-span, span * 2, span * 1.4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 0.1, far: span * 6 }); key.shadow.bias = -0.0015;
  scene.add(key);
}
/** a block of earth the diorama stands on: a grass-and-soil top, layered soil sides */
function base(w: number, d: number) {
  const g = new THREE.Group();
  const top = gbuf(new THREE.MeshLambertMaterial({ map: earth() }), 1), side = gbuf(new THREE.MeshLambertMaterial({ map: planks('wet') }), 1);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), [side, side, top, side, side, side]);
  m.position.y = -0.15; m.receiveShadow = true; g.add(m);
  return g;
}

// ------------------------------------------------------------------ a container opened on the bench
const CHALK = RAMPS.paper[5];
/** the cell grid chalked onto the interior floor (a transparent texture), W x H cells */
function chalk(W: number, H: number) {
  const k = 16, c = document.createElement('canvas'); c.width = W * k; c.height = H * k;
  const x = c.getContext('2d')!; x.fillStyle = `rgba(${(CHALK >> 16) & 255},${(CHALK >> 8) & 255},${CHALK & 255},0.55)`;
  for (let i = 0; i <= W; i++) for (let y = 0; y < H * k; y += 3) if ((y + i * 5) % 11 < 8) x.fillRect(Math.min(W * k - 1, i * k), y, 1, 2);
  for (let j = 0; j <= H; j++) for (let xx = 0; xx < W * k; xx += 3) if ((xx + j * 7) % 13 < 9) x.fillRect(xx, Math.min(H * k - 1, j * k), 2, 1);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export interface Bay { x0: number; z0: number; x1: number; z1: number; y: number; h: number }
export class ContainerView implements View {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(28, 1.5, 0.05, 60);
  readonly model: ContainerModel;
  alive = true;
  private items = new THREE.Group();
  private grid: THREE.Mesh | null = null;
  private drop: THREE.Mesh;
  private ver = -1; private bayKey = '';
  private t = Math.random() * 10;
  private ray = new THREE.Raycaster(); private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** where each stack stands (for labels and the hover plinth): screen-projected each frame by the window */
  slots: { s: Stack; at: THREE.Vector3; top: THREE.Vector3 }[] = [];
  lifted: Stack | null = null;
  hover: Stack | null = null;
  constructor(readonly el: HTMLElement, readonly c: Container) {
    this.model = new ContainerModel(c, { cutaway: true, bare: true });
    const box = new THREE.Box3().setFromObject(this.model.root), sz = box.getSize(new THREE.Vector3());
    const span = Math.max(sz.x, sz.z, 1.2);
    this.scene.add(this.model.root, this.items);
    const b = base(Math.max(sz.x, 1) + 0.7, Math.max(sz.z, 1) + 0.7); this.scene.add(b);
    lights(this.scene, span * 1.4);
    this.drop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gbuf(new THREE.MeshBasicMaterial({ color: 0x7fb88a, transparent: true, opacity: 0.35, depthWrite: false }), 0));
    this.drop.rotation.x = -Math.PI / 2; this.drop.visible = false; this.scene.add(this.drop);
    this.fit();
  }
  /** look into the interior from the front and above, the whole container in frame */
  private fit() {
    const box = new THREE.Box3().setFromObject(this.model.root), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const B = this.model.bayOf();
    const tx = (B.x0 + B.x1) / 2, tz = (B.z0 + B.z1) / 2, ty = B.y;
    const r = Math.max(sz.x * 0.62, sz.z * 0.8, sz.y * 0.55, 0.9);
    this.cam.position.set(tx + r * 0.12, ty + r * 2.1, tz + r * 2.5);
    this.cam.lookAt(tx, ty + Math.min(0.3, sz.y * 0.15), tz);
    void ctr;
  }
  get bay(): Bay { return this.model.bayOf(); }
  /** keep the items, the chalk grid and the model in step with the container */
  tick(dt: number) {
    this.t += dt;
    this.model.update();
    const B = this.bay, key = `${B.x0},${B.z0},${B.x1},${B.z1},${B.y}`;
    if (key !== this.bayKey) { this.bayKey = key; this.makeGrid(); this.fit(); this.ver = -1; }
    if (this.ver !== this.c.ver) { this.ver = this.c.ver; this.layItems(); }
    // the hovered item lifts and turns a little; a lifted (dragged) stack fades
    for (const ch of this.items.children) {
      const s = ch.userData.stack as Stack, hov = s === this.hover;
      ch.position.y = ch.userData.y + (hov ? 0.04 + Math.sin(this.t * 4) * 0.01 : 0);
      ch.rotation.y = ch.userData.ry + (hov ? Math.sin(this.t * 2.2) * 0.25 : Math.sin(this.t * 0.7 + ch.userData.ph) * 0.03);
      ch.visible = s !== this.lifted;
    }
  }
  private makeGrid() {
    const B = this.bay;
    if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); }
    const m = gbuf(new THREE.MeshBasicMaterial({ map: chalk(this.c.W, this.c.H), transparent: true, depthWrite: false }), 0);
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0), m);
    this.grid.rotation.x = -Math.PI / 2; this.grid.position.set((B.x0 + B.x1) / 2, B.y + 0.004, (B.z0 + B.z1) / 2);
    this.scene.add(this.grid);
    this.plane.constant = -B.y;
  }
  /** each stack: its item standing in its cells, tipped back to face the bench, a second and third behind it when
   *  there are enough to make a pile */
  private layItems() {
    for (const ch of [...this.items.children]) this.items.remove(ch);
    this.slots = [];
    const c = this.c, B = this.bay, cw = (B.x1 - B.x0) / c.W, cd = (B.z1 - B.z0) / c.H;
    c.stacks.forEach((s, i) => {
      const [w, h] = c.dims(s.item, s.rot), lim = itemDef(s.item).stack, k = s.n / lim;
      const x = B.x0 + (s.x + w / 2) * cw, z = B.z0 + (s.y + h / 2) * cd;
      const size = Math.min(w * cw, h * cd * 1.25) * 0.95;
      const copies = k > 0.66 ? 3 : k > 0.33 ? 2 : 1;
      for (let q = copies - 1; q >= 0; q--) {
        const m = itemMesh(s.item, size * (1 - q * 0.06));
        const ph = (i * 1.7 + q) % 6.28;
        m.rotation.x = -0.32; m.userData = { stack: s, y: B.y + size * 0.47 + q * size * 0.08, ry: (Math.sin(i * 3.1 + q) * 0.18), ph };
        m.position.set(x + (q - (copies - 1) / 2) * size * 0.18, m.userData.y, z - q * size * 0.22);
        this.items.add(m);
      }
      this.slots.push({ s, at: new THREE.Vector3(x, B.y, z), top: new THREE.Vector3(x + size * 0.45, B.y + size * 0.95, z) });
    });
  }
  /** the cell under a point of this view (screen px), or null */
  cellAt(px: number, py: number): [number, number] | null {
    const r = this.el.getBoundingClientRect();
    if (px < r.left || py < r.top || px > r.right || py > r.bottom) return null;
    const ndc = new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam);
    const hit = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(this.plane, hit)) return null;
    const B = this.bay, cx = Math.floor(((hit.x - B.x0) / (B.x1 - B.x0)) * this.c.W), cy = Math.floor(((hit.z - B.z0) / (B.z1 - B.z0)) * this.c.H);
    if (cx < -1 || cy < -1 || cx > this.c.W || cy > this.c.H) return null;
    return [cx, cy];
  }
  /** the stack whose item is under a point (the item itself, else the stack whose cells are under it) */
  stackAt(px: number, py: number): Stack | null {
    const r = this.el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.cam);
    const hits = this.ray.intersectObjects(this.items.children, true);
    for (const h of hits) { let o: THREE.Object3D | null = h.object; while (o && !o.userData.stack) o = o.parent; if (o) return o.userData.stack as Stack; }
    const at = this.cellAt(px, py); if (!at) return null;
    const occ = this.c.occ(); const i = at[0] >= 0 && at[1] >= 0 && at[0] < this.c.W && at[1] < this.c.H ? occ[at[1] * this.c.W + at[0]] : -1;
    return i >= 0 ? this.c.stacks[i] : null;
  }
  showDrop(x: number, y: number, w: number, h: number, kind: '' | 'bad' | 'merge') {
    const B = this.bay, cw = (B.x1 - B.x0) / this.c.W, cd = (B.z1 - B.z0) / this.c.H;
    this.drop.visible = true; this.drop.scale.set(w * cw, h * cd, 1);
    this.drop.position.set(B.x0 + (x + w / 2) * cw, B.y + 0.01, B.z0 + (y + h / 2) * cd);
    (this.drop.material as THREE.MeshBasicMaterial).color.setHex(kind === 'bad' ? 0xcc6252 : kind === 'merge' ? 0xd9a43a : 0x7fb88a);
  }
  hideDrop() { this.drop.visible = false; }
  /** a world point to screen px */
  screen(v: THREE.Vector3): [number, number] {
    const r = this.el.getBoundingClientRect(), p = v.clone().project(this.cam);
    return [r.left + (p.x * 0.5 + 0.5) * r.width, r.top + (-p.y * 0.5 + 0.5) * r.height];
  }
  dispose() { this.alive = false; this.model.dispose(); }
}

// ------------------------------------------------------------------ an item turning on a plinth
export class PlinthView implements View {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
  alive = true;
  private holder = new THREE.Group();
  private t = 0;
  item: ItemId | null = null;
  constructor(readonly el: HTMLElement) {
    lights(this.scene, 1.2);
    const stone = gbuf(new THREE.MeshLambertMaterial({ color: RAMPS.stone[5] }), 1), top = gbuf(new THREE.MeshLambertMaterial({ color: RAMPS.stone[6] }), 1);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.24, 10), [stone, top, stone]); p.position.y = -0.12; p.receiveShadow = true;
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.06, 10), stone); p2.position.y = -0.27;
    this.scene.add(p, p2, this.holder);
    this.cam.position.set(0, 0.55, 2.3); this.cam.lookAt(0, 0.32, 0);
  }
  set(id: ItemId) {
    if (id === this.item) return;
    this.item = id;
    for (const ch of [...this.holder.children]) this.holder.remove(ch);
    const m = itemMesh(id, 0.7); m.position.y = 0.36; this.holder.add(m);
  }
  tick(dt: number) { this.t += dt; this.holder.rotation.y = this.t * 1.1; this.holder.position.y = Math.sin(this.t * 2) * 0.015; }
  /** screen points on the turning item for the callouts: its top, its middle and its foot */
  points(): [number, number][] {
    const r = this.el.getBoundingClientRect();
    return [[0, 0.68, 0], [0.18, 0.36, 0], [0, 0.04, 0]].map(([x, y, z]) => { const p = new THREE.Vector3(x, y, z).project(this.cam); return [r.left + (p.x * 0.5 + 0.5) * r.width, r.top + (-p.y * 0.5 + 0.5) * r.height]; });
  }
}
