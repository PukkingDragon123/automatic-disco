// Hand-drawn 2D pixel-art VFX. Every effect is a short frame-by-frame animation painted procedurally into one sprite
// atlas the way a 2D effects animator would draw it: deliberate pixel clusters, a bold dark outline, a light-from-
// top-left shade ramp and a five-colour palette per effect, smear frames on the fast beats, holds on the slow ones.
// They play as camera-facing billboards (or flat on the ground / water, or stretched along their velocity) in the fx
// layer (post.render's fxScene), with stepped timing at 24 fps ticks and dithered fades so the pixels stay hard.
//
//   vfx2d.play('impact', x, y, z, { scale: 1.2, rot: 0.4, tint: 0xffd080 })
//   vfx2d.drops(x, y, z, 6, { speed: 2, tint: 0xa02018 })      // pixel droplets that arc, fall and land
//
// `vfx2d` forwards to the live system (created by details.ts for the game); calls are no-ops when none is live.
import * as THREE from 'three';

export type VfxName = 'dust' | 'impact' | 'spark' | 'slash' | 'splash' | 'blood' | 'smoke' | 'leaves' | 'shock' | 'glint'
  | 'ripple' | 'drop' | 'poof' | 'sparkle' | 'rainhit' | 'crack';
export type LandKind = 'die' | 'splash' | 'wet' | 'blood';
export interface VfxOpts {
  /** size multiplier over the effect's natural size in metres */
  scale?: number;
  /** rotation in the screen plane (billboards) or around the up axis (flat) */
  rot?: number;
  /** multiplies the palette (tintable effects are drawn in neutral ramps) */
  tint?: number | THREE.Color;
  /** lie flat on the ground or the water instead of facing the camera */
  flat?: boolean;
  /** stretch along the velocity (droplets, streaks) */
  align?: boolean;
  /** self-lit amount 0..1 (above 1 blooms); default per effect */
  emit?: number;
  /** playback rate */
  speed?: number;
  /** world velocity, gravity, drag: sprites can fly */
  vel?: THREE.Vector3 | [number, number, number];
  grav?: number; drag?: number;
  /** spin in rad/s */
  spin?: number;
  /** seconds before it appears */
  delay?: number;
  /** what happens when a flying sprite reaches the ground */
  land?: LandKind;
  /** mirror horizontally */
  flip?: boolean;
  /** loop the animation for this many seconds instead of playing once */
  loop?: number;
}

// ------------------------------------------------------------------------------------------------ pixel painting
const OUT = 1, SHD = 2, MID = 3, LIT = 4, HI = 5;
class Grid {
  readonly d: Uint8Array;
  constructor(readonly s: number) { this.d = new Uint8Array(s * s); }
  get(x: number, y: number) { x = Math.floor(x); y = Math.floor(y); return x < 0 || y < 0 || x >= this.s || y >= this.s ? 0 : this.d[y * this.s + x]; }
  set(x: number, y: number, v: number) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.s && y < this.s) this.d[y * this.s + x] = v; }
  /** filled pixel circle around (cx, cy) in pixel units (centres at +0.5) */
  disc(cx: number, cy: number, r: number, v: number) {
    if (r < 0.6) { this.set(cx, cy, v); return; }
    const rr = r * r + r * 0.35;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= rr) this.set(x, y, v);
    }
  }
  /** an elliptical ring; keep(angle) can break it into dashes */
  ering(cx: number, cy: number, rx: number, ry: number, w: number, v: number, keep?: (a: number) => boolean) {
    const m = Math.max(rx, ry) + w + 1;
    for (let y = Math.floor(cy - m); y <= Math.ceil(cy + m); y++) for (let x = Math.floor(cx - m); x <= Math.ceil(cx + m); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.hypot(dx, dy);
      if (Math.abs(d - 1) * Math.min(rx, ry) <= w * 0.5 && (!keep || keep(Math.atan2(dy, dx)))) this.set(x, y, v);
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, v: number, w = 1) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1.5) + 1;
    for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; if (w <= 1) this.set(x, y, v); else this.disc(x, y, w * 0.5, v); }
  }
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, v: number) {
    const x0 = Math.floor(Math.min(ax, bx, cx)), x1 = Math.ceil(Math.max(ax, bx, cx)), y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
    const ar = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(ar) < 1e-6) return;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / ar, w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / ar;
      if (w0 >= -0.02 && w1 >= -0.02 && 1 - w0 - w1 >= -0.02) this.set(x, y, v);
    }
  }
  /** n-pointed star: spike k reaches rOut(k) */
  star(cx: number, cy: number, n: number, rIn: number, rOut: (k: number) => number, rot: number, v: number, sharp = 1) {
    const m = Math.ceil(Math.max(rOut(0), rOut(1)) + 2);
    for (let y = Math.floor(cy - m); y <= Math.ceil(cy + m); y++) for (let x = Math.floor(cx - m); x <= Math.ceil(cx + m); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
      const sec = ((Math.atan2(dy, dx) - rot) / (Math.PI * 2)) * n, k = Math.round(sec), fr = Math.abs(sec - k);
      const lim = rIn + (rOut(((k % n) + n) % n) - rIn) * Math.max(0, 1 - fr * 2 * sharp);
      if (r <= Math.max(rIn, lim)) this.set(x, y, v);
    }
  }
  clearBelow(y0: number) { for (let y = Math.max(0, Math.ceil(y0)); y < this.s; y++) for (let x = 0; x < this.s; x++) this.d[y * this.s + x] = 0; }
  /** light from the top left: a 1 px shadow edge on the lower right, a lit edge on the upper left (MID pixels only) */
  shade() {
    const c = this.d.slice(), s = this.s;
    const e = (x: number, y: number) => x < 0 || y < 0 || x >= s || y >= s || c[y * s + x] === 0;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      if (c[y * s + x] !== MID) continue;
      if (e(x + 1, y + 1) || (e(x + 1, y) && e(x, y + 1))) this.d[y * s + x] = SHD;
      else if (e(x - 1, y - 1) || (e(x - 1, y) && e(x, y - 1))) this.d[y * s + x] = LIT;
    }
  }
  /** a bold outline round every coloured cluster (4- or 8-connected) */
  outline(n: 4 | 8) {
    const c = this.d.slice(), s = this.s;
    const f = (x: number, y: number) => x >= 0 && y >= 0 && x < s && y < s && c[y * s + x] >= SHD;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      if (c[y * s + x] !== 0) continue;
      let hit = f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1);
      if (!hit && n === 8) hit = f(x - 1, y - 1) || f(x + 1, y - 1) || f(x - 1, y + 1) || f(x + 1, y + 1);
      if (hit) this.d[y * s + x] = OUT;
    }
  }
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const TAU = Math.PI * 2;

