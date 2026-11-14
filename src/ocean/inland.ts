// The land's own water, drawn like the sea (the geology lays it out on the Region; every field is optional and read
// defensively, so this draws whatever is there):
//   R.lakes   { level, poly: [x, z][], kind? }                       -> world/water.ts makeLakes (the sea's shader, still)
//   R.falls   { x, z, top, bottom, w, dir: [dx, dz] }               -> a curtain of water: pixel streaks pouring down,
//             a white lip, a churning foot; mist drifting off it, rings and foam spreading over the plunge pool
//   R.springs { x, z, r, level, kind: 'hot' | 'mineral' | 'geyser', hue? } -> a pool in octagonal steps of its mineral
//             ramp round a deep blue throat, a crust rim, bubbles popping, steam rising; a geyser erupts on a cycle
import * as THREE from 'three';
import type { Ocean } from './ocean';
import { makeLakes, type LakeDef } from '../world/water';
import { GN_DECL } from '../gfx/gbuf';
import { SHADER_NOISE } from '../world/glsl';
import { RAMPS, type RampName } from '../art/palette';
import { sfx } from '../audio/audio';
import { geyserState } from '../world/geo/springs';
import type { Spring } from '../world/region';

export interface FallDef { x: number; z: number; top: number; bottom: number; w: number; dir: [number, number] }
export interface SpringDef { x: number; z: number; r: number; level: number; kind: 'hot' | 'mineral' | 'geyser'; hue?: 'turquoise' | 'ochre' | 'rust' | 'green'; period?: number; phase?: number; dur?: number; jet?: number }

const FALL_V = /* glsl */`
attribute vec2 aUv;
varying vec2 vUv; varying vec3 vWp;
void main() { vUv = aUv; vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FALL_F = /* glsl */`
${GN_DECL}
${SHADER_NOISE}
uniform float uTime, uSunK, uW;
uniform vec3 uR[7], uF[5];
varying vec2 vUv; varying vec3 vWp;
void main() {
  // the curtain on a 16 px/m grid: u across (m), v down the drop (m); streaks pour down it
  vec2 q = floor(vUv * 16.0) / 16.0;
  float s = vn(vec2(q.x * 3.2, q.y * 0.35 - uTime * 2.6)) * 0.65 + vn(vec2(q.x * 7.0, q.y * 0.8 - uTime * 3.4)) * 0.35;
  // ragged sides: the water thins and breaks at the edges of the curtain
  float rag = 0.12 + vn(vec2(q.y * 0.9 - uTime * 2.0, 3.0)) * 0.3;
  if (q.x < rag || q.x > uW - rag) discard;
  vec3 c = uR[int(clamp(3.0 + floor((s - 0.5) * 6.0), 0.0, 6.0))];
  if (s > 0.68) c = uF[3]; else if (s > 0.6) c = uF[1];
  // the white lip at the top
  if (q.y < 0.18) c = uF[s > 0.4 ? 4 : 2];
  gl_FragColor = vec4(c * (0.35 + 0.65 * uSunK), 1.0);
  gNormal = vec4(0.5, 1.0, 0.5, 16.0);
}`;

const SPRING_V = /* glsl */`
varying vec3 vWp;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SPRING_F = /* glsl */`
${GN_DECL}
${SHADER_NOISE}
uniform float uTime, uSunK, uR0, uHot;
uniform vec2 uC;
uniform vec3 uRamp[6], uRim[3], uFoam;
varying vec3 vWp;
float octR(vec2 v) { v = abs(v); return max(max(v.x, v.y), (v.x + v.y) * 0.7071); }
void main() {
  vec2 px = floor(vWp.xz * 16.0), p = (px + 0.5) / 16.0;
  vec2 d = p - uC;
  // octagonal steps of colour toward a deep throat, the rings breathing a little
  float r = octR(d) / uR0 + (vn(p * 1.4 + uTime * 0.1) - 0.5) * 0.12;
  if (r > 1.08) discard;
  float st = floor(clamp(1.0 - r, 0.0, 1.0) * 5.0 + 0.5);
  vec3 c = uRamp[int(clamp(4.0 - st + 1.0, 0.0, 5.0))];
  if (r > 0.9) c = uRim[r > 1.0 ? 0 : 1];
  else if (r > 0.82) c = uRim[2];
  // bubbles popping at the surface, more over the throat when it is hot
  float b = h2(px + floor(uTime * (2.0 + uHot * 4.0) + h2(px) * 9.0));
  if (b > 0.985 - uHot * 0.02 * (1.0 - r)) c = uFoam;
  gl_FragColor = vec4(c * (0.35 + 0.65 * uSunK), 1.0);
  gNormal = vec4(0.5, 1.0, 0.5, 16.0);
}`;

