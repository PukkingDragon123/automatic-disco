// The desk's bigger instruments: the holographic terrain table (a live relief of the region you can tilt, ping and
// order units across), the telemetry CRT with its GAIN and TUNE knobs, the orrery (the sun and the two moons
// wheeling round a little planet: the eclipse and the bloodtide come visibly closer), and the inspection clipboard
// that slides up when something is selected, its actions as real keys.
import * as THREE from 'three';
import { mat, tex, box, cyl, lathe, quad, mesh, facet, type DeskMat } from './gfx';
import { M, LiveDecal, Spring, clamp01 } from './kit';
import { R, Pix, text3s, iconPix } from './paint';
import { decal } from './kit';
import { label } from './paint';

// ------------------------------------------------------------------ holographic terrain table
export interface MapData {
  N: number; h: Float32Array | number[]; water: number;
  /** colour per cell index, or null to skip */
  cell(i: number): number;
}
export class HoloTable {
  readonly root = new THREE.Group();
  readonly tilt = new THREE.Group();
  readonly relief: THREE.Mesh;
  private col: Float32Array; private pos: Float32Array; private G = 34;
  private pins: THREE.InstancedMesh; private pinN = 0;
  private sweep: THREE.Mesh; private sweepM: DeskMat; private ping: THREE.Mesh; private pingT = 9;
  private foot: THREE.Mesh[] = [];
  readonly S: number;
  yaw = new Spring(0.5, 60, 9); pitch = new Spring(0, 60, 9); yawT = 0.5; pitchT = 0;
  scan = 0; private t = 0;
  constructor(S = 110) {
    this.S = S;
    const st = M('steel', { spec: 1 }), ol = M('olive');
    // the table: an olive cabinet, a steel rim, the projector glass flush in the top
    this.root.add(mesh(box(S + 14, 8, S + 14), ol, 0, -4, 0));
    this.root.add(mesh(box(S + 16, 2, S + 16), st, 0, 0.5, 0));
    this.root.add(mesh(box(S + 4, 0.6, S + 4), mat({ tint: R.ink[1] }), 0, 1.6, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.root.add(mesh(cyl(1.6, 1.6, 2, 6), M('brass', { spec: 1 }), x * (S / 2 + 5), 2, z * (S / 2 + 5)));
    // the relief: a faceted grid, each cell one flat colour (crisp, like a pixel map raised into hills)
    const G = this.G, n = G * G * 6;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.relief = new THREE.Mesh(g, mat({ vcol: true, flat: 0.35, emit: 0.55, outline: false }));
    this.tilt.add(this.relief);
    // pins: Unit 07, allies, wildlife, rivals, structures
    this.pins = new THREE.InstancedMesh(facet(new THREE.ConeGeometry(1.4, 4, 4).translate(0, 2, 0)), mat({ emit: 0.5, flat: 0.4 }), 200);
    this.pins.count = 0;
    this.tilt.add(this.pins);
    // the scan sweep: a thin bright wedge turning round the table
    const sw = new THREE.BufferGeometry(), sp: number[] = [], K = 6;
    for (let i = 0; i < K; i++) { const a0 = (i / K) * 0.22, a1 = ((i + 1) / K) * 0.22, r = S * 0.7; sp.push(0, 0, 0, Math.sin(a0) * r, 0, Math.cos(a0) * r, Math.sin(a1) * r, 0, Math.cos(a1) * r); }
    sw.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sw.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((sp.length / 3) * 2).fill(0.5), 2)); sw.computeVertexNormals();
    this.sweepM = mat({ tint: R.glowTeal[2], glass: 0.18, flat: 1, emit: 0.3, side: THREE.DoubleSide });
    this.sweep = new THREE.Mesh(sw, this.sweepM); this.sweep.position.y = 9;
    this.tilt.add(this.sweep);
    this.ping = mesh(lathe([[5, -0.3], [6.2, -0.3], [6.2, 0.3], [5, 0.3]], 12), mat({ tint: R.glowAmber[4], emit: 1, flat: 1, outline: false }));
    this.ping.visible = false; this.tilt.add(this.ping);
    for (let i = 0; i < 4; i++) { const f = mesh(box(1, 0.6, 1), mat({ tint: R.bone[5], emit: 0.8, flat: 1, outline: false })); this.foot.push(f); this.tilt.add(f); }
    this.tilt.position.y = 3;
    this.root.add(this.tilt);
  }
  /** rebuild the relief from the region (heights and colours) */
  build(d: MapData) {
    const G = this.G, S = this.S, k = d.N / G, P = this.pos, C = this.col, c = new THREE.Color();
    const hAt = (gx: number, gz: number) => { const x = Math.min(d.N - 1, Math.floor(gx * k)), z = Math.min(d.N - 1, Math.floor(gz * k)); return Math.max(-0.5, Math.min(11, (d.h[z * d.N + x] - d.water) * 0.45)); };
    let o = 0;
    for (let gz = 0; gz < G; gz++) for (let gx = 0; gx < G; gx++) {
      const x0 = (gx / G - 0.5) * S, x1 = ((gx + 1) / G - 0.5) * S, z0 = (gz / G - 0.5) * S, z1 = ((gz + 1) / G - 0.5) * S;
      const h00 = hAt(gx, gz), h10 = hAt(gx + 1, gz), h01 = hAt(gx, gz + 1), h11 = hAt(gx + 1, gz + 1);
      const v = [x0, h00, z0, x0, h01, z1, x1, h10, z0, x1, h10, z0, x0, h01, z1, x1, h11, z1];
      P.set(v, o * 3);
      const idx = Math.min(d.N - 1, Math.floor((gz + 0.5) * k)) * d.N + Math.min(d.N - 1, Math.floor((gx + 0.5) * k));
      c.setHex(d.cell(idx), THREE.LinearSRGBColorSpace);
      if (gx % 4 === 0 || gz % 4 === 0) c.multiplyScalar(1.35);
      for (let j = 0; j < 6; j++) C.set([c.r, c.g, c.b], (o + j) * 3);
      o += 6;
    }
    const g = this.relief.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true; (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  }
  /** recolour only (ownership, fog) */
  recolour(d: MapData) {
    const G = this.G, k = d.N / G, C = this.col, c = new THREE.Color();
    let o = 0;
    for (let gz = 0; gz < G; gz++) for (let gx = 0; gx < G; gx++) {
      const idx = Math.min(d.N - 1, Math.floor((gz + 0.5) * k)) * d.N + Math.min(d.N - 1, Math.floor((gx + 0.5) * k));
      c.setHex(d.cell(idx), THREE.LinearSRGBColorSpace);
      if (gx % 4 === 0 || gz % 4 === 0) c.multiplyScalar(1.35);
      for (let j = 0; j < 6; j++) { C[(o + j) * 3] = c.r; C[(o + j) * 3 + 1] = c.g; C[(o + j) * 3 + 2] = c.b; }
      o += 6;
    }
    (this.relief.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
  /** region (x, z) -> table-local point */
  local(N: number, x: number, z: number, y = 0) { return new THREE.Vector3((x / N - 0.5) * this.S, y, (z / N - 0.5) * this.S); }
  toRegion(N: number, p: THREE.Vector3) { return [(p.x / this.S + 0.5) * N, (p.z / this.S + 0.5) * N] as const; }
  /** pins this frame: [x, z, colour, scale] in region coordinates */
  setPins(N: number, pins: [number, number, number, number][]) {
    const m = new THREE.Matrix4(), c = new THREE.Color(), n = Math.min(200, pins.length);
    for (let i = 0; i < n; i++) {
      const [x, z, col, s] = pins[i], p = this.local(N, x, z, 1.5);
      m.makeScale(s, s, s).setPosition(p); this.pins.setMatrixAt(i, m); this.pins.setColorAt(i, c.setHex(col, THREE.LinearSRGBColorSpace));
    }
    this.pins.count = n; this.pinN = n;
    this.pins.instanceMatrix.needsUpdate = true; if (this.pins.instanceColor) this.pins.instanceColor.needsUpdate = true;
  }
  /** the camera's footprint as four corner ticks */
  setFoot(N: number, pts: [number, number][]) { pts.forEach(([x, z], i) => { const p = this.local(N, x, z, 7); this.foot[i].position.copy(p); }); }
  pingAt(p: THREE.Vector3) { this.ping.position.set(p.x, 8, p.z); this.pingT = 0; this.ping.visible = true; }
  update(dt: number) {
    this.t += dt;
    this.tilt.rotation.y = this.yaw.step(this.yawT, dt);
    this.tilt.rotation.x = this.pitch.step(this.pitchT, dt);
    this.sweep.rotation.y = -this.t * 1.4;
    this.sweepM.uniforms.uAlpha.value = 0.1 + this.scan * 0.18;
    this.sweep.visible = this.scan > 0.02;
    this.pingT += dt;
    if (this.pingT < 1) { const s = 0.4 + this.pingT * 2.6; this.ping.scale.set(s, 1, s); this.ping.visible = Math.floor(this.pingT * 10) % 3 !== 2; } else this.ping.visible = false;
    for (const f of this.foot) f.visible = Math.floor(this.t * 2) % 2 === 0;
    void this.pinN;
  }
}

// ------------------------------------------------------------------ telemetry CRT
export class CRT {
  readonly root = new THREE.Group();
  readonly scr: LiveDecal;
  readonly knobs: THREE.Group[] = [];
  private t = 0; roll = 0; gain = 0.5; amber = false; on = 0;
  constructor(readonly w: number, readonly h: number) {
    const ol = M('olive', { spec: 0 }), st = M('steel', { spec: 1 });
    // the cabinet, the steel bezel, the knobs down the right side
    this.root.add(mesh(box(w + 26, h + 12, 14), ol, 8, 0, -7));
    this.root.add(mesh(box(w + 6, 3, 3), st, 0, h / 2 + 2.5, 0.6), mesh(box(w + 6, 3, 3), st, 0, -h / 2 - 2.5, 0.6), mesh(box(3, h + 8, 3), st, -w / 2 - 2.5, 0, 0.6), mesh(box(3, h + 8, 3), st, w / 2 + 2.5, 0, 0.6));
    this.scr = new LiveDecal(w, h, { flat: 1, emit: 0.4, outline: false });
    this.scr.mesh.position.z = 0.4;
    this.root.add(this.scr.mesh);
    // the curved glass: a faint dome of reflection over the tube face
    const gl = mesh(quad(w, h), mat({ map: tex(glass(w, h)), glass: 0.5, flat: 1 }), 0, 0, 1.2);
    this.root.add(gl);
    for (let i = 0; i < 2; i++) {
      const k = new THREE.Group(), km = M('bake', { spec: 1 });
      k.add(mesh(cyl(4.2, 4.6, 3, 10).rotateX(Math.PI / 2), km, 0, 0, 1.5), mesh(box(1, 4, 1), mat({ tint: R.bone[5], flat: 0.5 }), 0, 2, 3.4));
      k.position.set(w / 2 + 13, h / 2 - 8 - i * 16, 0);
      this.root.add(k); this.knobs.push(k);
      const l = decal(label(i ? 'TUNE' : 'GAIN', R.bone[4])); l.position.set(w / 2 + 13, h / 2 - 15 - i * 16, 0.2); this.root.add(l);
    }
  }
  /** colours of the phosphor: P1 green, or P3 amber when the tubes are swapped */
  ink(i: number) { return (this.amber ? R.glowAmber : R.glowTeal)[Math.max(0, Math.min(4, i))]; }
  bg() { return this.amber ? R.ink[0] : R.ink[0]; }
  update(dt: number) {
    this.t += dt; this.on = Math.min(1, this.on + dt * 2.5);
    const flick = Math.random() < 0.04 ? 0.15 : 0;
    this.scr.mat.uniforms.uEmit.value = (0.15 + this.gain * 0.6) * this.on - flick;
    this.knobs[0].rotation.z = -(this.gain - 0.5) * 4;
    this.knobs[1].rotation.z = this.amber ? -1.2 : 1.2;
  }
  /** a scan band rolling down the tube, drawn into the screen after the content */
  scanBand(p: Pix, t: number) {
    const y = Math.floor(((t * 0.35) % 1.4) * p.h);
    for (let x = 0; x < p.w; x++) for (const yy of [y, y + 1]) if (yy >= 0 && yy < p.h) { const c = p.get(x, yy); if (c < 0 || c === this.bg()) p.set(x, yy, this.ink(0)); }
    for (let yy = 0; yy < p.h; yy += 2) for (let x = 0; x < p.w; x++) { const c = p.get(x, yy); if (c === this.bg()) p.set(x, yy, R.ink[1]); }
  }
}
function glass(w: number, h: number) {
  const p = new Pix(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x + y * 1.4 - w * 0.12;
    if (u > 0 && u < 3) p.set(x, y, R.snow[5], 90);
    const e = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (e < 2) p.set(x, y, R.ink[0], e < 1 ? 230 : 140);
  }
  return p;
}

// ------------------------------------------------------------------ orrery
export class Orrery {
  readonly root = new THREE.Group();
  private sunArm = new THREE.Group(); private m1Arm = new THREE.Group(); private m2Arm = new THREE.Group();
  private sunM: DeskMat; private m2M: DeskMat; private globe: THREE.Mesh; private gM: DeskMat;
  sun = 0; m1 = 1; m2 = 2; red = 0; dark = 0;
  private s = { sun: new Spring(0, 30, 7), m1: new Spring(1, 30, 7), m2: new Spring(2, 30, 7) };
  constructor() {
    const br = M('brass', { spec: 1 });
    this.root.add(mesh(cyl(11, 12.5, 4, 10), M('wood', { spec: 0 }), 0, 2, 0), mesh(cyl(9, 10, 2, 10), br, 0, 5, 0));
    this.root.add(mesh(cyl(0.9, 0.9, 16, 6), br, 0, 13, 0));
    this.gM = mat({ tint: R.teal[4], spec: 1 });
    this.globe = mesh(facet(new THREE.IcosahedronGeometry(4.6, 1)), this.gM, 0, 14, 0);
    this.root.add(this.globe);
    const arm = (g: THREE.Group, r: number, y: number, ball: THREE.Mesh) => {
      g.add(mesh(box(r, 0.7, 0.7), br, r / 2, 0, 0), mesh(cyl(0.5, 0.5, 3, 5), br, r, 1.3, 0));
      ball.position.set(r, 3.2, 0); g.add(ball); g.position.y = y; this.root.add(g);
    };
    this.sunM = mat({ tint: R.gold[5], emit: 0.8, flat: 0.4 });
    arm(this.sunArm, 15, 7.5, mesh(facet(new THREE.IcosahedronGeometry(2.6, 1)), this.sunM));
    arm(this.m1Arm, 9, 9.5, mesh(facet(new THREE.IcosahedronGeometry(1.5, 0)), mat({ tint: R.bone[4], spec: 1 })));
    this.m2M = mat({ tint: R.quartz[3], spec: 1 });
    arm(this.m2Arm, 11.5, 11.5, mesh(facet(new THREE.IcosahedronGeometry(1.25, 0)), this.m2M));
  }
  update(dt: number) {
    const wrap = (cur: number, t: number) => cur + Math.atan2(Math.sin(t - cur), Math.cos(t - cur));
    this.sunArm.rotation.y = this.s.sun.step(wrap(this.sunArm.rotation.y, this.sun), dt);
    this.m1Arm.rotation.y = this.s.m1.step(wrap(this.m1Arm.rotation.y, this.m1), dt);
    this.m2Arm.rotation.y = this.s.m2.step(wrap(this.m2Arm.rotation.y, this.m2), dt);
    this.globe.rotation.y += dt * 0.4;
    (this.m2M.uniforms.uTint.value as THREE.Color).setHex(this.red > 0.5 ? R.stampRed[3] : R.quartz[3], THREE.LinearSRGBColorSpace);
    this.m2M.uniforms.uEmit.value = this.red * 0.8;
    this.sunM.uniforms.uEmit.value = 0.8 * (1 - this.dark * 0.9);
    this.gM.uniforms.uDim.value = this.dark * 0.5;
  }
}

// ------------------------------------------------------------------ inspection clipboard
export interface KeyCap { root: THREE.Group; m: DeskMat; face: DeskMat; sp: Spring; id: string; dim: boolean; act: boolean }
export class InspectBoard {
  readonly root = new THREE.Group();
  readonly board = new THREE.Group();
  readonly paper: LiveDecal;
  keys: KeyCap[] = [];
  private keyRow = new THREE.Group();
  readonly slide = new Spring(-90, 70, 11);
  shown = false;
  static W = 132; static H = 70;
  constructor() {
    const W = InspectBoard.W, H = InspectBoard.H;
    const b = this.board;
    b.add(mesh(box(W + 10, H + 34, 2), M('wood'), 0, -8, -1));
    this.paper = new LiveDecal(W, H, { flat: 0.55 });
    this.paper.mesh.position.set(0, 2, 0.4);
    b.add(this.paper.mesh);
    // the clip: a steel bar and a spring roll
    b.add(mesh(box(34, 6, 3), M('steel', { spec: 1 }), 0, H / 2 + 4, 1), mesh(cyl(1.6, 1.6, 30, 8).rotateZ(Math.PI / 2), M('steel', { spec: 1 }), 0, H / 2 + 6.5, 2.4));
    this.keyRow.position.set(0, -H / 2 - 10, 1);
    b.add(this.keyRow);
    this.root.add(b);
    this.root.position.y = -90;
  }
  /** the action keys: a Bakelite cap each, the icon and the hotkey printed on its face */
  setKeys(list: { id: string; icon: string; key: string }[]) {
    for (const k of this.keys) k.root.removeFromParent();
    this.keys = [];
    const n = list.length, w = 17, gap = 2, x0 = -((n * w + (n - 1) * gap) / 2) + w / 2;
    list.forEach((c, i) => {
      const g = new THREE.Group(), m = M('bake', { spec: 1 });
      g.add(mesh(box(w, 15, 5), m, 0, 0, 0));
      const face = new Pix(w - 2, 13); face.rect(0, 0, w - 2, 13, R.clay[1]);
      const ic = iconPix(c.icon, 10);
      for (let y = 0; y < ic.h; y++) for (let x = 0; x < ic.w; x++) if (ic.a(x, y) > 100) face.set(2 + x, y, ic.get(x, y));
      const k = c.key === 'Escape' ? 'ESC' : c.key.toUpperCase();
      text3s(face, k.slice(0, 3), w - 3 - Math.min(3, k.length) * 4 + 1, 8, R.bone[5], R.ink[0]);
      const fm = mat({ map: tex(face), flat: 0.5 });
      const f = new THREE.Mesh(quad(w - 2, 13), fm); f.position.z = 2.6; g.add(f);
      g.position.x = x0 + i * (w + gap);
      this.keyRow.add(g);
      this.keys.push({ root: g, m, face: fm, sp: new Spring(0, 220, 12), id: c.id, dim: false, act: false });
    });
  }
  update(dt: number, t: number) {
    this.root.position.y = this.slide.step(this.shown ? 0 : -110, dt);
    this.root.visible = this.root.position.y > -105;
    for (const k of this.keys) {
      k.root.position.z = k.sp.step(0, dt);
      k.m.uniforms.uDim.value = k.dim ? 0.45 : 0; k.face.uniforms.uDim.value = k.dim ? 0.45 : 0;
      const a = k.act ? (Math.floor(t * 3) % 2 ? 0.35 : 0.15) : 0;
      (k.face.uniforms.uGlow.value as THREE.Color).setRGB(a, a * 0.7, a * 0.2);
    }
  }
}
export const _c = clamp01;
