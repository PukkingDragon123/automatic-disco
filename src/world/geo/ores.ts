// Ores and the region's geology map. Four ways a resource shows itself:
//  - SURFACE OUTCROPS: a seam on open ground (the ore or crystal block) ringed by chunky ore nodes and crystal
//    clusters (rocks.ts draws them like the ore sheet: outline, 3-5 tones, glints), mined by miners and the golem;
//  - VEINS IN ROCK: coloured bands of ore in a cliff (painted by the ground shader from geo G/B); where a walker can
//    stand at the foot of the face the vein is a deposit too, with fallen nuggets on the scree below;
//  - HIDDEN DEPOSITS: buried bodies (region.buried) nothing on the surface betrays; a scan (golem or orbital survey,
//    region.scan) reveals them into region.deposits, and only drill-tier miners or the 'bore' skill work them;
//  - RARE ALIEN ORES: glowing lumen crystal and gravium (gravity ore: small rocks float over it) in dangerous places
//    (thermal fields, the shoulders of passes, the far side of the ranges), needed for high-tier recipes.
// Deposits deplete (amount) from a start (max) set by their richness.
// geo (N*N*4 bytes, for terrain.ts): R rock family (0 planet rock, 1 sandstone, 2 basalt, 3 limestone, 4 slate or
// shale, 5 granite, 6 volcanic tuff), G vein strength, B ore kind (0 iron/ferrite, 1 lumen/quartz crystal, 2 copper,
// 3 gold, 4 coal, 5 sulphur, 6 gravium), A below 128 waterfall spray (A/127), from 128 spring crust
// ((A-128)>>5 kind: 0 white, 1 ochre, 2 rust; (A-128)&31 strength).
import { Rand, clamp, smooth, hash01 } from '../../core/rand';
import type { RampName } from '../../art/palette';
import { B } from '../blockTex';
import { RockMat, type Region, type Deposit, type RockPiece } from '../region';
import { CRUST } from './springs';

const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);

export type OreId = 'iron' | 'copper' | 'gold' | 'coal' | 'sulphur' | 'quartz' | 'lumen' | 'gravium';
export interface OreDef {
  id: OreId; name: string;
  /** the factory item a miner produces */
  item: string;
  /** the old two-way split every consumer understands */
  kind: 'ore' | 'crystal';
  /** geo B id (terrain vein tiles) */
  geo: number;
  /** master-palette ramps: the ore itself and its staining on rock */
  ramp: RampName; stain: RampName;
  /** 0 any miner, 1 drill-tier, 2 rare (high-tier recipes) */
  tier: 0 | 1 | 2;
  glow?: boolean;
}
export const ORES: Record<OreId, OreDef> = {
  iron: { id: 'iron', name: 'Ferrite', item: 'ore', kind: 'ore', geo: 0, ramp: 'iron', stain: 'rust', tier: 0 },
  copper: { id: 'copper', name: 'Copper', item: 'copper_ore', kind: 'ore', geo: 2, ramp: 'copper', stain: 'malachite', tier: 0 },
  gold: { id: 'gold', name: 'Gold-ochre', item: 'gold_ore', kind: 'ore', geo: 3, ramp: 'gold', stain: 'ochre', tier: 1 },
  coal: { id: 'coal', name: 'Coal', item: 'coal', kind: 'ore', geo: 4, ramp: 'basalt', stain: 'basalt', tier: 0 },
  sulphur: { id: 'sulphur', name: 'Sulphur', item: 'sulphur', kind: 'ore', geo: 5, ramp: 'straw', stain: 'ochre', tier: 1 },
  quartz: { id: 'quartz', name: 'Quartz', item: 'crystal', kind: 'crystal', geo: 1, ramp: 'quartz', stain: 'quartz', tier: 0 },
  lumen: { id: 'lumen', name: 'Lumen Crystal', item: 'lumen_crystal', kind: 'crystal', geo: 1, ramp: 'glowTeal', stain: 'teal', tier: 2, glow: true },
  gravium: { id: 'gravium', name: 'Gravium', item: 'gravium', kind: 'ore', geo: 6, ramp: 'amethyst', stain: 'violet', tier: 2, glow: true },
};
/** ore ids by geo B id (the first listed wins for a shared id) */
export const ORE_BY_GEO: OreId[] = ['iron', 'quartz', 'copper', 'gold', 'coal', 'sulphur', 'gravium'];

