// Hand-drawing kit for the world's 2D pixel art (terrain blocks, ground cover, plant sprites). Colours come only from
// the master palette (src/art/palette.ts RAMPS), indexed by light. Shapes are drawn, not generated: polygons with
// planar facets, leaves from a bent spine with uneven halves and a pointed tip, blades as tidy staircase strokes,
// cracks as jagged lines with a lit lip, ground as angular tone plates. Light comes from the upper left; outlines
// are selective (darkest where a form turns from the light). No circles, no noise fills, no speckle.
import { PixelCanvas } from '../limbo/gfx/pixel';
import { RAMPS, nearestRamp, snapRGBA, type RampName } from '../art/palette';
import { Rand } from '../core/rand';

export type P2 = [number, number];

/** a master ramp resampled to n steps by nearest index (palette colours only) */
export function resample(r: readonly number[], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(r[Math.round((i * (r.length - 1)) / Math.max(1, n - 1))]);
  return out;
}
/** the master ramp nearest a colour, as n steps */
export const rampFor = (c: number, n = 7) => resample(RAMPS[nearestRamp(c)], n);
export const rampNamed = (name: RampName, n = 7) => resample(RAMPS[name], n);
export const nameFor = (c: number) => nearestRamp(c);
/** foliage ramps that sit beside each other on the planet: older, shaded and fresh leaves of the same plant */
const KIN: Partial<Record<RampName, RampName[]>> = {
  moss: ['olive', 'sage', 'ochre'], sage: ['teal', 'moss', 'straw'], teal: ['sage', 'slate', 'moss'], violet: ['plum', 'slate', 'sage'],
  plum: ['violet', 'coral', 'rust'], rust: ['coral', 'ochre', 'clay'], coral: ['plum', 'rust', 'clay'], ochre: ['straw', 'rust', 'moss'],
  straw: ['ochre', 'sand', 'sage'], olive: ['moss', 'ochre', 'sage'], clay: ['rust', 'soil', 'coral'], slate: ['teal', 'violet', 'stone'],
};
export function kinRamps(c: number, n = 7): number[][] {
  const k = nearestRamp(c), list = [k, ...(KIN[k] ?? ['moss', 'olive', 'sage'])];
  return list.map((x) => rampNamed(x, n));
}

// ------------------------------------------------------------------------------------------------ shapes
/** scanline fill of a polygon (even-odd), calling put(x, y) for every covered pixel centre */
export function fillPoly(pts: P2[], put: (x: number, y: number) => void) {
  let y0 = 1e9, y1 = -1e9;
  for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const xs: number[] = [];
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const cy = y + 0.5; xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) xs.push(a[0] + ((cy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) put(x, y);
  }
}

/**
 * A drawn mask in a local box: shape pixels, then shaded and outlined as one form. tone(x, y) returns a ramp index
 * for an interior pixel (local coordinates); edges facing down-right take ramp[0..1], up-left edges a lit step.
 */
export class Mask {
  readonly m: Uint8Array; readonly t: Int8Array;
  constructor(readonly x0: number, readonly y0: number, readonly w: number, readonly h: number) { this.m = new Uint8Array(w * h); this.t = new Int8Array(w * h).fill(-1); }
  has(x: number, y: number) { x -= this.x0; y -= this.y0; return x >= 0 && y >= 0 && x < this.w && y < this.h && this.m[y * this.w + x] > 0; }
  add(x: number, y: number, tone = -1) { x -= this.x0; y -= this.y0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; this.m[y * this.w + x] = 1; if (tone >= 0) this.t[y * this.w + x] = tone; }
  /** ink onto the canvas: interior tones, selective outline, no orphan pixels */
  ink(pc: PixelCanvas, ramp: number[], tone: (x: number, y: number) => number, o: { dark?: number; lit?: number | null; alpha?: number } = {}) {
    const n = ramp.length - 1, dark = o.dark ?? 0, a = o.alpha ?? 255;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (!this.m[y * this.w + x]) continue;
      const X = x + this.x0, Y = y + this.y0;
      // drop pixels that hang by a corner only (no orphans)
      const nb = +this.has(X - 1, Y) + +this.has(X + 1, Y) + +this.has(X, Y - 1) + +this.has(X, Y + 1);
      if (nb === 0) continue;
      const R = !this.has(X + 1, Y), D = !this.has(X, Y + 1), L = !this.has(X - 1, Y), U = !this.has(X, Y - 1);
      let i = this.t[y * this.w + x] >= 0 ? this.t[y * this.w + x] : tone(X, Y);
      if (R || D) i = Math.min(i, dark + (R && D ? 0 : 1));
      else if ((L || U) && o.lit !== null && o.lit !== undefined) i = Math.max(i, o.lit);
      pc.set(X, Y, ramp[Math.max(0, Math.min(n, i))], a);
    }
  }
}

