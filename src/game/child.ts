// The Veyr itself: a baby alien grown inside the asteroid. It cannot walk; it reaches out with its mind (tendrils,
// telekinesis, gravity) and edits genes. Blocky like everything that lives here, hand-pixelled face, huge eyes.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex } from '../limbo/gfx/pixel';
import { gbuf } from '../gfx/gbuf';
import { VEYR } from '../world/palette';
import { clamp, damp } from '../core/rand';
import type { Fx } from './fx';

const SKIN = 0xb4aec4, SPOT = 0x9a78bc, EYE = 0x09070e;
function tex(pc: PixelCanvas) {
  const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false;
  return t;
}
function skinCanvas(w: number, h: number, seed: number, spots = true) {
  const pc = new PixelCanvas(w, h); pc.wrap = false;
  const R = makeRamp(SKIN, 6, { spread: 0.35 });
  pc.each((x, y) => pc.set(x, y, R[3 + (((x * 7 + y * 13 + seed) % 11) === 0 ? 1 : 0) - (y > h * 0.8 ? 1 : 0)]));
  if (spots) for (let k = 0; k < Math.floor((w * h) / 140); k++) {
    const x = (seed * 37 + k * 71) % w, y = (seed * 13 + k * 29) % Math.max(1, Math.floor(h * 0.7));
    pc.set(x, y, SPOT); pc.set(x + 1, y, SPOT); pc.set(x, y + 1, mixHex(SPOT, SKIN, 0.4)); pc.set(x + 1, y + 1, mixHex(SPOT, SKIN, 0.6));
  }
  return pc;
}
/** the face: two great almond eyes with wet highlights, brow shading, faint freckles */
function faceCanvas(): { face: PixelCanvas; mask: PixelCanvas } {
  const W = 56, H = 34, pc = skinCanvas(W, H, 3), mask = new PixelCanvas(W, H); mask.wrap = false; mask.fill(0x000000);
  const R = makeRamp(SKIN, 6, { spread: 0.35 });
  for (let x = 0; x < W; x++) for (let y = 0; y < 5; y++) pc.set(x, y, R[4]);
  const eye = (cx: number, cy: number, tilt: number) => {
    for (let y = -10; y <= 10; y++) for (let x = -14; x <= 14; x++) {
      const rx = x * Math.cos(tilt) + y * Math.sin(tilt), ry = -x * Math.sin(tilt) + y * Math.cos(tilt);
      const e = (rx / 12) ** 2 + (ry / (8.2 - Math.abs(rx) * 0.16)) ** 2;
      if (e <= 1) { pc.set(cx + x, cy + y, e > 0.82 ? 0x251c36 : EYE); mask.set(cx + x, cy + y, 0xffffff); }
      else if (e <= 1.32 && ry < 1) pc.set(cx + x, cy + y, mixHex(R[2], 0x8a7aa8, 0.4));
    }
    // reflections: a big window, a small sparkle, a soft lavender arc
    for (const [dx, dy, c] of [[-5, -3, 0xffffff], [-4, -3, 0xffffff], [-5, -2, 0xf0ecff], [-3, -3, 0xdcd4ff], [4, 3, 0xe8e0ff], [5, 3, 0x9a8ac8]] as const) pc.set(cx + dx, cy + dy, c);
  };
  eye(15, 20, 0.36); eye(41, 20, -0.36);
  return { face: pc, mask };
}
function lowerFace() {
  const W = 40, H = 22, pc = skinCanvas(W, H, 9, false);
  pc.set(19, 4, 0x6a5a78); pc.set(21, 4, 0x6a5a78);
  for (let x = -3; x <= 3; x++) pc.set(20 + x, 13 - Math.round((x * x) / 5), 0x6a3a4a);
  for (const cx of [8, 32]) for (let y = 8; y < 13; y++) for (let x = -3; x <= 3; x++) if (x * x + (y - 10) ** 2 < 8) pc.blend(cx + x, y, 0xe8a0b8, 0.35);
  return pc;
}
function mossCanvas() {
  const pc = new PixelCanvas(16, 16);
  const R = makeRamp(VEYR.moss, 6, { spread: 0.6 });
  pc.each((x, y) => pc.set(x, y, R[2 + (((x * 5 + y * 3) % 7) === 0 ? 2 : ((x + y * 7) % 5) === 0 ? -1 : 0)]));
  pc.set(4, 3, VEYR.spore); pc.set(11, 9, VEYR.spore); pc.set(7, 13, VEYR.vein);
  return pc;
}

