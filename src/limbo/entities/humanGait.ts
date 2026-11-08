import * as THREE from 'three';
import { solveTwoBone, newTwoBoneOut, endEuler, eulerMat, wrapPi, V3a } from './humanIK';
import type { Pose, JointName } from './humanRig';

/**
 * World-planted feet for survivors.
 *
 * Each foot is either planted (a fixed point on the ground, in world space)
 * or swinging along an arc to a landing spot predicted from the body's
 * velocity and turn rate. While moving, a phase clock decides when each foot
 * lifts (stance fraction and stride length follow ground speed, so a planted
 * foot moves backwards under the body at exactly the ground speed: no foot
 * sliding). Standing still, a foot steps whenever the body has drifted or
 * turned too far from it (turning on the spot, settling after a stop,
 * balance steps when the pelvis is shoved). Heel strike, foot-flat and
 * heel-off / toe-off roll the ankle over heel and ball pivots. Then a
 * two-bone IK solve places hip, knee and ankle, and the pelvis drops
 * just enough for both legs to reach (stairs, ledges, long strides).
 *
 * The "track" frame is world space plus a drift used when a rig is told to
 * walk without actually moving (previews, walking into a wall).
 */

export interface LegDims {
  s: number;
  /** thigh / shin length */
  L1: number; L2: number;
  /** thigh joint offset from the hips bone (left side; right mirrors x) */
  hipX: number; hipDY: number;
  /** hips bone height above the ground at rest (shoes included) */
  hipY: number;
  /** ankle height above the ground with the foot flat */
  ankleH: number;
  /** heel and ball pivots, behind / ahead of the ankle */
  heel: number; ball: number;
  /** spine / chest / shoulder offsets for the arm chain */
  spineY: number; chestY: number; shX: number; shY: number; shZ: number;
  /** upper arm / forearm length */
  A1: number; A2: number;
}

export function legDimsFrom(d: { s: number; hipY: number; off: Record<string, [number, number, number]> }, sole: number): LegDims {
  const s = d.s, o = d.off;
  return {
    s, L1: -o.shinL[1], L2: -o.footL[1], hipX: o.thighL[0], hipDY: o.thighL[1], hipY: d.hipY + sole,
    ankleH: d.hipY + sole + o.thighL[1] + o.shinL[1] + o.footL[1], heel: 0.062 * s, ball: 0.13 * s,
    spineY: o.spine[1], chestY: o.chest[1], shX: o.uarmL[0], shY: o.uarmL[1], shZ: o.uarmL[2],
    A1: -o.farmL[1], A2: -o.handL[1],
  };
}

export interface GaitFrame {
  dt: number;
  /** world placement of the rig root (world mode) */
  world: boolean; wx: number; wy: number; wz: number;
  /** root yaw (three.js rotation.y) */
  yaw: number;
  /** requested locomotion speed (used when the body does not actually move) */
  speed: number;
  /** move direction relative to facing, used without world motion */
  moveYaw: number;
  ground?: (x: number, z: number) => number;
  run: number; sneak: number; limp: number; limpR: boolean; drunk: number; tired: number;
  /** idle stance per foot (root space): x, z, yaw for L then R */
  stance: Float32Array;
  /** pelvis shift in root space: feet step to stay under it */
  hipX: number; hipZ: number;
  /** false: feet are not on the ground (lying, sitting...) — keep them re-planted under the body */
  active: boolean;
  /** how jittery idle stepping is (panic / drunk shuffles) */
  restless: number;
}

const FOOT_LIFT_IDLE = 0.055;

