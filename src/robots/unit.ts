// RobotUnit (CONTRACT.md): a robot, a soldier or a rover of any faction. It thinks a few times a second (orders,
// target choice among enemy robots, creatures, the golem and factory buildings), walks the region's A* paths
// (world.pather) with separation from its neighbours, aims its turret and gun, fires tracers, shells, mortar bombs,
// rockets or a claw, and dies in pieces: the debris groups break off and tumble, sparks, smoke, a scorched hull that
// smoulders and sinks. Legs step with two-bone IK and knee cylinders, tracks roll and scroll, wheels turn, rotors
// spin. game.robots holds them; tickRobots(game, dt) runs them and their shots.
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Faction } from '../game/species';
import type { Creature } from '../game/creature';
import type { Fx } from '../game/fx';
import { vfx2d } from '../game/vfx2d';
import { RAMPS } from '../art/palette';
import { gbuf } from '../gfx/gbuf';
import { buildModel, HUMAN_KINDS, ROBOT_KINDS, type RobotKind, type UnitModel } from './models';
import { militaryHuman as militaryHumanRaw, type CrewVariant, type MilitaryHuman } from './humans';
import { aimPistons } from './kit';
import { liveryFor } from './atlas';
import { clamp, damp } from '../core/rand';

export type { RobotKind } from './models';
export { ROBOT_KINDS } from './models';
export interface RobotOrder { k: 'move' | 'attack' | 'guard' | 'patrol' | 'work'; x?: number; z?: number; target?: any }

// ------------------------------------------------------------------------------------------------ stats
/** what a hit does besides damage: burning, venom, acid (eats armour), slowing, pulling in, piercing, fragments, knockback */
export interface WFx { burn?: number; poison?: number; acid?: number; slow?: number; pull?: number; pierce?: number; frag?: number; knock?: number }
export type ShotKind = 'bullet' | 'shell' | 'mortar' | 'rocket' | 'melee' | 'flame' | 'beam' | 'cloud';
export interface Weapon {
  /** reach, seconds between shots, damage per hit, what it fires, its speed, spread (rad), shots per burst, splash radius */
  range: number; cd: number; dmg: number; shot: ShotKind; speed: number; spread: number; burst?: number; splash?: number;
  /** effects on hit; the tracer / flame / cloud ramp colour */
  fx?: WFx; col?: number;
}
/** anything that can fire through the shot system (a RobotUnit, the golem's mount, a test stand) */
export interface Shooter { faction: Faction; x: number; z: number; dead?: boolean }
export interface RobotStats { hp: number; speed: number; turn: number; sight: number; armor: number; weapon: Weapon; melee?: Weapon; fly?: boolean; step?: number; scale?: number; name: string }
const W = (range: number, cd: number, dmg: number, shot: Weapon['shot'], speed: number, spread: number, o: Partial<Weapon> = {}): Weapon => ({ range, cd, dmg, shot, speed, spread, ...o });
export const STATS: Record<RobotKind, RobotStats> = {
  scout: { name: 'Scout walker', hp: 40, speed: 3.6, turn: 6, sight: 14, armor: 0.05, weapon: W(7, 0.18, 2.2, 'bullet', 28, 0.05, { burst: 3 }) },
  worker: { name: 'Tracked loader', hp: 90, speed: 2.0, turn: 2.5, sight: 9, armor: 0.2, weapon: W(1.3, 1.2, 9, 'melee', 0, 0) },
  trooper: { name: 'Rifle trooper', hp: 70, speed: 2.1, turn: 4, sight: 12, armor: 0.15, weapon: W(9, 0.7, 5, 'bullet', 30, 0.03) },
  heavy: { name: 'Tank-bot', hp: 260, speed: 1.6, turn: 1.6, sight: 14, armor: 0.35, weapon: W(12, 2.4, 22, 'shell', 22, 0.02, { splash: 1.5 }) },
  artillery: { name: 'Mortar walker', hp: 90, speed: 1.4, turn: 2, sight: 18, armor: 0.1, weapon: W(18, 3.4, 26, 'mortar', 11, 0.06, { splash: 2.2 }) },
  walker: { name: 'Quad walker', hp: 620, speed: 1.3, turn: 1.1, sight: 16, armor: 0.4, weapon: W(14, 1.5, 24, 'shell', 24, 0.02, { burst: 2, splash: 1.6 }) },
  sov_drone: { name: 'Rotor drone', hp: 34, speed: 3.6, turn: 4, sight: 14, armor: 0.05, weapon: W(7, 0.3, 2.4, 'bullet', 26, 0.06, { burst: 3 }), fly: true },
  sov_trooper: { name: 'Infantry machine', hp: 80, speed: 1.8, turn: 3, sight: 12, armor: 0.2, weapon: W(8, 0.75, 4.5, 'bullet', 26, 0.05, { burst: 2 }), melee: W(1.2, 1.4, 12, 'melee', 0, 0) },
  sov_tank: { name: 'Battle tank', hp: 240, speed: 1.55, turn: 1.4, sight: 14, armor: 0.4, weapon: W(12, 2.6, 22, 'shell', 24, 0.02, { splash: 1.6 }) },
  sov_titan: { name: 'Titan', hp: 760, speed: 1.0, turn: 0.9, sight: 16, armor: 0.45, weapon: W(13, 1.9, 30, 'shell', 22, 0.03, { burst: 2, splash: 2.2 }) },
  prc_scout: { name: 'Three-wheel scout', hp: 38, speed: 4.4, turn: 3.2, sight: 15, armor: 0.05, weapon: W(7, 0.3, 2.4, 'bullet', 28, 0.05, { burst: 3 }) },
  prc_trooper: { name: 'Rifle machine', hp: 60, speed: 2.2, turn: 4, sight: 12, armor: 0.15, weapon: W(10, 0.65, 4.2, 'bullet', 32, 0.025) },
  prc_mech: { name: 'Hexapod', hp: 260, speed: 1.7, turn: 1.6, sight: 15, armor: 0.35, weapon: W(13, 2.3, 13, 'rocket', 14, 0.08, { burst: 3, splash: 1.8 }) },
  expedition_soldier: { name: 'Expedition trooper', hp: 42, speed: 2.0, turn: 5, sight: 12, armor: 0.1, weapon: W(9, 0.8, 4, 'bullet', 30, 0.04) },
  expedition_heavy: { name: 'Power armour', hp: 110, speed: 1.6, turn: 4, sight: 12, armor: 0.3, weapon: W(10, 0.4, 4, 'bullet', 30, 0.05, { burst: 3 }) },
  expedition_engineer: { name: 'Expedition engineer', hp: 34, speed: 2.0, turn: 5, sight: 10, armor: 0.05, weapon: W(5, 0.2, 2.5, 'bullet', 16, 0.15) },
  expedition_officer: { name: 'Expedition officer', hp: 38, speed: 2.1, turn: 5, sight: 13, armor: 0.05, weapon: W(7, 0.9, 3.5, 'bullet', 30, 0.04) },
  expedition_crew: { name: 'Deck hand', hp: 24, speed: 2.2, turn: 5, sight: 9, armor: 0, weapon: W(1.0, 1.2, 2, 'melee', 0, 0) },
  expedition_rover: { name: 'Survey rover', hp: 120, speed: 2.6, turn: 2, sight: 15, armor: 0.25, weapon: W(8, 0.35, 2.6, 'bullet', 28, 0.05, { burst: 2 }) },
};
const HUMAN_VARIANT: Partial<Record<RobotKind, CrewVariant>> = { expedition_soldier: 'trooper', expedition_heavy: 'heavy', expedition_engineer: 'engineer', expedition_officer: 'officer', expedition_crew: 'crew' };
const HUMAN_SCALE = 0.6;

/** everyone fights everyone but their own; the wild only when provoked */
export function hostile(a: Faction, b: Faction) { return a !== b && a !== 'wild' && b !== 'wild'; }

