import * as THREE from 'three';
import { cosmeticOutfit, syncCosmetics } from './cosmetics3d';
import { worldMaterial } from '../gfx/materials';
import { GLOWU } from '../gfx/postfx';
import { BONES, BoneName, BONE_PARENT, BI, Dims, rigDims, cutSpec, PAGE } from './humanModel';
import { ModelBuilder } from '../gfx/modelBuilder';
import { stumpModel, pegModel, hookModel, prostHandModel, prostLegModel, footShell } from './limbGear';
import { cutParts, StumpCond, PROSTHETICS, chainOf } from '../survival/limbs';
import { cyberPieces } from './cyberGear';
import { coveredParts } from '../survival/cyberParts';
import { makePageTexture, EYE_COLORS } from './humanPaint';
import { GGSkin } from './gg/skin';
import { specOf, type SpecOverrides } from './gg/spec';
import { SEC_BONES, SEC_PARENT, type SecBone, type BoneKey } from './gg/types';
import { EXPRESSIONS } from './gg/face';
import { outfitShape } from './humanClothes';
import { HumanAnimator, AnimInput, EMOTES } from './humanAnim';
import { legDimsFrom } from './humanGait';
import { Ragdoll, RagWorld } from './humanRagdoll';
import './humanTextures';

export type JointName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'uarmL' | 'farmL' | 'handL' | 'uarmR' | 'farmR' | 'handR'
  | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR';

export const JOINTS: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

export type HairStyle = 'short' | 'long' | 'buzz' | 'bald' | 'ponytail' | 'curly' | 'bob';
export type FacialHair = 'none' | 'stubble' | 'moustache' | 'goatee' | 'beard';

export interface Appearance {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  face: number;           // 0..5 face variant (0..3 in old saves)
  build: 'slim' | 'average' | 'broad';
  height: number;         // 0.94 .. 1.06 scale
  beard?: boolean;        // legacy: full beard
  // ---- optional (older saves lack them; defaults apply)
  /** 0 = masculine .. 1 = feminine proportions (default 0.3) */
  bodyShape?: number;
  eyeColor?: number;
  facialHair?: FacialHair;
  /** 0..1 */
  freckles?: number;
  /** 0..3 small facial scars */
  scars?: number;
  /** 0..1 age lines */
  age?: number;
}

export interface LookPart {
  tex: string; color: number; sleeve?: 'none' | 'short' | 'long';
  /** item key that produced this look (picks shape variants: slippers, sunglasses, gas mask...) */
  item?: string;
  /** 0..1 blood soaked into the garment (Item.bloody) */
  blood?: number;
  /** 0..1 wear (1 - condition): frays and holes */
  wear?: number;
}
export interface Outfit {
  torso?: LookPart;       // innermost visible top
  torsoOuter?: LookPart;  // jacket/coat (drawn over torso)
  legs?: LookPart;
  legsKind?: 'pants' | 'shorts' | 'skirt';
  feet?: LookPart;
  hands?: LookPart;
  head?: LookPart & { hat?: 'cap' | 'beanie' | 'hardhat' | 'helmet' };
  eyes?: LookPart;
  face?: LookPart;
  back?: LookPart & { size?: number };
  /** wrist monitor / watch on the left wrist */
  wrist?: LookPart;
  /** visible condition (blood, bandages, splints, wet, dirt, pallor, corruption) */
  cond?: RigCondition;
}

/** Visible condition. Body part keys as in items (head, neck, torso_u, torso_l, groin, uarm_l, ..., foot_r). */
export interface RigCondition {
  /** blood stains per body part, 0..3 */
  blood?: Record<string, number>;
  /** bandaged parts: 1 clean, 1.5 spotted, 2 soaked */
  bandage?: Record<string, number>;
  /** splinted parts */
  splint?: string[];
  /** actively bleeding parts -> bleed level 1..3 (drives woundPoints, never repaints) */
  bleeding?: Record<string, number>;
  /** 0..3 */
  wet?: number; dirt?: number; pale?: number; corrupt?: number;
  /** baked facial expression */
  expr?: '' | 'pain' | 'fear';
  /** severed body parts (src/survival/limbs.ts): the mesh drops them and caps the cut */
  sev?: string[];
  /** each cut (the most proximal missing part of a limb): how the stump looks, a tourniquet, the owner's injury id */
  stump?: Record<string, StumpCond & { id?: number }>;
  /** fitted prosthetics by limb ('arm_l' | 'arm_r' | 'leg_l' | 'leg_r' → item key) */
  prost?: Record<string, string>;
  /** installed cyberware ({slot: part key}, src/survival/cyberParts.ts): the flesh it replaces is dropped, the hardware hangs on the bones */
  cyber?: Record<string, string>;
}

/** stump / prosthetic geometry, shared between rigs (bucketed radius, look, skin tint) */
const GEAR_GEO = new Map<string, THREE.BufferGeometry>();
function gearGeo(key: string, fn: (mb: ModelBuilder) => void): THREE.BufferGeometry {
  let g = GEAR_GEO.get(key);
  if (!g) { const mb = new ModelBuilder(); fn(mb); g = mb.build(); GEAR_GEO.set(key, g); }
  return g;
}

export const SKIN_TONES = [0xf3d2b8, 0xe8b98f, 0xd39b6c, 0xb67a4c, 0x8d5634, 0x5e3a24];
export const HAIR_COLORS = [0x1c1612, 0x3b2a1e, 0x6a4628, 0x9c7a46, 0xd8c08a, 0xa8a49e, 0x8a3a1c, 0xe8e2d6];
export { EYE_COLORS, EMOTES };
export const HAIR_STYLES: HairStyle[] = ['short', 'long', 'buzz', 'bald', 'ponytail', 'curly', 'bob'];
export const FACIAL_HAIR: FacialHair[] = ['none', 'stubble', 'moustache', 'goatee', 'beard'];
export const FACE_VARIANTS = 6;
export const FACE_COUNT = FACE_VARIANTS;
export const FACIAL_HAIRS = FACIAL_HAIR;
/** option lists for character creators (numbers in [0,1] are sliders: bodyShape, freckles, age; scars is 0..3) */
export const APPEARANCE_OPTIONS = {
  skin: SKIN_TONES, hair: HAIR_COLORS, hairStyle: HAIR_STYLES, build: ['slim', 'average', 'broad'], facialHair: FACIAL_HAIR, eyeColor: EYE_COLORS,
  bodyShape: [0, 0.25, 0.5, 0.75, 1], freckles: [0, 0.35, 0.7, 1], scars: [0, 1, 2, 3], age: [0, 0.3, 0.6, 0.9],
};

/** Fill in defaults for appearance fields older saves don't have (returns a new object). */
export function normalizeAppearance(a: Partial<Appearance>): Appearance {
  const fh = a.beard === false && a.facialHair === 'beard' ? 'none' : a.beard && (!a.facialHair || a.facialHair === 'none') ? 'beard' : a.facialHair || 'none';
  return {
    ...a,
    skin: a.skin ?? SKIN_TONES[1], hair: a.hair ?? HAIR_COLORS[1], hairStyle: a.hairStyle ?? 'short', face: ((a.face ?? 0) % FACE_VARIANTS + FACE_VARIANTS) % FACE_VARIANTS,
    build: a.build ?? 'average', height: clampN(a.height ?? 1, 0.9, 1.1), beard: fh === 'beard',
    bodyShape: clampN(a.bodyShape ?? 0.3, 0, 1), eyeColor: a.eyeColor, facialHair: fh, freckles: clampN(a.freckles ?? (a.face === 3 ? 0.5 : 0), 0, 1),
    scars: Math.round(clampN(a.scars ?? 0, 0, 3)), age: clampN(a.age ?? 0, 0, 1),
  };
}
const clampN = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ material
let warnedMap = false;
/**
 * Faceted shading for the low-poly body: lights shade every polygon flat
 * (flatShading), and the room's ambient / light-grid term is modulated per
 * facet against a fixed overhead key so the planes of the face, the folds of
 * the clothes and the chamfers of the boots read even under flat indoor light.
 */
const FACET_GLSL = /* glsl */`
{
  vec3 fN = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
  float fk = dot(fN, vec3(-0.38, 0.8, 0.46));
  float fr = 1.0 - abs(dot(fN, normalize(cameraPosition - vWPos)));
  float facet = 0.82 + 0.24 * fk + 0.06 * fN.y - 0.08 * fr * fr;
  irradiance *= clamp(facet, 0.42, 1.3);
}
`;
/**
 * Surface response on top of the faceted Lambert: everyone gets a faint sheen from the key fixture (skin
 * and cloth keep their form under flat tubes); the hazmat suit is glossy PVC (a tight highlight off the
 * fixture overhead and a cool edge reflection on every shade of the suit's colour, a sharper glint on
 * the black rubber gloves, boots and visor frame) and its hood window is dark tinted glass with the face
 * faint behind it. The key light is the fixture that dominates where the body stands (src/world/lighting.ts
 * domTex), straight overhead in scenes without the light grid.
 */
