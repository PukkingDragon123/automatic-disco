// Atmosphere for the ship's rooms: light beams in hazy air under the lamps and out of the screens and tanks (soft
// cones, brightest at the source, banded like the rest of the pixel art), dust motes drifting through the light,
// and steam breathing out of vents. All premultiplied additive, writing an empty G-buffer normal so they never
// disturb outlines or the bloom's emitter mask.
import * as THREE from 'three';
import { GN_DECL } from '../../gfx/gbuf';
import type { Ctx } from './props';

function fxMat(vert: string, frag: string, u: Record<string, THREE.IUniform>, side: THREE.Side = THREE.FrontSide) {
  const m = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: GN_DECL + frag, uniforms: u, transparent: true, depthWrite: false, side,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
  (m as any).__gb = true;
  return m;
}

const BEAM_V = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
/** a beam of light in dusty air: bright at the lamp, fading to the floor, soft at the silhouette edges, banded */
const BEAM_F = `uniform vec3 uCol; uniform float uK, uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float fall = pow(vUv.y, 1.6);
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.8);
  float dust = 0.85 + 0.15 * sin(vUv.y * 40.0 + uT * 0.7 + vUv.x * 20.0);
  float a = fall * rim * uK * dust;
  a = floor(a * 12.0) / 12.0;
  gl_FragColor = vec4(uCol * a, 0.0);
  gNormal = vec4(0.0);
}`;
/** a light cone from `from` toward `to`, `r` wide at the far end */
export function beam(c: Ctx, from: THREE.Vector3, to: THREE.Vector3, r: number, col: number, k = 0.22) {
  const len = from.distanceTo(to);
  const g = new THREE.ConeGeometry(r, len, 24, 1, true); g.translate(0, -len / 2, 0);
  // uv.y is 1 at the apex (the lamp), 0 at the base
  const u = { uCol: { value: new THREE.Color(col) }, uK: { value: k }, uT: { value: 0 } };
  const m = fxMat(BEAM_V, BEAM_F, u, THREE.DoubleSide);
  const me = new THREE.Mesh(c.bin.g(g), c.bin.m(m)); me.renderOrder = 3;
  me.position.copy(from); me.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  c.root.add(me);
  c.anims.push((_dt, t) => { u.uT.value = t; });
  return { mesh: me, u };
}

const MOTE_V = `attribute float aPh; uniform float uT, uH; varying float vA;
void main(){
  vec3 p = position;
  p.x += sin(uT * 0.21 + aPh * 6.0) * 0.25; p.y += mod(uT * 0.05 + aPh, 1.0) * 0.6 - 0.3; p.z += cos(uT * 0.17 + aPh * 4.0) * 0.25;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uT * 1.3 + aPh * 30.0));
  gl_PointSize = clamp(2.2 * uH / 700.0 * 10.0 / max(1.0, -mv.z), 1.0, 3.0);
  gl_Position = projectionMatrix * mv;
}`;
const MOTE_F = `uniform vec3 uCol; uniform float uK; varying float vA; void main(){ gl_FragColor = vec4(uCol * vA * uK, 0.0); gNormal = vec4(0.0); }`;
/** dust motes drifting in a box (only where light catches them: keep them near lamps and beams) */
export function motes(c: Ctx, box: THREE.Box3, n: number, col: number, k = 0.5) {
  const P = new Float32Array(n * 3), ph = new Float32Array(n), s = box.getSize(new THREE.Vector3());
  for (let i = 0; i < n; i++) { P[i * 3] = box.min.x + Math.random() * s.x; P[i * 3 + 1] = box.min.y + Math.random() * s.y; P[i * 3 + 2] = box.min.z + Math.random() * s.z; ph[i] = Math.random(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const u = { uT: { value: 0 }, uH: { value: 1080 }, uCol: { value: new THREE.Color(col) }, uK: { value: k } };
  const pts = new THREE.Points(c.bin.g(g), c.bin.m(fxMat(MOTE_V, MOTE_F, u))); pts.frustumCulled = false; pts.renderOrder = 4;
  c.root.add(pts);
  c.anims.push((_dt, t) => { u.uT.value = t; u.uH.value = innerHeight; });
  return pts;
}

const STEAM_V = `attribute float aPh; uniform float uT, uH, uRise, uPeriod; varying float vA;
void main(){
  float f = fract(uT / uPeriod + aPh);
  vec3 p = position + vec3(sin(aPh * 40.0 + uT) * 0.06 * f, f * uRise, cos(aPh * 27.0) * 0.06 * f);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = sin(f * 3.14159) * (1.0 - f * 0.6);
  gl_PointSize = clamp((4.0 + f * 20.0) * uH / 700.0 * 6.0 / max(1.0, -mv.z), 1.0, 48.0);
  gl_Position = projectionMatrix * mv;
}`;
const STEAM_F = `uniform vec3 uCol; uniform float uK; varying float vA;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); float a = (1.0 - smoothstep(0.2, 0.5, r)) * vA * uK; a = floor(a * 6.0) / 6.0; gl_FragColor = vec4(uCol * a, 0.0); gNormal = vec4(0.0); }`;
/** a vent breathing steam upward from p */
export function steam(c: Ctx, p: THREE.Vector3, rise = 1.4, n = 14, col = 0xc8d4d8, k = 0.35, period = 3.2) {
  const P = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) { P[i * 3] = p.x + (Math.random() - 0.5) * 0.1; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.1; ph[i] = i / n; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const u = { uT: { value: 0 }, uH: { value: 1080 }, uRise: { value: rise }, uPeriod: { value: period }, uCol: { value: new THREE.Color(col) }, uK: { value: k } };
  const pts = new THREE.Points(c.bin.g(g), c.bin.m(fxMat(STEAM_V, STEAM_F, u))); pts.frustumCulled = false; pts.renderOrder = 4;
  c.root.add(pts);
  c.anims.push((_dt, t) => { u.uT.value = t; u.uH.value = innerHeight; });
  return pts;
}