// ------------------------------------------------------------------------------------------------ the host (a Game, or a test stage)
interface Host {
  world: { scene: THREE.Scene; surfaceY(x: number, z: number): number; pather?: { find(sx: number, sz: number, tx: number, tz: number, w: { step: number; swim: boolean; fly: boolean }, max?: number): number[] | null }; near?(x: number, z: number, r: number, fn: (c: Creature) => void): void; damage?(c: Creature, n: number, by: Creature | null): void; time?: number };
  region?: { N: number; isSolid(x: number, z: number): boolean; isWater?(x: number, z: number): boolean };
  fx: Fx; robots?: RobotUnit[];
  player?: { x: number; y: number; z: number; alive: boolean; started?: boolean; radius: number; height?: number; hurt(n: number, from: any): void };
  factory?: { buildings?: { x: number; z: number; hp: number; faction?: string; kind?: string; damage?(n: number, by?: any): void; dead?: boolean; radius?: number }[] };
  cam?: { shake(a: number, t: number): void };
}
/** something it can shoot at */
interface Tgt { kind: 'robot' | 'creature' | 'golem' | 'building' | 'point'; ref: any; }
const tPos = (t: Tgt, out: THREE.Vector3): THREE.Vector3 => {
  const r = t.ref;
  if (t.kind === 'robot') return out.set(r.x, r.y + r.height * 0.5, r.z);
  if (t.kind === 'creature') return out.set(r.x, r.y + r.size * 0.45 + (r.air ?? 0), r.z);
  if (t.kind === 'golem') return out.set(r.x, r.y + (r.height ?? 0.5) * 0.6, r.z);
  return out.set(r.x, (r.y ?? 0) + 0.6, r.z);
};
const tAlive = (t: Tgt) => {
  const r = t.ref; if (!r) return false;
  if (t.kind === 'robot') return !r.dead;
  if (t.kind === 'creature') return !r.dead;
  if (t.kind === 'golem') return !!r.alive && r.started !== false;
  if (t.kind === 'building') return !r.dead && (r.hp ?? 1) > 0;
  return true;
};
const tRad = (t: Tgt) => { const r = t.ref; return t.kind === 'robot' ? r.radius : t.kind === 'creature' ? r.radius ?? 0.4 : t.kind === 'golem' ? r.radius : r.radius ?? r.r ?? 1; };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3();
let SEQ = 1;

// ================================================================================================ the unit
export class RobotUnit {
  readonly id = SEQ++;
  readonly kind: RobotKind;
  faction: Faction;
  x: number; y: number; z: number;
  hp: number; maxHp: number; dead = false;
  readonly mesh: THREE.Group;
  readonly st: RobotStats;
  /** its weapon (the weapon workbench may swap it) */
  weapon: Weapon;
  yaw = Math.random() * Math.PI * 2;
  radius: number; height: number;
  /** compatible with what creature-facing code reads (player.hurt sets it) */
  aggro = 0;
  /** last thing that hurt it */
  lastHit: { x: number; z: number; t: number; by: any } | null = null;
  ord: RobotOrder | null = null;
  tgt: Tgt | null = null;
  removed = false;
  readonly model: UnitModel | null; readonly human: MilitaryHuman | null;
  private g: Host;
  private speedK = 0; private gait = Math.random() * 6; private aimYaw = 0; private aimPitch = 0;
  private cd = Math.random(); private burstN = 0; private burstT = 0; private thinkT = Math.random() * 0.4;
  private path: number[] | null = null; private pi = 0; private repathT = 0; private pathTo = new THREE.Vector3(1e9, 0, 0); private stuckT = 0;
  private recoilK = 0; private flashK = 0; private deadT = 0; private smokeT = 0; private patrolB: [number, number] | null = null; private home: [number, number];
  private meleeT = -1; private fireT = 0; private bob = Math.random() * 6;
  /** lingering effects: seconds of burning, venom, acid, slowing */
  status = { burn: 0, poison: 0, acid: 0, slow: 0, by: null as any };
  /** the weapon design it carries (weapons workbench), if any */
  design: unknown = null;
  /** show-room mode (tests, menus): it walks in place at this speed and fires at a point ahead every few seconds */
  demo: { speed?: number; fire?: boolean; t?: number } | null = null;
  constructor(game: Game, kind: RobotKind, faction: Faction, x: number, z: number) {
    if (!(ROBOT_KINDS as readonly string[]).includes(kind)) throw new Error('unknown robot kind ' + kind);
    this.g = game as unknown as Host;
    this.kind = kind; this.faction = faction;
    this.st = STATS[kind];
    this.weapon = { ...this.st.weapon };
    this.hp = this.maxHp = this.st.hp;
    this.x = x; this.z = z; this.home = [x, z];
    const liv = liveryFor(faction);
    if (HUMAN_KINDS.includes(kind)) {
      const h = militaryHumanRaw(HUMAN_VARIANT[kind] ?? 'trooper', liv, { seed: this.id * 977 });
      this.human = h; this.model = null;
      this.mesh = new THREE.Group(); this.mesh.add(h.rig.root); h.rig.root.scale.setScalar(HUMAN_SCALE);
      this.radius = 0.28; this.height = 1.05;
    } else {
      const m = buildModel(kind, liv);
      this.model = m; this.human = null;
      this.mesh = m.root;
      this.radius = m.r; this.height = m.h;
    }
    this.mesh.userData.robot = this;
    this.y = this.g.world.surfaceY(x, z);
    this.mesh.position.set(x, this.y, z);
    this.mesh.rotation.y = this.yaw; this.aimYaw = 0;
    this.g.world.scene.add(this.mesh);
  }
  get fly() { return !!this.st.fly; }
  /** carry a designed weapon: its numbers, and its hardware bolted on at the first muzzle (null: back to stock) */
  equip(w: Weapon | null, mesh: THREE.Object3D | null = null) {
    this.weapon = w ? { ...w } : { ...this.st.weapon };
    const m = this.model, old = this.mesh.getObjectByName('equipped');
    if (old) { old.removeFromParent(); if (m && old.userData.muzzles) m.muzzles.splice(0, m.muzzles.length, ...old.userData.muzzles); }
    if (!w || !mesh) return;
    const mz = m?.muzzles[0] ?? this.human?.muzzle;
    if (!mz?.parent) return;
    mesh.name = 'equipped';
    mesh.userData.muzzles = m ? [...m.muzzles] : null;
    mz.parent.add(mesh);
    mesh.position.copy(mz.position);
    if (this.human) mesh.rotation.set(0, Math.PI / 2, 0);
    const nm = mesh.getObjectByName('muzzle');
    if (m && nm) m.muzzles.splice(0, m.muzzles.length, nm);
    else if (this.human && nm) (this.human as { muzzle: THREE.Object3D | null }).muzzle = nm;
  }
  get alive() { return !this.dead; }

