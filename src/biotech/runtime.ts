// The production engine in the field. Every Veyr creature that carries functional genes is a worker on this roster;
// it is given a job (by the work-order panel, a right-click, or AUTO), walks to the place, does the work on a cycle
// with the matching animation and hand-drawn effects (paws throwing soil, a gizzard chewing rock, spinnerets
// drawing silk), and sends what it makes home: into the factory stores (game.factory.put) or the golem's hold, or
// onto a pile at the site when it works far from the base, for a hauler to carry. It eats (fruit, protein or carbon
// from the stores) and drinks; hungry workers slow down and go off to graze. Engineered plants (resin trees,
// metal-root fields, algae ponds, orchards, nitrogen fixers, desert greeners) yield on their own cycle, springs
// keep running, and the ledger reports every producer's output per minute.
//
// API (game.biotech): assign(c, job, x?, z?, x2?, z2?) · order(c, { k, x, z, target }) (CONTRACT.md order shape)
// · units() (troop adapters with the RobotUnit shape) · profile(c) · rates() · producers() · engineerPlant(i, gene)
// · sowEngineered(prefab, gene, x, z) · habitatAt(x, z) · fieldAt(x, z)
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Creature } from '../game/creature';
import type { Species } from '../game/species';
import { BIO, BIO_GENES, isBio, type FnKind } from '../life/genesBio';
import { GENE } from '../life/genes';
import { profileOf, fnsForJob, JOB_NAME, itemName, type Job, type Profile, type FnLine } from './functions';
import { vfx2d, type VfxName } from '../game/vfx2d';
import type { RampName } from '../art/palette';
import { B } from '../world/blockTex';
import { clamp } from '../core/rand';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';

/** an order in the robot-unit shape (CONTRACT.md) */
export interface UOrder { k: 'move' | 'attack' | 'guard' | 'patrol' | 'work'; x?: number; z?: number; target?: any }
/** anything the factions or robots field: creature or unit */
export interface Hostile { x: number; z: number; faction: string; dead: boolean; hp?: number; damage?(n: number, from?: any): void; radius?: number }

export interface Worker {
  c: Creature; prof: Profile; job: Job; fn: FnLine | null;
  site: { x: number; z: number } | null; site2: { x: number; z: number } | null;
  state: 'go' | 'work' | 'eat' | 'live' | 'sniff' | 'toSrc' | 'toDst' | 'done';
  /** work point (rock, sand cell, carcass, channel point) */
  tgt: { x: number; z: number; i?: number; ref?: any } | null;
  acc: number; vol: number; shapeAcc: number; shapeT: number;
  strikeT: number; t: number; seek: number;
  /** channel progress 0..1, pit base height and goal */
  k: number; base: number; goal: number;
  fed: number; mealT: number; grazeT: number;
  pile: number; pileItem: string; carry: { item: string; n: number } | null; from: Worker | null;
  note: string; alarmT: number;
  patrol: [number, number, number, number] | null; leg: number;
  hab: any; out: { t: number; n: number; item: string }[];
  kills: number; prey: number;
}
export interface BioPlant { i: number; gene: string; x: number; z: number; t: number; pollen: number; guard: number; out: { t: number; n: number; item: string }[]; spread: number }
export interface Spring { x: number; z: number; rate: number; t: number; out: { t: number; n: number; item: string }[] }

const CYC = 6;
/** farther than this from the core and every depot, output piles up at the site for a hauler */
export const DROP_R = 34;
const PILE_CAP = 24;
const PLANT_COL: Record<string, number> = { resin_bark: 0xa47b42, metal_root: 0x6f7373, algae_bloom: 0x606b34, fruit_set: 0xa6705f, nitro_nodules: 0x91666a, desert_greener: 0x7c8c76 };
const LOOK_RAMP: Partial<Record<FnKind, RampName>> = { dig: 'soil', tunnel: 'clay', mound: 'clay', spring: 'water', ore: 'stone', silica: 'sand', silk: 'paper', oil: 'ochre', crystal: 'glowTeal', milk: 'bone', fleece: 'straw', wetland: 'water', binder: 'moss', pollinate: 'straw', decompose: 'soil', pest: 'blood' };

let NEXT_SRC = 0;
export class Biotech {
  readonly g: Game;
  workers = new Map<number, Worker>();
  plants: BioPlant[] = [];
  springs: Spring[] = [];
  seedlings: { i: number; k: number }[] = [];
  /** fallback stores when no factory is running */
  store: Record<string, number> = {};
  /** every unit of output in the last minute, by item */
  private log: { t: number; n: number; item: string }[] = [];
  private eaten: { t: number; food: number; water: number }[] = [];
  private food = 0; private water = 0;
  private profs = new Map<number, Profile>();
  private syncT = 0; private seedN = -1; private t = 0;
  /** structures (force fields, habitats, vats, reactors): set by structures.ts */
  habitats: () => { x: number; z: number; R: number; cap: number; pop: number; climate: string; b: any }[] = () => [];
  fieldAt: (x: number, z: number) => boolean = () => false;
  onChange?: () => void;

  constructor(game: Game) {
    this.g = game;
    (game as any).biotech = this;
    game.update$.push((dt) => { try { this.update(dt); } catch (e) { if (this.errs++ < 5) console.error('biotech', e); } });
    this.patchWorld();
    // plant genes come from saving plant prefabs; the Gene-Lock comes from research as well
    game.on('prefab', (d: { kind?: string; name?: string }) => { if (d?.kind === 'plant' && d.name) this.plantGenes(d.name); });
    game.on('skill', (d: { id?: string }) => { for (const g of BIO_GENES) if (g.bio.skill && g.bio.skill === d?.id && !this.run.has(g.id)) { this.run.add(g.id, 'research', this.w.time); toast(`Sequenced by research: <b>${g.name}</b>`, 'good', 3600); } });
  }
  private errs = 0;
  get w() { return this.g.world; }
  get run() { return this.g.run; }
  get hive() { return this.g.veyr; }
  get factory(): any { return (this.g as any).factory ?? null; }
  get eco(): any { return (this.g as any).eco ?? (this.w as any).eco ?? null; }

  // ============================================================================================ profiles
  profileOfSp(sp: Species): Profile {
    let p = this.profs.get(sp.id);
    if (!p) { p = profileOf(sp.design, (id) => this.run.genes.get(id)?.level ?? 1, sp.pheno); this.profs.set(sp.id, p); }
    return p;
  }
  profile(c: Creature) { return this.profileOfSp(c.sp); }
  /** gene levels change when a gene is absorbed again: recompute */
  invalidate() { this.profs.clear(); for (const w of this.workers.values()) { w.prof = this.profileOfSp(w.c.sp); w.fn = this.pickFn(w); } }
  isEngineered(sp: Species) { return sp.design.genes.some((g) => isBio(g) && !BIO[g].plant); }

  // ============================================================================================ roster
  private sync() {
    const seen = new Set<number>();
    for (const c of this.w.creatures) {
      if (c.dead || c.faction !== 'veyr') continue;
      if (!this.workers.has(c.id) && !this.isEngineered(c.sp)) continue;
      seen.add(c.id);
      if (!this.workers.has(c.id)) this.enlist(c);
    }
    for (const [id, w] of this.workers) if (!seen.has(id)) { this.workers.delete(id); this.dropPile(w); }
    // genomes of new wild species carry their functional genes (absorbing them sequences these)
    if (this.run.reg.list.length !== this.seedN) { this.seedN = this.run.reg.list.length; this.seedGenomes(); }
  }
  private enlist(c: Creature): Worker {
    const prof = this.profile(c);
    const w: Worker = {
      c, prof, job: 'idle', fn: null, site: null, site2: null, state: 'go', tgt: null, acc: 0, vol: 0, shapeAcc: 0, shapeT: 0, strikeT: 0, t: Math.random() * CYC, seek: 0,
      k: 0, base: 0, goal: 0, fed: 1, mealT: 5 + Math.random() * 20, grazeT: 0, pile: 0, pileItem: '', carry: null, from: null, note: 'ROAMING', alarmT: 0, patrol: null, leg: 0, hab: null, out: [], kills: 0, prey: 0,
    };
    this.workers.set(c.id, w);
    // producers start working where they stand; diggers wait for orders
    if (prof.main === 'produce' || prof.main === 'eco' || prof.main === 'farm') this.assign(c, 'auto', c.x, c.z);
    return w;
  }
  worker(c: Creature) { return this.workers.get(c.id) ?? (c.faction === 'veyr' && !c.dead ? this.enlist(c) : null); }

