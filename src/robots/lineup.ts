// ?test=robots: every unit kind lined up idling (or walking in place, or firing), and a skirmish of two teams on a
// flat test field. The stage stands in for a Game (scene, ground height, fx, the robots list).
import * as THREE from 'three';
import type { Fx } from '../game/fx';
import type { Game } from '../game/game';
import { RobotUnit, spawnRobot, tickRobots, STATS } from './unit';
import { ROBOT_KINDS, type RobotKind } from './models';
import { trisOf } from './kit';
import type { Faction } from '../game/species';

interface Stage { world: { scene: THREE.Scene; surfaceY(x: number, z: number): number; time: number }; region: { N: number; isSolid(x: number, z: number): boolean }; fx: Fx; robots: RobotUnit[] }
let S: Stage | null = null;
function stage(scene: THREE.Scene, fx: Fx): Stage {
  if (S) return S;
  S = { world: { scene, surfaceY: () => 0, time: 0 }, region: { N: 400, isSolid: () => false }, fx, robots: [] };
  (globalThis as unknown as { __tick?: (dt: number) => void }).__tick = (dt: number) => { S!.world.time += dt; tickRobots(S!, dt); };
  (globalThis as unknown as { __robots?: Stage }).__robots = S;
  return S;
}
const facOf = (k: string): Faction => (k.startsWith('sov_') ? 'soviet' : k.startsWith('prc_') ? 'prc' : k.startsWith('expedition') ? 'expedition' : 'veyr');

export function lineup(scene: THREE.Scene, fx: Fx, x0: number, P: URLSearchParams) {
  const st = stage(scene, fx);
  const anim = P.get('anim') ?? 'idle';
  const only = P.get('kinds')?.split(',');
  const out: { obj: THREE.Object3D; x: number; z: number; h: number; name: string; tick(dt: number, t: number): void }[] = [];
  let x = x0 + 1.2;
  const z = P.get('view') === 'all' ? 3.2 : 0;
  for (const kind of ROBOT_KINDS) {
    if (only && !only.includes(kind)) continue;
    const u = spawnRobot(st as unknown as Game, kind as RobotKind, facOf(kind), 0, z);
    const w = Math.max(0.9, u.radius * 2.4);
    x += w / 2; u.x = x; x += w / 2 + 0.3;
    u.yaw = Number(P.get('ry') ?? 0.5);
    u.demo = { speed: anim === 'walk' ? STATS[kind as RobotKind].speed * 0.6 : 0, fire: anim === 'fire' };
    if (anim === 'die') setTimeout(() => u.damage(9999), 1500 + Math.random() * 1500);
    u.update(0.016);
    const tris = u.human ? u.human.tris + u.human.rig.tris : trisOf(u.mesh);
    console.log('unit', kind, 'tris', tris);
    out.push({ obj: u.mesh, x: u.x, z, h: u.height, name: `${kind} (${tris} tris)`, tick() { /* tickRobots runs them */ } });
  }
  return out;
}

/** two teams across a field: the Corps against a Soviet-Chinese-expedition mix */
export function skirmish(scene: THREE.Scene, fx: Fx) {
  const st = stage(scene, fx);
  for (const u of [...st.robots]) u.dispose();
  const A: RobotKind[] = ['trooper', 'trooper', 'trooper', 'scout', 'scout', 'heavy', 'artillery', 'walker', 'worker'];
  const B: RobotKind[] = ['sov_trooper', 'sov_trooper', 'sov_drone', 'sov_tank', 'sov_titan', 'prc_trooper', 'prc_trooper', 'prc_scout', 'prc_mech', 'expedition_soldier', 'expedition_soldier', 'expedition_heavy', 'expedition_rover'];
  const cx = 0, cz = 18;
  A.forEach((k, i) => { const u = spawnRobot(st as unknown as Game, k, 'veyr', cx - 8 + (i % 5) * 1.6 + Math.random() * 0.4, cz - 7 - Math.floor(i / 5) * 1.6); u.yaw = 0; u.order({ k: 'attack', x: cx, z: cz + 6 }); });
  B.forEach((k, i) => { const u = spawnRobot(st as unknown as Game, k, facOf(k), cx - 8 + (i % 6) * 1.6 + Math.random() * 0.4, cz + 7 + Math.floor(i / 6) * 1.6); u.yaw = Math.PI; u.order({ k: 'attack', x: cx, z: cz - 6 }); });
}
