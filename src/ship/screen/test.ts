// ?test=ship7: the SHIP and LAB screens over a stand-in colony (no planet to render), opened from the real dock.
//   &open=ship|lab          open a slot after a moment (default ship)
//   &room=<id>&fn=<fn>      open the ship screen onto a room and function
//   &learn=a,b,c            unlock graph nodes first (free): ship_cargo, ship_lab, ship_medbay, mission, ship_mess ...
//   &all                    everything learned (same as ?unlockall)
//   &hover=<room>           hover a room (its lock tag) once open
import type { Engine, Screen } from '../../app/engine';
import type { Input } from '../../app/input';
import { Mastery } from '../../research/mastery';
import { Research } from '../../research/research';
import { Unlocks } from '../../research/progress';
import { Mission } from '../../research/mission';
import { Quests } from '../../story/quests';
import { Social } from '../../social/social';
import { portraitRenderer } from '../../social/portrait';
import { pick } from '../../research/util';
import { bindTestHost } from '../../research/index';
import { Run } from '../../game/run';
import { installKitStyle } from '../../ui/kit/style';
import { installShipScreens } from './index';

export async function testShip7(engine: Engine, _input: Input, P: URLSearchParams) {
  installKitStyle();
  const stock = new Map<string, number>();
  const put = (id: string, n: number) => stock.set(id, (stock.get(id) ?? 0) + n);
  for (const [id, n] of [['iron_plate', 40], ['iron_rod', 24], ['gear', 16], ['motor', 6], ['circuit', 10], ['servo', 4], ['copper_wire', 40], ['glass', 8], ['steel_beam', 4], ['crystal', 4], ['fruit', 30], ['water', 20], ['tissue', 3], ['plant_cutting', 2], ['blood_sample', 1], ['fibre', 12], ['bio_oil', 4]] as [string, number][]) put(pick(id), n);
  const fns: Record<string, ((d: any) => void)[]> = {};
  const world = { time: 300 };
  const host: any = {
    world, engine, paused: false, run: new Run(4242), opts: { seed: 77, hooks: {} }, update$: [],
    factory: { buildings: [], count: (id: string) => stock.get(id) ?? 0, take: (id: string, n: number) => { const h = stock.get(id) ?? 0; if (h < n) return false; stock.set(id, h - n); return true; }, put, add: (id: string, n: number) => put(id, n), power: () => ({ supply: 0, demand: 0, cap: 0, grids: 0 }) },
    on: (ev: string, f: (d: any) => void) => { (fns[ev] ??= []).push(f); },
    emit: (ev: string, d: unknown) => { for (const f of fns[ev] ?? []) f(d); },
    veyr: { core: { x: 64, z: 64 }, res: { helix: 40 } }, vaults: 0,
    addDesign: (d: any) => { console.info('filed design', d.name, d.fit); host.run.reg.add(d, 'veyr', null, 'design', 0); },
  };
  host.storage = { count: (id: string) => stock.get(id) ?? 0, take: (id: string, n: number) => host.factory.take(id, n) };
  const tms = [{ id: 'kristiansen', name: 'Kristiansen', alive: true, hp: 62, suit: 81, hunger: 35, fatigue: 48, morale: 64, x: 0, z: 0 }, { id: 'mamani', name: 'Mamani', alive: true, hp: 88, suit: 70, hunger: 22, fatigue: 30, morale: 58, x: 0, z: 0 }];
  host.colony = { teammates: tms, teammate: (id: string) => tms.find((t) => t.id === id) ?? null, vitals: { morale: 61 }, arms: [{ kind: 'manipulator', hp: 80 }, { kind: 'drill', hp: 100 }], drones: [{ kind: 'scout', battery: 0.7 }], structures: [], sol: 4, save() { console.info('settlement saved'); } };
  const M = new Mastery(); M.now = () => world.time;
  const R = new Research(host, M), UL = new Unlocks(host), Q = new Quests(host), S = new Social(), MI = new Mission(host);
  host.mastery = M; host.research = R; host.unlocks = UL; host.quests = Q; host.social = S; host.mission = MI;
  R.gate = UL; UL.quests = Q; UL.social = S;
  bindTestHost(host);
  portraitRenderer(engine.renderer);
  S.add('guide', 30, 'qa'); S.add('kristiansen', 12, 'qa'); S.add('mamani', 14, 'qa');
  R.addData('bio', 14, 'qa'); R.addData('geo', 9, 'qa'); R.addData('energy', 6, 'qa'); R.addData('xeno', 3, 'qa');
  // the ship link and its first rooms are learned; the rest waits
  for (const id of ['dock_research', 'dock_build', 'dock_lab', 'dock_ship', ...(P.get('learn') ?? 'mission,ship_cargo').split(',').filter(Boolean)]) UL.unlock(id, true);
  MI.issue(); MI.issue();
  // a lab design to fit: a worker from the run's first plan
  const base: Screen = { update(dt) { world.time += dt; for (const f of host.update$) f(dt); }, render() { engine.renderer.setClearColor(0x1d2420); engine.renderer.clear(); } } as Screen;
  engine.setScreen(base);
  (window as any).__prog = host; (window as any).__g = host;
  // a painted backdrop (so the veil reads over something)
  const bg = document.createElement('div'); bg.style.cssText = 'position:fixed;inset:0;z-index:0;background:radial-gradient(ellipse at 40% 40%, #5a6a48, #2a3424 60%, #161c14)'; document.body.append(bg);
  const { Dock } = await import('../../ui/hud7/dock');
  const d = new Dock(host); document.body.append(d.el); d.el.style.zIndex = '50';
  host.dock = d; (window as any).__dock = d;
  installShipScreens(host);
  const open = P.get('open') ?? 'ship';
  setTimeout(async () => {
    if (open === 'ship' && (P.get('room') || P.get('fn'))) { const { openShipScreen } = await import('./index'); await openShipScreen(host, { room: (P.get('room') ?? undefined) as never, fn: (P.get('fn') ?? undefined) as never, close: async (after) => after() }); }
    else if (open !== 'none') void d.open(open as never);
  }, Number(P.get('at') ?? 800));
}
