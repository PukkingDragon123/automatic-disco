// Hand-drawn style pixel-art flora. Every plant is painted at 32 px/m with hue-shifted ramps, sphere-shaded leaf
// clumps lit from the upper left, interior rim lines between clumps and a selective outline (dark on the shadow
// side, lighter on the lit side), then packed into one atlas with coverage-preserving mipmaps.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex, toRGB } from '../limbo/gfx/pixel';
import { Rand, clamp } from '../core/rand';
import type { Palette } from './palette';
import type { BiomeKey } from './region';
import { PAINT as STYLE, ANIM } from './plantStyle';

export type Arch = 'tuft' | 'reed' | 'fern' | 'shrub' | 'broadleaf' | 'umbrella' | 'palm' | 'weeper' | 'spike' | 'rosette' | 'coral' | 'fungus' | 'bulb' | 'barrel' | 'crystalbloom' | 'lily' | 'eyeflower' | 'fiddle';
export const PX = 32;

export interface Sprite { u0: number; v0: number; du: number; dv: number; w: number; h: number; /** px */ pw: number; ph: number; ax: number }
export interface PlantSpecies {
  id: number; name: string; arch: Arch;
  /** world height range (m) */
  hmin: number; hmax: number;
  leaf: number; accent: number; trunk: number;
  /** habitat */
  fert: number; wetMin: number; wetMax: number; shore: boolean; water: boolean;
  weight: number; cluster: number;
  /** biomass per plant when eaten / absorbed, regrowth s */
  food: number; regrow: number; glow: boolean;
  /** blocks movement / casts big shadows */
  tree: boolean;
  /** 0 sway, 1 breathe, 2 bob, 3 shiver, 4 coil */
  anim: number;
  sprites: Sprite[];
}

const R = (c: number, n = 6, s = 0.55, hs = 0.05) => makeRamp(c, n, { spread: s, hueShift: hs });
const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));

// ---------------------------------------------------------------- primitives
function blob(pc: PixelCanvas, cx: number, cy: number, r: number, ramp: number[], base = 2.6, rim = true, a = 255) {
  const n = ramp.length - 1;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d = dx * dx + dy * dy;
    if (d > 1) continue;
    const lit = -(dx * 0.62 + dy * 0.78);
    let k = base + lit * 1.6;
    if (rim && d > 0.62 && dx + dy > 0.35) k = Math.min(k, 1);
    pc.set(x, y, ramp[ci(k, 0, n)], a);
  }
}
/**
 * Foliage mass: the union of sphere caps as a height field (not stacked circles), lit from the upper left,
 * quantised to ramp bands with clustered dither, creases between lobes darkened, leaf marks stamped on top and
 * leaf tips poking out of the silhouette.
 */
function mass(pc: PixelCanvas, sph: number[][], ramp: number[], r: Rand, opts: { bias?: number; marks?: number; tips?: number; alpha?: number } = {}) {
  const n = ramp.length - 1, bias = opts.bias ?? 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y, rad] of sph) { x0 = Math.min(x0, x - rad); y0 = Math.min(y0, y - rad); x1 = Math.max(x1, x + rad); y1 = Math.max(y1, y + rad); }
  const W = Math.ceil(x1 - x0) + 3, H = Math.ceil(y1 - y0) + 3, ox = Math.floor(x0) - 1, oy = Math.floor(y0) - 1;
  const hf = new Float32Array(W * H).fill(-1), crease = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = ox + i + 0.5, py = oy + j + 0.5;
    let h1 = -1, h2 = -1;
    for (const [x, y, rad, z = 0] of sph) {
      const d2 = rad * rad - (px - x) ** 2 - (py - y) ** 2;
      if (d2 <= 0) continue;
      const h = Math.sqrt(d2) + z;
      if (h > h1) { h2 = h1; h1 = h; } else if (h > h2) h2 = h;
    }
    hf[j * W + i] = h1;
    crease[j * W + i] = h2 > 0 && h1 - h2 < 1.2 ? 1 : 0;
  }
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? -1 : hf[j * W + i]);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const h = hf[j * W + i]; if (h < 0) continue;
    const gx = (Math.max(0, at(i + 1, j)) - Math.max(0, at(i - 1, j))) * 0.5, gy = (Math.max(0, at(i, j + 1)) - Math.max(0, at(i, j - 1))) * 0.5;
    const nx = -gx, ny = -gy, nz = 1.4, nl = Math.hypot(nx, ny, nz);
    const lit = (nx * -0.5 + ny * -0.6 + nz * 0.62) / nl;
    let k = 0.7 + Math.pow(Math.max(0, lit), 0.75) * 6 + bias + (pc.clusterT(ox + i, oy + j) - 0.5) * 0.55;
    if (crease[j * W + i]) k -= 1.6;
    pc.set(ox + i, oy + j, ramp[ci(k, 0, n)], opts.alpha ?? 255);
  }
  // leaf glyphs: little scalloped arcs (lighter cap, darker underside) like hand-placed leaves
  const marks = Math.floor(W * H * (opts.marks ?? 0.11));
  for (let m = 0; m < marks; m++) {
    const i = r.int(1, W - 2), j = r.int(1, H - 2);
    if (hf[j * W + i] < 0) continue;
    const idx = ramp.indexOf(pc.get(ox + i, oy + j));
    if (idx < 0) continue;
    const hi = ramp[ci(idx + 1, 0, n)], lo = ramp[ci(idx - 1, 0, n)];
    const a = opts.alpha ?? 255, X = ox + i, Y = oy + j;
    if (hf[j * W + i - 1] >= 0) pc.set(X - 1, Y, hi, a);
    pc.set(X, Y - 1, hi, a);
    if (hf[j * W + i + 1] >= 0) pc.set(X + 1, Y, hi, a);
    if (hf[(j + 1) * W + i] >= 0) pc.set(X, Y + 1, lo, a);
  }
  // leaf tips breaking the silhouette
  const tips = opts.tips ?? 0.35;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (hf[j * W + i] < 0 || r.next() > tips) continue;
    if (at(i, j - 1) >= 0 && at(i - 1, j) >= 0 && at(i + 1, j) >= 0 && at(i, j + 1) >= 0) continue;
    const dx = at(i + 1, j) < 0 ? 1 : at(i - 1, j) < 0 ? -1 : 0, dy = at(i, j - 1) < 0 ? -1 : at(i, j + 1) < 0 ? 1 : 0;
    const c = pc.get(ox + i, oy + j);
    pc.set(ox + i + dx, oy + j + dy, c, opts.alpha ?? 255);
    if (r.chance(0.4)) pc.set(ox + i + dx * 2, oy + j + dy * 2 + (dy === 0 ? -1 : 0), c, opts.alpha ?? 255);
  }
}
/** a cloud of lobes inside an ellipse (cx, cy, rx, ry), denser toward the middle */
function lobes(r: Rand, cx: number, cy: number, rx: number, ry: number, n: number, rmin: number, rmax: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = r.range(0, Math.PI * 2), d = Math.pow(r.next(), 0.7);
    const rad = r.range(rmin, rmax) * (1 - d * 0.35);
    out.push([cx + Math.cos(a) * d * rx, cy + Math.sin(a) * d * ry, rad, (1 - d) * rad * 0.6 - (Math.sin(a) > 0 ? d * 2 : 0)]);
  }
  return out;
}

