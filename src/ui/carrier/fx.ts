// The carrier's lights and breath, each one draw call: every running light, strobe and keel chase lamp is a
// point in one Points cloud that blinks in its own shader (red to port, green to starboard, white strobes, amber
// sequenced keel lights); steam vents puff on their own schedules in a second cloud; floodlight beams in dusty
// air, the light pools they throw on the plating, the nozzle throats and the shimmering exhaust. All fx-layer
// shaders are premultiplied and write gNormal = vec4(0) (see deployKit.fxMat), banded rather than smooth.
import * as THREE from 'three';
import { fxMat, type Bin } from '../deployKit';
import type { V } from './geo';

export interface Halo { p: V; col: [number, number, number]; size: number; mode: 0 | 1 | 2 | 3; ph: number }
export interface Flood { p: V; dir: V; len: number; spread: number; k: number }
export interface Pool { p: V; n: V; w: number; h: number; from: V }
export interface Vent { p: V; dir: V; period: number; ph: number; size: number }
export interface FxReg { halos: Halo[]; floods: Flood[]; pools: Pool[]; vents: Vent[] }
export const newFx = (): FxReg => ({ halos: [], floods: [], pools: [], vents: [] });

/** the colours of the running lights (linear, HDR) */
export const NAV = { red: [2.6, 0.22, 0.12] as [number, number, number], green: [0.3, 2.4, 0.9] as [number, number, number], white: [2.6, 2.5, 2.3] as [number, number, number], amber: [2.4, 1.3, 0.45] as [number, number, number], warm: [1.8, 1.3, 0.75] as [number, number, number] };

