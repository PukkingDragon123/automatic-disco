// A container's grid: W x H cells; every stack is one item kind lying on the grid, its footprint the item's size
// (turned when rot = 1), holding up to the item's stack limit. Inserting tops up matching stacks first, then lays
// new ones in the first free spot (row by row, upright then turned). Perishables carry a freshness (1 fresh .. 0
// spoiled); merging stacks averages it, taking takes the stalest first. Pure logic: no three.js, no DOM.
import { itemDef, ITEMS, type ItemId } from '../factory/items';
import { KIND_INFO, type ContainerKind, type KindInfo, type LogoId, type PaintId } from './kinds';

export interface Stack { item: ItemId; n: number; x: number; y: number; rot: 0 | 1; fresh: number }
export type SortKey = 'type' | 'name' | 'count' | 'value' | 'fresh';
export interface ContainerSave { k: ContainerKind; l: string; g: LogoId; c: PaintId; p: number; a: ItemId[]; d: ItemId[]; s: [ItemId, number, number, number, number, number][] }
const GROUP_ORDER = ['bio', 'seed', 'specimen', 'earth', 'mineral', 'fluid', 'refined', 'part'];

let NEXT_ID = 1;
export class Container {
  readonly id = NEXT_ID++;
  readonly info: KindInfo;
  W: number; H: number;
  stacks: Stack[] = [];
  label: string; logo: LogoId; color: PaintId;
  /** 1 (last resort) .. 5 (fill first) */
  priority = 3;
  /** filters: when allow is non-empty only those go in; deny never does */
  allow: ItemId[] = []; deny: ItemId[] = [];
  /** bumps on every change (renderers and caches key off it) */
  ver = 0;
  /** the building it stands in (set by the storage), and whether it has power (freezers keep cold only when on) */
  b: { x: number; z: number; dead: boolean; sat?: number; on?: boolean; id: number } | null = null;
  powered = () => true;
  /** shown in the crate HUD from this time (pop-in animation) */
  born = performance.now();
  private roomCache = new Map<ItemId, number>(); private roomVer = -1;
  constructor(readonly kind: ContainerKind, n = 1) {
    this.info = KIND_INFO[kind];
    [this.W, this.H] = this.info.grid;
    this.label = kind === 'hold' ? 'POD HOLD' : `${this.info.short} ${String(n).padStart(2, '0')}`;
    this.logo = this.info.logo; this.color = this.info.color;
  }
  touch() { this.ver++; }
  /** a stack's footprint, turned or not */
  dims(item: ItemId, rot: 0 | 1): [number, number] { const s = itemDef(item).size; return rot ? [s[1], s[0]] : [s[0], s[1]]; }
  /** cell -> stack index (-1 free) */
  occ(ignore?: Stack): Int16Array {
    const o = new Int16Array(this.W * this.H).fill(-1);
    this.stacks.forEach((s, i) => {
      if (s === ignore) return;
      const [w, h] = this.dims(s.item, s.rot);
      for (let y = s.y; y < s.y + h; y++) for (let x = s.x; x < s.x + w; x++) if (x < this.W && y < this.H) o[y * this.W + x] = i;
    });
    return o;
  }
  private free(o: Int16Array, x: number, y: number, w: number, h: number) {
    if (x < 0 || y < 0 || x + w > this.W || y + h > this.H) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (o[j * this.W + i] >= 0) return false;
    return true;
  }
  /** can `item` lie at (x, y) turned rot (ignoring one stack: the one being moved) */
  fits(item: ItemId, x: number, y: number, rot: 0 | 1, ignore?: Stack) { const [w, h] = this.dims(item, rot); return this.free(this.occ(ignore), x, y, w, h); }
  private spot(o: Int16Array, item: ItemId): { x: number; y: number; rot: 0 | 1 } | null {
    const s = itemDef(item).size;
    for (const rot of (s[0] === s[1] ? [0] : [0, 1]) as (0 | 1)[]) {
      const [w, h] = rot ? [s[1], s[0]] : [s[0], s[1]];
      for (let y = 0; y + h <= this.H; y++) for (let x = 0; x + w <= this.W; x++) if (this.free(o, x, y, w, h)) return { x, y, rot };
    }
    return null;
  }
  private mark(o: Int16Array, item: ItemId, x: number, y: number, rot: 0 | 1, v: number) { const [w, h] = this.dims(item, rot); for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) o[j * this.W + i] = v; }

  // ---------------------------------------------------------------- acceptance
  /** the kind takes this sort of thing (by tag) */
  takesKind(item: ItemId) {
    if (this.kind === 'hold') return !!ITEMS[item] && ITEMS[item].cat !== 'internal';
    const tags = itemDef(item).tags; return tags.some((t) => this.info.accepts.includes(t));
  }
  /** the player's filters let it in */
  passes(item: ItemId) { return !this.deny.includes(item) && (!this.allow.length || this.allow.includes(item)); }
  /** why it would refuse an item (null: it takes it, room permitting) */
  why(item: ItemId): string | null {
    if (!this.takesKind(item)) return `A ${this.info.name.toLowerCase()} does not take ${itemDef(item).name.toLowerCase()}`;
    if (!this.passes(item)) return 'Its filter keeps that out';
    return null;
  }
  /** how many more of an item fit */
  room(item: ItemId): number {
    if (this.roomVer !== this.ver) { this.roomCache.clear(); this.roomVer = this.ver; }
    let r = this.roomCache.get(item);
    if (r !== undefined) return r;
    const lim = itemDef(item).stack;
    r = 0;
    for (const s of this.stacks) if (s.item === item) r += Math.max(0, lim - s.n);
    const o = this.occ();
    for (let k = 0; k < this.W * this.H; k++) { const sp = this.spot(o, item); if (!sp) break; this.mark(o, item, sp.x, sp.y, sp.rot, 999); r += lim; }
    this.roomCache.set(item, r);
    return r;
  }
  count(item?: ItemId) { let n = 0; for (const s of this.stacks) if (!item || s.item === item) n += s.n; return n; }
  /** fraction of cells covered */
  fill() { let c = 0; for (const s of this.stacks) { const [w, h] = this.dims(s.item, s.rot); c += w * h; } return c / (this.W * this.H); }
  /** merged contents, biggest first */
  contents(): { item: ItemId; n: number; fresh: number }[] {
    const m = new Map<ItemId, { n: number; f: number }>();
    for (const s of this.stacks) { const e = m.get(s.item) ?? { n: 0, f: 0 }; e.f = (e.f * e.n + s.fresh * s.n) / Math.max(1, e.n + s.n); e.n += s.n; m.set(s.item, e); }
    return [...m.entries()].map(([item, e]) => ({ item, n: e.n, fresh: e.f })).sort((a, b) => b.n - a.n);
  }

  // ---------------------------------------------------------------- moving items
  /** put up to n in (matching stacks first, then new stacks); returns how many went in. Ignores the filters
   *  (callers check `why` / `passes`); the kind's tags are enforced. */
  insert(item: ItemId, n: number, fresh = 1): number {
    n = Math.floor(n);
    if (n <= 0 || !this.takesKind(item)) return 0;
    const lim = itemDef(item).stack;
    let left = n;
    for (const s of this.stacks) {
      if (left <= 0) break;
      if (s.item !== item || s.n >= lim) continue;
      const t = Math.min(left, lim - s.n);
      s.fresh = (s.fresh * s.n + fresh * t) / (s.n + t); s.n += t; left -= t;
    }
    if (left > 0) {
      const o = this.occ();
      while (left > 0) {
        const sp = this.spot(o, item); if (!sp) break;
        const t = Math.min(left, lim);
        this.stacks.push({ item, n: t, x: sp.x, y: sp.y, rot: sp.rot, fresh });
        this.mark(o, item, sp.x, sp.y, sp.rot, this.stacks.length - 1);
        left -= t;
      }
    }
    if (left !== n) this.touch();
    return n - left;
  }
  /** take up to n out (stalest and smallest stacks first); returns how many came out and their mean freshness */
  remove(item: ItemId, n: number): number { return this.removeF(item, n).n; }
  removeF(item: ItemId, n: number): { n: number; fresh: number } {
    n = Math.floor(n);
    if (n <= 0) return { n: 0, fresh: 1 };
    const mine = this.stacks.filter((s) => s.item === item).sort((a, b) => a.fresh - b.fresh || a.n - b.n);
    let left = n, f = 0;
    for (const s of mine) {
      if (left <= 0) break;
      const t = Math.min(left, s.n);
      s.n -= t; left -= t; f += s.fresh * t;
    }
    const got = n - left;
    if (got > 0) { this.stacks = this.stacks.filter((s) => s.n > 0); this.touch(); }
    return { n: got, fresh: got ? f / got : 1 };
  }
  /** move a stack to (x, y) turned rot: onto a free spot, or onto a matching stack (merging what fits) */
  place(s: Stack, x: number, y: number, rot: 0 | 1): boolean {
    const o = this.occ(s), [w, h] = this.dims(s.item, rot);
    if (x >= 0 && y >= 0 && x < this.W && y < this.H) {
      const hit = this.stacks[o[y * this.W + x]];
      if (hit && hit !== s && hit.item === s.item) {
        const lim = itemDef(s.item).stack, t = Math.min(s.n, lim - hit.n);
        if (t <= 0) return false;
        hit.fresh = (hit.fresh * hit.n + s.fresh * t) / (hit.n + t); hit.n += t; s.n -= t;
        if (s.n <= 0) this.stacks = this.stacks.filter((q) => q !== s);
        this.touch(); return true;
      }
    }
    if (!this.free(o, x, y, w, h)) return false;
    s.x = x; s.y = y; s.rot = rot; this.touch();
    return true;
  }
  /** put n of an item down at (x, y) turned rot (a drop from another container): onto a free spot or a matching stack;
   *  what does not fit there goes wherever it fits. Returns how many went in */
  insertAt(item: ItemId, n: number, fresh: number, x: number, y: number, rot: 0 | 1): number {
    if (!this.takesKind(item) || n <= 0) return 0;
    const lim = itemDef(item).stack, o = this.occ();
    let left = n;
    const hit = x >= 0 && y >= 0 && x < this.W && y < this.H ? this.stacks[o[y * this.W + x]] : undefined;
    if (hit && hit.item === item) { const t = Math.min(left, lim - hit.n); if (t > 0) { hit.fresh = (hit.fresh * hit.n + fresh * t) / (hit.n + t); hit.n += t; left -= t; } }
    else if (!hit) { const [w, h] = this.dims(item, rot); if (this.free(o, x, y, w, h)) { const t = Math.min(left, lim); this.stacks.push({ item, n: t, x, y, rot, fresh }); left -= t; } }
    if (left < n) this.touch();
    if (left > 0) left -= this.insert(item, left, fresh);
    return n - left;
  }
  /** split k off a stack into the first free spot; returns the new stack */
  split(s: Stack, k: number): Stack | null {
    k = Math.floor(k);
    if (k <= 0 || k >= s.n) return null;
    const sp = this.spot(this.occ(), s.item); if (!sp) return null;
    const ns: Stack = { item: s.item, n: k, x: sp.x, y: sp.y, rot: sp.rot, fresh: s.fresh };
    s.n -= k; this.stacks.push(ns); this.touch();
    return ns;
  }
  /** re-lay everything in an order (matching stacks merged): the SORT button */
  sort(by: SortKey, desc = false) {
    const items = this.contents();
    const key = (e: { item: ItemId; n: number; fresh: number }): [number | string, string] => {
      const d = itemDef(e.item);
      switch (by) {
        case 'name': return [d.name, d.name];
        case 'count': return [-e.n, d.name];
        case 'value': return [-(d.value * e.n), d.name];
        case 'fresh': return [d.perish ? e.fresh : 2, d.name];
        default: return [GROUP_ORDER.indexOf(d.group) * 1000 + (d.cat === 'raw' ? 0 : 100), d.name];
      }
    };
    items.sort((a, b) => { const ka = key(a), kb = key(b); const c = typeof ka[0] === 'number' ? (ka[0] as number) - (kb[0] as number) : String(ka[0]).localeCompare(String(kb[0])); return (c || ka[1].localeCompare(kb[1])) * (desc ? -1 : 1); });
    const old = this.stacks;
    const tryLay = (order: typeof items, big: boolean) => {
      this.stacks = [];
      const seq = big ? [...order].sort((a, b) => { const sa = itemDef(a.item).size, sb = itemDef(b.item).size; return sb[0] * sb[1] - sa[0] * sa[1]; }) : order;
      for (const e of seq) if (this.insert(e.item, e.n, e.fresh) < e.n) return false;
      return true;
    };
    if (!tryLay(items, false) && !tryLay(items, true)) this.stacks = old;
    this.touch();
  }
  /** spoil: advance freshness by dt seconds (days long); spoiled stacks become their `into` or vanish. Returns what spoiled */
  decay(dt: number, day: number, safe: boolean): { item: ItemId; n: number; into?: ItemId }[] {
    const out: { item: ItemId; n: number; into?: ItemId }[] = [];
    let changed = false;
    for (const s of this.stacks) {
      const p = itemDef(s.item).perish; if (!p) continue;
      if (safe || p.safe.includes(this.kind) && (this.kind !== 'st_freezer' && this.kind !== 'st_vault' || this.powered())) continue;
      const before = s.fresh;
      s.fresh = Math.max(0, s.fresh - dt / (p.days * day));
      if (Math.floor(before * 20) !== Math.floor(s.fresh * 20)) changed = true;
      if (s.fresh <= 0) { out.push({ item: s.item, n: s.n, into: p.into }); s.n = 0; }
    }
    if (out.length) { this.stacks = this.stacks.filter((s) => s.n > 0); changed = true; }
    if (changed) this.touch();
    return out;
  }
  /** does this container keep this item from spoiling right now */
  keeps(item: ItemId) { const p = itemDef(item).perish; return !p || p.safe.includes(this.kind) && (this.kind !== 'st_freezer' && this.kind !== 'st_vault' || this.powered()); }

  save(): ContainerSave {
    return { k: this.kind, l: this.label, g: this.logo, c: this.color, p: this.priority, a: [...this.allow], d: [...this.deny], s: this.stacks.map((s) => [s.item, s.n, s.x, s.y, s.rot, Math.round(s.fresh * 1000) / 1000]) };
  }
  load(sv: ContainerSave) {
    this.label = sv.l ?? this.label; this.logo = sv.g ?? this.logo; this.color = sv.c ?? this.color; this.priority = sv.p ?? 3;
    this.allow = sv.a ?? []; this.deny = sv.d ?? [];
    this.stacks = [];
    for (const [item, n, x, y, rot, f] of sv.s ?? []) {
      if (!ITEMS[item]) continue;
      const st: Stack = { item, n, x, y, rot: (rot ? 1 : 0), fresh: f ?? 1 };
      if (this.fits(item, x, y, st.rot)) this.stacks.push(st); else this.insert(item, n, f ?? 1);
    }
    this.touch();
  }
}
