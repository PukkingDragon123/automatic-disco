// Hand-drawn 2D pixel-art VFX (ART.md "2D pixel art"). Every effect is a short frame-by-frame animation painted into
// one sprite atlas the way an effects animator draws it: silhouettes are drawn polygons (lumpy clusters with angular
// facets, irregular bursts, teardrop beads, broken arcs), never circles; shading is planar (each facet one ramp step,
// light from the upper left, a single highlight pixel where the form turns); a selective outline (darkest step on the
// shadow side, a lighter one on the lit side); smear frames on the fast beats and holds on the slow ones. The atlas
// stores ramp steps, not colours: every pixel is a step of a master-palette ramp (src/art/palette.ts) picked per
// sprite. They play as camera-facing billboards (or flat on the ground / water, or stretched along their velocity) in
// the fx layer (post.render's fxScene), stepped at 24 fps ticks.
//
//   vfx2d.play('impact', x, y, z, { scale: 1.2, rot: 0.4 })
//   vfx2d.play('dust', x, y, z, { ramp: 'sand' })            // any RAMPS name; `tint: 0xRRGGBB` picks the nearest ramp
//   vfx2d.drops(x, y, z, 6, { speed: 2, ramp: 'blood' })      // pixel beads that arc, fall and land
//
// `vfx2d` forwards to the live system (created by details.ts for the game); calls are no-ops when none is live.
import * as THREE from 'three';
import { RAMPS, nearestRamp, type RampName } from '../art/palette';

export type VfxName = 'dust' | 'impact' | 'spark' | 'slash' | 'splash' | 'blood' | 'smoke' | 'leaves' | 'shock' | 'glint'
  | 'ripple' | 'drop' | 'poof' | 'sparkle' | 'rainhit' | 'crack';
