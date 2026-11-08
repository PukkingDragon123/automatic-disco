// Shared helpers for the "Surfaces" texture stream (floors, walls, materials,
// doors, signs, decals). Pure functions over PixelCanvas — no registration here.
//
// House style: flat-ish fields of colour built from short hue-shifted ramps,
// soft clustered variation (low-frequency tileable noise, light ordered
// dither), then deliberate structure (grout, seams, bevels) and sparse,
// hand-placed details (chips, scuffs, stains). Never full-amplitude per-pixel
// noise.
import { PixelCanvas, bayer, mixHex, ph } from '../../gfx/pixel';
import { tileNoise2, Rng } from '../../core/rng';

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Tileable fbm in 0..1 (mean ~0.5). `cx`/`cy` are the base cell counts across
 * the canvas width/height, so the result wraps seamlessly on both axes.
 */
export function nz(pc: PixelCanvas, x: number, y: number, cx: number, cy: number = cx, oct = 3, seed = 0): number {
  let amp = 0.5, sum = 0, norm = 0, fx = cx, fy = cy;
  for (let i = 0; i < oct; i++) {
    sum += amp * tileNoise2((x / pc.w) * fx, (y / pc.h) * fy, fx, fy, seed + i * 131);
    norm += amp; amp *= 0.5; fx *= 2; fy *= 2;
  }
  return sum / norm;
}

/** Stretch an fbm value (≈0.25..0.75) to use the full 0..1 range. */
export const spread = (v: number, k = 2) => clamp01(0.5 + (v - 0.5) * k);

/** Quantise v (0..1) into a ramp with partial ordered dithering (d=0 hard bands, 1 full dither). */
export function q(R: number[], v: number, x: number, y: number, d = 0.5): number {
  const n = R.length;
  const f = clamp01(v) * (n - 1);
  let i = Math.floor(f);
  if (f - i > 0.5 + (bayer(x, y) - 0.5) * d) i++;
  return R[Math.min(n - 1, i)];
}

/** Fill the canvas through a ramp with a value function (thin wrapper with chosen dither). */
export function field(pc: PixelCanvas, R: number[], fn: (x: number, y: number) => number, d = 0.45) {
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) pc.set(x, y, q(R, fn(x, y), x, y, d));
}

/** Alpha-correct "over" compositing (for decals / cut-out textures). */
export function over(pc: PixelCanvas, x: number, y: number, c: number, a = 255) {
  if (a <= 0) return;
  const ea = pc.alpha(x, y);
  if (a >= 255 || ea === 0) { pc.set(x, y, c, Math.min(255, Math.round(a))); return; }
  const as = a / 255, ad = ea / 255;
  const oa = as + ad * (1 - as);
  pc.set(x, y, mixHex(pc.get(x, y), c, as / oa), Math.min(255, Math.round(oa * 255)));
}

/** Stamp a character bitmap. Characters not in `pal` are skipped. */
export function stamp(pc: PixelCanvas, x0: number, y0: number, rows: string[], pal: Record<string, number>, alpha = 255, flipX = false) {
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    for (let i = 0; i < r.length; i++) {
      const c = pal[r[i]];
      if (c === undefined) continue;
      pc.set(x0 + (flipX ? r.length - 1 - i : i), y0 + j, c, alpha);
    }
  }
}

/** Darken (f<1) or lighten (f>1) a pixel keeping its alpha. */
export function tint(pc: PixelCanvas, x: number, y: number, c: number, t: number) {
  const a = pc.alpha(x, y);
  if (!a) return;
  pc.set(x, y, mixHex(pc.get(x, y), c, t), a);
}

/** Recessed line: dark groove with a light lip on the side facing the light (below / right). */
export function grooveH(pc: PixelCanvas, x0: number, x1: number, y: number, dark: number, light: number, t = 1) {
  for (let x = x0; x <= x1; x++) { pc.blend(x, y, dark, t); pc.blend(x, y + 1, light, t * 0.8); }
}
export function grooveV(pc: PixelCanvas, x: number, y0: number, y1: number, dark: number, light: number, t = 1) {
  for (let y = y0; y <= y1; y++) { pc.blend(x, y, dark, t); pc.blend(x + 1, y, light, t * 0.8); }
}

/** Short scuff stroke (heel mark / scratch): a few pixels along a direction with fading ends. */
export function scuff(pc: PixelCanvas, x: number, y: number, len: number, dx: number, dy: number, c: number, t = 0.5) {
  for (let i = 0; i < len; i++) {
    const e = i === 0 || i === len - 1 ? 0.55 : 1;
    pc.blend(Math.round(x + dx * i), Math.round(y + dy * i), c, t * e);
  }
}

/** Sparse single/2-pixel flecks at random positions. */
export function flecks(pc: PixelCanvas, rng: Rng, colors: number[], count: number, pair = 0.25) {
  for (let i = 0; i < count; i++) {
    const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1), c = rng.pick(colors);
    pc.set(x, y, c);
    if (rng.chance(pair)) pc.set(x + (rng.chance(0.5) ? 1 : 0), y + (rng.chance(0.5) ? 1 : 0), c);
  }
}

/** Irregular soft blob mask value 0..1 (1 at centre) with a noisy edge — for stains, puddles, patches. */
export function blob(x: number, y: number, cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.35): number {
  const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
  const a = Math.atan2(dy, dx);
  const w = 1 + wob * (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 5 + seed * 2.3) * 0.3 + (ph(Math.floor((a + 4) * 4), seed, 3) - 0.5) * 0.6);
  const d = Math.sqrt(dx * dx + dy * dy) / w;
  return clamp01(1 - d);
}

/** Wrapped distance helper for tiling layouts. */
export function wd(a: number, b: number, period: number) { let d = Math.abs(a - b) % period; if (d > period / 2) d = period - d; return d; }

// ---------------------------------------------------------------------------
// Pixel fonts for signage. 3x5 (variable width) and a 3x3 micro font.
// ---------------------------------------------------------------------------
export const FONT5: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['#', '#', '#', '#', '#'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#', '##', '.#', '.#', '.#'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  '.': ['.', '.', '.', '.', '#'],
  '-': ['..', '..', '##', '..', '..'],
  ' ': ['..', '..', '..', '..', '..'],
};
export const FONT3: Record<string, string[]> = {
  A: ['.#.', '###', '#.#'],
  F: ['###', '##.', '#..'],
  L: ['#..', '#..', '###'],
  N: ['##.', '#.#', '#.#'],
  O: ['###', '#.#', '###'],
  S: ['.##', '.#.', '##.'],
  T: ['###', '.#.', '.#.'],
  Y: ['#.#', '.#.', '.#.'],
  ' ': ['.', '.', '.'],
};
export function textWidth(s: string, font = FONT5, gap = 1): number {
  let w = 0;
  for (const ch of s) w += (font[ch] ?? font[' '])[0].length + gap;
  return Math.max(0, w - gap);
}
export function drawText(pc: PixelCanvas, x: number, y: number, s: string, c: number, font = FONT5, gap = 1, shadow?: number): number {
  let cx = x;
  for (const ch of s) {
    const g = font[ch] ?? font[' '];
    if (shadow !== undefined) stamp(pc, cx + 1, y + 1, g, { '#': shadow });
    stamp(pc, cx, y, g, { '#': c });
    cx += g[0].length + gap;
  }
  return cx - x - gap;
}
