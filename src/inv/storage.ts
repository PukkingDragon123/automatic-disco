// game.storage: every container on the region, the pod's own hold, and the routing that game.factory's put / take /
// count / add now go through. Items go to the best container that takes them (priority first, then distance), the
// pod's hold catches what has nowhere to go, the arms unload the hold into containers within reach, perishables
// spoil outside safe storage. The old raw materials stay readable: run.res becomes a live view of the hold (reading
// counts the hold by material class; writing adds the real item the gathering came from, or spends the cheapest).
import type { Game } from '../game/game';
import type { Run } from '../game/run';
import { RES, type Res } from '../game/skills';
import { ITEMS, itemDef, matItems, isRes, type ItemId } from '../factory/items';
import { B } from '../world/blockTex';
import { Container, type ContainerSave, type Stack } from './container';
import { KIND_INFO, isContainerKind, type ContainerKind } from './kinds';

/** seconds per in-game day for shelf lives */
export const DAY = 300;
/** the arms reach this far from the pod to put the hold away */
export const ARM_REACH = 13;
type Ev = 'stored' | 'removed' | 'full' | 'container' | 'change';
interface FB { id: number; kind: string; x: number; z: number; cx: number; cz: number; dead: boolean; sat: number; on: boolean; plug?: unknown; store: Map<ItemId, number>; def: { power: number } }

// ------------------------------------------------------------------ the hold travels with the run
interface RunHold { hold: Container; pend: Record<Res, number>; game: Game | null; flushQ: boolean; hint: Partial<Record<Res, { x: number; z: number; t: number }>> }
const HOLDS = new WeakMap<Run, RunHold>();
function holdOf(run: Run): RunHold {
  let h = HOLDS.get(run);
  if (h) return h;
  const hold = new Container('hold');
  [hold.W, hold.H] = [10, 6];
  h = { hold, pend: { ore: 0, carbon: 0, water: 0, soil: 0 }, game: null, flushQ: false, hint: {} };
  HOLDS.set(run, h);
  const sv = (run.factories?.['inv:hold'] as ContainerSave | undefined);
  const plain = run.res as Record<Res, number>;
  if (sv && sv.s) { hold.load(sv); [hold.W, hold.H] = [10, 6]; }
  else for (const k of RES) { const n = Math.floor(Number(plain?.[k]) || 0); if (n > 0) hold.insert(k, n); }
  installResView(run, h);
  return h;
}
/** class count in the hold */
const holdClass = (h: RunHold, r: Res) => { let n = 0; for (const s of h.hold.stacks) if (ITEMS[s.item]?.mat === r) n += s.n; return n; };
/** run.res as a view of the hold */
function installResView(run: Run, h: RunHold) {
  if ((run.res as { __inv?: boolean }).__inv) return;
  const view = new Proxy({} as Record<Res, number>, {
    get(_t, k) { if (k === '__inv') return true; if (typeof k === 'string' && (RES as readonly string[]).includes(k)) return holdClass(h, k as Res) + h.pend[k as Res]; return undefined; },
    set(_t, k, v) {
      if (typeof k !== 'string' || !(RES as readonly string[]).includes(k)) return true;
      const r = k as Res, cur = holdClass(h, r) + h.pend[r], d = (Number(v) || 0) - cur;
      if (Math.abs(d) < 1e-9) return true;
      if (d > 0) { h.pend[r] += d; if (!h.flushQ) { h.flushQ = true; queueMicrotask(() => flush(h)); } }
      else {
        let left = -d;
        const a = Math.min(left, h.pend[r]); h.pend[r] -= a; left -= a;
        for (const id of matItems(r)) { if (left < 0.999) break; left -= h.hold.remove(id, Math.ceil(left - 1e-6)); }
        if (left > 0 && left < 1) { // a fraction spent of a whole item: break one open
          for (const id of matItems(r)) if (h.hold.remove(id, 1)) { h.pend[r] += 1 - left; left = 0; break; }
        }
        if (h.game) (h.game as unknown as { storage?: Storage }).storage?.changed(h.hold);
      }
      return true;
    },
    ownKeys() { return [...RES]; },
    getOwnPropertyDescriptor(_t, k) { return typeof k === 'string' && (RES as readonly string[]).includes(k) ? { enumerable: true, configurable: true, writable: true, value: holdClass(h, k as Res) + h.pend[k as Res] } : undefined; },
    has(_t, k) { return typeof k === 'string' && (RES as readonly string[]).includes(k); },
  });
  (run as { res: Record<Res, number> }).res = view;
}
/** whole units gathered under the old names become real items in the hold */
function flush(h: RunHold) {
  h.flushQ = false;
  const st = (h.game as unknown as { storage?: Storage } | null)?.storage;
  for (const r of RES) {
    let whole = Math.floor(h.pend[r] + 1e-6);
    if (whole <= 0) continue;
    const hint = h.hint[r], at = hint && performance.now() - hint.t < 400 ? hint : null;
    let put = 0;
    while (whole > 0) {
      const id = st ? st.itemAt(r, at?.x, at?.z) : r;
      const n = h.hold.insert(id, 1);
      if (!n && id !== r && h.hold.insert(r, 1)) { put++; whole--; continue; }
      if (!n) break;
      put++; whole--;
      st?.emitStored(h.hold, id, 1);
    }
    h.pend[r] -= put + whole; // what did not fit is lost (the hold is full)
    if (whole > 0) st?.emitFull(h.hold, r);
  }
  st?.changed(h.hold);
}

