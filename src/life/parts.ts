// More parts for the sculptor (sculpt.ts): shaggy coats, manes and bristle crests of pixel-art hair locks; skin
// crests, paddle fins, sails and frills on struts; spiral horns and palmate antlers; whiskers, round ears, tongues,
// throat sacs and feathery gills; bear paws, webbed frog feet and splayed lizard toes; warty wet amphibian skin;
// tortoise scute shells; crab carapaces with stalked eyes, beetle horns, moth wings and plumed antennae.
import { mixHex } from '../limbo/gfx/pixel';
import { RAMPS } from '../art/palette';
import { clamp } from '../core/rand';
import { type Region, oct, blade, sac, spline, ball, sheet, hash, gauss, sub, addV, scl, norm, cross, len, lerpV, mixC, transport, type V3, type Wt } from './kit';
import { BEASTS } from './bestiary';
import { type Ctx, has, hide, keratin, fuzz, interp, chordTs, furCard, sm, earPaint, rampFor } from './sculpt';

/** ramps come from the master palette, centred on the colour asked for */
const makeRamp = (c: number, _n?: number, _o?: unknown) => rampFor(c);

const TAU = Math.PI * 2;

// =============================================================================================== hair
export interface HairOpt { ramp: number[]; tip?: number[]; stiff?: boolean; frond?: boolean; /** thick wavy locks with volume (manes, shaggy coats) */ wavy?: boolean }
/** an alpha-cut card region painted with hair (locks, bristles or a feathery frond) */
export function hairReg(S: Ctx, name: string, w: number, h: number, o: () => HairOpt): Region {
  const have = S.page.regs.get(name); if (have) return have;
  const r = S.fixed(name, w, h); r.cut = true;
  S.paints.push(() => paintHair(r, o()));
  return r;
}
function paintHair(r: Region, o: HairOpt) {
  const R = o.ramp;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) r.set(x, y, R[2], 0);
  const put = (x: number, y: number, RR: number[], v: number) => r.set(x, y, RR[clamp(Math.round(v), 0, RR.length - 1)], 255);
  if (o.stiff) {
    // bristles: stiff straight strands, dark roots, pale tips
    for (let c = 0; c < r.w; c++) {
      if (hash(c, 21) < 0.18) continue;
      const L = Math.floor(r.h * (0.4 + hash(c, 23) * 0.6)), lean = (hash(c, 27) - 0.5) * 3;
      for (let y = 0; y < L; y++) { const f = y / L; put(c + Math.round(lean * f), y, o.tip && f > 0.72 ? o.tip : R, 0.6 + f * 2.6 + (hash(c, y) - 0.5) * 0.8); }
    }
    return;
  }
  if (o.frond) {
    // a feathery frond: a central stalk with filaments swept toward the tip on both sides
    const cx = Math.floor(r.w / 2);
    for (let y = 0; y < r.h; y++) {
      const f = y / r.h;
      put(cx, y, R, 1.6 + f); put(cx - 1, y, R, 1 + f);
      const fl = (1 - f * 0.8) * r.w * 0.47 * (y % 2 ? 0.8 : 1);
      for (const s of [-1, 1]) for (let k = 1; k < fl; k++) put(cx + (s < 0 ? -1 : 0) + s * k, y + k * 0.6, k > fl * 0.5 && o.tip ? o.tip : R, 2.4 + (k / fl) * 2.4 + (y % 2 ? -0.6 : 0) + (hash(y, k) - 0.5) * 0.6);
    }
    return;
  }
  if (o.wavy) {
    // thick locks swinging in an S: a shadowed core, a lit band down one side, strands following the curve, rounded tips
    const N = Math.max(3, Math.round(r.w / 7));
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < N; k++) {
      const K = k + pass * 53, cx = ((k + 0.5 + (pass ? 0.5 : 0) + (hash(K, 3) - 0.5) * 0.5) * r.w) / N;
      const Lk = r.h * (pass ? 0.62 + hash(K, 5) * 0.3 : 0.82 + hash(K, 5) * 0.18), wd = (r.w / N) * (0.5 + hash(K, 7) * 0.18) * (pass ? 0.85 : 1);
      const amp = r.w * (0.05 + hash(K, 9) * 0.05), ph = hash(K, 11) * 6, waves = 1.1 + hash(K, 13) * 0.6;
      for (let y = 0; y < Lk; y++) {
        const f = y / Lk, hw = wd * (f < 0.8 ? 1 - f * 0.25 : 0.8 * Math.sqrt(Math.max(0, 1 - (f - 0.8) / 0.2))) + 0.3;
        const xc = cx + Math.sin(f * Math.PI * 2 * waves + ph) * amp * (0.3 + f), slope = Math.cos(f * Math.PI * 2 * waves + ph);
        for (let x = Math.floor(xc - hw); x <= Math.ceil(xc + hw); x++) {
          const e = (x + 0.5 - xc) / hw; if (Math.abs(e) > 1) continue;
          const tip = o.tip && f > 0.6 + hash(x, K) * 0.25;
          let v = 1.2 + f * 1.4 + (pass ? 0.4 : 0) - Math.abs(e) * 0.9;
          if (e * Math.sign(slope || 1) < -0.15 && e * Math.sign(slope || 1) > -0.65 && f > 0.1) v += 1.3; // the lit band where the lock turns to the light
          if (Math.abs(e) > 0.82) v -= 1.2; // the shadow between locks
          if ((Math.floor((e + 1) * 3) + (y >> 2)) % 3 === 0) v -= 0.45; // strands
          put(x, y, tip ? o.tip! : R, v);
        }
      }
    }
    return;
  }
  // locks: tapered clumps of strands, dark at the root, light (or grizzled) at the tip, edged in shadow; two layers
  const N = Math.max(4, Math.round(r.w / 3.2));
  for (let pass = 0; pass < 2; pass++) for (let k = 0; k < N; k++) {
    const K = k + pass * 97, cx = ((k + hash(K, 3) * 0.9) * r.w) / N, Lk = r.h * (pass ? 0.45 + hash(K, 5) * 0.35 : 0.65 + hash(K, 5) * 0.35);
    const wd = 2.2 + hash(K, 7) * 2.4, bend = (hash(K, 9) - 0.5) * r.w * 0.14, ph = hash(K, 11) * 6;
    for (let y = 0; y < Lk; y++) {
      const f = y / Lk, hw = wd * (1 - f * f * 0.8) + 0.3, xc = cx + bend * f * f + Math.sin(y * 0.24 + ph) * 0.8;
      for (let x = Math.floor(xc - hw); x <= Math.ceil(xc + hw); x++) {
        const e = Math.abs(x + 0.5 - xc) / hw; if (e > 1) continue;
        const tip = o.tip && f > 0.68 + hash(x, K) * 0.2;
        let v = 0.9 + f * 2.0 + (1 - e) * 1.1 + (hash(x * 3 + K, 13) - 0.5) * 0.8 + (pass ? 0.45 : 0) + ((x + K) % 3 === 0 ? -0.5 : 0);
        if (e > 0.85) v -= 1.1;
        put(x, y, tip ? o.tip! : R, v);
      }
    }
  }
}

/** spine sample index nearest t */
const at = (S: Ctx, t: number) => clamp(Math.round(t * (S.spine!.pts.length - 1)), 0, S.spine!.pts.length - 1);
/** a point on the spine loft's surface at angle a (0 = top) and its outward normal */
function surf(S: Ctx, k: number, a: number, k2 = 0.92): { p: V3; n: V3 } {
  const sp = S.spine!, f = sp.fr[k];
  const n = norm(addV(scl(f.v, Math.cos(a)), scl(f.u, Math.sin(a))));
  return { p: addV(sp.pts[k], addV(scl(f.v, Math.cos(a) * sp.rv[k] * k2), scl(f.u, Math.sin(a) * sp.ru[k] * k2))), n };
}
/** cards along the spine with a length profile over t */
function cardRow(S: Ctx, t0: number, t1: number, angles: number[], L: (t: number) => number, W2: number, mode: 'drape' | 'hang' | 'up' | 'lie', reg: Region, step = 1, jitter = 0.3) {
  const sp = S.spine!, N = sp.pts.length - 1;
  for (let k = Math.max(0, Math.round(t0 * N)); k <= Math.min(N, Math.round(t1 * N)); k += step) for (const a0 of angles) {
    const a = a0 + (hash(k, a0 * 10 + 3) - 0.5) * jitter, f = sp.fr[k], t = k / N, l = L(t);
    if (l <= 0.002) continue;
    const { p, n } = surf(S, k, a, 0.88);
    const dir = mode === 'hang' ? norm(addV(scl(n, 0.4), [0, -1, 0])) : mode === 'drape' ? norm(addV(addV(scl(n, 0.55), scl(f.d, 0.8)), [0, -0.35, 0]))
      : mode === 'up' ? norm(addV(n, scl(f.d, 0.3))) : norm(addV(scl(n, 0.7), scl(f.d, 0.9)));
    furCard(S, p, dir, norm(cross(dir, n)), l, W2, sp.w[k], k * 37 + Math.round(a0 * 11), reg);
  }
}

