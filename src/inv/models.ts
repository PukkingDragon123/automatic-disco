// The containers in 3D. Each kind is built from real parts at real sizes (boards, posts, angle-iron corners, skids,
// ribs, hinged lids, rivet rings, ladders, sight glasses, valve wheels, berms) in the hand-painted textures of
// inv/tex.ts, merged per material so a container is a handful of draw calls. What is inside shows: open-topped
// kinds (crate, pit, bunker) carry their real load over the rim, laid out exactly as the grid window shows it (each
// stack at its cells: item cards for solids, heaped fill for loose bulk); the tank's sight glass and the silo's gauge
// read their level. `cutaway` (the crate HUD's miniatures) leaves lids, roofs and fronts off so every kind shows its
// contents. Local frame: the footprint centred on the origin, the ground at y = 0, the front facing +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gbuf, type GFlag } from '../gfx/gbuf';
import { RAMPS } from '../art/palette';
import { ITEMS, ITEM_IDS, itemDef, itemPix, type ItemId } from '../factory/items';
import type { Container } from './container';
import { KIND_INFO, PAINTS, type ContainerKind } from './kinds';
import { planks, plate, concrete, corrugated, hazard, frost, glass, earth, grain, grille, logoPlate } from './tex';

type MatKey = string;
let FONTS_OK = false;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// ------------------------------------------------------------------ geometry kit
/** a box whose faces tile their texture once a metre (u along the face's width, v along its height) */
function boxG(w: number, h: number, d: number, k = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const j = f * 4 + i; uv.setXY(j, uv.getX(j) * dims[f][0] * k, uv.getY(j) * dims[f][1] * k); }
  return g;
}
function cylG(r0: number, r1: number, h: number, n = 16, open = false, k = 1): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, n, 1, open);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const per = Math.PI * 2 * Math.max(r0, r1);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * per * k, uv.getY(i) * h * k);
  return g;
}
class Parts {
  private by = new Map<MatKey, THREE.BufferGeometry[]>();
  add(key: MatKey, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    const c = g.index ? g.toNonIndexed() : g.clone(); c.applyMatrix4(_m);
    for (const a of Object.keys(c.attributes)) if (a !== 'position' && a !== 'normal' && a !== 'uv') c.deleteAttribute(a);
    (this.by.get(key) ?? this.by.set(key, []).get(key)!).push(c);
  }
  box(key: MatKey, x: number, y: number, z: number, w: number, h: number, d: number, o: { rx?: number; ry?: number; rz?: number; k?: number } = {}) { this.add(key, boxG(w, h, d, o.k), x, y, z, o.rx, o.ry, o.rz); }
  cyl(key: MatKey, x: number, y: number, z: number, r0: number, r1: number, h: number, o: { n?: number; rx?: number; rz?: number; open?: boolean; k?: number } = {}) { this.add(key, cylG(r0, r1, h, o.n ?? 16, o.open, o.k), x, y, z, o.rx ?? 0, 0, o.rz ?? 0); }
  build(mats: (k: MatKey) => THREE.Material, into: THREE.Group, shadow = true) {
    for (const [k, gs] of this.by) {
      const g = mergeGeometries(gs, false); if (!g) continue;
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats(k)); m.castShadow = shadow; m.receiveShadow = true;
      into.add(m);
      for (const x of gs) x.dispose();
    }
    this.by.clear();
  }
}

// ------------------------------------------------------------------ materials (textures shared; one set per container for its own selection flag)
function baseMat(key: MatKey, c: Container): THREE.Material {
  const paint = c.color;
  const L = (map: THREE.Texture | null, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ map, ...o });
  switch (key) {
    case 'plank': return L(planks('fresh'));
    case 'plankOld': return L(planks('weathered'));
    case 'plankWet': return L(planks('wet'));
    case 'paint': return L(plate(paint));
    case 'paintPlain': return L(plate(paint, { rivets: false, seam: false }));
    case 'steel': return L(plate('black', { seam: false }));
    case 'olive': return L(plate('olive', { rivets: false }));
    case 'bare': return L(null, { color: RAMPS.steel[4] });
    case 'dark': return L(null, { color: RAMPS.steel[1] });
    case 'rubber': return L(null, { color: RAMPS.basalt[1] });
    case 'brass': return L(null, { color: RAMPS.brass[4] });
    case 'copper': return L(null, { color: RAMPS.copper[4] });
    case 'stampRed': return L(null, { color: RAMPS.stampRed[3] });
    case 'concrete': return L(concrete(0));
    case 'concreteD': return L(concrete(-1));
    case 'corr': return L(corrugated(paint));
    case 'hazard': return L(hazard());
    case 'frost': return L(frost());
    case 'glass': return L(glass(), { emissive: new THREE.Color(RAMPS.water[1]).multiplyScalar(0.3) });
    case 'earth': return L(earth());
    case 'grille': return L(grille());
    case 'cream': return L(plate('cream', { rivets: false }));
    case 'lampOn': return L(null, { color: RAMPS.glowTeal[3], emissive: new THREE.Color(RAMPS.glowTeal[3]), emissiveIntensity: 1.4 });
    case 'lampOff': return L(null, { color: RAMPS.stampRed[3], emissive: new THREE.Color(RAMPS.stampRed[3]), emissiveIntensity: 0.9 });
    case 'lampAmber': return L(null, { color: RAMPS.glowAmber[3], emissive: new THREE.Color(RAMPS.glowAmber[3]), emissiveIntensity: 1.2 });
    case 'pane': return new THREE.MeshLambertMaterial({ color: RAMPS.water[5], transparent: true, opacity: 0.22, depthWrite: false });
    default: return L(null, { color: 0x808080 });
  }
}

// ------------------------------------------------------------------ the item atlas (cards inside the containers)
let ATLAS: { tex: THREE.CanvasTexture; n: number; cols: number } | null = null;
function atlas() {
  if (ATLAS && ATLAS.n === ITEM_IDS.length) return ATLAS;
  const cols = 16, rows = Math.ceil(ITEM_IDS.length / cols), S = 32;
  const cv = document.createElement('canvas'); cv.width = cols * S; cv.height = rows * S;
  const x = cv.getContext('2d')!;
  ITEM_IDS.forEach((id, i) => { const p = itemPix(id); const img = new ImageData(new Uint8ClampedArray(p.d), S, S); x.putImageData(img, (i % cols) * S, Math.floor(i / cols) * S); });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  ATLAS?.tex.dispose();
  ATLAS = { tex, n: ITEM_IDS.length, cols };
  return ATLAS;
}
function cardUV(id: ItemId): [number, number, number, number] {
  const a = atlas(), i = ITEM_IDS.indexOf(id), rows = Math.ceil(a.n / a.cols);
  const u0 = (i % a.cols) / a.cols, v0 = 1 - (Math.floor(i / a.cols) + 1) / rows;
  return [u0, v0, u0 + 1 / a.cols, v0 + 1 / rows];
}
const BULK = (id: ItemId) => { const t = itemDef(id).tags; return t.includes('bulk') && !t.includes('solid') || itemDef(id).group === 'earth' && t.includes('bulk'); };
/** kinds whose load lies loose: everything in them heaps */
const LOOSE = new Set(['st_pit', 'st_bunker', 'silo', 'st_tank']);

