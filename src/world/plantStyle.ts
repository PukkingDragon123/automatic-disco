// ODDWORLD flora style: every plant is built from deliberate shapes, never noise. Leaves are drawn along a curved
// spine with a lit half and a shadow half, a midrib and a brighter tip; puffs and pods are cel-shaded spheres with
// a hard highlight and a cool rim light; everything is quantised to four crisp tone bands and outlined in a deep
// shade of its own colour. The forms are alien: eye-flowers that watch, fiddle-spirals, lantern pods, plate trees.
import { PixelCanvas, makeRamp, mixHex, scaleHex } from '../limbo/gfx/pixel';
import { Rand } from '../core/rand';
import type { Palette } from './palette';
import type { PlantSpecies } from './plantArt';

export const PX = 32;
type P2 = [number, number];
export type Painter = (sp: PlantSpecies, h: number, r: Rand, pal: Palette) => PixelCanvas;

const RAMP = (c: number, n = 6, s = 0.62, hs = 0.07) => makeRamp(c, n, { spread: s, hueShift: hs });
const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));
const LX = -0.6, LY = -0.8; // light from the upper left
const RIM = 0xbfeee8;       // cool sky rim on the shadow side

/** four crisp bands across ramp indices 1..n (index 0 is kept for creases and outlines) */
function cel(ramp: number[], v: number) {
  const n = ramp.length - 1, b = Math.floor(Math.max(0, Math.min(0.999, v)) * 4);
  return ramp[Math.min(n, 1 + Math.round((b * (n - 1)) / 3))];
}
function bez(p0: P2, p1: P2, p2: P2, t: number): P2 { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; }
function blen(p0: P2, p1: P2, p2: P2) { return Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); }

export function canvasFor(wm: number, hm: number) {
  const w = Math.max(8, Math.ceil(wm * PX)) + 6, h = Math.max(8, Math.ceil(hm * PX)) + 4;
  const pc = new PixelCanvas(w, h); pc.wrap = false; pc.clear();
  return pc;
}

interface LeafOpt { shape?: 'lance' | 'round' | 'blade' | 'heart' | 'petal' | 'strap'; rib?: boolean; notch?: number; tip?: number[]; tipFrom?: number; alpha?: number; tipLight?: number; rimSide?: boolean }
/** a shaped leaf or petal along a curved spine */
export function leaf(pc: PixelCanvas, p0: P2, p1: P2, p2: P2, wid: number, ramp: number[], o: LeafOpt = {}) {
  const shape = o.shape ?? 'lance';
  const steps = Math.max(6, Math.ceil(blen(p0, p1, p2) * 2.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, [x, y] = bez(p0, p1, p2, t), [x2, y2] = bez(p0, p1, p2, Math.min(1, t + 0.02));
    let tx = x2 - x, ty = y2 - y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const prof = shape === 'lance' ? Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.06)), 0.72)
      : shape === 'round' ? Math.sqrt(Math.max(0, Math.sin(Math.PI * t)))
        : shape === 'blade' ? Math.pow(1 - t, 0.75) * Math.min(1, t * 8 + 0.3)
          : shape === 'heart' ? Math.max(0, Math.sin(Math.PI * t) * (1 + 0.4 * Math.sin(Math.PI * t * 2 + 0.4)))
            : shape === 'strap' ? Math.min(1, t * 6) * Math.pow(1 - t * 0.7, 0.5)
              : Math.pow(Math.max(0, Math.sin(Math.PI * t)), 0.5) * (0.55 + 0.45 * t);
    const w = Math.max(0.5, wid * prof);
    const facing = nx * LX + ny * LY;
    for (let s = -w; s <= w; s += 0.5) {
      const side = s / w;
      if (o.notch && Math.abs(side) > 0.55 && ((i + (s > 0 ? 0 : 2)) % o.notch) === 0) continue;
      let v = 0.5 + 0.34 * Math.sign(side) * Math.sign(facing || 1) * Math.min(1, Math.abs(side) * 2.4) + t * (o.tipLight ?? 0.16) - 0.06;
      if (Math.abs(side) > 0.84) v -= 0.2;
      let c = cel(ramp, v);
      if (o.rib && Math.abs(s) < 0.5 && t > 0.05 && t < 0.88) c = ramp[1];
      if (o.tip && t >= (o.tipFrom ?? 0.75)) c = cel(o.tip, v + (t - (o.tipFrom ?? 0.75)) * 0.8);
      if (o.rimSide && side * Math.sign(facing || 1) < -0.7 && v < 0.4) c = mixHex(c, RIM, 0.35);
      pc.set(x + nx * s, y + ny * s, c, o.alpha ?? 255);
    }
  }
}

