// The golem's control machinery, hand-pixelled in code: riveted olive-drab steel, brass, Bakelite, hazard paint,
// copper pipe and green P1 phosphor. Everything is painted at 1x into RGBA buffers and shown at an integer scale
// with nearest filtering. Light always falls from the top left.
import { hashf, tileFbm } from '../limbo/core/rng';
import { bayer } from '../limbo/gfx/pixel';

// ------------------------------------------------------------------ palettes (dark -> light)
export const OL = [0x111410, 0x1a1f15, 0x252b1d, 0x313926, 0x3f4830, 0x4e593a, 0x606c47, 0x77825a, 0x939c74]; // olive drab enamel
export const GM = [0x0a0c0f, 0x14171b, 0x1e2227, 0x292e34, 0x363c43, 0x474e56, 0x5c646c, 0x78818a, 0x9da6ad, 0xc9d0d4]; // gunmetal / bare steel
export const BR = [0x241807, 0x3f2a0d, 0x5c3f13, 0x7c581b, 0x9c7226, 0xbc8e36, 0xd8ab50, 0xeeca78, 0xfff0bc]; // brass
export const CU = [0x281009, 0x451f0e, 0x663016, 0x87441f, 0xa85a29, 0xc6793c, 0xe0a064, 0xf6ca98]; // copper
export const RS = [0x2a1409, 0x46220e, 0x663215, 0x86451b, 0xa65c25]; // rust
export const RD = [0x1c0605, 0x380b08, 0x5e130c, 0x881d12, 0xb02a18, 0xd64426, 0xee6c44, 0xffa684]; // signal red
export const PH = [0x020805, 0x041209, 0x071e0e, 0x0b3017, 0x124722, 0x1b6630, 0x288c42, 0x43b65a, 0x7ae088, 0xc0ffc6]; // P1 phosphor
export const AM = [0x1a0c02, 0x3a1b04, 0x6a3308, 0xa4540e, 0xdc7c18, 0xffa432, 0xffcd6e, 0xfff0c4]; // amber glass
export const CR = [0x5e5744, 0x878068, 0xaea686, 0xd0c8a4, 0xece4c6]; // cream enamel / stencil paint
export const BK = [0x0c0b0a, 0x171513, 0x221f1c, 0x2f2b27, 0x3e3933, 0x524b43]; // Bakelite
export const HZ = { y: 0xd8a422, yl: 0xf2c845, yd: 0x9a7014, k: 0x15130e, kl: 0x29251e };
export const INK = 0x06070a;

export const hex = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
const clampi = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** ramp lookup with ordered dither: v is a continuous index into R */
export function dv(R: number[], v: number, x: number, y: number) { return R[clampi(Math.floor(v + bayer(x, y) - 0.25), 0, R.length - 1)]; }

// ------------------------------------------------------------------ buffer
export class Pix {
  readonly d: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) { this.d = new Uint8ClampedArray(w * h * 4); }
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, c: number, a = 255) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.d;
    if (a >= 255) { d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255; return; }
    if (a <= 0) return;
    const sa = a / 255, da = d[i + 3] / 255, oa = sa + da * (1 - sa);
    d[i] = (((c >> 16) & 255) * sa + d[i] * da * (1 - sa)) / oa;
    d[i + 1] = (((c >> 8) & 255) * sa + d[i + 1] * da * (1 - sa)) / oa;
    d[i + 2] = ((c & 255) * sa + d[i + 2] * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
  }
  get(x: number, y: number) { if (!this.in(x, y)) return -1; const i = (y * this.w + x) * 4; return this.d[i + 3] ? (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2] : -1; }
  a(x: number, y: number) { return this.in(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
  /** multiply existing colour */
  shade(x: number, y: number, f: number) {
    if (!this.in(x, y)) return; const i = (y * this.w + x) * 4;
    if (!this.d[i + 3]) return;
    this.d[i] = Math.min(255, this.d[i] * f); this.d[i + 1] = Math.min(255, this.d[i + 1] * f); this.d[i + 2] = Math.min(255, this.d[i + 2] * f);
  }
  clear(x: number, y: number) { if (this.in(x, y)) this.d[(y * this.w + x) * 4 + 3] = 0; }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  hl(x0: number, x1: number, y: number, c: number, a = 255) { for (let x = x0; x <= x1; x++) this.set(x, y, c, a); }
  vl(x: number, y0: number, y1: number, c: number, a = 255) { for (let y = y0; y <= y1; y++) this.set(x, y, c, a); }
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) { this.set(x0, y0, c, a); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  disc(cx: number, cy: number, r: number, c: number, a = 255) { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c, a); }
  blit(s: Pix, dx: number, dy: number) { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) { const i = (y * s.w + x) * 4; if (s.d[i + 3]) this.set(dx + x, dy + y, (s.d[i] << 16) | (s.d[i + 1] << 8) | s.d[i + 2], s.d[i + 3]); } }
  canvas(): HTMLCanvasElement { const c = document.createElement('canvas'); c.width = this.w; c.height = this.h; c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(this.d), this.w, this.h), 0, 0); return c; }
  url() { return this.canvas().toDataURL(); }
  image() { return new ImageData(new Uint8ClampedArray(this.d), this.w, this.h); }
}

