// ANATOMY LIBRARY: the general vertebrate. Any quadruped, hexapod or biped from its rig (morph.ts) and a species recipe
// (VertSpec): the body plan becomes trunk cross-sections hung on the rig's spine (tail tip, tail bones, rump, hips,
// waist, barrel, chest, withers, the neck to the nape), the skull family (head.ts SKULLS) is blocked in and seats
// its jaw, mouth lining, teeth and tongue, its eyes (an eyeball on the eye bone, a pupil plate on the pupil bone, an
// upper lid on the lid bone, a lower lid), its ears on the ear bones and its nose; each leg is a kind (legs.ts) with
// its feet; the coat (coat.ts) paints every part by zone; the parts (vparts.ts) and organs (organs.ts) seat on the
// finished surfaces. Everything is skinned to the rig, so the shared Animator's gaits, curl and roll, postures, eyes,
// lids, ears, muscle flex, breathing and jaw all work unchanged.
//   const out = buildVertebrate(design, rig, rest, spec)   -> { geo, tex, tris, den, fill }
import type { RampName } from '../../art/palette';
import type { V3, Wt } from '../kit';
import type { Rig, LegDef } from '../morph';
import type { Design } from '../design';
import { Body, gridSurf, addWeights, type Piece } from './core';
import { trunk, type Station, type TrunkPiece } from './trunk';
import { limb, hoof } from './limb';
import { skull, mandible, eyeball, eyelid, SKULLS, type PupilKind, type Skull } from './head';
import { pupilDisc, pinna, drawEarHollow, noseLeather, drawNostrils, tooth, tongueP, mouthLining, throatSac, whiskers } from './face';
import { legRings, legFoot, footHeight, type LegKind } from './legs';
import { coatCtx, coatPaint, keratinPaint, type Coat, type BodyFrame, type CoatCtx } from './coat';
import { RP } from './paint';
import { sideFrames } from '../cage';
import { growParts, type VPart } from './vparts';
import { growOrgans } from './organs';

