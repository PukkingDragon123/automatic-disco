// ?test=factions: a region with a dug-in Soviet base and a PRC station near Unit 07's landing, their build orders
// raised at once, and waves already moving (the Soviet column at Unit 07's works, PRC raiders at the Soviets).
//   &look=sov|prc|front|home   camera target (default sov)    &dist=40 &yaw=0.6
//   &exp=5                     a human expedition lands after 5 s (the parley dialog follows)
//   &ff=20                     fast-forward the faction sim n seconds before showing
//   &peace                     no waves (just the bases)      &seed=11 &biome=meadow
//   &golem                     Unit 07 runs as usual (its camera follows it)
import type { Engine } from '../../app/engine';
import type { Input } from '../../app/input';
import type { BiomeKey } from '../../world/region';
import type { FactionSite } from './plan';
import { Factions } from './index';

export async function testFactions(engine: Engine, input: Input, P: URLSearchParams) {
  const { Game } = await import('../game');
  (await import('../../ui/kit')).setupUI();
  const g = new Game(engine, input, { seed: Number(P.get('seed') ?? 11), biome: (P.get('biome') ?? 'meadow') as BiomeKey, story: false, danger: 3 });
  const L = g.region.landing, N = g.region.N;
  const cl = (v: number) => Math.max(14, Math.min(N - 14, v));
  const plan: FactionSite[] = [
    { faction: 'soviet', x: cl(L.x + 34), z: cl(L.z + 6), strength: 1.2, arrive: 0, name: 'ZARYA' },
    { faction: 'prc', x: cl(L.x + 14), z: cl(L.z - 36), strength: 1.1, arrive: 0, name: 'HONGQI' },
  ];
  if (P.has('exp')) plan.push({ faction: 'expedition', x: cl(L.x - 30), z: cl(L.z + 10), strength: 0.9, arrive: Number(P.get('exp') || 5), name: 'MERIDIAN' });
  // replace the region's own plan with the test layout
  g.factions?.dispose();
  const F = new Factions(g, { plan, test: true, diff: 1.2 });
  g.factions = F;
  g.vision.revealAll = true;
  // skip the hatching; Unit 07 stays parked (free camera) unless &golem
  (g as any).hatchT = 9.5; (g as any).cap?.removeFromParent(); (g as any).cap = null;
  if (!P.has('golem')) g.player.update = () => {};
  const [sov, prc] = F.programmes;
  sov.debugBuildAll(9); prc.debugBuildAll(8);
  for (const s of F.structures) s.built = Math.max(s.built, 0.999);
  if (!P.has('peace')) {
    sov.debugWave(['sov_trooper', 'sov_trooper', 'sov_trooper', 'sov_trooper', 'sov_tank', 'sov_tank', 'sov_titan', 'sov_drone']);
    prc.debugWave(['prc_scout', 'prc_scout', 'prc_scout', 'prc_trooper', 'prc_trooper', 'prc_trooper', 'prc_mech'], true);
  }
  for (let i = 0, n = Number(P.get('ff') ?? 0) * 10; i < n; i++) F.update(0.1);
  const look = P.get('look') ?? 'sov';
  const at = look === 'prc' ? [prc.x, prc.z] : look === 'home' ? [L.x, L.z] : look === 'front' ? [(sov.x + L.x) / 2, (sov.z + L.z) / 2] : [sov.x - 4, sov.z];
  g.cam.followFn(null);
  g.cam.lookAt(at[0], at[1], true);
  g.cam.dist = g.cam.distGoal = Number(P.get('dist') ?? 40);
  setTimeout(() => { g.cam.distGoal = Number(P.get('dist') ?? 40); g.cam.lookAt(at[0], at[1]); }, 900);
  // by default look from Unit 07's side (the bases face it)
  const yaw = P.has('yaw') ? Number(P.get('yaw')) : look === 'home' ? 0.6 : Math.atan2(L.x - at[0], L.z - at[1]);
  g.cam.yaw = g.cam.yawGoal = yaw;
  (window as any).__F = F;
  engine.setScreen(g);
  engine.start();
}
