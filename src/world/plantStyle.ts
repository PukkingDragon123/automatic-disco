// ODDWORLD flora, grown rather than drawn. Every plant is first grown as a 3D structure: trees and shrubs by
// recursive branching (phyllotaxis, random divergence, photo- and gravitropism, pipe-model tapering) clipped to a
// crown envelope; palms and ferns as sagging fronds of individual leaflets; grasses, lilies and succulents as
// blades and whorls. The structure is projected to a slightly top-down side view and rasterised through a z-buffer
// as crisp pixel shapes: tapered limbs with bark furrows, and hundreds of individual leaves, each shaded by its
// own midrib-folded normal, by a light-space density grid (self-shadowing and crown occlusion) and by contact
// shadows under nearer leaves. A warm sunlit rim and a selective outline in a deep shade of the neighbouring colour
// finish it. Light comes from the upper left. The alien touch lives in the forms (eye-flowers that watch, lantern
// pods, fiddle spires, glowing beads) and in a few odd hues, not in neon.
import { PixelCanvas, mixHex } from '../limbo/gfx/pixel';
import { rampFor, kinRamps, step, fillPoly, type P2 as KP2 } from './pixelKit';
import { snapRGBA } from '../art/palette';
import { hashf } from '../limbo/core/rng';
import { Rand } from '../core/rand';
import type { Palette } from './palette';
import type { PlantSpecies } from './plantArt';

/** sqrt-based length (Math.hypot is several times slower in the hot loops) */
const hyp = (a: number, b: number, c = 0) => Math.sqrt(a * a + b * b + c * c);
export const PX = 32;
type P2 = [number, number];
export type V3 = [number, number, number];
export type Painter = (sp: PlantSpecies, h: number, r: Rand, pal: Palette) => PixelCanvas;
/** a grower builds the plant's 3D structure; the sprite (far LOD) and the 3D mesh (near LOD) are both made from it */
export type Grower = (sp: PlantSpecies, h: number, r: Rand, pal: Palette) => Plant;

/** the master-palette ramp nearest a colour (the old spread / hue-shift arguments are kept for call compatibility) */
const RAMP = (c: number, n = 7, _s = 0.6, _hs = 0.045) => rampFor(c, n);
const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));
const TAU = Math.PI * 2, GOLD = 2.39996;

// ------------------------------------------------------------------------------------------------ 3D helpers
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a: V3) => hyp(a[0], a[1], a[2]);
const nrm = (a: V3): V3 => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const perp = (a: V3): V3 => nrm(Math.abs(a[1]) < 0.9 ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]));
/** rotate v about the unit axis k by t (Rodrigues) */
const rot = (v: V3, k: V3, t: number): V3 => { const c = Math.cos(t), s = Math.sin(t); return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))); };
/** a direction tilted away from d by angle t, at azimuth az around d */
const deviate = (d: V3, t: number, az: number): V3 => nrm(rot(d, rot(perp(d), d, az), t));
/** direction from elevation above the horizon and azimuth (0 = +x to the right, PI/2 = toward the viewer) */
const polar = (el: number, az: number): V3 => [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
/** the part of "up" orthogonal to an axis: the way a leaf blade turns its face to the sky */
const faceUp = (d: V3): V3 => { const n = sub(UP, mul(d, d[1])); return len3(n) < 0.15 ? perp(d) : nrm(n); };
const UP: V3 = [0, 1, 0];

// the sprite is a side view seen a little from above (cards lean back toward the RTS camera)
const TILT = 0.3, CT = Math.cos(TILT), ST = Math.sin(TILT);
const VIEW: V3 = [0, ST, CT];
const SUP: V3 = [0, CT, -ST];
const LIGHT = nrm([-0.55, 0.75, 0.38]);
const RIMC = 0xf0e4c0; // warm sunlit edge
const RIM = 0xb4c4c0;  // cool sky bounce on the shadow side (2D painters)

export const enum K { NONE = 0, LEAF = 1, BARK = 2, ACC = 3 }
export type Shape = 'ovate' | 'lance' | 'round' | 'heart' | 'strap' | 'petal' | 'lobed' | 'needle';
/** half-width profile along a leaf, base (u = 0) to tip (u = 1) */
export const PROF: Record<Shape, (u: number) => number> = {
  ovate: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.75),
  lance: (u) => Math.sin(Math.PI * u) * (1 - 0.35 * u),
  // broad but always pointed: no round leaves
  round: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.6) * Math.min(1, (1 - u) * 3.2),
  heart: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.65)), 0.7) * (1 + 0.25 * (1 - u)),
  strap: (u) => Math.min(1, u * 5 + 0.35) * (1 - Math.pow(u, 3)),
  petal: (u) => Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.5) * (0.45 + 0.55 * u),
  lobed: (u) => Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.75) * (0.7 + 0.3 * Math.abs(Math.cos(u * Math.PI * 3.5))),
  needle: () => 0.5,
};

/** chain: limbs sharing a chain id, consecutive in the list, form one continuous tube in 3D; skip3d: drawn by a
 *  ribbon instead (blades, frond rachises) */
export interface Limb { a: V3; b: V3; ra: number; rb: number; ramp: number[]; seed: number; ridge?: number; ring?: number; kind?: K; alpha?: number; chain?: number; skip3d?: boolean; amb?: number }
export interface Leaf { p: V3; d: V3; n: V3; len: number; wid: number; shape: Shape; ramp: number[]; fold?: number; vein?: number; lat?: boolean; teeth?: boolean; kind?: K; alpha?: number; skip3d?: boolean; amb?: number }
export interface Orb { c: V3; r: number; ramp: number[]; seed: number; sq?: number; glow?: number; spots?: number; spotCol?: number; alpha?: number; ribs?: number; amb?: number }
export interface Cap { c: V3; r: number; hr: number; ramp: number[]; gill: number[]; seed: number; spots: number; spotCol: number; alpha?: number; amb?: number }
/**
 * 3D-only records. A ribbon is a flat strip along a polyline: a grass or strap blade (w = half width per point), or a
 * frond (w = pinna length per point; the painted frond texture carries the leaflets, fold tilts the two halves).
 */
export interface Ribbon { kind: 'blade' | 'frond' | 'strand'; out?: V3; pts: V3[]; w: number[]; ramp: number[]; dry?: number[]; dryFrom?: number; fold?: number; shape?: Shape; lobes?: boolean; start?: number; dead?: boolean; fwd?: number; wr?: number; lmax?: number; ramps?: number[][]; limbs?: Limb[] }
/** an eye-flower's eye: a disc facing n */
export interface Eye { p: V3; n: V3; r: number; iris: number[]; glow: boolean }

/** crisp tone bands across ramp indices 1..n (index 0 is kept for creases and outlines) */
function band(ramp: number[], v: number) { const n = ramp.length - 1; return ramp[1 + Math.min(n - 1, Math.max(0, Math.floor(v * n)))]; }
/** sunlit diffuse, sky ambient: both already attenuated by the plant's own foliage */
const tone = (diff: number, sun: number, amb: number) => 0.07 + amb * 0.38 + sun * diff * 0.55;

class Scene {
  readonly W: number; readonly H: number; readonly cx: number; readonly by: number;
  readonly zb: Float32Array; readonly kind: Uint8Array;
  constructor(readonly pc: PixelCanvas) {
    this.W = pc.w; this.H = pc.h; this.cx = pc.w / 2; this.by = pc.h - 2;
    this.zb = new Float32Array(this.W * this.H).fill(-1e9); this.kind = new Uint8Array(this.W * this.H);
  }
  X(p: V3) { return this.cx + p[0]; }
  Y(p: V3) { return this.by - (p[1] * CT - p[2] * ST); }
  Z(p: V3) { return p[1] * ST + p[2] * CT; }
  put(x: number, y: number, z: number, c: number, k: K, a = 255) {
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    const i = y * this.W + x;
    if (z <= this.zb[i]) return;
    this.zb[i] = z; this.kind[i] = k; this.pc.set(x, y, c, a);
  }
}

/** light-space occupancy: leaf area per cell as optical depth, marched toward the sun and the sky */
export class Shade {
  private cs = 3; private ox = 0; private oy = 0; private oz = 0; private nx = 1; private ny = 1; private nz = 1;
  private d: Float32Array;
  constructor(pts: [V3, number][]) {
    if (!pts.length) { this.d = new Float32Array(1); return; }
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const [p] of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); z0 = Math.min(z0, p[2]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); z1 = Math.max(z1, p[2]); }
    const cs = (this.cs = Math.max(4, Math.ceil(Math.max(x1 - x0, y1 - y0, z1 - z0) / 34)));
    this.ox = x0 - cs; this.oy = y0 - cs; this.oz = z0 - cs;
    this.nx = Math.ceil((x1 - x0) / cs) + 3; this.ny = Math.ceil((y1 - y0) / cs) + 3; this.nz = Math.ceil((z1 - z0) / cs) + 3;
    this.d = new Float32Array(this.nx * this.ny * this.nz);
    // a ray crossing a cell holding leaf area A is blocked with probability ~ A / (2 cs^2)
    for (const [p, a] of pts) { const i = this.idx(p); if (i >= 0) this.d[i] += a / (2 * cs * cs); }
  }
  private idx(p: V3) {
    const x = Math.floor((p[0] - this.ox) / this.cs), y = Math.floor((p[1] - this.oy) / this.cs), z = Math.floor((p[2] - this.oz) / this.cs);
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return -1;
    return (z * this.ny + y) * this.nx + x;
  }
  ray(p: V3, dir: V3, k: number) {
    // scalar march (no per-step allocation: this is the hottest loop of the whole flora atlas)
    const cs = this.cs, dx = dir[0] * cs, dy = dir[1] * cs, dz = dir[2] * cs, d = this.d, nx = this.nx, ny = this.ny, nz = this.nz;
    let s = 0, qx = p[0] + dx * 1.1, qy = p[1] + dy * 1.1, qz = p[2] + dz * 1.1;
    for (let i = 0; i < 80; i++) {
      const x = Math.floor((qx - this.ox) / cs), y = Math.floor((qy - this.oy) / cs), z = Math.floor((qz - this.oz) / cs);
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) break;
      s += d[(z * ny + y) * nx + x];
      qx += dx; qy += dy; qz += dz;
    }
    return Math.exp(-s * k);
  }
  /** sky visibility only (0 buried in the crown .. 1 open sky) */
  sky(p: V3) { return (this.ray(p, UP, 0.55) + this.ray(p, VIEW, 0.55) + this.ray(p, SIDE, 0.55) + this.ray(p, BACK, 0.55)) / 4; }
  light(p: V3): [number, number] {
    return [this.ray(p, LIGHT, 1), (this.ray(p, UP, 0.55) + this.ray(p, VIEW, 0.55) + this.ray(p, SIDE, 0.55)) / 3];
  }
}
const SIDE = nrm([-0.8, 0.45, 0.4]);
const BACK = nrm([0.7, 0.5, -0.5]);