export type LandKind = 'die' | 'splash' | 'wet' | 'blood';
export interface VfxOpts {
  /** size multiplier over the effect's natural size in metres */
  scale?: number;
  /** rotation in the screen plane (billboards) or around the up axis (flat) */
  rot?: number;
  /** the master-palette ramp to paint it in (default per effect) */
  ramp?: RampName;
  /** legacy: a colour picks the nearest palette ramp */
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
// cell values are ramp steps: outline (darkest), shadow, mid, light, highlight; LINE is the lit-side outline step
const OUT = 1, SHD = 2, MID = 3, LIT = 4, HI = 5;
type Pt = [number, number];
/** light from the upper left (screen y runs down) */
const LX = -0.62, LY = -0.78;

/** sprites are drawn in design units and rasterised at K x (twice the old texel density: more drawn detail) */
const K = 2;
const GLINT = 6;
class Grid {
  readonly d: Uint8Array;
  /** s: full-resolution size; k: pixels per design unit */
  constructor(readonly s: number, readonly k = K) { this.d = new Uint8Array(s * s); }
  get(x: number, y: number) { x = Math.floor(x * this.k); y = Math.floor(y * this.k); return x < 0 || y < 0 || x >= this.s || y >= this.s ? 0 : this.d[y * this.s + x]; }
  /** a design-unit pixel: a k x k block */
  set(x: number, y: number, v: number) { const X = Math.floor(x) * this.k, Y = Math.floor(y) * this.k; for (let j = 0; j < this.k; j++) for (let i = 0; i < this.k; i++) this.px(X + i, Y + j, v); }
  /** one full-resolution pixel (fine detail: glints, inner lines) */
  dot(x: number, y: number, v: number) { this.px(Math.floor(x * this.k), Math.floor(y * this.k), v); }
  private px(x: number, y: number, v: number) { if (x >= 0 && y >= 0 && x < this.s && y < this.s) this.d[y * this.s + x] = v; }
  /** a filled polygon (pixel centres inside, even-odd); a value function gets design-unit coordinates */
  poly(P: Pt[], v: number | ((x: number, y: number) => number)) {
    const k = this.k;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.max(0, Math.floor(y0 * k)); y <= Math.min(this.s - 1, Math.ceil(y1 * k)); y++) {
      const py = (y + 0.5) / k;
      for (let x = Math.max(0, Math.floor(x0 * k)); x <= Math.min(this.s - 1, Math.ceil(x1 * k)); x++) {
        const px = (x + 0.5) / k;
        let inside = false;
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
          const [xi, yi] = P[i], [xj, yj] = P[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.d[y * this.s + x] = typeof v === 'number' ? v : v(px, py);
      }
    }
  }
  /** a drawn solid: facets round (cx, cy) each one ramp step by how it faces the light (or, for soft volumes, two
   *  planes split across the light); where it overlaps a form already drawn, a contour line separates them; a small
   *  highlight (a glint on glossy things) where the form turns toward the light. Small ones collapse to a cluster. */
  solid(P: Pt[], cx: number, cy: number, o: { base?: number; cloud?: boolean; gloss?: boolean } = {}) {
    let span = 0; for (const [x, y] of P) span = Math.max(span, Math.abs(x - cx), Math.abs(y - cy));
    if (span < 1.3) { this.set(cx, cy, o.base ?? MID); this.dot(cx + 0.5, cy, o.gloss ? GLINT : LIT); return; }
    const before = this.d.slice();
    if (o.cloud) {
      const r = Math.max(1, span);
      this.poly(P, (px, py) => { const d = ((px - cx) * LX + (py - cy) * LY) / r; return d > 0.32 ? LIT : d > -0.18 ? MID : SHD; });
    } else {
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        let nx = b[1] - a[1], ny = -(b[0] - a[0]);
        const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
        if (nx * mx + ny * my < 0) { nx = -nx; ny = -ny; }
        const l = Math.hypot(nx, ny) || 1, dot = (nx * LX + ny * LY) / l;
        this.poly([[cx, cy], a, b], dot > 0.42 ? LIT : dot < -0.3 ? SHD : (o.base ?? MID));
      }
      if (span > 4.5) { const k = 0.42; this.poly(P.map(([x, y]) => [cx + (x - cx) * k - 0.4, cy + (y - cy) * k - 0.4] as Pt), o.base ?? MID); }
    }
    // a contour where this form lies over one drawn before (only on its shadow side, as a pixel artist would)
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * this.k) + 1;
      for (let j = 0; j <= n; j++) {
        const x = a[0] + ((b[0] - a[0]) * j) / n, y = a[1] + ((b[1] - a[1]) * j) / n;
        if ((x - cx) * LX + (y - cy) * LY > 0.2 * span) continue;
        const X = Math.floor(x * this.k), Y = Math.floor(y * this.k);
        if (X >= 0 && Y >= 0 && X < this.s && Y < this.s && before[Y * this.s + X] >= SHD) this.d[Y * this.s + X] = SHD;
      }
    }
    // the highlight: where the form turns toward the light
    let best = P[0], bd = -1e9;
    for (const p of P) { const d = (p[0] - cx) * LX + (p[1] - cy) * LY; if (d > bd) { bd = d; best = p; } }
    const hx = cx + (best[0] - cx) * 0.58, hy = cy + (best[1] - cy) * 0.58;
    if (this.get(hx, hy) >= MID) { this.dot(hx, hy, o.gloss ? GLINT : HI); this.dot(hx + 0.5, hy, o.gloss ? GLINT : HI); if (o.gloss && span > 2.5) this.dot(hx, hy + 0.5, GLINT); }
  }
  line(x0: number, y0: number, x1: number, y1: number, v: number) {
    // tidy staircases at full resolution: one pixel per step along the major axis
    const k = this.k, ax = x0 * k, ay = y0 * k, dx = (x1 - x0) * k, dy = (y1 - y0) * k, n = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let i = 0; i <= n; i++) this.px(Math.floor(ax + (dx * i) / n + 0.5), Math.floor(ay + (dy * i) / n + 0.5), v);
  }
  /** a line two full pixels wide (design-unit weight) */
  line2(x0: number, y0: number, x1: number, y1: number, v: number) { this.line(x0, y0, x1, y1, v); this.line(x0 + 0.5, y0, x1 + 0.5, y1, v); this.line(x0, y0 + 0.5, x1, y1 + 0.5, v); }
  /** a tapered stroke (a thin triangle): streaks, spikes, sparks */
  stroke(x0: number, y0: number, x1: number, y1: number, w0: number, w1: number, v: number) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    if (w0 < 0.45 && w1 < 0.45) { this.line(x0, y0, x1, y1, v); return; }
    this.poly([[x0 + nx * w0, y0 + ny * w0], [x1 + nx * w1, y1 + ny * w1], [x1 - nx * w1, y1 - ny * w1], [x0 - nx * w0, y0 - ny * w0]], v);
    this.line(x0, y0, x1, y1, v);
  }
  /** a broken hand-drawn arc: a polygon path of `sides` legs with per-vertex wobble; keep(i) drops legs */
  arcs(cx: number, cy: number, rx: number, ry: number, sides: number, wob: number[], v: number, keep?: (i: number) => boolean, rot = 0, heavy = false) {
    const P: Pt[] = [];
    for (let i = 0; i < sides; i++) { const a = rot + (i / sides) * Math.PI * 2, k = 1 + (wob[i % wob.length] - 0.5) * 0.22; P.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    for (let i = 0; i < sides; i++) { if (keep && !keep(i)) continue; const a = P[i], b = P[(i + 1) % sides]; if (heavy) this.line2(a[0], a[1], b[0], b[1], v); else this.line(a[0], a[1], b[0], b[1], v); }
  }
  clear(x0: number, y0: number, x1: number, y1: number) { const k = this.k; for (let y = Math.max(0, Math.floor(y0 * k)); y < Math.min(this.s, Math.floor(y1 * k)); y++) for (let x = Math.max(0, Math.floor(x0 * k)); x < Math.min(this.s, Math.floor(x1 * k)); x++) this.d[y * this.s + x] = 0; }
  clearBelow(y0: number) { this.clear(0, Math.ceil(y0), this.s / this.k, this.s / this.k); }
  /** remove orphan single pixels (except highlights and glints, which are deliberate) */
  tidy() {
    const c = this.d.slice(), s = this.s;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const v = c[y * s + x]; if (!v || v >= HI) continue;
      let n = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < s && Y < s && c[Y * s + X]) n++; }
      if (!n) this.d[y * s + x] = 0;
    }
  }
  /** a bright edge along the silhouette where it faces the light (one full pixel: a lit rim) */
  rim() {
    const c = this.d.slice(), s = this.s;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const v = c[y * s + x]; if (v !== LIT && v !== MID) continue;
      const e = (X: number, Y: number) => X < 0 || Y < 0 || X >= s || Y >= s || c[Y * s + X] === 0;
      if (e(x - 1, y) && e(x, y - 1)) this.d[y * s + x] = HI;
      else if ((e(x, y - 1) || e(x - 1, y)) && v === LIT) this.d[y * s + x] = HI;
    }
  }
  /** the outline: one full pixel of the ramp's darkest step all round the silhouette (glows take a lighter line on
   *  their lit side so they keep their bloom) */
  outline(lit = true) {
    const c = this.d.slice(), s = this.s;
    const f = (x: number, y: number) => x >= 0 && y >= 0 && x < s && y < s && c[y * s + x] >= SHD;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      if (c[y * s + x] !== 0) continue;
      const dark = f(x - 1, y) || f(x, y - 1) || f(x - 1, y - 1) || f(x + 1, y - 1);
      const light = f(x + 1, y) || f(x, y + 1) || f(x + 1, y + 1) || f(x - 1, y + 1);
      if (dark || (light && lit)) this.d[y * s + x] = OUT;
      else if (light) this.d[y * s + x] = SHD;
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

// hand-picked silhouettes for clumps: radius per vertex (lobes, notches, a flattened side), never a regular polygon
const LUMPS: number[][] = [
  [1, 0.78, 0.96, 1.08, 0.7, 0.92, 0.84],
  [0.9, 1.06, 0.74, 0.98, 1.02, 0.66, 0.94, 0.86],
  [1.08, 0.86, 0.7, 0.94, 0.88, 1.04],
  [0.82, 1, 0.9, 0.62, 1.06, 0.96, 0.76, 1.02, 0.9],
];
/** a lumpy clump outline: profile k, radius r (wider than tall by `squash`), turned by rot */
function lump(cx: number, cy: number, r: number, k: number, rot: number, squash = 1): Pt[] {
  const P = LUMPS[k % LUMPS.length], n = P.length;
  return P.map((m, i) => { const a = rot + (i / n) * TAU; return [cx + Math.cos(a) * r * m * squash, cy + Math.sin(a) * r * m] as Pt; });
}
/** a bead: pointed where it came from, blunt and faceted where it is going (dir in radians, screen space) */
function bead(cx: number, cy: number, len: number, w: number, dir: number): Pt[] {
  const ux = Math.cos(dir), uy = Math.sin(dir), vx = -uy, vy = ux;
  const at = (a: number, b: number): Pt => [cx + ux * a + vx * b, cy + uy * a + vy * b];
  return [at(-len, 0), at(-len * 0.15, w * 0.9), at(len * 0.35, w), at(len * 0.62, w * 0.45), at(len * 0.62, -w * 0.5), at(len * 0.3, -w), at(-len * 0.2, -w * 0.85)];
}
/** an irregular burst: n spikes with their own lengths and a jittered spacing */
function burst(cx: number, cy: number, n: number, rIn: number, rOut: number[], rot: number, jit: number[]): Pt[] {
  const P: Pt[] = [];
  for (let k = 0; k < n; k++) {
    const a = rot + ((k + (jit[k % jit.length] - 0.5) * 0.35) / n) * TAU, b = rot + ((k + 0.5) / n) * TAU;
    P.push([cx + Math.cos(a) * rOut[k % rOut.length], cy + Math.sin(a) * rOut[k % rOut.length]]);
    P.push([cx + Math.cos(b) * rIn * (0.85 + jit[(k + 3) % jit.length] * 0.3), cy + Math.sin(b) * rIn * (0.85 + jit[(k + 3) % jit.length] * 0.3)]);
  }
  return P;
}

interface Def {
  size: number; holds: number[]; m: number; ramp: RampName; emit?: number; flat?: boolean;
  /** selective outline on the lit side too (false: a dark line on the shadow side only) */
  litLine?: boolean; noOutline?: boolean;
  draw(g: Grid, f: number, n: number, R: () => number): void;
}

// ------------------------------------------------------------------------------------------------ the effects
const DEFS: Record<VfxName, Def> = {
  // a ground puff: lumpy clumps billow out and up from a flat base, are eaten away from the upper right, crumble
  dust: {
    size: 32, holds: [2, 2, 2, 3, 3, 3, 4], m: 0.6, ramp: 'sand',
    draw(g, f, n, R) {
      const t = f / (n - 1), e = easeOut(Math.min(1, t * 1.3));
      for (let i = 0; i < 5; i++) {
        const bx = (i - 2) * 4.2 + (R() - 0.5) * 3, r0 = 3 + R() * 3, rise = 2 + R() * 8, k = Math.floor(R() * 4), rot = R() * TAU;
        const x = 16 + bx * (0.45 + e * 0.8), y = 25 - rise * e - (i % 2);
        const r = r0 * (0.55 + 0.65 * e) * (1 - sm(0.5, 1, t) * 0.75);
        if (r < 1) { if (t < 0.95 && i % 2) { g.set(x, y, MID); g.set(x + 1, y, MID); } continue; }
        g.solid(lump(x, y, r, k, rot, 1.15), x, y, { cloud: true });
        if (t > 0.55 && r > 1.6) g.poly(lump(x + r * 0.55, y - r * 0.6, r * (0.55 + (t - 0.55)), (k + 1) % 4, rot + 1, 1.1), 0);
      }
      if (t < 0.5) g.clearBelow(27.5);
    },
  },
  // the hit: an angular flash (smear), a jagged star, the star breaking open, shards flung off, flecks
  impact: {
    size: 40, holds: [1, 2, 2, 2, 3, 3], m: 0.7, emit: 1.2, ramp: 'glowAmber', litLine: false,
    draw(g, f, _n, R) {
      const c = 20, rot = R() * TAU, J = [R(), R(), R(), R(), R(), R(), R(), R(), R()], L = J.map((v, k) => (k % 2 ? 11 : 17) * (0.78 + v * 0.3));
      if (f === 0) { const P = burst(c, c, 7, 6.5, J.map((v) => 9 + v * 3), rot, J); g.poly(P, LIT); g.poly(burst(c, c, 7, 4, J.map((v) => 6 + v * 2), rot + 0.2, J), HI); return; }
      if (f === 1) { const P = burst(c, c, 9, 5, L, rot, J); g.solid(P, c, c); g.poly(burst(c, c, 9, 3, L.map((l) => l * 0.45), rot, J), HI); return; }
      if (f === 2) { const P = burst(c, c, 9, 6.5, L.map((l) => l * 1.12), rot, J); g.solid(P, c, c); g.poly(lump(c, c, 5.5, 2, rot), 0); return; }
      for (let k = 0; k < 9; k++) {
        const a = rot + ((k + (J[k] - 0.5) * 0.35) / 9) * TAU, ux = Math.cos(a), uy = Math.sin(a);
        const r0 = [0, 0, 0, 10, 14, 17][f] * (0.9 + J[k] * 0.2), len = [0, 0, 0, 7, 3, 1][f] * (k % 2 ? 0.6 : 1);
        if (f === 5 && k % 3) continue;
        g.stroke(c + ux * r0, c + uy * r0, c + ux * (r0 + len), c + uy * (r0 + len), f === 3 ? 1.6 : 0.6, 0.3, f === 3 ? LIT : MID);
      }
    },
  },
  // a glint cross, then hot streaks flung out on their own bearings, thinning to flecks
  spark: {
    size: 24, holds: [1, 1, 2, 2, 2], m: 0.4, emit: 1.4, ramp: 'glowAmber', litLine: false,
    draw(g, f, _n, R) {
      const c = 12, A = [0, 1, 2, 3, 4, 5].map(() => R() * TAU), S = A.map(() => 0.7 + R() * 0.5);
      if (f === 0) { g.stroke(c - 8, c, c + 8, c, 0.4, 0.4, LIT); g.stroke(c, c - 6, c, c + 7, 0.4, 0.4, LIT); g.poly([[c - 2, c], [c, c - 2], [c + 2, c], [c, c + 2]], HI); return; }
      for (let k = 0; k < 6; k++) {
        const a = A[k], s = S[k], r0 = [0, 2, 5, 8.5, 10.5][f] * s, r1 = [0, 8, 10, 10.5, 11.5][f] * s, sag = f * f * 0.2;
        const x0 = c + Math.cos(a) * r0, y0 = c + Math.sin(a) * r0 + sag * 0.5, x1 = c + Math.cos(a) * r1, y1 = c + Math.sin(a) * r1 + sag;
        if (f <= 2) { g.stroke(x0, y0, x1, y1, 0.3, f === 1 ? 1.1 : 0.5, f === 1 ? LIT : MID); g.set(x1, y1, HI); }
        else if (k % 2 === 0 || f === 3) { g.set(x1, y1, f === 3 ? LIT : MID); g.set(x1 + Math.sign(Math.cos(a)), y1, f === 3 ? MID : SHD); }
      }
      if (f === 1) g.poly([[c - 1.5, c], [c, c - 1.5], [c + 1.5, c], [c, c + 1.5]], HI);
    },
  },
  // a crescent smear: drawn on, the full thick smear frame, the tail end wiped away, broken slivers
  slash: {
    size: 48, holds: [1, 1, 2, 2, 3], m: 0.95, emit: 0.4, ramp: 'snow',
    draw(g, f) {
      const cx = 17, cy = 24, R0 = 20, a0 = -1.8, a1 = 1.8, N = 14;
      const span = [[0, 0.5], [0, 1], [0.3, 1], [0.6, 1], [0.84, 1]][f], W = [4, 9, 6, 4, 2][f];
      // the outer edge and the inner edge as drawn polylines (facets, not a curve)
      const outer: Pt[] = [], inner: Pt[] = [];
      for (let i = 0; i <= N; i++) {
        const u = span[0] + (span[1] - span[0]) * (i / N), a = a0 + (a1 - a0) * u;
        const th = W * Math.pow(Math.sin(Math.PI * Math.min(1, (i / N) * 0.88 + 0.06)), 0.7);
        outer.push([cx + Math.cos(a) * R0, cy + Math.sin(a) * R0]);
        inner.unshift([cx + Math.cos(a) * (R0 - th), cy + Math.sin(a) * (R0 - th)]);
      }
      g.poly([...outer, ...inner], MID);
      // the lit leading band and the hard edge
      const band = outer.map(([x, y]) => [cx + (x - cx) * (1 - W * 0.022), cy + (y - cy) * (1 - W * 0.022)] as Pt);
      g.poly([...outer, ...band.reverse()], LIT);
      for (let i = 0; i < N; i++) g.line(outer[i][0], outer[i][1], outer[i + 1][0], outer[i + 1][1], HI);
      if (f >= 3) for (let i = 0; i < N; i += 3) { const [x, y] = outer[i]; g.poly(lump(x, y, 2.2, i % 4, i), 0); }
      if (f === 1 || f === 2) for (const [rr, s0, s1] of [[R0 - 12, 0.3, 0.72], [R0 - 15, 0.45, 0.64]]) {
        let px = 0, py = 0;
        for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * (s0 + (s1 - s0) * (k / 6)), x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; if (k) g.line(px, py, x, y, LIT); px = x; py = y; }
      }
    },
  },
  // a water crown: a low dome, spikes thrown up with beads off their tips, collapse, broken arcs spreading, beads landing
  splash: {
    size: 40, holds: [1, 2, 2, 2, 2, 3, 3, 4], m: 0.8, ramp: 'water',
    draw(g, f, _n, R) {
      const cx = 20, by = 33;
      const X = [-9, -5, 0, 5, 9], J = X.map(() => (R() - 0.5) * 2), D = X.map(() => 0.8 + R() * 0.5), W = [R(), R(), R(), R(), R(), R(), R(), R(), R(), R()];
      if (f === 0) { g.solid([[cx - 7, by], [cx - 5, by - 3], [cx - 1, by - 5], [cx + 3, by - 4.5], [cx + 6, by - 2], [cx + 7, by]], cx, by - 1); g.clearBelow(by + 0.5); return; }
      const H = [[0], [8, 12, 14, 12, 8], [10, 15, 18, 15, 10], [8, 11, 13, 11, 8], [4, 6, 7, 6, 4], [1, 2, 2, 2, 1], [0], [0]][f];
      const spread = [1, 1, 1.15, 1.3, 1.45, 1.6, 1.7, 1.8][f];
      if (f <= 5) {
        const rx = [0, 10, 12, 13, 14, 15][f];
        // the crown's skirt: a flat drawn mound, not an ellipse
        g.solid([[cx - rx, by], [cx - rx * 0.7, by - 2.5], [cx - rx * 0.2, by - 3.2], [cx + rx * 0.35, by - 3], [cx + rx * 0.8, by - 1.8], [cx + rx, by]], cx, by - 0.5);
        for (let k = 0; k < 5; k++) {
          const h = (H[k] ?? 0) * D[k]; if (h < 1) continue;
          const x = cx + X[k] * spread * 0.85 + J[k], lean = X[k] * (f >= 3 ? 0.35 : 0.12);
          g.poly([[x - 2, by - 1], [x + lean, by - h]], MID);
          g.poly([[x - 2.2, by - 1], [x + lean - 0.2, by - h], [x + 0.2, by - 1]], LIT);
          g.poly([[x + 0.2, by - 1], [x + lean + 0.1, by - h], [x + 2.2, by - 1]], MID);
          g.set(x + lean, by - h, HI);
        }
      }
      if (f >= 5) {
        const rx = [0, 0, 0, 0, 0, 15, 17, 19][f];
        g.arcs(cx, by, rx, rx * 0.24, 10, W, f === 7 ? MID : LIT, (i) => (i + f) % 3 !== 0);
      }
      // beads: thrown from the tips, arcing out and falling back
      if (f >= 1 && f <= 6) for (let k = 0; k < 5; k++) {
        const tt = (f - 1) / 5, x = cx + X[k] * (1 + tt * 1.1) + J[k], h0 = 18 * D[k];
        const y = by - h0 * (0.6 + Math.sin(Math.min(1, tt * 1.15) * Math.PI) * 0.75) + (f >= 5 ? (f - 4) * 5 : 0);
        const falling = f >= 4, sz = f <= 3 ? 2.2 : 1.6;
        if (y < by - 1) g.solid(bead(x, Math.min(by - 2, y), sz * 1.3, sz * 0.8, falling ? Math.PI / 2 : -Math.PI / 2 + X[k] * 0.06), x, Math.min(by - 2, y), { gloss: true });
      }
      g.clearBelow(by + (f >= 5 ? 5 : 3));
    },
  },
  // a stylised splat: a lobed burst, beads flung out and falling, thinning to flecks
  blood: {
    size: 32, holds: [1, 2, 2, 2, 3, 3], m: 0.6, ramp: 'blood',
    draw(g, f, _n, R) {
      const c = 16, A = [0, 1, 2, 3, 4, 5, 6].map(() => R() * TAU), S = A.map(() => 0.7 + R() * 0.6), Z = A.map(() => 0.8 + R() * 0.7), J = [R(), R(), R(), R(), R(), R(), R()];
      if (f === 0) { g.solid(burst(c, c, 6, 4, J.map((v) => 6 + v * 2.5), A[0], J), c, c); return; }
      if (f <= 2) { const r = f === 1 ? 4.5 : 3; g.solid(lump(c, c, r, 1, A[1]), c, c); }
      for (let k = 0; k < 7; k++) {
        const d = [0, 8, 11, 13, 14, 14.5][f] * S[k], fall = [0, 0, 1, 3, 6, 9][f];
        const x = c + Math.cos(A[k]) * d, y = c + Math.sin(A[k]) * d + fall, sz = [0, 2.6, 2, 1.6, 1.2, 1][f] * Z[k];
        if (f === 5 && k % 2) continue;
        const dir = f >= 3 ? Math.atan2(Math.sin(A[k]) * d + fall * 2, Math.cos(A[k]) * d) : A[k];
        g.solid(bead(x, y, sz * 1.5, sz * 0.75, dir), x, y, { gloss: true });
      }
    },
  },
  // a smoke curl: clumps rising on a spiral, eaten away, a hooked wisp drawn at the top
  smoke: {
    size: 32, holds: [2, 2, 2, 2, 3, 3, 3, 4, 4], m: 0.7, ramp: 'sky',
    draw(g, f, n, R) {
      const t = f / (n - 1);
      let tx = 16, ty = 28;
      for (let i = 0; i < 5; i++) {
        const ph = R() * TAU, sz = 2 + R() * 2.2, jx = (R() - 0.5) * 4, k = Math.floor(R() * 4);
        const tt = Math.min(1, Math.max(0, (t - i * 0.07) / 0.85));
        if (tt <= 0) continue;
        const x = 16 + jx + Math.sin(tt * 4.2 + ph) * 4 * tt, y = 28 - tt * 21 - i * 1.2;
        const r = sz * (0.6 + tt * 1.3) * (1 - sm(0.7, 1, tt) * 0.7);
        if (r < 1) continue;
        g.solid(lump(x, y, r, k, ph), x, y, { cloud: true });
        if (tt > 0.5 && r > 1.6) g.poly(lump(x + r * 0.5, y - r * 0.5, r * (0.55 + (tt - 0.5) * 0.9), k + 1, ph + 1), 0);
        if (y < ty) { ty = y; tx = x; }
      }
      if (t > 0.3 && t < 0.95) { const rr = 2.5 + t * 2; let px = 0, py = 0; for (let k = 0; k <= 6; k++) { const a = Math.PI * 0.6 + (k / 6) * Math.PI * 1.3, x = tx + 2 + Math.cos(a) * rr, y = ty - 3 + Math.sin(a) * rr; if (k) g.line(px, py, x, y, MID); px = x; py = y; } }
    },
  },
  // a flurry of tumbling leaves: each flips through face-on, three-quarter, edge-on
  leaves: {
    size: 32, holds: [2, 2, 2, 2, 2, 2, 3, 3], m: 0.8, ramp: 'moss',
    draw(g, f, n, R) {
      const t = f / (n - 1);
      for (let i = 0; i < 6; i++) {
        const x0 = 16 + (R() - 0.5) * 8, vx = (R() - 0.5) * 22, up = 8 + R() * 8, ph = R() * TAU, o0 = Math.floor(R() * 4);
        const x = x0 + vx * easeOut(t) + Math.sin(t * 9 + ph) * 2.5, y = 24 - up * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) + t * t * 10;
        leaf(g, x, y, (o0 + f) % 4);
      }
    },
  },
  // ground shockwave (flat): an angular flash, a torn ring of broken legs and thrown chunks over drawn cracks
  shock: {
    size: 64, holds: [1, 2, 2, 2, 3, 3, 4], m: 1.6, flat: true, ramp: 'sand',
    draw(g, f, _n, R) {
      const c = 32, A = [0, 1, 2, 3, 4, 5, 6].map((k) => (k / 7) * TAU + R() * 0.6), Lc = A.map(() => 12 + R() * 8), J = A.map(() => [R(), R(), R(), R()]), W = Array.from({ length: 13 }, () => R());
      if (f === 0) { g.solid(burst(c, c, 8, 5, W.map((v) => 7 + v * 2), 0.3, W), c, c); return; }
      const rr = [0, 12, 18, 23, 27, 29, 30][f];
      const reach = Math.min(rr, f >= 4 ? Lc[0] * (1 - (f - 4) * 0.3) : 99);
      for (let k = 0; k < 7; k++) {
        let px = c, py = c; const L = Math.min(Lc[k], reach);
        for (let s = 1; s <= 4; s++) { const d = (L * s) / 4, a = A[k] + (J[k][s - 1] - 0.5) * 0.5, nx = c + Math.cos(a) * d, ny = c + Math.sin(a) * d; g.line(px, py, nx, ny, OUT); px = nx; py = ny; }
      }
      const keep = f >= 3 ? (i: number) => (i * 7 + f) % (f >= 5 ? 3 : 4) !== 0 : undefined;
      const th = [0, 3, 2, 2, 1, 1, 1][f];
      for (let w = 0; w < th; w++) g.arcs(c, c, rr - w, rr - w, 13, W, w === 0 ? (f <= 2 ? HI : LIT) : MID, keep, 0.2);
      // chunks of ground thrown out past the ring
      if (f >= 2) for (let k = 0; k < 8; k++) { const a = W[k] * TAU, d = rr + 2 + W[(k + 5) % 13] * 3, x = c + Math.cos(a) * d, y = c + Math.sin(a) * d; if (f < 6 || k % 2) g.poly([[x - 1, y - 1], [x + 1.4, y - 0.8], [x + 1, y + 1], [x - 1.2, y + 0.8]], k % 2 ? MID : SHD); }
    },
  },
  // a four-point twinkle
  glint: {
    size: 16, holds: [2, 2, 3, 2, 2], m: 0.28, emit: 1.6, ramp: 'glowAmber', noOutline: true,
    draw(g, f) {
      const c = 8, arm = [1, 3, 6, 4, 1][f];
      g.stroke(c - arm, c, c + arm, c, 0.4, 0.4, MID); g.stroke(c, c - arm, c, c + arm, 0.4, 0.4, MID);
      if (arm > 2) { g.line(c - arm + 2, c, c + arm - 2, c, LIT); g.line(c, c - arm + 2, c, c + arm - 2, LIT); }
      g.set(c, c, HI); if (arm >= 3) { g.set(c - 1, c, HI); g.set(c, c - 1, HI); }
    },
  },
  // rings on water (flat): broken hand-drawn arcs, a darker line outside the bright one, spreading and breaking up
  ripple: {
    size: 48, holds: [3, 3, 3, 3, 3, 4, 4, 4], m: 1.0, flat: true, ramp: 'water', noOutline: true,
    draw(g, f, _n, R) {
      const c = 24, r = 3 + f * 2.7, W = Array.from({ length: 11 }, () => R()), rot = R() * TAU;
      const keep = (gap: number) => (i: number) => (i * 5 + f + gap) % (f >= 5 ? 3 : 5) !== 0;
      g.arcs(c, c, r + 1.2, r + 1.2, 11, W, SHD, keep(0), rot);
      g.arcs(c, c, r, r, 11, W, f <= 2 ? HI : LIT, keep(0), rot);
      if (f >= 2) g.arcs(c, c, r - 5, r - 5, 9, W, f <= 4 ? LIT : MID, keep(2), rot + 0.4);
      if (f >= 4 && f <= 6) g.arcs(c, c, r - 10, r - 10, 7, W, MID, (i) => i % 2 === 0, rot + 0.9);
    },
  },
  // one bead of water: pointed tail up, blunt faceted head; stretched along its fall when aligned
  drop: {
    size: 8, holds: [4], m: 0.075, ramp: 'water',
    draw(g) { g.poly([[4, 0.5], [5.4, 3.5], [5.6, 5.4], [4.6, 6.6], [3.2, 6.6], [2.4, 5.4], [2.6, 3.5]], MID); g.poly([[4, 0.5], [2.6, 3.5], [2.4, 5.4], [3.4, 5]], LIT); g.poly([[5.4, 4.6], [5.6, 5.4], [4.6, 6.6], [4, 6.2]], SHD); g.dot(3.1, 3.9, GLINT); g.dot(3.1, 4.4, GLINT); g.dot(3.6, 3.9, HI); },
  },
  // a death poof: an angular burst cloud, clumps blown outward, eaten away, flecks
  poof: {
    size: 48, holds: [1, 2, 2, 2, 3, 3, 3, 4], m: 1.0, ramp: 'bone',
    draw(g, f, _n, R) {
      const c = 24, A = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => (k / 8) * TAU + (R() - 0.5) * 0.5), S = A.map(() => 0.85 + R() * 0.3), K = A.map(() => Math.floor(R() * 4));
      if (f === 0) { g.solid(lump(c, c, 9.5, 3, A[0]), c, c, { cloud: true }); g.poly(lump(c - 1.5, c - 1.5, 5, 1, A[2]), HI); return; }
      const rr = [0, 8, 13, 17, 19, 21, 22, 23][f], pr = [0, 4.5, 5, 5, 4, 3, 2, 1][f], cr = [0, 9, 7, 4, 0, 0, 0, 0][f];
      if (cr > 0) g.solid(lump(c, c, cr, 0, A[1]), c, c, { cloud: true });
      for (let k = 0; k < 8; k++) {
        const x = c + Math.cos(A[k]) * rr * S[k], y = c + Math.sin(A[k]) * rr * S[k] - f * 0.6;
        if (pr * S[k] < 1.2) { if (k % 2) { g.set(x, y, MID); g.set(x + 1, y, SHD); } continue; }
        g.solid(lump(x, y, pr * S[k], K[k], A[k]), x, y, { cloud: true });
        if (f >= 3) g.poly(lump(x + Math.cos(A[k]) * pr * 0.55, y + Math.sin(A[k]) * pr * 0.55 - pr * 0.3, pr * S[k] * (0.5 + (f - 3) * 0.15), K[k] + 1, A[k]), 0);
      }
    },
  },
  // twinkling plus-sparkles rising
  sparkle: {
    size: 24, holds: [2, 2, 2, 2, 2, 3], m: 0.5, emit: 1.3, ramp: 'glowTeal', noOutline: true,
    draw(g, f, _n, R) {
      for (let i = 0; i < 4; i++) {
        const x = 5 + R() * 14, y0 = 18 - R() * 6, off = Math.floor(R() * 3), sz = [0, 1, 2, 3, 2, 1, 0, 0, 0][f + off] ?? 0;
        const y = y0 - f * 1.6;
        if (!sz) continue;
        g.line(x - sz, y, x + sz, y, sz > 1 ? LIT : MID); g.line(x, y - sz, x, y + sz, sz > 1 ? LIT : MID); g.set(x, y, HI);
      }
    },
  },
  // a raindrop hitting the ground: two beads hop up, a flat broken arc
  rainhit: {
    size: 12, holds: [1, 2, 2, 2], m: 0.17, ramp: 'water', noOutline: true,
    draw(g, f) {
      const c = 6, by = 9;
      if (f === 0) { g.line(c - 1, by, c + 1, by, HI); return; }
      const h = [0, 3, 4, 2][f], dx = [0, 2, 3, 4][f];
      if (f < 3) { g.set(c - dx, by - h, HI); g.set(c - dx, by - h + 1, LIT); g.set(c + dx, by - h + 1, HI); g.set(c + dx, by - h + 2, LIT); }
      g.line(c - dx - 1, by, c - 1, by - (f === 3 ? 0 : 1), f === 3 ? MID : LIT); g.line(c + 1, by - (f === 3 ? 0 : 1), c + dx + 1, by, f === 3 ? MID : LIT);
    },
  },
  // ground cracks (flat): jagged fissures that stay a moment and close
  crack: {
    size: 48, holds: [1, 6, 6, 4, 3], m: 1.0, flat: true, ramp: 'soil', noOutline: true,
    draw(g, f, _n, R) {
      const c = 24, k0 = 6;
      for (let k = 0; k < k0; k++) {
        const a0 = (k / k0) * TAU + R() * 0.8, L = 12 + R() * 9, J = [R(), R(), R(), R(), R()], br = R();
        const len = L * [0.5, 1, 1, 0.7, 0.4][f];
        let px = c, py = c;
        for (let s = 1; s <= 5; s++) {
          const d = (len * s) / 5, a = a0 + (J[s - 1] - 0.5) * 0.7, nx = c + Math.cos(a) * d, ny = c + Math.sin(a) * d;
          if (s <= 2 && f <= 2) g.stroke(px, py, nx, ny, 1.2, 0.8, OUT); else g.line(px, py, nx, ny, OUT);
          if (s === 1) g.set(nx + 1, ny + 1, LIT);
          if (s === 3 && br < 0.6 && f >= 1) g.line(nx, ny, nx + Math.cos(a + 0.9) * 4, ny + Math.sin(a + 0.9) * 4, OUT);
          px = nx; py = ny;
        }
      }
      if (f <= 1) { g.poly(burst(c, c, 5, 2, [4, 3, 4.5, 3, 3.5], 0.4, [0.2, 0.8, 0.5, 0.3, 0.6]), OUT); g.set(c - 3, c - 3, LIT); }
    },
  },
};