// ------------------------------------------------------------------ the model
export interface ModelOpts { cutaway?: boolean; flag?: GFlag | null; shadow?: boolean; /** draw no load (the vignette lays real items itself) */ bare?: boolean }
interface Bay { x0: number; z0: number; x1: number; z1: number; y: number; h: number }
export class ContainerModel {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private load = new THREE.Group();
  private mats = new Map<MatKey, THREE.Material>();
  private ver = -1; private look = '';
  private bay: Bay = { x0: -0.4, z0: -0.4, x1: 0.4, z1: 0.4, y: 0.1, h: 0.6 };
  private gauge: THREE.Mesh | null = null; private lamp: THREE.Mesh | null = null;
  private plateMesh: THREE.Mesh | null = null;
  readonly flag: GFlag;
  constructor(readonly c: Container, readonly o: ModelOpts = {}) {
    this.flag = o.flag ?? { value: 1 };
    this.root.add(this.body, this.load);
    this.root.userData.container = c;
    this.rebuild();
  }
  private mat = (k: MatKey) => {
    let m = this.mats.get(k);
    if (!m) { m = baseMat(k, this.c); if (k === 'pane') gbuf(m, 0); else gbuf(m, this.flag); this.mats.set(k, m); }
    return m;
  };
  /** rebuild the body (kind or paint changed) */
  rebuild() {
    for (const ch of [...this.body.children]) { this.body.remove(ch); (ch as THREE.Mesh).geometry?.dispose(); }
    for (const m of this.mats.values()) m.dispose(); this.mats.clear();
    this.plateMesh = null; this.gauge = null; this.lamp = null;
    const P = new Parts();
    // a cut-away view of a closed kind shows its procedural body with the lid off (the lowpix body has no inside)
    const recipe = this.o.cutaway && !GLB[this.c.kind]?.open ? undefined : GLB[this.c.kind], got = recipe ? glbParts(recipe) : null;
    if (recipe && got) this.fromGlb(recipe, got, P);
    else {
      BUILD[this.c.kind](P, this, !!this.o.cutaway);
      // the lowpix model is on its way: rebuild with it when it lands
      if (recipe) loadRecipe(recipe).then(() => { if (!this.disposed) this.rebuild(); });
    }
    P.build(this.mat, this.body, this.o.shadow !== false);
    this.look = this.lookKey(); this.ver = -1;
    this.update();
  }
  private disposed = false;
  /** the body from the lowpix-converted models (Poly Haven CC0, pixel-hd): each part fitted to its size and placed;
   *  the recipe adds the stencilled plate, the load bay and any small fittings of our own */
  private fromGlb(r: GlbRecipe, src: THREE.Group[], P: Parts) {
    r.parts.forEach((part, i) => {
      const g = src[i].clone(true);
      const box = new THREE.Box3().setFromObject(g), sz = box.getSize(new THREE.Vector3());
      const k = part.size / (part.fit === 'height' ? sz.y : part.fit === 'depth' ? sz.z : sz.x);
      g.scale.setScalar(k);
      const ctr = box.getCenter(new THREE.Vector3());
      g.position.set(-ctr.x * k, -box.min.y * k, -ctr.z * k);
      const holder = new THREE.Group(); holder.add(g); holder.userData.shared = true;
      holder.position.set(part.pos?.[0] ?? 0, part.pos?.[1] ?? 0, part.pos?.[2] ?? 0); holder.rotation.y = part.ry ?? 0;
      g.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const old = m.material as THREE.MeshStandardMaterial;
        const key = 'glb:' + r.parts[i].url + ':' + (old.map?.uuid ?? old.uuid);
        let mat = this.mats.get(key);
        if (!mat) {
          if (old.map) { old.map.magFilter = THREE.NearestFilter; old.map.colorSpace = THREE.SRGBColorSpace; }
          mat = gbuf(new THREE.MeshLambertMaterial({ map: old.map ?? null, color: old.map ? 0xffffff : old.color, side: THREE.DoubleSide }), this.flag);
          this.mats.set(key, mat);
        }
        m.material = mat; m.castShadow = this.o.shadow !== false; m.receiveShadow = true;
      });
      this.body.add(holder);
    });
    r.extra?.(P, this, !!this.o.cutaway);
    const [px, py, pz, pw, pry] = r.plate; this.plateAt(px, py, pz, pw, pry);
    if (r.bay) this.setBay(r.bay);
    this.glbOpen = !!r.open;
  }
  /** a lowpix body is open at the top (its load shows) */
  glbOpen = false;
  private lookKey() { return `${this.c.color}|${this.c.logo}|${this.c.label}`; }
  /** the stencilled plate on the front face, at (x, y, z) facing +z (or rotated ry) */
  plateAt(x: number, y: number, z: number, w = 0.42, ry = 0) {
    const t = logoPlate(this.c.logo, this.c.color, this.c.label);
    const m = gbuf(new THREE.MeshLambertMaterial({ map: t }), this.flag);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 3), m);
    mesh.position.set(x, y, z); mesh.rotation.y = ry;
    this.body.add(mesh); this.plateMesh = mesh;
    // the stencil face may not have loaded when the plate was first painted: paint it again once it has
    if (!FONTS_OK) document.fonts?.ready.then(() => { FONTS_OK = true; if (this.plateMesh !== mesh) return; m.map?.dispose(); m.map = logoPlate(this.c.logo, this.c.color, this.c.label); m.needsUpdate = true; });
  }
  setBay(b: Bay) { this.bay = b; }
  /** the interior floor where the load lies (container-local metres) */
  bayOf(): Bay { return this.bay; }
  setGauge(m: THREE.Mesh) { this.gauge = m; this.body.add(m); }
  setLamp(m: THREE.Mesh) { this.lamp = m; this.body.add(m); }
  /** keep the model in step with the container (contents, paint, logo, power); cheap when nothing changed */
  update() {
    const look = this.lookKey();
    if (look !== this.look) {
      const paintChanged = look.split('|')[0] !== this.look.split('|')[0];
      if (paintChanged) { this.rebuild(); return; }
      this.look = look;
      if (this.plateMesh) { const m = this.plateMesh.material as THREE.MeshLambertMaterial; m.map?.dispose(); m.map = logoPlate(this.c.logo, this.c.color, this.c.label); m.needsUpdate = true; }
    }
    if (this.lamp) { const on = this.c.powered(); const want = on ? 'lampOn' : 'lampOff'; if ((this.lamp.userData.k ?? '') !== want) { this.lamp.material = this.mat(want); this.lamp.userData.k = want; } }
    if (this.ver === this.c.ver) return;
    this.ver = this.c.ver;
    this.fillLoad();
  }
  /** what is inside, laid out as the grid lays it out */
  private fillLoad() {
    for (const ch of [...this.load.children]) { this.load.remove(ch); (ch as THREE.Mesh).geometry?.dispose(); }
    const c = this.c, B = this.bay, fillK = c.fill();
    if (this.gauge) { const g = this.gauge; g.scale.y = Math.max(0.02, fillK); g.position.y = g.userData.y0 + (g.userData.h * g.scale.y) / 2; }
    if (this.o.bare) return;
    if (c.kind === 'st_cabinet' && !this.o.cutaway) { this.jars(); return; }
    const visible = this.o.cutaway || c.info.open || this.glbOpen;
    if (!visible || !c.stacks.length) return;
    if (this.o.cutaway && GLB[c.kind] && !GLB[c.kind]!.open && this.body.children.length) { this.display(); return; }
    const cw = (B.x1 - B.x0) / c.W, cd = (B.z1 - B.z0) / c.H;
    const cards: number[] = [], cuv: number[] = [], cn: number[] = [];
    const hash = (a: number, b: number) => { const v = Math.sin(a * 91.7 + b * 47.3) * 43758.5; return v - Math.floor(v); };
    const loose = LOOSE.has(c.kind);
    // the loose load as one landscape over the whole bay: each cell rises with its stack's fill, the heights are
    // smoothed so neighbouring piles slump into each other, each vertex takes the colour of the material under it
    const RES = 4, NX = c.W * RES, NZ = c.H * RES;
    const cellH = new Float32Array(c.W * c.H), cellC = new Int32Array(c.W * c.H).fill(-1);
    let anyHeap = false;
    for (const s of c.stacks) {
      // loose loads heap to their fill; packed solids sit a little lower (they stack, they do not slump)
      const [w, h] = c.dims(s.item, s.rot), k = Math.min(1, s.n / itemDef(s.item).stack), heapy = loose || BULK(s.item);
      for (let y = s.y; y < s.y + h; y++) for (let x = s.x; x < s.x + w; x++) if (x < c.W && y < c.H) { cellH[y * c.W + x] = B.h * (heapy ? 0.18 + 0.82 * k : 0.12 + 0.7 * k); cellC[y * c.W + x] = ITEMS[s.item]?.side ?? 0x806040; }
      anyHeap = true;
    }
    const hAt = (vx: number, vz: number) => { const x = Math.min(c.W - 1, Math.floor(vx / RES)), z = Math.min(c.H - 1, Math.floor(vz / RES)); return cellH[z * c.W + x]; };
    let field: Float32Array | null = null;
    if (anyHeap) {
      field = new Float32Array((NX + 1) * (NZ + 1));
      for (let z = 0; z <= NZ; z++) for (let x = 0; x <= NX; x++) {
        let sum = 0, n = 0;
        for (const [dx, dz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= NX || Z >= NZ) continue; sum += hAt(X, Z); n++; }
        field[z * (NX + 1) + x] = n ? sum / n : 0;
      }
      for (let pass = 0; pass < 3; pass++) {
        const f2 = new Float32Array(field);
        for (let z = 0; z <= NZ; z++) for (let x = 0; x <= NX; x++) {
          let sum = 0, n = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X > NX || Z > NZ) continue; sum += field[Z * (NX + 1) + X]; n++; }
          f2[z * (NX + 1) + x] = sum / n;
        }
        field = f2;
      }
      const g = new THREE.PlaneGeometry(B.x1 - B.x0, B.z1 - B.z0, NX, NZ); g.rotateX(-Math.PI / 2);
      const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
      const col = new Float32Array(pos.count * 3), cc = new THREE.Color(), floor = new THREE.Color(RAMPS.soil[2]);
      for (let i = 0; i < pos.count; i++) {
        const vx = i % (NX + 1), vz = Math.floor(i / (NX + 1));
        const hv = field[vz * (NX + 1) + vx];
        pos.setY(i, hv * (0.92 + 0.16 * hash(vx * 3.1, vz * 5.7)));
        uv.setXY(i, (pos.getX(i) + (B.x0 + B.x1) / 2) * 2, (pos.getZ(i) + (B.z0 + B.z1) / 2) * 2);
        const ci = cellC[Math.min(c.H - 1, Math.floor(Math.min(NZ - 1, vz) / RES)) * c.W + Math.min(c.W - 1, Math.floor(Math.min(NX - 1, vx) / RES))];
        if (ci >= 0) cc.setHex(ci); else cc.copy(floor);
        col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals(); g.translate((B.x0 + B.x1) / 2, B.y, (B.z0 + B.z1) / 2);
      let m = this.mats.get('heap');
      if (!m) { m = gbuf(new THREE.MeshLambertMaterial({ map: grain(), vertexColors: true }), this.flag); this.mats.set('heap', m); }
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = this.o.shadow !== false;
      this.load.add(mesh);
    }
    const fieldAt = (x: number, z: number) => {
      if (!field) return 0;
      const vx = Math.round(((x - B.x0) / (B.x1 - B.x0)) * NX), vz = Math.round(((z - B.z0) / (B.z1 - B.z0)) * NZ);
      return field[Math.max(0, Math.min(NZ, vz)) * (NX + 1) + Math.max(0, Math.min(NX, vx))];
    };
    for (const s of c.stacks) {
      const [w, h] = c.dims(s.item, s.rot), lim = itemDef(s.item).stack, k = Math.min(1, s.n / lim), heap = loose || BULK(s.item);
      const x0 = B.x0 + s.x * cw, z0 = B.z0 + s.y * cd, x1 = x0 + w * cw, z1 = z0 + h * cd;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      // a card of the item's art lies on every stack (on the pile's crown for loose loads), a second under it when
      // the stack is over half full: what is in there reads at a glance
      const [u0, v0, u1, v1] = cardUV(s.item);
      const sz = Math.min(Math.max(x1 - x0, z1 - z0) * 0.95, Math.min(x1 - x0, z1 - z0) * 1.35);
      const layers = 1; void heap; void k;
      for (let l = 0; l < layers; l++) {
        const y = B.y + fieldAt(cx, cz) + 0.012, tilt = 0.7 + (hash(s.x, s.y + l) - 0.5) * 0.3, yaw = (hash(s.y, s.x + l) - 0.5) * 0.4;
        const ox = l * sz * 0.08, oz = -l * sz * 0.06;
        // a quad lying on its back, tipped up toward the front (+z) by `tilt`
        const hw = sz / 2, ct = Math.cos(tilt), st = Math.sin(tilt), cy2 = Math.cos(yaw), sy2 = Math.sin(yaw);
        const corner = (a: number, b: number): [number, number, number] => { const lx = a * hw, lz = b * hw * ct, ly = -b * hw * st; return [cx + ox + lx * cy2 + lz * sy2, y + ly + hw * st * 0.5, cz + oz - lx * sy2 + lz * cy2]; };
        const P0 = corner(-1, 1), P1 = corner(1, 1), P2 = corner(1, -1), P3 = corner(-1, -1);
        for (const [p, uu, vv] of [[P0, u0, v0], [P1, u1, v0], [P2, u1, v1], [P0, u0, v0], [P2, u1, v1], [P3, u0, v1]] as [[number, number, number], number, number][]) { cards.push(...p); cuv.push(uu, vv); cn.push(0, ct, st); }
      }
    }
    if (cards.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(cards, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(cuv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(cn, 3));
      let m = this.mats.get('cards') as THREE.MeshLambertMaterial | undefined;
      const tex = atlas().tex;
      if (!m || m.map !== tex) { m?.dispose(); m = gbuf(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }), this.flag); this.mats.set('cards', m); }
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = false; mesh.receiveShadow = true;
      this.load.add(mesh);
    }
  }
  /** the specimen cabinet's load behind its glass: a stoppered jar per stack on the three shelves, filled with the
   *  colour of what is in it, fuller as the stack fills */
  private jars() {
    const c = this.c, pos: number[] = [], nor: number[] = [], col: number[] = [], cc = new THREE.Color();
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, hex: number) => {
      g.translate(x, y, z); const ng = g.toNonIndexed(), p = ng.attributes.position, n = ng.attributes.normal;
      cc.setHex(hex);
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(cc.r, cc.g, cc.b); }
      g.dispose(); ng.dispose();
    };
    c.stacks.slice(0, 15).forEach((s, i) => {
      const row = Math.floor(i / 5), slot = i % 5, x = -0.32 + slot * 0.16, y = 0.12 + (2 - row) * 0.55 + 0.03, z = 0.02 + (slot % 2) * 0.05;
      const k = Math.min(1, s.n / itemDef(s.item).stack), h = 0.2;
      add(new THREE.CylinderGeometry(0.055, 0.055, h, 8), x, y + h / 2, z, RAMPS.water[5]);
      add(new THREE.CylinderGeometry(0.047, 0.047, h * (0.25 + 0.7 * k), 8), x, y + (h * (0.25 + 0.7 * k)) / 2 + 0.005, z + 0.012, ITEMS[s.item]?.side ?? 0x808080);
      add(new THREE.CylinderGeometry(0.06, 0.06, 0.035, 8), x, y + h + 0.017, z, RAMPS.brass[4]);
      add(new THREE.BoxGeometry(0.07, 0.05, 0.004), x, y + h * 0.55, z + 0.058, RAMPS.paper[4]);
    });
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    let m = this.mats.get('jars');
    if (!m) { m = gbuf(new THREE.MeshLambertMaterial({ vertexColors: true }), this.flag); this.mats.set('jars', m); }
    this.load.add(new THREE.Mesh(g, m));
  }
  /** a closed lowpix body in the crate HUD: what it holds stands in front of it as item cards, a shop-window display */
  private display() {
    const c = this.c, items = c.contents().slice(0, 5);
    const pos: number[] = [], uv: number[] = [], nor: number[] = [];
    const box = new THREE.Box3().setFromObject(this.body), front = box.max.z + 0.05, w = box.max.x - box.min.x;
    const sz = Math.min(0.62, (w * 1.2) / Math.max(1, items.length));
    items.forEach((e, i) => {
      const [u0, v0, u1, v1] = cardUV(e.item);
      const x = (i - (items.length - 1) / 2) * sz * 0.9, y = 0.02 + (i % 2) * 0.04, z = front + (i % 2) * 0.12, h = sz / 2;
      const P0 = [x - h, y, z], P1 = [x + h, y, z], P2 = [x + h, y + sz, z], P3 = [x - h, y + sz, z];
      for (const [p, uu, vv] of [[P0, u0, v0], [P1, u1, v0], [P2, u1, v1], [P0, u0, v0], [P2, u1, v1], [P3, u0, v1]] as [number[], number, number][]) { pos.push(...p); uv.push(uu, vv); nor.push(0, 0, 1); }
    });
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    let m = this.mats.get('cards') as THREE.MeshLambertMaterial | undefined;
    const tex = atlas().tex;
    if (!m || m.map !== tex) { m?.dispose(); m = gbuf(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }), this.flag); this.mats.set('cards', m); }
    this.load.add(new THREE.Mesh(g, m));
  }
  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
    const own = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (q.userData.shared) return false; return true; };
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (own(o)) m.geometry?.dispose(); });
    for (const m of this.mats.values()) m.dispose();
    if (this.plateMesh) (this.plateMesh.material as THREE.MeshLambertMaterial).map?.dispose();
  }
}

