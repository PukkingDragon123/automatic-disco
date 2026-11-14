// ?test=ecosys: a full game (no story) fast-forwarded through a day of the ecosystem, the camera on a herd.
//   &seed= &biome=        the region
//   &days=1               how long to fast-forward (in-game days)
//   &t=0.75               then run on to this time of day (0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight)
//   &focus=herd|water|pred|base    where to look
//   &ov=water|soil|life   switch the ecology overlay on;  &survey   open the field survey sheet
//   &irrigate             water a patch near the base first (an engineering demo); &dist= camera distance
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import type { BiomeKey } from '../world/region';
import type { Creature } from '../game/creature';
import { ecoView } from './view';

export async function testEcosys(engine: Engine, input: Input, P: URLSearchParams) {
  const { Game } = await import('../game/game');
  const g = new Game(engine, input, { seed: Number(P.get('seed') ?? 5), biome: (P.get('biome') ?? 'meadow') as BiomeKey, pal: P.get('pal') ?? undefined, story: false, hooks: {} });
  const any = g as unknown as { hatchT: number; cap: { removeFromParent(): void } | null };
  any.hatchT = 9; any.cap?.removeFromParent(); any.cap = null; g.cam.followFn(null);
  // a free survey camera: Unit 07 stays parked (pass &golem to keep it, walking about and frightening things)
  if (!P.has('golem')) (g.player as unknown as { update: (dt: number) => void }).update = () => {};
  const w = g.world, eco = w.eco, L = g.region.landing;
  if (P.has('irrigate')) eco.irrigate(L.x + 14, L.z + 6, 9, 1, Infinity);
  const t0 = performance.now();
  const days = Number(P.get('days') ?? 1);
  let sim = days * w.dayLen;
  if (P.has('t')) { const want = Number(P.get('t')); sim += ((want - (w.day + days) % 1) + 1) % 1 * w.dayLen; }
  const step = 0.25;
  // &trace=Name: log what that species is up to every 30 s of the fast-forward
  const trace = P.get('trace');
  let nextTrace = 0;
  for (let s = 0; s < sim; s += step) {
    g.cam.update(0, input); w.update(step, g.cam.cam); for (const h of w.hives) h.update(step);
    if (trace && s >= nextTrace) {
      nextTrace += 30;
      const l = w.creatures.filter((c) => !c.dead && c.sp.name.includes(trace));
      console.log(`[trace] t${s.toFixed(0)} day${w.day.toFixed(2)} ` + l.slice(0, 6).map((c) => `#${c.id}:${c.mind}${c.plan ? '>' + c.plan : ''} a${c.actT.toFixed(0)} e${c.energy.toFixed(2)} t${c.thirst.toFixed(2)} f${c.tired.toFixed(2)} hp${(c.hp / c.maxHp).toFixed(2)} g${Math.hypot(c.goalX - c.x, c.goalZ - c.z).toFixed(0)}`).join(' | '));
    }
  }
  console.log(`[ecosys] fast-forwarded ${sim.toFixed(0)} s in ${(performance.now() - t0).toFixed(0)} ms; day ${eco.dayNo} at ${w.day.toFixed(2)}`);
  // where to look
  const wild = w.creatures.filter((c) => !c.dead && c.faction === 'wild');
  const focus = P.get('focus') ?? 'herd';
  let at: [number, number] = [L.x, L.z + 4];
  if (focus === 'herd') {
    let best: Creature[] = [];
    for (const h of w.herds.values()) { const l = h.filter((c) => !c.dead && c.faction === 'wild'); if (l.length > best.length && l[0].diet !== 'carn') best = l; }
    if (best.length) at = [best.reduce((s, c) => s + c.x, 0) / best.length, best.reduce((s, c) => s + c.z, 0) / best.length];
  } else if (focus === 'pred') { const p = wild.find((c) => c.diet === 'carn' && c.mature); if (p) at = [p.x, p.z]; }
  else if (focus === 'water') { const d = wild.find((c) => c.mind === 'drink') ?? wild[0]; const s = d ? eco.shoreNear(d.x, d.z) : eco.shoreNear(L.x, L.z); if (s) at = s; }
  // keep the camera over the region (a herd by the edge would put it outside, looking at the void)
  const N = g.region.N, m = 26;
  g.cam.lookAt(Math.min(N - m, Math.max(m, at[0])), Math.min(N - m, Math.max(m, at[1])), true);
  g.cam.dist = g.cam.distGoal = Number(P.get('dist') ?? 26);
  const v = ecoView(g);
  if (v) { const ov = P.get('ov'); if (ov) v.setOverlay(ov as 'water'); if (P.has('survey')) v.toggleSurvey(true); }
  const minds: Record<string, Record<string, number>> = {};
  for (const c of wild) { const m = (minds[c.sp.name] ??= {}); m[c.mind] = (m[c.mind] ?? 0) + 1; }
  console.log('[ecosys] minds', JSON.stringify(minds));
  console.log('[ecosys] thirsty', wild.filter((c) => c.thirst > 0.6).map((c) => `${c.sp.name.split(' ').pop()}:${c.mind}/${c.plan} t${c.thirst.toFixed(2)} shore${(() => { const s = eco.shoreNear(c.x, c.z); return s ? Math.hypot(s[0] - c.x, s[1] - c.z).toFixed(0) : '-'; })()} goal${Math.hypot(c.goalX - c.x, c.goalZ - c.z).toFixed(0)}`).join(' | '));
  console.log('[ecosys] species', g.run.reg.list.map((s) => `${s.name}:${s.pheno.diet}:${s.pheno.stats.mass.toFixed(0)}kg`).join(', '));
  console.log('[ecosys] needs', wild.slice(0, 12).map((c) => `${c.sp.name.split(' ').pop()}:${c.mind} e${c.energy.toFixed(2)} t${c.thirst.toFixed(2)} f${c.tired.toFixed(2)}`).join(' | '));
  console.log('[ecosys] census', eco.census().map((r) => `${r.name}:${r.alive}/${r.cap}(${r.status}) b${r.born} d${r.died} ${JSON.stringify(r.causes)}`).join(' | '));
  console.log(`[ecosys] plants died ${eco.diedPlants} sprouted ${eco.sprouted} added ${eco.added}; level ${eco.level.toFixed(2)} season ${eco.seasonName()}`);
  engine.setScreen(g);
  engine.start();
}