export interface SpineTs { head: number; neck: number; chest: number; mid: number; hips: number; rump: number }

/** a lock of hair: a wide card that swings in an S along its length and curls under at the tip */
export function lock(S: Ctx, base: V3, dir: V3, side: V3, L: number, W2: number, w: Wt | Wt[], seed: number, reg: Region) {
  const l = L * (0.85 + hash(seed, 1) * 0.3), sw = (hash(seed, 2) - 0.5) * 0.5, sag = 0.1 + hash(seed, 3) * 0.12;
  const pts: V3[] = [0, 0.33, 0.66, 1].map((f) => addV(addV(base, scl(dir, l * f)), addV(scl(side, Math.sin(f * Math.PI * 1.5) * sw * l * 0.3), [0, -l * sag * f * f, 0])));
  const ww = Array.isArray(w[0]) ? (w as Wt[]) : pts.map(() => w as Wt);
  blade(S.B, reg, pts, [W2, W2 * 1.05, W2 * 0.9, W2 * 0.55], side, ww, { offset: -0.5, edge: 0.2, seed });
}
/** locks along the spine between t0..t1 at the given angles round it (0 = top) */
function lockRow(S: Ctx, t0: number, t1: number, angles: number[], L: (t: number) => number, W2: number, mode: 'drape' | 'hang', reg: Region, step = 1, lift = 0) {
  const sp = S.spine!, N = sp.pts.length - 1;
  for (let k = Math.max(0, Math.round(t0 * N)); k <= Math.min(N, Math.round(t1 * N)); k += step) for (const a0 of angles) {
    const a = a0 + (hash(k, a0 * 10 + 5) - 0.5) * 0.35, f = sp.fr[k], t = k / N, l = L(t);
    if (l <= 0.002) continue;
    const { p, n } = surf(S, k, a, 0.82 + lift);
    const dir = mode === 'hang' ? norm(addV(scl(n, 0.45), [0, -1, 0])) : norm(addV(addV(scl(n, 0.5), scl(f.d, 0.85)), [0, -0.45, 0]));
    lock(S, p, dir, norm(cross(dir, n)), l, W2, sp.w[k], k * 41 + Math.round(a0 * 13), reg);
  }
}

/** a heavy layered coat: long on the shoulders, throat and belly, shorter down the back, short on the face */
export function shagCoat(S: Ctx, T: SpineTs, W: number) {
  const d = S.d, P = S.P;
  const SH = hairReg(S, 'SHAG', 28, 32, () => ({ ramp: P.base, tip: makeRamp(mixHex(d.colors.base, d.colors.pattern, 0.55), 7, { spread: 0.5, hueShift: 0.04 }), wavy: true }));
  const step = S.spine!.pts.length > 44 ? 2 : 1;
  const hump = S.rig.dims.hump ? 1.2 : 1;
  lockRow(S, T.neck - 0.06, T.chest + 0.08, [-1.45, -0.8, 0, 0.8, 1.45], (t) => W * 0.42 * hump * (0.8 + 0.2 * gauss(t, T.chest, 0.06)), W * 0.36, 'drape', SH, step);
  lockRow(S, T.chest + 0.06, T.rump, [-1.2, -0.42, 0.42, 1.2], () => W * 0.3, W * 0.32, 'drape', SH, step * 2);
  lockRow(S, T.neck + 0.02, T.hips + 0.02, [-2.25, -2.75, 2.25, 2.75], (t) => W * (0.34 + 0.14 * gauss(t, T.chest, 0.08)), W * 0.32, 'hang', SH, step);
  lockRow(S, T.hips - 0.03, T.rump + 0.03, [-1.75, 1.75], () => W * 0.3, W * 0.3, 'drape', SH, step);
  return SH;
}

/** a lion's mane: a thick ruff of fur round the neck that gives it volume, heavy wavy locks ringing the face, a cape
 *  over the shoulders and a beard down the chest; darker toward the roots and the back */
export function mane(S: Ctx, T: SpineTs, W: number, head: V3, hl: number, hw: number, hh: number) {
  const d = S.d, iH = S.bi('head'), sp = S.spine!;
  const mc = mixHex(d.colors.pattern, d.colors.base, 0.3), ramp = makeRamp(mc, 7, { spread: 0.6, hueShift: 0.05 });
  const MN = hairReg(S, 'MANE', 30, 36, () => ({ ramp, tip: makeRamp(mixHex(d.colors.pattern, d.colors.base, 0.62), 7, { spread: 0.5 }), wavy: true }));
  // the ruff's body: a lumpy collar of fur hugging the neck from behind the ears to the shoulders
  const k0 = at(S, T.head - 0.01), k1 = at(S, T.chest), RB = S.reg('MANEB', TAU * W * 0.6, len(sub(sp.pts[k1], sp.pts[k0])) * 1.2, 12, 96, 64);
  const pts = sp.pts.slice(k0, k1 + 1), n = pts.length;
  const env = (i: number) => { const t = i / Math.max(1, n - 1); return Math.sin(Math.PI * (0.2 + 0.8 * t)) ** 0.6; };
  sac(S.B, RB, S.gid(), pts.map((p, i) => addV(p, [0, hh * 0.05 * env(i), 0])), pts.map((_, i) => [sp.ru[k0 + i] * 1.1 + hw * 0.26 * env(i), sp.rv[k0 + i] * 1.08 + hw * 0.24 * env(i)] as [number, number]),
    pts.map((_, i) => sp.w[k0 + i]), { n: 26, sq: 2, start: false, end: true, bump: (a, t) => 0.12 * Math.sin(a * 7 + t * 7) * Math.sin(t * 13 + a * 2) + 0.07 * Math.cos(a * 13 + t * 5) });
  S.paints.push(() => hide(S, RB, { L: hw * 2, rad: () => W * 0.5, seed: 97, kind: 'body', noPattern: true, ramp, clump: 1.5, flow: 1, down: 0.8 }));
  // a hood of mane round the head: the face sits in it, cheeks, chin and throat framed
  const iN = S.bi('neck'), hwt: Wt = [iH, 0.7, iN, 0.3];
  const helmed = !!(d.beast && BEASTS[d.beast]?.form.parts.some((p) => p.k === 'helm')), zb = helmed ? -0.2 : 0;
  const hood: V3[] = [addV(head, [0, hh * 0.08, hl * (-0.34 + zb)]), addV(head, [0, hh * 0.02 - (helmed ? hh * 0.12 : 0), hl * (-0.08 + zb)]), addV(head, [0, -hh * (helmed ? 0.2 : 0.06), hl * (0.14 + zb)])];
  sac(S.B, RB, S.gid(), hood, [[hw * 0.9, hh * 1.0], [hw * 0.95, hh * 1.05], [hw * 0.74, hh * 0.86]], [hwt, hwt, hwt],
    { n: 26, sq: 2, start: false, end: false, bump: (a, t) => 0.1 * Math.sin(a * 8 + t * 5) + 0.06 * Math.cos(a * 13) + 0.12 * gauss(Math.abs(a), Math.PI, 0.7) });
  // heavy locks round the rim of the hood, longest under the chin and down the throat
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + 0.17, out: V3 = [Math.sin(a), Math.cos(a), 0], chin = gauss(Math.cos(a), -1, 0.5);
    if (helmed && Math.cos(a) > 0.3) continue; // the helm crowns the head: the ruff frames only the cheeks and throat
    const base = addV(head, [Math.sin(a) * hw * 0.82, -hh * 0.06 + Math.cos(a) * hh * 0.92, hl * (0.1 + zb)]);
    const top = Math.max(0, Math.cos(a)), dir = norm(addV(scl(out, 0.7 - top * 0.35), [0, -0.35 - chin * 0.5, -0.35 - top * 0.6]));
    lock(S, base, dir, norm(cross(dir, [0, 0, 1])), hw * (0.5 + 0.35 * chin), hw * 0.5, hwt, 700 + i, MN);
  }
  lockRow(S, T.head, T.neck + 0.08, [-2.5, -1.7, -0.85, 0, 0.85, 1.7, 2.5], (t) => W * (0.5 + 0.12 * gauss(t, T.neck, 0.05)), W * 0.4, 'drape', MN, 1, 0.25);
  lockRow(S, T.neck, T.chest + 0.06, [-2.35, -2.85, 2.35, 2.85, Math.PI], () => W * 0.46, W * 0.36, 'hang', MN, 1, 0.2);
}