  /** give a creature a job (x, z: the site; x2, z2: a channel's far end). Returns why not, or null */
  assign(c: Creature, job: Job, x?: number, z?: number, x2?: number, z2?: number): string | null {
    if (c.dead || c.faction !== 'veyr') return 'Not one of yours';
    const w = this.workers.get(c.id) ?? this.enlist(c);
    if (!w.prof.jobs.includes(job)) return `${c.sp.name} has no organ for ${JOB_NAME[job].toLowerCase()}`;
    if (job === 'habitat' && !this.habitatFor(c)) return 'No engineered habitat with room';
    // the factory's harness jobs and these do not mix: take it off theirs
    if (job !== 'idle' && (c as any).__job === 1) this.factory?.workers?.release?.(c);
    this.dropPile(w);
    w.job = job; w.state = 'go'; w.tgt = null; w.acc = 0; w.vol = 0; w.k = 0; w.base = 0; w.goal = 0; w.carry = null; w.from = null; w.patrol = null; w.hab = null; w.prey = 0;
    w.site = x !== undefined && z !== undefined ? { x, z } : { x: c.x, z: c.z };
    w.site2 = x2 !== undefined && z2 !== undefined ? { x: x2, z: z2 } : null;
    w.fn = this.pickFn(w);
    (c as any).__bjob = job === 'idle' ? 0 : 1;
    c.order = null; c.path = null; c.target = 0; if (c.mind !== 'attack') c.mind = 'idle';
    if (job === 'idle') { w.note = 'ROAMING'; c.homeX = c.x; c.homeZ = c.z; }
    else if (job === 'operate') this.startOperate(w);
    else if (job === 'troop') { w.note = 'AWAITING ORDERS'; if (x !== undefined) this.order(c, { k: 'move', x, z }); }
    this.onChange?.();
    return null;
  }
  private pickFn(w: Worker): FnLine | null {
    const job = w.job === 'auto' ? w.prof.main : w.job;
    const list = fnsForJob(w.prof, job);
    if (job === 'produce' && w.site) {
      // a gizzard on a seam, a crop on sand: pick the organ that suits the place
      const R = this.w.region, onSand = R.b[Math.floor(w.site.z) * R.N + Math.floor(w.site.x)] === B.SAND;
      const rock = this.findRock(w.site.x, w.site.z, 6);
      const best = list.find((f) => (f.fn.kind === 'ore' && rock) || (f.fn.kind === 'silica' && onSand));
      if (best) return best;
    }
    return list[0] ?? null;
  }
  /** robot-unit orders for troops (and 'work' for anyone: the right job for what was clicked) */
  order(c: Creature, o: UOrder) {
    const w = this.workers.get(c.id) ?? this.enlist(c);
    if (o.k === 'work') { this.workAt([c], o.x ?? c.x, o.z ?? c.z); return; }
    if (w.job !== 'troop') this.assign(c, 'troop');
    w.patrol = null;
    const x = o.x ?? c.x, z = o.z ?? c.z;
    if (o.k === 'move') { c.order = { kind: 'move', x, z }; c.path = null; c.mind = 'order'; w.note = 'MOVING'; }
    else if (o.k === 'guard') { c.order = { kind: 'guard', x, z }; c.path = null; w.note = 'GUARDING'; }
    else if (o.k === 'patrol') { w.patrol = [c.x, c.z, x, z]; w.leg = 1; c.order = { kind: 'amove', x, z }; c.path = null; w.note = 'PATROLLING'; }
    else if (o.k === 'attack') {
      const t = o.target;
      if (t && typeof t.id === 'number' && this.w.get(t.id) === t) { c.order = { kind: 'attack', x: t.x, z: t.z, target: t.id }; w.note = 'ATTACKING'; }
      else { c.order = { kind: 'amove', x: t?.x ?? x, z: t?.z ?? z }; w.note = 'ADVANCING'; }
      c.path = null;
    }
  }
  /** the smart right-click: the job that suits the place (rock -> gizzard, sand -> silica, water -> wetland ...) */
  workAt(cs: Creature[], x: number, z: number): string | null {
    const R = this.w.region;
    const i = Math.floor(z) * R.N + Math.floor(x);
    const rock = !!this.findRock(x, z, 3), sand = R.b[i] === B.SAND, water = R.isWater(x, z);
    let corpse = false; this.w.near(x, z, 3, (o) => { if (o.dead && o.bio > 0.5) corpse = true; });
    let n = 0, why: string | null = null;
    cs.forEach((c, k) => {
      const w = this.workers.get(c.id) ?? this.enlist(c);
      const kinds = w.prof.fns.map((f) => f.fn.kind);
      const job: Job = rock && kinds.includes('ore') ? 'produce' : sand && (kinds.includes('silica') || kinds.includes('binder')) ? (kinds.includes('silica') ? 'produce' : 'eco')
        : corpse && kinds.includes('decompose') ? 'eco' : water && kinds.includes('wetland') ? 'eco' : w.prof.main === 'troop' ? 'troop' : w.prof.main;
      const a = (k % 3 - 1) * 1.6, b = (Math.floor(k / 3) % 3 - 1) * 1.6;
      const e = job === 'troop' ? (this.order(c, { k: 'move', x: x + a, z: z + b }), null) : this.assign(c, job === 'channel' ? 'dig' : job, x + (job === 'dig' ? 0 : a), z + (job === 'dig' ? 0 : b));
      if (e) why = e; else n++;
    });
    return n ? null : why ?? 'Nothing to do there';
  }
  /** troop adapters in the robot-unit shape (for squads and the robots agent's command card) */
  units(): BioUnit[] {
    const out: BioUnit[] = [];
    for (const w of this.workers.values()) if (w.job === 'troop' && !w.c.dead) out.push(((w.c as any).__unit ??= new BioUnit(this, w.c)) as BioUnit);
    return out;
  }

  // ============================================================================================ tick
  update(dt: number) {
    if (dt <= 0) return;
    this.t += dt;
    this.syncT -= dt; if (this.syncT <= 0) { this.syncT = 0.5; this.sync(); }
    const now = this.w.time;
    for (const w of this.workers.values()) this.tickWorker(w, dt, now);
    this.tickPlants(dt, now); this.tickSprings(dt, now); this.tickSeedlings(dt);
    // the minute windows
    while (this.log.length && now - this.log[0].t > 60) this.log.shift();
    while (this.eaten.length && now - this.eaten[0].t > 60) this.eaten.shift();
  }
  private tickWorker(w: Worker, dt: number, now: number) {
    const c = w.c;
    if (c.dead) return;
    while (w.out.length && now - w.out[0].t > 60) w.out.shift();
    this.feed(w, dt, now);
    w.strikeT -= dt;
    // the growth gland: young engineered stock matures fast
    if (w.prof.fast && c.growth < 1) c.growth = Math.min(1, c.growth + dt / Math.max(8, c.st.maturity) * 0.8);
    if ((c as any).__job === 1 && w.job !== 'idle' && w.job !== 'operate') { w.job = 'idle'; w.note = 'IN HARNESS'; (c as any).__bjob = 0; return; }
    if (w.job === 'idle') { if ((c as any).__job !== 1) w.note = 'ROAMING'; return; }
    if (this.hive.follow && w.job !== 'troop') { w.note = 'RALLIED TO UNIT 07'; return; }
    if (w.job === 'troop') { this.tickTroop(w, dt); return; }
    if (w.job === 'guard') { this.tickGuard(w, dt, now); return; }
    if (w.job === 'operate') { this.tickOperate(w); return; }
    const fighting = c.mind === 'attack' || c.mind === 'hunt' || c.order?.kind === 'attack';
    if (fighting && w.prey === 0) { w.note = 'FIGHTING'; return; }
    if (w.state === 'eat') { this.tickGraze(w, dt); return; }
    if (w.job === 'habitat') { this.tickHabitat(w, dt); return; }
    if (w.job === 'haul') { this.tickHaul(w, dt); return; }
    const fn = w.fn; if (!fn) { w.note = 'NOTHING TO DO'; return; }
    if (w.pile >= PILE_CAP && fn.fn.item && !this.terraform(fn.fn.kind)) { w.note = 'PILE FULL · NEEDS A HAULER'; this.hold(w); return; }
    switch (fn.fn.kind) {
      case 'dig': case 'tunnel': this.tickDig(w, dt, fn); break;
      case 'mound': this.tickMound(w, dt, fn); break;
      case 'spring': this.tickSpring(w, dt, fn); break;
      case 'ore': case 'silica': this.tickQuarry(w, dt, fn); break;
      case 'silk': case 'oil': case 'crystal': this.tickGland(w, dt, fn); break;
      case 'milk': case 'fleece': this.tickFarm(w, dt, fn); break;
      case 'wetland': case 'binder': this.tickLand(w, dt, fn); break;
      case 'pollinate': this.tickPollinate(w, dt, fn); break;
      case 'pest': this.tickPest(w, dt, fn); break;
      case 'decompose': this.tickRender(w, dt, fn); break;
      default: w.note = 'IDLE';
    }
  }
  private terraform(k: FnKind) { return k === 'dig' || k === 'tunnel' || k === 'mound' || k === 'spring'; }
  /** work speed: fed, in a habitat, operated */
  private mul(w: Worker) {
    const hab = w.job === 'habitat' && w.hab ? 1.5 * this.climateFit(w) : 1;
    return (0.3 + 0.7 * clamp(w.fed, 0, 1)) * hab;
  }
  climateFit(w: Worker): number {
    const cl = w.hab?.climate ?? 'temperate', st = w.c.st;
    if (cl === 'tropical') return st.heat > 0.2 ? 1.25 : st.cold > 0.4 ? 0.8 : 1;
    if (cl === 'arctic') return st.cold > 0.3 ? 1.25 : st.heat > 0.3 ? 0.8 : 1;
    if (cl === 'arid') return st.heat > 0.1 && st.swim <= 0 ? 1.2 : st.swim > 0 ? 0.75 : 1;
    return 1.05;
  }

  // -------------------------------------------------------------------------------------------- movement helpers
  /** walk to (x, z); true once within `near` (then it holds there) */
  private goTo(w: Worker, x: number, z: number, near: number): boolean {
    const c = w.c, d = Math.hypot(x - c.x, z - c.z);
    if (d <= near) { this.hold(w); return true; }
    const o = c.order;
    if (!o || o.kind !== 'move' || Math.abs(o.x - x) > 0.3 || Math.abs(o.z - z) > 0.3) { c.order = { kind: 'move', x, z }; c.path = null; c.mind = 'order'; }
    return false;
  }
  private hold(w: Worker) { const c = w.c, o = c.order; if (!o || o.kind !== 'hold') c.order = { kind: 'hold', x: c.x, z: c.z }; }
  /** a work stroke: face the work, play the strike, throw the effect */
  private stroke(w: Worker, x: number, z: number, period: number, dt: number, fx?: () => void) {
    const c = w.c;
    c.face(x, z, dt);
    if (w.strikeT <= 0 && c.atkAnim < 0) { c.atkAnim = 0; c.target = 0; w.strikeT = period * (0.85 + Math.random() * 0.3); if (c.mesh.visible) fx?.(); }
  }
  private y(x: number, z: number) { return this.w.surfaceY(x, z); }

