// The living geology, ticked by the game: geysers erupting on their timers (a boiling, rumbling pool for a few seconds
// first, then a column of water and steam, scalding anything standing at the vent and throwing it about), hot pools
// that scald whatever wades in, steam vents hissing, mist rising from the plunge pools under the big waterfalls. The
// effects are the hand-drawn pixel sprites of game/vfx2d.ts. Wiring (game.ts): `this.geo = new GeoLive(region)`, then
// each frame `this.geo.update(simDt, this, cam.position)`; AI can ask `geo.hazardAt(x, z)` (0 safe .. 1 deadly now)
// to keep clear, and the game hears 'geyser' {x, z, phase: 'warn' | 'erupt'} through game.emit.
import * as THREE from 'three';
import { vfx2d } from '../../game/vfx2d';
import { geyserState } from './springs';
import type { Region, Spring } from '../region';

const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);

/** what GeoLive needs from the game (duck-typed so the world layer stays free of game imports) */
export interface GeoHost {
  world?: {
    time: number;
    near(x: number, z: number, r: number, fn: (c: { x: number; z: number; dead?: boolean; stunT?: number; vx?: number; vz?: number }) => void): void;
    damage(c: unknown, amount: number, by: null): void;
  };
  /** the golem: hurt through `hazard(amt, why)` if it has one, else its hull is docked directly */
  player?: { x: number; z: number; alive?: boolean; hull?: number; vx?: number; vz?: number; hazard?: (amt: number, why: string) => void };
  emit?(ev: string, data: unknown): void;
}

export class GeoLive {
  private t = 0;
  private last: number[];
  private ticks: number[];
  private ventT: number[];
  private mistT = 0;
  constructor(readonly R: Region) {
    this.last = R.springs.map(() => 0);
    this.ticks = R.springs.map(() => 0);
    this.ventT = R.vents.map((_, i) => (i * 0.37) % 1.5);
  }

  /** danger at a point right now: an erupting geyser's reach, a boiling vent, a scalding pool (0..1) */
  hazardAt(x: number, z: number): number {
    let k = 0;
    for (const s of this.R.springs) {
      const d = hyp(x - s.x, z - s.z);
      if (s.kind === 'geyser') { const st = geyserState(s, this.t); if (d < 3.2) k = Math.max(k, st > 0 ? st : st < 0 ? 0.4 : 0.15); }
      else if (s.kind === 'hot' && d < s.r) k = Math.max(k, 0.5);
    }
    return k;
  }

  update(dt: number, host: GeoHost, cam?: THREE.Vector3) {
    if (dt <= 0) return;
    const R = this.R;
    this.t = host.world?.time ?? this.t + dt;
    const near = (x: number, z: number, d: number) => !cam || (cam.x - x) ** 2 + (cam.z - z) ** 2 < d * d;
    R.springs.forEach((s, i) => {
      if (s.kind === 'geyser') this.geyser(s, i, dt, host, near(s.x, s.z, 110));
      else if (s.kind === 'hot') this.pool(s, i, dt, host, near(s.x, s.z, 70));
    });
    // steam vents
    R.vents.forEach((v, i) => {
      this.ventT[i] -= dt;
      if (this.ventT[i] > 0) return;
      this.ventT[i] = 0.9 + ((i * 0.618 + this.t * 0.13) % 1) * 1.8;
      if (!near(v.x, v.z, 80)) return;
      vfx2d.play('smoke', v.x, v.y + 0.2, v.z, { ramp: 'snow', scale: 0.8 + v.k * 0.7, vel: [0, 1.2 + v.k, 0], drag: 0.6, emit: 0.1 });
    });
    // mist over the plunge pools of the big falls
    this.mistT -= dt;
    if (this.mistT <= 0) {
      this.mistT = 0.35;
      for (const f of R.falls) {
        const drop = f.top - f.bottom; if (drop < 2.2) continue;
        const x = f.x + f.dir[0] * (f.w * 0.5 + 0.8), z = f.z + f.dir[1] * (f.w * 0.5 + 0.8);
        if (!near(x, z, 60)) continue;
        const a = this.t * 2.3 + x;
        vfx2d.play('smoke', x + Math.cos(a) * f.w * 0.4, f.bottom + 0.3, z + Math.sin(a) * f.w * 0.4, { ramp: 'sky', scale: 0.7 + Math.min(1.2, drop * 0.12), vel: [f.dir[0] * 0.8, 0.6, f.dir[1] * 0.8], drag: 0.8, emit: 0 });
        if (drop > 3.5) vfx2d.play('splash', x, f.bottom + 0.1, z, { ramp: 'water', scale: 0.9, emit: 0 });
      }
    }
  }