function leaf(g: Grid, x: number, y: number, o: number) {
  x = Math.round(x); y = Math.round(y);
  // pointed, with a vein: lit upper half, mid lower, a shadow edge, a stem
  if (o === 0) { for (let i = -2; i <= 2; i++) g.set(x + i, y, MID); g.set(x - 1, y - 1, LIT); g.set(x, y - 1, LIT); g.set(x + 1, y - 1, MID); g.set(x, y + 1, SHD); g.set(x - 1, y + 1, SHD); g.set(x + 3, y, OUT); g.set(x - 3, y, LIT); }
  else if (o === 1) { for (let i = -2; i <= 2; i++) g.set(x + i, y - i, MID); g.set(x - 1, y, LIT); g.set(x, y - 1, LIT); g.set(x, y + 1, SHD); g.set(x + 1, y, SHD); }
  else if (o === 2) { for (let i = -2; i <= 2; i++) g.set(x, y + i, MID); g.set(x + 1, y - 1, LIT); g.set(x + 1, y, MID); g.set(x - 1, y + 1, SHD); g.set(x, y + 3, OUT); g.set(x, y - 3, LIT); }
  else { for (let i = -2; i <= 2; i++) g.set(x + i, y, i <= 0 ? LIT : SHD); g.set(x + 3, y, SHD); }
}

