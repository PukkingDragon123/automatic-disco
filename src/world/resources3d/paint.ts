// The resource materials, painted by hand in code space (codes.ts) the way a pixel artist paints a tile: drawn
// marks, not noise. Bark is cut into fissured plates lit on their upper-left lip; sawn wood carries straight grain
// with a knot; each rock family has its own read (speckled granite, vesicular basalt, shelly limestone, cross-bedded
// sandstone, split slate, glassy obsidian); ores carry their mineral as placed nuggets and stains; loose earth is
// packed clods, pebbles and grains, each lit on top and shaded underneath. Feature sizes are in metres, strokes are
// one texel, so the same recipe paints the world's 32 px/m tiles and an icon's finer ones without mixed pixel sizes.
import * as THREE from 'three';
import { type RampName } from '../../art/palette';
import { code, shift, colorOf, cFlags, cRamp, cStep, F_EMIT, F_GLOSS, F_METAL, F_GLASS, type Code } from './codes';

export const H = (x: number, y: number, s = 0) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** a tile of codes, wrapping on both axes */
export class CTile {
  readonly d: Int32Array;
  constructor(readonly w: number, readonly h: number, fill: Code) { this.d = new Int32Array(w * h).fill(fill); }
  private i(x: number, y: number) { const w = this.w, h = this.h; x = ((Math.floor(x) % w) + w) % w; y = ((Math.floor(y) % h) + h) % h; return y * w + x; }
  get(x: number, y: number) { return this.d[this.i(x, y)]; }
  set(x: number, y: number, c: Code) { this.d[this.i(x, y)] = c; }
  /** move a texel along its own ramp */
  nudge(x: number, y: number, k: number) { const j = this.i(x, y); this.d[j] = shift(this.d[j], k); }
  rect(x: number, y: number, w: number, h: number, c: Code) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  line(x0: number, y0: number, x1: number, y1: number, c: Code | ((x: number, y: number) => void)) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let n = 0; n < 4096; n++) { if (typeof c === 'number') this.set(x0, y0, c); else c(x0, y0); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  /** an axis-aligned ellipse, filled (x, y may wrap) */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Code | ((x: number, y: number, u: number, v: number) => void)) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
      if (u * u + v * v > 1) continue;
      if (typeof c === 'number') this.set(x, y, c); else c(x, y, u, v);
    }
  }
  poly(pts: [number, number][], c: Code) {
    let y0 = Infinity, y1 = -Infinity; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const xs: number[] = [], yy = y + 0.5;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= yy) !== (b[1] <= yy)) xs.push(a[0] + ((yy - a[1]) / (b[1] - a[1])) * (b[0] - a[0])); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c);
    }
  }
}

// ------------------------------------------------------------------ marks
/** irregular plates (a wrapped jittered-grid Voronoi, stretched by sx / sy): each plate keeps one tone, a dark
 *  groove on its lower-right border, a shaded row inside it and a lit lip on its upper-left */