  private geyser(s: Spring, i: number, dt: number, host: GeoHost, seen: boolean) {
    const st = geyserState(s, this.t), was = this.last[i];
    this.last[i] = st;
    const jet = s.jet ?? 8;
    if (st < 0 && was >= 0) host.emit?.('geyser', { x: s.x, z: s.z, phase: 'warn' });
    if (st > 0 && was <= 0) {
      host.emit?.('geyser', { x: s.x, z: s.z, phase: 'erupt' });
      if (seen) {
        vfx2d.play('shock', s.x, s.level + 0.05, s.z, { flat: true, ramp: 'snow', scale: 2.2, emit: 0 });
        vfx2d.drops(s.x, s.level + 1, s.z, 14, { speed: 6, up: 10, ramp: 'water', land: 'splash', spread: 1.2 });
      }
    }
    this.ticks[i] -= dt;
    if (seen && this.ticks[i] <= 0) {
      if (st > 0) {
        // the column: water bursts climbing to the jet's height, steam billowing off its top and drifting
        this.ticks[i] = 0.06;
        const h = jet * st * (0.55 + 0.45 * Math.sin(this.t * 7.1 + i));
        for (let k = 0; k < 2; k++) {
          const y = s.level + h * (k ? 0.85 + 0.15 * Math.sin(this.t * 3 + k) : 0.15 + 0.6 * ((this.t * 3.7 + i) % 1));
          vfx2d.play('splash', s.x + Math.sin(this.t * 13 + k) * 0.25, y, s.z + Math.cos(this.t * 11 + k) * 0.25, { ramp: 'water', scale: 1.1 + st * 0.9, vel: [0, 3 + st * 4, 0], grav: 9, emit: 0 });
        }
        vfx2d.play('smoke', s.x, s.level + h * 0.9, s.z, { ramp: 'snow', scale: 2 + st * 1.6, vel: [Math.sin(this.t) * 0.6, 1.6, Math.cos(this.t * 0.7) * 0.6], drag: 0.5, emit: 0.05 });
      } else if (st < 0) {
        // boiling: the pool surges and steams before it goes
        this.ticks[i] = 0.25;
        vfx2d.play('ripple', s.x, s.level + 0.02, s.z, { flat: true, ramp: 'water', scale: 0.8 - st * 0.8, emit: 0 });
        vfx2d.play('smoke', s.x, s.level + 0.3, s.z, { ramp: 'snow', scale: 0.9 - st * 0.8, vel: [0, 1.2, 0], drag: 0.6, emit: 0 });
      } else {
        this.ticks[i] = 2.2;
        vfx2d.play('smoke', s.x, s.level + 0.2, s.z, { ramp: 'snow', scale: 0.7, vel: [0, 0.8, 0], drag: 0.7, emit: 0 });
      }
    }
    // the hazard: scalding water and a blast that throws things off the vent
    if (st > 0.15) {
      const reach = 2.6, dps = 26 * st;
      host.world?.near(s.x, s.z, reach, (c) => {
        if (c.dead) return;
        host.world!.damage(c, dps * dt, null);
        c.stunT = Math.max(c.stunT ?? 0, 0.4);
        const dx = c.x - s.x, dz = c.z - s.z, dl = hyp(dx, dz) || 1;
        if (c.vx !== undefined && c.vz !== undefined) { c.vx += (dx / dl) * 9 * dt; c.vz += (dz / dl) * 9 * dt; }
      });
      const p = host.player;
      if (p && p.alive !== false && hyp(p.x - s.x, p.z - s.z) < reach) {
        const amt = dps * 0.25 * dt;
        if (p.hazard) p.hazard(amt, 'geyser'); else if (p.hull !== undefined) p.hull = Math.max(0.5, p.hull - amt);
        const dx = p.x - s.x, dz = p.z - s.z, dl = hyp(dx, dz) || 1;
        if (p.vx !== undefined && p.vz !== undefined) { p.vx += (dx / dl) * 6 * dt; p.vz += (dz / dl) * 6 * dt; }
      }
    }
  }

  private pool(s: Spring, i: number, dt: number, host: GeoHost, seen: boolean) {
    this.ticks[i] -= dt;
    if (seen && this.ticks[i] <= 0) {
      this.ticks[i] = 1.4 + (i % 3) * 0.5;
      vfx2d.play('smoke', s.x + Math.sin(this.t + i) * s.r * 0.4, s.level + 0.15, s.z + Math.cos(this.t * 1.3 + i) * s.r * 0.4, { ramp: 'snow', scale: 0.6 + s.r * 0.35, vel: [0, 0.7, 0], drag: 0.7, emit: 0 });
    }
    // scalding water: anything wading in it is hurt (the golem's plating shrugs most of it off)
    host.world?.near(s.x, s.z, s.r, (c) => { if (!c.dead) host.world!.damage(c, 3.5 * dt, null); });
  }
}
