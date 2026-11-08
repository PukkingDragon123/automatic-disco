// A rival asteroid: another seed of the same kind falls burning onto the region and plays the same game. It grows
// its creep, raises structures on it, taps the seams, steals the genomes of whatever it digests (its brood are
// recoloured, mutated cousins of the local fauna), keeps a guard at home, crushes intruders with its field, and
// sends waves at the Veyr's nearest structure, sooner and larger as it grows.
import * as THREE from 'three';
import { Hive } from './hive';
import type { World } from './world';
import type { Fx } from './fx';
import type { Species } from './species';
import type { Creature } from './creature';
import { BDEFS, type BKind } from './buildings';
import { RIVALS } from '../world/palette';
import { mutate } from '../life/design';
import { Rand } from '../core/rand';
import { mixHex } from '../limbo/gfx/pixel';
import { sfx } from '../audio/audio';

const ORDER: BKind[] = ['brood', 'spire', 'tap', 'thorn', 'spire', 'brood', 'tap', 'thorn', 'spire', 'maw', 'thorn', 'brood'];

export class RivalBrain {
  readonly hive: Hive;
  readonly name: string;
  private r: Rand;
  private thinkT = 2; private waveT = 160; private wave = 0; private fallT = 2.4; private pulseT = 0;
  landed = false;
  species: Species[] = [];
  private sky: THREE.Vector3;

  constructor(readonly w: World, readonly fx: Fx, readonly key: number, readonly x: number, readonly z: number, seed: number, private hooks: { landed?(b: RivalBrain): void; wave?(b: RivalBrain, n: number): void } = {}) {
    this.r = new Rand(seed);
    this.hive = new Hive(w, 'rival', fx, key);
    this.hive.harvest = (_c, sp) => this.absorb(sp);
    this.name = RIVALS[key].name;
    this.sky = new THREE.Vector3(x - 60, 120, z - 40);
  }

