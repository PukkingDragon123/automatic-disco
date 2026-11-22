// SOFT AND LOOSE THINGS in the pod (v7, the user: "no blocky lazy things, the pillow should have full cloth physics too,
// and the ruined things and debris should have physics"). A small position-based solver, no library:
//   - PUFFY GEOMETRY: cushionGeo (a superellipsoid whose faces dome: pillows, mattresses, pads, cushions) and
//     quiltPanelGeo (an insulation pad whose cushions bulge exactly where the quilt_insulation texture paints them).
//   - CLOTH: a verlet grid with stretch, shear and bend links (blankets, curtains, a pad hanging by a corner); it drapes,
//     settles, blows in the vents' wind, is pushed by colliders and can be dragged by the cursor.
//   - ROPES: verlet chains drawn as tubes (cable looms, a lamp hanging on its cable).
//   - CLUSTERS: particles held to a rest shape by SHAPE MATCHING (Muller et al.): stiffness 1 = a rigid body (debris,
//     fragments, tools, cans, boxes, screws) that tumbles and stacks from its corner particles; below 1 = a soft body
//     (the pillow) that squashes and recovers. Bodies collide with each other as oriented boxes.
// Everything lives in the cabin's local frame (y = 0 is the deck, the walls a circle of radius R). Bodies that stay
// still SLEEP (no work) until something moves near them, an impulse hits them or the cursor grabs them.
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const _v = new V3(), _w = new V3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _m4 = new THREE.Matrix4();

// ================================================================ puffy geometry
/** a puffy rounded box w x h x d: round 0 (boxy) .. 1 (an ellipsoid), puff = how far the faces dome (top and bottom
 *  most, like stuffing); uvs in metres across the top (for cloth-like mapping) */
export function cushionGeo(w: number, h: number, d: number, o: { round?: number; puff?: number; seg?: number } = {}): THREE.BufferGeometry {
  const seg = o.seg ?? 0.06, round = o.round ?? 0.4, puff = o.puff ?? 0.2;
  const sx = Math.max(3, Math.round(w / seg)), sy = Math.max(2, Math.round(h / seg)), sz = Math.max(3, Math.round(d / seg));
  let g: THREE.BufferGeometry = new THREE.BoxGeometry(2, 2, 2, sx, sy, sz);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const e = 2 + (1 - round) * 10;
  const P = g.getAttribute('position') as THREE.BufferAttribute, uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const r = Math.pow(Math.pow(Math.abs(x), e) + Math.pow(Math.abs(y), e) + Math.pow(Math.abs(z), e), 1 / e);
    x /= r; y /= r; z /= r;
    y *= 1 + puff * (1 - x * x) * (1 - z * z);
    x *= 1 + puff * 0.25 * (1 - y * y) * (1 - z * z); z *= 1 + puff * 0.25 * (1 - y * y) * (1 - x * x);
    P.setXYZ(i, (x * w) / 2, (y * h) / 2, (z * d) / 2);
    uv[i * 2] = (x * w) / 2 + w / 2 + (y < 0 ? w : 0); uv[i * 2 + 1] = (z * d) / 2 + d / 2;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** an insulation pad w x h (y up from 0, facing +z) whose quilted cushions bulge `depth` toward the room exactly where the
 *  library's quilt_insulation texture paints them (0.5 m staggered cells in a 2 m repeat, box-mapped in object space) */
export function quiltPanelGeo(w: number, h: number, depth = 0.045, seg = 0.06): THREE.BufferGeometry {
  const nx = Math.max(2, Math.round(w / seg)), ny = Math.max(2, Math.round(h / seg));
  const g = new THREE.PlaneGeometry(w, h, nx, ny).translate(0, h / 2, 0);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const mod = (a: number, b: number) => ((a % b) + b) % b;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i);
    const yy = 2 - mod(y, 2) === 2 ? 0 : 2 - mod(y, 2), row = Math.floor(yy / 0.5), off = row & 1 ? 0.25 : 0;
    const cu = mod(mod(x, 2) + off, 0.5) / 0.5, cv = (yy - row * 0.5) / 0.5, du = cu * 2 - 1, dv = cv * 2 - 1;
    const dome = Math.sqrt(Math.max(0, 1 - du * du * 0.85)) * Math.sqrt(Math.max(0, 1 - dv * dv * 0.85));
    const edge = x < -w / 2 + 0.02 || x > w / 2 - 0.02 || y < 0.02 || y > h - 0.02;
    P.setZ(i, edge ? 0 : depth * Math.pow(dome, 0.7));
  }
  g.computeVertexNormals();
  return g;
}

