// TROOPS · THE UNITS. One shape over every unit the player commands: the Corps' robots (game.robots, faction 'veyr'),
// the cyborg workers and engineered creatures (veyr creatures), the two teammates (colony.teammates) and the drones
// (colony.drones). Each Troop adapter knows how to move, fight, work, stop and hold its own kind through that kind's
// own API (RobotUnit.order, biotech.order / factory.workers, Teammate.order, Drone.order), what its body looks like
// (for the portraits), and its needs. The TState beside it is the human side: a callsign, morale, fatigue, wear,
// charge, wounds, a history of health and morale, kills, and the order queue (orders.ts runs it).
import * as THREE from 'three';
import type { Game } from '../game/game';

export type TKind = 'robot' | 'worker' | 'crew' | 'drone';
type G = Game & Record<string, any>;

export interface Wound { t: number; dmg: number; src: string }
export interface Sample { t: number; hp: number; mor: number }
export type OrderK = 'move' | 'amove' | 'attack' | 'gather' | 'build' | 'repair' | 'follow' | 'guard' | 'patrol' | 'hold' | 'stop';
/** something an order points at: read its position live through pos() */
export interface Target { kind: 'robot' | 'creature' | 'troop' | 'fbuilding' | 'site' | 'struct' | 'pod' | 'deposit' | 'flora' | 'faction' | 'point'; ref: any; x: number; z: number }
export interface TOrder {
  k: OrderK; x: number; z: number; tgt?: Target | null;
  issued?: boolean; t?: number;
  /** the patrol's far end, the hold point, the last re-issued spot (follow / guard) */
  ax?: number; az?: number; lx?: number; lz?: number;
  /** a crew member's patrol leg */
  leg?: number;
}
export interface TState {
  key: string; call: string;
  morale: number; fatigue: number; wear: number; charge: number;
  wounds: Wound[]; hist: Sample[]; kills: number; orders: number; born: number;
  cur: TOrder | null; queue: TOrder[];
  lastHp: number; histT: number;
  squad: number | null;
  /** an order reaction playing (seconds left) and its kind */
  react: number; reactK: 'ack' | 'hit' | 'cheer' | 'balk';
  /** a low-morale unit hesitates before it obeys */
  balkT: number;
  dead: boolean;
}

const CALLS = ['ROOK', 'BIX', 'MOSS', 'TALLY', 'GRIT', 'NOX', 'PIKE', 'DUSK', 'BRAM', 'KESTREL', 'HUSK', 'FENN', 'COBB', 'ORE', 'SPRAT', 'WREN', 'BOLT', 'KNOT', 'TACK', 'MARL', 'FLINT', 'DRUM', 'LARK', 'SLATE', 'TUCK', 'VANE', 'ASH', 'BURR', 'CRAG', 'DIRK'];
export const ROBOT_SHORT: Record<string, string> = { scout: 'SC', worker: 'WK', trooper: 'TR', heavy: 'HV', artillery: 'AR', walker: 'QW', sov_drone: 'RD', sov_trooper: 'IM', sov_tank: 'BT', sov_titan: 'TT', prc_scout: 'TS', prc_trooper: 'RM', prc_mech: 'HX', expedition_soldier: 'EX', expedition_heavy: 'PA', expedition_engineer: 'EN', expedition_officer: 'OF', expedition_crew: 'DH', expedition_rover: 'RV' };
const hashS = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** the unit adapter: everything the order book, the cards and the screen need from one unit */
export abstract class Troop {
  abstract readonly key: string; abstract readonly kind: TKind;
  /** grouping key (double-click selects every unit of it) */
  abstract readonly type: string;
  abstract readonly ref: any;
  constructor(readonly g: G) {}
  abstract get alive(): boolean;
  abstract get x(): number; abstract get z(): number; abstract get y(): number;
  abstract get height(): number; abstract get radius(): number;
  abstract get hp01(): number;
  abstract get typeName(): string;
  /** the Object3D whose clone is the portrait */
  abstract visual(): THREE.Object3D | null;
  get flies() { return false; }
  get canAttack() { return true; }
  get canGather() { return false; }
  get canBuild() { return false; }
  get canRepair() { return false; }
  /** nominal walking speed m/s (formation spacing, ETAs) */
  get speed() { return 2; }
  /** morale 0..1 from the unit's own system, or null (then TState.morale rules) */
  ownMorale(): number | null { return null; }
  /** needs 0..1 (1 = fine) or null when it has none of that kind */
  needs(st: TState): { food: number | null; rest: number | null; maint: number | null } { return { food: null, rest: null, maint: 1 - st.wear }; }
  /** what it is doing in one or two words (its own systems, when no order of ours is running) */
  abstract ownJob(): string;
  // primitives (each kind through its own API)
  abstract moveTo(x: number, z: number, attack?: boolean): void;
  abstract attack(t: Target): void;
  abstract stop(): void;
  abstract holdAt(x: number, z: number): void;
  abstract patrol(x: number, z: number): void;
  abstract guardAt(x: number, z: number): void;
  /** start a gather / build job at a target; false when it cannot */
  gather(_t: Target): boolean { return false; }
  build(_t: Target): boolean { return false; }
  /** a creature it may shoot at (stance) */
  dropTarget() { /* only the robots keep a target of their own */ }
  /** does its own AI have a fight on */
  get fighting() { return false; }
  /** its weapon, for the cards */
  gear(): { icon: string; name: string; val?: string }[] { return []; }
  /** an in-world nod when it takes an order (applied around the render) */
  body(): THREE.Object3D | null { return this.visual(); }
}

