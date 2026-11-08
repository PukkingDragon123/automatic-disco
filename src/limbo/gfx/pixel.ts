// Pixel-art drawing toolkit used by every procedural texture and icon.
// Works on raw RGBA buffers; all coordinates are integer pixels and every
// texture is expected to be authored as hand-crafted pixel art: limited
// palettes (hue-shifted ramps), clustered dithering (organic, hand-placed
// looking clumps: never a bayer checkerboard on a world surface, it reads as
// screen-door noise once the texture is drawn in perspective), deliberate
// highlights and shadows — never smooth gradients or photo noise.

import { Rng, tileNoise2, hashf } from '../core/rng';

export const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];
export const bayer = (x: number, y: number) => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
export const BAYER8: number[] = (() => {
  const m = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  return m;
})();
export const bayer8 = (x: number, y: number) => (BAYER8[(y & 7) * 8 + (x & 7)] + 0.5) / 64;

// ---------------- colour helpers ----------------
export type RGB = [number, number, number];
export const toRGB = (hex: number): RGB => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
export const toHex = (r: number, g: number, b: number) =>
  ((Math.max(0, Math.min(255, Math.round(r))) << 16) | (Math.max(0, Math.min(255, Math.round(g))) << 8) | Math.max(0, Math.min(255, Math.round(b))));
