// RTS camera: focus point on the ground, yaw, zoom distance; pitch eases lower as you zoom in.
// WASD / arrows / screen edges pan, Q/E rotate, wheel zooms, middle-drag pans, Alt+drag or Ctrl+middle orbits.
import * as THREE from 'three';
import type { Input } from './input';
import { clamp, damp, dampA } from '../core/rand';

export class RtsCam {
  readonly cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3();
  goal = new THREE.Vector3();
  yaw = Math.PI * 0.25; yawGoal = Math.PI * 0.25;
  dist = 42; distGoal = 42;
  minDist = 9; maxDist = 110;
  bounds = { x0: 0, z0: 0, x1: 128, z1: 128 };
  ground: (x: number, z: number) => number = () => 0;
  edgePan = true;
  enabled = true;
  private drag: { x: number; y: number; mode: 'pan' | 'orbit' } | null = null;
  private shakeT = 0; private shakeA = 0;
  private follow: (() => THREE.Vector3 | null) | null = null;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(36, aspect, 0.5, 900);
  }
  pitch(d = this.dist) { const t = clamp((d - this.minDist) / (this.maxDist - this.minDist), 0, 1); return 0.86 + t * 0.32; }
  shake(a: number, t = 0.35) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = Math.max(this.shakeT, t); }
  lookAt(x: number, z: number, snap = false) { this.goal.set(x, 0, z); if (snap) { this.target.copy(this.goal); } }
  followFn(f: (() => THREE.Vector3 | null) | null) { this.follow = f; }

  update(dt: number, inp: Input) {
    if (this.enabled) this.controls(dt, inp);
    if (this.follow) { const p = this.follow(); if (p) this.goal.set(p.x, 0, p.z); }
    const b = this.bounds;
    this.goal.x = clamp(this.goal.x, b.x0, b.x1); this.goal.z = clamp(this.goal.z, b.z0, b.z1);
    this.target.x = damp(this.target.x, this.goal.x, 12, dt);
    this.target.z = damp(this.target.z, this.goal.z, 12, dt);
    this.target.y = damp(this.target.y, this.ground(this.target.x, this.target.z), 6, dt);
    this.yaw = dampA(this.yaw, this.yawGoal, 10, dt);
    this.dist = damp(this.dist, this.distGoal, 10, dt);
    const p = this.pitch(this.dist);
    const c = this.cam;
    c.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(p) * this.dist,
      this.target.y + Math.sin(p) * this.dist,
      this.target.z + Math.cos(this.yaw) * Math.cos(p) * this.dist,
    );
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeA * Math.max(0, this.shakeT) * 2;
      c.position.x += (Math.random() - 0.5) * a; c.position.y += (Math.random() - 0.5) * a; c.position.z += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeA = 0;
    }
    c.lookAt(this.target.x, this.target.y + 0.5, this.target.z);
    c.updateMatrixWorld();
  }

  private controls(dt: number, inp: Input) {
    const sp = (18 + this.dist * 0.9) * dt;
    let mx = 0, mz = 0;
    if (inp.down('w') || inp.down('ArrowUp')) mz -= 1;
    if (inp.down('s') || inp.down('ArrowDown')) mz += 1;
    if (inp.down('a') || inp.down('ArrowLeft')) mx -= 1;
    if (inp.down('d') || inp.down('ArrowRight')) mx += 1;
    if (this.edgePan && inp.focused && inp.overCanvas && !this.drag && inp.buttons.size === 0) {
      const m = 6;
      if (inp.mx <= m) mx -= 1; else if (inp.mx >= innerWidth - m - 1) mx += 1;
      if (inp.my <= m) mz -= 1; else if (inp.my >= innerHeight - m - 1) mz += 1;
    }
    if (mx || mz) {
      const l = Math.hypot(mx, mz); mx /= l; mz /= l;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      this.goal.x += (mx * c + mz * s) * sp;
      this.goal.z += (-mx * s + mz * c) * sp;
      this.follow = null;
    }
    if (inp.down('q')) this.yawGoal += 1.8 * dt;
    if (inp.down('e')) this.yawGoal -= 1.8 * dt;
    if (inp.wheel) this.distGoal = clamp(this.distGoal * Math.pow(1.13, inp.wheel), this.minDist, this.maxDist);
    // middle drag pan / alt drag orbit
    const mid = inp.buttons.has(1), alt = inp.down('Alt') && inp.buttons.has(0);
    if ((mid || alt) && !this.drag) this.drag = { x: inp.mx, y: inp.my, mode: alt || inp.down('Control') ? 'orbit' : 'pan' };
    if (!(mid || alt)) this.drag = null;
    if (this.drag) {
      const dx = inp.mx - this.drag.x, dy = inp.my - this.drag.y;
      this.drag.x = inp.mx; this.drag.y = inp.my;
      if (this.drag.mode === 'orbit') { this.yawGoal -= dx * 0.008; this.distGoal = clamp(this.distGoal * (1 + dy * 0.004), this.minDist, this.maxDist); }
      else {
        const k = this.dist * 0.0022;
        const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
        this.goal.x -= (dx * c + dy * s) * k;
        this.goal.z -= (-dx * s + dy * c) * k;
        this.follow = null;
      }
    }
  }

  /** ray from screen pixel */
  ray(x: number, y: number, out = new THREE.Raycaster()) {
    out.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.cam);
    return out;
  }
}
