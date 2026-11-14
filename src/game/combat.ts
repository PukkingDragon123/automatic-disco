// Real-time combat pieces the player drives: which field powers the skill tree has unlocked, loose stones and
// boulders that can be picked up and thrown (gravity arcs, bounces, rolls, hits by mass and speed, shrapnel bursts),
// resource nuggets that pop out of the ground and fly into the golem, knockback, and the one routine every blow
// goes through (damage, hit flash, blood, knockback, anger, numbers, kill attribution).
import * as THREE from 'three';
import type { Game } from './game';
import type { Creature } from './creature';
import { ABILITIES, type Ability } from './hive';
import type { Res } from './skills';
import { fluidOf, type Gore } from './gore';
import { gbuf } from '../gfx/gbuf';
import { clamp, hash01 } from '../core/rand';
import { makeRamp, mixHex } from '../limbo/gfx/pixel';
import { Noise } from '../core/noise';
import { sfx } from '../audio/audio';
import { floatText } from '../ui/floatText';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ field powers gated by the skill tree
/** the skill that unlocks each field power (null: no skill grants it, so it never shows) */
export const ABILITY_SKILL: Record<Ability, string | null> = { pull: 'lift', pulse: 'slam', repel: 'repulse', lode: 'well', shape: 'shape', storm: 'storm', snare: 'graft', lance: null, bloom: null };
let SK: { has(id: string): boolean } | null = null;
/** the skills the wheel and the casting code check (bound by the player when a game starts) */
export function bindSkills(s: { has(id: string): boolean } | null) { SK = s; }
/** owned by the golem? (true everywhere when no game is bound, e.g. a UI test page) */
export function powerOwned(a: Ability) { if (!SK) return true; const id = ABILITY_SKILL[a]; return !!id && SK.has(id); }
/** charge a field power really costs (the Field Amplifier takes a quarter off) */
export function powerCost(a: Ability) { return ABILITIES[a].charge * (SK?.has('amp') ? 0.75 : 1); }

// ------------------------------------------------------------------ hand-drawn 2D effects (game/vfx2d.ts, the details layer)
/** resolved at build time: an empty map until vfx2d.ts exists, then its exports (Vite re-resolves when it appears) */
const VFX = import.meta.glob('./vfx2d.ts', { eager: true }) as Record<string, Record<string, unknown>>;
export type Vfx2dKind = 'impact' | 'star' | 'dust' | 'splash' | 'slash' | 'smear' | 'splat';
/** play a hand-drawn sprite effect if the vfx2d library is present; false when it isn't (callers keep their particles).
 *  Expected export: vfx2d(game, kind, x, y, z, { dir?: [x, z], size?, col? }) (play / spawn accepted too) */
export function vfx2d(game: Game, kind: Vfx2dKind, x: number, y: number, z: number, o: { dir?: [number, number]; size?: number; col?: number } = {}): boolean {
  const m = VFX['./vfx2d.ts']; if (!m) return false;
  const f = (m.vfx2d ?? m.play ?? m.spawn) as ((...a: unknown[]) => unknown) | undefined;
  if (typeof f !== 'function') return false;
  try { f(game, kind, x, y, z, o); return true; } catch { return false; }
}