function line(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number, c: number | ((t: number) => number), w = 1) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
    const col = typeof c === 'number' ? c : c(t);
    for (let k = 0; k < w; k++) pc.set(Math.floor(x) + k - ((w - 1) >> 1), Math.floor(y), col);
  }
}
function bez(p0: number[], p1: number[], p2: number[], t: number) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}
function curve(pc: PixelCanvas, p0: number[], p1: number[], p2: number[], c: (t: number) => number, w = 1, steps = 40) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, [x, y] = bez(p0, p1, p2, t);
    const ww = typeof w === 'number' ? w : 1;
    for (let k = 0; k < ww; k++) pc.set(Math.floor(x) + k - ((ww - 1) >> 1), Math.floor(y), c(t));
  }
}
/** tapered trunk with bark shading (lit left), wobble and root flare */
function trunk(pc: PixelCanvas, bx: number, by: number, tx: number, ty: number, w0: number, w1: number, ramp: number[], r: Rand) {
  const len = Math.hypot(tx - bx, ty - by), steps = Math.ceil(len);
  const wob = r.range(-1.5, 1.5);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = bx + (tx - bx) * t + Math.sin(t * Math.PI) * wob, y = by + (ty - by) * t;
    const w = w0 + (w1 - w0) * t + (t < 0.1 ? (0.1 - t) * 18 : 0);
    for (let k = -w / 2; k <= w / 2; k++) {
      const f = (k + w / 2) / Math.max(1, w);
      let s = f < 0.25 ? 4 : f < 0.55 ? 3 : f < 0.85 ? 2 : 1;
      if (((Math.floor(y) * 7 + Math.floor(x + k) * 3) % 11) === 0) s -= 1;
      pc.set(Math.floor(x + k), Math.floor(y), ramp[ci(s, 0, ramp.length - 1)]);
    }
  }
}
/** selective outline: shadow side dark, lit side a step lighter */
function outline(pc: PixelCanvas, dark: number) {
  const W = pc.w, H = pc.h, src = new Uint8ClampedArray(pc.data);
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 0;
  pc.wrap = false;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (op(x, y)) continue;
    const l = op(x + 1, y), rr = op(x - 1, y), u = op(x, y + 1), d = op(x, y - 1);
    if (!(l || rr || u || d)) continue;
    // neighbour colour drives the outline hue
    const nx = l ? x + 1 : rr ? x - 1 : x, ny = u ? y + 1 : d ? y - 1 : y;
    const i = (ny * W + nx) * 4;
    const nc = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
    const litSide = (l && !rr) || (u && !d);
    pc.set(x, y, mixHex(dark, scaleHex(nc, 0.55), litSide ? 0.55 : 0.18));
  }
}
function canvasFor(wm: number, hm: number) {
  const w = Math.max(6, Math.ceil(wm * PX)) + 4, h = Math.max(6, Math.ceil(hm * PX)) + 3;
  const pc = new PixelCanvas(w, h); pc.wrap = false; pc.clear();
  return pc;
}

// ---------------------------------------------------------------- archetypes (h = height in metres)
type Painter = (sp: PlantSpecies, h: number, r: Rand, pal: Palette) => PixelCanvas;

const tuft: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.9, h), G = R(sp.leaf, 6), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(7, 13);
  for (let i = 0; i < n; i++) {
    const bx = cx + r.range(-pc.w * 0.18, pc.w * 0.18), lean = r.range(-0.55, 0.55);
    const len = (h * PX) * r.range(0.55, 1);
    const tip = [bx + lean * len * 0.7, by - len], mid = [bx + lean * len * 0.1, by - len * 0.6];
    curve(pc, [bx, by], mid, tip, (t) => G[ci(1 + t * 4.2, 1, 5)]);
    if (sp.arch === 'reed' && i % 3 === 0) { // cattail heads
      const A = R(sp.accent, 5, 0.4);
      for (let k = 0; k < 4; k++) { pc.set(tip[0], tip[1] + k + 1, A[k === 0 ? 3 : 2]); pc.set(tip[0] + 1, tip[1] + k + 1, A[1]); }
    }
  }
  if (sp.arch === 'tuft' && r.chance(0.6)) { const A = R(sp.accent, 5, 0.45); for (let i = 0; i < 3; i++) blob(pc, cx + r.range(-3, 3), by - h * PX * r.range(0.7, 1), 1.3, A, 3, false); }
  outline(pc, mixHex(G[1], G[0], 0.6));
  return pc;
};

