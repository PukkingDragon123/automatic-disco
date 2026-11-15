// G-buffer contract. The main pass renders into a 2-attachment target:
//   location 0: linear HDR colour
//   location 1: gNormal = (world normal * 0.5 + 0.5, flags)
// flags = outline(0..1) + 2*selected + 4*hover + 8*enemyHover + 32*emitter  (LIMBOPHOBIA's worldMaterial
// writes the same location-1 output with outline in the low bits, so its rigs and props join in unchanged).
// Every material drawn into the main target must write gNormal: transparent ones write vec4(0), which leaves
// the buffer untouched under alpha / additive blending (blend factor = that attachment's own src alpha).
//
// AREA LIGHTS (interiors): `areaLit(root)` opts the built-in lit materials under root (Lambert, Phong, Standard, Toon:
// anything that went through gbuf) into soft rectangular area lights: ceiling panels and troffers shade with the exact
// polygon form factor (horizon-clipped sphere approximation; near-field soft, inverse-square far off, no hot spot)
// plus a GGX highlight from the panel's nearest point to the mirror ray, widened by the panel's size, so floors and
// glossy props show the panel's soft reflection. The lights live in AREA_U (view space), written by post.ts from
// the scene's InteriorLight (lights.ts) before each main pass; a scene without one draws with uAreaN = 0.
// Per material gloss: material.userData.gloss 0..1 (default 0.3), read when areaLit() runs.
import * as THREE from 'three';

export const GN_DECL = 'layout(location = 1) out highp vec4 gNormal;\n';
export const F_SEL = 2, F_HOVER = 4, F_ENEMY = 8, F_EMIT = 32;

/** the most area lights one frame shades with (post.ts keeps the strongest near the view) */
export const AREA_MAX = 24;
const v4s = () => Array.from({ length: AREA_MAX }, () => new THREE.Vector4());
/** shared area-light uniforms, view space: P centre xyz + range w; U, V half-extent axes (the panel emits along
 *  cross(U, V)); C radiance rgb + specular weight w; S (roughness floor, global specular gain) */
export const AREA_U = {
  uAreaN: { value: 0 }, uAreaP: { value: v4s() }, uAreaU: { value: v4s() }, uAreaV: { value: v4s() }, uAreaC: { value: v4s() },
  uAreaS: { value: new THREE.Vector2(0.06, 1) },
};
const AREA_PARS = /* glsl */`
#define AREA_MAX ${AREA_MAX}
uniform int uAreaN;
uniform vec4 uAreaP[AREA_MAX]; uniform vec4 uAreaU[AREA_MAX]; uniform vec4 uAreaV[AREA_MAX]; uniform vec4 uAreaC[AREA_MAX];
uniform vec2 uAreaS;
uniform float uAGloss;
// one edge of the polygon's vector form factor (Heitz et al.: a fitted theta / sin(theta))
vec3 gbEdge(vec3 a, vec3 b) {
  float x = dot(a, b), y = abs(x);
  float u = 0.8543985 + (0.4965155 + 0.0145206 * y) * y, w = 3.4175940 + (4.1616724 + y) * y, v = u / w;
  return cross(a, b) * (x > 0.0 ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v);
}
`;
const AREA_MAIN = /* glsl */`
{
  // soft area lights (view space): exact rectangle irradiance, plus a representative-point GGX highlight
  vec3 aP = geometryPosition, aN = normalize(normal), aV = geometryViewDir, aD = vec3(0.0), aS = vec3(0.0);
  float gl = clamp(uAGloss, 0.0, 1.0), alpha = max(mix(0.62, 0.1, gl), uAreaS.x);
  vec3 aR = reflect(-aV, aN);
  for (int i = 0; i < AREA_MAX; i++) {
    if (i >= uAreaN) break;
    vec4 pc = uAreaP[i];
    vec3 d = pc.xyz - aP;
    float r2 = dot(d, d);
    if (r2 > pc.w * pc.w) continue;
    vec3 U = uAreaU[i].xyz, V = uAreaV[i].xyz, Ln = normalize(cross(U, V));
    float side = dot(d, Ln);
    if (side > -0.005) continue;
    vec3 c0 = normalize(d - U - V), c1 = normalize(d + U - V), c2 = normalize(d + U + V), c3 = normalize(d - U + V);
    vec3 F = -(gbEdge(c0, c1) + gbEdge(c1, c2) + gbEdge(c2, c3) + gbEdge(c3, c0)) * 0.15915494;
    float l = length(F), ff = max((l * l + dot(F, aN)) / (l + 1.0), 0.0);
    float fall = 1.0 - smoothstep(0.55, 1.0, sqrt(r2) / pc.w);
    vec3 Lc = uAreaC[i].rgb * fall;
    aD += Lc * ff;
    // the panel point nearest the mirror ray, a GGX lobe widened by the panel's size (energy kept by the solid angle)
    float dn = dot(aR, Ln);
    float t = dn < -1e-3 ? side / dn : sqrt(r2);
    vec3 q = aP + aR * t - pc.xyz;
    float uu = clamp(dot(q, U) / dot(U, U), -1.0, 1.0), vv = clamp(dot(q, V) / dot(V, V), -1.0, 1.0);
    vec3 Lp = pc.xyz + U * uu + V * vv - aP;
    float dl = max(length(Lp), 1e-3);
    vec3 L = Lp / dl, H = normalize(L + aV);
    float NoL = max(dot(aN, L), 0.0), NoH = max(dot(aN, H), 0.0), LoH = max(dot(L, H), 0.08);
    float A = 4.0 * length(U) * length(V);
    float a1 = min(1.0, alpha + sqrt(A) * 0.3 / dl), a2 = a1 * a1;
    float dd = NoH * NoH * (a2 - 1.0) + 1.0;
    float Dg = a2 / (3.14159265 * dd * dd);
    float omega = A * max(-dot(L, Ln), 0.0) / (dl * dl + A * 0.25);
    float Fr = mix(0.035, 0.07, gl) + (1.0 - mix(0.035, 0.07, gl)) * pow(1.0 - LoH, 5.0);
    aS += Lc * (Dg * omega * NoL * Fr * 0.25 / (LoH * LoH)) * uAreaC[i].w;
  }
  // (spec goes in with the diffuse: Lambert's output has no specular term)
  reflectedLight.directDiffuse += aD * material.diffuseColor + aS * uAreaS.y * mix(0.6, 1.6, gl);
}
`;

