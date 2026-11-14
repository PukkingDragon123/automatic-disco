// A hive: the Veyr (player) or a rival asteroid. The ground a hive holds is made by modifying the living world:
// grafted plants (crystal-and-rivet growth that claims the ground around it), converted and printed creatures
// (which claim the ground they roam) and the structures it fabricates. For the Veyr it is also Unit 07's economy:
// the four raw materials it gathers, the hold that caps them, plant prefabs and sowing, printing allies, and the
// core cells awarded for every step forward.
import * as THREE from 'three';
import type { World } from './world';
import { Building, BDEFS, type BKind } from './buildings';
import type { Creature } from './creature';
import type { Species, Faction } from './species';
import type { Fx } from './fx';
import type { Game } from './game';
import type { PlantPrefab } from './run';
import { RES, SKILL, type Res } from './skills';
import { VEYR, RIVALS } from '../world/palette';
import { clamp, hash01 } from '../core/rand';
import { Pickups } from './pickups';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';

/** a hive's own stock: biomass and minerals are the rivals' internal economy (the Veyr spends run.res instead) */
export interface HiveRes { bio: number; min: number; charge: number; helix: number }
export type Cost = Partial<Record<Res, number>>;
/** territory fraction at which each field level begins (field level 1..5) */
export const EM_LEVELS = [0, 0.04, 0.1, 0.2, 0.32];
/** hold this much of the region's land (and break every rival heart) to take it */
export const WIN_TERRITORY = 0.45;
export const RES_COL: Record<Res, number> = { ore: 0xff9a4a, carbon: 0xe2cc92, water: 0x5ac8ff, soil: 0xc8925a };
export const GRAFT_COST: Cost = { ore: 2 };
/** total gathered at which a core cell is awarded (then every 300 more) */
const GATHER_STEPS = [30, 80, 150, 240, 360, 520, 720, 960];
const TERR_STEPS: [number, number][] = [[0.05, 1], [0.1, 1], [0.2, 1], [0.3, 2], [0.4, 2]];

export type Ability = 'snare' | 'pulse' | 'pull' | 'lance' | 'bloom' | 'storm' | 'shape' | 'repel' | 'lode';
export const ABILITIES: Record<Ability, { name: string; key: string; charge: number; bio: number; em: number; cd: number; desc: string; range: number }> = {
  // the moss is gone: snare and overgrowth are retired (locked forever) until the power set is rebuilt on the skill tree
  snare: { name: 'Tendril Snare', key: '1', charge: 10, bio: 0, em: 99, cd: 2, range: 3.5, desc: 'Retired: there is no moss to strike from.' },
  pulse: { name: 'Gravity Slam', key: '2', charge: 25, bio: 0, em: 1, cd: 8, range: 0, desc: 'Gravikinesis: crush the air over a point. Everything hostile there is slammed down and stunned. Strike at the peak for a wider slam.' },
  pull: { name: 'Telekinesis', key: '3', charge: 15, bio: 0, em: 2, cd: 5, range: 0, desc: 'Lift a creature or a corpse with your mind and float it onto your ground.' },
  bloom: { name: 'Overgrowth', key: '4', charge: 0, bio: 0, em: 99, cd: 12, range: 0, desc: 'Retired: territory is grafted now, not grown.' },
  lance: { name: 'Mind Lance', key: '5', charge: 35, bio: 0, em: 3, cd: 6, range: 0, desc: 'A bolt of thought that leaps from creature to creature. Time it for more leaps.' },
  shape: { name: 'Earthshape', key: '7', charge: 8, bio: 0, em: 1, cd: 0.5, range: 0, desc: 'Move the ground itself. <b>Left-click</b> lifts the earth into a ridge that walkers must go around; <b>right-click</b> sinks it into a hollow that floods below the water line. Walls, moats, ramps, ponds.' },
  repel: { name: 'Repulse', key: '8', charge: 20, bio: 0, em: 1, cd: 6, range: 0, desc: 'Turn gravity inside out at a point: a shockwave throws everything hostile outward, off its feet, dazed. Breaks charges.' },
  lode: { name: 'Gravity Well', key: '9', charge: 15, bio: 0, em: 2, cd: 12, range: 0, desc: 'Open a well over a ferrite or crystal seam: the ore tears loose and falls up into your hold.' },
  storm: { name: 'Gravity Storm', key: '6', charge: 90, bio: 0, em: 5, cd: 40, range: 0, desc: 'Unmake gravity in a wide circle: stones and creatures lift and grind together.' },
};

export interface Digesting { c: Creature; t: number; dur: number; bio0: number; rate: number }
/** a plant this hive has modified: it claims the ground around it, more as it matures */
export interface Graft { i: number; x: number; z: number; r: number; t: number; k: number; grow: number; sown: boolean }

const ease = (t: number) => { const c = 1.7; t -= 1; return 1 + t * t * ((c + 1) * t + c); };
const _v = new THREE.Vector3();

export class Hive {
  res: HiveRes = { bio: 0, min: 0, charge: 30, helix: 0 };
  income = { bio: 0, min: 0 };
  core: Building | null = null;
  buildings: Building[] = [];
  /** coverage this hive writes (world.moss for the Veyr, world.creep for a rival): >= 0.5 is held ground */
  readonly cov: Float32Array;
  /** how strongly the hive's grafts, core and structures claim each column (0..1) */
  readonly claim: Float32Array;
  /** ground its creatures have claimed by roaming (fades slowly) */
  readonly trail: Float32Array;
  /** rival field strength per column (structure placement reach) */
  readonly field: Float32Array;
  /** @deprecated growth painting is gone; kept so older callers still compile */
  readonly paint: Uint8Array;
  emLevel = 1; mass = 0; cells = 0;
  digesting: Digesting[] = [];
  cooldowns: Partial<Record<Ability, number>> = {};
  grafts = new Map<number, Graft>();
  private graftList: Graft[] = [];
  /** converted and printed creatures */
  allies = new Set<Creature>();
  private dissolving: { i: number; t: number; carbon: number }[] = [];
  private tick = 0; private claimT = 0; private claimDirty = true; private fieldDirty = true; private groveT = 3;
  private land: Uint8Array; private landN = 1; private lastFrac = -1;
  supplyUsed = 0; supplyCap = 6;
  absorbCap = 1;
  harvest: ((c: Creature, sp: Species) => void) | null = null;
  readonly color: number; readonly vein: number;
  /** colour slot for grafted flora: 0 the Veyr, 1 + key for a rival */
  readonly gfac: number;
  autoRate = 1;
  lost = false;
  onEvent?: (ev: string, d: any) => void;
  /** the region screen (set for the Veyr by attach) */
  game: Game | null = null;
  pickups: Pickups | null = null;
  /** fallback hull if the golem keeps none of its own */
  hull = 100;
  readonly winAt = WIN_TERRITORY;
  private fxAcc: Record<Res, number> = { ore: 0, carbon: 0, water: 0, soil: 0 };
  /** gathered per resource, decaying (the HUD shows it as a rate) */
  readonly rate: Record<Res, number> = { ore: 0, carbon: 0, water: 0, soil: 0 };
  private terrDone = new Set<number>();
  private bigKills = 0;