const HALO_V = `attribute vec3 aCol; attribute vec3 aInfo; uniform float uT, uH; varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float mode = aInfo.y, ph = aInfo.z, k = 1.0;
  if (mode > 0.5 && mode < 1.5) k = sin(uT * 2.2 + ph) > -0.1 ? 1.0 : 0.12;
  else if (mode > 1.5 && mode < 2.5) { float f = fract(uT * 0.75 + ph); k = f < 0.05 ? 1.6 : (f > 0.12 && f < 0.16 ? 1.2 : 0.05); }
  else if (mode > 2.5) { float hd = fract(uT * 0.45 - ph); k = hd < 0.06 ? 1.0 : hd < 0.12 ? 0.45 : 0.1; }
  vC = aCol * k;
  float px = aInfo.x * projectionMatrix[1][1] * uH * 0.5 / max(1.0, -mv.z);
  gl_PointSize = clamp(px * (0.55 + 0.45 * min(k, 1.0)), 2.0, 72.0);
  gl_Position = projectionMatrix * mv;
}`;
const HALO_F = `varying vec3 vC;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r = max(abs(d.x), abs(d.y)) * 0.3 + length(d) * 0.7;
  float a = r < 0.16 ? 1.0 : r < 0.34 ? 0.42 : r < 0.62 ? 0.14 : r < 0.9 ? 0.05 : 0.0;
  // a four-point glint across the core of the bright ones
  a += (abs(d.x) < 0.06 || abs(d.y) < 0.06) && r < 0.95 ? 0.08 : 0.0;
  gl_FragColor = vec4(vC * a, 0.0);
  gNormal = vec4(0.0);
}`;
const STEAM_V = `attribute vec3 aDir; attribute vec4 aInfo; uniform float uT, uH; varying float vA; varying float vS;
void main(){
  float D = 3.2, tau = mod(uT + aInfo.y, aInfo.x), on = step(tau, D), u = clamp(tau / D, 0.0, 1.0);
  vec3 p = position + aDir * aInfo.z * (1.0 - (1.0 - u) * (1.0 - u)) * 7.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = on * (1.0 - u);
  vS = aInfo.y * 7.31;
  float sz = (0.8 + u * 4.5) * aInfo.w;
  gl_PointSize = on * clamp(sz * projectionMatrix[1][1] * uH * 0.5 / max(1.0, -mv.z), 0.0, 160.0);
  gl_Position = projectionMatrix * mv;
}`;
const STEAM_F = `varying float vA; varying float vS;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float ang = atan(d.y, d.x);
  float r = length(d) * (1.0 + 0.16 * sin(ang * 5.0 + vS) + 0.08 * sin(ang * 9.0 - vS * 1.7));
  float a = r < 0.45 ? 1.0 : r < 0.72 ? 0.6 : r < 0.92 ? 0.25 : 0.0;
  float lit = d.y < -0.15 - 0.2 * d.x ? 1.0 : 0.82;
  a *= vA * 0.5;
  a = floor(a * 6.0) / 6.0;
  gl_FragColor = vec4(vec3(0.78, 0.77, 0.72) * lit * a, a);
  gNormal = vec4(0.0);
}`;
const CONE_V = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const BEAM_F = `uniform vec3 uCol; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ float a = pow(vUv.y, 1.8) * pow(abs(dot(normalize(vN), normalize(vV))), 2.0) * uK; a = floor(a * 10.0) / 10.0; gl_FragColor = vec4(uCol * a, 0.0); gNormal = vec4(0.0); }`;
const POOL_V = `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const POOL_F = `uniform vec3 uCol; uniform float uK; varying vec2 vUv;
void main(){
  float r = length(vec2(vUv.x, vUv.y * 0.9 + 0.1 * vUv.x * vUv.x));
  float a = r < 0.32 ? 0.5 : r < 0.58 ? 0.3 : r < 0.82 ? 0.14 : r < 1.0 ? 0.05 : 0.0;
  gl_FragColor = vec4(uCol * a * uK, 0.0); gNormal = vec4(0.0);
}`;
export const NOZ_F = `uniform vec3 uCol; uniform float uK, uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ float a = pow(1.0 - vUv.y, 2.0) * uK * (0.85 + 0.15 * sin(uT * 31.0 + vUv.x * 40.0)); a = floor(a * 8.0) / 8.0; gl_FragColor = vec4(uCol * a, 0.0); gNormal = vec4(0.0); }`;
export const PLUME_V = `uniform float uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec3 p = position; float k = 1.0 - uv.y;
  p.x += sin(uT * 13.0 + p.y * 0.9) * 0.16 * k * length(p.xz); p.z += cos(uT * 11.0 + p.y * 1.1) * 0.16 * k * length(p.xz);
  vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
export const PLUME_F = `uniform float uT, uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float y = vUv.y;
  float n = vn(vec2(vUv.x * 14.0, y * 9.0 + uT * 7.0)) * 0.6 + vn(vec2(vUv.x * 31.0, y * 21.0 + uT * 13.0)) * 0.4;
  float rim = abs(dot(normalize(vN), normalize(vV)));
  float a = pow(y, 2.2) * smoothstep(0.35, 0.8, n + y * 0.4) * pow(rim, 2.0) * uK;
  vec3 core = vec3(1.1, 1.3, 1.6), hot = vec3(1.6, 0.8, 0.28);
  vec3 c = mix(hot, core, smoothstep(0.55, 0.95, y) * rim);
  a = floor(a * 7.0) / 7.0;
  gl_FragColor = vec4(c * a, 0.0);
  gNormal = vec4(0.0);
}`;

export interface FxBuilt { group: THREE.Group; update(t: number): void; haloU: { uT: { value: number } } }