export interface GFlag { value: number }

/**
 * Make a built-in (or onBeforeCompile-patched) material write gNormal. The flag uniform object can be shared or
 * mutated per frame (per-creature selection etc.). Idempotent.
 */
export function gbuf<T extends THREE.Material>(mat: T, flag: GFlag | number = 1): T {
  const m = mat as any;
  if (m.__gb) { if (typeof flag !== 'number') m.__gbFlag = flag; else m.__gbFlag.value = flag; return mat; }
  m.__gb = true;
  m.__gbFlag = typeof flag === 'number' ? { value: flag } : flag;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey();
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    if (m.__area && sh.fragmentShader.includes('#include <lights_fragment_end>') && !sh.fragmentShader.includes('gbEdge')) {
      Object.assign(sh.uniforms, AREA_U, { uAGloss: m.__aGloss });
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', AREA_PARS + 'void main() {')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + AREA_MAIN);
    }
    if (sh.fragmentShader.includes('gNormal')) return;
    sh.uniforms.uGFlag = m.__gbFlag;
    const lit = sh.fragmentShader.includes('#include <normal_fragment_begin>');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', GN_DECL + 'uniform float uGFlag;\nvoid main() {');
    const i = sh.fragmentShader.lastIndexOf('}');
    const w = lit
      ? '\n  gNormal = vec4(inverseTransformDirection(normalize(normal), viewMatrix) * 0.5 + 0.5, uGFlag);\n'
      : '\n  gNormal = vec4(0.5, 1.0, 0.5, uGFlag);\n';
    sh.fragmentShader = sh.fragmentShader.slice(0, i) + w + sh.fragmentShader.slice(i);
  };
  mat.customProgramCacheKey = () => (m.__area ? 'gbA|' : 'gb|') + prevKey;
  return mat;
}

/**
 * Opt materials into the soft area lights (see the header). Takes a root (every built-in lit material under it that
 * went through gbuf) or one material. Gloss 0..1 per material: material.userData.gloss, else `gloss`. Idempotent;
 * `on = false` takes them out again.
 */
export function areaLit(target: THREE.Object3D | THREE.Material, gloss = 0.3, on = true) {
  const one = (mat: THREE.Material) => {
    const m = mat as any;
    if (!m.__gb || m.isShaderMaterial || m.isMeshBasicMaterial) return;
    const g = typeof mat.userData?.gloss === 'number' ? mat.userData.gloss : gloss;
    if (!m.__aGloss) m.__aGloss = { value: g }; else m.__aGloss.value = g;
    if (!!m.__area === on) return;
    m.__area = on; mat.needsUpdate = true;
  };
  if ((target as THREE.Material).isMaterial) { one(target as THREE.Material); return; }
  (target as THREE.Object3D).traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (mats) for (const m of Array.isArray(mats) ? mats : [mats]) one(m);
  });
}

/** for transparent built-ins: write nothing into the normal buffer */
export const gbufNone = <T extends THREE.Material>(m: T): T => gbuf(m, 0);

/** Safety net: every material under obj writes gNormal (LIMBOPHOBIA's world materials already do). */
export function ensureGBuffer(obj: THREE.Object3D, flag = 1) {
  obj.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if ((m as any).__gb || (m as any).isShaderMaterial) continue;
      const key = m.customProgramCacheKey();
      if (typeof key === 'string' && key.startsWith('noclip:')) { (m as any).__gb = true; continue; }
      gbuf(m, m.transparent ? 0 : flag);
    }
  });
}