// which paint is what, before the lighting reads the albedo: PVC (any shade of the suit's colour), black
// rubber, and the hood's window (in head space: chin to brow, cheek to cheek, the front of the face)
const GLOSS_PRE = /* glsl */`
float pvc = 0.0, rub = 0.0, glass = 0.0;
if (uGloss.w > 0.0) {
  vec3 dc = diffuseColor.rgb;
  float mx = max(dc.r, max(dc.g, dc.b));
  vec3 sc = uGloss.rgb / max(max(uGloss.r, uGloss.g), max(uGloss.b, 1e-3));
  pvc = smoothstep(0.32, 0.14, length(dc / max(mx, 1e-3) - sc)) * smoothstep(0.03, 0.08, mx);
  rub = (1.0 - pvc) * smoothstep(0.05, 0.02, mx);
  vec3 hp = (uHeadM * vec4(vWPos, 1.0)).xyz / uGloss.w;
  glass = (1.0 - pvc) * (1.0 - rub) * step(-0.2, hp.y) * step(hp.y, 0.55) * step(abs(hp.x), 0.34) * step(0.24, hp.z);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.1, 0.13, 0.16) + vec3(0.003, 0.005, 0.008), glass);
  // vinyl dye is rich: the suit keeps its saturated yellow under the tubes
  diffuseColor.rgb = max(mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, 1.0 + 0.22 * pvc), 0.0);
}
`;
const GLOSS_GLSL = /* glsl */`
#if !defined(UNLIT)
{
  vec3 gN = normalize(vWNormal);
  vec3 gV = normalize(cameraPosition - vWPos);
  bool grid = uWFlags.w < 0.5;
  vec4 kl = grid ? keyLight(vWPos + gN * 0.1) : vec4(0.0);
  vec3 gL = kl.w > 0.0 ? normalize(kl.xyz - vWPos) : normalize(vec3(-0.25, 1.0, 0.35));
  vec3 lc = vec3(0.55);
  if (grid) { vec3 gq = texture2D(uLightTex, (vWPos.xz - uLightInfo.xy) * uLightInfo.zw).rgb; lc = min(gq * gq * uGridScale, vec3(2.0)); }
  vec3 gH = normalize(gL + gV);
  float nh = max(dot(gN, gH), 0.0), nv = max(dot(gN, gV), 0.0);
  float fres = pow(1.0 - nv, 4.0);
  float spec = pow(nh, 22.0) * 0.06 * (1.0 - pvc - rub - glass);
  spec += pvc * (pow(nh, 56.0) * 1.2 + pow(nh, 12.0) * 0.16);
  spec += rub * pow(nh, 70.0) * 0.8 + glass * (pow(nh, 120.0) * 2.2 + pow(nh, 18.0) * 0.18);
  vec3 add = lc * spec;
  float gl = pvc + rub + glass;
  if (gl > 0.0) {
    // a glossy skin mirrors the room: the lit ceiling above, the walls round it, the dark floor below (as
    // bright as the light here, cool-tinted), strongest at grazing angles (a dielectric's Fresnel) ...
    vec3 R = reflect(-gV, gN);
    vec3 envC = lc * mix(vec3(0.12, 0.11, 0.09), vec3(0.8, 0.86, 0.92), smoothstep(-0.35, 0.6, R.y)) + vec3(0.003, 0.004, 0.006);
    float F = 0.05 + 0.95 * pow(1.0 - nv, 5.0);
    add += envC * F * (pvc * 1.2 + rub * 0.8 + glass * 0.9);
    // ... and every tube nearby as a hot streak: on PVC that is the look (the tubes off to the side catch
    // the upright faces of the arms, legs and chest, not just the top of the hood)
    // (seen from the high camera an upright face would mirror only the floor: the glints are placed for an
    // eye-level viewer instead, the way a photo of a PVC suit under office tubes reads)
    vec3 tubes = vec3(0.0);
    vec3 eyeV = normalize(vec3(gV.x, gV.y * 0.3, gV.z));
    for (int i = 0; i < 12; i++) {
      if (i >= uGlowN || !grid) break;
      vec3 Lp = uGlowPos[i].xyz - vWPos;
      float d2 = dot(Lp, Lp);
      vec3 Ld = Lp * inversesqrt(d2);
      float rl = max(dot(R, Ld), 0.0), he = max(dot(gN, normalize(Ld + eyeV)), 0.0);
      tubes += uGlowCol[i].rgb * (pow(rl, 70.0) * 1.8 + pow(he, 90.0) * 3.0 + pow(he, 24.0) * 0.12) / (1.0 + d2 * 0.12);
    }
    add += tubes * (pvc * 1.0 + rub * 0.7 + glass * 0.55) * (0.6 + 0.4 * F);
  }
  totalEmissiveRadiance += add;
}
#endif
`;
function humanMaterial(map: THREE.Texture, base: THREE.Material, uHuman: { value: THREE.Vector4 }, uGloss: { value: THREE.Vector4 }, uHeadM: { value: THREE.Matrix4 }): THREE.MeshLambertMaterial {
  // alphaTest: the ragged tips of the hair shells are cut out of the painted page
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, flatShading: true, alphaTest: 0.5 });
  const b = base as any;
  m.onBeforeCompile = (shader, renderer) => {
    b.onBeforeCompile?.(shader, renderer);
    shader.uniforms.uHuman = uHuman;
    shader.uniforms.uGloss = uGloss;
    shader.uniforms.uHeadM = uHeadM;
    shader.uniforms.uGlowPos = GLOWU.uGlowPos; shader.uniforms.uGlowCol = GLOWU.uGlowCol; shader.uniforms.uGlowN = GLOWU.uGlowN;
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    if (fs.includes('#include <lights_fragment_end>')) fs = fs.replace('#include <lights_fragment_end>', FACET_GLSL + GLOSS_GLSL + '#include <lights_fragment_end>');
    if (fs.includes('#include <lights_lambert_fragment>')) fs = fs.replace('#include <lights_lambert_fragment>', GLOSS_PRE + '#include <lights_lambert_fragment>');
    vs = vs.replace('#include <common>', '#include <common>\nuniform vec4 uHuman;');
    vs = vs.replace('vec4 nWp = vec4( transformed, 1.0 );', `
if (uHuman.x > 0.001) {
  float band = floor(transformed.y * 14.0);
  float gt = floor(uHuman.y * 11.0);
  float gh = fract(sin(band * 12.9898 + gt * 78.233) * 43758.5453);
  if (gh < uHuman.x * 0.22) transformed.x += (fract(gh * 91.7) - 0.5) * 0.14 * uHuman.x;
}
vec4 nWp = vec4( transformed, 1.0 );`);
    fs = fs.replace('#include <common>', '#include <common>\nuniform vec4 uHuman;\nuniform vec4 uGloss;\nuniform mat4 uHeadM;\nuniform vec4 uGlowPos[12];\nuniform vec4 uGlowCol[12];\nuniform int uGlowN;');
    const grad = 'textureGrad( map, auv, dFdx( vMapUv ), dFdy( vMapUv ) )';
    if (fs.includes('texture2D( map, auv )')) fs = fs.replace('texture2D( map, auv )', grad);
    else if (!warnedMap) { warnedMap = true; console.warn('humanRig: world map chunk changed; character mipmaps may shimmer'); }
    fs = fs.replace('diffuseColor *= sampledDiffuseColor;', `diffuseColor *= sampledDiffuseColor;
if (uHuman.x > 0.001) {
  float gb = floor(vWPos.y * 22.0 + floor(uHuman.y * 9.0) * 3.0);
  float gh = fract(sin(gb * 7.13 + floor(uHuman.y * 10.0) * 3.71) * 4375.85);
  if (gh < uHuman.x * 0.28) diffuseColor.rgb = mix(diffuseColor.rgb, gh < uHuman.x * 0.1 ? vec3(1.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.9), 0.7);
}
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.3, 0.25), uHuman.z);
if (uHuman.w > 0.001) {
  // the head flushing red, veins standing out (Timmy charging): head space, above the skull's base
  vec3 hpF = (uHeadM * vec4(vWPos, 1.0)).xyz;
  float onHead = smoothstep(-0.02, 0.04, hpF.y);
  float vein = abs(sin(hpF.x * 150.0 + sin(hpF.y * 95.0) * 2.4) * sin(hpF.z * 125.0 + hpF.y * 64.0 + sin(hpF.x * 71.0)));
  vec3 fc = mix(vec3(0.96, 0.22, 0.22), vec3(0.42, 0.03, 0.09), step(vein, 0.08) * min(1.0, uHuman.w * 1.5));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.3 + fc * 0.78, onHead * clamp(uHuman.w, 0.0, 1.0) * 0.88);
}`);
    shader.vertexShader = vs; shader.fragmentShader = fs;
  };
  const key = b.customProgramCacheKey ? b.customProgramCacheKey() : 'base';
  m.customProgramCacheKey = () => key + '|human4';
  return m;
}

