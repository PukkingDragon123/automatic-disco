// The Veyr child's looks, chosen in the mirror pool (ui/babyEditor.ts) and kept across runs. A small, fat, goofy
// amphibian-thing (frog face, salamander tail, axolotl gills) that happens to be silicon-based: crystal warts, gem
// eyes, a lodestone glowing through its belly. It comes from a low-gravity world and floats on its own field.
export type Gills = 'feathery' | 'crystal' | 'none';
export type EyeStyle = 'big' | 'huge' | 'googly';
export type Back = 'warts' | 'fin' | 'smooth';
export type Tail = 'stub' | 'long' | 'none';
export type Pat = 'none' | 'spots' | 'stripes' | 'speckles' | 'patches';
export interface BabyLook {
  name: string; skin: number; belly: number; pat: Pat; patCol: number; eye: number; glow: number;
  gills: Gills; eyes: EyeStyle; back: Back; tail: Tail; chub: number; blush: boolean;
}
export const SKINS = [0x6ad8a8, 0xff9ac0, 0x6ac8f0, 0xffc04a, 0xb08aff, 0x4ab8a0, 0xff7a5a, 0xf4f0e4, 0x3a5a9a, 0x9ae04a, 0xe060a0, 0x9a7a5a];
export const BELLIES = [0xfff4d8, 0xffe0ec, 0xe8f8ff, 0xf0ffd8, 0xfff0a0, 0xffd8c0];
export const PATCOLS = [0x1a3a5a, 0x2a2a5a, 0x6a1a4a, 0xffffff, 0xffd040, 0x1a1a1a, 0x8a3ad0, 0xe05a2a];
export const EYES = [0xffc030, 0xff4a2a, 0x5ae0ff, 0x7aff7a, 0xb08aff, 0x2a2a3a];
export const GLOWS = [0x7affe0, 0xb8a0ff, 0xff7ab8, 0xffe070, 0x6ac8ff, 0x9aff6a];
export const GILLS: Gills[] = ['feathery', 'crystal', 'none'];
export const EYESTYLES: EyeStyle[] = ['big', 'huge', 'googly'];
export const BACKS: Back[] = ['warts', 'fin', 'smooth'];
export const TAILS: Tail[] = ['stub', 'long', 'none'];
export const PATS: Pat[] = ['none', 'spots', 'stripes', 'speckles', 'patches'];

export const DEFAULT_LOOK: BabyLook = {
  name: 'Veyr', skin: 0x6ad8a8, belly: 0xfff4d8, pat: 'spots', patCol: 0x1a3a5a, eye: 0xffc030, glow: 0x7affe0,
  gills: 'feathery', eyes: 'big', back: 'warts', tail: 'stub', chub: 0.75, blush: true,
};
const KEY = 'oddworld.look4';
function valid(l: BabyLook): BabyLook {
  const d = DEFAULT_LOOK, ok = <T>(v: T, list: readonly T[], f: T) => (list.includes(v) ? v : f);
  const num = (v: unknown, f: number) => (typeof v === 'number' && isFinite(v) ? v : f);
  return {
    name: String(l.name || 'Veyr').slice(0, 16), skin: num(l.skin, d.skin), belly: num(l.belly, d.belly), pat: ok(l.pat, PATS, d.pat), patCol: num(l.patCol, d.patCol), eye: num(l.eye, d.eye), glow: num(l.glow, d.glow),
    gills: ok(l.gills, GILLS, d.gills), eyes: ok(l.eyes, EYESTYLES, d.eyes), back: ok(l.back, BACKS, d.back), tail: ok(l.tail, TAILS, d.tail), chub: Math.min(1, Math.max(0, num(l.chub, d.chub))), blush: l.blush !== false,
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
    name: pick(['Veyr', 'Bloop', 'Pip', 'Mote', 'Gub', 'Nib', 'Toby', 'Lode']), skin: pick(SKINS), belly: pick(BELLIES), pat: pick(PATS), patCol: pick(PATCOLS), eye: pick(EYES), glow: pick(GLOWS),
    gills: pick(GILLS), eyes: pick(EYESTYLES), back: pick(BACKS), tail: pick(TAILS), chub: 0.4 + rnd() * 0.6, blush: rnd() < 0.85,
  });
}
