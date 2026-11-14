// A faction structure: it is raised (or lands from the sky), works (mining rigs turn, stacks smoke, turrets track
// and fire), takes damage (it smokes, then burns), and is destroyed in a fireball that throws its plates about and
// leaves a burning wreck. Any of these is a target: { x, z, hp, maxHp, radius, faction, kind, dead, damage(n, from) }.
import * as THREE from 'three';
import type { Faction } from '../species';
import type { Factions, Tgt } from './index';
import type { FactionId } from './plan';
import { structureModel, type SKind, type SModel } from './models';
import { kitMesh, bodyMat } from './livery';
import { vfx2d } from '../vfx2d';
import { sfx } from '../../audio/audio';

interface SWeapon { k: 'mg' | 'arty'; range: number; min?: number; dmg: number; rof: number; splash?: number }
export interface SDef { hp: number; r: number; build: number; cost: number; sight: number; weapon?: SWeapon }
export const SDEF: Record<SKind, SDef> = {
  lander: { hp: 1300, r: 3.0, build: 1, cost: 0, sight: 16, weapon: { k: 'mg', range: 10, dmg: 3, rof: 0.6 } },
  miner: { hp: 190, r: 1.6, build: 18, cost: 60, sight: 8 },
  factory: { hp: 560, r: 2.7, build: 40, cost: 160, sight: 10 },
  bunker: { hp: 420, r: 1.6, build: 28, cost: 110, sight: 14, weapon: { k: 'mg', range: 12.5, dmg: 4.5, rof: 0.45 } },
  artillery: { hp: 260, r: 1.9, build: 34, cost: 180, sight: 12, weapon: { k: 'arty', range: 32, min: 7, dmg: 26, rof: 7, splash: 3 } },
  tower: { hp: 240, r: 1.0, build: 22, cost: 85, sight: 18, weapon: { k: 'mg', range: 13, dmg: 3.5, rof: 0.35 } },
  mast: { hp: 140, r: 0.9, build: 14, cost: 50, sight: 10 },
  depot: { hp: 200, r: 1.7, build: 18, cost: 70, sight: 8 },
  tent: { hp: 90, r: 1.4, build: 6, cost: 0, sight: 9 },
};
const LANDER_HP: Record<FactionId, number> = { soviet: 1300, prc: 1000, expedition: 420 };
const LANDER_R: Record<FactionId, number> = { soviet: 3.1, prc: 2.5, expedition: 1.8 };

export interface SOwner { onStructureLost(s: FStructure, by: any): void; onStructureHit?(s: FStructure, from: any): void }
let NEXT = 1;
const _v = new THREE.Vector3(), _c = new THREE.Color();

export class FStructure {
  readonly id = NEXT++;
  readonly def: SDef;
  readonly faction: Faction;
  y: number; hp: number; readonly maxHp: number; readonly radius: number; readonly height: number;
  dead = false;
  /** construction 0..1 */
  built = 0;
  /** deposit index a mining rig works */
  deposit = -1;
  readonly mesh = new THREE.Group();
  private mat = bodyMat();
  private turn: THREE.Object3D | null = null;
  private M: SModel;
  private cd = Math.random() * 2; private thinkT = Math.random(); private flash = 0; private smokeT = Math.random() * 2;
  tgt: Tgt | null = null;
  lastHit: { x: number; z: number; t: number; by: any } | null = null;
  private wreckT = -1;
  /** seconds of descent left (landers fall from orbit) */
  dropT = 0; private dropMax = 0;
  /** engineers can not capture these; the expedition's own flag */
  removed = false;