interface Def {
  size: number; holds: number[]; pal: number[]; m: number; tint?: number; emit?: number; flat?: boolean;
  shade?: boolean; outline?: 0 | 4 | 8;
  draw(g: Grid, f: number, n: number, R: () => number): void;
}

// ------------------------------------------------------------------------------------------------ the effects
const DEFS: Record<VfxName, Def> = {
  // a ground puff: round clumps that billow out and up from a flat base, go hollow, and crumble to specks
  dust: {
    size: 32, holds: [2, 2, 2, 3, 3, 3, 4], m: 0.6, pal: [0x4a3c34, 0x9a8a78, 0xc6b8a2, 0xe8dfcf, 0xfffaf0], shade: true, outline: 4,
    draw(g, f, n, R) {
      const t = f / (n - 1), e = easeOut(Math.min(1, t * 1.3));
      for (let i = 0; i < 6; i++) {
        const bx = (R() - 0.5) * 18, by = (R() - 0.5) * 3, r0 = 3 + R() * 3.4, rise = 2 + R() * 8, side = R() < 0.5 ? -1 : 1;
        const x = 16 + bx * (0.45 + e * 0.8) + side * e * 1.5, y = 25 + by - rise * e;
        const r = r0 * (0.55 + 0.65 * e) * (1 - sm(0.45, 1, t) * 0.8);
        if (r < 0.7) { if (t < 0.95) g.set(x, y, MID); continue; }
        g.disc(x, y, r, MID);
        // dissipating: eaten away from the upper right, a crescent of dust left hanging
        if (t > 0.55 && r > 1.6) g.disc(x + r * 0.5, y - r * 0.55, r * (0.6 + (t - 0.55) * 0.9), 0);
      }
      for (let j = 0; j < 7; j++) { const sx = 16 + (R() - 0.5) * 28, sy = 24 - R() * 16 * t; if (t > 0.45 && t < 1 && R() < 0.8) g.set(sx, sy, MID); }
      if (t < 0.5) g.clearBelow(27.5);
    },
  },
  // the hit: a white flash disc (smear), a spiky burst, the burst hollowing, spikes thrown off, specks
  impact: {
    size: 40, holds: [1, 2, 2, 2, 3, 3], m: 0.7, emit: 0.7, pal: [0x4a1406, 0xd8501a, 0xffa030, 0xffe070, 0xffffff], outline: 8,
    draw(g, f, _n, R) {
      const c = 20, rot = R() * TAU, L = [0, 1, 2, 3, 4, 5, 6, 7].map(() => 0.75 + R() * 0.25);
      if (f === 0) { g.disc(c, c, 8.5, LIT); g.disc(c, c, 6.5, HI); return; }
      if (f === 1) {
        g.star(c, c, 8, 5, (k) => (k % 2 ? 11 : 17) * L[k], rot, MID, 1.1);
        g.star(c, c, 8, 3, (k) => (k % 2 ? 7 : 11) * L[k], rot, LIT, 1.2);
        g.disc(c, c, 3.5, HI);
        return;
      }
      if (f === 2) {
        g.star(c, c, 8, 6, (k) => (k % 2 ? 12 : 19) * L[k], rot, MID, 1.6);
        g.star(c, c, 8, 4, (k) => (k % 2 ? 8 : 13) * L[k], rot, LIT, 1.7);
        g.disc(c, c, 5.5, 0);
        return;
      }
      for (let k = 0; k < 8; k++) {
        const a = rot + (k / 8) * TAU, big = k % 2 === 0, r0 = f === 3 ? (big ? 11 : 9) : f === 4 ? (big ? 15 : 12) : big ? 17 : 14;
        const len = f === 3 ? (big ? 6 : 3) : f === 4 ? (big ? 2.5 : 1) : 0;
        const x0 = c + Math.cos(a) * r0, y0 = c + Math.sin(a) * r0;
        if (len > 0) { g.line(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, LIT, f === 3 && big ? 2 : 1); if (f === 3) g.set(x0 + Math.cos(a) * (len + 0.5), y0 + Math.sin(a) * (len + 0.5), HI); }
        else if (big) g.set(x0, y0, LIT);
      }
    },
  },
  // a glint cross, then hot streaks flung out on random bearings
  spark: {
    size: 24, holds: [1, 1, 2, 2, 2], m: 0.4, emit: 1.2, pal: [0x8a2a0a, 0xe86a1a, 0xffb040, 0xfff0a0, 0xffffff], outline: 4,
    draw(g, f, _n, R) {
      const c = 12, A = [0, 1, 2, 3, 4, 5].map(() => R() * TAU), S = A.map(() => 0.7 + R() * 0.5);
      if (f === 0) { g.line(c - 7, c, c + 7, c, LIT); g.line(c, c - 7, c, c + 7, LIT); g.disc(c, c, 1.6, HI); g.line(c - 3, c, c + 3, c, HI); g.line(c, c - 3, c, c + 3, HI); return; }
      for (let k = 0; k < 6; k++) {
        const a = A[k], s = S[k], r0 = [0, 2, 5, 8.5, 10.5][f] * s, r1 = [0, 8, 10, 10, 11][f] * s;
        const x0 = c + Math.cos(a) * r0, y0 = c + Math.sin(a) * r0 + f * f * 0.15, x1 = c + Math.cos(a) * r1, y1 = c + Math.sin(a) * r1 + f * f * 0.25;
        if (f <= 2) { g.line(x0, y0, x1, y1, f === 1 ? LIT : MID); g.set(x1, y1, HI); }
        else if (k % 2 === 0 || f === 3) g.set(x1, y1, f === 3 ? LIT : MID);
      }
      if (f === 1) { g.disc(c, c, 1.5, HI); }
    },
  },
  // a crescent smear: drawn on, full thick smear frame, the tail end wiped away, broken dashes
  slash: {
    size: 48, holds: [1, 1, 2, 2, 3], m: 0.95, emit: 0.4, tint: 0xeef8ff, pal: [0x1a2236, 0x7a8aa0, 0xbcc6d4, 0xe8eef6, 0xffffff], outline: 4,
    draw(g, f) {
      const cx = 18, cy = 24, R0 = 20, a0 = -1.8, a1 = 1.8;
      const span = [[0, 0.5], [0, 1], [0.28, 1], [0.58, 1], [0.84, 1]][f], W = [4, 8.5, 6, 4, 2][f];
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy), u = (Math.atan2(dy, dx) - a0) / (a1 - a0);
        if (u < span[0] || u > span[1]) continue;
        const uu = (u - span[0]) / Math.max(0.01, span[1] - span[0]);
        const th = W * Math.pow(Math.sin(Math.PI * Math.min(1, uu * 0.85 + 0.08)), 0.7) * (f === 0 ? sm(0, 0.4, uu) * 0.6 + 0.4 : 1);
        if (r > R0 || r < R0 - th) continue;
        if (f >= 3 && Math.floor(u * 22) % 3 === 0) continue;
        g.set(x, y, r > R0 - 1.3 ? HI : r > R0 - th * 0.55 ? LIT : MID);
      }
      // speed lines inside the arc on the smear frames
      if (f === 1 || f === 2) for (const [rr, s0, s1] of [[R0 - 11, 0.3, 0.75], [R0 - 14, 0.45, 0.68]]) {
        for (let k = 0; k <= 40; k++) { const u = s0 + (s1 - s0) * (k / 40), a = a0 + (a1 - a0) * u; g.set(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, LIT); }
      }
    },
  },
  // a water crown: dome, spikes thrown up with beads on their tips, collapse, a spreading ring, droplets landing
  splash: {
    size: 40, holds: [1, 2, 2, 2, 2, 3, 3, 4], m: 0.8, pal: [0x123a5a, 0x3a86b8, 0x78c6ea, 0xc6f0fc, 0xffffff], shade: true, outline: 4,
    draw(g, f, _n, R) {
      const cx = 20, by = 33;
      const X = [-9, -5, 0, 5, 9], J = X.map(() => (R() - 0.5) * 2), D = X.map(() => 0.8 + R() * 0.5);
      if (f === 0) { g.disc(cx, by - 1, 5, MID); g.clearBelow(by + 0.5); g.ering(cx, by, 7, 2, 1.2, LIT); return; }
      const H = [[0], [8, 12, 14, 12, 8], [10, 15, 18, 15, 10], [8, 11, 13, 11, 8], [4, 6, 7, 6, 4], [1, 2, 2, 2, 1], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]][f];
      const spread = [1, 1, 1.15, 1.3, 1.45, 1.6, 1.7, 1.8][f];
      if (f <= 5) {
        const rx = [0, 10, 12, 13, 14, 15][f];
        g.disc(cx, by, f <= 3 ? 3 : 2, MID);
        for (let k = 0; k < 5; k++) {
          const h = H[k] * D[k]; if (h < 1) continue;
          const x = cx + X[k] * spread * 0.85 + J[k], lean = X[k] * (f >= 3 ? 0.35 : 0.12);
          g.tri(x - 2, by, x + 2, by, x + lean, by - h, MID);
        }
        g.ering(cx, by, rx, 2.6, 2, MID);
      }
      if (f >= 5) g.ering(cx, by, [0, 0, 0, 0, 0, 15, 17, 19][f], [0, 0, 0, 0, 0, 3.5, 4, 4.4][f], f === 7 ? 1 : 1.6, LIT, f >= 6 ? (a) => Math.floor((a + 4) * 3.2) % 3 !== 0 : undefined);
      // beads: thrown from the tips, arcing out and falling back
      if (f >= 1 && f <= 6) for (let k = 0; k < 5; k++) {
        const tt = (f - 1) / 5, x = cx + X[k] * (1 + tt * 1.1) + J[k], h0 = 18 * D[k];
        const y = by - h0 * (0.6 + Math.sin(Math.min(1, tt * 1.15) * Math.PI) * 0.75) + (f >= 5 ? (f - 4) * 5 : 0);
        if (y < by) g.disc(x, Math.min(by - 1, y), f <= 3 ? 1.3 : 0.7, f <= 2 ? HI : MID);
      }
      g.clearBelow(by + (f >= 5 ? 5 : 3));
    },
  },
  // stylised splat: a burst blob, beads and teardrops flung out, falling and thinning (neutral ramp, tinted)
  blood: {
    size: 32, holds: [1, 2, 2, 2, 3, 3], m: 0.6, tint: 0xc02818, pal: [0x140c0e, 0x6e6e6e, 0xaaaaaa, 0xdedede, 0xffffff], shade: true, outline: 4,
    draw(g, f, _n, R) {
      const c = 16, A = [0, 1, 2, 3, 4, 5, 6].map(() => R() * TAU), S = A.map(() => 0.7 + R() * 0.6), Z = A.map(() => 0.8 + R() * 0.8);
      if (f === 0) { g.disc(c, c, 5, MID); for (let k = 0; k < 3; k++) g.disc(c + Math.cos(A[k]) * 4, c + Math.sin(A[k]) * 4, 2.5, MID); g.set(c - 2, c - 2, HI); return; }
      if (f <= 2) { const r = f === 1 ? 4 : 2.5; g.disc(c, c, r, MID); g.disc(c + 1.5, c + 1, r - 1, MID); }
      for (let k = 0; k < 7; k++) {
        const d = [0, 8, 11, 13, 14, 14.5][f] * S[k], fall = [0, 0, 1, 3, 6, 9][f];
        const x = c + Math.cos(A[k]) * d, y = c + Math.sin(A[k]) * d + fall;
        const r = [0, 2.2, 1.6, 1.2, 0.8, 0.5][f] * Z[k];
        if (f === 2) g.line(c + Math.cos(A[k]) * d * 0.6, c + Math.sin(A[k]) * d * 0.6 + fall * 0.5, x, y, MID);
        if (f === 5 && k % 2) continue;
        g.disc(x, y, r, MID);
      }
    },
  },
  // a smoke curl: puffs rising on a spiral, going hollow, a hooked wisp at the top
  smoke: {
    size: 32, holds: [2, 2, 2, 2, 3, 3, 3, 4, 4], m: 0.7, pal: [0x26262c, 0x66666e, 0x9a9aa2, 0xc8c8ce, 0xf0f0f4], shade: true, outline: 4,
    draw(g, f, n, R) {
      const t = f / (n - 1);
      let tx = 16, ty = 28;
      for (let i = 0; i < 5; i++) {
        const ph = R() * TAU, sz = 2 + R() * 2.2, jx = (R() - 0.5) * 4;
        const tt = Math.min(1, Math.max(0, (t - i * 0.07) / 0.85));
        if (tt <= 0) continue;
        const x = 16 + jx + Math.sin(tt * 4.2 + ph) * 4 * tt, y = 28 - tt * 21 - i * 1.2;
        const r = sz * (0.6 + tt * 1.3) * (1 - sm(0.7, 1, tt) * 0.7);
        if (r < 0.7) { g.set(x, y, MID); continue; }
        g.disc(x, y, r, MID);
        if (tt > 0.5 && r > 1.6) g.disc(x + r * 0.5, y - r * 0.5, r * (0.55 + (tt - 0.5) * 0.9), 0);
        if (y < ty) { ty = y; tx = x; }
      }
      if (t > 0.3 && t < 0.95) { const rr = 2.5 + t * 2; for (let k = 0; k <= 14; k++) { const a = Math.PI * 0.6 + (k / 14) * Math.PI * 1.3; g.set(tx + 2 + Math.cos(a) * rr, ty - 3 + Math.sin(a) * rr, MID); } }
    },
  },
  // a flurry of tumbling leaves: each flips through face-on, three-quarter, edge-on
  leaves: {
    size: 32, holds: [2, 2, 2, 2, 2, 2, 3, 3], m: 0.8, pal: [0x16301a, 0x2e7a34, 0x5cb84a, 0xa2e070, 0xe0ffb0], outline: 4,
    draw(g, f, n, R) {
      const t = f / (n - 1);
      for (let i = 0; i < 6; i++) {
        const x0 = 16 + (R() - 0.5) * 8, vx = (R() - 0.5) * 22, up = 8 + R() * 8, ph = R() * TAU, o0 = Math.floor(R() * 4);
        const x = x0 + vx * easeOut(t) + Math.sin(t * 9 + ph) * 2.5, y = 24 - up * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) + t * t * 10;
        leaf(g, x, y, (o0 + f) % 4);
      }
    },
  },
  // ground shockwave: a bright core, a ring tearing outward over radial cracks, breaking into dashes and grit
  shock: {
    size: 64, holds: [1, 2, 2, 2, 3, 3, 4], m: 1.6, flat: true, pal: [0x3a2a1c, 0x7a6248, 0xb09670, 0xe0d0a8, 0xfff8e0], outline: 4,
    draw(g, f, _n, R) {
      const c = 32, A = [0, 1, 2, 3, 4, 5, 6].map((k) => (k / 7) * TAU + R() * 0.6), Lc = A.map(() => 12 + R() * 8), J = A.map(() => [R(), R(), R(), R()]);
      if (f === 0) { g.disc(c, c, 6, HI); g.ering(c, c, 7.5, 7.5, 1.5, LIT); return; }
      const rr = [0, 12, 18, 23, 27, 29, 30][f], w = [0, 4, 3, 2, 1.5, 1, 1][f];
      // cracks: jagged dark lines (no outline) out to the ring, shrinking back in the late frames
      const reach = Math.min(rr, f >= 4 ? Lc[0] * (1 - (f - 4) * 0.3) : 99);
      for (let k = 0; k < 7; k++) {
        let px = c, py = c; const L = Math.min(Lc[k], reach);
        for (let s = 1; s <= 4; s++) {
          const d = (L * s) / 4, a = A[k] + (J[k][s - 1] - 0.5) * 0.5;
          const nx = c + Math.cos(a) * d, ny = c + Math.sin(a) * d;
          g.line(px, py, nx, ny, OUT); px = nx; py = ny;
        }
      }
      const keep = f >= 3 ? (a: number) => Math.floor((a + 4) * (f >= 5 ? 5 : 3.5)) % (f >= 5 ? 3 : 4) !== 0 : undefined;
      g.ering(c, c, rr, rr, w, f <= 2 ? LIT : MID, keep);
      if (f <= 2) g.ering(c, c, rr - w * 0.6, rr - w * 0.6, 1, HI, keep);
      if (f >= 2) for (let k = 0; k < 9; k++) { const a = R() * TAU, d = rr + 2 + R() * 3; if (f < 6 || k % 2) g.set(c + Math.cos(a) * d, c + Math.sin(a) * d, MID); }
    },
  },
  // a four-point twinkle
  glint: {
    size: 16, holds: [2, 2, 3, 2, 2], m: 0.28, emit: 1.6, pal: [0xc0904a, 0xffd080, 0xfff0c0, 0xfffff0, 0xffffff], outline: 0,
    draw(g, f) {
      const c = 8, arm = [1, 3, 6, 4, 1][f];
      g.line(c - arm, c, c + arm, c, MID); g.line(c, c - arm, c, c + arm, MID);
      if (arm > 2) { g.line(c - arm + 2, c, c + arm - 2, c, LIT); g.line(c, c - arm + 2, c, c + arm - 2, LIT); }
      if (f === 2) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.set(c + dx * 2, c + dy * 2, SHD); }
      g.set(c, c, HI); if (arm >= 3) { g.set(c - 1, c, HI); g.set(c + 1, c, HI); g.set(c, c - 1, HI); g.set(c, c + 1, HI); }
    },
  },
  // rings spreading on water (flat): a crisp leading ring with a softer one behind, breaking up as they fade
  ripple: {
    size: 48, holds: [3, 3, 3, 3, 3, 4, 4, 4], m: 1.0, flat: true, pal: [0x000000, 0x5a9ac0, 0x8acbe8, 0xcff2ff, 0xffffff], outline: 0,
    draw(g, f) {
      const c = 24, r = 3 + f * 2.7;
      const keep = f >= 5 ? (a: number) => Math.floor((a + 4) * (f >= 7 ? 5 : 4)) % 3 !== 0 : undefined;
      g.ering(c, c, r, r, 1.2, f <= 2 ? HI : LIT, keep);
      if (f >= 2) g.ering(c, c, r - 5, r - 5, 1, f <= 4 ? LIT : MID, keep);
      if (f >= 4 && f <= 6) g.ering(c, c, r - 10, r - 10, 1, MID, (a) => Math.floor((a + 4) * 4) % 2 === 0);
    },
  },
  // one bead of water (neutral, tinted pale blue): stretched along its fall when aligned
  drop: {
    size: 8, holds: [4], m: 0.075, tint: 0xd0ecff, pal: [0x1c2c3c, 0x8aa4b8, 0xc4d6e4, 0xeef6fc, 0xffffff], outline: 4,
    draw(g) { g.disc(4, 5, 1.6, MID); g.set(4, 2, MID); g.set(4, 3, MID); g.set(3, 4, LIT); g.set(3, 5, HI); g.set(5, 6, SHD); },
  },
  // a death poof: a burst cloud, a ring of puffs blown outward, hollowing, specks
  poof: {
    size: 48, holds: [1, 2, 2, 2, 3, 3, 3, 4], m: 1.0, pal: [0x34343e, 0x86868f, 0xb8b8c0, 0xe2e2e8, 0xffffff], shade: true, outline: 4,
    draw(g, f, _n, R) {
      const c = 24, A = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k / 8) * TAU + (R() - 0.5) * 0.5), S = A.map(() => 0.85 + R() * 0.3);
      if (f === 0) { g.disc(c, c, 9, LIT); g.disc(c - 1, c - 1, 6, HI); return; }
      const rr = [0, 8, 13, 17, 19, 21, 22, 23][f], pr = [0, 4.5, 5, 5, 4, 3, 2, 0.6][f], cr = [0, 9, 7, 4, 0, 0, 0, 0][f];
      if (cr > 0) g.disc(c, c, cr, MID);
      for (let k = 0; k < 8; k++) {
        const x = c + Math.cos(A[k]) * rr * S[k], y = c + Math.sin(A[k]) * rr * S[k] - f * 0.6;
        g.disc(x, y, pr * S[k], MID);
        if (f >= 3 && pr > 1.5) g.disc(x + Math.cos(A[k]) * pr * 0.55, y + Math.sin(A[k]) * pr * 0.55 - pr * 0.3, pr * S[k] * (0.5 + (f - 3) * 0.15), 0);
      }
    },
  },
  // twinkling plus-sparkles rising (neutral, tinted)
  sparkle: {
    size: 24, holds: [2, 2, 2, 2, 2, 3], m: 0.5, emit: 1.3, tint: 0xfff0a0, pal: [0x50505c, 0xa8a8b4, 0xd4d4e0, 0xf4f4ff, 0xffffff], outline: 0,
    draw(g, f, _n, R) {
      for (let i = 0; i < 4; i++) {
        const x = 5 + R() * 14, y0 = 18 - R() * 6, off = Math.floor(R() * 3), sz = [0, 1, 2, 3, 2, 1, 0, 0, 0][f + off] ?? 0;
        const y = y0 - f * 1.6;
        if (!sz) continue;
        g.line(x - sz, y, x + sz, y, sz > 1 ? LIT : MID); g.line(x, y - sz, x, y + sz, sz > 1 ? LIT : MID); g.set(x, y, HI);
      }
    },
  },
  // a raindrop hitting the ground: two beads hop up, a tiny ring
  rainhit: {
    size: 12, holds: [1, 2, 2, 2], m: 0.17, pal: [0x1c3c5a, 0x6aa6cc, 0xa8d8f0, 0xdaf4ff, 0xffffff], outline: 0,
    draw(g, f) {
      const c = 6, by = 9;
      if (f === 0) { g.set(c, by, HI); g.set(c - 1, by, LIT); g.set(c + 1, by, LIT); return; }
      const h = [0, 3, 4, 2][f], dx = [0, 2, 3, 4][f];
      if (f < 3) { g.set(c - dx, by - h, HI); g.set(c + dx, by - h + 1, HI); g.set(c - dx, by - h + 1, MID); }
      g.ering(c, by, [0, 2, 3.5, 4.5][f], [0, 0.9, 1.3, 1.6][f], 1, f === 3 ? MID : LIT, f === 3 ? (a) => Math.floor((a + 4) * 3) % 2 === 0 : undefined);
    },
  },
  // a ground crack decal-ish burst (flat): jagged dark fissures that stay a moment and close
  crack: {
    size: 48, holds: [1, 6, 6, 4, 3], m: 1.0, flat: true, pal: [0x1a120c, 0x5a4634, 0x8a7254, 0xc0a880, 0xffe8b0], outline: 0,
    draw(g, f, _n, R) {
      const c = 24, k0 = 6;
      for (let k = 0; k < k0; k++) {
        const a0 = (k / k0) * TAU + R() * 0.8, L = 12 + R() * 9, J = [R(), R(), R(), R(), R()], br = R();
        const len = L * [0.5, 1, 1, 0.7, 0.4][f];
        let px = c, py = c;
        for (let s = 1; s <= 5; s++) {
          const d = (len * s) / 5, a = a0 + (J[s - 1] - 0.5) * 0.7, nx = c + Math.cos(a) * d, ny = c + Math.sin(a) * d;
          g.line(px, py, nx, ny, OUT, s <= 2 && f <= 2 ? 2 : 1);
          if (s === 1) { g.set(nx + 1, ny, MID); }
          if (s === 3 && br < 0.6 && f >= 1) g.line(nx, ny, nx + Math.cos(a + 0.9) * 4, ny + Math.sin(a + 0.9) * 4, OUT);
          px = nx; py = ny;
        }
      }
      if (f <= 1) { g.disc(c, c, 3, OUT); g.set(c - 3, c - 3, HI); g.set(c + 3, c - 2, LIT); }
    },
  },
};

