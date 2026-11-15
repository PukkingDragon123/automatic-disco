// A small modelling kit for the colony hardware (pod, arms, drones, masts, crew suits): primitives placed with a
// transform, collected per material and merged into one mesh per material, so a detailed machine stays a handful of
// draw calls. Every material goes through gbuf (gfx/gbuf.ts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { gbuf, type GFlag } from '../gfx/gbuf';

export const TAU = Math.PI * 2;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export interface StdOpts { map?: THREE.Texture | null; bump?: THREE.Texture | null; bumpScale?: number; rough?: number; metal?: number; emissive?: number; emissiveI?: number; emissiveMap?: THREE.Texture | null; side?: THREE.Side; flat?: boolean; transparent?: boolean; opacity?: number; flag?: number | GFlag; alphaTest?: number; roughMap?: THREE.Texture | null }
/** a lit material for hardware (standard PBR, low metalness: painted steel) */
export function std(color: number, o: StdOpts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, map: o.map ?? null, bumpMap: o.bump ?? null, bumpScale: o.bumpScale ?? 1.2, roughness: o.rough ?? 0.62, metalness: o.metal ?? 0.18,
    roughnessMap: o.roughMap ?? null,
    emissive: new THREE.Color(o.emissive ?? 0), emissiveIntensity: o.emissiveI ?? 1, emissiveMap: o.emissiveMap ?? null,
    side: o.side ?? THREE.FrontSide, flatShading: !!o.flat, transparent: !!o.transparent, opacity: o.opacity ?? 1, alphaTest: o.alphaTest ?? 0,
  });
  gbuf(m, o.flag ?? 1);
  return m;
}
/** an unlit glowing material (lamps, lenses, screens) */
export function glow(color: number, k = 1.6, o: { transparent?: boolean; opacity?: number; additive?: boolean; map?: THREE.Texture | null } = {}) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), transparent: !!o.transparent || !!o.additive, opacity: o.opacity ?? 1, map: o.map ?? null, depthWrite: !o.additive, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: false });
  gbuf(m, o.transparent || o.additive ? 0 : 33);
  return m;
}

/** transform shorthand: position, Euler rotation, scale */
export interface T { p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] | number; q?: THREE.Quaternion }
function mat4(t: T) {
  _p.set(...(t.p ?? [0, 0, 0]));
  if (t.q) _q.copy(t.q); else _q.setFromEuler(_e.set(...(t.r ?? [0, 0, 0])));
  const s = t.s ?? 1; if (typeof s === 'number') _s.set(s, s, s); else _s.set(...s);
  return _m.compose(_p, _q, _s);
}

export class Kit {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  tris = 0;
  /** an extra transform applied to everything added while set (build a sub-assembly in its own frame) */
  frame: THREE.Matrix4 | null = null;
  add(geo: THREE.BufferGeometry, mat: THREE.Material, t: T = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    g.applyMatrix4(mat4(t));
    if (this.frame) g.applyMatrix4(this.frame);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    let l = this.parts.get(mat); if (!l) this.parts.set(mat, (l = []));
    l.push(g); this.tris += g.getAttribute('position').count / 3;
    if (geo !== g) geo.dispose();
    return this;
  }
  box(w: number, h: number, d: number, mat: THREE.Material, t: T = {}) { return this.add(new THREE.BoxGeometry(w, h, d), mat, t); }
  cyl(rt: number, rb: number, h: number, mat: THREE.Material, t: T = {}, seg = 16, open = false) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat, t); }
  sph(r: number, mat: THREE.Material, t: T = {}, ws = 14, hs = 10, phiLen = TAU, thStart = 0, thLen = Math.PI) { return this.add(new THREE.SphereGeometry(r, ws, hs, 0, phiLen, thStart, thLen), mat, t); }
  tor(r: number, tube: number, mat: THREE.Material, t: T = {}, rs = 8, ts = 20, arc = TAU) { return this.add(new THREE.TorusGeometry(r, tube, rs, ts, arc), mat, t); }
  cone(r: number, h: number, mat: THREE.Material, t: T = {}, seg = 12) { return this.add(new THREE.ConeGeometry(r, h, seg), mat, t); }
  lathe(pts: [number, number][], mat: THREE.Material, t: T = {}, seg = 20) { return this.add(new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg), mat, t); }
  /** a tube between two points (pipes, struts, rails) */
  rod(a: [number, number, number], b: [number, number, number], r: number, mat: THREE.Material, seg = 8) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), L = A.distanceTo(B);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    const m = A.clone().add(B).multiplyScalar(0.5);
    return this.add(new THREE.CylinderGeometry(r, r, L, seg, 1, false), mat, { p: [m.x, m.y, m.z], q });
  }
  /** a square beam between two points */
  beam(a: [number, number, number], b: [number, number, number], w: number, h: number, mat: THREE.Material, up = new THREE.Vector3(0, 1, 0)) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length(); d.normalize();
    const x = new THREE.Vector3().crossVectors(up, d); if (x.lengthSq() < 1e-6) x.set(1, 0, 0); x.normalize();
    const y = new THREE.Vector3().crossVectors(d, x).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, d));
    const m = A.clone().add(B).multiplyScalar(0.5);
    return this.add(new THREE.BoxGeometry(w, h, L), mat, { p: [m.x, m.y, m.z], q });
  }
  /** a curved pipe through points (a tube along a Catmull-Rom curve) */
  pipe(pts: [number, number, number][], r: number, mat: THREE.Material, seg = 24, rs = 6) {
    const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    return this.add(new THREE.TubeGeometry(c, seg, r, rs, false), mat);
  }
  /** merge into one mesh per material under a group */
  build(name = 'kit', shadow = true): THREE.Group {
    const g = new THREE.Group(); g.name = name;
    for (const [mat, list] of this.parts) {
      const geo = mergeGeometries(list, false);
      for (const x of list) x.dispose();
      if (!geo) continue;
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      const transparent = (mat as THREE.Material).transparent || (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial;
      m.castShadow = shadow && !transparent; m.receiveShadow = !transparent;
      g.add(m);
    }
    this.parts.clear();
    return g;
  }
}

/** spread the geometry's UVs as a cylindrical projection around Y (for hull panels that wrap) */
export function cylUV(geo: THREE.BufferGeometry, perMeterU: number, perMeterV: number, r: number) {
  const p = geo.getAttribute('position'), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let a = Math.atan2(x, z) / TAU + 0.5;
    uv[i * 2] = a * TAU * r * perMeterU; uv[i * 2 + 1] = y * perMeterV;
  }
  // fix the seam: faces that straddle u = 0/1
  if (!geo.index) for (let i = 0; i < p.count; i += 3) {
    const u0 = uv[i * 2], u1 = uv[i * 2 + 2], u2 = uv[i * 2 + 4], span = TAU * r * perMeterU;
    const mx = Math.max(u0, u1, u2);
    for (let k = 0; k < 3; k++) if (mx - uv[(i + k) * 2] > span * 0.5) uv[(i + k) * 2] += span;
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/** a hull ring: a frustum from (r0, y0) to (r1, y1) with cylindrical UVs */
export function hullRing(r0: number, y0: number, r1: number, y1: number, seg = 32, uPerM = 0.25, vPerM = 0.25, open = true) {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, open).toNonIndexed();
  g.translate(0, (y0 + y1) / 2, 0);
  return cylUV(g, uPerM, vPerM, (r0 + r1) / 2);
}

export const rand = (s: number) => { const v = Math.sin(s * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