interface OrbOpt { rim?: boolean; hi?: boolean; spots?: number; spotCol?: number; alpha?: number; glowCore?: number; squash?: number }
/** a cel-shaded sphere: hard highlight, cool rim light, dark crease on the shadow edge */
export function orb(pc: PixelCanvas, cx: number, cy: number, r: number, ramp: number[], o: OrbOpt = {}, rng?: Rand) {
  const sq = o.squash ?? 1;
  for (let y = Math.floor(cy - r * sq - 1); y <= Math.ceil(cy + r * sq + 1); y++) for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / (r * sq), d2 = dx * dx + dy * dy;
    if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2);
    const v = 0.16 + nz * 0.44 + (dx * LX + dy * LY) * 0.42;
    let c = cel(ramp, v);
    if (d2 > 0.8 && dx + dy > 0.35) c = ramp[1];
    if (o.rim !== false && dx > 0.42 && d2 > 0.58 && dy < 0.5) c = mixHex(c, RIM, 0.45);
    if (o.glowCore !== undefined && d2 < 0.3) c = mixHex(c, o.glowCore, 0.6 - d2);
    pc.set(x, y, c, o.alpha ?? 255);
  }
  if (o.hi !== false && r >= 2) { pc.set(cx - r * 0.38, cy - r * 0.42 * sq, mixHex(ramp[ramp.length - 1], 0xffffff, 0.55)); if (r >= 4) pc.set(cx - r * 0.38 + 1, cy - r * 0.42 * sq, ramp[ramp.length - 1]); }
  if (o.spots && rng) for (let k = 0; k < o.spots; k++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(0.15, 0.6) * r, sx = cx + Math.cos(a) * d, sy = cy + Math.sin(a) * d * sq;
    pc.set(sx, sy, o.spotCol ?? ramp[1]); if (r > 5) { pc.set(sx + 1, sy, o.spotCol ?? ramp[1]); pc.set(sx, sy - 1, mixHex(o.spotCol ?? ramp[1], 0xffffff, 0.5)); }
  }
}

/** a tapering stem with a lit left edge and a shaded right edge */
export function stalk(pc: PixelCanvas, p0: P2, p1: P2, p2: P2, w0: number, w1: number, ramp: number[], rings = 0) {
  const steps = Math.max(6, Math.ceil(blen(p0, p1, p2) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, [x, y] = bez(p0, p1, p2, t), [x2, y2] = bez(p0, p1, p2, Math.min(1, t + 0.02));
    let tx = x2 - x, ty = y2 - y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx, w = Math.max(0.5, w0 + (w1 - w0) * t);
    for (let s = -w; s <= w; s += 0.5) {
      const lx = nx * s, side = s / w;
      let v = 0.5 - Math.sign(lx) * 0.3 * Math.min(1, Math.abs(side) * 2) - (Math.abs(side) > 0.8 ? 0.15 : 0);
      if (rings && (i % rings) === 0) v -= 0.25;
      pc.set(x + nx * s, y + ny * s, cel(ramp, v));
    }
  }
}

/** selective outline in a deep shade of whatever it borders: dark below-right, lighter above-left */
export function outline(pc: PixelCanvas, deep: number) {
  const W = pc.w, H = pc.h, src = new Uint8ClampedArray(pc.data);
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && src[(y * W + x) * 4 + 3] > 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (op(x, y)) continue;
    const l = op(x + 1, y), rr = op(x - 1, y), u = op(x, y + 1), d = op(x, y - 1);
    if (!(l || rr || u || d)) continue;
    const nx = l ? x + 1 : rr ? x - 1 : x, ny = u ? y + 1 : d ? y - 1 : y;
    const i = (ny * W + nx) * 4;
    const nc = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
    const lit = (l && !rr) || (u && !d);
    pc.set(x, y, mixHex(deep, scaleHex(nc, 0.5), lit ? 0.45 : 0.12));
  }
}
const deepOf = (ramp: number[]) => scaleHex(ramp[0], 0.55);

// ------------------------------------------------------------------------------------------------ painters
const blades = (pc: PixelCanvas, r: Rand, cx: number, by: number, n: number, len: number, spread: number, G: number[], wid = 1.4) => {
  const list: { a: number; l: number; x: number }[] = [];
  for (let i = 0; i < n; i++) list.push({ a: r.range(-spread, spread), l: len * r.range(0.55, 1), x: cx + r.range(-2, 2) });
  list.sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
  for (const b of list) {
    const tip: P2 = [b.x + Math.sin(b.a) * b.l, by - Math.cos(b.a) * b.l * 0.95];
    leaf(pc, [b.x, by], [b.x + Math.sin(b.a) * b.l * 0.15, by - b.l * 0.55], tip, wid + r.range(0, 0.6), G, { shape: 'blade' });
  }
};