/**
 * Split every triangle that belongs to the head into four, `levels` times (midpoints shared along
 * each face's edges; UVs and colours interpolated, skin weights merged), so an inflated head can
 * round out instead of ballooning its low-poly planes. Only used with ggOverrides.inflate.
 */
function subdivideHead(geo: THREE.BufferGeometry, head: Set<number>, levels: number) {
  for (let L = 0; L < levels; L++) {
    const I = geo.getIndex(); if (!I) return;
    const names = Object.keys(geo.attributes);
    const arrs: Record<string, number[]> = {}, sizes: Record<string, number> = {}, ctors: Record<string, any> = {};
    for (const n of names) { const a = geo.getAttribute(n) as THREE.BufferAttribute; sizes[n] = a.itemSize; arrs[n] = Array.from(a.array as ArrayLike<number>); ctors[n] = (a.array as any).constructor; }
    const SI = arrs.skinIndex, SW = arrs.skinWeight;
    if (!SI || !SW) return;
    const hw = (v: number) => { let w = 0; for (let k = 0; k < 4; k++) if (head.has(SI[v * 4 + k])) w += SW[v * 4 + k]; return w; };
    let nv = arrs.position.length / 3;
    const mids = new Map<string, number>();
    const mid = (a: number, b: number) => {
      const key = a < b ? a + '_' + b : b + '_' + a;
      let m = mids.get(key); if (m !== undefined) return m;
      m = nv++;
      for (const n of names) {
        if (n === 'skinIndex' || n === 'skinWeight') continue;
        const sz = sizes[n], A = arrs[n];
        for (let k = 0; k < sz; k++) A.push((A[a * sz + k] + A[b * sz + k]) / 2);
      }
      const acc = new Map<number, number>();
      for (const v of [a, b]) for (let k = 0; k < 4; k++) { const i = SI[v * 4 + k], w = SW[v * 4 + k]; if (w > 0) acc.set(i, (acc.get(i) ?? 0) + w / 2); }
      const top = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), tot = top.reduce((q, e) => q + e[1], 0) || 1;
      for (let k = 0; k < 4; k++) { SI.push(top[k] ? top[k][0] : 0); SW.push(top[k] ? top[k][1] / tot : 0); }
      mids.set(key, m);
      return m;
    };
    const idx: number[] = [];
    for (let t = 0; t < I.count; t += 3) {
      const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
      if (hw(a) > 0.6 && hw(b) > 0.6 && hw(c) > 0.6) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); }
      else idx.push(a, b, c);
    }
    for (const n of names) geo.setAttribute(n, new THREE.BufferAttribute(new ctors[n](arrs[n]), sizes[n]));
    geo.setIndex(idx);
  }
}

/**
 * Balloon the cranium (ggOverrides.inflate, Timmy): every vertex skinned to the head is pushed out
 * along its direction from the middle of the head, a little over the face and a lot over the crown,
 * the back and the temples, so a big stretched skull carries an ordinary face. Hair and hats ride
 * along (the push depends on direction only). Bind pose, body space; k 0..1.
 */
function inflateHead(geo: THREE.BufferGeometry, dims: Dims, k: number, head: Set<number>) {
  const P = geo.getAttribute('position') as THREE.BufferAttribute, SI = geo.getAttribute('skinIndex'), SW = geo.getAttribute('skinWeight');
  if (!P || !SI || !SW) return;
  const r = dims.rest.head, u = r[1] / 6.4;
  const cx = r[0], cy = r[1] + 0.36 * u, cz = r[2] - 0.04 * u;
  const ss = (e0: number, e1: number, x: number) => { const q = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return q * q * (3 - 2 * q); };
  for (let i = 0; i < P.count; i++) {
    let w = 0;
    for (let j = 0; j < 4; j++) if (head.has(SI.getComponent(i, j))) w += SW.getComponent(i, j);
    if (w <= 0.001) continue;
    const dx = P.getX(i) - cx, dy = P.getY(i) - cy, dz = P.getZ(i) - cz, l = Math.hypot(dx, dy, dz) || 1;
    // everything but the face (front, below the brow) and the jaw rounds out toward one big sphere
    const face = ss(0.15, 0.6, dz / l) * ss(0.45, 0.05, dy / l), m = (1 - face) * ss(-0.88, -0.45, dy / l);
    // a little all over, then the cranium rounded out (layers keep their order: hair stays on the scalp)
    const l0 = l * (1 + 0.1 * k * w), a = 0.92 * m * w * k;
    const f = (Math.pow(l0, 1 - a) * Math.pow(1.0 * u, a)) / l;
    P.setXYZ(i, cx + dx * f, cy + dy * f, cz + dz * f);
  }
  P.needsUpdate = true;
}

// ------------------------------------------------------------------ outline hull (standalone scenes)
/**
 * A black silhouette outline for scenes that do not run the world renderer's
 * edge pass (menus, the operating table, cutscenes): an inverted hull drawn
 * with back faces only, its vertices pushed out along the skinned normal by a
 * constant number of render-target pixels, so it stays one crisp low-res
 * pixel wide at any distance.
 */
const OUTLINE_VS_DECL = 'uniform vec3 uOutline;\n';
const OUTLINE_VS = /* glsl */`
{
#if defined( USE_ENVMAP ) || defined( USE_SKINNING )
  vec3 oObjN = objectNormal;
#else
  vec3 oObjN = normal;
#endif
  vec3 oN = normalize(mat3(modelMatrix) * oObjN);
  vec4 cN = projectionMatrix * (viewMatrix * vec4(oN, 0.0));
  float l = length(cN.xy);
  if (l > 1e-6) gl_Position.xy += cN.xy / l * uOutline.xy * gl_Position.w;
  gl_Position.z += uOutline.z * gl_Position.w;
}
`;
const _osz = new THREE.Vector2();
/** an outline material (skinned or rigid); px = width in render-target pixels */
export function outlineMaterial(px = 1, color = 0x050404, map?: THREE.Texture): THREE.MeshBasicMaterial {
  const u = { value: new THREE.Vector3(0, 0, 0.0012) };
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: false, ...(map ? { map, alphaTest: 0.5 } : {}) });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = u;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + OUTLINE_VS_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + OUTLINE_VS);
  };
  m.customProgramCacheKey = () => 'human-outline' + (map ? 'm' : '');
  (m as any).userData = { px, u };
  return m;
}
/** keep an outline material's pixel width right for whatever target it renders into */
function outlineSize(mesh: THREE.Object3D, mat: THREE.MeshBasicMaterial) {
  mesh.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget();
    if (rt) _osz.set(rt.width, rt.height); else renderer.getDrawingBufferSize(_osz);
    const d = (mat as any).userData as { px: number; u: { value: THREE.Vector3 } };
    d.u.value.x = (2 * d.px) / Math.max(1, _osz.x);
    d.u.value.y = (2 * d.px) / Math.max(1, _osz.y);
  };
}
const EMPTY_GEO = new THREE.BufferGeometry();
const _rv = new THREE.Vector3();
const _rq = new THREE.Quaternion();
const isWorldMat = (m: THREE.Material | undefined) => !!m && typeof (m as any).customProgramCacheKey === 'function' && String((m as any).customProgramCacheKey()).startsWith('noclip:');

