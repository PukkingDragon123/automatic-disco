// Design -> blocky rig. Bones sit at joints (rest rotations are identity); boxes hang on bones in bone space.
// Leg segments rest straight down (or along their rest direction) so IK can rotate from a known rest vector.
// Creature space: +z forward, +y up, ground at y = 0.
import { lerp, Rand } from '../core/rand';
import { bodyLength, type Design } from './design';
import type { Plan } from './genes';

export type Mat = 'body' | 'belly' | 'head' | 'limb' | 'foot' | 'eye' | 'compound' | 'mouth' | 'teeth' | 'claw' | 'horn' | 'shell' | 'membrane' | 'fur' | 'lantern' | 'plate' | 'spike' | 'nose';
export type V3 = [number, number, number];
export interface BoneDef { name: string; parent: number; pos: V3 }
export interface Box { bone: number; c: V3; s: V3; mat: Mat; rx?: number; ry?: number; rz?: number }
/** a flat card (fur, wings): centre, half-extents along two in-plane axes */
export interface Card { bone: number; c: V3; u: V3; v: V3; mat: Mat }
export interface LegDef {
  side: 1 | -1; pair: number; kind: 'insect' | 'fore' | 'hind' | 'bird' | 'spider';
  bones: number[]; lens: number[];
  /** rest foot position in creature space (x, z) */
  foot: [number, number];
  phase: number;
}
export interface Rig {
  plan: Plan;
  bones: BoneDef[]; boxes: Box[]; cards: Card[]; legs: LegDef[];
  root: number; head: number; jaw: number; neck: number[]; tail: number[]; spine: number[]; wings: number[]; antennae: number[]; mandibles: number[]; stalks: number[];
  /** body clearance at rest, body length, bounding height, stride length */
  rideH: number; length: number; height: number; stride: number; width: number;
  /** gait: per-pair phase offsets; duty factor */
  duty: number;
}

class B {
  bones: BoneDef[] = []; boxes: Box[] = []; cards: Card[] = [];
  bone(name: string, parent: number, pos: V3) { this.bones.push({ name, parent, pos }); return this.bones.length - 1; }
  box(bone: number, c: V3, s: V3, mat: Mat, rot: { rx?: number; ry?: number; rz?: number } = {}) { this.boxes.push({ bone, c, s: [Math.max(0.02, s[0]), Math.max(0.02, s[1]), Math.max(0.02, s[2])], mat, ...rot }); }
  card(bone: number, c: V3, u: V3, v: V3, mat: Mat) { this.cards.push({ bone, c, u, v, mat }); }
  /** world rest position of a bone */
  world(i: number): V3 { let x = 0, y = 0, z = 0; while (i >= 0) { const b = this.bones[i]; x += b.pos[0]; y += b.pos[1]; z += b.pos[2]; i = b.parent; } return [x, y, z]; }
}

const has = (d: Design, g: string) => d.genes.includes(g);

export function buildRig(d: Design): Rig {
  const r = new Rand(d.seed ^ 0x77);
  const b = new B();
  const L = bodyLength(d);
  const rig: Rig = { plan: d.plan, bones: b.bones, boxes: b.boxes, cards: b.cards, legs: [], root: 0, head: -1, jaw: -1, neck: [], tail: [], spine: [], wings: [], antennae: [], mandibles: [], stalks: [], rideH: 0, length: L, height: 0, stride: 0, width: 0, duty: 0.6 };
  switch (d.plan) {
    case 'hexapod': case 'octopod': arthropod(d, b, rig, L, r); break;
    case 'serpent': serpent(d, b, rig, L, r); break;
    case 'gastropod': gastropod(d, b, rig, L, r); break;
    default: vertebrate(d, b, rig, L, r); break;
  }
  let top = 0; for (const bx of b.boxes) top = Math.max(top, b.world(bx.bone)[1] + bx.c[1] + bx.s[1] / 2);
  rig.height = top;
  return rig;
}

