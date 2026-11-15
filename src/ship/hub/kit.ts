// Building blocks for the ship hub: a material library (physically based, every material through gbuf), a batch
// that merges static parts per material (one draw call per material per room), box-projected UVs so painted
// textures keep the same texel size on every part, and small shape helpers (chamfered boxes, cylinders, tubes
// along paths, extrusions). Everything the hub creates is owned by a Bin and freed with it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gbuf, F_EMIT } from '../../gfx/gbuf';

export const V3 = THREE.Vector3;
export type V = THREE.Vector3;

export class Bin {
  private geos = new Set<THREE.BufferGeometry>(); private mats = new Set<THREE.Material>(); private texs = new Set<THREE.Texture>();
  private fns: (() => void)[] = [];
  g<T extends THREE.BufferGeometry>(g: T) { this.geos.add(g); return g; }
  m<T extends THREE.Material>(m: T) { this.mats.add(m); return m; }
  t<T extends THREE.Texture>(t: T) { this.texs.add(t); return t; }
  on(f: () => void) { this.fns.push(f); }
  dispose() { this.geos.forEach((g) => g.dispose()); this.mats.forEach((m) => m.dispose()); this.texs.forEach((t) => t.dispose()); this.fns.forEach((f) => f()); this.geos.clear(); this.mats.clear(); this.texs.clear(); this.fns = []; }
}

// ------------------------------------------------------------------ materials
export interface MatOpts {
  color?: number; map?: THREE.Texture | null; rough?: number; metal?: number; emissive?: number; emissiveK?: number; emissiveMap?: THREE.Texture | null;
  side?: THREE.Side; transparent?: boolean; opacity?: number; flag?: number; alphaTest?: number; flat?: boolean; polyOffset?: number; depthWrite?: boolean;
  /** UV repeat applied in the shader-free way: the geometry's UVs are in metres x this */
  env?: number;
}
export class Mats {
  private c = new Map<string, THREE.Material>();
  env: THREE.Texture | null = null;
  constructor(readonly bin: Bin) {}
  get(key: string, o: MatOpts): THREE.MeshLambertMaterial {
    let m = this.c.get(key) as THREE.MeshLambertMaterial | undefined;
    if (m) return m;
    // matte, like LIMBOPHOBIA's world material: pixel-art maps carry the shading, the lights carry the mood
    m = new THREE.MeshLambertMaterial({
      color: o.color ?? 0xffffff, map: o.map ?? null,
      emissive: o.emissive !== undefined ? new THREE.Color(o.emissive).multiplyScalar(o.emissiveK ?? 1) : new THREE.Color(0), emissiveMap: o.emissiveMap ?? null,
      side: o.side ?? THREE.FrontSide, transparent: !!o.transparent, opacity: o.opacity ?? 1, alphaTest: o.alphaTest ?? 0, flatShading: !!o.flat,
      depthWrite: o.depthWrite ?? !o.transparent,
    });
    if (o.polyOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -o.polyOffset; m.polygonOffsetUnits = -o.polyOffset * 2; }
    gbuf(m, o.flag ?? (o.transparent ? 0 : 1));
    this.c.set(key, m); this.bin.m(m);
    return m;
  }
  /** an unlit glow (screens, lamps, LEDs): blooms (emitter flag), no outline */
  glow(key: string, color: number, k = 1.6, map: THREE.Texture | null = null, o: { transparent?: boolean; side?: THREE.Side; outline?: boolean } = {}) {
    let m = this.c.get('glow|' + key) as THREE.MeshBasicMaterial | undefined;
    if (m) return m;
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), map, transparent: !!o.transparent, side: o.side ?? THREE.FrontSide, depthWrite: !o.transparent });
    gbuf(m, F_EMIT + (o.outline ? 1 : 0));
    this.c.set('glow|' + key, m); this.bin.m(m);
    return m;
  }
  /** a lit material whose colour can be driven (status lights, alarm lamps): returned uncached */
  live(color: number, k = 1.5) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
    gbuf(m, F_EMIT); this.bin.m(m); return m;
  }
}

// ------------------------------------------------------------------ uv
/**
 * Box-projected UVs in metres x density: each vertex takes the two axes across its dominant normal, so tiling
 * textures keep the same texel size on every part, and walls keep "up" up.
 */
