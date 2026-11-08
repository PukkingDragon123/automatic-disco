import type { Pose, JointName } from './humanRig';
import { clamp, lerp } from '../core/math';
import { Gait, GaitFrame, LegDims, legDimsFrom, legIK, chestFrame, chestPoint, hipsPoint, armPoint, armIK } from './humanGait';
import { Reactions, Secondary } from './humanReact';
import { spring, wrapPi } from './humanIK';
import { rigDims } from './humanModel';
import * as THREE from 'three';

/**
 * Procedural animation for survivors. Layers, bottom to top:
 *  1. locomotion: world-planted feet (humanGait.ts) — stride and cadence
 *     follow ground speed, feet stay put in stance and roll heel-to-toe,
 *     swing along arcs to predicted landing spots, step when turning on the
 *     spot or settling after a stop; counter-rotating shoulders, arm swing
 *     with forearm follow-through, pelvis bob / sway / drop;
 *  2. idle body language: breathing, weight shifts, fidgets, exhaustion,
 *     panic (hunched, glancing over the shoulders), cold shivers, hunger,
 *     sickness, drunk sway, a cradled injured arm, a hand pressed to a wound;
 *  3. actions with per-joint masks (weapon stances, swings, shoves, eating
 *     and drinking with hand-to-mouth reach, pushing and dragging furniture,
 *     overhead smashes, kicks, being dragged / beaten, shocks, getting up...);
 *  4. emotes; 5. full-body states (sit, lie, kneel, downed, dead, carried...);
 * then: inertialized crossfades on every discrete switch, look-at (head,
 * neck, chest), hit reactions (springs), momentum lean and banking, foot IK
 * with pelvis drop, hand IK for contacts, and secondary motion (backpack,
 * hair). Allocation-light: the output pose and all IK / spring state are
 * reused every frame.
 */

export type Stance = 'stand' | 'sneak' | 'swim' | 'crawl';
export type FullBody = '' | 'sit' | 'lie' | 'dead' | 'downed' | 'carried' | 'vault' | 'kneel' | 'drive' | 'fall' | 'lie_side';
export const EMOTES = ['wave', 'flex', 'dance', 'jumping_jacks', 'shrug', 'salute', 'point', 'facepalm', 'sit_wait', 'cheer', 'clap', 'bow', 'mock'] as const;
export type EmoteName = typeof EMOTES[number];
export type ActionAnim =
  | '' | 'aim_melee' | 'aim_gun' | 'aim_throw' | 'swing' | 'swing2h' | 'stab' | 'shoot' | 'throw' | 'shove' | 'eat' | 'drink'
  | 'loot' | 'pickup' | 'craft' | 'hammer' | 'saw' | 'read' | 'scanner' | 'carry' | 'push' | 'bandage' | 'dig' | 'pour'
  | 'flinch' | 'shiver' | 'cough' | 'wave' | 'hold_light' | 'hold_item' | 'type' | 'pray' | 'cover_ears' | 'reload'
  | 'stitch' | 'cook' | 'mix' | 'breathe' | 'panic' | `emote:${string}`
  /** held by a creature, pulled, the limb tears away (limb loss) */
  | 'torn_arm_l' | 'torn_arm_r' | 'torn_leg_l' | 'torn_leg_r'
  /** heavy furniture: lean into it / haul it backwards; overhead two-hand smash; kick an object */
  | 'drag' | 'smash' | 'kick_obj'
  /** Remittance Programme: hauled limp by the arms, curled under a beating, kneeling, landing hard, getting up, staggering, a BAILIFF shock */
  | 'dragged' | 'beaten' | 'kneel' | 'fall_land' | 'get_up' | 'stagger' | 'shocked'
  /** any other name is accepted and falls back to plain locomotion */
  | (string & {});

/**
 * Natural lengths (seconds) of the one-shot / looping named animations, for
 * Player.playAnim(name) and TimedAction.anim users. Looping ones (push, drag,
 * smash, kick_obj, eat, drink, dragged, beaten, kneel) repeat for as long as
 * they are playing.
 */
export const ANIM_DUR: Record<string, number> = {
  push: 1, drag: 1, smash: 0.95, kick_obj: 0.85, eat: 1.6, drink: 3, dragged: 3, beaten: 2.4, kneel: 2,
  fall_land: 0.9, get_up: 1.8, stagger: 1.0, shocked: 1.2, flinch: 0.35, shove: 0.45, pickup: 0.9, throw: 0.6,
};
/** every action animation name the animator knows (unknown names fall back to plain locomotion) */
export const ANIM_NAMES: readonly string[] = [
  'aim_melee', 'aim_gun', 'aim_throw', 'swing', 'swing2h', 'stab', 'shoot', 'throw', 'shove', 'eat', 'drink', 'loot', 'pickup', 'craft', 'hammer',
  'saw', 'read', 'scanner', 'carry', 'push', 'bandage', 'dig', 'pour', 'flinch', 'shiver', 'cough', 'wave', 'hold_light', 'hold_item', 'type',
  'pray', 'cover_ears', 'reload', 'stitch', 'cook', 'mix', 'breathe', 'panic', 'torn_arm_l', 'torn_arm_r', 'torn_leg_l', 'torn_leg_r',
  'drag', 'smash', 'kick_obj', 'dragged', 'beaten', 'kneel', 'fall_land', 'get_up', 'stagger', 'shocked',
];
export const hasAnim = (name: string) => ANIM_NAMES.includes(name) || name.startsWith('emote:') || EXT_POSES.has(name);

/**
 * Named poses registered by other modules (combat moves: src/combat/anims.ts). `fn(t, dur, inp, time)`
 * returns the action pose (and joint mask, default upper body). `noIK` releases the planted feet,
 * `aim` uses the fighting-stance foot placement, `dur` is the natural length for playAnim().
 */
export type PoseFn = (t: number, dur: number, inp: AnimInput, time: number) => { pose: Pose; mask?: JointName[] };
const EXT_POSES = new Map<string, PoseFn>();
export function registerPose(name: string, fn: PoseFn, o: { noIK?: boolean; aim?: boolean; dur?: number } = {}) {
  EXT_POSES.set(name, fn);
  if (o.noIK) NO_IK.add(name);
  if (o.aim) AIM_ACTS.add(name);
  if (o.dur) ANIM_DUR[name] = o.dur;
}

/** missing limbs and what replaces them (src/survival/limbs.ts) */
export interface AnimLimbs {
  /** loss level per limb: 0 whole, 1 hand / foot, 2 forearm / lower leg, 3 the whole limb */
  armL: number; armR: number; legL: number; legR: number;
  gait: 'walk' | 'peg' | 'prosthetic' | 'crutch' | 'hop' | 'crawl';
  /** the right hand is gone: the left takes over (the whole pose is mirrored) */
  mirror: boolean;
  crutchL: boolean; crutchR: boolean;
  pegL: boolean; pegR: boolean;
  hookL?: boolean; hookR?: boolean;
}

export interface AnimInput {
  speed: number;          // horizontal m/s
  stance: Stance;
  full: FullBody;
  action: ActionAnim;
  actionT: number;        // seconds into action
  actionDur: number;      // action duration (for one-shots)
  twoHanded: boolean;
  limp: number;           // 0..1 leg injury
  tired: number;          // 0..1
  panic: number;          // 0..1
  cold: number;           // 0..1 shiver
  aimPitch: number;       // radians
  holdingLight: boolean;
  holding: boolean;
  lookYaw: number;        // head yaw offset
  // ---- optional richer inputs
  weapon?: string;        // blunt | blade | spear | axe | firearm | thrown | unarmed | ''
  limpSide?: 'L' | 'R';
  armHurtL?: number;      // 0..1
  armHurtR?: number;
  exhausted?: number;     // 0..1 (low endurance)
  drunk?: number;         // 0..1
  hot?: number;           // 0..1
  heldL?: boolean;
  turn?: number;          // facing angular velocity (rad/s)
  hasWatch?: boolean;
  unconscious?: boolean;
  /** allow idle fidgets (false for remote players far away etc.) */
  fidget?: boolean;
  /** limb loss: missing limbs, crutches, pegs (hop / crutch gaits, one-armed mirroring) */
  limbs?: AnimLimbs;
  // ---- world placement (enables world-planted feet, stairs, look-at targets)
  /** rig root position in the world and its yaw (three.js rotation.y) */
  wx?: number; wy?: number; wz?: number; wyaw?: number;
  /** floor height (world y) under a world point: feet land on steps and ledges */
  ground?: (x: number, z: number) => number;
  /** move direction relative to facing (radians) when the rig walks without moving (previews) */
  moveYaw?: number;
  /** a world point to look at (head and neck, the chest a little), with weight 0..1 */
  lookX?: number; lookY?: number; lookZ?: number; lookW?: number;
  /** 0 full detail (foot / hand IK, look-at, secondary motion), 1 no IK, 2 minimal (off screen) */
  lod?: number;
  /** a body part (item body-part key) to press a hand against: a bleeding wound */
  clutch?: string;
  hunger?: number;        // 0..1
  sick?: number;          // 0..1 nausea
}

const MIRROR_J: Record<JointName, JointName> = {
  hips: 'hips', spine: 'spine', chest: 'chest', neck: 'neck', head: 'head',
  uarmL: 'uarmR', farmL: 'farmR', handL: 'handR', uarmR: 'uarmL', farmR: 'farmL', handR: 'handL',
  thighL: 'thighR', shinL: 'shinR', footL: 'footR', thighR: 'thighL', shinR: 'shinL', footR: 'footL',
};
const MIRROR_ACT: Record<string, ActionAnim> = { torn_arm_l: 'torn_arm_r', torn_arm_r: 'torn_arm_l', torn_leg_l: 'torn_leg_r', torn_leg_r: 'torn_leg_l' };
/** the same input seen in a mirror (left and right swapped) */
function mirrorInput(i: AnimInput): AnimInput {
  const L = i.limbs!;
  return {
    ...i, limpSide: i.limpSide === 'L' ? 'R' : i.limpSide === 'R' ? 'L' : undefined, armHurtL: i.armHurtR, armHurtR: i.armHurtL,
    turn: -(i.turn ?? 0), lookYaw: -i.lookYaw, action: (MIRROR_ACT[i.action] ?? i.action) as ActionAnim,
    clutch: i.clutch ? i.clutch.replace(/_l$/, '_X').replace(/_r$/, '_l').replace(/_X$/, '_r') : i.clutch,
    limbs: { ...L, armL: L.armR, armR: L.armL, legL: L.legR, legR: L.legL, crutchL: L.crutchR, crutchR: L.crutchL, pegL: L.pegR, pegR: L.pegL, hookL: L.hookR, hookR: L.hookL, mirror: false },
  };
}
/** mirror a pose across the body's centre plane: swap sides, negate yaw and roll */
function mirrorPose(p: Pose): Pose {
  const q: Pose = { ...p };
  for (const j of Object.keys(MIRROR_J) as JointName[]) { const v = p[j]; q[MIRROR_J[j]] = v ? [v[0], -v[1], -v[2]] : undefined; }
  q.rootX = -(p.rootX ?? 0); q.bodyYaw = -(p.bodyYaw ?? 0); q.bodyRoll = -(p.bodyRoll ?? 0);
  q.gripL = p.gripR; q.gripR = p.gripL;
  return q;
}

type V = [number, number, number];
const Z: V = [0, 0, 0];
const add = (p: Pose, j: JointName, x: number, y = 0, z = 0) => { const v = p[j]; if (v) { v[0] += x; v[1] += y; v[2] += z; } else p[j] = [x, y, z]; };
const set = (p: Pose, j: JointName, x: number, y = 0, z = 0) => { const v = p[j]; if (v) { v[0] = x; v[1] = y; v[2] = z; } else p[j] = [x, y, z]; };
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const env = (u: number, a = 0.2, b = 0.2) => (u < a ? ease(u / a) : u > 1 - b ? ease((1 - u) / b) : 1);
const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