const tuft: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.9, h), G = RAMP(sp.leaf), A = RAMP(sp.accent), cx = pc.w / 2, by = pc.h - 2;
  blades(pc, r, cx, by, r.int(9, 14), h * PX, 0.75, G, 1.1);
  if (sp.arch === 'reed') for (let i = 0; i < r.int(2, 4); i++) {
    const x = cx + r.range(-3, 3), top = by - h * PX * r.range(0.8, 1);
    stalk(pc, [x, by], [x, by - h * 10], [x + r.range(-2, 2), top + 5], 0.6, 0.5, G);
    orb(pc, x, top + 3, 1.6, A, { squash: 2.4 });
  } else if (r.chance(0.6)) for (let i = 0; i < 4; i++) { const x = cx + r.range(-4, 4), y = by - h * PX * r.range(0.65, 0.95); pc.set(x, y, A[4]); pc.set(x, y + 1, A[2]); }
  outline(pc, deepOf(G));
  return pc;
};

const fern: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.6, h * 1.05), G = RAMP(sp.leaf), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(6, 9), fr: number[] = [];
  for (let i = 0; i < n; i++) fr.push(-1.2 + (2.4 * i) / (n - 1) + r.range(-0.1, 0.1));
  fr.sort((a, b) => Math.abs(b) - Math.abs(a));
  for (const a of fr) {
    const len = h * PX * r.range(0.75, 1);
    const p0: P2 = [cx, by], p1: P2 = [cx + Math.sin(a) * len * 0.45, by - len * 0.95], p2: P2 = [cx + Math.sin(a) * len, by - Math.cos(a) * len * 0.55];
    const steps = Math.ceil(len / 2.2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps, [x, y] = bez(p0, p1, p2, t), [x2, y2] = bez(p0, p1, p2, t + 0.03);
      const tx = x2 - x, ty = y2 - y, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      const ll = (1 - t) * 5 + 1.5;
      for (const s of [-1, 1]) leaf(pc, [x, y], [x + nx * s * ll * 0.5 + tx / tl * 1.5, y + ny * s * ll * 0.5 + ty / tl * 1.5], [x + nx * s * ll + tx / tl * ll * 0.6, y + ny * s * ll + ty / tl * ll * 0.6], 1.1, G, { shape: 'lance' });
    }
    stalk(pc, p0, p1, p2, 0.7, 0.5, G);
    // the youngest frond is still a fiddlehead
    if (Math.abs(a) < 0.3 && r.chance(0.7)) spiral(pc, p2[0], p2[1] - 2, 3.2, G);
  }
  outline(pc, deepOf(G));
  return pc;
};

function spiral(pc: PixelCanvas, cx: number, cy: number, r0: number, G: number[]) {
  for (let t = 0; t < 1; t += 0.01) { const a = t * Math.PI * 3.2, rad = r0 * (1 - t * 0.85); const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; pc.set(x, y, cel(G, 0.75 - t * 0.3)); pc.set(x + 1, y, cel(G, 0.5)); }
}

const shrub: Painter = (sp, h, r) => {
  // a puffball mound: distinct cel-shaded globes with dark gaps between them
  const pc = canvasFor(h * 1.45, h), G = RAMP(sp.leaf, 6, 0.66), cx = pc.w / 2, by = pc.h - 2;
  const L = RAMP(mixHex(sp.leaf, 0x2a4a2a, 0.55));
  blades(pc, r, cx, by, 6, h * PX * 0.3, 1.2, L, 1.2);
  const puffs: number[][] = [];
  const n = r.int(6, 11), rx = pc.w * 0.36, top = by - h * PX * 0.92;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = r.range(0, Math.PI);
    const rad = h * PX * r.range(0.16, 0.26);
    puffs.push([cx + Math.cos(a) * rx * r.range(0.2, 1) * (1 - t * 0.4), by - rad - (by - rad - top - rad) * Math.pow(r.next() * (1 - t * 0.3), 1.2) * 0.8 - t * h * 6, rad]);
  }
  puffs.sort((p, q) => p[1] - q[1] || p[2] - q[2]);
  const spots = sp.glow ? 2 : r.chance(0.4) ? 3 : 0;
  for (const [x, y, rad] of puffs) { orb(pc, x, y, rad + 1, [G[0], G[0], G[0], G[0], G[0], G[0]], { rim: false, hi: false }); orb(pc, x, y, rad, G, { spots, spotCol: sp.glow ? 0xfff6c0 : G[1] }, r); }
  outline(pc, deepOf(G));
  return pc;
};