const fern: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.5, h * 1.05), G = R(sp.leaf, 7), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(6, 9);
  const fronds: { a: number; len: number }[] = [];
  for (let i = 0; i < n; i++) fronds.push({ a: -1.25 + (2.5 * i) / (n - 1) + r.range(-0.12, 0.12), len: h * PX * r.range(0.7, 1) });
  fronds.sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
  for (const f of fronds) {
    const ex = cx + Math.sin(f.a) * f.len * 0.95, ey = by - Math.cos(f.a) * f.len * 0.85;
    const mx = cx + Math.sin(f.a) * f.len * 0.4, my = by - f.len * 0.95;
    const steps = Math.ceil(f.len * 1.2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, [x, y] = bez([cx, by], [mx, my], [ex, ey], t);
      pc.set(x, y, G[2]);
      if (t > 0.12 && i % 2 === 0) {
        const L = (1 - t) * 4.2 + 1;
        const [x2, y2] = bez([cx, by], [mx, my], [ex, ey], Math.min(1, t + 0.02));
        const dx = x2 - x, dy = y2 - y, dl = Math.hypot(dx, dy) || 1;
        const nx = -dy / dl, ny = dx / dl;
        for (let k = 1; k <= L; k++) {
          pc.set(x + nx * k + dx / dl * k * 0.5, y + ny * k + dy / dl * k * 0.5, G[ci(4 - k * 0.3, 2, 6)]);
          pc.set(x - nx * k + dx / dl * k * 0.5, y - ny * k + dy / dl * k * 0.5, G[ci(3 - k * 0.3, 1, 5)]);
        }
      }
    }
  }
  outline(pc, scaleHex(G[0], 0.55));
  return pc;
};

const shrub: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.5, h), G = R(sp.leaf, 7, 0.6), cx = pc.w / 2, by = pc.h - 2;
  const rx = pc.w * 0.36, ry = h * PX * 0.36;
  const sph = lobes(r, cx, by - ry - 1, rx, ry, 14, Math.max(3, h * 4.2), Math.max(4, h * 7));
  mass(pc, sph, G, r, { bias: 0.3 });
  if (r.chance(0.65)) { const A = R(sp.accent, 5, 0.45); for (let i = 0; i < r.int(5, 10); i++) { const x = cx + r.range(-rx, rx), y = by - ry + r.range(-ry, ry * 0.6); if (pc.alpha(x, y) > 0) { pc.set(x, y, A[3]); pc.set(x - 1, y - 1, A[4]); pc.set(x + 1, y, A[1]); } } }
  outline(pc, scaleHex(G[0], 0.55));
  return pc;
};

function canopy(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, G: number[], r: Rand, n: number, flat = false, bias = 0.5) {
  const sph = lobes(r, cx, cy, rx, ry, Math.max(8, Math.round(n * 0.75)), flat ? Math.max(3, ry * 0.8) : Math.max(3, Math.min(rx, ry) * 0.32), flat ? Math.max(4, ry * 1.1) : Math.max(5, Math.min(rx, ry) * 0.58));
  mass(pc, sph, G, r, { bias });
  return sph;
}

const broadleaf: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.85, h), G = R(sp.leaf, 7), T = R(sp.trunk, 6), cx = pc.w / 2, by = pc.h - 2;
  const top = by - h * PX * 0.5;
  trunk(pc, cx, by, cx + r.range(-2, 2), top, Math.max(4, h * 2.6), Math.max(3, h * 1.5), T, r);
  for (let i = 0; i < 4; i++) line(pc, cx, top + 8, cx + r.range(-pc.w * 0.3, pc.w * 0.3), top - r.range(4, 14), T[2 + (i & 1)], 2);
  const cy = by - h * PX * 0.64;
  const sph: number[][] = [];
  const clumps = r.int(4, 6);
  for (let c = 0; c < clumps; c++) {
    const a = (c / clumps) * Math.PI * 2 + r.range(-0.3, 0.3);
    sph.push(...lobes(r, cx + Math.cos(a) * pc.w * 0.19, cy + Math.sin(a) * h * PX * 0.1 - (c === 0 ? h * 4 : 0), pc.w * 0.15, h * PX * 0.1, 7, h * 2.2, h * 3.6));
  }
  sph.push(...lobes(r, cx, cy - h * PX * 0.06, pc.w * 0.14, h * PX * 0.09, 6, h * 2.6, h * 4));
  mass(pc, sph, G, r, { bias: 0.3 });
  if (r.chance(0.5)) { const A = R(sp.accent, 5, 0.4); for (let i = 0; i < 14; i++) { const x = cx + r.range(-pc.w * 0.38, pc.w * 0.38), y = cy + r.range(-h * PX * 0.25, h * PX * 0.2); if (pc.alpha(x, y) > 0) { pc.set(x, y, A[3]); pc.set(x + 1, y + 1, A[1]); } } }
  outline(pc, scaleHex(G[0], 0.5));
  return pc;
};

const umbrella: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.25, h), G = R(sp.leaf, 7), T = R(sp.trunk, 6), cx = pc.w / 2, by = pc.h - 2;
  const top = by - h * PX * 0.72;
  trunk(pc, cx, by, cx + r.range(-3, 3), by - h * PX * 0.38, Math.max(3, h * 1.6), Math.max(2, h * 1.2), T, r);
  const fork = [cx, by - h * PX * 0.38];
  const arms = r.int(3, 4);
  for (let i = 0; i < arms; i++) {
    const tx = cx + (i / (arms - 1) - 0.5) * pc.w * 0.62, ty = top + r.range(-2, 4);
    curve(pc, fork, [(fork[0] + tx) / 2, fork[1] - h * 6], [tx, ty], (t) => T[ci(3 - t, 1, 4)], 2);
  }
  for (let layer = 0; layer < 2; layer++) canopy(pc, cx, top - layer * h * 3.2, pc.w * (0.44 - layer * 0.08), h * PX * 0.06, G, r, 26 - layer * 8, true);
  outline(pc, scaleHex(G[0], 0.5));
  return pc;
};

