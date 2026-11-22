// The resource materials, painted the Limbophobia way (its pixel toolkit, src/limbo/gfx/pixel.ts and textures/*):
// each material has its own hue-shifted ramp (makeRamp: shadows drift cool, lights drift warm); its body is a
// tileable fbm field mapped through that ramp with CLUSTERED organic dithering (clumps that break along wavy
// contours, never a checkerboard, never a flat fill); then the real-material detail is laid in as deliberate
// marks, lit from the upper left: fissured bark ridges and lichen, end-grain growth rings and radial checks,
// mineral grains and hairline cracks in stone, metallic crystal glints in ore, crumbs, pebbles and rootlets in soil,
// twisted rope fibre, rust blooms and chipped enamel. At 32 px/m it reads as a real material in a few pixels.
// Everything is painted in code space (codes.ts) so the icon renderer can shade along the same ramps. Feature
// sizes are in metres (strokes stay one texel), so one recipe paints the world's tiles and an icon's finer ones.
import * as THREE from 'three';
import { makeRamp } from '../../limbo/gfx/pixel';
import { tileNoise2, hashf } from '../../limbo/core/rng';
import { code, codeI, regRamp, shift, colorOf, cFlags, cRamp, cStep, cLen, F_EMIT, F_GLOSS, F_METAL, F_GLASS, type Code } from './codes';

export const H = (x: number, y: number, s = 0) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const fract = (x: number) => x - Math.floor(x);

// ------------------------------------------------------------------ the material ramps (hue-shifted, 8 steps)
const R = (name: string, base: number, steps = 8, o: { hueShift?: number; spread?: number; satShift?: number } = {}) => regRamp(name, makeRamp(base, steps, { hueShift: 0.045, spread: 0.62, satShift: 0.1, ...o }));
const RP = (name: string, cols: readonly number[]) => regRamp(name, cols);
const BARK = R('m_bark', 0x55402e), BARKP = R('m_barkP', 0x6a4436), BIRCH = R('m_birch', 0xc9c0a8, 8, { spread: 0.55 }), LICHEN = R('m_lichen', 0x8a9a6a, 6), MOSS = R('m_moss', 0x5d7a30, 6);
const ENDW = R('m_end', 0xb58c58), WOOD = R('m_wood', 0xb89660), PLANK = R('m_plank', 0xa47b45), GREY = R('m_greywood', 0x8a8070), CRATE = R('m_crate', 0x9c7a4a);
const GRAN = R('m_granite', 0x8d877d), FELD = R('m_feld', 0xb88a78, 6), BAS = R('m_basalt', 0x4b4847), LIME = R('m_lime', 0xc2b48e), SANDS = R('m_sandst', 0xb8915e), SANDS2 = R('m_sandst2', 0xa36a44, 6);
const SLATE = R('m_slate', 0x4e6470), OBS = R('m_obsid', 0x26252d, 8, { spread: 0.5 }), FER = R('m_ferrite', 0x6a5c54), RUST = R('m_rust', 0xa4542a), HEM = R('m_hem', 0x7a3424, 6);
const CUORE = R('m_cuhost', 0x6e6a64), MALA = R('m_mala', 0x3f8a56), CUM = R('m_cumetal', 0xc4783e), COAL = R('m_coal', 0x2c2b2e, 8, { spread: 0.55 }), QTZ = R('m_quartz', 0xd4d1c6), GOLD = R('m_gold', 0xd4a63a);
const SUL = R('m_sulph', 0xd2bd4c), GRAV = R('m_grav', 0x4a3a62), GLOWV = RP('m_glowv', [0x6a4a9a, 0x8a62c0, 0xb08ae0, 0xd6c0f4]);
const DIRT = R('m_dirt', 0x6c533a), TOPS = R('m_tops', 0x4a3a2a), CLAY = R('m_clay', 0x9c6038), SAND = R('m_sand', 0xc9ad78), STONE = R('m_stone', 0x857f76), PEAT = R('m_peat', 0x3c2e24);
const ASH = R('m_ash', 0x8e8b86), ROOT = R('m_root', 0xc0a070, 6), STRAW = R('m_straw', 0xc4a85e), BURL = R('m_burlap', 0xa8925f), HIDE = R('m_hide', 0x8c6450), PAPER = R('m_paper', 0xd8ccb2, 8, { spread: 0.45 });
const LEAF = R('m_leaf', 0x5f7c34), STEEL = R('m_steel', 0x7a7e80, 8, { hueShift: 0.02 }), IRON = R('m_iron', 0x5c5e60, 8, { hueShift: 0.02 }), COP = R('m_copper', 0xba723c), BRASS = R('m_brass', 0xb48838), VERD = R('m_verd', 0x4f9a86, 6);
const OLIVE = R('m_olive', 0x666a3a), RUBB = R('m_rubber', 0x3a3838, 8, { spread: 0.45 }), BAKE = R('m_bake', 0x5e3424), CONC = R('m_conc', 0xa29e96), BRICK = R('m_brick', 0xa45a3a), GLASS = R('m_glass', 0x6aa898, 8, { spread: 0.55 });
const PCB = R('m_pcb', 0x2a5a48, 6), SALT = R('m_salt', 0xdcdcd4, 6, { spread: 0.4 }), EGG = R('m_egg', 0xd8c8a4, 6), RED = R('m_red', 0x8c2a22, 6);

// ------------------------------------------------------------------ the tile and its tools
/** a tile of codes, wrapping on both axes */
export class CTile {
  readonly d: Int32Array;
  private cl: Float32Array | null = null;
  constructor(readonly w: number, readonly h: number, fill: Code) { this.d = new Int32Array(w * h).fill(fill); }
  private i(x: number, y: number) { const w = this.w, h = this.h; x = ((Math.floor(x) % w) + w) % w; y = ((Math.floor(y) % h) + h) % h; return y * w + x; }
  get(x: number, y: number) { return this.d[this.i(x, y)]; }
  set(x: number, y: number, c: Code) { this.d[this.i(x, y)] = c; }
  /** move a texel along its own ramp */
  nudge(x: number, y: number, k: number) { const j = this.i(x, y); this.d[j] = shift(this.d[j], k); }
  /** the clustered dither threshold (Limbophobia's clusterT): smooth noise at ~3 texels plus 2x2 jitter, tiling */
  ct(x: number, y: number) {
    if (!this.cl) {
      const W = this.w, Hh = this.h, f = new Float32Array(W * Hh), cx = Math.max(1, Math.round(W / 3)), cy = Math.max(1, Math.round(Hh / 3)), seed = (W * 73 + Hh * 151) % 997;
      for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) f[j * W + i] = Math.min(0.98, Math.max(0.02, 0.5 + (tileNoise2((i / W) * cx, (j / Hh) * cy, cx, cy, seed) - 0.5) * 1.7 + (hashf(i >> 1, j >> 1, seed + 5) - 0.5) * 0.22));
      this.cl = f;
    }
    return this.cl[this.i(x, y)];
  }
  /** fill from a 0..1 field through a ramp (clustered dither between steps) */
  field(ramp: number, fn: (x: number, y: number) => number, flags = 0, dither = 1) {
    const n = cLen(codeI(ramp, 0));
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = Math.max(0, Math.min(1, fn(x, y))) * (n - 1); let k = Math.floor(v);
      if (v - k > 0.5 + (this.ct(x, y) - 0.5) * dither) k++;
      this.d[y * this.w + x] = codeI(ramp, Math.min(n - 1, k), flags);
    }
  }
  /** shift a texel by d steps where t beats the cluster threshold */
  dshift(x: number, y: number, d: number, t: number) { if (t > this.ct(x, y)) this.nudge(x, y, d); }
  /** put a code where t beats the cluster threshold */
  dput(x: number, y: number, c: Code, t: number) { if (t > this.ct(x, y)) this.set(x, y, c); }
  /** an organic blob (ditherBlob): soft clumped edge, filled by f(x, y, depth 0..1) */
  blob(cx: number, cy: number, rx: number, ry: number, f: (x: number, y: number, k: number) => void, strength = 1.2) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 1 && (1 - d) * strength > this.ct(x, y) * 0.9) f(x, y, 1 - d);
    }
  }
  /** a hairline crack: a wandering dark line with a lit lip beside it, now and then a short branch */
  crack(x: number, y: number, len: number, ang: number, seed: number, dark = -3, lit = 1) {
    let a = ang;
    for (let i = 0; i < len; i++) {
      const hz = Math.abs(Math.cos(a)) > 0.7;
      this.nudge(x, y, dark); this.nudge(x + (hz ? 0 : 1), y + (hz ? 1 : 0), lit);
      a += (H(i, seed, 3) - 0.5) * 0.9; x += Math.round(Math.cos(a)); y += Math.round(Math.sin(a));
      if (H(i, seed, 7) < 0.05) { const b = a + (H(i, seed, 8) < 0.5 ? 1 : -1) * 0.9; let bx = x, by = y; for (let j = 0; j < len / 4; j++) { bx += Math.round(Math.cos(b)); by += Math.round(Math.sin(b)); this.nudge(bx, by, dark + 1); } }
    }
  }
}
/** tileable anisotropic fbm over a tile: cx x cy cells at the base octave */
export function nz(t: CTile, x: number, y: number, cx: number, cy: number, oct: number, seed: number) {
  let amp = 0.5, sum = 0, norm = 0, a = Math.max(1, Math.round(cx)), b = Math.max(1, Math.round(cy));
  for (let i = 0; i < oct; i++) { sum += amp * tileNoise2((x / t.w) * a, (y / t.h) * b, a, b, seed + i * 131); norm += amp; amp *= 0.5; a *= 2; b *= 2; }
  return sum / norm;
}
/** a tiling Voronoi of nx x ny jittered cells, stretched (sx, sy): for any texel its cell and the distance to the
 *  nearest border (in texels), for plates, scales and furrows */