/** rock families (geo R) per biome: the lowland's, and the ranges' bands from the foot up */
const FAMILY: Record<string, { low: number; mount: number[] }> = {
  meadow: { low: 0, mount: [4, 5, 5] }, jungle: { low: 3, mount: [3, 4, 3] }, savanna: { low: 1, mount: [1, 5, 1] },
  marsh: { low: 0, mount: [4] }, highland: { low: 4, mount: [4, 5, 4, 5] }, tundra: { low: 5, mount: [4, 5] },
  desert: { low: 1, mount: [1, 1, 3] }, crystal: { low: 3, mount: [3, 5, 3] }, ashland: { low: 2, mount: [2, 6, 2] },
  coast: { low: 1, mount: [1, 5] }, archipelago: { low: 3, mount: [3] }, reef: { low: 3, mount: [3] }, ocean: { low: 2, mount: [2] },
};
/** a geo rock family as a sculpted-rock material */
export function famMat(f: number): RockMat {
  return f === 1 ? RockMat.SANDSTONE : f === 2 ? RockMat.BASALT : f === 3 ? RockMat.LIMESTONE : f === 4 ? RockMat.SLATE : f === 6 ? RockMat.TUFF : RockMat.GRANITE;
}

/** surface outcrop ore weights per biome */
const OUTCROP: Record<string, [OreId, number][]> = {
  meadow: [['iron', 4], ['copper', 2], ['quartz', 2], ['coal', 1]],
  jungle: [['iron', 2], ['copper', 3], ['gold', 1], ['quartz', 1]],
  savanna: [['iron', 3], ['copper', 2], ['gold', 1.5], ['quartz', 1]],
  marsh: [['iron', 3], ['coal', 2], ['quartz', 1]],
  highland: [['iron', 3], ['copper', 2], ['gold', 1], ['quartz', 2], ['coal', 1]],
  tundra: [['iron', 3], ['quartz', 3], ['copper', 1]],
  desert: [['copper', 3], ['gold', 2], ['iron', 2], ['sulphur', 1]],
  crystal: [['quartz', 5], ['iron', 2], ['copper', 1]],
  ashland: [['sulphur', 3], ['iron', 3], ['coal', 1], ['copper', 1]],
  coast: [['iron', 3], ['copper', 2], ['quartz', 1]],
};
const VEIN: [OreId, number][] = [['iron', 3], ['copper', 2.5], ['gold', 1.2], ['coal', 2], ['sulphur', 0.8]];
const BURIED: [OreId, number][] = [['gold', 2], ['copper', 2], ['iron', 2], ['coal', 1.5], ['quartz', 1]];

/** rock families into geo R (before the formations, which take their stone from it) */
export function fillFamilies(R: Region) {
  const N = R.N, F = FAMILY[R.biome.key] ?? FAMILY.meadow, n = R.noise, W = R.water, g = R.geo;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, m = R.mount[i];
    let f = F.low;
    if (m > 0.3 || R.h[i] - W > 16) {
      // strata bands in the ranges, the boundaries wandering with height
      const band = Math.floor((R.h[i] - W) / 10 + n.fbm2(x * 0.03 + 3, z * 0.03, 2) * 0.6);
      f = F.mount[clamp(band, 0, F.mount.length - 1)];
    }
    g[i * 4] = f;
  }
  if (R.thermal) {
    const t = R.thermal;
    for (let z = Math.floor(t.z - t.r); z <= Math.ceil(t.z + t.r); z++) for (let x = Math.floor(t.x - t.r); x <= Math.ceil(t.x + t.r); x++) {
      if (!R.inside(x, z)) continue;
      if (hyp(x + 0.5 - t.x, z + 0.5 - t.z) + hash01(x, z, 61) * 3 < t.r) g[(z * N + x) * 4] = R.biome.key === 'crystal' ? 3 : 6;
    }
  }
}

