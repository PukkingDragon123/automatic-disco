// Flora species and their sprite atlas. Each species is grown (plantStyle) into a few variant structures; each is
// drawn as hand-made pixel art at 32 px/m from the master palette (the far LOD) and kept for the 3D mesher.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex, toRGB } from '../limbo/gfx/pixel';
import { Rand, clamp } from '../core/rand';
import type { Palette } from './palette';
import type { BiomeKey } from './region';
import { PAINT as STYLE, ANIM, GROW, FLAT, type Plant } from './plantStyle';
import { paintGround, type GroundSprite } from './groundArt';
import { HERO_FLAT } from './heroArt';

export type Arch = 'tuft' | 'reed' | 'fern' | 'shrub' | 'broadleaf' | 'umbrella' | 'palm' | 'weeper' | 'spike' | 'rosette' | 'coral' | 'fungus' | 'bulb' | 'barrel' | 'crystalbloom' | 'lily' | 'eyeflower' | 'fiddle' | 'snaptrap' | 'pitcher' | 'sundew' | 'sail' | 'lure' | 'bloom';
export const PX = 32;

export interface Sprite { u0: number; v0: number; du: number; dv: number; w: number; h: number; /** px */ pw: number; ph: number; ax: number }
export interface PlantSpecies {
  id: number; name: string; arch: Arch;
  /** world height range (m) */
  hmin: number; hmax: number;
  leaf: number; accent: number; trunk: number;
  /** habitat */
  fert: number; wetMin: number; wetMax: number; shore: boolean; water: boolean;
  weight: number; cluster: number;
  /** biomass per plant when eaten / absorbed, regrowth s */
  food: number; regrow: number; glow: boolean;
  /** blocks movement / casts big shadows */
  tree: boolean;
  /** 0 sway, 1 breathe, 2 bob, 3 shiver, 4 coil */
  anim: number;
  sprites: Sprite[];
  /** per sprite variant: the grown 3D structure it was drawn from (null for the flat-painted kinds) and its height */
  forms?: (Plant | null)[]; heights?: number[];
}

type Painter = (sp: PlantSpecies, h: number, r: Rand, pal: Palette) => PixelCanvas;
const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));

const PAINT = STYLE as unknown as Record<Arch, Painter>;

// ---------------------------------------------------------------- species generation
const SYL_A = ['vel', 'mor', 'ath', 'sil', 'qua', 'ren', 'dor', 'ixi', 'pha', 'ul', 'zer', 'cly', 'ob', 'tam', 'ny', 'ker', 'lio', 'sap'];
const SYL_B = ['ora', 'ithe', 'ana', 'ulus', 'ia', 'ex', 'opsis', 'ella', 'antha', 'odon', 'aria', 'ium', 'ens', 'ifer'];
export function binomial(r: Rand) {
  const g = r.pick(SYL_A) + r.pick(['', r.pick(SYL_A)]) + r.pick(SYL_B);
  const s = r.pick(SYL_A) + r.pick(SYL_B);
  return g[0].toUpperCase() + g.slice(1) + ' ' + s;
}

