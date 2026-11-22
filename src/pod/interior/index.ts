// The pod's inside (v7): game.podHome (what is built in there and the happiness it makes) and enterPod(game), the
// zoom from the colony into the cabin: the camera pushes in on the pod, an iris closes on it, the cabin opens.
//   installPodHome(game) -> PodHome     enterPod(game)     PodInterior.current
import * as THREE from 'three';
import type { Game } from '../../game/game';
import { PodHome } from './home';
import { PodInterior } from './screen';
import { transition } from '../../ui/kit/transitions';
import { uiSfx } from '../../ui/kit/sound';
import { anyG } from '../../research/util';
import { preloadDecor } from './decor';

export { PodHome, PodInterior };
export function installPodHome(g: Game): PodHome {
  const G = anyG(g);
  const home = new PodHome(g);
  G.podHome = home;
  G.update$?.push((dt: number) => { home.hook(); home.tick(dt); });
  return home;
}
let entering = false;
/** zoom from the colony into the pod */
export async function enterPod(g: Game) {
  const G = anyG(g);
  if (entering || PodInterior.current || !G.colony || G.engine.screen !== g) return;
  if (G.unlocks && !G.unlocks.has('pod:interior')) return;
  entering = true;
  void preloadDecor();
  const pod = G.colony.pod, cam = G.cam;
  const save = { goal: cam.goal.clone(), dist: cam.distGoal, min: cam.minDist };
  // push in on the pod's hatch
  cam.minDist = 3; cam.lookAt(pod.x, pod.z); cam.distGoal = 6;
  uiSfx('swishIn', 0.6);
  const v = new THREE.Vector3(pod.x, pod.y + 1.6, pod.z).project(cam.cam);
  const x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
  await new Promise((r) => setTimeout(r, 380));
  try {
    await transition('iris', () => {
      const scr = new PodInterior(g, G.engine, G.podHome, () => {
        G.engine.pop();
        cam.lookAt(save.goal.x, save.goal.z); cam.distGoal = save.dist; cam.minDist = save.min;
        uiSfx('metalClose', 0.6);
      });
      G.engine.push(scr);
      uiSfx('metalClose', 0.7); uiSfx('creak', 0.5);
    }, { x, y });
  } finally { entering = false; }
}
