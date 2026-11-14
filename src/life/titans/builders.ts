// The anatomy-built models (worker-safe: no DOM, no flora): the titans by bestiary id, and every species with a
// recipe for the general vertebrate builder (anatomy/vertebrate.ts, species/).
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { V3 } from '../kit';
import { grovebacker } from './grovebacker';
import { mirewalker } from './mirewalker';
import { cragstrider } from './cragstrider';
import { recipeFor } from '../species';
import { buildVertebrate } from '../anatomy/vertebrate';

export interface TitanSculpt { geo: import('three').BufferGeometry; tex: import('three').DataTexture; tris: number; den: number; fill: number }
export const TITANS: Record<string, (d: Design, rig: Rig, rest: V3[]) => TitanSculpt> = { grovebacker, mirewalker, cragstrider };
export const isTitan = (d: Design) => !!d.beast && d.beast in TITANS;
export function sculptTitan(d: Design, rig: Rig, rest: V3[]): TitanSculpt { return TITANS[d.beast!](d, rig, rest); }
/** built whole from the anatomy library (a titan, or a vertebrate with a recipe) */
export const isAnatomy = (d: Design) => isTitan(d) || !!recipeFor(d);
export function sculptAnatomy(d: Design, rig: Rig, rest: V3[]): TitanSculpt {
  if (isTitan(d)) return sculptTitan(d, rig, rest);
  const r = recipeFor(d);
  if (!r) throw new Error('no anatomy recipe for ' + d.name);
  return buildVertebrate(d, rig, rest, r(d, rig));
}
