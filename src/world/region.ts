// One playable region of a planet: an N x N grid of 1 m columns (N = 160 on land, 128 at sea).
// Generation (land): rolling ground, then MOUNTAIN RANGES raised along wandering ridgelines with saddles (geo/ranges),
// worn by hydraulic and thermal erosion (geo/erosion), their cores stepped into strata benches with cliff risers so
// they cannot be climbed, PASSES graded through the saddles valley to valley; the landing goes in the big valley.
// Then the WATER network (geo/hydro: rivers from mountain sources with rapids and waterfalls, plunge pools, tarns,
// valley lakes, streams, deltas and marsh pools), a THERMAL field of terraced hot springs and geysers in the hot and
// volcanic country (geo/springs), the blocks, the rock FORMATIONS (geo/formations), reach, the ORES (geo/ores:
// outcrops, cliff veins, buried bodies, rare alien ores) and the per-cell geology map `geo` for the ground shader.
// Ocean biomes (src/ocean) redraw the relief as islands (oceanFloor) and dress the sea bed (seabed).
import { Noise } from '../core/noise';
import { Rand, clamp, smooth, hash01 } from '../core/rand';
import { B } from './blockTex';
import type { Palette } from './palette';
import { planRanges, raiseRanges, passSites, passRoute, strata, gradePass, polyNear, type Spine, type Pass, type P2 } from './geo/ranges';
import { hydraulic, thermal } from './geo/erosion';
import { buildWater } from './geo/hydro';
import { thermalField } from './geo/springs';
import { fillFamilies, fillWater, placeOres, scanReveal, type OreId } from './geo/ores';
import { formations } from './geo/formations';
export type { Spine, Pass } from './geo/ranges';
export type { OreId } from './geo/ores';
export { ORES, ORE_BY_GEO } from './geo/ores';
export { geyserState } from './geo/springs';

/** sqrt-based length (Math.hypot is several times slower in the hot loops) */
const hyp = (a: number, b: number, c = 0) => Math.sqrt(a * a + b * b + c * c);
export type BiomeKey = 'meadow' | 'jungle' | 'savanna' | 'marsh' | 'highland' | 'tundra' | 'desert' | 'crystal' | 'ashland' | 'coast' | 'archipelago' | 'reef' | 'ocean';
export interface Biome {
  key: BiomeKey; name: string;
  temp: number; moist: number; rough: number; water: number; terrace: number;
  /** flora density multiplier, fauna richness */
  flora: number; fauna: number;
  /** ocean regions (src/ocean): the share of the map under the sea; the relief is redrawn as islands and sea floor
   *  by Region.oceanFloor and the bed is dressed by Region.seabed */
  sea?: number;
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
  // ocean regions (src/ocean): mostly sea, the land is islands
  archipelago: { key: 'archipelago', name: 'Archipelago', temp: 0.72, moist: 0.75, rough: 0.45, water: 0.6, terrace: 0.3, flora: 1.1, fauna: 0.8, sea: 0.68 },
  reef: { key: 'reef', name: 'Coral Shallows', temp: 0.82, moist: 0.7, rough: 0.2, water: 0.6, terrace: 0.2, flora: 0.9, fauna: 0.6, sea: 0.85 },
  ocean: { key: 'ocean', name: 'Open Sea', temp: 0.6, moist: 0.7, rough: 0.5, water: 0.6, terrace: 0.3, flora: 0.8, fauna: 0.5, sea: 0.9 },
};

/** strata riser height in the ranges (m) */
const RISER: Partial<Record<BiomeKey, number>> = { highland: 3.2, tundra: 2.8, meadow: 2.6, jungle: 2.4, crystal: 3, ashland: 3, coast: 2.6, savanna: 2.4, desert: 2.8 };
/** rolling hills per biome (m of middle-octave swell) */
const HILLS: Partial<Record<BiomeKey, number>> = { meadow: 2.4, savanna: 1.6, jungle: 1.8, coast: 1.1, marsh: 0.3, tundra: 1.4, highland: 1.8, desert: 0.8, crystal: 1.1, ashland: 1.2 };
/** the big landforms per biome: rim ranges (m), foothills (m), escarpment bench height (m, 0 none), mesa height (m) */
const RELIEF: Record<string, { range: number; foot: number; terrace: number; mesa: number }> = {
  meadow: { range: 15, foot: 4, terrace: 0, mesa: 0 }, jungle: { range: 17, foot: 5, terrace: 0, mesa: 0 },
  savanna: { range: 9, foot: 3, terrace: 2.6, mesa: 0 }, marsh: { range: 4, foot: 1, terrace: 0, mesa: 0 },
  highland: { range: 30, foot: 9, terrace: 3.2, mesa: 0 }, tundra: { range: 22, foot: 6, terrace: 0, mesa: 0 },
  desert: { range: 12, foot: 4, terrace: 0, mesa: 7.5 }, crystal: { range: 18, foot: 6, terrace: 2.6, mesa: 0 },
  ashland: { range: 20, foot: 6, terrace: 3.2, mesa: 0 }, coast: { range: 10, foot: 3, terrace: 0, mesa: 0 },
};