class Foot {
  px = 0; pz = 0; py = 0; pyaw = 0;
  sw = false; tau = 0; dur = 0.3; lift = 0.08; idle = false;
  fx = 0; fz = 0; fy = 0; fyaw = 0; froll = 0;
  tx = 0; tz = 0; ty = 0; tyaw = 0;
  roll = 0; landRoll = -0.2;
  /** output: ankle (root space), yaw (root space), pitch (toe down +) */
  ax = 0; ay = 0; az = 0; yawR = 0; pitch = 0;
  constructor(public k: 1 | -1) {}
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerpA = (a: number, b: number, t: number) => a + wrapPi(b - a) * t;

export class Gait {
  feet: [Foot, Foot] = [new Foot(1), new Foot(-1)];
  /** cycle position of the left foot (cycles; the right is half a cycle later) */
  cyc = 0;
  moving = false;
  /** ground speed (m/s) and its direction in world */
  v = 0; dirX = 0; dirZ = 1;
  /** smoothed track velocity */
  vx = 0; vz = 0;
  turn = 0;
  /** stride length (one full cycle, two steps) and stance fraction */
  S = 1.4; beta = 0.6;
  /** time-warped leg phase for the upper body (radians; sin > 0 = left leg forward) */
  armPh = 0;
  /** landings so far (footstep events) and which foot */
  steps = 0; lastFoot = 0;
  /** running: 0..1 compression of the stance leg, flight 0..1 */
  compress = 0; flight = 0;
  /** forward acceleration (m/s²), smoothed */
  acc = 0;
  /** pelvis drop applied by the reach constraint */
  drop = 0;
  private init = false;
  private lx = 0; private lz = 0; private lyaw = 0;
  private driftX = 0; private driftZ = 0;
  /** root position in the track frame (world + drift) */
  trkX = 0; trkZ = 0;
  private yaw = 0; private rootY = 0;
  private stepCool = 0;
  private lastV = 0;
  private restT = 0;

  /** forget where the feet were (teleports, getting up) */
  reset() { this.init = false; }

