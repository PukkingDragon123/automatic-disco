// The region screen: an RTS where you are a living asteroid. Selection, orders, field abilities with QTEs,
// growth painting, building, digestion and the harvest of genomes.
import * as THREE from 'three';
import { daylight } from './daylight';
import type { Engine, Screen } from '../app/engine';
import type { Input } from '../app/input';
import { RtsCam } from '../app/rtsCam';
import { Region, BIOMES, type BiomeKey } from '../world/region';
import { planetPalette, VEYR } from '../world/palette';
import { World } from './world';
import { Hive, ABILITIES, type Ability } from './hive';
import { Fx } from './fx';
import { Vision } from './vision';
import { Creature } from './creature';
import { Building, BDEFS, BUILD_ORDER, type BKind } from './buildings';
import { Harvest } from './dnaHarvest';
import { Run } from './run';
import { Hud, type Cmd } from '../ui/hud';
import { setupUI, toast, ui, el, costHTML, S } from '../ui/kit';
import { QTE, qteActive } from '../ui/qte';
import { sfx, setNight } from '../audio/audio';
import { Rand, clamp } from '../core/rand';
import { initThumbs } from '../ui/thumbs';
import type { Post } from '../gfx/post';
import { GENE } from '../life/genes';
import type { Species } from './species';
import { Story } from './story';
import { RivalBrain } from './rival';
import { Factions } from './factions';
import { Factory } from '../factory/factory';
import { tickRobots, type RobotUnit } from '../robots/unit';
import { CoreAura } from './coreAura';
import { RIVALS } from '../world/palette';
import { VeyrChild } from './child';
import { Player } from './player';
import { Details } from './details';
import { installBiotech } from '../biotech';
import { attachEco } from '../eco/view';
import { BabyEditor } from '../ui/babyEditor';
import { coreCapGeometry } from './buildings';
import { panel, Btn } from '../ui/kit';

type Mode = { k: 'normal' } | { k: 'ability'; a: Ability } | { k: 'build'; b: BKind } | { k: 'paint' } | { k: 'amove' } | { k: 'rally' } | { k: 'factory' };
interface Held { c: Creature; t: number; dur: number; dps: number; grip: number }
interface Pull { c: Creature; tx: number; tz: number; t: number }

export interface GameOpts { seed: number; biome: BiomeKey; pal?: string; regionName?: string; run?: Run; hooks?: GameHooks; story?: boolean; /** planet danger 1..3: which enemy programmes hold the region (factions/plan.ts) */ danger?: number; /** where the drop pod actually came down (deploy sequence); snapped to open ground */ landing?: { x: number; z: number } }
export interface GameHooks { onWin?(g: Game): void; onLose?(g: Game): void; openBuilder?(g: Game): void; openTree?(g: Game): void; openMenu?(g: Game): void; openSkills?(g: Game): void; openLab?(g: Game): void }

const _v = new THREE.Vector3(), _ray = new THREE.Ray();

const _focus = new THREE.Vector3();
export class Game implements Screen {
  readonly run: Run;
  readonly region: Region;
  readonly world: World;
  readonly veyr: Hive;
  readonly fx: Fx;
  readonly vision: Vision;
  readonly cam: RtsCam;
  readonly hud: Hud;
  readonly harvest: Harvest;
  sel: Creature[] = [];
  selB: Building | null = null;
  mode: Mode = { k: 'normal' };
  menu: 'main' | 'build' = 'main';
  paused = false; speed = 1;
  private held: Held[] = [];
  private pulls: Pull[] = [];
  private storms: { x: number; z: number; t: number }[] = [];
  /** field powers reach further with the Field Amplifier skill ('amp') */
  get powerReach() { return this.run.skills.has('amp') ? 1.5 : 1; }
  private shaping: { x: number; z: number; R: number; amt: number; t: number }[] = [];
  private knocks: { c: Creature; vx: number; vz: number; t: number }[] = [];
  private overlay: HTMLCanvasElement; private og: CanvasRenderingContext2D;
  private drag: { x: number; y: number; on: boolean } | null = null;
  private hoverC: Creature | null = null; private hoverB: Building | null = null;
  private ghost: THREE.Mesh | null = null; private ghostKind: BKind | null = null;
  private lastClick = { t: 0, id: 0 };
  private landN = 1;
  private busy = false;
  private won = false; private lostFlag = false;
  update$: ((dt: number) => void)[] = [];
  readonly regionName: string;
  storyBlock = false;
  story: Story | null = null;
  /** cutscene camera hook (story.ts / cinema.ts): runs right after the game camera updates and may overwrite it */
  cineCam: ((cam: THREE.PerspectiveCamera, dt: number) => void) | null = null;
  rivals: RivalBrain[] = [];
  /** the Soviet / PRC robot programmes and human expeditions on this region (factions/*) */
  factions: Factions | null = null;
  /** the industrial layer: grid buildings, belts, power, workers (src/factory) */
  factory!: Factory;
  /** every robot, soldier and rover on the field, any faction (src/robots; spawnRobot registers them) */
  robots: RobotUnit[] = [];
  aura: CoreAura | null = null;
  private rivalT = 210;
  child!: VeyrChild;
  /** Unit 07 under direct control (player.ts) */
  player!: Player;
  private cap: THREE.Mesh | null = null; private hatchT = 0;
  private handlers: Record<string, ((d: any) => void)[]> = {};
  on(ev: string, f: (d: any) => void) { (this.handlers[ev] ??= []).push(f); }
  emit(ev: string, d?: any) { for (const f of this.handlers[ev] ?? []) { try { f(d); } catch (e) { console.error('event', ev, e); } } }
  chooseCalder?: (done: (absorb: boolean) => void) => void;

