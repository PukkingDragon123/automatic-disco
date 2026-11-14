// Ordnance for the faction war: rifle and machine-gun tracers (visual; the hit is resolved when fired), cannon
// shells on a flat arc, rocket salvos that wobble and trail smoke, and artillery rounds lobbed high from emplacements.
// Shells burst with splash damage to everything hostile to the firer (and a little to the ground cover).
import * as THREE from 'three';
import type { Factions } from './index';
import type { FactionId } from './plan';
import { vfx2d } from '../vfx2d';
import { sfx } from '../../audio/audio';
import { clamp } from '../../core/rand';

type SKind = 'shell' | 'rocket' | 'arty';
interface Shell { k: SKind; x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; delay: number; dmg: number; splash: number; f: FactionId; from: any; tx: number; ty: number; tz: number; life: number }
interface Tracer { a: [number, number, number]; b: [number, number, number]; delay: number; f: FactionId }
const _c = new THREE.Color();
const TRACER_COL: Record<FactionId, number> = { soviet: 0xffb070, prc: 0xffd890, expedition: 0xfff0c0 };

export class Shells {
  private list: Shell[] = [];
  private tracers: Tracer[] = [];
  constructor(private F: Factions) {}

  /** launch a round at a point; arty lobs high, shells fly flat, rockets in between */
  fire(k: SKind, x: number, y: number, z: number, tx: number, ty: number, tz: number, dmg: number, splash: number, f: FactionId, from: any, delay = 0) {
    const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1;
    const speed = k === 'arty' ? 15 : k === 'rocket' ? 18 : 30;
    const g = k === 'arty' ? 14 : k === 'rocket' ? 3 : 4;
    const T = d / speed * (k === 'arty' ? 1.6 : 1);
    // ballistic: reach (tx, ty, tz) in T seconds under gravity g
    const vy = (ty - y + 0.5 * g * T * T) / T;
    this.list.push({ k, x, y, z, vx: dx / T, vy, vz: dz / T, t: 0, delay, dmg, splash, f, from, tx, ty, tz, life: T + 2 });
  }
  /** a visual tracer from a to b */
  tracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, f: FactionId, delay = 0) {
    if (delay > 0) { this.tracers.push({ a: [ax, ay, az], b: [bx, by, bz], delay, f }); return; }
    this.emitTracer(ax, ay, az, bx, by, bz, f);
  }
  private emitTracer(ax: number, ay: number, az: number, bx: number, by: number, bz: number, f: FactionId) {
    const fx = this.F.g.fx;
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz) || 1, sp = 70;
    _c.setHex(TRACER_COL[f]).multiplyScalar(2.2);
    fx.glow.emit(ax, ay, az, (dx / d) * sp, (dy / d) * sp, (dz / d) * sp, _c, 1, 2.6, d / sp, 0, 0);
    fx.glow.emit(ax - (dx / d) * 0.3, ay - (dy / d) * 0.3, az - (dz / d) * 0.3, (dx / d) * sp, (dy / d) * sp, (dz / d) * sp, _c, 0.6, 1.8, d / sp, 0, 0);
  }
  /** a muzzle flash */
  flash(x: number, y: number, z: number, s = 1) {
    this.F.g.fx.burst(x, y, z, Math.round(3 + s * 3), 0xffc070, { glow: true, speed: 1.2 * s, up: 0.4, size: 2.6 * s, life: 0.09, grav: 0 });
  }
  update(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.delay -= dt;
      if (t.delay <= 0) { this.emitTracer(...t.a, ...t.b, t.f); this.tracers.splice(i, 1); }
    }
    const F = this.F, R = F.g.region, fx = F.g.fx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (s.delay > 0) { s.delay -= dt; continue; }
      const g = s.k === 'arty' ? 14 : s.k === 'rocket' ? 3 : 4;
      s.t += dt;
      s.vy -= g * dt;
      if (s.k === 'rocket') { s.vx += (Math.random() - 0.5) * dt * 6; s.vz += (Math.random() - 0.5) * dt * 6; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      // trail
      _c.setHex(s.k === 'rocket' ? 0xffa050 : 0xffd090).multiplyScalar(2);
      fx.glow.emit(s.x, s.y, s.z, 0, 0, 0, _c, 1, s.k === 'arty' ? 4.5 : 3.2, 0.06, 0, 0);
      if (s.k !== 'shell' && Math.random() < dt * 30) fx.matter.emit(s.x, s.y, s.z, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, _c.setHex(0x8a8580), 0.7, s.k === 'arty' ? 7 : 5, 0.9, -0.4, 1);
      const gx = clamp(s.x, 0, R.N - 0.01), gz = clamp(s.z, 0, R.N - 0.01);
      const ground = F.g.world.surfaceY(gx, gz);
      const near = Math.hypot(s.x - s.tx, s.z - s.tz) < 0.5 && Math.abs(s.y - s.ty) < 1.2;
      if (s.y <= ground || near || s.t > s.life || s.x < 0 || s.z < 0 || s.x > R.N || s.z > R.N) {
        this.list.splice(i, 1);
        this.burst(s, Math.max(s.y, ground));
      }
    }
  }
  private burst(s: Shell, y: number) {
    const F = this.F;
    F.boom.explode(s.x, y + 0.2, s.z, s.k === 'arty' ? 1.5 : s.splash * 0.7, s.f);
    F.eachHostileIn(s.x, s.z, s.splash, s.f, (ref, d) => F.hit(ref, s.dmg * (1 - (d / s.splash) * 0.6), s.from));
    F.g.world.flora.impulse?.(s.x, s.z, s.splash + 1, s.k === 'arty' ? 2.2 : 1.2);
    if (s.k === 'arty') { vfx2d.play('shock', s.x, y + 0.1, s.z, { flat: true, scale: 1.4 }); F.g.cam.shake(0.18 * F.g.audible(s.x, s.z), 0.3); }
    sfx('crack', s.k === 'arty' ? 0.6 : 1, F.g.audible(s.x, s.z) * (s.k === 'arty' ? 0.7 : 0.45));
  }
  clear() { this.list.length = 0; this.tracers.length = 0; }
}
