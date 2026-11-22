// TROOPS · QA scenario (not loaded by the game: `import('/src/troops/qa.ts').then((m) => m.troopsQA(__game))`). Fills the
// colony with a squad of the Corps' robots, cyborg workers (designs with robotic parts fitted), the drones, a few
// hostiles to point orders at, and a robot foundry, so every RTS feature can be shown at once.
import type { Game } from '../game/game';
import { spawnRobot } from '../robots/unit';
import { wildDesign } from '../life/design';
import { planetPalette } from '../world/palette';

export function troopsQA(game: Game, o: { robots?: string[]; workers?: number; foes?: boolean } = {}) {
  const g = game as Game & Record<string, any>, c = g.colony; if (!c) return 'no colony';
  c.qa('full'); c.qa('upgrader');
  const P = c.pod;
  // the most open ground near the pod (dense canopy hides units from the camera): the parade ground
  const fl = g.world.flora as any;
  let best = { x: P.x, z: P.z, s: 1e9, a: P.yaw };
  for (let r = 14; r <= 30; r += 4) for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r;
    if (x < 8 || z < 8 || x > g.region.N - 8 || z > g.region.N - 8) continue;
    let n = 0; fl?.near?.(x, z, 7, (i: number) => { if ((fl.bio?.[i] ?? 1) > 0.1) n++; });
    for (let j = 0; j < 8; j++) { const b = (j / 8) * Math.PI * 2; if (g.region.isSolid(x + Math.sin(b) * 5, z + Math.cos(b) * 5) || g.region.isWater?.(x + Math.sin(b) * 5, z + Math.cos(b) * 5)) n += 6; }
    const sc = n + r * 0.4; if (sc < best.s) best = { x, z, s: sc, a };
  }
  const a0 = best.a;
  (g as any).__qaSpot = best;
  const N = g.region.N, free = (x: number, z: number) => !g.region.isSolid(x, z) && !g.region.isWater?.(x, z);
  // a spot around the parade ground (an: bearing, r: distance from its centre)
  const spot = (an: number, r: number): [number, number] => { for (let k = 0; k < 12; k++) { const x = best.x + Math.sin(an + k * 0.5) * (r + k * 0.3), z = best.z + Math.cos(an + k * 0.5) * (r + k * 0.3); if (x > 2 && z > 2 && x < N - 2 && z < N - 2 && free(x, z)) return [x, z]; } return [best.x, best.z]; };
  const kinds = o.robots ?? ['trooper', 'trooper', 'trooper', 'trooper', 'scout', 'scout', 'heavy', 'worker', 'worker', 'artillery'];
  const made: unknown[] = [];
  kinds.forEach((k, i) => { const [x, z] = spot(a0 + Math.PI * 0.5 + (i % 5) * 0.55, 2.5 + Math.floor(i / 5) * 2.4); try { const u = spawnRobot(g, k as never, 'veyr', x, z); u.yaw = a0; made.push(u); } catch (e) { console.warn('qa robot', k, e); } });
  // cyborg workers: two designs with robotic parts fitted
  const pal = planetPalette(g.opts?.seed ?? 11);
  const des = [
    { kind: 'elk', seed: 5501, name: 'Packer', fit: ['cy_collar', 'cy_cargo', 'cy_hydhind'] },
    { kind: 'bear', seed: 5502, name: 'Delver', fit: ['cy_collar', 'cy_drill', 'cy_plating'] },
  ];
  const nW = o.workers ?? 4;
  des.forEach((d, j) => {
    let sp: any = null;
    try { const dz = wildDesign(d.kind as never, pal, d.seed) as any; dz.name = d.name; dz.fit = d.fit; dz.genes = [...(dz.genes ?? []), 'docility']; sp = g.run.reg.add(dz, 'veyr', null, 'design', 0); } catch (e) { console.warn('qa design', e); }
    if (!sp) return;
    for (let i = 0; i < Math.ceil(nW / 2); i++) {
      const [x, z] = spot(a0 - Math.PI * 0.5 - j * 0.7 - i * 0.4, 3.5 + i * 0.9);
      const cr = g.world.spawn(sp, 'veyr', x, z, false); if (!cr) continue;
      g.veyr.allies.add(cr); (g.veyr as any).mark?.(cr); cr.energy = 0.95; cr.homeX = cr.x; cr.homeZ = cr.z;
    }
  });
  g.factory?.workers?.sync?.();
  c.drones.forEach((d: any, i: number) => { const [x, z] = spot(a0 + Math.PI + i * 0.5, 5); d.order = { k: 'move', x, z }; d.docked = false; d.x = x; d.z = z; });
  c.teammates.forEach((t: any, i: number) => { const [x, z] = spot(a0 + Math.PI * 1.4 + i * 0.4, 4); t.x = x; t.z = z; t.job = null; });
  const cr = (g.world.creatures as any[]).filter((q) => q.faction === 'veyr');
  // a few hostiles out past the perimeter
  if (o.foes === true) {
    const [fx, fz] = spot(a0, 26);
    for (let i = 0; i < 3; i++) { try { const u = spawnRobot(g, (i ? 'sov_trooper' : 'sov_tank') as never, 'soviet', fx + i * 1.6, fz + (i % 2) * 1.2); u.order({ k: 'guard', x: u.x, z: u.z }); } catch (e) { console.warn('qa foe', e); } }
  }
  return { robots: made.length, workers: cr.length, spot: [Math.round(best.x), Math.round(best.z), best.s] };
}
/** the most open ground (fewest plants taller than knee height, no rock, no water) between r0 and r1 of (x, z) */
export function openSpot(game: Game, x: number, z: number, r0 = 6, r1 = 18): [number, number] {
  const g = game as Game & Record<string, any>, fl = g.world.flora as any, R = g.region;
  let best: [number, number] = [x, z], bs = 1e9;
  for (let r = r0; r <= r1; r += 3) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r;
    if (px < 6 || pz < 6 || px > R.N - 6 || pz > R.N - 6) continue;
    let n = 0; fl?.near?.(px, pz, 6, (i: number) => { const sp = fl.species?.[fl.sp?.[i]]; if ((fl.bio?.[i] ?? 1) > 0.1) n += (sp?.hmax ?? 0) > 0.5 ? 1 : 0.15; });
    for (let j = 0; j < 8; j++) { const b = (j / 8) * Math.PI * 2; if (R.isSolid(px + Math.sin(b) * 5, pz + Math.cos(b) * 5) || R.isWater?.(px + Math.sin(b) * 5, pz + Math.cos(b) * 5)) n += 8; }
    if (n < bs) { bs = n; best = [px, pz]; }
  }
  return best;
}
