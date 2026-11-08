// A region in play: terrain, flora, fauna and the factions fighting over it.
import * as THREE from 'three';
import { Region } from '../world/region';
import { Terrain } from '../world/terrain';
import { Flora } from '../world/flora';
import { Sun } from '../gfx/lights';
import { Pather } from './path';
import { Registry, type Species, type Faction } from './species';
import { Creature } from './creature';
import { act } from './ai';
import { wildDesign, mutate, divergence, nameFor, type Role } from '../life/design';
import { Rand, clamp, hash01 } from '../core/rand';
import { B } from '../world/blockTex';
import type { Palette } from '../world/palette';

export interface WorldHooks {
  onDeath?(c: Creature, by: Creature | null): void;
  onBirth?(c: Creature, parent: Creature, newSpecies: Species | null): void;
  onDamage?(c: Creature, amount: number, by: Creature | null): void;
}

const ROLE_CAP: Record<Role, number> = { mite: 16, grazer: 9, tank: 4, stalker: 5, apex: 2, scavenger: 6, flyer: 10, snail: 8 };
const ROLE_GROUPS: Record<Role, [number, number, number]> = { mite: [4, 3, 5], grazer: [3, 3, 5], tank: [2, 2, 3], stalker: [3, 1, 2], apex: [1, 1, 1], scavenger: [3, 1, 2], flyer: [2, 3, 5], snail: [3, 2, 3] };

export class World {
  readonly scene = new THREE.Scene();
  readonly fxScene = new THREE.Scene();
  readonly terrain: Terrain;
  readonly flora: Flora;
  readonly sun: Sun;
  readonly pather: Pather;
  creatures: Creature[] = [];
  private byId = new Map<number, Creature>();
  private grid = new Map<number, Creature[]>();
  time = 0;
  /** 0..1 over a day; 0.25 noon-ish */
  day = 0.32;
  dayLen = 420;
  hooks: WorldHooks = {};
  roles = new Map<number, Role>();
  herds = new Map<number, Creature[]>();
  private herdN = 1;
  /** veyr moss coverage, rival creep coverage (0..1) */
  readonly moss: Float32Array; readonly creep: Float32Array;
  hives: import('./hive').Hive[] = [];
  readonly frustum = new THREE.Frustum();
  private projM = new THREE.Matrix4();

  constructor(readonly region: Region, readonly reg: Registry, readonly seed: number) {
    this.terrain = new Terrain(region);
    this.flora = new Flora(region, this.terrain.moss, this.terrain.vis);
    this.terrain.setShade(this.flora.shade);
    this.scene.add(this.terrain.group, this.flora.group);
    this.sun = new Sun(region.pal, this.scene);
    this.pather = new Pather(region);
    this.moss = new Float32Array(region.N * region.N);
    this.creep = new Float32Array(region.N * region.N);
    this.scene.background = new THREE.Color(0x07080c);
  }
  get pal(): Palette { return this.region.pal; }

  // ------------------------------------------------------------------ fauna
  spawnFauna(r: Rand) {
    const R = this.region, bi = R.biome;
    const roles: Role[] = ['mite', 'mite', 'grazer', 'stalker', 'apex', 'scavenger', 'flyer'];
    if (bi.fauna >= 0.8 && bi.key !== 'desert') roles.push('tank');
    if (bi.moist > 0.45) roles.push('snail');
    roles.forEach((role, i) => {
      const d = wildDesign(role, R.pal, this.seed * 977 + i * 131);
      const sp = this.reg.add(d, 'wild', null, role, 0);
      this.roles.set(sp.id, role);
      const [groups, a, b] = ROLE_GROUPS[role];
      const ng = Math.max(1, Math.round(groups * bi.fauna));
      for (let g = 0; g < ng; g++) {
        const at = this.spawnSpot(r, role === 'apex' ? 34 : 16, sp);
        if (!at) continue;
        const herd = this.herdN++;
        const n = r.int(a, b);
        for (let k = 0; k < n; k++) {
          const c = this.spawn(sp, 'wild', at[0] + r.range(-2.5, 2.5), at[1] + r.range(-2.5, 2.5), r.chance(0.2));
          if (!c) continue;
          c.herd = herd; c.energy = r.range(0.5, 0.95);
          if (role === 'apex') c.boss = true;
          let h = this.herds.get(herd); if (!h) this.herds.set(herd, (h = [])); h.push(c);
        }
      }
    });
  }

  private spawnSpot(r: Rand, minFromLanding: number, sp: Species): [number, number] | null {
    const R = this.region;
    for (let t = 0; t < 300; t++) {
      const x = r.range(6, R.N - 6), z = r.range(6, R.N - 6);
      if (Math.hypot(x - R.landing.x, z - R.landing.z) < minFromLanding) continue;
      if (R.isWater(x, z) && !(sp.pheno.stats.swim > 0)) continue;
      if (R.isSolid(x, z)) continue;
      const i = Math.floor(z) * R.N + Math.floor(x);
      if (R.fert[i] < 0.15 && sp.design.lineage !== 'arthropod') continue;
      return [x, z];
    }
    return null;
  }

