// A robot programme's mind (Soviet or PRC): its lander is the HQ; it mines the region's deposits with its own rigs,
// raises structures in a build order, produces robots, scouts, defends, and sends attack waves that grow with time
// and with Unit 07's strength. It fights the other programmes too, and sometimes picks them as the target so they
// wear each other down. Destroying the lander eliminates it: its remaining machines lose their signal and its
// structures blow their demolition charges.
//
//   SOVIET: methodical; one structure at a time; bunkers and artillery batteries; troopers, then tanks, then titans;
//           waves form up at a staging point and push as one heavy column at the American works.
//   PRC:    fast expansion; two builds at once; rigs on far deposits guarded by watchtowers; swarms of scouts and
//           troopers; raids that swing wide round a flank to hit miners, belts and workers.
import type { Factions, Tgt } from './index';
import type { FactionSite } from './plan';
import { FStructure, SDEF, type SOwner } from './structure';
import type { SKind } from './models';
import { spawnUnit, statOf, StubUnit, type Unit } from './units';
import { Rand, clamp } from '../../core/rand';

interface Personality {
  start: SKind[]; order: SKind[]; loop: SKind[];
  parallel: number; minerReach: number; minerCost: number;
  unitCost: Record<string, number>; unitTime: Record<string, number>;
  hqUnits: [string, number][];
  mix(T: number, wave: number): [string, number][];
  startUnits: string[];
  waveFirst: number; waveEvery(w: number): number; waveSize(w: number): number;
  guard: number; raid: boolean; mineRate: number; stage: number;
}
export const PERSONALITY: Record<'soviet' | 'prc', Personality> = {
  soviet: {
    start: ['miner', 'bunker'],
    order: ['factory', 'miner', 'bunker', 'artillery', 'depot', 'miner', 'mast', 'bunker', 'factory', 'artillery', 'miner', 'bunker'],
    loop: ['bunker', 'miner', 'artillery', 'bunker'],
    parallel: 1, minerReach: 28, minerCost: 60,
    unitCost: { sov_drone: 30, sov_trooper: 40, sov_tank: 120, sov_titan: 380 },
    unitTime: { sov_drone: 9, sov_trooper: 11, sov_tank: 24, sov_titan: 50 },
    hqUnits: [['sov_trooper', 3], ['sov_drone', 1]],
    mix: (T, w) => (T < 420 && w < 2 ? [['sov_trooper', 3], ['sov_drone', 1]] : T < 780 && w < 5 ? [['sov_trooper', 3], ['sov_tank', 2], ['sov_drone', 1]] : [['sov_trooper', 2], ['sov_tank', 3], ['sov_titan', 1], ['sov_drone', 1]]),
    startUnits: ['sov_trooper', 'sov_trooper', 'sov_trooper', 'sov_drone'],
    waveFirst: 270, waveEvery: (w) => Math.max(85, 170 - w * 12), waveSize: (w) => 4 + w * 2,
    guard: 3, raid: false, mineRate: 1.15, stage: 0.55,
  },
  prc: {
    start: ['miner', 'miner', 'tower'],
    order: ['factory', 'miner', 'tower', 'miner', 'depot', 'miner', 'tower', 'mast', 'factory', 'miner', 'tower', 'miner'],
    loop: ['miner', 'tower', 'miner', 'tower'],
    parallel: 2, minerReach: 46, minerCost: 45,
    unitCost: { prc_scout: 22, prc_trooper: 32, prc_mech: 140 },
    unitTime: { prc_scout: 6, prc_trooper: 9, prc_mech: 26 },
    hqUnits: [['prc_scout', 3], ['prc_trooper', 2]],
    mix: (T, w) => (T < 420 && w < 2 ? [['prc_scout', 3], ['prc_trooper', 3]] : T < 780 && w < 5 ? [['prc_scout', 3], ['prc_trooper', 4], ['prc_mech', 1]] : [['prc_scout', 2], ['prc_trooper', 4], ['prc_mech', 2]]),
    startUnits: ['prc_scout', 'prc_scout', 'prc_scout', 'prc_trooper', 'prc_trooper'],
    waveFirst: 240, waveEvery: (w) => Math.max(60, 125 - w * 10), waveSize: (w) => 5 + w * 2,
    guard: 2, raid: true, mineRate: 0.95, stage: 0,
  },
};

