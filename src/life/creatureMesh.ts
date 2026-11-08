// Rig -> sculpted, painted skinned mesh (sculpt.ts). One geometry + texture per species; each creature gets its own skeleton and a cheap material clone carrying
// per-instance effects (selection flags, hit flash, decay, moss overgrowth while digested, dissolve).
import * as THREE from 'three';
import { buildRig, type Rig, type V3 } from './morph';
import type { Design } from './design';
import { gbuf, type GFlag } from '../gfx/gbuf';
import { VEYR } from '../world/palette';
import { sculpt } from './sculpt';

export interface SpeciesModel {
  rig: Rig; geo: THREE.BufferGeometry; tex: THREE.DataTexture; inverses: THREE.Matrix4[];
  depthMat: THREE.MeshDepthMaterial; restWorld: V3[];
}

export function buildSpeciesModel(d: Design): SpeciesModel {
  const rig = buildRig(d);
  const restWorld: V3[] = rig.bones.map(() => [0, 0, 0]);
  rig.bones.forEach((bn, i) => { const p = bn.parent >= 0 ? restWorld[bn.parent] : [0, 0, 0] as V3; restWorld[i] = [p[0] + bn.pos[0], p[1] + bn.pos[1], p[2] + bn.pos[2]]; });
  const { geo, tex } = sculpt(d, rig, restWorld);
  const inverses = restWorld.map((p) => new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
  const depthMat = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  return { rig, geo, tex, inverses, depthMat, restWorld };
}

// --------------------------------------------------------------------------------------------- instances
export interface CreatureFx { flag: GFlag; flash: { value: number }; flashCol: { value: THREE.Color }; decay: { value: number }; moss: { value: number }; dissolve: { value: number }; glow: { value: number } }

export function makeInstance(m: SpeciesModel): { mesh: THREE.SkinnedMesh; bones: THREE.Bone[]; fx: CreatureFx } {
  const bones = m.rig.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; o.position.set(b.pos[0], b.pos[1], b.pos[2]); return o; });
  m.rig.bones.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
  const fx: CreatureFx = { flag: { value: 1 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) }, decay: { value: 0 }, moss: { value: 0 }, dissolve: { value: 0 }, glow: { value: 1 } };
  const mat = new THREE.MeshLambertMaterial({ map: m.tex, alphaTest: 0.5, side: THREE.DoubleSide, flatShading: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlash = fx.flash; sh.uniforms.uFlashCol = fx.flashCol; sh.uniforms.uDecay = fx.decay; sh.uniforms.uMossC = fx.moss; sh.uniforms.uDissolve = fx.dissolve; sh.uniforms.uGlowK = fx.glow;
    sh.uniforms.uMossA = { value: new THREE.Color(VEYR.mossDark) }; sh.uniforms.uMossB = { value: new THREE.Color(VEYR.moss) }; sh.uniforms.uMossL = { value: new THREE.Color(VEYR.mossLight) }; sh.uniforms.uVein = { value: new THREE.Color(VEYR.vein) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRest;
uniform float uFlash, uDecay, uMossC, uDissolve, uGlowK; uniform vec3 uFlashCol, uMossA, uMossB, uMossL, uVein;
float ch(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ch(i), ch(i + vec3(1,0,0)), f.x), mix(ch(i + vec3(0,1,0)), ch(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ch(i + vec3(0,0,1)), ch(i + vec3(1,0,1)), f.x), mix(ch(i + vec3(0,1,1)), ch(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 cpx = floor(vRest * 32.0);
float dissN = ch(cpx + 3.7);
if (dissN < uDissolve) discard;
float glowA = sampledDiffuseColor.a;
vec3 glowC = sampledDiffuseColor.rgb;
float lumC = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumC) * vec3(0.78, 0.7, 0.62), uDecay * 0.7) * (1.0 - uDecay * 0.35);
float mossM = 0.0;
if (uMossC > 0.0) {
  float mn = vn3(vRest * 7.0) * 0.6 + ch(cpx) * 0.4 + max(0.0, vRest.y) * 0.25;
  if (mn < uMossC * 1.15) {
    float t = ch(cpx + 1.3);
    diffuseColor.rgb = t < 0.33 ? uMossA : t < 0.8 ? uMossB : uMossL;
    mossM = 1.0;
  }
}`)
      .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.5) discard;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (glowA < 0.98) totalEmissiveRadiance += glowC * 1.6 * uGlowK * (1.0 - uDecay);
if (mossM > 0.5 && ch(cpx + 7.7) > 0.93) totalEmissiveRadiance += uVein * 1.4;
totalEmissiveRadiance += uFlashCol * uFlash * 0.9;`);
  };
  mat.customProgramCacheKey = () => 'oddworld-creature';
  gbuf(mat, fx.flag);
  const mesh = new THREE.SkinnedMesh(m.geo, mat);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones, m.inverses), new THREE.Matrix4());
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.customDepthMaterial = m.depthMat;
  mesh.frustumCulled = true;
  return { mesh, bones, fx };
}
