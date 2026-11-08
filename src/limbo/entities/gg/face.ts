// Face painter (ported and extended from the Gacha Garage people, src/people/face.js). The head's front is one
// image (the 'face block'). A small relief of the face (brow ridge, eye sockets, nose, cheeks, muzzle, lips,
// chin) is lit from above-front to bake realistic form shading; eyes (sclera, iris, pupil, catchlight, lids,
// lashes), brows, lips, hairline, stubble, wrinkles, make-up and glasses are drawn on top. Expressions move the
// features and the relief; only the region that changed is repainted (blinks touch the eye band, talking the
// mouth band). Added for Limbo Phobia: the creator's eye / brow / mouth / facial-hair / scar / tattoo options,
// masks, goggles and the hazmat hood's visor.
import { clamp01, sstep, lerp, mixc, G, h2, shadeInto, over, hairPx, type C3 } from './lib';
import type { GGSpec, Props } from './types';
import type { Block } from './mesh';

export type Expr = Record<string, number>;
/** Expression parameters (all optional, 0 = neutral). Units: face pixels (scaled with the face). */
export const EXPRESSIONS: Record<string, Expr> = {
  neutral: {},
  smile: { corner: 1.5, cheek: 0.6, lower: 0.3, mouthW: 1.05, brow: 0.3 },
  happy: { corner: 2.2, open: 2.4, teeth: 1, cheek: 1, lower: 0.7, brow: 0.7, mouthW: 1.1, upper: 0.85 },
  grin: { corner: 2.6, cheek: 1.2, lower: 0.8, teeth: 1, open: 1.4, mouthW: 1.16, brow: 0.6, upper: 0.82 },
  surprised: { brow: 2.6, upper: 1.35, open: 4.4, round: 0.9, mouthW: 0.7, lines: 1 },
  sad: { inner: 2.2, brow: -0.3, corner: -1.3, upper: 0.8, lookY: 1 },
  angry: { inner: -2.0, furrow: 1, brow: -0.6, upper: 0.85, corner: -0.8, mouthW: 0.9, sneer: 1 },
  sleepy: { upper: 0.4, brow: -0.2, open: 0.8, round: 0.4, mouthW: 0.85, lookY: 0.6 },
  pain: { inner: 1.8, brow: -0.5, furrow: 1, upper: 0.5, lower: 0.9, corner: -1.0, open: 1.6, teeth: 1, mouthW: 1.12, sneer: 0.7 },
  fear: { brow: 2.3, inner: 1.7, upper: 1.4, open: 2.4, round: 0.5, mouthW: 0.92, corner: -0.7, lines: 0.6 },
  think: { brow: 0.5, inner: 0.7, corner: -0.15, mouthW: 0.95, lookY: -1 },
  wink: { corner: 1.6, cheek: 0.7, mouthW: 1.05, brow: 0.2 },
  cool: { corner: 0.9, upper: 0.74, brow: -0.2, cheek: 0.3 },
  dead: { upper: 0, open: 1.2, round: 0.3, mouthW: 0.9 },
};
const KEYS = ['corner', 'cheek', 'lower', 'mouthW', 'brow', 'open', 'teeth', 'upper', 'round', 'lines', 'inner', 'furrow', 'sneer', 'lookY'];
const DEF: Expr = { mouthW: 1, upper: 1 };
export function exprParams(name: string, out: Expr = {}): Expr {
  const e = EXPRESSIONS[name] || EXPRESSIONS.neutral;
  for (const k of KEYS) out[k] = e[k] ?? DEF[k] ?? 0;
  return out;
}

const LIGHT = (() => { const l = [0.12, 0.6, 0.79]; const n = Math.hypot(l[0], l[1], l[2]); return l.map((v) => v / n); })();
const INK = [26, 18, 18];

export interface Pix { d: Uint8Array; w: number }

export class FacePainter {
  B: Block; L: Record<string, number>; s: number;
  private sp: GGSpec; private P: Props; private pix: Pix;
  private skin: number[]; private lip: number[]; private brow: number[]; private iris: number[]; private iris2: number[];
  private age: number; private hb: Float32Array; private o = new Float32Array(4);
  private hs: Float32Array | null = null; private kk!: Float32Array; private tA!: Float32Array; private tB!: Float32Array; private lay!: Float32Array;
  private bc = [0, 0, 0];
  private hz: boolean; private mask: string;
  private visor = { x: 0, top: 0, bot: 0 };