const palm: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.95, h * 1.02), G = R(sp.leaf, 7), T = R(sp.trunk, 6), cx = pc.w / 2, by = pc.h - 2;
  const bend = r.range(-h * 3, h * 3);
  const crown = [cx + bend, by - h * PX * 0.78];
  const steps = Math.ceil(h * PX * 0.78);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, [x, y] = bez([cx, by], [cx + bend * 0.1, by - steps * 0.5], crown, t);
    const w = Math.max(2, h * 1.3 * (1.15 - t * 0.4));
    const ring = Math.floor(y) % 4 === 0;
    for (let k = -w / 2; k <= w / 2; k++) { const f = (k + w / 2) / w; pc.set(x + k, y, T[ci((ring ? 1 : 0) + (f < 0.3 ? 4 : f < 0.7 ? 3 : 2) - (ring ? 1.5 : 0), 0, 5)]); }
  }
  const n = r.int(7, 10);
  const fr: number[] = [];
  for (let i = 0; i < n; i++) fr.push(-2.4 + (4.8 * i) / (n - 1) + r.range(-0.15, 0.15));
  fr.sort((a, b) => Math.abs(b) - Math.abs(a));
  for (const a of fr) {
    const len = h * PX * r.range(0.32, 0.44);
    const side = Math.sign(Math.sin(a)) || 1;
    const ex = crown[0] + Math.sin(a) * len, ey = crown[1] - Math.cos(a) * len * 0.35 + len * 0.62 * Math.abs(Math.sin(a));
    const mx = crown[0] + Math.sin(a) * len * 0.55, my = crown[1] - len * 0.5;
    const steps = Math.ceil(len * 1.4);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, [x, y] = bez(crown, [mx, my], [ex, ey], t);
      const L = Math.sin(Math.min(1, t * 1.25) * Math.PI) * (2.5 + h * 0.9) + 0.6;
      for (let k = 1; k <= L; k++) {
        pc.set(x - side * k * 0.25, y + k, G[ci(4.4 - (k / L) * 2.4, 1, 6)]);
        pc.set(x + side * k * 0.45, y - k * 0.35, G[ci(5.2 - (k / L) * 1.5, 2, 6)]);
      }
      pc.set(x, y, G[3]);
    }
  }
  const A = R(sp.accent, 5, 0.4);
  for (let i = 0; i < 4; i++) blob(pc, crown[0] + r.range(-2.5, 2.5), crown[1] + r.range(1, 3), 1.7, A, 2.6);
  outline(pc, scaleHex(G[0], 0.5));
  return pc;
};

const weeper: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.95, h), G = R(sp.leaf, 7), T = R(sp.trunk, 6), cx = pc.w / 2, by = pc.h - 2;
  trunk(pc, cx, by, cx + r.range(-2, 2), by - h * PX * 0.6, Math.max(3, h * 2), Math.max(2, h), T, r);
  const cy = by - h * PX * 0.74, rx = pc.w * 0.36, ry = h * PX * 0.16;
  canopy(pc, cx, cy, rx, ry, G, r, 30);
  const strands = Math.floor(pc.w * 0.9);
  for (let i = 0; i < strands; i++) {
    const x = cx + r.range(-rx * 1.1, rx * 1.1), y0 = cy + r.range(-ry * 0.2, ry * 0.9);
    const len = h * PX * r.range(0.2, 0.5) * (1 - Math.abs(x - cx) / (rx * 1.6));
    for (let k = 0; k < len; k++) pc.set(x + Math.sin(k * 0.25 + i) * 0.6, y0 + k, G[ci(k % 3 === 0 ? 4 : 3 - (k / len) * 2, 1, 5)]);
  }
  outline(pc, scaleHex(G[0], 0.5));
  return pc;
};

const spike: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.75, h), G = R(sp.leaf, 6), A = R(sp.accent, 6, 0.6, 0.08), cx = pc.w / 2, by = pc.h - 2;
  for (let i = 0; i < 7; i++) { const bx = cx + r.range(-3, 3), lean = r.range(-0.7, 0.7), len = h * PX * r.range(0.25, 0.45); curve(pc, [bx, by], [bx, by - len * 0.6], [bx + lean * len, by - len], (t) => G[ci(1 + t * 3.5, 1, 5)]); }
  const n = r.int(2, 5);
  for (let i = 0; i < n; i++) {
    const bx = cx + r.range(-pc.w * 0.25, pc.w * 0.25), top = by - h * PX * r.range(0.65, 1);
    line(pc, bx, by, bx, top + 4, G[2]);
    const sh = Math.max(4, Math.round(h * PX * 0.28));
    for (let k = 0; k < sh; k++) {
      const t = k / sh, w = Math.max(1, Math.round(Math.sin((t * 0.85 + 0.15) * Math.PI) * 1.6 + 0.4));
      for (let j = -w; j <= w; j++) pc.set(bx + j, top + 4 - k, A[ci(1 + t * 4 + (j < 0 ? 0.6 : j > 0 ? -0.8 : 0), 0, 5)]);
    }
  }
  outline(pc, scaleHex(G[0], 0.5));
  return pc;
};