  constructor(readonly w: World, readonly faction: Faction, readonly fx: Fx, readonly rivalKey = 0) {
    const R = w.region, N = R.N;
    this.cov = faction === 'veyr' ? w.moss : w.creep;
    this.claim = new Float32Array(N * N); this.trail = new Float32Array(N * N);
    this.field = new Float32Array(N * N);
    this.paint = new Uint8Array(N * N);
    this.land = new Uint8Array(N * N);
    let n = 0;
    for (let i = 0; i < N * N; i++) if (R.h[i] >= R.water && !R.solid[i]) { this.land[i] = 1; n++; }
    this.landN = Math.max(1, n);
    this.color = faction === 'veyr' ? VEYR.vein : RIVALS[rivalKey].creep;
    this.vein = faction === 'veyr' ? VEYR.vein : RIVALS[rivalKey].vein;
    this.gfac = faction === 'veyr' ? 0 : 1 + rivalKey;
    if (faction === 'rival') { this.res.bio = 160; this.res.min = 40; this.res.charge = 45; }
  }
  get enemyCov() { return this.faction === 'veyr' ? this.w.creep : this.w.moss; }
  get isVeyr() { return this.faction === 'veyr'; }
  private get run() { return this.game?.run ?? null; }
  private get skills() { return this.game?.run.skills ?? null; }
  private has(id: string) { return !this.isVeyr || !!this.skills?.has(id); }

  /** wire the Veyr to the region screen: events, pickups, the golem */
  attach(g: Game) {
    this.game = g;
    if (!this.isVeyr) return;
    this.pickups = new Pickups(this, g.opts.seed);
    this.hull = this.hullMax;
    g.on('kill', (d: { species?: string }) => this.onKill(d?.species ?? ''));
    g.on('absorb', (d: { species?: string }) => { if (d?.species) this.once('m.sp.' + d.species, 1, `genome of ${d.species}`); });
    g.on('prefab', (d: { kind?: string; name?: string }) => { if (d?.kind === 'creature' && d.name) this.once('m.cp.' + d.name, 1, `${d.name} saved as a prefab`); });
    g.on('hurt', (d: { amt?: number }) => { this.hull = Math.max(0, this.hull - (d?.amt ?? 0)); });
  }
  /** Unit 07's position (feet), if it is about */
  golem(out = _v): THREE.Vector3 | null {
    const ch = this.game?.child;
    if (!ch || !ch.root.visible) return null;
    return out.copy(ch.root.position);
  }

  plantCore(x: number, z: number) {
    const b = new Building(BDEFS.core, this.faction, x, z, this.w.region.heightAt(x, z) - 0.6, this.faction === 'rival' ? RIVALS[this.rivalKey].core : undefined);
    b.done = true; b.progress = 1; b.hp = b.maxHp; b.U.uGrow.value = 1;
    this.core = b; this.buildings.push(b); this.w.scene.add(b.mesh);
    // the crash site is home ground from the first moment
    const N = this.w.region.N;
    this.rebuildClaim();
    for (let i = 0; i < N * N; i++) if (this.land[i] && this.claim[i] >= 0.5) this.cov[i] = Math.max(this.cov[i], this.claim[i]);
    this.fieldDirty = true;
  }

  // ================================================================== economy (the Veyr)
  /** hold capacity for a raw material: the core's hold, doubled by the Core Housing, again by the Storage Tanks */
  cap(r: Res) { return Math.round(30 * (this.has('torso') ? 2 : 1) * (this.has('tanks') ? 2.5 : 1)); }
  caps(): Record<Res, number> { return { ore: this.cap('ore'), carbon: this.cap('carbon'), water: this.cap('water'), soil: this.cap('soil') }; }
  full(r: Res) { const run = this.run; return !!run && run.res[r] >= this.cap(r) - 0.01; }
  get chargeCap() { return this.isVeyr ? 40 + (this.has('torso') ? 20 : 0) + (this.has('coil') ? 30 : 0) + (this.has('reactor') ? 60 : 0) + (this.emLevel - 1) * 10 : 60 + this.emLevel * 40; }
  get hullMax() { return 100 + (this.has('torso') ? 40 : 0) + (this.has('plating1') ? 60 : 0) + (this.has('plating2') ? 100 : 0); }
  /** what is missing to pay a cost (null if it can be paid) */
  lack(c: Cost): string | null {
    const run = this.run; if (!run) return null;
    for (const k of RES) { const n = c[k] ?? 0; if (n > 0 && run.res[k] < n) return `Needs ${n} ${k}`; }
    return null;
  }
  pay(c: Cost): boolean {
    const run = this.run; if (!run || this.lack(c)) return false;
    for (const k of RES) run.res[k] = Math.max(0, run.res[k] - (c[k] ?? 0));
    return true;
  }
  /** cost as inline HTML chips */
  costHTML(c: Cost) {
    return RES.filter((k) => (c[k] ?? 0) > 0).map((k) => `<span style="color:#${RES_COL[k].toString(16).padStart(6, '0')}">${c[k]} ${k.toUpperCase()}</span>`).join(' ');
  }

  /** credit a gathered resource to run.res (capped by the hold); a streak of it flies to the golem. Returns the amount stored */
  gather(res: Res, amt: number, x: number, y: number, z: number, quiet = false): number {
    const run = this.run;
    if (!run || !(amt > 0)) return 0;
    const cur = run.res[res], got = Math.max(0, Math.min(amt, this.cap(res) - cur));
    if (got <= 0) return 0;
    run.res[res] = cur + got;
    this.rate[res] += got;
    this.fxAcc[res] += got;
    const n = Math.min(6, Math.floor(this.fxAcc[res] / 0.7));
    if (n > 0) {
      this.fxAcc[res] -= n * 0.7;
      const g = this.golem();
      if (g && !quiet) for (let k = 0; k < n; k++) this.fx.mote(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.4, g.x, g.y + 0.55, g.z, RES_COL[res], 5 + Math.random() * 3);
      else if (g) this.fx.burst(g.x, g.y + 0.55, g.z, 2 + n, RES_COL[res], { glow: true, speed: 0.8, up: 0.8, size: 2, life: 0.35, grav: 0 });
    }
    this.game?.emit('gather', { res, amt: got, x, y, z });
    // milestones: the first of each, then every so much gathered
    this.once('m.first.' + res, 1, `first ${res}`);
    const f = run.flags;
    f['m.total'] = (f['m.total'] ?? 0) + got;
    let step = f['m.gstep'] ?? 0;
    const need = (s: number) => GATHER_STEPS[s] ?? GATHER_STEPS[GATHER_STEPS.length - 1] + (s - GATHER_STEPS.length + 1) * 300;
    while (f['m.total'] >= need(step)) { step++; this.award(1, `${Math.round(need(step - 1))} materials gathered`); }
    f['m.gstep'] = step;
    return got;
  }
  /** credit to the hold without the golem (structures): motes fly to the core instead */
  private credit(res: Res, amt: number, x: number, y: number, z: number) {
    const run = this.run; if (!run || !(amt > 0)) return 0;
    const got = Math.max(0, Math.min(amt, this.cap(res) - run.res[res]));
    run.res[res] += got; this.rate[res] += got;
    if (got > 0 && this.core && Math.random() < 0.35) this.fx.mote(x, y, z, this.core.x, this.core.y + 1, this.core.z, RES_COL[res], 3);
    return got;
  }
  /** core cells: granted to the skill tree, announced */
  award(n: number, why: string) {
    const g = this.game; if (!g || n <= 0) return;
    g.run.skills.grant(n, why);
    g.emit('points', { n, why });
    toast(`+${n} CORE CELL${n > 1 ? 'S' : ''} &middot; ${why}`, 'good', 3600);
    sfx('done', 1, 0.6);
  }
  private once(key: string, n: number, why: string) {
    const f = this.run?.flags; if (!f || f[key]) return;
    f[key] = 1; this.award(n, why);
  }
  private onKill(species: string) {
    const sp = this.run?.reg.list.find((s) => s.name === species);
    if (!sp) return;
    if (sp.role === 'apex') this.award(2, `${species} brought down`);
    else if (sp.pheno.stats.mass >= 40 && this.bigKills < 4) { this.bigKills++; this.award(1, `${species} brought down`); }
  }

