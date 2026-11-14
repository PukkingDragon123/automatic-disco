// The sea's swell: a small set of Gerstner waves shared by the GPU (the sea surface in world/water.ts) and the CPU
// (anything that floats or bobs: the drop pod, pontoons, the golem hovering over the waves, leaping fish). Directions
// and wavelengths are fixed per region (a prevailing swell from the region's seed, so phases never jump); only the
// heights and the steepness follow the weather (wind and storm from game.climate, see ocean.ts). Waves shoal in shallow
// water: the long swell loses height over the shelves and the surf is drawn as breakers instead (water.ts).
import * as THREE from 'three';
import { Rand } from '../core/rand';

export const WAVE_N = 8;

/** the sea state: directions, wave numbers, angular speeds, phases (fixed); amplitudes and steepness (weather) */
export class Swell {
  readonly dir: Float32Array = new Float32Array(WAVE_N * 2);
  readonly k = new Float32Array(WAVE_N);
  readonly w = new Float32Array(WAVE_N);
  readonly ph = new Float32Array(WAVE_N);
  /** base relative amplitude of each wave (sums to ~1), scaled by `height` */
  readonly rel = new Float32Array(WAVE_N);
  /** significant height of the swell in metres (crest to mean ~ height / 2) */
  height = 0.35;
  /** 0 smooth rollers .. 1 sharp, peaked storm crests */
  steep = 0.45;
  /** the prevailing direction the waves travel (unit, xz) */
  readonly main = new THREE.Vector2(1, 0);
  /** GLSL uniforms: uWv[i] = (dir.x, dir.z, k, amp), uWq[i] = (omega, phase, Q, shoalLen) */
  readonly U = {
    uWv: { value: Array.from({ length: WAVE_N }, () => new THREE.Vector4()) },
    uWq: { value: Array.from({ length: WAVE_N }, () => new THREE.Vector4()) },
    uSwellH: { value: 0.35 },
  };

  constructor(seed: number) {
    const r = new Rand(seed ^ 0x5e11);
    const a0 = r.range(0, Math.PI * 2);
    this.main.set(Math.cos(a0), Math.sin(a0));
    // wavelengths from a long swell down to a short chop, spread around the main direction
    const lam = [34, 23, 15.5, 10.5, 7.2, 4.9, 3.4, 2.3];
    let sum = 0;
    for (let i = 0; i < WAVE_N; i++) {
      const L = lam[i] * r.range(0.9, 1.12), a = a0 + (i === 0 ? 0 : r.range(-0.85, 0.85) * (0.35 + i * 0.09));
      this.dir[i * 2] = Math.cos(a); this.dir[i * 2 + 1] = Math.sin(a);
      this.k[i] = (Math.PI * 2) / L;
      // deep-water dispersion: omega^2 = g k
      this.w[i] = Math.sqrt(9.81 * this.k[i]);
      this.ph[i] = r.range(0, Math.PI * 2);
      this.rel[i] = Math.pow(L / lam[0], 0.75);
      sum += this.rel[i];
    }
    for (let i = 0; i < WAVE_N; i++) this.rel[i] /= sum;
    this.sync();
  }
  /** amplitude of wave i (m) */
  amp(i: number) { return this.rel[i] * this.height * 0.5; }
  /** write the uniforms (after height or steep changed) */
  sync() {
    const U = this.U;
    for (let i = 0; i < WAVE_N; i++) {
      const A = this.amp(i), k = this.k[i];
      // Gerstner steepness, shared out so the crests never loop over (sum Q k A < 1)
      const Q = A > 1e-5 ? Math.min(1 / (k * A * WAVE_N), (0.25 + this.steep * 0.75) / (k * A * WAVE_N)) : 0;
      U.uWv.value[i].set(this.dir[i * 2], this.dir[i * 2 + 1], k, A);
      U.uWq.value[i].set(this.w[i], this.ph[i], Q, (Math.PI * 2) / k);
    }
    U.uSwellH.value = this.height;
  }
  /** how much of the swell survives over water `depth` deep, for a wave of length L (m) */
  static shoal(depth: number, L: number) { const t = Math.min(1, Math.max(0, depth / (L * 0.22))); return 0.12 + 0.88 * t * t * (3 - 2 * t); }
  /** surface height above the mean water line at a rest point (x, z) at time t, over water `depth` deep */
  height$(x: number, z: number, t: number, depth = 99) {
    let y = 0;
    for (let i = 0; i < WAVE_N; i++) {
      const A = this.amp(i); if (A < 1e-5) continue;
      const th = this.k[i] * (this.dir[i * 2] * x + this.dir[i * 2 + 1] * z) - this.w[i] * t + this.ph[i];
      y += A * Math.sin(th) * Swell.shoal(depth, (Math.PI * 2) / this.k[i]);
    }
    return y;
  }
  /** the surface normal's tilt at (x, z): returns [dy/dx, dy/dz] (for rolling floating things) */
  slope(x: number, z: number, t: number, depth = 99): [number, number] {
    let sx = 0, sz = 0;
    for (let i = 0; i < WAVE_N; i++) {
      const A = this.amp(i); if (A < 1e-5) continue;
      const dx = this.dir[i * 2], dz = this.dir[i * 2 + 1], k = this.k[i];
      const th = k * (dx * x + dz * z) - this.w[i] * t + this.ph[i], c = A * k * Math.cos(th) * Swell.shoal(depth, (Math.PI * 2) / k);
      sx += dx * c; sz += dz * c;
    }
    return [sx, sz];
  }
}

/**
 * GLSL: the Gerstner sum at a rest point p (world xz) over water `depth` deep. Returns the displacement (xyz) and
 * fills the surface normal and a crest measure (the folding of the surface: near 1 where a crest sharpens into foam).
 * Needs uWv[], uWq[] (Swell.U).
 */
export const GERSTNER_GLSL = /* glsl */`
uniform vec4 uWv[${WAVE_N}];
uniform vec4 uWq[${WAVE_N}];
uniform float uSwellH;
float shoalK(float depth, float L) { float t = clamp(depth / (L * 0.22), 0.0, 1.0); return 0.12 + 0.88 * t * t * (3.0 - 2.0 * t); }
vec3 gerstner(vec2 p, float t, float depth, out vec3 N, out float crest) {
  vec3 d = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0); crest = 0.0;
  for (int i = 0; i < ${WAVE_N}; i++) {
    vec4 a = uWv[i], b = uWq[i];
    float A = a.w * shoalK(depth, b.w);
    if (A < 1e-5) continue;
    float th = a.z * dot(a.xy, p) - b.x * t + b.y, s = sin(th), c = cos(th);
    float Q = b.z;
    d.xz += Q * A * a.xy * c;
    d.y += A * s;
    float kA = a.z * A;
    n.xz -= a.xy * kA * c;
    n.y -= Q * kA * s;
    crest += Q * kA * s;
  }
  N = normalize(n);
  return d;
}
`;