// ------------------------------------------------------------------ fonts: a 3x5 stencil face and 5x7 numerals
const F3: Record<string, string> = {
  A: '.#./#.#/###/#.#/#.#', B: '##./#.#/##./#.#/##.', C: '.##/#../#../#../.##', D: '##./#.#/#.#/#.#/##.', E: '###/#../##./#../###', F: '###/#../##./#../#..',
  G: '.##/#../#.#/#.#/.##', H: '#.#/#.#/###/#.#/#.#', I: '###/.#./.#./.#./###', J: '..#/..#/..#/#.#/.#.', K: '#.#/#.#/##./#.#/#.#', L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#', N: '#.#/###/###/###/#.#', O: '.#./#.#/#.#/#.#/.#.', P: '##./#.#/##./#../#..', Q: '.#./#.#/#.#/##./.##', R: '##./#.#/##./#.#/#.#',
  S: '.##/#../.#./..#/##.', T: '###/.#./.#./.#./.#.', U: '#.#/#.#/#.#/#.#/.##', V: '#.#/#.#/#.#/.#./.#.', W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.', Z: '###/..#/.#./#../###',
  0: '###/#.#/#.#/#.#/###', 1: '.#./##./.#./.#./###', 2: '##./..#/.#./#../###', 3: '##./..#/.#./..#/##.', 4: '#.#/#.#/###/..#/..#', 5: '###/#../##./..#/##.',
  6: '.##/#../###/#.#/###', 7: '###/..#/..#/.#./.#.', 8: '###/#.#/###/#.#/###', 9: '###/#.#/###/..#/##.',
  '.': './././././#', ',': '././././#', ':': './#/./#/.', '-': '.../.../###/.../...', '/': '..#/..#/.#./#../#..', '+': '.../.#./###/.#./...',
  '%': '#.#/..#/.#./#../#.#', '#': '#.#/###/#.#/###/#.#', '(': '.#/#./#./#./.#', ')': '#./.#/.#/.#/#.', '!': '#/#/#/./#', '?': '##./..#/.#./.../.#.',
  '\'': '#/#/./././', '*': '#.#/.#./#.#/.../...', '=': '.../###/.../###/...', '<': '..#/.#./#../.#./..#', '>': '#../.#./..#/.#./#..', ' ': '../../../../..', '°': '###/#.#/###/.../...',
  '·': './././#/./', '&': '.#./#.#/.#./#.#/.##', '_': '.../.../.../.../###', '[': '##/#./#./#./##', ']': '##/.#/.#/.#/##',
};
const G3 = new Map<string, boolean[][]>();
for (const [k, v] of Object.entries(F3)) G3.set(k, v.split('/').map((r) => [...r].map((c) => c === '#')));
const F7: Record<string, string> = {
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.', 1: '..#../.##../..#../..#../..#../..#../.###.', 2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '#####/...#./..#../...#./....#/#...#/.###.', 4: '...#./..##./.#.#./#..#./#####/...#./...#.', 5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '..##./.#.../#..../####./#...#/#...#/.###.', 7: '#####/....#/...#./..#../.#.../.#.../.#...', 8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/...#./.##..', '-': '...../...../...../#####/...../...../.....', ' ': '...../...../...../...../...../...../.....',
  '/': '....#/....#/...#./..#../.#.../#..../#....', '%': '##..#/##.#./...#./..#../.#.../.#.##/#..##', ':': './././#/./#/.',
};
const G7 = new Map<string, boolean[][]>();
for (const [k, v] of Object.entries(F7)) G7.set(k, v.split('/').map((r) => [...r].map((c) => c === '#')));
export function glyph7(ch: string) { return G7.get(ch) ?? G7.get(' ')!; }

export function textW(s: string) { let w = 0; for (const ch of s.toUpperCase()) w += (G3.get(ch)?.[0].length ?? 3) + 1; return Math.max(0, w - 1); }
/** 3x5 text. style: 'flat' paint, 'emboss' (raised: light top-left, dark bottom-right), 'engrave' (cut in) */
export function text(p: Pix, s: string, x: number, y: number, c: number, style: 'flat' | 'emboss' | 'engrave' | 'shadow' = 'flat', hi = -1, lo = -1) {
  let cx = Math.round(x);
  for (const ch of s.toUpperCase()) {
    const g = G3.get(ch) ?? G3.get('?')!;
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) {
      if (!g[j][i]) continue;
      const X = cx + i, Y = y + j;
      if (style === 'emboss') { if (lo >= 0) p.set(X + 1, Y + 1, lo); if (hi >= 0) p.set(X - 1, Y, hi, 120); }
      else if (style === 'engrave') { if (lo >= 0) p.set(X, Y - 1, lo, 200); if (hi >= 0) p.set(X, Y + 1, hi); }
      else if (style === 'shadow') { p.set(X + 1, Y + 1, lo >= 0 ? lo : INK, 200); }
    }
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i]) p.set(cx + i, y + j, c);
    cx += g[0].length + 1;
  }
  return cx - 1;
}