// ------------------------------------------------------------------ a container's store as the factory sees it
/** FBuilding.store for a container: reads and writes go to the grid (belts, the old haul code and the save all keep
 *  working); `room(item)` is what the factory asks before it hands anything over */
export class GridStore extends Map<ItemId, number> {
  loading = false;
  constructor(readonly c: Container, private onChange: (c: Container) => void) { super(); }
  room(item: ItemId) { return this.c.passes(item) ? this.c.room(item) : 0; }
  override get(k: ItemId) { return this.c ? this.c.count(k) || undefined : undefined; }
  override has(k: ItemId) { return !!this.c && this.c.count(k) > 0; }
  override set(k: ItemId, v: number) {
    if (!this.c || this.loading) return this;
    const cur = this.c.count(k), d = Math.floor(v) - cur;
    if (d > 0) this.c.insert(k, d); else if (d < 0) this.c.remove(k, -d);
    if (d) this.onChange(this.c);
    return this;
  }
  override delete(k: ItemId) { if (!this.c) return false; const n = this.c.remove(k, this.c.count(k)); if (n) this.onChange(this.c); return n > 0; }
  override clear() { if (this.c) { this.c.stacks = []; this.c.touch(); this.onChange(this.c); } }
  private m() { const m = new Map<ItemId, number>(); if (this.c) for (const e of this.c.contents()) m.set(e.item, e.n); return m; }
  override get size() { return this.c ? new Set(this.c.stacks.map((s) => s.item)).size : 0; }
  override entries() { return this.m().entries(); }
  override keys() { return this.m().keys(); }
  override values() { return this.m().values(); }
  override [Symbol.iterator]() { return this.m()[Symbol.iterator](); }
  override forEach(fn: (v: number, k: ItemId, m: Map<ItemId, number>) => void) { this.m().forEach((v, k) => fn(v, k, this)); }
}

