// G-buffer contract. The main pass renders into a 2-attachment target:
//   location 0: linear HDR colour
//   location 1: gNormal = (world normal * 0.5 + 0.5, flags)
// flags = outline(0..1) + 2*selected + 4*hover + 8*enemyHover + 32*emitter  (LIMBOPHOBIA's worldMaterial
// writes the same location-1 output with outline in the low bits, so its rigs and props join in unchanged).
// Every material drawn into the main target must write gNormal: transparent ones write vec4(0), which leaves
// the buffer untouched under alpha / additive blending (blend factor = that attachment's own src alpha).
import * as THREE from 'three';

export const GN_DECL = 'layout(location = 1) out highp vec4 gNormal;\n';
export const F_SEL = 2, F_HOVER = 4, F_ENEMY = 8, F_EMIT = 32;

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
  mat.customProgramCacheKey = () => 'gb|' + prevKey;
  return mat;
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
