// UI KIT · THE MACHINE: the kit's detailed boxes as real 3D hardware drawn into the 2D UI, ported from Limbophobia's
// round-16 machine kit (src/ui/machine/core.ts, parts.ts, paint.ts and touch/facet.ts; same author). DOM stays DOM (text,
// focus, scrolling, clicks); the hardware round it is a small faceted 3D object drawn ONCE (when its element changes size)
// by one shared WebGL context into a canvas behind the element, one art pixel per CSS pixel:
//   - an oblique (cabinet) camera: the z = 0 plane maps 1:1 onto the element, whatever stands out of it slides up and
//     left, so raised parts show their shaded thickness and a sunk slot shows its walls;
//   - banded key light from the upper left, stepped speculars on metal, a 1 px ink outline, ink contours where a nearer
//     part steps over a farther one, a dithered drop shadow, ordered-dither quantising;
//   - faces painted from the MATERIAL LIBRARY (src/gfx/mat via libmat.ts) at one texel per pixel, then worn the
//     Limbophobia way: mottling and grime that gathers low, chipped edges to primer and bare steel, scratches, rust
//     running from bolts, grime dribbling from vents and glands, grooved seams, hazard paint, stencils;
//   - hardware with the library's machined metal in its grain: hex bolts with washers, slotted screws, domed rivets,
//     corner guards, raised rails, window lips, louvred vents, cable glands with drooping cables, weld beads, handles,
//     glass lamps with halos, toggles, knobs, printed nameplates.
//   housing(spec) -> { root, lamps }       one housing (HousingSpec below), scene units = CSS px, y down in the spec
//   socketPart(size, st) / keyPart(spec, st)   an item slot cup / a push key
//   shoot(root, w, h, pad, ctx, dx, dy, o)  render one part into a 2D context
//   sheet(key, w, h, pad, frames, build)    a cached strip of renders (states / animation frames)
import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { libColor, libSample, LIB } from './libmat';
import { bitText, bitMeasure } from './bitfont';

const PI = Math.PI;
export const R90 = PI / 2;

// ================================================================== facets (low-poly building blocks, flat shaded)
function flat(g: THREE.BufferGeometry): THREE.BufferGeometry { const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); n.computeVertexNormals(); return n; }
function phash(x: number, y: number, z: number, s: number) { const v = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719 + s * 4.1) * 43758.5453; return v - Math.floor(v); }
function jitter(g: THREE.BufferGeometry, amt: number, seed = 1, scale = 1) {
  const P = g.getAttribute('position') as THREE.BufferAttribute, q = 1 / Math.max(1e-6, scale);
  for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); P.setXYZ(i, x + (phash(x * q, y * q, z * q, seed) - 0.5) * 2 * amt, y + (phash(x * q, y * q, z * q, seed + 7) - 0.5) * 2 * amt, z + (phash(x * q, y * q, z * q, seed + 13) - 0.5) * 2 * amt); }
  P.needsUpdate = true; return flat(g);
}
/** a few-sided cylinder along Y, chamfered rims (6 sides = a hex bolt) */
export function fcyl(rTop: number, h: number, seg = 8, rBot = rTop, c = 0.18, open = false, phase?: number) {
  const s = Math.max(3, Math.round(seg)), ch = Math.min(Math.min(rTop, rBot) * c, h * c), hy = h / 2, pts: THREE.Vector2[] = [];
  if (!open) pts.push(new THREE.Vector2(0, -hy));
  if (ch > 1e-6 && !open) pts.push(new THREE.Vector2(Math.max(0, rBot - ch), -hy), new THREE.Vector2(rBot, -hy + ch), new THREE.Vector2(rTop, hy - ch), new THREE.Vector2(Math.max(0, rTop - ch), hy));
  else pts.push(new THREE.Vector2(rBot, -hy), new THREE.Vector2(rTop, hy));
  if (!open) pts.push(new THREE.Vector2(0, hy));
  return flat(new THREE.LatheGeometry(pts, s, phase ?? PI / s));
}
export function flathe(prof: number[][], seg = 8, phase?: number) { const s = Math.max(3, Math.round(seg)); return flat(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), s, phase ?? PI / s)); }
function boxUV(g: THREE.BufferGeometry, w: number, h: number, d: number) {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i), ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = (x + w / 2) / w; v = ny > 0 ? 1 - (z + d / 2) / d : (z + d / 2) / d; } else if (ax >= az) { u = nx > 0 ? (d / 2 - z) / d : (z + d / 2) / d; v = (y + h / 2) / h; } else { u = nz > 0 ? (x + w / 2) / w : (w / 2 - x) / w; v = (y + h / 2) / h; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
/** a box with every edge bevelled */
export function fbox(w: number, h: number, d: number, c = 0.16, abs = false) {
  const m = Math.min(w, h, d), k = Math.max(0, Math.min(m * 0.49, abs ? c : m * c)), pts: THREE.Vector3[] = [], W = w / 2, H = h / 2, D = d / 2;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    if (k < 1e-6) { pts.push(new THREE.Vector3(sx * W, sy * H, sz * D)); continue; }
    pts.push(new THREE.Vector3(sx * (W - k), sy * H, sz * (D - k)), new THREE.Vector3(sx * W, sy * (H - k), sz * (D - k)), new THREE.Vector3(sx * (W - k), sy * (H - k), sz * D));
  }
  const g = new ConvexGeometry(pts); boxUV(g, w, h, d); return g;
}
export function gem(r: number, detail = 0, rough = 0.12, seed = 3) { const g = new THREE.IcosahedronGeometry(r, detail); return rough > 0 ? jitter(flat(g), r * rough, seed, r) : flat(g); }
export function fdome(r: number, seg = 8, rings = 3, sy = 1) { const prof: number[][] = []; for (let i = 0; i <= rings; i++) { const a = (i / rings) * PI / 2; prof.push([Math.cos(a) * r, Math.sin(a) * r * sy]); } prof.push([0, r * sy]); return flathe(prof, seg); }
export function fring(R: number, r: number, seg = 10, tube = 4, arc = PI * 2) { return flat(new THREE.TorusGeometry(R, r, Math.max(3, tube), Math.max(3, seg), arc)); }
/** a rectangle with clipped corners (an octagonal plate outline), centred */
export function clipRect(w: number, h: number, c: number): THREE.Vector2[] {
  const W = w / 2, H = h / 2, k = Math.min(c, W * 0.9, H * 0.9);
  return [[-W + k, -H], [W - k, -H], [W, -H + k], [W, H - k], [W - k, H], [-W + k, H], [-W, H - k], [-W, -H + k]].map(([x, y]) => new THREE.Vector2(x, y));
}
/** an outline extruded along +z from 0 by depth, one bevel step; uvs over the outline's extent */
export function plateGeo(pts: THREE.Vector2[], depth: number, bev = 0, holes: THREE.Vector2[][] = []) {
  const sh = new THREE.Shape(pts); for (const h of holes) sh.holes.push(new THREE.Path(h));
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-5, depth - bev * 2), bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev, bevelSegments: 1, curveSegments: 1, steps: 1 });
  g.translate(0, 0, bev);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const P = g.getAttribute('position'), uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) { uv[i * 2] = (P.getX(i) - x0) / Math.max(1e-6, x1 - x0); uv[i * 2 + 1] = (P.getY(i) - y0) / Math.max(1e-6, y1 - y0); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return flat(g);
}
/** a few-sided tube from a to b */
export function frod(a: [number, number, number], b: [number, number, number], r: number, seg = 5) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), g = fcyl(r, Math.max(1e-5, A.distanceTo(B)), seg, r, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); return g;
}

