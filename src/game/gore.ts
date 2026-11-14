// Gore: blood and ichor sprays, splats and pools that dry and fade (pixel decals on the ground), gibs and flesh
// chunks that bounce and bleed, bone shards, severed limbs (the creature's own bone collapses and a limb coloured
// from its species flies off), stumps that pump, corpses that bleed out, and the golem's intake tearing a body
// into chunks and fluids that spiral into its jaw until only bones are left. Everything is chunky and pixel-lit to
// match the rest of the world: nearest-filtered textures, flat shading, dithered fades.
import * as THREE from 'three';
import type { Game } from './game';
import type { Creature } from './creature';
import { gbuf, GN_DECL } from '../gfx/gbuf';
import { clamp, hash01 } from '../core/rand';
import { spiralPos } from './fx';
import { sfx } from '../audio/audio';
import { makeRamp } from '../limbo/gfx/pixel';
import { vfx2d } from './combat';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Color(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ fluids
export interface Fluid { blood: number; light: number; dark: number; flesh: number; meat: number; bone: number; ichor: boolean }
const RED: Fluid = { blood: 0x8e1010, light: 0xd23424, dark: 0x420606, flesh: 0xb04848, meat: 0xd87a6e, bone: 0xe6dcc4, ichor: false };
const BUG: Fluid = { blood: 0x86b42a, light: 0xd8e858, dark: 0x34500c, flesh: 0xb8b878, meat: 0xd8d098, bone: 0xd8d0a8, ichor: true };
const BLUE: Fluid = { blood: 0x2a6a98, light: 0x7ac8e8, dark: 0x0e2a4a, flesh: 0x8a9a9a, meat: 0xb8c8c0, bone: 0xdcdcd0, ichor: true };
/** what bleeds out of a creature: red blood, green-yellow arthropod ichor, blue mollusc blood */
export function fluidOf(c: Creature): Fluid {
  const l = c.sp.design.lineage;
  return l === 'arthropod' ? BUG : l === 'mollusc' ? BLUE : RED;
}

// ------------------------------------------------------------------ textures
/** 8 splat shapes, 32 px each: round pools with lobes and droplets, directional streaks, scattered drips.
 *  R holds the shade (rim dark, glossy highlight), A the mask. */
function splatAtlas() {
  const W = 256, H = 32, d = new Uint8Array(W * H * 4);
  for (let cell = 0; cell < 8; cell++) {
    const ox = cell * 32, h = (k: number) => hash01(cell, k, 77);
    const blobs: [number, number, number][] = [];
    if (cell < 4) {
      const R = 6.5 + h(1) * 3; blobs.push([16, 16, R]);
      const lobes = 4 + Math.floor(h(2) * 4);
      for (let i = 0; i < lobes; i++) { const a = h(10 + i) * 6.283, r = R * (0.55 + h(20 + i) * 0.45); blobs.push([16 + Math.cos(a) * r, 16 + Math.sin(a) * r, 1.8 + h(30 + i) * 2.6]); }
      const drops = 3 + Math.floor(h(3) * 5);
      for (let i = 0; i < drops; i++) { const a = h(40 + i) * 6.283, r = R + 2.5 + h(50 + i) * 5; blobs.push([16 + Math.cos(a) * r, 16 + Math.sin(a) * r, 0.7 + h(60 + i) * 1.2]); }
    } else if (cell < 7) {
      for (let i = 0; i < 9; i++) { const t = i / 8; blobs.push([5 + t * 22, 16 + Math.sin(t * 5 + cell) * 1.2, 5.2 * (1 - t) + 1 + h(70 + i) * 0.8]); }
      for (let i = 0; i < 6; i++) blobs.push([14 + h(80 + i) * 16, 16 + (h(90 + i) - 0.5) * 14, 0.6 + h(95 + i) * 1.1]);
    } else for (let i = 0; i < 7; i++) blobs.push([5 + h(100 + i) * 22, 5 + h(110 + i) * 22, 0.8 + h(120 + i) * 1.6]);
    const inside = (x: number, y: number) => {
      if (x < 0 || y < 0 || x > 31 || y > 31) return false;
      for (const [bx, by, br] of blobs) if ((x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 < (br + (hash01(x, y, cell) - 0.5) * 0.9) ** 2) return true;
      return false;
    };
    const M = new Uint8Array(32 * 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) M[y * 32 + x] = inside(x, y) ? 1 : 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (!M[y * 32 + x]) continue;
      let depth = 3;
      for (let r = 1; r <= 2 && depth === 3; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X > 31 || Y > 31 || !M[Y * 32 + X]) { depth = r; break; } }
      let shade = depth === 1 ? 0.22 : depth === 2 ? 0.5 : 0.62;
      // the lit lower-right rim of a wet pool, highlight specks up-left of each big blob
      if (depth === 1 && (x + y) % 2 === 0 && hash01(x, y, 5) < 0.3) shade = 0.4;
      for (const [bx, by, br] of blobs) if (br > 2.2 && Math.abs(x + 0.5 - (bx - br * 0.35)) < 1 && Math.abs(y + 0.5 - (by - br * 0.4)) < 0.8) shade = 1;
      const i = (y * W + ox + x) * 4;
      d[i] = Math.round(shade * 255); d[i + 1] = d[i]; d[i + 2] = d[i]; d[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
/** a 16 px tile of dithered grain, mid-grey, for gibs and limbs (multiplied by their colour) */
let grainTex: THREE.DataTexture | null = null;
export function grain() {
  if (grainTex) return grainTex;
  const N = 16, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = 0.78 + (hash01(x, y, 3) - 0.5) * 0.3 + (hash01(x >> 1, y >> 1, 9) - 0.5) * 0.25 + (y < 2 ? 0.12 : y > 13 ? -0.12 : 0);
    const i = (y * N + x) * 4; d[i] = d[i + 1] = d[i + 2] = Math.round(clamp(v, 0, 1) * 255); d[i + 3] = 255;
  }
  grainTex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  grainTex.magFilter = THREE.NearestFilter; grainTex.minFilter = THREE.NearestFilter; grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  grainTex.colorSpace = THREE.SRGBColorSpace; grainTex.needsUpdate = true;
  return grainTex;
}

// ------------------------------------------------------------------ decals
const DVERT = /* glsl */`
attribute vec4 iCol; attribute float iCell;
varying vec2 vUv; varying vec4 vCol; varying float vCell;
void main() { vUv = uv; vCol = iCol; vCell = iCell; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`;
const DFRAG = /* glsl */`
${GN_DECL}
uniform sampler2D map; uniform float uLight;
varying vec2 vUv; varying vec4 vCol; varying float vCell;
float bayer(vec2 p) { vec2 q = mod(floor(p), 4.0); float b = mod(q.x * 2.0 + q.y * 3.0, 4.0) * 4.0 + mod(q.x + q.y * 2.0, 4.0); return (b + 0.5) / 16.0; }
void main() {
  vec4 t = texture2D(map, vec2((vCell + clamp(vUv.x, 0.002, 0.998)) / 8.0, vUv.y));
  if (t.a < 0.5 || vCol.a < bayer(gl_FragCoord.xy)) discard;
  float s = t.r;
  vec3 c = vCol.rgb * (0.5 + s * 0.8) + (s > 0.9 ? vec3(0.18) : vec3(0.0));
  gl_FragColor = vec4(c * uLight, 1.0);
  gNormal = vec4(0.0);
}`;
interface Decal { x: number; y: number; z: number; rot: number; size: number; sx: number; grow: number; t: number; life: number; col: number; cell: number; tilt: THREE.Quaternion }
class Decals {
  readonly mesh: THREE.InstancedMesh;
  private iCol: THREE.InstancedBufferAttribute; private iCell: THREE.InstancedBufferAttribute;
  list: Decal[] = [];
  readonly U = { map: { value: splatAtlas() as THREE.Texture }, uLight: { value: 1 } };
  constructor(readonly cap = 420) {
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iCell = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iCol', this.iCol); g.setAttribute('iCell', this.iCell);
    const m = new THREE.ShaderMaterial({ vertexShader: DVERT, fragmentShader: DFRAG, uniforms: this.U, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(g, m, cap);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
  }
  add(x: number, y: number, z: number, size: number, col: number, o: { cell?: number; rot?: number; grow?: number; life?: number; stretch?: number; normal?: THREE.Vector3 } = {}) {
    if (this.list.length >= this.cap) this.list.shift();
    const tilt = new THREE.Quaternion();
    if (o.normal) tilt.setFromUnitVectors(UP, o.normal);
    this.list.push({ x, y, z, rot: o.rot ?? Math.random() * 6.283, size, sx: o.stretch ?? 1, grow: o.grow ?? 0.12, t: 0, life: o.life ?? rnd(50, 80), col, cell: o.cell ?? Math.floor(Math.random() * 4), tilt });
    return this.list[this.list.length - 1];
  }
  update(dt: number) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) { L[i].t += dt; if (L[i].t >= L[i].life) L.splice(i, 1); }
    for (let i = 0; i < L.length; i++) {
      const d = L[i], g = d.grow > 0 ? Math.min(1, d.t / d.grow) : 1, gs = 1 - (1 - g) ** 2;
      _q.setFromAxisAngle(UP, d.rot).premultiply(d.tilt);
      _m.compose(_v.set(d.x, d.y, d.z), _q, _s.set(d.size * gs * d.sx, 1, d.size * gs));
      this.mesh.setMatrixAt(i, _m);
      // wet and bright when fresh, darkening as it dries, then a dithered fade
      const age = d.t / d.life, dry = Math.min(1, d.t / 18);
      _c.set(d.col).multiplyScalar(1 - dry * 0.38);
      this.iCol.setXYZW(i, _c.r, _c.g, _c.b, age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3);
      this.iCell.setX(i, d.cell);
    }
    this.mesh.count = L.length;
    this.mesh.instanceMatrix.needsUpdate = true; this.iCol.needsUpdate = true; this.iCell.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ bodies: gibs, bone shards, limbs, rock debris
export type GibKind = 'flesh' | 'skin' | 'bone' | 'chitin' | 'rock' | 'metal' | 'limb';
interface Suck { to: () => THREE.Vector3 | null; t: number; sp: number; ang: number; rad: number; A: THREE.Vector3; B: THREE.Vector3; cb?: () => void }
interface Body {
  p: THREE.Vector3; v: THREE.Vector3; q: THREE.Quaternion; w: THREE.Vector3; s: THREE.Vector3; col: number; t: number; life: number; rest: boolean;
  kind: GibKind; bleed: number; fluid: number; carbon: number; suck: Suck | null; obj: THREE.Object3D | null; sink: number; dripT: number;
}

export class Gore {
  readonly decals = new Decals();
  readonly gibMesh: THREE.InstancedMesh;
  private gibMat: THREE.MeshLambertMaterial; private limbMat: THREE.MeshLambertMaterial;
  bodies: Body[] = [];
  private seeds: { p: THREE.Vector3; v: THREE.Vector3; col: number; size: number; streak: boolean }[] = [];
  private bleeders: { c: Creature; t: number; dur: number; rate: number; acc: number; pool: Decal | null; poolMax: number; dead: boolean }[] = [];
  private fountains: { c: Creature; bone: number; t: number; dur: number; dir: THREE.Vector3 }[] = [];
  readonly cap = 380;
  constructor(readonly game: Game) {
    const w = game.world;
    w.scene.add(this.decals.mesh);
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.gibMat = new THREE.MeshLambertMaterial({ map: grain(), flatShading: true }); gbuf(this.gibMat, 1);
    this.gibMesh = new THREE.InstancedMesh(box, this.gibMat, this.cap);
    this.gibMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3);
    this.gibMesh.count = 0; this.gibMesh.frustumCulled = false; this.gibMesh.castShadow = true;
    w.scene.add(this.gibMesh);
    this.limbMat = new THREE.MeshLambertMaterial({ map: grain(), vertexColors: true, flatShading: true }); gbuf(this.limbMat, 1);
  }

  // ---------------------------------------------------------------- spawning
  gib(x: number, y: number, z: number, kind: GibKind, col: number, size: number, o: { v?: THREE.Vector3; life?: number; bleed?: number; fluid?: number; carbon?: number; long?: number } = {}): Body {
    if (this.bodies.length >= this.cap) { const i = this.bodies.findIndex((b) => b.rest && !b.suck && !b.obj); this.kill(i >= 0 ? i : 0); }
    const lng = o.long ?? (kind === 'bone' ? rnd(2.2, 3.6) : kind === 'chitin' ? 0.45 : rnd(0.8, 1.4));
    const s = kind === 'chitin' ? new THREE.Vector3(size * 1.3, size * 0.32, size) : new THREE.Vector3(size * (kind === 'bone' ? 0.42 : 1), size * (kind === 'bone' ? 0.42 : rnd(0.7, 1)), size * lng);
    const b: Body = {
      p: new THREE.Vector3(x, y, z), v: o.v?.clone() ?? new THREE.Vector3(rnd(-2, 2), rnd(2, 5), rnd(-2, 2)),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0, 6.3), rnd(0, 6.3), rnd(0, 6.3))), w: new THREE.Vector3(rnd(-14, 14), rnd(-14, 14), rnd(-14, 14)),
      s, col, t: 0, life: o.life ?? rnd(26, 40), rest: false, kind, bleed: o.bleed ?? (kind === 'flesh' ? 1.2 : 0), fluid: o.fluid ?? RED.blood, carbon: o.carbon ?? 0, suck: null, obj: null, sink: 0, dripT: 0,
    };
    this.bodies.push(b);
    return b;
  }
  /** pull a body along a vortex into a moving target; cb runs when it arrives */
  suck(b: Body, to: () => THREE.Vector3 | null, dur = 0.7, cb?: () => void) {
    const B = to(); if (!B) return;
    b.suck = { to, t: 0, sp: 1 / dur, ang: Math.random() * 6.283, rad: rnd(0.15, 0.45), A: b.p.clone(), B: B.clone(), cb };
    b.rest = false;
  }
  /** blood landing: a splat decal on dry ground, a cloud in water */
  splat(x: number, z: number, size: number, col: number, o: { cell?: number; rot?: number; grow?: number; stretch?: number; life?: number } = {}) {
    const R = this.game.region;
    if (x < 0.5 || z < 0.5 || x > R.N - 0.5 || z > R.N - 0.5) return null;
    if (R.isWater(x, z)) { this.game.fx.burst(x, R.surfaceY(x, z) + 0.03, z, 3, col, { speed: 0.3, up: 0.15, size: 3, life: 1.6, grav: 0.2, spread: size * 2 }); return null; }
    const y = R.heightAt(x, z) + 0.012;
    // tilt to the slope
    const e = 0.35, nx = R.heightAt(x - e, z) - R.heightAt(x + e, z), nz = R.heightAt(x, z - e) - R.heightAt(x, z + e);
    const n = _v2.set(nx, 2 * e, nz).normalize();
    return this.decals.add(x, y, z, size, col, { ...o, normal: n });
  }
  private seed(p: THREE.Vector3, v: THREE.Vector3, col: number, size: number, streak = true) { if (this.seeds.length < 220) this.seeds.push({ p: p.clone(), v: v.clone(), col, size, streak }); }

  // ---------------------------------------------------------------- reactions
  /** a hit on a creature: spray out of the far side along the blow, droplets that splat where they land, a wound
   *  that keeps dripping, chunks off it when the blow is heavy */
  hit(c: Creature, dir: THREE.Vector3, dmg: number, o: { blunt?: boolean } = {}) {
    const F = fluidOf(c), fx = this.game.fx, h = c.sp.pheno.height * c.growth;
    const cx = c.x, cy = c.y + c.air + h * 0.5, cz = c.z;
    const d = _v.copy(dir).setY(0).normalize();
    const px = cx + d.x * c.radius * 0.3, pz = cz + d.z * c.radius * 0.3;
    const n = Math.min(60, 10 + Math.round(dmg * 1.6));
    fx.spray(px, cy, pz, d.x, 0.45, d.z, n, F.blood, { speed: 2.4 + Math.min(4, dmg * 0.12), cone: 0.55, size: 2.8, life: 0.75, grav: 9 });
    fx.spray(px, cy, pz, d.x, 0.7, d.z, Math.ceil(n * 0.4), F.light, { speed: 1.8, cone: 0.7, size: 2, life: 0.5, grav: 9 });
    if (o.blunt !== false) fx.spray(cx - d.x * c.radius * 0.4, cy, cz - d.z * c.radius * 0.4, -d.x, 0.6, -d.z, Math.ceil(n * 0.25), F.dark, { speed: 1.3, cone: 0.8, size: 2.2, life: 0.4, grav: 8 });
    const drops = Math.min(8, 2 + Math.floor(dmg / 5));
    for (let i = 0; i < drops; i++) this.seed(_v2.set(px, cy, pz), new THREE.Vector3(d.x * rnd(1.5, 4.5) + rnd(-0.8, 0.8), rnd(1, 3), d.z * rnd(1.5, 4.5) + rnd(-0.8, 0.8)), F.blood, rnd(0.18, 0.4) * Math.max(0.6, Math.min(1.8, c.size)));
    if (dmg > 10) {
      const k = Math.min(4, Math.floor(dmg / 10));
      for (let i = 0; i < k; i++) this.gib(px, cy, pz, Math.random() < 0.25 ? 'skin' : 'flesh', Math.random() < 0.25 ? c.sp.design.colors.base : F.flesh, rnd(0.04, 0.08) * Math.max(0.7, Math.min(2, c.size)), { v: new THREE.Vector3(d.x * rnd(2, 5), rnd(2, 4.5), d.z * rnd(2, 5)), fluid: F.blood, carbon: 0.6 });
    }
    if (dmg > 18 && Math.random() < 0.5) this.gib(px, cy, pz, 'bone', F.bone, rnd(0.035, 0.06) * Math.max(0.7, Math.min(2, c.size)), { v: new THREE.Vector3(d.x * 5, 4, d.z * 5), bleed: 0 });
    this.wound(c, 1.5 + Math.min(4, dmg * 0.15), 0.5 + Math.min(3, dmg * 0.08));
  }
  wound(c: Creature, dur: number, rate: number) {
    const b = this.bleeders.find((x) => x.c === c);
    if (b) { b.dur = Math.max(b.dur, b.t + dur); b.rate = Math.max(b.rate, rate); return; }
    this.bleeders.push({ c, t: 0, dur, rate, acc: 0, pool: null, poolMax: 0, dead: false });
  }
  /** a death: a burst of blood, a pool that spreads under the corpse, a few chunks. overkill > ~0.6 tears it apart */
  die(c: Creature, dir: THREE.Vector3 | null, overkill: number) {
    const F = fluidOf(c), fx = this.game.fx, h = c.sp.pheno.height * c.growth, sz = Math.max(0.5, Math.min(2.2, c.size));
    const cy = c.y + c.air + h * 0.45;
    const d = dir ? _v.copy(dir).setY(0).normalize() : _v.set(0, 0, 0);
    fx.burst(c.x, cy, c.z, 18 + Math.floor(sz * 14), F.blood, { speed: 2.4, up: 2.4, size: 3.2, life: 0.9, grav: 9 });
    fx.spray(c.x, cy, c.z, d.x, 0.9, d.z, 24, F.light, { speed: 3, cone: 0.9, size: 2.4, life: 0.7, grav: 10 });
    for (let i = 0; i < 6; i++) this.seed(_v2.set(c.x, cy, c.z), new THREE.Vector3(d.x * 3 + rnd(-2.5, 2.5), rnd(1, 3.5), d.z * 3 + rnd(-2.5, 2.5)), F.blood, rnd(0.25, 0.5) * sz);
    const b = this.bleeders.find((x) => x.c === c);
    if (b) { b.dead = true; b.dur = b.t + 9; b.rate = 2; } else this.bleeders.push({ c, t: 0, dur: 9, rate: 2, acc: 0, pool: null, poolMax: 0, dead: true });
    const chunks = 2 + Math.floor(sz * 2);
    for (let i = 0; i < chunks; i++) this.gib(c.x, cy, c.z, i % 3 === 2 ? 'skin' : 'flesh', i % 3 === 2 ? c.sp.design.colors.base : Math.random() < 0.5 ? F.flesh : F.meat, rnd(0.05, 0.1) * sz, { v: new THREE.Vector3(d.x * 3 + rnd(-2, 2), rnd(2.5, 5), d.z * 3 + rnd(-2, 2)), fluid: F.blood, carbon: 1 });
    if (overkill > 0.6) this.explode(c, d);
    else if (overkill > 0.2 || Math.random() < 0.3) this.sever(c, d, overkill > 0.4 && Math.random() < 0.5 ? 'head' : 'any');
  }
  /** tear a creature to pieces: the mesh dissolves into gibs, limbs and bones; its carbon goes into the pieces */
  explode(c: Creature, d: THREE.Vector3) {
    const F = fluidOf(c), h = c.sp.pheno.height * c.growth, sz = Math.max(0.5, Math.min(2.4, c.size)), cy = c.y + c.air + h * 0.45;
    const bug = c.sp.design.lineage === 'arthropod' || c.sp.design.lineage === 'mollusc';
    const per = Math.max(0.5, c.bio * 0.8 / (10 + sz * 10));
    for (let i = 0; i < 10 + sz * 10; i++) {
      const k = Math.random(), kind: GibKind = k < 0.18 ? (bug ? 'chitin' : 'skin') : k < 0.3 ? 'bone' : 'flesh';
      const col = kind === 'bone' ? F.bone : kind === 'flesh' ? (Math.random() < 0.5 ? F.flesh : F.meat) : Math.random() < 0.6 ? c.sp.design.colors.base : c.sp.design.colors.pattern;
      this.gib(c.x + rnd(-0.3, 0.3) * sz, cy + rnd(-0.2, 0.2) * sz, c.z + rnd(-0.3, 0.3) * sz, kind, col, rnd(0.05, 0.12) * sz, { v: new THREE.Vector3(d.x * 4 + rnd(-3.5, 3.5), rnd(3, 7), d.z * 4 + rnd(-3.5, 3.5)), fluid: F.blood, carbon: kind === 'bone' ? 0 : per });
    }
    for (let i = 0; i < 3; i++) this.sever(c, d, i === 0 ? 'head' : 'any');
    this.game.fx.burst(c.x, cy, c.z, 60, F.blood, { speed: 4.5, up: 4, size: 3.4, life: 1, grav: 10 });
    vfx2d(this.game, 'splat', c.x, cy, c.z, { dir: [d.x, d.z], size: 1 + sz * 0.5, col: F.blood });
    this.splat(c.x, c.z, 1.6 * sz, F.blood, { cell: Math.floor(Math.random() * 4), grow: 0.5 });
    c.fx.dissolve.value = 1;
    c.bio = 0; // the carbon is in the pieces now; the empty corpse is cleared away
    (this.game.world.flora as unknown as { impulse?(x: number, z: number, r: number, s: number): void }).impulse?.(c.x, c.z, 1.5 + sz, 1.2);
    sfx('squelch', 0.6, 1); sfx('crack', 0.7, 0.6);
  }
  /** cut a limb (or the head, or the tail) off: its bone collapses into the joint and a severed piece flies,
   *  coloured from the species, with a red stump and a stub of bone; the stump pumps for a second */
  sever(c: Creature, dir: THREE.Vector3, which: 'any' | 'head' = 'any', suckTo?: () => THREE.Vector3 | null): boolean {
    const rig = c.anim.rig, F = fluidOf(c), cands: { bone: number; len: number; th: number; head?: boolean }[] = [];
    const g = c.growth;
    if (which === 'head' && rig.head > 0 && !c.severed.includes(rig.head) && rig.plan !== 'serpent' && rig.plan !== 'gastropod') cands.push({ bone: rig.neck.length ? rig.neck[0] : rig.head, len: rig.length * 0.22 * g, th: rig.width * 0.4 * g, head: true });
    if (!cands.length) {
      for (const lg of rig.legs) if (!c.severed.includes(lg.bones[0])) cands.push({ bone: lg.bones[0], len: lg.lens.reduce((a, b) => a + b, 0) * g, th: Math.max(0.03, rig.width * 0.13) * g });
      if (rig.tail.length && !c.severed.includes(rig.tail[0])) cands.push({ bone: rig.tail[0], len: rig.length * 0.4 * g, th: rig.width * 0.18 * g });
    }
    if (!cands.length) return false;
    const k = cands[Math.floor(Math.random() * cands.length)];
    const bone = c.anim.bones[k.bone];
    c.mesh.updateMatrixWorld(true);
    bone.getWorldPosition(_v2);
    const at = _v2.clone();
    bone.scale.setScalar(1e-4);
    c.severed.push(k.bone);
    // the severed piece: a limb segment (or a head) in the creature's colours, a raw stump, a stub of bone
    const col = c.sp.design.colors, L = Math.max(0.08, Math.min(1.6, k.len)), T = Math.max(0.035, Math.min(0.35, k.th));
    const geo = limbGeo(k.head ? 'head' : 'limb', L, T, col.base, k.head ? col.belly : col.pattern, F.flesh, F.bone, col.eye);
    const mesh = new THREE.Mesh(geo, this.limbMat); mesh.castShadow = true;
    this.game.world.scene.add(mesh);
    const b = this.gib(at.x, at.y, at.z, 'limb', col.base, 1, { v: new THREE.Vector3(dir.x * rnd(2, 4) + rnd(-1.2, 1.2), rnd(3, 5.5), dir.z * rnd(2, 4) + rnd(-1.2, 1.2)), bleed: 3, fluid: F.blood, carbon: 2 + L * 4, life: rnd(40, 60) });
    b.obj = mesh; b.s.set(1, 1, 1); b.w.multiplyScalar(0.6);
    if (suckTo) this.suck(b, suckTo, rnd(0.8, 1.1));
    this.fountains.push({ c, bone: k.bone, t: 0, dur: 1.4, dir: dir.clone() });
    this.game.fx.spray(at.x, at.y, at.z, dir.x, 1, dir.z, 30, F.blood, { speed: 3.2, cone: 0.5, size: 3, life: 0.8, grav: 9 });
    sfx('squelch', 0.8, 0.8); sfx('crack', 1.4, 0.5);
    return true;
  }

  // ---------------------------------------------------------------- intake: tear a corpse into the golem's jaw
  /** start drawing a corpse in; null if it can't be */
  intake(c: Creature): Intake | null {
    const prev = this.intakes.get(c);
    if (prev && !prev.done) return prev; // carry on where it was left
    if (!c.dead || c.digest > 0 || c.bio <= 0.3) return null;
    const it = new Intake(this, c);
    this.intakes.set(c, it);
    return it;
  }
  private intakes = new WeakMap<Creature, Intake>();

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const G = this.game, R = G.region, fx = G.fx;
    // light the decals with the day
    const d = G.world.day, k = clamp(Math.cos((d - 0.25) * Math.PI * 2) * 1.4 + 0.25, 0.16, 1);
    this.decals.U.uLight.value = 0.35 + k * 0.6;
    if (dt <= 0) { this.decals.update(0); return; }
    // droplet seeds: ballistic, splat where they land
    for (let i = this.seeds.length - 1; i >= 0; i--) {
      const s = this.seeds[i];
      s.v.y -= 14 * dt; s.p.addScaledVector(s.v, dt);
      const gy = R.surfaceY(clamp(s.p.x, 0, R.N - 0.01), clamp(s.p.z, 0, R.N - 0.01));
      if (s.p.y <= gy) {
        const sp = Math.hypot(s.v.x, s.v.z);
        if (s.streak && sp > 1.6) this.splat(s.p.x, s.p.z, s.size * 1.5, s.col, { cell: 4 + Math.floor(Math.random() * 3), rot: Math.atan2(-s.v.z, s.v.x), stretch: 1.3, grow: 0.08 });
        else this.splat(s.p.x, s.p.z, s.size, s.col, { cell: Math.random() < 0.4 ? 7 : Math.floor(Math.random() * 4), grow: 0.1 });
        this.seeds.splice(i, 1);
      }
    }
    // bleeding creatures: drips while alive and moving, a pool that spreads under a corpse
    for (let i = this.bleeders.length - 1; i >= 0; i--) {
      const b = this.bleeders[i], c = b.c;
      b.t += dt;
      const gone = !G.world.creatures.includes(c) && c.dead;
      if (b.t >= b.dur || gone) { this.bleeders.splice(i, 1); continue; }
      const F = fluidOf(c), fade = 1 - b.t / b.dur;
      if (c.dead && !c.fx.dissolve.value) {
        if (!b.pool && c.anim.deathT > 0.6) { b.poolMax = Math.max(0.5, Math.min(2.6, c.size * 1.1)); b.pool = this.splat(c.x, c.z, b.poolMax, F.blood, { cell: Math.floor(Math.random() * 4), grow: 7 }); }
        if (b.pool) { b.pool.x = c.x; b.pool.z = c.z; b.pool.life = Math.max(b.pool.life, 90); }
      }
      b.acc += dt * b.rate * fade * (c.mesh.visible ? 1 : 0.2);
      while (b.acc >= 1) {
        b.acc -= 1;
        const h = c.sp.pheno.height * c.growth;
        const x = c.x + rnd(-0.4, 0.4) * c.radius, z = c.z + rnd(-0.4, 0.4) * c.radius;
        fx.spray(x, c.y + c.air + h * 0.35, z, 0, -1, 0, 2, F.blood, { speed: 0.8, cone: 0.2, size: 2.4, life: 0.35, grav: 12 });
        if (!c.dead || Math.random() < 0.3) this.splat(x, z, rnd(0.08, 0.2) * Math.max(0.6, Math.min(1.6, c.size)), F.blood, { cell: 7, grow: 0.05 });
      }
    }
    // stumps pump
    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const f = this.fountains[i]; f.t += dt;
      if (f.t >= f.dur || !G.world.creatures.includes(f.c)) { this.fountains.splice(i, 1); continue; }
      const pulse = Math.max(0, Math.sin(f.t * 15)) * (1 - f.t / f.dur);
      if (pulse < 0.2) continue;
      const bone = f.c.anim.bones[f.bone]; bone.getWorldPosition(_v);
      const F = fluidOf(f.c);
      fx.spray(_v.x, _v.y, _v.z, f.dir.x * 0.6, 1, f.dir.z * 0.6, Math.ceil(pulse * 4), F.blood, { speed: 2.2 * pulse + 0.6, cone: 0.35, size: 2.6, life: 0.6, grav: 10 });
      if (Math.random() < dt * 8) this.seed(_v, new THREE.Vector3(f.dir.x * 1.5 + rnd(-0.5, 0.5), 2, f.dir.z * 1.5 + rnd(-0.5, 0.5)), F.blood, rnd(0.15, 0.3));
    }
    // bodies
    const gm = this.gibMesh;
    let n = 0;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.t += dt;
      if (b.suck) {
        const s = b.suck, to = s.to();
        if (to) s.B.copy(to);
        s.t += dt * s.sp;
        s.ang += dt * (8 + s.t * 18);
        spiralPos(b.p, s.A, s.B, Math.min(1, s.t), s.ang, s.rad, 0.35);
        _q.setFromAxisAngle(_v.set(0.3, 1, 0.2).normalize(), dt * 16); b.q.premultiply(_q);
        if (Math.random() < dt * 20 && b.kind !== 'bone' && b.kind !== 'rock' && b.kind !== 'metal') fx.spray(b.p.x, b.p.y, b.p.z, 0, -0.3, 0, 1, b.fluid, { speed: 0.5, size: 2, life: 0.3, grav: 6 });
        if (s.t >= 1) { s.cb?.(); this.kill(i); continue; }
      } else if (!b.rest) {
        b.v.y -= 16 * dt;
        b.p.addScaledVector(b.v, dt);
        const lx = clamp(b.p.x, 0.2, R.N - 0.2), lz = clamp(b.p.z, 0.2, R.N - 0.2); b.p.x = lx; b.p.z = lz;
        const half = b.obj ? 0.04 : Math.min(b.s.x, b.s.y, b.s.z) * 0.5;
        const gy = R.heightAt(lx, lz) + half;
        _q.setFromAxisAngle(_v.copy(b.w).normalize(), b.w.length() * dt); b.q.premultiply(_q);
        if (b.p.y < R.surfaceY(lx, lz) && R.isWater(lx, lz) && b.sink === 0) { b.sink = 0.01; fx.burst(lx, R.surfaceY(lx, lz) + 0.02, lz, 6, 0xc8e0f0, { speed: 1, up: 1.6, size: 2, life: 0.5 }); b.v.multiplyScalar(0.15); }
        if (b.p.y <= gy) {
          b.p.y = gy;
          if (b.v.y < -1.6) {
            if (b.bleed > 0 && b.fluid) this.splat(b.p.x, b.p.z, rnd(0.12, 0.26) * (b.obj ? 1.6 : 1), b.fluid, { cell: 7, grow: 0.06 });
            if (b.kind === 'rock' || b.kind === 'metal') fx.burst(b.p.x, gy, b.p.z, 2, b.kind === 'metal' ? 0xffd08a : 0x8a7a6a, { speed: 0.8, up: 1, size: 2, life: 0.3, glow: b.kind === 'metal' });
            b.v.y = -b.v.y * 0.28; b.v.x *= 0.55; b.v.z *= 0.55; b.w.multiplyScalar(0.55);
          } else {
            b.v.set(0, 0, 0); b.w.set(0, 0, 0); b.rest = true;
            // lie flat-ish: keep only the yaw part plus a little tilt
            const e = new THREE.Euler().setFromQuaternion(b.q, 'YXZ'); b.q.setFromEuler(new THREE.Euler(Math.round(e.x / 1.5708) * 1.5708 * 0.15, e.y, 0, 'YXZ'));
          }
        }
        if (b.bleed > 0) {
          b.bleed -= dt; b.dripT -= dt;
          if (b.dripT <= 0) { b.dripT = 0.06; fx.spray(b.p.x, b.p.y, b.p.z, -b.v.x, -0.4, -b.v.z, 1, b.fluid, { speed: 0.4, size: 2.2, life: 0.4, grav: 8 }); }
        }
      }
      if (b.sink > 0) { b.sink += dt; b.p.y -= dt * 0.25; if (b.sink > 3) { this.kill(i); continue; } }
      // old pieces sink into the soil
      let sc = 1;
      if (b.t > b.life) { sc = 1 - (b.t - b.life) / 2.5; if (sc <= 0) { this.kill(i); continue; } }
      if (b.suck) sc *= 1 - Math.max(0, b.suck.t - 0.65) * 2.4;
      if (b.obj) { b.obj.position.copy(b.p); b.obj.quaternion.copy(b.q); b.obj.scale.setScalar(Math.max(0.01, sc)); continue; }
      _m.compose(b.p, b.q, _s.copy(b.s).multiplyScalar(Math.max(0.01, sc)));
      gm.setMatrixAt(n, _m);
      gm.setColorAt(n, _c.set(b.col));
      n++;
    }
    gm.count = n;
    gm.instanceMatrix.needsUpdate = true;
    if (gm.instanceColor) gm.instanceColor.needsUpdate = true;
    this.decals.update(dt);
  }
  private kill(i: number) {
    const b = this.bodies[i]; if (!b) return;
    if (b.obj) { b.obj.removeFromParent(); (b.obj as THREE.Mesh).geometry?.dispose(); }
    this.bodies[i] = this.bodies[this.bodies.length - 1]; this.bodies.pop();
  }
  /** loose flesh lying near a point (the intake can draw it in) */
  looseNear(x: number, z: number, r: number) {
    const out: Body[] = [];
    for (const b of this.bodies) if (!b.suck && b.carbon > 0 && (b.p.x - x) ** 2 + (b.p.z - z) ** 2 < r * r) out.push(b);
    return out;
  }
  dispose() {
    for (let i = this.bodies.length - 1; i >= 0; i--) this.kill(i);
    this.gibMesh.removeFromParent(); this.decals.mesh.removeFromParent();
  }
}

