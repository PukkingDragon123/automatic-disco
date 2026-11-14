// THE ECOSYSTEM. A coarse grid (4 m cells) under the region keeps the slow state of the land, and drives the
// plants and the populations from it:
//  - WATER: groundwater seeps out from rivers, ponds, flooded ground and irrigation (downhill more easily than
//    up), soil moisture follows it plus the climate, the season and recent rain, and dries by sun and biome. The
//    water stage (`level`) swells in the wet season and after rain and shrinks in drought.
//  - SOIL: fertility is fed by dung and rotting corpses (through a nutrient pool that mineralises in damp soil),
//    drawn down by vegetation denser than the land carried at the start, and poisoned land wilts everything.
//  - PLANTS: every plant has a vigour from its own habitat window against the moisture and fertility it now
//    gets; dry or poisoned plants brown, shrink and die back, overgrazed ground goes bare, dormant plants (the seed
//    bank) re-sprout when the ground is good again, fruiting plants bear fruit that animals eat and carry, and
//    seeds spread into newly watered land.
//  - POPULATIONS: births, deaths and their causes per species, carrying capacity from food and water (the cap on
//    wild breeding), booms and crashes, migrants wandering in when a line has died out of the region.
//  - LURES for other systems: attract / repel points, plus automatic ones (sown plants pull grazers, bases push
//    wildlife away), danger memory (kills, the golem's attacks), herd trails for the migration overlay.
// Runs inside World.update: the grid ticks twice a second, the plants are visited in slices every frame.
import type { World } from '../game/world';
import type { Creature } from '../game/creature';
import type { Species } from '../game/species';
import { GOLEM_REF } from '../game/creature';
import { clamp, hash01 } from '../core/rand';
import { RAMPS } from '../art/palette';
import { profileOf, roleOf, type Guild } from './profile';
import type { Role } from '../life/design';

/** metres per eco cell */
export const CS = 4;
const PASS_FRAMES = 40;
const ROLE_CAP: Record<Role, number> = { mite: 16, grazer: 9, tank: 4, stalker: 5, apex: 2, scavenger: 6, flyer: 10, snail: 8 };
/** the wild never grows past this many animals (performance) */
export const WILD_CAP = 150;
const DRY_TINT = RAMPS.straw[3];

export type LureKind = 'herb' | 'carn' | 'scav' | 'all' | 'water' | 'fruit';
export interface Lure { id: number; x: number; z: number; kind: LureKind; s: number; r: number; until: number; auto?: boolean }
interface Irrigation { id: number; x: number; z: number; r: number; amt: number; until: number }
export type NoteKind = 'boom' | 'crash' | 'drought' | 'flood' | 'birth' | 'extinct' | 'migrate' | 'graze' | 'green' | 'arrive' | 'season' | 'info';
export interface EcoNote { t: number; day: number; kind: NoteKind; text: string; x: number; z: number }
export type Status = 'booming' | 'thriving' | 'stable' | 'declining' | 'endangered' | 'extinct';
export interface CensusRow {
  id: number; name: string; role: string; diet: string; guild: Guild | ''; sched: string; owner: string;
  alive: number; young: number; born: number; died: number; causes: Record<string, number>;
  trend: number[]; status: Status; cap: number; introduced: boolean;
}
interface SpStat { born: number; died: number; causes: Record<string, number>; trend: number[]; status: Status; introduced: boolean; seen: boolean }
interface Trail { pts: number[]; diet: string; t: number }

export class Eco {
  readonly G: number;
  readonly N: number;
  // ---- the grid
  readonly elev: Float32Array; readonly wetB: Float32Array; readonly fertB: Float32Array;
  readonly waterF: Float32Array; readonly riverF: Float32Array; readonly floodF: Float32Array;
  readonly gw: Float32Array; readonly moist: Float32Array; readonly moist0: Float32Array;
  readonly fert: Float32Array; readonly fert0: Float32Array; readonly nutr: Float32Array; readonly poisonF: Float32Array;
  readonly graze: Float32Array; readonly veg: Float32Array; readonly cover: Float32Array; readonly danger: Float32Array;
  readonly popH: Float32Array; readonly popC: Float32Array; readonly irr: Float32Array; readonly drinkH: Float32Array;
  readonly seedN: Float32Array; readonly seedSp: Int16Array; readonly fruitN: Uint16Array;
  readonly shoreX: Float32Array; readonly shoreZ: Float32Array; readonly shoreD: Int16Array;
  private liveN0: Float32Array;
  // plant pass accumulators (swapped at the end of each pass)
  private aLive: Float32Array; private aVig: Float32Array; private aBio: Float32Array; private aTree: Float32Array; private aFruit: Uint16Array;
  readonly liveN: Float32Array; readonly vigS: Float32Array;
  // ---- plants
  vig = new Float32Array(0); pst = new Uint8Array(0); private gq = new Uint8Array(0); private tq = new Uint8Array(0);
  private dd = new Float32Array(0); fruit = new Uint8Array(0); private sprout = new Float32Array(0);
  private pi = 0; private passT = 0; private lastPass = 0.5;
  added = 0; diedPlants = 0; sprouted = 0;
  // ---- water and climate
  /** the water stage: metres above (or below) the normal river and pond surface */
  level = 0;
  /** current rain 0..1 (fed by the weather) */
  rain = 0;
  /** soil wetness left by recent rain 0..1 */
  wetness = 0;
  private reservoir = 0;
  /** seasonal climate factor (-1 deep dry season .. 1 height of the wet season) */
  seasonK = 0;
  readonly year: number;
  private phase0: number;
  // ---- other systems' handles
  lures: Lure[] = [];
  private irrs: Irrigation[] = [];
  private nextId = 1;
  /** extra structures wildlife keeps away from (the factory's buildings): { x, z }[] */
  structures: () => { x: number; z: number; faction?: string }[] = () => [];
  /** called for each new note (the view toasts the big ones) */
  onNote: ((n: EcoNote) => void) | null = null;
  notes: EcoNote[] = [];
  // ---- populations
  private ss = new Map<number, SpStat>();
  trails = new Map<number, Trail>();
  herdSleep = new Map<number, { x: number; z: number; day: number; sentry: number; until: number }>();
  private vegTot0 = 0; vegTot = 0; private prey0 = 0; prey = 0;
  t = 0;
  private acc = 0; private waterT = 0; private popT = 0; private trendT = 0; private trailT = 0; private lureT = 0; private spreadT = 0; private immT = 60;
  private ready = false;
  private flags = new Map<string, number>();