const broadleaf: Painter = (sp, h, r) => {
  // the parasol-lobe tree: a twisting trunk holding rosettes of broad heart leaves, fruit pods hanging under them
  const pc = canvasFor(h * 0.9, h), G = RAMP(sp.leaf, 6, 0.66), T = RAMP(sp.trunk, 6, 0.55), A = RAMP(sp.accent), cx = pc.w / 2, by = pc.h - 2;
  const top: P2 = [cx + r.range(-4, 4), by - h * PX * 0.52];
  stalk(pc, [cx, by], [cx + r.range(-6, 6), by - h * PX * 0.3], top, Math.max(2.5, h * 1.6), Math.max(1.5, h), T, 5);
  const clusters: P2[] = [];
  const k = r.int(4, 6);
  for (let i = 0; i < k; i++) { const a = -Math.PI / 2 + (i / (k - 1) - 0.5) * 2.4; clusters.push([top[0] + Math.cos(a) * pc.w * 0.3, top[1] + Math.sin(a) * h * PX * 0.26 - h * 4]); }
  clusters.sort((a, b) => a[1] - b[1]);
  for (const c of clusters) stalk(pc, top, [(top[0] + c[0]) / 2, top[1] - 4], c, Math.max(1, h * 0.6), 0.6, T);
  for (const c of [...clusters].reverse()) {
    const m = r.int(5, 7), L = h * PX * r.range(0.13, 0.17);
    const ang: number[] = []; for (let i = 0; i < m; i++) ang.push(-Math.PI / 2 + (i / (m - 1) - 0.5) * 3.6);
    ang.sort((a, b) => Math.sin(b) - Math.sin(a));
    for (const a of ang) leaf(pc, c, [c[0] + Math.cos(a) * L * 0.5, c[1] + Math.sin(a) * L * 0.5 - 2], [c[0] + Math.cos(a) * L, c[1] + Math.sin(a) * L * 0.8], L * 0.42, G, { shape: 'heart', rib: true, rimSide: true });
    if (r.chance(0.6)) orb(pc, c[0] + r.range(-2, 2), c[1] + L * 0.5, Math.max(1.5, h * 0.7), A, { glowCore: sp.glow ? 0xffffff : undefined });
  }
  outline(pc, deepOf(G));
  return pc;
};

const umbrella: Painter = (sp, h, r) => {
  // the plate tree: stacked flat canopies, lime above and deep beneath, glowing beads hanging under the rim
  const pc = canvasFor(h * 1.3, h), G = RAMP(sp.leaf, 6, 0.66), T = RAMP(sp.trunk, 6, 0.55), A = RAMP(sp.accent), cx = pc.w / 2, by = pc.h - 2;
  const fork: P2 = [cx + r.range(-3, 3), by - h * PX * 0.4];
  stalk(pc, [cx, by], [cx, by - h * PX * 0.2], fork, Math.max(2, h * 1.3), Math.max(1.5, h * 0.9), T, 6);
  const plates = r.int(2, 3);
  for (let p = plates - 1; p >= 0; p--) {
    const py = by - h * PX * (0.66 + p * 0.12), rx = pc.w * (0.45 - p * 0.09), ry = Math.max(2.5, h * PX * 0.05);
    const ox = cx + r.range(-4, 4) * (p ? 1 : 0);
    stalk(pc, fork, [(fork[0] + ox) / 2, py + 6], [ox, py + ry], Math.max(1, h * 0.7), 0.8, T);
    const lobes = r.int(7, 11);
    for (let y = -ry * 2; y <= ry * 2.2; y++) for (let x = -rx - 2; x <= rx + 2; x++) {
      const a = Math.atan2(y / ry, x / rx), rr = Math.hypot(x / rx, y / (ry * 1.6));
      const scal = 1 + Math.sin(a * lobes + p) * 0.07;
      if (rr > scal) continue;
      const under = y > ry * 0.45;
      const v = under ? 0.2 + (1 - rr) * 0.12 : 0.66 + (1 - rr) * 0.28 - x / rx * 0.14 + (y < -ry * 0.5 ? 0.12 : 0) + (((x * 3 + y * 7) & 7) === 0 ? 0.15 : 0);
      pc.set(ox + x, py + y, cel(G, v));
    }
    // leaf tufts breaking the top edge of every plate
    for (let k = 0; k < lobes * 3; k++) {
      const x = ox + r.range(-rx * 0.9, rx * 0.9), y = py - ry * 1.4 * Math.sqrt(Math.max(0, 1 - ((x - ox) / rx) ** 2)) + 1;
      leaf(pc, [x, y + 1], [x + r.range(-1, 1), y - 2], [x + r.range(-2.5, 2.5), y - r.range(2, 4)], 1.2, G, { shape: 'lance', tipLight: 0.4 });
    }
    if (sp.glow || r.chance(0.5)) for (let k = 0; k < 5; k++) { const x = ox + r.range(-rx * 0.8, rx * 0.8), l = r.int(3, 8); for (let j = 0; j < l; j++) pc.set(x, py + ry * 1.3 + j, T[2]); pc.set(x, py + ry * 1.3 + l, A[4], sp.glow ? 200 : 255); }
  }
  outline(pc, deepOf(G));
  return pc;
};

