// Flora shaders. The 3D material patches MeshLambertMaterial (sun, sky light, shadows): instances are placed by
// position + yaw + scale, bend in the shared wind field plus the physics field (floraField) with the bend angle
// growing toward the tip, leaves flutter, petals open and close, pods breathe; eaten, moss-withered, grafted,
// dissolving and tinted plants come from a per-plant state texture. Leaves are lit with crown-blended normals and a
// little light through them, cut out of a mip-safe alpha. The card material is the far LOD (the painted sprites,
// leaning back toward the camera) and the ground-cover decals. Near and far cross-fade with a screen-door dither.
// Both write the G-buffer: bark, caps and other solids are outlined, foliage is not; glowing parts flag bloom.
import * as THREE from 'three';
import { GN_DECL } from '../gfx/gbuf';
import { SHADER_NOISE, FOW_FN, WIND_FN } from './glsl';

/**
 * Per-plant state texture (2 texels per plant, 512 wide):
 *   A = (bio, graft 0..1, dissolve 0..1, grow 0..1)
 *   B = (tint r, tint g, tint b, faction * 64 + tint amount * 63)
 */
export const STATE_W = 512;
const STATE_FN = /* glsl */`
uniform sampler2D uState;
vec4 stateA(float id) { if (id < -0.5) return vec4(1.0, 0.0, 0.0, 1.0); int i = int(id + 0.5) * 2; return texelFetch(uState, ivec2(i % ${STATE_W}, i / ${STATE_W}), 0); }
vec4 stateB(float id) { if (id < -0.5) return vec4(0.0); int i = int(id + 0.5) * 2 + 1; return texelFetch(uState, ivec2(i % ${STATE_W}, i / ${STATE_W}), 0); }
`;

/** grafted plants (game/hive.ts): steel sheathes the plant from the root up, riveted bands, crystal facets, veins
 *  pulsing in the owner's colour; an absorbed plant dissolves away in sparks. q: a texel-ish lattice, up: 0 root..1 top */
const GRAFT_3D = /* glsl */`
vec3 graftE = vec3(0.0);
if (vGraft.x > 0.0 || vGraft.z > 0.0) {
  vec3 q = floor(vLocal * 46.0);
  float up = vUp;
  vec3 gc = uGraftCol[int(clamp(vGraft.y + 0.5, 0.0, 3.0))];
  if (vGraft.x > 0.0 && up < vGraft.x * 1.3 - 0.15) {
    float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40, 0.46, 0.50) * (0.5 + l * 1.7), 0.6) * mix(vec3(1.0), gc, 0.1);
    float bm = mod(q.y + floor(vBase.x * 7.0), 9.0);
    if (bm < 1.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.84, 0.88), 0.7);
    else if (bm < 2.0) { diffuseColor.rgb *= 0.45; if (h2(q.xz) > 0.72) { diffuseColor.rgb = vec3(0.92, 0.95, 0.97); graftE += gc * 0.25; } }
    float hv = h2(floor(vLocal.xz * 11.0) + 3.0);
    if (hv > 0.8 && h2(floor(vLocal.yy * 9.0) + 9.0) > 0.3) {
      float pulse = fract(up * 1.6 - uTime * 0.45 + hv * 7.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, gc, 0.6); graftE += gc * (0.3 + 1.6 * smoothstep(0.82, 1.0, pulse));
    }
    if (h2(q.xy + q.z * 7.0 + 21.0) > 0.95) { diffuseColor.rgb = mix(gc, vec3(1.0), 0.45); graftE += gc * 0.5; }
    if (vGraft.x < 1.0 && up > vGraft.x * 1.3 - 0.3) graftE += gc * 1.2;
  }
  if (vGraft.z > 0.0) {
    float dn = h2(q.xy + q.z * 3.1 + 13.0) * 0.65 + up * 0.35;
    if (dn < vGraft.z * 1.05) discard;
    if (dn < vGraft.z * 1.05 + 0.08) graftE += gc * 2.2;
  }
}
`;

