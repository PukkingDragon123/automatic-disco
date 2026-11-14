// The titan builders by bestiary id (worker-safe: no DOM, no flora).
import type { Design } from '../design';
import type { Rig } from '../morph';
import type { V3 } from '../kit';
import { grovebacker } from './grovebacker';
import { mirewalker } from './mirewalker';
import { cragstrider } from './cragstrider';

export interface TitanSculpt { geo: import('three').BufferGeometry; tex: import('three').DataTexture; tris: number; den: number; fill: number }
export const TITANS: Record<string, (d: Design, rig: Rig, rest: V3[]) => TitanSculpt> = { grovebacker, mirewalker, cragstrider };
export const isTitan = (d: Design) => !!d.beast && d.beast in TITANS;
export function sculptTitan(d: Design, rig: Rig, rest: V3[]): TitanSculpt { return TITANS[d.beast!](d, rig, rest); }