// ------------------------------------------------------------------ lowpix bodies (Poly Haven CC0 models converted with
// `lowpix convert polyhaven:<id> --style pixel-hd`; the .glb files live in public/inv/)
interface GlbPart { url: string; fit: 'width' | 'height' | 'depth'; size: number; pos?: [number, number, number]; ry?: number }
interface GlbRecipe { parts: GlbPart[]; plate: [number, number, number, number, number]; bay?: Bay; open?: boolean; extra?: Builder }
const GLB: Partial<Record<ContainerKind, GlbRecipe>> = {
  // an open slatted timber crate
  crate: { parts: [{ url: 'planter_box_02', fit: 'width', size: 1.9 }], plate: [-0.45, 0.36, 0.37, 0.36, 0], open: true, bay: { x0: -0.82, z0: -0.25, x1: 0.82, z1: 0.25, y: 0.1, h: 0.5 } },
  // a raised timber bed of earth
  st_pit: { parts: [{ url: 'planter_box_01', fit: 'width', size: 1.9 }], plate: [-0.5, 0.45, 0.45, 0.36, 0], open: true, bay: { x0: -0.82, z0: -0.33, x1: 0.82, z1: 0.33, y: 0.15, h: 0.62 } },
  // three concrete road barriers stood in a U, open at the front for the tipper
  st_bunker: {
    parts: [{ url: 'concrete_road_barrier', fit: 'width', size: 1.9, pos: [0, 0, -0.62] }, { url: 'concrete_road_barrier', fit: 'width', size: 1.5, pos: [-0.66, 0, 0.18], ry: Math.PI / 2 }, { url: 'concrete_road_barrier', fit: 'width', size: 1.5, pos: [0.66, 0, 0.18], ry: Math.PI / 2 }],
    plate: [0, 0.62, -0.31, 0.4, 0], open: true, bay: { x0: -0.4, z0: -0.38, x1: 0.4, z1: 0.9, y: 0.04, h: 0.62 },
    extra: (P) => { P.box('concreteD', 0, 0.03, 0.12, 1.96, 0.06, 1.7); },
  },
  // two olive ammunition crates, lids thrown back
  st_bin: { parts: [{ url: 'old_military_crate', fit: 'width', size: 1.92 }], plate: [0.5, 0.17, 0.5, 0.3, 0], open: true, bay: { x0: -0.86, z0: -0.18, x1: 0.86, z1: 0.38, y: 0.05, h: 0.2 } },
  // a standing gas cylinder for fluids, a jerrycan by its foot
  st_tank: {
    parts: [{ url: 'propane_tank', fit: 'height', size: 2.3, pos: [0, 0.14, 0] }, { url: 'metal_jerrycan_green', fit: 'height', size: 0.46, pos: [0.72, 0.14, 0.62], ry: -0.5 }],
    plate: [0, 1.2, 0.76, 0.42, 0], extra: (P) => { P.cyl('concrete', 0, 0.07, 0, 0.92, 0.92, 0.14, { n: 20 }); },
  },
  // a drawer cabinet with open shelves on top: the specimen store
  st_cabinet: { parts: [{ url: 'drawer_cabinet', fit: 'height', size: 1.65 }], plate: [0, 1.0, 0.23, 0.34, 0] },
  // a green-enamelled cold store cabinet
  st_freezer: {
    parts: [{ url: 'utility_box_02', fit: 'width', size: 1.6, pos: [-0.12, 0, 0] }], plate: [-0.12, 1.25, 0.39, 0.4, 0],
    extra: (P, M) => {
      P.box('grille', 0.82, 0.42, 0, 0.28, 0.84, 0.7);
      P.cyl('dark', 0.82, 0.55, 0.36, 0.11, 0.11, 0.02, { rx: Math.PI / 2, n: 12 });
      for (const z of [-0.15, 0.15]) P.cyl('copper', 0.72, 1.0, z, 0.02, 0.02, 0.35, { n: 6 });
      lamp(M, 0.82, 0.95, 0.36, 0.06);
    },
  },
};
const glbCache = new Map<string, Promise<THREE.Group>>(), glbReady = new Map<string, THREE.Group>();
let loader: GLTFLoader | null = null;
function loadGlb(name: string): Promise<THREE.Group> {
  let p = glbCache.get(name);
  if (!p) {
    loader ??= new GLTFLoader();
    p = loader.loadAsync(`/inv/${name}.glb`).then((g) => { glbReady.set(name, g.scene); return g.scene; });
    p.catch((e) => console.warn('inventory model', name, e));
    glbCache.set(name, p);
  }
  return p;
}
const loadRecipe = (r: GlbRecipe) => Promise.all(r.parts.map((q) => loadGlb(q.url)));
/** the recipe's models when every one has loaded (else null, and they are requested) */
function glbParts(r: GlbRecipe): THREE.Group[] | null {
  const out = r.parts.map((q) => glbReady.get(q.url));
  if (out.every(Boolean)) return out as THREE.Group[];
  void loadRecipe(r);
  return null;
}
/** start fetching every lowpix body (call early) */
export function preloadContainerModels() { for (const r of Object.values(GLB)) if (r) void loadRecipe(r); }