// ------------------------------------------------------------------------------------------------ 3D
/**
 * The canopy cutaway: growth between the camera and the focus (the golem) is cut away inside a cone that widens
 * toward the camera, and tall growth standing right over the focus is cut above its head, so the player always sees
 * the golem and the ground round it. The cut is a hand-made stepped stipple (quarter, half, three-quarter, full), not a
 * gradient; trunks and stems stay (the plant reads as cut back to its frame). Nothing renders inside 1.5 m of the
 * camera. uCut = (on, focus radius, near radius, 0); uFocus = the focus point (world).
 */
const CUT_PARS = /* glsl */`
uniform vec3 uFocus; uniform vec4 uCut;
float stip(vec2 p, float k) {
  vec2 q = mod(floor(p), 2.0);
  if (k > 0.9) return 1.0;
  if (k > 0.6) return q.x + q.y < 1.5 ? 1.0 : 0.0;
  if (k > 0.35) return mod(q.x + q.y, 2.0) > 0.5 ? 1.0 : 0.0;
  if (k > 0.1) return q.x + q.y > 1.5 ? 1.0 : 0.0;
  return 0.0;
}
float cutAt(vec3 P, vec3 C) {
  if (uCut.x < 0.5) return 0.0;
  vec3 F = uFocus + vec3(0.0, 0.9, 0.0), D = F - C;
  float t = dot(P - C, D) / max(1e-4, dot(D, D));
  float k = 0.0;
  if (t > 0.0 && t < 1.04) {
    float R = mix(uCut.z, uCut.y, clamp(t, 0.0, 1.0)), d = length(P - (C + D * t));
    k = 1.0 - clamp((d - R * 0.7) / (R * 0.6), 0.0, 1.0);
  }
  // tall growth over the focus: cut above head height
  vec2 hz = P.xz - uFocus.xz;
  float near = 1.0 - clamp((length(hz) - uCut.y * 0.8) / (uCut.y * 0.6), 0.0, 1.0);
  k = max(k, near * clamp((P.y - uFocus.y - 1.3) / 0.8, 0.0, 1.0));
  return floor(k * 4.0 + 0.5) / 4.0;
}
`;

