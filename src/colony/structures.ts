// Area structures raised around the pod: the GRAVITATION POLE (a ring-stacked pylon whose field lifts, pushes away
// or pulls in everything inside six metres), RELAY MASTS (lattice towers carrying the control signal further), LAMP
// POSTS (floodlights: morale, and night things keep off) and SENSOR MASTS (radar and a camera head that see and scan).
// They rise from a scaffold while being built (faster with crew on site), draw power, take damage, can be welded.
import * as THREE from 'three';
import { Kit, std, glow, TAU } from './kit';
import { machSheet, hazardTex, armSheet, COL } from './tex';
import type { Colony } from './colony';
import { clamp, damp } from '../core/rand';
import { CATALOG, type CatId } from './catalog';

export type StructKind = 'gravpole' | 'relay' | 'lamp' | 'sensor';
export type PoleMode = 'off' | 'lift' | 'push' | 'pull';
const HP: Record<StructKind, number> = { gravpole: 420, relay: 260, lamp: 120, sensor: 220 };
export const FIELD_R = 6;

export class Structure {
  readonly root = new THREE.Group(); private model = new THREE.Group(); private scaffold: THREE.Group;
  hp: number; maxHp: number; progress = 0; done = false;
  mode: PoleMode = 'lift';
  readonly id: number; private static seq = 0;
  private spin: THREE.Object3D[] = []; private rings: THREE.Object3D[] = []; private field: THREE.Mesh | null = null;
  private light: THREE.PointLight | null = null; private lens: THREE.MeshBasicMaterial | null = null;
  private t = Math.random() * 10;
  readonly flag = { value: 1 };
  y: number;
  level = 1;
  constructor(readonly colony: Colony, readonly kind: StructKind, public x: number, public z: number, prebuilt = false) {
    this.id = ++Structure.seq;
    this.maxHp = this.hp = HP[kind];
    this.y = colony.g.region.heightAt(x, z);
    this.root.position.set(x, this.y, z);
    this.build();
    this.scaffold = this.buildScaffold();
    this.root.add(this.model, this.scaffold);
    colony.g.world.scene.add(this.root);
    this.root.userData.sel = { kind: 'struct', ref: this };
    if (prebuilt) this.finish(true);
    else { this.model.scale.set(1, 0.02, 1); }
  }
  get cat(): CatId { return ('st_' + this.kind) as CatId; }
  get name() { return `${CATALOG[this.cat].name.toUpperCase()} ${String(this.id).padStart(2, '0')}`; }
  get height() { return this.kind === 'relay' ? 9 : this.kind === 'gravpole' ? 6.5 : this.kind === 'sensor' ? 5.5 : 4.2; }
  get radius() { return this.kind === 'gravpole' ? 0.9 : 0.6; }
  get kw() { return !this.done ? 0 : this.kind === 'gravpole' ? (this.mode === 'off' ? 0.5 : 14) : CATALOG[this.cat].kw; }