function drawLimb(S: Scene, l: Limb, sun: number, amb: number) {
  const ax = S.X(l.a), ay = S.Y(l.a), bx = S.X(l.b), by = S.Y(l.b), za = S.Z(l.a), zb = S.Z(l.b);
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, Lp = Math.sqrt(L2) || 1;
  const qx = -dy / Lp, qy = dx / Lp;
  const q3: V3 = [qx, -qy * SUP[1], -qy * SUP[2]]; // the screen perpendicular as a view-plane direction
  const R = Math.max(l.ra, l.rb, 0.55) + 1;
  const x0 = Math.floor(Math.min(ax, bx) - R), x1 = Math.ceil(Math.max(ax, bx) + R), y0 = Math.floor(Math.min(ay, by) - R), y1 = Math.ceil(Math.max(ay, by) + R);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const ex = px + 0.5 - ax, ey = py + 0.5 - ay;
    let t = L2 > 0 ? (ex * dx + ey * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const rr = Math.max(0.55, l.ra + (l.rb - l.ra) * t);
    const cx = ex - dx * t, cy = ey - dy * t;
    if (cx * cx + cy * cy > rr * rr) continue;
    const s = Math.max(-1, Math.min(1, (cx * qx + cy * qy) / rr)), c = Math.sqrt(1 - s * s);
    const nl = (q3[0] * s + VIEW[0] * c) * LIGHT[0] + (q3[1] * s + VIEW[1] * c) * LIGHT[1] + (q3[2] * s + VIEW[2] * c) * LIGHT[2];
    let v = tone(Math.max(0, nl), sun, amb);
    const u = t * Lp;
    if (l.ridge) { // bark: furrows running along the limb, broken into plates
      const lane = Math.floor((s * 0.5 + 0.5) * l.ridge + hashf(Math.floor(u / 4), 7, l.seed) * 0.9);
      const hh = hashf(Math.floor(u / 2.6 + lane * 0.37), lane, l.seed);
      if (hh < 0.3) v -= 0.13; else if (hh > 0.88) v += 0.07;
    }
    if (l.ring && (Math.floor(u) + (l.seed & 7)) % l.ring === 0) v -= 0.16;
    S.put(px, py, za + (zb - za) * t + rr * c, band(l.ramp, v), l.kind ?? K.BARK, l.alpha ?? 255);
  }
}

function drawLeaf(S: Scene, l: Leaf, sun: number, amb: number) {
  const N = nrm(l.n), side = nrm(cross(N, l.d));
  const ox = S.X(l.p), oy = S.Y(l.p), oz = S.Z(l.p);
  const tip = add(l.p, mul(l.d, l.len)), sp = add(l.p, mul(side, l.wid));
  const ax = S.X(tip) - ox, ay = S.Y(tip) - oy, az = S.Z(tip) - oz;
  const bx = S.X(sp) - ox, by = S.Y(sp) - oy, bz = S.Z(sp) - oz;
  const det = ax * by - ay * bx;
  // each half of the blade folds along the midrib; a face turned from the sun still glows a little (translucency)
  const flip = dot(N, VIEW) < 0 ? -1 : 1, fold = l.fold ?? 0.35;
  const half = (sg: number) => { const d = dot(nrm(add(mul(N, flip), mul(side, sg * fold))), LIGHT); return tone(d > 0 ? d : -d * 0.3, sun, amb); };
  const tA = half(1), tB = half(-1), kind = l.kind ?? K.LEAF, a = l.alpha ?? 255, prof = PROF[l.shape];
  if (Math.abs(det) < 0.8) { // edge-on: a sliver along the axis
    const n = Math.max(1, Math.ceil(hyp(ax, ay)));
    for (let i = 0; i <= n; i++) { const t = i / n; S.put(Math.floor(ox + ax * t), Math.floor(oy + ay * t), oz + az * t, band(l.ramp, (tA + tB) * 0.5 - 0.06 + t * 0.08), kind, a); }
    return;
  }
  const bl = hyp(bx, by);
  // every leaf its own: halves of uneven width, sometimes a notch bitten out of one edge
  const hs = hashf(Math.floor(l.p[0] * 3.1), Math.floor(l.p[1] * 2.7 + l.p[2] * 1.3), 41);
  const asym = (hs - 0.5) * 0.45, notchU = l.len >= 5 && hs > 0.72 ? 0.35 + (hs - 0.72) * 1.4 : -1, notchS = hs > 0.86 ? 1 : -1;
  const x0 = Math.floor(Math.min(ox - Math.abs(bx), ox + ax - Math.abs(bx))) - 1, x1 = Math.ceil(Math.max(ox + Math.abs(bx), ox + ax + Math.abs(bx))) + 1;
  const y0 = Math.floor(Math.min(oy - Math.abs(by), oy + ay - Math.abs(by))) - 1, y1 = Math.ceil(Math.max(oy + Math.abs(by), oy + ay + Math.abs(by))) + 1;
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const ex = px + 0.5 - ox, ey = py + 0.5 - oy;
    const u = (ex * by - ey * bx) / det, v = (ax * ey - ay * ex) / det;
    if (u < 0 || u > 1) continue;
    const av = Math.abs(v), sg = v >= 0 ? 1 : -1;
    let w = prof(u) * (1 + asym * sg);
    if (sg === notchS && Math.abs(u - notchU) < 0.07) w *= 0.45;
    if (av > w) continue;
    let val = (v >= 0 ? tA : tB) + (u - 0.4) * 0.1;
    if (l.vein && l.len >= 5 && av * bl < 0.55 && u > 0.06 && u < 0.9) val += l.vein > 0 ? 0.1 : -0.12;
    else if (l.lat && ((u * 5.5 + av * 1.1) % 1) < 0.16 && av < w * 0.85) val -= 0.08;
    if (l.teeth && av > w - 1.1 / Math.max(1, bl) && Math.floor(u * l.len * 0.7) % 2 === 0) val -= 0.12;
    S.put(px, py, oz + az * u + bz * v + 0.01, band(l.ramp, val), kind, a);
  }
}

/** a berry, bead, fruit or pod: a faceted little polygon (no discs), a lit upper-left plane and a shaded lower-right
 *  plane, ribs as darker facet lines, one highlight pixel; glowing ones a step brighter at the heart */
function drawOrb(S: Scene, o: Orb, sun: number, amb: number) {
  const cx = S.X(o.c), cy = S.Y(o.c), cz = S.Z(o.c), r = Math.max(0.9, o.r), sq = o.sq ?? 1, n = o.ramp.length - 1;
  const rr = new Rand(o.seed), k = r < 1.6 ? 4 : r < 3 ? 6 : 7, a0 = rr.range(0, Math.PI / k), pts: KP2[] = [];
  for (let i = 0; i < k; i++) { const a = a0 + (i / k) * TAU + rr.range(-0.2, 0.2), s = rr.range(0.85, 1.08); pts.push([cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * sq * s]); }
  const lit = tone(0.85, sun, Math.max(amb, 0.25)), dim = tone(0.25, sun, Math.max(amb, 0.25));
  fillPoly(pts, (px, py) => {
    const dx = px + 0.5 - cx, dy = (py + 0.5 - cy) / sq;
    let v = dx + dy < r * 0.15 ? lit : dim;
    if (o.ribs && Math.abs(Math.sin(Math.atan2(dx, Math.max(0.3, r - Math.abs(dy))) * o.ribs)) < 0.25) v -= 0.16;
    let c = band(o.ramp, v);
    if (o.glow !== undefined && Math.abs(dx) + Math.abs(dy) < r * 0.6) c = step(c, 1);
    S.put(px, py, cz + r - (Math.abs(dx) + Math.abs(dy)) * 0.5, c, K.ACC, o.alpha ?? 255);
  });
  if (r >= 1.6) S.put(Math.floor(cx - r * 0.4), Math.floor(cy - r * 0.45 * sq), cz + r + 0.1, o.ramp[n], K.ACC, o.alpha ?? 255);
  if (o.spots) for (let q = 0; q < o.spots; q++) {
    const a = rr.range(0, TAU), d = rr.range(0.1, 0.55);
    S.put(Math.floor(cx + Math.cos(a) * d * r), Math.floor(cy + Math.sin(a) * d * r * sq), cz + r + 0.2, o.spotCol ?? o.ramp[1], K.ACC, o.alpha ?? 255);
  }
}

/** a mushroom cap seen a little from above: a faceted dome (a lit left plane, a top plane, a shaded right plane)
 *  over a band of gills; flecks as small clusters */