  // -------------------------------------------------------------------------------------------- dig & terraform
  private nearStructure(x: number, z: number, r: number) {
    for (const b of this.hive.allBuildings()) if (Math.hypot(b.x - x, b.z - z) < r + b.def.radius) return true;
    for (const b of this.factory?.buildings ?? []) if (Math.hypot(b.x - x, b.z - z) < r + Math.max(b.fw ?? 1, b.fd ?? 1) * 0.6) return true;
    return false;
  }
  private digPoint(w: Worker): { x: number; z: number } | null {
    const s = w.site!; if (!w.site2) return s;
    const L = Math.hypot(w.site2.x - s.x, w.site2.z - s.z);
    if (w.k > 1 + 1e-3) return null;
    return { x: s.x + (w.site2.x - s.x) * Math.min(1, w.k), z: s.z + (w.site2.z - s.z) * Math.min(1, w.k) };
    void L;
  }
  private tickDig(w: Worker, dt: number, fn: FnLine) {
    const R = this.w.region, c = w.c;
    const p = this.digPoint(w);
    if (!p) { w.note = 'CHANNEL DUG'; this.finish(w, 'Channel dug'); return; }
    const chan = !!w.site2, rad = chan ? (fn.fn.kind === 'tunnel' ? 0.8 : 1.1) : (fn.fn.kind === 'tunnel' ? 1.1 : 1.6);
    if (!w.base) {
      if (this.nearStructure(p.x, p.z, rad + 0.8)) { this.nextPoint(w, chan, 'STRUCTURE IN THE WAY'); return; }
      w.base = R.heightAt(p.x, p.z);
      // a channel runs a metre or so deep, down past the water line where the water is close enough to let in
      w.goal = chan ? Math.max(w.base - 1.6, Math.min(w.base - 0.9, R.water - 0.4)) : Math.max(0.8, w.base - (fn.fn.kind === 'tunnel' ? 2.8 : 2.2));
      if (w.goal < 0.8) w.goal = 0.8;
    }
    // stand at the rim, on the side it came from
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) || 1;
    const sx = p.x + (dx / d) * (rad + c.radius * 0.8 + 0.2), sz = p.z + (dz / d) * (rad + c.radius * 0.8 + 0.2);
    if (w.state !== 'work') { if (!this.goTo(w, sx, sz, 0.9 + c.radius)) { w.note = chan ? 'TO THE CHANNEL' : 'TO THE DIG'; return; } w.state = 'work'; }
    const k = this.mul(w);
    const vol = (fn.rate / 60) * dt * k;
    w.vol += vol; w.shapeAcc += vol;
    const depth = clamp((w.base - R.heightAt(p.x, p.z)) / Math.max(0.1, w.base - w.goal), 0, 1);
    const L = chan ? Math.max(0.5, Math.hypot(w.site2!.x - w.site!.x, w.site2!.z - w.site!.z)) : 1;
    w.note = chan ? `DIGGING CHANNEL ${Math.round(clamp(w.k + depth * 1.2 / L, 0, 1) * 100)}%` : `DIGGING · ${Math.round(clamp((w.base - R.heightAt(p.x, p.z)) / Math.max(0.1, w.base - w.goal), 0, 1) * 100)}%`;
    this.stroke(w, p.x, p.z, fn.fn.kind === 'tunnel' ? 0.55 : 0.8, dt, () => {
      const y = this.y(p.x, p.z);
      vfx2d.play('dust', p.x + (Math.random() - 0.5) * rad, y + 0.1, p.z + (Math.random() - 0.5) * rad, { ramp: R.isWater(p.x, p.z) ? 'water' : 'soil', scale: 0.7 + c.size * 0.3 });
      vfx2d.drops(p.x, y + 0.15, p.z, 3, { speed: 1.6, up: 2.6, ramp: 'soil', land: 'die', scale: 1.1 });
      if (Math.random() < 0.3) vfx2d.play('crack', p.x, y + 0.02, p.z, { flat: true, ramp: 'soil', scale: 0.8 });
      sfx('squelch', 0.8 + Math.random() * 0.4, 0.12 * this.g.audible(p.x, p.z));
    });
    w.shapeT -= dt;
    if (w.shapeT <= 0 && w.shapeAcc > 0) {
      w.shapeT = 0.35;
      const dh = w.shapeAcc / (0.5 * Math.PI * rad * rad);
      R.shape(p.x, p.z, rad, -dh);
      this.w.terrain.flushDirty(); this.w.flora.reseat(p.x, p.z, rad + 0.5);
      // the soil comes home: a cubic metre is three loads
      this.yieldItem(w, 'soil', w.shapeAcc * 3, p.x, this.y(p.x, p.z), p.z);
      w.shapeAcc = 0;
    }
    if (R.heightAt(p.x, p.z) <= w.goal + 0.05) this.nextPoint(w, chan, chan ? '' : 'PIT DUG');
  }
  private nextPoint(w: Worker, chan: boolean, note: string) {
    if (!chan) { w.note = note || 'PIT DUG'; this.finish(w, note === 'STRUCTURE IN THE WAY' ? 'Too close to a structure to dig' : 'Pit dug'); return; }
    const s = w.site!, e = w.site2!, L = Math.max(0.5, Math.hypot(e.x - s.x, e.z - s.z));
    w.k += 1.2 / L; w.base = 0; w.state = 'go';
    if (w.k > 1 + 1e-3) { w.note = 'CHANNEL DUG'; this.finish(w, 'Channel dug'); }
  }
  /** a finished terraforming job: stand down where it is */
  private finish(w: Worker, msg: string) {
    const c = w.c;
    w.job = 'idle'; (c as any).__bjob = 0; w.state = 'done'; c.order = null; c.homeX = c.x; c.homeZ = c.z;
    if (msg && c.mesh.visible) toast(`${c.sp.name}: ${msg.toLowerCase()}`, 'info', 2200);
    this.onChange?.();
  }
  private tickMound(w: Worker, dt: number, fn: FnLine) {
    const R = this.w.region, c = w.c, p = w.site!, rad = 1.7;
    if (!w.base) {
      if (this.nearStructure(p.x, p.z, rad + 0.8)) { this.finish(w, 'Too close to a structure to build'); return; }
      w.base = R.heightAt(p.x, p.z); w.goal = Math.min(15, w.base + 2.2);
    }
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz) || 1;
    const sx = p.x + (dx / d) * (rad + c.radius + 0.4), sz = p.z + (dz / d) * (rad + c.radius + 0.4);
    if (w.state !== 'work') { if (!this.goTo(w, sx, sz, 0.9 + c.radius)) { w.note = 'TO THE MOUND'; return; } w.state = 'work'; }
    // it cements soil from the hold if there is any, else scrapes its own at half speed
    const run = this.run, haveSoil = run.res.soil >= 1;
    const vol = (fn.rate / 60) * dt * this.mul(w) * (haveSoil ? 1 : 0.5);
    w.shapeAcc += vol; w.acc += vol;
    if (haveSoil && w.acc >= 0.4) { run.res.soil = Math.max(0, run.res.soil - 1); w.acc -= 0.4; }
    w.note = `RAISING · ${Math.round(clamp((R.heightAt(p.x, p.z) - w.base) / (w.goal - w.base), 0, 1) * 100)}%${haveSoil ? '' : ' · SCRAPING SOIL'}`;
    this.stroke(w, p.x, p.z, 0.9, dt, () => {
      const y = this.y(p.x, p.z);
      vfx2d.play('dust', p.x, y + 0.3, p.z, { ramp: 'clay', scale: 0.8 });
      vfx2d.drops(c.x, c.y + c.size * 0.4, c.z, 2, { speed: 0.6, up: 1.4, ramp: 'clay', land: 'die' });
    });
    w.shapeT -= dt;
    if (w.shapeT <= 0 && w.shapeAcc > 0) {
      w.shapeT = 0.35;
      R.shape(p.x, p.z, rad, w.shapeAcc / (0.5 * Math.PI * rad * rad));
      this.w.terrain.flushDirty(); this.w.flora.reseat(p.x, p.z, rad + 0.5);
      this.logOut(w, 'ground', w.shapeAcc);
      w.shapeAcc = 0;
    }
    if (R.heightAt(p.x, p.z) >= w.goal - 0.05) this.finish(w, 'Mound raised');
  }
  private tickSpring(w: Worker, dt: number, fn: FnLine) {
    const R = this.w.region, c = w.c, s = w.site!;
    if (w.state === 'go') { if (!this.goTo(w, s.x, s.z, 1.2 + c.radius)) { w.note = 'TO THE SPRING SITE'; return; } w.state = 'sniff'; w.t = 0; }
    if (w.state === 'sniff') {
      // nose about: the wettest, lowest cell nearby is where the water is
      w.t += dt * this.mul(w); w.note = 'DOWSING';
      w.seek -= dt;
      if (w.seek <= 0) {
        w.seek = 1.6; const a = Math.random() * Math.PI * 2, r = 1 + Math.random() * 2.5;
        c.order = { kind: 'move', x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r }; c.path = null; c.mind = 'order';
        if (c.mesh.visible) vfx2d.play('dust', c.x, c.y + 0.05, c.z, { ramp: 'soil', scale: 0.5 });
      }
      if (w.t > 9) {
        let best = s, bs = 1e9;
        for (let k = 0; k < 24; k++) { const a = k * 2.4, r = (k % 6) * 0.7; const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r; const i = Math.floor(z) * R.N + Math.floor(x); const v = R.heightAt(x, z) - (R.wet[i] ?? 0) * 2; if (v < bs && !R.isSolid(x, z)) { bs = v; best = { x, z }; } }
        w.tgt = best; w.state = 'work'; w.base = R.heightAt(best.x, best.z); w.goal = Math.min(w.base - 0.4, R.water - 0.25);
      }
      return;
    }
    const p = w.tgt!;
    if (!this.goTo(w, p.x + 1.4, p.z, 0.8 + c.radius)) { w.note = 'TO THE SPRING'; return; }
    w.note = 'DIGGING THE SPRING';
    this.stroke(w, p.x, p.z, 0.7, dt, () => { const y = this.y(p.x, p.z); vfx2d.play('dust', p.x, y + 0.1, p.z, { ramp: 'soil', scale: 0.6 }); vfx2d.drops(p.x, y + 0.1, p.z, 2, { ramp: R.heightAt(p.x, p.z) < R.water + 0.4 ? 'water' : 'soil', land: 'die' }); });
    w.shapeT -= dt;
    if (w.shapeT <= 0) { w.shapeT = 0.35; R.shape(p.x, p.z, 1.2, -0.08 * this.mul(w)); this.w.terrain.flushDirty(); this.w.flora.reseat(p.x, p.z, 1.7); }
    if (R.heightAt(p.x, p.z) <= w.goal + 0.05) {
      const sp: Spring = { x: p.x, z: p.z, rate: fn.rate * 4, t: 0, out: [] };
      this.springs.push(sp);
      const y = this.y(p.x, p.z);
      vfx2d.drops(p.x, y + 0.2, p.z, 14, { speed: 1.4, up: 3.6, ramp: 'water', land: 'splash' });
      vfx2d.play('splash', p.x, y + 0.1, p.z, { scale: 1.4 });
      sfx('squelch', 0.6, 0.6 * this.g.audible(p.x, p.z));
      this.irrigate(p.x, p.z, 5, 0.5);
      this.finish(w, 'Spring opened: it keeps running');
    }
  }

  // -------------------------------------------------------------------------------------------- producers
  /** rock to chew near a point: a seam, a boulder or a rock formation */
  findRock(x: number, z: number, r: number): { x: number; z: number; ref?: any; crystal?: boolean } | null {
    const R = this.w.region;
    let best: { x: number; z: number; ref?: any; crystal?: boolean } | null = null, bd = r * r;
    for (const d of R.deposits) { if (d.amount <= 0) continue; const e = (d.x - x) ** 2 + (d.z - z) ** 2 - d.r * d.r; if (e < bd) { bd = e; best = { x: d.x, z: d.z, ref: d, crystal: d.kind === 'crystal' }; } }
    if (best) return best;
    for (const k of R.rocks) { if (k.kind === 'log' || k.kind === 'stump' || k.kind === 'river') continue; const e = (k.x - x) ** 2 + (k.z - z) ** 2; if (e < bd) { bd = e; best = { x: k.x, z: k.z }; } }
    if (best) return best;
    const N = R.N, rr = Math.ceil(r);
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
      const X = Math.floor(x) + dx, Z = Math.floor(z) + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
      const i = Z * N + X; if (R.solid[i] !== 1 && R.b[i] !== B.ROCK && R.b[i] !== B.ORE && R.b[i] !== B.CRYSTAL) continue;
      const e = dx * dx + dz * dz; if (e < bd) { bd = e; best = { x: X + 0.5, z: Z + 0.5, crystal: R.b[i] === B.CRYSTAL }; }
    }
    return best;
  }
  private findCell(x: number, z: number, r: number, ok: (i: number) => boolean): { x: number; z: number; i: number } | null {
    const R = this.w.region, N = R.N, rr = Math.ceil(r);
    let best: { x: number; z: number; i: number } | null = null, bd = r * r;
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
      const X = Math.floor(x) + dx, Z = Math.floor(z) + dz; if (X < 1 || Z < 1 || X >= N - 1 || Z >= N - 1) continue;
      const i = Z * N + X, e = dx * dx + dz * dz; if (e >= bd || !ok(i)) continue;
      bd = e; best = { x: X + 0.5, z: Z + 0.5, i };
    }
    return best;
  }
  /** gizzards on rock, silica crops on sand */
  private tickQuarry(w: Worker, dt: number, fn: FnLine) {
    const R = this.w.region, c = w.c, s = w.site!, ore = fn.fn.kind === 'ore';
    if (!w.tgt || (w.tgt.ref && w.tgt.ref.amount <= 0)) {
      w.seek -= dt; if (w.seek > 0) return; w.seek = 2;
      // on AUTO a gizzard goes looking further afield for rock
      if (ore) { const r = this.findRock(s.x, s.z, 14) ?? (w.job === 'auto' ? this.findRock(s.x, s.z, 40) : null); w.tgt = r ? { x: r.x, z: r.z, ref: r.ref, i: r.crystal ? 1 : 0 } : null; }
      else w.tgt = this.findCell(s.x, s.z, 12, (i) => R.b[i] === B.SAND && R.h[i] >= R.water) ?? this.findCell(s.x, s.z, 6, (i) => (R.b[i] === B.SOIL || R.b[i] === B.DRY || R.b[i] === B.GRAVEL) && R.h[i] >= R.water);
      if (!w.tgt) { w.note = ore ? 'NO ROCK WITHIN 14 M' : 'NO SAND OR SOIL HERE'; this.hold(w); return; }
      w.state = 'go';
    }
    const t = w.tgt, dep = t.ref as { r: number; amount: number } | undefined;
    // stand at the edge of the rock, facing in
    const reach = (dep ? dep.r * 0.8 : ore ? 0.9 : 0.2) + c.radius + 0.5;
    if (w.state !== 'work') {
      const dx = c.x - t.x, dz = c.z - t.z, d = Math.hypot(dx, dz) || 1;
      if (!this.goTo(w, t.x + (dx / d) * reach, t.z + (dz / d) * reach, 0.8 + c.radius * 0.5)) { w.note = ore ? 'TO THE ROCK' : 'TO THE SAND'; return; }
      w.state = 'work';
    }
    const sandK = !ore && R.b[t.i ?? 0] !== B.SAND ? 0.5 : 1;
    const k = this.mul(w) * sandK, made = (fn.rate / 60) * dt * k;
    w.acc += made;
    w.note = ore ? (dep ? 'CHEWING THE SEAM' : 'CHEWING ROCK') : sandK < 1 ? 'SIFTING SOIL · HALF RATE' : 'SWALLOWING SAND';
    this.stroke(w, t.x, t.z, ore ? 0.65 : 0.75, dt, () => {
      const y = this.y(t.x, t.z) + (ore ? 0.25 : 0.05), hx = c.x + (t.x - c.x) * 0.6, hz = c.z + (t.z - c.z) * 0.6;
      if (ore) { vfx2d.play('crack', hx, y, hz, { ramp: 'stone', scale: 0.7 }); vfx2d.play('spark', hx, y + 0.1, hz, { ramp: t.i ? 'glowTeal' : 'glowAmber', scale: 0.5 }); vfx2d.drops(hx, y, hz, 3, { speed: 1.2, up: 2, ramp: 'stone', land: 'die', scale: 0.8 }); sfx('crack', 1.6 + Math.random() * 0.4, 0.1 * this.g.audible(t.x, t.z)); }
      else { vfx2d.play('dust', hx, y + 0.05, hz, { ramp: 'sand', scale: 0.6 }); }
    });
    if (w.acc >= 1) {
      const n = Math.floor(w.acc); w.acc -= n;
      if (dep) dep.amount = Math.max(0, dep.amount - n * 0.8);
      // out the back end (gizzard) or coughed up (crop): a little drawn moment
      const back = { x: c.x - Math.sin(c.yaw) * c.radius, z: c.z - Math.cos(c.yaw) * c.radius };
      if (c.mesh.visible) {
        if (ore) vfx2d.drops(back.x, c.y + c.size * 0.25, back.z, Math.min(5, n + 1), { speed: 0.5, up: 0.6, ramp: 'rust', land: 'die', scale: 1.4 });
        else vfx2d.play('glint', c.x + Math.sin(c.yaw) * c.radius, c.y + c.size * 0.5, c.z + Math.cos(c.yaw) * c.radius, { ramp: 'glowTeal', scale: 0.7 });
      }
      this.yieldItem(w, fn.fn.item!, n, back.x, c.y + 0.3, back.z);
      if (ore && t.i && Math.random() < 0.25) this.yieldItem(w, 'crystal', 1, back.x, c.y + 0.3, back.z);
    }
  }
  /** silk, oil and crystal: made where it stands */
  private tickGland(w: Worker, dt: number, fn: FnLine) {
    const c = w.c, s = w.site!;
    if (w.state !== 'work') { if (!this.goTo(w, s.x, s.z, 1.2 + c.radius)) { w.note = 'TO THE WORK'; return; } w.state = 'work'; }
    w.acc += (fn.rate / 60) * dt * this.mul(w);
    const kind = fn.fn.kind;
    w.note = kind === 'silk' ? 'SPINNING SILK' : kind === 'oil' ? 'RENDERING OIL' : 'GROWING CRYSTAL';
    w.t += dt;
    if (w.t > 1.3 && c.mesh.visible) {
      w.t = 0;
      const rx = c.x - Math.sin(c.yaw) * c.radius * 1.1, rz = c.z - Math.cos(c.yaw) * c.radius * 1.1;
      if (kind === 'silk') vfx2d.play('sparkle', rx, c.y + c.size * 0.3, rz, { ramp: 'paper', scale: 0.6, vel: [(Math.random() - 0.5) * 0.3, 0.25, (Math.random() - 0.5) * 0.3] });
      else if (kind === 'oil') vfx2d.drops(c.x, c.y + c.size * 0.35, c.z, 2, { speed: 0.4, up: 0.4, ramp: 'ochre', land: 'wet', scale: 0.9 });
      else vfx2d.play('glint', c.x + (Math.random() - 0.5) * c.radius, c.y + c.size * 0.7, c.z + (Math.random() - 0.5) * c.radius, { ramp: 'glowTeal', scale: 0.6 });
    }
    if (w.acc >= 1) { const n = Math.floor(w.acc); w.acc -= n; this.yieldItem(w, fn.fn.item!, n, c.x, c.y + 0.4, c.z); }
  }
  /** a herd on pasture: grazes about the site and yields every cycle */
  private tickFarm(w: Worker, dt: number, fn: FnLine) {
    const c = w.c, s = w.site!;
    if (Math.hypot(c.x - s.x, c.z - s.z) > 7) { this.goTo(w, s.x, s.z, 3); w.note = 'TO PASTURE'; return; }
    if (c.order?.kind === 'move' || c.order?.kind === 'hold') c.order = null;
    c.homeX = s.x; c.homeZ = s.z;
    if (c.mind === 'wander' && Math.hypot(c.goalX - s.x, c.goalZ - s.z) > 6) { const a = Math.random() * 6.28, r = Math.random() * 4; c.goalX = s.x + Math.cos(a) * r; c.goalZ = s.z + Math.sin(a) * r; c.path = null; }
    let plants = 0; this.w.flora.near(c.x, c.z, 4, (i) => { if (this.w.flora.bio[i] > 0.2) plants++; });
    const k = this.mul(w) * (plants > 2 ? 1 : 0.6);
    w.acc += (fn.rate / 60) * dt * k;
    w.note = plants > 2 ? 'GRAZING · YIELDING' : 'POOR PASTURE';
    if (Math.hypot(c.vx, c.vz) < 0.1) this.stroke(w, c.x + Math.sin(c.yaw), c.z + Math.cos(c.yaw), 3.5, dt, () => vfx2d.play('leaves', c.x + Math.sin(c.yaw) * c.radius * 1.2, c.y + 0.1, c.z + Math.cos(c.yaw) * c.radius * 1.2, { ramp: 'moss', scale: 0.5 }));
    if (w.acc >= 1) { const n = Math.floor(w.acc); w.acc -= n; this.yieldItem(w, fn.fn.item!, n, c.x, c.y + 0.4, c.z); if (c.mesh.visible) vfx2d.play('sparkle', c.x, c.y + c.size * 0.6, c.z, { ramp: fn.fn.kind === 'milk' ? 'bone' : 'straw', scale: 0.7 }); }
  }

  // -------------------------------------------------------------------------------------------- ecosystem work
  private tickLand(w: Worker, dt: number, fn: FnLine) {
    const R = this.w.region, c = w.c, s = w.site!, wet = fn.fn.kind === 'wetland';
    if (!w.tgt) {
      w.seek -= dt; if (w.seek > 0) return; w.seek = 1.5;
      w.tgt = wet ? this.findCell(s.x, s.z, 4, (i) => R.wet[i] < 0.85 && R.h[i] >= R.water - 0.05 && !R.solid[i])
        : this.findCell(s.x, s.z, 7, (i) => R.b[i] === B.SAND || R.b[i] === B.DRY);
      if (!w.tgt) { w.note = wet ? 'MARSH MADE' : 'NOTHING LEFT TO BIND'; this.hold(w); return; }
      w.state = 'go';
    }
    const t = w.tgt;
    if (w.state !== 'work') { if (!this.goTo(w, t.x + 0.6, t.z, 0.7 + c.radius)) { w.note = wet ? 'TO THE LOW GROUND' : 'TO THE SAND'; return; } w.state = 'work'; }
    w.acc += (fn.rate / 60) * dt * this.mul(w) * (wet ? 2.5 : 1.5);
    w.note = wet ? 'DAMMING · FLOODING' : 'BINDING SAND';
    this.stroke(w, t.x, t.z, 1.1, dt, () => { const y = this.y(t.x, t.z); vfx2d.play(wet ? 'splash' : 'dust', t.x, y + 0.05, t.z, { ramp: wet ? 'water' : 'moss', scale: 0.6 }); });
    if (w.acc >= 1) {
      w.acc -= 1;
      const i = t.i!;
      if (wet) {
        R.wet[i] = Math.min(1, R.wet[i] + 0.35); R.fert[i] = Math.min(1, R.fert[i] + 0.05);
        if (R.h[i] > R.water + 0.12) R.shape(t.x, t.z, 1.3, -0.12); else { R.b[i] = B.MUD; R.dirty.add(i); }
        this.irrigate(t.x, t.z, 2.5, 0.25);
        if (R.wet[i] >= 0.85) { w.tgt = null; this.logOut(w, 'marsh', 1); }
      } else {
        R.b[i] = R.b[i] === B.SAND ? B.SOIL : B.GRASS; R.fert[i] = Math.min(1, R.fert[i] + 0.3); R.dirty.add(i);
        this.fertilise(t.x, t.z, 1.5, 0.2);
        w.tgt = null; this.logOut(w, 'sand', 1);
      }
      this.w.terrain.flushDirty();
    }
  }
  private tickPollinate(w: Worker, dt: number, fn: FnLine) {
    const fl = this.w.flora, c = w.c, s = w.site!;
    if (!w.tgt || w.t > 4) {
      w.t = 0;
      const cand: number[] = []; fl.near(s.x, s.z, 8, (i) => { if (fl.bio[i] > 0.2) cand.push(i); });
      if (!cand.length) { w.note = 'NO FLOWERS HERE'; this.goTo(w, s.x, s.z, 2); return; }
      const i = cand[Math.floor(Math.random() * cand.length)]; w.tgt = { x: fl.x[i], z: fl.z[i], i }; w.state = 'go';
    }
    w.t += dt;
    const t = w.tgt;
    if (!this.goTo(w, t.x, t.z, 0.6 + c.radius)) { w.note = 'FLITTING'; return; }
    w.note = 'POLLINATING';
    w.acc += (fn.rate / 60) * dt * this.mul(w);
    if (Math.random() < dt * 1.5 && c.mesh.visible) vfx2d.play('sparkle', t.x + (Math.random() - 0.5) * 0.6, this.y(t.x, t.z) + 0.6 + Math.random() * 0.5, t.z + (Math.random() - 0.5) * 0.6, { ramp: 'straw', scale: 0.5 });
    if (w.acc >= 1) {
      w.acc -= 1; this.logOut(w, 'plants', 1); w.tgt = null;
      for (const p of this.plants) if ((p.x - s.x) ** 2 + (p.z - s.z) ** 2 < 100) p.pollen = 40;
      // now and then a seedling of the same kind takes nearby
      if (Math.random() < 0.18 && t.i !== undefined) this.seed(fl.sp[t.i], t.x + (Math.random() - 0.5) * 3, t.z + (Math.random() - 0.5) * 3);
    }
  }
  private tickPest(w: Worker, dt: number, fn: FnLine) {
    const c = w.c, s = w.site!;
    const prey = w.prey ? this.w.get(w.prey) : null;
    if (prey && prey.dead) { w.kills++; w.prey = 0; this.logOut(w, 'pests', 1); this.yieldItem(w, 'carbon', 1, prey.x, prey.y, prey.z); }
    if (prey && !prey.dead) { w.note = 'HUNTING PESTS'; if (c.order?.kind !== 'attack') { c.order = { kind: 'attack', x: prey.x, z: prey.z, target: prey.id }; c.path = null; } return; }
    w.seek -= dt;
    if (w.seek <= 0) {
      w.seek = 2.5 / Math.max(0.3, this.mul(w));
      let best: Creature | null = null, bd = 14 * 14;
      this.w.near(s.x, s.z, 14, (o) => { if (o.dead || o.faction !== 'wild' || o.boss || o.mass > Math.max(15, c.mass * 0.6)) return; const d = (o.x - s.x) ** 2 + (o.z - s.z) ** 2; if (d < bd) { bd = d; best = o; } });
      if (best) { w.prey = (best as Creature).id; return; }
    }
    // no pests: patrol the fields
    for (const p of this.plants) if ((p.x - s.x) ** 2 + (p.z - s.z) ** 2 < 200) p.guard = 30;
    w.note = 'PATROLLING THE FIELDS';
    if (!w.tgt || this.goTo(w, w.tgt.x, w.tgt.z, 1)) { const a = Math.random() * 6.28, r = 2 + Math.random() * 5; w.tgt = { x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r }; }
    void fn;
  }
  private tickRender(w: Worker, dt: number, fn: FnLine) {
    const c = w.c, s = w.site!;
    let cp = w.tgt?.ref as Creature | undefined;
    if (!cp || !cp.dead || cp.bio <= 0.3) {
      cp = undefined; w.tgt = null;
      w.seek -= dt; if (w.seek > 0) { w.note = 'SNIFFING FOR CARCASSES'; return; } w.seek = 2;
      let bd = 16 * 16;
      this.w.near(s.x, s.z, 16, (o) => { if (!o.dead || o.bio <= 0.5 || o.digest > 0) return; const d = (o.x - s.x) ** 2 + (o.z - s.z) ** 2; if (d < bd) { bd = d; cp = o; } });
      if (!cp) { w.note = 'NO CARCASSES'; this.goTo(w, s.x, s.z, 2.5); return; }
      w.tgt = { x: cp.x, z: cp.z, ref: cp }; w.state = 'go';
    }
    const body = cp!;
    if (w.state !== 'work') { if (!this.goTo(w, body.x, body.z, body.radius + c.radius + 0.4)) { w.note = 'TO THE CARCASS'; return; } w.state = 'work'; }
    const take = Math.min(body.bio, (fn.rate / 60) * dt * this.mul(w) * 1.5);
    body.bio -= take; body.fx.decay.value = Math.min(1, body.fx.decay.value + take * 0.05);
    w.acc += take * 0.6; w.vol += take * 0.4;
    w.note = 'RENDERING A CARCASS';
    this.stroke(w, body.x, body.z, 0.8, dt, () => vfx2d.drops(body.x, body.y + body.size * 0.3, body.z, 2, { speed: 0.8, up: 1.2, ramp: 'flesh', land: 'die' }));
    if (w.acc >= 1) { const n = Math.floor(w.acc); w.acc -= n; this.yieldItem(w, 'carbon', n, body.x, body.y + 0.3, body.z); }
    if (w.vol >= 1) { w.vol -= 1; this.fertilise(body.x, body.z, 2, 0.3); }
    if (body.bio <= 0.3) { body.bio = 0; body.fx.dissolve.value = 1; w.tgt = null; this.logOut(w, 'carcass', 1); }
  }

  // -------------------------------------------------------------------------------------------- labour and war
  private startOperate(w: Worker) {
    const s = w.site!, f = this.factory;
    let best: any = null, bd = 8 * 8;
    for (const b of f?.buildings ?? []) { if (!b.def?.operable || b.dead) continue; const d = (b.x - s.x) ** 2 + (b.z - s.z) ** 2; if (d < bd) { bd = d; best = b; } }
    w.tgt = best ? { x: best.x, z: best.z, ref: best } : null;
    if (!best) { w.note = 'NO MACHINE THERE'; return; }
    // the factory's own harness system runs operators when it is there; the operator gene makes it worth it
    const why = f?.workers?.assign?.(w.c, 'operate', best);
    if (why === null) { w.note = `OPERATING ${String(best.def.name).toUpperCase()}`; (w.c as any).__bop = 1; }
    else { best.operator = w.c; w.note = `OPERATING ${String(best.def.name).toUpperCase()}`; }
  }
  private tickOperate(w: Worker) {
    const b = w.tgt?.ref; if (!b || b.dead) { w.note = 'MACHINE GONE'; return; }
    if ((w.c as any).__bop) { if ((w.c as any).__job !== 1) { (w.c as any).__bop = 0; w.job = 'idle'; } return; }
    if (this.goTo(w, b.x + (b.fw ?? 2) * 0.5 + w.c.radius, b.z, 1 + w.c.radius)) { b.operator = w.c; this.stroke(w, b.x, b.z, 2.2, 0.016); }
  }
  private tickGuard(w: Worker, dt: number, now: number) {
    const c = w.c, s = w.site!;
    if (!c.order || c.order.kind !== 'guard') { if (c.mind !== 'attack') { c.order = { kind: 'guard', x: s.x, z: s.z }; c.path = null; } }
    w.note = c.mind === 'attack' ? 'DEFENDING THE POST' : 'ON GUARD';
    w.alarmT -= dt;
    if (w.alarmT > 0) return;
    w.alarmT = 1;
    const sight = c.st.sight * (c.sp.design.genes.includes('guard_instinct') ? 1.5 : 1.1);
    const foe = this.hostileNear(s.x, s.z, sight);
    if (!foe) return;
    // the alarm: a cry, the drawn shock ring, and every guard and troop near the post turns to face it
    if (now - ((this as any).lastAlarm ?? -99) > 18) {
      (this as any).lastAlarm = now;
      sfx('call', c.size * 0.8, 0.8 * Math.max(0.3, this.g.audible(s.x, s.z)));
      toast(`ALARM at a guard post: ${(foe as any).sp?.name ?? 'hostiles'} coming in`, 'warn', 2600);
    }
    vfx2d.play('shock', c.x, c.y + c.size * 0.8, c.z, { ramp: 'stampRed', scale: 0.8 });
    for (const o of this.workers.values()) {
      if ((o.job !== 'guard' && o.job !== 'troop') || o.c.dead || Math.hypot(o.c.x - s.x, o.c.z - s.z) > 18) continue;
      this.engage(o, foe);
    }
    w.alarmT = 4;
  }
  private engage(w: Worker, foe: Hostile) {
    const c = w.c;
    const cr = foe as unknown as Creature;
    if (typeof cr.id === 'number' && this.w.get(cr.id) === cr) { c.order = { kind: 'attack', x: foe.x, z: foe.z, target: cr.id }; c.path = null; }
    else { c.order = { kind: 'amove', x: foe.x, z: foe.z }; c.path = null; }
  }
  private tickTroop(w: Worker, dt: number) {
    const c = w.c;
    if (w.patrol && (!c.order || c.order.kind === 'amove')) {
      const [ax, az, bx, bz] = w.patrol, tx = w.leg ? bx : ax, tz = w.leg ? bz : az;
      if (Math.hypot(c.x - tx, c.z - tz) < 1.2 + c.radius) { w.leg ^= 1; c.order = { kind: 'amove', x: w.leg ? bx : ax, z: w.leg ? bz : az }; c.path = null; }
      else if (!c.order) { c.order = { kind: 'amove', x: tx, z: tz }; c.path = null; }
    }
    if (!c.order && c.mind === 'idle' && !w.patrol) w.note = 'AWAITING ORDERS';
    this.fightUnits(w, dt);
  }
  /** creatures fight robots and faction units too: anything hostile in reach that is not a creature gets mauled */
  private fightUnits(w: Worker, dt: number) {
    const c = w.c; w.t -= dt; if (w.t > 0) return;
    const reach = c.st.reach + c.radius + 0.8;
    for (const u of this.units$()) {
      if (u.dead || u.faction === 'veyr') continue;
      const d = Math.hypot(u.x - c.x, u.z - c.z);
      if (d > reach + (u.radius ?? 0.5)) continue;
      c.face(u.x, u.z, 0.1); c.atkAnim = 0; c.target = 0; w.t = 1 / c.st.attackRate;
      const k = (c.sp.design.genes.includes('soldier_caste') ? 1.3 : 1) * (0.6 + 0.4 * c.growth);
      u.damage?.(c.st.attack * k * (0.85 + Math.random() * 0.3), c);
      if (c.mesh.visible) vfx2d.play('impact', u.x, this.y(u.x, u.z) + 0.6, u.z, { scale: 0.8 });
      return;
    }
    w.t = 0.4;
  }
  /** robot and faction units in the region (not creatures) */
  units$(): Hostile[] {
    const g = this.g as any, out: Hostile[] = [];
    for (const u of g.robots ?? []) out.push(u);
    const F = g.factions; if (F) { for (const u of F.units ?? []) out.push(u); for (const u of F.stubs ?? []) if (!out.includes(u)) out.push(u); }
    return out;
  }
  /** the nearest hostile thing to a point: wild predators on the hunt, rival broods, faction units */
  hostileNear(x: number, z: number, r: number): Hostile | null {
    let best: Hostile | null = null, bd = r * r;
    this.w.near(x, z, r, (o) => { if (o.dead || o.faction === 'veyr') return; if (o.faction === 'wild' && o.mind !== 'hunt' && o.mind !== 'attack') return; const d = (o.x - x) ** 2 + (o.z - z) ** 2; if (d < bd) { bd = d; best = o as unknown as Hostile; } });
    for (const u of this.units$()) { if (u.dead || u.faction === 'veyr') continue; const d = (u.x - x) ** 2 + (u.z - z) ** 2; if (d < bd) { bd = d; best = u; } }
    return best;
  }

  // -------------------------------------------------------------------------------------------- haulers and piles
  /** drop points: the core and the factory's stores */
  dropNear(x: number, z: number): { x: number; z: number; d: number } | null {
    let best: { x: number; z: number; d: number } | null = null;
    const core = this.hive.core;
    if (core) best = { x: core.x, z: core.z, d: Math.hypot(core.x - x, core.z - z) };
    for (const b of this.factory?.buildings ?? []) {
      if (b.dead || !(b.kind === 'depot' || b.kind === 'crate' || b.kind === 'silo' || b.kind === 'barracks')) continue;
      const d = Math.hypot(b.x - x, b.z - z); if (!best || d < best.d) best = { x: b.x, z: b.z, d };
    }
    return best;
  }
  private tickHaul(w: Worker, dt: number) {
    const c = w.c, fn = w.fn;
    const cap = Math.max(3, Math.round((fn?.rate ?? 12) / 5));
    if (!w.carry) {
      // the fullest pile
      if (!w.from || w.from.pile < 1 || w.from.c.dead) {
        w.from = null; let bn = 0.99;
        for (const o of this.workers.values()) if (o !== w && o.pile > bn && !this.claimedBy(o, w)) { bn = o.pile; w.from = o; }
        if (!w.from) { w.note = 'NO PILES TO CARRY'; this.goTo(w, w.site!.x, w.site!.z, 3); return; }
      }
      const src = w.from;
      const px = src.c.x - Math.sin(src.c.yaw) * (src.c.radius + 0.6), pz = src.c.z - Math.cos(src.c.yaw) * (src.c.radius + 0.6);
      if (!this.goTo(w, px, pz, 1.2 + c.radius)) { w.note = `TO A PILE OF ${itemName(src.pileItem)}`; return; }
      const n = Math.min(cap, Math.floor(src.pile)); src.pile -= n;
      w.carry = { item: src.pileItem, n }; w.from = null;
      if (c.mesh.visible) vfx2d.play('poof', c.x, c.y + c.size * 0.6, c.z, { ramp: 'soil', scale: 0.6 });
      sfx('click', 0.7, 0.2 * this.g.audible(c.x, c.z));
      return;
    }
    const dp = this.dropNear(c.x, c.z); if (!dp) { w.note = 'NOWHERE TO DELIVER'; return; }
    if (!this.goTo(w, dp.x + 2.2, dp.z + 1.2, 2 + c.radius)) { w.note = `HAULING ${w.carry.n} ${itemName(w.carry.item)}`; return; }
    this.put(w.carry.item, w.carry.n, c.x, c.y + 0.6, c.z);
    this.logOut(w, w.carry.item, w.carry.n, true);
    w.carry = null;
    void dt;
  }
  private claimedBy(o: Worker, me: Worker) { for (const h of this.workers.values()) if (h !== me && h.job === 'haul' && h.from === o) return true; return false; }
  private dropPile(w: Worker) {
    if (w.pile >= 1 && w.pileItem) { this.put(w.pileItem, Math.floor(w.pile), w.c.x, w.c.y, w.c.z); }
    w.pile = 0;
  }

  // -------------------------------------------------------------------------------------------- habitats
  habitatFor(c: Creature) {
    let best: any = null, bd = 1e9;
    for (const h of this.habitats()) { if (h.pop >= h.cap && !(this.workers.get(c.id)?.hab === h.b)) continue; const d = Math.hypot(h.x - c.x, h.z - c.z); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  habitatAt(x: number, z: number) { for (const h of this.habitats()) if (Math.hypot(h.x - x, h.z - z) < h.R) return h; return null; }
  private tickHabitat(w: Worker, dt: number) {
    const c = w.c;
    const hs = this.habitats();
    if (!w.hab || !hs.some((h) => h.b === w.hab.b)) { w.hab = this.habitatFor(c); w.state = 'go'; if (!w.hab) { w.note = 'NO HABITAT'; this.finish(w, ''); return; } }
    const h = this.habitats().find((x) => x.b === w.hab.b) ?? w.hab; w.hab = h;
    if (w.state === 'go') { if (!this.goTo(w, h.x, h.z, h.R * 0.5)) { w.note = 'TO THE HABITAT'; return; } w.state = 'live'; c.order = null; }
    c.homeX = h.x; c.homeZ = h.z;
    if (c.mind === 'wander' && Math.hypot(c.goalX - h.x, c.goalZ - h.z) > h.R - 1) { const a = Math.random() * 6.28, r = Math.random() * (h.R - 1.4); c.goalX = h.x + Math.cos(a) * r; c.goalZ = h.z + Math.sin(a) * r; c.path = null; }
    // produce in place: glands, coral and milk work faster in the dome
    const fn = fnsForJob(w.prof, 'habitat').find((f) => ['silk', 'oil', 'crystal', 'milk', 'fleece'].includes(f.fn.kind));
    if (fn) {
      w.acc += (fn.rate / 60) * dt * this.mul(w);
      w.note = `HABITAT · ${fn.fn.verb} ×${(1.5 * this.climateFit(w)).toFixed(2)}`;
      if (w.acc >= 1) { const n = Math.floor(w.acc); w.acc -= n; this.yieldItem(w, fn.fn.item!, n, c.x, c.y + 0.4, c.z); if (c.mesh.visible) vfx2d.play('sparkle', c.x, c.y + c.size * 0.6, c.z, { ramp: 'glowTeal', scale: 0.5 }); }
    } else w.note = `HABITAT · ${h.climate.toUpperCase()}`;
  }
  /** keep habitat dwellers inside their dome */
  contain(h: { x: number; z: number; R: number; b: any }) {
    for (const w of this.workers.values()) {
      if (w.job !== 'habitat' || w.state !== 'live' || w.hab?.b !== h.b) continue;
      const c = w.c, dx = c.x - h.x, dz = c.z - h.z, d = Math.hypot(dx, dz), lim = h.R - c.radius - 0.4;
      if (d > lim && d > 0.01) { c.x = h.x + (dx / d) * lim; c.z = h.z + (dz / d) * lim; c.vx *= -0.3; c.vz *= -0.3; }
    }
  }

  // -------------------------------------------------------------------------------------------- upkeep
  private feed(w: Worker, dt: number, now: number) {
    const c = w.c;
    w.mealT -= dt;
    if (w.mealT <= 0) {
      w.mealT = 30;
      if (w.job === 'idle' && (c as any).__job === 1) return;
      // pasture and habitats feed most of it; workers off the job forage for themselves
      const graze = w.job === 'farm' || w.job === 'idle' ? 0.3 : w.job === 'habitat' ? 0.6 : 1;
      const needF = w.prof.food * 0.5 * graze, needW = w.prof.water * 0.5 * (w.job === 'idle' ? 0.3 : 1);
      const gotF = this.takeFood(needF), gotW = this.nearWater(c.x, c.z) ? needW : this.takeWater(needW);
      this.eaten.push({ t: now, food: gotF, water: gotW });
      const ratio = Math.min(needF > 0 ? gotF / needF : 1, needW > 0 ? gotW / needW : 1);
      w.fed = ratio >= 0.99 ? 1 : clamp(w.fed * 0.5 + ratio * 0.5 - 0.15, 0, 1);
    }
    // fed workers keep their strength (the world's metabolism would starve them on a hold order)
    if (w.fed > 0.3 && c.energy < 0.7) c.energy = Math.min(0.85, c.energy + dt * 0.02);
    if (w.fed < 0.25 && w.state !== 'eat' && w.job !== 'idle' && w.job !== 'troop' && w.job !== 'guard' && w.job !== 'habitat') { w.state = 'eat'; w.grazeT = 14; c.order = null; c.energy = Math.min(c.energy, 0.3); }
  }
  private tickGraze(w: Worker, dt: number) {
    const c = w.c; w.grazeT -= dt; w.note = 'HUNGRY · FORAGING';
    if (c.order?.kind === 'hold' || c.order?.kind === 'move') c.order = null;
    if (w.grazeT <= 0 || c.energy > 0.85) { w.state = 'go'; w.fed = Math.max(w.fed, 0.55); w.tgt = null; }
  }
  /** food from the stores: fruit, protein, then carbon (fruit-equivalents) */
  private takeFood(n: number): number {
    const f = this.factory;
    for (let k = 0; k < 8 && this.food < n; k++) {
      if (f?.take?.('fruit', 1)) this.food += 1;
      else if (f?.take?.('protein', 1)) this.food += 1.6;
      else if ((this.store.fruit ?? 0) >= 1) { this.store.fruit--; this.food += 1; }
      else if ((this.store.protein ?? 0) >= 1) { this.store.protein--; this.food += 1.6; }
      else if (this.run.res.carbon >= 2) { this.run.res.carbon -= 2; this.food += 0.8; }
      else break;
    }
    const got = Math.min(n, this.food); this.food -= got; return got;
  }
  private takeWater(n: number): number {
    for (let k = 0; k < 6 && this.water < n; k++) { if (this.run.res.water >= 1) { this.run.res.water -= 1; this.water += 1; } else break; }
    const got = Math.min(n, this.water); this.water -= got; return got;
  }
  private nearWater(x: number, z: number) { const R = this.w.region; for (let k = 0; k < 8; k++) { const a = k * 0.785; if (R.isWater(x + Math.cos(a) * 5, z + Math.sin(a) * 5)) return true; } return false; }

  // -------------------------------------------------------------------------------------------- output
  /** a worker made something: home if near, onto its pile if far */
  private yieldItem(w: Worker, item: string, n: number, x: number, y: number, z: number) {
    if (!(n > 0)) return;
    const dp = this.dropNear(x, z);
    const far = !dp || dp.d > DROP_R;
    if (far && item !== 'soil' && item !== 'water') {
      if (w.pileItem && w.pileItem !== item && w.pile >= 1) this.put(w.pileItem, Math.floor(w.pile), x, y, z), (w.pile = 0);
      w.pileItem = item; w.pile = Math.min(PILE_CAP, w.pile + n);
      this.logOut(w, item, n);
      return;
    }
    this.put(item, n, x, y, z);
    this.logOut(w, item, n);
  }
  /** into the stores: the factory's central stores, raw materials into the hold; motes fly home */
  put(item: string, n: number, x: number, y: number, z: number) {
    if (!(n > 0)) return;
    const f = this.factory;
    const raw = item === 'ore' || item === 'carbon' || item === 'water' || item === 'soil';
    if (f?.put) f.put(item, n, x, z);
    else if (raw) this.hive.gather(item as any, n, x, y, z, true);
    else this.store[item] = (this.store[item] ?? 0) + n;
    const core = this.hive.core;
    if (core && Math.random() < 0.6) this.g.fx.mote(x, y, z, core.x, core.y + 1.2, core.z, ITEM_COL[item] ?? 0x9cc5ae, 4);
  }
  private logOut(w: Worker | null, item: string, n: number, hauled = false) {
    const t = this.w.time;
    if (w) w.out.push({ t, n, item });
    // hauled loads were counted when they were made
    if (!hauled) this.log.push({ t, n, item });
  }
  /** output per minute by item over the last minute (ground in m3) */
  rates(): Record<string, number> {
    const out: Record<string, number> = {}, span = Math.min(60, Math.max(10, this.w.time));
    for (const e of this.log) out[e.item] = (out[e.item] ?? 0) + e.n;
    for (const k in out) out[k] *= 60 / span;
    return out;
  }
  /** a producer's own output per minute */
  rateOf(out: { t: number; n: number }[]) { const span = Math.min(60, Math.max(10, this.w.time)); let s = 0; for (const e of out) s += e.n; return (s * 60) / span; }
  upkeep(): { food: number; water: number } { const span = Math.min(60, Math.max(10, this.w.time)); let f = 0, wa = 0; for (const e of this.eaten) { f += e.food; wa += e.water; } return { food: (f * 60) / span, water: (wa * 60) / span }; }
  /** every producer with what it makes per minute (workers, plants, springs) */
  producers(): { name: string; job: string; perMin: number; item: string; note: string; x: number; z: number }[] {
    const out: { name: string; job: string; perMin: number; item: string; note: string; x: number; z: number }[] = [];
    for (const w of this.workers.values()) { const item = w.out[w.out.length - 1]?.item ?? w.fn?.fn.item ?? ''; out.push({ name: w.c.sp.name, job: JOB_NAME[w.job], perMin: this.rateOf(w.out), item, note: w.note, x: w.c.x, z: w.c.z }); }
    for (const p of this.plants) out.push({ name: GENE[p.gene]?.name ?? p.gene, job: 'PLANT', perMin: this.rateOf(p.out), item: BIO[p.gene]?.fn.item ?? '', note: '', x: p.x, z: p.z });
    for (const s of this.springs) out.push({ name: 'Spring', job: 'SPRING', perMin: this.rateOf(s.out), item: 'water', note: '', x: s.x, z: s.z });
    return out;
  }

  // ============================================================================================ engineered plants
  /** put a plant gene on a grafted plant (grafts it first if needed). Returns why not, or null */
  engineerPlant(i: number, gene: string, free = false): string | null {
    const fl = this.w.flora, b = BIO[gene];
    if (!b?.plant) return 'Not a plant gene';
    if (!this.run.has(gene)) return 'Not sequenced yet';
    if (!(i >= 0 && i < fl.n) || fl.bio[i] <= 0.05) return 'No plant there';
    if (this.plants.some((p) => p.i === i)) return 'Already engineered';
    const sp = fl.species[fl.sp[i]];
    if (gene === 'algae_bloom' && !sp.water && !this.w.region.isWater(fl.x[i], fl.z[i])) return 'Algae needs open water';
    if (gene === 'resin_bark' && !sp.tree) return 'Resin bark needs a tree';
    if (!this.hive.isGrafted(i)) { if (free) (this.hive as any).applyGraft?.(i, false, true); else if (!this.hive.graftPlant(i)) return this.hive.whyGraft(i) ?? 'Cannot graft it'; }
    if (!free) { const c = { carbon: 4, water: 2 }; if (this.hive.lack(c)) return this.hive.lack(c); this.hive.pay(c); }
    this.plants.push({ i, gene, x: fl.x[i], z: fl.z[i], t: Math.random() * 10, pollen: 0, guard: 0, out: [], spread: 30 + Math.random() * 30 });
    fl.setTint?.(i, PLANT_COL[gene] ?? 0x9cc5ae, 0.35);
    const y = this.y(fl.x[i], fl.z[i]);
    vfx2d.play('sparkle', fl.x[i], y + 0.8, fl.z[i], { ramp: 'glowTeal', scale: 1.1 });
    this.g.fx.burst(fl.x[i], y + 0.6, fl.z[i], 10, this.hive.vein, { glow: true, speed: 0.8, up: 1.6, size: 2, life: 0.8, grav: 0 });
    this.onChange?.();
    return null;
  }
  /** sow a saved prefab with a plant gene grafted in */
  sowEngineered(prefab: { name: string; kind: number; seed: number }, gene: string, x: number, z: number): string | null {
    const why = this.hive.whySow(prefab, x, z); if (why) return why;
    if (!this.run.has(gene)) return 'Not sequenced yet';
    const fl = this.w.flora, before = fl.n;
    if (!this.hive.sow(prefab, x, z)) return 'Could not sow';
    let idx = -1;
    if (fl.n > before) idx = fl.n - 1;
    else fl.near(x, z, 0.4, (i) => { if (i > idx) idx = i; });
    if (idx < 0) return null;
    return this.engineerPlant(idx, gene, true);
  }
  private tickPlants(dt: number, now: number) {
    const fl = this.w.flora, R = this.w.region;
    for (let k = this.plants.length - 1; k >= 0; k--) {
      const p = this.plants[k];
      while (p.out.length && now - p.out[0].t > 60) p.out.shift();
      if (fl.bio[p.i] <= 0.05 || fl.x[p.i] !== p.x) { this.plants.splice(k, 1); continue; }
      p.pollen = Math.max(0, p.pollen - dt); p.guard = Math.max(0, p.guard - dt);
      p.t += dt;
      if (p.t < 10) continue;
      p.t -= 10;
      const b = BIO[p.gene], lv = [1, 1, 1.6, 2.2][this.run.genes.get(p.gene)?.level ?? 1];
      const sp = fl.species[fl.sp[p.i]], i = Math.floor(p.z) * R.N + Math.floor(p.x);
      const wet = clamp(0.5 + (R.wet[i] ?? 0.5), 0.5, 1.3);
      let amt = (b.fn.rate / 6) * lv * (sp.tree ? 1.4 : 1) * wet * (p.pollen > 0 ? 1.5 : 1) * (p.guard > 0 ? 1.15 : 1);
      const y = this.y(p.x, p.z), top = y + Math.min(2.4, sp.hmax) * 0.7;
      switch (b.fn.kind) {
        case 'resin': vfx2d.drops(p.x, top * 0.6 + y * 0.4, p.z, 3, { speed: 0.2, up: 0.2, ramp: 'glowAmber', land: 'die', scale: 1.2 }); break;
        case 'metalroot': {
          const d = R.deposits.find((q) => q.amount > 0 && Math.hypot(q.x - p.x, q.z - p.z) < q.r + 6);
          if (d) { amt *= 2; d.amount = Math.max(0, d.amount - amt * 0.5); }
          vfx2d.play('glint', p.x, top, p.z, { ramp: 'steel', scale: 0.6 }); break;
        }
        case 'algae': if (!R.isWater(p.x, p.z)) amt *= 0.25; vfx2d.play('ripple', p.x, R.water + 0.02, p.z, { ramp: 'ichor', scale: 1.2, flat: true }); break;
        case 'fruit': vfx2d.play('sparkle', p.x, top, p.z, { ramp: 'coral', scale: 0.6 }); break;
        case 'nitro': this.fertilise(p.x, p.z, 3, 0.04 * lv); amt = 0; break;
        case 'greener': {
          this.irrigate(p.x, p.z, 3, 0.05 * lv);
          for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const j = (Math.floor(p.z) + dz) * R.N + Math.floor(p.x) + dx; if (j < 0 || j >= R.wet.length) continue; R.wet[j] = Math.min(1, R.wet[j] + 0.02 * lv); if (R.b[j] === B.SAND && R.wet[j] > 0.4 && Math.random() < 0.1) { R.b[j] = B.DRY; R.dirty.add(j); } }
          this.w.terrain.flushDirty();
          p.spread -= 10;
          if (p.spread <= 0 && this.plants.filter((q) => q.gene === 'desert_greener').length < 40) { p.spread = 60; const a = Math.random() * 6.28; const j = this.seed(fl.sp[p.i], p.x + Math.cos(a) * 2.6, p.z + Math.sin(a) * 2.6); if (j >= 0) this.engineerPlant(j, 'desert_greener', true); }
          amt = 0; break;
        }
      }
      if (amt > 0 && b.fn.item) {
        // fruit can hang on the plant for workers to pick (flora's own fruit) when the flora supports it
        const n = amt;
        this.put(b.fn.item, n, p.x, top, p.z);
        p.out.push({ t: now, n, item: b.fn.item }); this.log.push({ t: now, n, item: b.fn.item });
      }
    }
  }
  /** a seedling of a flora kind (it grows in); returns its index or -1 */
  private seed(kind: number, x: number, z: number): number {
    const R = this.w.region, fl = this.w.flora;
    if (R.isSolid(x, z) || x < 3 || z < 3 || x > R.N - 3 || z > R.N - 3) return -1;
    if (R.isWater(x, z) !== !!fl.species[kind]?.water) return -1;
    let crowded = false; fl.near(x, z, 0.7, (i) => { if (fl.bio[i] > 0.05) crowded = true; }); if (crowded) return -1;
    const i = fl.addPlant(kind, (NEXT_SRC = (NEXT_SRC * 31 + 7) % 997), x, z);
    if (i < 0) return -1;
    fl.setGrow(i, 0); this.seedlings.push({ i, k: 0 });
    return i;
  }
  private tickSeedlings(dt: number) {
    for (let k = this.seedlings.length - 1; k >= 0; k--) { const s = this.seedlings[k]; s.k = Math.min(1, s.k + dt / 18); this.w.flora.setGrow(s.i, s.k); if (s.k >= 1) this.seedlings.splice(k, 1); }
  }
  private tickSprings(dt: number, now: number) {
    for (const s of this.springs) {
      while (s.out.length && now - s.out[0].t > 60) s.out.shift();
      s.t += dt; if (s.t < 4) continue; s.t -= 4;
      const n = s.rate / 15;
      this.put('water', n, s.x, this.y(s.x, s.z), s.z); s.out.push({ t: now, n, item: 'water' }); this.log.push({ t: now, n, item: 'water' });
      this.irrigate(s.x, s.z, 4, 0.08);
      if (Math.random() < 0.6) vfx2d.play('ripple', s.x, Math.max(this.w.region.water, this.y(s.x, s.z)) + 0.02, s.z, { flat: true, ramp: 'water', scale: 1 });
    }
  }

  // ============================================================================================ the land
  irrigate(x: number, z: number, r: number, amt: number) {
    if (this.eco?.irrigate) { this.eco.irrigate(x, z, r, amt); return; }
    const R = this.w.region, N = R.N, rr = Math.ceil(r);
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) { const X = Math.floor(x) + dx, Z = Math.floor(z) + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue; const d = Math.hypot(dx, dz) / r; if (d >= 1) continue; const i = Z * N + X; R.wet[i] = Math.min(1, R.wet[i] + amt * (1 - d)); }
  }
  fertilise(x: number, z: number, r: number, amt: number) {
    const e = this.eco; if (e?.fertilise) { e.fertilise(x, z, r, amt); return; } if (e?.fertilize) { e.fertilize(x, z, r, amt); return; }
    if (e?.dung) e.dung(x, z, amt * 3, (x * 31 + z * 17) | 0);
    const R = this.w.region, N = R.N, rr = Math.ceil(r);
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) { const X = Math.floor(x) + dx, Z = Math.floor(z) + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue; const d = Math.hypot(dx, dz) / r; if (d >= 1) continue; const i = Z * N + X; R.fert[i] = Math.min(1, R.fert[i] + amt * (1 - d)); }
  }

  // ============================================================================================ genomes and breeding
  /** wild species carry the functional genes of their kind: absorbing them is how these are sequenced */
  private seedGenomes() {
    for (const sp of this.run.reg.list) {
      if (sp.owner === 'veyr' || (sp as any).__bioSeeded) continue;
      (sp as any).__bioSeeded = 1;
      const genes = sp.design.genes;
      const add: string[] = [];
      for (const g of BIO_GENES) {
        if (g.bio.plant || add.length >= 2) continue;
        if (g.bio.src.marker.some((m) => genes.includes(m)) && !genes.includes(g.id)) add.push(g.id);
      }
      // the rarest first, a stable pick per species
      add.sort((a, b) => (GENE[b].tier - GENE[a].tier) || ((sp.id * 7 + a.length) % 3) - ((sp.id * 7 + b.length) % 3));
      for (const id of add.slice(0, 2)) genes.push(id);
    }
  }
  /** a plant prefab sequences the plant genes its kind carries */
  private plantGenes(name: string) {
    const fl = this.w.flora, R = this.w.region;
    const k = fl.species.findIndex((s) => s.name === name); if (k < 0) return;
    const sp = fl.species[k];
    const out: string[] = [];
    if (sp.tree) out.push('resin_bark');
    if (sp.water) out.push('algae_bloom');
    if (sp.food >= 0.6 && !sp.tree) out.push('fruit_set');
    if (sp.hmax < 0.8 && !sp.water) out.push('nitro_nodules');
    let nearSeam = false; for (let i = 0; i < fl.n && !nearSeam; i++) if (fl.sp[i] === k && R.deposits.some((d) => Math.hypot(d.x - fl.x[i], d.z - fl.z[i]) < d.r + 6)) nearSeam = true;
    if (nearSeam) out.push('metal_root');
    if (R.biome.moist < 0.4 || sp.wetMax < 0.4) out.push('desert_greener');
    if (!out.length) out.push('nitro_nodules');
    const fresh = out.filter((g) => !this.run.has(g));
    for (const g of out) this.run.add(g, name, this.w.time);
    if (fresh.length) toast(`Plant genes sequenced from <b>${name}</b>: ${fresh.map((g) => GENE[g].name).join(', ')}`, 'good', 4200);
  }
  /** containment: sterile stock never breeds, gene-locked stock only in a habitat; habitats breed their own;
   *  unlocked stock born outside a habitat may slip into the wild */
  private patchWorld() {
    const w = this.w;
    const prev = w.canBreed.bind(w);
    w.canBreed = (c: Creature) => {
      if (c.faction === 'veyr' && this.isEngineered(c.sp)) {
        const g = c.sp.design.genes;
        if (g.includes('sterile')) return false;
        const hab = this.habitatAt(c.x, c.z);
        if (hab) return hab.pop < hab.cap;
        if (g.includes('gene_lock')) return false;
      }
      return prev(c);
    };
    const prevBirth = w.hooks.onBirth;
    w.hooks.onBirth = (kid, parent, nsp) => {
      prevBirth?.(kid, parent, nsp);
      if (kid.faction !== 'veyr' || !this.isEngineered(kid.sp)) return;
      if (this.habitatAt(kid.x, kid.z) || kid.sp.design.genes.includes('gene_lock')) return;
      if (Math.random() < 0.2) {
        kid.faction = 'wild'; kid.order = null; kid.mind = 'wander'; kid.goalX = kid.x + (Math.random() - 0.5) * 30; kid.goalZ = kid.z + (Math.random() - 0.5) * 30;
        toast(`An engineered <b>${kid.sp.name}</b> was born outside a habitat and slipped into the wild. A Gene-Lock stops this.`, 'warn', 5200);
      }
    };
    // soldiers hit harder
    const prevMul = w.attackMul;
    w.attackMul = (by) => (prevMul ? prevMul(by) : 1) * (by.faction === 'veyr' && by.sp.design.genes.includes('soldier_caste') ? 1.3 : 1);
  }
}