  private build() {
    const M = this.model, ms = machSheet(13), as = armSheet(this.kind === 'gravpole' ? '#4b4f78' : COL.orange, 20 + this.id % 5);
    const dark = std(0xffffff, { map: ms.map, bump: ms.bump, rough: 0.5, metal: 0.5, flag: this.flag });
    const paint = std(0xffffff, { map: as.map, bump: as.bump, rough: 0.5, metal: 0.2, flag: this.flag });
    const white = std(0xdcd9cf, { rough: 0.55, metal: 0.1, flag: this.flag });
    const steel = std(0x9a9d9e, { rough: 0.32, metal: 0.8, flag: this.flag });
    const hazard = std(0xffffff, { map: hazardTex(), rough: 0.5, flag: this.flag });
    const brass = std(0xb08a3a, { rough: 0.35, metal: 0.8, flag: this.flag });
    const k = new Kit();
    // a cast footing with bolts, common to all
    k.cyl(0.62, 0.72, 0.22, dark, { p: [0, 0.11, 0] }, 8);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; k.cyl(0.04, 0.04, 0.08, steel, { p: [Math.sin(a) * 0.58, 0.24, Math.cos(a) * 0.58] }, 6); }
    k.cyl(0.66, 0.66, 0.05, hazard, { p: [0, 0.24, 0] }, 8, true);
    if (this.kind === 'gravpole') {
      k.cyl(0.24, 0.32, 5.4, dark, { p: [0, 2.9, 0] }, 12);
      k.cyl(0.42, 0.42, 0.5, paint, { p: [0, 0.6, 0] }, 12);
      for (const y of [1.4, 5.8]) k.cyl(0.36, 0.36, 0.2, paint, { p: [0, y, 0] }, 12);
      k.sph(0.32, glow(0xa090ff, 2.4), { p: [0, 6.25, 0] }, 12, 8);
      for (let i = 0; i < 6; i++) k.rod([Math.sin((i / 6) * TAU) * 0.3, 5.9, Math.cos((i / 6) * TAU) * 0.3], [Math.sin((i / 6) * TAU) * 0.12, 6.6, Math.cos((i / 6) * TAU) * 0.12], 0.025, brass, 5);
      for (let i = 0; i < 4; i++) k.pipe([[Math.sin(i * 1.57) * 0.3, 0.5, Math.cos(i * 1.57) * 0.3], [Math.sin(i * 1.57) * 0.42, 2.5, Math.cos(i * 1.57) * 0.42], [Math.sin(i * 1.57) * 0.3, 5.6, Math.cos(i * 1.57) * 0.3]], 0.03, std(0x1d1f21, { rough: 0.9, flag: this.flag }), 12, 5);
      // three counter-rotating coil rings
      for (let i = 0; i < 3; i++) {
        const rg = new THREE.Group(); rg.position.y = 2.4 + i * 1.15; M.add(rg); this.rings.push(rg);
        const rk = new Kit(); rk.tor(0.75 - i * 0.08, 0.07, brass, {}, 6, 28); for (let s = 0; s < 4; s++) rk.box(0.16, 0.16, 0.16, dark, { p: [Math.sin((s / 4) * TAU) * (0.75 - i * 0.08), 0, Math.cos((s / 4) * TAU) * (0.75 - i * 0.08)] });
        rg.add(rk.build('ring'));
      }
      // the field: a soft dome on the ground (additive, shown when on)
      const fm = new THREE.ShaderMaterial({
        uniforms: { uT: { value: 0 }, uCol: { value: new THREE.Color(0x9a8aff) }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'layout(location = 1) out highp vec4 gNormal;\nuniform float uT, uK; uniform vec3 uCol; varying vec3 vP; varying vec3 vN; void main(){ float h = vP.y / 4.0; float band = smoothstep(0.92, 1.0, fract(h * 6.0 - uT * 0.6)); float rim = pow(1.0 - abs(vN.z), 2.0); float a = (0.05 + rim * 0.18 + band * 0.25) * (1.0 - h) * uK; gl_FragColor = vec4(uCol * a, a); gNormal = vec4(0.0); }',
      });
      (fm as unknown as { __gb: boolean }).__gb = true;
      this.field = new THREE.Mesh(new THREE.SphereGeometry(FIELD_R, 32, 12, 0, TAU, 0, Math.PI / 2), fm); this.field.scale.y = 0.65; this.field.renderOrder = 5; M.add(this.field);
    } else if (this.kind === 'relay') {
      // a three-legged lattice tower with a dish and whips
      const legs = [0, 1, 2].map((i) => [Math.sin((i / 3) * TAU) * 0.5, Math.cos((i / 3) * TAU) * 0.5]);
      for (const [x, z] of legs) k.rod([x, 0.2, z], [x * 0.25, 8.4, z * 0.25], 0.045, white, 6);
      for (let y = 0.6; y < 8.2; y += 0.7) { const f = 1 - (y / 8.4) * 0.75; for (let i = 0; i < 3; i++) { const [x0, z0] = legs[i], [x1, z1] = legs[(i + 1) % 3]; k.rod([x0 * f, y, z0 * f], [x1 * f, y + 0.35, z1 * f], 0.018, steel, 4); k.rod([x1 * f, y, z1 * f], [x0 * f, y + 0.35, z0 * f], 0.018, steel, 4); } }
      k.box(0.5, 0.4, 0.4, paint, { p: [0, 7.6, 0] });
      k.lathe([[0, 0], [0.2, 0.02], [0.45, 0.1], [0.55, 0.18]], white, { p: [0.35, 7.9, 0], r: [0, 0, -1.3] }, 20);
      k.rod([0, 8.4, 0], [0, 9.4, 0], 0.02, steel, 4);
      k.box(0.3, 0.6, 0.2, dark, { p: [0, 0.6, 0.5] });
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), glow(0xff3020, 2.2)); tip.position.y = 9.45; M.add(tip); this.spin.push(tip);
    } else if (this.kind === 'lamp') {
      k.cyl(0.08, 0.11, 3.9, white, { p: [0, 2.1, 0] }, 8);
      k.box(0.3, 0.5, 0.2, dark, { p: [0, 0.75, 0.12] });
      k.beam([0, 3.95, 0], [0.7, 4.1, 0], 0.08, 0.08, white);
      k.box(0.5, 0.18, 0.36, paint, { p: [0.85, 4.05, 0], r: [0, 0, -0.35] });
      this.lens = glow(0xfff1d0, 2.6); k.box(0.42, 0.02, 0.28, this.lens, { p: [0.87, 3.95, 0], r: [0, 0, -0.35] });
      this.light = new THREE.PointLight(0xffe2b0, 0, 14, 1.6); this.light.position.set(0.9, 3.6, 0); M.add(this.light);
    } else if (this.kind === 'sensor') {
      k.cyl(0.12, 0.16, 4.2, white, { p: [0, 2.3, 0] }, 10);
      for (const y of [1.5, 3.0]) k.cyl(0.2, 0.2, 0.12, dark, { p: [0, y, 0] }, 10);
      k.box(0.36, 0.5, 0.25, dark, { p: [0, 0.8, 0.18] });
      const head = new THREE.Group(); head.position.y = 4.55; M.add(head); this.spin.push(head);
      const hk = new Kit(); hk.box(1.5, 0.3, 0.1, paint, {}); hk.box(1.4, 0.22, 0.02, std(0x1a2a34, { rough: 0.2, metal: 0.6, flag: this.flag }), { p: [0, 0, 0.06] });
      hk.sph(0.18, dark, { p: [0, -0.3, 0.15] }, 10, 8); hk.cyl(0.07, 0.07, 0.08, glow(0x9ad8ff, 2.2), { p: [0, -0.32, 0.32], r: [Math.PI / 2, 0, 0] }, 8);
      head.add(hk.build('sensor-head'));
    }
    M.add(k.build(this.kind));
    M.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m !== this.field) m.castShadow = true; });
  }
  private buildScaffold() {
    const k = new Kit(), m = std(0xc79a2a, { rough: 0.6, metal: 0.3 }), h = this.height;
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [0.8, 0.8], [-0.8, 0.8]]) k.rod([x, 0, z], [x, h, z], 0.035, m, 5);
    for (let y = 0.8; y < h; y += 1.0) for (const [a, b] of [[[-0.8, -0.8], [0.8, -0.8]], [[0.8, -0.8], [0.8, 0.8]], [[0.8, 0.8], [-0.8, 0.8]], [[-0.8, 0.8], [-0.8, -0.8]]]) k.rod([a[0], y, a[1]], [b[0], y, b[1]], 0.025, m, 4);
    const g = k.build('scaffold'); return g;
  }
  finish(quiet = false) {
    this.done = true; this.progress = 1; this.model.scale.set(1, 1, 1); this.scaffold.visible = false;
    if (!quiet) { this.colony.alert(`${this.name} online`, 'good', new THREE.Vector3(this.x, this.y + 2, this.z)); this.colony.g.emit('built-attachment', { kind: this.kind, x: this.x, z: this.z }); }
  }
  /** build progress per second (crew on site double it) */
  update(dt: number, simDt: number) {
    this.t += dt;
    if (!this.done) {
      if (simDt > 0) {
        const crew = this.colony.teammates.some((tm) => tm.alive && Math.hypot(tm.x - this.x, tm.z - this.z) < 2.6 && tm.state === 'work');
        this.progress += (simDt / CATALOG[this.cat].time) * (crew ? 2 : 1);
        if (Math.random() < simDt * 3) this.colony.g.fx.burst(this.x + (Math.random() - 0.5), this.y + this.progress * this.height, this.z + (Math.random() - 0.5), 2, 0xffc060, { glow: true, speed: 1.5, up: 1, size: 2, life: 0.4 });
      }
      this.model.scale.y = Math.max(0.02, this.progress);
      if (this.progress >= 1) this.finish();
      return;
    }
    const pw = this.colony.vitals.powerOk ? 1 : 0;
    if (this.kind === 'gravpole') {
      const on = this.mode !== 'off' && pw > 0;
      for (let i = 0; i < this.rings.length; i++) { const r = this.rings[i]; r.rotation.y += dt * (on ? 1.2 + i * 0.5 : 0.1) * (i & 1 ? -1 : 1); r.position.y = 2.4 + i * 1.15 + (on ? Math.sin(this.t * 2 + i) * 0.08 : 0); }
      if (this.field) { const U = (this.field.material as THREE.ShaderMaterial).uniforms; U.uT.value = this.t * (this.mode === 'push' ? -1 : 1); U.uK.value = damp(U.uK.value as number, on ? 1 : 0, 3, dt); U.uCol.value.set(this.mode === 'push' ? 0xff9a7a : this.mode === 'pull' ? 0x7affd0 : 0x9a8aff); this.field.visible = (U.uK.value as number) > 0.02; }
      if (on && simDt > 0) this.colony.fieldTick(this, simDt);
    } else if (this.kind === 'lamp') {
      const night = 1 - clamp(this.colony.daylight() * 1.6 - 0.4, 0, 1);
      if (this.light) this.light.intensity = damp(this.light.intensity, pw * night * 7, 3, dt);
      if (this.lens) this.lens.color.setRGB(2.6, 2.4, 2.1).multiplyScalar(0.2 + 0.8 * pw * Math.max(0.3, night));
    } else if (this.kind === 'sensor') { if (this.spin[0]) this.spin[0].rotation.y += dt * 1.1 * pw; }
    else if (this.kind === 'relay') { if (this.spin[0]) this.spin[0].visible = (this.t % 1.4) < 0.5; }
    if (simDt > 0 && this.hp < this.maxHp * 0.35 && Math.random() < simDt * 3) this.colony.g.fx.burst(this.x, this.y + this.height * 0.6, this.z, 2, 0x3a3a3a, { speed: 0.4, up: 1.5, size: 3, life: 1.2 });
  }
  damage(n: number) { this.hp = Math.max(0, this.hp - n); if (this.hp <= 0) this.colony.structureDown(this); }
  repair(n: number) { this.hp = Math.min(this.maxHp, this.hp + n); }
  dispose() { this.root.removeFromParent(); this.light?.dispose(); }
}
void clamp;
