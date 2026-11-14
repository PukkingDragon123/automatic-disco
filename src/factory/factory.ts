// The industrial layer: a 1 m grid over the region on which Unit 07 lays out Corps machinery. Resource seams feed
// miners; belts, splitters, mergers and lifts carry crates of items between machines; machines craft over time
// from input buffers into output buffers, drawing power from poles linked back to the core or to generators; storage
// and the Core Uplink keep the stores. The simulation runs at a fixed 20 Hz. Enemy factions target `buildings`.
//
// Contract (CONTRACT.md): game.factory = { buildings, inventory, count(item), take(item, n) }; each building has
// { x, z, hp, faction, kind, damage(n) }. Events: 'built' {kind, x, z}, 'produced' {item, n}, 'destroyed' {kind, x, z, by}.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Faction } from '../game/species';
import type { Creature } from '../game/creature';
import { FDEFS, DIRS, rotXZ, footW, footD, isBelt, type FKind, type FDef, type Cost } from './defs';
import { ITEMS, ITEM_IDS, isRes, type ItemId } from './items';
import { recipesAt, type Recipe } from './recipes';
import { FactoryRender } from './render';
import { Workers } from './workers';
import { B } from '../world/blockTex';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';
import { Rand } from '../core/rand';
import { SKILL } from '../game/skills';
import { ecoStep, ecoWants, ecoRemoved } from './eco';

import { Build } from './build';
import { FactoryUI } from './ui';

const ECO = new Set<string>(['sluice', 'sprinkler', 'spreader', 'sprayer', 'planter', 'trough', 'pen', 'breeder']);

import { TICK, SPACING, STATUS_COL, STATUS_NAME, FLUIDS, type Status } from './status';
export { TICK, SPACING, STATUS_COL, STATUS_NAME, FLUIDS, type Status };
export interface BeltItem { id: ItemId; t: number }
export interface Seam { i: number; x: number; z: number; r: number; kind: 'ore' | 'crystal' | 'coal' | 'copper'; item: ItemId; amount: number; dep: number }
export interface Grid { id: number; supply: number; demand: number; cap: number; sat: number; gens: number; users: number }
type Stock = Map<ItemId, number>;
const add = (m: Stock, k: ItemId, n: number) => m.set(k, (m.get(k) ?? 0) + n);
const total = (m: Stock) => { let s = 0; for (const v of m.values()) s += v; return s; };

let NEXT = 1;
export class FBuilding {
  readonly id = NEXT++;
  readonly def: FDef;
  faction: Faction = 'veyr';
  hp: number; dead = false;
  /** world centre and base height */
  x: number; z: number; y: number;
  fw: number; fd: number;
  /** rise-in animation 0..1 */
  rise = 0;
  // production
  recipe: Recipe | null = null; auto = true;
  prog = 0; running = false;
  inBuf: Stock = new Map(); outBuf: Stock = new Map();
  store: Stock = new Map();
  status: Status = 'idle';
  /** EMA of time spent working / starved / blocked (bottlenecks) */
  util = 0; starve = 0; block = 0;
  /** animation phase (moving parts) and work level 0..1 (glow, smoke) */
  phase = 0; work = 0;
  grid = 0; sat = 1;
  operator: Creature | null = null;
  /** haulers serve high priority first; 'off' switches the machine off */
  priority: 0 | 1 | 2 = 1; on = true;
  seam = -1;
  // logistics
  items: BeltItem[] = [];
  shape: 'straight' | 'left' | 'right' = 'straight';
  rr = 0;
  liftTo: FBuilding | null = null; liftFrom: FBuilding | null = null; liftQ: { id: ItemId; t: number }[] = [];
  /** turret aim */
  aim = 0; cool = 0; target: { x: number; y: number; z: number; dead: boolean } | null = null;
  hurtT = -99; lastBy: unknown = null;
  /** the robot foundry's stall reason */
  note = '';
  /** the pole that powers it (null: the core itself; undefined: unpowered) */
  plug: FBuilding | null | undefined = undefined;
  constructor(readonly f: Factory, readonly kind: FKind, readonly cx: number, readonly cz: number, readonly r: number, y: number) {
    this.def = FDEFS[kind];
    this.fw = footW(this.def, r); this.fd = footD(this.def, r);
    this.x = cx + this.fw / 2; this.z = cz + this.fd / 2; this.y = y;
    this.hp = this.def.hp;
    const rs = this.def.station ? recipesAt(this.def.station) : [];
    if (rs.length && this.def.station !== 'robotfab') this.recipe = rs.find((q) => !q.skill || f.has(q.skill)) ?? rs[0];
  }
  get maxHp() { return this.def.hp; }
  get fwd(): [number, number] { return DIRS[this.r & 3]; }
  get right(): [number, number] { return rotXZ(1, 0, this.r); }
  /** enemies call this */
  damage(n: number, by?: unknown) {
    if (this.dead || !(n > 0)) return;
    this.hp -= n; this.hurtT = this.f.time; this.lastBy = by ?? null;
    if (this.hp <= 0) this.f.destroy(this, by);
  }
  cells(fn: (x: number, z: number) => void) { for (let j = 0; j < this.fd; j++) for (let i = 0; i < this.fw; i++) fn(this.cx + i, this.cz + j); }
  /** grid cells just outside the face in world direction d */
  edge(d: [number, number]): [number, number][] {
    const out: [number, number][] = [];
    if (d[0] === 1) for (let j = 0; j < this.fd; j++) out.push([this.cx + this.fw, this.cz + j]);
    else if (d[0] === -1) for (let j = 0; j < this.fd; j++) out.push([this.cx - 1, this.cz + j]);
    else if (d[1] === 1) for (let i = 0; i < this.fw; i++) out.push([this.cx + i, this.cz + this.fd]);
    else for (let i = 0; i < this.fw; i++) out.push([this.cx + i, this.cz - 1]);
    return out;
  }
  bufCap(id: ItemId) { const n = this.recipe?.in[id] ?? 0; return Math.max(this.def.buf ?? 20, n * 3); }
  outCap(id: ItemId) { const n = this.recipe?.out[id] ?? 0; return Math.max(this.def.buf ?? 20, n * 3); }
}

