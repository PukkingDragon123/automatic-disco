// The vignette stage: one small live 3D diorama at a time, rendered full screen behind the hand-drawn paper UI by the
// engine's own post pipeline (outlines and all). A turned wooden plinth, a key light with soft shadows, a rim light, a
// tinted backdrop with depth fog, and an orbit camera that drifts on its own and can be dragged. The free middle of
// the screen (between the paper cards) is where the diorama is framed: the projection is offset to centre it there.
import * as THREE from 'three';
import type { Post } from '../../gfx/post';
import { gbuf } from '../../gfx/gbuf';

export const lam = (c: number, o: { emissive?: number; transparent?: boolean; opacity?: number; side?: THREE.Side; flag?: number } = {}) =>
  gbuf(new THREE.MeshLambertMaterial({ color: c, emissive: o.emissive ?? 0, transparent: o.transparent, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, flatShading: true, depthWrite: !o.transparent }), o.flag ?? 1);
export const glowM = (c: number, opacity = 1) => gbuf(new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }), opacity < 1 ? 0 : 32);
export const ghostM = (c: number) => gbuf(new THREE.MeshBasicMaterial({ color: c, wireframe: true, transparent: true, opacity: 0.32, depthWrite: false }), 0);
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
    // the backdrop floor fades into the fog
    const fl = mesh(new THREE.CircleGeometry(30, 24), lam(new THREE.Color(bg).multiplyScalar(0.8).getHex()), [0, -0.02, 0], this.scene); fl.rotation.x = -Math.PI / 2;
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

/** a turned wooden plinth: a stepped base, a bevelled rim and a top in the given material colour */
export function plinth(top: number) {
  const g = new THREE.Group(), wood = lam(0x6a4a30), dark = lam(0x3e2a1c), brass = lam(0xb08a4a);
  mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.22, 28), dark, [0, 0.11, 0], g);
  mesh(new THREE.CylinderGeometry(2.55, 2.65, 0.26, 28), wood, [0, 0.35, 0], g);
  mesh(new THREE.CylinderGeometry(2.58, 2.58, 0.04, 28), brass, [0, 0.49, 0], g);
  mesh(new THREE.CylinderGeometry(2.45, 2.5, 0.1, 28), lam(top), [0, 0.55, 0], g);
  return g;
}