const VERT_PARS_3D = /* glsl */`
attribute vec4 aW; attribute vec4 aP;
attribute vec4 iA; attribute vec4 iB;
uniform float uTime, uN, uH, uFlex, uPushK, uGround, uBob;
uniform vec3 uCamPos; uniform vec4 uLod3;
uniform sampler2D uMoss, uField;
uniform vec3 uBloom[8];
varying float vWither, vUp, vTr, vTintK; varying vec2 vFade; varying vec3 vWorld;
varying vec4 vGraft; varying vec3 vBase, vLocal, vTint, vBloom;
flat varying float vKind;
${SHADER_NOISE}
${WIND_FN}
${STATE_FN}
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x - s * v.z, v.y, s * v.x + c * v.z); }
`;
/** the instance transform, growth state and motion (shared by colour and depth passes) */
const VERT_MAIN_3D = /* glsl */`
vec3 base = iA.xyz;
float yaw = iA.w, sc = iB.x, seed = fract(iB.z), flex = iB.w, ph = seed * 6.2831, t = uTime;
vec4 sA = stateA(iB.y), sB = stateB(iB.y);
float mc = texture2D(uMoss, base.xz / uN).r;
float bio = sA.r;
float wither = clamp(max(1.0 - bio, (mc - 0.4) * 1.8), 0.0, 1.0);
if (uGround > 0.5) wither = mc > 0.3 ? 1.0 : 0.0;
float bB = floor(sB.a * 255.0 + 0.5);
vGraft = vec4(sA.g, floor(bB / 64.0), sA.b, sA.a);
vTint = sB.rgb; vTintK = mod(bB, 64.0) / 63.0;
vBloom = uBloom[int(clamp(floor(iB.z), 0.0, 7.0))];
vWither = wither; vBase = base; vKind = aP.w; vLocal = position;
vUp = clamp(position.y / max(0.05, uH), 0.0, 1.0);
float grow = sA.a * (uGround > 0.5 ? (1.0 - wither) : (1.0 - wither * 0.45) * step(0.02, bio));
vec3 p = position;
float kind = aP.w;
// petals open and close a little through the day; pods, bulbs and caps breathe round their pivot
if ((kind > 1.5 && kind < 2.5) || kind > 6.5) {
  vec3 d = p - aP.xyz; float o = 0.5 + 0.5 * sin(t * 0.45 + ph + aW.w * 1.5); float k = mix(0.84, 1.06, o);
  d.xz *= k; d.y += (1.0 - k) * length(d.xz) * 0.9; p = aP.xyz + d;
} else if (kind > 2.5 && kind < 4.5 && dot(aP.xyz, aP.xyz) > 0.0) {
  p = aP.xyz + (p - aP.xyz) * (1.0 + sin(t * 1.4 + ph) * (kind < 3.5 ? 0.06 : 0.018));
}
p *= sc * grow;
float Hh = max(0.05, uH * sc * grow);
p = rotY(p, yaw);
vec3 nW = rotY(normal, yaw);
// bend: the wind field plus the physics field (springy push-aside, trampling), the angle growing toward the tip
vec3 wnd = windAt(base.xz, t);
vec4 fld = texture2D(uField, (base.xz + p.xz * uGround) / uN);
vec2 fb = (fld.xy - 0.5) * 4.0;
vTr = fld.z;
vec2 bend = wnd.xy * flex * uFlex + fb * uPushK;
bend += uWindDir * sin(t * (0.6 + uFlex * 0.8) + ph) * 0.05 * uWind * (0.35 + wnd.z) * uFlex;
// limbs swing out of phase with each other (phase continuous along a limb so joints never tear)
float bp = dot(position, vec3(2.1, 1.3, 2.7)) + ph;
bend += vec2(sin(t * 1.7 + bp), cos(t * 1.43 + bp * 1.3)) * 0.06 * aW.y * uWind * (0.3 + wnd.z);
float bl = length(bend);
vec2 bd = bl > 1e-4 ? bend / bl : vec2(1.0, 0.0);
float th = min(bl, 1.45) * aW.x;
float a0 = dot(p.xz, bd), cth = cos(th), sth = sin(th);
float a1 = a0 * cth + p.y * sth, y1 = -a0 * sth + p.y * cth;
p.xz += bd * (a1 - a0); p.y = y1;
// leaves and petals flutter in the gusts
if (kind > 0.5 && kind < 3.5 || kind > 6.5) p += nW * sin(t * (7.0 + seed * 4.0) + aW.w * 37.0 + base.x * 1.3) * aW.z * 0.022 * (0.3 + wnd.z) * uWind * min(1.0, Hh);
p.y += sin(t * 1.2 + ph) * 0.02 * uBob;
vec3 transformed = base + p;
vWorld = transformed;
// LOD band: faded in over uLod3.xy (from the finer LOD), out over uLod3.zw (to the coarser one)
float cd = distance(uCamPos, base);
vFade = vec2(smoothstep(uLod3.x, uLod3.y, cd), smoothstep(uLod3.z, uLod3.w, cd));
`;
const FRAG_PARS_3D = /* glsl */`
uniform sampler2D uBark, uVis; uniform float uN, uTime, uGround; uniform vec3 uDark; uniform vec3 uGraftCol[4];
varying float vWither, vUp, vTr, vTintK; varying vec2 vFade; varying vec3 vWorld;
varying vec4 vGraft; varying vec3 vBase, vLocal, vTint, vBloom;
flat varying float vKind;
uniform vec3 uCamPos;
${SHADER_NOISE}
${FOW_FN}
${CUT_PARS}
`;
/** texel lookup (bark slots tile vertically in their own texture), mip-safe alpha cut, LOD dither */
const FRAG_TEX_3D = /* glsl */`
float bay = bayer4(gl_FragCoord.xy);
if (bay >= vFade.x || bay < vFade.y) discard;
bool barkK = vKind < 0.5 || (vKind > 4.5 && vKind < 5.5);
vec4 tB = texture2D(uBark, vMapUv), tA = texture2D(map, vMapUv);
vec4 texel = barkK ? tB : tA;
if (!barkK && !(vKind > 3.5 && vKind < 4.5) && !(vKind > 5.5 && vKind < 6.5)) {
  vec2 dd = fwidth(vMapUv) * 1024.0;
  float al = texel.a * (1.0 + max(0.0, log2(max(max(dd.x, dd.y), 1.0))) * 0.3);
  if (al < 0.5) discard;
}
`;

