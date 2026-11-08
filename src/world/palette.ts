// Planet looks. Each planet picks a curated palette and jitters it; everything (terrain, flora, sky, grading)
// reads from it so a world is cohesive. The Veyr's own moss is constant: it is the player's signature colour.
import { Rand } from '../core/rand';
import { rgbToHsl, hslToHex, toRGB } from '../limbo/gfx/pixel';

export interface Palette {
  key: string; name: string;
  grass: number; grassDry: number; soil: number; rock: number; sand: number; mud: number; clay: number;
  snow: number; basalt: number; ore: number; crystal: number;
  water: number; waterDeep: number; foam: number;
  foliage: number[]; bark: number[]; bloom: number[]; fungus: number[];
  sky: number; horizon: number; fog: number; sun: number; ambient: number; groundLight: number;
  /** star colour seen from the surface */
  star: number;
}

export const VEYR = { moss: 0x2f8f5e, mossLight: 0x8fe08a, mossDark: 0x123a2c, vein: 0x6affd8, em: 0x8f7cff, core: 0x46ffc0, spore: 0xd8ff7a };
export const RIVALS = [
  { key: 'krell', name: 'The Krell Shard', creep: 0xd86a8a, creepLight: 0xffb0c8, creepDark: 0x5a1e34, vein: 0xff6aa0, core: 0xff7ab0 },
  { key: 'sorrow', name: 'Sorrow Bloom', creep: 0xb8642a, creepLight: 0xf0b060, creepDark: 0x4a1e10, vein: 0xffa040, core: 0xffb050 },
  { key: 'pale', name: 'The Pale Choir', creep: 0x9aa8c8, creepLight: 0xe8f0ff, creepDark: 0x2e3450, vein: 0xb8d0ff, core: 0xd0e0ff },
];

