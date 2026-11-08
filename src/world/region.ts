// One playable region of a planet: an N x N grid of 1 m columns with heights in 0.5 m steps.
import { Noise } from '../core/noise';
import { Rand, clamp, smooth, hash01 } from '../core/rand';
import { B } from './blockTex';
import type { Palette } from './palette';

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

  constructor(readonly seed: number, readonly biome: Biome, readonly pal: Palette, N = 128) {
    this.N = N;
    this.h = new Float32Array(N * N); this.b = new Uint8Array(N * N);
    this.wet = new Float32Array(N * N); this.fert = new Float32Array(N * N);
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
  isWater(x: number, z: number) { return this.heightAt(x, z) < this.water; }
  surfaceY(x: number, z: number) { return Math.max(this.heightAt(x, z), this.water - 0.15); }

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
      // winding rivers in wetter biomes
      if (bi.moist > 0.45) {
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
    this.assignBlocks(r);
    this.trails(r);
    this.placeDeposits(r);
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
    for (let i = 0; i < N * N; i++) if (this.h[i] < this.water) dw[i] = 0;
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < N * N; k++) {
      const i = pass ? N * N - 1 - k : k, x = i % N, z = (i / N) | 0, s = pass ? 1 : -1;
      const X = x + s, Z = z + s;
      if (X >= 0 && X < N) dw[i] = Math.min(dw[i], dw[z * N + X] + 1);
      if (Z >= 0 && Z < N) dw[i] = Math.min(dw[i], dw[Z * N + x] + 1);
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, h = this.h[i], above = h - this.water, sl = this.slope(x, z), w = this.wet[i];
      const v = n.fbm2(x * 0.05 + 300, z * 0.05, 3);
      let k: number = B.GRASS;
      if (above < 0) k = bi.key === 'marsh' ? (v > 0 ? B.MUD : B.SAND) : (v > 0.35 ? B.GRAVEL : B.SAND);
      else if (above < 0.8 && dw[i] < 3) k = bi.key === 'marsh' ? B.MUD : B.SAND;
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
      this.b[i] = k;
      // fertility: wet, near water, gentle slopes, not rock
      const soil = k === B.GRASS ? 1 : k === B.DRY ? 0.55 : k === B.MUD ? 0.7 : k === B.LITTER ? 1 : k === B.SAND ? 0.25 : k === B.SNOW ? 0.12 : k === B.CLAY ? 0.4 : 0.15;
      this.fert[i] = above < 0 ? 0 : clamp(soil * (0.45 + w * 0.6) * (1 - sl * 0.18) + clamp(1 - dw[i] / 14, 0, 1) * 0.25, 0, 1);
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
      s -= (hi - lo) * 3 + Math.hypot(x - N / 2, z - N / 2) * 0.05;
      if (s > best) { best = s; this.landing = { x: x + 0.5, z: z + 0.5 }; }
    }
  }

  private placeDeposits(r: Rand) {
    const N = this.N, bi = this.biome;
    const want = 7 + (bi.key === 'highland' || bi.key === 'crystal' ? 4 : 0);
    for (let t = 0, made = 0; t < 600 && made < want; t++) {
      const x = r.int(6, N - 7), z = r.int(6, N - 7);
      if (this.h[z * N + x] < this.water + 0.5) continue;
      if (Math.hypot(x - this.landing.x, z - this.landing.z) < (made < 2 ? 12 : 18)) continue;
      if (made < 2 && Math.hypot(x - this.landing.x, z - this.landing.z) > 30) continue; // two starter seams nearby
      if (this.deposits.some((d) => Math.hypot(d.x - x, d.z - z) < 14)) continue;
      const kind: Deposit['kind'] = bi.key === 'crystal' ? (r.chance(0.6) ? 'crystal' : 'ore') : r.chance(0.22) ? 'crystal' : 'ore';
      const rad = r.range(1.6, 2.8);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dz) + hash01(x + dx, z + dz, 5) * 0.8;
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
          if (Math.hypot(X + 0.5 - x, Z + 0.5 - z) < w + 0.35 && this.h[i] >= this.water + 0.15 && this.b[i] !== B.ROCK) { this.b[i] = B.SOIL; this.fert[i] *= 0.35; }
        }
        if (Math.hypot(tx - x, tz - z) < 2) break;
      }
    }
  }

  /** an impact crater: bowl with a raised, glassy rim. Marks touched columns dirty. */
  carveCrater(cx: number, cz: number, R: number, depth: number) {
    const N = this.N, r = new Rand(this.seed + 77);
    const center = this.heightAt(cx, cz);
    const ext = Math.ceil(R * 1.8);
    for (let z = Math.floor(cz) - ext; z <= Math.floor(cz) + ext; z++) for (let x = Math.floor(cx) - ext; x <= Math.floor(cx) + ext; x++) {
      if (!this.inside(x, z)) continue;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / R + (hash01(x, z, 9) - 0.5) * 0.12;
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