export interface FloraUniforms { [k: string]: THREE.IUniform }

/** the 3D flora material (one per batch: uH, uFlex, uPushK, uGround differ) */
export function plant3dMaterial(U: FloraUniforms, atlas: THREE.Texture, local: { uH: number; uFlex: number; uPushK: number; uGround?: boolean; uBob?: number; lod: THREE.IUniform }): { mat: THREE.MeshLambertMaterial; depth: THREE.MeshDepthMaterial } {
  const LU = { ...U, uH: { value: local.uH }, uFlex: { value: local.uFlex }, uPushK: { value: local.uPushK }, uGround: { value: local.uGround ? 1 : 0 }, uBob: { value: local.uBob ?? 0 }, uLod3: local.lod };
  const m = new THREE.MeshLambertMaterial({ map: atlas, side: THREE.DoubleSide, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, LU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS_3D)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = rotY(normal, iA.w);')
      .replace('#include <begin_vertex>', VERT_MAIN_3D);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS_3D)
      .replace('void main() {', GN_DECL + 'void main() {')
      .replace('#include <map_fragment>', `${FRAG_TEX_3D}
if (distance(vWorld, uCamPos) < 1.5) discard;
if (uGround < 0.5 && !(vKind < 0.5) && stip(gl_FragCoord.xy, cutAt(vWorld, uCamPos)) > 0.5) discard;
diffuseColor.rgb *= texel.rgb;
if (vKind > 6.5) diffuseColor.rgb *= vBloom * 1.25;
float lumW = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumW) * vec3(0.62, 0.5, 0.36), vWither * 0.85);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumW) * vTint * 1.7, vTintK);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumW) * vec3(0.95, 0.85, 0.55), vTr * 0.35);
${GRAFT_3D}`)
      .replace('#include <normal_fragment_begin>', `float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = normalize(vNormal);
if (vKind < 0.5 || (vKind > 3.5 && vKind < 6.5)) normal *= faceDirection;
vec3 nonPerturbedNormal = normal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float sss = ((vKind > 0.5 && vKind < 3.5) || vKind > 6.5) ? 0.17 : 0.05;
totalEmissiveRadiance += diffuseColor.rgb * sss * (1.0 - vWither * 0.6) + graftE;
if (vKind > 2.5 && vKind < 3.5) totalEmissiveRadiance += diffuseColor.rgb * (0.85 + 0.3 * sin(uTime * 1.4 + vBase.x * 2.0)) * (1.0 - vWither);
if (vKind > 5.5 && vKind < 6.5) totalEmissiveRadiance += diffuseColor.rgb * 0.5;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
gl_FragColor.rgb = applyFow(gl_FragColor.rgb, vBase);
float outl = (vKind < 0.5 || (vKind > 3.5 && vKind < 4.5)) ? 1.0 : 0.0;
float emit = ((vKind > 2.5 && vKind < 3.5) || (vKind > 5.5 && vKind < 6.5) || dot(graftE, graftE) > 0.04) ? 32.0 : 0.0;
gNormal = vec4(inverseTransformDirection(normal, viewMatrix) * 0.5 + 0.5, outl + emit);`);
  };
  m.customProgramCacheKey = () => 'oddworld-flora3d';
  (m as any).__gb = true; // writes gNormal itself

  const d = new THREE.MeshDepthMaterial({ map: atlas, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  d.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, LU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS_3D)
      .replace('#include <begin_vertex>', VERT_MAIN_3D);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS_3D)
      .replace('#include <map_fragment>', `${FRAG_TEX_3D}
if (vGraft.z > 0.0) { vec3 q = floor(vLocal * 46.0); if (h2(q.xy + q.z * 3.1 + 13.0) * 0.65 + vUp * 0.35 < vGraft.z * 1.05) discard; }`)
      .replace('#include <alphatest_fragment>', '');
  };
  d.customProgramCacheKey = () => 'oddworld-flora3d-depth';
  return { mat: m, depth: d };
}

