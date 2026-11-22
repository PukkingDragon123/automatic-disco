// The run: the void (menu) -> a planet -> fall on a region (an RTS map) -> take it or burn out -> the planet again
// ... -> hold enough regions and the world becomes you (ascension) -> it hangs in the archive, and you can throw an
// offspring at a new world. The run (genes, designs, helix, the planet's map) is saved between regions.
import type { Engine } from './app/engine';
import type { Input } from './app/input';
import { Game, type GameOpts } from './game/game';
import { openLab } from './ui/forge';
import { TreeScreen } from './ui/tree';
import { openSkillTree } from './ui/skillTree';
import { PlanetScreen } from './ui/planetScreen';
import { DeployScreen } from './ui/deploy';
import { GameDescent, bonusFor } from './game/descent';
import type { Region } from './world/region';
import { MenuScreen, AscendScreen, type ArchiveEntry } from './ui/menu';
import { BabyEditor } from './ui/babyEditor';
import { loadLook } from './game/babyLook';
import { makePlanet, owned, type Planet, type PRegion, type RState } from './world/planet';
import { Run, type PlantPrefab } from './game/run';
import { RES, type Res } from './game/skills';
import type { Design } from './life/design';
import { GENE } from './life/genes';
import { el, panel, ui, Btn, toast } from './ui/kit';
import { sfx } from './audio/audio';
import { makeHub } from './ship/hub/flowHub';
import { setShipHubOpener, setShipLander } from './ship/hub';
import { setEmpireHost, settledLanding } from './empire/host';

interface Save {
  planet: number; states: RState[]; landings: number;
  run: {
    seed: number; genes: [string, number, string][]; helix: number; designs: Design[];
    /** Unit 07's progression: raw materials, skills and core cells, plant prefabs, run-level milestones */
    res?: Partial<Record<Res, number>>; skills?: { owned?: string[]; points?: number }; plants?: PlantPrefab[]; flags?: Record<string, number>;
    /** each region's works (buildings, recipes, stores, workers), by region seed */
    factories?: Record<string, unknown>;
    /** v6 progression (src/research: mastery, research, upgrades, events) */
    prog?: unknown;
    /** v7 the empire (src/empire: settlements, roads and rail, trade routes, convoys, diplomacy) */
    empire?: unknown;
  };
}
const SK = 'oddworld.save', AK = 'oddworld.archive';
/** a drop with no pin of its own (the SHIP screen's DEPLOY): the pod comes down on the region's own landing site */
const AUTO_PIN = { x: -1, z: -1 };
const read = <T>(k: string, d: T): T => { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };

export class Flow {
  planet: Planet | null = null;
  run: Run | null = null;
  landings = 0;
  private inherit: string[] = [];
  /** the region being played (its works are written into the run when the run is saved) */
  game: Game | null = null;
  constructor(readonly engine: Engine, readonly input: Input) {
    setShipHubOpener((fp) => this.openShipHub(fp));
    // v7: the SHIP screen's MONITOR panel picks the world and the landing site (src/ship/screen/panels/monitor.ts)
    setShipLander({ runSeed: () => { this.ensureRun(); return this.run!.seed; }, planet: () => this.planet, land: (seed, r) => { this.choosePlanet(seed); this.landAt(r, AUTO_PIN); } });
    // v7: the empire travels between its settlements (src/empire/travel.ts) and saves with the run
    setEmpireHost({ planet: () => this.planet, run: () => this.run, game: () => this.game, save: () => this.persist(), visit: (r, o) => this.land(r, o.drop, o.opts ?? {}) });
  }

