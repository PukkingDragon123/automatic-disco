// ?test=biotech: a region with the bio-works running. An ore-gizzard herd chews the nearest seam into iron pellets,
// a burrower digs a channel from the base, a silk spinner and a hauler work further out, and the Bio-Works stand
// around the core: a bio-reactor, a growth vat with a design in it, a habitat, and a force field up over the works.
// &shot=field|herd|dig|lab|habitat frames the camera on one of them; &skip leaves the structures out.
import * as THREE from 'three';
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import type { BiomeKey } from '../world/region';
import type { Creature } from '../game/creature';
import { wildDesign, type Design } from '../life/design';
import { planetPalette } from '../world/palette';
import { BIO_GENES } from '../life/genesBio';
import { stateOf, queueVat } from './structures';

export async function testBiotech(engine: Engine, input: Input, P: URLSearchParams) {
  const { Game } = await import('../game/game');
  const { openLab } = await import('../ui/forge');
  const seed = Number(P.get('seed') ?? 5);
  const g = new Game(engine, input, {
    seed, biome: (P.get('biome') ?? 'meadow') as BiomeKey, story: false,
    hooks: { openBuilder: (game) => openLab(engine, game), openLab: (game) => openLab(engine, game) },
  });
  const run = g.run, hive = g.veyr, w = g.world, R = g.region, f = (g as any).factory, bt = (g as any).biotech;
  // the tech: lab, splicing, the works and every biotech node
  for (const id of ['torso', 'armR', 'drill', 'excavate', 'siphon', 'intake', 'tanks', 'graft', 'sow', 'convert', 'command', 'lab', 'splice', 'sequencer', 'vat', 'print', 'works', 'haul', 'operate', 'bt_works', 'bt_reactor', 'bt_vat', 'bt_habitat', 'bt_field', 'bt_lock', 'bt_clone']) run.skills.owned.add(id);
  for (const b of BIO_GENES) run.add(b.id, 'test', 0);
  run.res = { ore: 400, carbon: 400, water: 400, soil: 400 };
  g.veyr.res.helix = 80;
  const pal = planetPalette(seed);
  const core = hive.core!;
  // designs: an armoured grazer with an ore gizzard, a bear-bodied burrower, a moth-silk spinner, a pack hauler
  const make = (kind: string, s: number, name: string, add: string[], size?: number): Design => {
    const d = wildDesign(kind, pal, s);
    d.name = name; d.genes = [...d.genes.filter((x) => !BIO_GENES.some((b) => b.id === x)), ...add];
    if (size !== undefined) d.size = size;
    return d;
  };
  const rock = run.reg.add(make('tortoise', 4401, 'Veyr Rockjaw', ['ore_gizzard', 'docility'], 0.36), 'veyr', null, 'design', 0);
  const dig = run.reg.add(make('bear', 4402, 'Veyr Delver', ['dig_claws', 'docility'], 0.5), 'veyr', null, 'design', 0);
  const silk = run.reg.add(make('boar', 4403, 'Veyr Spinner', ['silk_glands', 'oil_glands', 'docility'], 0.28), 'veyr', null, 'design', 0);
  const haul = run.reg.add(make('elk', 4404, 'Veyr Packer', ['hauler_back', 'docility'], 0.4), 'veyr', null, 'design', 0);
  const spawn = (sp: typeof rock, x: number, z: number): Creature | null => {
    const c = w.spawn(sp, 'veyr', x, z, false); if (!c) return null;
    hive.allies.add(c); (hive as any).mark?.(c); c.energy = 0.95; c.homeX = c.x; c.homeZ = c.z;
    return c;
  };
  // the herd goes to the nearest seam (or rock)
  const dep = [...R.deposits].filter((d) => d.amount > 0).sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z))[0];
  const rk = dep ? { x: dep.x, z: dep.z } : bt.findRock(core.x, core.z, 40) ?? { x: core.x + 10, z: core.z };
  const herd: Creature[] = [];
  for (let i = 0; i < 4; i++) { const c = spawn(rock, rk.x + 3 + (i % 2) * 1.5, rk.z + 3 + Math.floor(i / 2) * 1.5); if (c) herd.push(c); }
  for (const c of herd) bt.assign(c, 'produce', rk.x, rk.z);
  // the burrower digs a channel out from the base towards the low ground
  let low = { x: core.x + 14, z: core.z + 2 }, lh = 1e9;
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, x = core.x + Math.cos(a) * 16, z = core.z + Math.sin(a) * 16; const h = R.heightAt(x, z); if (!R.isSolid(x, z) && h < lh) { lh = h; low = { x, z }; } }
  const dx = low.x - core.x, dz = low.z - core.z, dl = Math.hypot(dx, dz) || 1;
  const a0 = { x: core.x + (dx / dl) * 8, z: core.z + (dz / dl) * 8 }, a1 = { x: core.x + (dx / dl) * 17, z: core.z + (dz / dl) * 17 };
  const digger = spawn(dig, a0.x - 1.5, a0.z + 1.5);
  if (digger) bt.assign(digger, 'channel', a0.x, a0.z, a1.x, a1.z);
  // a spinner far out (its silk piles up) and a packer to carry it home
  const far = { x: core.x - (dx / dl) * 40, z: core.z - (dz / dl) * 40 };
  const fx = Math.min(R.N - 8, Math.max(8, far.x)), fz = Math.min(R.N - 8, Math.max(8, far.z));
  const spin = spawn(silk, fx, fz); if (spin) bt.assign(spin, 'produce', fx, fz);
  const pk = spawn(haul, core.x + 3, core.z - 4); if (pk) bt.assign(pk, 'haul', core.x, core.z);
  // engineered plants around the base: resin trees and an orchard
  { const fl = w.flora; let nTree = 0, nFruit = 0;
    fl.near(core.x, core.z, 34, (i) => {
      const sp = fl.species[fl.sp[i]]; if (fl.bio[i] < 0.3 || sp.water) return;
      if (sp.tree) { if (nTree < 4 && !bt.engineerPlant(i, 'resin_bark', true)) nTree++; }
      else if (sp.hmax > 0.5 && nFruit < 5 && !bt.engineerPlant(i, 'fruit_set', true)) nFruit++;
    }); }
  // stores for the workers' upkeep
  f?.put?.('fruit', 80); f?.put?.('protein', 20);
  // the works around the core
  const placed: Record<string, any> = {};
  if (f && !P.has('skip')) {
    const place = (kind: string, r0: number, r1: number, ang = 0) => {
      for (let r = r0; r <= r1; r += 1) for (let k = 0; k < 16; k++) {
        const a = ang + (k / 16) * Math.PI * 2 * (k % 2 ? -1 : 1) * 0.5;
        const cx = Math.round(core.x + Math.cos(a) * r), cz = Math.round(core.z + Math.sin(a) * r);
        const b = f.place(kind, cx, cz, 0, true); if (b) return b;
      }
      return null;
    };
    const ang = Math.atan2(-dz, -dx);
    placed.reactor = place('bt_reactor', 5, 7, ang + 0.9);
    placed.vat = place('bt_vat', 4, 7, ang - 0.9);
    placed.field = place('bt_field', 4, 7, ang);
    placed.hab = place('bt_habitat', 9, 14, ang + 2.2);
    if (placed.hab) { const p = f.place('pole', Math.round((placed.hab.x + core.x) / 2), Math.round((placed.hab.z + core.z) / 2), 0, true); void p; }
    for (const b of Object.values(placed)) if (b) b.rise = 1;
    if (placed.vat) queueVat(placed.vat, rock);
    if (placed.hab) {
      const silk2 = spawn(silk, placed.hab.x + 1, placed.hab.z + 1);
      if (silk2) setTimeout(() => bt.assign(silk2, 'habitat'), 400);
      stateOf(placed.hab).climate = 'tropical';
    }
    // a raider to test the barrier: a hungry wild hunter walking at the works
    const hunter = run.reg.list.find((s) => s.role === 'stalker' || s.role === 'apex');
    if (hunter && placed.field) { const c = w.spawn(hunter, 'wild', placed.field.x + 12, placed.field.z + 2, false); if (c) { c.mind = 'wander'; c.goalX = placed.field.x; c.goalZ = placed.field.z; (c as any).__raid = 1; } }
  }
  (window as any).__bt = { g, bt, herd, digger, spin, pk, placed, rock: rk, chan: [a0, a1] };
  // skip the hatching; frame the shot once the camera is free
  (g as any).hatchT = 8.9;
  const shot = P.get('shot') ?? 'herd';
  let framed = false;
  g.update$.push(() => {
    // keep the raider coming
    for (const c of w.creatures) if ((c as any).__raid && !c.dead && placed.field) { if (c.mind !== 'attack' && c.mind !== 'hunt') { c.mind = 'wander'; c.goalX = placed.field.x; c.goalZ = placed.field.z; } }
    if (framed || w.time < 1.5 || !(g.player as unknown as { started: boolean }).started) return;
    framed = true;
    const at = shot === 'field' && placed.field ? placed.field : shot === 'habitat' && placed.hab ? placed.hab : shot === 'dig' && digger ? { x: (a0.x + a1.x) / 2, z: (a0.z + a1.z) / 2 } : shot === 'works' ? core : herd[0] ?? core;
    // the camera follows Unit 07 once it is under control: bring it over to watch
    const pl = g.player as unknown as { x: number; z: number; moveGoal: unknown; started: boolean }; if (pl) { pl.x = at.x - 2.5; pl.z = at.z + 3.5; pl.moveGoal = null; }
    g.cam.followFn(null); g.cam.lookAt(at.x, at.z, true);
    g.cam.dist = g.cam.distGoal = Number(P.get('dist') ?? (shot === 'field' || shot === 'works' ? 26 : 16));
    if (P.has('yaw')) (g.cam as any).yaw = (g.cam as any).yawGoal = Number(P.get('yaw'));
    if (P.has('sel')) { const who = shot === 'dig' && digger ? [digger] : herd; for (const c of who) { c.selected = true; g.sel.push(c); } }
  });
  if (P.has('ff')) { const n = Number(P.get('ff')); for (let i = 0; i < n * 20; i++) { g.update(0.05); } }
  engine.setScreen(g);
  engine.start();
  void THREE;
}
