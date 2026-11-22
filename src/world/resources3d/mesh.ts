// A small low-poly modelling kit for the resource models. Parts are collected per material and merged, so a model
// (or a whole pile) is a handful of draw calls. Faces are flat (facet-lit) unless asked to be smooth; UVs are in
// metres so every surface keeps the texture's density (32 px/m in the world, finer for an icon). Primitives: faceted
// prisms (logs, rods, stalks) with jittered radii and tapered or pointed ends, chamfered boxes, convex hulls (rocks,
// chunks, crystals), lathed profiles (fruit, bottles, cans, cones), mounds (heaps of loose earth), concentric ring
// discs (end grain) and any three.js geometry.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { H } from './paint';

export type MatKey = string;
interface Part { p: number[]; n: number[]; uv: number[] }
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
type V3 = [number, number, number];
/** a seeded random stream */
export class Rnd {
  private s: number;
  constructor(seed: number) { this.s = (seed * 2654435761) >>> 0 || 1; }
  next() { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return (this.s % 100000) / 100000; }
  r(a = 0, b = 1) { return a + (b - a) * this.next(); }
  i(a: number, b: number) { return Math.floor(this.r(a, b + 1)); }
  pick<T>(xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length) % xs.length]; }
}

export class Mesher {
  readonly parts = new Map<MatKey, Part>();
  /** the current placement */
  m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private stack: THREE.Matrix4[] = [];
  /** texture offset for this placement (metres), so repeated parts do not show the same patch */
  uo = 0; vo = 0;
  private part(k: MatKey) { let p = this.parts.get(k); if (!p) { p = { p: [], n: [], uv: [] }; this.parts.set(k, p); } return p; }
  /** run f with a placement composed onto the current one */
  at(pos: V3, rot: V3 = [0, 0, 0], scale: number | V3 = 1, f: () => void, order: THREE.EulerOrder = 'XYZ') {
    this.stack.push(this.m.clone());
    _e.set(rot[0], rot[1], rot[2], order); _q.setFromEuler(_e);
    const sc = typeof scale === 'number' ? _s.set(scale, scale, scale) : _s.set(scale[0], scale[1], scale[2]);
    this.m = this.m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...pos), _q.clone(), sc.clone()));
    const uo = this.uo, vo = this.vo;
    try { f(); } finally { this.m = this.stack.pop()!; this.uo = uo; this.vo = vo; }
  }
  /** a placement from a full matrix */
  with(mat: THREE.Matrix4, f: () => void) { this.stack.push(this.m.clone()); this.m = this.m.clone().multiply(mat); try { f(); } finally { this.m = this.stack.pop()!; } }
  /** one triangle in local coordinates; flat normal unless normals are given */
  tri(k: MatKey, a: V3, b: V3, c: V3, ua: [number, number], ub: [number, number], uc: [number, number], na?: V3, nb?: V3, nc?: V3) {
    const P = this.part(k);
    this.nm.getNormalMatrix(this.m);
    const A = _a.set(...a).applyMatrix4(this.m), B = _b.set(...b).applyMatrix4(this.m), Cc = _c.set(...c).applyMatrix4(this.m);
    if (!na) {
      _n.subVectors(B, A).cross(_v.subVectors(Cc, A)).normalize();
      for (const q of [A, B, Cc]) { P.p.push(q.x, q.y, q.z); P.n.push(_n.x, _n.y, _n.z); }
    } else {
      P.p.push(A.x, A.y, A.z, B.x, B.y, B.z, Cc.x, Cc.y, Cc.z);
      for (const nn of [na, nb!, nc!]) { _n.set(...nn).applyMatrix3(this.nm).normalize(); P.n.push(_n.x, _n.y, _n.z); }
    }
    P.uv.push(ua[0] + this.uo, ua[1] + this.vo, ub[0] + this.uo, ub[1] + this.vo, uc[0] + this.uo, uc[1] + this.vo);
  }
  /** a triangle with planar UVs from its own dominant axis (metres) */
  ptri(k: MatKey, a: V3, b: V3, c: V3) {
    _a.set(...a); _b.set(...b); _c.set(...c);
    _n.subVectors(_b, _a).cross(_v.subVectors(_c, _a));
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    const uv = (p: V3): [number, number] => ay >= ax && ay >= az ? [p[0], p[2]] : ax >= az ? [p[2], -p[1]] : [p[0], -p[1]];
    this.tri(k, a, b, c, uv(a), uv(b), uv(c));
  }
  quad(k: MatKey, a: V3, b: V3, c: V3, d: V3, ua: [number, number], ub: [number, number], uc: [number, number], ud: [number, number]) { this.tri(k, a, b, c, ua, ub, uc); this.tri(k, a, c, d, ua, uc, ud); }

  /** a prism along +y from y = 0 to len: n sides, radius r0 at the base and r1 at the top, each ring jittered; caps
   *  flat (capMat) or pointed (tip > 0); smooth sides for round things */
  prism(k: MatKey, o: { n?: number; r0: number; r1?: number; len: number; rings?: number; jit?: number; seed?: number; cap0?: MatKey | null; cap1?: MatKey | null; tip0?: number; tip1?: number; smooth?: boolean; bend?: number; ry?: number; sq?: number; rot?: number }) {
    const n = o.n ?? 7, R = o.rings ?? 1, rnd = new Rnd(o.seed ?? 1), jit = o.jit ?? 0, r1 = o.r1 ?? o.r0, sq = o.sq ?? 1, rot = o.rot ?? rnd.r(0, Math.PI * 2);
    const ring: V3[][] = [];
    const rad: number[][] = [];
    for (let j = 0; j <= R; j++) {
      const t = j / R, y = t * o.len, r = o.r0 + (r1 - o.r0) * t, bx = (o.bend ?? 0) * Math.sin(t * Math.PI) * o.len;
      const row: V3[] = [], rr: number[] = [];
      for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2, k2 = 1 + (rnd.next() - 0.5) * 2 * jit; rr.push(r * k2); row.push([Math.cos(a) * r * k2 + bx, y, Math.sin(a) * r * k2 * sq]); }
      ring.push(row); rad.push(rr);
    }
    const circ = Math.PI * 2 * Math.max(o.r0, r1);
    for (let j = 0; j < R; j++) for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n, a = ring[j][i], b = ring[j][i2], c = ring[j + 1][i2], d = ring[j + 1][i];
      const u0 = (i / n) * circ, u1 = ((i + 1) / n) * circ;
      if (o.smooth) {
        const nr = (p: V3): V3 => { const l = Math.hypot(p[0], p[2] / sq) || 1; return [p[0] / l, (o.r0 - r1) / o.len, p[2] / sq / l]; };
        this.tri(k, a, c, b, [u0, a[1]], [u1, c[1]], [u1, b[1]], nr(a), nr(c), nr(b));
        this.tri(k, a, d, c, [u0, a[1]], [u0, d[1]], [u1, c[1]], nr(a), nr(d), nr(c));
      } else { this.tri(k, a, c, b, [u0, a[1]], [u1, c[1]], [u1, b[1]]); this.tri(k, a, d, c, [u0, a[1]], [u0, d[1]], [u1, c[1]]); }
    }
    const cap = (j: number, mat: MatKey | null | undefined, tip: number | undefined, down: boolean) => {
      const row = ring[j], y = row[0][1];
      if (tip && tip > 0) { const ap: V3 = [row.reduce((s, p) => s + p[0], 0) / n, y + (down ? -tip : tip), 0]; for (let i = 0; i < n; i++) { const a = row[i], b = row[(i + 1) % n]; if (down) this.ptri(mat ?? k, a, b, ap); else this.ptri(mat ?? k, b, a, ap); } return; }
      if (mat === null) return;
      const cx = row.reduce((s, p) => s + p[0], 0) / n, cz = row.reduce((s, p) => s + p[2], 0) / n;
      for (let i = 0; i < n; i++) { const a = row[i], b = row[(i + 1) % n], cc: V3 = [cx, y, cz]; const uv = (p: V3): [number, number] => [p[0], p[2]]; if (down) this.tri(mat ?? k, a, b, cc, uv(a), uv(b), uv(cc)); else this.tri(mat ?? k, b, a, cc, uv(b), uv(a), uv(cc)); }
    };
    cap(0, o.cap0, o.tip0, true); cap(R, o.cap1, o.tip1, false);
    return { ring, rad };
  }
  /** concentric rings on the disc of a prism end (end grain): radii outward, one material each; y = 0, facing +y or -y */
  rings(mats: MatKey[], radii: number[], o: { n?: number; seed?: number; down?: boolean; y?: number; rot?: number; jit?: number } = {}) {
    const n = o.n ?? 7, rnd = new Rnd(o.seed ?? 3), y = o.y ?? 0, rot = o.rot ?? 0, jit = o.jit ?? 0.08;
    const off: number[] = []; for (let i = 0; i < n; i++) off.push(1 + (rnd.next() - 0.5) * 2 * jit);
    const P = (r: number, i: number): V3 => { const a = rot + (i / n) * Math.PI * 2; return [Math.cos(a) * r * off[i % n], y, Math.sin(a) * r * off[i % n]]; };
    const uv = (p: V3): [number, number] => [p[0], p[2]];
    for (let ri = 0; ri < radii.length; ri++) {
      const r0 = ri ? radii[ri - 1] : 0, r1 = radii[ri], k = mats[ri];
      for (let i = 0; i < n; i++) {
        const a1 = P(r1, i), b1 = P(r1, i + 1);
        if (!r0) { const c0: V3 = [0, y, 0]; if (o.down) this.tri(k, a1, b1, c0, uv(a1), uv(b1), uv(c0)); else this.tri(k, b1, a1, c0, uv(b1), uv(a1), uv(c0)); continue; }
        const a0 = P(r0, i), b0 = P(r0, i + 1);
        if (o.down) { this.tri(k, a0, a1, b1, uv(a0), uv(a1), uv(b1)); this.tri(k, a0, b1, b0, uv(a0), uv(b1), uv(b0)); }
        else { this.tri(k, a0, b1, a1, uv(a0), uv(b1), uv(a1)); this.tri(k, a0, b0, b1, uv(a0), uv(b0), uv(b1)); }
      }
    }
  }
  /** a box centred on the origin, its corners chamfered by c (0 = sharp) */
  box(k: MatKey, w: number, h: number, d: number, c = 0, o: { top?: MatKey; side?: MatKey; jit?: number; seed?: number } = {}) {
    const x = w / 2, y = h / 2, z = d / 2;
    if (c <= 0) {
      const f = (mat: MatKey, a: V3, b: V3, cc: V3, dd: V3) => { this.ptri(mat, a, b, cc); this.ptri(mat, a, cc, dd); };
      const T = o.top ?? k, S = o.side ?? k;
      f(T, [-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]); f(k, [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]);
      f(S, [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]); f(S, [x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]);
      f(k, [x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]); f(k, [-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]);
      return;
    }
    // a chamfered box as the hull of its cut corners
    const pts: THREE.Vector3[] = [], rnd = new Rnd(o.seed ?? 5), j = o.jit ?? 0;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const J = () => 1 + (rnd.next() - 0.5) * j;
      pts.push(new THREE.Vector3(sx * (x - c) * J(), sy * y, sz * (z - c) * J()), new THREE.Vector3(sx * x, sy * (y - c) * J(), sz * (z - c) * J()), new THREE.Vector3(sx * (x - c) * J(), sy * (y - c), sz * z));
    }
    this.hull(k, pts, o.top);
  }
  /** the convex hull of points: flat facets, planar UVs; faces turned up within ~35 degrees take `top` */
  hull(k: MatKey, pts: THREE.Vector3[], top?: MatKey) {
    const g = new ConvexGeometry(pts);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) {
      const a: V3 = [p.getX(i), p.getY(i), p.getZ(i)], b: V3 = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)], c: V3 = [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)];
      let mat = k;
      if (top) { _a.set(...a); _b.set(...b); _c.set(...c); _n.subVectors(_b, _a).cross(_v.subVectors(_c, _a)).normalize(); if (_n.y > 0.82) mat = top; }
      this.ptri(mat, a, b, c);
    }
    g.dispose();
  }
  /** a rock: the hull of points on a squashed, jittered ellipsoid; n points (more = rounder) */
  rock(k: MatKey, rx: number, ry: number, rz: number, seed: number, o: { n?: number; jag?: number; flat?: number; top?: MatKey } = {}) {
    const rnd = new Rnd(seed), n = o.n ?? 14, jag = o.jag ?? 0.25, pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      // a fibonacci sphere, jittered: points spread evenly, so facets come out of even size
      const t = (i + 0.5) / n, phi = Math.acos(1 - 2 * t), th = Math.PI * (1 + Math.sqrt(5)) * i + rnd.r(-0.4, 0.4);
      const k2 = 1 + (rnd.next() - 0.5) * 2 * jag;
      let y = Math.cos(phi) * ry * k2;
      if (o.flat && y < -ry * (1 - o.flat)) y = -ry * (1 - o.flat);
      pts.push(new THREE.Vector3(Math.sin(phi) * Math.cos(th) * rx * k2, y, Math.sin(phi) * Math.sin(th) * rz * k2));
    }
    this.hull(k, pts, o.top);
  }
  /** a crystal: an n-sided prism of radius r and height h with a pyramid tip (along +y from the origin) */
  crystal(k: MatKey, r: number, h: number, o: { n?: number; tip?: number; seed?: number; tipMat?: MatKey; base?: number } = {}) {
    const n = o.n ?? 6, tip = o.tip ?? r * 1.6, rnd = new Rnd(o.seed ?? 9), pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd.r(-0.12, 0.12), rr = r * rnd.r(0.85, 1.1); pts.push(new THREE.Vector3(Math.cos(a) * rr * (o.base ?? 1), 0, Math.sin(a) * rr * (o.base ?? 1)), new THREE.Vector3(Math.cos(a) * rr, h - tip, Math.sin(a) * rr)); }
    pts.push(new THREE.Vector3(rnd.r(-0.15, 0.15) * r, h, rnd.r(-0.15, 0.15) * r));
    this.hull(k, pts);
  }
  /** a lathed profile [radius, y] from the bottom up: n segments round */
  lathe(k: MatKey | ((j: number) => MatKey), prof: [number, number][], o: { n?: number; smooth?: boolean; seed?: number; jit?: number; sq?: number } = {}) {
    const n = o.n ?? 10, rnd = new Rnd(o.seed ?? 2), jit = o.jit ?? 0, sq = o.sq ?? 1;
    const off: number[] = []; for (let i = 0; i < n; i++) off.push(1 + (rnd.next() - 0.5) * 2 * jit);
    let arc = 0; const vs = [0]; for (let j = 1; j < prof.length; j++) { arc += Math.hypot(prof[j][0] - prof[j - 1][0], prof[j][1] - prof[j - 1][1]); vs.push(arc); }
    const rmax = Math.max(...prof.map((q) => q[0])), circ = Math.PI * 2 * rmax;
    const P = (j: number, i: number): V3 => { const a = (i / n) * Math.PI * 2, r = prof[j][0] * off[i % n]; return [Math.cos(a) * r, prof[j][1], Math.sin(a) * r * sq]; };
    const N = (j: number, i: number): V3 => {
      const a = (i / n) * Math.PI * 2, j0 = Math.max(0, j - 1), j1 = Math.min(prof.length - 1, j + 1);
      const dr = prof[j1][0] - prof[j0][0], dy = prof[j1][1] - prof[j0][1], l = Math.hypot(dr, dy) || 1;
      return [Math.cos(a) * dy / l, -dr / l, Math.sin(a) * dy / l / sq];
    };
    for (let j = 0; j + 1 < prof.length; j++) {
      const mat = typeof k === 'function' ? k(j) : k;
      for (let i = 0; i < n; i++) {
        const a = P(j, i), b = P(j, i + 1), c = P(j + 1, i + 1), d = P(j + 1, i);
        const u0 = (i / n) * circ, u1 = ((i + 1) / n) * circ;
        const degenerate0 = prof[j][0] < 1e-5, degenerate1 = prof[j + 1][0] < 1e-5;
        if (o.smooth) {
          if (!degenerate0) this.tri(mat, a, c, b, [u0, vs[j]], [u1, vs[j + 1]], [u1, vs[j]], N(j, i), N(j + 1, i + 1), N(j, i + 1));
          if (!degenerate1) this.tri(mat, a, d, c, [u0, vs[j]], [u0, vs[j + 1]], [u1, vs[j + 1]], N(j, i), N(j + 1, i), N(j + 1, i + 1));
        } else {
          if (!degenerate0) this.tri(mat, a, c, b, [u0, vs[j]], [u1, vs[j + 1]], [u1, vs[j]]);
          if (!degenerate1) this.tri(mat, a, d, c, [u0, vs[j]], [u0, vs[j + 1]], [u1, vs[j + 1]]);
        }
      }
    }
  }
  /** a heap of loose material: radius r, height h, lumpy, slumped to a rounded crown; base at y = 0 */
  mound(k: MatKey, r: number, h: number, seed: number, o: { rz?: number; rings?: number; n?: number; lump?: number; peak?: number } = {}) {
    const rnd = new Rnd(seed), RN = o.rings ?? 5, n = o.n ?? 14, rz = o.rz ?? r, lump = o.lump ?? 0.12;
    const prof = (t: number) => { const s = 1 - t; return h * Math.pow(Math.max(0, 1 - Math.pow(t, o.peak ?? 1.6)), 0.85) * (0.75 + 0.25 * s); };
    const off: number[][] = [];
    for (let j = 0; j <= RN; j++) { const row: number[] = []; for (let i = 0; i < n; i++) row.push(j === RN ? 0 : (rnd.next() - 0.5) * 2 * lump); off.push(row); }
    const P = (j: number, i: number): V3 => {
      if (j === 0) return [0, prof(0) * (1 + off[0][0] * 0.3), 0];
      const t = j / RN, a = (i / n) * Math.PI * 2 + (j % 2) * (Math.PI / n), e = 1 + off[j][i % n];
      return [Math.cos(a) * r * t * e, j === RN ? 0 : prof(t) * (1 + off[j][(i + 3) % n] * 0.6), Math.sin(a) * rz * t * e];
    };
    for (let j = 0; j < RN; j++) for (let i = 0; i < n; i++) {
      if (j === 0) { this.ptri(k, P(0, 0), P(1, i + 1), P(1, i)); continue; }
      const a = P(j, i), b = P(j, i + 1), c = P(j + 1, i + 1), d = P(j + 1, i);
      if (j % 2) { this.ptri(k, a, b, c); this.ptri(k, a, c, d); } else { this.ptri(k, a, b, d); this.ptri(k, b, c, d); }
    }
  }
  /** any three.js geometry, flat facets, planar UVs */
  geo(k: MatKey, g: THREE.BufferGeometry) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i += 3) this.ptri(k, [p.getX(i), p.getY(i), p.getZ(i)], [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)], [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)]);
    if (ng !== g) ng.dispose();
    g.dispose();
  }
  /** a thin flat card (leaf, paper, wing): a polygon in the xz plane, both faces */
  card(k: MatKey, pts: [number, number][], o: { back?: MatKey; lift?: (x: number, z: number) => number } = {}) {
    const lift = o.lift ?? (() => 0), cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const c: V3 = [cx, lift(cx, cz), cz];
    for (let i = 0; i < pts.length; i++) {
      const a: V3 = [pts[i][0], lift(pts[i][0], pts[i][1]), pts[i][1]], b: V3 = [pts[(i + 1) % pts.length][0], lift(pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1]), pts[(i + 1) % pts.length][1]];
      this.tri(k, a, c, b, [a[0], a[2]], [c[0], c[2]], [b[0], b[2]]);
      this.tri(o.back ?? k, a, b, c, [a[0], a[2]], [b[0], b[2]], [c[0], c[2]]);
    }
  }
  /** append another mesher's parts under the current placement */
  merge(o: Mesher) {
    this.nm.getNormalMatrix(this.m);
    for (const [k, src] of o.parts) {
      const P = this.part(k);
      for (let i = 0; i < src.p.length; i += 3) {
        _v.set(src.p[i], src.p[i + 1], src.p[i + 2]).applyMatrix4(this.m); P.p.push(_v.x, _v.y, _v.z);
        _n.set(src.n[i], src.n[i + 1], src.n[i + 2]).applyMatrix3(this.nm).normalize(); P.n.push(_n.x, _n.y, _n.z);
      }
      for (let i = 0; i < src.uv.length; i += 2) P.uv.push(src.uv[i] + this.uo, src.uv[i + 1] + this.vo);
    }
  }
  bounds(): THREE.Box3 {
    const b = new THREE.Box3();
    for (const P of this.parts.values()) for (let i = 0; i < P.p.length; i += 3) b.expandByPoint(_v.set(P.p[i], P.p[i + 1], P.p[i + 2]));
    return b;
  }
  tris() { let n = 0; for (const P of this.parts.values()) n += P.p.length / 9; return n; }
  /** one BufferGeometry per material */
  build(): { mat: MatKey; geo: THREE.BufferGeometry }[] {
    const out: { mat: MatKey; geo: THREE.BufferGeometry }[] = [];
    for (const [k, P] of this.parts) {
      if (!P.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(P.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2));
      g.computeBoundingSphere(); g.computeBoundingBox();
      out.push({ mat: k, geo: g });
    }
    return out;
  }
}
export const hash = H;