type C2 = [RampName, number];
export type Sec = [number, number, number];
export interface TrunkSpec {
  /** cross-sections at the chest, barrel, waist and hips: [half width x W, height above the spine x H, depth below x H] */
  chest: Sec; barrel: Sec; waist: Sec; hips: Sec;
  /** profiles at those four stations (trunk.ts PROFILES) */
  prof?: [string, string, string, string];
  /** the neck: radius at its root and under the skull (x the skull's half width), an arch (x neck length), a dewlap */
  neck?: { r0?: number; r1?: number; arch?: number; dewlap?: number };
  /** the tail: its root radius (x the hips' half height), taper per bone, flattening (<1 side to side for a fin tail) */
  tail?: { r0?: number; taper?: number; flat?: number; tip?: number; droop?: number };
  /** a hump over the shoulders (x H) */
  hump?: number;
}
export interface EyeSpecV { r: number; pupil: PupilKind; iris: C2; sclera?: C2; fwd?: number; turret?: number; lid?: number; sink?: number; lidless?: boolean }
export interface HeadSpecV {
  skull: string;
  /** multipliers on the rig's head length, width and height, the muzzle beyond the stop, nose-down pitch */
  len?: number; wid?: number; hgt?: number; muzzle?: number; pitch?: number;
  tw?: [number, number, number, number][];
  eyes: EyeSpecV;
  ears?: { len: number; wid: number; up?: number; back?: number; out?: number; cup?: number; shape?: number[]; curl?: number };
  nose?: 'leather' | 'disc' | 'nostrils' | 'none';
  teeth?: { canine?: number; incisors?: boolean };
  tongue?: 'flick' | 'shoot' | 'plain';
  whiskers?: number;
  /** a throat sac on the throat bone (x skull half width) */
  throat?: number;
}
export interface LegSpecV { kind: LegKind; r?: number; toes?: number; claw?: number; web?: number; cleft?: boolean }
export interface VertSpec {
  trunk: TrunkSpec; head: HeadSpecV; legs: { fore: LegSpecV; hind: LegSpecV; mid?: LegSpecV };
  coat: Coat; parts: VPart[];
  /** page size; default by body length (512 small, 1024 large) */
  page?: number;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const T3 = (v: V3): [number, number, number] => [v[0], v[1], v[2]];
const dst = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const gs = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
const sst = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** everything a part generator needs to know about the animal being built */
export interface VCtx {
  d: Design; rig: Rig; rest: V3[]; spec: VertSpec; body: Body; C: CoatCtx; F: BodyFrame;
  D: Record<string, number>; W: number; H: number; T: number; L: number;
  bi: (n: string) => number; at: (n: string) => V3;
  /** the spine's skin weights for a point of the trunk */
  spine: (p: V3) => Wt;
  tr: TrunkPiece; trV: (station: string) => number;
  /** the skull: piece, origin, length/width/height, rows and columns by fractional station and ring point */
  sk: TrunkPiece; skC: V3; hl: number; hw: number; hh: number; skRow: (st: number) => number; skCol: (j: number, s: 1 | -1) => number; fam: Skull;
  iH: number; iJ: number;
  /** points along the jaw */
  hinge: V3; chin: V3;
  /** the legs as built: their bones and feet */
  legs: { lg: LegDef; frame: (t: number) => { c: V3; out: V3; fwd: V3; d: V3 }; r: number; kind: LegKind }[];
  seed: number; small: boolean;
}

/** the spine's weights: tail tip to the nose, the barrel breathing on the ribs bone, the shoulder blades riding the
 *  upper forelegs (as the titans', without their elephantine leg poles) */
function spineSkin(rig: Rig, rest: V3[], bi: (n: string) => number): (p: V3) => Wt {
  const at = (n: string) => rest[bi(n)], tails = rig.tail.map((i) => rest[i]);
  const hips = at('hips'), chest = at('chest'), neck = at('neck'), head = rest[rig.head];
  const tip: V3 = tails.length ? (tails.length > 1 ? lerp(tails[tails.length - 2], tails[tails.length - 1], 2) : add(tails[0], [0, 0, -0.3])) : add(hips, [0, 0, -(rig.dims.T ?? 1) * 0.3]);
  const nose: V3 = [head[0], head[1], head[2] + (rig.dims.hl ?? 0.5) * 0.9];
  const J: V3[] = [tip, ...[...tails].reverse(), hips, chest, neck, head, nose];
  const SB = [...[...rig.tail].reverse(), rig.root, rig.root, bi('chest'), bi('neck'), rig.head];
  const iC = bi('chest'), iR = rig.ribs, fore = rig.legs.filter((l) => l.kind === 'fore' && l.pair === 0);
  const W = rig.dims.W, H = rig.dims.H, hipSeg = tails.length + 1;
  return (p) => {
    let best = 0, bd = Infinity, bt = 0;
    for (let s = 0; s + 1 < J.length; s++) {
      const a = J[s], b = J[s + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2));
      const d = Math.hypot((p[0] - a[0] - ab[0] * t) * 0.4, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
      if (d < bd - 1e-9) { bd = d; best = s; bt = t; }
    }
    let w: Wt;
    const me = SB[best];
    if (best === hipSeg) { const k = sst(0.25, 0.95, bt); w = k > 0.01 ? [rig.root, 1 - k, iC, k] : [rig.root, 1]; }
    else {
      const nb = bt > 0.7 && best + 1 < SB.length ? SB[best + 1] : bt < 0.3 && best > 0 ? SB[best - 1] : -1;
      const k = bt > 0.7 ? 0.5 * sst(0.7, 1, bt) : 0.5 * (1 - sst(0, 0.3, bt));
      w = nb >= 0 && nb !== me && k > 0.01 ? [me, 1 - k, nb, k] : [me, 1];
    }
    const extra: [number, number][] = [];
    if (iR >= 0) { const r = rest[iR], k = 0.5 * gs(p[2], r[2], W * 0.45) * sst(r[1] + H * 0.25, r[1] - H * 0.2, p[1]); if (k > 0.03) extra.push([iR, k]); }
    for (const lg of fore) { const up = rest[lg.bones[0]], k = 0.42 * gs(p[2], up[2], W * 0.22) * gs(p[1], up[1] + H * 0.15, H * 0.22) * gs(p[0] * lg.side, Math.abs(up[0]) * 1.15, W * 0.2); if (k > 0.03) extra.push([lg.bones[0], k]); }
    return extra.length ? addWeights(w, extra) : w;
  };
}

export function buildVertebrate(d: Design, rig: Rig, rest: V3[], spec: VertSpec) {
  const bi = (n: string) => { const i = rig.bones.findIndex((b) => b.name === n); if (i < 0) throw new Error('vertebrate: no bone ' + n); return i; };
  const at = (n: string) => rest[bi(n)];
  const D = rig.dims, W = D.W, H = D.H, T = D.T, L = rig.length, seed = (d.seed >>> 0) % 997;
  const small = L < 1.2;
  const body = new Body(spec.page ?? (L > 3 ? 1024 : 512));
  body.seed = d.seed; body.levelCap = 1; body.quickLevels = 0;
  const spine = spineSkin(rig, rest, bi);
  const hips = at('hips'), chest = at('chest'), neck = at('neck'), head = rest[rig.head];
  const tails = rig.tail.map((i) => rest[i]);
  const TS = spec.trunk, HS = spec.head;
  // ---------------------------------------------------------------- the trunk: tail tip to the nape
  const sec = (c: V3, s: Sec, p: string, tw?: Station['tw']): Station => ({ c: add(c, [0, ((s[1] - s[2]) / 2) * H, 0]), s: [s[0] * W, ((s[1] + s[2]) / 2) * H], p, tw });
  const prof = TS.prof ?? ['shoulder', 'barrel', 'sag', 'hips'];
  const st: Station[] = [], names: string[] = [];
  const push = (s: Station, n: string) => { st.push(s); names.push(n); };
  const hipsS = sec(hips, TS.hips, prof[3]), hipH = hipsS.s[1];
  // the skull's measures first (the neck runs into it)
  const fam = SKULLS[HS.skull] ?? SKULLS.canid, seat = fam.seat ?? SKULLS.canid.seat!;
  const hl = D.hl * (HS.len ?? 1), hw = D.hw * 0.62 * (HS.wid ?? 1), hh = D.hh * 0.7 * (HS.hgt ?? 1);
  const skC: V3 = add(head, [0, hh * 0.05, hl * 0.08]);
  if (tails.length) {
    const tl = tails[tails.length - 1], tp = tails.length > 1 ? tails[tails.length - 2] : hips;
    const tt = TS.tail ?? {}, r0 = (tt.r0 ?? 0.55) * hipH, tap = tt.taper ?? 0.8, fl = tt.flat ?? 1;
    const n = tails.length;
    push({ c: add(lerp(tp, tl, 1.0 + (tt.tip ?? 0.7)), [0, -(tt.droop ?? 0) * W, 0]), s: [r0 * Math.pow(tap, n) * 0.35 * fl, r0 * Math.pow(tap, n) * 0.35], p: 'ridge' }, 'tip');
    for (let i = n - 1; i >= 0; i--) { const k = r0 * Math.pow(tap, i); push({ c: tails[i], s: [k * fl, k], p: 'ridge' }, 'tail' + i); }
    push({ c: add(lerp(tails[0], hips, 0.55), [0, hipH * 0.12, 0]), s: [hipsS.s[0] * 0.78, hipH * 0.8], p: 'hips' }, 'rump');
  } else push({ c: add(hips, [0, hipH * 0.1, -T * 0.22]), s: [hipsS.s[0] * 0.6, hipH * 0.6], p: 'round' }, 'rump');
  push(hipsS, 'hips');
  push(sec(lerp(hips, chest, 0.34), TS.waist, prof[2]), 'waist');
  push(sec(lerp(hips, chest, 0.68), TS.barrel, prof[1]), 'barrel');
  const ch = sec(add(chest, [0, 0, T * 0.03]), TS.chest, prof[0]);
  if (TS.hump) { ch.c = add(ch.c, [0, TS.hump * H * 0.5, 0]); ch.s = [ch.s[0], ch.s[1] + TS.hump * H * 0.5]; }
  push(ch, 'chest');
  // the neck: from the withers to under the skull, arched, its radius blending from the chest to the head
  const nr0 = (TS.neck?.r0 ?? 0.8) * hw, nr1 = (TS.neck?.r1 ?? 0.52) * hw, arch = TS.neck?.arch ?? 0.08;
  const nape: V3 = add(skC, [0, hh * 0.05, -hl * 0.22]);
  const nk = (t: number): V3 => { const p = lerp(neck, nape, t), len = dst(neck, nape); return add(p, [0, Math.sin(Math.PI * t) * len * arch, -Math.sin(Math.PI * t) * len * arch * 0.4]); };
  const wd = sec(lerp(chest, neck, 0.62), [Math.max(TS.chest[0] * 0.72, nr0 * 1.15 / W), TS.chest[1] * 0.75, TS.chest[2] * 0.62], 'neck');
  push(wd, 'withers');
  const nl = dst(neck, nape), nst = nl > hw * 3 ? 4 : nl > hw * 1.5 ? 3 : 2;
  for (let k = 0; k < nst; k++) {
    const t = (k + 0.5) / nst, r = nr0 + (nr1 - nr0) * t, dew = (TS.neck?.dewlap ?? 0) * (1 - t);
    push({ c: add(nk(t), [0, -dew * r * 0.5, 0]), s: [r, r * (1.08 + dew)], p: 'neck' }, 'neck' + k);
  }
  push({ c: add(nape, [0, -hh * 0.05, hl * 0.12]), s: [nr1 * 0.92, nr1 * 0.98], p: 'neck' }, 'nape');
  const tr = body.add(trunk({ name: 'trunk', stations: st, tween: 1, capS: true, capE: true, k: 0.9, skin: spine, paint: () => void 0,
    rings: [{ at: names.indexOf('withers'), s: 0.5 }] }));
  tr.reg = 1;
  body.finalize(tr);
  const Rt = tr.grids[0].v.length, trV = (n: string) => tr.row(Math.max(0, names.indexOf(n))) / (Rt - 1);
  // the body frame the coat lays its patterns in (station centres, arc length from the tail tip)
  const fpts = st.map((s) => s.c), ffr = sideFrames(fpts), cum = [0];
  for (let i = 1; i < fpts.length; i++) cum.push(cum[i - 1] + dst(fpts[i], fpts[i - 1]));
  const sOf = (n: string) => cum[Math.max(0, names.indexOf(n))];
  const F: BodyFrame = { pts: fpts, x: ffr.map((f) => f.x), y: ffr.map((f) => f.y), cum, sRump: sOf('rump'), sHips: sOf('hips'), sShoulder: sOf('chest'), sNeck: sOf('withers'), L: cum[cum.length - 1], W };
  const zStop = (fam.z[seat.stop] - 0.04) * hl;
  const C = coatCtx(spec.coat, F, seed, { zStop, skullC: skC });
  tr.paint = coatPaint(C, 'trunk');
  // ---------------------------------------------------------------- the skull
  const iH = rig.head, iN = bi('neck'), iJ = rig.jaw;
  const M = HS.muzzle ?? 1, zS = fam.z[seat.stop];
  const famM: Skull = M === 1 ? fam : { ...fam, z: fam.z.map((z) => (z > zS ? zS + (z - zS) * M : z)) };
  const sk = body.add(skull({ name: 'skull', skull: famM, at: skC, hl, hw, hh, pitch: HS.pitch ?? 0, tw: HS.tw, bones: { head: iH, neck: iN }, k: 1.9, paint: () => void 0 }));
  sk.reg = 3;
  body.finalize(sk);
  const Rs = sk.grids[0].v.length, Cs = sk.grids[0].v[0].length;
  const skRow = (stn: number) => { const a = Math.max(0, Math.min(7, Math.floor(stn))), b = Math.min(7, a + 1), f = Math.max(0, Math.min(1, stn - a)); return (sk.row(a) * (1 - f) + sk.row(b) * f) / (Rs - 1); };
  const skCol = (j: number, s: 1 | -1) => { const a = Math.max(0, Math.min(6, Math.floor(j))), b = Math.min(6, a + 1), f = Math.max(0, Math.min(1, j - a)); const ia = sk.col(a, s); let ib = sk.col(b, s); if (s > 0 && b === 6) ib = Cs; return (ia * (1 - f) + ib * f) / Cs; };
  const cp = Math.cos(HS.pitch ?? 0), sp = Math.sin(HS.pitch ?? 0);
  const hp = (y: number, z: number): V3 => add(skC, [0, y * hh * cp - z * hl * sp, z * hl * cp + y * hh * sp]);
  const nosePlaneZ = famM.z[7];
  // the mandible fitted under the skull's lip line; its bone moved to the hinge; the tongue and throat bones follow it
  const jh = seat.jaw[1] * hh, jw = seat.jaw[0] * hw;
  const mand = mandible({ name: 'jaw', skull: famM, at: skC, hl, hw, hh, pitch: HS.pitch ?? 0, depth: seat.jaw[1] * 1.15, bone: iJ, paint: coatPaint(C, 'jaw'), from: Math.max(0.8, seat.eye[0] - 1.3) });
  const hinge = mand.hinge, chinP = mand.chin;
  rig.bones[iJ].pos = T3(sub(hinge, head)); rest[iJ] = hinge;
  body.add(mand.piece).reg = 6;
  if (rig.tongue >= 0) { const tp = lerp(hinge, chinP, 0.25); rig.bones[rig.tongue].pos = T3(sub(add(tp, [0, -jh * 0.15, 0]), hinge)); rest[rig.tongue] = add(tp, [0, -jh * 0.15, 0]); }
  body.add(mouthLining({ name: 'mouth', back: add(hinge, [0, -jh * 0.1, hl * 0.06]), front: add(lerp(hinge, chinP, 0.8), [0, jh * 0.1, 0]), w: jw * 0.7, h: jh * 0.45, head: iH, jaw: iJ }));
  // ---------------------------------------------------------------- eyes, pupils and lids
  const ES = HS.eyes, er = ES.r * hw;
  const pits: { c: V3; r: number; dir: V3; curl?: number }[] = [];
  rig.eyes.forEach((e, k) => {
    const s = (k === 0 ? -1 : 1) as 1 | -1;
    const q = gridSurf(sk.m, sk.grids[0], skCol(seat.eye[1], s), skRow(seat.eye[0]));
    const fwd = ES.fwd ?? seat.eye[2], turret = ES.turret ?? 0;
    const ax = nrm(add(scl(q.n, 1 - fwd), [s * 0.08 * fwd, 0.08 + turret * 0.3, fwd * 1.1]));
    const sink = ES.sink ?? 0.42;
    const c = add(q.p, add(scl(q.n, -er * sink + turret * er * 1.1), [0, turret * er * 0.3, 0]));
    rig.bones[e.bone].pos = T3(sub(c, head)); rest[e.bone] = c;
    const pc = add(c, scl(ax, er * 1.014));
    rig.bones[e.pupil].pos = T3(sub(pc, c)); rest[e.pupil] = pc;
    body.add(eyeball({ name: 'eye' + k, c, ax, r: er, bone: e.bone, iris: RP(ES.iris[0]), pupil: ES.pupil === 'round' || ES.pupil === 'pin' ? 'pin' : ES.pupil, irisA: 0.66, sclera: ES.sclera ? RP(ES.sclera[0]) : undefined, levels: 0, around: small ? 10 : 12 })).reg = 4;
    if (ES.pupil !== 'w') body.add(pupilDisc({ name: 'pupil' + k, c, ax, r: er, kind: ES.pupil, size: ES.pupil === 'slit' ? 0.62 : ES.pupil === 'bar' ? 0.52 : 0.34, bone: e.pupil }));
    if (turret) {
      // the eye raised on a turret of skin: a collar round the lower two thirds
      body.add(eyelid({ name: 'turret' + k, c, ax: nrm(add(ax, [0, -0.6, 0])), r: er * 1.04, bone: iH, paint: coatPaint(C, 'lid'), lower: true, cover: 0.95 })).reg = 4;
    }
    const lid = rig.lids[k];
    if (lid && !ES.lidless) {
      rig.bones[lid.bone].pos = T3(sub(c, head)); rest[lid.bone] = c;
      lid.axis = nrm(crs([0, 1, 0], ax)) as [number, number, number];
      const lp = body.add(eyelid({ name: 'lid' + k, c, ax, r: er, bone: lid.bone, paint: coatPaint(C, 'lid'), cover: 0.55 + (ES.lid ?? 0) }));
      lp.reg = 4; lp.levels = 0;
      const ll = body.add(eyelid({ name: 'llid' + k, c, ax, r: er * 0.99, bone: iH, paint: coatPaint(C, 'lid'), lower: true, cover: 0.85 }));
      ll.reg = 4; ll.levels = 0;
    }
  });
  // ---------------------------------------------------------------- the ears on their bones
  if (HS.ears && rig.ears.length) {
    const E = HS.ears;
    rig.ears.forEach((ei, k) => {
      const s = (k === 0 ? -1 : 1) as 1 | -1;
      const q = gridSurf(sk.m, sk.grids[0], skCol(seat.ear[1], s), skRow(seat.ear[0]));
      const root = add(q.p, scl(q.n, -hw * 0.06));
      rig.bones[ei].pos = T3(sub(root, head)); rest[ei] = root;
      const dir = nrm([s * (E.out ?? 0.45), E.up ?? 1, -(E.back ?? 0.2)]), face = nrm([s * 0.55, 0.1, 1]);
      const len = E.len * hh, wid = E.wid * hw;
      body.add(pinna({ name: 'ear' + k, root, dir, face, len, wid, cup: E.cup, shape: E.shape, tipCurl: E.curl, bone: ei, headBone: iH, levels: small ? 0 : 1, paint: earPaintWith(C, root, dir, face, len) }));
    });
  }
  // ---------------------------------------------------------------- the nose, teeth, tongue, whiskers, throat
  const noseC = hp(famM.yc[7] - 0.02, nosePlaneZ);
  const nose = HS.nose ?? 'nostrils';
  if (nose === 'leather' || nose === 'disc') {
    const half = famM.half[7], nw = half[3][0] * hw * (nose === 'disc' ? 1.0 : 0.75), nh = (half[0][1] - half[6][1]) * hh * (nose === 'disc' ? 0.45 : 0.32);
    const nc = nose === 'disc' ? add(noseC, [0, 0, -hl * 0.02]) : add(noseC, [0, hh * 0.08, -hl * 0.03]);
    const leather: C2 = spec.coat.face?.nose ?? (nose === 'disc' ? ['hide', 3] : ['ink', 2]);
    const nostrils = [-1, 1].map((s) => ({ c: add(nc, [s * nw * 0.45, -nh * 0.15, nh * 0.6]), r: nw * 0.22, dir: nrm([s * 0.6, 0.6, 0.2]), curl: 0.6 }));
    body.add(noseLeather({ name: 'nose', c: nc, fwd: nrm([0, nose === 'disc' ? 0 : 0.35, 1]), w: nw, h: nh, d: nw * 0.6, bone: iH, paint: leatherPaint(leather, nostrils, nose === 'disc') }));
  } else if (nose === 'nostrils') {
    for (const s of [-1, 1] as const) { const q = gridSurf(sk.m, sk.grids[0], skCol(2.2, s), skRow(6.6)); pits.push({ c: q.p, r: hw * 0.05, dir: nrm([s * 0.5, 0.2, 1]), curl: 0.2 }); }
  }
  sk.paint = coatPaint(C, 'head', { extra: (px) => { drawNostrils(px, pits); drawLips(px, sk, famM, seat, hl, hh, skC, cp, sp, C); } });
  const toothP = keratinPaint('bone', 4, { glint: true });
  const T2 = HS.teeth;
  if (T2?.canine) for (const s of [-1, 1] as const) {
    const up = gridSurf(sk.m, sk.grids[0], skCol(4.6, s), skRow(6.2)), cl = T2.canine * hh;
    body.add(tooth({ name: 'fangU' + s, ctrl: [add(up.p, [0, cl * 0.2, 0]), add(up.p, [s * -cl * 0.04, -cl * 0.5, cl * 0.04]), add(up.p, [s * -cl * 0.06, -cl * 0.95, cl * 0.12])], r: cl * 0.2, bone: iH, paint: toothP }));
    const lo = add(lerp(hinge, chinP, 0.82), [s * jw * 0.62, jh * 0.6, 0]);
    body.add(tooth({ name: 'fangL' + s, ctrl: [add(lo, [0, -cl * 0.2, 0]), add(lo, [0, cl * 0.3, cl * 0.04]), add(lo, [0, cl * 0.6, cl * 0.1])], r: cl * 0.14, bone: iJ, paint: toothP }));
  }
  if (T2?.incisors) for (let i = 0; i < 4; i++) { const x = (i - 1.5) * hw * 0.07, b0 = hp(famM.half[7][5][1] + famM.yc[7] - 0.02, nosePlaneZ - 0.03); body.add(tooth({ name: 'inc' + i, ctrl: [add(b0, [x, hh * 0.04, -hl * 0.02]), add(b0, [x, -hh * 0.05, -hl * 0.01])], r: hw * 0.025, bone: iH, paint: toothP, around: 4 })); }
  if (rig.tongue >= 0 && HS.tongue) {
    const t0 = rest[rig.tongue], tip = add(lerp(hinge, chinP, 0.85), [0, jh * 0.55, 0]);
    body.add(tongueP({ name: 'tongue', root: add(t0, [0, 0, -hl * 0.05]), tip, w: jw * 0.45, bone: rig.tongue, fork: HS.tongue === 'flick', paint: fleshPaint(HS.tongue === 'flick' ? 'violet' : 'flesh', 3) }));
  }
  if (HS.whiskers) {
    const roots: V3[] = [], dirs: V3[] = [];
    for (const s of [-1, 1] as const) for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) {
      const q = gridSurf(sk.m, sk.grids[0], skCol(2.6 + r * 0.45, s), skRow(6.3 + k * 0.35));
      roots.push(add(q.p, scl(q.n, -hw * 0.01))); dirs.push(nrm([s * 1, -0.05 - r * 0.12, 0.2 - k * 0.35]));
    }
    for (const p of whiskers({ name: 'whisk', roots, dirs, len: HS.whiskers * hl, r: hw * 0.012, bone: iH, paint: fleshPaint('bone', 5) })) body.add(p);
  }
  if (HS.throat && rig.throat >= 0) {
    const tc = add(lerp(hinge, chinP, 0.45), [0, -jh * 0.6, 0]);
    rig.bones[rig.throat].pos = T3(sub(tc, head)); rest[rig.throat] = tc;
    body.add(throatSac({ name: 'throat', at: tc, r: [HS.throat * hw, HS.throat * hw * 0.8, HS.throat * hw * 0.7], bone: rig.throat, paint: coatPaint(C, 'jaw', { light: 0.7 }) }));
  }
  // ---------------------------------------------------------------- legs
  const legs: VCtx['legs'] = [];
  const clawPaint = keratinPaint(spec.coat.claw?.[0] ?? 'basalt', spec.coat.claw?.[1] ?? 2, { rings: 0.01 });
  for (const lg of rig.legs) {
    if (lg.kind === 'insect' || lg.kind === 'spider') continue;
    const fore = lg.kind === 'fore', mid = fore && lg.pair === 1 && rig.legs.some((l) => l.kind === 'fore' && l.pair === 0) && rig.plan === 'hexapodV';
    const LS = (mid ? spec.legs.mid : undefined) ?? (fore ? spec.legs.fore : spec.legs.hind);
    const B = lg.bones, J = B.map((b) => rest[b]), s = lg.side;
    const three = B.length === 4;
    const segL = three ? [dst(J[0], J[1]), dst(J[1], J[2]), dst(J[2], J[3])] : [dst(J[0], J[1]), dst(J[1], J[2])];
    const tot = segL.reduce((a, b) => a + b, 0), tj = [0];
    for (const l of segL) tj.push(tj[tj.length - 1] + l / tot);
    const r = D.lt * 0.45 * (LS.r ?? 1);
    const fh = footHeight(LS.kind, r);
    // the knee bends forward on the forelegs too (a horse's carpus, a cat's wrist), unless the rig set a pole
    if (!lg.pole && fore && LS.kind !== 'sprawl') lg.pole = [0, -0.1, 1];
    const foot = legFoot(LS.kind, fore, r, { toes: LS.toes, claw: LS.claw, web: LS.web, small });
    const Lg = limb({
      name: 'leg' + lg.pair + (s > 0 ? 'r' : 'l'), side: s, hip: J[0], knee: J[1], hock: three ? J[2] : undefined, sole: J[J.length - 1], tj,
      bones: { parent: rig.bones[B[0]].parent, up: B[0], lo: B[1], mid: three ? B[2] : undefined, foot: B[B.length - 1], flex: lg.flex },
      rings: legRings(LS.kind, fore, r, tj, segL, fh), foot, around: small ? 8 : 10, levels: 1, k: 1,
      paint: coatPaint(C, 'limb', { inner: [-s, 0, 0], hipY: J[0][1] }), clawPaint,
    });
    Lg.skin.reg = 8; Lg.toes.reg = 8; Lg.claws.reg = 8; Lg.toes.levels = 0; Lg.claws.levels = 0; Lg.claws.farSkip = true;
    Lg.toes.paint = coatPaint(C, 'foot');
    body.add(Lg.skin); if (foot.toes.length) { body.add(Lg.toes); body.add(Lg.claws); }
    if (LS.kind === 'hoof' || LS.kind === 'stilt') {
      const hp2 = body.add(hoof({ name: 'hoof' + lg.pair + (s > 0 ? 'r' : 'l'), sole: J[J.length - 1], r: r * (LS.kind === 'stilt' ? 0.3 : 0.4), h: fh, side: s, bone: B[B.length - 1], cleft: LS.cleft !== false, paint: keratinPaint(spec.coat.horn?.[0] ?? 'basalt', spec.coat.horn?.[1] ?? 2, { rings: fh * 0.18 }), around: small ? 8 : 10 }));
      hp2.reg = 8;
    }
    legs.push({ lg, frame: Lg.frame, r, kind: LS.kind });
  }
  // ---------------------------------------------------------------- parts and organs
  const X: VCtx = { d, rig, rest, spec, body, C, F, D, W, H, T, L, bi, at, spine, tr, trV, sk, skC, hl, hw, hh, skRow, skCol, fam: famM, iH, iJ, hinge, chin: chinP, legs, seed, small };
  growParts(X);
  growOrgans(X);
  const out = body.build({ den: 64, maxScale: 6 });
  if ((globalThis as { __vertStats?: boolean }).__vertStats) console.log(d.name, [...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => k + ':' + v).join(' '));
  return { geo: out.geo, tex: out.tex, tris: out.tris, den: Math.round(body.den), fill: body.page.fill };
}