// ================================================================== the mold: many primitives, one mesh, per-vertex colour + surface
/** surface: metal (shine), rust uptake, (unused), library-grain weight */
export type Surf = [number, number, number, number];
export const PAINT: Surf = [0.18, 1, 1, 0.35], STEEL: Surf = [0.8, 0.55, 0.8, 1], CHROME: Surf = [1, 0.25, 0.7, 0.5], BRASS: Surf = [0.75, 0.3, 0.7, 0.8];
export const RUBBER: Surf = [0.04, 0, 0.6, 0.6], PLASTIC: Surf = [0.3, 0, 0.7, 0.2], GLASS: Surf = [0.9, 0, 0.35, 0];
export type ColorFn = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => number;
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
export class Mold {
  private p: number[] = []; private n: number[] = []; private c: number[] = []; private u: number[] = []; private s: number[] = []; private gl: number[] = [];
  add(src: THREE.BufferGeometry, m: THREE.Matrix4 | null, color: number | ColorFn, surf: Surf = PAINT, glow = 0): this {
    const g = src.index ? src.toNonIndexed() : src;
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), UV = g.getAttribute('uv');
    if (m) _nm.getNormalMatrix(m);
    const cnt = P.count, pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      _v.fromBufferAttribute(P, i); if (m) _v.applyMatrix4(m);
      if (N) { _n.fromBufferAttribute(N, i); if (m) _n.applyMatrix3(_nm).normalize(); } else _n.set(0, 1, 0);
      pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z; nor[i * 3] = _n.x; nor[i * 3 + 1] = _n.y; nor[i * 3 + 2] = _n.z;
    }
    for (let t = 0; t + 2 < cnt; t += 3) { // one normal per facet, on the side the source meant
      const a = t * 3, b = a + 3, c = a + 6;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      let fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx; const l = Math.hypot(fx, fy, fz); if (l < 1e-12) continue;
      fx /= l; fy /= l; fz /= l;
      if (fx * (nor[a] + nor[b] + nor[c]) + fy * (nor[a + 1] + nor[b + 1] + nor[c + 1]) + fz * (nor[a + 2] + nor[b + 2] + nor[c + 2]) < 0) { fx = -fx; fy = -fy; fz = -fz; }
      for (const o of [a, b, c]) { nor[o] = fx; nor[o + 1] = fy; nor[o + 2] = fz; }
    }
    for (let i = 0; i < cnt; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      this.p.push(x, y, z); this.n.push(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
      const hx = typeof color === 'number' ? color : color(x, y, z, nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]);
      this.c.push(((hx >> 16) & 255) / 255, ((hx >> 8) & 255) / 255, (hx & 255) / 255);
      if (UV) this.u.push(UV.getX(i), UV.getY(i)); else this.u.push(0, 0);
      this.s.push(surf[0], surf[1], surf[2], surf[3]); this.gl.push(glow);
    }
    if (g !== src) g.dispose(); src.dispose();
    return this;
  }
  get empty() { return this.p.length === 0; }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aCol', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('aSurf', new THREE.Float32BufferAttribute(this.s, 4)); g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.gl, 1));
    g.computeBoundingSphere(); return g;
  }
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
/** translate, rotate (XYZ), scale */
export function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); }

// ================================================================== shaders
const NOISE = /* glsl */`
float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vn(vec3 p) { vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z); }`;
const VERT = /* glsl */`
attribute vec3 aCol; attribute vec4 aSurf; attribute float aGlow;
varying vec3 vN; varying vec3 vCol; varying vec3 vLoc; varying vec4 vSurf; varying vec2 vUv; varying float vGlow; varying vec3 vON;
void main() { vCol = aCol; vSurf = aSurf; vUv = uv; vGlow = aGlow; vON = normal;
  vLoc = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
uniform vec3 uKey; uniform float uLight; uniform vec3 uTint; uniform float uRust;
uniform vec3 uGlow; uniform float uSeed; uniform float uWear; uniform float uDim;
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
#ifdef LIBD
uniform sampler2D uLib; uniform float uLibAvg; uniform float uTri;
#endif
varying vec3 vN; varying vec3 vCol; varying vec3 vLoc; varying vec4 vSurf; varying vec2 vUv; varying float vGlow; varying vec3 vON;
${NOISE}
void main() {
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  vec3 base = vCol; float metal = vSurf.x;
#ifdef LIBD
  // the library material's own grain (machined steel, brass, rubber) box-mapped at one texel per pixel
  vec3 an = abs(vON); vec2 tuv = an.x > an.y && an.x > an.z ? vLoc.zy : an.y > an.z ? vLoc.xz : vLoc.xy;
  float L = dot(texture2D(uLib, tuv * uTri).rgb, vec3(0.3, 0.59, 0.11));
  base *= mix(1.0, clamp(L / uLibAvg, 0.55, 1.5), vSurf.w);
#endif
#ifdef USE_MAP
  vec4 t = texture2D(uMap, vUv);
  base = mix(base, t.rgb, t.a * smoothstep(0.15, 0.45, n.z));
#endif
  vec3 q = vLoc + vec3(uSeed);
  float g = vn(q * 0.07) * 0.55 + vn(q * 0.27) * 0.3 + h3(floor(q)) * 0.15;
  base *= 0.9 + 0.16 * g;
  base *= 1.0 - uWear * smoothstep(0.6, 0.92, vn(q * 0.17 + 9.0)) * 0.3;
  float rs = vSurf.y * uRust;
  if (rs > 0.001) { float rn = vn(q * 0.045) * 0.5 + vn(q * 0.16 + 4.0) * 0.32 + vn(q * 0.6) * 0.18; float e = rs * 1.3 - rn;
    if (e > 0.0) { vec3 rc = mix(vec3(0.32, 0.13, 0.05), vec3(0.62, 0.31, 0.11), vn(q * 0.45)); rc = mix(rc, vec3(0.18, 0.08, 0.04), step(0.7, vn(q * 1.3)) * 0.7);
      base = e < 0.035 ? base * 0.58 + vec3(0.10, 0.04, 0.0) : rc; metal *= e < 0.035 ? 0.5 : 0.08; } }
  float lam = clamp(dot(n, uKey), 0.0, 1.0); lam = floor(lam * 5.0 + 0.5) / 5.0;
  float fill = clamp(dot(n, normalize(vec3(0.62, -0.25, 0.74))), 0.0, 1.0);
  vec3 col = base * (0.32 + lam * 0.84 + fill * 0.14) * uLight * uTint;
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0)); float sp = pow(max(dot(n, hv), 0.0), 10.0 + metal * 34.0);
  col += (step(0.42, sp) * 0.36 + step(0.84, sp) * 0.46) * metal * uLight * vec3(1.0, 0.97, 0.88);
  float rim = 1.0 - clamp(n.z, 0.0, 1.0); col += rim * rim * rim * 0.08 * vec3(0.8, 0.95, 1.0) * uLight;
  vec3 lit = base * uGlow * 1.7 + uGlow * 0.35;
  col = mix(col, lit, clamp(vGlow * max(uGlow.r, max(uGlow.g, uGlow.b)) * 1.6, 0.0, 1.0));
  gl_FragColor = vec4(col * uDim, 1.0);
}`;
const LENS_FRAG = /* glsl */`
uniform vec3 uKey; uniform vec3 uCol; uniform float uOn; uniform float uDim;
varying vec3 vN; varying vec3 vCol; varying vec3 vLoc; varying vec4 vSurf; varying vec2 vUv; varying float vGlow; varying vec3 vON;
void main() { vec3 n = normalize(vN); float ndv = clamp(n.z, 0.0, 1.0);
  vec3 off = uCol * (0.10 + 0.16 * ndv) + vec3(0.015, 0.02, 0.015);
  float lam = clamp(dot(n, uKey), 0.0, 1.0); off += uCol * floor(lam * 3.0 + 0.5) / 3.0 * 0.12;
  vec3 on = mix(uCol * (0.72 + 0.4 * ndv), vec3(1.0, 1.0, 0.9), pow(ndv, 5.0) * 0.75);
  vec3 col = mix(off, on, uOn);
  vec3 hv = normalize(uKey + vec3(0.0, 0.0, 1.0)); float sp = pow(max(dot(n, hv), 0.0), 36.0);
  col += step(0.5, sp) * vec3(0.95, 0.97, 0.9) * (0.7 - uOn * 0.3);
  gl_FragColor = vec4(col * uDim, 1.0); }`;