// ------------------------------------------------------------------------------------------------ atlas + ramps
interface Frames { uv: Float32Array; cum: Float32Array; ticks: number; m: number; ramp: number; emit: number; flat: boolean }
/** ramp rows in the ramp texture */
const RAMP_NAMES = Object.keys(RAMPS) as RampName[];
const RAMP_ROW = new Map(RAMP_NAMES.map((n, i) => [n, i]));
/** the five steps a sprite paints with, picked from a ramp of any length: outline, shadow, mid, light, highlight */
/** the six steps a sprite paints with, from a ramp of any length: outline, shadow, base, lit plane, highlight edge,
 *  glint (the ramp's lightest) */
function steps(r: readonly number[]): number[] {
  const L = r.length;
  if (L >= 7) return [r[0], r[2], r[3], r[4], r[5], r[6]];
  if (L === 6) return [r[0], r[1], r[2], r[3], r[4], r[5]];
  if (L === 5) return [r[0], r[1], r[2], r[3], r[4], r[4]];
  if (L === 4) return [r[0], r[1], r[2], r[2], r[3], r[3]];
  return [r[0], r[0], r[1], r[1], r[L - 1], r[L - 1]];
}
let ATLAS: { tex: THREE.DataTexture; ramps: THREE.DataTexture; fx: Record<VfxName, Frames>; w: number; h: number } | null = null;

