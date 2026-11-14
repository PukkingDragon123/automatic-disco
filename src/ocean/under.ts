// Under the water: when the camera goes below the surface, a full-screen pass drawn last in the main scene reads the
// finished frame (a second scene grab, after the sea) and lays the water over it: absorption red-first along every
// view ray and down from the surface (deeper is darker and bluer), an in-scattering fog that thickens with distance,
// light shafts from the waves above (the ray marched through a moving pattern of light cast down along the sun), and
// the surface seen from below (water.ts draws Snell's window itself). Marine snow drifts round the camera; the sound
// is muffled. Everything is stepped into a few bands so it stays in the pixel-art look.
import * as THREE from 'three';
import { GN_DECL, gbuf } from '../gfx/gbuf';
import { SHADER_NOISE } from '../world/glsl';
import { RAMPS } from '../art/palette';
import type { SceneGrab } from './grab';

const VERT = /* glsl */`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = /* glsl */`
${GN_DECL}
${SHADER_NOISE}
uniform sampler2D uGrab, uGrabD;
uniform vec2 uRes;
uniform float uNear, uFar, uTime, uSurf, uSunK, uRed, uBio, uFogK, uDbg;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uSunDir, uSunCol, uFogS, uFogD, uShaft, uRedC, uGlowC;
uniform vec3 uRampW[7], uRampB[7];
float linZ(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
vec3 worldAt(vec2 uv, float d) { vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); v /= v.w; return (uCamWorld * v).xyz; }
/** the light falling from the waves: sheets along the edges of slowly drifting cells (the caustics, seen in the water) */
float shaftNet(vec2 q, float t) {
  vec2 i = floor(q), f = fract(q);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), o = vec2(h2(i + g), h2(i + g + 3.7));
    o = 0.5 + 0.4 * sin(t * 0.35 + o * 6.2832);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return 1.0 - smoothstep(0.025, 0.08, d2 - d1);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // a slow wobble of the whole view, in whole pixels
  vec2 wob = floor(vec2(sin(gl_FragCoord.y * 0.045 + uTime * 1.3), cos(gl_FragCoord.x * 0.04 + uTime * 1.1)) * 1.5 + 0.5) / uRes;
  vec3 scene = texture(uGrab, uv + wob).rgb;
  float d = texture(uGrabD, uv).r;
  bool bg = d >= 0.99999;
  vec3 P = worldAt(uv, bg ? 0.9999 : d), ro = cameraPosition;
  vec3 rd = normalize(P - ro);
  float dist = bg ? 160.0 : distance(P, ro);
  // only the stretch of the ray below the surface is water
  float tUp = rd.y > 1e-4 ? max(0.0, (uSurf - ro.y) / rd.y) : 1e9;
  float uw = min(dist, tUp);
  float camD = max(0.0, uSurf - ro.y), pD = max(0.0, uSurf - min(P.y, uSurf));
  // light reaching the hit point from above, and on the way back to the eye
  vec3 sig = vec3(0.16, 0.04, 0.028);
  vec3 lit = scene * exp(-(pD * 0.45 + uw) * sig);
  // in-scattered light: the fog of the water, brighter toward the surface and the sun, darker in the deep
  float up = clamp(rd.y * 0.5 + 0.5, 0.0, 1.0);
  // the water's colour from its ramps: brighter steps up toward the surface, the deep's blue below and far down
  float fi = clamp(up * 1.1 + 0.2 - camD * 0.03, 0.0, 1.0) * 5.0 - (1.0 - uSunK) * 2.5;
  vec3 fogC = camD > 7.0 ? uRampB[int(clamp(floor(fi + 0.5), 0.0, 6.0))] : uRampW[int(clamp(floor(fi + 0.5), 0.0, 6.0))];
  fogC = mix(fogC, uRedC * (0.3 + 0.7 * uSunK), uRed * 0.6);
  fogC += uSunCol * pow(max(dot(rd, uSunDir), 0.0), 8.0) * 0.18 * uSunK;
  float k = 1.0 - exp(-uw * uFogK);
  k = floor(k * 9.0 + 0.5) / 9.0;
  vec3 col = mix(lit, fogC, k);
  // light shafts: march the ray through a moving pattern of light cast down from the waves along the sun
  float acc = 0.0, span = min(uw, 36.0), j = 0.5;
  vec3 L = normalize(uSunDir);
  for (int i = 0; i < 10; i++) {
    vec3 Q = ro + normalize(worldAt((floor(gl_FragCoord.xy / 2.0) * 2.0 + 1.0) / uRes, 0.5) - ro) * (float(i) + j) / 10.0 * span;
    float dz = uSurf - Q.y;
    if (dz < 0.0) continue;
    vec2 S = Q.xz + L.xz / max(L.y, 0.2) * dz;
    acc += shaftNet(S * 0.22 + vec2(uTime * 0.02, uTime * 0.013), uTime) * exp(-dz * 0.07);
  }
  acc /= 10.0;
  col += uShaft * floor(acc * 5.0) / 5.0 * uSunK * 0.9 * (1.0 - k * 0.4);
  // bioluminescent motes in the dark water
  if (uBio > 0.01) { vec2 q = floor(gl_FragCoord.xy / 3.0); float s = h2(q + floor(uTime * 2.0 + h2(q) * 9.0)); if (s > 0.9965) col += uGlowC * uBio * 1.2; }
  if (uDbg > 0.5) col = vec3(k, bg ? 1.0 : 0.0, uw / 160.0);
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(0.0);
  // open water to the end of sight is not the sky: keep the post pass from drawing its sky there
  gl_FragDepth = bg ? 0.99998 : d;
}`;

export class Underwater {
  readonly mesh: THREE.Mesh;
  readonly snow: THREE.Points;
  readonly U: Record<string, THREE.IUniform>;
  /** 0 above the water .. 1 under it */
  k = 0;
  private snowU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSurf: { value: 0 } };
  constructor(scene: THREE.Scene, readonly grab: SceneGrab, ramps: { uRampW: THREE.IUniform; uRampB: THREE.IUniform }) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const C = (h: number) => new THREE.Color(h);
    this.U = {
      ...grab.U, uRampW: ramps.uRampW, uRampB: ramps.uRampB,
      uTime: { value: 0 }, uDbg: { value: Number(new URLSearchParams(location.search).get('udbg') ?? 0) }, uSurf: { value: 3.9 }, uSunK: { value: 1 }, uRed: { value: 0 }, uBio: { value: 0 }, uFogK: { value: 0.04 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) },
      uFogS: { value: C(RAMPS.teal[3]) }, uFogD: { value: C(RAMPS.sapphire[0]) }, uShaft: { value: C(RAMPS.glowTeal[2]) },
      uRedC: { value: C(RAMPS.coral[1]) }, uGlowC: { value: C(RAMPS.glowTeal[3]) },
    };
    const m = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true, blending: THREE.NormalBlending });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 1000; this.mesh.visible = false; this.mesh.name = 'underwater';
    this.mesh.onBeforeRender = (renderer, _s, camera) => { grab.grab(renderer, camera); };
    scene.add(this.mesh);
    // marine snow: flecks in a box that wraps round the camera
    const n = 420, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p[i * 3] = Math.random() * 24; p[i * 3 + 1] = Math.random() * 14; p[i * 3 + 2] = Math.random() * 24;
      const col = new THREE.Color(i % 5 === 0 ? RAMPS.bone[4] : i % 3 ? RAMPS.sky[3] : RAMPS.teal[4]);
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const sm = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true });
    sm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.snowU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uSurf; uniform vec3 uCam;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vec3 bx = vec3(24.0, 14.0, 24.0);
transformed += vec3(sin(uTime * 0.3 + position.y) * 0.4, -uTime * 0.12, cos(uTime * 0.25 + position.x) * 0.4);
transformed = uCam - bx * 0.5 + mod(transformed - (uCam - bx * 0.5), bx);
transformed.y = min(transformed.y, uSurf - 0.2);`);
    };
    sm.customProgramCacheKey = () => 'ocean-snow';
    gbuf(sm, 0);
    this.snow = new THREE.Points(sg, sm);
    this.snow.frustumCulled = false; this.snow.visible = false;
    scene.add(this.snow);
  }
  update(t: number, cam: THREE.Camera, surf: number, under: boolean) {
    this.k = under ? 1 : 0;
    this.mesh.visible = under; this.snow.visible = under;
    this.U.uTime.value = t; this.U.uSurf.value = surf;
    this.snowU.uTime.value = t; this.snowU.uSurf.value = surf; this.snowU.uCam.value.copy(cam.position);
  }
  dispose() { this.mesh.removeFromParent(); this.snow.removeFromParent(); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.snow.geometry.dispose(); (this.snow.material as THREE.Material).dispose(); }
}