/** the golem's intake drawing in a corpse. tick() it while the intake is held; the body tears into chunks and
 *  fluids that stream along a vortex into the jaw, shrinks and collapses to bones. */
export class Intake {
  p = 0; done = false;
  readonly dur: number; readonly carbon: number;
  private credited = 0; private tearT = 0; private cuts = 0; private squelchT = 0;
  constructor(readonly gore: Gore, readonly c: Creature) {
    this.dur = 2.4 + Math.sqrt(Math.max(0.5, c.mass)) * 0.55;
    this.carbon = Math.max(3, c.bio * 1.2);
  }
  /** advance; mouth is a live getter for the intake point. onCarbon gets each new increment. true when finished */
  tick(dt: number, mouth: () => THREE.Vector3 | null, onCarbon: (amt: number, x: number, y: number, z: number) => void): boolean {
    if (this.done) return true;
    const c = this.c, G = this.gore.game, F = fluidOf(c), m = mouth();
    if (!m || !G.world.creatures.includes(c)) { this.done = true; return true; }
    this.p = Math.min(1, this.p + dt / this.dur);
    const e = this.p, h = c.sp.pheno.height * c.growth;
    // the body shrinks, sags and comes apart in pixels
    c.shrink = 1 - 0.55 * e * e * (3 - 2 * e);
    c.fx.dissolve.value = Math.max(c.fx.dissolve.value, e * 0.72);
    c.fx.decay.value = Math.max(c.fx.decay.value, e * 0.55);
    c.fx.flash.value = Math.max(c.fx.flash.value, 0.25 + Math.sin(G.world.time * 30) * 0.15); c.fx.flashCol.value.setRGB(0.6, 0.15, 0.1);
    // the vortex drags the carcass toward the jaw a little and shakes it
    const dx = m.x - c.x, dz = m.z - c.z, dl = Math.hypot(dx, dz) || 1;
    if (dl > c.radius + 0.25) { c.x += (dx / dl) * dt * 0.25 * e; c.z += (dz / dl) * dt * 0.25 * e; }
    c.air = Math.abs(Math.sin(G.world.time * 23)) * 0.03 * (1 + e);
    const src = () => new THREE.Vector3(c.x + rnd(-0.5, 0.5) * c.radius, c.y + c.air + h * rnd(0.15, 0.5) * c.shrink, c.z + rnd(-0.5, 0.5) * c.radius);
    // fluids stream up the vortex
    G.fx.stream(src, mouth, Math.ceil(dt * 120), Math.random() < 0.7 ? F.blood : F.light, { dur: rnd(0.45, 0.7), rad: 0.25 + c.radius * 0.3, arc: 0.25, size: 2.4 });
    if (Math.random() < dt * 14) G.fx.stream(src, mouth, 1, 0x9aff6a, { dur: 0.6, rad: 0.3, glow: true, size: 2 });
    // chunks tear off and fly in
    this.tearT -= dt;
    if (this.tearT <= 0) {
      this.tearT = rnd(0.06, 0.13) / Math.max(0.6, Math.min(2, c.size));
      const s = src(), skin = Math.random() < 0.3;
      const b = this.gore.gib(s.x, s.y, s.z, skin ? 'skin' : 'flesh', skin ? c.sp.design.colors.base : Math.random() < 0.5 ? F.flesh : F.meat, rnd(0.03, 0.07) * Math.max(0.6, Math.min(1.8, c.size)), { fluid: F.blood, bleed: 0 });
      this.gore.suck(b, mouth, rnd(0.45, 0.8));
    }
    // limbs rip off at the joints and go in whole
    if (this.cuts < 3 && e > [0.3, 0.55, 0.78][this.cuts]) {
      this.cuts++;
      this.gore.sever(c, new THREE.Vector3(dx / dl, 0, dz / dl), this.cuts === 3 ? 'head' : 'any', mouth);
    }
    this.squelchT -= dt;
    if (this.squelchT <= 0) { this.squelchT = rnd(0.25, 0.5); sfx('squelch', rnd(0.7, 1.3), 0.35); }
    // carbon as it comes in
    const due = this.carbon * e - this.credited;
    if (due >= 1 || (e >= 1 && due > 0)) { this.credited += due; onCarbon(due, m.x, m.y, m.z); }
    if (e >= 1) { this.finish(); return true; }
    return false;
  }
  /** what's left collapses to a pile of bones and a dark stain */
  private finish() {
    this.done = true;
    const c = this.c, G = this.gore.game, F = fluidOf(c), sz = Math.max(0.5, Math.min(2.2, c.size));
    const bug = c.sp.design.lineage === 'arthropod' || c.sp.design.lineage === 'mollusc';
    const y = c.y + 0.1;
    // skull (or a husk), a curve of ribs, vertebrae
    if (!bug) this.gore.gib(c.x, y + 0.1, c.z, 'bone', F.bone, 0.09 * sz, { v: new THREE.Vector3(rnd(-0.5, 0.5), 1.5, rnd(-0.5, 0.5)), long: 1.1, life: 70, bleed: 0 });
    for (let i = 0; i < 5 + Math.floor(sz * 3); i++) {
      const kind: GibKind = bug ? 'chitin' : 'bone';
      this.gore.gib(c.x + rnd(-0.35, 0.35) * sz, y + 0.1, c.z + rnd(-0.35, 0.35) * sz, kind, bug ? (Math.random() < 0.5 ? c.sp.design.colors.base : 0x6a5a40) : F.bone, rnd(0.025, 0.05) * sz, { v: new THREE.Vector3(rnd(-1.4, 1.4), rnd(1.5, 3), rnd(-1.4, 1.4)), life: rnd(55, 80), bleed: 0 });
    }
    this.gore.splat(c.x, c.z, 1.2 * sz, F.dark, { cell: Math.floor(Math.random() * 4), grow: 0.4, life: 110 });
    G.fx.burst(c.x, y + 0.2, c.z, 26, F.blood, { speed: 2, up: 2, size: 3, life: 0.6 });
    G.fx.burst(c.x, y + 0.2, c.z, 18, 0x9aff6a, { glow: true, speed: 1.4, up: 2.5, size: 2.2, life: 0.9, grav: -0.5 });
    sfx('crack', 1.6, 0.6); sfx('absorb', 1, 0.8);
  }
}