// ------------------------------------------------------------------ surfaces
export interface MetalOpts { seed?: number; base?: number; rough?: number; brushed?: number; light?: number; scratches?: number; grime?: number; rust?: number; chips?: number; tile?: boolean }
/** painted or bare metal: noise, brushing, top-left light, scratches, grime, rust blooms and chipped paint */
export function metal(p: Pix, x0: number, y0: number, w: number, h: number, R: number[], o: MetalOpts = {}) {
  const seed = o.seed ?? 7, base = o.base ?? R.length * 0.45, rough = o.rough ?? 0.9, br = o.brushed ?? 0.35, light = o.light ?? 0.7;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = o.tile ? tileFbm(x, y, w, h, 4, 3, seed) : tileFbm(x, y, 64, 64, 4, 3, seed);
    let v = base + (n - 0.5) * rough * 2;
    v += (hashf(0, y, seed) - 0.5) * br + (hashf(Math.floor(x / 11), y, seed + 3) - 0.5) * br * 0.6;
    if (!o.tile) v += (0.5 - (x / w) * 0.35 - (y / h) * 0.65) * light;
    p.set(x0 + x, y0 + y, dv(R, v, x0 + x, y0 + y));
  }
  // grime: soft dark clouds, heavier low down
  const gr = o.grime ?? 0.5;
  if (gr > 0) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = o.tile ? tileFbm(x, y, w, h, 3, 3, seed + 40) : tileFbm(x, y, 48, 48, 3, 3, seed + 40);
    const k = n + (o.tile ? 0 : (y / h) * 0.18) - (1 - gr * 0.35);
    if (k > 0.12 + bayer(x0 + x, y0 + y) * 0.12) p.shade(x0 + x, y0 + y, 0.8);
  }
  const rnd = (i: number, k: number) => hashf(i, k, seed + 91);
  // scratches: a bright cut with a dark lip
  const ns = Math.round(((o.scratches ?? 1) * w * h) / 260);
  for (let i = 0; i < ns; i++) {
    const sx = rnd(i, 1) * w, sy = rnd(i, 2) * h, len = 2 + rnd(i, 3) * 7, ang = (rnd(i, 4) - 0.5) * 1.6 + (rnd(i, 5) < 0.5 ? 0 : Math.PI * 0.25);
    for (let t = 0; t < len; t++) {
      let X = Math.round(sx + Math.cos(ang) * t), Y = Math.round(sy + Math.sin(ang) * t);
      if (o.tile) { X = ((X % w) + w) % w; Y = ((Y % h) + h) % h; } else if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue;
      const c = p.get(x0 + X, y0 + Y); if (c < 0) continue;
      p.set(x0 + X, y0 + Y, mixc(c, 0xd8dcd0, 0.32 + rnd(i, 6) * 0.2));
      if (rnd(i * 7 + t, 9) < 0.6) p.shade(x0 + X, y0 + Y + 1, 0.78);
    }
  }
  // chipped paint: bare steel islands with a dark rim on the lower right
  const nc = Math.round(((o.chips ?? 0.6) * w * h) / 900);
  for (let i = 0; i < nc; i++) {
    const cx = rnd(i, 11) * w, cy = rnd(i, 12) * h, r = 0.8 + rnd(i, 13) * 1.8;
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x * 0.8, y) + (hashf(x + i * 9, y, seed) - 0.5) * 1.2;
      if (d > r) continue;
      let X = Math.round(cx + x), Y = Math.round(cy + y);
      if (o.tile) { X = ((X % w) + w) % w; Y = ((Y % h) + h) % h; } else if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue;
      p.set(x0 + X, y0 + Y, d > r - 0.9 ? GM[6] : GM[7 + (x + y < 0 ? 1 : 0)]);
      if (d > r - 0.9) p.shade(x0 + X + 1, y0 + Y + 1, 0.7);
    }
  }
  // rust blooms
  const nr = Math.round(((o.rust ?? 0.4) * w * h) / 1400);
  for (let i = 0; i < nr; i++) {
    const cx = rnd(i, 21) * w, cy = rnd(i, 22) * h, r = 1 + rnd(i, 23) * 2.6;
    for (let y = -4; y <= 6; y++) for (let x = -4; x <= 4; x++) {
      const d = Math.hypot(x, y * (y > 0 ? 0.55 : 1)) + (hashf(x + i * 5, y, seed + 2) - 0.5) * 1.6;
      if (d > r) continue;
      let X = Math.round(cx + x), Y = Math.round(cy + y);
      if (o.tile) { X = ((X % w) + w) % w; Y = ((Y % h) + h) % h; } else if (X < 1 || Y < 1 || X >= w - 1 || Y >= h - 1) continue;
      if (hashf(X, Y, seed + 4) < 0.35 + (1 - d / r) * 0.5) p.set(x0 + X, y0 + Y, RS[clampi(Math.floor(1 + (1 - d / r) * 3 + hashf(X, Y, 8) - 0.5), 0, 4)]);
    }
  }
}
export function mixc(a: number, b: number, t: number) {
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t), g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t), bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}
/** 1px bevel: light top/left, dark bottom/right (or inverted for a recess) */
export function bevel(p: Pix, x: number, y: number, w: number, h: number, lt: number, dk: number, inset = false) {
  const a = inset ? dk : lt, b = inset ? lt : dk;
  p.hl(x, x + w - 2, y, a); p.vl(x, y, y + h - 2, a);
  p.hl(x + 1, x + w - 1, y + h - 1, b); p.vl(x + w - 1, y + 1, y + h - 1, b);
}
/** a recessed well: hard dark outline, shadowed top/left inner wall, lit bottom/right lip */
export function well(p: Pix, x: number, y: number, w: number, h: number, fill: number | null, R = GM) {
  if (fill !== null) p.rect(x, y, w, h, fill);
  p.hl(x - 1, x + w, y - 1, R[1]); p.vl(x - 1, y - 1, y + h, R[1]);
  p.hl(x - 1, x + w, y + h, R[6]); p.vl(x + w, y - 1, y + h, R[6]);
  p.set(x - 1, y + h, R[3]); p.set(x + w, y - 1, R[3]);
  for (let i = 0; i < w; i++) p.shade(x + i, y, 0.55);
  for (let j = 0; j < h; j++) p.shade(x, y + j, 0.62);
}
/** chamfered (cut-corner) plate silhouette mask */
export function chamfer(x: number, y: number, w: number, h: number, c: number) {
  return x + y < c || (w - 1 - x) + y < c || x + (h - 1 - y) < c || (w - 1 - x) + (h - 1 - y) < c;
}