/** spray (falls) and crust (springs) into geo A */
export function fillWater(R: Region) {
  const N = R.N, g = R.geo;
  for (const f of R.falls) {
    const drop = f.top - f.bottom, rr = 2 + Math.min(5, drop * 0.8);
    const cx = f.x + f.dir[0] * 1.2, cz = f.z + f.dir[1] * 1.2;
    for (let z = Math.floor(cz - rr); z <= Math.ceil(cz + rr); z++) for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
      if (!R.inside(x, z)) continue;
      const i = (z * N + x) * 4; if (g[i + 3] >= 128) continue;
      const k = 1 - hyp(x + 0.5 - cx, z + 0.5 - cz) / rr;
      if (k > 0) g[i + 3] = Math.max(g[i + 3], Math.round(clamp(k * 1.4, 0, 1) * 127));
    }
  }
  for (const s of R.springs) {
    const kind = CRUST[s.hue ?? 'turquoise'], rr = s.r + (s.kind === 'geyser' ? 2.4 : 2.2);
    for (let z = Math.floor(s.z - rr); z <= Math.ceil(s.z + rr); z++) for (let x = Math.floor(s.x - rr); x <= Math.ceil(s.x + rr); x++) {
      if (!R.inside(x, z)) continue;
      const d = hyp(x + 0.5 - s.x, z + 0.5 - s.z), i = (z * N + x) * 4;
      const k = d < s.r * 0.8 ? 0.35 : clamp(1 - (d - s.r) / (rr - s.r), 0, 1) * (0.8 + hash01(x, z, 13) * 0.2);
      if (k <= 0.03) continue;
      const v = 128 + (kind << 5) + Math.round(k * 31);
      const old = g[i + 3];
      if (old < 128 || ((old - 128) & 31) < Math.round(k * 31)) g[i + 3] = v;
    }
  }
}

/** is a walker's cell at the foot of a cliff (ground standing > 2.2 m higher within 2 m)? returns the face direction */
function cliffFoot(R: Region, x: number, z: number): [number, number] | null {
  const N = R.N, h0 = R.h[z * N + x];
  let best: [number, number] | null = null, bd = 0;
  for (let a = 0; a < 8; a++) {
    const dx = Math.round(Math.cos(a * 0.785) * 2), dz = Math.round(Math.sin(a * 0.785) * 2), X = x + dx, Z = z + dz;
    if (!R.inside(X, Z)) continue;
    const d = R.h[Z * N + X] - h0;
    if (d > 2.2 && d > bd) { bd = d; best = [dx / 2, dz / 2]; }
  }
  return best;
}