/** a cat's tail tip: a dark tassel of hair */
export function tassel(S: Ctx, W: number) {
  const sp = S.spine!, N = sp.pts.length - 1, d = S.d;
  const TS = hairReg(S, 'TASSEL', 12, 16, () => ({ ramp: makeRamp(mixHex(d.colors.pattern, 0x140c0a, 0.55), 6, { spread: 0.5 }), wavy: true }));
  const k = N - 1, f = sp.fr[k], tip = sp.pts[N];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, n = norm(addV(scl(f.u, Math.sin(a)), scl(f.v, Math.cos(a))));
    const dir = norm(addV(scl(f.d, 1), scl(n, 0.45)));
    lock(S, addV(lerpV(sp.pts[k - 1], tip, 0.4), scl(n, sp.ru[k] * 0.6)), dir, norm(cross(dir, n)), W * 0.3, W * 0.14, sp.w[k], 760 + i, TS);
  }
}

/** a crest down the spine: bristles on fur, a scalloped skin crest on wet skin, spiked scales on dry scales */
export function crest(S: Ctx, T: SpineTs, W: number, H: number) {
  const d = S.d, P = S.P, sp = S.spine!, N = sp.pts.length - 1;
  const fur = d.cover === 'fur' || has(d, 'fur');
  if (fur) {
    const BR = hairReg(S, 'BRISTLE', 16, 20, () => ({ ramp: P.dark, tip: d.colors.pattern !== d.colors.base ? P.pat : P.belly, stiff: true }));
    cardRow(S, T.neck - 0.05, T.hips, [-0.1, 0.1], (t) => W * 0.42 * (0.45 + 0.55 * gauss(t, T.chest - 0.02, 0.12)), W * 0.2, 'up', BR, 1, 0.12);
    return;
  }
  if (d.cover === 'scales' && !has(d, 'amphib_skin')) {
    const SP = S.fixed('SPIKE', 6, 16);
    for (let k = Math.round((T.neck - 0.03) * N); k <= Math.round(0.9 * N); k += 2) {
      const t = k / N, h = H * 0.32 * (0.35 + 0.65 * gauss(t, T.chest, 0.18)) * (t > T.rump ? (1 - t) / (1 - T.rump) * 0.8 + 0.2 : 1);
      const { p, n } = surf(S, k, 0, 0.85), tip = addV(p, addV(scl(n, h), scl(sp.fr[k].d, h * 0.35)));
      sac(S.B, SP, S.gid(), [p, lerpV(p, tip, 0.5), tip], [[W * 0.05, W * 0.03], [W * 0.032, W * 0.02], [0.002, 0.002]], [sp.w[k], sp.w[k], sp.w[k]], { n: 6 });
    }
    S.paints.push(() => keratin(SP, mixHex(d.colors.pattern, d.colors.accent, 0.35), { tipLight: 2.2 }));
    return;
  }
  // a wavy skin crest that runs from the nape on down the tail
  const CR = S.reg('CREST', W * 0.6, sp.L * 0.8, 8, 24, 140);
  const pts: V3[] = [], wd: number[] = [], sides: V3[] = [], w: Wt[] = [];
  for (let k = Math.round(T.neck * N); k <= N - 1; k++) {
    const t = k / N, { p, n } = surf(S, k, 0, 0.9);
    pts.push(p); sides.push(n); w.push(sp.w[k]);
    const env = sm(clamp((t - T.neck) / 0.06, 0, 1)) * (t > T.rump ? 0.7 + 0.3 * (1 - (t - T.rump) / (1 - T.rump)) : 1) * (t > 0.97 ? (1 - t) / 0.03 : 1);
    wd.push(H * 0.32 * env * (0.72 + 0.28 * Math.abs(Math.sin(k * 0.9))));
  }
  blade(S.B, CR, pts, wd, sides, w, { offset: -0.04, seed: 41 });
  S.paints.push(() => finPaint(S, CR));
}

/** a membrane painter shared by crests, fins and sails: banded skin with rays, spots and a dark rim */
function finPaint(S: Ctx, r: Region, o: { rays?: number; accent?: number } = {}) {
  const d = S.d, R = makeRamp(mixHex(d.colors.base, o.accent ?? d.colors.accent, o.accent ? 0.55 : 0.3), 7, { spread: 0.55, hueShift: 0.05 }), Pp = S.P.pat;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const u = x / r.w;
    let k = 2.6 + u * 1.3 + (r.fbm(x, y, 3, 2, 17) - 0.5) * 1.2 + (o.rays && y % o.rays === 0 ? -1.1 : 0);
    if (u > 0.88) k -= 1.6;
    const spot = d.pattern !== 'plain' && hash(Math.floor(x / 3), Math.floor(y / 3) + 7) > 0.86 && u < 0.85;
    r.put(x, y, spot ? Pp : R, k, 0.5);
  }
}

/** a flattened sculling tail: fins above and below the tail */
export function tailFin(S: Ctx, T: SpineTs, H: number) {
  const sp = S.spine!, N = sp.pts.length - 1, FIN = S.reg('FIN', H * 0.6, sp.L * 0.5, 8, 24, 96);
  for (const side of [1, -1]) {
    const pts: V3[] = [], wd: number[] = [], sides: V3[] = [], w: Wt[] = [];
    for (let k = Math.round((T.rump + (side > 0 ? 0.0 : 0.04)) * N); k <= N; k++) {
      const t = k / N, u = (t - T.rump) / (1 - T.rump), { p, n } = surf(S, k, side > 0 ? 0 : Math.PI, 0.85);
      pts.push(p); sides.push(n); w.push(sp.w[k]);
      wd.push(H * (side > 0 ? 0.44 : 0.3) * sm(clamp(u * 3.5, 0, 1)) * Math.pow(Math.max(0, 1 - u), 0.35) + 0.002);
    }
    if (pts.length > 2) blade(S.B, FIN, pts, wd, sides, w, { offset: -0.05, seed: 13 + side });
  }
  S.paints.push(() => finPaint(S, FIN, { rays: 3 }));
}

/** a bushy tail: hair locks all around the tail */
export function brushTail(S: Ctx, T: SpineTs, W: number, reg: Region) {
  cardRow(S, T.rump + 0.01, 0.995, [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI], (t) => W * (0.26 + 0.16 * sm(clamp((t - T.rump) / 0.12, 0, 1))), W * 0.24, 'lie', reg, 1, 0.5);
}

/** a dorsal sail: a tall fan of skin stretched over long spines */
export function sail(S: Ctx, T: SpineTs, W: number, L: number) {
  const d = S.d, sp = S.spine!, N = sp.pts.length - 1;
  const t0 = T.neck + 0.01, t1 = T.hips + 0.06, Hs = L * 0.3;
  const SAIL = S.reg('SAIL', Hs, (t1 - t0) * sp.L, 12, 64, 96), BONE = S.fixed('SPINE', 6, 16);
  const pts: V3[] = [], wd: number[] = [], sides: V3[] = [], w: Wt[] = [];
  for (let k = Math.round(t0 * N); k <= Math.round(t1 * N); k++) {
    const u = (k / N - t0) / (t1 - t0), { p } = surf(S, k, 0, 0.85);
    const h = Hs * Math.pow(Math.max(0, Math.sin(Math.PI * clamp(u * 0.92 + 0.04, 0, 1))), 0.75) + 0.002;
    pts.push(p); wd.push(h); sides.push(norm(addV([0, 1, 0], scl(sp.fr[k].d, 0.12)))); w.push(sp.w[k]);
  }
  blade(S.B, SAIL, pts, wd, sides, w, { offset: -0.02, seed: 7 });
  for (let i = 1; i < pts.length - 1; i += 2) {
    const tip = addV(pts[i], scl(sides[i], wd[i] * 1.06));
    sac(S.B, BONE, S.gid(), [addV(pts[i], [0, -W * 0.05, 0]), lerpV(pts[i], tip, 0.5), tip], [[W * 0.03, W * 0.03], [W * 0.022, W * 0.022], [0.003, 0.003]], [w[i], w[i], w[i]], { n: 5 });
  }
  S.paints.push(() => {
    finPaint(S, SAIL, { accent: d.colors.accent });
    // bold bands across the sail and a vein at every spine
    for (let y = 0; y < SAIL.h; y++) for (let x = 0; x < SAIL.w; x++) {
      if (Math.sin(x * 0.45 + SAIL.fbm(x, y, 3, 2, 4) * 3) > 0.55 && x < SAIL.w * 0.86) SAIL.put(x, y, S.P.pat, 2.4 + (hash(x, y) - 0.5), 0.5);
      if ((y % Math.max(3, Math.round(SAIL.h / Math.max(1, pts.length / 2)))) === 0) SAIL.blend(x, y, 0x2a1a14, 0.4);
    }
    keratin(BONE, 0xd8c8a8, { tipLight: 1.6 });
  });
}

