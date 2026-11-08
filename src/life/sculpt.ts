// Design + rig -> a sculpted, skinned, hand-painted creature (kit.ts). Bodies are one continuous loft from the back
// of the skull to the tail tip with shoulder blades, hip bones, ribs, a spine ridge and a sagging belly; limbs are
// lofted through their bones with muscle and knuckled joints; heads are modelled (brow, cheekbones, sockets,
// eyelids, muzzle, lips, nostrils, a jaw that opens on a throat), and every part paints its own region of the page:
// fur strands, overlapping scales, chitin plates with seams and gloss, wet skin with veins, patterns laid out in
// body space so stripes run round the flanks and spots sit on the back.
import * as THREE from 'three';
import { makeRamp, mixHex, scaleHex } from '../limbo/gfx/pixel';
import { clamp } from '../core/rand';
import type { Design } from './design';
import type { Rig } from './morph';
import { SkinB, Page, type Region, KIT, blade, sac, spline, chainWeights, ball, sheet, transport, hash, gauss, sub, addV, scl, norm, cross, len, lerpV, pageTexture, mixC, type V3, type Wt } from './kit';

const TAU = Math.PI * 2;
const has = (d: Design, g: string) => d.genes.includes(g);
/** jagged per-vertex radius noise, seamless around the loft (fur, bristles) */
const fuzz = (amp: number, n: number, rings: number, seed: number) => (a: number, t: number) => {
  const j = Math.round(((a + Math.PI) / TAU) * n) % n, i = Math.round(t * rings);
  return (hash(j * 7 + i * 131, seed) - 0.5) * amp + (hash(j + 3, i * 17 + seed) < 0.12 ? amp * 0.7 : 0);
};
const sm = (t: number) => t * t * (3 - 2 * t);
/** interpolate per-control values at t given control t's (smoothstep between neighbours) */
function interp(ts: number[], vs: number[], t: number) {
  if (t <= ts[0]) return vs[0];
  for (let i = 0; i + 1 < ts.length; i++) if (t <= ts[i + 1]) { const f = (t - ts[i]) / Math.max(1e-6, ts[i + 1] - ts[i]); return vs[i] + (vs[i + 1] - vs[i]) * sm(f); }
  return vs[vs.length - 1];
}
function chordTs(c: V3[]) { const cum = [0]; for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + len(sub(c[i], c[i - 1]))); const L = cum[cum.length - 1] || 1; return cum.map((v) => v / L); }

interface Paint { (): void }
class Ctx {
  B: SkinB; page: Page; g = 1; paints: Paint[] = [];
  /** spine samples for surface queries (quills, photophores) */
  spine: { pts: V3[]; fr: { d: V3; u: V3; v: V3 }[]; ru: number[]; rv: number[]; w: Wt[] } | null = null;
  readonly P: { base: number[]; belly: number[]; pat: number[]; acc: number[]; dark: number[]; skin: number[] };
  constructor(readonly d: Design, readonly rig: Rig, readonly rest: V3[], readonly den: number) {
    this.page = new Page(512, 512); this.B = new SkinB(512, 512);
    const c = d.colors, apo = has(d, 'aposematic');
    const R = (x: number, s = 0.55) => makeRamp(x, 7, { spread: s, hueShift: 0.05 });
    this.P = { base: R(c.base), belly: R(c.belly, 0.45), pat: R(apo ? c.accent : c.pattern, 0.5), acc: R(c.accent, 0.5), dark: R(mixHex(c.base, 0x120c10, 0.6), 0.4), skin: R(mixHex(c.belly, 0xc87a7a, 0.45), 0.45) };
  }
  bi(n: string) { const i = this.rig.bones.findIndex((b) => b.name === n); if (i < 0) throw new Error('no bone ' + n); return i; }
  at(n: string | number): V3 { return this.rest[typeof n === 'number' ? n : this.bi(n)]; }
  /** a page region sized in metres (shared if it already exists) */
  reg(name: string, wm: number, hm: number, min = 6, maxW = 160, maxH = 200): Region {
    const r = this.page.regs.get(name); if (r) return r;
    return this.page.reg(name, clamp(Math.round(wm * this.den), min * 2, maxW * 2), clamp(Math.round(hm * this.den), min * 2, maxH * 2));
  }
  fixed(name: string, w: number, h: number) { return this.page.regs.get(name) ?? this.page.reg(name, w * 2, h * 2); }
  gid() { return this.g++; }
}

// =============================================================================================== painting
function patternAt(d: Design, r: Region, x: number, y: number, sn: number, cn: number, th: number, seed: number): number {
  const ps = d.patScale || 1, ath = Math.abs(th);
  const n = r.fbm(x, y, 4, 2, seed);
  switch (d.pattern) {
    case 'stripes': return ath < 2.3 - n * 0.6 && Math.sin((sn * 7.5) / ps + n * 3.2 + ath * 0.7) > 0.42 + ath * 0.1 ? 1 : 0;
    case 'spots': {
      if (ath > 2.25 - n * 0.4) return 0;
      const cs = 0.42 * ps, ci = Math.floor(sn / cs), cj = Math.floor(cn / cs);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const I = ci + a, J = cj + b;
        if (hash(I * 7 + 1, J * 13 + seed) < 0.3) continue;
        const px = (I + 0.2 + hash(I, J + seed) * 0.6) * cs, py = (J + 0.2 + hash(J, I + seed + 3) * 0.6) * cs;
        const rr = cs * (0.2 + hash(I + 5, J) * 0.16);
        const dd = Math.hypot(sn - px, cn - py) + (n - 0.5) * cs * 0.25;
        if (dd < rr) return rr > cs * 0.3 && dd < rr * 0.45 ? 0 : 1; // big spots open into rosettes
      }
      return 0;
    }
    case 'bands': return ((sn / (1.1 * ps) + n * 0.45) % 1) < 0.36 ? 1 : 0;
    case 'mottled': return n > 0.56 - (ath > 2 ? -0.2 : 0) ? 1 : 0;
    case 'saddle': return ath < 1.25 + (n - 0.5) * 0.8 && Math.abs(sn % 6 - 2.6) < 1.4 + (n - 0.5) ? 1 : 0;
    case 'rings': return ((sn / (0.6 * ps)) % 1) < 0.15 ? 1 : 0;
    default: return 0;
  }
}
/** cover texture as a ramp offset */
function coverK(cover: string, r: Region, x: number, y: number, th: number, t: number, seed: number, plates = 6) {
  switch (cover) {
    case 'fur': {
      const col = Math.floor(x / 2), strand = ((y + Math.floor(hash(col, seed) * 6)) % 5) / 5;
      return strand * 1.0 - 0.5 + (hash(x, y + seed) - 0.5) * 0.5 + (r.fbm(x, y, 5, 2, seed + 9) - 0.5) * 0.9;
    }
    case 'scales': {
      const q = 3, row = Math.floor(y / q), lx = (((x + (row & 1) * 1.5) % q) + q) % q / q - 0.5, ly = (y % q) / q;
      const scal = ly - (0.5 - Math.sqrt(Math.max(0, 0.25 - lx * lx))) * 0.6;
      return 0.75 - scal * 1.9 + (hash(Math.floor((x + (row & 1) * 1.5) / q), row + seed) - 0.5) * 0.6;
    }
    case 'chitin': {
      const pv = t * plates, seam = Math.abs(pv - Math.round(pv)) < 0.05 ? -2.4 : 0;
      return seam + (0.5 - (pv - Math.floor(pv))) * 1.1 + Math.pow(Math.max(0, Math.cos(th - 0.5)), 8) * 2.4 + (hash(x * 3, y * 7 + seed) < 0.04 ? -1 : 0);
    }
    case 'slime': return (hash(x >> 1, (y >> 1) + seed) > 0.95 ? 2.2 : 0) + (r.fbm(x, y, 4, 3, seed) - 0.5) * 1.4 + Math.pow(Math.max(0, Math.cos(th - 0.4)), 10) * 1.8;
    default: return Math.sin(y * 1.9 + r.fbm(x, y, 3, 2, seed) * 7) * 0.22 + (hash(x, y + seed) < 0.03 ? -0.8 : 0) + (r.fbm(x, y, 5, 3, seed + 2) - 0.5) * 1.3;
  }
}
interface HideOpt { L: number; rad: (t: number) => number; belly?: number; seed: number; kind?: 'body' | 'limb' | 'head' | 'jaw' | 'foot'; plates?: number; cover?: string; noPattern?: boolean; bellyAll?: boolean }
function hide(S: Ctx, r: Region, o: HideOpt) {
  const d = S.d, P = S.P, Wn = Math.max(0.05, S.rig.width), cover = o.cover ?? d.cover, seed = o.seed;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const t = (y + 0.5) / r.h, th = r.th(x), ath = Math.abs(th);
    const sn = (t * o.L) / Wn, cn = (th * o.rad(t)) / Wn;
    const edge = (o.belly ?? 2.05) + (r.fbm(x, y, 5, 2, seed) - 0.5) * 0.8 + (hash(x, y) - 0.5) * 0.12;
    const bel = o.bellyAll || ath > edge;
    let k = 3.1 + Math.cos(th) * 0.65;
    k += coverK(cover, r, x, y, th, t, seed, o.plates);
    if (o.kind === 'limb' && cover === 'fur') k -= sm(clamp((t - 0.6) / 0.4, 0, 1)) * 1.1; // darker socks
    if (o.kind === 'foot') k -= 0.5;
    if (cover === 'scales' && bel && o.kind !== 'limb') k += y % 3 === 0 ? -1.3 : 0.3; // ventral scutes
    let pv = !o.noPattern && !bel ? patternAt(d, r, x, y, sn, cn, th, seed + 17) : 0;
    if (has(d, 'cryptic') && !bel && r.fbm(x, y, 6, 2, seed + 40) > 0.62) pv = 1;
    const RR = pv ? P.pat : bel ? P.belly : P.base;
    r.put(x, y, RR, k, 0.55);
    if (has(d, 'chloro_skin') && !bel && r.fbm(x, y, 7, 2, seed + 5) > 0.6) r.blend(x, y, 0x3a8a3a, 0.35);
  }
  // fur partings and lit tips, wet glints, veins
  if (cover === 'fur') for (let i = 0; i < Math.max(4, r.w * r.h / 300); i++) r.crack(hash(i, seed) * r.w, hash(i + 9, seed) * r.h, 4 + Math.floor(hash(i + 3, seed) * 8), 80 + hash(i + 5, seed) * 30, P.dark[1], seed * 7 + i, 0.5, 0.1);
  if (cover === 'skin' || cover === 'slime') for (let i = 0; i < Math.max(3, r.w * r.h / 500); i++) r.crack(hash(i, seed + 2) * r.w, hash(i + 4, seed) * r.h, 6 + Math.floor(hash(i + 6, seed) * 12), hash(i + 1, seed) * 360, P.skin[2], seed * 3 + i, 0.3, 0.2);
  if (cover === 'slime' || has(d, 'mucus')) for (let i = 0; i < r.w * r.h / 90; i++) { const gx = hash(i, seed + 40) * r.w, gy = hash(i + 2, seed + 40) * r.h; if (Math.abs(r.th(gx)) < 1.6) { r.blend(gx, gy, 0xffffff, 0.7); r.blend(gx + 1, gy, 0xffffff, 0.3); } }
  // photophores along the lateral line
  if (has(d, 'biolum') && o.kind === 'body') for (let i = 0; i < 14; i++) {
    const gx = r.X(i % 2 ? 100 : -100), gy = ((i >> 1) + 0.5) / 7 * r.h * 0.8;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { r.set(gx + dx, gy + dy, mixHex(d.colors.accent, 0xffffff, 0.3)); r.alpha(gx + dx, gy + dy, 190); }
  }
}
function keratin(r: Region, base: number, o: { rings?: boolean; tipLight?: number } = {}) {
  const R = makeRamp(base, 6, { spread: 0.5 });
  r.fill(R, (x, y) => 1.4 + (y / r.h) * (o.tipLight ?? 1.8) + Math.cos(r.th(x)) * 0.8 + (o.rings && y % 3 === 0 ? -0.9 : 0) + (hash(x, y) - 0.5) * 0.5);
}
function glowReg(r: Region, c: number) {
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { r.set(x, y, mixC(c, 0xffffff, 0.25 + Math.cos(r.th(x)) * 0.15)); r.alpha(x, y, 190); }
}