interface Wave { units: Unit[]; ref: any; tx: number; tz: number; sx: number; sz: number; stage: 'stage' | 'attack' | 'home'; t: number; vsOther: boolean }
const GRID = 'ABCDEFGH';
export const gridRef = (x: number, z: number) => `${GRID[clamp(Math.floor(x / 16), 0, 7)]}-${clamp(Math.floor(z / 16), 0, 7) + 1}`;
export const compass = (dx: number, dz: number) => ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'][((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8];

export class Programme implements SOwner {
  readonly f: 'soviet' | 'prc';
  readonly P: Personality;
  readonly r: Rand;
  structures: FStructure[] = [];
  units: Unit[] = [];
  hq: FStructure | null = null;
  x: number; z: number;
  res = 140;
  state: 'pending' | 'active' | 'eliminated' = 'pending';
  /** seconds since it became active */
  t = 0;
  wave = 0; waveT: number;
  private buildT = 4; private orderI = 0; private prodT = 0; private thinkT = 0; private scoutT: number; private chatterT: number;
  private producing = new Map<FStructure, { kind: string; t: number }>();
  waves: Wave[] = [];
  private scout: { u: Unit; t: number; seen: boolean } | null = null;
  private landed = false; private hitT = -99;

  constructor(readonly F: Factions, readonly site: FactionSite) {
    this.f = site.faction as 'soviet' | 'prc';
    this.P = PERSONALITY[this.f];
    this.r = new Rand((F.g.opts.seed * 31 + (this.f === 'soviet' ? 7 : 13)) >>> 0);
    const at = F.settle(site.x, site.z, 3.4);
    this.x = at[0]; this.z = at[1];
    const grace = F.grace;
    this.waveT = (this.P.waveFirst + grace) * (1.15 - site.strength * 0.15);
    this.scoutT = 50 + this.r.range(0, 30);
    this.chatterT = 60 + this.r.range(0, 60);
    if (site.arrive <= 0) this.arrive(true);
  }
  get name() { return this.site.name; }
  get label() { return this.f === 'soviet' ? 'Soviet' : 'Chinese'; }
  get alive() { return this.state === 'active'; }
  get strength() { return this.site.strength * this.F.diff; }

  // ------------------------------------------------------------------ arrival
  /** dug in (already there when Unit 07 lands) or falling from orbit now */
  arrive(dugIn: boolean) {
    this.state = 'active';
    const yaw = Math.atan2(this.F.playerCenter()[0] - this.x, this.F.playerCenter()[1] - this.z);
    this.hq = this.add('lander', this.x, this.z, { instant: true, yaw, name: this.site.name, drop: dugIn ? 0 : 7 });
    if (dugIn) {
      this.landed = true;
      for (const k of this.P.start) this.placeNext(k, true);
      for (const k of this.P.startUnits) this.spawn(k, this.hq);
    }
  }
  private touchdown() {
    this.landed = true;
    const F = this.F;
    F.radio.say(this.f, 'land', { B: this.site.name }, 0);
    const [px, pz] = F.playerCenter();
    F.radio.calder(this.f === 'soviet'
      ? `That was a lander, Seven. Red star on the hull. The Soviets are down to the ${compass(this.x - px, this.z - pz)}.`
      : `Another lander, Seven, to the ${compass(this.x - px, this.z - pz)}. Chinese markings. They'll spread fast.`);
    for (const k of this.P.startUnits.slice(0, 3)) this.spawn(k, this.hq!);
  }

