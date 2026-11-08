// Limb loss: the pure model. Which parts make up each limb, how much of a
// limb is gone, what a stump looks like, what prosthetics fit where, and what
// living with it does to movement, grip, aim and crafting.
//
// Contract (src/survival/body.ts): Body.severed lists every body part that is
// gone, the cut part and everything distal to it ("a lost upper arm lists the
// forearm and hand too"). The cut part carries one 'amputation' injury while
// the stump is a wound (bleeding, treated with a tourniquet, cauterised,
// stitched, bandaged); when that heals the stump is closed for good.
//
// Gameplay (src/survival/limbSystem.ts) severs parts, runs tearing attacks,
// phantom pain and rot; the rig (src/entities/humanModel.ts / humanRig.ts)
// drops missing segments and draws stumps, crutches and prosthetics.
// Nothing here imports game state, so body.ts and the rig can use it freely.
import type { BodyPart } from '../items/item';

export type Side = 'l' | 'r';
export type LimbKind = 'arm' | 'leg';
export type LimbSlot = 'arm_l' | 'arm_r' | 'leg_l' | 'leg_r';

/** proximal → distal */
export const CHAINS: Record<LimbKind, Record<Side, BodyPart[]>> = {
  arm: { l: ['uarm_l', 'farm_l', 'hand_l'], r: ['uarm_r', 'farm_r', 'hand_r'] },
  leg: { l: ['thigh_l', 'shin_l', 'foot_l'], r: ['thigh_r', 'shin_r', 'foot_r'] },
};
export const LIMB_PARTS: BodyPart[] = [...CHAINS.arm.l, ...CHAINS.arm.r, ...CHAINS.leg.l, ...CHAINS.leg.r];
/** what a wound lands on when its part is gone: the cut part's parent */
const PARENT: Partial<Record<BodyPart, BodyPart>> = {
  uarm_l: 'torso_u', uarm_r: 'torso_u', farm_l: 'uarm_l', farm_r: 'uarm_r', hand_l: 'farm_l', hand_r: 'farm_r',
  thigh_l: 'groin', thigh_r: 'groin', shin_l: 'thigh_l', shin_r: 'thigh_r', foot_l: 'shin_l', foot_r: 'shin_r',
};

export function chainOf(part: string): { kind: LimbKind; side: Side; idx: number } | null {
  for (const kind of ['arm', 'leg'] as LimbKind[]) for (const side of ['l', 'r'] as Side[]) {
    const i = CHAINS[kind][side].indexOf(part as BodyPart);
    if (i >= 0) return { kind, side, idx: i };
  }
  return null;
}
export const isLimbPart = (part: string) => chainOf(part) !== null;
/** the part and everything hanging off it */
export function distalOf(part: BodyPart): BodyPart[] {
  const c = chainOf(part);
  return c ? CHAINS[c.kind][c.side].slice(c.idx) : [part];
}
export const parentOf = (part: BodyPart): BodyPart | undefined => PARENT[part];
export const slotOf = (kind: LimbKind, side: Side): LimbSlot => `${kind}_${side}` as LimbSlot;

/** 0 intact, 1 hand / foot gone, 2 forearm / shin gone, 3 the whole limb */
export function lossLevel(severed: readonly string[], kind: LimbKind, side: Side): number {
  const ch = CHAINS[kind][side];
  for (let i = 0; i < 3; i++) if (severed.includes(ch[i])) return 3 - i;
  return 0;
}
/** the most proximal missing part of a limb (where the stump is) */
export function cutPart(severed: readonly string[], kind: LimbKind, side: Side): BodyPart | null {
  const ch = CHAINS[kind][side];
  for (const p of ch) if (severed.includes(p)) return p;
  return null;
}
export function cutParts(severed: readonly string[]): BodyPart[] {
  const out: BodyPart[] = [];
  for (const kind of ['arm', 'leg'] as LimbKind[]) for (const side of ['l', 'r'] as Side[]) { const c = cutPart(severed, kind, side); if (c) out.push(c); }
  return out;
}
/** where a wound on a missing part lands instead: the stump (the cut part itself carries the stump's wounds) */
export function redirectPart(severed: readonly string[], part: BodyPart): BodyPart {
  if (!severed.includes(part)) return part;
  const c = chainOf(part);
  const cut = c ? cutPart(severed, c.kind, c.side) : null;
  return cut ?? PARENT[part] ?? 'torso_u';
}

