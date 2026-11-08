// Procedural animation for any rig: gait cycles with feet IK'd onto the terrain, body bob and lean, head look,
// spring tails, jaws, mandibles, antennae, wings, serpent waves, gastropod glides, attacks, eating and death.
import * as THREE from 'three';
import type { Rig, LegDef } from './morph';
import { clamp, damp, smooth } from '../core/rand';

export type AnimState = 'idle' | 'move' | 'attack' | 'eat' | 'dead' | 'fly' | 'stunned' | 'grabbed';
export interface AnimIn {
  speed: number; turn: number; state: AnimState;
  /** 0..1 progress of a one-shot (attack) */
  act: number;
  lookYaw: number; lookPitch: number;
  ground: (x: number, z: number) => number;
  /** fly height above ground */
  air: number;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Euler();
const _a = new THREE.Vector3(), _t = new THREE.Vector3(), _k = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3();
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const V = () => new THREE.Vector3();
const _A = V(), _T = V(), _K3 = V(), _D = V(), _PERP = V(), _KNEE = V(), _END = V(), _FWD = V(), _POLE = V(), _TMP = V();
const _ax = V(), _ay = V(), _az = V();

export class Animator {
  phase = 0; t = Math.random() * 10;
  private tail: number[] = [];
  private tailV: number[] = [];
  private lean = 0; private roll = 0; private look = [0, 0];
  /** current bound height (frog gait) */
  private hop = 0;
  deathT = 0;
  private blend = 0;
  constructor(readonly rig: Rig, readonly bones: THREE.Bone[], readonly obj: THREE.Object3D) {
    this.tail = rig.tail.map(() => 0); this.tailV = rig.tail.map(() => 0);
  }