// =============================================================================================== fur cards
/** the fur region: strands of pixel-art hair on a transparent card (alpha-cut) */
function furReg(S: Ctx): Region {
  const have = S.page.regs.get('FUR'); if (have) return have;
  const r = S.fixed('FUR', 24, 20); r.cut = true;
  S.paints.push(() => {
    const d = S.d, R = S.P.base, P2 = S.P.pat, B2 = S.P.belly;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) r.set(x, y, R[2], 0);
    for (let c = 0; c < r.w; c++) {
      if (hash(c, 3) < 0.12) continue;
      const L = Math.floor(r.h * (0.55 + hash(c, 5) * 0.45)), ph = hash(c, 7) * 6, ramp = d.pattern === 'stripes' && Math.floor(c / 5) % 2 ? P2 : hash(c, 9) < 0.15 ? B2 : R;
      for (let y = 0; y < L; y++) {
        const x = c + Math.round(Math.sin(y * 0.18 + ph) * 1.2 * (y / L));
        const f = y / L;
        r.set(x, y, ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(1.2 + f * 2.4 + (hash(c, y) - 0.5) * 1.2 + (c % 3 === 0 ? 0.6 : 0))))], 255);
      }
    }
  });
  return r;
}
/** one card: base on the skin, leaning along `dir`, `side` spans its width */
function furCard(S: Ctx, base: V3, dir: V3, side: V3, L: number, W2: number, w: Wt, seed: number) {
  const r = furReg(S), l = L * (0.8 + hash(seed, 1) * 0.4);
  const pts: V3[] = [base, addV(base, scl(dir, l * 0.5)), addV(addV(base, scl(dir, l)), [0, -l * 0.12, 0])];
  blade(S.B, r, pts, [W2, W2 * 0.95, W2 * 0.6], side, [w, w, w], { offset: -0.5, edge: 0.25, seed });
}
/** a row of cards along the spine between t0..t1 at the given angles (0 = top); `hang` drapes them downward */
function furCards(S: Ctx, t0: number, t1: number, step: number, angles: number[], L: number, W2: number, hang = false) {
  const sp = S.spine!, N = sp.pts.length - 1;
  for (let k = Math.max(0, Math.round(t0 * N)); k <= Math.min(N, Math.round(t1 * N)); k += step) for (const a0 of angles) {
    const a = a0 + (hash(k, a0 * 10) - 0.5) * 0.3, f = sp.fr[k];
    const nrm = norm(addV(scl(f.v, Math.cos(a)), scl(f.u, Math.sin(a))));
    const base = addV(sp.pts[k], addV(scl(f.v, Math.cos(a) * sp.rv[k] * 0.9), scl(f.u, Math.sin(a) * sp.ru[k] * 0.9)));
    const dir = hang ? norm(addV(scl(nrm, 0.4), [0, -1, 0])) : norm(addV(scl(nrm, 0.7), scl(f.d, 0.9)));
    furCard(S, base, dir, norm(cross(dir, nrm)), L, W2, sp.w[k], k * 31 + Math.round(a0 * 7));
  }
}

// =============================================================================================== vertebrates
function vertebrate(S: Ctx) {
  const d = S.d, rig = S.rig, D = rig.dims;
  const hom = d.plan === 'hominid', biped = d.plan === 'biped' || hom;
  const { W, H, T, lt, hl, hw, hh, nk } = D;
  const sl = hom ? D.sl * 0.35 : D.sl;
  const fur = d.cover === 'fur' || has(d, 'fur');
  const head = S.at('head'), neck = S.at('neck'), chest = S.at('chest'), hips = S.at('hips');
  const tails = rig.tail.map((i) => S.rest[i]);
  const iH = S.bi('head'), iN = S.bi('neck'), iC = S.bi('chest'), iP = S.bi('hips');
  // ------------------------------------------------ spine: back of the skull to the tail tip
  const ctrl: V3[] = [], ru: number[] = [], rv: number[] = [], cs: number[] = [], ids: number[] = [];
  // width, height above and below the spine line
  const push = (p: V3, a: number, top: number, bot: number, id: number) => { ctrl.push(p); ru.push(a); rv.push((top + bot) / 2); cs.push((top - bot) / 2); ids.push(id); };
  const nr = Math.min(nk * 0.42, hw * 0.4);
  push(addV(head, [0, 0, hl * 0.04]), hw * 0.28, hh * 0.28, hh * 0.28, iH);
  push(head, hw * 0.3, hh * 0.32, hh * 0.3, iN);
  push(lerpV(head, neck, 0.5), nr * 0.95, nr * 1.05, nr * 1.15, iN);
  push(neck, nr * 1.15, nr * 1.15, nr * 1.5, iC);
  const fat = has(d, 'fat_stores') ? 1.12 : 1, tuck = has(d, 'leg_cursorial') ? 0.82 : 1;
  if (hom) {
    push(addV(chest, [0, H * 0.18, 0]), W * 0.5, W * 0.26, W * 0.32, iC);
    push(chest, W * 0.5, W * 0.3, W * 0.36, iC);
    push(lerpV(chest, hips, 0.55), W * 0.38, W * 0.26, W * 0.3 * fat, iP);
    push(hips, W * 0.44, W * 0.34, W * 0.3, iP);
    push(addV(hips, [0, -H * 0.28, -T * 0.04]), W * 0.3, W * 0.24, W * 0.22, iP);
  } else {
    push(chest, W * 0.46, H * 0.46, H * 0.64, iC);
    push(lerpV(chest, hips, 0.5), W * 0.49 * fat, H * 0.44, H * 0.52 * fat * tuck, iP);
    push(hips, W * 0.45, H * 0.46, H * 0.42 * tuck, iP);
    if (!tails.length) push(addV(hips, [0, H * 0.03, -T * 0.26]), W * 0.36, H * 0.36, H * 0.36, iP);
    let tw = W * 0.3;
    tails.forEach((p, i) => { push(p, tw, tw * (i ? 0.95 : 1.2), tw * (i ? 0.95 : 1.05), rig.tail[i]); tw *= i ? 0.72 : 0.62; });
    if (tails.length > 1) {
      const a = tails[tails.length - 2], b = tails[tails.length - 1];
      const te = tw * (fur ? 1.4 : 0.35);
      push(addV(b, sub(b, a)), te, te, te, rig.tail[tails.length - 1]);
    }
  }
  const cts = chordTs(ctrl);
  const tAt = (i: number) => cts[Math.max(0, Math.min(cts.length - 1, i))];
  const tNeck = tAt(3), tChest = tAt(4), tMid = tAt(5), tHips = tAt(6), tRump = tAt(7);
  const sp = spline(ctrl, clamp(Math.round(ctrl.reduce((s, p, i) => s + (i ? len(sub(p, ctrl[i - 1])) : 0), 0) / (W * 0.085)), 28, 64));
  const RU = sp.t.map((t) => interp(cts, ru, t) * (fur && !hom && t > tRump + 0.02 ? 1 + 0.5 * sm(clamp((t - 0.88) / 0.12, 0, 1)) : 1));
  const RV = sp.t.map((t) => interp(cts, rv, t));
  const segIds = ids.slice(0, -1);
  const wts = chainWeights(sp.pts, ctrl, segIds, W * 0.32);
  const ribs = (d.girth < 0.45 || d.cover === 'skin') && !fur;
  const furF = fuzz(0.05, 20, sp.pts.length, d.seed % 97);
  const bump = (a: number, t: number) => {
    const aa = Math.abs(a);
    let b = 0.09 * gauss(t, tChest - 0.02, 0.05) * gauss(aa, 0.62, 0.3) + 0.075 * gauss(t, tHips, 0.05) * gauss(aa, 0.78, 0.28);
    if (!hom && t > tNeck && t < tRump) b += 0.035 * gauss(a, 0, 0.1) * (0.6 + 0.4 * Math.sin(t * 160));
    if (ribs && t > tChest && t < tMid + 0.04) b += 0.035 * Math.max(0, Math.sin(t * 150)) * gauss(aa, 1.75, 0.45);
    if (d.cover === 'scales' && !hom && t > tNeck && t < 0.97) b += 0.09 * gauss(a, 0, 0.07) * (Math.sin(t * 120) > 0.2 ? 1 : 0.2); // dorsal scutes
    if (fur) b += furF(a, t) * (1 + 3 * gauss(t, (tNeck + tChest) / 2, 0.08) * gauss(a, 0, 0.5));
    if (!hom) b += 0.1 * gauss(t, tChest + 0.01, 0.05) * gauss(aa, Math.PI, 0.7); // brisket
    return b;
  };
  const CS = sp.t.map((t) => interp(cts, cs, t));
  const shift = (_a: number, t: number) => CS[Math.round(t * (CS.length - 1))];
  const up: V3 = hom ? [0, 0, -1] : [0, 1, 0];
  const Lp = sp.L;
  const BODY = S.reg('BODY', TAU * W * 0.5, Lp, 16, 160, 220);
  sac(S.B, BODY, S.gid(), sp.pts, sp.pts.map((_, i) => [RU[i], RV[i]] as [number, number]), wts, { n: fur ? 20 : 18, up, bump, shift, start: true, end: true });
  S.spine = { pts: sp.pts, fr: transport(sp.pts, up), ru: RU, rv: RV, w: wts };
  S.paints.push(() => hide(S, BODY, { L: Lp, rad: (t) => interp(sp.t, RU, t), seed: d.seed % 211, kind: 'body', belly: hom ? 1.6 : 2.05 }));

  // ------------------------------------------------ head
  vertHead(S, { head, hl, hw, hh, sl, hom, fur });
  if (fur) {
    // 2D pixel-art fur: a mane on the neck and shoulders, tufts down the back, a shaggy fringe, a tail brush, cheek ruffs
    const N = sp.pts.length - 1;
    furCards(S, tNeck - 0.06, tChest + 0.04, 1, [-0.85, -0.42, 0, 0.42, 0.85], W * 0.3, W * 0.2);
    furCards(S, tChest, tRump, 1, [-1.1, -0.55, 0, 0.55, 1.1], W * 0.17, W * 0.18);
    if (!hom) furCards(S, tChest - 0.02, tHips, 1, [-2.45, -2.1, 2.1, 2.45], W * 0.18, W * 0.17, true);
    if (tails.length) furCards(S, 0.84, 0.99, 1, [0, 1.2, -1.2, 2.4, -2.4, Math.PI], W * 0.22, W * 0.17);
    for (const s of [-1, 1]) {
      const hb = addV(head, [s * hw * 0.42, -hh * 0.12, hl * 0.06]), dir = norm([s * 0.9, -0.25, -0.6]);
      for (let k = 0; k < 3; k++) furCard(S, addV(hb, [0, (k - 1) * hh * 0.12, -k * hl * 0.05]), dir, norm([0, 1, 0.2]), hw * 0.32, hw * 0.16, [S.bi('head'), 1], 400 + k + s * 9);
    }
    void N;
  }
  // ------------------------------------------------ legs, arms, wings, armour
  for (const lg of rig.legs) vertLeg(S, lg, lt, fur);
  if (biped) for (const ai of rig.mandibles) arm(S, ai, lt, hom, fur);
  for (const wi of rig.wings) patagium(S, wi, fur);
  if (has(d, 'osteoderms')) carapace(S, chest, hips, W, H, T);
  if (has(d, 'quills')) quills(S, lt, H, tNeck, tRump);
  if (has(d, 'tail_club') && tails.length) {
    const tip = ctrl[ctrl.length - 1], CL = S.reg('PLATE', TAU * W * 0.3, W * 0.6, 8, 64, 48);
    ball(S.B, CL, S.gid(), tip, [0, 0, -1], [W * 0.3, W * 0.24, W * 0.3], [rig.tail[rig.tail.length - 1], 1], { n: 14, rings: 8, bump: (a, t) => 0.3 * Math.max(0, Math.cos(a * 3)) * Math.sin(t * Math.PI) ** 2 });
    S.paints.push(() => plates(S, CL, 7));
  }
}

