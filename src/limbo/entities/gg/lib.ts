// Shared painting helpers for the low-poly people (ported from the Gacha Garage people, src/people/paintlib.js):
// hashing, colour maths, hair strands. Colours are [r, g, b] arrays in sRGB 0..255; painters write into a
// reusable Float32Array(4) (r, g, b, a).
export type C3 = [number, number, number] | number[];
export type O4 = Float32Array;

export const hex = (c: number): number[] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const sstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const mixc = (a: C3, b: C3, t: number): number[] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulc = (a: C3, k: number): number[] => [a[0] * k, a[1] * k, a[2] * k];
export const G = (x: number, y: number, sx: number, sy: number) => { const e = (x * x) / (2 * sx * sx) + (y * y) / (2 * sy * sy); return e > 9 ? 0 : Math.exp(-e); };
export const lum3 = (c: C3) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;

/** Integer hash -> [0, 1). */
export function h2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise in 2D (bilinear between hashed lattice points). */
export function vnoise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** 3D value noise on body-space points (metres * f), for stains and splatter that run across faces */
export function vnoise3(x: number, y: number, z: number, s = 0): number {
  const a = vnoise(x + z * 0.73, y, s), b = vnoise(z - x * 0.41 + 17.3, y * 1.07 + 3.1, s + 7);
  return (a + b) * 0.5;
}

/** out = colour c * k (with a warm shadow shift so skin / fabric shadows don't go grey). */
export function shadeInto(o: O4, c: C3, k: number, warm = 0.12): O4 {
  const d = 1 - k;
  o[0] = c[0] * k * (1 + d * warm); o[1] = c[1] * k * (1 + d * warm * 0.2); o[2] = c[2] * k * (1 - d * warm * 0.9);
  return o;
}
/** Blend colour c over o with alpha t. */
export function over(o: O4, c: C3, t: number): O4 {
  if (t <= 0) return o;
  if (t > 1) t = 1;
  o[0] += (c[0] - o[0]) * t; o[1] += (c[1] - o[1]) * t; o[2] += (c[2] - o[2]) * t;
  return o;
}
/** o *= k (with the same warm shadow shift as shadeInto). */
export function scaleO(o: O4, k: number, warm = 0.12): O4 {
  const d = 1 - k;
  o[0] *= k * (1 + d * warm); o[1] *= k * (1 + d * warm * 0.2); o[2] *= k * (1 - d * warm * 0.9);
  return o;
}

export interface HairCol { col: number[]; hi: number[]; grey?: boolean; style: string; part?: number; volume?: number }
/**
 * Hair strands: u runs across strands (texels), v along them. k = light (1 normal). Returns into o.
 * hair: { col, hi } — base colour and sheen colour.
 */
export function hairPx(o: O4, hair: { col: C3; hi: C3 }, u: number, v: number, k = 1, sheen = 0): O4 {
  const s = Math.floor(u);
  const ha = h2(s, 7, 3), hb = h2(s >> 1, 9, 4);
  const strand = ha * 0.55 + hb * 0.45; // per-strand tone
  const along = 0.5 + 0.5 * Math.sin(v * 0.33 + ha * 6.28) * Math.sin(v * 0.11 + hb * 4);
  let t = 0.72 + strand * 0.42 + (along - 0.5) * 0.3;
  // clumps: darker gaps between hair locks
  const clump = Math.sin((u + Math.sin(v * 0.12 + s * 0.7) * 1.6) * 0.9);
  if (clump < 0) t += clump * 0.18;
  const c = hair.col, kt = t * k;
  o[0] = c[0] * kt; o[1] = c[1] * kt; o[2] = c[2] * kt; o[3] = 255;
  if (sheen > 0) {
    const sh = sheen * (0.55 + strand * 0.9) * (0.6 + along * 0.8);
    over(o, hair.hi, sh < 0.85 ? sh : 0.85);
  }
  return o;
}

/** a hair colour record (base + sheen) from a hex colour */
export function hairColour(c: number, grey = false): { col: number[]; hi: number[]; grey: boolean } {
  const hc = hex(c);
  const g = grey || (Math.abs(hc[0] - hc[1]) < 14 && Math.abs(hc[1] - hc[2]) < 14 && hc[0] > 120);
  const hi = g ? [250, 250, 248] : hc[0] < 80 ? mixc(hc, [176, 180, 214], 0.75) : mixc(hc, [255, 244, 222], 0.55);
  return { col: hc, hi, grey: g };
}

// tiny 3x5 pixel font for prints, patches and knuckle tattoos (original text only)
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110', ' ': '000000000000000', '-': '000000111000000',
  '+': '000010111010000', '.': '000000000000010',
};
/** is the glyph cell (gx, gy) of string s inked? gx in 0..len*4-1, gy 0..4 */
export function glyphAt(s: string, gx: number, gy: number): boolean {
  if (gy < 0 || gy > 4 || gx < 0) return false;
  const ci = Math.floor(gx / 4), cx = gx - ci * 4;
  if (ci >= s.length || cx > 2) return false;
  const g = FONT[s[ci].toUpperCase()] || FONT[' '];
  return g[gy * 3 + cx] === '1';
}
