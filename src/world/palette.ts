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

export const VEYR = { moss: 0x3d6a4a, mossLight: 0x7a9a6a, mossDark: 0x1c3226, vein: 0x6affd8, em: 0x8f7cff, core: 0x46ffc0, spore: 0xb8c87a };
export const RIVALS = [
  { key: 'krell', name: 'The Krell Shard', creep: 0xa86a78, creepLight: 0xd0a0aa, creepDark: 0x4a2230, vein: 0xff6aa0, core: 0xff7ab0 },
  { key: 'sorrow', name: 'Sorrow Bloom', creep: 0x9a6a3a, creepLight: 0xc8a070, creepDark: 0x3e2214, vein: 0xffa040, core: 0xffb050 },
  { key: 'pale', name: 'The Pale Choir', creep: 0x8a90a8, creepLight: 0xc8d0e0, creepDark: 0x2e3244, vein: 0xb8d0ff, core: 0xd0e0ff },
];

const BASES: Palette[] = [
  {
    // temperate: olive turf, umber soil, grey stone; the odd mauve and teal-grey canopy keeps it off-world
    key: 'amber', name: 'Amber Verdance',
    grass: 0x67713c, grassDry: 0x998a5c, soil: 0x6a5038, rock: 0x7c776d, sand: 0xb8a77f, mud: 0x463c30, clay: 0x8c5e45,
    snow: 0xe6eae8, basalt: 0x38363b, ore: 0x5a4d58, crystal: 0x7fbcbc,
    water: 0x4e7672, waterDeep: 0x1e3a44, foam: 0xd6e0da,
    foliage: [0x4b6a35, 0x3a5a46, 0x6a5b6c, 0x857640, 0x405e58, 0x5c7239], bark: [0x4e3a2a, 0x66503c, 0x433836],
    bloom: [0xc06c3e, 0xa85458, 0xceaa52, 0x8a7aa8, 0xb88a94, 0xe2d8bc], fungus: [0xcabca4, 0x88687a, 0xbe9264],
    sky: 0x7c9cba, horizon: 0xc8d0c8, fog: 0x98a6a2, sun: 0xfff0dc, ambient: 0x8c9cae, groundLight: 0x5a4c38, star: 0xfff2c8,
  },
  {
    // dusk heath: plum and heather turf, wine and ochre canopies, warm low sun
    key: 'violet', name: 'Violet Dusk',
    grass: 0x5c4858, grassDry: 0x7a6658, soil: 0x4e3d34, rock: 0x67616a, sand: 0xa69282, mud: 0x342a2c, clay: 0x82513f,
    snow: 0xe8e2e6, basalt: 0x2b2730, ore: 0x4a4a5c, crystal: 0xc596b4,
    water: 0x4b6870, waterDeep: 0x1c2c3a, foam: 0xdcd8dc,
    foliage: [0x6a4d62, 0x8a7442, 0x3c5a56, 0x7a5052, 0x4c5e44, 0x544868], bark: [0x382a28, 0x46363a, 0x2e2629],
    bloom: [0xcfa252, 0x7eb4a0, 0xbe6c72, 0xd8cfa2, 0x8aa6be, 0xb68cae], fungus: [0xd6cad4, 0x72a49a, 0xc6a08e],
    sky: 0x9a7c88, horizon: 0xd8bcaa, fog: 0x8e7c80, sun: 0xffd0ae, ambient: 0x8a7c92, groundLight: 0x46363a, star: 0xffaa7c,
  },
  {
    // cold steppe: sage turf, slate and lichen, pale overcast light
    key: 'cyan', name: 'Glacier Steppe',
    grass: 0x5f7a69, grassDry: 0x8f927b, soil: 0x554b43, rock: 0x83888b, sand: 0xb4b09c, mud: 0x3a3e3a, clay: 0x7a6153,
    snow: 0xeef2f3, basalt: 0x33373e, ore: 0x4a5462, crystal: 0x9cc8d6,
    water: 0x56848a, waterDeep: 0x203c52, foam: 0xe8f0f0,
    foliage: [0x3f6a58, 0x96695a, 0x5e5b76, 0x7a8a50, 0x36586a, 0xa48a5a], bark: [0x464646, 0x544c44, 0x3b3b42],
    bloom: [0xe6e6dc, 0xa0bacc, 0xd6b8be, 0xb0a2c6, 0xd6d4a2, 0x8cbcc6], fungus: [0xd0d6da, 0x88a4ac, 0xb8bb9a],
    sky: 0x8aaec8, horizon: 0xdce4ea, fog: 0xa8b6c0, sun: 0xfafaf2, ambient: 0x9aaec2, groundLight: 0x56605e, star: 0xf0f6ff,
  },
  {
    // red mire: rust-red sedge, peat, teal-grey and ochre growth
    key: 'crimson', name: 'Crimson Mire',
    grass: 0x7a463b, grassDry: 0x8e6a4c, soil: 0x45322b, rock: 0x635856, sand: 0xae9072, mud: 0x2d2521, clay: 0x7a412f,
    snow: 0xece6de, basalt: 0x2b2527, ore: 0x4a3d48, crystal: 0xd8b466,
    water: 0x4b706c, waterDeep: 0x1a333e, foam: 0xdedccf,
    foliage: [0x3c6460, 0x9c8242, 0x5a4466, 0x4b6842, 0x2e4a52, 0x9e5e3e], bark: [0x2b211d, 0x3b2d27, 0x4a3329],
    bloom: [0xdcd4a2, 0x82acc2, 0xdaae56, 0xe8e0d0, 0x9cba74, 0xca7a4c], fungus: [0xdcd0b6, 0xacc290, 0xd2a074],
    sky: 0xbc8c6c, horizon: 0xe4c4a4, fog: 0xa6826e, sun: 0xffdab4, ambient: 0x987c6a, groundLight: 0x4a2f25, star: 0xffc08a,
  },
  {
    // dry savanna: golden straw, ochre laterite, blue-green scrub
    key: 'gold', name: 'Gold Savanna',
    grass: 0x9c8848, grassDry: 0xb4a070, soil: 0x86603c, rock: 0x8c7c6e, sand: 0xccba94, mud: 0x54412f, clay: 0xa4623f,
    snow: 0xf2eee6, basalt: 0x383133, ore: 0x584556, crystal: 0x84c8a8,
    water: 0x4c8082, waterDeep: 0x1c4054, foam: 0xeae4d6,
    foliage: [0x3c6a5e, 0x4b7250, 0x325a60, 0x6a7e42, 0x7a6436, 0x3c5c6c], bark: [0x5e4430, 0x765e48, 0x46311f],
    bloom: [0xbc5054, 0xeae2d2, 0xcc743e, 0x7e66aa, 0xdcbc54, 0x5eaabc], fungus: [0xdecaaa, 0xbc7c6a, 0xa2b67c],
    sky: 0x7aa0c6, horizon: 0xdcd2b8, fog: 0xb6aa8c, sun: 0xfff4e0, ambient: 0x90a0b2, groundLight: 0x7a6040, star: 0xffffe0,
  },
];
export const PALETTES = BASES;

