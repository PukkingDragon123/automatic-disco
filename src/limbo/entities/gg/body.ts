// Body plan for the low-poly people (ported from the Gacha Garage people, src/people/body.js + hair.js + acc.js):
// proportions from the rig's skeleton (Dims) and the rigid box segments of the body, hair, hats and garment
// shells in the rest pose (metres, feet on y = 0, facing +z, +x = the character's LEFT). Limb segments are
// authored on the left and mirrored onto the right bones; unlike the original, the mirror gets its own texture
// space so injuries, tattoos and the watch can differ left and right.
import type { Dims, BoneName, RegKey } from '../humanModel';
import type { Seg, GGSpec, Props, BoneKey, SecBone } from './types';

type Ring = number[]; // [cx, cz, hx, hz]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Landmark heights / widths for a spec on the rig's skeleton. */
export function ggProps(sp: GGSpec, d: Dims): Props {
  const fem = sp.fem, F = (m: number, f: number) => m + (f - m) * fem;
  const r = d.rest, s = d.s;
  const ht = F(7.3, 7.1);
  // the head bone sits at the jaw hinge (chin + 0.2 head units): stature follows from it
  const H = r.head[1] / (1 - 0.8 / ht);
  const hu = H / ht;
  const w = sp.w;
  const sh = sp.face.shape;
  const P = {
    H, hu, fem, w, s, crown: H, chin: H - hu, sole: sp.sole,
    neckBase: 0.842 * H, shoulderY: r.uarmL[1], bustY: 0.728 * H, waistY: 0.632 * H, pelvisY: 0.588 * H,
    hipY: r.thighL[1], crotchY: Math.min(0.468 * H, r.thighL[1] - 0.075 * s), kneeY: r.shinL[1], ankleY: r.footL[1],
    elbowY: r.farmL[1], wristY: r.handL[1], knuckY: r.fing1L[1], fing2Y: r.fing2L[1], tipY: r.fing2L[1] - 0.052 * s * (1 - 0.06 * fem),
    shX: r.uarmL[0], armZ: r.uarmL[2], hipX: r.thighL[0],
    chestTopX: F(0.077, 0.07) * H * w, bustX: F(0.091, 0.084) * H * w, waistX: F(0.08, 0.066) * H * (w + (w - 1) * 0.6), hipsX: F(0.092, 0.103) * H * w, hipsZ: F(0.059, 0.066) * H * w,
    chestZ: 0.059 * H * w, waistZ: F(0.054, 0.051) * H * w,
    bust: fem > 0.45 ? 0.012 * H * sp.bust : 0, belly: sp.belly * 0.035 * H,
    thighX: F(0.047, 0.051) * H * w, armX: F(0.026, 0.0225) * H * (0.45 + 0.55 * w), footL: F(0.15, 0.14) * H, footX: F(0.03, 0.027) * H,
    hw: hu * F(0.335, 0.322) * sh.wide, hd: hu * 0.42, hcz: 0, zf: 0,
    eyeY: 0, browY: 0, noseY: 0, mouthY: 0, hairY: 0, earTop: 0, earBot: 0, napeY: 0,
    spineJ: r.spine[1], chestJ: r.chest[1], neckJ: r.neck[1], headJ: r.head[1],
  } as Props;
  P.hcz = r.head[2] + 0.12 * hu;
  P.zf = P.hcz + P.hd;
  const fy = (v: number) => P.chin + hu * v;
  const lo = sh.long;
  P.eyeY = fy(0.5 + (lo - 1) * 0.12); P.browY = fy(0.6 + (lo - 1) * 0.08); P.noseY = fy(0.29 * lo); P.mouthY = fy(0.18 * lo); P.hairY = fy(0.86);
  P.earTop = P.browY + hu * 0.02; P.earBot = P.noseY + hu * 0.01; P.napeY = P.chin + hu * 0.12;
  return P;
}

// ------------------------------------------------------------------ segment helpers
interface O { ch?: number; caps?: Seg['caps']; dens?: number; mirror?: boolean; block?: 'face'; rot?: { p: number[]; e: number[] }; cut?: string; inner?: boolean; open?: number; layer?: string }
class Plan {
  S: Seg[] = [];
  mirror = new Set<Seg>();
  add(part: string, bone: BoneKey, mat: string, reg: RegKey, y0: number, y1: number, b: Ring, t?: Ring | null, o: O = {}): Seg {
    const x: Seg = { part, bone, mat, reg, y0, y1, b: [...b], t: [...(t || b)], ch: o.ch ?? 0, caps: o.caps ?? 'both', dens: o.dens ?? 1, block: o.block, rot: o.rot, cut: o.cut, inner: o.inner, open: o.open, layer: o.layer, side: b[0] > 1e-4 ? 1 : b[0] < -1e-4 ? -1 : 0 };
    if (o.mirror) { x.side = 1; this.mirror.add(x); }
    this.S.push(x);
    return x;
  }
  /** split the matching (non-rotated) segments crossing y; returns the upper pieces */
  splitWhere(pred: (s: Seg) => boolean, y: number, onSplit?: (lo: Seg, hi: Seg) => void): Set<Seg> {
    const out: Seg[] = [], his = new Set<Seg>();
    for (const s of this.S) {
      if (pred(s) && !s.rot && s.y0 < y - 1e-4 && s.y1 > y + 1e-4) {
        const [a, b] = splitAt(s, y);
        onSplit?.(a, b);
        if (this.mirror.has(s)) { this.mirror.add(a); this.mirror.add(b); }
        out.push(a, b); his.add(b);
      } else out.push(s);
    }
    this.S = out;
    return his;
  }
}
const grow = (r: Ring, t: number, tz = t): Ring => [r[0], r[1], r[2] + t, r[3] + tz];
/** split a (non-rotated) segment at height y into a lower and an upper piece sharing the cut ring */
function splitAt(s: Seg, y: number): [Seg, Seg] {
  const u = (y - s.y0) / (s.y1 - s.y0);
  const m = s.b.map((v, i) => v + (s.t[i] - v) * u);
  const lo: Seg = { ...s, y1: y, t: m, caps: s.caps === 'both' || s.caps === 'bot' ? 'bot' : 'none' };
  const hi: Seg = { ...s, y0: y, b: [...m], caps: s.caps === 'both' || s.caps === 'top' ? 'top' : 'none' };
  return [lo, hi];
}
// ------------------------------------------------------------------ garments: silhouettes
const TOP_T: Record<string, number> = {
  tee: 0.0025, stripe: 0.0025, shirt: 0.003, knit: 0.006, hoodie: 0.009, scrubs: 0.003, uniform: 0.004, coverall: 0.007, guard: 0.005,
  pajama: 0.004, under: 0.001, jumpsuit: 0.006, hazmat: 0.02, bandeau: 0.001, bare: 0, blouse: 0.0025,
};
const OUTER_T: Record<string, number> = { jacket: 0.009, leather: 0.01, coat: 0.016, labcoat: 0.007, vest: 0.005 };
const LEG_T: Record<string, number> = { jeans: 0.004, slacks: 0.004, sweats: 0.008, shorts: 0.005, pajama: 0.006, uniform: 0.006, scrubs: 0.006, jumpsuit: 0.007, coverall: 0.007, guard: 0.006, hazmat: 0.018, brief: 0.001, skirt: 0 };

