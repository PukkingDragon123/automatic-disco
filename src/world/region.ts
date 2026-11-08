// One playable region of a planet: an N x N grid of 1 m columns with heights in 0.5 m steps.
import { Noise } from '../core/noise';
import { Rand, clamp, smooth, hash01 } from '../core/rand';
import { B } from './blockTex';
import type { Palette } from './palette';

/** sqrt-based length (Math.hypot is several times slower in the hot loops) */
const hyp = (a: number, b: number, c = 0) => Math.sqrt(a * a + b * b + c * c);
export type BiomeKey = 'meadow' | 'jungle' | 'savanna' | 'marsh' | 'highland' | 'tundra' | 'desert' | 'crystal' | 'ashland' | 'coast';
export interface Biome {
  key: BiomeKey; name: string;
  temp: number; moist: number; rough: number; water: number; terrace: number;
  /** flora density multiplier, fauna richness */
  flora: number; fauna: number;
}
export const BIOMES: Record<BiomeKey, Biome> = {
  meadow: { key: 'meadow', name: 'Meadowland', temp: 0.55, moist: 0.55, rough: 0.35, water: 0.08, terrace: 0.35, flora: 1, fauna: 1 },
  jungle: { key: 'jungle', name: 'Canopy Jungle', temp: 0.8, moist: 0.9, rough: 0.45, water: 0.1, terrace: 0.3, flora: 1.7, fauna: 1.3 },
  savanna: { key: 'savanna', name: 'Savanna', temp: 0.75, moist: 0.35, rough: 0.25, water: 0.04, terrace: 0.45, flora: 0.7, fauna: 1.2 },
  marsh: { key: 'marsh', name: 'Mire', temp: 0.6, moist: 1, rough: 0.15, water: 0.28, terrace: 0.1, flora: 1.3, fauna: 1.1 },
  highland: { key: 'highland', name: 'Highlands', temp: 0.4, moist: 0.5, rough: 0.9, water: 0.05, terrace: 0.75, flora: 0.8, fauna: 0.8 },
  tundra: { key: 'tundra', name: 'Frost Steppe', temp: 0.12, moist: 0.4, rough: 0.5, water: 0.08, terrace: 0.5, flora: 0.5, fauna: 0.7 },
  desert: { key: 'desert', name: 'Dune Sea', temp: 0.9, moist: 0.08, rough: 0.4, water: 0.02, terrace: 0.4, flora: 0.3, fauna: 0.6 },
  crystal: { key: 'crystal', name: 'Crystal Flats', temp: 0.5, moist: 0.3, rough: 0.6, water: 0.06, terrace: 0.65, flora: 0.6, fauna: 0.8 },
  ashland: { key: 'ashland', name: 'Ash Barrens', temp: 0.7, moist: 0.2, rough: 0.7, water: 0.03, terrace: 0.6, flora: 0.35, fauna: 0.6 },
  coast: { key: 'coast', name: 'Tidal Coast', temp: 0.6, moist: 0.7, rough: 0.3, water: 0.32, terrace: 0.3, flora: 1, fauna: 1.1 },
};

export interface Deposit { x: number; z: number; kind: 'ore' | 'crystal'; amount: number; r: number }
/** a sample along a river's centre line: position, water surface height, half width, arc length, flow speed */
export interface RiverPt { x: number; z: number; y: number; w: number; s: number; v: number }
/** rock families: granite (meadow, forest, tundra), sandstone (desert, savanna), basalt (ash), limestone (jungle, crystal) */
export const enum RockMat { GRANITE, SANDSTONE, BASALT, LIMESTONE, WOOD }
export type RockKind = 'boulder' | 'slab' | 'spire' | 'column' | 'arch' | 'pebble' | 'river' | 'log' | 'stump';
/** one sculpted rock: base centre on the ground (x, y, z), size, yaw and a tilt of its up axis */
export interface RockPiece {
  kind: RockKind; mat: RockMat; x: number; y: number; z: number; sx: number; sy: number; sz: number;
  yaw: number; tilt: number; tiltDir: number; seed: number; moss: number; wet: number;
}

export class Region {
  readonly N: number;
  readonly h: Float32Array;
  readonly b: Uint8Array;
  readonly wet: Float32Array;
  readonly fert: Float32Array;
  water = 2;
  deposits: Deposit[] = [];
  /** where the Veyr comes down */
  landing = { x: 64, z: 64 };
  readonly noise: Noise;
  /** columns whose mesh must be rebuilt */
  dirty = new Set<number>();
  /** river water surface over a column (0 = no river there) */
  readonly riverY: Float32Array;
  /** river centre lines, source to mouth */
  rivers: RiverPt[][] = [];
  /** woodland density 0..1: tree clustering, leaf litter, the forest floor */
  readonly forest: Float32Array;
  /** damp ground 0..1 (river banks, shores): darker, lusher */
  readonly damp: Float32Array;
  /** solid rock footprint: plants, spawns and buildings keep off */
  readonly solid: Uint8Array;
  /** sculpted rock formations */
  rocks: RockPiece[] = [];

  constructor(readonly seed: number, readonly biome: Biome, readonly pal: Palette, N = 128) {
    this.N = N;
    this.h = new Float32Array(N * N); this.b = new Uint8Array(N * N);
    this.wet = new Float32Array(N * N); this.fert = new Float32Array(N * N);
    this.riverY = new Float32Array(N * N); this.forest = new Float32Array(N * N); this.damp = new Float32Array(N * N); this.solid = new Uint8Array(N * N);
    this.noise = new Noise(seed);
    this.generate();
  }

