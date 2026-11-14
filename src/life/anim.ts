// Procedural animation for any rig: gait cycles with feet IK'd onto the terrain (a gallop at speed), body bob, lean
// and weight shift, a head held steady over the gait, spring tails with swishes, jaws, mandibles, antennae, wings,
// serpent waves, gastropod glides, attacks, eating and death; and the small life on top: breathing, blinking lids,
// flicking and swivelling ears, idle business (looking round, sniffing or cropping the ground, grooming a flank,
// shaking the coat, shifting weight) and a flinch whenever the creature's hit flash fires.
import * as THREE from 'three';
import type { Rig, LegDef } from './morph';
import { clamp, damp, smooth } from '../core/rand';
import { daylight } from '../game/daylight';

export type AnimState = 'idle' | 'move' | 'attack' | 'eat' | 'dead' | 'fly' | 'stunned' | 'grabbed';
type IdleAct = 'none' | 'look' | 'sniff' | 'groom' | 'shake' | 'shift';
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
  /** gallop blend (0 walk .. 1 full gallop) */
  private run = 0;
  // blinks
  private blinkIn = 1 + Math.random() * 3; private blinkT = -1; private blinks = 1;
  // ears: flick timers and twitch springs
  private earIn: number[] = []; private earX: number[] = []; private earV: number[] = [];
  // idle business
  private idleAct: IdleAct = 'none'; private idleT = 0; private idleDur = 0; private idleIn = 1.5 + Math.random() * 3; private idleK = 0;
  private idleYaw = 0; private idlePitch = 0; private idleSide = 1;
  // tail swish
  private swishIn = 2 + Math.random() * 5; private swishT = -1; private swishSide = 1;
  // hit flinch: a damped spring kicked by the hit flash
  private prevFlash = 0; private hitX = 0; private hitV = 0; private hitSide = 1;
  private breathPh = Math.random() * 6;
  // defence: curled into a ball (0..1), and rolling as a ball along the direction of travel
  private curlK = 0; private curlT = 0; private rollA = 0;
  /** the body's carriage, set by the AI: relaxed, alert (head and ears up), sleep (curled, eyes shut, slow breath),
   *  threat (head low, back arched, jaw open, ears pinned), roost (hung upside down, wings folded) */
  posture: 'relaxed' | 'alert' | 'sleep' | 'threat' | 'roost' = 'relaxed';
  /** set by the AI: roll along the ground as a ball while curled (flee downhill) */
  rolling = false;
  /** curl into a defensive ball (1) or open out again (0); species with rig.dims.roll tuck fully, others hunch */
  curl(k: number) { this.curlT = clamp(k, 0, 1); }
  // eyes: the gaze jumps (saccades) between fixations near what the creature attends to; pupils follow the light
  private gaze = [0, 0]; private gazeT = [0, 0]; private fixIn = 0.5; private pupil = 1;
  // fat: a sprung lag in the belly
  private jig = 0; private jigV = 0; private lastY = 0;
  constructor(readonly rig: Rig, readonly bones: THREE.Bone[], readonly obj: THREE.Object3D) {
    this.tail = rig.tail.map(() => 0); this.tailV = rig.tail.map(() => 0);
    this.earIn = rig.ears.map(() => 1 + Math.random() * 4); this.earX = rig.ears.map(() => 0); this.earV = rig.ears.map(() => 0);
  }

  /** an idle behaviour chosen now and then while standing */
  private idle(dt: number, still: boolean) {
    const rig = this.rig, D = rig.dims;
    if (!still) { this.idleK = damp(this.idleK, 0, 6, dt); if (this.idleK < 0.02) this.idleAct = 'none'; this.idleIn = Math.max(this.idleIn, 1); return; }
    if (this.idleAct === 'none') {
      this.idleIn -= dt;
      if (this.idleIn <= 0 && rig.head >= 0) {
        const r = Math.random(), quad = rig.legs.length >= 4 && rig.plan !== 'hexapod' && rig.plan !== 'octopod';
        this.idleAct = r < 0.32 ? 'look' : r < 0.6 && quad ? 'sniff' : r < 0.74 && quad ? 'groom' : r < 0.82 && D.fur ? 'shake' : 'shift';
        if (D.graze && this.idleAct !== 'shake' && Math.random() < 0.45) this.idleAct = 'sniff';
        this.idleT = 0; this.idleSide = Math.random() < 0.5 ? -1 : 1;
        this.idleDur = this.idleAct === 'shake' ? 1.1 : this.idleAct === 'sniff' ? (D.graze ? 3.5 : 2.2) + Math.random() * 2 : 1.6 + Math.random() * 2;
        this.idleYaw = (Math.random() - 0.5) * 1.8; this.idlePitch = (Math.random() - 0.5) * 0.5;
      }
    } else {
      this.idleT += dt;
      const fade = Math.min(1, this.idleT / 0.45, (this.idleDur - this.idleT) / 0.45);
      this.idleK = smooth(0, 1, Math.max(0, fade));
      if (this.idleT >= this.idleDur) { this.idleAct = 'none'; this.idleK = 0; this.idleIn = 2 + Math.random() * 5; }
    }
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
    // four-footed walkers break into a gallop when pushed
    const canRun = rig.gait === 'walk' && rig.legs.length === 4 && rig.plan !== 'biped';
    this.run = damp(this.run, canRun ? clamp((spd / stride - 2.2) / 1.6, 0, 1) : 0, 3, dt);
    // a hit flash kicks the flinch spring
    const fx = (this.obj.userData as { fx?: { flash: { value: number } } }).fx, flash = fx ? fx.flash.value : 0;
    if (flash > 0.6 && flash - this.prevFlash > 0.45 && !dead) { this.hitV += 9; this.hitSide = Math.random() < 0.5 ? -1 : 1; this.blinkT = 0; this.blinks = 1; }
    this.prevFlash = flash;
    this.hitV += (-this.hitX * 140 - this.hitV * 14) * dt; this.hitX += this.hitV * dt;
    const hit = clamp(this.hitX, -0.6, 1.2);
    this.idle(dt, inp.state === 'idle' && spd < 0.05 && !dead);
    const pz = this.posture, sleep = pz === 'sleep' ? 1 : 0, threat = pz === 'threat' ? 1 : 0, alert = pz === 'alert' ? 1 : 0;
    this.curlK = damp(this.curlK, dead ? 0 : Math.max(this.curlT, sleep * 0.6) * (rig.dims.roll ? 1 : 0.45), 5, dt);
    const cu = this.curlK;
    const ik = this.idleK, act = this.idleAct, it = this.idleT;
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
    bob *= 1 + this.run * 1.2;
    // breathing: slow at rest in big animals, quick in small ones, heaving after a run
    const bHz = (0.32 / Math.sqrt(Math.max(0.15, rig.length))) * (1 + this.blend * 0.8 + this.run) * (this.posture === 'sleep' ? 0.6 : 1);
    this.breathPh += dt * bHz * Math.PI * 2;
    const br = Math.sin(this.breathPh), bAmp = 0.022 + this.blend * 0.015 + this.run * 0.02;
    const breathe = br * rig.rideH * 0.006;
    if (rig.ribs >= 0) B[rig.ribs].scale.set(1 + br * bAmp * 0.9, 1 + br * bAmp, 1 + br * bAmp * 0.3);
    root.position.y += (bob + breathe + this.hop) * (1 - cu) - cu * rig.rideH * 0.62;
    // weight shift: the body sways over the stance legs, or settles from one side to the other while it stands
    const shift = (rig.plan === 'serpent' || rig.plan === 'gastropod' ? 0 : Math.sin(ph) * rig.width * 0.035 * this.blend * (1 - this.run)) + (act === 'shift' ? Math.sin(it * 1.6) * rig.width * 0.06 * ik : 0);
    root.position.x += shift;
    root.position.z -= hit * rig.length * 0.04;
    if (inp.state === 'fly') root.position.y += inp.air;
    // attacks: lunge forward and dip
    let lunge = 0;
    if (inp.state === 'attack') { const a = inp.act; lunge = a < 0.35 ? -smooth(0, 0.35, a) * 0.4 : a < 0.55 ? 1 : 1 - smooth(0.55, 1, a); }
    root.position.z += lunge * rig.length * 0.12;
    // heavy bodies roll over the planted legs; sprawlers swing the hips against the shoulders
    const roll = rig.gait === 'amble' ? Math.sin(ph) * 0.06 * this.blend : 0;
    const swing = rig.gait === 'sprawl' ? Math.sin(ph) * 0.14 * this.blend + Math.sin(this.t * 0.9) * 0.03 : 0;
    const shake = act === 'shake' ? Math.sin(it * 26) * 0.11 * ik : 0;
    const gal = this.run * Math.sin(ph * 2 + 0.6) * 0.07;
    _e.set(lunge * 0.12 + (inp.state === 'eat' ? 0.18 : 0) + hopPitch - hit * 0.16 + gal, -swing * 0.5, this.lean + roll + shake + hit * 0.1 * this.hitSide, 'YXZ');
    root.quaternion.setFromEuler(_e);
    if (pz === 'roost') { root.quaternion.multiply(_q.setFromEuler(_e.set(0, 0, Math.PI))); root.position.y += rig.rideH * 2.2; }
    // rolling: the ball turns about its side axis by the distance travelled over its radius
    if (this.rolling && cu > 0.7) { this.rollA += (spd * dt) / Math.max(0.1, rig.width * 0.9); root.quaternion.multiply(_q.setFromEuler(_e.set(this.rollA, 0, 0))); }
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
      const w = rig.gait === 'sprawl' ? swing : Math.sin(ph) * 0.06 * this.blend * (1 - this.run);
      // the back flexes and extends through each gallop stride; a groom curls the body toward the flank
      const flex = this.run * Math.sin(ph * 2) * 0.16;
      const curl = act === 'groom' ? this.idleSide * 0.22 * ik : 0;
      B[rig.spine[1]].quaternion.setFromEuler(_e.set((rig.gait === 'hop' ? -hopPitch * 0.3 : 0) + flex + cu * 1.25 - threat * 0.15, w + curl, -this.lean * 0.4 - roll * 1.3 - shake * 0.6));
    }
    // head and neck
    if (rig.head >= 0 && rig.plan !== 'serpent') {
      const eat = inp.state === 'eat' ? 0.5 + Math.sin(this.t * 6) * 0.08 : 0;
      const atk = inp.state === 'attack' ? (inp.act < 0.5 ? -0.25 * smooth(0, 0.5, inp.act) : 0.25) : 0;
      // hooved heads nod with the forefeet; cats and dogs hold theirs level; an ambler's head swings low
      const nod = Math.sin(this.phase * Math.PI * 4) * (rig.dims.hoof ? 0.08 : rig.dims.cat ? 0.015 : rig.gait === 'amble' ? 0.07 : 0.035) * this.blend * (1 - this.run * 0.5);
      // a sprawler's neck cancels the body's swing so the head stays on target
      const steady = rig.gait === 'sprawl' ? -swing * 1.1 : rig.gait === 'amble' ? Math.sin(ph + 1) * 0.08 * this.blend : 0;
      const tongueAtk = rig.tongue >= 0 && rig.gait === 'hop';
      // idle business: look round, sniff or crop the ground (nose twitching, jaw working), turn to groom a flank
      let iy = 0, ip = 0, hp = 0, hr = 0;
      if (act === 'look') { iy = this.idleYaw * ik; ip = this.idlePitch * ik; }
      else if (act === 'sniff') { ip = (rig.dims.graze ? 1.0 : 0.62) * ik; hp = (0.25 + Math.sin(it * 9) * 0.035) * ik; iy = Math.sin(it * 0.7) * 0.25 * ik; }
      else if (act === 'groom') { iy = this.idleSide * 1.1 * ik; ip = 0.3 * ik; hp = (0.3 + Math.sin(it * 7) * 0.08) * ik; hr = -this.idleSide * 0.3 * ik; }
      else if (act === 'shake') hr = -shake * 1.6;
      // the head is held steady against the body's roll and lean, and jerks back from a blow
      const level = -(this.lean + roll) * 0.75;
      for (const n of rig.neck) B[n].quaternion.setFromEuler(_e.set(cu * 1.1 + threat * 0.3 - alert * 0.3 + eat * 0.6 + (tongueAtk ? 0 : atk * 0.5) - this.look[1] * 0.4 + ip - hit * 0.25 - gal * 0.8, this.look[0] * 0.4 + steady + iy * 0.55, level * 0.5, 'YXZ'));
      B[rig.head].quaternion.setFromEuler(_e.set(cu * 0.9 + eat * 0.5 + (tongueAtk ? -0.1 * Math.sin(Math.PI * inp.act) : atk) + nod - this.look[1] * 0.6 - hopPitch * 0.4 + hp - hit * 0.2, this.look[0] * 0.6 + iy * 0.45, level * 0.5 + hr + hit * 0.15 * this.hitSide, 'YXZ'));
      if (this.deathT > 0) B[rig.head].quaternion.multiply(_q.setFromEuler(_e.set(0.4 * this.deathT, 0, 0)));
    }
    if (rig.jaw >= 0) {
      // the mouth stays shut at rest; a rare yawn, panting on the run, a grazer's jaw working while it crops
      let open = Math.max(0, Math.sin(this.t * 0.23 + rig.length)) ** 60 * 0.45 + (rig.dims.fur ? this.run * (0.12 + Math.sin(this.t * 9) * 0.05) : 0);
      if (act === 'sniff' && rig.dims.graze) open = Math.max(open, (0.5 + 0.5 * Math.sin(it * 8)) * 0.12 * ik);
      if (act === 'groom') open = Math.max(open, (0.5 + 0.5 * Math.sin(it * 7)) * 0.1 * ik);
      if (threat) open = Math.max(open, 0.42 + Math.sin(this.t * 3) * 0.05);
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
      // at rest the hand-wing folds back along the flank, its membrane gathered
      const fold = rig.plan !== 'hexapod' && rig.plan !== 'octopod';
      B[w].quaternion.setFromEuler(_e.set(0, flying ? s * 0.9 : fold ? s * 1.15 : 0, -s * (flying ? f : fold ? 0.42 : 0.06)));
    });
    // blinks: now and then (sometimes twice), shut by a blow, stunned flutters, half-shut in death
    if (rig.lids.length) {
      if (this.blinkT < 0) { this.blinkIn -= dt * (inp.state === 'stunned' ? 6 : 1); if (this.blinkIn <= 0) { this.blinkT = 0; this.blinks = Math.random() < 0.2 ? 2 : 1; } }
      let shut = 0;
      if (this.blinkT >= 0) {
        this.blinkT += dt;
        const c = this.blinkT / 0.17;
        shut = c < 0.35 ? c / 0.35 : c < 0.5 ? 1 : 1 - (c - 0.5) / 0.5;
        if (c >= 1) { if (--this.blinks > 0) this.blinkT = 0; else { this.blinkT = -1; this.blinkIn = 1.8 + Math.random() * 4.5; } shut = 0; }
      }
      if (this.deathT > 0) shut = Math.max(shut, 0.62 * this.deathT);
      if (sleep) shut = 1;
      if (inp.state === 'stunned') shut = Math.max(shut, 0.35);
      for (const l of rig.lids) B[l.bone].quaternion.setFromAxisAngle(_a.set(l.axis[0], l.axis[1], l.axis[2]), clamp(shut, 0, 1) * 1.62);
    }
    // ears: swivel after the gaze, prick when moving, pin back to strike or when hit, flick off flies, droop in death
    rig.ears.forEach((e, i) => {
      const s = i === 0 ? -1 : 1;
      this.earIn[i] -= dt;
      if (this.earIn[i] <= 0) { this.earV[i] += (Math.random() < 0.5 ? 1 : -1) * 14; this.earIn[i] = 1.5 + Math.random() * 6; }
      this.earV[i] += (-this.earX[i] * 260 - this.earV[i] * 16) * dt; this.earX[i] += this.earV[i] * dt;
      const pin = (inp.state === 'attack' ? 0.9 : 0) + clamp(hit, 0, 1) * 0.8 + (act === 'shake' ? Math.abs(shake) * 4 : 0) + threat * 0.9 - alert * 0.35;
      const look = this.look[0] * 0.5 + (act === 'look' ? this.idleYaw * 0.4 * ik : 0);
      const droop = this.deathT;
      B[e].quaternion.setFromEuler(_e.set(0.12 * this.blend - pin * 0.85 - droop * 0.3 + this.earX[i] * 0.4, look + this.earX[i] * 0.6 * s, -s * (pin * 0.45 + droop * 0.7), 'YXZ'));
    });
    // eyes: fixations held 0.3-2 s, then a fast jump to a new point near the look target; held steady against the head's turn
    if (rig.eyes.length) {
      this.fixIn -= dt;
      if (this.fixIn <= 0) { this.fixIn = 0.3 + Math.random() * 1.7; this.gazeT[0] = (Math.random() - 0.5) * 0.5; this.gazeT[1] = (Math.random() - 0.5) * 0.25; }
      const lookY = clamp(inp.lookYaw * 0.35 + (act === 'look' ? this.idleYaw * 0.3 * ik : 0), -0.4, 0.4);
      for (let i = 0; i < 2; i++) this.gaze[i] = damp(this.gaze[i], this.gazeT[i] + (i === 0 ? lookY : 0), 28, dt);
      // pupils: wide in the dark, pinched in sunlight, flaring when it strikes or is struck
      const want = (0.55 + (1 - daylight.k) * 0.8) * (inp.state === 'attack' || hit > 0.3 ? 1.2 : 1) * (this.deathT > 0 ? 1.5 : 1);
      this.pupil = damp(this.pupil, want, 1.6, dt);
      for (const e of rig.eyes) {
        B[e.bone].quaternion.setFromEuler(_e.set(-this.gaze[1], this.gaze[0], 0, 'YXZ'));
        B[e.pupil].scale.setScalar(this.pupil);
      }
    }
    // fat: the belly lags the body's bounce and wobbles back
    if (rig.ribs >= 0 && rig.dims.fat) {
      const y = root.position.y, acc = (y - this.lastY) / Math.max(dt, 1e-3); this.lastY = y;
      this.jigV += (-acc * 0.6 - this.jig * 160 - this.jigV * 9) * dt; this.jig += this.jigV * dt;
      B[rig.ribs].position.y += clamp(this.jig, -0.05, 0.05) * rig.rideH * 0.5;
    }
    // tail swish now and then
    let swish = 0;
    if (this.swishT < 0) { this.swishIn -= dt; if (this.swishIn <= 0) { this.swishT = 0; this.swishSide = Math.random() < 0.5 ? -1 : 1; } }
    else { this.swishT += dt; swish = Math.sin(Math.min(1, this.swishT / 0.9) * Math.PI) * this.swishSide; if (this.swishT > 0.9) { this.swishT = -1; this.swishIn = 2.5 + Math.random() * 6; } }
    // tail: damped spring lagging behind turns and swaying
    for (let i = 0; i < rig.tail.length; i++) {
      let target = -inp.turn * 0.18 * (i + 1) * 0.5 + Math.sin(this.t * 1.6 - i * 0.6) * (rig.plan === 'hexapod' || rig.plan === 'octopod' ? 0.03 : 0.12) * (0.4 + this.blend * 0.6);
      if (rig.plan !== 'hexapod' && rig.plan !== 'octopod' && rig.plan !== 'gastropod') target += swish * 0.22 * (0.5 + i * 0.35) + hit * 0.2 * this.hitSide;
      // the S-wave runs on down the tail
      if (rig.gait === 'sprawl') target += Math.sin(ph - 1.2 - i * 0.8) * 0.22 * this.blend;
      this.tailV[i] += ((target - this.tail[i]) * 40 - this.tailV[i] * 8) * dt;
      this.tail[i] += this.tailV[i] * dt;
      const droop = rig.plan === 'gastropod' ? 0 : (this.deathT > 0 ? 0.25 * this.deathT : 0.04 - this.run * (i ? 0.02 : 0.12));
      B[rig.tail[i]].quaternion.setFromEuler(_e.set(droop - this.curlK * (rig.dims.roll ? 0.75 : 0.3), this.tail[i] * (1 - this.curlK), 0));
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
    // a rotary gallop: the hind pair lands close together, then the fore pair half a stride later; less time on the ground
    const duty = rig.duty + (0.4 - rig.duty) * this.run;
    const gph = (lg.kind === 'hind' ? 0 : 0.5) + (lg.side > 0 ? 0.1 : 0);
    let dph = gph - lg.phase; dph -= Math.round(dph);
    const p = (((this.phase + lg.phase + dph * this.run) % 1) + 1) % 1;
    let zo = 0, lift = 0;
    const S = stride * this.blend;
    if (p < duty) zo = S * (0.5 - p / duty);
    else { const s = (p - duty) / (1 - duty); zo = S * (-0.5 + smooth(0, 1, s)); lift = Math.sin(s * Math.PI) * Math.min(stride * 0.35, rig.rideH * 0.45) * this.blend; }
    // airborne in a bound: the feet travel with the body (tucked under it), not on the ground
    if (rig.gait === 'hop') lift += this.hop * (lg.kind === 'hind' ? 0.7 : 0.85);
    // curled: the feet draw in under the body and leave the ground
    const cu = this.curlK;
    let fx = lg.foot[0] * (1 - cu * 0.75);
    const fz = (lg.foot[1] + zo) * (1 - cu * 0.6);
    lift += cu * rig.rideH * 0.5;
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
    if (lg.flex !== undefined) { const bend = clamp((1 - dist / (l1 + l2)) * 3, 0, 1); B[lg.flex].scale.set(1 + bend * 0.28, 1, 1 + bend * 0.28); }
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