/** a neck frill: a flared collar of skin on bony struts behind the head, painted with eyespots */
export function frill(S: Ctx, T: SpineTs, hw: number) {
  const d = S.d, sp = S.spine!, k = at(S, T.head + (T.neck - T.head) * 0.35), f = sp.fr[k], c = sp.pts[k];
  const iH = S.bi('head'), iN = S.bi('neck');
  const r0 = Math.max(sp.ru[k], sp.rv[k]) * 0.85, r1 = hw * 1.35;
  const FR = S.reg('FRILL', r1 * 4, r1, 12, 96, 32), BONE = S.fixed('SPINE', 6, 16);
  const cols = 13, rows = 3, grid: V3[][] = [];
  const dirAt = (a: number) => norm(addV(scl(f.u, Math.sin(a)), scl(f.v, Math.cos(a))));
  for (let i = 0; i <= rows; i++) {
    const rr = r0 + (r1 - r0) * (i / rows);
    grid.push(Array.from({ length: cols }, (_, j) => { const a = -2.55 + (5.1 * j) / (cols - 1); return addV(addV(c, scl(dirAt(a), rr * (1 + 0.06 * Math.cos(j * 2.2) * (i / rows)))), scl(f.d, -(rr - r0) * 0.35)); }));
  }
  sheet(S.B, FR, S.gid(), grid, (i) => (i === 0 ? [iN, 0.6, iH, 0.4] : [iN, 0.35, iH, 0.65]));
  for (let j = 0; j < cols; j += 2) {
    const a = -2.55 + (5.1 * j) / (cols - 1), p0 = addV(c, scl(dirAt(a), r0 * 0.9)), p1 = grid[rows][j];
    sac(S.B, BONE, S.gid(), [p0, lerpV(p0, p1, 0.5), p1], [[hw * 0.04, hw * 0.04], [hw * 0.03, hw * 0.03], [0.003, 0.003]], [[iN, 0.5, iH, 0.5], [iN, 0.35, iH, 0.65], [iN, 0.35, iH, 0.65]], { n: 5 });
  }
  S.paints.push(() => {
    const A = makeRamp(d.colors.accent, 7, { spread: 0.55, hueShift: 0.06 }), Pp = S.P.pat;
    for (let y = 0; y < FR.h; y++) for (let x = 0; x < FR.w; x++) {
      const v = y / FR.h, u = x / FR.w;
      let k2 = 2.2 + v * 1.8 + (FR.fbm(x, y, 3, 2, 9) - 0.5) * 0.9 + (x % Math.round(FR.w / 6) === 0 ? -1.2 : 0);
      let RR = v < 0.3 ? S.P.belly : A;
      if (v > 0.86) { RR = Pp; k2 = 1.2; }
      for (const eu of [0.22, 0.78]) { const dd = oct((u - eu) * 3.4, v - 0.62); if (dd < 0.16) { RR = dd < 0.07 ? Pp : S.P.belly; k2 = dd < 0.07 ? 1 : 4; } }
      FR.put(x, y, RR, k2, 0.5);
    }
    keratin(BONE, mixHex(d.colors.accent, 0x2a1a14, 0.5), { tipLight: 1.2 });
  });
}

// =============================================================================================== head parts
export interface HeadCtx { head: V3; hl: number; hw: number; hh: number; sl: number; z0: number; iH: number; fur: boolean }

/** small rounded ears close to the skull */
export function roundEars(S: Ctx, h: HeadCtx, earBone: (s: number) => number = () => h.iH) {
  const EAR = S.reg('EAR', TAU * h.hw * 0.2, h.hh * 0.6, 8, 32, 24);
  for (const s of [-1, 1]) {
    const iE = earBone(s), b0 = iE === h.iH ? addV(h.head, [s * h.hw * 0.36, h.hh * 0.38, -h.hl * 0.1]) : S.at(iE), dir = norm([s * 0.6, 1, -0.3]);
    const el = h.hh * 0.38, ew = h.hw * 0.18;
    const pts: V3[] = [0, 0.3, 0.62, 0.88, 1].map((t) => addV(b0, scl(dir, t * el)));
    sac(S.B, EAR, S.gid(), pts, [0.8, 1, 0.95, 0.7, 0.24].map((k) => [ew * k, ew * k * 0.4] as [number, number]), pts.map((_, i) => (i ? [iE, 1] : [iE, 0.6, h.iH, 0.4])),
      { n: 12, up: [0, 0, 1], shift: (a, t) => -ew * 0.26 * Math.max(0, Math.cos(a)) * Math.sin(Math.PI * t), bump: h.fur ? fuzz(0.14, 12, 5, 19 + s) : undefined });
  }
  S.paints.push(() => earPaint(S, EAR, 1.05, h.hh * 0.4, h.hw * 0.18));
}

/** whiskers: rows of stiff pale hairs fanning from the whisker pads, each two crossed tapering strips so they read
 *  from any side, drooping a little under their own length */
export function whiskers(S: Ctx, h: HeadCtx) {
  const WH = S.fixed('WHISK', 4, 12);
  const wd = Math.max(0.005, h.hw * 0.034), w: Wt = [h.iH, 1];
  for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {
    const row = k % 3, col = Math.floor(k / 3);
    const root = addV(h.head, [s * h.hw * (0.21 + col * 0.025), -h.hh * (0.03 + row * 0.055), h.z0 + h.sl * (0.74 - col * 0.11)]);
    const out = norm([s, (1 - row) * 0.3 + (hash(k, s + 3) - 0.5) * 0.12, 0.42 - col * 0.18]);
    const L = h.hw * (0.95 + hash(k, s + 7) * 0.4) * (col === 2 ? 0.7 : 1);
    const pts = [0, 0.35, 0.7, 1].map((f) => addV(addV(root, scl(out, L * f)), [0, -L * 0.14 * f * f, 0]));
    const wid = [wd, wd * 0.62, wd * 0.4, wd * 0.2];
    blade(S.B, WH, pts, wid, norm(cross(out, norm([0, 1, 0.55]))), pts.map(() => w), { offset: -0.5 });
  }
  S.paints.push(() => {
    // dark at the follicle, then ivory to a bright tip
    const R = makeRamp(0xf0ead8, 5, { spread: 0.3 });
    WH.fill(R, (x, y) => (y < WH.h * 0.06 ? 0.5 : 3 + (y / WH.h) * 1.5), undefined, 0.2);
  });
}

/** a tongue on its own bone: a sticky blob for frogs, a forked tip for lizards */
export function tongue(S: Ctx, h: HeadCtx, J: V3, iJ: number) {
  const iT = S.rig.tongue; if (iT < 0) return;
  const TG = S.fixed('TONGUE', 8, 12), n = 6, pts: V3[] = [], rr: [number, number][] = [], ww: Wt[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), k = Math.pow(t, 1.3);
    pts.push(addV(J, [0, h.hh * (0.07 + 0.03 * t), -h.hl * 0.06 + t * (h.sl * 0.6 + h.hl * 0.06)]));
    rr.push([h.hw * (0.15 - 0.07 * t), h.hh * 0.05]); ww.push(k < 0.02 ? [iJ, 1] : [iJ, 1 - k, iT, k]);
  }
  sac(S.B, TG, S.gid(), pts, rr, ww, { n: 8 });
  const tip = pts[n - 1];
  if (has(S.d, 'amphib_skin') || S.rig.dims.hop) ball(S.B, TG, S.gid(), addV(tip, [0, 0, h.hw * 0.04]), [0, 0, 1], [h.hw * 0.12, h.hh * 0.07, h.hw * 0.1], [iT, 1], { n: 8, rings: 4 });
  else for (const s of [-1, 1]) { const e = addV(tip, [s * h.hw * 0.06, 0, h.hw * 0.16]); sac(S.B, TG, S.gid(), [tip, lerpV(tip, e, 0.5), e], [[h.hw * 0.03, h.hh * 0.025], [h.hw * 0.02, h.hh * 0.02], [0.002, 0.002]], [[iT, 1], [iT, 1], [iT, 1]], { n: 5 }); }
  S.paints.push(() => { const R = makeRamp(has(S.d, 'amphib_skin') ? 0xd8707a : 0x6a3a5a, 5, { spread: 0.5 }); TG.fill(R, (x, y) => 1.6 + (Math.cos(TG.th(x)) > 0.3 ? 1 : 0) + (Math.abs(TG.th(x)) < 0.3 && y % 3 === 0 ? 1.2 : 0)); });
}