export class VeyrChild {
  readonly root = new THREE.Group();
  private head = new THREE.Group(); private body = new THREE.Group();
  private armL = new THREE.Group(); private armR = new THREE.Group();
  private lids: THREE.Mesh[] = [];
  private eyeMat: THREE.MeshLambertMaterial;
  private t = 0; private blinkT = 2; private castT = 0; private castAt = new THREE.Vector3();
  hatch = 0; // 0 sealed .. 1 out and awake
  look = new THREE.Vector3();
  private lookYaw = 0; private lookPitch = 0;
  constructor(readonly fx: Fx, scale = 1.25) {
    const mat = (t: THREE.Texture) => gbuf(new THREE.MeshLambertMaterial({ map: t }), 1);
    const skinT = tex(skinCanvas(32, 32, 5)), moss = mat(tex(mossCanvas())), skin = mat(skinT);
    const { face, mask } = faceCanvas();
    this.eyeMat = new THREE.MeshLambertMaterial({ map: tex(face), emissive: new THREE.Color(0x9a7aff), emissiveMap: tex(mask), emissiveIntensity: 0 });
    gbuf(this.eyeMat, 1);
    const lower = mat(tex(lowerFace()));
    const box = (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; parent.add(b); return b;
    };
    // body: sitting, wrapped in a moss cloak
    this.root.add(this.body);
    box(0.72, 0.62, 0.56, moss, 0, 0.31, 0, this.body);
    box(0.5, 0.18, 0.5, moss, 0, 0.66, 0, this.body);
    box(0.24, 0.2, 0.46, skin, -0.17, 0.1, 0.24, this.body);
    box(0.24, 0.2, 0.46, skin, 0.17, 0.1, 0.24, this.body);
    for (const [g, s] of [[this.armL, -1], [this.armR, 1]] as const) {
      g.position.set(s * 0.42, 0.58, 0.02); this.body.add(g);
      box(0.17, 0.42, 0.17, skin, 0, -0.2, 0, g);
      box(0.2, 0.12, 0.2, skin, 0, -0.44, 0.02, g);
    }
    // head: a broad cranium tapering to a small chin
    this.head.position.set(0, 0.74, 0); this.body.add(this.head);
    box(1.16, 0.72, 0.98, [skin, skin, skin, skin, this.eyeMat, skin], 0, 0.56, 0, this.head);
    box(0.84, 0.44, 0.82, [skin, skin, skin, skin, lower, skin], 0, 0.08, 0.02, this.head);
    box(1.06, 0.14, 0.9, skin, 0, 0.98, 0, this.head);
    box(0.82, 0.12, 0.7, skin, 0, 1.1, 0, this.head);
    for (const sx of [-1, 1]) box(0.08, 0.5, 0.8, skin, sx * 0.6, 0.52, 0, this.head);
    for (const [x, z, s, hh] of [[-0.24, -0.1, 0.24, 0.12], [0.2, 0.12, 0.16, 0.18], [0.04, -0.2, 0.3, 0.08], [-0.1, 0.2, 0.12, 0.22], [0.3, -0.2, 0.1, 0.14]]) box(s, hh, s, moss, x, 1.16 + hh / 2, z, this.head);
    // eyelids for blinking (sit just in front of each eye)
    const lidM = skin;
    for (const s of [-1, 1]) { const l = box(0.46, 0.34, 0.03, lidM, s * 0.27, 0.44, 0.505, this.head); l.scale.y = 0.001; this.lids.push(l); }
    this.root.scale.setScalar(scale);
    this.root.visible = false;
  }
  /** raise the hands and light the eyes toward a point in the world */
  cast(at: THREE.Vector3) { this.castT = 1.1; this.castAt.copy(at); }
  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const h = this.hatch;
    this.root.visible = h > 0.05;
    // rise out of the shell
    const rise = clamp((h - 0.1) / 0.6, 0, 1);
    this.body.position.y = (1 - rise) * -1.6;
    this.body.rotation.z = Math.sin(this.t * 0.9) * 0.03;
    // breathe
    const br = 1 + Math.sin(this.t * 1.8) * 0.02;
    this.body.scale.set(br, 1 / br, br);
    // look: at the cast target, or around, or at the camera now and then
    const target = this.castT > 0 ? this.castAt : this.look;
    this.root.updateMatrixWorld();
    const lp = this.root.worldToLocal(target.clone());
    const wantYaw = clamp(Math.atan2(lp.x, lp.z), -1.1, 1.1), wantPitch = clamp(-Math.atan2(lp.y - 1.5, Math.hypot(lp.x, lp.z)) * 0.6, -0.4, 0.35);
    this.lookYaw = damp(this.lookYaw, wantYaw, 5, dt); this.lookPitch = damp(this.lookPitch, wantPitch, 5, dt);
    this.head.rotation.set(this.lookPitch, this.lookYaw, Math.sin(this.t * 0.7) * 0.06);
    // blink
    this.blinkT -= dt;
    let lid = 0;
    if (this.blinkT < 0.18) lid = Math.sin(clamp(this.blinkT / 0.18, 0, 1) * Math.PI);
    if (this.blinkT <= 0) this.blinkT = 2.5 + Math.random() * 3.5;
    if (h < 0.8) lid = 1 - clamp((h - 0.6) / 0.2, 0, 1);
    for (const l of this.lids) { l.scale.y = Math.max(0.001, lid); l.visible = lid > 0.02; }
    // casting: arms up toward the target, eyes alight, motes leaving the hands
    this.castT = Math.max(0, this.castT - dt);
    const c = Math.min(1, this.castT * 3);
    this.armL.rotation.set(-c * 1.3 + Math.sin(this.t * 2) * 0.05, 0, -c * 1.0);
    this.armR.rotation.set(-c * 1.3 + Math.sin(this.t * 2 + 1) * 0.05, 0, c * 1.0);
    this.eyeMat.emissiveIntensity = c * 1.2 + (h > 0.7 && h < 1 ? (1 - h) * 6 : 0);
    if (c > 0.3 && Math.random() < dt * 30) {
      const p = new THREE.Vector3(0, -0.44, 0);
      (Math.random() < 0.5 ? this.armL : this.armR).children[1].localToWorld(p);
      this.fx.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, new THREE.Color(0xb8a0ff).multiplyScalar(2.2), 1, 2.5, 0.6, -0.3, 1);
    }
    void cam;
  }
  /** world position of the head (for beams) */
  headPos(out = new THREE.Vector3()) { return this.head.getWorldPosition(out).add(new THREE.Vector3(0, 0.5, 0)); }
}
