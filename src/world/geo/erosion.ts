// Erosion on a region heightfield (metres, 1 m cells). Hydraulic: rain droplets run downhill with inertia, pick up
// sediment where they speed up and drop it where they slow, so slopes grow gullies and ridges, valley floors fill
// with alluvium and fans spread where the mountains meet the plain. Thermal: anything steeper than its angle of
// repose slumps to its downhill neighbour, so frost-shattered crests shed scree aprons and the gullies stay sharp.
// Both read a per-cell erodibility (0 hard rock .. 1 soft soil) so the bedrock of the ranges keeps its walls.
import { Rand } from '../../core/rand';

export interface HydroOpts {
  drops: number;
  /** steps a droplet lives */
  life?: number;
  inertia?: number;
  /** sediment capacity per (drop of height * speed * water) */
  capacity?: number;
  erode?: number;
  deposit?: number;
  evaporate?: number;
  gravity?: number;
  /** largest change at one step (m): keeps a drop from gouging a pit */
  maxStep?: number;
  /** brush radius in cells */
  radius?: number;
  /** where drops fall: weights per cell (drops start there more often); default uniform */
  rain?: Float32Array;
  /** erodibility per cell 0..1 (default 1) */
  soft?: Float32Array;
  /** cells never touched (the landing pad, the sea floor of ocean maps...) */
  lock?: Uint8Array;
}

/**
 * Droplet erosion (after Beyer 2015): each drop samples the bilinear height and gradient at its position, turns
 * toward the downhill direction with some inertia, and either erodes (through a soft radial brush, never more than
 * the drop it just made) or deposits (bilinearly where it stands). Returns the total eroded volume (m^3).
 */
export function hydraulic(h: Float32Array, N: number, r: Rand, o: HydroOpts): number {
  const life = o.life ?? 40, inertia = o.inertia ?? 0.08, capK = o.capacity ?? 3, eroK = o.erode ?? 0.25, depK = o.deposit ?? 0.3;
  const evap = o.evaporate ?? 0.025, grav = o.gravity ?? 4, maxStep = o.maxStep ?? 0.14, rad = o.radius ?? 2;
  const soft = o.soft, lock = o.lock;
  // the brush: cells within the radius, weights falling off linearly, normalised
  const bx: number[] = [], bz: number[] = [], bw: number[] = [];
  let bs = 0;
  for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
    const d = Math.sqrt(dx * dx + dz * dz); if (d > rad) continue;
    bx.push(dx); bz.push(dz); bw.push(1 - d / (rad + 0.5)); bs += 1 - d / (rad + 0.5);
  }
  for (let k = 0; k < bw.length; k++) bw[k] /= bs;
  const BN = bw.length;
  // the rain: a cumulative table over the weight map, sampled by bisection
  let cdf: Float32Array | null = null;
  if (o.rain) {
    cdf = new Float32Array(N * N); let s = 0;
    for (let i = 0; i < N * N; i++) { s += Math.max(0, o.rain[i]); cdf[i] = s; }
    if (s <= 0) cdf = null; else for (let i = 0; i < N * N; i++) cdf[i] /= s;
  }
  const pick = () => {
    if (!cdf) return [r.range(1, N - 2), r.range(1, N - 2)];
    const u = r.next(); let lo = 0, hi = N * N - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; }
    return [(lo % N) + r.next(), ((lo / N) | 0) + r.next()];
  };
  let total = 0;
  for (let d = 0; d < o.drops; d++) {
    let [px, pz] = pick();
    let dx = 0, dz = 0, speed = 1, water = 1, sed = 0;
    for (let s = 0; s < life; s++) {
      const ix = Math.floor(px), iz = Math.floor(pz);
      if (ix < 0 || iz < 0 || ix >= N - 1 || iz >= N - 1) break;
      const u = px - ix, v = pz - iz, i = iz * N + ix;
      const a = h[i], b = h[i + 1], c = h[i + N], e = h[i + N + 1];
      const gx = (b - a) * (1 - v) + (e - c) * v, gz = (c - a) * (1 - u) + (e - b) * u;
      const h0 = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + e * u * v;
      dx = dx * inertia - gx * (1 - inertia); dz = dz * inertia - gz * (1 - inertia);
      let l = Math.sqrt(dx * dx + dz * dz);
      if (l < 1e-6) { const ang = r.next() * 6.2832; dx = Math.cos(ang); dz = Math.sin(ang); l = 1; }
      dx /= l; dz /= l;
      const nx = px + dx, nz = pz + dz;
      const jx = Math.floor(nx), jz = Math.floor(nz);
      if (jx < 0 || jz < 0 || jx >= N - 1 || jz >= N - 1) break;
      const u2 = nx - jx, v2 = nz - jz, j = jz * N + jx;
      const h1 = h[j] * (1 - u2) * (1 - v2) + h[j + 1] * u2 * (1 - v2) + h[j + N] * (1 - u2) * v2 + h[j + N + 1] * u2 * v2;
      const dh = h1 - h0;
      const cap = Math.max(-dh, 0.01) * speed * water * capK;
      if (sed > cap || dh > 0) {
        // uphill or overloaded: drop sediment (to fill the pit it is in, at most)
        let amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * depK;
        amt = Math.min(amt, maxStep);
        sed -= amt;
        if (!lock || !lock[i]) {
          h[i] += amt * (1 - u) * (1 - v); h[i + 1] += amt * u * (1 - v); h[i + N] += amt * (1 - u) * v; h[i + N + 1] += amt * u * v;
        }
      } else {
        // erode through the brush, never deeper than the step just taken
        const k = soft ? soft[i] : 1;
        const amt = Math.min((cap - sed) * eroK * k, -dh, maxStep);
        if (amt > 0) {
          let got = 0;
          for (let q = 0; q < BN; q++) {
            const X = ix + bx[q], Z = iz + bz[q]; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
            const c2 = Z * N + X; if (lock && lock[c2]) continue;
            const w = amt * bw[q] * (soft ? 0.35 + 0.65 * soft[c2] : 1);
            h[c2] -= w; got += w;
          }
          sed += got; total += got;
        }
      }
      speed = Math.sqrt(Math.max(0.01, speed * speed - dh * grav));
      water *= 1 - evap;
      px = nx; pz = nz;
    }
  }
  return total;
}

