// Floating 3D menu words built from a pixel font's own glyphs: the word is rasterised at the font's native size and
// every lit pixel becomes a small bevelled block, so the letters keep the font's exact pixel shapes in depth. The
// face of each block is painted enamel, its sides are steel, each one flat step of a master ramp; the top rows catch
// a little more light. A word bobs and turns gently; pointed at, it leans
// toward the camera and lights up; worked, its blocks burst apart with a spin and spring back into place.
import * as THREE from 'three';
import { RAMPS } from '../art/palette';
import { gbuf, F_HOVER } from '../gfx/gbuf';

const ST = RAMPS.steel, PA = RAMPS.paper, GA = RAMPS.glowAmber;
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };


/** the lit pixels of a word in a pixel font at its native size, trimmed */
export function glyphPixels(text: string, font: string, px: number) {
  const c = document.createElement('canvas'), g0 = c.getContext('2d')!;
  g0.font = `${px}px '${font}'`;
  const W = Math.ceil(g0.measureText(text).width) + 6, H = Math.ceil(px * 1.6) + 6;
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.font = `${px}px '${font}'`; g.textBaseline = 'top'; g.fillStyle = '#fff'; g.fillText(text, 3, 3);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 110) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const pts: [number, number][] = [];
  if (x1 < 0) return { w: 0, h: 0, pts };
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (d[(y * W + x) * 4 + 3] > 110) pts.push([x - x0, y - y0]);
  return { w: x1 - x0 + 1, h: y1 - y0 + 1, pts };
}

