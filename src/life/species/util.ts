// Colour helpers for the species recipes: an individual's palette colours back as ramp steps.
import { RAMPS, nearestRamp, type RampName } from '../../art/palette';

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
