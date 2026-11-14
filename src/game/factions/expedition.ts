// A human expedition (another nation's or a private outfit's): mid-game its capsule drops on a chute and retro
// rockets, a team of soldiers and engineers climbs out, and they call Unit 07 on the open band. Pay their asking
// price and they keep to their side and pack up after a while; refuse and they pitch camp and go for your works:
// engineers try to capture your buildings and creatures while the soldiers cover them. Losing most of the team
// drives them off (the capsule lifts out); destroying the capsule strands and ends them.
import type { Factions } from './index';
import type { FactionSite } from './plan';
import { FStructure, type SOwner } from './structure';
import type { SKind } from './models';
import { spawnUnit, StubUnit, type Unit } from './units';
import { Rand, clamp } from '../../core/rand';
import { compass } from './brain';
import { panel, el, ui, Btn, toast } from '../../ui/kit';
import { floatText } from '../../ui/floatText';
import { sfx } from '../../audio/audio';
import { Creature } from '../creature';

type XState = 'pending' | 'landing' | 'parley' | 'truce' | 'hostile' | 'leaving' | 'gone' | 'eliminated';

export class Expedition implements SOwner {
  readonly f = 'expedition' as const;
  readonly r: Rand;
  state: XState = 'pending';
  structures: FStructure[] = [];
  units: Unit[] = [];
  lander: FStructure | null = null;
  x: number; z: number;
  t = 0;
  private team = 0; private thinkT = 0; private stateT = 0;
  private jobs = new Map<Unit, { ref: any; t: number; need: number; label: any }>();
  private dialog: HTMLElement | null = null;

  constructor(readonly F: Factions, readonly site: FactionSite) {
    this.r = new Rand((F.g.opts.seed * 53 + 17) >>> 0);
    const at = F.settle(site.x, site.z, 2.2);
    this.x = at[0]; this.z = at[1];
  }
  get name() { return this.site.name; }
  get alive() { return this.state !== 'pending' && this.state !== 'gone' && this.state !== 'eliminated'; }
  /** blocks the region win while it is down here and not paid off */
  get blocking() { return this.state === 'landing' || this.state === 'parley' || this.state === 'hostile' || this.state === 'leaving'; }
  get cost() { const d = Math.round(this.site.strength * 3); return { ore: 15 + d * 8, carbon: 8 + d * 4 }; }