// ------------------------------------------------------------------------------------------------ vertebrates
function vertebrate(d: Design, b: B, rig: Rig, L: number, r: Rand) {
  const biped = d.plan === 'biped' || d.plan === 'hominid', six = d.plan === 'hexapodV';
  const T = L * (biped ? 0.42 : 0.58);
  const W = L * lerp(0.2, 0.36, d.girth), H = W * (biped ? 1.15 : 1.05);
  const legLen = L * lerp(0.28, 0.62, d.legLen) * (biped ? 1.35 : 1);
  const lt = W * lerp(0.22, 0.42, d.legThick);
  const hooves = has(d, 'leg_hooved'), pillars = has(d, 'leg_pillar'), runner = has(d, 'leg_cursorial');
  rig.rideH = legLen + H * 0.15; rig.width = W;
  const root = b.bone('hips', -1, [0, rig.rideH, biped ? 0 : -T * 0.42]);
  const chest = b.bone('chest', root, biped ? [0, H * (d.plan === 'hominid' ? 0.9 : 0.08), T * (d.plan === 'hominid' ? 0.1 : 0.8)] : [0, H * 0.05, T * 0.84]);
  rig.root = root; rig.spine = [root, chest];
  // torso: hips, chest, a belly join, a back line
  b.box(root, [0, 0, 0.02 * L], [W * 0.92, H * 0.88, T * 0.52], 'body');
  b.box(chest, [0, 0, -T * 0.12], [W, H, T * 0.62], 'body', biped && d.plan !== 'hominid' ? { rx: -0.12 } : {});
  b.box(root, [0, -H * 0.12, T * 0.42], [W * 0.84, H * 0.72, T * 0.5], 'belly');
  if (has(d, 'osteoderms')) {
    // glyptodont dome: overlapping plated slabs and a skirt
    b.box(root, [0, H * 0.22, T * 0.38], [W * 1.32, H * 0.95, T * 1.32], 'plate');
    b.box(root, [0, H * 0.62, T * 0.38], [W * 1.05, H * 0.3, T * 1.05], 'plate');
    b.box(root, [0, -H * 0.24, T * 0.38], [W * 1.36, H * 0.22, T * 1.36], 'plate');
  }
  if (has(d, 'quills')) for (let i = 0; i < 9; i++) {
    const z = lerp(-T * 0.2, T * 0.95, i / 8), x = (i % 3 - 1) * W * 0.28;
    b.box(root, [x, H * 0.5 + 0.02, z], [lt * 0.18, H * 0.55, lt * 0.18], 'spike', { rx: -0.9, rz: x * 0.6 });
  }
  if (d.cover === 'fur' || has(d, 'fur')) {
    // a ragged mane down the back and a fringe under the belly
    const n = Math.max(3, Math.round(T / 0.18));
    for (let i = 0; i < n; i++) { const z = lerp(-T * 0.15, T * 0.95, i / (n - 1)); b.card(root, [0, H * 0.5 + H * 0.08, z], [0, 0, T / n * 0.75], [0, H * 0.1, -0.02], 'fur'); }
    if (!biped) for (const s of [-1, 1]) b.card(root, [s * W * 0.47, -H * 0.4, T * 0.4], [0, 0, T * 0.5], [0, -H * 0.08, 0], 'fur');
  }
  // neck and head
  const neckLen = L * lerp(0.1, biped ? 0.42 : 0.3, d.neck);
  const nAng = biped ? 0.55 : 0.7;
  const neck = b.bone('neck', chest, biped ? [0, H * 0.22, T * 0.2] : [0, H * 0.28, T * 0.22]);
  const nk = Math.max(lt * 1.2, W * 0.55);
  b.box(neck, [0, Math.sin(nAng) * neckLen * 0.5, Math.cos(nAng) * neckLen * 0.5], [nk, nk, neckLen + nk * 0.4], 'body', { rx: -nAng });
  if (d.cover === 'fur' && !biped) b.card(neck, [0, Math.sin(nAng) * neckLen * 0.5 + nk * 0.55, Math.cos(nAng) * neckLen * 0.5 - nk * 0.2], [0, Math.sin(nAng) * neckLen * 0.5, Math.cos(nAng) * neckLen * 0.5], [0, nk * 0.3, -nk * 0.2], 'fur');
  rig.neck = [neck];
  const hl = L * lerp(0.16, 0.3, d.head), hw = Math.max(W * 0.55, hl * 0.62), hh = hw * 0.85;
  const head = b.bone('head', neck, [0, Math.sin(nAng) * neckLen, Math.cos(nAng) * neckLen]);
  rig.head = head;
  const beak = has(d, 'beak');
  b.box(head, [0, hh * 0.1, hl * 0.12], [hw, hh, hl * 0.55], 'head');
  // snout + nose
  const sl = hl * (beak ? 0.5 : has(d, 'carnassials') ? 0.55 : 0.6);
  b.box(head, [0, -hh * 0.06, hl * 0.38 + sl * 0.38], [hw * 0.68, hh * 0.52, sl], beak ? 'horn' : 'head');
  if (!beak) b.box(head, [0, hh * 0.08, hl * 0.38 + sl * 0.88], [hw * 0.4, hh * 0.2, hl * 0.06], 'nose');
  // jaw
  const jaw = b.bone('jaw', head, [0, -hh * 0.3, hl * 0.28]);
  rig.jaw = jaw;
  b.box(jaw, [0, -hh * 0.05, sl * 0.45], [hw * 0.6, hh * 0.22, sl * 0.95], beak ? 'horn' : 'head');
  if (has(d, 'carnassials') || has(d, 'tusks')) {
    for (const s of [-1, 1]) b.box(head, [s * hw * 0.22, -hh * 0.36, hl * 0.38 + sl * 0.7], [hw * 0.08, hh * (has(d, 'tusks') ? 0.5 : 0.24), hw * 0.08], 'teeth', has(d, 'tusks') ? { rx: -0.6 } : {});
  }
  // eyes
  const fore = has(d, 'eye_binocular');
  const er = Math.max(0.03, hw * 0.16);
  for (const s of [-1, 1]) b.box(head, fore ? [s * hw * 0.24, hh * 0.24, hl * 0.4] : [s * hw * 0.5, hh * 0.22, hl * 0.25], [fore ? er * 1.2 : er * 0.5, er, fore ? er * 0.5 : er * 1.2], 'eye');
  if (has(d, 'ears')) for (const s of [-1, 1]) b.box(head, [s * hw * 0.42, hh * 0.62, -hl * 0.04], [hw * 0.12, hh * 0.7, hw * 0.34], 'head', { rz: -s * 0.55, rx: 0.25 });
  if (has(d, 'electro')) for (let i = 0; i < 4; i++) b.box(head, [(i - 1.5) * hw * 0.14, hh * 0.18, hl * 0.38 + sl * 0.7], [hw * 0.07, hh * 0.07, hw * 0.07], 'lantern');
  if (has(d, 'horns')) for (const s of [-1, 1]) {
    const hz = hl * 0.22, hy = hh * 0.55;
    const len = hl * r.range(0.45, 0.8), tk = Math.max(0.025, hw * 0.13);
    b.box(head, [s * hw * 0.3, hy + len * 0.32, hz], [tk, len * 0.7, tk], 'horn', { rx: 0.5, rz: -s * 0.45 });
    b.box(head, [s * (hw * 0.3 + len * 0.28), hy + len * 0.68, hz + len * 0.3], [tk * 0.7, len * 0.45, tk * 0.7], 'horn', { rx: 1.0, rz: -s * 0.2 });
  }
  if (has(d, 'antlers')) for (const s of [-1, 1]) {
    const len = hl * r.range(0.9, 1.4), tk = Math.max(0.02, hw * 0.07);
    const bx = s * hw * 0.3, by = hh * 0.55;
    b.box(head, [bx + s * len * 0.15, by + len * 0.35, 0], [tk, len * 0.75, tk], 'horn', { rz: -s * 0.35, rx: -0.2 });
    for (let t = 0; t < 3; t++) b.box(head, [bx + s * len * (0.22 + t * 0.12), by + len * (0.3 + t * 0.22), len * 0.1], [tk * 0.8, len * 0.3, tk * 0.8], 'horn', { rx: 0.7, rz: -s * 0.7 });
  }
  // tail
  const tailLen = L * lerp(0.15, biped ? 0.95 : 0.6, d.tail) * (has(d, 'tail_balance') || has(d, 'tail_club') ? 1.2 : 0.7);
  if (d.plan !== 'hominid') {
    const n = 4, seg = tailLen / n;
    let p = root, tw = W * 0.42;
    for (let i = 0; i < n; i++) {
      const tb = b.bone('tail' + i, p, i === 0 ? [0, H * 0.12, -T * 0.25] : [0, -seg * (biped ? 0.04 : 0.14), -seg]);
      b.box(tb, [0, -seg * 0.06, -seg * 0.5], [tw, tw * 0.9, seg * 1.05], i === 0 ? 'body' : 'limb');
      tw *= 0.74; p = tb; rig.tail.push(tb);
    }
    if (has(d, 'tail_club')) b.box(rig.tail[n - 1], [0, -seg * 0.1, -seg * 1.05], [W * 0.5, W * 0.4, W * 0.55], 'plate');
    else if (d.cover === 'fur') b.card(rig.tail[n - 1], [0, -seg * 0.1, -seg * 0.95], [0, 0, seg * 0.5], [0, W * 0.25, 0], 'fur');
  }
  // legs
  const pairs: { z: number; parent: number; kind: 'fore' | 'hind' | 'bird' }[] = [];
  if (biped) pairs.push({ z: 0, parent: root, kind: 'bird' });
  else {
    pairs.push({ z: T * 0.02, parent: chest, kind: 'fore' });
    if (six) pairs.push({ z: T * 0.42, parent: root, kind: 'fore' });
    pairs.push({ z: 0, parent: root, kind: 'hind' });
  }
  rig.stride = legLen * (hooves || runner ? 0.95 : 0.75);
  pairs.forEach((pp, pi) => {
    for (const s of [-1, 1] as const) {
      const hipY = biped ? -H * 0.05 : -H * 0.28;
      const hx = s * W * (biped ? 0.36 : 0.4);
      const startY = rig.rideH + hipY + b.world(pp.parent)[1] - rig.rideH;
      const total = startY; // down to the ground
      const three = pp.kind !== 'fore' && (runner || hooves || pp.kind === 'bird');
      const lens = three ? [total * 0.42, total * 0.36, total * 0.22] : [total * 0.5, total * 0.5];
      const up = b.bone('leg' + pi + s, pp.parent, [hx, hipY, pp.z]);
      const bones = [up];
      b.box(up, [0, -lens[0] / 2, 0], [lt * (pp.kind === 'hind' ? 1.25 : 1.08), lens[0] + lt * 0.3, lt * (pp.kind === 'hind' ? 1.45 : 1.15)], 'limb');
      const lo = b.bone('leg' + pi + s + 'b', up, [0, -lens[0], 0]);
      bones.push(lo);
      b.box(lo, [0, -lens[1] / 2, 0], [lt * 0.78, lens[1] + lt * 0.2, lt * 0.82], 'limb');
      let last = lo;
      if (three) { const me = b.bone('leg' + pi + s + 'c', lo, [0, -lens[1], 0]); bones.push(me); b.box(me, [0, -lens[2] / 2, 0], [lt * 0.6, lens[2], lt * 0.62], 'limb'); last = me; }
      const fl = lens[lens.length - 1];
      const foot = b.bone('foot' + pi + s, last, [0, -fl, 0]);
      bones.push(foot);
      if (hooves) b.box(foot, [0, lt * 0.18, lt * 0.08], [lt * 0.78, lt * 0.42, lt * 0.88], 'claw');
      else if (pillars) b.box(foot, [0, lt * 0.14, lt * 0.06], [lt * 1.25, lt * 0.32, lt * 1.3], 'foot');
      else if (pp.kind === 'bird') { b.box(foot, [0, lt * 0.1, lt * 0.42], [lt * 0.9, lt * 0.2, lt * 1.15], 'foot'); b.box(foot, [0, lt * 0.08, lt * 1.02], [lt * 0.9, lt * 0.16, lt * 0.2], 'claw'); }
      else { b.box(foot, [0, lt * 0.12, lt * 0.22], [lt * 0.95, lt * 0.26, lt * 1.15], 'foot'); b.box(foot, [0, lt * 0.08, lt * 0.82], [lt * 0.8, lt * 0.14, lt * 0.12], 'claw'); }
      if (d.cover === 'fur' && pp.kind !== 'bird') b.card(lo, [s * lt * 0.42, -lens[1] * 0.35, -lt * 0.2], [0, lens[1] * 0.3, 0], [0, 0, -lt * 0.3], 'fur');
      rig.legs.push({ side: s, pair: pi, kind: pp.kind, bones, lens, foot: [hx * 1.02, pp.z + b.world(pp.parent)[2]], phase: 0 });
    }
  });
  // arms on bipeds
  if (biped) for (const s of [-1, 1]) {
    const al = L * 0.2 * (d.plan === 'hominid' ? 2 : 1);
    const ua = b.bone('arm' + s, chest, [s * W * 0.46, -H * 0.1, T * 0.05]);
    b.box(ua, [0, -al * 0.25, al * 0.15], [lt * 0.45, al * 0.55, lt * 0.45], 'limb', { rx: 0.5 });
    b.box(ua, [0, -al * 0.5, al * 0.45], [lt * 0.35, lt * 0.25, al * 0.35], 'claw');
    rig.mandibles.push(ua);
  }
  // wings
  if (has(d, 'wing_patagium')) for (const s of [-1, 1]) {
    const wb = b.bone('wing' + s, chest, [s * W * 0.5, H * 0.3, 0]);
    const span = L * 0.9;
    b.box(wb, [s * span * 0.5, 0, 0], [span, lt * 0.25, lt * 0.25], 'limb');
    b.card(wb, [s * span * 0.5, -0.01, -T * 0.25], [s * span * 0.5, 0, 0], [0, 0, T * 0.32], 'membrane');
    rig.wings.push(wb);
  }
  // gait: walk duty
  rig.duty = biped ? 0.55 : 0.62;
  // diagonal pairs: fore/hind on the same side half a cycle apart
  for (const lg of rig.legs) lg.phase = (lg.pair % 2 === 0 ? 0 : 0.5) + (lg.side > 0 ? 0.5 : 0) + (six && lg.pair === 1 ? 0.25 : 0);
  if (biped) for (const lg of rig.legs) lg.phase = lg.side > 0 ? 0 : 0.5;
}