const HALO_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const HALO_FRAG = /* glsl */`uniform vec3 uCol; uniform float uOn; varying vec2 vUv;
void main() { float d = length(vUv - 0.5) * 2.0; float a = (1.0 - smoothstep(0.0, 1.0, d)) * uOn; a = floor(a * 4.0 + 0.5) / 4.0; gl_FragColor = vec4(uCol * 0.5, a); }`;
export const MXU = { uKey: { value: new THREE.Vector3(-0.38, 0.72, 0.58).normalize() }, uLight: { value: 1.08 }, uTint: { value: new THREE.Vector3(1.0, 1.0, 1.02) }, uRust: { value: 0.1 } };
const libTex = new Map<string, { t: THREE.DataTexture; avg: number }>();
/** a library material as a raw-colour repeating texture (for hardware grain) */
function libT(kit: string) {
  let e = libTex.get(kit);
  if (!e) {
    const p = libSample(LIB[kit] ?? kit, 2), d = new Uint8Array(p.w * p.h * 4); let s = 0;
    for (let i = 0; i < p.w * p.h; i++) { d[i * 4] = p.data[i * 4]; d[i * 4 + 1] = p.data[i * 4 + 1]; d[i * 4 + 2] = p.data[i * 4 + 2]; d[i * 4 + 3] = 255; s += (p.data[i * 4] * 0.3 + p.data[i * 4 + 1] * 0.59 + p.data[i * 4 + 2] * 0.11) / 255; }
    const t = new THREE.DataTexture(d, p.w, p.h, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
    (t as unknown as { _keep: boolean })._keep = true;
    e = { t, avg: Math.max(0.05, s / (p.w * p.h)) }; libTex.set(kit, e);
  }
  return e;
}
export interface MatOpts { map?: THREE.Texture | null; wear?: number; seed?: number; /** library grain (a kit material name) */ lib?: string }
let seedN = 0;
export function mxMat(o: MatOpts = {}): THREE.ShaderMaterial {
  const L = o.lib ? libT(o.lib) : null;
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    defines: { ...(o.map ? { USE_MAP: '' } : {}), ...(L ? { LIBD: '' } : {}) },
    uniforms: {
      uKey: MXU.uKey, uLight: MXU.uLight, uTint: MXU.uTint, uRust: MXU.uRust,
      uGlow: { value: new THREE.Vector3() }, uSeed: { value: o.seed ?? (seedN++ * 17.3) % 300 }, uWear: { value: o.wear ?? 0.5 }, uMap: { value: o.map ?? null }, uDim: { value: 1 },
      uLib: { value: L?.t ?? null }, uLibAvg: { value: L?.avg ?? 1 }, uTri: { value: L ? 1 / L.t.image.width : 1 },
    },
  });
}
function lensMat(col: number) { const c = new THREE.Color(col); return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: LENS_FRAG, uniforms: { uKey: MXU.uKey, uCol: { value: new THREE.Vector3(c.r, c.g, c.b) }, uOn: { value: 0 }, uDim: { value: 1 } } }); }
function haloMat(col: number) { const c = new THREE.Color(col); return new THREE.ShaderMaterial({ vertexShader: HALO_VERT, fragmentShader: HALO_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uCol: { value: new THREE.Vector3(c.r, c.g, c.b) }, uOn: { value: 0 } } }); }

// ================================================================== the post pass (1:1) and the one context
const POST_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uRes; uniform vec2 uScale; uniform float uRange; uniform float uEdge; uniform vec2 uShadow; uniform float uShadowA;
varying vec2 vUv;
float dz(vec2 uv) { return texture2D(tDepth, uv).x * uRange; }
float bay(vec2 p) { vec2 q = mod(p, 4.0); float x = q.x, y = q.y;
  float v = mod(x, 2.0) * 2.0 + mod(y, 2.0) * 3.0 - mod(x, 2.0) * mod(y, 2.0) * 4.0; float w = floor(x / 2.0) * 2.0 + floor(y / 2.0) * 3.0 - floor(x / 2.0) * floor(y / 2.0) * 4.0;
  return (v * 4.0 + w) / 16.0; }
