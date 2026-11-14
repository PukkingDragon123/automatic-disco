// The space race on one region: the Soviet and PRC robot programmes and the human expeditions that hold or reach it
// (1-2 per region, from the region seed and danger: plan.ts), their structures, units and ordnance, the radio, and
// the rules the region screen asks about (game.factions.cleared() gates the win).
//
// Shared surface (CONTRACT.md):
//   game.factions.structures  every faction structure: { x, z, y, hp, maxHp, radius, height, faction, kind, dead, damage(n, from?) }
//   game.factions.units       every unit the factions fielded (RobotUnits from src/robots, or stand-ins)
//   game.factions.nearestHostile(x, z, r, faction) / eachHostileIn(...) / hit(ref, n, from)
//   events on game: 'faction-wave' {faction, n, x, z, vsOther}, 'faction-eliminated' {faction, name}, 'captured' {target, by}
import * as THREE from 'three';
import type { Game } from '../game';
import type { Faction } from '../species';
import { Creature, GOLEM_REF } from '../creature';
import { Building } from '../buildings';
import { planFactions, type FactionSite, type FactionId } from './plan';
import { Programme } from './brain';
import { Expedition } from './expedition';
import { FStructure } from './structure';
import { StubUnit, loadRobots, type Unit } from './units';
import { Shells } from './shells';
import { Boom } from './boom';
import { Radio } from './radio';
import { toast } from '../../ui/kit';
import { clamp } from '../../core/rand';

export { factionsForRegion, planFactions, factionSummary, FACTION_LABEL, type FactionSite, type FactionId } from './plan';
export interface Tgt { ref: any; x: number; z: number; r: number; f: Faction; soft?: boolean; core?: boolean; hp?: number }

const SOFT = /miner|drill|belt|conveyor|splitter|pump|extract|pipe|well|harvest/i;
const BAR: Record<string, string> = { soviet: '#a2473a', prc: '#c49580', expedition: '#c9a464' };

export class Factions {
  readonly plan: FactionSite[];
  programmes: Programme[] = [];
  expeditions: Expedition[] = [];
  structures: FStructure[] = [];
  units: Unit[] = [];
  /** stand-in units (ticked here; real RobotUnits are ticked by src/robots) */
  stubs: StubUnit[] = [];
  readonly shells: Shells; readonly boom: Boom; readonly radio: Radio;
  /** factions at peace with Unit 07 (a paid-off expedition) */
  truce = new Set<Faction>();
  t = 0;
  /** difficulty multiplier on production and wave size */
  diff = 1;
  /** extra first-wave grace (seconds): longer on the first landing */
  readonly grace: number;
  test = false;
  private laters: { t: number; fn: () => void }[] = [];
  private lifts: { s: FStructure; t: number }[] = [];
  private contactT = 0; private warned = false; private artyWarned = false;

  constructor(readonly g: Game, o: { plan?: FactionSite[]; test?: boolean; diff?: number } = {}) {
    this.test = !!o.test;
    const danger = (g.opts as any).danger ?? 2;
    this.plan = o.plan ?? planFactions(g.opts.seed, danger, g.region.N);
    this.diff = o.diff ?? 0.85 + danger * 0.1;
    this.grace = g.opts.story !== false ? 60 : 0;
    this.shells = new Shells(this); this.boom = new Boom(this); this.radio = new Radio(g);
    void loadRobots();
    for (const s of this.plan) {
      if (s.faction === 'expedition') this.expeditions.push(new Expedition(this, s));
      else this.programmes.push(new Programme(this, s));
    }
    this.hookGolem();
    (g as any).factions = this;
  }

