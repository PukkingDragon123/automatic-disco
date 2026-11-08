// The Veyr itself: a small, fat, goofy amphibian-thing. A frog's wide smiling face and bulging eyes, a salamander's
// tail, an axolotl's feathery gills, sticky toe pads, a throat that balloons when it croaks and a tongue it can't
// keep in. Underneath it is silicon, not carbon: crystal warts down its back, gem-cut eyes, a lodestone glowing
// through its belly. It comes from a low-gravity world and floats on its own magnetic field, paddling the air;
// lodestones circle it. It starts small and grows with its field. Sculpted with the creature kit (lofted, skinned,
// hand-painted page, wet glossy skin) and dressed by the player in the mirror pool (babyLook.ts, ui/babyEditor.ts).
import * as THREE from 'three';
import { makeRamp, mixHex } from '../limbo/gfx/pixel';
import { gbuf } from '../gfx/gbuf';
import { clamp, damp } from '../core/rand';
import type { Fx } from './fx';
import { SkinB, Page, type Region, sac, spline, ball, chainWeights, hash, gauss, addV, scl, norm, sub, lerpV, pageTexture, mixC, type V3, type Wt } from '../life/kit';
import { type BabyLook, loadLook } from './babyLook';

const TAU = Math.PI * 2;
const BONES = ['base', 'body', 'head', 'jaw', 'throat', 'tongue', 'eyeL', 'eyeR', 'gillL', 'gillR', 'armL', 'handL', 'armR', 'handR', 'thighL', 'footL', 'thighR', 'footR', 'tail1', 'tail2'] as const;
type BN = (typeof BONES)[number];
const PARENT: Record<BN, BN | ''> = { base: '', body: 'base', head: 'body', jaw: 'head', throat: 'body', tongue: 'head', eyeL: 'head', eyeR: 'head', gillL: 'head', gillR: 'head', armL: 'body', handL: 'armL', armR: 'body', handR: 'armR', thighL: 'body', footL: 'thighL', thighR: 'body', footR: 'thighR', tail1: 'body', tail2: 'tail1' };
const bi = (n: BN) => BONES.indexOf(n);
const SIDES = [['L', 1], ['R', -1]] as const;
const sm = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function interp(ts: number[], vs: number[], t: number) {
  if (t <= ts[0]) return vs[0];
  for (let i = 0; i + 1 < ts.length; i++) if (t <= ts[i + 1]) { const f = (t - ts[i]) / (ts[i + 1] - ts[i]); const s = f * f * (3 - 2 * f); return vs[i] + (vs[i + 1] - vs[i]) * s; }
  return vs[vs.length - 1];
}
const cosT = (n: number) => Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)));

// one round body from seat to crown: a fat belly, a crease of a mouth, a wide flat frog head
const TT = [0, 0.06, 0.18, 0.32, 0.46, 0.56, 0.62, 0.7, 0.8, 0.9, 0.97, 1];
const RX = [0.05, 0.26, 0.38, 0.42, 0.4, 0.37, 0.38, 0.4, 0.38, 0.3, 0.18, 0.03], RZ = [0.05, 0.24, 0.34, 0.36, 0.33, 0.3, 0.31, 0.31, 0.28, 0.22, 0.13, 0.03];
const Y0 = 0.04, YH = 0.92, TM = 0.6; // mouth line
const yAt = (t: number) => Y0 + t * YH;
interface Shape { fat: number }
const radii = (S: Shape, t: number): [number, number] => { const f = t < 0.56 ? S.fat : 1 + (S.fat - 1) * 0.3; return [interp(TT, RX, t) * f, interp(TT, RZ, t) * f]; };
const surf = (S: Shape, a: number, t: number, push = 0): V3 => { const [rx, rz] = radii(S, t); return [Math.sin(a) * (rx + push), yAt(t), Math.cos(a) * (rz + push)]; };
/** toad warts: jittered bumps on a grid wrapped round the body (0..1 height) */
function wartAt(a: number, t: number): number {
  const U = 30, u = ((a + Math.PI) / TAU) * U, v = t * 34, i0 = Math.floor(u), j0 = Math.floor(v);
  let h = 0;
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const i = (((i0 + di) % U) + U) % U, j = j0 + dj, hh = hash(i * 7 + 3, j * 13);
    if (hh < 0.3) continue;
    const cu = i0 + di + 0.2 + hash(i, j + 5) * 0.6, cv = j + 0.2 + hash(j + 11, i) * 0.6, r = 0.24 + hash(i + 9, j) * 0.3;
    const d = Math.hypot(u - cu, (v - cv) * 0.85) / r;
    if (d < 1) h = Math.max(h, (1 - d * d) * (0.45 + hh * 0.55));
  }
  return h;
}
/** where warts grow: back and flanks, few on the face, none on the belly */
const wartMask = (a: number, t: number) => { const aa = Math.abs(a); return sm(0.75, 1.35, aa) * sm(0.1, 0.22, t) * (1 - sm(0.93, 0.99, t)) * (aa < 1.2 && t > 0.5 && t < 0.84 ? 0.35 : 1); };
const mouthT = (a: number) => TM + 0.05 * Math.pow(Math.min(1, Math.abs(a) / 1.7), 2); // corners curl up