void main() {
  vec2 px = 1.0 / uRes; vec2 uv = vUv * uScale; vec4 c = texture2D(tSrc, uv); float a = c.a;
  if (a < 0.03) {
    float n = max(max(texture2D(tSrc, uv + vec2(px.x, 0.0)).a, texture2D(tSrc, uv - vec2(px.x, 0.0)).a), max(texture2D(tSrc, uv + vec2(0.0, px.y)).a, texture2D(tSrc, uv - vec2(0.0, px.y)).a));
    if (n > 0.25) { gl_FragColor = vec4(vec3(0.03, 0.03, 0.035) * 0.95, 0.95); return; }
    vec2 so = uv + vec2(-px.x * uShadow.x, px.y * uShadow.y); float s = texture2D(tSrc, so).a;
    if (s > 0.25 && so.x > 0.0 && so.y < uScale.y && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, uShadowA); return; }
    gl_FragColor = vec4(0.0); return;
  }
  vec3 col = c.rgb;
  if (a > 0.5) {
    float d0 = dz(uv), dl = dz(uv - vec2(px.x, 0.0)), dr = dz(uv + vec2(px.x, 0.0)), dd = dz(uv - vec2(0.0, px.y)), du = dz(uv + vec2(0.0, px.y));
    float near = d0 - min(min(dl, dr), min(dd, du)); float lap = max(abs(dl + dr - 2.0 * d0), abs(dd + du - 2.0 * d0));
    if (near > uEdge && lap > uEdge) { gl_FragColor = vec4(vec3(0.03, 0.03, 0.035) * 0.9 + col * 0.1, 1.0) * a; return; }
  }
  float d = bay(floor(gl_FragCoord.xy)) - 0.5;
  col = floor(clamp(col, 0.0, 1.0) * 30.0 + 0.5 + d * 0.9) / 30.0;
  gl_FragColor = vec4(col * a, a);
}`;
let R: THREE.WebGLRenderer | null = null, dead = false, rt: THREE.WebGLRenderTarget | null = null;
let post: { scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial } | null = null;
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(0, 1, 1, 0, 1, 2000); cam.position.set(0, 0, 1000);
export const mxStats = { draws: 0, ms: 0 };
export function mxOk(): boolean { return !!ctx(); }
function ctx(): THREE.WebGLRenderer | null {
  if (R || dead) return R;
  try {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
    R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power', depth: true, stencil: false });
    R.setPixelRatio(1); R.autoClear = false; R.outputColorSpace = THREE.LinearSRGBColorSpace;
    cv.addEventListener('webglcontextlost', (e) => e.preventDefault());
    const mat = new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uScale: { value: new THREE.Vector2(1, 1) }, uRange: { value: 1999 }, uEdge: { value: 1.6 }, uShadow: { value: new THREE.Vector2(2, 3) }, uShadowA: { value: 0.42 } } });
    const ps = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; ps.add(q);
    post = { scene: ps, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  } catch (e) { console.warn('kit machine: no WebGL, the flat kit stays', e); R = null; dead = true; }
  return R;
}
function ensureRT(w: number, h: number) {
  if (rt && rt.width >= w && rt.height >= h) return;
  const nw = Math.max(256, Math.ceil(w / 256) * 256, rt?.width ?? 0), nh = Math.max(256, Math.ceil(h / 256) * 256, rt?.height ?? 0);
  rt?.dispose();
  const dt = new THREE.DepthTexture(nw, nh); dt.minFilter = dt.magFilter = THREE.NearestFilter;
  rt = new THREE.WebGLRenderTarget(nw, nh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: dt, generateMipmaps: false });
  post!.mat.uniforms.tDepth.value = dt; post!.mat.uniforms.uRes.value.set(nw, nh);
}
export interface ShotOpts { shear?: [number, number]; shadow?: [number, number]; shadowA?: number; edge?: number }
export const SHEAR: [number, number] = [-0.22, -0.36];
const _sh = new THREE.Matrix4();
/** render `root` (scene units = px, y up; the element's top-left at 0,0) over x -pad..w+pad into ctx at (dx, dy) */
export function shoot(root: THREE.Object3D, w: number, h: number, pad: number, out: CanvasRenderingContext2D, dx = 0, dy = 0, o: ShotOpts = {}): boolean {
  const r = ctx(); if (!r || !post) return false;
  const t0 = performance.now(), tw = Math.max(1, Math.round(w + pad * 2)), th = Math.max(1, Math.round(h + pad * 2));
  ensureRT(tw, th);
  const cv = r.domElement;
  if (cv.width < tw || cv.height < th) r.setSize(Math.max(cv.width, Math.ceil(tw / 128) * 128), Math.max(cv.height, Math.ceil(th / 128) * 128), false);
  cam.left = -pad; cam.right = w + pad; cam.top = pad; cam.bottom = -(h + pad); cam.near = 1; cam.far = 2000; cam.updateProjectionMatrix();
  const [sx, sy] = o.shear ?? SHEAR;
  _sh.set(1, 0, sx, sx * 1000, 0, 1, -sy, -sy * 1000, 0, 0, 1, 0, 0, 0, 0, 1);
  cam.projectionMatrix.multiply(_sh); cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  scene.add(root);
  const target = rt!;
  target.viewport.set(0, 0, tw, th); target.scissor.set(0, 0, Math.min(target.width, tw + 2), Math.min(target.height, th + 2)); target.scissorTest = true;
  r.setRenderTarget(target); r.setClearColor(0x000000, 0); r.clear(true, true, false);
  target.scissor.set(0, 0, tw, th); r.setRenderTarget(target);
  r.render(scene, cam);
  scene.remove(root);
  r.setRenderTarget(null); r.setScissorTest(false); r.setViewport(0, 0, tw, th); r.setClearColor(0x000000, 0); r.clear(true, false, false);
  const u = post.mat.uniforms;
  u.tSrc.value = target.texture; u.uScale.value.set(tw / target.width, th / target.height);
  const sh = o.shadow ?? [2, 3]; u.uShadow.value.set(sh[0], sh[1]); u.uShadowA.value = o.shadowA ?? 0.42; u.uEdge.value = o.edge ?? 1.6;
  r.render(post.scene, post.cam);
  out.drawImage(cv, 0, cv.height - th, tw, th, dx, dy, tw, th);
  mxStats.draws++; mxStats.ms += performance.now() - t0;
  return true;
}
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !(m.geometry as unknown as { _keep?: boolean })._keep) m.geometry.dispose();
    for (const mt of (Array.isArray(m.material) ? m.material : m.material ? [m.material] : [])) {
      const sm = mt as THREE.ShaderMaterial, map = sm.uniforms?.uMap?.value as THREE.Texture | null;
      if (map && !(map as unknown as { _keep?: boolean })._keep) map.dispose();
      sm.dispose();
    }
  });
}
const sheets = new Map<string, HTMLCanvasElement>(); let sheetBytes = 0;
/** a vertical strip of `frames` renders of one part (each (w + 2 pad) x (h + 2 pad)); cached by key */
export function sheet(key: string, w: number, h: number, pad: number, frames: number, build: (f: number) => THREE.Object3D, o: ShotOpts = {}): HTMLCanvasElement | null {
  const hit = sheets.get(key); if (hit) return hit;
  if (!ctx()) return null;
  const fw = Math.round(w + pad * 2), fh = Math.round(h + pad * 2), cv = document.createElement('canvas'); cv.width = fw; cv.height = fh * frames;
  const c = cv.getContext('2d')!;
  for (let f = 0; f < frames; f++) { const root = build(f); shoot(root, w, h, pad, c, 0, f * fh, o); disposeTree(root); }
  sheetBytes += cv.width * cv.height * 4; sheets.set(key, cv);
  while (sheetBytes > 96e6 && sheets.size > 1) { const [k0, v0] = sheets.entries().next().value as [string, HTMLCanvasElement]; sheets.delete(k0); sheetBytes -= v0.width * v0.height * 4; }
  return cv;
}
export function meshOf(m: Mold, mat: THREE.Material, parent?: THREE.Object3D): THREE.Mesh { const me = new THREE.Mesh(m.build(), mat); me.frustumCulled = false; parent?.add(me); return me; }

// ================================================================== paint: library faces, worn the Limbophobia way
export type Tone = 'gun' | 'steel' | 'dark' | 'olive' | 'cream' | 'red' | 'yellow' | 'blue' | 'teal' | 'brass';
/** each tone's library material (kit name) and brightness */
const TONE_LIB: Record<Tone, [string, number]> = {
  gun: ['gun', 1.0], steel: ['steel', 1.0], dark: ['darkSteel', 0.62], olive: ['olive', 1.0], cream: ['enamel', 1.0], red: ['red', 1.0],
  yellow: ['yellowPaint', 1.0], blue: ['blue', 1.0], teal: ['teal', 1.0], brass: ['brass', 1.0],
};
export function hh(x: number, y: number, s: number): number { let h = Math.imul((x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 1442695041, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16; return ((h >>> 0) % 100000) / 100000; }
export function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hh(xi, yi, s), b = hh(xi + 1, yi, s), c = hh(xi, yi + 1, s), d = hh(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function mixC(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  return (Math.round(((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t)) << 16) | (Math.round(((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t)) << 8) | Math.round((a & 255) + (((b & 255) - (a & 255)) * t));
}
const ramps = new Map<Tone, number[]>();
/** [deep, dark, base, light, hi] for a tone, from its library material's mean colour, hue-shifted (cool shade, warm light) */
export function toneRamp(t: Tone): number[] {
  let r = ramps.get(t); if (r) return r;
  const [kit, k] = TONE_LIB[t]; let sr = 0, sg = 0, sb = 0, n = 0;
  for (let y = 0; y < 32; y += 2) for (let x = 0; x < 32; x += 2) { const c = libColor(kit, x, y, k); sr += (c >> 16) & 255; sg += (c >> 8) & 255; sb += c & 255; n++; }
  const base = (Math.round(sr / n) << 16) | (Math.round(sg / n) << 8) | Math.round(sb / n);
  const sc = (c: number, f: number) => (Math.min(255, Math.round(((c >> 16) & 255) * f)) << 16) | (Math.min(255, Math.round(((c >> 8) & 255) * f)) << 8) | Math.min(255, Math.round((c & 255) * f));
  r = [mixC(sc(base, 0.42), 0x10141c, 0.3), mixC(sc(base, 0.68), 0x18202c, 0.15), base, mixC(sc(base, 1.24), 0xfff0d0, 0.08), mixC(sc(base, 1.55), 0xfff4dc, 0.2)];
  ramps.set(t, r); return r;
}
export interface Rect { x: number; y: number; w: number; h: number }
export interface Stencil { text: string; x: number; y: number; color?: number; align?: 'left' | 'center' | 'right'; alpha?: number; tiny?: boolean }
export interface PaintSpec {
  w: number; h: number; tone: Tone; seed: number; cut?: number;
  seamsY?: number[]; seamsX?: number[]; hazards?: Rect[]; rustFrom?: [number, number][]; grimeUnder?: Rect[]; wells?: Rect[]; stencils?: Stencil[];
  /** paint wear 0..1 */ wear?: number; /** a lighter band (the hood) above this y */ hoodY?: number;
}
/** paint a housing face (library material, one texel per px) and wear it; returns the canvas */
export function paintFace(p: PaintSpec): HTMLCanvasElement {
  const W = Math.max(2, Math.round(p.w)), H = Math.max(2, Math.round(p.h)), s = p.seed | 0, R = toneRamp(p.tone), [kit, kk] = TONE_LIB[p.tone];
  const cut = p.cut ?? 8, wear = p.wear ?? 0.55, ox = Math.floor(hh(s, 1, 3) * 64), oy = Math.floor(hh(s, 2, 3) * 64);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!, img = c.createImageData(W, H), d = img.data;
  const edgeD = (x: number, y: number) => { const e = Math.min(x, y, W - 1 - x, H - 1 - y), k = Math.min(x + y, (W - 1 - x) + y, x + (H - 1 - y), (W - 1 - x) + (H - 1 - y)) - cut; return Math.min(e, k * 0.7071); };
  const metal = p.tone === 'gun' || p.tone === 'steel' || p.tone === 'dark' || p.tone === 'blue' || p.tone === 'brass';
  for (let y = 0; y < H; y++) {
    const vy = y / H;
    for (let x = 0; x < W; x++) {
      // broad mottling over the library grain, darker and grimier low down, streaks of dirty water
      let v = (vnoise(x * 0.03, y * 0.03, s) - 0.5) * 0.22 + (vnoise(x * 0.11, y * 0.11, s + 3) - 0.5) * 0.08;
      v -= vy * 0.13; if (p.hoodY !== undefined && y < p.hoodY) v += 0.05;
      v -= Math.max(0, vnoise(x * 0.5, y * 0.012, s + 9) - 0.64) * 0.45 * (0.4 + vy);
      let col = libColor(kit, x, y, kk * (1 + v), ox, oy);
      const ed = edgeD(x, y);
      if (ed < 7 && wear > 0) { // chipped edges: primer (paint) or a darker oxide (metal), then bright bare steel, a dark lip
        const n = vnoise(x * 0.22, y * 0.22, s + 11) * 0.7 + hh(x >> 1, y >> 1, s + 12) * 0.3, th = 0.86 - wear * 0.2 + ed * 0.035;
        if (n > th + 0.06) col = hh(x, y, s + 13) > 0.5 ? 0xb4b8b0 : 0x8e928a;
        else if (n > th) col = metal ? mixC(col, 0x1a1c20, 0.45) : 0x6a2e1a;
        else if (n > th - 0.03) col = mixC(col, 0x000000, 0.3);
      }
      if (wear > 0.3 && !metal) { const n2 = vnoise(x * 0.3, y * 0.3, s + 21); if (n2 > 0.93 - wear * 0.02 && hh(x >> 2, y >> 2, s + 22) > 0.55) col = n2 > 0.955 ? 0x9a9c94 : 0x5e2a18; }
      const i = (y * W + x) * 4; d[i] = (col >> 16) & 255; d[i + 1] = (col >> 8) & 255; d[i + 2] = col & 255; d[i + 3] = 255;
    }
  }
  const put = (x: number, y: number, col: number, a = 1) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] += (((col >> 16) & 255) - d[i]) * a; d[i + 1] += (((col >> 8) & 255) - d[i + 1]) * a; d[i + 2] += ((col & 255) - d[i + 2]) * a; };
  const nScr = Math.round(W * H / 7000 * (0.3 + wear));
  for (let k = 0; k < nScr; k++) { let x = hh(k, 1, s) * W, y = hh(k, 2, s) * H; const len = 4 + hh(k, 3, s) * 16, dx = hh(k, 4, s) < 0.5 ? 1 : -1, sl = 0.2 + hh(k, 5, s) * 0.8; for (let q = 0; q < len; q++) { put(x, y, 0xd0d4c8, 0.22); put(x, y + 1, 0x000000, 0.14); x += dx; y += sl; } }
  for (const sy0 of p.seamsY ?? []) for (let x = 2; x < W - 2; x++) { if (edgeD(x, sy0) < 1) continue; put(x, sy0, 0x08090a, 0.85); put(x, sy0 + 1, R[4], 0.6); if (hh(x, sy0, s) > 0.9) put(x, sy0 - 1, 0x1a1a14, 0.5); }
  for (const sx0 of p.seamsX ?? []) for (let y = 2; y < H - 2; y++) { if (edgeD(sx0, y) < 1) continue; put(sx0, y, 0x08090a, 0.85); put(sx0 + 1, y, R[4], 0.5); }
  for (const w of p.wells ?? []) for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) { const e = Math.min(x - w.x, y - w.y); put(x, y, e < 2 ? 0x050506 : mixC(0x0b0d10, 0x181c22, hh(x, y, s + 31) * 0.5), 1); }
  for (const hz of p.hazards ?? []) for (let y = hz.y; y < hz.y + hz.h; y++) for (let x = hz.x; x < hz.x + hz.w; x++) {
    const band = Math.floor((x + (y - hz.y)) / 9) % 2 === 0;
    let col = band ? 0xe0ac22 : 0x17150e; if (band) col = mixC(col, 0x8a6a10, vnoise(x * 0.2, y * 0.2, s + 41) * 0.5);
    const n = vnoise(x * 0.35, y * 0.35, s + 42); if (n > 0.8) col = n > 0.88 ? 0x8f9188 : mixC(col, 0x3a2a10, 0.5);
    if (y === hz.y || y === hz.y + hz.h - 1) col = mixC(col, 0x000000, 0.5);
    put(x, y, col);
  }
  for (const g of p.grimeUnder ?? []) for (let x = g.x; x < g.x + g.w; x++) { if (hh(x, 7, s) < 0.45) continue; const len = 4 + hh(x, 8, s) * 22; for (let q = 0; q < len; q++) put(x + Math.round(Math.sin(q * 0.3 + x) * 0.6), g.y + g.h + q, 0x14160c, 0.42 * (1 - q / len)); }
  for (let k = 0; k < (p.rustFrom ?? []).length; k++) {
    const [rx, ry] = p.rustFrom![k]; if (hh(k, 61, s) > 0.5 + wear * 0.3) continue;
    const len = 6 + hh(k, 62, s) * 26, wdt = 1 + Math.floor(hh(k, 63, s) * 2.2);
    for (let q = 0; q < len; q++) { const t = q / len, xx = rx + Math.sin(q * 0.35 + k) * 0.8 * t; for (let ww = 0; ww < wdt; ww++) put(xx + ww - (wdt >> 1), ry + 3 + q, t < 0.25 ? 0x7a3814 : 0x4e2410, (0.6 - t * 0.5) * (ww === 0 ? 1 : 0.6)); }
    for (let q = -2; q <= 2; q++) put(rx + q, ry + 3, 0x5a2810, 0.45);
  }
  c.putImageData(img, 0, 0);
  for (const st of p.stencils ?? []) stencil(c, st, s);
  return cv;
}
// a tiny 3x5 pixel face for stencils, serials and slot numbers (Alagard is for the 16 px words)
const T5: Record<string, string> = {
  0: '75557', 1: '26227', 2: '71747', 3: '71717', 4: '55711', 5: '74717', 6: '74757', 7: '71122', 8: '75757', 9: '75717',
  A: '25755', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34553', H: '55755', I: '72227', J: '11152', K: '55655', L: '44447', M: '57755',
  N: '65555', O: '25552', P: '65644', Q: '25563', R: '65655', S: '34216', T: '72222', U: '55557', V: '55552', W: '55775', X: '55255', Y: '55222', Z: '71247',
  '-': '00700', '.': '00002', '/': '11244', ':': '02020', '#': '57575', '+': '02720', '%': '51245',
};
/** tiny text (3 x 5 cells, 1 px apart), top-left at (x, y); returns the width */
export function tinyText(c: CanvasRenderingContext2D, str: string, x: number, y: number, col = '#e8c440', shadow: string | null = 'rgba(0,0,0,0.6)') {
  let px = Math.round(x); const y0 = Math.round(y);
  for (const ch of String(str).toUpperCase()) {
    const g = T5[ch]; if (!g) { px += 3; continue; }
    for (let r = 0; r < 5; r++) { const bits = Number(g[r]); for (let b = 0; b < 3; b++) if (bits & (4 >> b)) { if (shadow) { c.fillStyle = shadow; c.fillRect(px + b + 1, y0 + r + 1, 1, 1); } c.fillStyle = col; c.fillRect(px + b, y0 + r, 1, 1); } }
    px += 4;
  }
  return px - Math.round(x) - 1;
}
export const tinyW = (s: string) => String(s).length * 4 - 1;
const hexS = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
/** sprayed stencil: Alagard 16 px (or the tiny face), overspray, the bridges of a cut stencil knocked out */
export function stencil(c: CanvasRenderingContext2D, st: Stencil, seed = 1) {
  const col = hexS(st.color ?? 0xe8c440);
  c.save(); c.globalAlpha = st.alpha ?? 0.9;
  let w: number;
  if (st.tiny) { w = tinyW(st.text); const x0 = st.align === 'center' ? st.x - w / 2 : st.align === 'right' ? st.x - w : st.x; tinyText(c, st.text, x0, st.y - 5, col, null); }
  else { w = bitMeasure(st.text); bitText(c, st.text, st.x, st.y - 13, { color: col, outline: null, align: st.align ?? 'left' }); }
  c.restore();
  const x0 = st.align === 'center' ? st.x - w / 2 : st.align === 'right' ? st.x - w : st.x;
  for (let k = 0; k < Math.ceil(w / 12); k++) { c.fillStyle = 'rgba(30,30,24,0.5)'; c.fillRect(Math.round(x0 + hh(k, 71, seed) * w), Math.round(st.y - 3 - hh(k, 72, seed) * 8), 1, 1 + Math.round(hh(k, 73, seed) * 2)); }
}
export function canvasTex(cv: HTMLCanvasElement): THREE.CanvasTexture { const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace; return t; }
export type Ground = 'yellow' | 'brass' | 'cream' | 'dark' | 'olive' | 'gun' | 'red';
/** a printed label (nameplate / tag): library ground, Alagard (or tiny) text, a border line */
export function labelCanvas(w: number, h: number, text: string, o: { ground?: Ground; ink?: number; seed?: number; border?: boolean; sub?: string; tiny?: boolean } = {}): HTMLCanvasElement {
  const W = Math.max(4, Math.round(w)), H = Math.max(4, Math.round(h)), s = o.seed ?? 3, g = o.ground ?? 'yellow';
  const cv = paintFace({ w: W, h: H, tone: g, seed: s, cut: 1, wear: 0.25 });
  const c = cv.getContext('2d')!;
  const ink = o.ink ?? (g === 'dark' || g === 'olive' || g === 'gun' || g === 'red' ? 0xe8c440 : 0x14120c), hx = hexS(ink);
  if (o.border !== false && W > 16 && H > 8) { c.strokeStyle = hx; c.globalAlpha = 0.7; c.lineWidth = 1; c.strokeRect(2.5, 2.5, W - 5, H - 5); c.globalAlpha = 1; }
  const tiny = o.tiny || H < 17;
  if (text) {
    if (tiny) tinyText(c, text, Math.round(W / 2 - tinyW(text) / 2), Math.round(H / 2 - 2.5), hx, null);
    else bitText(c, text, Math.round(W / 2), Math.round(H / 2 - 8.5 + (o.sub ? -4 : 0)), { color: hx, outline: null, align: 'center' });
  }
  if (o.sub) tinyText(c, o.sub, Math.round(W / 2 - tinyW(o.sub) / 2), H - 9, hx, null);
  return cv;
}

// ================================================================== hardware
export type LampCol = 'green' | 'amber' | 'red' | 'white' | 'teal';
export const LAMP_RGB: Record<LampCol, number> = { green: 0x3cff6a, amber: 0xffb02a, red: 0xff4422, white: 0xfff4d0, teal: 0x40f0e0 };
export interface Lamp { lens: THREE.ShaderMaterial; halo: THREE.ShaderMaterial }
export function setLamp(l: Lamp, on: number) { l.lens.uniforms.uOn.value = on; l.halo.uniforms.uOn.value = on; }
export function bolt(m: Mold, x: number, y: number, z: number, r = 2.4, col = 0x9aa2a0, seed = 1) {
  m.add(fcyl(r * 1.32, 0.7, 10, r * 1.32, 0.25), M(x, -y, z + 0.35, R90), 0x5a605c, STEEL)
    .add(fcyl(r, 1.9, 6, r, 0.3, false, hh(x, y, seed) * PI), M(x, -y, z + 0.7 + 0.95, R90), col, STEEL);
}
export function screw(m: Mold, x: number, y: number, z: number, r = 1.8, col = 0xb0b8b4) {
  const a = hh(x, y, 9) * PI;
  m.add(fcyl(r, 1, 8, r, 0.35), M(x, -y, z + 0.5, R90), col, CHROME).add(fbox(r * 1.9, 0.5, 0.5, 0), M(x, -y, z + 1.05, 0, 0, a), 0x22261f, STEEL);
}
export function rivet(m: Mold, x: number, y: number, z: number, r = 1.3, col = 0x7a8456) { m.add(fdome(r, 6, 2, 0.75), M(x, -y, z, R90), col, PAINT); }
export function lamp(parent: THREE.Object3D, x: number, y: number, z: number, r: number, col: LampCol, guard = false): Lamp {
  const m = new Mold();
  m.add(fcyl(r + 1.8, 1.4, 12, r + 2.1, 0.3), M(x, -y, z + 0.7, R90), 0x3a3f42, STEEL).add(fring(r + 0.9, 0.75, 12, 4), M(x, -y, z + 1.6), 0xc8d0cc, CHROME);
  if (guard) for (const a of [-0.5, 0.5]) m.add(frod([x + a * r * 1.4, -y - r - 1.2, z + 1.2], [x + a * r * 1.4, -y + r + 1.2, z + 1.2 + r * 0.9], 0.45, 4), null, 0x9aa2a0, STEEL);
  meshOf(m, mxMat({ wear: 0.3, lib: 'machined' }), parent);
  const lens = lensMat(LAMP_RGB[col]);
  const lm = new THREE.Mesh(fdome(r, 8, 3, 0.85), lens); lm.position.set(x, -y, z + 1.4); lm.rotation.x = R90; lm.frustumCulled = false; parent.add(lm);
  const halo = haloMat(LAMP_RGB[col]);
  const hm = new THREE.Mesh(new THREE.PlaneGeometry(r * 7, r * 7), halo); hm.position.set(x, -y, z + 0.15); hm.renderOrder = 5; hm.frustumCulled = false; parent.add(hm);
  return { lens, halo };
}
function crect(r: Rect, cut: number) { return { pts: clipRect(r.w, r.h, cut), cx: r.x + r.w / 2, cy: -(r.y + r.h / 2) }; }
export function vent(m: Mold, r: Rect, z: number, frameCol: number) {
  const { pts, cx, cy } = crect({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, 2);
  m.add(plateGeo(pts, 1.4, 0.45, [clipRect(r.w, r.h, 1)]), M(cx, cy, z), frameCol, PAINT);
  for (let j = 2; j < r.h - 1; j += 4) m.add(fbox(r.w - 1, 2.4, 1.2, 0.15), M(r.x + r.w / 2, -(r.y + j), z - 0.2, -0.55, 0, 0), 0x2a2e34, STEEL);
}
export function gland(m: Mold, x: number, y: number, z: number, col: number, drop: number, seed = 1) {
  m.add(fcyl(3.2, 2.2, 6, 3.2, 0.25), M(x, -y, z + 1.1, R90), 0x8a928e, STEEL).add(fcyl(2.5, 2.4, 10, 2.8, 0.3), M(x, -y, z + 3.2, R90), 0x1c1e1a, RUBBER);
  let px = x, py = -y, pz = z + 4.2; const lean = (hh(x, y, seed) - 0.5) * 1.6;
  for (let i = 1; i <= 6; i++) { const t = i / 6, nx = x + lean * t * t * 4, ny = -y - drop * t, nz = z + 4.2 + Math.sin(t * PI * 0.8) * 3.2; m.add(frod([px, py, pz], [nx, ny, nz], 1.5, 6), null, col, RUBBER); px = nx; py = ny; pz = nz; }
}
export function handle(m: Mold, x: number, y0: number, y1: number, z: number) {
  for (const y of [y0, y1]) m.add(fcyl(2.8, 1, 8, 3.2, 0.2), M(x, -y, z + 0.5, R90), 0x4a5048, STEEL).add(fcyl(1.7, 5, 8, 1.9, 0.2), M(x, -y, z + 3.3, R90), 0x8a928e, STEEL);
  m.add(frod([x, -y0, z + 5.6], [x, -y1, z + 5.6], 1.45, 6), null, 0xc4ccc8, CHROME);
}
export function weld(m: Mold, x0: number, y0: number, x1: number, y1: number, z: number) {
  const n = Math.max(2, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 2.2));
  for (let i = 0; i <= n; i++) { const t = i / n; m.add(gem(1.25, 0, 0.22, i), M(x0 + (x1 - x0) * t, -(y0 + (y1 - y0) * t), z + 0.2, 0, 0, i * 0.7, 1, 1, 0.5), 0x5a5e58, STEEL); }
}
export function toggleOn(m: Mold, x: number, y: number, z: number, t: number, k = 1) {
  m.add(fcyl(3.1 * k, 1.4, 6, 3.1 * k, 0.25), M(x, -y, z + 0.7, R90), 0x8a928e, STEEL).add(fcyl(2.1 * k, 2.4, 10, 2.1 * k, 0.2), M(x, -y, z + 2.4, R90), 0xa8b0ac, CHROME);
  const a = t * 0.62, L = 12 * k, tip: [number, number, number] = [x, -y + Math.sin(a) * L, z + 3.4 + Math.cos(a) * L];
  m.add(frod([x, -y, z + 3.2], tip, 1.25 * k, 6), null, 0xe2e8e4, CHROME).add(gem(1.9 * k, 0, 0.05, 2), M(tip[0], tip[1], tip[2]), 0xf0f4f0, CHROME);
}
export function knobOn(m: Mold, x: number, y: number, z: number, r: number, a: number) {
  m.add(fcyl(r * 1.15, 0.8, 14, r * 1.25, 0.3), M(x, -y, z + 0.4, R90), 0x9aa29c, STEEL)
    .add(fcyl(r * 0.82, 3.2, 14, r, 0.22), M(x, -y, z + 2.4, R90), 0x1a1a1e, PLASTIC)
    .add(fbox(r * 0.24, r * 0.9, 0.6, 0.1), M(x - Math.sin(a) * r * 0.45, -y + Math.cos(a) * r * 0.45, z + 4.05, 0, 0, a), 0xe8dcb0, PAINT);
}
/** a printed plate: a thin bevelled plate with its print on the face, two chrome rivets */
export function printedPlate(parent: THREE.Object3D, r: Rect, z: number, cv: HTMLCanvasElement, rivets = true, col = 0xd2a020) {
  const { pts, cx, cy } = crect(r, Math.min(2, r.h * 0.2));
  const me = meshOf(new Mold().add(plateGeo(pts, 1.3, 0.4), M(cx, cy, z), col, PAINT), mxMat({ map: canvasTex(cv), wear: 0.2 }), parent);
  if (rivets && r.w > 30) { const hw = new Mold(); for (const x of [r.x + 3.5, r.x + r.w - 3.5]) hw.add(fdome(1.1, 6, 2, 0.8), M(x, cy, z + 1.3, R90), 0xc8ccc0, CHROME); meshOf(hw, mxMat({ lib: 'machined' }), parent); }
  return me;
}

// ================================================================== the housing
export interface PlateSpec extends Rect { text: string; ground?: Ground; sub?: string; tiny?: boolean }
export interface LampSpec { x: number; y: number; r?: number; col: LampCol; on?: boolean; guard?: boolean }
export interface HousingSpec {
  w: number; h: number; seed?: number; tone?: Tone; depth?: number; cut?: number; wear?: number;
  /** windows: content wells with a raised lip and four screws (back = a dark recess painted behind, not a hole) */
  wins?: (Rect & { cut?: number; lip?: number; lipTone?: Tone; back?: boolean; screws?: boolean })[];
  plates?: PlateSpec[]; lamps?: LampSpec[]; vents?: Rect[]; glands?: { x: number; y: number; col?: number; drop?: number }[];
  hazards?: Rect[]; hazPaint?: Rect[]; bolts?: [number, number][]; cornerBolts?: boolean; rivets?: boolean; guards?: boolean;
  handles?: { x: number; y0: number; y1: number }[]; seamsY?: number[]; seamsX?: number[]; welds?: [number, number, number, number][]; stencils?: Stencil[];
  toggles?: { x: number; y: number; on?: boolean }[]; knobs?: { x: number; y: number; r?: number; a?: number }[]; wells?: Rect[]; hoodY?: number;
  /** raised ribs (stiffeners) across the face */
  ribs?: Rect[];
}
export interface Housing { root: THREE.Group; lamps: Lamp[] }
export function housing(s: HousingSpec): Housing {
  const root = new THREE.Group(), W = s.w, H = s.h, seed = s.seed ?? 7, tone = s.tone ?? 'gun', T = toneRamp(tone);
  const d = s.depth ?? 8, cut = s.cut ?? Math.max(4, Math.min(14, Math.round(Math.min(W, H) * 0.07)));
  const holes: THREE.Vector2[][] = [];
  for (const w of s.wins ?? []) if (!w.back) holes.push(clipRect(w.w, w.h, w.cut ?? 6).map((p) => new THREE.Vector2(p.x + (w.x + w.w / 2) - W / 2, p.y - (w.y + w.h / 2) + H / 2)));
  const rust: [number, number][] = [], bolts: [number, number][] = [...(s.bolts ?? [])], inset = Math.max(6, cut * 0.5 + 5);
  if (s.cornerBolts !== false && W > 40 && H > 30) bolts.push([inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]);
  const rivets: [number, number][] = [];
  if (s.rivets !== false && W > 80 && H > 40) {
    const step = 26, e = W > 220 && H > 120 ? 4 : 2.6;
    for (let x = inset + 16; x < W - inset - 12; x += step) { rivets.push([x, e]); rivets.push([x, H - e]); }
    for (let y = inset + 16; y < H - inset - 12; y += step) { rivets.push([e, y]); rivets.push([W - e, y]); }
  }
  for (const b of bolts) rust.push(b);
  for (const r of rivets) if (hh(r[0], r[1], seed) > 0.6) rust.push(r);
  const wells: Rect[] = [...(s.wells ?? [])];
  for (const w of s.wins ?? []) if (w.back) wells.push(w);
  for (const v of s.vents ?? []) wells.push(v);
  const grimeUnder: Rect[] = [...(s.vents ?? [])];
  for (const g of s.glands ?? []) grimeUnder.push({ x: g.x - 2, y: g.y, w: 4, h: 3 });
  const face = paintFace({ w: W, h: H, tone, seed, cut, seamsY: s.seamsY, seamsX: s.seamsX, hazards: s.hazPaint, rustFrom: rust, grimeUnder, wells, stencils: s.stencils, wear: s.wear, hoodY: s.hoodY });
  const faceTex = canvasTex(face);
  const slab = new Mold().add(plateGeo(clipRect(W, H, cut), d, Math.min(2.4, d * 0.3), holes), M(W / 2, -H / 2, -d), (_x, _y, _z, _nx, ny, nz) => (nz > 0.5 ? T[2] : ny > 0.3 ? T[3] : T[1]), PAINT);
  meshOf(slab, mxMat({ map: faceTex, wear: 0.5, seed }), root);
  const rw = W > 220 && H > 120 ? 8 : W > 90 && H > 50 ? 5 : 0, rz = rw ? 2.6 : 0;
  if (rw) { // the raised rail round the edge (the case's lip)
    const rail = new Mold().add(plateGeo(clipRect(W, H, cut), rz, 0.9, [clipRect(W - rw * 2, H - rw * 2, Math.max(2, cut - rw * 0.55))]), M(W / 2, -H / 2, 0), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? T[3] : T[1]), PAINT);
    meshOf(rail, mxMat({ map: faceTex, wear: 0.6, seed: seed + 1 }), root);
  }
  for (const rb of s.ribs ?? []) { const { pts, cx, cy } = crect(rb, Math.min(2, rb.h * 0.3, rb.w * 0.3)); meshOf(new Mold().add(plateGeo(pts, 2.2, 0.7), M(cx, cy, 0), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? T[3] : T[1]), PAINT), mxMat({ map: faceTex, wear: 0.5, seed: seed + 5 }), root); }
  const hw = new Mold();
  for (const [x, y] of bolts) bolt(hw, x, y, 0, Math.min(2.6, Math.max(1.6, cut * 0.22)), 0x9aa29c, seed);
  for (const [x, y] of rivets) rivet(hw, x, y, rz, 1.25, T[3]);
  if (s.guards && W > 60 && H > 50) {
    const L = cut + 16;
    const corner = (fx: (x: number) => number, fy: (y: number) => number) => {
      const pts = [[cut, 0], [L, 0], [L, 5], [5, L], [0, L], [0, cut]].map(([x, y]) => new THREE.Vector2(fx(x), -fy(y)));
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      hw.add(plateGeo(pts, 1.6, 0.5), M(0, 0, rz), 0x3c4246, STEEL);
    };
    corner((x) => x, (y) => y); corner((x) => W - x, (y) => y); corner((x) => x, (y) => H - y); corner((x) => W - x, (y) => H - y);
  }
  for (const w of s.wins ?? []) {
    const lip = w.lip ?? 5, wc = w.cut ?? 6, lt = toneRamp(w.lipTone ?? 'dark'), { cx, cy } = crect(w, wc);
    hw.add(plateGeo(clipRect(w.w + lip * 2, w.h + lip * 2, wc + lip * 0.6), 3.4, 1.3, [clipRect(w.w, w.h, wc)]), M(cx, cy, 0), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.8 ? lt[3] : nz > 0.3 ? lt[4] : lt[1]), STEEL);
    if (lip >= 4 && w.screws !== false) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) screw(hw, cx + sx * (w.w / 2 + lip / 2), -cy + sy * (w.h / 2 + lip / 2 - wc * 0.25), 3.4, 1.3, 0xa8b0aa);
  }
  for (const v of s.vents ?? []) vent(hw, v, 0, T[1]);
  for (const g of s.glands ?? []) gland(hw, g.x, g.y, 0, g.col ?? 0x1a1a18, g.drop ?? 14, seed);
  for (const hd of s.handles ?? []) handle(hw, hd.x, hd.y0, hd.y1, 0);
  for (const [x0, y0, x1, y1] of s.welds ?? []) weld(hw, x0, y0, x1, y1, 0);
  for (const t of s.toggles ?? []) toggleOn(hw, t.x, t.y, 0, t.on ? 1 : -1, 0.8);
  for (const k of s.knobs ?? []) knobOn(hw, k.x, k.y, 0, k.r ?? 5, k.a ?? 0);
  if (!hw.empty) meshOf(hw, mxMat({ wear: 0.45, seed: seed + 3, lib: 'machined' }), root);
  for (const p of s.plates ?? []) printedPlate(root, p, 0, labelCanvas(p.w, p.h, p.text, { ground: p.ground, seed, sub: p.sub, tiny: p.tiny }), true, p.ground === 'brass' ? 0xb08a3a : toneRamp('yellow')[2]);
  for (const hz of s.hazards ?? []) printedPlate(root, hz, 0, paintFace({ w: hz.w, h: hz.h, tone: 'yellow', seed, cut: 1, wear: 0.4, hazards: [{ x: 0, y: 0, w: Math.round(hz.w), h: Math.round(hz.h) }] }), hz.w > 40, toneRamp('yellow')[2]);
  const lamps = (s.lamps ?? []).map((l) => { const o = lamp(root, l.x, l.y, 0, l.r ?? 3, l.col, l.guard); setLamp(o, l.on ? 1 : 0); return o; });
  return { root, lamps };
}

// ================================================================== an item SLOT: a sunk cup with depth, a felt bed, a number tag, a lamp
export type SlotState = 0 | 1 | 2 | 3 | 4; // empty, filled, hot, selected, locked
export function socketPart(S: number, st: SlotState, o: { n?: string; tone?: Tone; seed?: number } = {}): THREE.Group {
  const root = new THREE.Group(), seed = o.seed ?? 31, tone = o.tone ?? 'gun', T = toneRamp(tone), lip = Math.max(5, Math.round(S * 0.12));
  const bed: Rect = { x: lip, y: lip, w: S - lip * 2, h: S - lip * 2 };
  const face = paintFace({ w: S, h: S, tone, seed, cut: 6, wear: 0.5, rustFrom: [[S - 6, S - 6]] });
  meshOf(new Mold().add(plateGeo(clipRect(S, S, 6), 6, 1.4, [clipRect(bed.w, bed.h, 4)]), M(S / 2, -S / 2, -6), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? T[2] : T[1]), PAINT), mxMat({ map: canvasTex(face), seed }), root);
  // the bed at the bottom of the cup: rubber matting from the library, lit amber from below when held
  const felt = paintFace({ w: bed.w, h: bed.h, tone: 'dark', seed: seed + 9, cut: 3, wear: 0 });
  const fc = felt.getContext('2d')!;
  for (let y = 1; y < bed.h - 1; y += 3) for (let x = 1 + ((y / 3) & 1) * 1; x < bed.w - 1; x += 3) { fc.fillStyle = 'rgba(0,0,0,0.35)'; fc.fillRect(x, y, 1, 1); }
  if (st === 2 || st === 3) { const g = fc.createLinearGradient(0, bed.h, 0, bed.h * 0.3); g.addColorStop(0, st === 3 ? 'rgba(255,176,42,0.55)' : 'rgba(120,230,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); fc.fillStyle = g; fc.fillRect(0, 0, bed.w, bed.h); }
  meshOf(new Mold().add(plateGeo(clipRect(bed.w + 2, bed.h + 2, 4), 1, 0), M(S / 2, -S / 2, -6.5), 0x1a1c1e, RUBBER), mxMat({ map: canvasTex(felt), wear: 0 }), root);
  const hw = new Mold();
  bolt(hw, S - 5, S - 5, 0, 1.5); screw(hw, 5, S - 5, 0, 1.2);
  if (st === 3) hw.add(fbox(bed.w - 6, 1.6, 1.2, 0.2), M(S / 2, -(bed.y + bed.h - 2), -5.6), 0xffc040, PAINT, 1);
  if (st === 4) { hw.add(fbox(S - 8, 2.2, 2, 0.2), M(S / 2, -S / 2, 1.2, 0, 0, 0.785), 0x8a2018, PAINT); hw.add(fbox(S - 8, 2.2, 2, 0.2), M(S / 2, -S / 2, 1.2, 0, 0, -0.785), 0x8a2018, PAINT); }
  const hm = mxMat({ seed: 4, lib: 'machined' }); if (st === 3) hm.uniforms.uGlow.value.set(1.0, 0.68, 0.16);
  meshOf(hw, hm, root);
  if (o.n) printedPlate(root, { x: 2, y: 2, w: tinyW(o.n) + 6, h: 11 }, 0, labelCanvas(tinyW(o.n) + 6, 11, o.n, { ground: st === 3 ? 'yellow' : 'dark', border: false, tiny: true, seed }), false, st === 3 ? toneRamp('yellow')[2] : T[1]);
  if (S >= 40) setLamp(lamp(root, S - 6, 6, 0, 1.8, st === 2 ? 'teal' : 'amber'), st === 3 || st === 2 ? 1 : 0);
  if (st === 4) { const u = (root.children[0] as THREE.Mesh).material as THREE.ShaderMaterial; u.uniforms.uDim.value = 0.6; }
  return root;
}

// ================================================================== a push KEY (cap in a bezel; for action keys inside panels)
export type KeyState = 0 | 1 | 2 | 3 | 4; // rest, hot, down, latched, disabled
export const KEY_Z: Record<KeyState, number> = { 0: 8, 1: 8, 2: 1.4, 3: 4, 4: 8 };
export interface KeySpec { w: number; h: number; tone?: Tone; bezel?: Tone; lamp?: LampCol | false; seed?: number; hazard?: boolean }
export function keyLayout(s: KeySpec) {
  const H = s.h, W = s.w, lr = s.lamp ? Math.max(2.6, Math.min(5, H * 0.15)) : 0, lx = s.lamp ? 5 + lr + 1.5 : 0;
  const x0 = s.lamp ? Math.round(lx + lr + 5) : 4, x1 = W - (W > 90 ? 11 : 4);
  return { lr, lx, ly: H / 2, cap: { x: x0, y: 4, w: Math.max(6, x1 - x0), h: Math.max(6, H - 8) } };
}
export function keyPart(s: KeySpec, st: KeyState): THREE.Group {
  const root = new THREE.Group(), seed = s.seed ?? 3, L = keyLayout(s), bez = toneRamp(s.bezel ?? 'dark');
  const bezFace = paintFace({ w: s.w, h: s.h, tone: s.bezel ?? 'dark', seed, cut: 4, wear: 0.5, wells: [{ x: L.cap.x - 2, y: L.cap.y - 2, w: L.cap.w + 4, h: L.cap.h + 4 }], hazards: s.hazard ? [{ x: L.cap.x + L.cap.w + 2, y: 2, w: Math.max(0, s.w - L.cap.x - L.cap.w - 4), h: s.h - 4 }] : undefined });
  meshOf(new Mold().add(plateGeo(clipRect(s.w, s.h, 4), 3, 0.9), M(s.w / 2, -s.h / 2, -3), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? bez[2] : bez[1]), STEEL), mxMat({ map: canvasTex(bezFace), wear: 0.4, seed }), root);
  if (s.w > 90) { const hw = new Mold(); screw(hw, s.w - 6, 6.5, 0, 1.5); screw(hw, s.w - 6, s.h - 6.5, 0, 1.5); meshOf(hw, mxMat({ seed: seed + 1, lib: 'machined' }), root); }
  const zc = KEY_Z[st], depth = 11, cut = Math.min(3, L.cap.h * 0.18), T = toneRamp(s.tone ?? 'cream');
  const capFace = paintFace({ w: L.cap.w, h: L.cap.h, tone: s.tone ?? 'cream', seed: seed + 5, cut, wear: 0.38 });
  const { pts, cx, cy } = crect(L.cap, cut);
  const capMat = mxMat({ map: canvasTex(capFace), wear: 0.3, seed: seed + 2 });
  capMat.uniforms.uDim.value = st === 4 ? 0.55 : st === 1 ? 1.1 : st === 2 ? 0.92 : 1;
  meshOf(new Mold().add(plateGeo(pts, depth, 1.1), M(cx, cy, zc - depth), (_x, _y, _z, _nx, ny, nz) => (nz > 0.5 ? T[2] : ny < -0.3 ? T[0] : T[1]), PAINT), capMat, root);
  if (s.lamp) setLamp(lamp(root, L.lx, L.ly, 0, L.lr, s.lamp), st === 1 || st === 2 || st === 3 ? 1 : 0);
  return root;
}