const rosette: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.6, h), G = R(sp.leaf, 7, 0.6), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(9, 13);
  const leaves: number[] = [];
  for (let i = 0; i < n; i++) leaves.push(-1.35 + (2.7 * i) / (n - 1) + r.range(-0.1, 0.1));
  leaves.sort((a, b) => Math.abs(b) - Math.abs(a));
  for (const a of leaves) {
    const len = h * PX * r.range(0.75, 1) * (1 - Math.abs(a) * 0.18);
    const steps = Math.ceil(len);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = cx + Math.sin(a) * len * t, y = by - Math.cos(a) * len * t * (1 - Math.abs(a) * 0.12) + t * t * Math.abs(a) * 4;
      const w = Math.max(0, (1 - t) * 3.4);
      for (let k = -w; k <= w; k++) pc.set(x + k * Math.cos(a), y + k * Math.sin(a) * 0.4, G[ci(k < 0 ? 4.6 - t : 2.6 - t * 0.6, 1, 6)]);
    }
  }
  if (r.chance(0.5)) { const A = R(sp.accent, 5); line(pc, cx, by - 4, cx, by - h * PX * 1.0, G[2]); for (let k = 0; k < 5; k++) blob(pc, cx + r.range(-1.5, 1.5), by - h * PX + k * 2.2, 1.4, A, 2.8, false); }
  outline(pc, scaleHex(G[0], 0.5));
  return pc;
};

const coral: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.1, h), G = R(sp.leaf, 6), A = R(sp.accent, 6, 0.55), cx = pc.w / 2, by = pc.h - 2;
  const tips: number[][] = [];
  const grow = (x: number, y: number, a: number, len: number, w: number, d: number) => {
    const ex = x + Math.sin(a) * len, ey = y - Math.cos(a) * len;
    curve(pc, [x, y], [x + Math.sin(a) * len * 0.5 + r.range(-2, 2), y - Math.cos(a) * len * 0.5], [ex, ey], (t) => G[ci(1.5 + t * 2.5, 1, 5)], Math.max(1, Math.round(w)), 20);
    if (d <= 0 || len < 3) { tips.push([ex, ey]); return; }
    const k = r.int(2, 3);
    for (let i = 0; i < k; i++) grow(ex, ey, a + (i - (k - 1) / 2) * r.range(0.35, 0.65), len * r.range(0.6, 0.78), w * 0.7, d - 1);
  };
  grow(cx, by, r.range(-0.1, 0.1), h * PX * 0.36, Math.max(2, h * 3), 3);
  for (const [x, y] of tips) blob(pc, x, y, r.range(1.3, 2.2), A, 3, false, sp.glow ? 170 : 255);
  outline(pc, scaleHex(G[0], 0.5));
  return pc;
};

const fungus: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.2, h), C = R(sp.accent, 7, 0.6), S = R(mixHex(sp.leaf, 0xe8e0d0, 0.6), 5, 0.4), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(1, 4);
  const caps: number[][] = [];
  for (let i = 0; i < n; i++) caps.push([cx + r.range(-pc.w * 0.25, pc.w * 0.25), h * PX * (i === 0 ? 1 : r.range(0.45, 0.8)), r.range(0.28, 0.42) * h * PX]);
  caps.sort((a, b) => b[1] - a[1]);
  for (const [x, ch, cw] of caps) {
    const top = by - ch, sw = Math.max(1, Math.round(cw * 0.22));
    for (let y = top; y <= by; y++) for (let k = -sw; k <= sw; k++) pc.set(x + k, y, S[ci(k < 0 ? 3.5 : 2 - (k > sw - 1 ? 1 : 0), 0, 4)]);
    const rr = cw / 2;
    for (let y = -rr * 0.7; y <= 1; y++) for (let k = -rr; k <= rr; k++) {
      const e = (k * k) / (rr * rr) + (y * y) / (rr * rr * 0.49);
      if (e > 1) continue;
      pc.set(x + k, top + y, C[ci(3.4 - (k / rr) * 1.2 - (y / rr) * 2.2 + (e > 0.75 && k > 0 ? -1.2 : 0), 0, 6)]);
    }
    for (let k = -rr + 1; k <= rr - 1; k++) pc.set(x + k, top + 1, C[0]);
    for (let s = 0; s < Math.floor(rr / 2); s++) { const sx = x + r.range(-rr * 0.6, rr * 0.6), sy = top - r.range(1, rr * 0.5); if (pc.alpha(sx, sy) > 0) pc.set(sx, sy, mixHex(C[6], 0xffffff, 0.6), sp.glow ? 120 : 255); }
  }
  outline(pc, scaleHex(C[0], 0.5));
  return pc;
};

const bulb: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.1, h), G = R(sp.leaf, 6), A = R(sp.accent, 7, 0.6), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(2, 4);
  for (let i = 0; i < n; i++) {
    const bx = cx + r.range(-pc.w * 0.22, pc.w * 0.22), top = by - h * PX * r.range(0.55, 0.92), rad = r.range(2.6, 4.2) * Math.max(1, h);
    curve(pc, [cx, by], [bx, by - (by - top) * 0.4], [bx, top + rad], (t) => G[ci(1.5 + t * 2, 1, 4)], 1);
    blob(pc, bx, top, rad, A, 3.1, true, sp.glow ? 175 : 255);
    pc.set(bx - rad * 0.4, top - rad * 0.45, 0xffffff, 200); pc.set(bx - rad * 0.4 + 1, top - rad * 0.45, A[6]);
  }
  for (let i = 0; i < 5; i++) { const a = r.range(-1.2, 1.2), len = h * PX * 0.25; curve(pc, [cx, by], [cx + Math.sin(a) * len * 0.5, by - len], [cx + Math.sin(a) * len, by - len * 0.6], (t) => G[ci(2 + t * 2, 1, 5)]); }
  outline(pc, scaleHex(G[0], 0.5));
  return pc;
};