  update(f: GaitFrame, D: LegDims) {
    const dt = Math.min(0.1, Math.max(0, f.dt));
    const s = D.s;
    // ---------------- track frame and ground velocity
    let mvx = 0, mvz = 0;
    if (f.world && this.init) {
      const dx = f.wx - this.lx, dz = f.wz - this.lz;
      if (dx * dx + dz * dz > 2.25) { this.init = false; }
      else if (dt > 0) { mvx = dx / dt; mvz = dz / dt; }
    }
    this.lx = f.wx; this.lz = f.wz;
    const meas = Math.hypot(mvx, mvz);
    const tread = !f.world || (f.speed > 0.3 && meas < f.speed * 0.35);
    if (tread && f.speed > 0.05) {
      const a = f.yaw + f.moveYaw;
      mvx = Math.sin(a) * f.speed; mvz = Math.cos(a) * f.speed;
      this.driftX += mvx * dt; this.driftZ += mvz * dt;
    }
    this.trkX = (f.world ? f.wx : 0) + this.driftX;
    this.trkZ = (f.world ? f.wz : 0) + this.driftZ;
    this.rootY = f.world ? f.wy : 0;
    this.yaw = f.yaw;
    const kv = 1 - Math.exp(-16 * dt);
    this.vx += (mvx - this.vx) * kv; this.vz += (mvz - this.vz) * kv;
    const v = Math.hypot(this.vx, this.vz);
    this.v = v;
    if (v > 0.05) { this.dirX = this.vx / v; this.dirZ = this.vz / v; }
    else { this.dirX = Math.sin(f.yaw); this.dirZ = Math.cos(f.yaw); }
    const tr = dt > 0 && this.init ? wrapPi(f.yaw - this.lyaw) / dt : 0;
    this.lyaw = f.yaw;
    this.turn += (tr - this.turn) * (1 - Math.exp(-10 * dt));
    if (dt > 0) this.acc += ((v - this.lastV) / dt - this.acc) * (1 - Math.exp(-8 * dt));
    this.lastV = v;

    // ---------------- gait shape from speed
    const run = f.run, sn = f.sneak;
    // stride shortens when moving sideways or backwards (side-steps instead of crossing the legs)
    const fwd = Math.sin(f.yaw) * this.dirX + Math.cos(f.yaw) * this.dirZ;
    const side = 0.55 + 0.45 * Math.abs(fwd);
    const Sw = Math.min(1.6, 0.5 + 0.42 * v) * s, Sr = (0.95 + 0.38 * v) * s;
    this.S = Math.max(0.35, (Sw + (Sr - Sw) * run) * (1 - 0.14 * sn) * (1 - 0.28 * f.limp) * side * (1 - f.tired * 0.12));
    this.beta = (0.6 + 0.06 * sn) * (1 - run) + 0.32 * run;
    const beta = this.beta;
    if (!this.init) this.plantAll(f, D);
    if (!f.active) { this.plantAll(f, D); this.moving = false; this.output(f, D); return; }

    const wasMoving = this.moving;
    this.moving = this.moving ? v > 0.12 : v > 0.25;
    if (this.moving && !wasMoving) this.startWalk(f, D);

    // ---------------- feet
    this.stepCool -= dt;
    let dcyc = 0;
    if (this.moving) {
      dcyc = (v / this.S) * dt;
      if (f.limp > 0.05) {
        const inj = this.feet[f.limpR ? 1 : 0];
        dcyc *= !inj.sw ? 1 + f.limp * 0.55 : 1 - f.limp * 0.3;
      }
      const c0 = this.cyc;
      this.cyc += dcyc;
      for (let i = 0; i < 2; i++) {
        const ft = this.feet[i];
        const u0 = ((c0 + i * 0.5) % 1 + 1) % 1, u1 = u0 + dcyc;
        if (!ft.sw && ((u0 < beta && u1 >= beta) || (u0 < beta + 1 && u1 >= beta + 1))) this.lift(ft, f, D, false);
        // stretched too far behind (a shove, a sudden sprint): pick it up now
        if (!ft.sw && !this.feet[1 - i].sw && this.reachOver(ft, D) > 0.04 * s && this.stepCool <= 0) this.lift(ft, f, D, true);
      }
    } else {
      // standing: step a foot that has drifted or turned too far from where it should be
      this.restT -= dt;
      if (!this.feet[0].sw && !this.feet[1].sw && this.stepCool <= 0) {
        let best = -1, bestE = 0;
        for (let i = 0; i < 2; i++) {
          const ft = this.feet[i];
          this.idleTarget(ft, f, i);
          const e = Math.hypot(ft.tx - ft.px, ft.tz - ft.pz) / s + Math.abs(wrapPi(ft.tyaw - ft.pyaw)) * 0.2;
          const lim = 0.115 - f.restless * 0.04;
          if ((e > lim || Math.abs(wrapPi(ft.tyaw - ft.pyaw)) > 0.6) && e > bestE) { bestE = e; best = i; }
        }
        // a restless body shuffles now and then
        if (best < 0 && f.restless > 0.3 && this.restT <= 0) { this.restT = 0.6 + Math.random() * 1.6 / f.restless; best = Math.random() < 0.5 ? 0 : 1; bestE = 0.05; }
        if (best >= 0) { this.lift(this.feet[best], f, D, true); this.feet[best].dur = Math.min(0.4, Math.max(0.2, 0.2 + bestE * 0.6)); }
      }
    }
    for (let i = 0; i < 2; i++) {
      const ft = this.feet[i];
      if (!ft.sw) continue;
      if (this.moving && !ft.idle) ft.tau += dcyc / Math.max(0.05, 1 - beta);
      else ft.tau += dt / Math.max(0.12, ft.dur);
      if (this.moving && !ft.idle) this.walkTarget(ft, f, i, D);
      else this.idleTarget(ft, f, i);
      ft.ty = this.groundAt(f, ft.tx, ft.tz);
      if (ft.tau >= 1) this.land(ft, i);
    }
    // ---------------- stance roll
    for (let i = 0; i < 2; i++) {
      const ft = this.feet[i];
      if (ft.sw) continue;
      if (this.moving) {
        const u = ((this.cyc + i * 0.5) % 1 + 1) % 1;
        const st = Math.min(1, u / beta);
        let r: number;
        if (run > 0.5) r = st < 0.2 ? ft.landRoll * (1 - smooth(st / 0.2)) : st > 0.4 ? 0.75 * Math.pow((st - 0.4) / 0.6, 1.6) : 0;
        else r = st < 0.16 ? ft.landRoll * (1 - smooth(st / 0.16)) : st > 0.55 ? 0.6 * Math.pow((st - 0.55) / 0.45, 1.8) : 0;
        ft.roll = r;
      } else ft.roll *= Math.exp(-12 * dt);
    }
    // time-warped phase for the arms and pelvis: stance spans half the cycle
    const L = this.feet[0];
    const uL = ((this.cyc % 1) + 1) % 1;
    const uw = L.sw && !L.idle ? 0.5 + 0.5 * Math.min(1, L.tau) : Math.min(1, uL / beta) * 0.5;
    if (this.moving) this.armPh = uw * Math.PI * 2 + Math.PI / 2;
    // running: stance compression and flight
    let comp = 0;
    for (let i = 0; i < 2; i++) { const ft = this.feet[i]; if (!ft.sw && this.moving) { const u = ((this.cyc + i * 0.5) % 1 + 1) % 1; comp = Math.max(comp, Math.sin(Math.PI * Math.min(1, u / beta))); } }
    this.compress = comp;
    this.flight = this.moving && this.feet[0].sw && this.feet[1].sw ? 1 : 0;
    this.output(f, D);
  }

