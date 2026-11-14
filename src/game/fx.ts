// Effects: pixel-square particles (glow + matter), homing life-force motes, lightning arcs, writhing tendrils,
// directional sprays (blood, sparks, grit) and vortex streams (matter spiralling into the golem's intake).
import * as THREE from 'three';
import { GN_DECL } from '../gfx/gbuf';
import { VEYR } from '../world/palette';

const PVERT = /* glsl */`
attribute float aSize; attribute vec4 aCol;
varying vec4 vCol;
uniform float uScale;
void main() {
  vCol = aCol;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, floor(aSize * uScale / -mv.z + 0.5));
}`;
const PFRAG = /* glsl */`
varying vec4 vCol;
void main() { if (vCol.a <= 0.003) discard; gl_FragColor = vec4(vCol.rgb * vCol.a, vCol.a); }`;

class Pool {
  readonly n: number; i = 0;
  readonly pos: Float32Array; readonly vel: Float32Array; readonly col: Float32Array; readonly base: Float32Array; readonly size: Float32Array;
  readonly life: Float32Array; readonly max: Float32Array; readonly grav: Float32Array; readonly home: Float32Array; readonly drag: Float32Array;
  readonly points: THREE.Points; private g: THREE.BufferGeometry;
  constructor(n: number, additive: boolean, readonly U: { uScale: { value: number } }) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.base = new Float32Array(n * 4);
    this.size = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n); this.home = new Float32Array(n * 4); this.drag = new Float32Array(n);
    const g = (this.g = new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      vertexShader: PVERT, fragmentShader: PFRAG, uniforms: U, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: additive ? THREE.ZeroFactor : THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, c: THREE.Color, a: number, size: number, life: number, grav = 0, drag = 0, home?: [number, number, number, number]) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3);
    this.base.set([c.r, c.g, c.b, a], i * 4); this.col.set([c.r, c.g, c.b, a], i * 4);
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag;
    if (home) this.home.set(home, i * 4); else this.home[i * 4 + 3] = 0;
  }
  /** write particle i directly (streams re-place every particle each frame), then flush(n) */
  put(i: number, x: number, y: number, z: number, c: THREE.Color, a: number, size: number) {
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c.r; this.col[i * 4 + 1] = c.g; this.col[i * 4 + 2] = c.b; this.col[i * 4 + 3] = a; this.size[i] = size;
  }
  flush(n: number) {
    for (let i = n; i < this.n; i++) { if (!this.col[i * 4 + 3]) break; this.col[i * 4 + 3] = 0; }
    (this.g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.g.attributes.aCol as THREE.BufferAttribute).needsUpdate = true;
    (this.g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
  update(dt: number) {
    const p = this.pos, v = this.vel;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      const hs = this.home[i * 4 + 3];
      if (hs > 0) { // homing mote: accelerate toward home, hugging the ground a little
        const hx = this.home[i * 4] - p[k], hz = this.home[i * 4 + 2] - p[k + 2];
        const flat = Math.hypot(hx, hz);
        const hy = (flat > 4 ? this.home[i * 4 + 1] - 1.6 : this.home[i * 4 + 1]) - p[k + 1];
        const d = Math.hypot(hx, hy, hz) || 1;
        if (d < 0.6) { this.life[i] = 0; continue; }
        const sp = Math.min(hs * (1.2 + (this.max[i] - this.life[i]) * 0.9), 26);
        v[k] += ((hx / d) * sp - v[k]) * Math.min(1, dt * 3); v[k + 1] += ((hy / d) * sp - v[k + 1]) * Math.min(1, dt * 3); v[k + 2] += ((hz / d) * sp - v[k + 2]) * Math.min(1, dt * 3);
        this.life[i] = Math.max(this.life[i], 0.05);
      }
      v[k + 1] -= this.grav[i] * dt;
      const dr = 1 - this.drag[i] * dt;
      v[k] *= dr; v[k + 1] *= dr; v[k + 2] *= dr;
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      const t = this.life[i] / this.max[i];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * (hs > 0 ? 1 : Math.min(1, t * 2.5));
    }
    (this.g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.g.attributes.aCol as THREE.BufferAttribute).needsUpdate = true;
    (this.g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }
}

interface Arc { a: THREE.Vector3; b: THREE.Vector3; t: number; life: number; col: THREE.Color; jag: number }
type Get = () => THREE.Vector3 | null;
interface Strm { a: Get; b: Get; t: number; sp: number; ang: number; angSp: number; rad: number; arc: number; r: number; g: number; b2: number; size: number; glow: boolean; A: THREE.Vector3; B: THREE.Vector3 }

/** a point on a vortex path from A to B: it lifts, swirls round the line between them, tightening as it nears B */
export function spiralPos(out: THREE.Vector3, A: THREE.Vector3, B: THREE.Vector3, t: number, ang: number, rad: number, arc = 0.4) {
  const e = t * t * (3 - 2 * t);
  out.lerpVectors(A, B, e);
  const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1;
  const px = -dz / l, pz = dx / l, k = rad * Math.pow(1 - t, 0.8) * Math.min(1, t * 6 + 0.2);
  out.x += px * Math.cos(ang) * k; out.z += pz * Math.cos(ang) * k; out.y += Math.sin(ang) * k + Math.sin(t * Math.PI) * arc;
  return out;
}
interface Tendril { root: THREE.Vector3; tip: () => THREE.Vector3 | null; t: number; life: number; seg: number; thick: number; phase: number; grow: number }

const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3();

export class Fx {
  readonly U = { uScale: { value: 600 } };
  /** particle size multiplier: the close-up player camera shrinks the pixel squares so they keep a sane size */
  sizeK = 1;
  readonly glow: Pool; readonly matter: Pool;
  private sMatter: Pool; private sGlow: Pool;
  private arcs: Arc[] = [];
  private arcGeo = new THREE.BufferGeometry();
  private arcPos = new Float32Array(6 * 2000); private arcCol = new Float32Array(6 * 2000);
  readonly arcLines: THREE.LineSegments;
  private tendrils: Tendril[] = [];
  readonly tendrilMesh: THREE.InstancedMesh;
  private tm = new THREE.Matrix4(); private tq = new THREE.Quaternion(); private ts = new THREE.Vector3();
  private strm: Strm[] = [];
  constructor(fxScene: THREE.Scene, scene: THREE.Scene) {
    this.glow = new Pool(4096, true, this.U); this.matter = new Pool(2048, false, this.U);
    this.sMatter = new Pool(1400, false, this.U); this.sGlow = new Pool(700, true, this.U);
    fxScene.add(this.glow.points, this.matter.points, this.sMatter.points, this.sGlow.points);
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.arcGeo.setAttribute('color', new THREE.BufferAttribute(this.arcCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.arcLines = new THREE.LineSegments(this.arcGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.arcLines.frustumCulled = false;
    fxScene.add(this.arcLines);
    // tendrils: instanced moss segments, opaque so they get outlined
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', GN_DECL + 'void main() {')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngNormal = vec4(inverseTransformDirection(normalize(normal), viewMatrix) * 0.5 + 0.5, 1.0 + 32.0 * step(1.5, vColor.r + vColor.g + vColor.b));');
    };
    m.customProgramCacheKey = () => 'oddworld-tendril';
    this.tendrilMesh = new THREE.InstancedMesh(g, m, 1600);
    this.tendrilMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1600 * 3), 3);
    this.tendrilMesh.count = 0;
    this.tendrilMesh.frustumCulled = false;
    this.tendrilMesh.castShadow = true;
    scene.add(this.tendrilMesh);
  }

  burst(x: number, y: number, z: number, n: number, col: number, o: { speed?: number; up?: number; size?: number; life?: number; grav?: number; glow?: boolean; spread?: number } = {}) {
    const pool = o.glow ? this.glow : this.matter;
    _c.set(col);
    if (o.glow) _c.multiplyScalar(1.6);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (o.speed ?? 2) * (0.4 + Math.random() * 0.8), sp = o.spread ?? 1;
      pool.emit(x + (Math.random() - 0.5) * sp * 0.3, y + Math.random() * 0.2, z + (Math.random() - 0.5) * sp * 0.3, Math.cos(a) * s * sp, (o.up ?? 2) * (0.5 + Math.random()), Math.sin(a) * s * sp, _c, 1, (o.size ?? 3) * (0.7 + Math.random() * 0.6), (o.life ?? 0.8) * (0.6 + Math.random() * 0.8), o.grav ?? 6, 1.5);
    }
  }
  /** a cone of particles along a direction (blood from a wound, sparks off steel, grit off a drill bit) */
  spray(x: number, y: number, z: number, dx: number, dy: number, dz: number, n: number, col: number, o: { speed?: number; cone?: number; size?: number; life?: number; grav?: number; glow?: boolean; drag?: number; jitter?: number } = {}) {
    const pool = o.glow ? this.glow : this.matter, l = Math.hypot(dx, dy, dz) || 1, cone = o.cone ?? 0.5, sp = o.speed ?? 3, j = o.jitter ?? 0.12;
    dx /= l; dy /= l; dz /= l;
    const base = _c2.set(col);
    for (let i = 0; i < n; i++) {
      const s = sp * (0.45 + Math.random() * 0.85);
      _c.copy(base).multiplyScalar((o.glow ? 1.8 : 1) * (0.75 + Math.random() * 0.4));
      pool.emit(x + (Math.random() - 0.5) * j, y + (Math.random() - 0.5) * j, z + (Math.random() - 0.5) * j,
        (dx + (Math.random() - 0.5) * cone * 2) * s, (dy + (Math.random() - 0.5) * cone * 2) * s, (dz + (Math.random() - 0.5) * cone * 2) * s,
        _c, 1, (o.size ?? 2.4) * (0.6 + Math.random() * 0.8), (o.life ?? 0.6) * (0.6 + Math.random() * 0.8), o.grav ?? 9, o.drag ?? 1.2);
    }
  }
  /** matter streaming along a vortex from a to b (both re-read every frame); n particles over spread seconds */
  stream(a: Get, b: Get, n: number, col: number, o: { dur?: number; rad?: number; arc?: number; size?: number; glow?: boolean; spread?: number } = {}) {
    const A = a(), B = b(); if (!A || !B) return;
    const c = _c2.set(col);
    for (let i = 0; i < n && this.strm.length < 2000; i++) {
      const k = 0.8 + Math.random() * 0.4;
      this.strm.push({ a, b, t: -Math.random() * (o.spread ?? 0), sp: 1 / ((o.dur ?? 0.8) * (0.7 + Math.random() * 0.6)), ang: Math.random() * Math.PI * 2, angSp: 7 + Math.random() * 6, rad: (o.rad ?? 0.4) * (0.5 + Math.random()), arc: (o.arc ?? 0.3) * (0.5 + Math.random()), r: c.r * k, g: c.g * k, b2: c.b * k, size: (o.size ?? 2.2) * (0.7 + Math.random() * 0.6), glow: !!o.glow, A: A.clone(), B: B.clone() });
    }
  }
  /** a glowing mote that flies home (life force returning to the core) */
  mote(x: number, y: number, z: number, hx: number, hy: number, hz: number, col = VEYR.vein, speed = 4) {
    _c.set(col).multiplyScalar(2.6);
    this.glow.emit(x, y, z, (Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, _c, 1, 1.6, 12, 0, 0.5, [hx, hy, hz, speed]);
  }
  arc(a: THREE.Vector3, b: THREE.Vector3, life = 0.25, col = VEYR.em, jag = 0.35) { this.arcs.push({ a: a.clone(), b: b.clone(), t: 0, life, col: new THREE.Color(col).multiplyScalar(2.4), jag }); }
  tendril(root: THREE.Vector3, tip: () => THREE.Vector3 | null, life: number, thick = 0.09, seg = 9) {
    this.tendrils.push({ root: root.clone(), tip, t: 0, life, seg, thick, phase: Math.random() * 10, grow: 0 });
  }

  update(dt: number, viewH: number, fovY: number) {
    this.U.uScale.value = viewH / (2 * Math.tan((fovY * Math.PI) / 360)) * 0.032 * this.sizeK;
    // vortex streams: every particle is re-placed on its spiral each frame
    let nm = 0, ng = 0;
    for (let i = this.strm.length - 1; i >= 0; i--) {
      const p = this.strm[i];
      p.t += dt * p.sp;
      if (p.t < 0) continue;
      const A = p.a(), B = p.b();
      if (A) p.A.copy(A); if (B) p.B.copy(B);
      if (p.t >= 1 || (!A && !B)) { this.strm[i] = this.strm[this.strm.length - 1]; this.strm.pop(); continue; }
      p.ang += dt * p.angSp * (1 + p.t * 2.5);
      spiralPos(_v, p.A, p.B, p.t, p.ang, p.rad, p.arc);
      _c.setRGB(p.r, p.g, p.b2);
      if (p.glow) { if (ng < this.sGlow.n) this.sGlow.put(ng++, _v.x, _v.y, _v.z, _c.multiplyScalar(1.8), 1, p.size * (1 - p.t * 0.5)); }
      else if (nm < this.sMatter.n) this.sMatter.put(nm++, _v.x, _v.y, _v.z, _c, 1, p.size * (1 - p.t * 0.4));
    }
    this.sMatter.flush(nm); this.sGlow.flush(ng);
    this.glow.update(dt); this.matter.update(dt);
    // arcs: jagged polylines re-rolled every frame
    let n = 0;
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.t += dt;
      if (a.t >= a.life) { this.arcs.splice(i, 1); continue; }
      const segs = 7, fade = 1 - a.t / a.life;
      let px = a.a.x, py = a.a.y, pz = a.a.z;
      const len = a.a.distanceTo(a.b);
      for (let s = 1; s <= segs && n < 1990; s++) {
        const t = s / segs;
        _v.lerpVectors(a.a, a.b, t);
        if (s < segs) { const j = a.jag * len * 0.18; _v.x += (Math.random() - 0.5) * j; _v.y += (Math.random() - 0.5) * j; _v.z += (Math.random() - 0.5) * j; }
        this.arcPos.set([px, py, pz, _v.x, _v.y, _v.z], n * 6);
        this.arcCol.set([a.col.r * fade, a.col.g * fade, a.col.b * fade, a.col.r * fade, a.col.g * fade, a.col.b * fade], n * 6);
        px = _v.x; py = _v.y; pz = _v.z; n++;
      }
    }
    this.arcGeo.setDrawRange(0, n * 2);
    (this.arcGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.arcGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    // tendrils
    let k = 0;
    const tm = this.tendrilMesh;
    for (let i = this.tendrils.length - 1; i >= 0; i--) {
      const td = this.tendrils[i];
      td.t += dt;
      const tip = td.tip();
      if (td.t >= td.life || !tip) { this.tendrils.splice(i, 1); continue; }
      td.grow = Math.min(1, td.grow + dt * 3) * Math.min(1, (td.life - td.t) * 2.5);
      const r = td.root;
      const mid = _v.set((r.x + tip.x) / 2, Math.max(r.y, tip.y) + r.distanceTo(tip) * 0.35, (r.z + tip.z) / 2);
      let px = r.x, py = r.y, pz = r.z;
      for (let s = 1; s <= td.seg && k < 1600; s++) {
        const t = (s / td.seg) * td.grow, u = 1 - t;
        const w = Math.sin(td.t * 7 + td.phase + s * 0.9) * 0.18 * Math.sin(t * Math.PI);
        const x = u * u * r.x + 2 * u * t * mid.x + t * t * tip.x + w;
        const y = u * u * r.y + 2 * u * t * mid.y + t * t * tip.y;
        const z = u * u * r.z + 2 * u * t * mid.z + t * t * tip.z - w;
        const dx = x - px, dy = y - py, dz = z - pz, l = Math.hypot(dx, dy, dz) || 1e-3;
        this.tq.setFromUnitVectors(_dirY, _tmp.set(dx / l, dy / l, dz / l));
        const th = td.thick * (1 - (s / td.seg) * 0.6);
        this.tm.compose(_tmp.set((x + px) / 2, (y + py) / 2, (z + pz) / 2), this.tq, this.ts.set(th, l * 1.15, th));
        tm.setMatrixAt(k, this.tm);
        _c.set(s === td.seg ? VEYR.vein : s % 2 ? VEYR.moss : VEYR.mossDark);
        if (s === td.seg) _c.multiplyScalar(2.2);
        tm.setColorAt(k, _c);
        k++;
        px = x; py = y; pz = z;
      }
    }
    tm.count = k;
    tm.instanceMatrix.needsUpdate = true;
    if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
  }
}
const _dirY = new THREE.Vector3(0, 1, 0), _tmp = new THREE.Vector3();