const barrel: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.8, h), G = R(mixHex(sp.leaf, 0x5aa040, 0.35), 7, 0.62), A = R(sp.accent, 6), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(1, 2);
  const bodies: number[][] = [];
  for (let i = 0; i < n; i++) bodies.push([cx + (n === 1 ? 0 : (i - 0.5) * pc.w * 0.34), h * PX * (i === 0 ? 0.95 : r.range(0.5, 0.7)), Math.max(4, h * PX * r.range(0.17, 0.22))]);
  bodies.sort((p, q) => q[1] - p[1]);
  for (const [bx, th, w] of bodies) {
    const dome = w * 1.1;
    for (let y = 0; y < th; y++) {
      const fromTop = th - y;
      const ww = fromTop < dome ? w * Math.sqrt(Math.max(0, 1 - ((dome - fromTop) / dome) ** 2)) : w * (0.86 + 0.14 * Math.sin((y / th) * Math.PI));
      for (let k = -ww; k <= ww; k++) {
        const u = k / Math.max(1, ww), ridge = Math.cos(u * Math.PI * 3) * 0.5 + 0.5;
        let shade = 3.6 - u * 2 + ridge * 0.9 - (y < 2 ? 1 : 0) + (fromTop < dome * 0.5 ? 0.6 : 0);
        if (Math.abs(u + 0.42) < 0.12 && fromTop > dome * 0.6) shade += 1.4;
        pc.set(bx + k, by - y, G[ci(shade, 0, 6)]);
        if (ridge > 0.96 && (y + Math.floor(k * 2)) % 5 === 0) pc.set(bx + k, by - y, 0xfff4dc);
      }
    }
    for (let k = 0; k < 3; k++) { const fx = bx + r.range(-w * 0.45, w * 0.45), fy = by - th + r.range(0, 2); pc.set(fx, fy, A[3]); pc.set(fx, fy - 1, A[4]); pc.set(fx + 1, fy, A[2]); pc.set(fx - 1, fy, A[2]); }
  }
  outline(pc, scaleHex(G[0], 0.5));
  return pc;
};

const crystalbloom: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.9, h), C = R(sp.accent, 7, 0.65, 0.07), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(3, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / (n - 1) - 0.5) * 1.3 + r.range(-0.1, 0.1), len = h * PX * r.range(0.55, 1), w = r.range(1.5, 3);
    for (let t = 0; t < len; t++) {
      const f = t / len, ww = w * (f > 0.75 ? (1 - f) * 4 : 1);
      for (let k = -ww; k <= ww; k++) pc.set(cx + Math.sin(a) * t + k, by - Math.cos(a) * t, C[ci(k < 0 ? 5 : k > ww * 0.4 ? 1.5 : 3.4, 0, 6)], 175);
    }
  }
  outline(pc, scaleHex(C[0], 0.45));
  return pc;
};