// ------------------------------------------------------------------------------------------------ cards
/**
 * Card instance layout (stride 16): cA = (x, y, z, flip: ±1 upright, ±2 lying flat), cB = (w, h, phase, stiffness),
 * cR = atlas rect, cC = (plant id or -1, anim, anim speed, lod: 0 always shown, 1 big / 2 small plant / 3 ground far LOD)
 */
const CARD_VERT_PARS = /* glsl */`
attribute vec4 cA; attribute vec4 cB; attribute vec4 cR; attribute vec4 cC;
uniform float uTime, uN, uLean, uHComp, uGround;
uniform vec3 uCamRight, uCamBack, uCamPos; uniform vec2 uLod, uLodS, uLodGr;
uniform sampler2D uMoss, uField;
varying float vWither, vFlut, vFade; varying vec3 vBase, vWorld; varying vec4 vGraft; varying vec4 vGRect;
${SHADER_NOISE}
${WIND_FN}
${STATE_FN}
`;
const CARD_VERT_MAIN = /* glsl */`
vec4 sA = stateA(cC.x), sB = stateB(cC.x);
float mc = texture2D(uMoss, cA.xz / uN).r;
float bio = sA.r;
float wither = clamp(max(1.0 - bio, (mc - 0.4) * 1.8), 0.0, 1.0);
if (uGround > 0.5) wither = mc > 0.3 ? 1.0 : 0.0;
vWither = wither; vBase = cA.xyz; vFlut = 0.0;
float bB = floor(sB.a * 255.0 + 0.5);
vGraft = vec4(sA.g, floor(bB / 64.0), sA.b, sA.a); vGRect = cR;
float sc = uGround > 0.5 ? (1.0 - wither) : (1.0 - wither * 0.5) * step(0.02, bio);
vec2 sz = cB.xy * sc * sA.a;
vec3 transformed;
vec3 wnd = windAt(cA.xz, uTime);
vec2 fb = (texture2D(uField, cA.xz / uN).xy - 0.5) * 4.0;
// far LOD of: 1 a large plant, 2 a small plant, 3 3D ground cover (0: a decal, always shown)
vec2 lr = cC.w > 2.5 ? uLodGr : cC.w > 1.5 ? uLodS : uLod;
vFade = cC.w > 0.5 ? smoothstep(lr.x, lr.y, distance(uCamPos, cA.xyz)) : 1.0;
if (abs(cA.w) > 1.5) {
  // lying flat (lily pads, leaf litter): turned to its own angle, pads bob on the water
  float br = 1.0 + sin(uTime * 1.2 + cB.z) * 0.03 * step(0.5, cB.w);
  float a = cB.z;
  vec2 o = vec2(position.x * sz.x, (0.5 - position.y) * sz.y) * br;
  o = vec2(o.x * cos(a) - o.y * sin(a), o.x * sin(a) + o.y * cos(a));
  transformed = cA.xyz + vec3(o.x, 0.04, o.y);
  vWorld = transformed;
} else {
  vec3 up = normalize(vec3(0.0, cos(uLean), 0.0) - uCamBack * sin(uLean));
  float yy = position.y, t = uTime + cB.z, k = cB.w, typ = cC.y, spd = cC.z;
  bool tree = k < 0.5 && uGround < 0.5;
  float yy2 = yy * yy;
  float flex = tree ? 0.035 : 0.21 * k;
  vec2 bendW = wnd.xy * flex + fb * (tree ? 0.03 : 0.3 * k);
  float flutter = sin(t * (5.5 + k * 3.0) + cA.x * 1.7) * (0.015 + 0.04 * wnd.z) * k * (tree ? 0.2 : 1.0) * uWind;
  float bend = flutter + (tree ? sin(t * 0.7 + cA.z * 0.13) * 0.012 : 0.0);
  float sx = 1.0, sy = 1.0;
  if (typ > 0.5 && typ < 1.5) { float b = sin(t * 1.7 * spd); sx = 1.0 + b * 0.06 * yy; sy = 1.0 + b * 0.04; }
  else if (typ > 1.5 && typ < 2.5) { bend += sin(t * 2.6 * spd) * 0.07 * yy; sy = 1.0 + sin(t * 3.4 * spd) * 0.035 * yy; }
  else if (typ > 2.5 && typ < 3.5) { bend += sin(t * 19.0 + cB.z * 3.0) * 0.014 * smoothstep(0.5, 1.0, yy); }
  else if (typ > 3.5) { bend += sin(t * 1.3 * spd) * 0.09 * yy; sx += cos(t * 1.3 * spd) * 0.05 * yy; }
  vec2 off = bendW * sz.y * yy2;
  transformed = cA.xyz + uCamRight * (position.x * sz.x * sx + bend * sz.y * yy2) + up * (yy * sz.y * uHComp * sy - 0.06);
  transformed.xz += off;
  transformed.y -= dot(bendW, bendW) * 0.45 * yy2 * sz.y;
  vWorld = transformed;
  vFlut = uGround < 0.5 && (tree || typ < 0.5) ? smoothstep(0.35, 1.0, yy) * (0.25 + wnd.z * 0.75) * uWind : 0.0;
}
`;
const CARD_UV = /* glsl */`
#include <uv_vertex>
float fu = cA.w < 0.0 ? 1.0 - uv.x : uv.x;
vMapUv = vec2(cR.x + cR.z * fu, cR.y + cR.w * (1.0 - uv.y));
`;
/** leaves flutter: in the upper crown, small blocks of texels shift a pixel back and forth with the gusts */
const CARD_FLUTTER = /* glsl */`
vec2 fTex = floor(vMapUv * 2048.0);
float fBlk = h2(floor(fTex / 3.0) + floor(uTime * 6.0 + h2(floor(fTex / 7.0)) * 4.0) * 1.37);
vec2 fUv = vMapUv;
if (vFlut > 0.0 && fBlk > 1.0 - vFlut * 0.13) fUv.x += (fBlk > 1.0 - vFlut * 0.065 ? 1.0 : -1.0) / 2048.0;
vec4 sampledDiffuseColor = texture2D(map, fUv);
`;
const GRAFT_CARD = /* glsl */`
vec3 graftE = vec3(0.0);
if (vGraft.x > 0.0 || vGraft.z > 0.0) {
  vec2 lt = floor((vMapUv - vGRect.xy) * 2048.0);
  float up = 1.0 - (lt.y + 0.5) / max(1.0, vGRect.w * 2048.0);
  vec3 gc = uGraftCol[int(clamp(vGraft.y + 0.5, 0.0, 3.0))];
  if (vGraft.x > 0.0 && up < vGraft.x * 1.3 - 0.15) {
    float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.40, 0.46, 0.50) * (0.5 + l * 1.7), 0.6) * mix(vec3(1.0), gc, 0.1);
    float bm = mod(lt.y + floor(vGRect.x * 977.0), 9.0);
    if (bm < 1.0) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.84, 0.88), 0.7);
    else if (bm < 2.0) { diffuseColor.rgb *= 0.45; if (mod(lt.x, 4.0) < 1.0) { diffuseColor.rgb = vec3(0.92, 0.95, 0.97); graftE += gc * 0.25; } }
    float hv = h2(vec2(lt.x, 3.0));
    if (hv > 0.82 && h2(floor(lt / vec2(1.0, 4.0)) + 9.0) > 0.35) {
      float pulse = fract(up * 1.6 - uTime * 0.45 + hv * 7.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, gc, 0.6); graftE += gc * (0.3 + 1.6 * smoothstep(0.82, 1.0, pulse));
    }
    if (h2(floor(lt / 2.0) + 21.0) > 0.94) { diffuseColor.rgb = mix(gc, vec3(1.0), 0.45); graftE += gc * 0.5; }
    if (vGraft.x < 1.0 && up > vGraft.x * 1.3 - 0.3) graftE += gc * 1.2;
  }
  if (vGraft.z > 0.0) {
    float dn = h2(lt + 13.0) * 0.65 + up * 0.35;
    if (dn < vGraft.z * 1.05) discard;
    if (dn < vGraft.z * 1.05 + 0.08) graftE += gc * 2.2;
  }
}
`;

