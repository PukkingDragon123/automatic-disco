// The planner's building illustrations: clean, stylised low-resolution pixel art made offline from REAL RENDERS of each
// building (colour and id passes; src/ui/build/craft/paint_buildings.py). Big ones (64 x 48 art px, shown at 3x) for
// the cards, small ones (32 x 24, shown at 1x or 2x) for tabs, the hotbar and the node map's module windows.
import type { FKind } from '../../factory/defs';
import { ART_KINDS } from './artlist';
import { still } from './studio';

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
/** the illustration of a building: 'big' 64 x 48 or 'small' 32 x 24 art px */
export function art(kind: FKind, size: 'big' | 'small' = 'big'): string {
  if (ART_KINDS.has(kind)) return `${BASE}ui/build/art/${size === 'small' ? 's/' : ''}${kind}.png`;
  return size === 'small' ? still(kind, 32, 24) : still(kind, 64, 48);
}