export class Factory {
  readonly g: Game;
  readonly N: number;
  /** every structure (enemies target these) */
  buildings: FBuilding[] = [];
  /** the central stores (refined items; raw ones live in the golem's hold, run.res) */
  inventory: Record<ItemId, number> = Object.fromEntries(ITEM_IDS.map((k) => [k, 0])) as Record<ItemId, number>;
  readonly grid: Int32Array; readonly fgrid: Int32Array;
  readonly byId = new Map<number, FBuilding>();
  seams: Seam[] = [];
  readonly seamAt: Int16Array;
  grids: Grid[] = [];
  readonly render: FactoryRender;
  readonly workers: Workers;
  readonly build: Build;
  readonly ui: FactoryUI;
  time = 0;
  research = 0;
  private acc = 0; private powerDirty = true; private topoDirty = true;
  /** produced / consumed per item, in 5 s buckets over the last minute */
  private bucketT = 0; private prodB: Record<string, number>[] = [{}]; private useB: Record<string, number>[] = [{}];
  /** spawnRobot from src/robots, once found */
  spawnRobot: ((game: Game, kind: string, faction: Faction, x: number, z: number) => unknown) | null = null;
  robotsTried = false;
  onChange?: () => void;

  constructor(g: Game) {
    this.g = g;
    const R = g.region, N = (this.N = R.N);
    this.grid = new Int32Array(N * N); this.fgrid = new Int32Array(N * N);
    this.seamAt = new Int16Array(N * N).fill(-1);
    this.makeSeams();
    this.render = new FactoryRender(this);
    this.workers = new Workers(this);
    this.build = new Build(this);
    this.ui = new FactoryUI(this, this.build);
    g.update$.push((dt) => { try { this.update(dt); } catch (e) { if (this.errs++ < 5) console.error('factory', e); } });
    this.findRobots();
  }
  private errs = 0;
  has(skill: string) { return !SKILL[skill] || this.g.run.skills.has(skill); }
  get hive() { return this.g.veyr; }
  get res() { return this.g.run.res; }