export interface WordOpts { font?: string; px?: number; vox?: number; depth?: number; enabled?: boolean; yaw?: number; phase?: number }
export class VoxelWord {
  readonly group = new THREE.Group();
  readonly hit: THREE.Mesh; readonly mesh: THREE.InstancedMesh;
  readonly w: number; readonly h: number; readonly d: number;
  enabled: boolean;
  /** 0..1, set by the screen; eased internally */
  hover = 0;
  /** layout scale (the screen fits the column to the view) */
  size = 1;
  /** where the word floats (world), its idle yaw away from the camera */
  readonly home = new THREE.Vector3(); yaw: number; phase: number;
  private hv = 0; private n: number;
  private rest: Float32Array; private off: Float32Array; private vel: Float32Array; private rot: Float32Array; private spin: Float32Array;
  private active = false;
  private mats: THREE.MeshLambertMaterial[];
  private flag = { value: 1 };
  private dummy = new THREE.Object3D(); private q = new THREE.Quaternion(); private ax = new THREE.Vector3();
  private col = new THREE.Color(); private colK = -1;
  private lean = new THREE.Euler(); private jolt = 0;
  constructor(readonly id: string, readonly label: string, o: WordOpts = {}) {
    const px = o.px ?? 13, vox = o.vox ?? 1, depth = o.depth ?? 1.7;
    this.enabled = o.enabled !== false; this.yaw = o.yaw ?? 0.32; this.phase = o.phase ?? 0;
    const gp = glyphPixels(label, o.font ?? 'Jersey', px);
    this.n = gp.pts.length; this.w = gp.w * vox; this.h = gp.h * vox; this.d = depth * vox;
    // flat steps of the ramp: a block face is one plane, one colour (a texture would only shimmer at this size)
    const face = gbuf(new THREE.MeshLambertMaterial({ color: PA[4], flatShading: true }), this.flag);
    const side = gbuf(new THREE.MeshLambertMaterial({ color: ST[3], flatShading: true }), this.flag);
    const back = gbuf(new THREE.MeshLambertMaterial({ color: ST[1], flatShading: true }), this.flag);
    this.mats = [face, side];
    const geo = new THREE.BoxGeometry(vox * 1.002, vox * 1.002, this.d); // flush: the blocks read as one solid letter
    this.mesh = new THREE.InstancedMesh(geo, [side, side, side, side, face, back], Math.max(1, this.n));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    this.rest = new Float32Array(this.n * 3); this.off = new Float32Array(this.n * 3); this.vel = new Float32Array(this.n * 3);
    this.rot = new Float32Array(this.n * 4); this.spin = new Float32Array(this.n * 4);
    gp.pts.forEach(([x, y], i) => { this.rest.set([(x + 0.5) * vox - this.w / 2, this.h / 2 - (y + 0.5) * vox, 0], i * 3); this.rot[i * 4 + 3] = 1; });
    this.group.add(this.mesh);
    // the pointer's target: an invisible card the size of the word
    this.hit = new THREE.Mesh(new THREE.PlaneGeometry(this.w + vox * 3, this.h + vox * 3), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.userData.word = this; this.group.add(this.hit);
    this.writeAll();
    this.tint(1);
  }
  private writeAll() {
    const m = this.dummy;
    for (let i = 0; i < this.n; i++) {
      m.position.set(this.rest[i * 3] + this.off[i * 3], this.rest[i * 3 + 1] + this.off[i * 3 + 1], this.rest[i * 3 + 2] + this.off[i * 3 + 2]);
      m.quaternion.set(this.rot[i * 4], this.rot[i * 4 + 1], this.rot[i * 4 + 2], this.rot[i * 4 + 3]);
      m.updateMatrix(); this.mesh.setMatrixAt(i, m.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  private tint(k: number) {
    if (Math.abs(k - this.colK) < 0.01) return;
    this.colK = k;
    for (let i = 0; i < this.n; i++) {
      // the top rows of every letter catch a little more light: a soft lit edge drawn into the blocks themselves
      const top = this.rest[i * 3 + 1] > this.h * 0.28 ? 1.08 : 1;
      this.mesh.setColorAt(i, this.col.setScalar(k * top));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  /** blow the blocks apart; they spring back */
  burst(k = 1) {
    for (let i = 0; i < this.n; i++) {
      const x = this.rest[i * 3], y = this.rest[i * 3 + 1];
      const r = 0.6 + h1(i, 3) * 0.8;
      this.vel[i * 3] += (x / (this.w * 0.5 + 1e-3) * 9 + (h1(i, 1) - 0.5) * 14) * k * r;
      this.vel[i * 3 + 1] += (y / (this.h * 0.5 + 1e-3) * 7 + (h1(i, 2) - 0.5) * 12 + 4) * k * r;
      this.vel[i * 3 + 2] += (10 + h1(i, 4) * 18) * k * r;
      this.spin[i * 4] = (h1(i, 5) - 0.5) * 2; this.spin[i * 4 + 1] = (h1(i, 6) - 0.5) * 2; this.spin[i * 4 + 2] = (h1(i, 7) - 0.5) * 2; this.spin[i * 4 + 3] = (5 + h1(i, 8) * 9) * k;
    }
    this.active = true;
  }
  /** a short refusing shake (a disabled option) */
  shake() { this.jolt = 1; this.burst(0.12); }
  update(dt: number, t: number, cam: THREE.Camera) {
    this.hv += (this.hover - this.hv) * Math.min(1, dt * 9);
    const hv = this.hv;
    // float: bob, a slow turn, lean toward the camera when pointed at
    const g = this.group;
    g.position.copy(this.home); g.position.y += Math.sin(t * 0.7 + this.phase) * 0.7; g.position.x += Math.sin(t * 0.43 + this.phase * 2) * 0.35;
    g.lookAt(cam.position);
    this.jolt = Math.max(0, this.jolt - dt * 3);
    this.lean.set(Math.sin(t * 0.5 + this.phase) * 0.06 * (1 - hv) - hv * 0.05, this.yaw * (1 - hv * 0.85) + Math.sin(t * 0.37 + this.phase) * 0.05 + Math.sin(t * 60) * this.jolt * 0.06, Math.sin(t * 0.31 + this.phase) * 0.025 * (1 - hv));
    g.quaternion.multiply(this.q.setFromEuler(this.lean));
    g.scale.setScalar(this.size * (1 + hv * 0.07));
    g.translateZ(hv * 2.5 * this.size);
    // light: brighter blocks, an amber glow in the enamel, the outline pass's hover flag
    const k = (this.enabled ? 1 : 0.42) * (1 + hv * 0.28);
    this.tint(k);
    const e = this.mats[0].emissive; e.setHex(GA[1]).multiplyScalar(hv * 0.55);
    this.mats[1].emissive.setHex(GA[0]).multiplyScalar(hv * 0.3);
    this.flag.value = hv > 0.5 ? 1 + F_HOVER : 1;
    // the blocks: a damped spring home, spinning down
    if (!this.active) return;
    let moving = false;
    const K = 34, C = 7.5, f = Math.min(dt, 1 / 30);
    for (let i = 0; i < this.n; i++) {
      for (let a = 0; a < 3; a++) {
        const j = i * 3 + a, v = this.vel[j] + (-K * this.off[j] - C * this.vel[j]) * f;
        this.vel[j] = v; this.off[j] += v * f;
        if (Math.abs(v) > 0.02 || Math.abs(this.off[j]) > 0.01) moving = true;
      }
      const s = this.spin[i * 4 + 3];
      if (s > 0.01) {
        this.ax.set(this.spin[i * 4], this.spin[i * 4 + 1], this.spin[i * 4 + 2]).normalize();
        this.q.set(this.rot[i * 4], this.rot[i * 4 + 1], this.rot[i * 4 + 2], this.rot[i * 4 + 3]);
        this.q.premultiply(new THREE.Quaternion().setFromAxisAngle(this.ax, s * f));
        this.spin[i * 4 + 3] = s * Math.exp(-f * 3.2); moving = true;
        this.rot.set([this.q.x, this.q.y, this.q.z, this.q.w], i * 4);
      } else {
        // settle square to the word
        this.q.set(this.rot[i * 4], this.rot[i * 4 + 1], this.rot[i * 4 + 2], this.rot[i * 4 + 3]).slerp(new THREE.Quaternion(), Math.min(1, f * 10));
        this.rot.set([this.q.x, this.q.y, this.q.z, this.q.w], i * 4);
        if (1 - Math.abs(this.q.w) > 1e-4) moving = true;
      }
    }
    if (!moving) { this.off.fill(0); this.vel.fill(0); for (let i = 0; i < this.n; i++) this.rot.set([0, 0, 0, 1], i * 4); this.active = false; }
    this.writeAll();
  }
  /** a box (in the word's own frame, before its scale) for things to bounce off */
  get halfSize() { return new THREE.Vector3(this.w / 2 + 0.5, this.h / 2 + 0.5, this.d / 2 + 0.5); }
  dispose() {
    this.group.removeFromParent();
    this.mesh.geometry.dispose(); this.mesh.dispose();
    (this.mesh.material as THREE.Material[]).forEach((m) => m.dispose());
    this.hit.geometry.dispose(); (this.hit.material as THREE.Material).dispose();
  }
}