// ------------------------------------------------------------------ robots
export class RobotTroop extends Troop {
  readonly kind = 'robot'; readonly key: string; readonly type: string;
  constructor(g: G, readonly ref: any) { super(g); this.key = 'r:' + ref.id; this.type = 'robot:' + ref.kind; }
  get alive() { return !this.ref.dead && !this.ref.removed; }
  get x() { return this.ref.x; } get z() { return this.ref.z; } get y() { return this.ref.y; }
  get height() { return this.ref.height ?? 1; } get radius() { return this.ref.radius ?? 0.4; }
  get hp01() { return Math.max(0, this.ref.hp / this.ref.maxHp); }
  get typeName() { return String(this.ref.st?.name ?? this.ref.kind).toUpperCase(); }
  get flies() { return !!this.ref.fly; }
  get canGather() { return this.ref.kind === 'worker'; }
  get canBuild() { return this.ref.kind === 'worker'; }
  get canRepair() { return this.ref.kind === 'worker'; }
  get speed() { return this.ref.st?.speed ?? 2; }
  visual() { return this.ref.mesh ?? null; }
  needs(st: TState) { return { food: st.charge, rest: null, maint: 1 - st.wear }; }
  ownJob() {
    const u = this.ref;
    if (u.tgt && !u.tgt.ref?.dead) return 'ENGAGING';
    const o = u.ord;
    if (!o) return u.kind === 'worker' ? 'HAULING' : 'STANDBY';
    return ({ move: 'MOVING', attack: 'ADVANCING', guard: 'GUARDING', patrol: 'PATROL', work: 'HAULING' } as Record<string, string>)[o.k] ?? 'STANDBY';
  }
  get fighting() { return !!this.ref.tgt && !this.ref.tgt.ref?.dead; }
  moveTo(x: number, z: number, attack = false) { this.ref.order({ k: attack ? 'attack' : 'move', x, z }); }
  attack(t: Target) { this.ref.order({ k: 'attack', target: t.ref, x: t.x, z: t.z }); }
  stop() { this.ref.ord = null; this.ref.tgt = null; this.ref.order?.({ k: 'guard', x: this.ref.x, z: this.ref.z }); }
  holdAt(x: number, z: number) { this.ref.order({ k: 'guard', x, z }); }
  patrol(x: number, z: number) { this.ref.order({ k: 'patrol', x, z }); }
  guardAt(x: number, z: number) { this.ref.order({ k: 'guard', x, z }); }
  gather(t: Target) { if (this.ref.kind !== 'worker') return false; this.ref.order({ k: 'work', x: t.x, z: t.z }); return true; }
  build(t: Target) { if (this.ref.kind !== 'worker') return false; this.ref.order({ k: 'work', x: t.x, z: t.z }); return true; }
  dropTarget() { this.ref.tgt = null; }
  gear() {
    const w = this.ref.weapon ?? {}, s = this.ref.st ?? {};
    const shot = ({ bullet: 'gun', shell: 'shell', mortar: 'mortar', rocket: 'rocket', melee: 'claw', flame: 'flame', beam: 'beam', cloud: 'cloud' } as Record<string, string>)[w.shot] ?? 'gun';
    return [
      { icon: shot, name: String(w.shot ?? 'GUN').toUpperCase(), val: `${Math.round((w.dmg ?? 0) * (w.burst ?? 1))}` },
      { icon: 'range', name: 'RANGE', val: `${Math.round(w.range ?? 0)}` },
      { icon: 'armour', name: 'ARMOUR', val: `${Math.round((s.armor ?? 0) * 100)}` },
      { icon: 'speed', name: 'SPEED', val: (s.speed ?? 0).toFixed(1) },
    ];
  }
}