  update(dt: number, inp: AnimIn) {
    const rig = this.rig, B = this.bones;
    this.t += dt;
    for (const b of B) b.quaternion.identity();
    rig.bones.forEach((bd, i) => B[i].position.set(bd.pos[0], bd.pos[1], bd.pos[2]));
    const dead = inp.state === 'dead';
    this.deathT = dead ? Math.min(1, this.deathT + dt * 1.6) : 0;
    const spd = dead ? 0 : inp.speed;
    // gait phase: stride scales with speed
    const stride = Math.max(0.05, rig.stride * (0.55 + 0.45 * clamp(spd / (rig.stride * 3 + 0.1), 0, 1.4)));
    this.phase = (this.phase + (spd / stride) * dt * 0.5) % 1;
    this.blend = damp(this.blend, spd > 0.05 ? 1 : 0, 8, dt);
    this.lean = damp(this.lean, clamp(inp.turn * 0.12, -0.25, 0.25), 6, dt);
    this.look[0] = damp(this.look[0], clamp(inp.lookYaw, -1, 1), 5, dt);
    this.look[1] = damp(this.look[1], clamp(inp.lookPitch, -0.6, 0.5), 5, dt);
    const root = B[rig.root];
    const TAU = Math.PI * 2, ph = this.phase * TAU;
    let bob = rig.plan === 'serpent' || rig.plan === 'gastropod' ? 0 : -Math.abs(Math.sin(this.phase * Math.PI * 2 * (rig.legs.length > 2 ? 2 : 1))) * rig.rideH * 0.06 * this.blend;
    // frog bounds: the body arcs up while the hind legs are off the ground, nose up at take-off, down for the landing
    this.hop = 0; let hopPitch = 0;
    if (rig.gait === 'hop') {
      bob = 0;
      if (this.phase >= rig.duty) {
        const s = (this.phase - rig.duty) / (1 - rig.duty);
        this.hop = Math.sin(Math.PI * s) * (rig.dims.hindLen ?? rig.length) * 0.32 * this.blend;
        hopPitch = -Math.cos(Math.PI * s) * 0.32 * this.blend;
      } else hopPitch = Math.sin(Math.PI * this.phase / rig.duty) * 0.08 * this.blend;
    }
    if (rig.gait === 'amble') bob *= 1.4;
    const breathe = Math.sin(this.t * 1.7) * rig.rideH * 0.012;
    root.position.y += bob + breathe + this.hop;
    if (inp.state === 'fly') root.position.y += inp.air;
    // attacks: lunge forward and dip
    let lunge = 0;
    if (inp.state === 'attack') { const a = inp.act; lunge = a < 0.35 ? -smooth(0, 0.35, a) * 0.4 : a < 0.55 ? 1 : 1 - smooth(0.55, 1, a); }
    root.position.z += lunge * rig.length * 0.12;
    // heavy bodies roll over the planted legs; sprawlers swing the hips against the shoulders
    const roll = rig.gait === 'amble' ? Math.sin(ph) * 0.06 * this.blend : 0;
    const swing = rig.gait === 'sprawl' ? Math.sin(ph) * 0.14 * this.blend + Math.sin(this.t * 0.9) * 0.03 : 0;
    _e.set(lunge * 0.12 + (inp.state === 'eat' ? 0.18 : 0) + hopPitch, -swing * 0.5, this.lean + roll, 'YXZ');
    root.quaternion.setFromEuler(_e);
    if (inp.state === 'stunned') root.quaternion.multiply(_q.setFromEuler(_e.set(Math.sin(this.t * 13) * 0.08, 0, Math.sin(this.t * 9) * 0.12)));
    // death: roll onto the side and sink
    if (this.deathT > 0) {
      const k = smooth(0, 1, this.deathT);
      root.quaternion.multiply(_q.setFromEuler(_e.set(0, 0, k * 1.45)));
      root.position.y -= k * rig.rideH * 0.55 - k * rig.width * 0.25;
    }
    // spine wave (quadruped yaw, serpent undulation)
    if (rig.plan === 'serpent') this.serpent(dt, spd, inp);
    else if (rig.spine.length > 1) {
      const w = rig.gait === 'sprawl' ? swing : Math.sin(ph) * 0.06 * this.blend;
      B[rig.spine[1]].quaternion.setFromEuler(_e.set(rig.gait === 'hop' ? -hopPitch * 0.3 : 0, w, -this.lean * 0.4 - roll * 1.3));
    }
    // head and neck
    if (rig.head >= 0 && rig.plan !== 'serpent') {
      const eat = inp.state === 'eat' ? 0.5 + Math.sin(this.t * 6) * 0.08 : 0;
      const atk = inp.state === 'attack' ? (inp.act < 0.5 ? -0.25 * smooth(0, 0.5, inp.act) : 0.25) : 0;
      const nod = Math.sin(this.phase * Math.PI * 4) * (rig.gait === 'amble' ? 0.07 : 0.04) * this.blend;
      // a sprawler's neck cancels the body's swing so the head stays on target; an ambler's head swings low
      const steady = rig.gait === 'sprawl' ? -swing * 1.1 : rig.gait === 'amble' ? Math.sin(ph + 1) * 0.08 * this.blend : 0;
      const tongueAtk = rig.tongue >= 0 && rig.gait === 'hop';
      for (const n of rig.neck) B[n].quaternion.setFromEuler(_e.set(eat * 0.6 + (tongueAtk ? 0 : atk * 0.5) - this.look[1] * 0.4, this.look[0] * 0.4 + steady, 0, 'YXZ'));
      B[rig.head].quaternion.setFromEuler(_e.set(eat * 0.5 + (tongueAtk ? -0.1 * Math.sin(Math.PI * inp.act) : atk) + nod - this.look[1] * 0.6 - hopPitch * 0.4, this.look[0] * 0.6, 0, 'YXZ'));
      if (this.deathT > 0) B[rig.head].quaternion.multiply(_q.setFromEuler(_e.set(0.4 * this.deathT, 0, 0)));
    }
    if (rig.jaw >= 0) {
      let open = Math.max(0, Math.sin(this.t * 0.7)) ** 8 * 0.15;
      if (inp.state === 'attack') open = inp.act < 0.45 ? smooth(0, 0.45, inp.act) * 0.7 : inp.act < 0.6 ? 0 : 0.1;
      if (inp.state === 'eat') open = (Math.sin(this.t * 9) * 0.5 + 0.5) * 0.35;
      if (this.deathT > 0) open = 0.35 * this.deathT;
      // tongue strikes and lizard flicks open the mouth just enough
      if (rig.tongue >= 0 && inp.state === 'attack') open = Math.max(open, 0.45 * Math.sin(Math.PI * clamp((inp.act - 0.15) / 0.7, 0, 1)));
      const flick = this.flick();
      if (flick > 0) open = Math.max(open, 0.12 * flick);
      B[rig.jaw].quaternion.setFromEuler(_e.set(open, 0, 0));
    }
    if (rig.tongue >= 0) {
      let ext = this.flick() * rig.length * 0.12;
      if (inp.state === 'attack') ext = Math.sin(Math.PI * clamp((inp.act - 0.2) / 0.6, 0, 1)) * rig.length * (rig.gait === 'hop' ? 0.75 : 0.3);
      if (inp.state === 'eat') ext = Math.max(0, Math.sin(this.t * 7)) * rig.length * 0.08;
      B[rig.tongue].position.z += ext;
    }
    if (rig.throat >= 0) {
      // the vocal sac swells and empties in slow croaks while it sits still
      const k = Math.pow(Math.max(0, Math.sin(this.t * 2.4)), 3) * (Math.sin(this.t * 0.37) > -0.2 ? 1 : 0) * (1 - this.blend) * (this.deathT > 0 ? 0 : 1);
      B[rig.throat].scale.set(1 + 0.55 * k, 1 + 0.9 * k, 1 + 0.45 * k);
    }
    // mandibles / scythes / arms
    rig.mandibles.forEach((m, i) => {
      const s = i % 2 ? 1 : -1;
      let a = Math.sin(this.t * 3 + i) * 0.08;
      if (inp.state === 'attack') a = inp.act < 0.4 ? -0.6 * smooth(0, 0.4, inp.act) : 0.4 * (1 - smooth(0.4, 0.8, inp.act));
      if (inp.state === 'eat') a = Math.sin(this.t * 10) * 0.3;
      B[m].quaternion.setFromEuler(_e.set(rig.plan === 'biped' ? a * 1.4 - 0.3 : a * 0.6, s * a, 0));
    });
    rig.antennae.forEach((a, i) => B[a].quaternion.setFromEuler(_e.set(Math.sin(this.t * 2.3 + i) * 0.18, Math.sin(this.t * 1.7 + i * 2) * 0.15, 0)));
    rig.stalks.forEach((a, i) => B[a].quaternion.setFromEuler(_e.set(Math.sin(this.t * 1.1 + i) * 0.15, 0, Math.sin(this.t * 0.9 + i) * 0.12)));
    // wings: folded at rest, a blur of beats in flight
    rig.wings.forEach((w, i) => {
      const s = i % 2 === 0 ? -1 : 1;
      const flying = inp.state === 'fly';
      const f = flying ? Math.sin(this.t * (rig.plan === 'hexapod' ? 46 : 11) + (i >> 1)) * 0.8 : 0;
      B[w].quaternion.setFromEuler(_e.set(0, flying ? s * 0.9 : 0, -s * (flying ? f : 0.06)));
    });
    // tail: damped spring lagging behind turns and swaying
    for (let i = 0; i < rig.tail.length; i++) {
      let target = -inp.turn * 0.18 * (i + 1) * 0.5 + Math.sin(this.t * 1.6 - i * 0.6) * (rig.plan === 'hexapod' || rig.plan === 'octopod' ? 0.03 : 0.12) * (0.4 + this.blend * 0.6);
      // the S-wave runs on down the tail
      if (rig.gait === 'sprawl') target += Math.sin(ph - 1.2 - i * 0.8) * 0.22 * this.blend;
      this.tailV[i] += ((target - this.tail[i]) * 40 - this.tailV[i] * 8) * dt;
      this.tail[i] += this.tailV[i] * dt;
      const droop = rig.plan === 'gastropod' ? 0 : (this.deathT > 0 ? 0.25 * this.deathT : 0.04);
      B[rig.tail[i]].quaternion.setFromEuler(_e.set(droop, this.tail[i], 0));
    }
    // legs
    this.obj.updateMatrixWorld(true);
    for (const lg of rig.legs) this.leg(lg, inp, stride);
  }

