// RESEARCH: learn by scanning and studying. Every scan of something new (a species, a plant, an ore body, a vent, a
// ruin) yields DATA of one kind; looking at the same thing again pays little. Research Stations work through the
// player's queue, spending data and time to unlock TECH (tech.ts). Buildings, recipes, logic features and Upgrader
// blueprints are all asked through unlocked(id) / requirementOf(id), so the build menu can grey a tile and say why.
import type { Game } from '../game/game';
import { TECHS, TECH, DATA_KINDS, DATA_NAME, type DataKind, type Tech } from './tech';
import { PATH, type Mastery } from './mastery';
import { FDEFS } from '../factory/defs';
import { anyG, gtime } from './util';
import { ORES } from '../world/geo/ores';
import { catOf } from '../logistics/catalog';

export interface ScanHit { key: string; kind: 'species' | 'plant' | 'ore' | 'vent' | 'ruin' | 'crystal'; name: string; data: Partial<Record<DataKind, number>>; x: number; z: number; first: boolean }
export interface Ruin { x: number; z: number; name: string; key: string }
type Ev = 'unlock' | 'data' | 'scan' | 'queue';

/** the station building kind */
export const STATION = 'research_station';

export class Research {
  data: Record<DataKind, number> = { bio: 0, geo: 0, energy: 0, xeno: 0 };
  /** lifetime data gathered per kind (quotas and the screen read it) */
  total: Record<DataKind, number> = { bio: 0, geo: 0, energy: 0, xeno: 0 };
  private done = new Set<string>(TECHS.filter((t) => t.start).map((t) => t.id));
  queue: string[] = [];
  /** seconds of work on the head of the queue */
  prog = 0;
  /** keys scanned, with how many times */
  scans = new Map<string, number>();
  /** recent scans, newest first */
  log: { name: string; kind: ScanHit['kind']; data: Partial<Record<DataKind, number>>; t: number }[] = [];
  ruins: Ruin[] = [];
  readonly TECHS = TECHS;
  private fns: Record<string, ((d: any) => void)[]> = {};
  /** index: building kind / recipe / feature / blueprint -> the techs that open it */
  private by = new Map<string, Tech[]>();
  constructor(readonly g: Game | null, readonly mastery: Mastery) {
    for (const t of TECHS) for (const id of [...(t.buildings ?? []), ...(t.recipes ?? []), ...(t.grants ?? []), ...(t.blueprint ? [t.blueprint] : [])]) {
      const a = this.by.get(id) ?? []; a.push(t); this.by.set(id, a);
    }
  }
  on(ev: Ev, fn: (d: any) => void) { (this.fns[ev] ??= []).push(fn); return () => { const a = this.fns[ev]; const i = a?.indexOf(fn) ?? -1; if (i >= 0) a!.splice(i, 1); }; }
  private emit(ev: Ev, d: any) { for (const f of this.fns[ev] ?? []) { try { f(d); } catch (e) { console.error('research', ev, e); } } }