// ------------------------------------------------------------------ cyborg workers and engineered creatures
export class WorkerTroop extends Troop {
  readonly kind = 'worker'; readonly key: string; readonly type: string;
  constructor(g: G, readonly ref: any) { super(g); this.key = 'c:' + ref.id; this.type = 'worker:' + (ref.sp?.id ?? ref.sp?.name); }
  get alive() { return !this.ref.dead && this.ref.faction === 'veyr'; }
  get x() { return this.ref.x; } get z() { return this.ref.z; } get y() { return this.ref.y + (this.ref.air ?? 0); }
  get height() { return Math.max(0.5, (this.ref.sp?.pheno?.height ?? this.ref.size * 0.7) * (this.ref.growth ?? 1)); }
  get radius() { return this.ref.radius ?? 0.4; }
  get hp01() { return Math.max(0, this.ref.hp / this.ref.maxHp); }
  get typeName() { return String(this.ref.sp?.name ?? 'WORKER').toUpperCase(); }
  private fw() { return this.g.factory?.workers?.of?.(this.ref) ?? null; }
  private bw() { return (this.g.biotech?.workers as Map<number, any> | undefined)?.get?.(this.ref.id) ?? null; }
  get fit(): string[] { return (this.ref.sp?.design?.fit as string[] | undefined) ?? []; }
  get canGather() { return true; }
  get canBuild() { return true; }
  get canRepair() { return this.fit.includes('cy_welder'); }
  get speed() { return this.ref.speed ?? 2; }
  visual() { return this.ref.mesh ?? null; }
  ownMorale() { const w = this.fw(); return w && typeof w.mood === 'number' ? Math.max(0, Math.min(1, w.mood)) : null; }
  needs(st: TState) { const w = this.fw(); return { food: w && typeof w.hunger === 'number' ? Math.max(0, Math.min(1, w.hunger)) : Math.max(0, Math.min(1, this.ref.energy ?? 0.8)), rest: 1 - st.fatigue, maint: this.fit.length ? 1 - st.wear : null }; }
  ownJob() {
    const b = this.bw(); if (b && b.job && b.job !== 'idle') return String(b.note || b.job).toUpperCase().slice(0, 14);
    const w = this.fw(); if (w && w.job && w.job !== 'idle') return ({ haul: 'HAULING', build: 'BUILDING', operate: 'OPERATING', mine: 'MINING', forage: 'FORAGING', pen: 'PENNED' } as Record<string, string>)[w.job] ?? String(w.job).toUpperCase();
    const o = this.ref.order; if (o) return ({ move: 'MOVING', attack: 'ATTACKING', amove: 'ADVANCING', hold: 'HOLDING', guard: 'GUARDING' } as Record<string, string>)[o.kind] ?? 'MOVING';
    return 'ROAMING';
  }
  get fighting() { return this.ref.mind === 'attack'; }
  private bt() { return this.g.biotech ?? null; }
  private raw(kind: 'move' | 'attack' | 'amove' | 'hold' | 'guard', x: number, z: number, target?: number) {
    const c = this.ref; this.g.factory?.workers?.release?.(c);
    c.order = { kind, x, z, target }; c.path = null; c.mind = 'order'; c.homeX = x; c.homeZ = z;
  }
  moveTo(x: number, z: number, attack = false) {
    const b = this.bt(); this.ref.homeX = x; this.ref.homeZ = z;
    if (b?.order) b.order(this.ref, attack ? { k: 'attack', x, z } : { k: 'move', x, z }); else this.raw(attack ? 'amove' : 'move', x, z);
  }
  attack(t: Target) {
    const b = this.bt();
    if (t.kind === 'creature') { if (b?.order) b.order(this.ref, { k: 'attack', target: t.ref }); else this.raw('attack', t.x, t.z, t.ref.id); }
    else this.moveTo(t.x, t.z, true);
  }
  stop() { const b = this.bt(); if (b?.order) b.order(this.ref, { k: 'guard', x: this.ref.x, z: this.ref.z }); else this.raw('hold', this.ref.x, this.ref.z); }
  holdAt(x: number, z: number) { const b = this.bt(); if (b?.order) b.order(this.ref, { k: 'guard', x, z }); else this.raw('hold', x, z); }
  patrol(x: number, z: number) { const b = this.bt(); if (b?.order) b.order(this.ref, { k: 'patrol', x, z }); else this.raw('amove', x, z); }
  guardAt(x: number, z: number) { const b = this.bt(); if (b?.order) b.order(this.ref, { k: 'guard', x, z }); else this.raw('guard', x, z); }
  gather(t: Target) {
    const c = this.ref, W = this.g.factory?.workers, b = this.bt();
    if (t.kind === 'deposit') {
      const i = (this.g.region?.deposits ?? []).indexOf(t.ref);
      if (b?.workAt && !b.workAt([c], t.x, t.z)) return true;
      if (W && i >= 0 && !W.assign(c, 'mine', null, i)) return true;
    }
    if (t.kind === 'flora') { if (b?.workAt && !b.workAt([c], t.x, t.z)) return true; if (W && !W.assign(c, 'forage')) return true; }
    if (b?.workAt) return !b.workAt([c], t.x, t.z);
    return false;
  }
  build(_t: Target) { const W = this.g.factory?.workers; if (!W) return false; return !W.assign(this.ref, 'build'); }
  gear() {
    const out: { icon: string; name: string; val?: string }[] = [];
    let CY: Record<string, any> = {};
    try { CY = (WorkerTroop.cyber ??= {}) as Record<string, any>; } catch { /* */ }
    for (const id of this.fit) out.push({ icon: 'part:' + id, name: String(CY[id]?.name ?? id.replace(/^cy_/, '')).toUpperCase() });
    out.push({ icon: 'speed', name: 'SPEED', val: (this.ref.speed ?? 0).toFixed(1) });
    return out;
  }
  static cyber: Record<string, any> | null = null;
}