/**
 * A faceted stone or pebble: an irregular 5-7 sided polygon, split by a diagonal into a lit upper-left plane and a
 * shaded lower-right plane, a top facet a step brighter, one highlight pixel, a contact shadow below and right.
 */
export function stone(pc: PixelCanvas, cx: number, cy: number, w: number, h: number, ramp: number[], r: Rand, shadow?: number) {
  const k = r.int(5, 7), a0 = r.range(0, Math.PI), pts: P2[] = [];
  for (let i = 0; i < k; i++) { const a = a0 + (i / k) * Math.PI * 2 + r.range(-0.25, 0.25), s = r.range(0.72, 1.05); pts.push([cx + Math.cos(a) * w * 0.5 * s, cy + Math.sin(a) * h * 0.5 * s]); }
  const M = new Mask(Math.floor(cx - w), Math.floor(cy - h), Math.ceil(w * 2) + 2, Math.ceil(h * 2) + 2);
  fillPoly(pts, (x, y) => M.add(x, y));
  if (shadow !== undefined) for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
    const X = x + M.x0, Y = y + M.y0;
    if (!M.has(X, Y) && (M.has(X - 1, Y) || M.has(X, Y - 1)) && !M.has(X + 1, Y + 1)) pc.set(X, Y, shadow);
  }
  const n = ramp.length - 1, split = r.range(-0.15, 0.25) * Math.min(w, h), top = cy - h * 0.18;
  M.ink(pc, ramp, (x, y) => {
    const d = (x + 0.5 - cx) + (y + 0.5 - cy);
    return d < split ? (y + 0.5 < top ? n - 1 : n - 2) : n - 4;
  }, { dark: 1, lit: null });
  if (w >= 3 && h >= 3) { const hx = Math.floor(cx - w * 0.18), hy = Math.floor(cy - h * 0.2); if (M.has(hx, hy)) pc.set(hx, hy, ramp[n]); }
}

/**
 * A leaf drawn from its spine: bent midrib, uneven halves, a pointed tip, an optional notch or bite; the half facing
 * the light a step brighter, the midrib drawn, the outline selective. ang: direction base->tip (radians, y down).
 */