  constructor(readonly engine: Engine, readonly input: Input, readonly opts: GameOpts) {
    setupUI();
    initThumbs(engine.renderer);
    this.run = opts.run ?? new Run(opts.seed);
    const pal = planetPalette(opts.seed, opts.pal);
    this.region = new Region(opts.seed, BIOMES[opts.biome], pal);
    this.regionName = opts.regionName ?? BIOMES[opts.biome].name;
    if (opts.landing) {
      const N = this.region.N, cx = Math.min(N - 6, Math.max(6, opts.landing.x)), cz = Math.min(N - 6, Math.max(6, opts.landing.z));
      const f = this.region.freeNear(cx, cz, 12);
      if (f) this.region.landing = { x: f[0], z: f[1] };
    }
    const L = this.region.landing;
    this.region.carveCrater(L.x, L.z, 3.4, 1.3);
    this.region.dirty.clear();
    this.world = new World(this.region, this.run.reg, opts.seed);
    this.fx = new Fx(this.world.fxScene, this.world.scene);
    this.veyr = new Hive(this.world, 'veyr', this.fx);
    this.world.hives.push(this.veyr);
    this.veyr.plantCore(L.x, L.z);
    this.world.spawnFauna(new Rand(opts.seed ^ 0xfa));
    this.vision = new Vision(this.world, this.veyr);
    this.world.ownedSupply = (f) => (f === 'veyr' ? this.veyr.supplyCap - this.veyr.supplyUsed : 4);
    for (let i = 0; i < this.region.N * this.region.N; i++) if (this.region.h[i] >= this.region.water) this.landN++;
    this.cam = new RtsCam(innerWidth / innerHeight);
    this.cam.bounds = { x0: 6, z0: 6, x1: this.region.N - 6, z1: this.region.N - 6 };
    this.cam.ground = (x, z) => this.region.groundSmooth(x, z);
    this.cam.lookAt(L.x, L.z + 4, true);
    this.cam.dist = this.cam.distGoal = 30;
    this.harvest = new Harvest(this.world.scene, this.world.fxScene, this.run, this.fx);
    this.veyr.harvest = (c, sp) => this.openHarvest(c, sp);
    this.on('absorb', (d: { species?: string }) => { if (d?.species) this.absorbSeen.set(d.species, performance.now()); });
    this.world.hooks = {
      onDeath: (c, by) => {
        sfx('death', Math.max(0.5, c.size), this.audible(c.x, c.z));
        this.fx.burst(c.x, c.y + c.size * 0.4, c.z, 10 + Math.floor(c.size * 6), c.sp.design.lineage === 'arthropod' ? 0x8ad04a : 0xa82a2a, { speed: 2, up: 2, size: 3, life: 0.8 });
        if (by?.faction === 'veyr') this.run.kills++;
        if (c.selected) this.sel = this.sel.filter((s) => s !== c);
      },
      onBirth: (kid, _p, nsp) => {
        if (kid.faction === 'veyr' && nsp) toast(`A new subspecies branches from your line: <b>${nsp.name}</b>`, 'good', 5000);
      },
      onDamage: (c, amt) => { if (amt > 2 && Math.random() < 0.5) sfx('hit', Math.max(0.5, c.size), this.audible(c.x, c.z) * 0.7); },
    };
    this.hud = new Hud({
      hive: this.veyr, world: this.world, vision: this.vision, cam: this.cam, game: this,
      sel: () => this.sel, selB: () => this.selB, commands: () => this.commands(), ctxKey: () => this.ctxKey(),
      conquest: () => this.conquest(), regionName: this.regionName,
      minimap: (x, z, b) => this.minimapClick(x, z, b),
      openTree: () => opts.hooks?.openTree?.(this), openBuilder: () => opts.hooks?.openBuilder?.(this), openMenu: () => opts.hooks?.openMenu?.(this), openMirror: () => this.openMirror(),
      ability: (a) => { if (this.mode.k === 'ability' && this.mode.a === a) { this.setMode({ k: 'normal' }); return; } const why = this.veyr.can(a); if (why) { sfx('deny'); toast(why, 'warn', 1400); return; } this.setMode({ k: 'ability', a }); },
      armed: () => (this.mode.k === 'ability' ? this.mode.a : null),
    });
    this.overlay = el('canvas', 'overlay2d', document.body);
    this.og = this.overlay.getContext('2d')!;
    this.resizeOverlay();
    this.bindInput();
    this.veyr.onEvent = (e, d) => this.emit(e, d);
    this.onBuild = (b) => this.emit('placed', b);
    this.onAbility = (a, ok) => this.emit('ability', { a, ok });
    this.onHarvest = (sp, chosen) => this.emit('harvest', { sp, chosen });
    this.world.hooks.onBirth = ((prev) => (kid: Creature, p: Creature, nsp: Species | null) => { prev?.(kid, p, nsp); if (kid.faction === 'veyr') this.emit('birth', kid); })(this.world.hooks.onBirth);
    this.chooseCalder = (done) => this.calderChoice(done);
    // the baby inside the rock, and the rock's sealed top
    const core = this.veyr.core!;
    this.child = new VeyrChild(this.fx);
    this.child.root.position.set(core.x, core.y + 1.05, core.z);
    this.world.scene.add(this.child.root);
    this.harvest.child = this.child;
    this.child.onCast = () => this.aura?.pulse(1);
    this.veyr.attach(this);
    this.cap = new THREE.Mesh(coreCapGeometry(core.x, core.z), core.mesh.material);
    this.cap.position.copy(core.mesh.position); this.cap.castShadow = true;
    this.world.scene.add(this.cap);
    this.cam.followFn(() => new THREE.Vector3(core.x, 0, core.z)); this.cam.dist = this.cam.distGoal = 13;
    if (opts.story !== false) this.story = new Story(this);
    this.vision.update(0, true);
    this.veyr.flushCov();
    this.player = new Player(this);
    new Details(this); // footprints, wetness, ripples, weather, hand-drawn VFX (game/details.ts; runs in update$)
    attachEco(this); // the ecosystem's overlay, activity bubbles, field survey sheet and API as game.eco (src/eco/view.ts)
    this.factory = new Factory(this);
    this.factions = new Factions(this);
    installBiotech(this); // engineered creatures and plants at work, Bio-Works structures, work orders (src/biotech)
    (window as any).__game = this;
  }