// ------------------------------------------------------------------ the teammates
export class CrewTroop extends Troop {
  readonly kind = 'crew'; readonly key: string; readonly type = 'crew';
  constructor(g: G, readonly ref: any) { super(g); this.key = 't:' + ref.id; }
  get alive() { return !!this.ref.alive && !this.ref.staged; }
  get x() { return this.ref.x; } get z() { return this.ref.z; } get y() { return this.ref.y; }
  get height() { return 1.85; } get radius() { return 0.35; }
  get hp01() { return Math.max(0, this.ref.hp / 100); }
  get typeName() { return String(this.ref.title ?? 'CREW'); }
  get canGather() { return true; } get canBuild() { return true; } get canRepair() { return true; }
  get speed() { return 1.5; }
  visual() { return (this.ref.crewModel?.root as THREE.Object3D | undefined) ?? this.ref.root ?? null; }
  body() { return this.ref.root ?? null; }
  ownMorale() { return Math.max(0, Math.min(1, (this.ref.morale ?? 70) / 100)); }
  needs() { const t = this.ref; return { food: 1 - (t.hunger ?? 0) / 100, rest: 1 - (t.fatigue ?? 0) / 100, maint: (t.suit ?? 100) / 100 }; }
  ownJob() { return String(this.ref.jobLabel ?? 'IDLE'); }
  get fighting() { return this.ref.job?.k === 'defend'; }
  /** a player order (counts for the quests) or a quiet re-issue (follow / hold upkeep) */
  job(j: any, player: boolean) { const t = this.ref; if (!t.alive || t.staged) return; if (player) t.order(j); else { t.queue = []; t.job = j; } }
  moveTo(x: number, z: number) { this.job({ k: 'move', x, z }, true); }
  attack(t: Target) { if (t.kind === 'creature') this.job({ k: 'defend', x: t.x, z: t.z, target: t.ref, label: 'ENGAGING' }, true); else this.moveTo(t.x, t.z); }
  stop() { const t = this.ref; t.queue = []; t.job = null; }
  holdAt(x: number, z: number) { this.job({ k: 'move', x, z, label: 'HOLDING' }, false); }
  patrol(x: number, z: number) { this.job({ k: 'move', x, z, label: 'PATROL' }, true); }
  guardAt(x: number, z: number) { this.job({ k: 'move', x, z, label: 'GUARDING' }, false); }
  gather(t: Target) { this.job({ k: 'sample', x: t.x, z: t.z, label: 'SAMPLING' }, true); return true; }
  build(t: Target) {
    if (t.kind === 'struct' && !t.ref.done) { this.job({ k: 'build', x: t.ref.x, z: t.ref.z, target: t.ref }, true); return true; }
    this.job({ k: 'move', x: t.x, z: t.z, label: 'BUILDING' }, true); return true;
  }
  gear() { const t = this.ref; return [{ icon: 'gun', name: 'CARBINE', val: '7' }, { icon: 'suit', name: 'SUIT', val: `${Math.round(t.suit ?? 100)}` }]; }
}