  // ---------------------------------------------------------------- unlock state
  private skills() { return (this.g as unknown as { run?: { skills?: { owned: Set<string> } } })?.run?.skills ?? null; }
  /** v7: the unlock graph (src/research/progress.ts) gates first; the old techs are only its legacy layer */
  gate: { has(f: string): boolean; covers(f: string): boolean; lockLine(f: string): string | null } | null = null;
  /** the graph's word on an id: true / false, or null when the graph does not gate it */
  private graph(id: string): boolean | null {
    const U = this.gate; if (!U) return null;
    if (U.covers(id)) return U.has(id);
    if (TECH[id] && U.covers('tech:' + id)) return U.has('tech:' + id) || this.done.has(id);
    const def = FDEFS[id];
    if (def) {
      if (!U.has('dock:build')) return false;
      const cat = 'cat:' + catOf(id as never);
      if (U.covers(cat) && !U.has(cat)) return false;
    }
    return null;
  }
  /** is it known: a tech id, a building kind, a recipe, a logic feature or a blueprint */
  unlocked(id: string): boolean {
    const gr = this.graph(id);
    if (gr !== null) { if (!gr) return false; if (this.gate?.covers(id)) return true; }
    if (TECH[id]) return this.done.has(id);
    const ts = this.by.get(id);
    if (ts?.length) {
      if (ts.some((t) => this.done.has(t.id))) return true;
      // a perk can grant the same feature or skill
      return this.mastery.has(id);
    }
    // a building gated on a legacy skill: some tech or perk granted that skill
    const def = FDEFS[id];
    if (def) {
      if (!def.skill) return true;
      if (this.skills()?.owned.has(def.skill)) return true;
      const ts2 = this.by.get(def.skill);
      if (ts2?.length) return ts2.some((t) => this.done.has(t.id)) || this.mastery.has(def.skill);
      return true; // nothing in research covers it: not gated here
    }
    if (this.mastery.has(id)) return true;
    return true; // unknown ids are not ours to gate
  }
  has(id: string) { return this.unlocked(id); }
  /** the cheapest tech that would open id */
  techFor(id: string): Tech | null {
    if (TECH[id]) return TECH[id];
    const def = FDEFS[id];
    const ts = this.by.get(id) ?? (def?.skill ? this.by.get(def.skill) : undefined);
    if (!ts?.length) return null;
    return [...ts].sort((a, b) => this.costSum(a) - this.costSum(b))[0];
  }
  private costSum(t: Tech) { let s = 0; for (const k of DATA_KINDS) s += t.cost[k] ?? 0; return s + (this.done.has(t.id) ? -1e6 : 0); }
  /** null when available, else one short line for a greyed tile */
  requirementOf(id: string): string | null {
    if (this.unlocked(id)) return null;
    const U = this.gate;
    if (U) {
      const def = FDEFS[id];
      const line = U.lockLine(id) ?? (TECH[id] ? U.lockLine('tech:' + id) : null) ?? (def ? (U.lockLine('dock:build') ?? U.lockLine('cat:' + catOf(id as never))) : null);
      if (line) return line;
      if (def) for (const g of [def.skill ? 'tech:' + (this.by.get(def.skill)?.[0]?.id ?? '') : '', ...((this.by.get(id) ?? []).map((t) => 'tech:' + t.id))]) { const l = g && U.lockLine(g); if (l) return l; }
    }
    const t = this.techFor(id);
    if (!t) return null;
    // walk down to the first thing actually blocking: a missing prerequisite or a mastery level
    const block = this.blocker(t);
    if (block) return block;
    return `RESEARCH ${t.name.toUpperCase()}`;
  }
  private blocker(t: Tech, depth = 0): string | null {
    if (t.mastery && this.mastery.level(t.mastery[0]) < t.mastery[1]) return `${PATH[t.mastery[0]].name} LV ${t.mastery[1]}`;
    if (depth > 4) return null;
    for (const n of t.needs ?? []) if (!this.done.has(n)) { const b = this.blocker(TECH[n], depth + 1); return b ?? `RESEARCH ${TECH[n].name.toUpperCase()}`; }
    return null;
  }
  /** why a tech can't be queued (null: it can) */
  why(id: string): string | null {
    const t = TECH[id]; if (!t) return 'Unknown';
    if (this.done.has(id)) return 'Known';
    if (t.mastery && this.mastery.level(t.mastery[0]) < t.mastery[1]) return `Needs ${PATH[t.mastery[0]].short} level ${t.mastery[1]}`;
    const miss = (t.needs ?? []).filter((n) => !this.done.has(n));
    if (miss.length) return 'Needs ' + miss.map((n) => TECH[n].name).join(', ');
    return null;
  }
  /** data still missing for a tech, or null if the reserves cover it */
  short(id: string): string | null {
    const t = TECH[id]; if (!t) return null;
    const miss = DATA_KINDS.filter((k) => (t.cost[k] ?? 0) > this.data[k]);
    return miss.length ? miss.map((k) => `${(t.cost[k] ?? 0) - Math.floor(this.data[k])} ${DATA_NAME[k]}`).join(' · ') : null;
  }
  known() { return [...this.done]; }