/** names for what is gone, by limb ("left hand", "right arm below the elbow"...) */
export function lossName(kind: LimbKind, side: Side, level: number): string {
  const s = side === 'l' ? 'left' : 'right';
  if (kind === 'arm') return level >= 3 ? `${s} arm` : level === 2 ? `${s} forearm` : `${s} hand`;
  return level >= 3 ? `${s} leg` : level === 2 ? `${s} lower leg` : `${s} foot`;
}
/** "Left hand, right lower leg" (empty when whole) */
export function lossSummary(severed: readonly string[]): string {
  const out: string[] = [];
  for (const kind of ['arm', 'leg'] as LimbKind[]) for (const side of ['l', 'r'] as Side[]) {
    const lv = lossLevel(severed, kind, side);
    if (lv) out.push(lossName(kind, side, lv));
  }
  return out.join(', ');
}

// ------------------------------------------------------------------ prosthetics & aids
export type ProstKind = 'peg' | 'hook' | 'leg' | 'hand';
export interface ProstDef { kind: ProstKind; limb: LimbKind; /** deepest loss it fits (1 hand/foot, 2 forearm/shin, 3 whole) */ maxLevel: number; name: string }
/** item key → what it is (items in src/content/items/limbs.ts) */
export const PROSTHETICS: Record<string, ProstDef> = {
  peg_leg: { kind: 'peg', limb: 'leg', maxLevel: 2, name: 'peg leg' },
  prosthetic_leg: { kind: 'leg', limb: 'leg', maxLevel: 3, name: 'prosthetic leg' },
  hook_hand: { kind: 'hook', limb: 'arm', maxLevel: 2, name: 'hook' },
  prosthetic_hand: { kind: 'hand', limb: 'arm', maxLevel: 2, name: 'prosthetic hand' },
};
export const isProsthetic = (key: string) => !!PROSTHETICS[key];

/** what the survivor is using to get by (set every frame from worn / held items) */
export interface LimbAids {
  /** fitted prosthetics by limb (item keys) */
  prost: Partial<Record<LimbSlot, string>>;
  /** crutches held in the left / right hand */
  crutchL: boolean; crutchR: boolean;
}
export const noAids = (): LimbAids => ({ prost: {}, crutchL: false, crutchR: false });
export function aidsKey(a: LimbAids) { return `${a.prost.arm_l || ''}|${a.prost.arm_r || ''}|${a.prost.leg_l || ''}|${a.prost.leg_r || ''}|${a.crutchL ? 1 : 0}${a.crutchR ? 1 : 0}`; }

export type Gait = 'walk' | 'peg' | 'prosthetic' | 'crutch' | 'hop' | 'crawl';

export interface LimbState {
  arm: Record<Side, number>;
  leg: Record<Side, number>;
  /** hands that can grip (natural or a prosthetic hand) */
  handOk: Record<Side, boolean>;
  hook: Record<Side, boolean>;
  hands: number;
  /** can wield something two-handed (two hands, or one hand steadied by a hook) */
  twoHand: boolean;
  /** the right hand is gone and the left works: the left becomes the primary hand (the rig mirrors) */
  mirror: boolean;
  gait: Gait;
  crutches: number;
  /** per-leg prosthetic in use (kind) */
  legProst: Record<Side, ProstKind | ''>;
  armProst: Record<Side, ProstKind | ''>;
  /** multipliers for Body.mods */
  move: number; canRun: boolean; crawl: boolean; action: number; aim: number; attack: number;
  climb: boolean;
  any: boolean;
}

/** a prosthetic fits a limb if the loss is not deeper than it is made for */
export function prostFits(key: string, kind: LimbKind, level: number): boolean {
  const d = PROSTHETICS[key];
  return !!d && d.limb === kind && level > 0 && level <= d.maxLevel;
}

