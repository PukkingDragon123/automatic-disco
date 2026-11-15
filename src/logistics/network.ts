// The logistics network: the node map's model, and the authority for what the workers carry. Nodes are the REAL
// things of the colony (the pod, buildings, containers, ore deposits, harvest fields, construction sites) plus the
// logic nodes the player wires between them. A wire is a ROUTE: an item filter, an amount rule, a priority, a list of
// conditions and the workers who run it. Routes through logic nodes compile into CHAINS (physical source -> logic ->
// physical destination); the workers (src/factory/workers.ts) ask `jobFor(worker)` for the best chain they may run,
// walk it, and report back with `picked` / `delivered`. Everything moved is counted (flow per route, the discipline
// experience that unlocks the logic nodes one tier at a time).
import type { Game } from '../game/game';
import type { Factory, FBuilding, Seam } from '../factory/factory';
import type { Worker } from '../factory/workers';
import { ITEMS, isRes, type ItemId } from '../factory/items';
import { isBelt } from '../factory/defs';
import { daylight } from '../game/daylight';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';
import { featureLock, tierOf, FEATURES, TIER_XP, mod } from './unlocks';
import { storageOf, holdBox, type Box } from './storage';
import type { Sites, Site } from './sites';
import { itemFor, registerChains } from './recipes';
import { FDEFS } from '../factory/defs';

declare module '../factory/factory' { interface Factory { sites: Sites; logistics: Logistics } }
declare module '../game/game' { interface Game { logistics: Logistics } }

export type PhysKind = 'pod' | 'building' | 'container' | 'deposit' | 'field' | 'site';
export type LogicKind = 'split' | 'merge' | 'buffer' | 'counter' | 'gate' | 'timer' | 'sensor';
export type NodeKind = PhysKind | LogicKind;
export const LOGIC: LogicKind[] = ['split', 'merge', 'buffer', 'counter', 'gate', 'timer', 'sensor'];
export const isLogic = (k: NodeKind): k is LogicKind => (LOGIC as string[]).includes(k);
export const LOGIC_NAME: Record<LogicKind, string> = { split: 'SPLITTER', merge: 'MERGER', buffer: 'BUFFER', counter: 'COUNTER', gate: 'GATE', timer: 'TIMER', sensor: 'SENSOR' };

export type CondK = 'srcAbove' | 'srcBelow' | 'dstAbove' | 'dstBelow' | 'day' | 'night' | 'powered' | 'signal';
export interface Cond { k: CondK; item?: ItemId; n?: number; node?: string; not?: boolean }
export const COND_NAME: Record<CondK, string> = {
  srcAbove: 'SOURCE HOLDS MORE THAN', srcBelow: 'SOURCE HOLDS LESS THAN', dstAbove: 'TARGET HOLDS MORE THAN', dstBelow: 'TARGET HOLDS LESS THAN',
  day: 'ONLY IN DAYLIGHT', night: 'ONLY AT NIGHT', powered: 'ONLY WHEN THE TARGET HAS POWER', signal: 'ONLY WHILE SIGNAL IS ON',
};
export type AmountMode = 'all' | 'keep' | 'batch' | 'rate';
export const AMOUNT_NAME: Record<AmountMode, string> = { all: 'EVERYTHING', keep: 'KEEP TARGET STOCKED TO', batch: 'IN FULL BATCHES OF', rate: 'NO MORE THAN (PER MIN)' };

export interface LogicCfg {
  /** splitter: weight per out route id; merger: weight per in route id */
  w?: Record<number, number>;
  /** buffer high and low marks; counter target; sensor threshold */
  hi?: number; lo?: number; n?: number; th?: number;
  /** the item a buffer, counter or sensor watches (else the chain's) */
  item?: ItemId;
  /** timer: open `on` seconds in every `period` */
  period?: number; on?: number;
  /** gate conditions */
  conds?: Cond[];
  /** sensor: the node it reads, what, and the comparison */
  probe?: string; what?: 'count' | 'working' | 'power'; cmp?: '>' | '<';
  /** counter: reset each dawn */
  daily?: boolean;
}
export interface LNode {
  id: string; kind: NodeKind; ref: number;
  /** map position (world metres); `tidy` once the player has moved it */
  x: number; z: number; tidy?: boolean;
  name: string;
  cfg: LogicCfg;
  /** live: signal out (sensor, counter), open (gate, timer, buffer), count (counter), sent per route (split, merge) */
  sig: boolean; open: boolean; count: number; sent: Record<number, number>;
}
export interface Route {
  id: number; from: string; to: string;
  filter: ItemId[];
  amount: { mode: AmountMode; n: number };
  /** 1 (low) .. 5 (urgent) */
  priority: number;
  conds: Cond[];
  /** dedicated workers (creature ids); `pool`: free haulers may also run it */
  workers: number[]; pool: boolean; on: boolean;
  // live
  moved: number; hist: number[]; inflight: number; note: string; tokens: number; lastT: number;
}
export interface Field { id: number; x: number; z: number; r: number; name: string }
export interface Chain { src: LNode; dst: LNode; path: Route[]; logic: LNode[] }
export type Act = 'carry' | 'dig' | 'harvest' | 'build';
export interface Job {
  chain: Chain | null; src: LNode | null; dst: LNode; item: ItemId; n: number; act: Act;
  site?: Site;
  /** the bill line a site supply run pays (a material class when the item is a real one of that class) */
  need?: ItemId;
  /** reserved at the target (released on delivery or abort) */
  resv: number;
  /** the load is in the worker's arms (the source reservation is over) */
  held?: boolean;
}
export interface Template { name: string; nodes: { k: NodeKind; kind?: string; item?: ItemId; dx: number; dz: number; r?: number; cfg?: LogicCfg; logic?: boolean }[]; routes: { a: number; b: number; filter: ItemId[]; amount: Route['amount']; priority: number; conds: Cond[] }[]; builtin?: boolean }
export interface LogiSave { v: 1; nodes: [string, number, number][]; logic: { id: string; kind: LogicKind; x: number; z: number; cfg: LogicCfg; name: string }[]; fields: Field[]; routes: Omit<Route, 'hist' | 'inflight' | 'note' | 'tokens' | 'lastT'>[]; xp: number; seq: number; auto: boolean; tut: number; templates: Template[] }