// where wounds sit for woundPoints(): bone + local offset (scaled by height)
const WOUND_AT: Record<string, [BoneName, number, number, number]> = {
  head: ['head', 0, 0.13, 0.07], neck: ['neck', 0, 0.03, 0.045], torso_u: ['chest', 0, 0.12, 0.1], torso_l: ['spine', 0, 0.07, 0.095], groin: ['hips', 0, -0.06, 0.08],
  uarm_l: ['uarmL', 0.03, -0.14, 0.03], uarm_r: ['uarmR', -0.03, -0.14, 0.03], farm_l: ['farmL', 0.02, -0.12, 0.03], farm_r: ['farmR', -0.02, -0.12, 0.03],
  hand_l: ['handL', 0.01, -0.05, 0.0], hand_r: ['handR', -0.01, -0.05, 0.0], thigh_l: ['thighL', 0.02, -0.2, 0.07], thigh_r: ['thighR', -0.02, -0.2, 0.07],
  shin_l: ['shinL', 0, -0.2, 0.05], shin_r: ['shinR', 0, -0.2, 0.05], foot_l: ['footL', 0, -0.03, 0.07], foot_r: ['footR', 0, -0.03, 0.07],
};
export interface WoundPoint { part: string; pos: THREE.Vector3; rate: number }
export type HeldGrip = 'perp' | 'along' | 'auto' | 'raw';

/** Re-seat an item mesh (e.g. from makeHeldMesh) so it sits in a closed fist. */
function orientHeld(obj: THREE.Object3D, grip: HeldGrip, k: number): THREE.Object3D {
  let src: THREE.Mesh | null = null;
  obj.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh; });
  const m = src as THREE.Mesh | null;
  if (!m) return obj;
  const geo = m.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3(); bb.getSize(size);
  const L = Math.max(size.x, size.y, size.z);
  const long = size.x >= size.y && size.x >= size.z ? 'x' : size.z >= size.y ? 'z' : 'y';
  if (grip === 'auto') grip = L > 0.22 ? 'perp' : 'small' as HeldGrip;
  // 1. bring the long axis onto +x (handle end at -x)
  const toX = new THREE.Matrix4();
  if (long === 'y') toX.makeRotationZ(-Math.PI / 2);
  else if (long === 'z') toX.makeRotationY(Math.PI / 2);
  const box = bb.clone().applyMatrix4(toX);
  const holder = new THREE.Group();
  const mesh = new THREE.Mesh(geo, m.material);
  mesh.castShadow = true;
  if ((grip as string) === 'small') {
    // small things sit in the palm, centred
    const c = new THREE.Vector3(); bb.getCenter(c);
    mesh.position.copy(c).multiplyScalar(-1);
    holder.add(mesh);
    holder.position.set(0, 0.01, 0.01);
    return holder;
  }
  // 2. grip point: a fifth of the way up from the handle end (a third for short items), mid-height
  const gx = box.min.x + (box.max.x - box.min.x) * (L > 0.3 ? 0.2 : 0.3);
  const gy = (box.min.y + box.max.y) / 2 - (grip === 'along' ? (box.max.y - box.min.y) * 0.25 : 0);
  const gz = (box.min.z + box.max.z) / 2;
  const place = new THREE.Matrix4().makeTranslation(-gx, -gy, -gz).multiply(toX);
  // 3. orient: along the forearm (+x -> -y, top -> +z) or through the fist (+x -> +z, tilted down a little)
  const orient = new THREE.Matrix4();
  if (grip === 'along') orient.makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
  else {
    const d = new THREE.Vector3(0, -0.28, 0.96).normalize();
    const up = new THREE.Vector3(-k, 0, 0);
    const z = new THREE.Vector3().crossVectors(d, up).normalize();
    up.crossVectors(z, d).normalize();
    orient.makeBasis(d, up, z);
  }
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(orient).multiply(place);
  holder.add(mesh);
  return holder;
}

/**
 * A survivor: one skinned low-poly mesh (about 2-2.5k triangles, a single
 * draw call) on the classic joint hierarchy, textured from its own pixel-art
 * page. Joints are plain Groups (`j`) posed with Euler angles, so existing
 * poses, held items (`heldR` / `heldL`) and attachments keep working.
 */
export class HumanRig {
  root = new THREE.Group();
  /** body pivot (rotated for lying / swimming poses) */
  body = new THREE.Group();
  j = {} as Record<JointName, THREE.Group>;
  /** all skeleton nodes including finger / eyelid bones */
  bones = {} as Record<BoneName, THREE.Group>;
  /**
   * One stand-in per body segment, parented to its joint. They draw nothing,
   * but clone() bakes that segment of the current body into a standalone mesh
   * (gore uses this to throw survivor gibs). The visible body is `skin`.
   */
  meshes = new Map<string, THREE.Mesh>();
  heldR = new THREE.Group();
  heldL = new THREE.Group();
  backSlot = new THREE.Group();
  app: Appearance;
  outfit: Outfit = {};
  s: number;
  material: THREE.Material;
  /** the rig's own animator (Player uses it; preview rigs too) */
  anim = new HumanAnimator();
  /** names accepted by playEmote */
  readonly emotes: readonly string[] = EMOTES;
  /** triangles in the current body mesh */
  tris = 0;
  /** shader effects: x corruption glitch 0..1, y time, z hit flash 0..1, w the head flushing red 0..1 (Timmy) */
  fx = { value: new THREE.Vector4(0, 0, 0, 0) };
  /** glossy PVC: rgb the hazmat suit's colour (linear), w head units (m) while a suit is on, 0 otherwise */
  private gloss = { value: new THREE.Vector4(0, 0, 0, 0) };
  private headM = { value: new THREE.Matrix4() };
  dims: Dims;
  private mesh: THREE.SkinnedMesh;
  private skeleton: THREE.Skeleton;
  private page: { tex: THREE.DataTexture; data: Uint8Array };
  /** the low-poly people mesh + paint (src/entities/gg): builds the body, paints the page, animates the face */
  private gg: GGSkin;
  /** spec tweaks for special rigs (the researcher: make-up, a soft bust, her badge); set before setOutfit */
  ggOverrides: SpecOverrides = {};
  private geoKey = ''; private texKey = '';
  private sole = 0;
  private seed: number;
  private baseMat: THREE.Material;
  /** stumps, tourniquets and prosthetics hung on the bones (limb loss) */
  private gear: THREE.Mesh[] = [];
  private gearKey = '';
  /** gore is off: stumps are drawn as closed skin, never raw (set by the limb system) */
  static gentle = false;
  /** extra bones for secondary motion (backpack, hair, coat tails, badge, bust) — rigs built with { secondary: true } */
  private sec: Record<SecBone, THREE.Group> | null = null;
  private secY = 0;
  /** spring state for the coat tails, the badge and the bust */
  private spr = { px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, init: false, coat: 0, coatV: 0, spread: 1, bx: 0, bz: 0, bvx: 0, bvz: 0, uy: 0, uz: 0, uvy: 0, uvz: 0 };
  /** a ragdoll that takes the body over (deaths, knockdowns): see startRagdoll() */
  ragdoll: Ragdoll | null = null;
  /** 0..1 how much of the body the ragdoll drives right now */
  ragW = 0;
  /** what the ragdoll collides with (floor heights, walls); flat ground at the start height when unset */
  ragWorld: RagWorld | null = null;
  private ragRecover = Infinity;
  private flat = { y: 0, ground: (_x: number, _z: number) => this.flat.y };
  /** black silhouette outline for standalone scenes (setOutline) */
  private hull: THREE.SkinnedMesh | null = null;
  private hullMat: THREE.MeshBasicMaterial | null = null;
  private hullRigid: THREE.MeshBasicMaterial | null = null;

  /** level of detail of the body mesh (0 sculpted, 1 coarse: crowds, far NPCs); see setLod() */
  lod = 0;

