// Palette codes. Every surface of a resource model is painted in "code space": each texel is a ramp and a step on it
// (plus a few flags), never a free colour. Ramps are the master palette's (src/art/palette.ts) and the materials' own
// hue-shifted ramps (Limbophobia's makeRamp: shadows drift cool, lights drift warm), registered by name. The world
// draws the colour a code names; the icon renderer reads the codes back and shades by moving along the ramp, so the
// icons keep each material's own ramp and their tones come in clean clusters.
import { RAMPS, type RampName } from '../../art/palette';

export const RAMP_NAMES = Object.keys(RAMPS) as RampName[];
const RID = new Map<string, number>(RAMP_NAMES.map((n, i) => [n, i]));
const LIST: (readonly number[])[] = RAMP_NAMES.map((n) => RAMPS[n]);
/** register a named ramp (dark -> light); returns its id (a name registers once) */
export function regRamp(name: string, cols: readonly number[]): number {
  const have = RID.get(name); if (have !== undefined) return have;
  if (LIST.length >= 255) throw new Error('too many ramps');
  LIST.push(cols); RID.set(name, LIST.length - 1); return LIST.length - 1;
}
export const rid = (r: string) => { const i = RID.get(r); if (i === undefined) throw new Error('no ramp ' + r); return i; };
export const rampOf = (id: number): readonly number[] => LIST[id] ?? RAMPS.stone;

/** flags on a code */
export const F_EMIT = 1, F_GLOSS = 2, F_METAL = 4, F_GLASS = 8;
/** a code: (flags << 16) | (ramp id << 8) | step */
export type Code = number;
export function code(r: RampName | string, i: number, f = 0): Code {
  const id = rid(r), R = LIST[id]; const k = Math.max(0, Math.min(R.length - 1, Math.round(i)));
  return (f << 16) | (id << 8) | k;
}
/** a code by ramp id */
export const codeI = (id: number, i: number, f = 0): Code => (f << 16) | (id << 8) | Math.max(0, Math.min(LIST[id].length - 1, Math.round(i)));
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
/** a code by ramp fraction (0 = darkest, 1 = lightest) */
export function codeAt(r: RampName | string, t: number, f = 0): Code { const n = LIST[rid(r)].length; return code(r, Math.round(t * (n - 1)), f); }

/** the outline ink of the whole set: the post pipeline's own line colour */
export const INK = 0x07060c;
