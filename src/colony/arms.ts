// The pod's arms: industrial manipulators bolted to the hardpoints on the equipment band. Each is a yawing turret, a
// shoulder and an elbow driven by hydraulic rams, a wrist and a tool head (claw, gravity grabber, drill, welder,
// gravity projector), solved by two-bone IK toward a work point and eased like heavy servos. An arm only works inside
// its reach. The cannon is a turret on the same mounts (it aims in the cinematic barrel view, colony/cannon.ts).
import * as THREE from 'three';
import { Kit, std, glow, TAU } from './kit';
import { armSheet, machSheet, hazardTex, COL } from './tex';
import type { Hardpoint } from './podModel';
import type { Colony } from './colony';
import type { Creature } from '../game/creature';
import { sfx } from '../audio/audio';
import { vfx2d } from '../game/vfx2d';
import { floatText } from '../ui/floatText';
import { clamp, damp } from '../core/rand';

export type ArmKind = 'manipulator' | 'grabber' | 'drill' | 'welder' | 'cannon' | 'gravity';
export interface ArmDef { name: string; short: string; l1: number; l2: number; paint: string; desc: string; idleKW: number; workKW: number; hp: number }
export const ARM_DEF: Record<ArmKind, ArmDef> = {
  manipulator: { name: 'Manipulator Arm', short: 'MANIP', l1: 2.7, l2: 2.5, paint: COL.orange, desc: 'Three-finger claw on a six-metre boom. Scans, samples and plants seeds at its tip.', idleKW: 1.5, workKW: 5, hp: 260 },
  grabber: { name: 'Gravity Grabber', short: 'GRAB', l1: 2.9, l2: 2.8, paint: '#b3542c', desc: 'A graviton coil at the end of a long boom: lifts a creature or a boulder, swings it, throws it.', idleKW: 2, workKW: 14, hp: 300 },
  drill: { name: 'Core Drill Arm', short: 'DRILL', l1: 2.5, l2: 2.3, paint: '#c79a2a', desc: 'A heavy boom with a fluted core bit. Bores seams and rock in reach into ore.', idleKW: 2, workKW: 18, hp: 360 },
  welder: { name: 'Welder Arm', short: 'WELD', l1: 2.7, l2: 2.6, paint: '#5d7a8a', desc: 'An arc torch and wire feed. Repairs the pod, structures, drones and arms in reach.', idleKW: 1.5, workKW: 12, hp: 260 },
  cannon: { name: 'Mass Driver Cannon', short: 'CANNON', l1: 0.7, l2: 3.4, paint: '#59604a', desc: 'A coil-gun turret on the band. Aimed from over the barrel. Long range, slow to recharge.', idleKW: 2, workKW: 40, hp: 420 },
  gravity: { name: 'Gravity Projector', short: 'G-PROJ', l1: 1.9, l2: 1.6, paint: '#4b4f78', desc: 'A field lens on a short boom that throws a lift field fourteen metres out.', idleKW: 3, workKW: 22, hp: 280 },
};
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** a hydraulic ram between two objects: a barrel on A, a chrome rod on B, re-aimed every frame */
class Ram {
  readonly barrel: THREE.Mesh; readonly rod: THREE.Mesh;
  constructor(parent: THREE.Object3D, readonly a: THREE.Object3D, readonly aOff: THREE.Vector3, readonly b: THREE.Object3D, readonly bOff: THREE.Vector3, r: number, mBarrel: THREE.Material, mRod: THREE.Material) {
    this.barrel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10).translate(0, 0.5, 0), mBarrel);
    this.rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 1, 8).translate(0, 0.5, 0), mRod);
    for (const m of [this.barrel, this.rod]) { m.castShadow = true; parent.add(m); }
    this.parent = parent;
  }
  private parent: THREE.Object3D;
  update() {
    const A = this.a.localToWorld(_v.copy(this.aOff)), B = this.b.localToWorld(_v2.copy(this.bOff));
    this.parent.worldToLocal(A); this.parent.worldToLocal(B);
    const d = B.clone().sub(A), L = d.length(); d.normalize();
    _q.setFromUnitVectors(UP, d);
    this.barrel.position.copy(A); this.barrel.quaternion.copy(_q); this.barrel.scale.set(1, L * 0.6, 1);
    this.rod.position.copy(B); this.rod.quaternion.setFromUnitVectors(UP, d.negate()); this.rod.scale.set(1, L * 0.5, 1);
  }
}