/** an ear painted from the coat (its back) with the hollow drawn over it */
function earPaintWith(C: CoatCtx, root: V3, dir: V3, face: V3, len: number) {
  const c = C.coat, inner = RP(c.face?.muzzle?.[0] ?? c.belly[0]), dark = RP(c.pattern?.c[0] ?? c.base[0]);
  return coatPaint(C, 'ear', { extra: (px) => drawEarHollow(px, { inner, dark, furred: !!c.surf.body.fur, face, dir, root, len }) });
}
/** moist nose leather: pebbled, a wet sheen on the bridge, the nostrils drawn in */
function leatherPaint(c: C2, nostrils: { c: V3; r: number; dir: V3; curl?: number }[], disc: boolean) {
  const f = (ch: import('./core').Chart, _p: Piece, b: Body) => {
    const px = new PxC(ch, b);
    px.base(() => [RP(c[0]), c[1]]);
    px.pebbles(Math.max(0.002, nostrils[0].r * 0.5), { depth: 0.8 });
    drawNostrils(px, nostrils);
    if (!disc) px.glints(RP('snow'), { every: 0.8, size: nostrils[0].r });
    px.flush();
  };
  (f as unknown as { tone: import('./core').Tone }).tone = { ramp: RP(c[0]), step: c[1] };
  return f;
}
const fleshPaint = (R: RampName, step: number) => { const f = (ch: import('./core').Chart, _p: Piece, b: Body) => { const px = new PxC(ch, b); px.base(() => [RP(R), step]); px.creaseInk(0.6); px.flush(); }; (f as unknown as { tone: import('./core').Tone }).tone = { ramp: RP(R), step }; return f; };
/** the lip line drawn along the skull: a dark seam with the lit lip above it, the corner of the mouth */
function drawLips(px: PxC, _sk: TrunkPiece, fam: Skull, seat: NonNullable<Skull['seat']>, hl: number, hh: number, skC: V3, cp: number, sp: number, C: CoatCtx) {
  const P = px.gb.P, tpm = 1 / px.mpt, z0 = seat.hinge[1] * hl, z1 = fam.z[7] * hl;
  for (let i = 0; i < px.n; i++) {
    const y = P[i * 3 + 1] - skC[1], z = P[i * 3 + 2] - skC[2];
    const lz = z * cp + y * sp, ly = y * cp - z * sp;
    if (lz < z0 || lz > z1 + hl * 0.05) continue;
    // the lip line runs at the height of ring point 5 (interpolated along the stations)
    let k = 0; while (k < 6 && fam.z[k + 1] * hl < lz) k++;
    const f = Math.max(0, Math.min(1, (lz - fam.z[k] * hl) / Math.max(1e-6, (fam.z[k + 1] - fam.z[k]) * hl)));
    const yl = ((fam.half[k][5][1] + fam.yc[k]) * (1 - f) + (fam.half[k + 1][5][1] + fam.yc[k + 1]) * f) * hh;
    const dd = (ly - yl) * tpm;
    if (Math.abs(dd) < 0.8) { px.rampI[i] = px.ramp(RP('ink')); px.step[i] = 1; px.mark[i] = 0; }
    else if (dd > 0.8 && dd < 2.2) px.mark[i] += 0.7;
  }
  void C;
}
import { Px as PxC } from './paint';
export type { VPart };
