// Small details that make the world feel handmade and lived in:
//  - footprints shaped by the feet that made them (hoof, paw, claw, three-toed, pad, insect tarsi, serpent drag, snail
//    slime), pressed deep into mud, sand and snow, faint on grass, absent on rock; trodden grass under heavy bodies,
//    dust kicked up by heavy steps, the hovering golem's faint gravity scuff and dust wake
//  - getting wet: whatever wades or swims soaks, darkens, drips pixel droplets (with wet spots where they land) and
//    leaves wet prints for a while; `wetOf(c)` / `c.wet` expose it
//  - water you can disturb: rings from every entry, footfall, thrown stone and drip, Kelvin wakes with a foam lip
//    behind waders and the skimming golem (fed to the water shader through WATER_FX), crown splashes, floating leaves
//    and twigs drifting with the river current and bobbing on the rings
//  - humidity by biome: low mist, aerial haze, light shafts, morning dew, heat shimmer (lights.ts Env, drawn by post),
//    and occasional rain showers: hand-drawn streaks, splash pops, rings on the water, overcast light, ground that
//    darkens and puddles while wet and dries after
//  - the hand-drawn VFX (vfx2d.ts) hooked to the game's events
// Built once per Game (game.ts); it runs inside the game's update$ list.
import * as THREE from 'three';
import type { Game } from './game';
import type { Creature } from './creature';
import type { LegDef } from '../life/morph';
import { Vfx2D, setLiveVfx, type LandKind, type VfxName } from './vfx2d';
import { WATER_FX, RIPPLES, WAKES } from '../world/water';
import { B } from '../world/blockTex';
import { gbuf, GN_DECL } from '../gfx/gbuf';
import { RAMPS, type RampName } from '../art/palette';
import { clamp } from '../core/rand';

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// ------------------------------------------------------------------------------------------------ print masks
/** decal shapes (R: pressed-in depth, G: raised rim / sheen) */
export const enum Foot { HOOF, PAW, CLAW, THREE, PAD, INSECT, SCUFF, DRAG, SLIME, SPOT, TRODDEN, BLOOD }
const SHAPES = 12, MS = 32;