const UPPER: JointName[] = ['spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'];
const ARMS: JointName[] = ['uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR'];
const ARM_R: JointName[] = ['uarmR', 'farmR', 'handR'];
const ARM_L: JointName[] = ['uarmL', 'farmL', 'handL'];
const LEGS: JointName[] = ['hips', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const ALL: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
const SCALARS = ['rootY', 'rootZ', 'rootX', 'bodyPitch', 'bodyRoll', 'bodyYaw', 'bodyY', 'gripL', 'gripR', 'blink'] as const;
/** channels crossfaded on discrete switches (17 joints x 3 + these) */
const XF_SC = ['rootY', 'rootZ', 'rootX', 'bodyPitch', 'bodyRoll', 'bodyYaw', 'bodyY', 'gripL', 'gripR'] as const;
const NCH = ALL.length * 3 + XF_SC.length;
/** actions that put the whole body somewhere the feet cannot plant */
const NO_IK = new Set(['torn_arm_l', 'torn_arm_r', 'torn_leg_l', 'torn_leg_r', 'dragged', 'beaten', 'kneel', 'get_up']);
/** emotes that move the legs themselves */
const LEG_EMOTES = new Set(['dance', 'jumping_jacks', 'sit_wait']);
const AIM_ACTS = new Set(['aim_melee', 'aim_gun', 'aim_throw', 'swing', 'swing2h', 'stab', 'throw', 'shove', 'shoot']);

type Fidget = 'look' | 'scratch' | 'watch' | 'stretch' | 'neck' | 'shift' | 'wipe' | 'rub' | 'support';

let DEF_DIMS: LegDims | null = null;
function defaultDims(): LegDims {
  if (!DEF_DIMS) DEF_DIMS = legDimsFrom(rigDims({ skin: 0, hair: 0, hairStyle: 'short', face: 0, build: 'average', height: 1, bodyShape: 0.3 } as any) as any, 0.02);
  return DEF_DIMS;
}

function resetPose(p: Pose): Pose {
  for (const j of ALL) { const v = p[j]; if (v) { v[0] = 0; v[1] = 0; v[2] = 0; } else p[j] = [0, 0, 0]; }
  for (const k of SCALARS) (p as any)[k] = undefined;
  p.pack = undefined; p.hair = undefined; p.packY = undefined;
  return p;
}

const _tv = new THREE.Vector3();

/** a hand reach request: weight, target, space (0 root, 1 chest-local, 2 hips-local, 3 a point on the other arm), elbow pole */
class Reach {
  w = 0; x = 0; y = 0; z = 0; space = 0; px = 0; py = -0.6; pz = -0.5; seg = 0; along = 0.5;
  to(w: number, x: number, y: number, z: number, space = 0) { this.w = w; this.x = x; this.y = y; this.z = z; this.space = space; this.px = 0; this.py = -0.6; this.pz = -0.5; return this; }
  pole(x: number, y: number, z: number) { this.px = x; this.py = y; this.pz = z; return this; }
}

export class HumanAnimator {
  phase = 0;
  pose: Pose = {};
  /** feet planted in the world: stride and cadence matched to ground speed */
  gait = new Gait();
  /** procedural hit reactions */
  react = new Reactions();
  /** backpack / hair pendulums */
  sec = new Secondary();
  /** the rig's measurements (HumanRig sets them; previews fall back to an average body) */
  dims: LegDims | null = null;
  private time = 0;
  private seed = Math.random() * 1000;
  private actW = 0; private lastAction: ActionAnim = '';
  private fullW = 0; private lastFull: FullBody = '';
  private walkW = 0; private runW = 0; private sneakW = 0; private crawlW = 0; private swimW = 0;
  private idleT = 0;
  private weight = 0; private weightTarget = 0; private weightT = 2;
  private fid: { k: Fidget; t: number; dur: number; side: number } | null = null;
  private fidT = 4;
  private look = 0; private lookTarget = 0; private lookT = 2; private lookP = 0; private lookPT = 0;
  private blinkT = 2; private blink = 0;
  private fullT = 0; private prevFull: FullBody = '';
  private swingN = 0; private lastSwingAct = '';
  private emote: { name: EmoteName; t: number; loop: boolean } | null = null;
  private emoteW = 0; private lastEmote: EmoteName | null = null; private emoteT = 0;
  private lean = 0;
  private attackT = 0;
  private out: Pose = {};
  private outM: Pose = {};
  private gf: GaitFrame = { dt: 0, world: false, wx: 0, wy: 0, wz: 0, yaw: 0, speed: 0, moveYaw: 0, run: 0, sneak: 0, limp: 0, limpR: false, drunk: 0, tired: 0, stance: new Float32Array(6), hipX: 0, hipZ: 0, active: true, restless: 0 };
  private vyaw = 0;
  private ikL = 1; private ikR = 1; private ikTL = 1; private ikTR = 1; private ikRate = 8;
  private stiffL = false; private stiffR = false;
  private reachL = new Reach(); private reachR = new Reach();
  private reachWL = 0; private reachWR = 0;
  // crossfades
  private xPrev = new Float32Array(NCH); private xOff = new Float32Array(NCH); private xCur = new Float32Array(NCH);
  private xT = 9; private xHas = false;
  private kAct = ''; private kFull = ''; private kEm = ''; private kSt = ''; private kMode = '';
  // look-at, lean
  private lk = new Float32Array(4); private lkV = new Float32Array(4); private lkW = 0;
  private bal = new Float32Array(2); private balV = new Float32Array(2);
  private lastHipX = 0; private lastHipZ = 0;
  private hungerT = 5; private retchT = 8;
  private oneLeg = false;

  /** a panic attack: trembling, hunched, hyperventilating, hands to chest and head for a few seconds */
  panicAttack(secs = 7) { if (this.attackT <= 0) this.attackDur = 0; this.attackT = Math.max(this.attackT, secs); this.fid = null; }
  private attackDur = 0;
  get panicking() { return this.attackT > 0.3; }

  playEmote(name: string, loop?: boolean) {
    if (!(EMOTES as readonly string[]).includes(name)) return false;
    const n = name as EmoteName;
    this.emote = { name: n, t: 0, loop: loop ?? (n === 'dance' || n === 'jumping_jacks' || n === 'sit_wait' || n === 'clap') };
    return true;
  }
  stopEmote() { this.emote = null; }
  /** current emote (for network mirroring) */
  get emoteState(): { name: string; t: number } | null { return this.emote ? { name: this.emote.name, t: this.emote.t } : null; }

  /**
   * A blow lands: (fx, fz) is the direction it pushes the body in ROOT space
   * (+z = the body's front, so a hit from the front pushes towards -z), part an
   * item body-part key ('head', 'torso_u', 'thigh_l'...), strength 0..1.5.
   */
  hit(fx: number, fz: number, part: string, strength: number) { this.react.hit(fx, fz, part, strength); }
  /** a swing connected with something solid: the impact jars back up the arms */
  impact(strength = 0.6) { this.react.recoil(strength); }
  /** foot landings so far (footstep sounds / prints) */
  get steps() { return this.gait.steps; }
  /** which foot landed last (0 left, 1 right) */
  get lastFoot() { return this.gait.lastFoot; }
  /** forget the planted feet (teleports) */
  resetFeet() { this.gait.reset(); }

  update(dt: number, inp: AnimInput): Pose {
    dt = dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt;
    const D = this.dims ?? defaultDims();
    const lod = inp.lod ?? 0;
    // ---------------- feet: planted in the world, stepping at a cadence matched to ground speed
    this.gaitFrame(dt, inp, D);
    this.gait.update(this.gf, D);
    this.phase = this.gait.cyc * Math.PI * 2;
    // ---------------- layered pose (one-armed with the right hand gone: animate the mirror image)
    const mir = !!inp.limbs?.mirror;
    const p = mir ? mirrorPose(this.layers(dt, mirrorInput(inp), true)) : this.layers(dt, inp, false);
    if (mir) this.swapSides();
    this.lastHipX = p.rootX ?? 0; this.lastHipZ = p.rootZ ?? 0;
    // ---------------- crossfade any discrete switch (inertialization)
    this.inertialize(p, dt, inp);
    // ---------------- look-at, hit reactions, momentum
    if (lod < 2) this.lookAt(p, dt, inp, D);
    this.react.apply(p, dt);
    this.balance(p, dt, inp);
    // ---------------- IK: feet on the ground, hands on things
    const kr = 1 - Math.exp(-this.ikRate * dt);
    this.ikL += (this.ikTL - this.ikL) * kr; this.ikR += (this.ikTR - this.ikR) * kr;
    const kw = 1 - Math.exp(-10 * dt);
    this.reachWL += (this.reachL.w - this.reachWL) * kw; this.reachWR += (this.reachR.w - this.reachWR) * kw;
    if (lod === 0) {
      // on the move the pelvis may only sink a little to reach (a stretched trailing foot peels off instead); standing it can drop down a step
      legIK(p, this.gait, D, { wL: this.ikL, wR: this.ikR, stiffL: this.stiffL, stiffR: this.stiffR, dt, maxDrop: lerp(0.3, 0.07 + 0.03 * this.sneakW, this.walkW) * D.s });
      if (this.reachWL > 0.01 || this.reachWR > 0.01) {
        chestFrame(p, D);
        this.doReach(p, D, 'L', this.reachL, this.reachWL);
        this.doReach(p, D, 'R', this.reachR, this.reachWR);
      }
      // ---------------- secondary motion: backpack and hair swing with the body
      const yaw = this.gf.yaw, c = Math.cos(yaw), s = Math.sin(yaw);
      const rx = p.rootX ?? 0, rz = p.rootZ ?? 0;
      const g = this.gait;
      this.sec.update(dt, g.trkX + c * rx + s * rz, (this.gf.wy || 0) + D.hipY + (p.rootY ?? 0), g.trkZ - s * rx + c * rz, yaw, this.gait.turn,
        (p.head?.[1] ?? 0) + (p.neck?.[1] ?? 0));
      p.pack = this.sec.pack; p.packY = this.sec.packY; p.hair = this.sec.hair;
    } else this.gait.drop = 0;
    this.pose = p;
    return p;
  }

  /** the mirrored layers asked for IK / reaches on the wrong side */
  private swapSides() {
    const t = this.ikTL; this.ikTL = this.ikTR; this.ikTR = t;
    const s = this.stiffL; this.stiffL = this.stiffR; this.stiffR = s;
    const a = this.reachL; this.reachL = this.reachR; this.reachR = a;
    for (const r of [this.reachL, this.reachR]) { if (r.space !== 3) r.x = -r.x; r.px = -r.px; }
  }

  // ================================================================ gait input
  private gaitFrame(dt: number, inp: AnimInput, D: LegDims) {
    const f = this.gf;
    f.dt = dt;
    f.world = inp.wx !== undefined && inp.wz !== undefined;
    f.wx = inp.wx ?? 0; f.wy = inp.wy ?? 0; f.wz = inp.wz ?? 0;
    if (inp.wyaw !== undefined) { f.yaw = inp.wyaw; this.vyaw = inp.wyaw; } else { this.vyaw += (inp.turn ?? 0) * dt; f.yaw = this.vyaw; }
    f.speed = inp.stance === 'swim' || inp.stance === 'crawl' ? 0 : inp.speed;
    f.moveYaw = inp.moveYaw ?? 0;
    f.ground = inp.ground;
    f.run = this.runW; f.sneak = this.sneakW;
    f.limp = clamp(inp.limp, 0, 1); f.limpR = inp.limpSide === 'R';
    f.drunk = clamp(inp.drunk ?? 0, 0, 1);
    f.tired = clamp(Math.max(inp.tired * 0.6, inp.exhausted ?? 0), 0, 1);
    f.hipX = this.lastHipX + this.react.hipX; f.hipZ = this.lastHipZ + this.react.hipZ;
    const g = inp.limbs?.gait;
    f.active = !inp.full && (inp.stance === 'stand' || inp.stance === 'sneak') && g !== 'hop' && g !== 'crutch' && g !== 'crawl' && !NO_IK.has(inp.action);
    f.restless = clamp((inp.panic - 0.4) * 1.2 + (inp.drunk ?? 0) * 0.6 + (inp.cold > 0.5 ? 0.3 : 0), 0, 1);
    // where the feet settle when standing (root space): x, z, yaw per foot
    const s = D.s, st = f.stance, a = inp.action;
    let wL = 0.1 * s, wR = 0.1 * s, zL = 0, zR = 0, yL = 0.12, yR = -0.12;
    if (a && AIM_ACTS.has(a)) { wL = 0.12 * s; zL = 0.11 * s; yL = 0.25; wR = 0.12 * s; zR = -0.15 * s; yR = -0.55; }
    else if (a === 'push') { wL = 0.1 * s; zL = -0.14 * s; wR = 0.11 * s; zR = -0.36 * s; yR = -0.2; }
    else if (a === 'drag') { wL = 0.12 * s; zL = 0.16 * s; wR = 0.12 * s; zR = -0.05 * s; }
    else if (a === 'smash') { wL = 0.15 * s; zL = 0.09 * s; yL = 0.3; wR = 0.15 * s; zR = -0.1 * s; yR = -0.4; }
    else if (a === 'kick_obj') { wL = 0.08 * s; zL = -0.06 * s; yL = 0.25; }
    else if (a === 'fall_land') { wL = 0.15 * s; wR = 0.15 * s; zL = 0.05 * s; }
    else if (this.sneakW > 0.5) { wL = 0.14 * s; wR = 0.14 * s; zL = 0.05 * s; zR = -0.05 * s; }
    else if (this.idleT > 0.5 && Math.abs(this.weight) > 0.5) {
      // weight on one leg: the free foot rests a little forward and turned out
      if (this.weight > 0) { zR = 0.06 * s; wR = 0.12 * s; yR = -0.3; } else { zL = 0.06 * s; wL = 0.12 * s; yL = 0.3; }
    }
    if (inp.panic > 0.5) { wL *= 0.85; wR *= 0.85; }
    st[0] = wL; st[1] = zL; st[2] = yL; st[3] = -wR; st[4] = zR; st[5] = yR;
  }

  // ================================================================ crossfades
  private inertialize(p: Pose, dt: number, inp: AnimInput) {
    const em = this.emote ? this.emote.name : inp.action?.startsWith('emote:') ? inp.action : '';
    const act = inp.action?.startsWith('emote:') ? '' : inp.action || '';
    const mode = (this.oneLeg ? 'h' : '') + (inp.limbs?.mirror ? 'm' : '') + (inp.holdingLight ? 'l' : '');
    const sw = act !== this.kAct || inp.full !== this.kFull || em !== this.kEm || inp.stance !== this.kSt || mode !== this.kMode;
    this.kAct = act; this.kFull = inp.full; this.kEm = em; this.kSt = inp.stance; this.kMode = mode;
    const cur = this.xCur;
    let i = 0;
    for (const j of ALL) { const v = p[j]; cur[i++] = v ? v[0] : 0; cur[i++] = v ? v[1] : 0; cur[i++] = v ? v[2] : 0; }
    for (const k of XF_SC) { const v = (p as any)[k]; cur[i++] = v ?? (k === 'gripL' || k === 'gripR' ? 0.3 : 0); }
    if (sw && this.xHas) {
      for (let c = 0; c < NCH; c++) this.xOff[c] = wrapPi(this.xPrev[c] - cur[c]);
      this.xT = 0;
    }
    const W = 13;
    const k = (1 + W * this.xT) * Math.exp(-W * this.xT);
    this.xT += dt;
    if (k > 0.002) {
      for (let c = 0; c < NCH; c++) cur[c] += this.xOff[c] * k;
      i = 0;
      for (const j of ALL) { set(p, j, cur[i], cur[i + 1], cur[i + 2]); i += 3; }
      for (const s of XF_SC) (p as any)[s] = cur[i++];
    }
    this.xPrev.set(cur);
    this.xHas = true;
  }

  // ================================================================ look-at
  private lookAt(p: Pose, dt: number, inp: AnimInput, D: LegDims) {
    let yaw = 0, pitch = 0, w = 0;
    if (inp.lookW && inp.lookX !== undefined && inp.lookZ !== undefined && inp.wx !== undefined) {
      const ry = inp.wyaw ?? 0, c = Math.cos(ry), s = Math.sin(ry);
      const dx = inp.lookX - inp.wx, dz = inp.lookZ - (inp.wz ?? 0);
      const lx = c * dx - s * dz, lz = s * dx + c * dz;
      const hd = Math.hypot(lx, lz);
      yaw = Math.atan2(lx, lz);
      const eye = (inp.wy ?? 0) + 1.58 * D.s;
      pitch = Math.atan2((inp.lookY ?? eye) - eye, Math.max(0.35, hd));
      w = clamp(inp.lookW, 0, 1) * (Math.abs(yaw) > 2.2 ? 0.25 : 1);
    }
    if (this.fullW > 0.5 || inp.full) w = 0;
    yaw = clamp(yaw, -1.45, 1.45); pitch = clamp(pitch, -0.55, 0.65);
    this.lkW += (w - this.lkW) * (1 - Math.exp(-5 * dt));
    if (w > 0.05) {
      this.lk[0] = spring(this.lk[0], this.lkV, 0, yaw, 12, dt, 0.85);
      this.lk[1] = spring(this.lk[1], this.lkV, 1, pitch, 10, dt, 0.9);
    }
    const W = this.lkW;
    if (W < 0.01) return;
    const y = this.lk[0] * W, pt = -this.lk[1] * W;
    add(p, 'chest', 0, y * 0.18, 0); add(p, 'neck', pt * 0.35, y * 0.3, 0); add(p, 'head', pt * 0.65, y * 0.52, 0);
  }

  // ================================================================ momentum: lean into starts, back on stops, bank into turns
  private balance(p: Pose, dt: number, inp: AnimInput) {
    const up = (1 - this.fullW) * (1 - Math.max(this.swimW, this.crawlW)) * (this.oneLeg ? 0.5 : 1);
    const g = this.gait;
    const leanT = clamp(g.acc * 0.012, -0.07, 0.1) * up;
    const bankT = clamp(-g.v * g.turn * 0.02, -0.16, 0.16) * up;
    this.bal[0] = spring(this.bal[0], this.balV, 0, leanT, 8, dt, 0.65);
    this.bal[1] = spring(this.bal[1], this.balV, 1, bankT, 8, dt, 0.75);
    p.bodyPitch = (p.bodyPitch ?? 0) + this.bal[0];
    p.bodyRoll = (p.bodyRoll ?? 0) + this.bal[1];
    // turning on the spot: the head leads into the turn
    if (!g.moving && up > 0.5) add(p, 'head', 0, clamp(g.turn * 0.1, -0.4, 0.4), 0);
    void inp;
  }

  // ================================================================ hands
  private doReach(p: Pose, D: LegDims, side: 'L' | 'R', r: Reach, w: number) {
    if (w <= 0.01) return;
    const s = D.s;
    if (r.space === 0) _tv.set(r.x * s, r.y * s, r.z * s);
    else if (r.space === 1) chestPoint(r.x * s, r.y * s, r.z * s, _tv);
    else if (r.space === 2) hipsPoint(r.x * s, r.y * s, r.z * s, _tv);
    else armPoint(p, D, side === 'L' ? 'R' : 'L', r.seg, r.along, _tv);
    armIK(p, D, side, _tv.x, _tv.y, _tv.z, w, r.px, r.py, r.pz);
  }

  // ================================================================ the layered pose
  private layers(dt: number, inp: AnimInput, mir: boolean): Pose {
    this.time += dt;
    const t = this.time;
    const k8 = 1 - Math.exp(-8 * dt), k12 = 1 - Math.exp(-12 * dt);
    const sp = inp.speed;
    const moving = sp > 0.15;
    this.reachL.w = 0; this.reachR.w = 0;
    this.ikRate = 8;

    // ---------------- gait parameters
    const limp = clamp(inp.limp, 0, 1);
    this.walkW = lerp(this.walkW, moving ? clamp(sp / 1.6, 0, 1) : 0, k8);
    this.runW = lerp(this.runW, clamp((sp - 2.4) / 1.5, 0, 1), k8);
    this.sneakW = lerp(this.sneakW, inp.stance === 'sneak' ? 1 : 0, k8);
    this.crawlW = lerp(this.crawlW, inp.stance === 'crawl' ? 1 : 0, k8);
    this.swimW = lerp(this.swimW, inp.stance === 'swim' ? 1 : 0, k8);
    const w = this.walkW, r = this.runW, sn = this.sneakW;
    // the legs' phase comes from the planted-feet gait (half a turn round for a mirrored body)
    const ph = this.gait.armPh + (mir ? Math.PI : 0);

    // ---------------- base pose
    const p: Pose = resetPose(mir ? this.outM : this.out);
    const tired = clamp(inp.tired, 0, 1), panic = clamp(inp.panic, 0, 1), exh = clamp(inp.exhausted ?? 0, 0, 1);
    // breathing: faster and deeper when exhausted / panicking; the chest rises, the shoulders lift
    const brRate = 1.6 + exh * 4.5 + panic * 2.6 + r * 2;
    const brAmp = 0.018 + exh * 0.05 + r * 0.012 + panic * 0.015;
    const br = Math.sin(t * brRate) * brAmp;
    set(p, 'spine', br * 0.25, 0, 0);
    set(p, 'chest', -br * 0.7, 0, 0);
    set(p, 'neck', br * 0.35, 0, 0);
    set(p, 'uarmL', 0.03 - br * 0.3, 0, 0.07 + br * 0.6);
    set(p, 'uarmR', 0.03 - br * 0.3, 0, -0.07 - br * 0.6);
    set(p, 'farmL', -0.16, 0, 0);
    set(p, 'farmR', -0.16, 0, 0);
    set(p, 'handL', 0.05, 0, 0.06);
    set(p, 'handR', 0.05, 0, -0.06);
    p.gripL = 0.3; p.gripR = 0.3;
    p.rootX = 0;

    // ---------------- idle: weight shift, look-around, fidgets
    const idle = !moving && !inp.action && !inp.full && inp.stance === 'stand' && !this.emote;
    this.idleT = idle ? this.idleT + dt : 0;
    this.weightT -= dt;
    if (this.weightT <= 0) { this.weightT = 3 + hash(t + this.seed) * 5; this.weightTarget = hash(t * 1.7 + this.seed) < 0.5 ? -1 : 1; if (hash(t * 3.1) < 0.25) this.weightTarget = 0; }
    this.weight = lerp(this.weight, idle ? this.weightTarget : 0, 1 - Math.exp(-1.6 * dt));
    this.lookT -= dt;
    const nervous = panic > 0.3;
    if (this.lookT <= 0) {
      this.lookT = (nervous ? 0.45 : 2) + hash(t + 7 + this.seed) * (nervous ? 1.1 : 4);
      // frightened: quick glances, some of them right over the shoulder
      const over = nervous && hash(t * 3.7 + this.seed) < 0.35 * panic;
      this.lookTarget = over ? (hash(t * 1.3) < 0.5 ? -1 : 1) * (1.6 + panic * 0.6) : (hash(t * 5.3 + this.seed) - 0.5) * (nervous ? 1.8 : 0.9);
      if (!over && hash(t * 2.2) < 0.35) this.lookTarget = 0;
      this.lookPT = nervous ? (hash(t * 4.1) - 0.6) * 0.4 : (hash(t * 4.1) - 0.5) * 0.15;
    }
    const lookOn = 1 - this.lkW;
    this.look = lerp(this.look, (moving ? this.lookTarget * 0.25 : this.lookTarget) * lookOn, 1 - Math.exp(-(nervous ? 9 : 2.5) * dt));
    this.lookP = lerp(this.lookP, this.lookPT * lookOn, 1 - Math.exp(-4 * dt));
    const over = Math.max(0, Math.abs(this.look) - 0.9) * Math.sign(this.look);
    set(p, 'head', 0.04 + tired * 0.22 + exh * 0.15 + this.lookP, (this.look - over) * 0.7 + inp.lookYaw, 0);
    add(p, 'neck', 0, (this.look - over) * 0.3, 0);
    // looking over the shoulder takes the chest and spine round too
    if (over) { add(p, 'chest', 0, over * 0.45, 0); add(p, 'spine', 0, over * 0.3, 0); add(p, 'head', 0, over * 0.5, 0); }
    if (idle) {
      const ws = this.weight;
      // hip drops on the unloaded side, loaded knee locks, the other bends slightly
      set(p, 'hips', 0, ws * 0.04, ws * 0.05);
      p.rootX = ws * 0.025;
      add(p, 'spine', 0, -ws * 0.03, -ws * 0.035);
      add(p, 'chest', 0, 0, -ws * 0.02);
      const free = ws > 0 ? 'R' : 'L';
      add(p, ('thigh' + free) as JointName, -0.06 * Math.abs(ws), 0, (free === 'L' ? 1 : -1) * 0.02);
      add(p, ('shin' + free) as JointName, 0.16 * Math.abs(ws), 0, 0);
      add(p, ('foot' + free) as JointName, -0.1 * Math.abs(ws), (free === 'L' ? 1 : -1) * 0.15 * Math.abs(ws), 0);
      add(p, ('thigh' + (free === 'L' ? 'R' : 'L')) as JointName, 0, 0, -ws * 0.04);
      // a relaxed stance sits a little into the knees
      p.rootY = -0.012 - Math.abs(ws) * 0.008;
      // nobody stands still: the whole body sways slowly over the ankles, the trunk counters it, the arms hang loose and drift
      const sw = Math.min(1, this.idleT / 1.5);
      const sx = (Math.sin(t * 0.61 + this.seed) * 0.6 + Math.sin(t * 0.37 + this.seed * 2.1) * 0.4) * sw;
      const sz = (Math.sin(t * 0.47 + this.seed * 1.3) * 0.6 + Math.sin(t * 0.83) * 0.4) * sw;
      p.rootX = (p.rootX ?? 0) + sx * 0.008;
      p.rootZ = (p.rootZ ?? 0) + sz * 0.006;
      add(p, 'spine', -sz * 0.012, 0, -sx * 0.015);
      add(p, 'chest', 0, sx * 0.02, 0);
      add(p, 'farmL', -0.07 - Math.sin(t * 0.43 + 1) * 0.03 * sw, 0, 0);
      add(p, 'farmR', -0.07 - Math.sin(t * 0.39 + 2) * 0.03 * sw, 0, 0);
      add(p, 'uarmL', Math.sin(t * 0.5 + 0.5) * 0.02 * sw, 0, 0);
      add(p, 'uarmR', Math.sin(t * 0.47 + 2.5) * 0.02 * sw, 0, 0);
    }
    if (tired > 0.4) add(p, 'spine', 0.08 * tired, 0, 0);

    // ---------------- locomotion
    this.oneLeg = !!inp.limbs && (inp.limbs.gait === 'hop' || inp.limbs.gait === 'crutch');
    this.stiffL = !!inp.limbs && inp.limbs.pegL && inp.limbs.legL >= 2;
    this.stiffR = !!inp.limbs && inp.limbs.pegR && inp.limbs.legR >= 2;
    if (this.swimW > 0.01 || this.crawlW > 0.01) {
      const q: Pose = {};
      if (inp.stance === 'swim' || this.swimW > this.crawlW) {
        const s3 = Math.sin(t * 2.6);
        q.bodyPitch = 1.25; q.bodyY = 0.38; q.rootY = -0.2;
        set(q, 'uarmL', -1.9 + s3 * 0.9, 0, 0.35); set(q, 'uarmR', -1.9 - s3 * 0.9, 0, -0.35);
        set(q, 'farmL', -0.4 - Math.max(0, s3) * 0.6, 0, 0); set(q, 'farmR', -0.4 - Math.max(0, -s3) * 0.6, 0, 0);
        set(q, 'thighL', Math.sin(t * 5) * 0.35, 0, 0.05); set(q, 'thighR', -Math.sin(t * 5) * 0.35, 0, -0.05);
        set(q, 'shinL', 0.3, 0, 0); set(q, 'shinR', 0.3, 0, 0);
        set(q, 'head', -1.0, Math.sin(t * 1.3) * 0.2, 0);
        set(q, 'footL', 0.6, 0, 0); set(q, 'footR', 0.6, 0, 0);
      } else {
        // crawling: reach with alternate arms, drag the legs
        this.crawlPh = (this.crawlPh ?? 0) + (sp / 0.42) * Math.PI * 2 * dt;
        const s = Math.sin(this.crawlPh), c = Math.cos(this.crawlPh);
        const go = clamp(sp / 0.3, 0, 1);
        q.bodyPitch = 1.42; q.bodyY = 0.13; q.rootY = -0.84;
        set(q, 'uarmL', -2.5 + s * 0.5 * go, 0, 0.35 + Math.max(0, c) * 0.2 * go); set(q, 'uarmR', -2.5 - s * 0.5 * go, 0, -0.35 - Math.max(0, -c) * 0.2 * go);
        set(q, 'farmL', -0.5 - Math.max(0, -s) * 0.7 * go, 0, 0); set(q, 'farmR', -0.5 - Math.max(0, s) * 0.7 * go, 0, 0);
        set(q, 'thighL', 0.1 - s * 0.3 * go, 0, 0.12); set(q, 'thighR', 0.1 + s * 0.3 * go, 0, -0.12);
        set(q, 'shinL', 0.3 + Math.max(0, s) * 0.6 * go, 0, 0); set(q, 'shinR', 0.3 + Math.max(0, -s) * 0.6 * go, 0, 0);
        set(q, 'footL', 0.9, 0, 0); set(q, 'footR', 0.9, 0, 0);
        set(q, 'head', -1.05, s * 0.1, 0); set(q, 'chest', 0, s * 0.1 * go, 0); set(q, 'hips', 0, -s * 0.08 * go, 0);
        q.gripL = 0.6; q.gripR = 0.6;
      }
      const qw = Math.max(this.swimW, this.crawlW);
      blend(p, q, qw, ALL);
      for (const k of SCALARS) if (q[k] !== undefined) (p as any)[k] = lerp((p as any)[k] ?? 0, q[k] as number, qw);
    } else if (this.oneLeg) {
      this.oneLegged(p, inp, dt, sp, moving);
    } else {
      // walk / run / sneak (left leg forward when sin(ph) > 0); the legs below are the
      // fallback for distant rigs: up close the feet are planted by IK
      const sL = Math.sin(ph), cL = Math.cos(ph);
      const injL = limp > 0.05 && inp.limpSide !== 'R', injR = limp > 0.05 && inp.limpSide === 'R';
      const thA = (0.42 + r * 0.38) * w * (1 - sn * 0.2);
      const ampL = thA * (injL ? 1 - limp * 0.45 : 1), ampR = thA * (injR ? 1 - limp * 0.45 : 1);
      const leg = (side: 'L' | 'R', s: number, c: number, amp: number, inj: boolean) => {
        const thigh = -s * amp;
        const swing = Math.pow(Math.max(0, Math.cos(Math.atan2(s, c) + 0.35 * r)), 1.4);
        const stiff = side === 'L' ? this.stiffL : this.stiffR;
        const knee = (swing * (0.95 + r * 1.05) + Math.exp(-((Math.atan2(s, c) - 1.9) ** 2) * 3) * 0.16 * (1 - r)) * w * (inj ? 1 - limp * 0.55 : 1) * (stiff ? 0.12 : 1);
        const toeOff = Math.exp(-((Math.atan2(-s, -c) - 0.25) ** 2) * 6) * (0.45 + r * 0.25);
        const heel = Math.exp(-((Math.atan2(s, c) - 1.45) ** 2) * 8) * 0.28;
        const foot = -(thigh + knee) * 0.75 + (toeOff - heel) * w;
        add(p, ('thigh' + side) as JointName, thigh - sn * 0.62, 0, 0);
        add(p, ('shin' + side) as JointName, knee + sn * 1.05, 0, 0);
        add(p, ('foot' + side) as JointName, foot - sn * 0.42, 0, 0);
      };
      leg('L', sL, cL, ampL, injL);
      leg('R', -sL, -cL, ampR, injR);
      // pelvis: bob, yaw with the swinging leg, drop on the swing side, sway over the stance leg
      const bob = (lerp(0.022, -0.05, r) * Math.cos(2 * ph)) * w;
      add(p, 'hips', sn * 0.06, -sL * 0.11 * w * (1 - r * 0.35), -cL * 0.05 * w * (1 - r * 0.6));
      p.rootX = (p.rootX ?? 0) + -cL * 0.016 * w * (1 - r);
      // counter-rotate the trunk; lean into speed (and away from turns)
      this.lean = lerp(this.lean, clamp((inp.turn ?? 0) * sp * 0.02, -0.12, 0.12), k8);
      add(p, 'spine', r * 0.17 * w + sn * 0.32 + 0.03 * w, sL * 0.12 * w, cL * 0.03 * w + this.lean);
      add(p, 'chest', r * 0.06 * w, sL * 0.09 * w, 0);
      add(p, 'neck', 0, -sL * 0.06 * w, 0);
      add(p, 'head', -r * 0.12 * w - sn * 0.15, -sL * 0.08 * w, -cL * 0.02 * w);
      // arms swing opposite to the legs from the shoulder; the forearm follows through a beat later
      const armA = (0.34 + r * 0.46) * w * (1 - sn * 0.6) * (1 - exh * 0.4);
      const elbow = 0.2 + r * 1.15 * w + sn * 0.9;
      const lag = Math.sin(ph - 0.7);
      const hurtL = inp.armHurtL ?? 0, hurtR = inp.armHurtR ?? 0;
      add(p, 'uarmL', sL * armA * (1 - hurtL) - sn * 0.35, sL * 0.06 * w, 0.05 * w + r * 0.08);
      add(p, 'uarmR', -sL * armA * (1 - hurtR) - sn * 0.35, sL * 0.06 * w, -0.05 * w - r * 0.08);
      add(p, 'farmL', -elbow + 0.16 - Math.max(0, -lag) * (0.3 - r * 0.15) * w, 0, 0);
      add(p, 'farmR', -elbow + 0.16 - Math.max(0, lag) * (0.3 - r * 0.15) * w, 0, 0);
      add(p, 'handL', lag * 0.12 * w, 0, 0); add(p, 'handR', -lag * 0.12 * w, 0, 0);
      if (r > 0.3) { p.gripL = 0.85; p.gripR = 0.85; }
      if (sn > 0.3) { add(p, 'uarmL', 0, 0, 0.12 * sn); add(p, 'uarmR', 0, 0, -0.12 * sn); }
      // body height (running: sink into each stance, float in flight)
      let ry = bob - sn * 0.24 - limp * Math.max(0, injL ? -sL : sL) * 0.05 * w - 0.015 * w;
      ry += (-0.04 * this.gait.compress + 0.025 * this.gait.flight - 0.015) * r;
      if (inp.drunk) ry -= 0.02 * inp.drunk;
      p.rootY = (p.rootY ?? 0) * (1 - w) + ry;
      // limp: torso leans over the injured leg during its stance, the hip hikes on the other
      if (limp > 0.05) {
        add(p, 'spine', 0.05 * limp * w, 0, (injL ? 1 : -1) * Math.max(0, injL ? -sL : sL) * 0.14 * limp * w);
        add(p, 'hips', 0, 0, (injL ? -1 : 1) * Math.max(0, injL ? -sL : sL) * 0.06 * limp * w);
      }
    }

    // ---------------- condition body language
    if (exh > 0.25 && !moving && inp.stance === 'stand' && !inp.action && !inp.full) {
      // hands on knees, panting
      const e = clamp((exh - 0.25) / 0.5, 0, 1) * clamp(this.idleT / 0.6, 0, 1);
      const q: Pose = {};
      set(q, 'spine', 0.55, 0, 0); set(q, 'chest', 0.25 - br * 2, 0, 0); set(q, 'head', -0.45, this.look * 0.4, 0);
      set(q, 'uarmL', -0.45, 0, 0.12); set(q, 'uarmR', -0.45, 0, -0.12);
      set(q, 'farmL', -0.35, 0, 0); set(q, 'farmR', -0.35, 0, 0);
      set(q, 'thighL', -0.35, 0, 0.06); set(q, 'thighR', -0.35, 0, -0.06);
      set(q, 'shinL', 0.55, 0, 0); set(q, 'shinR', 0.55, 0, 0); set(q, 'footL', -0.2, 0, 0); set(q, 'footR', -0.2, 0, 0);
      q.gripL = 0.5; q.gripR = 0.5;
      blend(p, q, e, ALL);
      p.rootY = lerp(p.rootY ?? 0, -0.09, e);
      p.bodyPitch = (p.bodyPitch ?? 0) + 0.06 * e;
    } else if (exh > 0.4 && moving) {
      // dead on your feet: head hangs, shoulders roll forward, the feet barely clear the floor
      add(p, 'spine', 0.12 * exh, 0, 0); add(p, 'head', 0.15 * exh, 0, 0); add(p, 'chest', 0.08 * exh, 0, 0);
      add(p, 'uarmL', 0, 0, -0.04 * exh); add(p, 'uarmR', 0, 0, 0.04 * exh);
    }
    if (panic > 0.35) {
      // hunched, arms drawn in, trembling, quick shallow breaths
      const tr = (panic - 0.35) * 0.05;
      add(p, 'uarmL', Math.sin(t * 37) * tr, 0, -0.1 * panic); add(p, 'uarmR', Math.sin(t * 41 + 1) * tr, 0, 0.1 * panic);
      add(p, 'farmL', -0.3 * panic, 0, 0); add(p, 'farmR', -0.3 * panic, 0, 0);
      add(p, 'head', Math.sin(t * 29) * tr * 0.6, 0, Math.sin(t * 23) * tr * 0.5);
      add(p, 'chest', 0.1 * panic, 0, 0); add(p, 'spine', 0.06 * panic, 0, 0); add(p, 'neck', -0.08 * panic, 0, 0);
      if (!moving) p.rootY = (p.rootY ?? 0) - 0.03 * panic;
      p.gripL = 0.9; p.gripR = 0.9;
    }
    if (this.attackT > 0) {
      this.attackT -= dt; this.attackDur += dt;
      const e = clamp(this.attackT / 1.2, 0, 1) * clamp(this.attackDur / 0.5 + 0.2, 0, 1);
      const hv = Math.sin(t * 9.5), tr = Math.sin(t * 43) * 0.04 + Math.sin(t * 31 + 2) * 0.03;
      const q: Pose = {};
      set(q, 'spine', 0.32 + hv * 0.04, 0, 0); set(q, 'chest', 0.12 - hv * 0.09, 0, tr); set(q, 'neck', 0.1, 0, 0);
      set(q, 'head', 0.2 + tr, this.look * 0.6 + tr * 3, tr * 2);
      set(q, 'uarmR', -0.8 + tr, 0.5, -0.1); set(q, 'farmR', -2.05, 0, 0); set(q, 'handR', 0.3, 0, -0.3);   // hand clutching the chest
      set(q, 'uarmL', -1.05 + tr, -0.45, 1.3); set(q, 'farmL', -2.3 - tr * 2, 0, 0); set(q, 'handL', 0.4, 0, 0); // hand on the head
      set(q, 'thighL', -0.2, 0, 0.06); set(q, 'thighR', -0.2, 0, -0.06); set(q, 'shinL', 0.4 + tr, 0, 0); set(q, 'shinR', 0.4 - tr, 0, 0);
      set(q, 'footL', -0.2, 0, 0); set(q, 'footR', -0.2, 0, 0);
      blend(p, q, e * (moving ? 0.5 : 1), moving ? UPPER : ALL);
      if (!moving) p.rootY = lerp(p.rootY ?? 0, -0.07, e);
      p.gripL = 0.7; p.gripR = 0.9;
    }
    if (inp.cold > 0.2) {
      const c = inp.cold, sh = Math.sin(t * 42) * 0.025 * c;
      add(p, 'uarmL', -0.45 * c, 0, -0.32 * c + sh); add(p, 'farmL', -1.25 * c, 0.4 * c, 0);
      add(p, 'uarmR', -0.45 * c, 0, 0.32 * c - sh); add(p, 'farmR', -1.25 * c, -0.4 * c, 0);
      add(p, 'chest', 0.1 * c, 0, sh); add(p, 'head', 0.1 * c, 0, Math.sin(t * 37) * 0.02 * c); add(p, 'neck', 0.06 * c, 0, 0);
    }
    const drunk = inp.drunk ?? 0;
    if (drunk > 0.2) {
      // the floor tilts: slow sway of the whole body, a heavy head, a lurch now and then
      const d = drunk, lurch = Math.max(0, Math.sin(t * 0.43 + this.seed)) ** 6;
      add(p, 'spine', 0, 0, Math.sin(t * 0.9) * 0.06 * d + lurch * 0.08 * d);
      add(p, 'head', Math.sin(t * 0.7) * 0.08 * d + 0.06 * d, 0, Math.sin(t * 1.1) * 0.1 * d);
      p.bodyRoll = (p.bodyRoll ?? 0) + Math.sin(t * 0.61 + 1) * 0.045 * d + lurch * 0.05 * d;
      p.rootX = (p.rootX ?? 0) + Math.sin(t * 0.61 + 1) * 0.04 * d;
    }
    const sick = inp.sick ?? 0;
    if (sick > 0.3 && !inp.full) {
      // nausea: hunched, and now and then a retch that folds the body forward
      this.retchT -= dt;
      if (this.retchT < -1.1) this.retchT = 5 + hash(t + this.seed) * 9 / sick;
      const rt = this.retchT < 0 ? Math.sin(-this.retchT / 1.1 * Math.PI) : 0;
      add(p, 'spine', 0.1 * sick + rt * 0.45, 0, 0); add(p, 'chest', rt * 0.2, 0, 0); add(p, 'head', 0.08 * sick + rt * 0.25, 0, 0);
      if (rt > 0.05 && !moving) p.rootY = (p.rootY ?? 0) - rt * 0.08;
    }
    // injured arm: cradled against the stomach instead of swinging
    for (const side of ['L', 'R'] as const) {
      const h = side === 'L' ? inp.armHurtL ?? 0 : inp.armHurtR ?? 0;
      if (h < 0.3 || inp.action) continue;
      const k = side === 'L' ? 1 : -1;
      const q: Pose = {};
      set(q, ('uarm' + side) as JointName, -0.3, -k * 0.75, k * 0.08); set(q, ('farm' + side) as JointName, -1.6, 0, 0); set(q, ('hand' + side) as JointName, 0, 0, k * 0.3);
      blend(p, q, clamp((h - 0.3) * 2, 0, 1), side === 'L' ? ARM_L : ARM_R);
      if (side === 'L') p.gripL = 0.2; else p.gripR = 0.2;
    }
    if (inp.holdingLight && !inp.action) {
      set(p, 'uarmR', -0.75 + Math.sin(t * 2) * 0.02 + (p.uarmR?.[0] ?? 0) * 0.15, 0, -0.08);
      set(p, 'farmR', -0.4, 0, 0); set(p, 'handR', -0.1, 0, 0);
    }
    if (inp.holding) p.gripR = 0.95;
    if (inp.heldL) p.gripL = 0.95;
    // a bat, pipe or axe hangs from the fist pointing at the floor rather than jutting out forwards
    const wk = inp.weapon;
    if (inp.holding && !inp.holdingLight && (wk === 'blunt' || wk === 'axe' || wk === 'spear' || wk === 'tool') && !inp.twoHanded) {
      add(p, 'handR', 0.85, 0, 0); add(p, 'farmR', -0.25, 0, 0); add(p, 'uarmR', 0, 0, -0.06);
    }
    // a hand pressed to a bleeding wound (or a hungry stomach)
    const free = !inp.action && !inp.full && !this.emote && inp.stance !== 'swim' && inp.stance !== 'crawl' && !this.oneLeg && this.attackT <= 0;
    let clutch = free ? inp.clutch : undefined;
    if (free && !clutch && (inp.hunger ?? 0) > 0.55) {
      this.hungerT -= dt;
      if (this.hungerT < -2.2) this.hungerT = 7 + hash(t + this.seed * 2) * 10;
      if (this.hungerT < 0) { clutch = 'torso_l'; add(p, 'spine', 0.12 * Math.sin(-this.hungerT / 2.2 * Math.PI), 0, 0); }
    }
    if (clutch) this.clutchWound(p, clutch, inp, moving);

    // ---------------- fidgets
    if (idle && inp.fidget !== false && exh < 0.25 && panic < 0.35 && inp.cold < 0.3 && !clutch) {
      this.fidT -= dt;
      if (!this.fid && this.fidT <= 0 && this.idleT > 2.5) {
        const opts: Fidget[] = ['look', 'scratch', 'stretch', 'neck', 'shift', 'rub'];
        if (inp.hasWatch !== false) opts.push('watch', 'watch');
        if ((inp.hot ?? 0) > 0.3) opts.push('wipe', 'wipe');
        if (inp.holding) { const i = opts.indexOf('scratch'); if (i >= 0) opts.splice(i, 1); }
        const k = opts[Math.floor(hash(t + this.seed * 3) * opts.length)];
        this.fid = { k, t: 0, dur: k === 'stretch' ? 3.2 : k === 'watch' ? 2.4 : k === 'look' ? 3.5 : 2.2, side: hash(t * 9) < 0.5 ? 1 : -1 };
        this.fidT = 6 + hash(t * 4 + this.seed) * 10;
      }
    } else if (!idle) { this.fid = null; this.fidT = Math.max(this.fidT, 3); }
    if (this.fid) {
      const f = this.fid; f.t += dt;
      const u = f.t / f.dur;
      if (u >= 1) this.fid = null;
      else fidgetPose(p, f.k, u, f.side, t, !!inp.holding);
    }

    // ---------------- blinking
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 2 + hash(t + this.seed * 7) * 4.5 - panic * 1.5; }
    this.blink = Math.max(0, this.blink - dt);
    p.blink = this.blink > 0 ? 1 : tired > 0.75 ? 0.45 : 0;

    // ---------------- action layer
    let act = inp.action;
    // remote emotes arrive as 'emote:name'
    let emoteName: EmoteName | null = null, emoteU = 0;
    if (act && act.startsWith('emote:')) { emoteName = act.slice(6) as EmoteName; emoteU = inp.actionT; act = ''; }
    if (act === 'panic') { this.attackT = Math.max(this.attackT, 1.4); act = ''; } // mirrored panic attack
    if (act) { this.lastAction = act; if (act !== this.lastSwingAct && (act === 'swing' || act === 'swing2h' || act === 'stab')) { this.swingN++; } }
    this.lastSwingAct = act;
    this.actW = lerp(this.actW, act ? 1 : 0, 1 - Math.exp(-16 * dt));
    let ikT = 1;
    if (this.actW > 0.01 && this.lastAction) {
      const a = actionPose(this.lastAction, inp.actionT, inp.actionDur, inp, t, this.swingN);
      const mask = a.mask || UPPER;
      blend(p, a.pose, this.actW, mask);
      const P = a.pose;
      if (P.rootY !== undefined) p.rootY = lerp(p.rootY ?? 0, P.rootY, this.actW);
      if (P.rootZ !== undefined) p.rootZ = lerp(p.rootZ ?? 0, P.rootZ, this.actW);
      if (P.rootX !== undefined) p.rootX = lerp(p.rootX ?? 0, P.rootX, this.actW);
      if (P.bodyPitch !== undefined) p.bodyPitch = lerp(p.bodyPitch ?? 0, P.bodyPitch, this.actW);
      if (P.bodyRoll !== undefined) p.bodyRoll = lerp(p.bodyRoll ?? 0, P.bodyRoll, this.actW);
      if (P.bodyYaw !== undefined) p.bodyYaw = lerp(p.bodyYaw ?? 0, P.bodyYaw, this.actW);
      if (P.bodyY !== undefined) p.bodyY = lerp(p.bodyY ?? 0, P.bodyY, this.actW);
      if (P.gripL !== undefined) p.gripL = lerp(p.gripL ?? 0, P.gripL, this.actW);
      if (P.gripR !== undefined) p.gripR = lerp(p.gripR ?? 0, P.gripR, this.actW);
      if (P.blink !== undefined && this.actW > 0.5) p.blink = P.blink;
      if (act) this.actionReach(act, inp, t);
      if (act && NO_IK.has(act) && !(act === 'get_up' && inp.actionT / Math.max(0.1, inp.actionDur) > 0.82)) ikT = 0;
      if (act === 'kick_obj') {
        const T = Math.min(inp.actionDur || 0.85, 0.85), u = ((inp.actionT % T) + T) % T / T;
        this.ikTR = u > 0.1 && u < 0.9 ? 0 : 1; this.ikRate = 16;
      }
    }

    // ---------------- emotes
    if (this.emote && (moving || inp.action || inp.full || inp.stance !== 'stand')) this.emote = null;
    if (this.emote) {
      this.emote.t += dt;
      const D = EMOTE_DUR[this.emote.name];
      if (!this.emote.loop && this.emote.t >= D) this.emote = null;
    }
    const em = this.emote ? this.emote.name : emoteName;
    const emT = this.emote ? this.emote.t : emoteU;
    if (em) { this.lastEmote = em; this.emoteT = emT; }
    this.emoteW = lerp(this.emoteW, em ? 1 : 0, k12);
    if (this.emoteW > 0.01 && this.lastEmote) {
      const e = emotePose(this.lastEmote, this.emoteT, t);
      blend(p, e.pose, this.emoteW, e.mask);
      for (const s of SCALARS) if (e.pose[s] !== undefined) (p as any)[s] = lerp((p as any)[s] ?? 0, e.pose[s] as number, this.emoteW);
      if (LEG_EMOTES.has(this.lastEmote) && this.emoteW > 0.3) ikT = 0;
    }

    // ---------------- full-body states
    const full = inp.full;
    if (full !== this.prevFull) {
      // already on the ground (crawling, or downed before dying): skip the fall / collapse
      this.fullT = (full === 'downed' || full === 'dead') && (this.crawlW > 0.3 || this.prevFull === 'downed') ? 5 : 0;
      this.prevFull = full;
    }
    this.fullT += dt;
    if (full) this.lastFull = full;
    this.fullW = lerp(this.fullW, full ? 1 : 0, 1 - Math.exp(-(full === 'dead' || full === 'downed' ? 14 : 8) * dt));
    if (this.fullW > 0.01 && this.lastFull) {
      const f = fullPose(this.lastFull, t, this.fullT, inp);
      const wgt = this.fullW;
      blend(p, f, wgt, ALL);
      for (const s of SCALARS) (p as any)[s] = lerp((p as any)[s] ?? 0, (f as any)[s] ?? (s === 'gripL' || s === 'gripR' ? 0.3 : 0), wgt);
    }
    if (full || this.fullW > 0.5 || this.swimW > 0.3 || this.crawlW > 0.3 || this.oneLeg) ikT = 0;
    if (inp.unconscious || full === 'dead' || full === 'lie' || full === 'lie_side') p.blink = 1;
    if (act !== 'kick_obj') this.ikTR = ikT;
    else if (ikT === 0) this.ikTR = 0;
    this.ikTL = ikT;
    if (ikT === 0) { this.reachL.w = 0; this.reachR.w = 0; }
    return p;
  }

  /** hand to a wound: the free hand (or the other one, for an arm wound) presses on it */
  private clutchWound(p: Pose, part: string, inp: AnimInput, moving: boolean) {
    const m = part.match(/^(uarm|farm|hand|thigh|shin|foot)_(l|r)$/);
    const busyR = inp.holding || inp.holdingLight, busyL = !!inp.heldL;
    const w = moving ? 0.6 : 0.9;
    if (m && (m[1] === 'uarm' || m[1] === 'farm' || m[1] === 'hand')) {
      // the other hand grips the wounded arm
      const hurt = m[2] === 'l' ? 'L' : 'R', helper = hurt === 'L' ? 'R' : 'L';
      if ((helper === 'R' && busyR) || (helper === 'L' && busyL)) return;
      const r = helper === 'L' ? this.reachL : this.reachR;
      r.to(w, 0, 0, 0, 3); r.seg = m[1] === 'uarm' ? 0 : 1; r.along = m[1] === 'hand' ? 0.95 : 0.55;
      r.pole(helper === 'L' ? 0.5 : -0.5, -0.6, -0.3);
      // the hurt arm is drawn in across the body
      add(p, ('uarm' + hurt) as JointName, -0.25, 0, hurt === 'L' ? -0.05 : 0.05); add(p, ('farm' + hurt) as JointName, -0.9, 0, 0);
      add(p, 'spine', 0.08, 0, 0); add(p, 'head', 0.15, hurt === 'L' ? 0.25 : -0.25, 0);
      return;
    }
    if (m) {
      // a leg wound: the same-side hand down on the thigh, bent over it
      const S = m[2] === 'l' ? 'L' : 'R', k = S === 'L' ? 1 : -1;
      if ((S === 'R' && busyR) || (S === 'L' && busyL)) return;
      const r = S === 'L' ? this.reachL : this.reachR;
      r.to(w * 0.85, k * 0.1, m[1] === 'thigh' ? -0.22 : -0.33, 0.09, 2).pole(k * 0.7, 0.1, -0.4);
      add(p, 'spine', 0.22, 0, k * 0.08); add(p, 'chest', 0.08, 0, 0); add(p, 'head', 0.2, 0, 0);
      return;
    }
    const side = busyL && !busyR ? 'R' : busyR && !busyL ? 'L' : 'L';
    if ((side === 'R' && busyR) || (side === 'L' && busyL)) return;
    const k = side === 'L' ? 1 : -1;
    const r = side === 'L' ? this.reachL : this.reachR;
    if (part === 'head' || part === 'neck') r.to(w, k * 0.07, part === 'head' ? 0.44 : 0.33, 0.07, 1).pole(k * 0.9, -0.3, 0.1);
    else if (part === 'torso_u') r.to(w, k * 0.02, 0.06, 0.17, 1).pole(k * 0.7, -0.6, -0.1);
    else r.to(w, k * 0.02, -0.12, 0.17, 1).pole(k * 0.7, -0.6, -0.1);
    add(p, 'spine', part === 'torso_l' || part === 'groin' ? 0.16 : 0.07, 0, 0);
    add(p, 'head', 0.12, 0, 0);
    if (side === 'L') p.gripL = 0.35; else p.gripR = 0.35;
  }

  /** hand targets for contact actions (pushing, dragging, eating, drinking) */
  private actionReach(act: string, inp: AnimInput, t: number) {
    const L = this.reachL, R = this.reachR;
    const fl = inp.limbs;
    if (act === 'push') {
      const heave = Math.sin(t * 5.5) * 0.015;
      L.to(0.95, 0.19, 1.08, 0.68 + heave).pole(0.6, -0.7, -0.3); R.to(0.95, -0.19, 1.06, 0.68 + heave).pole(-0.6, -0.7, -0.3);
    } else if (act === 'drag') {
      const tug = Math.max(0, Math.sin(t * 4.2)) * 0.03;
      L.to(0.95, 0.17, 0.8, 0.5 - tug).pole(0.6, -0.4, -0.6); R.to(0.95, -0.17, 0.8, 0.5 - tug).pole(-0.6, -0.4, -0.6);
    } else if (act === 'pickup') {
      // the hand goes down for it, in front of the feet, at the bottom of the dip
      const u = clamp(inp.actionT / Math.max(0.2, inp.actionDur), 0, 1), d = Math.sin(u * Math.PI);
      R.to(0.85 * d, -0.12, 0.1 + (1 - d) * 0.5, 0.42).pole(-0.7, -0.2, -0.7);
    } else if (act === 'eat') {
      const c = (t / 1.6) % 1;
      const up = c < 0.25 ? ease(c / 0.25) : c < 0.6 ? 1 : 1 - ease((c - 0.6) / 0.3);
      R.to(0.9, lerp(-0.08, -0.03, up), lerp(0.02, 0.28, up), lerp(0.26, 0.16, up), 1).pole(-0.8, -0.5, -0.3);
    } else if (act === 'drink') {
      const c = (t / 3) % 1;
      const up = c < 0.17 ? ease(c / 0.17) : c < 0.78 ? 1 : 1 - ease((c - 0.78) / 0.22);
      R.to(0.9, lerp(-0.1, -0.03, up), lerp(0.0, 0.33, up), lerp(0.25, 0.15, up), 1).pole(-0.8, -0.4, -0.3);
    }
    // a missing hand cannot hold on
    if (fl) { if (fl.armL >= 1 && !fl.hookL) L.w = 0; if (fl.armR >= 1 && !fl.hookR) R.w = 0; }
  }
}