export function voronoi(t: CTile, nx: number, ny: number, sd: number, sx = 1, sy = 1): (x: number, y: number) => [number, number] {
  const W = t.w, Hh = t.h, cw = W / nx, ch = Hh / ny, px: number[] = [], py: number[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { px.push((i + 0.5 + (H(i, j, sd) - 0.5) * 0.85) * cw); py.push((j + 0.5 + (H(i, j, sd + 1) - 0.5) * 0.85) * ch); }
  return (x, y) => {
    let b = 0, bd = 1e9, b2 = 1e9; const gi = Math.floor(x / cw), gj = Math.floor(y / ch);
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = ((gi + di) % nx + nx) % nx, jj = ((gj + dj) % ny + ny) % ny, k = jj * nx + ii;
      let dx = x + 0.5 - px[k], dy = y + 0.5 - py[k]; dx -= Math.round(dx / W) * W; dy -= Math.round(dy / Hh) * Hh;
      const d = Math.hypot(dx / sx, dy / sy);
      if (d < bd) { b2 = bd; bd = d; b = k; } else if (d < b2) b2 = d;
    }
    return [b, (b2 - bd) * Math.min(sx, sy)];
  };
}
/** placed marks on a jittered grid (one per cell, some skipped) */
export function specks(t: CTile, cell: number, seed: number, draw: (x: number, y: number, r: number) => void, keep = 1) {
  cell = Math.max(3, cell);
  const nx = Math.max(1, Math.round(t.w / cell)), ny = Math.max(1, Math.round(t.h / cell)), cw = t.w / nx, ch = t.h / ny;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const r = H(i, j, seed + 7); if (r > keep) continue;
    draw(Math.floor((i + 0.1 + H(i, j, seed) * 0.8) * cw), Math.floor((j + 0.1 + H(i, j, seed + 3) * 0.8) * ch), r / keep);
  }
}
/** a mineral grain or crumb: 1-4 texels of a code, lit on its upper left, a shade texel under it */
export function grain(t: CTile, x: number, y: number, c: Code, size: number, r: number) {
  const pts: [number, number][] = size <= 1 ? [[0, 0]] : size === 2 ? [[0, 0], [r < 0.5 ? 1 : 0, r < 0.5 ? 0 : 1]] : [[0, 0], [1, 0], [0, 1], ...(r < 0.5 ? [[1, 1] as [number, number]] : [])];
  for (const [dx, dy] of pts) t.set(x + dx, y + dy, c);
  t.set(x, y, shift(c, 1));
  t.nudge(x, y + (size > 2 ? 2 : 1), -1);
}

// ------------------------------------------------------------------ the recipes
type Recipe = (t: CTile, s: number, sd: number, m: number) => void;
interface Mat { base: Code; m: number; paint: Recipe }
const C = (r: number, i: number, f = 0) => codeI(r, i, f);
const cells = (m: number, f: number) => Math.max(1, Math.round(m / f));

/** a stone body: two scales of mottling through its ramp */
function stoneBody(t: CTile, ramp: number, m: number, sd: number, mid = 0.55, big = 0.12, small = 0.03, k = 1, flags = 0) {
  t.field(ramp, (x, y) => mid + (nz(t, x, y, cells(m, big), cells(m, big), 3, sd) - 0.5) * 0.55 * k + (nz(t, x, y, cells(m, small), cells(m, small), 2, sd + 9) - 0.5) * 0.3 * k, flags);
}
function cracks(t: CTile, n: number, s: number, sd: number) { for (let i = 0; i < n; i++) t.crack(Math.floor(H(i, 1, sd) * t.w), Math.floor(H(i, 2, sd) * t.h), Math.round((0.06 + H(i, 3, sd) * 0.1) * s), H(i, 4, sd) * 6.28, sd + i * 17); }
/** lichen or moss patches: clumped blotches in the plant's ramp with a darker rim */
function lichen(t: CTile, ramp: number, m: number, sd: number, cover = 0.3, size = 0.08) {
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const v = nz(t, x, y, cells(m, size), cells(m, size), 3, sd);
    if (v > 1 - cover) { const k = (v - (1 - cover)) / cover; if (k > t.ct(x, y) * 0.6) t.set(x, y, C(ramp, Math.round(1 + k * 3 + (H(x, y, sd) - 0.5)))); }
    else if (v > 1 - cover - 0.03 && H(x, y, sd + 2) < 0.5) t.set(x, y, C(ramp, 0));
  }
}
/** rust: a bloom of the rust ramp, darker at its heart, with a run down the surface */
function rustBloom(t: CTile, cx: number, cy: number, r: number, sd: number) {
  t.blob(cx, cy, r, r * 0.8, (x, y, k) => t.set(x, y, C(RUST, Math.round(2 + (1 - k) * 3 + (H(x, y, sd) - 0.5) * 1.5))), 1.4);
  for (let i = 0; i < r * 2.5; i++) t.dput(cx + Math.round(Math.sin(i * 0.4 + sd) * 0.7), cy + r * 0.6 + i, C(RUST, 2 + (i % 2)), 0.7 - i / (r * 3));
}
/** a mottled overlay: where the field passes a threshold, the texel takes a step of another ramp */
function overlay(t: CTile, ramp: number, m: number, size: number, thr: number, sd: number, base = 1, span = 10, oct = 3) {
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) { const v = nz(t, x, y, cells(m, size), cells(m, size), oct, sd); if (v > thr) t.dput(x, y, C(ramp, Math.round(base + (v - thr) * span + (H(x, y, sd) - 0.5) * 1.5)), (v - thr) * 6); }
}