  spawn(sp: Species, f: Faction, x: number, z: number, juvenile = false): Creature | null {
    const R = this.region;
    x = clamp(x, 1, R.N - 1); z = clamp(z, 1, R.N - 1);
    // never inside a rock formation: step out to the nearest open ground
    if (R.isSolid(x, z)) { const f = R.freeNear(x, z); if (!f) return null; [x, z] = f; }
    if (R.isWater(x, z) && !sp.pheno.stats.swim && !sp.pheno.canFly) return null;
    const c = new Creature(sp, f, x, z, juvenile);
    c.y = this.surfaceY(x, z);
    this.creatures.push(c);
    this.byId.set(c.id, c);
    this.scene.add(c.mesh);
    return c;
  }

  get(id: number): Creature | undefined { return id > 0 ? this.byId.get(id) : undefined; }

  // ------------------------------------------------------------------ queries
  surfaceY(x: number, z: number) { return this.region.surfaceY(x, z); }
  surfaceYsmooth(x: number, z: number) { return Math.max(this.region.heightAt(x, z), this.region.water - 0.15); }
  mossAtXZ(x: number, z: number) { const R = this.region; return this.moss[clamp(Math.floor(z), 0, R.N - 1) * R.N + clamp(Math.floor(x), 0, R.N - 1)]; }
  creepAtXZ(x: number, z: number) { const R = this.region; return this.creep[clamp(Math.floor(z), 0, R.N - 1) * R.N + clamp(Math.floor(x), 0, R.N - 1)]; }
  near(x: number, z: number, r: number, fn: (c: Creature) => void) {
    const c0 = Math.floor((x - r) / 4), c1 = Math.floor((x + r) / 4), r0 = Math.floor((z - r) / 4), r1 = Math.floor((z + r) / 4);
    const r2 = r * r;
    for (let cz = r0; cz <= r1; cz++) for (let cx = c0; cx <= c1; cx++) {
      const l = this.grid.get((cz << 8) | (cx & 255)); if (!l) continue;
      for (const c of l) if ((c.x - x) ** 2 + (c.z - z) ** 2 <= r2) fn(c);
    }
  }
  /** terrain + territory speed multiplier */
  moveMul(c: Creature) {
    if (c.canFly) return 1;
    const R = this.region, i = Math.floor(c.z) * R.N + Math.floor(c.x);
    let k = R.b[i] === B.MUD ? 0.75 : R.b[i] === B.SAND ? 0.88 : R.b[i] === B.SNOW ? 0.8 : 1;
    if (R.h[i] < R.water) k *= c.st.swim > 0 ? 1 : 0.5;
    const m = this.moss[i], cr = this.creep[i];
    if (m > 0.5) k *= c.faction === 'veyr' ? 1.18 : 0.7;
    if (cr > 0.5) k *= c.faction === 'rival' ? 1.18 : 0.7;
    return k;
  }
  herdCenter(c: Creature): [number, number] | null {
    const h = this.herds.get(c.herd); if (!h) return null;
    let x = 0, z = 0, n = 0;
    for (const o of h) if (!o.dead) { x += o.x; z += o.z; n++; }
    return n ? [x / n, z / n] : null;
  }

  // ------------------------------------------------------------------ life and death
  damage(c: Creature, amount: number, by: Creature | null) {
    if (c.dead || amount <= 0) return;
    const dealt = amount * (1 - c.st.armor);
    c.hp -= dealt;
    c.fx.flash.value = 1;
    c.fx.flashCol.value.setRGB(1, 0.35, 0.3);
    if (by) { c.lastHitBy = by.id; if (c.mind !== 'flee' && c.mind !== 'held' && (c.diet !== 'herb' || c.mass > by.mass)) { c.target = by.id; if (!c.order) c.mind = 'attack'; } }
    this.hooks.onDamage?.(c, dealt, by);
    if (c.hp <= 0) this.kill(c, by);
  }

  kill(c: Creature, by: Creature | null) {
    if (c.dead) return;
    c.dead = true; c.deathTime = this.time; c.hp = 0;
    c.bio = 4 + Math.pow(Math.max(0.5, c.mass), 0.8) * 1.6;
    c.mind = 'idle'; c.order = null; c.atkAnim = -1; c.vx = c.vz = 0; c.selected = false;
    c.sp.alive--;
    if (c.sp.alive <= 0 && c.sp.owner === 'wild') c.sp.extinct = true;
    if (by) by.sp.kills++;
    this.hooks.onDeath?.(c, by);
  }

  /** remove from the world entirely (absorbed, dissolved) */
  remove(c: Creature) {
    const i = this.creatures.indexOf(c);
    if (i >= 0) this.creatures.splice(i, 1);
    this.byId.delete(c.id);
    if (!c.dead) c.sp.alive--;
    c.dispose();
  }

