// Water: the sea plane and the river ribbons share one shading function so the two meet without a seam. The bed is
// seen through the water (its own block texture, rippled and laced with caustic light) and is swallowed by the
// turquoise-to-deep-teal body as depth grows; shores get a lapping pale rim, the surface shimmers with sparse sun
// glints. Rivers add a current: flow-aligned streaks and ripples scrolling downstream at the local speed, white water
// along the banks, trailing behind stones and through the rapids. Everything is pixel-snapped at 32 px/m.
// Interactive water (fed by game/details.ts through WATER_FX): rings spreading from every entry, splash, footfall and
// drip, V-shaped Kelvin wakes with a foam lip round whatever wades or skims, raindrop rings while it rains. Water
// marks itself in the G-buffer with flag bit 16 so the post pass can tell it from wet ground.
import * as THREE from 'three';
import type { Region } from './region';
import { GN_DECL } from '../gfx/gbuf';
import { SHADER_NOISE, FOW_FN } from './glsl';
import { VEYR } from './palette';

const RIP_N = 24, WAKE_N = 6;
const WATER_FN = /* glsl */`
uniform highp sampler2DArray uBlocks;
uniform sampler2D uHeight, uMat, uVis, uMoss, uFoamMap;
uniform float uN, uTime, uWater;
uniform float uLay[32];
uniform vec3 uShallow, uDeep, uFoam, uDark, uSky, uMossC;
uniform vec4 uRip[${RIP_N}];
uniform vec4 uWake[${WAKE_N}];
uniform float uWakeR[${WAKE_N}];
uniform float uRainW;
${SHADER_NOISE}
${FOW_FN}
/** a hand-drawn ring's "radius": an octagon, never a circle */
float octR(vec2 v) { v = abs(v); return max(max(v.x, v.y), (v.x + v.y) * 0.7071); }
/** rings break into arcs: a few legs of the octagon are left out (which ones depends on the ring) */
float legOn(vec2 v, float seed) { float a = atan(v.y, v.x) / 6.2832 + 0.5; return step(0.24, fract(sin(floor(a * 8.0 + 0.5) * 12.9898 + seed * 78.233) * 43758.5453)); }
/** rings and wakes at p: a height-like signal (crest > 0, trough < 0) and a foam amount */
vec2 interact(vec2 p, float t) {
  float h = 0.0, fm = 0.0;
  for (int i = 0; i < ${RIP_N}; i++) {
    vec4 r = uRip[i];
    if (r.w <= 0.0) continue;
    float age = r.z, d = octR(p - r.xy);
    // a short wave train behind a leading crest; it spreads, slows and flattens
    float x = d - (0.04 + age * (0.5 + r.w * 0.3));
    if (abs(x + 0.22) > 0.75) continue;
    float lam = 0.26 + age * 0.07;
    float a = r.w * exp(-age * 0.9) / (1.0 + d * 0.6);
    a *= legOn(p - r.xy, float(i) + floor(r.x * 7.0));
    h += cos(x * 6.2832 / lam) * exp(-pow((x + 0.2) / 0.3, 2.0)) * a;
    fm = max(fm, (1.0 - smoothstep(0.0, 0.05, abs(x))) * a * step(age, 0.35) * 2.0);
  }
  for (int i = 0; i < ${WAKE_N}; i++) {
    vec4 w = uWake[i];
    float sp = length(w.zw);
    if (sp < 0.04) continue;
    vec2 dir = -w.zw / sp, q = p - w.xy;
    float al = dot(q, dir), ac = dot(q, vec2(-dir.y, dir.x)), rad = uWakeR[i];
    float L = rad * 2.5 + sp * 1.8, k = min(1.0, sp / 1.1);
    if (al < -rad * 1.6 || al > L || abs(ac) > L * 0.5 + rad) continue;
    // the two arms of the V (~19.5 degrees), a crest with a trough just outside it
    float arm = abs(ac) - (al + rad * 0.7) * 0.36;
    float wd = 0.035 + max(0.0, al) * 0.04, fall = (1.0 - al / L) * step(-rad * 0.3, al);
    h += ((1.0 - smoothstep(0.0, wd, abs(arm))) - 0.6 * (1.0 - smoothstep(0.0, wd, abs(arm - wd * 2.0)))) * fall * k * 1.3;
    // churned water straight behind, and a foam lip hugging the body
    float trail = (1.0 - smoothstep(rad * 0.3, rad * 0.9, abs(ac))) * (1.0 - smoothstep(0.0, L * 0.45, al)) * step(0.0, al);
    float lip = (1.0 - smoothstep(0.0, 0.06, abs(octR(q) - rad * 1.05))) * legOn(q, float(i));
    fm = max(fm, max(trail * vn(vec2(ac * 9.0, (al + t * sp) * 5.0)) * 1.4, lip * (0.5 + 0.5 * k)) * k);
  }
  return vec2(h, fm);
}
float hAt(vec2 p) { if (p.x < 0.0 || p.y < 0.0 || p.x >= uN || p.y >= uN) return -2.0; return texture2D(uHeight, (floor(p) + 0.5) / uN).r; }
float bedH(vec2 p) {
  vec2 q = p - 0.5; vec2 i = floor(q), f = q - i;
  return mix(mix(hAt(i), hAt(i + vec2(1.0, 0.0)), f.x), mix(hAt(i + vec2(0.0, 1.0)), hAt(i + vec2(1.0, 1.0)), f.x), f.y);
}
float caustic(vec2 p, float t) {
  float a = vn(p * 1.6 + vec2(t * 0.21, t * 0.13)), b = vn(p * 1.9 + vec2(-t * 0.17, t * 0.19) + 4.7);
  return smoothstep(0.86, 0.97, 1.0 - abs(a - b));
}
/** wp: world xz; surf: surface height; flowK 0 (still) .. 1 (river); fuv: (across, along) metres; sp: flow speed */
vec3 waterShade(vec2 wp, float surf, float flowK, vec2 fuv, float sp) {
  vec2 px = floor(wp * 32.0);
  vec2 p = (px + 0.5) / 32.0;
  float t = uTime;
  float depth = max(0.0, surf - bedH(p));
  vec2 ia = interact(p, t);
  // ripples bend the view of the bed a little
  vec2 rip = vec2(vn(p * 2.3 + t * 0.4), vn(p * 2.3 - t * 0.35 + 9.0)) - 0.5 + ia.x * 0.35;
  if (flowK > 0.0) rip += vec2(0.0, vn(vec2(fuv.x * 3.0, (fuv.y - t * sp) * 1.4)) - 0.5) * flowK * 0.6;
  vec2 bp = p + rip * 0.12 * min(1.0, depth * 2.0);
  // the bed's material, looked up with the same wavy, grainy jitter the terrain uses (no square cell borders)
  vec2 mw = vec2(vn(bp * 0.55 + 3.1), vn(bp * 0.55 + 17.7)) - 0.5, mg = vec2(h2(px), h2(px + 31.0)) - 0.5;
  vec2 mp = bp + mw * 1.5 + mg * 0.55;
  float mid = floor(texture2D(uMat, (floor(clamp(mp, vec2(0.0), vec2(uN - 0.01))) + 0.5) / uN).r * 255.0 + 0.5);
  vec3 bed = texture(uBlocks, vec3(bp, uLay[int(mid) * 2]), -0.35).rgb;
  bed *= 0.72 + caustic(bp, t) * 0.75 * exp(-depth * 0.8);
  // the water body: clear and turquoise in the shallows, deep teal further down
  float murk = 1.0 - exp(-depth * 1.35);
  vec3 body = mix(uShallow, uDeep, smoothstep(0.15, 3.2, depth) * 0.82);
  vec3 c = mix(bed * mix(vec3(1.0), uShallow * 1.5, 0.55), body, clamp(0.18 + murk * 0.9, 0.0, 1.0));
  // slow mottling and a whisper of sky
  c *= 0.93 + (vn(p * 0.8 + vec2(t * 0.05, t * 0.03)) * 0.6 + vn(p * 2.1 - t * 0.07) * 0.4) * 0.14;
  c = mix(c, uSky, 0.06);
  // the current
  float foam = 0.0;
  if (flowK > 0.0) {
    // streaks: long thin lines drawn out along the current, bright on their crests with a darker trough behind
    vec2 q = vec2(fuv.x * 2.6, (fuv.y - t * sp) * 0.42);
    float s = vn(q + vec2(vn(q * 0.6 + 3.0) * 1.8, 0.0));
    float streak = smoothstep(0.58, 0.63, s) * (1.0 - smoothstep(0.66, 0.72, s));
    float trough = smoothstep(0.4, 0.46, s) * (1.0 - smoothstep(0.5, 0.56, s));
    c = mix(c, mix(uShallow * 1.15, uFoam, 0.6), streak * 0.6 * flowK);
    c *= 1.0 - trough * 0.12 * flowK;
    // chop: short ripples riding the current
    float ch = vn(vec2(fuv.x * 6.0, (fuv.y - t * sp * 1.25) * 2.6));
    c *= 1.0 + (ch - 0.5) * 0.22 * flowK;
    if (ch > 0.8) c = mix(c, uShallow * 1.35 + 0.06, 0.3 * flowK);
    float edge = 1.0 - smoothstep(0.0, 0.16 + sp * 0.05, depth);
    float wake = texture2D(uFoamMap, p / uN).r;
    float rapid = smoothstep(1.2, 2.3, sp) * smoothstep(0.52, 0.72, vn(vec2(fuv.x * 3.5, (fuv.y - t * sp * 1.4) * 1.1)));
    float fn = vn(vec2(fuv.x * 7.0, (fuv.y - t * sp * 1.6) * 2.6));
    foam = max(max(edge * 0.75, wake), rapid) * (0.55 + fn * 0.9) * flowK;
  }
  // the rings and wakes: crisp light crests, darker troughs, white water where they break
  // (a darker trough line keeps them readable on pale shallows too)
  c *= 1.0 + clamp(ia.x, -1.0, 1.0) * 0.12;
  if (ia.x > 0.2) c = mix(c, uFoam, 0.45);
  else if (ia.x < -0.2) c = mix(c, uDeep, 0.4);
  foam = max(foam, ia.y);
  // rain: little rings popping all over the surface
  if (uRainW > 0.01) {
    vec2 q = p * 1.6, ci = floor(q), f = fract(q) - 0.5 - (vec2(h2(ci), h2(ci + 5.3)) - 0.5) * 0.5;
    float tc = t * 1.4 + h2(ci + 2.7), ph = fract(tc);
    float ring = (1.0 - step(0.035, abs(octR(f) - ph * 0.36))) * step(h2(ci + floor(tc) * 1.3), uRainW) * step(ph, 0.85) * legOn(f, h2(ci));
    c = mix(c, ph < 0.45 ? uFoam : uDeep, ring * 0.6);
    c *= 1.0 - uRainW * 0.1;
  }
  // shoreline: a pale lapping rim
  float lap = 0.5 + 0.5 * sin(t * 1.3 + vn(p * 0.7) * 6.0);
  float shore = 1.0 - smoothstep(0.0, 0.06 + lap * 0.1, depth);
  foam = max(foam, shore * 0.8);
  if (foam > 0.5) c = mix(c, uFoam, foam > 0.75 ? 0.82 : 0.5);
  // glints: sparse twinkles, rarer bright sun sparkles on open water
  float g1 = h2(px + floor(t * 2.2 + h2(px) * 9.0) * 3.7);
  float g2 = h2(floor(px / 2.0) * 1.7 + floor(t * 1.4 + h2(floor(px / 2.0)) * 5.0));
  float gk = 1.0 - smoothstep(0.6, 2.5, depth) * 0.9;
  gk *= 1.0 - flowK * 0.55;
  if (g1 > 1.0 - 0.01 * gk) c = mix(c, vec3(1.0), 0.38);
  else if (g1 > 1.0 - 0.035 * gk) c = mix(c, uShallow * 1.3 + 0.05, 0.22);
  if (g2 > 0.995 && depth > 0.25) c = mix(c, vec3(1.25, 1.2, 1.1), 0.7);
  // Veyr moss / rival creep reaching the water: floating mats along the margins
  vec4 cov = texture2D(uMoss, p / uN);
  if (cov.r > 0.55 + h2(px) * 0.25 && depth < 0.6) c = mix(c, uMossC, 0.45);
  return applyFow(c, vec3(wp.x, 0.0, wp.y));
}
`;