export interface PlanOpts { severed: Set<string>; lod: number }
export interface BodyPlan { segs: Seg[]; pivots: Partial<Record<SecBone, number[]>> }

/** Everything: body + garment shells + hair + hats + accessories. */
export function planBody(sp: GGSpec, P: Props, opts: PlanOpts): BodyPlan {
  const pl = new Plan();
  const { H, hu } = P, h = H;
  const D = sp.dress;
  const hz = D.suit === 'hazmat';
  const pivots: Partial<Record<SecBone, number[]>> = {};
  // ---- garment thickness
  const topK = D.top?.kind ?? '', outK = D.outer?.kind ?? '';
  const tTorso = (TOP_T[topK] ?? 0.003) * (D.top ? 1 : 0) + (OUTER_T[outK] ?? 0) * (D.outer ? 1 : 0);
  const tArm = D.sleeve === 'none' ? 0 : (D.top && D.top.sleeve !== 'none' ? (TOP_T[topK] ?? 0.003) * 0.8 : 0) + (D.outer && D.outer.sleeve !== 'none' ? (OUTER_T[outK] ?? 0) * 0.8 : 0);
  const tLeg = D.bottom ? (LEG_T[D.bottom.kind] ?? 0.004) : 0;
  const cuffY = D.sleeve === 'long' ? P.wristY + 0.008 * h : D.sleeve === 'short' ? P.elbowY + 0.065 * h : D.sleeve === 'cap' ? P.shoulderY - 0.03 * h : Infinity;
  const botHem = D.legsKind === 'shorts' ? P.kneeY + 0.05 * h : D.legsKind === 'pants' ? P.ankleY + 0.01 * h : D.legsKind === 'brief' ? P.crotchY - 0.01 * h : Infinity;
  const shoe = D.feet?.kind ?? 'bare';
  const hzB = shoe === 'hazmat';
  const bootTop = hzB ? P.kneeY - 0.075 * h : shoe === 'boot' ? P.ankleY + 0.07 * h : 0;
  const gloves = !!D.hands;

  // ================================================================ torso (split at the rig's joints afterwards)
  const torso: Seg[] = [];
  const T = (part: string, y0: number, y1: number, b: Ring, t: Ring, o: O) => { const s = pl.add(part, 'hips', 'body', 'TORSO', y0, y1, grow(b, tTorso * (part === 'hipsLo' ? 0.6 : part === 'traps' ? 0.7 : 1)), grow(t, tTorso * (part === 'hipsLo' ? 0.8 : part === 'traps' ? 0.6 : 1)), o); torso.push(s); return s; };
  const bustRing = (sp.dress.badge ? 0 : P.bust);
  T('hipsLo', P.crotchY - 0.012 * h, P.hipY + 0.012 * h, [0, -0.004 * h, P.hipsX * 0.9, P.hipsZ * 0.92], [0, -0.003 * h, P.hipsX, P.hipsZ], { ch: 0.3 });
  T('hipsUp', P.hipY + 0.012 * h, P.pelvisY + 0.012 * h, [0, -0.003 * h, P.hipsX, P.hipsZ], [0, -0.001 * h, (P.hipsX + P.waistX) / 2 * 1.01, P.waistZ * 1.03], { ch: 0.32, caps: 'top' });
  T('spine', P.pelvisY - 0.008 * h, P.waistY + 0.01 * h, [0, 0.003 * h + P.belly / 2, (P.hipsX + P.waistX) / 2, P.waistZ + P.belly / 2], [0, 0.002 * h + P.belly / 3, P.waistX, P.waistZ + P.belly / 3], { ch: 0.38, caps: 'none' });
  T('chestLo', P.waistY - 0.004 * h, P.bustY, [0, 0.002 * h + P.belly / 3, P.waistX, P.waistZ + P.belly / 3], [0, 0.006 * h + bustRing / 2, P.bustX, P.chestZ + bustRing / 2], { ch: 0.36, caps: 'none' });
  T('chestHi', P.bustY, P.shoulderY + 0.004 * h, [0, 0.006 * h + bustRing / 2, P.bustX, P.chestZ + bustRing / 2], [0, -0.004 * h, P.chestTopX, P.chestZ * 0.8], { ch: 0.42, caps: 'none' });
  T('traps', P.shoulderY - 0.004 * h, P.neckBase + 0.006 * h, [0, -0.004 * h, P.chestTopX * 1.04, P.chestZ * 0.8], [0, -0.009 * h, hu * 0.3, P.chestZ * 0.55], { ch: 0.45, caps: 'top' });
  // split at the spine and chest joints: the cut rings are skinned half to each bone so the torso never cracks
  const isT = (x: Seg) => x.reg === 'TORSO' && x.part !== 'bust';
  pl.splitWhere(isT, P.spineJ, (a, b) => { a.blendTop = 'spine'; b.blendBot = 'hips'; });
  pl.splitWhere(isT, P.chestJ, (a, b) => { a.blendTop = 'chest'; b.blendBot = 'spine'; });
  for (const x of pl.S) if (isT(x)) { const m = (x.y0 + x.y1) / 2; x.bone = m < P.spineJ ? 'hips' : m < P.chestJ ? 'spine' : 'chest'; }
  void torso;
  // a soft bust (the researcher): its own little shell on a spring bone
  if (sp.dress.badge && P.bust > 0) {
    const by = P.bustY + 0.004 * h, z = P.chestZ + 0.004 * h;
    pivots.bust = [0, by + 0.03 * h, z - 0.03 * h];
    for (const sx of [1, -1]) pl.add('bust', 'bust', 'body', 'TORSO', by - 0.048 * h, by + 0.03 * h, [sx * P.bustX * 0.44, z + P.bust * 0.55 + tTorso, P.bustX * 0.36 + tTorso * 0.5, P.bust * 0.75 + 0.006 * h], [sx * P.bustX * 0.42, z - 0.004 * h + tTorso, P.bustX * 0.34, 0.012 * h], { ch: 0.42, caps: 'bot' });
  }
  // ---- neck + head
  const neckR = hz ? 1.25 : 1;
  pl.add('neck', 'neck', 'skin', 'NECK', P.neckBase - 0.03 * h, P.chin + 0.16 * hu, [0, -0.012 * h, hu * lerp(0.225, 0.2, P.fem) * neckR, hu * 0.22 * neckR], [0, -0.008 * h, hu * lerp(0.215, 0.19, P.fem) * neckR, hu * 0.21 * neckR], { ch: 0.38, caps: 'none' });
  const sl = 0.06 * hu; // forehead slope
  const shp = sp.face.shape;
  pl.add('cranium', 'head', 'head', 'HEAD', P.noseY, P.crown, [0, P.hcz, P.hw, P.hd], [0, P.hcz - sl * 0.6, P.hw * 0.9, P.hd - sl * 0.4], { ch: 0.3, block: 'face' });
  const jawTop = P.hw * lerp(0.95, 0.92, P.fem) * shp.cheek, chinW = hu * lerp(0.2, 0.165, P.fem) * shp.jaw * lerp(1, shp.chin, 0.5);
  pl.add('jaw', 'head', 'head', 'HEAD', P.chin, P.noseY + 0.02 * hu, [0, P.zf - 0.02 * hu * shp.chin - 0.15 * hu, chinW, 0.15 * hu], [0, P.zf - 0.33 * hu, jawTop, 0.33 * hu], { ch: 0.36, caps: 'bot', block: 'face' });
  const nk = noseShape(sp.face.nose), nz = lerp(1, 0.84, P.fem);
  pl.add('nose', 'head', 'nose', 'HEAD', P.noseY - 0.012 * hu, P.eyeY - 0.035 * hu, [nk.crook * hu, P.zf + 0.042 * hu * nz * nk.len * (1 - nk.flat * 0.45), 0.062 * hu * nz * nk.w, 0.046 * hu * nz], [nk.crook * hu * 0.4, P.zf + 0.004 * hu + nk.bump * hu, 0.03 * hu * nk.w, 0.02 * hu], { ch: 0.45, caps: 'bot', block: 'face' });
  const ek = earShape(sp.face.ears);
  if (!hz) pl.add('ear', 'head', 'ear', 'HEAD', P.earBot - 0.01 * hu * (ek.size - 1) * 4, P.earTop + 0.01 * hu * (ek.size - 1) * 4, [P.hw + 0.012 * hu * ek.out, P.hcz - 0.1 * hu, 0.04 * hu * ek.size, 0.07 * hu * ek.size], [P.hw + 0.02 * hu * ek.out, P.hcz - 0.12 * hu, 0.045 * hu * ek.size, 0.08 * hu * ek.size], { ch: 0.4, mirror: true, dens: 1.3 });
  // ---- arms (left; mirrored)
  const ax = P.shX, aw = P.armX, az = P.armZ;
  const arm: Seg[] = [];
  arm.push(pl.add('uarm', 'uarmL', 'body', 'ARM_L', P.elbowY - 0.01 * h, P.shoulderY - 0.012 * h, [ax, az, aw * 0.76, aw * 0.8], [ax, az - 0.001 * h, aw * 0.98, aw * 1.04], { ch: 0.34, mirror: true, caps: 'bot' }));
  arm.push(pl.add('uarm', 'uarmL', 'body', 'ARM_L', P.shoulderY - 0.034 * h, P.shoulderY + 0.009 * h, [ax, az - 0.001 * h, aw * 1.0, aw * 1.06], [ax - aw * 0.2, az - 0.002 * h, aw * 0.62, aw * 0.72], { ch: 0.45, mirror: true, caps: 'top' }));
  arm.push(pl.add('farm', 'farmL', 'body', 'ARM_L', P.wristY, P.elbowY + 0.01 * h, [ax, az + 0.004 * h, aw * 0.5, aw * 0.62], [ax, az + 0.001 * h, aw * 0.72, aw * 0.78], { ch: 0.34, mirror: true }));
  // sleeves: the covered part of the arm is a little thicker (split at the cuff)
  void arm;
  if (tArm > 0 && cuffY < P.shoulderY) {
    const his = pl.splitWhere((x) => x.reg === 'ARM_L', cuffY);
    for (const x of pl.S) {
      if (x.reg !== 'ARM_L' || (x.y0 + x.y1) / 2 < cuffY) continue;
      x.b = grow(x.b, tArm + (his.has(x) ? 0.0015 : 0)); x.t = grow(x.t, tArm); x.layer = 'sleeve';
      if (his.has(x)) x.caps = x.caps === 'top' ? 'both' : 'bot';
    }
  }
  // hands
  const hzG = D.hands?.kind === 'hazmat';
  const hzz = az + 0.004 * h, hs = lerp(1, 0.92, P.fem), gt = gloves ? (hzG ? 0.0055 : 0.0025) : 0;
  pl.add('palm', 'handL', 'hand', 'HAND_L', P.knuckY - 0.004 * h, P.wristY + 0.004 * h, [ax - 0.001 * h, hzz, 0.0085 * h + gt, 0.0255 * h * hs + gt], [ax, hzz, 0.0085 * h + gt, 0.021 * h * hs + gt], { ch: 0.25, mirror: true, dens: 1.25 });
  pl.add('fingers', 'fing1L', 'hand', 'HAND_L', P.fing2Y, P.knuckY + 0.002 * h, [ax - 0.003 * h, hzz + 0.003 * h, 0.0066 * h + gt, 0.0235 * h * hs + gt], [ax - 0.002 * h, hzz + 0.002 * h, 0.0074 * h + gt, 0.0245 * h * hs + gt], { ch: 0.25, mirror: true, dens: 1.25, caps: 'none' });
  pl.add('fingers', 'fing2L', 'hand', 'HAND_L', P.tipY, P.fing2Y + 0.002 * h, [ax - 0.004 * h, hzz + 0.004 * h, 0.006 * h + gt, 0.021 * h * hs + gt], [ax - 0.003 * h, hzz + 0.003 * h, 0.0066 * h + gt, 0.0235 * h * hs + gt], { ch: 0.25, mirror: true, dens: 1.25, caps: 'bot' });
  pl.add('thumb', 'thumbL', 'hand', 'HAND_L', P.wristY - 0.042 * h * hs, P.wristY - 0.004 * h, [ax - 0.006 * h, hzz + 0.024 * h * hs, 0.0052 * h + gt, 0.0058 * h + gt], [ax - 0.003 * h, hzz + 0.018 * h * hs, 0.0062 * h + gt, 0.0072 * h + gt], { ch: 0.3, mirror: true, dens: 1.25, rot: { p: [ax, P.wristY, hzz + 0.02 * h], e: [-0.25, 0, 0.12] } });
  if (gloves) pl.add('cuff', 'farmL', 'hand', 'HAND_L', P.wristY - 0.004 * h, P.wristY + (hzG ? 0.07 : 0.03) * h, [ax, az + 0.004 * h, aw * 0.56 + gt * 2.2, aw * 0.68 + gt * 2.2], [ax, az + 0.003 * h, aw * (hzG ? 0.7 : 0.6) + gt * 2.2, aw * (hz ? 0.78 : 0.7) + gt * 2.2], { ch: 0.36, mirror: true, dens: 1.1, caps: 'top' });
  if (D.wrist && !gloves) pl.add('watch', 'farmL', 'acc', 'WATCH', P.wristY + 0.008 * h, P.wristY + 0.022 * h, [ax, az + 0.004 * h, aw * 0.58 + 0.0035, aw * 0.68 + 0.0035], null, { ch: 0.4, dens: 1.6 });
  // ---- legs (left; mirrored)
  const lx = P.hipX, tw = P.thighX, mid = P.kneeY - 0.1 * h;
  const leg: Seg[] = [];
  leg.push(pl.add('thigh', 'thighL', 'body', 'LEG_L', P.kneeY - 0.012 * h, P.hipY + 0.03 * h, [lx, 0.002 * h, tw * 0.64, tw * 0.68], [lx + 0.004 * h, -0.002 * h, tw, tw * 1.02], { ch: 0.34, mirror: true, caps: 'bot' }));
  leg.push(pl.add('calf', 'shinL', 'body', 'LEG_L', mid, P.kneeY + 0.01 * h, [lx, -0.005 * h, tw * 0.64, tw * 0.7], [lx, 0.001 * h, tw * 0.6, tw * 0.64], { ch: 0.36, mirror: true, caps: 'none' }));
  leg.push(pl.add('shin', 'shinL', 'body', 'LEG_L', P.ankleY - 0.006 * h, mid, [lx, 0, tw * 0.37, tw * 0.42], [lx, -0.005 * h, tw * 0.64, tw * 0.7], { ch: 0.34, mirror: true, caps: 'none' }));
  // trousers / boots: split at the hem and the boot top, thicken what is covered
  void leg;
  if (tLeg > 0 && botHem > P.ankleY + 0.02 * h && botHem < P.hipY) { const his = pl.splitWhere((x) => x.reg === 'LEG_L', botHem); for (const x of his) x.caps = x.caps === 'top' ? 'both' : 'bot'; }
  if (bootTop > 0) { pl.splitWhere((x) => x.reg === 'LEG_L', bootTop); }
  for (const x of pl.S) {
    if (x.reg !== 'LEG_L') continue;
    const m = (x.y0 + x.y1) / 2;
    let t = 0;
    if (tLeg > 0 && m > botHem) t += tLeg;
    if (bootTop > 0 && m < bootTop) { t += hzB ? 0.012 : 0.006; if (Math.abs(x.y1 - bootTop) < 1e-4) x.caps = x.caps === 'bot' ? 'both' : 'top'; }
    if (t) { x.b = grow(x.b, t); x.t = grow(x.t, t); }
  }
  const fl = P.footL, fx = P.footX + (shoe === 'boot' ? 0.004 : shoe === 'sneaker' ? 0.002 : 0) + (hzB ? 0.01 : 0), fz0 = -0.24 * fl, sole = P.sole;
  const fk = hzB ? 1.06 : 1;
  pl.add('foot', 'footL', 'shoe', 'FOOT_L', -sole, P.ankleY + 0.012 * h, [lx + 0.003 * h, fz0 + 0.36 * fl * fk, fx, 0.36 * fl * fk], [lx + 0.002 * h, fz0 + 0.2 * fl, fx * 0.72, 0.18 * fl], { ch: 0.3, mirror: true });
  pl.add('toe', 'footL', 'shoe', 'FOOT_L', -sole, 0.026 * h + (hzB ? 0.01 : 0), [lx + 0.004 * h, fz0 + 0.84 * fl * fk, fx * 1.02, 0.16 * fl * fk], [lx + 0.004 * h, fz0 + 0.8 * fl * fk, fx * 0.92, 0.15 * fl * fk], { ch: 0.45, mirror: true });

  // ================================================================ garment extras
  hairSegs(pl, sp, P, pivots);
  accSegs(pl, sp, P, pivots, tTorso);

  // ---- mirror the left side onto the right bones / regions (own texture space)
  const out: Seg[] = [];
  for (const s of pl.S) {
    out.push(s);
    if (!pl.mirror.has(s)) continue;
    const m: Seg = {
      ...s, side: -1, bone: (s.bone.endsWith('L') ? s.bone.slice(0, -1) + 'R' : s.bone) as BoneKey, reg: (s.reg.endsWith('_L') ? s.reg.slice(0, -2) + '_R' : s.reg) as RegKey,
      b: [-s.b[0], s.b[1], s.b[2], s.b[3]], t: [-s.t[0], s.t[1], s.t[2], s.t[3]],
      rot: s.rot ? { p: [-s.rot.p[0], s.rot.p[1], s.rot.p[2]], e: [s.rot.e[0], -s.rot.e[1], -s.rot.e[2]] } : undefined,
    };
    out.push(m);
  }
  // ---- limb loss: severed parts (and what hangs off them) are not built
  const gone = goneBones(opts.severed);
  return { segs: gone.size ? out.filter((s) => !gone.has(s.bone as BoneName)) : out, pivots };
}

