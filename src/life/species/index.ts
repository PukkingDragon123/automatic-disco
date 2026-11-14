// The bestiary species as recipes for the general vertebrate builder (anatomy/vertebrate.ts): each file writes one
// animal's body plan, skull, legs, coat and parts as data. An individual's colours come from its design (a ramp step
// each, varied a little per animal by bestiary.ts), so the recipe reads them back as ramp and step.
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { VertSpec } from '../anatomy/vertebrate';
import { mossback } from './mossback';
import { stiltwool } from './stiltwool';
import { lancehorn } from './lancehorn';
import { scaleback } from './scaleback';
import { gallowneck } from './gallowneck';
import { shellhunter } from './shellhunter';
import { fanfin } from './fanfin';
import { gillnewt } from './gillnewt';
import { woolpuff } from './woolpuff';
import { spiracle } from './spiracle';
import { ribbon } from './ribbon';
import { reedneck } from './reedneck';
import { knuckler } from './knuckler';
import { duskwing } from './duskwing';
import { gapejaw } from './gapejaw';

export type SpeciesFn = (d: Design, rig: Rig) => VertSpec;
export const SPECIES: Record<string, SpeciesFn> = { mossback, stiltwool, lancehorn, scaleback, gallowneck, shellhunter, fanfin, gillnewt, woolpuff, spiracle, ribbon, reedneck, knuckler, duskwing, gapejaw };

export { rs, sh } from './util';