  // ------------------------------------------------------------------ the rules
  /** factions in play right now (landed and not beaten or gone) */
  present(): FactionId[] {
    const out: FactionId[] = [];
    for (const p of this.programmes) if (p.alive) out.push(p.f);
    for (const e of this.expeditions) if (e.alive) out.push('expedition');
    return out;
  }
  /** the win gate: every programme present is eliminated and every expedition is gone, beaten or paid off */
  cleared(): boolean {
    for (const p of this.programmes) if (p.state === 'active') return false;
    for (const e of this.expeditions) if (e.blocking) return false;
    return true;
  }
  /** one line per faction for HUD / pause screens */
  status(): string[] {
    const out: string[] = [];
    for (const p of this.programmes) out.push(`${p.label.toUpperCase()} ${p.name}: ${p.state === 'pending' ? 'not yet landed' : p.state === 'eliminated' ? 'ELIMINATED' : `${p.structures.filter((s) => !s.dead).length} structures, ${p.units.filter((u) => !u.dead).length} machines`}`);
    for (const e of this.expeditions) out.push(`EXPEDITION ${e.name}: ${e.state}`);
    return out;
  }

  // ------------------------------------------------------------------ tick
  update(dt: number) {
    this.t += dt;
    for (let i = this.laters.length - 1; i >= 0; i--) { const l = this.laters[i]; l.t -= dt; if (l.t <= 0) { this.laters.splice(i, 1); try { l.fn(); } catch (e) { console.error('[factions]', e); } } }
    for (const p of this.programmes) p.update(dt);
    for (const e of this.expeditions) e.update(dt);
    for (let i = this.stubs.length - 1; i >= 0; i--) {
      const u = this.stubs[i];
      u.update(dt);
      if (u.dead && u.deadT > 9) { u.dispose(); this.stubs.splice(i, 1); }
    }
    if (Math.random() < dt) this.units = this.units.filter((u) => !u.dead || this.stubs.includes(u as StubUnit));
    for (let i = this.structures.length - 1; i >= 0; i--) { const s = this.structures[i]; s.update(dt); if (s.removed) { s.dispose(); this.structures.splice(i, 1); } }
    this.tickLifts(dt);
    this.shells.update(dt); this.boom.update(dt); this.radio.update(dt);
    this.contactT -= dt;
    if (this.contactT <= 0) { this.contactT = 1; this.contact(); }
    if (!this.warned && this.g.conquest() >= this.g.veyr.winAt && !this.cleared()) {
      this.warned = true;
      const left = this.programmes.filter((p) => p.state === 'active').map((p) => `the ${p.label} base`).concat(this.expeditions.filter((e) => e.blocking).map(() => 'the expedition'));
      toast(`The ground is yours, but ${left.join(' and ')} still stand${left.length > 1 ? '' : 's'}. Drive them off to take the region.`, 'warn', 7000);
    }
  }
  /** your creatures fight what they bump into: anything hostile within reach takes their bite */
  private contact() {
    const w = this.g.world;
    const tryHit = (x: number, z: number, r: number, f: Faction, hit: (n: number, by: Creature) => void) => {
      w.near(x, z, r + 1.2, (c) => { if (c.dead || c.faction !== 'veyr' || c.mind === 'flee' || !this.hostile(c.faction, f)) return; if (Math.hypot(c.x - x, c.z - z) > r + c.radius + 0.6) return; c.atkAnim = 0; hit(Math.max(1, c.st.attack) * 0.9, c); });
    };
    for (const u of this.stubs) if (!u.dead) tryHit(u.x, u.z, u.radius, u.faction, (n, by) => u.damage(n, by));
    for (const s of this.structures) if (!s.dead && s.dropT <= 0) tryHit(s.x, s.z, s.radius, s.faction, (n, by) => s.damage(n, by));
  }