// ================================================================ colliders and wind
/** a collider for the soft and loose things: a sphere, or an oriented box (centre, half extents, rotation); v is its
 *  velocity (a moving collider drags what it touches) */
export interface Col { kind: 'sphere' | 'box'; p: THREE.Vector3; r: number; half: THREE.Vector3; q: THREE.Quaternion; v: THREE.Vector3; tag?: string }
export function boxCol(p: THREE.Vector3, half: THREE.Vector3, q = new THREE.Quaternion(), tag?: string): Col { return { kind: 'box', p: p.clone(), r: 0, half: half.clone(), q: q.clone(), v: new V3(), tag }; }
/** a vent's (or a burst pipe's) draught: from p along dir, radius r, strength k (m/s^2 at the core), gusting */
export interface Wind { p: THREE.Vector3; dir: THREE.Vector3; r: number; k: number; gust: number; ttl?: number }

/** push a point out of a collider (margin m); returns true on contact and leaves the normal in _w */
function pushOut(c: Col, x: Float32Array, i: number, m: number): boolean {
  const px = x[i], py = x[i + 1], pz = x[i + 2];
  if (c.kind === 'sphere') {
    const dx = px - c.p.x, dy = py - c.p.y, dz = pz - c.p.z, d2 = dx * dx + dy * dy + dz * dz, R = c.r + m;
    if (d2 >= R * R) return false;
    const d = Math.sqrt(d2) || 1e-6; _w.set(dx / d, dy / d, dz / d);
    x[i] = c.p.x + _w.x * R; x[i + 1] = c.p.y + _w.y * R; x[i + 2] = c.p.z + _w.z * R;
    return true;
  }
  _qi.copy(c.q).invert();
  _v.set(px - c.p.x, py - c.p.y, pz - c.p.z).applyQuaternion(_qi);
  const hx = c.half.x + m, hy = c.half.y + m, hz = c.half.z + m;
  const ox = hx - Math.abs(_v.x), oy = hy - Math.abs(_v.y), oz = hz - Math.abs(_v.z);
  if (ox <= 0 || oy <= 0 || oz <= 0) return false;
  if (ox < oy && ox < oz) { _v.x = Math.sign(_v.x || 1) * hx; _w.set(Math.sign(_v.x), 0, 0); }
  else if (oy < oz) { _v.y = Math.sign(_v.y || 1) * hy; _w.set(0, Math.sign(_v.y), 0); }
  else { _v.z = Math.sign(_v.z || 1) * hz; _w.set(0, 0, Math.sign(_v.z)); }
  _v.applyQuaternion(c.q); _w.applyQuaternion(c.q);
  x[i] = c.p.x + _v.x; x[i + 1] = c.p.y + _v.y; x[i + 2] = c.p.z + _v.z;
  return true;
}

// ================================================================ particle sets
/** what every simulated thing shares: positions, previous positions (verlet velocity), inverse masses, sleeping */
abstract class PSet {
  x: Float32Array; p: Float32Array; w: Float32Array; awake = true; still = 0;
  /** particle radius (collision margin), friction 0..1 on contact, bounce 0..1 */
  r = 0.01; fr = 0.5; bounce = 0.1; drag = 0.995; windK = 0;
  constructor(readonly n: number) { this.x = new Float32Array(n * 3); this.p = new Float32Array(n * 3); this.w = new Float32Array(n).fill(1); }
  centre(out = new V3()) { out.set(0, 0, 0); for (let i = 0; i < this.n; i++) out.x += this.x[i * 3], out.y += this.x[i * 3 + 1], out.z += this.x[i * 3 + 2]; return out.multiplyScalar(1 / this.n); }
  wake() { if (!this.awake) { this.awake = true; this.still = 0; } }
  /** add a velocity (m/s) to every particle, scaled per particle by f(i) */
  kick(v: THREE.Vector3, h: number, f: (i: number) => number = () => 1) { this.wake(); for (let i = 0; i < this.n; i++) if (this.w[i] > 0) { const k = f(i) * h; this.p[i * 3] -= v.x * k; this.p[i * 3 + 1] -= v.y * k; this.p[i * 3 + 2] -= v.z * k; } }
  abstract sync(): void;
  dispose() {}
}