  private groundAt(f: GaitFrame, x: number, z: number) {
    if (!f.world || !f.ground) return this.rootY;
    const g = f.ground(x - this.driftX, z - this.driftZ);
    // never trust a ground more than a storey away (void tiles, bad data)
    return Math.abs(g - this.rootY) > 1.2 ? this.rootY : g;
  }

  private plantAll(f: GaitFrame, D: LegDims) {
    this.init = true;
    for (let i = 0; i < 2; i++) {
      const ft = this.feet[i];
      this.idleTarget(ft, f, i);
      ft.px = ft.tx; ft.pz = ft.tz; ft.pyaw = ft.tyaw; ft.py = this.groundAt(f, ft.tx, ft.tz);
      ft.sw = false; ft.tau = 0; ft.roll = 0;
    }
    void D;
  }

  private idleTarget(ft: Foot, f: GaitFrame, i: number) {
    const st = f.stance, o = i * 3;
    const x = st[o] + f.hipX, z = st[o + 1] + f.hipZ;
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    ft.tx = this.trkX + c * x + sn * z;
    ft.tz = this.trkZ - sn * x + c * z;
    ft.tyaw = this.yaw + st[o + 2];
  }

  private walkTarget(ft: Foot, f: GaitFrame, i: number, D: LegDims) {
    const tRem = Math.max(0, 1 - ft.tau) * ft.dur;
    const px = this.trkX + this.vx * tRem, pz = this.trkZ + this.vz * tRem;
    const pyaw = this.yaw + this.turn * tRem * 0.8;
    const lead = (0.47 - 0.11 * f.run) * this.beta * this.S;
    const s = D.s;
    // feet land close to the midline at speed, wider when sneaking; a drunk weaves
    const w = ((0.085 - 0.035 * f.run + 0.03 * f.sneak) * s + f.drunk * 0.05 * Math.sin(this.cyc * 2.3 + i)) * ft.k;
    const c = Math.cos(pyaw), sn = Math.sin(pyaw);
    ft.tx = px + c * w + this.dirX * lead;
    ft.tz = pz - sn * w + this.dirZ * lead;
    ft.tyaw = pyaw + ft.k * 0.07;
    void i;
  }

  /** how far (beyond comfortable reach) a planted foot trails the hip */
  private reachOver(ft: Foot, D: LegDims): number {
    const dx = ft.px - this.trkX, dz = ft.pz - this.trkZ;
    const h = Math.hypot(dx, dz);
    return h - (D.L1 + D.L2) * 0.78;
  }