interface ArchSpec { arch: Arch; h: [number, number]; fert: number; wet: [number, number]; shore?: boolean; water?: boolean; weight: number; cluster: number; food: number; tree?: boolean }
const ARCHS: ArchSpec[] = [
  { arch: 'tuft', h: [0.3, 0.55], fert: 0.2, wet: [0, 1], weight: 6, cluster: 0.4, food: 4 },
  { arch: 'reed', h: [0.9, 1.5], fert: 0.3, wet: [0.4, 1], shore: true, weight: 2, cluster: 0.8, food: 6 },
  { arch: 'fern', h: [0.8, 1.4], fert: 0.45, wet: [0.45, 1], weight: 3, cluster: 0.6, food: 8 },
  { arch: 'shrub', h: [1.0, 2.0], fert: 0.35, wet: [0.2, 1], weight: 3, cluster: 0.5, food: 14 },
  { arch: 'broadleaf', h: [3.4, 4.8], fert: 0.55, wet: [0.45, 1], weight: 1.2, cluster: 0.85, food: 40, tree: true },
  { arch: 'umbrella', h: [3.6, 5], fert: 0.35, wet: [0.1, 0.65], weight: 0.7, cluster: 0.3, food: 40, tree: true },
  { arch: 'palm', h: [3.4, 4.8], fert: 0.4, wet: [0.35, 1], weight: 0.8, cluster: 0.6, food: 34, tree: true },
  { arch: 'weeper', h: [3.4, 4.6], fert: 0.5, wet: [0.6, 1], shore: true, weight: 0.6, cluster: 0.5, food: 38, tree: true },
  { arch: 'spike', h: [0.9, 1.6], fert: 0.35, wet: [0.2, 0.9], weight: 2.5, cluster: 0.75, food: 7 },
  { arch: 'rosette', h: [0.6, 1.1], fert: 0.15, wet: [0, 0.5], weight: 2, cluster: 0.4, food: 9 },
  { arch: 'coral', h: [0.8, 1.5], fert: 0.3, wet: [0.2, 0.9], weight: 1.6, cluster: 0.6, food: 10 },
  { arch: 'fungus', h: [0.3, 0.8], fert: 0.4, wet: [0.5, 1], weight: 1.5, cluster: 0.85, food: 8 },
  { arch: 'bulb', h: [0.7, 1.2], fert: 0.35, wet: [0.3, 1], weight: 1.4, cluster: 0.6, food: 10 },
  { arch: 'barrel', h: [0.7, 1.6], fert: 0.05, wet: [0, 0.35], weight: 1.4, cluster: 0.3, food: 16 },
  { arch: 'crystalbloom', h: [0.5, 1], fert: 0.05, wet: [0, 1], weight: 0.6, cluster: 0.7, food: 6 },
  { arch: 'lily', h: [0.6, 1], fert: 0, wet: [0, 1], water: true, weight: 1.2, cluster: 0.8, food: 6 },
  { arch: 'eyeflower', h: [0.9, 1.5], fert: 0.3, wet: [0.25, 1], weight: 1.4, cluster: 0.7, food: 9 },
  { arch: 'fiddle', h: [0.8, 1.4], fert: 0.35, wet: [0.4, 1], weight: 1.4, cluster: 0.7, food: 8 },
  { arch: 'snaptrap', h: [0.3, 0.55], fert: 0.3, wet: [0.5, 1], shore: true, weight: 1.3, cluster: 0.8, food: 6 },
  { arch: 'pitcher', h: [0.5, 0.9], fert: 0.25, wet: [0.55, 1], shore: true, weight: 1.1, cluster: 0.75, food: 7 },
  { arch: 'sundew', h: [0.15, 0.3], fert: 0.2, wet: [0.6, 1], shore: true, weight: 1.4, cluster: 0.9, food: 3 },
  { arch: 'sail', h: [1.2, 2.2], fert: 0.2, wet: [0.05, 0.8], weight: 0.9, cluster: 0.5, food: 10 },
  { arch: 'lure', h: [0.8, 1.5], fert: 0.3, wet: [0.3, 1], weight: 1.0, cluster: 0.6, food: 8 },
  { arch: 'bloom', h: [0.5, 1.0], fert: 0.4, wet: [0.2, 0.9], weight: 2.2, cluster: 0.75, food: 6 },
];

const BIOME_ARCH: Partial<Record<BiomeKey, Arch[]>> = {
  desert: ['tuft', 'rosette', 'barrel', 'barrel', 'shrub', 'umbrella', 'spike', 'crystalbloom', 'sail', 'bloom'],
  tundra: ['tuft', 'fern', 'shrub', 'rosette', 'coral', 'fungus', 'weeper', 'broadleaf', 'sundew', 'bloom'],
  crystal: ['tuft', 'crystalbloom', 'crystalbloom', 'coral', 'rosette', 'shrub', 'fungus', 'umbrella', 'sail', 'lure'],
  ashland: ['tuft', 'fungus', 'fungus', 'barrel', 'rosette', 'coral', 'umbrella', 'shrub', 'sail', 'lure'],
  savanna: ['tuft', 'tuft', 'umbrella', 'umbrella', 'shrub', 'spike', 'rosette', 'barrel', 'bulb', 'bloom', 'sail'],
  marsh: ['reed', 'reed', 'lily', 'weeper', 'fern', 'fungus', 'bulb', 'tuft', 'palm', 'fiddle', 'snaptrap', 'pitcher', 'sundew', 'bloom'],
  jungle: ['fern', 'palm', 'palm', 'broadleaf', 'broadleaf', 'bulb', 'coral', 'fungus', 'shrub', 'lily', 'weeper', 'eyeflower', 'pitcher', 'snaptrap', 'lure', 'bloom'],
};
const DEFAULT_ARCH: Arch[] = ['tuft', 'fern', 'shrub', 'broadleaf', 'umbrella', 'palm', 'rosette', 'coral', 'fungus', 'bulb', 'reed', 'lily', 'weeper', 'fiddle', 'bloom', 'snaptrap', 'pitcher', 'lure'];