  // ================================================================== territory
  /** territory held, 0..1 of the region's land */
  territory(): number { return this.cells / this.landN; }
  covAt(x: number, z: number) { const N = this.w.region.N; return this.cov[clamp(Math.floor(z), 0, N - 1) * N + clamp(Math.floor(x), 0, N - 1)]; }
  /** is this ground the hive's own */
  holds(x: number, z: number) { return this.covAt(x, z) >= 0.5; }
  inField(x: number, z: number) {
    if (this.isVeyr) {
      if (this.holds(x, z)) return true;
      const g = this.golem(); return !!g && (g.x - x) ** 2 + (g.z - z) ** 2 < 14 * 14;
    }
    const N = this.w.region.N; return this.field[clamp(Math.floor(z), 0, N - 1) * N + clamp(Math.floor(x), 0, N - 1)] > 0;
  }
  /** @deprecated growth painting is gone */
  paintAt(_x: number, _z: number, _r: number, _on = true) { /* territory is grafted now */ }

  private graftR(i: number) { const sp = this.w.flora.species[this.w.flora.sp[i]]; return sp.tree ? 4.6 : sp.hmax > 1.2 ? 3.8 : 3.1; }
  private effR(g: Graft) { return g.r * clamp(0.35 + g.t / 9, 0.35, 1) * (g.sown ? clamp(g.grow, 0, 1) : 1) + (g.t > 50 ? 0.9 : 0); }
  private rebuildClaim() {
    const R = this.w.region, N = R.N, cl = this.claim;
    cl.fill(0);
    const stamp = (x: number, z: number, r: number, tail: number) => {
      const e = r + tail, x0 = Math.max(0, Math.floor(x - e)), x1 = Math.min(N - 1, Math.ceil(x + e)), z0 = Math.max(0, Math.floor(z - e)), z1 = Math.min(N - 1, Math.ceil(z + e));
      for (let Z = z0; Z <= z1; Z++) for (let X = x0; X <= x1; X++) {
        const d = Math.sqrt((X + 0.5 - x) ** 2 + (Z + 0.5 - z) ** 2);
        if (d >= e) continue;
        cl[Z * N + X] += d < r ? 1 - 0.5 * (d / r) * (d / r) : 0.5 * (1 - (d - r) / tail);
      }
    };
    if (this.core && !this.lost) stamp(this.core.x, this.core.z, 5, 2.4);
    for (const b of this.buildings) if (b.done && b !== this.core) stamp(b.x, b.z, b.def.radius + (b.def.kind === 'spire' ? 4 : 1.6), 1.6);
    for (const g of this.graftList) stamp(g.x, g.z, this.effR(g), 2.4);
    for (let i = 0; i < N * N; i++) if (cl[i] > 1) cl[i] = 1;
    this.claimDirty = false;
  }
  private paintTrail(x: number, z: number, k: number) {
    const N = this.w.region.N, r = 1.7, tr = this.trail, x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(N - 1, Math.floor(x + r)), z0 = Math.max(0, Math.floor(z - r)), z1 = Math.min(N - 1, Math.floor(z + r));
    for (let Z = z0; Z <= z1; Z++) for (let X = x0; X <= x1; X++) {
      const i = Z * N + X; if (!this.land[i]) continue;
      const d = Math.sqrt((X + 0.5 - x) ** 2 + (Z + 0.5 - z) ** 2); if (d >= r) continue;
      tr[i] = Math.min(1, tr[i] + k * (1 - d / r));
    }
  }
  /** grafts, trails and contests -> held ground; field level; territory events and milestones */
  private territoryTick(dt: number) {
    const N = this.w.region.N, cov = this.cov, cl = this.claim, tr = this.trail, land = this.land;
    if (this.claimDirty) this.rebuildClaim();
    // its creatures claim the ground they walk
    if (!this.lost) for (const c of this.w.creatures) if (!c.dead && c.faction === this.faction && !c.canFly) this.paintTrail(c.x, c.z, dt * 0.32);
    const others = this.w.hives.filter((h) => h !== this && !h.lost);
    let cells = 0;
    for (let i = 0; i < N * N; i++) {
      if (tr[i] > 0) tr[i] = Math.max(0, tr[i] - dt * 0.003);
      if (!land[i]) { cov[i] = 0; continue; }
      const mine = this.lost ? 0 : Math.max(cl[i], tr[i]);
      let theirs = 0;
      for (const o of others) { const v = o.claim[i] > o.trail[i] ? o.claim[i] : o.trail[i]; if (v > theirs) theirs = v; }
      const c = cov[i];
      const tgt = mine > theirs || (mine === theirs && c >= 0.5) ? mine : 0;
      cov[i] = tgt > c ? Math.min(tgt, c + dt * 0.8) : Math.max(tgt, c - dt * 0.3);
      if (cov[i] >= 0.5) cells++;
    }
    this.cells = cells;
    this.flushCov();
    const f = this.territory();
    this.mass = cells + this.buildings.reduce((s, b) => s + (b.done ? b.def.hp * 0.25 : 0), 0);
    let lvl = 1; for (let k = 1; k < EM_LEVELS.length; k++) if (f >= EM_LEVELS[k]) lvl = k + 1;
    if (lvl !== this.emLevel) { const up = lvl > this.emLevel; this.emLevel = lvl; this.fieldDirty = true; if (up) this.onEvent?.('em', lvl); }
    if (this.isVeyr) {
      if (Math.abs(f - this.lastFrac) >= 0.005 || (f === 0) !== (this.lastFrac === 0)) { this.lastFrac = f; this.game?.emit('territory', { frac: f }); }
      for (const [at, n] of TERR_STEPS) if (f >= at && !this.terrDone.has(at)) { this.terrDone.add(at); this.award(n, `${Math.round(at * 100)}% of the land held`); }
    }
  }
  flushCov() {
    const t = this.w.terrain, N = this.w.region.N;
    for (let i = 0; i < N * N; i++) { if (this.isVeyr) t.setMoss(i, this.cov[i]); else t.setCreep(i, this.cov[i]); }
    t.mossFlush();
  }