const lily: Painter = (sp, h, r) => {
  // seen from above (lies flat on water)
  const pc = canvasFor(h, h), G = R(sp.leaf, 6), A = R(sp.accent, 5), cx = pc.w / 2, cy = pc.h / 2;
  const n = r.int(2, 4);
  for (let i = 0; i < n; i++) {
    const x = cx + r.range(-pc.w * 0.2, pc.w * 0.2), y = cy + r.range(-pc.h * 0.2, pc.h * 0.2), rad = r.range(0.22, 0.32) * h * PX, notch = r.range(0, Math.PI * 2);
    for (let yy = -rad; yy <= rad; yy++) for (let xx = -rad; xx <= rad; xx++) {
      const d = Math.hypot(xx, yy); if (d > rad) continue;
      const ang = Math.atan2(yy, xx); if (Math.abs(((ang - notch + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.28 && d > 1) continue;
      pc.set(x + xx, y + yy, G[ci(2.6 - (xx + yy) / rad + (d > rad - 1.2 ? -1 : 0), 0, 5)]);
    }
  }
  if (r.chance(0.6)) blob(pc, cx, cy, 2, A, 3, false);
  outline(pc, scaleHex(G[0], 0.55));
  return pc;
};

const PAINT = STYLE as unknown as Record<Arch, Painter>;
void [tuft, fern, shrub, broadleaf, umbrella, palm, weeper, spike, rosette, coral, fungus, bulb, barrel, crystalbloom, lily];

// ---------------------------------------------------------------- species generation
const SYL_A = ['vel', 'mor', 'ath', 'sil', 'qua', 'ren', 'dor', 'ixi', 'pha', 'ul', 'zer', 'cly', 'ob', 'tam', 'ny', 'ker', 'lio', 'sap'];
const SYL_B = ['ora', 'ithe', 'ana', 'ulus', 'ia', 'ex', 'opsis', 'ella', 'antha', 'odon', 'aria', 'ium', 'ens', 'ifer'];
export function binomial(r: Rand) {
  const g = r.pick(SYL_A) + r.pick(['', r.pick(SYL_A)]) + r.pick(SYL_B);
  const s = r.pick(SYL_A) + r.pick(SYL_B);
  return g[0].toUpperCase() + g.slice(1) + ' ' + s;
}

interface ArchSpec { arch: Arch; h: [number, number]; fert: number; wet: [number, number]; shore?: boolean; water?: boolean; weight: number; cluster: number; food: number; tree?: boolean }
const ARCHS: ArchSpec[] = [
  { arch: 'tuft', h: [0.3, 0.55], fert: 0.2, wet: [0, 1], weight: 6, cluster: 0.4, food: 4 },
  { arch: 'reed', h: [0.9, 1.5], fert: 0.3, wet: [0.4, 1], shore: true, weight: 2, cluster: 0.8, food: 6 },
  { arch: 'fern', h: [0.8, 1.4], fert: 0.45, wet: [0.45, 1], weight: 3, cluster: 0.6, food: 8 },
  { arch: 'shrub', h: [1.0, 2.0], fert: 0.35, wet: [0.2, 1], weight: 3, cluster: 0.5, food: 14 },
  { arch: 'broadleaf', h: [3.4, 4.8], fert: 0.55, wet: [0.45, 1], weight: 1.2, cluster: 0.85, food: 40, tree: true },
  { arch: 'umbrella', h: [3.6, 5], fert: 0.35, wet: [0.1, 0.65], weight: 0.7, cluster: 0.3, food: 40, tree: true },
  { arch: 'palm', h: [3.4, 4.8], fert: 0.4, wet: [0.35, 1], weight: 0.8, cluster: 0.6, food: 34, tree: true },
  { arch: 'weeper', h: [3.4, 4.6], fert: 0.5, wet: [0.6, 1], shore: true, weight: 0.6, cluster: 0.5, food: 38, tree: true },
  { arch: 'spike', h: [0.9, 1.6], fert: 0.35, wet: [0.2, 0.9], weight: 2.5, cluster: 0.75, food: 7 },
  { arch: 'rosette', h: [0.6, 1.1], fert: 0.15, wet: [0, 0.5], weight: 2, cluster: 0.4, food: 9 },
  { arch: 'coral', h: [0.8, 1.5], fert: 0.3, wet: [0.2, 0.9], weight: 1.6, cluster: 0.6, food: 10 },
  { arch: 'fungus', h: [0.3, 0.8], fert: 0.4, wet: [0.5, 1], weight: 1.5, cluster: 0.85, food: 8 },
  { arch: 'bulb', h: [0.7, 1.2], fert: 0.35, wet: [0.3, 1], weight: 1.4, cluster: 0.6, food: 10 },
  { arch: 'barrel', h: [0.7, 1.6], fert: 0.05, wet: [0, 0.35], weight: 1.4, cluster: 0.3, food: 16 },
  { arch: 'crystalbloom', h: [0.5, 1], fert: 0.05, wet: [0, 1], weight: 0.6, cluster: 0.7, food: 6 },
  { arch: 'lily', h: [0.6, 1], fert: 0, wet: [0, 1], water: true, weight: 1.2, cluster: 0.8, food: 6 },
  { arch: 'eyeflower', h: [0.9, 1.5], fert: 0.3, wet: [0.25, 1], weight: 1.4, cluster: 0.7, food: 9 },
  { arch: 'fiddle', h: [0.8, 1.4], fert: 0.35, wet: [0.4, 1], weight: 1.4, cluster: 0.7, food: 8 },
];

const BIOME_ARCH: Partial<Record<BiomeKey, Arch[]>> = {
  desert: ['tuft', 'rosette', 'barrel', 'barrel', 'shrub', 'umbrella', 'spike', 'crystalbloom'],
  tundra: ['tuft', 'fern', 'shrub', 'rosette', 'coral', 'fungus', 'weeper', 'broadleaf'],
  crystal: ['tuft', 'crystalbloom', 'crystalbloom', 'coral', 'rosette', 'shrub', 'fungus', 'umbrella'],
  ashland: ['tuft', 'fungus', 'fungus', 'barrel', 'rosette', 'coral', 'umbrella', 'shrub'],
  savanna: ['tuft', 'tuft', 'umbrella', 'umbrella', 'shrub', 'spike', 'rosette', 'barrel', 'bulb'],
  marsh: ['reed', 'reed', 'lily', 'weeper', 'fern', 'fungus', 'bulb', 'tuft', 'spike', 'palm', 'fiddle', 'eyeflower'],
  jungle: ['fern', 'fern', 'palm', 'palm', 'broadleaf', 'broadleaf', 'bulb', 'spike', 'coral', 'fungus', 'shrub', 'lily', 'weeper', 'eyeflower', 'fiddle'],
};
const DEFAULT_ARCH: Arch[] = ['tuft', 'fern', 'shrub', 'broadleaf', 'umbrella', 'palm', 'spike', 'rosette', 'coral', 'fungus', 'bulb', 'reed', 'lily', 'weeper', 'eyeflower', 'fiddle'];

export function makeFlora(pal: Palette, biome: BiomeKey, seed: number): PlantSpecies[] {
  const r = new Rand(seed ^ 0x5eed);
  const pool = BIOME_ARCH[biome] ?? DEFAULT_ARCH;
  const want = Math.min(pool.length + 3, 15);
  const archs = r.shuffle([...pool, ...r.shuffle([...pool]).slice(0, 3)]).slice(0, want);
  if (!archs.includes('tuft')) archs[0] = 'tuft';
  const out: PlantSpecies[] = [];
  archs.forEach((a, i) => {
    const s = ARCHS.find((x) => x.arch === a)!;
    const glow = a === 'crystalbloom' || ((a === 'fungus' || a === 'bulb') && r.chance(0.07));
    // a few flowering kinds carry a tint of their bloom colour in the leaf (like autumn foliage or a red-leaved
    // shrub), but it is always grounded in the planet's foliage, never a pure flower colour all over
    const vivid = (a === 'shrub' || a === 'rosette' || a === 'coral' || a === 'bulb' || a === 'fiddle') && r.chance(0.14);
    const foliage = r.pick(pal.foliage);
    out.push({
      id: i, name: binomial(r), arch: a, hmin: s.h[0], hmax: s.h[1],
      leaf: vivid ? mixHex(foliage, r.pick(pal.bloom), r.range(0.3, 0.45)) : foliage, accent: a === 'fungus' ? r.pick([...pal.fungus, ...pal.fungus, ...pal.bloom]) : a === 'crystalbloom' ? pal.crystal : r.pick(pal.bloom), trunk: r.pick(pal.bark),
      fert: s.fert, wetMin: s.wet[0], wetMax: s.wet[1], shore: !!s.shore, water: !!s.water,
      weight: s.weight, cluster: s.cluster, food: s.food, regrow: s.tree ? 240 : 60, glow, tree: !!s.tree, anim: ANIM[a] ?? 0, sprites: [],
    });
  });
  if (!out.some((p) => p.tree) && biome !== 'desert') {
    const s = ARCHS.find((x) => x.arch === 'broadleaf')!;
    out.push({ id: out.length, name: binomial(r), arch: 'broadleaf', hmin: s.h[0], hmax: s.h[1], leaf: r.pick(pal.foliage), accent: r.pick(pal.bloom), trunk: r.pick(pal.bark), fert: s.fert, wetMin: s.wet[0], wetMax: s.wet[1], shore: false, water: false, weight: s.weight, cluster: s.cluster, food: s.food, regrow: 240, glow: false, tree: true, anim: 0, sprites: [] });
  }
  return out;
}

// ---------------------------------------------------------------- atlas
export interface FloraAtlas { tex: THREE.DataTexture; size: number; detail: Sprite[] }

/** paint every species' variants (plus ground-cover detail sprites) into one mipmapped atlas */
export function buildFloraAtlas(species: PlantSpecies[], pal: Palette, seed: number, variants = 4): FloraAtlas {
  const S = 2048;
  const data = new Uint8ClampedArray(S * S * 4);
  let sx = 1, sy = 1, rowH = 0;
  const place = (pc: PixelCanvas, hm: number): Sprite => {
    if (sx + pc.w + 1 > S) { sx = 1; sy += rowH + 2; rowH = 0; }
    if (sy + pc.h + 1 > S) throw new Error('flora atlas full');
    for (let y = 0; y < pc.h; y++) data.set(pc.data.subarray(y * pc.w * 4, (y + 1) * pc.w * 4), ((sy + y) * S + sx) * 4);
    const sp: Sprite = { u0: sx / S, v0: sy / S, du: pc.w / S, dv: pc.h / S, w: pc.w / PX, h: pc.h / PX, pw: pc.w, ph: pc.h, ax: 0.5 };
    sx += pc.w + 2; rowH = Math.max(rowH, pc.h);
    void hm;
    return sp;
  };
  const r = new Rand(seed ^ 0xf10a);
  // tall first: better shelf packing
  const jobs: { sp: PlantSpecies; h: number; r: Rand }[] = [];
  for (const sp of species) for (let v = 0; v < variants; v++) jobs.push({ sp, h: sp.hmin + (sp.hmax - sp.hmin) * (v / Math.max(1, variants - 1)) * r.range(0.85, 1), r: r.fork(sp.id * 31 + v) });
  jobs.sort((a, b) => b.h - a.h);
  for (const j of jobs) j.sp.sprites.push(place(PAINT[j.sp.arch](j.sp, j.h, j.r, pal), j.h));
  // ground cover detail: tiny blades, pebbles, petals
  const detail: Sprite[] = [];
  for (let i = 0; i < 18; i++) {
    const kind = i % 6;
    const pc = new PixelCanvas(kind === 5 ? 6 : 9, kind === 5 ? 4 : 8); pc.wrap = false; pc.clear();
    const G = R(i % 2 ? pal.grass : mixHex(pal.grass, pal.grassDry, 0.4), 6);
    if (kind < 3) { for (let b = 0; b < 4; b++) { const x = 2 + b * 1.5 + r.range(-0.5, 0.5), hh = r.int(3, 6); for (let k = 0; k < hh; k++) pc.set(x + (k === hh - 1 ? r.pick([-1, 0, 1]) : 0), 7 - k, G[ci(2.6 + k * 0.7, 2, 5)]); } }
    else if (kind === 3) { const A = R(r.pick(pal.bloom), 5); line(pc, 4, 7, 4, 3, G[2]); pc.set(4, 2, A[3]); pc.set(3, 2, A[2]); pc.set(5, 2, A[2]); pc.set(4, 1, A[4]); pc.set(4, 3, A[1]); }
    else if (kind === 4) { const A = R(r.pick(pal.bloom), 5); for (let b = 0; b < 3; b++) { const x = 2 + b * 2.5; line(pc, x, 7, x + 0.5, 4, G[2]); pc.set(x + 0.5, 3, A[3]); } }
    else { const K = R(pal.rock, 5); pebbleish(pc, K); }
    if (kind >= 3) outline(pc, mixHex(G[2], G[0], 0.5));
    detail.push(place(pc, 0.2));
  }
  const tex = new THREE.DataTexture(new Uint8Array(data.buffer), S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = mipChain(new Uint8Array(data.buffer), S);
  tex.generateMipmaps = false;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return { tex, size: S, detail };
}
function pebbleish(pc: PixelCanvas, K: number[]) { for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) if (!((x === 0 || x === 4) && (y === 0 || y === 2))) pc.set(x, y + 1, K[ci(3 - x * 0.4 - y * 0.6, 1, 4)]); }

/** coverage-preserving mip chain: a coarse texel is opaque if at least half its children are */
function mipChain(base: Uint8Array, S: number) {
  const levels: { data: Uint8Array; width: number; height: number }[] = [{ data: base, width: S, height: S }];
  let src = base, s = S;
  while (s > 1) {
    const d = s >> 1, out = new Uint8Array(d * d * 4);
    for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let k = 0; k < 4; k++) {
        const i = ((y * 2 + (k >> 1)) * s + x * 2 + (k & 1)) * 4;
        if (src[i + 3] > 0) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; }
      }
      const o = (y * d + x) * 4;
      if (n >= 2) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255; }
    }
    levels.push({ data: out, width: d, height: d });
    src = out; s = d;
  }
  return levels;
}
void toRGB; void clamp;
