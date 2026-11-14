// The titans: hero creatures built whole from the anatomy library (src/life/anatomy), skinned to the rig that
// morph.ts gives every bestiary quadruped or hexapod, so the shared Animator, its gaits and the titans' stomp work
// unchanged. sculpt.ts hands a titan's design here.
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { V3 } from '../kit';
import { grovebacker } from './grovebacker';

export interface TitanSculpt { geo: import('three').BufferGeometry; tex: import('three').DataTexture; tris: number; den: number; fill: number }
export const TITANS: Record<string, (d: Design, rig: Rig, rest: V3[]) => TitanSculpt> = { grovebacker };
export const isTitan = (d: Design) => !!d.beast && d.beast in TITANS;
export function sculptTitan(d: Design, rig: Rig, rest: V3[]): TitanSculpt { return TITANS[d.beast!](d, rig, rest); }
