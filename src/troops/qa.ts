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
  const P = c.pod, a0 = P.yaw;
  const N = g.region.N, free = (x: number, z: number) => !g.region.isSolid(x, z) && !g.region.isWater?.(x, z);
  const spot = (an: number, r: number): [number, number] => { for (let k = 0; k < 12; k++) { const x = P.x + Math.sin(an + k * 0.21) * (r + k * 0.3), z = P.z + Math.cos(an + k * 0.21) * (r + k * 0.3); if (x > 2 && z > 2 && x < N - 2 && z < N - 2 && free(x, z)) return [x, z]; } return [P.x + Math.sin(an) * r, P.z + Math.cos(an) * r]; };
  const kinds = o.robots ?? ['trooper', 'trooper', 'trooper', 'trooper', 'scout', 'scout', 'heavy', 'worker', 'worker', 'artillery'];
  const made: unknown[] = [];
  kinds.forEach((k, i) => { const [x, z] = spot(a0 + 0.9 + (i % 5) * 0.28, 9 + Math.floor(i / 5) * 2.2); try { const u = spawnRobot(g, k as never, 'veyr', x, z); u.yaw = a0; made.push(u); } catch (e) { console.warn('qa robot', k, e); } });
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
      const [x, z] = spot(a0 - 1.1 - j * 0.5 - i * 0.22, 8 + i * 0.8);
      const cr = g.world.spawn(sp, 'veyr', x, z, false); if (!cr) continue;
      g.veyr.allies.add(cr); (g.veyr as any).mark?.(cr); cr.energy = 0.95; cr.homeX = cr.x; cr.homeZ = cr.z;
    }
  });
  g.factory?.workers?.sync?.();
  // a few hostiles out past the perimeter
  if (o.foes !== false) {
    const [fx, fz] = spot(a0 + Math.PI, 30);
    for (let i = 0; i < 3; i++) { try { const u = spawnRobot(g, (i ? 'sov_trooper' : 'sov_tank') as never, 'soviet', fx + i * 1.6, fz + (i % 2) * 1.2); u.order({ k: 'guard', x: u.x, z: u.z }); } catch (e) { console.warn('qa foe', e); } }
  }
  return { robots: made.length, troops: (g.troops?.list?.() ?? []).length };
}