// ------------------------------------------------------------------ hardware
/** dome rivet, 4x4, with a cast shadow */
export function rivet(p: Pix, x: number, y: number, R = GM, cast = true) {
  if (cast) { p.shade(x + 4, y + 1, 0.6); p.shade(x + 4, y + 2, 0.6); p.shade(x + 1, y + 4, 0.6); p.shade(x + 2, y + 4, 0.6); p.shade(x + 3, y + 3 + 1, 0.7); p.shade(x + 4, y + 3, 0.7); }
  const m = R.length;
  const L = R[m - 2], H = R[m - 1], M = R[Math.floor(m * 0.55)], D = R[Math.floor(m * 0.3)], K = R[1];
  p.set(x + 1, y, M); p.set(x + 2, y, D);
  p.set(x, y + 1, M); p.set(x + 1, y + 1, H); p.set(x + 2, y + 1, L); p.set(x + 3, y + 1, D);
  p.set(x, y + 2, D); p.set(x + 1, y + 2, L); p.set(x + 2, y + 2, M); p.set(x + 3, y + 2, K);
  p.set(x + 1, y + 3, K); p.set(x + 2, y + 3, K);
}
/** small 3x3 rivet */
export function rivet3(p: Pix, x: number, y: number, R = GM) {
  const m = R.length;
  p.set(x + 1, y, R[m - 3]); p.set(x, y + 1, R[m - 3]); p.set(x + 1, y + 1, R[m - 1]); p.set(x + 2, y + 1, R[Math.floor(m * 0.35)]); p.set(x + 1, y + 2, R[1]);
  p.shade(x + 2, y + 2, 0.55); p.shade(x + 3, y + 2, 0.75); p.shade(x + 2, y + 3, 0.75);
}
/** slotted round-head screw 5x5 */
export function screw(p: Pix, x: number, y: number, seed = 0, R = GM) {
  const m = R.length;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    const d = Math.hypot(i - 2, j - 2); if (d > 2.5) continue;
    const l = (2 - i) * 0.5 + (2 - j) * 0.6;
    p.set(x + i, y + j, d > 1.9 ? R[2] : R[clampi(Math.round(m * 0.55 + l), 0, m - 1)]);
  }
  const a = hashf(x, y, seed) * Math.PI;
  const dx = Math.round(Math.cos(a) * 1.6), dy = Math.round(Math.sin(a) * 1.6);
  p.line(x + 2 - dx, y + 2 - dy, x + 2 + dx, y + 2 + dy, R[1]);
  p.shade(x + 5, y + 2, 0.6); p.shade(x + 5, y + 3, 0.6); p.shade(x + 2, y + 5, 0.6); p.shade(x + 3, y + 5, 0.6); p.shade(x + 4, y + 4, 0.65);
}
/** hex bolt head 6x6 */
export function bolt(p: Pix, x: number, y: number, R = GM) {
  const rows = ['.1122.', '122234', '123345', '123345', '.23455', '..455.'];
  const m = R.length, map = [0, m - 1, m - 2, Math.floor(m * 0.6), Math.floor(m * 0.42), 2];
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') p.set(x + i, y + j, R[map[+ch]]); }));
  p.shade(x + 6, y + 2, 0.6); p.shade(x + 6, y + 3, 0.6); p.shade(x + 6, y + 4, 0.6); p.shade(x + 3, y + 6, 0.6); p.shade(x + 4, y + 6, 0.6); p.shade(x + 5, y + 5, 0.6);
}
/** yellow and black hazard stripes with worn edges */
export function hazard(p: Pix, x: number, y: number, w: number, h: number, seed = 3, flip = false) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (((flip ? -i : i) + j) % 8 + 8) % 8 < 4;
    let c = k ? (j === 0 ? HZ.yl : j === h - 1 ? HZ.yd : HZ.y) : j === 0 ? HZ.kl : HZ.k;
    const wear = hashf(x + i, y + j, seed);
    if (k && wear < 0.07) c = GM[5];
    else if (k && wear < 0.14) c = HZ.yd;
    else if (!k && wear < 0.05) c = GM[4];
    p.set(x + i, y + j, c);
  }
  p.hl(x, x + w - 1, y - 1, INK); p.hl(x, x + w - 1, y + h, INK);
}
/** louvred vent */
export function vent(p: Pix, x: number, y: number, w: number, n: number, R = GM) {
  for (let k = 0; k < n; k++) {
    const yy = y + k * 3;
    p.hl(x, x + w - 1, yy, INK); p.hl(x, x + w - 1, yy + 1, R[2]); p.hl(x + 1, x + w - 1, yy + 2, R[6]);
    p.set(x, yy + 1, R[1]); p.set(x + w - 1, yy + 1, R[4]);
  }
}
/** perforated speaker grille */
export function grille(p: Pix, x: number, y: number, w: number, h: number) {
  for (let j = 0; j < h; j += 2) for (let i = (j / 2) % 2; i < w; i += 2) { p.set(x + i, y + j, INK); p.shade(x + i + 1, y + j + 1, 1.25); }
}
export type PlateKind = 'brass' | 'cream' | 'black' | 'red' | 'steel';
/** riveted label plate with stencilled text; returns its width */
export function plate(p: Pix, x: number, y: number, s: string, kind: PlateKind = 'brass', o: { w?: number; pad?: number; screws?: boolean; center?: boolean } = {}) {
  const pad = o.pad ?? 3, screws = o.screws ?? true;
  const tw = textW(s), w = o.w ?? tw + pad * 2 + (screws ? 8 : 0), h = 9;
  const R = kind === 'brass' ? BR : kind === 'cream' ? CR : kind === 'red' ? RD : kind === 'black' ? BK : GM;
  const m = R.length;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if ((i === 0 || i === w - 1) && (j === 0 || j === h - 1)) continue;
    let v = m * 0.5 + (j < 2 ? 1.2 : j > h - 3 ? -1 : 0) + (hashf(x + i, y + j, 4) - 0.5) * 0.9 - i / w * 0.6;
    if (i === 0 || j === 0) v = m - 1.2; if (i === w - 1 || j === h - 1) v = 1.5;
    p.set(x + i, y + j, dv(R, v, x + i, y + j));
  }
  p.shade(x + w, y + 1, 0.6); p.hl(x + 1, x + w, y + h, INK, 140);
  const ink = kind === 'brass' ? BR[1] : kind === 'cream' ? 0x2a2418 : kind === 'red' ? CR[4] : kind === 'black' ? CR[3] : GM[1];
  const tx = o.center === false ? x + pad + (screws ? 4 : 0) : x + Math.floor((w - tw) / 2);
  text(p, s, tx, y + 2, ink, kind === 'black' || kind === 'red' ? 'flat' : 'engrave', R[m - 1], R[1]);
  if (screws) { p.set(x + 2, y + 4, R[1]); p.set(x + 3, y + 4, R[m - 2]); p.set(x + w - 4, y + 4, R[1]); p.set(x + w - 3, y + 4, R[m - 2]); }
  return w;
}
/** copper or steel pipe run (axis aligned), with flange collars */
export function pipe(p: Pix, x: number, y: number, len: number, vertical: boolean, R = CU, th = 4, flanges: number[] = []) {
  for (let t = 0; t < len; t++) for (let k = 0; k < th; k++) {
    const v = [R.length - 2, R.length - 1, Math.floor(R.length * 0.5), 2, 1, 1][Math.min(5, Math.floor((k / th) * 5.99))];
    const c = R[clampi(v + (hashf(t, k, 5) < 0.08 ? -1 : 0), 0, R.length - 1)];
    if (vertical) p.set(x + k, y + t, c); else p.set(x + t, y + k, c);
  }
  for (const f of flanges) for (let k = -1; k <= th; k++) for (let q = 0; q < 2; q++) {
    const c = k === -1 ? GM[7] : k === th ? GM[2] : q === 0 ? GM[6] : GM[4];
    if (vertical) p.set(x + k, y + f + q, c); else p.set(x + f + q, y + k, c);
  }
}

// ------------------------------------------------------------------ tile + 9-slice frames
const cache = new Map<string, string>();
function memo(k: string, f: () => string) { let u = cache.get(k); if (!u) cache.set(k, (u = f())); return u; }

/** tileable plate texture */
export function plateTile(tone: 'olive' | 'gun' | 'deep' | 'phos' = 'olive') {
  return memo('pt:' + tone, () => {
    const p = new Pix(64, 64);
    if (tone === 'phos') {
      // phosphor screen interior: near-black green with faint persistence noise
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const n = tileFbm(x, y, 64, 64, 4, 3, 77); p.set(x, y, dv(PH, 1.2 + (n - 0.5) * 1.2, x, y)); }
      return p.url();
    }
    const R = tone === 'olive' ? OL : tone === 'gun' ? GM : GM.slice(0, 6);
    metal(p, 0, 0, 64, 64, R, { tile: true, seed: tone === 'olive' ? 11 : 17, base: tone === 'deep' ? 2.3 : R.length * 0.48, rough: tone === 'deep' ? 0.45 : 0.6, brushed: 0.4, scratches: tone === 'deep' ? 0.12 : 1.1, grime: tone === 'deep' ? 0.25 : 0.45, rust: tone === 'olive' ? 0.6 : 0, chips: tone === 'olive' ? 0.9 : 0 });
    return p.url();
  });
}