// ------------------------------------------------------------------ gathering: what an old resource really is
type Table = [ItemId, number][];
const TREE = new Set(['broadleaf', 'umbrella', 'palm', 'weeper', 'spike']);
const SEED_OF: Record<string, ItemId> = {
  tuft: 'seed_grass', sail: 'seed_grass', reed: 'seed_reed', lily: 'seed_reed', fern: 'spore_fern', fiddle: 'spore_fern', shrub: 'seed_shrub', rosette: 'seed_shrub',
  broadleaf: 'seed_tree', umbrella: 'seed_tree', weeper: 'seed_tree', spike: 'seed_cone', palm: 'seed_palm', coral: 'spore_fungus', crust: 'spore_fungus', fungus: 'spore_fungus',
  bulb: 'seed_bulb', barrel: 'seed_cactus', crystalbloom: 'seed_crystal', eyeflower: 'seed_flower', bloom: 'seed_flower', lure: 'seed_flower', snaptrap: 'seed_trap', pitcher: 'seed_trap', sundew: 'seed_trap',
};
function plantTable(arch: string): Table {
  const seed = SEED_OF[arch] ?? 'seed_grass';
  if (TREE.has(arch)) return [['wood', 40], ['bark', 14], ['leaves', 28], [seed, 8], [arch === 'spike' ? 'sap' : 'carbon', 6], ['fibre', 4]];
  switch (arch) {
    case 'shrub': case 'rosette': return [['leaves', 40], ['fibre', 20], ['berries', 18], [seed, 12], ['carbon', 10]];
    case 'tuft': case 'reed': case 'sail': case 'lily': return [['fibre', 50], ['leaves', 22], [seed, 18], ['carbon', 10]];
    case 'fern': case 'fiddle': return [['leaves', 55], ['fibre', 20], [seed, 18], ['carbon', 7]];
    case 'fungus': case 'coral': case 'crust': return [['mushroom', 45], [seed, 30], ['carbon', 25]];
    case 'bulb': return [['tuber', 45], ['leaves', 25], [seed, 20], ['carbon', 10]];
    case 'barrel': return [['fibre', 35], ['carbon', 40], [seed, 25]];
    case 'crystalbloom': return [['carbon', 65], [seed, 25], ['glass_bead', 10]];
    case 'snaptrap': case 'pitcher': case 'sundew': return [['leaves', 40], ['carbon', 35], [seed, 25]];
    default: return [['leaves', 40], [seed, 30], ['fibre', 30]];
  }
}
const ROCKS: Record<string, Table> = {
  meadow: [['rock_granite', 3], ['rock_limestone', 2]], jungle: [['rock_granite', 2], ['rock_sandstone', 1], ['rock_limestone', 1]],
  savanna: [['rock_sandstone', 2], ['rock_granite', 2]], marsh: [['rock_limestone', 2], ['rock_slate', 1]], highland: [['rock_slate', 2], ['rock_granite', 2]],
  tundra: [['rock_granite', 2], ['rock_slate', 2]], desert: [['rock_sandstone', 3], ['rock_limestone', 1]], crystal: [['crystal', 1], ['rock_granite', 2]],
  ashland: [['rock_basalt', 3], ['rock_obsidian', 1]], coast: [['rock_sandstone', 2], ['rock_limestone', 2]],
};

// ------------------------------------------------------------------ the store
export interface FindOpts { x?: number; z?: number; n?: number; take?: boolean; exclude?: Container | null; reach?: number }
export class Storage {
  readonly containers: Container[] = [];
  readonly hold: Container;
  private rh: RunHold;
  private byB = new Map<number, Container>();
  private handlers: Partial<Record<Ev, ((d: any) => void)[]>> = {};
  private picks = new Map<string, Map<ItemId, number>>();
  private emitting = false;
  private unloadT = 0; private decayT = 0; private selPrev: unknown = null;
  /** saved containers of this region, by building key, waiting for their building to come back */
  private pending = new Map<string, ContainerSave>();
  private counter = new Map<ContainerKind, number>();
  /** the UI opens an inventory window (set by ui/crates) */
  onOpen: ((c: Container) => void) | null = null;
  constructor(readonly g: Game) {
    this.rh = holdOf(g.run);
    this.rh.game = g;
    this.hold = this.rh.hold;
    const sv = g.run.factories?.[this.saveKey] as Record<string, ContainerSave> | undefined;
    if (sv) for (const [k, v] of Object.entries(sv)) this.pending.set(k, v);
    // old code paths gather under the old names: remember where, so the flush knows what it was
    g.on('gather', (d: { res?: Res; x?: number; z?: number }) => { if (!this.emitting && d?.res && isRes(d.res)) this.rh.hint[d.res] = { x: d.x ?? 0, z: d.z ?? 0, t: performance.now() }; });
    g.update$.push((dt) => { try { this.tick(dt); } catch (e) { if (this.errs++ < 4) console.error('storage', e); } });
  }
  private errs = 0;
  get saveKey() { return 'inv:' + this.g.opts.seed; }
  on(ev: Ev, fn: (d: any) => void) { (this.handlers[ev] ??= []).push(fn); }
  private emit(ev: Ev, d: unknown) { for (const f of this.handlers[ev] ?? []) try { f(d); } catch (e) { console.error('storage ' + ev, e); } if (ev !== 'change') this.g.emit(ev, d); }
  emitStored(c: Container, item: ItemId, n: number) { this.emit('stored', { c, item, n }); }
  emitFull(c: Container, item: ItemId) { this.emit('full', { c, item }); }
  changed(c: Container) { this.emit('change', c); }

