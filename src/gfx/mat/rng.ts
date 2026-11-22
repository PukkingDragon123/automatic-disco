// Deterministic random numbers, hashing and noise. Everything procedural in the
// simulation (zones, textures, loot) is derived from seeds so that every client
// in a co-op session generates the exact same world.

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Integer hash of up to 3 ints -> uint32 */
export function hash3(x: number, y: number, z = 0): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (z | 0) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return h >>> 0;
}

/** Hash to float in [0,1) */
export function hashf(x: number, y: number, z = 0): number {
  return hash3(x, y, z) / 4294967296;
}

export class Rng {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: number | string = 1) {
    const s = typeof seed === 'string' ? hashStr(seed) : (seed >>> 0);
    this.a = s ^ 0xdeadbeef; this.b = s * 31 + 0x9e3779b9; this.c = s ^ 0x85ebca6b; this.d = s + 0xc2b2ae35;
    for (let i = 0; i < 12; i++) this.next();
  }
  /** sfc32 */
  next(): number {
    let { a, b, c, d } = this;
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return (t >>> 0) / 4294967296;
  }
  float(min = 0, max = 1): number { return min + (max - min) * this.next(); }
  int(min: number, max: number): number { return Math.floor(min + (max - min + 1) * this.next()); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  weighted<T>(items: readonly [T, number][]): T {
    let total = 0; for (const [, w] of items) total += w;
    let r = this.next() * total;
    for (const [v, w] of items) { r -= w; if (r <= 0) return v; }
    return items[items.length - 1][0];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  gauss(mean = 0, sd = 1): number {
    const u = 1 - this.next(), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  fork(salt: string | number): Rng { return new Rng(hash3(Math.floor(this.next() * 1e9), typeof salt === 'string' ? hashStr(salt) : salt)); }
}

// ---------- value / fbm noise (seeded) ----------
function fade(t: number) { return t * t * (3 - 2 * t); }

export function valueNoise2(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hashf(xi, yi, seed), b = hashf(xi + 1, yi, seed);
  const c = hashf(xi, yi + 1, seed), d = hashf(xi + 1, yi + 1, seed);
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Tileable value noise with integer period px,py */
export function tileNoise2(x: number, y: number, px: number, py: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const m = (v: number, p: number) => ((v % p) + p) % p;
  const x0 = m(xi, px), x1 = m(xi + 1, px), y0 = m(yi, py), y1 = m(yi + 1, py);
  const a = hashf(x0, y0, seed), b = hashf(x1, y0, seed);
  const c = hashf(x0, y1, seed), d = hashf(x1, y1, seed);
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x: number, y: number, octaves = 4, seed = 0): number {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * f, y * f, seed + i * 101);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

/** fbm that tiles over a w x h texture where base period is cells */
export function tileFbm(x: number, y: number, w: number, h: number, cells: number, octaves = 4, seed = 0): number {
  let amp = 0.5, sum = 0, norm = 0, c = cells;
  for (let i = 0; i < octaves; i++) {
    sum += amp * tileNoise2((x / w) * c, (y / h) * c, c, c, seed + i * 131);
    norm += amp; amp *= 0.5; c *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------------- unique ids
// Zone generation draws ids from a deterministic per-zone range, so every
// co-op peer and every reload builds identical ids no matter which order
// zones were generated in. Runtime ids are partitioned by peer slot so two
// players can never mint the same id.
const RUNTIME_BASE = 2 ** 40;
const SLOTS = 64;
let slot = 0;
let counter = 0;
const genStack: { next: number }[] = [];

export function uid(): number {
  const g = genStack[genStack.length - 1];
  if (g) return g.next++;
  return RUNTIME_BASE + (counter++) * SLOTS + slot;
}
/** this peer's slot (0 = host/solo, 1.. = clients) */
export function setUidSlot(s: number) { slot = ((s % SLOTS) + SLOTS) % SLOTS; }
/** called with (seen uid + 1) when items/objects arrive: keep this peer's counter ahead of its own ids */
export function setUidBase(n: number) {
  const u = n - 1;
  if (u < RUNTIME_BASE) return;
  const k = u - RUNTIME_BASE;
  if (k % SLOTS !== slot) return;
  counter = Math.max(counter, Math.floor(k / SLOTS) + 1);
}
/** begin a deterministic id range (zone generation, shifting regions); nests */
export function beginGenUids(base: number) { genStack.push({ next: base }); }
export function endGenUids() { genStack.pop(); }
export const ZONE_UID_SPAN = 2 ** 24;
export const SHIFT_UID_BASE = 2 ** 36;
export function peekUid() { return counter; }
/** after loading a save: never mint ids this slot already used */
export function restoreUidCounter(n: number) { counter = Math.max(counter, n); }