/** heavy riveted housing frame, 36x36 source, 12px slices */
export function housingFrame(tone: 'olive' | 'gun' = 'olive') {
  return memo('hf:' + tone, () => {
    const S = 36, p = new Pix(S, S), R = tone === 'olive' ? OL : GM;
    metal(p, 0, 0, S, S, R, { seed: 5, base: R.length * 0.52, rough: 0.5, scratches: 1.2, light: 0.4, rust: 0, chips: 0.3, grime: 0.3 });
    // silhouette: chamfered corners and black outline
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (chamfer(x, y, S, S, 4)) p.clear(x, y);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!p.a(x, y)) continue;
      const edge = !p.a(x - 1, y) || !p.a(x + 1, y) || !p.a(x, y - 1) || !p.a(x, y + 1) || x === 0 || y === 0 || x === S - 1 || y === S - 1;
      if (edge) p.set(x, y, INK);
    }
    // raised lip
    for (let i = 3; i < S - 3; i++) { p.set(i, 1, R[R.length - 2]); p.set(1, i, R[R.length - 3]); p.set(i, S - 2, R[1]); p.set(S - 2, i, R[2]); }
    for (let k = 0; k < 3; k++) { p.set(1 + k, 3 - k, R[R.length - 2]); p.set(S - 2 - k, 3 - k, R[4]); p.set(1 + k, S - 4 + k, R[3]); p.set(S - 2 - k, S - 4 + k, R[1]); }
    // inner groove + recess shadow into the interior
    for (let i = 10; i < S - 10; i++) { p.set(i, 10, R[1]); p.set(10, i, R[1]); p.set(i, S - 11, R[R.length - 3]); p.set(S - 11, i, R[R.length - 3]); }
    p.set(10, S - 11, R[2]); p.set(S - 11, 10, R[2]);
    for (let y = 11; y < S - 11; y++) for (let x = 11; x < S - 11; x++) p.clear(x, y);
    // rivets along the band (two per 12px repeat), bolts at the corners
    for (const t of [13, 19]) { rivet3(p, t, 4); rivet3(p, t, S - 8); rivet3(p, 4, t); rivet3(p, S - 8, t); }
    for (const [x, y] of [[3, 3], [S - 9, 3], [3, S - 9], [S - 9, S - 9]]) screw(p, x, y, x * 3 + y, tone === 'olive' ? BR : GM);
    return p.url();
  });
}
/** CRT bezel, 24x24 source, 8px slices; the screen corners are rounded */
export function crtFrame() {
  return memo('crt', () => {
    const S = 24, p = new Pix(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (chamfer(x, y, S, S, 2)) continue;
      const v = 4.2 + (hashf(x, y, 3) - 0.5) * 0.8 - (x + y) / S * 0.6;
      p.set(x, y, dv(GM, v, x, y));
    }
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (!p.a(x, y)) continue;
      if (!p.a(x - 1, y) || !p.a(x + 1, y) || !p.a(x, y - 1) || !p.a(x, y + 1) || x === 0 || y === 0 || x === S - 1 || y === S - 1) p.set(x, y, INK);
    }
    for (let i = 2; i < S - 2; i++) { p.set(i, 1, GM[7]); p.set(1, i, GM[6]); p.set(i, S - 2, GM[2]); p.set(S - 2, i, GM[2]); }
    // screen opening: rounded rectangle from 6..17 with radius 3, black gasket, glow lip
    const x0 = 5, x1 = S - 6, r = 3;
    for (let y = x0; y <= x1; y++) for (let x = x0; x <= x1; x++) {
      const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, x0 + r), x1 - r);
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 0.5) continue;
      p.set(x, y, d > r - 0.5 ? INK : PH[1]);
    }
    // gasket bevel around the opening
    for (let i = x0 + r; i <= x1 - r; i++) { p.set(i, x0 - 1, GM[1]); p.set(x0 - 1, i, GM[1]); p.set(i, x1 + 1, GM[6]); p.set(x1 + 1, i, GM[6]); }
    for (let y = 8; y < S - 8; y++) for (let x = 8; x < S - 8; x++) p.clear(x, y);
    // tiny screws in the bezel corners
    for (const [x, y] of [[1, 1], [S - 4, 1], [1, S - 4], [S - 4, S - 4]]) { p.set(x + 1, y + 1, GM[8]); p.set(x + 2, y + 1, GM[5]); p.set(x + 1, y + 2, GM[3]); }
    return p.url();
  });
}
/** recessed socket, 18x18 source, 6px slices */
export function wellFrame() {
  return memo('well', () => {
    const S = 18, p = new Pix(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const o = Math.min(x, y, S - 1 - x, S - 1 - y);
      if (chamfer(x, y, S, S, 2)) continue;
      if (o === 0) p.set(x, y, x === S - 1 || y === S - 1 ? GM[6] : GM[2]);
      else if (o === 1) p.set(x, y, x >= S - 2 || y >= S - 2 ? BR[5] : BR[2]);
      else if (o === 2) p.set(x, y, INK);
      else p.set(x, y, PH[1]);
    }
    for (let i = 3; i < S - 3; i++) { p.shade(i, 3, 0.5); p.shade(3, i, 0.6); }
    for (let y = 6; y < S - 6; y++) for (let x = 6; x < S - 6; x++) p.clear(x, y);
    return p.url();
  });
}
/** Bakelite push key in a steel bezel, 24x24, 8px slices. n normal, h hover (lamp lit), p pressed, d dead, a armed */
export function keyFrame(st: 'n' | 'h' | 'p' | 'd' | 'a') {
  return memo('key:' + st, () => {
    const S = 24, p = new Pix(S, S);
    const pressed = st === 'p', dead = st === 'd';
    // bezel: the square hole in the panel, its upper-left wall in shadow
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (chamfer(x, y, S, S, 2)) continue;
      const o = Math.min(x, y, S - 1 - x, S - 1 - y);
      if (o === 0) p.set(x, y, INK);
      else if (o === 1) p.set(x, y, x === S - 2 || y === S - 2 ? GM[6] : GM[2]);
      else p.set(x, y, INK);
    }
    const face = dead ? BK.map((c) => mixc(c, 0x1c1c1a, 0.5)) : st === 'a' ? BK.map((c, i) => mixc(c, AM[Math.min(7, i + 2)], 0.2)) : st === 'h' ? BK.map((c, i) => mixc(c, GM[Math.min(9, i + 3)], 0.18)) : BK;
    const o = pressed ? 1 : 0, x0 = 3 + o, y0 = 3 + o, x1 = S - 4 + o, y1 = S - 4 + o;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if ((x === x0 || x === x1) && (y === y0 || y === y1)) continue;
      let v = 2.5 + (hashf(x, y, 7) - 0.5) * 0.5 - (y < 8 ? -0.3 : y > 15 ? 0.3 : 0) - (pressed ? 0.6 : 0);
      if (y === y0 || x === x0) v = pressed ? 1.6 : 5.3;
      else if (y === y1 || x === x1) v = pressed ? 3 : 0.4;
      else if (y === y0 + 1 || x === x0 + 1) v = pressed ? 2.2 : 4;
      else if (y === y1 - 1 || x === x1 - 1) v = pressed ? 2.6 : 1.4;
      p.set(x, y, dv(face, v, x, y));
    }
    // corner pilot lamp
    const L = st === 'h' || st === 'p' ? [PH[6], PH[9]] : st === 'a' ? [AM[4], AM[7]] : dead ? [BK[1], BK[2]] : [PH[2], PH[4]];
    const lx = x0 + 2, ly = y0 + 2;
    p.set(lx, ly, L[1]); p.set(lx + 1, ly, L[0]); p.set(lx, ly + 1, L[0]); p.set(lx + 1, ly + 1, L[0]);
    p.set(lx + 2, ly + 1, INK, 150); p.set(lx + 1, ly + 2, INK, 150); p.set(lx + 2, ly + 2, INK, 120);
    return p.url();
  });
}
/** segmented lamp-bar fill */
export function segBarURL(col: number, w = 40) {
  return memo('sb:' + col + ':' + w, () => {
    const p = new Pix(w, 6), R = [mixc(col, 0, 0.75), mixc(col, 0, 0.45), col, mixc(col, 0xffffff, 0.35), mixc(col, 0xffffff, 0.7)];
    for (let x = 0; x < w; x++) for (let y = 0; y < 6; y++) {
      if (x % 4 === 3) { p.set(x, y, mixc(col, 0, 0.82)); continue; }
      p.set(x, y, y === 0 ? R[1] : y === 1 ? R[4] : y === 2 ? R[3] : y === 5 ? R[0] : R[2]);
    }
    return p.url();
  });
}