function drawCap(S: Scene, o: Cap, sun: number, amb: number) {
  const cx = S.X(o.c), cy = S.Y(o.c), cz = S.Z(o.c), r = o.r, hr = o.hr, rim = Math.max(1, Math.round(r * 0.14)), rr = new Rand(o.seed);
  // the dome as a polygon: rim corners, shoulders, a slightly off-centre crown
  const sh = rr.range(0.55, 0.7), cr = rr.range(-0.12, 0.12);
  const dome: KP2[] = [[cx - r, cy], [cx - r * 0.86, cy - hr * sh], [cx - r * 0.42 + cr * r, cy - hr], [cx + r * 0.38 + cr * r, cy - hr * 0.97], [cx + r * 0.84, cy - hr * (sh - 0.05)], [cx + r, cy]];
  const vL = tone(0.75, sun, Math.max(amb, 0.3)), vT = tone(0.95, sun, Math.max(amb, 0.3)), vR = tone(0.3, sun, Math.max(amb, 0.3));
  fillPoly(dome, (px, py) => {
    const dx = (px + 0.5 - cx) / r, top = py + 0.5 < cy - hr * (sh + 0.18);
    const v = top && dx < 0.25 ? vT : dx < -0.12 ? vL : dx < 0.3 ? (vL + vR) / 2 : vR;
    S.put(px, py, cz + r * (1 - Math.abs(dx) * 0.5), band(o.ramp, v), K.ACC, o.alpha ?? 255);
  });
  // gills: alternating light and dark lamellae under the rim
  for (let py = Math.floor(cy); py < cy + rim + 1; py++) for (let px = Math.floor(cx - r * 0.92); px <= Math.ceil(cx + r * 0.92); px++) {
    const g = Math.floor((px - cx) / 1.5 + 100);
    S.put(px, py, cz - 0.5, g % 2 ? o.gill[2] : o.gill[py > cy + rim * 0.5 ? 1 : 2 - 1], K.ACC, o.alpha ?? 255);
  }
  for (let k = 0; k < o.spots; k++) {
    const x = Math.floor(cx + rr.range(-0.7, 0.7) * r), y = Math.floor(cy - rr.range(0.25, 0.8) * hr);
    S.put(x, y, cz + r + 0.3, o.spotCol, K.ACC, o.alpha ?? 255);
    if (r > 4) S.put(x + 1, y, cz + r + 0.3, o.spotCol, K.ACC, o.alpha ?? 255);
    if (r > 6) S.put(x, y + 1, cz + r + 0.3, o.spotCol, K.ACC, o.alpha ?? 255);
  }
}

/** a grown plant: limbs, leaves and accents in plant space (px, y up, z toward the viewer, base at the origin) */
export class Plant {
  limbs: Limb[] = []; leaves: Leaf[] = []; orbs: Orb[] = []; caps: Cap[] = [];
  /** 3D-only: blades and fronds as ribbons, eyes as discs */
  ribbons: Ribbon[] = []; eyes: Eye[] = [];
  /** 2D overlays at a projected anchor, drawn after the 3D pass (the eye of an eye-flower) */
  post: { p: V3; f: (S: Scene, x: number, y: number, z: number, k: number) => void }[] = [];
  /** flatten depth (fan-shaped growths) */
  zs = 1;
  /** target height (px), outline colour and rim strength set by the grower; scale applied by normalize */
  H = 32; deep = 0; rim = 0.2; f = 1;
  private chainN = 0; private normalized = false;
  constructor(readonly r: Rand) {}
  limb(a: V3, b: V3, ra: number, rb: number, ramp: number[], o: Partial<Limb> = {}) { this.limbs.push({ a, b, ra, rb, ramp, seed: this.r.int(0, 1e6), ...o }); }
  leaf(l: Leaf) { this.leaves.push(l); }
  orb(c: V3, r: number, ramp: number[], o: Partial<Orb> = {}) { this.orbs.push({ c, r, ramp, seed: this.r.int(0, 1e6), ...o }); }
  chain() { return ++this.chainN; }
  done(H: number, deep: number, rim = 0.2) { this.H = H; this.deep = deep; this.rim = rim; return this; }

  /** flatten and fit to the target height (limb and orb radii scale with the square root, leaves keep their size) */
  normalize() {
    if (this.normalized) return this;
    this.normalized = true;
    const su = (p: V3) => p[1] * CT - p[2] * ST;
    const zf = (p: V3): V3 => [p[0], p[1], p[2] * this.zs];
    for (const l of this.limbs) { l.a = zf(l.a); l.b = zf(l.b); }
    for (const l of this.leaves) { l.p = zf(l.p); l.d = nrm(zf(l.d)); }
    for (const o of this.orbs) o.c = zf(o.c);
    for (const o of this.caps) o.c = zf(o.c);
    for (const rb of this.ribbons) rb.pts = rb.pts.map(zf);
    for (const e of this.eyes) e.p = zf(e.p);
    for (const q of this.post) q.p = zf(q.p);
    let top = 1;
    for (const l of this.limbs) top = Math.max(top, su(l.a) + l.ra, su(l.b) + l.rb);
    for (const l of this.leaves) top = Math.max(top, su(add(l.p, mul(l.d, l.len))));
    for (const o of this.orbs) top = Math.max(top, su(o.c) + o.r);
    for (const o of this.caps) top = Math.max(top, su(o.c) + o.hr);
    const f = (this.f = Math.max(0.55, Math.min(1.6, this.H / top)));
    const sc = (p: V3): V3 => [p[0] * f, p[1] * f, p[2] * f];
    const rf = Math.sqrt(f);
    for (const l of this.limbs) { l.a = sc(l.a); l.b = sc(l.b); l.ra *= rf; l.rb *= rf; }
    for (const l of this.leaves) l.p = sc(l.p);
    for (const o of this.orbs) { o.c = sc(o.c); o.r *= rf; }
    for (const o of this.caps) { o.c = sc(o.c); o.r *= f; o.hr *= f; }
    for (const rb of this.ribbons) { rb.pts = rb.pts.map(sc); if (rb.kind === 'blade') rb.w = rb.w.map((w) => w * rf); }
    for (const e of this.eyes) { e.p = sc(e.p); e.r *= Math.sqrt(f); }
    for (const q of this.post) q.p = sc(q.p);
    return this;
  }

  /** rasterise the sprite: z-buffered limbs, leaves and accents, rim, contact shadows and outline */
  raster(): PixelCanvas {
    this.normalize();
    const su = (p: V3) => p[1] * CT - p[2] * ST, f = this.f;
    let mx = 3, mt = 3;
    const ext = (p: V3, e: number) => { mx = Math.max(mx, Math.abs(p[0]) + e); mt = Math.max(mt, su(p) + e); };
    for (const l of this.limbs) { ext(l.a, l.ra); ext(l.b, l.rb); }
    for (const l of this.leaves) { ext(l.p, l.wid); ext(add(l.p, mul(l.d, l.len)), l.wid); }
    for (const o of this.orbs) ext(o.c, o.r);
    for (const o of this.caps) { ext(o.c, o.r); mt = Math.max(mt, su(o.c) + o.hr); }
    const pc = new PixelCanvas(Math.max(8, 2 * Math.ceil(mx) + 6), Math.max(8, Math.ceil(mt) + 5));
    pc.wrap = false; pc.clear();
    const S = new Scene(pc);
    // occluders: leaf area (blades count as leaves), a little for limbs
    const sh = this.shade();
    for (const l of this.limbs) { const [s, a] = sh.light(mul(add(l.a, l.b), 0.5)); l.amb = a; drawLimb(S, l, s, a); }
    for (const l of this.leaves) { const [s, a] = sh.light(add(l.p, mul(l.d, l.len * 0.5))); l.amb = a; drawLeaf(S, l, s, a); }
    for (const o of this.orbs) { const [s, a] = sh.light(o.c); o.amb = a; drawOrb(S, o, s, a); }
    for (const o of this.caps) { const [s, a] = sh.light(add(o.c, [0, o.hr, 0])); o.amb = a; drawCap(S, o, s, a); }
    for (const q of this.post) { const z = q.p, p: V3 = [z[0], z[1], z[2]]; q.f(S, S.X(p), S.Y(p), S.Z(p), f); }
    finish(S, this.rim);
    outline(pc, this.deep);
    return pc;
  }

  /** light-space leaf density of the grown plant (self-shadowing for the sprite, sky occlusion for the mesh) */
  shade() {
    const occ: [V3, number][] = [];
    for (const l of this.leaves) occ.push([add(l.p, mul(l.d, l.len * 0.5)), l.len * l.wid * 1.3]);
    for (const l of this.limbs) occ.push([mul(add(l.a, l.b), 0.5), len3(sub(l.b, l.a)) * (l.ra + l.rb) * (l.kind === K.LEAF ? 1 : 0.3)]);
    return new Shade(occ);
  }
}

/** contact shadows under nearer edges (light from above-left) and a warm rim where foliage meets open sky */
function finish(S: Scene, rim: number) {
  const { W, H, zb, kind, pc } = S;
  const z0 = zb.slice(), k0 = kind.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!k0[i]) continue;
    const up = y > 0 ? i - W : -1, lf = x > 0 ? i - 1 : -1;
    const openU = up < 0 || !k0[up], openL = lf < 0 || !k0[lf];
    // contact shadow: one ramp step down; the lit rim: one ramp step up (no tinting)
    if ((up >= 0 && k0[up] && z0[up] - z0[i] > 2.5) || (lf >= 0 && k0[lf] && z0[lf] - z0[i] > 3.5)) pc.set(x, y, step(pc.get(x, y), -1), pc.alpha(x, y));
    else if (rim > 0 && (openU || openL) && k0[i] !== K.BARK) pc.set(x, y, step(pc.get(x, y), 1), pc.alpha(x, y));
  }
}

// ------------------------------------------------------------------------------------------------ growth
interface LeafStyle { len: [number, number]; wr: number; shapes: Shape[]; ramps: [number[], number][]; ang: [number, number]; droop: number; roll: number; fold?: number; vein?: number; lat?: boolean; stalk?: number; teeth?: boolean }
function pickRamp(r: Rand, list: [number[], number][]) { return r.weighted(list); }
/** a species' leaf ramps: mostly the planet's foliage, with older warmer leaves, shaded bluer ones and a few fresh ones */
function leafRamps(c: number, _spread = 0.62): [number[], number][] {
  const k = kinRamps(c, 7);
  return [[k[0], 0.6], [k[1], 0.16], [k[2], 0.14], [k[3], 0.1]];
}
/** one leaf off a twig: angled out from it, drooping, its blade turned toward the sky and rolled a little */
function twigLeaf(P: Plant, r: Rand, p: V3, d: V3, ls: LeafStyle) {
  const out = deviate(d, r.range(ls.ang[0], ls.ang[1]), r.range(0, TAU));
  const dir = nrm(add(out, [0, -ls.droop * r.range(0.4, 1.6), 0]));
  const n = nrm(rot(faceUp(dir), dir, r.range(-ls.roll, ls.roll)));
  const len = r.range(ls.len[0], ls.len[1]);
  P.leaf({ p: add(p, mul(dir, ls.stalk ?? 0.8)), d: dir, n, len, wid: Math.max(0.6, len * ls.wr * r.range(0.85, 1.15)), shape: r.pick(ls.shapes), ramp: pickRamp(r, ls.ramps), fold: ls.fold, vein: len >= 6 ? ls.vein : 0, lat: !!ls.lat && len >= 8, teeth: ls.teeth });
}