/** the interactive-water inputs every water material shares (written each frame by game/details.ts) */
export const WATER_FX = {
  /** rings: (x, z, age seconds, strength; 0 = unused) */
  uRip: { value: Array.from({ length: RIP_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  /** wakes: (x, z, vx, vz) of whatever moves through the water, and its radius */
  uWake: { value: Array.from({ length: WAKE_N }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uWakeR: { value: new Array(WAKE_N).fill(0.3) as number[] },
  /** raindrop rings 0..1 */
  uRainW: { value: 0 },
};
export const RIPPLES = RIP_N, WAKES = WAKE_N;

function uniforms(R: Region, U: Record<string, THREE.IUniform>) {
  const pal = R.pal;
  return {
    ...WATER_FX,
    uBlocks: U.uBlocks, uHeight: U.uHeight, uMat: U.uMat, uVis: U.uVis, uMoss: U.uMoss, uN: U.uN, uTime: U.uTime, uWater: U.uWater, uLay: U.uLay, uDark: U.uDark,
    uShallow: { value: new THREE.Color(pal.water) }, uDeep: { value: new THREE.Color(pal.waterDeep) }, uFoam: { value: new THREE.Color(pal.foam) },
    uSky: { value: new THREE.Color(pal.sky) }, uMossC: { value: new THREE.Color(VEYR.moss) },
    uFoamMap: { value: foamMap(R) },
  };
}

/** white water behind stones standing in the current */
function foamMap(R: Region) {
  const N = R.N, d = new Uint8Array(N * N);
  for (const p of R.rocks) {
    if (p.kind !== 'river') continue;
    const ry = R.riverAt(p.x, p.z);
    if (ry <= 0 || p.y + p.sy < ry - 0.3) continue;
    const rad = Math.max(p.sx, p.sz) + 0.6;
    for (let z = Math.floor(p.z - rad); z <= Math.ceil(p.z + rad); z++) for (let x = Math.floor(p.x - rad); x <= Math.ceil(p.x + rad); x++) {
      if (!R.inside(x, z)) continue;
      const k = 1 - Math.hypot(x + 0.5 - p.x, z + 0.5 - p.z) / rad;
      if (k > 0) d[z * N + x] = Math.max(d[z * N + x], Math.round(Math.min(1, k * 1.6) * 255));
    }
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}

const VERT_SEA = /* glsl */`
varying vec3 vWp;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG_SEA = /* glsl */`
${GN_DECL}
${WATER_FN}
varying vec3 vWp;
void main() {
  gl_FragColor = vec4(waterShade(vWp.xz, uWater, 0.0, vec2(0.0), 0.0), 1.0);
  gNormal = vec4(0.5, 1.0, 0.5, 16.0);
}`;

const VERT_RIVER = /* glsl */`
attribute vec2 aFlow; attribute vec2 aSpeed;
varying vec3 vWp; varying vec2 vFlow; varying vec2 vSpeed;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vFlow = aFlow; vSpeed = aSpeed; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG_RIVER = /* glsl */`
${GN_DECL}
${WATER_FN}
varying vec3 vWp; varying vec2 vFlow; varying vec2 vSpeed;
void main() {
  // flow coordinates at the centre of this world pixel (so the current is pixel-snapped like everything else)
  vec2 wpS = (floor(vWp.xz * 32.0) + 0.5) / 32.0;
  mat2 A = mat2(dFdx(vWp.xz), dFdy(vWp.xz)), Bm = mat2(dFdx(vFlow), dFdy(vFlow));
  vec2 fuv = vFlow;
  if (abs(determinant(A)) > 1e-10) fuv += Bm * inverse(A) * (wpS - vWp.xz);
  gl_FragColor = vec4(waterShade(vWp.xz, vWp.y, vSpeed.y, fuv, vSpeed.x), 1.0);
  gNormal = vec4(0.5, 1.0, 0.5, 16.0);
}`;

export function makeSea(R: Region, U: Record<string, THREE.IUniform>): THREE.Mesh {
  const N = R.N, g = new THREE.PlaneGeometry(N + 400, N + 400, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(N / 2, R.water, N / 2);
  const m = new THREE.ShaderMaterial({ uniforms: uniforms(R, U), vertexShader: VERT_SEA, fragmentShader: FRAG_SEA });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'water';
  return mesh;
}

/** ribbons along the river centre lines, at the water surface, reaching under the banks on both sides */
export function makeRivers(R: Region, U: Record<string, THREE.IUniform>): THREE.Mesh | null {
  if (!R.rivers.length) return null;
  const pos: number[] = [], flow: number[] = [], speed: number[] = [], idx: number[] = [];
  for (const all of R.rivers) {
    // only the part over the map: off the rim there is no ground to hold it
    const pts = all.filter((q) => q.x > 0.25 && q.z > 0.25 && q.x < R.N - 0.25 && q.z < R.N - 0.25);
    if (pts.length < 4) continue;
    const step = 2, n = Math.floor((pts.length - 1) / step) + 1, base = pos.length / 3;
    const mouth = pts.find((q) => q.y <= R.water + 0.02)?.s ?? 1e9;
    for (let j = 0; j < n; j++) {
      const k = Math.min(pts.length - 1, j * step), p = pts[k];
      const a = pts[Math.max(0, k - 2)], b = pts[Math.min(pts.length - 1, k + 2)];
      let tx = b.x - a.x, tz = b.z - a.z; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const half = p.w + 1.4, nx = -tz, nz = tx;
      // fade the current into still water where the river meets the sea, and sink the ribbon under it there
      const fk = Math.min(1, Math.max(0, (mouth - p.s) / 9));
      const y = p.y > R.water + 0.02 ? Math.max(p.y, R.water + 0.035) : R.water - 0.04;
      for (const sg of [-1, 1]) {
        pos.push(p.x + nx * half * sg, y, p.z + nz * half * sg);
        flow.push(half * sg, p.s);
        speed.push(p.v, Math.max(0, fk));
      }
      if (j < n - 1) { const q = base + j * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
  g.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speed, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.ShaderMaterial({ uniforms: uniforms(R, U), vertexShader: VERT_RIVER, fragmentShader: FRAG_RIVER, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = 'river';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}
