// The carrier's geometry builder. Thousands of parts go straight into typed per-material buckets (no Mesh per
// part, no merge pass), each vertex carrying a tile-space uv plus the atlas rect it tiles inside (the atlas
// material wraps the uv into that rect per fragment). UVs are in metres x texel density, so texels stay square
// and the same size everywhere: flat faces are planar-projected with "up" kept up (rust runs down a wall),
// curved parts are unwrapped by arc length. A transform stack places sub-assemblies.
import * as THREE from 'three';

export type V = THREE.Vector3;
const V3 = THREE.Vector3;
export const TAU = Math.PI * 2;

/** an atlas rect (u0, v0, du, dv in 0..1) and its tile repeats per metre (su, sv); b is the bucket (material) */
export interface Skin { r: readonly [number, number, number, number]; su: number; sv: number; b: string; ou?: number; ov?: number; tile?: boolean; px?: readonly [number, number] }

export interface BoxOpts { bev?: number; skip?: string; top?: Skin; side?: Skin; bot?: Skin }

export class Bucket {
  p: number[] = []; n: number[] = []; t: number[] = []; r: number[] = []; i: number[] = [];
  get nv() { return this.p.length / 3; }
  get tris() { return this.i.length / 3; }
}

const UP = new V3(0, 1, 0), XA = new V3(1, 0, 0);
const _a = new V3(), _b = new V3(), _c = new V3(), _n = new V3(), _t = new V3(), _bt = new V3(), _p = new V3(), _q = new V3();

export class Builder {
  readonly b = new Map<string, Bucket>();
  M = new THREE.Matrix4();
  private NM = new THREE.Matrix3();
  private st: THREE.Matrix4[] = [];
  /** per-part uv offset (metres), so neighbouring parts don't start their plates in step */
  jitter = true;
  private seed = 1;