/** a geyser's column: a pixel-streaked water jet climbing from the vent, ragged at the top where it breaks to spray */
const JET_V = /* glsl */`
varying vec2 vUv; varying vec3 vWp;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const JET_F = /* glsl */`
${GN_DECL}
${SHADER_NOISE}
uniform float uTime, uSunK, uH, uR;
uniform vec3 uF[5];
varying vec2 vUv; varying vec3 vWp;
void main() {
  // u round the column (m of circumference), v up it (m)
  vec2 q = floor(vec2(vUv.x * 6.2832 * uR, vUv.y * uH) * 16.0) / 16.0;
  float s = vn(vec2(q.x * 3.0, q.y * 0.5 - uTime * 7.0)) * 0.6 + vn(vec2(q.x * 6.5, q.y * 1.1 - uTime * 9.0)) * 0.4;
  // the top breaks up into spray, the sides thin out in streaks
  float top = uH - (0.5 + vn(vec2(q.x * 2.0, uTime * 3.0)) * 1.6);
  if (q.y > top && s < 0.55 + (q.y - top) * 0.35) discard;
  if (s < 0.3) discard;
  vec3 c = s > 0.72 ? uF[4] : s > 0.58 ? uF[3] : s > 0.45 ? uF[2] : uF[1];
  if (q.y < 0.35) c = uF[4];
  gl_FragColor = vec4(c * (0.4 + 0.6 * uSunK), 1.0);
  gNormal = vec4(0.5, 1.0, 0.5, 16.0);
}`;

const HUE: Record<string, RampName> = { turquoise: 'glowTeal', ochre: 'ochre', rust: 'rust', green: 'malachite' };

export class Inland {
  readonly group = new THREE.Group();
  readonly falls: FallDef[]; readonly springs: SpringDef[];
  private mats: THREE.ShaderMaterial[] = [];
  /** per spring: its geyser state last frame (geo/springs.ts geyserState), its jet column and pool material */
  private gst: number[] = [];
  private jets: (THREE.Mesh | null)[] = [];
  private poolMats: THREE.ShaderMaterial[] = [];
  private lakeMesh: THREE.Mesh | null = null;
  constructor(readonly o: Ocean) {
    const R = o.region as unknown as { lakes?: LakeDef[]; falls?: FallDef[]; springs?: SpringDef[] };
    this.group.name = 'inland-water';
    this.falls = Array.isArray(R.falls) ? R.falls.filter((f) => f && isFinite(f.x) && isFinite(f.top) && isFinite(f.bottom) && f.top > f.bottom) : [];
    this.springs = Array.isArray(R.springs) ? R.springs.filter((s) => s && isFinite(s.x) && s.r > 0) : [];
    if (Array.isArray(R.lakes) && R.lakes.length) { this.lakeMesh = makeLakes(R.lakes, o.mesh, o.region); if (this.lakeMesh) this.group.add(this.lakeMesh); }
    for (const f of this.falls) this.group.add(this.curtain(f));
    for (const s of this.springs) { this.group.add(this.pool(s)); this.gst.push(0); this.jets.push(s.kind === 'geyser' ? this.jet(s) : null); }
  }
  get empty() { return !this.falls.length && !this.springs.length && !this.lakeMesh; }
  private col(r: readonly number[]) { return r.map((h) => new THREE.Color(h)); }
  /** a curtain from the lip down to the pool, bowed out a little as the water leaves the edge */
  private curtain(f: FallDef) {
    const dl = Math.hypot(f.dir[0], f.dir[1]) || 1, dx = f.dir[0] / dl, dz = f.dir[1] / dl, px = -dz, pz = dx;
    const H = f.top - f.bottom, rows = Math.max(4, Math.ceil(H * 2)), pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= rows; j++) {
      const v = j / rows, out = Math.sqrt(v) * Math.min(1.2, H * 0.25) + 0.05, y = f.top - H * v;
      for (const sgn of [-1, 1]) {
        const w = f.w * 0.5 * (1 + v * 0.25);
        pos.push(f.x + dx * out + px * w * sgn, y, f.z + dz * out + pz * w * sgn);
        uv.push(sgn < 0 ? 0 : f.w, H * v);
      }
      if (j < rows) { const a = j * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aUv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.ShaderMaterial({ vertexShader: FALL_V, fragmentShader: FALL_F, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uSunK: { value: 1 }, uW: { value: f.w }, uR: { value: this.col(RAMPS.water) }, uF: { value: this.col([RAMPS.sky[3], RAMPS.sky[4], RAMPS.sky[5], RAMPS.snow[4], RAMPS.snow[5]]) } } });
    this.mats.push(m);
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; mesh.name = 'waterfall';
    return mesh;
  }
  /** a spring's pool: an octagon of stepped mineral colour round its throat */
  private pool(s: SpringDef) {
    const g = new THREE.CircleGeometry(s.r * 1.1, 8); g.rotateX(-Math.PI / 2); g.translate(s.x, s.level, s.z);
    const ramp = RAMPS[HUE[s.hue ?? (s.kind === 'mineral' ? 'ochre' : 'turquoise')] ?? 'glowTeal'];
    const throat = [RAMPS.sapphire[1], RAMPS.sapphire[2], ...ramp].slice(0, 6);
    // the rim is travertine: a cream lip and a white edge, stained ochre or rust only at its foot
    const rim = s.hue === 'rust' ? [RAMPS.rust[2], RAMPS.sand[4], RAMPS.paper[5]] : s.kind === 'mineral' || s.hue === 'ochre' ? [RAMPS.ochre[2], RAMPS.sand[5], RAMPS.paper[5]] : [RAMPS.stone[3], RAMPS.bone[4], RAMPS.paper[5]];
    const m = new THREE.ShaderMaterial({ vertexShader: SPRING_V, fragmentShader: SPRING_F, uniforms: { uTime: { value: 0 }, uSunK: { value: 1 }, uR0: { value: s.r }, uHot: { value: s.kind === 'mineral' ? 0.2 : 1 }, uC: { value: new THREE.Vector2(s.x, s.z) }, uRamp: { value: this.col(throat) }, uRim: { value: this.col(rim) }, uFoam: { value: new THREE.Color(RAMPS.snow[5]) } } });
    this.mats.push(m); this.poolMats.push(m);
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; mesh.name = 'spring';
    return mesh;
  }
  /** a geyser's water column (scaled to the eruption's height each frame, hidden at rest) */
  private jet(s: SpringDef) {
    const R = Math.max(0.22, s.r * 0.55), g = new THREE.CylinderGeometry(R * 0.7, R, 1, 10, 6, true);
    g.translate(0, 0.5, 0);
    const m = new THREE.ShaderMaterial({ vertexShader: JET_V, fragmentShader: JET_F, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uSunK: { value: 1 }, uH: { value: 1 }, uR: { value: R }, uF: { value: this.col([RAMPS.sky[3], RAMPS.sky[4], RAMPS.sky[5], RAMPS.snow[4], RAMPS.snow[5]]) } } });
    this.mats.push(m);
    const mesh = new THREE.Mesh(g, m); mesh.position.set(s.x, s.level - 0.05, s.z); mesh.visible = false; mesh.renderOrder = 3; mesh.name = 'geyser-jet'; mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }
  update(dt: number, t: number) {
    const o = this.o, g = o.g, k = o.sea.U.uSunK.value as number;
    for (const m of this.mats) { m.uniforms.uTime.value = t; m.uniforms.uSunK.value = k; }
    if (dt <= 0) return;
    // mist off the falls, rings and foam over their pools
    for (const f of this.falls) {
      const dl = Math.hypot(f.dir[0], f.dir[1]) || 1, fx = f.x + (f.dir[0] / dl) * Math.min(1.3, (f.top - f.bottom) * 0.25), fz = f.z + (f.dir[1] / dl) * Math.min(1.3, (f.top - f.bottom) * 0.25);
      if (Math.random() < dt * (2 + f.w)) g.fx.burst(fx + (Math.random() - 0.5) * f.w, f.bottom + 0.2, fz + (Math.random() - 0.5) * f.w, 2, RAMPS.snow[4], { speed: 0.6, up: 1.2, size: 6, life: 2.2, grav: -0.25 });
      if (Math.random() < dt * 1.5) o.ripple(fx + (Math.random() - 0.5) * f.w, fz + (Math.random() - 0.5) * f.w, 0.5);
    }
    // steam off the hot springs; the geysers on the geology's own clock (geo/springs.ts geyserState, which the
    // hazard in geo/live.ts reads too): the pool boils, then the column climbs to its height and falls away
    this.springs.forEach((s, i) => {
      if (s.kind !== 'mineral' && Math.random() < dt * (1 + s.r)) g.fx.burst(s.x + (Math.random() - 0.5) * s.r, s.level + 0.15, s.z + (Math.random() - 0.5) * s.r, 1, RAMPS.snow[3], { speed: 0.2, up: 1.0, size: 7, life: 2.8, grav: -0.35 });
      if (s.kind !== 'geyser') return;
      const st = geyserState(s as Spring, t), was = this.gst[i]; this.gst[i] = st;
      const pm = this.poolMats[i]; if (pm) pm.uniforms.uHot.value = 1 + Math.max(0, -st) * 3 + Math.max(0, st) * 2;
      const jm = this.jets[i];
      if (jm) {
        const h = st > 0.02 ? (s.jet ?? 8) * st * (0.88 + 0.12 * Math.sin(t * 9.3 + i)) : 0;
        jm.visible = h > 0.3;
        if (jm.visible) { jm.scale.set(1 + st * 0.25, h, 1 + st * 0.25); (jm.material as THREE.ShaderMaterial).uniforms.uH.value = h; }
      }
      if (st > 0 && was <= 0) {
        g.fx.spray(s.x, s.level + 0.2, s.z, 0, 1, 0, 70, RAMPS.snow[5], { speed: 15, cone: 0.12, size: 4, life: 2.4, grav: 9, drag: 0.3 });
        g.fx.burst(s.x, s.level + 2, s.z, 30, RAMPS.snow[3], { speed: 2, up: 4, size: 8, life: 3.5, grav: -0.5 });
      }
      if (st > 0.2 && Math.random() < dt * 12) g.fx.spray(s.x, s.level + (s.jet ?? 8) * st * 0.9, s.z, 0, 1, 0, 3, RAMPS.snow[5], { speed: 3, cone: 0.9, size: 3, life: 1.4, grav: 9, drag: 0.4 });
      if (st < 0 && Math.random() < dt * 6) g.fx.burst(s.x + (Math.random() - 0.5) * s.r, s.level + 0.1, s.z + (Math.random() - 0.5) * s.r, 2, RAMPS.snow[4], { speed: 0.5, up: 1.6, size: 3, life: 0.6, grav: 6 });
    });
    void sfx;
  }
  dispose() { this.group.removeFromParent(); this.group.traverse((x) => { const m = x as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); for (const m of this.mats) m.dispose(); (this.lakeMesh?.material as THREE.Material | undefined)?.dispose(); }
}