  constructor(sp: GGSpec, P: Props, block: Block, pix: Pix) {
    this.sp = sp; this.P = P; this.B = block; this.pix = pix;
    const d = block.dens, X = (x: number) => (x - block.x0) * d, Y = (y: number) => (block.y1 - y) * d;
    const F = sp.face, f = P.fem;
    const s = (P.hw * d) / 30; // feature scale (tuned for a 30 px half face)
    this.s = s;
    const L: Record<string, number> = this.L = {
      cx: X(0), hw: P.hw * d, eyeY: Y(P.eyeY), browY: Y(P.browY), noseY: Y(P.noseY), mouthY: Y(P.mouthY), chinY: Y(P.chin), hairY: Y(P.hairY),
      earTopY: Y(P.earTop), earBotY: Y(P.earBot),
    };
    const es = F.eyeShape;
    L.eyeX = L.hw * 0.385;
    L.ew = L.hw * 0.185 * F.eyeW;
    L.eh = s * lerp(2.0, 2.25, f) * F.eyeH * (F.lid === 'mono' ? 0.9 : 1);
    L.tilt = s * F.tilt;
    L.ir = L.ew * 0.44;
    L.browIn = L.hw * 0.15; L.browOut = L.hw * 0.66;
    L.browTh = s * F.browW * lerp(2.4, 1.7, f);
    L.browArch = s * F.browArch;
    L.noseW = s * lerp(5.4, 4.8, f);
    L.mouthW = s * lerp(8.6, 7.8, f);
    L.lipU = s * lerp(1.7, 2.0, f) * F.lipFull;
    L.lipL = s * lerp(2.4, 2.8, f) * F.lipFull;
    L.lop = es === 6 ? 1.2 * s : 0;
    this.skin = sp.skin;
    this.lip = F.lipstick || mixc(mixc(sp.skin, [188, 86, 86], lerp(0.36, 0.5, f)), [120, 60, 60], 0.12);
    this.brow = mixc(mixc(sp.hair.col, [30, 22, 20], sp.hair.grey ? 0 : 0.25), sp.skin, sp.hair.grey ? 0.25 : 0.08);
    this.iris = F.iris; this.iris2 = es === 7 ? [150, 170, 180] : F.iris;
    this.age = 0.25 + F.age * 0.75;
    this.hb = new Float32Array((block.w + 4) * (block.h + 4));
    this.hz = sp.dress.suit === 'hazmat';
    this.mask = sp.dress.mask?.kind ?? '';
    // the visor window (face px): from the forehead to under the chin, to the cheeks' edges
    this.visor = { x: L.hw * 1.02, top: Y(P.browY + 0.13 * P.hu), bot: Y(P.chin + 0.01 * P.hu) };
  }

  /** Hairline y (face px) at horizontal distance ax from the centre; -1e9 = no hair at that column. */
  hairline(ax: number): number {
    const L = this.L, st = this.sp.hair.style, s = this.s;
    if (this.hz || st === 'none' || st === 'shaved') return -1e9;
    if (st === 'bald') return ax > L.hw * 0.86 ? L.earTopY - 4 * s : -1e9;
    if (st === 'mohawk') return ax < L.hw * 0.22 ? L.hairY : -1e9;
    let y = L.hairY;
    if (st === 'receding') y += 6 * s * G(ax - L.hw * 0.48, 0, 6 * s, 1) + 2 * s;
    else if (this.P.fem < 0.5) y += 2.2 * s * G(ax - L.hw * 0.5, 0, 4 * s, 1) * (this.age > 0.5 ? 1.8 : 1);
    else y += (ax / L.hw) ** 2 * 2 * s;
    const side = sstep(L.hw * 0.68, L.hw * 0.9, ax);
    return lerp(y, L.earTopY + (this.P.fem < 0.5 ? 4 * s : 0), side);
  }

  /** Expression-independent relief (px) at face pixel (x, y). Cached once per human. */
  heightStatic(x: number, y: number): number {
    const L = this.L, s = this.s, dx = x - L.cx, ax = Math.abs(dx), hw = L.hw, es = this.sp.face.eyeShape, sh = this.sp.face.shape;
    const low = sstep(L.eyeY, L.chinY, y);
    let h = -(dx * dx) / (hw * hw) * (13 + 12 * low) * s;
    const top = clamp01((L.browY - y) / (L.browY - L.hairY + 6 * s));
    h -= top * top * 6 * s;
    h += 0.7 * s * G(dx, y - L.browY - 1.5 * s, 2.6 * s, 3 * s);
    h -= (es === 5 ? 4.8 : 3.6) * s * G(ax - L.eyeX + 0.8 * s, y - (L.eyeY - 0.8 * s), 6.2 * s, 4.2 * s);
    h += 1.5 * s * G(ax - L.eyeX, y - L.eyeY, L.ew * 0.95, L.eh * 1.9);
    const tn = clamp01((y - (L.eyeY - 2 * s)) / (L.noseY - L.eyeY + 2 * s));
    if (y > L.browY && y < L.noseY + 2 * s) h += (1.6 + 2.6 * tn) * s * Math.exp(-(dx * dx) / (2 * (lerp(1.3, 2.6, tn) * s) ** 2)) * sstep(L.browY, L.eyeY, y);
    h += 2.6 * s * G(dx, y - (L.noseY - 2 * s), 2.4 * s, 2.1 * s);
    h += 1.8 * s * G(ax - L.noseW * 0.72, y - (L.noseY - 1.2 * s), 1.4 * s, 1.6 * s);
    h -= 1.6 * s * G(ax - L.noseW * 0.4, y - (L.noseY + 0.1 * s), 0.9 * s, 0.55 * s);
    h -= (1.1 + this.age * 0.6 + sh.hollow * 2.2) * s * G(ax - hw * 0.66, y - (L.noseY + 2.5 * s), 2.6 * s, 4.5 * s);
    h += (sh.cheek - 1) * 30 * s * G(ax - hw * 0.62, y - (L.eyeY + 4 * s), 4 * s, 3 * s);
    h -= 0.6 * s * G(dx, y - (L.noseY + L.mouthY) / 2, 0.9 * s, 2.2 * s);
    h += 0.35 * s * G(ax - 1.5 * s, y - (L.noseY + L.mouthY) / 2, 0.6 * s, 2.2 * s);
    h += 2.4 * s * sh.chin * G(dx, y - (L.chinY - 4.5 * s), 5 * s, 3.4 * s);
    h -= 1.0 * s * G(ax - hw * 0.86, y - (L.browY - 2 * s), 3 * s, 5 * s);
    if (this.age > 0.5 && y > L.mouthY) h -= 0.7 * s * G(ax - L.mouthW - 1.4 * s, 0, 0.8 * s, 1) * sstep(L.mouthY, L.mouthY + 3 * s, y) * sstep(L.chinY - 2 * s, L.mouthY + 5 * s, y);
    return h;
  }