export interface HumanAnimator {
  /** hopping on one leg, or swinging through on crutches (limb loss) */
  oneLegged(p: Pose, inp: AnimInput, dt: number, sp: number, moving: boolean): void;
  crawlPh?: number;
}

HumanAnimator.prototype.oneLegged = function (this: HumanAnimator & { hopPh?: number }, p: Pose, inp: AnimInput, dt: number, sp: number, moving: boolean) {
  const L = inp.limbs!;
  // the leg you cannot stand on (missing, no prosthetic) and the good one
  const M: 'L' | 'R' = L.legL > 0 && !L.pegL ? 'L' : 'R';
  const G: 'L' | 'R' = M === 'L' ? 'R' : 'L';
  const gs = G === 'L' ? 1 : -1;
  const lvM = M === 'L' ? L.legL : L.legR;
  const crutch = L.gait === 'crutch';
  const both = L.crutchL && L.crutchR;
  const stride = crutch ? 0.8 : 0.42;
  this.hopPh = (this.hopPh ?? 0) + (moving ? (sp / stride) * Math.PI * 2 * dt : 0);
  const h = this.hopPh, s = Math.sin(h), c = Math.cos(h);
  const w = clamp(sp / 0.6, 0, 1);
  const T = (x: 'L' | 'R', j: 'thigh' | 'shin' | 'foot') => (j + x) as JointName;
  // the stump leg: tucked up out of the way (a whole-leg loss has no thigh to tuck)
  if (lvM < 3) { add(p, T(M, 'thigh'), -0.38 - (moving ? 0.08 * s * w : 0), 0, -gs * 0.04); if (lvM < 2) { add(p, T(M, 'shin'), 1.05, 0, 0); add(p, T(M, 'foot'), 0.4, 0, 0); } }
  // weight over the good leg
  add(p, 'hips', 0, 0, gs * 0.06);
  p.rootX = (p.rootX ?? 0) + gs * 0.03;
  if (!crutch) {
    // hop: compress on landing, spring, straight in the air; arms out for balance
    const air = Math.max(0, s) * w, load = Math.max(0, -s) * w;
    add(p, T(G, 'thigh'), -0.12 - load * 0.38 + air * 0.12, 0, gs * 0.02);
    add(p, T(G, 'shin'), 0.12 + load * 0.75, 0, 0);
    add(p, T(G, 'foot'), -0.05 - load * 0.36 + air * 0.3, 0, 0);
    p.rootY = -0.03 + air * 0.08 - load * 0.1;
    const out = 0.22 + w * 0.2 + air * 0.25;
    add(p, 'uarmL', -0.2 * w + air * 0.2, 0, out); add(p, 'uarmR', -0.2 * w + air * 0.2, 0, -out);
    add(p, 'farmL', -0.3, 0, 0); add(p, 'farmR', -0.3, 0, 0);
    add(p, 'spine', 0.08 + 0.12 * w + load * 0.12, 0, gs * 0.06);
    add(p, 'head', -0.06 * w, 0, -gs * 0.04);
    return;
  }
  // crutches: plant them ahead with the stump, swing the good leg through
  const reach = moving ? -0.3 - 0.26 * s : -0.12;
  for (const side of ['L', 'R'] as const) {
    const has = side === 'L' ? L.crutchL : L.crutchR;
    const k = side === 'L' ? 1 : -1;
    if (has) {
      set(p, ('uarm' + side) as JointName, reach, 0, k * 0.07);
      set(p, ('farm' + side) as JointName, -0.12 - (moving ? Math.max(0, c) * 0.15 : 0), 0, 0);
      set(p, ('hand' + side) as JointName, 0.12, 0, -k * 0.04);
      if (side === 'L') p.gripL = 1; else p.gripR = 1;
    } else if (!both) {
      add(p, ('uarm' + side) as JointName, moving ? 0.2 * s * w : 0, 0, k * 0.05);
    }
  }
  if (moving) {
    const thigh = 0.28 * s - 0.08;
    const knee = Math.max(0, -c) * 0.75 * w + 0.08;
    add(p, T(G, 'thigh'), thigh * w, 0, 0);
    add(p, T(G, 'shin'), knee, 0, 0);
    add(p, T(G, 'foot'), -(thigh * w + knee) * 0.7, 0, 0);
    p.rootY = -0.035 - Math.abs(c) * 0.03 * w;
  } else p.rootY = -0.02;
  add(p, 'spine', 0.14 + 0.06 * w, 0, 0);
  add(p, 'chest', 0.04, 0, 0);
};