// ------------------------------------------------------------------ sprites
/** indicator lamp sheet: [off, dim, on] frames of 7x7 (chrome bezel, coloured glass dome) */
export function lampSheet(R: number[]) {
  return memo('lamp:' + R[3], () => {
    const p = new Pix(21, 7);
    for (let f = 0; f < 3; f++) {
      const ox = f * 7;
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const d = Math.hypot(x - 3, y - 3);
        if (d > 3.4) continue;
        if (d > 2.5) { p.set(ox + x, y, x + y < 6 ? GM[8] : GM[3]); continue; }
        const l = (3 - x) * 0.4 + (3 - y) * 0.5;
        const m = R.length;
        const base = f === 0 ? 1.2 : f === 1 ? m * 0.45 : m * 0.72;
        p.set(ox + x, y, dv(R, base + l * (f === 0 ? 0.4 : 0.8) - d * (f === 2 ? 0.3 : 0.15), ox + x, y));
      }
      p.set(ox + 2, 2, f === 0 ? R[3] : 0xffffff); if (f === 2) p.set(ox + 3, 3, R[R.length - 1]);
      p.set(ox + 1, 1, GM[9]);
    }
    return p.url();
  });
}
/** a 9x20 vacuum tube: glass envelope, getter flash, plates, filament glow (frames: off, warm, hot) */
export function tubeSheet() {
  return memo('tube', () => {
    const W = 9, H = 20, p = new Pix(W * 3, H);
    for (let f = 0; f < 3; f++) {
      const o = f * W;
      // base: Bakelite with pins
      for (let x = 1; x < 8; x++) for (let y = 15; y < 19; y++) p.set(o + x, y, y === 15 ? BK[4] : x < 3 ? BK[3] : x > 6 ? BK[0] : BK[2]);
      p.set(o + 2, 19, GM[7]); p.set(o + 4, 19, GM[7]); p.set(o + 6, 19, GM[7]);
      // glass envelope
      for (let y = 0; y < 15; y++) for (let x = 1; x < 8; x++) {
        const rx = 3.4, cx = 4, top = y < 3 ? 3 - y : 0;
        if (Math.abs(x - cx) > rx - top * 0.9) continue;
        const edge = Math.abs(x - cx) > rx - top * 0.9 - 1 || y === 0;
        p.set(o + x, y, edge ? 0x5a6a6a : 0x1c2426, edge ? 255 : 230);
      }
      p.set(o + 4, 0, 0x6a7878);
      // getter mirror at the crown
      p.set(o + 3, 1, 0x8a9aa0); p.set(o + 4, 1, 0xc0ccd0); p.set(o + 5, 1, 0x6a7a80);
      // anode plates + filament
      const glow = f === 0 ? null : f === 1 ? AM[4] : AM[6];
      for (let y = 4; y < 13; y++) { p.set(o + 2, y, GM[4]); p.set(o + 6, y, GM[3]); }
      for (let y = 5; y < 12; y++) { p.set(o + 4, y, glow ?? GM[5]); if (glow) { p.set(o + 3, y, AM[f === 2 ? 4 : 2], 200); p.set(o + 5, y, AM[f === 2 ? 4 : 2], 200); } }
      if (f === 2) { p.set(o + 4, 7, AM[7]); p.set(o + 4, 9, AM[7]); }
      // glass highlight
      p.set(o + 2, 3, 0xd8f0f0); p.set(o + 2, 4, 0xa0c0c0); p.set(o + 2, 5, 0x80a0a0, 180);
      p.set(o + 4, 14, GM[6]); p.hl(o + 2, o + 6, 14, GM[5]);
    }
    return p.url();
  });
}
/** toggle switch, frames up / down (11x15): knurled chrome collar, hex nut, a tapered bat with a ball end */
export function toggleSheet() {
  return memo('tog', () => {
    const W = 11, H = 15, p = new Pix(W * 2, H);
    for (let f = 0; f < 2; f++) {
      const o = f * W, cx = 5, cy = 7.5, up = f === 0;
      // shadow of the whole switch
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - cx - 1, y - cy - 1) <= 4) p.set(o + x, y, INK, 90);
      // knurled collar
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - cx, y - cy); if (d > 4.2) continue;
        const lit = -((x - cx) * -0.55 + (y - cy) * -0.83) / Math.max(1, d);
        if (d > 3.3) { const k = Math.abs(Math.round(Math.atan2(y - cy, x - cx) * 3)) % 2; p.set(o + x, y, lit > 0.3 ? GM[k ? 8 : 7] : lit < -0.3 ? GM[k ? 2 : 3] : GM[k ? 5 : 4]); }
        else p.set(o + x, y, dv(GM, 6 + lit * 2 - d * 0.4, o + x, y));
      }
      // hex nut face
      for (const [x, y] of [[4, 6], [5, 6], [6, 6], [4, 7], [6, 7], [4, 8], [5, 8], [6, 8]]) p.set(o + x, y, GM[3]);
      p.set(o + 5, 7, INK);
      // the bat
      const ys = up ? [6, 5, 4, 3, 2] : [9, 10, 11, 12, 13];
      ys.forEach((y, k) => { const wd = k < 2 ? 1 : 0; for (let x = cx - wd; x <= cx + wd; x++) p.set(o + x, y, x < cx ? GM[9] : x > cx ? GM[5] : 0xf0f4f4); if (wd === 0) p.set(o + cx - 1, y, GM[8]); p.set(o + cx + wd + 1, y + 1, INK, 140); });
      const ty = up ? 1 : 14;
      p.set(o + 4, ty, GM[9]); p.set(o + 5, ty, 0xffffff); p.set(o + 6, ty, GM[6]);
      p.set(o + 5, ty + (up ? -1 : 1), GM[8]); p.set(o + 4, ty + (up ? 1 : -1), GM[8]); p.set(o + 6, ty + (up ? 1 : -1), GM[4]);
      p.set(o + 7, ty + 1, INK, 120);
    }
    return p.url();
  });
}
/** steam puff, 6 frames of 14x14: a tight white jet that billows out, thins and breaks up */
export function steamSheet() {
  return memo('steam', () => {
    const W = 14, p = new Pix(W * 6, W);
    for (let f = 0; f < 6; f++) {
      const k = f / 5, cy = 10.5 - k * 5;
      const blobs = [[7, cy, 2.2 + k * 2.6], [5.2 - k, cy + 1.2, 1.4 + k * 2], [8.8 + k, cy + 0.8, 1.5 + k * 2.2], [7 + k * 0.5, cy - 1.6 - k, 1.2 + k * 2.4]];
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        let best = 9;
        for (const [bx, by, br] of blobs) best = Math.min(best, Math.hypot(x - bx, y - by) / br);
        if (best > 1) continue;
        const fade = 1 - k * 0.75, edge = best > 0.75;
        if (bayer(x + f, y) > fade * (edge ? 0.75 : 1.15)) continue;
        const lit = (x - 7) + (y - cy) < -1;
        p.set(f * W + x, y, lit ? 0xf4f8f4 : edge ? 0xa4b0ac : 0xd0dad6, Math.round(235 * (edge ? 0.7 : 1)));
      }
    }
    return p.url();
  });
}
/** mechanical odometer drum strip: 0..9 then 0 again, 7x11 cells, cream numerals on a black drum */
export function drumStrip(ink = CR[4]) {
  return memo('drum:' + ink, () => {
    const W = 7, CH = 11, p = new Pix(W, CH * 11);
    for (let k = 0; k <= 10; k++) {
      const oy = k * CH;
      for (let y = 0; y < CH; y++) for (let x = 0; x < W; x++) p.set(x, oy + y, y === 0 ? 0x1a1816 : 0x0e0d0c);
      const g = glyph7(String(k % 10));
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i]) { p.set(1 + i, oy + 2 + j, j < 2 ? 0xfffaf0 : ink); p.set(2 + i, oy + 3 + j, 0x000000, 120); }
    }
    return p.url();
  });
}
/** nixie numerals: 0..9 and blank, 9x13 cells, orange cathode glow inside a mesh */
export function nixieSheet() {
  return memo('nixie', () => {
    const W = 9, H = 13, p = new Pix(W * 11, H);
    for (let k = 0; k < 11; k++) {
      const o = k * W;
      // anode mesh behind
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) p.set(o + x, y, (x + y) % 2 ? 0x161210 : 0x0c0a09);
      if (k === 10) continue;
      const g = glyph7(String(k));
      const glow = new Pix(W, H);
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) glow.set(2 + i + dx, 3 + j + dy, AM[3], 90);
      p.blit(glow, o, 0);
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i]) p.set(o + 2 + i, 3 + j, j === 0 || i === 0 ? AM[7] : AM[6]);
    }
    return p.url();
  });
}