  // ================================================================== resource seams
  private makeSeams() {
    const R = this.g.region, N = this.N, rnd = new Rand(this.g.opts.seed * 31 + 7);
    R.deposits.forEach((d, k) => this.seams.push({ i: this.seams.length, x: d.x, z: d.z, r: d.r, kind: d.kind, item: d.kind === 'crystal' ? 'crystal' : 'ore', amount: d.amount * 4, dep: k }));
    // the factory's own surveys turn up coal and copper: two of each fairly near the landing, more further out
    const L = R.landing;
    for (const kind of ['coal', 'copper', 'coal', 'copper', 'coal', 'copper', 'coal', 'copper'] as const) {
      for (let t = 0; t < 400; t++) {
        const near = this.seams.filter((s) => s.kind === kind).length < 1;
        const x = Math.floor(near ? L.x + rnd.range(-26, 26) : rnd.range(8, N - 8)) + 0.5, z = Math.floor(near ? L.z + rnd.range(-26, 26) : rnd.range(8, N - 8)) + 0.5;
        if (x < 6 || z < 6 || x > N - 6 || z > N - 6) continue;
        if (Math.hypot(x - L.x, z - L.z) < 9) continue;
        if (R.isWater(x, z) || R.isSolid(x, z)) continue;
        let bad = false;
        for (let dz = -2; dz <= 2 && !bad; dz++) for (let dx = -2; dx <= 2; dx++) if (R.isSolid(x + dx, z + dz) || R.isWater(x + dx, z + dz)) { bad = true; break; }
        if (bad || this.seams.some((s) => Math.hypot(s.x - x, s.z - z) < 12)) continue;
        if (Math.abs(R.heightAt(x + 2, z) - R.heightAt(x - 2, z)) > 1.2 || Math.abs(R.heightAt(x, z + 2) - R.heightAt(x, z - 2)) > 1.2) continue;
        this.seams.push({ i: this.seams.length, x, z, r: 1.8, kind, item: kind === 'coal' ? 'coal' : 'copper_ore', amount: 5000, dep: -1 });
        // the ground over it shows the seam
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.hypot(dx, dz) < 2.1) { const i = (Math.floor(z) + dz) * N + Math.floor(x) + dx; R.b[i] = kind === 'coal' ? B.BASALT : B.GRAVEL; R.dirty.add(i); }
        break;
      }
    }
    for (const s of this.seams) {
      const rr = Math.ceil(s.r + 0.5);
      for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        const X = Math.floor(s.x) + dx, Z = Math.floor(s.z) + dz;
        if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
        if (Math.hypot(X + 0.5 - s.x, Z + 0.5 - s.z) <= s.r + 0.6) this.seamAt[Z * N + X] = s.i;
      }
    }
    this.g.world.terrain.flushDirty();
  }
  /** the seam under a footprint (most covered cells), or -1 */
  seamUnder(cx: number, cz: number, w: number, d: number): number {
    const cnt = new Map<number, number>();
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) { const X = cx + i, Z = cz + j; if (X < 0 || Z < 0 || X >= this.N || Z >= this.N) continue; const s = this.seamAt[Z * this.N + X]; if (s >= 0) cnt.set(s, (cnt.get(s) ?? 0) + 1); }
    let best = -1, bn = 0; for (const [s, n] of cnt) if (n > bn) { bn = n; best = s; }
    return best;
  }

  // ================================================================== stores
  /** how many of an item the base has: central stores, storage buildings, and (raw materials) the golem's hold */
  count(id: ItemId): number {
    let n = this.inventory[id] ?? 0;
    for (const b of this.buildings) if (b.def.store && b.kind !== 'barracks') n += b.store.get(id) ?? 0;
    if (isRes(id)) n += this.res[id] ?? 0;
    return Math.floor(n + 1e-6);
  }
  /** take n of an item (all or nothing): central stores first, then storage, then the hold */
  take(id: ItemId, n: number): boolean {
    if (n <= 0) return true;
    if (this.count(id) < n) return false;
    let left = n;
    const a = Math.min(left, this.inventory[id] ?? 0); this.inventory[id] -= a; left -= a;
    for (const b of this.buildings) { if (left <= 0) break; if (!b.def.store || b.kind === 'barracks') continue; const have = b.store.get(id) ?? 0, t = Math.min(left, have); if (t > 0) { b.store.set(id, have - t); left -= t; } }
    if (left > 0 && isRes(id)) this.res[id] = Math.max(0, this.res[id] - left);
    this.onChange?.();
    return true;
  }
  /** put items into the central stores (raw materials go to the hold while it has room). Returns what fit */
  put(id: ItemId, n: number, x?: number, z?: number): number {
    if (n <= 0) return 0;
    let left = n;
    if (isRes(id)) {
      const room = Math.max(0, this.hive.cap(id) - this.res[id]), t = Math.min(room, left);
      if (t > 0) { this.res[id] += t; this.hive.rate[id] += t; left -= t; this.g.emit('gather', { res: id, amt: t, x: x ?? 0, y: 0, z: z ?? 0 }); }
    }
    const room = Math.max(0, this.invCap(id) - this.inventory[id]), t = Math.min(room, left);
    this.inventory[id] += t; left -= t;
    return n - left;
  }
  /** a producer deposits output (the biotech producers, foraging workers): the nearest storage with room within 30 m
   *  of x, z, else the central stores. Returns how many were taken */
  add(id: ItemId, n: number, x?: number, z?: number): number {
    if (!(n > 0)) return 0;
    let left = n;
    if (x !== undefined && z !== undefined) {
      const near = this.buildings.filter((b) => b.def.store && b.kind !== 'barracks' && Math.hypot(b.x - x, b.z - z) < 30).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
      for (const b of near) { if (left <= 0) break; const room = Math.max(0, (b.def.store ?? 0) - total(b.store)), t = Math.min(room, left); if (t > 0) { add(b.store, id, t); left -= t; } }
    }
    if (left > 0) left -= this.put(id, left, x, z);
    if (n - left > 0) { this.stat(this.prodB, id, n - left); this.onChange?.(); }
    return n - left;
  }
  invCap(_id?: ItemId) { return 200 + 300 * this.buildings.filter((b) => b.kind === 'depot').length; }
  costLack(c: Cost): string | null {
    for (const k of Object.keys(c) as ItemId[]) { const n = c[k] ?? 0; if (n > 0 && this.count(k) < n) return `Needs ${n} ${ITEMS[k].name}`; }
    return null;
  }
  pay(c: Cost) { if (this.costLack(c)) return false; for (const k of Object.keys(c) as ItemId[]) this.take(k, c[k] ?? 0); return true; }
  refund(c: Cost, k = 1) { for (const id of Object.keys(c) as ItemId[]) { const n = Math.floor((c[id] ?? 0) * k); if (n > 0) this.put(id, n); } }

  // ================================================================== grid
  at(x: number, z: number): FBuilding | null {
    if (x < 0 || z < 0 || x >= this.N || z >= this.N) return null;
    const id = this.grid[z * this.N + x]; return id ? this.byId.get(id) ?? null : null;
  }
  foundAt(x: number, z: number): FBuilding | null {
    if (x < 0 || z < 0 || x >= this.N || z >= this.N) return null;
    const id = this.fgrid[z * this.N + x]; return id ? this.byId.get(id) ?? null : null;
  }
  /** ground height a footprint will be levelled to (the slab's top if it stands on foundations) */
  levelFor(cx: number, cz: number, w: number, d: number): number {
    const R = this.g.region; let s = 0, n = 0, fy = -1e9;
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) { const f = this.foundAt(cx + i, cz + j); if (f) fy = Math.max(fy, f.y + 0.15); s += R.cellH(cx + i, cz + j); n++; }
    if (fy > -1e8) return fy;
    return Math.max(R.water + 0.05, s / Math.max(1, n));
  }
  /** why a building cannot go here (null if it can) */
  why(kind: FKind, cx: number, cz: number, r: number, free = false): string | null {
    const def = FDEFS[kind], R = this.g.region, N = this.N, w = footW(def, r), d = footD(def, r);
    if (!free) { if (def.skill && !this.has(def.skill)) return `Needs ${SKILL[def.skill]?.name ?? def.skill} (skill tree)`; const lack = this.costLack(def.cost); if (lack) return lack; }
    if (cx < 2 || cz < 2 || cx + w > N - 2 || cz + d > N - 2) return 'Out of bounds';
    let lo = 1e9, hi = -1e9, water = 0, n = 0;
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const X = cx + i, Z = cz + j, k = Z * N + X;
      if (kind === 'found') { if (this.fgrid[k]) return 'Already floored'; }
      else if (this.grid[k]) return 'Something is already here';
      if (R.solid[k] === 1) return 'Rock in the way';
      const h = R.h[k]; lo = Math.min(lo, h); hi = Math.max(hi, h); n++;
      if (R.isWater(X + 0.5, Z + 0.5)) water++;
      const core = this.hive.core; if (core && Math.hypot(X + 0.5 - core.x, Z + 0.5 - core.z) < 2.4) return 'Too close to the core';
    }
    if (def.extract === 'water') { if (water < n * 0.5) return 'Must stand on open water'; }
    else if (water > 0 && !this.foundAt(cx, cz) && kind !== 'dam' && kind !== 'sluice' && kind !== 'pipe' && kind !== 'found') return 'No footing in water (lay a foundation)';
    if (hi - lo > (isBelt(kind) ? 2.2 : 1.8)) return 'Ground too steep (lay a foundation)';
    if (def.extract === 'node' && this.seamUnder(cx, cz, w, d) < 0) return 'Must sit over a seam (ore, copper, coal, crystal)';
    if (def.extract === 'soil') { for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) { const b = R.b[(cz + j) * N + cx + i]; if (b === B.ROCK || b === B.BASALT || b === B.SNOW) return 'Needs diggable soil'; } }
    for (const h of this.g.world.hives) if (h !== this.hive) for (const b of h.buildings) if (b.x >= cx - 1 && b.x <= cx + w + 1 && b.z >= cz - 1 && b.z <= cz + d + 1) return 'A rival structure is in the way';
    return null;
  }
  /** raise a building (pays its cost unless free); returns it */
  place(kind: FKind, cx: number, cz: number, r: number, free = false): FBuilding | null {
    if (this.why(kind, cx, cz, r, free)) return null;
    const def = FDEFS[kind];
    if (!free) this.pay(def.cost);
    const w = footW(def, r), d = footD(def, r);
    let y: number;
    if (isBelt(kind) || kind === 'splitter' || kind === 'merger') {
      this.clearFlora(cx, cz, w, d);
      const f = this.foundAt(cx, cz);
      y = f ? f.y + 0.15 : Math.max(this.g.region.water - 0.1, this.g.region.heightAt(cx + 0.5, cz + 0.5));
    } else if (def.extract === 'water') y = this.g.region.water - 0.05;
    else { y = kind === 'found' ? this.levelFor(cx, cz, w, d) : this.levelFor(cx, cz, w, d); this.flatten(cx, cz, w, d, kind === 'found' ? y : this.foundAt(cx, cz) ? -1 : y); }
    const b = new FBuilding(this, kind, cx, cz, r, y);
    if (def.extract === 'node') b.seam = this.seamUnder(cx, cz, w, d);
    this.buildings.push(b); this.byId.set(b.id, b);
    const N = this.N, R = this.g.region;
    b.cells((X, Z) => {
      const k = Z * N + X;
      if (kind === 'found') this.fgrid[k] = b.id;
      else { this.grid[k] = b.id; if (def.solid && !R.solid[k]) R.solid[k] = 2; }
    });
    if (kind === 'lift') this.pairLift(b);
    if (kind === 'sluice') b.on = false;
    def.hooks?.placed?.(b, this);
    this.topoDirty = true; this.powerDirty = true;
    this.render.add(b);
    this.g.emit('built', { kind, x: b.x, z: b.z });
    this.onChange?.();
    return b;
  }
  /** level the ground under a footprint (h < 0: keep), clear the plants off it, firm it to gravel */
  private flatten(cx: number, cz: number, w: number, d: number, h: number) {
    const R = this.g.region, N = this.N, fl = this.g.world.flora;
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const k = (cz + j) * N + cx + i;
      if (h >= 0) R.h[k] = h;
      if (R.b[k] !== B.ORE && R.b[k] !== B.CRYSTAL && this.seamAt[k] < 0) R.b[k] = B.GRAVEL;
      R.dirty.add(k);
    }
    const mx = cx + w / 2, mz = cz + d / 2, rad = Math.hypot(w, d) / 2 + 0.6;
    fl.near(mx, mz, rad, (i) => {
      const x = fl.x[i], z = fl.z[i];
      if (x >= cx - 0.2 && x <= cx + w + 0.2 && z >= cz - 0.2 && z <= cz + d + 0.2) { this.hive.ownerOf(i)?.ungraft(i); fl.remove(i); }
    });
    this.g.world.terrain.flushDirty();
    fl.reseat(mx, mz, rad + 1);
  }
  /** pull up the plants standing on a footprint */
  private clearFlora(cx: number, cz: number, w: number, d: number) {
    const fl = this.g.world.flora;
    fl.near(cx + w / 2, cz + d / 2, Math.hypot(w, d) / 2 + 0.6, (i) => {
      const x = fl.x[i], z = fl.z[i];
      if (x >= cx - 0.15 && x <= cx + w + 0.15 && z >= cz - 0.15 && z <= cz + d + 0.15) { this.hive.ownerOf(i)?.ungraft(i); fl.remove(i); }
    });
  }
  /** take a building down; refund (deconstructed) or not (destroyed) */
  remove(b: FBuilding, refund = true) {
    if (b.dead) return;
    b.dead = true;
    const N = this.N, R = this.g.region;
    b.cells((X, Z) => {
      const k = Z * N + X;
      if (b.kind === 'found') { if (this.fgrid[k] === b.id) this.fgrid[k] = 0; }
      else { if (this.grid[k] === b.id) this.grid[k] = 0; if (R.solid[k] === 2) R.solid[k] = 0; }
    });
    const i = this.buildings.indexOf(b); if (i >= 0) this.buildings.splice(i, 1);
    this.byId.delete(b.id);
    if (refund) {
      this.refund(b.def.cost, 1);
      for (const m of [b.inBuf, b.outBuf, b.store]) for (const [id, n] of m) if (id !== 'steam') this.put(id, n);
      for (const it of b.items) this.put(it.id, 1);
    }
    if (b.liftTo) b.liftTo.liftFrom = null; if (b.liftFrom) b.liftFrom.liftTo = null;
    ecoRemoved(this, b); b.def.hooks?.removed?.(b, this);
    if (b.operator) this.workers.release(b.operator);
    this.topoDirty = true; this.powerDirty = true;
    this.render.remove(b);
    this.onChange?.();
  }
  destroy(b: FBuilding, by?: unknown) {
    if (b.dead) return;
    const fx = this.g.fx;
    fx.burst(b.x, b.y + 0.8, b.z, 30, 0x6b6863, { speed: 3, up: 4, size: 4, life: 1.2, grav: 7 });
    fx.burst(b.x, b.y + 0.8, b.z, 18, 0xc9a464, { glow: true, speed: 2.5, up: 3, size: 3, life: 0.6 });
    sfx('crack', 0.6, 0.8); sfx('hit', 0.5, 0.6);
    this.remove(b, false);
    this.g.emit('destroyed', { kind: b.kind, x: b.x, z: b.z, by });
    if (b.def.hp >= 400) toast(`<b>${b.def.name}</b> destroyed`, 'warn', 2400);
  }
  /** a new lift pairs with an unpaired lift behind it (same heading, up to 6 cells) or ahead of it */
  private pairLift(b: FBuilding) {
    const [dx, dz] = b.fwd;
    for (let k = 2; k <= 7; k++) {
      const o = this.at(b.cx - dx * k, b.cz - dz * k);
      if (o && o.kind === 'lift' && o.r === b.r && !o.liftTo && !o.liftFrom) { o.liftTo = b; b.liftFrom = o; return; }
    }
    for (let k = 2; k <= 7; k++) {
      const o = this.at(b.cx + dx * k, b.cz + dz * k);
      if (o && o.kind === 'lift' && o.r === b.r && !o.liftTo && !o.liftFrom) { b.liftTo = o; o.liftFrom = b; return; }
    }
  }

  // ================================================================== recipes
  setRecipe(b: FBuilding, r: Recipe | null) {
    if (b.recipe === r) return;
    // what was loaded for the old recipe comes back to the stores
    for (const [id, n] of b.inBuf) if (n > 0) this.put(id, n);
    b.inBuf.clear(); b.prog = 0; b.running = false;
    b.recipe = r; b.auto = false;
  }
  recipeOk(r: Recipe) { return !r.skill || this.has(r.skill); }

  // ================================================================== moving items
  /** can building t take this item, arriving in world direction d (moving from the cell behind into t) */
  accepts(t: FBuilding, id: ItemId, d: [number, number]): boolean {
    if (t.dead || t.rise < 0.5) return false;
    const def = t.def, [fx, fz] = t.fwd;
    if (isBelt(t.kind)) {
      if (d[0] === -fx && d[1] === -fz) return false;
      if (t.kind === 'pipe' ? !FLUIDS.has(id) : id === 'steam') return false;
      return d[0] === fx && d[1] === fz ? this.beltRoom(t, 0) : this.beltRoom(t, t.shape === 'straight' ? 0.5 : 0);
    }
    const back = d[0] === fx && d[1] === fz;
    if (def.input === 'none') return false;
    if (def.input === 'back' && !back) return false;
    if (def.input === 'sides' && d[0] === -fx && d[1] === -fz) return false;
    if (t.kind === 'splitter' || t.kind === 'merger') return id !== 'steam' && t.items.length < 2;
    if (t.kind === 'lift') return id !== 'steam' && !!t.liftTo && t.liftQ.length < 6;
    return this.wants(t, id) > 0;
  }
  /** how many of an item a building will take right now (0: none) */
  wants(t: FBuilding, id: ItemId): number {
    if (t.dead || id === 'steam' && t.kind !== 'steamgen') return 0;
    const def = t.def;
    if (t.kind === 'depot') return Math.max(0, this.invCap(id) - this.inventory[id]) + (isRes(id) ? Math.max(0, this.hive.cap(id) - this.res[id]) : 0) > 0 ? 99 : 0;
    if (t.kind === 'barracks') return (ITEMS[id].food ?? 0) > 0 ? Math.max(0, (def.store ?? 60) - total(t.store)) : 0;
    if (ECO.has(t.kind)) return ecoWants(t, id) ? Math.max(0, (def.buf ?? 20) - (t.inBuf.get(id) ?? 0)) : 0;
    if (def.store) return Math.max(0, def.store - total(t.store));
    if (t.kind === 'steamgen') return id === 'steam' ? Math.max(0, 12 - (t.inBuf.get('steam') ?? 0)) : 0;
    if (t.kind === 'turret') return id === 'ammo' ? Math.max(0, (def.buf ?? 60) - (t.inBuf.get('ammo') ?? 0)) : 0;
    if (def.station === 'boiler' || def.station === 'lab') {
      // these pick their recipe by what they are given
      const ok = recipesAt(def.station).some((r) => r.in[id] && this.recipeOk(r));
      return ok ? Math.max(0, 10 - (t.inBuf.get(id) ?? 0)) : 0;
    }
    const r = t.recipe;
    if (!r) return 0;
    if (!r.in[id]) {
      // an untouched machine retools itself for a single-input recipe it is fed
      if (t.auto && !t.running && def.station !== 'robotfab') {
        const alt = recipesAt(def.station!).find((q) => q.in[id] && Object.keys(q.in).length === 1 && this.recipeOk(q));
        if (alt && total(t.inBuf) === 0) { t.recipe = alt; return t.bufCap(id); }
      }
      return 0;
    }
    return Math.max(0, t.bufCap(id) - (t.inBuf.get(id) ?? 0));
  }
  /** hand an item to a building (it must accept it); x, z: where it came from for the motes */
  give(t: FBuilding, id: ItemId, n = 1): number {
    if (isBelt(t.kind)) return 0;
    if (t.kind === 'depot') {
      const got = this.put(id, n, t.x, t.z);
      if (got > 0 && Math.random() < 0.3 && this.hive.core) this.g.fx.mote(t.x, t.y + 1.3, t.z, this.hive.core.x, this.hive.core.y + 1, this.hive.core.z, ITEMS[id].side, 4);
      return got;
    }
    const k = Math.min(n, this.wants(t, id)); if (k <= 0) return 0;
    if (t.def.store) add(t.store, id, k); else add(t.inBuf, id, k);
    return k;
  }
  private beltRoom(b: FBuilding, t0: number) {
    for (const it of b.items) if (Math.abs(it.t - t0) < SPACING - 1e-4) return false;
    return true;
  }
  private beltInsert(b: FBuilding, id: ItemId, t0: number) {
    const it = { id, t: t0 };
    let k = 0; while (k < b.items.length && b.items[k].t > t0) k++;
    b.items.splice(k, 0, it);
  }
  /** push one item from building `from` (cell x,z) in direction d to whatever is there */
  private pushTo(x: number, z: number, d: [number, number], id: ItemId, from: FBuilding): boolean {
    const t = this.at(x + d[0], z + d[1]);
    if (!t || t === from) return false;
    if (!this.accepts(t, id, d)) return false;
    if (isBelt(t.kind)) { const back = d[0] === t.fwd[0] && d[1] === t.fwd[1]; this.beltInsert(t, id, back || t.shape !== 'straight' ? 0 : 0.5); return true; }
    if (t.kind === 'splitter' || t.kind === 'merger') { t.items.push({ id, t: 0 }); return true; }
    if (t.kind === 'lift') { const L = Math.hypot(t.liftTo!.x - t.x, t.liftTo!.z - t.z); t.liftQ.push({ id, t: L / Math.max(0.4, FDEFS.belt1.belt! * 3) }); return true; }
    return this.give(t, id, 1) > 0;
  }

  // ================================================================== topology
  private retopo() {
    for (const b of this.buildings) {
      if (!isBelt(b.kind)) continue;
      const [fx, fz] = b.fwd, [rx, rz] = b.right;
      const feeds = (x: number, z: number, d: [number, number]) => {
        const o = this.at(x, z); if (!o || o === b) return false;
        if (isBelt(o.kind) || o.kind === 'splitter' || o.kind === 'merger' || o.kind === 'lift') {
          if (o.kind === 'splitter') return (o.fwd[0] === d[0] && o.fwd[1] === d[1]) || (o.right[0] === d[0] && o.right[1] === d[1]) || (-o.right[0] === d[0] && -o.right[1] === d[1]);
          return o.fwd[0] === d[0] && o.fwd[1] === d[1];
        }
        if (o.def.output !== 'front') return false;
        return o.fwd[0] === d[0] && o.fwd[1] === d[1];
      };
      const back = feeds(b.cx - fx, b.cz - fz, [fx, fz]);
      const left = feeds(b.cx - rx, b.cz - rz, [rx, rz]), right = feeds(b.cx + rx, b.cz + rz, [-rx, -rz]);
      b.shape = back ? 'straight' : left && !right ? 'left' : right && !left ? 'right' : 'straight';
    }
    this.topoDirty = false;
    this.render.beltsDirty = true;
  }

  // ================================================================== power
  /** the poles' web: links (for cables) and grids */
  links: [FBuilding | null, FBuilding | null][] = [];
  coreLinks: FBuilding[] = [];
  static POLE_REACH = 10.5; static PLUG_REACH = 7.5;
  private repower() {
    const poles = this.buildings.filter((b) => b.kind === 'pole');
    const core = this.hive.core;
    const parent = new Map<number, number>();
    const find = (a: number): number => { let r = a; while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!; parent.set(a, r); return r; };
    const unite = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    for (const p of poles) parent.set(p.id, p.id);
    parent.set(0, 0); // 0 = the core
    this.links = []; this.coreLinks = [];
    for (let i = 0; i < poles.length; i++) {
      const a = poles[i];
      if (core && Math.hypot(a.x - core.x, a.z - core.z) < Factory.POLE_REACH) { unite(a.id, 0); this.links.push([null, a]); }
      // each pole links to its nearest few neighbours in reach
      const near = poles.filter((o) => o !== a && Math.hypot(o.x - a.x, o.z - a.z) < Factory.POLE_REACH).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z)).slice(0, 4);
      for (const o of near) { unite(a.id, o.id); if (o.id > a.id || !near.includes(a)) this.links.push([a, o]); }
    }
    const gridOf = new Map<number, number>(), grids: Grid[] = [];
    const gid = (root: number) => { let g = gridOf.get(root); if (g === undefined) { g = grids.length + 1; gridOf.set(root, g); grids.push({ id: g, supply: 0, demand: 0, cap: 0, sat: 1, gens: 0, users: 0 }); } return g; };
    for (const b of this.buildings) {
      b.grid = 0;
      if (b.kind === 'pole') { b.grid = gid(find(b.id)); continue; }
      if (!b.def.power) continue;
      // nearest pole (or the core) within plug reach of the footprint edge
      let best = -1, bd = 1e9;
      const reach = Factory.PLUG_REACH + Math.max(b.fw, b.fd) / 2;
      if (core) { const d = Math.hypot(b.x - core.x, b.z - core.z); if (d < reach + 2 && d < bd) { bd = d; best = 0; } }
      for (const p of poles) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < reach && d < bd) { bd = d; best = p.id; } }
      b.plug = undefined;
      if (best >= 0) { b.grid = gid(find(best)); if (best === 0) this.coreLinks.push(b); b.plug = best === 0 ? null : poles.find((p) => p.id === best) ?? null; }
    }
    this.grids = grids;
    this.powerDirty = false;
    this.render.cablesDirty = true;
  }
  /** the core's own output (MW) */
  get coreMW() { return this.hive.core && !this.hive.lost ? 20 + (this.has('reactor') ? 10 : 0) : 0; }
  gridOf(b: FBuilding): Grid | null { return b.grid ? this.grids[b.grid - 1] ?? null : null; }
  private powerTick() {
    const core = this.hive.core;
    for (const g of this.grids) { g.supply = 0; g.demand = 0; g.cap = 0; g.gens = 0; g.users = 0; }
    const coreGrid = this.buildings.find((b) => b.grid && (b.kind === 'pole' ? this.links.some((l) => l[0] === null && l[1] === b) : this.coreLinks.includes(b)))?.grid ?? 0;
    if (core && coreGrid) { const g = this.grids[coreGrid - 1]; g.supply += this.coreMW; g.cap += this.coreMW; }
    for (const b of this.buildings) {
      const g = this.gridOf(b); if (!g) continue;
      const p = b.def.power;
      if (p < 0) {
        g.cap += -p; g.gens++;
        if (b.kind === 'steamgen' ? (b.inBuf.get('steam') ?? 0) > 0.01 : (b.running || b.status === 'working') && b.on) g.supply += -p;
      } else if (p > 0 && b.on) { g.users++; g.demand += b.running || b.status === 'working' ? p : p * 0.1; }
    }
    for (const g of this.grids) g.sat = g.demand <= 0 ? 1 : Math.min(1, g.supply / g.demand);
  }

  // ================================================================== tick
  update(dt: number) {
    this.ui.update(dt);
    if (dt <= 0) { this.render.update(0); return; }
    if (!this.robotsTried && this.time > 2) this.findRobots();
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= TICK) { this.acc -= TICK; this.step(TICK); }
    // visuals run every frame
    for (const b of this.buildings) {
      const w = b.status === 'working' ? 1 : 0;
      b.work += (w - b.work) * Math.min(1, dt * 3);
      b.phase += dt * b.work * (b.kind === 'turret' ? 0 : 1);
    }
    this.workers.update(dt);
    this.render.update(dt);
  }
  private step(dt: number) {
    this.time += dt;
    if (this.topoDirty) this.retopo();
    if (this.powerDirty) this.repower();
    this.powerTick();
    for (const b of this.buildings) {
      if (b.rise < 1) b.rise = Math.min(1, b.rise + dt * 2.5);
      b.sat = b.def.power > 0 ? (this.gridOf(b)?.sat ?? 0) : 1;
      if (isBelt(b.kind)) this.beltStep(b, dt);
      else if (b.kind === 'splitter' || b.kind === 'merger') this.nodeStep(b);
      else if (b.kind === 'lift') this.liftStep(b, dt);
      else if (b.kind === 'turret') this.turretStep(b, dt);
      else if (b.def.extract) this.extractStep(b, dt);
      else if (b.kind === 'steamgen') this.genStep(b, dt);
      else if (ECO.has(b.kind)) ecoStep(this, b, dt);
      else if (b.def.station) this.machineStep(b, dt);
      if (b.def.hooks?.tick) b.def.hooks.tick(b, dt, this);
      if (b.def.output === 'front' && !isBelt(b.kind) && b.kind !== 'merger' && b.kind !== 'lift') this.outStep(b);
      // bottleneck accounting
      const k = Math.min(1, dt / 20);
      b.util += ((b.status === 'working' ? 1 : 0) - b.util) * k;
      b.starve += ((b.status === 'starved' ? 1 : 0) - b.starve) * k;
      b.block += ((b.status === 'blocked' ? 1 : 0) - b.block) * k;
      // slow self-repair once out of a fight
      if (b.hp < b.maxHp && this.time - b.hurtT > 8) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.01 * dt);
    }
    // statistics buckets
    this.bucketT += dt;
    if (this.bucketT >= 5) { this.bucketT = 0; this.prodB.unshift({}); this.useB.unshift({}); if (this.prodB.length > 13) { this.prodB.pop(); this.useB.pop(); } }
  }
  private beltStep(b: FBuilding, dt: number) {
    const it = b.items; if (!it.length) return;
    const mv = (b.def.belt ?? 0.33) * dt;
    for (let k = 0; k < it.length; k++) {
      const lim = k === 0 ? 1 : it[k - 1].t - SPACING;
      let nt = Math.min(it[k].t + mv, lim);
      if (k === 0 && nt >= 1) {
        if (this.pushTo(b.cx, b.cz, b.fwd, it[0].id, b)) { it.shift(); k--; continue; }
        nt = 1;
      }
      it[k].t = Math.max(it[k].t, nt);
    }
  }
  private nodeStep(b: FBuilding) {
    if (!b.items.length) return;
    const id = b.items[0].id;
    const outs: [number, number][] = b.kind === 'splitter' ? [b.fwd, b.right, [-b.right[0], -b.right[1]]] : [b.fwd];
    for (let k = 0; k < outs.length; k++) {
      const d = outs[(b.rr + k) % outs.length];
      if (this.pushTo(b.cx, b.cz, d, id, b)) { b.items.shift(); b.rr = (b.rr + k + 1) % outs.length; return; }
    }
  }
  private liftStep(b: FBuilding, dt: number) {
    // the entry tower carries its queue across to the exit tower, which puts it out front
    if (b.liftTo) {
      for (const q of b.liftQ) q.t -= dt;
      const ex = b.liftTo;
      if (b.liftQ.length && b.liftQ[0].t <= 0 && ex.items.length < 3) ex.items.push({ id: b.liftQ.shift()!.id, t: 0 });
    }
    if (b.items.length && this.pushTo(b.cx, b.cz, b.fwd, b.items[0].id, b)) b.items.shift();
    b.status = b.liftQ.length || b.items.length ? 'working' : 'idle';
  }
  private outStep(b: FBuilding) {
    // what to put out: the output buffer (machines), or anything in storage
    const src = b.def.store ? b.store : b.outBuf;
    if (!src.size) return;
    const cells = b.edge(b.fwd);
    let sent = 0;
    for (const [id, n] of src) {
      if (n < 1 || id === 'steam' && b.kind !== 'boiler') continue;
      for (let k = 0; k < cells.length && sent < 2; k++) {
        const [x, z] = cells[(b.rr + k) % cells.length];
        if ((src.get(id) ?? 0) < 1) break;
        if (this.pushTo(x - b.fwd[0], z - b.fwd[1], b.fwd, id, b)) { src.set(id, (src.get(id) ?? 0) - 1); sent++; b.rr = (b.rr + k + 1) % cells.length; }
      }
      if (sent >= 2) break;
    }
    for (const [id, n] of src) if (n <= 1e-6) src.delete(id);
  }
  private speedOf(b: FBuilding) {
    let k = b.sat;
    if (b.operator && !b.operator.dead && this.workers.operating(b)) k *= 1 + 0.5 * this.workers.moodOf(b.operator);
    return k;
  }
  private extractStep(b: FBuilding, dt: number) {
    if (!b.on) { b.status = 'offline'; return; }
    if (b.sat <= 0.01) { b.status = 'nopower'; return; }
    let id: ItemId;
    if (b.def.extract === 'node') { const s = this.seams[b.seam]; if (!s || s.amount <= 0) { b.status = 'starved'; return; } id = s.item; }
    else id = b.def.extract === 'water' ? 'water' : 'soil';
    const have = b.outBuf.get(id) ?? 0;
    if (have >= (b.def.buf ?? 20)) { b.status = 'blocked'; return; }
    b.status = 'working'; b.running = true;
    b.prog += dt * (b.def.rate ?? 0.5) * this.speedOf(b);
    while (b.prog >= 1) {
      b.prog -= 1; add(b.outBuf, id, 1); this.stat(this.prodB, id, 1);
      if (b.def.extract === 'node') { const s = this.seams[b.seam]; s.amount -= 1; if (s.dep >= 0) { const d = this.g.region.deposits[s.dep]; if (d) d.amount = Math.max(0, d.amount - 0.25); } }
    }
  }
  private genStep(b: FBuilding, dt: number) {
    const st = b.inBuf.get('steam') ?? 0;
    if (st > 0.01) { b.inBuf.set('steam', Math.max(0, st - 0.5 * dt)); b.status = 'working'; b.running = true; }
    else { b.status = this.gridOf(b) ? 'starved' : 'idle'; b.running = false; }
  }
  private machineStep(b: FBuilding, dt: number) {
    if (!b.on) { b.status = 'offline'; b.running = false; return; }
    const st = b.def.station!;
    // boilers and labs pick their recipe by what they hold
    if ((st === 'boiler' || st === 'lab') && !b.running) {
      const r = recipesAt(st).filter((q) => this.recipeOk(q)).find((q) => Object.entries(q.in).every(([k, n]) => (b.inBuf.get(k as ItemId) ?? 0) >= (n ?? 0)));
      if (r) b.recipe = r;
    }
    const r = b.recipe;
    if (!r) { b.status = 'idle'; b.running = false; return; }
    if (b.def.power > 0 && b.sat <= 0.01) { b.status = 'nopower'; return; }
    if (!b.running) {
      // room for the results?
      for (const [k, n] of Object.entries(r.out)) if ((b.outBuf.get(k as ItemId) ?? 0) + (n ?? 0) > b.outCap(k as ItemId)) { b.status = 'blocked'; return; }
      if (r.robot && !this.spawnRobot) { b.status = 'blocked'; b.note = 'AWAITING ROBOT DESIGNS'; return; }
      for (const [k, n] of Object.entries(r.in)) if ((b.inBuf.get(k as ItemId) ?? 0) < (n ?? 0)) { b.status = 'starved'; return; }
      for (const [k, n] of Object.entries(r.in)) { b.inBuf.set(k as ItemId, (b.inBuf.get(k as ItemId) ?? 0) - (n ?? 0)); this.stat(this.useB, k as ItemId, n ?? 0); }
      b.running = true; b.prog = 0; b.note = '';
    }
    b.status = 'working';
    b.prog += (dt * this.speedOf(b)) / r.t;
    if (b.prog >= 1) {
      b.prog = 0; b.running = false;
      for (const [k, n] of Object.entries(r.out)) { add(b.outBuf, k as ItemId, n ?? 0); if (k !== 'steam') { this.stat(this.prodB, k as ItemId, n ?? 0); this.g.emit('produced', { item: k, n }); } }
      if (r.research) this.addResearch(r.research, b);
      if (r.robot) this.rollOut(b, r.robot);
    }
  }
  private turretStep(b: FBuilding, dt: number) {
    b.cool -= dt;
    const ammo = b.inBuf.get('ammo') ?? 0;
    if (b.def.power > 0 && b.sat <= 0.01) { b.status = 'nopower'; return; }
    if (ammo < 1) { b.status = 'starved'; b.target = null; return; }
    // a target: hostile creatures and enemy robots within 14 m
    const t = b.target;
    if (!t || t.dead || Math.hypot(t.x - b.x, t.z - b.z) > 14.5 || b.cool < -1) b.target = this.findTarget(b.x, b.z, 14);
    const tg = b.target;
    if (!tg) { b.status = 'idle'; return; }
    b.status = 'working';
    const want = Math.atan2(tg.x - b.x, tg.z - b.z);
    let da = want - b.aim; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    b.aim += Math.max(-dt * 4, Math.min(dt * 4, da));
    if (Math.abs(da) < 0.2 && b.cool <= 0) {
      b.cool = 0.32;
      if (Math.random() < 0.5) b.inBuf.set('ammo', ammo - 1);
      const mx = b.x + Math.sin(b.aim) * 1.3, mz = b.z + Math.cos(b.aim) * 1.3, my = b.y + 1.12;
      const fx = this.g.fx;
      fx.burst(mx, my, mz, 3, 0xe4cd98, { glow: true, speed: 1.5, up: 0.3, size: 2.6, life: 0.12 });
      fx.arc(new THREE.Vector3(mx, my, mz), new THREE.Vector3(tg.x, tg.y + 0.4, tg.z), 0.07, 0xc9a464, 0.04);
      sfx('hit', 2.2, this.g.audible(b.x, b.z) * 0.35);
      const any = tg as unknown as { damage?: (n: number, by?: unknown) => void } & Creature;
      if (typeof (any as { sp?: unknown }).sp === 'object') this.g.world.damage(any, 7, null);
      else any.damage?.(7, b);
    }
  }
  /** nearest hostile thing to a point: creatures not on our side that are hostile or roused, and enemy robots */
  findTarget(x: number, z: number, r: number): { x: number; y: number; z: number; dead: boolean } | null {
    let best: { x: number; y: number; z: number; dead: boolean } | null = null, bd = r * r;
    this.g.world.near(x, z, r, (c) => {
      if (c.dead || c.faction === 'veyr' || !c.visibleNow) return;
      if (c.faction === 'wild' && !(c.mind === 'attack' || c.mind === 'hunt' || c.aggro > 0) ) return;
      const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; }
    });
    const robots = (this.g as unknown as { robots?: { x: number; y: number; z: number; dead: boolean; faction: Faction }[] }).robots;
    if (robots) for (const u of robots) { if (u.dead || u.faction === 'veyr') continue; const d = (u.x - x) ** 2 + (u.z - z) ** 2; if (d < bd) { bd = d; best = u; } }
    return best;
  }
  private addResearch(n: number, b: FBuilding) {
    this.research += n;
    this.g.fx.burst(b.x, b.y + 2.2, b.z, 10, 0x9cc5ae, { glow: true, speed: 0.6, up: 1.4, size: 2, life: 0.9 });
    while (this.research >= 12) { this.research -= 12; this.hive.award(1, 'research filed by the lab'); }
  }
  /** the robot foundry finishes a robot and rolls it out of the door */
  private rollOut(b: FBuilding, kind: string) {
    const [fx, fz] = b.fwd, x = b.x + fx * (b.fd / 2 + 1.2), z = b.z + fz * (b.fd / 2 + 1.2);
    try {
      this.spawnRobot?.(this.g, kind, 'veyr', x, z);
      toast(`ROBOT FOUNDRY: a <b>${kind.toUpperCase()}</b> rolls out`, 'good', 2600);
      this.g.fx.burst(x, b.y + 0.6, z, 20, 0xc9a464, { glow: true, speed: 1.6, up: 2, size: 2.4, life: 0.8 });
      sfx('build', 1.2, 0.7);
    } catch (e) { console.error('spawnRobot', e); b.note = 'ROBOT DESIGN FAULT'; }
  }
  /** look for spawnRobot in src/robots (another team builds it); the foundry waits until it exists */
  findRobots() {
    this.robotsTried = true;
    const mods = import.meta.glob('../robots/*.ts');
    for (const k of Object.keys(mods)) mods[k]().then((m: unknown) => { const f = (m as { spawnRobot?: Factory['spawnRobot'] }).spawnRobot; if (typeof f === 'function' && !this.spawnRobot) this.spawnRobot = f; }).catch(() => {});
  }

  // ================================================================== statistics
  private stat(B2: Record<string, number>[], id: ItemId, n: number) { B2[0][id] = (B2[0][id] ?? 0) + n; }
  /** items per minute made and used, over the last minute (or since the start) */
  rates(): Record<ItemId, { made: number; used: number }> {
    const out = {} as Record<ItemId, { made: number; used: number }>;
    const span = Math.max(5, Math.min(60, (this.prodB.length - 1) * 5 + this.bucketT));
    for (const id of ITEM_IDS) {
      let m = 0, u = 0;
      for (const b of this.prodB) m += b[id] ?? 0;
      for (const b of this.useB) u += b[id] ?? 0;
      if (m || u) out[id] = { made: (m * 60) / span, used: (u * 60) / span };
    }
    return out;
  }
  power(): { supply: number; demand: number; cap: number; grids: number } {
    let s = 0, d = 0, c = 0;
    for (const g of this.grids) { s += Math.min(g.supply, g.demand); d += g.demand; c += g.cap; }
    return { supply: s, demand: d, cap: c, grids: this.grids.length };
  }
  /** machines that spend most of their time starved or blocked */
  bottlenecks(): FBuilding[] {
    return this.buildings.filter((b) => (b.def.station || b.def.extract) && (b.starve > 0.5 || b.block > 0.5 || b.status === 'nopower')).sort((a, b) => Math.max(b.starve, b.block) - Math.max(a.starve, a.block));
  }
  get barracks() { return this.buildings.filter((b) => b.kind === 'barracks').length; }
}
