// UI KIT · PIXELS. A small RGBA pixel buffer and the hand-painting primitives every kit painter uses: whole pixels
// only, colours from the master ramps (src/art/palette.ts), light from the upper left, a 1 px ink outline round every
// object, a lit lip on the top-left edges and a shaded one on the bottom-right. Ported and adapted from Limbophobia's
// hiPixel.ts (bevel, rivet, hazard, glass, the cell bar, EPX upscaling, the sprite shader) for ODDWORLD's palette.
import { RAMPS } from '../../art/palette';

export const P = RAMPS;
/** the ink: near-black with a cold lean (outlines, contours, text outlines) */
export const INK = 0x08090c;
export const hex = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
export const mixHex = (a: number, b: number, t: number) => {
  const k = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) * (1 - k) + ((b >> 16) & 255) * k, g = ((a >> 8) & 255) * (1 - k) + ((b >> 8) & 255) * k, bl = (a & 255) * (1 - k) + (b & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
/** a stable hash 0..1 */
export const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
/** the 4x4 ordered-dither threshold 0..1 */
export const bayer = (x: number, y: number) => [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16;
export type Ramp = readonly number[];
/** the ramp step at k (0..1 across the ramp), clamped */
export const tone = (r: Ramp, k: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(k * (r.length - 1))))];
export const at = (r: Ramp, i: number) => r[Math.max(0, Math.min(r.length - 1, i))];

/** an RGBA pixel buffer */
export class Px {
  readonly d: Uint8ClampedArray;
  constructor(readonly w: number, readonly h: number) { this.d = new Uint8ClampedArray(Math.max(1, w * h) * 4); }
  inb(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, c: number, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inb(x, y)) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255) { this.d[i] = (c >> 16) & 255; this.d[i + 1] = (c >> 8) & 255; this.d[i + 2] = c & 255; this.d[i + 3] = 255; return; }
    if (a <= 0) return;
    const k = a / 255, ia = this.d[i + 3] / 255, oa = k + ia * (1 - k);
    this.d[i] = (((c >> 16) & 255) * k + this.d[i] * ia * (1 - k)) / oa;
    this.d[i + 1] = (((c >> 8) & 255) * k + this.d[i + 1] * ia * (1 - k)) / oa;
    this.d[i + 2] = ((c & 255) * k + this.d[i + 2] * ia * (1 - k)) / oa;
    this.d[i + 3] = oa * 255;
  }
  get(x: number, y: number) { if (!this.inb(x, y)) return -1; const i = (y * this.w + x) * 4; return this.d[i + 3] ? (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2] : -1; }
  alpha(x: number, y: number) { return this.inb(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
  clear(x?: number, y?: number) { if (x === undefined || y === undefined) { this.d.fill(0); return; } if (this.inb(x, y)) this.d[(y * this.w + x) * 4 + 3] = 0; }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255) { x = Math.round(x); y = Math.round(y); for (let j = 0; j < Math.round(h); j++) for (let i = 0; i < Math.round(w); i++) this.set(x + i, y + j, c, a); }
  hl(x0: number, x1: number, y: number, c: number, a = 255) { for (let x = Math.round(Math.min(x0, x1)); x <= Math.max(x0, x1); x++) this.set(x, y, c, a); }
  vl(x: number, y0: number, y1: number, c: number, a = 255) { for (let y = Math.round(Math.min(y0, y1)); y <= Math.max(y0, y1); y++) this.set(x, y, c, a); }
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let n = 0; n < 4096; n++) { this.set(x0, y0, c, a); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  /** a filled disc lit from the upper left: f(d, lit, angle) picks the colour (or -1 to skip) */
  disc(cx: number, cy: number, r: number, f: (d: number, lit: number, a: number) => number) {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d > r) continue;
      const col = f(d, -(dx * 0.6 + dy * 0.8) / (d || 1), Math.atan2(dy, dx));
      if (col >= 0) this.set(x, y, col);
    }
  }
  /** blit another buffer (alpha-tested) */
  blit(o: Px, x: number, y: number) { for (let j = 0; j < o.h; j++) for (let i = 0; i < o.w; i++) { const k = (j * o.w + i) * 4; if (o.d[k + 3] > 0) this.set(x + i, y + j, (o.d[k] << 16) | (o.d[k + 1] << 8) | o.d[k + 2], o.d[k + 3]); } }
  /** darken (k < 1) or lighten (k > 1) a pixel in place */
  shade(x: number, y: number, k: number) { if (!this.inb(x, y)) return; const i = (y * this.w + x) * 4; this.d[i] *= k; this.d[i + 1] *= k; this.d[i + 2] *= k; }
  image() { return new ImageData(new Uint8ClampedArray(this.d), this.w, this.h); }
  canvas(cv?: HTMLCanvasElement) { const c = cv ?? document.createElement('canvas'); c.width = this.w; c.height = this.h; c.getContext('2d')!.putImageData(this.image(), 0, 0); return c; }
  url() { return this.canvas().toDataURL(); }
  /** a 1 px ink outline round everything opaque (8-way or 4-way) */
  outline(col = INK, eight = false) {
    const W = this.w, H = this.h, a = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) a[i] = this.d[i * 4 + 3] > 40 ? 1 : 0;
    const nb = eight ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (a[y * W + x]) continue;
      for (const [dx, dy] of nb) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && a[Y * W + X]) { this.set(x, y, col); break; } }
    }
    return this;
  }
}

