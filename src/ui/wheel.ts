// The power drum's mechanism (the desk draws it: desk/parts.ts Drum). Only installed powers (bought on the skill tree,
// see game/combat.ts powerOwned) get a cartridge; a new one is loaded with a clack. The reel turns with the mouse wheel
// over it, by grabbing and flicking it (it carries on spinning, then drops into a detent under the pawl), by clicking a
// cartridge, or with [ ] / , . on the keyboard. The cartridge facing the operator is the selection; the FIRE plunger,
// Enter or F arms it.
import { sfx } from '../audio/audio';
import { ABILITIES, type Ability, type Hive } from '../game/hive';
import { powerOwned, powerCost, ABILITY_SKILL } from '../game/combat';
import { skillIcon } from './icons';

export interface WheelCtx { hive: Hive; arm(a: Ability): void; armed(): Ability | null }

/** every live power in key order (retired ones, em > 50, never get a cartridge) */
const ALL: Ability[] = (Object.keys(ABILITIES) as Ability[]).filter((a) => ABILITIES[a].em <= 50).sort((a, b) => +ABILITIES[a].key - +ABILITIES[b].key);
const TAU = Math.PI * 2;

export class AbilityWheel {
  /** the installed powers, in key order; cartridge i holds order[i] */
  order: Ability[] = []; n = 1; step = TAU;
  sel = 0; ang = 0; vel = 0; target = 0;
  settled = true; grabbed = false;
  /** a message for the readout (and how long it stays) */
  flash = 0; flashMsg = ''; flashGood = false;
  /** bumped when the cartridges change (the desk reloads its models) */
  loadN = 0;
  private lastDet = 0; private ownKey = ''; private lastArmed: Ability | null = null;
  /** detents that passed the pawl this frame (the desk clicks the pawl) */
  ticks = 0;

  constructor(readonly c: WheelCtx) { this.reload(true); }
  get current(): Ability { return this.order[this.sel]; }
  icon(a: Ability) { return skillIcon(ABILITY_SKILL[a] ?? a); }

  private reload(first = false) {
    const prev = this.order[this.sel];
    const next = ALL.filter((a) => powerOwned(a));
    const added = first ? [] : next.filter((a) => !this.order.includes(a));
    this.order = next; this.n = Math.max(1, next.length); this.step = TAU / this.n;
    this.ownKey = next.join(',');
    let i = added.length ? next.indexOf(added[0]) : prev ? next.indexOf(prev) : 0;
    if (i < 0) i = 0;
    this.sel = i; this.ang = this.target = i * this.step; this.vel = 0; this.lastDet = Math.round(this.ang / this.step);
    this.loadN++;
    if (added.length) {
      this.say('LOADED: ' + ABILITIES[added[0]].name.toUpperCase(), true);
      this.vel = 14; this.settled = false;
      sfx('crack', 0.5, 0.5); sfx('hit', 0.6, 0.4);
    }
  }
  say(msg: string, good = false, t = 1.6) { this.flash = t; this.flashMsg = msg; this.flashGood = good; }
  /** turn by n detents (positive = next) */
  turn(n: number) {
    const armed = this.c.armed();
    if (armed && armed === this.current) this.c.arm(armed);
    if (!this.order.length) { sfx('deny'); return; }
    const N = this.n;
    this.sel = (((this.sel + n) % N) + N) % N;
    this.target = Math.round(this.ang / this.step) * this.step + n * this.step;
    this.vel = 0; this.grabbed = false; this.settled = false;
  }
  select(i: number) { const N = this.n; let d = i - this.sel; if (d > N / 2) d -= N; if (d < -N / 2) d += N; if (d) this.turn(d); }
  trigger(): boolean {
    const a = this.current;
    if (!a) { sfx('deny'); this.say('NO POWERS INSTALLED'); return false; }
    const why = this.c.hive.can(a);
    if (why && this.c.armed() !== a) { sfx('deny'); this.say(why.toUpperCase()); return false; }
    sfx('click', 0.8, 1); sfx('hit', 0.5, 0.35);
    this.c.arm(a);
    return true;
  }
  /** keyboard: true when the key belonged to the drum */
  key(k: string) {
    if (k === '[' || k === ',') { this.turn(-1); return true; }
    if (k === ']' || k === '.') { this.turn(1); return true; }
    if (k === 'Enter' || k === 'f') { this.trigger(); return true; }
    return false;
  }
  // ---- grabbing the reel
  grab() { this.grabbed = true; this.vel = 0; }
  dragBy(da: number, dt = 1 / 60) { this.ang += da; this.vel = da / Math.max(1 / 240, dt); this.settled = false; }
  release() { this.grabbed = false; this.settled = false; }

