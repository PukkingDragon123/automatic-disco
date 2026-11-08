// The Veyr child's looks: chosen by the player in the mirror pool (ui/babyEditor.ts), kept across runs.
// It is not cute and not human: a gaunt, wax-skinned thing with a long skull, a lipless maw and a nest of tentacles.
export type Skull = 'long' | 'bulb' | 'crest';
export type Eyes = 'pair' | 'cluster' | 'slit' | 'blind';
export type Maw = 'needle' | 'split' | 'radial';
export type Growth = 'none' | 'quills' | 'fins' | 'feelers';
export type Pat = 'none' | 'veins' | 'spots' | 'bands' | 'mottle';
export interface BabyLook {
  name: string; skin: number; belly: number; pat: Pat; patCol: number; eye: number; glow: number;
  skull: Skull; eyes: Eyes; maw: Maw; growth: Growth; tentacles: number; reach: number; gaunt: number;
}
export const SKINS = [0xc4b4d0, 0xd8d0dc, 0x8a96b0, 0x6a4a78, 0x3a6a6a, 0xc8b89c, 0xb07a82, 0x6a7a52, 0x2e2a40, 0xe0c4cc, 0x8a3a52, 0x4a5a8a];
export const BELLIES = [0xf0e6ea, 0xe8d8e4, 0xc8dcd8, 0xe4ccb8, 0xb0b8cc, 0xf4e4cc];
export const PATCOLS = [0x3a2448, 0x6a1e34, 0x1e4a58, 0x14141e, 0x8a4a7a, 0x3e5a2e, 0xa898b8, 0x5a2e1e];
export const EYES = [0x08080e, 0xdcf0ff, 0xff3030, 0x7affe0, 0xb08aff, 0xffd040];
export const GLOWS = [0x7affe0, 0xb8a0ff, 0xff4a7a, 0xffe070, 0x6ac8ff, 0x9aff6a];
export const SKULLS: Skull[] = ['long', 'bulb', 'crest'];
export const EYESETS: Eyes[] = ['pair', 'cluster', 'slit', 'blind'];
export const MAWS: Maw[] = ['needle', 'split', 'radial'];
export const GROWTHS: Growth[] = ['none', 'quills', 'fins', 'feelers'];
export const PATS: Pat[] = ['none', 'veins', 'spots', 'bands', 'mottle'];
export const TENTS = [4, 6, 8];

export const DEFAULT_LOOK: BabyLook = {
  name: 'Veyr', skin: 0xc4b4d0, belly: 0xf0e6ea, pat: 'veins', patCol: 0x3a2448, eye: 0x08080e, glow: 0x7affe0,
  skull: 'long', eyes: 'pair', maw: 'needle', growth: 'none', tentacles: 6, reach: 0.6, gaunt: 0.65,
};
const KEY = 'oddworld.look2';
function valid(l: BabyLook): BabyLook {
  const d = DEFAULT_LOOK, ok = <T>(v: T, list: readonly T[], f: T) => (list.includes(v) ? v : f);
  return {
    ...l, skull: ok(l.skull, SKULLS, d.skull), eyes: ok(l.eyes, EYESETS, d.eyes), maw: ok(l.maw, MAWS, d.maw), growth: ok(l.growth, GROWTHS, d.growth), pat: ok(l.pat, PATS, d.pat),
    tentacles: ok(l.tentacles, TENTS, d.tentacles), reach: Math.min(1, Math.max(0, +l.reach || 0)), gaunt: Math.min(1, Math.max(0, +l.gaunt || 0)), name: String(l.name || 'Veyr').slice(0, 16),
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
    name: pick(['Veyr', 'Ossuary', 'Mote', 'Hollow', 'Quill', 'Nib', 'Cradle', 'Sallow']), skin: pick(SKINS), belly: pick(BELLIES), pat: pick(PATS), patCol: pick(PATCOLS), eye: pick(EYES), glow: pick(GLOWS),
    skull: pick(SKULLS), eyes: pick(EYESETS), maw: pick(MAWS), growth: pick(GROWTHS), tentacles: pick(TENTS), reach: rnd(), gaunt: rnd(),
  });
}