function vertHead(S: Ctx, o: { head: V3; hl: number; hw: number; hh: number; sl: number; hom: boolean; fur: boolean }) {
  const d = S.d, { head, hl, hw, hh, sl, hom, fur } = o;
  const iH = S.bi('head'), iN = S.bi('neck');
  const beak = has(d, 'beak');
  const hk = hom ? 1.18 : 1;
  const z0 = hl * 0.38;
  const hz = [-hl * 0.24, -hl * 0.06, hl * 0.14, hl * 0.3, hl * 0.44, z0 + sl * 0.45, z0 + sl * 0.8, z0 + sl * (beak ? 1.15 : 1.0)];
  const hy = [hh * 0.04, hh * 0.14, hh * 0.18, hh * 0.13, hh * 0.04, -hh * 0.02, -hh * (beak ? 0.06 : 0.04), -hh * (beak ? 0.2 : 0.05)];
  const rx = [0.32, 0.48, 0.53, 0.47, 0.38, 0.31, 0.25, beak ? 0.05 : 0.17].map((k) => k * hw * hk);
  const ry = [0.34, 0.48, 0.52, 0.45, 0.36, 0.29, 0.24, beak ? 0.04 : 0.17].map((k) => k * hh * hk);
  const ctrl = hz.map((z, i) => addV(head, [0, hy[i], z]));
  const cts = chordTs(ctrl);
  const sp = spline(ctrl, 16);
  const tEye = interp([hz[0], hz[hz.length - 1]], [0, 1], hl * 0.25), tSn = cts[5];
  const fore = has(d, 'eye_binocular') || hom || has(d, 'hominid_eyes');
  const eAng = fore ? 0.62 : 1.45;
  const furF = fuzz(0.1, 18, 16, d.seed % 53);
  const bump = (a: number, t: number) => {
    const aa = Math.abs(a);
    let b = 0.13 * gauss(t, tEye - 0.05, 0.06) * gauss(aa, eAng - 0.45, 0.32) // brow ridge
      + 0.12 * gauss(t, tEye + 0.07, 0.08) * gauss(aa, 1.85, 0.35) // cheekbones
      - 0.09 * gauss(t, tEye, 0.05) * gauss(aa, eAng, 0.22) // sockets
      - 0.07 * gauss(aa, Math.PI, 0.6) * sm(clamp((t - tSn + 0.1) / 0.2, 0, 1)); // flat palate
    if (!beak) b += 0.06 * gauss(t, 0.93, 0.05) * gauss(aa, 0.45, 0.25); // nostril wings
    if (fur && t < tSn) b += furF(a, t) * 0.8;
    return b;
  };
  const HEAD = S.reg('HEAD', TAU * hw * 0.5 * hk, len(sub(ctrl[ctrl.length - 1], ctrl[0])), 16, 96, 64);
  const w = (i: number): Wt => (i < 2 ? [iH, 0.75, iN, 0.25] : [iH, 1]);
  sac(S.B, HEAD, S.gid(), sp.pts, sp.t.map((t) => [interp(cts, rx, t), interp(cts, ry, t)] as [number, number]), w, { n: 18, bump, end: true, start: true });
  const Lh = sp.L;
  // eyes, lids
  const er = Math.max(0.02, hw * (fore ? 0.15 : 0.16)) * (hom ? 1.25 : 1);
  const EYE = S.fixed('EYE', 12, 12), LID = S.reg('LID', TAU * er * 1.1, er * 0.8, 6, 24, 8);
  for (const s of [-1, 1]) {
    const off: V3 = fore ? [s * hw * 0.26 * hk, hh * 0.22, hl * 0.38] : [s * hw * 0.48, hh * 0.22, hl * 0.25];
    const ax = norm(fore ? [s * 0.38, 0.12, 1] : [s, 0.12, 0.38]);
    const c = addV(addV(head, off), scl(ax, -er * 0.35));
    ball(S.B, EYE, S.gid(), c, ax, [er, er * 0.92, er * 0.8], [iH, 1], { n: 12, rings: 7 });
    sac(S.B, LID, S.gid(), [addV(c, scl(ax, er * 0.05)), addV(c, scl(ax, er * 0.42)), addV(c, scl(ax, er * 0.62))], [[er * 1.22, er * 1.16], [er * 1.12, er * 1.04], [er * 0.98, er * 0.86]], [[iH, 1], [iH, 1], [iH, 1]],
      { n: 14, start: false, end: false, up: [0, 1, 0], shift: (a, t) => (t > 0.5 ? -er * 0.12 * Math.max(0, Math.cos(a)) : 0) });
  }
  S.paints.push(() => paintEyeReg(S, EYE));
  S.paints.push(() => { hide(S, LID, { L: er, rad: () => er, seed: 61, kind: 'head', noPattern: true }); for (let x = 0; x < LID.w; x++) LID.set(x, LID.h - 1, S.P.dark[0]); });
  // face paint: muzzle, lip line, nostrils, socket shading, a pale chin
  S.paints.push(() => {
    hide(S, HEAD, { L: Lh, rad: (t) => interp(cts, rx, t), seed: (d.seed % 131) + 7, kind: 'head', belly: 2.1 });
    for (let y = 0; y < HEAD.h; y++) for (let x = 0; x < HEAD.w; x++) {
      const t = (y + 0.5) / HEAD.h, th = HEAD.th(x), ath = Math.abs(th);
      if (t > tSn - 0.1 && ath > 1.6 - (t - tSn) * 1.5 + (hash(x, 3) - 0.5) * 0.2 && !beak) HEAD.put(x, y, S.P.belly, 3.4 + Math.cos(th) * 0.5 + (hash(x, y) - 0.5) * 0.8, 0.5);
      if (t > tSn - 0.04 && Math.abs(ath - 2.25) < 0.14 && !beak) HEAD.set(x, y, S.P.dark[0]); // lip line
      const sock = gauss(t, tEye, 0.06) * gauss(ath, eAng, 0.32);
      if (sock > 0.45) HEAD.put(x, y, S.P.dark, 2.2 + Math.cos(th) * 0.4, 0.5);
    }
    if (!beak) for (const s of [-1, 1]) { const nx = HEAD.X(s * 26), ny = HEAD.h * 0.95; HEAD.set(nx, ny, 0x0a0608); HEAD.set(nx + s, ny, 0x1a1012); }
  });
  // jaw, throat, teeth
  if (S.rig.jaw >= 0) {
    const iJ = S.rig.jaw, J = S.at(iJ);
    const jctrl: V3[] = [addV(J, [0, hh * 0.04, -hl * 0.14]), addV(J, [0, -hh * 0.03, sl * 0.2]), addV(J, [0, -hh * 0.03, sl * 0.6]), addV(J, [0, -hh * 0.01, sl * (beak ? 1.0 : 0.94)])];
    const jr: [number, number][] = [[hw * 0.32 * hk, hh * 0.16], [hw * 0.29 * hk, hh * 0.15], [hw * 0.23 * hk, hh * 0.12], [hw * (beak ? 0.06 : 0.14), hh * (beak ? 0.03 : 0.08)]];
    const jsp = spline(jctrl, 9);
    const jts = chordTs(jctrl);
    const JAW = beak ? S.reg('BEAK', TAU * hw * 0.3, sl * 1.2, 8, 48, 32) : S.reg('JAW', TAU * hw * 0.3, sl * 1.2, 8, 64, 40);
    sac(S.B, JAW, S.gid(), jsp.pts, jsp.t.map((t) => [interp(jts, jr.map((r) => r[0]), t), interp(jts, jr.map((r) => r[1]), t)] as [number, number]), jsp.pts.map(() => [iJ, 1]), { n: 14, bump: (a, t) => 0.12 * gauss(t, 0.85, 0.1) * gauss(Math.abs(a), Math.PI, 0.7) });
    const MOUTH = S.fixed('MOUTH', 12, 12);
    sac(S.B, MOUTH, S.gid(), [addV(J, [0, hh * 0.13, -hl * 0.08]), addV(J, [0, hh * 0.1, sl * 0.45]), addV(J, [0, hh * 0.08, sl * 0.8])], [[hw * 0.27, hh * 0.13], [hw * 0.22, hh * 0.11], [hw * 0.13, hh * 0.06]], [[iH, 0.5, iJ, 0.5], [iH, 0.5, iJ, 0.5], [iH, 0.5, iJ, 0.5]], { n: 10 });
    S.paints.push(() => { const R = makeRamp(0x8a3446, 5, { spread: 0.5 }); MOUTH.fill(R, (x, y) => 1.4 + Math.cos(MOUTH.th(x)) * 0.8 + (hash(x, y) - 0.5) + (y > MOUTH.h * 0.6 ? -0.6 : 0)); });
    if (beak) S.paints.push(() => keratin(JAW, mixHex(d.colors.accent, 0xd8b050, 0.5), { tipLight: 1.5 }));
    else S.paints.push(() => hide(S, JAW, { L: sl, rad: () => hw * 0.25, seed: 23, kind: 'jaw', belly: 1.25 }));
    const TEETH = S.fixed('TEETH', 6, 8);
    let teeth = false;
    const fang = (base: V3, dir: V3, L: number, r: number, id: Wt) => {
      const tip = addV(base, scl(dir, L)), m = addV(lerpV(base, tip, 0.5), [0, 0, L * 0.12]);
      sac(S.B, TEETH, S.gid(), [base, m, tip], [[r, r * 0.9], [r * 0.7, r * 0.62], [r * 0.08, r * 0.08]], [id, id, id], { n: 6 }); teeth = true;
    };
    if (has(d, 'carnassials') || has(d, 'omni_teeth') || has(d, 'venom_fangs')) {
      const big = has(d, 'carnassials') ? 1 : 0.55;
      for (const s of [-1, 1]) {
        fang(addV(head, [s * hw * 0.17 * hk, -hh * 0.27, z0 + sl * 0.78]), norm([0, -1, 0.1]), hh * 0.32 * big, hw * 0.035, [iH, 1]);
        fang(addV(J, [s * hw * 0.13, hh * 0.08, sl * 0.72]), norm([0, 1, 0.15]), hh * 0.18 * big, hw * 0.028, [iJ, 1]);
      }
      for (let i = 0; i < 4; i++) { const x = (i - 1.5) * hw * 0.06; fang(addV(head, [x, -hh * 0.27, z0 + sl * 0.9]), [0, -1, 0], hh * 0.09, hw * 0.02, [iH, 1]); }
    }
    if (has(d, 'tusks')) for (const s of [-1, 1]) {
      const b0 = addV(head, [s * hw * 0.22, -hh * 0.28, z0 + sl * 0.55]);
      const tctrl: V3[] = [b0, addV(b0, [s * hw * 0.08, -hh * 0.3, sl * 0.3]), addV(b0, [s * hw * 0.22, -hh * 0.2, sl * 0.72]), addV(b0, [s * hw * 0.32, hh * 0.25, sl * 0.98])];
      const ts = spline(tctrl, 9);
      const TUSK = S.reg('TUSK', TAU * hw * 0.06, ts.L, 6, 16, 40);
      sac(S.B, TUSK, S.gid(), ts.pts, ts.t.map((t) => [hw * 0.07 * (1 - t * 0.85) + 0.002, hw * 0.07 * (1 - t * 0.85) + 0.002] as [number, number]), ts.pts.map(() => [iH, 1]), { n: 8 });
      S.paints.push(() => keratin(TUSK, 0xe8dcc0, { rings: true, tipLight: 1 }));
    }
    if (teeth) S.paints.push(() => keratin(TEETH, 0xf0e6cc, { tipLight: 1.2 }));
  }
  // nose leather or beak
  if (!beak) {
    const NOSE = S.fixed('NOSE', 10, 8);
    ball(S.B, NOSE, S.gid(), addV(head, [0, hh * 0.03, z0 + sl * 0.97]), norm([0, 0.25, 1]), [hw * 0.14 * hk, hh * 0.1, hw * 0.07], [iH, 1], { n: 10, rings: 5 });
    S.paints.push(() => { NOSE.fill(makeRamp(mixHex(d.colors.pattern, 0x1a1214, 0.6), 5, { spread: 0.5 }), (x, y) => 1.6 + Math.cos(NOSE.th(x)) * 0.9 + (hash(x * 3, y * 3) - 0.5) * 0.9 + (y > NOSE.h * 0.7 ? 0.8 : 0)); for (const s of [-1, 1]) NOSE.set(NOSE.X(s * 60), NOSE.h - 2, 0x050304); });
  } else {
    const BK = S.reg('BEAK', TAU * hw * 0.3, sl * 1.2, 8, 48, 32);
    const b0 = addV(head, [0, hh * 0.02, z0]);
    const bctrl: V3[] = [b0, addV(b0, [0, -hh * 0.02, sl * 0.5]), addV(b0, [0, -hh * 0.12, sl * 0.95]), addV(b0, [0, -hh * 0.34, sl * 1.12])];
    const bs = spline(bctrl, 9);
    sac(S.B, BK, S.gid(), bs.pts, bs.t.map((t) => [hw * 0.3 * (1 - t * 0.92), hh * 0.26 * (1 - t * 0.9)] as [number, number]), bs.pts.map(() => [iH, 1]), { n: 12, bump: (a) => 0.12 * gauss(a, 0, 0.3) });
    S.paints.push(() => keratin(BK, mixHex(d.colors.accent, 0xd8b050, 0.5), { tipLight: 1.5 }));
  }
  // ears
  if (has(d, 'ears')) {
    const EAR = S.reg('EAR', TAU * hw * 0.2, hh * 0.7, 8, 32, 24);
    for (const s of [-1, 1]) {
      const b0 = addV(head, [s * hw * 0.38, hh * 0.42, -hl * 0.04]);
      const dir = norm([s * 0.55, 1, -0.18]);
      const el = hh * (hom ? 0.35 : 0.72), ew = hw * (hom ? 0.14 : 0.2);
      const pts: V3[] = [0, 0.25, 0.55, 0.82, 1].map((t) => addV(b0, scl(dir, t * el)));
      const wd = [0.55, 1, 0.95, 0.6, 0.12];
      sac(S.B, EAR, S.gid(), pts, wd.map((k) => [ew * k, ew * k * 0.28] as [number, number]), pts.map(() => [iH, 1]), { n: 12, up: [0, 0, 1], shift: (a, t) => -ew * 0.14 * Math.max(0, Math.cos(a)) * Math.sin(Math.PI * t), bump: fur ? fuzz(0.15, 12, 5, 9 + s) : undefined });
    }
    S.paints.push(() => {
      hide(S, EAR, { L: hh * 0.7, rad: () => hw * 0.2, seed: 77, kind: 'head', noPattern: true });
      for (let y = 1; y < EAR.h - 1; y++) for (let x = 0; x < EAR.w; x++) if (Math.abs(EAR.th(x)) < 1.25 - y / EAR.h * 0.6) EAR.put(x, y, S.P.skin, 2.6 + (hash(x, y) - 0.5) * 0.8 - y / EAR.h, 0.5);
    });
  }
  // horns, antlers
  if (has(d, 'horns')) for (const s of [-1, 1]) {
    const b0 = addV(head, [s * hw * 0.3, hh * 0.42, hl * 0.18]);
    const Lh2 = hl * (0.55 + (d.seed % 7) * 0.04), r0 = Math.max(0.02, hw * 0.12);
    const hc: V3[] = [b0, addV(b0, [s * Lh2 * 0.25, Lh2 * 0.35, -Lh2 * 0.15]), addV(b0, [s * Lh2 * 0.55, Lh2 * 0.55, -Lh2 * 0.05]), addV(b0, [s * Lh2 * 0.7, Lh2 * 0.7, Lh2 * 0.3])];
    const hs = spline(hc, 12);
    const HORN = S.reg('HORN', TAU * r0, hs.L, 6, 20, 48);
    sac(S.B, HORN, S.gid(), hs.pts, hs.t.map((t) => [r0 * (1 - t * 0.9) + 0.002, r0 * (1 - t * 0.9) + 0.002] as [number, number]), hs.pts.map(() => [iH, 1]), { n: 9, bump: (a, t) => 0.08 * Math.max(0, Math.sin(t * 60)) * (1 - t) });
    S.paints.push(() => keratin(HORN, mixHex(d.colors.pattern, 0xc8b490, 0.55), { rings: true }));
  }
  if (has(d, 'antlers')) for (const s of [-1, 1]) {
    const b0 = addV(head, [s * hw * 0.28, hh * 0.45, -hl * 0.02]);
    const La = hl * 1.1, r0 = Math.max(0.015, hw * 0.07);
    const ANT = S.reg('ANTLER', TAU * r0, La, 6, 16, 48);
    const beam: V3[] = [b0, addV(b0, [s * La * 0.25, La * 0.35, -La * 0.1]), addV(b0, [s * La * 0.45, La * 0.7, 0]), addV(b0, [s * La * 0.5, La * 1.0, La * 0.2])];
    const bs = spline(beam, 12);
    sac(S.B, ANT, S.gid(), bs.pts, bs.t.map((t) => [r0 * (1 - t * 0.7), r0 * (1 - t * 0.7)] as [number, number]), bs.pts.map(() => [iH, 1]), { n: 7 });
    for (let k = 0; k < 3; k++) {
      const p = bs.pts[Math.round((0.3 + k * 0.22) * (bs.pts.length - 1))];
      const tip = addV(p, [s * La * 0.12, La * 0.28, La * 0.22]);
      sac(S.B, ANT, S.gid(), [p, lerpV(p, tip, 0.5), tip], [[r0 * 0.6, r0 * 0.6], [r0 * 0.4, r0 * 0.4], [0.003, 0.003]], [[iH, 1], [iH, 1], [iH, 1]], { n: 6 });
    }
    S.paints.push(() => keratin(ANT, 0xb8a080, { tipLight: 2.2 }));
  }
  if (has(d, 'electro')) {
    const G = S.fixed('GLOW', 6, 6);
    for (let i = 0; i < 6; i++) { const s = i % 2 ? 1 : -1; ball(S.B, G, S.gid(), addV(head, [s * hw * (0.2 + (i >> 1) * 0.02), hh * 0.05, z0 + sl * (0.3 + (i >> 1) * 0.2)]), [s, 0.3, 0.2], [hw * 0.035, hw * 0.035, hw * 0.03], [iH, 1], { n: 6, rings: 4 }); }
    S.paints.push(() => glowReg(G, d.colors.accent));
  }
}

