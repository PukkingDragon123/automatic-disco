// DEPLOY: the short pod-drop cinematic. The camera drops into the workshop over the cradle, the clamps let go and
// the deck hatch opens under the pod with a hazard strobe; the pod sinks through the floor. Outside, under the
// keel, it falls away from the ship toward the planet on a thruster flare, small and then gone. Then the flow
// starts the planet loop (the descent itself plays in the game).
import * as THREE from 'three';
import type { ShipHub } from './hub';
import type { HubPod } from './pod';
import { csfx } from '../../ui/cineAudio';

const wait = (hub: ShipHub, s: number) => new Promise<void>((res) => { let t = 0; const off = hub.onUpdate((dt) => { t += dt; if (t >= s) { off(); res(); } }); });
const tween = (hub: ShipHub, s: number, f: (k: number) => void) => new Promise<void>((res) => { let t = 0; const off = hub.onUpdate((dt) => { t += dt; const k = Math.min(1, t / s); f(k); if (k >= 1) { off(); res(); } }); });

export async function podDrop(hub: ShipHub) {
  hub.lockInput(true); hub.showChrome(false);
  const refs = hub.interior.rooms.workshop.ctx.refs;
  const pod = refs.pod as HubPod, hatch = refs.hatch as (k: number) => void;
  pod.set(1);
  const P = pod.root.position.clone();
  await hub.shot({ pos: new THREE.Vector3(-14.5, 7.2, -27.5), look: new THREE.Vector3(-6, 0.6, -19.8), fov: 34 }, 1.4);
  csfx('klaxon', 0.5); hub.alarm(true);
  await wait(hub, 0.5);
  csfx('clamp', 0.8);
  await tween(hub, 1.2, (k) => hatch(k));
  csfx('steam', 0.6);
  await tween(hub, 1.6, (k) => { pod.root.position.y = P.y - k * k * 4.5; });
  csfx('whoosh', 0.8);
  // outside, under the keel
  hub.alarm(false);
  hub.fade = 1;
  hub.setCut(0); hub.exterior.setCut(0);
  pod.root.position.set(P.x, -4.2, P.z);
  hub.shot({ pos: new THREE.Vector3(26, -22, -48), look: new THREE.Vector3(-4, -10, -12), fov: 40 }, 0.01);
  await wait(hub, 0.1);
  await tween(hub, 0.5, (k) => { hub.fade = 1 - k; });
  csfx('thrust', 0.9);
  const flare = new THREE.PointLight(0xffb060, 0, 30, 1.6); pod.root.add(flare); flare.position.set(0, 2.4, 0);
  await tween(hub, 3.2, (k) => {
    pod.root.position.set(P.x + k * 6, -4.2 - k * k * 70, P.z + k * 14);
    pod.root.rotation.x = k * 0.5;
    flare.intensity = 40 * Math.min(1, k * 4);
    if (k > 0.75) hub.fade = (k - 0.75) / 0.25;
  });
  hub.emit('deploy');
  hub.fade = 1;
}