function maskAtlas() {
  const W = SHAPES * MS, d = new Uint8Array(W * MS * 4);
  // every shape is a drawn polygon (toe pads, hoof halves, heel pads with their lobes), never an ellipse
  type P2 = [number, number];
  const inPoly = (u: number, v: number, P: P2[]) => {
    let inside = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside; }
    return inside;
  };
  const seg = (u: number, v: number, ax: number, ay: number, bx: number, by: number, w: number) => {
    const dx = bx - ax, dy = by - ay, t = clamp(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    return Math.abs(u - ax - dx * t) + Math.abs(v - ay - dy * t) <= w * 1.25;
  };
  /** a small pad: a hand-set pentagon or hexagon, its own radii, turned */
  const pad = (cx: number, cy: number, r: number, rot: number, R: number[]): P2[] => R.map((m, i) => { const a = rot + (i / R.length) * Math.PI * 2; return [cx + Math.cos(a) * r * m, cy + Math.sin(a) * r * m * 1.15] as P2; });
  const mirror = (P: P2[]): P2[] => P.map(([x, y]) => [-x, y] as P2);
  const HOOF_L: P2[] = [[-0.07, -0.6], [-0.3, -0.58], [-0.5, -0.36], [-0.56, 0.02], [-0.47, 0.4], [-0.27, 0.66], [-0.08, 0.52]];
  const HOOF_R: P2[] = mirror([[-0.07, -0.55], [-0.28, -0.6], [-0.5, -0.4], [-0.58, 0.06], [-0.44, 0.44], [-0.24, 0.62], [-0.09, 0.5]]);
  const HEEL: P2[] = [[-0.44, -0.2], [-0.28, -0.06], [0, -0.13], [0.29, -0.05], [0.45, -0.22], [0.4, -0.5], [0.22, -0.64], [0.09, -0.52], [0, -0.64], [-0.1, -0.52], [-0.25, -0.66], [-0.41, -0.5]];
  const TOES: P2[][] = [pad(-0.52, 0.17, 0.17, 0.3, [1, 0.8, 1.05, 0.9, 0.85]), pad(-0.19, 0.5, 0.17, 0.9, [0.9, 1.05, 0.8, 1, 0.92]), pad(0.2, 0.52, 0.17, 1.5, [1.05, 0.85, 0.95, 0.8, 1]), pad(0.53, 0.19, 0.16, 2.2, [0.9, 1, 0.85, 1.05, 0.9])];
  const PALM: P2[] = [[-0.28, -0.18], [-0.1, -0.08], [0.16, -0.12], [0.3, -0.3], [0.2, -0.52], [-0.06, -0.56], [-0.26, -0.44]];
  const BIG: P2[] = pad(0, -0.08, 0.7, 0.2, [1, 0.92, 1.04, 0.95, 0.88, 1.02, 0.97, 0.9]);
  const SPOT: P2[] = [[-0.5, -0.14], [-0.32, -0.46], [0.04, -0.56], [0.36, -0.42], [0.58, -0.08], [0.44, 0.18], [0.5, 0.42], [0.18, 0.56], [-0.12, 0.44], [-0.42, 0.36]];
  const LENS: P2[] = [[0, -0.96], [0.36, -0.7], [0.58, -0.2], [0.5, 0.36], [0.24, 0.84], [-0.08, 0.95], [-0.42, 0.6], [-0.6, 0.06], [-0.44, -0.58]];
  const dia = (u: number, v: number, cx: number, cy: number, r: number) => Math.abs(u - cx) + Math.abs(v - cy) * 0.8 < r;
  const deg = Math.PI / 180;
  const shape = (k: number, u: number, v: number): [number, number] => {
    switch (k) {
      case Foot.HOOF: return [inPoly(u, v, HOOF_L) || inPoly(u, v, HOOF_R) ? 1 : 0, 0];
      case Foot.PAW: return [inPoly(u, v, HEEL) || TOES.some((T) => inPoly(u, v, T)) ? 1 : 0, 0];
      case Foot.CLAW: {
        if (inPoly(u, v, PALM)) return [1, 0];
        const A = [-74, -38, -4, 33, 70], L = [0.6, 0.78, 0.84, 0.74, 0.55];
        for (let i = 0; i < 5; i++) { const ex = Math.sin(A[i] * deg) * L[i], ey = -0.32 + Math.cos(A[i] * deg) * L[i]; if (seg(u, v, 0, -0.32, ex, ey, 0.065)) return [1, 0]; if (dia(u, v, ex * 1.13, -0.32 + (ey + 0.32) * 1.13, 0.06)) return [1, 0]; }
        return [0, 0];
      }
      case Foot.THREE: return [seg(u, v, 0, -0.5, 0.04, 0.82, 0.075) || seg(u, v, 0, -0.5, -0.56, 0.42, 0.07) || seg(u, v, 0, -0.5, 0.5, 0.48, 0.07) || seg(u, v, 0, -0.5, -0.05, -0.85, 0.06) || inPoly(u, v, pad(0, -0.46, 0.16, 0.4, [1, 0.8, 1.1, 0.9, 1])) ? 1 : 0, 0];
      case Foot.PAD: { if (inPoly(u, v, BIG)) return [1, 0]; for (const a of [-52, -18, 15, 49]) { const x = Math.sin(a * deg) * 0.76, y = -0.08 + Math.cos(a * deg) * 0.76; if (inPoly(u, v, [[x - 0.12, y - 0.04], [x, y + 0.14], [x + 0.12, y - 0.04]])) return [1, 0]; } return [0, 0]; }
      case Foot.INSECT: return [dia(u, v, 0.02, 0.55, 0.17) || dia(u, v, -0.2, 0, 0.15) || dia(u, v, 0.13, -0.55, 0.16) ? 1 : 0, 0];
      case Foot.SCUFF: {
        // the golem's field drags the grit into a few swept scrape marks
        if (seg(u, v, -0.7, -0.3, -0.2, -0.62, 0.05) || seg(u, v, -0.2, -0.62, 0.35, -0.55, 0.05)) return [0.7, 0];
        if (seg(u, v, -0.62, 0.2, -0.15, -0.05, 0.045) || seg(u, v, 0.1, 0.1, 0.62, -0.12, 0.05)) return [0.55, 0];
        if (seg(u, v, -0.3, 0.6, 0.25, 0.5, 0.05) || seg(u, v, 0.25, 0.5, 0.62, 0.2, 0.045)) return [0.65, 0];
        return [0, seg(u, v, -0.7, -0.38, -0.2, -0.7, 0.03) || seg(u, v, -0.28, 0.68, 0.25, 0.58, 0.03) ? 0.6 : 0];
      }
      case Foot.DRAG: return [Math.abs(u) < 0.32 * (1 - 0.25 * v * v) ? 1 : 0, 0];
      case Foot.SLIME: { const au = Math.abs(u); return [au < 0.34 ? 0.55 : 0, au > 0.1 && au < 0.2 && Math.floor((v + 1) * 8) % 3 !== 0 ? 1 : 0]; }
      case Foot.SPOT: return [inPoly(u, v, SPOT) ? 1 : 0, 0];
      case Foot.BLOOD: return [inPoly(u, v, SPOT.map(([x, y]) => [x * 0.9, y * 0.85] as P2)) || dia(u, v, 0.74, 0.32, 0.1) || dia(u, v, -0.62, -0.56, 0.08) || dia(u, v, -0.2, 0.8, 0.07) ? 1 : 0, 0];
      case Foot.TRODDEN: {
        if (!inPoly(u, v, LENS)) return [0, 0];
        // flattened blades: drawn strokes lying the way it walked
        const st = (u * 5.5 + v * 0.6 + 10) % 1;
        return st < 0.22 ? [0, 1] : [0.55, 0];
      }
    }
    return [0, 0];
  };
  const rimmed = new Set([Foot.HOOF, Foot.PAW, Foot.CLAW, Foot.THREE, Foot.PAD, Foot.INSECT, Foot.DRAG]);
  for (let k = 0; k < SHAPES; k++) {
    const R = new Float32Array(MS * MS), G = new Float32Array(MS * MS);
    for (let y = 0; y < MS; y++) for (let x = 0; x < MS; x++) {
      const u = ((x + 0.5) / MS) * 2 - 1, v = ((y + 0.5) / MS) * 2 - 1;
      const [r, g] = shape(k, u, v);
      R[y * MS + x] = r; G[y * MS + x] = g;
    }
    // displaced ground: a one-pixel raised rim round the pressed shape
    if (rimmed.has(k)) for (let y = 0; y < MS; y++) for (let x = 0; x < MS; x++) {
      if (R[y * MS + x] > 0) continue;
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < MS && Y < MS && R[Y * MS + X] > 0.5) { hit = true; break; } }
      if (hit) G[y * MS + x] = 1;
    }
    for (let y = 0; y < MS; y++) for (let x = 0; x < MS; x++) {
      const o = (y * W + k * MS + x) * 4;
      d[o] = Math.round(R[y * MS + x] * 255); d[o + 1] = Math.round(G[y * MS + x] * 255); d[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, W, MS, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

const PRINT_VERT = /* glsl */`
attribute vec4 aInfo; attribute vec4 aTint;
uniform float uTime;
varying vec2 vUv; varying vec4 vTint; varying float vK; varying float vShape; varying float vSeed;
void main() {
  vUv = uv; vTint = aTint; vShape = aInfo.z;
  float age = uTime - aInfo.x;
  vK = aInfo.y > 0.0 ? aInfo.w * clamp(1.0 - age / aInfo.y, 0.0, 1.0) : 0.0;
  vSeed = fract(aInfo.x * 7.31);
  gl_Position = vK > 0.003 ? projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0) : vec4(0.0, 0.0, 2.0, 1.0);
}`;
const PRINT_FRAG = /* glsl */`
${GN_DECL}
uniform sampler2D uMask;
varying vec2 vUv; varying vec4 vTint; varying float vK; varying float vShape; varying float vSeed;
float hh(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
void main() {
  vec2 tp = floor(vUv * ${MS}.0);
  vec2 m = texture2D(uMask, vec2((vShape + (tp.x + 0.5) / ${MS}.0) / ${SHAPES}.0, (tp.y + 0.5) / ${MS}.0)).rg;
  if (m.r + m.g < 0.01) discard;
  // an old print fades in three planar steps, never by speckle
  float k = ceil(min(1.0, vK * 1.6) * 3.0) / 3.0;
  vec3 mul = mix(vec3(1.0), vTint.rgb, m.r * k) * (1.0 + m.g * (vTint.a - 1.0) * k);
  gl_FragColor = vec4(mul, 1.0);
  gNormal = vec4(1.0);
}`;

const PN = 1800;
/** ground decals: pressed into the image by multiplying it (the G-buffer passes through untouched) */
class Prints {
  readonly mesh: THREE.InstancedMesh;
  private info: THREE.InstancedBufferAttribute; private tint: THREE.InstancedBufferAttribute;
  private i = 0; private lo = PN; private hi = -1;
  readonly U = { uTime: { value: 0 }, uMask: { value: maskAtlas() } };
  constructor(scene: THREE.Scene) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    this.info = new THREE.InstancedBufferAttribute(new Float32Array(PN * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(PN * 4).fill(1), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aInfo', this.info); g.setAttribute('aTint', this.tint);
    const m = new THREE.ShaderMaterial({
      vertexShader: PRINT_VERT, fragmentShader: PRINT_FRAG, uniforms: this.U, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(g, m, PN);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < PN; i++) this.mesh.setMatrixAt(i, _m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'prints';
    scene.add(this.mesh);
  }
  /** a decal at (x, y, z) facing yaw (creature convention: +z forward at yaw 0), tilted onto the ground normal n */
  add(x: number, y: number, z: number, yaw: number, sx: number, sz: number, shape: Foot, k: number, life: number, now: number, tr: number, tg: number, tb: number, rim: number, n?: THREE.Vector3) {
    const i = this.i; this.i = (this.i + 1) % PN;
    _qy.setFromAxisAngle(UP, yaw + Math.PI);
    if (n) _q.setFromUnitVectors(UP, n).multiply(_qy); else _q.copy(_qy);
    _v.set(x, y + 0.012, z);
    _m.compose(_v, _q, _s.set(sx, 1, sz));
    this.mesh.setMatrixAt(i, _m);
    this.info.setXYZW(i, now, life, shape, k);
    this.tint.setXYZW(i, tr, tg, tb, rim);
    this.lo = Math.min(this.lo, i); this.hi = Math.max(this.hi, i);
  }
  flush(now: number) {
    this.U.uTime.value = now;
    if (this.hi < 0) return;
    const im = this.mesh.instanceMatrix;
    for (const [a, s] of [[im, 16], [this.info, 4], [this.tint, 4]] as [THREE.BufferAttribute, number][]) { a.clearUpdateRanges(); a.addUpdateRange(this.lo * s, (this.hi - this.lo + 1) * s); a.needsUpdate = true; }
    this.lo = PN; this.hi = -1;
  }
}

/** how the ground takes a print: depth, the colour it is pressed down to and the lit rim, seconds it lasts, and the
 *  ramp its dust is drawn in. The darkening is the ground ramp's own shadow step over its mid step (palette-true). */
interface Soil { k: number; r: number; g: number; b: number; rim: number; life: number; dust: RampName | null }
const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
function soil(ramp: RampName, k: number, life: number, dust: RampName | null, deep = 2): Soil {
  const r = RAMPS[ramp], L = r.length, mid = Math.min(L - 2, Math.round((L - 1) * 0.62)), lo = Math.max(0, mid - deep), hi = Math.min(L - 1, mid + 1);
  const ch = (c: number, s: number) => lin((c >> s) & 255);
  const q = (s: number) => clamp(ch(r[lo], s) / Math.max(1e-3, ch(r[mid], s)), 0.25, 1);
  const rim = (ch(r[hi], 16) + ch(r[hi], 8) + ch(r[hi], 0)) / Math.max(1e-3, ch(r[mid], 16) + ch(r[mid], 8) + ch(r[mid], 0));
  return { k, r: q(16), g: q(8), b: q(0), rim: 1 + (rim - 1) * 0.6, life, dust };
}
const SOIL: Record<number, Soil> = {
  [B.MUD]: soil('soil', 1, 80, null, 3),
  [B.SAND]: soil('sand', 0.95, 55, 'sand'),
  [B.SNOW]: soil('snow', 1, 110, 'snow'),
  [B.SOIL]: soil('soil', 0.8, 45, 'soil'),
  [B.CLAY]: soil('clay', 0.85, 60, 'clay'),
  [B.LITTER]: soil('ochre', 0.6, 30, null),
  [B.DRY]: soil('straw', 0.5, 22, 'straw', 1),
  [B.GRASS]: soil('moss', 0.42, 16, null, 1),
  [B.GRAVEL]: soil('stone', 0.22, 10, 'stone', 1),
  [B.CRATER]: soil('slate', 0.3, 20, 'slate', 1),
};
const WET_PRINT: Soil = { ...soil('slate', 0.85, 16, null, 2), rim: 1 };
const BLOOD_PRINT = soil('blood', 0.9, 45, null, 2), ICHOR_PRINT = soil('ichor', 0.9, 45, null, 2);

// ------------------------------------------------------------------------------------------------ floating debris
function debrisTex(kind: 'leaf' | 'twig') {
  const S = 16, d = new Uint8Array(S * S * 4);
  const put = (x: number, y: number, v: number) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const o = (y * S + x) * 4; d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255; };
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && d[(y * S + x) * 4 + 3] > 0;
  if (kind === 'leaf') {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S * 2 - 1, v = (y + 0.5) / S * 2 - 1, w = 0.62 * Math.sin(Math.PI * clamp((v + 0.95) / 1.85, 0, 1)) ** 0.8;
      if (Math.abs(u) < w) put(x, y, Math.abs(u) < 0.08 ? 150 : u < 0 ? 235 : 200);
    }
    put(8, 15, 120); put(7, 15, 120);
  } else {
    for (let t = 0; t < 14; t++) { put(2 + t, 13 - Math.round(t * 0.75), 190); put(2 + t, 14 - Math.round(t * 0.75), 140); }
    for (let t = 0; t < 4; t++) put(9 + t, 7 - t - 1, 170);
  }
  // a dark outline
  const c = d.slice();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (c[(y * S + x) * 4 + 3]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const X = x + dx, Y = y + dy; return X >= 0 && Y >= 0 && X < S && Y < S && c[(Y * S + X) * 4 + 3] > 0; });
    if (near) { const o = (y * S + x) * 4; d[o] = d[o + 1] = d[o + 2] = 40; d[o + 3] = 255; }
  }
  void filled;
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------------------------------------ rain streaks
const RAIN_VERT = /* glsl */`
attribute vec3 aSeed;
uniform vec3 uCenter, uBox, uFall; uniform float uTime, uLen, uPx; uniform vec2 uRes;
varying float vT;
void main() {
  vec3 lo = uCenter - uBox * 0.5;
  vec3 p = lo + mod(aSeed * uBox + uFall * uTime - lo, uBox);
  vec4 a = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vec4 b = projectionMatrix * viewMatrix * vec4(p - normalize(uFall) * uLen * (0.7 + aSeed.x * 0.6), 1.0);
  vec2 d = (b.xy / b.w - a.xy / a.w) * uRes;
  float l = length(d);
  vec2 dir = l > 1e-3 ? d / l : vec2(0.0, 1.0);
  vec4 P = mix(a, b, position.y);
  P.xy += vec2(-dir.y, dir.x) * position.x * 4.0 * uPx / uRes * P.w;
  vT = position.y;
  gl_Position = P;
}`;
const RAIN_FRAG = /* glsl */`
uniform vec3 uCol;
varying float vT;
void main() {
  float a = vT < 0.15 ? 0.9 : 0.6;
  gl_FragColor = vec4(uCol * (vT < 0.15 ? 1.5 : 1.0) * a, a);
}`;

// ------------------------------------------------------------------------------------------------ per-creature state
interface CT { phase: number; wet: number; inWater: boolean; drip: number; ripT: number; lr: number; dustT: number; glintT: number; trail: number; lx: number; lz: number; shape: Foot; foot: number; mat: THREE.MeshLambertMaterial | null; shown: number; seen: number }

function footOf(c: Creature): Foot {
  const d = c.sp.design, genes = d.genes as string[], plan = c.sp.model.rig.plan;
  if (plan === 'serpent') return Foot.DRAG;
  if (plan === 'gastropod') return Foot.SLIME;
  if (genes.includes('leg_hooved')) return Foot.HOOF;
  if (genes.includes('leg_pillar')) return Foot.PAD;
  if (d.lineage === 'arthropod' || genes.some((g) => g === 'leg_jointed' || g === 'leg_saltatorial' || g === 'leg_raptorial')) return Foot.INSECT;
  if (genes.includes('leg_sprawl') || genes.includes('leg_leaping')) return Foot.CLAW;
  if (plan === 'biped') return Foot.THREE;
  return Foot.PAW;
}

// ------------------------------------------------------------------------------------------------ the system
export class Details {
  readonly vfx: Vfx2D;
  private prints: Prints;
  private t = 0; private last = performance.now();
  private ct = new Map<Creature, CT>();
  private deadSeen = new WeakSet<Creature>();
  private hitT = new WeakMap<Creature, number>();
  private rip = new Float32Array(RIPPLES * 4);
  private flow: Float32Array;
  // golem
  private gWas = false; private gTrail = 0; private gDust = 0; private gDrip = 0; private gRing = 0; private gx = 0; private gz = 0; private gLeaf = 0;
  private stoneSeen = new WeakSet<object>();
  // debris
  private leaves: THREE.InstancedMesh; private twigs: THREE.InstancedMesh;
  private db: { x: number; z: number; yaw: number; spin: number; ph: number; age: number; beach: number; s: number; on: boolean; twig: boolean }[] = [];
  // weather
  private rainMesh: THREE.Mesh; private rainU: Record<string, THREE.IUniform>;
  private rain = 0; private rainGoal = 0; private showerT = 0; private showerDur = 0; private nextShower: number; private forced: number | null = null;
  private wetGround = 0; private hitAcc = 0;
  private gatherT = 0;

  constructor(readonly g: Game) {
    const w = g.world, R = g.region;
    this.vfx = new Vfx2D(w.fxScene);
    setLiveVfx(this.vfx);
    this.vfx.ground = (x, z) => this.surface(x, z);
    this.vfx.onLand = (x, y, z, kind, size, ramp) => this.landed(x, y, z, kind, size, ramp);
    this.prints = new Prints(w.scene);
    this.flow = this.buildFlow();
    // debris: leaves and twigs on the water, lit and outlined like everything else
    const plane = new THREE.PlaneGeometry(1, 1); plane.rotateX(-Math.PI / 2);
    const mk = (kind: 'leaf' | 'twig', n: number) => {
      const m = gbuf(new THREE.MeshLambertMaterial({ map: debrisTex(kind), alphaTest: 0.5, side: THREE.DoubleSide }), 1);
      const im = new THREE.InstancedMesh(plane, m, n);
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3);
      im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.name = 'debris';
      w.scene.add(im);
      return im;
    };
    this.leaves = mk('leaf', 48); this.twigs = mk('twig', 14);
    for (let i = 0; i < 62; i++) this.db.push({ x: 0, z: 0, yaw: 0, spin: 0, ph: 0, age: 0, beach: 0, s: 0, on: false, twig: i >= 48 });
    // rain
    const N = 1400, rg = new THREE.InstancedBufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    rg.setIndex([0, 1, 2, 0, 2, 3]);
    const seeds = new Float32Array(N * 3); for (let i = 0; i < seeds.length; i++) seeds[i] = Math.random();
    rg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3));
    rg.instanceCount = 0;
    this.rainU = { uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(24, 16, 24) }, uFall: { value: new THREE.Vector3(1, -11, 0.4) }, uTime: { value: 0 }, uLen: { value: 0.8 }, uPx: { value: 0.75 }, uRes: { value: new THREE.Vector2(1, 1) }, uCol: { value: new THREE.Color(0.72, 0.8, 0.95) } };
    this.rainMesh = new THREE.Mesh(rg, new THREE.ShaderMaterial({
      vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, uniforms: this.rainU, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    }));
    this.rainMesh.frustumCulled = false; this.rainMesh.renderOrder = 6; this.rainMesh.visible = false;
    (this.rainMesh as unknown as { maxN: number }).maxN = N;
    w.fxScene.add(this.rainMesh);
    // weather: humid biomes shower now and then, deserts almost never
    const hum = R.biome.moist;
    this.nextShower = hum < 0.15 ? 1e9 : rnd(70, 200) / Math.max(0.3, hum);
    const P = new URLSearchParams(location.search);
    if (P.has('rain')) this.forced = clamp(Number(P.get('rain') || 1), 0, 1);
    for (const r of WATER_FX.uRip.value) r.set(0, 0, 0, 0);
    this.hooks();
    // creatures' own blows: a hit star and a splat (the golem's are drawn by combat)
    const prev = w.hooks.onDamage;
    w.hooks.onDamage = (c, amt, by) => { prev?.(c, amt, by); this.damaged(c, amt, by); };
    (g as unknown as { details: Details }).details = this;
    g.update$.push((dt) => { try { this.update(dt); } catch (e) { if (this.errs++ < 5) console.error('details', e); } });
  }
  private errs = 0;

  // ------------------------------------------------------------------ queries
  /** the water's surface over (x, z) (sea level where no river runs) */
  waterY(x: number, z: number) { const R = this.g.region, ry = R.riverAt(x, z); return ry > 0 && R.heightAt(x, z) < ry ? Math.max(ry, R.water + 0.035) : R.water; }
  /** ground or water surface */
  surface(x: number, z: number) { const R = this.g.region, N = R.N; x = clamp(x, 0, N - 0.01); z = clamp(z, 0, N - 0.01); return R.isWater(x, z) ? this.waterY(x, z) : R.heightAt(x, z); }
  /** how wet a creature is (0..1): darker, dripping, leaves wet prints */
  wetOf(c: Creature) { return this.ct.get(c)?.wet ?? 0; }
  /** current rain 0..1 */
  get raining() { return this.rain; }
  /** force the weather: an amount 0..1, or null to let it run by itself */
  setRain(a: number | null) { this.forced = a; }

  // ------------------------------------------------------------------ water: rings, splashes
  /** a ring spreading on the water (strength ~0.2 drip .. 1.5 big entry) */
  ripple(x: number, z: number, s = 0.6) {
    const r = this.rip;
    let best = 0, score = -1e9;
    for (let i = 0; i < RIPPLES; i++) { const sc = r[i * 4 + 3] <= 0 ? 1e9 : r[i * 4 + 2] * 2 - r[i * 4 + 3]; if (sc > score) { score = sc; best = i; } }
    r[best * 4] = x; r[best * 4 + 1] = z; r[best * 4 + 2] = 0; r[best * 4 + 3] = s;
  }
  /** something hit the water: a crown, droplets, a ring (size ~ metres) */
  splash(x: number, z: number, size = 0.5, o: { drops?: number; quiet?: boolean } = {}) {
    const y = this.waterY(x, z);
    this.vfx.play('splash', x, y + size * 0.25, z, { scale: clamp(size * 1.3, 0.35, 3) });
    this.vfx.play('ripple', x, y + 0.012, z, { scale: clamp(size * 1.6, 0.4, 4), speed: 0.9 });
    this.vfx.drops(x, y + 0.05, z, o.drops ?? Math.round(4 + size * 8), { speed: 0.8 + size * 1.6, up: 1.6 + size * 2.4, scale: clamp(0.8 + size * 0.6, 0.8, 2) });
    this.ripple(x, z, clamp(0.5 + size * 0.8, 0.4, 1.6));
  }
  private landed(x: number, _y: number, z: number, kind: LandKind, size: number, ramp: RampName) {
    const R = this.g.region;
    if (R.isWater(x, z)) { this.vfx.play('ripple', x, this.waterY(x, z) + 0.012, z, { scale: clamp(size * 3.2, 0.18, 0.6), speed: 1.3 }); return; }
    const y = R.heightAt(x, z), s = clamp(size * 1.2, 0.05, 0.16);
    if (kind === 'blood') { const bp = ramp === 'ichor' ? ICHOR_PRINT : BLOOD_PRINT; this.prints.add(x, y, z, Math.random() * TAU, s * 1.6, s * 1.6, Foot.BLOOD, bp.k, bp.life, this.t, bp.r, bp.g, bp.b, 1); }
    else { this.prints.add(x, y, z, Math.random() * TAU, s, s, Foot.SPOT, 0.85, 9, this.t, WET_PRINT.r, WET_PRINT.g, WET_PRINT.b, 1); if (kind === 'splash') this.vfx.play('rainhit', x, y + 0.02, z, { scale: 0.8 }); }
  }

  // ------------------------------------------------------------------ events -> hand-drawn effects
  private hooks() {
    const g = this.g, v = this.vfx;
    const golem = () => { const p = g.player; return p?.started && p.alive ? p : null; };
    g.on('hurt', (d: { amt?: number }) => {
      const p = golem(); if (!p) return;
      const y = p.y + p.height * 0.55, k = clamp((d?.amt ?? 3) / 8, 0.5, 1.4);
      v.play('impact', p.x, y, p.z, { scale: 0.55 * k, rot: Math.random() * TAU });
      v.play('spark', p.x + rnd(-0.1, 0.1), y + 0.05, p.z + rnd(-0.1, 0.1), { scale: 0.8 * k, rot: Math.random() * TAU, delay: 0.03 });
    });
    g.on('throw', () => {
      const p = golem(); if (!p) return;
      v.play('dust', p.x, this.surface(p.x, p.z) + 0.05, p.z, { scale: 0.5, ramp: this.dustRamp(p.x, p.z) });
    });
    g.on('gather', (d: { res?: string; x?: number; y?: number; z?: number }) => {
      if (d?.x === undefined || this.t - this.gatherT < 0.12) return;
      this.gatherT = this.t;
      v.play('sparkle', d.x, (d.y ?? this.surface(d.x, d.z ?? 0)) + 0.15, d.z ?? 0, { scale: 0.6, ramp: d.res === 'water' || d.res === 'carbon' ? 'glowTeal' : 'glowAmber' });
    });
    g.on('graft', (d: { x?: number; z?: number }) => {
      if (d?.x === undefined || d.z === undefined) return;
      const y = this.surface(d.x, d.z);
      v.play('leaves', d.x, y + 0.35, d.z, { scale: 1.1 });
      v.play('sparkle', d.x, y + 0.4, d.z, { scale: 1, ramp: 'glowTeal', delay: 0.1 });
    });
    const glow = (n: number, ramp: RampName) => {
      const p = golem(); if (!p) return;
      for (let i = 0; i < n; i++) v.play(i % 2 ? 'glint' : 'sparkle', p.x + rnd(-0.3, 0.3), p.y + p.height * rnd(0.3, 1.2), p.z + rnd(-0.3, 0.3), { scale: i % 2 ? 1.2 : 0.8, ramp, delay: i * 0.08 });
    };
    g.on('absorb', () => glow(5, 'glowTeal'));
    g.on('skill', () => glow(4, 'glowAmber'));
    g.on('convert', () => glow(3, 'glowTeal'));
    g.on('placed', (b: { x?: number; z?: number }) => {
      if (b?.x === undefined || b.z === undefined) return;
      const y = this.surface(b.x, b.z);
      v.play('poof', b.x, y + 0.4, b.z, { scale: 1.4, ramp: this.dustRamp(b.x, b.z) });
      v.play('shock', b.x, y + 0.03, b.z, { scale: 1.2, ramp: this.dustRamp(b.x, b.z) });
    });
    g.on('birth', (kid: Creature) => {
      if (!kid) return;
      v.play('sparkle', kid.x, kid.y + kid.size * 0.4, kid.z, { scale: 0.8, ramp: 'glowTeal' });
      v.play('dust', kid.x, kid.y + 0.04, kid.z, { scale: 0.5, ramp: this.dustRamp(kid.x, kid.z) });
    });
  }
  private damaged(c: Creature, amt: number, by: Creature | null) {
    const w = this.g.world;
    if (!c.mesh.visible || amt <= 0) return;
    // the golem's blows are drawn by combat; tendrils, storms and poison tick too often for a star each
    if (w.time - c.golemHit < 0.08) return;
    const last = this.hitT.get(c) ?? -9;
    const y = c.y + c.air + c.sp.pheno.height * c.growth * 0.5;
    const blood: RampName = c.sp.design.lineage === 'arthropod' ? 'ichor' : 'blood';
    if (by && amt >= 1.5 && this.t - last > 0.15) {
      this.hitT.set(c, this.t);
      const k = clamp(0.45 + c.size * 0.35, 0.45, 1.6);
      const dx = c.x - by.x, dz = c.z - by.z;
      this.vfx.play('impact', c.x - dx * 0.2, y, c.z - dz * 0.2, { scale: k * 0.8, rot: Math.random() * TAU });
      this.vfx.play('blood', c.x, y, c.z, { scale: k, ramp: blood, rot: Math.random() * TAU, flip: Math.random() < 0.5, delay: 0.04 });
      this.vfx.drops(c.x, y, c.z, 3 + Math.round(k * 3), { ramp: blood, land: 'blood', speed: 1.4, up: 1.6, scale: 1.2 });
    } else if (this.t - last > 0.6 && Math.random() < 0.35) {
      this.hitT.set(c, this.t);
      this.vfx.drops(c.x, y, c.z, 1, { ramp: blood, land: 'blood', speed: 0.6, up: 0.8, scale: 1.1 });
    }
  }
  /** the ramp loose ground kicks up in */
  private dustRamp(x: number, z: number): RampName {
    const R = this.g.region, b = R.b[clamp(Math.floor(z), 0, R.N - 1) * R.N + clamp(Math.floor(x), 0, R.N - 1)];
    return SOIL[b]?.dust ?? 'soil';
  }

  // ------------------------------------------------------------------ per frame
  update(simDt: number) {
    const now = performance.now(), g = this.g;
    let dt = Math.min(1 / 15, (now - this.last) / 1000) * g.engine.timeScale; this.last = now;
    if (g.paused || !(dt > 0)) dt = 0;
    this.t += dt;
    void simDt;
    const w = g.world, sun = w.sun;
    // sprites take the scene's light (unlit sprites would glow at night)
    const L = this.vfx.light;
    L.copy(sun.hemi.color).multiplyScalar(sun.hemi.intensity * 0.42).add(_c.copy(sun.light.color).multiplyScalar(sun.light.intensity * 0.2));
    const lm = Math.max(L.r, L.g, L.b); if (lm > 1.05) L.multiplyScalar(1.05 / lm);
    this.weather(dt);
    if (dt > 0) {
      this.creatures(dt);
      this.golem(dt);
      this.stones();
      this.debris(dt);
      this.ripples(dt);
    }
    this.vfx.update(dt);
    this.prints.flush(this.t);
  }

  private ripples(dt: number) {
    const r = this.rip, U = WATER_FX.uRip.value;
    for (let i = 0; i < RIPPLES; i++) {
      if (r[i * 4 + 3] > 0) { r[i * 4 + 2] += dt; if (r[i * 4 + 2] > 3.6) r[i * 4 + 3] = 0; }
      U[i].set(r[i * 4], r[i * 4 + 1], r[i * 4 + 2], r[i * 4 + 3]);
    }
  }
  /** the CPU twin of the shader's rings, for bobbing debris */
  private ringH(x: number, z: number) {
    const r = this.rip; let h = 0;
    for (let i = 0; i < RIPPLES; i++) {
      const s = r[i * 4 + 3]; if (s <= 0) continue;
      const age = r[i * 4 + 2], d = Math.hypot(x - r[i * 4], z - r[i * 4 + 1]), xx = d - (0.04 + age * (0.5 + s * 0.3));
      if (Math.abs(xx + 0.22) > 0.75) continue;
      h += Math.cos((xx * TAU) / (0.26 + age * 0.07)) * Math.exp(-(((xx + 0.2) / 0.3) ** 2)) * s * Math.exp(-age * 0.9) / (1 + d * 0.6);
    }
    return h;
  }

  // ------------------------------------------------------------------ creatures: wet, prints, splashes, wakes
  private wakes: { x: number; z: number; vx: number; vz: number; r: number; d: number }[] = [];
  private creatures(dt: number) {
    const g = this.g, w = g.world, R = g.region, tgt = g.cam.target, rain = this.rain;
    this.wakes.length = 0;
    for (const c of w.creatures) {
      let s = this.ct.get(c);
      if (!s) {
        s = { phase: c.anim.phase, wet: 0, inWater: false, drip: 0, ripT: 0, lr: -9, dustT: 0, glintT: 0, trail: 0, lx: c.x, lz: c.z, shape: footOf(c), foot: 0, mat: (c.mesh.material as THREE.MeshLambertMaterial).color ? c.mesh.material as THREE.MeshLambertMaterial : null, shown: 0, seen: 0 };
        let L = 0; for (const lg of c.sp.model.rig.legs) L = Math.max(L, lg.lens[0] + lg.lens[1]);
        s.foot = clamp((L || c.sp.pheno.length * 0.4) * 0.2, 0.035, 0.42) * (s.shape === Foot.PAD ? 1.5 : s.shape === Foot.INSECT ? 0.6 : s.shape === Foot.HOOF ? 0.85 : 1);
        this.ct.set(c, s);
      }
      s.seen = this.t;
      const near = (c.x - tgt.x) ** 2 + (c.z - tgt.z) ** 2 < 48 * 48;
      // ---- soaking and drying
      const grounded = !(c.canFly && c.air > 0.3);
      const inW = grounded && R.isWater(c.x, c.z);
      if (inW) s.wet = Math.min(1, s.wet + dt * 2.5);
      else s.wet = Math.max(0, s.wet - dt / (c.dead ? 60 : 32)) + (rain > 0 ? dt * rain * 0.05 : 0);
      s.wet = Math.min(1, s.wet);
      (c as unknown as { wet: number }).wet = s.wet;
      if (s.mat && Math.abs(s.shown - s.wet) > 0.02) { s.shown = s.wet; s.mat.color.setRGB(1 - 0.36 * s.wet, 1 - 0.32 * s.wet, 1 - 0.22 * s.wet); }
      // ---- deaths: the body drops in a puff of whatever it fell on
      if (c.dead) {
        if (!this.deadSeen.has(c)) {
          this.deadSeen.add(c);
          if (near && c.mesh.visible) {
            if (inW) this.splash(c.x, c.z, c.size * 0.7);
            else this.vfx.play('dust', c.x, this.surface(c.x, c.z) + 0.05, c.z, { scale: clamp(0.5 + c.size * 0.7, 0.5, 2.6), ramp: this.dustRamp(c.x, c.z), delay: 0.25 });
          }
        }
        s.inWater = inW;
        continue;
      }
      if (!near || !c.mesh.visible) { s.inWater = inW; s.phase = c.anim.phase; continue; }
      const sp = Math.hypot(c.vx, c.vz);
      // ---- water: entering, wading, leaving
      if (inW !== s.inWater) {
        if (inW && sp > 0.2) this.splash(c.x, c.z, clamp(c.size * 0.55, 0.25, 2), { drops: Math.round(3 + c.size * 5) });
        if (!inW) this.vfx.drops(c.x, c.y + c.size * 0.3, c.z, Math.round(2 + c.size * 3), { speed: 0.5, up: 0.6, land: 'wet' });
        s.inWater = inW;
      }
      if (inW && grounded) {
        if (sp > 0.12) this.wakes.push({ x: c.x, z: c.z, vx: c.vx, vz: c.vz, r: clamp(c.radius * 1.2, 0.12, 1.4), d: (c.x - tgt.x) ** 2 + (c.z - tgt.z) ** 2 });
        else if ((s.ripT -= dt) <= 0) { s.ripT = rnd(1.2, 2.6); this.ripple(c.x + rnd(-0.2, 0.2), c.z + rnd(-0.2, 0.2), clamp(0.2 + c.size * 0.15, 0.2, 0.6)); }
      }
      // ---- dripping and the wet sheen
      if (!inW && s.wet > 0.15) {
        s.drip += dt * s.wet * clamp(2 + c.size * 4, 2, 9);
        while (s.drip >= 1) {
          s.drip -= 1;
          const a = Math.random() * TAU, r = c.radius * Math.sqrt(Math.random());
          this.vfx.play('drop', c.x + Math.cos(a) * r, c.y + c.air + c.sp.pheno.height * c.growth * rnd(0.2, 0.5), c.z + Math.sin(a) * r, { vel: [0, -0.2, 0], grav: 9.8, align: true, land: 'wet', loop: 3 });
        }
        if ((s.glintT -= dt) <= 0) { s.glintT = rnd(0.3, 1.2) / s.wet; this.vfx.play('glint', c.x + rnd(-0.6, 0.6) * c.radius, c.y + c.air + c.sp.pheno.height * c.growth * rnd(0.55, 0.95), c.z + rnd(-0.6, 0.6) * c.radius, { scale: rnd(0.5, 0.9) }); }
      }
      // ---- prints
      const rig = c.sp.model.rig;
      if (s.shape === Foot.DRAG || s.shape === Foot.SLIME) {
        s.trail += Math.hypot(c.x - s.lx, c.z - s.lz);
        const step = Math.max(0.06, s.foot * 0.8);
        if (s.trail > step && !inW) {
          s.trail = 0;
          this.printAt(c.x, c.z, c.yaw, c.radius * 0.9, step * 2.2, s.shape, 1, s.wet, c.mass, inW);
        }
      } else if (rig.legs.length && sp > 0.08 && !(c.canFly && c.air > 0.2)) {
        const ph0 = s.phase, ph1 = c.anim.phase;
        const S = Math.max(0.05, rig.stride * (0.55 + 0.45 * clamp(sp / c.growth / (rig.stride * 3 + 0.1), 0, 1.4)));
        for (const lg of rig.legs) {
          const p0 = (ph0 + lg.phase) % 1, p1 = (ph1 + lg.phase) % 1;
          if (p1 >= p0 || ph1 === ph0) continue;
          this.footfall(c, s, lg, S);
        }
      }
      s.phase = c.anim.phase; s.lx = c.x; s.lz = c.z;
    }
    // forget creatures that left the world
    if (Math.random() < 0.02) for (const [c, s] of this.ct) if (this.t - s.seen > 2) this.ct.delete(c);
  }
  private footfall(c: Creature, s: CT, lg: LegDef, stride: number) {
    _v.set(lg.foot[0], 0, lg.foot[1] + stride * 0.5).applyMatrix4(c.mesh.matrixWorld);
    const R = this.g.region, x = _v.x, z = _v.z;
    if (R.isWater(x, z)) {
      // a footfall in the shallows: a ring and a few beads
      if (this.t - s.lr > 0.4) { s.lr = this.t; this.ripple(x, z, clamp(0.25 + c.size * 0.12, 0.25, 0.7)); }
      if (c.mass > 25 && Math.random() < 0.5) this.vfx.drops(x, this.waterY(x, z), z, 2, { speed: 0.6, up: 1.2 });
      return;
    }
    const shape = lg.kind === 'bird' ? Foot.THREE : lg.kind === 'insect' || lg.kind === 'spider' ? Foot.INSECT : s.shape;
    const sz = s.foot * c.growth * (shape === Foot.INSECT ? 0.6 : 1);
    this.printAt(x, z, c.yaw + (lg.side * 0.12), sz * (shape === Foot.HOOF ? 0.85 : 1), sz * 1.15, shape, lg.side, s.wet, c.mass, false);
    // heavy steps: trodden grass, dust off dry ground
    const b = R.b[clamp(Math.floor(z), 0, R.N - 1) * R.N + clamp(Math.floor(x), 0, R.N - 1)];
    if (c.mass > 30 && (b === B.GRASS || b === B.DRY) && Math.random() < 0.6) this.printAt(x - Math.sin(c.yaw) * sz, z - Math.cos(c.yaw) * sz, c.yaw, sz * 2.4, sz * 3.6, Foot.TRODDEN, 1, 0, c.mass, false);
    const so = SOIL[b];
    if (so?.dust && c.mass > 40 && (s.dustT -= 1) <= 0 && s.wet < 0.2 && this.wetGround < 0.3) {
      s.dustT = 2;
      this.vfx.play('dust', x, R.heightAt(x, z) + 0.04, z, { scale: clamp(0.35 + Math.cbrt(c.mass) * 0.07, 0.4, 1.5), ramp: so.dust, flip: lg.side < 0 });
    }
  }
  /** press a print into whatever ground is at (x, z) */
  private printAt(x: number, z: number, yaw: number, sx: number, sz: number, shape: Foot, side: number, wet: number, mass: number, inW: boolean) {
    if (inW) return;
    const R = this.g.region, N = R.N;
    const b = R.b[clamp(Math.floor(z), 0, N - 1) * N + clamp(Math.floor(x), 0, N - 1)];
    let so = SOIL[b];
    // rain softens everything; a wet foot marks even bare rock
    const wetG = this.wetGround;
    if (wet > 0.12 && (!so || so.k < 0.6)) so = WET_PRINT;
    if (!so) return;
    let k = so.k * (shape === Foot.TRODDEN ? 0.55 : 1) * clamp(0.7 + Math.cbrt(Math.max(0.1, mass)) * 0.08, 0.6, 1.25) * (1 + wetG * 0.3);
    if (so === WET_PRINT) k *= wet;
    const y = R.heightAt(x, z);
    const e = 0.25, nx = R.heightAt(x - e, z) - R.heightAt(x + e, z), nz = R.heightAt(x, z - e) - R.heightAt(x, z + e);
    _n.set(nx, 2 * e, nz).normalize();
    const life = so.life * (shape === Foot.TRODDEN ? 0.6 : 1) * (1 + wetG * 0.5);
    // a wet foot leaves a darker, glossier print
    const wr = wet > 0.12 && so !== WET_PRINT ? Math.min(1, wet) * 0.35 : 0;
    this.prints.add(x, y, z, yaw, sx * (side < 0 && shape !== Foot.DRAG && shape !== Foot.SLIME && shape !== Foot.TRODDEN ? -1 : 1), sz, shape, Math.min(1, k), life, this.t,
      so.r * (1 - wr), so.g * (1 - wr), so.b * (1 - wr * 0.6), shape === Foot.SLIME ? 1.25 : so.rim, _n);
  }

  // ------------------------------------------------------------------ the golem
  private golem(dt: number) {
    const g = this.g, p = g.player, R = g.region;
    if (!p?.started || !p.alive) { this.gWas = false; return; }
    const over = R.isWater(p.x, p.z), sp = Math.hypot(p.vx, p.vz);
    const wy = over ? this.waterY(p.x, p.z) : 0;
    if (over) {
      if (!this.gWas && sp > 0.4) this.splash(p.x, p.z, 0.35, { drops: 6 });
      if (sp > 0.15) this.wakes.push({ x: p.x, z: p.z, vx: p.vx, vz: p.vz, r: Math.max(0.12, p.radius), d: -1 });
      else if ((this.gRing -= dt) <= 0) { this.gRing = 1.1; this.ripple(p.x, p.z, 0.35); }
      // its field skims the surface: a fine spray at speed
      if (sp > 1.8 && Math.random() < dt * sp * 2) this.vfx.drops(p.x - p.vx * 0.05, wy + 0.02, p.z - p.vz * 0.05, 1, { speed: 0.6, up: 1.4, scale: 0.8 });
    } else {
      // a faint gravity scuff under it as it flies low, a dust wake on loose ground
      this.gTrail += Math.hypot(p.x - this.gx, p.z - this.gz);
      if (this.gTrail > 0.32 && sp > 0.6) {
        this.gTrail = 0;
        const y = R.heightAt(p.x, p.z), e = 0.25;
        _n.set(R.heightAt(p.x - e, p.z) - R.heightAt(p.x + e, p.z), 2 * e, R.heightAt(p.x, p.z - e) - R.heightAt(p.x, p.z + e)).normalize();
        const b = R.b[clamp(Math.floor(p.z), 0, R.N - 1) * R.N + clamp(Math.floor(p.x), 0, R.N - 1)], so = SOIL[b];
        const k = so ? 0.35 + so.k * 0.35 : 0.25;
        this.prints.add(p.x, y, p.z, Math.atan2(p.vx, p.vz), p.radius * 2.6, p.radius * 2.6, Foot.SCUFF, k, 7, this.t, so ? so.r : 0.82, so ? so.g : 0.82, so ? so.b : 0.84, so ? so.rim : 1.05, _n);
        if (p.wet > 0.15) this.prints.add(p.x + rnd(-0.1, 0.1), y, p.z + rnd(-0.1, 0.1), Math.random() * TAU, 0.08, 0.08, Foot.SPOT, p.wet, 8, this.t, WET_PRINT.r, WET_PRINT.g, WET_PRINT.b, 1, _n);
      }
      const b = R.b[clamp(Math.floor(p.z), 0, R.N - 1) * R.N + clamp(Math.floor(p.x), 0, R.N - 1)], so = SOIL[b];
      if (so?.dust && sp > 2.2 && this.wetGround < 0.3 && (this.gDust -= dt) <= 0) {
        this.gDust = 0.22;
        this.vfx.play('dust', p.x - p.vx * 0.08, R.heightAt(p.x, p.z) + 0.03, p.z - p.vz * 0.08, { scale: 0.45, ramp: so.dust, flip: Math.random() < 0.5 });
      }
      if ((b === B.GRASS || b === B.LITTER) && sp > 3 && (this.gLeaf -= dt) <= 0) { this.gLeaf = rnd(0.5, 1.2); this.vfx.play('leaves', p.x, R.heightAt(p.x, p.z) + 0.25, p.z, { scale: 0.7, ramp: b === B.LITTER ? 'rust' : 'moss' }); }
    }
    // dripping after a dip
    if (!over && p.wet > 0.12) {
      this.gDrip += dt * p.wet * 7;
      while (this.gDrip >= 1) { this.gDrip -= 1; this.vfx.play('drop', p.x + rnd(-1, 1) * p.radius * 0.8, p.y + p.height * rnd(0.05, 0.35), p.z + rnd(-1, 1) * p.radius * 0.8, { vel: [p.vx * 0.3, -0.3, p.vz * 0.3], grav: 9.8, align: true, land: 'wet', loop: 3 }); }
    }
    this.gWas = over; this.gx = p.x; this.gz = p.z;
    // the wakes of everything in the water, nearest the view first (the golem always gets one)
    this.wakes.sort((a, b) => a.d - b.d);
    const U = WATER_FX.uWake.value, UR = WATER_FX.uWakeR.value;
    for (let i = 0; i < WAKES; i++) { const k = this.wakes[i]; if (k) { U[i].set(k.x, k.z, k.vx, k.vz); UR[i] = k.r; } else U[i].set(0, 0, 0, 0); }
  }
  /** thrown stones that find the water */
  private stones() {
    const list = this.g.player?.stones?.list; if (!list) return;
    for (const s of list) {
      if (s.state !== 'sink' || this.stoneSeen.has(s)) continue;
      this.stoneSeen.add(s);
      if (s.t < 0.2) this.splash(s.p.x, s.p.z, clamp(s.r * 4, 0.3, 1.4));
    }
  }

  // ------------------------------------------------------------------ floating debris
  private buildFlow() {
    const R = this.g.region, N = R.N, f = new Float32Array(N * N * 2), best = new Float32Array(N * N).fill(1e9);
    for (const pts of R.rivers) for (let k = 0; k < pts.length; k++) {
      const p = pts[k], a = pts[Math.max(0, k - 2)], b = pts[Math.min(pts.length - 1, k + 2)];
      const tx = b.x - a.x, tz = b.z - a.z, tl = Math.hypot(tx, tz) || 1, rad = p.w + 1.6;
      for (let z = Math.max(0, Math.floor(p.z - rad)); z <= Math.min(N - 1, Math.ceil(p.z + rad)); z++) for (let x = Math.max(0, Math.floor(p.x - rad)); x <= Math.min(N - 1, Math.ceil(p.x + rad)); x++) {
        const d = Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z), i = z * N + x;
        if (d > rad || d >= best[i]) continue;
        best[i] = d;
        const edge = clamp(1 - d / rad, 0.15, 1);
        f[i * 2] = (tx / tl) * p.v * edge; f[i * 2 + 1] = (tz / tl) * p.v * edge;
      }
    }
    return f;
  }
  private debris(dt: number) {
    const g = this.g, R = g.region, N = R.N, tgt = g.cam.target, pal = R.pal;
    const want = Math.round(14 + R.biome.flora * 14);
    let alive = 0;
    for (const d of this.db) if (d.on) alive++;
    // seed new pieces on open water around the view
    for (let tries = 0; tries < 3 && alive < want; tries++) {
      const a = Math.random() * TAU, r = rnd(2, 17), x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r;
      if (x < 1 || z < 1 || x > N - 1 || z > N - 1 || !R.isWater(x, z) || R.heightAt(x, z) > this.waterY(x, z) - 0.06) continue;
      const twig = Math.random() < 0.18;
      const d = this.db.find((q) => !q.on && q.twig === twig); if (!d) continue;
      d.on = true; d.x = x; d.z = z; d.yaw = Math.random() * TAU; d.spin = rnd(-0.4, 0.4); d.ph = Math.random() * TAU; d.age = 0; d.beach = 0;
      d.s = twig ? rnd(0.16, 0.3) : rnd(0.07, 0.14);
      const cols = twig ? [0x7a5a3a, 0x6a4a30, 0x8a6a48] : [...pal.foliage, ...pal.foliage, ...pal.bloom.slice(0, 2), 0xb8a040, 0xa06a30];
      const im = twig ? this.twigs : this.leaves, idx = this.db.indexOf(d) - (twig ? 48 : 0);
      im.setColorAt(idx, _c.set(cols[Math.floor(Math.random() * cols.length)]).multiplyScalar(rnd(0.85, 1.1)));
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      alive++;
    }
    const p = g.player, wind = g.world.sun.env.wind;
    for (let i = 0; i < this.db.length; i++) {
      const d = this.db[i], im = d.twig ? this.twigs : this.leaves, idx = d.twig ? i - 48 : i;
      if (d.on) {
        d.age += dt;
        const ci = clamp(Math.floor(d.z), 0, N - 1) * N + clamp(Math.floor(d.x), 0, N - 1);
        const wet = R.isWater(d.x, d.z);
        let vx = this.flow[ci * 2] + wind.x * 0.06, vz = this.flow[ci * 2 + 1] + wind.y * 0.06;
        // pushed off by whatever moves through the water
        if (p?.started) { const dx = d.x - p.x, dz = d.z - p.z, dd = Math.hypot(dx, dz); if (dd < 0.7 && dd > 1e-3) { const k = (0.7 - dd) * 3; vx += (dx / dd) * k; vz += (dz / dd) * k; d.spin += (Math.random() - 0.5) * dt * 6; } }
        for (const wk of this.wakes) { const dx = d.x - wk.x, dz = d.z - wk.z, dd = Math.hypot(dx, dz), R0 = wk.r + 0.5; if (dd < R0 && dd > 1e-3) { vx += (dx / dd) * (R0 - dd) * 2.5; vz += (dz / dd) * (R0 - dd) * 2.5; } }
        if (wet) { d.x += vx * dt; d.z += vz * dt; d.beach = 0; } else d.beach += dt;
        d.spin *= Math.exp(-dt * 0.5);
        d.yaw += d.spin * dt;
        if (d.age > 120 || d.beach > 5 || (d.x - tgt.x) ** 2 + (d.z - tgt.z) ** 2 > 24 * 24 || d.x < 0.5 || d.z < 0.5 || d.x > N - 0.5 || d.z > N - 0.5) d.on = false;
      }
      if (!d.on) { _m.makeScale(0, 0, 0); im.setMatrixAt(idx, _m); continue; }
      const fade = Math.min(1, d.age * 2) * (1 - clamp(d.beach / 5, 0, 1));
      const rh = this.ringH(d.x, d.z), wet = R.isWater(d.x, d.z);
      const y = (wet ? this.waterY(d.x, d.z) : R.heightAt(d.x, d.z)) + 0.008 + Math.sin(this.t * 1.6 + d.ph) * 0.006 + rh * 0.03;
      _qy.setFromAxisAngle(UP, d.yaw);
      _q.setFromAxisAngle(_v.set(Math.cos(d.ph), 0, Math.sin(d.ph)), rh * 0.25 + Math.sin(this.t * 1.3 + d.ph) * 0.06).multiply(_qy);
      _m.compose(_v.set(d.x, y, d.z), _q, _s.set(d.s * fade, 1, d.s * fade * (d.twig ? 1 : 1.3)));
      im.setMatrixAt(idx, _m);
    }
    this.leaves.count = 48; this.twigs.count = 14;
    this.leaves.instanceMatrix.needsUpdate = true; this.twigs.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ weather and humidity
  private weather(dt: number) {
    const g = this.g, w = g.world, R = g.region, sun = w.sun, env = sun.env, bi = R.biome, hum = bi.moist;
    // showers come and go
    if (this.forced !== null) this.rainGoal = this.forced;
    else if (this.showerDur > 0) {
      this.showerT += dt;
      const t = this.showerT, D = this.showerDur;
      this.rainGoal = (t < D ? clamp(t / 14, 0, 1) * clamp((D - t) / 16, 0, 1) : 0) * clamp(0.45 + hum * 0.6, 0.4, 1);
      if (t >= D) { this.showerDur = 0; this.nextShower = rnd(160, 420) / Math.max(0.3, hum); }
    } else if ((this.nextShower -= dt) <= 0) { this.showerDur = rnd(50, 110); this.showerT = 0; }
    // cloud gathers before the rain and lingers after it
    const goal = this.rainGoal;
    this.rain += (goal - this.rain) * Math.min(1, dt * 0.35);
    sun.overcast += (Math.min(1, goal * 1.15) - sun.overcast) * Math.min(1, dt * (goal > sun.overcast ? 0.5 : 0.12));
    // the ground soaks fast and dries slowly
    this.wetGround = this.rain > this.wetGround ? Math.min(1, this.wetGround + dt * this.rain / 18) : Math.max(0, this.wetGround - dt / 140);
    env.rain = this.rain; env.wet = this.wetGround;
    WATER_FX.uRainW.value = this.rain;
    // humidity: mist pooling over water and in hollows (thickest at dawn and after rain), haze, light shafts
    const d = w.day, elev = Math.cos((d - 0.25) * TAU);
    const dawn = clamp(1 - Math.abs(((d + 0.5) % 1) - 0.5 - 0.02) / 0.12, 0, 1);
    env.mistY = R.water + 0.15; env.mistH = 0.9 + hum * 1.1;
    env.mist = (0.01 + hum * 0.05) * (1 + dawn * 1.4 + this.wetGround * 0.5) * (elev < 0 ? 1.3 : 1);
    env.patch = 0.75;
    env.haze = 0.0028 + hum * 0.0035 + this.rain * 0.005;
    env.rays = clamp((0.3 + hum * 0.7) * (1 + dawn * 0.6 + (elev < 0.5 ? 0.4 : 0)) * (1 - this.rain * 0.8), 0, 1.2);
    // dew on the morning leaves (and on everything after rain), shimmer over hot dry ground at midday
    env.dew = clamp(dawn * (0.4 + hum) + this.wetGround * 0.5 * (1 - this.rain), 0, 1);
    env.heat = clamp((bi.temp - 0.6) * 2.6, 0, 1) * clamp(1.2 - hum * 1.5, 0, 1) * clamp((elev - 0.3) * 2, 0, 1) * (1 - this.wetGround);
    // wind wanders
    env.wind.set(0.3 + Math.sin(this.t * 0.031) * 0.25 + this.rain * 0.6, 0.12 + Math.cos(this.t * 0.023) * 0.2);
    // rain streaks and splash pops around the view
    const rm = this.rainMesh, U = this.rainU, on = this.rain > 0.01;
    rm.visible = on;
    if (!on) return;
    const tgt = g.cam.target, dist = g.cam.dist;
    const box = clamp(dist * 1.3, 18, 60);
    (U.uBox.value as THREE.Vector3).set(box, Math.min(26, box * 0.7), box);
    (U.uCenter.value as THREE.Vector3).set(tgt.x, tgt.y + Math.min(26, box * 0.7) * 0.35, tgt.z);
    (U.uFall.value as THREE.Vector3).set(env.wind.x * 1.6, -11, env.wind.y * 1.6);
    U.uTime.value = this.t;
    (U.uRes.value as THREE.Vector2).set(g.engine.w, g.engine.h);
    U.uPx.value = Math.max(0.6, g.engine.h / 900);
    (U.uCol.value as THREE.Color).setRGB(0.8, 0.88, 1.0).multiply(this.vfx.light).multiplyScalar(1.15);
    const maxN = (rm as unknown as { maxN: number }).maxN;
    (rm.geometry as THREE.InstancedBufferGeometry).instanceCount = Math.floor(maxN * this.rain * clamp(box / 26, 0.65, 1));
    this.hitAcc += dt * this.rain * 70;
    while (this.hitAcc >= 1) {
      this.hitAcc -= 1;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * Math.min(14, box * 0.45), x = tgt.x + Math.cos(a) * r, z = tgt.z + Math.sin(a) * r;
      if (x < 0.5 || z < 0.5 || x > R.N - 0.5 || z > R.N - 0.5 || R.isWater(x, z)) continue;
      this.vfx.play('rainhit', x, R.heightAt(x, z) + 0.02, z, { scale: rnd(0.8, 1.2), flip: Math.random() < 0.5 });
    }
  }
}

/** the game's details system, if one is running */
export function detailsOf(g: Game): Details | null { return (g as unknown as { details?: Details }).details ?? null; }
export type { VfxName };
