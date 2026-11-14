// A living (or dead) creature in a region: body state, movement, combat, and its animated mesh.
import * as THREE from 'three';
import type { Species, Faction } from './species';
import { Animator, type AnimState } from '../life/anim';
import { makeInstance, type CreatureFx } from '../life/creatureMesh';
import { clamp, wrapA, dampA } from '../core/rand';
import type { World } from './world';
import { F_SEL, F_HOVER, F_ENEMY } from '../gfx/gbuf';

/** target id meaning "the golem" (it is not a creature) */
export const GOLEM = -999999999;
/** what creatures need to know about the golem to hunt it, fear it and hit it */
export interface GolemTarget { x: number; y: number; z: number; alive: boolean; radius: number; mass: number; hurt(amt: number, from: Creature): void }
export const GOLEM_REF: { g: GolemTarget | null } = { g: null };

export type Mind = 'idle' | 'wander' | 'graze' | 'hunt' | 'flee' | 'eat' | 'scavenge' | 'order' | 'attack' | 'mate' | 'rest' | 'follow' | 'held';
export interface Order { kind: 'move' | 'attack' | 'amove' | 'hold' | 'guard'; x: number; z: number; target?: number }

let NEXT = 1;

export class Creature {
  readonly id = NEXT++;
  x: number; z: number; y = 0; yaw: number;
  vx = 0; vz = 0;
  hp: number; energy = 0.75; age = 0; growth = 1;
  dead = false; deathTime = 0;
  /** remaining biomass in the corpse */
  bio = 0;
  /** moss digestion 0..1 */
  digest = 0;
  rot = 0;
  mind: Mind = 'idle';
  target = 0;
  order: Order | null = null;
  path: number[] | null = null; pathI = 0; repathT = 0;
  goalX = 0; goalZ = 0;
  thinkT = Math.random() * 0.5;
  atkT = 0; atkAnim = -1;
  stunT = 0; poison = 0; heldT = 0;
  herd = 0; homeX: number; homeZ: number;
  gestT = 0;
  selected = false; hovered = false;
  lastHitBy = 0; fleeT = 0;
  /** extra vertical offset (flight, being lifted by tendrils) */
  air = 0;
  readonly mesh: THREE.SkinnedMesh;
  readonly anim: Animator;
  readonly fx: CreatureFx;
  readonly speed: number; readonly maxHp: number;
  visibleNow = true;
  private turnRate = 0;
  boss = false;
  tag = '';
  // ---- combat with the golem (player.ts / combat.ts / gore.ts)
  /** seconds left of anger at the golem: provoked creatures fight back or bolt */
  aggro = 0;
  /** last time the golem hit it, and with what (kill attribution) */
  golemHit = -99; golemBy: 'punch' | 'rock' | 'ability' | 'plow' = 'punch';
  /** bones cut off (collapsed to their joint), mesh scale while being drawn into the intake */
  severed: number[] = [];
  shrink = 1;

  constructor(readonly sp: Species, public faction: Faction, x: number, z: number, juvenile = false) {
    this.x = x; this.z = z; this.homeX = x; this.homeZ = z;
    this.yaw = Math.random() * Math.PI * 2;
    const st = sp.pheno.stats;
    this.maxHp = st.hp; this.hp = st.hp;
    this.speed = st.speed;
    if (juvenile) { this.growth = 0.35; this.hp = st.hp * 0.4; }
    const inst = makeInstance(sp.model);
    this.mesh = inst.mesh; this.fx = inst.fx;
    this.mesh.userData.creature = this;
    this.anim = new Animator(sp.model.rig, inst.bones, this.mesh);
    sp.alive++; sp.total++;
  }

  get st() { return this.sp.pheno.stats; }
  get mass() { return this.st.mass * this.growth ** 3; }
  get size() { return this.sp.pheno.length * this.growth; }
  get radius() { return Math.max(0.15, this.sp.pheno.length * 0.32 * this.growth); }
  get mature() { return this.growth >= 1; }
  get diet() { return this.sp.pheno.diet; }
  get canFly() { return this.sp.pheno.canFly; }
  get walker() { return { step: this.size > 1.2 || this.st.climb > 0 ? 1.4 : 0.95, swim: this.st.swim > 0, fly: this.canFly }; }
  hostileTo(o: Creature) { return o.faction !== this.faction || this.faction === 'wild'; }