export function cardMaterial(U: FloraUniforms, atlas: THREE.Texture, ground: boolean, castShadow: boolean): { mat: THREE.MeshLambertMaterial; depth: THREE.MeshDepthMaterial | null } {
  const LU = { ...U, uGround: { value: ground ? 1 : 0 } };
  const m = new THREE.MeshLambertMaterial({ map: atlas, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, LU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + CARD_VERT_PARS)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(0.0, 1.0, 0.0) + uCamBack * 0.15);')
      .replace('#include <begin_vertex>', CARD_VERT_MAIN)
      .replace('#include <uv_vertex>', CARD_UV);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uVis; uniform float uN, uTime; uniform vec3 uDark; uniform vec3 uGraftCol[4];
varying float vWither, vFlut, vFade; varying vec3 vBase, vWorld; varying vec4 vGraft; varying vec4 vGRect;
uniform vec3 uCamPos; uniform float uGround;
${SHADER_NOISE}
${FOW_FN}
${CUT_PARS}`)
      .replace('void main() {', GN_DECL + 'void main() {\nif (bayer4(gl_FragCoord.xy) >= vFade) discard;\nif (distance(vWorld, uCamPos) < 1.5) discard;\nif (uGround < 0.5 && stip(gl_FragCoord.xy, cutAt(vWorld, uCamPos)) > 0.5) discard;')
      .replace('#include <map_fragment>', `${CARD_FLUTTER}
diffuseColor *= sampledDiffuseColor;
float glowA = sampledDiffuseColor.a;
vec3 glowC = sampledDiffuseColor.rgb;
float lumW = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumW) * vec3(0.62, 0.5, 0.36), vWither * 0.85);
${GRAFT_CARD}`)
      .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.5) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA < 0.98) totalEmissiveRadiance += glowC * 1.3 * (1.0 - vWither);\ntotalEmissiveRadiance += diffuseColor.rgb * 0.22 + graftE;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
gl_FragColor.rgb = applyFow(gl_FragColor.rgb, vBase);
gNormal = vec4(inverseTransformDirection(normalize(normal), viewMatrix) * 0.5 + 0.5, dot(graftE, graftE) > 0.04 ? 32.0 : 0.0);`);
  };
  m.customProgramCacheKey = () => 'oddworld-flora-card';
  (m as any).__gb = true;
  let d: THREE.MeshDepthMaterial | null = null;
  if (castShadow) {
    d = new THREE.MeshDepthMaterial({ map: atlas, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    d.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, LU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + CARD_VERT_PARS)
        .replace('#include <begin_vertex>', CARD_VERT_MAIN)
        .replace('#include <uv_vertex>', CARD_UV);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFade;\n' + SHADER_NOISE)
        .replace('void main() {', 'void main() {\nif (bayer4(gl_FragCoord.xy) >= vFade) discard;');
    };
    d.customProgramCacheKey = () => 'oddworld-flora-card-depth';
  }
  return { mat: m, depth: d };
}