  constructor(readonly w: World) {
    const R = w.region;
    this.N = R.N; this.G = Math.ceil(R.N / CS);
    const n = this.G * this.G, F = () => new Float32Array(n);
    this.elev = F(); this.wetB = F(); this.fertB = F(); this.waterF = F(); this.riverF = F(); this.floodF = F();
    this.gw = F(); this.moist = F(); this.moist0 = F(); this.fert = F(); this.fert0 = F(); this.nutr = F(); this.poisonF = F();
    this.graze = F(); this.veg = F(); this.cover = F(); this.danger = F(); this.popH = F(); this.popC = F(); this.irr = F(); this.drinkH = F();
    this.seedN = F(); this.seedSp = new Int16Array(n).fill(-1); this.fruitN = new Uint16Array(n);
    this.shoreX = F(); this.shoreZ = F(); this.shoreD = new Int16Array(n);
    this.liveN0 = F(); this.aLive = F(); this.aVig = F(); this.aBio = F(); this.aTree = F(); this.aFruit = new Uint16Array(n);
    this.liveN = F(); this.vigS = F();
    this.year = w.dayLen * 6;
    // start a little into the wet season
    this.phase0 = 0.08 + hash01(w.seed, 5, 1) * 0.1;
  }

  // ================================================================================================ queries
  cell(x: number, z: number) { const G = this.G; return clamp(Math.floor(z / CS), 0, G - 1) * G + clamp(Math.floor(x / CS), 0, G - 1); }
  cx(c: number) { return (c % this.G) * CS + CS / 2; }
  cz(c: number) { return Math.floor(c / this.G) * CS + CS / 2; }
  /** soil moisture 0..1 */
  moisture(x: number, z: number) { return this.moist[this.cell(x, z)]; }
  /** soil fertility 0..1 */
  fertility(x: number, z: number) { return clamp(this.fert[this.cell(x, z)], 0, 1); }
  /** how poisoned the ground is 0..1 */
  poisonAt(x: number, z: number) { return this.poisonF[this.cell(x, z)]; }
  /** vegetation (standing forage) 0..~1.5 */
  vegetation(x: number, z: number) { return this.veg[this.cell(x, z)]; }
  /** plant cover (hiding places, shade) 0..1 */
  coverAt(x: number, z: number) { return this.cover[this.cell(x, z)]; }
  dangerAt(x: number, z: number) { return this.danger[this.cell(x, z)]; }
  /** the surface of the water over (x, z) including the seasonal stage */
  waterLevel(x: number, z: number) {
    const R = this.w.region, ry = R.riverAt(x, z), river = ry > 0 && R.heightAt(x, z) < ry;
    return (river ? ry : R.water) + this.level * (river ? 1 : 0.5);
  }
  /** is this plant alive (not a dormant seed bank slot)? */
  plantAlive(i: number) { return this.pst[i] !== 1; }
  /** the season by name */
  seasonName() {
    const k = this.seasonK, a = Math.abs(k), wet = k >= 0, growing = Math.sign(k) * Math.cos(this.phase() * Math.PI * 2) > 0;
    return (a > 0.8 ? (wet ? 'HEIGHT OF THE ' : 'DEEP ') : a < 0.4 ? (growing ? 'EARLY ' : 'LATE ') : '') + (wet ? 'WET SEASON' : 'DRY SEASON');
  }
  phase() { return ((this.t / this.year + this.phase0) % 1 + 1) % 1; }
  /** days since landing */
  get dayNo() { return Math.floor(this.t / this.w.dayLen + 0.32) + 1; }
  /** nearest drinkable shore to (x, z): a dry column beside water */
  shoreNear(x: number, z: number): [number, number] | null {
    const c = this.cell(x, z);
    if (this.shoreD[c] < 0) return null;
    return [this.shoreX[c], this.shoreZ[c]];
  }

  // ================================================================================================ API for other systems
  /** draw animals of a kind toward (x, z) for ttl seconds (Infinity for good). Strength 0..1 also sets the reach.
   *  Kinds: 'herb' (also 'grazer'), 'carn' ('predator'), 'scav', 'fruit', 'water', 'all'. Calling again at the same
   *  place refreshes the lure instead of stacking a new one. Returns an id for cancel(). */
  attract(x: number, z: number, kind: LureKind | string = 'all', strength = 0.6, ttl = 60): number {
    return this.lure(x, z, kind, Math.abs(strength), 8 + 22 * Math.min(1, Math.abs(strength)), ttl);
  }
  /** keep animals of a kind away from (x, z) */
  repel(x: number, z: number, kind: LureKind | string = 'all', strength = 0.6, ttl = 60): number {
    return this.lure(x, z, kind, -Math.abs(strength), 6 + 18 * Math.min(1, Math.abs(strength)), ttl);
  }
  private lure(x: number, z: number, kind: LureKind | string, s: number, r: number, ttl: number) {
    const k = lureKind(kind);
    for (const l of this.lures) if (!l.auto && l.kind === k && Math.sign(l.s) === Math.sign(s) && (l.x - x) ** 2 + (l.z - z) ** 2 < 1) { l.s = s; l.r = r; l.until = Math.max(l.until, this.t + ttl); return l.id; }
    const id = this.nextId++;
    this.lures.push({ id, x, z, kind: k, s, r, until: this.t + ttl });
    return id;
  }
  /** cancel an attract / repel / irrigation */
  cancel(id: number) { this.lures = this.lures.filter((l) => l.id !== id); this.irrs = this.irrs.filter((l) => l.id !== id); }
  /** water the ground round (x, z) (a channel, sprinkler, spring, a dam's outflow) for ttl seconds: the land greens
   *  and herds come to drink. Call again to keep it running (the same place is refreshed, not stacked). */
  irrigate(x: number, z: number, r = 6, amt = 1, ttl = 12): number {
    for (const s of this.irrs) if ((s.x - x) ** 2 + (s.z - z) ** 2 < 2.25 && Math.abs(s.r - r) < 1) { s.amt = Math.max(clamp(amt, 0, 1), s.amt); s.until = Math.max(s.until, this.t + ttl); return s.id; }
    const id = this.nextId++;
    this.irrs.push({ id, x, z, r, amt: clamp(amt, 0, 1), until: this.t + ttl });
    this.stampIrr();
    return id;
  }
  /** feed the soil (manure, compost, a fertiliser item) */
  fertilise(x: number, z: number, r = 5, amt = 0.4) { this.paint(x, z, r, (c, k) => { this.nutr[c] += amt * k * 0.6; this.fert[c] = Math.min(1.2, this.fert[c] + amt * k * 0.4); }); }
  fertilize(x: number, z: number, r = 5, amt = 0.4) { this.fertilise(x, z, r, amt); }
  /** poison the soil (herbicide, toxic runoff): plants wilt, grazers that eat there sicken */
  poison(x: number, z: number, r = 5, amt = 0.8) { this.paint(x, z, r, (c, k) => { this.poisonF[c] = Math.min(1, this.poisonF[c] + amt * k); }); }
  /** remember a place as dangerous (a kill, a blast) */
  scare(x: number, z: number, amt = 0.5, r = 6) { this.paint(x, z, r, (c, k) => { this.danger[c] = Math.min(2, this.danger[c] + amt * k); }); }
  /** populations per species, the census sheet's rows */
  census(): CensusRow[] {
    const w = this.w, rows: CensusRow[] = [];
    const alive = new Map<number, Creature[]>();
    for (const c of w.creatures) if (!c.dead && c.faction === 'wild') { let l = alive.get(c.sp.id); if (!l) alive.set(c.sp.id, (l = [])); l.push(c); }
    for (const sp of w.reg.list) {
      const st = this.ss.get(sp.id), l = alive.get(sp.id) ?? [];
      if (!st && !l.length) continue;
      if (sp.owner !== 'wild' && !l.length && !st?.introduced) continue;
      const s = st ?? this.stat(sp);
      const ex = l[0];
      const prof = ex ? profileOf(ex, w) : null;
      rows.push({
        id: sp.id, name: sp.name, role: ex ? roleOf(w, ex) : (w.roles.get(sp.id) ?? sp.role ?? ''), diet: sp.pheno.diet, guild: prof?.guild ?? '', sched: prof?.sched ?? '', owner: sp.owner,
        alive: l.length, young: l.filter((c) => !c.mature).length, born: s.born, died: s.died, causes: s.causes, trend: s.trend.slice(), status: l.length ? s.status : 'extinct',
        cap: ex ? this.capacity(ex) : 0, introduced: s.introduced,
      });
    }
    return rows.sort((a, b) => (b.alive > 0 ? 1 : 0) - (a.alive > 0 ? 1 : 0) || b.alive - a.alive);
  }
  /** release a creature into the wild: it joins the ecosystem (a printed animal set loose, an introduced species) */
  release(c: Creature) {
    if (c.dead) return;
    c.faction = 'wild'; c.order = null; c.mind = 'idle'; c.target = 0; c.homeX = c.x; c.homeZ = c.z;
    const s = this.stat(c.sp); s.introduced = true;
    this.note('arrive', `${c.sp.name.toUpperCase()} RELEASED INTO THE WILD`, c.x, c.z);
  }
  /** introduce a species: n wild animals of it as a new herd at (x, z) */
  introduce(sp: Species, x: number, z: number, n = 3): Creature[] {
    const w = this.w, out: Creature[] = [];
    const herd = w.newHerd();
    for (let k = 0; k < n; k++) {
      const c = w.spawn(sp, 'wild', x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4, k >= 2 && Math.random() < 0.5);
      if (!c) continue;
      c.herd = herd; w.herds.get(herd)!.push(c); out.push(c);
    }
    if (out.length) { this.stat(sp).introduced = true; this.note('arrive', `${n} ${sp.name.toUpperCase()} INTRODUCED`, x, z); }
    return out;
  }

