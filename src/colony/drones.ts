// Drones: ducted-fan machines that carry the pod's reach out across the map. Scouts are fast and carry a scanner
// gimbal; carriers hang a winch hook; repair drones a welding arm. Each docks on the pod's pad to charge, takes
// orders (move, patrol, return, work a target) or is steered directly (WASD relative to the camera, the mouse
// points it, the left button works its tool). Control signal: the pod and relay masts; beyond it a drone loses the
// link and flies home.
import * as THREE from 'three';
import { Kit, std, glow, TAU } from './kit';
import { armSheet, machSheet, COL } from './tex';
import type { Colony } from './colony';
import type { Creature } from '../game/creature';
import { clamp, damp, dampA } from '../core/rand';
import { lowpixModel, nodes } from './models';

export type DroneKind = 'scout' | 'carrier' | 'repair';
export interface DroneDef { name: string; short: string; speed: number; battery: number; drain: number; hp: number; alt: number; paint: string; size: number }
export const DRONE_DEF: Record<DroneKind, DroneDef> = {
  scout: { name: 'Scout Drone', short: 'SCOUT', speed: 9, battery: 100, drain: 0.55, hp: 60, alt: 3.2, paint: COL.orange, size: 0.8 },
  carrier: { name: 'Carrier Drone', short: 'CARRIER', speed: 5, battery: 100, drain: 0.8, hp: 120, alt: 3.6, paint: '#c79a2a', size: 1.25 },
  repair: { name: 'Repair Drone', short: 'REPAIR', speed: 6.5, battery: 100, drain: 0.65, hp: 90, alt: 2.8, paint: '#5d7a8a', size: 1.0 },
};
export type DroneOrder = { k: 'move'; x: number; z: number } | { k: 'patrol'; pts: [number, number][]; i: number } | { k: 'return' } | { k: 'work'; x: number; z: number };
const _v = new THREE.Vector3();

export class Drone {
  readonly def: DroneDef;
  readonly root = new THREE.Group();
  private body = new THREE.Group(); private fans: THREE.Object3D[] = []; private lamps: THREE.Mesh[] = [];
  readonly hook = new THREE.Group();
  x: number; z: number; y: number; vx = 0; vz = 0; vy = 0; yaw = 0; alt: number;
  hp: number; maxHp: number; battery: number;
  order: DroneOrder | null = null;
  docked = true; steering = false; working = false;
  carrying: Creature | null = null;
  /** steering input (set by the colony each frame while steered): -1..1 */
  input = { x: 0, z: 0, up: 0, boost: false };
  aimYaw = 0;
  level = 1;
  readonly id: number; private static seq = 0;
  private t = Math.random() * 10; private bank = new THREE.Vector2();
  readonly flag = { value: 1 };
  constructor(readonly colony: Colony, readonly kind: DroneKind, readonly pad: number) {
    this.def = DRONE_DEF[kind]; this.id = ++Drone.seq;
    this.maxHp = this.hp = this.def.hp; this.battery = this.def.battery; this.alt = this.def.alt;
    const p = colony.padPos(pad);
    this.x = p.x; this.z = p.z; this.y = p.y;
    this.build();
    colony.g.world.scene.add(this.root);
    this.root.userData.sel = { kind: 'drone', ref: this };
  }
  get name() { return `${this.def.short}-${String(this.id).padStart(2, '0')}`; }
  get speed() { return this.def.speed * (1 + (this.level - 1) * 0.15); }