/** a frog's vocal sac: swells on its own bone */
export function throatSac(S: Ctx, h: HeadCtx) {
  const iT = S.rig.throat; if (iT < 0) return;
  const TH = S.fixed('THROAT', 10, 8);
  ball(S.B, TH, S.gid(), addV(h.head, [0, -h.hh * 0.3, h.hl * 0.06]), [0, 0, 1], [h.hw * 0.3, h.hh * 0.22, h.hl * 0.24], [iT, 1], { n: 12, rings: 6 });
  S.paints.push(() => TH.fill(S.P.belly, (x, y) => 3 + (Math.cos(TH.th(x)) > 0.2 ? 0.6 : 0) + (y % 3 === 0 ? -0.8 : 0)));
}

/** feathery external gills: three fronds each side behind the head */
export function gills(S: Ctx, h: HeadCtx) {
  const d = S.d;
  const GL = hairReg(S, 'GILL', 10, 16, () => ({ ramp: makeRamp(mixHex(d.colors.accent, 0xe04a6a, 0.45), 7, { spread: 0.5, hueShift: 0.05 }), tip: makeRamp(mixHex(d.colors.accent, 0xf8b0c0, 0.55), 7, { spread: 0.45 }), frond: true }));
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const base = addV(h.head, [s * h.hw * 0.4, h.hh * (0.28 - k * 0.22), -h.hl * (0.16 + k * 0.03)]);
    const dir = norm([s * 0.85, 0.75 - k * 0.5, -0.65]);
    furCard(S, base, dir, norm(addV(cross(dir, [0, 0, 1]), [0, 0, 0.4])), h.hw * (0.85 - k * 0.08), h.hw * 0.42, [h.iH, 1], 900 + k + s * 5, GL);
  }
}

/** heavy ridged horns curling back, down and forward around the ears */
export function ramHorns(S: Ctx, h: HeadCtx) {
  const d = S.d, HR = S.reg('RHORN', TAU * h.hw * 0.13, h.hh * 3, 6, 20, 64);
  for (const s of [-1, 1]) {
    const b0 = addV(h.head, [s * h.hw * 0.26, h.hh * 0.44, h.hl * 0.0]), Rh = h.hh * 0.68, N = 24, pts: V3[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, ph = u * 1.8 * Math.PI, R = Rh * (1 - 0.48 * u);
      pts.push(addV(b0, [s * (u * h.hw * 0.5 + Math.sin(ph) * h.hw * 0.08), R * Math.cos(ph) - Rh + h.hh * 0.05 * u, -R * Math.sin(ph) - h.hl * 0.12 * u]));
    }
    const r0 = Math.max(0.025, h.hw * 0.21);
    sac(S.B, HR, S.gid(), pts, pts.map((_, i) => { const r = r0 * (1 - 0.78 * (i / N)) + 0.003; return [r, r * 0.85] as [number, number]; }), pts.map(() => [h.iH, 1]), { n: 9, bump: (_a, t) => 0.1 * Math.max(0, Math.sin(t * 90)) * (1 - t * 0.6) });
  }
  S.paints.push(() => keratin(HR, mixHex(d.colors.pattern, 0xd8c8a0, 0.6), { rings: true, tipLight: 1.4 }));
}

/** an elk's antlers: a full branching rack (the gene name is historical: no more paddles) */
export function palmAntlers(S: Ctx, h: HeadCtx) { rack(S, h, 1, true); }

/** a branching rack: a beam that sweeps out, back and up off a pearled burr and curves forward at the top, tines
 *  reaching forward off its front face (brow, bez, trez, the long royal, a crown at the top); polished bone, or velvet */
export function rack(S: Ctx, h: HeadCtx, size: number, big: boolean) {
  const d = S.d, w: Wt = [h.iH, 1];
  const La = h.hl * (big ? 1.9 : 1.25) * size, r0 = Math.max(0.018, h.hw * (big ? 0.11 : 0.08));
  const AN = S.reg('ANTLER', TAU * r0 * 1.2, La * 1.1, 8, 24, 110);
  const velvet = hash(d.seed % 1000, 41) < 0.3;
  const TINES: number[][] = big ? [[0.05, 0.42, 0.95, 0.1], [0.14, 0.36, 0.85, 0.05], [0.4, 0.3, 0.65, 0.05], [0.6, 0.42, 0.55, -0.05], [0.8, 0.28, 0.35, 0.1], [0.93, 0.22, 0.15, -0.2]]
    : [[0.1, 0.32, 0.9, 0.1], [0.45, 0.3, 0.55, 0], [0.75, 0.26, 0.3, -0.1]];
  for (const s of [-1, 1]) {
    const b0 = addV(h.head, [s * h.hw * 0.27, h.hh * 0.44, -h.hl * 0.02]);
    // the main beam: out and back low over the neck, then rising, its crown swinging forward
    const bc: V3[] = [b0, addV(b0, [s * La * 0.2, La * 0.1, -La * 0.15]), addV(b0, [s * La * 0.42, La * 0.36, -La * 0.36]), addV(b0, [s * La * 0.52, La * 0.66, -La * 0.36]), addV(b0, [s * La * 0.5, La * 0.92, -La * 0.16]), addV(b0, [s * La * 0.42, La * 1.06, La * 0.06])];
    const bs = spline(bc, 20), N = bs.pts.length - 1;
    const rad = (t: number) => r0 * (1 - t * 0.62) * (t < 0.04 ? 1.45 : 1);
    sac(S.B, AN, S.gid(), bs.pts, bs.t.map((t) => [rad(t), rad(t) * 0.86] as [number, number]), bs.pts.map(() => w),
      { n: 11, sq: 2, bump: (a, t) => (t < 0.3 ? 0.22 * Math.max(0, Math.sin(a * 5 + t * 50)) * (1 - t / 0.3) : 0.04 * Math.sin(a * 4)) });
    for (const [tt, tl, fwd, outw] of TINES) {
      const k = Math.round(tt * N), p = bs.pts[k], rr = rad(tt), L = La * tl * (0.9 + hash(k, s + 5) * 0.2);
      // tines leave the front of the beam reaching forward, then sweep up toward their tips
      const dir = norm([s * outw, 0.35 + (1 - fwd) * 0.6, fwd * (tt < 0.2 ? 1.25 : 1.05)]);
      const pts: V3[] = [addV(p, scl(dir, -rr * 0.4)), addV(p, scl(dir, L * 0.32)), addV(addV(p, scl(dir, L * 0.6)), [0, L * 0.16, 0]), addV(addV(p, scl(dir, L * 0.76)), [0, L * 0.42, 0])];
      sac(S.B, AN, S.gid(), pts, [[rr * 0.8, rr * 0.72], [rr * 0.58, rr * 0.52], [rr * 0.34, rr * 0.3], [rr * 0.08, rr * 0.08]], pts.map(() => w), { n: 9, sq: 2, tv: [0.45, 0.3, 0.12, 0] });
    }
  }
  S.paints.push(() => {
    if (velvet) {
      // velvet: short soft fur, grey-brown, paler and rounder at the growing tips
      const R = makeRamp(mixHex(d.colors.base, 0x6a5a4a, 0.5), 7, { spread: 0.5, hueShift: 0.04 });
      AN.fill(R, (x, y) => 2.4 + (y / AN.h) * 1.4 + (Math.cos(AN.th(x)) > 0.3 ? 0.8 : 0) + ((x + (y >> 2)) % 4 === 0 ? -0.7 : 0), undefined, 0.4);
      return;
    }
    // bone: dark furrowed and pearled near the burr, long grooves up the beam, polished ivory tines
    const R = makeRamp(0x8a7256, 7, { spread: 0.6, hueShift: 0.04 });
    for (let y = 0; y < AN.h; y++) for (let x = 0; x < AN.w; x++) {
      const f = y / AN.h, th = AN.th(x);
      let k = 1.6 + f * 2.6 + Math.cos(th) * 0.8 + (AN.fbm(x, y, 4, 2, 21) - 0.5) * 1.0;
      if (Math.sin(x * 1.7 + AN.fbm(x, y, 3, 2, 8) * 5) > 0.7 && f < 0.75) k -= 1.0; // grooves
      if (f < 0.3 && hash(x >> 1, y >> 1) < 0.2) k += 1.3; // pearls
      if (f > 0.82) k += 1.2;
      AN.put(x, y, R, k, 0.4);
    }
  });
}

