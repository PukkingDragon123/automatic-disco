// The planner's building illustrations: 2D pixel art painted offline with lowpix's brush from colour / id / normal
// passes of each building (src/ui/build/craft/paint_buildings.py). Big ones (96 x 72 art px) for the cards, small ones
// (48 x 36) for tabs, the hotbar and the node map's cork board. A building without a painting gets a studio still.
import type { FKind } from '../../factory/defs';
import { ART_KINDS } from './artlist';
import { still } from './studio';

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
/** the illustration of a building: 'big' 96 x 72 or 'small' 48 x 36 art px (shown at 2x and 1x) */
export function art(kind: FKind, size: 'big' | 'small' = 'big'): string {
  if (ART_KINDS.has(kind)) return `${BASE}ui/build/art/${size === 'small' ? 's/' : ''}${kind}.png`;
  return size === 'small' ? still(kind, 48, 36) : still(kind, 96, 72);
}
