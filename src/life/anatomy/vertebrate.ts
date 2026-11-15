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
import { trunk, PROFILES, type Station, type TrunkPiece } from './trunk';
import { limb, hoof, type LimbRing } from './limb';
import { skull, mandible, eyeball, eyelid, SKULLS, type PupilKind, type Skull } from './head';
import { pupilDisc, pinna, drawEarHollow, noseLeather, drawNostrils, tooth, tongueP, mouthLining, throatSac, whiskers } from './face';
import { legRings, legFoot, footHeight, type LegKind } from './legs';
import { coatCtx, coatPaint, keratinPaint, type Coat, type BodyFrame, type CoatCtx } from './coat';
import { RP } from './paint';
import { sac } from './append';
import { sideFrames } from '../cage';
import { growParts, type VPart } from './vparts';
import { growOrgans } from './organs';
import { growCyber, type CyLeg } from '../cyber/mount';
import { CYBER } from '../cyber/catalog';
import { stalk } from './append';

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
  const iC = bi('chest'), iR = rig.ribs, fore = rig.legs.filter((l) => l.kind === 'fore' && l.pair === 0), hind = rig.legs.filter((l) => l.kind === 'hind');
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
    // the haunch over the thigh rides with the femur
    for (const lg of hind) { const up = rest[lg.bones[0]], k = 0.36 * gs(p[2], up[2], W * 0.26) * gs(p[1], up[1] + H * 0.08, H * 0.24) * gs(p[0] * lg.side, Math.abs(up[0]) * 1.15, W * 0.22); if (k > 0.03) extra.push([lg.bones[0], k]); }
    return extra.length ? addWeights(w, extra) : w;
  };
}