/**
 * A resource body. `kind` is the old two-way split every consumer understands ('ore' metal / coal / sulphur /
 * gravium, 'crystal' quartz / lumen); `ore` and `item` say exactly what it is and what a miner yields (the factory
 * item id). `amount` depletes from `max` (set by `richness`). Styles: 'outcrop' (a seam on open ground ringed by ore
 * nodes), 'vein' (at the foot of a cliff banded with ore; `face` points at the cliff), 'buried' (hidden until a scan,
 * drill-tier only: region.buried, region.scan), 'rare' (lumen, gravium: high-tier, in a dangerous place, `danger`).
 */
export interface Deposit {
  x: number; z: number; kind: 'ore' | 'crystal'; amount: number; r: number;
  ore?: OreId; item?: string; style?: 'outcrop' | 'vein' | 'buried' | 'rare';
  max?: number; richness?: number;
  /** 0 any miner, 1 drill-tier, 2 rare (high-tier recipes) */
  tier?: number;
  hidden?: boolean; drill?: boolean; depth?: number;
  face?: [number, number]; danger?: string;
}
/** a sample along a river's centre line: position, water surface height, half width, arc length, flow speed;
 *  rapid 0..1 white water, drop metres of fall over the next metre (at a waterfall) */
export interface RiverPt { x: number; z: number; y: number; w: number; s: number; v: number; rapid?: number; drop?: number }
/** a lake: its water level and outline (x, z), centre and rough radius; tarns sit high in the ranges */
export interface Lake { level: number; poly: [number, number][]; kind?: 'fresh' | 'marsh' | 'mineral'; x: number; z: number; r: number; tarn?: boolean; cells?: number }
/** a waterfall: lip centre at height top, falling to the pool surface at bottom, width w, unit flow direction */
export interface Fall { x: number; z: number; top: number; bottom: number; w: number; dir: [number, number] }
/** a thermal spring: pool centre, radius, water level; geysers erupt on their timer (geo/springs.ts geyserState):
 *  every `period` s from `phase` (0..1), for `dur` s, a column `jet` m tall */
export interface Spring {
  x: number; z: number; r: number; level: number; kind: 'hot' | 'mineral' | 'geyser'; hue?: 'turquoise' | 'ochre' | 'rust' | 'green';
  period?: number; phase?: number; dur?: number; jet?: number;
}
/** rock families: granite (meadow, forest, tundra), sandstone (desert, savanna), basalt (ash), limestone (jungle,
 *  crystal), slate (the ranges' flanks), tuff (volcanic ash beds) */
export const enum RockMat { GRANITE, SANDSTONE, BASALT, LIMESTONE, WOOD, SLATE, TUFF }
export type RockKind = 'boulder' | 'slab' | 'spire' | 'column' | 'arch' | 'pebble' | 'river' | 'log' | 'stump'
  | 'node' | 'crystal' | 'floater' | 'cave' | 'overhang';
/** one sculpted rock: base centre on the ground (x, y, z), size, yaw and a tilt of its up axis. Ore nodes, crystals
 *  and floaters carry the ore they show (geo B id, `oreId`), `glow` (lumen, gravium) and `float` (gravium bob, m) */