  private serpent(_dt: number, spd: number, inp: AnimIn) {
    const rig = this.rig, B = this.bones;
    const amp = 0.18 + 0.32 * this.blend;
    this.phase;
    rig.spine.forEach((s, i) => {
      const w = Math.sin(this.phase * Math.PI * 2 * 2 - i * 0.75) * amp * (i === 0 ? 0.5 : 1);
      B[s].quaternion.setFromEuler(_e.set(this.deathT > 0 ? 0 : Math.sin(this.t * 0.8 + i) * 0.03, w + (i === 0 ? -inp.turn * 0.1 : 0), 0));
    });
    if (inp.state === 'attack') B[rig.head].quaternion.setFromEuler(_e.set(-0.3 * Math.sin(inp.act * Math.PI), 0, 0));
    void spd;
  }

  /** 2-bone IK in world space with a pole; feet planted on the terrain */
  private leg(lg: LegDef, inp: AnimIn, stride: number) {
    const B = this.bones, rig = this.rig, obj = this.obj;
    const duty = rig.duty;
    const p = (this.phase + lg.phase) % 1;
    let zo = 0, lift = 0;
    const S = stride * this.blend;
    if (p < duty) zo = S * (0.5 - p / duty);
    else { const s = (p - duty) / (1 - duty); zo = S * (-0.5 + smooth(0, 1, s)); lift = Math.sin(s * Math.PI) * Math.min(stride * 0.35, rig.rideH * 0.45) * this.blend; }
    // airborne in a bound: the feet travel with the body (tucked under it), not on the ground
    if (rig.gait === 'hop') lift += this.hop * (lg.kind === 'hind' ? 0.7 : 0.85);
    let fx = lg.foot[0];
    const fz = lg.foot[1] + zo;
    const dead = this.deathT > 0;
    if (dead) fx *= 1 + this.deathT * 0.3;
    _T.set(fx, 0, fz).applyMatrix4(obj.matrixWorld);
    _T.y = (inp.state === 'fly' ? obj.matrixWorld.elements[13] + rig.rideH * 0.4 : inp.ground(_T.x, _T.z)) + lift;
    const up = B[lg.bones[0]];
    up.getWorldPosition(_A);
    const objQ = obj.getWorldQuaternion(_qi);
    _FWD.set(0, 0, 1).applyQuaternion(objQ);
    if (lg.pole) _POLE.set(lg.pole[0], lg.pole[1], lg.pole[2]).normalize().applyQuaternion(objQ);
    else if (lg.kind === 'insect' || lg.kind === 'spider') _POLE.set(lg.side * 0.6, 1, 0).applyQuaternion(objQ);
    else if (lg.kind === 'fore') _POLE.copy(_FWD).multiplyScalar(-1);
    else _POLE.copy(_FWD);
    const lens = lg.lens;
    let target = _T;
    if (lens.length === 3) {
      this.tarsus(lg, objQ, _TMP);
      _K3.copy(_T).addScaledVector(_TMP, -lens[2]);
      target = _K3;
    }
    if (dead && (lg.kind === 'insect' || lg.kind === 'spider')) {
      _TMP.set(-lg.side, 0, 0).applyQuaternion(objQ);
      _K3.copy(_A).addScaledVector(DOWN, (lens[0] + lens[1]) * 0.35).addScaledVector(_TMP, (lens[0] + lens[1]) * 0.3);
      target = _K3;
    }
    const l1 = lens[0], l2 = lens[1];
    _D.subVectors(target, _A);
    const dist = clamp(_D.length(), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.999);
    _D.normalize();
    const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _PERP.copy(_POLE).addScaledVector(_D, -_POLE.dot(_D));
    if (_PERP.lengthSq() < 1e-8) _PERP.copy(_FWD);
    _PERP.normalize();
    _KNEE.copy(_A).addScaledVector(_D, a).addScaledVector(_PERP, h);
    _END.copy(_A).addScaledVector(_D, dist);
    this.aim(lg.bones[0], _TMP.subVectors(_KNEE, _A).normalize(), _PERP);
    up.updateMatrixWorld(true);
    this.aim(lg.bones[1], _TMP.subVectors(_END, _KNEE).normalize(), _PERP);
    B[lg.bones[1]].updateMatrixWorld(true);
    if (lens.length === 3) {
      this.aim(lg.bones[2], this.tarsus(lg, objQ, _TMP), _FWD);
      B[lg.bones[2]].updateMatrixWorld(true);
    }
    const foot = B[lg.bones[lg.bones.length - 1]];
    (foot.parent as THREE.Object3D).getWorldQuaternion(_q2).invert();
    foot.quaternion.copy(_q2).multiply(objQ);
  }

