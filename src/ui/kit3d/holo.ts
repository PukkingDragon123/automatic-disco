// kit3d holograms: additive light for the post pipeline's FX layer (render them in the fxScene passed to
// post.render, so they depth-test against the solid scene and bloom). A hologram is the object's own geometry drawn
// as light: a thin fill, a bright fresnel rim, crisp edge lines, subtle scanlines, a slight flicker, and an
// "appear" sweep that builds it from the emitter upward through a dissolve. Light pillars and the emitter's light
// shaft use the same additive pipeline.
import * as THREE from 'three';

export interface HoloU { uCol: { value: THREE.Color }; uT: { value: number }; uAppear: { value: number }; uDim: { value: number }; uY0: { value: number }; uH: { value: number } }
export function holoUniforms(color: number, t?: { value: number }): HoloU {
  return { uCol: { value: new THREE.Color(color) }, uT: t ?? { value: 0 }, uAppear: { value: 1 }, uDim: { value: 1 }, uY0: { value: 0 }, uH: { value: 2 } };
}
const ADD = { transparent: true, depthWrite: false, depthTest: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor } as const;

const COMMON = /* glsl */`
uniform vec3 uCol; uniform float uT, uAppear, uDim, uY0, uH;
varying vec3 vW;
float hh(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
// the build-up mask: a sweep up the height with a blocky dissolve at its front, and the bright band of the front
float appear(out float front){
  float y = clamp((vW.y - uY0) / max(0.01, uH), 0.0, 1.0);
  float n = hh(floor(vW * 24.0));
  float s = uAppear * 1.25 - y - n * 0.25;
  front = smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.06, 0.18, s));
  return step(0.0, s);
}
float scan(){ return 0.86 + 0.14 * step(0.5, fract(vW.y * 38.0 - uT * 1.2)); }
float flick(){ return 0.93 + 0.07 * sin(uT * 31.0 + vW.y * 2.0) * sin(uT * 7.3); }
`;
const VERT = /* glsl */`
varying vec3 vW; varying vec3 vN; varying vec3 vV;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = /* glsl */`
${COMMON}
varying vec3 vN; varying vec3 vV;
void main(){
  float front; float a = appear(front); if (a < 0.5) discard;
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float k = (0.03 + f * 0.42) * scan() * flick() * uDim;
  vec3 c = uCol * k + vec3(0.8, 0.95, 1.0) * front * 1.4;
  gl_FragColor = vec4(c, 0.0);
}`;
const LVERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const LFRAG = /* glsl */`
${COMMON}
void main(){
  float front; float a = appear(front); if (a < 0.5) discard;
  vec3 c = uCol * 0.5 * flick() * uDim + vec3(0.9, 1.0, 1.0) * front;
  gl_FragColor = vec4(c, 0.0);
}`;
/** the fill-and-rim hologram material */
export function holoMaterial(u: HoloU) { return new THREE.ShaderMaterial({ ...ADD, side: THREE.DoubleSide, uniforms: u as never, vertexShader: VERT, fragmentShader: FRAG }); }
/** the edge-line material (same uniforms) */
export function holoLineMaterial(u: HoloU) { return new THREE.ShaderMaterial({ ...ADD, uniforms: u as never, vertexShader: LVERT, fragmentShader: LFRAG }); }

const EDGES = new WeakMap<THREE.BufferGeometry, THREE.EdgesGeometry>();
/** a hologram of `src` (a mesh or a group): its geometry as light with crisp edges; the source is not changed */
export function holoify(src: THREE.Object3D, u: HoloU, o: { edges?: boolean; maxEdgeVerts?: number } = {}): THREE.Group {
  const fill = holoMaterial(u), line = holoLineMaterial(u), out = new THREE.Group();
  const build = (s: THREE.Object3D, parent: THREE.Object3D) => {
    let me: THREE.Object3D;
    const m = s as THREE.Mesh;
    if (m.isMesh && m.geometry) {
      me = new THREE.Mesh(m.geometry, fill);
      if (o.edges !== false && m.geometry.getAttribute('position').count < (o.maxEdgeVerts ?? 24000)) {
        let e = EDGES.get(m.geometry); if (!e) { e = new THREE.EdgesGeometry(m.geometry, 28); EDGES.set(m.geometry, e); }
        me.add(new THREE.LineSegments(e, line));
      }
    } else me = new THREE.Group();
    me.position.copy(s.position); me.quaternion.copy(s.quaternion); me.scale.copy(s.scale); me.visible = s.visible;
    me.userData.src = s;
    parent.add(me);
    for (const c of s.children) build(c, me);
  };
  build(src, out);
  return out;
}
/** keep a hologram's visibility and transforms in step with a live (animated) source made by holoify */
export function holoSync(h: THREE.Object3D) {
  h.traverse((o) => { const s = o.userData.src as THREE.Object3D | undefined; if (s && o !== h) { o.position.copy(s.position); o.quaternion.copy(s.quaternion); o.scale.copy(s.scale); o.visible = s.visible; } });
}

const PILLAR_FRAG = /* glsl */`
uniform vec3 uCol; uniform float uT, uK; varying vec2 vUv;
float hh(float x){ return fract(sin(x * 91.7) * 43758.5); }
void main(){
  float y = vUv.y, x = vUv.x;
  float streak = 0.55 + 0.45 * hh(floor(x * 40.0) + floor(uT * 3.0 + y * 2.0) * 0.0);
  float fade = pow(1.0 - y, 1.6) * smoothstep(0.0, 0.04, y);
  float flow = 0.75 + 0.25 * sin(y * 26.0 - uT * 4.0 + x * 6.28 * 3.0);
  gl_FragColor = vec4(uCol * fade * streak * flow * uK, 0.0);
}`;
const PILLAR_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
/** an open light cylinder (or cone) rising from y = 0, fading upward; `k` is its brightness */
export function lightPillar(r0: number, r1: number, h: number, color: number, t: { value: number }, k = 0.35) {
  const g = new THREE.CylinderGeometry(r1, r0, h, 40, 1, true); g.translate(0, h / 2, 0);
  const u = { uCol: { value: new THREE.Color(color) }, uT: t, uK: { value: k } };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ ...ADD, side: THREE.DoubleSide, uniforms: u, vertexShader: PILLAR_VERT, fragmentShader: PILLAR_FRAG }));
  m.frustumCulled = false;
  return { mesh: m, u };
}

const DUST_VERT = /* glsl */`
uniform float uT, uH, uR; attribute vec3 seed; varying float vA;
void main(){
  float y = fract(seed.y + uT * (0.05 + seed.z * 0.08)) * uH;
  float a = seed.x * 6.2832 + uT * 0.2 * (seed.z - 0.5), r = uR * sqrt(seed.z) * (0.4 + 0.6 * y / uH);
  vec4 mv = modelViewMatrix * vec4(cos(a) * r, y, sin(a) * r, 1.0);
  vA = (1.0 - y / uH) * smoothstep(0.0, 0.08, y / uH);
  gl_PointSize = 3.0; gl_Position = projectionMatrix * mv;
}`;
const DUST_FRAG = /* glsl */`uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol * vA * 0.9, 0.0); }`;
/** motes drifting up a light shaft of radius r and height h */
export function lightDust(n: number, r: number, h: number, color: number, t: { value: number }) {
  const g = new THREE.BufferGeometry(), s = new Float32Array(n * 3);
  for (let i = 0; i < s.length; i++) s[i] = Math.random();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('seed', new THREE.BufferAttribute(s, 3));
  const p = new THREE.Points(g, new THREE.ShaderMaterial({ ...ADD, uniforms: { uT: t, uH: { value: h }, uR: { value: r }, uCol: { value: new THREE.Color(color) } }, vertexShader: DUST_VERT, fragmentShader: DUST_FRAG }));
  p.frustumCulled = false; return p;
}