// ------------------------------------------------------------------ drones
export class DroneTroop extends Troop {
  readonly kind = 'drone'; readonly key: string; readonly type: string;
  constructor(g: G, readonly ref: any) { super(g); this.key = 'd:' + ref.id; this.type = 'drone:' + ref.kind; }
  get alive() { return this.ref.hp > 0 && this.g.colony?.drones?.includes(this.ref); }
  get x() { return this.ref.x; } get z() { return this.ref.z; } get y() { return this.ref.y - (this.ref.def?.alt ?? 3) * 0.0; }
  get height() { return 0.6; } get radius() { return 0.6 * (this.ref.def?.size ?? 1); }
  get hp01() { return Math.max(0, this.ref.hp / this.ref.maxHp); }
  get typeName() { return String(this.ref.def?.name ?? 'DRONE').toUpperCase(); }
  get flies() { return true; }
  get canAttack() { return false; }
  get canGather() { return this.ref.kind === 'carrier'; }
  get canRepair() { return this.ref.kind === 'repair'; }
  get speed() { return this.ref.speed ?? 6; }
  visual() { return this.ref.root ?? null; }
  needs(st: TState) { const d = this.ref; return { food: d.battery / (d.def?.battery ?? 100), rest: null, maint: 1 - st.wear }; }
  ownJob() { const d = this.ref; if (d.steering) return 'STEERED'; if (d.docked) return d.battery < (d.def?.battery ?? 100) * 0.95 ? 'CHARGING' : 'DOCKED'; const o = d.order; if (!o) return 'HOVERING'; return ({ move: 'FLYING', patrol: 'PATROL', return: 'RETURNING', work: 'WORKING' } as Record<string, string>)[o.k] ?? 'FLYING'; }
  private signal(x: number, z: number) { const c = this.g.colony; return !c?.signalAt || c.signalAt(x, z) > 0.05; }
  moveTo(x: number, z: number) { if (!this.signal(x, z)) return; const d = this.ref; d.order = { k: 'move', x, z }; d.docked = false; }
  attack(t: Target) { this.moveTo(t.x, t.z); }
  stop() { const d = this.ref; d.order = { k: 'move', x: d.x, z: d.z }; }
  holdAt(x: number, z: number) { this.moveTo(x, z); }
  patrol(x: number, z: number) { if (!this.signal(x, z)) return; const d = this.ref; d.order = { k: 'patrol', pts: [[d.x, d.z], [x, z]], i: 1 }; d.docked = false; }
  guardAt(x: number, z: number) { this.moveTo(x, z); }
  gather(t: Target) { if (this.ref.kind !== 'carrier') return false; this.ref.order = { k: 'work', x: t.x, z: t.z }; this.ref.docked = false; return true; }
  build(t: Target) { if (this.ref.kind !== 'repair') return false; this.ref.order = { k: 'work', x: t.x, z: t.z }; this.ref.docked = false; return true; }
  gear() { const d = this.ref; return [{ icon: d.kind === 'scout' ? 'scan' : d.kind === 'carrier' ? 'hook' : 'wrench', name: String(d.def?.short ?? d.kind).toUpperCase() }, { icon: 'battery', name: 'CELL', val: `${Math.round(d.battery)}` }, { icon: 'speed', name: 'SPEED', val: (d.speed ?? 0).toFixed(1) }]; }
}

