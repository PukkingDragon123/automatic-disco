// A planet: a named world split into regions (one RTS map each). Biomes follow latitude and moisture; regions
// carry their own seed, danger and who holds them. The Veyr conquers region by region until it can ascend.
import { Rand, hashi } from '../core/rand';
import { type BiomeKey } from './region';

export type RState = 'wild' | 'veyr' | 'rival' | 'lost';
export interface PRegion { id: number; c: [number, number, number]; biome: BiomeKey; name: string; danger: number; state: RState; seed: number }
export interface Planet { seed: number; name: string; palKey: string; regions: PRegion[]; goal: number }

const SYL = ['ka', 'ri', 'os', 'veth', 'mul', 'an', 'tir', 'o', 'sel', 'ga', 'nu', 'rho', 'zed', 'ul', 'ith', 'mar', 'qua', 'ell', 'dor', 'ys'];
const PLACE = ['Reach', 'Basin', 'Hollow', 'Steppe', 'Shelf', 'Fold', 'Mere', 'Rise', 'Scar', 'Vale', 'Shoal', 'Crown'];
const PALS = ['amber', 'violet', 'cyan', 'crimson', 'gold'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function planetName(seed: number) {
  const r = new Rand(seed ^ 0x9e37);
  const n = r.int(2, 3);
  let s = ''; for (let i = 0; i < n; i++) s += r.pick(SYL);
  return cap(s) + (r.chance(0.35) ? ' ' + r.pick(['Prime', 'IV', 'Minor', 'b', 'VII']) : '');
}

export function makePlanet(seed: number): Planet {
  const r = new Rand(seed);
  const N = 12;
  const regions: PRegion[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) / N) * 2, rad = Math.sqrt(1 - y * y), th = ga * i + r.range(-0.25, 0.25);
    let c: [number, number, number] = [Math.cos(th) * rad + r.range(-0.08, 0.08), y + r.range(-0.06, 0.06), Math.sin(th) * rad + r.range(-0.08, 0.08)];
    const l = Math.hypot(...c); c = [c[0] / l, c[1] / l, c[2] / l];
    const lat = Math.abs(c[1]), wet = (hashi(seed, i, 7) % 1000) / 1000;
    let biome: BiomeKey;
    if (lat > 0.8) biome = 'tundra';
    else if (lat > 0.55) biome = wet > 0.5 ? 'highland' : r.chance(0.5) ? 'tundra' : 'crystal';
    else if (lat < 0.25) biome = wet > 0.6 ? 'jungle' : wet > 0.35 ? 'savanna' : 'desert';
    else biome = wet > 0.75 ? 'marsh' : wet > 0.5 ? 'meadow' : wet > 0.3 ? 'coast' : r.chance(0.5) ? 'ashland' : 'savanna';
    regions.push({ id: i, c, biome, name: `${cap(r.pick(SYL) + r.pick(SYL))} ${r.pick(PLACE)}`, danger: 1 + Math.floor(r.next() * 3), state: 'wild', seed: (seed * 131 + i * 977) >>> 0 });
  }
  // the gentlest temperate region is where most seeds land first
  return { seed, name: planetName(seed), palKey: PALS[seed % PALS.length], regions, goal: 4 };
}

export const BIOME_COL: Record<BiomeKey, number> = {
  meadow: 0x6aa84a, jungle: 0x2f7a3a, savanna: 0xb8a24a, marsh: 0x4a6a4a, highland: 0x7a7a5a, tundra: 0xd8e4ec,
  desert: 0xe0c07a, crystal: 0x9ac8e0, ashland: 0x5a4a4a, coast: 0x5ab0a0,
};
export const owned = (p: Planet) => p.regions.filter((r) => r.state === 'veyr').length;