  // ------------------------------------------------------------------ queries
  hostile(a: Faction, b: Faction): boolean {
    if (a === b || a === 'wild' || b === 'wild') return false;
    if ((a === 'veyr' && this.truce.has(b)) || (b === 'veyr' && this.truce.has(a))) return false;
    return true;
  }
  /** Unit 07, when it is up and about */
  player(): any { const p = GOLEM_REF.g as any; return p && p.alive && p.started !== false ? p : null; }
  visible(x: number, z: number) { return this.test || this.g.vision.revealAll || this.g.vision.visibleAt(x, z); }
  seen(x: number, z: number) { if (this.test || this.g.vision.revealAll) return true; const N = this.g.region.N; return this.g.vision.seen[clamp(Math.floor(z), 0, N - 1) * N + clamp(Math.floor(x), 0, N - 1)] > 0; }
  /** where the player's base is: the landing core, else the golem, else the landing site */
  playerCenter(): [number, number] {
    const c = this.g.veyr.core; if (c) return [c.x, c.z];
    const p = this.player(); if (p) return [p.x, p.z];
    return [this.g.region.landing.x, this.g.region.landing.z];
  }
  /** the player's buildings: the factory (src/factory) and the landing site's own structures */
  playerTargets(): Tgt[] {
    const out: Tgt[] = [];
    const fb = (this.g as any).factory?.buildings as any[] | undefined;
    if (Array.isArray(fb)) for (const b of fb) { if (!this.alive(b) || (b.faction ?? 'veyr') !== 'veyr') continue; out.push({ ref: b, x: b.x, z: b.z, r: b.radius ?? b.r ?? 1, f: 'veyr', soft: SOFT.test(String(b.kind ?? '')), hp: b.hp }); }
    for (const b of this.g.veyr.buildings) if (!b.dead) out.push({ ref: b, x: b.x, z: b.z, r: b.def.radius, f: 'veyr', core: b === this.g.veyr.core, soft: b.def.kind === 'tap', hp: b.hp });
    return out;
  }
  playerTargetNear(x: number, z: number, r: number, not?: any): Tgt | null {
    let best: Tgt | null = null, bd = r;
    for (const t of this.playerTargets()) { if (t.ref === not) continue; const d = Math.hypot(t.x - x, t.z - z); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  /** the nearest structure of another enemy programme (for waves that turn on each other) */
  otherTarget(p: Programme, x = p.x, z = p.z, maxR = 1e9): Tgt | null {
    let best: Tgt | null = null, bd = maxR;
    for (const s of this.structures) {
      if (s.dead || s.faction === p.f || s.faction === 'expedition' && this.truce.has('expedition') || s.dropT > 0) continue;
      const d = Math.hypot(s.x - x, s.z - z) - (s.kind === 'lander' ? 8 : 0);
      if (d < bd) { bd = d; best = this.asTgt(s); }
    }
    return best;
  }
  playerPower(): number {
    let p = 0;
    const robots = (this.g as any).robots as Unit[] | undefined;
    if (Array.isArray(robots)) for (const r of robots) if (!r.dead && r.faction === 'veyr') p += Math.max(0.5, (r.maxHp ?? 60) / 60);
    for (const c of this.g.world.creatures) if (!c.dead && c.faction === 'veyr') p += 0.5;
    const fb = (this.g as any).factory?.buildings; if (Array.isArray(fb)) p += fb.length * 0.25;
    p += ((this.g.child as any)?.stage ?? 0) * 2;
    return p;
  }

  alive(ref: any): boolean {
    if (!ref) return false;
    if (ref === GOLEM_REF.g) return !!this.player();
    if (ref instanceof Creature) return !ref.dead;
    if (ref.dead || ref.removed) return false;
    if (typeof ref.hp === 'number' && ref.hp <= 0) return false;
    return !(ref.dropT > 0);
  }
  tx(ref: any) { return ref.x; }
  tz(ref: any) { return ref.z; }
  ty(ref: any): number {
    if (ref === GOLEM_REF.g) return ref.y + (ref.height ?? 0.3) * 0.6;
    if (ref instanceof Creature) return ref.y + ref.air + ref.size * 0.35;
    if (ref instanceof FStructure) return ref.y + ref.height * 0.4;
    if (ref instanceof Building) return ref.y + 0.8;
    if (ref instanceof StubUnit) return ref.y + ref.hover + ref.height * 0.45;
    const y = typeof ref.y === 'number' ? ref.y : this.g.world.surfaceY(ref.x, ref.z);
    return y + (ref.height ?? 1.2) * 0.5;
  }
  asTgt(ref: any): Tgt | null {
    if (!ref) return null;
    let r = 0.6, f: Faction = ref.faction ?? 'veyr';
    if (ref === GOLEM_REF.g) { r = ref.radius ?? 0.4; f = 'veyr'; }
    else if (ref instanceof Creature) r = ref.radius;
    else if (ref instanceof Building) r = ref.def.radius;
    else r = ref.radius ?? ref.r ?? 0.6;
    return { ref, x: ref.x, z: ref.z, r, f };
  }
  /** every candidate target near (x, z), hostile to f (or all of them) */
  private each(x: number, z: number, r: number, f: Faction, fn: (ref: any, d: number, rr: number, fac: Faction, structure: boolean) => void, all = false) {
    const ok = (fac: Faction) => all || this.hostile(f, fac);
    const R2 = (r + 4) * (r + 4);
    const robots = (this.g as any).robots as Unit[] | undefined;
    if (Array.isArray(robots)) for (const u of robots) { if (u.dead || !ok(u.faction)) continue; const d2 = (u.x - x) ** 2 + (u.z - z) ** 2; if (d2 < R2) fn(u, Math.sqrt(d2), (u as any).radius ?? 0.5, u.faction, false); }
    for (const u of this.stubs) { if (u.dead || !ok(u.faction)) continue; const d2 = (u.x - x) ** 2 + (u.z - z) ** 2; if (d2 < R2) fn(u, Math.sqrt(d2), u.radius, u.faction, false); }
    this.g.world.near(x, z, r + 2, (c) => { if (c.dead || (c.faction === 'wild' && !all) || !ok(c.faction)) return; fn(c, Math.hypot(c.x - x, c.z - z), c.radius, c.faction, false); });
    const p = this.player();
    if (p && ok('veyr')) { const d = Math.hypot(p.x - x, p.z - z); if (d < r + 2) fn(p, d, p.radius ?? 0.4, 'veyr', false); }
    const fb = (this.g as any).factory?.buildings as any[] | undefined;
    if (Array.isArray(fb)) for (const b of fb) { const bf = b.faction ?? 'veyr'; if (!this.alive(b) || !ok(bf)) continue; const d2 = (b.x - x) ** 2 + (b.z - z) ** 2; if (d2 < R2 * 1.5) fn(b, Math.sqrt(d2), b.radius ?? b.r ?? 1, bf, true); }
    if (ok('veyr')) for (const b of this.g.veyr.buildings) { if (b.dead) continue; const d2 = (b.x - x) ** 2 + (b.z - z) ** 2; if (d2 < R2 * 1.5) fn(b, Math.sqrt(d2), b.def.radius, 'veyr', true); }
    for (const s of this.structures) { if (s.dead || s.dropT > 0 || !ok(s.faction)) continue; const d2 = (s.x - x) ** 2 + (s.z - z) ** 2; if (d2 < (r + s.radius + 2) ** 2) fn(s, Math.sqrt(d2), s.radius, s.faction, true); }
  }
  /** the nearest hostile thing to a faction within r (edge distance); arty prefers structures */
  nearestHostile(x: number, z: number, r: number, f: Faction, o: { min?: number; structures?: boolean; noBuildings?: boolean } = {}): Tgt | null {
    let best: any = null, bs = 1e9, bf: Faction = 'wild', br = 0;
    this.each(x, z, r, f, (ref, d, rr, fac, st) => {
      if (st && o.noBuildings && !(ref instanceof FStructure)) return;
      const e = d - rr;
      if (e > r || (o.min && d < o.min)) return;
      const s = e - (o.structures && st ? 8 : 0) - (ref === GOLEM_REF.g ? 1 : 0);
      if (s < bs) { bs = s; best = ref; bf = fac; br = rr; }
    });
    return best ? { ref: best, x: best.x, z: best.z, r: br, f: bf } : null;
  }
  /** everything hostile to f within r of (x, z) (all = every faction) */
  eachHostileIn(x: number, z: number, r: number, f: Faction, fn: (ref: any, d: number) => void, all = false) {
    this.each(x, z, r, f, (ref, d, rr) => { if (d - rr * 0.5 <= r) fn(ref, Math.min(r, Math.max(0, d - rr * 0.5))); }, all);
  }
  /** deal damage to anything targetable */
  hit(ref: any, n: number, from: any) {
    if (!ref || n <= 0) return;
    if (ref === GOLEM_REF.g) { const p = this.player(); if (p) p.hurt(n * 0.5, { x: from?.x ?? p.x, z: from?.z ?? p.z, aggro: 0 } as any); return; }
    if (ref instanceof Creature) { if (!ref.dead) this.g.world.damage(ref, n, null); return; }
    if (ref instanceof Building) { if (ref.dead) return; ref.hp -= n; ref.U.uFlash.value = 1; return; }
    if (typeof ref.damage === 'function') ref.damage(n, from);
  }

  // ------------------------------------------------------------------ placement
  canPlace(x: number, z: number, r: number): boolean {
    const R = this.g.region, N = R.N;
    if (x < r + 4 || z < r + 4 || x > N - r - 4 || z > N - r - 4) return false;
    let lo = 1e9, hi = -1e9;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      const px = x + dx * r, pz = z + dz * r;
      if (R.isWater(px, pz) || R.isSolid(px, pz)) return false;
      const h = R.heightAt(px, pz); lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (hi - lo > 0.6 + r * 0.35) return false;
    for (const s of this.structures) if (!s.dead && Math.hypot(s.x - x, s.z - z) < s.radius + r + 1.2) return false;
    for (const b of this.g.veyr.buildings) if (Math.hypot(b.x - x, b.z - z) < b.def.radius + r + 3) return false;
    const fb = (this.g as any).factory?.buildings; if (Array.isArray(fb)) for (const b of fb) if (Math.hypot(b.x - x, b.z - z) < (b.radius ?? 1) + r + 2.5) return false;
    const [px, pz] = this.playerCenter();
    if (Math.hypot(px - x, pz - z) < 24) return false;
    return true;
  }
  /** the flattest open ground within ~12 m of a planned site, kept away from Unit 07's landing */
  settle(x: number, z: number, r: number): [number, number] {
    const R = this.g.region, L = R.landing;
    let best: [number, number] = [x, z], bs = -1e9;
    for (let k = 0; k < 160; k++) {
      const a = k * 2.399, rr = Math.sqrt(k / 160) * 12;
      const px = clamp(x + Math.cos(a) * rr, r + 5, R.N - r - 5), pz = clamp(z + Math.sin(a) * rr, r + 5, R.N - r - 5);
      if (R.isWater(px, pz) || R.isSolid(px, pz)) continue;
      let lo = 1e9, hi = -1e9, wet = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7]]) {
        const qx = px + dx * (r + 1.5), qz = pz + dz * (r + 1.5);
        if (R.isWater(qx, qz) || R.isSolid(qx, qz)) wet++;
        const h = R.heightAt(qx, qz); lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      const dl = Math.hypot(px - L.x, pz - L.z);
      const s = -(hi - lo) * 4 - wet * 3 - rr * 0.15 - (dl < 34 ? (34 - dl) * 2 : 0);
      if (s > bs) { bs = s; best = [px, pz]; }
    }
    return best;
  }
  /** a deposit nobody works yet, near enough; the PRC reaches further for the rich ones */
  freeDeposit(x: number, z: number, reach: number, greedy: boolean, f: Faction = 'soviet'): number {
    const R = this.g.region, [px, pz] = this.playerCenter();
    const fb = (this.g as any).factory?.buildings as any[] | undefined;
    let best = -1, bs = -1e9;
    R.deposits.forEach((d, i) => {
      if (d.amount <= 5) return;
      const dist = Math.hypot(d.x - x, d.z - z); if (dist > reach) return;
      if (this.structures.some((s) => !s.dead && s.kind === 'miner' && s.deposit === i)) return;
      if (Math.hypot(d.x - px, d.z - pz) < 26) return;
      if (Array.isArray(fb) && fb.some((b) => Math.hypot(b.x - d.x, b.z - d.z) < d.r + 4)) return;
      // not under another programme's guns
      if (this.structures.some((s) => !s.dead && s.faction !== f && Math.hypot(s.x - d.x, s.z - d.z) < 18)) return;
      const s = -dist + (greedy ? d.amount * 0.04 : 0);
      if (s > bs) { bs = s; best = i; }
    });
    return best;
  }