  private build() {
    const d = this.def, s = d.size, sheet = armSheet(d.paint, 9 + this.pad), ms = machSheet(11);
    const paint = std(0xffffff, { map: sheet.map, bump: sheet.bump, bumpScale: 1.4, rough: 0.5, metal: 0.2, flag: this.flag });
    const white = std(0xdcd9cf, { rough: 0.5, metal: 0.1, flag: this.flag });
    const dark = std(0xffffff, { map: ms.map, bump: ms.bump, rough: 0.5, metal: 0.5, flag: this.flag });
    const steel = std(0x9a9d9e, { rough: 0.32, metal: 0.8, flag: this.flag });
    const k = new Kit();
    // the hull: a chamfered pod with a dorsal spine and a belly sensor
    k.box(0.62 * s, 0.24 * s, 0.9 * s, white, { p: [0, 0, 0] });
    k.box(0.5 * s, 0.12 * s, 0.7 * s, paint, { p: [0, 0.17 * s, -0.05 * s] });
    k.box(0.52 * s, 0.1 * s, 0.3 * s, dark, { p: [0, -0.16 * s, 0.15 * s] });
    k.cyl(0.1 * s, 0.12 * s, 0.06 * s, dark, { p: [0, 0.25 * s, -0.25 * s] }, 10);
    k.rod([0.12 * s, 0.25 * s, -0.3 * s], [0.12 * s, 0.6 * s, -0.36 * s], 0.008 * s, steel, 4);
    k.box(0.2 * s, 0.08 * s, 0.05 * s, glow(0x7fd48a, 1.6), { p: [0, 0.03 * s, 0.46 * s] });
    // four arms to the ducts
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2, x = Math.sin(a) * 0.62 * s, z = Math.cos(a) * 0.62 * s;
      k.beam([Math.sin(a) * 0.2 * s, 0.02 * s, Math.cos(a) * 0.3 * s], [x, 0.04 * s, z], 0.08 * s, 0.06 * s, paint);
      k.lathe([[0.27 * s, -0.08 * s], [0.3 * s, -0.06 * s], [0.3 * s, 0.07 * s], [0.27 * s, 0.09 * s], [0.25 * s, 0.07 * s], [0.25 * s, -0.06 * s]], white, { p: [x, 0.04 * s, z] }, 20);
      k.cyl(0.05 * s, 0.05 * s, 0.12 * s, dark, { p: [x, 0.04 * s, z] }, 8);
      const fan = new THREE.Group(); fan.position.set(x, 0.05 * s, z); this.body.add(fan); this.fans.push(fan);
      const fk = new Kit(); for (let b = 0; b < 5; b++) fk.box(0.23 * s, 0.01 * s, 0.05 * s, steel, { p: [Math.cos((b / 5) * TAU) * 0.12 * s, 0, Math.sin((b / 5) * TAU) * 0.12 * s], r: [0.3, -(b / 5) * TAU, 0] });
      fan.add(fk.build('fan'));
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.03 * s, 6, 4), glow(i < 2 ? 0x30ff70 : 0xff3020, 2)); lamp.position.set(x * 1.45, 0.04 * s, z * 1.45); this.body.add(lamp); this.lamps.push(lamp);
    }
    // landing skids
    for (const sx of [-1, 1]) { k.rod([sx * 0.25 * s, -0.12 * s, -0.3 * s], [sx * 0.3 * s, -0.36 * s, -0.3 * s], 0.015 * s, steel, 5); k.rod([sx * 0.25 * s, -0.12 * s, 0.3 * s], [sx * 0.3 * s, -0.36 * s, 0.3 * s], 0.015 * s, steel, 5); k.rod([sx * 0.3 * s, -0.36 * s, -0.42 * s], [sx * 0.3 * s, -0.36 * s, 0.42 * s], 0.02 * s, steel, 5); }
    // payloads
    if (this.kind === 'scout') {
      k.sph(0.12 * s, dark, { p: [0, -0.24 * s, 0.32 * s] }, 12, 8);
      k.cyl(0.05 * s, 0.05 * s, 0.06 * s, glow(0x9ad8ff, 2.2), { p: [0, -0.26 * s, 0.43 * s], r: [Math.PI / 2, 0, 0] }, 10);
    } else if (this.kind === 'repair') {
      k.box(0.08 * s, 0.08 * s, 0.4 * s, steel, { p: [0.18 * s, -0.22 * s, 0.35 * s], r: [0.4, 0, 0] });
      k.cyl(0.03 * s, 0.02 * s, 0.16 * s, std(0xd0d4d6, { rough: 0.15, metal: 0.95 }), { p: [0.18 * s, -0.36 * s, 0.55 * s], r: [Math.PI / 2 + 0.4, 0, 0] }, 8);
      k.cyl(0.07 * s, 0.07 * s, 0.3 * s, std(0x2b5884, { rough: 0.4 }), { p: [-0.18 * s, -0.18 * s, 0], r: [Math.PI / 2, 0, 0] }, 10);
    }
    const kitModel = k.build('drone'); this.body.add(kitModel);
    if (this.kind === 'carrier') {
      const hk = new Kit(); hk.box(0.2 * s, 0.14 * s, 0.2 * s, dark, {}); hk.tor(0.08 * s, 0.02 * s, steel, { p: [0, -0.16 * s, 0], r: [0, 0, 0] }, 5, 12, Math.PI * 1.5);
      this.hook.add(hk.build('hook')); this.hook.position.set(0, -0.5 * s, 0); this.body.add(this.hook);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 4).translate(0, 0.5, 0), steel); line.position.set(0, -0.5 * s, 0); line.name = 'line'; this.body.add(line);
    }
    this.root.add(this.body);
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    // the lowpix model (tools/lowpix/drone_*.json) replaces the stand-in once it has loaded
    lowpixModel('drone_' + this.kind, { width: 1.5 * s, origin: 'center', flag: this.flag }).then((m) => {
      if (!m || this.gone) return;
      kitModel.visible = false; for (const f of this.fans) f.visible = false; for (const l of this.lamps) l.visible = false;
      for (const c of this.hook.children) c.visible = false; const line = this.body.getObjectByName('line'); if (line) line.visible = false;
      m.position.y = 0.05 * s; this.body.add(m);
      this.fans = nodes(m, 'hub'); this.fanAxis = 'z'; this.lamps = [];
    });
  }
  private fanAxis: 'y' | 'z' = 'y'; private gone = false;

  /** distance the control signal reaches here (1 = full, 0 = lost) */
  signal() { return this.colony.signalAt(this.x, this.z); }

  update(dt: number, simDt: number) {
    this.t += dt;
    const c = this.colony, g = c.g, R = g.region, N = R.N;
    const ground = g.world.surfaceY(clamp(this.x, 0, N - 0.01), clamp(this.z, 0, N - 0.01));
    const water = R.isWater(this.x, this.z) ? Math.max(ground, R.water) : ground;
    let ax = 0, az = 0, wantAlt = this.alt;
    const sp = this.speed * (this.input.boost && this.steering ? 1.6 : 1);
    if (simDt > 0) {
      // battery: flying drains it, the pad charges it (from the pod's power)
      if (this.docked) { const ch = Math.min(this.def.battery - this.battery, simDt * 2.2); if (ch > 0 && c.vitals.powerOk) { this.battery += ch; c.vitals.spend(ch * 0.05); } }
      else this.battery = Math.max(0, this.battery - simDt * this.def.drain * (this.working ? 2 : 1) * (this.input.boost && this.steering ? 1.8 : 1));
      if (this.battery <= 0 && !this.docked) { this.order = { k: 'return' }; if (this.steering) c.release('BATTERY FLAT: RETURNING'); }
      if (this.signal() <= 0 && !this.docked && this.order?.k !== 'return') { this.order = { k: 'return' }; if (this.steering) c.release('SIGNAL LOST: DRONE RETURNING'); c.alert(`${this.name}: signal lost, flying home`, 'warn', new THREE.Vector3(this.x, this.y, this.z)); }
    }
    if (this.steering) {
      this.docked = false;
      const s = Math.sin(g.cam.yaw), co = Math.cos(g.cam.yaw);
      ax = this.input.x * co + this.input.z * s; az = -this.input.x * s + this.input.z * co;
      const l = Math.hypot(ax, az); if (l > 1) { ax /= l; az /= l; }
      ax *= sp; az *= sp;
      wantAlt = this.alt + this.input.up * 2;
      this.alt = clamp(this.alt + this.input.up * dt * 3, 1.4, 9);
    } else if (this.order) {
      let tx = 0, tz = 0, arrive = 0.6;
      const o = this.order;
      if (o.k === 'move' || o.k === 'work') { tx = o.x; tz = o.z; }
      else if (o.k === 'patrol') { [tx, tz] = o.pts[o.i]; arrive = 1.5; }
      else { const p = c.padPos(this.pad); tx = p.x; tz = p.z; arrive = 0.25; }
      const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
      if (d < arrive) {
        if (o.k === 'patrol') o.i = (o.i + 1) % o.pts.length;
        else if (o.k === 'return') { this.order = null; this.docked = true; if (this.carrying) c.deliver(this); }
        else if (o.k === 'move') this.order = null;
      } else {
        this.docked = false;
        const k = Math.min(1, d / 3);
        ax = (dx / d) * sp * k; az = (dz / d) * sp * k;
      }
      if (o.k === 'return') wantAlt = d < 2 ? 0.5 : this.alt;
    } else if (this.docked) {
      const p = c.padPos(this.pad); this.x = damp(this.x, p.x, 4, dt); this.z = damp(this.z, p.z, 4, dt); wantAlt = 0;
    }
    if (simDt > 0 || this.steering) {
      const k = this.steering ? 5 : 3, step = this.steering ? Math.max(dt, simDt) : simDt;
      this.vx = damp(this.vx, ax, k, step); this.vz = damp(this.vz, az, k, step);
      this.x = clamp(this.x + this.vx * step, 1, N - 1); this.z = clamp(this.z + this.vz * step, 1, N - 1);
      // keep out of the pod's hull
      const px = this.x - c.pod.x, pz = this.z - c.pod.z, pd = Math.hypot(px, pz);
      if (pd < 3.3 && wantAlt + water < c.pod.y + 7.6 && !this.docked && this.order?.k !== 'return') { this.x = c.pod.x + (px / (pd || 1)) * 3.3; this.z = c.pod.z + (pz / (pd || 1)) * 3.3; }
    }
    const padY = this.docked || (this.order?.k === 'return' && Math.hypot(this.x - c.padPos(this.pad).x, this.z - c.padPos(this.pad).z) < 2) ? c.padPos(this.pad).y + 0.36 * this.def.size : water + wantAlt;
    this.y = damp(this.y, Math.max(padY, water + (this.docked ? 0 : 0.6)), 3, dt);
    // face the way it flies, or where the pointer is while steered
    const moving = Math.hypot(this.vx, this.vz);
    const yG = this.steering ? this.aimYaw : moving > 0.3 ? Math.atan2(this.vx, this.vz) : this.yaw;
    this.yaw = dampA(this.yaw, yG, 5, dt);
    // bank into the acceleration
    this.bank.x = damp(this.bank.x, clamp(ax * 0.03, -0.35, 0.35), 4, dt); this.bank.y = damp(this.bank.y, clamp(az * 0.03, -0.35, 0.35), 4, dt);
    const hover = this.docked ? 0 : Math.sin(this.t * 2.1) * 0.05;
    this.root.position.set(this.x, this.y + hover, this.z);
    this.root.rotation.set(0, 0, 0); this.root.rotateY(this.yaw);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    this.body.rotation.set(this.bank.y * cy - this.bank.x * sy, 0, -(this.bank.x * cy + this.bank.y * sy));
    const spin = this.docked && this.y < c.padPos(this.pad).y + 0.5 ? 0.2 : 30;
    for (let i = 0; i < this.fans.length; i++) this.fans[i].rotation[this.fanAxis] += dt * spin * (i & 1 ? 1 : -1);
    for (let i = 0; i < this.lamps.length; i++) this.lamps[i].visible = ((this.t + i * 0.2) % 1.2) < 0.6;
    if (this.kind === 'carrier') {
      const line = this.body.getObjectByName('line') as THREE.Mesh | undefined, drop = this.carrying ? 1.4 : this.working ? 1.2 : 0.2;
      this.hook.position.y = damp(this.hook.position.y, -0.5 * this.def.size - drop, 3, dt);
      if (line) { line.position.y = this.hook.position.y; line.scale.y = Math.max(0.01, -this.hook.position.y - 0.5 * this.def.size); }
    }
    // a carried creature hangs from the hook
    if (this.carrying) {
      const cr = this.carrying, hp = this.hook.getWorldPosition(_v);
      if (cr.dead && cr.digest <= 0) this.carrying = null;
      else { cr.x = hp.x; cr.z = hp.z; cr.y = g.world.surfaceY(clamp(cr.x, 0, N - 0.01), clamp(cr.z, 0, N - 0.01)); cr.air = Math.max(0.2, hp.y - cr.y - cr.size * 0.6); cr.stunT = Math.max(cr.stunT, 0.3); cr.mind = 'held'; }
    }
    if (simDt > 0 && this.hp < this.maxHp * 0.3 && Math.random() < simDt * 4) g.fx.burst(this.x, this.y, this.z, 2, 0x3a3a3a, { speed: 0.5, up: 1.2, size: 2, life: 0.8 });
  }
  /** the tool point (under the nose) */
  tip(out = new THREE.Vector3()) { return this.kind === 'carrier' ? this.hook.getWorldPosition(out) : this.root.localToWorld(out.set(0, -0.3 * this.def.size, 0.5 * this.def.size)); }
  damage(n: number) { this.hp = Math.max(0, this.hp - n); if (this.hp <= 0) this.colony.droneDown(this); }
  repair(n: number) { this.hp = Math.min(this.maxHp, this.hp + n); }
  dispose() { this.gone = true; this.root.removeFromParent(); }
}