  /** the ship hub is the main menu (src/ship/hub): the title, then the cutaway with every room's function */
  menu() {
    const save = read<Save | null>(SK, null);
    const hub = makeHub(this, {
      hasSave: !!save,
      onNew: () => { this.startRun(Math.floor(Math.random() * 1e9)); hub.isNewGame = true; hub.board(); },
      onContinue: () => { if (this.loadSave()) hub.board(); },
    });
    this.engine.setScreen(hub);
  }
  /** the SHIP AI LINK: from the planet the hub goes over the paused game (BACK DOWN pops it) */
  openShipHub(fromPlanet = false) {
    if (!fromPlanet || !this.game) { this.menu(); return; }
    const g = this.game, was = g.paused; g.paused = true;
    const hub = makeHub(this, { fromPlanet: true, game: g, inside: true });
    hub.onDispose(() => { g.paused = was; });
    this.engine.push(hub);
  }
  /** a new mission: the run and the galaxy seed (the world is chosen on the bridge's main monitor) */
  startRun(seed: number) { this.run = new Run(seed); this.planet = null; this.landings = 0; this.inherit = []; }
  ensureRun() { if (!this.run) this.startRun(Math.floor(Math.random() * 1e9)); }
  /** the world picked on the main monitor */
  choosePlanet(seed: number) { if (!this.planet || this.planet.seed !== seed) { this.planet = makePlanet(seed); this.landings = 0; } this.persist(); }
  /** the pod is away: the region loop starts (the descent plays in the game) */
  landAt(r: PRegion, pin: { x: number; z: number }) {
    // a region that already holds one of the empire's settlements is resumed, not dropped on again
    const settled = settledLanding(this.run, r); if (settled) { this.land(r, undefined, settled); return; }
    this.land(r, { pin, first: this.landings === 0 });
  }
  save() { this.persist(); }
  /** load the saved run without leaving the screen */
  loadSave(): boolean {
    const s = read<Save | null>(SK, null); if (!s) return false;
    this.planet = makePlanet(s.planet); s.states.forEach((st, i) => { if (this.planet!.regions[i]) this.planet!.regions[i].state = st; });
    const run = new Run(s.run.seed);
    for (const [id, lvl, from] of s.run.genes) if (GENE[id]) { run.add(id, from, 0); run.genes.get(id)!.level = lvl; }
    run.helix = s.run.helix;
    for (const k of RES) run.res[k] = Math.max(0, Number(s.run.res?.[k]) || 0);
    run.skills.load(s.run.skills);
    run.plants = Array.isArray(s.run.plants) ? s.run.plants.filter((p) => p && typeof p.name === 'string') : [];
    if (s.run.flags) Object.assign(run.flags, s.run.flags);
    if (s.run.factories && typeof s.run.factories === 'object') run.factories = s.run.factories;
    if (s.run.prog && typeof s.run.prog === 'object') (run as unknown as { prog?: unknown }).prog = s.run.prog;
    if (s.run.empire && typeof s.run.empire === 'object') (run as unknown as { empire?: unknown }).empire = s.run.empire;
    for (const d of s.run.designs) run.reg.add(d, 'veyr', null, 'design', 0);
    this.run = run; this.landings = s.landings;
    return true;
  }
  /** the old void menu (kept for ?test=menu) */
  oldMenu() {
    const save = read<Save | null>(SK, null);
    this.engine.setScreen(new MenuScreen({
      hasSave: !!save, archive: read<ArchiveEntry[]>(AK, []),
      onNew: (s) => this.newWorld(s, []), onContinue: () => this.resume(),
      onLaunch: (e) => { const g = [...e.genes].sort(() => Math.random() - 0.5).slice(0, 3); this.newWorld(Math.floor(Math.random() * 1e6), g); },
      onMirror: (back) => this.engine.push(new BabyEditor(loadLook(), () => { this.engine.pop(); back(); })),
    }));
  }
  newWorld(seed: number, inherit: string[]) {
    this.planet = makePlanet(seed); this.run = new Run(seed); this.landings = 0; this.inherit = inherit;
    for (const g of inherit) if (GENE[g]) this.run.add(g, 'offspring', 0);
    this.persist();
    this.planetView(inherit.length ? `YOUR OFFSPRING CARRIES ${inherit.map((g) => GENE[g]?.name.toUpperCase()).join(', ')}` : `A NEW WORLD. CHOOSE WHERE TO FALL.`);
  }
  private resume() {
    const s = read<Save | null>(SK, null); if (!s) { this.menu(); return; }
    this.planet = makePlanet(s.planet); s.states.forEach((st, i) => { if (this.planet!.regions[i]) this.planet!.regions[i].state = st; });
    const run = new Run(s.run.seed);
    for (const [id, lvl, from] of s.run.genes) if (GENE[id]) { run.add(id, from, 0); run.genes.get(id)!.level = lvl; }
    run.helix = s.run.helix;
    for (const k of RES) run.res[k] = Math.max(0, Number(s.run.res?.[k]) || 0);
    run.skills.load(s.run.skills);
    run.plants = Array.isArray(s.run.plants) ? s.run.plants.filter((p) => p && typeof p.name === 'string') : [];
    if (s.run.flags) Object.assign(run.flags, s.run.flags);
    if (s.run.factories && typeof s.run.factories === 'object') run.factories = s.run.factories;
    if (s.run.prog && typeof s.run.prog === 'object') (run as unknown as { prog?: unknown }).prog = s.run.prog;
    if (s.run.empire && typeof s.run.empire === 'object') (run as unknown as { empire?: unknown }).empire = s.run.empire;
    for (const d of s.run.designs) run.reg.add(d, 'veyr', null, 'design', 0);
    this.run = run; this.landings = s.landings;
    this.planetView();
  }
  private persist() {
    if (!this.planet || !this.run) return;
    const r = this.run;
    try { this.game?.factory?.store(); } catch (e) { console.error('factory save', e); }
    write(SK, {
      planet: this.planet.seed, states: this.planet.regions.map((x) => x.state), landings: this.landings,
      run: { seed: r.seed, genes: [...r.genes.values()].map((g) => [g.id, g.level, g.from]), helix: r.helix, designs: r.reg.list.filter((s) => s.owner === 'veyr' && s.role === 'design').map((s) => s.design),
        res: { ...r.res }, skills: r.skills.toJSON(), plants: r.plants, flags: r.flags, factories: r.factories, prog: (r as unknown as { prog?: unknown }).prog, empire: (r as unknown as { empire?: unknown }).empire },
    } satisfies Save);
  }
  private planetView(note?: string) {
    this.game = null;
    const p = this.planet!;
    this.engine.setScreen(new PlanetScreen(p, {
      canLand: (r) => (r.state === 'veyr' ? 'Already yours.' : r.state === 'lost' ? 'Burnt out. Nothing will take root here again.' : null),
      onLand: (r, lz, region) => this.deploy(r, lz, region), onBack: () => this.menu(), note,
    }));
  }