// ------------------------------------------------------------------------------------------------ arthropods
function arthropod(d: Design, b: B, rig: Rig, L: number, r: Rand) {
  const spider = d.plan === 'octopod';
  const W = L * lerp(0.24, 0.42, d.girth), H = W * 0.62;
  const legLen = L * lerp(0.45, 0.95, d.legLen) * (spider ? 1.3 : 1);
  const lt = Math.max(0.018, W * lerp(0.1, 0.2, d.legThick));
  rig.rideH = Math.max(H * 0.75, legLen * 0.32);
  rig.width = W;
  const thL = L * (spider ? 0.36 : 0.26);
  const root = b.bone('thorax', -1, [0, rig.rideH, 0]);
  rig.root = root;
  b.box(root, [0, 0, 0], [W * (spider ? 0.95 : 0.78), H * (spider ? 0.8 : 0.9), thL], 'body');
  b.box(root, [0, -H * 0.36, 0], [W * 0.6, H * 0.22, thL * 0.8], 'belly');
  // head
  const hl = L * lerp(0.14, 0.22, d.head);
  const head = b.bone('head', root, [0, H * 0.06, thL * 0.5]);
  rig.head = head; rig.jaw = -1;
  const hw = W * (spider ? 0.62 : 0.66);
  b.box(head, [0, 0, hl * 0.45], [hw, H * 0.72, hl], 'head');
  if (has(d, 'eye_compound') && !spider) for (const s of [-1, 1]) b.box(head, [s * hw * 0.48, H * 0.12, hl * 0.55], [hw * 0.24, H * 0.46, hl * 0.48], 'compound');
  if (spider) for (let i = 0; i < 4; i++) b.box(head, [(i % 2 ? 1 : -1) * hw * (i < 2 ? 0.16 : 0.34), H * (i < 2 ? 0.36 : 0.28), hl * 0.96], [hw * 0.12, hw * 0.12, 0.02], 'eye');
  if (has(d, 'antennae')) for (const s of [-1, 1]) {
    const a0 = b.bone('ant' + s, head, [s * hw * 0.22, H * 0.3, hl * 0.85]);
    const al = L * r.range(0.25, 0.45);
    b.box(a0, [s * al * 0.12, al * 0.22, al * 0.2], [lt * 0.5, lt * 0.5, al * 0.5], 'limb', { rx: -0.8, ry: s * 0.4 });
    const a1 = b.bone('ant' + s + 'b', a0, [s * al * 0.24, al * 0.42, al * 0.4]);
    b.box(a1, [s * al * 0.14, al * 0.05, al * 0.24], [lt * 0.42, lt * 0.42, al * 0.52], 'limb', { rx: -0.15, ry: s * 0.5 });
    rig.antennae.push(a0, a1);
  }
  if (has(d, 'mandibles') || has(d, 'venom_fangs')) for (const s of [-1, 1]) {
    const m = b.bone('mand' + s, head, [s * hw * 0.24, -H * 0.18, hl * 0.95]);
    const ml = hl * (has(d, 'venom_fangs') ? 0.4 : 0.55);
    if (has(d, 'venom_fangs')) b.box(m, [0, -ml * 0.35, ml * 0.15], [hw * 0.18, ml * 0.75, hw * 0.18], 'claw', { rx: 0.4 });
    else b.box(m, [-s * ml * 0.12, 0, ml * 0.42], [hw * 0.16, H * 0.16, ml], 'claw', { ry: -s * 0.45 });
    rig.mandibles.push(m);
  }
  if (has(d, 'proboscis')) b.box(head, [0, -H * 0.3, hl * 0.95], [lt * 0.5, lt * 0.5, hl * 0.6], 'claw', { rx: 0.9 });
  // abdomen chain
  const ab = L * (spider ? 0.46 : 0.5);
  const n = spider ? 1 : Math.max(2, Math.min(4, d.segs));
  let p = root, aw = W * (spider ? 1.25 : 1.02), ah = H * (spider ? 1.35 : 1.05);
  const seg = ab / n;
  for (let i = 0; i < n; i++) {
    const sb = b.bone('abd' + i, p, i === 0 ? [0, spider ? H * 0.18 : 0, -thL * 0.5] : [0, 0, -seg * 0.92]);
    const k = spider ? 1 : 1 - (i / n) * 0.42;
    b.box(sb, [0, spider ? H * 0.12 : 0, -seg * 0.5], [aw * k, ah * k, seg * (spider ? 1 : 1.04)], 'body');
    b.box(sb, [0, -ah * k * 0.42, -seg * 0.5], [aw * k * 0.8, ah * 0.12, seg * 0.86], 'belly');
    if (has(d, 'biolum') && i === n - 1) b.box(sb, [0, -ah * k * 0.18, -seg * 0.75], [aw * k * 0.7, ah * k * 0.56, seg * 0.42], 'lantern');
    p = sb; rig.tail.push(sb);
  }
  if (has(d, 'stinger')) b.box(p, [0, 0, -seg * 1.08], [lt, lt, seg * 0.42], 'claw', { rx: -0.35 });
  if (has(d, 'elytra')) for (const s of [-1, 1]) b.box(rig.tail[0], [s * aw * 0.26, ah * 0.36, -ab * 0.42], [aw * 0.54, ah * 0.32, ab * 1.02], 'shell');
  if (has(d, 'chitin_spines')) for (let i = 0; i < 5; i++) b.box(root, [(i % 2 ? 1 : -1) * W * 0.3, H * 0.5, lerp(-thL * 0.4, thL * 0.4, i / 4)], [lt * 0.5, H * 0.5, lt * 0.5], 'spike', { rx: -0.5 });
  if (has(d, 'wing_gossamer')) for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const wb = b.bone('wing' + s + k, root, [s * W * 0.25, H * 0.48, thL * (k ? -0.1 : 0.2)]);
    const wl = L * 0.8;
    b.card(wb, [s * W * 0.15, 0.005 * k, -wl * 0.5], [s * W * 0.35, 0, 0], [0, 0, wl * 0.5], 'membrane');
    rig.wings.push(wb);
  }
  // legs: pairs spread along the thorax, feet splayed
  const pairsN = spider ? 4 : 3;
  rig.stride = legLen * 0.42;
  for (let pi = 0; pi < pairsN; pi++) for (const s of [-1, 1] as const) {
    const zt = lerp(thL * 0.42, -thL * 0.45, pi / (pairsN - 1));
    const scythe = !spider && pi === 0 && has(d, 'leg_raptorial');
    const pincer = !spider && pi === 0 && has(d, 'chela');
    const jumper = !spider && pi === pairsN - 1 && has(d, 'leg_saltatorial');
    const coxa = b.bone('leg' + pi + s, root, [s * W * 0.38, -H * 0.2, zt]);
    if (scythe || pincer) {
      const fl = legLen * 0.5;
      b.box(coxa, [s * fl * 0.1, fl * 0.15, fl * 0.32], [lt * 1.4, lt * 1.6, fl * 0.75], 'limb', { rx: -0.5 });
      if (pincer) b.box(coxa, [s * fl * 0.05, fl * 0.12, fl * 0.85], [lt * 3.2, lt * 2.4, fl * 0.55], 'claw');
      else b.box(coxa, [s * fl * 0.08, -fl * 0.1, fl * 0.55], [lt * 1.0, fl * 0.5, lt * 1.1], 'spike', { rx: 0.6 });
      rig.mandibles.push(coxa);
      continue;
    }
    const spread = (spider ? 0.85 : 0.6) * legLen;
    const angZ = (pi - (pairsN - 1) / 2) * (spider ? 0.55 : 0.45);
    const fx = s * (W * 0.4 + spread * Math.cos(angZ) * 0.8), fz = zt + spread * Math.sin(angZ) * 0.9 * (pi < pairsN / 2 ? 1 : 1);
    const l1 = legLen * (jumper ? 0.6 : 0.48), l2 = legLen * (jumper ? 0.62 : 0.55);
    const fem = b.bone('leg' + pi + s + 'a', coxa, [0, 0, 0]);
    b.box(fem, [0, -l1 / 2, 0], [lt * (jumper ? 2.2 : 1.15), l1, lt * (jumper ? 2.4 : 1.15)], 'limb');
    const tib = b.bone('leg' + pi + s + 'b', fem, [0, -l1, 0]);
    b.box(tib, [0, -l2 / 2, 0], [lt * 0.8, l2, lt * 0.8], 'limb');
    const tar = b.bone('foot' + pi + s, tib, [0, -l2, 0]);
    b.box(tar, [0, lt * 0.1, 0], [lt * 0.7, lt * 0.4, lt * 0.7], 'claw');
    rig.legs.push({ side: s, pair: pi, kind: spider ? 'spider' : 'insect', bones: [fem, tib, tar], lens: [l1, l2], foot: [fx, fz], phase: 0 });
  }
  // alternating tripods (insects) / alternating tetrapods (spiders)
  for (const lg of rig.legs) lg.phase = ((lg.pair + (lg.side > 0 ? 1 : 0)) % 2) * 0.5;
  rig.duty = 0.55;
  void r;
}

