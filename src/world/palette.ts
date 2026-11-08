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
    // lush temperate: mustard-olive turf, pale dirt, turquoise water; emerald, lime and teal canopies with coral,
    // violet and golden growth mixed through them, orange torch-lilies and red-orange spikes
    key: 'amber', name: 'Amber Verdance',
    grass: 0x7e8a34, grassDry: 0xb49a4a, soil: 0x8a6a46, rock: 0x857d72, sand: 0xd4c294, mud: 0x4e4232, clay: 0xa8683e,
    snow: 0xe6eae8, basalt: 0x3a383e, ore: 0x5a4d58, crystal: 0x7fd4cc,
    water: 0x36b8ae, waterDeep: 0x0f5e78, foam: 0xe2f4ec,
    foliage: [0x4f9a30, 0x2a8a58, 0x3a8c9c, 0xc8566e, 0x8a64b8, 0x9cba36, 0xd2a632, 0x2f7a3e],
    bark: [0x5a402c, 0x6e5440, 0x4a3a36],
    bloom: [0xec7428, 0xdc4430, 0xcc3e8c, 0xf2c232, 0x9a7ce0, 0xf4e8cc], fungus: [0xe0cca8, 0xc85a6a, 0xd89a44],
    sky: 0x86b6da, horizon: 0xe2e6d2, fog: 0xa6bcb0, sun: 0xfff0d2, ambient: 0x94aec4, groundLight: 0x6a5a36, star: 0xfff2c8,
  },
  {
    // dusk heath: heather turf, magenta and amber canopies, teal water, a warm low sun
    key: 'violet', name: 'Violet Dusk',
    grass: 0x7c5e6e, grassDry: 0x9c7a5e, soil: 0x6a4c3c, rock: 0x726a72, sand: 0xc4ac94, mud: 0x3a2c2e, clay: 0x9a5640,
    snow: 0xe8e2e6, basalt: 0x2e2a34, ore: 0x4a4a5c, crystal: 0xd29ad0,
    water: 0x3aa8b0, waterDeep: 0x14465e, foam: 0xe4e2ea,
    foliage: [0xb04a7c, 0xd8883a, 0x2e9a8a, 0xc8484a, 0x6aa244, 0x7a58b8, 0xe2b24a],
    bark: [0x3e2c2a, 0x4e3a3c, 0x33282c],
    bloom: [0xf0b03a, 0x4ac0b0, 0xe25a6e, 0xf2e2b0, 0x5aa6e0, 0xd86ad0], fungus: [0xe2d0de, 0x5ac0b0, 0xe0a07a],
    sky: 0xa47e9a, horizon: 0xecc0a8, fog: 0x9a8090, sun: 0xffd4ac, ambient: 0x9480a4, groundLight: 0x4e3a3e, star: 0xffaa7c,
  },
  {
    // cold steppe: sage turf, slate, glacier-cyan water; teal and blue-green conifers flecked with amber and rust
    key: 'cyan', name: 'Glacier Steppe',
    grass: 0x6a8a5c, grassDry: 0xa6a272, soil: 0x6a5a4a, rock: 0x8a9094, sand: 0xc6c0a4, mud: 0x3c4240, clay: 0x8a6650,
    snow: 0xeef2f3, basalt: 0x343a42, ore: 0x4a5462, crystal: 0x9ce0ee,
    water: 0x46c2cc, waterDeep: 0x125a7c, foam: 0xeaf6f6,
    foliage: [0x2e8a6e, 0xc8783a, 0x5a6ab0, 0x8aac3e, 0x2c6c8a, 0xd0a03e, 0xa44a4a],
    bark: [0x4a4646, 0x5a5046, 0x3c3c44],
    bloom: [0xf0eee0, 0x6ab8e8, 0xe87a8a, 0xb48ae0, 0xf2d24a, 0x4ad0d0], fungus: [0xd8e0e4, 0x6ab0c4, 0xd0c060],
    sky: 0x8ab6d8, horizon: 0xdee8ee, fog: 0xa8bac6, sun: 0xfcfcf0, ambient: 0x9cb4ca, groundLight: 0x5a6660, star: 0xf0f6ff,
  },
  {
    // red mire: rust-red sedge, peat, teal water; teal, ochre-gold and violet growth, orange spikes
    key: 'crimson', name: 'Crimson Mire',
    grass: 0x86523c, grassDry: 0xa27e52, soil: 0x5a3e30, rock: 0x6e605c, sand: 0xc4a07a, mud: 0x30261f, clay: 0x8e4630,
    snow: 0xece6de, basalt: 0x2e2628, ore: 0x4a3d48, crystal: 0xe8c066,
    water: 0x3aa49a, waterDeep: 0x10424e, foam: 0xe4e2d4,
    foliage: [0x2a8a80, 0xc49a32, 0x7a4aa0, 0x5a9a3a, 0x2a5e7a, 0xd06a32, 0xb8486e],
    bark: [0x2e221e, 0x40302a, 0x52382c],
    bloom: [0xf0e0a0, 0x4ab0e0, 0xf2b032, 0xf4e8d8, 0x9ad04a, 0xec6a3a], fungus: [0xe8d8b8, 0xb4d880, 0xe8a060],
    sky: 0xc48e6a, horizon: 0xecc8a2, fog: 0xae866e, sun: 0xffd8b0, ambient: 0xa08470, groundLight: 0x52321f, star: 0xffc08a,
  },
  {
    // savanna: golden straw, ochre laterite, cyan pools; blue-green and emerald scrub, pink-red feathery trees
    key: 'gold', name: 'Gold Savanna',
    grass: 0xa8903c, grassDry: 0xc8ac64, soil: 0x9a6a3e, rock: 0x9a8676, sand: 0xdcc69a, mud: 0x58432e, clay: 0xb8643a,
    snow: 0xf2eee6, basalt: 0x3a3234, ore: 0x584556, crystal: 0x84d8b0,
    water: 0x3cb6c0, waterDeep: 0x105a74, foam: 0xeee8d8,
    foliage: [0x2e8a6a, 0x4a9a44, 0x2c6e84, 0x8aa83a, 0xc85a5a, 0x3a7a5a, 0xd88a3a],
    bark: [0x664a32, 0x7c624a, 0x4a3220],
    bloom: [0xd8402e, 0xf4eada, 0xec7a2a, 0x8a62d0, 0xf4c83a, 0x40b8d0], fungus: [0xe8d2a8, 0xd0705a, 0xa8c470],
    sky: 0x7aaad6, horizon: 0xe6dcbc, fog: 0xbcae8a, sun: 0xfff2da, ambient: 0x94a6bc, groundLight: 0x82643c, star: 0xffffe0,
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
/** saturation ceilings per channel: lush and colourful but believable (paint, not neon). Ground and stone stay
 *  earthy, canopies and flowers may be rich, water reads as clear turquoise. */
const SAT_CAP: Record<string, number> = {
  bloom: 0.82, foliage: 0.66, fungus: 0.6, crystal: 0.55, sun: 1, star: 1, foam: 0.35, water: 0.62, waterDeep: 0.75,
  grass: 0.46, grassDry: 0.46, soil: 0.4, sand: 0.42, clay: 0.5, sky: 0.55, horizon: 0.5,
};

/** a planet's palette: a curated base, slightly jittered so no two planets match */
export function planetPalette(seed: number, key?: string): Palette {
  const r = new Rand(seed ^ 0x51ed);
  const base = key ? BASES.find((b) => b.key === key) ?? BASES[0] : BASES[seed % BASES.length];
  const out: any = { ...base };
  for (const k of Object.keys(base)) {
    const v = (base as any)[k], cap = SAT_CAP[k] ?? 0.42;
    if (typeof v === 'number') out[k] = mute(jitter(v, r), cap);
    else if (Array.isArray(v)) out[k] = v.map((c: number) => mute(jitter(c, r, 0.025, 0.06, 0.045), cap));
  }
  return out as Palette;
}
