// The coast as a field: signed distance to the shoreline (metres, + over water, - inland) and the direction toward
// it, sampled every half metre over the map. The sea shader draws its breakers along the field's contours (so the surf
// wraps round every headland, islet and sea stack), sand ripples run along it, the swash climbs the beaches by it, and
// fish keep off the shallows with it. Rebuilt when the ground changes (craters, earthshaping, dams).
import * as THREE from 'three';
import type { Region } from '../world/region';

/** samples per metre */
export const SHORE_RES = 2;
const LO = -8, HI = 32;

export class ShoreField {
  readonly M: number;
  /** signed distance (m): + water side, - land side */
  readonly sd: Float32Array;
  readonly tex: THREE.DataTexture;
  private data: Uint8Array;
  constructor(readonly R: Region) {
    this.M = R.N * SHORE_RES;
    this.sd = new Float32Array(this.M * this.M);
    this.data = new Uint8Array(this.M * this.M * 4);
    this.tex = new THREE.DataTexture(this.data, this.M, this.M, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.build();
  }
  /** is the point dry land (or a rock standing out of the sea)? */
  private dry(x: number, z: number) { const R = this.R; return R.groundSmooth(x, z) >= R.water - 0.02 || R.isSolid(x, z); }
  build() {
    const M = this.M, s = 1 / SHORE_RES, land = new Uint8Array(M * M), sd = this.sd;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) land[j * M + i] = this.dry((i + 0.5) * s, (j + 0.5) * s) ? 1 : 0;
    // two chamfer distances: water to the nearest land, land to the nearest water
    const dW = new Float32Array(M * M), dL = new Float32Array(M * M);
    for (let k = 0; k < M * M; k++) { dW[k] = land[k] ? 0 : 1e6; dL[k] = land[k] ? 1e6 : 0; }
    const D = 1.0, E = 1.4142;
    for (const d of [dW, dL]) {
      for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
        const k = j * M + i; let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + D);
        if (j > 0) { v = Math.min(v, d[k - M] + D); if (i > 0) v = Math.min(v, d[k - M - 1] + E); if (i < M - 1) v = Math.min(v, d[k - M + 1] + E); }
        d[k] = v;
      }
      for (let j = M - 1; j >= 0; j--) for (let i = M - 1; i >= 0; i--) {
        const k = j * M + i; let v = d[k];
        if (i < M - 1) v = Math.min(v, d[k + 1] + D);
        if (j < M - 1) { v = Math.min(v, d[k + M] + D); if (i < M - 1) v = Math.min(v, d[k + M + 1] + E); if (i > 0) v = Math.min(v, d[k + M - 1] + E); }
        d[k] = v;
      }
    }
    for (let k = 0; k < M * M; k++) sd[k] = (land[k] ? -dL[k] + 0.5 : dW[k] - 0.5) * s;
    // pack: R distance, GB the way to the shore (down the field), A = 1
    const dat = this.data;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const k = j * M + i;
      const gx = sd[j * M + Math.min(M - 1, i + 1)] - sd[j * M + Math.max(0, i - 1)], gz = sd[Math.min(M - 1, j + 1) * M + i] - sd[Math.max(0, j - 1) * M + i];
      const gl = Math.hypot(gx, gz) || 1;
      dat[k * 4] = Math.round(Math.min(1, Math.max(0, (sd[k] - LO) / (HI - LO))) * 255);
      dat[k * 4 + 1] = Math.round((-gx / gl * 0.5 + 0.5) * 255);
      dat[k * 4 + 2] = Math.round((-gz / gl * 0.5 + 0.5) * 255);
      dat[k * 4 + 3] = 255;
    }
    this.tex.needsUpdate = true;
  }
  /** signed distance to the shore at a world point (m; far out past the map reads as open water) */
  at(x: number, z: number) {
    const M = this.M, i = Math.floor(x * SHORE_RES), j = Math.floor(z * SHORE_RES);
    if (i < 0 || j < 0 || i >= M || j >= M) return HI;
    return this.sd[j * M + i];
  }
  /** the way toward the shore at a point (unit xz), from the field's slope */
  toShore(x: number, z: number): [number, number] {
    const a = this.at(x + 0.5, z) - this.at(x - 0.5, z), b = this.at(x, z + 0.5) - this.at(x, z - 0.5), l = Math.hypot(a, b) || 1;
    return [-a / l, -b / l];
  }
}
/** GLSL decode of the packed field: x = signed distance (m), yz = direction to the shore */
export const SHORE_GLSL = /* glsl */`
uniform sampler2D uShore;
vec3 shoreAt(vec2 p) { vec4 s = texture2D(uShore, p / uN); return vec3(s.r * ${(HI - LO).toFixed(1)} + ${LO.toFixed(1)}, s.gb * 2.0 - 1.0); }
`;
