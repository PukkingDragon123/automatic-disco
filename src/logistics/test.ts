// ?test=logistics: a colony yard beside the nearest ferrite seam for visual QA of the build menu and the node map: an
// ore bunker, a smelter, a steel bin and a crate, power poles back to the pod, a worker pen and a crew of four.
//   &chain           wire the IRON INGOT chain (deposit -> bunker -> smelter -> bin) and give it workers
//   &logic           add logic nodes on the chain (splitter, gate on a sensor, timer, counter, buffer) (implies &xp)
//   &xp=n            set the logistics discipline (items routed) to unlock tiers; &unlockall opens everything
//   &field           mark a harvest field in the nearest trees and wire it to the crate
//   &site            lay two construction sites (one awaiting materials, one being built)
//   &nodes           open the node map; &sel=r:<n> | n:<node id> selects; &tut=<step> runs the guide from a step
//   &build           open the construction planner; &tab=<cat> &pick=<kind>; &place=<kind> puts it in hand
//   &speed=n         game speed; &dist=n camera distance; &ff=s run the colony ahead; &noworld[=frames] skip drawing the region
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import type { BiomeKey } from '../world/region';
import type { Game } from '../game/game';
import type { FBuilding } from '../factory/factory';
import { FDEFS, type FKind } from '../factory/defs';
import { RECIPE } from '../factory/recipes';
import { ITEMS } from '../factory/items';
import { itemFor } from './recipes';
import type { BuildCat } from './catalog';

