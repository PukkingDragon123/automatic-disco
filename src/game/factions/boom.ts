// Things breaking: fireballs, smoke columns, burning wrecks and riveted plates flung off a structure (real chunks
// that tumble, bounce, settle and smoulder before they fade into the ground).
import * as THREE from 'three';
import type { Factions } from './index';
import type { FactionId } from './plan';
import { Kit, LIVERY, sharedBody } from './livery';
import { vfx2d } from '../vfx2d';
import { sfx } from '../../audio/audio';
import { clamp } from '../../core/rand';

interface Chunk { m: THREE.Mesh; vx: number; vy: number; vz: number; wx: number; wy: number; wz: number; t: number; life: number; rest: boolean }
interface Fire { x: number; y: number; z: number; r: number; t: number; life: number; k: number }
const GEO = new Map<string, THREE.BufferGeometry[]>();
const _c = new THREE.Color();

function chunkGeos(f: FactionId): THREE.BufferGeometry[] {
  let g = GEO.get(f);
  if (g) return g;
  const L = LIVERY[f];
  g = [L.hull, L.hull2, L.metal, L.dark].map((col, i) => {
    const k = new Kit();
    if (i === 2) { k.cyl(0.18, 0.18, 0.9, [0, 0, 0], col, 6, [0, 0, Math.PI / 2]); }
    else { k.box(0.8 - i * 0.12, 0.08, 0.55, [0, 0, 0], col, [0, 0, 0.05 * i]); k.rivetRow([-0.3, 0.05, 0.2], [0.3, 0.05, 0.2], 4, L.trim, 0.04); }
    return k.build().body;
  });
  GEO.set(f, g);
  return g;
}

export class Boom {
  private chunks: Chunk[] = [];
  private fires: Fire[] = [];
  constructor(private F: Factions) {}