  // ------------------------------------------------------------------ tick
  update(dt: number) {
    if (this.state === 'pending') { if (this.F.t >= this.site.arrive) this.arrive(false); return; }
    if (this.state !== 'active') return;
    if (!this.landed) { if (this.hq && this.hq.dropT <= 0) this.touchdown(); else return; }
    this.t += dt;
    this.economy(dt);
    this.produceTick(dt);
    this.waveT -= dt * (this.F.player() ? 1 : 0.5);
    this.scoutT -= dt; this.chatterT -= dt;
    this.buildT -= dt;
    if (this.buildT <= 0) { this.buildT = this.f === 'prc' ? 3 : 4; this.build(); }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 1; this.think(); }
  }

  private economy(dt: number) {
    const R = this.F.g.region, k = this.strength;
    this.res += 0.7 * k * dt; // the lander's own drill
    for (const s of this.structures) {
      if (s.kind !== 'miner' || !s.ready || s.deposit < 0) continue;
      const d = R.deposits[s.deposit];
      if (!d || d.amount <= 0) { s.deposit = -1; this.F.radio.say(this.f, 'exhausted', { N: s.id % 9 + 1 }, 60); continue; }
      const take = Math.min(d.amount, this.P.mineRate * k * dt * 0.6);
      d.amount -= take; this.res += take * 1.7;
    }
  }

  // ------------------------------------------------------------------ building
  private build() {
    const busy = this.structures.filter((s) => !s.dead && s.built < 1).length;
    if (busy >= this.P.parallel) return;
    const P = this.P;
    const kind = this.orderI < P.order.length ? P.order[this.orderI] : P.loop[(this.orderI - P.order.length) % P.loop.length];
    if (this.structures.filter((s) => !s.dead).length >= 22) return;
    const cost = kind === 'miner' ? P.minerCost : SDEF[kind].cost;
    if (this.res < cost) return;
    if (this.placeNext(kind, false)) { this.res -= cost; }
    this.orderI++;
  }
  /** pick a site for a structure of this kind and raise it */
  private placeNext(kind: SKind, instant: boolean): FStructure | null {
    const F = this.F, r = this.r, R = F.g.region;
    const [px, pz] = F.playerCenter();
    const toP = Math.atan2(pz - this.z, px - this.x);
    const rad = kind === 'lander' ? 3 : SDEF[kind].r;
    if (kind === 'miner') {
      const di = F.freeDeposit(this.x, this.z, this.P.minerReach, this.f === 'prc');
      if (di < 0) return null;
      const d = R.deposits[di];
      for (let k = 0; k < 16; k++) {
        const a = r.range(0, Math.PI * 2), rr = k === 0 ? 0 : r.range(0.3, d.r + 1.5);
        const x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
        if (!F.canPlace(x, z, rad)) continue;
        const s = this.add('miner', x, z, { instant, yaw: r.range(0, 6.28) });
        s.deposit = di;
        if (!instant) F.radio.say(this.f, 'deposit', { N: this.structures.filter((q) => q.kind === 'miner').length }, 30);
        // PRC: a far rig gets its own watchtower later
        return s;
      }
      return null;
    }
    for (let k = 0; k < 40; k++) {
      let a: number, rr: number, cx = this.x, cz = this.z;
      if (kind === 'bunker' || kind === 'tower') {
        const far = this.structures.filter((s) => s.kind === 'miner' && !s.dead && Math.hypot(s.x - this.x, s.z - this.z) > 16);
        if (kind === 'tower' && far.length && r.chance(0.55)) { const m = r.pick(far); cx = m.x; cz = m.z; a = r.range(0, 6.28); rr = r.range(3, 5); }
        else { a = toP + r.range(-0.9, 0.9); rr = r.range(9, 14); }
      } else if (kind === 'artillery') { a = toP + r.range(-0.7, 0.7); rr = r.range(6, 9); }
      else if (kind === 'factory') { a = toP + Math.PI / 2 * r.sign() + r.range(-0.6, 0.6); rr = r.range(6.5, 9.5); }
      else { a = toP + Math.PI + r.range(-0.9, 0.9); rr = r.range(5.5, 9); }
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (!F.canPlace(x, z, rad)) continue;
      const yaw = kind === 'factory' ? Math.atan2(px - x, pz - z) : kind === 'depot' || kind === 'mast' ? r.range(0, 6.28) : Math.atan2(px - x, pz - z);
      const s = this.add(kind, x, z, { instant, yaw: Math.round(yaw / (Math.PI / 8)) * (Math.PI / 8) });
      if (!instant && (kind === 'factory' || kind === 'artillery' || kind === 'bunker' || kind === 'tower')) F.later(SDEF[kind].build, () => { if (!s.dead) F.radio.say(this.f, 'build', {}, 40); });
      return s;
    }
    return null;
  }
  add(kind: SKind, x: number, z: number, o: { instant?: boolean; yaw?: number; name?: string; drop?: number }) {
    const s = new FStructure(this.F, this, this.f, kind, x, z, o);
    this.structures.push(s); this.F.structures.push(s);
    return s;
  }

  // ------------------------------------------------------------------ production
  cap() {
    const T = this.t, pp = this.F.playerPower();
    const c = (5 + this.wave * 1.6 + T / 75) * this.strength + pp * 0.35;
    return Math.round(clamp(c, 4, this.f === 'prc' ? 30 : 24));
  }
  private produceTick(dt: number) {
    for (const [p, job] of this.producing) {
      if (p.dead) { this.producing.delete(p); continue; }
      job.t -= dt;
      if (job.t <= 0) { this.producing.delete(p); this.spawn(job.kind, p); }
    }
    this.prodT -= dt;
    if (this.prodT > 0) return;
    this.prodT = 1;
    this.units = this.units.filter((u) => !u.dead);
    const cap = this.cap();
    for (const p of this.structures) {
      if (!p.ready || (p.kind !== 'factory' && p.kind !== 'lander') || this.producing.has(p)) continue;
      if (this.units.length + this.producing.size >= cap) return;
      const pool = p.kind === 'lander' ? this.P.hqUnits : this.P.mix(this.t, this.wave);
      let kind = this.r.weighted(pool);
      const titans = this.units.filter((u) => u.kind === 'sov_titan').length + [...this.producing.values()].filter((j) => j.kind === 'sov_titan').length;
      if (kind === 'sov_titan' && titans >= (this.t > 1100 ? 2 : 1)) kind = 'sov_tank';
      const cost = this.P.unitCost[kind] ?? 40;
      if (this.res < cost) continue;
      this.res -= cost;
      this.producing.set(p, { kind, t: (this.P.unitTime[kind] ?? 12) * (p.kind === 'lander' ? 1.6 : 1) / Math.sqrt(this.strength) });
    }
  }
  /** a new machine rolls out of a producer's door and joins the home guard */
  spawn(kind: string, at: FStructure) {
    const yaw = at.mesh.rotation.y, d = at.radius + 1.6;
    const x = at.x + Math.sin(yaw) * d + this.r.range(-1, 1), z = at.z + Math.cos(yaw) * d + this.r.range(-1, 1);
    const u = spawnUnit(this.F, kind, this.f, x, z);
    this.units.push(u); this.F.units.push(u);
    const [rx, rz] = this.rally();
    u.order({ k: 'guard', x: rx, z: rz });
    return u;
  }
  /** home guard post: the front of the base, toward Unit 07 */
  private rally(): [number, number] {
    const [px, pz] = this.F.playerCenter();
    const a = Math.atan2(pz - this.z, px - this.x) + this.r.range(-0.8, 0.8), rr = this.r.range(6, 10);
    return [this.x + Math.cos(a) * rr, this.z + Math.sin(a) * rr];
  }
  private home(): Unit[] {
    const inWave = new Set<Unit>(); for (const w of this.waves) for (const u of w.units) inWave.add(u);
    return this.units.filter((u) => !u.dead && !inWave.has(u) && u !== this.scout?.u);
  }
  armyPower() { let p = 0; for (const u of this.units) if (!u.dead) p += statOf(u.kind).hp / 60; return p; }

  // ------------------------------------------------------------------ the mind
  private think() {
    const F = this.F;
    // defend: a structure was hit lately -> the home guard answers
    const hit = this.structures.find((s) => !s.dead && s.lastHit && F.t - s.lastHit.t < 4);
    if (hit && hit.lastHit) {
      const by = hit.lastHit.by && F.alive(hit.lastHit.by) ? hit.lastHit.by : null;
      for (const u of this.home()) if (Math.hypot(u.x - hit.x, u.z - hit.z) < 30) u.order({ k: 'attack', x: hit.lastHit.x, z: hit.lastHit.z, target: by ?? undefined });
      if (F.t - this.hitT > 30) { this.hitT = F.t; F.radio.say(this.f, 'hit', { B: this.site.name }, 40); }
    }
    this.tickWaves();
    this.tickScout();
    if (this.chatterT <= 0) { this.chatterT = 80 + this.r.range(0, 80); F.radio.say(this.f, 'chatter', { B: this.site.name }, 60); }
    if (this.waveT <= 0) this.tryWave();
  }

  private tryWave() {
    const F = this.F, home = this.home();
    const need = Math.round(this.P.waveSize(this.wave) * this.strength * (1 + F.playerPower() / 30));
    const overdue = this.waveT < -45;
    if (home.length < Math.max(3, need * 0.75) && !(overdue && home.length >= 3)) return;
    // keep a guard: the slowest (Soviet) / the sturdiest (PRC) stay home
    home.sort((a, b) => statOf(a.kind).speed - statOf(b.kind).speed);
    const guard = this.P.guard + (this.wave > 3 ? 1 : 0);
    const go = this.P.raid ? home.slice(0, Math.max(0, home.length - guard)).reverse() : home.slice(guard);
    if (go.length < 3) return;
    if (this.launch(go)) { this.wave++; this.waveT = this.P.waveEvery(this.wave); }
    else this.waveT = 25;
  }
  /** choose a target and send the units; false when there is nothing to hit */
  launch(go: Unit[], forcePlayer = false): boolean {
    const F = this.F, r = this.r;
    const pt = this.pickPlayerTarget();
    const other = F.otherTarget(this);
    let vsOther = false;
    if (other && !forcePlayer) {
      const dp = pt ? Math.hypot(pt.x - this.x, pt.z - this.z) : 1e9, dO = Math.hypot(other.x - this.x, other.z - this.z);
      let p = 0.16 + (dO < dp * 0.7 ? 0.25 : 0) + (F.playerPower() > this.armyPower() * 1.4 ? 0.2 : 0);
      if (this.wave === 0) p *= 0.5;
      vsOther = !pt || r.chance(p);
    }
    const tgt = vsOther ? other : pt;
    if (!tgt) return false;
    const groups: Unit[][] = this.P.raid && go.length >= 8 && !vsOther ? [go.filter((_, i) => i % 2 === 0), go.filter((_, i) => i % 2 === 1)] : [go];
    groups.forEach((g, gi) => {
      let t = tgt;
      if (gi > 0) t = this.pickPlayerTarget(tgt.ref) ?? tgt;
      const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz) || 1;
      let sx: number, sz: number;
      if (this.P.raid) {
        // swing wide: a waypoint off to one side of the direct line, short of the target
        const side = gi === 0 ? r.sign() : -1, px = -dz / d, pz = dx / d;
        sx = t.x - (dx / d) * 12 + px * side * 18; sz = t.z - (dz / d) * 12 + pz * side * 18;
      } else { sx = this.x + dx * this.P.stage; sz = this.z + dz * this.P.stage; }
      const N = F.g.region.N;
      sx = clamp(sx, 5, N - 5); sz = clamp(sz, 5, N - 5);
      const free = F.g.region.freeNear(sx, sz, 8); if (free) [sx, sz] = free;
      for (const u of g) u.order({ k: 'move', x: sx + r.range(-2.5, 2.5), z: sz + r.range(-2.5, 2.5) });
      this.waves.push({ units: g, ref: t.ref, tx: t.x, tz: t.z, sx, sz, stage: 'stage', t: 0, vsOther });
    });
    // tell everyone
    F.radio.say(this.f, vsOther ? 'vsOther' : 'wave', { B: this.site.name }, 0);
    if (!vsOther) {
      const [px, pz] = F.playerCenter();
      const dir = compass(this.x - px, this.z - pz);
      const heavy = go.some((u) => u.kind === 'sov_titan') ? ' A titan walks with them.' : go.some((u) => u.kind === 'sov_tank' || u.kind === 'prc_mech') ? ' Armour, too.' : '';
      const line = this.f === 'soviet'
        ? `Seven, the Soviet column is moving: ${go.length} machines from the ${dir}.${heavy} Get the works ready.`
        : `Chinese raiders, ${go.length} of them, swinging round from the ${dir}. They'll go for the miners and the belts.${heavy}`;
      F.radio.calder(this.wave === 0 ? line + ' This is their first push. Hold them.' : line);
    } else if (this.r.chance(0.6)) F.radio.calder(`They're going for each other, Seven. ${this.label} machines are moving on the ${this.f === 'soviet' ? 'Chinese' : 'Soviet'} base. Let them.`, 'think');
    F.g.emit('faction-wave', { faction: this.f, n: go.length, x: tgt.x, z: tgt.z, vsOther });
    return true;
  }
  /** a player target: Soviets go for the biggest works nearest them, PRC raids for soft far-flung ones */
  pickPlayerTarget(not?: any): Tgt | null {
    const F = this.F, list = F.playerTargets().filter((t) => t.ref !== not);
    if (!list.length) { const gp = F.player(); return gp ? F.asTgt(gp) : null; }
    const [cx, cz] = F.playerCenter();
    let best: Tgt | null = null, bs = -1e9;
    for (const t of list) {
      const dMe = Math.hypot(t.x - this.x, t.z - this.z), dCore = Math.hypot(t.x - cx, t.z - cz);
      let s: number;
      if (this.P.raid) s = (t.soft ? 30 : 0) + dCore * 0.6 - dMe * 0.4 + this.r.range(0, 8);
      else s = -dMe + (t.core ? (this.wave >= 4 ? 10 : -40) : 0) + (t.hp ?? 100) * 0.02 + this.r.range(0, 6);
      if (s > bs) { bs = s; best = t; }
    }
    return best;
  }
  private tickWaves() {
    const F = this.F;
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += 1;
      w.units = w.units.filter((u) => !u.dead);
      if (!w.units.length) { this.waves.splice(i, 1); continue; }
      if (w.stage === 'stage') {
        const at = w.units.filter((u) => Math.hypot(u.x - w.sx, u.z - w.sz) < 7).length;
        if (at >= w.units.length * 0.8 || w.t > (this.P.raid ? 22 : 35)) {
          w.stage = 'attack'; w.t = 0;
          for (const u of w.units) u.order({ k: 'attack', x: w.tx + this.r.range(-2, 2), z: w.tz + this.r.range(-2, 2), target: w.ref });
          if (this.P.raid && !w.vsOther) F.radio.say(this.f, 'raid', {}, 30);
        }
      } else if (w.stage === 'attack') {
        if (!F.alive(w.ref) || w.t > 220) {
          // the next thing nearby, else home
          const nt = w.t > 220 ? null : w.vsOther ? F.otherTarget(this, w.tx, w.tz, 24) : F.playerTargetNear(w.tx, w.tz, 24, w.ref);
          if (nt) { w.ref = nt.ref; w.tx = nt.x; w.tz = nt.z; w.t = Math.min(w.t, 160); for (const u of w.units) u.order({ k: 'attack', x: nt.x, z: nt.z, target: nt.ref }); }
          else { w.stage = 'home'; for (const u of w.units) { const [rx, rz] = this.rally(); u.order({ k: 'move', x: rx, z: rz }); } }
        }
      } else if (w.units.every((u) => Math.hypot(u.x - this.x, u.z - this.z) < 16) || w.t > 90) {
        for (const u of w.units) { const [rx, rz] = this.rally(); u.order({ k: 'guard', x: rx, z: rz }); }
        this.waves.splice(i, 1);
      }
    }
  }
  private tickScout() {
    const F = this.F;
    const s = this.scout;
    if (s) {
      s.t += 1;
      if (s.u.dead) { this.scout = null; return; }
      if (!s.seen) {
        const near = F.playerTargetNear(s.u.x, s.u.z, 16) ?? (F.player() && Math.hypot(F.player()!.x - s.u.x, F.player()!.z - s.u.z) < 16 ? F.asTgt(F.player()) : null);
        if (near) { s.seen = true; F.radio.say(this.f, 'sighted', { G: gridRef(near.x, near.z), B: this.site.name }, 45); const [rx, rz] = this.rally(); s.u.order({ k: 'move', x: rx, z: rz }); }
      }
      if (s.t > 100 || (s.seen && Math.hypot(s.u.x - this.x, s.u.z - this.z) < 14)) { const [rx, rz] = this.rally(); s.u.order({ k: 'guard', x: rx, z: rz }); this.scout = null; }
      return;
    }
    if (this.scoutT > 0) return;
    this.scoutT = (this.P.raid ? 55 : 85) + this.r.range(0, 35);
    const cand = this.home().filter((u) => u.kind === 'sov_drone' || u.kind === 'prc_scout');
    const u = cand[0] ?? (this.t > 200 ? this.home()[0] : null);
    if (!u) return;
    const [px, pz] = this.F.playerCenter();
    const a = this.r.range(0, Math.PI * 2), rr = this.r.range(12, 24);
    const N = F.g.region.N;
    u.order({ k: 'move', x: clamp(px + Math.cos(a) * rr, 5, N - 5), z: clamp(pz + Math.sin(a) * rr, 5, N - 5) });
    this.scout = { u, t: 0, seen: false };
  }

  // ------------------------------------------------------------------ losses
  onStructureHit(s: FStructure, from: any) { void s; void from; }
  onStructureLost(s: FStructure, by: any) {
    void by;
    this.structures = this.structures.filter((q) => q !== s);
    this.producing.delete(s);
    if (s === this.hq) { this.eliminate(); return; }
    this.F.radio.say(this.f, 'lost', { N: s.id % 9 + 1 }, 30);
    // methodical Soviets rebuild what they lost; the PRC simply carries on expanding
    if (this.f === 'soviet' && s.kind !== 'miner') this.orderI = Math.max(0, Math.min(this.orderI, this.P.order.length) - 1);
  }
  eliminate() {
    if (this.state === 'eliminated') return;
    this.state = 'eliminated';
    const F = this.F;
    F.radio.say(this.f, 'eliminated', { B: this.site.name }, 0);
    F.later(3, () => F.radio.calder(this.f === 'soviet' ? 'Their lander is down, Seven! That\'s the Soviets finished in this valley.' : 'The Chinese station is gone. Their machines are just... stopping. Well done, Seven.', 'happy'));
    F.g.emit('faction-eliminated', { faction: this.f, name: this.site.name });
    this.producing.clear(); this.waves = []; this.scout = null;
    // no signal: the machines stop, then their charges go
    this.units.forEach((u, i) => F.later(0.8 + i * 0.35 + this.r.range(0, 1.5), () => { if (!u.dead) { if (u instanceof StubUnit) u.damage(u.hp + 1); else u.damage(u.hp + 1, null); } }));
    this.structures.forEach((s, i) => F.later(2 + i * 0.9 + this.r.range(0, 1), () => s.destroy()));
  }

  // ------------------------------------------------------------------ test hooks
  /** raise the whole build order at once (test pages) */
  debugBuildAll(n = 10) { for (let i = 0; i < n; i++) { const P = this.P; const k = i < P.order.length ? P.order[i] : P.loop[i % P.loop.length]; this.placeNext(k, true); } this.orderI = n; }
  /** n units at the base and an immediate wave at Unit 07's works */
  debugWave(kinds: string[], vsOther = false) {
    const us = kinds.map((k) => this.spawn(k, this.hq!));
    if (vsOther) { const o = this.F.otherTarget(this); if (o) { for (const u of us) u.order({ k: 'attack', x: o.x, z: o.z, target: o.ref }); this.waves.push({ units: us, ref: o.ref, tx: o.x, tz: o.z, sx: o.x, sz: o.z, stage: 'attack', t: 0, vsOther: true }); return us; } }
    this.launch(us, true);
    return us;
  }
}