// ================================================================ cloth
export class Cloth extends PSet {
  readonly cons: number[] = []; readonly rest: number[] = []; readonly stiff: number[] = [];
  readonly mesh: THREE.Mesh;
  /** pinned particles follow these points (cabin frame) */
  pins = new Map<number, THREE.Vector3>();
  constructor(readonly nx: number, readonly ny: number, at: (i: number, j: number) => THREE.Vector3, mat: THREE.Material, o: { pin?: (i: number, j: number) => boolean; uv?: (i: number, j: number) => [number, number] } = {}) {
    super(nx * ny);
    this.r = 0.012; this.fr = 0.55; this.windK = 1; this.drag = 0.99;
    const uv = new Float32Array(this.n * 2);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i, q = at(i, j);
      this.x.set([q.x, q.y, q.z], k * 3); this.p.set([q.x, q.y, q.z], k * 3);
      const u = o.uv ? o.uv(i, j) : [i / (nx - 1), j / (ny - 1)]; uv[k * 2] = u[0]; uv[k * 2 + 1] = u[1];
      if (o.pin?.(i, j)) { this.w[k] = 0; this.pins.set(k, q.clone()); }
    }
    const link = (a: number, b: number, s: number) => { this.cons.push(a, b); const dx = this.x[a * 3] - this.x[b * 3], dy = this.x[a * 3 + 1] - this.x[b * 3 + 1], dz = this.x[a * 3 + 2] - this.x[b * 3 + 2]; this.rest.push(Math.hypot(dx, dy, dz)); this.stiff.push(s); };
    const id = (i: number, j: number) => j * nx + i;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i + 1 < nx) link(id(i, j), id(i + 1, j), 1);
      if (j + 1 < ny) link(id(i, j), id(i, j + 1), 1);
      if (i + 1 < nx && j + 1 < ny) { link(id(i, j), id(i + 1, j + 1), 0.6); link(id(i + 1, j), id(i, j + 1), 0.6); }
      if (i + 2 < nx) link(id(i, j), id(i + 2, j), 0.12);
      if (j + 2 < ny) link(id(i, j), id(i, j + 2), 0.12);
    }
    const g = new THREE.BufferGeometry(), idx: number[] = [];
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1); idx.push(a, d, b, b, d, c); }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.x), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.userData.noBlur = true; this.mesh.userData.sim = this;
  }
  /** the cloth's links */
  solveLinks() {
    const x = this.x, w = this.w, C = this.cons;
    for (let k = 0, c = 0; k < C.length; k += 2, c++) {
      const a = C[k] * 3, b = C[k + 1] * 3, wa = w[C[k]], wb = w[C[k + 1]], ws = wa + wb; if (!ws) continue;
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
      const s = ((d - this.rest[c]) / d / ws) * this.stiff[c];
      x[a] += dx * s * wa; x[a + 1] += dy * s * wa; x[a + 2] += dz * s * wa;
      x[b] -= dx * s * wb; x[b + 1] -= dy * s * wb; x[b + 2] -= dz * s * wb;
    }
    for (const [i, q] of this.pins) { x[i * 3] = q.x; x[i * 3 + 1] = q.y; x[i * 3 + 2] = q.z; }
  }
  sync() { const P = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute; (P.array as Float32Array).set(this.x); P.needsUpdate = true; this.mesh.geometry.computeVertexNormals(); }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}