// ------------------------------------------------------------------------------------------------ serpents
function serpent(d: Design, b: B, rig: Rig, L: number, r: Rand) {
  const n = Math.max(6, Math.min(14, d.segs));
  const W = L * lerp(0.07, 0.13, d.girth), seg = L / n;
  rig.rideH = W * 0.5; rig.width = W; rig.stride = seg * 2;
  const head = b.bone('head', -1, [0, rig.rideH, L * 0.45]);
  rig.root = head; rig.head = head;
  b.box(head, [0, 0, 0], [W * 1.25, W * 1.05, seg * 1.3], 'head');
  b.box(head, [0, -W * 0.05, seg * 0.66], [W * 1.05, W * 0.85, 0.02], 'mouth');
  if (has(d, 'eye_spots')) for (const s of [-1, 1]) b.box(head, [s * W * 0.6, W * 0.25, seg * 0.3], [0.02, W * 0.22, W * 0.22], 'eye');
  let p = head, w = W;
  for (let i = 0; i < n; i++) {
    const sb = b.bone('seg' + i, p, [0, 0, -seg]);
    const k = i < n * 0.3 ? 1 : 1 - ((i - n * 0.3) / (n * 0.7)) * 0.65;
    b.box(sb, [0, 0, 0], [w * k * 1.08, w * k * 0.92, seg * 1.12], i % 2 ? 'body' : 'limb');
    b.box(sb, [0, -w * k * 0.4, 0], [w * k * 0.8, w * k * 0.16, seg * 1.0], 'belly');
    if (has(d, 'setae') && i % 2 === 0) for (const s of [-1, 1]) b.box(sb, [s * w * k * 0.6, -w * 0.2, 0], [w * 0.35, 0.02, 0.02], 'spike');
    rig.spine.push(sb); p = sb;
  }
  void r;
}