function leaf(g: Grid, x: number, y: number, o: number) {
  x = Math.round(x); y = Math.round(y);
  if (o === 0) { for (let i = -2; i <= 2; i++) g.set(x + i, y, MID); g.set(x - 1, y - 1, LIT); g.set(x, y - 1, LIT); g.set(x + 1, y - 1, MID); g.set(x, y + 1, SHD); g.set(x - 1, y + 1, SHD); g.set(x + 3, y, OUT); }
  else if (o === 1) { for (let i = -2; i <= 2; i++) g.set(x + i, y - i, MID); g.set(x - 1, y, LIT); g.set(x, y - 1, LIT); g.set(x, y + 1, SHD); g.set(x + 1, y, SHD); }
  else if (o === 2) { for (let i = -2; i <= 2; i++) g.set(x, y + i, MID); g.set(x + 1, y - 1, LIT); g.set(x + 1, y, MID); g.set(x - 1, y + 1, SHD); g.set(x, y + 3, OUT); }
  else { for (let i = -2; i <= 2; i++) g.set(x + i, y, i === 0 ? LIT : SHD); }
}

// ------------------------------------------------------------------------------------------------ atlas
interface Frames { uv: Float32Array; cum: Float32Array; ticks: number; m: number; tint: THREE.Color; emit: number; flat: boolean }
let ATLAS: { tex: THREE.DataTexture; fx: Record<VfxName, Frames>; w: number; h: number } | null = null;

