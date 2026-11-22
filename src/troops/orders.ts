// TROOPS · THE ORDER BOOK. Every unit's order queue (shift queues waypoints), run each sim tick through the unit's own
// API (units.ts adapters): move, attack-move, attack, gather, build, repair, follow, guard, patrol, hold, stop. Orders
// to a group are spread into a FORMATION (line, wedge, column) facing the way the group travels (or the way the
// player dragged). The human side lives here too: morale drifts with health, needs, company, losses, kills, the
// squad's stance and the pod's comfort, and it changes how a unit performs (rate of fire, aim, hesitation, a
// rout when it breaks); fatigue, wear and charge run down with work and recover at rest; wounds and a history of
// health and morale are kept for the TROOPS screen. SQUADS (named, a stance, an area) steer idle members.
import * as THREE from 'three';
import type { Game } from '../game/game';
import { allTroops, newState, tpos, talive, thp, type Troop, type TState, type TOrder, type Target, type OrderK } from './units';

type G = Game & Record<string, any>;
export type Formation = 'line' | 'wedge' | 'column';
export type Stance = 'aggressive' | 'defensive' | 'passive';
export interface Area { x: number; z: number; r: number }
export interface Squad { id: number; name: string; stance: Stance; area: Area | null; color: number }
export interface OrderEvent { k: OrderK; troops: Troop[]; x: number; z: number; tgt: Target | null; queued: boolean }
export const SQUAD_COLORS = [0xe0a040, 0x6fb7d9, 0x9fd27a, 0xd9786a, 0xc39adf];

const TOL: Record<string, number> = { robot: 1.1, worker: 1.4, crew: 0.7, drone: 1.8 };
const WAIT_MAX = 120;

export class OrderBook {
  readonly st = new Map<string, TState>();
  troops: Troop[] = [];
  formation: Formation = 'line';
  squads: Squad[] = [];
  /** a unit just died or was hurt: barks.ts listens */
  onOrder: ((e: OrderEvent) => void) | null = null;
  onEvent: ((k: 'died' | 'hurt' | 'kill' | 'break' | 'rally' | 'arrive' | 'balk', t: Troop, st: TState) => void) | null = null;
  private time = 0; private list0 = 0;
  /** each robot's stock weapon numbers (morale scales the live ones) */
  private base = new WeakMap<object, { cd: number; spread: number }>();
  constructor(readonly g: G) {
    const saved = (g.run?.flags as Record<string, unknown> | undefined)?.['troops'] as { squads?: Squad[]; members?: Record<string, number>; formation?: Formation } | undefined;
    this.squads = saved?.squads?.length ? saved.squads.map((s) => ({ ...s })) : [
      { id: 1, name: 'ALPHA', stance: 'defensive', area: null, color: SQUAD_COLORS[0] },
      { id: 2, name: 'BRAVO', stance: 'aggressive', area: null, color: SQUAD_COLORS[1] },
      { id: 3, name: 'CHARLIE', stance: 'passive', area: null, color: SQUAD_COLORS[2] },
    ];
    this.savedMembers = saved?.members ?? {};
    if (saved?.formation) this.formation = saved.formation;
  }
  private savedMembers: Record<string, number> = {};
  save() {
    const flags = (this.g.run?.flags ?? null) as Record<string, unknown> | null; if (!flags) return;
    const members: Record<string, number> = {};
    for (const s of this.st.values()) if (s.squad !== null && !s.dead) members[s.key] = s.squad;
    flags['troops'] = { squads: this.squads, members, formation: this.formation };
  }
  stateOf(t: Troop): TState {
    let s = this.st.get(t.key);
    if (!s) { s = newState(t, this.time); if (this.savedMembers[t.key] !== undefined) s.squad = this.savedMembers[t.key]; this.st.set(t.key, s); }
    return s;
  }
  get now() { return this.time; }
  squad(id: number | null) { return id === null ? null : this.squads.find((s) => s.id === id) ?? null; }
  members(id: number) { return this.troops.filter((t) => this.stateOf(t).squad === id); }