/** the program's standard chain: dig ferrite into an ore bunker, feed a smelter, clear the ingots into a steel bin */
function ironIngot(): Template {
  const ore = itemFor('ore') ?? 'ore', ingot = itemFor('iron_ingot') ?? 'iron_ingot';
  const bunker = FDEFS.st_bunker ? 'st_bunker' : 'crate', bin = FDEFS.st_bin ? 'st_bin' : 'crate';
  return {
    name: 'IRON INGOT', builtin: true,
    nodes: [{ k: 'deposit', item: ore, dx: 0, dz: 0 }, { k: 'container', kind: bunker, dx: 5, dz: 2 }, { k: 'building', kind: 'smelter', dx: 10, dz: 3 }, { k: 'container', kind: bin, dx: 15, dz: 4 }],
    routes: [
      { a: 0, b: 1, filter: [ore], amount: { mode: 'all', n: 20 }, priority: 3, conds: [] },
      { a: 1, b: 2, filter: [ore], amount: { mode: 'keep', n: 20 }, priority: 4, conds: [] },
      { a: 2, b: 3, filter: [ingot], amount: { mode: 'all', n: 20 }, priority: 3, conds: [] },
    ],
  };
}
/** buildings that are not logistics endpoints (belts carry themselves; poles and decoration hold nothing) */
const NOT_NODE = new Set<string>(['pole', 'wall', 'found', 'dam', 'lift', 'splitter', 'merger', 'floodlight', 'flagpole', 'fence', 'planterbox', 'signpost', 'bench', 'bunkhouse', 'grav_pole']);
const D2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export class Logistics {
  nodes: LNode[] = [];
  routes: Route[] = [];
  fields: Field[] = [];
  templates: Template[] = [];
  /** items delivered by routes, ever: the logistics discipline (unlocks the logic nodes) */
  xp = 0;
  /** free haulers guess their own work when no route wants them (the old behaviour); the node map can switch it off */
  auto = true;
  /** tutorial step (0 = not started, 99 = done) */
  tut = 0;
  private byId = new Map<string, LNode>();
  private seq = 1;
  private chainsCache: Chain[] | null = null;
  private resv = new Map<string, number>();
  private srcResv = new Map<string, number>();
  private syncT = 0; private histT = 0; private diagT = 0; private dawn = true;
  /** live hauls, for the map's packets: worker -> job */
  readonly live = new Map<Worker, Job>();
  sites!: Sites;
  onChange: (() => void)[] = [];
  readonly f: Factory;
  constructor(f: Factory) {
    this.f = f;
    registerChains();
    this.templates.push(ironIngot());
    this.sync(true);
  }
  get g(): Game { return this.f.g; }
  node(id: string) { return this.byId.get(id) ?? null; }
  changed() { this.chainsCache = null; for (const fn of this.onChange) fn(); }
  unlocked(feature: string) { return featureLock(this.g, feature, this.xp).ok; }
  lockWhy(feature: string) { return featureLock(this.g, feature, this.xp).why; }
  get tier() { return tierOf(this.xp); }

  // ================================================================== nodes
  /** rebuild the physical nodes from the world: buildings, containers, seams, fields, the pod, construction sites */
  sync(force = false) {
    const f = this.f, keep = new Map(this.nodes.map((n) => [n.id, n])), out: LNode[] = [];
    const add = (id: string, kind: NodeKind, ref: number, x: number, z: number, name: string) => {
      const had = keep.get(id);
      if (had) { had.kind = kind; had.ref = ref; had.name = name; if (!had.tidy) { had.x = x; had.z = z; } out.push(had); return had; }
      const n: LNode = { id, kind, ref, x, z, name, cfg: {}, sig: false, open: true, count: 0, sent: {} };
      out.push(n); return n;
    };
    const core = f.hive.core;
    if (core) add('pod', 'pod', 0, core.x, core.z, 'POD STORES');
    for (const b of f.buildings) {
      if (b.dead || isBelt(b.kind) || NOT_NODE.has(b.kind)) continue;
      const box = storageOf(this.g, b);
      add('b:' + b.id, box || b.def.store && b.kind !== 'barracks' && b.kind !== 'messhall' ? 'container' : 'building', b.id, b.x, b.z, b.def.name.toUpperCase());
    }
    for (const s of f.seams) {
      if (s.amount <= 0) continue;
      // deposits near the colony only (the map is of the colony, not the planet), and any already wired
      const wired = this.routes.some((r) => r.from === 's:' + s.i);
      if (!wired && !this.nearColony(s.x, s.z, 34)) continue;
      add('s:' + s.i, 'deposit', s.i, s.x, s.z, (ITEMS[s.item]?.name ?? s.item).toUpperCase());
    }
    for (const fl of this.fields) add('f:' + fl.id, 'field', fl.id, fl.x, fl.z, fl.name);
    if (this.sites) for (const s of this.sites.list) add('site:' + s.id, 'site', s.id, s.cx + s.fw / 2, s.cz + s.fd / 2, `SITE: ${s.def.name.toUpperCase()}`);
    for (const n of this.nodes) if (isLogic(n.kind)) out.push(n);
    const before = this.nodes.length;
    this.nodes = out;
    this.byId = new Map(out.map((n) => [n.id, n]));
    // routes whose ends are gone go with them
    const dead = this.routes.filter((r) => !this.byId.has(r.from) || !this.byId.has(r.to));
    if (dead.length) { this.routes = this.routes.filter((r) => !dead.includes(r)); }
    if (force || dead.length || before !== out.length) this.changed();
  }
  private nearColony(x: number, z: number, r: number) {
    const core = this.f.hive.core;
    if (core && D2(core.x, core.z, x, z) < r) return true;
    for (const b of this.f.buildings) if (!isBelt(b.kind) && b.kind !== 'pole' && D2(b.x, b.z, x, z) < 14) return true;
    return false;
  }
  addLogic(kind: LogicKind, x: number, z: number): LNode | null {
    const lk = featureLock(this.g, 'logic.' + kind, this.xp);
    if (!lk.ok) { sfx('deny'); toast(`<b>${LOGIC_NAME[kind]}</b> is not learned yet: ${lk.why.toLowerCase()}`, 'warn', 2200); return null; }
    const n: LNode = { id: 'L:' + this.seq++, kind, ref: 0, x, z, tidy: true, name: LOGIC_NAME[kind], cfg: this.defaultCfg(kind), sig: false, open: true, count: 0, sent: {} };
    this.nodes.push(n); this.byId.set(n.id, n); this.changed();
    return n;
  }
  private defaultCfg(kind: LogicKind): LogicCfg {
    switch (kind) {
      case 'buffer': return { hi: 40, lo: 10 };
      case 'counter': return { n: 50, daily: false };
      case 'timer': return { period: 120, on: 40 };
      case 'gate': return { conds: [{ k: 'day' }] };
      case 'sensor': return { what: 'count', cmp: '<', th: 20 };
      default: return { w: {} };
    }
  }
  removeNode(id: string) {
    const n = this.byId.get(id); if (!n) return;
    if (n.kind === 'field') this.fields = this.fields.filter((f) => 'f:' + f.id !== id);
    if (isLogic(n.kind) || n.kind === 'field') { this.nodes = this.nodes.filter((x) => x !== n); this.byId.delete(id); }
    this.routes = this.routes.filter((r) => r.from !== id && r.to !== id);
    this.changed();
  }
  addField(x: number, z: number, r = 8, name?: string): LNode {
    const id = this.seq++;
    const fl: Field = { id, x, z, r, name: name ?? `FIELD ${String.fromCharCode(64 + ((this.fields.length % 26) + 1))}` };
    this.fields.push(fl);
    this.sync(true);
    return this.byId.get('f:' + id)!;
  }
  fieldOf(n: LNode) { return this.fields.find((f) => f.id === n.ref) ?? null; }
  moveNode(n: LNode, x: number, z: number) { n.x = x; n.z = z; n.tidy = true; for (const fn of this.onChange) fn(); }

  // ================================================================== routes
  canWire(a: LNode, b: LNode): string | null {
    if (a === b) return 'A route needs two ends';
    if (a.kind === 'site' || a.kind === 'sensor') return a.kind === 'site' ? 'A construction site is a target, not a source' : 'A sensor sends a signal, not items';
    if (b.kind === 'deposit' || b.kind === 'field') return 'Deposits and fields are sources: nothing can be delivered into them';
    if (b.kind === 'sensor') return 'Pick the node a sensor reads in its own panel';
    if (this.routes.some((r) => r.from === a.id && r.to === b.id)) return 'Those two are already wired';
    const outs = this.routes.filter((r) => r.from === a.id).length, ins = this.routes.filter((r) => r.to === b.id).length;
    if (a.kind !== 'split' && isLogic(a.kind) && outs >= 1) return `A ${LOGIC_NAME[a.kind as LogicKind].toLowerCase()} has one output (use a splitter)`;
    if (a.kind === 'split' && outs >= 4) return 'A splitter deals to four outputs at most';
    if (b.kind !== 'merge' && isLogic(b.kind) && ins >= 1) return `A ${LOGIC_NAME[b.kind as LogicKind].toLowerCase()} has one input (use a merger)`;
    // no loops through logic
    const seen = new Set<string>(), stack = [b.id];
    while (stack.length) { const id = stack.pop()!; if (id === a.id) return 'That would close a loop'; if (seen.has(id)) continue; seen.add(id); const n = this.byId.get(id); if (n && isLogic(n.kind)) for (const r of this.routes) if (r.from === id) stack.push(r.to); }
    return null;
  }
  addRoute(from: string, to: string, patch: Partial<Route> = {}): Route | null {
    const a = this.byId.get(from), b = this.byId.get(to);
    if (!a || !b) return null;
    const why = this.canWire(a, b); if (why) { sfx('deny'); toast(why, 'warn', 1800); return null; }
    const r: Route = { id: this.seq++, from, to, filter: this.guessFilter(a, b), amount: { mode: 'all', n: 20 }, priority: 3, conds: [], workers: [], pool: true, on: true, moved: 0, hist: [0, 0, 0, 0, 0, 0], inflight: 0, note: '', tokens: 0, lastT: 0, ...patch };
    this.routes.push(r);
    this.changed();
    return r;
  }
  /** a sensible first filter: what the source makes that the target can use */
  guessFilter(a: LNode, b: LNode): ItemId[] {
    if (isLogic(a.kind) || isLogic(b.kind)) return [];
    const src = this.offers(a), want = src.filter((id) => this.accepts(b, id));
    return want.length === 1 ? want : want.length && want.length <= 3 ? want : [];
  }
  setRoute(id: number, patch: Partial<Route>) { const r = this.routes.find((x) => x.id === id); if (!r) return; Object.assign(r, patch); this.changed(); }
  removeRoute(id: number) { this.routes = this.routes.filter((r) => r.id !== id); for (const [w, j] of this.live) if (j.chain?.path.some((r) => r.id === id)) this.abort(w); this.changed(); }
  /** items/min a route moved over the last minute */
  flow(id: number) { const r = this.routes.find((x) => x.id === id); return r ? r.hist.reduce((a, b) => a + b, 0) : 0; }

  /** every physical source -> logic... -> physical destination path */
  chains(): Chain[] {
    if (this.chainsCache) return this.chainsCache;
    const out: Chain[] = [];
    const walk = (src: LNode, at: LNode, path: Route[], logic: LNode[]) => {
      for (const r of this.routes) {
        if (r.from !== at.id) continue;
        const n = this.byId.get(r.to); if (!n || path.includes(r)) continue;
        if (isLogic(n.kind)) { if (logic.length < 8) walk(src, n, [...path, r], [...logic, n]); }
        else out.push({ src, dst: n, path: [...path, r], logic });
      }
    };
    for (const n of this.nodes) if (!isLogic(n.kind) && this.routes.some((r) => r.from === n.id)) walk(n, n, [], []);
    this.chainsCache = out;
    return out;
  }

  // ================================================================== physical endpoints
  bld(n: LNode): FBuilding | null { return n.kind === 'building' || n.kind === 'container' ? this.f.byId.get(n.ref) ?? null : null; }
  seam(n: LNode): Seam | null { return n.kind === 'deposit' ? this.f.seams[n.ref] ?? null : null; }
  site(n: LNode): Site | null { return n.kind === 'site' ? this.sites?.list.find((s) => s.id === n.ref) ?? null : null; }
  pos(n: LNode): [number, number] {
    const b = this.bld(n); if (b) return [b.x, b.z];
    if (n.kind === 'pod') { const c = this.f.hive.core; if (c) return [c.x, c.z]; }
    if (n.kind === 'deposit') { const s = this.seam(n); if (s) return [s.x, s.z]; }
    if (n.kind === 'field') { const fl = this.fieldOf(n); if (fl) return [fl.x, fl.z]; }
    if (n.kind === 'site') { const s = this.site(n); if (s) return [s.cx + s.fw / 2, s.cz + s.fd / 2]; }
    return [n.x, n.z];
  }
  /** what a building holds to give away */
  private outOf(b: FBuilding): Map<ItemId, number> { return b.def.store && b.kind !== 'barracks' ? b.store : b.outBuf; }
  /** what a node can hand out right now */
  stock(n: LNode, id: ItemId): number {
    switch (n.kind) {
      case 'pod': { const h = holdBox(this.g); return Math.floor((this.f.inventory[id] ?? 0) + (h ? h.count(id) : isRes(id) ? this.f.res[id] ?? 0 : 0)); }
      case 'building': case 'container': {
        const b = this.bld(n); if (!b) return 0;
        const box = storageOf(this.g, b); if (box) return box.count(id);
        return Math.floor(this.outOf(b).get(id) ?? 0);
      }
      case 'deposit': { const s = this.seam(n); return s && s.item === id && !s.drill ? Math.floor(s.amount) : 0; }
      case 'field': return this.fieldYields(n).includes(id) ? 999 : 0;
      default: return 0;
    }
  }
  /** what a node offers (item ids) */
  offers(n: LNode): ItemId[] {
    switch (n.kind) {
      case 'pod': { const h = holdBox(this.g), inv = Object.entries(this.f.inventory).filter(([, v]) => v >= 1).map(([k]) => k); return [...new Set(inv.concat(h ? h.items() : (['ore', 'carbon', 'water', 'soil'] as ItemId[]).filter((k) => (this.f.res[k] ?? 0) >= 1)))]; }
      case 'building': case 'container': {
        const b = this.bld(n); if (!b) return [];
        const box = storageOf(this.g, b); if (box) return box.items();
        const m = this.outOf(b), ids = [...m.entries()].filter(([, v]) => v >= 1).map(([k]) => k);
        // what it will make (so a route can be wired before the first cycle)
        if (b.recipe) for (const k of Object.keys(b.recipe.out)) if (!ids.includes(k) && k !== 'steam') ids.push(k);
        const s = b.def.extract === 'node' ? this.f.seams[b.seam] : null; if (s && !ids.includes(s.item)) ids.push(s.item);
        return ids;
      }
      case 'deposit': { const s = this.seam(n); return s ? [s.item] : []; }
      case 'field': return this.fieldYields(n);
      default: return [];
    }
  }
  /** what a field's plants give a worker with a blade */
  fieldYields(_n: LNode): ItemId[] {
    const out: ItemId[] = [];
    for (const k of ['wood', 'fibre', 'leaves', 'fruit', 'seeds', 'resin']) { const id = itemFor(k); if (id) out.push(id); }
    if (!out.length) out.push('carbon');
    if (!out.includes('fruit') && ITEMS.fruit) out.push('fruit');
    return out;
  }
  /** will the node take this item at all */
  accepts(n: LNode, id: ItemId): boolean {
    if (n.kind === 'pod') return true;
    if (n.kind === 'site') { const s = this.site(n); return !!s && (s.need[this.sites.needKey(s, id)] ?? 0) > 0; }
    const b = this.bld(n); if (!b) return false;
    const box = storageOf(this.g, b); if (box) return box.room(id) > 0 || box.count(id) > 0;
    if (b.def.store && b.kind !== 'barracks' && b.kind !== 'messhall') return true;
    if (b.recipe && b.recipe.in[id]) return true;
    return this.f.wants(b, id) > 0;
  }
  /** room for an item right now (before reservations) */
  room(n: LNode, id: ItemId): number {
    switch (n.kind) {
      case 'pod': { const f = this.f, h = holdBox(this.g); if (h) return h.room(id); return Math.max(0, f.invCap(id) - (f.inventory[id] ?? 0)) + (isRes(id) ? Math.max(0, f.hive.cap(id) - (f.res[id] ?? 0)) : 0); }
      case 'site': { const s = this.site(n); if (!s) return 0; const k = this.sites.needKey(s, id); return Math.max(0, (s.need[k] ?? 0) - (s.got[k] ?? 0) - (s.resv[k] ?? 0)); }
      case 'building': case 'container': {
        const b = this.bld(n); if (!b) return 0;
        const box = storageOf(this.g, b); if (box) return box.room(id);
        return Math.max(0, Math.floor(this.f.wants(b, id)));
      }
      default: return 0;
    }
  }
  /** how much of an item a node holds (conditions, keep-stocked) */
  level(n: LNode, id: ItemId): number {
    switch (n.kind) {
      case 'pod': return this.stock(n, id);
      case 'site': { const s = this.site(n); return s ? s.got[id] ?? 0 : 0; }
      case 'building': case 'container': {
        const b = this.bld(n); if (!b) return 0;
        const box = storageOf(this.g, b); if (box) return box.count(id);
        return Math.floor((b.store.get(id) ?? 0) + (b.inBuf.get(id) ?? 0) + (b.outBuf.get(id) ?? 0));
      }
      case 'deposit': return this.stock(n, id);
      default: return 0;
    }
  }
  take(n: LNode, id: ItemId, k: number): number {
    if (k <= 0) return 0;
    switch (n.kind) {
      case 'pod': {
        const f = this.f, h = holdBox(this.g); let left = k;
        const a = Math.min(left, Math.floor(f.inventory[id] ?? 0)); if (a > 0) { f.inventory[id] -= a; left -= a; }
        if (left > 0 && h) left -= h.take(id, left);
        else if (left > 0 && isRes(id)) { const b = Math.min(left, Math.floor(f.res[id] ?? 0)); f.res[id] -= b; left -= b; }
        if (k - left > 0) f.onChange?.();
        return k - left;
      }
      case 'building': case 'container': {
        const b = this.bld(n); if (!b) return 0;
        const box = storageOf(this.g, b); if (box) return box.take(id, k);
        const m = this.outOf(b), have = Math.floor(m.get(id) ?? 0), t = Math.min(have, k);
        if (t > 0) m.set(id, (m.get(id) ?? 0) - t);
        return t;
      }
      default: return 0;
    }
  }
  give(n: LNode, id: ItemId, k: number): number {
    if (k <= 0) return 0;
    switch (n.kind) {
      case 'pod': { const h = holdBox(this.g); return h ? h.give(id, k) : this.f.put(id, k); }
      case 'site': { const s = this.site(n); return s ? this.sites.deliver(s, id, k) : 0; }
      case 'building': case 'container': {
        const b = this.bld(n); if (!b) return 0;
        const box = storageOf(this.g, b); if (box) return box.give(id, k);
        return this.f.give(b, id, k);
      }
      default: return 0;
    }
  }
  powered(n: LNode): boolean {
    const b = this.bld(n); if (!b) return true;
    if (b.def.power <= 0) return true;
    return b.status !== 'nopower' && (this.f.gridOf(b)?.sat ?? 0) > 0.4;
  }

  // ================================================================== conditions and logic
  private condOk(c: Cond, ch: Chain | null, item: ItemId | null): boolean {
    const id = c.item ?? item;
    let v: boolean;
    switch (c.k) {
      case 'srcAbove': v = !!ch && !!id && this.stock(ch.src, id) > (c.n ?? 0); break;
      case 'srcBelow': v = !!ch && !!id && this.stock(ch.src, id) < (c.n ?? 0); break;
      case 'dstAbove': v = !!ch && !!id && this.level(ch.dst, id) > (c.n ?? 0); break;
      case 'dstBelow': v = !!ch && !!id && this.level(ch.dst, id) < (c.n ?? 0); break;
      case 'day': v = daylight.k > 0.35; break;
      case 'night': v = daylight.k <= 0.35; break;
      case 'powered': v = !ch || this.powered(ch.dst); break;
      case 'signal': v = !!c.node && !!this.byId.get(c.node)?.sig; break;
      default: v = true;
    }
    return c.not ? !v : v;
  }
  /** conditions that do not depend on the item: checked once per chain */
  private chainOpen(ch: Chain): string | null {
    for (const r of ch.path) if (!r.on) return 'SWITCHED OFF';
    for (const n of ch.logic) {
      if ((n.kind === 'gate' || n.kind === 'timer' || n.kind === 'counter') && !n.open) return `${LOGIC_NAME[n.kind as LogicKind]} CLOSED`;
    }
    return null;
  }
  /** item-dependent checks for a chain: filter, conditions, buffers */
  private itemOk(ch: Chain, id: ItemId): string | null {
    for (const r of ch.path) if (r.filter.length && !r.filter.includes(id)) return 'FILTER';
    for (const r of ch.path) for (const c of r.conds) if (!this.condOk(c, ch, id)) return 'CONDITION FALSE';
    for (const n of ch.logic) if (n.kind === 'buffer') {
      const it = n.cfg.item ?? id, lv = this.level(ch.dst, it) + (this.resv.get(ch.dst.id + '|' + it) ?? 0);
      if (lv >= (n.cfg.hi ?? 40)) n.open = false; else if (lv <= (n.cfg.lo ?? 10)) n.open = true;
      if (!n.open) return 'BUFFER FULL';
    }
    return null;
  }
  /** the logic nodes' own clocks: timers, gates, sensors, counters */
  private logicTick(dt: number) {
    const t = this.f.time;
    const day = daylight.k > 0.35;
    for (const n of this.nodes) {
      switch (n.kind) {
        case 'timer': { const P = Math.max(5, n.cfg.period ?? 120), on = Math.min(P, Math.max(1, n.cfg.on ?? 40)); n.open = (t % P) < on; n.sig = n.open; break; }
        case 'gate': n.open = (n.cfg.conds ?? []).every((c) => this.condOk(c, this.gateChain(n), c.item ?? null)); n.sig = n.open; break;
        case 'sensor': {
          const p = n.cfg.probe ? this.byId.get(n.cfg.probe) : null; let v = 0;
          if (p) { if (n.cfg.what === 'working') { const b = this.bld(p); v = b && b.status === 'working' ? 1 : 0; } else if (n.cfg.what === 'power') v = this.powered(p) ? 1 : 0; else v = n.cfg.item ? this.level(p, n.cfg.item) : 0; }
          n.count = v;
          n.sig = n.cfg.what === 'working' || n.cfg.what === 'power' ? (n.cfg.cmp === '<' ? v < 0.5 : v > 0.5) : n.cfg.cmp === '>' ? v > (n.cfg.th ?? 0) : v < (n.cfg.th ?? 0);
          break;
        }
        case 'counter': n.open = n.count < (n.cfg.n ?? 50); n.sig = !n.open; break;
        default: break;
      }
    }
    // dawn: daily counters reset
    if (day && !this.dawn) for (const n of this.nodes) if (n.kind === 'counter' && n.cfg.daily) n.count = 0;
    this.dawn = day;
    void dt;
  }
  /** the first chain through a gate (its src/dst conditions read that chain) */
  private gateChain(n: LNode): Chain | null { return this.chains().find((c) => c.logic.includes(n)) ?? null; }

  // ================================================================== jobs
  /** is this worker one a route may use: dedicated to it, or a free hauler and the route takes the pool */
  private mayRun(w: Worker, ch: Chain): boolean {
    const id = w.c.id;
    if (ch.path.some((r) => r.workers.includes(id))) return true;
    if (this.dedicated(w)) return false;
    return w.job === 'haul' && ch.path.every((r) => r.pool);
  }
  dedicated(w: Worker) { return this.routes.some((r) => r.workers.includes(w.c.id)); }
  /** the amount one trip may move on this chain for this item (0: none now) */
  private amount(ch: Chain, id: ItemId, cap: number): number {
    const key = ch.dst.id + '|' + id, sk = ch.src.id + '|' + id;
    let n = Math.min(cap, this.room(ch.dst, id) - (this.resv.get(key) ?? 0));
    if (ch.src.kind !== 'deposit' && ch.src.kind !== 'field') n = Math.min(n, this.stock(ch.src, id) - (this.srcResv.get(sk) ?? 0));
    const last = ch.path[ch.path.length - 1], first = ch.path[0];
    for (const r of [first, last]) {
      const a = r.amount;
      if (a.mode === 'keep') n = Math.min(n, a.n - this.level(ch.dst, id) - (this.resv.get(key) ?? 0));
      else if (a.mode === 'batch') { if (ch.src.kind !== 'deposit' && ch.src.kind !== 'field' && this.stock(ch.src, id) - (this.srcResv.get(sk) ?? 0) < Math.min(a.n, cap)) return 0; n = Math.min(n, a.n); }
      else if (a.mode === 'rate') n = Math.min(n, Math.floor(r.tokens));
    }
    for (const lg of ch.logic) if (lg.kind === 'counter') n = Math.min(n, (lg.cfg.n ?? 50) - lg.count);
    return Math.max(0, Math.floor(n));
  }
  /** the best job for a worker now (reserves it), or null */
  jobFor(w: Worker, cap: number): Job | null {
    const c = w.c;
    let best: { ch: Chain; id: ItemId; n: number; score: number } | null = null;
    for (const ch of this.chains()) {
      if (!this.mayRun(w, ch)) continue;
      if (this.chainOpen(ch)) continue;
      if (ch.src.kind === 'deposit') { const s = this.seam(ch.src); if (!s || s.drill || s.amount < 1) continue; }
      const items = this.offers(ch.src);
      for (const id of items) {
        if (id === 'steam') continue;
        if (this.itemOk(ch, id)) continue;
        if (!this.accepts(ch.dst, id)) continue;
        const n = this.amount(ch, id, cap);
        if (n < 1) continue;
        const [sx, sz] = this.pos(ch.src), [dx, dz] = this.pos(ch.dst);
        const pri = Math.max(...ch.path.map((r) => r.priority));
        const ded = ch.path.some((r) => r.workers.includes(c.id)) ? 400 : 0;
        // splitters and mergers: favour the branch that is behind its share
        let share = 0;
        for (const lg of ch.logic) if (lg.kind === 'split' || lg.kind === 'merge') {
          const r = lg.kind === 'split' ? ch.path.find((p) => p.from === lg.id) : ch.path.find((p) => p.to === lg.id);
          if (!r) continue;
          const wt = Math.max(0.1, lg.cfg.w?.[r.id] ?? 1), tot = Object.values(lg.sent).reduce((a, b) => a + b, 0) + 1;
          const wsum = this.routes.filter((x) => (lg.kind === 'split' ? x.from === lg.id : x.to === lg.id)).reduce((a, x) => a + Math.max(0.1, lg.cfg.w?.[x.id] ?? 1), 0);
          share += ((wt / wsum) - (lg.sent[r.id] ?? 0) / tot) * 300;
        }
        const score = pri * 1000 + ded + share - D2(c.x, c.z, sx, sz) - D2(sx, sz, dx, dz) * 0.5 + n * 2;
        if (!best || score > best.score) best = { ch, id, n, score };
      }
    }
    if (best) {
      const { ch, id, n } = best;
      const act: Act = ch.src.kind === 'deposit' ? 'dig' : ch.src.kind === 'field' ? 'harvest' : 'carry';
      const job: Job = { chain: ch, src: ch.src, dst: ch.dst, item: id, n, act, resv: n };
      this.reserve(job, 1);
      for (const r of ch.path) { r.inflight++; if (r.amount.mode === 'rate') r.tokens = Math.max(0, r.tokens - n); }
      this.live.set(w, job);
      return job;
    }
    // construction: supply a site, or work on one (free haulers and the builders' pool)
    if (!this.dedicated(w) && this.sites) {
      const j = this.sites.jobFor(w, cap);
      if (j) { this.reserve(j, 1); this.live.set(w, j); return j; }
    }
    return null;
  }
  reserve(j: Job, s: 1 | -1) {
    if (j.act === 'build') return;
    const k = j.dst.id + '|' + j.item;
    this.resv.set(k, Math.max(0, (this.resv.get(k) ?? 0) + s * j.resv));
    if (j.src && j.act === 'carry' && !j.held) { const sk = j.src.id + '|' + j.item; this.srcResv.set(sk, Math.max(0, (this.srcResv.get(sk) ?? 0) + s * j.n)); }
  }
  /** the worker picked up what it could at the source (the source reservation ends) */
  picked(w: Worker, n: number) {
    const j = this.live.get(w); if (!j) return;
    if (j.src && j.act === 'carry' && !j.held) { const sk = j.src.id + '|' + j.item; this.srcResv.set(sk, Math.max(0, (this.srcResv.get(sk) ?? 0) - j.n)); }
    j.held = true;
    if (n < j.n) { const k = j.dst.id + '|' + j.item; this.resv.set(k, Math.max(0, (this.resv.get(k) ?? 0) - (j.n - n))); j.resv = n; }
    j.n = n; j.act = j.act === 'build' ? 'build' : 'carry';
  }
  /** the load reached the target: count it everywhere it passed */
  delivered(w: Worker, n: number) {
    const j = this.live.get(w); if (!j) return;
    this.live.delete(w);
    const k = j.dst.id + '|' + j.item; this.resv.set(k, Math.max(0, (this.resv.get(k) ?? 0) - j.resv));
    if (!j.chain) return;
    for (const r of j.chain.path) { r.moved += n; r.hist[0] += n; r.inflight = Math.max(0, r.inflight - 1); r.lastT = this.f.time; }
    for (const lg of j.chain.logic) {
      if (lg.kind === 'counter') lg.count += n;
      if (lg.kind === 'split') { const r = j.chain.path.find((p) => p.from === lg.id); if (r) lg.sent[r.id] = (lg.sent[r.id] ?? 0) + n; }
      if (lg.kind === 'merge') { const r = j.chain.path.find((p) => p.to === lg.id); if (r) lg.sent[r.id] = (lg.sent[r.id] ?? 0) + n; }
    }
    if (n > 0) this.gain(n);
  }
  /** the job fell through (the worker got hungry, the source ran dry, a node vanished) */
  abort(w: Worker) {
    const j = this.live.get(w); if (!j) return;
    this.live.delete(w);
    this.reserve(j, -1);
    if (j.chain) for (const r of j.chain.path) r.inflight = Math.max(0, r.inflight - 1);
    if (j.site) this.sites.release(j);
  }
  private gain(n: number) {
    const t0 = this.tier;
    this.xp += n;
    const t1 = this.tier;
    if (t1 > t0) {
      const got = FEATURES.filter((f) => f.tier === t1).map((f) => f.name);
      toast(`LOGISTICS DISCIPLINE ${['', 'I', 'II', 'III', 'IV', 'V'][t1]}: <b>${got.join(', ')}</b> learned`, 'good', 4200);
      sfx('done', 1, 0.7);
      this.changed();
    }
  }
  /** the next tier's progress, for the map's meter */
  nextTier(): { tier: number; at: number; need: number; names: string[] } | null {
    const t = this.tier; if (t >= TIER_XP.length - 1) return null;
    return { tier: t + 1, at: this.xp - TIER_XP[t], need: TIER_XP[t + 1] - TIER_XP[t], names: FEATURES.filter((f) => f.tier === t + 1).map((f) => f.name) };
  }

  // ================================================================== tick
  update(dt: number) {
    if (dt <= 0) return;
    this.syncT -= dt; this.histT += dt; this.diagT -= dt;
    if (this.syncT <= 0) { this.syncT = 1; this.sync(); }
    if (this.histT >= 10) { this.histT = 0; for (const r of this.routes) { r.hist.unshift(0); r.hist.length = 6; } }
    for (const r of this.routes) if (r.amount.mode === 'rate') r.tokens = Math.min(Math.max(r.amount.n, 1) * 2, r.tokens + (r.amount.n / 60) * dt * mod(this.g, 'worker.speed'));
    this.logicTick(dt);
    for (const [w, j] of this.live) if (w.c.dead || w.job === 'idle' || !this.byId.has(j.dst.id) && !j.site) this.abort(w);
    if (this.diagT <= 0) { this.diagT = 1; this.diagnose(); }
  }
  /** why each route is or is not moving (the map shows it on the wire) */
  private diagnose() {
    const chains = this.chains();
    const haulers = this.f.workers.list.filter((w) => !w.c.dead && w.job === 'haul');
    for (const r of this.routes) {
      const chs = chains.filter((c) => c.path.includes(r));
      if (!chs.length) { r.note = 'NOT CONNECTED'; continue; }
      if (r.inflight > 0) { r.note = ''; continue; }
      let note = '';
      for (const ch of chs) {
        const closed = this.chainOpen(ch); if (closed) { note = closed; continue; }
        const can = haulers.some((w) => this.mayRun(w, ch));
        const items = this.offers(ch.src).filter((id) => id !== 'steam' && (!r.filter.length || r.filter.includes(id)));
        if (!items.length) { note = 'NOTHING AT SOURCE'; continue; }
        let why = 'TARGET FULL';
        for (const id of items) {
          const it = this.itemOk(ch, id); if (it) { why = it === 'FILTER' ? 'FILTER MISMATCH' : it; continue; }
          if (!this.accepts(ch.dst, id)) { why = 'TARGET REFUSES ITEM'; continue; }
          const n = this.amount(ch, id, 99);
          if (n < 1) { why = r.amount.mode === 'batch' ? 'WAITING FOR A FULL BATCH' : r.amount.mode === 'keep' ? 'TARGET STOCKED' : r.amount.mode === 'rate' ? 'RATE LIMIT' : ch.src.kind !== 'deposit' && this.stock(ch.src, id) < 1 ? 'NOTHING AT SOURCE' : 'TARGET FULL'; continue; }
          why = can ? '' : r.workers.length ? 'WORKERS BUSY' : 'NO WORKER ASSIGNED';
          break;
        }
        note = why;
        if (!why) break;
      }
      r.note = note;
    }
  }

  // ================================================================== templates
  saveTemplate(name: string, ids: string[]): Template | null {
    const ns = ids.map((id) => this.byId.get(id)).filter((n): n is LNode => !!n && n.kind !== 'site');
    if (ns.length < 2) return null;
    const [ox, oz] = this.pos(ns[0]);
    const nodes: Template['nodes'] = ns.map((n) => {
      const [x, z] = isLogic(n.kind) ? [n.x, n.z] : this.pos(n);
      const b = this.bld(n);
      return { k: n.kind, kind: b?.kind, item: this.seam(n)?.item, dx: Math.round(x - ox), dz: Math.round(z - oz), r: b?.r, cfg: isLogic(n.kind) ? JSON.parse(JSON.stringify(n.cfg)) : undefined, logic: isLogic(n.kind) };
    });
    const idx = new Map(ns.map((n, i) => [n.id, i]));
    const routes = this.routes.filter((r) => idx.has(r.from) && idx.has(r.to)).map((r) => ({ a: idx.get(r.from)!, b: idx.get(r.to)!, filter: [...r.filter], amount: { ...r.amount }, priority: r.priority, conds: JSON.parse(JSON.stringify(r.conds)) }));
    const t: Template = { name: name.toUpperCase().slice(0, 28), nodes, routes };
    this.templates = this.templates.filter((x) => x.name !== t.name);
    this.templates.push(t);
    this.changed();
    return t;
  }
  /** lay a template at a world point: existing matching nodes are reused, missing buildings become construction
   *  sites, deposits are the nearest seam of the same item; returns what it could not place */
  applyTemplate(t: Template, x: number, z: number): string[] {
    const made: (LNode | null)[] = [], miss: string[] = [];
    const f = this.f;
    // a chain that starts at a deposit is laid beside the nearest matching seam
    const t0 = t.nodes[0];
    if (t0?.k === 'deposit') {
      const s = f.seams.filter((q) => q.item === t0.item && q.amount > 0 && !q.drill).sort((a, b) => D2(a.x, a.z, x, z) - D2(b.x, b.z, x, z))[0];
      if (s) { x = s.x - t0.dx; z = s.z - t0.dz; }
    }
    for (const tn of t.nodes) {
      const wx = x + tn.dx, wz = z + tn.dz;
      if (tn.logic) { const n = this.addLogic(tn.k as LogicKind, wx, wz); if (n && tn.cfg) n.cfg = JSON.parse(JSON.stringify(tn.cfg)); made.push(n); continue; }
      if (tn.k === 'pod') { made.push(this.byId.get('pod') ?? null); continue; }
      if (tn.k === 'deposit') {
        const s = f.seams.filter((q) => q.item === tn.item && q.amount > 0 && !q.drill).sort((a, b) => D2(a.x, a.z, wx, wz) - D2(b.x, b.z, wx, wz))[0];
        if (s) { this.sync(true); made.push(this.byId.get('s:' + s.i) ?? null); } else { made.push(null); miss.push(`no ${(ITEMS[tn.item ?? '']?.name ?? 'matching').toLowerCase()} deposit`); }
        continue;
      }
      if (tn.k === 'field') { made.push(this.addField(wx, wz)); continue; }
      // a building: reuse a free one of the same kind close by, else lay a construction site
      const near = this.nodes.find((n) => (n.kind === 'building' || n.kind === 'container') && this.bld(n)?.kind === tn.kind && D2(...this.pos(n), wx, wz) < 6 && !made.includes(n));
      if (near) { made.push(near); continue; }
      const s = tn.kind ? this.sites?.placeNear(tn.kind, Math.floor(wx), Math.floor(wz), tn.r ?? 0) : null;
      if (s) { this.sync(true); made.push(this.byId.get('site:' + s.id) ?? null); } else { made.push(null); miss.push(`no room for ${tn.kind}`); }
    }
    for (const r of t.routes) {
      const a = made[r.a], b = made[r.b]; if (!a || !b) continue;
      if (this.canWire(a, b)) continue;
      this.addRoute(a.id, b.id, { filter: [...r.filter], amount: { ...r.amount }, priority: r.priority, conds: JSON.parse(JSON.stringify(r.conds)) });
    }
    return miss;
  }
  /** a construction site became a building: its wires follow it */
  siteDone(site: Site, b: FBuilding) {
    const from = 'site:' + site.id, to = 'b:' + b.id;
    this.sync(true);
    const n = this.byId.get(to), old = this.byId.get(from);
    if (n && old?.tidy) { n.x = old.x; n.z = old.z; n.tidy = true; }
    let moved = false;
    for (const r of this.routes) { if (r.to === from) { r.to = to; moved = true; } if (r.from === from) { r.from = to; moved = true; } }
    this.sync(true);
    if (moved) this.changed();
  }

  // ================================================================== save
  save(): LogiSave {
    return {
      v: 1, xp: Math.floor(this.xp), seq: this.seq, auto: this.auto, tut: this.tut,
      nodes: this.nodes.filter((n) => n.tidy && !isLogic(n.kind)).map((n) => [n.id, Math.round(n.x * 10) / 10, Math.round(n.z * 10) / 10]),
      logic: this.nodes.filter((n) => isLogic(n.kind)).map((n) => ({ id: n.id, kind: n.kind as LogicKind, x: n.x, z: n.z, cfg: n.cfg, name: n.name })),
      fields: this.fields,
      routes: this.routes.map(({ hist, inflight, note, tokens, lastT, ...r }) => { void hist; void inflight; void note; void tokens; void lastT; return r; }),
      templates: this.templates.filter((t) => !t.builtin),
    };
  }
  load(s: LogiSave, bmap?: Map<number, number>) {
    if (!s || s.v !== 1) return;
    this.xp = s.xp ?? 0; this.seq = Math.max(this.seq, s.seq ?? 1); this.auto = s.auto ?? true; this.tut = s.tut ?? 0;
    this.fields = s.fields ?? [];
    this.templates = [...this.templates.filter((t) => t.builtin), ...(s.templates ?? [])];
    // building ids change between sessions: bmap maps the saved id to today's
    const remap = (id: string) => { if (!bmap || !id.startsWith('b:')) return id; const n = bmap.get(Number(id.slice(2))); return n !== undefined ? 'b:' + n : id; };
    for (const l of s.logic ?? []) this.nodes.push({ id: l.id, kind: l.kind, ref: 0, x: l.x, z: l.z, tidy: true, name: l.name, cfg: l.cfg, sig: false, open: true, count: 0, sent: {} });
    this.sync(true);
    for (const [id, x, z] of s.nodes ?? []) { const n = this.byId.get(remap(id)); if (n) { n.x = x; n.z = z; n.tidy = true; } }
    this.routes = (s.routes ?? []).map((r) => ({ ...r, from: remap(r.from), to: remap(r.to), hist: [0, 0, 0, 0, 0, 0], inflight: 0, note: '', tokens: 0, lastT: 0 }));
    this.sync(true);
  }
}
export type { Box };
