// The golem's build, chosen in the mirror pool (ui/babyEditor.ts) and kept across runs. It is a machine from Earth:
// U.S. Planetary Corps hardware, 1950s atomic-age engineering, bolted into a chunk of asteroid and thrown at an alien
// world. A boulder of a chest with a riveted plate and a porthole onto its reactor, a head that floats free of it,
// arms of loose stones joined by hydraulic pistons, a gravity coil instead of legs. It hangs in the air and pulls the
// ground about like clay.
export type Moss = 'none' | 'lichen' | 'moss';
export type Veins = 'cracks' | 'veins' | 'runes';
export type Head = 'lens' | 'visor' | 'twin';
export type Top = 'antenna' | 'tubes' | 'dish' | 'crystals';
export type Arms = 'fists' | 'claws' | 'hammers';
export interface BabyLook {
  name: string; rock: number; metal: number; glow: number; moss: Moss; veins: Veins; head: Head; top: Top; arms: Arms; bulk: number;
}
/** basalt, iron chondrite, carbonaceous, granite, sandstone, obsidian, pumice, slate */
export const ROCKS = [0x48444a, 0x5e4034, 0x4a443c, 0x6e6a66, 0x86705a, 0x26232c, 0x9a948a, 0x3e4650];
/** army olive, gunmetal, brass, fire-engine red, appliance cream, navy, safety yellow, chrome */
export const METALS = [0x5a6438, 0x4a5058, 0xa8843e, 0x9a3428, 0xd8cca8, 0x2e3a5a, 0xd0a020, 0xa8acb0];
export const GLOWS = [0x7affe0, 0x9aff6a, 0xffb040, 0x6ac8ff, 0xff6a5a, 0xc8a0ff, 0xfff0a0];
export const MOSSES: Moss[] = ['none', 'lichen', 'moss'];
export const VEINS: Veins[] = ['cracks', 'veins', 'runes'];
export const HEADS: Head[] = ['lens', 'visor', 'twin'];
export const TOPS: Top[] = ['antenna', 'tubes', 'dish', 'crystals'];
export const ARMS: Arms[] = ['fists', 'claws', 'hammers'];

export const DEFAULT_LOOK: BabyLook = { name: 'Veyr', rock: 0x48444a, metal: 0x5a6438, glow: 0x7affe0, moss: 'lichen', veins: 'cracks', head: 'lens', top: 'antenna', arms: 'fists', bulk: 0.5 };
const KEY = 'oddworld.golem2';
function valid(l: BabyLook): BabyLook {
  const d = DEFAULT_LOOK, ok = <T>(v: T, list: readonly T[], f: T) => (list.includes(v) ? v : f);
  const num = (v: unknown, f: number) => (typeof v === 'number' && isFinite(v) ? v : f);
  return {
    name: String(l.name || 'Veyr').slice(0, 16), rock: num(l.rock, d.rock), metal: num(l.metal, d.metal), glow: num(l.glow, d.glow), moss: ok(l.moss, MOSSES, d.moss),
    veins: ok(l.veins, VEINS, d.veins), head: ok(l.head, HEADS, d.head), top: ok(l.top, TOPS, d.top), arms: ok(l.arms, ARMS, d.arms), bulk: Math.min(1, Math.max(0, num(l.bulk, d.bulk))),
  };
}
export function loadLook(): BabyLook {
  try { const s = localStorage.getItem(KEY); if (s) return valid({ ...DEFAULT_LOOK, ...JSON.parse(s) }); } catch { /* private mode */ }
  return { ...DEFAULT_LOOK };
}
export function saveLook(l: BabyLook) { try { localStorage.setItem(KEY, JSON.stringify(valid(l))); } catch { /* ignore */ } }
export function randomLook(rnd: () => number = Math.random): BabyLook {
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  return valid({
    name: pick(['Veyr', 'Pebble', 'Lode', 'Cairn', 'Flint', 'Unit 7', 'Scree', 'Tuff', 'Atlas', 'Bolt']), rock: pick(ROCKS), metal: pick(METALS), glow: pick(GLOWS), moss: pick(MOSSES),
    veins: pick(VEINS), head: pick(HEADS), top: pick(TOPS), arms: pick(ARMS), bulk: rnd(),
  });
}