  idx(x: number, z: number) { return z * this.N + x; }
  inside(x: number, z: number) { return x >= 0 && z >= 0 && x < this.N && z < this.N; }
  /** ground height under a world point (bilinear over cell centres: the ground is smooth) */
  heightAt(x: number, z: number): number { return this.groundSmooth(x, z); }
  /** the cell's own height */
  cellH(x: number, z: number): number { return this.h[clamp(Math.floor(z), 0, this.N - 1) * this.N + clamp(Math.floor(x), 0, this.N - 1)]; }
  /** smooth ground for cameras / particles: bilinear over column tops */
  groundSmooth(x: number, z: number): number {
    const N = this.N;
    const fx = clamp(x - 0.5, 0, N - 1.001), fz = clamp(z - 0.5, 0, N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = this.h[j * N + i], b = this.h[j * N + i + 1], c = this.h[(j + 1) * N + i], d = this.h[(j + 1) * N + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  /** river surface over a point (0 if none) */
  riverAt(x: number, z: number) { return this.riverY[clamp(Math.floor(z), 0, this.N - 1) * this.N + clamp(Math.floor(x), 0, this.N - 1)]; }
  /** sea or river: rivers are shallow enough to wade, but nothing spawns or idles in them */
  isWater(x: number, z: number) { const g = this.heightAt(x, z); if (g < this.water) return true; const ry = this.riverAt(x, z); return ry > 0 && g < ry - 0.05; }
  /** solid rock at a point */
  isSolid(x: number, z: number) { return this.solid[clamp(Math.floor(z), 0, this.N - 1) * this.N + clamp(Math.floor(x), 0, this.N - 1)] > 0; }
  /** the nearest open ground (not rock, not water) within maxR of a point, or null */
  freeNear(x: number, z: number, maxR = 5): [number, number] | null {
    if (!this.isSolid(x, z) && !this.isWater(x, z)) return [x, z];
    for (let rr = 1; rr <= maxR; rr++) for (let a = 0; a < 12; a++) {
      const px = x + Math.cos(a * 0.5236 + rr) * rr, pz = z + Math.sin(a * 0.5236 + rr) * rr;
      if (px < 1 || pz < 1 || px > this.N - 1 || pz > this.N - 1) continue;
      if (!this.isSolid(px, pz) && !this.isWater(px, pz)) return [px, pz];
    }
    return null;
  }
  surfaceY(x: number, z: number) { const g = this.heightAt(x, z), ry = this.riverAt(x, z); return Math.max(g, this.water - 0.15, ry > 0 ? ry - 0.22 : -99); }

  private generate() {
    const N = this.N, bi = this.biome, n = this.noise, r = new Rand(this.seed);
    const H = new Float32Array(N * N);
    const ox = r.range(0, 1000), oz = r.range(0, 1000);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const X = x + ox, Z = z + oz;
      // low, rolling relief: broad swells, a few soft hills, a little grain
      let v = n.fbm2(X * 0.008, Z * 0.008, 5) * (1.4 + bi.rough * 2.6);
      v += Math.pow(n.ridge2(X * 0.013, Z * 0.013, 4), 1.6) * bi.rough * 5.5;
      v += n.fbm2(X * 0.035, Z * 0.035, 2) * 0.22;
      if (bi.key === 'desert') v += Math.sin(X * 0.06 + n.n2(X * 0.02, Z * 0.02) * 3) * 0.6;
      // winding backwater channels in the mire (real rivers are carved later, downhill to the sea)
      if (bi.key === 'marsh') {
        const rv = Math.abs(n.n2(X * 0.0065, Z * 0.0065 + 40));
        if (rv < 0.07) v -= Math.pow(1 - rv / 0.07, 1.5) * (1.6 + bi.moist * 1.2);
      }
      H[z * N + x] = v;
      this.wet[z * N + x] = clamp(bi.moist + n.fbm2(X * 0.02 + 99, Z * 0.02, 3) * 0.45, 0, 1);
    }
    const sorted = Float32Array.from(H).sort();
    const wl = sorted[Math.floor(clamp(bi.water, 0.005, 0.6) * (N * N - 1))];
    const base = 4 - wl;
    // two soft blur passes: the ground should roll, never step
    let S = Float32Array.from(H, (v) => v + base);
    for (let pass = 0; pass < 2; pass++) {
      const T = new Float32Array(N * N);
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        let sum = 0, c = 0;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue; const w = dx || dz ? 1 : 2; sum += S[Z * N + X] * w; c += w; }
        T[z * N + x] = sum / c;
      }
      S = T;
    }
    for (let i = 0; i < N * N; i++) this.h[i] = Math.max(1.5, S[i]);
    this.water = 3.9;
    this.pickLanding(r);
    this.carveRivers(new Rand(this.seed ^ 0x51ae));
    this.forestField();
    this.assignBlocks(r);
    this.trails(r);
    this.formations(new Rand(this.seed ^ 0x70c5));
    this.placeDeposits(r);
    this.dampField();
  }

