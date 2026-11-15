// The memorial in the mess: a bronze plaque on the bow-side wall with the fallen crew's names engraved (the crew
// page's plaque region), a small shelf under it with three candles that flicker, a folded program flag and a potted
// cutting from the hydroponics racks. Built only once someone has died; rebuilt (re-engraved) on every death.
import * as THREE from 'three';
import { Kit } from '../../robots/kit';
import { gbuf } from '../../gfx/gbuf';
import { crewMats, paintPlaque } from './paint';
import { crewState } from './state';
import { ROSTER, type CrewId } from './roster';
import type { HubRoomLike } from './life';

/** build (or refresh) the memorial in a room (the mess); null while nobody has died */
export function memorial(room: HubRoomLike): THREE.Object3D | null {
  const st = crewState();
  const fallen = (Object.keys(st.dead) as CrewId[]).map((id) => ({ name: ROSTER[id].name, role: ROSTER[id].role, how: st.dead[id]!.how, day: st.dead[id]!.day }));
  const old = room.root.getObjectByName('crew-memorial');
  if (!fallen.length) { old?.removeFromParent(); return null; }
  paintPlaque(fallen);
  if (old) return old;
  const b = room.bounds;
  const g = new THREE.Group(); g.name = 'crew-memorial';
  g.position.set(b.max.x - 1.6, 0, b.max.z - 0.06); g.rotation.y = Math.PI;
  const k = new Kit(10);
  k.on(g, 0);
  k.box(0, 1.6, 0.012, 0.98, 0.46, 0.022, 'br', { ch: 0.006 });
  k.rivets([-0.46, 1.81, 0.025], [0.46, 1.81, 0.025], 2, 0.006, 'z', 'st0'); k.rivets([-0.46, 1.39, 0.025], [0.46, 1.39, 0.025], 2, 0.006, 'z', 'st0');
  k.box(0, 1.22, 0.07, 0.8, 0.025, 0.14, 'pb1', { ch: 0.004 }); k.bracket(0.07, 0.06, 0.1, 0.006);
  // candles
  for (const x of [-0.3, -0.22, 0.26]) k.cyl(x, 1.27 + (x > 0 ? 0.01 : 0), 0.08, 0.018, 0.018, 0.07 + (x > 0 ? 0.02 : 0), 10, 'cw:ceramic');
  // the potted cutting
  k.cyl(0.05, 1.27, 0.08, 0.035, 0.028, 0.07, 10, 'cw:canvas');
  // the folded flag: a triangle prism
  k.prism(-0.08, 1.245, 0.06, [[-0.07, 0], [0.07, 0], [0, 0.07]], 0.04, 'cw:navy');
  k.on(g, 1);
  k.push(0, 1.6, 0.024).decal(0, 0, 0, 0.94, 0.41, 'cw:plaque').pop();
  for (let i = 0; i < 5; i++) { const a = i * 1.26; k.push(0.05, 1.33, 0.08, 0, a, 0.5).tri([0, 0, 0], [0.018, 0.03, 0], [0, 0.07, 0], 'cw:leaf', [0, 0, 1, 0.5, 0, 1]); k.tri([0, 0, 0], [0, 0.07, 0], [0.018, 0.03, 0], 'cw:leaf', [0, 0, 0, 1, 1, 0.5]); k.pop(); }
  k.finish(crewMats());
  // the flames
  const fm = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }); gbuf(fm, 0);
  const flames: THREE.Mesh[] = [];
  for (const [x, h] of [[-0.3, 0.07], [-0.22, 0.07], [0.26, 0.09]]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 6), fm); f.position.set(x, 1.27 + (x > 0 ? 0.01 : 0) + h / 2 + 0.018, 0.08); g.add(f); flames.push(f); }
  const light = new THREE.PointLight(0xffb060, 0.8, 2.5, 2); light.position.set(0, 1.4, 0.3); g.add(light);
  let t = 0;
  // the flicker runs as the first flame is drawn
  flames[0].onBeforeRender = () => { t += 1 / 60; flames.forEach((f, i) => f.scale.set(1, 0.8 + Math.sin(t * 13 + i * 2) * 0.15 + Math.sin(t * 29 + i) * 0.08, 1)); light.intensity = 0.7 + Math.sin(t * 11) * 0.08; };
  room.root.add(g);
  return g;
}
