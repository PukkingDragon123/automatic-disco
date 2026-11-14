// Faction units. Every faction unit is a real RobotUnit from src/robots (`spawnRobot(game, kind, faction, x, z)`,
// CONTRACT.md): registered in game.robots and ticked by tickRobots; the factions only give it orders. If spawnRobot
// ever refuses a kind (or throws), a StubUnit stands in: a placeholder robot in faction livery that walks (A* over
// the region), picks hostile targets, shoots (rifle / machine gun tracers, cannon shells, rocket salvos) and blows
// up; expedition stand-ins wear the robots agent's `buildMilitaryHuman` field kit.
import * as THREE from 'three';
import type { Faction } from '../species';
import { unitModel, type UModel } from './models';
import { kitMesh, bodyMat, type V3 } from './livery';
import type { FactionId } from './plan';
import type { Factions, Tgt } from './index';
import { sfx } from '../../audio/audio';
import { vfx2d } from '../vfx2d';
import { clamp } from '../../core/rand';
import { spawnRobot, type RobotKind } from '../../robots/unit';
import { buildMilitaryHuman } from '../../robots/humans';

export interface UOrder { k: 'move' | 'attack' | 'guard' | 'patrol' | 'work'; x?: number; z?: number; target?: any }
/** what both RobotUnit (src/robots) and StubUnit satisfy */
export interface Unit {
  readonly kind: string; faction: Faction; x: number; y: number; z: number; hp: number; maxHp: number; dead: boolean; mesh: THREE.Object3D;
  order(o: UOrder): void; update(dt: number): void; damage(n: number, from?: any): void; dispose(): void;
}

// ------------------------------------------------------------------------------------------------ robots bridge
const humanFn: ((variant: string, faction: string) => THREE.Object3D) | null = typeof buildMilitaryHuman === 'function' ? buildMilitaryHuman : null;
const refused = new Set<string>();

/** a faction unit: a RobotUnit when the robots system can make one, else a StubUnit */
export function spawnUnit(F: Factions, kind: string, faction: FactionId, x: number, z: number): Unit {
  const R = F.g.region;
  x = clamp(x, 3, R.N - 3); z = clamp(z, 3, R.N - 3);
  const free = R.freeNear(x, z, 6); if (free) [x, z] = free;
  if (typeof spawnRobot === 'function' && !refused.has(kind)) {
    try {
      const u = spawnRobot(F.g, kind as RobotKind, faction, x, z) as unknown as Unit;
      if (u && u.mesh) return u;
    } catch (e) { console.warn('[factions] spawnRobot refused', kind, e); }
    refused.add(kind);
  }
  const s = new StubUnit(F, kind, faction, x, z);
  F.stubs.push(s);
  return s;
}