  // ------------------------------------------------------------------ grafting
  /** which hive (if any) has modified flora instance i */
  ownerOf(i: number): Hive | null { for (const h of this.w.hives) if (h.grafts.has(i)) return h; return this.grafts.has(i) ? this : null; }
  isGrafted(i: number) { return this.grafts.has(i); }
  /** why flora instance i cannot be grafted right now (null if it can) */
  whyGraft(i: number): string | null {
    const fl = this.w.flora;
    if (!(i >= 0 && i < fl.n)) return 'Nothing to graft';
    if (this.grafts.has(i)) return 'Already grafted';
    if (fl.bio[i] <= 0.08 || this.dissolving.some((d) => d.i === i)) return 'Too far gone to graft';
    if (this.isVeyr) {
      if (!this.has('graft')) return `Needs ${SKILL.graft.name}`;
      return this.lack(GRAFT_COST);
    }
    return this.res.bio < 10 ? 'Not enough biomass' : null;
  }
  /** modify flora instance i into this hive's growth; it claims territory around it (steals it from a rival) */
  graftPlant(i: number): boolean {
    if (this.whyGraft(i)) return false;
    if (this.isVeyr) this.pay(GRAFT_COST); else this.res.bio -= 10;
    this.applyGraft(i, false, false);
    return true;
  }
  private applyGraft(i: number, sown: boolean, quiet: boolean) {
    const w = this.w, fl = w.flora;
    for (const h of w.hives) if (h !== this && h.grafts.has(i)) h.ungraft(i);
    const g: Graft = { i, x: fl.x[i], z: fl.z[i], r: this.graftR(i), t: 0, k: 0, grow: sown ? 0 : 1, sown };
    this.grafts.set(i, g); this.graftList.push(g);
    this.claimDirty = true;
    fl.setGraft(i, 0.001, this.gfac);
    const sp = fl.species[fl.sp[i]], y = w.surfaceY(g.x, g.z), hgt = Math.min(3, sp.hmax);
    // the graft: the field arcs in, metal sheathes the stem, rivets pop
    if (!quiet) {
      const head = this.isVeyr ? this.game?.child.headPos() : null;
      if (head) for (let k = 0; k < 3; k++) this.fx.arc(head, new THREE.Vector3(g.x + (Math.random() - 0.5) * 0.4, y + hgt * Math.random(), g.z + (Math.random() - 0.5) * 0.4), 0.3, this.vein, 0.3);
      this.fx.burst(g.x, y + hgt * 0.4, g.z, 16, this.vein, { glow: true, speed: 1.4, up: 2, size: 2.6, life: 0.9, grav: 1 });
      this.fx.burst(g.x, y + hgt * 0.5, g.z, 8, 0x9aa6ae, { speed: 1.6, up: 2.2, size: 2.4, life: 0.7, grav: 7 });
      if (this.isVeyr) { sfx('crack', 0.8, 0.5); sfx('grow', 1, 0.6); }
    }
    if (this.isVeyr) {
      this.game?.emit('graft', { x: g.x, z: g.z, kind: sp.name });
      this.once('m.graft', 1, 'first plant grafted');
    }
  }
  /** release a graft (taken over, or the hive fell) */
  ungraft(i: number) {
    const g = this.grafts.get(i); if (!g) return;
    this.grafts.delete(i);
    const k = this.graftList.indexOf(g); if (k >= 0) this.graftList.splice(k, 1);
    this.w.flora.setGraft(i, 0, 0);
    this.claimDirty = true;
  }
  /** graft up to n plants at the edge of what the hive holds (the Grove Engine; a rival's spread) */
  spread(n: number, free: boolean): number {
    const fl = this.w.flora;
    let done = 0;
    for (let tries = 0; tries < n * 5 && done < n; tries++) {
      const src = this.graftList.length ? this.graftList[Math.floor(Math.random() * this.graftList.length)] : null;
      const sx = src ? src.x : this.core?.x, sz = src ? src.z : this.core?.z;
      if (sx === undefined || sz === undefined) break;
      const reach = src ? 4.8 : 9;
      const cand: number[] = [];
      fl.near(sx, sz, reach, (i) => {
        if (this.grafts.has(i) || fl.bio[i] <= 0.2) return;
        const o = this.ownerOf(i);
        if (o && (this.isVeyr || Math.random() > 0.3)) return; // rivals sometimes take back a Veyr graft
        cand.push(i);
      });
      if (!cand.length) continue;
      // a rival keeps a reserve for its structures and brood
      if (!free) { if (this.res.bio < 10 + (this.isVeyr ? 0 : 70)) break; this.res.bio -= 10; }
      const i = cand[Math.floor(Math.random() * cand.length)];
      this.applyGraft(i, false, true);
      const y = this.w.surfaceY(fl.x[i], fl.z[i]);
      if (src) this.fx.mote(src.x, y + 0.4, src.z, fl.x[i], y + 0.6, fl.z[i], this.vein, 2.5);
      this.fx.burst(fl.x[i], y + 0.5, fl.z[i], 6, this.vein, { glow: true, speed: 0.8, up: 1.4, size: 2, life: 0.7, grav: 0 });
      done++;
    }
    return done;
  }

  // ------------------------------------------------------------------ plant prefabs
  whyAbsorbPlant(i: number): string | null {
    const fl = this.w.flora;
    if (!(i >= 0 && i < fl.n) || fl.bio[i] <= 0.08 || this.dissolving.some((d) => d.i === i)) return 'Nothing to absorb';
    if (this.isVeyr && !this.has('sow')) return `Needs ${SKILL.sow.name}`;
    return null;
  }
  /** absorb flora instance i as a plant prefab (it dissolves into the golem); returns the prefab or null */
  absorbPlant(i: number): PlantPrefab | null {
    if (this.whyAbsorbPlant(i)) return null;
    const w = this.w, fl = w.flora, run = this.run;
    const sp = fl.species[fl.sp[i]];
    const prefab: PlantPrefab = { name: sp.name, kind: fl.sp[i], seed: Math.floor(hash01(i, fl.sp[i], 17) * 997), at: w.time };
    if (run) {
      const k = run.plants.findIndex((p) => p.name === prefab.name);
      if (k >= 0) run.plants[k] = prefab; else { run.plants.push(prefab); if (run.plants.length > 32) run.plants.shift(); }
    }
    this.ownerOf(i)?.ungraft(i);
    this.dissolving.push({ i, t: 0, carbon: 1.5 + sp.food * (sp.tree ? 6 : 3) });
    const y = w.surfaceY(fl.x[i], fl.z[i]);
    this.fx.burst(fl.x[i], y + Math.min(2, sp.hmax) * 0.5, fl.z[i], 14, this.vein, { glow: true, speed: 1, up: 1.6, size: 2.4, life: 0.9, grav: -0.5 });
    sfx('absorb', 1, 0.5);
    if (this.isVeyr) {
      this.game?.emit('prefab', { kind: 'plant', name: prefab.name });
      this.once('m.plant.' + prefab.name, 1, `${prefab.name} saved as a prefab`);
    }
    return prefab;
  }
  /** what sowing a prefab costs */
  sowCost(p: { name: string; kind: number }): Cost {
    const sp = this.w.flora.species[this.resolveKind(p)];
    return sp?.tree ? { carbon: 10, water: 8 } : { carbon: 5, water: 3 };
  }
  private resolveKind(p: { name: string; kind: number }) {
    const S = this.w.flora.species;
    const k = S.findIndex((s) => s.name === p.name);
    return k >= 0 ? k : ((p.kind % S.length) + S.length) % S.length;
  }
  whySow(p: { name: string; kind: number; seed: number }, x: number, z: number): string | null {
    const w = this.w, R = w.region, fl = w.flora;
    if (this.isVeyr && !this.has('sow')) return `Needs ${SKILL.sow.name}`;
    if (x < 2 || z < 2 || x > R.N - 2 || z > R.N - 2) return 'Out of bounds';
    if (R.isSolid(x, z)) return 'Rock in the way';
    const sp = fl.species[this.resolveKind(p)];
    if (!sp) return 'Unknown seed';
    if (R.isWater(x, z) !== sp.water) return sp.water ? 'It grows in water' : 'It needs dry ground';
    let crowded = false;
    fl.near(x, z, sp.tree ? 1.6 : 0.55, (i) => { if (fl.bio[i] > 0.05) crowded = true; });
    if (crowded) return 'Too crowded';
    return this.lack(this.sowCost(p));
  }
  /** plant a grafted copy of a prefab at x,z (it grows in) */
  sow(prefab: { name: string; kind: number; seed: number }, x: number, z: number): boolean {
    if (this.whySow(prefab, x, z)) return false;
    const fl = this.w.flora;
    const i = fl.addPlant(this.resolveKind(prefab), prefab.seed, x, z);
    if (i < 0) { toast('The ground here will take no more', 'warn', 1600); return false; }
    this.pay(this.sowCost(prefab));
    fl.setGrow(i, 0);
    this.applyGraft(i, true, true);
    const y = this.w.surfaceY(x, z);
    this.fx.burst(x, y + 0.1, z, 18, 0x8a6a4a, { speed: 1.4, up: 2.4, size: 3, life: 0.7, grav: 7 });
    this.fx.burst(x, y + 0.2, z, 12, this.vein, { glow: true, speed: 0.8, up: 2.6, size: 2.2, life: 1, grav: 0 });
    const head = this.game?.child.headPos(); if (head) this.fx.arc(head, new THREE.Vector3(x, y + 0.1, z), 0.3, this.vein, 0.25);
    sfx('grow', 1.2, 0.8);
    this.once('m.sow', 1, 'first seed sown');
    return true;
  }