  // ---------------------------------------------------------------- containers and their buildings
  private keyOf(b: FB) { return `${b.kind}@${b.cx},${b.cz}`; }
  /** a container building went up (its placed hook): its grid, its store adapter, its saved state if it had one */
  attach(b: FB): Container {
    const had = this.byB.get(b.id); if (had) return had;
    const kind = b.kind as ContainerKind;
    const n = (this.counter.get(kind) ?? 0) + 1; this.counter.set(kind, n);
    const c = new Container(kind, n);
    c.b = b;
    c.powered = () => !b.def.power || (b.on !== false && b.plug !== undefined && (b.sat ?? 0) > 0.3);
    const gs = new GridStore(c, (cc) => this.changed(cc));
    const sv = this.pending.get(this.keyOf(b));
    if (sv) { c.load(sv); this.pending.delete(this.keyOf(b)); gs.loading = true; queueMicrotask(() => (gs.loading = false)); c.born = 0; }
    b.store = gs;
    this.byB.set(b.id, c);
    this.containers.push(c);
    this.emit('container', { c, added: true });
    this.changed(c);
    return c;
  }
  detach(b: FB) {
    const c = this.byB.get(b.id); if (!c) return;
    this.byB.delete(b.id);
    const i = this.containers.indexOf(c); if (i >= 0) this.containers.splice(i, 1);
    this.emit('container', { c, added: false });
    this.changed(c);
  }
  containerOf(b: unknown): Container | null { return b && typeof (b as FB).id === 'number' ? this.byB.get((b as FB).id) ?? null : null; }
  /** every container including the hold (UI lists) */
  all(): Container[] { return [this.hold, ...this.containers]; }
  /** workers whose haul job is tied to this container */
  linked(c: Container): { c: { sp: { name: string }; dead: boolean }; job: string }[] {
    const ws = (this.g.factory as unknown as { workers?: { list: { c: { sp: { name: string }; dead: boolean }; job: string; target: unknown; route: { from: unknown; to: unknown } | null }[] } })?.workers?.list ?? [];
    return c.b ? ws.filter((w) => !w.c.dead && (w.target === c.b || w.route?.to === c.b || w.route?.from === c.b)) : [];
  }