interface GrowOpt {
  gens: number; kids: [number, number]; spread: [number, number]; decay: [number, number]; taper: number;
  /** + bends toward the light, - sags under weight (per step) */
  trop: number; wob: number; seg: number; apical?: number;
  /** length of the limbs leaving the trunk (the trunk's own length says nothing about the crown) */
  len1?: number;
  /** pull limbs from this generation on toward the horizontal (plate and umbrella crowns) */
  flat?: [number, number];
  /** crown envelope: a limb that leaves it stops and leafs out */
  inside?: (p: V3) => boolean;
  leafGen: number; onTwig: (p: V3, d: V3, gen: number, st: number) => void; onTip: (p: V3, d: V3, gen: number) => void;
  ramp: number[]; ridge: number;
}
function grow(P: Plant, r: Rand, o: GrowOpt, p: V3, d: V3, len: number, rad: number, gen: number) {
  const steps = Math.max(1, Math.round(len / o.seg)), st = len / steps, rEnd = Math.max(0.5, rad * o.taper), chain = P.chain();
  let q = p, dir = d;
  for (let i = 0; i < steps; i++) {
    dir = deviate(dir, r.range(0, o.wob), r.range(0, TAU));
    dir = nrm(add(dir, [0, o.trop, 0]));
    if (o.flat && gen >= o.flat[0]) dir = nrm(add(dir, [0, -dir[1] * o.flat[1], 0]));
    const nq = add(q, mul(dir, st));
    P.limb(q, nq, rad + (rEnd - rad) * (i / steps), rad + (rEnd - rad) * ((i + 1) / steps), o.ramp, { ridge: rad > 1.3 ? o.ridge : 0, chain });
    q = nq;
    if (gen >= o.leafGen) o.onTwig(q, dir, gen, st);
    if (o.inside && gen > 0 && !o.inside(q)) { o.onTip(q, dir, gen); return; }
  }
  if (gen >= o.gens || len < o.seg * 1.5) { o.onTip(q, dir, gen); return; }
  const k = r.int(o.kids[0], o.kids[1]), az0 = r.range(0, TAU);
  for (let c = 0; c < k; c++) {
    const lead = c === 0 && r.chance(o.apical ?? 0);
    const cd = deviate(dir, lead ? r.range(0.05, 0.25) : r.range(o.spread[0], o.spread[1]), az0 + (c * TAU) / k + r.range(-0.4, 0.4));
    const cr = Math.max(0.5, rEnd * (lead ? 0.85 : Math.sqrt(1 / k) * r.range(0.9, 1.1)));
    grow(P, r, o, q, cd, (gen === 0 && o.len1 ? o.len1 : len) * r.range(o.decay[0], o.decay[1]) * (lead ? 1.05 : 1), cr, gen + 1);
  }
}
/** buttress roots flaring from the foot of a trunk */
function roots(P: Plant, r: Rand, rad: number, T: number[]) {
  const n = r.int(3, 5), a0 = r.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i * TAU) / n + r.range(-0.3, 0.3), l = rad * r.range(1.8, 2.8);
    P.limb([0, rad * 1.6, 0], [Math.cos(a) * l, -0.5, Math.sin(a) * l], rad * 0.75, 0.6, T, { ridge: 2 });
  }
}
/** a ribbon of grass or a strap leaf: a tapered chain that arches under its own weight (stem: a round stalk) */
function blade(P: Plant, r: Rand, base: V3, dir: V3, len: number, w0: number, sag: number, ramp: number[], dry?: number[], dryFrom = 0.7, stem = false) {
  const steps = Math.max(3, Math.round(len / 2.5)), st = len / steps, chain = P.chain(), l0 = P.limbs.length;
  let q = base, d = dir;
  const pts: V3[] = [base], w: number[] = [w0];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    d = nrm(add(d, [r.range(-0.04, 0.04), -sag * (0.5 + t), r.range(-0.04, 0.04)]));
    const nq = add(q, mul(d, st));
    P.limb(q, nq, Math.max(0.5, w0 * (1 - t * 0.85)), Math.max(0.5, w0 * (1 - (t + 1 / steps) * 0.85)), dry && t >= dryFrom ? dry : ramp, { kind: K.LEAF, chain, skip3d: !stem });
    q = nq; pts.push(nq); w.push(w0 * (1 - (t + 1 / steps) * 0.85));
  }
  if (!stem) P.ribbons.push({ kind: 'blade', pts, w, ramp, dry, dryFrom, limbs: P.limbs.slice(l0) });
  return q;
}
/** a frond: a rachis that sags toward its tip, carrying individual leaflets (pinnae) on both sides */
function frond(P: Plant, r: Rand, base: V3, dir: V3, len: number, o: { rach: number; ramp: number[]; ramps: [number[], number][]; sag: number; start: number; lmax: number; wr: number; fwd: number; droop: number; shape: Shape; gap?: number; lobes?: boolean }) {
  const steps = Math.max(4, Math.round(len / (o.gap ?? 2))), st = len / steps, l0 = P.limbs.length;
  let q = base, d = dir;
  const pts: V3[] = [base], w: number[] = [0];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    d = nrm(add(d, [0, -o.sag * (0.3 + t), 0]));
    const nq = add(q, mul(d, st));
    P.limb(q, nq, Math.max(0.5, o.rach * (1 - t)), Math.max(0.5, o.rach * (1 - t - 1 / steps)), o.ramp, { kind: K.LEAF, skip3d: true });
    let ll = 0;
    if (t > o.start) {
      const side = len3(cross(d, UP)) < 0.2 ? perp(d) : nrm(cross(d, UP));
      const k = (t - o.start) / (1 - o.start);
      ll = o.lmax * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + k * 0.92)), 0.7);
      if (ll >= 1) for (const sg of [-1, 1]) {
        const ld = deviate(nrm(add(add(mul(side, sg), mul(d, o.fwd)), [0, -o.droop, 0])), r.range(0, 0.12), r.range(0, TAU));
        P.leaf({ p: nq, d: ld, n: faceUp(ld), len: ll * r.range(0.85, 1.1), wid: Math.max(0.6, ll * o.wr), shape: o.shape, ramp: pickRamp(r, o.ramps), fold: 0.5, vein: ll >= 6 ? -1 : 0, lat: o.lobes && ll >= 6, skip3d: true });
      }
    }
    q = nq; pts.push(nq); w.push(ll);
  }
  // in 3D the frond is one painted ribbon: the leaflets hang off the rachis at the droop angle
  P.ribbons.push({ kind: 'frond', pts, w, ramp: o.ramp, fold: Math.atan2(o.droop, 1), shape: o.shape, lobes: o.lobes, start: o.start, fwd: o.fwd, wr: o.wr, lmax: o.lmax, ramps: o.ramps.map((x) => x[0]), dead: o.ramps.length === 1 && o.ramps[0][0] === o.ramp, limbs: P.limbs.slice(l0) });
  return q;
}
/** a fiddlehead: the young frond still rolled into a crozier */
function crozier(P: Plant, base: V3, h: number, rad: number, az: number, ramp: number[]) {
  const side: V3 = [Math.cos(az), 0, Math.sin(az)];
  let q = base;
  const c = add(base, [0, h, 0]);
  const pts: V3[] = [];
  for (let i = 0; i <= 6; i++) pts.push(add(base, add(mul(side, Math.sin((i / 6) * 0.6) * rad), [0, (h - rad) * (i / 6), 0])));
  for (let a = 0; a < Math.PI * 3.2; a += 0.35) { const rr = rad * (1 - a / (Math.PI * 3.6)); pts.push(add(c, add(mul(side, Math.cos(a) * rr), [0, Math.sin(a) * rr, 0]))); }
  const chain = P.chain();
  for (let i = 1; i < pts.length; i++) { const t = i / pts.length; P.limb(q, pts[i], Math.max(0.6, 1.1 * (1 - t * 0.6)), Math.max(0.55, 1.1 * (1 - (t + 0.03) * 0.6)), ramp, { kind: K.LEAF, ridge: 2, chain }); q = pts[i]; }
  return c;
}

/** species-level traits shared by all of a species' variants */
const traits = (sp: PlantSpecies) => new Rand(sp.id * 7919 + (sp.leaf & 0xffff) * 31 + 17);
const deepOf = (ramp: number[]) => ramp[0];

// ------------------------------------------------------------------------------------------------ painters
const broadleaf: Grower = (sp, h, r) => {
  // a spreading broadleaf: buttressed trunk, scaffold limbs, twigs ending in leaf clusters, fruit hanging below
  const P = new Plant(r), tr = traits(sp), H = h * PX, T = RAMP(sp.trunk, 6, 0.5, 0.04), A = RAMP(sp.accent, 6, 0.55), G = leafRamps(sp.leaf);
  const shapes = tr.pick<Shape[]>([['ovate'], ['heart', 'ovate'], ['lobed'], ['round', 'ovate'], ['lance', 'ovate']]);
  const big = tr.next(), fruit = tr.chance(0.55);
  const ls: LeafStyle = { len: [3.5 + big * 2, 5.5 + big * 3], wr: shapes.includes('lance') ? 0.3 : 0.45, shapes, ramps: G, ang: [0.5, 1.2], droop: 0.35, roll: 0.8, fold: 0.4, vein: -1, lat: true };
  const cy = H * r.range(0.6, 0.68), crx = H * r.range(0.36, 0.44), cry = H * r.range(0.3, 0.36);
  const rad = Math.max(2.2, h * 1.5);
  roots(P, r, rad, T);
  grow(P, r, {
    gens: 6, kids: [2, 3], spread: [0.45, 0.85], decay: [0.74, 0.86], taper: 0.66, trop: 0.04, wob: 0.14, seg: 4, apical: 0.3, len1: H * r.range(0.19, 0.24),
    inside: (p) => p[1] < cy - cry * 0.6 || (p[0] / crx) ** 2 + ((p[1] - cy) / cry) ** 2 + (p[2] / crx) ** 2 < 1,
    leafGen: 3, ramp: T, ridge: 4,
    onTwig: (p, d, gen, st) => { for (let k = st / (gen >= 5 ? 2.2 : 3.2); k > 0; k--) if (k >= 1 || r.chance(k)) twigLeaf(P, r, p, d, ls); },
    onTip: (p, d) => {
      for (let k = r.int(4, 7); k > 0; k--) twigLeaf(P, r, p, d, ls);
      if (fruit && r.chance(0.12)) { const f = add(p, [r.range(-1, 1), -r.range(2, 4), r.range(0, 2)]); P.limb(p, f, 0.5, 0.5, T, { kind: K.ACC, chain: P.chain() }); P.orb(f, Math.max(1.2, h * 0.45), A, { glow: sp.glow ? 0xfff0c0 : undefined, alpha: sp.glow ? 200 : 255 }); }
    },
  }, [0, 0, 0], deviate(UP, r.range(0, 0.12), r.range(0, TAU)), H * r.range(0.36, 0.44), rad, 0);
  return P.done(H, deepOf(G[0][0]));
};

