// The run: the void (menu) -> a planet -> fall on a region (an RTS map) -> take it or burn out -> the planet again
// ... -> hold enough regions and the world becomes you (ascension) -> it hangs in the archive, and you can throw an
// offspring at a new world. The run (genes, designs, helix, the planet's map) is saved between regions.
import type { Engine } from './app/engine';
import type { Input } from './app/input';
import { Game } from './game/game';
import { openLab } from './ui/forge';
import { TreeScreen } from './ui/tree';
import { openSkillTree } from './ui/skillTree';
import { PlanetScreen } from './ui/planetScreen';
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

interface Save {
  planet: number; states: RState[]; landings: number;
  run: {
    seed: number; genes: [string, number, string][]; helix: number; designs: Design[];
    /** Unit 07's progression: raw materials, skills and core cells, plant prefabs, run-level milestones */
    res?: Partial<Record<Res, number>>; skills?: { owned?: string[]; points?: number }; plants?: PlantPrefab[]; flags?: Record<string, number>;
  };
}
const SK = 'oddworld.save', AK = 'oddworld.archive';
const read = <T>(k: string, d: T): T => { try { const s = localStorage.getItem(k); return s ? (JSON.parse(s) as T) : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage off */ } };

export class Flow {
  planet: Planet | null = null;
  run: Run | null = null;
  landings = 0;
  private inherit: string[] = [];
  constructor(readonly engine: Engine, readonly input: Input) {}

  menu() {
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
    for (const d of s.run.designs) run.reg.add(d, 'veyr', null, 'design', 0);
    this.run = run; this.landings = s.landings;
    this.planetView();
  }
  private persist() {
    if (!this.planet || !this.run) return;
    const r = this.run;
    write(SK, {
      planet: this.planet.seed, states: this.planet.regions.map((x) => x.state), landings: this.landings,
      run: { seed: r.seed, genes: [...r.genes.values()].map((g) => [g.id, g.level, g.from]), helix: r.helix, designs: r.reg.list.filter((s) => s.owner === 'veyr' && s.role === 'design').map((s) => s.design),
        res: { ...r.res }, skills: r.skills.toJSON(), plants: r.plants, flags: r.flags },
    } satisfies Save);
  }
  private planetView(note?: string) {
    const p = this.planet!;
    this.engine.setScreen(new PlanetScreen(p, {
      canLand: (r) => (r.state === 'veyr' ? 'Already yours.' : r.state === 'lost' ? 'Burnt out. Nothing will take root here again.' : null),
      onLand: (r) => this.land(r), onBack: () => this.menu(), note,
    }));
  }

  // ------------------------------------------------------------------ a region
  private land(r: PRegion) {
    const p = this.planet!, run = this.run!;
    this.landings++;
    for (const s of run.reg.list) s.alive = 0;
    const engine = this.engine;
    const g: Game = new Game(engine, this.input, {
      seed: r.seed, biome: r.biome, pal: p.palKey, regionName: r.name, run, story: this.landings === 1,
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
    });
    g.veyr.res.helix += run.helix;
    engine.setScreen(g);
    if (this.landings > 1) toast(`You fall on <b>${r.name}</b>. Everything you have absorbed came with you.`, 'story', 5000);
  }
  private result(title: string, sub: string, lines: string[], btn: string, then: () => void) {
    const p = panel('choice', ui(), 'dark');
    el('div', 'hdr ch-title', p, title);
    el('div', 'small ch-sub', p, sub);
    for (const l of lines) el('div', 'small', p, l);
    const row = el('div', 'h-row', p);
    new Btn(row, { icon: 'planet', label: btn, size: 'big' }, () => { p.remove(); then(); });
  }
  private stats(g: Game) {
    const sp = g.run.reg.list.filter((s) => s.owner === 'veyr').length;
    return [`${Math.round(g.conquest() * 100)}% of the living ground is yours.`, `${g.run.genes.size} genes in your blood · ${sp} species of your own.`];
  }
  private won(g: Game, r: PRegion) {
    const p = this.planet!;
    r.state = 'veyr'; g.paused = true;
    this.run!.helix = g.veyr.res.helix;
    this.persist(); sfx('absorb', 0.7, 1);
    const n = owned(p);
    this.result('REGION TAKEN', `${r.name} is yours. ${n} of ${p.goal}.`, this.stats(g), n >= p.goal ? 'BECOME THE WORLD' : 'BACK TO ORBIT', () => (n >= p.goal ? this.ascend() : this.planetView()));
  }
  private lost(g: Game, r: PRegion) {
    const p = this.planet!;
    r.state = 'lost'; g.paused = true; sfx('crack', 2, 1);
    if (!owned(p)) {
      write(SK, null);
      this.result('THE SEED IS SPENT', 'Your heart was torn open. Nothing of you is left on this world.', this.stats(g), 'INTO THE VOID', () => this.menu());
    } else {
      this.run!.helix = g.veyr.res.helix; this.persist();
      this.result('THIS GROUND IS LOST', `${r.name} burnt out under you. Your other regions still hold.`, this.stats(g), 'BACK TO ORBIT', () => this.planetView());
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
  private pause(g: Game, r: PRegion) {
    if (document.querySelector('.pause')) return;
    const was = g.paused; g.paused = true;
    const p = panel('choice pause', ui(), 'dark');
    el('div', 'hdr ch-title', p, 'PAUSED');
    el('div', 'small ch-sub', p, `${r.name} · ${Math.round(g.conquest() * 100)}% yours`);
    const row = el('div', 'h-row', p);
    const close = () => { p.remove(); g.paused = was; };
    new Btn(row, { icon: 'core', label: 'RESUME', size: 'big' }, close);
    new Btn(row, { icon: 'mirror', label: 'ASSEMBLY', size: 'wide' }, () => { close(); g.openMirror(); });
    new Btn(row, { icon: 'planet', label: 'TO ORBIT', size: 'wide', tip: () => 'Leave this region for now (it stays unclaimed). Your genes and designs are kept.' }, () => { p.remove(); this.run!.helix = g.veyr.res.helix; this.persist(); this.planetView(); });
    new Btn(row, { icon: 'skull', label: 'QUIT', size: 'wide', tip: () => 'Back to the void. The world is saved at its last orbit.' }, () => { p.remove(); this.menu(); });
  }
}