  canBreed(c: Creature): boolean {
    if (c.faction === 'wild') {
      const role = this.roles.get(this.rootOf(c.sp).id);
      const cap = Math.round((role ? ROLE_CAP[role] : 6) * this.region.biome.fauna);
      return this.countLineage(c.sp) < cap;
    }
    return this.mossAtXZ(c.x, c.z) > 0.5 && (this.ownedSupply?.(c.faction) ?? 0) > 0;
  }
  ownedSupply?: (f: Faction) => number;
  private rootOf(sp: Species): Species { let s = sp; while (s.parent !== null) s = this.reg.get(s.parent); return s; }
  private countLineage(sp: Species) { const root = this.rootOf(sp); let n = 0; for (const c of this.creatures) if (!c.dead && this.rootOf(c.sp) === root) n++; return n; }

  breed(c: Creature) {
    const r = new Rand(hash01(c.id, this.time * 1000, 3) * 1e9);
    const n = Math.max(1, Math.min(c.st.litter, 3));
    let sp = c.sp, newSp: Species | null = null;
    // rare heritable drift founds a subspecies once it has diverged enough
    if (r.chance(c.faction === 'wild' ? 0.05 : 0.04)) {
      const d = mutate(c.sp.design, r, 0.11);
      const root = this.rootOf(c.sp);
      if (divergence(d, root.design) > 0.22) {
        d.name = nameFor(d, r);
        if (d.name === c.sp.name) d.name = 'Lesser ' + d.name;
        newSp = this.reg.add(d, c.sp.owner, c.sp.id, c.sp.role, this.time);
        if (c.faction === 'wild') this.roles.set(newSp.id, this.roles.get(root.id) ?? 'grazer');
        sp = newSp;
      }
    }
    for (let k = 0; k < n; k++) {
      const a = r.range(0, Math.PI * 2);
      const kid = this.spawn(sp, c.faction, c.x + Math.cos(a) * (c.radius + 0.5), c.z + Math.sin(a) * (c.radius + 0.5), true);
      if (!kid) continue;
      kid.herd = c.herd; kid.homeX = c.homeX; kid.homeZ = c.homeZ; kid.energy = 0.7;
      if (c.herd) this.herds.get(c.herd)?.push(kid);
      this.hooks.onBirth?.(kid, c, newSp);
      newSp = null;
    }
  }

  // ------------------------------------------------------------------ tick
  update(dt: number, cam: THREE.PerspectiveCamera) {
    this.time += dt;
    this.day = (this.day + dt / this.dayLen) % 1;
    // spatial hash
    this.grid.clear();
    for (const c of this.creatures) {
      const k = (Math.floor(c.z / 4) << 8) | (Math.floor(c.x / 4) & 255);
      let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(c);
    }
    this.projM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projM);
    const camPos = cam.position;
    const dead: Creature[] = [];
    for (const c of this.creatures) {
      if (!c.dead) {
        act(c, this, dt);
        c.move(this, dt);
        this.metabolism(c, dt);
      } else {
        c.rot += dt;
        if (c.digest <= 0) c.fx.decay.value = Math.min(1, c.rot / 150);
        if ((c.rot > 260 && c.digest <= 0) || (c.bio <= 0.01 && c.digest <= 0 && c.rot > 4)) dead.push(c);
      }
      // animate only what can be seen
      const near = c.mesh.position.distanceToSquared(camPos) < 120 * 120;
      const inView = near && this.frustum.intersectsSphere(sphere(c));
      c.mesh.visible = c.visibleNow && inView;
      c.sync(dt, this, c.mesh.visible || c.anim.deathT < 1 && c.dead);
    }
    for (const c of dead) this.remove(c);
    // the nearest movers to the view part the plants
    const movers: [number, number, number, number][] = [];
    for (const c of this.creatures) {
      if (c.dead || !c.mesh.visible) continue;
      const sp = Math.hypot(c.vx, c.vz);
      if (sp < 0.15 && c.mind !== 'held') continue;
      movers.push([c.x, c.z, c.radius * 1.8 + 0.4, Math.min(1, 0.4 + c.size * 0.35)]);
      if (movers.length >= 12) break;
    }
    this.flora.setPush(movers);
    this.flora.tick(dt);
    this.terrain.update(this.time);
    this.flora.update(this.time, cam);
  }

  private metabolism(c: Creature, dt: number) {
    const st = c.st;
    const drain = clamp(0.0022 + st.upkeep * 0.01, 0.0018, 0.009) * (c.mind === 'flee' || c.mind === 'hunt' ? 1.6 : 1);
    c.energy -= drain * dt;
    if (c.poison > 0) { c.poison -= dt; this.damage(c, st.hp * 0.012 * dt + 0.4 * dt, null); }
    if (c.energy <= 0) { c.energy = 0; this.damage(c, c.maxHp * 0.02 * dt, null); }
    else if (c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + st.regen * dt * (c.energy > 0.3 ? 1 : 0.2));
    c.age += dt;
    if (c.growth < 1) { c.growth = Math.min(1, c.growth + dt / st.maturity * 0.65); }
    if (c.age > st.lifespan * (c.faction === 'wild' ? 1 : 3) && Math.random() < dt * 0.01) this.kill(c, null);
  }
}

const _s = new THREE.Sphere();
function sphere(c: Creature) { _s.center.set(c.x, c.y + c.size * 0.4, c.z); _s.radius = c.size + 1; return _s; }