export function buildVertebrate(d: Design, rig: Rig, rest: V3[], spec: VertSpec) {
  const bi = (n: string) => { const i = rig.bones.findIndex((b) => b.name === n); if (i < 0) throw new Error('vertebrate: no bone ' + n); return i; };
  const at = (n: string) => rest[bi(n)];
  const D = rig.dims, W = D.W, H = D.H, T = D.T, L = rig.length, seed = (d.seed >>> 0) % 997;
  const small = L < 1.2;
  // a fitted worker's machinery wants texture room: a full page
  const fitted = new Set((d.fit ?? []).filter((id) => CYBER[id]));
  const body = new Body(spec.page ?? (L > 3 || fitted.size ? 1024 : 512));
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
  // the masses a sculptor blocks first, written as a topline (height above the spine), an underline (depth below it)
  // and a width at each station, so the side silhouette curves the way a real quadruped's does: the croup rounded
  // over the hips and the haunch standing out over the thighs; the loin dipping and the belly line tucking up into a
  // narrow waist and flank; the ribs deepening forward to the girth, deepest just behind the elbows; the withers and
  // the scapula ridges rising over the forelegs, the shoulder mass bulging out over the upper arm; the brisket
  // projecting ahead of the forelegs; the neck thick where it leaves the shoulders, tapering into the skull.
  const legAt = (fore: boolean) => {
    const lg = rig.legs.find((l) => (l.kind === 'fore') === fore && l.side > 0 && l.kind !== 'insect' && l.kind !== 'spider' && l.pair <= 1);
    if (!lg) return undefined;
    const LS = fore ? spec.legs.fore : spec.legs.hind, J = lg.bones.map((b) => rest[b]);
    return { x: Math.abs(J[0][0]), y: J[0][1], knee: J[1][1], r: D.lt * 0.45 * (LS.r ?? 1), kind: LS.kind };
  };
  const LF = legAt(true), LH = legAt(false), sprawlF = LF?.kind === 'sprawl', sprawlH = LH?.kind === 'sprawl';
  // the girth: the deepest the ribcage goes (a leggy runner's chest drops toward its elbows, within reason)
  let G = Math.max(TS.chest[2], TS.barrel[2]) * 1.06;
  if (LF && !sprawlF) G = Math.max(G, Math.min(G * 1.18, ((chest[1] - LF.knee) * 0.72) / H));
  const sagging = prof[2] === 'sag' && TS.waist[2] >= G * 0.75;
  const waistD = Math.min(TS.waist[2], G * (sagging ? 0.8 : 0.66)), waistW = Math.min(TS.waist[0], Math.max(TS.barrel[0], TS.chest[0]) * 0.84);
  /** widen a station's flank points (profile indices `js`, half-widths) so they reach `need` metres out */
  const bulge = (sw: number, P: string, need: number, js: [number, number][]): [number, number, number][] => {
    const pr = PROFILES[P] ?? PROFILES.round, out: [number, number, number][] = [];
    for (const [j, f] of js) { const want = (need / sw) * f; if (want > pr[j][0]) out.push([j, want - pr[j][0], 0]); }
    return out;
  };
  const hzS: Sec = [TS.hips[0], TS.hips[1] + 0.06, TS.hips[2] + 0.03];
  const hzW = hzS[0] * W, haunch = LH && !sprawlH ? LH.x + LH.r * 1.05 : 0;
  const hz = sec(hips, hzS, prof[3], [[1, 0.04, 0.05], [2, 0.1, 0.03], ...bulge(hzW, prof[3], haunch, [[3, 0.97], [4, 1.0], [5, 0.96], [6, 0.78]])]);
  hz.c = add(hz.c, [0, H * 0.02, 0]);
  push(hz, 'hips');
  push(sec(lerp(hips, chest, 0.32), [waistW, TS.waist[1] * 0.94, waistD], sagging ? 'sag' : 'barrel', [[6, 0, 0.06], [7, 0, 0.05]]), 'waist');
  const ribW = Math.max(TS.barrel[0], TS.chest[0]);
  push(sec(lerp(hips, chest, 0.6), [TS.barrel[0] * 1.03, TS.barrel[1], G * 0.9], prof[1]), 'barrel');
  push(sec(lerp(hips, chest, 0.84), [ribW * 1.02, (TS.barrel[1] + TS.chest[1]) / 2 + 0.03, G], 'barrel', [[5, 0.02, -0.03], [7, 0, -0.03]]), 'girth');
  const chS: Sec = [TS.chest[0] * 0.94, TS.chest[1] + 0.13, G * 0.97], shoulder = LF && !sprawlF ? LF.x + LF.r * 1.05 : 0;
  const ch = sec(add(chest, [0, 0, T * 0.05]), chS, prof[0], [[1, 0.04, 0.06], [2, 0.06, 0.04], [7, -0.12, 0], [8, 0, -0.03], ...bulge(chS[0] * W, prof[0], shoulder, [[3, 0.95], [4, 1.0], [5, 0.98], [6, 0.8]])]);
  if (TS.hump) { ch.c = add(ch.c, [0, TS.hump * H * 0.5, 0]); ch.s = [ch.s[0], ch.s[1] + TS.hump * H * 0.5]; }
  push(ch, 'chest');
  // the brisket: the breastbone's point ahead of the forelegs, narrow and deep, under the root of the neck
  push(sec(add(lerp(chest, neck, 0.28), [0, -H * 0.04, 0]), [TS.chest[0] * 0.8, TS.chest[1] * 0.9 + 0.06, G * 0.86], 'neck', [[7, -0.16, 0], [8, 0, 0.04]]), 'brisket');
  // the neck: from the withers to under the skull, arched; it leaves the shoulders nearly as deep as the chest and
  // tapers (fast at first, then slowly) into the back of the skull
  const nr0 = (TS.neck?.r0 ?? 0.8) * hw, nr1 = (TS.neck?.r1 ?? 0.52) * hw, arch = TS.neck?.arch ?? 0.08;
  const nape: V3 = add(skC, [0, hh * 0.05, -hl * 0.22]);
  const nk = (t: number): V3 => { const p = lerp(neck, nape, t), len = dst(neck, nape); return add(p, [0, Math.sin(Math.PI * t) * len * arch, -Math.sin(Math.PI * t) * len * arch * 0.4]); };
  const wS: Sec = [Math.max(TS.chest[0] * 0.74, (nr0 * 1.15) / W), TS.chest[1] * 0.92 + 0.04, G * 0.66];
  const wd = sec(add(lerp(chest, neck, 0.55), [0, 0, -T * 0.03]), wS, 'shoulder', [[0, 0, -0.04], [1, 0.02, 0.04]]);
  push(wd, 'withers');
  const wHW = wd.s[0], wHH = wd.s[1], nl = dst(neck, nape), nst = nl > hw * 3 ? 4 : nl > hw * 1.5 ? 3 : 2;
  const rootW = Math.max(nr0, wHW * 0.82), rootH = Math.max(nr0 * 1.08, wHH * 0.8);
  for (let k = 0; k < nst; k++) {
    const t = (k + 0.5) / nst, e = Math.pow(t, 0.75), dew = (TS.neck?.dewlap ?? 0) * (1 - t);
    const rw = rootW + (nr1 - rootW) * e, rh = rootH + (nr1 * 1.04 - rootH) * e;
    // the throat runs up from the brisket, the crest of the neck stays high: the centre sits a little above the axis
    push({ c: add(nk(t), [0, (rh - Math.max(rw, nr1)) * 0.25 - dew * rw * 0.5, 0]), s: [rw, rh * (1 + dew)], p: 'neck' }, 'neck' + k);
  }
  push({ c: add(nape, [0, -hh * 0.05, hl * 0.12]), s: [nr1 * 0.92, nr1 * 0.98], p: 'neck' }, 'nape');
  // keep the stations marching forward (a frog's skull sits on its chest: no neck stations behind the withers)
  for (let i = 2; i < st.length; i++) {
    const a = st[i - 2].c, b = st[i - 1].c, c = st[i].c, d0 = nrm(sub(b, a)), step = (c[0] - b[0]) * d0[0] + (c[1] - b[1]) * d0[1] + (c[2] - b[2]) * d0[2];
    if (step < W * 0.04 && names[i] !== 'nape') { st.splice(i, 1); names.splice(i, 1); i--; }
  }
  // a worker fitted with six parts or more wears its machinery over a leaner body cage (the in-between rings go)
  const lean = fitted.size >= 6;
  const tweens = names.map((n) => (n === 'tip' || n.startsWith('tail') || (lean && !n.startsWith('neck')) ? 0 : 1));
  const tr = body.add(trunk({ name: 'trunk', stations: st, tween: tweens, capS: true, capE: true, k: 0.9, skin: spine, paint: () => void 0,
    rings: names.includes('withers') ? [{ at: names.indexOf('withers'), s: 0.5 }] : [] }));
  tr.reg = 1;
  body.finalize(tr);
  const Rt = tr.grids[0].v.length, trV = (n: string) => tr.row(Math.max(0, names.indexOf(n))) / (Rt - 1);
  // the body frame the coat lays its patterns in (station centres, arc length from the tail tip)
  const fpts = st.map((s) => s.c), ffr = sideFrames(fpts), cum = [0];
  for (let i = 1; i < fpts.length; i++) cum.push(cum[i - 1] + dst(fpts[i], fpts[i - 1]));
  const sOf = (n: string, ...fb: string[]): number => { for (const k of [n, ...fb]) { const i = names.indexOf(k); if (i >= 0) return cum[i]; } return cum[cum.length - 1]; };
  const F: BodyFrame = { pts: fpts, x: ffr.map((f) => f.x), y: ffr.map((f) => f.y), cum, sRump: sOf('rump', 'hips'), sHips: sOf('hips'), sShoulder: sOf('chest'), sNeck: sOf('withers', 'chest'), L: cum[cum.length - 1], W };
  const zStop = (fam.z[seat.stop] - 0.04) * hl;
  const C = coatCtx(spec.coat, F, seed, { zStop, skullC: skC });
  tr.paint = coatPaint(C, 'trunk');
  // old wounds: claw rakes down a flank and across a haunch, seated on the trunk's surface
  for (let k = 0; k < (spec.coat.scars ?? 0); k++) {
    const side = k % 2 ? 0.72 : 0.28, v = 0.35 + ((k * 0.37 + seed * 0.013) % 0.45), rake = 3 - (k % 2);
    for (let r = 0; r < rake; r++) {
      const pts: V3[] = []; for (let j = 0; j < 4; j++) { const q = gridSurf(tr.m, tr.grids[0], side + (j / 3 - 0.5) * 0.12, v + r * 0.025 + j * 0.008); pts.push(q.p); }
      C.scarLines.push({ pts, w: W * 0.025 });
    }
  }
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
    const qn: V3 = [q.n[0], Math.min(q.n[1], 0.45), q.n[2]], ax = nrm(add(scl(nrm(qn), 1 - fwd), [s * 0.08 * fwd, 0.08 + turret * 0.15, fwd * 1.1]));
    const sink = ES.sink ?? 0.42;
    const c = add(q.p, add(scl(q.n, -er * sink + turret * er * 1.1), [0, turret * er * 0.3, 0]));
    rig.bones[e.bone].pos = T3(sub(c, head)); rest[e.bone] = c;
    const pc = add(c, scl(ax, er * 1.014));
    rig.bones[e.pupil].pos = T3(sub(pc, c)); rest[e.pupil] = pc;
    body.add(eyeball({ name: 'eye' + k, c, ax, r: er, bone: e.bone, iris: RP(ES.iris[0]), pupil: ES.pupil === 'round' || ES.pupil === 'pin' ? 'pin' : ES.pupil, irisA: 0.66, sclera: ES.sclera ? RP(ES.sclera[0]) : undefined, levels: 0, around: small ? 10 : 12 })).reg = 4;
    if (ES.pupil !== 'w') body.add(pupilDisc({ name: 'pupil' + k, c, ax, r: er, kind: ES.pupil, size: ES.pupil === 'slit' ? 0.62 : ES.pupil === 'bar' ? 0.52 : 0.34, bone: e.pupil }));
    if (turret) {
      // the eye raised on a turret of skin: a collar from the skull up round the lower part of the eyeball
      const up = nrm(sub(c, q.p)), h = Math.max(er * 0.4, dst(c, q.p));
      body.add(sac({ name: 'turret' + k, at: add(q.p, scl(up, -er * 0.3)), n: up, up: [0, 0, 1], r: [er * 1.12, er * 1.12, (h + er * 0.3) * 0.5], sink: 0.1, skin: () => [iH, 1], paint: coatPaint(C, 'head'), levels: 0 })).reg = 3;
    }
    const lid = rig.lids[k];
    if (lid && !ES.lidless) {
      rig.bones[lid.bone].pos = T3(sub(c, head)); rest[lid.bone] = c;
      lid.axis = nrm(crs([0, 1, 0], ax)) as [number, number, number];
      const lp = body.add(eyelid({ name: 'lid' + k, c, ax, r: er, bone: lid.bone, paint: coatPaint(C, 'lid'), cover: 0.55 + (ES.lid ?? 0), root: 2.5 }));
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
      body.add(pinna({ name: 'ear' + k, root, dir, face, len, wid, cup: E.cup, shape: E.shape, tipCurl: E.curl, bone: ei, headBone: iH, levels: E.len > 1 ? 1 : 0, paint: earPaintWith(C, root, dir, face, len) }));
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
    const up0 = gridSurf(sk.m, sk.grids[0], skCol(5, s), skRow(6.1)), cl = T2.canine * hh, upp = add(up0.p, scl(up0.n, -cl * 0.18));
    body.add(tooth({ name: 'fangU' + s, ctrl: [add(upp, [0, cl * 0.25, 0]), add(upp, [s * -cl * 0.03, -cl * 0.45, cl * 0.03]), add(upp, [s * -cl * 0.05, -cl * 0.85, cl * 0.1])], r: cl * 0.18, bone: iH, paint: toothP }));
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
  const legs: VCtx['legs'] = [], cyLegs: CyLeg[] = [];
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
    // the leg's root is part of the body: the shoulder (scapula, humerus and their muscle) or the thigh (pelvis, femur)
    // is one broad mass under the body skin, flush with the trunk's flank, which leaves the body where the trunk's
    // underline crosses the leg (the elbow behind the brisket, the stifle in the flank fold) and narrows from there;
    // only the forearm and cannon, or shin and hock, stand free
    let rings = legRings(LS.kind, fore, r, tj, segL, fh), rootT = -1;
    const span = J[0][1] - J[J.length - 1][1];
    if (span > 1e-6 && (LS.kind === 'paw' || LS.kind === 'hoof' || LS.kind === 'stilt' || LS.kind === 'bear' || LS.kind === 'knuckle')) {
      // where the leg's axis leaves the trunk: the lowest trunk surface still as far out as the leg, near the leg
      let exitY = J[0][1];
      for (const v of tr.m.V) if (Math.abs(v[2] - J[0][2]) < W * 0.14 && v[0] * s >= Math.abs(J[0][0]) * 0.92 && v[1] < exitY) exitY = v[1];
      rootT = Math.max(0.06, Math.min(tj[1] * 0.8, (J[0][1] - exitY) / span));
      const free = rootT + (tj[1] - rootT) * 0.3, mass = (k: number) => 1.04 / k - 1;
      // fore: the shoulder and triceps, long fore and aft; hind: the thigh, its hamstrings swelling out behind the femur
      const big = LS.kind === 'stilt' ? 1.35 : fore ? 1.5 : 1.42, eF = fore ? 1.6 : 1.38, back = fore ? 0 : -0.14;
      const root: LimbRing[] = [
        { t: -0.3, r: r * big * 0.85, e: eF, off: [mass(big * 0.85) - 0.1, back] },
        { t: -0.06, r: r * big, e: eF, off: [mass(big), back] },
        { t: rootT * 0.55, r: r * big * 0.97, e: eF * 0.96, off: [mass(big * 0.97), back * 0.7], b: fore ? [[180, 0.12, 50]] : [[0, 0.1, 50], [180, 0.14, 50]] },
        // the elbow point behind (the triceps' end) or the stifle in front, where the limb comes free of the body
        { t: rootT, r: r * big * 0.82, e: eF * 0.86, off: [mass(big * 0.82) * 0.6, 0], b: fore ? [[180, 0.2, 35]] : [[10, 0.14, 40]] },
      ];
      rings = [...root, ...rings.filter((g) => g.t >= free)];
    }
    const blendY = rootT >= 0 ? J[0][1] - (rootT + (tj[1] - rootT) * 0.22) * span : undefined;
    cyLegs.push({ fore, side: s, pair: lg.pair, bones: B, J, r, rootT: Math.max(0.06, rootT) });
    // a hydraulic replacement: only the stump stays, wearing the body's coat; the machine is fitted later
    if (fitted.has(fore ? 'cy_hydfore' : 'cy_hydhind') && (!fore || lg.pair === 0)) {
      const end = lerp(J[0], J[1], Math.min(0.9, (Math.max(0.06, rootT) * tot) / segL[0] + 0.12));
      const st0 = body.add(stalk({ name: 'stump' + lg.pair + (s > 0 ? 'r' : 'l'), path: [add(J[0], [0, r * 0.8, 0]), lerp(J[0], end, 0.5), end], r: (t) => r * (1.45 - t * 0.35), around: 10, capE: true, skin: () => [B[0], 1], paint: coatPaint(C, 'limb', { inner: [-s, 0, 0], hipY: J[0][1], bodyY: J[J.length - 1][1] - 1 }), levels: 0 }));
      st0.reg = 8;
      continue;
    }
    const Lg = limb({
      name: 'leg' + lg.pair + (s > 0 ? 'r' : 'l'), side: s, hip: J[0], knee: J[1], hock: three ? J[2] : undefined, sole: J[J.length - 1], tj,
      bones: { parent: rig.bones[B[0]].parent, up: B[0], lo: B[1], mid: three ? B[2] : undefined, foot: B[B.length - 1], flex: lg.flex },
      rings, foot, around: mid ? 8 : 12, levels: 0, k: 1, rise: r * 3.2,
      paint: coatPaint(C, 'limb', { inner: [-s, 0, 0], hipY: J[0][1], bodyY: blendY, band: span * 0.06 }), clawPaint,
    });
    Lg.skin.reg = 8; Lg.toes.reg = 8; Lg.claws.reg = 8; Lg.toes.levels = 0; Lg.claws.levels = 0; Lg.claws.farSkip = true;
    Lg.toes.paint = coatPaint(C, 'foot');
    // digging claws sheathe the forefeet: no toes or hoof under the scoop
    const sheathed = fore && lg.pair === 0 && fitted.has('cy_digclaw');
    body.add(Lg.skin); if (foot.toes.length && !sheathed) { body.add(Lg.toes); body.add(Lg.claws); }
    if ((LS.kind === 'hoof' || LS.kind === 'stilt') && !sheathed) {
      const hp2 = body.add(hoof({ name: 'hoof' + lg.pair + (s > 0 ? 'r' : 'l'), sole: J[J.length - 1], r: r * (LS.kind === 'stilt' ? 0.3 : 0.4), h: fh, side: s, bone: B[B.length - 1], cleft: LS.cleft !== false, paint: keratinPaint(spec.coat.horn?.[0] ?? 'basalt', spec.coat.horn?.[1] ?? 2, { rings: fh * 0.18 }), around: 8 }));
      hp2.reg = 8; hp2.levels = 0;
    }
    legs.push({ lg, frame: Lg.frame, r, kind: LS.kind });
  }
  // ---------------------------------------------------------------- parts and organs
  const X: VCtx = { d, rig, rest, spec, body, C, F, D, W, H, T, L, bi, at, spine, tr, trV, sk, skC, hl, hw, hh, skRow, skCol, fam: famM, iH, iJ, hinge, chin: chinP, legs, seed, small };
  // a biped with a tool arm fitted wears the machine in place of its own arms
  const toolArm = ['cy_drill', 'cy_saw', 'cy_welder', 'cy_gripper'].some((t) => fitted.has(t));
  if (toolArm && rig.mandibles.some((m) => /^arm/.test(rig.bones[m].name))) X.spec = { ...X.spec, parts: X.spec.parts.filter((p) => p.k !== 'arms') };
  // a back rig sits where the shag would hang: the coat's long locks thin out under the straps and the rack
  // the machinery takes its share of the triangle budget from the coat's plates and long locks
  if (fitted.size) X.spec = { ...X.spec, parts: X.spec.parts.map((p) => (p.k === 'plates' ? { ...p, rows: Math.max(4, Math.round(p.rows * 0.72)), size: p.size * 1.15 } : p)) };
  // engineered to the max (five parts or more): the machinery is the silhouette, the coat's long locks go
  if (fitted.size >= 5) X.spec = { ...X.spec, parts: X.spec.parts.filter((p) => !(p.k === 'shag' || p.k === 'mane' || p.k === 'tuft' || p.k === 'feathering' || (p.k === 'crest' && p.kind === 'bristle'))).map((p) => (p.k === 'plates' ? { ...p, rows: Math.max(3, Math.round(p.rows * 0.6)) } : p)) };
  if (fitted.has('cy_cargo') || fitted.has('cy_hopper')) X.spec = { ...X.spec, parts: X.spec.parts.filter((p) => !(p.k === 'crest' && p.kind === 'bristle')).map((p) => (p.k === 'shag' ? { ...p, density: (p.density ?? 1) * 0.55 } : p)) };
  growParts(X);
  growOrgans(X);
  if (fitted.size) {
    const vH = trV('hips'), vC = trV('chest'), g0 = tr.grids[0];
    const onBody = (t: number, a: number) => { const u = (((0.5 + a / (Math.PI * 2)) % 1) + 1) % 1, v = Math.max(0, Math.min(1, vH + (vC - vH) * t)); const q = gridSurf(tr.m, g0, u, v); return { p: q.p, n: q.n }; };
    // the neck ring the collar closes round: the trunk's cross-section at the first neck station
    let neckC: { bone: number; c: V3; dir: V3; r: number } | null = null;
    const nv = names.includes('neck0') ? trV('neck0') : names.includes('withers') ? trV('withers') : -1;
    if (nv >= 0) {
      const ring = Array.from({ length: 8 }, (_, k) => gridSurf(tr.m, g0, k / 8, nv).p), cen = scl(ring.reduce((a2, b2) => add(a2, b2), [0, 0, 0] as V3), 1 / 8);
      const rr = ring.reduce((m, q) => m + dst(q, cen), 0) / 8, nb = rig.neck.length ? rig.neck[0] : bi('neck');
      neckC = { bone: nb, c: cen, dir: nrm(sub(skC, at('neck'))), r: rr };
    }
    const arms = rig.mandibles.filter((m) => /^arm/.test(rig.bones[m].name)).map((ai) => { const A = rest[ai], sg = (Math.sign(rig.bones[ai].pos[0]) || 1) as 1 | -1, al = L * 0.2; return { side: sg, bone: ai, A, hand: add(A, [sg * al * 0.03, -al * 0.62, al * 0.42]) }; });
    growCyber({
      d, body, rig, rest, W, H, L, seed, spine, at: onBody, chest: bi('chest'), hips: rig.root, legs: cyLegs, arms,
      head: { bone: iH, c: skC, fwd: [0, 0, 1], up: [0, 1, 0], hw, hh, hl, eyes: (rig.eyes ?? []).map((e) => rest[e.bone]) },
      neck: neckC,
    });
  }
  const out = body.build({ den: 64, maxScale: 6, budget: 11600 });
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
    const lz = z * cp - y * sp, ly = y * cp + z * sp;
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
