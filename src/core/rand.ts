// Seeded randomness: a fast PRNG with game helpers, and stateless hashes.

/** mulberry32 */
export class Rand {
  private s: number;
  constructor(seed: number) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(a: readonly T[]): T { return a[Math.floor(this.next() * a.length)]; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  gauss() { let u = 0, v = 0; while (u === 0) u = this.next(); while (v === 0) v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  /** weighted pick: [[item, weight], ...] */
  weighted<T>(a: readonly (readonly [T, number])[]): T {
    let t = 0; for (const [, w] of a) t += w;
    let r = this.next() * t;
    for (const [v, w] of a) { r -= w; if (r <= 0) return v; }
    return a[a.length - 1][0];
  }
  shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  fork(salt: number) { return new Rand(hashi(Math.floor(this.next() * 4294967296), salt)); }
}

/** integer hash of up to 3 ints -> uint32 */
export function hashi(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/** hash -> [0,1) */
export const hash01 = (a: number, b = 0, c = 0) => hashi(a, b, c) / 4294967296;
export function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
export const TAU = Math.PI * 2;
export function wrapA(a: number) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
export function dampA(a: number, b: number, k: number, dt: number) { return a + wrapA(b - a) * (1 - Math.exp(-k * dt)); }