  // ------------------------------------------------------------------ issuing
  /**
   * give an order to a group. Ground orders spread into the formation (facing from the group to the point, or `face`
   * radians); target orders go to the target itself. queued: append (shift).
   */
  issue(k: OrderK, troops: Troop[], x: number, z: number, tgt: Target | null = null, queued = false, face?: number) {
    troops = troops.filter((t) => t.alive);
    if (!troops.length) return;
    const ground = !tgt && (k === 'move' || k === 'amove' || k === 'patrol' || k === 'guard' || k === 'hold');
    const spots = ground && troops.length > 1 ? this.slots(troops, x, z, this.formation, face, queued) : null;
    troops.forEach((t, i) => {
      const s = this.stateOf(t);
      const [ox, oz] = spots ? spots[i] : [x, z];
      const o: TOrder = { k, x: ox, z: oz, tgt, t: 0 };
      if (k === 'patrol') { o.ax = t.x; o.az = t.z; }
      if (k === 'stop') { s.cur = null; s.queue = []; t.stop(); return; }
      if (k === 'hold') { s.queue = []; s.cur = { k: 'hold', x: t.x, z: t.z, t: 0 }; this.start(t, s, s.cur); return; }
      s.orders++;
      if (queued && (s.cur || s.queue.length)) { s.queue.push(o); return; }
      s.queue = []; s.cur = o;
      // a broken unit hesitates (and says so)
      if (s.morale < 0.22 && k !== 'move' && Math.random() < 0.6) { s.balkT = 0.8 + Math.random() * 1.2; this.onEvent?.('balk', t, s); return; }
      this.start(t, s, o);
    });
    this.onOrder?.({ k, troops, x, z, tgt, queued });
    this.save();
  }
  /** formation slots for a group headed to (x, z): one point per unit, units matched to slots without crossing */
  slots(troops: Troop[], x: number, z: number, f: Formation, face?: number, queued = false): [number, number][] {
    const n = troops.length;
    // where they set out from: the end of their queues when queued, else where they stand
    let cx = 0, cz = 0;
    for (const t of troops) { const s = this.stateOf(t); const last = queued ? (s.queue[s.queue.length - 1] ?? s.cur) : null; cx += last ? last.x : t.x; cz += last ? last.z : t.z; }
    cx /= n; cz /= n;
    const ang = face ?? Math.atan2(x - cx, z - cz);
    const sp = Math.max(1.3, Math.max(...troops.map((t) => t.radius)) * 2.6);
    const local: [number, number][] = [];
    if (f === 'line') {
      const ranks = n > 8 ? 2 : 1, w = Math.ceil(n / ranks);
      for (let i = 0; i < n; i++) { const r = Math.floor(i / w), c = i % w, rw = r === ranks - 1 ? n - w * (ranks - 1) : w; local.push([(c - (rw - 1) / 2) * sp, -r * sp]); }
    } else if (f === 'wedge') {
      for (let i = 0; i < n; i++) { if (i === 0) { local.push([0, 0]); continue; } const row = Math.ceil(i / 2), side = i % 2 ? -1 : 1; local.push([side * row * sp * 0.75, -row * sp * 0.8]); }
    } else {
      const w = n > 5 ? 2 : 1;
      for (let i = 0; i < n; i++) local.push([w === 2 ? ((i % 2) - 0.5) * sp : 0, -Math.floor(i / w) * sp * 0.95]);
    }
    // centre the block on the point (the line and column), the wedge's tip on it
    if (f !== 'wedge') { const mz = local.reduce((a, p) => a + p[1], 0) / n; for (const p of local) p[1] -= mz; }
    const s = Math.sin(ang), c = Math.cos(ang);
    // right of the facing = (cos, -sin)
    const world = local.map(([lx, lz]): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c]);
    // match: sort units and slots by their lateral then depth coordinate along the facing
    const lat = (px: number, pz: number) => (px - x) * c - (pz - z) * s, dep = (px: number, pz: number) => (px - x) * s + (pz - z) * c;
    const ui = troops.map((t, i) => i).sort((a, b) => (dep(troops[b].x, troops[b].z) - dep(troops[a].x, troops[a].z)) * 0.35 + lat(troops[a].x, troops[a].z) - lat(troops[b].x, troops[b].z));
    const si = world.map((_, i) => i).sort((a, b) => (dep(world[b][0], world[b][1]) - dep(world[a][0], world[a][1])) * 0.35 + lat(world[a][0], world[a][1]) - lat(world[b][0], world[b][1]));
    const out: [number, number][] = new Array(n);
    const N = this.g.region?.N ?? 1e9;
    ui.forEach((u, k) => { const p = world[si[k]]; out[u] = [Math.max(1, Math.min(N - 1, p[0])), Math.max(1, Math.min(N - 1, p[1]))]; });
    return out;
  }
  /** start an order through the unit's own API */
  private start(t: Troop, s: TState, o: TOrder) {
    o.issued = true; o.t = 0; o.lx = undefined; o.lz = undefined;
    const tg = o.tgt;
    switch (o.k) {
      case 'move': t.moveTo(o.x, o.z, false); break;
      case 'amove': t.moveTo(o.x, o.z, true); break;
      case 'attack': if (tg) { if (t.canAttack) t.attack(tg); else t.moveTo(tg.x, tg.z); } break;
      case 'gather': if (tg && !t.gather(tg)) t.moveTo(tg.x, tg.z); break;
      case 'build': if (tg && !t.build(tg)) t.moveTo(tg.x, tg.z); break;
      case 'repair': if (tg) { const p = tpos(tg); if (t.kind === 'crew') (t as unknown as { job(j: unknown, p: boolean): void }).job({ k: 'repair', x: p.x, z: p.z, target: repairable(tg) }, true); else t.moveTo(p.x, p.z); } break;
      case 'follow': case 'guard': if (tg) { const p = tpos(tg); this.near(t, o, p.x, p.z); } else t.guardAt(o.x, o.z); break;
      case 'patrol': t.patrol(o.x, o.z); o.leg = 1; break;
      case 'hold': t.holdAt(o.x, o.z); break;
    }
    void s;
  }
  /** keep near a moving target (re-issued quietly when it has moved off) */
  private near(t: Troop, o: TOrder, px: number, pz: number) {
    const k = Number(t.key.replace(/\D/g, '')) || 1, a = (k * 2.399) % (Math.PI * 2), r = o.k === 'guard' ? 2.6 : 1.8;
    const gx = px + Math.sin(a) * r, gz = pz + Math.cos(a) * r;
    if (o.lx !== undefined && Math.hypot(gx - o.lx, gz - (o.lz ?? 0)) < 1.6) return;
    o.lx = gx; o.lz = gz;
    if (t.kind === 'crew') (t as unknown as { job(j: unknown, p: boolean): void }).job({ k: 'move', x: gx, z: gz, label: o.k === 'guard' ? 'GUARDING' : 'FOLLOWING' }, false);
    else if (o.k === 'guard') t.guardAt(gx, gz); else t.moveTo(gx, gz);
  }

  // ------------------------------------------------------------------ the tick
  update(dt: number) {
    const g = this.g;
    this.time += dt;
    const list = allTroops(g);
    // the dead: a last word, and the squad remembers
    if (list.length !== this.list0 || dt > 0) {
      const alive = new Set(list.map((t) => t.key));
      for (const t of this.troops) if (!alive.has(t.key)) { const s = this.st.get(t.key); if (s && !s.dead && !t.alive) { s.dead = true; this.onEvent?.('died', t, s); this.mourn(t, list); } }
      this.list0 = list.length;
    }
    this.troops = list;
    if (dt <= 0) return;
    for (const t of list) {
      const s = this.stateOf(t);
      this.human(t, s, dt);
      if (s.balkT > 0) { s.balkT -= dt; if (s.balkT <= 0 && s.cur && !s.cur.issued) this.start(t, s, s.cur); else if (s.balkT <= 0 && s.cur) this.start(t, s, s.cur); continue; }
      this.run(t, s, dt);
      this.stance(t, s);
    }
  }
  /** morale, fatigue, wear, charge, wounds, the history */
  private human(t: Troop, s: TState, dt: number) {
    const g = this.g, hp = t.hp01;
    // wounds: every real drop in health
    if (hp < s.lastHp - 0.004) {
      const dmg = (s.lastHp - hp) * (t.kind === 'crew' ? 100 : (t.ref.maxHp ?? 100));
      const by = t.ref.lastHit?.by, src = by?.kind ? String(by.kind) : by?.sp ? 'claw' : t.kind === 'crew' && (t.ref.suit ?? 100) <= 0 ? 'o2' : t.kind === 'crew' && (t.ref.hunger ?? 0) >= 100 ? 'hunger' : 'hit';
      const w = s.wounds[s.wounds.length - 1];
      if (w && this.time - w.t < 2.5 && w.src === src) w.dmg += dmg; else s.wounds.push({ t: this.time, dmg, src });
      if (s.wounds.length > 24) s.wounds.shift();
      if (dmg > 2) { s.react = 0.5; s.reactK = 'hit'; this.onEvent?.('hurt', t, s); }
      s.morale -= Math.min(0.12, dmg * 0.004);
    }
    s.lastHp = hp;
    // effort: moving and fighting tire, standing rests; machines wear and draw charge
    const busy = t.fighting || !!s.cur && s.cur.k !== 'hold';
    s.fatigue = clamp01(s.fatigue + dt * (busy ? 0.0016 : -0.0035));
    s.wear = clamp01(s.wear + dt * (t.kind === 'robot' || t.kind === 'drone' ? 0.00035 : 0.0002) * (busy ? 2 : 0.4));
    if (t.kind === 'robot') { const nearPod = g.colony ? Math.hypot(t.x - g.colony.pod.x, t.z - g.colony.pod.z) < 14 : false; s.charge = clamp01(s.charge + dt * (nearPod && !busy ? 0.01 : -(busy ? 0.0012 : 0.0003))); }
    // morale: what it lives through, pulled toward what the colony gives it
    const own = t.ownMorale();
    if (own !== null && t.kind !== 'robot') s.morale = own;
    else {
      let buddies = 0;
      for (const o of this.troops) if (o !== t && Math.abs(o.x - t.x) < 8 && Math.abs(o.z - t.z) < 8) buddies++;
      const n = t.needs(s), needK = [n.food, n.rest, n.maint].filter((v): v is number => v !== null);
      const needAvg = needK.length ? needK.reduce((a, b) => a + b, 0) / needK.length : 1;
      const sq = this.squad(s.squad);
      const home = (g.podHome?.happiness?.() ?? 0) / 100;
      const target = 0.42 + Math.min(3, buddies) * 0.06 + (hp - 0.5) * 0.3 + (needAvg - 0.6) * 0.35 + (sq ? 0.06 : 0) + home * 0.12 + Math.min(0.15, s.kills * 0.03) - (this.time - this.lossT < 60 ? 0.18 : 0);
      s.morale += (clamp01(target) - s.morale) * Math.min(1, dt * 0.04);
    }
    s.morale = clamp01(s.morale);
    // morale changes how it fights: rate of fire and aim (robots: their own weapon copy)
    if (t.kind === 'robot') {
      const w = t.ref.weapon; if (w) {
        let b = this.base.get(t.ref); if (!b) { b = { cd: w.cd, spread: w.spread }; this.base.set(t.ref, b); }
        w.cd = b.cd * (1.3 - 0.45 * s.morale); w.spread = b.spread * (1.7 - s.morale);
      }
    }
    // broken: a badly hurt unit with no heart left falls back to the pod
    if (s.morale < 0.16 && hp < 0.35 && g.colony && (!s.cur || s.cur.k !== 'move' || s.cur.tgt?.kind !== 'pod')) {
      const p = g.colony.pod.door ?? g.colony.pod; s.queue = []; s.cur = { k: 'move', x: p.x, z: p.z, tgt: { kind: 'pod', ref: g.colony.pod, x: p.x, z: p.z }, t: 0 }; this.start(t, s, s.cur);
      this.onEvent?.('break', t, s);
    }
    if (s.react > 0) s.react = Math.max(0, s.react - dt);
    s.histT -= dt;
    if (s.histT <= 0) { s.histT = 6; s.hist.push({ t: this.time, hp, mor: s.morale }); if (s.hist.length > 80) s.hist.shift(); }
  }
  private lossT = -999;
  private mourn(t: Troop, list: Troop[]) {
    this.lossT = this.time;
    for (const o of list) { if (Math.hypot(o.x - t.x, o.z - t.z) < 14) { const s = this.stateOf(o); s.morale = clamp01(s.morale - 0.15); } }
  }
  /** the current order: keep it going, finish it, take the next */
  private run(t: Troop, s: TState, dt: number) {
    let o = s.cur;
    if (!o && s.queue.length) { o = s.cur = s.queue.shift()!; this.start(t, s, o); }
    if (!o) { this.idle(t, s); return; }
    if (!o.issued) this.start(t, s, o);
    o.t = (o.t ?? 0) + dt;
    const tg = o.tgt, d = Math.hypot(o.x - t.x, o.z - t.z), tol = TOL[t.kind] ?? 1.2;
    let done = false;
    switch (o.k) {
      case 'move': case 'amove': done = d < tol || o.t > WAIT_MAX; if (done) this.onEvent?.('arrive', t, s); break;
      case 'attack': done = !tg || !talive(tg); if (done && tg) { s.kills++; this.onEvent?.('kill', t, s); } else if (tg && !t.canAttack) { const p = tpos(tg); if (Math.hypot(p.x - t.x, p.z - t.z) > 3) this.near(t, o, p.x, p.z); }
        else if (tg && t.kind === 'crew' && tg.kind !== 'creature') this.crewShoot(t, o, tg, dt);
        else if (tg && t.kind === 'robot' && o.t > 2 && !t.fighting) t.attack(tg);
        break;
      case 'gather': case 'build': { const p = tg ? tpos(tg) : o; done = !tg || !talive(tg) || Math.hypot(p.x - t.x, p.z - t.z) < 3.2 || o.t > WAIT_MAX; if (tg?.kind === 'site' && t.kind === 'crew' && !done) { /* walking there */ } if (done && tg?.kind === 'site' && t.kind !== 'worker') this.siteWork(t, tg, dt); break; }
      case 'repair': done = this.repair(t, o, dt); break;
      case 'follow': case 'guard': if (!tg) break; if (!talive(tg)) { done = true; break; } { const p = tpos(tg); this.near(t, o, p.x, p.z); } break;
      case 'patrol': if (t.kind === 'crew') this.crewPatrol(t, o); break;
      case 'hold': if (t.kind === 'crew' && !t.ref.job) t.holdAt(o.x, o.z); if (t.kind === 'robot' && t.fighting) { const r = t.ref, w = r.weapon, tp = r.tgt?.ref; if (tp && Math.hypot(tp.x - r.x, tp.z - r.z) > (w?.range ?? 8) + 0.5) r.tgt = null; } break;
      case 'stop': done = true; break;
    }
    if (done) { s.cur = null; if (s.queue.length) { s.cur = s.queue.shift()!; this.start(t, s, s.cur); } }
  }
  /** no order of ours: the squad's area pulls it home; the crew defends itself */
  private idle(t: Troop, s: TState) {
    const sq = this.squad(s.squad);
    if (sq?.area && !t.fighting) {
      const a = sq.area, d = Math.hypot(t.x - a.x, t.z - a.z);
      if (d > a.r) {
        const m = this.members(sq.id), i = Math.max(0, m.indexOf(t)), ang = (i / Math.max(1, m.length)) * Math.PI * 2, rr = a.r * 0.55;
        const gx = a.x + Math.sin(ang) * rr, gz = a.z + Math.cos(ang) * rr;
        if (sq.stance === 'passive') t.moveTo(gx, gz); else t.guardAt(gx, gz);
        s.cur = { k: 'move', x: gx, z: gz, t: 0, issued: true };
      }
    }
  }
  /** the squad's stance: passive units drop their targets, aggressive ones chase what they see */
  private stance(t: Troop, s: TState) {
    const sq = this.squad(s.squad); if (!sq) return;
    if (sq.stance === 'passive' && t.kind === 'robot' && t.fighting && !(s.cur?.k === 'attack')) t.dropTarget();
    if (sq.stance === 'aggressive' && t.kind === 'crew' && !t.fighting && !s.cur && Math.random() < 0.02) {
      let foe: any = null, bd = 10;
      this.g.world?.near?.(t.x, t.z, 10, (c: any) => { if (c.dead || c.faction === 'veyr') return; if (c.faction === 'wild' && !(c.mind === 'attack' || c.mind === 'hunt')) return; const d = Math.hypot(c.x - t.x, c.z - t.z); if (d < bd) { bd = d; foe = c; } });
      if (foe) (t as unknown as { job(j: unknown, p: boolean): void }).job({ k: 'defend', x: foe.x, z: foe.z, target: foe, label: 'ENGAGING' }, false);
    }
  }
  /** units without the teammates' repair job weld on the spot: walk in, then mend at a rate */
  private repair(t: Troop, o: TOrder, dt: number): boolean {
    const tg = o.tgt; if (!tg || !talive(tg)) return true;
    const hp = thp(tg); if (!hp || hp[0] >= hp[1] - 0.01) return o.t! > 0.5;
    if (t.kind === 'crew') return !t.ref.job && o.t! > 2;
    const p = tpos(tg), d = Math.hypot(p.x - t.x, p.z - t.z), reach = 2.2 + (tg.ref.radius ?? 0.6);
    if (d > reach) { if (o.lx === undefined || Math.hypot(p.x - o.lx, p.z - (o.lz ?? 0)) > 1) { o.lx = p.x; o.lz = p.z; t.moveTo(p.x, p.z); } return o.t! > WAIT_MAX; }
    const mend = repairable(tg);
    mend?.repair(dt * (t.kind === 'drone' ? 9 : 6));
    if (Math.random() < dt * 8) this.g.fx?.burst?.(p.x, (this.g.world?.surfaceY?.(p.x, p.z) ?? 0) + 0.8, p.z, 2, 0x9ad8ff, { glow: true, speed: 2, up: 1, size: 2, life: 0.3 });
    return false;
  }
  /** a construction site gets a builder's shift of work from anyone standing at it */
  private siteWork(_t: Troop, tg: Target, dt: number) { const s = tg.ref; if (s && s.stage === 'build') { s.work = Math.min(s.workNeed, (s.work ?? 0) + dt * 0.8); s.help = this.g.world?.time ?? 0; } }
  /** the crew shoot at machines and structures themselves (their own job only knows creatures) */
  private crewShoot(t: Troop, o: TOrder, tg: Target, dt: number) {
    const p = tpos(tg), d = Math.hypot(p.x - t.x, p.z - t.z);
    if (d > 8.5) { this.near(t, o, p.x, p.z); return; }
    o.ax = (o.ax ?? 0) - dt;
    if ((o.ax ?? 0) > 0) return;
    o.ax = 0.9 + Math.random() * 0.4;
    try { this.g.fx?.arc?.(new THREE.Vector3(t.x, t.y + 1.3, t.z), new THREE.Vector3(p.x, (tg.ref.y ?? 0) + 0.6, p.z), 0.08, 0xffd080, 0.05); } catch { /* fx optional */ }
    tg.ref.damage?.(6, t.ref);
  }
  private crewPatrol(t: Troop, o: TOrder) {
    if (t.ref.job) return;
    o.leg = (o.leg ?? 1) ^ 1;
    const [x, z] = o.leg ? [o.x, o.z] : [o.ax ?? t.x, o.az ?? t.z];
    (t as unknown as { job(j: unknown, p: boolean): void }).job({ k: 'move', x, z, label: 'PATROL' }, false);
  }

  // ------------------------------------------------------------------ queries for the views
  /** the points a unit will walk through: its current order, then the queue */
  route(t: Troop): TOrder[] { const s = this.st.get(t.key); if (!s) return []; return [...(s.cur ? [s.cur] : []), ...s.queue]; }
  job(t: Troop): string {
    const s = this.st.get(t.key), o = s?.cur;
    if (s && s.balkT > 0) return 'HESITATING';
    if (!o) return t.ownJob();
    const own = t.ownJob();
    if ((o.k === 'gather' || o.k === 'build') && o.t && o.t > 2 && !/MOV|ROAM|STANDBY|IDLE/.test(own)) return own;
    return ({ move: 'MOVING', amove: 'ADVANCING', attack: t.fighting ? 'ENGAGING' : 'ATTACKING', gather: 'GATHERING', build: 'BUILDING', repair: 'REPAIRING', follow: 'FOLLOWING', guard: 'GUARDING', patrol: 'PATROL', hold: 'HOLDING', stop: 'STOPPED' } as Record<OrderK, string>)[o.k];
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** something with hp / maxHp and a repair(n) (wraps the ones that have no repair of their own) */
export function repairable(t: Target): { hp: number; maxHp: number; repair(n: number): void; x: number; z: number } | null {
  const r = t.kind === 'troop' ? t.ref.ref : t.ref; if (!r || typeof r.hp !== 'number') return null;
  if (typeof r.repair === 'function' && typeof r.maxHp === 'number') return r;
  return { get hp() { return r.hp; }, get maxHp() { return r.maxHp ?? r.hp; }, repair(n: number) { r.hp = Math.min(r.maxHp ?? r.hp, r.hp + n); }, get x() { return r.x; }, get z() { return r.z; } };
}