const palm: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.0, h * 1.02), G = RAMP(sp.leaf, 6, 0.66), T = RAMP(sp.trunk, 6, 0.55), A = RAMP(sp.accent), cx = pc.w / 2, by = pc.h - 2;
  const bend = r.range(-h * 3, h * 3);
  const crown: P2 = [cx + bend, by - h * PX * 0.74];
  stalk(pc, [cx, by], [cx + bend * 0.1, by - h * PX * 0.4], crown, Math.max(2, h * 1.2), Math.max(1.5, h * 0.8), T, 3);
  const n = r.int(7, 10), fr: number[] = [];
  for (let i = 0; i < n; i++) fr.push(-2.5 + (5 * i) / (n - 1) + r.range(-0.12, 0.12));
  fr.sort((a, b) => Math.cos(a) - Math.cos(b));
  for (const a of fr) {
    const len = h * PX * r.range(0.3, 0.42);
    const tip: P2 = [crown[0] + Math.sin(a) * len, crown[1] - Math.cos(a) * len * 0.35 + len * 0.6 * Math.abs(Math.sin(a)) * 0.9];
    leaf(pc, crown, [crown[0] + Math.sin(a) * len * 0.5, crown[1] - len * 0.45], tip, Math.max(2, h * 1.5), G, { shape: 'lance', rib: true, notch: 3, rimSide: true });
  }
  for (let i = 0; i < 4; i++) orb(pc, crown[0] + r.range(-3, 3), crown[1] + r.range(2, 4), Math.max(1.5, h * 0.55), A, {});
  outline(pc, deepOf(G));
  return pc;
};

const weeper: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.95, h), G = RAMP(sp.leaf, 6, 0.6), T = RAMP(sp.trunk, 6, 0.55), cx = pc.w / 2, by = pc.h - 2;
  const top: P2 = [cx + r.range(-3, 3), by - h * PX * 0.7];
  stalk(pc, [cx, by], [cx + r.range(-5, 5), by - h * PX * 0.35], top, Math.max(2.5, h * 1.5), Math.max(1.5, h * 0.8), T, 7);
  const rx = pc.w * 0.36;
  const crown: number[][] = [];
  for (let i = 0; i < 9; i++) crown.push([top[0] + r.range(-rx * 0.8, rx * 0.8), top[1] + r.range(-h * 6, h * 2), h * PX * r.range(0.07, 0.11)]);
  crown.sort((a, b) => a[1] - b[1]);
  for (const [x, y, rad] of crown) orb(pc, x, y, rad, G, { rim: true });
  // curtains of hanging strands, beaded with leaves, paler at the tips
  const n = Math.floor(pc.w * 0.8);
  for (let i = 0; i < n; i++) {
    const x0 = top[0] + r.range(-rx * 1.05, rx * 1.05), y0 = top[1] + r.range(-h * 3, h * 4);
    const len = h * PX * r.range(0.25, 0.55) * (1 - Math.abs(x0 - top[0]) / (rx * 1.8));
    for (let k = 0; k < len; k++) { const x = x0 + Math.sin(k * 0.22 + i) * 0.7; pc.set(x, y0 + k, cel(G, 0.3 + (k / len) * 0.55 + ((k % 3 === 0) ? 0.2 : 0))); }
  }
  outline(pc, deepOf(G));
  return pc;
};

const spike: Painter = (sp, h, r) => {
  // torch lily: a clump of strap leaves under clubs of stacked petals, hot at the tip
  const pc = canvasFor(h * 0.8, h), G = RAMP(sp.leaf, 6, 0.6), A = RAMP(sp.accent, 6, 0.6, 0.09), cx = pc.w / 2, by = pc.h - 2;
  blades(pc, r, cx, by, r.int(6, 9), h * PX * 0.45, 0.9, G, 1.6);
  const n = r.int(3, 6);
  const heads: number[][] = [];
  for (let i = 0; i < n; i++) heads.push([cx + r.range(-pc.w * 0.28, pc.w * 0.28), by - h * PX * r.range(0.62, 0.98)]);
  heads.sort((a, b) => a[1] - b[1]);
  for (const [x, top] of heads) {
    stalk(pc, [x + r.range(-1, 1), by - 2], [x, (by + top) / 2], [x, top + 8], 0.8, 0.6, G);
    const hh = Math.max(6, Math.round(h * PX * 0.26));
    for (let k = hh; k >= 0; k--) {
      const t = k / hh, w = 1.2 + Math.sin(Math.min(1, (1 - t) * 1.2) * Math.PI * 0.95) * 2.2;
      for (let s = -w; s <= w; s += 0.5) pc.set(x + s, top + 8 - (hh - k), cel(A, 0.32 + (1 - t) * 0.55 - (s > w * 0.5 ? 0.2 : s < -w * 0.4 ? -0.1 : 0) + ((k % 3 === 0) ? -0.15 : 0)));
    }
    pc.set(x - 1, top + 8 - hh + 1, mixHex(A[5], 0xffffff, 0.5));
  }
  outline(pc, deepOf(G));
  return pc;
};