  /** a fireball with smoke, grit and sparks; size ~1 is a shell, 3 a fuel depot */
  explode(x: number, y: number, z: number, size: number, f: FactionId = 'soviet') {
    const fx = this.F.g.fx;
    fx.burst(x, y, z, Math.round(10 + size * 14), 0xffa040, { glow: true, speed: 2.2 * size, up: 2 * size, size: 4 + size * 2.2, life: 0.35 + size * 0.1, grav: -1 });
    fx.burst(x, y, z, Math.round(6 + size * 10), 0xffe0a0, { glow: true, speed: 4 * size, up: 3 * size, size: 2, life: 0.45, grav: 8 });
    fx.burst(x, y, z, Math.round(8 + size * 12), 0x5a5048, { speed: 2.5 * size, up: 3.5 * size, size: 4 + size * 2, life: 0.9 + size * 0.3, grav: 6 });
    vfx2d.play('impact', x, y + 0.2 * size, z, { scale: 0.7 + size * 0.6 });
    vfx2d.play('smoke', x, y + 0.4 * size, z, { scale: 0.8 + size * 0.7, vel: [0, 0.8, 0], delay: 0.15 });
    if (size > 1.2) { vfx2d.play('dust', x, this.F.g.world.surfaceY(x, z) + 0.1, z, { scale: size * 1.2 }); this.F.g.world.flora.impulse?.(x, z, size * 2.5, Math.min(3, size)); }
    sfx('crack', clamp(1.4 - size * 0.25, 0.4, 1.4), this.F.g.audible(x, z) * clamp(0.3 + size * 0.2, 0.3, 1));
    if (size > 1.5) sfx('hit', 0.4, this.F.g.audible(x, z) * 0.6);
    void f;
  }
  smoke(x: number, y: number, z: number, s = 1) { vfx2d.play('smoke', x + (Math.random() - 0.5) * s, y, z + (Math.random() - 0.5) * s, { scale: 0.6 + s * 0.6, vel: [0.25, 0.9 + s * 0.3, 0.1], speed: 0.7 }); }
  /** a burning patch: flames and a smoke column for `life` seconds */
  fire(x: number, y: number, z: number, r: number, life: number, k = 1) { this.fires.push({ x, y, z, r, t: 0, life, k }); }
  /** riveted plates and pipe ends thrown off */
  debris(x: number, y: number, z: number, n: number, f: FactionId, size = 0.5) {
    const geos = chunkGeos(f), mat = sharedBody('debris');
    for (let i = 0; i < n && this.chunks.length < 90; i++) {
      const m = new THREE.Mesh(geos[i % geos.length], mat);
      const s = size * (0.6 + Math.random() * 0.8);
      m.scale.setScalar(s); m.castShadow = true;
      m.position.set(x + (Math.random() - 0.5) * size * 2, y, z + (Math.random() - 0.5) * size * 2);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 5 * Math.sqrt(size + 0.2);
      this.F.g.world.scene.add(m);
      this.chunks.push({ m, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 6, vz: Math.sin(a) * sp, wx: (Math.random() - 0.5) * 12, wy: (Math.random() - 0.5) * 12, wz: (Math.random() - 0.5) * 12, t: 0, life: 14 + Math.random() * 8, rest: false });
    }
  }
  update(dt: number) {
    const F = this.F, w = F.g.world, R = F.g.region, fx = F.g.fx;
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i]; c.t += dt;
      const p = c.m.position;
      if (!c.rest) {
        c.vy -= 16 * dt;
        p.x += c.vx * dt; p.y += c.vy * dt; p.z += c.vz * dt;
        c.m.rotation.x += c.wx * dt; c.m.rotation.y += c.wy * dt; c.m.rotation.z += c.wz * dt;
        const gy = w.surfaceY(clamp(p.x, 0, R.N - 0.01), clamp(p.z, 0, R.N - 0.01)) + 0.04 * c.m.scale.x;
        if (p.y <= gy) {
          p.y = gy;
          if (Math.abs(c.vy) < 2.5) { c.rest = true; c.m.rotation.x = Math.round(c.m.rotation.x / Math.PI) * Math.PI + (Math.random() - 0.5) * 0.3; c.m.rotation.z = (Math.random() - 0.5) * 0.3; }
          else { c.vy *= -0.35; c.vx *= 0.5; c.vz *= 0.5; c.wx *= 0.5; c.wz *= 0.5; if (Math.random() < 0.5) vfx2d.play('dust', p.x, gy, p.z, { scale: 0.3 }); }
        }
        if (Math.random() < dt * 12) fx.matter.emit(p.x, p.y, p.z, 0, 0.4, 0, _c.setHex(0x6a6058), 0.6, 4, 0.6, -0.3, 1);
      } else if (c.t < 6 && Math.random() < dt * 0.8) this.smoke(p.x, p.y + 0.1, p.z, 0.2);
      if (c.t > c.life) p.y -= dt * 0.15;
      if (c.t > c.life + 3) { c.m.removeFromParent(); this.chunks.splice(i, 1); }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]; f.t += dt;
      const fade = clamp(1 - (f.t - f.life * 0.7) / (f.life * 0.3), 0, 1) * f.k;
      if (f.t > f.life) { this.fires.splice(i, 1); continue; }
      if (!F.visible(f.x, f.z)) continue;
      const n = dt * 26 * fade * f.r;
      for (let k = 0; k < n || (k === 0 && Math.random() < n); k++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * f.r;
        _c.setHex(Math.random() < 0.3 ? 0xffd070 : 0xff7a30).multiplyScalar(1.8);
        fx.glow.emit(f.x + Math.cos(a) * rr, f.y + Math.random() * 0.3, f.z + Math.sin(a) * rr, (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 1.6, (Math.random() - 0.5) * 0.4, _c, 1, 3 + Math.random() * 3 * f.r, 0.35 + Math.random() * 0.4, -1.5, 1.5);
      }
      if (Math.random() < dt * 2.2 * fade) this.smoke(f.x, f.y + 0.6 + f.r * 0.5, f.z, f.r * 0.8);
    }
  }
  clear() { for (const c of this.chunks) c.m.removeFromParent(); this.chunks.length = 0; this.fires.length = 0; }
}