// ------------------------------------------------------------------ primitives (all whole pixels)
/** a bevelled block: ink outline, chamfered corners, lit top-left lip, shaded bottom-right, a soft vertical ramp */
export function bevel(p: Px, x: number, y: number, w: number, h: number, r: Ramp, o: { ink?: boolean; chamfer?: number; sunk?: boolean; base?: number } = {}) {
  const n = r.length, ch = o.chamfer ?? (Math.min(w, h) >= 8 ? 2 : 1), mid = o.base ?? Math.floor(n / 2);
  if (o.ink !== false) {
    p.rect(x - 1 + ch, y - 1, w + 2 - ch * 2, h + 2, INK); p.rect(x - 1, y - 1 + ch, w + 2, h + 2 - ch * 2, INK);
    if (ch > 1) { p.set(x, y, INK); p.set(x + w - 1, y, INK); p.set(x, y + h - 1, INK); p.set(x + w - 1, y + h - 1, INK); }
  }
  const bands = o.sunk ? [mid - 1, mid, mid] : [mid + 1, mid, mid - 1];
  for (let j = 0; j < h; j++) {
    const b = bands[Math.min(2, Math.floor((j / Math.max(1, h)) * 3))], ins = ch > 1 && (j === 0 || j === h - 1) ? 1 : 0;
    p.rect(x + ins, y + j, w - ins * 2, 1, at(r, b));
  }
  const lip = o.sunk ? at(r, mid - 2) : at(r, mid + 2), shd = o.sunk ? at(r, mid + 1) : at(r, mid - 2), ins = ch > 1 ? 1 : 0;
  p.rect(x + ins, y, w - ins * 2, 1, lip); p.rect(x, y + ins, 1, h - ins * 2, lip);
  p.rect(x + ins, y + h - 1, w - ins * 2, 1, shd); p.rect(x + w - 1, y + ins, 1, h - ins * 2, shd);
  if (!o.sunk && w > 4 && h > 3) p.rect(x + 1 + ins, y + 1, Math.min(3, w - 3), 1, r[n - 1]);
}
/** a domed rivet (r 1 small, 2 large) */
export function rivet(p: Px, x: number, y: number, r = 1, ramp: Ramp = P.steel) {
  if (r <= 1) { p.rect(x - 1, y - 1, 3, 3, ramp[0]); p.rect(x - 1, y - 1, 2, 2, ramp[4]); p.set(x, y, ramp[3]); p.set(x - 1, y - 1, ramp[ramp.length - 1]); p.set(x + 1, y + 1, INK, 120); return; }
  p.rect(x - 2, y - 1, 5, 3, ramp[0]); p.rect(x - 1, y - 2, 3, 5, ramp[0]);
  p.rect(x - 1, y - 1, 3, 3, ramp[3]); p.rect(x - 1, y - 1, 2, 2, ramp[5]); p.set(x - 1, y - 1, ramp[ramp.length - 1]); p.set(x + 1, y + 1, ramp[2]);
  p.set(x + 2, y + 2, INK, 110);
}
/** a slotted screw head (5 x 5) in a ring of worn paint; the slot at one of four angles */
export function screw(p: Px, x: number, y: number, seed = 1) {
  const S = P.steel;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    if ((i === 0 || i === 4) && (j === 0 || j === 4)) continue;
    const edge = i === 0 || j === 0 || i === 4 || j === 4, lit = (2 - i) + (2 - j);
    p.set(x + i, y + j, edge ? (lit > 1 ? S[3] : S[0]) : lit > 1 ? S[5] : lit < -1 ? S[2] : S[4]);
  }
  const k = Math.floor(hash(seed, 3) * 4);
  const slot = k === 0 ? [[1, 2], [2, 2], [3, 2]] : k === 1 ? [[2, 1], [2, 2], [2, 3]] : k === 2 ? [[1, 1], [2, 2], [3, 3]] : [[3, 1], [2, 2], [1, 3]];
  for (const [i, j] of slot) p.set(x + i, y + j, S[1]);
  p.set(x + 1, y + 1, S[6]);
  p.set(x + 5, y + 3, INK, 90); p.set(x + 3, y + 5, INK, 90); p.set(x + 4, y + 4, INK, 120);
}
/** diagonal hazard stripes in a box */
export function hazard(p: Px, x: number, y: number, w: number, h: number, a = P.ochre[5], b = P.ink[0], period = 6, phase = 0) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const s = ((i + j + Math.floor(phase)) % period + period) % period < period / 2;
    p.set(x + i, y + j, s ? (j === 0 ? mixHex(a, 0xffffff, 0.3) : j === h - 1 ? mixHex(a, 0, 0.3) : a) : b);
  }
}
/** a recessed glass well: ink rim, an inner shadow on the top-left, a lit bottom-right lip, a hard glare */
export function glassWell(p: Px, x: number, y: number, w: number, h: number, tint = 0x0c1416, o: { glare?: boolean; lines?: boolean } = {}) {
  p.rect(x - 1, y - 1, w + 2, h + 2, INK);
  p.rect(x, y, w, h, tint);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const e = Math.min(i, j); if (e < 3) p.set(x + i, y + j, 0, 70 - e * 20); }
  if (o.lines) for (let j = 1; j < h; j += 2) p.rect(x, y + j, w, 1, 0, 40);
  p.hl(x, x + w, y + h, P.steel[5]); p.vl(x + w, y - 1, y + h, P.steel[4]);
  if (o.glare !== false) for (let k = 0; k < Math.min(w, h) * 0.6; k++) { p.set(x + 3 + k, y + h - 4 - k, 0xffffff, 26); p.set(x + 4 + k, y + h - 4 - k, 0xffffff, 16); }
}
/** the cell bar: a glass channel of lit cells (frac 0..1), a sweeping glint (t seconds) */
export function cellBar(p: Px, x: number, y: number, w: number, h: number, frac: number, ramp: Ramp = P.glowAmber, t = 0) {
  glassWell(p, x, y, w, h, 0x0b0d0e, { glare: false });
  const cw = Math.max(2, Math.round(h * 0.7)), gap = 1, n = Math.max(1, Math.floor((w - 2 + gap) / (cw + gap)));
  const used = n * (cw + gap) - gap, ox = x + 1 + Math.floor((w - 2 - used) / 2), lit = Math.max(0, Math.min(1, frac)) * n;
  for (let i = 0; i < n; i++) {
    const cx = ox + i * (cw + gap), k = Math.max(0, Math.min(1, lit - i));
    if (k <= 0) { p.rect(cx, y + 1, cw, h - 2, ramp[0], 150); continue; }
    for (let j = 0; j < h - 2; j++) p.rect(cx, y + 1 + j, cw, 1, j === 0 ? ramp[ramp.length - 1] : j < (h - 2) * 0.55 ? ramp[ramp.length - 2] : ramp[Math.max(0, ramp.length - 3)], k < 1 ? 120 + 135 * k : 255);
  }
  if (frac > 0.02) { const end = ox + Math.round(lit * (cw + gap)), gx = ox + ((t * 50) % Math.max(8, end - ox + 10)) - 6; for (let j = 0; j < h - 2; j++) { const px = Math.round(gx - j * 0.6); if (px >= ox && px < end) p.set(px, y + 1 + j, 0xffffff, 90); } }
}