const rosette: Painter = (sp, h, r) => {
  // star rosette: two rings of thick pointed leaves, inner ring brighter, a glowing bud in the heart
  const pc = canvasFor(h * 1.7, h), G = RAMP(sp.leaf, 6, 0.66), cx = pc.w / 2, by = pc.h - 2;
  for (const ring of [0, 1]) {
    const n = ring ? r.int(6, 8) : r.int(8, 11), list: number[] = [];
    for (let i = 0; i < n; i++) list.push(-1.4 + (2.8 * i) / (n - 1) + r.range(-0.08, 0.08));
    list.sort((a, b) => Math.abs(b) - Math.abs(a));
    const R2 = ring ? RAMP(mixHex(sp.leaf, 0xffffff, 0.12), 6, 0.66) : G;
    for (const a of list) {
      const len = h * PX * (ring ? 0.62 : 0.95) * r.range(0.85, 1) * (1 - Math.abs(a) * 0.12);
      const tip: P2 = [cx + Math.sin(a) * len, by - Math.cos(a) * len * (ring ? 0.9 : 0.7) + Math.abs(a) * 3];
      leaf(pc, [cx, by - 1], [cx + Math.sin(a) * len * 0.45, by - len * 0.75], tip, len * 0.2, R2, { shape: 'lance', rib: true, tipLight: 0.35, rimSide: true });
    }
  }
  orb(pc, cx, by - h * PX * 0.18, Math.max(1.5, h * 2), RAMP(sp.accent), { glowCore: sp.glow ? 0xffffff : undefined });
  outline(pc, deepOf(G));
  return pc;
};

const coral: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.15, h), G = RAMP(sp.leaf, 6, 0.66), A = RAMP(sp.accent, 6, 0.66), cx = pc.w / 2, by = pc.h - 2;
  const tips: number[][] = [];
  const grow = (p: P2, a: number, len: number, w: number, d: number) => {
    const e: P2 = [p[0] + Math.sin(a) * len, p[1] - Math.cos(a) * len];
    stalk(pc, p, [p[0] + Math.sin(a) * len * 0.5 + r.range(-2, 2), p[1] - Math.cos(a) * len * 0.5], e, w, w * 0.75, G);
    if (d <= 0 || len < 3) { tips.push([e[0], e[1], Math.max(1.5, w * 1.2)]); return; }
    const k = r.int(2, 3);
    for (let i = 0; i < k; i++) grow(e, a + (i - (k - 1) / 2) * r.range(0.4, 0.7), len * r.range(0.62, 0.8), w * 0.72, d - 1);
  };
  grow([cx, by], r.range(-0.1, 0.1), h * PX * 0.34, Math.max(1.5, h * 2.6), 3);
  for (const [x, y, rad] of tips) orb(pc, x, y, rad, A, { glowCore: sp.glow ? 0xffffff : undefined, spots: rad > 2.5 ? 1 : 0, spotCol: A[1] }, r);
  outline(pc, deepOf(G));
  return pc;
};

const fungus: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 1.2, h), C = RAMP(sp.accent, 6, 0.66), S = RAMP(mixHex(sp.leaf, 0xe8e0d0, 0.65), 5, 0.45), cx = pc.w / 2, by = pc.h - 2;
  const caps: number[][] = [];
  for (let i = 0; i < r.int(1, 4); i++) caps.push([cx + r.range(-pc.w * 0.25, pc.w * 0.25), h * PX * (i === 0 ? 1 : r.range(0.4, 0.8)), r.range(0.3, 0.44) * h * PX]);
  caps.sort((a, b) => b[1] - a[1]);
  for (const [x, ch, cw] of caps) {
    const top = by - ch;
    stalk(pc, [x, by], [x + r.range(-2, 2), (by + top) / 2], [x, top + cw * 0.2], Math.max(1, cw * 0.14), Math.max(1, cw * 0.1), S);
    orb(pc, x, top + cw * 0.18, cw / 2, C, { squash: 0.55, spots: Math.floor(cw / 4), spotCol: sp.glow ? 0xfff8d0 : mixHex(C[5], 0xffffff, 0.5) }, r);
    for (let k = -cw / 2 + 2; k <= cw / 2 - 2; k++) { pc.set(x + k, top + cw * 0.2 + 1, C[1]); if (k % 2 === 0) pc.set(x + k, top + cw * 0.2 + 2, C[0]); }
  }
  outline(pc, deepOf(C));
  return pc;
};