function paintEyeReg(S: Ctx, r: Region) {
  const d = S.d;
  const slit = has(d, 'carnassials') || d.cover === 'scales';
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const f = y / (r.h - 1), th = r.th(x);
    let c = 0x241a16;
    if (f > 0.4) c = mixC(d.colors.eye, 0x000000, 0.35);
    if (f > 0.55) c = mixC(d.colors.eye, 0xffffff, 0.08 + Math.cos(th) * 0.15);
    if (f > 0.78) c = slit ? (Math.abs(Math.sin(th)) < 0.34 ? 0x050406 : d.colors.eye) : 0x050406;
    if (f > 0.4 && f < 0.48) c = mixC(d.colors.eye, 0x000000, 0.65);
    r.set(x, y, c);
  }
  const hx = r.X(-40), hy = Math.floor(r.h * 0.8);
  r.set(hx, hy, 0xffffff); r.set(hx + 1, hy, 0xffffff); r.set(hx, hy - 1, 0xe8f0ff);
  r.set(r.X(50), r.h - 2, 0xc8d0e8);
}

/** a vertebrate leg: thigh to toes, muscled, knuckled, with paws, hooves, pillars or bird feet */
function vertLeg(S: Ctx, lg: Rig['legs'][number], lt: number, fur: boolean) {
  const d = S.d, s = lg.side, ids = lg.bones;
  const J = ids.map((i) => S.rest[i]);
  const up = ids[0], parent = S.rig.bones[up].parent;
  const hind = lg.kind === 'hind', bird = lg.kind === 'bird', pillar = has(d, 'leg_pillar'), hoof = has(d, 'leg_hooved') && !bird;
  const top = addV(J[0], [-s * lt * 0.3, lt * 0.42, hind ? -lt * 0.1 : 0]);
  const ctrl = [top, ...J];
  const segIds = [up, ...ids.slice(0, -1)];
  const cts = chordTs(ctrl);
  const prof = bird ? [0.45, 0.66, 0.3, 0.2, 0.17] : pillar ? [0.5, 0.74, 0.66, 0.6, 0.64] : hind ? [0.42, 0.62, 0.4, 0.3, 0.25] : [0.36, 0.52, 0.36, 0.27, 0.24];
  const rs = ctrl.map((_, i) => lt * prof[Math.min(prof.length - 1, i === ctrl.length - 1 ? prof.length - 1 : i)]);
  const sp = spline(ctrl, ctrl.length > 4 ? 16 : 13);
  const wts = chainWeights(sp.pts, ctrl, segIds, lt * 0.5).map((w, i) => (sp.t[i] < cts[1] ? [up, 0.55 + 0.45 * (sp.t[i] / cts[1]), parent, 0.45 * (1 - sp.t[i] / cts[1])] : w));
  const tj = cts.slice(2, -1);
  const furF = fuzz(0.14, 14, sp.pts.length, (d.seed + lg.pair * 7 + s) % 91);
  const bump = (a: number, t: number) => {
    let b = 0;
    for (const k of tj) b += 0.16 * gauss(t, k, 0.035);
    if (hind && !bird) b += 0.22 * gauss(t, (cts[1] + cts[2]) / 2, 0.1) * gauss(Math.abs(a), Math.PI, 0.9);
    else if (!bird) b += 0.12 * gauss(t, (cts[1] + cts[2]) / 2, 0.1) * gauss(a, 0, 0.9);
    if (bird) b += 0.16 * gauss(t, cts[1] * 0.9, 0.1);
    if (fur && t < 0.85) b += furF(a, t) * 0.5;
    return b;
  };
  const LIMB = S.reg('LIMB', TAU * lt * 0.55, sp.L, 8, 64, 96);
  sac(S.B, LIMB, S.gid(), sp.pts, sp.t.map((t) => { const r = interp(cts, rs, t); return [r, r] as [number, number]; }), wts, { n: fur ? 12 : 10, up: [0, 0, 1], bump, start: true, end: false, cap: 0.6 });
  if (!S.paints.some((p) => (p as any).LIMB)) { const p: Paint = () => hide(S, LIMB, { L: sp.L, rad: () => lt * 0.45, seed: 29, kind: 'limb', belly: 2.4, noPattern: d.pattern !== 'stripes' && d.pattern !== 'rings' && d.pattern !== 'spots' }); (p as any).LIMB = 1; S.paints.push(p); }
  // ---- feet
  const iF = ids[ids.length - 1], F = J[J.length - 1], fw: Wt = [iF, 1];
  if (fur && !bird && !has(d, 'leg_pillar')) {
    const cuff = J[J.length - 2], cw: Wt = [ids[ids.length - 2], 1];
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; const out: V3 = [Math.sin(a), -0.9, Math.cos(a)]; furCard(S, addV(cuff, [Math.sin(a) * lt * 0.3, -lt * 0.1, Math.cos(a) * lt * 0.3]), norm(out), norm([Math.cos(a), 0, -Math.sin(a)]), lt * 0.6, lt * 0.35, cw, 500 + k + lg.pair * 11 + s); }
  }
  const FOOT = S.reg('FOOT', TAU * lt * 0.4, lt * 0.8, 8, 32, 16), CLAW = S.fixed('CLAW', 6, 10);
  if (!S.paints.some((p) => (p as any).FOOT)) {
    const p: Paint = () => { hide(S, FOOT, { L: lt, rad: () => lt * 0.3, seed: 31, kind: 'foot', noPattern: true, cover: d.cover === 'fur' ? 'fur' : 'skin' }); keratin(CLAW, mixHex(d.colors.pattern, 0x2a2420, 0.65), { tipLight: 2 }); };
    (p as any).FOOT = 1; S.paints.push(p);
  }
  const claw = (b: V3, dir: V3, L: number, r: number) => {
    const tip = addV(addV(b, scl(dir, L)), [0, -L * 0.45, 0]);
    sac(S.B, CLAW, S.gid(), [b, addV(lerpV(b, tip, 0.5), [0, L * 0.12, 0]), tip], [[r, r * 0.8], [r * 0.65, r * 0.5], [0.002, 0.002]], [fw, fw, fw], { n: 6 });
  };
  if (hoof) {
    sac(S.B, CLAW, S.gid(), [addV(F, [0, lt * 0.5, 0]), addV(F, [0, lt * 0.22, lt * 0.04]), addV(F, [0, lt * 0.02, lt * 0.08])], [[lt * 0.3, lt * 0.32], [lt * 0.36, lt * 0.38], [lt * 0.42, lt * 0.44]], [fw, fw, fw], { n: 12, bump: (a) => -0.22 * gauss(a, 0, 0.12) });
    if (fur) sac(S.B, FOOT, S.gid(), [addV(F, [0, lt * 0.72, -lt * 0.02]), addV(F, [0, lt * 0.5, 0])], [[lt * 0.36, lt * 0.36], [lt * 0.4, lt * 0.4]], [fw, fw], { n: 12, bump: fuzz(0.35, 12, 2, 4 + s), start: false });
  } else if (pillar) {
    sac(S.B, FOOT, S.gid(), [addV(F, [0, lt * 0.42, 0]), addV(F, [0, lt * 0.14, lt * 0.02]), addV(F, [0, lt * 0.01, lt * 0.03])], [[lt * 0.66, lt * 0.66], [lt * 0.74, lt * 0.74], [lt * 0.72, lt * 0.72]], [fw, fw, fw], { n: 14 });
    for (let i = 0; i < 4; i++) { const a = (i - 1.5) * 0.42; ball(S.B, CLAW, S.gid(), addV(F, [Math.sin(a) * lt * 0.7, lt * 0.08, Math.cos(a) * lt * 0.7]), [Math.sin(a), 0, Math.cos(a)], [lt * 0.13, lt * 0.1, lt * 0.06], fw, { n: 8, rings: 4 }); }
  } else if (bird) {
    for (let i = 0; i < 4; i++) {
      const back = i === 3, a = back ? Math.PI : (i - 1) * 0.5;
      const dir: V3 = [Math.sin(a), 0, Math.cos(a)];
      const Lt = lt * (back ? 0.55 : i === 1 ? 1.25 : 1.0);
      const pts: V3[] = [0, 0.35, 0.7, 1].map((t) => addV(addV(F, [0, lt * 0.12 * (1 - t), 0]), scl(dir, t * Lt)));
      sac(S.B, FOOT, S.gid(), pts, pts.map((_, k) => [lt * (0.13 - k * 0.02), lt * (0.11 - k * 0.018)] as [number, number]), pts.map(() => fw), { n: 7, bump: (aa, t) => 0.18 * Math.max(0, Math.sin(t * Math.PI * 3)) * 0.5 });
      claw(pts[3], dir, lt * 0.24, lt * 0.06);
    }
  } else {
    // paw: palm, four toes, claws
    sac(S.B, FOOT, S.gid(), [addV(F, [0, lt * 0.42, -lt * 0.12]), addV(F, [0, lt * 0.22, lt * 0.16]), addV(F, [0, lt * 0.13, lt * 0.42])], [[lt * 0.3, lt * 0.3], [lt * 0.4, lt * 0.24], [lt * 0.38, lt * 0.15]], [fw, fw, fw], { n: 12 });
    const big = has(d, 'carnassials') ? 1.4 : 1;
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * lt * 0.2, z = lt * (0.48 + (1.5 - Math.abs(i - 1.5)) * 0.07);
      const c: V3 = addV(F, [x, lt * 0.1, z]);
      ball(S.B, FOOT, S.gid(), c, [x * 0.5, 0, 1], [lt * 0.11, lt * 0.1, lt * 0.13], fw, { n: 8, rings: 5 });
      claw(addV(c, [0, lt * 0.03, lt * 0.1]), norm([x * 0.8, 0, 1]), lt * 0.2 * big, lt * 0.04);
    }
  }
}