  // -------------------------------------------------------------------------------------------- orders and damage
  order(o: RobotOrder) {
    this.ord = { ...o };
    this.path = null; this.repathT = 0;
    if (o.k === 'attack' && o.target) this.tgt = this.asTgt(o.target);
    if (o.k === 'patrol') this.patrolB = [this.x, this.z];
    if (o.k === 'guard' && o.x === undefined) { this.ord.x = this.x; this.ord.z = this.z; }
  }
  damage(n: number, from?: any) {
    if (this.dead || n <= 0) return;
    const d = n * (1 - Math.max(0, this.st.armor - (this.status.acid > 0 ? 0.25 : 0)));
    this.hp -= d;
    this.flashK = 1;
    const f = from?.ref ?? from;
    if (f && typeof f.x === 'number') {
      this.lastHit = { x: f.x, z: f.z, t: this.g.world.time ?? 0, by: f };
      // answer the attacker if idle or only guarding
      if (!this.tgt || !tAlive(this.tgt)) { const t = this.asTgt(f); if (t && (t.kind !== 'robot' || hostile(this.faction, (f as RobotUnit).faction))) this.tgt = t; }
    }
    if (this.hp <= 0) this.die(f);
  }
  /** a target from anything: a RobotUnit, a Creature, the golem (player), a building, a faction Tgt {ref, x, z} */
  private asTgt(o: any): Tgt | null {
    if (!o) return null;
    if (o.ref && o.ref !== o) return this.asTgt(o.ref) ?? { kind: 'point', ref: o };
    if (o instanceof RobotUnit) return { kind: 'robot', ref: o };
    if (o.sp && o.st && typeof o.size === 'number') return { kind: 'creature', ref: o };
    if (typeof o.hurt === 'function' && 'alive' in o) return { kind: 'golem', ref: o };
    if (typeof o.damage === 'function' || typeof o.hp === 'number') return { kind: 'building', ref: o };
    if (typeof o.x === 'number') return { kind: 'point', ref: o };
    return null;
  }

  // -------------------------------------------------------------------------------------------- the tick
  update(dt: number) {
    if (this.removed) return;
    if (this.dead) { this.dying(dt); return; }
    if (dt <= 0) { this.animate(0, 0); return; }
    const S = this.status;
    if (S.burn > 0 || S.poison > 0 || S.acid > 0) {
      S.burn = Math.max(0, S.burn - dt); S.poison = Math.max(0, S.poison - dt); S.acid = Math.max(0, S.acid - dt);
      const d = (S.burn > 0 ? 3.5 : 0) + (S.poison > 0 ? 2.5 : 0) + (S.acid > 0 ? 1 : 0);
      this.hp -= d * dt; if (S.burn > 0 && Math.random() < dt * 10) this.g.fx.burst(this.x, this.y + this.height * 0.5, this.z, 1, RAMPS.glowAmber[3], { glow: true, speed: 0.4, up: 1.2, size: 2, life: 0.4, grav: -1 });
      if (S.poison > 0 && Math.random() < dt * 5) this.g.fx.burst(this.x, this.y + this.height * 0.6, this.z, 1, RAMPS.ichor[4], { speed: 0.3, up: 0.6, size: 1.8, life: 0.6, grav: -0.3 });
      if (this.hp <= 0) { this.die(S.by); return; }
    }
    S.slow = Math.max(0, S.slow - dt);
    if (S.slow > 0) dt *= 0.45;
    if (this.demo) {
      const D = this.demo;
      this.cd -= dt; this.burstT -= dt;
      if (D.fire) {
        D.t = (D.t ?? Math.random() * 3) - dt;
        const tp = _w.set(this.x + Math.sin(this.yaw) * 6, this.y + 0.5, this.z + Math.cos(this.yaw) * 6);
        this.aimPitch = damp(this.aimPitch, this.weapon.shot === 'mortar' ? 0.8 : 0.05, 4, dt);
        if (D.t <= 0) { D.t = 2.5 + Math.random() * 2; this.tgt = { kind: 'point', ref: tp.clone() }; this.fire(tp); }
        if (this.burstN > 0 && this.burstT <= 0) this.fire(tp, true);
      }
      this.place(dt); this.animate(dt, D.speed ?? 0); return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.35 + Math.random() * 0.2; this.think(); }
    // where to go
    let goal: [number, number] | null = null, stop = false;
    const tp = this.tgt && tAlive(this.tgt) ? tPos(this.tgt, _w) : null;
    const w = this.tgt?.kind === 'building' || !this.tgt ? this.weapon : this.weapon;
    const melee = w.shot === 'melee';
    if (tp) {
      const d = Math.hypot(tp.x - this.x, tp.z - this.z) - tRad(this.tgt!);
      const reach = melee ? w.range : w.range * 0.92;
      if (d > reach) goal = [tp.x, tp.z]; else stop = true;
    }
    if (!goal && !stop && this.ord) {
      const o = this.ord;
      if ((o.k === 'move' || o.k === 'guard' || o.k === 'work' || o.k === 'attack') && o.x !== undefined && o.z !== undefined) {
        if (Math.hypot(o.x - this.x, o.z - this.z) > (o.k === 'guard' ? 2 : 0.8)) goal = [o.x, o.z];
        else if (o.k === 'move') this.ord = { k: 'guard', x: o.x, z: o.z };
      } else if (o.k === 'patrol' && o.x !== undefined && o.z !== undefined) {
        const B = this.patrolB ?? this.home;
        const toA = Math.hypot(o.x - this.x, o.z - this.z);
        if (toA < 1) { this.ord = { k: 'patrol', x: B[0], z: B[1] }; this.patrolB = [o.x, o.z]; }
        goal = [o.x, o.z];
      }
    }
    // move along a path
    let sp = 0;
    if (goal) sp = this.steer(goal[0], goal[1], dt);
    else { this.path = null; }
    this.speedK = damp(this.speedK, sp, 6, dt);
    // aim and shoot
    let wantYaw = 0, wantPitch = 0;
    if (tp) {
      const ay = Math.atan2(tp.x - this.x, tp.z - this.z) - this.yaw;
      wantYaw = Math.atan2(Math.sin(ay), Math.cos(ay));
      const top = this.y + this.height * 0.6, dist = Math.hypot(tp.x - this.x, tp.z - this.z);
      wantPitch = this.weapon.shot === 'mortar' ? clamp(0.65 + dist * 0.025, 0.6, 1.1) : clamp(Math.atan2(tp.y - top, dist), -0.4, 0.6);
      // a hull without a turret turns to face its target when it stops
      if (stop && (!this.model?.turret || this.human)) this.turnTo(this.yaw + wantYaw, dt);
    }
    const hasTurret = !!this.model?.turret;
    this.aimYaw = damp(this.aimYaw, hasTurret ? clamp(wantYaw, -2.6, 2.6) : 0, 5, dt);
    this.aimPitch = damp(this.aimPitch, wantPitch, 5, dt);
    this.cd -= dt; this.burstT -= dt;
    if (tp && stop) {
      const aligned = Math.abs(wantYaw - (hasTurret ? this.aimYaw : 0)) < 0.25;
      if (aligned && this.cd <= 0) { this.fire(tp); }
      if (this.burstN > 0 && this.burstT <= 0) this.fire(tp, true);
    }
    this.place(dt);
    this.animate(dt, this.speedK);
  }
  /** pick a target and keep paths fresh */
  private think() {
    const g = this.g;
    if (this.tgt && !tAlive(this.tgt)) this.tgt = null;
    const forced = this.ord?.k === 'attack' && this.ord.target;
    if (forced && this.tgt) return;
    // keep a target in sight; else scan for the nearest enemy
    const sight = this.st.sight;
    if (this.tgt) { const p = tPos(this.tgt, _v); if (Math.hypot(p.x - this.x, p.z - this.z) < sight * 1.3) return; this.tgt = null; }
    if (this.ord?.k === 'move') return; // a move order goes through
    let best: Tgt | null = null, bd = sight;
    const consider = (t: Tgt, x: number, z: number) => { const d = Math.hypot(x - this.x, z - this.z) - tRad(t); if (d < bd) { bd = d; best = t; } };
    for (const r of g.robots ?? []) if (r !== this && !r.dead && hostile(this.faction, r.faction)) consider({ kind: 'robot', ref: r }, r.x, r.z);
    g.world.near?.(this.x, this.z, sight, (c) => { if (!c.dead && hostile(this.faction, c.faction)) consider({ kind: 'creature', ref: c }, c.x, c.z); });
    const P = g.player;
    if (P && P.alive && P.started !== false && hostile(this.faction, 'veyr')) consider({ kind: 'golem', ref: P }, P.x, P.z);
    const B = g.factory?.buildings;
    if (Array.isArray(B)) for (const b of B) if (!b.dead && (b.hp ?? 1) > 0 && hostile(this.faction, (b.faction ?? 'veyr') as Faction)) consider({ kind: 'building', ref: b }, b.x, b.z);
    this.tgt = best;
  }
  /** follow A* waypoints toward (gx, gz); returns the speed it moves at */
  private steer(gx: number, gz: number, dt: number) {
    const g = this.g;
    this.repathT -= dt;
    if (!this.path || this.repathT <= 0 || Math.hypot(gx - this.pathTo.x, gz - this.pathTo.z) > 2.5) {
      this.repathT = 2.5 + Math.random();
      this.pathTo.set(gx, 0, gz);
      const P = g.world.pather;
      this.path = P && !this.fly ? P.find(this.x, this.z, gx, gz, { step: this.st.step ?? 0.75, swim: false, fly: false }, 5000) : [gx, gz];
      if (!this.path || !this.path.length) this.path = [gx, gz];
      this.pi = 0;
    }
    let tx = this.path[this.pi], tz = this.path[this.pi + 1];
    while (Math.hypot(tx - this.x, tz - this.z) < 0.5 && this.pi + 2 < this.path.length) { this.pi += 2; tx = this.path[this.pi]; tz = this.path[this.pi + 1]; }
    const want = Math.atan2(tx - this.x, tz - this.z);
    const dy = this.turnTo(want, dt);
    const align = Math.max(0, Math.cos(dy));
    const tracked = !!this.model?.tracks;
    const sp = this.st.speed * (tracked ? align ** 3 : 0.35 + 0.65 * align);
    let nx = this.x + Math.sin(this.yaw) * sp * dt, nz = this.z + Math.cos(this.yaw) * sp * dt;
    // separation from neighbours
    for (const r of g.robots ?? []) {
      if (r === this || r.dead) continue;
      const dx = nx - r.x, dz = nz - r.z, d = Math.hypot(dx, dz), m = this.radius + r.radius;
      if (d < m && d > 1e-4) { const k = ((m - d) / m) * 0.6 * dt * 6; nx += (dx / d) * k; nz += (dz / d) * k; }
    }
    const R = g.region;
    if (R && !this.fly && (R.isSolid(nx, nz) || nx < 1 || nz < 1 || nx > R.N - 1 || nz > R.N - 1)) { this.stuckT += dt; if (this.stuckT > 0.6) { this.repathT = 0; this.stuckT = 0; } return 0; }
    const moved = Math.hypot(nx - this.x, nz - this.z) / Math.max(dt, 1e-4);
    this.x = nx; this.z = nz;
    return moved;
  }
  private turnTo(want: number, dt: number) {
    let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const k = this.st.turn * dt;
    this.yaw += clamp(d, -k, k);
    return d;
  }
  private place(dt: number) {
    const gy = this.g.world.surfaceY(this.x, this.z);
    this.bob += dt;
    const hover = this.model?.hover ?? 0;
    const ty = gy + hover + (hover ? Math.sin(this.bob * 2.2) * 0.06 : 0);
    this.y = hover ? damp(this.y, ty, 4, dt) : ty;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.yaw;
    if (hover) { this.mesh.rotation.x = clamp(this.speedK * 0.06, -0.3, 0.3); this.mesh.rotation.z = Math.sin(this.bob * 1.3) * 0.05; }
  }