const bulb: Painter = (sp, h, r) => {
  // lantern pods: translucent bladders full of light, swaying on thin stems
  const pc = canvasFor(h * 1.1, h), G = RAMP(sp.leaf, 6, 0.6), A = RAMP(sp.accent, 6, 0.6), cx = pc.w / 2, by = pc.h - 2;
  blades(pc, r, cx, by, 5, h * PX * 0.35, 1.1, G, 1.4);
  const pods: number[][] = [];
  for (let i = 0; i < r.int(2, 4); i++) pods.push([cx + r.range(-pc.w * 0.25, pc.w * 0.25), by - h * PX * r.range(0.5, 0.88), r.range(2.6, 4.4) * Math.max(1, h)]);
  pods.sort((a, b) => a[1] - b[1]);
  for (const [x, y, rad] of pods) {
    stalk(pc, [cx, by - 2], [x, (by + y) / 2], [x, y + rad], 0.6, 0.5, G);
    orb(pc, x, y, rad, A, { glowCore: 0xffffff, alpha: sp.glow ? 200 : 255 });
    for (let k = -rad + 1; k < rad; k += 3) pc.set(x + k * 0.3, y + k, A[2], sp.glow ? 200 : 255);
  }
  outline(pc, deepOf(G));
  return pc;
};

const barrel: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.8, h), G = RAMP(mixHex(sp.leaf, 0x5aa040, 0.35), 6, 0.62), A = RAMP(sp.accent), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(1, 2);
  for (let i = 0; i < n; i++) {
    const bx = cx + (n === 1 ? 0 : (i - 0.5) * pc.w * 0.34), th = h * PX * (i === 0 ? 0.95 : r.range(0.5, 0.7)), w = Math.max(4, h * PX * r.range(0.17, 0.22));
    const dome = w * 1.1;
    for (let y = 0; y < th; y++) {
      const fromTop = th - y;
      const ww = fromTop < dome ? w * Math.sqrt(Math.max(0, 1 - ((dome - fromTop) / dome) ** 2)) : w * (0.86 + 0.14 * Math.sin((y / th) * Math.PI));
      for (let k = -ww; k <= ww; k++) {
        const u = k / Math.max(1, ww), ridge = Math.cos(u * Math.PI * 3) * 0.5 + 0.5;
        let v = 0.55 - u * 0.3 + ridge * 0.15 - (y < 2 ? 0.2 : 0);
        if (Math.abs(u + 0.42) < 0.12 && fromTop > dome * 0.6) v += 0.3;
        pc.set(bx + k, by - y, cel(G, v));
        if (ridge > 0.96 && (y + Math.floor(k * 2)) % 5 === 0) pc.set(bx + k, by - y, 0xfff4dc);
      }
    }
    for (let k = 0; k < 3; k++) orb(pc, bx + r.range(-w * 0.4, w * 0.4), by - th + r.range(0, 2), 1.6, A, {});
  }
  outline(pc, deepOf(G));
  return pc;
};

const crystalbloom: Painter = (sp, h, r) => {
  const pc = canvasFor(h * 0.9, h), C = RAMP(sp.accent, 6, 0.7, 0.08), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(3, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n - 1) - 0.5) * 1.3 + r.range(-0.1, 0.1), len = h * PX * r.range(0.55, 1), w = r.range(1.5, 3);
    for (let t = 0; t < len; t++) {
      const f = t / len, ww = w * (f > 0.75 ? (1 - f) * 4 : 1);
      for (let k = -ww; k <= ww; k++) pc.set(cx + Math.sin(a) * t + k, by - Math.cos(a) * t, cel(C, k < 0 ? 0.9 : k > ww * 0.4 ? 0.2 : 0.6), 175);
    }
  }
  outline(pc, deepOf(C));
  return pc;
};

