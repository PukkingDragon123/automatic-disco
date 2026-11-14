// Biotech: engineered creatures and plants as the production engine (PILLARS.md, pillar 0). One call wires it
// into a running region: the field runtime (game.biotech), the Bio-Works structures in the factory catalogue,
// and the work-order desk.
import type { Game } from '../game/game';
import { Biotech } from './runtime';
import { attachStructures } from './structures';
import { BioUI } from './ui';

export function installBiotech(game: Game): Biotech {
  const bt = new Biotech(game);
  attachStructures(game, bt);
  new BioUI(game, bt);
  return bt;
}
export { Biotech } from './runtime';