interface Built { geo: THREE.BufferGeometry; texA: THREE.DataTexture; texB: THREE.DataTexture; rest: V3[]; top: number }
function buildChild(L: BabyLook): Built {
  const S: Shape = { fat: 0.88 + L.chub * 0.3 };
  const B = new SkinB(512, 512), page = new Page(512, 512);
  const reg = (n: string, w: number, h: number) => page.reg(n, w, h);
  const R = {
    BODY: reg('BODY', 288, 168), TAIL: reg('TAIL', 64, 56), LIMB: reg('LIMB', 64, 88), EYE: reg('EYE', 56, 48), LID: reg('LID', 64, 14), PAD: reg('PAD', 12, 12),
    GILL: reg('GILL', 24, 40), SAC: reg('SAC', 64, 32), TONGUE: reg('TONGUE', 12, 28), GEM: reg('GEM', 12, 12), GLOW: reg('GLOW', 12, 12),
  };
  let g = 1;
  const rest: V3[] = BONES.map(() => [0, 0, 0]);
  const at = (n: BN, p: V3) => { rest[bi(n)] = p; };
  at('body', [0, 0.3, 0]); at('head', [0, 0.56, 0]); at('jaw', [0, 0.57, -0.05]); at('throat', [0, 0.46, 0.18]); at('tongue', [0, 0.585, 0.12]);
  // ---- the body: one loft, head and belly together
  const bt = cosT(46), bp: V3[] = bt.map((t) => [0, yAt(t), 0]);
  const iB = bi('body'), iH = bi('head'), iJ = bi('jaw');
  sac(B, R.BODY, g++, bp, bt.map((t) => radii(S, t)), bt.map((): Wt => [iB, 1]), {
    n: 72, up: [0, 0, 1], cap: 0.25,
    bump: (a, t) => {
      const aa = Math.abs(a);
      let b = -0.055 * gauss(t, mouthT(a), 0.011) * (1 - sm(1.6, 1.85, aa)) // the smile crease
        + 0.02 * gauss(t, mouthT(a) + 0.03, 0.015) * (1 - sm(1.4, 1.8, aa)) // upper lip
        + 0.07 * L.chub * gauss(aa, 1.0, 0.35) * gauss(t, 0.67, 0.06) // cheeks
        + 0.16 * gauss(aa, 0.55, 0.2) * gauss(t, 0.86, 0.055) // eye mounds
        + 0.06 * L.chub * gauss(a, 0, 0.9) * gauss(t, 0.28, 0.12); // belly
      if (L.back === 'fin') b += 0.2 * gauss(aa, Math.PI, 0.09) * sm(0.3, 0.4, t) * (1 - sm(0.82, 0.9, t));
      // toad skin: warts over the back and flanks, parotoid glands behind the eyes, side ridges, a wrinkled throat
      b += (L.back === 'smooth' ? 0.025 : 0.06) * wartAt(a, t) * wartMask(a, t)
        + 0.13 * gauss(aa, 1.28, 0.2) * gauss(t, 0.775, 0.045)
        + 0.035 * gauss(aa, 1.95, 0.07) * sm(0.22, 0.3, t) * (1 - sm(0.68, 0.76, t))
        + 0.012 * Math.sin(t * 260) * gauss(a, 0, 0.6) * gauss(t, 0.52, 0.035);
      return b;
    },
    wv: (a, t) => {
      const aa = Math.abs(a), hb = sm(0.55, 0.68, t);
      const jw = sm(0.44, 0.52, t) * (1 - sm(TM - 0.02, TM + 0.005, t)) * (1 - sm(1.2, 1.75, aa));
      const b = Math.max(0, 1 - hb - jw);
      return [iB, b, iH, hb, iJ, jw];
    },
  });
  const top = yAt(1);
  // the lodestone, glowing through the belly
  ball(B, R.GLOW, g++, surf(S, 0, 0.3, -0.035), [0, 0, 1], [0.045, 0.06, 0.035], [iB, 1], { n: 4, rings: 2 });
  // ---- the vocal sac (balloons when it croaks) and the tongue (it can't keep it in)
  ball(B, R.SAC, g++, [0, 0.47, 0.22], [0, -0.2, 1], [0.15, 0.1, 0.12], [bi('throat'), 1], { n: 16, rings: 8 });
  const tw: Wt = [bi('tongue'), 1];
  sac(B, R.TONGUE, g++, [[0, 0.585, 0.12], [0, 0.58, 0.3], [0, 0.56, 0.44]], [[0.035, 0.012], [0.032, 0.011], [0.03, 0.01]], [tw, tw, tw], { n: 8 });
  ball(B, R.TONGUE, g++, [0, 0.555, 0.47], [0, 0, 1], [0.045, 0.025, 0.04], tw, { n: 10, rings: 5 });
  // ---- bulging gem eyes on top of the head, in fleshy mounds
  for (const [sd, k] of SIDES) {
    const big = L.eyes === 'huge' ? 1.22 : L.eyes === 'googly' ? (k > 0 ? 1.25 : 0.9) : 1;
    const r = 0.112 * big, a = k * 0.55, t = 0.87;
    const ax = norm([Math.sin(a) * 0.7, 0.55, Math.cos(a)]);
    const c = addV(surf(S, a, t), scl(ax, r * 0.15));
    at(('eye' + sd) as BN, c);
    const ew: Wt = [bi(('eye' + sd) as BN), 1];
    ball(B, R.EYE, g++, c, ax, [r, r, r], ew, { n: 20, rings: 12 });
    sac(B, R.LID, g++, [addV(c, scl(ax, -r * 0.55)), addV(c, scl(ax, -r * 0.05)), addV(c, scl(ax, r * 0.3))], [[r * 1.12, r * 1.1], [r * 1.14, r * 1.12], [r * 1.02, r * 1.0]], [[iH, 1], [iH, 1], [iH, 1]], { n: 18, start: false, end: false, shift: (aa, tt) => (tt > 0.5 ? -r * 0.18 * Math.max(0, Math.cos(aa + Math.PI)) : 0) });
  }
  // ---- axolotl gills: three stalks a side, feathered with soft fronds or crystal spines
  for (const [sd, k] of SIDES) {
    const gb = surf(S, k * 1.5, 0.7); at(('gill' + sd) as BN, gb);
    if (L.gills === 'none') continue;
    const gw: Wt = [bi(('gill' + sd) as BN), 1];
    for (let j = 0; j < 3; j++) {
      const t = 0.62 + j * 0.08, base = surf(S, k * (1.45 + j * 0.05), t, -0.01);
      const dir = norm([k * 0.85, (j - 1) * 0.6 + 0.15, -0.5]);
      const len = j === 1 ? 0.3 : 0.24;
      const pts: V3[] = [0, 0.35, 0.7, 1].map((s) => addV(addV(base, scl(dir, s * len)), [0, Math.sin(s * Math.PI) * 0.03, 0]));
      sac(B, R.GILL, g++, pts, [[0.026, 0.026], [0.022, 0.022], [0.017, 0.017], [0.008, 0.008]], [gw, gw, gw, gw], { n: 7 });
      for (let f = 0; f < 8; f++) {
        const s = 0.18 + f * 0.1, p = addV(addV(base, scl(dir, s * len)), [0, Math.sin(s * Math.PI) * 0.03, 0]);
        const side = f % 2 ? 1 : -1;
        if (L.gills === 'crystal') sac(B, R.GEM, g++, [p, addV(p, [0, side * 0.045, -0.015])], [[0.012, 0.012], [0.001, 0.001]], [gw, gw], { n: 4, start: false });
        else ball(B, R.GILL, g++, addV(p, [0, side * 0.022, 0]), [0, side, 0.3], [0.024, 0.011, 0.034 * (1 - Math.abs(s - 0.55))], gw, { n: 6, rings: 4 });
      }
    }
  }
  // ---- stubby arms with round sticky finger pads
  for (const [sd, k] of SIDES) {
    const sh: V3 = [k * 0.29, 0.37, 0.15], el: V3 = [k * 0.41, 0.26, 0.25], wr: V3 = [k * 0.32, 0.2, 0.37];
    at(('arm' + sd) as BN, sh); at(('hand' + sd) as BN, wr);
    const ia = bi(('arm' + sd) as BN), ih = bi(('hand' + sd) as BN);
    const ctrl: V3[] = [addV(sh, [-k * 0.06, 0.02, -0.03]), sh, el, wr], sp = spline(ctrl, 12);
    sac(B, R.LIMB, g++, sp.pts, sp.t.map((t) => { const r = (0.08 - t * 0.025) * (0.9 + L.chub * 0.2); return [r, r] as [number, number]; }), chainWeights(sp.pts, [ctrl[0], sh, wr], [iB, ia], 0.05).map((w, i) => (i > 9 ? [ia, 0.5, ih, 0.5] : w)), { n: 12, cap: 0.6 });
    const hw: Wt = [ih, 1], dir = norm(sub(wr, el)), side = norm([dir[2], 0, -dir[0]]);
    const palm = addV(wr, scl(dir, 0.035));
    ball(B, R.LIMB, g++, palm, dir, [0.06, 0.035, 0.055], hw, { n: 10, rings: 5 });
    for (let i = 0; i < 4; i++) {
      const f = (i - 1.5) / 1.5, b0 = addV(addV(palm, scl(dir, 0.035)), scl(side, f * 0.045));
      const fd = norm(addV(dir, addV(scl(side, f * 0.45), [0, -0.25, 0])));
      const tip = addV(b0, scl(fd, 0.065));
      sac(B, R.LIMB, g++, [b0, lerpV(b0, tip, 0.5), tip], [[0.016, 0.014], [0.014, 0.012], [0.013, 0.011]], [hw, hw, hw], { n: 6 });
      ball(B, R.PAD, g++, tip, fd, [0.022, 0.016, 0.02], hw, { n: 8, rings: 4 });
    }
  }
  // ---- chubby hind legs dangling, long splayed toes with pads
  for (const [sd, k] of SIDES) {
    const hip: V3 = [k * 0.24, 0.17, -0.03], kn: V3 = [k * 0.4, 0.06, 0.13], an: V3 = [k * 0.32, -0.07, 0.06];
    at(('thigh' + sd) as BN, hip); at(('foot' + sd) as BN, an);
    const it = bi(('thigh' + sd) as BN), iF = bi(('foot' + sd) as BN);
    const ctrl: V3[] = [addV(hip, [-k * 0.05, 0.05, 0]), hip, kn, an], sp = spline(ctrl, 12);
    sac(B, R.LIMB, g++, sp.pts, sp.t.map((t) => { const r = (0.12 - t * 0.065 + 0.02 * gauss(t, 0.35, 0.15)) * (0.88 + L.chub * 0.25); return [r, r] as [number, number]; }), chainWeights(sp.pts, [ctrl[0], hip, kn, an], [iB, it, it], 0.05).map((w, i) => (i > 9 ? [it, 0.4, iF, 0.6] : w)), { n: 12, cap: 0.6 });
    const fw: Wt = [iF, 1];
    ball(B, R.LIMB, g++, addV(an, [0, -0.01, 0.03]), [0, -0.3, 1], [0.055, 0.035, 0.07], fw, { n: 10, rings: 5 });
    for (let i = 0; i < 5; i++) {
      const sp2 = (i - 2) * 0.32, d: V3 = norm([Math.sin(sp2) + k * 0.15, -0.45, Math.cos(sp2)]);
      const b0 = addV(an, [Math.sin(sp2) * 0.04, -0.01, 0.06]);
      const L0 = 0.07 + (2 - Math.abs(i - 2)) * 0.018, tip = addV(b0, scl(d, L0));
      sac(B, R.LIMB, g++, [b0, lerpV(b0, tip, 0.5), tip], [[0.014, 0.012], [0.012, 0.01], [0.011, 0.009]], [fw, fw, fw], { n: 6 });
      ball(B, R.PAD, g++, tip, d, [0.02, 0.015, 0.018], fw, { n: 8, rings: 4 });
    }
  }
  // ---- salamander tail: a flat paddle with a fin, curling up at the tip
  if (L.tail !== 'none') {
    const long = L.tail === 'long';
    const ctrl: V3[] = long ? [[0, 0.24, -0.22], [0, 0.17, -0.42], [0, 0.17, -0.62], [0, 0.25, -0.78], [0, 0.36, -0.82]] : [[0, 0.22, -0.24], [0, 0.17, -0.38], [0, 0.2, -0.5], [0, 0.29, -0.55]];
    at('tail1', ctrl[1]); at('tail2', ctrl[2]);
    const sp = spline(ctrl, 16);
    sac(B, R.TAIL, g++, sp.pts, sp.t.map((t) => [0.1 * (1 - t * 0.85) * (0.9 + L.chub * 0.2), 0.13 * (1 - t * 0.75)] as [number, number]), chainWeights(sp.pts, [ctrl[0], ctrl[1], ctrl[2], ctrl[ctrl.length - 1]], [iB, bi('tail1'), bi('tail2')], 0.06),
      { n: 12, bump: (a, t) => 0.45 * gauss(a, 0, 0.12) * Math.sin(Math.PI * Math.min(1, t * 1.1)) + 0.25 * gauss(Math.abs(a), Math.PI, 0.12) * Math.sin(Math.PI * t) });
  } else { at('tail1', [0, 0.2, -0.3]); at('tail2', [0, 0.2, -0.4]); }
  // ---- crystal warts down the back: it is silicon under the skin
  if (L.back === 'warts') for (let i = 0; i < 18; i++) {
    const t = 0.3 + hash(i, 3) * 0.6, a = (hash(i, 5) < 0.5 ? 1 : -1) * (1.7 + hash(i, 7) * 1.35);
    const p = surf(S, a, t, -0.01), r = 0.022 + hash(i, 9) * 0.02;
    ball(B, R.GEM, g++, p, norm([Math.sin(a), 0.3, Math.cos(a)]), [r, r, r * 1.1], t > 0.6 ? [iH, 1] : [iB, 1], { n: 4, rings: 2 });
  }
  const geo = B.build();
  const tex = (open: boolean) => { paintChild(L, S, R, open); page.finish(); const p = new Page(512, 512); p.pc.data.set(page.pc.data); return pageTexture(p); };
  return { geo, texA: tex(false), texB: tex(true), rest, top };
}