// =============================================================================================== feet
const clawOn = (S: Ctx, R: Region, b: V3, dir: V3, L: number, r: number, w: Wt) => {
  const tip = addV(addV(b, scl(dir, L)), [0, -L * 0.5, 0]);
  sac(S.B, R, S.gid(), [b, addV(lerpV(b, tip, 0.5), [0, L * 0.16, 0]), tip], [[r, r * 0.8], [r * 0.62, r * 0.5], [0.002, 0.002]], [w, w, w], { n: 6 });
};
/** a bear's paw: a broad flat-soled pad, five toes in an arc, long pale digging claws */
export function bearPaw(S: Ctx, FOOT: Region, F: V3, fw: Wt, lt: number, fore: boolean) {
  const BC = S.fixed('BCLAW', 6, 10);
  sac(S.B, FOOT, S.gid(), [addV(F, [0, lt * 0.55, -lt * 0.2]), addV(F, [0, lt * 0.3, lt * 0.06]), addV(F, [0, lt * 0.15, lt * 0.38]), addV(F, [0, lt * 0.12, lt * 0.55])],
    [[lt * 0.5, lt * 0.44], [lt * 0.6, lt * 0.32], [lt * 0.6, lt * 0.2], [lt * 0.5, lt * 0.12]], [fw, fw, fw, fw], { n: 14, bump: (a) => -0.15 * gauss(Math.abs(a), Math.PI, 0.6) });
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.33, c: V3 = addV(F, [Math.sin(a) * lt * 0.5, lt * 0.13, lt * 0.52 + Math.cos(a) * lt * 0.12 - Math.abs(i - 2) * lt * 0.07]);
    ball(S.B, FOOT, S.gid(), c, [Math.sin(a) * 0.4, 0, 1], [lt * 0.14, lt * 0.13, lt * 0.15], fw, { n: 8, rings: 5 });
    clawOn(S, BC, addV(c, [0, lt * 0.05, lt * 0.1]), norm([Math.sin(a) * 0.3, 0.05, 1]), lt * (fore ? 0.55 : 0.38), lt * 0.06, fw);
  }
  S.paints.push(() => keratin(BC, mixHex(S.d.colors.base, 0xd8ccb0, 0.6), { tipLight: 1.8 }));
}
/** splayed toes: webbed frog feet, slender padded fingers, lizard toes with claws */
export function toes(S: Ctx, FOOT: Region, F: V3, fw: Wt, lt: number, s: number, o: { n: number; len: number; spread: number; turn: number; web?: boolean; pads?: boolean; claws?: boolean }) {
  const tp: ((f: number) => V3)[] = [];
  for (let i = 0; i < o.n; i++) {
    const a = s * o.turn + (i - (o.n - 1) / 2) * o.spread, dir: V3 = [Math.sin(a), 0, Math.cos(a)];
    const Lt = lt * o.len * (0.75 + 0.45 * gauss(i, o.n - 2, 1.1));
    const P = (f: number): V3 => addV(addV(F, scl(dir, Lt * f)), [0, lt * (0.1 - 0.075 * f), 0]);
    tp.push(P);
    const pts = [0, 0.35, 0.7, 1].map(P);
    sac(S.B, FOOT, S.gid(), pts, pts.map((_, k) => [lt * (0.11 - k * 0.014), lt * (0.08 - k * 0.012)] as [number, number]), pts.map(() => fw), { n: 7 });
    if (o.pads) ball(S.B, FOOT, S.gid(), P(1.02), dir, [lt * 0.1, lt * 0.06, lt * 0.08], fw, { n: 8, rings: 4 });
    if (o.claws) clawOn(S, S.fixed('CLAW', 6, 10), P(1), norm(addV(dir, [0, -0.1, 0])), lt * 0.22, lt * 0.04, fw);
  }
  if (o.web) {
    const WEB = S.fixed('WEB', 10, 10);
    for (let i = 0; i + 1 < o.n; i++) sheet(S.B, WEB, S.gid(), [0.12, 0.45, 0.78].map((f) => [tp[i](f), tp[i + 1](f * (0.95 + 0.05 * i / o.n))]), () => fw);
    if (!S.paints.some((p) => (p as any).WEB)) {
      const p = () => WEB.fill(makeRamp(mixHex(S.d.colors.belly, S.d.colors.base, 0.55), 6, { spread: 0.5 }), (x, y) => 2.6 + (WEB.fbm(x, y, 3, 2, 5) - 0.5) * 1.2 + (x % 4 === 0 ? -0.8 : 0) - y / WEB.h * 0.6);
      (p as any).WEB = 1; S.paints.push(p);
    }
  }
}

// =============================================================================================== skin
/** wet amphibian skin over a painted region: faceted warts (dense on dull toads, sparse on glossy dart frogs), each lit
 *  on its upper-left facet with a dark sel-out on the shadow side, and wet glints as short dashes on the lit side */
export function amphSkin(S: Ctx, r: Region, dens = 1) {
  const c = S.d.colors.base, Rc = (c >> 16) & 255, Gc = (c >> 8) & 255, Bc = c & 255;
  // glossy warning-coloured frogs (worn with ink) carry few warts; dull toads many
  const pc = S.d.colors.pattern, dart = ((pc >> 16) & 255) + ((pc >> 8) & 255) + (pc & 255) < 120, warty = dart ? 0.25 : 1, seed = r.x * 7 + r.y;
  void Rc; void Gc; void Bc;
  const n = Math.round((r.w * r.h) / 120 * warty * dens);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(hash(i, seed + 71) * r.w), y = Math.floor(hash(i, seed + 73) * r.h); if (Math.abs(r.th(x)) > 2.2) continue;
    const rad = 1 + Math.floor(hash(i, seed + 75) * 2.2), sk = 1 + (hash(i, seed + 77) - 0.5) * 0.6, RR = rampFor(r.get(x, y));
    for (let dy = -rad - 1; dy <= rad + 1; dy++) for (let dx = -rad - 1; dx <= rad + 1; dx++) {
      const m = Math.abs(dx) * sk + Math.abs(dy);
      if (m <= rad) r.set(x + dx, y + dy, RR[dx + dy < 0 ? 5 : dx + dy === 0 ? 4 : 2]);
      else if (m <= rad + 1 && dx + dy > 0) r.set(x + dx, y + dy, RR[0]);
    }
    if (rad > 1) r.set(x - 1, y - 1, RR[6]);
  }
  for (let i = 0; i < (r.w * r.h) / 140; i++) {
    const x = Math.floor(hash(i, seed + 91) * r.w), y = Math.floor(hash(i, seed + 93) * r.h); if (Math.abs(r.th(x)) > 1.1) continue;
    r.set(x, y, RAMPS.bone[5]); r.set(x + 1, y, RAMPS.bone[4]);
  }
}