  // -------------------------------------------------------------------------------------------- weapons
  private fire(tp: THREE.Vector3, cont = false) {
    const w = this.weapon;
    if (!cont) { this.cd = w.cd * (0.85 + Math.random() * 0.3); this.burstN = (w.burst ?? 1) - 1; }
    else this.burstN--;
    this.burstT = 0.09;
    this.recoilK = 1; this.fireT = 0.25;
    if (w.shot === 'melee') { this.meleeT = 0; this.strike(); return; }
    if (w.shot === 'flame' || w.shot === 'beam') this.recoilK = 0.3;
    const m = this.model, h = this.human;
    const mz = (m?.muzzles.length ? m.muzzles[(this.burstN + 1) % m.muzzles.length] : h?.muzzle) ?? null;
    if (mz) { this.mesh.updateMatrixWorld(true); mz.getWorldPosition(_u); } else _u.set(this.x, this.y + this.height * 0.7, this.z);
    // muzzle flash and smoke
    const fx = this.g.fx, flashC = RAMPS.glowAmber[4];
    const dir = _v.copy(tp).sub(_u); const dist = dir.length(); dir.normalize();
    fx.spray(_u.x, _u.y, _u.z, dir.x, dir.y, dir.z, w.shot === 'bullet' ? 3 : 8, flashC, { glow: true, speed: w.shot === 'bullet' ? 2 : 3.5, cone: 0.35, size: w.shot === 'bullet' ? 1.6 : 2.6, life: 0.12, grav: 0 });
    if (w.shot === 'shell' || w.shot === 'mortar' || w.shot === 'rocket') { fx.burst(_u.x, _u.y, _u.z, 4, RAMPS.steel[4], { speed: 0.6, up: 0.4, size: 3, life: 0.9, grav: -0.5 }); vfx2d.play('smoke', _u.x, _u.y, _u.z, { scale: 0.6 }); }
    shots(this.g).fire(this, _u, tp, dist, w);
  }
  /** a claw or a fist: hits whatever it is fighting if it is still in reach */
  private strike() {
    const t = this.tgt; if (!t || !tAlive(t)) return;
    const p = tPos(t, _v);
    if (Math.hypot(p.x - this.x, p.z - this.z) - tRad(t) > this.weapon.range + 0.3) return;
    hitTarget(this.g, t, this.weapon.dmg, this, this.weapon.fx);
    this.g.fx.spray(p.x, p.y, p.z, Math.sin(this.yaw), 0.5, Math.cos(this.yaw), 8, RAMPS.glowAmber[3], { glow: true, speed: 2, size: 1.6, life: 0.25, grav: 6 });
    vfx2d.play('impact', p.x, p.y, p.z, { scale: 0.6 });
  }

