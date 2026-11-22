// UI KIT · DITHER HELPERS (Limbophobia's method; surfaces themselves come from the MATERIAL LIBRARY, see libmat.ts).
//   vnoise / fbm              smooth value noise
//   clusterT(x, y, seed)      the clustered dither threshold (0..1): smooth ~3 px noise + a 2 x 2 jitter, never a checker
//   qstep(t, x, y, n, seed)   quantise a continuous ramp position with it
//   makeRamp                  the library's hue-shifted ramp (re-exported)
import { hash } from './px';
export { makeRamp } from '../../gfx/mat';
export function vnoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, seed: number, oct = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 101); n += a; a *= 0.5; f *= 2.03; } return s / n; }
export function clusterT(x: number, y: number, seed = 0) {
  return Math.min(0.98, Math.max(0.02, 0.5 + (vnoise(x / 3, y / 3, seed + 911) - 0.5) * 1.7 + (hash(x >> 1, y >> 1, seed + 5) - 0.5) * 0.22));
}
export const qstep = (t: number, x: number, y: number, n: number, seed = 0) => { const i = Math.floor(t), f = t - i; return Math.max(0, Math.min(n - 1, f > clusterT(x, y, seed) ? i + 1 : i)); };