function buildAtlas() {
  if (ATLAS) return ATLAS;
  const W = 1024;
  const names = (Object.keys(DEFS) as VfxName[]).sort((a, b) => DEFS[b].size - DEFS[a].size);
  type Slot = { n: VfxName; f: number; x: number; y: number; s: number };
  const slots: Slot[] = [];
  let x = 0, y = 0, rowH = 0;
  for (const n of names) {
    const d = DEFS[n];
    for (let f = 0; f < d.holds.length; f++) {
      const sz = d.size * K;
      if (x + sz > W) { x = 0; y += rowH + 1; rowH = 0; }
      slots.push({ n, f, x, y, s: sz });
      x += sz + 1; rowH = Math.max(rowH, sz);
    }
  }
  let H = 64; while (H < y + rowH + 1) H *= 2;
  // the atlas holds ramp steps (1..5 in red), the ramp texture turns them into palette colours
  const data = new Uint8Array(W * H * 4);
  const fx = {} as Record<VfxName, Frames>;
  for (const n of names) {
    const d = DEFS[n], nf = d.holds.length;
    const cum = new Float32Array(nf); let acc = 0;
    d.holds.forEach((h, i) => { acc += h; cum[i] = acc; });
    fx[n] = { uv: new Float32Array(nf * 4), cum, ticks: acc, m: d.m, ramp: RAMP_ROW.get(d.ramp) ?? 0, emit: d.emit ?? 0, flat: !!d.flat };
  }
  const seedOf = (n: string) => { let h = 2166136261; for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 16777619); return h >>> 0; };
  for (const sl of slots) {
    const d = DEFS[sl.n], g = new Grid(sl.s, K);
    d.draw(g, sl.f, d.holds.length, rng(seedOf(sl.n)));
    g.tidy();
    if (!d.noOutline) { g.rim(); g.outline(d.litLine !== false); }
    for (let py = 0; py < sl.s; py++) for (let px = 0; px < sl.s; px++) {
      const v = g.d[py * sl.s + px]; if (!v) continue;
      const o = ((sl.y + sl.s - 1 - py) * W + sl.x + px) * 4;
      data[o] = v; data[o + 3] = 255;
    }
    fx[sl.n].uv.set([sl.x / W, sl.y / H, (sl.x + sl.s) / W, (sl.y + sl.s) / H], sl.f * 4);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const RH = RAMP_NAMES.length, rd = new Uint8Array(8 * RH * 4);
  RAMP_NAMES.forEach((n, row) => steps(RAMPS[n]).forEach((c, i) => { const o = (row * 8 + i + 1) * 4; rd[o] = (c >> 16) & 255; rd[o + 1] = (c >> 8) & 255; rd[o + 2] = c & 255; rd[o + 3] = 255; }));
  const ramps = new THREE.DataTexture(rd, 8, RH, THREE.RGBAFormat, THREE.UnsignedByteType);
  ramps.colorSpace = THREE.SRGBColorSpace; ramps.magFilter = ramps.minFilter = THREE.NearestFilter; ramps.generateMipmaps = false; ramps.needsUpdate = true;
  ATLAS = { tex, ramps, fx, w: W, h: H };
  return ATLAS;
}
/** the ramp row for a name or a legacy colour */
function rampRow(o: VfxOpts, def: number) {
  if (o.ramp) return RAMP_ROW.get(o.ramp) ?? def;
  if (o.tint !== undefined) return RAMP_ROW.get(nearestRamp(typeof o.tint === 'number' ? o.tint : o.tint.getHex())) ?? def;
  return def;
}