export class Arm {
  readonly def: ArmDef;
  readonly root = new THREE.Group();
  readonly turret = new THREE.Group(); readonly shoulder = new THREE.Group(); readonly elbow = new THREE.Group(); readonly wrist = new THREE.Group(); readonly head = new THREE.Group();
  readonly fingers: THREE.Group[] = [];
  private bit: THREE.Group | null = null;
  private rams: Ram[] = [];
  hp: number; maxHp: number;
  /** where the tip is going (world); null: the parked pose */
  target: THREE.Vector3 | null = null;
  /** under direct control */
  controlled = false;
  /** working now (drill spinning, torch lit, field on) */
  working = false;
  /** what the grabber or the projector holds */
  holding: Creature | null = null;
  heat = 0;
  /** slot level bonus (tools.ts sets it from the wheel slot running this arm) */
  level = 1;
  private yaw = 0; private a1 = 1.2; private a2 = -2.3; private aw = 0;
  private sy = 0.42; private sz = 0.3;
  private t = Math.random() * 10; private sfxT = 0; private grip = 0;
  readonly id: number;
  private static seq = 0;
  constructor(readonly colony: Colony, readonly kind: ArmKind, readonly hpt: Hardpoint) {
    this.def = ARM_DEF[kind];
    this.id = ++Arm.seq;
    this.maxHp = this.hp = this.def.hp;
    this.build();
    hpt.mount.add(this.root);
    hpt.cap.visible = false;
    this.root.userData.arm = this;
  }
  get name() { return `${this.def.short} ${String(this.hpt.i + 1).padStart(2, '0')}`; }
  /** the reach from the pod's centre on the ground (m), with the slot's level */
  get reach() {
    if (this.kind === 'cannon') return 70 * (1 + (this.level - 1) * 0.15);
    if (this.kind === 'gravity') return 14 * (1 + (this.level - 1) * 0.12);
    const L = (this.def.l1 + this.def.l2) * (1 + (this.level - 1) * 0.08), drop = this.hpt.y + this.sy - 0.6;
    return this.hpt.r + this.sz + Math.sqrt(Math.max(0, L * L - drop * drop)) * 0.97;
  }
  /** the boom's own reach (IK), for the projector and the grabber's hold distance */
  get boom() { return (this.def.l1 + this.def.l2) * (1 + (this.level - 1) * 0.08); }