/** bones that are not built for a set of severed body parts (items' part keys) */
export function goneBones(sev: Set<string>): Set<BoneName> {
  const g = new Set<BoneName>();
  for (const p of sev) {
    const sd = p.endsWith('_l') ? 'L' : p.endsWith('_r') ? 'R' : '';
    if (!sd) continue;
    const k = p.slice(0, -2);
    const add = (...b: string[]) => b.forEach((x) => g.add((x + sd) as BoneName));
    if (k === 'uarm') add('uarm', 'farm', 'hand', 'fing1', 'fing2', 'thumb');
    else if (k === 'farm') add('farm', 'hand', 'fing1', 'fing2', 'thumb');
    else if (k === 'hand') add('hand', 'fing1', 'fing2', 'thumb');
    else if (k === 'thigh') add('thigh', 'shin', 'foot');
    else if (k === 'shin') add('shin', 'foot');
    else if (k === 'foot') add('foot');
  }
  return g;
}

/** nose shapes (humanLooks NOSES): width, length, crooked x, bridge bump, flatness */
export function noseShape(n: number) {
  switch (n) {
    case 1: return { w: 0.88, len: 0.78, crook: 0, bump: 0, flat: 0 };
    case 2: return { w: 1.28, len: 0.95, crook: 0, bump: 0, flat: 0.25 };
    case 3: return { w: 0.95, len: 1.22, crook: 0, bump: 0, flat: 0 };
    case 4: return { w: 1.08, len: 1.0, crook: 0.012, bump: 0.008, flat: 0.1 };
    case 5: return { w: 1.0, len: 1.18, crook: 0, bump: 0.016, flat: 0 };
    case 6: return { w: 1.32, len: 0.7, crook: 0.006, bump: 0, flat: 0.6 };
    default: return { w: 1, len: 1, crook: 0, bump: 0, flat: 0 };
  }
}
/** ear shapes (humanLooks EARS): how far out, size */
export function earShape(n: number) {
  switch (n) {
    case 1: return { out: 0.6, size: 0.84 };
    case 2: return { out: 1.7, size: 1.16 };
    case 3: return { out: 1.2, size: 1.06 };
    default: return { out: 1, size: 1 };
  }
}