function jitter(c: number, r: Rand, h = 0.02, s = 0.05, l = 0.035): number {
  const [R, G, B] = toRGB(c);
  const [hh, ss, ll] = rgbToHsl(R, G, B);
  return hslToHex((hh + r.range(-h, h) + 1) % 1, Math.min(1, Math.max(0, ss + r.range(-s, s))), Math.min(0.97, Math.max(0.03, ll + r.range(-l, l))));
}

/** cap a colour's HSL saturation, keeping hue and lightness */
function mute(c: number, maxS: number): number {
  const [R, G, B] = toRGB(c);
  const [h, s, l] = rgbToHsl(R, G, B);
  return s > maxS ? hslToHex(h, maxS, l) : c;
}
/** natural ceilings per channel: ground and canopy stay earthy; flowers, crystal and lights may be a little richer */
const SAT_CAP: Record<string, number> = { bloom: 0.55, crystal: 0.42, fungus: 0.4, sun: 1, star: 1, foam: 0.3, water: 0.3, waterDeep: 0.45 };

/** a planet's palette: a curated base, slightly jittered so no two planets match */
export function planetPalette(seed: number, key?: string): Palette {
  const r = new Rand(seed ^ 0x51ed);
  const base = key ? BASES.find((b) => b.key === key) ?? BASES[0] : BASES[seed % BASES.length];
  const out: any = { ...base };
  for (const k of Object.keys(base)) {
    const v = (base as any)[k], cap = SAT_CAP[k] ?? 0.4;
    if (typeof v === 'number') out[k] = mute(jitter(v, r), cap);
    else if (Array.isArray(v)) out[k] = v.map((c: number) => mute(jitter(c, r, 0.025, 0.06, 0.045), cap));
  }
  return out as Palette;
}