  // ------------------------------------------------------------------ helpers for the pieces
  later(t: number, fn: () => void) { this.laters.push({ t, fn }); }
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, f: FactionId, delay = 0) { if (this.visible(ax, az) || this.visible(bx, bz)) this.shells.tracer(ax, ay, az, bx, by, bz, f, delay); }
  flashAt(x: number, y: number, z: number, s = 1) { if (this.visible(x, z)) this.shells.flash(x, y, z, s); }
  onUnitDeath(u: Unit) { void u; }
  /** take a unit out of play without a fight (lifted off, surrendered) */
  removeUnit(u: Unit) {
    if (u instanceof StubUnit) { u.dead = true; u.deadT = 99; u.mesh.removeFromParent(); return; }
    u.dead = true; try { u.dispose(); } catch { /* already gone */ }
    const robots = (this.g as any).robots as Unit[] | undefined;
    if (Array.isArray(robots)) { const i = robots.indexOf(u); if (i >= 0) robots.splice(i, 1); }
  }
  artyFired(s: FStructure, t: Tgt) {
    if (this.artyWarned || t.f !== 'veyr') return;
    this.artyWarned = true;
    this.radio.say(s.fid, 'arty', {}, 0);
    this.later(3, () => this.radio.calder('Shells! That\'s a field gun, Seven, somewhere past the ridge. Find the battery and silence it.', 'surprised'));
  }
  /** a capsule leaving: it climbs on its rockets and is gone */
  liftOff(s: FStructure) { this.lifts.push({ s, t: 0 }); }
  private tickLifts(dt: number) {
    const fx = this.g.fx, c = new THREE.Color(0xffc070).multiplyScalar(2.2);
    for (let i = this.lifts.length - 1; i >= 0; i--) {
      const l = this.lifts[i]; l.t += dt;
      const h = l.t * l.t * 3;
      l.s.mesh.position.y = l.s.y + h;
      for (let k = 0; k < 4; k++) fx.glow.emit(l.s.x + (Math.random() - 0.5) * 0.5, l.s.y + h + 0.6, l.s.z + (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 2, -9, (Math.random() - 0.5) * 2, c, 1, 6, 0.3, 0, 0.5);
      if (l.t < 1.5 && Math.random() < dt * 20) fx.burst(l.s.x, l.s.y + 0.2, l.s.z, 4, 0x8a7a65, { speed: 6, up: 0.8, size: 7, life: 1.2, grav: 1 });
      if (h > 90) { l.s.dead = true; l.s.removed = true; this.lifts.splice(i, 1); }
    }
  }
  /** Unit 07's fists and head work on faction machines and walls too */
  private hookGolem() {
    const ch: any = this.g.child;
    if (!ch || ch.__factionsHook) return;
    ch.__factionsHook = true;
    const p0 = typeof ch.punch === 'function' ? ch.punch.bind(ch) : null, h0 = typeof ch.headbutt === 'function' ? ch.headbutt.bind(ch) : null;
    const live = () => (this.g as any).factions as Factions | null;
    if (p0) ch.punch = (side?: any) => { const r = p0(side); live()?.later(0.09, () => live()?.golemBlow(9)); return r; };
    if (h0) ch.headbutt = () => { h0(); live()?.later(0.12, () => live()?.golemBlow(3)); };
  }
  golemBlow(dmg: number) {
    const p = this.player(); if (!p) return;
    const fx = Math.sin(p.yaw ?? 0), fz = Math.cos(p.yaw ?? 0), size = p.size ?? 1, reach = 0.75 * size + 0.35;
    const k = 1 + ((this.g.child as any)?.stage ?? 0) * 0.6 + (size > 1 ? 1.5 : 0);
    let hit: { ref: any; d: number } | null = null;
    const consider = (ref: any, rr: number) => {
      const dx = ref.x - p.x, dz = ref.z - p.z, dl = Math.hypot(dx, dz) || 1e-3, d = dl - rr;
      if (d > reach || (dx * fx + dz * fz) / dl < 0.2 && d > 0.15) return;
      if (!hit || d < hit.d) hit = { ref, d };
    };
    for (const s of this.structures) if (!s.dead && s.dropT <= 0 && this.hostile('veyr', s.faction)) consider(s, s.radius);
    for (const u of this.stubs) if (!u.dead && this.hostile('veyr', u.faction)) consider(u, u.radius);
    if (!hit) return;
    const h = hit as { ref: any; d: number };
    h.ref.damage(dmg * k, p);
    this.g.fx.spray(h.ref.x - fx * h.ref.radius, p.y + 0.3, h.ref.z - fz * h.ref.radius, -fx, 0.4, -fz, 10, 0xffd080, { glow: true, speed: 3, cone: 0.8, size: 1.8, life: 0.25, grav: 6 });
  }

  // ------------------------------------------------------------------ 2D overlay (game.drawOverlay calls this)
  drawOverlay(g2: CanvasRenderingContext2D) {
    const px = Math.max(1, Math.round(innerHeight / 540));
    const bar = (x: number, y: number, z: number, f: number, w: number, col: string) => {
      const [sx, sy, ok] = this.g.screenOf(x, y, z); if (!ok) return;
      const W = Math.round(w * px), X = Math.round(sx - W / 2), Y = Math.round(sy);
      g2.fillStyle = '#14161b'; g2.fillRect(X - px, Y - px, W + px * 2, px * 4);
      g2.fillStyle = '#2c2422'; g2.fillRect(X, Y, W, px * 2);
      g2.fillStyle = col; g2.fillRect(X, Y, Math.round(W * clamp(f, 0, 1)), px * 2);
    };
    for (const s of this.structures) {
      if (s.dead || !s.mesh.visible || s.dropT > 0) continue;
      const f = s.built < 1 ? s.built : s.hp / s.maxHp;
      if (s.built >= 1 && f > 0.98) continue;
      bar(s.x, s.y + s.height + 0.4, s.z, f, 14 + s.radius * 8, s.built < 1 ? '#d9d2bf' : BAR[s.fid] ?? '#a2473a');
    }
    for (const u of this.stubs) {
      if (u.dead || !u.mesh.visible || u.hp > u.maxHp * 0.98) continue;
      bar(u.x, u.y + u.hover + u.height + 0.25, u.z, u.hp / u.maxHp, 10 + u.radius * 8, BAR[u.faction] ?? '#a2473a');
    }
  }

  dispose() {
    this.radio.dispose(); this.shells.clear(); this.boom.clear();
    for (const e of this.expeditions) e.dispose();
    for (const u of this.stubs) u.dispose();
    for (const s of this.structures) s.dispose();
    this.stubs = []; this.structures = [];
  }
}
