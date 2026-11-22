// The pod's inside (v7): game.podHome (what is built in there and the happiness it makes) and enterPod(game): the
// colony's own camera zooms onto the pod at the colony view's angle, the hull is sliced away to the cabin floor and the
// world around it dims (screen.ts, stage.ts). Exiting zooms back out.
//   installPodHome(game) -> PodHome     enterPod(game)     PodInterior.current
import type { Game } from '../../game/game';
import { PodHome } from './home';
import { PodInterior } from './screen';
import { gameStage, testStage, type PodStage } from './stage';
import { uiSfx } from '../../ui/kit/sound';
import { anyG } from '../../research/util';
import { preloadDecor } from './decor';

export { PodHome, PodInterior, gameStage, testStage };
export type { PodStage };
export function installPodHome(g: Game): PodHome {
  const G = anyG(g);
  const home = new PodHome(g);
  G.podHome = home;
  G.update$?.push((dt: number) => { home.hook(); home.tick(dt); });
  return home;
}
/** zoom from the colony into the pod (same camera, same angle; the hull sliced, the outside dimmed) */
export async function enterPod(g: Game) {
  const G = anyG(g);
  if (PodInterior.current || !G.colony || G.engine.screen !== g) return;
  if (G.unlocks && !G.unlocks.has('pod:interior')) return;
  void preloadDecor();
  const stage = gameStage(g); if (!stage) return;
  uiSfx('swishIn', 0.6); uiSfx('creak', 0.4);
  const scr = new PodInterior(g, G.engine, G.podHome, stage, () => { G.engine.pop(); });
  G.engine.push(scr);
}