export function plates(t: CTile, nx: number, ny: number, seed: number, tone: (cell: number) => Code, o: { sx?: number; sy?: number; groove?: Code | null; lit?: number; dark?: number; jit?: number } = {}) {
  const W = t.w, Ht = t.h, cw = W / nx, ch = Ht / ny, sx = o.sx ?? 1, sy = o.sy ?? 1, jit = o.jit ?? 0.8;
  const px: number[] = [], py: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { px.push((i + 0.5 + (H(i, j, seed) - 0.5) * jit) * cw); py.push((j + 0.5 + (H(i, j, seed + 1) - 0.5) * jit) * ch); }
  const id = new Int32Array(W * Ht);
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    let best = 0, bd = Infinity;
    const gi = Math.floor(x / cw), gj = Math.floor(y / ch);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = ((gi + di) % nx + nx) % nx, jj = ((gj + dj) % ny + ny) % ny, k = jj * nx + ii;
      let dx = x + 0.5 - px[k], dy = y + 0.5 - py[k];
      dx -= Math.round(dx / W) * W; dy -= Math.round(dy / Ht) * Ht;
      const d = (dx * dx) / (sx * sx) + (dy * dy) / (sy * sy);
      if (d < bd) { bd = d; best = k; }
    }
    id[y * W + x] = best;
  }
  const at = (x: number, y: number) => id[(((y % Ht) + Ht) % Ht) * W + (((x % W) + W) % W)];
  for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y); let v = tone(c);
    if (at(x + 1, y) !== c || at(x, y + 1) !== c) { if (o.groove !== null) v = o.groove ?? shift(v, -2); }
    else if (at(x + 2, y) !== c || at(x, y + 2) !== c) v = shift(v, o.dark ?? -1);
    else if (at(x - 1, y) !== c || at(x, y - 1) !== c) v = shift(v, o.lit ?? 1);
    t.set(x, y, v);
  }
  return { id, at, n: nx * ny };
}
/** small placed marks on a jittered grid (one per cell, some cells skipped): grains, specks, pits */
export function specks(t: CTile, cell: number, seed: number, draw: (x: number, y: number, r: number) => void, keep = 1) {
  const nx = Math.max(1, Math.round(t.w / cell)), ny = Math.max(1, Math.round(t.h / cell)), cw = t.w / nx, ch = t.h / ny;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const r = H(i, j, seed + 7); if (r > keep) continue;
    draw(Math.floor((i + 0.15 + H(i, j, seed) * 0.7) * cw), Math.floor((j + 0.15 + H(i, j, seed + 3) * 0.7) * ch), r / keep);
  }
}
/** a speck shape: 1, 2 or 3 texels */
export function speck(t: CTile, x: number, y: number, c: Code, r: number, big = false) {
  t.set(x, y, c);
  if (r < 0.33) t.set(x + 1, y, c); else if (r < 0.55) t.set(x, y + 1, c);
  if (big) { t.set(x + 1, y, c); t.set(x, y + 1, c); if (r > 0.5) t.set(x + 1, y + 1, c); }
}
/** a raised grain: its body, a lit texel on top-left, a shade texel under it */
export function grain(t: CTile, x: number, y: number, c: Code, w = 2, h = 1) {
  t.rect(x, y, w, h, c); t.set(x, y - 1, shift(c, 1)); if (w > 1) t.set(x + 1, y - 1, shift(c, 1));
  t.set(x, y + h, shift(c, -2)); if (w > 1) t.set(x + w - 1, y + h, shift(c, -1));
}
/** horizontal bands with stepped, wavering borders: each band lit on its top row, shaded on its bottom row */
export function bands(t: CTile, seed: number, layers: { c: Code; h: number }[], wave = 1.5, period = 0.5) {
  const tot = layers.reduce((a, b) => a + b.h, 0);
  for (let x = 0; x < t.w; x++) {
    const off = Math.round(Math.sin((x / t.w) * Math.PI * 2 * Math.max(1, Math.round(t.w * period / 16)) + seed) * wave + (H(Math.floor(x / 5), 0, seed) - 0.5) * wave);
    let y = 0, k = 0;
    while (y < t.h) {
      const L = layers[k % layers.length], hh = Math.max(1, Math.round((L.h / tot) * t.h));
      for (let j = 0; j < hh; j++) {
        const yy = y + j + off; let c = L.c;
        if (j === 0) c = shift(c, 1); else if (j === hh - 1 && hh > 2) c = shift(c, -1);
        t.set(x, yy, c);
      }
      y += hh; k++;
    }
  }
}
/** long strokes along the tile's height (wood grain, fibres): each wanders a texel now and then */
export function strands(t: CTile, n: number, seed: number, c: (k: number) => Code, len: [number, number], wander = 0.15) {
  for (let k = 0; k < n; k++) {
    let x = Math.floor(H(k, 1, seed) * t.w); const y0 = Math.floor(H(k, 2, seed) * t.h), L = Math.round(len[0] + H(k, 3, seed) * (len[1] - len[0]));
    const cc = c(k);
    for (let i = 0; i < L; i++) { if (H(k, i >> 2, seed + 9) < wander && (i & 3) === 0) x += H(k, i, seed + 4) < 0.5 ? -1 : 1; t.set(x, y0 + i, cc); }
  }
}
/** long strokes along the tile's width (sawn grain): each wanders a texel now and then */
export function hstrands(t: CTile, n: number, seed: number, c: (k: number) => Code, len: [number, number], wander = 0.12) {
  for (let k = 0; k < n; k++) {
    let y = Math.floor(H(k, 1, seed) * t.h); const x0 = Math.floor(H(k, 2, seed) * t.w), L = Math.round(len[0] + H(k, 3, seed) * (len[1] - len[0]));
    const cc = c(k);
    for (let i = 0; i < L; i++) { if (H(k, i >> 2, seed + 9) < wander && (i & 3) === 0) y += H(k, i, seed + 4) < 0.5 ? -1 : 1; t.set(x0 + i, y, cc); }
  }
}
/** packed round stones (gravel, pebbles): drawn top to bottom so lower ones overlap; each with a lit crown, a shade
 *  crescent and a dark rim at its foot */
export function pebbles(t: CTile, cell: number, seed: number, tone: (k: number) => Code, o: { rx?: [number, number]; ry?: number; rim?: Code } = {}) {
  const nx = Math.max(1, Math.round(t.w / cell)), ny = Math.max(1, Math.round(t.h / cell)), cw = t.w / nx, chh = t.h / ny;
  const list: [number, number, number, number, Code][] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, rx = cw * ((o.rx?.[0] ?? 0.42) + H(i, j, seed + 5) * ((o.rx?.[1] ?? 0.62) - (o.rx?.[0] ?? 0.42)));
    list.push([(i + 0.5 + (H(i, j, seed) - 0.5) * 0.5) * cw, (j + 0.5 + (H(i, j, seed + 1) - 0.5) * 0.5) * chh, rx, rx * (o.ry ?? 0.78), tone(k)]);
  }
  list.sort((a, b) => a[1] - b[1]);
  for (const [cx, cy, rx, ry, c] of list) {
    t.ellipse(cx, cy, rx + 0.7, ry + 0.7, o.rim ?? shift(c, -3));
    t.ellipse(cx, cy, rx, ry, (x, y, u, v) => {
      const l = -u * 0.6 - v * 0.8;
      t.set(x, y, l > 0.55 ? shift(c, 2) : l > 0.15 ? shift(c, 1) : l < -0.55 ? shift(c, -1) : c);
    });
  }
}

// ------------------------------------------------------------------ the recipes
type Recipe = (t: CTile, s: number, seed: number) => void;
interface Mat { base: Code; m: number; paint: Recipe }
const C = code;
/** stone-like plates in a ramp, each tone picked from steps */
const toneOf = (r: RampName, steps: number[], seed: number, f = 0) => (k: number) => C(r, steps[Math.floor(H(k, 3, seed) * steps.length)], f);