/** place every deposit (and the rocks that show them), the veins and the buried bodies; fill geo G and B */
export function placeOres(R: Region, r: Rand) {
  const N = R.N, bi = R.biome, L = R.landing, reach = R.reach, g = R.geo, W = R.water;
  const table = OUTCROP[bi.key] ?? OUTCROP.meadow;
  const free = (x: number, z: number, rad: number) => {
    const i = z * N + x;
    if (R.h[i] < W + 0.5 || R.riverY[i] > 0 || R.passMask[i] === 2) return false;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (R.inside(x + dx, z + dz) && (R.solid[(z + dz) * N + x + dx] || R.isWater(x + dx, z + dz))) return false;
    if ([...R.deposits, ...R.buried].some((d) => hyp(d.x - x, d.z - z) < 13 + rad)) return false;
    return true;
  };
  const flat = (x: number, z: number) => Math.abs(R.heightAt(x + 2.5, z) - R.heightAt(x - 2.5, z)) < 1.4 && Math.abs(R.heightAt(x, z + 2.5) - R.heightAt(x, z - 2.5)) < 1.4;
  const mk = (ore: OreId, x: number, z: number, rad: number, style: Deposit['style'], rich: number, o: Partial<Deposit> = {}): Deposit => {
    const def = ORES[ore], base = def.kind === 'ore' ? 1600 : 1100;
    const amount = Math.round(base * rich);
    return { x: x + 0.5, z: z + 0.5, kind: def.kind, amount, max: amount, r: rad, ore, item: def.item, style, richness: rich, tier: def.tier, ...o };
  };
  const seam = (d: Deposit) => {
    const x = Math.floor(d.x), z = Math.floor(d.z), rr = Math.ceil(d.r + 1);
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
      const dd = hyp(dx, dz) + hash01(x + dx, z + dz, 5) * 0.8;
      if (dd <= d.r && R.inside(x + dx, z + dz) && R.h[(z + dz) * N + x + dx] >= W) {
        const i = (z + dz) * N + x + dx;
        R.b[i] = d.kind === 'ore' ? B.ORE : B.CRYSTAL;
        g[i * 4 + 1] = Math.max(g[i * 4 + 1], 200); g[i * 4 + 2] = ORES[d.ore!].geo;
      }
    }
  };
  // ---- surface outcrops: two starter seams near the landing (ferrite and a crystal or copper), the rest spread out
  const want = 7 + (bi.key === 'highland' || bi.key === 'crystal' ? 3 : 0);
  for (let t = 0, made = 0; t < 1400 && made < want; t++) {
    const x = r.int(6, N - 7), z = r.int(6, N - 7), dl = hyp(x - L.x, z - L.z);
    if (reach.length && !reach[z * N + x]) continue;
    // the starter seams look further out when the landing's surroundings are crowded
    const near = t < 300 ? 30 : t < 550 ? 45 : 1e9;
    if (dl < (made < 2 ? 12 : 18) || (made < 2 && dl > near)) continue;
    if (!free(x, z, 0) || !flat(x, z)) continue;
    const ore: OreId = made === 0 ? 'iron' : made === 1 ? (bi.key === 'crystal' || r.chance(0.6) ? 'quartz' : 'copper') : r.weighted(table);
    const d = mk(ore, x, z, r.range(1.6, 2.8), 'outcrop', made < 2 ? 1 : r.range(0.7, 1.4));
    R.deposits.push(d); seam(d); nodes(R, r, d);
    made++;
  }
  // ---- veins in rock: at the foot of a reachable cliff, the face banded with ore above it
  for (let t = 0, made = 0; t < 1400 && made < 5; t++) {
    const x = r.int(5, N - 6), z = r.int(5, N - 6), i = z * N + x;
    if (!reach[i] || R.solid[i] || R.isWater(x, z) || hyp(x - L.x, z - L.z) < 16) continue;
    const face = cliffFoot(R, x, z); if (!face) continue;
    if ([...R.deposits, ...R.buried].some((d) => hyp(d.x - x, d.z - z) < 14)) continue;
    const ore = r.weighted(VEIN), d = mk(ore, x, z, 1.7, 'vein', r.range(0.8, 1.5), { face: [face[0], face[1]] });
    R.deposits.push(d);
    veinBand(R, x + face[0] * 2.5, z + face[1] * 2.5, ore, r.range(4, 7), R.deposits.length - 1);
    // nuggets fallen out of the face
    for (let k = r.int(2, 4); k > 0; k--) { const a = r.range(0, 6.28), dd = r.range(0.6, 2.2); stone(R, r, 'node', x + 0.5 + Math.cos(a) * dd, z + 0.5 + Math.sin(a) * dd, r.range(0.22, 0.42), ore); }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (R.inside(x + dx, z + dz) && R.b[(z + dz) * N + x + dx] !== B.ROCK) R.b[(z + dz) * N + x + dx] = B.GRAVEL;
    made++;
  }
  // ---- visible veins high in the ranges (no one can reach them; they say what the rock holds)
  for (let t = 0, made = 0; t < 600 && made < 8; t++) {
    const x = r.int(4, N - 5), z = r.int(4, N - 5), i = z * N + x;
    if (R.mount[i] < 0.5 || reach[i]) continue;
    const sl = Math.abs(R.h[i + 1] - R.h[i - 1]) + Math.abs(R.h[i + N] - R.h[i - N]);
    if (sl < 2.5) continue;
    veinBand(R, x, z, r.weighted(VEIN), r.range(3, 6), -1);
    made++;
  }
  // ---- hidden deposits: buried, revealed by a scan, drill-tier only
  for (let t = 0, made = 0; t < 900 && made < r.int(3, 5); t++) {
    const x = r.int(8, N - 9), z = r.int(8, N - 9);
    if (!reach[z * N + x] || hyp(x - L.x, z - L.z) < 22 || !free(x, z, 1) || !flat(x, z)) continue;
    const ore = r.weighted(BURIED), d = mk(ore, x, z, r.range(2.4, 3.4), 'buried', r.range(1.4, 2.2), { hidden: true, drill: true, depth: r.range(4, 14) });
    R.buried.push(d);
    made++;
  }
  rare(R, r, mk, free);
}