export function mixHex(a: number, b: number, t: number): number {
  const A = toRGB(a), B = toRGB(b);
  return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function scaleHex(c: number, f: number): number {
  const A = toRGB(c); return toHex(A[0] * f, A[1] * f, A[2] * f);
}
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
export function hslToHex(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  if (s === 0) return toHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return toHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}

/**
 * Build a hue-shifted pixel-art ramp around a base colour: darker steps shift
 * hue toward cool/purple and lose saturation slightly, lighter steps shift
 * toward warm and gain lightness — the classic hand-pixelled shading ramp.
 */
export function makeRamp(base: number, steps = 6, opts: { hueShift?: number; spread?: number; satShift?: number } = {}): number[] {
  const [r, g, b] = toRGB(base);
  const [h, s, l] = rgbToHsl(r, g, b);
  const hueShift = opts.hueShift ?? 0.04, spread = opts.spread ?? 0.5, satShift = opts.satShift ?? 0.08;
  const out: number[] = [];
  const mid = (steps - 1) / 2;
  for (let i = 0; i < steps; i++) {
    const t = (i - mid) / Math.max(1, mid); // -1 .. 1
    const nl = Math.max(0.03, Math.min(0.97, l + t * spread * (t < 0 ? l : 1 - l)));
    // shadows drift toward blue/purple, highlights toward yellow
    const towardWarm = 0.12; const towardCool = 0.66;
    let nh = h;
    const shift = Math.abs(t) * hueShift;
    if (t < 0) nh = h + Math.sign(((towardCool - h + 1.5) % 1) - 0.5) * shift;
    else nh = h + Math.sign(((towardWarm - h + 1.5) % 1) - 0.5) * shift;
    const ns = Math.max(0, Math.min(1, s + (t < 0 ? -satShift * Math.abs(t) * 0.5 : satShift * t * 0.3)));
    out.push(hslToHex(nh, ns, nl));
  }
  return out;
}

// ---------------- canvas ----------------
export class PixelCanvas {
  readonly w: number; readonly h: number;
  readonly data: Uint8ClampedArray;
  wrap = true;
  constructor(w: number, h: number) { this.w = w; this.h = h; this.data = new Uint8ClampedArray(w * h * 4); }
  private cluster: Float32Array | null = null;
  /**
   * Dither threshold (0..1) for this canvas: smooth noise at ~3 px that tiles with the canvas plus a
   * little 2x2-block jitter. Ramp bands and blends break along wavy, clumped contours like hand
   * pixelling instead of a regular checker. bayer() stays available for deliberate patterns.
   */
  clusterT(x: number, y: number): number {
    if (!this.cluster) {
      const W = this.w, H = this.h, f = new Float32Array(W * H);
      const cx = Math.max(1, Math.round(W / 3)), cy = Math.max(1, Math.round(H / 3));
      const seed = (W * 73 + H * 151) % 997;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const n = tileNoise2((i / W) * cx, (j / H) * cy, cx, cy, seed);
        f[j * W + i] = Math.min(0.98, Math.max(0.02, 0.5 + (n - 0.5) * 1.7 + (hashf(i >> 1, j >> 1, seed + 5) - 0.5) * 0.22));
      }
      this.cluster = f;
    }
    const X = ((Math.floor(x) % this.w) + this.w) % this.w, Y = ((Math.floor(y) % this.h) + this.h) % this.h;
    return this.cluster[Y * this.w + X];
  }

  private idx(x: number, y: number): number {
    if (this.wrap) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; }
    else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return ((y | 0) * this.w + (x | 0)) * 4;
  }
  set(x: number, y: number, c: number, a = 255) {
    const i = this.idx(Math.floor(x), Math.floor(y)); if (i < 0) return;
    this.data[i] = (c >> 16) & 255; this.data[i + 1] = (c >> 8) & 255; this.data[i + 2] = c & 255; this.data[i + 3] = a;
  }
  setRGBA(x: number, y: number, r: number, g: number, b: number, a = 255) {
    const i = this.idx(Math.floor(x), Math.floor(y)); if (i < 0) return;
    this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
  }
  get(x: number, y: number): number {
    const i = this.idx(Math.floor(x), Math.floor(y)); if (i < 0) return 0;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }
  alpha(x: number, y: number): number { const i = this.idx(Math.floor(x), Math.floor(y)); return i < 0 ? 0 : this.data[i + 3]; }
  /** alpha-blend colour c over pixel */
  blend(x: number, y: number, c: number, t: number) {
    if (t <= 0) return;
    const i = this.idx(Math.floor(x), Math.floor(y)); if (i < 0) return;
    if (t >= 1) { this.set(x, y, c); return; }
    this.data[i] += (((c >> 16) & 255) - this.data[i]) * t;
    this.data[i + 1] += (((c >> 8) & 255) - this.data[i + 1]) * t;
    this.data[i + 2] += ((c & 255) - this.data[i + 2]) * t;
    if (this.data[i + 3] < 255) this.data[i + 3] = Math.max(this.data[i + 3], 255 * t);
  }
  /** multiply brightness of a pixel (f<1 darker) */
  shade(x: number, y: number, f: number) {
    const i = this.idx(Math.floor(x), Math.floor(y)); if (i < 0) return;
    this.data[i] *= f; this.data[i + 1] *= f; this.data[i + 2] *= f;
  }
  /** blend towards colour using ordered dither (pixel-art friendly) */
  ditherBlend(x: number, y: number, c: number, t: number) {
    if (t > this.clusterT(x, y)) this.set(x, y, c, this.alpha(x, y) || 255);
  }
  fill(c: number, a = 255) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c, a); }
  clear() { this.data.fill(0); }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }
  rectBlend(x: number, y: number, w: number, h: number, c: number, t: number) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.blend(x + i, y + j, c, t);
  }
  strokeRect(x: number, y: number, w: number, h: number, c: number) {
    for (let i = 0; i < w; i++) { this.set(x + i, y, c); this.set(x + i, y + h - 1, c); }
    for (let j = 0; j < h; j++) { this.set(x, y + j, c); this.set(x + w - 1, y + j, c); }
  }
  /** bevelled panel: light top-left edge, dark bottom-right edge */
  bevel(x: number, y: number, w: number, h: number, light: number, dark: number) {
    for (let i = 0; i < w; i++) { this.set(x + i, y, light); this.set(x + i, y + h - 1, dark); }
    for (let j = 0; j < h; j++) { this.set(x, y + j, light); this.set(x + w - 1, y + j, dark); }
  }
  hline(x0: number, x1: number, y: number, c: number) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c); }
  vline(x: number, y0: number, y1: number, c: number) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c); }
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
  }
  circle(cx: number, cy: number, r: number, c: number, a = 255) { this.ellipse(cx, cy, r, r, c, a); }
  ellipseBlend(cx: number, cy: number, rx: number, ry: number, c: number, t: number, soft = true) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1) this.blend(x, y, c, soft ? t * (1 - d) : t);
      }
  }
  /** dithered soft blob: pixels flip to colour with probability shaped by distance */
  ditherBlob(cx: number, cy: number, rx: number, ry: number, c: number, strength = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= 1 && (1 - d) * strength > this.clusterT(x, y)) this.set(x, y, c);
      }
  }
  /** Fill every pixel by a function returning 0..1 mapped through a ramp with ordered dithering */
  fillRamp(ramp: number[], fn: (x: number, y: number) => number, ditherAmt = 1) {
    const n = ramp.length;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      let v = fn(x, y); v = v < 0 ? 0 : v > 1 ? 1 : v;
      const f = v * (n - 1);
      let i = Math.floor(f);
      const frac = f - i;
      if (frac > 0.5 + (this.clusterT(x, y) - 0.5) * ditherAmt) i++;
      this.set(x, y, ramp[Math.min(n - 1, i)]);
    }
  }
  /** map existing luminance through a ramp (for recolouring) */
  remap(ramp: number[]) {
    const n = ramp.length;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = toRGB(this.get(x, y));
      const l = (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;
      this.set(x, y, ramp[Math.min(n - 1, Math.floor(l * n))], this.alpha(x, y));
    }
  }
  /** Iterate pixels */
  each(fn: (x: number, y: number) => void) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) fn(x, y); }
  /** Add 1px dark outline around opaque pixels (for icons/sprites) */
  outline(c: number) {
    const src = new Uint8ClampedArray(this.data);
    const was = this.wrap; this.wrap = false;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[(y * this.w + x) * 4 + 3] > 0) continue;
      let n = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < this.w && Y < this.h && src[(Y * this.w + X) * 4 + 3] > 0) n = true;
      }
      if (n) this.set(x, y, c);
    }
    this.wrap = was;
  }
  /** Copy another canvas into this one */
  blit(src: PixelCanvas, dx: number, dy: number, sx = 0, sy = 0, sw = src.w, sh = src.h) {
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      const i = ((sy + y) * src.w + sx + x) * 4;
      if (src.data[i + 3] === 0) continue;
      this.setRGBA(dx + x, dy + y, src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]);
    }
  }
  toImageData(): ImageData { return new ImageData(new Uint8ClampedArray(this.data), this.w, this.h); }

  // ---------- texture "treatments" that make surfaces feel handcrafted ----------
  /** Sprinkle single-pixel speckles of colours (dust, fibres, grit) */
  speckle(rng: Rng, colors: number[], density: number) {
    const n = Math.floor(this.w * this.h * density);
    for (let i = 0; i < n; i++) this.set(rng.int(0, this.w - 1), rng.int(0, this.h - 1), rng.pick(colors));
  }
  /** Dithered noise darkening (grime). seed for tileable noise. */
  grime(c: number, amount: number, cells = 4, seed = 7, threshold = 0.55) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const n = tileNoise2((x / this.w) * cells, (y / this.h) * cells, cells, cells, seed) * 0.65 +
        tileNoise2((x / this.w) * cells * 3, (y / this.h) * cells * 3, cells * 3, cells * 3, seed + 3) * 0.35;
      const t = (n - threshold) / (1 - threshold);
      if (t > 0 && t * amount > this.clusterT(x, y)) this.blend(x, y, c, 0.35 + 0.4 * t);
    }
  }
  /** Vertical drip stains running down from y0 */
  drips(rng: Rng, c: number, count: number, y0: number, maxLen: number, alpha = 0.35) {
    for (let k = 0; k < count; k++) {
      const x = rng.int(0, this.w - 1);
      const len = rng.int(Math.floor(maxLen * 0.3), maxLen);
      for (let y = 0; y < len; y++) {
        const t = 1 - y / len;
        this.blend(x, y0 + y, c, alpha * t);
        if (rng.chance(0.15)) this.blend(x + 1, y0 + y, c, alpha * t * 0.5);
      }
    }
  }
  /** Mottled stain blob with darker rim — water damage */
  stain(cx: number, cy: number, r: number, inner: number, rim: number, seed = 1) {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const a = Math.atan2(y - cy, x - cx);
      const wob = r * (0.75 + 0.35 * hashf(Math.floor((a + 4) * 3), seed, 9) + 0.15 * Math.sin(a * 5 + seed));
      const d = Math.hypot(x - cx, y - cy);
      if (d < wob - 1) this.blend(x, y, inner, 0.22);
      else if (d < wob + 0.5) this.blend(x, y, rim, 0.45);
    }
  }
}

/** Seeded per-pixel hash */
export const ph = (x: number, y: number, s = 0) => hashf(x, y, s);