  // -------------------------------------------------------------------------------------------- animation
  private animate(dt: number, speed: number) {
    const m = this.model, t = (this.gait += 0);
    void t;
    this.recoilK = Math.max(0, this.recoilK - dt * 6);
    this.flashK = Math.max(0, this.flashK - dt * 4);
    this.fireT = Math.max(0, this.fireT - dt);
    if (this.meleeT >= 0) { this.meleeT += dt * 3; if (this.meleeT > 1) this.meleeT = -1; }
    if (this.human) {
      const r = this.human.rig;
      const aiming = !!this.tgt && this.weapon.shot !== 'melee' && this.human.gun;
      r.update(dt, { speed: speed / HUMAN_SCALE, action: aiming ? 'aim_gun' : this.meleeT >= 0 ? 'shove' : '', actionT: this.meleeT >= 0 ? this.meleeT * 0.5 : 0, actionDur: 0.5, lookYaw: clamp(this.aimYaw, -1, 1), fidget: true } as never);
      this.human.U.flash.value.setRGB(this.flashK * 0.4, this.flashK * 0.08, 0.04 * this.flashK);
      return;
    }
    if (!m) return;
    const U = m.U;
    U.flash.value.setRGB(this.flashK * 0.22, this.flashK * 0.06, this.flashK * 0.03);
    U.glow.value = 0.9 + (this.fireT > 0 ? 0.6 : 0);
    // turret and gun
    if (m.turret) m.turret.rotation.y = this.aimYaw;
    if (m.gun && m.gun !== m.turret) m.gun.rotation.x = -Math.max(m.gun.userData.minPitch ?? -0.4, this.aimPitch) * (m.gun.userData.minPitch ? 1 : 1);
    for (const r of m.recoil) { r.userData.z0 ??= r.position.z; r.userData.y0 ??= r.position.y; const kick = this.recoilK ** 2 * (m.h > 1.5 ? 0.12 : 0.05); if (r.name === 'fore' || r.name === 'rifle') r.position.y = r.userData.y0 + kick * 0.6; else r.position.z = r.userData.z0 - kick; }
    // claws
    for (const j of m.jaws) { const s = j.userData.s ?? 1, open = this.meleeT >= 0 ? Math.sin(this.meleeT * Math.PI) : 0.15 + Math.sin(this.bob * 1.5) * 0.05; j.rotation.z = s * open * 0.6; }
    // legs: a two-bone reach for the ground, phased per leg
    if (m.legs.length) {
      const walk = clamp(speed / Math.max(0.3, this.st.speed * 0.5), 0, 1);
      this.gait += dt * (speed / Math.max(0.05, m.stride * 2)) * Math.PI * 0.5 + dt * 0.0;
      let bob = 0;
      for (const L of m.legs) {
        const ph = this.gait + L.ph;
        const ca = Math.cos(L.splay || 0);
        const hipH = L.hipH / Math.max(0.5, ca);
        const zt = L.reach + Math.sin(ph) * m.stride * walk, lift = Math.max(0, Math.cos(ph)) * m.stride * 0.6 * walk;
        const yt = -(hipH - L.footH - lift / ca);
        const d = clamp(Math.hypot(zt, yt), 0.02, L.lt + L.ls - 0.002);
        const knee = Math.PI - Math.acos(clamp((L.lt * L.lt + L.ls * L.ls - d * d) / (2 * L.lt * L.ls), -1, 1));
        const beta = Math.acos(clamp((L.lt * L.lt + d * d - L.ls * L.ls) / (2 * L.lt * d), -1, 1));
        const a0 = Math.atan2(zt, -yt);
        if (!L.bird) { L.hip.rotation.x = -(a0 + beta); L.knee.rotation.x = knee; L.foot.rotation.x = a0 + beta - knee; }
        else { L.hip.rotation.x = -(a0 - beta); L.knee.rotation.x = -knee; L.foot.rotation.x = a0 - beta + knee; }
        bob += Math.abs(Math.sin(ph));
      }
      m.body.position.y = -(bob / m.legs.length) * m.stride * 0.12 * walk;
    }
    // wheels and tracks
    const roll = speed * dt;
    for (const w of m.wheels) w.g.rotation.x += roll / Math.max(0.02, w.r);
    if (m.tracks) { U.scroll.value.x -= roll * 2.4 * 1.6; U.scroll.value.y -= roll * 2.4 * 1.6; }
    for (const r of m.rotors) r.rotation.y += dt * 38 * (r.userData.dir ?? 1);
    if (m.pistons.length) { this.mesh.updateMatrixWorld(true); aimPistons(m.pistons); }
    // exhaust smoke, thicker when hurt
    this.smokeT -= dt * (1 + speed + (1 - this.hp / this.maxHp) * 3);
    if (this.smokeT <= 0 && m.exhaust.length) {
      this.smokeT = 0.6 + Math.random() * 0.8;
      const p = m.exhaust[Math.floor(Math.random() * m.exhaust.length)].getWorldPosition(_v);
      const hurt = this.hp < this.maxHp * 0.5;
      this.g.fx.burst(p.x, p.y, p.z, hurt ? 3 : 1, hurt ? RAMPS.basalt[1] : RAMPS.steel[4], { speed: 0.15, up: 0.6, size: 2.2, life: 1.2, grav: -0.5 });
    }
  }

  // -------------------------------------------------------------------------------------------- death
  private die(by: any) {
    if (this.dead) return;
    this.dead = true; this.hp = 0; this.deadT = 0;
    const fx = this.g.fx, x = this.x, y = this.y + this.height * 0.5, z = this.z, big = this.height > 1.4 ? 1.6 : 1;
    fx.burst(x, y, z, Math.round(30 * big), RAMPS.glowAmber[4], { glow: true, speed: 3.5 * big, up: 2.5, size: 2.2, life: 0.5, grav: 7 });
    fx.burst(x, y, z, Math.round(18 * big), RAMPS.basalt[1], { speed: 1.2, up: 1.4, size: 4, life: 2, grav: -0.5 });
    vfx2d.play('impact', x, y, z, { scale: 1.2 * big }); vfx2d.play('shock', x, this.y + 0.1, z, { scale: big }); vfx2d.play('smoke', x, y, z, { scale: big });
    this.g.cam?.shake(0.12 * big, 0.3);
    if (this.model) {
      // the debris groups break off and tumble
      const D = debris(this.g);
      for (const o of this.model.debris) if (o.parent && Math.random() < 0.85) D.add(o, this, by);
      this.model.U.lit.value = 0.15; this.model.U.flash.value.setRGB(0, 0, 0);
    }
    for (const r of this.g.robots ?? []) if (r.tgt?.ref === this) r.tgt = null;
  }
  private dying(dt: number) {
    this.deadT += dt;
    if (this.human) { this.human.rig.update(dt, { speed: 0, full: 'dead', fidget: false } as never); }
    else if (this.model) {
      this.model.U.flash.value.setRGB(0, 0, 0);
      if ((this.smokeT -= dt) <= 0 && this.deadT < 9) { this.smokeT = 0.25; this.g.fx.burst(this.x, this.y + this.height * 0.4, this.z, 2, RAMPS.basalt[1], { speed: 0.2, up: 0.8, size: 3, life: 1.6, grav: -0.6 }); if (Math.random() < 0.3) this.g.fx.spray(this.x, this.y + this.height * 0.4, this.z, Math.random() - 0.5, 1, Math.random() - 0.5, 3, RAMPS.glowAmber[3], { glow: true, speed: 1.5, size: 1.4, life: 0.25, grav: 6 }); }
    }
    if (this.deadT > 10) this.mesh.position.y -= dt * 0.15 * this.height;
    if (this.deadT > 16) this.dispose();
  }
  dispose() {
    if (this.removed) return;
    this.removed = true; this.dead = true;
    this.mesh.removeFromParent();
    this.mesh.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g && !(o as THREE.SkinnedMesh).isSkinnedMesh) g.dispose(); });
    const L = this.g.robots; if (L) { const i = L.indexOf(this); if (i >= 0) L.splice(i, 1); }
  }
}

/** damage whatever a target is, and give it the payload's effects */
function hitTarget(g: Host, t: Tgt, n: number, from: Shooter, fx?: WFx, dir?: THREE.Vector3) {
  const r = t.ref;
  if (t.kind === 'robot') {
    const u = r as RobotUnit;
    if (fx) { const S = u.status; S.by = from; if (fx.burn) S.burn = Math.max(S.burn, fx.burn); if (fx.poison) S.poison = Math.max(S.poison, fx.poison); if (fx.acid) S.acid = Math.max(S.acid, fx.acid); if (fx.slow) S.slow = Math.max(S.slow, fx.slow); }
    if (fx?.knock && dir && !u.fly) { u.x += dir.x * fx.knock * 0.15; u.z += dir.z * fx.knock * 0.15; }
    u.damage(n, from);
  } else if (t.kind === 'creature') {
    const c = r as Creature;
    if (fx?.poison) c.poison = Math.max(c.poison ?? 0, fx.poison);
    if (fx?.burn || fx?.acid) STATUS.set(c, { burn: Math.max(STATUS.get(c)?.burn ?? 0, fx.burn ?? 0), acid: Math.max(STATUS.get(c)?.acid ?? 0, fx.acid ?? 0) });
    if (fx?.knock && dir) { c.vx += dir.x * fx.knock; c.vz += dir.z * fx.knock; }
    g.world.damage?.(c, n * (STATUS.get(c)?.acid ? 1.25 : 1), null);
  } else if (t.kind === 'golem') r.hurt(n, from);
  else if (t.kind === 'building') { if (typeof r.damage === 'function') r.damage(n, from); else if (typeof r.hp === 'number') r.hp -= n; }
}
/** creatures burning or eaten by acid (venom uses the creature's own poison) */
const STATUS = new Map<Creature, { burn: number; acid: number }>();
function tickStatus(g: Host, dt: number) {
  for (const [c, s] of STATUS) {
    s.burn -= dt; s.acid -= dt;
    if (c.dead || (s.burn <= 0 && s.acid <= 0)) { STATUS.delete(c); continue; }
    if (s.burn > 0) { g.world.damage?.(c, 3 * dt, null); if (Math.random() < dt * 8) g.fx.burst(c.x, c.y + c.size * 0.5, c.z, 1, RAMPS.glowAmber[3], { glow: true, speed: 0.4, up: 1.2, size: 2, life: 0.4, grav: -1 }); }
  }
}