// ------------------------------------------------------------------ stone art
/** a 32 px tile of the planet's own stone: grain, a crack or two, a lit top edge */
function stoneTex(base: number, seed: number) {
  const N = 32, d = new Uint8Array(N * N * 4), R = makeRamp(base, 7, { spread: 0.6, hueShift: 0.02 });
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const g = hash01(x, y, seed), b = hash01(x >> 2, y >> 2, seed + 1), c = hash01(x >> 3, y >> 3, seed + 2);
    let k = 3.2 + (g - 0.5) * 1.2 + (b - 0.5) * 1.3 + (c - 0.5) * 0.8;
    const crack = Math.abs(((x * 0.6 + y + Math.sin(y * 0.4 + seed) * 3) % 13) - 6.5) < 0.6 && hash01(x >> 3, y >> 3, seed + 5) < 0.45;
    if (crack) k -= 2.2;
    if ((x + y) % 4 === 0 && g < 0.08) k += 1.6;
    const bay = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(y & 3) * 4 + (x & 3)] / 16 - 0.47;
    const col = R[clamp(Math.round(k + bay * 0.6), 0, R.length - 1)];
    const i = (y * N + x) * 4; d[i] = (col >> 16) & 255; d[i + 1] = (col >> 8) & 255; d[i + 2] = col & 255; d[i + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
/** a lumpy faceted unit stone with box-projected UVs (texel density close to the terrain's) */
function stoneGeo(seed: number) {
  const nz = new Noise(seed), g = new THREE.IcosahedronGeometry(1, 1), P = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  const flat = 0.62 + hash01(seed, 1) * 0.3;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).normalize();
    const r = 1 + nz.fbm3(v.x * 1.7, v.y * 1.7, v.z * 1.7, 2) * 0.42;
    P.setXYZ(i, v.x * r * (1 + hash01(seed, 2) * 0.3), v.y * r * flat, v.z * r);
  }
  const ng = g.toNonIndexed(); g.dispose();
  ng.computeVertexNormals();
  const Pn = ng.attributes.position, Nn = ng.attributes.normal, uv: number[] = [];
  for (let i = 0; i < Pn.count; i++) {
    const ax = Math.abs(Nn.getX(i)), ay = Math.abs(Nn.getY(i)), az = Math.abs(Nn.getZ(i));
    const [a, b] = ax >= ay && ax >= az ? [Pn.getZ(i), Pn.getY(i)] : ay >= az ? [Pn.getX(i), Pn.getZ(i)] : [Pn.getX(i), Pn.getY(i)];
    uv.push(a * 0.35 + 0.5, b * 0.35 + 0.5);
  }
  ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return ng;
}

// ------------------------------------------------------------------ stones
export type StoneState = 'rest' | 'fly' | 'held' | 'sink';
export interface Stone {
  p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; w: THREE.Vector3; r: number; m: number; big: boolean; state: StoneState; variant: number;
  thrown: boolean; frag: boolean; hit: Set<Creature>; t: number; burst: boolean; restT: number; tint: number;
}
const VARIANTS = 4, STONE_CAP = 170;