/** item colours for the motes that fly home */
export const ITEM_COL: Record<string, number> = {
  iron_pellet: 0xa66d4d, glass_bead: 0x9cb2a5, silk: 0xcfc7a2, bio_oil: 0x7c8746, resin: 0xc9a464, crystal: 0x9cc5ae, protein: 0xbd8a7d,
  algae_fuel: 0x606b34, fruit: 0xa6705f, ore: 0xa66d4d, soil: 0x8a7a65, water: 0x719086, carbon: 0xa28854,
};

/** a troop creature in the robot-unit shape (CONTRACT.md): order(), damage(), the fields the squads read */
export class BioUnit {
  constructor(readonly bt: Biotech, readonly c: Creature) {}
  get kind() { return 'bio:' + this.c.sp.name; }
  get faction() { return this.c.faction; }
  get x() { return this.c.x; } get y() { return this.c.y; } get z() { return this.c.z; }
  get hp() { return this.c.hp; } get maxHp() { return this.c.maxHp; } get dead() { return this.c.dead; }
  get mesh(): THREE.Object3D { return this.c.mesh; }
  get radius() { return this.c.radius; }
  order(o: UOrder) { this.bt.order(this.c, o); }
  update(_dt: number) { /* the world ticks the creature */ }
  damage(n: number, _from?: unknown) { this.bt.w.damage(this.c, n, null); }
  dispose() { /* the world owns the creature */ }
}
export type { VfxName };