export function leafStroke(pc: PixelCanvas, x: number, y: number, ang: number, len: number, wid: number, ramp: number[], r: Rand, o: { midrib?: boolean; notch?: boolean; alpha?: number } = {}) {
  const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  const bend = r.range(-0.25, 0.25), asym = r.range(0.12, 0.3) * (r.chance(0.5) ? 1 : -1);
  const notchT = o.notch ? r.range(0.35, 0.7) : -1, notchS = r.chance(0.5) ? 1 : -1;
  const ext = len + wid + 2, M = new Mask(Math.floor(x - ext), Math.floor(y - ext), Math.ceil(ext * 2) + 2, Math.ceil(ext * 2) + 2);
  const rib: P2[] = [];
  const steps = Math.max(4, Math.ceil(len * 2.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, c = bend * t * t * len;
    const sx = x + dx * len * t + px * c, sy = y + dy * len * t + py * c;
    rib.push([sx, sy]);
    const prof = Math.pow(Math.sin(Math.PI * Math.min(1, Math.pow(t, 0.85))), 0.8) * (1 - t * 0.15);
    for (const side of [-1, 1]) {
      let w = wid * prof * (1 + side * asym);
      if (side === notchS && Math.abs(t - notchT) < 0.08) w *= 0.35;
      for (let s = 0; s <= w; s += 0.5) M.add(Math.floor(sx + px * s * side), Math.floor(sy + py * s * side));
    }
  }
  const n = ramp.length - 1, litSide = px * -1 + py * -1 > 0 ? 1 : -1;
  M.ink(pc, ramp, (X, Y) => {
    // which side of the spine (nearest rib point) is this pixel on
    let best = 0, bd = 1e9;
    for (let i = 0; i < rib.length; i += 2) { const e = (X + 0.5 - rib[i][0]) ** 2 + (Y + 0.5 - rib[i][1]) ** 2; if (e < bd) { bd = e; best = i; } }
    const side = (X + 0.5 - rib[best][0]) * px + (Y + 0.5 - rib[best][1]) * py;
    return side * litSide > 0 ? n - 2 : n - 3;
  }, { dark: 1, lit: n - 1, alpha: o.alpha });
  if (o.midrib !== false && len >= 4) for (let i = 1; i < rib.length - 2; i += 2) { const X = Math.floor(rib[i][0]), Y = Math.floor(rib[i][1]); if (M.has(X, Y)) pc.set(X, Y, ramp[Math.max(1, n - 4)], o.alpha ?? 255); }
}

/** a grass blade: a one-pixel stroke rising from (x, y) in a tidy staircase, dark at the root, lit toward the tip */
export function bladeStroke(pc: PixelCanvas, x: number, y: number, len: number, lean: number, ramp: number[], tip?: number[]) {
  const n = ramp.length - 1;
  for (let k = 0; k < len; k++) {
    const t = k / Math.max(1, len - 1), off = Math.round(lean * t * t * (len / 3));
    const c = tip && t > 0.7 ? tip[tip.length - 2] : ramp[Math.min(n, Math.max(1, Math.round(1 + t * (n - 1.5))))];
    pc.set(x + off, y - k, c);
  }
}

/** a crack: a jagged line in the darkest step with a lit lip one row above where it runs level */
export function crackLine(pc: PixelCanvas, x: number, y: number, len: number, dark: number, lip: number, r: Rand) {
  let dx = r.chance(0.5) ? 1 : -1, run = 0;
  for (let k = 0; k < len; k++) {
    pc.set(x, y, dark);
    if (run > 0) pc.set(x, y - 1, lip);
    if (r.chance(0.65)) { x += dx; run++; } else { y += r.chance(0.5) ? 1 : -1; run = 0; }
    if (r.chance(0.12)) dx = -dx;
  }
}

/**
 * Angular tone plates over a tileable canvas: Manhattan-distance cells (no round shapes), each filled with one step
 * of ramp from idx[]; with bevel the plate's upper-left rim is a step lighter and its lower-right rim a step darker;
 * with seam the gaps between plates are drawn in that step. Returns the plate lookup.
 */
export function plates(pc: PixelCanvas, r: Rand, n: number, ramp: number[], idx: number[], o: { bevel?: boolean; seam?: number; sx?: number; sy?: number } = {}) {
  const W = pc.w, H = pc.h, sx = o.sx ?? 1, sy = o.sy ?? 1, top = ramp.length - 1;
  const pts = Array.from({ length: n }, () => [r.range(0, W), r.range(0, H), idx[r.int(0, idx.length - 1)]]);
  const map = new Int16Array(W * H), edge = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let d1 = 1e9, d2 = 1e9, i1 = 0;
    for (let i = 0; i < pts.length; i++) {
      let ddx = Math.abs(x + 0.5 - pts[i][0]); ddx = Math.min(ddx, W - ddx);
      let ddy = Math.abs(y + 0.5 - pts[i][1]); ddy = Math.min(ddy, H - ddy);
      const d = ddx * sx + ddy * sy;
      if (d < d1) { d2 = d1; d1 = d; i1 = i; } else if (d < d2) d2 = d;
    }
    map[y * W + x] = i1; edge[y * W + x] = d2 - d1;
  }
  const at = (x: number, y: number) => map[(((y % H) + H) % H) * W + (((x % W) + W) % W)];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = map[y * W + x];
    let k = pts[i][2];
    if (o.seam !== undefined && edge[y * W + x] < 1.0) k = o.seam;
    else if (o.bevel) { if (at(x - 1, y) !== i || at(x, y - 1) !== i) k += 1; else if (at(x + 1, y) !== i || at(x, y + 1) !== i) k -= 1; }
    pc.set(x, y, ramp[Math.max(0, Math.min(top, k))]);
  }
  return { map, at, pts };
}

/** clean up: lone pixels that match none of their four neighbours take the commonest neighbour colour */
export function tidy(pc: PixelCanvas) {
  const W = pc.w, H = pc.h, d = pc.data, src = new Uint32Array(W * H);
  for (let i = 0; i < W * H; i++) src[i] = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2] | (d[i * 4 + 3] < 255 ? 0x1000000 : 0);
  const g = (x: number, y: number) => (pc.wrap ? src[(((y % H) + H) % H) * W + (((x % W) + W) % W)] : x < 0 || y < 0 || x >= W || y >= H ? -1 : src[y * W + x]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = src[y * W + x]; if (c & 0x1000000 || d[(y * W + x) * 4 + 3] === 0) continue;
    const nb = [g(x - 1, y), g(x + 1, y), g(x, y - 1), g(x, y + 1)];
    if (nb.includes(c)) continue;
    let best = -1, bc = 0;
    for (const a of nb) { if (a < 0 || a & 0x1000000) continue; const k = nb.filter((b) => b === a).length; if (k > bc) { bc = k; best = a; } }
    if (best >= 0 && bc >= 2) pc.set(x, y, best & 0xffffff, d[(y * W + x) * 4 + 3]);
  }
}
/** every colour onto the master palette (alpha kept) */
export const toPalette = (pc: PixelCanvas) => snapRGBA(pc.data);