// ------------------------------------------------------------------ the roster
const adapters = new WeakMap<object, Troop>();
function adapt<T extends Troop>(ref: object, make: () => T): T { let a = adapters.get(ref) as T | undefined; if (!a) { a = make(); adapters.set(ref, a); } return a; }
/** every living unit the player commands, in a stable order: robots, workers, crew, drones */
export function allTroops(g: G): Troop[] {
  const out: Troop[] = [];
  for (const u of (g.robots ?? []) as any[]) if (u.faction === 'veyr' && !u.dead && !u.removed) out.push(adapt(u, () => new RobotTroop(g, u)));
  const W = g.world?.creatures as any[] | undefined;
  if (W) for (const c of W) if (c.faction === 'veyr' && !c.dead && c.mesh?.visible !== false && c.mind !== 'held') out.push(adapt(c, () => new WorkerTroop(g, c)));
  const col = g.colony;
  if (col) {
    for (const t of col.teammates ?? []) if (t.alive && !t.staged) out.push(adapt(t, () => new CrewTroop(g, t)));
    for (const d of col.drones ?? []) if (d.hp > 0) out.push(adapt(d, () => new DroneTroop(g, d)));
  }
  return out;
}
export function troopOf(g: G, ref: object): Troop | null { return adapters.get(ref) ?? null; }

/** a fresh state for a unit (its callsign from its key, so it keeps it) */
export function newState(t: Troop, now: number): TState {
  const h = hashS(t.key);
  let call: string;
  if (t.kind === 'crew') call = String(t.ref.short ?? t.ref.name ?? 'CREW');
  else if (t.kind === 'drone') call = String(t.ref.name ?? 'DRONE');
  else if (t.kind === 'robot') call = `${ROBOT_SHORT[t.ref.kind] ?? 'U'}-${String(t.ref.id % 100).padStart(2, '0')} ${CALLS[h % CALLS.length]}`;
  else call = CALLS[h % CALLS.length];
  return { key: t.key, call, morale: 0.72, fatigue: 0.1, wear: 0.05, charge: 1, wounds: [], hist: [], kills: 0, orders: 0, born: now, cur: null, queue: [], lastHp: t.hp01, histT: 0, squad: null, react: 0, reactK: 'ack', balkT: 0, dead: false };
}

/** where a target is now */
export function tpos(t: Target): { x: number; z: number } {
  const r = t.ref;
  if (t.kind === 'site') return { x: t.x, z: t.z };
  if (t.kind === 'troop') return { x: r.x, z: r.z };
  if (r && typeof r.x === 'number' && typeof r.z === 'number') return { x: r.x, z: r.z };
  return { x: t.x, z: t.z };
}
/** is a target still worth the order */
export function talive(t: Target): boolean {
  const r = t.ref; if (!r) return false;
  switch (t.kind) {
    case 'robot': return !r.dead && !r.removed;
    case 'creature': return !r.dead;
    case 'troop': return !!r.alive;
    case 'fbuilding': case 'faction': return !r.dead && (r.hp ?? 1) > 0;
    case 'deposit': return (r.amount ?? 1) > 0;
    case 'struct': return (r.hp ?? 1) > 0;
    default: return true;
  }
}
/** hp of a target that can be repaired: [hp, max] or null */
export function thp(t: Target): [number, number] | null {
  const r = t.ref; if (!r) return null;
  if (t.kind === 'troop') { const a = r as Troop; return a.kind === 'crew' ? null : [a.ref.hp, a.ref.maxHp]; }
  if (typeof r.hp === 'number' && typeof r.maxHp === 'number') return [r.hp, r.maxHp];
  return null;
}
