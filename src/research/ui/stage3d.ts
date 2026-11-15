// The vignette stage: one small live 3D diorama at a time, rendered full screen behind the machined plate UI by the
// engine's own post pipeline (outlines and all). A turned wooden plinth, a key light with soft shadows, a rim light, a
// tinted backdrop with depth fog, and an orbit camera that drifts on its own and can be dragged. The free middle of
// the screen (between the plates) is where the diorama is framed: the projection is offset to centre it there.
// Surfaces that carry a texture use 32 texels per metre (`tex32`), clean stylised pixel clusters, nearest filtered.
import * as THREE from 'three';
import type { Post } from '../../gfx/post';
import { gbuf } from '../../gfx/gbuf';

export const lam = (c: number, o: { emissive?: number; transparent?: boolean; opacity?: number; side?: THREE.Side; flag?: number } = {}) =>
  gbuf(new THREE.MeshLambertMaterial({ color: c, emissive: o.emissive ?? 0, transparent: !!o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, flatShading: true, depthWrite: !o.transparent }), o.flag ?? 1);
export const glowM = (c: number, opacity = 1) => gbuf(new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }), opacity < 1 ? 0 : 32);
export const ghostM = (c: number) => gbuf(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, depthWrite: false }), 0);
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, at?: [number, number, number], parent?: THREE.Object3D) {
  const o = new THREE.Mesh(g, m); if (at) o.position.set(...at); o.castShadow = true; o.receiveShadow = true; parent?.add(o); return o;
}

export class Vignette {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 200);
  readonly target = new THREE.Vector3(0, 1.4, 0);
  yaw = 0.3; pitch = 0.2; dist = 8; auto = 0.12; sway = 0.45;
  private yawGoal = 0.3; private drag: { x: number; yaw: number; pitch: number } | null = null; private dragT = -99;
  t = 0;
  /** the free middle of the screen in px: [left, right] margins taken by the paper cards */
  margins: [number, number] = [380, 470];
  readonly root = new THREE.Group();
  constructor(o: { bg?: number; fog?: number; plinth?: boolean; top?: number } = {}) {
    const bg = o.bg ?? 0x9fb0b4;
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.Fog(bg, 12, 30);
    this.scene.add(new THREE.HemisphereLight(0xf4efe2, 0x5a4a3a, 1.35));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4); key.position.set(-4, 8, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -5; sc.right = sc.top = 5; sc.near = 0.5; sc.far = 30; key.shadow.bias = -0.0006;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xbfe0ff, 0.9); rim.position.set(5, 4, -6); this.scene.add(rim);
    // a soft studio backdrop: a vertical gradient dome behind everything (no floor line)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(bg).offsetHSL(0, -0.05, 0.08) }, bot: { value: new THREE.Color(bg).offsetHSL(0, 0, -0.12) } },
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.25, 0.6, h)), 1.0); }' }));
    sky.frustumCulled = false; sky.renderOrder = -1; this.scene.add(sky);
    if (o.plinth !== false) this.scene.add(plinth(o.top ?? 0x4a3828));
    this.scene.add(this.root);
  }
  /** pointer drag on the stage element turns the diorama */
  bind(elm: HTMLElement) {
    elm.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; this.drag = { x: e.clientX, yaw: this.yawGoal, pitch: this.pitch }; elm.setPointerCapture?.(e.pointerId); });
    elm.addEventListener('pointermove', (e) => { if (!this.drag) return; this.yawGoal = this.drag.yaw - (e.clientX - this.drag.x) * 0.006; this.dragT = this.t; });
    const up = () => { this.drag = null; };
    elm.addEventListener('pointerup', up); elm.addEventListener('pointercancel', up);
    elm.addEventListener('wheel', (e) => { this.dist = Math.max(4, Math.min(16, this.dist * (e.deltaY > 0 ? 1.08 : 0.93))); }, { passive: true });
  }
  get dragging() { return !!this.drag; }
  update(dt: number) {
    this.t += dt;
    // a slow drift back and forth when nobody is turning it
    if (!this.drag && this.t - this.dragT > 3) this.yawGoal += (Math.sin(this.t * this.auto) * this.sway + 0.3 - this.yawGoal) * dt * 0.6;
    this.yaw += (this.yawGoal - this.yaw) * Math.min(1, dt * 6);
    const c = this.cam, d = this.dist;
    c.position.set(this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d, this.target.y + Math.sin(this.pitch) * d, this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d);
    c.lookAt(this.target);
  }
  resize(w: number, h: number) {
    const c = this.cam; c.aspect = w / h;
    // centre the diorama in the free middle (between the paper cards)
    const [l, r] = this.margins, mid = l + (w - l - r) / 2;
    c.setViewOffset(w, h, Math.round(w / 2 - mid), 0, w, h);
    c.updateProjectionMatrix();
  }
  render(post: Post, t: number) { post.render(this.scene, this.cam, undefined, t); }
  /** a world point to CSS px */
  project(v: THREE.Vector3, out = { x: 0, y: 0, ok: true }) {
    const p = v.clone().project(this.cam); out.x = (p.x * 0.5 + 0.5) * innerWidth; out.y = (-p.y * 0.5 + 0.5) * innerHeight; out.ok = p.z < 1; return out;
  }
  dispose() {
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry?.dispose(); const mm = m.material as THREE.Material | THREE.Material[]; (Array.isArray(mm) ? mm : [mm]).forEach((x) => x.dispose()); } });
  }
}