  // ---------------------------------------------------------------- queue and stations
  enqueue(id: string) {
    if (this.why(id) || this.queue.includes(id)) return false;
    this.queue.push(id); this.emit('queue', { id }); return true;
  }
  dequeue(id: string) { const i = this.queue.indexOf(id); if (i < 0) return; this.queue.splice(i, 1); if (i === 0) this.prog = 0; this.emit('queue', { id }); }
  /** move a queued tech to the front */
  bump(id: string) { const i = this.queue.indexOf(id); if (i <= 0) return; this.queue.splice(i, 1); this.queue.unshift(id); this.prog = 0; this.emit('queue', { id }); }
  stations(): { n: number; powered: number } {
    const bs = (anyG(this.g!)?.factory?.buildings ?? []) as { kind: string; dead?: boolean; on?: boolean; status?: string; sat?: number; rise?: number }[];
    let n = 0, p = 0;
    for (const b of bs) if (b.kind === STATION && !b.dead) { n++; if (b.on !== false && (b.sat ?? 1) > 0.2) p++; }
    return { n, powered: p };
  }
  /** research speed multiplier (stations, mastery) */
  rate() { const s = this.stations().powered; return s <= 0 ? 0 : Math.pow(s, 0.8) * this.mastery.mod('research.speed'); }
  /** the head of the queue waits on data it does not have yet */
  stalled(): string | null {
    const id = this.queue[0]; if (!id) return null;
    if (this.stations().n === 0) return 'NO RESEARCH STATION';
    if (this.stations().powered === 0) return 'STATION UNPOWERED';
    return this.prog <= 0 ? this.short(id) : null;
  }
  tick(dt: number) {
    const id = this.queue[0]; if (!id || dt <= 0) return;
    const t = TECH[id];
    if (!t || this.done.has(id)) { this.queue.shift(); this.prog = 0; return; }
    if (this.why(id)) return;
    const r = this.rate(); if (r <= 0) return;
    // data is committed when work starts
    if (this.prog <= 0) {
      if (this.short(id)) return;
      for (const k of DATA_KINDS) this.data[k] -= t.cost[k] ?? 0;
      this.prog = 1e-4; this.emit('data', { kind: null, n: 0 });
    }
    this.prog += dt * r;
    if (this.prog >= t.time) { this.queue.shift(); this.prog = 0; this.complete(id); }
  }
  /** unlock now (the queue's end, story rewards, tests) */
  complete(id: string, quiet = false) {
    const t = TECH[id]; if (!t || this.done.has(id)) return;
    this.done.add(id);
    const sk = this.skills(); if (sk) for (const s of t.grants ?? []) sk.owned.add(s);
    if (quiet) return;
    this.mastery.gain(t.path, 20 + this.costSum(t) * 0.6, 'Research: ' + t.name);
    this.emit('unlock', { id, tech: t });
    anyG(this.g!)?.emit?.('research-unlock', { id, tech: t });
  }
  /** progress of the head, 0..1 */
  headFrac() { const id = this.queue[0]; const t = id ? TECH[id] : null; return t && t.time > 0 ? Math.min(1, this.prog / t.time) : 0; }