const umbrella: Grower = (sp, h, r) => {
  // the plate tree: a short trunk splitting into long rising limbs that level out under flat pads of fine leaves,
  // with glowing beads hanging on threads beneath the pads
  const P = new Plant(r), tr = traits(sp), H = h * PX, T = RAMP(sp.trunk, 6, 0.5, 0.04), A = RAMP(sp.accent, 6, 0.55), G = leafRamps(sp.leaf);
  const beads = sp.glow || tr.chance(0.5), shapes = tr.pick<Shape[]>([['ovate'], ['lance'], ['needle', 'lance']]);
  const ls: LeafStyle = { len: [3, 4.5], wr: 0.4, shapes, ramps: G, ang: [1.1, 1.5], droop: 0.1, roll: 0.3, fold: 0.2 };
  const top = H * r.range(0.86, 0.94), rx = H * r.range(0.4, 0.5), rad = Math.max(2, h * 1.3);
  roots(P, r, rad, T);
  const pad = (p: V3) => {
    // a pad: a domed, flattened cloud of fine leaves, thickest in the middle
    const pr = r.range(9, 14), n = Math.round(pr * pr * 0.75);
    for (let k = 0; k < n; k++) {
      const a = r.range(0, TAU), d = Math.sqrt(r.next()) * pr, c = add(p, [Math.cos(a) * d, 1 + (1 - (d / pr) ** 2) * 4 + r.range(-1.5, 1.5), Math.sin(a) * d * 0.8]);
      const dir = polar(r.range(-0.3, 0.25), r.range(0, TAU));
      P.leaf({ p: c, d: dir, n: nrm(rot(faceUp(dir), dir, r.range(-0.4, 0.4))), len: r.range(ls.len[0], ls.len[1]), wid: 1.4, shape: r.pick(shapes), ramp: pickRamp(r, G), fold: 0.2 });
    }
    if (beads && r.chance(0.45)) for (let k = r.int(1, 3); k > 0; k--) {
      const s = add(p, [r.range(-pr * 0.7, pr * 0.7), 0, r.range(-pr * 0.5, pr * 0.5)]), e = add(s, [0, -r.range(3, 9), 0]);
      P.limb(s, e, 0.5, 0.5, T, { kind: K.ACC, chain: P.chain() }); P.orb(e, r.range(1, 1.5), A, { glow: sp.glow ? 0xfff0c8 : undefined, alpha: sp.glow ? 200 : 255 });
    }
  };
  grow(P, r, {
    gens: 4, kids: [2, 3], spread: [0.4, 0.75], decay: [0.72, 0.88], taper: 0.66, trop: 0.02, wob: 0.1, seg: 4, flat: [2, 0.22], len1: H * r.range(0.26, 0.32),
    inside: (p) => p[1] < top && hyp(p[0], p[2]) < rx,
    leafGen: 3, ramp: T, ridge: 4,
    onTwig: (p, d, gen) => { if (gen >= 3 && r.chance(0.6)) twigLeaf(P, r, p, d, ls); },
    onTip: (p) => pad(p),
  }, [0, 0, 0], deviate(UP, r.range(0, 0.1), r.range(0, TAU)), H * r.range(0.28, 0.36), rad, 0);
  return P.done(H, deepOf(G[0][0]));
};

const weeper: Grower = (sp, h, r) => {
  // a weeping tree: arching limbs shedding curtains of pendulous strands, each strand beaded with narrow leaves
  // that pale toward the tips
  const P = new Plant(r), H = h * PX, T = RAMP(sp.trunk, 6, 0.5, 0.04), G = leafRamps(sp.leaf, 0.58), young = RAMP(mixHex(sp.leaf, 0xd8dca0, 0.22), 7, 0.58);
  const rad = Math.max(2.2, h * 1.45), ls: LeafStyle = { len: [3, 5], wr: 0.3, shapes: ['lance'], ramps: G, ang: [0.6, 1.0], droop: 0.6, roll: 0.6 };
  roots(P, r, rad, T);
  const strand = (p: V3, d: V3) => {
    const len = Math.min(p[1] - H * 0.06, H * r.range(0.22, 0.52));
    if (len < 6) return;
    let q = p, dir = nrm([d[0] * 0.5, -0.4, d[2] * 0.5]);
    const steps = Math.round(len / 2), chain = P.chain(), l0 = P.limbs.length, pts: V3[] = [p];
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      dir = nrm(add(dir, [r.range(-0.05, 0.05), -0.35, r.range(-0.05, 0.05)]));
      const nq = add(q, mul(dir, 2));
      P.limb(q, nq, 0.5, 0.5, G[0][0], { kind: K.LEAF, chain, skip3d: true });
      const ld = deviate(nrm(add(dir, mul([d[0], 0, d[2]], 0.6))), r.range(0.4, 0.9), r.range(0, TAU));
      P.leaf({ p: nq, d: ld, n: faceUp(ld), len: r.range(2.5, 4.5) * (1 - t * 0.3), wid: 0.9, shape: 'lance', ramp: t > 0.7 && r.chance(0.6) ? young : pickRamp(r, G), fold: 0.4, skip3d: true });
      q = nq; pts.push(nq);
    }
    // in 3D a strand is one hanging ribbon painted with its leaves, its face turned out of the crown
    P.ribbons.push({ kind: 'strand', pts, w: pts.map(() => 4.2), ramp: G[0][0], ramps: [G[0][0], G[1][0], G[2][0], young], shape: 'lance', lmax: 4, fwd: 1.1, wr: 0.28, start: 0.02, out: [d[0], 0, d[2]], limbs: P.limbs.slice(l0) });
  };
  grow(P, r, {
    gens: 4, kids: [2, 3], spread: [0.55, 0.9], decay: [0.7, 0.84], taper: 0.64, trop: 0.07, wob: 0.12, seg: 4, apical: 0.3, len1: H * r.range(0.2, 0.26),
    inside: (p) => p[1] < H * 0.98 && hyp(p[0], p[2]) < H * 0.45,
    leafGen: 2, ramp: T, ridge: 4,
    onTwig: (p, d, gen) => { if (r.chance(gen >= 3 ? 0.55 : 0.3)) strand(p, d); if (r.chance(0.5)) twigLeaf(P, r, p, d, ls); },
    onTip: (p, d) => { strand(p, d); for (let k = r.int(2, 4); k > 0; k--) twigLeaf(P, r, p, d, ls); },
  }, [0, 0, 0], deviate(UP, r.range(0, 0.12), r.range(0, TAU)), H * r.range(0.42, 0.5), rad, 0);
  return P.done(H, deepOf(G[0][0]));
};

const palm: Grower = (sp, h, r) => {
  // a leaning ringed trunk swelling at the foot; a crown of pinnate fronds, young ones upright, old ones drooping,
  // the oldest dead and hanging; a cluster of fruit under the crown
  const P = new Plant(r), H = h * PX, T = RAMP(sp.trunk, 6, 0.5, 0.04), A = RAMP(sp.accent, 6, 0.55), G = leafRamps(sp.leaf, 0.6);
  const DRY = RAMP(mixHex(sp.leaf, 0x8a6a3e, 0.7), 7, 0.5), Gd: [number[], number][] = [[DRY, 1]];
  const th = H * r.range(0.66, 0.74), lean = r.range(-0.3, 0.3), lz = r.range(-0.15, 0.15), steps = 16;
  let q: V3 = [0, 0, 0];
  const rad = Math.max(1.6, h * 1.2), tch = P.chain();
  for (let i = 0; i < steps; i++) {
    const t = i / steps, t1 = (i + 1) / steps;
    const nq: V3 = [lean * th * t1 * t1, th * t1, lz * th * t1 * t1];
    const rr = (tt: number) => rad * (1 - tt * 0.3) + (tt < 0.1 ? (0.1 - tt) * 16 : 0);
    P.limb(q, nq, rr(t), rr(t1), T, { ring: 3, ridge: 2, chain: tch });
    q = nq;
  }
  const crown = q, n = r.int(11, 15);
  for (let i = 0; i < n; i++) {
    const age = i / (n - 1), dead = age > 0.9 && r.chance(0.6);
    const el = dead ? -1.2 : 1.2 - age * 1.45 + r.range(-0.12, 0.12);
    const flen = H * r.range(0.3, 0.42) * (dead ? 0.6 : 0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, age * 1.3)));
    frond(P, r, crown, polar(el, i * GOLD + r.range(-0.2, 0.2)), flen, { rach: 1.1, ramp: dead ? DRY : G[0][0], ramps: dead ? Gd : G, sag: dead ? 0.02 : 0.03 + age * 0.05, start: 0.1, lmax: Math.min(14, H * 0.09), wr: 0.16, fwd: 0.5, droop: dead ? 0.1 : 0.5 + age * 0.4, shape: 'lance', gap: 1.8 });
  }
  for (let k = r.int(5, 9); k > 0; k--) P.orb(add(crown, [r.range(-3, 3), -r.range(1, 5), r.range(-1, 3)]), Math.max(1.2, h * 0.5), A, {});
  return P.done(H, deepOf(G[0][0]));
};