/** a stylised pixel texture at 32 texels per metre: a 64 px tile is 2 m. 'wood' long grain runs, 'metal' brushed
 *  runs, 'soil' clustered grains; two or three tones of the colour, no noise. Clone it per surface for its repeat. */
const TEX = new Map<string, THREE.CanvasTexture>();
export function tex32(color: number, kind: 'wood' | 'metal' | 'soil'): THREE.CanvasTexture {
  const key = kind + color; let t = TEX.get(key); if (t) return t;
  const N = 64, cv = document.createElement('canvas'); cv.width = cv.height = N; const g = cv.getContext('2d')!;
  const c = new THREE.Color(color), tone = (k: number) => '#' + c.clone().multiplyScalar(k).getHexString();
  let seed = 11 + color % 97; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = tone(1); g.fillRect(0, 0, N, N);
  if (kind === 'soil') {
    for (let i = 0; i < 70; i++) { const x = Math.floor(rnd() * N), y = Math.floor(rnd() * N), w = 1 + Math.floor(rnd() * 3); g.fillStyle = tone(rnd() < 0.6 ? 0.82 : 1.16); g.fillRect(x, y, w, w > 2 ? 2 : w); }
  } else {
    for (let y = 0; y < N; y++) { let x = Math.floor(rnd() * 8); while (x < N) { const L = 4 + Math.floor(rnd() * (kind === 'wood' ? 22 : 14)); if (rnd() < (kind === 'wood' ? 0.42 : 0.3)) { g.fillStyle = tone(kind === 'wood' ? (rnd() < 0.7 ? 0.86 : 1.12) : 1.08); g.fillRect(x, y, L, 1); } x += L + 2 + Math.floor(rnd() * 8); } }
    if (kind === 'wood') for (let y = 15; y < N; y += 16) { g.fillStyle = tone(0.7); g.fillRect(0, y, N, 1); }
  }
  t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; TEX.set(key, t); return t;
}
/** a textured Lambert material whose texture repeats r x (rx, ry) metres at 32 texels per metre */
function texM(base: THREE.CanvasTexture, mx: number, my: number) {
  const t = base.clone(); t.needsUpdate = true; t.repeat.set(mx / 2, my / 2);
  return gbuf(new THREE.MeshLambertMaterial({ map: t, flatShading: true }), 1);
}
/** a cylinder with 32 px/m textures on its side and caps */
function tcyl(r0: number, r1: number, h: number, base: THREE.CanvasTexture) {
  const side = texM(base, Math.PI * (r0 + r1), h), cap = texM(base, 2 * Math.max(r0, r1), 2 * Math.max(r0, r1));
  return [side, cap, cap];
}
/** a turned wooden plinth: a stepped base, a bevelled rim and a top in the given material colour (32 px/m textures) */
export function plinth(top: number) {
  const g = new THREE.Group(), brass = lam(0xb08a4a);
  const ring = (r0: number, r1: number, h: number, base: THREE.CanvasTexture, y: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 28), tcyl(r0, r1, h, base)); m.position.y = y; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  ring(2.7, 2.9, 0.22, tex32(0x3e2a1c, 'wood'), 0.11);
  ring(2.55, 2.65, 0.26, tex32(0x6a4a30, 'wood'), 0.35);
  mesh(new THREE.CylinderGeometry(2.58, 2.58, 0.04, 28), brass, [0, 0.49, 0], g);
  ring(2.45, 2.5, 0.1, tex32(top, 'soil'), 0.55);
  return g;
}