export interface RockPiece {
  kind: RockKind; mat: RockMat; x: number; y: number; z: number; sx: number; sy: number; sz: number;
  yaw: number; tilt: number; tiltDir: number; seed: number; moss: number; wet: number;
  ore?: number; oreId?: OreId; glow?: number; float?: number; hue?: 'quartz' | 'amethyst' | 'sapphire';
  fam?: 'hoodoo' | 'pillar' | 'stack';
}
/** land regions are larger than sea ones: room for ranges, valleys and passes */
export const LAND_N = 160;

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
  /** columns a walker (0.75 m climb) can reach from the landing over dry land and wadeable rivers (1) or not (0) */
  reach: Uint8Array = new Uint8Array(0);

  // ---------------------------------------------------------------- geology (src/world/geo)
  /** mountain mask 0 (lowland) .. 1 (the core of a range: stepped cliffs, not walkable) */
  readonly mount: Float32Array;
  /** pass corridors: 2 the graded road bed, 1 the notch walls beside it */
  readonly passMask: Uint8Array;
  /** the graded passes over the ranges: saddle point and road height, the road's centre line, its half-width */
  passes: Pass[] = [];
  /** the ranges' ridgelines (the deploy scan and the far landscape can draw them) */
  spines: Spine[] = [];
  /** columns on the far side of the main range from the landing (reachable only over a pass) */
  farSide: Uint8Array | null = null;
  /** lakes (tarns, valley lakes, plunge pools, marsh pools): their cells carry riverY = level, so isWater sees them */
  lakes: Lake[] = [];
  /** waterfalls (lip, drop, width, flow direction) */
  falls: Fall[] = [];
  /** hot springs, mineral pools and geysers (their pools carry riverY = level) */
  springs: Spring[] = [];
  /** steam vents in a thermal field */
  vents: { x: number; z: number; y: number; k: number }[] = [];
  /** the thermal field, if the region has one */
  thermal: { x: number; z: number; r: number } | null = null;
  /** buried deposits a scan has not found yet (scan() moves them into deposits) */
  buried: Deposit[] = [];
  /** listeners told when a scan reveals a deposit (its index in deposits) */
  onDeposit: ((d: Deposit, index: number) => void)[] = [];
  /** ore bands painted into cliffs (deposit: its index in deposits, or -1 for out-of-reach veins) */
  veins: { x: number; z: number; r: number; ore: OreId; deposit: number }[] = [];
  /** roosts under rock overhangs: the sheltered point (x, z), the underside's height, the open direction */
  overhangs: { x: number; z: number; y: number; dir: [number, number] }[] = [];
  /** cave mouths (visual): the mouth's foot, the direction it opens toward, its half-width */
  caves: { x: number; z: number; y: number; dir: [number, number]; r: number }[] = [];
  /** dangerous places (thermal fields, cliff ledges, the far side): for the deploy scan and for den placement */
  dangers: { x: number; z: number; r: number; kind: string; why?: string }[] = [];
  /** per cell RGBA for the ground shader: R rock family, G vein strength, B ore kind, A spray / spring crust
   *  (geo/ores.ts has the encoding); terrain.ts picks it up when it is built */
  readonly geo: Uint8Array;

  constructor(readonly seed: number, readonly biome: Biome, readonly pal: Palette, N = biome.sea ? 128 : LAND_N) {
    this.N = N;
    this.h = new Float32Array(N * N); this.b = new Uint8Array(N * N);
    this.wet = new Float32Array(N * N); this.fert = new Float32Array(N * N);
    this.riverY = new Float32Array(N * N); this.forest = new Float32Array(N * N); this.damp = new Float32Array(N * N); this.solid = new Uint8Array(N * N);
    this.mount = new Float32Array(N * N); this.passMask = new Uint8Array(N * N); this.geo = new Uint8Array(N * N * 4);
    this.noise = new Noise(seed);
    this.generate();
    // too much of the open land walled off: try again with gentler relief
    if (this.openShare() < 0.6) { this.resetFields(); this.generate(0.7); }
    if (this.openShare() < 0.6) { this.resetFields(); this.generate(0.35); }
  }
  private resetFields() {
    this.h.fill(0); this.b.fill(0); this.wet.fill(0); this.fert.fill(0); this.riverY.fill(0); this.forest.fill(0); this.damp.fill(0); this.solid.fill(0);
    this.mount.fill(0); this.passMask.fill(0); this.geo.fill(0);
    this.deposits = []; this.rivers = []; this.rocks = []; this.dirty.clear();
    this.passes = []; this.spines = []; this.farSide = null; this.lakes = []; this.falls = []; this.springs = []; this.vents = []; this.thermal = null;
    this.buried = []; this.veins = []; this.overhangs = []; this.caves = []; this.dangers = []; this.isles = []; this.lagoon = null;
  }
  /** reveal buried deposits within rad of (x, z): a scan. Returns the indices of the deposits found (appended) */
  scan(x: number, z: number, rad: number): number[] { return scanReveal(this, x, z, rad); }
  /** the deposit under a point (index into deposits), or -1 */
  depositAt(x: number, z: number, pad = 0.5): number { return this.deposits.findIndex((d) => d.amount > 0 && hyp(d.x - x, d.z - z) < d.r + pad); }

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

  private generate(reliefK = 1) {
    const N = this.N, bi = this.biome, n = this.noise, r = new Rand(this.seed);
    const H = new Float32Array(N * N);
    const ox = r.range(0, 1000), oz = r.range(0, 1000);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const X = x + ox, Z = z + oz;
      // low, rolling relief: broad swells, a few soft hills, a little grain
      let v = n.fbm2(X * 0.008, Z * 0.008, 5) * (1.4 + bi.rough * 2.6);
      v += Math.pow(n.ridge2(X * 0.013, Z * 0.013, 4), 1.6) * bi.rough * 5.5;
      v += n.fbm2(X * 0.035, Z * 0.035, 2) * 0.22;
      // rolling hills: a middle octave that gives meadows and savanna their swells
      v += n.fbm2(X * 0.021 + 210, Z * 0.021 - 90, 3) * (HILLS[bi.key] ?? 1) * reliefK;
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
    // the ranges go on after the blur so crests stay sharp, then rain and frost wear them into valleys and scree
    const land = !bi.sea;
    if (land) {
      // the low ground (the future sea) pulls the ranges to the far side of the map
      let sx = 0, sz = 0, sn = 0;
      for (let z = 0; z < N; z += 2) for (let x = 0; x < N; x += 2) if (S[z * N + x] < 4) { sx += x; sz += z; sn++; }
      const sea: [number, number] | null = sn > (N * N) / 400 ? [sx / sn, sz / sn] : null;
      const plan = planRanges(N, bi.key, new Rand(this.seed ^ 0x3a77), n, sea);
      this.spines = plan.spines; this.hint = plan.hint;
      raiseRanges(S, this.mount, N, this.spines, n, reliefK, 4);
      const t0 = performance.now();
      const rain = new Float32Array(N * N), soft = new Float32Array(N * N), talus = new Float32Array(N * N);
      for (let i = 0; i < N * N; i++) { const m = this.mount[i]; rain[i] = 0.25 + m * 2.2; soft[i] = 1 - m * 0.55; talus[i] = 0.95 + m * 0.3; }
      hydraulic(S, N, new Rand(this.seed ^ 0xe40), { drops: Math.round(N * N * 1.1), rain, soft, capacity: 2.2, erode: 0.22, deposit: 0.25, maxStep: 0.12, life: 44 });
      thermal(S, N, 24, talus, 0.35);
      this.erodeMs = performance.now() - t0;
    }
    this.relief(S, ox, oz, reliefK);
    for (let i = 0; i < N * N; i++) this.h[i] = Math.max(1.5, S[i]);
    this.water = 3.9;
    if (bi.sea) this.oceanFloor(new Rand(this.seed ^ 0x0cea));
    // the passes: their routes first (so the strata leave them be), the roads graded once the land is final
    const routes: P2[][] = [];
    if (land && this.spines.length) {
      const keep = new Uint8Array(N * N);
      for (const ps of passSites(this.spines, N)) {
        const P = passRoute(this.h, this.mount, N, ps, 6);
        if (P.length < 8) continue;
        routes.push(P);
        let x0 = N, z0 = N, x1 = 0, z1 = 0;
        for (const [px, pz] of P) { x0 = Math.min(x0, px); z0 = Math.min(z0, pz); x1 = Math.max(x1, px); z1 = Math.max(z1, pz); }
        for (let z = Math.max(0, Math.floor(z0 - 10)); z < Math.min(N, Math.ceil(z1 + 10)); z++) for (let x = Math.max(0, Math.floor(x0 - 10)); x < Math.min(N, Math.ceil(x1 + 10)); x++) if (this.mount[z * N + x] > 0.15 && polyNear(P, x + 0.5, z + 0.5)[0] < 9) keep[z * N + x] = 1;
      }
      strata(this.h, this.mount, N, n, RISER[bi.key] ?? 2.8, 4, keep);
    }
    this.pickLanding(r);
    this.landingPad();
    for (const P of routes) {
      const y = gradePass(this.h, N, P, 2.6, 0.42, this.passMask);
      const mid = P[Math.floor(P.length / 2)];
      let best = mid, bd = -1;
      for (const p of P) { const i = Math.floor(p[1]) * N + Math.floor(p[0]); if (this.mount[i] > bd) { bd = this.mount[i]; best = p; } }
      this.passes.push({ x: best[0], z: best[1], y, path: P, w: 2.6 });
    }
    if (land && this.spines.length) this.sides();
    buildWater(this, new Rand(this.seed ^ 0x51ae));
    if (land) thermalField(this, new Rand(this.seed ^ 0x7e57));
    this.forestField();
    fillFamilies(this);
    this.assignBlocks(r);
    this.trails(r);
    formations(this, new Rand(this.seed ^ 0x70c5));
    this.computeReach();
    placeOres(this, new Rand(this.seed ^ 0x0e5));
    fillWater(this);
    this.dampField();
    if (bi.sea) this.seabed(new Rand(this.seed ^ 0x5eab));
  }
  /** where the landing should go (the middle of the big valley), from the range plan */
  private hint: [number, number] | null = null;
  /** how long erosion took (ms) */
  erodeMs = 0;
  /** which side of the main range each column lies (farSide: the side away from the landing) */
  private sides() {
    const N = this.N, sp = this.spines.find((s) => s.kind === 'main') ?? this.spines[0], L = this.landing;
    const side = (x: number, z: number) => {
      let bd = 1e9, sg = 0;
      for (let i = 0; i < sp.pts.length - 1; i++) {
        const a = sp.pts[i], b = sp.pts[i + 1], ex = b[0] - a[0], ez = b[1] - a[1];
        const t = clamp(((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1), 0, 1);
        const d = hyp(x - a[0] - ex * t, z - a[1] - ez * t);
        if (d < bd) { bd = d; sg = Math.sign(ex * (z - a[1]) - ez * (x - a[0])); }
      }
      return sg;
    };
    const home = side(L.x, L.z), out = new Uint8Array(N * N);
    for (let z = 0; z < N; z += 2) for (let x = 0; x < N; x += 2) {
      const f = side(x + 1, z + 1) !== home ? 1 : 0;
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) if (x + dx < N && z + dz < N) out[(z + dz) * N + x + dx] = f;
    }
    this.farSide = out;
  }
  /** the share of the open land (outside the ranges, dry) a walker can reach from the landing */
  openShare() {
    let land = 0, got = 0;
    for (let i = 0; i < this.N * this.N; i++) if (this.h[i] >= this.water && this.mount[i] < 0.3 && this.riverY[i] <= 0) { land++; if (this.reach[i]) got++; }
    return land ? got / land : 1;
  }

  // ------------------------------------------------------------------------------------------------ landforms
  /**
   * Relief over the rolling base (water line ~4 m): mountain ranges along some sides of the map rising to the rim, their
   * foothills reaching inward, escarpments (terraced benches with cliff risers, broken by ramps and passes) in the
   * high and dry country, flat-topped mesas in the desert, and a coastal shelf (a flat beach, then a drop-off under the
   * water). The middle of the map, where the landing goes, stays rolling and walkable.
   */
  private relief(S: Float32Array, ox: number, oz: number, k: number) {
    const N = this.N, bi = this.biome, n = this.noise, K = RELIEF[bi.key] ?? RELIEF.meadow, c = N / 2;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, X = x + ox, Z = z + oz;
      let v = S[i];
      const e = Math.min(x, z, N - 1 - x, N - 1 - z), dc = hyp(x - c, z - c);
      // which sides carry a range (a slow field), and how close to the rim
      const side = n.fbm2(X * 0.011 + 700, Z * 0.011 - 300, 2) * 0.5 + 0.5;
      const ranged = this.spines.length > 0, m = this.mount[i];
      const rim = ranged ? 0 : smooth(32, 2, e) * smooth(0.32, 0.58, side);
      if (rim > 0 && K.range) {
        const rdg = Math.pow(n.ridge2(X * 0.026, Z * 0.026, 4), 1.9);
        v += K.range * k * rim * (0.35 + 0.65 * rdg) * (0.8 + n.fbm2(X * 0.05, Z * 0.05, 2) * 0.35);
      }
      // foothills: ridged spurs running in from the ranges
      const foot = ranged ? 0 : smooth(48, 12, e) * smooth(0.22, 0.5, side);
      if (foot > 0 && K.foot) v += K.foot * k * foot * Math.pow(n.ridge2(X * 0.047 + 33, Z * 0.047 - 12, 3), 1.6);
      // mesas: flat-topped tables with sheer sides and a scree apron, kept off the middle of the map
      if (K.mesa) {
        const mz = n.fbm2(X * 0.028 + 400, Z * 0.028 - 50, 3) * 0.5 + 0.5, away = smooth(22, 36, hyp(x - (this.hint?.[0] ?? c), z - (this.hint?.[1] ?? c)));
        v += (smooth(0.585, 0.62, mz) * K.mesa + smooth(0.52, 0.585, mz) * 1.1) * away * k * (1 - smooth(0.1, 0.4, m));
      }
      // escarpments: benches with cliff risers; a slow field opens ramps and passes through them
      if (K.terrace && v > 5.2 && m < 0.25) {
        const t = (v - 4) / K.terrace, f = t - Math.floor(t);
        const terr = 4 + (Math.floor(t) + smooth(0.86, 0.99, f)) * K.terrace;
        const ramp = smooth(0.4, 0.62, n.n2(X * 0.043 + 90, Z * 0.043) * 0.5 + 0.5);
        v = terr + (v - terr) * ramp;
      }
      // the coast: a flatter beach shelf just above the water, a quicker drop-off below it
      if (v >= 4 && v < 6) v = 4 + (v - 4) * (0.55 + 0.45 * smooth(4, 6, v));
      else if (v < 4 && v > 2) v = 4 - (4 - v) * (1.6 - 0.6 * smooth(4, 2, v));
      S[i] = v;
    }
  }
  /** the crash site: a gentle easing of the ground right under the pod (small and invisible: the land keeps its roll,
   *  the pod pushes the plants aside itself) */
  private landingPad() {
    const N = this.N, L = this.landing, h = this.h;
    let sum = 0, cnt = 0;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const X = Math.floor(L.x) + dx, Z = Math.floor(L.z) + dz; if (!this.inside(X, Z)) continue; sum += h[Z * N + X]; cnt++; }
    const avg = Math.max(this.water + 0.6, sum / Math.max(1, cnt));
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
      const X = Math.floor(L.x) + dx, Z = Math.floor(L.z) + dz; if (!this.inside(X, Z)) continue;
      const d = hyp(dx, dz), t = d < 2.5 ? 1 : d < 8 ? 1 - smooth(2.5, 8, d) : 0;
      if (t > 0) { const i = Z * N + X; h[i] = h[i] + (avg - h[i]) * t * 0.6; }
    }
  }
  /** flood the walkable ground from the landing (a 0.75 m climb, dry land or a wadeable river) */
  private computeReach() {
    const N = this.N, h = this.h, W = this.water, out = new Uint8Array(N * N);
    const L = this.landing, s0 = Math.floor(L.z) * N + Math.floor(L.x), st = [s0];
    out[s0] = 1;
    while (st.length) {
      const c = st.pop()!, x = c % N, z = (c / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
        const j = Z * N + X; if (out[j] || h[j] < W) continue;
        if (Math.abs(h[j] - h[c]) > 0.75) continue;
        out[j] = 1; st.push(j);
      }
    }
    this.reach = out;
  }
  /** the share of the dry land a walker can reach from the landing */
  reachShare() { let land = 0, got = 0; for (let i = 0; i < this.N * this.N; i++) if (this.h[i] >= this.water) { land++; if (this.reach[i]) got++; } return land ? got / land : 1; }

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
      this.forest[i] = smooth(lo, lo + 0.14, v) * (this.h[i] - this.water > 13 ? 0.35 : 1);
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
      const i = z * N + x, h = this.h[i], ry = this.riverY[i], sl = this.slope(x, z), w = this.wet[i], alt = h - this.water;
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
      else if (bi.key === 'tundra') k = alt > 3 || v > 0.2 ? B.SNOW : (v > -0.2 ? B.GRASS : B.GRAVEL);
      else if (bi.key === 'ashland') k = v > 0.15 ? B.BASALT : (v > -0.2 ? B.DRY : B.GRAVEL);
      else if (bi.key === 'crystal') k = v > 0.4 ? B.ROCK : (v > 0.1 ? B.GRAVEL : B.DRY);
      else if (bi.key === 'savanna') k = w < 0.42 ? B.DRY : B.GRASS;
      else if (bi.key === 'marsh') k = w > 0.85 && v > 0.1 ? B.MUD : B.GRASS;
      else if (alt > 15 + v * 4) k = alt > 12 + bi.temp * 20 + v * 3 ? B.SNOW : alt > 19 + v * 4 || sl > 0.6 ? B.ROCK : B.GRAVEL;
      else k = w < 0.3 ? B.DRY : B.GRASS;
      if (k === B.GRASS && v < -0.5 && dw[i] < 12) k = B.CLAY;
      // the ranges: scree on the steep slopes at their foot, bare rock and snow up high, the pass road worn to gravel
      const m = this.mount[i];
      if (m > 0.12 && above > 0.3) {
        if (sl >= 0.95) k = bi.key === 'ashland' ? B.BASALT : B.ROCK;
        else if (sl > 0.45 && m < 0.7) k = hash01(x, z, 31) < 0.6 ? B.GRAVEL : k;
        else if (alt > 19 + bi.temp * 15 + v * 3) k = B.SNOW;
        else if (alt > 18 + v * 4 && (k === B.GRASS || k === B.LITTER)) k = v > 0.1 ? B.GRAVEL : k;
      }
      if (this.passMask[i] === 2) k = hash01(x, z, 32) < 0.7 ? B.SOIL : B.GRAVEL;
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
    const H = this.hint;
    for (let t = 0; t < 400; t++) {
      // near the middle of the big valley when the ranges planned one, else the middle of the map
      const x = H ? clamp(Math.round(H[0] + r.range(-20, 20)), 12, N - 13) : r.int(Math.floor(N * 0.3), Math.floor(N * 0.7));
      const z = H ? clamp(Math.round(H[1] + r.range(-20, 20)), 12, N - 13) : r.int(Math.floor(N * 0.3), Math.floor(N * 0.7));
      if (this.mount[z * N + x] > 0.08) continue;
      // flat, dry, not too high
      let s = 0, lo = 1e9, hi = -1e9;
      for (let dz = -6; dz <= 6; dz += 2) for (let dx = -6; dx <= 6; dx += 2) {
        const h = this.heightAt(x + dx, z + dz); lo = Math.min(lo, h); hi = Math.max(hi, h);
        if (h < this.water + 0.5) s -= 6;
      }
      s -= (hi - lo) * 3 + hyp(x - (H ? H[0] : N / 2), z - (H ? H[1] : N / 2)) * 0.05;
      // clear of the ranges' foot
      for (let a = 0; a < 8; a++) { const X = clamp(Math.round(x + Math.cos(a * 0.785) * 16), 0, N - 1), Z = clamp(Math.round(z + Math.sin(a * 0.785) * 16), 0, N - 1); s -= this.mount[Z * N + X] * 4; }
      if (s > best) { best = s; this.landing = { x: x + 0.5, z: z + 0.5 }; }
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
          if (hyp(X + 0.5 - x, Z + 0.5 - z) < w + 0.35 && this.h[i] >= this.water + 0.15 && this.b[i] !== B.ROCK && this.mount[i] < 0.4) { this.b[i] = B.SOIL; this.fert[i] *= 0.35; }
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
      this.h[i] = Math.min(this.water + 70, Math.max(0.6, this.h[i] + amt * f));
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
  // ------------------------------------------------------------------------------------------------ ocean regions (src/ocean)
  /** ocean regions: the islands the land was drawn from (centre and radius in metres), for the sea's own systems */
  isles: { x: number; z: number; r: number }[] = [];
  /** reef regions: the lagoon (the cay's centre and the reef crest's radius) */
  lagoon: { x: number; z: number; r: number } | null = null;
  /** an ocean region (biome.sea): islands in the sea, the golem can splash down, dive and build on pontoons */
  get oceanic() { return !!this.biome.sea; }
  /**
   * Ocean regions (biome.sea) redraw the relief as islands in the sea. Archipelago: a big island and a scatter of
   * smaller ones, sandy shelves dropping into deep channels; reef: a low cay in a shallow lagoon, ringed by a reef
   * crest broken by two passes, falling off steeply to the deep; open sea: one islet and a few rocks over deep water
   * cut by a trench. Island interiors keep the land relief the main generator made, so hills still come from it. The
   * map's rim is always deep water, so the sea runs on past it without a seam.
   */
  private oceanFloor(r: Rand) {
    const N = this.N, key = this.biome.key, n = this.noise, W = this.water, h = this.h, TAU2 = Math.PI * 2;
    const relief = Float32Array.from(h), isl = this.isles;
    const c0x = N / 2 + r.range(-7, 7), c0z = N / 2 + r.range(-7, 7);
    const free = (x: number, z: number, rad: number) => isl.every((o) => hyp(o.x - x, o.z - z) > o.r + rad + 7);
    if (key === 'reef') isl.push({ x: c0x, z: c0z, r: r.range(10, 13) });
    else if (key === 'ocean') {
      isl.push({ x: c0x, z: c0z, r: r.range(13, 16) });
      for (let t = 0, k = r.int(2, 4); t < 120 && k > 0; t++) {
        const a = r.range(0, TAU2), d = r.range(30, 52), rad = r.range(2.2, 4.5), x = c0x + Math.cos(a) * d, z = c0z + Math.sin(a) * d;
        if (x < 14 || z < 14 || x > N - 14 || z > N - 14 || !free(x, z, rad)) continue;
        isl.push({ x, z, r: rad }); k--;
      }
    } else {
      isl.push({ x: c0x, z: c0z, r: r.range(16, 20) });
      for (let t = 0, k = r.int(4, 6); t < 240 && k > 0; t++) {
        const rad = r.range(5, 12), x = r.range(12 + rad, N - 12 - rad), z = r.range(12 + rad, N - 12 - rad);
        if (!free(x, z, rad)) continue;
        isl.push({ x, z, r: rad }); k--;
      }
    }
    const basin = key === 'ocean' ? 16 : key === 'reef' ? 13 : 10.5;
    const RL = key === 'reef' ? r.range(38, 43) : 0;
    if (key === 'reef') this.lagoon = { x: c0x, z: c0z, r: RL };
    const passA = r.range(0, TAU2), passB = passA + r.range(2.2, 4);
    const angD = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % TAU2) - Math.PI);
    const trench = key === 'ocean' || (key === 'archipelago' && this.seed % 2 === 0);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, px = x + 0.5, pz = z + 0.5;
      // signed distance to the coast (metres, + on land): the coastlines warped into bays and headlands
      let sd = -1e9;
      for (let k = 0; k < isl.length; k++) { const o = isl[k], w = 1 + 0.3 * n.fbm2(px * 0.045 + k * 17.3, pz * 0.045 - k * 5.1, 3); sd = Math.max(sd, o.r - hyp(px - o.x, pz - o.z) * w); }
      const rim = Math.min(px, pz, N - px, N - pz);
      let y: number;
      if (sd > 0) {
        // land: a beach, then the main generator's relief rising inland
        const inland = smooth(1.5, 9, sd);
        y = W + 0.18 + Math.min(sd * 0.28, 0.8) + Math.max(0, relief[i] - 3.6) * 0.7 * inland + inland * 0.7;
      } else {
        const e = -sd, bump = n.fbm2(px * 0.07 + 31, pz * 0.07, 3);
        // the shelf: sand sloping out under the water, then the drop to the basin
        const shelf = 0.1 + Math.min(e, 7) * 0.2;
        let d = shelf + smooth(5, 26, e) * (basin - shelf) * (0.8 + 0.35 * n.fbm2(px * 0.02 + 7, pz * 0.02, 3));
        d += bump * (0.35 + smooth(4, 20, e) * 1.3);
        if (key === 'reef') {
          const o = isl[0], dc = hyp(px - o.x, pz - o.z) * (1 + 0.08 * n.fbm2(px * 0.03, pz * 0.03 + 9, 2)), a = Math.atan2(pz - o.z, px - o.x);
          const pass = Math.min(angD(a, passA), angD(a, passB)) < 0.1;
          if (dc < RL) d = Math.min(d, 0.45 + smooth(0, 9, e) * 1.7 + Math.max(0, bump) * 1.1); // the lagoon
          else if (dc < RL + 5) d = pass ? 2.4 : 0.3 + Math.abs(bump) * 0.5; // the crest, cut by two passes
          else d = 0.7 + smooth(RL + 5, RL + 15, dc) * (basin - 0.7) + bump * 0.8; // the drop-off
        }
        if (trench) { const tv = Math.abs(n.n2(px * 0.011 + 50, pz * 0.011 - 20)); if (tv < 0.07) d += Math.pow(1 - tv / 0.07, 1.4) * 7 * smooth(8, 18, e); }
        // the rim is always deep water: the sea runs on past the map
        d = Math.max(d, smooth(16, 2, rim) * basin * 0.85);
        y = W - Math.max(0.1, d);
      }
      h[i] = Math.max(W - 24, y);
      this.wet[i] = sd > 0 ? this.wet[i] : 1;
    }
  }

  /**
   * Dress the sea floor of an ocean region: sand over the shelves, gravel and coral rubble in patches, dark silt in
   * the deep basins, bare rock on the steep walls and along outcrop ridges; weed-grown boulders on the outcrops and
   * sea stacks standing off the island shores (they are solid: walkers and the golem go round them).
   */
  private seabed(r: Rand) {
    const N = this.N, W = this.water, n = this.noise, h = this.h, key = this.biome.key;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x; if (h[i] >= W) continue;
      const d = W - h[i], sl = this.slope(x, z), v = n.fbm2(x * 0.09 + 200, z * 0.09, 3), rv = n.ridge2(x * 0.05 + 77, z * 0.05, 3);
      let k: number = B.SAND;
      if (sl > 1.05 || (rv > 0.84 && d > 2.5)) k = B.ROCK;
      else if (d > 10 && v > 0.1) k = B.MUD;
      else if (v > 0.42) k = B.GRAVEL;
      this.b[i] = k; this.fert[i] = 0;
    }
    const mat = key === 'ocean' ? RockMat.BASALT : RockMat.LIMESTONE, L = this.landing;
    const placed: [number, number][] = [];
    const seat = (x: number, z: number) => this.groundSmooth(x, z);
    for (let t = 0, made = 0; t < 400 && made < 16; t++) {
      const x = r.range(6, N - 6), z = r.range(6, N - 6), i = Math.floor(z) * N + Math.floor(x), d = W - h[i];
      if (d < 1.2 || d > 13 || this.b[i] !== B.ROCK || placed.some(([px, pz]) => hyp(px - x, pz - z) < 6)) continue;
      const R = r.range(0.7, 1.8);
      this.rocks.push({ kind: 'boulder', mat, x, y: seat(x, z) - R * 0.25, z, sx: R * r.range(1, 1.3), sy: R * r.range(0.6, 0.9), sz: R, yaw: r.range(0, 6.28), tilt: r.range(0, 0.3), tiltDir: r.range(0, 6.28), seed: r.int(1, 1e9), moss: r.range(0.5, 0.9), wet: 1 });
      placed.push([x, z]); made++;
    }
    // sea stacks: off the shores of the islands, in a few metres of water, standing well clear of the landing
    for (const o of this.isles) for (let t = 0, k = o.r > 8 ? r.int(1, 3) : r.int(0, 1); t < 60 && k > 0; t++) {
      const a = r.range(0, 6.28), dd = o.r + r.range(3, 9), x = o.x + Math.cos(a) * dd, z = o.z + Math.sin(a) * dd;
      if (x < 4 || z < 4 || x > N - 4 || z > N - 4 || hyp(x - L.x, z - L.z) < 16) continue;
      const i = Math.floor(z) * N + Math.floor(x), d = W - h[i];
      if (d < 0.5 || d > 4 || placed.some(([px, pz]) => hyp(px - x, pz - z) < 5)) continue;
      const R = r.range(0.9, 1.6), y = seat(x, z) - 0.2;
      this.rocks.push({ kind: 'spire', mat, x, y, z, sx: R, sy: d + r.range(2.5, 5.5), sz: R * r.range(0.85, 1.15), yaw: r.range(0, 6.28), tilt: r.range(0, 0.06), tiltDir: r.range(0, 6.28), seed: r.int(1, 1e9), moss: 0.45, wet: 1 });
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const X = Math.floor(x) + dx, Z = Math.floor(z) + dz; if (this.inside(X, Z) && hyp(X + 0.5 - x, Z + 0.5 - z) < R * 0.85) { this.solid[Z * N + X] = 1; this.b[Z * N + X] = B.ROCK; } }
      placed.push([x, z]); k--;
    }
  }
}