// ================================================================================================ shots in flight
interface Shot { p: THREE.Vector3; v: THREE.Vector3; life: number; w: Weapon; from: Shooter; f: Faction; trail: number; pierce: number; hits: Set<unknown> | null; kind: ShotKind }
interface Cloud { x: number; y: number; z: number; r: number; t: number; w: Weapon; from: Shooter; f: Faction; puff: number }
class Shots {
  private list: Shot[] = [];
  private clouds: Cloud[] = [];
  private mesh: THREE.InstancedMesh;
  private col = new THREE.Color();
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private z = new THREE.Vector3(0, 0, 1);
  constructor(private g: Host) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    gbuf(mat, 0);
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, 500);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(500 * 3), 3);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    g.world.scene.add(this.mesh);
  }
  fire(from: Shooter, at: THREE.Vector3, tp: THREE.Vector3, dist: number, w: Weapon) {
    const fx = w.fx ?? {};
    if (w.shot === 'beam') { this.beam(from, at, tp, w); return; }
    const n = w.shot === 'flame' ? 5 : fx.frag ? Math.max(2, Math.round(fx.frag)) : 1;
    for (let i = 0; i < n; i++) {
      const p = at.clone(), sp = w.speed * (w.shot === 'flame' ? 0.8 + Math.random() * 0.4 : 1);
      const dir = tp.clone().sub(at).normalize();
      const sprd = w.shot === 'flame' ? 0.18 : fx.frag ? w.spread + 0.09 : w.spread;
      dir.x += (Math.random() - 0.5) * sprd * 2; dir.y += (Math.random() - 0.5) * sprd; dir.z += (Math.random() - 0.5) * sprd * 2; dir.normalize();
      const v = dir.multiplyScalar(sp);
      if (w.shot === 'mortar' || w.shot === 'cloud') {
        // a lob that lands on the target: the flight time from the distance
        const T = clamp(dist / Math.max(4, sp), 0.8, 2.4), gy = 9;
        v.set((tp.x - at.x) / T + (Math.random() - 0.5) * w.spread * dist, (tp.y - at.y + 0.5 * gy * T * T) / T, (tp.z - at.z) / T + (Math.random() - 0.5) * w.spread * dist);
      }
      const life = w.shot === 'mortar' || w.shot === 'cloud' ? 4 : w.shot === 'flame' ? w.range / sp : (w.range * 1.3) / sp + 0.2;
      this.list.push({ p, v, life, w, from, f: from.faction, trail: 0, pierce: fx.pierce ?? 0, hits: (fx.pierce || w.shot === 'flame') ? new Set() : null, kind: w.shot });
    }
  }
  /** a gravity lens or a rail beam: instant along the line, through whatever the pierce allows; a pull drags them in */
  private beam(from: Shooter, at: THREE.Vector3, tp: THREE.Vector3, w: Weapon) {
    const g = this.g, fx = w.fx ?? {};
    const dir = tp.clone().sub(at).normalize(), end = at.clone().addScaledVector(dir, w.range);
    const hits: { t: Tgt; d: number }[] = [];
    const test = (t: Tgt, x: number, y: number, z: number, r: number) => { const d = segDist(at, end, x, y, z); if (d < r + 0.25) hits.push({ t, d: Math.hypot(x - at.x, z - at.z) }); };
    for (const r of g.robots ?? []) if (!r.dead && r !== from && hostile(from.faction, r.faction)) test({ kind: 'robot', ref: r }, r.x, r.y + r.height * 0.5, r.z, r.radius);
    g.world.near?.((at.x + end.x) / 2, (at.z + end.z) / 2, w.range / 2 + 1, (c) => { if (!c.dead && hostile(from.faction, c.faction)) test({ kind: 'creature', ref: c }, c.x, c.y + c.size * 0.45, c.z, c.radius ?? 0.4); });
    const P = g.player; if (P && P.alive && P.started !== false && hostile(from.faction, 'veyr')) test({ kind: 'golem', ref: P }, P.x, P.y + 0.3, P.z, P.radius);
    hits.sort((a, b) => a.d - b.d);
    const n = 1 + (fx.pierce ?? 0);
    let stop = end;
    for (let i = 0; i < Math.min(n, hits.length); i++) {
      const h = hits[i];
      hitTarget(g, h.t, w.dmg, from, fx, dir);
      if (fx.pull) { const r = h.t.ref; if (h.t.kind === 'robot' && !r.fly) { r.x -= dir.x * fx.pull * 0.25; r.z -= dir.z * fx.pull * 0.25; } else if (h.t.kind === 'creature') { r.vx -= dir.x * fx.pull * 1.5; r.vz -= dir.z * fx.pull * 1.5; } }
      if (i === Math.min(n, hits.length) - 1) stop = at.clone().addScaledVector(dir, h.d);
    }
    const c = w.col ?? RAMPS.glowTeal[3];
    g.fx.arc(at, stop, 0.14, c, fx.pull ? 0.12 : 0.04);
    if (fx.pull) g.fx.arc(at, stop, 0.2, c, 0.3);
    g.fx.spray(stop.x, stop.y, stop.z, -dir.x, 0.4, -dir.z, 6, c, { glow: true, speed: 1.6, cone: 0.8, size: 1.6, life: 0.3, grav: 2 });
    vfx2d.play('glint', stop.x, stop.y, stop.z, { scale: 0.4 });
  }
  update(dt: number) {
    const g = this.g, fx = g.fx;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.life -= dt;
      const lob = s.kind === 'mortar' || s.kind === 'cloud';
      if (lob) s.v.y -= 9 * dt;
      if (s.kind === 'flame') { s.v.multiplyScalar(Math.exp(-dt * 1.5)); s.v.y += dt * 1.2; if (Math.random() < 0.7) fx.glow.emit(s.p.x, s.p.y, s.p.z, s.v.x * 0.2, 0.4, s.v.z * 0.2, this.col.set(s.w.col ?? RAMPS.glowAmber[4]).multiplyScalar(1.6), 1, 3 + (1 - s.life) * 3, 0.25, -1, 1); }
      if (s.kind === 'rocket') { s.v.multiplyScalar(1 + dt * 0.8); if ((s.trail -= dt) <= 0) { s.trail = 0.03; fx.burst(s.p.x, s.p.y, s.p.z, 1, RAMPS.steel[4], { speed: 0.1, up: 0.1, size: 2.4, life: 0.6, grav: -0.2 }); } }
      if (lob && (s.trail -= dt) <= 0) { s.trail = 0.06; fx.burst(s.p.x, s.p.y, s.p.z, 1, s.kind === 'cloud' ? RAMPS.ichor[3] : RAMPS.steel[3], { speed: 0.05, up: 0.05, size: 1.6, life: 0.4, grav: 0 }); }
      const step = s.v.length() * dt;
      _v.copy(s.v).multiplyScalar(dt);
      const np = _w.copy(s.p).add(_v);
      // what it hits on the way
      let hit: Tgt | null = null;
      const R = s.kind === 'bullet' ? 0.15 : s.kind === 'flame' ? 0.45 : 0.3;
      const fresh = (o: unknown) => !s.hits || !s.hits.has(o);
      for (const r of g.robots ?? []) {
        if (r.dead || r === s.from || !hostile(s.f, r.faction) || !fresh(r)) continue;
        const cy = r.y + r.height * 0.5;
        if (segDist(s.p, np, r.x, cy, r.z) < r.radius + R && Math.abs(np.y - cy) < r.height * 0.6 + R) { hit = { kind: 'robot', ref: r }; break; }
      }
      if (!hit && g.world.near) g.world.near(np.x, np.z, 1.6, (c) => { if (hit || c.dead || !hostile(s.f, c.faction) || !fresh(c)) return; const cy = c.y + c.size * 0.45; if (segDist(s.p, np, c.x, cy, c.z) < (c.radius ?? 0.4) + R) hit = { kind: 'creature', ref: c }; });
      const P = g.player;
      if (!hit && P && P.alive && P.started !== false && hostile(s.f, 'veyr') && fresh(P)) { const cy = P.y + (P.height ?? 0.5) * 0.5; if (segDist(s.p, np, P.x, cy, P.z) < P.radius + R) hit = { kind: 'golem', ref: P }; }
      const B = g.factory?.buildings;
      if (!hit && Array.isArray(B)) for (const b of B) { if (b.dead || (b.hp ?? 1) <= 0 || !hostile(s.f, (b.faction ?? 'veyr') as Faction) || !fresh(b)) continue; if (Math.hypot(np.x - b.x, np.z - b.z) < (b.radius ?? 0.9) && np.y < g.world.surfaceY(b.x, b.z) + 1.4) { hit = { kind: 'building', ref: b }; break; } }
      const gy = g.world.surfaceY(np.x, np.z);
      const ground = np.y <= gy;
      if (hit && s.hits && !s.w.splash && s.kind !== 'cloud') {
        // piercing rounds and flame go on through
        const ht = hit as Tgt;
        s.hits.add(ht.ref);
        hitTarget(g, ht, s.w.dmg * (s.kind === 'flame' ? 0.4 : 1), s.from, s.w.fx, _u.copy(s.v).normalize());
        this.impact(s, np.clone(), ht, true);
        if (s.kind !== 'flame' && s.pierce-- <= 0) { this.list.splice(i, 1); continue; }
        hit = null;
      }
      if (hit || ground || s.life <= 0) {
        if (hit && !s.w.splash && s.kind !== 'cloud') hitTarget(g, hit, s.w.dmg, s.from, s.w.fx, _u.copy(s.v).normalize());
        if ((hit || ground) && s.kind !== 'flame') this.impact(s, hit ? np : np.setY(Math.max(np.y, gy)), hit);
        this.list.splice(i, 1);
        continue;
      }
      s.p.copy(np);
      // draw: a streak along the velocity
      if (n < 500 && s.kind !== 'flame') {
        const len = s.kind === 'bullet' ? Math.min(0.9, step * 2.2) : s.kind === 'cloud' ? 0.12 : 0.35;
        const th = s.kind === 'bullet' ? 0.025 : s.kind === 'cloud' ? 0.12 : 0.07;
        this.q.setFromUnitVectors(this.z, _u.copy(s.v).normalize());
        this.m.compose(s.p, this.q, this.s.set(th, th, len));
        this.mesh.setMatrixAt(n, this.m);
        this.mesh.setColorAt(n, this.col.set(s.w.col ?? RAMPS.glowAmber[4]).multiplyScalar(s.kind === 'cloud' ? 1 : 2.2));
        n++;
      }
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // lingering spore and gas clouds
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t -= dt;
      if (c.t <= 0) { this.clouds.splice(i, 1); continue; }
      if ((c.puff -= dt) <= 0) {
        c.puff = 0.35;
        const a = Math.random() * Math.PI * 2, rr = Math.random() * c.r;
        vfx2d.play('smoke', c.x + Math.cos(a) * rr, c.y + 0.2, c.z + Math.sin(a) * rr, { scale: 0.7, ramp: c.w.fx?.poison ? 'ichor' : c.w.fx?.slow ? 'violet' : 'moss' });
        fx.burst(c.x + Math.cos(a) * rr, c.y + 0.2, c.z + Math.sin(a) * rr, 3, c.w.col ?? RAMPS.ichor[4], { speed: 0.3, up: 0.3, size: 3.5, life: 1.4, grav: -0.1 });
        // everyone hostile inside breathes it
        const inside = (x: number, z: number) => Math.hypot(x - c.x, z - c.z) < c.r;
        for (const r of g.robots ?? []) if (!r.dead && hostile(c.f, r.faction) && inside(r.x, r.z)) hitTarget(g, { kind: 'robot', ref: r }, c.w.dmg * 0.12, c.from, c.w.fx);
        g.world.near?.(c.x, c.z, c.r, (cr) => { if (!cr.dead && hostile(c.f, cr.faction)) hitTarget(g, { kind: 'creature', ref: cr }, c.w.dmg * 0.12, c.from, c.w.fx); });
      }
    }
  }
  private impact(s: Shot, p: THREE.Vector3, hit: Tgt | null, through = false) {
    const g = this.g, fx = g.fx, w = s.w;
    if (s.kind === 'cloud') { this.clouds.push({ x: p.x, y: p.y, z: p.z, r: w.splash ?? 1.8, t: 6, w, from: s.from, f: s.f, puff: 0 }); vfx2d.play('poof', p.x, p.y + 0.2, p.z, { scale: 0.8, ramp: 'ichor' }); return; }
    if (w.splash && !through) {
      // a shell, a bomb, a rocket: everything hostile in the blast takes damage by distance
      const R = w.splash;
      const hurt = (t: Tgt, x: number, z: number, r: number) => { const d = Math.max(0, Math.hypot(x - p.x, z - p.z) - r); if (d < R) hitTarget(g, t, w.dmg * (1 - (d / R) * 0.7), s.from, w.fx, _u.set(x - p.x, 0, z - p.z).normalize()); };
      for (const r of g.robots ?? []) if (!r.dead && r !== s.from && hostile(s.f, r.faction)) hurt({ kind: 'robot', ref: r }, r.x, r.z, r.radius);
      g.world.near?.(p.x, p.z, R + 1, (c) => { if (!c.dead && hostile(s.f, c.faction)) hurt({ kind: 'creature', ref: c }, c.x, c.z, c.radius ?? 0.4); });
      const P = g.player; if (P && P.alive && P.started !== false && hostile(s.f, 'veyr')) hurt({ kind: 'golem', ref: P }, P.x, P.z, P.radius);
      const B = g.factory?.buildings; if (Array.isArray(B)) for (const b of B) if (!b.dead && (b.hp ?? 1) > 0 && hostile(s.f, (b.faction ?? 'veyr') as Faction)) hurt({ kind: 'building', ref: b }, b.x, b.z, b.radius ?? 0.9);
      const burn = !!w.fx?.burn;
      fx.burst(p.x, p.y + 0.1, p.z, 26, burn ? RAMPS.glowAmber[3] : RAMPS.glowAmber[4], { glow: true, speed: 3.2, up: 2.4, size: 2.4, life: burn ? 0.8 : 0.4, grav: 6 });
      fx.burst(p.x, p.y + 0.1, p.z, 14, RAMPS.soil[3], { speed: 2.2, up: 3.2, size: 3, life: 0.9, grav: 9 });
      fx.burst(p.x, p.y + 0.2, p.z, 10, RAMPS.basalt[2], { speed: 0.8, up: 1, size: 4.5, life: 1.8, grav: -0.4 });
      vfx2d.play('impact', p.x, p.y + 0.2, p.z, { scale: R * 0.7 }); vfx2d.play('dust', p.x, p.y, p.z, { scale: R * 0.8 }); vfx2d.play('crack', p.x, p.y + 0.02, p.z, { scale: R * 0.5, flat: true });
      g.cam?.shake(Math.min(0.25, 0.06 * R), 0.25);
    } else {
      const metal = hit && (hit.kind === 'robot' || hit.kind === 'building' || hit.kind === 'golem');
      const bio = w.fx?.poison || w.fx?.acid;
      fx.spray(p.x, p.y, p.z, -s.v.x, 0.4 * s.v.length(), -s.v.z, metal ? 6 : 4, bio ? RAMPS.ichor[4] : metal ? RAMPS.glowAmber[4] : hit ? RAMPS.blood[3] : RAMPS.soil[4], { glow: !!metal && !bio, speed: 1.8, cone: 0.7, size: 1.4, life: 0.25, grav: 7 });
      vfx2d.play(metal ? 'spark' : hit ? 'blood' : 'dust', p.x, p.y, p.z, { scale: 0.35, ...(bio ? { ramp: 'ichor' as const } : {}) });
    }
  }
}
function segDist(a: THREE.Vector3, b: THREE.Vector3, x: number, y: number, z: number) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz || 1e-6;
  const t = clamp(((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / l2, 0, 1);
  return Math.hypot(a.x + abx * t - x, a.z + abz * t - z);
}

// ================================================================================================ wreckage
interface Piece { o: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; t: number; rest: boolean }
class Debris {
  private list: Piece[] = [];
  constructor(private g: Host) {}
  add(o: THREE.Object3D, u: RobotUnit, by: any) {
    this.g.world.scene.attach(o);
    const dx = o.position.x - u.x, dz = o.position.z - u.z, d = Math.hypot(dx, dz) || 1;
    const fromX = by?.x ?? u.x - Math.sin(u.yaw), fromZ = by?.z ?? u.z - Math.cos(u.yaw);
    const ax = u.x - fromX, az = u.z - fromZ, al = Math.hypot(ax, az) || 1;
    const k = 1.5 + Math.random() * 2.5;
    this.list.push({ o, v: new THREE.Vector3((dx / d) * k * 0.6 + (ax / al) * k * 0.6, 2.5 + Math.random() * 3.5, (dz / d) * k * 0.6 + (az / al) * k * 0.6), w: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12), t: 0, rest: false });
    this.g.fx.spray(o.position.x, o.position.y, o.position.z, 0, 1, 0, 6, RAMPS.glowAmber[4], { glow: true, speed: 2.5, cone: 0.8, size: 1.5, life: 0.3, grav: 6 });
  }
  update(dt: number) {
    const g = this.g;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (!p.rest) {
        p.v.y -= 12 * dt;
        p.o.position.addScaledVector(p.v, dt);
        p.o.rotation.x += p.w.x * dt; p.o.rotation.y += p.w.y * dt; p.o.rotation.z += p.w.z * dt;
        const gy = g.world.surfaceY(p.o.position.x, p.o.position.z) + 0.04;
        if (p.o.position.y < gy) {
          p.o.position.y = gy;
          if (Math.abs(p.v.y) > 1.5) { p.v.y *= -0.35; p.v.x *= 0.5; p.v.z *= 0.5; p.w.multiplyScalar(0.5); g.fx.burst(p.o.position.x, gy, p.o.position.z, 3, RAMPS.soil[3], { speed: 0.8, up: 0.6, size: 2, life: 0.5, grav: 4 }); }
          else { p.rest = true; }
        }
        if (Math.random() < dt * 8) g.fx.burst(p.o.position.x, p.o.position.y, p.o.position.z, 1, RAMPS.basalt[1], { speed: 0.1, up: 0.4, size: 2.2, life: 0.9, grav: -0.4 });
      }
      if (p.t > 14) p.o.position.y -= dt * 0.1;
      if (p.t > 18) { p.o.removeFromParent(); this.list.splice(i, 1); }
    }
  }
}