// ------------------------------------------------------------------------------------------------ painting
function paintChild(L: BabyLook, S: Shape, R: Record<string, Region>, open: boolean) {
  const SK = makeRamp(L.skin, 8, { spread: 0.42, hueShift: 0.03 }), BE = makeRamp(L.belly, 7, { spread: 0.3 }), PA = makeRamp(L.patCol, 6, { spread: 0.4 });
  const glowPx = (r: Region, x: number, y: number, t = 0.3, a = 190) => { r.set(x, y, mixC(L.glow, 0xffffff, t)); r.alpha(x, y, a); };
  const B = R.BODY;
  const SKd = makeRamp(mixHex(L.skin, L.patCol, 0.45), 8, { spread: 0.45, hueShift: 0.03 });
  const tipC = mixHex(L.skin, 0xd8b878, 0.45), wartC = mixHex(L.skin, 0x2a2016, 0.5);
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) {
    const t = (y + 0.5) / B.h, a = B.th(x), aa = Math.abs(a);
    const big = B.fbm(x, y, 5, 3, 3), fine = B.fbm(x, y, 22, 2, 4), grain = hash(x * 3, y * 7);
    let k = 3.6 + (big - 0.5) * 1.3 + (fine - 0.5) * 1.0 + (grain - 0.5) * 0.55 - sm(0.3, 0.9, t) * 0.4 * sm(1.2, 2.6, aa);
    let ramp = SK;
    const belly = (a / 1.08) ** 2 + ((t - 0.3) / 0.27) ** 2 < 1 + (hash(x, y * 3) - 0.5) * 0.08;
    let w = 0;
    if (belly) { ramp = BE; k = 3.9 + (fine - 0.5) * 0.9 + (grain - 0.5) * 0.5; if (hash(x * 5 + 1, y * 3) < 0.07) k -= 1.7; }
    else {
      const m = B.fbm(x, y, 7, 3, 21), face = aa < 1.15 && t > 0.5 && t < 0.82;
      if (!face) {
        if (L.pat === 'spots' && m > 0.6) { ramp = PA; k = m < 0.625 ? 1.8 : 3 + (fine - 0.5) * 1.2; }
        if (L.pat === 'patches' && m > 0.52) { ramp = SKd; k = m < 0.545 ? 1.6 : 3.2 + (fine - 0.5); }
        if (L.pat === 'speckles' && hash(x * 5, y * 7) < 0.08) { ramp = PA; k = 2.4; }
        if (L.pat === 'stripes') { if (aa > 3.0) { ramp = BE; k = 3.8; } else if (aa > 1.3 && Math.sin(t * 30 + m * 4) > 0.65) ramp = PA; }
      }
      w = wartAt(a, t) * wartMask(a, t);
      if (w > 0.04) k += w * 1.7 - (w < 0.2 ? 1.1 : 0);
      const gl = gauss(aa, 1.28, 0.2) * gauss(t, 0.775, 0.045);
      k += gl * 0.9 - (gl > 0.3 && hash(x * 7, y * 3) < 0.1 ? 1.8 : 0);
      k += 0.9 * gauss(aa, 1.95, 0.07) * sm(0.22, 0.3, t) * (1 - sm(0.68, 0.76, t));
      if (gauss(a, 0, 0.6) * gauss(t, 0.52, 0.035) > 0.3 && Math.sin(t * 260) < -0.6) k -= 1.1;
    }
    B.put(x, y, ramp, k, 0.45);
    if (w > 0.8 && hash(x + 1, y + 2) < 0.7) B.blend(x, y, tipC, 0.55);
    else if (w > 0.04 && w < 0.16) B.blend(x, y, wartC, 0.35);
    // wet highlights: specks on wart tops, a sheen on the crown and belly
    if ((w > 0.85 && hash(x + 2, y) < 0.3) || (t > 0.76 && aa < 1.1 && hash(x, y + 9) < 0.018) || (belly && hash(x + 4, y) < 0.008)) B.blend(x, y, 0xf4f4ec, 0.75);
  }
  // cheeks, nostrils, the smile
  if (L.blush) for (const k of [-1, 1]) for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { const d = Math.hypot((B.th(x) - k * 1.0) / 0.24, ((y + 0.5) / B.h - 0.665) / 0.035); if (d < 1 && hash(x, y) < 0.8) B.blend(x, y, 0xd87a7a, 0.32 * (1 - d * 0.5)); }
  for (const k of [-1, 1]) { const nx = B.X(k * 6), ny = Math.round(B.h * 0.7); B.set(nx, ny, mixC(SK[0], 0x000000, 0.4)); }
  const dark = mixC(L.patCol, 0x1a0812, 0.6);
  for (let x = 0; x < B.w; x++) {
    const a = B.th(x); if (Math.abs(a) > 1.7) continue;
    const y = Math.round(B.h * mouthT(a));
    B.set(x, y, dark); B.blend(x, y + 1, dark, 0.35);
    if (open && Math.abs(a) < 0.5) for (let d = 1; d <= 4 - Math.round(Math.abs(a) * 6); d++) B.set(x, y - d, d > 2 ? 0xe86a8a : 0x3a0a1a);
  }
  // the lodestone's light leaking through the belly
  for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) { const d = Math.hypot(B.th(x) / 0.32, ((y + 0.5) / B.h - 0.3) / 0.09); if (d < 1 && hash(x, y + 2) < 0.5 * (1 - d)) glowPx(B, x, y, 0.55, 230); }
  // tail: skin above, belly below, the pattern carried on, a translucent fin edge
  const T = R.TAIL;
  for (let y = 0; y < T.h; y++) for (let x = 0; x < T.w; x++) { const a = T.th(x), aa = Math.abs(a), t = y / T.h; const fin = aa < 0.25 || aa > 2.9; T.put(x, y, aa > 2.2 && !fin ? BE : L.pat === 'stripes' && Math.sin(t * 18) > 0.4 && !fin ? PA : SK, 3.4 + Math.cos(a) * 0.4 - t * 0.6 + (fin ? 1.4 : 0), 0.5); if (fin && t > 0.2) T.alpha(x, y, 225); }
  R.LIMB.fill(SK, (x, y) => 3.6 + Math.cos(R.LIMB.th(x)) * 0.5 - (y / R.LIMB.h) * 0.4 + (R.LIMB.fbm(x, y, 12, 2, 6) - 0.5) * 1.1 + (Math.sin(y * 0.42 + R.LIMB.fbm(x, y, 3, 2, 2) * 3) > 0.7 ? -1.3 : 0) + (hash(x, y) < 0.06 ? 1.2 : hash(x + 3, y) < 0.05 ? -0.9 : 0), undefined, 0.45);
  for (let y = 0; y < R.LIMB.h; y++) for (let x = 0; x < R.LIMB.w; x++) if (Math.abs(R.LIMB.th(x)) > 2.3) R.LIMB.put(x, y, BE, 3.6, 0.5);
  R.PAD.fill(makeRamp(mixHex(L.belly, 0xffb0c0, 0.35), 5, { spread: 0.3 }), (x, y) => 2.5 + y / R.PAD.h * 1.5);
  R.LID.fill(SK, (x, y) => 3.4 + (y / R.LID.h) * 0.8 + (y === R.LID.h - 1 ? -1.4 : 0), undefined, 0.4);
  // eyes: big glossy gem eyes, a horizontal frog pupil (googly: a little round one, off-centre)
  const E = R.EYE;
  for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) {
    const tt = y / (E.h - 1), ang = -Math.PI / 2 + Math.PI * (0.06 + tt * 0.88), rho = Math.cos(ang), a = E.th(x);
    const X = rho * Math.sin(a), Y = rho * Math.cos(a);
    let c = mixC(L.eye, 0x000000, 0.35 + rho * 0.2);
    if (tt > 0.5) {
      c = mixC(L.eye, 0xffffff, 0.15 - Y * 0.2);
      if (rho > 0.82) c = mixC(L.eye, 0x000000, 0.55);
      const facet = Math.floor((Math.atan2(Y, X) + Math.PI) / (TAU / 8)) % 2; // gem-cut iris
      if (rho < 0.8 && rho > 0.45) c = mixC(c, facet ? 0xffffff : 0x000000, 0.08);
      if (rho < 0.82 && Math.sin(X * 38 + Math.sin(Y * 21) * 2) + Math.sin(Y * 33 + X * 7) > 1.45) c = mixC(c, 0x1a1008, 0.6); // reticulated iris
      const pupil = L.eyes === 'googly' ? Math.hypot(X - 0.16, Y + 0.1) < 0.26 : (X / 0.5) ** 2 + (Y / 0.2) ** 2 < 1;
      if (pupil) c = 0x060408;
      if (Math.hypot(X + 0.3, Y - 0.34) < 0.17) c = 0xffffff;
      if (Math.hypot(X - 0.34, Y + 0.36) < 0.08) c = 0xe8f4ff;
    }
    E.set(x, y, c);
  }
  // vocal sac: thin pale skin; tongue: wet pink; gills: feathery pink-glow fronds
  R.SAC.fill(makeRamp(mixHex(L.belly, L.skin, 0.25), 6, { spread: 0.3 }), (x, y) => 3.6 + Math.cos(R.SAC.th(x)) * 0.4 + (hash(x, y) < 0.03 ? 1.5 : 0), undefined, 0.4);
  R.TONGUE.fill(makeRamp(0xf06a8a, 5, { spread: 0.4 }), (x, y) => 2.4 + Math.cos(R.TONGUE.th(x)) * 0.8 + (hash(x, y) < 0.08 ? 1 : 0));
  const gc = L.gills === 'crystal' ? L.glow : mixHex(0xc05a64, L.skin, 0.15);
  for (let y = 0; y < R.GILL.h; y++) for (let x = 0; x < R.GILL.w; x++) { R.GILL.put(x, y, makeRamp(gc, 6, { spread: 0.5 }), 1.8 + (y / R.GILL.h) * 1.8 + Math.cos(R.GILL.th(x)) * 0.6, 0.5); if (y > R.GILL.h * 0.8) R.GILL.alpha(x, y, 235); }
  for (let y = 0; y < R.GEM.h; y++) for (let x = 0; x < R.GEM.w; x++) { R.GEM.set(x, y, mixC(L.glow, 0xffffff, 0.15 + ((x + y) % 3) * 0.12)); R.GEM.alpha(x, y, 215); }
  for (let y = 0; y < R.GLOW.h; y++) for (let x = 0; x < R.GLOW.w; x++) glowPx(R.GLOW, x, y, 0.3 + hash(x, y) * 0.2);
  void S;
}

