// v7 QA pages over a stand-in colony (no planet to render): ?test=mastery&v7=tree | pod | reveal
//   tree    the skill tree after the first few quests (&unlock=<node> plays an unlock after a moment)
//   pod     the ruined pod's inside (&decor=1 builds a few pieces with their bounce and dust)
//   reveal  the dock with its learned slots, then a new slot's reveal (&slot=research)
import type { Engine, Screen } from '../app/engine';
import { Mastery } from './mastery';
import { Research } from './research';
import { Upgrades } from './upgrades';
import { Unlocks } from './progress';
import { Quests } from '../story/quests';
import { Tracker } from '../story/tracker';
import { Social } from '../social/social';
import { BondMeter } from '../social/bond';
import { portraitRenderer } from '../social/portrait';
import { PodHome } from '../pod/interior/home';
import { PodInterior } from '../pod/interior/screen';
import { openTree } from './ui/tree';
import { revealDock } from './ui/reveal';
import { pick } from './util';
import { bindTestHost } from './index';

export async function testV7(engine: Engine, P: URLSearchParams) {
  const stock = new Map<string, number>();
  const put = (id: string, n: number) => stock.set(id, (stock.get(id) ?? 0) + n);
  for (const [id, n] of [['iron_plate', 40], ['iron_rod', 24], ['gear', 16], ['motor', 6], ['circuit', 10], ['servo', 4], ['copper_wire', 40], ['glass', 8], ['steel_beam', 4], ['crystal', 4], ['fruit', 30], ['water', 20]] as [string, number][]) put(pick(id), n);
  const fns: Record<string, ((d: any) => void)[]> = {};
  const world = { time: 300 };
  const host: any = {
    world, engine, paused: false, run: { skills: { owned: new Set<string>(['works']) } }, update$: [],
    factory: { buildings: [], count: (id: string) => stock.get(id) ?? 0, take: (id: string, n: number) => { const h = stock.get(id) ?? 0; if (h < n) return false; stock.set(id, h - n); return true; }, put, add: (id: string, n: number) => put(id, n), power: () => ({ supply: 0, demand: 0, cap: 0, grids: 0 }) },
    on: (ev: string, f: (d: any) => void) => { (fns[ev] ??= []).push(f); },
    emit: (ev: string, d: unknown) => { for (const f of fns[ev] ?? []) f(d); },
  };
  const tms = [{ id: 'kristiansen', alive: true, morale: 64, x: 0, z: 0 }, { id: 'mamani', alive: true, morale: 58, x: 0, z: 0 }];
  host.colony = { teammates: tms, teammate: (id: string) => tms.find((t) => t.id === id) ?? null, vitals: { morale: 61, moraleTarget: () => 60 }, daylight: () => 1 };
  const M = new Mastery(); M.now = () => world.time;
  const R = new Research(host, M), U = new Upgrades(host), UL = new Unlocks(host), Q = new Quests(host), S = new Social();
  host.mastery = M; host.research = R; host.upgrades = U; host.unlocks = UL; host.quests = Q; host.social = S;
  R.gate = UL; UL.quests = Q; UL.social = S;
  bindTestHost(host);
  portraitRenderer(engine.renderer);
  host.podHome = new PodHome(host);
  // the colony a quarter of an hour in: Teo met, a few scans, the RESEARCH slot learned, the first quests running
  for (const id of ['q_wake', 'q_look']) { Q.start(id); for (const s of ['talk:guide', 'scan', 'scan', 'scan']) Q.hit(s); }
  S.add('guide', 9, 'qa'); S.add('kristiansen', 4, 'qa'); S.add('mamani', 3, 'qa');
  R.addData('bio', 9, 'qa'); R.addData('geo', 7, 'qa'); R.addData('energy', 3, 'qa');
  UL.tick();
  const base: Screen = { update(dt) { world.time += dt; }, render() { engine.renderer.setClearColor(0x0b0c0e); engine.renderer.clear(); } } as Screen;
  engine.setScreen(base);
  (window as any).__prog = host;
  const view = P.get('v7') ?? 'tree';
  if (view === 'tree') {
    new Tracker(Q);
    openTree(host, engine);
    const un = P.get('unlock'); if (un) setTimeout(() => (window as any).__tree?.unlock(un), Number(P.get('at') ?? 4000));
  } else if (view === 'pod') {
    new BondMeter(S); new Tracker(Q); Q.start('q_home');
    const scr = new PodInterior(host, engine, host.podHome, () => engine.pop());
    engine.push(scr);
    if (P.has('decor')) setTimeout(() => { scr.qaPlace('bunk', -0.25, 0.1, 0.35); setTimeout(() => { scr.qaPlace('heater', 0.85, -0.25, -0.7); scr.qaPlace('lamp', -1.25, 1.2, 0.6); scr.qaPlace('plant', 1.1, 1.3, 0); scr.qaPlace('radio', 0.5, 0.55, 2.6); scr.qaPlace('chair', 0.2, -1.05, 3.0); }, 1500); }, Number(P.get('at') ?? 3000));
  } else if (view === 'reveal') {
    const { Dock } = await import('../ui/hud7/dock');
    const d = new Dock(null); document.body.append(d.el);
    const slot = P.get('slot') ?? 'research';
    for (const id of ['build', 'research', 'troops', 'lab', 'ship']) { const el = d.icon(id as never); if (el) { el.style.display = id === 'build' || id === slot ? '' : 'none'; if (id === slot) el.style.visibility = 'hidden'; } }
    setTimeout(() => void revealDock(slot, () => { const el = d.icon(slot as never); if (el) el.style.visibility = ''; d.badge(slot as never, '!'); }), Number(P.get('at') ?? 1500));
  }
  void PodInterior;
}