/**
 * Thermal weathering: for `iters` sweeps, each cell sheds a share of what stands above its angle of repose (talus,
 * m per m, per cell from `talus` or the constant) to its lowest neighbours. Alternating sweep order keeps it from
 * drifting one way.
 */
export function thermal(h: Float32Array, N: number, iters: number, talus: number | Float32Array, k = 0.4, lock?: Uint8Array) {
  const OX = [1, -1, 0, 0, 1, -1, 1, -1], OZ = [0, 0, 1, -1, 1, 1, -1, -1], OD = [1, 1, 1, 1, 1.414, 1.414, 1.414, 1.414];
  for (let it = 0; it < iters; it++) {
    const rev = it & 1;
    for (let q = 0; q < N * N; q++) {
      const i = rev ? N * N - 1 - q : q;
      if (lock && lock[i]) continue;
      const x = i % N, z = (i / N) | 0, hi = h[i], T = typeof talus === 'number' ? talus : talus[i];
      let sum = 0, mx = 0;
      for (let n = 0; n < 8; n++) {
        const X = x + OX[n], Z = z + OZ[n]; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
        const d = hi - h[Z * N + X] - T * OD[n];
        if (d > 0) { sum += d; if (d > mx) mx = d; }
      }
      if (sum <= 0) continue;
      const move = mx * k * 0.5;
      for (let n = 0; n < 8; n++) {
        const X = x + OX[n], Z = z + OZ[n]; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
        const j = Z * N + X, d = hi - h[j] - T * OD[n];
        if (d > 0) { const m = (move * d) / sum; h[j] += m; h[i] -= m; }
      }
    }
  }
}

/** a 3x3 box blur weighted toward the centre, `passes` times, only where mask > 0 (by its weight) */
export function soften(h: Float32Array, N: number, passes: number, mask?: Float32Array) {
  const T = new Float32Array(N * N);
  for (let p = 0; p < passes; p++) {
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, w = mask ? mask[i] : 1;
      if (w <= 0) { T[i] = h[i]; continue; }
      let s = 0, c = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
        const k = dx || dz ? 1 : 2; s += h[Z * N + X] * k; c += k;
      }
      T[i] = h[i] + (s / c - h[i]) * Math.min(1, w);
    }
    h.set(T);
  }
}