/** the rare alien ores in their dangerous places */
function rare(R: Region, r: Rand, mk: (ore: OreId, x: number, z: number, rad: number, style: Deposit['style'], rich: number, o?: Partial<Deposit>) => Deposit, free: (x: number, z: number, rad: number) => boolean) {
  const N = R.N, reach = R.reach, key = R.biome.key;
  const sites: { x: number; z: number; danger: string }[] = [];
  // a thermal field: lumen grows by the geysers
  if (R.thermal) {
    const gs = R.springs.filter((s) => s.kind === 'geyser');
    const s = gs.length ? r.pick(gs) : R.springs[0];
    if (s) for (let t = 0; t < 40; t++) {
      const a = r.range(0, 6.28), d = r.range(2.2, 4.5), x = Math.floor(s.x + Math.cos(a) * d), z = Math.floor(s.z + Math.sin(a) * d);
      if (R.inside(x, z) && !R.isWater(x, z) && reach[z * N + x]) { sites.push({ x, z, danger: 'geyser' }); break; }
    }
  }
  // the shoulder of a pass: a ledge beside the road at the saddle
  for (const p of R.passes) {
    let k = 0; for (let i = 0; i < p.path.length; i++) if (Math.abs(i - p.path.length / 2) < Math.abs(k - p.path.length / 2)) k = i;
    const a = p.path[Math.max(0, k - 1)], b = p.path[Math.min(p.path.length - 1, k + 1)], tx = b[0] - a[0], tz = b[1] - a[1], tl = hyp(tx, tz) || 1;
    for (const sg of [1, -1]) {
      const x = Math.floor(p.x - (tz / tl) * (p.w + 0.8) * sg), z = Math.floor(p.z + (tx / tl) * (p.w + 0.8) * sg);
      if (R.inside(x, z) && reach[z * N + x] && !R.isWater(x, z)) { sites.push({ x, z, danger: 'cliff' }); break; }
    }
  }
  // the far side of the ranges: reachable only over a pass, far from the landing
  for (let t = 0; t < 300; t++) {
    const x = r.int(10, N - 11), z = r.int(10, N - 11);
    if (!reach[z * N + x] || R.mount[z * N + x] > 0.2 || !R.farSide || !R.farSide[z * N + x]) continue;
    if (!free(x, z, 0)) continue;
    sites.push({ x, z, danger: 'wild' }); break;
  }
  const lumenN = key === 'crystal' ? 2 : 1, gravN = ['highland', 'tundra', 'ashland', 'crystal', 'desert'].includes(key) ? 1 : r.chance(0.5) ? 1 : 0;
  const order: OreId[] = [];
  for (let k = 0; k < lumenN; k++) order.push('lumen');
  for (let k = 0; k < gravN; k++) order.push('gravium');
  r.shuffle(order);
  // gravium prefers the cliffs and the far side, lumen the thermal field
  for (const ore of order) {
    let si = sites.findIndex((s) => (ore === 'lumen' ? s.danger === 'geyser' : s.danger !== 'geyser'));
    if (si < 0) si = 0;
    const s = sites[si]; if (!s) break;
    sites.splice(si, 1);
    const d = mk(ore, s.x, s.z, 1.2, 'rare', r.range(0.6, 1), { danger: s.danger });
    d.amount = d.max = Math.round((ORES[ore].kind === 'ore' ? 1600 : 1100) * 0.3);
    R.deposits.push(d);
    const i = s.z * R.N + s.x;
    R.geo[i * 4 + 1] = 220; R.geo[i * 4 + 2] = ORES[ore].geo;
    R.dangers.push({ x: d.x, z: d.z, r: 6, kind: s.danger, why: ORES[ore].name });
    nodes(R, r, d);
  }
}

/** paint a vein band into a cliff (geo G, B) around (x, z), along the face, `len` m long */
function veinBand(R: Region, x: number, z: number, ore: OreId, len: number, dep: number) {
  const N = R.N, g = R.geo, ext = Math.ceil(len);
  for (let dz = -ext; dz <= ext; dz++) for (let dx = -ext; dx <= ext; dx++) {
    const X = Math.floor(x) + dx, Z = Math.floor(z) + dz; if (!R.inside(X, Z)) continue;
    const d = hyp(dx, dz) / len + (hash01(X, Z, 88) - 0.5) * 0.3;
    if (d > 1) continue;
    const i = (Z * N + X) * 4, v = Math.round(255 * smooth(1, 0.35, d));
    if (v > g[i + 1]) { g[i + 1] = v; g[i + 2] = ORES[ore].geo; }
  }
  R.veins.push({ x, z, r: len, ore, deposit: dep });
}