/** biped arms: shoulder, elbow, wrist, a hand of three clawed or five soft fingers */
function arm(S: Ctx, ai: number, lt: number, hom: boolean, fur: boolean) {
  const d = S.d, A = S.rest[ai], s = Math.sign(S.rig.bones[ai].pos[0]) || 1;
  const al = S.rig.length * 0.2 * (hom ? 2 : 1), iC = S.bi('chest'), w: Wt = [ai, 1];
  const ctrl: V3[] = [addV(A, [-s * lt * 0.25, lt * 0.32, 0]), A, addV(A, [s * al * 0.07, -al * 0.42, al * 0.06]), addV(A, [s * al * 0.03, -al * 0.62, al * 0.42])];
  const sp = spline(ctrl, 12), cts = chordTs(ctrl), k = hom ? 0.75 : 0.5;
  const rs = [0.4, 0.58, 0.4, 0.3].map((v) => v * lt * k * 1.4);
  const LIMB = S.reg('LIMB', TAU * lt * 0.55, sp.L, 8, 64, 96);
  sac(S.B, LIMB, S.gid(), sp.pts, sp.t.map((t) => { const r = interp(cts, rs, t); return [r, r] as [number, number]; }), sp.t.map((t) => (t < cts[1] ? [ai, 0.6, iC, 0.4] : w)),
    { n: 10, start: true, end: false, cap: 0.6, bump: (a, t) => 0.14 * gauss(t, cts[2], 0.04) + 0.18 * gauss(t, (cts[1] + cts[2]) / 2, 0.1) * gauss(a, 0, 0.8) + (fur ? fuzz(0.05, 10, 12, 3 + s)(a, t) : 0) });
  const W2 = ctrl[3], dir = norm(sub(ctrl[3], ctrl[2]));
  const FOOT = S.reg('FOOT', TAU * lt * 0.4, lt * 0.8, 8, 32, 16), CLAW = S.fixed('CLAW', 6, 10);
  const hand = addV(W2, scl(dir, lt * 0.25 * k * 1.4));
  ball(S.B, FOOT, S.gid(), hand, dir, [lt * 0.32 * k * 1.4, lt * 0.18 * k * 1.4, lt * 0.3 * k * 1.4], w, { n: 10, rings: 5 });
  const nf = has(d, 'hands') || hom ? 5 : 3;
  const side = norm(cross(dir, [0, 1, 0]));
  for (let i = 0; i < nf; i++) {
    const f = (i / (nf - 1) - 0.5) * 2, thumb = nf === 5 && i === 0;
    const b0 = addV(hand, addV(scl(side, f * lt * 0.26 * k * 1.4), scl(dir, lt * 0.2 * k)));
    const fd = norm(addV(scl(dir, thumb ? 0.5 : 1), [0, -0.5, 0]));
    const Lf = lt * (thumb ? 0.3 : 0.42) * k * 1.4;
    const pts: V3[] = [b0, addV(b0, scl(fd, Lf * 0.5)), addV(addV(b0, scl(fd, Lf)), [0, -Lf * 0.2, 0])];
    sac(S.B, FOOT, S.gid(), pts, [[lt * 0.07 * k * 1.4, lt * 0.07 * k * 1.4], [lt * 0.065 * k * 1.4, lt * 0.06 * k * 1.4], [lt * 0.045 * k * 1.4, lt * 0.04 * k * 1.4]], [w, w, w], { n: 6 });
    if (!hom) sac(S.B, CLAW, S.gid(), [pts[2], addV(pts[2], addV(scl(fd, Lf * 0.3), [0, -Lf * 0.25, 0]))], [[lt * 0.04, lt * 0.035], [0.002, 0.002]], [w, w], { n: 5, start: false });
  }
}

/** bat-like wing: an arm and three finger struts with a membrane between them and the flank */
function patagium(S: Ctx, wi: number, fur: boolean) {
  const d = S.d, wb = S.rest[wi], s = Math.sign(S.rig.bones[wi].pos[0]) || 1;
  const L = S.rig.length, span = L * 0.9, T = S.rig.dims.T, iC = S.bi('chest'), w: Wt = [wi, 1];
  const elbow = addV(wb, [s * span * 0.32, span * 0.06, T * 0.08]), wrist = addV(wb, [s * span * 0.58, span * 0.02, 0]);
  const tips: V3[] = [addV(wb, [s * span, -span * 0.02, -T * 0.25]), addV(wb, [s * span * 0.88, -span * 0.04, -T * 0.6]), addV(wb, [s * span * 0.62, -span * 0.05, -T * 0.82])];
  const LIMB = S.reg('LIMB', TAU * 0.05, span, 8, 64, 96);
  const r0 = S.rig.dims.lt * 0.35;
  const strut = (a: V3, b: V3, r1: number, r2: number, ww: Wt) => { const sp2 = spline([a, lerpV(a, b, 0.5), b], 6); sac(S.B, LIMB, S.gid(), sp2.pts, sp2.t.map((t) => [r1 + (r2 - r1) * t, r1 + (r2 - r1) * t] as [number, number]), sp2.pts.map(() => ww), { n: 6 }); };
  strut(addV(wb, [-s * r0, 0, 0]), elbow, r0 * 1.2, r0 * 0.8, [wi, 0.7, iC, 0.3]); strut(elbow, wrist, r0 * 0.8, r0 * 0.6, w);
  for (const t of tips) strut(wrist, t, r0 * 0.45, r0 * 0.12, w);
  const WING = S.reg('WING', span, T, 16, 64, 40);
  const root0 = addV(wb, [-s * r0 * 0.5, 0, -T * 0.05]), root1 = addV(wb, [0, -span * 0.08, -T * 0.85]);
  const lead = [root0, elbow, wrist, tips[0]], trail = [root1, lerpV(root1, tips[2], 0.5), tips[2], tips[1]];
  const grid: V3[][] = [];
  const cols = 4, rows = 4;
  for (let i = 0; i <= rows; i++) {
    const row: V3[] = [];
    for (let j = 0; j < lead.length; j++) {
      const f = i / rows, p = lerpV(lead[j], trail[j], f);
      row.push(addV(p, [0, -Math.sin(f * Math.PI) * span * 0.04 * (j / cols + 0.3), 0]));
    }
    grid.push(row);
  }
  sheet(S.B, WING, S.gid(), grid, (_i, j) => (j === 0 ? [iC, 0.6, wi, 0.4] : w));
  S.paints.push(() => {
    const R = makeRamp(mixHex(d.colors.base, 0x2a1a24, 0.35), 6, { spread: 0.5 });
    WING.fill(R, (x, y) => 2.4 + (WING.fbm(x, y, 3, 2, 5) - 0.5) * 1.4 - (y / WING.h) * 0.6);
    for (let i = 0; i < 6; i++) WING.crack(hash(i, 7) * WING.w, 0, WING.h, 90, R[0], i * 13 + 3, 0.5, 0.3);
    if (fur) for (let x = 0; x < WING.w; x++) WING.set(x, 0, S.P.base[3]);
  });
}

/** glyptodont dome: a shell of polygonal plates over the back with a skirt above the legs */
function carapace(S: Ctx, chest: V3, hips: V3, W: number, H: number, T: number) {
  const iC = S.bi('chest'), iP = S.bi('hips');
  const ctrl: V3[] = [addV(hips, [0, H * 0.12, -T * 0.42]), addV(hips, [0, H * 0.24, -T * 0.05]), addV(lerpV(hips, chest, 0.5), [0, H * 0.28, 0]), addV(chest, [0, H * 0.22, 0]), addV(chest, [0, H * 0.1, T * 0.2])];
  const sp = spline(ctrl, 14), cts = chordTs(ctrl);
  const rx = [0.42, 0.66, 0.7, 0.62, 0.4].map((k) => k * W * 1.02), ry = [0.36, 0.58, 0.62, 0.55, 0.34].map((k) => k * H * 1.05);
  const CARA = S.reg('PLATE', TAU * W * 0.66, sp.L, 16, 128, 96);
  sac(S.B, CARA, S.gid(), sp.pts, sp.t.map((t) => [interp(cts, rx, t), interp(cts, ry, t)] as [number, number]), chainWeights(sp.pts, [ctrl[0], hips, chest, ctrl[4]], [iP, iP, iC], T * 0.3),
    { n: 22, bump: (a, t) => 0.035 * Math.cos(a * 11) * Math.cos(t * 30) + 0.08 * gauss(Math.abs(a), 2.2, 0.15) });
  S.paints.push(() => plates(S, CARA, 9));
}
function plates(S: Ctx, r: Region, cell: number) {
  const R = makeRamp(mixHex(S.d.colors.pattern, S.d.colors.base, 0.4), 7, { spread: 0.55, hueShift: 0.04 });
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const row = Math.floor(y / cell), ox = (row & 1) * cell * 0.5;
    const lx = ((x + ox) % cell) / cell - 0.5, ly = (y % cell) / cell - 0.5;
    const dd = Math.max(Math.abs(lx) * 1.15 + Math.abs(ly) * 0.55, Math.abs(ly));
    const k = dd > 0.44 ? 0.4 : 3.6 - dd * 3 - ly * 1.2 + Math.cos(r.th(x)) * 0.8 + (hash(Math.floor((x + ox) / cell), row) - 0.5);
    r.put(x, y, R, k, 0.5);
  }
}
function quills(S: Ctx, lt: number, H: number, t0: number, t1: number) {
  const sp = S.spine!, SP = S.fixed('SPIKE', 6, 16);
  for (let i = 0; i < 36; i++) {
    const t = t0 + (t1 - t0) * (0.05 + 0.9 * hash(i, 3)), a = (hash(i, 5) - 0.5) * 2.2;
    const k = Math.round(t * (sp.pts.length - 1)), f = sp.fr[k];
    const nrm = norm(addV(scl(f.v, Math.cos(a)), scl(f.u, Math.sin(a))));
    const base = addV(sp.pts[k], addV(scl(f.v, Math.cos(a) * sp.rv[k] * 0.9), scl(f.u, Math.sin(a) * sp.ru[k] * 0.9)));
    const dir = norm(addV(scl(nrm, 0.7), scl(f.d, 1.0)));
    const L = H * (0.45 + hash(i, 9) * 0.35);
    sac(S.B, SP, S.gid(), [base, addV(base, scl(dir, L * 0.5)), addV(base, scl(dir, L))], [[lt * 0.07, lt * 0.07], [lt * 0.05, lt * 0.05], [0.002, 0.002]], [sp.w[k], sp.w[k], sp.w[k]], { n: 4 });
  }
  S.paints.push(() => { for (let y = 0; y < SP.h; y++) for (let x = 0; x < SP.w; x++) SP.set(x, y, Math.floor(y / 3) % 2 ? 0x1a1614 : mixC(0xf0e8d8, 0x000000, 0.1 - Math.cos(SP.th(x)) * 0.1)); });
}