// ================================================================ hair and hats (hair.js)
/** Cranium cross-section at height y, grown by (ex, ez) and shifted by dz. */
function cs(P: Props, y: number, ex = 0, ez = 0, dz = 0): Ring {
  const sl = 0.06 * P.hu, t = Math.max(0, Math.min(1, (y - P.noseY) / (P.crown - P.noseY)));
  return [0, P.hcz - sl * 0.6 * t + dz, P.hw * (1 - 0.1 * t) + ex, P.hd - sl * 0.4 * t + ez];
}
/** Grow a top section so it still encloses the cranium's crown (no scalp poking through). */
function enclose(P: Props, c: Ring, m = 0.01 * P.hu, ch = 0.3): Ring {
  const k = cs(P, P.crown);
  m += Math.max(0, ch - 0.3) * 0.22 * P.hu;
  const front = Math.max(c[1] + c[3], k[1] + k[3] + m), back = Math.min(c[1] - c[3], k[1] - k[3] - m);
  return [c[0], (front + back) / 2, Math.max(c[2], k[2] + m), (front - back) / 2];
}

/** our hair styles onto the original's shells */
function hairStyleOf(st: string): { g: string; vol: number; flags: string } {
  switch (st) {
    case 'short': return { g: 'sidepart', vol: 1, flags: '' };
    case 'long': return { g: 'long', vol: 1, flags: '' };
    case 'buzz': return { g: 'buzz', vol: 1, flags: '' };
    case 'shaved': return { g: 'buzz', vol: 0.5, flags: 'shaved' };
    case 'bald': return { g: 'bald', vol: 1, flags: '' };
    case 'ponytail': return { g: 'ponytail', vol: 1, flags: '' };
    case 'curly': return { g: 'perm', vol: 0.75, flags: '' };
    case 'afro': return { g: 'perm', vol: 1.45, flags: 'afro' };
    case 'bob': return { g: 'bob', vol: 1, flags: '' };
    case 'receding': return { g: 'short', vol: 0.8, flags: 'receding' };
    case 'undercut': return { g: 'short', vol: 1.15, flags: 'undercut' };
    case 'spiky': return { g: 'messy', vol: 1.1, flags: 'spiky' };
    case 'mohawk': return { g: 'mohawk', vol: 1, flags: '' };
    case 'cornrows': return { g: 'buzz', vol: 1.2, flags: 'cornrows' };
    case 'mullet': return { g: 'short', vol: 1, flags: 'mullet' };
    case 'topknot': return { g: 'bun', vol: 1, flags: 'top' };
    case 'bun': return { g: 'bun', vol: 1, flags: '' };
    case 'wavy': return { g: 'long', vol: 1.15, flags: 'wavy' };
    case 'none': return { g: 'none', vol: 1, flags: '' };
    default: return { g: 'sidepart', vol: 1, flags: '' };
  }
}
export const hairShell = hairStyleOf;

