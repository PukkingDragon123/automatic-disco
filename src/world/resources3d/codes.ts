// Palette codes. Every surface of a resource model is painted in "code space": each texel is a master-palette ramp
// and a step on it (plus a few flags), never a free colour. The world draws the colour the code names; the icon
// renderer reads the codes back and shades by moving along the ramp (light from the upper left), so the icons keep
// the palette exactly and their tones come in clean clusters.
import { RAMPS, type RampName } from '../../art/palette';

export const RAMP_NAMES = Object.keys(RAMPS) as RampName[];
const RID = new Map<RampName, number>(RAMP_NAMES.map((n, i) => [n, i]));
export const rid = (r: RampName) => RID.get(r)!;
export const rampOf = (id: number): readonly number[] => RAMPS[RAMP_NAMES[id]] ?? RAMPS.stone;

/** flags on a code */
export const F_EMIT = 1, F_GLOSS = 2, F_METAL = 4, F_GLASS = 8;
/** a code: (flags << 16) | (ramp id << 8) | step */
export type Code = number;
export function code(r: RampName, i: number, f = 0): Code {
  const R = RAMPS[r]; const k = Math.max(0, Math.min(R.length - 1, Math.round(i)));
  return (f << 16) | (rid(r) << 8) | k;
}
export const cRamp = (c: Code) => (c >> 8) & 255;
export const cStep = (c: Code) => c & 255;
export const cFlags = (c: Code) => (c >> 16) & 255;
export const cLen = (c: Code) => rampOf(cRamp(c)).length;
/** the same ramp, d steps lighter (negative: darker), clamped */
export function shift(c: Code, d: number): Code {
  const n = cLen(c); return (c & ~255) | Math.max(0, Math.min(n - 1, cStep(c) + Math.round(d)));
}
/** the colour a code names */
export const colorOf = (c: Code) => rampOf(cRamp(c))[cStep(c)];
/** a code by ramp fraction (0 = darkest, 1 = lightest): ramps differ in length */
export function codeAt(r: RampName, t: number, f = 0): Code { const n = RAMPS[r].length; return code(r, Math.round(t * (n - 1)), f); }

/** the outline ink of the whole set: the post pipeline's own line colour */
export const INK = 0x07060c;