// ------------------------------------------------------------------ cursors (32x32, drawn at 2x)
export function cursorURL(kind: 'point' | 'attack' | 'target' | 'build') {
  return memo('cur:' + kind, () => {
    const rows: Record<string, string[]> = {
      point: ['k...............', 'kwk.............', 'kwBk............', 'kwbBk...........', 'kwbbBk..........', 'kwbbbBk.........', 'kwbbbbBk........', 'kwbbbbbBk.......', 'kwbbbbbbBk......', 'kwbbbBkkkkk.....', 'kwbkbbk.........', 'kwk.kbBk........', 'kk..kbBk........', '.....kbBk.......', '.....kkk........', '................'],
      attack: ['................', '.......kk.......', '.......rk.......', '....kkkrkkk.....', '...krrrRrrrk....', '...kr.kRk.rk....', '.kkkrk...krkkk..', 'krrRRk...kRRrrk.', '.kkkrk...krkkk..', '...kr.kRk.rk....', '...krrrRrrrk....', '....kkkrkkk.....', '.......rk.......', '.......kk.......', '................', '................'],
      target: ['......kkkk......', '....kkggggkk....', '...kgk....kgk...', '..kgk..k...kgk..', '.kgk...g....kgk.', '.kg....g.....gk.', 'kg..kggwggk...gk', 'kg.....g......gk', '.kg....g.....gk.', '.kgk...k....kgk.', '..kgk......kgk..', '...kgk....kgk...', '....kkggggkk....', '......kkkk......', '................', '................'],
      build: ['kkkkk....kkkkk..', 'kyyyk....kyyyk..', 'kyk........kyk..', 'kyk........kyk..', 'kk..........kk..', '................', '......kkk.......', '......kyk.......', '......kkk.......', '................', 'kk..........kk..', 'kyk........kyk..', 'kyk........kyk..', 'kyyyk....kyyyk..', 'kkkkk....kkkkk..', '................'],
    };
    const C: Record<string, number> = { k: INK, w: 0xfff4d0, b: BR[6], B: BR[3], r: RD[6], R: RD[4], g: PH[8], y: HZ.yl };
    const p = new Pix(32, 32);
    rows[kind].forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { const c = C[ch]; p.rect(x * 2, y * 2, 2, 2, c); } }));
    return p.url();
  });
}