// ------------------------------------------------------------------ severed piece geometry
/** a severed limb or head: boxes with baked vertex colours, flat shaded. Limb: a long segment and a foot in the
 *  species colours, a raw red stump at the cut with a stub of bone. Head: a block with eyes and a stump. */
function limbGeo(kind: 'limb' | 'head', L: number, T: number, base: number, second: number, flesh: number, bone: number, eye: number) {
  const parts: { s: [number, number, number]; p: [number, number, number]; c: number; r?: number }[] = [];
  if (kind === 'limb') {
    parts.push({ s: [T, T, L * 0.55], p: [0, 0, L * 0.25], c: base });
    parts.push({ s: [T * 0.8, T * 0.8, L * 0.45], p: [0, -T * 0.25, L * 0.72], c: base, r: 0.35 });
    parts.push({ s: [T * 1.15, T * 0.6, T * 1.3], p: [0, -T * 0.5, L * 0.95], c: second });
    parts.push({ s: [T * 1.05, T * 1.05, T * 0.25], p: [0, 0, -L * 0.03], c: flesh });
    parts.push({ s: [T * 0.35, T * 0.35, T * 0.5], p: [0, 0, -L * 0.03 - T * 0.25], c: bone });
  } else {
    const H = Math.max(T * 1.6, L * 0.5);
    parts.push({ s: [T * 1.5, H * 0.8, L], p: [0, 0, L * 0.5], c: base });
    parts.push({ s: [T * 1.2, H * 0.35, L * 0.7], p: [0, -H * 0.42, L * 0.55], c: second });
    for (const sx of [-1, 1]) parts.push({ s: [T * 0.3, T * 0.3, T * 0.3], p: [sx * T * 0.7, H * 0.2, L * 0.75], c: eye });
    parts.push({ s: [T * 1.4, H * 0.75, T * 0.25], p: [0, 0, -T * 0.1], c: flesh });
    parts.push({ s: [T * 0.4, T * 0.4, T * 0.4], p: [0, 0, -T * 0.3], c: bone });
  }
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const cc = new THREE.Color();
  for (const pt of parts) {
    const g = new THREE.BoxGeometry(...pt.s);
    if (pt.r) g.rotateX(pt.r);
    g.translate(...pt.p);
    const ng = g.toNonIndexed(), P = ng.attributes.position, Nn = ng.attributes.normal, U = ng.attributes.uv;
    cc.set(pt.c);
    // a little per-face dither of the colour for the pixel look
    const R = makeRamp(pt.c, 5, { spread: 0.35 });
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); uv.push(U.getX(i) * 2, U.getY(i) * 2);
      const f = Math.floor(i / 6); cc.set(R[2 + (f % 2)]);
      col.push(cc.r, cc.g, cc.b);
    }
    g.dispose(); ng.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