  constructor(readonly F: Factions, readonly owner: SOwner, readonly fid: FactionId, readonly kind: SKind, public x: number, public z: number, o: { instant?: boolean; yaw?: number; name?: string; drop?: number } = {}) {
    this.faction = fid;
    this.def = SDEF[kind];
    this.M = structureModel(fid, kind, o.name ?? '');
    this.maxHp = kind === 'lander' ? LANDER_HP[fid] : this.def.hp;
    this.radius = kind === 'lander' ? LANDER_R[fid] : this.def.r;
    this.height = this.M.height;
    this.built = o.instant || kind === 'lander' ? 1 : 0;
    this.hp = this.built >= 1 ? this.maxHp : this.maxHp * 0.25;
    const R = F.g.region;
    // sit on the lowest corner of the footprint so nothing floats
    let lo = 1e9;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) lo = Math.min(lo, R.heightAt(x + dx * this.radius * 0.7, z + dz * this.radius * 0.7));
    this.y = Math.max(lo - 0.05, R.water);
    const main = kitMesh(this.M.main, fid, o.name ?? '', this.mat);
    this.mesh.add(main);
    if (this.M.turn) {
      this.turn = kitMesh(this.M.turn, fid, o.name ?? '', this.mat);
      const p = this.M.turnAt!; this.turn.position.set(p[0], p[1], p[2]);
      main.add(this.turn);
    }
    this.mesh.position.set(x, this.y, z);
    this.mesh.rotation.y = o.yaw ?? 0;
    if (!this.built) this.mesh.scale.set(1, 0.08, 1);
    if (o.drop) { this.dropT = this.dropMax = o.drop; this.mesh.position.y = this.y + 80; }
    // clear the plants under it
    F.g.world.flora.near(x, z, this.radius + (kind === 'lander' ? 7 : 1.2), (i) => F.g.world.flora.remove(i));
    F.g.world.scene.add(this.mesh);
  }
  get ready() { return this.built >= 1 && !this.dead && this.dropT <= 0; }

  damage(n: number, from?: any) {
    if (this.dead || n <= 0 || this.dropT > 0) return;
    this.hp -= n * (this.built < 1 ? 1.4 : 1);
    this.flash = 1;
    this.lastHit = { x: from?.x ?? this.x, z: from?.z ?? this.z, t: this.F.t, by: from };
    this.owner.onStructureHit?.(this, from);
    if (this.hp <= 0) this.destroy(from);
  }
  /** demolish without an attacker (self-destruct when its programme is beaten) */
  destroy(by?: any) {
    if (this.dead) return;
    this.dead = true; this.hp = 0;
    const F = this.F, big = this.radius;
    const cy = this.y + this.height * 0.4;
    F.boom.explode(this.x, cy, this.z, this.kind === 'depot' ? 3 : 0.8 + big * 0.55, this.fid);
    F.boom.explode(this.x + (Math.random() - 0.5) * big, cy + this.height * 0.3, this.z + (Math.random() - 0.5) * big, 0.8 + big * 0.3, this.fid);
    F.boom.debris(this.x, cy, this.z, Math.round(4 + big * 3), this.fid, 0.3 + big * 0.12);
    F.boom.fire(this.x, this.y + 0.3, this.z, Math.min(2.2, big * 0.7), 22 + big * 4, 1);
    vfx2d.play('shock', this.x, this.y + 0.1, this.z, { flat: true, scale: 1 + big * 0.5 });
    if (this.kind === 'depot') F.eachHostileIn(this.x, this.z, 4.5, 'wild', (ref, d) => F.hit(ref, 60 * (1 - d / 4.5), null), true);
    F.g.cam.shake(Math.min(0.9, 0.2 + big * 0.15) * F.g.audible(this.x, this.z), 0.6);
    sfx('crack', 0.5, F.g.audible(this.x, this.z)); sfx('hit', 0.35, F.g.audible(this.x, this.z) * 0.8);
    // what is left: charred, slumped, lamps out
    this.mat.color.setHex(0x3c3836); this.mat.emissive.setHex(0);
    this.mesh.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== this.mat && !(o as any).material?.map) o.visible = false; });
    this.wreckT = 0;
    this.owner.onStructureLost(this, by);
  }

  update(dt: number) {
    const F = this.F;
    this.mesh.visible = F.seen(this.x, this.z);
    if (this.wreckT >= 0) {
      this.wreckT += dt;
      const k = Math.min(1, this.wreckT / 1.6);
      this.mesh.rotation.z = k * 0.12 * (this.id % 2 ? 1 : -1); this.mesh.rotation.x = k * 0.06;
      this.mesh.scale.y = 1 - k * 0.35;
      this.mesh.position.y = this.y - k * 0.2 - Math.max(0, this.wreckT - 40) * 0.08;
      if (this.wreckT > 55) { this.mesh.removeFromParent(); this.removed = true; }
      return;
    }
    if (this.dropT > 0) { this.descend(dt); return; }
    if (this.flash > 0) { this.flash = Math.max(0, this.flash - dt * 4); this.mat.emissive.setRGB(this.flash * 0.5, this.flash * 0.16, this.flash * 0.08); }
    // construction: the frame rises, welding sparks
    if (this.built < 1) {
      this.built = Math.min(1, this.built + dt / this.def.build);
      this.hp = Math.min(this.maxHp, this.hp + (this.maxHp * 0.75 / this.def.build) * dt);
      this.mesh.scale.y = 0.08 + 0.92 * this.built;
      if (this.mesh.visible && Math.random() < dt * 5) {
        const a = Math.random() * Math.PI * 2, r = this.radius * (0.4 + Math.random() * 0.6);
        F.g.fx.spray(this.x + Math.cos(a) * r, this.y + this.height * this.built * Math.random(), this.z + Math.sin(a) * r, 0, 1, 0, 6, 0xffd890, { glow: true, speed: 2.5, cone: 0.9, size: 1.6, life: 0.3, grav: 9 });
      }
      if (this.built >= 1) { F.g.fx.burst(this.x, this.y + 0.3, this.z, 16, 0x8a7a65, { speed: 2, up: 1, size: 5, life: 1 }); this.hp = Math.max(this.hp, this.maxHp * 0.9); }
      return;
    }
    // work
    const vis = this.mesh.visible;
    if (this.kind === 'miner' && this.turn) { const live = this.deposit >= 0 && (F.g.region.deposits[this.deposit]?.amount ?? 0) > 0; if (live) this.turn.rotation.z += dt * (this.fid === 'prc' ? -2.2 : 1.6); }
    if (vis && this.M.stacks) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smokeT = 1.2 + Math.random(); for (const s of this.M.stacks) { _v.set(s[0], s[1], s[2]).applyEuler(this.mesh.rotation); vfx2d.play('smoke', this.x + _v.x, this.y + _v.y, this.z + _v.z, { scale: 0.7, vel: [0.3, 1.0, 0.1], speed: 0.6, tint: 0x9a9690 }); } }
    }
    // damage states
    const f = this.hp / this.maxHp;
    if (vis && f < 0.5 && Math.random() < dt * (f < 0.25 ? 3 : 1.2)) F.boom.smoke(this.x + (Math.random() - 0.5) * this.radius, this.y + this.height * 0.6, this.z + (Math.random() - 0.5) * this.radius, 0.6);
    if (vis && f < 0.25 && Math.random() < dt * 10) { _c.setHex(0xff8a40).multiplyScalar(1.8); F.g.fx.glow.emit(this.x + (Math.random() - 0.5) * this.radius, this.y + this.height * (0.3 + Math.random() * 0.4), this.z + (Math.random() - 0.5) * this.radius, 0, 1.5, 0, _c, 1, 4, 0.4, -1, 1); }
    this.weapon(dt);
  }

  private descend(dt: number) {
    const F = this.F;
    this.dropT = Math.max(0, this.dropT - dt);
    const k = this.dropT / this.dropMax;
    const h = 80 * k * k;
    this.mesh.position.y = this.y + h;
    this.mesh.visible = true;
    // retro rockets: a bright cone of exhaust and dust as it nears the ground
    const fx = F.g.fx;
    _c.setHex(0xffc070).multiplyScalar(2.2);
    for (let i = 0; i < 4; i++) fx.glow.emit(this.x + (Math.random() - 0.5) * 0.6, this.y + h + 0.6, this.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2, -10 - Math.random() * 6, (Math.random() - 0.5) * 2, _c, 1, 6, 0.25, 0, 0.5);
    if (h < 14 && Math.random() < dt * 20) fx.burst(this.x + (Math.random() - 0.5) * 6, this.y + 0.2, this.z + (Math.random() - 0.5) * 6, 4, 0x8a7a65, { speed: 6, up: 0.8, size: 7, life: 1.2, grav: 1 });
    if (this.dropT <= 0) {
      this.mesh.position.y = this.y;
      F.boom.explode(this.x, this.y + 0.3, this.z, 1.2, this.fid);
      fx.burst(this.x, this.y + 0.3, this.z, 60, 0x8a7a65, { speed: 9, up: 2, size: 8, life: 1.6, grav: 3 });
      vfx2d.play('shock', this.x, this.y + 0.1, this.z, { flat: true, scale: 2.4 });
      F.g.cam.shake(0.8 * F.g.audible(this.x, this.z) + 0.15, 0.9);
      F.g.world.flora.impulse?.(this.x, this.z, 9, 2.5);
      sfx('crack', 0.6, 0.8); sfx('pulse', 0.4, 0.6);
    }
  }

  private weapon(dt: number) {
    const W = this.def.weapon, F = this.F;
    if (!W) return;
    this.cd -= dt; this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.5;
      if (this.tgt && (!F.alive(this.tgt.ref) || Math.hypot(F.tx(this.tgt.ref) - this.x, F.tz(this.tgt.ref) - this.z) > W.range + 1)) this.tgt = null;
      if (!this.tgt) this.tgt = F.nearestHostile(this.x, this.z, W.range, this.faction, { min: W.min, structures: W.k === 'arty' });
      if (this.tgt) { this.tgt.x = F.tx(this.tgt.ref); this.tgt.z = F.tz(this.tgt.ref); }
    }
    const t = this.tgt; if (!t) return;
    const want = Math.atan2(t.x - this.x, t.z - this.z) - this.mesh.rotation.y;
    if (this.turn && this.M.turnAxis === 'y') { const d = Math.atan2(Math.sin(want - this.turn.rotation.y), Math.cos(want - this.turn.rotation.y)); this.turn.rotation.y += Math.max(-dt * 2.5, Math.min(dt * 2.5, d)); if (Math.abs(d) > 0.2) return; }
    if (this.cd > 0) return;
    this.cd = W.rof * (0.85 + Math.random() * 0.3);
    const m = this.M.muzzle ?? [0, this.height * 0.45, 0];
    _v.set(m[0], m[1], m[2]);
    this.mesh.updateMatrixWorld(true);
    (this.turn ?? this.mesh.children[0]).localToWorld(_v);
    const ty = F.ty(t.ref);
    if (W.k === 'arty') {
      F.shells.fire('arty', _v.x, _v.y, _v.z, t.x + (Math.random() - 0.5) * 2.4, ty, t.z + (Math.random() - 0.5) * 2.4, W.dmg, W.splash ?? 2.5, this.fid, this, 0);
      F.flashAt(_v.x, _v.y, _v.z, 2);
      vfx2d.play('smoke', _v.x, _v.y, _v.z, { scale: 1.2, vel: [0, 0.8, 0] });
      sfx('hit', 0.3, F.g.audible(this.x, this.z) * 0.8); sfx('crack', 0.7, F.g.audible(this.x, this.z) * 0.6);
      F.artyFired(this, t);
      return;
    }
    const hit = Math.random() < 0.7;
    const ex = t.x + (hit ? 0 : (Math.random() - 0.5) * 2), ez = t.z + (hit ? 0 : (Math.random() - 0.5) * 2);
    for (let i = 0; i < 3; i++) F.tracer(_v.x, _v.y, _v.z, ex, hit ? ty : F.g.world.surfaceY(ex, ez), ez, this.fid, i * 0.07);
    if (hit) F.hit(t.ref, W.dmg, this);
    F.flashAt(_v.x, _v.y, _v.z, 0.7);
    if (this.mesh.visible) sfx('crack', 3.2, F.g.audible(this.x, this.z) * 0.25);
  }
  dispose() { this.mesh.removeFromParent(); this.mat.dispose(); }
}