  // ---------------------------------------------------------------- the container API (logistics drives this)
  canAccept(c: Container, item: ItemId) { return !(c.b?.dead) && c.takesKind(item) && c.passes(item) && c.room(item) > 0; }
  room(c: Container, item: ItemId) { return c.b?.dead || !c.passes(item) ? 0 : c.room(item); }
  contents(c: Container) { return c.contents(); }
  count(item: ItemId, c?: Container): number {
    if (c) return isRes(item) ? matItems(item).reduce((s, k) => s + c.count(k), 0) : c.count(item);
    const ids = isRes(item) ? matItems(item) : [item];
    let n = 0;
    const inv = (this.g.factory as unknown as { inventory?: Record<string, number> } | undefined)?.inventory;
    for (const k of ids) { n += inv?.[k] ?? 0; for (const ct of this.all()) n += ct.count(k); }
    if (isRes(item)) n += this.rh.pend[item];
    return Math.floor(n + 1e-6);
  }
  insert(c: Container, item: ItemId, n: number, fresh = 1): number {
    if (c.b?.dead) return 0;
    const got = c.insert(item, n, fresh);
    if (got > 0) { this.emit('stored', { c, item, n: got }); this.changed(c); }
    if (got < n) this.emit('full', { c, item });
    return got;
  }
  remove(c: Container, item: ItemId, n: number): number {
    const got = c.remove(item, n);
    if (got > 0) { this.emit('removed', { c, item, n: got }); this.changed(c); }
    return got;
  }
  /** move between two containers (keeps freshness); returns how many moved */
  move(from: Container, to: Container, item: ItemId, n: number): number {
    if (from === to) return 0;
    const k = Math.min(n, from.count(item), to.takesKind(item) ? to.room(item) : 0);
    if (k <= 0) return 0;
    const r = from.removeF(item, k); const got = to.insert(item, r.n, r.fresh);
    if (got < r.n) from.insert(item, r.n - got, r.fresh);
    if (got) { this.emit('removed', { c: from, item, n: got }); this.emit('stored', { c: to, item, n: got }); this.changed(from); this.changed(to); }
    return got;
  }
  /** a drag from one grid to another: n off stack s, put down at (x, y) turned rot (the rest goes back). Returns how many moved */
  transfer(from: Container, s: Stack, n: number, to: Container, x: number, y: number, rot: 0 | 1): number {
    n = Math.min(n, s.n);
    if (from === to || n <= 0 || to.b?.dead) return 0;
    const got = to.insertAt(s.item, n, s.fresh, x, y, rot);
    if (got <= 0) return 0;
    s.n -= got; if (s.n <= 0) from.stacks = from.stacks.filter((q) => q !== s); from.touch();
    this.emit('removed', { c: from, item: s.item, n: got }); this.emit('stored', { c: to, item: s.item, n: got });
    this.changed(from); this.changed(to);
    return got;
  }
  /** the best container to put an item in (priority, then distance), or to take it from (take: true) */
  find(item: ItemId, o: FindOpts = {}): Container | null {
    const ok = (c: Container) => c !== o.exclude && !c.b?.dead && (o.take ? c.count(item) >= (o.n ?? 1) : c.takesKind(item) && c.passes(item) && c.room(item) > 0);
    const d = (c: Container) => (o.x === undefined || o.z === undefined || !c.b ? 0 : Math.hypot(c.b.x - o.x, c.b.z - o.z));
    let best: Container | null = null, bs = -Infinity;
    for (const c of this.containers) {
      if (!ok(c)) continue;
      const dist = d(c); if (o.reach !== undefined && dist > o.reach) continue;
      // filling: the highest priority first, a container already holding the item before an empty one, then the nearest
      // taking: the lowest priority first (drain the overflow), then the nearest
      const s = o.take ? -c.priority * 1000 - dist : c.priority * 1000 + (c.count(item) > 0 ? 50 : 0) - dist;
      if (s > bs) { bs = s; best = c; }
    }
    return best;
  }

  // ---------------------------------------------------------------- what game.factory routes through
  /** store n of an item: containers (best first; within reach of x, z when given), then the pod's hold. Returns what fit */
  put(item: ItemId, n: number, x?: number, z?: number, reach = 40): number {
    n = Math.floor(n + 1e-6);
    if (n <= 0 || !ITEMS[item] || ITEMS[item].cat === 'internal') return 0;
    let left = n;
    for (let guard = 0; left > 0 && guard < 32; guard++) {
      const c = this.find(item, { x, z, reach: x !== undefined ? reach : undefined }); if (!c) break;
      const got = this.insert(c, item, left); if (!got) break;
      left -= got;
    }
    if (left > 0) left -= this.insert(this.hold, item, left);
    return n - left;
  }
  /** take n of an item, all or nothing: the central stores, the hold, then containers lowest priority first. An old
   *  material id takes any item of its class, cheapest first */
  take(item: ItemId, n: number): boolean {
    n = Math.ceil(n - 1e-6);
    if (n <= 0) return true;
    if (this.count(item) < n) return false;
    let left = n;
    const inv = (this.g.factory as unknown as { inventory?: Record<string, number> } | undefined)?.inventory;
    if (isRes(item)) { const a = Math.min(left, Math.floor(this.rh.pend[item])); this.rh.pend[item] -= a; left -= a; }
    for (const id of isRes(item) ? matItems(item) : [item]) {
      if (left <= 0) break;
      if (inv && (inv[id] ?? 0) > 0) { const a = Math.min(left, Math.floor(inv[id])); inv[id] -= a; left -= a; }
      if (left > 0) left -= this.remove(this.hold, id, left);
      const order = this.containers.filter((c) => c.count(id) > 0).sort((a, b) => a.priority - b.priority);
      for (const c of order) { if (left <= 0) break; left -= this.remove(c, id, left); }
    }
    return left <= 0;
  }
  /** what is missing to pay a cost (null if it can be paid) */
  lack(c: Partial<Record<ItemId, number>>): string | null {
    for (const [k, n] of Object.entries(c)) if ((n ?? 0) > 0 && this.count(k) < (n ?? 0)) return `Needs ${n} ${isRes(k) ? k : itemDef(k).name}`;
    return null;
  }
  pay(c: Partial<Record<ItemId, number>>): boolean { if (this.lack(c)) return false; for (const [k, n] of Object.entries(c)) if ((n ?? 0) > 0) this.take(k, n ?? 0); return true; }