  update(dt: number) {
    if (ALL.filter((a) => powerOwned(a)).join(',') !== this.ownKey) this.reload();
    const armed = this.c.armed(), N = this.n, STEP = this.step;
    // a number key or another control armed something: swing the drum round to it
    if (armed !== this.lastArmed) { this.lastArmed = armed; if (armed && armed !== this.current && !this.grabbed) { const i = Math.max(0, this.order.indexOf(armed)); this.select(i); } }
    this.flash = Math.max(0, this.flash - dt);
    if (!this.grabbed) {
      if (Math.abs(this.vel) > 3) {
        // spinning free: friction, then it drops into the nearest detent
        this.ang += this.vel * dt; this.vel *= Math.exp(-dt * 2.6);
        this.target = Math.round(this.ang / STEP) * STEP;
        this.sel = ((Math.round(this.ang / STEP) % N) + N) % N;
      } else {
        const k = 220, damp = 20;
        this.vel += (k * (this.target - this.ang) - damp * this.vel) * dt;
        this.ang += this.vel * dt;
        if (Math.abs(this.target - this.ang) < 0.002 && Math.abs(this.vel) < 0.02) { this.ang = this.target; this.vel = 0; if (!this.settled) { this.settled = true; sfx('hit', 0.45, 0.22); } }
      }
    } else this.sel = ((Math.round(this.ang / STEP) % N) + N) % N;
    const det = Math.round(this.ang / STEP);
    this.ticks = 0;
    if (det !== this.lastDet) { this.ticks = Math.min(3, Math.abs(det - this.lastDet)); this.lastDet = det; sfx('crack', 0.3, 0.16 + this.ticks * 0.04); sfx('qte-tick', 1, 0.5); }
  }
  /** what each cartridge shows: how far out (sunk while recharging), dimmed (cannot pay), glowing (armed) */
  states(t: number) {
    const h = this.c.hive, armed = this.c.armed(), front = ((Math.round(this.ang / this.step) % this.n) + this.n) % this.n;
    return this.order.map((a, i) => {
      const d = ABILITIES[a], cd = h.cooldowns[a] ?? 0;
      const poor = h.res.charge < powerCost(a) || h.res.bio < d.bio || d.em > h.emLevel;
      return { out: cd > 0 ? 1 - cd / d.cd : 1, dim: poor || cd > 0, glow: armed === a ? (Math.floor(t * 3) % 2 ? 1 : 0.4) : 0, front: i === front };
    });
  }
  /** the readout's two lines for the cartridge in front */
  lines(): [string, string, 'ok' | 'bad' | 'arm' | 'wait'] {
    if (!this.order.length) return ['NO FIELD POWERS', this.flash > 0 ? this.flashMsg : 'SKILL TREE: GRAVITY', 'bad'];
    const a = this.current, d = ABILITIES[a], h = this.c.hive, cd = h.cooldowns[a] ?? 0;
    if (this.flash > 0) return [d.name.toUpperCase(), this.flashMsg, this.flashGood ? 'arm' : 'bad'];
    if (this.c.armed() === a) return [d.name.toUpperCase(), 'ARMED: CLICK A TARGET', 'arm'];
    if (cd > 0) return [d.name.toUpperCase(), `RECHARGE ${cd.toFixed(1)}S`, 'wait'];
    const cost = powerCost(a), poor = h.res.charge < cost;
    return [d.name.toUpperCase(), `${d.charge ? Math.round(cost) + ' CHG  ' : ''}CD ${d.cd}S`, poor ? 'bad' : 'ok'];
  }
}