// ------------------------------------------------------------------------------------------------ the child
export class VeyrChild {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  private mesh: THREE.SkinnedMesh | null = null;
  private bones: THREE.Bone[] = [];
  private mat: THREE.MeshPhongMaterial;
  private glowU = { value: 0.3 };
  private built: Built | null = null;
  private stones: THREE.Mesh[] = [];
  private ring: THREE.Mesh;
  private t = 0; private blinkT = 3; private castT = 0; private castAt = new THREE.Vector3();
  private waveT = 0; private actT = 3; private act: 'croak' | 'blep' | 'wiggle' | 'spin' | null = null; private actK = 0;
  private baseScale: number; private grow = 0.72; private growTo = 0.72;
  hatch = 0; // 0 sealed .. 1 out and afloat
  look = new THREE.Vector3();
  private lookYaw = 0; private lookPitch = 0;
  private look_: BabyLook;
  constructor(readonly fx: Fx, scale = 1.25, look?: BabyLook, opts: { grown?: boolean } = {}) {
    this.look_ = look ?? loadLook();
    this.baseScale = scale;
    if (opts.grown) this.grow = this.growTo = 1;
    this.mat = new THREE.MeshPhongMaterial({ shininess: 46, specular: new THREE.Color(0x5a6a70) });
    const glowU = this.glowU;
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlowK = glowU;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlowK;')
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat glowA = sampledDiffuseColor.a; vec3 glowC = sampledDiffuseColor.rgb; diffuseColor.a = 1.0;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA < 0.98) totalEmissiveRadiance += glowC * uGlowK;');
    };
    this.mat.customProgramCacheKey = () => 'veyr-child-frog';
    gbuf(this.mat, 1);
    this.root.add(this.rig);
    const sm2 = new THREE.MeshLambertMaterial({ color: 0x2a2834, flatShading: true, emissive: new THREE.Color(0x7affe0), emissiveIntensity: 0.06 }); gbuf(sm2, 1);
    for (let i = 0; i < 6; i++) {
      const g = new THREE.OctahedronGeometry(1, 0); g.scale(0.7, 1.15, 0.7);
      const m = new THREE.Mesh(g, sm2); const s = 0.035 + hash(i, 3) * 0.035; m.scale.setScalar(s);
      m.userData = { s0: s, a: (i / 6) * TAU, r: 0.62 + hash(i, 5) * 0.22, y: 0.3 + hash(i, 7) * 0.7, sp: 0.4 + hash(i, 9) * 0.3, tilt: (hash(i, 11) - 0.5) * 0.7, rot: new THREE.Vector3(hash(i, 1), hash(i, 2), hash(i, 4)) };
      m.castShadow = true; this.stones.push(m); this.rig.add(m);
    }
    const rmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7affe0).multiplyScalar(1.4), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }); gbuf(rmat, 0);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.012, 4, 40), rmat); this.ring.rotation.x = Math.PI / 2; this.rig.add(this.ring);
    this.setLook(this.look_);
    this.root.visible = false;
  }
  /** rebuild the sculpt for a new look */
  setLook(L: BabyLook) {
    this.look_ = { ...L };
    if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.built?.texA.dispose(); this.built?.texB.dispose(); }
    const b = buildChild(this.look_);
    this.built = b;
    const bones = BONES.map((n) => { const o = new THREE.Bone(); o.name = n; return o; });
    BONES.forEach((n, i) => {
      const p = PARENT[n], rp = p ? b.rest[bi(p)] : [0, 0, 0];
      bones[i].position.set(b.rest[i][0] - rp[0], b.rest[i][1] - rp[1], b.rest[i][2] - rp[2]);
      if (p) bones[bi(p)].add(bones[i]);
    });
    this.mat.map = b.texA; this.mat.needsUpdate = true;
    const mesh = new THREE.SkinnedMesh(b.geo, this.mat);
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones, b.rest.map((p) => new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]))), new THREE.Matrix4());
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.mesh = mesh; this.bones = bones;
    this.rig.add(mesh);
    (this.stones[0].material as THREE.MeshLambertMaterial).emissive.set(this.look_.glow);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(this.look_.glow).multiplyScalar(1.4);
  }
  get lookData() { return this.look_; }
  /** it starts small and grows with its field (level 1..6) */
  setGrowth(level: number) { this.growTo = clamp(0.72 + (level - 1) * 0.11, 0.72, 1.3); }
  private B(n: BN) { return this.bones[bi(n)]; }
  /** reach toward a point; gills flare, mouth opens, the lodestone flares */
  cast(at: THREE.Vector3) { this.castT = 1.1; this.castAt.copy(at); this.onCast?.(); }
  onCast?: () => void;
  /** a little wave */
  wave() { this.waveT = 2.4; }
  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const h = this.hatch, t = this.t;
    this.root.visible = h > 0.05;
    if (!this.mesh) return;
    this.grow += (this.growTo - this.grow) * Math.min(1, dt * 0.8);
    this.root.scale.setScalar(this.baseScale * this.grow);
    const c = Math.min(1, this.castT * 3);
    // goofy idle business: croak, blep, wiggle, a lazy spin
    this.actT -= dt;
    if (this.actT <= 0 && !this.act && h >= 1) { this.act = (['croak', 'blep', 'wiggle', 'spin'] as const)[Math.floor(Math.random() * 4)]; this.actK = 0; }
    let croak = 0, blep = 0, wig = 0, spin = 0;
    if (this.act) {
      this.actK += dt;
      const d = this.act === 'croak' ? 1.6 : this.act === 'blep' ? 0.9 : this.act === 'spin' ? 2.2 : 1.2, u = this.actK / d;
      if (this.act === 'croak') croak = Math.max(0, Math.sin(u * Math.PI * 2)) ** 0.7;
      if (this.act === 'blep') blep = Math.sin(Math.min(1, u) * Math.PI) ** 0.5;
      if (this.act === 'wiggle') wig = Math.sin(u * Math.PI * 6) * Math.sin(u * Math.PI);
      if (this.act === 'spin') spin = u < 1 ? (1 - Math.cos(u * Math.PI)) * Math.PI : 0;
      if (u >= 1) { this.act = null; this.actT = 3 + Math.random() * 5; }
    }
    // rise out of the shell, then float and paddle the air
    const rise = clamp((h - 0.1) / 0.6, 0, 1);
    this.rig.position.y = (1 - rise) * -1.3 + rise * (0.42 + Math.sin(t * 1.2) * 0.07 + c * 0.1);
    this.rig.rotation.set(Math.sin(t * 0.8) * 0.06, spin, Math.sin(t * 1.0) * 0.07 + wig * 0.15);
    this.ring.position.y = 0.0 - Math.sin(t * 1.2) * 0.05; this.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.05 + c * 0.4);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = rise * (0.4 + c * 0.4);
    const sq = 1 + Math.sin(t * 2.2) * 0.025 + wig * 0.05;
    this.B('body').scale.set(sq, 1 / sq, sq);
    // look (the whole wide head turns), with a goofy tilt
    const target = this.castT > 0 ? this.castAt : this.look;
    this.root.updateMatrixWorld();
    const lp = this.root.worldToLocal(target.clone());
    const wantYaw = clamp(Math.atan2(lp.x, lp.z), -0.9, 0.9), wantPitch = clamp(-Math.atan2(lp.y - 0.8, Math.hypot(lp.x, lp.z)) * 0.5, -0.3, 0.3);
    this.lookYaw = damp(this.lookYaw, wantYaw, 3, dt); this.lookPitch = damp(this.lookPitch, wantPitch, 3, dt);
    this.B('head').rotation.set(this.lookPitch - c * 0.12, this.lookYaw, Math.sin(t * 0.6) * 0.12 + wig * 0.2);
    this.B('jaw').rotation.set(c * 0.25 + blep * 0.18 + croak * 0.05, 0, 0);
    this.B('throat').scale.setScalar(0.42 + croak * 0.75 + c * 0.1);
    this.B('tongue').scale.set(1, 1, 0.04 + blep * 1.1);
    this.mat.map = (c > 0.3 || blep > 0.2) && this.built ? this.built.texB : this.built!.texA;
    // eyes: slow blinks, googly wobble, they follow the target a little
    this.blinkT -= dt;
    let lid = 0;
    if (this.blinkT < 0.22) lid = Math.sin(clamp(this.blinkT / 0.22, 0, 1) * Math.PI);
    if (this.blinkT <= 0) this.blinkT = 2.5 + Math.random() * 4;
    if (h < 0.8) lid = 1 - clamp((h - 0.6) / 0.2, 0, 1);
    const open = Math.max(0.1, 1 - lid);
    const goo = this.look_.eyes === 'googly' ? 1 : 0;
    this.B('eyeL').scale.set(1, open, 1); this.B('eyeR').scale.set(1, open, 1);
    this.B('eyeL').rotation.set(Math.sin(t * 3.1) * 0.15 * goo, this.lookYaw * 0.3, 0);
    this.B('eyeR').rotation.set(Math.sin(t * 2.3 + 1) * 0.2 * goo, this.lookYaw * 0.3 + Math.sin(t * 1.7) * 0.2 * goo, 0);
    // gills ripple; they flare wide when it pulls
    for (const [sd, k] of SIDES) this.B(('gill' + sd) as BN).rotation.set(Math.sin(t * 3 + k) * 0.08, k * (Math.sin(t * 2.4 + k) * 0.12 - c * 0.35 - wig * 0.15), k * c * 0.2);
    // arms paddle the air; reach when casting; one waves
    this.castT = Math.max(0, this.castT - dt);
    this.waveT = Math.max(0, this.waveT - dt);
    const wv = Math.min(1, this.waveT * 1.5) * (1 - c);
    for (const [sd, k] of SIDES) {
      const up = sd === 'L' ? wv : 0, pad = Math.sin(t * 2.2 + (k > 0 ? 0 : Math.PI));
      this.B(('arm' + sd) as BN).rotation.set(-c * 1.5 - up * 1.4 + pad * 0.18, 0, k * (c * 0.4 + up * 0.9 + pad * 0.1));
      this.B(('hand' + sd) as BN).rotation.set(c * 0.5 + pad * 0.15, 0, k * up * Math.sin(t * 12) * 0.4);
      const kick = Math.sin(t * 1.6 + (k > 0 ? 0 : 2));
      this.B(('thigh' + sd) as BN).rotation.set(kick * 0.15 + c * 0.2, 0, k * kick * 0.06);
      this.B(('foot' + sd) as BN).rotation.set(-kick * 0.2, 0, 0);
    }
    this.B('tail1').rotation.set(Math.sin(t * 1.1) * 0.08, Math.sin(t * 1.8) * 0.25, 0);
    this.B('tail2').rotation.set(Math.sin(t * 1.3 + 1) * 0.12, Math.sin(t * 1.8 + 0.8) * 0.35, 0);
    this.glowU.value = 0.55 + c * 2.2 + Math.max(0, Math.sin(t * 2.0)) * 0.3 + (h > 0.7 && h < 1 ? (1 - h) * 6 : 0);
    if (c > 0.3 && Math.random() < dt * 30) {
      const p = new THREE.Vector3(0, 0, 0.1);
      this.B(Math.random() < 0.5 ? 'handL' : 'handR').localToWorld(p);
      const g = new THREE.Color(this.look_.glow).multiplyScalar(2.2);
      this.fx.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, g, 1, 2.5, 0.6, -0.3, 1);
    }
    // lodestones circle it on tilted orbits
    const vis = clamp((h - 0.65) / 0.3, 0, 1);
    for (const s of this.stones) {
      const u = s.userData; u.a += dt * (u.sp + c * 3);
      s.visible = vis > 0.01;
      const rr = u.r * (1 + c * 0.6);
      s.position.set(Math.cos(u.a) * rr, u.y + Math.sin(u.a) * u.tilt * rr, Math.sin(u.a) * rr);
      s.rotation.x += dt * u.rot.x * (1 + c * 5); s.rotation.y += dt * u.rot.y * (1 + c * 5);
      s.scale.setScalar(u.s0 * vis);
    }
    (this.stones[0].material as THREE.MeshLambertMaterial).emissiveIntensity = 0.06 + c * 0.9;
    void cam;
  }
  /** world position of the head (for beams) */
  headPos(out = new THREE.Vector3()) { out.set(0, 0.25, 0.05); return this.B('head').localToWorld(out); }
}
