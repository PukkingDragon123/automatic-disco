// Colony vitals: POWER (generation against draw, a battery between them), OXYGEN (the pod's tank: scrubbers fill it
// on power, the crew and a leaking hull drain it), FOOD (rations plus anything edible in the stores), POD INTEGRITY,
// WORKER HEALTH and MORALE. Each has a warning band and a critical band with alarms; a vital that stays failed runs a
// collapse countdown, and when that reaches zero the colony is lost (colony.fail). Hard, but every failure is called
// out well before it lands.
import type { Colony } from './colony';
import type { Teammate } from './teammates';
import { ITEMS } from '../factory/items';

export type VitalId = 'power' | 'oxygen' | 'food' | 'integrity' | 'health' | 'morale';
export type Level = 'ok' | 'warn' | 'crit';
/** an extra producer or consumer other systems register (workers, habitats, farms): per second of sim time */
export interface Flow { kw?: number; o2?: number; food?: number }

/** sim seconds a failed vital is allowed before the colony collapses */
export const COLLAPSE_T: Record<'power' | 'oxygen' | 'food' | 'workers', number> = { power: 120, oxygen: 75, food: 180, workers: 20 };

export class Vitals {
  /** battery charge and capacity (kWh, abstract) */
  battery = 140; batteryCap = 220;
  /** pod reactor output (kW) */
  reactor = 24;
  gen = 0; draw = 0;
  /** tank, 0..100 */
  o2 = 72;
  /** rations in the pod's locker (person-meals); stores add more */
  rations = 12;
  morale = 72;
  /** the collapse countdowns (sim seconds left), null while the vital holds */
  timers: Record<'power' | 'oxygen' | 'food' | 'workers', number | null> = { power: null, oxygen: null, food: null, workers: null };
  levels: Record<VitalId, Level> = { power: 'ok', oxygen: 'ok', food: 'ok', integrity: 'ok', health: 'ok', morale: 'ok' };
  /** a short history of each vital for the strip's sparkline (one sample every 2 s) */
  hist: Record<VitalId, number[]> = { power: [], oxygen: [], food: [], integrity: [], health: [], morale: [] };
  private flows = new Map<string, Flow>();
  private spent = 0; private histT = 0;
  /** a one-off draw this frame (cannon shots, field pulses) */
  spend(kwh: number) { this.spent += kwh; }
  constructor(readonly c: Colony) {}
  addFlow(id: string, f: Flow) { this.flows.set(id, f); }
  removeFlow(id: string) { this.flows.delete(id); }