  // ---------------------------------------------------------------- data
  addData(kind: DataKind, n: number, why = '') {
    if (!(n > 0)) return;
    if (kind === 'bio') n *= Math.max(0.2, this.mastery.mod('scan.bio'));
    this.data[kind] += n; this.total[kind] += n;
    this.emit('data', { kind, n, why });
    anyG(this.g!)?.emit?.('research-data', { kind, n, why });
  }
  /** pay out a hit: full on the first scan, then a fifth, then nothing after five looks */
  private pay(h: Omit<ScanHit, 'first'>): ScanHit | null {
    const seen = this.scans.get(h.key) ?? 0;
    if (seen >= 5) return null;
    this.scans.set(h.key, seen + 1);
    const f = seen === 0 ? 1 : 0.2, data: Partial<Record<DataKind, number>> = {};
    const boost = anyG(this.g!)?.upgrades?.has?.('tool_scanner2') ? 1.5 : 1;
    for (const k of DATA_KINDS) { const v = (h.data[k] ?? 0) * f * boost; if (v > 0) { data[k] = Math.round(v * 10) / 10; this.addData(k, v, h.name); } }
    const hit = { ...h, data, first: seen === 0 };
    this.log.unshift({ name: h.name, kind: h.kind, data, t: this.g ? gtime(this.g) : 0 }); if (this.log.length > 30) this.log.length = 30;
    this.emit('scan', hit);
    return hit;
  }
  /** scan everything in reach of (x, z): returns what paid */
  scanAt(x: number, z: number, r = 12): ScanHit[] {
    const g = this.g as unknown as Record<string, any>; if (!g) return [];
    r *= this.mastery.mod('scan.radius') * (g.upgrades?.has?.('pod_sensor') ? 1.5 : 1);
    const out: ScanHit[] = [], r2 = r * r;
    const push = (h: ScanHit | null) => { if (h) out.push(h); };
    // species: one hit per species
    const spSeen = new Set<string>();
    for (const c of g.world?.creatures ?? []) {
      if (c.dead || (c.x - x) ** 2 + (c.z - z) ** 2 > r2) continue;
      const name: string = c.sp?.name ?? 'Creature'; if (spSeen.has(name)) continue; spSeen.add(name);
      const big = Math.min(3, Math.max(0.5, c.size ?? 1));
      push(this.pay({ key: 'sp:' + name, kind: 'species', name, data: { bio: 6 + big * 3, xeno: c.sp?.design?.lineage === 'titan' ? 4 : 0 }, x: c.x, z: c.z }));
    }
    // plants: one hit per plant species
    const fl = g.world?.flora;
    if (fl?.near) {
      const kinds = new Map<number, [number, number]>();
      try { fl.near(x, z, r, (i: number) => { const s = fl.sp?.[i]; if (s !== undefined && !kinds.has(s) && (fl.bio?.[i] ?? 1) > 0) kinds.set(s, [fl.x[i], fl.z[i]]); }); } catch { /* flora api */ }
      for (const [s, [px, pz]] of kinds) {
        const sp = fl.species?.[s]; const name: string = sp?.name ?? 'Plant';
        push(this.pay({ key: 'pl:' + name, kind: 'plant', name, data: { bio: sp?.tree ? 5 : 3, energy: sp?.glow ? 2 : 0 }, x: px, z: pz }));
      }
    }
    // ore bodies and crystal
    const R = g.region;
    for (const d of R?.deposits ?? []) {
      if (d.hidden || (d.x - x) ** 2 + (d.z - z) ** 2 > (r + d.r) ** 2) continue;
      const name = d.kind === 'crystal' ? 'Crystal Seam' : ((d.ore && (ORES as Record<string, { name: string }>)[d.ore]?.name) || 'Ore') + ' Deposit';
      const rare = (d.tier ?? 0) >= 2;
      push(this.pay({ key: 'ore:' + (d.ore ?? d.kind) + (rare ? ':rare' : ''), kind: d.kind === 'crystal' ? 'crystal' : 'ore', name, data: d.kind === 'crystal' ? { geo: 3, energy: 4, xeno: rare ? 3 : 0 } : { geo: 5 + (rare ? 5 : 0), xeno: rare ? 2 : 0 }, x: d.x, z: d.z }));
    }
    // vents and thermal springs
    for (const v of R?.vents ?? []) if ((v.x - x) ** 2 + (v.z - z) ** 2 <= r2) push(this.pay({ key: 'vent:' + Math.round(v.x) + ',' + Math.round(v.z), kind: 'vent', name: 'Steam Vent', data: { energy: 5, geo: 1 }, x: v.x, z: v.z }));
    for (const s of R?.springs ?? []) if ((s.x - x) ** 2 + (s.z - z) ** 2 <= r2) push(this.pay({ key: 'spring:' + Math.round(s.x) + ',' + Math.round(s.z), kind: 'vent', name: s.kind === 'geyser' ? 'Geyser' : s.kind === 'mineral' ? 'Mineral Pool' : 'Hot Spring', data: { energy: s.kind === 'geyser' ? 7 : 4, geo: 2 }, x: s.x, z: s.z }));
    // ruins
    for (const u of this.ruins) if ((u.x - x) ** 2 + (u.z - z) ** 2 <= (r + 2) ** 2) push(this.pay({ key: u.key, kind: 'ruin', name: u.name, data: { xeno: 12, geo: 3, energy: 2 }, x: u.x, z: u.z }));
    if (out.length) {
      const xp: Record<string, number> = {};
      for (const h of out) { const p = h.kind === 'species' ? 'bio' : h.kind === 'plant' ? 'plant' : h.kind === 'vent' || h.kind === 'crystal' ? 'energy' : h.kind === 'ore' ? 'industry' : 'robotics'; xp[p] = (xp[p] ?? 0) + (h.first ? 6 : 1); }
      for (const p in xp) this.mastery.gain(p as never, xp[p], 'Scanning');
    }
    return out;
  }
  scanned(key: string) { return (this.scans.get(key) ?? 0) > 0; }

  toJSON() { return { data: { ...this.data }, total: { ...this.total }, done: [...this.done], queue: [...this.queue], prog: this.prog, scans: [...this.scans] }; }
  load(d: any) {
    if (!d || typeof d !== 'object') return;
    for (const k of DATA_KINDS) { this.data[k] = Math.max(0, Number(d.data?.[k]) || 0); this.total[k] = Math.max(this.data[k], Number(d.total?.[k]) || 0); }
    for (const id of Array.isArray(d.done) ? d.done : []) if (TECH[id]) this.done.add(id);
    this.queue = (Array.isArray(d.queue) ? d.queue : []).filter((id: string) => TECH[id] && !this.done.has(id));
    this.prog = Number(d.prog) || 0;
    if (Array.isArray(d.scans)) this.scans = new Map(d.scans.filter((e: unknown) => Array.isArray(e)));
    const sk = this.skills(); if (sk) for (const id of this.done) for (const s of TECH[id]?.grants ?? []) sk.owned.add(s);
  }
}