  // ------------------------------------------------------------------ creatures: convert, print, absorb
  /** how many allies it can keep */
  allyCap() { return this.isVeyr ? 4 + (this.has('convert') ? 2 : 0) + (this.has('print') ? 3 : 0) + (this.has('vat') ? 3 : 0) : 99; }
  allyCount() { let n = 0; for (const c of this.allies) if (!c.dead) n++; return n; }
  whyConvert(c: Creature): string | null {
    if (c.dead) return 'It is dead';
    if (c.faction === this.faction) return 'Already yours';
    if (this.isVeyr && !this.has('convert')) return `Needs ${SKILL.convert.name}`;
    if (this.allyCount() >= this.allyCap()) return 'No room for another ally';
    return null;
  }
  /** rewire a beaten creature to this hive's side; it claims the ground it roams */
  convert(c: Creature): boolean {
    if (this.whyConvert(c)) return false;
    const w = this.w;
    const herd = w.herds.get(c.herd); if (herd) { const k = herd.indexOf(c); if (k >= 0) herd.splice(k, 1); }
    c.faction = this.faction; c.herd = 0; c.order = null; c.mind = 'idle'; c.target = 0; c.path = null;
    c.homeX = c.x; c.homeZ = c.z; c.stunT = Math.max(c.stunT, 1.2); c.fleeT = 0;
    c.hp = Math.max(c.hp, c.maxHp * 0.5); c.energy = Math.max(c.energy, 0.8);
    // anything that was fighting it lets go
    for (const o of w.creatures) if (o.target === c.id && o.faction === c.faction) { o.target = 0; if (o.mind === 'attack') o.mind = 'idle'; }
    this.allies.add(c);
    this.mark(c);
    const head = this.isVeyr ? this.game?.child.headPos() : null;
    const top = new THREE.Vector3(c.x, c.y + c.size * 0.5, c.z);
    if (head) for (let k = 0; k < 4; k++) this.fx.arc(head, top.clone().add(new THREE.Vector3((Math.random() - 0.5) * c.radius, Math.random() * c.size * 0.3, (Math.random() - 0.5) * c.radius)), 0.35, this.vein, 0.3);
    this.fx.burst(top.x, top.y, top.z, 22, this.vein, { glow: true, speed: 1.8, up: 2, size: 2.6, life: 1, grav: 0.5 });
    this.fx.burst(top.x, top.y, top.z, 10, 0xa0aab2, { speed: 2, up: 2.4, size: 2.4, life: 0.6, grav: 8 });
    if (this.isVeyr) {
      sfx('zap', 1, 0.6); sfx('call', c.size, 0.5);
      this.game?.emit('convert', { species: c.sp.name });
      this.once('m.convert', 1, 'first creature converted');
    }
    return true;
  }
  /** an ally carries the hive's mark: a glow in the core's colour, and plated, riveted patches where the creature
   *  shader allows recolouring them */
  private mark(c: Creature) {
    c.fx.moss.value = 0.24;
    (c as any).__mk = 0;
    this.recolor(c);
  }
  private recolor(c: Creature) {
    const r = this.game?.engine.renderer; if (!r) return true;
    const u = (r.properties.get(c.mesh.material) as any)?.uniforms;
    if (!u?.uMossA) return false;
    u.uMossA.value.setHex(0x30383e); u.uMossB.value.setHex(0x5e6a72); u.uMossL.value.setHex(0xa4b2ba); u.uVein.value.setHex(this.vein);
    (c as any).__mk = 1;
    return true;
  }
  /** creature designs the Veyr can print */
  designs(): Species[] { return this.run?.reg.list.filter((s) => s.owner === 'veyr') ?? []; }
  printCost(sp: Species): Cost {
    const k = this.has('vat') ? 1.2 : 1;
    return { carbon: Math.round(clamp(sp.pheno.cost * 0.3, 10, 120) * k), water: Math.round(clamp(sp.pheno.cost * 0.2, 6, 80) * k) };
  }
  whyPrint(designIdx: number): string | null {
    const sp = this.designs()[designIdx];
    if (!sp) return 'No such design';
    if (!this.has('print')) return `Needs ${SKILL.print.name}`;
    if (!this.golem()) return 'Unit 07 is not here';
    if (this.allyCount() >= this.allyCap()) return 'No room for another ally';
    return this.lack(this.printCost(sp));
  }
  /** print an allied creature from a design next to the golem; returns it (null if it cannot) */
  print(designIdx: number): Creature | null {
    if (this.whyPrint(designIdx)) return null;
    const sp = this.designs()[designIdx], g = this.golem()!.clone();
    let c: Creature | null = null;
    for (let k = 0; k < 6 && !c; k++) { const a = Math.random() * Math.PI * 2, d = 1.4 + sp.pheno.length * 0.5 + k * 0.3; c = this.w.spawn(sp, 'veyr', g.x + Math.cos(a) * d, g.z + Math.sin(a) * d, false); }
    if (!c) return null;
    this.pay(this.printCost(sp));
    c.energy = 0.9; c.homeX = c.x; c.homeZ = c.z;
    if (this.has('vat')) { c.hp = c.maxHp; }
    this.allies.add(c); this.mark(c);
    c.fx.dissolve.value = 1; (c as any).__print = 1;
    const head = this.game?.child.headPos() ?? g;
    for (let k = 0; k < 5; k++) this.fx.arc(head, new THREE.Vector3(c.x + (Math.random() - 0.5) * c.radius * 2, c.y + Math.random() * c.size * 0.6, c.z + (Math.random() - 0.5) * c.radius * 2), 0.4, this.vein, 0.25);
    this.fx.burst(c.x, c.y + c.size * 0.3, c.z, 24, this.vein, { glow: true, speed: 1.4, up: 2.4, size: 2.6, life: 1.1, grav: 0 });
    sfx('birth', 1, 0.8); sfx('zap', 0.7, 0.4);
    this.game?.emit('print', { species: sp.name });
    this.once('m.print', 1, 'first creature printed');
    return c;
  }
  /** take a corpse apart with the field: its carbon comes in as it goes, then its genome is offered */
  absorbCorpse(c: Creature): boolean { return this.tryDigest(c, 1.6, true); }
  /** corpses are taken apart: rivals take what dies on their ground; the Veyr only when told to (absorbCorpse) */
  tryDigest(c: Creature, speed = 1, manual = false): boolean {
    if (!c.dead || c.digest > 0 || c.bio <= 0.3) return false;
    if (this.isVeyr ? !manual : this.covAt(c.x, c.z) < 0.5) return false;
    const dur = ((this.isVeyr ? 2.4 : 5) + Math.sqrt(Math.max(1, c.mass)) * (this.isVeyr ? 0.6 : 1.4)) / speed;
    this.digesting.push({ c, t: 0, dur, bio0: c.bio, rate: c.bio / dur });
    c.digest = 0.001;
    if (this.isVeyr) sfx('zap', 0.8, 0.5);
    return true;
  }
  private digest(dt: number) {
    const w = this.w;
    for (let i = this.digesting.length - 1; i >= 0; i--) {
      const d = this.digesting[i], c = d.c;
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      c.digest = Math.max(0.001, k);
      c.fx.decay.value = Math.max(c.fx.decay.value, k * 0.7);
      const take = Math.min(c.bio, d.rate * dt);
      c.bio -= take;
      const top = _v.set(c.x + (Math.random() - 0.5) * c.radius, c.y + c.size * 0.3, c.z + (Math.random() - 0.5) * c.radius);
      if (this.isVeyr) {
        this.gather('carbon', take * 0.45, top.x, top.y, top.z);
        const head = this.game?.child.headPos();
        if (head && Math.random() < dt * 8) this.fx.arc(head, top, 0.12, this.vein, 0.35);
        c.air = Math.min(0.6, c.air + dt * 0.25);
      } else {
        this.res.bio += take; this.income.bio += take * 0.02;
        if (this.core && Math.random() < dt * (2 + c.size * 2)) this.fx.mote(top.x, top.y, top.z, this.core.x, this.core.y + 0.9, this.core.z, this.vein, 3 + Math.random() * 2);
      }
      if (k >= 1) {
        c.fx.dissolve.value = Math.min(1, c.fx.dissolve.value + dt * 0.9);
        if (Math.random() < dt * 20) this.fx.burst(c.x, c.y + c.size * 0.3, c.z, 1, this.vein, { glow: true, up: 1.5, speed: 0.6, size: 2, life: 0.8, grav: -0.5 });
        if (c.fx.dissolve.value >= 1) {
          this.digesting.splice(i, 1);
          this.fx.burst(c.x, c.y + c.size * 0.4, c.z, 18, this.vein, { glow: true, up: 2.5, speed: 1.5, size: 3, life: 1.2, grav: -0.5 });
          const sp = c.sp;
          w.remove(c);
          if (this.harvest) this.harvest(c, sp);
        }
      }
    }
  }