export class Stones {
  list: Stone[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private respawnT = 4;
  /** a thrown stone hit a creature at speed sp */
  onHit: ((s: Stone, c: Creature, sp: number) => void) | null = null;
  /** the golem's position (stones keep a supply near it) */
  near: (() => THREE.Vector3) | null = null;
  constructor(readonly game: Game) {
    const pal = game.region.pal;
    const mat = new THREE.MeshLambertMaterial({ map: stoneTex(mixHex(pal.rock, 0x8a8478, 0.25), game.region.seed % 97), flatShading: true });
    gbuf(mat, 1);
    for (let i = 0; i < VARIANTS; i++) {
      const m = new THREE.InstancedMesh(stoneGeo(game.region.seed * 13 + i * 71), mat, STONE_CAP);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(STONE_CAP * 3), 3);
      m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      game.world.scene.add(m); this.meshes.push(m);
    }
    this.scatter();
  }
  /** loose stones around rock formations, on pebble beds and gravel, and a few big boulders */
  private scatter() {
    const R = this.game.region, N = R.N;
    let s = R.seed * 7 + 3;
    const h = () => hash01(s++, 7, 11);
    for (const p of R.rocks) {
      if (this.list.length > 110) break;
      if (p.kind === 'pebble' || p.kind === 'river') { if (h() < 0.45) this.place(p.x + (h() - 0.5) * 0.6, p.z + (h() - 0.5) * 0.6, rnd(0.055, 0.1)); continue; }
      if (p.kind === 'log' || p.kind === 'stump') continue;
      const n = 1 + Math.floor(h() * 3), rr = Math.max(p.sx, p.sz);
      for (let k = 0; k < n; k++) { const a = h() * 6.283, d = rr + 0.25 + h() * 1.4; this.place(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, rnd(0.055, 0.11)); }
      if (h() < 0.22) { const a = h() * 6.283, d = rr + 0.6 + h() * 1.5; this.place(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, rnd(0.16, 0.22), true); }
    }
    for (let t = 0; t < 400 && this.list.length < 140; t++) {
      const x = 3 + h() * (N - 6), z = 3 + h() * (N - 6);
      if (R.isWater(x, z) || R.isSolid(x, z)) continue;
      this.place(x, z, h() < 0.12 ? rnd(0.16, 0.21) : rnd(0.055, 0.1), undefined);
    }
    // a handful right by the landing site so the very first throw is close at hand
    const L = R.landing;
    for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.283 + 0.4, d = 2.8 + h() * 2.5; this.place(L.x + Math.cos(a) * d, L.z + Math.sin(a) * d, k === 3 ? 0.19 : rnd(0.06, 0.09), k === 3); }
  }
  /** drop a resting stone on the ground at x,z (skips water and solid rock) */
  place(x: number, z: number, r: number, big = r > 0.14): Stone | null {
    const R = this.game.region;
    if (x < 1 || z < 1 || x > R.N - 1 || z > R.N - 1 || R.isWater(x, z) || R.isSolid(x, z)) return null;
    const s = this.make(x, R.heightAt(x, z) + r * 0.55, z, r, big);
    if (s) s.state = 'rest';
    return s;
  }
  make(x: number, y: number, z: number, r: number, big = r > 0.14): Stone | null {
    if (this.list.length >= STONE_CAP * VARIANTS * 0.25 + 100) { const i = this.list.findIndex((s) => s.state === 'rest' && s.frag); if (i < 0) return null; this.list.splice(i, 1); }
    const s: Stone = {
      p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 6.3), rnd(0, 6.3), rnd(0, 6.3))), w: new THREE.Vector3(),
      r, m: big ? 2.2 * (r / 0.1) ** 3 : 0.8 + (r / 0.08) ** 3, big, state: 'fly', variant: Math.floor(Math.random() * VARIANTS), thrown: false, frag: false, hit: new Set(), t: 0, burst: false, restT: 0,
      tint: 0.85 + Math.random() * 0.3,
    };
    this.list.push(s);
    return s;
  }
  /** nearest stone the golem could take (not held, not sinking) */
  nearest(x: number, z: number, maxD: number, ok: (s: Stone) => boolean = () => true): Stone | null {
    let best: Stone | null = null, bd = maxD * maxD;
    for (const s of this.list) {
      if (s.state === 'held' || s.state === 'sink' || !ok(s)) continue;
      const d = (s.p.x - x) ** 2 + (s.p.z - z) ** 2 - s.r * s.r;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  /** launch a stone from p toward target: a gravity arc that lands on it (or falls short at max speed) */
  launch(s: Stone, from: THREE.Vector3, target: THREE.Vector3, o: { maxH?: number; burst?: boolean } = {}) {
    s.state = 'fly'; s.thrown = true; s.burst = !!o.burst; s.hit.clear(); s.t = 0;
    s.p.copy(from);
    const dx = target.x - from.x, dz = target.z - from.z, d = Math.hypot(dx, dz) || 0.01;
    const vh = clamp(d * 2.4, 5, o.maxH ?? 14), T = d / vh, g = 18;
    const vy = clamp((target.y - from.y + 0.5 * g * T * T) / T, -2, 9);
    s.v.set((dx / d) * vh, vy, (dz / d) * vh);
    s.w.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(8, 16) / (s.big ? 2 : 1));
  }
  update(dt: number) {
    const G = this.game, R = G.region, w = G.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.t += dt;
      if (s.state === 'held' || s.state === 'rest') continue;
      if (s.state === 'sink') { s.p.y -= dt * 0.4; if (s.t > 2.5) this.list.splice(i, 1); continue; }
      // flight
      s.v.y -= 18 * dt;
      const nx = s.p.x + s.v.x * dt, nz = s.p.z + s.v.z * dt;
      // bounce off rock formations and the map edge
      if (R.isSolid(nx, nz) || nx < 0.6 || nz < 0.6 || nx > R.N - 0.6 || nz > R.N - 0.6) {
        if (R.isSolid(nx, s.p.z) || nx < 0.6 || nx > R.N - 0.6) s.v.x *= -0.4; else s.v.z *= -0.4;
        if (s.v.lengthSq() > 9) { G.fx.burst(s.p.x, s.p.y, s.p.z, 5, 0xb8a890, { speed: 1.5, up: 1, size: 2, life: 0.4 }); sfx('crack', 1.6, 0.25 * G.audible(s.p.x, s.p.z)); }
        if (s.burst && !s.frag) this.shatter(s);
      } else { s.p.x = nx; s.p.z = nz; }
      s.p.y += s.v.y * dt;
      _q.setFromAxisAngle(_v.copy(s.w).normalize(), s.w.length() * dt); s.q.premultiply(_q);
      const sp = s.v.length();
      // creatures in its path
      if (s.thrown && sp > 3) {
        w.near(s.p.x, s.p.z, s.r + 2.5, (c) => {
          if (c.dead || c.faction === 'veyr' || s.hit.has(c)) return;
          const h = c.sp.pheno.height * c.growth, cy = c.y + c.air + h * 0.45;
          const dx = c.x - s.p.x, dz = c.z - s.p.z, dy = clamp(s.p.y - cy, -h * 0.5, h * 0.5) - (s.p.y - cy);
          if (dx * dx + dz * dz + dy * dy > (s.r + c.radius * 0.95) ** 2) return;
          s.hit.add(c);
          this.onHit?.(s, c, sp);
          // it rebounds off the body
          s.v.x *= -0.25; s.v.z *= -0.25; s.v.y = Math.max(s.v.y, 2.5);
          if (s.burst && !s.frag) this.shatter(s);
        });
      }
      // ground
      const gy = R.surfaceY(clamp(s.p.x, 0, R.N - 0.01), clamp(s.p.z, 0, R.N - 0.01)), bottom = s.p.y - s.r * 0.55;
      if (bottom <= gy) {
        if (R.isWater(s.p.x, s.p.z)) {
          s.state = 'sink'; s.t = 0;
          vfx2d(G, 'splash', s.p.x, gy, s.p.z, { size: s.r * 6 });
          G.fx.burst(s.p.x, gy + 0.02, s.p.z, 8 + Math.round(s.r * 40), 0xd8f0ff, { speed: 1.2 + s.r * 4, up: 2 + s.r * 6, size: 2.4, life: 0.6 });
          sfx('squelch', 1.8 - s.r * 2, 0.3 * G.audible(s.p.x, s.p.z));
          continue;
        }
        s.p.y = gy + s.r * 0.55;
        if (s.v.y < -2.2) {
          // impact: dust and grit, a crack, a bounce
          const k = Math.min(1, -s.v.y / 10);
          if (k > 0.35) vfx2d(G, 'dust', s.p.x, gy, s.p.z, { size: s.r * 5 * k });
          G.fx.burst(s.p.x, gy + 0.02, s.p.z, 3 + Math.round(k * (s.big ? 18 : 6)), 0x9a8a6a, { speed: 1 + k * 2, up: 0.8 + k, size: 2.4, life: 0.5, grav: 5 });
          if (s.big && k > 0.4) G.cam.shake(0.12 * k, 0.25);
          (G.world.flora as unknown as { impulse?(x: number, z: number, r: number, s: number): void }).impulse?.(s.p.x, s.p.z, s.r * 4 + 0.3, s.big ? 1.2 * k : 0.5 * k);
          sfx(s.big ? 'hit' : 'crack', s.big ? 0.6 : 1.4 + Math.random() * 0.4, (0.25 + k * 0.4) * G.audible(s.p.x, s.p.z));
          if (s.burst && !s.frag) { this.shatter(s); continue; }
          s.v.y = -s.v.y * (s.big ? 0.22 : 0.34); s.v.x *= 0.7; s.v.z *= 0.7; s.w.multiplyScalar(0.7);
        } else {
          // rolling: friction, spin follows the ground speed
          s.v.y = 0;
          const f = Math.exp(-dt * (s.big ? 4.5 : 3));
          s.v.x *= f; s.v.z *= f;
          const hs = Math.hypot(s.v.x, s.v.z);
          s.w.set(s.v.z, 0, -s.v.x).multiplyScalar(1 / Math.max(0.05, s.r));
          if (hs < 0.12) { s.state = 'rest'; s.v.set(0, 0, 0); s.w.set(0, 0, 0); s.thrown = false; s.burst = false; }
        }
      }
      if (s.frag && s.state === 'rest') s.restT = s.t;
    }
    // shrapnel fragments crumble away after a while
    for (let i = this.list.length - 1; i >= 0; i--) { const s = this.list[i]; if (s.frag && s.state === 'rest' && s.t > 25) this.list.splice(i, 1); }
    this.respawn(dt);
    this.draw();
  }
  /** shrapnel: the stone bursts into fragments that fly on and hurt what they hit */
  shatter(s: Stone) {
    const n = s.big ? 8 : 5;
    const sp = Math.max(4, Math.hypot(s.v.x, s.v.z));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.283 + Math.random();
      const f = this.make(s.p.x, s.p.y + 0.05, s.p.z, s.r * rnd(0.32, 0.5), false);
      if (!f) continue;
      f.frag = true; f.thrown = true; f.hit = new Set(s.hit);
      f.v.set(Math.cos(a) * sp * 0.7 + s.v.x * 0.3, rnd(2, 4.5), Math.sin(a) * sp * 0.7 + s.v.z * 0.3);
      f.w.set(rnd(-20, 20), rnd(-20, 20), rnd(-20, 20));
    }
    this.game.fx.burst(s.p.x, s.p.y, s.p.z, 22, 0xc8b898, { speed: 3.5, up: 2.2, size: 2.4, life: 0.5 });
    this.game.fx.burst(s.p.x, s.p.y, s.p.z, 10, 0xffc070, { glow: true, speed: 3, up: 1.5, size: 2, life: 0.25 });
    sfx('crack', 0.9, 0.6 * this.game.audible(s.p.x, s.p.z)); this.game.cam.shake(0.08, 0.2);
    const i = this.list.indexOf(s); if (i >= 0) this.list.splice(i, 1);
  }
  /** keep a few stones around the golem as the map's own get thrown into rivers */
  private respawn(dt: number) {
    this.respawnT -= dt;
    if (this.respawnT > 0 || !this.near) return;
    this.respawnT = 3;
    const p = this.near();
    let n = 0;
    for (const s of this.list) if (!s.frag && (s.p.x - p.x) ** 2 + (s.p.z - p.z) ** 2 < 100) n++;
    if (n >= 7) return;
    for (let t = 0; t < 8; t++) { const a = Math.random() * 6.283, d = rnd(6, 11); if (this.place(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, Math.random() < 0.15 ? rnd(0.16, 0.2) : rnd(0.06, 0.1))) break; }
  }
  private draw() {
    const cnt = new Array(VARIANTS).fill(0);
    for (const s of this.list) {
      const m = this.meshes[s.variant], i = cnt[s.variant]++;
      if (i >= STONE_CAP) continue;
      let sc = s.r;
      if (s.state === 'sink') sc *= Math.max(0.01, 1 - s.t / 2.5);
      if (s.frag && s.t > 22) sc *= Math.max(0.01, (25 - s.t) / 3);
      _m.compose(s.p, s.q, _s.set(sc, sc, sc));
      m.setMatrixAt(i, _m);
      m.setColorAt(i, _c.setScalar(s.tint * (s.state === 'held' ? 1.15 : 1)));
    }
    this.meshes.forEach((m, k) => { m.count = Math.min(STONE_CAP, cnt[k]); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  }
  dispose() { for (const m of this.meshes) { m.removeFromParent(); m.geometry.dispose(); } }
}

// ------------------------------------------------------------------ resource nuggets
export const RES_COL: Record<Res, number> = { ore: 0xd07a3a, carbon: 0x6ab04a, water: 0x5ac8ff, soil: 0x9a6a3a };
interface Nug { res: Res; amt: number; p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; t: number; home: boolean; rest: boolean; life: number }
export class Loot {
  list: Nug[] = [];
  private mesh: THREE.InstancedMesh;
  /** a nugget reached the golem */
  onCollect: ((res: Res, amt: number, p: THREE.Vector3) => void) | null = null;
  constructor(readonly game: Game) {
    const g = new THREE.OctahedronGeometry(1, 0);
    const m = new THREE.MeshLambertMaterial({ flatShading: true, emissive: 0x222222 }); gbuf(m, 1);
    this.mesh = new THREE.InstancedMesh(g, m, 300);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(300 * 3), 3);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    game.world.scene.add(this.mesh);
  }
  /** pop a nugget out at p; home: it flies straight to the golem (a gathering action), otherwise it lies there */
  drop(res: Res, amt: number, p: THREE.Vector3, home: boolean, v?: THREE.Vector3) {
    if (this.list.length >= 300) this.list.shift();
    this.list.push({ res, amt, p: p.clone(), v: v?.clone() ?? new THREE.Vector3(rnd(-1.5, 1.5), rnd(2, 3.5), rnd(-1.5, 1.5)), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), 0)), t: 0, home, rest: false, life: home ? 6 : 150 });
  }
  update(dt: number, to: THREE.Vector3 | null, magnet: number) {
    const R = this.game.region, fx = this.game.fx;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const u = this.list[i];
      u.t += dt;
      const d = to ? u.p.distanceTo(to) : 99;
      const pull = to && (u.home ? u.t > 0.18 : d < magnet);
      if (pull && to) {
        // the field reels it in: accelerate along the line, a little swirl
        const k = Math.min(1, dt * (u.home ? 9 : 6));
        _v.subVectors(to, u.p).normalize().multiplyScalar(Math.min(16, 4 + u.t * 14));
        _v2.set(-_v.z, 0, _v.x).multiplyScalar(0.25);
        u.v.lerp(_v.add(_v2), k);
        u.p.addScaledVector(u.v, dt); u.rest = false;
        if (Math.random() < dt * 24) fx.glow.emit(u.p.x, u.p.y, u.p.z, 0, 0, 0, _c.set(RES_COL[u.res]).multiplyScalar(1.6), 1, 1.6, 0.25, 0, 0);
        if (d < 0.22) { this.onCollect?.(u.res, u.amt, u.p); this.list.splice(i, 1); continue; }
      } else if (!u.rest) {
        u.v.y -= 14 * dt; u.p.addScaledVector(u.v, dt);
        const gy = R.surfaceY(clamp(u.p.x, 0, R.N - 0.01), clamp(u.p.z, 0, R.N - 0.01)) + 0.05;
        if (u.p.y < gy) { u.p.y = gy; if (u.v.y < -1.5) { u.v.y *= -0.3; u.v.x *= 0.5; u.v.z *= 0.5; } else { u.v.set(0, 0, 0); u.rest = true; } }
      }
      if (u.t > u.life) { this.list.splice(i, 1); continue; }
      _q.setFromAxisAngle(_v.set(0, 1, 0), dt * 3); u.q.premultiply(_q);
      const bob = u.rest ? Math.sin(u.t * 3 + i) * 0.02 + 0.03 : 0;
      const s = (0.025 + Math.min(0.03, u.amt * 0.004)) * (u.t < 0.15 ? u.t / 0.15 : 1);
      _m.compose(_v.set(u.p.x, u.p.y + bob, u.p.z), u.q, _s.set(s, s * 1.3, s));
      this.mesh.setMatrixAt(n, _m); this.mesh.setColorAt(n, _c.set(RES_COL[u.res])); n++;
      if (u.rest && Math.random() < dt * 2) fx.glow.emit(u.p.x, u.p.y + 0.06, u.p.z, 0, 0.4, 0, _c.set(RES_COL[u.res]).multiplyScalar(1.5), 1, 1.4, 0.5, 0, 0);
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}