/** a blanking plate for an unused key slot: brushed steel, four screws, a stamped dash */
export function blankPlate() {
  return memo('blank', () => {
    const S = 24, p = new Pix(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (chamfer(x, y, S, S, 2)) continue;
      const o = Math.min(x, y, S - 1 - x, S - 1 - y);
      if (o === 0) { p.set(x, y, INK); continue; }
      if (o === 1) { p.set(x, y, x === S - 2 || y === S - 2 ? GM[2] : GM[6]); continue; }
      p.set(x, y, dv(GM, 3.6 + (hashf(0, y, 4) - 0.5) * 0.7 - (y / S) * 0.8, x, y));
    }
    for (const [x, y] of [[3, 3], [S - 6, 3], [3, S - 6], [S - 6, S - 6]]) { p.set(x + 1, y, GM[7]); p.set(x, y + 1, GM[7]); p.set(x + 1, y + 1, GM[2]); p.set(x + 2, y + 1, GM[5]); p.set(x + 1, y + 2, GM[4]); p.shade(x + 2, y + 2, 0.6); }
    for (let x = 9; x < 15; x++) { p.set(x, 11, GM[1]); p.set(x, 12, GM[6]); }
    return p.url();
  });
}

/** a tileable run of conduit for the screen edges: copper steam pipe, a rubber cable bundle, strap brackets */
export function conduitTile(flip = false) {
  return memo('cond:' + flip, () => {
    const W = 48, H = 12, p = new Pix(W, H);
    const Y = (y: number) => (flip ? H - 1 - y : y);
    // cable bundle (two rubber leads), sagging a hair between clamps
    for (let x = 0; x < W; x++) {
      const sag = Math.round(Math.sin((x / W) * Math.PI) * 1);
      for (let k = 0; k < 2; k++) { const y = 7 + sag + k * 2; p.set(x, Y(y), k ? 0x241a14 : 0x1a1a1c); p.set(x, Y(y + 1), k ? 0x120c0a : 0x0c0c0e); if ((x + k * 5) % 9 === 0) p.set(x, Y(y), k ? 0x3a2a20 : 0x2c2c30); }
    }
    // copper pipe
    pipe(p, 0, flip ? H - 6 : 1, W, false, CU, 5, [38]);
    // strap bracket with a bolt
    for (let y = 0; y < H; y++) for (let x = 14; x < 19; x++) p.set(x, y, x === 14 ? GM[7] : x === 18 ? GM[2] : dv(GM, 5 - y * 0.15, x, y));
    p.set(16, Y(2), GM[9]); p.set(16, Y(3), GM[3]); p.set(16, Y(9), GM[9]); p.set(16, Y(10), GM[3]);
    for (let y = 0; y < H; y++) p.shade(19, y, 0.6);
    return p.url();
  });
}

// ------------------------------------------------------------------ CSS registration
/** install the theme's pixel art as CSS custom properties */
export function installTheme(root: CSSStyleDeclaration) {
  root.setProperty('--housing', `url(${housingFrame('olive')})`);
  root.setProperty('--housing-g', `url(${housingFrame('gun')})`);
  root.setProperty('--crt', `url(${crtFrame()})`);
  root.setProperty('--well', `url(${wellFrame()})`);
  root.setProperty('--plate-ol', `url(${plateTile('olive')})`);
  root.setProperty('--plate-gm', `url(${plateTile('gun')})`);
  root.setProperty('--plate-dp', `url(${plateTile('deep')})`);
  root.setProperty('--phos', `url(${plateTile('phos')})`);
  for (const st of ['n', 'h', 'p', 'd', 'a'] as const) root.setProperty('--key-' + st, `url(${keyFrame(st)})`);
  root.setProperty('--lamp-g', `url(${lampSheet(PH)})`);
  root.setProperty('--lamp-a', `url(${lampSheet(AM)})`);
  root.setProperty('--lamp-r', `url(${lampSheet(RD)})`);
  root.setProperty('--tube', `url(${tubeSheet()})`);
  root.setProperty('--toggle', `url(${toggleSheet()})`);
  root.setProperty('--steam', `url(${steamSheet()})`);
  root.setProperty('--drum', `url(${drumStrip()})`);
  root.setProperty('--nixie', `url(${nixieSheet()})`);
  root.setProperty('--conduit', `url(${conduitTile()})`);
  root.setProperty('--blank', `url(${blankPlate()})`);
  root.setProperty('--conduit-b', `url(${conduitTile(true)})`);
  root.setProperty('--haz', `url(${memo('haz', () => { const p = new Pix(16, 6); hazard(p, 0, 0, 16, 6, 5); return p.url(); })})`);
}

// ------------------------------------------------------------------ embossed brass lettering from a pixel font
/** render a word in a pixel font, threshold it, then shade it as cast brass letters bolted to a plate */
export async function brassWord(word: string, font = 'Jersey', size = 30, R = BR): Promise<HTMLCanvasElement> {
  try { await document.fonts.load(`${size}px ${font}`); } catch { /* fall back to whatever is there */ }
  const m = document.createElement('canvas').getContext('2d')!;
  m.font = `${size}px ${font}`;
  const tw = Math.ceil(m.measureText(word).width) + 8, th = Math.ceil(size * 1.25) + 6;
  const c = document.createElement('canvas'); c.width = tw; c.height = th;
  const g = c.getContext('2d')!; g.font = `${size}px ${font}`; g.textBaseline = 'top'; g.fillStyle = '#fff'; g.fillText(word, 3, 2);
  const a = g.getImageData(0, 0, tw, th).data, on = (x: number, y: number) => x >= 0 && y >= 0 && x < tw && y < th && a[(y * tw + x) * 4 + 3] > 110;
  let y0 = th, y1 = 0; for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (on(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const p = new Pix(tw + 2, th + 2);
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    if (!on(x, y)) { if (on(x - 1, y - 1) || on(x - 2, y - 2)) p.set(x, y, INK, 170); continue; }
    const tl = !on(x - 1, y) || !on(x, y - 1), brr = !on(x + 1, y) || !on(x, y + 1);
    const k = (y - y0) / Math.max(1, y1 - y0);
    let v = R.length * 0.72 - k * 3.2 + (hashf(x, y, 3) - 0.5) * 0.6;
    if (k > 0.45 && k < 0.55) v += 1.2; // a lathe-polished band across the face
    if (tl) v = R.length - 1.2; else if (brr) v = 1.4;
    p.set(x, y, dv(R, v, x, y));
  }
  // outline everything
  const q = new Pix(p.w, p.h); q.d.set(p.d);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) q.set(x, y, INK);
  return q.canvas();
}
