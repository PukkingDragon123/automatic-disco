// The progression layer on a planet game: MASTERY (learned by doing), RESEARCH (scan and study), the UPGRADER
// (build-to-unlock), the MISSION (the Meridian's quotas) and the event DIRECTOR (random cinematic choices, the
// teammates' death). installProgression(game) attaches all of it; see src/game/V6.md for the API.
import type { Game } from '../game/game';
import { Mastery, type PathId } from './mastery';
import { Research } from './research';
import { Upgrades } from './upgrades';
import { Mission } from './mission';
import { Director } from '../story/director';
import { registerProgressionBuildings } from './buildings';
import { FDEFS } from '../factory/defs';
import { ITEMS } from '../factory/items';
import { anyG, gtime, resolve } from './util';
import { spawnRuins, bindDrops, bindInstallFx } from './world';
import { transmission } from './ui/transmit';
import { toast } from '../ui/kit';
import { PATH, CORE, PATHS } from './mastery';
import { TECH } from './tech';
import { Unlocks } from './progress';
import { NODE } from './unlocks';
import { Quests } from '../story/quests';
import { Tracker } from '../story/tracker';
import { installSocial } from '../social';
import { installPodHome, enterPod } from '../pod/interior';
import { hookDock } from './dock';

export { Mastery, Research, Upgrades, Mission, Director };
export type { PathId };

/** building category -> the path that learns from building it */
const BUILT: Record<string, PathId> = { extract: 'industry', logistics: 'industry', production: 'industry', storage: 'industry', power: 'energy', eco: 'plant', bio: 'bio', special: 'robotics', defence: 'robotics' };
const KIND_PATH: Record<string, PathId> = { planter: 'plant', sprinkler: 'plant', spreader: 'plant', shed: 'plant', sprayer: 'plant', pen: 'bio', breeder: 'bio', trough: 'bio', barracks: 'bio', robotfab: 'robotics', turret: 'robotics', research_station: 'robotics', upgrader: 'robotics', grav_pole: 'energy', pole: 'energy', boiler: 'energy', steamgen: 'energy', reactor: 'energy' };
const PLANT_ITEMS = /fruit|berr|leaf|leaves|fibre|fiber|wood|bark|resin|seed|tuber|kelp|mushroom|sap|crop|grain|algae/;