const shrub: Grower = (sp, h, r) => {
  // a multi-stemmed bush: dense leaf clusters on fine twigs, gaps showing the stems inside, berries on some
  const P = new Plant(r), tr = traits(sp), H = h * PX, T = RAMP(mixHex(sp.trunk, sp.leaf, 0.2), 6, 0.5), A = RAMP(sp.accent, 6, 0.55), G = leafRamps(sp.leaf);
  const shapes = tr.pick<Shape[]>([['round', 'ovate'], ['ovate'], ['lance'], ['lobed', 'ovate'], ['needle']]), berries = tr.chance(0.55);
  const ls: LeafStyle = { len: shapes[0] === 'needle' ? [3, 4] : [2.5, 4.5], wr: shapes[0] === 'needle' ? 0.2 : 0.5, shapes, ramps: G, ang: [0.5, 1.3], droop: 0.25, roll: 0.9, fold: 0.35 };
  const cy = H * 0.5, crx = H * r.range(0.6, 0.75), cry = H * 0.5;
  const opt: GrowOpt = {
    gens: 4, kids: [2, 3], spread: [0.4, 0.8], decay: [0.62, 0.8], taper: 0.7, trop: 0.04, wob: 0.22, seg: 3, apical: 0.2,
    inside: (p) => (p[0] / crx) ** 2 + ((p[1] - cy) / cry) ** 2 + (p[2] / crx) ** 2 < 1,
    leafGen: 2, ramp: T, ridge: 0,
    onTwig: (p, d, gen, st) => { for (let k = st / 1.9; k > 0; k--) if (k >= 1 || r.chance(k)) twigLeaf(P, r, p, d, ls); },
    onTip: (p, d) => {
      for (let k = r.int(3, 5); k > 0; k--) twigLeaf(P, r, p, d, ls);
      if (berries && r.chance(0.3)) P.orb(add(p, [r.range(-1, 1), r.range(-1, 1), 1]), r.range(0.8, 1.2), A, { glow: sp.glow ? 0xfff0c0 : undefined, alpha: sp.glow ? 200 : 255 });
    },
  };
  for (let s = r.int(4, 7), i = 0; i < s; i++) grow(P, r, opt, [r.range(-2.5, 2.5), 0, r.range(-2.5, 2.5)], deviate(UP, r.range(0.2, 0.75), (i * TAU) / s + r.range(-0.4, 0.4)), H * r.range(0.32, 0.46), Math.max(0.8, h * 0.9), 1);
  for (let i = 0; i < 6; i++) blade(P, r, [r.range(-4, 4), 0, r.range(0, 4)], polar(r.range(0.9, 1.4), r.range(0, TAU)), H * r.range(0.12, 0.22), 0.8, 0.12, RAMP(mixHex(sp.leaf, 0x4a5a3a, 0.5)));
  return P.done(H, deepOf(G[0][0]));
};

const tuft: Grower = (sp, h, r) => {
  // a clump of individual arching blades, some with sun-cured tips; reeds carry cattails, grasses seed panicles
  const P = new Plant(r), H = h * PX, reed = sp.arch === 'reed', G = leafRamps(sp.leaf, 0.55), D = RAMP(mixHex(sp.leaf, 0xa89464, 0.55), 7, 0.5);
  const n = reed ? r.int(14, 20) : r.int(18, 28);
  for (let i = 0; i < n; i++) {
    const el = reed ? r.range(1.2, 1.5) : r.range(0.8, 1.45), az = r.range(0, TAU);
    blade(P, r, [r.range(-2.5, 2.5), 0, r.range(-2.5, 2.5)], polar(el, az), H * r.range(0.5, 0.95) / Math.max(0.6, Math.sin(el)), reed ? 1.3 : 0.9, reed ? 0.025 : 0.1, pickRamp(r, G), r.chance(0.35) ? D : undefined, r.range(0.55, 0.8));
  }
  const heads = reed ? r.int(2, 4) : r.chance(0.65) ? r.int(2, 4) : 0;
  const A = RAMP(reed ? mixHex(sp.accent, 0x5a3a22, 0.65) : mixHex(sp.accent, 0xc8b88a, 0.55), 6, 0.5);
  for (let i = 0; i < heads; i++) {
    const tip = blade(P, r, [r.range(-1.5, 1.5), 0, r.range(-1.5, 1.5)], polar(r.range(1.35, 1.55), r.range(0, TAU)), H * r.range(0.85, 1.05), 0.6, 0.01, G[0][0], undefined, 0.7, true);
    if (reed) { const e = add(tip, [0, r.range(5, 8), 0]); P.limb(tip, e, 1.6, 1.4, A, { kind: K.ACC }); P.limb(e, add(e, [0, 3, 0]), 0.5, 0.5, G[0][0]); }
    else for (let k = 0; k < 9; k++) { const d = polar(r.range(0.3, 1.2), r.range(0, TAU)); P.leaf({ p: add(tip, [0, -k * 0.9, 0]), d, n: faceUp(d), len: r.range(1.5, 3), wid: 0.7, shape: 'petal', ramp: A, kind: K.ACC, fold: 0.3 }); }
  }
  return P.done(H, deepOf(G[0][0]), 0.15);
};

const fern: Grower = (sp, h, r) => {
  // a shuttlecock of arching fronds, each a ladder of individual pinnae; one or two fiddleheads uncurling inside
  const P = new Plant(r), tr = traits(sp), H = h * PX, G = leafRamps(sp.leaf, 0.6), lobes = tr.chance(0.6);
  const n = r.int(7, 11);
  for (let i = 0; i < n; i++) {
    const el = r.range(0.55, 1.25), az = i * GOLD + r.range(-0.2, 0.2);
    frond(P, r, [0, 0.5, 0], polar(el, az), H * r.range(0.85, 1.1), { rach: 0.8, ramp: G[0][0], ramps: G, sag: 0.05, start: 0.12, lmax: Math.max(4, Math.min(9, H * 0.16)), wr: lobes ? 0.36 : 0.28, fwd: 0.45, droop: 0.12, shape: lobes ? 'lobed' : 'lance', gap: 1.7, lobes });
  }
  for (let k = r.int(0, 2); k > 0; k--) crozier(P, [r.range(-2, 2), 0, r.range(-1, 2)], H * r.range(0.35, 0.55), r.range(2.2, 3.2), r.pick([0, Math.PI]) + r.range(-0.5, 0.5), RAMP(mixHex(sp.leaf, 0xc8d090, 0.25)));
  return P.done(H, deepOf(G[0][0]), 0.15);
};

const spike: Grower = (sp, h, r) => {
  // torch lily: a fountain of strap leaves under spikes of tubular florets, buds hot at the top, open flowers
  // paling below, the oldest withering at the bottom
  const P = new Plant(r), H = h * PX, G = leafRamps(sp.leaf, 0.58);
  for (let i = r.int(8, 12); i > 0; i--) blade(P, r, [r.range(-2, 2), 0, r.range(-2, 2)], polar(r.range(0.7, 1.35), r.range(0, TAU)), H * r.range(0.32, 0.5), 1.7, 0.07, pickRamp(r, G));
  const hot = RAMP(mixHex(sp.accent, 0xc0583a, 0.15), 6, 0.55), pale = RAMP(mixHex(sp.accent, 0xe6d8a0, 0.55), 6, 0.5), old = RAMP(mixHex(sp.accent, 0x6a4a2a, 0.55), 6, 0.5);
  for (let s = r.int(2, 5), i = 0; i < s; i++) {
    const base: V3 = [r.range(-H * 0.12, H * 0.12), 0, r.range(-2, 2)];
    const top = blade(P, r, base, polar(r.range(1.35, 1.55), r.range(0, TAU)), H * r.range(0.62, 0.95), 0.8, 0.0, G[0][0], undefined, 0.7, true);
    const hh = Math.max(7, H * r.range(0.22, 0.3)), m = Math.round(hh / 0.65);
    for (let k = 0; k < m; k++) {
      const t = k / m, az = k * GOLD, c = add(top, [Math.cos(az) * 1.2, t * hh, Math.sin(az) * 1.2]);
      const d = polar(-1.1 + t * 2.1, az);
      P.leaf({ p: c, d, n: faceUp(d), len: 3 + (1 - t) * 1.2, wid: 0.9, shape: 'strap', ramp: t > 0.62 ? hot : t < 0.12 ? old : pale, kind: K.ACC, fold: 0.6 });
    }
  }
  return P.done(H, deepOf(G[0][0]), 0.15);
};

const rosette: Grower = (sp, h, r) => {
  // a succulent rosette: whorls of thick folded leaves with toothed margins and a pale midrib, a bud at the heart
  const P = new Plant(r), H = h * PX, G = leafRamps(mixHex(sp.leaf, 0x8aa0a0, 0.18), 0.6);
  const whorls = [[r.int(9, 12), 0.15, 0.45, 1], [r.int(7, 9), 0.55, 0.9, 0.8], [r.int(5, 7), 1.0, 1.3, 0.55]];
  let a0 = r.range(0, TAU);
  for (const [n, e0, e1, lk] of whorls) {
    for (let i = 0; i < n; i++) {
      const az = a0 + (i * TAU) / n + r.range(-0.15, 0.15), d = polar(r.range(e0, e1), az), len = H * 1.05 * lk * r.range(0.85, 1);
      P.leaf({ p: [0, 1, 0], d, n: faceUp(d), len, wid: len * 0.2, shape: 'lance', ramp: pickRamp(r, G), fold: 0.6, vein: -1, teeth: true });
    }
    a0 += Math.PI / n;
  }
  P.orb([0, H * 0.35, 1], Math.max(1.5, h * 2), RAMP(sp.accent, 6, 0.55), { glow: sp.glow ? 0xfff4d0 : undefined, alpha: sp.glow ? 200 : 255 });
  return P.done(H, deepOf(G[0][0]), 0.15);
};

const coral: Grower = (sp, h, r) => {
  // the coral bush: a fan of fleshy forking stems, polyps along them, a bulb on every tip (they glow on some worlds)
  const P = new Plant(r), H = h * PX, F = RAMP(mixHex(sp.leaf, sp.accent, 0.18), 6, 0.6), A = RAMP(sp.accent, 6, 0.6);
  const glow = sp.glow ? 0xfff6d8 : undefined, alpha = sp.glow ? 200 : 255;
  P.zs = 0.4;
  grow(P, r, {
    gens: 4, kids: [2, 3], spread: [0.35, 0.6], decay: [0.62, 0.8], taper: 0.72, trop: 0.06, wob: 0.08, seg: 3,
    leafGen: 1, ramp: F, ridge: 0,
    onTwig: (p) => { if (r.chance(0.08)) P.orb(add(p, [r.range(-1, 1), 0, 1]), 0.7, A, {}); },
    onTip: (p) => P.orb(p, r.range(1.3, 2.3), A, { glow, alpha, spots: 1, spotCol: A[1] }),
  }, [0, 0, 0], deviate(UP, r.range(0, 0.1), r.range(0, TAU)), H * 0.36, Math.max(1.5, h * 2.4), 0);
  return P.done(H, deepOf(F), 0.12);
};

