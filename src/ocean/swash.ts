// The swash: on every beach the spent waves run up the sand in a thin sheet with a lace of foam at its edge, stop,
// and slide back, leaving the sand dark and wet below the highest reach of the last few waves. A thin skin draped over
// the ground along the waterline (from the coast field), drawn after the sea on the same 16 px/m grid in the sea's own
// ramps: wet sand a ramp step darker, the sheet a translucent turquoise, the lace in two foam tones.
import * as THREE from 'three';
import type { Ocean } from './ocean';
import { SHADER_NOISE } from '../world/glsl';
import { GN_DECL } from '../gfx/gbuf';
import { RAMPS } from '../art/palette';

const V = /* glsl */`
varying vec3 vWp; varying float vSd;
attribute float aSd;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; vSd = aSd; gl_Position = projectionMatrix * viewMatrix * w; }`;
const F = /* glsl */`
${GN_DECL}
${SHADER_NOISE}
uniform float uTime, uLevel, uSwell, uSunK, uWindK;
uniform vec3 uWet, uSheet, uFoamA, uFoamB;
varying vec3 vWp; varying float vSd;
void main() {
  vec2 px = floor(vWp.xz * 16.0), p = (px + 0.5) / 16.0;
  float h = vWp.y;
  // each stretch of beach has its own rhythm; the sheet surges up fast and drains back slowly
  float ph = fract(uTime * 0.13 + vn(p * 0.08) * 1.7 + vn(p * 0.31) * 0.25);
  float surge = ph < 0.3 ? ph / 0.3 : 1.0 - (ph - 0.3) / 0.7;
  surge = surge * surge * (3.0 - 2.0 * surge);
  float reach = 0.1 + uSwell * 0.35 + uWindK * 0.12;
  float S = uLevel + 0.02 + surge * reach * (0.75 + 0.5 * vn(p * 0.5 + 7.0));
  float maxS = uLevel + 0.04 + reach * 0.95;
  float lit = 0.35 + 0.65 * uSunK;
  vec4 c = vec4(0.0);
  if (h < maxS) c = vec4(uWet * lit, 0.42);
  if (h < S) {
    c = vec4(uSheet * lit, 0.55);
    // the lace at the sheet's edge, broken into drawn clumps
    float e = S - h;
    if (e < 0.03 + 0.02 * vn(p * 4.0)) c = vec4((vn(p * 6.0 + uTime) > 0.45 ? uFoamA : uFoamB) * lit, 0.95);
    else if (e < 0.09 && step(0.62, vn(p * 5.0 - uTime * 0.6)) > 0.5) c = vec4(uFoamB * lit, 0.8);
  }
  if (c.a <= 0.0 || vSd < -6.0) discard;
  gl_FragColor = c;
  gNormal = vec4(0.0);
}`;

export class Swash {
  readonly mesh: THREE.Mesh | null = null;
  private U = { uTime: { value: 0 }, uLevel: { value: 0 }, uSwell: { value: 0.3 }, uSunK: { value: 1 }, uWindK: { value: 0.3 },
    uWet: { value: new THREE.Color(RAMPS.sand[1]) }, uSheet: { value: new THREE.Color(RAMPS.water[5]) }, uFoamA: { value: new THREE.Color(RAMPS.snow[5]) }, uFoamB: { value: new THREE.Color(RAMPS.sky[5]) } };
  constructor(readonly o: Ocean) {
    const R = o.region, N = R.N, sh = o.shore, W = R.water;
    const pos: number[] = [], sdA: number[] = [], idx: number[] = [];
    const vh = (x: number, z: number) => R.groundSmooth(x, z) + 0.025;
    // beach cells: just above the waterline, near the sea
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const h = R.h[z * N + x], sd = sh.at(x + 0.5, z + 0.5);
      if (h < W - 0.25 || h > W + 0.9 || sd > 1.5 || sd < -5 || R.riverY[z * N + x] > 0 || R.isSolid(x + 0.5, z + 0.5)) continue;
      const b = pos.length / 3;
      for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { pos.push(x + dx, vh(x + dx, z + dz), z + dz); sdA.push(sd); }
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aSd', new THREE.Float32BufferAttribute(sdA, 1)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: V, fragmentShader: F, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.Mesh(g, m); this.mesh.name = 'swash'; this.mesh.renderOrder = 3; this.mesh.frustumCulled = false;
    o.g.world.terrain.group.add(this.mesh);
  }
  update(_dt: number, t: number) {
    const U = this.U, S = this.o.sea.U;
    U.uTime.value = t; U.uLevel.value = this.o.level; U.uSwell.value = this.o.swell.height; U.uSunK.value = S.uSunK.value as number; U.uWindK.value = S.uWindK.value as number;
  }
  dispose() { if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); } }
}
