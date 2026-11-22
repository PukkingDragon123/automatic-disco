// EMPIRE · the model. The crash site is the first settlement; outposts are founded in other regions of the planet by
// a SETTLER CONVOY (overland from a neighbouring settlement: real items and workers leave the stores) or a POD DROP
// from the ship (credits and standing). Settlements grow by population and buildings: Outpost, Town, City (with the
// City Charter), Capital (the seat). ROADS and later RAIL connect them; TRADE ROUTES (item, amount, from, to) send
// convoys and trains along them on their own. The two rival blocs hold most of the planet: relations, trade deals,
// non-aggression pacts and war, linked to the region game's factions (a pact is their truce, a war their offensive).
//
// The live settlement (the region being played) is sampled from the real systems every two seconds; every other one
// runs on abstract rates (works output per minute, meals eaten per head, growth, taxes), and on the next visit the
// change in its stock since it was last live is put into, or taken out of, its real stores.
//   empire.d                       the data (EmpireData; run.empire, saved by flow.ts)
//   empire.liveS()  settlement(id)  settlementAt(region)  owner(region)  stats()  canFound(region, how)  found(...)
//   canLink / buildLink  addRoute / setRoute / removeRoute  gift / deal / pact / war / peace  travel(id)  on('change')
import type { Game } from '../game/game';
import type { Planet, PRegion } from '../world/planet';
import { BIOMES } from '../world/region';
import { ITEMS } from '../factory/items';
import { toast } from '../ui/kit';
import { uiSfx } from '../ui/kit/sound';
import { empireHost, empireData } from './host';
import { neighbours, km, holders, isSea } from './geo';
import {
  TIERS, TIER_RULE, TIER_NAME, LINK_RULE, CONVOY_COST, CONVOY_FOOD, DROP_COST, DROP_ITEMS, MEALS_PER_HEAD, BLOC_SHORT, BLOC_TRADE,
  DEAL_PERIOD, GIFT_CR, PEACE_CR,
  type EmpireData, type SettlementData, type Tier, type How, type BlocId, type BlocData, type LinkKind, type LinkData, type RouteData, type ConvoyData, type LogLine,
} from './types';

type G = Game & Record<string, any>;
export const SOL_S = 240;
const NAMES = ['Solano Station', 'Quintero Post', 'Fort Kowalczyk', 'Castellanos Field', 'Baptiste Hold', 'Mamani Camp', 'Port Araujo', 'Kristiansen Watch', 'Barrera Reach', 'Meridian Rest', 'Pathfinder Ridge', 'Seven Wells'];
/** what a settlement without works brings in per worker per minute, by biome (the first id that exists) */
const FORAGE: Record<string, [string, number][]> = {
  meadow: [['wood', 0.6], ['berries|fruit', 0.4], ['fibre', 0.3]], jungle: [['wood', 0.8], ['fruit|berries', 0.5], ['fibre', 0.3]],
  savanna: [['fibre', 0.5], ['wood', 0.3], ['tuber|berries', 0.3]], marsh: [['peat|soil', 0.5], ['fibre', 0.4], ['mushroom|berries', 0.3]],
  highland: [['rock_granite|gravel', 0.6], ['wood', 0.3], ['berries', 0.2]], tundra: [['rock_granite|gravel', 0.5], ['wood', 0.2], ['tuber|berries', 0.2]],
  desert: [['sand', 0.8], ['rock_sandstone|gravel', 0.4], ['tuber', 0.1]], crystal: [['crystal|quartz', 0.15], ['rock_limestone|gravel', 0.5], ['berries', 0.15]],
  ashland: [['rock_basalt|gravel', 0.6], ['ash|soil', 0.4], ['tuber', 0.1]], coast: [['kelp|fibre', 0.5], ['sand', 0.4], ['fruit|berries', 0.3]],
  archipelago: [['kelp|fibre', 0.6], ['fruit|berries', 0.3], ['sand', 0.3]], reef: [['kelp|fibre', 0.7], ['sand', 0.3], ['salt|brine', 0.2]], ocean: [['kelp|fibre', 0.6], ['salt|brine', 0.3]],
};
const BASE_REL: Record<BlocId, number> = { soviet: -10, prc: 0 };
const nonInternal = (id: string) => !!ITEMS[id] && ITEMS[id].cat !== 'internal';
const r1 = (n: number) => Math.round(n * 10) / 10;

export interface EmpireStats {
  settlements: number; regions: number; planet: number; pop: number; workers: number; crew: number; robots: number; buildings: number;
  food: number; meals: number; power: { gen: number; draw: number }; happiness: number;
  prod: [string, number][]; use: [string, number][]; treasury: number; tax: number; standing: number | null;
  know: { bio: number; geo: number; energy: number; xeno: number } | null; nodes: number; military: number;
  convoys: number; links: number; routes: number; short: string[];
}

function fresh(): EmpireData {
  return { v: 1, t: 0, next: 1, seat: 0, live: 0, settlements: [], links: [], routes: [], convoys: [], blocs: (['soviet', 'prc'] as BlocId[]).map((id) => ({ id, relation: BASE_REL[id], treaty: 'none', deal: null, cleared: [], moveT: 420, since: 0, gifts: 0 })), treasury: 60, log: [] };
}

export class Empire {
  readonly d: EmpireData;
  private fns: Record<string, ((x: any) => void)[]> = {};
  private sampleT = 0; private simT = 0; private factT = 0;
  private baseDiff: number | null = null;
  /** the regions next to each region (shared borders on the map) */
  readonly adj: number[][];
  constructor(readonly g: G | null, readonly planet: Planet, run: unknown) {
    const saved = empireData(run as never) as EmpireData | null;
    this.d = saved && saved.v === 1 && Array.isArray(saved.settlements) ? saved : fresh();
    for (const b of this.d.blocs) { b.cleared ??= []; b.gifts ??= 0; }
    if (run) (run as { empire?: unknown }).empire = this.d;
    this.adj = neighbours(planet);
  }
  on(ev: 'change' | 'log' | 'tier', fn: (x: any) => void) { (this.fns[ev] ??= []).push(fn); return () => { const a = this.fns[ev]; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }; }
  private emit(ev: string, x?: unknown) { for (const f of this.fns[ev] ?? []) { try { f(x); } catch (e) { console.error('empire', ev, e); } } }
  changed() { this.emit('change'); }