export async function testLogistics(engine: Engine, input: Input, P: URLSearchParams) {
  (await import('../ui/kit')).setupUI();
  const { Game } = await import('../game/game');
  const g: Game = new Game(engine, input, { seed: Number(P.get('seed') ?? 5), biome: (P.get('biome') ?? 'meadow') as BiomeKey, story: false });
  const sk = g.run.skills;
  for (const id of ['torso', 'armR', 'drill', 'excavate', 'siphon', 'intake', 'tanks', 'graft', 'convert', 'works', 'assembler', 'steam', 'haul', 'operate', 'blueprint', 'belt2', 'chem', 'turret', 'sow']) sk.owned.add(id);
  (g as unknown as { hatchT: number }).hatchT = 8.95;
  g.run.flags['inv.tut'] = 1;
  const f = g.factory, L = g.logistics, core = g.veyr.core!;
  // the stores: real items in the hold and the central stores
  const st = (g as unknown as { storage?: { hold: { insert(id: string, n: number): number; stacks: unknown[] } } }).storage;
  const stock: [string, number][] = [['ore', 80], ['wood', 40], ['plank', 30], ['iron_plate', 60], ['iron_rod', 30], ['screw', 80], ['concrete', 30], ['copper_wire', 30], ['glass', 20], ['soil', 60], ['carbon', 40], ['fruit', 30]];
  if (st) { st.hold.stacks = []; for (const [id, n] of stock) if (ITEMS[id]) st.hold.insert(id, n); }
  for (const [id, n] of stock) if (ITEMS[id] && !['ore', 'carbon', 'soil', 'water'].includes(id)) f.inventory[id] = (f.inventory[id] ?? 0) + n;
  if (!st) for (const r of ['ore', 'carbon', 'water', 'soil'] as const) g.run.res[r] = 200;
  // the yard
  const seams = f.seams.filter((s) => !s.drill && (s.item === 'ore' || s.item === itemFor('ore'))).sort((a, b) => Math.hypot(a.x - core.x, a.z - core.z) - Math.hypot(b.x - core.x, b.z - core.z));
  const seam = seams[0];
  const put = (k: FKind, x: number, z: number, r = 0): FBuilding | null => {
    for (let ring = 0; ring < 7; ring++) for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
      const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
      if (f.why(k, cx, cz, r, true)) continue;
      const b = f.place(k, cx, cz, r, true); if (b) { b.rise = 1; return b; }
    }
    return null;
  };
  const sx = seam ? seam.x : core.x + 10, sz = seam ? seam.z : core.z;
  const dirx = Math.sign(core.x - sx) || 1, dirz = Math.sign(core.z - sz) || 1;
  const kBunker: FKind = FDEFS.st_bunker ? 'st_bunker' : 'crate';
  const kBin: FKind = FDEFS.st_bin ? 'st_bin' : 'crate';
  const bunker = put(kBunker, sx + dirx * 4.5, sz + dirz * 1.5);
  const smelter = put('smelter', sx + dirx * 9, sz + dirz * 4);
  const bin = put(kBin, sx + dirx * 14, sz + dirz * 6);
  const crate = put('crate', sx + dirx * 12, sz - dirz * 2);
  put('barracks', sx + dirx * 4, sz + dirz * 9);
  if (smelter) f.setRecipe(smelter, RECIPE.iron_ingot ?? Object.values(RECIPE).find((r) => r.at === 'smelter')!);
  // power: poles from the smelter back to the pod
  if (smelter) {
    let px = smelter.x - 2, pz = smelter.z;
    for (let k = 0; k < 14; k++) {
      const d = Math.hypot(core.x - px, core.z - pz); if (d < 9) break;
      px += ((core.x - px) / d) * 8; pz += ((core.z - pz) / d) * 8;
      put('pole', px, pz);
    }
  }
  // the crew: grazers nearby broken to the harness
  const near = g.world.creatures.filter((c) => !c.dead && c.faction === 'wild' && c.diet !== 'carn' && c.radius < 1.1).sort((a, b) => Math.hypot(a.x - sx, a.z - sz) - Math.hypot(b.x - sx, b.z - sz));
  for (const c of near.slice(0, Number(P.get('crew') ?? 4))) { c.x = sx + dirx * 6 + Math.random() * 2; c.z = sz + dirz * 3 + Math.random() * 2; g.veyr.convert(c); }
  f.workers.sync();
  for (const w of f.workers.list) f.workers.assign(w.c, 'haul');
  L.sync(true);
  const crew = f.workers.list.map((w) => w.c.id);
  const ore = seam?.item ?? 'ore', ingot = itemFor('iron_ingot') ?? 'iron_ingot';
  const id = (b: FBuilding | null) => (b ? 'b:' + b.id : '');
  if (P.has('xp')) L.xp = Number(P.get('xp'));
  if (P.has('logic') && !P.has('xp')) L.xp = 2000;
  // the chain
  if (P.has('chain') || P.has('logic')) {
    if (bunker) { const bx = bunker as FBuilding; for (let i = 0; i < 24; i++) L.give(L.node(id(bx))!, ore, 1); }
    if (seam) L.addRoute('s:' + seam.i, id(bunker), { filter: [ore], workers: crew.slice(0, 2), priority: 3 });
    const feed = L.addRoute(id(bunker), id(smelter), { filter: [ore], workers: crew.slice(2, 3), priority: 4, amount: { mode: 'keep', n: 20 } });
    if (P.has('logic')) {
      const sm = L.node(id(smelter))!, bn = L.node(id(bin))!, cr = L.node(id(crate))!;
      const split = L.addLogic('split', (sm.x + bn.x) / 2 + 3, (sm.z + bn.z) / 2 - 1)!;
      L.addRoute(sm.id, split.id, { filter: [ingot] });
      const rA = L.addRoute(split.id, bn.id, { filter: [ingot] }), rB = L.addRoute(split.id, cr.id, { filter: [ingot] });
      if (rA && rB) split.cfg.w = { [rA.id]: 3, [rB.id]: 1 };
      const sensor = L.addLogic('sensor', bn.x + 6, bn.z + 4)!;
      Object.assign(sensor.cfg, { probe: bn.id, what: 'count', item: ingot, cmp: '<', th: 60 });
      if (feed) feed.conds.push({ k: 'signal', node: sensor.id }, { k: 'dstBelow', item: ore, n: 30 });
      const tm = L.addLogic('timer', core.x + 6, core.z - 4)!;
      Object.assign(tm.cfg, { period: 120, on: 50 });
      L.addRoute(cr.id, tm.id, { filter: [ingot] }); L.addRoute(tm.id, 'pod', { filter: [ingot], priority: 2 });
      const ctr = L.addLogic('counter', bn.x + 4, bn.z - 6)!; ctr.cfg.n = 40; ctr.count = 17;
      const buf = L.addLogic('buffer', bn.x - 2, bn.z + 8)!; buf.cfg.hi = 30; buf.cfg.lo = 8;
      const gate = L.addLogic('gate', sm.x - 2, sm.z - 7)!; gate.cfg.conds = [{ k: 'day' }, { k: 'powered' }];
      void ctr; void buf; void gate;
    } else L.addRoute(id(smelter), id(bin), { filter: [ingot], workers: crew.slice(3, 4) });
    if (smelter) smelter.outBuf.set(ingot, 6);
  }
  if (P.has('field')) {
    const fl = g.world.flora; let best = -1, bd = 1e9;
    fl.near(sx, sz, 40, (i, d2) => { if (fl.species[fl.sp[i]]?.tree && d2 < bd && d2 > 36) { bd = d2; best = i; } });
    const fx = best >= 0 ? fl.x[best] : sx - dirx * 10, fz = best >= 0 ? fl.z[best] : sz - dirz * 8;
    const fn = L.addField(fx, fz, 9, 'TIMBER STAND');
    if (crate) L.addRoute(fn.id, id(crate), { filter: [itemFor('wood') ?? 'carbon'], workers: crew.slice(3, 4) });
  }
  if (P.has('site')) {
    const s1 = f.sites.placeNear('sawbench', Math.floor(sx + dirx * 4), Math.floor(sz - dirz * 6), 0);
    const s2 = f.sites.placeNear('kiln', Math.floor(sx + dirx * 8), Math.floor(sz - dirz * 7), 1);
    if (s2) { for (const [k, v] of Object.entries(s2.need)) s2.got[k] = v; s2.stage = 'build'; s2.work = s2.workNeed * 0.45; }
    if (s1) { const k = Object.keys(s1.need)[0]; if (k) s1.got[k] = Math.floor((s1.need[k] ?? 0) / 2); }
  }
  (window as unknown as { __g: Game }).__g = g;
  // &noworld skips drawing the region (headless software GPUs take minutes a frame; the UI is what is checked)
  if (P.has('noworld')) { const gr = g as unknown as { render(p: unknown, t: number): void }; let n = 0; const rnd = gr.render.bind(g); gr.render = (p, t) => { if (n++ < Number(P.get('noworld') || 0)) rnd(p, t); }; }
  g.speed = Number(P.get('speed') ?? 1);
  engine.setScreen(g);
  engine.start();
  const iv = setInterval(() => {
    if (!g.player?.started && !P.has('nowait')) return;
    clearInterval(iv);
    const mx = smelter ? smelter.x : sx, mz = smelter ? smelter.z : sz;
    g.cam.lookAt(mx, mz, true);
    g.cam.distGoal = g.cam.dist = Number(P.get('dist') ?? 24);
    const ui = f.ui as unknown as { nodes: import('../ui/nodes/map').NodeMap; menu: import('../ui/build/menu').BuildMenu };
    // &ff=s runs the colony ahead without drawing (headless GPUs draw slowly; the simulation is what matters)
    const ff = Number(P.get('ff') ?? 0);
    if (ff > 0) { const e = engine as unknown as { step(dt: number, draw?: boolean): void }; const n = Math.ceil(ff * 15 / Math.max(1, g.speed)); for (let i = 0; i < n; i++) e.step(1 / 15, false); }
    if (P.has('build')) {
      f.build.openMenu();
      if (P.has('tab')) ui.menu.setTab(P.get('tab') as BuildCat);
      if (P.has('pick')) ui.menu.select(P.get('pick') as FKind);
    }
    if (P.has('place')) f.build.choose(P.get('place') as FKind);
    // &stills: window.__passes(kinds, w, h) shoots the colour / id / normal passes the offline illustration painter reads
    if (P.has('stills')) void import('../ui/build/studio').then((st) => { (window as unknown as Record<string, unknown>).__passes = (kinds: FKind[], w: number, h: number) => Object.fromEntries(kinds.map((k) => [k, st.passes(k, w, h)])); });
    if (P.has('nodes')) {
      ui.nodes.open();
      const s = P.get('sel');
      if (s?.startsWith('r:')) ui.nodes.select({ k: 'route', id: L.routes[Number(s.slice(2))]?.id ?? 0 });
      else if (s?.startsWith('n:')) ui.nodes.select({ k: 'node', id: s.slice(2) });
      else if (s === 'smelter' && smelter) ui.nodes.select({ k: 'node', id: id(smelter) });
      if (P.has('tut')) { ui.nodes.tut.start(); const n = Number(P.get('tut')); for (let i = 1; i < n; i++) (ui.nodes.tut as unknown as { next(): void }).next(); }
      if (P.has('tidy')) ui.nodes.tidy();
    }
  }, 250);
}