// ------------------------------------------------------------------------------------------------ stand-in robots
type Weapon = 'rifle' | 'mg' | 'cannon' | 'rocket';
interface UStat { hp: number; speed: number; sight: number; range: number; dmg: number; rof: number; weapon: Weapon; splash?: number; r: number }
export const USTAT: Record<string, UStat> = {
  sov_drone: { hp: 32, speed: 3.6, sight: 14, range: 7, dmg: 2.4, rof: 0.32, weapon: 'mg', r: 0.4 },
  sov_trooper: { hp: 60, speed: 1.8, sight: 12, range: 8, dmg: 4, rof: 0.75, weapon: 'rifle', r: 0.45 },
  sov_tank: { hp: 210, speed: 1.55, sight: 14, range: 11, dmg: 20, rof: 2.6, weapon: 'cannon', splash: 1.6, r: 1.1 },
  sov_titan: { hp: 720, speed: 1.0, sight: 16, range: 13, dmg: 30, rof: 1.9, weapon: 'cannon', splash: 2.2, r: 1.5 },
  prc_scout: { hp: 36, speed: 4.3, sight: 15, range: 7, dmg: 2.4, rof: 0.3, weapon: 'mg', r: 0.6 },
  prc_trooper: { hp: 50, speed: 2.2, sight: 12, range: 8, dmg: 3.5, rof: 0.6, weapon: 'rifle', r: 0.4 },
  prc_mech: { hp: 240, speed: 1.7, sight: 15, range: 12, dmg: 13, rof: 2.3, weapon: 'rocket', splash: 1.8, r: 0.9 },
  expedition_soldier: { hp: 42, speed: 2.0, sight: 12, range: 9, dmg: 4, rof: 0.8, weapon: 'rifle', r: 0.35 },
  expedition_engineer: { hp: 34, speed: 2.0, sight: 10, range: 6, dmg: 2.5, rof: 1.0, weapon: 'rifle', r: 0.35 },
};
export const statOf = (kind: string): UStat => USTAT[kind] ?? USTAT.sov_trooper;

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class StubUnit implements Unit {
  x: number; y: number; z: number; hp: number; readonly maxHp: number; dead = false;
  readonly mesh = new THREE.Group();
  readonly st: UStat;
  /** radius (targeting, separation) */
  readonly radius: number;
  private top: THREE.Object3D; private base: THREE.Object3D | null = null;
  private M: UModel; private mat: THREE.MeshLambertMaterial;
  yaw = 0; private aim = 0;
  ord: UOrder | null = null;
  tgt: Tgt | null = null;
  private cd = Math.random(); private thinkT = Math.random() * 0.3; private flash = 0; private walk = Math.random() * 6;
  private path: number[] | null = null; private pi = 0; private repath = 0; private stuck = 0;
  deadT = 0; private home: [number, number];
  /** last thing that hurt it (brains read this to answer) */
  lastHit: { x: number; z: number; t: number } | null = null;
  /** set by the expedition while an engineer works a capture */
  busy = false;

  constructor(readonly F: Factions, readonly kind: string, public faction: Faction, x: number, z: number) {
    this.st = statOf(kind);
    this.x = x; this.z = z; this.home = [x, z];
    this.maxHp = this.hp = this.st.hp;
    this.radius = this.st.r;
    const f = faction as FactionId;
    this.M = unitModel(kind, f);
    this.mat = bodyMat();
    const human = kind.startsWith('expedition') && humanFn ? safeHuman(kind, f) : null;
    if (human) { this.top = human; this.mesh.add(human); }
    else {
      if (this.M.base) { this.base = kitMesh(this.M.base, f, '', this.mat); this.mesh.add(this.base); }
      this.top = kitMesh(this.M.top, f, '', this.mat); this.top.position.y = this.M.topY; this.mesh.add(this.top);
    }
    this.y = F.g.world.surfaceY(x, z);
    this.yaw = Math.random() * Math.PI * 2; this.aim = this.yaw;
    this.mesh.position.set(x, this.y + this.M.hover, z);
    F.g.world.scene.add(this.mesh);
  }
  get height() { return this.M.height; }
  get human() { return this.kind.startsWith('expedition'); }
  get hover() { return this.M.hover; }
  order(o: UOrder) {
    this.ord = o; this.path = null; this.repath = 0;
    if (o.target && o.k === 'attack' && this.F.alive(o.target)) this.tgt = this.F.asTgt(o.target);
    if (o.k === 'guard' && o.x !== undefined) this.home = [o.x, o.z!];
  }
  damage(n: number, from?: any) {
    if (this.dead || n <= 0) return;
    this.hp -= n; this.flash = 1;
    const fx = from?.x ?? this.x, fz = from?.z ?? this.z;
    this.lastHit = { x: fx, z: fz, t: this.F.t };
    if (from && this.F.alive(from) && (!this.tgt || !this.inRange(this.tgt))) { const t = this.F.asTgt(from); if (t && this.F.hostile(this.faction, t.f)) this.tgt = t; }
    if (this.hp <= 0) this.die();
  }
  private die() {
    this.dead = true; this.hp = 0;
    const big = this.st.hp > 150;
    if (this.human) {
      // a person goes down: no fireball, just dust (they are carried off later)
      vfx2d.play('dust', this.x, this.y + 0.1, this.z, { scale: 0.6 });
      this.mat.emissive.setHex(0);
    } else {
      this.F.boom.explode(this.x, this.y + this.M.height * 0.5, this.z, big ? 1.6 : 0.8, this.faction as FactionId);
      this.F.boom.debris(this.x, this.y + this.M.height * 0.5, this.z, big ? 7 : 3, this.faction as FactionId, big ? 0.35 : 0.18);
      this.mat.color.setHex(0x4a4642); this.mat.emissive.setHex(0);
    }
    this.F.onUnitDeath(this);
  }
  dispose() { this.mesh.removeFromParent(); this.mat.dispose(); }

  private inRange(t: Tgt) { return Math.hypot(t.x - this.x, t.z - this.z) - t.r <= this.st.range; }

  update(dt: number) {
    const F = this.F, w = F.g.world;
    if (this.dead) {
      this.deadT += dt;
      if (this.human) { this.mesh.rotation.x = -Math.min(1.45, this.deadT * 4); if (this.deadT > 6) this.mesh.position.y -= dt * 0.3; return; }
      // the wreck slumps, smoulders and sinks away
      this.mesh.rotation.z = Math.min(0.5, this.deadT * 1.5) * (this.kind.length % 2 ? 1 : -1);
      if (this.top && this.deadT < 0.6) this.top.position.y += dt * 2;
      if (this.deadT > 5) this.mesh.position.y -= dt * 0.4;
      if (Math.random() < dt * 3 && this.deadT < 6) F.boom.smoke(this.x, this.y + 0.5, this.z, 0.6);
      return;
    }
    this.cd -= dt; this.thinkT -= dt;
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 5); this.mat.emissive.setRGB(this.flash * 0.6, this.flash * 0.2, this.flash * 0.1); }
    if (this.thinkT <= 0) { this.thinkT = 0.3 + Math.random() * 0.15; this.think(); }
    // shoot
    const t = this.tgt;
    let firing = false;
    if (t) {
      const dx = t.x - this.x, dz = t.z - this.z, d = Math.hypot(dx, dz) - t.r;
      if (d <= this.st.range && !this.busy) {
        firing = true;
        const want = Math.atan2(dx, dz);
        this.aim = turn(this.aim, want, dt * 5);
        if (this.cd <= 0 && Math.abs(wrap(want - this.aim)) < 0.35) { this.fire(t); this.cd = this.st.rof * (0.85 + Math.random() * 0.3); }
      }
    }
    // move
    let gx = this.x, gz = this.z, move = false, run = 1;
    const o = this.ord;
    if (this.busy) move = false;
    else if (t && !firing && o?.k !== 'move' && this.leashOk(t.x, t.z)) { gx = t.x; gz = t.z; move = true; }
    else if (!firing || o?.k === 'move') {
      if (o && o.x !== undefined && (o.k === 'move' || o.k === 'attack' || o.k === 'work' || o.k === 'patrol')) {
        if (Math.hypot(o.x - this.x, o.z! - this.z) > (o.k === 'work' ? 1.2 : 1.8)) { gx = o.x; gz = o.z!; move = true; }
        else if (o.k === 'patrol') { const hx = this.home[0], hz = this.home[1]; this.home = [o.x, o.z!]; this.ord = { k: 'patrol', x: hx, z: hz }; this.path = null; }
        else if (o.k === 'move' || o.k === 'attack') { this.home = [o.x, o.z!]; this.ord = { k: 'guard', x: o.x, z: o.z }; }
      } else if (Math.hypot(this.home[0] - this.x, this.home[1] - this.z) > 3) { gx = this.home[0]; gz = this.home[1]; move = true; run = 0.7; }
    }
    if (firing && o?.k !== 'move') move = false;
    if (move) this.walkTo(gx, gz, dt, run);
    // pose
    const R = F.g.region;
    this.y = w.surfaceY(clamp(this.x, 0, R.N - 0.01), clamp(this.z, 0, R.N - 0.01));
    const bob = this.M.legs && move ? Math.abs(Math.sin(this.walk * 2)) * 0.06 * Math.min(1.5, this.M.height) : 0;
    const hov = this.M.hover ? this.M.hover + Math.sin(F.t * 2 + this.x) * 0.12 : 0;
    this.mesh.position.set(this.x, this.y + bob + hov, this.z);
    if (this.base) this.base.rotation.y = this.yaw;
    if (this.base && this.M.legs) this.base.rotation.x = move ? Math.sin(this.walk * 2) * 0.05 : 0;
    this.top.rotation.y = firing || !this.base ? this.aim : (this.aim = turn(this.aim, this.yaw, dt * 4));
    if (!this.base) this.top.rotation.z = Math.sin(F.t * 1.3 + this.z) * 0.1;
    this.mesh.visible = F.visible(this.x, this.z);
  }
  private leashOk(tx: number, tz: number) {
    const o = this.ord;
    if (!o || o.k === 'attack' || o.k === 'work') return true;
    if (o.k === 'guard' || o.k === 'patrol') return Math.hypot(tx - this.home[0], tz - this.home[1]) < 14;
    return false;
  }
  private walkTo(gx: number, gz: number, dt: number, run: number) {
    const F = this.F, R = F.g.region;
    const far = Math.hypot(gx - this.x, gz - this.z);
    // A* for long legs (re-planned now and then), straight steering for short ones
    this.repath -= dt;
    if (far > 6 && (!this.path || this.repath <= 0)) {
      this.repath = 4 + Math.random() * 2;
      this.path = this.M.hover ? [gx, gz] : F.g.world.pather.find(this.x, this.z, gx, gz, { step: this.st.r > 1 ? 1.6 : 1.3, swim: false, fly: false }, 6000) ?? [gx, gz];
      this.pi = 0;
    }
    let tx = gx, tz = gz;
    if (far > 6 && this.path) {
      while (this.pi < this.path.length - 2 && Math.hypot(this.path[this.pi] - this.x, this.path[this.pi + 1] - this.z) < 1.2) this.pi += 2;
      tx = this.path[this.pi]; tz = this.path[this.pi + 1];
    }
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz) || 1;
    let vx = (dx / d) * this.st.speed * run, vz = (dz / d) * this.st.speed * run;
    // keep apart from friends
    for (const u of F.stubs) {
      if (u === this || u.dead) continue;
      const ox = this.x - u.x, oz = this.z - u.z, od = Math.hypot(ox, oz), min = this.radius + u.radius + 0.2;
      if (od < min && od > 1e-3) { vx += (ox / od) * (min - od) * 4; vz += (oz / od) * (min - od) * 4; }
    }
    const nx = clamp(this.x + vx * dt, 2, R.N - 2), nz = clamp(this.z + vz * dt, 2, R.N - 2);
    if (this.M.hover || (!R.isSolid(nx, nz) && !R.isWater(nx, nz))) { this.x = nx; this.z = nz; this.stuck = 0; }
    else { this.stuck += dt; if (this.stuck > 0.5) { this.path = null; this.repath = 0; const s = R.freeNear(this.x + (Math.random() - 0.5) * 3, this.z + (Math.random() - 0.5) * 3, 4); if (s) { this.x = s[0]; this.z = s[1]; } } }
    this.walk += dt * this.st.speed * 2.2;
    this.yaw = turn(this.yaw, Math.atan2(vx, vz), dt * 4);
  }
  private think() {
    const F = this.F;
    if (this.tgt && (!F.alive(this.tgt.ref) || !F.hostile(this.faction, this.tgt.f))) this.tgt = null;
    if (this.tgt) { this.tgt.x = F.tx(this.tgt.ref); this.tgt.z = F.tz(this.tgt.ref); }
    const o = this.ord;
    // the ordered target takes precedence when it is near enough
    if (o?.k === 'attack' && o.target && F.alive(o.target)) {
      const ot = F.asTgt(o.target);
      if (ot && Math.hypot(ot.x - this.x, ot.z - this.z) < this.st.sight * 1.6 && (!this.tgt || !this.inRange(this.tgt))) { this.tgt = ot; return; }
    }
    if (this.tgt && this.inRange(this.tgt)) return;
    // an expedition wants your buildings whole: its rifles are for machines, creatures and Unit 07
    const near = F.nearestHostile(this.x, this.z, this.st.sight, this.faction, { noBuildings: this.human });
    if (near) this.tgt = near;
    else if (this.tgt && Math.hypot(this.tgt.x - this.x, this.tgt.z - this.z) > this.st.sight * 1.5) this.tgt = null;
  }
  private muzzle(out: THREE.Vector3) {
    this.mesh.updateMatrixWorld(true);
    const m = this.M.muzzle as V3;
    return this.top.localToWorld(out.set(m[0], m[1], m[2]));
  }
  private fire(t: Tgt) {
    const F = this.F, mz = this.muzzle(_v), st = this.st;
    const ty = F.ty(t.ref);
    const aud = F.g.audible(this.x, this.z);
    if (st.weapon === 'rifle' || st.weapon === 'mg') {
      const burst = st.weapon === 'mg' ? 3 : 1;
      for (let i = 0; i < burst; i++) {
        const hit = Math.random() < (st.weapon === 'mg' ? 0.55 : 0.75);
        const ex = t.x + (hit ? 0 : (Math.random() - 0.5) * 2.5), ez = t.z + (hit ? 0 : (Math.random() - 0.5) * 2.5);
        const ey = hit ? ty : F.g.world.surfaceY(clamp(ex, 0, F.g.region.N - 1), clamp(ez, 0, F.g.region.N - 1));
        F.tracer(mz.x, mz.y, mz.z, ex, ey, ez, this.faction as FactionId, i * 0.06);
        if (hit) F.hit(t.ref, st.dmg, this);
        else if (Math.random() < 0.5) vfx2d.play('dust', ex, ey + 0.05, ez, { scale: 0.35 });
      }
      F.flashAt(mz.x, mz.y, mz.z, 0.6);
      if (this.mesh.visible) sfx('crack', st.weapon === 'mg' ? 3.4 : 2.6, aud * 0.22);
    } else {
      const n = st.weapon === 'rocket' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        _w.set(t.x + (Math.random() - 0.5) * 0.8, ty, t.z + (Math.random() - 0.5) * 0.8);
        F.shells.fire(st.weapon === 'rocket' ? 'rocket' : 'shell', mz.x + i * 0.15, mz.y, mz.z, _w.x, _w.y, _w.z, st.dmg, st.splash ?? 1, this.faction as FactionId, this, i * 0.18);
      }
      F.flashAt(mz.x, mz.y, mz.z, 1.2);
      vfx2d.play('smoke', mz.x, mz.y, mz.z, { scale: 0.5, vel: [0, 0.6, 0] });
      if (this.mesh.visible) { sfx('crack', st.weapon === 'rocket' ? 1.8 : 1.1, aud * 0.4); if (st.weapon === 'cannon') sfx('hit', 0.5, aud * 0.3); }
    }
  }
}

function safeHuman(kind: string, f: FactionId): THREE.Object3D | null {
  try { return humanFn!(kind.replace('expedition_', ''), f) ?? null; } catch (e) { console.warn('[factions] buildMilitaryHuman failed', e); return null; }
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function turn(a: number, b: number, k: number) { const d = wrap(b - a); return a + clamp(d, -k, k); }