// ================================================================ ropes
export class Rope extends PSet {
  readonly seg: number; readonly mesh: THREE.Mesh; private sides = 6;
  pin: THREE.Vector3 | null; endObj: THREE.Object3D | null = null; endUp = new V3(0, 1, 0);
  constructor(pts: THREE.Vector3[], radius: number, mat: THREE.Material, o: { pinStart?: boolean; endMass?: number } = {}) {
    super(pts.length);
    this.r = radius; this.fr = 0.7; this.windK = 0.35; this.drag = 0.985;
    pts.forEach((q, i) => { this.x.set([q.x, q.y, q.z], i * 3); this.p.set([q.x, q.y, q.z], i * 3); });
    let L = 0; for (let i = 1; i < pts.length; i++) L += pts[i].distanceTo(pts[i - 1]);
    this.seg = L / (pts.length - 1);
    this.pin = o.pinStart === false ? null : pts[0].clone(); if (this.pin) this.w[0] = 0;
    if (o.endMass) this.w[this.n - 1] = 1 / o.endMass;
    const S = this.sides, pos = new Float32Array(this.n * S * 3), uv = new Float32Array(this.n * S * 2), idx: number[] = [];
    for (let i = 0; i < this.n; i++) for (let s = 0; s < S; s++) { uv[(i * S + s) * 2] = s / S; uv[(i * S + s) * 2 + 1] = i / (this.n - 1); }
    for (let i = 0; i < this.n - 1; i++) for (let s = 0; s < S; s++) { const a = i * S + s, b = i * S + ((s + 1) % S), c = a + S, d = b + S; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.userData.noBlur = true; this.mesh.userData.sim = this;
    this.sync();
  }
  solveLinks() {
    const x = this.x, w = this.w;
    for (let i = 0; i < this.n - 1; i++) {
      const a = i * 3, b = a + 3, wa = w[i], wb = w[i + 1], ws = wa + wb; if (!ws) continue;
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2], d = Math.hypot(dx, dy, dz) || 1e-6, s = (d - this.seg) / d / ws;
      x[a] += dx * s * wa; x[a + 1] += dy * s * wa; x[a + 2] += dz * s * wa; x[b] -= dx * s * wb; x[b + 1] -= dy * s * wb; x[b + 2] -= dz * s * wb;
    }
    if (this.pin) { x[0] = this.pin.x; x[1] = this.pin.y; x[2] = this.pin.z; }
  }
  sync() {
    const P = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute, a = P.array as Float32Array, S = this.sides, x = this.x;
    const t = new V3(), n = new V3(), b = new V3(), up = new V3(0, 1, 0);
    for (let i = 0; i < this.n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(this.n - 1, i + 1);
      t.set(x[i1 * 3] - x[i0 * 3], x[i1 * 3 + 1] - x[i0 * 3 + 1], x[i1 * 3 + 2] - x[i0 * 3 + 2]).normalize();
      n.crossVectors(t, Math.abs(t.y) > 0.9 ? _v.set(1, 0, 0) : up).normalize(); b.crossVectors(t, n);
      for (let s = 0; s < S; s++) {
        const ang = (s / S) * Math.PI * 2, c = Math.cos(ang) * this.r, sn = Math.sin(ang) * this.r, o = (i * S + s) * 3;
        a[o] = x[i * 3] + n.x * c + b.x * sn; a[o + 1] = x[i * 3 + 1] + n.y * c + b.y * sn; a[o + 2] = x[i * 3 + 2] + n.z * c + b.z * sn;
      }
    }
    P.needsUpdate = true; this.mesh.geometry.computeVertexNormals();
    if (this.endObj) {
      const e = (this.n - 1) * 3, e0 = (this.n - 2) * 3;
      this.endObj.position.set(x[e], x[e + 1], x[e + 2]);
      t.set(x[e0] - x[e], x[e0 + 1] - x[e + 1], x[e0 + 2] - x[e + 2]).normalize();
      this.endObj.quaternion.setFromUnitVectors(this.endUp, t);
    }
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}

// ================================================================ clusters (rigid and soft bodies)
export class Cluster extends PSet {
  /** rest offsets from the rest centroid (cabin axes) */
  readonly rest: Float32Array;
  q = new THREE.Quaternion(); c = new V3();
  /** the oriented box for body-body contact: half extents in the box's own axes, which sit at bq0 in the rest frame */
  half = new V3(); bq0 = new THREE.Quaternion(); rad = 0;
  /** a rigid follower: its pose relative to the cluster frame at rest */
  obj: THREE.Object3D | null = null; private op0 = new V3(); private oq0 = new THREE.Quaternion();
  /** a deforming mesh whose vertices are the particles (soft bodies) */
  mesh: THREE.Mesh | null = null;
  mass = 1; collideBodies = true; tag = '';
  constructor(pts: THREE.Vector3[], readonly k = 1) {
    super(pts.length);
    const c0 = new V3(); for (const q of pts) c0.add(q); c0.multiplyScalar(1 / pts.length);
    this.rest = new Float32Array(this.n * 3);
    pts.forEach((q, i) => { this.x.set([q.x, q.y, q.z], i * 3); this.p.set([q.x, q.y, q.z], i * 3); this.rest.set([q.x - c0.x, q.y - c0.y, q.z - c0.z], i * 3); this.rad = Math.max(this.rad, q.distanceTo(c0)); });
    this.c.copy(c0); this.r = 0.004; this.fr = 0.6; this.bounce = 0.18; this.drag = 0.998;
  }
  /** follow with a rigid object (its current pose, in the same frame as the particles) */
  follow(o: THREE.Object3D) { this.obj = o; this.op0.copy(o.position).sub(this.c); this.oq0.copy(o.quaternion); }
  setMass(m: number) { this.mass = m; this.w.fill(this.n / Math.max(1e-3, m)); }
  /** pull the particles toward the best-fit rotation of the rest shape (k = 1: exactly rigid) */
  solveShape() {
    const x = this.x, R = this.rest, n = this.n, c = this.centre(this.c);
    // A = sum (x - c) rest^T, column-major
    const A = new Float64Array(9);
    for (let i = 0; i < n; i++) {
      const dx = x[i * 3] - c.x, dy = x[i * 3 + 1] - c.y, dz = x[i * 3 + 2] - c.z, rx = R[i * 3], ry = R[i * 3 + 1], rz = R[i * 3 + 2];
      A[0] += dx * rx; A[1] += dy * rx; A[2] += dz * rx; A[3] += dx * ry; A[4] += dy * ry; A[5] += dz * ry; A[6] += dx * rz; A[7] += dy * rz; A[8] += dz * rz;
    }
    // the rotational part (Muller, Bender, Chentanez, Macklin 2016): a few corrective rotations of q toward A
    const q = this.q;
    for (let it = 0; it < 6; it++) {
      _m4.makeRotationFromQuaternion(q); const e = _m4.elements;
      let ox = 0, oy = 0, oz = 0, dd = 0;
      for (let col = 0; col < 3; col++) {
        const rx = e[col * 4], ry = e[col * 4 + 1], rz = e[col * 4 + 2], ax = A[col * 3], ay = A[col * 3 + 1], az = A[col * 3 + 2];
        ox += ry * az - rz * ay; oy += rz * ax - rx * az; oz += rx * ay - ry * ax; dd += rx * ax + ry * ay + rz * az;
      }
      const s = 1 / (Math.abs(dd) + 1e-9); ox *= s; oy *= s; oz *= s;
      const wl = Math.hypot(ox, oy, oz); if (wl < 1e-9) break;
      _q.setFromAxisAngle(_v.set(ox / wl, oy / wl, oz / wl), wl); q.premultiply(_q).normalize();
    }
    const k = this.k;
    for (let i = 0; i < n; i++) {
      if (this.w[i] === 0) continue;
      _v.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]).applyQuaternion(q).add(c);
      x[i * 3] += (_v.x - x[i * 3]) * k; x[i * 3 + 1] += (_v.y - x[i * 3 + 1]) * k; x[i * 3 + 2] += (_v.z - x[i * 3 + 2]) * k;
    }
  }
  sync() {
    if (this.obj) { this.obj.position.copy(this.op0).applyQuaternion(this.q).add(this.c); this.obj.quaternion.copy(this.q).multiply(this.oq0); }
    if (this.mesh) { const P = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute; (P.array as Float32Array).set(this.x); P.needsUpdate = true; this.mesh.geometry.computeVertexNormals(); }
  }
  dispose() { if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); } }
}
/** a rigid body for an object: its local box (from its meshes, or given) as eight corner particles */
export function rigidFor(o: THREE.Object3D, frame: THREE.Object3D, o2: { box?: THREE.Box3; mass?: number } = {}): Cluster | null {
  frame.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
  let box = o2.box ?? null;
  if (!box) {
    box = new THREE.Box3(); const b = new THREE.Box3();
    o.traverse((m) => { const g = (m as THREE.Mesh).geometry; if (!(m as THREE.Mesh).isMesh || !g) return; if (!g.boundingBox) g.computeBoundingBox(); b.copy(g.boundingBox!).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); box!.union(b); });
    if (box.isEmpty()) return null;
  }
  const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(o.matrixWorld);
  const pts: THREE.Vector3[] = [];
  for (const X of [box.min.x, box.max.x]) for (const Y of [box.min.y, box.max.y]) for (const Z of [box.min.z, box.max.z]) pts.push(new V3(X, Y, Z).applyMatrix4(toFrame));
  const cl = new Cluster(pts, 1);
  const s = new V3(); const pos = new V3(); const rq = new THREE.Quaternion(); toFrame.decompose(pos, rq, s);
  box.getSize(cl.half).multiply(s).multiplyScalar(0.5); cl.bq0.copy(rq);
  // the object's pose in the cabin frame, so the follower lands where it stood
  const f = new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(o.matrixWorld); f.decompose(o.position, o.quaternion, o.scale);
  if (o.parent !== frame) frame.attach(o);
  cl.follow(o);
  const vol = Math.max(1e-5, cl.half.x * cl.half.y * cl.half.z * 8);
  cl.setMass(o2.mass ?? Math.min(30, Math.max(0.05, vol * 400)));
  return cl;
}
/** a soft body from a mesh (the pillow): its vertices as particles held to their rest shape at stiffness k */
export function softFor(m: THREE.Mesh, frame: THREE.Object3D, mat: THREE.Material, k = 0.22): Cluster {
  frame.updateMatrixWorld(true);
  const toFrame = new THREE.Matrix4().copy(frame.matrixWorld).invert().multiply(m.matrixWorld);
  const g = m.geometry.clone(); g.applyMatrix4(toFrame);
  const P = g.getAttribute('position') as THREE.BufferAttribute, pts: THREE.Vector3[] = [];
  for (let i = 0; i < P.count; i++) pts.push(new V3(P.getX(i), P.getY(i), P.getZ(i)));
  const cl = new Cluster(pts, k);
  const bb = new THREE.Box3().setFromPoints(pts); bb.getSize(cl.half).multiplyScalar(0.5);
  cl.mesh = new THREE.Mesh(g, mat); cl.mesh.castShadow = cl.mesh.receiveShadow = true; cl.mesh.frustumCulled = false; cl.mesh.userData.noBlur = true; cl.mesh.userData.sim = cl;
  cl.r = 0.008; cl.fr = 0.8; cl.bounce = 0.05; cl.setMass(0.5); cl.collideBodies = false;
  return cl;
}