// ------------------------------------------------------------------ EPX upscaling (char maps grown cleanly)
type Grid = string[][];
function scale2x(g: Grid): Grid {
  const H = g.length, W = g[0]?.length ?? 0, at2 = (x: number, y: number) => g[Math.max(0, Math.min(H - 1, y))][Math.max(0, Math.min(W - 1, x))];
  const out: Grid = Array.from({ length: H * 2 }, () => new Array(W * 2).fill('.'));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const Pc = g[y][x], A = at2(x, y - 1), B = at2(x + 1, y), C = at2(x - 1, y), D = at2(x, y + 1);
    out[y * 2][x * 2] = C === A && C !== D && A !== B ? A : Pc;
    out[y * 2][x * 2 + 1] = A === B && A !== C && B !== D ? B : Pc;
    out[y * 2 + 1][x * 2] = D === C && D !== B && C !== A ? C : Pc;
    out[y * 2 + 1][x * 2 + 1] = B === D && B !== A && D !== C ? D : Pc;
  }
  return out;
}
/** a char map grown k times (2, 4, 8) with edge-aware EPX rules */
export function upscaleRows(rows: string[], k: number): string[] {
  const W = Math.max(...rows.map((r) => r.length));
  let g: Grid = rows.map((r) => r.padEnd(W, '.').split(''));
  let left = Math.max(1, Math.round(k));
  while (left >= 2 && left % 2 === 0) { g = scale2x(g); left /= 2; }
  if (left > 1) g = g.flatMap((r) => Array.from({ length: left }, () => r.flatMap((c) => new Array(left).fill(c))));
  return g.map((r) => r.join(''));
}
/** stamp a char map into a buffer ('.' and ' ' are empty) */
export function stamp(p: Px, rows: string[], pal: Record<string, number>, x = 0, y = 0) {
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c !== undefined && r[i] !== '.' && r[i] !== ' ') p.set(x + i, y + j, c); } });
}