// ================================================================================================ per-host systems and the API
const SHOTS = new WeakMap<object, Shots>(), DEBRIS = new WeakMap<object, Debris>();
function shots(g: Host) { let s = SHOTS.get(g); if (!s) SHOTS.set(g, (s = new Shots(g))); return s; }
function debris(g: Host) { let s = DEBRIS.get(g); if (!s) DEBRIS.set(g, (s = new Debris(g))); return s; }

/** systems that want to know about new units (the weapons workbench issues designs to them) */
export const robotHooks = { spawn: [] as ((u: RobotUnit, game: object) => void)[] };
/** make a unit and register it in game.robots */
export function spawnRobot(game: Game, kind: RobotKind, faction: Faction, x: number, z: number): RobotUnit {
  const u = new RobotUnit(game, kind, faction, x, z);
  const h = game as unknown as Host;
  (h.robots ??= []).push(u);
  for (const f of robotHooks.spawn) { try { f(u, game); } catch (e) { console.error('robot spawn hook', e); } }
  return u;
}
const INSTALLED = new WeakSet<object>();
/** run every unit, the shots and the wreckage (game.ts calls this once a frame) */
export function tickRobots(game: Game | object, dt: number) {
  const h = game as unknown as Host;
  // the weapons workbench and the golem's mounts come with the first tick of a real game
  if (!INSTALLED.has(game) && (game as { engine?: unknown }).engine) { INSTALLED.add(game); import('./weapons/store').then((m) => m.installWeapons(game as Game)).catch((e) => console.error('weapons', e)); }
  const L = h.robots;
  if (L) for (const u of [...L]) { try { u.update(dt); } catch (e) { console.error('robot', u.kind, e); u.dispose(); } }
  if (dt > 0) { SHOTS.get(h)?.update(dt); DEBRIS.get(h)?.update(dt); tickStatus(h, dt); }
}

