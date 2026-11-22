// EMPIRE · the planet's geometry (pure, no DOM): the regions are points on a unit sphere (world/planet.ts); a region
// is everything nearer its point than any other, with the borders warped by noise so they wander like real
// frontiers. The planet map is an equirectangular projection of that (longitude across, latitude down).
//   regionAt(planet, dir) -> [nearest, second, gap]      neighbours(planet) -> adjacency lists (shared borders)
//   km(planet, a, b) great-circle distance              holder(region) -> the bloc whose base holds it (factions/plan.ts)
import type { Planet, PRegion } from '../world/planet';
import { Noise } from '../core/noise';
import { planFactions } from '../game/factions/plan';
import { PLANET_KM, type BlocId } from './types';

export type V3 = [number, number, number];
const noises = new Map<number, Noise>();
const noiseOf = (seed: number) => { let n = noises.get(seed); if (!n) { n = new Noise(seed ^ 0x51ed); noises.set(seed, n); } return n; };

/** a direction from longitude (-PI..PI) and latitude (-PI/2..PI/2) */
export function dirOf(lon: number, lat: number, out: V3 = [0, 0, 0]): V3 { const c = Math.cos(lat); out[0] = Math.cos(lon) * c; out[1] = Math.sin(lat); out[2] = Math.sin(lon) * c; return out; }
export function lonLat(d: readonly number[]): [number, number] { return [Math.atan2(d[2], d[0]), Math.asin(Math.max(-1, Math.min(1, d[1])))]; }
/** the noise-warped direction the borders are cut on */
export function warp(seed: number, d: readonly number[], out: V3 = [0, 0, 0]): V3 {
  const n = noiseOf(seed), k = 1.7, a = 0.16;
  const wx = n.n3(d[0] * k, d[1] * k, d[2] * k) + n.n3(d[0] * k * 2.3 + 9, d[1] * k * 2.3, d[2] * k * 2.3) * 0.4;
  const wy = n.n3(d[0] * k + 31, d[1] * k + 7, d[2] * k) + n.n3(d[0] * k * 2.3 + 40, d[1] * k * 2.3, d[2] * k * 2.3 + 3) * 0.4;
  const wz = n.n3(d[0] * k + 13, d[1] * k, d[2] * k + 57) + n.n3(d[0] * k * 2.3, d[1] * k * 2.3 + 77, d[2] * k * 2.3) * 0.4;
  out[0] = d[0] + wx * a; out[1] = d[1] + wy * a; out[2] = d[2] + wz * a;
  const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l;
  return out;
}
const _w: V3 = [0, 0, 0];
/** the region a direction falls in, the runner-up, and how close the border is (dot gap, 0 = on it) */
export function regionAt(p: Planet, d: readonly number[]): [number, number, number] {
  const w = warp(p.seed, d, _w);
  let b = -1, bd = -2, s = -1, sd = -2;
  for (let i = 0; i < p.regions.length; i++) {
    const c = p.regions[i].c, dot = c[0] * w[0] + c[1] * w[1] + c[2] * w[2];
    if (dot > bd) { s = b; sd = bd; b = i; bd = dot; } else if (dot > sd) { s = i; sd = dot; }
  }
  return [b, s, bd - sd];
}
/** a relief height on the sphere, -1..1 (continents, ridges) */
export function relief(seed: number, d: readonly number[]): number {
  const n = noiseOf(seed + 3);
  let v = 0, amp = 1, f = 1.6, sum = 0;
  for (let o = 0; o < 5; o++) { v += n.n3(d[0] * f + o * 7.1, d[1] * f, d[2] * f - o * 3.3) * amp; sum += amp; amp *= 0.5; f *= 2.05; }
  return v / sum;
}

const adjCache = new Map<number, number[][]>();
/** which regions share a border (sampled over the sphere with the same warp the map is painted with) */
export function neighbours(p: Planet): number[][] {
  const hit = adjCache.get(p.seed); if (hit) return hit;
  const n = p.regions.length, m = Array.from({ length: n }, () => new Set<number>());
  const d: V3 = [0, 0, 0];
  for (let j = 0; j < 48; j++) for (let i = 0; i < 96; i++) {
    dirOf((i / 96) * Math.PI * 2 - Math.PI, (0.5 - (j + 0.5) / 48) * Math.PI, d);
    const [a, b, gap] = regionAt(p, d);
    if (gap < 0.045 && a >= 0 && b >= 0) { m[a].add(b); m[b].add(a); }
  }
  // every region reaches at least its two nearest (a tiny region can slip between the samples)
  for (let a = 0; a < n; a++) {
    const near = p.regions.map((r, i) => [i, dot3(p.regions[a].c, r.c)] as [number, number]).filter(([i]) => i !== a).sort((x, y) => y[1] - x[1]);
    for (const [i] of near.slice(0, 2)) { m[a].add(i); m[i].add(a); }
  }
  const out = m.map((s) => [...s].sort((x, y) => x - y));
  adjCache.set(p.seed, out);
  return out;
}
export const dot3 = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** great-circle km between two regions' centres */
export function km(p: Planet, a: number, b: number): number {
  const A = p.regions[a]?.c, B = p.regions[b]?.c; if (!A || !B) return 0;
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot3(A, B)))) * PLANET_KM);
}
/** points along the great circle from a to b (k = 0..1) */
export function slerp(a: readonly number[], b: readonly number[], k: number, out: V3 = [0, 0, 0]): V3 {
  const d = Math.max(-1, Math.min(1, dot3(a, b))), om = Math.acos(d);
  if (om < 1e-5) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return out; }
  const s = Math.sin(om), wa = Math.sin((1 - k) * om) / s, wb = Math.sin(k * om) / s;
  out[0] = a[0] * wa + b[0] * wb; out[1] = a[1] * wa + b[1] * wb; out[2] = a[2] * wa + b[2] * wb;
  return out;
}
/** the rival bloc whose base holds a region (the first programme of its plan), and every bloc present */
export function holders(r: PRegion): BlocId[] {
  const out: BlocId[] = [];
  for (const s of planFactions(r.seed, r.danger)) if (s.faction !== 'expedition' && !out.includes(s.faction)) out.push(s.faction);
  return out;
}
export const isSea = (r: PRegion) => r.biome === 'ocean' || r.biome === 'reef' || r.biome === 'archipelago';