/**
 * light a flat-colour sprite in place (Limbophobia's shadeSprite): every colour region gets a bevelled height field,
 * a hue-shifted 5-step ramp (warm lights, cool shadows) broken with ordered dither, a lit lip with glints, dark lines
 * where materials meet, and an ink outline.
 */
export function shadeSprite(p: Px, o: { bevel?: number; light?: number; outline?: boolean; seed?: number } = {}) {
  const W = p.w, H = p.h, N = W * H, col = new Int32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) col[y * W + x] = p.alpha(x, y) > 0 ? p.get(x, y) : -1;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && col[y * W + x] >= 0;
  const bev = o.bevel ?? Math.max(2, Math.round(Math.min(W, H) / 9)), light = o.light ?? 1;
  const dR = new Float32Array(N).fill(1e4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = col[i]; if (c < 0) { dR[i] = 0; continue; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = op(x + dx, y + dy) ? col[(y + dy) * W + x + dx] : -1; if (q !== c) { dR[i] = 1; break; } }
  }
  const K: [number, number, number][] = [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.41], [1, -1, 1.41]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (col[i] < 0) continue; for (const [dx, dy, w] of K) { const X = x + dx, Y = y + dy; if (!op(X, Y) || col[Y * W + X] !== col[i]) continue; dR[i] = Math.min(dR[i], dR[Y * W + X] + w); } }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (col[i] < 0) continue; for (const [dx, dy, w] of K) { const X = x - dx, Y = y - dy; if (!op(X, Y) || col[Y * W + X] !== col[i]) continue; dR[i] = Math.min(dR[i], dR[Y * W + X] + w); } }
  const hgt = new Float32Array(N);
  for (let i = 0; i < N; i++) if (col[i] >= 0) hgt[i] = Math.min(1, (dR[i] - 0.5) / bev);
  const hAt = (x: number, y: number, i: number) => (op(x, y) ? hgt[y * W + x] : hgt[i] - 0.5);
  const out = new Int32Array(N).fill(-1), WARM = 0xfff0c8, COOL = 0x1a1530, seed = o.seed ?? 7;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = col[i]; if (c < 0) continue;
    const gx = (hAt(x + 1, y, i) - hAt(x - 1, y, i)) * 0.5 * bev, gy = (hAt(x, y + 1, i) - hAt(x, y - 1, i)) * 0.5 * bev, nl = Math.hypot(gx, gy, 1);
    const lit = (gx * 0.58 + gy * 0.68 + 0.45) / nl - 0.45, glob = (0.5 - y / H) * 0.3 + (0.5 - x / W) * 0.1;
    const v = lit * 1.15 * light + glob * light + (hash(x, y, seed) - 0.5) * 0.12;
    const lv = Math.max(-2, Math.min(2, Math.round(v * 3 + (bayer(x, y) - 0.5) * 0.7)));
    let cc = lv > 0 ? mixHex(c, WARM, 0.15 * lv) : lv < 0 ? mixHex(c, COOL, 0.19 * -lv) : c;
    if (lv >= 2 && dR[i] <= 1.5) cc = mixHex(cc, 0xffffff, hash(x >> 1, y >> 1, seed + 3) > 0.7 ? 0.5 : 0.28);
    out[i] = cc;
  }
  const lum = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = col[i]; if (c < 0) continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) { if (!op(x + dx, y + dy)) continue; const q = col[(y + dy) * W + x + dx]; if (q !== c && lum(c) < lum(q) - 18) { out[i] = mixHex(out[i], INK, 0.4); break; } }
  }
  p.clear();
  for (let i = 0; i < N; i++) if (out[i] >= 0) p.set(i % W, Math.floor(i / W), out[i]);
  if (o.outline !== false) p.outline(INK);
  return p;
}

/** a canvas sized for crisp whole pixels: w x h art pixels shown at `scale` CSS px each */
export function crisp(w: number, h: number, scale = 2): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.style.width = w * scale + 'px'; cv.style.height = h * scale + 'px';
  cv.style.imageRendering = 'pixelated';
  const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
  return { cv, c };
}