// ------------------------------------------------------------------ the kinds
type Builder = (P: Parts, M: ContainerModel, cut: boolean) => void;
const lamp = (M: ContainerModel, x: number, y: number, z: number, s = 0.07) => { const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), new THREE.MeshLambertMaterial()); m.position.set(x, y, z); M.setLamp(m); };
const gauge = (M: ContainerModel, x: number, y0: number, z: number, h: number, w: number, col: number) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), gbuf(new THREE.MeshLambertMaterial({ color: col, emissive: new THREE.Color(col), emissiveIntensity: 0.35 }), M.flag));
  m.position.set(x, y0 + h / 2, z); m.userData.y0 = y0; m.userData.h = h; M.setGauge(m);
};
/** a steel ladder up a face (rails and rungs), at x, z facing +z rotated ry */
function ladder(P: Parts, x: number, z: number, y0: number, y1: number, ry = 0, key = 'bare') {
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const o of [-0.16, 0.16]) P.box(key, x + c * o, (y0 + y1) / 2, z - s * o, 0.035, y1 - y0, 0.035, { ry });
  for (let y = y0 + 0.22; y < y1 - 0.05; y += 0.26) P.box(key, x, y, z, 0.34, 0.025, 0.025, { ry });
}
const BUILD: Record<ContainerKind, Builder> = {
  crate(P, M, cut) {
    const W = 0.94, H = 0.86, t = 0.05;
    // skids, floor, four board walls, angle-iron corners, a top rim
    for (const x of [-0.32, 0.32]) P.box('plankOld', x, 0.04, 0, 0.1, 0.08, 0.96);
    P.box('plank', 0, 0.1, 0, W, 0.04, W);
    const wall = cut ? H * 0.62 : H;
    for (const [x, z, w, d] of [[0, W / 2 - t / 2, W, t], [0, -W / 2 + t / 2, W, t], [W / 2 - t / 2, 0, t, W - 2 * t], [-W / 2 + t / 2, 0, t, W - 2 * t]] as [number, number, number, number][]) P.box('plank', x, 0.08 + wall / 2, z, w, wall, d);
    // battens across each face and the steel corners
    for (const z of [W / 2 + 0.005, -W / 2 - 0.005]) { P.box('plankOld', 0, 0.08 + wall * 0.22, z, W, 0.07, 0.02); P.box('plankOld', 0, 0.08 + wall * 0.86, z, W, 0.07, 0.02); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      P.box('steel', sx * (W / 2 - 0.01), 0.08 + wall / 2, sz * (W / 2 - 0.03), 0.03, wall + 0.02, 0.09);
      P.box('steel', sx * (W / 2 - 0.03), 0.08 + wall / 2, sz * (W / 2 - 0.01), 0.09, wall + 0.02, 0.03);
      for (const y of [0.18, 0.08 + wall - 0.1]) P.box('bare', sx * (W / 2 + 0.006), y, sz * (W / 2 - 0.05), 0.012, 0.025, 0.025);
    }
    // rope handles on the ends
    for (const sx of [-1, 1]) P.box('plankWet', sx * (W / 2 + 0.03), 0.08 + wall * 0.6, 0, 0.03, 0.04, 0.26);
    if (!cut) {
      // its lid, prised off and leant against the side: battens on the inside face, the nails still in
      P.box('plankOld', -W / 2 - 0.2, 0.47, 0.02, 0.035, 0.9, W * 0.96, { rz: -0.24 });
      for (const z of [-0.3, 0.3]) P.box('plank', -W / 2 - 0.175, 0.47, z, 0.03, 0.86, 0.08, { rz: -0.24 });
      for (const [y, z] of [[0.82, -0.42], [0.82, 0.42], [0.14, -0.42]]) P.box('bare', -W / 2 - 0.2 + (y - 0.47) * 0.24, y, z, 0.05, 0.012, 0.012, { rz: -0.24 });
    }
    M.plateAt(0, 0.08 + wall * 0.55, W / 2 + 0.012, 0.36);
    M.setBay({ x0: -W / 2 + t + 0.01, z0: -W / 2 + t + 0.01, x1: W / 2 - t - 0.01, z1: W / 2 - t - 0.01, y: 0.13, h: wall * 0.85 });
  },
  st_bin(P, M, cut) {
    const W = 1.9, D = 0.9, H = 0.95;
    for (const x of [-0.7, 0.7]) P.box('steel', x, 0.05, 0, 0.12, 0.1, D + 0.06);
    P.box('dark', 0, 0.12, 0, W - 0.1, 0.06, D - 0.1);
    const body = cut ? H * 0.6 : H;
    P.box('paint', 0, 0.15 + body / 2, D / 2 - 0.025, W, body, 0.05); P.box('paint', 0, 0.15 + body / 2, -D / 2 + 0.025, W, body, 0.05);
    P.box('paint', W / 2 - 0.025, 0.15 + body / 2, 0, 0.05, body, D - 0.1); P.box('paint', -W / 2 + 0.025, 0.15 + body / 2, 0, 0.05, body, D - 0.1);
    P.box('dark', 0, 0.17, 0, W - 0.1, 0.04, D - 0.1);
    // stiffener ribs, a hazard band, end handles, forklift pockets
    for (let x = -0.75; x <= 0.76; x += 0.375) for (const z of [D / 2 + 0.015, -D / 2 - 0.015]) P.box('paintPlain', x, 0.15 + body / 2, z, 0.05, body, 0.03);
    P.box('hazard', 0, 0.22, D / 2 + 0.031, W - 0.1, 0.1, 0.005);
    for (const sx of [-1, 1]) { P.box('bare', sx * (W / 2 + 0.04), 0.15 + body * 0.7, 0, 0.03, 0.03, 0.4); for (const z of [-0.18, 0.18]) P.box('bare', sx * (W / 2 + 0.02), 0.15 + body * 0.7, z, 0.04, 0.03, 0.03); }
    for (const x of [-0.45, 0.45]) P.box('dark', x, 0.06, D / 2 + 0.031, 0.3, 0.07, 0.005);
    if (!cut) {
      // two hinged lids: the left shut, the right propped open on its stay
      P.box('paint', -W / 4, 0.15 + H + 0.03, 0, W / 2 - 0.01, 0.05, D + 0.04);
      const a = -0.75;
      P.box('paint', W / 4, 0.15 + H + 0.03 + Math.sin(-a) * D * 0.5, -D / 2 + Math.cos(a) * D * 0.5 + 0.02, W / 2 - 0.01, 0.05, D + 0.04, { rx: a });
      P.box('bare', W / 4 + 0.35, 0.15 + H + 0.25, 0.1, 0.02, 0.5, 0.02, { rx: 0.4 });
      for (const x of [-0.7, -0.2, 0.2, 0.7]) P.cyl('bare', x, 0.15 + H + 0.02, -D / 2 - 0.02, 0.025, 0.025, 0.12, { rz: Math.PI / 2, n: 6 });
    }
    M.plateAt(-0.56, 0.15 + body * 0.58, D / 2 + 0.032, 0.42);
    M.setBay({ x0: -W / 2 + 0.07, z0: -D / 2 + 0.07, x1: W / 2 - 0.07, z1: D / 2 - 0.07, y: 0.2, h: body * 0.8 });
  },
  st_pit(P, M) {
    const W = 1.9, Hh = 0.42;
    // packed earth floor, timber-lined walls, a spoil berm round the outside, corner stakes
    P.box('earth', 0, 0.03, 0, W - 0.1, 0.06, W - 0.1);
    for (const [x, z, w, d] of [[0, W / 2 - 0.04, W, 0.08], [0, -W / 2 + 0.04, W, 0.08], [W / 2 - 0.04, 0, 0.08, W - 0.16], [-W / 2 + 0.04, 0, 0.08, W - 0.16]] as [number, number, number, number][]) P.box('plankWet', x, Hh / 2, z, w, Hh, d);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box('plankOld', sx * (W / 2 - 0.06), Hh / 2 + 0.06, sz * (W / 2 - 0.06), 0.1, Hh + 0.14, 0.1);
    for (const [x, z, w, d, rx, rz] of [[0, W / 2 + 0.12, W + 0.3, 0.3, 0.55, 0], [0, -W / 2 - 0.12, W + 0.3, 0.3, -0.55, 0], [W / 2 + 0.12, 0, 0.3, W, 0, -0.55], [-W / 2 - 0.12, 0, 0.3, W, 0, 0.55]] as [number, number, number, number, number, number][]) P.box('earth', x, 0.08, z, w, 0.22, d, { rx, rz });
    // a sign post with the plate, a shovel leant against it
    P.box('plankOld', W / 2 - 0.25, 0.55, W / 2 + 0.18, 0.07, 1.1, 0.07);
    M.plateAt(W / 2 - 0.25, 0.92, W / 2 + 0.22, 0.46);
    P.box('plank', -W / 2 + 0.3, 0.42, W / 2 + 0.22, 0.04, 0.8, 0.04, { rz: 0.35 });
    P.box('bare', -W / 2 + 0.16, 0.06, W / 2 + 0.22, 0.16, 0.12, 0.03, { rz: 0.35 });
    M.setBay({ x0: -W / 2 + 0.1, z0: -W / 2 + 0.1, x1: W / 2 - 0.1, z1: W / 2 - 0.1, y: 0.06, h: Hh * 0.95 });
  },
  st_bunker(P, M, cut) {
    const W = 1.94, H = cut ? 0.8 : 1.25, t = 0.14;
    P.box('concreteD', 0, 0.05, 0, W, 0.1, W);
    // back and side walls full height, a low front wall for the tipper
    P.box('concrete', 0, H / 2, -W / 2 + t / 2, W, H, t);
    for (const sx of [-1, 1]) P.box('concrete', sx * (W / 2 - t / 2), H / 2, 0.0, t, H, W - 2 * t + 0.001);
    P.box('concrete', 0, 0.28, W / 2 - t / 2, W - 2 * t, 0.56, t);
    // angle-iron caps, wall ties, a ladder at the back, hazard-painted bollards
    P.box('steel', 0, H + 0.015, -W / 2 + t / 2, W + 0.02, 0.03, t + 0.03);
    for (const sx of [-1, 1]) { P.box('steel', sx * (W / 2 - t / 2), H + 0.015, 0, t + 0.03, 0.03, W - 0.1); P.box('hazard', sx * (W / 2 - t / 2), H - 0.06, W / 2 + 0.002, t, 0.1, 0.005); }
    P.box('steel', 0, 0.575, W / 2 - t / 2, W - 2 * t, 0.03, t + 0.03);
    for (const sx of [-1, 1]) { P.cyl('hazard', sx * (W / 2 + 0.12), 0.35, W / 2 + 0.1, 0.06, 0.06, 0.7, { n: 8 }); P.cyl('dark', sx * (W / 2 + 0.12), 0.71, W / 2 + 0.1, 0.065, 0.05, 0.03, { n: 8 }); }
    if (!cut) ladder(P, 0.5, -W / 2 - 0.05, 0.1, H + 0.35, 0);
    M.plateAt(-0.45, 0.33, W / 2 + 0.002, 0.44);
    M.setBay({ x0: -W / 2 + t + 0.02, z0: -W / 2 + t + 0.02, x1: W / 2 - t - 0.02, z1: W / 2 - t - 0.02, y: 0.1, h: 0.62 });
  },
  st_freezer(P, M, cut) {
    const W = 1.9, D = 0.88, H = 1.05;
    P.box('grille', 0, 0.06, 0, W, 0.12, D);
    const body = cut ? H * 0.6 : H;
    // the insulated box: cream panels on a steel frame, a rubber gasket under the lid
    P.box('cream', 0, 0.12 + body / 2, D / 2 - 0.04, W - 0.5, body, 0.08); P.box('cream', 0, 0.12 + body / 2, -D / 2 + 0.04, W - 0.5, body, 0.08);
    P.box('cream', W / 2 - 0.29, 0.12 + body / 2, 0, 0.08, body, D - 0.16); P.box('cream', -W / 2 + 0.04, 0.12 + body / 2, 0, 0.08, body, D - 0.16);
    P.box('frost', -0.22, 0.14, 0, W - 0.56, 0.04, D - 0.16);
    for (const x of [-W / 2 + 0.01, W / 2 - 0.51]) P.box('paint', x, 0.12 + body / 2, D / 2 + 0.005, 0.05, body + 0.02, 0.03);
    P.box('paint', -0.25, 0.14, D / 2 + 0.005, W - 0.5, 0.05, 0.03);
    // the compressor end: a grille box, a fan, copper lines, a valve
    P.box('grille', W / 2 - 0.22, 0.12 + 0.42, 0, 0.42, 0.84, D);
    P.cyl('dark', W / 2 - 0.22, 0.6, D / 2 + 0.01, 0.17, 0.17, 0.02, { rx: Math.PI / 2, n: 12 });
    for (let k = 0; k < 4; k++) P.box('bare', W / 2 - 0.22, 0.6, D / 2 + 0.025, 0.3, 0.025, 0.01, { rz: k * Math.PI / 4 });
    for (const z of [-0.2, 0.2]) P.cyl('copper', W / 2 - 0.47, 0.98, z, 0.022, 0.022, 0.3, { n: 6 });
    P.cyl('copper', W / 2 - 0.3, 1.12, 0, 0.022, 0.022, 0.42, { n: 6, rx: Math.PI / 2 });
    if (!cut) {
      P.box('frost', -0.22, 0.12 + H + 0.05, 0, W - 0.48, 0.1, D + 0.02);
      P.box('rubber', -0.22, 0.12 + H, 0, W - 0.5, 0.025, D + 0.01);
      for (const x of [-0.7, 0.2]) { P.box('bare', x, 0.12 + H - 0.02, D / 2 + 0.05, 0.22, 0.03, 0.04); P.box('bare', x, 0.12 + H + 0.03, D / 2 + 0.05, 0.03, 0.08, 0.04); }
    }
    // a dial thermometer and the power lamp
    P.cyl('dark', W / 2 - 0.55, 0.12 + body * 0.75, D / 2 + 0.02, 0.07, 0.07, 0.02, { rx: Math.PI / 2, n: 10 });
    P.cyl('cream', W / 2 - 0.55, 0.12 + body * 0.75, D / 2 + 0.031, 0.055, 0.055, 0.005, { rx: Math.PI / 2, n: 10 });
    lamp(M, W / 2 - 0.22, 1.0, D / 2 + 0.02, 0.06);
    M.plateAt(-0.45, 0.12 + body * 0.55, D / 2 + 0.022, 0.44);
    M.setBay({ x0: -W / 2 + 0.1, z0: -D / 2 + 0.1, x1: W / 2 - 0.35, z1: D / 2 - 0.1, y: 0.17, h: body * 0.8 });
  },
  st_tank(P, M, cut) {
    const R = 0.84, H = cut ? 1.2 : 2.3, base = 0.18;
    P.cyl('concrete', 0, base / 2, 0, R + 0.1, R + 0.1, base, { n: 20 });
    P.cyl('paint', 0, base + H / 2, 0, R, R, H, { n: 20, open: cut });
    // riveted rings, a domed cap with a manhole, a ladder, a sight glass, pipes and a valve wheel
    for (const y of [0.18, 0.5, 0.82]) if (y * H < H) P.cyl('paintPlain', 0, base + y * H, 0, R + 0.02, R + 0.02, 0.05, { n: 20 });
    if (!cut) {
      P.cyl('paint', 0, base + H + 0.12, 0, R, R * 0.25, 0.24, { n: 20 });
      P.cyl('dark', 0.25, base + H + 0.22, 0.1, 0.16, 0.16, 0.06, { n: 10 });
      P.cyl('bare', 0, base + H + 0.27, 0, 0.05, 0.05, 0.12, { n: 6 });
      ladder(P, -R * 0.72, R * 0.72, base, base + H + 0.2, -Math.PI / 4);
    }
    // the sight glass: a slot in a frame, a gauge behind it that rises with the level
    P.box('dark', R * 0.42, base + H / 2, R * 0.9 + 0.025, 0.12, H * 0.82, 0.03);
    P.box('glass', R * 0.42, base + H / 2, R * 0.9 + 0.035, 0.07, H * 0.78, 0.01);
    gauge(M, R * 0.42, base + H * 0.11, R * 0.9 + 0.045, H * 0.78, 0.05, RAMPS.water[5]);
    for (const y of [0.25, 0.5, 0.75]) P.box('bare', R * 0.42 + 0.07, base + H * 0.11 + H * 0.78 * y, R * 0.9 + 0.04, 0.04, 0.01, 0.01);
    P.cyl('copper', R * 0.6, 0.32, R * 0.6, 0.06, 0.06, 0.5, { n: 8, rx: Math.PI / 2, rz: 0 });
    P.cyl('dark', R * 0.6, 0.32, R * 0.6 + 0.3, 0.1, 0.1, 0.04, { n: 10, rx: Math.PI / 2 });
    P.cyl('stampRed', R * 0.6, 0.32, R * 0.6 + 0.34, 0.12, 0.12, 0.02, { n: 8, rx: Math.PI / 2 });
    M.plateAt(-R * 0.3, base + H * 0.55, R + 0.03, 0.46);
    M.setBay({ x0: -R * 0.7, z0: -R * 0.7, x1: R * 0.7, z1: R * 0.7, y: base + 0.05, h: H * 0.5 });
  },
  silo(P, M, cut) {
    const R = 0.88, H = cut ? 1.6 : 3.2, base = 0.3;
    P.cyl('concrete', 0, 0.08, 0, R + 0.08, R + 0.08, 0.16, { n: 20 });
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; P.box('steel', Math.cos(a) * R * 0.8, base / 2 + 0.08, Math.sin(a) * R * 0.8, 0.1, base, 0.1); }
    P.cyl('corr', 0, base + H / 2 + 0.08, 0, R, R, H, { n: 20, open: cut });
    for (const y of [0.25, 0.5, 0.75]) P.cyl('paintPlain', 0, base + 0.08 + y * H, 0, R + 0.015, R + 0.015, 0.06, { n: 20 });
    if (!cut) {
      P.cyl('paint', 0, base + H + 0.08 + 0.3, 0, R + 0.04, 0.12, 0.6, { n: 20 });
      P.cyl('bare', 0, base + H + 0.08 + 0.66, 0, 0.1, 0.1, 0.14, { n: 8 });
      P.cyl('paint', 0, base + H + 0.08 + 0.76, 0, 0.18, 0.02, 0.1, { n: 8 });
      ladder(P, R * 0.7, R * 0.7, 0.16, base + H + 0.2, Math.PI / 4);
      for (let y = 1.6; y < base + H; y += 0.5) P.cyl('bare', R * 0.82, y, R * 0.82, 0.24, 0.24, 0.025, { n: 10, open: true });
    }
    // the level gauge strip
    P.box('dark', -R * 0.5, base + 0.08 + H / 2, R * 0.87 + 0.03, 0.09, H * 0.85, 0.03);
    gauge(M, -R * 0.5, base + 0.08 + H * 0.075, R * 0.87 + 0.05, H * 0.85, 0.05, RAMPS.glowAmber[3]);
    M.plateAt(R * 0.25, base + 0.6, R * 0.97, 0.42, 0.25);
    M.setBay({ x0: -R * 0.68, z0: -R * 0.68, x1: R * 0.68, z1: R * 0.68, y: base + 0.1, h: H * 0.55 });
  },
  st_cabinet(P, M, cut) {
    const W = 0.86, D = 0.6, H = 1.75;
    P.box('steel', 0, 0.04, 0, W + 0.04, 0.08, D + 0.04);
    P.box('paint', 0, 0.08 + H / 2, -D / 2 + 0.02, W, H, 0.04);
    for (const sx of [-1, 1]) P.box('paint', sx * (W / 2 - 0.02), 0.08 + H / 2, 0, 0.04, H, D);
    P.box('paint', 0, 0.08 + H - 0.02, 0, W, 0.04, D); P.box('paint', 0, 0.1, 0, W, 0.04, D);
    // three glass-fronted shelves of jars, brass handles, card holders
    for (let r = 0; r < 3; r++) {
      const y = 0.12 + r * 0.55;
      P.box('paintPlain', 0, y + 0.01, 0, W - 0.08, 0.025, D - 0.06);
      P.box('paint', 0, y + 0.53, D / 2 - 0.02, W, 0.04, 0.04);
      P.box('brass', 0, y + 0.47, D / 2 + 0.01, 0.16, 0.025, 0.025);
      P.box('cream', -0.28, y + 0.47, D / 2 + 0.002, 0.14, 0.06, 0.005);
    }
    if (!cut) P.box('pane', 0, 0.08 + H / 2, D / 2 - 0.01, W - 0.06, H - 0.1, 0.01);
    P.box('lampAmber', 0, 0.08 + H + 0.03, 0.15, 0.2, 0.03, 0.05);
    lamp(M, W / 2 - 0.08, 0.08 + H + 0.04, D / 2 - 0.06, 0.05);
    M.plateAt(0, 0.08 + H + 0.12, 0, 0.36);
    M.setBay({ x0: -W / 2 + 0.06, z0: -D / 2 + 0.06, x1: W / 2 - 0.06, z1: D / 2 - 0.06, y: 0.13, h: 1.4 });
  },
  st_vault(P, M, cut) {
    const W = 1.94, H = cut ? 0.7 : 1.2;
    // an earth-bermed concrete bunker with a round blast door
    P.box('concreteD', 0, 0.06, 0, W, 0.12, W);
    P.box('concrete', 0, H / 2 + 0.06, -W / 2 + 0.1, W, H, 0.2);
    for (const sx of [-1, 1]) P.box('concrete', sx * (W / 2 - 0.1), H / 2 + 0.06, 0, 0.2, H, W - 0.4);
    P.box('concrete', 0, H / 2 + 0.06, W / 2 - 0.1, W, H, 0.2);
    for (const sx of [-1, 1]) P.box('earth', sx * (W / 2 + 0.05), H * 0.35, -0.1, 0.4, H * 0.7, W - 0.2, { rz: sx * 0.45 });
    if (!cut) {
      P.box('concrete', 0, H + 0.12, 0, W + 0.06, 0.12, W + 0.06);
      P.box('earth', 0, H + 0.24, -0.25, W - 0.3, 0.14, W - 0.8);
      for (const x of [-0.5, 0.5]) { P.cyl('steel', x, H + 0.35, -0.4, 0.07, 0.07, 0.26, { n: 8 }); P.cyl('dark', x, H + 0.5, -0.4, 0.12, 0.12, 0.04, { n: 8 }); }
    }
    // the door: a steel disc on a frame, bolt heads round it, a wheel
    const dy = 0.06 + Math.min(H, 1.2) * 0.45;
    P.cyl('steel', 0, dy, W / 2 + 0.02, 0.42, 0.42, 0.06, { rx: Math.PI / 2, n: 16 });
    P.cyl('paint', 0, dy, W / 2 + 0.055, 0.36, 0.36, 0.03, { rx: Math.PI / 2, n: 16 });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; P.box('bare', Math.cos(a) * 0.39, dy + Math.sin(a) * 0.39, W / 2 + 0.06, 0.04, 0.04, 0.03); }
    P.cyl('bare', 0, dy, W / 2 + 0.1, 0.16, 0.16, 0.025, { rx: Math.PI / 2, n: 10, open: true });
    for (let k = 0; k < 3; k++) P.box('bare', 0, dy, W / 2 + 0.1, 0.32, 0.025, 0.025, { rz: (k * Math.PI) / 3 });
    P.box('hazard', 0, 0.1, W / 2 + 0.002, W - 0.1, 0.08, 0.005);
    lamp(M, 0.6, dy + 0.35, W / 2 + 0.01, 0.06);
    M.plateAt(-0.65, dy + 0.3, W / 2 + 0.002, 0.42);
    M.setBay({ x0: -W / 2 + 0.22, z0: -W / 2 + 0.22, x1: W / 2 - 0.22, z1: W / 2 - 0.22, y: 0.13, h: 0.55 });
  },
  hold(P, M) {
    // the pod's hold as a cargo cassette: an open steel tray with handles and the program shield
    const W = 1.5, D = 0.9, H = 0.42;
    P.box('dark', 0, 0.03, 0, W, 0.06, D);
    for (const [x, z, w, d] of [[0, D / 2 - 0.025, W, 0.05], [0, -D / 2 + 0.025, W, 0.05], [W / 2 - 0.025, 0, 0.05, D - 0.1], [-W / 2 + 0.025, 0, 0.05, D - 0.1]] as [number, number, number, number][]) P.box('olive', x, H / 2, z, w, H, d);
    for (const sx of [-1, 1]) P.box('bare', sx * (W / 2 + 0.03), H * 0.7, 0, 0.03, 0.03, 0.36);
    P.box('hazard', 0, 0.08, D / 2 + 0.002, W - 0.1, 0.06, 0.005);
    M.plateAt(-0.4, H * 0.55, D / 2 + 0.003, 0.36);
    M.setBay({ x0: -W / 2 + 0.06, z0: -D / 2 + 0.06, x1: W / 2 - 0.06, z1: D / 2 - 0.06, y: 0.06, h: H * 0.85 });
  },
};
/** the footprint a kind's model is built for (metres) */
export const footOf = (k: ContainerKind): [number, number] => (k === 'hold' ? [1.5, 0.9] : KIND_INFO[k].foot);
void PAINTS;
