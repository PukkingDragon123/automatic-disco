// The machine kit: hand-assembled hardware merged into one mesh per moving part. A model is built bone by bone
// (kit.on(group)), part by part, in a local frame stack (push / pop), from primitives that know how they are made:
// chamfered plate boxes, faceted cylinders and lathe turnings, extruded profiles, pipes with elbows and clamps,
// hoses that run from a port to a port with ferrules, hinges with knuckles and an axle pin, clevis forks, flanges
// with their bolt circles, hex bolts, rivet rows, lamps in guarded housings, panel meters, stencils. Texture
// coordinates tile in atlas regions (atlas.ts) at a fixed texel density, so every part shares one material.
import * as THREE from 'three';
import { regOf, type RegKey } from './atlas';

const TAU = Math.PI * 2;
export type V3 = [number, number, number];
type Axis = 'x' | 'y' | 'z';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();

class Acc { pos: number[] = []; uv: number[] = []; reg: number[] = []; tris = 0; }

/** rotation taking +y to the given axis */
function axisRot(ax: Axis | '-x' | '-y' | '-z'): [number, number, number] {
  switch (ax) {
    case 'x': return [0, 0, -Math.PI / 2];
    case '-x': return [0, 0, Math.PI / 2];
    case 'z': return [Math.PI / 2, 0, 0];
    case '-z': return [-Math.PI / 2, 0, 0];
    case '-y': return [Math.PI, 0, 0];
    default: return [0, 0, 0];
  }
}

