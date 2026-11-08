// A hive: the Veyr (player) or a rival asteroid. Resources, the field it projects, the growth it spreads,
// what it digests, what it grows and what it can do with its field.
import * as THREE from 'three';
import type { World } from './world';
import { Building, BDEFS, type BKind } from './buildings';
import type { Creature } from './creature';
import type { Species, Faction } from './species';
import type { Fx } from './fx';
import { VEYR, RIVALS } from '../world/palette';
import { clamp } from '../core/rand';
import { B } from '../world/blockTex';

export interface Res { bio: number; min: number; charge: number; helix: number }
export const EM_LEVELS = [0, 450, 1300, 2800, 5200];
export type Ability = 'snare' | 'pulse' | 'pull' | 'lance' | 'bloom' | 'storm' | 'shape' | 'repel' | 'lode';
export const ABILITIES: Record<Ability, { name: string; key: string; charge: number; bio: number; em: number; cd: number; desc: string; range: number }> = {
  snare: { name: 'Tendril Snare', key: '1', charge: 10, bio: 0, em: 1, cd: 2, range: 3.5, desc: 'Tendrils burst from the moss and seize a creature standing on or beside it. Time the strike.' },
  pulse: { name: 'Gravity Slam', key: '2', charge: 25, bio: 0, em: 1, cd: 8, range: 0, desc: 'Gravikinesis: crush the air over a point. Everything hostile there is slammed down and stunned. Strike at the peak for a wider slam.' },
  pull: { name: 'Telekinesis', key: '3', charge: 15, bio: 0, em: 2, cd: 5, range: 0, desc: 'Lift a creature or a corpse with your mind and float it onto your moss.' },
  bloom: { name: 'Overgrowth', key: '4', charge: 0, bio: 40, em: 2, cd: 12, range: 0, desc: 'Force a burst of moss to erupt around a point inside your field.' },
  lance: { name: 'Mind Lance', key: '5', charge: 35, bio: 0, em: 3, cd: 6, range: 0, desc: 'A bolt of thought that leaps from creature to creature. Time it for more leaps.' },
  shape: { name: 'Earthshape', key: '7', charge: 8, bio: 0, em: 1, cd: 0.5, range: 0, desc: 'Move the ground itself. <b>Left-click</b> lifts the earth into a ridge that walkers must go around; <b>right-click</b> sinks it into a hollow that floods below the water line. Walls, moats, ramps, ponds.' },
  repel: { name: 'Repulse', key: '8', charge: 20, bio: 0, em: 1, cd: 6, range: 0, desc: 'Turn gravity inside out at a point: a shockwave throws everything hostile outward, off its feet, dazed. Breaks charges, clears your growth.' },
  lode: { name: 'Gravity Well', key: '9', charge: 15, bio: 0, em: 2, cd: 12, range: 0, desc: 'Open a well over a ferrite or crystal seam inside your field: the ore tears loose and falls up into your heart. Minerals at once, no Root Tap needed.' },
  storm: { name: 'Gravity Storm', key: '6', charge: 90, bio: 0, em: 5, cd: 40, range: 0, desc: 'Unmake gravity in a wide circle: stones and creatures lift and grind together.' },
};

export interface Digesting { c: Creature; t: number; dur: number; bio0: number; rate: number }

export class Hive {
  res: Res = { bio: 90, min: 0, charge: 45, helix: 0 };
  income = { bio: 0, min: 0 };
  core: Building | null = null;
  buildings: Building[] = [];
  /** coverage array this hive writes (world.moss or world.creep) */
  readonly cov: Float32Array;
  /** field strength per column 0..1 */
  readonly field: Float32Array;
  /** player-painted growth priority */
  readonly paint: Uint8Array;
  emLevel = 1; mass = 0; cells = 0;
  digesting: Digesting[] = [];
  cooldowns: Partial<Record<Ability, number>> = {};
  private tick = 0;
  private fieldDirty = true;
  private plantsEaten = new Set<number>();
  supplyUsed = 0; supplyCap = 6;
  absorbCap = 1;
  harvest: ((c: Creature, sp: Species) => void) | null = null;
  readonly color: number; readonly vein: number;
  autoRate = 1;
  lost = false;
  onEvent?: (ev: string, d: any) => void;