const MATS: Record<string, Mat> = {
  // ---------------------------------------------------------------- wood
  bark: { base: C(BARK, 3), m: 1, paint: (t, s, sd, m) => {
    // furrowed bark: long irregular plates running down the trunk (stretched cells), each plate's face mottled and
    // lit on its upper left, the furrows between them deep and dark and of uneven width; lichen in patches
    const v = voronoi(t, cells(m, 0.1), cells(m, 0.28), sd, 0.55, 1.9);
    t.field(BARK, (x, y) => {
      const [k, e] = v(x, y), [, el] = v(x - 1, y - 1);
      const deep = sstep(0.2, 1.8 + H(k, 5, sd) * 1.2, e);
      return 0.1 + deep * (0.5 + H(k, 3, sd) * 0.18) + (el < e ? 0.12 : -0.05) * deep + (nz(t, x, y, cells(m, 0.05), cells(m, 0.1), 2, sd + 2) - 0.5) * 0.22 * deep;
    });
    lichen(t, LICHEN, m, sd + 30, 0.15, 0.07);
    specks(t, Math.max(4, 0.2 * s), sd + 4, (x, y, r) => { if (r < 0.3) { t.set(x, y, C(BARK, 0)); t.nudge(x + 1, y + 1, 1); } }, 0.4);
  } },
  barkPine: { base: C(BARKP, 3), m: 1, paint: (t, s, sd, m) => {
    // puzzle plates of pine: each plate a mottled tone, curling at its edges (lit lip above, deep shadow below)
    const nx = cells(m, 0.09), ny = cells(m, 0.13), W = t.w, Hh = t.h, cw = W / nx, ch = Hh / ny;
    const px: number[] = [], py: number[] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { px.push((i + 0.5 + (H(i, j, sd) - 0.5) * 0.8) * cw); py.push((j + 0.5 + (H(i, j, sd + 1) - 0.5) * 0.8) * ch); }
    const near = (x: number, y: number): [number, number] => { let b = 0, bd = 1e9, b2 = 1e9; const gi = Math.floor(x / cw), gj = Math.floor(y / ch); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = ((gi + di) % nx + nx) % nx, jj = ((gj + dj) % ny + ny) % ny, k = jj * nx + ii; let dx = x + 0.5 - px[k], dy = y + 0.5 - py[k]; dx -= Math.round(dx / W) * W; dy -= Math.round(dy / Hh) * Hh; const d = Math.hypot(dx, dy * 0.85); if (d < bd) { b2 = bd; bd = d; b = k; } else if (d < b2) b2 = d; } return [b, b2 - bd]; };
    t.field(BARKP, (x, y) => { const [k, e] = near(x, y); const edge = sstep(0, 2.4, e); return 0.08 + edge * (0.45 + H(k, 3, sd) * 0.25) + (nz(t, x, y, cells(m, 0.03), cells(m, 0.03), 2, sd + 4) - 0.5) * 0.25 + (edge < 1 && near(x, y - 1)[1] > e ? 0.15 : 0); });
    lichen(t, LICHEN, m, sd + 30, 0.08, 0.05);
  } },
  barkBirch: { base: C(BIRCH, 5), m: 1, paint: (t, s, sd, m) => {
    t.field(BIRCH, (x, y) => 0.68 + (nz(t, x, y, cells(m, 0.2), cells(m, 0.06), 3, sd) - 0.5) * 0.3);
    // lenticels: short dark scars of irregular length; dark diamond scars where twigs fell
    specks(t, Math.max(3, 0.05 * s), sd + 2, (x, y, r) => { const L = 1 + Math.round(r * 0.04 * s); for (let i = 0; i < L; i++) t.dput(x + i, y, C(BIRCH, r < 0.3 ? 0 : 1), 0.95 - (i / (L + 1)) * 0.5); }, 0.6);
    specks(t, Math.max(6, 0.3 * s), sd + 3, (x, y, r) => { if (r > 0.4) return; const k = Math.max(2, 0.03 * s); t.blob(x, y, k * 1.4, k, (xx, yy, d) => t.set(xx, yy, C(BIRCH, d > 0.5 ? 0 : 1))); });
  } },
  endgrain: { base: C(ENDW, 4), m: 1, paint: (t, s, sd) => {
    // a log's sawn end, centred on the tile corner: growth rings that wander, darker heartwood, radial checks
    const ring = 0.011;
    t.field(ENDW, (x, y) => {
      let dx = x + 0.5, dy = y + 0.5; dx -= Math.round(dx / t.w) * t.w; dy -= Math.round(dy / t.h) * t.h;
      const r = Math.hypot(dx, dy) / s, a = Math.atan2(dy, dx);
      const rr = r + (tileNoise2(((a + Math.PI) / 6.283) * 7, r * 30, 7, 100000, sd) - 0.5) * 0.008;
      const f = fract(rr / ring), late = f > 0.72 ? -0.22 : f > 0.6 ? -0.08 : 0.04;
      return 0.6 + late - (r < 0.07 ? 0.12 : 0) + (hashf(x >> 1, y >> 1, sd) - 0.5) * 0.12;
    });
    for (let k = 0; k < 4; k++) { const a = H(k, 1, sd) * 6.28, L = (0.04 + H(k, 2, sd) * 0.06) * s; for (let i = 1; i < L; i++) { const x = Math.round(Math.cos(a) * i), y = Math.round(Math.sin(a) * i); t.nudge(x, y, -3); t.nudge(x + 1, y, -1); } }
    t.nudge(0, 0, -3); t.nudge(-1, 0, -2);
  } },
  wood: { base: C(WOOD, 4), m: 1, paint: (t, s, sd, m) => {
    // a fresh split face: long fibre streaks along the grain, the growth bands warped, torn fibres lit
    t.field(WOOD, (x, y) => { const w = nz(t, x, y, 2, cells(m, 0.15), 2, sd) - 0.5; const band = fract((y / t.h) * cells(m, 0.03) + w * 1.4); return 0.6 + (band > 0.7 ? -0.18 : 0) + (nz(t, x, y, cells(m, 0.25), cells(m, 0.006), 2, sd + 3) - 0.5) * 0.35; });
    specks(t, Math.max(4, 0.06 * s), sd + 5, (x, y, r) => { if (r < 0.4) { const L = 2 + Math.round(r * 0.06 * s); for (let i = 0; i < L; i++) t.nudge(x + i, y, i === 0 ? 2 : 1); t.nudge(x, y + 1, -2); } }, 0.5);
  } },
  plank: { base: C(PLANK, 4), m: 1, paint: (t, s, sd, m) => {
    // sawn timber: grain streaks flowing along the board and round a knot, late-wood darker, the knot with a
    // dark core and a little check running from it
    const kx = t.w * (0.3 + H(1, 1, sd) * 0.4), ky = t.h * H(2, 2, sd), kr = 0.018 * s;
    t.field(PLANK, (x, y) => {
      let dx = x - kx, dy = y - ky; dx -= Math.round(dx / t.w) * t.w; dy -= Math.round(dy / t.h) * t.h;
      const near = Math.exp(-(dx * dx) / (kr * kr * 30) - (dy * dy) / (kr * kr * 6));
      const flow = (y / t.h) * cells(m, 0.028) + (nz(t, x, y, 2, cells(m, 0.2), 2, sd) - 0.5) * 1.6 + near * Math.sign(dy || 1) * 1.2;
      const band = fract(flow);
      return 0.58 + (band > 0.74 ? -0.2 : band > 0.62 ? -0.07 : 0) + (nz(t, x, y, cells(m, 0.3), cells(m, 0.007), 2, sd + 4) - 0.5) * 0.3;
    });
    t.blob(kx, ky, kr * 1.9, kr * 1.2, (x, y, k) => t.set(x, y, C(PLANK, k > 0.55 ? 0 : k > 0.3 ? 1 : 3)));
    t.crack(Math.round(kx + kr * 1.6), Math.round(ky), Math.round(kr * 2), 0, sd, -2, 0);
  } },
  crateWood: { base: C(CRATE, 4), m: 1, paint: (t, s, sd, m) => {
    // weathered crate boards: greying grain, dark gaps between boards, rusty nail heads bleeding a streak, grime
    const bw = Math.max(4, Math.round(0.12 * s)), nb = Math.max(1, Math.round(t.h / bw));
    t.field(CRATE, (x, y) => {
      const b = Math.floor((y / t.h) * nb), yy = (y / t.h) * nb - b;
      const gr = nz(t, x, y + b * 7, cells(m, 0.3), cells(m, 0.008), 2, sd + b);
      const edge = yy < 1 / bw ? -0.32 : yy > 1 - 1.5 / bw ? 0.12 : 0;
      return 0.55 + (gr - 0.5) * 0.45 + edge + (H(b, 0, sd) - 0.5) * 0.14 - sstep(0.6, 0.95, nz(t, x, y, cells(m, 0.25), cells(m, 0.25), 2, sd + 40)) * 0.2;
    });
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (nz(t, x, y, cells(m, 0.18), cells(m, 0.12), 3, sd + 50) > 0.62) t.dput(x, y, C(GREY, cStep(t.get(x, y))), 0.8);
    for (let b = 0; b < nb; b++) for (const nx of [Math.round(0.04 * s), t.w - Math.round(0.06 * s)]) { const ny = Math.round(((b + 0.5) * t.h) / nb); t.set(nx, ny, C(IRON, 2)); t.set(nx, ny - 1, C(IRON, 4)); rustBloom(t, nx, ny + 1, Math.max(1, 0.01 * s), sd + b); }
  } },
  charcoal: { base: C(COAL, 2), m: 0.5, paint: (t, s, sd, m) => {
    // charred wood: the grain still there, broken across into blocks by checking, a silvery sheen on the ridges
    t.field(COAL, (x, y) => { const g = nz(t, x, y, cells(m, 0.2), cells(m, 0.01), 2, sd); const chk = fract((x / t.w) * cells(m, 0.03) + (nz(t, x, y, 3, 3, 2, sd + 3) - 0.5) * 0.8); return 0.35 + (g - 0.5) * 0.4 - (chk < 0.12 ? 0.3 : 0) + (chk > 0.12 && chk < 0.25 ? 0.18 : 0); }, F_GLOSS);
  } },
  // ---------------------------------------------------------------- plant matter
  leaf: { base: C(LEAF, 4), m: 0.25, paint: (t, s, sd, m) => {
    t.field(LEAF, (x, y) => 0.56 + (nz(t, x, y, cells(m, 0.03), cells(m, 0.03), 3, sd) - 0.5) * 0.3 + (Math.abs(x - t.w / 2) < 1 ? 0.2 : 0));
    for (let k = 0; k < 6; k++) { const y0 = Math.round((k * t.h) / 6); for (let i = 1; i < t.w / 2; i++) { t.dshift(t.w / 2 - i, y0 + Math.round(i * 0.7), 1, 0.7); t.dshift(t.w / 2 + i, y0 + Math.round(i * 0.7), -1, 0.7); } }
  } },
  fibre: { base: C(STRAW, 4), m: 0.5, paint: (t, s, sd, m) => {
    // combed fibre: long streaks of slightly different straw tones, the odd darker retted strand, frayed hairs
    t.field(STRAW, (x, y) => 0.55 + (nz(t, x, y, cells(m, 0.006), cells(m, 0.25), 2, sd) - 0.5) * 0.55 + (nz(t, x, y, cells(m, 0.05), 2, 1, sd + 3) - 0.5) * 0.2);
    specks(t, Math.max(4, 0.04 * s), sd + 2, (x, y, r) => { if (r < 0.3) for (let i = 0; i < 3 + r * 6; i++) t.nudge(x + (i > 3 ? 1 : 0), y + i, r < 0.15 ? -2 : 2); }, 0.5);
  } },
  rope: { base: C(STRAW, 3), m: 0.25, paint: (t, s, sd, m) => {
    // twisted rope: strands laid in a helix, each lit along its crown and dark in the lay groove, hairy
    const lay = cells(m, 0.025);
    t.field(STRAW, (x, y) => { const p = fract((x / t.w) * lay * 0.5 + (y / t.h) * lay); return 0.2 + Math.sin(p * Math.PI) * 0.55 + (nz(t, x, y, cells(m, 0.01), cells(m, 0.01), 2, sd) - 0.5) * 0.2; });
  } },
  straw: { base: C(STRAW, 4), m: 0.5, paint: (t, s, sd, m) => {
    // a baled face: stalks lying every which way, hollow cut ends dark, chaff in the gaps
    t.field(STRAW, (x, y) => 0.35 + (nz(t, x, y, cells(m, 0.03), cells(m, 0.03), 2, sd) - 0.5) * 0.3);
    specks(t, Math.max(2, 0.018 * s), sd, (x, y, r) => { const L = 2 + Math.round(r * 0.05 * s), a = H(x, y, sd) * 3.1, c = C(STRAW, r < 0.3 ? 6 : r < 0.7 ? 5 : 4); for (let i = 0; i < L; i++) { const xx = x + Math.round(Math.cos(a) * i), yy = y + Math.round(Math.sin(a) * i); t.set(xx, yy, i === 0 ? shift(c, 1) : c); t.nudge(xx, yy + 1, -1); } if (r < 0.2) t.set(x + Math.round(Math.cos(a) * L), y + Math.round(Math.sin(a) * L), C(STRAW, 0)); });
  } },
  burlap: { base: C(BURL, 4), m: 0.25, paint: (t, s, sd, m) => {
    // woven sacking: over-under weave with slubby threads (thicker and thinner runs), dirt worked in
    const p = Math.max(2, Math.round(0.005 * s));
    t.field(BURL, (x, y) => { const over = (Math.floor(x / p) + Math.floor(y / p)) & 1; const slub = nz(t, over ? x : y, over ? y : x, cells(m, 0.04), cells(m, 0.04), 2, sd + over); return 0.42 + (over ? 0.16 : -0.04) + (slub - 0.5) * 0.3 + ((over ? x : y) % p === 0 ? -0.12 : 0); });
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (nz(t, x, y, cells(m, 0.08), cells(m, 0.08), 3, sd + 9) > 0.66) t.dshift(x, y, -1, 0.7);
  } },
  hide: { base: C(HIDE, 4), m: 0.5, paint: (t, s, sd, m) => {
    // scraped hide: mottled, pores in clumps, creases with a lit lip
    t.field(HIDE, (x, y) => 0.55 + (nz(t, x, y, cells(m, 0.1), cells(m, 0.1), 3, sd) - 0.5) * 0.45);
    specks(t, Math.max(3, 0.015 * s), sd + 1, (x, y, r) => { if (r < 0.4 && nz(t, x, y, cells(m, 0.06), cells(m, 0.06), 2, sd + 5) > 0.45) t.nudge(x, y, -2); }, 0.8);
    cracks(t, 3, s * 0.8, sd + 7);
  } },
  paper: { base: C(PAPER, 5), m: 0.25, paint: (t, s, sd, m) => {
    t.field(PAPER, (x, y) => 0.64 + (nz(t, x, y, cells(m, 0.06), cells(m, 0.02), 3, sd) - 0.5) * 0.14);
    specks(t, Math.max(3, 0.02 * s), sd, (x, y, r) => { if (r < 0.25) t.nudge(x, y, -1); else if (r > 0.95) t.nudge(x, y, -3); }, 0.7);
  } },
  egg: { base: C(EGG, 4), m: 0.1, paint: (t, s, sd, m) => {
    t.field(EGG, (x, y) => 0.62 + (nz(t, x, y, cells(m, 0.02), cells(m, 0.02), 2, sd) - 0.5) * 0.2);
    specks(t, Math.max(3, 0.008 * s), sd, (x, y, r) => { if (r < 0.5) t.blob(x, y, 0.5 + r * 0.004 * s, 0.5 + r * 0.003 * s, (xx, yy, k) => t.set(xx, yy, C(BARKP, k > 0.5 ? 3 : 4))); }, 0.6);
  } },
  // ---------------------------------------------------------------- rocks by family
  granite: { base: C(GRAN, 4), m: 0.5, paint: (t, s, sd, m) => {
    // coarse crystalline: grey body, black mica flakes, pink feldspar and glassy quartz grains, hairline cracks
    stoneBody(t, GRAN, m, sd, 0.6, 0.12, 0.025, 0.8);
    specks(t, Math.max(2, 0.009 * s), sd + 1, (x, y, r) => { const sz = 1 + Math.round(H(x, y, sd) * 0.006 * s); if (r < 0.3) grain(t, x, y, C(GRAN, 1), sz, r); else if (r < 0.5) grain(t, x, y, C(FELD, 3), sz + 1, r); else if (r < 0.62) grain(t, x, y, C(GRAN, 7), sz, r); });
    cracks(t, 2, s, sd + 3);
  } },
  basalt: { base: C(BAS, 3), m: 0.5, paint: (t, s, sd, m) => {
    // dense dark rock: fine grain, gas vesicles (a pit with a lit far rim), iron staining weathered in patches
    stoneBody(t, BAS, m, sd, 0.45, 0.15, 0.02, 0.7);
    overlay(t, HEM, m, 0.12, 0.68, sd + 20, 1, 8);
    specks(t, Math.max(3, 0.025 * s), sd + 2, (x, y, r) => { if (r > 0.6) return; const k = 1 + Math.round(r * 0.008 * s); t.blob(x, y, k, k * 0.8, (xx, yy) => t.set(xx, yy, C(BAS, 0))); t.nudge(x, y + k + 1, 2); });
    cracks(t, 2, s, sd + 3);
  } },
  limestone: { base: C(LIME, 5), m: 0.5, paint: (t, s, sd, m) => {
    // pale and soft: chalky mottle, shell fragments, pits weathered out, a grey lichen crust
    stoneBody(t, LIME, m, sd, 0.6, 0.15, 0.03, 0.7);
    specks(t, Math.max(4, 0.04 * s), sd + 2, (x, y, r) => { if (r < 0.4) { const R2 = 1 + r * 0.01 * s; for (let a = 0; a < 3.2; a += 0.5) t.nudge(x + Math.round(Math.cos(a) * R2), y - Math.round(Math.sin(a) * R2 * 0.7), 2); t.nudge(x, y, -2); } else if (r < 0.7) { t.nudge(x, y, -3); t.nudge(x, y + 1, 1); } });
    lichen(t, STONE, m, sd + 30, 0.12, 0.06);
    cracks(t, 2, s, sd + 3);
  } },
  sandstone: { base: C(SANDS, 4), m: 0.5, paint: (t, s, sd, m) => {
    // bedded and cross-bedded: soft bands of warm tones, warped; an iron-red band; sand grains glinting
    t.field(SANDS, (x, y) => { const w = nz(t, x, y, cells(m, 0.3), cells(m, 0.3), 2, sd) - 0.5; const b = fract((y / t.h) * cells(m, 0.045) + w * 1.8); return 0.55 + Math.sin(b * 6.283) * 0.14 + (nz(t, x, y, cells(m, 0.015), cells(m, 0.015), 2, sd + 4) - 0.5) * 0.22; });
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) { const w = nz(t, x, y, cells(m, 0.3), cells(m, 0.3), 2, sd) - 0.5; const b = fract((y / t.h) * cells(m, 0.12) + w * 1.2); if (b > 0.82) t.dput(x, y, C(SANDS2, Math.round(2 + (b - 0.82) * 10)), 0.75); }
    specks(t, Math.max(2, 0.01 * s), sd + 5, (x, y, r) => { if (r < 0.15) t.nudge(x, y, 2); else if (r > 0.9) t.nudge(x, y, -2); }, 0.8);
  } },
  slate: { base: C(SLATE, 3), m: 0.5, paint: (t, s, sd, m) => {
    // fine laminations warped through the stone, split ledges catching the light, rusty pyrite cubes
    t.field(SLATE, (x, y) => { const w = nz(t, x, y, cells(m, 0.25), cells(m, 0.25), 2, sd) - 0.5; return 0.42 + Math.sin(((y / t.h) * cells(m, 0.01) + w * 3) * 6.283) * 0.06 + (nz(t, x, y, cells(m, 0.08), cells(m, 0.02), 3, sd + 4) - 0.5) * 0.35; });
    specks(t, Math.max(6, 0.12 * s), sd + 2, (x, y, r) => { if (r < 0.5) { const L = Math.round((0.03 + r * 0.08) * s); for (let i = 0; i < L; i++) { const yy = y + Math.round(Math.sin(i * 0.2 + r) * 1); t.nudge(x + i, yy, 2); t.nudge(x + i, yy + 1, -2); } } else if (r < 0.6) grain(t, x, y, C(RUST, 3), 2, r); });
  } },
  obsidian: { base: C(OBS, 2, F_GLOSS), m: 0.5, paint: (t, s, sd, m) => {
    // volcanic glass: near black, big soft swirls of flow banding, conchoidal ripple sheen
    t.field(OBS, (x, y) => 0.25 + (nz(t, x, y, cells(m, 0.2), cells(m, 0.08), 3, sd) - 0.5) * 0.35, F_GLOSS);
    specks(t, Math.max(6, 0.08 * s), sd + 2, (x, y, r) => { if (r > 0.6) return; const R2 = 2 + r * 0.03 * s; for (let k = 0; k < 2; k++) for (let a = -2.6; a < -0.6; a += 0.25) t.nudge(x + Math.round(Math.cos(a) * (R2 + k * 2)), y + Math.round(Math.sin(a) * (R2 + k * 2)), k ? 1 : 3); });
  } },
  // ---------------------------------------------------------------- ores (host rock, the mineral laid in)
  ferrite: { base: C(FER, 3), m: 0.5, paint: (t, s, sd, m) => {
    // iron ore: dark host, rusty hematite blooms through it, metallic crystal glints of magnetite
    stoneBody(t, FER, m, sd, 0.45, 0.12, 0.02, 0.8);
    overlay(t, RUST, m, 0.1, 0.56, sd + 20, 1, 12);
    specks(t, Math.max(3, 0.022 * s), sd + 2, (x, y, r) => { if (r < 0.45) { grain(t, x, y, C(IRON, 3, F_METAL), 2 + (r < 0.15 ? 1 : 0), r); t.set(x, y, C(IRON, 7, F_METAL)); } });
    cracks(t, 2, s, sd + 3);
  } },
  copperOre: { base: C(CUORE, 3), m: 0.5, paint: (t, s, sd, m) => {
    // copper ore: grey host, green malachite crusts in the hollows, bright native copper and chalcopyrite glints
    stoneBody(t, CUORE, m, sd, 0.5, 0.12, 0.02, 0.8);
    overlay(t, MALA, m, 0.07, 0.6, sd + 20, 1, 14);
    specks(t, Math.max(3, 0.025 * s), sd + 2, (x, y, r) => { if (r < 0.35) { grain(t, x, y, C(CUM, 3, F_METAL), 2, r); t.set(x, y, C(CUM, 7, F_METAL)); } else if (r < 0.5) grain(t, x, y, C(GOLD, 4, F_METAL), 1, r); });
  } },
  coal: { base: C(COAL, 2, F_GLOSS), m: 0.5, paint: (t, s, sd, m) => {
    // coal: black with dull and bright layers (vitrain bands), blocky cleat cracks, glassy glints
    t.field(COAL, (x, y) => { const w = nz(t, x, y, cells(m, 0.2), cells(m, 0.2), 2, sd) - 0.5; const b = fract((y / t.h) * cells(m, 0.03) + w); return 0.3 + (b > 0.6 ? 0.18 : 0) + (nz(t, x, y, cells(m, 0.04), cells(m, 0.04), 2, sd + 4) - 0.5) * 0.2; }, F_GLOSS);
    cracks(t, 4, s * 0.8, sd + 3);
    specks(t, Math.max(3, 0.03 * s), sd + 2, (x, y, r) => { if (r < 0.35) { t.set(x, y, C(COAL, 7, F_GLOSS)); t.set(x + 1, y, C(COAL, 5, F_GLOSS)); } });
  } },
  goldOre: { base: C(QTZ, 5), m: 0.5, paint: (t, s, sd, m) => {
    // milky vein quartz stained with rust along its cracks, gold flecks and wires catching the light
    stoneBody(t, QTZ, m, sd, 0.66, 0.1, 0.02, 0.7);
    overlay(t, RUST, m, 0.08, 0.6, sd + 20, 3, 8);
    cracks(t, 3, s, sd + 3);
    specks(t, Math.max(3, 0.028 * s), sd + 2, (x, y, r) => { if (r < 0.5) { grain(t, x, y, C(GOLD, 4, F_METAL), r < 0.2 ? 3 : 2, r); t.set(x, y, C(GOLD, 7, F_METAL)); } });
  } },
  sulphur: { base: C(SUL, 4), m: 0.5, paint: (t, s, sd, m) => {
    // a crust of tiny sulphur crystals: each a lit facet and a shaded one, orange staining between
    t.field(SUL, (x, y) => 0.5 + (nz(t, x, y, cells(m, 0.05), cells(m, 0.05), 2, sd) - 0.5) * 0.35);
    specks(t, Math.max(2, 0.012 * s), sd + 1, (x, y, r) => { const c = C(SUL, 4 + Math.round(r * 2)); t.set(x, y, shift(c, 2)); t.set(x + 1, y, c); t.set(x, y + 1, shift(c, -1)); t.set(x + 1, y + 1, shift(c, -3)); }, 0.75);
    overlay(t, RUST, m, 0.1, 0.68, sd + 20, 4, 4);
  } },
  malachite: { base: C(MALA, 3), m: 0.25, paint: (t, s, sd, m) => {
    // botryoidal malachite: concentric bands warped round the bubbles, light and dark greens
    const cx = t.w * H(1, 1, sd), cy = t.h * H(2, 2, sd);
    t.field(MALA, (x, y) => { let dx = x - cx, dy = y - cy; dx -= Math.round(dx / t.w) * t.w; dy -= Math.round(dy / t.h) * t.h; const r = Math.hypot(dx, dy * 1.2) / s + (nz(t, x, y, 4, 4, 2, sd) - 0.5) * 0.03; const b = fract(r / 0.007); return 0.5 + (b > 0.65 ? -0.25 : b < 0.2 ? 0.2 : 0) + (nz(t, x, y, cells(m, 0.02), cells(m, 0.02), 2, sd + 3) - 0.5) * 0.15; });
  } },
  gravium: { base: C(GRAV, 3), m: 0.5, paint: (t, s, sd, m) => {
    // gravity ore: dark violet rock threaded with glowing veins that wander
    stoneBody(t, GRAV, m, sd, 0.45, 0.12, 0.02, 0.8);
    for (let k = 0; k < 4; k++) { let x = H(k, 1, sd) * t.w, y = H(k, 2, sd) * t.h, a = H(k, 3, sd) * 6.28; for (let i = 0; i < 0.3 * s; i++) { t.set(x, y, C(GLOWV, 1 + (i % 3 === 0 ? 1 : 0), F_EMIT)); t.nudge(x + 1, y + 1, -2); a += (H(i, k, sd) - 0.5) * 0.8; x += Math.cos(a); y += Math.sin(a); } }
  } },
  saltpetre: { base: C(PAPER, 4), m: 0.5, paint: (t, s, sd, m) => {
    stoneBody(t, PAPER, m, sd, 0.6, 0.06, 0.015, 0.9);
    specks(t, Math.max(2, 0.012 * s), sd + 1, (x, y, r) => { if (r < 0.4) grain(t, x, y, C(SALT, 4), 2, r); }, 0.8);
  } },
  // ---------------------------------------------------------------- loose earth
  dirt: { base: C(DIRT, 4), m: 0.5, paint: (t, s, sd, m) => {
    // dug earth: mottled, damp darker patches, crumbs lit on top, small stones, pale rootlets
    t.field(DIRT, (x, y) => 0.5 + (nz(t, x, y, cells(m, 0.12), cells(m, 0.12), 3, sd) - 0.5) * 0.45 + (nz(t, x, y, cells(m, 0.03), cells(m, 0.03), 2, sd + 3) - 0.5) * 0.18);
    specks(t, Math.max(2, 0.02 * s), sd + 1, (x, y, r) => { if (r < 0.4) grain(t, x, y, C(DIRT, 4 + Math.round(r * 3)), 1 + Math.round(r * 2), r); }, 0.7);
    specks(t, Math.max(4, 0.05 * s), sd + 2, (x, y, r) => { if (r < 0.4) grain(t, x, y, C(STONE, 4 + Math.round(r * 3)), 2 + (r < 0.15 ? 1 : 0), r); });
    specks(t, Math.max(8, 0.15 * s), sd + 3, (x, y, r) => { if (r < 0.5) { let a = r * 6, xx = x, yy = y; for (let i = 0; i < 0.04 * s; i++) { t.set(xx, yy, C(ROOT, 2 + (i % 2))); a += H(i, x, sd) - 0.5; xx += Math.round(Math.cos(a)); yy += Math.round(Math.sin(a)); } } });
  } },
  topsoil: { base: C(TOPS, 4), m: 0.5, paint: (t, s, sd, m) => {
    t.field(TOPS, (x, y) => 0.45 + (nz(t, x, y, cells(m, 0.08), cells(m, 0.08), 3, sd) - 0.5) * 0.5);
    specks(t, Math.max(2, 0.012 * s), sd + 1, (x, y, r) => { if (r < 0.5) grain(t, x, y, C(TOPS, 3 + Math.round(r * 5)), 1 + Math.round(r * 2), r); }, 0.85);
    specks(t, Math.max(5, 0.08 * s), sd + 3, (x, y, r) => { if (r < 0.6) { let a = r * 6, xx = x, yy = y; for (let i = 0; i < 0.05 * s; i++) { t.set(xx, yy, C(ROOT, 1 + (i % 3 === 0 ? 1 : 0))); a += H(i, y, sd) - 0.5; xx += Math.round(Math.cos(a)); yy += Math.round(Math.sin(a)); } } else if (r < 0.75) grain(t, x, y, C(MOSS, 3), 2, r); });
  } },
  clay: { base: C(CLAY, 4), m: 0.5, paint: (t, s, sd, m) => {
    // stiff clay: smooth and slightly wet (a soft sheen), spade facets, drying cracks
    t.field(CLAY, (x, y) => 0.5 + (nz(t, x, y, cells(m, 0.15), cells(m, 0.1), 3, sd) - 0.5) * 0.35 + (nz(t, x, y, cells(m, 0.3), cells(m, 0.05), 2, sd + 5) > 0.7 ? 0.15 : 0), F_GLOSS);
    cracks(t, 4, s * 0.7, sd + 3);
    specks(t, Math.max(4, 0.05 * s), sd + 2, (x, y, r) => { if (r < 0.3) grain(t, x, y, C(STONE, 3), 1, r); });
  } },
  sand: { base: C(SAND, 5), m: 0.5, paint: (t, s, sd, m) => {
    // washed sand: fine grains in clumps of lighter and darker, soft wind ripples, the odd dark mineral grain
    t.field(SAND, (x, y) => { const w = nz(t, x, y, cells(m, 0.2), cells(m, 0.2), 2, sd) - 0.5; const rip = Math.sin(((y / t.h) * cells(m, 0.05) + w * 1.5) * 6.283); return 0.56 + rip * 0.08 + (nz(t, x, y, cells(m, 0.012), cells(m, 0.012), 2, sd + 3) - 0.5) * 0.4; });
    specks(t, Math.max(2, 0.01 * s), sd + 1, (x, y, r) => { if (r < 0.12) t.set(x, y, C(STONE, 1)); else if (r < 0.3) t.nudge(x, y, 2); }, 0.7);
  } },
  gravel: { base: C(STONE, 4), m: 0.5, paint: (t, s, sd) => {
    // packed gravel: rounded stones of mixed rock, each lit on its crown with a dark contact shadow, grit between
    t.field(STONE, (x, y) => 0.18 + hashf(x, y, sd) * 0.15);
    const cell = Math.max(3, 0.035 * s), nx = Math.max(1, Math.round(t.w / cell)), ny = Math.max(1, Math.round(t.h / cell)), cw = t.w / nx, ch = t.h / ny;
    const list: [number, number, number, number][] = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) list.push([(i + 0.5 + (H(i, j, sd) - 0.5) * 0.6) * cw, (j + 0.5 + (H(i, j, sd + 1) - 0.5) * 0.6) * ch, cw * (0.4 + H(i, j, sd + 2) * 0.25), H(i, j, sd + 3)]);
    list.sort((a, b) => a[1] - b[1]);
    const rmp = [STONE, GRAN, SANDS, SLATE, BAS];
    for (const [cx, cy, r, k] of list) { const ramp = rmp[Math.floor(k * rmp.length)]; t.blob(cx, cy + 1, r + 0.6, r * 0.8 + 0.6, (x, y) => t.set(x, y, C(STONE, 0)), 2); t.blob(cx, cy, r, r * 0.78, (x, y, d) => { const dx = (x - cx) / r, dy = (y - cy) / r; const l = -dx * 0.6 - dy * 0.8 + d * 0.4; t.set(x, y, C(ramp, Math.round(3 + l * 2.6 + (H(x, y, sd) - 0.5)))); }, 3); }
  } },
  peat: { base: C(PEAT, 3), m: 0.5, paint: (t, s, sd, m) => {
    t.field(PEAT, (x, y) => 0.42 + (nz(t, x, y, cells(m, 0.06), cells(m, 0.06), 3, sd) - 0.5) * 0.4);
    specks(t, Math.max(3, 0.02 * s), sd + 2, (x, y, r) => { if (r < 0.6) { const a = r * 9, L = 2 + r * 0.04 * s; for (let i = 0; i < L; i++) t.set(x + Math.round(Math.cos(a) * i), y + Math.round(Math.sin(a) * i), C(r < 0.3 ? ROOT : PEAT, r < 0.3 ? 1 : 6)); } });
  } },
  compost: { base: C(TOPS, 3), m: 0.5, paint: (t, s, sd, m) => {
    t.field(TOPS, (x, y) => 0.38 + (nz(t, x, y, cells(m, 0.05), cells(m, 0.05), 3, sd) - 0.5) * 0.5);
    specks(t, Math.max(3, 0.03 * s), sd + 2, (x, y, r) => { if (r < 0.25) { const a = r * 12; for (let i = 0; i < 3 + r * 10; i++) t.set(x + Math.round(Math.cos(a) * i), y + Math.round(Math.sin(a) * i), C(STRAW, 3 + (i % 2))); } else if (r < 0.4) t.blob(x, y, 1.5, 1.1, (xx, yy, k) => t.set(xx, yy, C(LEAF, k > 0.4 ? 1 : 2))); else if (r < 0.55) grain(t, x, y, C(TOPS, 6), 2, r); });
  } },
  ash: { base: C(ASH, 5), m: 0.5, paint: (t, s, sd, m) => {
    t.field(ASH, (x, y) => 0.6 + (nz(t, x, y, cells(m, 0.08), cells(m, 0.08), 3, sd) - 0.5) * 0.35);
    specks(t, Math.max(3, 0.025 * s), sd + 1, (x, y, r) => { if (r < 0.35) grain(t, x, y, C(COAL, 1 + Math.round(r * 4)), 1 + Math.round(r * 3), r); else if (r < 0.38) t.set(x, y, C(RUST, 6)); }, 0.8);
  } },
  crushed: { base: C(FER, 3), m: 0.5, paint: (t, s, sd) => {
    t.field(FER, (x, y) => 0.25 + hashf(x, y, sd) * 0.15);
    specks(t, Math.max(2, 0.016 * s), sd, (x, y, r) => { const c = r < 0.45 ? C(RUST, 3 + Math.round(r * 4)) : C(FER, 3 + Math.round(r * 4)); grain(t, x, y, c, 2 + (r < 0.2 ? 1 : 0), r); if (r > 0.9) t.set(x, y, C(IRON, 7, F_METAL)); }, 1);
  } },
  salt: { base: C(SALT, 4), m: 0.25, paint: (t, s, sd, m) => {
    t.field(SALT, (x, y) => 0.4 + (nz(t, x, y, cells(m, 0.03), cells(m, 0.03), 2, sd) - 0.5) * 0.3);
    specks(t, Math.max(2, 0.012 * s), sd, (x, y, r) => { const w = 2 + Math.round(r * 0.006 * s); for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) t.set(x + i, y + j, C(SALT, i === 0 || j === 0 ? 5 : i === w - 1 || j === w - 1 ? 2 : 4)); });
  } },
  leafLitter: { base: C(LEAF, 3), m: 0.5, paint: (t, s, sd) => {
    // fallen leaves overlapping: each an oval with a lit side, fresh and turned greens, a few browns
    t.field(LEAF, (x, y) => 0.15 + hashf(x, y, sd) * 0.1);
    const sz = Math.max(1.5, 0.025 * s);
    specks(t, Math.max(2, sz * 1.1), sd, (x, y, r) => {
      const ramp = r < 0.62 ? LEAF : r < 0.82 ? MOSS : r < 0.94 ? PLANK : RUST, a = H(x, y, sd) * 3.14, L = sz * (0.9 + r * 0.5);
      t.blob(x, y, L, L * 0.5, (xx, yy, k) => { const side = (xx - x) * Math.cos(a) + (yy - y) * Math.sin(a); t.set(xx, yy, C(ramp, Math.round(2 + k * 2 + (side < 0 ? 1 : -0.4)))); }, 2.5);
    }, 1);
  } },
  dung: { base: C(DIRT, 2), m: 0.25, paint: (t, s, sd, m) => {
    t.field(DIRT, (x, y) => 0.3 + (nz(t, x, y, cells(m, 0.03), cells(m, 0.03), 3, sd) - 0.5) * 0.4, F_GLOSS);
    specks(t, Math.max(3, 0.02 * s), sd + 1, (x, y, r) => { if (r < 0.3) for (let i = 0; i < 3; i++) t.set(x + i, y + (i >> 1), C(STRAW, 2)); }, 0.6);
  } },
  ground: { base: C(DIRT, 4), m: 2, paint: (t, s, sd, m) => {
    // trodden ground for QA benches: big soft patches, a scatter of small stones, no busy grain
    t.field(DIRT, (x, y) => 0.56 + (nz(t, x, y, cells(m, 0.6), cells(m, 0.6), 3, sd) - 0.5) * 0.13 + (nz(t, x, y, cells(m, 0.12), cells(m, 0.12), 2, sd + 4) - 0.5) * 0.08, 0, 0.6);
    specks(t, Math.max(5, 0.3 * s), sd + 2, (x, y, r) => { if (r < 0.35) grain(t, x, y, C(STONE, 4 + Math.round(r * 4)), 2, r); }, 0.6);
  } },
  // ---------------------------------------------------------------- made things
  steel: { base: C(STEEL, 4, F_METAL), m: 0.5, paint: (t, s, sd, m) => {
    // worked steel: soft mottling, grime gathered in patches, a few bright scratches, the odd rust pit
    t.field(STEEL, (x, y) => 0.55 + (hashf(Math.floor(x / Math.max(2, 0.05 * s)), y, sd) - 0.5) * 0.1 + (nz(t, x, y, cells(m, 0.15), cells(m, 0.15), 3, sd + 3) - 0.5) * 0.28, F_METAL);
    specks(t, Math.max(5, 0.08 * s), sd + 1, (x, y, r) => { if (r < 0.35) { const a = r * 6, L = 3 + r * 0.06 * s; for (let i = 0; i < L; i++) t.nudge(x + Math.round(Math.cos(a) * i), y + Math.round(Math.sin(a) * i), 2); } else if (r < 0.42) rustBloom(t, x, y, Math.max(1, 0.006 * s), sd); }, 0.6);
  } },
  iron: { base: C(IRON, 4, F_METAL), m: 0.5, paint: (t, s, sd, m) => {
    // cast iron: sand-mould skin (fine pits), darker mill scale in patches, rust blooms
    t.field(IRON, (x, y) => 0.5 + (nz(t, x, y, cells(m, 0.1), cells(m, 0.1), 3, sd) - 0.5) * 0.35 + (hashf(x >> 1, y >> 1, sd) - 0.5) * 0.12, F_METAL);
    specks(t, Math.max(2, 0.012 * s), sd + 1, (x, y, r) => { if (r < 0.3) { t.nudge(x, y, -2); t.nudge(x, y + 1, 1); } }, 0.7);
    for (let k = 0; k < 3; k++) rustBloom(t, H(k, 1, sd) * t.w, H(k, 2, sd) * t.h, Math.max(1.2, 0.012 * s), sd + k);
  } },
  copper: { base: C(COP, 4, F_METAL), m: 0.5, paint: (t, s, sd, m) => {
    t.field(COP, (x, y) => 0.56 + (nz(t, x, y, cells(m, 0.1), cells(m, 0.1), 3, sd) - 0.5) * 0.35, F_METAL);
    overlay(t, VERD, m, 0.08, 0.66, sd + 20, 1, 12);
  } },
  gold: { base: C(GOLD, 5, F_METAL), m: 0.5, paint: (t, s, sd, m) => {
    t.field(GOLD, (x, y) => 0.6 + (nz(t, x, y, cells(m, 0.08), cells(m, 0.08), 3, sd) - 0.5) * 0.3, F_METAL);
    specks(t, Math.max(4, 0.04 * s), sd + 1, (x, y, r) => { if (r < 0.3) { t.nudge(x, y, 2); t.nudge(x + 1, y, 1); } }, 0.6);
  } },
  brass: { base: C(BRASS, 4, F_METAL), m: 0.5, paint: (t, s, sd, m) => {
    t.field(BRASS, (x, y) => 0.55 + (nz(t, x, y, cells(m, 0.1), cells(m, 0.1), 3, sd) - 0.5) * 0.35, F_METAL);
    overlay(t, VERD, m, 0.06, 0.7, sd + 20, 1, 6);
  } },
  olive: { base: C(OLIVE, 4), m: 0.5, paint: (t, s, sd, m) => {
    // enamelled steel: paint mottled with wear, chips knocked through to bright steel with a dark lip, rust
    // creeping out of the deeper chips and running down, grime in patches
    t.field(OLIVE, (x, y) => 0.52 + (nz(t, x, y, cells(m, 0.15), cells(m, 0.15), 3, sd) - 0.5) * 0.25);
    specks(t, Math.max(5, 0.07 * s), sd, (x, y, r) => { if (r > 0.55) return; const k = 1 + r * 0.02 * s; t.blob(x, y, k * 1.3, k, (xx, yy, d) => t.set(xx, yy, d > 0.25 ? C(STEEL, 5, F_METAL) : C(OLIVE, 1))); if (r < 0.15) rustBloom(t, x, y, k * 0.8, sd); });
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (nz(t, x, y, cells(m, 0.2), cells(m, 0.2), 3, sd + 30) > 0.66) t.dshift(x, y, -1, 0.7);
  } },
  rubber: { base: C(RUBB, 3), m: 0.5, paint: (t, s, sd, m) => {
    t.field(RUBB, (x, y) => 0.42 + (nz(t, x, y, cells(m, 0.06), cells(m, 0.06), 3, sd) - 0.5) * 0.25);
    specks(t, Math.max(3, 0.03 * s), sd, (x, y, r) => { if (r < 0.3) t.nudge(x, y, 2); else if (r < 0.4) t.nudge(x, y, -2); }, 0.6);
  } },
  bakelite: { base: C(BAKE, 3, F_GLOSS), m: 0.5, paint: (t, s, sd, m) => {
    // phenolic moulding: dark red-brown with wood-flour swirls in the resin, a glossy skin
    t.field(BAKE, (x, y) => 0.45 + (nz(t, x, y, cells(m, 0.06), cells(m, 0.2), 3, sd) - 0.5) * 0.45, F_GLOSS);
  } },
  concrete: { base: C(CONC, 4), m: 0.5, paint: (t, s, sd, m) => {
    // cast concrete: mottled cement, exposed aggregate, air pits with a lit far rim, a hairline crack
    stoneBody(t, CONC, m, sd, 0.55, 0.2, 0.03, 0.6);
    specks(t, Math.max(3, 0.025 * s), sd + 1, (x, y, r) => { if (r < 0.35) grain(t, x, y, C(r < 0.15 ? GRAN : SANDS, 3 + Math.round(r * 8)), 2, r); else if (r < 0.5) { t.nudge(x, y, -3); t.nudge(x, y + 1, 2); } });
    cracks(t, 1, s, sd + 3);
  } },
  brick: { base: C(BRICK, 4), m: 0.25, paint: (t, s, sd, m) => {
    stoneBody(t, BRICK, m, sd, 0.52, 0.08, 0.015, 0.7);
    specks(t, Math.max(3, 0.015 * s), sd + 1, (x, y, r) => { if (r < 0.25) grain(t, x, y, C(BRICK, 6), 1, r); else if (r < 0.35) { t.nudge(x, y, -3); t.nudge(x, y + 1, 1); } else if (r < 0.4) grain(t, x, y, C(STONE, 5), 2, r); }, 0.8);
  } },
  glass: { base: C(GLASS, 5, F_GLASS), m: 0.25, paint: (t, s, sd, m) => {
    // sheet glass: a deep green body, a long soft reflection, a few seeds (bubbles)
    t.field(GLASS, (x, y) => 0.55 + (nz(t, x, y, cells(m, 0.3), cells(m, 0.06), 2, sd) - 0.5) * 0.2 + (fract((x + y * 0.6) / t.w) < 0.12 ? 0.25 : 0), F_GLASS);
    specks(t, Math.max(5, 0.05 * s), sd, (x, y, r) => { if (r < 0.3) { t.set(x, y, C(GLASS, 7, F_GLASS)); t.nudge(x, y + 1, -2); } }, 0.6);
  } },
  board: { base: C(PCB, 2), m: 0.25, paint: (t, s, sd) => {
    t.field(PCB, (x, y) => 0.32 + hashf(x >> 1, y >> 1, sd) * 0.08);
    const g = Math.max(3, Math.round(0.006 * s));
    for (let k = 0; k < Math.max(4, t.w / g); k++) {
      let x = Math.floor((H(k, 1, sd) * t.w) / g) * g, y = Math.floor((H(k, 2, sd) * t.h) / g) * g;
      for (let seg = 0; seg < 3; seg++) { const L = (2 + Math.floor(H(k, seg + 3, sd) * 4)) * g, hz = H(k, seg + 9, sd) < 0.5; for (let i = 0; i <= L; i++) t.set(hz ? x + i : x, hz ? y : y + i, C(COP, 5, F_METAL)); if (hz) x += L; else y += L; }
      t.set(x, y, C(BRASS, 6, F_METAL)); t.set(x - 1, y, C(BRASS, 5, F_METAL)); t.set(x, y - 1, C(BRASS, 5, F_METAL));
    }
  } },
  enamelRed: { base: C(RED, 3), m: 0.5, paint: (t, s, sd, m) => { t.field(RED, (x, y) => 0.5 + (nz(t, x, y, cells(m, 0.15), cells(m, 0.15), 3, sd) - 0.5) * 0.3); specks(t, Math.max(5, 0.07 * s), sd, (x, y, r) => { if (r < 0.3) t.blob(x, y, 1.6, 1.2, (xx, yy, d) => t.set(xx, yy, d > 0.3 ? C(STEEL, 5) : C(RED, 0))); }, 0.6); } },
};
/** a single palette step as a material ('s:ramp:step:flags'): never a flat fill, but that step mottled with its
 *  neighbours on the ramp in clustered clumps, plus the surface's own marks (scratches on metal, pores on matter,
 *  a soft streak on glass), at 4 m to the tile so small parts keep their density */