function hairSegs(pl: Plan, sp: GGSpec, P: Props, pivots: Partial<Record<SecBone, number[]>>) {
  const hu = P.hu, D = sp.dress;
  const { g: st0, vol: v0, flags } = hairStyleOf(sp.hair.style);
  let st = st0;
  const vol = v0 * (sp.hair.volume || 1);
  const hatKind = D.hat ? D.hat.kind : D.hatFlat ? 'flat' : '';
  const hz = D.suit === 'hazmat';
  const add = (part: string, bone: BoneKey, mat: string, y0: number, y1: number, b: Ring, t: Ring | null, o: O = {}) => pl.add(part, bone, mat, mat === 'hair' ? 'HAIR' : 'HAT', y0, y1, b, t, o);
  // a cosmetic hat or the hazmat hood presses the hair flat: only a thin cap shows (or nothing under the hood)
  if (hz) st = 'none';
  else if (hatKind === 'flat' && st !== 'bald' && st !== 'none') st = 'flat';
  const cap = (th: number, y0: number, o: { dz?: number; round?: number; ch?: number } = {}) => add('hairCap', 'head', 'hair', y0, P.crown + th * 0.9, cs(P, y0, th, th, o.dz || 0), (() => { const c = cs(P, P.crown, th * 0.75, th * 0.8, (o.dz || 0) - th * 0.15); c[2] *= o.round ?? 0.9; c[3] *= o.round ?? 0.9; return enclose(P, c, 0.004 * hu, o.ch ?? 0.38); })(), { ch: o.ch ?? 0.38, caps: 'top' });
  const sides = (th: number, y0: number, y1: number, zf: number, flare = 0, cut?: string) => {
    const zb = P.hcz - P.hd - th * 0.6, mid = (zf + zb) / 2, hzz = (zf - zb) / 2;
    const x0 = cs(P, y0)[2], x1 = cs(P, y1)[2];
    add('hairSide', 'head', 'hair', y0, y1, [x0 + th * (0.5 + flare) - 0.004, mid, th * (0.5 + flare) + 0.004, hzz], [x1 + th * 0.5 - 0.004, mid, th * 0.5 + 0.004, hzz], { ch: 0.3, mirror: true, caps: 'bot', cut });
  };
  const back = (th: number, y0: number, y1: number, w = 1, flare = 0, bone: BoneKey = 'head') => {
    const c0 = cs(P, y0), c1 = cs(P, y1);
    add('hairBack', bone, 'hair', y0, y1, [0, c0[1] - c0[3] + 0.03 * hu - th * (1 + flare) / 2, (c0[2] + th) * w + flare * th, th * (1 + flare) / 2 + 0.03 * hu], [0, c1[1] - c1[3] + 0.03 * hu - th / 2, (c1[2] + th) * w, th / 2 + 0.03 * hu], { ch: 0.35, caps: 'bot' });
  };
  const bangs = (yb: number, w = 0.86, th = 0.035 * hu, cut = 'straight') => {
    const c = cs(P, P.hairY);
    add('bangs', 'head', 'hair', yb, P.hairY + 0.06 * hu, [0, P.zf + th / 2 - 0.01 * hu, P.hw * w, th / 2], [0, c[1] + c[3] + th / 2 - 0.004, c[2] * w * 0.98, th / 2], { ch: 0.3, caps: 'bot', cut });
  };
  const tail = (len: number, w: number, x: number, y: number, z: number) => {
    pivots.hair = [x, y, z];
    add('tail', 'hair', 'hair', y - len, y + 0.02 * hu, [x, z - 0.03 * hu, w * 0.55, w * 0.5], [x, z, w, w * 0.9], { ch: 0.4, rot: { p: [x, y, z], e: [-0.12, 0, 0] } });
  };
  const hatOn = hatKind && hatKind !== 'flat';
  if (!hatOn) {
    if (st === 'short' || st === 'sidepart') {
      const recede = flags === 'receding';
      cap(0.05 * hu * vol, P.hairY - 0.015 * hu + (recede ? 0.07 * hu : 0), { dz: 0.005 * hu - (recede ? 0.03 * hu : 0) });
      if (flags !== 'undercut') sides(0.032 * hu, P.earTop - 0.03 * hu, P.hairY, P.zf - 0.2 * hu);
      else sides(0.01 * hu, P.earTop - 0.03 * hu, P.hairY - 0.04 * hu, P.zf - 0.2 * hu);
      back(flags === 'undercut' ? 0.012 * hu : 0.04 * hu, P.napeY, P.hairY);
      if (st === 'sidepart' && !recede) add('fringe', 'head', 'hair', P.hairY - 0.07 * hu, P.hairY + 0.07 * hu, [sp.hair.part * P.hw * 0.32, P.zf + 0.012 * hu, P.hw * 0.42, 0.022 * hu], [sp.hair.part * P.hw * 0.28, P.zf - 0.01 * hu, P.hw * 0.52, 0.03 * hu], { ch: 0.4, caps: 'none', cut: 'swept' });
      if (flags === 'mullet') { pivots.hair = [0, P.napeY + 0.05 * hu, P.hcz - P.hd]; back(0.04 * hu, P.chin - 0.3 * hu, P.napeY + 0.05 * hu, 0.9, 0.2, 'hair'); }
    } else if (st === 'buzz') {
      cap(0.016 * hu * vol, P.hairY - 0.01 * hu, { round: 0.95 });
      sides(0.012 * hu, P.earTop - 0.02 * hu, P.hairY, P.zf - 0.2 * hu);
      back(0.014 * hu, P.napeY, P.hairY);
    } else if (st === 'messy') {
      const th = 0.07 * hu * vol;
      cap(th, P.hairY - 0.03 * hu, { dz: 0.006 * hu, round: 0.88, ch: 0.45 });
      sides(0.028 * hu, P.earTop, P.hairY, P.zf - 0.19 * hu, 0, flags === 'spiky' ? 'messy' : undefined);
      back(0.04 * hu, P.napeY - 0.02 * hu, P.hairY, 1, 0.15);
      bangs(P.browY + 0.06 * hu, 0.88, 0.04 * hu, 'messy');
      if (flags === 'spiky') for (const [x, z] of [[0, 0.1], [-0.4, 0], [0.4, 0], [0, -0.3], [-0.3, -0.5], [0.3, -0.5]]) add('hairCap', 'head', 'hair', P.crown - 0.02 * hu, P.crown + 0.16 * hu, [x * P.hw, P.hcz + z * P.hd, 0.08 * hu, 0.08 * hu], [x * P.hw * 1.15, P.hcz + z * P.hd * 1.1, 0.012 * hu, 0.012 * hu], { ch: 0.4, caps: 'both' });
    } else if (st === 'mohawk') {
      sides(0.01 * hu, P.earTop - 0.02 * hu, P.hairY - 0.05 * hu, P.zf - 0.2 * hu);
      back(0.01 * hu, P.napeY, P.hairY - 0.05 * hu);
      const c0 = cs(P, P.hairY);
      add('hairCap', 'head', 'hair', P.hairY - 0.04 * hu, P.crown + 0.2 * hu, [0, c0[1] - 0.02 * hu, 0.07 * hu, c0[3] + 0.02 * hu], [0, P.hcz - 0.04 * hu, 0.03 * hu, P.hd * 0.9], { ch: 0.35, caps: 'top' });
    } else if (st === 'bob' || st === 'long' || st === 'ponytail' || st === 'bun') {
      const tight = st === 'ponytail' || st === 'bun';
      const th = (tight ? 0.035 : 0.055) * hu * vol;
      cap(th, P.hairY - 0.025 * hu, { dz: 0.004 * hu });
      if (st === 'bob' || st === 'long') {
        const yb = P.chin + (st === 'bob' ? 0.08 : -0.02) * hu;
        sides((st === 'long' ? 0.042 : 0.055) * hu * vol, yb, P.hairY, P.zf - (st === 'long' ? 0.12 : 0.07) * hu, st === 'long' ? 0.15 : 0.35, flags === 'wavy' ? 'curly' : undefined);
        back(0.055 * hu * vol, yb, P.hairY, 1.02, st === 'long' ? 0.2 : 0.35);
        bangs(P.browY + 0.03 * hu, 0.86, 0.04 * hu, st === 'long' && sp.hair.part ? 'side' : 'straight');
        if (st === 'long') {
          // the rest of the length hangs from the nape on the hair bone (it swings and lags the head)
          const w = P.hw * 1.05 * vol, zb = P.hcz - P.hd * 0.86;
          pivots.hair = [0, P.napeY + 0.06 * hu, zb];
          add('hairLong', 'hair', 'hair', P.bustY - 0.03 * P.H, P.napeY + 0.08 * hu, [0, -P.chestZ * 0.62 - 0.03 * hu, w * 1.1, 0.045 * hu * vol], [0, zb - 0.045 * hu, w, 0.06 * hu * vol], { ch: 0.35, caps: 'bot', cut: flags === 'wavy' ? 'curly' : undefined });
        }
      } else {
        sides(0.03 * hu, P.earTop - 0.02 * hu, P.hairY, P.zf - 0.16 * hu);
        back(0.035 * hu, P.napeY, P.hairY);
        bangs(P.browY + 0.05 * hu, 0.84, 0.035 * hu, 'side');
        const zb = P.hcz - P.hd;
        if (st === 'ponytail') tail(P.H * 0.15 * vol, 0.026 * P.H * Math.sqrt(vol), 0, P.eyeY + 0.12 * hu, zb - 0.02 * hu);
        else if (flags === 'top') add('bun', 'head', 'hair', P.crown - 0.04 * hu, P.crown + 0.2 * hu, [0, P.hcz - 0.02 * hu, 0.15 * hu, 0.13 * hu], [0, P.hcz - 0.03 * hu, 0.11 * hu, 0.1 * hu], { ch: 0.45 });
        else add('bun', 'head', 'hair', P.crown - 0.32 * hu, P.crown - 0.02 * hu, [0, zb - 0.06 * hu, 0.17 * hu, 0.13 * hu], [0, zb - 0.02 * hu, 0.14 * hu, 0.11 * hu], { ch: 0.45 });
      }
    } else if (st === 'perm') {
      const th = 0.1 * hu * vol;
      cap(th, P.hairY - 0.04 * hu, { dz: -0.01 * hu, round: 0.85, ch: 0.45 });
      sides(0.07 * hu * vol, P.earBot + 0.06 * hu, P.hairY, P.zf - 0.17 * hu, 0.2);
      back(0.08 * hu * vol, P.napeY + 0.02 * hu, P.hairY, 1.04, 0.2);
      add('fringe', 'head', 'hair', P.hairY - 0.08 * hu, P.hairY + 0.05 * hu, [0, P.zf + 0.01 * hu, P.hw * 0.8, 0.03 * hu], [0, P.zf - 0.02 * hu, P.hw * 0.86, 0.04 * hu], { ch: 0.45, caps: 'none', cut: 'curly' });
    } else if (st === 'bald') {
      sides(0.014 * hu, P.earBot + 0.02 * hu, P.earTop + 0.12 * hu, P.zf - 0.25 * hu);
      back(0.016 * hu, P.napeY, P.earTop + 0.1 * hu);
    } else if (st === 'flat') {
      cap(0.02 * hu, P.hairY - 0.01 * hu, { round: 0.95 });
      sides(0.018 * hu, P.earTop - 0.02 * hu, P.hairY, P.zf - 0.2 * hu);
      back(0.02 * hu, P.napeY, P.hairY);
    }
  }
  // a rounder skull top for bald heads (skin)
  if ((st === 'bald' || st === 'none' || st0 === 'buzz') && !hatOn && !hz) add('scalp', 'head', 'head', P.hairY + 0.02 * hu, P.crown + 0.04 * hu, cs(P, P.hairY + 0.02 * hu, 0.003 * hu, 0.003 * hu), (() => { const c = cs(P, P.crown, 0, 0, -0.04 * hu); c[2] *= 0.62; c[3] *= 0.64; return c; })(), { ch: 0.45, caps: 'top' });
  // facial hair with volume (the rest is painted)
  const fh = sp.face.facial;
  if (!hz && (fh === 'beard' || fh === 'goatee')) {
    const full = fh === 'beard';
    const yT = full ? P.noseY - 0.01 * hu : P.mouthY - 0.03 * hu;
    const jw = P.hw * lerp(0.95, 0.92, P.fem) * 1.02, cw = hu * lerp(0.2, 0.165, P.fem);
    if (full) add('beard', 'head', 'hair', P.chin - 0.07 * hu, yT, [0, P.zf - 0.03 * hu - 0.17 * hu, cw * 1.25, 0.17 * hu], [0, P.zf - 0.3 * hu, jw * 1.04, 0.3 * hu], { ch: 0.38, caps: 'bot', open: 0.92, cut: 'beard' });
    else add('beard', 'head', 'hair', P.chin - 0.05 * hu, yT, [0, P.zf - 0.06 * hu, cw * 0.55, 0.06 * hu], [0, P.zf - 0.04 * hu, cw * 0.62, 0.05 * hu], { ch: 0.4, caps: 'bot', cut: 'beard' });
  }
  if (!hatOn) return;
  // --- hats (hair below the hat band still shows)
  const th = st === 'perm' ? 0.08 * hu : 0.03 * hu;
  const yHat = P.browY + 0.2 * hu;
  if (st !== 'bald' && st !== 'none') {
    sides(0.026 * hu, P.earTop - 0.03 * hu, yHat + 0.015 * hu, P.zf - 0.2 * hu);
    back(0.03 * hu, P.napeY, yHat + 0.015 * hu);
    if (st === 'long' || st === 'bob') {
      const yb = P.chin + (st === 'bob' ? 0.08 : -0.02) * hu;
      back(0.05 * hu * vol, yb, P.napeY + 0.05 * hu, 1.02, 0.25);
      if (st === 'long') { const w = P.hw * 1.05 * vol, zb = P.hcz - P.hd * 0.86; pivots.hair = [0, P.napeY + 0.06 * hu, zb]; add('hairLong', 'hair', 'hair', P.bustY - 0.03 * P.H, P.napeY + 0.08 * hu, [0, -P.chestZ * 0.62 - 0.03 * hu, w * 1.1, 0.045 * hu * vol], [0, zb - 0.045 * hu, w, 0.06 * hu * vol], { ch: 0.35, caps: 'bot' }); }
    }
    if (st === 'ponytail') tail(P.H * 0.15 * vol, 0.026 * P.H * Math.sqrt(vol), 0, P.eyeY + 0.06 * hu, P.hcz - P.hd - 0.02 * hu);
  }
  const y0 = yHat;
  if (hatKind === 'cap') {
    add('hatCrown', 'head', 'hat', y0, P.crown + 0.05 * hu, cs(P, y0, th + 0.012 * hu, th + 0.01 * hu), (() => { const c = cs(P, P.crown, th * 0.6, th * 0.6, -0.02 * hu); c[2] *= 0.82; c[3] *= 0.84; return enclose(P, c, 0.01 * hu, 0.42); })(), { ch: 0.42, caps: 'top' });
    add('visor', 'head', 'hat2', y0 - 0.005 * hu, y0 + 0.022 * hu, [0, P.zf + 0.2 * hu, P.hw * 0.78, 0.2 * hu], [0, P.zf + 0.2 * hu, P.hw * 0.78, 0.2 * hu], { ch: 0.5, rot: { p: [0, y0, P.zf], e: [0.18, 0, 0] } });
  } else if (hatKind === 'beanie') {
    const yb = P.browY + 0.14 * hu;
    add('hatCrown', 'head', 'hat', yb, P.crown + 0.08 * hu, cs(P, yb, th + 0.016 * hu, th + 0.016 * hu), (() => { const c = cs(P, P.crown, th * 0.4, th * 0.4, -0.03 * hu); c[2] *= 0.7; c[3] *= 0.74; return enclose(P, c, 0.012 * hu, 0.5); })(), { ch: 0.48, caps: 'top' });
    add('hatBand', 'head', 'hat', yb - 0.012 * hu, yb + 0.1 * hu, cs(P, yb, th + 0.026 * hu, th + 0.026 * hu), cs(P, yb + 0.1 * hu, th + 0.022 * hu, th + 0.022 * hu), { ch: 0.4, caps: 'bot' });
  } else if (hatKind === 'hardhat' || hatKind === 'helmet' || hatKind === 'riot') {
    const big = hatKind === 'riot' ? 1.15 : 1;
    add('hatCrown', 'head', 'hat', y0, P.crown + 0.1 * hu * big, cs(P, y0, (th + 0.035 * hu) * big, (th + 0.04 * hu) * big), (() => { const c = cs(P, P.crown, th, th, -0.01 * hu); c[2] *= 0.78 * big; c[3] *= 0.8 * big; return enclose(P, c, 0.01 * hu, 0.5); })(), { ch: 0.5, caps: 'top' });
    if (hatKind === 'hardhat') { const c = cs(P, y0, th + 0.07 * hu, th + 0.09 * hu, 0.03 * hu); add('brim', 'head', 'hat2', y0 - 0.02 * hu, y0 + 0.008 * hu, c, c, { ch: 0.45, dens: 0.8 }); }
    else if (hatKind === 'riot') add('visorShield', 'head', 'hat2', P.noseY - 0.1 * hu, y0 + 0.02 * hu, [0, P.zf + 0.06 * hu, P.hw * 1.08, 0.012 * hu], [0, P.zf + 0.07 * hu, P.hw * 1.1, 0.012 * hu], { ch: 0.4, dens: 0.9 });
    else add('hatBand', 'head', 'hat2', y0 - 0.03 * hu, y0 + 0.01 * hu, cs(P, y0, th + 0.045 * hu, th + 0.05 * hu), null, { ch: 0.45, dens: 0.8 });
  }
}