// ================================================================ the solver
export interface Grab { set: PSet; i: number; target: THREE.Vector3 }
export class PodPhysics {
  readonly g = 9.8;
  /** colliders: the cabin's fixed furniture, rebuilt pieces and the carried piece are set by the owner each frame */
  statics: Col[] = []; dyn: Col[] = [];
  bodies: Cluster[] = []; cloths: Cloth[] = []; ropes: Rope[] = []; softs: Cluster[] = [];
  winds: Wind[] = [];
  grab: Grab | null = null;
  t = 0; paused = false; private acc = 0;
  constructor(readonly R: number, readonly parent: THREE.Object3D) {}
  add<T extends PSet>(s: T): T {
    if (s instanceof Cloth) { this.cloths.push(s); this.parent.add(s.mesh); }
    else if (s instanceof Rope) { this.ropes.push(s); this.parent.add(s.mesh); }
    else if (s instanceof Cluster) { if (s.mesh) { this.softs.push(s); this.parent.add(s.mesh); } else this.bodies.push(s); }
    return s;
  }
  remove(s: PSet) {
    for (const L of [this.bodies, this.cloths, this.ropes, this.softs] as PSet[][]) { const i = L.indexOf(s); if (i >= 0) L.splice(i, 1); }
    if (this.grab?.set === s) this.grab = null;
    s.dispose();
  }
  all(): PSet[] { return [...this.bodies, ...this.softs, ...this.cloths, ...this.ropes]; }
  /** a shove from a point: wakes what is near and throws it away from p (and up), strength in m/s at the centre */
  impulse(p: THREE.Vector3, r: number, k: number, up = 0.6) {
    const d = new V3();
    for (const s of this.all()) {
      const c = s.centre(_w); d.copy(c).sub(p); const L = d.length(); if (L > r) continue;
      const f = (1 - L / r) * k; d.y = Math.max(0, d.y); d.normalize().multiplyScalar(f); d.y += f * up;
      s.kick(d, 1 / 60, (i) => (s instanceof Cloth || s instanceof Rope ? Math.max(0, 1 - Math.hypot(s.x[i * 3] - p.x, s.x[i * 3 + 1] - p.y, s.x[i * 3 + 2] - p.z) / r) : 1));
    }
  }
  wakeNear(p: THREE.Vector3, r: number) { for (const s of this.all()) if (!s.awake && s.centre(_w).distanceTo(p) < r + 0.5) s.wake(); }
  /** advance by dt (fixed 1/60 steps, at most six a frame) */
  step(dt: number) {
    if (this.paused) return;
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= 1 / 60 && n < 6) { this.sub(1 / 60); this.acc -= 1 / 60; n++; }
    if (n === 6) this.acc = 0;
    if (n) this.sync();
  }
  /** run the world for a while without drawing (settling, QA) */
  settle(sec: number) { for (let t = 0; t < sec; t += 1 / 60) this.sub(1 / 60); this.sync(); }
  sync() { for (const s of this.all()) if (s.awake || s instanceof Rope) s.sync(); }
  private sub(h: number) {
    this.t += h;
    for (let i = this.winds.length - 1; i >= 0; i--) { const wd = this.winds[i]; if (wd.ttl !== undefined && (wd.ttl -= h) <= 0) this.winds.splice(i, 1); }
    const cols = [...this.statics, ...this.dyn];
    // a moving collider wakes what it reaches
    for (const c of cols) if (c.v.lengthSq() > 0.0025) this.wakeNear(c.p, Math.max(c.r, c.half.length()));
    const sets = this.all();
    for (const s of sets) if (s.awake) this.integrate(s, h);
    if (this.grab) this.grab.set.wake();
    for (let it = 0; it < 6; it++) {
      for (const c of this.cloths) if (c.awake) c.solveLinks();
      for (const r of this.ropes) if (r.awake) r.solveLinks();
      for (const b of this.bodies) if (b.awake) b.solveShape();
      for (const b of this.softs) if (b.awake) b.solveShape();
      if (it % 2 === 0) this.bodyContacts();
      for (const s of sets) if (s.awake) this.contacts(s, cols);
      if (this.grab) { const { set, i, target } = this.grab, x = set.x; x[i * 3] += (target.x - x[i * 3]) * 0.5; x[i * 3 + 1] += (target.y - x[i * 3 + 1]) * 0.5; x[i * 3 + 2] += (target.z - x[i * 3 + 2]) * 0.5; }
    }
    for (const s of sets) if (s.awake) this.sleepCheck(s);
  }
  private integrate(s: PSet, h: number) {
    const x = s.x, p = s.p, w = s.w, g = this.g * h * h, t = this.t;
    for (let i = 0; i < s.n; i++) {
      if (w[i] === 0) continue;
      const k = i * 3;
      let ax = 0, ay = -g, az = 0;
      if (s.windK) for (const wd of this.winds) {
        const dx = x[k] - wd.p.x, dy = x[k + 1] - wd.p.y, dz = x[k + 2] - wd.p.z, along = dx * wd.dir.x + dy * wd.dir.y + dz * wd.dir.z;
        if (along < -0.1) continue;
        const ox = dx - wd.dir.x * along, oy = dy - wd.dir.y * along, oz = dz - wd.dir.z * along, off = Math.hypot(ox, oy, oz), spread = wd.r * (0.4 + along * 0.5);
        if (off > spread) continue;
        const gust = 1 + wd.gust * (Math.sin(t * 2.3 + i * 0.37) * 0.5 + Math.sin(t * 5.1 + i * 0.11) * 0.3);
        const f = wd.k * s.windK * (1 - off / spread) / (1 + along * 0.8) * gust * h * h;
        ax += wd.dir.x * f; ay += wd.dir.y * f; az += wd.dir.z * f;
      }
      const vx = (x[k] - p[k]) * s.drag, vy = (x[k + 1] - p[k + 1]) * s.drag, vz = (x[k + 2] - p[k + 2]) * s.drag;
      p[k] = x[k]; p[k + 1] = x[k + 1]; p[k + 2] = x[k + 2];
      x[k] += vx + ax; x[k + 1] += vy + ay; x[k + 2] += vz + az;
    }
  }
  /** the deck, the cabin wall and every collider */
  private contacts(s: PSet, cols: Col[]) {
    const x = s.x, p = s.p, r = s.r, Rw = this.R - 0.04 - r;
    for (let i = 0; i < s.n; i++) {
      if (s.w[i] === 0) continue;
      const k = i * 3;
      if (x[k + 1] < r) { const vy = x[k + 1] - p[k + 1]; x[k + 1] = r; p[k + 1] = r + vy * s.bounce; p[k] += (x[k] - p[k]) * s.fr; p[k + 2] += (x[k + 2] - p[k + 2]) * s.fr; }
      const d = Math.hypot(x[k], x[k + 2]);
      if (d > Rw) { x[k] *= Rw / d; x[k + 2] *= Rw / d; p[k] += (x[k] - p[k]) * s.fr; p[k + 1] += (x[k + 1] - p[k + 1]) * s.fr * 0.5; p[k + 2] += (x[k + 2] - p[k + 2]) * s.fr; }
      for (const c of cols) if (pushOut(c, x, k, r)) {
        // friction, and a moving collider carries the point along with it
        p[k] += (x[k] - p[k]) * s.fr - c.v.x / 60; p[k + 1] += (x[k + 1] - p[k + 1]) * s.fr * 0.5 - c.v.y / 60; p[k + 2] += (x[k + 2] - p[k + 2]) * s.fr - c.v.z / 60;
      }
      // cloth and ropes rest on the bodies and the pillow
      if (!(s instanceof Cluster)) for (const b of [...this.bodies, ...this.softs]) {
        if (Math.hypot(x[k] - b.c.x, x[k + 1] - b.c.y, x[k + 2] - b.c.z) > b.rad + r + 0.02) continue;
        _q.copy(b.q).multiply(b.bq0);
        const tmpCol: Col = { kind: 'box', p: b.c, r: 0, half: b.half, q: _q, v: _v.set(0, 0, 0) };
        if (pushOut(tmpCol, x, k, r)) p[k] += (x[k] - p[k]) * s.fr, p[k + 2] += (x[k + 2] - p[k + 2]) * s.fr;
      }
    }
  }
  /** rigid bodies against each other: each one's particles pushed out of the other's box, the push shared by mass */
  private bodyContacts() {
    const B = this.bodies, qa = new THREE.Quaternion();
    for (let a = 0; a < B.length; a++) for (let b = 0; b < B.length; b++) {
      if (a === b) continue;
      const A = B[a], C = B[b];
      if (!A.collideBodies || !C.collideBodies || (!A.awake && !C.awake)) continue;
      if (A.c.distanceTo(C.c) > A.rad + C.rad) continue;
      qa.copy(C.q).multiply(C.bq0);
      const col: Col = { kind: 'box', p: C.c, r: 0, half: C.half, q: qa, v: new V3() };
      const wa = 1 / A.mass, wc = 1 / C.mass, f = wa / (wa + wc);
      for (let i = 0; i < A.n; i++) {
        const k = i * 3, ox = A.x[k], oy = A.x[k + 1], oz = A.x[k + 2];
        if (!pushOut(col, A.x, k, 0.002)) continue;
        const dx = A.x[k] - ox, dy = A.x[k + 1] - oy, dz = A.x[k + 2] - oz;
        // A's point takes its share; C moves the other way as a whole
        A.x[k] = ox + dx * f; A.x[k + 1] = oy + dy * f; A.x[k + 2] = oz + dz * f;
        A.p[k] += (A.x[k] - A.p[k]) * A.fr * 0.5; A.p[k + 2] += (A.x[k + 2] - A.p[k + 2]) * A.fr * 0.5;
        // the whole of C steps back by its share (halved: many corners can push in one pass)
        const g2 = (1 - f) * 0.5;
        for (let j = 0; j < C.n; j++) { C.x[j * 3] -= dx * g2; C.x[j * 3 + 1] -= dy * g2; C.x[j * 3 + 2] -= dz * g2; }
        if (!C.awake && Math.hypot(dx, dy, dz) > 0.002) C.wake();
      }
    }
  }
  private sleepCheck(s: PSet) {
    let m = 0;
    for (let i = 0; i < s.n; i++) { const k = i * 3; m = Math.max(m, Math.abs(s.x[k] - s.p[k]) + Math.abs(s.x[k + 1] - s.p[k + 1]) + Math.abs(s.x[k + 2] - s.p[k + 2])); }
    const windy = s.windK > 0 && this.winds.length > 0;
    if (m < 0.0007 && !windy && this.grab?.set !== s) { if (++s.still > 50) { s.awake = false; s.p.set(s.x); s.sync(); } } else s.still = 0;
  }
  /** the particle nearest a point (for the cursor's grab) */
  nearest(pt: THREE.Vector3, maxD = 0.35): { set: PSet; i: number } | null {
    let best: { set: PSet; i: number } | null = null, bd = maxD;
    for (const s of this.all()) for (let i = 0; i < s.n; i++) {
      if (s.w[i] === 0) continue;
      const d = Math.hypot(s.x[i * 3] - pt.x, s.x[i * 3 + 1] - pt.y, s.x[i * 3 + 2] - pt.z);
      if (d < bd) { bd = d; best = { set: s, i }; }
    }
    return best;
  }
  dispose() { for (const s of this.all()) s.dispose(); this.bodies = []; this.cloths = []; this.ropes = []; this.softs = []; }
}
