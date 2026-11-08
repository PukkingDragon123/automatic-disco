// Seeded simplex noise (2D/3D) with fbm / ridged helpers.
import { Rand } from './rand';

const G3 = new Float32Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6, F3 = 1 / 3, G3c = 1 / 6;

export class Noise {
  private p = new Uint8Array(512);
  private pm = new Uint8Array(512);
  constructor(seed: number) {
    const r = new Rand(seed), t = new Uint8Array(256);
    for (let i = 0; i < 256; i++) t[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); const k = t[i]; t[i] = t[j]; t[j] = k; }
    for (let i = 0; i < 512; i++) { this.p[i] = t[i & 255]; this.pm[i] = this.p[i] % 12; }
  }
  /** 2D simplex, ~[-1,1] */
  n2(xin: number, yin: number): number {
    const p = this.p, pm = this.pm;
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0, tt = 0.5 - x0 * x0 - y0 * y0;
    if (tt > 0) { const g = pm[ii + p[jj]] * 3; tt *= tt; n += tt * tt * (G3[g] * x0 + G3[g + 1] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1;
    if (tt > 0) { const g = pm[ii + i1 + p[jj + j1]] * 3; tt *= tt; n += tt * tt * (G3[g] * x1 + G3[g + 1] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2;
    if (tt > 0) { const g = pm[ii + 1 + p[jj + 1]] * 3; tt *= tt; n += tt * tt * (G3[g] * x2 + G3[g + 1] * y2); }
    return 70 * n;
  }
  /** 3D simplex, ~[-1,1] */
  n3(x: number, y: number, z: number): number {
    const p = this.p, pm = this.pm;
    const s = (x + y + z) * F3, i = Math.floor(x + s), j = Math.floor(y + s), k = Math.floor(z + s);
    const t = (i + j + k) * G3c, x0 = x - (i - t), y0 = y - (j - t), z0 = z - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; } else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; } else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; } else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; } else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3c, y1 = y0 - j1 + G3c, z1 = z0 - k1 + G3c;
    const x2 = x0 - i2 + 2 * G3c, y2 = y0 - j2 + 2 * G3c, z2 = z0 - k2 + 2 * G3c;
    const x3 = x0 - 1 + 0.5, y3 = y0 - 1 + 0.5, z3 = z0 - 1 + 0.5;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0, tt: number, g: number;
    tt = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (tt > 0) { g = pm[ii + p[jj + p[kk]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x0 + G3[g + 1] * y0 + G3[g + 2] * z0); }
    tt = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (tt > 0) { g = pm[ii + i1 + p[jj + j1 + p[kk + k1]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x1 + G3[g + 1] * y1 + G3[g + 2] * z1); }
    tt = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (tt > 0) { g = pm[ii + i2 + p[jj + j2 + p[kk + k2]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x2 + G3[g + 1] * y2 + G3[g + 2] * z2); }
    tt = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (tt > 0) { g = pm[ii + 1 + p[jj + 1 + p[kk + 1]]] * 3; tt *= tt; n += tt * tt * (G3[g] * x3 + G3[g + 1] * y3 + G3[g + 2] * z3); }
    return 32 * n;
  }
  fbm2(x: number, y: number, oct = 4, lac = 2, gain = 0.5): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += a * this.n2(x * f + o * 17.3, y * f - o * 9.1); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  fbm3(x: number, y: number, z: number, oct = 4): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += a * this.n3(x * f, y * f, z * f + o * 31.7); n += a; a *= 0.5; f *= 2; }
    return s / n;
  }
  /** ridged multifractal in [0,1] */
  ridge2(x: number, y: number, oct = 4): number {
    let a = 0.5, f = 1, s = 0, w = 1;
    for (let o = 0; o < oct; o++) { let v = 1 - Math.abs(this.n2(x * f + o * 7.7, y * f)); v *= v * w; w = Math.min(1, v * 2); s += v * a; a *= 0.5; f *= 2.03; }
    return Math.min(1, s * 1.1);
  }
}