  // ------------------------------------------------------------------ helpers
  audible(x: number, z: number) { const d = Math.hypot(x - this.cam.target.x, z - this.cam.target.z); return clamp(1.2 - d / 45, 0, 1); }
  conquest() { return this.veyr.territory(); }
  private resizeOverlay() { this.overlay.width = innerWidth; this.overlay.height = innerHeight; }
  resize(w: number, h: number) { this.cam.cam.aspect = w / h; this.cam.cam.updateProjectionMatrix(); this.resizeOverlay(); }
  screenOf(x: number, y: number, z: number): [number, number, boolean] {
    _v.set(x, y, z).project(this.cam.cam);
    return [(_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, _v.z < 1];
  }
  /** heightfield ray march from a screen pixel */
  groundAt(mx: number, my: number): THREE.Vector3 | null {
    const rc = this.cam.ray(mx, my);
    _ray.copy(rc.ray);
    const R = this.region;
    let prev = 0;
    for (let t = 1; t < 400; t += 0.35) {
      _ray.at(t, _v);
      if (_v.x < -20 || _v.z < -20 || _v.x > R.N + 20 || _v.z > R.N + 20) { if (t > 120) break; continue; }
      const gy = this.world.surfaceY(clamp(_v.x, 0, R.N - 0.01), clamp(_v.z, 0, R.N - 0.01));
      if (_v.y <= gy) {
        let a = prev, b = t;
        for (let k = 0; k < 10; k++) { const m = (a + b) / 2; _ray.at(m, _v); if (_v.y <= this.world.surfaceY(clamp(_v.x, 0, R.N - 0.01), clamp(_v.z, 0, R.N - 0.01))) b = m; else a = m; }
        _ray.at(b, _v);
        return new THREE.Vector3(clamp(_v.x, 0, R.N - 0.01), _v.y, clamp(_v.z, 0, R.N - 0.01));
      }
      prev = t;
    }
    return null;
  }
  pickCreature(mx: number, my: number, filter?: (c: Creature) => boolean): Creature | null {
    let best: Creature | null = null, bs = 1e9;
    for (const c of this.world.creatures) {
      if (!c.visibleNow || !c.mesh.visible && !c.dead) continue;
      if (filter && !filter(c)) continue;
      const [sx, sy, ok] = this.screenOf(c.x, c.y + c.size * 0.35 + c.air, c.z);
      if (!ok) continue;
      const [, sy2] = this.screenOf(c.x, c.y + c.size * 0.35 + c.air + Math.max(0.4, c.size * 0.5), c.z);
      const rad = Math.max(12, Math.abs(sy - sy2) * 1.2);
      const d = Math.hypot(sx - mx, sy - my);
      if (d < rad) { const s = d / rad + (c.dead ? 0.5 : 0); if (s < bs) { bs = s; best = c; } }
    }
    return best;
  }
  pickBuilding(mx: number, my: number): Building | null {
    let best: Building | null = null, bs = 1e9;
    for (const h of this.world.hives) for (const b of h.buildings) {
      if (!b.visibleNow) continue;
      const [sx, sy, ok] = this.screenOf(b.x, b.y + 1, b.z);
      if (!ok) continue;
      const [, sy2] = this.screenOf(b.x, b.y + 1 + b.def.radius * 1.2, b.z);
      const rad = Math.max(16, Math.abs(sy - sy2) * 1.3);
      const d = Math.hypot(sx - mx, sy - my);
      if (d < rad && d < bs) { bs = d; best = b; }
    }
    return best;
  }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const cv = this.engine.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.act) return;
      if (this.harvest.blocking || qteActive() || this.storyBlock) {
        if (this.harvest.blocking && e.button === 0) this.harvest.click(e.clientX, e.clientY, this.cam.cam);
        return;
      }
      if (e.button === 0) {
        if (this.mode.k === 'paint') { this.paintStroke(e.clientX, e.clientY, true); this.drag = { x: e.clientX, y: e.clientY, on: true }; return; }
        if (this.mode.k === 'normal' && !this.player?.leftDown(e)) this.drag = { x: e.clientX, y: e.clientY, on: false };
        else this.clickMode(e.clientX, e.clientY, e.shiftKey);
      } else if (e.button === 2) {
        if (this.mode.k === 'paint') { this.paintStroke(e.clientX, e.clientY, false); this.drag = { x: e.clientX, y: e.clientY, on: true }; return; }
        if (this.mode.k === 'ability' && (this.mode as any).a === 'shape') { this.shapeAt(e.clientX, e.clientY, -1); return; }
        if (this.mode.k !== 'normal') { this.setMode({ k: 'normal' }); return; }
        this.command(e.clientX, e.clientY, e.shiftKey);
      }
    });
    addEventListener('pointermove', (e) => {
      if (!this.act) return;
      if (this.harvest.blocking) { this.harvest.hoverAt(e.clientX, e.clientY, this.cam.cam); return; }
      if (this.drag && this.mode.k === 'paint' && this.input.buttons.size) this.paintStroke(e.clientX, e.clientY, this.input.buttons.has(0));
      else if (this.drag && Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 6) this.drag.on = true;
    });
    addEventListener('pointerup', (e) => {
      if (!this.act) return;
      if (e.button !== 0 || !this.drag) { if (e.button === 2 && this.mode.k === 'paint') this.drag = null; return; }
      const d = this.drag; this.drag = null;
      if (this.mode.k === 'paint') return;
      if (this.mode.k !== 'normal') return;
      if (d.on) this.boxSelect(d.x, d.y, e.clientX, e.clientY, e.shiftKey);
      else this.clickSelect(e.clientX, e.clientY, e.shiftKey);
    });
    this.offKey = this.input.onKey((e) => { if (this.act) this.key(e); });
  }
  private key(e: KeyboardEvent) {
    if (this.harvest.blocking || qteActive() || this.storyBlock) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'Escape') { if (this.mode.k !== 'normal') this.setMode({ k: 'normal' }); else if (this.menu !== 'main') { this.menu = 'main'; } else if (this.sel.length || this.selB) this.clearSel(); else this.opts.hooks?.openMenu?.(this); return; }
    if (k === 'p') { this.paused = !this.paused; toast(this.paused ? 'Paused' : 'Resumed'); return; }
    if (k === 't') { this.opts.hooks?.openTree?.(this); return; }
    if (k === 'c') { this.opts.hooks?.openBuilder?.(this); return; }
    if (k === 'v') { this.openMirror(); return; }
    if (k === ' ') { if (this.veyr.core) this.cam.lookAt(this.veyr.core.x, this.veyr.core.z); return; }
    if (k === 'Tab') { this.clearSel(); for (const c of this.world.creatures) if (!c.dead && c.faction === 'veyr') this.addSel(c); return; }
    if (e.ctrlKey || e.metaKey) return;
    if (this.hud.key(k)) return;
    for (const cm of this.commands()) if (cm && cm.key.toLowerCase() === k) { if (!cm.disabled?.()) { sfx('click'); cm.run(); } else { sfx('deny'); toast(String(cm.disabled?.()), 'warn', 1600); } return; }
  }
  setMode(m: Mode) {
    if (m.k === 'ability' && this.player && !this.player.canPower(m.a)) { sfx('deny'); toast('That field power is not installed yet: buy it on the skill tree', 'warn', 1800); return; }
    this.mode = m;
    document.body.classList.toggle('c-target', m.k === 'ability' || m.k === 'amove' || m.k === 'rally' || m.k === 'paint');
    document.body.classList.toggle('c-build', m.k === 'build');
    if (m.k !== 'build' && this.ghost) { this.ghost.removeFromParent(); this.ghost = null; this.ghostKind = null; }
    this.hud.invalidate();
  }
  clearSel() { for (const c of this.sel) c.selected = false; this.sel = []; if (this.selB) this.selB.selected = false; this.selB = null; this.menu = 'main'; this.hud.invalidate(); }
  private addSel(c: Creature) { if (!this.sel.includes(c)) { c.selected = true; this.sel.push(c); } }
  private clickSelect(mx: number, my: number, add: boolean) {
    const c = this.pickCreature(mx, my);
    const b = c ? null : this.pickBuilding(mx, my);
    if (!add) this.clearSel();
    if (c) {
      const now = performance.now();
      if (now - this.lastClick.t < 320 && this.lastClick.id === c.id && c.faction === 'veyr') {
        for (const o of this.world.creatures) if (!o.dead && o.sp === c.sp && o.faction === 'veyr' && o.mesh.visible) this.addSel(o);
      } else if (c.faction === 'veyr' || !this.sel.some((s) => s.faction === 'veyr')) this.addSel(c);
      this.lastClick = { t: now, id: c.id };
      sfx('click', 1, 0.6);
      if (c.faction === 'veyr' && Math.random() < 0.5) sfx('call', c.size, 0.4);
    } else if (b) { this.selB = b; b.selected = true; sfx('click', 1, 0.6); }
    this.hud.invalidate();
  }
  private boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean) {
    if (!add) this.clearSel();
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    for (const c of this.world.creatures) {
      if (c.dead || c.faction !== 'veyr') continue;
      const [sx, sy, ok] = this.screenOf(c.x, c.y + c.size * 0.3, c.z);
      if (ok && sx >= ax && sx <= bx && sy >= ay && sy <= by) this.addSel(c);
    }
    if (this.sel.length) sfx('click', 1, 0.6);
    this.hud.invalidate();
  }
  private command(mx: number, my: number, queue: boolean) {
    // allies only answer orders once Unit 07 carries the Pack Relay
    const own = this.run.skills.has('command') ? this.sel.filter((c) => c.faction === 'veyr' && !c.dead) : [];
    if (this.selB?.faction === 'veyr' && this.selB.def.kind === 'brood' && !own.length) {
      const g = this.groundAt(mx, my); if (g) { this.selB.rally = [g.x, g.z]; this.fx.burst(g.x, g.y + 0.1, g.z, 8, VEYR.vein, { glow: true, up: 1, speed: 1, size: 2, life: 0.6 }); sfx('click'); }
      return;
    }
    if (!own.length) { this.player?.moveTo(mx, my); return; }
    const tgt = this.pickCreature(mx, my, (c) => !c.dead && c.faction !== 'veyr');
    if (tgt) {
      for (const c of own) { c.order = { kind: 'attack', x: tgt.x, z: tgt.z, target: tgt.id }; c.path = null; }
      tgt.fx.flash.value = 0.7; tgt.fx.flashCol.value.setRGB(1, 0.3, 0.2);
      sfx('call', own[0].size, 0.5);
      return;
    }
    const g = this.groundAt(mx, my);
    if (!g) return;
    this.formation(own, g.x, g.z, 'move');
    this.fx.burst(g.x, g.y + 0.1, g.z, 6, VEYR.vein, { glow: true, up: 0.8, speed: 1.2, size: 2, life: 0.5 });
    sfx('call', own[0].size, 0.35);
    void queue;
  }
  formation(units: Creature[], x: number, z: number, kind: 'move' | 'amove') {
    const n = units.length, cols = Math.ceil(Math.sqrt(n));
    const sp = Math.max(0.8, Math.max(...units.map((u) => u.radius * 2.2)));
    units.forEach((c, i) => {
      const gx = x + ((i % cols) - (cols - 1) / 2) * sp, gz = z + (Math.floor(i / cols) - (Math.ceil(n / cols) - 1) / 2) * sp;
      c.order = { kind, x: clamp(gx, 1, this.region.N - 1), z: clamp(gz, 1, this.region.N - 1) }; c.path = null; c.mind = 'order'; c.homeX = gx; c.homeZ = gz;
    });
  }
  private minimapClick(x: number, z: number, b: number) {
    if (b === 2 && this.sel.some((c) => c.faction === 'veyr')) { this.formation(this.sel.filter((c) => c.faction === 'veyr'), x, z, 'move'); sfx('click'); }
    else this.cam.lookAt(x, z);
  }
  private paintStroke(mx: number, my: number, on: boolean) {
    const g = this.groundAt(mx, my); if (!g) return;
    this.veyr.paintAt(g.x, g.z, 3.4, on);
    if (Math.random() < 0.25) sfx('grow', 1, 0.3);
  }

  // ------------------------------------------------------------------ modes: abilities, building, rally, attack-move
  private async clickMode(mx: number, my: number, shift: boolean) {
    const m = this.mode;
    if (m.k === 'build') {
      const g = this.groundAt(mx, my); if (!g) return;
      const err = this.veyr.canPlace(m.b, g.x, g.z);
      if (err) { toast(err, 'warn', 1500); return; }
      const b = this.veyr.place(m.b, g.x, g.z);
      if (b) { sfx('build'); this.onBuild?.(b); }
      if (!shift) this.setMode({ k: 'normal' });
      return;
    }
    if (m.k === 'amove') {
      const g = this.groundAt(mx, my); if (!g) return;
      this.formation(this.sel.filter((c) => c.faction === 'veyr'), g.x, g.z, 'amove');
      this.setMode({ k: 'normal' }); sfx('click');
      return;
    }
    if (m.k === 'ability') { await this.cast(m.a, mx, my); return; }
  }
  onBuild?: (b: Building) => void;
  onAbility?: (a: Ability, ok: boolean) => void;

  private async cast(a: Ability, mx: number, my: number) {
    if (this.busy) return;
    const h = this.veyr, why = h.can(a);
    if (why) { toast(why, 'warn', 1500); return; }
    const g = this.groundAt(mx, my);
    if (a === 'snare') {
      const c = this.pickCreature(mx, my, (o) => !o.dead && o.faction !== 'veyr');
      if (!c) { toast('Target a creature', 'warn', 1200); return; }
      if (!h.snareable(c)) { toast('It must stand on or beside your moss, inside your field', 'warn', 2200); return; }
      this.busy = true; h.spend(a); this.setMode({ k: 'normal' });
      c.stunT = Math.max(c.stunT, 0.4);
      this.child.cast(new THREE.Vector3(c.x, c.y, c.z));
      sfx('tendril');
      const [sx, sy] = this.screenOf(c.x, c.y + c.size * 0.4, c.z);
      const speed = 22 + Math.min(16, c.speed * 2);
      const grade = await QTE.ring(sx, sy, speed, 'SEIZE IT!');
      this.busy = false;
      if (c.dead) return;
      if (!grade) { c.stunT = 0; c.mind = 'flee'; c.target = 0; c.fleeT = 2; this.onAbility?.(a, false); toast('It tears free', 'warn', 1400); return; }
      this.seize(c, grade);
      this.onAbility?.(a, true);
      return;
    }
    if (a === 'shape') { this.shapeAt(mx, my, 1); return; }
    if (a === 'repel') {
      if (!g) return;
      if (!h.inField(g.x, g.z)) { toast('Outside your field', 'warn', 1400); return; }
      h.spend(a); this.setMode({ k: 'normal' });
      const R = 5.5 * this.powerReach;
      this.child.cast(g); this.ringFx(g, R, this.child.lookData.glow); this.world.flora.impulse?.(g.x, g.z, R, 2.2);
      sfx('pulse', 1.6, 0.9); sfx('zap', 0.7, 0.6); this.cam.shake(0.4, 0.4);
      for (let i = 0; i < 16; i++) { const an = (i / 16) * Math.PI * 2; const p = new THREE.Vector3(g.x + Math.cos(an) * R, 0, g.z + Math.sin(an) * R); p.y = this.world.surfaceY(p.x, p.z) + 0.3; this.fx.arc(g.clone().add(new THREE.Vector3(0, 0.4, 0)), p, 0.1, this.child.lookData.glow, 0.25); }
      this.world.near(g.x, g.z, R, (c) => {
        if (c.dead || c.faction === 'veyr') return;
        const dx = c.x - g.x, dz = c.z - g.z, d = Math.hypot(dx, dz) || 0.1, k = (1 - d / R) * 13 / Math.max(1, c.mass ** 0.15);
        this.knocks.push({ c, vx: (dx / d) * k, vz: (dz / d) * k, t: 0.5 });
        c.stunT = Math.max(c.stunT, 1.4); this.world.damage(c, 3, null);
      });
      this.onAbility?.(a, true);
      return;
    }
    if (a === 'lode') {
      if (!g) return;
      const R2 = this.region;
      const di = R2.deposits.findIndex((d) => d.amount > 0 && Math.hypot(d.x - g.x, d.z - g.z) < d.r + 2.5);
      if (di < 0) { toast('Aim at a ferrite or crystal seam', 'warn', 1500); return; }
      const dep = R2.deposits[di];
      if (!h.inField(dep.x, dep.z)) { toast('That seam is outside your field', 'warn', 1500); return; }
      h.spend(a); this.setMode({ k: 'normal' });
      const amt = Math.min(dep.amount, dep.kind === 'crystal' ? 45 : 32);
      dep.amount -= amt; h.res.min += amt;
      const core = h.core!, dy = this.world.surfaceY(dep.x, dep.z);
      this.child.cast(new THREE.Vector3(dep.x, dy, dep.z));
      for (let i = 0; i < 16; i++) { const ox = (Math.random() - 0.5) * dep.r * 1.5, oz = (Math.random() - 0.5) * dep.r * 1.5; this.fx.mote(dep.x + ox, dy + 0.3, dep.z + oz, core.x, core.y + 1, core.z, dep.kind === 'crystal' ? 0x9ad8ff : 0xc87a4a, 3 + Math.random() * 2); }
      for (let i = 0; i < 6; i++) this.fx.arc(this.child.headPos(), new THREE.Vector3(dep.x + (Math.random() - 0.5) * 2, dy + 0.4, dep.z + (Math.random() - 0.5) * 2), 0.12, this.child.lookData.glow, 0.35);
      this.fx.burst(dep.x, dy + 0.4, dep.z, 30, dep.kind === 'crystal' ? 0x9ad8ff : 0x8a5a3a, { speed: 3, up: 5, size: 4, life: 1.2, grav: 4 });
      sfx('crack', 1.4, 0.8); sfx('zap', 0.8, 0.5); this.cam.shake(0.2, 0.3);
      toast(`+${Math.round(amt)} minerals torn from the seam`, 'good', 1800);
      this.onAbility?.(a, true);
      return;
    }
    if (a === 'pulse' || a === 'bloom' || a === 'storm') {
      if (!g) return;
      if (!h.inField(g.x, g.z)) { toast('Outside your field', 'warn', 1400); return; }
      this.setMode({ k: 'normal' });
      if (a === 'bloom') {
        h.spend(a);
        const N = this.region.N;
        for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) { const r = Math.hypot(dx, dz); if (r > 4.6) continue; const X = Math.floor(g.x) + dx, Z = Math.floor(g.z) + dz; if (X < 0 || Z < 0 || X >= N || Z >= N || this.region.h[Z * N + X] < this.region.water) continue; h.cov[Z * N + X] = Math.max(h.cov[Z * N + X], 1 - r / 9); }
        h.flushCov(); sfx('grow', 1, 1); this.fx.burst(g.x, g.y + 0.2, g.z, 40, VEYR.mossLight, { up: 3, speed: 3, size: 3, life: 1 });
        this.onAbility?.(a, true);
        return;
      }
      if (a === 'storm') { this.child.cast(g); h.spend(a); this.storms.push({ x: g.x, z: g.z, t: 4 }); sfx('pulse'); this.cam.shake(0.6, 0.8); this.onAbility?.(a, true); return; }
      this.busy = true; h.spend(a);
      const [sx, sy] = this.screenOf(g.x, g.y + 1, g.z);
      const grade = await QTE.charge(sx, sy);
      this.busy = false;
      const R = (4.5 + grade * 1.8) * this.powerReach;
      sfx('pulse'); this.cam.shake(0.35 + grade * 0.15, 0.5); this.child.cast(g); this.world.flora.impulse?.(g.x, g.z, R, 1.6 + grade * 0.5);
      this.ringFx(g, R, VEYR.em);
      this.world.near(g.x, g.z, R, (c) => { if (c.dead || c.faction === 'veyr') return; c.stunT = 2 + grade; c.mind = c.faction === 'wild' ? 'idle' : c.mind; this.world.damage(c, 4 + grade * 4, null); c.fx.flashCol.value.setRGB(0.6, 0.5, 1); c.fx.flash.value = 1; });
      this.onAbility?.(a, grade > 0);
      return;
    }
    if (a === 'pull') {
      const c = this.pickCreature(mx, my, (o) => o.faction !== 'veyr' || o.dead);
      if (!c) { toast('Target a creature or a corpse', 'warn', 1200); return; }
      const ng = h.nearestGrowth(c.x, c.z, 30);
      if (!ng) { toast('No moss near enough to pull it to', 'warn', 1500); return; }
      if (Math.hypot(ng[0] - c.x, ng[1] - c.z) > 26) { toast('Too far from your moss', 'warn', 1500); return; }
      h.spend(a); this.setMode({ k: 'normal' });
      this.pulls.push({ c, tx: ng[0], tz: ng[1], t: 2.6 });
      this.child.cast(new THREE.Vector3(c.x, c.y, c.z));
      sfx('zap', 1, 0.6);
      this.onAbility?.(a, true);
      return;
    }
    if (a === 'lance') {
      const c = this.pickCreature(mx, my, (o) => !o.dead && o.faction !== 'veyr');
      if (!c) { toast('Target a creature', 'warn', 1200); return; }
      this.busy = true; h.spend(a); this.setMode({ k: 'normal' });
      const [sx, sy] = this.screenOf(c.x, c.y + c.size * 0.4, c.z);
      const grade = await QTE.ring(sx, sy, 34, 'STRIKE!');
      this.busy = false;
      const from = this.child.headPos();
      let prev = from, cur: Creature | null = c;
      const hitSet = new Set<Creature>();
      for (let k = 0; k <= grade && cur; k++) {
        const to = new THREE.Vector3(cur.x, cur.y + cur.size * 0.4, cur.z);
        this.fx.arc(prev, to, 0.35, VEYR.em, 0.4); this.fx.arc(prev, to, 0.25, 0xffffff, 0.25);
        this.world.damage(cur, (grade ? 40 : 22) * (k ? 0.6 : 1), null);
        hitSet.add(cur); prev = to;
        let nx: Creature | null = null, nd = 64;
        this.world.near(cur.x, cur.z, 8, (o) => { if (o.dead || o.faction === 'veyr' || hitSet.has(o)) return; const d = (o.x - cur!.x) ** 2 + (o.z - cur!.z) ** 2; if (d < nd) { nd = d; nx = o; } });
        cur = nx;
      }
      sfx('zap'); this.cam.shake(0.3, 0.3); this.child.cast(new THREE.Vector3(c.x, c.y, c.z));
      this.onAbility?.(a, true);
    }
  }
  /** Earthshape: the child lifts (dir 1) or sinks (dir -1) the ground over half a second */
  private shapeAt(mx: number, my: number, dir: number) {
    const h = this.veyr, why = h.can('shape');
    if (why) { toast(why, 'warn', 1200); return; }
    const g = this.groundAt(mx, my); if (!g) return;
    if (!h.inField(g.x, g.z)) { toast('Outside your field', 'warn', 1400); return; }
    const R = 3.2 * this.powerReach;
    for (const hv of this.world.hives) for (const b of hv.buildings) if (Math.hypot(b.x - g.x, b.z - g.z) < R + b.def.radius) { toast('Too close to a structure', 'warn', 1400); return; }
    h.spend('shape');
    this.shaping.push({ x: g.x, z: g.z, R, amt: dir > 0 ? 1.7 : -1.5, t: 0.55 });
    this.child.cast(g);
    sfx(dir > 0 ? 'crack' : 'squelch', dir > 0 ? 0.7 : 1.4, 0.9); sfx('pulse', 0.6, 0.4); this.cam.shake(0.25, 0.45);
    this.ringFx(g, R, dir > 0 ? 0xc8a070 : 0x7affe0);
    this.onAbility?.('shape', true);
  }
  private ringFx(g: THREE.Vector3, R: number, col: number) {
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; _v.set(Math.cos(a), 0, Math.sin(a)); this.fx.glow.emit(g.x, g.y + 0.3, g.z, _v.x * R * 2.2, 0.4, _v.z * R * 2.2, new THREE.Color(col).multiplyScalar(2), 1, 3, 0.45, 0, 2.5); }
  }
  /** tendrils hold and constrict; big prey needs a struggle */
  private async seize(c: Creature, grade: number) {
    const big = c.mass > 40;
    c.mind = 'held'; c.order = null; c.vx = c.vz = 0;
    const roots = 3 + grade + (big ? 2 : 0);
    const held: Held = { c, t: 0, dur: 4 + grade, dps: (c.maxHp / (big ? 6 : 2.2)) * (0.8 + grade * 0.35), grip: 1 };
    this.held.push(held);
    for (let k = 0; k < roots; k++) {
      const ng = this.veyr.nearestGrowth(c.x + (Math.random() - 0.5) * 3, c.z + (Math.random() - 0.5) * 3, 5) ?? [c.x, c.z];
      const root = new THREE.Vector3(ng[0] + (Math.random() - 0.5) * 0.8, this.world.surfaceY(ng[0], ng[1]), ng[1] + (Math.random() - 0.5) * 0.8);
      const off = new THREE.Vector3((Math.random() - 0.5) * c.radius, c.size * (0.2 + Math.random() * 0.4), (Math.random() - 0.5) * c.radius);
      this.fx.tendril(root, () => (this.held.includes(held) || c.dead && c.digest <= 0 ? new THREE.Vector3(c.x + off.x, c.y + c.air + off.y, c.z + off.z) : null), held.dur + 6, 0.07 + c.size * 0.025, 9);
    }
    if (big && grade < 2) {
      const [sx, sy] = this.screenOf(c.x, c.y + c.size * 0.6, c.z);
      this.busy = true;
      const g2 = await QTE.mash(sx, sy - 40 * S, 3.2, clamp(c.mass / 120, 0.8, 2.2), 'CONSTRICT! [SPACE]');
      this.busy = false;
      if (!g2) { held.grip = 0; held.dur = Math.min(held.dur, held.t + 0.6); toast('It thrashes loose', 'warn', 1400); }
      else held.dps *= 1 + g2 * 0.4;
    }
  }

  // ------------------------------------------------------------------ harvest
  private openHarvest(c: Creature, sp: Species) {
    const genes = sp.design.genes.filter((g) => GENE[g]);
    const core = this.veyr.core;
    const at = new THREE.Vector3(c.x, c.y, c.z);
    this.cam.followFn(() => at);
    const prevDist = this.cam.distGoal;
    this.cam.distGoal = 13;
    this.harvest.start(at, sp.name, genes, this.veyr.absorbCap, core ? new THREE.Vector3(core.x, core.y + 1.6, core.z) : at.clone(), (chosen) => {
      // absorb all: every gene is taken (the harvest showed each one arrive), one summary toast
      let nNew = 0;
      for (const id of chosen) { if (this.run.add(id, sp.name, this.world.time) === 'new') nNew++; this.veyr.res.helix += 2; }
      if (chosen.length) toast(`The whole genome of the <b>${sp.name}</b>: ${chosen.length} genes${nNew ? `, <b>${nNew} new</b>` : ''}`, 'good', 4200);
      const rest = genes.filter((g) => !chosen.includes(g)).length;
      this.veyr.res.helix += Math.min(3, rest);
      this.cam.followFn(null); this.cam.distGoal = prevDist;
      this.onHarvest?.(sp, chosen);
      // the golem's intake already announces its own absorptions; the moss digesting a corpse does not
      if (!(performance.now() - (this.absorbSeen.get(sp.name) ?? -1e9) < 20000)) this.emit('absorb', { species: sp.name, genes: chosen });
    });
  }
  onHarvest?: (sp: Species, chosen: string[]) => void;
  private absorbSeen = new Map<string, number>();

  // ------------------------------------------------------------------ command card
  /** rival asteroids: the first falls a few minutes in, far from the Veyr */
  private tickRivals(dt: number) {
    // the space race (factions/*) replaces the rival asteroid
    if (this.factions) { this.factions.update(dt); return; }
    for (const r of this.rivals) r.update(dt);
    if (this.rivals.length || !this.veyr.core || this.opts.story === false && !(window as any).__rivalNow) return;
    this.rivalT -= dt;
    if ((window as any).__rivalNow) { this.rivalT = 0; (window as any).__rivalNow = false; }
    if (this.rivalT > 0) return;
    const rnd = new Rand(this.opts.seed * 7 + 99);
    const site = RivalBrain.site(this.world, this.veyr.core.x, this.veyr.core.z, rnd);
    if (!site) { this.rivalT = 60; return; }
    const key = this.opts.seed % RIVALS.length;
    sfx('pulse', 0.3, 0.8);
    toast(`Something else is falling. Red, and fast.`, 'warn', 3000);
    this.rivals.push(new RivalBrain(this.world, this.fx, key, site[0], site[1], this.opts.seed * 13 + 5, {
      landed: (b) => {
        this.cam.shake(1.1, 1.3);
        toast(`<b>${b.name}</b> has fallen on this world. Its creep will come for yours.`, 'warn', 7000);
        if (this.story?.calder && !this.story.calder.dead) this.story.say([{ text: 'Did you feel that? Another one came down. Past the ridge.', expr: 'surprised' }, 'It isn\'t like you. It\'s already eating.']);
      },
      wave: (b, n) => { toast(`<b>${b.name}</b> sends ${n} of its brood against you`, 'warn', 4500); sfx('call', 0.6, 0.8); },
    }));
  }
  /** the mirror pool: change how the child looks */
  openMirror() {
    this.engine.push(new BabyEditor(this.child.lookData, (l) => { this.engine.pop(); if (l) { this.child.setLook(l); toast(`You are <b>${l.name}</b>.`, 'good', 2400); } }));
  }
  ctxKey() { return `${this.menu}|${this.mode.k}|${this.sel.length ? 'u' : ''}|${this.selB ? this.selB.def.kind + (this.selB.done ? 'd' : '') + (this.selB.faction) : ''}|${this.run.reg.list.filter((s) => s.owner === 'veyr').length}`; }
  commands(): Cmd[] {
    const h = this.veyr;
    const ab = (a: Ability): Cmd => ({
      icon: a, key: ABILITIES[a].key, name: ABILITIES[a].name,
      tip: () => `${ABILITIES[a].desc}<div class="sub" style="margin-top:4px">${costHTML(0, 0, ABILITIES[a].charge)}${ABILITIES[a].bio ? ' ' + costHTML(ABILITIES[a].bio, 0) : ''}</div>`,
      disabled: () => h.can(a) || false, active: () => this.mode.k === 'ability' && (this.mode as any).a === a,
      run: () => this.setMode({ k: 'ability', a }), cost: String(ABILITIES[a].charge || ABILITIES[a].bio),
    });
    const abilities = (['snare', 'pulse', 'pull', 'shape', 'repel', 'lode', 'bloom', 'lance', 'storm'] as Ability[]).map(ab);
    if (this.menu === 'build') {
      const cmds: Cmd[] = BUILD_ORDER.map((k) => ({
        icon: k, key: BDEFS[k].key, name: BDEFS[k].name, cost: String(Object.values(BDEFS[k].cost ?? {}).reduce((s, v) => s + (v ?? 0), 0)),
        tip: () => `${BDEFS[k].desc}<div style="margin-top:4px">${h.costHTML(BDEFS[k].cost ?? {})}</div>`,
        disabled: () => h.whyBuild(k) || false,
        active: () => this.mode.k === 'build' && (this.mode as any).b === k,
        run: () => this.setMode({ k: 'build', b: k }),
      }));
      cmds[11] = { icon: 'stop', key: 'Escape', name: 'Back', tip: () => 'Back', run: () => { this.menu = 'main'; this.setMode({ k: 'normal' }); } };
      return cmds;
    }
    const sb = this.selB;
    if (sb && sb.faction === 'veyr' && sb.def.kind === 'brood' && sb.done) {
      const mine = this.run.reg.list.filter((s) => s.owner === 'veyr');
      const cmds: Cmd[] = mine.slice(0, 9).map((sp, i) => ({
        icon: 'cat-repro', key: String(i + 1), name: sp.name,
        tip: () => `Gestate a <b>${sp.name}</b>. ${sp.pheno.warnings[0] ?? ''}<div style="margin-top:4px">${costHTML(h.queueCost(sp).bio, h.queueCost(sp).min)} · ${sp.pheno.buildTime.toFixed(0)}s</div>`,
        disabled: () => { const c = h.queueCost(sp); return h.res.bio < c.bio ? 'Not enough biomass' : h.res.min < c.min ? 'Not enough minerals' : sb.queue.length >= 5 ? 'Queue full' : false; },
        run: () => { const e = h.enqueue(sb, sp); if (e) toast(e, 'warn', 1400); else { sfx('birth', 1, 0.5); this.hud.invalidate(); } },
        cost: String(h.queueCost(sp).bio),
      }));
      if (!mine.length) cmds.push({ icon: 'builder', key: 'C', name: 'Design a species', tip: () => 'You have no designs yet. Open the Gene Forge and grow one from the genes you own.', run: () => this.opts.hooks?.openBuilder?.(this) });
      cmds[10] = { icon: 'rally', key: 'R', name: 'Rally point', tip: () => 'Right-click the ground to set where newborns gather.', run: () => toast('Right-click the ground to set the rally point') };
      cmds[11] = { icon: 'stop', key: 'Escape', name: 'Back', tip: () => 'Deselect', run: () => this.clearSel() };
      return cmds;
    }
    const units = this.sel.filter((c) => c.faction === 'veyr' && !c.dead);
    if (units.length) {
      return [
        { icon: 'move', key: 'M', name: 'Move', tip: () => 'Right-click the ground to move. Right-click a creature to attack it.', run: () => toast('Right-click where they should go') },
        { icon: 'attack', key: 'Z', name: 'Attack-move', tip: () => 'Advance and fight anything hostile on the way.', active: () => this.mode.k === 'amove', run: () => this.setMode({ k: 'amove' }) },
        { icon: 'stop', key: 'X', name: 'Stop', tip: () => 'Drop all orders.', run: () => { for (const c of units) { c.order = null; c.mind = 'idle'; c.homeX = c.x; c.homeZ = c.z; } } },
        { icon: 'hold', key: 'H', name: 'Hold ground', tip: () => 'Stay put, strike anything in reach.', run: () => { for (const c of units) { c.order = { kind: 'hold', x: c.x, z: c.z }; c.homeX = c.x; c.homeZ = c.z; } } },
        ...abilities.filter((x) => x.icon !== 'bloom'),
      ] as Cmd[];
    }
    return [
      ...abilities.slice(0, 4),
      ...abilities.slice(4),
      { icon: 'brood', key: 'B', name: 'Build', tip: () => 'Open the Corps field works catalogue: miners, belts, machines, power, workers.', disabled: () => (this.run.skills.has('works') ? false : 'Unlock Field Works on the skill tree first'), run: () => this.factory.build.toggle() },
      { icon: 'builder', key: 'C', name: 'Gene Forge', tip: () => 'Design a species from the genes you own.', run: () => this.opts.hooks?.openBuilder?.(this) },
    ];
  }

  // ------------------------------------------------------------------ tick
  update(dt: number) {
    const inp = this.input;
    const block = this.harvest.blocking || this.storyBlock;
    const simDt = block || this.paused ? 0 : dt * this.speed * (qteActive() ? 0.22 : 1);
    this.cam.enabled = !this.harvest.blocking && !this.player?.started;
    this.cam.update(dt, inp);
    this.cineCam?.(this.cam.cam, dt);
    this.world.update(simDt, this.cam.cam);
    if (simDt > 0) {
      for (const h of this.world.hives) h.update(simDt);
      this.tickRivals(simDt);
      this.tickHeld(simDt);
      // corpses on growth are taken automatically
      for (const c of this.world.creatures) if (c.dead && c.digest <= 0 && c.bio > 0.3) { for (const h of this.world.hives) if (h.tryDigest(c)) { if (h === this.veyr) sfx('squelch', Math.max(0.6, c.size), this.audible(c.x, c.z)); break; } }
      if (Math.random() < simDt * 0.4) { const c = this.world.creatures[Math.floor(Math.random() * this.world.creatures.length)]; if (c && !c.dead && c.mesh.visible) sfx('call', c.size, this.audible(c.x, c.z) * 0.35); }
    } else for (const h of this.world.hives) for (const b of h.buildings) b.sync(dt, this.world.time);
    this.hatching(dt);
    this.child.setGrowth(this.veyr.emLevel);
    const vc = this.veyr.core;
    if (vc && !this.aura) { this.aura = new CoreAura(vc, this.fx, VEYR.vein); this.world.scene.add(this.aura.group); }
    if (this.aura && (!vc || this.aura.core !== vc)) { this.aura.dispose(); this.aura = null; }
    this.aura?.update(dt, this.veyr.emLevel);
    for (const f of this.update$) f(simDt);
    tickRobots(this, simDt);
    this.story?.update(simDt, dt);
    this.fx.update(simDt > 0 ? simDt : dt * 0.15, this.engine.h, this.cam.cam.fov);
    this.vision.update(simDt > 0 ? simDt : 0);
    this.harvest.update(dt, this.cam.cam);
    this.daylight();
    this.world.sun.follow(this.cam.target, this.cam.dist);
    this.hover(inp);
    this.updateGhost();
    this.hud.update(dt);
    this.drawOverlay();
    this.checkEnd();
    inp.endFrame();
  }
  /** the shell cracks, its top bursts, the child rises, blinks, looks around */
  private hatching(dt: number) {
    const ch = this.child, core = this.veyr.core;
    if (!core) return;
    if (this.hatchT < 9) {
      this.hatchT += dt;
      const t = this.hatchT;
      if (t > 1.2 && t < 3.2 && Math.random() < dt * 12) { this.cam.shake(0.12, 0.2); this.fx.burst(core.x + (Math.random() - 0.5) * 1.2, core.y + 1.1, core.z + (Math.random() - 0.5) * 1.2, 3, 0x6a5a7a, { speed: 1, up: 1.5, size: 2, life: 0.6 }); }
      if (t > 3.2 && this.cap) {
        this.fx.burst(core.x, core.y + 1.2, core.z, 50, 0x5a5068, { speed: 3, up: 4.5, size: 3, life: 1.4, grav: 9 });
        this.fx.burst(core.x, core.y + 1.1, core.z, 50, VEYR.vein, { glow: true, speed: 2, up: 3, size: 2.5, life: 1.4, grav: 1 });
        sfx('crack', 2, 1); sfx('pulse', 1, 0.7); this.cam.shake(0.6, 0.6);
        this.cap.userData.v = 1;
      }
      if (this.cap?.userData.v) {
        const c = this.cap; c.position.y += dt * 9; c.scale.multiplyScalar(Math.max(0, 1 - dt * 2.2)); c.rotation.x += dt * 2;
        if (c.scale.x < 0.05) { c.removeFromParent(); this.cap = null; }
      }
      ch.hatch = clamp((t - 3.2) / 3, 0, 1);
      ch.look.set(core.x + Math.sin(t * 0.9) * 6, core.y + 1.5, core.z + 6);
      if (t > 7 && t < 7.1) sfx('call', 0.4, 0.8);
      if (t >= 8.5) { this.cam.followFn(null); this.cam.distGoal = 30; }
    } else {
      ch.hatch = 1;
      // watch the cursor's ground point, or whatever was last touched
      if (this.input.overCanvas && Math.random() < 0.1) { const g = this.groundAt(this.input.mx, this.input.my); if (g) ch.look.copy(g); }
    }
    ch.update(dt, this.cam.cam);
    // the canopy opens around the golem so it and the ground stay visible
    { const f = this.world.flora as any; if (f?.setFocus) { ch.root.getWorldPosition(_focus); f.setFocus(_focus.x, _focus.y, _focus.z); } }
  }
  private tickHeld(dt: number) {
    for (let i = this.held.length - 1; i >= 0; i--) {
      const hd = this.held[i], c = hd.c;
      hd.t += dt;
      if (c.dead) { this.held.splice(i, 1); continue; }
      c.mind = 'held'; c.air = 0.15 + Math.abs(Math.sin(hd.t * 9)) * 0.12 * hd.grip; c.stunT = 0.1;
      this.world.damage(c, hd.dps * dt * hd.grip, null);
      if (Math.random() < dt * 6) this.fx.burst(c.x, c.y + c.size * 0.4, c.z, 2, c.sp.design.lineage === 'arthropod' ? 0x8ad04a : 0xa82a2a, { speed: 1, up: 1, size: 2, life: 0.4 });
      if (hd.t >= hd.dur) { this.held.splice(i, 1); c.mind = 'flee'; c.air = 0; c.fleeT = 2; }
    }
    for (let i = this.pulls.length - 1; i >= 0; i--) {
      const p = this.pulls[i], c = p.c;
      p.t -= dt;
      const dx = p.tx - c.x, dz = p.tz - c.z, d = Math.hypot(dx, dz);
      if (p.t <= 0 || d < 0.6 || (!c.dead && c.mind === 'held')) { this.pulls.splice(i, 1); c.air = 0; continue; }
      const sp = Math.min(d, (6 + 10 / Math.max(1, c.mass ** 0.3)) * dt);
      c.x += (dx / d) * sp; c.z += (dz / d) * sp; c.y = this.world.surfaceY(c.x, c.z); c.air = Math.sin(Math.min(1, p.t / 2.6) * Math.PI) * 0.8;
      if (!c.dead) c.stunT = 0.2;
      if (Math.random() < dt * 14) this.fx.arc(this.child.headPos(), new THREE.Vector3(c.x, c.y + c.air + c.size * 0.4, c.z), 0.08, 0xb8a0ff, 0.25);
    }
    for (let i = this.knocks.length - 1; i >= 0; i--) {
      const k = this.knocks[i], c = k.c; k.t -= dt;
      if (k.t <= 0 || c.dead) { c.air = 0; this.knocks.splice(i, 1); continue; }
      const N = this.region.N, nx = Math.min(N - 1, Math.max(1, c.x + k.vx * dt)), nz = Math.min(N - 1, Math.max(1, c.z + k.vz * dt));
      if (this.region.heightAt(nx, nz) - this.region.heightAt(c.x, c.z) < 1.6) { c.x = nx; c.z = nz; }
      c.y = this.world.surfaceY(c.x, c.z); c.air = Math.sin((1 - k.t / 0.5) * Math.PI) * 0.9;
    }
    for (let i = this.shaping.length - 1; i >= 0; i--) {
      const s = this.shaping[i], step = Math.min(dt, s.t); s.t -= dt;
      this.region.shape(s.x, s.z, s.R, (s.amt * step) / 0.55);
      this.world.terrain.flushDirty(); this.world.flora.reseat(s.x, s.z, s.R + 0.5);
      if (Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * s.R;
        const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r, y = this.world.surfaceY(x, z);
        this.fx.burst(x, y + 0.1, z, 3, s.amt > 0 ? 0x8a6a4a : 0x5a7a7a, { speed: 1.6, up: s.amt > 0 ? 3.5 : 1.2, size: 3, life: 0.7, grav: 6 });
        if (Math.random() < 0.3) this.fx.arc(this.child.headPos(), new THREE.Vector3(x, y, z), 0.06, this.child.lookData.glow, 0.2);
      }
      if (s.t <= 0) this.shaping.splice(i, 1);
    }
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const s = this.storms[i]; s.t -= dt;
      if (s.t <= 0) { this.storms.splice(i, 1); continue; }
      if (Math.random() < dt * 18) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 9 * this.powerReach;
        const p = new THREE.Vector3(s.x + Math.cos(a) * r, 0, s.z + Math.sin(a) * r); p.y = this.world.surfaceY(p.x, p.z);
        this.fx.arc(p.clone().add(new THREE.Vector3(0, 9, 0)), p, 0.18, VEYR.em, 0.5);
        this.fx.burst(p.x, p.y + 0.2, p.z, 6, 0x9a90a8, { speed: 3, up: 3, size: 3, life: 0.6 });
      }
      this.world.near(s.x, s.z, 9 * this.powerReach, (c) => { if (!c.dead && c.faction !== 'veyr') { this.world.damage(c, 16 * dt, null); c.stunT = Math.max(c.stunT, 0.3); } });
    }
  }
  private daylight() {
    const d = this.world.day;
    const ang = (d - 0.25) * Math.PI * 2;
    const elev = Math.cos(ang);
    const k = clamp(elev * 1.4 + 0.25, 0.16, 1);
    daylight.k = k;
    const pal = this.region.pal, sun = this.world.sun;
    sun.dir.set(Math.sin(ang) * 0.7, Math.max(0.25, Math.abs(elev) * 0.9 + 0.2), -0.35 + Math.cos(ang) * 0.2).normalize();
    sun.setColors(pal, k);
    if (k < 0.5) { sun.hemi.color.lerp(new THREE.Color(0x3a4a8a), (0.5 - k) * 1.5); sun.light.color.lerp(new THREE.Color(0x8a9adf), (0.5 - k) * 1.5); }
    else if (elev < 0.45) sun.light.color.lerp(new THREE.Color(0xffa060), (0.45 - elev) * 1.2);
    const gr = this.engine.post.grade;
    gr.sat = 1.14 - (1 - k) * 0.25; gr.vig = 0.42 + (1 - k) * 0.35; gr.bloom = 0.3 + (1 - k) * 0.45;
    this.world.terrain.U.uVeinGain.value = 1 + (1 - k) * 0.8;
    setNight(1 - k);
  }
  private hover(inp: Input) {
    if (this.hoverC) this.hoverC.hovered = false;
    if (this.hoverB) this.hoverB.hovered = false;
    this.hoverC = null; this.hoverB = null;
    if (!inp.overCanvas || this.harvest.blocking) return;
    const c = this.pickCreature(inp.mx, inp.my);
    if (c) { c.hovered = true; this.hoverC = c; }
    else { const b = this.pickBuilding(inp.mx, inp.my); if (b) { b.hovered = true; this.hoverB = b; } }
    const hostile = c && c.faction !== 'veyr' && !c.dead && this.sel.some((s) => s.faction === 'veyr');
    document.body.classList.toggle('c-attack', !!hostile && this.mode.k === 'normal');
  }
  private updateGhost() {
    if (this.mode.k !== 'build') return;
    const kind = this.mode.b;
    if (!this.ghost || this.ghostKind !== kind) {
      this.ghost?.removeFromParent();
      const b = new Building(BDEFS[kind], 'veyr', 0, 0, 0);
      b.U.uGrow.value = 1; b.done = true;
      this.ghost = b.mesh; this.ghostKind = kind;
      this.world.scene.add(this.ghost);
    }
    const g = this.groundAt(this.input.mx, this.input.my);
    if (!g) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    this.ghost.position.set(g.x, this.region.heightAt(g.x, g.z), g.z);
    const ok = !this.veyr.canPlace(kind, g.x, g.z);
    const b = this.ghost.userData.building as Building;
    b.U.uFlash.value = ok ? 0 : 0.8;
    b.U.uTint.value.set(ok ? 0x9affd8 : 0xff6a5a); b.U.uTintK.value = 0.6;
    b.U.uTime.value = this.world.time; b.U.uPulse.value = 0.5 + 0.5 * Math.sin(this.world.time * 5);
  }
  private checkEnd() {
    if (this.won || this.lostFlag) return;
    if (this.veyr.lost) { this.lostFlag = true; this.opts.hooks?.onLose?.(this); return; }
    const rivalsAlive = this.world.hives.some((h) => h !== this.veyr && !h.lost);
    if (this.conquest() >= this.veyr.winAt && !rivalsAlive && (this.factions?.cleared() ?? true)) { this.won = true; this.opts.hooks?.onWin?.(this); }
  }

  // ------------------------------------------------------------------ 2D overlay: bars, drag box, brushes, ranges
  private drawOverlay() {
    const g = this.og, W = this.overlay.width, H = this.overlay.height;
    g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = false;
    const px = S;
    for (const c of this.world.creatures) {
      if (c.dead || !c.mesh.visible) continue;
      const show = c.selected || c.hovered || c.hp < c.maxHp * 0.98 || c.mind === 'held';
      if (!show) continue;
      const [sx, sy, ok] = this.screenOf(c.x, c.y + c.air + c.sp.pheno.height * c.growth + 0.25, c.z);
      if (!ok) continue;
      const w = Math.round(Math.max(10, Math.min(36, c.size * 9))) * px / 2;
      const x = Math.round(sx - w / 2), y = Math.round(sy);
      g.fillStyle = '#0a0910'; g.fillRect(x - px, y - px, w + px * 2, px * 4);
      g.fillStyle = c.faction === 'veyr' ? '#3a2a1a' : '#2a1010'; g.fillRect(x, y, w, px * 2);
      const f = Math.max(0, c.hp / c.maxHp);
      g.fillStyle = c.faction === 'veyr' ? '#7affe0' : c.faction === 'rival' ? '#ff8ab0' : f > 0.5 ? '#ffe070' : '#ff7050';
      g.fillRect(x, y, Math.round(w * f), px * 2);
    }
    this.factions?.drawOverlay(g);
    // drag box
    if (this.drag?.on && this.mode.k === 'normal') {
      const x0 = Math.min(this.drag.x, this.input.mx), y0 = Math.min(this.drag.y, this.input.my);
      const w = Math.abs(this.input.mx - this.drag.x), h = Math.abs(this.input.my - this.drag.y);
      g.fillStyle = 'rgba(122,255,224,0.08)'; g.fillRect(x0, y0, w, h);
      g.strokeStyle = '#7affe0'; g.lineWidth = px; g.setLineDash([px * 3, px * 2]); g.strokeRect(x0 + 0.5, y0 + 0.5, w, h); g.setLineDash([]);
    }
    // ground circles: brush, pulse radius, snare reach
    const gnd = this.mode.k !== 'normal' && this.input.overCanvas ? this.groundAt(this.input.mx, this.input.my) : null;
    if (gnd) {
      if (this.mode.k === 'paint') this.circle(gnd, 3.4, '#9cea8a');
      if (this.mode.k === 'ability') {
        const a = this.mode.a;
        if (a === 'pulse') this.circle(gnd, 4.5 * this.powerReach, '#c4b4ff');
        if (a === 'storm') this.circle(gnd, 9 * this.powerReach, '#c4b4ff');
        if (a === 'bloom') this.circle(gnd, 4.6, '#9cea8a');
        if (a === 'snare' || a === 'lance' || a === 'pull') {
          const c = this.pickCreature(this.input.mx, this.input.my, (o) => o.faction !== 'veyr' && (a === 'pull' || !o.dead));
          if (c) this.circle(new THREE.Vector3(c.x, c.y, c.z), c.radius + 0.6, a === 'snare' ? (this.veyr.snareable(c) ? '#7affe0' : '#ff7050') : '#c4b4ff');
        }
      }
    }
  }
  private circle(p: THREE.Vector3, r: number, col: string) {
    const g = this.og;
    g.fillStyle = col;
    const n = Math.max(24, Math.floor(r * 10));
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const a = (i / n) * Math.PI * 2;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const [sx, sy, ok] = this.screenOf(x, this.world.surfaceY(clamp(x, 0, this.region.N - 0.01), clamp(z, 0, this.region.N - 0.01)) + 0.08, z);
      if (ok) g.fillRect(Math.round(sx) - S, Math.round(sy) - S, S * 2, S * 2);
    }
  }

  render(post: Post, t: number) { post.render(this.world.scene, this.cam.cam, this.world.fxScene, t); }
  private act = true; private offKey: (() => void) | null = null;
  suspend() { this.act = false; this.hud.root.style.display = 'none'; this.overlay.style.display = 'none'; }
  resume() { this.act = true; this.hud.root.style.display = ''; this.overlay.style.display = ''; this.hud.invalidate(); this.input.endFrame(); }
  /** a finished design becomes a species of yours */
  addDesign(design: import('../life/design').Design, parent: number | null, helixCost: number) {
    const sp = this.run.reg.add(design, 'veyr', parent, 'design', this.world.time);
    this.emit('design', sp);
    this.veyr.res.helix -= helixCost;
    toast(`New species: <b>${sp.name}</b>. Gestate it in a Brood Womb.`, 'good', 5000);
    this.hud.invalidate();
    return sp;
  }
  private calderChoice(done: (absorb: boolean) => void) {
    this.storyBlock = true;
    const p = panel('choice', ui(), 'dark');
    el('div', 'hdr ch-title', p, 'HIS BODY LIES IN YOUR MOSS');
    el('div', 'small ch-sub', p, 'He was the first thing on this world that was kind to you.');
    const row = el('div', 'ch-row', p);
    const fin = (a: boolean) => { p.remove(); this.storyBlock = false; done(a); sfx(a ? 'absorb' : 'done'); };
    new Btn(row, { icon: 'dna', label: 'TAKE WHAT HE WAS', size: 'big', tip: () => '<h4>Absorb Dr. Calder</h4>Gain the hominid lineage: an upright frame, hands, primate eyes.' }, () => fin(true));
    new Btn(row, { icon: 'heart', label: 'LET HIM REST', size: 'big', tip: () => '<h4>Lay him to rest</h4>A pale flower grows where he lies. +8 helix.' }, () => fin(false));
  }
  get vaults() { return this.veyr.buildings.filter((b) => b.def.kind === 'vault' && b.done).length; }
  dispose() { this.act = false; this.factions?.dispose(); this.offKey?.(); (window as any).__game === this && ((window as any).__game = null); this.hud.dispose(); this.overlay.remove(); ui().innerHTML = ''; }
}
