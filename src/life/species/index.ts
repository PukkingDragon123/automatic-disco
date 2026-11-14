// The bestiary species as recipes for the general vertebrate builder (anatomy/vertebrate.ts): each file writes one
// animal's body plan, skull, legs, coat and parts as data. An individual's colours come from its design (a ramp step
// each, varied a little per animal by bestiary.ts), so the recipe reads them back as ramp and step.
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { VertSpec } from '../anatomy/vertebrate';
import { lancehorn } from './lancehorn';

export type SpeciesFn = (d: Design, rig: Rig) => VertSpec;
export const SPECIES: Record<string, SpeciesFn> = { lancehorn };

export { rs, sh } from './util';