const lily: Painter = (sp, h, r) => {
  const pc = canvasFor(h, h), G = RAMP(sp.leaf), A = RAMP(sp.accent), cx = pc.w / 2, cy = pc.h / 2;
  for (let i = 0; i < r.int(2, 4); i++) {
    const x = cx + r.range(-pc.w * 0.2, pc.w * 0.2), y = cy + r.range(-pc.h * 0.2, pc.h * 0.2), rad = r.range(0.22, 0.32) * h * PX, notch = r.range(0, Math.PI * 2);
    for (let yy = -rad; yy <= rad; yy++) for (let xx = -rad; xx <= rad; xx++) {
      const d = Math.hypot(xx, yy); if (d > rad) continue;
      const ang = Math.atan2(yy, xx); if (Math.abs(((ang - notch + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.28 && d > 1) continue;
      pc.set(x + xx, y + yy, cel(G, 0.55 - (xx + yy) / rad * 0.25 - (d > rad - 1.2 ? 0.25 : 0) + ((Math.floor(ang * 3) % 2) ? 0.05 : 0)));
    }
  }
  if (r.chance(0.6)) orb(pc, cx, cy, 2.2, A, {});
  outline(pc, deepOf(G));
  return pc;
};

const eyeflower: Painter = (sp, h, r) => {
  // a stalked flower whose heart is an eye: iris, slit pupil, wet highlight. It watches what moves.
  const pc = canvasFor(h * 0.9, h), G = RAMP(sp.leaf, 6, 0.6), A = RAMP(sp.accent, 6, 0.66), cx = pc.w / 2, by = pc.h - 2;
  blades(pc, r, cx, by, 5, h * PX * 0.35, 1.0, G, 1.8);
  const hx = cx + r.range(-3, 3), hy = by - h * PX * 0.78, R0 = Math.max(4, h * PX * 0.16);
  stalk(pc, [cx, by], [cx + r.range(-6, 6), by - h * PX * 0.45], [hx, hy + R0 * 0.6], 1.2, 0.9, G);
  const n = r.int(7, 10);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.2; leaf(pc, [hx, hy], [hx + Math.cos(a) * R0 * 0.8, hy + Math.sin(a) * R0 * 0.8], [hx + Math.cos(a) * R0 * 1.6, hy + Math.sin(a) * R0 * 1.4], R0 * 0.4, A, { shape: 'petal', tipLight: 0.3 }); }
  const iris = RAMP(sp.glow ? 0x7affe0 : 0xffd040, 6, 0.6);
  orb(pc, hx, hy, R0 * 0.62, [0xf4f0e0, 0xf4f0e0, 0xece6d4, 0xf8f4ea, 0xfffcf4, 0xffffff], { rim: false, hi: false });
  orb(pc, hx + 0.5, hy, R0 * 0.42, iris, { rim: false, hi: false, glowCore: sp.glow ? 0xffffff : undefined });
  for (let y = -R0 * 0.36; y <= R0 * 0.36; y++) pc.set(hx + 0.5, hy + y, 0x080608);
  pc.set(hx - R0 * 0.2, hy - R0 * 0.2, 0xffffff);
  outline(pc, deepOf(G));
  return pc;
};

const fiddle: Painter = (sp, h, r) => {
  // fiddle spires: stalks that never finish unrolling, beaded with tiny leaflets
  const pc = canvasFor(h * 0.9, h), G = RAMP(sp.leaf, 6, 0.66), A = RAMP(sp.accent), cx = pc.w / 2, by = pc.h - 2;
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const x = cx + (i - (n - 1) / 2) * pc.w * 0.16 + r.range(-2, 2), top = by - h * PX * r.range(0.6, 0.92), rad = Math.max(3, h * PX * 0.09);
    stalk(pc, [x, by], [x + r.range(-4, 4), (by + top) / 2], [x, top + rad], 1.1, 0.8, G);
    for (let k = 0; k < 6; k++) { const yy = by - (by - top) * (0.2 + k * 0.12), s = k % 2 ? 1 : -1; leaf(pc, [x, yy], [x + s * 2, yy - 2], [x + s * 4, yy - 3], 1, G, { shape: 'lance' }); }
    spiral(pc, x + rad * 0.6, top + rad * 0.3, rad, G);
    if (sp.glow || i === 0) orb(pc, x + rad * 0.6, top + rad * 0.3, 1.5, A, { glowCore: 0xffffff, alpha: sp.glow ? 200 : 255 });
  }
  outline(pc, deepOf(G));
  return pc;
};

export const PAINT: Record<string, Painter> = { tuft, reed: tuft, fern, shrub, broadleaf, umbrella, palm, weeper, spike, rosette, coral, fungus, bulb, barrel, crystalbloom, lily, eyeflower, fiddle };
/** how each kind moves: 0 sway, 1 breathe, 2 bob, 3 shiver, 4 coil */
export const ANIM: Record<string, number> = { tuft: 0, reed: 0, fern: 0, shrub: 1, broadleaf: 0, umbrella: 0, palm: 0, weeper: 0, spike: 2, rosette: 1, coral: 3, fungus: 1, bulb: 1, barrel: 1, crystalbloom: 3, lily: 1, eyeflower: 4, fiddle: 4 };