  private lift(ft: Foot, f: GaitFrame, D: LegDims, idle: boolean) {
    ft.sw = true; ft.tau = 0; ft.idle = idle || !this.moving;
    ft.fx = ft.px; ft.fz = ft.pz; ft.fy = ft.py; ft.fyaw = ft.pyaw; ft.froll = ft.roll;
    if (ft.idle) { ft.dur = 0.26; ft.lift = FOOT_LIFT_IDLE * D.s; ft.landRoll = -0.08; }
    else {
      ft.dur = (1 - this.beta) * this.S / Math.max(0.3, this.v);
      ft.lift = ((0.075 + 0.3 * f.run) * (1 - 0.35 * f.sneak) * (1 - 0.45 * f.tired)) * D.s;
      ft.landRoll = f.run > 0.5 ? 0.06 : -0.24 * (1 - 0.5 * f.sneak);
    }
    this.stepCool = 0.06;
  }

  private land(ft: Foot, i: number) {
    ft.sw = false; ft.tau = 1;
    ft.px = ft.tx; ft.pz = ft.tz; ft.py = ft.ty; ft.pyaw = ft.tyaw;
    ft.roll = ft.landRoll;
    this.steps++; this.lastFoot = i;
    this.stepCool = 0.05;
  }

  private startWalk(f: GaitFrame, D: LegDims) {
    // the trailing foot (relative to the way we are going) steps off first
    let trail = 0, best = Infinity;
    for (let i = 0; i < 2; i++) {
      const ft = this.feet[i];
      if (ft.sw) { trail = i; best = -Infinity; continue; }
      const a = (ft.px - this.trkX) * this.dirX + (ft.pz - this.trkZ) * this.dirZ;
      if (a < best) { best = a; trail = i; }
    }
    this.cyc = this.beta - trail * 0.5;
    const ft = this.feet[trail];
    if (!ft.sw) this.lift(ft, f, D, false);
    else { ft.idle = false; ft.dur = (1 - this.beta) * this.S / Math.max(0.3, this.v); }
  }