  // ================================================================================================ hooks from the world and the AI
  onBirth(kid: Creature) { if (kid.faction === 'wild') this.stat(kid.sp).born++; }
  onDeath(c: Creature, by: Creature | null) {
    if (c.faction !== 'wild') return;
    const s = this.stat(c.sp);
    s.died++;
    const cause = c.dieCause || (by ? (by.sp === c.sp ? 'fight' : 'predation') : this.w.time - c.golemHit < 3 ? 'unit 07' : 'injury');
    s.causes[cause] = (s.causes[cause] ?? 0) + 1;
    // fear lingers where things are killed
    this.scare(c.x, c.z, by || cause === 'unit 07' ? 0.7 : 0.2, 7);
    if (c.sp.alive <= 0 && c.sp.owner === 'wild') this.note('extinct', `${c.sp.name.toUpperCase()}: LAST ONE GONE FROM THE REGION`, c.x, c.z);
  }
  /** an animal cropped plants here */
  grazed(x: number, z: number, amt: number) { const c = this.cell(x, z); this.graze[c] = Math.min(2, this.graze[c] + amt * 0.05); }
  /** dung: feeds the soil, drops any seed the animal carried */
  dung(x: number, z: number, amt: number, seed: number) {
    const c = this.cell(x, z);
    this.nutr[c] = Math.min(2, this.nutr[c] + amt * 0.02);
    if (seed >= 0) { this.seedN[c] = Math.min(20, this.seedN[c] + 1); this.seedSp[c] = seed; }
  }
  drank(x: number, z: number) { const c = this.cell(x, z); this.drinkH[c] = Math.min(5, this.drinkH[c] + 0.2); }
  /** a carcass rotting where it lies feeds the soil */
  rotting(x: number, z: number, amt: number) { const c = this.cell(x, z); this.nutr[c] = Math.min(3, this.nutr[c] + amt * 0.01); }
  /** best visible fruit near (x, z): a plant index, or -1 */
  fruitNear(x: number, z: number, r: number): number {
    const G = this.G, cx = Math.floor(x / CS), cz = Math.floor(z / CS), R = Math.ceil(r / CS);
    let best = -1, bd = r * r;
    for (let j = Math.max(0, cz - R); j <= Math.min(G - 1, cz + R); j++) for (let i = Math.max(0, cx - R); i <= Math.min(G - 1, cx + R); i++) {
      if (!this.fruitN[j * G + i]) continue;
      this.w.flora.near(i * CS + CS / 2, j * CS + CS / 2, CS * 0.75, (p, _d) => {
        if (this.fruit[p] <= 0 || this.pst[p] === 1) return;
        const d = (this.w.flora.x[p] - x) ** 2 + (this.w.flora.z[p] - z) ** 2;
        if (d < bd) { bd = d; best = p; }
      });
    }
    return best;
  }
  /** pick one fruit: the food in it (and the plant's seed rides along in the eater) */
  eatFruit(i: number): number {
    if (this.fruit[i] <= 0) return 0;
    this.fruit[i]--;
    return 0.18 + this.w.flora.species[this.w.flora.sp[i]].food * 0.006;
  }
  /** wild breeding cap for this creature's line: food and water set it */
  capacity(c: Creature): number {
    const role = roleOf(this.w, c);
    if (role === 'owned') return 6;
    const base = ROLE_CAP[role] * this.w.region.biome.fauna;
    const g = profileOf(c, this.w).guild;
    const vegK = this.vegTot0 > 0 ? clamp(this.vegTot / this.vegTot0, 0.2, 1.7) : 1;
    const preyK = this.prey0 > 0 ? clamp(this.prey / this.prey0, 0.2, 1.8) : 1;
    const waterK = clamp(0.75 + this.seasonK * 0.15 + this.wetness * 0.15, 0.5, 1.1);
    const k = g === 'predator' ? preyK : g === 'scavenger' ? (preyK + vegK) / 2 : g === 'decomposer' ? 1 : vegK * waterK;
    return Math.max(1, Math.round(base * k));
  }
  /** score a place for an animal to go: food, water, safety, lures, crowding (higher is better) */
  placeScore(x: number, z: number, guild: Guild, faction: string): number {
    const c = this.cell(x, z);
    let s = guild === 'predator' ? this.popH[c] * 0.8 + this.drinkH[c] * 0.3 : guild === 'scavenger' ? this.popH[c] * 0.3 + this.danger[c] * 0.5 : this.veg[c] * 2 + this.fruitN[c] * 0.05 - this.graze[c] * 0.6;
    if (guild !== 'predator' && guild !== 'scavenger') s -= this.danger[c] * 1.5 + this.popC[c] * 0.8;
    s += Math.min(1, this.moist[c]) * 0.25 - this.poisonF[c] * 2 + this.lureAt(x, z, guild, faction) * 1.5;
    if (this.waterF[c] > 0.7) s -= 2;
    return s;
  }
  /** the sum of lure pulls (+) and pushes (-) on a point for an animal */
  lureAt(x: number, z: number, guild: Guild, faction = 'wild'): number {
    let s = 0;
    for (const l of this.lures) {
      if (!this.lureFits(l, guild, faction)) continue;
      const d = Math.hypot(l.x - x, l.z - z); if (d >= l.r) continue;
      s += l.s * (1 - d / l.r);
    }
    return s;
  }
  /** the strongest pull felt at (x, z): where to go */
  pullFor(x: number, z: number, guild: Guild, faction = 'wild'): Lure | null {
    let best: Lure | null = null, bs = 0.05;
    for (const l of this.lures) {
      if (l.s <= 0 || !this.lureFits(l, guild, faction)) continue;
      const d = Math.hypot(l.x - x, l.z - z); if (d >= l.r) continue;
      const s = l.s * (1 - d / l.r * 0.7);
      if (s > bs) { bs = s; best = l; }
    }
    return best;
  }
  private lureFits(l: Lure, g: Guild, faction: string) {
    if (faction !== 'wild' && l.auto) return false;
    switch (l.kind) {
      case 'all': return true;
      case 'herb': case 'fruit': return g === 'grazer' || g === 'browser' || g === 'forager';
      case 'carn': return g === 'predator';
      case 'scav': return g === 'scavenger' || g === 'decomposer';
      case 'water': return true;
    }
  }