  constructor(app: Appearance, material?: THREE.Material, opts: { secondary?: boolean; lod?: number; hd?: boolean } = {}) {
    this.lod = opts.lod ?? 0;
    this.page = makePageTexture(opts.hd ? PAGE * 2 : PAGE);
    this.gg = new GGSkin(opts.hd ? 2 : 1, this.page);
    this.app = normalizeAppearance(app);
    this.s = this.app.height;
    this.seed = hashApp(this.app);
    this.baseMat = isWorldMat(material) ? material! : worldMaterial({});
    this.material = humanMaterial(this.page.tex, this.baseMat, this.fx, this.gloss, this.headM);
    this.root.add(this.body);
    for (const b of BONES) { const g = new THREE.Group(); g.name = b; this.bones[b] = g; }
    for (const b of BONES) { const p = BONE_PARENT[b]; (p ? this.bones[p] : this.body).add(this.bones[b]); }
    for (const jn of JOINTS) this.j[jn] = this.bones[jn];
    if (opts.secondary) {
      this.sec = {} as Record<SecBone, THREE.Group>;
      for (const b of SEC_BONES) { const g = new THREE.Group(); g.name = b; this.bones[SEC_PARENT[b]].add(g); this.sec[b] = g; }
    }
    this.dims = rigDims(this.app);
    this.placeBones();
    this.j.handR.add(this.heldR);
    this.j.handL.add(this.heldL);
    this.j.chest.add(this.backSlot);
    this.placeAttach();
    const geo = new THREE.BufferGeometry();
    this.mesh = new THREE.SkinnedMesh(geo, this.material);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.onBeforeRender = () => {
      this.ensurePainted();
      // head space for the hazmat visor (world -> head bone, the bind pose is a pure translation)
      if (this.gloss.value.w > 0 || this.fx.value.w > 0) this.headM.value.copy(this.j.head.matrixWorld).invert();
    };
    this.mesh.onAfterRender = () => { this.gg.fullPending = false; };
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.7);
    this.body.add(this.mesh);
    this.skeleton = this.makeSkeleton();
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    for (const jn of JOINTS) {
      const proxy = new THREE.Mesh(EMPTY_GEO, this.material);
      proxy.visible = false; proxy.name = 'seg:' + jn;
      (proxy as any).clone = () => this.segmentMesh(jn);
      this.j[jn].add(proxy);
      this.meshes.set(jn, proxy);
    }
    // the first paint waits for a real outfit (or the first frame): callers dress the rig right after building it
    this.deferPaint = true;
    this.setOutfit({});
    this.deferPaint = false;
  }
  private deferPaint = false;
  /** paint now if the page has not been painted yet (first frame, first animation step) */
  private ensurePainted() { if (!this.texKey) this.setOutfit(this.outfit); }

  /**
   * Draw a black outline round the silhouette (an inverted hull that follows
   * the skin, plus the rigid pieces hung on the bones). For scenes that do not
   * run the world renderer's edge pass: menus, the operating table,
   * cutscenes. px is the width in render-target pixels; false removes it.
   */
  setOutline(px: number | false = 1) {
    if (px === false || px <= 0) {
      if (this.hull) { this.hull.removeFromParent(); this.hull = null; }
      this.body.traverse((o) => { if ((o as any).userData?.isHull) o.visible = false; });
      return;
    }
    if (!this.hullMat) { this.hullMat = outlineMaterial(px, 0x050404, this.page.tex); this.hullRigid = outlineMaterial(px); }
    (this.hullMat as any).userData.px = px; (this.hullRigid as any).userData.px = px;
    if (!this.hull) {
      const h = new THREE.SkinnedMesh(this.mesh.geometry, this.hullMat);
      h.name = 'outline'; h.userData.isHull = true;
      h.frustumCulled = false; h.castShadow = false; h.receiveShadow = false;
      h.bind(this.skeleton, new THREE.Matrix4());
      outlineSize(h, this.hullMat);
      this.body.add(h);
      this.hull = h;
    }
    this.refreshOutlines();
  }
  get outlined() { return !!this.hull; }

  /** give every rigid piece on the bones (cosmetics, stumps, cyberware) an outline child */
  private refreshOutlines() {
    const mat = this.hullRigid;
    if (!this.hull || !mat) return;
    const add: THREE.Mesh[] = [];
    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m.userData.isHull || m.userData.hull || !m.visible) return;
      if (!/^(cosmetic:|limbgear|cybergear)/.test(m.name)) return;
      if ((m.material as THREE.Material & { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial) return;
      add.push(m);
    });
    for (const m of add) {
      const h = new THREE.Mesh(m.geometry, mat);
      h.userData.isHull = true; h.name = 'outline';
      outlineSize(h, mat);
      m.add(h); m.userData.hull = h;
    }
  }

  /** switch the body mesh's level of detail (rebuilds it when it changes) */
  setLod(l: number) { if (l === this.lod) return; this.lod = l; this.setOutfit(this.outfit); }

  /** the visible skinned body mesh */
  get skin(): THREE.SkinnedMesh { return this.mesh; }

  /** a static mesh of one body segment (bind pose, joint-local), e.g. for gibs */
  segmentMesh(jn: JointName): THREE.Mesh {
    const g = this.mesh.geometry;
    const P = g.getAttribute('position'), SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight'), I = g.getIndex();
    const owner = (b: number): JointName => { if (b >= BONES.length) return b === BONES.length ? 'chest' : 'head'; let n = BONES[b] as BoneName; while (n && !(JOINTS as string[]).includes(n)) n = BONE_PARENT[n] as BoneName; return (n || 'chest') as JointName; };
    const dom = (v: number) => { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = SW.getComponent(v, k); if (w > bw) { bw = w; best = SI.getComponent(v, k); } } return owner(best); };
    const keep: number[] = [];
    if (I) for (let t = 0; t < I.count; t += 3) { const a = I.getX(t); if (dom(a) === jn && dom(I.getX(t + 1)) === jn) keep.push(I.getX(t), I.getX(t + 1), I.getX(t + 2)); }
    const r = this.dims.rest[jn];
    const geo = new THREE.BufferGeometry();
    const map = new Map<number, number>();
    const attrs: Record<string, number[]> = { position: [], normal: [], uv: [], color: [], aAtlas: [], aFx: [] };
    const idx: number[] = [];
    for (const v of keep) {
      let ni = map.get(v);
      if (ni === undefined) {
        ni = map.size; map.set(v, ni);
        for (const name of Object.keys(attrs)) {
          const at = g.getAttribute(name); if (!at) continue;
          for (let c = 0; c < at.itemSize; c++) attrs[name].push(at.getComponent(v, c) - (name === 'position' ? r[c] : 0));
        }
      }
      idx.push(ni);
    }
    for (const [name, arr] of Object.entries(attrs)) { const at = g.getAttribute(name); if (at) geo.setAttribute(name, new THREE.Float32BufferAttribute(arr, at.itemSize)); }
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, this.material);
    m.castShadow = true;
    return m;
  }

  private placeBones() {
    for (const b of BONES) { const o = this.dims.off[b]; this.bones[b].position.set(o[0], o[1], o[2]); }
  }
  private placeAttach() {
    const s = this.s;
    this.heldR.position.set(0.008 * s, -0.078 * s, 0.006 * s);
    this.heldL.position.set(-0.008 * s, -0.078 * s, 0.006 * s);
    this.backSlot.position.set(0, 0.1 * s, -0.14 * s * (this.dims.mass));
  }
  private makeSkeleton() {
    // bind pose: bones are pure translations from the body origin
    const inv = BONES.map((b) => { const r = this.dims.rest[b]; return new THREE.Matrix4().makeTranslation(-r[0], -r[1], -r[2]); });
    const bones = BONES.map((b) => this.bones[b]) as THREE.Object3D[];
    if (this.sec) for (const b of SEC_BONES) { bones.push(this.sec[b]); inv.push(new THREE.Matrix4()); }
    const sk = new THREE.Skeleton(bones as unknown as THREE.Bone[], inv);
    this.placeSecondary(sk);
    return sk;
  }

  /** pivots of the secondary bones (the top of the backpack, the root of a ponytail, the waist for coat tails...) */
  private placeSecondary(sk = this.skeleton) {
    if (!this.sec) return;
    const d = this.dims, s = d.s, r = d.rest;
    const piv = this.gg.plan?.pivots ?? {};
    const def: Record<SecBone, number[]> = {
      pack: [0, 1.42 * s, -0.14 * s], hair: [0, r.head[1] + 0.03 * s, r.head[2] - 0.05 * s], coat: [0, r.spine[1] + 0.02 * s, 0],
      badge: [0, r.neck[1] - 0.02 * s, 0.07 * s], bust: [0, r.chest[1] + 0.08 * s, 0.06 * s],
    };
    SEC_BONES.forEach((b, i) => {
      const p = piv[b] ?? def[b], par = r[SEC_PARENT[b]];
      this.sec![b].position.set(p[0] - par[0], p[1] - par[1], p[2] - par[2]);
      if (b === 'pack') this.secY = p[1] - par[1];
      if (b === 'bust') this.sec!.bust.userData.base = this.sec!.bust.position.clone();
      sk.boneInverses[BONES.length + i].makeTranslation(-p[0], -p[1], -p[2]);
    });
  }

  /** skeleton index of a segment's bone (secondary bones fall back to their parent without { secondary }) */
  private boneIndex = (b: BoneKey): number => {
    const si = (SEC_BONES as readonly string[]).indexOf(b);
    if (si >= 0) return this.sec ? BONES.length + si : BI[SEC_PARENT[b as SecBone]];
    return BI[b as BoneName];
  };

  /** Change the body / face (rebuilds the mesh and texture). */
  setAppearance(app: Appearance) {
    this.app = normalizeAppearance(app);
    this.s = this.app.height;
    this.seed = hashApp(this.app);
    this.dims = rigDims(this.app);
    this.placeBones();
    this.placeAttach();
    this.skeleton.dispose();
    this.skeleton = this.makeSkeleton();
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.hull?.bind(this.skeleton, new THREE.Matrix4());
    this.geoKey = ''; this.texKey = '';
    this.setOutfit(this.outfit);
  }

  /** Rebuild the body for an outfit (cheap when nothing visible changed). */
  setOutfit(o: Outfit) {
    this.outfit = o || {};
    const full = cosmeticOutfit(withDefaults(this.outfit), this.app);
    const sh = outfitShape(full);
    const cond = this.outfit.cond || {};
    const spec = specOf(this.app, full, this.dims, this.seed, cond, this.ggOverrides);
    const D = spec.dress;
    if (D.suit === 'hazmat') {
      const c = D.hazmat?.col ?? [232, 196, 40];
      const lin = (v: number) => Math.pow(v / 255, 2.2);
      // head units: chin to crown (the head bone sits at the jaw hinge, 0.8 units under the crown of a ~7.2-unit body)
      this.gloss.value.set(lin(c[0]), lin(c[1]), lin(c[2]), this.dims.rest.head[1] / 6.4);
    } else this.gloss.value.w = 0;
    const appKey = JSON.stringify(this.app);
    const shapeKey = JSON.stringify([D.top?.kind, D.top?.sleeve, D.outer?.kind, D.outer?.sleeve, D.bottom?.kind, D.legsKind, D.feet?.kind, D.hands?.kind, D.hat?.kind, D.mask?.kind, D.back?.kind, D.back?.size, !!D.wrist, D.suit, D.hatFlat, D.badge ? 1 : 0, this.ggOverrides.bust, this.ggOverrides.hairStyle, this.ggOverrides.hairVolume, this.ggOverrides.inflate]);
    const severed = new Set([...(cond.sev || []), ...coveredParts(cond.cyber)]);
    const gk = this.lod + appKey + shapeKey + [...severed].sort().join(',');
    const { cond: _c, ...looks } = full;
    void _c;
    const condKey = JSON.stringify({ ...cond, bleeding: undefined, stump: undefined, prost: undefined, sev: undefined, cyber: undefined });
    const tk = appKey + JSON.stringify(looks) + condKey + JSON.stringify(this.ggOverrides);
    if (gk !== this.geoKey) {
      this.geoKey = gk;
      this.texKey = '';
      const geo = this.gg.build(spec, this.dims, severed, this.lod, this.boneIndex);
      if (this.ggOverrides.inflate) { const hb = new Set([this.boneIndex('head'), this.boneIndex('hair' as BoneKey)]); subdivideHead(geo, hb, 2); inflateHead(geo, this.dims, this.ggOverrides.inflate, hb); }
      const old = this.mesh.geometry;
      this.mesh.geometry = geo;
      if (this.hull) this.hull.geometry = geo;
      old.dispose();
      this.tris = this.gg.tris;
      this.sole = spec.sole;
      if (this.sec) this.placeSecondary();
      this.anim.dims = legDimsFrom(this.dims, this.sole);
      this.backSlot.position.z = -(0.14 + (sh.back ? 0.16 * sh.back : 0)) * this.s * this.dims.mass;
    }
    if (tk !== this.texKey && !this.deferPaint) {
      this.texKey = tk;
      const baseKey = appKey + JSON.stringify(looks) + JSON.stringify(this.ggOverrides) + (cond.pale ?? 0) + (cond.expr || '');
      this.gg.paintAll(spec, this.app, cond, baseKey);
    }
    this.updateGear(cond, sh);
    syncCosmetics(this, full, this.baseMat);
    if (this.hull) this.refreshOutlines();
  }

  // ------------------------------------------------------------------ the face (painted, animated)
  /**
   * Show an expression on the painted face: neutral, smile, happy, grin, surprised, sad, angry, sleepy,
   * pain, fear, think, wink, cool, dead (aliases wow, mad, scared, hurt...). hold: seconds, 0 = until changed.
   */
  setExpression(name: string, hold = 0) { this.gg.setExpression(name, hold); }
  /** the current expression */
  get expression() { return this.gg.expr; }
  /** move the mouth as if speaking for `sec` seconds (0 stops) */
  talk(sec = 1.5) { this.gg.talk(sec); }
  /** speak while true (e.g. while a line of dialogue is on screen) */
  set talking(v: boolean) { this.gg.talking = v; }
  get talking() { return this.gg.talking; }
  /** eye direction on the painted face (-2..2 sideways, -1..2 down) */
  lookEyes(x: number, y: number) { this.gg.look[0] = x; this.gg.look[1] = y; }
  /** faces animate (blinks, expressions, talking) unless switched off (crowds, far NPCs) */
  set faceAnim(v: boolean) { this.gg.animateFace = v; }
  static readonly EXPRESSIONS = Object.keys(EXPRESSIONS);

  /** limb loss: a cap on every stump (raw, seared, stitched, bandaged, healed; a tourniquet), and the prosthetics */
  private updateGear(cond: RigCondition, sh: ReturnType<typeof outfitShape>) {
    const sev = cond.sev || [];
    const stumpKey = (st: StumpCond | undefined) => st ? st.s + (st.tq ? '+tq' : '') : 'healed';
    const key = sev.length || cond.cyber ? JSON.stringify([cond.cyber, sev, Object.entries(cond.stump || {}).map(([k, v]) => k + ':' + stumpKey(v)), cond.prost, this.app.skin, this.s, this.app.build, sh.sleeve, sh.legKind, HumanRig.gentle]) : '';
    if (key === this.gearKey) return;
    this.gearKey = key;
    for (const m of this.gear) m.removeFromParent();
    this.gear.length = 0;
    // cyberware: every piece rides its bone
    for (const pc of cyberPieces(cond.cyber, this.dims)) {
      const m = new THREE.Mesh(pc.geo, this.baseMat);
      m.castShadow = true; m.name = 'cybergear';
      this.bones[pc.bone].add(m);
      this.gear.push(m);
    }
    if (!sev.length) return;
    const skin = this.app.skin;
    const q = (r: number) => Math.round(r * 200) / 200;
    for (const cut of cutParts(sev)) {
      const spec = cutSpec(cut, this.dims, sh);
      if (!spec) continue;
      const ch = chainOf(cut)!;
      const pk = cond.prost?.[`${ch.kind}_${ch.side}`];
      const pd = pk ? PROSTHETICS[pk] : null;
      const level = 3 - ch.idx;
      const fits = !!pd && level <= pd.maxLevel;
      const st = cond.stump?.[cut];
      let look = st?.s ?? 'healed';
      if (HumanRig.gentle && (look === 'raw' || look === 'caut')) look = 'clean';
      const r = q(spec.r);
      const add = (geo: THREE.BufferGeometry, bone: BoneName, pos: [number, number, number]) => {
        const m = new THREE.Mesh(geo, this.baseMat);
        m.castShadow = true; m.position.set(pos[0], pos[1], pos[2]);
        m.name = 'limbgear';
        this.bones[bone].add(m);
        this.gear.push(m);
      };
      // the stump itself (hidden inside a prosthetic socket, unless it is bandaged)
      if (!fits || look === 'band' || look === 'bandb') add(gearGeo(`st:${look}:${st?.tq ? 1 : 0}:${r}:${skin}`, (mb) => stumpModel(mb, r, look as any, !!st?.tq, skin)), spec.bone, spec.pos);
      if (!fits || !pd) continue;
      const s = this.s;
      if (pd.kind === 'peg') {
        // to the floor: from the cut down (ankle cut: the rest of the shin and the foot; knee cut: the whole shin and the foot)
        const len = (cut.startsWith('foot') ? 0.42 - 0.37 + 0.07 : 0.43 + 0.42 - 0.42 + 0.07) * s + 0.02;
        add(gearGeo(`peg:${r}:${q(len)}`, (mb) => pegModel(mb, r, len)), spec.bone, spec.pos);
      } else if (pd.kind === 'leg') {
        if (cut.startsWith('foot')) add(gearGeo(`pl:f:${r}`, (mb) => prostLegModel(mb, r, 0, false)), spec.bone, spec.pos);
        else {
          // above the knee the socket rides the thigh (which still swings); below, it caps the knee stump
          const above = cut.startsWith('thigh');
          const lenToKnee = above ? 0.34 * s : 0.02;
          add(gearGeo(`pl:s:${r}:${q(lenToKnee)}`, (mb) => prostLegModel(mb, r, lenToKnee, false)), above ? ('thigh' + spec.side) as BoneName : spec.bone, above ? [0, -0.07 * s, 0] : spec.pos);
          // the shin pylon hangs off the knee and bends with it
          const sb = ('shin' + spec.side) as BoneName;
          add(gearGeo(`pl:p:${q(s)}`, (mb) => { mb.cylinder(0, -0.36 * s, 0, 0.016, 0.36 * s, 6, { sides: 'i_steel', top: 'i_steel', bottom: 'i_steel' }, { fit: true }); mb.cylinder(0, -0.04 * s, 0, 0.034, 0.05, 7, 'i_carbon', { fit: true }); }), sb, [0, 0, 0]);
        }
        add(gearGeo(`pl:foot`, (mb) => footShell(mb, 0)), ('foot' + spec.side) as BoneName, [0, 0, 0]);
      } else if (pd.kind === 'hook') add(gearGeo(`hook:${r}:${cut.startsWith('farm') ? 1 : 0}`, (mb) => hookModel(mb, r, cut.startsWith('farm'))), spec.bone, spec.pos);
      else if (pd.kind === 'hand') add(gearGeo(`ph:${r}:${cut.startsWith('farm') ? 1 : 0}`, (mb) => prostHandModel(mb, r, cut.startsWith('farm'))), spec.bone, spec.pos);
    }
  }

  /** Update only the visible condition (blood, bandages, wet...). */
  setCondition(c: RigCondition | undefined) { this.setOutfit({ ...this.outfit, cond: c }); }

  /**
   * Place an item mesh in a hand (null clears). Item models follow the usual
   * convention (handle toward -x, business end toward +x). grip:
   * 'perp' = through the fist out of the thumb side (bats, axes, tools, knives),
   * 'along' = pointing along the forearm (guns, flashlights), 'auto' picks by
   * size, 'raw' attaches the mesh untouched.
   */
  hold(side: 'R' | 'L', mesh: THREE.Object3D | null, grip: HeldGrip = 'auto') {
    const g = side === 'R' ? this.heldR : this.heldL;
    g.clear();
    if (!mesh) return;
    g.add(grip === 'raw' ? mesh : orientHeld(mesh, grip, side === 'R' ? -1 : 1));
  }

  setVisible(v: boolean) { this.root.visible = v; }

  /** Apply a pose (Euler angles per joint, radians) */
  applyPose(p: Pose) {
    for (const k of JOINTS) {
      const r = p[k];
      const g = this.j[k];
      if (r) g.rotation.set(r[0], r[1], r[2]); else g.rotation.set(0, 0, 0);
    }
    this.j.hips.position.set(p.rootX ?? 0, this.dims.hipY + this.sole + (p.rootY ?? 0), p.rootZ ?? 0);
    this.body.rotation.set(p.bodyPitch ?? 0, p.bodyYaw ?? 0, p.bodyRoll ?? 0);
    this.body.position.y = p.bodyY ?? 0;
    // fingers curl into a fist around the grip; eyelids close for blinks / sleep
    for (const [side, k] of [['L', 1], ['R', -1]] as const) {
      const g = clampN((side === 'L' ? p.gripL : p.gripR) ?? 0.3, 0, 1);
      this.bones[('fing1' + side) as BoneName].rotation.set(0, 0, -k * g * 1.45);
      this.bones[('fing2' + side) as BoneName].rotation.set(0, 0, -k * g * 1.6);
      this.bones[('thumb' + side) as BoneName].rotation.set(g * 0.5, k * g * 0.6, -k * g * 0.55);
    }
    // blinks are painted on the face (the lids bone is kept for old poses)
    this.gg.blink = p.blink ?? 0;
    const E = this.sec;
    if (E) {
      const a = p.pack, h = p.hair;
      if (a) E.pack.rotation.set(a[0], a[1], a[2]); else E.pack.rotation.set(0, 0, 0);
      E.pack.position.y = this.secY + (p.packY ?? 0);
      if (h) E.hair.rotation.set(h[0], h[1], h[2]); else E.hair.rotation.set(0, 0, 0);
    }
  }

  /** Advance the painted face (blinks, expressions, talking) and the shader clock for rigs posed with applyPose() directly. */
  faceTick(dt: number) { this.ensurePainted(); this.fx.value.y += dt; this.gg.update(dt); }

  /** Animate with the rig's own animator and apply the pose. */
  animate(dt: number, input: AnimInput) {
    this.ensurePainted();
    const pose = this.anim.update(dt, input);
    this.fx.value.y += dt;
    this.applyPose(pose);
    if (this.hull) { this.hull.layers.mask = this.mesh.layers.mask; this.hull.visible = this.mesh.visible; }
    if (this.ragdoll?.active) this.driveRagdoll(dt);
    this.secondary(dt);
    this.gg.update(dt);
    return pose;
  }

  /** coat tails follow the thighs and flap, the badge hangs plumb and swings, a soft bust bounces a little */
  private secondary(dt: number) {
    const E = this.sec;
    if (!E || dt <= 0) return;
    const S = this.spr, h = Math.min(dt, 0.05);
    const hp = this.j.hips.position, rp = this.root.position;
    const x = rp.x + hp.x, y = rp.y + hp.y + this.body.position.y, z = rp.z + hp.z;
    if (!S.init) { S.px = x; S.py = y; S.pz = z; S.init = true; }
    const vx = (x - S.px) / h, vy = (y - S.py) / h, vz = (z - S.pz) / h;
    S.px = x; S.py = y; S.pz = z;
    const cl = (v: number, m: number) => (v < -m ? -m : v > m ? m : v);
    const ax = cl((vx - S.vx) / h, 30), ay = cl((vy - S.vy) / h, 30), az = cl((vz - S.vz) / h, 30);
    S.vx = vx; S.vy = vy; S.vz = vz;
    const yaw = this.root.rotation.y, c = Math.cos(yaw), sn = Math.sin(yaw);
    const aSide = ax * c - az * sn, aFwd = ax * sn + az * c;
    // coat tails / skirt: half the thighs' swing, lagging behind when the body lurches
    const tl = this.j.thighL.rotation.x, tr = this.j.thighR.rotation.x;
    const want = (tl + tr) * 0.5 * 0.6;
    S.coatV += ((want - S.coat) * 140 - S.coatV * 13 + aFwd * 1.4) * h; S.coat += S.coatV * h;
    S.coat = cl(S.coat, 1.2);
    S.spread += ((1 + Math.abs(tl - tr) * 0.45) - S.spread) * Math.min(1, h * 14);
    E.coat.rotation.set(S.coat, 0, 0);
    E.coat.scale.set(1 + Math.abs(tl - tr) * 0.08, 1, S.spread);
    // badge: plumb against the torso's lean, swinging on its lanyard
    const lean = this.j.hips.rotation.x + this.j.spine.rotation.x + this.j.chest.rotation.x + this.body.rotation.x;
    S.bvx += (-S.bx * 55 - S.bvx * 5 + aFwd * 1.2) * h; S.bx = cl(S.bx + S.bvx * h, 0.6);
    S.bvz += (-S.bz * 55 - S.bvz * 5 - aSide * 1.0 + (this.j.chest.rotation.y - this.j.hips.rotation.y) * 4) * h; S.bz = cl(S.bz + S.bvz * h, 0.5);
    E.badge.rotation.set(Math.max(-1.2, Math.min(0.4, -lean)) + S.bx, 0, S.bz);
    // bust: a small damped bounce with the gait, a lag when the body is jolted (millimetres)
    S.uvy += (-S.uy * 420 - S.uvy * 11 - ay * 0.55) * h; S.uy = cl(S.uy + S.uvy * h, 0.005);
    S.uvz += (-S.uz * 380 - S.uvz * 10 - aFwd * 0.35) * h; S.uz = cl(S.uz + S.uvz * h, 0.004);
    const bb = (E.bust.userData.base as THREE.Vector3 | undefined);
    if (bb) E.bust.position.set(bb.x, bb.y + S.uy * this.s, bb.z + S.uz * this.s);
  }

  /**
   * Hand the body to a ragdoll, starting from the current pose. vel: the
   * body's world velocity; imp: extra world velocity for the struck part;
   * recoverAfter: seconds before it blends back into the animation (deaths
   * pass Infinity and stay down).
   */
  startRagdoll(vel: THREE.Vector3, imp: THREE.Vector3, part = '', recoverAfter = Infinity) {
    if (!this.ragdoll) this.ragdoll = new Ragdoll();
    this.root.updateMatrixWorld(true);
    this.flat.y = this.root.getWorldPosition(_rv).y;
    this.ragdoll.start(this.bones, this.dims, vel, imp, part, 1, recoverAfter === Infinity);
    this.ragW = 1; this.ragRecover = recoverAfter;
  }
  /** back to pure animation at once (revived, respawned) */
  stopRagdoll() { this.ragdoll?.stop(); this.ragW = 0; this.ragRecover = Infinity; this.anim.resetFeet(); }
  get ragdolling() { return !!this.ragdoll?.active; }

  private driveRagdoll(dt: number) {
    const R = this.ragdoll!;
    R.step(dt, this.ragWorld ?? this.flat);
    if (R.t > this.ragRecover) {
      this.ragW = Math.max(0, this.ragW - dt / 0.65);
      if (this.ragW <= 0) { R.stop(); this.ragRecover = Infinity; this.anim.resetFeet(); return; }
    }
    this.root.updateWorldMatrix(true, false);
    R.solve(this.root.matrixWorld);
    const w = this.ragW;
    for (const jn of JOINTS) { const b = this.j[jn]; if (w >= 0.999) b.quaternion.copy(R.q[jn]); else b.quaternion.slerp(R.q[jn], w); }
    this.j.hips.position.lerp(R.hips, w);
    if (w >= 0.999) { this.body.rotation.set(0, 0, 0); this.body.position.y = 0; }
    else { this.body.quaternion.slerp(_rq.identity(), w); this.body.position.y *= 1 - w; }
  }

  /** a blow: (dx, dz) the WORLD direction it pushes the body, part an item body-part key, strength 0..1.5 */
  hit(dx: number, dz: number, part: string, strength: number) {
    const th = this.root.rotation.y, c = Math.cos(th), s = Math.sin(th);
    this.anim.hit(c * dx - s * dz, s * dx + c * dz, part, strength);
  }

  /**
   * Self-driven animation (previews, menus, cutscenes): idle with fidgets,
   * blinking and emotes. Pass AnimInput fields to walk / act / pose; a Pose
   * argument (from another animator) is ignored. Holding is detected from
   * what is attached to heldR / heldL.
   */
  update(dt: number, input?: Partial<AnimInput> | Pose) {
    const isInput = !!input && ('speed' in input || 'stance' in input || 'action' in input || 'full' in input || 'panic' in input);
    const inp: AnimInput = {
      speed: 0, stance: 'stand', full: '', action: '', actionT: 0, actionDur: 1, twoHanded: false, limp: 0, tired: 0, panic: 0, cold: 0,
      aimPitch: 0, holdingLight: false, holding: this.heldR.children.length > 0, heldL: this.heldL.children.length > 0, lookYaw: 0, fidget: true,
      ...(isInput ? (input as Partial<AnimInput>) : {}),
    };
    if (inp.action && !(isInput && 'actionT' in (input as object))) { this.selfT += dt; inp.actionT = this.selfT % (inp.actionDur || 1); }
    return this.animate(dt, inp);
  }
  private selfT = 0;

  /** Play an emote by name (see `emotes`); returns false for unknown names. Looping emotes stop when the character moves or acts. */
  playEmote(name: string, loop?: boolean) { return this.anim.playEmote(name, loop); }
  stopEmote() { this.anim.stopEmote(); }

  /** World positions of actively bleeding body parts (from outfit.cond.bleeding). */
  woundPoints(out: WoundPoint[] = []): WoundPoint[] {
    out.length = 0;
    const b = this.outfit.cond?.bleeding;
    if (!b) return out;
    let updated = false;
    const sev = this.outfit.cond?.sev;
    for (const [part, rate] of Object.entries(b)) {
      const at = WOUND_AT[part]; if (!at || !rate) continue;
      if (!updated) { this.root.updateMatrixWorld(true); updated = true; }
      const s = this.s;
      // a stump bleeds from the cut, not from where the missing part used to hang
      const cs = sev?.includes(part) ? cutSpec(part, this.dims) : null;
      const pos = cs ? new THREE.Vector3(cs.pos[0], cs.pos[1], cs.pos[2]).applyMatrix4(this.bones[cs.bone].matrixWorld)
        : new THREE.Vector3(at[1] * s, at[2] * s, at[3] * s).applyMatrix4(this.bones[at[0]].matrixWorld);
      out.push({ part, pos, rate });
    }
    return out;
  }

  /** world position of a joint */
  jointWorld(name: JointName, out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.j[name].getWorldPosition(out); }

  dispose() {
    this.mesh.geometry.dispose();
    this.page.tex.dispose();
    this.material.dispose();
    this.skeleton.dispose();
    this.hullMat?.dispose(); this.hullRigid?.dispose();
  }
}