// =============================================================================================== tortoise
/** a domed scute shell with a marginal ledge and a flat plastron */
export function scuteShell(S: Ctx, chest: V3, hips: V3, W: number, H: number, T: number) {
  const d = S.d, iC = S.bi('chest'), iP = S.bi('hips');
  const ctrl: V3[] = [addV(hips, [0, H * 0.02, -T * 0.55]), addV(hips, [0, H * 0.3, -T * 0.22]), addV(lerpV(hips, chest, 0.5), [0, H * 0.42, 0]), addV(chest, [0, H * 0.32, T * 0.02]), addV(chest, [0, H * 0.06, T * 0.3])];
  const sp = spline(ctrl, 16), cts = chordTs(ctrl);
  const rx = [0.44, 0.7, 0.76, 0.7, 0.46].map((k) => k * W * 1.08), ry = [0.3, 0.64, 0.74, 0.62, 0.3].map((k) => k * H * 1.1);
  const SC = S.reg('SCUTE', TAU * W * 0.62, sp.L, 16, 150, 110);
  sac(S.B, SC, S.gid(), sp.pts, sp.t.map((t) => [interp(cts, rx, t), interp(cts, ry, t)] as [number, number]), chainWeights2(sp.pts, [ctrl[0], hips, chest, ctrl[4]], [iP, iP, iC]),
    { n: 24, cap: 0.12, bump: (a, t) => 0.07 * gauss(Math.abs(a), 1.95, 0.14) + 0.025 * Math.cos(a * 7) * gauss(Math.abs(a), 0.9, 0.6) * (0.5 + 0.5 * Math.cos(t * 28)), shift: (a, t) => Math.max(0, -Math.cos(a)) * interp(cts, ry, t) * 0.42 });
  S.paints.push(() => {
    const R = makeRamp(mixHex(d.colors.pattern, d.colors.base, 0.25), 7, { spread: 0.6, hueShift: 0.05 }), A = makeRamp(d.colors.accent, 6, { spread: 0.45 }), Bl = S.P.belly;
    const radiated = (d.colors.pattern >> 16 & 255) < 80 && (d.colors.pattern >> 8 & 255) < 70;
    const bands: [number, number, number, number][] = [[0, 0.42, 5, 0.1], [0.42, 1.3, 4, 0.4], [1.3, 2.1, 11, 0]];
    for (let y = 0; y < SC.h; y++) for (let x = 0; x < SC.w; x++) {
      const t = (y + 0.5) / SC.h, th = SC.th(x), ath = Math.abs(th);
      if (ath > 2.05) { SC.put(x, y, Bl, 2.6 + (y % 6 === 0 ? -1.2 : 0) + (hash(x, y) - 0.5) * 0.6, 0.5); continue; }
      const b = bands.find((q) => ath < q[1])!;
      const lu = b[0] === 0 ? (th + b[1]) / (2 * b[1]) : (ath - b[0]) / (b[1] - b[0]);
      const tv = t * b[2] + b[3], lv = tv - Math.floor(tv);
      const e = Math.min(lu, 1 - lu, lv, 1 - lv);
      let k = 2.6 + Math.cos(th) * 0.9 + (SC.fbm(x, y, 4, 2, 31) - 0.5) * 0.8;
      let RR = R;
      if (e < 0.07) { k = 0.3; }
      else {
        k += (Math.floor(e * 9) % 2 ? -0.45 : 0.2) + (e > 0.3 ? 0.8 : 0);
        if (radiated) { const ang = Math.atan2(lv - 0.5, lu - 0.5); if ((Math.abs(Math.sin(ang * 3)) < 0.22 && e < 0.32) || e > 0.36) { RR = A; k = 3.2 + Math.cos(th) * 0.5; } }
      }
      SC.put(x, y, RR, k, 0.5);
    }
  });
}
function chainWeights2(pts: V3[], joints: V3[], ids: number[]): Wt[] {
  // nearest joint segment, blended at the middle joint
  return pts.map((p) => { const dA = len(sub(p, joints[1])), dB = len(sub(p, joints[2])); const k = clamp(dA / (dA + dB), 0, 1); return [ids[1], 1 - k, ids[2], k]; });
}

// =============================================================================================== arthropods
/** a crab's broad toothed carapace with eyes on stalks at its rim */
export function crabShell(S: Ctx, th: V3, hd: V3, W: number, H: number, thL: number, lt: number) {
  const d = S.d, iT = S.bi('thorax'), iH = S.bi('head');
  const ctrl: V3[] = [addV(th, [0, -H * 0.02, -thL * 0.5]), addV(th, [0, H * 0.14, -thL * 0.3]), addV(th, [0, H * 0.22, 0]), addV(th, [0, H * 0.18, thL * 0.26]), addV(th, [0, H * 0.04, thL * 0.5])];
  const sp = spline(ctrl, 14), cts = chordTs(ctrl);
  const rx = [0.3, 0.56, 0.64, 0.6, 0.36].map((k) => k * W), ry = [0.18, 0.36, 0.42, 0.38, 0.18].map((k) => k * H);
  const CS = S.reg('CRAB', TAU * W * 0.5, thL * 1.2, 16, 150, 80);
  sac(S.B, CS, S.gid(), sp.pts, sp.t.map((t) => [interp(cts, rx, t), interp(cts, ry, t)] as [number, number]), sp.pts.map(() => [iT, 1]),
    { n: 22, bump: (a, t) => (t > 0.45 ? 0.13 * Math.max(0, Math.sin(t * 52)) * gauss(Math.abs(a), Math.PI / 2, 0.28) : 0) - 0.06 * gauss(a, 0, 0.07) * gauss(t, 0.5, 0.2) + 0.03 * gauss(Math.abs(a), 0.7, 0.2) * gauss(t, 0.55, 0.15),
      shift: (a, t) => Math.max(0, -Math.cos(a)) * interp(cts, ry, t) * 0.45 });
  S.paints.push(() => {
    hide(S, CS, { L: thL, rad: () => W * 0.4, seed: 83, cover: 'chitin', plates: 1, belly: 2.0 });
    // the H-shaped grooves of the carapace and a rim of darker teeth
    for (let y = 0; y < CS.h; y++) for (let x = 0; x < CS.w; x++) {
      const t = y / CS.h, ath = Math.abs(CS.th(x));
      if ((Math.abs(ath - 0.55) < 0.05 && t > 0.3 && t < 0.75) || (Math.abs(t - 0.55) < 0.015 && ath < 0.55)) CS.blend(x, y, 0x000000, 0.35);
      if (Math.abs(ath - Math.PI / 2) < 0.12 && t > 0.45) CS.blend(x, y, 0x000000, 0.25);
    }
  });
  const E = S.fixed('CEYE', 20, 14), ST = S.fixed('ANT', 6, 24);
  for (const s of [-1, 1]) {
    const s0 = addV(hd, [s * W * 0.12, H * 0.08, -thL * 0.02]), s1 = addV(s0, [s * W * 0.04, H * 0.42, thL * 0.04]);
    sac(S.B, ST, S.gid(), [s0, lerpV(s0, s1, 0.5), s1], [[lt * 0.7, lt * 0.7], [lt * 0.55, lt * 0.55], [lt * 0.6, lt * 0.6]], [[iH, 1], [iH, 1], [iH, 1]], { n: 6 });
    ball(S.B, E, S.gid(), addV(s1, [0, W * 0.03, 0]), norm([s * 0.5, 0.6, 0.6]), [W * 0.055, W * 0.055, W * 0.05], [iH, 1], { n: 10, rings: 6 });
  }
  if (!S.paints.some((p) => (p as any).CEYE)) {
    const p = () => { E.fill(makeRamp(mixHex(d.colors.eye, 0x101418, 0.6), 6, { spread: 0.6 }), (x, y) => 1.4 + (x % 3 === 1 && y % 3 === 1 ? 0.8 : x % 3 === 0 || y % 3 === 0 ? -0.5 : 0) + (y > E.h * 0.55 ? 1 : 0), undefined, 0.3); E.set(E.X(-30), E.h * 0.75, RAMPS.snow[5]); };
    (p as any).CEYE = 1; S.paints.push(p);
  }
}