export function makeFlora(pal: Palette, biome: BiomeKey, seed: number): PlantSpecies[] {
  const r = new Rand(seed ^ 0x5eed);
  const pool = BIOME_ARCH[biome] ?? DEFAULT_ARCH;
  const want = Math.min(pool.length + 3, 15);
  const archs = r.shuffle([...pool, ...r.shuffle([...pool]).slice(0, 3)]).slice(0, want);
  if (!archs.includes('tuft')) archs[0] = 'tuft';
  const out: PlantSpecies[] = [];
  // colours are dealt from shuffled decks so a world's species spread across the whole palette: lime and emerald
  // canopies next to teal weepers, coral and magenta shrubs, golden puffballs, violet fronds
  let fDeck: number[] = [], bDeck: number[] = [];
  const nextF = () => { if (!fDeck.length) fDeck = r.shuffle([...pal.foliage]); return fDeck.pop()!; };
  const nextB = () => { if (!bDeck.length) bDeck = r.shuffle([...pal.bloom]); return bDeck.pop()!; };
  archs.forEach((a, i) => {
    const s = ARCHS.find((x) => x.arch === a)!;
    const glow = a === 'crystalbloom' || a === 'lure' || (a === 'fungus' && r.chance(0.3)) || (a === 'bulb' && r.chance(0.04));
    // flowering kinds often carry their bloom colour into the leaf (coral and magenta shrubs, golden puffballs,
    // red-orange spikes), always rooted in a foliage hue so it reads as a plant rather than paint
    const vivid = (a === 'shrub' || a === 'rosette' || a === 'coral' || a === 'bulb' || a === 'fiddle' || a === 'spike' || a === 'fern') && r.chance(0.45);
    const foliage = nextF(), accent = nextB();
    out.push({
      id: i, name: binomial(r), arch: a, hmin: s.h[0], hmax: s.h[1],
      leaf: a === 'lily' ? mixHex(foliage, 0x3e8a3a, 0.6) : vivid ? mixHex(foliage, accent, r.range(0.4, 0.62)) : foliage, accent: a === 'fungus' ? r.pick([...pal.fungus, ...pal.fungus, accent]) : a === 'crystalbloom' ? pal.crystal : accent, trunk: r.pick(pal.bark),
      fert: s.fert, wetMin: s.wet[0], wetMax: s.wet[1], shore: !!s.shore, water: !!s.water,
      weight: s.weight, cluster: s.cluster, food: s.food, regrow: s.tree ? 240 : 60, glow, tree: !!s.tree, anim: ANIM[a] ?? 0, sprites: [],
    });
  });
  if (!out.some((p) => p.tree) && biome !== 'desert') {
    const s = ARCHS.find((x) => x.arch === 'broadleaf')!;
    out.push({ id: out.length, name: binomial(r), arch: 'broadleaf', hmin: s.h[0], hmax: s.h[1], leaf: r.pick(pal.foliage), accent: r.pick(pal.bloom), trunk: r.pick(pal.bark), fert: s.fert, wetMin: s.wet[0], wetMax: s.wet[1], shore: false, water: false, weight: s.weight, cluster: s.cluster, food: s.food, regrow: 240, glow: false, tree: true, anim: 0, sprites: [] });
  }
  return out;
}