  bucket(name: string) { let k = this.b.get(name); if (!k) this.b.set(name, (k = new Bucket())); return k; }
  push(m?: THREE.Matrix4) { this.st.push(this.M.clone()); if (m) this.M.multiply(m); this.NM.getNormalMatrix(this.M); return this; }
  pop() { this.M.copy(this.st.pop()!); this.NM.getNormalMatrix(this.M); return this; }
  /** push a translation + euler rotation (XYZ order) */
  at(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1) {
    const m = new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(s, s, s));
    return this.push(m);
  }
  /** push a frame whose +y points along dir (for beams, cylinders on any axis) */
  along(p: V, dir: V) { const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()); return this.push(new THREE.Matrix4().compose(p, q, new V3(1, 1, 1))); }
  /** run f inside a pushed frame */
  with(m: THREE.Matrix4, f: () => void) { this.push(m); f(); this.pop(); }
  in(x: number, y: number, z: number, rx: number, ry: number, rz: number, f: () => void) { this.at(x, y, z, rx, ry, rz); f(); this.pop(); }

  private vtx(k: Bucket, p: V, n: V, u: number, v: number, s: Skin) {
    k.p.push(p.x, p.y, p.z); k.n.push(n.x, n.y, n.z); k.t.push(u, v); k.r.push(s.r[0], s.r[1], s.r[2], s.r[3]);
    return k.nv - 1;
  }
  private off(s: Skin): [number, number] {
    if (s.ou !== undefined) return [s.ou, s.ov ?? 0];
    if (!this.jitter) return [0, 0];
    this.seed = (this.seed * 16807) % 2147483647;
    const h = this.seed / 2147483647;
    return [Math.floor(h * 97) * 0.37, Math.floor(h * 7919) % 53 * 0.29];
  }

  /**
   * A flat convex polygon (local coords, any winding: it is turned to face away from `out`, default the local
   * origin, or kept as given when out is null). Planar uv: walls keep "up" up, floors run u along x.
   */
  poly(s: Skin, pts: V[], out: V | null = new V3(), uvo?: [number, number]) {
    const k = this.bucket(s.b), M = this.M;
    const P = pts.map((p) => p.clone().applyMatrix4(M));
    _a.subVectors(P[1], P[0]); _b.subVectors(P[2], P[0]); _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-12 && P.length > 3) { _b.subVectors(P[3], P[0]); _n.crossVectors(_a, _b); }
    _n.normalize();
    if (out) {
      _c.set(0, 0, 0); for (const p of pts) _c.add(p); _c.multiplyScalar(1 / pts.length).sub(out).applyMatrix3(this.NM);
      if (_n.dot(_c) < 0) { P.reverse(); _n.negate(); }
    }
    const [ou, ov] = uvo ?? this.off(s);
    if (Math.abs(_n.y) < 0.8) { _bt.copy(UP).addScaledVector(_n, -_n.y).normalize(); _t.crossVectors(_bt, _n); }
    else { _t.copy(XA).addScaledVector(_n, -_n.x).normalize(); _bt.crossVectors(_n, _t); }
    const base = k.nv;
    for (const p of P) this.vtx(k, p, _n, p.dot(_t) * s.su + ou, -p.dot(_bt) * s.sv + ov, s);
    for (let i = 1; i < P.length - 1; i++) k.i.push(base, base + i, base + i + 1);
    return _n;
  }
  /** a quad with explicit tile-space uvs per corner (decals, window bands, cells); corners in order round the face */
  quad(s: Skin, pts: V[], uv: [number, number][], twoSided = false) {
    const k = this.bucket(s.b), M = this.M;
    const P = pts.map((p) => p.clone().applyMatrix4(M));
    _a.subVectors(P[1], P[0]); _b.subVectors(P[2], P[0]); _n.crossVectors(_a, _b).normalize();
    const base = k.nv;
    for (let i = 0; i < P.length; i++) this.vtx(k, P[i], _n, uv[i][0], uv[i][1], s);
    for (let i = 1; i < P.length - 1; i++) k.i.push(base, base + i, base + i + 1);
    if (twoSided) { _n.negate(); const b2 = k.nv; for (let i = 0; i < P.length; i++) this.vtx(k, P[i], _n, uv[i][0], uv[i][1], s); for (let i = 1; i < P.length - 1; i++) k.i.push(b2, b2 + i + 1, b2 + i); }
  }
  /**
   * A flat panel on the local xy plane facing +z, w x h, mapped once onto a cell rect (or tiled along u by
   * `rep` cells when the skin tiles). For decals, signs, window bands.
   */
  panel(s: Skin, w: number, h: number, rep = -1, two = false) {
    const e = 0.0015;
    if (rep < 0) rep = s.tile ? Math.max(1, Math.round(w * s.su * 4) / 4) : 1;
    this.quad(s, [new V3(-w / 2, -h / 2, 0), new V3(w / 2, -h / 2, 0), new V3(w / 2, h / 2, 0), new V3(-w / 2, h / 2, 0)], [[e, 1 - e], [rep - e, 1 - e], [rep - e, e], [e, e]], two);
  }

  /**
   * A box (centred), optionally chamfered on every edge by `bev` (the chamfers catch the light like a pixel
   * artist's 1 px highlight). faces: skip mask by name (px nx py ny pz nz). side: a different skin for the walls.
   */
  box(s: Skin, w: number, h: number, d: number, o: BoxOpts = {}) {
    const hx = w / 2, hy = h / 2, hz = d / 2, c = Math.min(o.bev ?? 0, hx * 0.45, hy * 0.45, hz * 0.45);
    const skip = o.skip ?? '';
    const sk = (f: string) => (f === 'py' ? o.top ?? s : f === 'ny' ? o.bot ?? s : o.side ?? s);
    if (c <= 0) {
      const f = (n: string, pts: number[][]) => { if (!skip.includes(n)) this.poly(sk(n), pts.map(([x, y, z]) => new V3(x, y, z))); };
      f('px', [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]); f('nx', [[-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, hz]]);
      f('py', [[-hx, hy, -hz], [hx, hy, -hz], [hx, hy, hz], [-hx, hy, hz]]); f('ny', [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]);
      f('pz', [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]); f('nz', [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz]]);
      return;
    }
    // corner points: for each corner (sx, sy, sz) the three points on its x, y and z faces
    const X = (sx: number, sy: number, sz: number) => new V3(sx * hx, sy * (hy - c), sz * (hz - c));
    const Y = (sx: number, sy: number, sz: number) => new V3(sx * (hx - c), sy * hy, sz * (hz - c));
    const Z = (sx: number, sy: number, sz: number) => new V3(sx * (hx - c), sy * (hy - c), sz * hz);
    const S = [-1, 1];
    for (const sx of S) if (!skip.includes(sx > 0 ? 'px' : 'nx')) this.poly(sk('px'), [X(sx, -1, -1), X(sx, 1, -1), X(sx, 1, 1), X(sx, -1, 1)]);
    for (const sy of S) if (!skip.includes(sy > 0 ? 'py' : 'ny')) this.poly(sk(sy > 0 ? 'py' : 'ny'), [Y(-1, sy, -1), Y(1, sy, -1), Y(1, sy, 1), Y(-1, sy, 1)]);
    for (const sz of S) if (!skip.includes(sz > 0 ? 'pz' : 'nz')) this.poly(sk('pz'), [Z(-1, -1, sz), Z(1, -1, sz), Z(1, 1, sz), Z(-1, 1, sz)]);
    // edge chamfers
    for (const sx of S) for (const sy of S) this.poly(sk('px'), [X(sx, sy, -1), X(sx, sy, 1), Y(sx, sy, 1), Y(sx, sy, -1)]);
    for (const sx of S) for (const sz of S) this.poly(sk('px'), [X(sx, -1, sz), X(sx, 1, sz), Z(sx, 1, sz), Z(sx, -1, sz)]);
    for (const sy of S) for (const sz of S) this.poly(sk(sy > 0 ? 'py' : 'ny'), [Y(-1, sy, sz), Y(1, sy, sz), Z(1, sy, sz), Z(-1, sy, sz)]);
    for (const sx of S) for (const sy of S) for (const sz of S) this.poly(sk(sy > 0 ? 'py' : 'ny'), [X(sx, sy, sz), Y(sx, sy, sz), Z(sx, sy, sz)]);
  }
  /** a box from two corners (axis-aligned in the current frame) */
  boxAt(s: Skin, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: BoxOpts = {}) {
    this.at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); this.box(s, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), o); this.pop();
  }
  /** a square beam (truss member, rail, strut) between two points */
  beam(s: Skin, a: V, b: V, w: number, h = w, skipEnds = true) {
    const d = _q.subVectors(b, a), len = d.length(); if (len < 1e-4) return;
    this.along(a.clone().add(b).multiplyScalar(0.5), d.clone()); this.box(s, w, len, h, { skip: skipEnds ? 'pyny' : '' }); this.pop();
  }
  /** a round rod / cable between two points */
  rod(s: Skin, a: V, b: V, r: number, seg = 6) {
    const d = _q.subVectors(b, a), len = d.length(); if (len < 1e-4) return;
    this.along(a.clone().add(b).multiplyScalar(0.5), d.clone()); this.cyl(s, r, r, len, seg, { caps: false }); this.pop();
  }

  /**
   * A cylinder / frustum along local y, centred. u runs round by arc length (snapped so the seam tiles), v up the
   * side. a0..a1 for a partial sweep. caps: flat ends.
   */
  cyl(s: Skin, r0: number, r1: number, h: number, seg = 16, o: { caps?: boolean; a0?: number; a1?: number; cap?: Skin; inside?: boolean; v0?: number; vlen?: number } = {}) {
    const k = this.bucket(s.b), M = this.M, NM = this.NM;
    const a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU, full = Math.abs(a1 - a0 - TAU) < 1e-6;
    const rm = (r0 + r1) / 2, circ = rm * (a1 - a0);
    const su = full && s.su > 0 ? Math.max(1, Math.round(circ * s.su)) / circ : s.su;
    const [ou, ov] = this.off(s);
    const slope = (r0 - r1) / h, base = k.nv, inv = o.inside ? -1 : 1;
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg), ca = Math.cos(a), sa = Math.sin(a);
      _n.set(ca, slope, sa).normalize().multiplyScalar(inv).applyMatrix3(NM).normalize();
      for (const [y, r] of [[-h / 2, r0], [h / 2, r1]] as [number, number][]) {
        _p.set(ca * r, y, sa * r).applyMatrix4(M);
        const v = o.vlen !== undefined ? (o.v0 ?? 0) + ((y + h / 2) / h) * o.vlen : -(y * s.sv) + ov;
        this.vtx(k, _p, _n, (a - a0) * rm * su + ou, v, s);
      }
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; if (inv > 0) k.i.push(a, a + 1, a + 3, a, a + 3, a + 2); else k.i.push(a, a + 3, a + 1, a, a + 2, a + 3); }
    if (o.caps !== false && full) {
      for (const [y, r] of [[-h / 2, r0], [h / 2, r1]] as [number, number][]) {
        if (r <= 1e-4) continue;
        const pts: V[] = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * TAU; pts.push(new V3(Math.cos(a) * r, y, Math.sin(a) * r)); }
        this.poly(o.cap ?? s, pts, new V3(0, -y, 0));
      }
    }
  }
  /** a sphere or a part of one: u round the equator by arc length (snapped), v from pole to pole (one tile if fit) */
  sphere(s: Skin, r: number, ws = 16, hs = 10, o: { t0?: number; t1?: number; fit?: boolean } = {}) {
    const k = this.bucket(s.b), M = this.M, NM = this.NM;
    const t0 = o.t0 ?? 0, t1 = o.t1 ?? Math.PI, circ = TAU * r;
    const su = s.su > 0 ? Math.max(1, Math.round(circ * s.su)) / circ : s.su;
    const [ou] = this.off(s);
    const base = k.nv;
    for (let j = 0; j <= hs; j++) {
      const th = t0 + (t1 - t0) * (j / hs), st = Math.sin(th), ct = Math.cos(th);
      for (let i = 0; i <= ws; i++) {
        const a = (i / ws) * TAU;
        _n.set(Math.cos(a) * st, ct, Math.sin(a) * st);
        _p.copy(_n).multiplyScalar(r).applyMatrix4(M);
        const v = o.fit !== false ? 0.002 + (th / Math.PI) * 0.996 : th * r * s.sv;
        this.vtx(k, _p, _q.copy(_n).applyMatrix3(NM).normalize(), a * r * su + ou, v, s);
      }
    }
    for (let j = 0; j < hs; j++) for (let i = 0; i < ws; i++) {
      const a = base + j * (ws + 1) + i, b = a + ws + 1;
      k.i.push(a, a + 1, b + 1, a, b + 1, b);
    }
  }
  /**
   * A tube swept along a polyline (pipes, conduits, cable runs): mitred at the joints; give extra points for a
   * rounded elbow (see bendPath). u round by arc, v along the run.
   */
  tube(s: Skin, path: V[], r: number, seg = 8, caps = false) {
    const k = this.bucket(s.b), M = this.M, NM = this.NM;
    const n = path.length; if (n < 2) return;
    const T: V[] = [];
    for (let i = 0; i < n; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      T.push(i === 0 ? path[1].clone().sub(path[0]).normalize() : i === n - 1 ? path[n - 1].clone().sub(path[n - 2]).normalize() : b.clone().sub(a).normalize());
    }
    // parallel transport frame
    let nrm = Math.abs(T[0].y) < 0.9 ? new V3(0, 1, 0).cross(T[0]).normalize() : new V3(1, 0, 0).cross(T[0]).normalize();
    const circ = TAU * r, su = s.su > 0 ? Math.max(1, Math.round(circ * s.su)) / circ : s.su;
    const [ou, ov] = this.off(s);
    let len = 0; const base = k.nv;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        len += path[i].distanceTo(path[i - 1]);
        const ax = new V3().crossVectors(T[i - 1], T[i]);
        if (ax.lengthSq() > 1e-10) { const ang = Math.acos(Math.min(1, Math.max(-1, T[i - 1].dot(T[i])))); nrm.applyAxisAngle(ax.normalize(), ang); }
      }
      nrm.addScaledVector(T[i], -nrm.dot(T[i])).normalize();
      const bin = new V3().crossVectors(T[i], nrm).normalize();
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        _n.copy(nrm).multiplyScalar(ca).addScaledVector(bin, sa);
        _p.copy(path[i]).addScaledVector(_n, r).applyMatrix4(M);
        this.vtx(k, _p, _q.copy(_n).applyMatrix3(NM).normalize(), a * r * su + ou, -len * s.sv + ov, s);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * (seg + 1) + j, b = a + seg + 1;
      k.i.push(a, b + 1, b, a, a + 1, b + 1);
    }
    if (caps) for (const [i, dir] of [[0, -1], [n - 1, 1]] as [number, number][]) {
      const pts: V[] = []; const t = T[i];
      const nn = Math.abs(t.y) < 0.9 ? new V3(0, 1, 0).cross(t).normalize() : new V3(1, 0, 0).cross(t).normalize(), bb = new V3().crossVectors(t, nn);
      for (let j = 0; j < seg; j++) { const a = (j / seg) * TAU; pts.push(path[i].clone().addScaledVector(nn, Math.cos(a) * r).addScaledVector(bb, Math.sin(a) * r)); }
      this.poly(s, pts, path[i].clone().addScaledVector(t, -dir));
    }
  }
  /** a surface of revolution round local y from a (radius, y) profile; u round, v down the profile by length */
  lathe(s: Skin, prof: [number, number][], seg = 20, o: { fit?: boolean; flip?: boolean } = {}) {
    const k = this.bucket(s.b), M = this.M, NM = this.NM;
    const L: number[] = [0]; for (let i = 1; i < prof.length; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    const rm = prof.reduce((a, p) => a + p[0], 0) / prof.length, circ = TAU * rm;
    const su = s.su > 0 ? Math.max(1, Math.round(circ * s.su)) / circ : s.su;
    const [ou, ov] = this.off(s);
    const base = k.nv;
    for (let j = 0; j < prof.length; j++) {
      const [r, y] = prof[j];
      const pa = prof[Math.max(0, j - 1)], pb = prof[Math.min(prof.length - 1, j + 1)];
      const dy = pb[1] - pa[1], dr = pb[0] - pa[0];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        _n.set(ca * dy, -dr, sa * dy).normalize();
        _p.set(ca * r, y, sa * r).applyMatrix4(M);
        const v = o.fit ? 0.002 + (L[j] / L[L.length - 1]) * 0.996 : L[j] * s.sv + ov;
        this.vtx(k, _p, _q.copy(_n).applyMatrix3(NM).normalize(), a * rm * su + ou, v, s);
      }
    }
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + seg + 1;
      if (o.flip) k.i.push(a, b + 1, b, a, a + 1, b + 1); else k.i.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  /** a prism: a convex or concave-free polygon (x, y) extruded along local z from z0 to z1, walls planar-mapped */
  prism(s: Skin, poly: [number, number][], z0: number, z1: number, o: { caps?: boolean; cap?: Skin } = {}) {
    const n = poly.length;
    const c = new V3(poly.reduce((a, p) => a + p[0], 0) / n, poly.reduce((a, p) => a + p[1], 0) / n, (z0 + z1) / 2);
    for (let i = 0; i < n; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % n];
      this.poly(s, [new V3(x0, y0, z0), new V3(x1, y1, z0), new V3(x1, y1, z1), new V3(x0, y0, z1)], c);
    }
    if (o.caps !== false) {
      this.poly(o.cap ?? s, poly.map(([x, y]) => new V3(x, y, z0)), c);
      this.poly(o.cap ?? s, poly.map(([x, y]) => new V3(x, y, z1)), c);
    }
  }
  /**
   * Hull loft: rings of the same point count, each a closed cross-section at its z (points as [x, y]); the strip
   * between rings is faceted and planar-mapped per quad (plates line up along the hull). Caps optional.
   */
  loft(s: Skin, rings: { z: number; pts: [number, number][] }[], o: { caps?: boolean; cap0?: Skin; cap1?: Skin; open?: boolean } = {}) {
    const n = rings[0].pts.length;
    const cy = rings.reduce((a, r) => a + r.pts.reduce((b, p) => b + p[1], 0) / n, 0) / rings.length;
    const cz = (rings[0].z + rings[rings.length - 1].z) / 2;
    const uvo = this.off(s);
    for (let r = 0; r < rings.length - 1; r++) {
      const A = rings[r], B = rings[r + 1];
      for (let i = 0; i < (o.open ? n - 1 : n); i++) {
        const j = (i + 1) % n;
        const pts = [new V3(A.pts[i][0], A.pts[i][1], A.z), new V3(A.pts[j][0], A.pts[j][1], A.z), new V3(B.pts[j][0], B.pts[j][1], B.z), new V3(B.pts[i][0], B.pts[i][1], B.z)];
        const mid = new V3((A.pts[i][0] + A.pts[j][0]) / 2, (A.pts[i][1] + A.pts[j][1]) / 2, (A.z + B.z) / 2);
        // face away from the local axis line through the section centre
        const outFrom = new V3(0, cy, mid.z);
        if (pts[0].distanceTo(pts[1]) < 1e-5 && pts[2].distanceTo(pts[3]) < 1e-5) continue;
        if (pts[0].distanceTo(pts[1]) < 1e-5) pts.splice(1, 1); else if (pts[2].distanceTo(pts[3]) < 1e-5) pts.splice(2, 1);
        this.poly(s, pts, outFrom, uvo);
      }
    }
    if (o.caps !== false) {
      const R0 = rings[0], R1 = rings[rings.length - 1];
      this.poly(o.cap0 ?? s, R0.pts.map(([x, y]) => new V3(x, y, R0.z)), new V3(0, cy, cz));
      this.poly(o.cap1 ?? s, R1.pts.map(([x, y]) => new V3(x, y, R1.z)), new V3(0, cy, cz));
    }
  }

  /** a geometry per bucket (indexed; position, normal, uv in tile space, aRect) */
  geometries(): Map<string, THREE.BufferGeometry> {
    const out = new Map<string, THREE.BufferGeometry>();
    for (const [name, k] of this.b) {
      if (!k.i.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(k.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(k.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(k.t, 2));
      g.setAttribute('aRect', new THREE.Float32BufferAttribute(k.r, 4));
      g.setIndex(k.nv > 65535 ? new THREE.Uint32BufferAttribute(k.i, 1) : new THREE.Uint16BufferAttribute(k.i, 1));
      g.computeBoundingSphere(); g.computeBoundingBox();
      out.set(name, g);
    }
    return out;
  }
  tris() { let n = 0; for (const k of this.b.values()) n += k.tris; return n; }
}

/** a polyline with its corners rounded into elbows of radius rr (n steps each), for pipe runs */
export function bendPath(pts: V[], rr: number, n = 3): V[] {
  if (pts.length < 3) return pts.map((p) => p.clone());
  const out: V[] = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d0 = b.clone().sub(a), d1 = c.clone().sub(b);
    const l0 = d0.length(), l1 = d1.length(); d0.normalize(); d1.normalize();
    const r = Math.min(rr, l0 * 0.45, l1 * 0.45);
    const p0 = b.clone().addScaledVector(d0, -r), p1 = b.clone().addScaledVector(d1, r);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      // quadratic bezier through the corner
      const q = p0.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(b, 2 * t * (1 - t)).addScaledVector(p1, t * t);
      out.push(q);
    }
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}