  // ------------------------------------------------------------------------------------------------ rivers
  /**
   * Rivers enter at high ground on the map edge and find the cheapest way down to the sea (a least-cost path that
   * hugs the valley floors), are smoothed and given gentle meanders, then cut into the heightfield: a parabolic
   * channel under a water surface that only ever falls toward the mouth, low banks, and valley sides no steeper
   * than a walker can climb, so every river stays wadeable. A second river may join the first as a tributary.
   */
  private carveRivers(r: Rand) {
    const N = this.N, bi = this.biome, h = this.h, W = this.water, L = this.landing;
    const want = bi.key === 'desert' || bi.key === 'ashland' ? 0 : bi.moist > 0.6 || bi.key === 'meadow' ? (r.chance(0.55) ? 2 : 1) : 1;
    if (!want) return;
    // big water bodies (not puddles) are the sea
    const comp = new Int32Array(N * N).fill(-1), sizes: number[] = [];
    for (let i = 0; i < N * N; i++) {
      if (h[i] >= W || comp[i] >= 0) continue;
      const id = sizes.length, st = [i]; comp[i] = id; let n = 0;
      while (st.length) {
        const c = st.pop()!; n++;
        const x = c % N, z = (c / N) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
          const j = Z * N + X; if (h[j] < W && comp[j] < 0) { comp[j] = id; st.push(j); }
        }
      }
      sizes.push(n);
    }
    const isSea = (i: number) => comp[i] >= 0 && sizes[comp[i]] >= 30;
    // distance to the sea: rivers should cross the shore, not run along it
    const ds = new Float32Array(N * N).fill(99);
    for (let i = 0; i < N * N; i++) if (isSea(i)) ds[i] = 0;
    for (let pass = 0; pass < 2; pass++) for (let q = 0; q < N * N; q++) {
      const i = pass ? N * N - 1 - q : q, x = i % N, z = (i / N) | 0, sg = pass ? 1 : -1;
      if (x + sg >= 0 && x + sg < N) ds[i] = Math.min(ds[i], ds[i + sg] + 1);
      if (z + sg >= 0 && z + sg < N) ds[i] = Math.min(ds[i], ds[i + sg * N] + 1);
    }
    const g = new Float32Array(N * N), from = new Int32Array(N * N), done = new Uint8Array(N * N);
    const sources: [number, number][] = [];
    for (let k = 0; k < want; k++) {
      // source: a high point on the edge, away from other sources and from the landing
      let src = -1, best = -1e9;
      for (let t = 0; t < 160; t++) {
        const e = r.int(0, 3), u = r.int(6, N - 7);
        const x = e === 0 ? 0 : e === 1 ? N - 1 : u, z = e === 2 ? 0 : e === 3 ? N - 1 : u;
        const i = z * N + x;
        if (h[i] < W + 1) continue;
        let sc = h[i] + r.range(0, 1.5) - Math.max(0, 30 - hyp(x - L.x, z - L.z)) * 0.2;
        for (const [sx, sz] of sources) if (hyp(sx - x, sz - z) < N * 0.45) sc -= 20;
        if (sc > best) { best = sc; src = i; }
      }
      if (src < 0) continue;
      const sx0 = src % N, sz0 = (src / N) | 0;
      sources.push([sx0, sz0]);
      // least-cost descent (Dijkstra): low ground is cheap, the landing and the map rim are expensive
      g.fill(1e9); done.fill(0); from.fill(-1);
      const heap = new MinHeap(g);
      g[src] = 0; heap.push(src);
      let end = -1;
      let lo = 1e9; for (let i = 0; i < N * N; i++) lo = Math.min(lo, h[i]);
      const span = Math.max(1, h[src] - lo);
      while (heap.size) {
        const c = heap.pop();
        if (done[c]) continue;
        done[c] = 1;
        const cx = c % N, cz = (c / N) | 0;
        if (c !== src && (isSea(c) || (this.riverY[c] > 0 && k > 0))) { end = c; break; }
        if (!sizes.some((n) => n >= 30) && !this.rivers.length && (cx === 0 || cz === 0 || cx === N - 1 || cz === N - 1) && hyp(cx - sx0, cz - sz0) > N * 0.7) { end = c; break; }
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
          const j = Z * N + X; if (done[j]) continue;
          const dl = hyp(X + 0.5 - L.x, Z + 0.5 - L.z), rim = Math.min(X, Z, N - 1 - X, N - 1 - Z);
          const cost = (dx && dz ? 1.414 : 1) * (1 + Math.max(0, (h[j] - W) / span) * 14 + (dl < 17 ? 60 : 0) + (rim < 9 && hyp(X - sx0, Z - sz0) > 8 ? (9 - rim) * 4 : 0) + (ds[j] > 0 && ds[j] < 7 ? (7 - ds[j]) * 2.5 : 0) + this.noise.n2(X * 0.08 + k * 31, Z * 0.08) * 0.35);
          if (g[c] + cost < g[j]) { g[j] = g[c] + cost; from[j] = c; heap.push(j); }
        }
      }
      if (end < 0) continue;
      const cells: number[] = [];
      for (let c = end; c >= 0; c = from[c]) cells.push(c);
      cells.reverse();
      if (cells.length < 20) continue;
      // centre line: start a little off the map, decimate, smooth (Chaikin), then meander gently
      let P: [number, number][] = [];
      const c0 = cells[0], c1 = cells[Math.min(cells.length - 1, 6)];
      const ox = (c0 % N) - (c1 % N), oz = ((c0 / N) | 0) - ((c1 / N) | 0), ol = hyp(ox, oz) || 1;
      P.push([(c0 % N) + 0.5 + (ox / ol) * 5, ((c0 / N) | 0) + 0.5 + (oz / ol) * 5]);
      for (let i = 0; i < cells.length; i += 3) P.push([(cells[i] % N) + 0.5, ((cells[i] / N) | 0) + 0.5]);
      const ce = cells[cells.length - 1];
      P.push([(ce % N) + 0.5, ((ce / N) | 0) + 0.5]);
      for (let it = 0; it < 3; it++) {
        const Q: [number, number][] = [P[0]];
        for (let i = 0; i < P.length - 1; i++) {
          const a = P[i], b = P[i + 1];
          Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
        Q.push(P[P.length - 1]); P = Q;
      }
      // resample at 0.5 m with a sinuous offset that vanishes at both ends
      const raw: [number, number][] = [];
      let carry = 0;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1], l = hyp(b[0] - a[0], b[1] - a[1]);
        let t = carry;
        for (; t < l; t += 0.5) raw.push([a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l]);
        carry = t - l;
      }
      const tot = raw.length * 0.5, amp = r.range(1.6, 3.2);
      const pts: RiverPt[] = [];
      for (let i = 0; i < raw.length; i++) {
        const a = raw[Math.max(0, i - 2)], b = raw[Math.min(raw.length - 1, i + 2)];
        const tx = b[0] - a[0], tz = b[1] - a[1], tl = hyp(tx, tz) || 1;
        const s = i * 0.5, env = Math.sin(Math.PI * Math.min(1, s / tot)) ** 0.6;
        const off = this.noise.n2(s * 0.035 + k * 17, 3.3) * amp * env;
        let x = raw[i][0] - (tz / tl) * off, z = raw[i][1] + (tx / tl) * off;
        const dl = hyp(x - L.x, z - L.z);
        if (dl < 15) { x = L.x + ((x - L.x) / dl) * 15; z = L.z + ((z - L.z) / dl) * 15; }
        pts.push({ x, z, y: 0, w: 0, s, v: 0 });
      }
      // water surface: falls monotonically from source to mouth, never above the valley floor
      const big = k === 0, end2 = this.riverY[end] > 0 ? this.riverY[end] : W;
      let ws = 1e9;
      for (const p of pts) {
        const gr = this.groundSmooth(clamp(p.x, 0, N), clamp(p.z, 0, N));
        ws = Math.min(ws - 0.002, gr - 0.5);
        p.y = Math.max(end2, ws);
      }
      // smooth the profile, then make it monotone again
      const ys = pts.map((p) => p.y);
      for (let i = 0; i < pts.length; i++) { let sum = 0, c = 0; for (let j = Math.max(0, i - 8); j <= Math.min(pts.length - 1, i + 8); j++) { sum += ys[j]; c++; } pts[i].y = sum / c; }
      for (let i = 1; i < pts.length; i++) pts[i].y = Math.min(pts[i].y, pts[i - 1].y - 0.001);
      for (const p of pts) p.y = Math.max(end2, p.y);
      // trim where the river has run out into the sea (keep a few metres for the surface to blend)
      let cut = pts.length;
      for (let i = 0; i < pts.length; i++) if (pts[i].y <= W + 0.01 && this.groundSmooth(clamp(pts[i].x, 0, N), clamp(pts[i].z, 0, N)) < W - 0.3) { cut = Math.min(pts.length, i + 8); break; }
      pts.length = cut;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], t = p.s / Math.max(1, pts[pts.length - 1].s);
        p.w = (big ? 1.5 + 1.2 * t : 1.0 + 0.6 * t) * (1 + this.noise.n2(p.s * 0.05, 9.1 + k) * 0.18);
        const a = pts[Math.max(0, i - 6)], b = pts[Math.min(pts.length - 1, i + 6)];
        const slope = (a.y - b.y) / Math.max(0.5, b.s - a.s);
        p.v = clamp(0.45 + slope * 26, 0.45, 2.6);
      }
      this.cutChannel(pts);
      this.rivers.push(pts);
    }
  }

  /** carve one river's channel, banks and valley into the heightfield and mark its wetted columns */
  private cutChannel(pts: RiverPt[]) {
    const N = this.N, h = this.h;
    const bestD = new Float32Array(N * N).fill(1e9), bestI = new Int32Array(N * N).fill(-1);
    const BANK = 2.6, VAL = 8;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], R = p.w + BANK + VAL;
      for (let z = Math.max(0, Math.floor(p.z - R)); z <= Math.min(N - 1, Math.ceil(p.z + R)); z++)
        for (let x = Math.max(0, Math.floor(p.x - R)); x <= Math.min(N - 1, Math.ceil(p.x + R)); x++) {
          const d = hyp(x + 0.5 - p.x, z + 0.5 - p.z), i = z * N + x;
          if (d < bestD[i]) { bestD[i] = d; bestI[i] = k; }
        }
    }
    for (let i = 0; i < N * N; i++) {
      const k = bestI[i]; if (k < 0) continue;
      const p = pts[k], d = bestD[i], w = p.w, dep = 0.32 + 0.2 * w;
      if (d > w + BANK + VAL) continue;
      let t: number;
      if (d < w) t = p.y - dep * (1 - (d / w) ** 2) - 0.04;
      else if (d < w + BANK) t = p.y + 0.06 + (d - w) * 0.42;
      else t = p.y + 0.06 + BANK * 0.42 + (d - w - BANK) * 0.85;
      if (h[i] > t) h[i] = t;
      else if (d < w + BANK && h[i] < p.y + 0.06 && p.y > this.water + 0.05 && this.riverY[i] <= 0) h[i] = t; // a low levee holds the water in
      if (d < w + 0.35 && h[i] < p.y) this.riverY[i] = Math.max(this.riverY[i], p.y);
    }
  }

  // ------------------------------------------------------------------------------------------------ rock formations
  /**
   * Geological formations, chosen per biome and sited where the land asks for them: granite tors on rises, glacial
   * erratics in open ground, layered ledges along steep slopes with scree fanned out below, sandstone hoodoos and
   * a rare arch in dry country, basalt column clusters in the ash, karst pillars in the jungle, sea stacks off the
   * coast, moss-grown stones in damp woods and rounded stones along every river. Big pieces lift the ground under
   * them, so walkers path around them and nothing spawns or grows inside.
   */
  private formations(r: Rand) {
    const N = this.N, bi = this.biome, L = this.landing, h0 = Float32Array.from(this.h);
    const mat: RockMat = bi.key === 'desert' || bi.key === 'savanna' ? RockMat.SANDSTONE : bi.key === 'ashland' ? RockMat.BASALT : bi.key === 'jungle' || bi.key === 'crystal' ? RockMat.LIMESTONE : RockMat.GRANITE;
    const mossK: Record<string, number> = { meadow: 0.5, jungle: 0.95, savanna: 0.1, marsh: 0.9, highland: 0.4, tundra: 0.2, desert: 0, crystal: 0.15, ashland: 0.06, coast: 0.35 };
    const moss0 = mossK[bi.key] ?? 0.3;
    type F = 'tor' | 'erratic' | 'stones' | 'ledge' | 'hoodoo' | 'pillar' | 'columns' | 'stack' | 'arch';
    const W: Record<string, [F, number][]> = {
      meadow: [['tor', 3], ['erratic', 2], ['stones', 2], ['ledge', 1]],
      jungle: [['pillar', 2], ['stones', 3], ['tor', 1]],
      savanna: [['tor', 3], ['hoodoo', 1.2], ['erratic', 1], ['arch', 0.25]],
      marsh: [['stones', 3], ['erratic', 1]],
      highland: [['ledge', 3], ['tor', 2], ['erratic', 1]],
      tundra: [['erratic', 3], ['tor', 1.5], ['ledge', 1]],
      desert: [['hoodoo', 3], ['ledge', 2], ['arch', 0.6], ['erratic', 1]],
      crystal: [['pillar', 2], ['hoodoo', 1], ['tor', 1]],
      ashland: [['columns', 3], ['ledge', 1], ['erratic', 2]],
      coast: [['stack', 2], ['tor', 1], ['erratic', 2], ['stones', 1]],
    };
    const COUNT: Record<string, number> = { highland: 14, desert: 12, ashland: 12, tundra: 10, savanna: 10, crystal: 11, meadow: 10, coast: 9, jungle: 9, marsh: 7 };
    const g0 = (x: number, z: number) => {
      const fx = clamp(x - 0.5, 0, N - 1.001), fz = clamp(z - 0.5, 0, N - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      return (h0[j * N + i] * (1 - u) + h0[j * N + i + 1] * u) * (1 - v) + (h0[(j + 1) * N + i] * (1 - u) + h0[(j + 1) * N + i + 1] * u) * v;
    };
    const cellOk = (x: number, z: number) => {
      if (x < 3 || z < 3 || x > N - 3 || z > N - 3) return false;
      const i = Math.floor(z) * N + Math.floor(x);
      return h0[i] >= this.water + 0.3 && this.riverY[i] <= 0 && this.b[i] !== B.SOIL;
    };
    const grad = (x: number, z: number): [number, number] => [g0(x + 1, z) - g0(x - 1, z), g0(x, z + 1) - g0(x, z - 1)];
    const prom = (x: number, z: number) => { let s = 0; for (let a = 0; a < 8; a++) s += g0(x + Math.cos(a * 0.785) * 6, z + Math.sin(a * 0.785) * 6); return g0(x, z) - s / 8; };
    const centres: [number, number][] = [];
    const add = (k: RockKind, x: number, z: number, sx: number, sy: number, sz: number, o: Partial<RockPiece> = {}) => {
      // seat on the lowest ground under the footprint, sunk by a fraction of its height
      let y = g0(x, z);
      const rad = Math.min(sx, sz) * 0.7;
      for (let a = 0; a < 6; a++) y = Math.min(y, g0(x + Math.cos(a * 1.047) * rad, z + Math.sin(a * 1.047) * rad));
      const bury = o.y !== undefined ? 0 : sy * (k === 'spire' || k === 'column' || k === 'arch' ? 0.06 : r.range(0.14, 0.3));
      this.rocks.push({ kind: k, mat, x, y: (o.y ?? y) - bury, z, sx, sy, sz, yaw: r.range(0, Math.PI * 2), tilt: 0, tiltDir: 0, seed: r.int(1, 1e9), moss: moss0, wet: 0, ...o, ...(o.y !== undefined ? { y: o.y } : {}) });
      return this.rocks[this.rocks.length - 1];
    };
    const scree = (x: number, z: number, rad: number, n: number, size: number, downhill = 0) => {
      const [gx, gz] = grad(x, z), gl = hyp(gx, gz) || 1;
      for (let i = 0; i < n; i++) {
        const a = r.range(0, Math.PI * 2), d = rad * Math.sqrt(r.next());
        let px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (downhill) { const t = r.range(0, downhill); px -= (gx / gl) * t; pz -= (gz / gl) * t; }
        if (!cellOk(px, pz) || hyp(px - L.x, pz - L.z) < 14) continue;
        const s0 = size * r.range(0.35, 1) * (r.chance(0.12) ? 1.8 : 1);
        add('pebble', px, pz, s0 * r.range(0.8, 1.3), s0 * r.range(0.5, 0.9), s0 * r.range(0.8, 1.3), { tilt: r.range(0, 0.5), tiltDir: r.range(0, 6.28) });
      }
    };
    const want = COUNT[bi.key] ?? 9, table = W[bi.key] ?? W.meadow;
    for (let f = 0, tries = 0; f < want && tries < want * 12; tries++) {
      const type = r.weighted(table);
      // pick the best of a handful of candidate sites for this kind
      let bx = -1, bz = -1, bs = -1e9;
      for (let t = 0; t < 24; t++) {
        const x = r.range(8, N - 8), z = r.range(8, N - 8);
        if (!cellOk(x, z)) continue;
        const dl = hyp(x - L.x, z - L.z);
        if (dl < (type === 'arch' || type === 'columns' ? 22 : 19)) continue;
        if (centres.some(([cx, cz]) => hyp(cx - x, cz - z) < 13)) continue;
        const i = Math.floor(z) * N + Math.floor(x), [gx, gz] = grad(x, z), sl = hyp(gx, gz) * 0.5;
        let sc = r.range(0, 0.6);
        if (type === 'tor') sc += prom(x, z) * 1.4 - sl * 0.3;
        else if (type === 'ledge') sc += sl * 3 - (sl > 1.2 ? 2 : 0);
        else if (type === 'stones') sc += this.forest[i] * 1.5 + this.wet[i];
        else if (type === 'erratic') sc += 1 - this.forest[i] - sl * 0.5;
        else if (type === 'hoodoo' || type === 'pillar') sc += prom(x, z) * 0.6 + (1 - this.forest[i]) * 0.5;
        else if (type === 'stack') { let near = 99; for (let a = 0; a < 12; a++) for (const d of [3, 6, 9]) if (h0[clamp(Math.floor(z + Math.sin(a * 0.52) * d), 0, N - 1) * N + clamp(Math.floor(x + Math.cos(a * 0.52) * d), 0, N - 1)] < this.water) near = Math.min(near, d); sc += near < 99 ? 2 - near * 0.15 : -3; }
        else if (type === 'arch') sc += 1 - sl * 2;
        else sc += sl;
        if (sc > bs) { bs = sc; bx = x; bz = z; }
      }
      if (bx < 0) continue;
      const x = bx, z = bz, i = Math.floor(z) * N + Math.floor(x), [gx, gz] = grad(x, z), gl = hyp(gx, gz) || 1;
      const mossy = clamp(moss0 + this.forest[i] * 0.3 + this.wet[i] * 0.15 - 0.1, 0, 1);
      centres.push([x, z]); f++;
      if (type === 'tor') {
        // a granite tor: a pile of jointed, rounded blocks, some stacked, a skirt of fallen pieces
        const R0 = r.range(1.5, 2.3), n = r.int(2, 4), core: RockPiece[] = [];
        for (let k = 0; k < n; k++) {
          const a = r.range(0, 6.28), d = k ? r.range(R0 * 0.6, R0 * 1.15) : 0, R = R0 * (k ? r.range(0.55, 0.85) : 1);
          core.push(add('boulder', x + Math.cos(a) * d, z + Math.sin(a) * d, R * r.range(0.9, 1.15), R * r.range(0.75, 1.05), R * r.range(0.85, 1.1), { moss: mossy }));
        }
        if (r.chance(0.6)) { const b = core[0], R = R0 * r.range(0.45, 0.65); add('boulder', b.x + r.range(-0.4, 0.4), b.z + r.range(-0.4, 0.4), R, R * r.range(0.7, 0.95), R * r.range(0.8, 1), { y: b.y + b.sy * 0.82, moss: mossy * 0.6, tilt: r.range(0, 0.25), tiltDir: r.range(0, 6.28) }); }
        for (let k = r.int(3, 6); k > 0; k--) { const a = r.range(0, 6.28), d = r.range(R0 * 1.4, R0 * 2.4), R = r.range(0.45, 0.95); if (cellOk(x + Math.cos(a) * d, z + Math.sin(a) * d)) add('boulder', x + Math.cos(a) * d, z + Math.sin(a) * d, R, R * r.range(0.6, 0.9), R * r.range(0.8, 1.2), { moss: mossy }); }
        scree(x, z, R0 * 3, r.int(10, 18), 0.32, 3);
      } else if (type === 'erratic') {
        const R = r.range(1.1, 1.9);
        add('boulder', x, z, R * r.range(1, 1.3), R * r.range(0.8, 1.1), R, { moss: mossy, tilt: r.range(0, 0.18), tiltDir: r.range(0, 6.28) });
        for (let k = r.int(1, 3); k > 0; k--) { const a = r.range(0, 6.28), d = r.range(R * 1.3, R * 2.2), q = r.range(0.35, 0.7); add('boulder', x + Math.cos(a) * d, z + Math.sin(a) * d, q, q * 0.7, q, { moss: mossy }); }
        scree(x, z, R * 2.6, r.int(4, 9), 0.28);
      } else if (type === 'stones') {
        // a mossy jumble of rounded stones, half sunk in the leaf mould
        for (let k = r.int(4, 8); k > 0; k--) {
          const a = r.range(0, 6.28), d = r.range(0, 4.5), R = r.range(0.4, 1.1), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
          if (cellOk(px, pz)) add('boulder', px, pz, R * r.range(1, 1.3), R * r.range(0.55, 0.85), R, { moss: clamp(mossy + 0.25, 0, 1) });
        }
        scree(x, z, 5, r.int(5, 10), 0.24);
      } else if (type === 'ledge') {
        // a stepped band of bedding slabs running along the contour, dipping gently, scree fanned out below
        const sa = Math.atan2(gz, gx) + Math.PI / 2, ca = Math.cos(sa), sn = Math.sin(sa), n = r.int(3, 6), dip = r.range(0.06, 0.22);
        let off = -((n - 1) / 2) * 2.8;
        for (let k = 0; k < n; k++) {
          const px = x + ca * off + (gx / gl) * r.range(-0.6, 0.6), pz = z + sn * off + (gz / gl) * r.range(-0.6, 0.6);
          off += r.range(2.2, 3.4);
          if (!cellOk(px, pz)) continue;
          add('slab', px, pz, r.range(1.5, 2.6), r.range(0.8, 1.6) * (bi.key === 'highland' || bi.key === 'desert' ? 1.25 : 1), r.range(1.1, 1.7), { yaw: sa + r.range(-0.2, 0.2), tilt: dip, tiltDir: Math.atan2(-gz, -gx), moss: mossy * 0.8 });
        }
        scree(x - (gx / gl) * 3, z - (gz / gl) * 3, 4.5, r.int(14, 26), 0.3, 4);
      } else if (type === 'hoodoo' || type === 'pillar' || type === 'stack') {
        // spires: hoodoos with cap rocks, karst pillars, sea stacks
        const n = type === 'stack' ? r.int(1, 3) : r.int(3, 7);
        for (let k = 0; k < n; k++) {
          const a = r.range(0, 6.28), d = k ? r.range(1.6, 5) : 0, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
          if (k && !cellOk(px, pz)) continue;
          const R = type === 'stack' ? r.range(1.0, 1.7) : r.range(0.5, 1.0), H = type === 'stack' ? r.range(3.5, 6.5) : type === 'pillar' ? r.range(2.4, 5.2) : r.range(1.8, 5.5) * (k ? 0.8 : 1);
          add('spire', px, pz, R, H, R * r.range(0.85, 1.15), { tilt: r.range(0, 0.06), tiltDir: r.range(0, 6.28), moss: type === 'pillar' ? clamp(mossy + 0.2, 0, 1) : mossy * 0.5 });
        }
        for (let k = r.int(1, 4); k > 0; k--) { const a = r.range(0, 6.28), d = r.range(1.5, 5), q = r.range(0.4, 0.9), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; if (cellOk(px, pz)) add('boulder', px, pz, q * 1.2, q * 0.7, q, { moss: mossy * 0.6, tilt: r.range(0, 0.4), tiltDir: r.range(0, 6.28) }); }
        scree(x, z, 5.5, r.int(8, 16), 0.26);
      } else if (type === 'columns') {
        // columnar basalt: a cluster of hexagonal prisms, stepped like organ pipes
        add('column', x, z, r.range(1.8, 3.2), r.range(1.6, 3.8), 1, { moss: mossy * 0.4 });
        scree(x, z, 5, r.int(10, 18), 0.3, 2);
      } else if (type === 'arch') {
        // a natural arch, with the rest of its fin running on past both legs
        const span = r.range(2.8, 4.2), A = add('arch', x, z, span, r.range(3, 4.6), r.range(0.9, 1.3), { moss: mossy * 0.5 });
        for (const sg of [-1, 1]) {
          const d = span + r.range(1.8, 2.6), px = x + Math.cos(A.yaw) * d * sg, pz = z + Math.sin(A.yaw) * d * sg;
          if (cellOk(px, pz)) add('slab', px, pz, r.range(1.6, 2.3), A.sy * r.range(0.45, 0.8), A.sz * r.range(1.1, 1.4), { yaw: A.yaw + r.range(-0.15, 0.15), moss: mossy * 0.4 });
        }
        scree(x, z, span * 1.8, r.int(8, 14), 0.3);
      }
    }
    // rounded stones along the rivers: on the banks, in the shallows, and as riffles where the water runs fast
    for (const pts of this.rivers) for (let k = 4; k < pts.length - 4; k += 2) {
      const p = pts[k];
      if (!r.chance(p.v > 1.3 ? 0.42 : 0.2)) continue;
      const q = pts[Math.min(pts.length - 1, k + 2)], tx = q.x - p.x, tz = q.z - p.z, tl = hyp(tx, tz) || 1;
      const side = r.chance(0.5) ? 1 : -1, d = p.v > 1.3 && r.chance(0.4) ? r.range(0, p.w * 0.8) : p.w + r.range(-0.6, 1.3);
      const px = p.x - (tz / tl) * d * side, pz = p.z + (tx / tl) * d * side;
      if (px < 1 || pz < 1 || px > N - 1 || pz > N - 1 || hyp(px - L.x, pz - L.z) < 14) continue;
      const R = r.range(0.22, 0.6) * (r.chance(0.1) ? 1.8 : 1);
      this.rocks.push({ kind: 'river', mat: mat === RockMat.SANDSTONE ? RockMat.GRANITE : mat, x: px, y: g0(px, pz) - R * 0.2, z: pz, sx: R * r.range(1, 1.4), sy: R * r.range(0.45, 0.7), sz: R, yaw: r.range(0, 6.28), tilt: r.range(0, 0.25), tiltDir: r.range(0, 6.28), seed: r.int(1, 1e9), moss: bi.key === 'desert' ? 0 : r.range(0, 0.5), wet: 1 });
    }
    // the forest floor: fallen trunks lying along the slope, and old stumps, some broken off high
    let fc = 0; for (let i = 0; i < N * N; i++) if (this.forest[i] > 0.5) fc++;
    const nLogs = Math.round(fc * 0.0055), nStumps = Math.round(fc * 0.0035);
    const clearOf = (x: number, z: number, d: number) => !this.rocks.some((q) => q.kind !== 'pebble' && hyp(q.x - x, q.z - z) < d + Math.max(q.sx, q.sz));
    for (let t = 0, made = 0; t < nLogs * 10 && made < nLogs; t++) {
      const x = r.range(4, N - 4), z = r.range(4, N - 4), i = Math.floor(z) * N + Math.floor(x);
      if (this.forest[i] < 0.5 || !cellOk(x, z) || hyp(x - L.x, z - L.z) < 15 || !clearOf(x, z, 1.5)) continue;
      const len = r.range(3, 6.2), rad = r.range(0.2, 0.42), yaw = r.range(0, Math.PI * 2), c = Math.cos(yaw), sn = Math.sin(yaw);
      const ax = x - c * len * 0.5, az = z - sn * len * 0.5, bx = x + c * len * 0.5, bz = z + sn * len * 0.5;
      if (!cellOk(ax, az) || !cellOk(bx, bz)) continue;
      const ga = g0(ax, az), gb = g0(bx, bz), gm = g0(x, z);
      if (Math.abs(ga - gb) > len * 0.45) continue;
      this.rocks.push({ kind: 'log', mat: RockMat.WOOD, x, y: Math.min(gm, (ga + gb) / 2) - rad * 0.35, z, sx: len / 2, sy: rad, sz: rad, yaw, tilt: Math.atan2(Math.abs(ga - gb), len), tiltDir: gb < ga ? yaw : yaw + Math.PI, seed: r.int(1, 1e9), moss: clamp(moss0 + 0.25, 0, 1), wet: 0 });
      made++;
    }
    for (let t = 0, made = 0; t < nStumps * 10 && made < nStumps; t++) {
      const x = r.range(4, N - 4), z = r.range(4, N - 4), i = Math.floor(z) * N + Math.floor(x);
      if (this.forest[i] < 0.45 || !cellOk(x, z) || hyp(x - L.x, z - L.z) < 15 || !clearOf(x, z, 1.2)) continue;
      const rad = r.range(0.22, 0.46);
      this.rocks.push({ kind: 'stump', mat: RockMat.WOOD, x, y: g0(x, z) - 0.05, z, sx: rad, sy: r.chance(0.3) ? r.range(0.9, 1.6) : r.range(0.3, 0.7), sz: rad, yaw: r.range(0, 6.28), tilt: r.range(0, 0.08), tiltDir: r.range(0, 6.28), seed: r.int(1, 1e9), moss: clamp(moss0 + 0.2, 0, 1), wet: 0 });
      made++;
    }
    // the ground answers: solid under big pieces (lifted so walkers go round), bare rock and scree around them
    const rockB = mat === RockMat.BASALT ? B.BASALT : B.ROCK;
    for (const p of this.rocks) {
      if (p.kind === 'pebble' || p.kind === 'river' || p.kind === 'log' || p.kind === 'stump') continue;
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      const feet: [number, number, number, number][] = p.kind === 'arch' ? [[-p.sx, 0, p.sz * 1.1, p.sz * 1.1], [p.sx, 0, p.sz * 1.1, p.sz * 1.1]] : [[0, 0, p.sx, p.sz]];
      const lift = Math.min(1.8, p.sy * (p.kind === 'slab' ? 0.75 : 0.62));
      for (const [fx, fz, rx, rz] of feet) {
        const cx = p.x + fx * c - fz * sn, cz = p.z + fx * sn + fz * c;
        const ext = Math.ceil(Math.max(rx, rz) + 2);
        for (let z = Math.floor(cz) - ext; z <= Math.floor(cz) + ext; z++) for (let x = Math.floor(cx) - ext; x <= Math.floor(cx) + ext; x++) {
          if (!this.inside(x, z)) continue;
          const i = z * N + x;
          // footprint test in the rock's own frame: all four cell corners inside the base ellipse
          const inE = (px: number, pz: number, k: number) => { const dx = px - cx, dz = pz - cz, u = dx * c + dz * sn, v = -dx * sn + dz * c; return (u / (rx * k)) ** 2 + (v / (rz * k)) ** 2 <= 1; };
          const core = inE(x, z, 0.9) && inE(x + 1, z, 0.9) && inE(x, z + 1, 0.9) && inE(x + 1, z + 1, 0.9);
          const centre = (p.kind === 'spire' || p.kind === 'column') && inE(x + 0.5, z + 0.5, 1);
          if (core || centre) {
            this.solid[i] = 1; this.fert[i] = 0;
            if (lift > 0.3) this.h[i] = Math.max(this.h[i], p.y + lift);
            this.b[i] = rockB;
          } else if (inE(x + 0.5, z + 0.5, 1.25 + hash01(x, z, 77) * 0.45) && this.h[i] >= this.water && this.riverY[i] <= 0) {
            // a ragged apron of rubble: grey scree round granite and basalt, mostly sand round sandstone
            const hh = hash01(x, z, 78);
            if (this.b[i] === B.GRASS || this.b[i] === B.DRY || this.b[i] === B.LITTER || this.b[i] === B.SAND) this.b[i] = mat === RockMat.SANDSTONE ? (hh < 0.3 ? B.GRAVEL : B.SAND) : hh < 0.5 ? B.GRAVEL : hh < 0.7 ? rockB : this.b[i];
            this.fert[i] *= 0.6;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ woodland
  private forestField() {
    const N = this.N, n = this.noise, bi = this.biome;
    const fk: Record<string, number> = { meadow: 0.55, jungle: 1, savanna: 0.18, marsh: 0.5, highland: 0.38, tundra: 0.42, desert: 0, crystal: 0.12, ashland: 0.06, coast: 0.42 };
    const k = fk[bi.key] ?? 0.4;
    if (k <= 0) return;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x;
      if (this.h[i] < this.water || this.riverY[i] > 0) continue;
      const v = n.fbm2(x * 0.028 + 500, z * 0.028 - 200, 4) * 0.5 + 0.5 + (this.wet[i] - 0.5) * 0.25;
      const lo = 0.66 - k * 0.3;
      this.forest[i] = smooth(lo, lo + 0.14, v) * (this.h[i] > 10 ? 0.4 : 1);
    }
  }

  /** dampness: near the sea, the rivers and in the mire */
  private dampField() {
    const N = this.N, d = new Float32Array(N * N).fill(99);
    for (let i = 0; i < N * N; i++) if (this.h[i] < this.water || (this.riverY[i] > 0 && this.h[i] < this.riverY[i])) d[i] = 0;
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < N * N; k++) {
      const i = pass ? N * N - 1 - k : k, x = i % N, z = (i / N) | 0, s = pass ? 1 : -1;
      const X = x + s, Z = z + s;
      if (X >= 0 && X < N) d[i] = Math.min(d[i], d[z * N + X] + 1);
      if (Z >= 0 && Z < N) d[i] = Math.min(d[i], d[Z * N + x] + 1);
      if (X >= 0 && X < N && Z >= 0 && Z < N) d[i] = Math.min(d[i], d[Z * N + X] + 1.41);
    }
    for (let i = 0; i < N * N; i++) {
      const lw = this.riverY[i] > 0 ? Math.max(this.riverY[i], this.water) : this.water, above = this.h[i] - lw;
      this.damp[i] = clamp(1 - (d[i] - 0.5) / 2.6, 0, 1) * clamp(1 - above / 1.2, 0, 1) + (this.biome.key === 'marsh' ? this.wet[i] * 0.25 : 0);
      this.damp[i] = clamp(this.damp[i], 0, 1);
    }
  }

  /** each column takes the most common height of its 3x3 block when it disagrees with most neighbours */
  private majority() {
    const N = this.N, h = this.h, out = Float32Array.from(h);
    const cnt = new Map<number, number>();
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      cnt.clear();
      let same = 0;
      const c = h[z * N + x];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const v = h[(z + dz) * N + x + dx];
        cnt.set(v, (cnt.get(v) ?? 0) + 1);
        if (v === c) same++;
      }
      if (same >= 3) continue;
      let best = c, bn = -1;
      for (const [v, k] of cnt) if (k > bn || (k === bn && Math.abs(v - c) < Math.abs(best - c))) { best = v; bn = k; }
      out[z * N + x] = best;
    }
    h.set(out);
  }

  private slope(x: number, z: number) {
    const N = this.N, h = this.h[z * N + x];
    let m = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const X = x + dx, Z = z + dz;
      if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
      m = Math.max(m, Math.abs(this.h[Z * N + X] - h));
    }
    return m;
  }

  private assignBlocks(r: Rand) {
    const N = this.N, bi = this.biome, n = this.noise;
    // distance to water (cheap two-pass chamfer) for beaches and fertility
    const dw = new Float32Array(N * N).fill(1e6);
    for (let i = 0; i < N * N; i++) if (this.h[i] < this.water || (this.riverY[i] > 0 && this.h[i] < this.riverY[i])) dw[i] = 0;
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < N * N; k++) {
      const i = pass ? N * N - 1 - k : k, x = i % N, z = (i / N) | 0, s = pass ? 1 : -1;
      const X = x + s, Z = z + s;
      if (X >= 0 && X < N) dw[i] = Math.min(dw[i], dw[z * N + X] + 1);
      if (Z >= 0 && Z < N) dw[i] = Math.min(dw[i], dw[Z * N + x] + 1);
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, h = this.h[i], ry = this.riverY[i], sl = this.slope(x, z), w = this.wet[i];
      const above = h - (ry > 0 ? Math.max(ry, this.water) : this.water);
      const v = n.fbm2(x * 0.05 + 300, z * 0.05, 3);
      let k: number = B.GRASS;
      if (ry > 0 && above < 0.25) {
        // river bed and its margins: washed gravel in the current, sand and silt in the slack water, mud in the mire
        const fine = n.fbm2(x * 0.12 + 40, z * 0.12, 2) + (above < -0.25 ? -0.25 : 0.1);
        k = bi.key === 'marsh' ? (fine > 0 ? B.MUD : B.GRAVEL) : fine > 0.15 ? B.SAND : fine > -0.35 ? B.GRAVEL : B.MUD;
      } else if (above < 0) k = bi.key === 'marsh' ? (v > 0 ? B.MUD : B.SAND) : (v > 0.35 ? B.GRAVEL : B.SAND);
      else if (above < 0.8 && dw[i] < 3 && ry <= 0) k = bi.key === 'marsh' ? B.MUD : B.SAND;
      else if (ry > 0 && above < 0.7 && n.fbm2(x * 0.2, z * 0.2 + 70, 2) > 0.1) k = bi.key === 'desert' ? B.SAND : B.MUD;
      else if (sl >= 0.95) k = bi.key === 'ashland' ? B.BASALT : B.ROCK;
      else if (bi.key === 'desert') k = v > 0.45 ? B.ROCK : B.SAND;
      else if (bi.key === 'tundra') k = h > 7 || v > 0.2 ? B.SNOW : (v > -0.2 ? B.GRASS : B.GRAVEL);
      else if (bi.key === 'ashland') k = v > 0.15 ? B.BASALT : (v > -0.2 ? B.DRY : B.GRAVEL);
      else if (bi.key === 'crystal') k = v > 0.4 ? B.ROCK : (v > 0.1 ? B.GRAVEL : B.DRY);
      else if (bi.key === 'savanna') k = w < 0.42 ? B.DRY : B.GRASS;
      else if (bi.key === 'marsh') k = w > 0.85 && v > 0.1 ? B.MUD : B.GRASS;
      else if (h > 9.5) k = h > 11 && bi.temp < 0.5 ? B.SNOW : B.ROCK;
      else k = w < 0.3 ? B.DRY : B.GRASS;
      if (k === B.GRASS && v < -0.5 && dw[i] < 12) k = B.CLAY;
      // woodland floor: leaf litter under the canopy, frayed at the edges
      if ((k === B.GRASS || k === B.DRY) && this.forest[i] > 0.55 + (hash01(x, z, 41) - 0.5) * 0.22 + n.n2(x * 0.3, z * 0.3) * 0.08) k = B.LITTER;
      this.b[i] = k;
      // fertility: wet, near water, gentle slopes, not rock
      const soil = k === B.GRASS ? 1 : k === B.DRY ? 0.55 : k === B.MUD ? 0.7 : k === B.LITTER ? 1 : k === B.SAND ? 0.25 : k === B.SNOW ? 0.12 : k === B.CLAY ? 0.4 : 0.15;
      this.fert[i] = above < 0 ? 0 : clamp(soil * (0.45 + w * 0.6) * (1 - sl * 0.18) + clamp(1 - dw[i] / 14, 0, 1) * 0.25 + this.forest[i] * 0.15, 0, 1);
    }
  }

  private pickLanding(r: Rand) {
    const N = this.N;
    let best = -1e9;
    for (let t = 0; t < 400; t++) {
      const x = r.int(Math.floor(N * 0.3), Math.floor(N * 0.7)), z = r.int(Math.floor(N * 0.3), Math.floor(N * 0.7));
      // flat, dry, not too high
      let s = 0, lo = 1e9, hi = -1e9;
      for (let dz = -6; dz <= 6; dz += 2) for (let dx = -6; dx <= 6; dx += 2) {
        const h = this.heightAt(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h);
        if (h < this.water + 0.5) s -= 6;
      }
      s -= (hi - lo) * 3 + hyp(x - N / 2, z - N / 2) * 0.05;
      if (s > best) { best = s; this.landing = { x: x + 0.5, z: z + 0.5 }; }
    }
  }

  private placeDeposits(r: Rand) {
    const N = this.N, bi = this.biome;
    const want = 7 + (bi.key === 'highland' || bi.key === 'crystal' ? 4 : 0);
    for (let t = 0, made = 0; t < 600 && made < want; t++) {
      const x = r.int(6, N - 7), z = r.int(6, N - 7);
      if (this.h[z * N + x] < this.water + 0.5 || this.riverY[z * N + x] > 0) continue;
      if (hyp(x - this.landing.x, z - this.landing.z) < (made < 2 ? 12 : 18)) continue;
      let blocked = false;
      for (let dz = -4; dz <= 4 && !blocked; dz++) for (let dx = -4; dx <= 4; dx++) if (this.inside(x + dx, z + dz) && this.solid[(z + dz) * N + x + dx]) { blocked = true; break; }
      if (blocked) continue;
      if (made < 2 && hyp(x - this.landing.x, z - this.landing.z) > 30) continue; // two starter seams nearby
      if (this.deposits.some((d) => hyp(d.x - x, d.z - z) < 14)) continue;
      const kind: Deposit['kind'] = bi.key === 'crystal' ? (r.chance(0.6) ? 'crystal' : 'ore') : r.chance(0.22) ? 'crystal' : 'ore';
      const rad = r.range(1.6, 2.8);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const d = hyp(dx, dz) + hash01(x + dx, z + dz, 5) * 0.8;
        if (d <= rad && this.inside(x + dx, z + dz) && this.h[(z + dz) * N + x + dx] >= this.water) this.b[(z + dz) * N + x + dx] = kind === 'ore' ? B.ORE : B.CRYSTAL;
      }
      this.deposits.push({ x: x + 0.5, z: z + 0.5, kind, amount: kind === 'ore' ? 1600 : 1100, r: rad });
      made++;
    }
  }

  /** animal trails: winding dirt paths between far edges of the map, skirting water */
  readonly path = new Uint8Array(0);
  private trails(r: Rand) {
    const N = this.N, n = this.noise;
    const count = 2 + (this.biome.fauna > 1 ? 1 : 0);
    for (let k = 0; k < count; k++) {
      const side = r.int(0, 3);
      let x = side === 0 ? 1 : side === 1 ? N - 2 : r.range(10, N - 10), z = side === 2 ? 1 : side === 3 ? N - 2 : r.range(10, N - 10);
      const tx = N - x + r.range(-25, 25), tz = N - z + r.range(-25, 25);
      let a = Math.atan2(tz - z, tx - x);
      for (let step = 0; step < 900; step++) {
        const want = Math.atan2(tz - z, tx - x);
        a += clamp(((want - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -0.08, 0.08) * 0.6 + n.n2(x * 0.05 + k * 10, z * 0.05) * 0.12;
        // avoid water: bend away
        if (this.isWater(x + Math.cos(a) * 3, z + Math.sin(a) * 3)) a += 0.35;
        x += Math.cos(a) * 0.5; z += Math.sin(a) * 0.5;
        if (x < 1 || z < 1 || x > N - 2 || z > N - 2) break;
        const w = 0.55 + n.n2(x * 0.1, z * 0.1) * 0.25;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const X = Math.floor(x) + dx, Z = Math.floor(z) + dz;
          if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
          const i = Z * N + X;
          if (hyp(X + 0.5 - x, Z + 0.5 - z) < w + 0.35 && this.h[i] >= this.water + 0.15 && this.b[i] !== B.ROCK) { this.b[i] = B.SOIL; this.fert[i] *= 0.35; }
        }
        if (hyp(tx - x, tz - z) < 2) break;
      }
    }
  }

  /** the child's earth-shaping: lift (amt > 0) or sink (amt < 0) a smooth mound or hollow. Raw soil and rock
   *  show where the ground tore; sunk ground under the water line turns to mud and floods. */
  shape(cx: number, cz: number, R: number, amt: number) {
    const N = this.N, ext = Math.ceil(R);
    for (let z = Math.floor(cz) - ext; z <= Math.floor(cz) + ext; z++) for (let x = Math.floor(cx) - ext; x <= Math.floor(cx) + ext; x++) {
      if (!this.inside(x, z)) continue;
      const d = hyp(x + 0.5 - cx, z + 0.5 - cz) / R;
      if (d >= 1) continue;
      const f = (1 - d * d) ** 2, i = z * N + x;
      this.h[i] = Math.min(16, Math.max(0.6, this.h[i] + amt * f));
      if (amt > 0 && f > 0.25) this.b[i] = f > 0.62 && hash01(x, z, 5) < 0.7 ? B.ROCK : f > 0.4 ? B.GRAVEL : B.SOIL;
      if (amt < 0 && f > 0.3) this.b[i] = this.h[i] < this.water + 0.3 ? B.MUD : B.SOIL;
      this.fert[i] *= 1 - f * 0.4;
      this.dirty.add(i);
    }
  }
  /** an impact crater: bowl with a raised, glassy rim. Marks touched columns dirty. */
  carveCrater(cx: number, cz: number, R: number, depth: number) {
    const N = this.N, r = new Rand(this.seed + 77);
    const center = this.heightAt(cx, cz);
    const ext = Math.ceil(R * 1.8);
    for (let z = Math.floor(cz) - ext; z <= Math.floor(cz) + ext; z++) for (let x = Math.floor(cx) - ext; x <= Math.floor(cx) + ext; x++) {
      if (!this.inside(x, z)) continue;
      const d = hyp(x + 0.5 - cx, z + 0.5 - cz) / R + (hash01(x, z, 9) - 0.5) * 0.12;
      const i = z * N + x;
      let target = this.h[i];
      if (d < 1) target = Math.max(this.water + 0.75, center - depth * (1 - d * d) + 0.6 * smooth(0.7, 1, d));
      else if (d < 1.6) target = Math.max(this.h[i], center + 0.9 * (1 - smooth(1, 1.6, d)) + (this.h[i] - center) * smooth(1, 1.6, d));
      else continue;
      this.h[i] = Math.max(1.5, target);
      if (d < 1.15) this.b[i] = B.CRATER;
      else if (d < 1.4 && r.chance(0.5)) this.b[i] = B.GRAVEL;
      this.fert[i] = d < 1.2 ? 0 : this.fert[i] * 0.5;
      this.dirty.add(i);
    }
  }
}

class MinHeap {
  private a: number[] = [];
  constructor(private f: Float32Array) {}
  get size() { return this.a.length; }
  push(i: number) { const a = this.a; a.push(i); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (this.f[a[p]] <= this.f[a[k]]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } }
  pop(): number {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) { a[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l; if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } }
    return top;
  }
}