function blend(p: Pose, q: Pose, w: number, mask: JointName[]) {
  for (const j of mask) {
    const v = q[j]; if (!v) continue;
    const b = p[j];
    if (b) { b[0] += (v[0] - b[0]) * w; b[1] += (v[1] - b[1]) * w; b[2] += (v[2] - b[2]) * w; }
    else p[j] = [v[0] * w, v[1] * w, v[2] * w];
  }
}

// ------------------------------------------------------------------ fidgets
function fidgetPose(p: Pose, k: Fidget, u: number, side: number, t: number, holding: boolean) {
  const e = env(u, 0.25, 0.25);
  const q: Pose = {};
  let mask: JointName[] = UPPER;
  switch (k) {
    case 'look': {
      const yaw = Math.sin(u * Math.PI * 2) * 0.9 * side;
      set(q, 'head', 0.0, yaw, 0); set(q, 'neck', 0, yaw * 0.3, 0); set(q, 'chest', 0, yaw * 0.2, 0);
      mask = ['head', 'neck', 'chest'];
      break;
    }
    case 'scratch': {
      // right hand scratches the back of the head
      const sc = Math.sin(t * 16) * 0.12;
      set(q, 'uarmR', -0.9, 0.3, -1.45); set(q, 'farmR', -2.25 + sc, 0, 0); set(q, 'handR', 0.3, 0, 0);
      set(q, 'head', 0.18, 0.15, 0.12); q.gripR = 0.6;
      mask = ['uarmR', 'farmR', 'handR', 'head'];
      break;
    }
    case 'watch': {
      // left forearm raised across the chest, head down to the wrist
      set(q, 'uarmL', -0.55, -0.25, 0.2); set(q, 'farmL', -1.75, -0.9, 0); set(q, 'handL', 0, 0, 0.6);
      set(q, 'head', 0.42, 0.28, 0.05); set(q, 'chest', 0.05, 0.08, 0);
      mask = ['uarmL', 'farmL', 'handL', 'head', 'chest'];
      break;
    }
    case 'stretch': {
      const s = holding ? 0.6 : 1;
      set(q, 'uarmL', -2.8 * s, 0, 0.25); set(q, 'uarmR', -2.8 * s, 0, -0.25);
      set(q, 'farmL', -0.6, 0, 0); set(q, 'farmR', -0.6, 0, 0);
      set(q, 'spine', -0.12, 0, Math.sin(u * Math.PI * 2) * 0.12); set(q, 'chest', -0.1, 0, 0); set(q, 'head', -0.3, 0, 0);
      q.gripL = 0; q.gripR = holding ? 0.95 : 0;
      break;
    }
    case 'neck': {
      const a = u * Math.PI * 2;
      set(q, 'head', 0.25 * Math.cos(a), 0, 0.3 * Math.sin(a)); set(q, 'neck', 0.1 * Math.cos(a), 0, 0.1 * Math.sin(a));
      mask = ['head', 'neck'];
      break;
    }
    case 'shift': {
      set(q, 'chest', 0, 0, 0); set(q, 'spine', 0, 0.12 * side, 0); set(q, 'head', 0.05, -0.2 * side, 0);
      set(q, 'uarmL', 0.1, 0, 0.12); set(q, 'uarmR', 0.1, 0, -0.12); set(q, 'farmL', -0.25, 0, 0); set(q, 'farmR', -0.25, 0, 0);
      break;
    }
    case 'rub': {
      // rub the back of the neck with the left hand
      const sc = Math.sin(t * 9) * 0.1;
      set(q, 'uarmL', -1.0, -0.3, 1.2); set(q, 'farmL', -2.1 + sc, 0, 0); set(q, 'head', 0.25, 0, -0.1);
      mask = ['uarmL', 'farmL', 'handL', 'head'];
      break;
    }
    case 'wipe': {
      const sw = Math.sin(u * Math.PI * 3) * 0.3;
      set(q, 'uarmR', -1.5, 0.3, -0.5 + sw * 0.4); set(q, 'farmR', -1.9, sw, 0); set(q, 'head', -0.15, 0, 0);
      mask = ['uarmR', 'farmR', 'handR', 'head'];
      break;
    }
    case 'support': break;
  }
  blend(p, q, e, mask);
  if (q.gripL !== undefined) p.gripL = lerp(p.gripL ?? 0, q.gripL, e);
  if (q.gripR !== undefined) p.gripR = lerp(p.gripR ?? 0, q.gripR, e);
}