const MATS: Record<string, Mat> = {
  // ---- wood
  bark: { base: C('fur', 2), m: 1, paint: (t, s, sd) => {
    // long fissured ridges down the trunk: narrow plates, ink-dark grooves, the ridge tops lit, a little lichen
    plates(t, Math.max(3, Math.round(t.w / (0.055 * s))), Math.max(1, Math.round(t.h / (0.5 * s))), sd, toneOf('fur', [2, 2, 3], sd), { sx: 0.45, sy: 2.6, groove: C('fur', 0), jit: 0.7 });
    specks(t, Math.max(4, 0.22 * s), sd + 3, (x, y, r) => { if (r < 0.2) { t.set(x, y, C('sage', 3)); t.set(x + 1, y, C('sage', 4)); t.set(x, y + 1, C('sage', 2)); } }, 0.3);
  } },
  barkPine: { base: C('hide', 2), m: 1, paint: (t, s, sd) => {
    // puzzle plates of pine: wider, shorter, each lit along its top
    plates(t, Math.max(2, Math.round(t.w / (0.09 * s))), Math.max(2, Math.round(t.h / (0.14 * s))), sd, toneOf('hide', [2, 3, 3], sd), { sx: 1, sy: 0.9, groove: C('hide', 0) });
  } },
  barkBirch: { base: C('bone', 4), m: 1, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('bone', 4));
    bands(t, sd, [{ c: C('bone', 4), h: 5 }, { c: C('paper', 4), h: 3 }, { c: C('bone', 5), h: 4 }], 0.6, 0.2);
    // dark lenticel dashes across the trunk, some long scars
    specks(t, Math.max(3, 0.06 * s), sd, (x, y, r) => { const L = 1 + Math.round(r * 2 * Math.max(1, s / 48)); t.line(x, y, x + L, y, C('ink', r < 0.4 ? 0 : 1)); if (r > 0.8) t.set(x + 1, y + 1, C('stone', 2)); }, 0.55);
  } },
  wood: { base: C('sand', 4), m: 1, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('sand', 4));
    // a fresh split face: growth rings show as long bands along the grain, fibres in two tones
    for (let y = 0; y < t.h; y++) { const b = Math.floor((y + Math.round(Math.sin(y * 0.5 + sd) * 1.2)) / Math.max(2, 0.03 * s)); if (b % 3 === 0) for (let x = 0; x < t.w; x++) if (H(x >> 3, y, sd) < 0.85) t.set(x, y, C('sand', 3)); }
    hstrands(t, Math.round(t.h * 0.6), sd + 4, (k) => C(k % 3 ? 'sand' : 'ochre', k % 3 ? 2 : 4), [t.w * 0.15, t.w * 0.5], 0.1);
  } },
  plank: { base: C('ochre', 3), m: 1, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('ochre', 3));
    // sawn grain along the board, a darker flatsawn arch, a knot with the grain swirling past it
    hstrands(t, Math.round(t.h * 0.55), sd, (k) => C(k % 5 === 0 ? 'fur' : 'ochre', k % 5 === 0 ? 3 : k % 2 ? 4 : 2), [t.w * 0.3, t.w * 0.9], 0.05);
    const kx = Math.floor(t.w * (0.3 + H(1, 1, sd) * 0.4)), ky = Math.floor(t.h * H(2, 2, sd)), kr = Math.max(1.2, 0.012 * s);
    t.ellipse(kx, ky, kr * 2.4 + 1, kr * 1.5 + 1, C('ochre', 2)); t.ellipse(kx, ky, kr * 1.4, kr, C('fur', 2)); t.set(kx, ky, C('fur', 1)); t.set(kx - 1, ky - 1, C('ochre', 4));
  } },
  crateWood: { base: C('ochre', 3), m: 1, paint: (t, s, sd) => {
    const bw = Math.max(4, Math.round(0.12 * s)), nb = Math.max(1, Math.round(t.h / bw));
    for (let b = 0; b < nb; b++) {
      const y0 = Math.round((b * t.h) / nb), y1 = Math.round(((b + 1) * t.h) / nb), base = [3, 4, 3, 2][b % 4];
      t.rect(0, y0, t.w, y1 - y0, C('ochre', base));
      for (let k = 0; k < 5; k++) { const yy = y0 + 1 + Math.floor(H(b, k, sd) * Math.max(1, y1 - y0 - 2)), x0 = Math.floor(H(b, k, sd + 1) * t.w); t.line(x0, yy, x0 + Math.round(t.w * 0.3), yy, C('ochre', base + (k % 2 ? 1 : -1))); }
      t.line(0, y0, t.w - 1, y0, C('ochre', Math.min(6, base + 2))); t.line(0, y1 - 1, t.w - 1, y1 - 1, C('fur', 1));
      for (const nx of [2, t.w - 3]) { t.set(nx, y0 + Math.floor((y1 - y0) / 2), C('steel', 5)); t.set(nx + 1, y0 + Math.floor((y1 - y0) / 2) + 1, C('steel', 2)); }
    }
  } },
  charcoal: { base: C('basalt', 1), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('basalt', 1));
    // charred checking: a grid of cracks across the grain, glossy ridges
    plates(t, Math.max(2, Math.round(t.w / (0.035 * s))), Math.max(2, Math.round(t.h / (0.05 * s))), sd, toneOf('basalt', [1, 2, 2], sd, F_GLOSS), { groove: C('ink', 0), sx: 1.3, sy: 0.7 });
    specks(t, Math.max(3, 0.04 * s), sd + 1, (x, y, r) => { if (r < 0.4) t.set(x, y, C('slate', 3, F_GLOSS)); }, 0.6);
  } },
  // ---- plant matter
  leaf: { base: C('moss', 3), m: 0.25, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('moss', 3));
    const mid = Math.floor(t.w / 2);
    for (let y = 0; y < t.h; y++) t.set(mid, y, C('moss', 5));
    for (let y = 0; y < t.h; y += Math.max(3, Math.round(0.03 * s))) for (let i = 1; i < t.w / 2; i++) { t.set(mid - i, y + Math.floor(i * 0.6), C('moss', 4)); t.set(mid + i, y + Math.floor(i * 0.6), C('moss', 2)); }
  } },
  fibre: { base: C('straw', 3), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('straw', 3));
    strands(t, Math.round(t.w * 1.4), sd, (k) => C('straw', [1, 2, 4, 5, 3][k % 5]), [t.h * 0.3, t.h], 0.05);
  } },
  straw: { base: C('ochre', 4), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('ochre', 4));
    // a baled face: short stalks lying every which way in two tones, hollow ends here and there
    specks(t, Math.max(3, 0.04 * s), sd, (x, y, r) => { const L = 2 + Math.round(r * 4 * Math.max(1, s / 64)); const d = r < 0.5 ? 1 : -1; t.line(x, y, x + L, y + d * Math.round(L * 0.4), C('straw', r < 0.3 ? 5 : r < 0.7 ? 4 : 2)); t.set(x + L + 1, y + d * Math.round(L * 0.4), C('ochre', 1)); });
  } },
  burlap: { base: C('sand', 3), m: 0.25, paint: (t, s, sd) => {
    const p = Math.max(2, Math.round(0.006 * s));
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) { const a = Math.floor(x / p) + Math.floor(y / p); t.set(x, y, C('sand', a % 2 ? 3 : (x + y) % 3 ? 2 : 4)); }
    specks(t, Math.max(4, 0.05 * s), sd, (x, y, r) => { if (r < 0.3) t.line(x, y, x + 3, y, C('sand', 1)); }, 0.5);
  } },
  hide: { base: C('hide', 3), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.12 * s))), Math.max(2, Math.round(t.h / (0.12 * s))), sd, toneOf('hide', [3, 3, 4], sd), { groove: null, lit: 1, dark: -1 });
    specks(t, Math.max(3, 0.03 * s), sd, (x, y, r) => { t.line(x, y, x + 1, y + 2, C('hide', r < 0.5 ? 2 : 5)); }, 0.7);
  } },
  paper: { base: C('paper', 4), m: 0.25, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('paper', 4));
    specks(t, Math.max(4, 0.03 * s), sd, (x, y, r) => { if (r < 0.4) t.set(x, y, C('paper', 3)); else if (r < 0.5) t.set(x, y, C('paper', 5)); }, 0.6);
  } },
  egg: { base: C('bone', 4), m: 0.1, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('bone', 4));
    specks(t, Math.max(4, 0.012 * s), sd, (x, y, r) => { if (r < 0.45) { t.set(x, y, C('fur', 3)); if (r < 0.2) t.set(x + 1, y, C('fur', 3)); } else if (r < 0.55) t.set(x, y, C('bone', 2)); }, 0.7);
  } },
  // ---- rocks by family
  granite: { base: C('stone', 4), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.09 * s))), Math.max(2, Math.round(t.h / (0.09 * s))), sd, toneOf('stone', [4, 4, 5, 3], sd), { groove: null, lit: 1, dark: -1 });
    specks(t, Math.max(3, 0.018 * s), sd + 1, (x, y, r) => { speck(t, x, y, r < 0.45 ? C('stone', 1) : r < 0.75 ? C('stone', 6) : C('clay', 5), r, s > 96); });
  } },
  basalt: { base: C('basalt', 3), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.11 * s))), Math.max(2, Math.round(t.h / (0.16 * s))), sd, toneOf('basalt', [2, 3, 3, 4], sd), { groove: C('basalt', 0), sy: 1.4 });
    // vesicles: dark pits with a lit lower lip
    specks(t, Math.max(4, 0.035 * s), sd + 1, (x, y, r) => { if (r > 0.55) return; t.set(x, y, C('basalt', 0)); if (r < 0.3) t.set(x + 1, y, C('basalt', 0)); t.set(x, y + 1, C('basalt', 5)); });
  } },
  limestone: { base: C('bone', 3), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.12 * s))), Math.max(2, Math.round(t.h / (0.08 * s))), sd, toneOf('bone', [3, 4, 4, 2], sd), { groove: C('bone', 1), sx: 1.4 });
    // little shells: an arc of three texels with a dark mouth
    specks(t, Math.max(5, 0.05 * s), sd + 2, (x, y, r) => { if (r > 0.6) return; t.set(x, y, C('bone', 5)); t.set(x + 1, y - 1, C('bone', 5)); t.set(x + 2, y, C('bone', 5)); t.set(x + 1, y, C('bone', 1)); });
    specks(t, Math.max(3, 0.02 * s), sd + 3, (x, y, r) => { if (r < 0.35) t.set(x, y, C('bone', 1)); }, 0.7);
  } },
  sandstone: { base: C('sand', 3), m: 0.5, paint: (t, s, sd) => {
    const L = (r: RampName, i: number, h: number) => ({ c: C(r, i), h });
    bands(t, sd, [L('sand', 3, 4), L('sand', 4, 3), L('clay', 4, 2), L('sand', 2, 3), L('sand', 4, 4), L('clay', 5, 2)], Math.max(1, 0.012 * s), 0.6);
    specks(t, Math.max(3, 0.025 * s), sd + 1, (x, y, r) => { if (r < 0.3) t.set(x, y, C('sand', 1)); else if (r < 0.45) t.set(x, y, C('sand', 5)); }, 0.6);
  } },
  slate: { base: C('slate', 3), m: 0.5, paint: (t, s, sd) => {
    bands(t, sd, [{ c: C('slate', 3), h: 3 }, { c: C('slate', 2), h: 2 }, { c: C('slate', 4), h: 2 }, { c: C('slate', 3), h: 4 }, { c: C('slate', 2), h: 2 }], Math.max(0.6, 0.006 * s), 0.3);
    specks(t, Math.max(4, 0.06 * s), sd + 1, (x, y, r) => { if (r < 0.5) t.line(x, y, x + 2 + Math.round(r * 4), y, C('slate', 5)); }, 0.5);
  } },
  obsidian: { base: C('ink', 1, F_GLOSS), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.1 * s))), Math.max(2, Math.round(t.h / (0.1 * s))), sd, toneOf('ink', [0, 1, 1, 2], sd, F_GLOSS), { groove: null, lit: 1, dark: -1 });
    // conchoidal ripples: concentric arcs of the cold sheen
    specks(t, Math.max(6, 0.08 * s), sd + 2, (x, y, r) => { if (r > 0.6) return; const R = 2 + Math.round(r * 4 * Math.max(1, s / 64)); for (let a = 0; a < 5; a++) { const an = -2.4 + a * 0.35; t.set(x + Math.round(Math.cos(an) * R), y + Math.round(Math.sin(an) * R), C('slate', a === 2 ? 4 : 3, F_GLOSS)); } });
  } },
  // ---- ores (the host rock with its mineral laid in as nuggets and stains)
  ferrite: { base: C('iron', 3), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.08 * s))), Math.max(2, Math.round(t.h / (0.08 * s))), sd, toneOf('iron', [2, 3, 3, 4], sd), { groove: C('iron', 0) });
    const p = plates(new CTile(t.w, t.h, 0), Math.max(2, Math.round(t.w / (0.14 * s))), Math.max(2, Math.round(t.h / (0.14 * s))), sd + 9, () => 0, { groove: null });
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (H(p.at(x, y), 1, sd) < 0.38) { const c = t.get(x, y); t.set(x, y, C('rust', Math.max(1, Math.min(5, cStep(c) + 1)))); }
    specks(t, Math.max(4, 0.04 * s), sd + 2, (x, y, r) => { if (r < 0.5) grain(t, x, y, C('rust', 5), 2, 1); else if (r < 0.62) t.set(x, y, C('iron', 6, F_METAL)); });
  } },
  copperOre: { base: C('stone', 3), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.08 * s))), Math.max(2, Math.round(t.h / (0.08 * s))), sd, toneOf('stone', [3, 3, 4, 2], sd), { groove: C('stone', 1) });
    specks(t, Math.max(4, 0.045 * s), sd + 2, (x, y, r) => {
      if (r < 0.45) { t.ellipse(x, y, 1.6 + r * 2, 1.2 + r, C('malachite', 4)); t.set(x - 1, y - 1, C('malachite', 6)); t.set(x + 1, y + 1, C('malachite', 2)); }
      else if (r < 0.7) grain(t, x, y, C('copper', 5, F_METAL), 2, 1);
    });
  } },
  coal: { base: C('basalt', 1), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.06 * s))), Math.max(2, Math.round(t.h / (0.05 * s))), sd, toneOf('basalt', [0, 1, 1, 2], sd, F_GLOSS), { groove: C('ink', 0), lit: 2 });
    specks(t, Math.max(4, 0.05 * s), sd + 2, (x, y, r) => { if (r < 0.5) t.line(x, y, x + 1 + Math.round(r * 3), y, C('slate', 3, F_GLOSS)); }, 0.6);
  } },
  goldOre: { base: C('quartz', 4), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.08 * s))), Math.max(2, Math.round(t.h / (0.08 * s))), sd, toneOf('quartz', [3, 4, 4, 5], sd), { groove: C('quartz', 1) });
    specks(t, Math.max(4, 0.05 * s), sd + 3, (x, y, r) => { if (r < 0.3) { t.ellipse(x, y, 2, 1.4, C('rust', 4)); } });
    specks(t, Math.max(4, 0.04 * s), sd + 2, (x, y, r) => { if (r < 0.55) { grain(t, x, y, C('gold', 5, F_METAL), r < 0.2 ? 3 : 2, r < 0.2 ? 2 : 1); t.set(x, y, C('gold', 6, F_METAL)); } });
  } },
  sulphur: { base: C('straw', 4), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.04 * s))), Math.max(2, Math.round(t.h / (0.04 * s))), sd, (k) => H(k, 2, sd) < 0.2 ? C('ochre', 4) : C('straw', [3, 4, 5, 4][Math.floor(H(k, 3, sd) * 4)]), { groove: C('ochre', 2), lit: 1 });
    specks(t, Math.max(3, 0.03 * s), sd + 1, (x, y, r) => { if (r < 0.3) t.set(x, y, C('gold', 6)); }, 0.6);
  } },
  malachite: { base: C('malachite', 3), m: 0.25, paint: (t, s, sd) => {
    // concentric botryoidal banding
    const cx = t.w * H(1, 1, sd), cy = t.h * H(2, 2, sd), bw = Math.max(1.5, 0.008 * s);
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) { let dx = x - cx, dy = y - cy; dx -= Math.round(dx / t.w) * t.w; dy -= Math.round(dy / t.h) * t.h; const b = Math.floor(Math.hypot(dx, dy * 1.3) / bw + Math.sin(x * 0.3) * 0.5); t.set(x, y, C('malachite', [2, 3, 5, 3, 4, 1][b % 6])); }
  } },
  gravium: { base: C('violet', 2), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.07 * s))), Math.max(2, Math.round(t.h / (0.07 * s))), sd, toneOf('violet', [1, 2, 2, 3], sd), { groove: C('amethyst', 5, F_EMIT) });
  } },
  saltpetre: { base: C('paper', 4), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.05 * s))), Math.max(2, Math.round(t.h / (0.04 * s))), sd, toneOf('paper', [3, 4, 5, 4], sd), { groove: C('paper', 1) });
    specks(t, Math.max(3, 0.02 * s), sd + 1, (x, y, r) => { if (r < 0.3) t.set(x, y, C('snow', 5)); }, 0.6);
  } },
  // ---- loose earth
  dirt: { base: C('soil', 3), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.06 * s))), Math.max(2, Math.round(t.h / (0.05 * s))), sd, toneOf('soil', [2, 3, 3, 4], sd), { groove: C('soil', 0) });
    specks(t, Math.max(4, 0.05 * s), sd + 1, (x, y, r) => { if (r < 0.45) grain(t, x, y, C('stone', 4), 2, 1); }, 0.7);
  } },
  topsoil: { base: C('soil', 2), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.05 * s))), Math.max(2, Math.round(t.h / (0.04 * s))), sd, toneOf('soil', [1, 2, 2, 3], sd), { groove: C('soil', 0) });
    // roots and rootlets: pale threads
    specks(t, Math.max(6, 0.08 * s), sd + 2, (x, y, r) => { if (r > 0.6) return; const L = 2 + Math.round(r * 5 * Math.max(1, s / 64)); t.line(x, y, x + L, y + Math.round(L * (r - 0.3)), C('straw', 2)); });
    specks(t, Math.max(4, 0.05 * s), sd + 3, (x, y, r) => { if (r < 0.25) t.set(x, y, C('moss', 3)); }, 0.6);
  } },
  clay: { base: C('clay', 3), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('clay', 3));
    // spade cuts: long smooth strokes with a lit and a shade edge
    for (let k = 0; k < 4; k++) { const y = Math.floor(H(k, 1, sd) * t.h); for (let x = 0; x < t.w; x++) { const yy = y + Math.round(Math.sin(x * 0.12 + k) * 1.5); t.set(x, yy, C('clay', 4)); t.set(x, yy + 1, C('clay', 2)); } }
    specks(t, Math.max(4, 0.05 * s), sd + 1, (x, y, r) => { if (r < 0.3) t.set(x, y, C('clay', 5)); }, 0.5);
  } },
  sand: { base: C('sand', 4), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('sand', 4));
    // wind ripples, then sparse dark and pale grains
    for (let k = 0; k < Math.max(2, t.h / Math.max(3, 0.05 * s)); k++) { const y = Math.round((k * t.h) / Math.max(2, t.h / Math.max(3, 0.05 * s))); for (let x = 0; x < t.w; x++) { const yy = y + Math.round(Math.sin(x * 0.25 + k * 1.7) * 1.2); t.set(x, yy, C('sand', 5)); t.set(x, yy + 1, C('sand', 3)); } }
    specks(t, Math.max(3, 0.02 * s), sd + 1, (x, y, r) => { if (r < 0.3) t.set(x, y, C('sand', 2)); else if (r < 0.4) t.set(x, y, C('stone', 2)); }, 0.6);
  } },
  gravel: { base: C('stone', 3), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('stone', 1));
    pebbles(t, Math.max(3, 0.035 * s), sd, (k) => { const r = H(k, 4, sd); return r < 0.55 ? C('stone', 4) : r < 0.75 ? C('sand', 3) : r < 0.9 ? C('slate', 4) : C('stone', 5); }, { rim: C('stone', 0) });
  } },
  peat: { base: C('soil', 1), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('soil', 1));
    strands(t, Math.round(t.w * 0.9), sd, (k) => C(k % 3 ? 'soil' : 'fur', k % 3 ? 2 : 3), [t.h * 0.1, t.h * 0.3], 0.3);
    specks(t, Math.max(4, 0.04 * s), sd + 1, (x, y, r) => { if (r < 0.3) t.set(x, y, C('soil', 3)); }, 0.6);
  } },
  compost: { base: C('soil', 2), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.04 * s))), Math.max(2, Math.round(t.h / (0.04 * s))), sd, toneOf('soil', [1, 2, 2, 3], sd), { groove: C('soil', 0) });
    specks(t, Math.max(4, 0.045 * s), sd + 2, (x, y, r) => { if (r < 0.25) t.line(x, y, x + 2, y + 1, C('straw', 3)); else if (r < 0.4) { t.set(x, y, C('moss', 2)); t.set(x + 1, y, C('moss', 3)); } else if (r < 0.48) t.set(x, y, C('ochre', 3)); });
  } },
  ash: { base: C('stone', 4), m: 0.5, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.05 * s))), Math.max(2, Math.round(t.h / (0.05 * s))), sd, toneOf('stone', [4, 5, 5, 3], sd), { groove: null });
    specks(t, Math.max(4, 0.05 * s), sd + 1, (x, y, r) => { if (r < 0.3) t.set(x, y, C('basalt', 1)); else if (r < 0.36) t.set(x, y, C('rust', 4)); }, 0.6);
  } },
  crushed: { base: C('iron', 2), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('iron', 1));
    pebbles(t, Math.max(3, 0.02 * s), sd, (k) => H(k, 5, sd) < 0.4 ? C('rust', 3) : C('iron', 3), { rx: [0.35, 0.5], ry: 0.7, rim: C('iron', 0) });
  } },
  salt: { base: C('snow', 4), m: 0.25, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('snow', 2));
    specks(t, Math.max(3, 0.02 * s), sd, (x, y, r) => { const w = 2 + Math.round(r * 2); t.rect(x, y, w, w, C('snow', 4)); t.line(x, y, x + w - 1, y, C('snow', 5)); t.line(x + w - 1, y + 1, x + w - 1, y + w - 1, C('snow', 1)); });
  } },
  grainSeed: { base: C('straw', 3), m: 0.25, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('straw', 1));
    pebbles(t, Math.max(3, 0.012 * s), sd, (k) => C('straw', [3, 4, 2][k % 3]), { rx: [0.4, 0.55], ry: 0.6, rim: C('straw', 0) });
  } },
  leafLitter: { base: C('moss', 2), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('moss', 1));
    // fallen leaves packed edge to edge, each a little lit oval with a midrib; mostly green, a few turned
    const sz = Math.max(1.5, 0.022 * s);
    specks(t, Math.max(3, sz * 1.7), sd, (x, y, r) => {
      const rr = H(x, y, sd), c = C(rr < 0.72 ? 'moss' : rr < 0.9 ? 'olive' : 'ochre', rr < 0.3 ? 3 : 2);
      const L = Math.max(1, Math.round(sz * (0.8 + r * 0.6)));
      t.poly([[x - L, y], [x, y - L * 0.55], [x + L, y], [x, y + L * 0.55]], c);
      t.line(x - L + 1, y, x + L - 1, y, shift(c, 1)); t.set(x + L - 1, y + 1, shift(c, -1));
    });
  } },
  dung: { base: C('soil', 2), m: 0.25, paint: (t, s, sd) => {
    plates(t, Math.max(2, Math.round(t.w / (0.03 * s))), Math.max(2, Math.round(t.h / (0.03 * s))), sd, toneOf('soil', [2, 3, 2], sd), { groove: C('soil', 0) });
    specks(t, Math.max(4, 0.03 * s), sd + 1, (x, y, r) => { if (r < 0.35) t.line(x, y, x + 2, y, C('straw', 2)); }, 0.6);
  } },
  // ---- made things
  steel: { base: C('steel', 4, F_METAL), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('steel', 4, F_METAL));
    // brushed: long faint streaks, a few scratches and a worn spot
    strands(t, Math.round(t.h * 0.3), sd, (k) => C('steel', k % 2 ? 5 : 3, F_METAL), [t.w * 0.2, t.w * 0.7], 0);
    specks(t, Math.max(5, 0.08 * s), sd + 1, (x, y, r) => { if (r < 0.4) t.line(x, y, x + 3, y + 1, C('steel', 6, F_METAL)); }, 0.5);
  } },
  iron: { base: C('steel', 3, F_METAL), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('steel', 3, F_METAL));
    // cast skin: sand-mould pits and a little bloom of rust
    specks(t, Math.max(3, 0.02 * s), sd, (x, y, r) => { if (r < 0.35) t.set(x, y, C('steel', 2, F_METAL)); else if (r < 0.45) t.set(x, y, C('steel', 5, F_METAL)); else if (r < 0.5) t.set(x, y, C('rust', 3)); }, 0.7);
  } },
  copper: { base: C('copper', 4, F_METAL), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('copper', 4, F_METAL));
    specks(t, Math.max(3, 0.025 * s), sd, (x, y, r) => { if (r < 0.3) t.set(x, y, C('copper', 3, F_METAL)); else if (r < 0.4) t.set(x, y, C('copper', 5, F_METAL)); else if (r < 0.45) t.set(x, y, C('malachite', 3)); }, 0.7);
  } },
  gold: { base: C('gold', 4, F_METAL), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('gold', 4, F_METAL));
    specks(t, Math.max(3, 0.03 * s), sd, (x, y, r) => { if (r < 0.3) t.set(x, y, C('gold', 3, F_METAL)); else if (r < 0.4) t.set(x, y, C('gold', 5, F_METAL)); }, 0.6);
  } },
  brass: { base: C('brass', 4, F_METAL), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('brass', 4, F_METAL));
    specks(t, Math.max(3, 0.03 * s), sd, (x, y, r) => { if (r < 0.35) t.set(x, y, C('brass', 3, F_METAL)); }, 0.6);
  } },
  olive: { base: C('olive', 3), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('olive', 3));
    // enamel with chips to the steel under it and a little rust
    specks(t, Math.max(5, 0.07 * s), sd, (x, y, r) => { if (r < 0.35) { t.rect(x, y, 2, 1, C('steel', 4)); t.set(x, y + 1, C('olive', 1)); } else if (r < 0.45) t.set(x, y, C('rust', 3)); }, 0.7);
  } },
  rubber: { base: C('basalt', 2), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('basalt', 2));
    specks(t, Math.max(4, 0.05 * s), sd, (x, y, r) => { if (r < 0.3) t.set(x, y, C('basalt', 3)); }, 0.6);
  } },
  bakelite: { base: C('clay', 2, F_GLOSS), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('clay', 2, F_GLOSS));
    strands(t, Math.round(t.h * 0.2), sd, (k) => C('clay', k % 2 ? 1 : 3, F_GLOSS), [t.w * 0.2, t.w * 0.5], 0.2);
  } },
  concrete: { base: C('stone', 5), m: 0.5, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('stone', 5));
    specks(t, Math.max(3, 0.025 * s), sd, (x, y, r) => { if (r < 0.35) t.set(x, y, C('stone', 3)); else if (r < 0.5) t.set(x, y, C('stone', 6)); else if (r < 0.56) { t.set(x, y, C('stone', 2)); t.set(x + 1, y, C('stone', 2)); } }, 0.8);
  } },
  brick: { base: C('clay', 4), m: 0.25, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('clay', 4));
    specks(t, Math.max(3, 0.02 * s), sd, (x, y, r) => { if (r < 0.3) t.set(x, y, C('clay', 2)); else if (r < 0.45) t.set(x, y, C('clay', 5)); else if (r < 0.5) t.set(x, y, C('soil', 1)); }, 0.7);
  } },
  glass: { base: C('water', 5, F_GLASS), m: 0.25, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('water', 4, F_GLASS));
    for (let k = 0; k < 3; k++) { const x0 = Math.floor(H(k, 1, sd) * t.w); t.line(x0, 0, x0 + Math.round(t.h * 0.6), t.h - 1, C('water', 6, F_GLASS)); }
  } },
  board: { base: C('teal', 1), m: 0.25, paint: (t, s, sd) => {
    t.rect(0, 0, t.w, t.h, C('teal', 1));
    // copper traces in right angles, pads at their ends
    const g = Math.max(3, Math.round(0.006 * s));
    for (let k = 0; k < Math.max(4, t.w / g); k++) {
      let x = Math.floor(H(k, 1, sd) * t.w / g) * g, y = Math.floor(H(k, 2, sd) * t.h / g) * g;
      for (let seg = 0; seg < 3; seg++) { const L = (2 + Math.floor(H(k, seg + 3, sd) * 4)) * g, h = H(k, seg + 9, sd) < 0.5; const x2 = h ? x + L : x, y2 = h ? y : y + L; t.line(x, y, x2, y2, C('copper', 4)); x = x2; y = y2; }
      t.rect(x - 1, y - 1, 2, 2, C('brass', 5));
    }
  } },
  enamelRed: { base: C('stampRed', 2), m: 0.5, paint: (t, s, sd) => { t.rect(0, 0, t.w, t.h, C('stampRed', 2)); specks(t, Math.max(5, 0.07 * s), sd, (x, y, r) => { if (r < 0.3) t.set(x, y, C('steel', 4)); }, 0.6); } },
};
export const MAT_KEYS = Object.keys(MATS);
export const hasMat = (k: string) => k in MATS;
/** a material's base code (the flat tone a solid or a far LOD uses) */
export const matBase = (k: string): Code => MATS[k]?.base ?? code('stone', 3);