// ------------------------------------------------------------------------------------------------ gastropods
function gastropod(d: Design, b: B, rig: Rig, L: number, r: Rand) {
  const W = L * lerp(0.22, 0.34, d.girth), H = W * 0.55;
  rig.rideH = H * 0.5; rig.width = W; rig.stride = L * 0.3;
  const root = b.bone('foot', -1, [0, rig.rideH, 0]);
  rig.root = root;
  b.box(root, [0, -H * 0.15, 0], [W, H * 0.7, L], 'body');
  b.box(root, [0, -H * 0.42, 0], [W * 1.08, H * 0.16, L * 1.02], 'belly');
  const head = b.bone('head', root, [0, H * 0.3, L * 0.45]);
  rig.head = head;
  b.box(head, [0, H * 0.1, 0], [W * 0.78, H * 0.95, L * 0.22], 'head');
  for (const s of [-1, 1]) {
    const st = b.bone('stalk' + s, head, [s * W * 0.2, H * 0.55, L * 0.05]);
    const sl = L * 0.32;
    b.box(st, [s * sl * 0.12, sl * 0.45, sl * 0.12], [W * 0.09, sl, W * 0.09], 'limb', { rz: -s * 0.25, rx: 0.25 });
    b.box(st, [s * sl * 0.24, sl * 0.95, sl * 0.24], [W * 0.17, W * 0.17, W * 0.17], 'eye');
    rig.stalks.push(st);
    b.box(head, [s * W * 0.3, -H * 0.15, L * 0.14], [W * 0.08, W * 0.08, L * 0.12], 'limb', { rx: 0.4 });
  }
  if (has(d, 'shell')) {
    const sh = b.bone('shell', root, [0, H * 0.35, -L * 0.05]);
    const S = L * 0.48;
    b.box(sh, [0, S * 0.42, 0], [W * 0.9, S * 0.86, S], 'shell');
    b.box(sh, [0, S * 0.66, -S * 0.12], [W * 0.95, S * 0.52, S * 0.66], 'shell', { rx: 0.4 });
    b.box(sh, [0, S * 0.86, -S * 0.2], [W * 0.98, S * 0.3, S * 0.36], 'shell', { rx: 0.8 });
    rig.tail.push(sh);
  }
  void r;
}