  /** Expression-dependent relief; every term is skipped outside its region. */
  heightDyn(x: number, y: number, E: Expr): number {
    const L = this.L, s = this.s, dx = x - L.cx, ax = Math.abs(dx), hw = L.hw;
    let h = 0;
    if (Math.abs(y - L.browY) < 9 * s) h += 1.5 * s * G(ax - L.eyeX * 0.95, y - (L.browY + 1.2 * s - (E.brow || 0) * 0.5), 7 * s, 2.2 * s);
    const ly = L.eyeY + L.eh + 1.8 * s - (E.lower || 0) * 0.8 * s;
    if (Math.abs(y - ly) < 4 * s) h += (0.5 + this.age * 0.6 + (this.sp.face.eyeShape === 4 ? 0.8 : 0)) * s * G(ax - L.eyeX + 0.5 * s, y - ly, L.ew * 0.8, 1.1 * s);
    if (E.sneer && Math.abs(y - L.eyeY - 2 * s) < 5 * s) h -= E.sneer * 0.8 * s * G(dx, y - (L.eyeY + 2 * s), 3 * s, 1.5 * s);
    const ch = E.cheek || 0, cy = L.eyeY + 7.5 * s - ch * 2 * s;
    if (Math.abs(y - cy) < 20 * s) h += (2.2 + ch * 0.8) * s * G(ax - hw * 0.56, y - cy, 6 * s, 5 * s);
    const mw = L.mouthW * (E.mouthW || 1);
    if (y > L.noseY - 8 * s) {
      h += 2.2 * s * G(dx, y - (L.mouthY - 1.5 * s), mw * 1.3, 6.5 * s);
      const lipB = L.mouthY + (E.open || 0) * 0.7 + L.lipL;
      if (Math.abs(y - lipB - 1.6 * s) < 4 * s) h -= 1.3 * s * G(dx, y - (lipB + 1.6 * s), mw * 0.7, 1.2 * s);
      const nl = (0.35 + this.age * 1.4 + ch * 1.3) * s;
      if (y > L.noseY - 3 * s && y < L.mouthY + 5 * s) {
        const ty = clamp01((y - (L.noseY - 2 * s)) / (L.mouthY + 4 * s - L.noseY));
        h -= nl * G(ax - lerp(L.noseW + 1.2 * s, mw + 2.4 * s + ch * s, ty), 0, 1.0 * s, 1);
      }
    }
    const lines = (E.lines || 0) + this.age * 0.8;
    if (lines > 0 && y < L.browY - 3.5 * s && y > L.browY - 13 * s) {
      const wob = (y - L.browY) * 1.9 / s + Math.sin(dx * 0.35 / s) * 0.8 + (dx * dx) / (hw * hw) * 2.2;
      h -= lines * 0.5 * s * Math.max(0, Math.sin(wob)) ** 2 * G(dx, 0, 10 * s, 1) * (0.6 + 0.4 * Math.sin(dx * 0.7 / s + 1));
    }
    if (E.furrow && Math.abs(y - L.browY) < 6 * s) h -= E.furrow * 0.8 * s * G(ax - 1.4 * s, y - (L.browY + 0.5 * s), 0.6 * s, 2 * s);
    return h;
  }

