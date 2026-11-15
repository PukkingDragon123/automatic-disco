// Helpers for the species recipes: an individual's palette colours back as ramp steps, and surface presets scaled to
// the animal (fur locks, scales, hide and wet skin sized by its body width, so a woolpuff and a mossback both wear
// locks a pixel artist would draw at their size).
import { RAMPS, nearestRamp, type RampName } from '../../art/palette';
import type { Surf } from '../anatomy/coat';

/** a palette colour back as [ramp, step] (exact when it is a master-palette colour, else the nearest ramp's step) */
export function rs(c: number): [RampName, number] {
  for (const k of Object.keys(RAMPS) as RampName[]) { const i = (RAMPS[k] as readonly number[]).indexOf(c); if (i >= 0 && !k.startsWith('glow') && k !== 'stampRed') return [k, i]; }
  const n = nearestRamp(c), R = RAMPS[n] as readonly number[];
  let bi = 0, bd = Infinity;
  R.forEach((v, i) => { const d = Math.abs(((v >> 16) & 255) - ((c >> 16) & 255)) + Math.abs(((v >> 8) & 255) - ((c >> 8) & 255)) + Math.abs((v & 255) - (c & 255)); if (d < bd) { bd = d; bi = i; } });
  return [n, bi];
}
/** a ramp step moved by k (clamped to the ramp) */
export const sh = (c: [RampName, number], k: number): [RampName, number] => [c[0], Math.max(0, Math.min(RAMPS[c[0]].length - 1, c[1] + k))];

/** fur locks for an animal of body width W (k > 1 longer, shaggier) */
export const fur = (W: number, k = 1, down = 0.5): Surf => ({ fur: { len: 0.24 * W * k, width: 0.095 * W * Math.sqrt(k), down } });
/** scales of a kind, sized to the body */
export const scales = (W: number, k = 1, kind: 'shield' | 'pebble' | 'scute' | 'keel' = 'shield', extra: Surf = {}): Surf => ({ scales: { size: 0.11 * W * k, kind }, creases: 0.8, ...extra });
/** pebbled, wrinkled hide */
export const hide = (W: number, k = 1, folds = 0): Surf => ({ pebbles: { size: 0.1 * W * k, depth: 0.9, pores: 0.4 }, folds: folds ? { spacing: 0.1 * W * folds, depth: 0.7 } : undefined, creases: 0.8 });
/** smooth wet skin with glands */
export const wet = (W: number, glands = 0.3, k = 1): Surf => ({ glands: glands ? { size: 0.15 * W * k, density: glands } : undefined, pebbles: { size: 0.05 * W * k, depth: 0.3 }, wet: 0.5, creases: 0.6 });