// ------------------------------------------------------------------------------------------------ renderer
const VERT = /* glsl */`
attribute vec3 aPos; attribute vec4 aSR; attribute vec4 aUV; attribute vec4 aCol; attribute vec3 aVel;
varying vec2 vUv; varying vec4 vCol; varying float vA; varying vec2 vTex;
uniform vec2 uAtlas; uniform float uRampRows;
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
  vCol = vec4((aCol.x + 0.5) / uRampRows, 0.0, 0.0, abs(aCol.a) - 1.0);
  vA = aSR.w;
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap, uRamps; uniform vec3 uLight;
varying vec2 vUv; varying vec4 vCol; varying float vA; varying vec2 vTex;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  // the atlas holds ramp steps; the sprite's ramp turns them into master-palette colours
  float step = floor(t.r * 255.0 + 0.5);
  vec3 c = texture2D(uRamps, vec2((step + 0.5) / 8.0, vCol.x)).rgb;
  float e = vCol.a;
  // lit by the scene unless it glows (glow brightness, never a hue change)
  c *= mix(uLight, vec3(1.0 + max(0.0, e - 1.0) * 1.5), clamp(e, 0.0, 1.0));
  gl_FragColor = vec4(c, 1.0);
}`;

const MAX = 1400;

export class Vfx2D {
  readonly mesh: THREE.Mesh;
  /** multiplies unlit sprites: the scene's light (set per frame from the sun and sky) */
  readonly light = new THREE.Color(1, 1, 1);
  /** ground height for sprites that fly and land */
  ground: ((x: number, z: number) => number) | null = null;
  /** a flying sprite reached the ground (splash rings, wet spots: details.ts) */
  onLand: ((x: number, y: number, z: number, kind: LandKind, size: number, ramp: RampName) => void) | null = null;
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
      uniforms: { uMap: { value: this.atlas.tex }, uRamps: { value: this.atlas.ramps }, uRampRows: { value: RAMP_NAMES.length }, uLight: { value: this.light }, uAtlas: { value: new THREE.Vector2(this.atlas.w, this.atlas.h) } },
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
    this.col[i * 4] = rampRow(o, F.ramp); this.col[i * 4 + 1] = 0; this.col[i * 4 + 2] = 0; this.col[i * 4 + 3] = o.emit ?? F.emit;
    return i;
  }

  /** pixel droplets thrown up and out from a point; they arc, fall and land (ripples on water, wet spots on ground) */
  drops(x: number, y: number, z: number, n: number, o: { speed?: number; up?: number; ramp?: RampName; tint?: number; land?: LandKind; scale?: number; spread?: number } = {}) {
    const sp = o.speed ?? 1.6, up = o.up ?? 2.4, sc = o.scale ?? 1, spr = o.spread ?? 0.06;
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, s = sp * (0.35 + Math.random() * 0.8);
      this.play('drop', x + Math.cos(a) * spr, y, z + Math.sin(a) * spr, { vel: [Math.cos(a) * s, up * (0.55 + Math.random() * 0.7), Math.sin(a) * s], grav: 9.8, align: true, scale: sc * (0.7 + Math.random() * 0.6), ramp: o.ramp, tint: o.tint, land: o.land ?? 'splash', loop: 3 });
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
              if (this.land[i] > 1 && this.onLand) this.onLand(this.p[k3], gy, this.p[k3 + 2], (['die', 'die', 'splash', 'wet', 'blood'] as LandKind[])[this.land[i]], this.size[i], RAMP_NAMES[this.col[i * 4]] ?? 'water');
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
      sr[w * 4] = this.size[w]; sr[w * 4 + 1] = this.rot[w]; sr[w * 4 + 2] = this.mode[w]; sr[w * 4 + 3] = 1;
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
  /** the master-palette ramp names a sprite can be painted in */
  ramps: RAMP_NAMES,
  sizeOf(name: VfxName) { return LIVE?.sizeOf(name) ?? 1; },
  get live(): Vfx2D | null { return LIVE; },
};
/** the atlas, for previews and tests */
export function vfxAtlas() { return buildAtlas(); }