export function limbState(severed: readonly string[], aids: LimbAids): LimbState {
  const arm = { l: lossLevel(severed, 'arm', 'l'), r: lossLevel(severed, 'arm', 'r') };
  const leg = { l: lossLevel(severed, 'leg', 'l'), r: lossLevel(severed, 'leg', 'r') };
  const armProst = { l: '' as ProstKind | '', r: '' as ProstKind | '' };
  const legProst = { l: '' as ProstKind | '', r: '' as ProstKind | '' };
  for (const side of ['l', 'r'] as Side[]) {
    const a = aids.prost[slotOf('arm', side)], g = aids.prost[slotOf('leg', side)];
    if (a && prostFits(a, 'arm', arm[side])) armProst[side] = PROSTHETICS[a].kind;
    if (g && prostFits(g, 'leg', leg[side])) legProst[side] = PROSTHETICS[g].kind;
  }
  const handOk = { l: arm.l === 0 || armProst.l === 'hand', r: arm.r === 0 || armProst.r === 'hand' };
  const hook = { l: armProst.l === 'hook', r: armProst.r === 'hook' };
  const hands = (handOk.l ? 1 : 0) + (handOk.r ? 1 : 0);
  const twoHand = hands === 2 || (hands === 1 && (hook.l || hook.r));
  const crutches = (aids.crutchL && handOk.l ? 1 : 0) + (aids.crutchR && handOk.r ? 1 : 0);
  // legs: a missing leg without a fitting prosthetic is a leg you cannot stand on
  const legMissing = (leg.l > 0 && !legProst.l ? 1 : 0) + (leg.r > 0 && !legProst.r ? 1 : 0);
  let gait: Gait = 'walk', move = 1, canRun = true;
  if (legMissing >= 2) { gait = 'crawl'; move = 0.85; canRun = false; }
  else if (legMissing === 1) {
    if (crutches > 0) { gait = 'crutch'; move = crutches >= 2 ? 0.6 : 0.52; canRun = false; }
    else { gait = 'hop'; move = 0.34; canRun = false; }
  } else if (legProst.l === 'peg' || legProst.r === 'peg') { gait = 'peg'; move = 0.78; canRun = false; }
  else if (legProst.l || legProst.r) { gait = 'prosthetic'; move = 0.92; }
  // hands: everything takes longer one-handed; hooks and prosthetic hands give some of it back
  let action = 1, aim = 1, attack = 1;
  const lostHands = 2 - hands;
  if (lostHands > 0) {
    const hooks = (hook.l ? 1 : 0) + (hook.r ? 1 : 0);
    action = lostHands >= 2 ? (hooks ? 1.9 : 2.4) : hooks ? 1.25 : 1.55;
    aim = lostHands >= 2 ? 0.55 : hooks ? 0.88 : 0.8;
    attack = lostHands >= 2 ? 0.45 : 0.86;
  } else if (armProst.l === 'hand' || armProst.r === 'hand') { action = 1.12; aim = 0.94; }
  if (gait === 'crawl') attack *= 0.7;
  const climb = (hands === 2 || (hands === 1 && (hook.l || hook.r))) && gait !== 'crawl' && gait !== 'hop';
  return {
    arm, leg, handOk, hook, hands, twoHand, mirror: !handOk.r && handOk.l, gait, crutches, legProst, armProst,
    move, canRun, crawl: gait === 'crawl', action, aim, attack, climb,
    any: arm.l + arm.r + leg.l + leg.r > 0 || crutches > 0,
  };
}

/** bleed of a fresh stump by where the cut is (base rate, Injury.bleed: blood loss per game hour = bleed × 12) */
export function stumpBleed(part: BodyPart): number {
  const c = chainOf(part);
  if (!c) return 3;
  return c.kind === 'arm' ? [7.5, 5.6, 4.2][c.idx] : [8.5, 6.2, 4.4][c.idx];
}

// ------------------------------------------------------------------ stump looks (rig condition)
/** raw wound, cauterised, stitched closed, bandaged, blood-soaked bandage, healed skin */
export type StumpLook = 'raw' | 'caut' | 'stitch' | 'band' | 'bandb' | 'healed' | 'clean';
export interface StumpCond { s: StumpLook; tq?: 1 }

/** severed-part names used by the rig (BodyPart → joint) */
export const PART_JOINT: Record<string, string> = {
  uarm_l: 'uarmL', farm_l: 'farmL', hand_l: 'handL', uarm_r: 'uarmR', farm_r: 'farmR', hand_r: 'handR',
  thigh_l: 'thighL', shin_l: 'shinL', foot_l: 'footL', thigh_r: 'thighR', shin_r: 'shinR', foot_r: 'footR',
};