// =============================================================================================== arthropods
function arthropod(S: Ctx) {
  const d = S.d, rig = S.rig, D = rig.dims, spider = D.spider > 0;
  const { W, H, lt, thL, hl, hw } = D;
  const iT = S.bi('thorax'), iH = S.bi('head'), th = S.at(iT), hd = S.at(iH);
  const C = { base: d.cover === 'fur' ? 'fur' : 'chitin' };
  // ---- thorax (cephalothorax for spiders)
  const tw = spider ? 0.47 : 0.39, thz = [thL * 0.56, thL * 0.3, 0, -thL * 0.3, -thL * 0.55];
  const thr: [number, number][] = [[W * tw * 0.62, H * 0.32], [W * tw * 0.95, H * 0.44], [W * tw, H * 0.47], [W * tw * 0.95, H * 0.43], [W * tw * 0.6, H * 0.3]];
  const THX = S.reg('THX', TAU * W * tw, thL * 1.2, 12, 96, 48);
  const tpts = thz.map((z, i) => addV(th, [0, H * (i === 2 ? 0.07 : 0.04), z]));
  const tsp = spline(tpts, 10), tts = chordTs(tpts);
  sac(S.B, THX, S.gid(), tsp.pts, tsp.t.map((t) => [interp(tts, thr.map((r) => r[0]), t), interp(tts, thr.map((r) => r[1]), t)] as [number, number]), tsp.pts.map(() => [iT, 1]),
    { n: 16, bump: (a, t) => (spider ? fuzz(0.1, 16, 10, 5)(a, t) - 0.08 * gauss(a, 0, 0.12) * gauss(t, 0.5, 0.15) : -0.09 * (gauss(t, 0.36, 0.035) + gauss(t, 0.68, 0.035)) + 0.06 * gauss(a, 0, 0.2)) });
  S.paints.push(() => hide(S, THX, { L: thL, rad: () => W * tw, seed: 41, cover: C.base, plates: 3, belly: 2.2 }));
  // ---- head
  const HEAD = S.reg('HEAD', TAU * hw * 0.45, hl * 1.1, 12, 64, 32);
  const hpts: V3[] = [addV(hd, [0, 0, -hl * 0.08]), addV(hd, [0, H * 0.02, hl * 0.3]), addV(hd, [0, -H * 0.02, hl * 0.62]), addV(hd, [0, -H * 0.1, hl * 0.95])];
  const hr: [number, number][] = spider ? [[hw * 0.3, H * 0.26], [hw * 0.4, H * 0.32], [hw * 0.36, H * 0.3], [hw * 0.22, H * 0.2]] : [[hw * 0.34, H * 0.3], [hw * 0.46, H * 0.38], [hw * 0.42, H * 0.36], [hw * 0.26, H * 0.24]];
  const hsp = spline(hpts, 9), hts = chordTs(hpts);
  sac(S.B, HEAD, S.gid(), hsp.pts, hsp.t.map((t) => [interp(hts, hr.map((r) => r[0]), t), interp(hts, hr.map((r) => r[1]), t)] as [number, number]), hsp.pts.map((_, i) => (i === 0 ? [iH, 0.6, iT, 0.4] : [iH, 1])),
    { n: 14, bump: (a, t) => 0.08 * gauss(t, 0.85, 0.08) * gauss(Math.abs(a), Math.PI, 0.5) - 0.05 * gauss(a, 0, 0.12) });
  S.paints.push(() => hide(S, HEAD, { L: hl, rad: () => hw * 0.4, seed: 43, cover: C.base, plates: 2, belly: 2.2, noPattern: true }));
  // eyes
  if (spider) {
    const E = S.fixed('SEYE', 8, 8);
    const spots: [number, number, number, number][] = [[0.12, 0.3, 0.95, 0.12], [0.3, 0.26, 0.86, 0.08], [0.06, 0.4, 0.82, 0.06], [0.36, 0.18, 0.7, 0.06]];
    for (const [x, y, z, r] of spots) for (const s of [-1, 1]) ball(S.B, E, S.gid(), addV(hd, [s * hw * x, H * y, hl * z]), norm([s * x * 2, 0.4, 1]), [hw * r, hw * r, hw * r * 0.8], [iH, 1], { n: 8, rings: 5 });
    S.paints.push(() => { E.fill(makeRamp(0x14121a, 5, { spread: 0.6 }), (x, y) => 1 + y / E.h * 1.5 + Math.cos(E.th(x)) * 0.5); E.set(E.X(-40), E.h - 2, 0xffffff); E.set(E.X(-20), E.h - 3, 0xc8d0ff); });
  } else if (has(d, 'eye_compound')) {
    const E = S.fixed('CEYE', 20, 14);
    for (const s of [-1, 1]) ball(S.B, E, S.gid(), addV(hd, [s * hw * 0.38, H * 0.1, hl * 0.52]), norm([s, 0.15, 0.35]), [hl * 0.27, H * 0.26, hw * 0.17], [iH, 1], { n: 14, rings: 7 });
    S.paints.push(() => {
      const R = makeRamp(mixHex(d.colors.eye, 0x101418, 0.45), 6, { spread: 0.6 });
      E.fill(R, (x, y) => 1.6 + ((x + (y & 1)) % 2) * 0.7 + (Math.abs(E.th(x) + 0.4) < 0.7 && y > E.h * 0.5 ? 2 : 0) + y / E.h * 0.8 + (hash(x, y) - 0.5) * 0.5, undefined, 0.3);
      E.set(E.X(-30), E.h * 0.7, 0xffffff); E.set(E.X(-25), E.h * 0.72, 0xe0e8ff);
    });
  } else {
    const E = S.fixed('EYE', 12, 12);
    for (const s of [-1, 1]) ball(S.B, E, S.gid(), addV(hd, [s * hw * 0.36, H * 0.12, hl * 0.6]), norm([s, 0.2, 0.5]), [hw * 0.1, hw * 0.1, hw * 0.08], [iH, 1], { n: 10, rings: 6 });
    S.paints.push(() => paintEyeReg(S, E));
  }
  // ocelli: three glowing simple eyes on the brow
  if (!spider) {
    const G = S.fixed('GLOW', 6, 6);
    for (const [x, z] of [[0, 0.7], [-0.12, 0.55], [0.12, 0.55]]) ball(S.B, G, S.gid(), addV(hd, [hw * x, H * 0.34, hl * z]), [0, 1, 0.3], [hw * 0.035, hw * 0.035, hw * 0.025], [iH, 1], { n: 6, rings: 4 });
    S.paints.push(() => glowReg(G, mixHex(d.colors.eye, 0xffffff, 0.3)));
  }
  // antennae
  const ANT = S.fixed('ANT', 6, 24);
  for (let i = 0; i + 1 < rig.antennae.length; i += 2) {
    const a0 = rig.antennae[i], a1 = rig.antennae[i + 1], P0 = S.at(a0), P1 = S.at(a1);
    const tip = addV(P1, scl(sub(P1, P0), 1.05));
    const ctrl = [P0, lerpV(P0, P1, 0.5), P1, tip];
    const sp = spline(ctrl, 14);
    sac(S.B, ANT, S.gid(), sp.pts, sp.t.map((t) => { const r = lt * (0.15 - t * 0.08) * (1 + (hash(d.seed, 2) < 0.3 ? 1.8 * gauss(t, 1, 0.06) : 0)); return [r, r] as [number, number]; }),
      chainWeights(sp.pts, [P0, P1, tip], [a0, a1], lt * 0.3), { n: 6, bump: (_a, t) => 0.25 * Math.max(0, Math.sin(t * 60)) });
  }
  S.paints.push(() => ANT.fill(S.P.dark, (x, y) => 2 + (y % 2) * 0.8 + Math.cos(ANT.th(x)) * 0.8));
  // mouthparts
  const CLAW = S.fixed('CLAW', 6, 10);
  for (const mi of rig.mandibles) {
    const nm = rig.bones[mi].name;
    if (!nm.startsWith('mand')) continue;
    const M = S.at(mi), s = Math.sign(rig.bones[mi].pos[0]) || 1, w: Wt = [mi, 1];
    if (has(d, 'venom_fangs')) {
      const ml = hl * 0.4;
      sac(S.B, CLAW, S.gid(), [addV(M, [0, H * 0.04, -ml * 0.1]), addV(M, [0, -ml * 0.25, ml * 0.15]), addV(M, [-s * ml * 0.05, -ml * 0.6, ml * 0.2]), addV(M, [-s * ml * 0.1, -ml * 0.85, ml * 0.05])], [[hw * 0.12, hw * 0.12], [hw * 0.1, hw * 0.1], [hw * 0.05, hw * 0.05], [0.002, 0.002]], [w, w, w, w], { n: 8 });
    } else {
      const ml = hl * 0.55;
      sac(S.B, CLAW, S.gid(), [M, addV(M, [s * ml * 0.06, -H * 0.02, ml * 0.4]), addV(M, [-s * ml * 0.2, -H * 0.04, ml * 0.78]), addV(M, [-s * ml * 0.45, -H * 0.05, ml * 0.92])], [[hw * 0.1, H * 0.07], [hw * 0.09, H * 0.06], [hw * 0.05, H * 0.035], [0.002, 0.002]], [w, w, w, w],
        { n: 8, bump: (a, t) => 0.3 * Math.max(0, Math.sin(t * 24)) * gauss(a, -s * Math.PI / 2, 0.5) * (t > 0.3 ? 1 : 0) });
    }
  }
  if (has(d, 'proboscis')) {
    const p0 = addV(hd, [0, -H * 0.22, hl * 0.9]);
    const ctrl: V3[] = [p0, addV(p0, [0, -H * 0.25, hl * 0.25]), addV(p0, [0, -H * 0.55, hl * 0.12]), addV(p0, [0, -H * 0.6, -hl * 0.12]), addV(p0, [0, -H * 0.45, -hl * 0.18])];
    const sp = spline(ctrl, 14);
    sac(S.B, CLAW, S.gid(), sp.pts, sp.t.map((t) => [lt * 0.22 * (1 - t * 0.6), lt * 0.22 * (1 - t * 0.6)] as [number, number]), sp.pts.map(() => [iH, 1]), { n: 6 });
  }
  S.paints.push(() => keratin(CLAW, mixHex(d.colors.pattern, 0x2a1810, 0.6), { tipLight: 2.4 }));
  // ---- abdomen
  const abds = rig.tail.map((i) => S.rest[i]);
  const last = abds[abds.length - 1], segL = D.seg;
  const actrl: V3[] = [], ar: [number, number][] = [], aid: number[] = [];
  const aw = W * (spider ? 1.25 : 1.02), ah = H * (spider ? 1.35 : 1.05);
  if (spider) {
    const a0 = abds[0];
    actrl.push(addV(th, [0, H * 0.08, -thL * 0.48]), addV(a0, [0, H * 0.14, -segL * 0.08]), addV(a0, [0, H * 0.22, -segL * 0.45]), addV(a0, [0, H * 0.16, -segL * 0.85]), addV(a0, [0, H * 0.06, -segL * 1.05]));
    ar.push([W * 0.1, W * 0.1], [aw * 0.38, ah * 0.36], [aw * 0.52, ah * 0.5], [aw * 0.4, ah * 0.4], [aw * 0.12, ah * 0.12]);
    aid.push(iT, rig.tail[0], rig.tail[0], rig.tail[0]);
  } else {
    actrl.push(addV(th, [0, 0, -thL * 0.42]));
    ar.push([aw * 0.3, ah * 0.3]); aid.push(iT);
    abds.forEach((p, i) => { const k = 1 - (i / abds.length) * 0.42; actrl.push(addV(p, [0, 0, -segL * 0.5])); ar.push([aw * k * 0.5, ah * k * 0.5]); aid.push(rig.tail[i]); });
    actrl.push(addV(last, [0, -H * 0.04, -segL * 1.12])); ar.push([aw * 0.08, ah * 0.08]);
  }
  const asp = spline(actrl, spider ? 14 : clamp(abds.length * 7, 12, 30)), ats = chordTs(actrl);
  const nSeg = spider ? 1 : abds.length * 2;
  const ABD = S.reg('ABD', TAU * aw * 0.5, asp.L, 12, 128, 96);
  const awts = chainWeights(asp.pts, actrl, aid, segL * 0.3);
  sac(S.B, ABD, S.gid(), asp.pts, asp.t.map((t) => [interp(ats, ar.map((r) => r[0]), t), interp(ats, ar.map((r) => r[1]), t)] as [number, number]), awts,
    { n: 18, bump: spider ? fuzz(0.08, 18, 14, 7) : (a, t) => 0.08 * (1 - ((t * nSeg) % 1)) - 0.05 * gauss(a, 0, 0.1) });
  S.paints.push(() => {
    hide(S, ABD, { L: asp.L, rad: () => aw * 0.4, seed: 47, cover: C.base, plates: nSeg, belly: 2.2 });
    if (has(d, 'biolum')) for (let y = Math.floor(ABD.h * 0.68); y < ABD.h * 0.92; y++) for (let x = 0; x < ABD.w; x++) if (Math.abs(ABD.th(x)) > 1.9) { ABD.set(x, y, mixC(d.colors.accent, 0xffffff, 0.3 + hash(x, y) * 0.2)); ABD.alpha(x, y, 190); }
  });
  if (has(d, 'stinger')) {
    const tip = actrl[actrl.length - 1];
    sac(S.B, CLAW, S.gid(), [tip, addV(tip, [0, -segL * 0.06, -segL * 0.3]), addV(tip, [0, -segL * 0.22, -segL * 0.55])], [[lt * 0.5, lt * 0.5], [lt * 0.3, lt * 0.3], [0.002, 0.002]], [awts[awts.length - 1], awts[awts.length - 1], awts[awts.length - 1]], { n: 7 });
  }
  if (has(d, 'elytra')) {
    const fr = transport(asp.pts);
    const SH = S.reg('SHELL', aw * 1.2, asp.L, 12, 64, 96);
    for (const s of [-1, 1]) {
      const grid: V3[][] = [];
      const n1 = Math.round(asp.pts.length * 0.86);
      for (let i = 1; i < n1; i++) {
        const row: V3[] = [];
        const r0 = interp(ats, ar.map((r) => r[0]), asp.t[i]) * 1.14, r1 = interp(ats, ar.map((r) => r[1]), asp.t[i]) * 1.18;
        for (let j = 0; j <= 5; j++) { const phi = 0.03 + (j / 5) * 1.9; row.push(addV(asp.pts[i], addV(scl(fr[i].u, s * Math.sin(phi) * r0), scl(fr[i].v, Math.cos(phi) * r1)))); }
        grid.push(row);
      }
      sheet(S.B, SH, S.gid(), grid, (i) => awts[i + 1]);
    }
    S.paints.push(() => { const R = makeRamp(has(d, 'aposematic') ? d.colors.accent : d.colors.base, 7, { spread: 0.6, hueShift: 0.05 }); SH.fill(R, (x, y) => 2.6 + (1 - x / SH.w) * 1.4 + (Math.abs(x - SH.w * 0.35) < 1.2 ? 2 : 0) + ((y % 4 === 0 && x % 3 === 0) ? -1 : 0) + (SH.fbm(x, y, 3, 2, 3) - 0.5)); for (let y = 0; y < SH.h; y++) SH.set(0, y, R[0]); if (d.pattern === 'spots' || has(d, 'aposematic')) for (let i = 0; i < 5; i++) SH.blob(SH.w * (0.3 + hash(i, 1) * 0.5), SH.h * (0.15 + i * 0.17), 2.4, 2.4, S.P.pat[1], 1.2); });
  }
  if (has(d, 'wing_gossamer')) {
    const WING = S.reg('WING', W * 0.8, S.rig.length * 0.8, 12, 48, 64);
    for (const wi of rig.wings) {
      const wb = S.at(wi), s = Math.sign(rig.bones[wi].pos[0]) || 1, wl = S.rig.length * 0.8, ww = W * 0.36;
      const grid: V3[][] = [];
      for (let i = 0; i <= 6; i++) {
        const t = i / 6, wd = ww * Math.pow(Math.sin(Math.PI * (0.08 + 0.92 * t)), 0.7);
        const c = addV(wb, [s * (W * 0.12 + t * W * 0.15), 0.004, -t * wl]);
        grid.push([0, 1, 2, 3].map((j) => addV(c, [s * (j / 3 - 0.35) * wd, 0, 0])));
      }
      sheet(S.B, WING, S.gid(), grid, () => [wi, 1]);
    }
    S.paints.push(() => {
      const R = makeRamp(mixHex(d.colors.belly, 0xc8e0f0, 0.6), 6, { spread: 0.45 });
      WING.fill(R, (x, y) => 3 + (WING.fbm(x, y, 3, 2, 9) - 0.5) * 1.6 + Math.sin(x * 0.5 + y * 0.2) * 0.4);
      for (let i = 0; i < 5; i++) WING.line(i * WING.w / 5, 0, i * WING.w / 4.2, WING.h, 0x2a2a30, 0.7);
      for (let y = 4; y < WING.h; y += 5) WING.line(0, y, WING.w, y + 2, 0x3a3a40, 0.4);
    });
  }
  if (has(d, 'chitin_spines')) {
    const SP = S.fixed('SPIKE', 6, 16);
    for (let i = 0; i < 6; i++) { const s = i % 2 ? 1 : -1, z = (i / 5 - 0.5) * thL * 0.8; const b0 = addV(th, [s * W * 0.22, H * 0.4, z]); const tip = addV(b0, [s * W * 0.18, H * 0.55, -thL * 0.2]); sac(S.B, SP, S.gid(), [b0, lerpV(b0, tip, 0.5), tip], [[lt * 0.5, lt * 0.5], [lt * 0.3, lt * 0.3], [0.002, 0.002]], [[iT, 1], [iT, 1], [iT, 1]], { n: 6 }); }
    S.paints.push(() => keratin(SP, d.colors.pattern, { tipLight: 2.5 }));
  }
  // ---- legs
  const LIMB = S.reg('LIMB', TAU * lt * 0.6, D.legLen, 6, 32, 96);
  for (const lg of rig.legs) {
    const ids = lg.bones, J = ids.map((i) => S.rest[i]), s = lg.side;
    const root = addV(J[0], [-s * lt * 0.9, lt * 0.3, 0]);
    const tip = addV(J[2], [s * lt * 1.6, -lt * 0.2, 0]);
    const ctrl = [root, J[0], lerpV(J[0], J[1], 0.5), J[1], J[2], tip];
    const sp = spline(ctrl, 18), cts = chordTs(ctrl);
    const jumper = has(d, 'leg_saltatorial') && lg.pair === rig.legs.reduce((m, l) => Math.max(m, l.pair), 0);
    const rs = [0.8, 0.7, jumper ? 1.25 : 0.6, 0.42, 0.3, 0.14].map((k) => k * lt);
    const wts = chainWeights(sp.pts, [root, J[0], J[1], J[2], tip], [iT, ids[0], ids[1], ids[2]], lt * 0.6);
    sac(S.B, LIMB, S.gid(), sp.pts, sp.t.map((t) => { const r = interp(cts, rs, t); return [r, r] as [number, number]; }), wts,
      { n: 8, bump: (a, t) => 0.3 * gauss(t, cts[3], 0.025) + 0.22 * gauss(t, cts[4], 0.02) + (t > cts[4] ? 0.25 * Math.max(0, Math.sin(t * 90)) : 0) + (spider || d.cover === 'fur' ? fuzz(0.3, 8, 18, lg.pair + s)(a, t) : (t > cts[3] && t < cts[4] ? (hash(Math.round(a * 3), Math.round(t * 30)) > 0.8 ? 0.45 : 0) : 0)) });
    // two tarsal claws
    for (const k of [-1, 1]) sac(S.B, CLAW, S.gid(), [tip, addV(tip, [s * lt * 0.3, -lt * 0.3, k * lt * 0.3])], [[lt * 0.08, lt * 0.08], [0.002, 0.002]], [[ids[2], 1], [ids[2], 1]], { n: 4, start: false });
  }
  S.paints.push(() => hide(S, LIMB, { L: D.legLen, rad: () => lt * 0.5, seed: 53, kind: 'limb', cover: C.base, plates: 3, noPattern: d.pattern !== 'bands' && d.pattern !== 'rings' }));
  // raptorial forelegs / pincers on the coxa bones
  for (const mi of rig.mandibles) {
    const nm = rig.bones[mi].name;
    if (!nm.startsWith('leg')) continue;
    const C0 = S.at(mi), s = Math.sign(rig.bones[mi].pos[0]) || 1, w: Wt = [mi, 1], fl = D.legLen * 0.5;
    const knee = addV(C0, [s * fl * 0.12, fl * 0.32, fl * 0.62]);
    const sp = spline([C0, lerpV(C0, knee, 0.5), knee], 8);
    sac(S.B, LIMB, S.gid(), sp.pts, sp.t.map((t) => [lt * (1.3 - t * 0.3), lt * (1.5 - t * 0.4)] as [number, number]), sp.pts.map(() => w), { n: 10, bump: (a, t) => (gauss(a, Math.PI, 0.4) * (Math.sin(t * 40) > 0.5 ? 0.35 : 0)) });
    if (has(d, 'chela')) {
      const palm = addV(knee, [0, -fl * 0.02, fl * 0.18]);
      ball(S.B, LIMB, S.gid(), palm, [0, 0, 1], [lt * 1.6, lt * 1.2, fl * 0.2], w, { n: 12, rings: 6 });
      for (const k of [1, -1]) {
        const b0 = addV(palm, [0, k * lt * 0.5, fl * 0.16]);
        const pts: V3[] = [b0, addV(b0, [-s * lt * 0.3, k * lt * 0.4, fl * 0.2]), addV(b0, [-s * lt * 0.8, -k * lt * 0.1, fl * 0.36])];
        sac(S.B, CLAW, S.gid(), pts, [[lt * 0.7, lt * 0.55], [lt * 0.5, lt * 0.4], [0.003, 0.003]], [w, w, w], { n: 8, bump: (a, t) => 0.3 * Math.max(0, Math.sin(t * 30)) * gauss(a, k > 0 ? Math.PI : 0, 0.6) });
      }
    } else {
      const tip = addV(knee, [0, -fl * 0.42, fl * 0.2]);
      const sp2 = spline([knee, addV(lerpV(knee, tip, 0.5), [0, 0, fl * 0.08]), tip], 8);
      sac(S.B, CLAW, S.gid(), sp2.pts, sp2.t.map((t) => [lt * 0.9 * (1 - t * 0.9), lt * 0.5 * (1 - t * 0.85)] as [number, number]), sp2.pts.map(() => w), { n: 8, bump: (a, t) => (Math.sin(t * 50) > 0.4 ? 0.5 : 0) * gauss(a, Math.PI, 0.5) });
    }
  }
}