  // ================================================================================================ the tick
  update(dt: number) {
    if (dt <= 0) return;
    if (!this.ready) this.init();
    this.t += dt;
    this.clock(dt);
    this.plants(dt);
    this.acc += dt;
    if (this.acc >= 0.5) { this.grid(this.acc); this.acc = 0; }
    if ((this.waterT -= dt) <= 0) { this.waterT = 6; this.scanWater(); }
    if ((this.lureT -= dt) <= 0) { this.lureT = 3; this.autoLures(); }
    if ((this.popT -= dt) <= 0) { this.popT = 2; this.pop(); }
    if ((this.trailT -= dt) <= 0) { this.trailT = 5; this.trailsTick(); }
    if ((this.trendT -= dt) <= 0) { this.trendT = 20; this.trendTick(); }
    if ((this.spreadT -= dt) <= 0) { this.spreadT = 2.5; this.spread(); }
    if ((this.immT -= dt) <= 0) { this.immT = 75; this.immigrate(); }
  }

  private init() {
    this.ready = true;
    const w = this.w, R = w.region, N = R.N, G = this.G;
    const cnt = new Float32Array(G * G);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, c = Math.floor(z / CS) * G + Math.floor(x / CS);
      this.elev[c] += R.h[i]; this.wetB[c] += R.wet[i]; this.fertB[c] += R.fert[i]; cnt[c]++;
    }
    for (let c = 0; c < G * G; c++) { this.elev[c] /= cnt[c]; this.wetB[c] /= cnt[c]; this.fertB[c] /= cnt[c]; this.fert[c] = this.fert0[c] = this.fertB[c]; }
    this.scanWater();
    // settle the water to the starting climate before anything reads it
    this.seasonK = Math.sin(this.phase() * Math.PI * 2);
    for (let k = 0; k < 60; k++) this.hydro(4);
    this.moist0.set(this.moist);
    // plants: vigour from their habitat as it is now; per-cell starting stand
    const fl = w.flora, cap = fl.x.length;
    this.vig = new Float32Array(cap); this.pst = new Uint8Array(cap); this.gq = new Uint8Array(cap).fill(8); this.tq = new Uint8Array(cap);
    this.dd = new Float32Array(cap); this.fruit = new Uint8Array(cap); this.sprout = new Float32Array(cap);
    for (let i = 0; i < fl.n; i++) {
      const c = this.cell(fl.x[i], fl.z[i]);
      this.vig[i] = this.suit(i, c);
      this.liveN0[c]++;
      this.aLive[c]++; this.aVig[c] += this.vig[i]; this.aBio[c] += fl.bio[i];
      if (fl.species[fl.sp[i]].tree) this.aTree[c]++;
      if (this.fruits(i) && this.vig[i] > 0.6 && hash01(i, 3, 9) < 0.5) { this.fruit[i] = 1 + Math.floor(hash01(i, 4, 9) * 2); this.aFruit[c]++; }
    }
    this.swapPass();
    this.vegTot0 = this.vegTot;
    this.pop();
    this.prey0 = Math.max(1, this.prey);
  }

  private clock(dt: number) {
    const bi = this.w.region.biome;
    this.seasonK = Math.sin(this.phase() * Math.PI * 2);
    // rain fills the soil and the rivers; both drain away again
    this.wetness = clamp(this.wetness + this.rain * dt / 50 - this.wetness * dt / (this.w.dayLen * 0.35), 0, 1);
    this.reservoir = clamp(this.reservoir + this.rain * dt * 0.004 - this.reservoir * dt / (this.w.dayLen * 0.5), 0, 0.5);
    const amp = 0.1 + 0.16 * bi.moist;
    const daily = Math.sin((this.w.day - 0.1) * Math.PI * 2) * 0.015;
    const was = this.level;
    this.level = clamp(this.seasonK * amp + this.reservoir + daily, -0.4, 0.5);
    if (was <= 0.3 && this.level > 0.3) this.note('flood', 'RIVERS IN SPATE: LOW GROUND FLOODING', this.w.region.landing.x, this.w.region.landing.z);
  }

  /** visit a slice of the plants */
  private plants(dt: number) {
    const fl = this.w.flora, n = fl.n;
    if (!n) return;
    if (this.vig.length < fl.x.length) this.growArrays(fl.x.length);
    this.passT += dt;
    const per = Math.ceil(n / PASS_FRAMES), dtp = this.lastPass;
    const hives = this.w.hives;
    const R = this.w.region, NN = R.N;
    for (let k = 0; k < per; k++) {
      if (this.pi >= n) { this.pi = 0; this.lastPass = Math.max(0.05, this.passT); this.passT = 0; this.swapPass(); }
      const i = this.pi++;
      const c = this.cell(fl.x[i], fl.z[i]);
      let grafted = false;
      for (const h of hives) if (h.grafts.has(i)) { grafted = true; break; }
      if (grafted) {
        if (this.pst[i] === 1) this.pst[i] = 0;
        this.aLive[c]++; this.aVig[c] += 1; this.aBio[c] += fl.bio[i];
        if (this.fruits(i)) this.growFruit(i, 1, dtp);
        if (this.fruit[i]) this.aFruit[c]++;
        continue;
      }
      const suit = this.suit(i, c);
      if (this.pst[i] === 1) {
        // the seed bank: dormant plants come back when the ground is good and left alone
        if (suit > 0.55 && this.graze[c] < 0.5 && fl.bio[i] > 0.3) {
          const nb = this.liveN0[c] > 0 ? clamp(this.liveN[c] / this.liveN0[c], 0, 1) : 0;
          const ch = (dtp / 45) * suit * suit * (0.25 + nb * 0.6 + Math.min(1, this.seedN[c] * 0.2)) * (1 - this.graze[c]);
          if (hash01(i, Math.floor(this.t * 3), 17) < ch) { this.pst[i] = 2; this.sprout[i] = 0.06; this.vig[i] = suit; this.sprouted++; this.seedN[c] = Math.max(0, this.seedN[c] - 0.3); fl.setGrow(i, 0.06); this.gq[i] = 0; }
        }
        continue;
      }
      const sp = fl.species[fl.sp[i]];
      this.vig[i] += (suit - this.vig[i]) * Math.min(1, dtp / 45);
      const v = this.vig[i];
      // drought, waterlogging and poison: the plant browns, its forage withers, and it dies back
      if (v < 0.42 && fl.bio[i] > 0.02) fl.eat(i, (0.42 - v) * dtp * 0.014);
      const tq = v < 0.48 ? Math.min(3, Math.floor((0.48 - v) / 0.1) + 1) : 0;
      if (tq !== this.tq[i]) { this.tq[i] = tq; fl.setTint(i, DRY_TINT, tq * 0.16); }
      if (this.pst[i] === 2) {
        this.sprout[i] = Math.min(1, this.sprout[i] + dtp / 22);
        const g = this.sprout[i] * (0.62 + 0.38 * v);
        fl.setGrow(i, g);
        if (this.sprout[i] >= 1) { this.pst[i] = 0; this.gq[i] = Math.round(g * 8); }
      } else {
        const gq = Math.round((0.62 + 0.38 * v) * 8);
        if (gq !== this.gq[i]) { this.gq[i] = gq; fl.setGrow(i, gq / 8); }
      }
      // bare ground: eaten to the root and starved of water, or trampled flat by a crowd
      if (fl.bio[i] < 0.06 && (v < 0.3 || this.graze[c] > 0.55)) {
        this.dd[i] += dtp;
        if (this.dd[i] > (sp.tree ? 90 : 26)) { this.die(i); continue; }
      } else if (this.dd[i] > 0) this.dd[i] = Math.max(0, this.dd[i] - dtp);
      if (this.fruits(i)) this.growFruit(i, v, dtp);
      this.aLive[c]++; this.aVig[c] += v; this.aBio[c] += fl.bio[i];
      if (sp.tree) this.aTree[c]++;
      if (this.fruit[i]) this.aFruit[c]++;
      void NN;
    }
  }
  private growFruit(i: number, v: number, dtp: number) {
    if (v > 0.6 && this.fruit[i] < 3 && hash01(i, Math.floor(this.t * 2), 23) < (dtp / 80) * (1 + this.seasonK * 0.5)) this.fruit[i]++;
  }
  private fruits(i: number) { const sp = this.w.flora.species[this.w.flora.sp[i]]; return sp.tree || sp.arch === 'shrub' || sp.arch === 'bulb' || sp.arch === 'fiddle' || sp.arch === 'eyeflower'; }
  private die(i: number) {
    const fl = this.w.flora;
    this.pst[i] = 1; this.dd[i] = 0; this.fruit[i] = 0; this.diedPlants++;
    fl.setGrow(i, 0); this.gq[i] = 0;
    if (this.tq[i]) { this.tq[i] = 0; fl.setTint(i, DRY_TINT, 0); }
    const c = this.cell(fl.x[i], fl.z[i]);
    this.nutr[c] = Math.min(2, this.nutr[c] + 0.01);
  }
  /** habitat suitability of plant i at its place now (0..1) */
  private suit(i: number, c: number): number {
    const fl = this.w.flora, R = this.w.region, sp = fl.species[fl.sp[i]];
    const col = clamp(Math.floor(fl.z[i]), 0, R.N - 1) * R.N + clamp(Math.floor(fl.x[i]), 0, R.N - 1);
    const m = R.wet[col] + (this.moist[c] - this.moist0[c]) * 1.3 + this.floodF[c] * (sp.water || sp.shore ? 0 : 0.5);
    const f = R.fert[col] + (this.fert[c] - this.fert0[c]);
    let s = win(m, sp.wetMin, sp.wetMax) * (0.6 + 0.4 * clamp(f / Math.max(0.12, sp.fert), 0, 1));
    if (sp.water) s = this.waterF[c] + this.floodF[c] > 0.05 ? Math.max(s, 0.9) : s * 0.4;
    return s * (1 - this.poisonF[c]);
  }
  private swapPass() {
    const G2 = this.G * this.G;
    let tot = 0;
    for (let c = 0; c < G2; c++) {
      const cap = Math.max(this.liveN0[c], 6);
      this.liveN[c] = this.aLive[c]; this.vigS[c] = this.aVig[c];
      this.veg[c] = this.aBio[c] / cap;
      this.cover[c] = clamp((this.aLive[c] + this.aTree[c] * 5) / 40, 0, 1);
      this.fruitN[c] = this.aFruit[c];
      tot += this.aBio[c];
      this.aLive[c] = 0; this.aVig[c] = 0; this.aBio[c] = 0; this.aTree[c] = 0; this.aFruit[c] = 0;
    }
    this.vegTot = tot;
  }
  private growArrays(cap: number) {
    const g = <T extends Float32Array | Uint8Array>(a: T, b: T, fill = 0) => { b.fill(fill as never); b.set(a); return b; };
    this.vig = g(this.vig, new Float32Array(cap)); this.pst = g(this.pst, new Uint8Array(cap)); this.gq = g(this.gq, new Uint8Array(cap), 8);
    this.tq = g(this.tq, new Uint8Array(cap)); this.dd = g(this.dd, new Float32Array(cap)); this.fruit = g(this.fruit, new Uint8Array(cap)); this.sprout = g(this.sprout, new Float32Array(cap));
  }

  /** seeds take in watered, empty ground: new plants (a small budget of fresh slots) */
  private spread() {
    const fl = this.w.flora, R = this.w.region, G = this.G;
    const room = fl.x.length - fl.n;
    if (room < 70 || this.added >= 220) return;
    let best = -1, bs = 0.15;
    for (let k = 0; k < 8; k++) {
      const c = Math.floor(Math.random() * G * G);
      if (this.waterF[c] > 0.85 || this.poisonF[c] > 0.2) continue;
      const wetter = this.moist[c] - this.moist0[c], empty = 1 - clamp(this.liveN[c] / Math.max(4, this.liveN0[c] + 3), 0, 1);
      const s = Math.max(0, wetter - 0.07) * 2.5 + Math.min(1, this.seedN[c] * 0.25) - this.graze[c];
      if (s * empty > bs) { bs = s * empty; best = c; }
    }
    if (best < 0) return;
    const c = best;
    for (let t = 0; t < 6; t++) {
      const x = (c % G) * CS + Math.random() * CS, z = Math.floor(c / G) * CS + Math.random() * CS;
      if (x < 2 || z < 2 || x > R.N - 2 || z > R.N - 2 || R.isSolid(x, z)) continue;
      const water = R.isWater(x, z);
      const col = Math.floor(z) * R.N + Math.floor(x);
      const m = R.wet[col] + (this.moist[c] - this.moist0[c]) * 1.3;
      // the species: what was carried here, else what grows nearby, else whatever suits the ground
      let kind = this.seedSp[c];
      const okFor = (k: number) => { const sp = fl.species[k]; return sp && sp.water === water && win(m, sp.wetMin, sp.wetMax) > 0.7 && (!sp.tree || Math.random() < 0.35); };
      if (kind < 0 || !okFor(kind)) {
        kind = -1;
        const cand: number[] = [];
        fl.near(x, z, 9, (i) => { if (this.pst[i] !== 1 && cand.length < 12) cand.push(fl.sp[i]); });
        for (const k of cand) if (okFor(k)) { kind = k; break; }
        if (kind < 0) for (let s = 0; s < 6 && kind < 0; s++) { const k = Math.floor(Math.random() * fl.species.length); if (okFor(k)) kind = k; }
      }
      if (kind < 0) return;
      let crowded = false;
      fl.near(x, z, fl.species[kind].tree ? 1.8 : 0.6, (i) => { if (this.pst[i] !== 1) crowded = true; });
      if (crowded) continue;
      const i = fl.addPlant(kind, (Math.random() * 1e6) | 0, x, z);
      if (i < 0) return;
      if (this.vig.length < fl.x.length) this.growArrays(fl.x.length);
      this.pst[i] = 2; this.sprout[i] = 0.05; this.vig[i] = 0.8; this.gq[i] = 0; this.tq[i] = 0; this.fruit[i] = 0; this.dd[i] = 0;
      fl.setGrow(i, 0.05);
      this.added++; this.seedN[c] = Math.max(0, this.seedN[c] - 1);
      if (this.added % 25 === 1 && this.moist[c] - this.moist0[c] > 0.15) this.note('green', 'NEW GROWTH TAKING HOLD ON WATERED GROUND', x, z);
      return;
    }
  }

  // ------------------------------------------------------------------------------------------------ water
  /** which columns are water, flooded or shore; nearest shore per cell */
  private scanWater() {
    const R = this.w.region, N = R.N, G = this.G, G2 = G * G;
    this.waterF.fill(0); this.riverF.fill(0); this.floodF.fill(0);
    const best = new Float32Array(G2).fill(1e9);
    this.shoreD.fill(-1);
    const isW = (i: number) => { const h = R.h[i], ry = R.riverY[i]; return h < R.water || (ry > 0 && h < ry - 0.05); };
    const lvl = this.level;
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = z * N + x, c = Math.floor(z / CS) * G + Math.floor(x / CS);
      if (isW(i)) { this.waterF[c] += 1 / (CS * CS); if (R.riverY[i] > 0) this.riverF[c] += 1 / (CS * CS); continue; }
      if (lvl > 0) { const ry = R.riverY[i], s = ry > 0 ? ry : R.water; if (R.h[i] < s + lvl * (ry > 0 ? 1 : 0.5)) this.floodF[c] += 1 / (CS * CS); }
      if (R.solid[i]) continue;
      if (isW(i - 1) || isW(i + 1) || isW(i - N) || isW(i + N)) {
        const d = (x + 0.5 - this.cx(c)) ** 2 + (z + 0.5 - this.cz(c)) ** 2;
        if (d < best[c]) { best[c] = d; this.shoreX[c] = x + 0.5; this.shoreZ[c] = z + 0.5; this.shoreD[c] = 0; }
      }
    }
    // spread the nearest shore outward (breadth first over the cells)
    const q: number[] = [];
    for (let c = 0; c < G2; c++) if (this.shoreD[c] === 0) q.push(c);
    for (let h = 0; h < q.length; h++) {
      const c = q[h], x = c % G, z = (c / G) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= G || Z >= G) continue;
        const o = Z * G + X; if (this.shoreD[o] >= 0) continue;
        this.shoreD[o] = this.shoreD[c] + 1; this.shoreX[o] = this.shoreX[c]; this.shoreZ[o] = this.shoreZ[c]; q.push(o);
      }
    }
  }
  private stampIrr() {
    this.irr.fill(0);
    this.irrs = this.irrs.filter((s) => s.until > this.t);
    for (const s of this.irrs) this.paint(s.x, s.z, s.r, (c, k) => { this.irr[c] = Math.max(this.irr[c], s.amt * Math.min(1, k * 1.6)); });
  }
  /** groundwater and soil moisture over s seconds */
  private hydro(s: number) {
    const G = this.G, bi = this.w.region.biome;
    const stage = clamp(0.8 + this.level * 0.5, 0.55, 1.1);
    const k = Math.min(1, s / 18);
    for (let c = 0; c < G * G; c++) {
      const x = c % G, z = (c / G) | 0, e = this.elev[c];
      const src = Math.max(this.waterF[c] > 0.03 ? Math.min(1, this.waterF[c] * 3) * (this.riverF[c] > 0 ? stage : 1) : 0, this.floodF[c] > 0.05 ? 1 : 0, this.irr[c]);
      let nb = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= G || Z >= G) continue;
        const o = Z * G + X;
        // water seeps downhill easily, uphill hardly at all
        const fall = clamp(0.66 - (e - this.elev[o]) * 0.07, 0.3, 0.82) * (dx && dz ? 0.92 : 1);
        nb = Math.max(nb, this.gw[o] * fall);
      }
      this.gw[c] += (Math.max(src, nb) - this.gw[c]) * k;
    }
    // soil moisture: climate, groundwater, rain, flood; dries by sun and heat
    const climate = 1 + this.seasonK * (0.1 + 0.12 * bi.moist);
    const dry = (0.02 + bi.temp * 0.05) * (1 - this.seasonK * 0.3);
    for (let c = 0; c < G * G; c++) {
      const tgt = clamp(this.wetB[c] * (0.7 + 0.3 * climate) + this.gw[c] * 0.5 + this.wetness * 0.28 + this.floodF[c] * 0.5 + this.irr[c] * 0.35 + this.cover[c] * 0.04 - dry, 0, 1.2);
      const m = this.moist[c];
      this.moist[c] = m + (tgt - m) * Math.min(1, s / (tgt > m ? 22 : 70));
    }
  }
  private grid(s: number) {
    const G2 = this.G * this.G;
    this.stampIrr();
    this.hydro(s);
    const dG = Math.exp(-s / 80), dD = Math.exp(-s / 140), dP = Math.exp(-s / 260), dH = Math.exp(-s / 200);
    for (let c = 0; c < G2; c++) {
      // nutrients mineralise faster in damp soil; the land slowly returns to its natural fertility; dense
      // stands draw it down, bare ground rests and recovers
      const m = this.nutr[c] * Math.min(1, s / 50) * (0.4 + this.moist[c]);
      this.nutr[c] -= m;
      const draw = (this.vigS[c] - this.liveN0[c] * 0.85) / 40;
      this.fert[c] = clamp(this.fert[c] + m * 0.5 + (this.fertB[c] - this.fert[c]) * s / 900 - draw * s * 0.0012, 0, 1.3);
      this.graze[c] *= dG; this.danger[c] *= dD; this.poisonF[c] *= dP; this.drinkH[c] *= dH;
      this.seedN[c] *= Math.exp(-s / 900);
    }
    // crowding: where the herds and the hunters are; the golem frightens what sees it fight
    this.popH.fill(0); this.popC.fill(0);
    const g = GOLEM_REF.g, wt = this.w.time;
    let fought = false;
    for (const c of this.w.creatures) {
      if (wt - c.golemHit < s + 0.1) fought = true;
      if (c.dead || c.faction !== 'wild') continue;
      const k = this.cell(c.x, c.z), m = Math.pow(Math.max(0.5, c.mass), 0.25) * 0.25;
      if (c.diet === 'carn') this.popC[k] += m; else this.popH[k] += m;
      if (c.mind === 'drink') this.drinkH[k] = Math.min(5, this.drinkH[k] + s * 0.05);
    }
    if (fought && g && g.alive) this.scare(g.x, g.z, 0.35, 9);
  }

  // ------------------------------------------------------------------------------------------------ lures
  private autoLures() {
    this.lures = this.lures.filter((l) => !l.auto && l.until > this.t);
    const w = this.w, G = this.G;
    // sown plants are a living bait for grazers
    const sown = new Map<number, number>();
    for (const h of w.hives) for (const g of h.grafts.values()) if (g.sown) { const c = this.cell(g.x, g.z); sown.set(c, (sown.get(c) ?? 0) + 1); }
    for (const [c, n] of sown) this.lures.push({ id: 0, x: this.cx(c), z: this.cz(c), kind: 'herb', s: Math.min(1, 0.35 + n * 0.12), r: 16 + Math.min(10, n * 2), until: this.t + 4, auto: true });
    // watered ground draws everything that drinks
    for (const s of this.irrs) this.lures.push({ id: 0, x: s.x, z: s.z, kind: 'water', s: 0.4 * s.amt, r: 18 + s.r, until: this.t + 4, auto: true });
    // bases: noise, machines, the smell of metal. Wildlife keeps its distance
    for (const h of w.hives) {
      if (h.core) this.lures.push({ id: 0, x: h.core.x, z: h.core.z, kind: 'all', s: -0.7, r: 15, until: this.t + 4, auto: true });
      let k = 0;
      for (const b of h.buildings) { if (b === h.core || b.dead || k++ > 24) continue; this.lures.push({ id: 0, x: b.x, z: b.z, kind: 'all', s: -0.4, r: 8, until: this.t + 4, auto: true }); }
    }
    let k = 0;
    for (const b of this.structures()) { if (k++ > 40) break; this.lures.push({ id: 0, x: b.x, z: b.z, kind: 'all', s: -0.35, r: 8, until: this.t + 4, auto: true }); }
    void G;
  }
  private paint(x: number, z: number, r: number, f: (c: number, k: number) => void) {
    const G = this.G, R = Math.ceil(r / CS) + 1, cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    for (let j = Math.max(0, cz - R); j <= Math.min(G - 1, cz + R); j++) for (let i = Math.max(0, cx - R); i <= Math.min(G - 1, cx + R); i++) {
      const d = Math.hypot(i * CS + CS / 2 - x, j * CS + CS / 2 - z);
      if (d > r + CS * 0.5) continue;
      f(j * G + i, clamp(1 - d / (r + CS * 0.5), 0.15, 1));
    }
  }

  // ------------------------------------------------------------------------------------------------ populations
  private stat(sp: Species): SpStat {
    let s = this.ss.get(sp.id);
    if (!s) this.ss.set(sp.id, (s = { born: 0, died: 0, causes: {}, trend: [], status: 'stable', introduced: sp.owner !== 'wild', seen: false }));
    return s;
  }
  private pop() {
    let prey = 0;
    for (const c of this.w.creatures) if (!c.dead && c.faction === 'wild' && c.diet !== 'carn') prey += Math.pow(Math.max(1, c.mass), 0.75);
    this.prey = prey;
  }
  private trendTick() {
    const counts = new Map<number, number>();
    for (const c of this.w.creatures) if (!c.dead && c.faction === 'wild') counts.set(c.sp.id, (counts.get(c.sp.id) ?? 0) + 1);
    for (const sp of this.w.reg.list) {
      const n = counts.get(sp.id) ?? 0;
      if (!n && !this.ss.has(sp.id)) continue;
      const s = this.stat(sp);
      s.trend.push(n); if (s.trend.length > 36) s.trend.shift();
      const was = s.trend.length > 6 ? s.trend[s.trend.length - 7] : s.trend[0];
      const prev = s.status;
      const ex = this.w.creatures.find((c) => !c.dead && c.sp === sp && c.faction === 'wild');
      const cap = ex ? this.capacity(ex) : 1;
      s.status = n === 0 ? 'extinct' : n <= 2 ? 'endangered' : n > was * 1.35 + 1 ? 'booming' : n < was * 0.7 - 0.5 ? 'declining' : n >= cap * 0.8 ? 'thriving' : 'stable';
      if (prev !== s.status && ex) {
        if (s.status === 'booming') this.note('boom', `${sp.name.toUpperCase()} NUMBERS BOOMING (${n})`, ex.x, ex.z);
        if (s.status === 'declining' && was >= 4) this.note('crash', `${sp.name.toUpperCase()} IN DECLINE (${was} TO ${n})`, ex.x, ex.z);
      }
    }
    // the land itself
    const G2 = this.G * this.G;
    let dm = 0, bare = -1, bs = 0.5;
    for (let c = 0; c < G2; c++) {
      dm += this.moist[c] - this.moist0[c];
      const b = this.graze[c] * (this.liveN0[c] > 6 ? 1 - this.liveN[c] / this.liveN0[c] : 0);
      if (b > bs) { bs = b; bare = c; }
    }
    dm /= G2;
    if (dm < -0.08) this.flag('drought', 600, () => this.note('drought', 'DROUGHT: THE GROUND IS DRYING OUT', this.w.region.landing.x, this.w.region.landing.z));
    if (bare >= 0) this.flag('graze' + bare, 240, () => this.note('graze', 'OVERGRAZED: THE HERDS ARE STRIPPING THE GROUND BARE', this.cx(bare), this.cz(bare)));
    const sk = this.seasonK >= 0 ? 'wet' : 'dry';
    if (this.flags.get('season') !== (sk === 'wet' ? 1 : 0)) { const first = !this.flags.has('season'); this.flags.set('season', sk === 'wet' ? 1 : 0); if (!first) this.note('season', sk === 'wet' ? 'THE RAINS RETURN: WET SEASON' : 'THE DRY SEASON SETS IN', this.w.region.landing.x, this.w.region.landing.z); }
  }
  private flag(key: string, every: number, f: () => void) {
    const t = this.flags.get(key) ?? -1e9;
    if (this.t - t < every) return;
    this.flags.set(key, this.t); f();
  }
  /** a line that died out here may wander back in from the edge of the region when the land can feed it */
  private immigrate() {
    const w = this.w, R = w.region;
    let wild = 0;
    for (const c of w.creatures) if (!c.dead && c.faction === 'wild') wild++;
    if (wild > WILD_CAP * 0.8) return;
    const roots = w.reg.list.filter((s) => s.parent === null && s.owner === 'wild' && w.roles.has(s.id));
    const cand = roots.filter((s) => { let n = 0; for (const c of w.creatures) if (!c.dead && c.faction === 'wild' && rootSp(w, c.sp) === s) n++; return n < 2; });
    if (!cand.length || Math.random() > 0.45) return;
    const sp = cand[Math.floor(Math.random() * cand.length)];
    const role = w.roles.get(sp.id)!;
    if (role === 'apex' && Math.random() < 0.6) return;
    // enter where the land is best along an edge
    let bx = 0, bz = 0, bs = -1e9;
    for (let k = 0; k < 10; k++) {
      const e = Math.floor(Math.random() * 4), t = 8 + Math.random() * (R.N - 16);
      const x = e === 0 ? 5 : e === 1 ? R.N - 5 : t, z = e === 2 ? 5 : e === 3 ? R.N - 5 : t;
      if (R.isWater(x, z) || R.isSolid(x, z)) continue;
      const s = this.veg[this.cell(x, z)] + this.moist[this.cell(x, z)] * 0.3;
      if (s > bs) { bs = s; bx = x; bz = z; }
    }
    if (bs < -1e8) return;
    const n = role === 'apex' ? 1 : 2 + Math.floor(Math.random() * 2);
    const herd = w.newHerd();
    for (let k = 0; k < n; k++) {
      const c = w.spawn(sp, 'wild', bx + (Math.random() - 0.5) * 3, bz + (Math.random() - 0.5) * 3, false);
      if (!c) continue;
      c.herd = herd; w.herds.get(herd)!.push(c); c.energy = 0.6;
      c.homeX = clamp(bx + (R.N / 2 - bx) * 0.3, 6, R.N - 6); c.homeZ = clamp(bz + (R.N / 2 - bz) * 0.3, 6, R.N - 6);
      if (role === 'apex') c.boss = true;
    }
    sp.extinct = false;
    const side = bx < 10 ? 'WEST' : bx > R.N - 10 ? 'EAST' : bz < 10 ? 'NORTH' : 'SOUTH';
    this.note('arrive', `${sp.name.toUpperCase()} WANDER IN FROM THE ${side}`, bx, bz);
  }
  private trailsTick() {
    const w = this.w;
    for (const [id, h] of w.herds) {
      let x = 0, z = 0, n = 0, diet = 'herb';
      for (const c of h) if (!c.dead && c.faction === 'wild') { x += c.x; z += c.z; n++; diet = c.diet; }
      if (!n) { if (this.trails.has(id)) { const t = this.trails.get(id)!; if (this.t - t.t > 120) this.trails.delete(id); } continue; }
      x /= n; z /= n;
      let t = this.trails.get(id);
      if (!t) this.trails.set(id, (t = { pts: [x, z], diet, t: this.t }));
      const L = t.pts.length;
      if (Math.hypot(t.pts[L - 2] - x, t.pts[L - 1] - z) > 3) { t.pts.push(x, z); t.t = this.t; if (t.pts.length > 40) t.pts.splice(0, 2); }
    }
  }
  note(kind: NoteKind, text: string, x: number, z: number) {
    const n: EcoNote = { t: this.t, day: this.dayNo, kind, text, x, z };
    this.notes.push(n); if (this.notes.length > 40) this.notes.shift();
    this.onNote?.(n);
  }
}

function lureKind(k: string): LureKind {
  switch (k) {
    case 'herb': case 'grazer': case 'herbivore': case 'browser': case 'forager': return 'herb';
    case 'carn': case 'predator': case 'hunter': return 'carn';
    case 'scav': case 'scavenger': case 'decomposer': return 'scav';
    case 'fruit': case 'water': return k;
  }
  return 'all';
}
/** a habitat window: 1 inside [a, b], falling off outside (drier side faster) */
function win(m: number, a: number, b: number) { return m < a ? clamp(1 - (a - m) / 0.2, 0, 1) : m > b ? clamp(1 - (m - b) / 0.3, 0, 1) : 1; }
function rootSp(w: World, sp: Species): Species { let s = sp; while (s.parent !== null) s = w.reg.get(s.parent); return s; }