/** a rhinoceros beetle's horns: one rising from the snout, one reaching forward from the thorax */
export function beetleHorns(S: Ctx, hd: V3, th: V3, H: number, hl: number, thL: number, W: number) {
  const d = S.d, iH = S.bi('head'), iT = S.bi('thorax'), BH = S.fixed('BHORN', 6, 20);
  const p0 = addV(hd, [0, H * 0.08, hl * 0.82]);
  const a = spline([p0, addV(p0, [0, H * 0.18, hl * 0.42]), addV(p0, [0, H * 0.5, hl * 0.72]), addV(p0, [0, H * 0.78, hl * 0.66])], 10);
  sac(S.B, BH, S.gid(), a.pts, a.t.map((t) => { const r = W * 0.12 * (1 - t * 0.8) + 0.002; return [r, r * 1.1] as [number, number]; }), a.pts.map(() => [iH, 1]), { n: 8 });
  const tip = a.pts[a.pts.length - 1];
  for (const s of [-1, 1]) { const e = addV(tip, [s * W * 0.06, H * 0.06, -hl * 0.08]); sac(S.B, BH, S.gid(), [tip, lerpV(tip, e, 0.5), e], [[W * 0.03, W * 0.03], [W * 0.02, W * 0.02], [0.002, 0.002]], [[iH, 1], [iH, 1], [iH, 1]], { n: 5 }); }
  const q0 = addV(th, [0, H * 0.38, thL * 0.05]);
  const b = spline([q0, addV(q0, [0, H * 0.55, thL * 0.3]), addV(q0, [0, H * 0.78, thL * 0.6 + hl * 0.3]), addV(q0, [0, H * 0.62, thL * 0.6 + hl * 0.72])], 10);
  sac(S.B, BH, S.gid(), b.pts, b.t.map((t) => { const r = W * 0.1 * (1 - t * 0.75) + 0.002; return [r * 1.2, r] as [number, number]; }), b.pts.map(() => [iT, 1]), { n: 8, bump: (aa, t) => 0.3 * gauss(aa, Math.PI, 0.4) * Math.max(0, Math.sin(t * 30)) * (t > 0.4 ? 1 : 0) });
  S.paints.push(() => keratin(BH, mixHex(d.colors.base, 0x0c0a0e, 0.55), { tipLight: 2.6 }));
}

/** a moth's broad scaled wings, folded tent-wise over the back at rest */
export function mothWings(S: Ctx, W: number, wl: number) {
  const d = S.d, rig = S.rig;
  const FW = S.reg('MWING', W * 1.3, wl, 16, 64, 64), HW = S.reg('HWING', W * 1.1, wl * 0.7, 12, 48, 48);
  for (const wi of rig.wings) {
    const wb = S.at(wi), s = Math.sign(rig.bones[wi].pos[0]) || 1, hind = rig.bones[wi].name.endsWith('1');
    // at rest the forewings fold back into a delta over the body (shoulder, outer tip, rear margin, inner corner)
    const lift = (s > 0 ? 0.002 : 0) + (hind ? -0.004 : 0.004);
    const A = addV(wb, [s * W * 0.02, lift, W * 0.05]);
    const Bc = hind ? addV(wb, [s * (W * 0.3 + wl * 0.36), lift, -wl * 0.58]) : addV(wb, [s * (W * 0.35 + wl * 0.5), lift, -wl * 0.82]);
    const Dc = hind ? addV(wb, [s * W * 0.04, lift, -wl * 0.66]) : addV(wb, [s * W * 0.03, lift, -wl * 0.92]);
    const Cc = addV(lerpV(Bc, Dc, 0.42), [0, 0, -wl * (hind ? 0.06 : 0.1)]);
    const grid: V3[][] = [];
    for (let i = 0; i <= 3; i++) {
      const row: V3[] = [];
      for (let j = 0; j <= 4; j++) { const u = j / 4, v = i / 3; const p = lerpV(lerpV(A, Bc, u), lerpV(Dc, Cc, u), v); row.push(addV(p, [0, (1 - u) * W * (hind ? 0.04 : 0.08) - Math.sin(Math.PI * v) * W * 0.02, 0])); }
      grid.push(row);
    }
    sheet(S.B, hind ? HW : FW, S.gid(), grid, () => [wi, 1]);
  }
  S.paints.push(() => { wingPaint(S, FW, true); wingPaint(S, HW, false); });
}
function wingPaint(S: Ctx, r: Region, fore: boolean) {
  const d = S.d, R = makeRamp(d.colors.base, 7, { spread: 0.55, hueShift: 0.05 }), Pp = S.P.pat, A = makeRamp(d.colors.accent, 6, { spread: 0.5 });
  const asp = r.h / r.w;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const u = x / r.w, v = y / r.h;
    let k = 3.1 + (r.fbm(x, y, 3, 2, fore ? 5 : 6) - 0.5) * 1.3 - v * 0.5 + ((x + (Math.floor(y / 2) & 1)) % 2) * 0.35;
    let RR = R;
    const band = (c: number) => Math.abs(u - c - Math.sin(v * 8 + c * 9) * 0.035) < 0.035;
    if (d.pattern === 'bands' || d.pattern === 'rings' || d.pattern === 'saddle') { if (band(0.32) || band(0.66)) { RR = Pp; k = 2.2; } }
    else if (d.pattern === 'stripes') { if (Math.abs(((v * 5 + u * 0.6) % 1) - 0.5) < 0.12) { RR = Pp; k = 2.4; } }
    else if (d.pattern === 'mottled' && r.fbm(x, y, 5, 2, 12) > 0.6) { RR = Pp; k = 2.6; }
    if (u > 0.9) { RR = Pp; k = (x + y) % 2 ? 1.4 : 3.2; }
    // eyespots
    const spots: [number, number, number][] = fore ? [[0.62, 0.45, 0.15]] : [[0.55, 0.5, 0.24]];
    if (d.pattern === 'spots') spots.push(fore ? [0.3, 0.3, 0.07] : [0.8, 0.3, 0.08]);
    for (const [cu, cv, rr] of spots) {
      const dd = oct(u - cu, (v - cv) * asp);
      if (dd < rr) { if (dd < rr * 0.35) { RR = Pp; k = 0.6; } else if (dd < rr * 0.7) { RR = A; k = 3.4 - dd / rr; } else { RR = Pp; k = 1.4; } }
      if (Math.abs(u - (cu - rr * 0.15)) < 0.02 && Math.abs((v - (cv - rr * 0.15)) * asp) < 0.02) { RR = A; k = 5; }
    }
    if (x % Math.max(4, Math.round(r.w / 5)) === 0 && u < 0.88) k -= 0.6; // veins
    r.put(x, y, RR, k, 0.5);
  }
}
/** feathery antennae: a frond card along each antenna */
export function plumes(S: Ctx, pts: V3[], w: Wt[], lt: number) {
  const PL = hairReg(S, 'PLUME', 8, 24, () => ({ ramp: makeRamp(mixHex(S.d.colors.base, 0x2a2018, 0.3), 6, { spread: 0.5 }), tip: makeRamp(mixHex(S.d.colors.base, 0xf0e8d0, 0.35), 6, { spread: 0.5 }), frond: true }));
  const fr = transport(pts, [0, 1, 0]);
  blade(S.B, PL, pts, pts.map((_, i) => lt * 2.6 * (1 - (i / pts.length) * 0.65)), fr.map((f) => f.u), w, { offset: -0.5, seed: 3 });
}

/** a throat wattle or dewlap hanging under the jaw and neck */
export function wattle(S: Ctx, T: SpineTs, H: number) {
  const d = S.d, sp = S.spine!, N = sp.pts.length - 1, fur = d.cover === 'fur' || has(d, 'fur');
  const t0 = T.head, t1 = T.neck + (T.chest - T.neck) * 0.3;
  const WT = S.reg('WATTLE', H * 0.6, (t1 - t0) * sp.L, 8, 32, 48);
  const pts: V3[] = [], wd: number[] = [], sides: V3[] = [], w: Wt[] = [];
  for (let k = Math.round(t0 * N); k <= Math.round(t1 * N); k++) {
    const u = (k / N - t0) / (t1 - t0), { p } = surf(S, k, Math.PI, 0.9);
    pts.push(p); sides.push(norm([0, -1, -0.15])); w.push(sp.w[k]);
    wd.push(H * (fur ? 0.32 : 0.42) * Math.pow(Math.max(0, Math.sin(Math.PI * clamp(u * 1.05, 0, 1))), fur ? 1.4 : 0.8) * (fur ? 1 + 0.6 * gauss(u, 0.3, 0.12) : 1) + 0.002);
  }
  blade(S.B, WT, pts, wd, sides, w, { offset: -0.03, seed: 29, edge: fur ? 0.5 : 0 });
  if (fur) S.paints.push(() => hide(S, WT, { L: H, rad: () => H * 0.3, seed: 89, kind: 'head', noPattern: true }));
  else S.paints.push(() => {
    const A = makeRamp(mixHex(d.colors.accent, 0xd84a3a, 0.25), 7, { spread: 0.55, hueShift: 0.05 });
    for (let y = 0; y < WT.h; y++) for (let x = 0; x < WT.w; x++) { const u = x / WT.w; WT.put(x, y, u < 0.15 ? S.P.belly : A, 2.4 + u * 1.4 + (WT.fbm(x, y, 3, 2, 3) - 0.5) * 1.2 - (u > 0.9 ? 1.4 : 0) + (y % 4 === 0 && u > 0.2 ? -0.7 : 0), 0.5); }
  });
}