const fungus: Grower = (sp, h, r) => {
  // a cluster of mushrooms: fibrous stems, domed caps with flecks, gill crescents under the rims, young buttons
  const P = new Plant(r), H = h * PX, C = RAMP(sp.accent, 7, 0.6), Gi = RAMP(mixHex(sp.accent, 0xd8ccb0, 0.6), 5, 0.45), S = RAMP(mixHex(sp.leaf, 0xe0d8c4, 0.68), 6, 0.45);
  const spot = sp.glow ? 0xf4f0c8 : mixHex(C[6], 0xf0ead8, 0.55);
  const n = r.int(1, 4), caps: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) caps.push([r.range(-H * 0.28, H * 0.28) * (i ? 1 : 0.3), r.range(-H * 0.15, H * 0.2), H * (i === 0 ? 1 : r.range(0.38, 0.78)), 0]);
  for (let i = r.int(0, 3); i > 0; i--) caps.push([r.range(-H * 0.4, H * 0.4), r.range(0, H * 0.3), H * r.range(0.12, 0.22), 1]);
  for (const [x, z, ch, button] of caps) {
    const cr = Math.max(2, ch * (button ? 0.6 : r.range(0.3, 0.46))), hr = cr * (button ? 0.8 : r.range(0.45, 0.65));
    const lean = r.range(-0.12, 0.12) * ch;
    const topP: V3 = [x + lean, ch - hr, z];
    let q: V3 = [x, 0, z];
    const chain = P.chain();
    for (let k = 1; k <= 4; k++) { const t = k / 4, nq: V3 = [x + lean * t * t, (ch - hr) * t, z]; P.limb(q, nq, Math.max(0.8, cr * 0.2) * (1.15 - t * 0.25), Math.max(0.8, cr * 0.2) * (1.15 - t * 0.3), S, { ridge: 3, chain }); q = nq; }
    P.caps.push({ c: topP, r: cr, hr, ramp: C, gill: Gi, seed: r.int(0, 1e6), spots: button ? 0 : Math.floor(cr / 2.5), spotCol: spot, alpha: sp.glow ? 200 : 255 });
  }
  return P.done(H, deepOf(C), 0.12);
};

const bulb: Grower = (sp, h, r) => {
  // lantern pods: ribbed translucent bladders full of light, swaying on leafy stems above a clump of blades
  const P = new Plant(r), H = h * PX, G = leafRamps(sp.leaf, 0.58), A = RAMP(sp.accent, 6, 0.55);
  const ls: LeafStyle = { len: [3, 5], wr: 0.4, shapes: ['lance', 'ovate'], ramps: G, ang: [0.7, 1.1], droop: 0.3, roll: 0.5 };
  for (let i = r.int(5, 8); i > 0; i--) blade(P, r, [r.range(-2, 2), 0, r.range(-2, 2)], polar(r.range(0.8, 1.35), r.range(0, TAU)), H * r.range(0.25, 0.4), 1.2, 0.08, pickRamp(r, G));
  for (let i = r.int(2, 4); i > 0; i--) {
    const top = blade(P, r, [r.range(-1.5, 1.5), 0, r.range(-1.5, 1.5)], polar(r.range(1.1, 1.45), r.range(0, TAU)), H * r.range(0.45, 0.8), 0.7, 0.015, G[0][0], undefined, 0.7, true);
    for (let k = 0; k < 3; k++) twigLeaf(P, r, mul(top, 0.35 + k * 0.18), UP, ls);
    const rad = r.range(2.4, 3.8) * Math.max(1, h);
    P.orb(add(top, [0, rad * 0.6, 0]), rad, A, { sq: 1.15, ribs: 4, glow: sp.glow ? 0xfff4d8 : undefined, alpha: sp.glow ? 200 : 255 });
  }
  return P.done(H, deepOf(G[0][0]), 0.15);
};

const eyeflower: Grower = (sp, h, r) => {
  // a stalked flower whose heart is an eye: iris, slit pupil, wet highlight. It watches what moves.
  const P = new Plant(r), H = h * PX, G = leafRamps(sp.leaf, 0.58), A = RAMP(sp.accent, 6, 0.6), A2 = RAMP(mixHex(sp.accent, 0xf0e6d0, 0.3), 6, 0.55);
  const ls: LeafStyle = { len: [4, 7], wr: 0.35, shapes: ['lance', 'ovate'], ramps: G, ang: [0.8, 1.2], droop: 0.35, roll: 0.5, vein: -1 };
  for (let i = r.int(5, 7); i > 0; i--) blade(P, r, [r.range(-2, 2), 0, r.range(-2, 2)], polar(r.range(0.7, 1.3), r.range(0, TAU)), H * r.range(0.25, 0.4), 1.5, 0.08, pickRamp(r, G));
  const head = blade(P, r, [0, 0, 0], polar(r.range(1.3, 1.5), r.range(0, TAU)), H * 0.8, 1.1, 0.01, G[0][0], undefined, 0.7, true);
  for (let k = 0; k < 4; k++) twigLeaf(P, r, mul(head, 0.25 + k * 0.13), UP, ls);
  const R0 = Math.max(4, H * 0.15), face = nrm([r.range(-0.3, 0.3), 0.15, 1]);
  for (const [ring, n, lk, ramp] of [[0, r.int(8, 11), 1.5, A], [1, r.int(6, 8), 1.1, A2]] as [number, number, number, number[]][]) {
    for (let i = 0; i < n; i++) {
      const d = rot(perp(face), face, ((i + ring * 0.5) * TAU) / n), dd = nrm(add(d, mul(face, -0.25 + ring * 0.2)));
      P.leaf({ p: add(head, mul(d, R0 * 0.35)), d: dd, n: face, len: R0 * lk, wid: R0 * 0.42, shape: 'petal', ramp, kind: K.ACC, fold: 0.25, vein: 1 });
    }
  }
  const iris = RAMP(sp.glow ? 0x6ac8b0 : 0xc8a040, 6, 0.55), glow = sp.glow;
  P.eyes.push({ p: head, n: face, r: R0 * 0.62, iris, glow });
  P.post.push({ p: head, f: (S, x, y, z, k) => {
    const R = R0 * Math.sqrt(k), cx = Math.floor(x), cy = Math.floor(y), Sc = RAMP(0xd4ccb2, 6), n = iris.length - 1;
    const lid: KP2[] = [[cx - R * 0.62, cy], [cx - R * 0.3, cy - R * 0.36], [cx + R * 0.3, cy - R * 0.36], [cx + R * 0.62, cy], [cx + R * 0.3, cy + R * 0.32], [cx - R * 0.3, cy + R * 0.32]];
    fillPoly(lid, (px, py) => S.put(px, py, z + 6, Sc[px + py < cx + cy ? 4 : 2], K.ACC));
    const ir = R * 0.4, oct: KP2[] = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.39; oct.push([cx + 0.5 + Math.cos(a) * ir, cy + Math.sin(a) * ir * 0.92]); }
    fillPoly(oct, (px, py) => S.put(px, py, z + 6.5, iris[py < cy ? n - 1 : n - 3], K.ACC, glow ? 200 : 255));
    for (let py = -Math.round(ir * 0.85); py <= Math.round(ir * 0.85); py++) S.put(cx, cy + py, z + 7, iris[0], K.ACC);
    S.put(cx - Math.round(R * 0.2), cy - Math.round(R * 0.18), z + 8, Sc[5], K.ACC);
  } });
  return P.done(H, deepOf(G[0][0]), 0.15);
};

const fiddle: Grower = (sp, h, r) => {
  // fiddle spires: fronds that rise and never finish unrolling, laddered with short pinnae, each ending in a
  // tight crozier with a bead caught in the curl
  const P = new Plant(r), H = h * PX, G = leafRamps(sp.leaf, 0.6), A = RAMP(sp.accent, 6, 0.55), young = RAMP(mixHex(sp.leaf, 0xc8d090, 0.22), 7, 0.6);
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const side = (i / Math.max(1, n - 1) - 0.5) * 2, az = side < 0 ? Math.PI : 0;
    const dir = polar(1.5 - Math.abs(side) * 0.35 + r.range(-0.08, 0.08), az + r.range(-0.4, 0.4));
    const tip = frond(P, r, [side * 2, 0, r.range(-1.5, 1.5)], dir, H * r.range(0.55, 0.85), { rach: 1.1, ramp: G[0][0], ramps: G, sag: -0.005, start: 0.15, lmax: Math.max(3, Math.min(6, H * 0.11)), wr: 0.38, fwd: 0.35, droop: 0.05, shape: 'ovate', gap: 2.2 });
    const rad = Math.max(2.5, H * r.range(0.08, 0.11));
    const c = crozier(P, tip, rad * 1.3, rad, az + r.range(-0.4, 0.4), young);
    if (sp.glow || i === 0) P.orb(add(c, [0, 0, 1]), 1.3, A, { glow: sp.glow ? 0xfff4d8 : undefined, alpha: sp.glow ? 200 : 255 });
  }
  return P.done(H, deepOf(G[0][0]), 0.15);
};

// ------------------------------------------------------------------------------------------------ 2D painters
// (geometric forms that read best drawn flat: barrel cacti, crystal shards, floating lily pads)

/** four crisp bands across ramp indices 1..n (index 0 is kept for creases and outlines) */
function cel(ramp: number[], v: number) {
  const n = ramp.length - 1, b = Math.floor(Math.max(0, Math.min(0.999, v)) * 4);
  return ramp[Math.min(n, 1 + Math.round((b * (n - 1)) / 3))];
}
function bez(p0: P2, p1: P2, p2: P2, t: number): P2 { const u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; }
function blen(p0: P2, p1: P2, p2: P2) { return hyp(p1[0] - p0[0], p1[1] - p0[1]) + hyp(p2[0] - p1[0], p2[1] - p1[1]); }

