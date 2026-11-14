// The anatomy-built models (worker-safe: no DOM, no flora): the titans by bestiary id, every vertebrate with a recipe
// for the general vertebrate builder (anatomy/vertebrate.ts, species/), and the arthropods, serpents and gastropods
// (anatomy/arthropod.ts, anatomy/softbody.ts).
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { V3 } from '../kit';
import { grovebacker } from './grovebacker';
import { mirewalker } from './mirewalker';
import { cragstrider } from './cragstrider';
import { recipeFor } from '../species';
import { buildVertebrate } from '../anatomy/vertebrate';
import { buildArthropod } from '../anatomy/arthropod';
import { buildSerpent, buildGastropod } from '../anatomy/softbody';

export interface TitanSculpt { geo: import('three').BufferGeometry; tex: import('three').DataTexture; tris: number; den: number; fill: number }
export const TITANS: Record<string, (d: Design, rig: Rig, rest: V3[]) => TitanSculpt> = { grovebacker, mirewalker, cragstrider };
export const isTitan = (d: Design) => !!d.beast && d.beast in TITANS;
export function sculptTitan(d: Design, rig: Rig, rest: V3[]): TitanSculpt { return TITANS[d.beast!](d, rig, rest); }
/** built whole from the anatomy library (a titan, a vertebrate with a recipe, an arthropod, a serpent, a gastropod) */
export const isAnatomy = (d: Design) => isTitan(d) || !!recipeFor(d) || d.plan === 'hexapod' || d.plan === 'octopod' || d.plan === 'serpent' || d.plan === 'gastropod';
export function sculptAnatomy(d: Design, rig: Rig, rest: V3[]): TitanSculpt {
  if (isTitan(d)) return sculptTitan(d, rig, rest);
  if (d.plan === 'hexapod' || d.plan === 'octopod') return buildArthropod(d, rig, rest);
  if (d.plan === 'serpent') return buildSerpent(d, rig, rest);
  if (d.plan === 'gastropod') return buildGastropod(d, rig, rest);
  const r = recipeFor(d);
  if (!r) throw new Error('no anatomy recipe for ' + d.name);
  return buildVertebrate(d, rig, rest, r(d, rig));
}