  /** the drop: the carrier's launch (ui/deploy.ts), then the region itself, which the pod falls into (game/descent.ts) */
  private deploy(r: PRegion, lz?: { x: number; z: number }, region?: Region) {
    this.engine.setScreen(new DeployScreen(this.engine, this.input, {
      planet: this.planet!, region: r, run: this.run, landings: this.landings, lz, regionData: region,
      onLaunched: (pin, first) => this.land(r, { pin, first }),
    }));
  }

  // ------------------------------------------------------------------ a region
  /** drop: the pod is in the air over this region (the game starts in descent mode; the landing is where it comes down) */
  land(r: PRegion, drop?: { pin: { x: number; z: number }; first: boolean }, extra?: Partial<GameOpts>) {
    const p = this.planet!, run = this.run!;
    this.landings++;
    for (const s of run.reg.list) s.alive = 0;
    const engine = this.engine;
    const gopts: GameOpts = {
      seed: r.seed, biome: r.biome, pal: p.palKey, regionName: r.name, run, story: this.landings === 1, danger: r.danger, landing: drop && drop.pin !== AUTO_PIN ? drop.pin : undefined, descent: !!drop,
      ...(extra ?? {}),
      hooks: {
        openBuilder: (game) => openLab(engine, game),
        openLab: (game) => openLab(engine, game),
        openTree: (game) => engine.push(new TreeScreen(game.run.reg, {
          close: () => engine.pop(), time: game.world.time,
          evolve: (sp) => openLab(engine, game, sp),
        })),
        openSkills: (game) => openSkillTree(engine, game),
        openMenu: (game) => this.pause(game, r),
        onWin: (game) => this.won(game, r),
        onLose: (game) => this.lost(game, r),
      },
    };
    const g: Game = new Game(engine, this.input, gopts);
    this.game = g;
    g.veyr.res.helix += run.helix;
    engine.setScreen(g);
    if (this.landings > 1 && !extra) toast(`You fall on <b>${r.name}</b>. Everything you have absorbed came with you.`, 'story', 5000);
    if (drop) new GameDescent({
      game: g, lz: drop.pin === AUTO_PIN ? { ...g.region.landing } : drop.pin, first: drop.first, planetName: p.name,
      onDone: (res) => { const b = bonusFor(res.grade); if (b.cells || Object.keys(b.res).length) toast(`Drop ${res.grade === 'BULLSEYE' ? '<b>dead on the pin</b>' : 'scored'}: ${b.text.toLowerCase()}.`, 'good', 6000); },
    });
  }
  /** a region's outcome as a v7 kit panel (src/ui/hud7/pause.ts) */
  private result(title: string, sub: string, lines: string[], btn: string, then: () => void, tone: 'yellow' | 'red' = 'yellow') {
    void import('./ui/hud7/pause').then((m) => m.openResult({ title, sub, lines, key: btn, tone, then }));
  }