export function canvasFor(wm: number, hm: number) {
  const w = Math.max(8, Math.ceil(wm * PX)) + 6, h = Math.max(8, Math.ceil(hm * PX)) + 4;
  const pc = new PixelCanvas(w, h); pc.wrap = false; pc.clear();
  return pc;
}

interface LeafOpt { shape?: 'lance' | 'round' | 'blade' | 'heart' | 'petal' | 'strap'; rib?: boolean; notch?: number; tip?: number[]; tipFrom?: number; alpha?: number; tipLight?: number; rimSide?: boolean }
/** a flat shaped leaf or petal along a curved spine */
export function leaf(pc: PixelCanvas, p0: P2, p1: P2, p2: P2, wid: number, ramp: number[], o: LeafOpt = {}) {
  const shape = o.shape ?? 'lance', LX = -0.6, LY = -0.8;
  const steps = Math.max(6, Math.ceil(blen(p0, p1, p2) * 2.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, [x, y] = bez(p0, p1, p2, t), [x2, y2] = bez(p0, p1, p2, Math.min(1, t + 0.02));
    let tx = x2 - x, ty = y2 - y; const tl = hyp(tx, ty) || 1; tx /= tl; ty /= tl;
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
      if (o.rimSide && side * Math.sign(facing || 1) < -0.7 && v < 0.4) c = step(c, 1);
      pc.set(x + nx * s, y + ny * s, c, o.alpha ?? 255);
    }
  }
}

/** a flat tapering stem with a lit left edge and a shaded right edge */
export function stalk(pc: PixelCanvas, p0: P2, p1: P2, p2: P2, w0: number, w1: number, ramp: number[], rings = 0) {
  const steps = Math.max(6, Math.ceil(blen(p0, p1, p2) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, [x, y] = bez(p0, p1, p2, t), [x2, y2] = bez(p0, p1, p2, Math.min(1, t + 0.02));
    let tx = x2 - x, ty = y2 - y; const tl = hyp(tx, ty) || 1; tx /= tl; ty /= tl;
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
    // sel-out: the neighbour's own ramp, two steps down on the lit side, to its darkest on the shadow side
    pc.set(x, y, lit ? step(nc, -2) : step(nc, -4));
  }
  void deep;
  snapRGBA(pc.data);
}

const barrel: Painter = (sp, h, r) => {
  // ribbed barrel cacti: glaucous bodies, areoles of pale spines along every rib, a crown of petals on top
  const pc = canvasFor(h * 0.9, h), G = RAMP(mixHex(sp.leaf, 0x5e7e62, 0.5), 6, 0.58), A = RAMP(sp.accent, 6, 0.55), cx = pc.w / 2, by = pc.h - 2;
  const spine = RAMP(0xd4ccb2, 6)[4];
  const n = r.int(1, 2);
  for (let i = 0; i < n; i++) {
    const bx = cx + (n === 1 ? 0 : (i - 0.5) * pc.w * 0.34), th = h * PX * (i === 0 ? 0.9 : r.range(0.5, 0.7)), w = Math.max(4, h * PX * r.range(0.2, 0.27) * (n === 1 ? 1.15 : 0.9));
    const dome = w * 1.1, ribs = r.int(3, 4);
    for (let y = 0; y < th; y++) {
      const fromTop = th - y;
      const f = (dome - fromTop) / dome, ww = fromTop < dome ? w * (f < 0.45 ? 1 - f * 0.25 : f < 0.8 ? 0.89 - (f - 0.45) * 1.1 : 0.5 - (f - 0.8) * 2) : w * (0.88 + (y / th < 0.5 ? 0.1 : 0.06));
      for (let k = -ww; k <= ww; k++) {
        const u = k / Math.max(1, ww), ridge = Math.cos(u * Math.PI * ribs) * 0.5 + 0.5;
        let v = 0.5 - u * 0.3 + ridge * 0.18 - (y < 2 ? 0.2 : 0) + (hashf(Math.floor(bx + k), y, 3) - 0.5) * 0.08;
        if (Math.abs(u + 0.42) < 0.12 && fromTop > dome * 0.6) v += 0.22;
        pc.set(bx + k, by - y, cel(G, v));
        // areoles: a tuft of pale spines on the rib crest every few pixels
        if (ridge > 0.95 && (y + Math.floor(k * 3)) % 4 === 0 && fromTop > 1) { pc.set(bx + k, by - y, spine); pc.set(bx + k + 1, by - y - 1, G[4]); }
      }
    }
    // flower crown: individual petals radiating from the apex
    if (r.chance(0.7)) for (let k = 0; k < r.int(1, 3); k++) {
      const fx = bx + r.range(-w * 0.35, w * 0.35), fy = by - th + 1;
      for (let p = 0; p < 7; p++) { const a = -Math.PI * (0.1 + 0.8 * (p / 6)); leaf(pc, [fx, fy], [fx + Math.cos(a) * 1.5, fy + Math.sin(a) * 1.5], [fx + Math.cos(a) * 3.2, fy + Math.sin(a) * 2.6], 1, A, { shape: 'petal' }); }
      pc.set(fx, fy - 1, RAMP(0xc9a464, 6)[5]);
    }
  }
  outline(pc, deepOf(G));
  return pc;
};

const crystalbloom: Painter = (sp, h, r) => {
  // mineral growths: faceted shards (a lit face, a shadowed face, a bright arris) rising from a stony boss
  const pc = canvasFor(h * 0.9, h), C = RAMP(sp.accent, 6, 0.6, 0.06), K2 = RAMP(0x6a6460, 5, 0.5), cx = pc.w / 2, by = pc.h - 2;
  for (let y = 0; y < 4; y++) for (let x = -5 + y; x <= 5 - y; x++) pc.set(cx + x, by - y, K2[ci(2.5 - x * 0.25 + y * 0.3, 1, 4)]);
  const n = r.int(3, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / Math.max(1, n - 1) - 0.5) * 1.3 + r.range(-0.1, 0.1), len = h * PX * r.range(0.5, 1), w = r.range(1.5, 3);
    for (let t = 0; t < len; t++) {
      const f = t / len, ww = w * (f > 0.75 ? (1 - f) * 4 : 1);
      for (let k = -ww; k <= ww; k++) {
        const face = k < -0.5 ? 0.85 : k > 0.5 ? 0.3 : 0.6;
        pc.set(cx + Math.sin(a) * t + k, by - 2 - Math.cos(a) * t, cel(C, face + (hashf(i, Math.floor(t / 3), 5) - 0.5) * 0.15), 175);
      }
      if (t % 5 === 2) pc.set(cx + Math.sin(a) * t - ww * 0.5, by - 2 - Math.cos(a) * t, C[5], 160);
    }
  }
  outline(pc, deepOf(C));
  return pc;
};

const lily: Painter = (sp, h, r) => {
  // floating pads seen from above: a notch to the centre, radial veins, a darker turned-up rim; sometimes a flower
  const pc = canvasFor(h, h), G = RAMP(sp.leaf, 6, 0.55), A = RAMP(sp.accent, 6, 0.55), cx = pc.w / 2, cy = pc.h / 2;
  for (let i = 0; i < r.int(2, 4); i++) {
    // a pad: an irregular nine-sided outline with a notch to the centre, two tones split by the light, vein strokes
    const x = cx + r.range(-pc.w * 0.2, pc.w * 0.2), y = cy + r.range(-pc.h * 0.2, pc.h * 0.2), rad = r.range(0.22, 0.32) * h * PX, notch = r.range(0, Math.PI * 2);
    const pts: KP2[] = [[x, y]];
    for (let k = 0; k <= 9; k++) { const a = notch + 0.3 + (k / 9) * (Math.PI * 2 - 0.6); pts.push([x + Math.cos(a) * rad * r.range(0.9, 1.04), y + Math.sin(a) * rad * r.range(0.9, 1.04)]); }
    fillPoly(pts, (px, py) => pc.set(px, py, G[px + py < x + y ? 4 : 3]));
    for (let k = 0; k < 5; k++) { const a = notch + 0.9 + k * 1.05; for (let t = 1.5; t < rad - 1.5; t += 1) pc.set(x + Math.cos(a) * t, y + Math.sin(a) * t, G[Math.cos(a) + Math.sin(a) < 0 ? 5 : 2]); }
  }
  if (r.chance(0.5)) {
    for (let p = 0; p < 8; p++) { const a = (p / 8) * Math.PI * 2; leaf(pc, [cx, cy], [cx + Math.cos(a) * 1.5, cy + Math.sin(a) * 1.5], [cx + Math.cos(a) * 3.5, cy + Math.sin(a) * 3.5], 1.2, A, { shape: 'petal' }); }
    pc.set(cx, cy, RAMP(0xc9a464, 6)[5]);
  }
  outline(pc, deepOf(G));
  return pc;
};

/** archetypes grown as 3D structures (sprite and mesh share the structure) */
export const GROW: Record<string, Grower> = { tuft, reed: tuft, fern, shrub, broadleaf, umbrella, palm, weeper, spike, rosette, coral, fungus, bulb, eyeflower, fiddle };
/** archetypes painted flat (their 3D form is modelled directly by the mesher) */
export const FLAT: Record<string, Painter> = { barrel, crystalbloom, lily };
/** the sprite of any archetype */
export const PAINT: Record<string, Painter> = Object.fromEntries([
  ...Object.entries(GROW).map(([k, g]) => [k, ((sp, h, r, pal) => g(sp, h, r, pal).raster()) as Painter]),
  ...Object.entries(FLAT),
]);
/** how each kind moves: 0 sway, 1 breathe, 2 bob, 3 shiver, 4 coil */
export const ANIM: Record<string, number> = { tuft: 0, reed: 0, fern: 0, shrub: 1, broadleaf: 0, umbrella: 0, palm: 0, weeper: 0, spike: 2, rosette: 1, coral: 3, fungus: 1, bulb: 1, barrel: 1, crystalbloom: 3, lily: 1, eyeflower: 4, fiddle: 4, snaptrap: 1, pitcher: 1, sundew: 1, sail: 3, lure: 4, bloom: 2 };