// ---------------------------------------------------------------- atlas
export interface FloraAtlas { tex: THREE.DataTexture; size: number; detail: Sprite[]; detailInfo: GroundSprite[] }

/** paint every species' variants (plus ground-cover detail sprites) into one mipmapped atlas */
export function buildFloraAtlas(species: PlantSpecies[], pal: Palette, seed: number, variants = 3): FloraAtlas {
  const S = 2048;
  const data = new Uint8ClampedArray(S * S * 4);
  let sx = 1, sy = 1, rowH = 0;
  const place = (pc: PixelCanvas, hm: number): Sprite => {
    if (sx + pc.w + 1 > S) { sx = 1; sy += rowH + 2; rowH = 0; }
    if (sy + pc.h + 1 > S) throw new Error('flora atlas full');
    for (let y = 0; y < pc.h; y++) data.set(pc.data.subarray(y * pc.w * 4, (y + 1) * pc.w * 4), ((sy + y) * S + sx) * 4);
    const sp: Sprite = { u0: sx / S, v0: sy / S, du: pc.w / S, dv: pc.h / S, w: pc.w / PX, h: pc.h / PX, pw: pc.w, ph: pc.h, ax: 0.5 };
    sx += pc.w + 2; rowH = Math.max(rowH, pc.h);
    void hm;
    return sp;
  };
  const r = new Rand(seed ^ 0xf10a);
  // tall first: better shelf packing
  const jobs: { sp: PlantSpecies; h: number; r: Rand }[] = [];
  for (const sp of species) for (let v = 0; v < variants; v++) jobs.push({ sp, h: sp.hmin + (sp.hmax - sp.hmin) * (v / Math.max(1, variants - 1)) * r.range(0.85, 1), r: r.fork(sp.id * 31 + v) });
  jobs.sort((a, b) => b.h - a.h);
  for (const j of jobs) {
    const g = GROW[j.sp.arch], sp = j.sp;
    sp.forms ??= []; sp.heights ??= [];
    if (g) { const P = g(sp, j.h, j.r, pal).normalize(); sp.sprites.push(place(P.raster(), j.h)); sp.forms.push(P); }
    else { sp.sprites.push(place((FLAT[sp.arch] ?? HERO_FLAT[sp.arch] ?? PAINT[sp.arch])(sp, j.h, j.r, pal), j.h)); sp.forms.push(null); }
    sp.heights.push(j.h);
  }
  // ground cover: tussocks, clover, flowers, young ferns, mushrooms, sedges, pebbles, litter and twig decals
  const detail: Sprite[] = [], detailInfo: GroundSprite[] = [];
  for (const g of paintGround(pal, seed)) { detail.push(place(g.pc, 0.2)); detailInfo.push(g); }
  const tex = new THREE.DataTexture(new Uint8Array(data.buffer), S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = mipChain(new Uint8Array(data.buffer), S);
  tex.generateMipmaps = false;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  return { tex, size: S, detail, detailInfo };
}
function pebbleish(pc: PixelCanvas, K: number[]) { for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) if (!((x === 0 || x === 4) && (y === 0 || y === 2))) pc.set(x, y + 1, K[ci(3 - x * 0.4 - y * 0.6, 1, 4)]); }

/** coverage-preserving mip chain: a coarse texel is opaque if at least half its children are */
function mipChain(base: Uint8Array, S: number) {
  const levels: { data: Uint8Array; width: number; height: number }[] = [{ data: base, width: S, height: S }];
  let src = base, s = S;
  while (s > 1) {
    const d = s >> 1, out = new Uint8Array(d * d * 4);
    for (let y = 0; y < d; y++) for (let x = 0; x < d; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let k = 0; k < 4; k++) {
        const i = ((y * 2 + (k >> 1)) * s + x * 2 + (k & 1)) * 4;
        if (src[i + 3] > 0) { r += src[i]; g += src[i + 1]; b += src[i + 2]; n++; }
      }
      const o = (y * d + x) * 4;
      if (n >= 2) { out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = 255; }
    }
    levels.push({ data: out, width: d, height: d });
    src = out; s = d;
  }
  return levels;
}
void toRGB; void clamp;