  /** One-off caches: static relief, per-pixel tint (o = o * A + B), hairline hair and glasses layers. */
  bake() {
    if (this.hs) return;
    const B = this.B, L = this.L, s = this.s, F = this.sp.face, W2 = B.w + 2, n = W2 * (B.h + 2), P = this.P;
    const hs = new Float32Array(n);
    for (let j = -1; j <= B.h; j++) for (let i = -1; i <= B.w; i++) hs[(j + 1) * W2 + i + 1] = this.heightStatic(i + 0.5, j + 0.5);
    const N = B.w * B.h;
    this.kk = new Float32Array(N); this.tA = new Float32Array(N); this.tB = new Float32Array(N * 3);
    this.lay = new Float32Array(N * 4);
    const o = new Float32Array(4), c = new Float32Array(4);
    const hl = new Float32Array(B.w);
    for (let i = 0; i < B.w; i++) hl[i] = this.hairline(Math.abs(i + 0.5 - L.cx));
    const hair = this.sp.hair, fh = F.facial;
    const stub = F.stubble;
    // the face tattoo and the brow scar (creator body marks on the HEAD region)
    const tat = F.tattoo ? FACE_TATTOO[F.tattoo] : null;
    const tatX = L.cx - L.hw * 0.42, tatY = L.eyeY + 4 * s;
    for (let j = 0; j < B.h; j++) for (let i = 0; i < B.w; i++) {
      const x = i + 0.5, y = j + 0.5, dx = x - L.cx, ax = Math.abs(dx), q = j * B.w + i;
      let k = 1 - 0.16 * sstep(L.chinY - 3 * s, L.chinY + 0.5, y) * (0.6 + 0.4 * ax / L.hw);
      k *= 1 + (h2(i, j, 31) - 0.5) * (F.makeup ? 0.02 : 0.045);
      const hy = hl[i];
      if (y > hy + 2.5 * s && y < hy + 5 * s) k *= 1 - 0.13 * (1 - (y - hy - 2.5 * s) / (2.5 * s));
      this.kk[q] = k;
      let A = 1; const Bc = [0, 0, 0];
      const tint = (col: C3, t: number) => { if (t <= 0.001) return; t = Math.min(1, t); A *= 1 - t; for (let m = 0; m < 3; m++) Bc[m] = Bc[m] * (1 - t) + col[m] * t; };
      tint([214, 104, 98], F.blush * 0.22 * G(ax - L.hw * 0.56, y - (L.eyeY + 7 * s), 5 * s, 4 * s) + 0.07 * G(dx, y - L.noseY + 2 * s, 3 * s, 2.5 * s));
      tint([96, 66, 80], 0.1 * G(ax - L.eyeX + 1.2 * s, y - L.eyeY + 0.5 * s, 6 * s, 3.6 * s) * (0.7 + this.age + (F.eyeShape === 4 ? 1.2 : 0)));
      if (stub) {
        const z = G(dx, y - (L.mouthY + 2 * s), L.mouthW * 1.5, 7 * s) * sstep(L.noseY + 0.5 * s, L.noseY + 2.2 * s, y) + 0.8 * sstep(L.hw * 0.62, L.hw * 0.86, ax) * sstep(L.noseY, L.mouthY, y);
        if (z > 0.05) tint([70, 72, 84], stub * clamp01(z) * (0.18 + h2(i, j, 77) * 0.22));
      }
      if (this.age > 0.6 && h2(i, j, 91) > 0.988 && (y < L.browY - 2 * s || ax > L.hw * 0.5)) tint([150, 100, 72], 0.28);
      if (F.freckles && y > L.eyeY + 2 * s && y < L.noseY + 3 * s && ax < L.hw * 0.72 && h2(i, j, 92) > 0.92) tint([168, 102, 70], 0.45 * F.freckles);
      const mk = F.makeup;
      if (mk?.blush) tint(mk.blush, 0.22 * G(ax - L.hw * 0.55, y - (L.eyeY + 6 * s), 5 * s, 3.5 * s));
      if (mk?.highlight) tint([255, 246, 236], mk.highlight * (0.5 * G(dx, y - (L.eyeY + 1 * s), 1.2 * s, 5 * s) + 0.6 * G(ax - L.eyeX, y - (L.eyeY + L.eh + 2.2 * s), L.ew * 0.7, 1 * s)));
      // facial scars (0..3): across the left brow, the right cheek, the chin
      if (F.scars >= 1 && Math.abs((x - (L.cx + L.eyeX + 1 * s)) * 0.5 + (y - L.browY)) < 0.6 && Math.abs(y - L.browY) < 5 * s) tint([236, 196, 186], 0.75);
      if (F.scars >= 2 && Math.abs((x - (L.cx - L.hw * 0.55)) - (y - (L.noseY - 1 * s)) * 0.3) < 0.55 && Math.abs(y - L.noseY) < 4.5 * s) tint([210, 150, 140], 0.7);
      if (F.scars >= 3 && Math.abs(y - (L.chinY - 2.5 * s)) < 0.55 && Math.abs(dx - 1.5 * s) < 2.6 * s) tint([226, 186, 176], 0.7);
      if (F.mouth === 6 && Math.abs(dx - L.mouthW * 0.3) < 0.6 && Math.abs(y - L.mouthY) < 3 * s) tint([150, 60, 60], 0.6);
      if (tat) {
        const gx = Math.floor((x - tatX) / (1.1 * s) + tat[0].length / 2), gy = Math.floor((y - tatY) / (1.1 * s));
        if (gy >= 0 && gy < tat.length && gx >= 0 && gx < tat[0].length && tat[gy][gx] === '#') tint([40, 46, 66], 0.8);
      }
      this.tA[q] = A; this.tB[q * 3] = Bc[0]; this.tB[q * 3 + 1] = Bc[1]; this.tB[q * 3 + 2] = Bc[2];
      // hair + facial hair + glasses + masks layer
      o[0] = o[1] = o[2] = 0; let a = 0;
      const put = (col: C3, t: number) => { if (t <= 0) return; t = Math.min(1, t); o[0] = o[0] * (1 - t) + col[0] * t; o[1] = o[1] * (1 - t) + col[1] * t; o[2] = o[2] * (1 - t) + col[2] * t; a = a + (1 - a) * t; };
      if (y < hy + 2.5 * s) {
        const edge = (hy - y) / (2.5 * s) + 0.5 + (h2(i, j, 13) - 0.5) * 0.9;
        if (edge >= 0.35) {
          a = clamp01((edge - 0.35) * 2.2);
          hairPx(c, hair, i + Math.round(dx * 0.15 * (y - hy) / s), j, 0.95, 0.15 * G(dx, y - L.hairY + 10 * s, 14 * s, 6 * s));
          o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
        }
      }
      // facial hair
      const mwF = L.mouthW + 1.5 * s;
      const hairAt = (t: number) => { hairPx(c, hair, i, j, 0.85, 0.1); put([c[0], c[1], c[2]], t * (h2(i, j, 61) > 0.15 ? 1 : 0.4)); };
      if (fh === 'moustache' || fh === 'handlebar' || fh === 'beard' || fh === 'goatee') {
        const u = dx / mwF;
        if (Math.abs(u) < 1.05 && y > L.noseY + 1.2 * s && y < L.mouthY - 0.4 * s + Math.abs(u) * 1.5 * s) hairAt(0.85 * sstep(1.05, 0.8, Math.abs(u)));
        if (fh === 'handlebar' && Math.abs(u) > 0.8 && Math.abs(u) < 1.45 && Math.abs(y - (L.mouthY - 1 * s - (Math.abs(u) - 1) * 4 * s)) < 0.9 * s) hairAt(0.85);
      }
      if (fh === 'beard') {
        const below = y > L.mouthY + L.lipL + 0.8 * s || (ax > L.mouthW * 1.15 && y > L.noseY + 1.5 * s);
        const z = below && y < L.chinY + 2 && (ax < L.hw * (0.7 + 0.3 * sstep(L.noseY, L.chinY, y)));
        if (z && ax < L.hw * 0.98) hairAt(0.9 * sstep(L.noseY + 0.5 * s, L.noseY + 3 * s, y));
      }
      if (fh === 'goatee' && ax < L.mouthW * 0.75 && y > L.mouthY + L.lipL + 0.6 * s && y < L.chinY + 1) hairAt(0.9);
      if (fh === 'soul_patch' && ax < 1.8 * s && y > L.mouthY + L.lipL + 0.8 * s && y < L.mouthY + L.lipL + 4 * s) hairAt(0.9);
      if (fh === 'chin_strap' && y > L.chinY - 3 * s && y < L.chinY + 1) hairAt(0.85);
      if ((fh === 'chops' || fh === 'chin_strap') && ax > L.hw * 0.78 && y > L.eyeY + 3 * s && y < L.chinY) hairAt(0.9);
      // glasses / goggles / masks
      if (F.glasses) {
        c[0] = o[0]; c[1] = o[1]; c[2] = o[2]; c[3] = a;
        const ga = this.glassesPx(c, x, y);
        if (ga > 0) { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; a = ga; }
      }
      if (this.mask === 'mask') {
        const top = L.noseY - 3.5 * s - Math.abs(dx) * 0.12;
        if (y > top && y < L.chinY + 2) {
          const mc = this.sp.dress.mask!.col;
          const pleat = (Math.floor((y - top) / (2.2 * s)) % 2) ? 0.9 : 1;
          put([mc[0] * pleat * (1 - 0.15 * (ax / L.hw) ** 2), mc[1] * pleat * (1 - 0.15 * (ax / L.hw) ** 2), mc[2] * pleat * (1 - 0.15 * (ax / L.hw) ** 2)], 1);
          if (Math.abs(y - top) < 0.7) put(INK, 0.4);
        }
      }
      if (this.mask === 'gasmask') {
        const inLens = (Math.hypot((ax - L.eyeX) / (L.ew * 1.45), (y - L.eyeY) / (L.ew * 1.25)) < 1);
        if (inLens) { put([40, 52, 56], 0.75); if (Math.abs(dx + ax * 0.2 - L.eyeX * 0.6) < 0.8 && y < L.eyeY) put([220, 230, 230], 0.4); }
        else if (y > L.browY - 6 * s) { put([46, 48, 46], 1); if (h2(i, j, 4) > 0.9) put([70, 72, 70], 0.5); }
        if (!inLens && Math.abs(Math.hypot((ax - L.eyeX) / (L.ew * 1.45), (y - L.eyeY) / (L.ew * 1.25)) - 1.08) < 0.08) put([120, 124, 120], 0.9);
      }
      if (this.hz) {
        const V = this.visor;
        const out = ax > V.x || y < V.top || y > V.bot;
        if (out) {
          // the hood's rubber round the window (it shows in the face block where the hood is open)
          const hc = this.sp.dress.hazmat?.col ?? [232, 196, 40];
          const k2 = 0.82 + 0.1 * Math.sin(y * 0.6 / s + dx * 0.2) - 0.12 * sstep(V.x, L.hw * 1.2, ax);
          put([hc[0] * k2, hc[1] * k2, hc[2] * k2], 1);
          if (y < V.top && Math.abs(dx) < 1.5 * s) put([176, 178, 172], 0.95);
        } else {
          // the glass: a cool tint, two reflection streaks, a darker band at the bottom (breath fog)
          const gx2 = (dx + (y - V.top) * 0.55) / L.hw;
          put([150, 190, 196], 0.13);
          if (Math.abs(gx2 + 0.55) < 0.06 || Math.abs(gx2 + 0.38) < 0.025) put([255, 255, 255], 0.32 * sstep(V.bot, V.top, y));
          if (y > V.bot - 6 * s && h2(i >> 1, j >> 1, 7) > 0.5) put([230, 236, 236], 0.12);
          // frame shadow inside the edge
          if (ax > V.x - 1.2 * s || y < V.top + 1.2 * s) put([20, 22, 22], 0.35);
        }
      }
      this.lay[q * 4] = o[0]; this.lay[q * 4 + 1] = o[1]; this.lay[q * 4 + 2] = o[2]; this.lay[q * 4 + 3] = a;
    }
    this.hs = hs;
  }