  // ------------------------------------------------------------------ the model
  private build() {
    const kind = this.kind, d = this.def, sheet = armSheet(d.paint, this.hpt.i + 1), mach = machSheet(5);
    const paint = std(0xffffff, { map: sheet.map, bump: sheet.bump, bumpScale: 1.6, rough: 0.5, metal: 0.2 });
    const dark = std(0xffffff, { map: mach.map, bump: mach.bump, bumpScale: 1.4, rough: 0.5, metal: 0.5 });
    const steel = std(0x9a9d9e, { rough: 0.32, metal: 0.8 }), chrome = std(0xd0d4d6, { rough: 0.15, metal: 0.95 }), rubber = std(0x1d1f21, { rough: 0.9, metal: 0 });
    const hazard = std(0xffffff, { map: hazardTex(), rough: 0.5 });
    this.mats = { paint, dark, steel, chrome };
    const R = this.root;
    // base: a slewing ring on the hardpoint flange, the turret housing with its drive motor
    R.add(this.turret);
    { const k = new Kit();
      k.cyl(0.4, 0.44, 0.16, dark, { p: [0, 0, 0.06], r: [Math.PI / 2, 0, 0] }, 20);
      k.tor(0.41, 0.03, steel, { p: [0, 0, 0.15] }, 6, 28);
      R.add(k.build('arm-base')); }
    { const k = new Kit();
      k.cyl(0.36, 0.36, 0.5, paint, { p: [0, 0.15, 0.3] }, 18);
      k.box(0.5, 0.36, 0.46, paint, { p: [0, 0.36, 0.3] });
      k.cyl(0.13, 0.13, 0.32, dark, { p: [0.33, 0.16, 0.22] }, 12);       // slew motor
      k.cyl(0.07, 0.07, 0.36, steel, { p: [0.33, 0.36, 0.22] }, 8);
      for (const s of [-1, 1]) k.box(0.08, 0.5, 0.42, paint, { p: [s * 0.22, 0.48, this.sz] });   // shoulder clevis cheeks
      k.box(0.46, 0.06, 0.16, hazard, { p: [0, 0.2, 0.56] });
      this.turret.add(k.build('turret')); }
    this.shoulder.position.set(0, this.sy, this.sz); this.turret.add(this.shoulder);
    const L1 = d.l1, L2 = d.l2;
    if (kind === 'cannon') { this.buildCannon(paint, dark, steel, chrome); return; }
    // upper arm: a box boom with lightening holes and a cable run
    { const k = new Kit();
      k.cyl(0.18, 0.18, 0.5, dark, { r: [0, 0, Math.PI / 2] }, 14);
      k.box(0.3, 0.34, L1 - 0.2, paint, { p: [0, 0, L1 / 2] });
      k.box(0.32, 0.06, L1 - 0.6, dark, { p: [0, 0.2, L1 / 2] });
      for (let i = 0; i < 3; i++) k.cyl(0.07, 0.07, 0.34, dark, { p: [0, -0.02, 0.5 + (i * (L1 - 1)) / 2], r: [0, 0, Math.PI / 2] }, 10);
      k.pipe([[0.17, 0.12, 0.1], [0.2, 0.18, L1 * 0.5], [0.17, 0.12, L1 - 0.1]], 0.03, rubber, 10, 5);
      this.shoulder.add(k.build('upper')); }
    this.elbow.position.set(0, 0, L1); this.shoulder.add(this.elbow);
    { const k = new Kit();
      k.cyl(0.16, 0.16, 0.42, dark, { r: [0, 0, Math.PI / 2] }, 14);
      k.box(0.24, 0.26, L2 - 0.25, paint, { p: [0, 0, L2 / 2] });
      k.box(0.26, 0.05, L2 - 0.5, hazard, { p: [0, 0.14, L2 / 2] });
      k.pipe([[-0.14, 0.08, 0.05], [-0.16, 0.12, L2 * 0.5], [-0.12, 0.05, L2 - 0.1]], 0.025, rubber, 10, 5);
      this.elbow.add(k.build('fore')); }
    this.wrist.position.set(0, 0, L2); this.elbow.add(this.wrist);
    { const k = new Kit(); k.sph(0.15, dark, {}, 12, 8); k.cyl(0.13, 0.13, 0.2, steel, { p: [0, 0, 0.12], r: [Math.PI / 2, 0, 0] }, 12); this.wrist.add(k.build('wrist')); }
    this.head.position.set(0, 0, 0.22); this.wrist.add(this.head);
    this.buildHead(paint, dark, steel, chrome);
    // the rams: shoulder (turret -> upper boom) and elbow (upper boom -> forearm)
    this.rams.push(new Ram(this.root, this.turret, new THREE.Vector3(0, 0.12, 0.62), this.shoulder, new THREE.Vector3(0, -0.2, L1 * 0.42), 0.075, paint, chrome));
    this.rams.push(new Ram(this.root, this.shoulder, new THREE.Vector3(0, 0.26, L1 * 0.55), this.elbow, new THREE.Vector3(0, 0.2, 0.45), 0.06, paint, chrome));
  }
  private mats!: { paint: THREE.Material; dark: THREE.Material; steel: THREE.Material; chrome: THREE.Material };
  private buildHead(paint: THREE.Material, dark: THREE.Material, steel: THREE.Material, chrome: THREE.Material) {
    const H = this.head, k = new Kit();
    if (this.kind === 'manipulator') {
      k.cyl(0.2, 0.16, 0.24, paint, { p: [0, 0, 0.12], r: [Math.PI / 2, 0, 0] }, 12);
      k.box(0.08, 0.08, 0.04, glow(0x7fd48a, 2), { p: [0.1, 0.12, 0.16] });
      H.add(k.build('claw-palm'));
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Group(); f.position.set(Math.sin((i / 3) * TAU) * 0.13, Math.cos((i / 3) * TAU) * 0.13, 0.24); f.rotation.z = -(i / 3) * TAU; H.add(f);
        const fk = new Kit(); fk.box(0.07, 0.06, 0.26, steel, { p: [0, 0, 0.13] }); fk.box(0.06, 0.05, 0.2, dark, { p: [0, -0.04, 0.32], r: [0.5, 0, 0] }); fk.box(0.07, 0.03, 0.06, std(0x1d1f21, { rough: 0.9 }), { p: [0, -0.08, 0.4], r: [0.5, 0, 0] });
        f.add(fk.build('finger')); this.fingers.push(f);
      }
    } else if (this.kind === 'grabber') {
      k.cyl(0.24, 0.2, 0.3, paint, { p: [0, 0, 0.15], r: [Math.PI / 2, 0, 0] }, 14);
      k.tor(0.3, 0.07, dark, { p: [0, 0, 0.36] }, 8, 24);
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.4; k.box(0.06, 0.06, 0.38, steel, { p: [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.52] }); }
      k.sph(0.12, glow(0xa080ff, 2.4), { p: [0, 0, 0.36] }, 10, 8);
      H.add(k.build('grab-head'));
    } else if (this.kind === 'drill') {
      k.cyl(0.26, 0.24, 0.5, paint, { p: [0, 0, 0.2], r: [Math.PI / 2, 0, 0] }, 16);
      for (let i = 0; i < 6; i++) k.box(0.04, 0.5, 0.06, dark, { p: [Math.cos(i) * 0.26, Math.sin(i) * 0.26, 0.2], r: [Math.PI / 2, 0, -i] });
      H.add(k.build('drill-motor'));
      const bk = new Kit();
      bk.cone(0.2, 0.9, steel, { p: [0, 0, 0.9], r: [Math.PI / 2, 0, 0] }, 12);
      for (let i = 0; i < 9; i++) bk.tor(0.18 - i * 0.018, 0.022, chrome, { p: [0, 0, 0.5 + i * 0.09], r: [0, 0, i * 0.7] }, 4, 10, Math.PI * 1.3);
      this.bit = new THREE.Group(); this.bit.add(bk.build('bit')); H.add(this.bit);
    } else if (this.kind === 'welder') {
      k.box(0.24, 0.24, 0.34, paint, { p: [0, 0, 0.17] });
      k.cyl(0.07, 0.04, 0.5, chrome, { p: [0, -0.02, 0.55], r: [Math.PI / 2, 0, 0] }, 10);
      k.cyl(0.035, 0.035, 0.1, std(0x6a4a2a, { rough: 0.5, metal: 0.8 }), { p: [0, -0.02, 0.84], r: [Math.PI / 2, 0, 0] }, 8);
      k.cyl(0.09, 0.09, 0.42, std(0x2b5884, { rough: 0.4 }), { p: [0.2, 0.06, 0.1], r: [Math.PI / 2, 0, 0] }, 10);
      k.pipe([[0.2, 0.06, 0.32], [0.12, 0.0, 0.45], [0.02, -0.02, 0.4]], 0.018, std(0x1d1f21, { rough: 0.9 }), 8, 4);
      H.add(k.build('weld-head'));
    } else if (this.kind === 'gravity') {
      k.cyl(0.24, 0.2, 0.26, paint, { p: [0, 0, 0.13], r: [Math.PI / 2, 0, 0] }, 14);
      k.lathe([[0.1, 0], [0.42, 0.12], [0.5, 0.2], [0.46, 0.24], [0.1, 0.12]], dark, { p: [0, 0, 0.28], r: [Math.PI / 2, 0, 0] }, 24);
      for (let i = 0; i < 3; i++) k.tor(0.2 + i * 0.1, 0.025, std(0xb08a3a, { rough: 0.35, metal: 0.8 }), { p: [0, 0, 0.36 + i * 0.03] }, 5, 20);
      k.sph(0.12, glow(0x9a8aff, 2.6), { p: [0, 0, 0.42] }, 10, 8);
      H.add(k.build('proj-head'));
    }
  }
  private barrel: THREE.Group | null = null;
  private recoil = 0;
  private buildCannon(paint: THREE.Material, dark: THREE.Material, steel: THREE.Material, chrome: THREE.Material) {
    // the shoulder is the trunnion; the barrel group pitches on it
    const k = new Kit();
    k.box(0.9, 0.6, 1.0, paint, { p: [0, 0.05, 0.2] });
    k.box(0.96, 0.12, 0.7, dark, { p: [0, 0.4, 0.15] });
    k.cyl(0.36, 0.36, 0.5, dark, { p: [-0.62, 0.05, 0.1], r: [0, 0, Math.PI / 2] }, 14); // capacitor drum
    for (let i = 0; i < 5; i++) k.tor(0.36, 0.02, steel, { p: [-0.45 - i * 0.08, 0.05, 0.1], r: [0, Math.PI / 2, 0] }, 4, 16);
    this.shoulder.add(k.build('mantlet'));
    const b = new THREE.Group(); this.shoulder.add(b); this.barrel = b;
    const bk = new Kit();
    bk.cyl(0.17, 0.2, 3.2, dark, { p: [0, 0.05, 2.1], r: [Math.PI / 2, 0, 0] }, 14);
    for (let i = 0; i < 10; i++) bk.tor(0.21, 0.03, i % 3 ? steel : chrome, { p: [0, 0.05, 0.8 + i * 0.22] }, 5, 16);
    bk.box(0.5, 0.36, 0.5, dark, { p: [0, 0.05, 3.8] });
    for (const s of [-1, 1]) bk.box(0.06, 0.3, 0.42, steel, { p: [s * 0.28, 0.05, 3.8] });
    bk.box(0.05, 0.05, 2.6, std(0x1d1f21, { rough: 0.9 }), { p: [0.24, 0.24, 1.6] });
    bk.box(0.12, 0.16, 0.3, paint, { p: [0, 0.34, 1.0] });
    b.add(bk.build('barrel'));
    this.wrist.position.set(0, 0.05, 4.05); b.add(this.wrist); // the muzzle
  }

  // ------------------------------------------------------------------ the tip
  /** the tool's working point, world */
  tip(out = new THREE.Vector3()) {
    if (this.kind === 'cannon') return this.wrist.getWorldPosition(out);
    const off = this.kind === 'drill' ? 1.35 : this.kind === 'welder' ? 0.95 : this.kind === 'manipulator' ? 0.62 : 0.6;
    return this.head.localToWorld(out.set(0, 0, off));
  }
  /** the shoulder pivot, world */
  pivot(out = new THREE.Vector3()) { return this.shoulder.getWorldPosition(out); }
  /** can the tip be put at world point p (on the ground, + lift) */
  inReach(x: number, z: number) {
    const pod = this.colony.pod, d = Math.hypot(x - pod.x, z - pod.z);
    if (d > this.reach) return false;
    // the arm swings over its own side of the pod
    const a = Math.atan2(x - pod.x, z - pod.z) - (this.hpt.angle + pod.yaw);
    const da = Math.atan2(Math.sin(a), Math.cos(a));
    return this.kind === 'cannon' || this.kind === 'gravity' ? Math.abs(da) < 2.2 : Math.abs(da) < 1.7 && d > 2.6;
  }
  /** the nearest point to (x, z) the tip can reach */
  clampReach(p: THREE.Vector3) {
    const pod = this.colony.pod; let dx = p.x - pod.x, dz = p.z - pod.z; let d = Math.hypot(dx, dz) || 1;
    let a = Math.atan2(dx, dz) - (this.hpt.angle + pod.yaw); a = Math.atan2(Math.sin(a), Math.cos(a));
    const lim = this.kind === 'cannon' || this.kind === 'gravity' ? 2.2 : 1.7;
    if (Math.abs(a) > lim) { const na = this.hpt.angle + pod.yaw + Math.sign(a) * lim; dx = Math.sin(na) * d; dz = Math.cos(na) * d; }
    const r = clamp(d, 3.0, this.reach); d = Math.hypot(dx, dz) || 1;
    p.x = pod.x + (dx / d) * r; p.z = pod.z + (dz / d) * r;
    return p;
  }

  // ------------------------------------------------------------------ servo update
  update(dt: number, simDt: number) {
    this.t += dt;
    this.root.updateWorldMatrix(true, false);
    const L1 = this.def.l1, L2 = this.def.l2;
    let yawG = 0, a1G = 1.25, a2G = -2.45, awG = 0.9;
    if (this.target) {
      const T = this.root.worldToLocal(_v.copy(this.target));
      yawG = clamp(Math.atan2(T.x, T.z), -1.75, 1.75);
      const dH = Math.hypot(T.x, T.z) - this.sz, dY = T.y - this.sy;
      if (this.kind === 'cannon') { a1G = Math.atan2(dY, Math.max(0.5, dH)); a2G = 0; awG = 0; }
      else {
        let D = Math.hypot(dH, dY); const k = 1 + (this.level - 1) * 0.08, l1 = L1 * k, l2 = L2 * k;
        D = clamp(D, Math.abs(l1 - l2) + 0.1, l1 + l2 - 0.02);
        const phi = Math.atan2(dY, dH);
        const cS = clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1), cE = clamp((l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2), -1, 1);
        a1G = phi + Math.acos(cS); a2G = -(Math.PI - Math.acos(cE));
        // the tool points down at its work (the projector and the grabber look along the boom at their target)
        const toolAng = this.kind === 'gravity' || this.kind === 'grabber' ? phi - 0.2 : -Math.PI / 2 + 0.15;
        awG = toolAng - (a1G + a2G);
        if (this.kind === 'manipulator' || this.kind === 'welder') awG = clamp(awG, -1.6, 1.6);
      }
    } else {
      // parked: folded up against the hull, swaying a hair
      yawG = Math.sin(this.t * 0.3 + this.hpt.i) * 0.04; a1G = 1.25 + Math.sin(this.t * 0.5) * 0.02; a2G = -2.5; awG = 0.7;
      if (this.kind === 'cannon') { a1G = 0.08; a2G = 0; awG = 0; }
    }
    const sp = this.controlled ? 7 : 3.4;
    this.yaw = damp(this.yaw, yawG, sp, dt); this.a1 = damp(this.a1, a1G, sp, dt); this.a2 = damp(this.a2, a2G, sp * 1.2, dt); this.aw = damp(this.aw, awG, sp * 1.6, dt);
    this.turret.rotation.y = this.yaw;
    if (this.kind === 'cannon') {
      this.shoulder.rotation.x = -this.a1;
      this.recoil = damp(this.recoil, 0, 6, dt);
      if (this.barrel) this.barrel.position.z = -this.recoil * 0.5;
    } else {
      this.shoulder.rotation.x = -this.a1; this.elbow.rotation.x = -this.a2; this.wrist.rotation.x = -this.aw;
    }
    // claws: open when reaching, close when holding / sampling
    const gripG = this.holding ? 1 : this.working ? 0.8 : this.target ? 0.1 : 0.6;
    this.grip = damp(this.grip, gripG, 6, dt);
    for (const f of this.fingers) f.rotation.x = -0.6 + this.grip * 0.9;
    if (this.bit) this.bit.rotation.z += dt * (this.working ? 28 : 0.5);
    if (this.working && this.kind === 'drill') { this.head.position.x = (Math.random() - 0.5) * 0.02; this.head.position.y = (Math.random() - 0.5) * 0.02; }
    else this.head.position.x = this.head.position.y = 0;
    for (const r of this.rams) r.update();
    this.heat = Math.max(0, this.heat - simDt * 0.25);
    // servo whine when moving fast
    this.sfxT -= dt;
    if (this.controlled && this.sfxT <= 0 && Math.abs(yawG - this.yaw) + Math.abs(a1G - this.a1) > 0.25) { this.sfxT = 0.22; sfx('tendril', 2.2, 0.06); }
  }
  /** cannon: the barrel kicks back */
  kick() { this.recoil = 1; }
  /** muzzle direction (world) */
  muzzleDir(out = new THREE.Vector3()) { const q = (this.barrel ?? this.wrist).getWorldQuaternion(new THREE.Quaternion()); return out.set(0, 0, 1).applyQuaternion(q).normalize(); }
  damage(n: number) {
    this.hp = Math.max(0, this.hp - n);
    if (this.hp <= 0) this.colony.alert(`${this.name} knocked out`, 'bad', this.tip());
  }
  repair(n: number) { this.hp = Math.min(this.maxHp, this.hp + n); }
  /** sparks at the tip */
  sparks(n = 4, ramp = 'glowAmber') { const p = this.tip(_v2); vfx2d.play('spark', p.x, p.y, p.z, { scale: 0.3, ramp: ramp as never, emit: n, speed: 2.4, vel: [0, 1.5, 0], grav: 6 }); }
  float(text: string, kind: 'info' | 'good' | 'warn' = 'info') { const p = this.tip(_v2); floatText(this.colony.g, p.x, p.y + 0.6, p.z, text, kind as never, { life: 1.6 }); }
  dispose() { this.root.removeFromParent(); this.hpt.cap.visible = true; }
}
export const ARM_KINDS: ArmKind[] = ['manipulator', 'grabber', 'drill', 'welder', 'cannon', 'gravity'];
void _m;