export function boxUV(geo: THREE.BufferGeometry, density = 1, ox = 0, oy = 0) {
  const p = geo.attributes.position as THREE.BufferAttribute, n = geo.attributes.normal as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i) * (n.getY(i) > 0 ? -1 : 1); }
    else if (ax >= az) { u = p.getZ(i) * (n.getX(i) > 0 ? -1 : 1); v = p.getY(i); }
    else { u = p.getX(i) * (n.getZ(i) > 0 ? 1 : -1); v = p.getY(i); }
    uv[i * 2] = u * density + ox; uv[i * 2 + 1] = v * density + oy;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ------------------------------------------------------------------ batching
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new V3(), _p = new V3();
export interface Place { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; s?: number; sx?: number; sy?: number; sz?: number }
export function placeMatrix(o: Place, out = new THREE.Matrix4()) {
  _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0); _q.setFromEuler(_e);
  _s.set(o.sx ?? o.s ?? 1, o.sy ?? o.s ?? 1, o.sz ?? o.s ?? 1); _p.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  return out.compose(_p, _q, _s);
}

/** merges static parts per material; a transform stack places sub-assemblies */
export class Batch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private st: THREE.Matrix4[] = [];
  M = new THREE.Matrix4();
  shadows = true;
  constructor(readonly bin: Bin) {}
  push(o: Place | THREE.Matrix4) { this.st.push(this.M.clone()); this.M.multiply(o instanceof THREE.Matrix4 ? o : placeMatrix(o, _m)); return this; }
  pop() { this.M.copy(this.st.pop()!); return this; }
  in(o: Place, f: () => void) { this.push(o); f(); this.pop(); }
  /** add a geometry (consumed: it is transformed and merged) at a local placement */
  add(geo: THREE.BufferGeometry, mat: THREE.Material, o?: Place) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (!g.attributes.uv) boxUV(g, 1);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    const m = o ? _m.copy(this.M).multiply(placeMatrix(o, new THREE.Matrix4())) : this.M;
    g.applyMatrix4(m);
    let a = this.parts.get(mat); if (!a) this.parts.set(mat, (a = []));
    a.push(g);
    return this;
  }
  get empty() { return this.parts.size === 0; }
  /** build one mesh per material under parent */
  flush(parent: THREE.Object3D, name = 'batch') {
    const out: THREE.Mesh[] = [];
    for (const [mat, geos] of this.parts) {
      const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (geos.length > 1) geos.forEach((x) => x.dispose());
      if (!g) continue;
      g.computeBoundingSphere(); g.computeBoundingBox();
      const me = new THREE.Mesh(this.bin.g(g), mat); me.name = name;
      const tr = (mat as THREE.MeshStandardMaterial).transparent;
      me.castShadow = this.shadows && !tr && !(mat as any).isMeshBasicMaterial; me.receiveShadow = !tr;
      me.matrixAutoUpdate = false; me.updateMatrix();
      parent.add(me); out.push(me);
    }
    this.parts.clear();
    return out;
  }
}

// ------------------------------------------------------------------ shapes (unit density uvs; Batch.add re-projects when missing)
/** a box, optionally chamfered (r > 0: a rounded-box with one segment = a crisp 45 degree bevel) with metre uvs */
export function box(w: number, h: number, d: number, bev = 0, density = 1) {
  const g = bev > 0 ? new RoundedBoxGeometry(w, h, d, 1, Math.min(bev, w / 2.1, h / 2.1, d / 2.1)) : new THREE.BoxGeometry(w, h, d);
  return boxUV(g, density);
}
/** a cylinder along y */
export function cyl(rt: number, rb: number, h: number, seg = 16, open = false, density = 1) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  // wrap uv around in metres
  const uv = g.attributes.uv as THREE.BufferAttribute, C = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * C * density, uv.getY(i) * h * density);
  return g;
}
/** a tube along a polyline (cables, pipes), radius r */
export function tube(pts: V[], r: number, seg = 6, smooth = true, density = 1) {
  const curve = smooth && pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.2) : new THREE.CurvePath<THREE.Vector3>();
  if (!(smooth && pts.length > 2)) for (let i = 0; i < pts.length - 1; i++) (curve as THREE.CurvePath<THREE.Vector3>).add(new THREE.LineCurve3(pts[i], pts[i + 1]));
  let len = 0; for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  const g = new THREE.TubeGeometry(curve as THREE.Curve<THREE.Vector3>, Math.max(2, Math.round(len * 6)), r, seg, false);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len * density, uv.getY(i) * Math.PI * 2 * r * density);
  return g;
}
/** an extruded 2D outline (x, y pairs) along z by depth, centred on z, chamfered */
export function extrude(pts: [number, number][], depth: number, bev = 0) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelSize: bev, bevelThickness: bev, bevelSegments: 1, steps: 1 });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return boxUV(g, 1);
}
/** a flat quad facing +z (decals, screens, posters), w x h, uv 0..1 */
export function quad(w: number, h: number) { return new THREE.PlaneGeometry(w, h); }
/** a lathe around y from (r, y) pairs */
export function lathe(prof: [number, number][], seg = 16) {
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  return boxUV(g, 1);
}