// =============================================================================================== serpents & worms
function serpent(S: Ctx) {
  const d = S.d, rig = S.rig, { W, seg } = rig.dims;
  const iH = rig.head, hd = S.at(iH), segs = rig.spine.map((i) => S.rest[i]);
  const worm = d.cover !== 'scales';
  const tail = addV(segs[segs.length - 1], [0, 0, -seg * 0.9]);
  const ctrl = [addV(hd, [0, 0, seg * 0.2]), hd, ...segs, tail];
  const ids = [iH, iH, ...rig.spine];
  const sp = spline(ctrl, clamp(segs.length * 5, 30, 70)), cts = chordTs(ctrl);
  const RU = sp.t.map((t) => W * 0.52 * (t < 0.28 ? 1 - 0.12 * gauss(t, 0.06, 0.03) : 1 - ((t - 0.28) / 0.72) * 0.86));
  const rings = segs.length * 4;
  const bump = (a: number, t: number) => worm
    ? 0.07 * Math.cos(t * rings * TAU) + 0.14 * gauss(t, 0.26, 0.03) + (has(d, 'setae') ? 0 : 0)
    : -0.14 * Math.pow(Math.max(0, -Math.cos(a)), 2) + 0.03 * gauss(a, 0, 0.15);
  const BODY = S.reg('BODY', TAU * W * 0.5, sp.L, 12, 128, 220);
  const wts = chainWeights(sp.pts, ctrl, ids.slice(0, ctrl.length - 1), seg * 0.4);
  sac(S.B, BODY, S.gid(), sp.pts, RU.map((r) => [r, r * (worm ? 1 : 0.88)] as [number, number]), wts, { n: 16, bump });
  S.spine = { pts: sp.pts, fr: transport(sp.pts), ru: RU, rv: RU, w: wts };
  S.paints.push(() => {
    hide(S, BODY, { L: sp.L, rad: () => W * 0.45, seed: 59, belly: worm ? 2.4 : 1.9 });
    if (worm) for (let y = 0; y < BODY.h; y++) { const t = y / BODY.h; if (Math.cos(t * rings * TAU) < -0.85) for (let x = 0; x < BODY.w; x++) BODY.blend(x, y, S.P.dark[1], 0.5); if (Math.abs(t - 0.26) < 0.03) for (let x = 0; x < BODY.w; x++) BODY.put(x, y, S.P.skin, 3.5 + Math.cos(BODY.th(x)), 0.5); }
  });
  // head
  const HEAD = S.reg('HEAD', TAU * W * 0.55, seg * 1.3, 12, 64, 32);
  if (!worm) {
    const hc: V3[] = [addV(hd, [0, W * 0.02, -seg * 0.3]), addV(hd, [0, W * 0.06, seg * 0.1]), addV(hd, [0, W * 0.04, seg * 0.5]), addV(hd, [0, 0, seg * 0.8])];
    const hs = spline(hc, 9), hts = chordTs(hc);
    const rx = [0.52, 0.66, 0.48, 0.24].map((k) => k * W), ry = [0.44, 0.42, 0.32, 0.17].map((k) => k * W);
    sac(S.B, HEAD, S.gid(), hs.pts, hs.t.map((t) => [interp(hts, rx, t), interp(hts, ry, t)] as [number, number]), hs.pts.map(() => [iH, 1]), { n: 16, bump: (a, t) => -0.1 * gauss(a, 0, 0.7) * t + 0.08 * gauss(t, 0.45, 0.1) * gauss(Math.abs(a), 0.9, 0.2) });
    S.paints.push(() => { hide(S, HEAD, { L: seg, rad: () => W * 0.5, seed: 61, belly: 2.0 }); for (let y = Math.floor(HEAD.h * 0.3); y < HEAD.h; y++) for (const s of [-1, 1]) HEAD.set(HEAD.X(s * 128), y, S.P.dark[0]); });
  } else {
    // a blunt prostomium and, with a ring maw, a toothed round mouth
    const front = addV(hd, [0, 0, seg * 0.55]);
    sac(S.B, HEAD, S.gid(), [addV(hd, [0, 0, -seg * 0.1]), addV(hd, [0, 0, seg * 0.3]), front], [[W * 0.5, W * 0.5], [W * 0.46, W * 0.46], [W * 0.3, W * 0.3]], [[iH, 1], [iH, 1], [iH, 1]], { n: 14, end: !has(d, 'ring_maw') });
    S.paints.push(() => hide(S, HEAD, { L: seg, rad: () => W * 0.5, seed: 61, belly: 2.4, noPattern: true }));
    if (has(d, 'ring_maw')) {
      const M = S.fixed('MOUTH', 12, 12), TE = S.fixed('TEETH', 6, 8);
      sac(S.B, M, S.gid(), [front, addV(front, [0, 0, -seg * 0.35])], [[W * 0.3, W * 0.3], [W * 0.12, W * 0.12]], [[iH, 1], [iH, 1]], { n: 14, start: false, flip: true });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, b0 = addV(front, [Math.cos(a) * W * 0.27, Math.sin(a) * W * 0.27, -seg * 0.04]); const tip = addV(front, [Math.cos(a) * W * 0.12, Math.sin(a) * W * 0.12, -seg * 0.1]); sac(S.B, TE, S.gid(), [b0, lerpV(b0, tip, 0.5), tip], [[W * 0.04, W * 0.04], [W * 0.025, W * 0.025], [0.002, 0.002]], [[iH, 1], [iH, 1], [iH, 1]], { n: 5 }); }
      S.paints.push(() => { M.fill(makeRamp(0x7a2436, 5, { spread: 0.5 }), (x, y) => 2.5 - y / M.h * 2 + (hash(x, y) - 0.5)); keratin(TE, 0xf0e6cc); });
    }
  }
  if (has(d, 'eye_spots') || !worm) {
    const E = S.fixed('EYE', 12, 12);
    for (const s of [-1, 1]) ball(S.B, E, S.gid(), addV(hd, [s * W * (worm ? 0.32 : 0.42), W * 0.18, seg * (worm ? 0.35 : 0.3)]), norm([s, 0.3, 0.4]), [W * 0.11, W * 0.11, W * 0.08], [iH, 1], { n: 10, rings: 6 });
    S.paints.push(() => paintEyeReg(S, E));
  }
  if (has(d, 'setae')) {
    const SP = S.fixed('SPIKE', 6, 16);
    for (let k = 4; k < sp.pts.length - 4; k += 3) for (const s of [-1, 1]) {
      const f = S.spine!.fr[k], base = addV(sp.pts[k], scl(f.u, s * RU[k] * 0.9));
      const dir = norm(addV(scl(f.u, s), scl(f.v, -0.3)));
      sac(S.B, SP, S.gid(), [base, addV(base, scl(dir, RU[k] * 0.9))], [[W * 0.025, W * 0.025], [0.002, 0.002]], [wts[k], wts[k]], { n: 4, start: false });
    }
    S.paints.push(() => keratin(SP, 0xd8c890, { tipLight: 1.5 }));
  }
}