  /** the power side is not browned out */
  get powerOk() { return this.battery > 0.5 || this.gen >= this.draw; }
  get food() {
    let n = this.rations;
    const f = this.c.g.factory;
    if (f) for (const id of Object.keys(ITEMS)) { const v = ITEMS[id]?.food; if (v && v > 0) n += (f.count(id) || 0) * v * 0.5; }
    return n;
  }
  /** eat one meal: rations first, then the best food in the stores. Returns 0..1 how fed */
  eat(meals: number) {
    if (this.rations >= meals) { this.rations -= meals; return 1; }
    const f = this.c.g.factory;
    if (f) for (const id of Object.keys(ITEMS).sort((a, b) => (ITEMS[b].food ?? 0) - (ITEMS[a].food ?? 0))) { const v = ITEMS[id]?.food; if (v && v > 0 && f.count(id) > 0 && f.take(id, 1)) return Math.min(1, v * 0.5); }
    if (this.rations > 0) { const k = this.rations; this.rations = 0; return k; }
    return 0;
  }
  get integrity() { const p = this.c.pod; return p.hp / p.maxHp; }
  get health() {
    const t = this.c.teammates.filter((x) => x.alive), w = this.c.workers();
    const n = t.length + w.length; if (!n) return 0;
    return (t.reduce((s, x) => s + x.hp / 100, 0) + w.reduce((s, x) => s + x.hp / Math.max(1, x.maxHp), 0)) / n;
  }
  /** what a crew member's morale settles toward */
  moraleTarget(tm: Teammate) {
    let m = 70;
    if (this.food < 6) m -= 25; if (this.o2 < 25) m -= 20; if (!this.powerOk) m -= 15;
    if (tm.hunger > 70) m -= 10; if (tm.fatigue > 80) m -= 10; if (tm.hp < 50) m -= 10;
    m += Math.min(12, this.c.lamps() * 3) * (1 - this.c.daylight());
    m -= this.c.losses * 15;
    return Math.max(0, Math.min(100, m));
  }
  /** a 0..1 reading for the strip */
  value(id: VitalId) {
    switch (id) {
      case 'power': return this.battery / this.batteryCap;
      case 'oxygen': return this.o2 / 100;
      case 'food': return Math.min(1, this.food / 40);
      case 'integrity': return this.integrity;
      case 'health': return this.health;
      case 'morale': return this.morale / 100;
    }
  }
  update(dt: number) {
    const c = this.c;
    // ---- power
    let gen = this.reactor * (0.6 + 0.4 * Math.min(1, c.pod.hp / c.pod.maxHp + 0.3)), draw = 6 /* life support */ + 3 /* pod systems */;
    for (const a of c.arms) draw += a.working ? a.def.workKW * (1 + (a.level - 1) * 0.3) : a.def.idleKW;
    for (const s of c.structures) draw += s.kw;
    const fp = c.g.factory?.power?.(); if (fp) { gen += fp.supply; draw += fp.demand; }
    for (const f of this.flows.values()) { if (f.kw && f.kw > 0) gen += f.kw; else if (f.kw) draw -= f.kw; }
    this.gen = gen; this.draw = draw;
    this.battery = Math.max(0, Math.min(this.batteryCap, this.battery + (gen - draw) * dt * 0.01 - this.spent));
    this.spent = 0;
    const blackout = this.battery <= 0.5 && draw > gen;
    // ---- oxygen: scrubbers on power, crew breathe, a broken hull leaks
    const crew = c.teammates.filter((t) => t.alive).length;
    let o2 = (blackout ? 0 : 0.034) - crew * 0.011 - Math.max(0, 0.55 - this.integrity) * 0.06;
    for (const f of this.flows.values()) if (f.o2) o2 += f.o2;
    this.o2 = Math.max(0, Math.min(100, this.o2 + o2 * dt * 10));
    // ---- food is eaten by the crew (teammates.ts eat()); workers draw from the flows
    for (const f of this.flows.values()) if (f.food && f.food < 0) { const need = -f.food * dt; if (this.rations >= need) this.rations -= need; else this.eat(need); }
    // ---- morale: the crew's mean
    const alive = c.teammates.filter((t) => t.alive);
    if (alive.length) this.morale = alive.reduce((s, t) => s + t.morale, 0) / alive.length;
    // ---- levels and alarms
    const lv = (v: number, w: number, cr: number): Level => (v <= cr ? 'crit' : v <= w ? 'warn' : 'ok');
    const prev = { ...this.levels };
    this.levels.power = blackout ? 'crit' : lv(this.battery / this.batteryCap, 0.3, 0.12);
    this.levels.oxygen = lv(this.o2 / 100, 0.35, 0.15);
    this.levels.food = lv(this.food / 40, 0.3, 0.1);
    this.levels.integrity = lv(this.integrity, 0.45, 0.2);
    this.levels.health = lv(this.health, 0.5, 0.25);
    this.levels.morale = lv(this.morale / 100, 0.35, 0.15);
    for (const k of Object.keys(this.levels) as VitalId[]) if (this.levels[k] !== prev[k] && this.levels[k] !== 'ok' && (prev[k] === 'ok' || this.levels[k] === 'crit')) c.vitalAlarm(k, this.levels[k]);
    // ---- collapse countdowns
    const tick = (k: keyof Vitals['timers'], failing: boolean) => {
      if (!failing) { if (this.timers[k] !== null) c.alert(`${k.toUpperCase()} RESTORED`, 'good'); this.timers[k] = null; return; }
      if (this.timers[k] === null) { this.timers[k] = COLLAPSE_T[k]; c.alert(`${k.toUpperCase()} FAILURE: COLLAPSE IN ${COLLAPSE_T[k]} S`, 'crit', undefined, 'collapse-' + k); }
      this.timers[k] = (this.timers[k] as number) - dt;
      if ((this.timers[k] as number) <= 0) c.fail(('collapse-' + k) as never);
    };
    tick('power', blackout);
    tick('oxygen', this.o2 <= 0);
    tick('food', this.food <= 0 && c.teammates.some((t) => t.alive && t.hunger > 90));
    tick('workers', !alive.length && !c.workers().length);
    if (c.pod.hp <= 0) c.fail('pod-destroyed');
    this.histT -= dt;
    if (this.histT <= 0) { this.histT = 2; for (const k of Object.keys(this.hist) as VitalId[]) { const h = this.hist[k]; h.push(this.value(k)); if (h.length > 60) h.shift(); } }
  }
  /** the soonest collapse, for the HUD's countdown */
  soonest(): { k: string; t: number } | null {
    let best: { k: string; t: number } | null = null;
    for (const [k, t] of Object.entries(this.timers)) if (t !== null && (!best || t < best.t)) best = { k, t };
    return best;
  }
  toJSON() { return { battery: this.battery, o2: this.o2, rations: this.rations, morale: this.morale }; }
  load(d: Partial<ReturnType<Vitals['toJSON']>> | undefined) { if (!d) return; for (const k of ['battery', 'o2', 'rations', 'morale'] as const) if (typeof d[k] === 'number') this[k] = d[k] as number; }
}