function srgbToLin(c: number) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }

function buildAtlas() {
  if (ATLAS) return ATLAS;
  const W = 1024;
  // shelf packing by size (largest first)
  const names = (Object.keys(DEFS) as VfxName[]).sort((a, b) => DEFS[b].size - DEFS[a].size);
  type Slot = { n: VfxName; f: number; x: number; y: number; s: number };
  const slots: Slot[] = [];
  let x = 0, y = 0, rowH = 0;
  for (const n of names) {
    const d = DEFS[n];
    for (let f = 0; f < d.holds.length; f++) {
      if (x + d.size > W) { x = 0; y += rowH + 1; rowH = 0; }
      slots.push({ n, f, x, y, s: d.size });
      x += d.size + 1; rowH = Math.max(rowH, d.size);
    }
  }
  let H = 64; while (H < y + rowH + 1) H *= 2;
  const data = new Uint8Array(W * H * 4);
  const fx = {} as Record<VfxName, Frames>;
  for (const n of names) {
    const d = DEFS[n], nf = d.holds.length;
    const cum = new Float32Array(nf); let acc = 0;
    d.holds.forEach((h, i) => { acc += h; cum[i] = acc; });
    fx[n] = { uv: new Float32Array(nf * 4), cum, ticks: acc, m: d.m, tint: new THREE.Color(d.tint ?? 0xffffff), emit: d.emit ?? 0, flat: !!d.flat };
  }
  const seedOf = (n: string) => { let h = 2166136261; for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 16777619); return h >>> 0; };
  for (const sl of slots) {
    const d = DEFS[sl.n], g = new Grid(sl.s);
    d.draw(g, sl.f, d.holds.length, rng(seedOf(sl.n)));
    if (d.shade) g.shade();
    if (d.outline) g.outline(d.outline);
    const pal = d.pal;
    for (let py = 0; py < sl.s; py++) for (let px = 0; px < sl.s; px++) {
      const v = g.d[py * sl.s + px]; if (!v) continue;
      const col = pal[v - 1];
      // atlas rows run bottom-up (v = 0 at the bottom), sprite rows top-down
      const o = ((sl.y + sl.s - 1 - py) * W + sl.x + px) * 4;
      data[o] = (col >> 16) & 255; data[o + 1] = (col >> 8) & 255; data[o + 2] = col & 255; data[o + 3] = 255;
    }
    const F = fx[sl.n];
    F.uv.set([sl.x / W, sl.y / H, (sl.x + sl.s) / W, (sl.y + sl.s) / H], sl.f * 4);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  void srgbToLin;
  ATLAS = { tex, fx, w: W, h: H };
  return ATLAS;
}