export type Pose = Partial<Record<JointName, [number, number, number]>> & {
  rootY?: number; rootZ?: number; rootX?: number; bodyPitch?: number; bodyRoll?: number; bodyYaw?: number; bodyY?: number;
  /** 0 open hand .. 1 fist */
  gripL?: number; gripR?: number;
  /** 0 eyes open .. 1 closed */
  blink?: number;
  /** secondary motion (rigs built with secondary bones): backpack swing (pitch, yaw, roll) and bounce, hair swing */
  pack?: [number, number, number]; packY?: number;
  hair?: [number, number, number];
};

/** visible defaults: underwear when nothing is worn */
function withDefaults(o: Outfit): Outfit {
  const f: Outfit = { ...o };
  if (!f.torso && !f.torsoOuter) f.torso = { tex: 'c_underwear', color: 0xd8d4c8, sleeve: 'none' };
  if (!f.legs) f.legs = { tex: 'c_underwear', color: 0xd8d4c8 };
  return f;
}
function hashApp(a: Appearance) { const s = JSON.stringify(a); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }

export function randomAppearance(rnd: () => number): Appearance {
  const fem = rnd() < 0.5;
  const bodyShape = fem ? 0.72 + rnd() * 0.28 : rnd() * 0.3;
  const styles: HairStyle[] = fem ? ['long', 'ponytail', 'bob', 'curly', 'short', 'long', 'bob', 'buzz'] : ['short', 'buzz', 'curly', 'short', 'bald', 'long', 'ponytail', 'short'];
  const fhRoll = rnd();
  const facialHair: FacialHair = fem ? 'none' : fhRoll < 0.18 ? 'beard' : fhRoll < 0.32 ? 'stubble' : fhRoll < 0.4 ? 'moustache' : fhRoll < 0.46 ? 'goatee' : 'none';
  return {
    skin: SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)],
    hair: HAIR_COLORS[Math.floor(rnd() * HAIR_COLORS.length)],
    hairStyle: styles[Math.floor(rnd() * styles.length)],
    face: Math.floor(rnd() * FACE_VARIANTS),
    build: (['slim', 'average', 'broad'] as const)[Math.floor(rnd() * 3)],
    height: fem ? 0.94 + rnd() * 0.08 : 0.97 + rnd() * 0.09,
    beard: facialHair === 'beard',
    bodyShape: Math.round(bodyShape * 100) / 100,
    eyeColor: EYE_COLORS[Math.floor(rnd() * EYE_COLORS.length)],
    facialHair,
    freckles: rnd() < 0.15 ? Math.round((0.3 + rnd() * 0.6) * 100) / 100 : 0,
    scars: rnd() < 0.1 ? 1 + Math.floor(rnd() * 2) : 0,
    age: Math.round(rnd() * rnd() * 70) / 100,
  };
}

// ------------------------------------------------------------------ standalone preview
/**
 * A rig that works outside a running game (character creator, menus). It is
 * an ordinary HumanRig whose material ignores the zone light grid, the
 * visibility mask and the fog, so it is lit only by ordinary three.js lights:
 * add `rig.root` to any THREE.Scene with e.g. an AmbientLight / HemisphereLight
 * (~0.8-1.2) plus a DirectionalLight key (~1.5-2), call `rig.update(dt)` every
 * frame (idle breathing, fidgets, blinking, emotes via `rig.playEmote(name)`),
 * and `rig.dispose()` when done.
 */
export function createPreviewRig(app: Appearance, outfit: Outfit = {}, opts: { outline?: number | false } = {}): HumanRig {
  const rig = new HumanRig(app, worldMaterial({ noVis: true, noFog: true, noGrid: true }), { secondary: true, hd: true });
  rig.setOutfit(outfit);
  // standalone scenes have no edge pass of their own: the rig brings its black outline
  rig.setOutline(opts.outline ?? 1);
  return rig;
}