  /** world direction of the last segment of a three-bone leg */
  private tarsus(lg: LegDef, objQ: THREE.Quaternion, out: THREE.Vector3) {
    if (lg.tarsus) return out.set(lg.tarsus[0], lg.tarsus[1], lg.tarsus[2]).normalize().applyQuaternion(objQ);
    return out.set(0, -1, 0).addScaledVector(_FWD, 0.32).normalize();
  }
  /** 0..1: a quick in-out tongue flick every few seconds (tongued sprawlers taste the air) */
  private flick() {
    if (this.rig.tongue < 0 || this.rig.gait === 'hop') return 0;
    const c = (this.t * 0.45 + this.rig.length) % 1;
    return c < 0.12 ? Math.sin((c / 0.12) * Math.PI * 2) ** 2 : 0;
  }

  /** rotate bone so its rest direction (0,-1,0) points along dir (world), knee-forward axis toward pole */
  private aim(bi: number, dir: THREE.Vector3, pole: THREE.Vector3) {
    const bone = this.bones[bi];
    _ay.copy(dir).negate();
    _az.copy(pole).addScaledVector(_ay, -pole.dot(_ay));
    if (_az.lengthSq() < 1e-6) _az.set(0, 0, 1);
    _az.normalize();
    _ax.crossVectors(_ay, _az);
    _m.makeBasis(_ax, _ay, _az);
    _q.setFromRotationMatrix(_m);
    (bone.parent as THREE.Object3D).getWorldQuaternion(_q2).invert();
    bone.quaternion.copy(_q2).multiply(_q);
  }
}