// ------------------------------------------------------------------ actions
function actionPose(a: ActionAnim, t: number, dur: number, inp: AnimInput, time: number, swingN: number): { pose: Pose; mask?: JointName[] } {
  const u = dur > 0 ? clamp(t / dur, 0, 1) : 0;
  const P: Pose = {};
  const ap = inp.aimPitch;
  const wk = inp.weapon || (inp.holding ? 'blunt' : 'unarmed');
  const two = inp.twoHanded;
  const stanceLegs = (k = 1) => { set(P, 'thighL', -0.18 * k, 0, 0.1 * k); set(P, 'shinL', 0.28 * k, 0, 0); set(P, 'footL', -0.1 * k, 0.2 * k, 0); set(P, 'thighR', 0.12 * k, 0, -0.1 * k); set(P, 'shinR', 0.22 * k, 0, 0); set(P, 'footR', -0.3 * k, -0.25 * k, 0); P.rootY = -0.04 * k; };
  const WITH_LEGS = [...UPPER, ...LEGS];
  switch (a) {
    case 'aim_melee': {
      if (wk === 'unarmed' && !inp.holding) {
        // boxing guard
        const bob = Math.sin(time * 5) * 0.03;
        set(P, 'uarmL', -0.75 + bob, -0.15, 0.32); set(P, 'farmL', -2.0, 0, 0); set(P, 'handL', 0.2, 0, 0.2);
        set(P, 'uarmR', -0.6 - bob, 0.15, -0.3); set(P, 'farmR', -2.15, 0, 0); set(P, 'handR', 0.2, 0, -0.2);
        set(P, 'chest', 0.08, -0.25, 0); set(P, 'spine', 0.08, 0, 0); set(P, 'head', 0.12, 0.2, 0);
        P.gripL = 1; P.gripR = 1; stanceLegs();
        return { pose: P, mask: WITH_LEGS };
      }
      if (wk === 'spear') {
        set(P, 'uarmR', -0.35, 0.2, -0.25); set(P, 'farmR', -1.25, 0.2, 0); set(P, 'handR', 1.35, 0, 0);
        set(P, 'uarmL', -1.05, -0.45, 0.2); set(P, 'farmL', -0.45, 0, 0); set(P, 'handL', 1.2, 0, 0);
        set(P, 'chest', 0.05, -0.35, 0); set(P, 'spine', 0.12, 0, 0); set(P, 'head', 0, 0.3, 0);
        P.gripL = 1; P.gripR = 1; stanceLegs(1.2);
        return { pose: P, mask: WITH_LEGS };
      }
      if (two || wk === 'axe') {
        // batting stance: hands together by the right shoulder, weapon up and back
        const sway = Math.sin(time * 3) * 0.04;
        set(P, 'uarmR', -0.5 + sway, 0.35, -0.55); set(P, 'farmR', -2.0, 0.3, 0); set(P, 'handR', -0.5, 0, 0);
        set(P, 'uarmL', -1.05 + sway, -0.75, 0.45); set(P, 'farmL', -1.5, 0, 0); set(P, 'handL', -0.4, 0, 0);
        set(P, 'chest', 0.04, -0.45, 0); set(P, 'spine', 0.1, -0.1, 0); set(P, 'head', 0.05, 0.45, 0);
        P.gripL = 1; P.gripR = 1; stanceLegs(1.1);
        return { pose: P, mask: WITH_LEGS };
      }
      if (wk === 'blade') {
        set(P, 'uarmR', -0.75, 0.1, -0.25); set(P, 'farmR', -1.15, 0, 0); set(P, 'handR', 0.9, 0, 0);
        set(P, 'uarmL', -0.95, -0.2, 0.35); set(P, 'farmL', -1.6, 0, 0);
        set(P, 'chest', 0.08, -0.2, 0); set(P, 'spine', 0.12, 0, 0); set(P, 'head', 0.08, 0.15, 0);
        P.gripR = 1; P.gripL = 0.5; stanceLegs();
        return { pose: P, mask: WITH_LEGS };
      }
      // one-handed blunt: weapon cocked over the shoulder, free arm guarding
      set(P, 'uarmR', -1.05, 0.3, -0.75); set(P, 'farmR', -1.75, 0, 0); set(P, 'handR', -0.7, 0, 0);
      set(P, 'uarmL', -0.75, -0.2, 0.35); set(P, 'farmL', -1.45, 0, 0);
      set(P, 'chest', 0.04, -0.3, 0); set(P, 'spine', 0.1, 0, 0); set(P, 'head', 0.05, 0.28, 0);
      P.gripR = 1; P.gripL = 0.8; stanceLegs();
      return { pose: P, mask: WITH_LEGS };
    }
    case 'swing': case 'swing2h': {
      const twoH = a === 'swing2h' || two;
      const overhead = wk === 'axe' || (!twoH && swingN % 3 === 2);
      // windup 0-0.32, strike 0.32-0.55, recover
      const wu = ease(u / 0.32), st = clamp((u - 0.32) / 0.23, 0, 1), rc = clamp((u - 0.55) / 0.45, 0, 1);
      const sk = st * st;
      if (overhead) {
        const arm = u < 0.32 ? lerp(-1.4, -2.9, wu) : u < 0.55 ? lerp(-2.9, -0.75, sk) : lerp(-0.75, -1.0, rc);
        const fore = u < 0.32 ? lerp(-1.2, -1.5, wu) : u < 0.55 ? lerp(-1.5, -0.15, sk) : lerp(-0.15, -0.8, rc);
        const bend = u < 0.32 ? lerp(0, -0.15, wu) : u < 0.55 ? lerp(-0.15, 0.4, sk) : lerp(0.4, 0.1, rc);
        const wr = u < 0.32 ? lerp(0, -0.4, wu) : u < 0.55 ? lerp(-0.4, 1.0, sk) : lerp(1.0, 0.4, rc);
        set(P, 'uarmR', arm, 0, -0.15); set(P, 'farmR', fore, 0, 0); set(P, 'handR', wr, 0, 0);
        if (twoH) { set(P, 'uarmL', arm + 0.15, -0.5, 0.35); set(P, 'farmL', fore, 0, 0); } else { set(P, 'uarmL', -0.5, 0, 0.35); set(P, 'farmL', -1.0, 0, 0); }
        set(P, 'spine', 0.08 + bend, 0, 0); set(P, 'chest', bend * 0.5, -0.1, 0); set(P, 'head', 0.1 + bend * 0.3, 0.1, 0);
        P.rootY = -0.06 * st;
      } else if (twoH) {
        // horizontal two-handed swing through keyframes: cocked, wound up, contact, follow-through
        const K2: [number, Record<string, V>][] = [
          [0, { uarmR: [-0.5, 0.35, -0.55], farmR: [-2.0, 0.3, 0], handR: [-0.5, 0, 0], uarmL: [-1.05, -0.75, 0.45], farmL: [-1.5, 0, 0], handL: [-0.4, 0, 0], chest: [0.04, -0.45, 0], spine: [0.1, -0.1, 0], hips: [0, 0, 0] }],
          [0.32, { uarmR: [-0.6, 0.5, -0.8], farmR: [-2.2, 0.3, 0], handR: [-0.7, 0, 0], uarmL: [-1.2, -0.95, 0.5], farmL: [-1.7, 0, 0], handL: [-0.6, 0, 0], chest: [0.04, -0.85, 0], spine: [0.12, -0.3, 0], hips: [0, -0.15, 0] }],
          [0.55, { uarmR: [-1.4, 0.55, 0.0], farmR: [-0.25, 0, 0], handR: [1.2, 0, 0], uarmL: [-1.45, -0.25, 0.2], farmL: [-0.3, 0, 0], handL: [1.2, 0, 0], chest: [0.06, 0.5, 0], spine: [0.14, 0.25, 0], hips: [0, 0.2, 0] }],
          [1, { uarmR: [-1.6, 0.9, 0.2], farmR: [-1.3, 0, 0], handR: [0.6, 0, 0], uarmL: [-0.9, -0.2, 0.6], farmL: [-1.4, 0, 0], handL: [0.4, 0, 0], chest: [0.04, 0.95, 0], spine: [0.1, 0.35, 0], hips: [0, 0.25, 0] }],
        ];
        let i = 0; while (i < K2.length - 2 && u > K2[i + 1][0]) i++;
        const [u0, a0] = K2[i], [u1, a1] = K2[i + 1];
        const f = (u - u0) / (u1 - u0);
        const kf = i === 1 ? f * f : ease(f);
        for (const jn of Object.keys(a0)) { const A = a0[jn], Bv = a1[jn]; set(P, jn as JointName, lerp(A[0], Bv[0], kf), lerp(A[1], Bv[1], kf), lerp(A[2], Bv[2], kf)); }
        set(P, 'head', 0.05, -(P.chest![1] * 0.6), 0);
        set(P, 'thighL', -0.2, 0, 0.12); set(P, 'shinL', 0.25, 0, 0); set(P, 'thighR', 0.15 - st * 0.1, 0, -0.12); set(P, 'shinR', 0.25 + st * 0.2, 0, 0); set(P, 'footR', -0.3 - st * 0.3, 0, 0);
        P.rootY = -0.05;
      } else {
        // diagonal side swing, forehand / backhand alternating
        const back = swingN % 2 === 1;
        const s0 = back ? 0.7 : -0.85, s1 = back ? -0.6 : 0.75;
        const tw = u < 0.32 ? lerp(-0.2, s0, wu) : u < 0.55 ? lerp(s0, s1, sk) : lerp(s1, 0, rc);
        const arm = u < 0.32 ? lerp(-1.1, -1.7, wu) : u < 0.55 ? lerp(-1.7, -1.15, sk) : lerp(-1.15, -1.0, rc);
        const ab = u < 0.32 ? lerp(-0.6, back ? 0.5 : -1.1, wu) : u < 0.55 ? lerp(back ? 0.5 : -1.1, back ? -0.9 : 0.35, sk) : lerp(back ? -0.9 : 0.35, -0.5, rc);
        const fore = u < 0.32 ? lerp(-1.4, -1.9, wu) : u < 0.55 ? lerp(-1.9, -0.25, sk) : lerp(-0.25, -1.0, rc);
        // the wrist snaps through the strike so the weapon leads the hand into the target
        const wr = u < 0.32 ? lerp(-0.2, -0.6, wu) : u < 0.55 ? lerp(-0.6, 1.3, sk) : lerp(1.3, 0.5, rc);
        set(P, 'uarmR', arm, 0.2, ab); set(P, 'farmR', fore, 0, 0); set(P, 'handR', wr, 0, 0);
        set(P, 'uarmL', -0.5, 0, 0.35); set(P, 'farmL', -1.2, 0, 0);
        set(P, 'chest', 0.05, tw * 0.6, 0); set(P, 'spine', 0.14, tw * 0.3, 0); set(P, 'head', 0.06, -tw * 0.4, 0);
        P.rootY = -0.04;
      }
      P.gripR = 1; if (twoH) P.gripL = 1;
      return { pose: P, mask: overhead || !twoH ? UPPER : WITH_LEGS };
    }
    case 'stab': {
      const k = u < 0.35 ? ease(u / 0.35) * -0.3 : u < 0.55 ? lerp(-0.3, 1, ease((u - 0.35) / 0.2)) : 1 - ease((u - 0.55) / 0.45);
      const kk = Math.max(0, k);
      if (wk === 'spear' || two) {
        set(P, 'uarmR', lerp(-0.35, -1.25, kk), 0.2, -0.2); set(P, 'farmR', lerp(-1.3, -0.15, kk), 0.2, 0); set(P, 'handR', 1.35, 0, 0);
        set(P, 'uarmL', lerp(-1.05, -1.5, kk), -0.4, 0.15); set(P, 'farmL', lerp(-0.5, -0.1, kk), 0, 0); set(P, 'handL', 1.2, 0, 0);
        set(P, 'chest', 0.05, lerp(-0.35, -0.1, kk), 0); set(P, 'spine', 0.12 + kk * 0.15, 0, 0);
        set(P, 'thighL', -0.3 - kk * 0.3, 0, 0.08); set(P, 'shinL', 0.3 + kk * 0.3, 0, 0); set(P, 'thighR', 0.2 + kk * 0.15, 0, -0.08); set(P, 'shinR', 0.2, 0, 0);
        P.rootY = -0.05 - kk * 0.05; P.gripL = 1; P.gripR = 1;
        return { pose: P, mask: WITH_LEGS };
      }
      set(P, 'uarmR', lerp(-0.55, -1.55, kk) + Math.min(0, k) * -0.6, 0.1, -0.15); set(P, 'farmR', lerp(-1.7, -0.05, kk), 0, 0); set(P, 'handR', 1.2, 0, 0);
      set(P, 'chest', 0.05, lerp(-0.35, 0.3, kk), 0); set(P, 'spine', 0.1 + kk * 0.12, 0, 0);
      set(P, 'uarmL', -0.5, 0, 0.3); set(P, 'farmL', -1.2, 0, 0);
      P.gripR = 1;
      return { pose: P };
    }
    case 'shove': {
      const k = u < 0.28 ? ease(u / 0.28) : 1 - ease((u - 0.28) / 0.72);
      set(P, 'uarmL', lerp(-0.6, -1.5, k), -0.2, 0.15); set(P, 'farmL', lerp(-1.6, -0.15, k), 0, 0); set(P, 'handL', -0.9 * k, 0, 0);
      set(P, 'uarmR', lerp(-0.6, -1.5, k), 0.2, -0.15); set(P, 'farmR', lerp(-1.6, -0.15, k), 0, 0); set(P, 'handR', -0.9 * k, 0, 0);
      set(P, 'spine', 0.2 * k, 0, 0); set(P, 'chest', 0.1 * k, 0, 0);
      set(P, 'thighL', -0.35 * k, 0, 0.05); set(P, 'shinL', 0.3 * k, 0, 0); set(P, 'thighR', 0.25 * k, 0, -0.05);
      P.rootY = -0.04 * k; P.gripL = 0; P.gripR = inp.holding ? 1 : 0;
      return { pose: P, mask: WITH_LEGS };
    }
    case 'aim_gun': case 'shoot': {
      const kick = a === 'shoot' ? (u < 0.12 ? u / 0.12 : 1 - ease((u - 0.12) / 0.88)) : 0;
      const sway = Math.sin(time * 1.3) * 0.015 * (1 + (inp.panic ?? 0) * 4) + Math.sin(time * 23) * 0.01 * (inp.panic ?? 0);
      set(P, 'uarmR', -1.5 - ap * 0.5 - kick * 0.3 + sway, 0.18, -0.08); set(P, 'farmR', -0.08 - kick * 0.3, 0, 0); set(P, 'handR', -0.05 + kick * 0.5, 0, 0);
      set(P, 'uarmL', -1.42 - ap * 0.5 - kick * 0.25 + sway, -0.62, 0.12); set(P, 'farmL', -0.22, 0.2, 0); set(P, 'handL', 0, 0, 0.5);
      set(P, 'chest', 0.02 - kick * 0.05, -0.12, 0); set(P, 'spine', 0.04, 0, 0); set(P, 'head', 0.05, 0.14, 0.04);
      P.gripR = 1; P.gripL = 0.8;
      stanceLegs(0.6);
      return { pose: P, mask: WITH_LEGS };
    }
    case 'torn_arm_l': case 'torn_arm_r': {
      const side = a.endsWith('_l') ? 'L' : 'R', o = side === 'L' ? 'R' : 'L', k = side === 'L' ? 1 : -1;
      const ripT = Math.max(0.3, dur - 0.7);
      const jerk = Math.sin(t * 24) * 0.05 + Math.sin(t * 13 + 1) * 0.05;
      if (t < ripT) {
        const pull = clamp(t / ripT, 0, 1);
        // the arm dragged out ahead, the body hauled forward but leaning back against it, the free hand clawing at it
        set(P, ('uarm' + side) as JointName, -1.4 - pull * 0.25 + jerk, 0, k * 0.15); set(P, ('farm' + side) as JointName, -0.05, 0, 0); set(P, ('hand' + side) as JointName, 0.3, 0, 0);
        set(P, ('uarm' + o) as JointName, -1.25 + jerk, k * 0.7, -k * 0.2); set(P, ('farm' + o) as JointName, -1.0 - jerk * 2, 0, 0); set(P, ('hand' + o) as JointName, 0.3, 0, 0);
        set(P, 'spine', -0.18 + pull * 0.12 + jerk * 0.6, k * 0.22, 0); set(P, 'chest', -0.06, k * 0.18, jerk); set(P, 'head', -0.3 + jerk, -k * 0.25, 0);
        set(P, ('thigh' + side) as JointName, -0.45 - jerk, 0, k * 0.08); set(P, ('shin' + side) as JointName, 0.35, 0, 0); set(P, ('foot' + side) as JointName, 0.1, 0, 0);
        set(P, ('thigh' + o) as JointName, 0.38, 0, -k * 0.08); set(P, ('shin' + o) as JointName, 0.35 + jerk, 0, 0); set(P, ('foot' + o) as JointName, -0.3, 0, 0);
        P.rootY = -0.08 - pull * 0.06; P.rootZ = 0.06 * pull + jerk * 0.4; P.gripL = 0.9; P.gripR = 0.9;
      } else {
        const r = ease((t - ripT) / 0.7);
        // it gives: staggering back, the stump clutched to the chest, doubled over
        set(P, ('uarm' + side) as JointName, -0.5, -k * 0.6, k * 0.1); set(P, ('farm' + side) as JointName, -1.7, 0, 0);
        set(P, ('uarm' + o) as JointName, -0.75, k * 0.85, -k * 0.25); set(P, ('farm' + o) as JointName, -1.9, 0, 0); set(P, ('hand' + o) as JointName, 0.3, 0, 0);
        set(P, 'spine', 0.15 + 0.4 * r, 0, 0); set(P, 'chest', 0.15, 0, 0); set(P, 'head', 0.35, 0, 0);
        set(P, 'thighL', -0.3 * r, 0, 0.06); set(P, 'shinL', 0.55 * r, 0, 0); set(P, 'thighR', -0.15 * r, 0, -0.06); set(P, 'shinR', 0.45 * r, 0, 0);
        P.rootY = -0.06 - 0.1 * r; P.rootZ = -0.12 * (1 - r) - 0.05; P.gripL = 1; P.gripR = 1;
      }
      return { pose: P, mask: ALL };
    }
    case 'torn_leg_l': case 'torn_leg_r': {
      const side = a.endsWith('_l') ? 'L' : 'R', o = side === 'L' ? 'R' : 'L', k = side === 'L' ? 1 : -1;
      const ripT = Math.max(0.3, dur - 0.7);
      const jerk = Math.sin(t * 22) * 0.06 + Math.sin(t * 11 + 2) * 0.05;
      const down = ease(clamp(t / 0.35, 0, 1));
      // yanked off your feet onto your back, the leg hauled out straight; you claw at the floor
      P.rootY = -0.62 * down; P.bodyPitch = -0.35 * down;
      set(P, ('thigh' + side) as JointName, -1.45 - jerk, 0, k * 0.1); set(P, ('shin' + side) as JointName, 0.05, 0, 0); set(P, ('foot' + side) as JointName, 0.3, 0, 0);
      set(P, ('thigh' + o) as JointName, -1.1, 0, -k * 0.2); set(P, ('shin' + o) as JointName, 1.5 + jerk, 0, 0); set(P, ('foot' + o) as JointName, -0.2, 0, 0);
      if (t < ripT) {
        P.rootZ = jerk * 0.6 + 0.08 * clamp(t / ripT, 0, 1);
        set(P, 'uarmL', 0.55 + jerk, 0, 0.45); set(P, 'uarmR', 0.55 - jerk, 0, -0.45); set(P, 'farmL', -0.35, 0, 0); set(P, 'farmR', -0.35, 0, 0);
        set(P, 'spine', -0.2, k * 0.15, 0); set(P, 'head', 0.25 + jerk, -k * 0.3, 0);
      } else {
        const r = ease((t - ripT) / 0.7);
        // curled around what is left, both hands on it
        set(P, 'uarmL', -0.9 * r, 0, 0.25); set(P, 'uarmR', -0.9 * r, 0, -0.25); set(P, 'farmL', -1.2 * r, 0, 0); set(P, 'farmR', -1.2 * r, 0, 0);
        set(P, 'spine', 0.45 * r, 0, 0); set(P, 'head', 0.5 * r, 0, 0);
        P.rootZ = -0.05;
      }
      P.gripL = 1; P.gripR = 1;
      return { pose: P, mask: ALL };
    }
    case 'aim_throw':
      set(P, 'uarmR', -2.5, 0.2, -0.45); set(P, 'farmR', -1.3, 0, 0); set(P, 'handR', -0.4, 0, 0);
      set(P, 'uarmL', -1.3, -0.3, 0.3); set(P, 'farmL', -0.3, 0, 0);
      set(P, 'chest', -0.05, -0.45, 0); set(P, 'spine', -0.04, -0.15, 0); set(P, 'head', 0, 0.5, 0);
      P.gripR = 1; stanceLegs(1.1);
      return { pose: P, mask: WITH_LEGS };
    case 'throw': {
      const k = u < 0.35 ? 0 : ease((u - 0.35) / 0.25);
      set(P, 'uarmR', lerp(-2.6, -0.7, k), 0.2, lerp(-0.45, 0.1, k)); set(P, 'farmR', lerp(-1.4, -0.1, k), 0, 0); set(P, 'handR', lerp(-0.4, 0.6, k), 0, 0);
      set(P, 'uarmL', lerp(-1.3, -0.2, k), 0, 0.3); set(P, 'farmL', -0.5, 0, 0);
      set(P, 'chest', 0.15 * k, lerp(-0.5, 0.45, k), 0); set(P, 'spine', 0.1 * k, lerp(-0.15, 0.2, k), 0);
      set(P, 'thighL', -0.3 * k, 0, 0.1); set(P, 'shinL', 0.3 * k, 0, 0); set(P, 'thighR', 0.2 * k, 0, -0.1);
      P.gripR = k > 0.5 ? 0 : 1;
      return { pose: P, mask: WITH_LEGS };
    }
    case 'eat': case 'drink': {
      // the hand (food / bottle in it) comes to the mouth by IK; the head meets it, chews, tips back to swallow
      const drink = a === 'drink';
      const cyc = drink ? (t / 3) % 1 : (t / 1.6) % 1;
      const up = drink ? (cyc < 0.17 ? ease(cyc / 0.17) : cyc < 0.78 ? 1 : 1 - ease((cyc - 0.78) / 0.22)) : (cyc < 0.25 ? ease(cyc / 0.25) : cyc < 0.6 ? 1 : 1 - ease((cyc - 0.6) / 0.3));
      const chew = drink ? 0 : Math.sin(time * 11) * 0.035 * (cyc > 0.3 ? 1 : 0.3);
      const gulp = drink ? Math.max(0, Math.sin(time * 4.5)) * 0.04 * up : 0;
      set(P, 'uarmR', -0.55 - up * 0.55, 0.35, -0.3); set(P, 'farmR', -1.4 - up * 0.85, 0, 0);
      set(P, 'handR', drink ? -0.25 - up * 0.65 : 0.15, 0, drink ? -0.2 : 0);
      set(P, 'head', drink ? 0.12 - up * 0.5 + gulp : 0.22 - up * 0.1 + chew, 0, 0);
      set(P, 'neck', drink ? -up * 0.15 : 0.05, 0, 0);
      set(P, 'uarmL', -0.12, 0.05, 0.1); set(P, 'farmL', -0.55, 0.15, 0); set(P, 'handL', 0.1, 0, 0.1);
      set(P, 'chest', drink ? -0.08 * up : 0.04, 0, 0); set(P, 'spine', drink ? -0.05 * up : 0.05, 0, 0);
      P.gripR = 0.9; P.gripL = 0.6;
      return { pose: P };
    }
    case 'pickup': case 'loot': {
      const pick = a === 'pickup';
      const d = pick ? Math.sin(u * Math.PI) : 1;
      const rum = pick ? 0 : Math.sin(t * 5);
      const q: Pose = {};
      q.rootY = -0.5 * d;
      set(q, 'spine', 0.55 * d, 0, 0); set(q, 'chest', 0.25 * d, rum * 0.08, 0); set(q, 'head', 0.25 * d, rum * 0.1, 0);
      set(q, 'uarmR', -1.0 * d + rum * 0.2, 0, -0.1); set(q, 'farmR', -0.5 - rum * 0.25, 0, 0);
      set(q, 'uarmL', -0.9 * d - rum * 0.2, 0, 0.1); set(q, 'farmL', -0.6 + rum * 0.25, 0, 0);
      set(q, 'thighL', -1.35 * d, 0, 0.12); set(q, 'shinL', 1.65 * d, 0, 0); set(q, 'footL', -0.3 * d, 0, 0);
      set(q, 'thighR', -0.45 * d, 0, -0.12); set(q, 'shinR', 1.9 * d, 0, 0); set(q, 'footR', 0.55 * d, 0, 0);
      q.gripR = pick && u > 0.5 ? 1 : 0.5; q.gripL = 0.5;
      return { pose: q, mask: [...UPPER, ...LEGS] };
    }
    case 'craft': case 'type': case 'bandage': case 'stitch': case 'mix': case 'cook': {
      const fast = a === 'type' ? 14 : a === 'stitch' ? 8 : a === 'mix' ? 6 : 4.5;
      const r = Math.sin(t * fast), r2 = Math.sin(t * fast * 0.5 + 1);
      set(P, 'uarmR', -0.62 + r2 * 0.05, 0.32, -0.12); set(P, 'farmR', -1.25 + r * 0.16, a === 'mix' ? r * 0.4 : 0, 0); set(P, 'handR', 0.2, 0, -0.2 + r * 0.1);
      set(P, 'uarmL', -0.62 - r2 * 0.05, -0.32, 0.12); set(P, 'farmL', -1.25 - r * 0.12, 0, 0); set(P, 'handL', 0.2, 0, 0.2);
      set(P, 'head', 0.48, r2 * 0.08, 0); set(P, 'spine', 0.14, 0, 0); set(P, 'chest', 0.06, 0, 0);
      P.gripR = a === 'type' ? 0.2 : 0.8; P.gripL = 0.6;
      return { pose: P };
    }
    case 'hammer': {
      const c = (t * 1.6) % 1;
      const hit = c < 0.55 ? ease(c / 0.55) : 1 - ease((c - 0.55) / 0.45) * 0.15;
      const up = c < 0.55 ? 1 - hit : 0;
      set(P, 'uarmR', -1.25 - up * 0.65, 0.1, -0.25); set(P, 'farmR', -1.5 + (1 - up) * 0.8, 0, 0); set(P, 'handR', -0.3 * up, 0, 0);
      set(P, 'uarmL', -1.0, -0.2, 0.25); set(P, 'farmL', -0.6, 0, 0);
      set(P, 'spine', 0.15, 0.08, 0); set(P, 'head', 0.3, 0.1, 0);
      P.gripR = 1; P.gripL = 0.8;
      return { pose: P };
    }
    case 'saw': {
      const r = Math.sin(t * 7);
      set(P, 'uarmR', -0.75 + r * 0.25, 0.1, -0.2); set(P, 'farmR', -1.2 + r * 0.6, 0, 0);
      set(P, 'uarmL', -0.7, -0.2, 0.3); set(P, 'farmL', -0.9, 0, 0);
      set(P, 'spine', 0.32, 0, 0); set(P, 'chest', 0, r * 0.06, 0); set(P, 'head', 0.3, 0, 0);
      P.gripR = 1; P.gripL = 0.9;
      return { pose: P };
    }
    case 'dig': {
      const c = (t * 0.9) % 1;
      const down = c < 0.4 ? ease(c / 0.4) : 1 - ease((c - 0.4) / 0.6);
      set(P, 'uarmR', -0.7 + down * 0.3, 0.2, -0.1); set(P, 'farmR', -0.6, 0, 0); set(P, 'uarmL', -1.1 + down * 0.5, -0.3, 0.15); set(P, 'farmL', -0.4, 0, 0);
      set(P, 'spine', 0.3 + down * 0.25, 0, 0); set(P, 'head', 0.25, 0, 0);
      set(P, 'thighL', -0.4 * down, 0, 0.05); set(P, 'shinL', 0.5 * down, 0, 0); set(P, 'thighR', -0.1, 0, -0.05); set(P, 'shinR', 0.3 * down, 0, 0);
      P.rootY = -0.08 * down; P.gripL = 1; P.gripR = 1;
      return { pose: P, mask: [...UPPER, ...LEGS] };
    }
    case 'pour':
      set(P, 'uarmR', -1.1, 0.25, -0.2); set(P, 'farmR', -0.7, 0, -0.9); set(P, 'head', 0.42, 0, 0); set(P, 'uarmL', -0.5, 0, 0.2); set(P, 'farmL', -1.2, 0, 0);
      P.gripR = 1;
      return { pose: P };
    case 'read':
      set(P, 'uarmR', -0.75, 0.38, -0.1); set(P, 'farmR', -1.65, 0, 0); set(P, 'handR', 0, 0, -0.4);
      set(P, 'uarmL', -0.75, -0.38, 0.1); set(P, 'farmL', -1.65, 0, 0); set(P, 'handL', 0, 0, 0.4);
      set(P, 'head', 0.5 + Math.sin(time * 0.4) * 0.03, 0, 0); P.gripL = 0.6; P.gripR = 0.6;
      return { pose: P };
    case 'scanner':
      set(P, 'uarmR', -0.62, 0.42, -0.05); set(P, 'farmR', -1.58, 0, 0); set(P, 'handR', 0, 0, 0.3);
      set(P, 'uarmL', -0.62, -0.42, 0.05); set(P, 'farmL', -1.58, 0, 0); set(P, 'handL', 0, 0, -0.3);
      set(P, 'head', 0.55, 0, 0); set(P, 'chest', 0.06, 0, 0); P.gripL = 0.8; P.gripR = 0.8;
      return { pose: P };
    case 'carry':
      // a survivor over the right shoulder (or a heavy load held to the chest)
      set(P, 'uarmR', -1.6, 0.3, -0.35); set(P, 'farmR', -1.55, 0, 0); set(P, 'uarmL', -0.5, 0.1, 0.25); set(P, 'farmL', -1.1, 0, 0);
      set(P, 'spine', 0.12, 0, -0.04); set(P, 'chest', 0, 0, -0.04); P.gripR = 1; P.gripL = 0.9;
      return { pose: P };
    case 'push': {
      // lean into it from the ankles, arms braced, palms flat (hands placed by IK); the feet scrabble behind
      const heave = Math.sin(time * 5.5);
      set(P, 'uarmR', -1.2, 0.12, -0.05); set(P, 'farmR', -0.3, 0, 0); set(P, 'uarmL', -1.2, -0.12, 0.05); set(P, 'farmL', -0.3, 0, 0);
      set(P, 'handR', -1.15, 0, 0.1); set(P, 'handL', -1.15, 0, -0.1);
      set(P, 'spine', 0.16 + heave * 0.025, 0, 0); set(P, 'chest', 0.08, 0, 0); set(P, 'neck', -0.1, 0, 0); set(P, 'head', -0.14, 0, 0);
      P.bodyPitch = 0.26; P.rootY = -0.07 + heave * 0.01; P.gripL = 0.05; P.gripR = 0.05;
      return { pose: P };
    }
    case 'hold_item':
      set(P, 'uarmR', -0.45, 0.1, -0.12); set(P, 'farmR', -1.05, 0, 0); P.gripR = 1;
      return { pose: P, mask: ARM_R };
    case 'hold_light':
      set(P, 'uarmR', -0.8, 0, -0.08); set(P, 'farmR', -0.38, 0, 0); P.gripR = 1;
      return { pose: P, mask: ARM_R };
    case 'flinch': {
      const k = Math.sin(u * Math.PI);
      set(P, 'chest', -0.35 * k, 0.2 * k, 0); set(P, 'head', -0.4 * k, 0, 0.2 * k);
      set(P, 'uarmL', -1.3 * k, -0.3 * k, 0.5 * k); set(P, 'farmL', -1.9 * k, 0, 0);
      set(P, 'uarmR', -0.4 * k, 0, -0.3 * k); set(P, 'farmR', -1.0 * k, 0, 0);
      return { pose: P };
    }
    case 'shiver': {
      const sh = Math.sin(time * 40) * 0.03;
      set(P, 'uarmL', -0.5, 0, -0.32 + sh); set(P, 'farmL', -1.45, 0.5, 0); set(P, 'uarmR', -0.5, 0, 0.32 - sh); set(P, 'farmR', -1.45, -0.5, 0);
      set(P, 'chest', 0.12, 0, sh); set(P, 'head', 0.15, 0, 0);
      return { pose: P };
    }
    case 'cough': {
      const k = Math.max(0, Math.sin(u * Math.PI * 3));
      set(P, 'chest', 0.35 * k, 0, 0); set(P, 'spine', 0.15 * k, 0, 0); set(P, 'head', 0.3 * k, 0, 0); set(P, 'uarmR', -1.2, 0.3, -0.3); set(P, 'farmR', -2.1, 0, 0);
      P.gripR = 0.8;
      return { pose: P };
    }
    case 'cover_ears':
      set(P, 'uarmR', -0.4, 0, -1.9); set(P, 'farmR', -2.4, 0, 0); set(P, 'uarmL', -0.4, 0, 1.9); set(P, 'farmL', -2.4, 0, 0); set(P, 'head', 0.35, 0, 0); set(P, 'spine', 0.2, 0, 0);
      P.gripL = 0.2; P.gripR = 0.2;
      return { pose: P };
    case 'wave': return emotePose('wave', t, time);
    case 'breathe': {
      // slow box breathing: hands on chest and belly, eyes closed, shoulders rise and fall
      const c = (t / 16) % 1, ph4 = Math.floor(c * 4), f = (c * 4) % 1;
      const fill = ph4 === 0 ? ease(f) : ph4 === 1 ? 1 : ph4 === 2 ? 1 - ease(f) : 0;
      set(P, 'chest', -0.08 * fill, 0, 0); set(P, 'neck', 0.05, 0, 0); set(P, 'head', 0.18 - fill * 0.12, 0, 0);
      set(P, 'uarmR', -0.5, 0.45, -0.1 - fill * 0.05); set(P, 'farmR', -1.75, 0, 0); set(P, 'handR', 0.2, 0, -0.4);
      set(P, 'uarmL', -0.3, -0.3, 0.12 + fill * 0.05); set(P, 'farmL', -1.4, 0, 0); set(P, 'handL', 0.2, 0, 0.4);
      P.gripL = 0.1; P.gripR = 0.1; P.blink = 1;
      return { pose: P };
    }
    case 'pray':
      set(P, 'uarmR', -0.6, 0.6, 0); set(P, 'farmR', -1.85, 0, 0); set(P, 'uarmL', -0.6, -0.6, 0); set(P, 'farmL', -1.85, 0, 0); set(P, 'head', 0.5, 0, 0);
      P.gripL = 0; P.gripR = 0;
      return { pose: P };
    case 'reload': {
      const r = Math.sin(u * Math.PI * 2);
      set(P, 'uarmR', -0.9, 0.35, -0.1); set(P, 'farmR', -1.3, 0, 0); set(P, 'handR', 0, 0, -0.5);
      set(P, 'uarmL', -0.75 + r * 0.3, -0.3, 0.1); set(P, 'farmL', -1.5, 0, 0);
      set(P, 'head', 0.45, -0.1, 0); P.gripR = 1; P.gripL = u > 0.3 && u < 0.7 ? 1 : 0.4;
      return { pose: P };
    }
    case 'drag': {
      // sitting back into the haul, arms long and gripping low (IK); a heave on every pull
      const tug = Math.max(0, Math.sin(time * 4.2));
      set(P, 'uarmR', -0.9, 0.15, -0.05); set(P, 'farmR', -0.2, 0, 0); set(P, 'uarmL', -0.9, -0.15, 0.05); set(P, 'farmL', -0.2, 0, 0);
      set(P, 'handR', 0.3, 0, 0); set(P, 'handL', 0.3, 0, 0);
      set(P, 'spine', 0.1 - tug * 0.08, 0, 0); set(P, 'chest', 0.04, 0, 0); set(P, 'head', 0.25, 0, 0);
      P.bodyPitch = -0.3 - tug * 0.06; P.rootY = -0.17 - tug * 0.03; P.gripL = 1; P.gripR = 1;
      return { pose: P };
    }
    case 'smash': {
      // overhead two-handed: wind up high, arching back, then slam down folding at the waist and knees
      const T = dur > 0.3 && dur < 1.2 ? dur : 0.95, u2 = ((t % T) + T) % T / T;
      const K: number[][] = [ // u, uarm, farm, hand, spine, head, dip
        [0, -1.25, -1.0, 0.1, 0.12, 0.1, -0.02],
        [0.42, -2.95, -0.8, -0.55, -0.24, -0.28, 0.0],
        [0.58, -0.7, -0.12, 0.65, 0.62, 0.38, -0.2],
        [0.72, -0.6, -0.2, 0.5, 0.56, 0.32, -0.18],
        [1, -1.25, -1.0, 0.1, 0.12, 0.1, -0.02],
      ];
      let i = 0; while (i < K.length - 2 && u2 > K[i + 1][0]) i++;
      const A = K[i], B = K[i + 1], f = clamp((u2 - A[0]) / (B[0] - A[0]), 0, 1);
      const kf = i === 1 ? f * f * f : ease(f);
      const L = (j: number) => lerp(A[j], B[j], kf);
      set(P, 'uarmR', L(1), 0.3, -0.1); set(P, 'uarmL', L(1), -0.3, 0.1);
      set(P, 'farmR', L(2), 0, 0); set(P, 'farmL', L(2), 0, 0);
      set(P, 'handR', L(3), 0, 0); set(P, 'handL', L(3), 0, 0);
      set(P, 'spine', L(4), 0, 0); set(P, 'chest', L(4) * 0.4, 0, 0); set(P, 'head', L(5), 0, 0);
      P.rootY = L(6); P.bodyPitch = L(4) * 0.12; P.gripL = 1; P.gripR = 1;
      return { pose: P };
    }
    case 'kick_obj': {
      // weight back over the left foot, the right knee chambers, the leg snaps out flat-footed and recoils
      const T = dur > 0.3 && dur < 1.2 ? dur : 0.85, u2 = ((t % T) + T) % T / T;
      const ch = u2 < 0.35 ? ease(u2 / 0.35) : u2 < 0.62 ? 1 : 1 - ease((u2 - 0.62) / 0.38);
      const ex = u2 < 0.35 ? 0 : u2 < 0.47 ? ease((u2 - 0.35) / 0.12) : u2 < 0.62 ? 1 - ease((u2 - 0.47) / 0.15) : 0;
      set(P, 'thighR', -1.5 * ch - 0.15 * ex, 0, -0.04); set(P, 'shinR', 1.9 * ch - 1.8 * ex, 0, 0); set(P, 'footR', 0.25 * ch - 0.65 * ex, 0, 0);
      set(P, 'thighL', 0.05 * ch, 0, 0.03); set(P, 'shinL', 0.15 * ch, 0, 0);
      set(P, 'spine', -0.16 * ch - 0.14 * ex, 0, 0); set(P, 'head', 0.25 * ch, 0, 0);
      set(P, 'uarmL', -0.5 * ch, 0, 0.55 * ch); set(P, 'uarmR', 0.3 * ch, 0, -0.45 * ch); set(P, 'farmL', -0.7, 0, 0); set(P, 'farmR', -0.6, 0, 0);
      P.rootZ = -0.05 * ch; P.rootY = -0.03 * ch; P.rootX = 0.035 * ch; P.gripL = 0.8; P.gripR = 0.8;
      return { pose: P, mask: [...UPPER, 'thighR', 'shinR', 'footR', 'thighL', 'shinL'] };
    }
    case 'kneel': {
      const b = Math.sin(time * 1.4) * 0.02;
      set(P, 'thighL', -1.4, 0, 0.05); set(P, 'shinL', 1.5, 0, 0); set(P, 'footL', -0.1, 0, 0);
      set(P, 'thighR', 0.15, 0, -0.05); set(P, 'shinR', 1.65, 0, 0); set(P, 'footR', 0.7, 0, 0);
      set(P, 'spine', 0.28 + b, 0, 0); set(P, 'chest', -b, 0, 0); set(P, 'head', 0.3, 0, 0);
      set(P, 'uarmL', -0.5, 0, 0.1); set(P, 'farmL', -0.6, 0, 0); set(P, 'uarmR', -0.3, 0, -0.1); set(P, 'farmR', -0.4, 0, 0);
      P.rootY = -0.42; P.gripL = 0.4; P.gripR = 0.4;
      return { pose: P, mask: ALL };
    }
    case 'dragged': {
      // hauled along by the wrists: arms up and forward, knees and shins scraping the floor, head lolling
      const loll = Math.sin(time * 1.7), sc = Math.sin(time * 6.5) * 0.03;
      const kick = Math.max(0, Math.sin(time * 0.9 + 1)) ** 12;
      // knees and shins on the floor behind, toes trailing; the trunk hangs from the raised arms
      P.rootY = -0.56; P.bodyPitch = 0.38; P.rootZ = -0.04;
      set(P, 'uarmL', -2.5, 0.1, 0.22); set(P, 'uarmR', -2.5, -0.1, -0.22); set(P, 'farmL', -0.12, 0, 0); set(P, 'farmR', -0.12, 0, 0);
      set(P, 'handL', 0.35, 0, 0); set(P, 'handR', 0.35, 0, 0);
      set(P, 'spine', 0.04, 0, sc); set(P, 'chest', -0.12, 0, 0); set(P, 'neck', 0.3, 0, 0); set(P, 'head', 0.6 + loll * 0.12, loll * 0.3, loll * 0.15);
      set(P, 'thighL', 0.42 - kick * 0.35, 0, 0.08); set(P, 'shinL', 0.78 + kick * 0.5, 0, 0); set(P, 'footL', 1.15, 0, 0);
      set(P, 'thighR', 0.36, 0, -0.08); set(P, 'shinR', 0.84 + sc, 0, 0); set(P, 'footR', 1.15, 0, 0);
      P.gripL = 0.5; P.gripR = 0.5; P.blink = loll > 0.6 ? 1 : 0.4;
      return { pose: P, mask: ALL };
    }
    case 'beaten': {
      // curled on the floor on one side, arms over the head, flinching with every blow
      const j = Math.pow(Math.max(0, Math.sin(time * 7.9)), 8), j2 = Math.pow(Math.max(0, Math.sin(time * 5.3 + 2)), 10);
      P.bodyPitch = -1.5708; P.bodyRoll = 1.45; P.bodyY = 0.17; P.rootY = 0;
      set(P, 'thighL', -1.55 - j * 0.15, 0, 0.05); set(P, 'shinL', 1.9, 0, 0); set(P, 'thighR', -1.35 - j2 * 0.2, 0, -0.05); set(P, 'shinR', 1.95, 0, 0);
      set(P, 'footL', 0.4, 0, 0); set(P, 'footR', 0.4, 0, 0);
      set(P, 'uarmL', -2.6 + j * 0.2, 0.3, 0.25); set(P, 'farmL', -2.2, 0, 0); set(P, 'uarmR', -2.45 - j2 * 0.15, -0.3, -0.25); set(P, 'farmR', -2.25, 0, 0);
      set(P, 'spine', 0.45 + j * 0.2 + j2 * 0.1, 0, 0); set(P, 'chest', 0.2 + j * 0.15, 0, 0); set(P, 'neck', 0.25, 0, 0); set(P, 'head', 0.5 + j * 0.1, 0, 0);
      P.gripL = 1; P.gripR = 1; P.blink = j > 0.3 || j2 > 0.3 ? 1 : 0;
      return { pose: P, mask: ALL };
    }
    case 'fall_land': {
      // a hard landing: crumple into a deep crouch, hands to the floor, then straighten up
      const D = dur > 0.2 ? dur : 0.9, u2 = clamp(t / D, 0, 1);
      const kk = u2 < 0.12 ? ease(u2 / 0.12) : u2 < 0.3 ? 1 : 1 - ease((u2 - 0.3) / 0.7);
      P.rootY = -0.48 * kk;
      set(P, 'spine', 0.5 * kk, 0, 0); set(P, 'chest', 0.15 * kk, 0, 0); set(P, 'head', -0.25 * kk, 0, 0);
      set(P, 'uarmL', -0.75 * kk, 0, 0.3 * kk); set(P, 'uarmR', -0.75 * kk, 0, -0.3 * kk); set(P, 'farmL', -0.2, 0, 0); set(P, 'farmR', -0.2, 0, 0);
      set(P, 'handL', -0.9 * kk, 0, 0); set(P, 'handR', -0.9 * kk, 0, 0);
      set(P, 'thighL', -1.3 * kk, 0, 0.1 * kk); set(P, 'shinL', 2.0 * kk, 0, 0); set(P, 'footL', -0.6 * kk, 0, 0);
      set(P, 'thighR', -1.3 * kk, 0, -0.1 * kk); set(P, 'shinR', 2.0 * kk, 0, 0); set(P, 'footR', -0.6 * kk, 0, 0);
      P.gripL = 0.1; P.gripR = 0.1;
      return { pose: P, mask: [...UPPER, ...LEGS] };
    }
    case 'get_up': {
      // from face down: push up onto hands and knees, up onto one knee, stand
      const D = dur > 0.3 ? dur : 1.8;
      keyed(GETUP, clamp(t / D, 0, 1), P);
      P.gripL = 0.2; P.gripR = 0.2;
      return { pose: P, mask: ALL };
    }
    case 'stagger': {
      // knocked off balance: the hips are thrown back, arms windmill, the feet scramble to catch up (IK steps)
      const D = dur > 0.2 ? dur : 1, u2 = clamp(t / D, 0, 1);
      const k = u2 < 0.18 ? ease(u2 / 0.18) : 1 - ease((u2 - 0.35) / 0.65);
      const wm = Math.sin(time * 11) * k, wm2 = Math.sin(time * 11 + 1.7) * k;
      P.rootZ = -0.3 * k; P.rootY = -0.06 * k;
      set(P, 'spine', -0.2 * k + 0.25 * Math.max(0, u2 - 0.5), 0, wm * 0.05); set(P, 'chest', -0.1 * k, 0, 0); set(P, 'head', 0.25 * k, wm * 0.1, 0);
      set(P, 'uarmL', -1.1 * k + wm * 0.7, 0, 0.7 * k); set(P, 'uarmR', -1.1 * k + wm2 * 0.7, 0, -0.7 * k);
      set(P, 'farmL', -0.5 * k, 0, 0); set(P, 'farmR', -0.5 * k, 0, 0);
      P.gripL = 0.1; P.gripR = 0.1;
      return { pose: P };
    }
    case 'shocked': {
      // a BAILIFF jolt: rigid, arched, the banded (left) arm flung out, everything trembling; the knees give at the end
      const D = dur > 0.2 ? dur : 1.2, u2 = clamp(t / D, 0, 1);
      const e = u2 < 0.06 ? u2 / 0.06 : 1 - ease((u2 - 0.75) / 0.25);
      const tr = (Math.sin(time * 57) * 0.07 + Math.sin(time * 41 + 1) * 0.05) * e;
      set(P, 'spine', -0.28 * e + tr, 0, tr * 0.5); set(P, 'chest', -0.15 * e, 0, -tr); set(P, 'neck', -0.15 * e, 0, 0); set(P, 'head', -0.4 * e + tr * 1.5, tr * 2, tr);
      set(P, 'uarmL', -0.55 * e + tr * 2, 0, 1.0 * e); set(P, 'farmL', -0.25 * e + tr * 3, 0, 0); set(P, 'handL', -0.6 * e, 0, 0);
      set(P, 'uarmR', -0.2 * e - tr, 0, -0.55 * e); set(P, 'farmR', -0.6 * e - tr * 2, 0, 0); set(P, 'handR', -0.5 * e, 0, 0);
      P.rootY = -0.04 * e - 0.16 * ease((u2 - 0.6) / 0.4) * (1 - ease((u2 - 0.92) / 0.08)); P.gripL = 0.15; P.gripR = 0.4; P.blink = 1;
      return { pose: P };
    }
    default: {
      const ext = EXT_POSES.get(a);
      return ext ? ext(t, dur, inp, time) : { pose: P };
    }
  }
}

