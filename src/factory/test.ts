// ?test=factory: a region with a small production line already running beside the nearest ferrite seam: a miner,
// belts, a smelter, a constructor, a core uplink, power poles back to the core, a storage crate and a crew of two
// harnessed workers (one minding the smelter, one hauling). &seed=n &build opens the catalogue at once.
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import type { BiomeKey } from '../world/region';
import type { Game } from '../game/game';
import type { Factory } from './factory';
import { FDEFS, rotXZ, footW, footD, type FKind } from './defs';
import { RECIPE } from './recipes';

export async function testFactory(engine: Engine, input: Input, P: URLSearchParams) {
  const { Game } = await import('../game/game');
  const { openLab } = await import('../ui/forge');
  const { openSkillTree } = await import('../ui/skillTree');
  const g = new Game(engine, input, {
    seed: Number(P.get('seed') ?? 5), biome: (P.get('biome') ?? 'meadow') as BiomeKey, story: false,
    hooks: { openBuilder: (game) => openLab(engine, game), openLab: (game) => openLab(engine, game), openSkills: (game) => openSkillTree(engine, game) },
  });
  const sk = g.run.skills;
  for (const id of ['torso', 'armR', 'drill', 'excavate', 'siphon', 'intake', 'tanks', 'graft', 'punch', 'convert', 'works', 'assembler', 'steam', 'haul', 'operate', 'blueprint', 'belt2', 'chem', 'turret', 'sow']) sk.owned.add(id);
  sk.points = 3;
  for (const r of ['ore', 'carbon', 'water', 'soil'] as const) g.run.res[r] = 300;
  const f = g.factory;
  for (const [id, n] of [['iron_plate', 60], ['iron_rod', 30], ['screw', 120], ['concrete', 40], ['copper_wire', 30], ['glass', 20], ['rotor', 4], ['cable', 20], ['fruit', 30]] as const) f.inventory[id] = n;
  layLine(g, f);
  // skip the hatching: Unit 07 is up at once
  (g as unknown as { hatchT: number }).hatchT = 8.95;
  // &ff=seconds runs the works ahead (the factory alone; the wild does not move)
  const ff = Number(P.get('ff') ?? 0);
  for (let i = 0; i < ff * 20; i++) (f as unknown as { step(dt: number): void }).step(1 / 20);
  engine.setScreen(g);
  engine.start();
  // once the golem is up, put it beside the line and pull the camera back over the works
  const t0 = performance.now();
  const iv = setInterval(() => {
    if (!g.player.started) return;
    clearInterval(iv);
    const c = (g as unknown as { __line?: [number, number] }).__line;
    if (c) { g.player.x = c[0] + 2.5; g.player.z = c[1] + 2; }
    g.cam.distGoal = Number(P.get('dist') ?? 17);
    if (P.has('build')) f.build.open(null, 'select');
    void t0;
  }, 200);
  (window as unknown as { __factory: Factory }).__factory = f;
}

/** a miner on the nearest ferrite seam and a line running away from it */
function layLine(g: Game, f: Factory) {
  const core = g.veyr.core!;
  const seams = f.seams.filter((s) => s.kind === 'ore').sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z));
  // the line in local cells (x across, z along the flow): [kind, x, z, local rotation]
  const plan: [FKind, number, number, number][] = [
    ['miner1', 0, 0, 0], ['belt1', 1, 2, 0], ['belt1', 1, 3, 0], ['belt1', 1, 4, 0],
    ['smelter', 0, 5, 0], ['belt1', 1, 7, 0], ['belt1', 1, 8, 0], ['belt1', 1, 9, 0],
    ['constructor', 0, 10, 0], ['belt1', 1, 12, 0], ['belt1', 1, 13, 0], ['splitter', 1, 14, 0],
    ['belt1', 1, 15, 0], ['depot', 0, 16, 0], ['belt1', 2, 14, 3], ['crate', 3, 14, 3],
    ['pole', -2, 3, 0], ['pole', -2, 11, 0], ['barracks', -5, 6, 0],
  ];
  for (const s of seams) for (let r = 0; r < 4; r++) {
    const ax = Math.floor(s.x) - 1, az = Math.floor(s.z) - 1;
    const at = plan.map(([k, lx, lz, lr]) => {
      const def = FDEFS[k], rr = (lr + r) & 3;
      // rotate the local footprint rectangle about the miner's corner
      const w = def.w, d = def.d;
      const c1 = rotXZ(lx - 1, lz - 1, r), c2 = rotXZ(lx + (lr & 1 ? d : w) - 1, lz + (lr & 1 ? w : d) - 1, r);
      const cx = ax + 1 + Math.min(c1[0], c2[0]), cz = az + 1 + Math.min(c1[1], c2[1]);
      return { k, cx, cz, r: rr, w: footW(def, rr), d: footD(def, rr) };
    });
    if (at.some((p) => f.why(p.k, p.cx, p.cz, p.r, true))) continue;
    const built = at.map((p) => f.place(p.k, p.cx, p.cz, p.r, true));
    if (built.some((b) => !b)) continue;
    f.setRecipe(built[4]!, RECIPE.iron_ingot); f.setRecipe(built[8]!, RECIPE.iron_plate);
    // poles back to the core
    const mid = built[8]!;
    (g as unknown as { __line: [number, number] }).__line = [built[4]!.x, built[4]!.z];
    let px = mid.x - 2, pz = mid.z;
    for (let k = 0; k < 12; k++) {
      const d = Math.hypot(core.x - px, core.z - pz);
      if (d < 9) break;
      px += ((core.x - px) / d) * 8.5; pz += ((core.z - pz) / d) * 8.5;
      for (let t = 0; t < 9; t++) { const ox = (t % 3) - 1, oz = Math.floor(t / 3) - 1; if (f.place('pole', Math.floor(px) + ox, Math.floor(pz) + oz, 0, true)) break; }
    }
    built[16]!.store.set('fruit', 20);
    // a crew: two grazers nearby broken to the harness
    const near = g.world.creatures.filter((c) => !c.dead && c.faction === 'wild' && c.diet !== 'carn' && c.radius < 1).sort((a, b) => Math.hypot(a.x - mid.x, a.z - mid.z) - Math.hypot(b.x - mid.x, b.z - mid.z));
    for (const c of near.slice(0, 2)) { c.x = mid.x - 3 + Math.random(); c.z = mid.z + Math.random(); g.veyr.convert(c); }
    f.workers.sync();
    const crew = f.workers.list;
    if (crew[0]) f.workers.assign(crew[0].c, 'operate', built[4]!);
    if (crew[1]) f.workers.assign(crew[1].c, 'haul');
    return;
  }
  console.warn('test=factory: no room for the line');
}