  // ================================================================== lookups
  region(id: number): PRegion | undefined { return this.planet.regions[id]; }
  settlement(id: number) { return this.d.settlements.find((s) => s.id === id) ?? null; }
  settlementAt(region: number) { return this.d.settlements.find((s) => s.region === region) ?? null; }
  liveS() { return this.settlement(this.d.live); }
  seatS() { return this.settlement(this.d.seat); }
  /** this game has found (or made) its settlement: until then (a pod still in the air) every settlement is abstract */
  ready = false;
  isLive(s: SettlementData | null) { return this.ready && !!s && !!this.g && s.id === this.d.live; }
  /** who holds a region on the map: the empire where it has a settlement, else the bloc whose base is there */
  owner(region: number): 'you' | BlocId | null {
    if (this.settlementAt(region)) return 'you';
    const r = this.region(region); if (!r) return null;
    const hs = holders(r).filter((b) => !this.bloc(b).cleared.includes(region));
    return hs[0] ?? null;
  }
  /** every rival bloc with a base in a region (not cleared) */
  rivalsIn(region: number): BlocId[] { const r = this.region(region); return r ? holders(r).filter((b) => !this.bloc(b).cleared.includes(region)) : []; }
  bloc(id: BlocId): BlocData { return this.d.blocs.find((b) => b.id === id)!; }
  has(feature: string): boolean { return this.g?.unlocks?.has?.(feature) ?? true; }
  /** words for a locked empire function */
  lockWords(feature: string): string | null {
    if (this.has(feature)) return null;
    const U = this.g?.unlocks, n = U?.nodeFor?.(feature);
    return n ? `Learn ${n.name.toUpperCase()} on the skill tree (RESEARCH) first.` : 'Not learned yet.';
  }
  sol(t = this.d.t) { return 1 + Math.floor(t / SOL_S); }
  /** settlements next to a region (sharing a border) */
  nearSettlements(region: number) { return this.d.settlements.filter((s) => s.region === region || this.adj[s.region]?.includes(region)); }
  kmBetween(a: SettlementData, b: SettlementData) { return km(this.planet, a.region, b.region); }
  linkOf(a: number, b: number) { return this.d.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a)) ?? null; }
  /** the settlements connected by built links: a path, its length and its slowest kind */
  path(from: number, to: number): { ids: number[]; km: number; kind: LinkKind } | null {
    if (from === to) return null;
    const prev = new Map<number, LinkData | null>([[from, null]]), q = [from];
    while (q.length) {
      const c = q.shift()!; if (c === to) break;
      for (const l of this.d.links) { if (l.built < 1) continue; const o = l.a === c ? l.b : l.b === c ? l.a : -1; if (o < 0 || prev.has(o)) continue; prev.set(o, l); q.push(o); }
    }
    if (!prev.has(to)) return null;
    const ids = [to]; let k = 0, kind: LinkKind = 'rail', c = to;
    while (c !== from) { const l = prev.get(c)!; k += l.km; if (l.kind === 'road') kind = 'road'; c = l.a === c ? l.b : l.a; ids.unshift(c); }
    return { ids, km: k, kind };
  }

  // ================================================================== stock (live: the real stores; abstract: the record)
  /** how many of an item (or 'a|b' spec: the best one) a settlement holds; live counts the pod hold too when `hold` */
  count(s: SettlementData, spec: string, hold = false): number {
    const id = this.pick(s, spec); if (!id) return 0;
    if (this.isLive(s)) { const st = this.g!.storage; if (!st) return 0; return hold ? st.count(id) : this.ownCount(id); }
    return Math.floor(s.stock[id] ?? 0);
  }
  /** the id a spec 'a|b|c' stands for at a settlement: the existing one it has most of (else the first that exists) */
  pick(s: SettlementData | null, spec: string): string | null {
    const ids = spec.split('|').filter(nonInternal); if (!ids.length) return null;
    if (!s || ids.length === 1) return ids[0];
    let best = ids[0], bn = -1;
    for (const id of ids) { const n = this.isLive(s) ? (this.g!.storage?.count(id) ?? 0) : (s.stock[id] ?? 0); if (n > bn) { bn = n; best = id; } }
    return best;
  }
  /** the live settlement's own stores (containers + the works' central stores; not the hold) */
  private ownCount(id: string) {
    const g = this.g!, inv = g.factory?.inventory as Record<string, number> | undefined;
    let n = inv?.[id] ?? 0;
    for (const c of g.storage?.containers ?? []) n += c.count(id);
    return Math.floor(n + 1e-6);
  }
  private liveStock(): Record<string, number> {
    const g = this.g!, out: Record<string, number> = {}, inv = g.factory?.inventory as Record<string, number> | undefined;
    const add = (k: string, n: number) => { if (n >= 1 && nonInternal(k)) out[k] = Math.floor((out[k] ?? 0) + n); };
    for (const [k, n] of Object.entries(inv ?? {})) add(k, n);
    for (const c of g.storage?.containers ?? []) for (const st of c.stacks) add(st.item, st.n);
    return out;
  }
  /** put items into a settlement (live: the containers, the rest into the works' stores) */
  deliver(s: SettlementData, id: string, n: number) {
    n = Math.floor(n); if (n <= 0 || !nonInternal(id)) return;
    if (!this.isLive(s)) { s.stock[id] = (s.stock[id] ?? 0) + n; return; }
    const g = this.g!, st = g.storage; let left = n;
    for (let guard = 0; st && left > 0 && guard < 24; guard++) { const c = st.find(id); if (!c) break; const got = st.insert(c, id, left); if (!got) break; left -= got; }
    if (left > 0 && g.factory?.inventory) g.factory.inventory[id] = (g.factory.inventory[id] ?? 0) + left;
  }
  /** take items out of a settlement's own stores; returns how many came out */
  withdraw(s: SettlementData, id: string, n: number): number {
    n = Math.floor(n); if (n <= 0) return 0;
    if (!this.isLive(s)) { const k = Math.min(n, Math.floor(s.stock[id] ?? 0)); s.stock[id] = (s.stock[id] ?? 0) - k; if (s.stock[id] <= 0) delete s.stock[id]; return k; }
    const g = this.g!, inv = g.factory?.inventory as Record<string, number> | undefined; let left = n;
    if (inv && (inv[id] ?? 0) > 0) { const a = Math.min(left, Math.floor(inv[id])); inv[id] -= a; left -= a; }
    const st = g.storage;
    if (st) for (const c of [...st.containers].filter((c: any) => c.count(id) > 0).sort((a: any, b: any) => a.priority - b.priority)) { if (left <= 0) break; left -= st.remove(c, id, left); }
    return n - left;
  }
  /** what is missing to pay a bill at a settlement (null = it can pay); live bills may use the pod hold */
  lack(s: SettlementData, bill: Record<string, number>): string | null {
    for (const [spec, n] of Object.entries(bill)) {
      const id = this.pick(s, spec); if (!id) continue;
      const have = this.count(s, spec, true);
      if (have < n) return `${n - have} more ${ITEMS[id].name}`;
    }
    return null;
  }
  pay(s: SettlementData, bill: Record<string, number>): boolean {
    if (this.lack(s, bill)) return false;
    for (const [spec, n] of Object.entries(bill)) {
      const id = this.pick(s, spec); if (!id) continue;
      if (this.isLive(s)) { if (!this.g!.storage?.take(id, n)) this.withdraw(s, id, n); }
      else this.withdraw(s, id, n);
    }
    return true;
  }
  /** meals in a stock (the same measure the pod's vitals use) */
  meals(stock: Record<string, number>) { let m = 0; for (const [k, n] of Object.entries(stock)) { const f = ITEMS[k]?.food; if (f && f > 0) m += n * f * 0.5; } return Math.floor(m); }
  /** eat (or pack) meals out of a settlement; returns the meals found */
  takeMeals(s: SettlementData, meals: number, into?: Record<string, number>): number {
    const live = this.isLive(s), stock = live ? this.liveStockAll() : s.stock;
    const eds = Object.keys(stock).filter((k) => (ITEMS[k]?.food ?? 0) > 0).sort((a, b) => (stock[b] ?? 0) - (stock[a] ?? 0));
    let got = 0;
    for (const k of eds) {
      if (got >= meals) break;
      const per = (ITEMS[k].food ?? 0) * 0.5, n0 = Math.min(Math.ceil((meals - got) / per), Math.floor(stock[k] ?? 0));
      const n = live ? (this.g!.storage?.take(k, n0) ? n0 : this.withdraw(s, k, n0)) : this.withdraw(s, k, n0);
      got += n * per; if (into && n) into[k] = (into[k] ?? 0) + n;
    }
    return got;
  }

  // ================================================================== the live settlement
  /** read the live settlement from the real systems */
  sample() {
    const s = this.liveS(), g = this.g; if (!s || !g) return;
    const col = g.colony, f = g.factory;
    const crew = (col?.teammates ?? []).filter((t: any) => t.alive).length;
    let creatures = 0; for (const c of g.veyr?.allies ?? []) if (!c.dead) creatures++;
    const robots = (g.robots ?? []).filter((r: any) => !r.dead && String(r.faction ?? 'veyr') === 'veyr').length + (col?.drones?.length ?? 0);
    s.crew = crew; s.robots = robots;
    s.workers = (f?.workers?.list ?? []).filter((w: any) => !w.c?.dead).length;
    s.pop = crew + creatures + robots; s.left = s.pop;
    s.buildings = (f?.buildings ?? []).filter((b: any) => !b.dead && !/^belt|^pipe|^found|^wall|^pole/.test(String(b.kind))).length + (col?.structures?.length ?? 0);
    const home = g.podHome?.happiness?.() ?? 50, mor = col?.vitals?.morale ?? 60;
    s.happiness = Math.round(mor * 0.75 + home * 0.25);
    s.food = Math.round(col?.vitals?.food ?? 0);
    const pw = f?.power?.(); const v = col?.vitals;
    s.power = { gen: r1((pw?.supply ?? 0) + (v?.gen ?? 0)), draw: r1((pw?.demand ?? 0) + (v?.draw ?? 0)) };
    s.stock = this.liveStock(); s.base = { ...s.stock };
    const rt = f?.rates?.() as Record<string, { made: number; used: number }> | undefined;
    // the works' rates settle after a minute (the cargo unpacked at the start counts as "made" in the first one)
    if ((g.world?.time ?? 0) > 75) { s.rates = {}; for (const [k, x] of Object.entries(rt ?? {})) { const net = Math.max(-90, Math.min(90, x.made - x.used)); if (Math.abs(net) >= 0.05 && nonInternal(k)) s.rates[k] = r1(net); } }
    s.garrison = g.troops?.list?.().length ?? robots;
    const sh: string[] = [];
    if (v?.levels?.food && v.levels.food !== 'ok') sh.push('food');
    if (v?.levels?.power && v.levels.power !== 'ok') sh.push('power');
    for (const [k, r] of Object.entries(s.rates)) if (r < 0 && (s.stock[k] ?? 0) < -r * 2) sh.push(k);
    s.short = sh.slice(0, 6);
    if (col?.pod) s.pin = { x: Math.round(col.pod.x * 10) / 10, z: Math.round(col.pod.z * 10) / 10 };
    this.retier(s);
  }
  /** the tier a settlement has earned (the City needs the charter; only the seat becomes the Capital) */
  tierOf(s: SettlementData): Tier {
    let t: Tier = 'outpost';
    for (const k of TIERS) { const r = TIER_RULE[k]; if (s.pop >= r.pop && s.buildings >= r.bld) t = k; }
    if ((t === 'city' || t === 'capital') && !this.has('empire:city')) t = 'town';
    if (t === 'capital' && s.id !== this.d.seat) t = 'city';
    return t;
  }
  private retier(s: SettlementData) {
    const t = this.tierOf(s); if (t === s.tier) return;
    const up = TIERS.indexOf(t) > TIERS.indexOf(s.tier); s.tier = t;
    this.log(`${s.name} is now ${t === 'outpost' ? 'an' : 'a'} ${TIER_NAME[t].toUpperCase()}`, up ? 'good' : 'warn');
    if (up) uiSfx('bong', 0.5);
    this.emit('tier', { s, up });
  }

  // ================================================================== arriving in a settlement (a game was built for its region)
  /** called once per game: make (or find) the settlement of this region, apply what happened while away */
  arrive(region: number) {
    const g = this.g!;
    let s = this.settlementAt(region);
    const first = !this.d.settlements.length;
    if (!s) s = this.makeSettlement(region, first ? 'crash' : 'drop', g.region?.landing ? { x: g.region.landing.x, z: g.region.landing.z } : null);
    this.d.live = s.id; this.ready = true;
    if (first) this.d.seat = s.id;
    const was = s.visited;
    s.visited = true;
    // what the settlement made, ate, sent and received while it ran without you (or what the convoy unloaded)
    const delta: [string, number][] = [];
    for (const id of new Set([...Object.keys(s.stock), ...Object.keys(s.base)])) { const dn = Math.floor((s.stock[id] ?? 0) - (was ? s.base[id] ?? 0 : 0)); if (dn) delta.push([id, dn]); }
    for (const [id, dn] of delta) { if (dn > 0) this.deliver(s, id, dn); else this.withdraw(s, id, -dn); }
    // settlers step out of the convoy; a settlement that grew while you were away has new hands
    const grown = was ? Math.min(4, Math.max(0, Math.round(s.pop - (s.left ?? s.pop)))) : 0, spawn = s.arrivals.splice(0);
    const sp0 = this.workerSpecies();
    for (let i = 0; i < grown; i++) if (sp0) spawn.push(sp0.name);
    let made = 0; for (const name of spawn) if (this.spawnWorker(name)) made++;
    const gain = delta.filter(([, n]) => n > 0).length, loss = delta.filter(([, n]) => n < 0).length;
    if (was && (gain || loss || made)) this.log(`Back at ${s.name}: ${gain} kinds of goods came in, ${loss} went out${made ? `, ${made} new workers` : ''} while you were away`, 'info');
    else if (!was && s.how !== 'crash') this.log(`${s.name}: the ${s.how === 'convoy' ? 'convoy unloads' : 'pod is down'}${made ? `, ${made} settlers step out` : ''}`, 'good');
    queueMicrotask(() => { this.sample(); this.changed(); });
    return s;
  }
  /** the run's worker species: the one most of the live settlement's workers are, else the first design */
  private workerSpecies(): any {
    const g = this.g!, cnt = new Map<any, number>();
    for (const c of g.veyr?.allies ?? []) if (!c.dead) cnt.set(c.sp, (cnt.get(c.sp) ?? 0) + 1);
    let best: any = null, bn = 0; for (const [sp, n] of cnt) if (n > bn) { bn = n; best = sp; }
    return best ?? g.run.reg.list.find((s: any) => s.owner === 'veyr') ?? null;
  }
  private spawnWorker(name: string): boolean {
    const g = this.g!, sp = g.run.reg.list.find((s: any) => s.name === name); if (!sp) return false;
    const pod = g.colony?.pod ?? g.region?.landing; if (!pod) return false;
    const a = Math.random() * Math.PI * 2, c = g.world.spawn(sp, 'veyr', pod.x + Math.cos(a) * 5, pod.z + Math.sin(a) * 5, false);
    if (!c) return false;
    g.veyr.adopt(c); g.factory?.workers?.enlist?.(c);
    return true;
  }
  private makeSettlement(region: number, how: How, pin: { x: number; z: number } | null): SettlementData {
    const r = this.region(region)!, used = new Set(this.d.settlements.map((s) => s.name));
    const name = how === 'crash' ? `${r.name.split(' ')[0]} Landing` : NAMES.find((n) => !used.has(n)) ?? `${r.name} Post`;
    const s: SettlementData = { id: this.d.next++, region, seed: r.seed, name, how, founded: this.d.t, pin, visited: false, tier: 'outpost', pop: 0, workers: 0, crew: 0, robots: 0, buildings: 0, happiness: 62, food: 0, power: { gen: 0, draw: 0 }, stock: {}, base: {}, rates: {}, short: [], arrivals: [], garrison: 0, growT: 0 };
    this.d.settlements.push(s);
    // settling in a bloc's region strains relations with it
    for (const b of this.rivalsIn(region)) { const B = this.bloc(b); B.relation = Math.max(-100, B.relation - (B.treaty === 'pact' ? 4 : 12)); }
    if (how !== 'crash') this.log(`${name} founded in ${r.name} (${BIOMES[r.biome]?.name ?? r.biome})`, 'good');
    this.changed();
    return s;
  }

  // ================================================================== founding
  /** '' when a region can be settled that way, else why not */
  canFound(region: number, how: 'convoy' | 'drop'): string {
    const r = this.region(region); if (!r) return 'No such region';
    if (this.settlementAt(region)) return 'Already one of your settlements';
    if (this.d.convoys.some((c) => (c.kind === 'settlers' || c.kind === 'drop') && c.region === region)) return 'Settlers are already on their way there';
    const live = this.liveS(); if (!live || !this.g) return 'Found settlements from one of them (no settlement is live)';
    if (how === 'convoy') {
      const lw = this.lockWords('empire:convoy'); if (lw) return lw;
      if (!this.nearSettlements(region).length) return 'Too far overland: a convoy can only reach a region next to one of your settlements (a pod drop reaches anywhere)';
      const src = this.convoySource(region)!;
      const why = this.lack(src, CONVOY_COST); if (why) return `${src.name} needs ${why}`;
      if (this.meals(this.isLive(src) ? this.liveStockAll() : src.stock) < CONVOY_FOOD) return `${src.name} needs ${CONVOY_FOOD} meals of food for the trip`;
      return '';
    }
    const lw = this.lockWords('empire:drop'); if (lw) return lw;
    if (this.d.treasury < DROP_COST.credits) return `Needs ${DROP_COST.credits} credits in the treasury (${Math.floor(this.d.treasury)} now)`;
    const rep = this.g.mission?.rep; if (typeof rep === 'number' && rep < DROP_COST.standing + 5) return `Needs ${DROP_COST.standing + 5} standing with the ship (${Math.round(rep)} now)`;
    const why = this.lack(live, DROP_ITEMS); if (why) return `${live.name} needs ${why} for the pod`;
    return '';
  }
  private liveStockAll(): Record<string, number> { const st = this.g?.storage, o: Record<string, number> = {}; if (!st) return o; for (const k of Object.keys(ITEMS)) { const n = st.count(k); if (n > 0 && !['ore', 'carbon', 'water', 'soil'].includes(k)) o[k] = n; } return o; }
  /** the settlement a convoy to a region sets out from: the live one if it borders it, else the nearest */
  convoySource(region: number): SettlementData | null {
    const near = this.nearSettlements(region); if (!near.length) return null;
    const live = near.find((s) => this.isLive(s)); if (live) return live;
    return near.sort((a, b) => km(this.planet, a.region, region) - km(this.planet, b.region, region))[0];
  }
  /** the trip: km and seconds */
  convoyTrip(region: number): { km: number; s: number } | null { const src = this.convoySource(region); if (!src) return null; const k = km(this.planet, src.region, region); return { km: k, s: Math.round(30 + k / 14) }; }
  /** idle workers the live settlement can send with a convoy (up to 3) */
  idleSettlers(): any[] {
    const g = this.g; if (!g) return [];
    const out: any[] = [];
    for (const w of g.factory?.workers?.list ?? []) { if (out.length >= 3) break; if (!w.c?.dead && w.job === 'idle') out.push(w.c); }
    if (out.length < 3) for (const c of g.veyr?.allies ?? []) { if (out.length >= 3) break; if (!c.dead && !out.includes(c) && !(c as any).__wk) out.push(c); }
    return out;
  }
  found(region: number, how: 'convoy' | 'drop'): string {
    const why = this.canFound(region, how); if (why) return why;
    const r = this.region(region)!, g = this.g!;
    if (how === 'convoy') {
      const src = this.convoySource(region)!, trip = this.convoyTrip(region)!, cargo: Record<string, number> = {};
      for (const [spec, n] of Object.entries(CONVOY_COST)) { const id = this.pick(src, spec); if (id) cargo[id] = (cargo[id] ?? 0) + Math.ceil(n / 2); }
      this.pay(src, CONVOY_COST);
      this.takeMeals(src, CONVOY_FOOD, cargo);
      // the settlers: idle workers walk off with the convoy (abstract population when it leaves an unloaded settlement)
      const settlers: string[] = [];
      if (this.isLive(src)) for (const c of this.idleSettlers()) { settlers.push(c.sp.name); g.veyr.allies.delete(c); const w = g.factory?.workers; if (w) w.list = w.list.filter((x: any) => x.c !== c); g.world.remove(c); }
      else { const sp = this.workerSpecies(); const n = Math.min(2, Math.floor(src.pop / 3)); for (let i = 0; i < n && sp; i++) settlers.push(sp.name); src.pop -= n; }
      this.d.convoys.push({ id: this.d.next++, kind: 'settlers', from: src.id, to: -1, region, t: 0, dur: trip.s, cargo, settlers });
      this.log(`A settler convoy leaves ${src.name} for ${r.name}: ${trip.km} km, about ${Math.ceil(trip.s / 60)} min${settlers.length ? `, ${settlers.length} settlers` : ''}`, 'info');
    } else {
      const live = this.liveS()!;
      this.pay(live, DROP_ITEMS);
      this.d.treasury -= DROP_COST.credits;
      if (typeof g.mission?.rep === 'number') g.mission.rep = Math.max(0, g.mission.rep - DROP_COST.standing);
      this.d.convoys.push({ id: this.d.next++, kind: 'drop', from: -1, to: -1, region, t: 0, dur: 30, cargo: {}, settlers: [] });
      this.log(`The MERIDIAN launches a pod for ${r.name}: touchdown in 30 s`, 'info');
    }
    uiSfx('confirm', 0.6);
    this.changed(); empireHost()?.save();
    return '';
  }

  // ================================================================== roads and rail
  linkBill(a: SettlementData, b: SettlementData, kind: LinkKind): Record<string, number> {
    const k = Math.max(1, Math.ceil(this.kmBetween(a, b) / 400)), out: Record<string, number> = {};
    for (const [spec, n] of Object.entries(LINK_RULE[kind].cost)) out[spec] = n * k;
    return out;
  }
  canLink(a: number, b: number, kind: LinkKind): string {
    const A = this.settlement(a), B = this.settlement(b); if (!A || !B || a === b) return 'Pick two different settlements';
    const lw = this.lockWords(kind === 'road' ? 'empire:road' : 'empire:rail'); if (lw) return lw;
    const l = this.linkOf(a, b);
    if (kind === 'road' && l) return l.kind === 'rail' ? 'Already joined by rail' : l.built < 1 ? 'The road is being built' : 'Already joined by road';
    if (kind === 'rail') { if (!l) return 'Lay a road first: the rail follows it'; if (l.kind === 'rail') return l.built < 1 ? 'The rail is being laid' : 'Already joined by rail'; if (l.built < 1) return 'Finish the road first'; }
    if (this.kmBetween(A, B) > 3600) return 'Too far for one line: link through a settlement in between';
    const live = this.liveS(); if (!live) return 'Build from a settlement (none is live)';
    const why = this.lack(live, this.linkBill(A, B, kind)); if (why) return `${live.name} needs ${why}`;
    return '';
  }
  buildLink(a: number, b: number, kind: LinkKind): string {
    const why = this.canLink(a, b, kind); if (why) return why;
    const A = this.settlement(a)!, B = this.settlement(b)!, live = this.liveS()!;
    this.pay(live, this.linkBill(A, B, kind));
    const kmv = this.kmBetween(A, B), dur = Math.round(kmv / LINK_RULE[kind].buildPer);
    const old = this.linkOf(a, b);
    if (old) { old.kind = kind; old.built = 0; old.dur = dur; }
    else this.d.links.push({ id: this.d.next++, a, b, kind, built: 0, km: kmv, dur });
    this.log(`${LINK_RULE[kind].name} crews set out between ${A.name} and ${B.name}: ${kmv} km, about ${Math.ceil(dur / 60)} min`, 'info');
    uiSfx('confirm', 0.6); this.changed();
    return '';
  }

  // ================================================================== trade routes
  addRoute(from: number, to: number, item: string, amount: number): string {
    const lw = this.lockWords('empire:trade'); if (lw) return lw;
    if (from === to || !this.settlement(from) || !this.settlement(to)) return 'Pick two different settlements';
    if (!ITEMS[item]) return 'Pick an item';
    this.d.routes.push({ id: this.d.next++, from, to, item, amount: Math.max(1, Math.round(amount)), on: true, moved: 0, note: '', t: 3 });
    this.log(`Trade route: ${amount} ${ITEMS[item].name} from ${this.settlement(from)!.name} to ${this.settlement(to)!.name}`, 'info');
    this.changed();
    return '';
  }
  setRoute(id: number, patch: Partial<RouteData>) { const r = this.d.routes.find((x) => x.id === id); if (r) { Object.assign(r, patch); this.changed(); } }
  removeRoute(id: number) { this.d.routes = this.d.routes.filter((r) => r.id !== id); this.changed(); }

  // ================================================================== diplomacy
  private needDiplo(): string { return this.lockWords('empire:diplomacy') ?? ''; }
  canGift(b: BlocId) { const w = this.needDiplo(); if (w) return w; if (this.d.treasury < GIFT_CR) return `Needs ${GIFT_CR} credits`; if (this.bloc(b).treaty === 'war') return 'They will not take gifts at war: make peace first'; return ''; }
  gift(b: BlocId): string {
    const why = this.canGift(b); if (why) return why;
    const B = this.bloc(b), k = Math.round(10 * Math.pow(0.8, B.gifts));
    this.d.treasury -= GIFT_CR; B.relation = Math.min(100, B.relation + k); B.gifts++;
    this.log(`A gift of ${GIFT_CR} credits to the ${BLOC_SHORT[b]}: relations +${k}`, 'good'); this.radio(b, 'truce'); this.changed();
    return '';
  }
  canDeal(b: BlocId, i: number) {
    const w = this.needDiplo(); if (w) return w;
    const B = this.bloc(b); if (B.treaty === 'war') return 'No trade at war';
    if (B.relation < 0) return `They will not trade below Neutral (${Math.round(B.relation)} now)`;
    if (!BLOC_TRADE[b][i]) return 'No such offer';
    return '';
  }
  deal(b: BlocId, i: number): string {
    const why = this.canDeal(b, i); if (why) return why;
    const o = BLOC_TRADE[b][i], seat = this.liveS() ?? this.seatS();
    const give = this.pick(seat, o.get) ?? o.get.split('|')[0], get = this.pick(null, o.give) ?? o.give.split('|')[0];
    this.bloc(b).deal = { give, giveN: o.getN, get, getN: o.giveN, t: 20, kept: 0, missed: 0 };
    this.log(`Trade deal with the ${BLOC_SHORT[b]}: ${o.getN} ${ITEMS[give]?.name ?? give} for ${o.giveN} ${ITEMS[get]?.name ?? get} every ${DEAL_PERIOD / 60} min`, 'good');
    this.radio(b, 'truce'); this.changed();
    return '';
  }
  cancelDeal(b: BlocId) { const B = this.bloc(b); if (!B.deal) return; B.deal = null; B.relation = Math.max(-100, B.relation - 5); this.log(`The trade deal with the ${BLOC_SHORT[b]} is cancelled: relations -5`, 'warn'); this.changed(); }
  canPact(b: BlocId) { const w = this.needDiplo(); if (w) return w; const B = this.bloc(b); if (B.treaty === 'pact') return 'Already signed'; if (B.treaty === 'war') return 'Make peace first'; if (B.relation < 20) return `They want Cordial relations first (20; ${Math.round(B.relation)} now)`; return ''; }
  pact(b: BlocId): string {
    const why = this.canPact(b); if (why) return why;
    const B = this.bloc(b); B.treaty = 'pact'; B.since = this.d.t; B.relation = Math.min(100, B.relation + 5);
    this.log(`Non-aggression pact signed with the ${BLOC_SHORT[b]}: their machines stand down in your regions`, 'good');
    this.radio(b, 'truce'); uiSfx('confirm', 0.7); this.linkFactions(); this.changed();
    return '';
  }
  canWar(b: BlocId) { const w = this.needDiplo(); if (w) return w; return this.bloc(b).treaty === 'war' ? 'Already at war' : ''; }
  war(b: BlocId, theirs = false): string {
    if (!theirs) { const why = this.canWar(b); if (why) return why; }
    const B = this.bloc(b), broke = B.treaty === 'pact';
    B.treaty = 'war'; B.since = this.d.t; B.deal = null; B.relation = Math.min(B.relation - (broke ? 60 : 40), -60); B.moveT = 150;
    this.log(theirs ? `The ${BLOC_SHORT[b]} declares war on the empire` : `War declared on the ${BLOC_SHORT[b]}${broke ? ' (the pact is broken)' : ''}`, 'bad');
    this.radio(b, 'wave'); uiSfx('error', 0.6); this.linkFactions(); this.changed();
    return '';
  }
  canPeace(b: BlocId) { const w = this.needDiplo(); if (w) return w; const B = this.bloc(b); if (B.treaty !== 'war') return 'Not at war'; if (this.d.treasury < PEACE_CR) return `Needs ${PEACE_CR} credits of reparations`; if (this.d.t - B.since < 120) return 'Too soon: let the war run two minutes before they listen'; return ''; }
  peace(b: BlocId): string {
    const why = this.canPeace(b); if (why) return why;
    const B = this.bloc(b); B.treaty = 'none'; B.since = this.d.t; this.d.treasury -= PEACE_CR; B.relation = Math.max(-45, B.relation + 20); B.moveT = 400;
    this.log(`Peace with the ${BLOC_SHORT[b]} for ${PEACE_CR} credits`, 'good'); this.linkFactions(); this.changed();
    return '';
  }
  private radio(b: BlocId, ev: 'truce' | 'wave') { try { this.g?.factions?.radio?.say?.(b, ev, {}, 0); } catch { /* no radio */ } }
  /** the region game's factions follow the treaties: a pact is a truce, a war a harder offensive */
  linkFactions() {
    const F = this.g?.factions; if (!F) return;
    if (this.baseDiff === null) this.baseDiff = F.diff ?? 1;
    let war = false;
    for (const B of this.d.blocs) { if (B.treaty === 'pact') F.truce?.add?.(B.id); else F.truce?.delete?.(B.id); if (B.treaty === 'war' && F.present?.().includes(B.id)) war = true; }
    F.diff = (this.baseDiff ?? 1) * (war ? 1.3 : 1);
  }
  /** a bloc base was destroyed in the live region */
  eliminated(b: BlocId) {
    const s = this.liveS(); if (!s || (b !== 'soviet' && b !== 'prc')) return;
    const B = this.bloc(b); if (!B.cleared.includes(s.region)) B.cleared.push(s.region);
    B.relation = Math.max(-100, B.relation - 20);
    this.log(`The ${BLOC_SHORT[b]} base in ${this.region(s.region)?.name} is gone: the region is yours alone (relations -20)`, 'warn');
    this.changed();
  }

  // ================================================================== travel
  /** switch to another settlement (its region's game is built behind a transition by the flow) */
  canTravel(id: number): string {
    const s = this.settlement(id); if (!s) return 'No such settlement';
    if (this.isLive(s)) return 'You are here';
    if (!empireHost()) return 'Travel needs the full game flow (this test has no planet flow)';
    return '';
  }
  /** capture the live settlement before leaving (or saving) */
  capture() { try { this.sample(); this.g?.colony?.save?.(); } catch (e) { console.error('empire capture', e); } }

  // ================================================================== the empire's clock
  update(dt: number) {
    if (dt <= 0) return;
    const d = this.d; d.t += dt;
    this.sampleT -= dt; if (this.sampleT <= 0 && this.g && this.ready) { this.sampleT = 2; try { this.sample(); } catch (e) { console.error('empire sample', e); } }
    this.factT -= dt; if (this.factT <= 0) { this.factT = 3; this.linkFactions(); }
    this.tickConvoys(dt);
    this.simT += dt;
    if (this.simT >= 1) { const k = this.simT; this.simT = 0; this.tickSlow(k); }
  }
  private tickConvoys(dt: number) {
    for (const c of [...this.d.convoys]) {
      c.t += dt; if (c.t < c.dur) continue;
      this.d.convoys = this.d.convoys.filter((x) => x !== c);
      this.land(c);
    }
  }
  private land(c: ConvoyData) {
    if (c.kind === 'settlers' || c.kind === 'drop') {
      if (c.region === undefined || this.settlementAt(c.region)) { const back = this.settlement(c.from); if (back) for (const [k, n] of Object.entries(c.cargo)) this.deliver(back, k, n); return; }
      const s = this.makeSettlement(c.region, c.kind === 'drop' ? 'drop' : 'convoy', null);
      s.stock = { ...c.cargo }; s.arrivals = c.settlers.slice(); s.pop = c.settlers.length;
      toast(`<b>${s.name}</b> founded in ${this.region(c.region)?.name}`, 'good', 5000);
      uiSfx('bong', 0.6);
      return;
    }
    const to = c.kind === 'deal' ? (this.liveS() ?? this.seatS()) : this.settlement(c.to);
    if (!to) return;
    for (const [k, n] of Object.entries(c.cargo)) this.deliver(to, k, n);
    if (c.kind === 'trade') { const r = this.d.routes.find((x) => x.id === c.route); if (r) r.moved += Object.values(c.cargo).reduce((a, b) => a + b, 0); }
    this.changed();
  }
  private tickSlow(dt: number) {
    const d = this.d;
    for (const l of d.links) if (l.built < 1) { l.built = Math.min(1, l.built + dt / Math.max(10, l.dur)); if (l.built >= 1) this.log(`The ${LINK_RULE[l.kind].name.toLowerCase()} between ${this.settlement(l.a)?.name} and ${this.settlement(l.b)?.name} is open`, 'good'); }
    for (const s of d.settlements) {
      if (!this.isLive(s)) this.simulate(s, dt);
      d.treasury += (s.pop * TIER_RULE[s.tier].tax * (0.4 + s.happiness / 166)) * dt / 60;
    }
    this.tickRoutes(dt);
    this.tickBlocs(dt);
    this.emit('change');
  }
  /** an unloaded settlement for dt seconds: works output, foraging, meals, growth, happiness */
  private simulate(s: SettlementData, dt: number) {
    const k = dt / 60, out = TIER_RULE[s.tier].out, short = new Set<string>();
    let starved = false;
    for (const [id, r] of Object.entries(s.rates)) if (r < 0) { const need = -r * k; const have = s.stock[id] ?? 0; if (have < need) { starved = true; short.add(id); } s.stock[id] = Math.max(0, have - need); }
    for (const [id, r] of Object.entries(s.rates)) if (r > 0) s.stock[id] = (s.stock[id] ?? 0) + r * k * out * (starved ? 0.5 : 1);
    // hands without works gather what the land gives
    const hands = Math.max(s.workers, Math.round(s.pop * 0.6));
    if (Object.keys(s.rates).length < 2 && hands > 0) for (const [spec, per] of FORAGE[this.region(s.region)?.biome ?? 'meadow'] ?? []) { const id = this.pick(null, spec); if (id) s.stock[id] = (s.stock[id] ?? 0) + per * hands * k; }
    const eat = s.pop * MEALS_PER_HEAD * k, have = this.meals(s.stock);
    let fed = true;
    if (eat > 0) { if (have >= eat) this.takeMealsFrac(s, eat); else { fed = false; short.add('food'); } }
    if (s.power.draw > s.power.gen + 0.1) short.add('power');
    const housing = Math.floor(4 + s.buildings * 0.6);
    if (s.pop >= housing) short.add('housing');
    for (const [id, n] of Object.entries(s.stock)) if (n <= 0) delete s.stock[id];
    s.food = this.meals(s.stock);
    const war = this.rivalsIn(s.region).some((b) => this.bloc(b).treaty === 'war');
    const target = 58 + (fed ? 8 : -30) + (short.has('power') ? -12 : 0) + (war ? -12 : 0) + TIERS.indexOf(s.tier) * 4 + (s.short.includes('housing') ? -6 : 0);
    s.happiness = Math.max(0, Math.min(100, s.happiness + (target - s.happiness) * Math.min(1, dt / 90)));
    s.growT += dt;
    if (s.growT >= 150) { s.growT = 0; if (fed && s.happiness > 55 && s.pop < housing && s.pop > 0) { s.pop++; } else if (!fed && s.pop > 1) { s.pop--; this.log(`${s.name} is starving: a worker is lost`, 'bad'); } }
    s.short = [...short].slice(0, 6);
    this.retier(s);
  }
  private takeMealsFrac(s: SettlementData, meals: number) {
    const eds = Object.keys(s.stock).filter((k) => (ITEMS[k]?.food ?? 0) > 0).sort((a, b) => (s.stock[b] ?? 0) - (s.stock[a] ?? 0));
    for (const k of eds) { if (meals <= 0) break; const per = (ITEMS[k].food ?? 0) * 0.5, n = Math.min(s.stock[k], meals / per); s.stock[k] -= n; meals -= n * per; }
  }
  private tickRoutes(dt: number) {
    for (const r of this.d.routes) {
      if (!r.on) { r.note = 'Paused'; continue; }
      r.t -= dt; if (r.t > 0) continue;
      const p = this.path(r.from, r.to), A = this.settlement(r.from), B = this.settlement(r.to);
      if (!A || !B) { r.note = 'A settlement is gone'; r.t = 10; continue; }
      if (!p) { r.note = 'No finished road or rail joins them'; r.t = 8; continue; }
      const rule = LINK_RULE[p.kind];
      r.t = rule.period;
      const n = this.withdraw(A, r.item, Math.min(r.amount, rule.load));
      if (n <= 0) { r.note = `Nothing to send: no ${ITEMS[r.item]?.name ?? r.item} at ${A.name}`; continue; }
      r.note = '';
      this.d.convoys.push({ id: this.d.next++, kind: 'trade', from: A.id, to: B.id, t: 0, dur: Math.max(6, Math.round(p.km / rule.speed)), cargo: { [r.item]: n }, settlers: [], route: r.id });
    }
  }
  private tickBlocs(dt: number) {
    for (const B of this.d.blocs) {
      const contested = this.d.settlements.filter((s) => this.rivalsIn(s.region).includes(B.id)).length;
      B.gifts = Math.max(0, B.gifts - dt / 300);
      const target = BASE_REL[B.id] - contested * 5 + (B.treaty === 'pact' ? 18 : 0) + (B.deal ? 10 : 0) + (B.treaty === 'war' ? -40 : 0);
      B.relation = Math.max(-100, Math.min(100, B.relation + (target - B.relation) * Math.min(1, dt / 900)));
      if (B.deal) {
        B.deal.t -= dt;
        if (B.deal.t <= 0) {
          B.deal.t = DEAL_PERIOD;
          const s = this.liveS() ?? this.seatS();
          if (s && this.withdraw(s, B.deal.give, B.deal.giveN) >= B.deal.giveN) {
            B.deal.kept++; B.relation = Math.min(100, B.relation + 1.5);
            this.d.convoys.push({ id: this.d.next++, kind: 'deal', from: -1, to: s.id, t: 0, dur: 40, cargo: { [B.deal.get]: B.deal.getN }, settlers: [], bloc: B.id });
          } else {
            B.deal.missed++; B.relation = Math.max(-100, B.relation - 4);
            this.log(`Missed a delivery to the ${BLOC_SHORT[B.id]}: no ${ITEMS[B.deal.give]?.name ?? B.deal.give} to send (relations -4)`, 'warn');
            if (B.deal.missed >= 3) { B.deal = null; this.log(`The ${BLOC_SHORT[B.id]} tears up the trade deal`, 'bad'); }
          }
        }
      }
      B.moveT -= dt;
      if (B.moveT > 0) continue;
      if (B.treaty === 'war') { B.moveT = 200 + Math.random() * 160; this.raid(B.id); }
      else if (B.relation <= -60 && B.treaty === 'none') { B.moveT = 300; this.war(B.id, true); }
      else { B.moveT = 360 + Math.random() * 200; if (contested && B.treaty !== 'pact') this.log(`The ${BLOC_SHORT[B.id]} protests your settlements on its ground (${contested})`, 'warn'); }
    }
  }
  /** a raid at war: a settlement in or next to their ground loses goods and calm */
  private raid(b: BlocId) {
    const held = new Set(this.planet.regions.filter((r) => this.rivalsIn(r.id).includes(b)).map((r) => r.id));
    const tg = this.d.settlements.filter((s) => held.has(s.region) || this.adj[s.region]?.some((n) => held.has(n)));
    if (!tg.length) return;
    const s = tg[Math.floor(Math.random() * tg.length)];
    if (this.isLive(s)) { this.log(`${BLOC_SHORT[b]} raiders are coming for ${s.name}`, 'bad'); this.radio(b, 'wave'); return; }
    const top = Object.entries(s.stock).sort((x, y) => y[1] - x[1])[0];
    if (top) { const n = Math.ceil(top[1] * 0.15); s.stock[top[0]] -= n; this.log(`${BLOC_SHORT[b]} raiders hit ${s.name}: ${n} ${ITEMS[top[0]]?.name ?? top[0]} lost`, 'bad'); }
    s.happiness = Math.max(0, s.happiness - 10);
    if (s.garrison > 0 && Math.random() < 0.3) s.garrison--;
  }

  // ================================================================== the log and the numbers
  log(text: string, kind: LogLine['kind'] = 'info') {
    this.d.log.unshift({ t: Math.round(this.d.t), text, kind });
    if (this.d.log.length > 60) this.d.log.length = 60;
    try { if (this.g?.colony?.alert) this.g.colony.alert(text, kind === 'bad' ? 'bad' : kind === 'warn' ? 'warn' : kind === 'good' ? 'good' : 'info'); } catch { /* no feed */ }
    this.emit('log', text);
  }
  stats(): EmpireStats {
    const d = this.d, g = this.g, S = d.settlements;
    const sum = (f: (s: SettlementData) => number) => S.reduce((a, s) => a + f(s), 0);
    const prod = new Map<string, number>(), use = new Map<string, number>();
    for (const s of S) for (const [k, r] of Object.entries(s.rates)) { const v = r * (this.isLive(s) ? 1 : TIER_RULE[s.tier].out); if (v > 0) prod.set(k, (prod.get(k) ?? 0) + v); else use.set(k, (use.get(k) ?? 0) - v); }
    for (const s of S) if (!this.isLive(s) && Object.keys(s.rates).length < 2) { const hands = Math.max(s.workers, Math.round(s.pop * 0.6)); for (const [spec, per] of FORAGE[this.region(s.region)?.biome ?? 'meadow'] ?? []) { const id = this.pick(null, spec); if (id && hands) prod.set(id, (prod.get(id) ?? 0) + per * hands); } }
    const know = g?.research?.data ? { ...g.research.data } : null;
    const short = new Set<string>(); for (const s of S) for (const x of s.short) short.add(x);
    return {
      settlements: S.length, regions: new Set(S.map((s) => s.region)).size, planet: this.planet.regions.length,
      pop: sum((s) => s.pop), workers: sum((s) => s.workers), crew: sum((s) => s.crew), robots: sum((s) => s.robots), buildings: sum((s) => s.buildings),
      food: sum((s) => s.food), meals: sum((s) => s.pop * MEALS_PER_HEAD), power: { gen: r1(sum((s) => s.power.gen)), draw: r1(sum((s) => s.power.draw)) },
      happiness: S.length ? Math.round(sum((s) => s.happiness) / S.length) : 0,
      prod: [...prod.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r1(v)] as [string, number]),
      use: [...use.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, r1(v)] as [string, number]),
      treasury: Math.floor(d.treasury), tax: r1(sum((s) => s.pop * TIER_RULE[s.tier].tax * (0.4 + s.happiness / 166))),
      standing: typeof g?.mission?.rep === 'number' ? Math.round(g.mission.rep) : null,
      know, nodes: g?.unlocks?.owned?.().length ?? 0, military: sum((s) => s.garrison),
      convoys: d.convoys.length, links: d.links.filter((l) => l.built >= 1).length, routes: d.routes.length, short: [...short],
    };
  }
  /** a settlement's top production per minute */
  topProd(s: SettlementData, n = 3): [string, number][] {
    const out: [string, number][] = Object.entries(s.rates).filter(([, r]) => r > 0).map(([k, r]) => [k, r1(r * (this.isLive(s) ? 1 : TIER_RULE[s.tier].out))] as [string, number]);
    if (out.length < 2 && !this.isLive(s)) { const hands = Math.max(s.workers, Math.round(s.pop * 0.6)); if (hands) for (const [spec, per] of FORAGE[this.region(s.region)?.biome ?? 'meadow'] ?? []) { const id = this.pick(null, spec); if (id) out.push([id, r1(per * hands)]); } }
    return out.sort((a, b) => b[1] - a[1]).slice(0, n);
  }
  /** is a region sea (a settlement there floats on pontoons) */
  sea(region: number) { const r = this.region(region); return !!r && isSea(r); }
}