/** the rocks that show a deposit: ore nodes round the seam, crystal clusters, gravium's floating stones */
function nodes(R: Region, r: Rand, d: Deposit) {
  const def = ORES[d.ore!];
  if (d.style === 'rare') {
    if (d.ore === 'lumen') {
      // a big glowing cluster and a few satellites
      stone(R, r, 'crystal', d.x, d.z, r.range(0.8, 1.1), 'lumen', r.range(1.6, 2.4));
      for (let k = r.int(4, 7); k > 0; k--) { const a = r.range(0, 6.28), dd = r.range(0.7, 2.2), q = stone(R, r, 'crystal', d.x + Math.cos(a) * dd, d.z + Math.sin(a) * dd, r.range(0.22, 0.5), 'lumen', r.range(0.5, 1.3)); q.tilt = r.range(0.25, 0.6); q.tiltDir = a + Math.PI; }
    } else {
      stone(R, r, 'node', d.x, d.z, r.range(0.7, 0.95), 'gravium');
      for (let k = r.int(5, 8); k > 0; k--) {
        const a = r.range(0, 6.28), dd = r.range(0.4, 2.2), q = stone(R, r, 'floater', d.x + Math.cos(a) * dd, d.z + Math.sin(a) * dd, r.range(0.14, 0.4), 'gravium');
        q.y += r.range(0.7, 2.6); q.float = r.range(0.6, 1.4);
      }
    }
    return;
  }
  const n = r.int(3, 6);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r.range(-0.4, 0.4), dd = d.r + r.range(0.3, 1.2);
    const x = d.x + Math.cos(a) * dd, z = d.z + Math.sin(a) * dd;
    if (R.isWater(x, z)) continue;
    if (def.kind === 'crystal') { const q = stone(R, r, 'crystal', x, z, r.range(0.22, 0.5), d.ore!, r.range(0.6, 1.5)); q.tilt = r.range(0.15, 0.5); q.tiltDir = a + Math.PI; }
    else stone(R, r, 'node', x, z, r.range(0.45, 0.95), d.ore!);
  }
}

/** one deposit rock */
function stone(R: Region, r: Rand, kind: 'node' | 'crystal' | 'floater', x: number, z: number, s: number, ore: OreId, ht = 0): RockPiece {
  const N = R.N, i = clamp(Math.floor(z), 0, N - 1) * N + clamp(Math.floor(x), 0, N - 1);
  const p: RockPiece = {
    kind, mat: famMat(R.geo[i * 4]), x, y: R.groundSmooth(x, z) - (kind === 'crystal' ? 0.08 : s * 0.25), z,
    sx: s * r.range(0.9, 1.3), sy: kind === 'crystal' ? ht || s * 2 : s * r.range(0.6, 0.95), sz: s * r.range(0.85, 1.15),
    yaw: r.range(0, 6.28), tilt: r.range(0, kind === 'crystal' ? 0.25 : 0.3), tiltDir: r.range(0, 6.28), seed: r.int(1, 1e9), moss: 0, wet: 0,
    ore: ORES[ore].geo, glow: ORES[ore].glow ? 1 : 0, oreId: ore,
  };
  R.rocks.push(p);
  return p;
}

/**
 * Reveal the buried deposits within `rad` of (x, z) (a scan): they move into region.deposits (appended, so earlier
 * indices stay valid) and region.onDeposit listeners hear of each. Returns the new deposits' indices.
 */
export function scanReveal(R: Region, x: number, z: number, rad: number): number[] {
  const out: number[] = [];
  for (let k = R.buried.length - 1; k >= 0; k--) {
    const d = R.buried[k];
    if (hyp(d.x - x, d.z - z) > rad + d.r) continue;
    R.buried.splice(k, 1);
    d.hidden = false;
    R.deposits.push(d);
    const i = R.deposits.length - 1;
    out.push(i);
    for (const fn of R.onDeposit) { try { fn(d, i); } catch (e) { console.warn('onDeposit', e); } }
  }
  return out;
}