  update(dt: number) {
    const F = this.F;
    if (this.state === 'pending') { if (F.t >= this.site.arrive && F.player()) this.land(); return; }
    if (this.state === 'gone' || this.state === 'eliminated') return;
    this.t += dt; this.stateT += dt;
    this.units = this.units.filter((u) => !u.dead);
    if (this.state === 'landing') {
      if (this.lander && this.lander.dropT <= 0 && !this.team) this.unload();
      if (this.team && this.stateT > 4) this.parley();
      return;
    }
    if (this.state === 'parley') return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 1; this.think(); }
    this.tickJobs(dt);
  }

  // ------------------------------------------------------------------ arrival and the parley
  land() {
    this.state = 'landing'; this.stateT = 0;
    this.lander = this.add('lander', this.x, this.z, { instant: true, yaw: this.r.range(0, 6.28), name: this.site.name, drop: 8 });
    const [px, pz] = this.F.playerCenter();
    this.F.radio.calder(`A lander on a chute, Seven, coming down to the ${compass(this.x - px, this.z - pz)}. No star on it. Private outfit, or somebody else's flag. They'll have rifles.`, 'think');
    sfx('pulse', 0.4, 0.6);
  }
  private unload() {
    const F = this.F, d = Math.round(this.site.strength * 3);
    const kinds = [...Array(3 + d).fill('expedition_soldier'), 'expedition_engineer', 'expedition_engineer'];
    for (const k of kinds) {
      const a = this.r.range(0, Math.PI * 2), rr = this.r.range(2.5, 4);
      const u = spawnUnit(F, k, 'expedition', this.x + Math.cos(a) * rr, this.z + Math.sin(a) * rr);
      u.order({ k: 'guard', x: u.x, z: u.z });
      this.units.push(u); F.units.push(u);
    }
    this.team = this.units.length;
    F.radio.say('expedition', 'land', { B: this.site.name }, 0);
    this.stateT = 0;
  }
  /** the choice: pay for a truce, or send them packing */
  parley() {
    const F = this.F, g = F.g;
    if (this.state === 'parley') return;
    this.state = 'parley';
    const c = this.cost, res = g.run.res;
    const afford = res.ore >= c.ore && res.carbon >= c.carbon;
    g.storyBlock = true;
    const p = this.dialog = panel('choice', ui(), 'dark');
    el('div', 'hdr ch-title', p, 'A VOICE ON THE OPEN BAND');
    el('div', 'small ch-sub', p, `"${this.site.name} expedition to the American machine. We came for the ore, not for a war. Pay our way and we keep off your works."`);
    el('div', 'small', p, `They ask ${c.ore} ore and ${c.carbon} carbon. You hold ${Math.floor(res.ore)} ore, ${Math.floor(res.carbon)} carbon.`);
    el('div', 'small', p, `${this.units.length} rifles and engineers at their capsule.`);
    const row = el('div', 'ch-row', p);
    const fin = (pay: boolean) => {
      p.remove(); this.dialog = null; g.storyBlock = false;
      if (pay && afford) { res.ore -= c.ore; res.carbon -= c.carbon; this.truce(); }
      else this.hostile();
    };
    new Btn(row, { icon: 'min', label: 'PAY FOR A TRUCE', size: 'big', disabled: () => !afford, tip: () => `<h4>Pay them off</h4>${c.ore} ore and ${c.carbon} carbon. They keep to their side and lift off in a few minutes.${afford ? '' : '<br><b>Not enough in the hold.</b>'}` }, () => fin(true));
    new Btn(row, { icon: 'attack', label: 'SEND THEM PACKING', size: 'big', tip: () => '<h4>Refuse</h4>They pitch camp and go for your buildings and creatures. Kill most of the team or wreck their capsule to be rid of them.' }, () => fin(false));
  }
  private truce() {
    const F = this.F;
    this.state = 'truce'; this.stateT = 0;
    F.truce.add('expedition');
    F.radio.say('expedition', 'truce', { B: this.site.name }, 0);
    toast(`Truce with the <b>${this.site.name}</b> expedition. They will keep to their side.`, 'good', 5000);
    this.camp();
  }
  private hostile() {
    const F = this.F;
    this.state = 'hostile'; this.stateT = 0;
    F.truce.delete('expedition');
    F.radio.say('expedition', 'refused', { B: this.site.name }, 0);
    F.later(4, () => F.radio.calder('They\'ll send the engineers for our machines first. Keep the creatures and the works covered.', 'surprised'));
    this.camp();
  }
  private camp() {
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 20; k++) {
        const a = this.r.range(0, Math.PI * 2), rr = this.r.range(4.5, 7);
        const x = this.x + Math.cos(a) * rr, z = this.z + Math.sin(a) * rr;
        if (!this.F.canPlace(x, z, 1.4)) continue;
        this.add('tent', x, z, { yaw: a + Math.PI / 2 }); break;
      }
    }
    for (let k = 0; k < 20; k++) { const a = this.r.range(0, Math.PI * 2), x = this.x + Math.cos(a) * 5, z = this.z + Math.sin(a) * 5; if (this.F.canPlace(x, z, 1)) { this.add('mast', x, z, {}); break; } }
  }
  private add(kind: SKind, x: number, z: number, o: { instant?: boolean; yaw?: number; name?: string; drop?: number }) {
    const s = new FStructure(this.F, this, 'expedition', kind, x, z, o);
    this.structures.push(s); this.F.structures.push(s);
    return s;
  }

  // ------------------------------------------------------------------ behaviour
  private think() {
    const F = this.F;
    if (this.state === 'truce') {
      if (this.stateT > 160) this.leave(true);
      return;
    }
    if (this.state === 'leaving') {
      const near = this.units.filter((u) => Math.hypot(u.x - this.x, u.z - this.z) < 5).length;
      if (this.stateT > 18 || near >= this.units.length) this.liftOff();
      return;
    }
    // hostile: driven off once most of the team is down
    if (this.units.length <= Math.max(1, Math.floor(this.team * 0.35))) { this.leave(false); return; }
    const engs = this.units.filter((u) => u.kind === 'expedition_engineer');
    const sol = this.units.filter((u) => u.kind !== 'expedition_engineer');
    for (const e of engs) {
      if (this.jobs.has(e)) continue;
      const t = this.captureTarget(e);
      if (!t) { e.order({ k: 'guard', x: this.x, z: this.z }); continue; }
      e.order({ k: 'work', x: F.tx(t), z: F.tz(t), target: t });
      this.jobs.set(e, { ref: t, t: 0, need: t instanceof Creature ? 6 : 10, label: null });
    }
    // the soldiers cover the engineers (or hold the camp)
    const cover = [...this.jobs.keys()][0];
    sol.forEach((s, i) => {
      if (cover && !cover.dead) { const a = (i / Math.max(1, sol.length)) * Math.PI * 2; s.order({ k: 'attack', x: cover.x + Math.cos(a) * 3, z: cover.z + Math.sin(a) * 3 }); }
      else s.order({ k: 'guard', x: this.x + Math.cos(i) * 4, z: this.z + Math.sin(i) * 4 });
    });
    if (this.stateT > 6 && this.stateT < 8) F.radio.say('expedition', 'wave', { B: this.site.name }, 60);
  }
  /** the nearest of your buildings or creatures to their camp */
  private captureTarget(e: Unit): any {
    const F = this.F, taken = new Set([...this.jobs.values()].map((j) => j.ref));
    let best: any = null, bd = 70;
    for (const t of F.playerTargets()) { if (t.core || taken.has(t.ref)) continue; const d = Math.hypot(t.x - this.x, t.z - this.z); if (d < bd) { bd = d; best = t.ref; } }
    for (const c of F.g.world.creatures) { if (c.dead || c.faction !== 'veyr' || taken.has(c)) continue; const d = Math.hypot(c.x - this.x, c.z - this.z) + 6; if (d < bd) { bd = d; best = c; } }
    void e;
    return best;
  }
  private tickJobs(dt: number) {
    const F = this.F;
    for (const [e, j] of this.jobs) {
      const done = () => { this.jobs.delete(e); if (e instanceof StubUnit) e.busy = false; };
      if (e.dead || !F.alive(j.ref) || this.state !== 'hostile') { done(); continue; }
      const tx = F.tx(j.ref), tz = F.tz(j.ref), d = Math.hypot(tx - e.x, tz - e.z) - (F.asTgt(j.ref)?.r ?? 0.5);
      if (d > 2.4) { if (j.t > 0) j.t = Math.max(0, j.t - dt); if (Math.random() < dt) e.order({ k: 'work', x: tx, z: tz, target: j.ref }); if (e instanceof StubUnit) e.busy = false; continue; }
      if (e instanceof StubUnit) e.busy = true;
      if (j.ref instanceof Creature) { j.ref.stunT = Math.max(j.ref.stunT, 0.3); }
      j.t += dt;
      if (Math.floor(j.t * 2) !== Math.floor((j.t - dt) * 2)) {
        F.g.fx.spray(tx, F.ty(j.ref), tz, 0, 1, 0, 4, 0xffd890, { glow: true, speed: 1.6, cone: 0.9, size: 1.4, life: 0.25 });
        floatText(F.g, tx, F.ty(j.ref) + 1, tz, `CAPTURING ${Math.round((j.t / j.need) * 100)}%`, 'warn', { life: 0.9 });
      }
      if (j.t >= j.need) { this.capture(j.ref); done(); }
    }
  }
  /** it changes hands: a building is rewired to their band, a creature is roped and led off */
  private capture(ref: any) {
    const F = this.F, g = F.g;
    const x = F.tx(ref), z = F.tz(ref);
    if (ref instanceof Creature) {
      ref.faction = 'expedition'; ref.order = null; ref.mind = 'idle'; ref.homeX = this.x; ref.homeZ = this.z;
      g.veyr.allies?.delete?.(ref);
      if (ref.selected) { ref.selected = false; g.sel = g.sel.filter((s) => s !== ref); }
      toast(`The expedition has roped one of your creatures`, 'warn', 4000);
    } else {
      if (typeof ref.capture === 'function') ref.capture('expedition');
      else if ('faction' in ref) ref.faction = 'expedition';
      toast(`The expedition has captured one of your buildings`, 'warn', 4000);
    }
    floatText(g, x, F.ty(ref) + 1.2, z, 'CAPTURED', 'warn', { big: 1, life: 2 });
    F.radio.say('expedition', 'capture', {}, 20);
    g.emit('captured', { target: ref, by: 'expedition', x, z });
  }
  private leave(paid: boolean) {
    if (this.state === 'leaving') return;
    this.state = 'leaving'; this.stateT = 0;
    this.F.radio.say('expedition', 'leave', { B: this.site.name }, 0);
    if (!paid) this.F.later(2, () => this.F.radio.calder('They\'re running for the capsule. Let them go, Seven, or finish it. Either way they\'re off our ground.', 'happy'));
    for (const u of this.units) u.order({ k: 'move', x: this.x + this.r.range(-2, 2), z: this.z + this.r.range(-2, 2) });
    for (const [e] of this.jobs) if (e instanceof StubUnit) e.busy = false;
    this.jobs.clear();
  }
  /** the capsule climbs out on its rockets with whoever made it back */
  private liftOff() {
    const F = this.F, L = this.lander;
    this.state = 'gone';
    F.truce.delete('expedition');
    for (const u of this.units) if (!u.dead) F.removeUnit(u);
    this.units = [];
    if (L && !L.dead) F.liftOff(L);
    for (const s of this.structures) if (s !== L && !s.dead) F.later(1 + Math.random() * 2, () => s.destroy());
    F.g.emit('faction-eliminated', { faction: 'expedition', name: this.site.name, left: true });
    toast(`The <b>${this.site.name}</b> expedition has left the region.`, 'good', 5000);
  }
  onStructureLost(s: FStructure) {
    this.structures = this.structures.filter((q) => q !== s);
    if (s !== this.lander) { this.F.radio.say('expedition', 'lost', {}, 30); return; }
    // stranded: the survivors throw down their rifles
    this.state = 'eliminated';
    this.dialog?.remove(); this.F.g.storyBlock = false;
    this.F.radio.say('expedition', 'eliminated', {}, 0);
    for (const u of this.units) if (!u.dead) { floatText(this.F.g, u.x, u.y + 2, u.z, 'SURRENDERS', 'info', { life: 2 }); this.F.later(2, () => this.F.removeUnit(u)); }
    for (const t of this.structures) this.F.later(1 + Math.random() * 3, () => t.destroy());
    this.F.later(3, () => this.F.radio.calder('Their capsule\'s finished. They\'ll be walking home. Good riddance.', 'think'));
    this.F.g.emit('faction-eliminated', { faction: 'expedition', name: this.site.name });
  }
  dispose() { this.dialog?.remove(); }
}
void clamp;