  /** move toward (tx, tz) at a fraction of top speed; returns distance left */
  steer(w: World, tx: number, tz: number, run: number, dt: number) {
    const dx = tx - this.x, dz = tz - this.z, d = Math.hypot(dx, dz);
    const sp = this.speed * run * (this.stunT > 0 ? 0 : 1) * (0.6 + 0.4 * this.growth) * (this.poison > 0 ? 0.8 : 1) * w.moveMul(this);
    let ax = 0, az = 0;
    if (d > 0.05) { ax = (dx / d) * sp; az = (dz / d) * sp; }
    // separation
    w.near(this.x, this.z, this.radius * 2.5 + 0.6, (o) => {
      if (o === this || o.dead || o.air > 0.5) return;
      const ox = this.x - o.x, oz = this.z - o.z, od = Math.hypot(ox, oz) || 0.01;
      const min = this.radius + o.radius;
      if (od < min) { const k = ((min - od) / min) * sp * 1.6; ax += (ox / od) * k; az += (oz / od) * k; }
    });
    const k = 1 - Math.exp(-dt * 8);
    this.vx += (ax - this.vx) * k; this.vz += (az - this.vz) * k;
    return d;
  }

  /** integrate motion with terrain rules */
  move(w: World, dt: number) {
    if (this.dead || this.anim.deathT > 0) { this.vx = this.vz = 0; return; }
    const R = w.region;
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    nx = clamp(nx, 0.6, R.N - 0.6); nz = clamp(nz, 0.6, R.N - 0.6);
    const wk = this.walker;
    const ci = (x: number, z: number) => Math.floor(z) * R.N + Math.floor(x);
    const a = ci(this.x, this.z), b = ci(nx, nz);
    if (a !== b && !w.pather.canStep(a, b, wk)) {
      // slide along the blocked axis
      const bx = ci(nx, this.z), bz = ci(this.x, nz);
      if (bx !== a && w.pather.canStep(a, bx, wk)) nz = this.z;
      else if (bz !== a && w.pather.canStep(a, bz, wk)) nx = this.x;
      else { nx = this.x; nz = this.z; this.vx *= -0.2; this.vz *= -0.2; }
    }
    this.x = nx; this.z = nz;
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 0.08) {
      const want = Math.atan2(this.vx, this.vz);
      const prev = this.yaw;
      this.yaw = dampA(this.yaw, want, 7, dt);
      this.turnRate = wrapA(this.yaw - prev) / Math.max(dt, 1e-4);
    } else this.turnRate *= 0.9;
    const gy = w.surfaceY(this.x, this.z);
    this.y += (gy - this.y) * Math.min(1, dt * 14);
  }

  face(x: number, z: number, dt: number) { this.yaw = dampA(this.yaw, Math.atan2(x - this.x, z - this.z), 9, dt); }

  /** render sync + animation */
  sync(dt: number, w: World, animate: boolean) {
    const m = this.mesh;
    const s = this.growth;
    m.scale.setScalar(s * this.shrink);
    m.position.set(this.x, this.y + this.air, this.z);
    m.rotation.y = this.yaw;
    const fl = this.selected ? F_SEL : 0, hv = this.hovered ? (this.faction === 'veyr' ? F_HOVER : F_ENEMY) : 0;
    this.fx.flag.value = 1 + fl + hv;
    this.fx.flash.value = Math.max(0, this.fx.flash.value - dt * 4);
    if (!animate) return;
    let state: AnimState = 'idle';
    const sp = Math.hypot(this.vx, this.vz);
    if (this.dead) state = 'dead';
    else if (this.stunT > 0) state = 'stunned';
    else if (this.atkAnim >= 0) state = 'attack';
    else if (this.mind === 'eat') state = 'eat';
    else if (this.canFly && (sp > 0.3 || this.air > 0.2)) state = 'fly';
    else if (sp > 0.08) state = 'move';
    let lookYaw = 0;
    const tg = this.target ? w.get(this.target) : null;
    if (tg && !this.dead) lookYaw = wrapA(Math.atan2(tg.x - this.x, tg.z - this.z) - this.yaw);
    else if (this.target === GOLEM && GOLEM_REF.g && !this.dead) lookYaw = wrapA(Math.atan2(GOLEM_REF.g.x - this.x, GOLEM_REF.g.z - this.z) - this.yaw);
    this.anim.update(dt, { speed: sp / s, turn: this.turnRate, state, act: Math.max(0, this.atkAnim), lookYaw, lookPitch: 0, ground: (x, z) => w.surfaceYsmooth(x, z), air: 0.9 + Math.sin(this.anim.t * 2) * 0.15 });
  }

  /** melee strike resolution (called when the attack animation peaks) */
  strike(w: World, o: Creature) {
    if (o.dead) return;
    const st = this.st;
    const dmg = st.attack * (0.6 + 0.4 * this.growth) * (0.85 + Math.random() * 0.3);
    w.damage(o, dmg, this);
    if (st.poison > 0) o.poison = Math.max(o.poison, st.poison * 2);
    if (o.st.reflect > 0) w.damage(this, dmg * o.st.reflect, o);
  }

  dispose() { this.mesh.removeFromParent(); (this.mesh.material as THREE.Material).dispose(); this.mesh.skeleton.dispose(); }
}