  // ---------------------------------------------------------------- gathering real items
  /** a real item gathered by the pod's arms or drones: into the hold, motes to the pod, the old 'gather' event */
  gather(item: ItemId, n: number, x: number, y: number, z: number): number {
    const got = this.insert(this.hold, item, n);
    const core = this.g.veyr?.core;
    if (got > 0 && core) for (let k = 0; k < Math.min(4, got); k++) this.g.fx.mote(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.4, core.x, core.y + 1.2, core.z, ITEMS[item]?.side ?? 0x888888, 4 + Math.random() * 2);
    const mat = ITEMS[item]?.mat;
    if (got > 0) { this.emitting = true; try { this.g.emit('gather', { res: mat ?? null, item, amt: got, x, y, z }); } finally { this.emitting = false; } }
    return got;
  }
  /** a weighted pick that deals a table out in proportion (no streaks of one item) */
  private deal(key: string, t: Table): ItemId {
    let m = this.picks.get(key); if (!m) this.picks.set(key, (m = new Map()));
    let tot = 0; for (const [, w] of t) tot += w;
    let n = 0; for (const v of m.values()) n += v;
    let best = t[0][0], bd = -Infinity;
    for (const [id, w] of t) { const d = (w / tot) * (n + 1) - (m.get(id) ?? 0) + w * 1e-4; if (d > bd) { bd = d; best = id; } }
    m.set(best, (m.get(best) ?? 0) + 1);
    return ITEMS[best] ? best : (t.find(([id]) => ITEMS[id])?.[0] ?? 'carbon');
  }
  /** what an old resource gathered at (x, z) really is */
  itemAt(res: Res, x?: number, z?: number): ItemId {
    const g = this.g, R = g.region;
    if (x === undefined || z === undefined || !R) return res;
    const biome = R.biome?.key ?? 'meadow';
    if (res === 'ore') {
      const k = R.depositAt(x, z, 2.5);
      if (k >= 0) { const d = R.deposits[k] as { item?: string; kind: string }; return d.item && ITEMS[d.item] ? d.item : d.kind === 'crystal' ? 'crystal' : 'ore'; }
      const seams = (g.factory as unknown as { seams?: { x: number; z: number; r: number; item: ItemId }[] } | undefined)?.seams;
      const s = seams?.find((q) => Math.hypot(q.x - x, q.z - z) < q.r + 2.5); if (s) return s.item;
      return this.deal('ore:' + biome, [['ore', 4], ...(ROCKS[biome] ?? ROCKS.meadow).map(([id, w]) => [id, w * 2] as [ItemId, number])]);
    }
    if (res === 'water') { const ry = R.riverAt(x, z); return R.heightAt(x, z) < R.water && !(ry > 0) && (biome === 'coast' || R.heightAt(x, z) < R.water - 0.6) ? 'brine' : 'water'; }
    if (res === 'soil') {
      const N = R.N, bk = R.b[Math.min(N - 1, Math.max(0, Math.floor(z))) * N + Math.min(N - 1, Math.max(0, Math.floor(x)))];
      switch (bk) {
        case B.SAND: return this.deal('soil:sand', [['sand', 8], ['soil', 1], ['salt', biome === 'desert' || biome === 'coast' ? 1 : 0]].filter((e) => (e[1] as number) > 0) as Table);
        case B.CLAY: return this.deal('soil:clay', [['clay', 7], ['soil', 2]]);
        case B.MUD: return this.deal('soil:mud', biome === 'marsh' ? [['peat', 4], ['clay', 3], ['soil', 3]] : [['clay', 4], ['soil', 5], ['topsoil', 1]]);
        case B.GRAVEL: return this.deal('soil:gravel', [['gravel', 7], ['sand', 2], ['soil', 1]]);
        case B.GRASS: case B.LITTER: return this.deal('soil:grass', [['topsoil', 5], ['soil', 4], ['compost', 1]]);
        case B.ROCK: case B.BASALT: return this.deal('soil:rock', [['gravel', 6], ...(ROCKS[biome] ?? ROCKS.meadow)]);
        case B.CRATER: return this.deal('soil:crater', [['ash', 5], ['rock_obsidian', 1], ['gravel', 3]]);
        default: return this.deal('soil:' + biome, biome === 'ashland' ? [['ash', 4], ['soil', 5], ['saltpetre', 1]] : biome === 'desert' ? [['sand', 5], ['soil', 4], ['saltpetre', 1]] : [['soil', 8], ['topsoil', 1], ['gravel', 1]]);
      }
    }
    // carbon: the plant (or carcass) it came from
    const fl = g.world?.flora;
    if (fl) {
      let bi = -1, bd = 9;
      fl.near(x, z, 3, (i, d2) => { if (d2 < bd) { bd = d2; bi = i; } });
      if (bi >= 0) { const sp = fl.species[fl.sp[bi]]; if (sp) return this.deal('plant:' + sp.arch, plantTable(sp.arch)); }
    }
    const dead = g.world?.creatures?.find((c) => c.dead && Math.hypot(c.x - x, c.z - z) < 3);
    if (dead) return this.deal('carcass', [['meat', 34], ['bone', 18], ['hide', 10], ['tissue', 12], ['blood_sample', 6], ['carbon', 20]]);
    if (R.isWater(x, z)) return this.deal('sea', [['kelp', 7], ['carbon', 3]]);
    return this.deal('carbon:' + biome, [['carbon', 6], ['leaves', 3], ['fibre', 2]]);
  }