// ------------------------------------------------------------------ knockback
interface Knock { c: Creature; vx: number; vz: number; vy: number; air: number }
export class Knocks {
  list: Knock[] = [];
  constructor(readonly game: Game, readonly gore: Gore) {}
  /** shove a creature (horizontal speed capped). 'max' keeps the stronger of the shove already under way and this
   *  one instead of stacking them (a killing blow after the hit's own knockback) */
  add(c: Creature, vx: number, vz: number, up: number, mode: 'add' | 'max' = 'add') {
    const cap = 9, k = this.list.find((x) => x.c === c);
    if (k) {
      if (mode === 'add') { k.vx += vx; k.vz += vz; }
      else { const a = Math.hypot(k.vx, k.vz), b = Math.hypot(vx, vz); if (b > a) { k.vx = vx; k.vz = vz; } }
      k.vy = Math.max(k.vy, up);
    } else this.list.push({ c, vx, vz, vy: up, air: c.air });
    const e = k ?? this.list[this.list.length - 1], sp = Math.hypot(e.vx, e.vz);
    if (sp > cap) { e.vx *= cap / sp; e.vz *= cap / sp; }
  }
  update(dt: number) {
    const R = this.game.region, w = this.game.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const k = this.list[i], c = k.c;
      if (!w.creatures.includes(c)) { this.list.splice(i, 1); continue; }
      const nx = clamp(c.x + k.vx * dt, 0.8, R.N - 0.8), nz = clamp(c.z + k.vz * dt, 0.8, R.N - 0.8);
      if (!R.isSolid(nx, nz) && R.heightAt(nx, nz) - R.heightAt(c.x, c.z) < 0.9) { c.x = nx; c.z = nz; }
      else { k.vx *= -0.3; k.vz *= -0.3; this.game.fx.burst(c.x, c.y + 0.3, c.z, 6, 0x8a7a6a, { speed: 1, up: 1, size: 2.4, life: 0.4 }); }
      k.vy -= 20 * dt; k.air += k.vy * dt;
      const drag = Math.exp(-dt * 1.2); k.vx *= drag; k.vz *= drag;
      if (c.dead) c.y = w.surfaceY(c.x, c.z);
      if (!c.dead) c.stunT = Math.max(c.stunT, 0.12);
      if (k.air <= 0) {
        c.air = 0;
        const sp = Math.hypot(k.vx, k.vz);
        if (k.vy < -4) { // it lands hard
          this.game.fx.burst(c.x, c.y + 0.05, c.z, 6 + Math.round(c.size * 6), 0x8a7a5a, { speed: 1.5, up: 1.2, size: 2.6, life: 0.5 });
          if (c.dead) this.gore.splat(c.x, c.z, Math.max(0.4, c.size * 0.6), fluidOf(c).blood, { cell: 4 + Math.floor(Math.random() * 3), rot: Math.atan2(-k.vz, k.vx) });
          sfx('hit', Math.max(0.5, c.size), 0.35 * this.game.audible(c.x, c.z));
        }
        if (sp < 1.2 || k.vy > -2) { this.list.splice(i, 1); continue; }
        k.vy = 1.6; k.vx *= 0.45; k.vz *= 0.45; k.air = 0.001;
      } else c.air = k.air;
    }
  }
}