// ================================================================ accessories and garment shells (acc.js)
function accSegs(pl: Plan, sp: GGSpec, P: Props, pivots: Partial<Record<SecBone, number[]>>, tTorso: number) {
  const D = sp.dress, h = P.H, H = P.H, hu = P.hu;
  const add = (part: string, bone: BoneKey, reg: RegKey, y0: number, y1: number, b: Ring, t: Ring | null, o: O = {}) => pl.add(part, bone, 'acc', reg, y0, y1, b, t, o);
  const hz = D.suit === 'hazmat';
  // --- skirts and coat tails (on the coat bone, which follows the thighs)
  const coatPivot = () => { pivots.coat = [0, P.pelvisY, 0]; };
  if (D.legsKind === 'skirt' && D.bottom) {
    coatPivot();
    const hem = P.kneeY + 0.06 * H, flare = 1.25;
    const yh = P.hipY - 0.01 * H, top = [0, -0.001 * H, P.waistX * 1.08, P.waistZ * 1.1], hip = [0, -0.003 * H, P.hipsX * 1.07, P.hipsZ * 1.12];
    add('skirtUp', 'coat', 'SKIRT', yh, P.pelvisY + 0.016 * H, hip, top, { ch: 0.4, caps: 'top' });
    add('skirt', 'coat', 'SKIRT', hem, yh, [0, -0.005 * H, P.hipsX * flare, P.hipsZ * (flare + 0.12)], hip, { ch: 0.4, caps: 'bot', dens: 0.9 });
  }
  const ok = D.outer?.kind;
  if (ok === 'coat' || ok === 'labcoat') {
    coatPivot();
    const lab = ok === 'labcoat';
    const hem = lab ? P.kneeY + 0.035 * H : P.kneeY + 0.02 * H;
    const yt = P.hipY + 0.035 * H, t = tTorso;
    const top = [0, -0.002 * H, P.hipsX * 1.02 + t, P.hipsZ * 1.04 + t], bot = [0, -0.008 * H, P.hipsX * (lab ? 1.22 : 1.3) + t, P.hipsZ * (lab ? 1.32 : 1.4) + t];
    add('coatTail', 'coat', 'SKIRT', hem, yt, bot, top, { ch: 0.36, caps: 'none', dens: 0.9, open: lab ? 0.85 : 2, inner: true });
  }
  // --- hoodie: the hood bunched on the upper back
  if (D.top?.kind === 'hoodie' && !D.outer) add('hood', 'chest', 'COLLAR', P.shoulderY - 0.035 * H, P.neckBase + 0.012 * H, [0, -P.chestZ * 0.72 - 0.012 * H, P.chestTopX * 0.62, 0.026 * H], [0, -P.chestZ * 0.6 - 0.01 * H, P.chestTopX * 0.72, 0.03 * H], { ch: 0.45 });
  // --- jacket / coat collar standing up round the neck
  if (ok === 'coat' || ok === 'jacket' || ok === 'leather') add('collar', 'chest', 'COLLAR', P.neckBase - 0.012 * H, P.neckBase + 0.02 * H, [0, -0.012 * h, hu * 0.33, hu * 0.31], [0, -0.012 * h, hu * 0.31, hu * 0.29], { ch: 0.4, caps: 'none', open: 0.75, inner: true });
  // --- backpack
  if (D.back) {
    const sz = Math.max(0.7, Math.min(1.25, D.back.size || 1));
    const hiking = D.back.kind === 'hiking';
    const y0 = P.waistY - (hiking ? 0.09 : 0.05) * H, y1 = P.shoulderY + (hiking ? 0.03 : -0.01) * H;
    const zb = -P.chestZ - tTorso - 0.004, d = 0.075 * sz + 0.01, w = 0.14 * Math.sqrt(sz);
    pivots.pack = [0, y1 - 0.02 * H, zb - 0.005];
    add('backpack', 'pack', 'PACK', y0, y1, [0, zb - d, w, d], [0, zb - d + 0.01, w * 0.95, d * 0.9], { ch: 0.35 });
    add('packPocket', 'pack', 'PACK', y0 + 0.01, y0 + (y1 - y0) * 0.5, [0, zb - 2 * d - 0.02, w * 0.7, 0.03], [0, zb - 2 * d - 0.01, w * 0.68, 0.025], { ch: 0.4 });
    if (hiking) add('bedroll', 'pack', 'PACK', y1 - 0.005, y1 + 0.075, [0, zb - d, w * 1.15, 0.04], null, { ch: 0.45 });
  }
  // --- scarf / gas mask / face mask
  const mk = D.mask?.kind;
  if (mk === 'scarf') add('scarf', 'neck', 'COLLAR', P.neckBase - 0.03 * H, P.chin + 0.06 * hu, [0, -0.012 * h, hu * 0.3, hu * 0.29], [0, -0.008 * h, hu * 0.27, hu * 0.27], { ch: 0.42 });
  if (mk === 'gasmask' && !hz) {
    add('maskFace', 'head', 'MASK', P.chin - 0.03 * hu, P.browY + 0.06 * hu, [0, P.zf - 0.06 * hu, P.hw * 0.86, 0.12 * hu], [0, P.zf - 0.08 * hu, P.hw * 0.98, 0.1 * hu], { ch: 0.4, caps: 'bot' });
    add('canister', 'head', 'MASK', P.mouthY - 0.1 * hu, P.mouthY + 0.1 * hu, [0, P.zf + 0.12 * hu, 0.11 * hu, 0.11 * hu], null, { ch: 0.42, rot: { p: [0, P.mouthY, P.zf + 0.12 * hu], e: [Math.PI / 2 - 0.4, 0, 0] } });
  }
  // --- the hazmat hood: a rubber shell round the head with an opening for the visor, the visor frame, the respirator
  if (hz) {
    const t = 0.07 * hu;
    // gorget round the neck (closed), then the hood (open at the face)
    pl.add('hoodNeck', 'neck', 'hat', 'HAT', P.neckBase - 0.035 * H, P.chin + 0.02 * hu, [0, -0.01 * h, hu * 0.36, hu * 0.36], [0, P.hcz - 0.1 * hu, P.hw + t * 0.7, P.hd * 0.86 + t * 0.6], { ch: 0.4, caps: 'none' });
    pl.add('hood', 'head', 'hat', 'HAT', P.chin + 0.01 * hu, P.crown + 0.02 * hu, cs(P, P.chin + 0.3 * hu, t * 1.05, t * 0.9, -0.03 * hu), (() => { const c = cs(P, P.crown, t * 1.2, t, -0.05 * hu); c[2] *= 0.94; c[3] *= 0.98; return c; })(), { ch: 0.42, caps: 'top', open: 0.72, inner: true });
    pl.add('hoodTop', 'head', 'hat', 'HAT', P.crown + 0.01 * hu, P.crown + 0.1 * hu, (() => { const c = cs(P, P.crown, t * 1.2, t, -0.05 * hu); c[2] *= 0.94; c[3] *= 0.98; return c; })(), (() => { const c = cs(P, P.crown, t * 0.4, t * 0.4, -0.06 * hu); c[2] *= 0.62; c[3] *= 0.7; return c; })(), { ch: 0.45, caps: 'top' });
    // visor frame: four bars round the face opening
    const zf = P.zf + 0.035 * hu, top = P.browY + 0.16 * hu, bot = P.chin - 0.015 * hu, xs = P.hw + 0.03 * hu;
    add('visorFrame', 'head', 'MASK', top - 0.03 * hu, top + 0.035 * hu, [0, zf - 0.03 * hu, xs, 0.045 * hu], null, { ch: 0.4 });
    add('visorFrame', 'head', 'MASK', bot - 0.03 * hu, bot + 0.03 * hu, [0, zf - 0.06 * hu, xs * 0.86, 0.06 * hu], null, { ch: 0.4 });
    add('visorSide', 'head', 'MASK', bot, top, [xs - 0.01 * hu, zf - 0.07 * hu, 0.022 * hu, 0.06 * hu], [xs, zf - 0.05 * hu, 0.022 * hu, 0.05 * hu], { ch: 0.35, caps: 'none', mirror: true });
    // respirator: a chin canister and twin cartridges low on the jaw
    add('respirator', 'head', 'MASK', P.chin - 0.1 * hu, P.chin + 0.06 * hu, [0, zf + 0.03 * hu, 0.11 * hu, 0.07 * hu], [0, zf + 0.0 * hu, 0.13 * hu, 0.06 * hu], { ch: 0.42 });
    add('cartridge', 'head', 'MASK', P.chin - 0.07 * hu, P.chin + 0.07 * hu, [P.hw * 0.62, zf + 0.04 * hu, 0.085 * hu, 0.085 * hu], null, { ch: 0.42, mirror: true, rot: { p: [P.hw * 0.62, P.chin, zf + 0.04 * hu], e: [Math.PI / 2 - 0.25, -0.5, 0] } });
    // air hose from the canister to a filter pack on the hip
    add('hose', 'chest', 'MASK', P.bustY - 0.02 * H, P.neckBase - 0.005 * H, [-0.035 * H, P.chestZ + tTorso + 0.004, 0.012, 0.012], [-0.02 * H, P.chestZ * 0.9 + tTorso + 0.01, 0.011, 0.011], { ch: 0.42, caps: 'none' });
    add('filterPack', 'hips', 'PACK', P.hipY - 0.02 * H, P.pelvisY + 0.02 * H, [-P.hipsX * 0.85, P.hipsZ * 0.15, 0.03, 0.05], null, { ch: 0.35, dens: 1.3 });
  }
  // --- the researcher's ID badge on its lanyard
  if (D.badge) {
    // hangs on the lanyard below the bust, in front of the open coat
    const by = P.waistY + 0.045 * H, z = P.waistZ + tTorso + 0.012 * H;
    pivots.badge = [0, P.neckBase - 0.01 * H, P.chestZ * 0.6];
    add('badge', 'badge', 'GEAR', by - 0.032 * H, by + 0.008 * H, [0.004 * H, z, 0.0125 * H, 0.0022], null, { ch: 0.2, dens: 2.2 });
    add('clip', 'badge', 'GEAR', by + 0.006 * H, by + 0.014 * H, [0.004 * H, z, 0.0035 * H, 0.0026], null, { ch: 0.3, dens: 2 });
  }
}