const BASES: Palette[] = [
  {
    key: 'amber', name: 'Amber Verdance',
    grass: 0x8a9a3e, grassDry: 0xb09a52, soil: 0x7a5a3a, rock: 0x8a8478, sand: 0xd8c08a, mud: 0x4e4434, clay: 0xb06a4a,
    snow: 0xeef4f6, basalt: 0x3a3640, ore: 0x5a4a62, crystal: 0x7ae0e8,
    water: 0x5ab8c8, waterDeep: 0x1e6a88, foam: 0xe8fbff,
    foliage: [0x4f9a3e, 0x2f7a5a, 0x8a5aa8, 0xc8a040, 0x3a8a8a, 0x6aa848], bark: [0x5a3e2a, 0x7a5a3a, 0x4a3a3a],
    bloom: [0xf06a2a, 0xe84a5a, 0xf0c040, 0xb08aff, 0xff8ac0, 0xf8f0d0], fungus: [0xd8c8b0, 0xa86a9a, 0xe0a060],
    sky: 0x6aa8e0, horizon: 0xd8e8e0, fog: 0x9ab8b8, sun: 0xfff0d8, ambient: 0x8aa0c0, groundLight: 0x6a5a3a, star: 0xfff2c0,
  },
  {
    key: 'violet', name: 'Violet Dusk',
    grass: 0x6a3a6a, grassDry: 0x8a5a6a, soil: 0x5a3a34, rock: 0x6a6070, sand: 0xc89a8a, mud: 0x3a2a30, clay: 0x9a4a4a,
    snow: 0xf0e8f4, basalt: 0x2a2434, ore: 0x4a4a6a, crystal: 0xff8ad8,
    water: 0x4a8a9a, waterDeep: 0x1a3a5a, foam: 0xf4e8ff,
    foliage: [0x8a4a9a, 0xd0a048, 0x2a7a7a, 0xb85a7a, 0x4a8a5a, 0x5a3a8a], bark: [0x3a2a2a, 0x4a3438, 0x2a2228],
    bloom: [0xffc04a, 0x6affd0, 0xff6a8a, 0xf0f0a0, 0x8ad8ff, 0xffa0ff], fungus: [0xe8d0f0, 0x6ad8c8, 0xf0b0a0],
    sky: 0xb86a8a, horizon: 0xf0b8a0, fog: 0xa87a8a, sun: 0xffb890, ambient: 0x8a6a9a, groundLight: 0x4a3040, star: 0xff9a6a,
  },
  {
    key: 'cyan', name: 'Glacier Steppe',
    grass: 0x5a9a8a, grassDry: 0x9aa88a, soil: 0x5a5048, rock: 0x8a9298, sand: 0xc8c8b0, mud: 0x3e4440, clay: 0x8a6a5a,
    snow: 0xf4faff, basalt: 0x343a44, ore: 0x4a5a6a, crystal: 0x9ae8ff,
    water: 0x6ac8d8, waterDeep: 0x2a6a98, foam: 0xffffff,
    foliage: [0x3a8a6a, 0xc86a5a, 0x6a5a9a, 0x8ab84a, 0x2a6a8a, 0xd8a050], bark: [0x4a4a4a, 0x5a5048, 0x3a3a44],
    bloom: [0xffffff, 0xa8d8ff, 0xffd0e8, 0xc8a8ff, 0xf0f8a0, 0x6ae8ff], fungus: [0xd8e8f0, 0x8ab8c8, 0xc8d0a0],
    sky: 0x8ac8f0, horizon: 0xe8f4ff, fog: 0xb8d0e0, sun: 0xffffff, ambient: 0x9ab8d8, groundLight: 0x5a6a6a, star: 0xf0f8ff,
  },
  {
    key: 'crimson', name: 'Crimson Mire',
    grass: 0x9a3a3a, grassDry: 0xa86a4a, soil: 0x4a3028, rock: 0x6a5a58, sand: 0xc8a070, mud: 0x2e2420, clay: 0x8a3a2a,
    snow: 0xf0e8e0, basalt: 0x2a2224, ore: 0x4a3a4a, crystal: 0xffd06a,
    water: 0x4aa8b0, waterDeep: 0x1a4a62, foam: 0xf0f0e0,
    foliage: [0x2a7a7a, 0xd0a040, 0x6a3a8a, 0x3a8a4a, 0x1e5a6a, 0xe0703a], bark: [0x2a1e1a, 0x3a2a24, 0x4a3028],
    bloom: [0xf0f0a0, 0x6ad8ff, 0xffd04a, 0xffffff, 0xa8ff6a, 0xff8a4a], fungus: [0xf0e0c0, 0xc8f0a0, 0xffb06a],
    sky: 0xe0905a, horizon: 0xffd0a0, fog: 0xc0806a, sun: 0xffd8a0, ambient: 0xa0705a, groundLight: 0x4a2a20, star: 0xffc080,
  },
  {
    key: 'gold', name: 'Gold Savanna',
    grass: 0xc8a43a, grassDry: 0xd8b86a, soil: 0x9a5a2a, rock: 0x9a8070, sand: 0xe8d0a0, mud: 0x5a3e2a, clay: 0xc0603a,
    snow: 0xfaf4ea, basalt: 0x3a3030, ore: 0x5a4058, crystal: 0x6affb0,
    water: 0x4ab0b8, waterDeep: 0x1a5a7a, foam: 0xfff8e8,
    foliage: [0x2a8a8a, 0x3a9a6a, 0x1a6a7a, 0x6ab84a, 0x8a6a2a, 0x2a7a9a], bark: [0x6a4a2a, 0x8a6a4a, 0x4a3020],
    bloom: [0xe83a5a, 0xffffff, 0xff6a2a, 0x8a4aff, 0xffd84a, 0x4ae8ff], fungus: [0xf0d8b0, 0xe07a6a, 0xa8d070],
    sky: 0x5aa0e8, horizon: 0xf0e0c0, fog: 0xc8b890, sun: 0xfff8e0, ambient: 0x90a0c0, groundLight: 0x8a6a3a, star: 0xffffe0,
  },
];
export const PALETTES = BASES;

function jitter(c: number, r: Rand, h = 0.025, s = 0.06, l = 0.04): number {
  const [R, G, B] = toRGB(c);
  const [hh, ss, ll] = rgbToHsl(R, G, B);
  return hslToHex((hh + r.range(-h, h) + 1) % 1, Math.min(1, Math.max(0, ss + r.range(-s, s))), Math.min(0.97, Math.max(0.03, ll + r.range(-l, l))));
}

function lift(c: number, dl: number, ds: number) { const [R, G, B] = toRGB(c); const [h, s, l] = rgbToHsl(R, G, B); return hslToHex(h, Math.min(1, s + ds), Math.min(0.85, l + dl)); }

/** a planet's palette: a curated base, slightly jittered so no two planets match */
export function planetPalette(seed: number, key?: string): Palette {
  const r = new Rand(seed ^ 0x51ed);
  const base = key ? BASES.find((b) => b.key === key) ?? BASES[0] : BASES[seed % BASES.length];
  const out: any = { ...base };
  for (const k of Object.keys(base)) {
    const v = (base as any)[k];
    if (typeof v === 'number') out[k] = jitter(v, r);
    else if (Array.isArray(v)) out[k] = v.map((c: number) => (k === 'foliage' ? lift(jitter(c, r, 0.03, 0.08, 0.05), 0.07, 0.06) : jitter(c, r, 0.03, 0.08, 0.05)));
  }
  return out as Palette;
}