  /** Paint the face (or a sub-rect in face px) for expression params E (+ blink, lookX, lookY). Returns the page rect touched. */
  paint(E: Expr, r: number[] | null = null): number[] {
    if (!this.hs) this.bake();
    const B = this.B, d = this.pix.d, W = this.pix.w, W2 = B.w + 2;
    const x0 = r ? Math.max(0, r[0] | 0) : 0, y0 = r ? Math.max(0, r[1] | 0) : 0;
    const x1 = r ? Math.min(B.w, Math.ceil(r[2])) : B.w, y1 = r ? Math.min(B.h, Math.ceil(r[3])) : B.h;
    const hb = this.hb, hw = x1 - x0 + 2, hs = this.hs!;
    for (let j = y0 - 1; j <= y1; j++) for (let i = x0 - 1; i <= x1; i++) hb[(j - y0 + 1) * hw + (i - x0 + 1)] = hs[(j + 1) * W2 + i + 1] + this.heightDyn(i + 0.5, j + 0.5, E);
    const o = this.o, skin = this.skin, kk = this.kk, tA = this.tA, tB = this.tB, lay = this.lay;
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) {
      const x = i + 0.5, y = j + 0.5, q = j * B.w + i;
      const k0 = (j - y0 + 1) * hw + (i - x0 + 1);
      const gx = (hb[k0 + 1] - hb[k0 - 1]) * 0.5, gy = (hb[k0 + hw] - hb[k0 - hw]) * 0.5;
      const nl = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const dif = Math.max(0, (-gx * LIGHT[0] + gy * LIGHT[1] + LIGHT[2]) * nl);
      const cav = (hb[k0 - 1] + hb[k0 + 1] + hb[k0 - hw] + hb[k0 + hw]) * 0.25 - hb[k0];
      shadeInto(o, skin, (0.54 + 0.5 * dif - Math.max(0, cav) * 0.05) * kk[q], 0.26);
      o[3] = 255;
      const A = tA[q];
      if (A < 0.999) { o[0] = o[0] * A + tB[q * 3]; o[1] = o[1] * A + tB[q * 3 + 1]; o[2] = o[2] * A + tB[q * 3 + 2]; }
      this.mouth(o, x, y, E);
      this.brows(o, x, y, i, j, E);
      this.eye(o, x, y, 1, E); this.eye(o, x, y, -1, E);
      const a = lay[q * 4 + 3];
      if (a > 0) { o[0] += (lay[q * 4] - o[0]) * a; o[1] += (lay[q * 4 + 1] - o[1]) * a; o[2] += (lay[q * 4 + 2] - o[2]) * a; }
      const p = ((B.y + j) * W + B.x + i) * 4;
      d[p] = o[0] < 0 ? 0 : o[0] > 255 ? 255 : o[0]; d[p + 1] = o[1] < 0 ? 0 : o[1] > 255 ? 255 : o[1]; d[p + 2] = o[2] < 0 ? 0 : o[2] > 255 ? 255 : o[2]; d[p + 3] = 255;
    }
    if (!r || x0 === 0 || y0 === 0 || x1 === B.w || y1 === B.h) this.gutter();
    return [B.x + x0 - 1, B.y + y0 - 1, x1 - x0 + 2, y1 - y0 + 2];
  }

  gutter() {
    const B = this.B, d = this.pix.d, W = this.pix.w;
    const cp = (sx: number, sy: number, dx: number, dy: number) => { const a = ((B.y + sy) * W + B.x + sx) * 4, b = ((B.y + dy) * W + B.x + dx) * 4; d[b] = d[a]; d[b + 1] = d[a + 1]; d[b + 2] = d[a + 2]; d[b + 3] = d[a + 3]; };
    for (let i = -1; i <= B.w; i++) { const c = Math.max(0, Math.min(B.w - 1, i)); cp(c, 0, i, -1); cp(c, B.h - 1, i, B.h); }
    for (let j = 0; j < B.h; j++) { cp(0, j, -1, j); cp(B.w - 1, j, B.w, j); }
  }

  brows(o: Float32Array, x: number, y: number, i: number, j: number, E: Expr) {
    const L = this.L, s = this.s, F = this.sp.face;
    if (F.brows === 6) return;
    if (y < L.browY - 7 * s || y > L.browY + 5 * s) return;
    const side = x >= L.cx ? 1 : -1, u = (x - L.cx) * side;
    const uni = F.brows === 4;
    const u0 = (uni ? -0.5 * s : L.browIn) - (E.furrow || 0) * 1.2 * s, u1 = L.browOut;
    const t = (u - u0) / (u1 - u0);
    if (t < -0.08 || t > 1.08) return;
    if (F.brows === 5 && side > 0 && t > 0.42 && t < 0.56) return; // split: an old cut
    const br = (E.brow || 0) * s, inn = (E.inner || 0) * s;
    const yIn = L.browY + 0.8 * s - br * 0.85 - inn + (E.furrow || 0) * 0.8 * s;
    const yPk = L.browY - L.browArch - br, yOut = L.browY + 1.4 * s - br * 0.7 - inn * 0.25;
    const tc = Math.max(0, Math.min(1, t));
    const yc = tc < 0.62 ? lerp(yIn, yPk, Math.sin(tc / 0.62 * Math.PI / 2)) : lerp(yPk, yOut, ((tc - 0.62) / 0.38) ** 1.4);
    const th = L.browTh * (1.18 - 0.72 * tc);
    const dist = Math.abs(y - yc + (tc < 0.25 ? (0.25 - tc) * 1.5 * s : 0));
    let a = sstep(th / 2 + 0.7, th / 2 - 0.3, dist) * sstep(-0.08, 0.14, t) * sstep(1.08, 0.86, t);
    if (uni) a = sstep(th / 2 + 0.7, th / 2 - 0.3, dist) * sstep(1.08, 0.86, t);
    if (a <= 0) return;
    a *= 0.62 + h2(i, j, 41) * 0.5 - (tc < 0.15 && !uni ? 0.25 : 0);
    const k = 0.75 + h2(i, j + 3, 42) * 0.4;
    const c = this.brow, bc = this.bc;
    bc[0] = c[0] * k; bc[1] = c[1] * k; bc[2] = c[2] * k;
    over(o, bc, Math.min(1, a));
  }

  eye(o: Float32Array, x: number, y: number, side: number, E: Expr) {
    const L = this.L, s = this.s, F = this.sp.face;
    const ecx = L.cx + side * L.eyeX, ecy = L.eyeY + (side > 0 ? L.lop : 0);
    const u = (x - ecx) * side, t = u / L.ew;
    if (t < -1.25 || t > 1.45 || Math.abs(y - ecy) > L.eh * 2.8 + 2) return;
    const wink = (E.wink || 0) > 0 && side > 0 ? 1 : 0;
    const open = Math.max(0, (E.upper ?? 1) * (1 - Math.max(E.blink || 0, wink)) * (F.lid === 'hooded' ? 0.86 : 1));
    const tc = Math.max(-1, Math.min(1, t));
    const sh = Math.max(0, 1 - tc * tc);
    const yC = ecy + L.tilt * 0.5 * (-tc) + (F.eyeShape === 4 ? tc * 0.6 * s : 0);
    const yClosed = yC + L.eh * 0.5 * Math.pow(sh, 0.8);
    const yTopOpen = yC - L.eh * Math.pow(sh, 0.5) * (1 + 0.12 * (0.2 - tc));
    const top = yClosed + (yTopOpen - yClosed) * Math.min(open, 1.6);
    const bot = Math.max(top, yC + L.eh * 0.55 * Math.pow(sh, 0.85) * (1 - (E.lower || 0) * 0.55));
    const mk = F.makeup || {};
    const liner = (mk.liner || 0) * s, lash = mk.lash || 0;
    const inside = t > -1 && t < 1 && y > top && y < bot + 0.15;
    if (inside && open > 0.08) {
      const ix = ecx + (E.lookX || 0) * s * 0.6, iy = ecy + (E.lookY || 0) * 0.7 * s - 0.15 * L.eh;
      const dxi = x - ix, dyi = y - iy, di = Math.sqrt(dxi * dxi + dyi * dyi), ir = L.ir;
      if (di < ir + 0.25) {
        const ring = sstep(ir * 0.55, ir + 0.2, di);
        const ic = side > 0 ? this.iris2 : this.iris;
        const lowerLight = 0.85 + 0.35 * clamp01((dyi + ir) / (2 * ir));
        o[0] = ic[0] * (1 - ring * 0.55) * lowerLight; o[1] = ic[1] * (1 - ring * 0.55) * lowerLight; o[2] = ic[2] * (1 - ring * 0.55) * lowerLight;
        if (di < ir * 0.42 && !(F.eyeShape === 7 && side > 0)) { o[0] = 16; o[1] = 12; o[2] = 12; }
        if (Math.abs(x - (ix - ir * 0.42)) < 0.62 && Math.abs(y - (iy - ir * 0.42)) < 0.62) { o[0] = 250; o[1] = 246; o[2] = 236; }
      } else {
        const corner = Math.pow(Math.abs(tc), 3);
        const k = (0.93 - corner * 0.3) * (1 - 0.35 * Math.exp(-(y - top) / 0.9));
        o[0] = 236 * k; o[1] = 228 * k; o[2] = 220 * k;
        if (t < -0.82) { o[0] = 212; o[1] = 150; o[2] = 142; }
      }
      if (y - top < 1) { o[0] *= 0.75; o[1] *= 0.72; o[2] *= 0.72; }
    }
    const lw = (open < 0.08 ? 1.1 : 0.9 + 0.7 * sstep(-0.3, 0.8, t)) * s + liner;
    if (t > -1.02 && t < 1.04 && y <= top + 0.45 && y > top - lw) over(o, INK, t < -0.75 ? 0.6 : 0.95);
    if ((lash > 0 || liner > 0) && t >= 0.85 && t < 1.15 + lash * 0.35) {
      const yw = yC - L.eh * 0.1 - (t - 0.85) * (1.2 + lash) * s;
      if (Math.abs(y - yw) < 0.55 + liner * 0.3) over(o, INK, 0.9);
    }
    if (lash > 0 && t > 0.1 && t < 0.95 && y < top - lw + 0.2 && y > top - lw - 1.0 * s && h2(Math.floor(x), Math.floor(y), 55) < lash * 0.6) over(o, INK, 0.8);
    if (t > -0.85 && t < 1 && open > 0.08) {
      if (y > bot && y < bot + 1) over(o, mk.lower ? INK : [96, 58, 54], mk.lower ? 0.85 : 0.22 + 0.18 * sstep(0, 1, t));
      if (y >= bot + 1 && y < bot + 2) over(o, [250, 230, 220], 0.07);
    }
    if (t > -0.9 && t < 1.1 && y < top - lw && y > top - lw - 3.4 * s) {
      const gap = top - lw - y;
      if (mk.shadow) over(o, mk.shadow, 0.4 * (1 - gap / (3.4 * s)));
      if (F.lid !== 'mono' && open > 0.3 && Math.abs(gap - 1.7 * s * Math.min(1, open)) < 0.55 && t > -0.55) over(o, [92, 56, 50], 0.4);
      if (F.lid === 'hooded' && gap < 1.6 * s && t > -0.4) over(o, mixc(this.skin, [120, 80, 70], 0.25), 0.5);
    }
    if (this.age > 0.5 && t > 1.12 && t < 1.65) {
      const r = (t - 1.1) * L.ew;
      for (const a of [-0.5, 0, 0.45]) if (Math.abs(y - (ecy - 0.5 * s + a * r)) < 0.4) over(o, [120, 74, 62], 0.22);
    }
  }

  mouth(o: Float32Array, x: number, y: number, E: Expr) {
    const L = this.L, s = this.s, F = this.sp.face;
    const mw = L.mouthW * (E.mouthW || 1);
    const u = (x - L.cx) / mw;
    if (u < -1.35 || u > 1.35 || y < L.mouthY - 6 * s || y > L.mouthY + 9 * s) return;
    const uc = Math.max(-1, Math.min(1, u)), sh = Math.max(0, 1 - uc * uc);
    // the creator's mouth: smirk (one corner up), downturned
    const base = F.mouth === 4 ? -0.8 : 0;
    const smirk = F.mouth === 1 ? (uc > 0 ? 1.2 : -0.2) : 0;
    const corner = ((E.corner || 0) + base + smirk) * s;
    const yLine = L.mouthY - corner * uc * uc + 0.25 * s * (E.sneer || 0) * (1 - sh);
    const open = (E.open || 0) * s * Math.pow(sh, 0.5 + (E.round || 0) * 0.35);
    const yT = yLine - open * 0.32, yB = yLine + open * 0.68;
    const upTh = L.lipU * Math.pow(sh, 0.4) * (1 - 0.28 * G(u, 0, 0.13, 1)) * (1 - ((E.corner || 0) > 1 ? 0.15 : 0));
    const loTh = L.lipL * Math.pow(sh, 0.55);
    const lip = this.lip;
    if (y > yT - upTh - 0.5 && y < yT + 0.2 && Math.abs(u) < 1.02) {
      const a = sstep(yT - upTh - 0.5, yT - upTh + 0.5, y);
      over(o, [lip[0] * 0.8, lip[1] * 0.72, lip[2] * 0.74], a * 0.92);
      if (y < yT - upTh + 0.5) over(o, [255, 232, 220], 0.1 * sh);
    }
    if (y > yB - 0.2 && y < yB + loTh + 0.5 && Math.abs(u) < 0.98) {
      const a = sstep(yB + loTh + 0.5, yB + loTh - 0.5, y);
      const hi = G(u, y - (yB + loTh * 0.42), 0.32, 0.7);
      over(o, [lip[0] * (1.02 + hi * 0.22), lip[1] * (1 + hi * 0.2), lip[2] * (1 + hi * 0.2)], a * 0.88);
    }
    if (open > 0.6 && y > yT - 0.2 && y < yB + 0.2 && Math.abs(u) < 0.98) {
      const depth = clamp01((y - yT) / Math.max(1, yB - yT));
      o[0] = 50; o[1] = 18; o[2] = 22;
      if (E.teeth && y < yT + 1.6 * s && Math.abs(u) < 0.8) {
        const kk = 0.94 - Math.abs(u) * 0.28;
        o[0] = 238 * kk; o[1] = 230 * kk; o[2] = 216 * kk;
        if (F.mouth === 5 && Math.abs(u - 0.06) < 0.07) { o[0] = 40; o[1] = 16; o[2] = 18; }
        if (F.mouth === 7 && Math.abs(u + 0.32) < 0.1) { o[0] = 220; o[1] = 176; o[2] = 70; }
      } else if (open > 3 * s && depth > 0.6) { o[0] = 156; o[1] = 64; o[2] = 68; }
      if (y < yT + 0.6) { o[0] *= 0.8; o[1] *= 0.8; o[2] *= 0.8; }
    } else if (Math.abs(y - yLine - 0.2) < 0.62 && Math.abs(u) < 1.02) {
      over(o, [62, 26, 28], 0.62 + 0.25 * (1 - sh) + 0.1 * G(u, 0, 0.3, 1));
    }
    if (Math.abs(u) > 0.95 && Math.abs(u) < 1.15 && Math.abs(y - yLine) < 0.9) over(o, [96, 50, 46], 0.4);
  }

  /** Glasses into the layer colour c (alpha c[3]); returns the new alpha. */
  glassesPx(c: Float32Array, x: number, y: number): number {
    const g = this.sp.face.glasses!, L = this.L, s = this.s;
    const side = x >= L.cx ? 1 : -1;
    const gx = L.cx + side * L.eyeX, gy = L.eyeY + 0.6 * s;
    const gog = g.kind === 'goggles';
    const hwG = L.ew + (gog ? 4 : 2.8) * s, hhG = L.eh + (g.kind === 'round' ? 3.6 : gog ? 4.2 : 2.8) * s;
    const dx = (x - gx) / hwG, dy = (y - gy) / hhG;
    const r = g.kind === 'round' ? Math.sqrt(dx * dx + dy * dy) : Math.pow(Math.pow(Math.abs(dx), 4) + Math.pow(Math.abs(dy), 4), 0.25);
    const th = (gog ? 2.6 : g.thick || 1) / Math.min(hwG, hhG), fc = g.col;
    const put = (col: C3, t: number) => { c[0] += (col[0] - c[0]) * t; c[1] += (col[1] - c[1]) * t; c[2] += (col[2] - c[2]) * t; c[3] = c[3] + (1 - c[3]) * t; };
    if (r < 1 - th) {
      if (g.kind === 'sun') { put([26, 24, 30], 0.86); put([120, 110, 140], 0.25 * clamp01(1 - (y - gy + hhG) / (hhG * 1.2))); }
      else { put(gog ? [120, 170, 200] : [190, 215, 230], gog ? 0.25 : 0.08); if (Math.abs((x - gx) + (y - gy) * 0.9 + hwG * 0.3) < 0.7 && dy < 0.2) put([255, 255, 255], 0.22); }
    } else if (r < 1 + th * 0.4) put(fc, 0.95);
    if (gog) { if (Math.abs(y - gy) < 1.2 * s && Math.abs(x - L.cx) > L.eyeX + hwG - 0.5) put([30, 30, 32], 0.95); return c[3]; }
    if (Math.abs(y - (gy - hhG * 0.45)) < 0.6 && Math.abs(x - L.cx) < L.eyeX - hwG + 0.5) put(fc, 0.9);
    if (Math.abs(y - (gy - hhG * 0.55)) < 0.6 && Math.abs(x - L.cx) > L.eyeX + hwG - 0.3) put(fc, 0.9);
    return c[3];
  }

  /** Face-pixel rects for partial repaints. */
  eyeRect() { const L = this.L, s = this.s; return [L.cx - L.eyeX - L.ew * 1.8, L.browY - 7 * s, L.cx + L.eyeX + L.ew * 1.8, L.eyeY + L.eh * 2.5 + 3 * s + L.lop]; }
  mouthRect() { const L = this.L, s = this.s; return [L.cx - L.mouthW * 1.6, L.noseY - 1 * s, L.cx + L.mouthW * 1.6, L.mouthY + 10 * s]; }
}

/** small face tattoos (creator 'face' spot) */
const FACE_TATTOO: Record<string, string[]> = {
  teardrop: ['.#.', '###', '.#.'],
  dots: ['#.#', '...', '.#.'],
  tally: ['#.#.#', '#.#.#', '#####', '#.#.#'],
  star: ['..#..', '#####', '.###.', '#...#'],
};