// ------------------------------------------------------------------ tiles, textures
const tileCache = new Map<string, { tile: CTile; metres: number }>();
/** a material's tile at a texel density (px per metre), with the metres it spans */
export function tileOf(key: string, ppm: number, seed = 0): { tile: CTile; metres: number } {
  const M = MATS[key] ?? MATS.granite;
  const T = Math.max(8, Math.min(256, Math.round(M.m * ppm)));
  const ck = `${key}|${T}|${seed}`;
  let e = tileCache.get(ck);
  if (!e) { const t = new CTile(T, T, M.base); M.paint(t, T / M.m, (seed * 101 + key.length * 17 + 5) | 0); e = { tile: t, metres: M.m }; tileCache.set(ck, e); }
  return e;
}
const texCache = new Map<string, THREE.DataTexture>();
/** the colour texture of a material at a density (the world's: 32 px/m), repeating every `metres` */
export function colorTex(key: string, ppm = 32): THREE.DataTexture {
  const ck = key + '|' + ppm;
  let tx = texCache.get(ck);
  if (tx) return tx;
  const { tile, metres } = tileOf(key, ppm);
  const d = new Uint8Array(tile.w * tile.h * 4);
  for (let i = 0; i < tile.d.length; i++) { const c = colorOf(tile.d[i]); d[i * 4] = (c >> 16) & 255; d[i * 4 + 1] = (c >> 8) & 255; d[i * 4 + 2] = c & 255; d[i * 4 + 3] = 255; }
  tx = new THREE.DataTexture(d, tile.w, tile.h, THREE.RGBAFormat);
  tx.colorSpace = THREE.SRGBColorSpace; tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestMipmapLinearFilter; tx.generateMipmaps = true;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1 / metres, 1 / metres); tx.anisotropy = 4; tx.needsUpdate = true;
  texCache.set(ck, tx);
  return tx;
}
/** where a material glows: its emissive texels in colour, the rest black (null when nothing glows) */
export function emitTex(key: string, ppm = 32): THREE.DataTexture | null {
  const ck = 'E' + key + '|' + ppm;
  if (texCache.has(ck)) return texCache.get(ck)!;
  const { tile, metres } = tileOf(key, ppm);
  if (!tile.d.some((c) => cFlags(c) & F_EMIT)) return null;
  const d = new Uint8Array(tile.w * tile.h * 4);
  for (let i = 0; i < tile.d.length; i++) { const c = tile.d[i]; if (!(cFlags(c) & F_EMIT)) { d[i * 4 + 3] = 255; continue; } const v = colorOf(c); d[i * 4] = (v >> 16) & 255; d[i * 4 + 1] = (v >> 8) & 255; d[i * 4 + 2] = v & 255; d[i * 4 + 3] = 255; }
  const tx = new THREE.DataTexture(d, tile.w, tile.h, THREE.RGBAFormat);
  tx.colorSpace = THREE.SRGBColorSpace; tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1 / metres, 1 / metres); tx.needsUpdate = true;
  texCache.set(ck, tx);
  return tx;
}
/** the code texture of a material (raw: R ramp, G step, B flags), for the icon renderer */
export function codeTex(key: string, ppm: number): THREE.DataTexture {
  const ck = 'C' + key + '|' + Math.round(ppm);
  let tx = texCache.get(ck);
  if (tx) return tx;
  const { tile, metres } = tileOf(key, ppm);
  const d = new Uint8Array(tile.w * tile.h * 4);
  for (let i = 0; i < tile.d.length; i++) { const c = tile.d[i]; d[i * 4] = cRamp(c); d[i * 4 + 1] = cStep(c); d[i * 4 + 2] = cFlags(c); d[i * 4 + 3] = 255; }
  tx = new THREE.DataTexture(d, tile.w, tile.h, THREE.RGBAFormat);
  tx.colorSpace = THREE.NoColorSpace; tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; tx.generateMipmaps = false;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1 / metres, 1 / metres); tx.needsUpdate = true;
  texCache.set(ck, tx);
  return tx;
}
export { F_EMIT, F_GLOSS, F_METAL, F_GLASS };