// ------------------------------------------------------------------------------------------------ renderer
const VERT = /* glsl */`
attribute vec3 aPos; attribute vec4 aSR; attribute vec4 aUV; attribute vec4 aCol; attribute vec3 aVel;
varying vec2 vUv; varying vec4 vCol; varying float vA; varying vec2 vTex;
uniform vec2 uAtlas;
void main() {
  vec2 q = position.xy;
  float s = aSR.x, r = aSR.y, mode = aSR.z;
  float c = cos(r), sn = sin(r);
  vec2 qr = vec2(q.x * c - q.y * sn, q.x * sn + q.y * c) * s;
  vec4 mv;
  if (mode > 0.5 && mode < 1.5) {
    // flat on the ground or the water
    mv = viewMatrix * vec4(aPos + vec3(qr.x, 0.0, -qr.y), 1.0);
  } else if (mode > 1.5) {
    // stretched along the screen-space velocity
    vec4 c0 = viewMatrix * vec4(aPos, 1.0);
    vec3 vv = (viewMatrix * vec4(aVel, 0.0)).xyz;
    float l = length(vv.xy);
    vec2 d = l > 1e-4 ? vv.xy / l : vec2(0.0, 1.0);
    float st = 1.0 + min(l * 0.12, 1.6);
    mv = c0 + vec4(vec2(d.y, -d.x) * q.x * s + d * q.y * s * st, 0.0, 0.0);
  } else {
    mv = viewMatrix * vec4(aPos, 1.0);
    mv.xy += qr;
    // pulled toward the eye so a puff sitting on the ground is not cut in half by it
    mv.xyz += normalize(-mv.xyz) * s * 0.5;
  }
  gl_Position = projectionMatrix * mv;
  vec2 t = position.xy + 0.5;
  if (aCol.a < 0.0) t.x = 1.0 - t.x;
  vUv = mix(aUV.xy, aUV.zw, t);
  vTex = vUv * uAtlas;
  vCol = vec4(aCol.rgb, abs(aCol.a) - 1.0);
  vA = aSR.w;
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap; uniform vec3 uLight;
varying vec2 vUv; varying vec4 vCol; varying float vA; varying vec2 vTex;
float bayer(vec2 p) {
  vec2 f = mod(floor(p), 4.0);
  float b = mod(f.x * 2.0 + f.y * 3.0 + floor(f.x * 0.5) * 5.0 + floor(f.y * 0.5) * 7.0 + f.x * f.y * 4.0, 16.0);
  return (b + 0.5) / 16.0;
}
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  // fades dissolve whole sprite pixels (an ordered dither in atlas texels), never translucency
  if (vA < 0.999 && bayer(vTex) > vA) discard;
  float e = vCol.a;
  vec3 c = t.rgb * vCol.rgb * mix(uLight, vec3(1.0 + max(0.0, e - 1.0) * 1.5), clamp(e, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

const MAX = 1400;
const _c = new THREE.Color();

export class Vfx2D {
  readonly mesh: THREE.Mesh;
  /** multiplies unlit sprites: the scene's light (set per frame from the sun and sky) */
  readonly light = new THREE.Color(1, 1, 1);
  /** ground height for sprites that fly and land */
  ground: ((x: number, z: number) => number) | null = null;
  /** a flying sprite reached the ground (splash rings, wet spots: details.ts) */
  onLand: ((x: number, y: number, z: number, kind: LandKind, size: number, tint: THREE.Color) => void) | null = null;
  private geo: THREE.InstancedBufferGeometry;
  private A: { pos: THREE.InstancedBufferAttribute; sr: THREE.InstancedBufferAttribute; uv: THREE.InstancedBufferAttribute; col: THREE.InstancedBufferAttribute; vel: THREE.InstancedBufferAttribute };
  private n = 0;
  // per-sprite state
  private fx: Frames[] = [];
  private p = new Float32Array(MAX * 3); private v = new Float32Array(MAX * 3);
  private grav = new Float32Array(MAX); private drag = new Float32Array(MAX);
  private t = new Float32Array(MAX); private dur = new Float32Array(MAX); private rate = new Float32Array(MAX); private loop = new Float32Array(MAX);
  private size = new Float32Array(MAX); private rot = new Float32Array(MAX); private spin = new Float32Array(MAX);
  private mode = new Uint8Array(MAX); private land = new Uint8Array(MAX); private flip = new Uint8Array(MAX);
  private col = new Float32Array(MAX * 4);
  private atlas = buildAtlas();

  constructor(fxScene: THREE.Scene) {
    const g = (this.geo = new THREE.InstancedBufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const mk = (k: number) => new THREE.InstancedBufferAttribute(new Float32Array(MAX * k), k).setUsage(THREE.DynamicDrawUsage);
    this.A = { pos: mk(3), sr: mk(4), uv: mk(4), col: mk(4), vel: mk(3) };
    g.setAttribute('aPos', this.A.pos); g.setAttribute('aSR', this.A.sr); g.setAttribute('aUV', this.A.uv); g.setAttribute('aCol', this.A.col); g.setAttribute('aVel', this.A.vel);
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true,
      uniforms: { uMap: { value: this.atlas.tex }, uLight: { value: this.light }, uAtlas: { value: new THREE.Vector2(this.atlas.w, this.atlas.h) } },
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    fxScene.add(this.mesh);
  }

  /** natural size of an effect in metres */
  sizeOf(name: VfxName) { return this.atlas.fx[name].m; }

  play(name: VfxName, x: number, y: number, z: number, o: VfxOpts = {}): number {
    const F = this.atlas.fx[name];
    if (!F) return -1;
    let i = this.n;
    if (i >= MAX) i = Math.floor(Math.random() * MAX); else this.n++;
    this.fx[i] = F;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    const vel = o.vel;
    if (vel) { if (Array.isArray(vel)) { this.v[i * 3] = vel[0]; this.v[i * 3 + 1] = vel[1]; this.v[i * 3 + 2] = vel[2]; } else { this.v[i * 3] = vel.x; this.v[i * 3 + 1] = vel.y; this.v[i * 3 + 2] = vel.z; } }
    else { this.v[i * 3] = this.v[i * 3 + 1] = this.v[i * 3 + 2] = 0; }
    this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 0;
    this.rate[i] = (o.speed ?? 1) * 24;
    this.t[i] = -(o.delay ?? 0) * this.rate[i];
    this.loop[i] = o.loop ? o.loop * this.rate[i] : 0;
    this.dur[i] = F.ticks;
    this.size[i] = F.m * (o.scale ?? 1);
    this.rot[i] = o.rot ?? 0; this.spin[i] = o.spin ?? 0;
    this.mode[i] = o.align ? 2 : (o.flat ?? F.flat) ? 1 : 0;
    this.land[i] = o.land === 'die' ? 1 : o.land === 'splash' ? 2 : o.land === 'wet' ? 3 : o.land === 'blood' ? 4 : 0;
    this.flip[i] = o.flip ? 1 : 0;
    if (o.tint === undefined) _c.copy(F.tint); else if (typeof o.tint === 'number') _c.set(o.tint); else _c.copy(o.tint);
    this.col[i * 4] = _c.r; this.col[i * 4 + 1] = _c.g; this.col[i * 4 + 2] = _c.b; this.col[i * 4 + 3] = o.emit ?? F.emit;
    return i;
  }

  /** pixel droplets thrown up and out from a point; they arc, fall and land (ripples on water, wet spots on ground) */
  drops(x: number, y: number, z: number, n: number, o: { speed?: number; up?: number; tint?: number; land?: LandKind; scale?: number; spread?: number } = {}) {
    const sp = o.speed ?? 1.6, up = o.up ?? 2.4, sc = o.scale ?? 1, spr = o.spread ?? 0.06;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, s = sp * (0.35 + Math.random() * 0.8);
      this.play('drop', x + Math.cos(a) * spr, y, z + Math.sin(a) * spr, { vel: [Math.cos(a) * s, up * (0.55 + Math.random() * 0.7), Math.sin(a) * s], grav: 9.8, align: true, scale: sc * (0.7 + Math.random() * 0.6), tint: o.tint, land: o.land ?? 'splash', loop: 3 });
    }
  }

  clear() { this.n = 0; this.geo.instanceCount = 0; }

  update(dt: number) {
    const A = this.A, pos = A.pos.array as Float32Array, sr = A.sr.array as Float32Array, uv = A.uv.array as Float32Array, col = A.col.array as Float32Array, vel = A.vel.array as Float32Array;
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const F = this.fx[i];
      this.t[i] += dt * this.rate[i];
      let t = this.t[i];
      const k3 = i * 3;
      let dead = this.loop[i] > 0 ? t >= this.loop[i] : t >= this.dur[i];
      if (t >= 0 && !dead) {
        // flight
        if (this.grav[i] || this.v[k3] || this.v[k3 + 1] || this.v[k3 + 2]) {
          this.v[k3 + 1] -= this.grav[i] * dt;
          if (this.drag[i]) { const d = Math.max(0, 1 - this.drag[i] * dt); this.v[k3] *= d; this.v[k3 + 1] *= d; this.v[k3 + 2] *= d; }
          this.p[k3] += this.v[k3] * dt; this.p[k3 + 1] += this.v[k3 + 1] * dt; this.p[k3 + 2] += this.v[k3 + 2] * dt;
          if (this.land[i] && this.ground && this.v[k3 + 1] < 0) {
            const gy = this.ground(this.p[k3], this.p[k3 + 2]);
            if (this.p[k3 + 1] <= gy) {
              dead = true;
              if (this.land[i] > 1 && this.onLand) { _c.setRGB(this.col[i * 4], this.col[i * 4 + 1], this.col[i * 4 + 2]); this.onLand(this.p[k3], gy, this.p[k3 + 2], (['die', 'die', 'splash', 'wet', 'blood'] as LandKind[])[this.land[i]], this.size[i], _c); }
            }
          }
        }
        this.rot[i] += this.spin[i] * dt;
      }
      if (dead) continue;
      // compact the live list in place (w <= i)
      if (w !== i) this.move(i, w);
      if (t < 0) { sr[w * 4] = 0; w++; continue; }
      if (this.loop[i] > 0) t = t % F.ticks;
      let f = 0; while (f < F.cum.length - 1 && t >= F.cum[f]) f++;
      pos[w * 3] = this.p[w * 3]; pos[w * 3 + 1] = this.p[w * 3 + 1]; pos[w * 3 + 2] = this.p[w * 3 + 2];
      vel[w * 3] = this.v[w * 3]; vel[w * 3 + 1] = this.v[w * 3 + 1]; vel[w * 3 + 2] = this.v[w * 3 + 2];
      // the last frame dissolves over its hold
      const last = f === F.cum.length - 1 && !this.loop[w] ? 1 - (t - (f ? F.cum[f - 1] : 0)) / Math.max(1, F.cum[f] - (f ? F.cum[f - 1] : 0)) : 1;
      sr[w * 4] = this.size[w]; sr[w * 4 + 1] = this.rot[w]; sr[w * 4 + 2] = this.mode[w]; sr[w * 4 + 3] = f === F.cum.length - 1 && !this.loop[w] ? 0.25 + last * 0.75 : 1;
      uv[w * 4] = F.uv[f * 4]; uv[w * 4 + 1] = F.uv[f * 4 + 1]; uv[w * 4 + 2] = F.uv[f * 4 + 2]; uv[w * 4 + 3] = F.uv[f * 4 + 3];
      col[w * 4] = this.col[w * 4]; col[w * 4 + 1] = this.col[w * 4 + 1]; col[w * 4 + 2] = this.col[w * 4 + 2];
      col[w * 4 + 3] = (this.col[w * 4 + 3] + 1) * (this.flip[w] ? -1 : 1);
      w++;
    }
    this.n = w;
    this.geo.instanceCount = w;
    for (const a of [A.pos, A.sr, A.uv, A.col, A.vel]) { a.clearUpdateRanges(); a.addUpdateRange(0, w * a.itemSize); a.needsUpdate = true; }
  }
  private move(i: number, w: number) {
    this.fx[w] = this.fx[i];
    for (let k = 0; k < 3; k++) { this.p[w * 3 + k] = this.p[i * 3 + k]; this.v[w * 3 + k] = this.v[i * 3 + k]; }
    for (let k = 0; k < 4; k++) this.col[w * 4 + k] = this.col[i * 4 + k];
    this.grav[w] = this.grav[i]; this.drag[w] = this.drag[i]; this.t[w] = this.t[i]; this.dur[w] = this.dur[i]; this.rate[w] = this.rate[i]; this.loop[w] = this.loop[i];
    this.size[w] = this.size[i]; this.rot[w] = this.rot[i]; this.spin[w] = this.spin[i]; this.mode[w] = this.mode[i]; this.land[w] = this.land[i]; this.flip[w] = this.flip[i];
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); (this.mesh.material as THREE.Material).dispose(); if (LIVE === this) LIVE = null; }
}

let LIVE: Vfx2D | null = null;
/** make a system the one `vfx2d` forwards to */
export function setLiveVfx(v: Vfx2D | null) { LIVE = v; }
/** the shared entry point: `vfx2d.play('dust', x, y, z, { scale: 1.5 })` from any system; no-op without a live game */
export const vfx2d = {
  play(name: VfxName, x: number, y: number, z: number, o?: VfxOpts): number { return LIVE ? LIVE.play(name, x, y, z, o) : -1; },
  drops(x: number, y: number, z: number, n: number, o?: Parameters<Vfx2D['drops']>[4]) { LIVE?.drops(x, y, z, n, o); },
  sizeOf(name: VfxName) { return LIVE?.sizeOf(name) ?? 1; },
  get live(): Vfx2D | null { return LIVE; },
};
/** the atlas, for previews and tests */
export function vfxAtlas() { return buildAtlas(); }