export class Kit {
  private acc = new Map<string, { obj: THREE.Object3D; mat: number; a: Acc }>();
  private cur!: Acc;
  private M = new THREE.Matrix4();
  private stk: THREE.Matrix4[] = [];
  /** texture repeats per unit (one 64 px tile) */
  dens: number;
  /** the paint used by plate() when none is given */
  paint: RegKey = 'pa0';
  tris = 0;
  constructor(dens = 3) { this.dens = dens; }
  /** start (or continue) the mesh of a bone; mat indexes the materials passed to finish() */
  on(obj: THREE.Object3D, mat = 0) {
    const k = obj.uuid + ':' + mat;
    let e = this.acc.get(k);
    if (!e) this.acc.set(k, (e = { obj, mat, a: new Acc() }));
    this.cur = e.a; this.M.identity(); this.stk.length = 0;
    return this;
  }
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    this.stk.push(this.M.clone());
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    this.M.multiply(_m);
    return this;
  }
  /** a frame at p whose +z looks along dir (up hint keeps it level) */
  pushDir(p: V3, dir: V3, up: V3 = [0, 1, 0]) {
    this.stk.push(this.M.clone());
    const z = _a.set(...dir).normalize(), u = _b.set(...up);
    if (Math.abs(z.dot(u)) > 0.97) u.set(1, 0, 0);
    const x = _c.crossVectors(u, z).normalize(), y = _n.crossVectors(z, x);
    _m.makeBasis(x, y, z).setPosition(p[0], p[1], p[2]);
    this.M.multiply(_m);
    return this;
  }
  pop() { this.M.copy(this.stk.pop() ?? new THREE.Matrix4()); return this; }

  // -------------------------------------------------------------------------------------------- raw triangles
  private tv: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  /** a triangle in the current frame; uv in tile units (null: box-projected at the kit's density) */
  tri(a: V3, b: V3, c: V3, reg: RegKey, uv?: [number, number, number, number, number, number] | null) {
    const A = this.tv[0].set(...a).applyMatrix4(this.M), B = this.tv[1].set(...b).applyMatrix4(this.M), C = this.tv[2].set(...c).applyMatrix4(this.M);
    _n.subVectors(B, A).cross(_t.subVectors(C, A));
    const area = _n.length();
    if (area < 1e-10) return;
    _n.multiplyScalar(1 / area);
    const R = regOf(reg), d = this.dens, o = this.cur;
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    for (let i = 0; i < 3; i++) {
      const P = this.tv[i];
      o.pos.push(P.x, P.y, P.z);
      if (uv) o.uv.push(uv[i * 2], uv[i * 2 + 1]);
      else if (ax >= ay && ax >= az) o.uv.push((_n.x > 0 ? -P.z : P.z) * d, -P.y * d);
      else if (ay >= az) o.uv.push(P.x * d, (_n.y > 0 ? P.z : -P.z) * d);
      else o.uv.push((_n.z > 0 ? P.x : -P.x) * d, -P.y * d);
      o.reg.push(R[0], R[1], R[2], R[3]);
    }
    o.tris++; this.tris++;
  }
  quad(a: V3, b: V3, c: V3, d: V3, reg: RegKey, uv?: [number, number, number, number, number, number, number, number] | null) {
    if (uv) { this.tri(a, b, c, reg, [uv[0], uv[1], uv[2], uv[3], uv[4], uv[5]]); this.tri(a, c, d, reg, [uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]]); }
    else { this.tri(a, b, c, reg); this.tri(a, c, d, reg); }
  }
  /** a decal quad facing +z in the current frame, w x h, centred at (x, y, z); the whole region maps across it */
  decal(x: number, y: number, z: number, w: number, h: number, reg: RegKey, flipU = false) {
    const e = 0.008, u0 = flipU ? 0.998 : 0.002, u1 = flipU ? 0.002 : 0.998;
    this.quad([x - w / 2, y - h / 2, z + e * 0.25], [x + w / 2, y - h / 2, z + e * 0.25], [x + w / 2, y + h / 2, z + e * 0.25], [x - w / 2, y + h / 2, z + e * 0.25], reg, [u0, 0.998, u1, 0.998, u1, 0.002, u0, 0.002]);
    return this;
  }

  // -------------------------------------------------------------------------------------------- solids
  /** a box centred at (x, y, z); ch > 0 chamfers every edge; faces can take their own regions */
  box(x: number, y: number, z: number, w: number, h: number, d: number, reg: RegKey = this.paint, o: { ch?: number; f?: Partial<Record<'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz', RegKey>> } = {}) {
    const hx = w / 2, hy = h / 2, hz = d / 2, c = Math.min(o.ch ?? 0, hx * 0.9, hy * 0.9, hz * 0.9);
    const F = o.f ?? {};
    const fr = (k: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz') => F[k] ?? reg;
    const out = (a: V3, b: V3, cc: V3, r: RegKey) => {
      // wind outward from the box centre
      const nx = (b[1] - a[1]) * (cc[2] - a[2]) - (b[2] - a[2]) * (cc[1] - a[1]);
      const ny = (b[2] - a[2]) * (cc[0] - a[0]) - (b[0] - a[0]) * (cc[2] - a[2]);
      const nz = (b[0] - a[0]) * (cc[1] - a[1]) - (b[1] - a[1]) * (cc[0] - a[0]);
      const mx = (a[0] + b[0] + cc[0]) / 3, my = (a[1] + b[1] + cc[1]) / 3, mz = (a[2] + b[2] + cc[2]) / 3;
      if (nx * mx + ny * my + nz * mz < 0) this.tri([x + a[0], y + a[1], z + a[2]], [x + cc[0], y + cc[1], z + cc[2]], [x + b[0], y + b[1], z + b[2]], r);
      else this.tri([x + a[0], y + a[1], z + a[2]], [x + b[0], y + b[1], z + b[2]], [x + cc[0], y + cc[1], z + cc[2]], r);
    };
    const q = (a: V3, b: V3, cc: V3, d2: V3, r: RegKey) => { out(a, b, cc, r); out(a, cc, d2, r); };
    if (c <= 0) {
      for (const s of [-1, 1]) {
        q([s * hx, -hy, -hz], [s * hx, hy, -hz], [s * hx, hy, hz], [s * hx, -hy, hz], fr(s > 0 ? 'px' : 'nx'));
        q([-hx, s * hy, -hz], [hx, s * hy, -hz], [hx, s * hy, hz], [-hx, s * hy, hz], fr(s > 0 ? 'py' : 'ny'));
        q([-hx, -hy, s * hz], [hx, -hy, s * hz], [hx, hy, s * hz], [-hx, hy, s * hz], fr(s > 0 ? 'pz' : 'nz'));
      }
      return this;
    }
    const PX = (sx: number, sy: number, sz: number): V3 => [sx * hx, sy * (hy - c), sz * (hz - c)];
    const PY = (sx: number, sy: number, sz: number): V3 => [sx * (hx - c), sy * hy, sz * (hz - c)];
    const PZ = (sx: number, sy: number, sz: number): V3 => [sx * (hx - c), sy * (hy - c), sz * hz];
    for (const s of [-1, 1]) {
      q(PX(s, -1, -1), PX(s, 1, -1), PX(s, 1, 1), PX(s, -1, 1), fr(s > 0 ? 'px' : 'nx'));
      q(PY(-1, s, -1), PY(1, s, -1), PY(1, s, 1), PY(-1, s, 1), fr(s > 0 ? 'py' : 'ny'));
      q(PZ(-1, -1, s), PZ(1, -1, s), PZ(1, 1, s), PZ(-1, 1, s), fr(s > 0 ? 'pz' : 'nz'));
    }
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      q(PX(1 * a, 1 * b, -1), PY(a, b, -1), PY(a, b, 1), PX(a, b, 1), reg); // x-y edges
      q(PX(a, -1, b), PZ(a, -1, b), PZ(a, 1, b), PX(a, 1, b), reg); // x-z edges
      q(PY(-1, a, b), PZ(-1, a, b), PZ(1, a, b), PY(1, a, b), reg); // y-z edges
    }
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const cz of [-1, 1]) out(PX(a, b, cz), PY(a, b, cz), PZ(a, b, cz), reg);
    return this;
  }
  /** a faceted cylinder (or frustum) centred at (x, y, z) along an axis */
  cyl(x: number, y: number, z: number, r0: number, r1: number, h: number, seg: number, reg: RegKey, o: { axis?: Axis | '-x' | '-y' | '-z'; caps?: boolean | 'top' | 'bot'; capReg?: RegKey; a0?: number; wrap?: boolean; arc?: number } = {}) {
    const [rx, ry, rz] = axisRot(o.axis ?? 'y');
    this.push(x, y, z, rx, ry, rz);
    const a0 = o.a0 ?? Math.PI / seg, arc = o.arc ?? TAU, caps = o.caps ?? true, wrap = o.wrap ?? true;
    const nU = Math.max(1, Math.round(((r0 + r1) / 2) * arc * this.dens)), vL = h * this.dens;
    for (let i = 0; i < seg; i++) {
      const a = a0 + (i / seg) * arc, b = a0 + ((i + 1) / seg) * arc;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const p0: V3 = [ca * r0, -h / 2, sa * r0], p1: V3 = [cb * r0, -h / 2, sb * r0], p2: V3 = [cb * r1, h / 2, sb * r1], p3: V3 = [ca * r1, h / 2, sa * r1];
      const u0 = (i / seg) * nU, u1 = ((i + 1) / seg) * nU;
      if (wrap) this.quad(p0, p3, p2, p1, reg, [u0, vL, u0, 0, u1, 0, u1, vL]); else this.quad(p0, p3, p2, p1, reg);
      if (caps === true || caps === 'top') if (r1 > 1e-5) this.tri([0, h / 2, 0], p2, p3, o.capReg ?? reg);
      if (caps === true || caps === 'bot') if (r0 > 1e-5) this.tri([0, -h / 2, 0], p0, p1, o.capReg ?? reg);
    }
    return this.pop();
  }
  /** a turned part: profile [radius, height] from bottom to top, around +y (then rotated to the axis) */
  lathe(x: number, y: number, z: number, prof: [number, number][], seg: number, reg: RegKey, o: { axis?: Axis | '-x' | '-y' | '-z'; a0?: number; regs?: RegKey[]; wrap?: boolean } = {}) {
    const [rx, ry, rz] = axisRot(o.axis ?? 'y');
    this.push(x, y, z, rx, ry, rz);
    const a0 = o.a0 ?? Math.PI / seg;
    for (let j = 0; j < prof.length - 1; j++) {
      const [ra, ya] = prof[j], [rb, yb] = prof[j + 1], rg = o.regs?.[j] ?? reg;
      const nU = Math.max(1, Math.round(((ra + rb) / 2) * TAU * this.dens)), vl = Math.hypot(rb - ra, yb - ya) * this.dens;
      for (let i = 0; i < seg; i++) {
        const a = a0 + (i / seg) * TAU, b = a0 + ((i + 1) / seg) * TAU;
        const p0: V3 = [Math.cos(a) * ra, ya, Math.sin(a) * ra], p1: V3 = [Math.cos(b) * ra, ya, Math.sin(b) * ra];
        const p2: V3 = [Math.cos(b) * rb, yb, Math.sin(b) * rb], p3: V3 = [Math.cos(a) * rb, yb, Math.sin(a) * rb];
        const u0 = (i / seg) * nU, u1 = ((i + 1) / seg) * nU;
        if (o.wrap === false) this.quad(p0, p3, p2, p1, rg);
        else this.quad(p0, p3, p2, p1, rg, [u0, vl, u0, 0, u1, 0, u1, vl]);
      }
    }
    return this.pop();
  }
  /** a torus around +y (then rotated to the axis) */
  torus(x: number, y: number, z: number, R: number, r: number, seg: number, tseg: number, reg: RegKey, axis: Axis | '-x' | '-y' | '-z' = 'y') {
    const [rx, ry, rz] = axisRot(axis);
    this.push(x, y, z, rx, ry, rz);
    for (let i = 0; i < seg; i++) for (let j = 0; j < tseg; j++) {
      const P = (ii: number, jj: number): V3 => { const a = (ii / seg) * TAU, b = (jj / tseg) * TAU, rr = R + Math.cos(b) * r; return [Math.cos(a) * rr, Math.sin(b) * r, Math.sin(a) * rr]; };
      this.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), reg);
    }
    return this.pop();
  }
  /** an extruded profile in the xy plane (any simple polygon), depth along z, centred on z */
  prism(x: number, y: number, z: number, pts: [number, number][], depth: number, reg: RegKey, o: { capReg?: RegKey; back?: RegKey } = {}) {
    this.push(x, y, z);
    let P = pts.map(([a, b]) => new THREE.Vector2(a, b));
    if (THREE.ShapeUtils.isClockWise(P)) P = P.reverse();
    const tris = THREE.ShapeUtils.triangulateShape(P, []);
    const h = depth / 2;
    for (let [i, j, k] of tris) {
      if ((P[j].x - P[i].x) * (P[k].y - P[i].y) - (P[j].y - P[i].y) * (P[k].x - P[i].x) < 0) [j, k] = [k, j];
      this.tri([P[i].x, P[i].y, h], [P[j].x, P[j].y, h], [P[k].x, P[k].y, h], o.capReg ?? reg);
      this.tri([P[i].x, P[i].y, -h], [P[k].x, P[k].y, -h], [P[j].x, P[j].y, -h], o.back ?? o.capReg ?? reg);
    }
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      this.quad([a.x, a.y, -h], [b.x, b.y, -h], [b.x, b.y, h], [a.x, a.y, h], reg);
    }
    return this.pop();
  }
  /** a tube swept along a polyline (pipes, hoses, cables); wraps its texture along the run */
  tube(pts: V3[], r: number, seg: number, reg: RegKey, o: { capped?: boolean } = {}) {
    if (pts.length < 2) return this;
    const V = pts.map((p) => new THREE.Vector3(...p));
    const T: THREE.Vector3[] = V.map((_, i) => {
      const a = V[Math.max(0, i - 1)], b = V[Math.min(V.length - 1, i + 1)];
      return b.clone().sub(a).normalize();
    });
    let nrm = new THREE.Vector3(0, 1, 0);
    if (Math.abs(nrm.dot(T[0])) > 0.9) nrm.set(1, 0, 0);
    nrm = nrm.sub(T[0].clone().multiplyScalar(nrm.dot(T[0]))).normalize();
    const rings: THREE.Vector3[][] = [];
    let len = 0; const L: number[] = [];
    for (let i = 0; i < V.length; i++) {
      if (i > 0) {
        len += V[i].distanceTo(V[i - 1]);
        const ax = new THREE.Vector3().crossVectors(T[i - 1], T[i]);
        if (ax.lengthSq() > 1e-10) { const ang = Math.acos(THREE.MathUtils.clamp(T[i - 1].dot(T[i]), -1, 1)); nrm.applyAxisAngle(ax.normalize(), ang); }
      }
      L.push(len);
      const bin = new THREE.Vector3().crossVectors(T[i], nrm);
      const ring: THREE.Vector3[] = [];
      for (let j = 0; j < seg; j++) { const a = (j / seg) * TAU; ring.push(V[i].clone().addScaledVector(nrm, Math.cos(a) * r).addScaledVector(bin, Math.sin(a) * r)); }
      rings.push(ring);
    }
    const nU = Math.max(1, Math.round(r * TAU * this.dens));
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % seg], c = rings[i + 1][(j + 1) % seg], d = rings[i + 1][j];
      const v0 = L[i] * this.dens, v1 = L[i + 1] * this.dens, u0 = (j / seg) * nU, u1 = ((j + 1) / seg) * nU;
      this.quad([a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z], [d.x, d.y, d.z], reg, [u0, v0, u1, v0, u1, v1, u0, v1]);
    }
    if (o.capped) for (const [i, s] of [[0, -1], [rings.length - 1, 1]] as const) {
      const c = V[i];
      for (let j = 0; j < seg; j++) { const a = rings[i][j], b = rings[i][(j + 1) % seg]; if (s > 0) this.tri([c.x, c.y, c.z], [a.x, a.y, a.z], [b.x, b.y, b.z], reg); else this.tri([c.x, c.y, c.z], [b.x, b.y, b.z], [a.x, a.y, a.z], reg); }
    }
    return this;
  }

  // -------------------------------------------------------------------------------------------- hardware
  /** a hex bolt head standing out of a surface along an axis */
  bolt(x: number, y: number, z: number, r: number, axis: Axis | '-x' | '-y' | '-z' = 'z', reg: RegKey = 'st1') {
    const h = r * 0.7, d = axis.startsWith('-') ? -1 : 1, a = axis.replace('-', '') as Axis;
    const off = (h / 2) * d;
    this.cyl(x + (a === 'x' ? off : 0), y + (a === 'y' ? off : 0), z + (a === 'z' ? off : 0), r, r * 0.92, h, 6, reg, { axis, a0: 0, wrap: false });
    return this;
  }
  /** a row of dome rivets from a to b on a face with the given outward axis */
  rivets(a: V3, b: V3, n: number, r: number, axis: Axis | '-x' | '-y' | '-z' = 'z', reg: RegKey = 'st1') {
    const [rx, ry, rz] = axisRot(axis);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, rx, ry, rz);
      const h = r * 0.6, C: V3[] = [[r, 0, 0], [0, 0, r], [-r, 0, 0], [0, 0, -r]];
      for (let k = 0; k < 4; k++) this.tri(C[(k + 1) % 4], C[k], [0, h, 0], reg);
      this.pop();
    }
    return this;
  }
  /** bolts on a circle (a flange's bolt pattern) in the xy plane of the current frame, heads toward +z */
  boltCircle(x: number, y: number, z: number, R: number, n: number, r: number, a0 = 0) {
    for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; this.bolt(x + Math.cos(a) * R, y + Math.sin(a) * R, z, r, 'z'); }
    return this;
  }
  /** a flange: a turned ring plate with a bolt circle, facing +z in the current frame at depth z */
  flange(x: number, y: number, z: number, R: number, t: number, n: number, reg: RegKey = 'st0', boltR = R * 0.09) {
    this.cyl(x, y, z + t / 2, R, R, t, Math.max(8, n * 2), reg, { axis: 'z' });
    this.boltCircle(x, y, z + t, R * 0.78, n, boltR, Math.PI / n);
    return this;
  }
  /** a hinge along the x axis of the current frame: alternating knuckles on an axle with domed pin caps */
  hinge(x: number, y: number, z: number, len: number, r: number, knuckles = 3, reg: RegKey = 'st0') {
    const kl = len / knuckles;
    for (let i = 0; i < knuckles; i++) this.cyl(x - len / 2 + kl * (i + 0.5), y, z, r, r, kl * 0.9, 8, i % 2 ? 'dk' : reg, { axis: 'x' });
    this.cyl(x, y, z, r * 0.45, r * 0.45, len + r * 0.6, 6, 'st1', { axis: 'x' });
    for (const s of [-1, 1]) this.cyl(x + s * (len / 2 + r * 0.35), y, z, r * 0.6, r * 0.6, r * 0.25, 6, 'st1', { axis: 'x' });
    return this;
  }
  /** a clevis fork at the origin of the current frame: two cheek plates either side of x, the pin across them */
  clevis(w: number, r: number, len: number, reg: RegKey = 'st0') {
    for (const s of [-1, 1]) this.box(s * (w / 2 + r * 0.22), -len / 2 + r * 0.5, 0, r * 0.4, len, r * 2, reg, { ch: r * 0.1 });
    this.cyl(0, 0, 0, r * 0.5, r * 0.5, w + r * 1.1, 6, 'st1', { axis: 'x' });
    this.box(0, -len + r * 0.4, 0, w + r * 0.9, r * 0.6, r * 2, reg);
    return this;
  }
  /** an L-bracket from a wall (its face at z = 0, facing +z) out to a shelf, bolted on both legs */
  bracket(w: number, h: number, out: number, t: number, reg: RegKey = 'st0', bolts = 2) {
    this.box(0, 0, t / 2, w, h, t, reg, { ch: t * 0.3 });
    this.box(0, -h / 2 + t / 2, out / 2, w, t, out, reg, { ch: t * 0.3 });
    // gusset
    this.prism(0, 0, 0, [[0, -h / 2 + t], [0, h * 0.15], [out * 0.7, -h / 2 + t]], t * 0.6, reg);
    for (let i = 0; i < bolts; i++) { const bx = bolts === 1 ? 0 : (i / (bolts - 1) - 0.5) * w * 0.65; this.bolt(bx, h * 0.25, t, t * 0.9, 'z'); this.bolt(bx, -h / 2 + t, out * 0.7, t * 0.9, 'y'); }
    return this;
  }
  /** a hose: a smooth run from port a to port b leaving along da and arriving along db, ferrules at both ends */
  hose(a: V3, da: V3, b: V3, db: V3, r: number, reg: RegKey = 'hose', o: { sag?: number; seg?: number; n?: number; ferrule?: RegKey } = {}) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), DA = new THREE.Vector3(...da).normalize(), DB = new THREE.Vector3(...db).normalize();
    const L = A.distanceTo(B), k = L * 0.4;
    const c1 = A.clone().addScaledVector(DA, k), c2 = B.clone().addScaledVector(DB, -k);
    c1.y -= (o.sag ?? 0) * 0.5; c2.y -= (o.sag ?? 0) * 0.5;
    const n = o.n ?? 10, pts: V3[] = [];
    const curve = new THREE.CubicBezierCurve3(A, c1, c2, B);
    for (let i = 0; i <= n; i++) { const p = curve.getPoint(i / n); pts.push([p.x, p.y, p.z]); }
    this.tube(pts, r, o.seg ?? 6, reg);
    const fr = o.ferrule ?? 'br';
    for (const [p, d] of [[A, DA], [B, DB.clone().negate()]] as const) {
      const e = p.clone().addScaledVector(d, r * 1.2);
      this.tube([[p.x, p.y, p.z], [e.x, e.y, e.z]], r * 1.35, 6, fr, { capped: true });
    }
    return this;
  }
  /** a rigid pipe through the given points with turned elbow collars at the bends and flanged ends */
  pipe(pts: V3[], r: number, reg: RegKey = 'st0', o: { collar?: RegKey; ends?: boolean } = {}) {
    this.tube(pts, r, 8, reg);
    const col = o.collar ?? 'br';
    for (let i = 1; i < pts.length - 1; i++) this.tube([lerp3(pts[i], pts[i - 1], Math.min(0.5, (r * 1.6) / dist3(pts[i], pts[i - 1]))), pts[i], lerp3(pts[i], pts[i + 1], Math.min(0.5, (r * 1.6) / dist3(pts[i], pts[i + 1])))], r * 1.25, 8, col);
    if (o.ends !== false) for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) this.tube([p, lerp3(p, q, Math.min(0.45, (r * 0.8) / dist3(p, q)))], r * 1.6, 8, col, { capped: true });
    return this;
  }
  /** a sagging cable from a to b with a small boot at each end */
  cable(a: V3, b: V3, sag: number, r: number, reg: RegKey = 'cab', n = 8) {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t]); }
    this.tube(pts, r, 5, reg);
    for (const [p, q] of [[a, pts[1]], [b, pts[n - 1]]]) this.tube([p, lerp3(p, q, 0.35)], r * 1.5, 6, 'rb', { capped: true });
    return this;
  }
  /** a lamp facing +z: a turned housing, a bezel ring with screws, the glass, a wire guard */
  lamp(x: number, y: number, z: number, r: number, depth: number, glass: RegKey = 'lamp', housing: RegKey = this.paint, guard = true) {
    this.lathe(x, y, z, [[r * 0.55, -depth], [r * 0.95, -depth * 0.55], [r, 0]], 10, housing, { axis: 'z' });
    this.cyl(x, y, z + r * 0.06, r * 1.08, r * 1.08, r * 0.12, 10, 'st0', { axis: 'z' });
    this.cyl(x, y, z + r * 0.1, r * 0.86, r * 0.8, r * 0.1, 10, glass, { axis: 'z', wrap: false, caps: 'top', capReg: glass });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; this.bolt(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97, z + r * 0.12, r * 0.07, 'z'); }
    if (guard) {
      for (const s of [-0.45, 0, 0.45]) this.tube([[x + s * r, y - r * 0.95, z + r * 0.12], [x + s * r, y - r * 0.6, z + r * 0.42], [x + s * r, y + r * 0.6, z + r * 0.42], [x + s * r, y + r * 0.95, z + r * 0.12]], r * 0.04, 4, 'st1');
    }
    return this;
  }
  /** a panel meter on a face (+z): a cast box, the painted face, a glass lip and two screws */
  meter(x: number, y: number, z: number, w: number, h: number, d = w * 0.25) {
    this.box(x, y, z + d / 2, w, h, d, 'dk', { ch: d * 0.2 });
    this.decal(x, y, z + d, w * 0.84, h * 0.8, 'gauge');
    for (const s of [-1, 1]) this.bolt(x + s * w * 0.46, y + h * 0.42, z + d, w * 0.04, 'z');
    return this;
  }
  /** a louvred vent box on a face (+z) with a riveted frame */
  vent(x: number, y: number, z: number, w: number, h: number, d: number, reg: RegKey = 'gr') {
    this.box(x, y, z + d / 2, w, h, d, this.paint, { ch: d * 0.25, f: { pz: reg } });
    this.rivets([x - w * 0.42, y + h * 0.5, z + d * 0.6], [x + w * 0.42, y + h * 0.5, z + d * 0.6], 4, d * 0.18, 'y');
    return this;
  }

  // -------------------------------------------------------------------------------------------- output
  /** build one mesh per (bone, material) and parent it; returns the meshes */
  finish(mats: THREE.Material[], o: { shadow?: boolean } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const { obj, mat, a } of this.acc.values()) {
      if (!a.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
      g.setAttribute('reg', new THREE.Float32BufferAttribute(a.reg, 4));
      g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[mat] ?? mats[0]);
      m.castShadow = o.shadow ?? true; m.receiveShadow = true;
      m.userData.kitTris = a.tris;
      obj.add(m); out.push(m);
    }
    this.acc.clear();
    return out;
  }
}
export function lerp3(a: V3, b: V3, t: number): V3 { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function dist3(a: V3, b: V3) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) || 1e-6; }
/** count triangles under an object */
export function trisOf(o: THREE.Object3D) { let n = 0; o.traverse((m) => { const g = (m as THREE.Mesh).geometry; if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3; }); return Math.round(n); }