// ------------------------------------------------------------------ emotes
const EMOTE_DUR: Record<EmoteName, number> = { wave: 2.4, flex: 2.6, dance: 6, jumping_jacks: 5, shrug: 1.8, salute: 2.2, point: 2.2, facepalm: 2.2, sit_wait: 10, cheer: 2.2, clap: 3, bow: 2, mock: 2.6 };

function emotePose(name: EmoteName, et: number, time: number): { pose: Pose; mask: JointName[] } {
  const P: Pose = {};
  const D = EMOTE_DUR[name] || 2;
  const u = clamp(et / D, 0, 1);
  const e = env(u, 0.15, 0.2);
  switch (name) {
    case 'wave': {
      const k = Math.sin(time * 9) * 0.45;
      set(P, 'uarmR', -0.25, 0.1, -2.45 * e); set(P, 'farmR', -0.25 * e, 0, (-0.35 + k) * e); set(P, 'handR', 0, 0, k * 0.4);
      set(P, 'head', 0.0, 0.1, -0.1 * e); set(P, 'chest', 0, 0, 0.05 * e);
      P.gripR = 0;
      return { pose: P, mask: ['uarmR', 'farmR', 'handR', 'head', 'chest'] };
    }
    case 'flex': {
      const pump = 0.5 + 0.5 * Math.sin(time * 6);
      // upper arms out to the sides, rolled so the elbows bend upward
      set(P, 'uarmL', -1.45 * e, 0, 1.45 * e); set(P, 'farmL', -(1.75 + pump * 0.25) * e, 0, 0); set(P, 'handL', 0.3 * e, 0, 0);
      set(P, 'uarmR', -1.45 * e, 0, -1.45 * e); set(P, 'farmR', -(1.75 + pump * 0.25) * e, 0, 0); set(P, 'handR', 0.3 * e, 0, 0);
      set(P, 'chest', -0.12 * e, 0, 0); set(P, 'spine', -0.05 * e, 0, 0); set(P, 'head', -0.1 * e, Math.sin(time * 1.5) * 0.2, 0);
      set(P, 'thighL', 0, 0, 0.12 * e); set(P, 'thighR', 0, 0, -0.12 * e);
      P.gripL = 1; P.gripR = 1;
      return { pose: P, mask: [...UPPER, 'thighL', 'thighR'] };
    }
    case 'dance': {
      const b = time * 4.2;
      const s = Math.sin(b), c = Math.cos(b), s2 = Math.sin(b * 2);
      P.rootY = -0.05 - Math.abs(s) * 0.05; P.rootX = s * 0.06;
      set(P, 'hips', 0, s * 0.25, s * 0.1);
      set(P, 'spine', 0.05, -s * 0.15, -s * 0.08); set(P, 'chest', 0, -s * 0.15, 0); set(P, 'head', s2 * 0.1, s * 0.25, -s * 0.12);
      set(P, 'uarmL', -1.2 - c * 0.9, 0, 0.5); set(P, 'farmL', -1.4 + c * 0.5, 0, 0);
      set(P, 'uarmR', -1.2 + c * 0.9, 0, -0.5); set(P, 'farmR', -1.4 - c * 0.5, 0, 0);
      set(P, 'thighL', -0.3 - Math.max(0, s) * 0.4, 0, 0.12); set(P, 'shinL', 0.4 + Math.max(0, s) * 0.5, 0, 0);
      set(P, 'thighR', -0.3 - Math.max(0, -s) * 0.4, 0, -0.12); set(P, 'shinR', 0.4 + Math.max(0, -s) * 0.5, 0, 0);
      set(P, 'footL', -0.1, 0, 0); set(P, 'footR', -0.1, 0, 0);
      P.gripL = 0.7; P.gripR = 0.7;
      return { pose: P, mask: ALL };
    }
    case 'jumping_jacks': {
      const c = (time * 1.6) % 1;
      const o = Math.sin(c * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5; // 0 closed .. 1 open
      const hop = Math.abs(Math.sin(c * Math.PI * 2));
      P.rootY = hop * 0.09;
      set(P, 'uarmL', 0, 0, 0.1 + o * 2.85); set(P, 'uarmR', 0, 0, -0.1 - o * 2.85); set(P, 'farmL', -0.15, 0, 0); set(P, 'farmR', -0.15, 0, 0);
      set(P, 'thighL', 0, 0, 0.02 + o * 0.32); set(P, 'thighR', 0, 0, -0.02 - o * 0.32);
      set(P, 'shinL', 0.1 + (1 - hop) * 0.25, 0, 0); set(P, 'shinR', 0.1 + (1 - hop) * 0.25, 0, 0);
      set(P, 'footL', hop * 0.3, 0, -o * 0.3); set(P, 'footR', hop * 0.3, 0, o * 0.3);
      set(P, 'head', -0.05, 0, 0);
      P.gripL = 0; P.gripR = 0;
      return { pose: P, mask: ALL };
    }
    case 'shrug': {
      set(P, 'uarmL', -0.25 * e, 0, 0.45 * e); set(P, 'farmL', -1.45 * e, 0.6 * e, 0); set(P, 'handL', 0, 0, 0.9 * e);
      set(P, 'uarmR', -0.25 * e, 0, -0.45 * e); set(P, 'farmR', -1.45 * e, -0.6 * e, 0); set(P, 'handR', 0, 0, -0.9 * e);
      set(P, 'chest', -0.08 * e, 0, 0); set(P, 'neck', -0.05 * e, 0, 0); set(P, 'head', 0.05, 0, 0.22 * e);
      P.gripL = 0; P.gripR = 0;
      return { pose: P, mask: UPPER };
    }
    case 'salute': {
      set(P, 'uarmR', -0.55 * e, 0.3, -1.35 * e); set(P, 'farmR', -2.3 * e, 0, 0); set(P, 'handR', 0.3 * e, 0, -0.3 * e);
      set(P, 'uarmL', 0, 0, 0.03); set(P, 'farmL', -0.05, 0, 0);
      set(P, 'chest', -0.08 * e, 0, 0); set(P, 'head', -0.05 * e, 0, 0);
      set(P, 'thighL', 0, 0, 0); set(P, 'thighR', 0, 0, 0); set(P, 'shinL', 0, 0, 0); set(P, 'shinR', 0, 0, 0);
      P.gripR = 0; P.gripL = 0.5;
      return { pose: P, mask: [...UPPER, 'thighL', 'thighR', 'shinL', 'shinR', 'hips'] };
    }
    case 'point': {
      set(P, 'uarmR', -1.52 * e, 0.12, -0.1); set(P, 'farmR', -0.05, 0, 0); set(P, 'handR', -0.1, 0, 0);
      set(P, 'chest', 0, -0.15 * e, 0); set(P, 'head', 0.02, 0.18 * e, 0);
      P.gripR = 0.8;
      return { pose: P, mask: ['uarmR', 'farmR', 'handR', 'chest', 'head'] };
    }
    case 'facepalm': {
      const shake = Math.sin(time * 3) * 0.08 * e;
      set(P, 'uarmR', -1.0 * e, 0.45 * e, -0.2); set(P, 'farmR', -2.35 * e, 0, 0); set(P, 'handR', 0.5 * e, 0, 0);
      set(P, 'head', 0.4 * e, shake, 0); set(P, 'neck', 0.1 * e, 0, 0); set(P, 'chest', 0.12 * e, 0, 0);
      P.gripR = 0;
      return { pose: P, mask: ['uarmR', 'farmR', 'handR', 'head', 'neck', 'chest'] };
    }
    case 'sit_wait': {
      const look = Math.sin(time * 0.35) * 0.5;
      P.rootY = -0.86;
      set(P, 'thighL', -1.45, -0.5, 0.75); set(P, 'thighR', -1.45, 0.5, -0.75);
      set(P, 'shinL', 2.35, 0, 0); set(P, 'shinR', 2.35, 0, 0); set(P, 'footL', -0.3, 0, -0.4); set(P, 'footR', -0.3, 0, 0.4);
      set(P, 'spine', 0.22, 0, 0); set(P, 'chest', 0.05, look * 0.2, 0); set(P, 'head', 0.05, look, 0);
      set(P, 'uarmL', -0.55, -0.1, 0.12); set(P, 'farmL', -0.7, 0, 0); set(P, 'uarmR', -0.55, 0.1, -0.12); set(P, 'farmR', -0.7, 0, 0);
      P.gripL = 0.4; P.gripR = 0.4;
      return { pose: P, mask: ALL };
    }
    case 'cheer': {
      const j = Math.abs(Math.sin(time * 6)) * e;
      set(P, 'uarmL', -0.3, 0, 2.6 * e); set(P, 'uarmR', -0.3, 0, -2.6 * e); set(P, 'farmL', -0.3 - j * 0.3, 0, 0); set(P, 'farmR', -0.3 - j * 0.3, 0, 0);
      set(P, 'head', -0.25 * e, 0, 0); set(P, 'chest', -0.1 * e, 0, 0);
      P.rootY = j * 0.06; P.gripL = 1; P.gripR = 1;
      return { pose: P, mask: UPPER };
    }
    case 'clap': {
      const c = Math.abs(Math.sin(time * 7));
      set(P, 'uarmL', -0.7, -0.35, 0.15); set(P, 'farmL', -1.3, 0, 0); set(P, 'handL', 0, 0, 0.6 + c * 0.25);
      set(P, 'uarmR', -0.7, 0.35, -0.15); set(P, 'farmR', -1.3, 0, 0); set(P, 'handR', 0, 0, -0.6 - c * 0.25);
      set(P, 'uarmL', -0.7, -0.25 - c * 0.15, 0.15); set(P, 'uarmR', -0.7, 0.25 + c * 0.15, -0.15);
      P.gripL = 0; P.gripR = 0;
      return { pose: P, mask: ARMS };
    }
    case 'mock': {
      // thumb on the nose, fingers waggling, the other hand on the hip, bouncing on the toes (src/social)
      const wag = Math.sin(time * 16), bob = Math.abs(Math.sin(time * 5)) * e;
      set(P, 'uarmR', -1.05 * e, 0.5 * e, -0.25 * e); set(P, 'farmR', -2.25 * e, 0, 0); set(P, 'handR', 0.2 * e, wag * 0.5 * e, -0.4 * e);
      set(P, 'uarmL', 0.1 * e, 0, 0.6 * e); set(P, 'farmL', -1.5 * e, 0.4 * e, 0); set(P, 'handL', 0, 0, 0.5 * e);
      set(P, 'chest', -0.12 * e, 0.15 * e, 0.1 * e); set(P, 'head', -0.1 * e, Math.sin(time * 5) * 0.15 * e, 0.22 * e);
      P.rootY = bob * 0.05; P.gripR = 0; P.gripL = 0.6;
      return { pose: P, mask: UPPER };
    }
    case 'bow': {
      const b = Math.sin(u * Math.PI);
      set(P, 'spine', 0.6 * b, 0, 0); set(P, 'chest', 0.25 * b, 0, 0); set(P, 'head', 0.2 * b, 0, 0);
      set(P, 'uarmL', 0.05, 0, 0.05); set(P, 'uarmR', -0.6 * b, 0.6 * b, -0.1); set(P, 'farmR', -1.4 * b, 0, 0);
      return { pose: P, mask: UPPER };
    }
  }
  return { pose: P, mask: [] };
}

// ------------------------------------------------------------------ full body
function fullPose(f: FullBody, t: number, ft: number, inp: AnimInput): Pose {
  const P: Pose = {};
  switch (f) {
    case 'sit': {
      const shift = Math.sin(t * 0.25) * 0.5 + 0.5;
      P.rootY = -0.47;
      set(P, 'thighL', -1.55, -0.06, 0.08); set(P, 'thighR', -1.55, 0.06, -0.08);
      set(P, 'shinL', 1.45 + shift * 0.15, 0, 0); set(P, 'shinR', 1.6 - shift * 0.15, 0, 0);
      set(P, 'footL', 0.1, 0, 0); set(P, 'footR', 0.0, 0, 0);
      set(P, 'spine', -0.08 + shift * 0.06, 0, 0); set(P, 'chest', 0.04, 0, 0);
      set(P, 'uarmL', -0.42, -0.1, 0.12); set(P, 'farmL', -0.85, 0, 0); set(P, 'handL', -0.5, 0, 0);
      set(P, 'uarmR', -0.42, 0.1, -0.12); set(P, 'farmR', -0.85, 0, 0); set(P, 'handR', -0.5, 0, 0);
      set(P, 'head', 0.08 + Math.sin(t * 0.3) * 0.05, Math.sin(t * 0.21) * 0.35, 0);
      P.gripL = 0.4; P.gripR = 0.4;
      return P;
    }
    case 'kneel':
      P.rootY = -0.42;
      set(P, 'thighL', -1.4, 0, 0.05); set(P, 'shinL', 1.5, 0, 0); set(P, 'footL', -0.1, 0, 0);
      set(P, 'thighR', 0.15, 0, -0.05); set(P, 'shinR', 1.65, 0, 0); set(P, 'footR', 0.7, 0, 0);
      set(P, 'spine', 0.28, 0, 0); set(P, 'head', 0.3, 0, 0);
      return P;
    case 'lie': case 'lie_side': {
      const breath = Math.sin(t * 1.1) * 0.025;
      P.bodyPitch = -1.5708; P.bodyY = 0.13;
      if (f === 'lie_side') {
        // curled up on the side
        P.bodyRoll = 1.45; P.bodyY = 0.16;
        set(P, 'thighL', -0.9, 0, 0.05); set(P, 'shinL', 1.3, 0, 0); set(P, 'thighR', -0.7, 0, -0.05); set(P, 'shinR', 1.2, 0, 0);
        set(P, 'uarmL', -1.2, 0, 0.1); set(P, 'farmL', -1.5, 0, 0); set(P, 'uarmR', -0.9, 0, -0.1); set(P, 'farmR', -1.3, 0, 0);
        set(P, 'spine', 0.25, 0, 0); set(P, 'chest', 0.15 + breath, 0, 0); set(P, 'head', 0.3, 0, 0);
      } else {
        set(P, 'chest', breath, 0, 0);
        set(P, 'uarmL', 0.1, 0, 0.28); set(P, 'uarmR', 0.05, 0, -0.22); set(P, 'farmL', -0.5, 0, 0); set(P, 'farmR', -1.4, 0.3, 0);
        set(P, 'head', -0.12, 0, 0.35);
        set(P, 'thighL', -0.06, 0, 0.05); set(P, 'thighR', -0.2, 0, -0.04); set(P, 'shinR', 0.3, 0, 0); set(P, 'footL', 0.5, 0, 0); set(P, 'footR', 0.5, 0, 0);
      }
      P.gripL = 0.4; P.gripR = 0.4;
      return P;
    }
    case 'dead': {
      // collapse (knees buckle, fall forward) then sprawl
      const k = ease(clamp(ft / 0.75, 0, 1));
      if (k < 1) {
        const fallP = ease(clamp((ft - 0.25) / 0.5, 0, 1));
        P.rootY = -0.35 * ease(clamp(ft / 0.3, 0, 1)) * (1 - fallP);
        set(P, 'thighL', -0.8 * (1 - fallP), 0, 0.1); set(P, 'shinL', 1.3 * (1 - fallP) + 0.1, 0, 0);
        set(P, 'thighR', -0.6 * (1 - fallP), 0, -0.1); set(P, 'shinR', 1.1 * (1 - fallP) + 0.1, 0, 0);
        P.bodyPitch = 1.5708 * fallP; P.bodyY = 0.13 * fallP;
        set(P, 'uarmL', -1.5 * fallP, 0, 0.5); set(P, 'uarmR', -1.2 * fallP, 0, -0.5); set(P, 'head', 0.3, 0.5 * fallP, 0);
        set(P, 'spine', 0.4 * (1 - fallP), 0, 0);
        return P;
      }
      P.bodyPitch = 1.5708; P.bodyY = 0.13;
      set(P, 'uarmL', -2.6, 0.2, 0.8); set(P, 'uarmR', -0.4, 0, -0.9); set(P, 'farmL', -0.5, 0, 0); set(P, 'farmR', -0.2, 0, 0);
      set(P, 'head', 0.3, 0.9, 0); set(P, 'thighL', 0.1, 0, 0.15); set(P, 'thighR', -0.6, 0, -0.1); set(P, 'shinR', 1.1, 0, 0);
      set(P, 'footL', 0.8, 0, 0); set(P, 'footR', 0.6, 0, 0);
      P.gripL = 0.2; P.gripR = 0.2;
      return P;
    }
    case 'downed': {
      // buckle to the knees, fall onto the hands, then lie clutching the wound and trying to rise
      const s = Math.sin(t * 2.2), wr = Math.sin(t * 0.7);
      if (ft < 1.1) {
        const a = ease(clamp(ft / 0.35, 0, 1)), b = ease(clamp((ft - 0.35) / 0.45, 0, 1)), c = ease(clamp((ft - 0.8) / 0.3, 0, 1));
        P.rootY = -0.45 * a * (1 - c) - 0.84 * c;
        set(P, 'thighL', -1.2 * a * (1 - c) + 0.1 * c, 0, 0.1); set(P, 'shinL', 1.6 * a * (1 - c) + 0.3 * c, 0, 0);
        set(P, 'thighR', -0.3 * a * (1 - c), 0, -0.1); set(P, 'shinR', 1.8 * a * (1 - c) + 0.3 * c, 0, 0);
        set(P, 'spine', 0.4 * a * (1 - c) + 0.4 * b * (1 - c), 0, 0);
        set(P, 'uarmL', -1.3 * b, 0, 0.3); set(P, 'uarmR', -1.3 * b, 0, -0.3); set(P, 'farmL', -0.3, 0, 0); set(P, 'farmR', -0.3, 0, 0);
        P.bodyPitch = 1.4 * c; P.bodyY = 0.14 * c; set(P, 'head', -0.9 * c + 0.3 * (1 - c), 0, 0);
        P.gripL = 0; P.gripR = 0;
        return P;
      }
      P.bodyPitch = 1.4; P.bodyY = 0.15; P.rootY = -0.84; P.bodyRoll = 0.35 + wr * 0.05;
      set(P, 'uarmL', -2.2 + s * 0.25, 0, 0.35); set(P, 'farmL', -0.6, 0, 0);
      set(P, 'uarmR', -0.9, 0.5, -0.1); set(P, 'farmR', -1.9, 0, 0); set(P, 'handR', 0.4, 0, 0);
      set(P, 'head', -0.75 + Math.max(0, Math.sin(t * 0.5)) * 0.35, Math.sin(t * 0.3) * 0.3, 0);
      set(P, 'thighL', -0.4 + wr * 0.1, 0, 0.1); set(P, 'shinL', 0.9, 0, 0); set(P, 'thighR', 0.1, 0, -0.1); set(P, 'shinR', 0.35, 0, 0);
      set(P, 'footL', 0.6, 0, 0); set(P, 'footR', 0.8, 0, 0);
      P.gripL = 0.8; P.gripR = 0.9;
      return P;
    }
    case 'carried': {
      // folded over the carrier's shoulder: legs in front, torso hanging down the back
      const sway = Math.sin(t * 2.5) * 0.06 * clamp(inp.speed, 0, 1);
      P.bodyYaw = Math.PI; P.bodyPitch = -1.5708; P.rootY = -0.94; P.bodyY = 1.43;
      set(P, 'spine', 0.75, 0, 0); set(P, 'chest', 0.5 + sway, 0, 0); set(P, 'neck', 0.2, 0, 0); set(P, 'head', 0.3, 0.3, 0);
      set(P, 'thighL', -1.35, 0, 0.06); set(P, 'thighR', -1.45, 0, -0.06); set(P, 'shinL', 1.0 + sway, 0, 0); set(P, 'shinR', 1.15 - sway, 0, 0);
      set(P, 'uarmL', -2.6 + sway, 0, 0.12); set(P, 'uarmR', -2.7 - sway, 0, -0.12); set(P, 'farmL', -0.3, 0, 0); set(P, 'farmR', -0.25, 0, 0);
      P.gripL = 0.2; P.gripR = 0.2;
      return P;
    }
    case 'vault': {
      const u = (t * 1.5) % 1;
      P.rootY = Math.sin(u * Math.PI) * 0.45;
      set(P, 'thighL', -1.4, 0, 0.2); set(P, 'shinL', 1.6, 0, 0); set(P, 'thighR', -0.6, 0, -0.2); set(P, 'shinR', 1.0, 0, 0);
      set(P, 'uarmL', -1.2, 0, 0.3); set(P, 'uarmR', -1.2, 0, -0.3); set(P, 'spine', 0.4, 0, 0);
      P.gripL = 0; P.gripR = 0;
      return P;
    }
    case 'fall':
      P.bodyPitch = -0.6; set(P, 'uarmL', -2.8, 0, 0.6); set(P, 'uarmR', -2.8, 0, -0.6); set(P, 'head', 0.3, 0, 0);
      return P;
    case 'drive':
      P.rootY = -0.42;
      set(P, 'thighL', -1.4, 0, 0.05); set(P, 'thighR', -1.4, 0, -0.05); set(P, 'shinL', 1.2, 0, 0); set(P, 'shinR', 1.2, 0, 0);
      set(P, 'uarmL', -1.1, -0.2, 0.15); set(P, 'farmL', -0.7, 0, 0); set(P, 'uarmR', -1.1, 0.2, -0.15); set(P, 'farmR', -0.7, 0, 0);
      P.gripL = 1; P.gripR = 1;
      return P;
    default:
      return P;
  }
}

// ------------------------------------------------------------------ keyframed full-body moves
type KP = { u: number; s: { rootY?: number; rootZ?: number; bodyPitch?: number; bodyY?: number }; j: Partial<Record<JointName, V>> };
/** face down -> hands and knees -> one knee -> standing */
const GETUP: KP[] = [
  { u: 0, s: { bodyPitch: 1.4, bodyY: 0.15, rootY: -0.84 }, j: { uarmL: [-2.2, 0, 0.35], farmL: [-0.6, 0, 0], uarmR: [-2.2, 0, -0.35], farmR: [-0.6, 0, 0], head: [-0.75, 0, 0], thighL: [0.05, 0, 0.1], shinL: [0.3, 0, 0], thighR: [0.05, 0, -0.1], shinR: [0.3, 0, 0], footL: [0.7, 0, 0], footR: [0.7, 0, 0] } },
  { u: 0.18, s: { bodyPitch: 1.35, bodyY: 0.1, rootY: -0.84, rootZ: -0.2 }, j: { uarmL: [-1.2, 0, 0.3], farmL: [-1.3, 0, 0], uarmR: [-1.2, 0, -0.3], farmR: [-1.3, 0, 0], handL: [-1.2, 0, 0], handR: [-1.2, 0, 0], head: [-0.7, 0, 0], thighL: [-0.4, 0, 0.1], shinL: [0.9, 0, 0], thighR: [-0.3, 0, -0.1], shinR: [0.8, 0, 0], footL: [0.7, 0, 0], footR: [0.7, 0, 0] } },
  { u: 0.36, s: { bodyPitch: 1.5, bodyY: 0, rootY: -0.94, rootZ: -0.55 }, j: { uarmL: [-1.5, 0, 0.15], farmL: [0, 0, 0], uarmR: [-1.5, 0, -0.15], farmR: [0, 0, 0], handL: [-1.3, 0, 0], handR: [-1.3, 0, 0], head: [-0.6, 0, 0], spine: [0.05, 0, 0], thighL: [-1.5, 0, 0.08], shinL: [1.5, 0, 0], thighR: [-1.5, 0, -0.08], shinR: [1.5, 0, 0], footL: [0.5, 0, 0], footR: [0.5, 0, 0] } },
  { u: 0.66, s: { bodyPitch: 0, bodyY: 0, rootY: -0.42, rootZ: 0 }, j: { thighL: [-1.4, 0, 0.05], shinL: [1.5, 0, 0], footL: [-0.1, 0, 0], thighR: [0.15, 0, -0.05], shinR: [1.65, 0, 0], footR: [0.7, 0, 0], spine: [0.38, 0, 0], head: [0.1, 0, 0], uarmL: [-0.75, 0, 0.1], farmL: [-0.45, 0, 0], uarmR: [-0.45, 0, -0.1], farmR: [-0.3, 0, 0] } },
  { u: 1, s: { rootY: 0 }, j: {} },
];
function keyed(K: KP[], u: number, P: Pose) {
  let i = 0; while (i < K.length - 2 && u > K[i + 1].u) i++;
  const A = K[i], B = K[i + 1];
  const f = ease((u - A.u) / (B.u - A.u));
  for (const j of ALL) { const a = A.j[j] ?? Z, b = B.j[j] ?? Z; set(P, j, lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)); }
  P.rootY = lerp(A.s.rootY ?? 0, B.s.rootY ?? 0, f); P.rootZ = lerp(A.s.rootZ ?? 0, B.s.rootZ ?? 0, f);
  P.bodyPitch = lerp(A.s.bodyPitch ?? 0, B.s.bodyPitch ?? 0, f); P.bodyY = lerp(A.s.bodyY ?? 0, B.s.bodyY ?? 0, f);
}