  constructor(readonly w: World, readonly faction: Faction, readonly fx: Fx, readonly rivalKey = 0) {
    const N = w.region.N;
    this.cov = faction === 'veyr' ? w.moss : w.creep;
    this.field = new Float32Array(N * N);
    this.paint = new Uint8Array(N * N);
    this.color = faction === 'veyr' ? VEYR.moss : RIVALS[rivalKey].creep;
    this.vein = faction === 'veyr' ? VEYR.vein : RIVALS[rivalKey].vein;
    if (faction === 'rival') { this.res.bio = 160; this.res.min = 40; }
  }
  get enemyCov() { return this.faction === 'veyr' ? this.w.creep : this.w.moss; }

  plantCore(x: number, z: number) {
    const b = new Building(BDEFS.core, this.faction, x, z, this.w.region.heightAt(x, z) - 0.6, this.faction === 'rival' ? RIVALS[this.rivalKey].core : undefined);
    b.done = true; b.progress = 1; b.hp = b.maxHp; b.U.uGrow.value = 1;
    this.core = b; this.buildings.push(b); this.w.scene.add(b.mesh);
    const N = this.w.region.N;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const X = Math.floor(x) + dx, Z = Math.floor(z) + dz;
      if (X >= 0 && Z >= 0 && X < N && Z < N && dx * dx + dz * dz <= 6) this.cov[Z * N + X] = Math.max(this.cov[Z * N + X], 0.9);
    }
    this.fieldDirty = true;
  }

  // ------------------------------------------------------------------ field
  fieldRadius(b: Building) { return b.def.kind === 'core' ? 13 + this.emLevel * 3.5 : b.def.kind === 'spire' ? 10 + this.emLevel * 1.5 : 0; }
  private rebuildField() {
    const N = this.w.region.N, f = this.field;
    f.fill(0);
    for (const b of this.buildings) {
      if (!b.done) continue;
      const R = this.fieldRadius(b); if (!R) continue;
      const x0 = Math.max(0, Math.floor(b.x - R)), x1 = Math.min(N - 1, Math.ceil(b.x + R)), z0 = Math.max(0, Math.floor(b.z - R)), z1 = Math.min(N - 1, Math.ceil(b.z + R));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - b.x, z + 0.5 - b.z) / R;
        if (d < 1) { const i = z * N + x; f[i] = Math.max(f[i], 1 - d * d * 0.65); }
      }
    }
    this.fieldDirty = false;
  }
  inField(x: number, z: number) { const N = this.w.region.N; const i = clamp(Math.floor(z), 0, N - 1) * N + clamp(Math.floor(x), 0, N - 1); return this.field[i] > 0; }
  covAt(x: number, z: number) { const N = this.w.region.N; return this.cov[clamp(Math.floor(z), 0, N - 1) * N + clamp(Math.floor(x), 0, N - 1)]; }

  paintAt(x: number, z: number, r: number, on = true) {
    const N = this.w.region.N;
    for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      if (dx * dx + dz * dz > r * r) continue;
      const X = Math.floor(x) + dx, Z = Math.floor(z) + dz;
      if (X >= 0 && Z >= 0 && X < N && Z < N) this.paint[Z * N + X] = on ? 1 : 0;
    }
  }

  // ------------------------------------------------------------------ main update
  update(dt: number) {
    if (this.lost) return;
    const w = this.w;
    this.tick += dt;
    for (const k in this.cooldowns) (this.cooldowns as any)[k] = Math.max(0, (this.cooldowns as any)[k] - dt);
    // passive: the core feeds on the planet, the field charges itself
    const coreAlive = this.core && !this.core.dead;
    const coreBio = coreAlive ? 0.55 + this.emLevel * 0.25 : 0;
    this.res.bio += coreBio * dt;
    const chargeCap = 60 + this.emLevel * 40;
    this.res.charge = Math.min(chargeCap, this.res.charge + (1.1 + this.emLevel * 0.5) * dt);
    this.income.bio = this.income.bio * 0.98 + coreBio * 0.02;
    if (this.fieldDirty) this.rebuildField();
    if (this.tick >= 0.2) { this.growth(this.tick); this.tick = 0; }
    this.digest(dt);
    this.updateBuildings(dt);
    // biomass past what the field can hold rots back into the ground (keeps long games from inflating)
    const cap = this.bioCap;
    if (this.res.bio > cap) this.res.bio -= (this.res.bio - cap) * Math.min(1, dt * 0.35);
  }
  /** how much biomass the field can hold */
  get bioCap() { return 450 + this.emLevel * 320 + this.buildings.filter((b) => b.done && b.def.kind === 'vault').length * 400; }

  private growth(dt: number) {
    const w = this.w, R = w.region, N = R.N, cov = this.cov, other = this.enemyCov, f = this.field;
    const costPer = 0.3;
    // growth keeps a reserve for building; painted ground may dig into it
    const reserve = this.faction === 'veyr' ? 60 : 40;
    const budget = Math.max(0, this.res.bio - reserve), paintBudget = Math.max(0, this.res.bio - 12);
    let spent = 0, cells = 0;
    const rate = 0.22 * dt * this.autoRate;
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = z * N + x;
      const c = cov[i];
      if (c >= 0.5) cells++;
      if (f[i] <= 0) {
        // outside the field growth slowly recedes
        if (c > 0 && c < 0.99) cov[i] = Math.max(0, c - dt * 0.02);
        continue;
      }
      if (c >= 1) continue;
      if (R.h[i] < R.water) continue;
      // needs established growth next to it
      const nb = Math.max(cov[i - 1], cov[i + 1], cov[i - N], cov[i + N]);
      if (nb < 0.55 && c <= 0) continue;
      const step = Math.abs(R.h[i] - R.h[i - 1]) > 1.5 && Math.abs(R.h[i] - R.h[i + 1]) > 1.5 ? 0.5 : 1;
      let g = rate * f[i] * step * (this.paint[i] ? 3.2 : 1) * (R.b[i] === B.ROCK || R.b[i] === B.BASALT ? 0.6 : 1);
      // contested ground: whoever has the stronger field wins it
      if (other[i] > 0.05) { other[i] = Math.max(0, other[i] - g * 0.8); g *= 0.4; }
      const need = g * costPer;
      const avail = (this.paint[i] ? paintBudget : budget) - spent;
      if (avail < need) g *= Math.max(0, avail / need);
      cov[i] = Math.min(1, c + g);
      spent += g * costPer;
      if (c < 0.8 && cov[i] >= 0.8) this.eatPlantsAt(x, z);
    }
    this.res.bio -= spent;
    this.cells = cells;
    this.mass = cells + this.buildings.reduce((s, b) => s + (b.done ? b.def.hp * 0.25 : 0), 0);
    let lvl = 1; for (let k = 1; k < EM_LEVELS.length; k++) if (this.mass >= EM_LEVELS[k]) lvl = k + 1;
    if (lvl !== this.emLevel) { const up = lvl > this.emLevel; this.emLevel = lvl; this.fieldDirty = true; if (up) this.onEvent?.('em', lvl); }
    // plants on established growth are drained into biomass
    for (const p of this.plantsEaten) {
      const got = w.flora.eat(p, dt * 0.12);
      if (got > 0) { this.res.bio += got * 0.07; this.income.bio += got * 0.02; if (Math.random() < 0.06) { const y = w.surfaceY(w.flora.x[p], w.flora.z[p]); this.fx.mote(w.flora.x[p], y + 0.3, w.flora.z[p], this.core!.x, this.core!.y + 0.9, this.core!.z, this.vein, 3); } }
      else this.plantsEaten.delete(p);
    }
    this.flushCov();
  }
  private eatPlantsAt(x: number, z: number) { this.w.flora.near(x + 0.5, z + 0.5, 0.75, (i) => { if (this.w.flora.bio[i] > 0) this.plantsEaten.add(i); }); }
  flushCov() {
    const t = this.w.terrain;
    const N = this.w.region.N;
    for (let i = 0; i < N * N; i++) { if (this.faction === 'veyr') t.setMoss(i, this.cov[i]); else t.setCreep(i, this.cov[i]); }
    t.mossFlush();
  }

  // ------------------------------------------------------------------ digestion
  /** corpses lying on established growth are overgrown and drained; returns true when it starts */
  tryDigest(c: Creature, speed = 1): boolean {
    if (!c.dead || c.digest > 0 || c.bio <= 0.3 || this.covAt(c.x, c.z) < 0.5) return false;
    const dur = (5 + Math.sqrt(Math.max(1, c.mass)) * 1.4) / speed;
    this.digesting.push({ c, t: 0, dur, bio0: c.bio, rate: c.bio / dur });
    c.digest = 0.001;
    // tendrils swarm the body
    const n = Math.min(7, 3 + Math.floor(c.size * 2));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const root = new THREE.Vector3(c.x + Math.cos(a) * (c.radius + 0.6), this.w.surfaceY(c.x, c.z), c.z + Math.sin(a) * (c.radius + 0.6));
      const off = new THREE.Vector3((Math.random() - 0.5) * c.radius, c.size * 0.3, (Math.random() - 0.5) * c.radius);
      this.fx.tendril(root, () => (c.digest > 0 && c.digest < 1.05 ? new THREE.Vector3(c.x + off.x, c.y + off.y + 0.1, c.z + off.z) : null), dur + 1.5, 0.06 + c.size * 0.02, 8);
    }
    return true;
  }

  private digest(dt: number) {
    const w = this.w;
    for (let i = this.digesting.length - 1; i >= 0; i--) {
      const d = this.digesting[i], c = d.c;
      d.t += dt;
      const k = Math.min(1, d.t / d.dur);
      c.digest = Math.max(0.001, k);
      c.fx.moss.value = Math.min(1, k * 1.25);
      c.fx.decay.value = Math.max(c.fx.decay.value, k * 0.6);
      const take = Math.min(c.bio, d.rate * dt);
      c.bio -= take;
      this.res.bio += take * 1.0;
      this.income.bio += take * 0.02;
      if (this.core && Math.random() < dt * (2 + c.size * 2)) this.fx.mote(c.x + (Math.random() - 0.5) * c.radius, c.y + c.size * 0.3, c.z + (Math.random() - 0.5) * c.radius, this.core.x, this.core.y + 0.9, this.core.z, this.vein, 3 + Math.random() * 2);
      if (k >= 1) {
        // dissolve, then the genome is offered
        c.fx.dissolve.value = Math.min(1, c.fx.dissolve.value + dt * 0.8);
        if (c.fx.dissolve.value >= 1) {
          this.digesting.splice(i, 1);
          this.fx.burst(c.x, c.y + c.size * 0.4, c.z, 18, this.vein, { glow: true, up: 2.5, speed: 1.5, size: 3, life: 1.2, grav: -0.5 });
          const sp = c.sp;
          w.remove(c);
          if (this.harvest) this.harvest(c, sp);
        }
      }
    }
  }

  // ------------------------------------------------------------------ buildings
  canPlace(kind: BKind, x: number, z: number): string | null {
    const def = BDEFS[kind], w = this.w, R = w.region;
    if (def.em > this.emLevel) return `Needs EM level ${def.em}`;
    if (this.res.bio < def.bio) return 'Not enough biomass';
    if (this.res.min < def.min) return 'Not enough minerals';
    if (x < 2 || z < 2 || x > R.N - 2 || z > R.N - 2) return 'Out of bounds';
    if (this.covAt(x, z) < 0.6) return 'Must grow on established moss';
    if (!this.inField(x, z)) return 'Outside your field';
    // flat enough
    const h = R.heightAt(x, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(R.heightAt(x + dx * def.radius * 0.8, z + dz * def.radius * 0.8) - h) > 0.6) return 'Ground too uneven';
    for (const b of this.allBuildings()) if (Math.hypot(b.x - x, b.z - z) < b.def.radius + def.radius + 0.4) return 'Too close to another structure';
    if (def.onDeposit && this.depositAt(x, z) < 0) return 'Must sit on a ferrite or crystal seam';
    return null;
  }
  allBuildings(): Building[] { return this.w.hives.flatMap((h) => h.buildings); }
  depositAt(x: number, z: number) { return this.w.region.deposits.findIndex((d) => Math.hypot(d.x - x, d.z - z) < d.r + 1.2 && d.amount > 0); }

  place(kind: BKind, x: number, z: number): Building | null {
    if (this.canPlace(kind, x, z)) return null;
    const def = BDEFS[kind];
    this.res.bio -= def.bio; this.res.min -= def.min;
    const b = new Building(def, this.faction, x, z, this.w.region.heightAt(x, z), this.faction === 'rival' ? RIVALS[this.rivalKey].core : undefined);
    if (kind === 'tap') b.deposit = this.depositAt(x, z);
    this.buildings.push(b);
    this.w.scene.add(b.mesh);
    this.fx.burst(x, b.y + 0.2, z, 14, this.color, { up: 2, speed: 2, size: 4, life: 0.9 });
    return b;
  }

  private updateBuildings(dt: number) {
    const w = this.w;
    let supply = 0;
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      b.sync(dt, w.time);
      if (b.hp <= 0 && !b.dead) { this.destroy(b); continue; }
      if (!b.done) {
        b.progress = Math.min(1, b.progress + dt / b.def.time);
        b.hp = Math.min(b.maxHp, b.hp + (b.def.hp / b.def.time) * dt * 0.9);
        if (b.progress >= 1) { b.done = true; b.hp = Math.max(b.hp, b.maxHp * 0.95); this.fieldDirty = true; this.onEvent?.('built', b); this.fx.burst(b.x, b.y + 1, b.z, 26, this.vein, { glow: true, up: 3, speed: 2.5, size: 3, life: 1 }); }
        continue;
      }
      supply += b.def.supply;
      if (b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + dt * 2);
      b.cool -= dt;
      switch (b.def.kind) {
        case 'tap': {
          const d = w.region.deposits[b.deposit];
          if (d && d.amount > 0) { const r = (d.kind === 'crystal' ? 1.7 : 1.15) * dt; d.amount -= r; this.res.min += r; this.income.min = this.income.min * 0.98 + r / dt * 0.02; }
          break;
        }
        case 'brood': this.produce(b, dt); break;
        case 'maw': {
          if (b.cool <= 0) {
            b.cool = 0.5;
            w.near(b.x, b.z, 9, (c) => {
              if (!c.dead || c.digest > 0 || c.bio <= 0.3) return;
              const dx = b.x - c.x, dz = b.z - c.z, d = Math.hypot(dx, dz);
              if (d > b.def.radius + 0.5) { c.x += (dx / d) * Math.min(d, 1.4); c.z += (dz / d) * Math.min(d, 1.4); c.y = w.surfaceY(c.x, c.z); }
              else this.tryDigest(c, 2);
            });
          }
          break;
        }
        case 'thorn': case 'coil': {
          if (b.cool > 0) break;
          const range = b.def.kind === 'coil' ? 12 : 9;
          let tgt: Creature | null = null, bd = range * range;
          w.near(b.x, b.z, range, (c) => {
            if (c.dead || c.faction === this.faction || !c.visibleNow && this.faction === 'veyr') return;
            if (c.faction === 'wild' && c.target === 0 && c.mind !== 'attack' && c.mind !== 'hunt') return;
            const d = (c.x - b.x) ** 2 + (c.z - b.z) ** 2;
            if (d < bd) { bd = d; tgt = c; }
          });
          if (!tgt) break;
          const t = tgt as Creature;
          if (b.def.kind === 'coil') {
            if (this.res.charge < 6) break;
            this.res.charge -= 6; b.cool = 1.6;
            this.fx.arc(new THREE.Vector3(b.x, b.y + 3.7, b.z), new THREE.Vector3(t.x, t.y + t.size * 0.4, t.z), 0.25, VEYR.em);
            w.damage(t, 14, null);
          } else {
            b.cool = 0.9;
            this.fx.burst(b.x, b.y + 1.3, b.z, 3, 0xe8e0c8, { speed: 1, up: 1, size: 2, life: 0.3 });
            this.spine(b, t);
          }
          break;
        }
        case 'lure': {
          if (b.cool > 0) break;
          b.cool = 3;
          w.near(b.x, b.z, 26, (c) => {
            if (c.dead || c.faction !== 'wild' || c.diet === 'carn' || c.mind === 'flee') return;
            if (Math.random() < 0.35) { c.mind = 'wander'; c.goalX = b.x + (Math.random() - 0.5) * 3; c.goalZ = b.z + (Math.random() - 0.5) * 3; c.path = null; }
          });
          break;
        }
      }
    }
    this.supplyCap = supply;
  }

  private spine(b: Building, t: Creature) {
    const from = new THREE.Vector3(b.x, b.y + 1.3, b.z), to = new THREE.Vector3(t.x, t.y + t.size * 0.4, t.z);
    const steps = 6;
    for (let k = 0; k < steps; k++) { const p = from.clone().lerp(to, k / steps); this.fx.glow.emit(p.x, p.y, p.z, 0, 0, 0, new THREE.Color(0xfff0d0), 0.9, 2.5, 0.12 + k * 0.03); }
    this.w.damage(t, 7, null);
  }

  /** brood: gestate the queue */
  private produce(b: Building, dt: number) {
    if (!b.queue.length) return;
    const sp = this.w.reg.get(b.queue[0]);
    if (this.supplyUsed >= this.supplyCap) return;
    b.qT += dt;
    if (Math.random() < dt * 2) this.fx.burst(b.x, b.y + 1.8, b.z, 1, this.vein, { glow: true, up: 0.6, speed: 0.4, size: 2.5, life: 1 });
    if (b.qT >= sp.pheno.buildTime) {
      b.qT = 0; b.queue.shift();
      const a = Math.random() * Math.PI * 2;
      const c = this.w.spawn(sp, this.faction, b.x + Math.cos(a) * (b.def.radius + 0.8), b.z + Math.sin(a) * (b.def.radius + 0.8), false);
      if (c) {
        c.energy = 0.9;
        const rp = b.rally;
        if (rp) { c.order = { kind: 'move', x: rp[0], z: rp[1] }; c.homeX = rp[0]; c.homeZ = rp[1]; } else { c.homeX = c.x; c.homeZ = c.z; }
        this.fx.burst(c.x, c.y + 0.4, c.z, 16, this.vein, { glow: true, up: 2, speed: 2, size: 3, life: 0.8 });
        this.onEvent?.('birth', c);
      }
    }
  }
  queueCost(sp: Species) { return { bio: sp.pheno.cost, min: Math.round(sp.pheno.stats.armor * 60) }; }
  enqueue(b: Building, sp: Species): string | null {
    const c = this.queueCost(sp);
    if (this.res.bio < c.bio) return 'Not enough biomass';
    if (this.res.min < c.min) return 'Not enough minerals';
    if (b.queue.length >= 5) return 'Queue full';
    this.res.bio -= c.bio; this.res.min -= c.min;
    b.queue.push(sp.id);
    return null;
  }

  destroy(b: Building) {
    b.dead = true;
    this.fx.burst(b.x, b.y + 1, b.z, 30, 0x6a4a3a, { up: 4, speed: 3, size: 5, life: 1.2 });
    this.fx.burst(b.x, b.y + 1, b.z, 20, this.vein, { glow: true, up: 3, speed: 2, size: 3, life: 1 });
    const i = this.buildings.indexOf(b); if (i >= 0) this.buildings.splice(i, 1);
    b.dispose();
    this.fieldDirty = true;
    if (b === this.core) { this.lost = true; this.core = null; }
  }

  countUnits() { let n = 0; for (const c of this.w.creatures) if (!c.dead && c.faction === this.faction) n++; this.supplyUsed = n; return n; }

  // ------------------------------------------------------------------ abilities
  can(a: Ability): string | null {
    const d = ABILITIES[a];
    if (d.em > this.emLevel) return `Needs EM level ${d.em}`;
    if ((this.cooldowns[a] ?? 0) > 0) return 'Recharging';
    if (this.res.charge < d.charge) return 'Not enough charge';
    if (this.res.bio < d.bio) return 'Not enough biomass';
    return null;
  }
  spend(a: Ability) { const d = ABILITIES[a]; this.res.charge -= d.charge; this.res.bio -= d.bio; this.cooldowns[a] = d.cd; }

  /** snare: is this creature catchable (on or beside growth, inside the field) */
  snareable(c: Creature) {
    if (c.dead || c.faction === this.faction || c.air > 1) return false;
    if (!this.inField(c.x, c.z)) return false;
    const N = this.w.region.N;
    const r = Math.ceil(ABILITIES.snare.range);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const X = Math.floor(c.x) + dx, Z = Math.floor(c.z) + dz;
      if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
      if (this.cov[Z * N + X] > 0.6 && dx * dx + dz * dz <= r * r) return true;
    }
    return false;
  }
  /** nearest established growth cell to a point (for tendril roots) */
  nearestGrowth(x: number, z: number, maxR = 6): [number, number] | null {
    const N = this.w.region.N;
    let best: [number, number] | null = null, bd = 1e9;
    for (let dz = -maxR; dz <= maxR; dz++) for (let dx = -maxR; dx <= maxR; dx++) {
      const X = Math.floor(x) + dx, Z = Math.floor(z) + dz;
      if (X < 0 || Z < 0 || X >= N || Z >= N || this.cov[Z * N + X] < 0.6) continue;
      const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = [X + 0.5, Z + 0.5]; }
    }
    return best;
  }
}