const solidCache = new Map<string, Mat>();
function solidMat(k: string): Mat | null {
  if (!k.startsWith('s:')) return null;
  let M = solidCache.get(k);
  if (M) return M;
  const [, r, i, f] = k.split(':'), fl = Number(f) || 0, base = code(r, Number(i), fl), ramp = cRamp(base), st = cStep(base), n = cLen(base);
  M = { base, m: 0.25, paint: (t, sc, sd, m) => {
    const amp = fl & F_GLASS ? 0.55 : fl & F_EMIT ? 0.5 : fl & (F_METAL | F_GLOSS) ? 0.75 : 0.95;
    t.field(ramp, (x, y) => (st + (nz(t, x, y, cells(m, 0.06), cells(m, 0.06), 3, sd) - 0.5) * amp * 1.5 + (nz(t, x, y, cells(m, 0.015), cells(m, 0.015), 2, sd + 5) - 0.5) * amp * 0.55) / Math.max(1, n - 1), fl);
    if (fl & F_METAL) specks(t, Math.max(4, 0.05 * sc), sd + 2, (x, y, q) => { if (q < 0.4) { const a = q * 7, L = 2 + q * 0.04 * sc; for (let j = 0; j < L; j++) t.nudge(x + Math.round(Math.cos(a) * j), y + Math.round(Math.sin(a) * j), 1); } }, 0.6);
    else if (fl & F_GLASS) { for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) if (fract((x + y * 0.7) / t.w) < 0.1) t.nudge(x, y, 1); }
    else if (!(fl & F_EMIT)) specks(t, Math.max(3, 0.02 * sc), sd + 3, (x, y, q) => { if (q < 0.25) { t.nudge(x, y, -1); t.nudge(x, y + 1, 1); } }, 0.7);
  } };
  solidCache.set(k, M);
  return M;
}
const matOf = (k: string): Mat | undefined => MATS[k] ?? solidMat(k) ?? undefined;
export const MAT_KEYS = Object.keys(MATS);
export const hasMat = (k: string) => !!matOf(k);
/** a material's base code (the tone a far LOD uses) */
export const matBase = (k: string): Code => matOf(k)?.base ?? code('stone', 3);

// ------------------------------------------------------------------ tiles, textures
const tileCache = new Map<string, { tile: CTile; metres: number }>();
/** a material's tile at a texel density (px per metre), with the metres it spans */
export function tileOf(key: string, ppm: number, seed = 0): { tile: CTile; metres: number } {
  const M = matOf(key) ?? MATS.granite;
  const T = Math.max(8, Math.min(256, Math.round(M.m * ppm)));
  const ck = `${key}|${T}|${seed}`;
  let e = tileCache.get(ck);
  if (!e) { const t = new CTile(T, T, M.base); M.paint(t, T / M.m, (seed * 101 + key.length * 17 + 5) | 0, M.m); e = { tile: t, metres: M.m }; tileCache.set(ck, e); }
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