// ------------------------------------------------------------------ the blow
export type By = 'punch' | 'rock' | 'ability' | 'plow';
/** the blow being resolved right now: the death hook reads it to aim the gore and size the overkill */
export const BLOW: { c: Creature | null; dir: THREE.Vector3; over: number; sever: boolean } = { c: null, dir: new THREE.Vector3(), over: 0, sever: false };
export interface HitOpts { knock?: number; up?: number; crit?: boolean; stun?: number; sever?: boolean; quiet?: boolean }
/** everything a golem blow does to a creature. Returns the damage actually dealt */
export function strike(game: Game, gore: Gore, knocks: Knocks, c: Creature, dmg: number, dir: THREE.Vector3, by: By, o: HitOpts = {}): number {
  if (c.dead) return 0;
  const hp0 = c.hp, w = game.world;
  c.golemHit = w.time; c.golemBy = by;
  c.aggro = Math.max(c.aggro, 14);
  const d = _v.copy(dir).setY(0); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); d.normalize();
  BLOW.c = c; BLOW.dir.copy(d); BLOW.over = (dmg * (1 - c.st.armor) - hp0) / c.maxHp; BLOW.sever = !!o.sever;
  w.damage(c, dmg, null);
  BLOW.c = null;
  const dealt = hp0 - Math.max(0, c.hp);
  c.fx.flash.value = 1; c.fx.flashCol.value.setRGB(1, o.crit ? 0.85 : 0.95, o.crit ? 0.3 : 0.85);
  gore.hit(c, d, dealt);
  { const h = c.sp.pheno.height * c.growth; vfx2d(game, o.crit ? 'star' : 'impact', c.x - d.x * c.radius * 0.5, c.y + c.air + h * 0.5, c.z - d.z * c.radius * 0.5, { dir: [d.x, d.z], size: Math.min(2, 0.5 + dealt / 20) }); }
  const m = Math.max(0.4, c.mass);
  const kb = (o.knock ?? 3) / Math.pow(m, 0.33);
  knocks.add(c, d.x * kb, d.z * kb, (o.up ?? 2.5) / Math.pow(m, 0.25));
  if (!c.dead) c.stunT = Math.max(c.stunT, (o.stun ?? 0.25) / Math.pow(m, 0.15));
  if (!o.quiet) {
    const h = c.sp.pheno.height * c.growth;
    floatText(game, c.x, c.y + c.air + h + 0.15, c.z, o.crit ? `${Math.round(dealt)} CRIT!` : String(Math.max(1, Math.round(dealt))), o.crit ? 'crit' : 'dmg');
  }
  // a killing blow throws the body
  if (c.dead && !c.fx.dissolve.value) knocks.add(c, d.x * kb * 1.3, d.z * kb * 1.3, 3, 'max');
  return dealt;
}