/** fire a weapon from any shooter (the golem's mount, a test stand): muzzle point, aim point */
export function fireWeapon(game: Game | object, from: Shooter, muzzle: THREE.Vector3, aim: THREE.Vector3, w: Weapon) {
  const h = game as unknown as Host;
  const dist = Math.hypot(aim.x - muzzle.x, aim.z - muzzle.z);
  const dir = _v.copy(aim).sub(muzzle).normalize();
  const c = w.col ?? RAMPS.glowAmber[4];
  if (w.shot !== 'beam') h.fx.spray(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, w.shot === 'bullet' ? 3 : 6, c, { glow: true, speed: 2.2, cone: 0.35, size: w.shot === 'bullet' ? 1.6 : 2.4, life: 0.12, grav: 0 });
  shots(h).fire(from, muzzle, aim, dist, w);
}
/** the nearest hostile to a point within a radius, for mounts that pick their own targets */
export function nearestHostile(game: Game | object, f: Faction, x: number, z: number, r: number, pref?: THREE.Vector3): { p: THREE.Vector3; ref: unknown } | null {
  const h = game as unknown as Host;
  let best: { p: THREE.Vector3; ref: unknown } | null = null, bd = r;
  const score = (px: number, pz: number) => Math.hypot(px - x, pz - z) * 0.6 + (pref ? Math.hypot(px - pref.x, pz - pref.z) * 0.4 : 0);
  for (const u of h.robots ?? []) if (!u.dead && hostile(f, u.faction)) { const d = score(u.x, u.z); if (d < bd) { bd = d; best = { p: new THREE.Vector3(u.x, u.y + u.height * 0.5, u.z), ref: u }; } }
  h.world.near?.(x, z, r, (c) => { if (c.dead || !(hostile(f, c.faction) || (c.faction === 'wild' && c.target === -999999999))) return; const d = score(c.x, c.z); if (d < bd) { bd = d; best = { p: new THREE.Vector3(c.x, c.y + c.size * 0.45, c.z), ref: c }; } });
  return best;
}