  // ================================================================== main update
  update(dt: number) {
    const w = this.w;
    for (const k in this.cooldowns) (this.cooldowns as any)[k] = Math.max(0, (this.cooldowns as any)[k] - dt);
    const coreAlive = !!this.core && !this.core.dead;
    if (!this.lost) {
      if (this.isVeyr) {
        const regen = 1.1 + (this.has('coil') ? 0.4 : 0) + (this.has('reactor') ? 1.2 : 0) + (this.emLevel - 1) * 0.15;
        this.res.charge = Math.min(this.chargeCap, this.res.charge + regen * dt);
        for (const r of RES) this.rate[r] *= Math.exp(-dt / 6);
        this.homeCare(dt);
      } else {
        const coreBio = coreAlive ? 0.55 + this.emLevel * 0.25 : 0;
        this.res.bio += coreBio * dt;
        this.income.bio = this.income.bio * 0.98 + coreBio * 0.02;
        this.res.charge = Math.min(this.chargeCap, this.res.charge + (1.1 + this.emLevel * 0.5) * dt);
        if (this.res.bio > 900) this.res.bio -= (this.res.bio - 900) * Math.min(1, dt * 0.35);
      }
    }
    if (this.fieldDirty) this.rebuildField();
    this.animateFlora(dt);
    this.tick += dt;
    if (this.tick >= 0.25) { this.territoryTick(this.tick); this.tick = 0; }
    this.digest(dt);
    this.updateBuildings(dt);
    this.updateAllies(dt);
    if (this.isVeyr && !this.lost) {
      if (this.has('grove') && this.graftList.length) { this.groveT -= dt; if (this.groveT <= 0) { this.groveT = 3.2; this.spread(1, true); } }
      this.pickups?.update(dt, this.golem(), this.has('magnet') ? 6.5 : 2.6);
    }
    void w;
  }
  /** home base: near the crashed core the fallback hull is patched (the golem's own hull is the player's) */
  private homeCare(dt: number) {
    const c = this.core, g = this.golem(); if (!c || !g) return;
    if ((g.x - c.x) ** 2 + (g.z - c.z) ** 2 < 6 * 6) this.hull = Math.min(this.hullMax, this.hull + dt * 8);
    this.hull = Math.min(this.hull, this.hullMax);
  }
  /** grafts sheathe in, sown plants grow, absorbed plants dissolve */
  private animateFlora(dt: number) {
    const fl = this.w.flora;
    let young = false;
    for (const g of this.graftList) {
      g.t += dt;
      if (g.t < 52) young = true;
      if (g.k < 1) { g.k = Math.min(1, g.k + dt / 1.6); fl.setGraft(g.i, g.k, this.gfac); }
      if (g.grow < 1) { g.grow = Math.min(1, g.grow + dt / 3.2); fl.setGrow(g.i, ease(g.grow)); }
    }
    this.claimT -= dt;
    if (young && this.claimT <= 0) { this.claimT = 1; this.claimDirty = true; }
    const gp = this.golem();
    for (let k = this.dissolving.length - 1; k >= 0; k--) {
      const d = this.dissolving[k];
      d.t += dt;
      const p = Math.min(1, d.t / 1.4), y = this.w.surfaceY(fl.x[d.i], fl.z[d.i]);
      fl.setDissolve(d.i, p);
      if (gp && Math.random() < dt * 14) this.fx.mote(fl.x[d.i] + (Math.random() - 0.5) * 0.6, y + Math.random() * 1.2, fl.z[d.i] + (Math.random() - 0.5) * 0.6, gp.x, gp.y + 0.55, gp.z, this.vein, 4.5);
      if (p >= 1) {
        this.dissolving.splice(k, 1);
        fl.remove(d.i);
        if (this.isVeyr) this.gather('carbon', d.carbon, fl.x[d.i], y + 0.5, fl.z[d.i]);
      }
    }
  }
  /** allies: keep their mark, and drift outward over unclaimed ground so they claim it as they roam */
  private updateAllies(dt: number) {
    const t = this.w.time;
    for (const c of this.allies) {
      if (c.dead || c.faction !== this.faction) { this.allies.delete(c); continue; }
      if ((c as any).__print) { c.fx.dissolve.value = Math.max(0, c.fx.dissolve.value - dt * 0.8); if (c.fx.dissolve.value <= 0) (c as any).__print = 0; }
      if (!(c as any).__mk && Math.random() < dt * 2) this.recolor(c);
      if (c.fx.flash.value < 0.24) { c.fx.flashCol.value.setHex(this.vein); c.fx.flash.value = 0.1 + 0.07 * Math.sin(t * 2.2 + c.id); }
      if (c.order || (c.mind !== 'idle' && c.mind !== 'wander')) continue;
      if (Math.random() > dt / 14) continue;
      // a new home a few metres out, preferring ground nobody holds, within reach of the core or the golem
      const g = this.golem(), core = this.core;
      let best: [number, number] | null = null, bs = -1e9;
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * Math.PI * 2, d = 5 + Math.random() * 5;
        const x = clamp(c.homeX + Math.cos(a) * d, 3, this.w.region.N - 3), z = clamp(c.homeZ + Math.sin(a) * d, 3, this.w.region.N - 3);
        if (this.w.region.isWater(x, z) && !c.st.swim) continue;
        const dc = core ? Math.hypot(x - core.x, z - core.z) : 0, dg = g ? Math.hypot(x - g.x, z - g.z) : 1e9;
        if (dc > 46 && dg > 22) continue;
        const s = (this.covAt(x, z) < 0.5 ? 2 : 0) - (this.enemyCov[Math.floor(z) * this.w.region.N + Math.floor(x)] > 0.5 ? 3 : 0) + Math.random();
        if (s > bs) { bs = s; best = [x, z]; }
      }
      if (best) { c.homeX = best[0]; c.homeZ = best[1]; c.mind = 'wander'; c.goalX = best[0]; c.goalZ = best[1]; c.path = null; }
    }
  }

  // ------------------------------------------------------------------ rival field (structure reach)
  fieldRadius(b: Building) { return b.def.kind === 'core' ? 13 + this.emLevel * 3.5 : b.def.kind === 'spire' ? 10 + this.emLevel * 1.5 : 0; }
  private rebuildField() {
    const N = this.w.region.N, f = this.field;
    f.fill(0);
    for (const b of this.buildings) {
      if (!b.done) continue;
      const R = this.fieldRadius(b); if (!R) continue;
      const x0 = Math.max(0, Math.floor(b.x - R)), x1 = Math.min(N - 1, Math.ceil(b.x + R)), z0 = Math.max(0, Math.floor(b.z - R)), z1 = Math.min(N - 1, Math.ceil(b.z + R));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - b.x, z + 0.5 - b.z) / R;
        if (d < 1) { const i = z * N + x; f[i] = Math.max(f[i], 1 - d * d * 0.65); }
      }
    }
    this.fieldDirty = false;
  }

  // ================================================================== structures
  /** why a structure cannot be raised at all right now (skill, cost); null if it can */
  whyBuild(kind: BKind): string | null {
    const def = BDEFS[kind];
    if (this.isVeyr) {
      if (def.skill && !this.has(def.skill)) return `Needs ${SKILL[def.skill]?.name ?? def.skill}`;
      return this.lack(def.cost ?? {});
    }
    if (def.em > this.emLevel) return `Needs field level ${def.em}`;
    if (this.res.bio < def.bio) return 'Not enough biomass';
    if (this.res.min < def.min) return 'Not enough minerals';
    return null;
  }
  canPlace(kind: BKind, x: number, z: number): string | null {
    const def = BDEFS[kind], R = this.w.region;
    const why = this.whyBuild(kind); if (why) return why;
    if (x < 2 || z < 2 || x > R.N - 2 || z > R.N - 2) return 'Out of bounds';
    if (this.isVeyr) { if (this.covAt(x, z) < 0.5) return 'Must stand on your own ground'; }
    else { if (this.covAt(x, z) < 0.6) return 'Must grow on its own ground'; if (!this.inField(x, z)) return 'Outside the field'; }
    if (R.isSolid(x, z) || R.isWater(x, z)) return 'No footing here';
    const h = R.heightAt(x, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(R.heightAt(x + dx * def.radius * 0.8, z + dz * def.radius * 0.8) - h) > 0.6) return 'Ground too uneven';
    for (const b of this.allBuildings()) if (Math.hypot(b.x - x, b.z - z) < b.def.radius + def.radius + 0.4) return 'Too close to another structure';
    if (def.onDeposit && this.depositAt(x, z) < 0) return 'Must sit on a ferrite or crystal seam';
    return null;
  }
  allBuildings(): Building[] { return this.w.hives.flatMap((h) => h.buildings); }
  depositAt(x: number, z: number) { return this.w.region.deposits.findIndex((d) => Math.hypot(d.x - x, d.z - z) < d.r + 1.2 && d.amount > 0); }

  place(kind: BKind, x: number, z: number): Building | null {
    if (this.canPlace(kind, x, z)) return null;
    const def = BDEFS[kind];
    if (this.isVeyr) this.pay(def.cost ?? {}); else { this.res.bio -= def.bio; this.res.min -= def.min; }
    const b = new Building(def, this.faction, x, z, this.w.region.heightAt(x, z), this.faction === 'rival' ? RIVALS[this.rivalKey].core : undefined);
    if (kind === 'tap') b.deposit = this.depositAt(x, z);
    this.buildings.push(b);
    this.w.scene.add(b.mesh);
    this.fx.burst(x, b.y + 0.2, z, 14, this.vein, { up: 2, speed: 2, size: 4, life: 0.9 });
    return b;
  }

  private updateBuildings(dt: number) {
    const w = this.w;
    let supply = 0;
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      b.sync(dt, w.time);
      if (b.hp <= 0 && !b.dead) { this.destroy(b); continue; }
      if (!b.done) {
        b.progress = Math.min(1, b.progress + dt / b.def.time);
        b.hp = Math.min(b.maxHp, b.hp + (b.def.hp / b.def.time) * dt * 0.9);
        if (b.progress >= 1) { b.done = true; b.hp = Math.max(b.hp, b.maxHp * 0.95); this.fieldDirty = true; this.claimDirty = true; this.onEvent?.('built', b); this.fx.burst(b.x, b.y + 1, b.z, 26, this.vein, { glow: true, up: 3, speed: 2.5, size: 3, life: 1 }); }
        continue;
      }
      supply += b.def.supply;
      if (b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + dt * 2);
      b.cool -= dt;
      switch (b.def.kind) {
        case 'tap': {
          const d = w.region.deposits[b.deposit];
          if (d && d.amount > 0) {
            const r = (d.kind === 'crystal' ? 0.5 : 0.35) * dt;
            if (this.isVeyr) { const got = this.credit('ore', r * (d.kind === 'crystal' ? 1.5 : 1), b.x, b.y + 2, b.z); d.amount -= got; }
            else { d.amount -= r * 3; this.res.min += r * 3; this.income.min = this.income.min * 0.98 + (r * 3) / dt * 0.02; }
          }
          break;
        }
        case 'brood': this.produce(b, dt); break;
        case 'maw': {
          if (b.cool <= 0) {
            b.cool = 0.5;
            w.near(b.x, b.z, 9, (c) => {
              if (!c.dead || c.digest > 0 || c.bio <= 0.3) return;
              const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz);
              if (d > b.def.radius + 0.5) { c.x += (dx / d) * Math.min(d, 1.4); c.z += (dz / d) * Math.min(d, 1.4); c.y = w.surfaceY(c.x, c.z); }
              else if (this.isVeyr) {
                // rendered down: the carcass becomes carbon in the hold
                const take = Math.min(c.bio, 2.5);
                c.bio -= take; c.fx.decay.value = Math.min(1, c.fx.decay.value + 0.08);
                this.credit('carbon', take * 0.6, c.x, c.y + 0.4, c.z);
                if (c.bio <= 0.3) { c.fx.dissolve.value = 1; c.bio = 0; }
              } else this.tryDigest(c, 2);
            });
          }
          break;
        }
        case 'thorn': case 'coil': {
          if (b.cool > 0) break;
          const range = b.def.kind === 'coil' ? 12 : 9;
          let tgt: Creature | null = null, bd = range * range;
          w.near(b.x, b.z, range, (c) => {
            if (c.dead || c.faction === this.faction || !c.visibleNow && this.faction === 'veyr') return;
            if (c.faction === 'wild' && c.target === 0 && c.mind !== 'attack' && c.mind !== 'hunt') return;
            const d = (c.x - b.x) ** 2 + (c.z - b.z) ** 2;
            if (d < bd) { bd = d; tgt = c; }
          });
          if (!tgt) break;
          const t = tgt as Creature;
          if (b.def.kind === 'coil') {
            if (this.res.charge < 6) break;
            this.res.charge -= 6; b.cool = 1.6;
            this.fx.arc(new THREE.Vector3(b.x, b.y + 3.7, b.z), new THREE.Vector3(t.x, t.y + t.size * 0.4, t.z), 0.25, VEYR.em);
            w.damage(t, 14, null);
          } else {
            b.cool = 0.9;
            this.fx.burst(b.x, b.y + 1.3, b.z, 3, 0xe8e0c8, { speed: 1, up: 1, size: 2, life: 0.3 });
            this.spine(b, t);
          }
          break;
        }
        case 'lure': {
          if (b.cool > 0) break;
          b.cool = 3;
          w.near(b.x, b.z, 26, (c) => {
            if (c.dead || c.faction !== 'wild' || c.diet === 'carn' || c.mind === 'flee') return;
            if (Math.random() < 0.35) { c.mind = 'wander'; c.goalX = b.x + (Math.random() - 0.5) * 3; c.goalZ = b.z + (Math.random() - 0.5) * 3; c.path = null; }
          });
          break;
        }
      }
    }
    this.supplyCap = this.isVeyr ? this.allyCap() : supply;
  }

  private spine(b: Building, t: Creature) {
    const from = new THREE.Vector3(b.x, b.y + 1.3, b.z), to = new THREE.Vector3(t.x, t.y + t.size * 0.4, t.z);
    const steps = 6;
    for (let k = 0; k < steps; k++) { const p = from.clone().lerp(to, k / steps); this.fx.glow.emit(p.x, p.y, p.z, 0, 0, 0, new THREE.Color(0xfff0d0), 0.9, 2.5, 0.12 + k * 0.03); }
    this.w.damage(t, 7, null);
  }

  /** brood: gestate the queue */
  private produce(b: Building, dt: number) {
    if (!b.queue.length) return;
    const sp = this.w.reg.get(b.queue[0]);
    if (this.supplyUsed >= this.supplyCap) return;
    b.qT += dt;
    if (Math.random() < dt * 2) this.fx.burst(b.x, b.y + 1.8, b.z, 1, this.vein, { glow: true, up: 0.6, speed: 0.4, size: 2.5, life: 1 });
    if (b.qT >= sp.pheno.buildTime) {
      b.qT = 0; b.queue.shift();
      const a = Math.random() * Math.PI * 2;
      const c = this.w.spawn(sp, this.faction, b.x + Math.cos(a) * (b.def.radius + 0.8), b.z + Math.sin(a) * (b.def.radius + 0.8), false);
      if (c) {
        c.energy = 0.9;
        const rp = b.rally;
        if (rp) { c.order = { kind: 'move', x: rp[0], z: rp[1] }; c.homeX = rp[0]; c.homeZ = rp[1]; } else { c.homeX = c.x; c.homeZ = c.z; }
        this.fx.burst(c.x, c.y + 0.4, c.z, 16, this.vein, { glow: true, up: 2, speed: 2, size: 3, life: 0.8 });
        this.onEvent?.('birth', c);
      }
    }
  }
  queueCost(sp: Species) { return { bio: sp.pheno.cost, min: Math.round(sp.pheno.stats.armor * 60) }; }
  enqueue(b: Building, sp: Species): string | null {
    const c = this.queueCost(sp);
    if (this.res.bio < c.bio) return 'Not enough biomass';
    if (this.res.min < c.min) return 'Not enough minerals';
    if (b.queue.length >= 5) return 'Queue full';
    this.res.bio -= c.bio; this.res.min -= c.min;
    b.queue.push(sp.id);
    return null;
  }

  destroy(b: Building) {
    b.dead = true;
    this.fx.burst(b.x, b.y + 1, b.z, 30, 0x6a4a3a, { up: 4, speed: 3, size: 5, life: 1.2 });
    this.fx.burst(b.x, b.y + 1, b.z, 20, this.vein, { glow: true, up: 3, speed: 2, size: 3, life: 1 });
    const i = this.buildings.indexOf(b); if (i >= 0) this.buildings.splice(i, 1);
    b.dispose();
    this.fieldDirty = true; this.claimDirty = true;
    if (b === this.core) {
      this.lost = true; this.core = null;
      // its grafts wither back to plain plants; its ground fades
      for (const g of [...this.graftList]) this.ungraft(g.i);
    }
  }

  countUnits() { let n = 0; for (const c of this.w.creatures) if (!c.dead && c.faction === this.faction) n++; this.supplyUsed = n; return n; }

  // ------------------------------------------------------------------ abilities
  can(a: Ability): string | null {
    const d = ABILITIES[a];
    if (d.em > 50) return 'Retired';
    if (d.em > this.emLevel) return `Needs field level ${d.em}`;
    if ((this.cooldowns[a] ?? 0) > 0) return 'Recharging';
    if (this.res.charge < d.charge) return 'Not enough charge';
    return null;
  }
  spend(a: Ability) { const d = ABILITIES[a]; this.res.charge -= d.charge; this.cooldowns[a] = d.cd; }

  /** @deprecated the moss is gone: nothing can be snared from it */
  snareable(_c: Creature) { return false; }
  /** nearest held ground to a point */
  nearestGrowth(x: number, z: number, maxR = 6): [number, number] | null {
    const N = this.w.region.N;
    let best: [number, number] | null = null, bd = 1e9;
    for (let dz = -maxR; dz <= maxR; dz++) for (let dx = -maxR; dx <= maxR; dx++) {
      const X = Math.floor(x) + dx, Z = Math.floor(z) + dz;
      if (X < 0 || Z < 0 || X >= N || Z >= N || this.cov[Z * N + X] < 0.6) continue;
      const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = [X + 0.5, Z + 0.5]; }
    }
    return best;
  }
}