/** build the fx meshes from what the hull registered */
export function buildFx(bin: Bin, R: FxReg): FxBuilt {
  const group = new THREE.Group(); group.name = 'carrier-fx';
  const uH = { value: 720 };
  const setH = (r: THREE.WebGLRenderer) => { const rt = r.getRenderTarget(); uH.value = rt ? rt.height : r.domElement.height; };
  // ---- running lights
  const haloU = { uT: { value: 0 }, uH };
  if (R.halos.length) {
    const g = new THREE.BufferGeometry(), n = R.halos.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), inf = new Float32Array(n * 3);
    R.halos.forEach((h, i) => { pos.set([h.p.x, h.p.y, h.p.z], i * 3); col.set(h.col, i * 3); inf.set([h.size, h.mode, h.ph], i * 3); });
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aInfo', new THREE.BufferAttribute(inf, 3));
    const pts = new THREE.Points(bin.g(g), fxMat(bin, HALO_V, HALO_F, haloU, 'add'));
    pts.frustumCulled = false; pts.renderOrder = 3; pts.onBeforeRender = (r) => setH(r);
    group.add(pts);
  }
  // ---- steam
  const steamU = { uT: { value: 0 }, uH };
  if (R.vents.length) {
    const per = 7, n = R.vents.length * per;
    const pos = new Float32Array(n * 3), dir = new Float32Array(n * 3), inf = new Float32Array(n * 4);
    let i = 0;
    for (const v of R.vents) for (let k = 0; k < per; k++, i++) {
      const j = new THREE.Vector3(Math.sin(k * 2.3 + v.ph), Math.cos(k * 1.7 + v.ph * 2), Math.sin(k * 3.1 - v.ph)).multiplyScalar(0.22);
      const d = v.dir.clone().normalize().add(j).normalize();
      pos.set([v.p.x, v.p.y, v.p.z], i * 3); dir.set([d.x, d.y, d.z], i * 3);
      inf.set([v.period, v.ph + k * 0.16, 0.8 + (k % 3) * 0.25, v.size], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3)); g.setAttribute('aInfo', new THREE.BufferAttribute(inf, 4));
    const pts = new THREE.Points(bin.g(g), fxMat(bin, STEAM_V, STEAM_F, steamU, 'alpha'));
    pts.frustumCulled = false; pts.renderOrder = 2; pts.onBeforeRender = (r) => setH(r);
    group.add(pts);
  }
  // ---- floodlight beams (one merged cone mesh) and their pools on the plating
  if (R.floods.length) {
    const geos: THREE.BufferGeometry[] = [];
    for (const f of R.floods) {
      const g = new THREE.ConeGeometry(f.len * f.spread, f.len, 18, 1, true);
      g.translate(0, -f.len / 2, 0);
      g.applyMatrix4(new THREE.Matrix4().compose(f.p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), f.dir), new THREE.Vector3(1, 1, 1)));
      geos.push(g);
    }
    const m = new THREE.Mesh(bin.g(merge(geos)), fxMat(bin, CONE_V, BEAM_F, { uCol: { value: new THREE.Color(1.0, 0.86, 0.62) }, uK: { value: 0.16 } }, 'add', { side: THREE.DoubleSide }));
    m.renderOrder = 2; group.add(m);
  }
  if (R.pools.length) {
    const geos: THREE.BufferGeometry[] = [];
    for (const p of R.pools) {
      const g = new THREE.PlaneGeometry(p.w, p.h);
      const z = p.n.clone().normalize();
      // stretch the pool away from the lamp
      const away = p.p.clone().sub(p.from); away.addScaledVector(z, -away.dot(z)); if (away.lengthSq() < 1e-6) away.set(0, 1, 0).cross(z);
      const y = away.normalize(), x = y.clone().cross(z).normalize();
      g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p.p.clone().addScaledVector(z, 0.08)));
      geos.push(g);
    }
    const m = new THREE.Mesh(bin.g(merge(geos)), fxMat(bin, POOL_V, POOL_F, { uCol: { value: new THREE.Color(0.95, 0.78, 0.52) }, uK: { value: 0.55 } }, 'add'));
    m.renderOrder = 1; group.add(m);
  }
  return {
    group, haloU,
    update(t) { haloU.uT.value = t; steamU.uT.value = t; },
  };
}

/** merge position/normal/uv of plain geometries */
export function merge(geos: THREE.BufferGeometry[]) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3); nrm.set(g.attributes.normal.array as Float32Array, o * 3); uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count; g.dispose();
  }
  for (const g of geos) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