  // ---------------------------------------------------------------- the tick
  private tick(dt: number) {
    if (this.rh.game !== this.g) this.rh.game = this.g;
    // spoilage, a few times a second
    this.decayT += dt;
    if (this.decayT >= 0.5) {
      const step = this.decayT; this.decayT = 0;
      for (const c of this.all()) {
        if (!c.stacks.length) continue;
        const spoiled = c.decay(step, DAY, false);
        for (const s of spoiled) { if (s.into) c.insert(s.into, s.n, 1); this.emit('removed', { c, item: s.item, n: s.n, spoiled: true }); }
        if (spoiled.length) this.changed(c);
      }
    }
    // the arms put the hold away into containers within reach of the pod
    this.unloadT -= dt;
    const core = this.g.veyr?.core;
    if (this.unloadT <= 0 && core && this.hold.stacks.length && this.containers.length) {
      this.unloadT = 1.2;
      for (const s of [...this.hold.stacks].sort((a, b) => b.n - a.n)) {
        const to = this.find(s.item, { x: core.x, z: core.z, reach: ARM_REACH });
        if (!to) continue;
        if (this.move(this.hold, to, s.item, Math.min(s.n, 12)) > 0) {
          if (to.b && Math.random() < 0.6) this.g.fx.mote(core.x, core.y + 1.4, core.z, to.b.x, (to.b as unknown as { y?: number }).y ?? core.y + 0.6, to.b.z, ITEMS[s.item]?.side ?? 0x888888, 3);
          break;
        }
      }
    }
    // a container picked in the works opens its window
    const sel = (this.g.factory as unknown as { render?: { sel?: unknown } } | undefined)?.render?.sel ?? null;
    if (sel !== this.selPrev) { this.selPrev = sel; const c = this.containerOf(sel); if (c) this.onOpen?.(c); }
  }

  // ---------------------------------------------------------------- save (written into the run with the works)
  save() {
    const run = this.g.run;
    const o: Record<string, ContainerSave> = {};
    for (const c of this.containers) if (c.b && !c.b.dead) o[this.keyOf(c.b as unknown as FB)] = c.save();
    for (const [k, v] of this.pending) o[k] = v;
    run.factories[this.saveKey] = o;
    run.factories['inv:hold'] = this.hold.save();
  }
}

/** game.storage (idempotent): call before the works are built, so containers coming back from a save attach */
export function attachStorage(g: Game): Storage {
  const gg = g as unknown as { storage?: Storage };
  if (!gg.storage) gg.storage = new Storage(g);
  return gg.storage;
}
export { isContainerKind, KIND_INFO, type Stack };