let pending: Game | null = null;
// registered at import, before any Factory builds its catalogue
registerProgressionBuildings(() => pending);
/** the test pages run the buildings against a stand-in host (src/research/test.ts) */
export function bindTestHost(host: unknown) { pending = host as Game; }
export function installProgression(game: Game) {
  const G = anyG(game);
  if (G.mastery) return;
  pending = game;
  const mastery = new Mastery(); mastery.now = () => gtime(game);
  const research = new Research(game, mastery);
  const upgrades = new Upgrades(game);
  const mission = new Mission(game);
  const director = new Director(game);
  // v7: start from zero. The unlock graph gates everything; quests teach; closeness opens functions
  const unlocks = new Unlocks(game);
  const quests = new Quests(game);
  research.gate = unlocks;
  G.mastery = mastery; G.research = research; G.upgrades = upgrades; G.mission = mission; G.director = director;
  G.unlocks = unlocks; G.quests = quests;
  const people = installSocial(game, quests);
  G.social = people.social; G.subs = people.subs;
  unlocks.quests = quests; unlocks.social = people.social;
  const home = installPodHome(game);
  // a saved run carries the progression (flow.ts writes run.prog)
  const saved = G.run?.prog;
  if (saved && typeof saved === 'object' && !(saved instanceof Function)) {
    try { mastery.load(saved.mastery); research.load(saved.research); upgrades.load(saved.upgrades); director.load(saved.director); people.social.load(saved.social); quests.load(saved.quests); unlocks.load(saved.unlocks); home.load(saved.home); } catch (e) { console.error('progression load', e); }
  }
  // the run asks for the live state when it is saved
  try { Object.defineProperty(G.run, 'prog', { configurable: true, enumerable: true, get: () => ({ mastery: mastery.toJSON(), research: research.toJSON(), upgrades: upgrades.toJSON(), director: director.toJSON(), unlocks: unlocks.toJSON(), quests: quests.toJSON(), social: people.social.toJSON(), home: home.toJSON() }), set: () => { /* live */ } }); } catch { /* frozen run */ }
  G.progression = { save: () => G.run?.prog, open: (tab?: string) => openTerminal(game, tab as never) };
  const tracker = new Tracker(quests); G.questTracker = tracker;
  hookDock(game, unlocks);
  // clicking the pod zooms inside it (a real click on the canvas, not a selection from elsewhere)
  let lastDown = 0;
  addEventListener('pointerdown', (e) => { if (e.button === 0 && e.target === G.engine?.canvas) lastDown = performance.now(); }, true);
  game.on('colony-select', (s: { kind?: string } | null) => { if (s?.kind === 'pod' && performance.now() - lastDown < 450) void enterPod(game); });
  G.enterPod = () => enterPod(game);
  // quest steps counted from the game's own events
  research.on('scan', (h: { first: boolean }) => { if (h.first) quests.hit('scan'); });
  game.on('sample', (d: { kind?: string }) => quests.hit('sample:' + (d?.kind ?? 'any')));
  game.on('unlock', (d: { id: string }) => { quests.hit('unlock:' + d.id); quests.hit('unlocks'); });
  game.on('built', (d: { kind: string }) => { const def = FDEFS[d?.kind]; if (!def || /^belt|^pipe|^found|^wall/.test(d.kind)) return; quests.hit('build:' + (def.cat ?? 'any')); });
  game.on('placed-structure', (d: { kind?: string }) => quests.hit('place:' + (d?.kind ?? 'any')));
  game.on('built-attachment', () => quests.hit('fit'));
  game.on('screen-open', (d: { id: string }) => quests.hit('open:' + d?.id));
  game.on('pod-enter', () => quests.hit('enter:pod'));
  game.on('decor', (d: { id: string }) => quests.hit('decor:' + d?.id));
  game.on('story-event', (d: { id: string; phase: string }) => { if (d?.phase === 'end') quests.hit('event:' + d.id); });
  // mastery is learned by doing: its core perks install themselves as the levels come
  mastery.on('level', (d: { path: PathId }) => { for (const id of CORE[d.path] ?? []) { if (mastery.has(id)) continue; if (!mastery.why(id)) mastery.take(id); break; } });
  void PATHS;
  const P = new URLSearchParams(location.search);
  // harder planets press harder: danger 1..3 sets tighter quotas and more frequent events
  if (G.opts?.danger) director.difficulty = mission.difficulty = Math.max(0.8, Math.min(1.4, 0.8 + 0.2 * Number(G.opts.danger)));
  if (P.has('difficulty')) director.difficulty = mission.difficulty = Math.max(0.6, Math.min(1.6, Number(P.get('difficulty')) || 1));

  // ---------------------------------------------------------------- learning by doing
  const prodAcc: Record<string, number> = {};
  game.on('built', (d: { kind: string }) => {
    const def = FDEFS[d?.kind]; if (!def) return;
    const p = KIND_PATH[d.kind] ?? BUILT[def.cat] ?? 'industry';
    const size = Math.min(3, Math.max(1, (def.w * def.d) / 4));
    if (!/^belt|^pipe|^found|^wall/.test(d.kind)) mastery.gain(p, 6 + size * 4, 'Built ' + def.name);
  });
  game.on('produced', (d: { item: string; n: number }) => {
    const it = ITEMS[d?.item] as { cat?: string; group?: string } | undefined; if (!it) return;
    const plant = PLANT_ITEMS.test(d.item) || it.group === 'bio' || it.group === 'seed';
    const p: PathId = plant ? 'plant' : 'industry';
    const w = plant ? 0.5 : it.cat === 'raw' ? 0.12 : it.cat === 'refined' ? 0.3 : it.cat === 'part' ? 0.5 : 1;
    prodAcc[p] = (prodAcc[p] ?? 0) + w * (d.n ?? 1);
    if (prodAcc[p] >= 4) { mastery.gain(p, prodAcc[p], plant ? 'Harvest and growing' : 'Production'); prodAcc[p] = 0; }
  });
  game.on('print', (d: { n?: number }) => mastery.gain('bio', 10 * (d?.n ?? 1), 'Printed a creature'));
  game.on('birth', () => mastery.gain('bio', 3, 'Births in the herd'));
  game.on('design', () => mastery.gain('bio', 14, 'New design'));
  game.on('absorb', (d: { species?: string }) => { mastery.gain('bio', 10, 'Absorbed a genome'); research.addData('bio', 8, 'Genome: ' + (d?.species ?? 'species')); });
  game.on('graft', () => mastery.gain('plant', 4, 'Grafted flora'));
  game.on('prefab', (d: { kind?: string }) => mastery.gain(d?.kind === 'plant' ? 'plant' : 'bio', 8, 'Saved a prefab'));
  game.on('convert', () => mastery.gain('bio', 10, 'Converted a creature'));
  game.on('harvested', (d: { n?: number }) => mastery.gain('plant', 2 * (d?.n ?? 1), 'Harvest and growing'));
  game.on('fitted', () => mastery.gain('bio', 12, 'Fitted a robotic part'));
  // the pod's tools (src/colony/tools.ts): samples, specimens, drilling, seeding, new arms and structures
  game.on('sample', (d: { species?: string; item?: string }) => { research.addData('bio', 2, 'Sample: ' + (d?.species ?? d?.item ?? 'tissue')); mastery.gain('bio', 3, 'Samples'); });
  game.on('specimen-delivered', () => { research.addData('bio', 6, 'Specimen'); mastery.gain('bio', 8, 'Specimens delivered'); });
  game.on('drilled', () => mastery.gain('industry', 1.5, 'Drilling'));
  game.on('plant-seed', () => mastery.gain('plant', 2, 'Seeding'));
  game.on('built-attachment', (d: { kind?: string }) => mastery.gain('robotics', 18, 'Fitted ' + (d?.kind ?? 'a part')));
  game.on('placed-structure', (d: { kind?: string }) => mastery.gain(d?.kind === 'gravpole' ? 'energy' : 'robotics', 12, 'Raised a ' + (d?.kind ?? 'structure')));
  game.on('slot-upgrade', () => mastery.gain('robotics', 15, 'Tool slot upgraded'));
  game.on('cannon-hit', (d: { kills?: number }) => { if (d?.kills) mastery.gain('robotics', 4 * d.kills, 'Cannon'); });
  game.on('mastery-xp', (d: { path: PathId; n: number; why?: string }) => { if (d && PATH[d.path]) mastery.gain(d.path, d.n, d.why ?? ''); });
  game.on('scan', (d: { x: number; z: number; r?: number; kind?: string }) => {
    if (!d || !Number.isFinite(d.x)) return;
    // the pod's scanner names its target (creature, deposit, flora): read close round it; a sounding reads wide
    const r = d.r ?? (d.kind === 'ground' ? 10 : d.kind ? 4 : 12);
    const hits = research.scanAt(d.x, d.z, r);
    if (hits.length) {
      const first = hits.filter((h) => h.first);
      const tot: Record<string, number> = {}; for (const h of hits) for (const k in h.data) tot[k] = (tot[k] ?? 0) + (h.data as Record<string, number>)[k];
      toast(`Scan: ${first.length ? `<b>${first.length} new</b> (${first.slice(0, 3).map((h) => h.name).join(', ')}) · ` : ''}${Object.entries(tot).map(([k, n]) => `+${Math.round(n)} ${k.toUpperCase()}`).join(' ')}`, 'good', 4200);
    }
  });
  // feedback
  mastery.on('level', (d: { path: PathId; level: number }) => toast(`<b>${PATH[d.path].name}</b> ${d.level}`, 'good', 3200));
  void TECH; void NODE;
  // the ship's voice
  mission.on('quota', (d: { q: any; phase: string }) => {
    const open = () => openTerminal(game, 'mission'), engine = G.engine;
    if (d.phase === 'new') transmission({ kind: 'new', q: d.q, left: d.q.due - gtime(game), open, engine });
    else if (d.phase === 'warn') transmission({ kind: 'warn', q: d.q, left: d.q.due - gtime(game), text: 'Ninety seconds on this directive. The board is watching.', open });
    else if (d.phase === 'met') transmission({ kind: 'met', q: d.q, text: d.q.early ? 'Received early. A capsule is on its way down.' : 'Received. A capsule is on its way down.', open, engine });
    else if (d.phase === 'missed') transmission({ kind: 'missed', q: d.q, text: mission.strikes >= 2 ? 'Strike two. One more and the program pulls the mission.' : 'The directive lapsed. It is on your record.', open });
  });
  mission.on('recall', () => transmission({ kind: 'recall', text: 'The UNAA has recalled the mission. The empire will be abandoned.' }));
  bindDrops(game, mission);
  bindInstallFx(game, (fn) => upgrades.on('install', fn));
  upgrades.on('install', (d: { def: { name: string } }) => toast(`Upgrader: <b>${d.def.name}</b> installed.`, 'good', 4500));
  // the ruins appear once the world exists
  try { spawnRuins(game, research); } catch (e) { console.error('ruins', e); }

  // ---------------------------------------------------------------- the colony's tool slots need the Upgrader
  let slotsHooked: unknown = null;
  const SLOT_COST = [{ iron_plate: 8, circuit: 2, copper_wire: 10 }, { reinforced_plate: 6, circuit: 4, motor: 1, crystal: 4 }];
  const hookSlots = () => {
    const C = G.colony; if (!C?.slots?.setUpgrader || slotsHooked === C) return;
    slotsHooked = C;
    C.slots.setUpgrader({ ready: () => upgrades.upgraderReady(), name: 'UPGRADER', cost: (_slot: number, level: number) => resolve(SLOT_COST[Math.max(0, Math.min(1, level - 1))] as Record<string, number>) });
  };
  // ---------------------------------------------------------------- the clocks (game time: pause and speed apply)
  let energyT = 0, studyT = 0, unlockT = 0;
  G.update$?.push((dt: number) => {
    hookSlots();
    unlockT += Math.max(dt, 1 / 60);
    if (unlockT >= 0.5) { unlockT = 0; try { quests.poll(); unlocks.tick(); unlocks.toolSlots(); } catch (e) { console.error('unlocks tick', e); } }
    if (dt <= 0) return;
    // v7: the ship's voice (quotas, drops) only once the SHIP link is learned; the Meridian's first drop comes with it
    const linked = unlocks.has('ship:fn:quotas');
    if (linked && !director.done.has('kit') && !G.descending) {
      director.done.add('kit'); mission.next = Math.max(mission.next, gtime(game) + 120);
      mission.drop(resolve({ iron_plate: 24, copper_wire: 20, glass: 6, gear: 8, screw: 20 }));
      transmission({ kind: 'drop', text: 'Link established. A supply capsule is on its way down. The board wants data.', open: () => openTerminal(game, 'mission') });
    }
    try { if (linked && !G.descending) mission.tick(dt); } catch (e) { console.error('mission tick', e); }
    // a powered Field Lab studies what the colony holds: a slow stream of knowledge
    studyT += dt;
    if (studyT >= 6) { studyT = 0; const st = research.stations().powered; if (st > 0) { research.addData('bio', 0.4 * st, 'Field Lab'); research.addData('geo', 0.4 * st, 'Field Lab'); } }
    try { if (!G.descending) director.tick(dt); } catch (e) { console.error('director tick', e); }
    energyT += dt;
    if (energyT >= 10) {
      energyT = 0;
      const sup = G.factory?.power?.().supply ?? 0;
      if (sup > 0) { mastery.gain('energy', Math.min(12, sup * 0.04), 'Running the grid'); research.addData('energy', Math.min(2, sup / 120), 'Grid telemetry'); }
    }
  });
  return { mastery, research, upgrades, mission, director, unlocks, quests, social: people.social };
}

/** open the program terminal on a tab, from anywhere in the game */
export function openTerminal(game: Game, tab?: 'mastery' | 'research' | 'upgrader' | 'mission') {
  const G = anyG(game);
  void import('../ui/skillTree').then((m) => m.openSkillTree(G.engine, G, tab));
}