  private stats(g: Game) {
    const c = g.colony, b = g.factory?.buildings?.length ?? 0, sp = g.run.reg.list.filter((s) => s.owner === 'veyr' && s.role === 'design').length;
    return [`Held for ${c?.sol ?? 1} sol${(c?.sol ?? 1) === 1 ? '' : 's'}: ${b} building${b === 1 ? '' : 's'} raised.`, `${sp} creature design${sp === 1 ? '' : 's'} filed in the lab.`];
  }
  private won(g: Game, r: PRegion) {
    const p = this.planet!;
    r.state = 'veyr'; g.paused = true;
    this.run!.helix = g.veyr.res.helix;
    this.persist(); sfx('absorb', 0.7, 1);
    const n = owned(p);
    this.result('REGION SECURED', `${r.name} is held. ${n} of ${p.goal} regions.`, this.stats(g), n >= p.goal ? 'THE WORLD IS OURS' : 'BACK TO THE SHIP', () => { this.game = null; if (n >= p.goal) this.ascend(); else this.menu(); });
  }
  private lost(g: Game, r: PRegion) {
    const p = this.planet!;
    r.state = 'lost'; g.paused = true; sfx('crack', 2, 1);
    if (!owned(p)) {
      write(SK, null);
      this.result('SETTLEMENT LOST', `${r.name} failed and nothing else on this world holds. The mission is over.`, this.stats(g), 'BACK TO THE TITLE', () => { this.game = null; this.menu(); }, 'red');
    } else {
      this.run!.helix = g.veyr.res.helix; this.persist();
      this.result('SETTLEMENT LOST', `${r.name} failed. Your other settlements still hold.`, this.stats(g), 'BACK TO THE SHIP', () => { this.game = null; this.menu(); }, 'red');
    }
  }
  private ascend() {
    const p = this.planet!, run = this.run!;
    const look = loadLook();
    this.engine.setScreen(new AscendScreen(p, look.name, () => {
      const a = read<ArchiveEntry[]>(AK, []);
      a.push({ seed: p.seed, name: p.name, date: new Date().toISOString().slice(0, 10), species: run.reg.list.length, genes: [...run.genes.keys()], regions: owned(p) });
      write(AK, a); write(SK, null);
      this.menu();
    }));
  }
  /** Esc on the planet: the v7 pause panel (src/ui/hud7/pause.ts: RESUME, SAVE, SHIP LINK, QUIT TO TITLE) */
  private pause(g: Game, r: PRegion) {
    void import('./ui/hud7/pause').then((m) => m.openPause(g, { region: r.name, save: () => { this.run!.helix = g.veyr.res.helix; g.colony?.save?.(); this.persist(); }, quit: () => { this.game = null; this.menu(); } }));
  }

}