// =============================================================================================== gastropods
function gastropod(S: Ctx) {
  const d = S.d, rig = S.rig, { W, H } = rig.dims, L = rig.length;
  const iF = rig.root, iH = rig.head, F = S.at(iF), hd = S.at(iH);
  const ctrl: V3[] = [addV(F, [0, -H * 0.3, -L * 0.6]), addV(F, [0, -H * 0.12, -L * 0.36]), addV(F, [0, 0, -L * 0.05]), addV(F, [0, H * 0.04, L * 0.25]), addV(hd, [0, -H * 0.18, -L * 0.04])];
  const rr: [number, number][] = [[W * 0.05, H * 0.05], [W * 0.36, H * 0.32], [W * 0.5, H * 0.46], [W * 0.48, H * 0.46], [W * 0.38, H * 0.42]];
  const sp = spline(ctrl, 24), cts = chordTs(ctrl);
  const BODY = S.reg('BODY', TAU * W * 0.5, sp.L, 12, 128, 128);
  sac(S.B, BODY, S.gid(), sp.pts, sp.t.map((t) => [interp(cts, rr.map((r) => r[0]), t), interp(cts, rr.map((r) => r[1]), t)] as [number, number]), sp.t.map((t) => (t > 0.85 ? [iF, 0.5, iH, 0.5] : [iF, 1])),
    { n: 20, bump: (a, t) => 0.12 * gauss(Math.abs(a), 2.15, 0.22) * (1 + 0.6 * Math.sin(t * 46)) - 0.18 * gauss(Math.abs(a), Math.PI, 0.5) + 0.05 * Math.sin(a * 9 + t * 30) * gauss(a, 0, 1.2) });
  S.paints.push(() => hide(S, BODY, { L: sp.L, rad: () => W * 0.45, seed: 67, cover: 'slime', belly: 2.0 }));
  // head and tentacles
  const HEAD = S.reg('HEAD', TAU * W * 0.4, L * 0.3, 12, 48, 24);
  sac(S.B, HEAD, S.gid(), [addV(hd, [0, -H * 0.05, -L * 0.1]), addV(hd, [0, H * 0.05, L * 0.04]), addV(hd, [0, -H * 0.12, L * 0.16])], [[W * 0.36, H * 0.42], [W * 0.36, H * 0.38], [W * 0.18, H * 0.16]], [[iH, 1], [iH, 1], [iH, 1]], { n: 14 });
  S.paints.push(() => hide(S, HEAD, { L: L * 0.3, rad: () => W * 0.35, seed: 71, cover: 'slime', noPattern: true }));
  for (const s of [-1, 1]) {
    const b0 = addV(hd, [s * W * 0.22, -H * 0.18, L * 0.12]), tip = addV(b0, [s * W * 0.15, -H * 0.1, L * 0.12]);
    sac(S.B, HEAD, S.gid(), [b0, lerpV(b0, tip, 0.5), tip], [[W * 0.06, W * 0.06], [W * 0.045, W * 0.045], [W * 0.03, W * 0.03]], [[iH, 1], [iH, 1], [iH, 1]], { n: 7 });
  }
  const E = S.fixed('EYE', 12, 12);
  for (const st of rig.stalks) {
    const P0 = S.at(st), s = Math.sign(rig.bones[st].pos[0]) || 1, sl = L * 0.32, w: Wt = [st, 1];
    const tip = addV(P0, [s * sl * 0.24, sl * 0.95, sl * 0.24]);
    const ss = spline([addV(P0, [0, -sl * 0.1, 0]), addV(P0, [s * sl * 0.08, sl * 0.5, sl * 0.06]), tip], 9);
    sac(S.B, HEAD, S.gid(), ss.pts, ss.t.map((t) => [W * (0.06 - t * 0.02), W * (0.06 - t * 0.02)] as [number, number]), ss.pts.map((_, i) => (i === 0 ? [st, 0.5, iH, 0.5] : w)), { n: 7, bump: (_a, t) => 0.08 * Math.sin(t * 30) });
    ball(S.B, E, S.gid(), tip, norm([s * 0.3, 0.6, 1]), [W * 0.075, W * 0.075, W * 0.07], w, { n: 10, rings: 6 });
  }
  S.paints.push(() => paintEyeReg(S, E));
  // shell: a logarithmic spiral lofted as a tapering tube, aperture down by the body
  if (rig.tail.length) {
    const iS = rig.tail[0], SB = S.at(iS), Sz = L * 0.48;
    const C = addV(SB, [0, Sz * 0.36, -Sz * 0.05]);
    const turns = 2.7, k = 0.19, pts: V3[] = [], radii: [number, number][] = [];
    const N = 64;
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * turns * TAU, e = Math.exp(-k * th);
      const R = Sz * 0.3 * e, ang = th + Math.PI * 0.6;
      pts.push(addV(C, [(1 - e) * Sz * 0.38, Math.cos(ang) * R, Math.sin(ang) * R]));
      const r = Sz * 0.3 * e * 0.98 + 0.002;
      radii.push([r, r]);
    }
    const SH = S.reg('SHELL', TAU * Sz * 0.3, Sz * 2.4, 16, 96, 160);
    sac(S.B, SH, S.gid(), pts, radii, pts.map(() => [iS, 1]), { n: 18, bump: (a, t) => 0.04 * Math.max(0, Math.sin(t * 260)) + 0.05 * gauss(a, 0, 0.3) });
    S.paints.push(() => {
      const R = makeRamp(mixHex(d.colors.pattern, 0xc8a070, 0.35), 7, { spread: 0.6, hueShift: 0.05 }), P2 = makeRamp(d.colors.accent, 6, { spread: 0.5 });
      for (let y = 0; y < SH.h; y++) for (let x = 0; x < SH.w; x++) {
        const th = SH.th(x), t = y / SH.h;
        const band = Math.sin(th * 3 + t * 6) > 0.72 || Math.abs(Math.sin(th * 1.5 + 0.6)) < 0.12;
        const k2 = 3 + Math.cos(th) * 0.8 + (y % 4 === 0 ? -0.9 : 0) + (SH.fbm(x, y, 4, 2, 11) - 0.5) * 1.1 + (t < 0.04 ? 1.4 : 0);
        SH.put(x, y, band ? P2 : R, k2, 0.5);
      }
      for (let i = 0; i < 12; i++) SH.blend(hash(i, 4) * SH.w, hash(i, 6) * SH.h * 0.5, 0xffffff, 0.6);
    });
  }
}

// =============================================================================================== entry
export interface Sculpt { geo: THREE.BufferGeometry; tex: THREE.DataTexture; tris: number }
export function sculpt(d: Design, rig: Rig, rest: V3[]): Sculpt {
  let den = 104;
  for (let attempt = 0; attempt < 8; attempt++) {
    const S = new Ctx(d, rig, rest, den);
    KIT.sq = 2.7; KIT.nMul = 0.62; // chunky rounded-box sections, flat-shaded facets: blocky but detailed
    try {
      switch (d.plan) {
        case 'hexapod': case 'octopod': arthropod(S); break;
        case 'serpent': serpent(S); break;
        case 'gastropod': gastropod(S); break;
        default: vertebrate(S); break;
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('page overflow')) { den *= 0.82; continue; }
      throw e;
    } finally { KIT.sq = 2; KIT.nMul = 1; }
    for (const p of S.paints) p();
    S.page.finish();
    return { geo: S.B.build(), tex: pageTexture(S.page), tris: S.B.tris };
  }
  throw new Error('sculpt: page too small for ' + d.plan);
}
void scaleHex; void cross;