  /** a landing site: far from the Veyr, dry and flat */
  static site(w: World, fromX: number, fromZ: number, r: Rand): [number, number] | null {
    const R = w.region, N = R.N;
    let best: [number, number] | null = null, bs = -1e9;
    for (let k = 0; k < 400; k++) {
      const x = 10 + r.next() * (N - 20), z = 10 + r.next() * (N - 20);
      const h = R.heightAt(x, z);
      if (h < R.water + 0.8) continue;
      let rough = 0; for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) rough += Math.abs(R.heightAt(x + dx, z + dz) - h);
      const d = Math.hypot(x - fromX, z - fromZ);
      const s = Math.min(d, N * 0.6) - rough * 6 - (w.mossAtXZ(x, z) > 0.1 ? 100 : 0);
      if (s > bs) { bs = s; best = [x, z]; }
    }
    return best && Math.hypot(best[0] - fromX, best[1] - fromZ) > N * 0.3 ? best : null;
  }

  update(dt: number) {
    if (!this.landed) { this.fall(dt); return; }
    if (this.hive.lost) return;
    this.waveT -= dt; this.pulseT -= dt;
    this.hive.res.min += dt * 0.3; // it mines its own crater
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 2; this.think(); }
  }

  // ------------------------------------------------------------------ arrival
  private fall(dt: number) {
    this.fallT -= dt;
    const ground = new THREE.Vector3(this.x, this.w.region.heightAt(this.x, this.z), this.z);
    const p = this.sky.clone().lerp(ground, Math.min(1, 1 - this.fallT / 2.4));
    const col = RIVALS[this.key].vein;
    if (Math.random() < 0.9) this.fx.burst(p.x, p.y, p.z, 4, col, { glow: true, speed: 1.5, up: 0.5, size: 5, life: 0.9, grav: -0.5 });
    this.fx.burst(p.x, p.y, p.z, 2, 0x3a2a30, { speed: 1, up: 1, size: 6, life: 1.4, grav: -0.2 });
    if (this.fallT > 0) return;
    this.landed = true;
    const R = this.w.region;
    R.carveCrater(this.x, this.z, 4.5, 2.4);
    this.w.terrain.flushDirty(); this.w.flora.reseat(this.x, this.z, 9);
    this.hive.plantCore(this.x, this.z);
    this.w.hives.push(this.hive);
    this.w.terrain.setRival(this.key, this.x, this.z);
    this.fx.burst(this.x, ground.y + 1, this.z, 90, 0x5a4048, { speed: 9, up: 9, size: 5, life: 2, grav: 9 });
    this.fx.burst(this.x, ground.y + 1, this.z, 60, col, { glow: true, speed: 6, up: 6, size: 4, life: 1.6, grav: 3 });
    sfx('crack', 3, 1); sfx('pulse', 0.5, 1);
    this.adopt();
    this.hooks.landed?.(this);
  }

  // ------------------------------------------------------------------ brain
  private think() {
    const h = this.hive, core = h.core; if (!core) return;
    if (!this.species.length) this.adopt();
    this.build();
    this.produce();
    const army = this.w.creatures.filter((c) => !c.dead && c.faction === 'rival');
    // intruders near home: guards and the field answer
    let intruder: Creature | null = null, id = 1e9;
    for (const c of this.w.creatures) {
      if (c.dead || c.faction !== 'veyr') continue;
      const d = Math.hypot(c.x - core.x, c.z - core.z);
      if (d < 18 && d < id) { id = d; intruder = c; }
    }
    if (intruder) {
      for (const c of army) if (!c.order || c.order.kind !== 'amove' || Math.hypot(c.order.x - core.x, c.order.z - core.z) < 20) c.order = { kind: 'amove', x: intruder.x, z: intruder.z };
      if (this.pulseT <= 0 && h.res.charge >= 30) {
        this.pulseT = 9; h.res.charge -= 30;
        const ix = intruder.x, iz = intruder.z, iy = this.w.surfaceY(ix, iz);
        this.fx.burst(ix, iy + 0.5, iz, 40, RIVALS[this.key].vein, { glow: true, speed: 5, up: 1, size: 3, life: 0.7 });
        this.w.near(ix, iz, 4.5, (c) => { if (!c.dead && c.faction === 'veyr') { c.stunT = Math.max(c.stunT, 2); this.w.damage(c, 6, null); } });
        sfx('pulse', 0.8, 0.5);
      }
      return;
    }
    // waves: everything but a small guard goes for the nearest Veyr structure
    const need = 4 + this.wave * 2;
    if (this.waveT <= 0 && army.length >= Math.min(need, 14)) {
      const veyr = this.w.hives.find((x) => x.faction === 'veyr');
      let tx = 0, tz = 0, bd = 1e9;
      for (const b of veyr?.buildings ?? []) { const d = Math.hypot(b.x - core.x, b.z - core.z); if (d < bd) { bd = d; tx = b.x; tz = b.z; } }
      if (bd < 1e9) {
        const attackers = army.slice(0, Math.max(1, army.length - 2));
        for (const c of attackers) { c.order = { kind: 'amove', x: tx + (Math.random() - 0.5) * 4, z: tz + (Math.random() - 0.5) * 4 }; c.homeX = tx; c.homeZ = tz; }
        this.wave++;
        this.waveT = Math.max(70, 160 - this.wave * 15);
        this.hooks.wave?.(this, attackers.length);
      }
    } else {
      // the guard drifts back home
      for (const c of army) if (!c.order && Math.hypot(c.x - core.x, c.z - core.z) > 16) c.order = { kind: 'move', x: core.x + (Math.random() - 0.5) * 8, z: core.z + (Math.random() - 0.5) * 8 };
    }
  }
  private build() {
    const h = this.hive, core = h.core!;
    const have: Partial<Record<BKind, number>> = {};
    for (const b of h.buildings) have[b.def.kind] = (have[b.def.kind] ?? 0) + 1;
    const want: Partial<Record<BKind, number>> = {};
    for (const k of ORDER) {
      want[k] = (want[k] ?? 0) + 1;
      if ((have[k] ?? 0) >= want[k]!) continue;
      const def = BDEFS[k];
      if (def.em > h.emLevel) continue;
      if (h.res.bio < def.bio + 15 || h.res.min < def.min) return;
      // candidates: seams for taps, the side facing the Veyr for spires, near the core for the rest
      const veyr = this.w.hives.find((x) => x.faction === 'veyr')?.core;
      for (let tries = 0; tries < 40; tries++) {
        let x: number, z: number;
        if (k === 'tap') {
          const ds = this.w.region.deposits.filter((d) => d.amount > 0 && h.inField(d.x, d.z));
          if (!ds.length) break; // no seam in reach: skip to the next wish
          const d = ds[this.r.int(0, ds.length - 1)]; x = d.x + (this.r.next() - 0.5) * d.r; z = d.z + (this.r.next() - 0.5) * d.r;
        } else {
          const a = k === 'spire' && veyr ? Math.atan2(veyr.z - core.z, veyr.x - core.x) + (this.r.next() - 0.5) * 1.6 : this.r.next() * Math.PI * 2;
          const rr = k === 'spire' ? 8 + this.r.next() * 6 : 4 + this.r.next() * 6;
          x = core.x + Math.cos(a) * rr; z = core.z + Math.sin(a) * rr;
        }
        if (!h.canPlace(k, x, z)) { h.place(k, x, z); return; }
      }
    }
  }
  private produce() {
    const h = this.hive;
    if (!this.species.length) return;
    for (const b of h.buildings) {
      if (b.def.kind !== 'brood' || !b.done || b.queue.length >= 2) continue;
      // later waves favour the heaviest stock it has
      const pool = [...this.species].sort((a, b2) => b2.pheno.stats.attack * b2.pheno.stats.hp - a.pheno.stats.attack * a.pheno.stats.hp);
      const sp = pool[this.r.chance(0.6) ? 0 : this.r.int(0, pool.length - 1)];
      const cost = h.queueCost(sp);
      if (h.res.bio < cost.bio + 25 || h.res.min < cost.min) continue;
      h.enqueue(b, sp);
    }
  }
  /** take two of the local fauna (the most dangerous) as its first stock */
  private adopt() {
    const val = (s: Species) => (s.pheno.stats.attack * s.pheno.stats.hp) / (s.pheno.cost + 40);
    const wild = this.w.reg.list.filter((s) => s.owner === 'wild' && s.pheno.cost < 320).sort((a, b) => val(b) - val(a));
    for (const sp of wild.slice(0, 2)) this.absorb(sp);
  }
  /** a genome it digested becomes a recoloured, mutated cousin in its brood */
  absorb(sp: Species) {
    if (sp.owner !== 'wild' || this.species.length >= 5 || this.species.some((s) => s.parent === sp.id)) return;
    const P = RIVALS[this.key];
    const d = mutate(sp.design, this.r, 0.12);
    d.colors = { base: mixHex(d.colors.base, P.creep, 0.6), belly: mixHex(d.colors.belly, P.creepLight, 0.5), pattern: P.creepDark, accent: P.vein, eye: P.vein };
    d.name = `${P.name.split(' ').pop()} ${sp.name.split(' ').pop()}`;
    const s = this.w.reg.add(d, 'rival', sp.id, 'rival', this.w.time);
    this.species.push(s);
  }
}