  /** root-space ankle position / yaw / pitch per foot */
  private output(f: GaitFrame, D: LegDims) {
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    for (let i = 0; i < 2; i++) {
      const ft = this.feet[i];
      let x: number, z: number, y: number, yaw: number, roll: number;
      if (ft.sw) {
        const t = Math.min(1, ft.tau);
        // the foot peels up behind first, then swings through low and reaches for the ground
        const hz = smooth(ft.idle ? t : Math.pow(t, 1.25 + 0.5 * f.run));
        x = ft.fx + (ft.tx - ft.fx) * hz; z = ft.fz + (ft.tz - ft.fz) * hz;
        const climb = Math.max(0, ft.ty - ft.fy);
        const arc = Math.sin(Math.PI * Math.pow(t, ft.idle ? 1 : 0.72 - 0.22 * f.run));
        y = ft.fy + (ft.ty - ft.fy) * smooth(t * 1.15) + (ft.lift + climb * 0.8) * arc;
        yaw = lerpA(ft.fyaw, ft.tyaw, hz);
        roll = ft.froll + (ft.landRoll - ft.froll) * smooth(t);
        if (!ft.idle) roll += 0.18 * arc * (1 - f.run * 0.5) - 0.12 * f.run * arc;
      } else { x = ft.px; z = ft.pz; y = ft.py; yaw = ft.pyaw; roll = ft.roll; }
      // ankle over the heel / ball pivot
      let ay = D.ankleH, az = 0;
      if (!ft.sw && roll < 0) { const r = -roll; ay = D.ankleH * Math.cos(r) + D.heel * Math.sin(r); az = -D.heel + D.heel * Math.cos(r) - D.ankleH * Math.sin(r); }
      else if (!ft.sw && roll > 0) { ay = D.ankleH * Math.cos(roll) + D.ball * Math.sin(roll); az = D.ball - D.ball * Math.cos(roll) + D.ankleH * Math.sin(roll); }
      const fs = Math.sin(yaw), fc = Math.cos(yaw);
      x += fs * az; z += fc * az;
      // into root space
      const dx = x - this.trkX, dz = z - this.trkZ;
      ft.ax = c * dx - sn * dz;
      ft.az = sn * dx + c * dz;
      ft.ay = y + ay - this.rootY;
      ft.yawR = wrapPi(yaw - this.yaw);
      ft.pitch = roll;
    }
  }
}

// ------------------------------------------------------------------ IK application
const RB = new THREE.Matrix4(), RH = new THREE.Matrix4(), RT = new THREE.Matrix4(), RS = new THREE.Matrix4(), RC = new THREE.Matrix4();
const HP = new THREE.Vector3(), J = new THREE.Vector3(), A = new THREE.Vector3(), POLE = new THREE.Vector3(), V = new THREE.Vector3();
const SP = new THREE.Vector3(), CP = new THREE.Vector3();
const TB = newTwoBoneOut();
const E1: V3a = [0, 0, 0], E2: V3a = [0, 0, 0], E3: V3a = [0, 0, 0];
const ZERO: V3a = [0, 0, 0];

const jv = (p: Pose, j: JointName): V3a => (p[j] as V3a | undefined) ?? ZERO;
function put(p: Pose, j: JointName, e: V3a, w: number) {
  let v = p[j] as V3a | undefined;
  if (!v) { v = [0, 0, 0]; p[j] = v; }
  if (w >= 0.999) { v[0] = e[0]; v[1] = e[1]; v[2] = e[2]; return; }
  v[0] += (e[0] - v[0]) * w; v[1] += (wrapPi(e[1] - v[1])) * w; v[2] += (wrapPi(e[2] - v[2])) * w;
}

/** body + hips transform of a pose (root space) into RB / RH / HP */
function hipsFrame(p: Pose, D: LegDims) {
  eulerMat(RB, p.bodyPitch ?? 0, p.bodyYaw ?? 0, p.bodyRoll ?? 0);
  HP.set(p.rootX ?? 0, D.hipY + (p.rootY ?? 0), p.rootZ ?? 0).applyMatrix4(RB);
  HP.y += p.bodyY ?? 0;
  const h = jv(p, 'hips');
  eulerMat(RT, h[0], h[1], h[2]);
  RH.multiplyMatrices(RB, RT);
}

export interface LegIKOpts { wL: number; wR: number; stiffL: boolean; stiffR: boolean; dt: number; maxDrop: number }

/**
 * Pose the legs onto the gait's planted / swinging feet (blended by wL / wR),
 * lowering the pelvis when a foot would otherwise be out of reach.
 */
export function legIK(p: Pose, g: Gait, D: LegDims, o: LegIKOpts) {
  if (o.wL <= 0.001 && o.wR <= 0.001) { g.drop *= Math.exp(-8 * o.dt); return; }
  hipsFrame(p, D);
  // pelvis drop so both feet can reach (only legs that are actually standing count fully)
  const reach = (D.L1 + D.L2) * 0.985;
  let need = 0;
  for (let i = 0; i < 2; i++) {
    const w = i ? o.wR : o.wL;
    if (w < 0.05) continue;
    const ft = g.feet[i];
    V.set(ft.k * D.hipX, D.hipDY, 0).applyMatrix4(RH).add(HP);
    const hx = ft.ax - V.x, hz = ft.az - V.z, h2 = hx * hx + hz * hz;
    const vy = V.y - ft.ay;
    const avail = h2 < reach * reach ? Math.sqrt(reach * reach - h2) : 0;
    let d = vy - avail;
    if (ft.sw) d *= 0.35;
    need = Math.max(need, d * w);
  }
  need = Math.min(o.maxDrop, Math.max(0, need));
  g.drop = need > g.drop ? need : g.drop + (need - g.drop) * (1 - Math.exp(-9 * o.dt));
  const w = Math.max(o.wL, o.wR);
  p.rootY = (p.rootY ?? 0) - g.drop * w;
  HP.y -= g.drop * w;
  for (let i = 0; i < 2; i++) {
    const w = i ? o.wR : o.wL;
    if (w <= 0.001) continue;
    const ft = g.feet[i];
    const S = i ? 'R' : 'L';
    J.set(ft.k * D.hipX, D.hipDY, 0).applyMatrix4(RH).add(HP);
    A.set(ft.ax, ft.ay, ft.az);
    // knee points along the foot, a touch outward
    const py = (ft.yawR + (p.hips?.[1] ?? 0)) * 0.5;
    POLE.set(Math.sin(py) + ft.k * 0.12, 0.05, Math.cos(py));
    solveTwoBone(RH, J, A, POLE, D.L1, D.L2, true, E1, E2, TB, i ? o.stiffR : o.stiffL, 2.5);
    endEuler(TB.lower, ft.yawR, ft.pitch, 0, E3);
    put(p, ('thigh' + S) as JointName, E1, w);
    put(p, ('shin' + S) as JointName, E2, w);
    put(p, ('foot' + S) as JointName, E3, w);
  }
}

/** root-space rotation of the chest (into RC) and its position (CP) for a pose */
export function chestFrame(p: Pose, D: LegDims) {
  hipsFrame(p, D);
  SP.set(0, D.spineY, 0).applyMatrix4(RH).add(HP);
  const s = jv(p, 'spine'), c = jv(p, 'chest');
  eulerMat(RT, s[0], s[1], s[2]);
  RS.multiplyMatrices(RH, RT);
  CP.set(0, D.chestY, 0).applyMatrix4(RS).add(SP);
  eulerMat(RT, c[0], c[1], c[2]);
  RC.multiplyMatrices(RS, RT);
  return { rot: RC, pos: CP };
}

const SH = new THREE.Vector3(), TGT = new THREE.Vector3();
/**
 * Reach a hand to a root-space point (two-bone arm IK, blended by w). The
 * elbow points along `pole` (root space; default: down, back and out).
 * Call chestFrame(p, D) first for this pose.
 */
export function armIK(p: Pose, D: LegDims, side: 'L' | 'R', tx: number, ty: number, tz: number, w: number, px = 0, py = -0.6, pz = -0.5) {
  if (w <= 0.001) return;
  const k = side === 'L' ? 1 : -1;
  SH.set(k * D.shX, D.shY, D.shZ).applyMatrix4(RC).add(CP);
  TGT.set(tx, ty, tz);
  POLE.set(px === 0 ? k * 0.45 : px, py, pz);
  solveTwoBone(RC, SH, TGT, POLE, D.A1, D.A2, false, E1, E2, TB, false, 2.6);
  put(p, ('uarm' + side) as JointName, E1, w);
  put(p, ('farm' + side) as JointName, E2, w);
}

/** a point given in chest-local space, in root space (after chestFrame) */
export function chestPoint(x: number, y: number, z: number, out: THREE.Vector3) { return out.set(x, y, z).applyMatrix4(RC).add(CP); }

/** a point given in hips-local space, in root space (after chestFrame) */
export function hipsPoint(x: number, y: number, z: number, out: THREE.Vector3) { return out.set(x, y, z).applyMatrix4(RH).add(HP); }

const RU = new THREE.Matrix4(), RF = new THREE.Matrix4();
/**
 * A point on the surface of one arm (after chestFrame): seg 0 the upper arm,
 * 1 the forearm, `along` 0..1 from its top joint; a little in front of the bone.
 */
export function armPoint(p: Pose, D: LegDims, side: 'L' | 'R', seg: number, along: number, out: THREE.Vector3) {
  const k = side === 'L' ? 1 : -1;
  SH.set(k * D.shX, D.shY, D.shZ).applyMatrix4(RC).add(CP);
  const u = jv(p, ('uarm' + side) as JointName);
  eulerMat(RT, u[0], u[1], u[2]);
  RU.multiplyMatrices(RC, RT);
  if (seg === 0) { V.set(0, -D.A1 * along, 0.045 * D.s).applyMatrix4(RU); return out.copy(SH).add(V); }
  V.set(0, -D.A1, 0).applyMatrix4(RU);
  out.copy(SH).add(V);
  const f = jv(p, ('farm' + side) as JointName);
  eulerMat(RT, f[0], f[1], f[2]);
  RF.multiplyMatrices(RU, RT);
  V.set(0, -D.A2 * along, 0.04 * D.s).applyMatrix4(RF);
  return out.add(V);
}
