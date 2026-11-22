// HUD v7 · THE MAP PAINTER. The region painted as pixel art in the planet's OWN colours (its palette: turf, soil,
// rock, sand, water, the foliage colours the trees really have): ground by material and height, hill-shaded from the
// upper left in dithered steps with faint contours, water by depth with a pale foam line and glints, forests as lit
// round canopies with shadows, ranges as painted peaks with snow caps, cliffs hatched; the landmarks (falls, springs,
// geysers, caves, passes, vents, seams and crystals, peaks, lakes) found and named for the map; the fog of war as
// painted cloud with lit tops and dithered edges.
//   paintTerrain(region, pal, K) -> { px, marks }      K = art px per metre (2 for the big map, 0.8 for the minimap)
//   paintFog(region, seen, K, prev?) -> Px            the unexplored cloud
import type { Region } from '../../world/region';
import type { Palette } from '../../world/palette';
import { Px, P, INK, hash, bayer, mixHex } from '../kit/px';
import { markGlyph, type MarkKind } from './glyphs';

export interface Landmark { kind: MarkKind; x: number; z: number; name: string; key: string; big?: boolean }
const WARM = 0xfff0c8, COOL = 0x1a1530;
/** a 7-step ramp round a base colour: cool shadows, warm lights */
function rampOf(c: number): number[] { return [-3, -2, -1, 0, 1, 2, 3].map((k) => (k < 0 ? mixHex(c, COOL, 0.17 * -k) : k > 0 ? mixHex(c, WARM, 0.13 * k) : c)); }
const pick = (r: number[], i: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];

export function landmarksOf(R: Region): Landmark[] {
  const out: Landmark[] = [];
  R.falls.forEach((f, i) => out.push({ kind: 'fall', x: f.x, z: f.z, name: 'WATERFALL', key: 'fall' + i }));
  R.springs.forEach((s, i) => out.push({ kind: s.kind === 'geyser' ? 'geyser' : 'spring', x: s.x, z: s.z, name: s.kind === 'geyser' ? 'GEYSER' : s.kind === 'hot' ? 'HOT SPRING' : 'MINERAL SPRING', key: 'spr' + i }));
  R.caves.forEach((c, i) => out.push({ kind: 'cave', x: c.x, z: c.z, name: 'CAVE', key: 'cave' + i }));
  R.passes.forEach((p, i) => out.push({ kind: 'pass', x: p.x, z: p.z, name: 'PASS', key: 'pass' + i }));
  // vents: only the strongest few, spaced out
  const vs = [...R.vents].sort((a, b) => b.k - a.k);
  for (const v of vs) { if (out.filter((o) => o.kind === 'vent').length >= 4) break; if (out.some((o) => o.kind === 'vent' && Math.hypot(o.x - v.x, o.z - v.z) < 18)) continue; out.push({ kind: 'vent', x: v.x, z: v.z, name: 'STEAM VENT', key: 'vent' + out.length }); }
  R.deposits.forEach((d, i) => { if (d.hidden || d.amount <= 0) return; const name = d.kind === 'crystal' ? 'CRYSTAL SEAM' : ((d.ore ?? 'ore') + ' seam').replace(/_/g, ' ').toUpperCase(); out.push({ kind: d.kind === 'crystal' ? 'crystal' : 'ore', x: d.x, z: d.z, name, key: 'dep' + i }); });
  // peaks: the high points of each ridge, at least 22 m apart
  const N = R.N, peaks: { x: number; z: number; h: number }[] = [];
  let lo = 1e9, hi = -1e9; for (let i = 0; i < N * N; i++) { lo = Math.min(lo, R.h[i]); hi = Math.max(hi, R.h[i]); }
  const th = lo + (hi - lo) * 0.62;
  for (let z = 4; z < N - 4; z += 3) for (let x = 4; x < N - 4; x += 3) {
    const h = R.h[z * N + x]; if (h < th) continue;
    let top = true;
    for (let dz = -5; dz <= 5 && top; dz += 1) for (let dx = -5; dx <= 5; dx += 1) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue; if (R.h[Z * N + X] > h) { top = false; break; } }
    if (top) peaks.push({ x, z, h });
  }
  peaks.sort((a, b) => b.h - a.h);
  const kept: typeof peaks = [];
  for (const p of peaks) { if (kept.length >= 6) break; if (kept.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 22)) continue; kept.push(p); }
  kept.forEach((p, i) => out.push({ kind: 'peak', x: p.x + 0.5, z: p.z + 0.5, name: `PEAK  ${Math.round(p.h - R.water)} M`, key: 'peak' + i, big: i === 0 }));
  R.lakes.forEach((l, i) => { if ((l.cells ?? l.r * l.r * 3) > 60) out.push({ kind: 'lake', x: l.x, z: l.z, name: l.kind === 'marsh' ? 'MARSH' : l.tarn ? 'TARN' : 'LAKE', key: 'lake' + i }); });
  R.dangers.slice(0, 6).forEach((d, i) => out.push({ kind: 'danger', x: d.x, z: d.z, name: (d.why ?? d.kind).toUpperCase().slice(0, 22), key: 'dng' + i }));
  // one icon per place: drop a mark of the same kind within 12 m of one already kept
  const kept2: Landmark[] = [];
  for (const m of out) if (!kept2.some((q) => q.kind === m.kind && Math.hypot(q.x - m.x, q.z - m.z) < 12)) kept2.push(m);
  return kept2;
}

const terrainCache = new Map<string, { px: Px; marks: Landmark[] }>();
/** the region painted at K art px per metre */
export function paintTerrain(R: Region, pal: Palette, K = 2): { px: Px; marks: Landmark[] } {
  const ck = `${R.seed}|${R.biome.key}|${K}`;
  const hit = terrainCache.get(ck); if (hit) return hit;
  const N = R.N, S = Math.round(N * K), p = new Px(S, S);
  const ramps: Record<number, number[]> = {
    0: rampOf(pal.grass), 1: rampOf(pal.grassDry), 2: rampOf(pal.soil), 3: rampOf(pal.rock), 4: rampOf(pal.sand), 5: rampOf(pal.mud), 6: rampOf(pal.clay),
    7: rampOf(pal.snow), 8: rampOf(pal.basalt), 9: rampOf(pal.ore), 10: rampOf(pal.crystal), 11: rampOf(mixHex(pal.soil, pal.grass, 0.4)), 12: rampOf(mixHex(pal.rock, pal.sand, 0.4)), 13: rampOf(pal.basalt),
  };
  const wr = rampOf(pal.water), wd = rampOf(pal.waterDeep), foam = pal.foam;
  let lo = 1e9, hi = -1e9; for (let i = 0; i < N * N; i++) { lo = Math.min(lo, R.h[i]); hi = Math.max(hi, R.h[i]); }
  const H = new Float32Array(S * S), wet = new Uint8Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const wx = (x + 0.5) / K, wz = (y + 0.5) / K; H[y * S + x] = R.heightAt(wx, wz); wet[y * S + x] = R.isWater(wx, wz) ? 1 : 0; }
  const hA = (x: number, y: number) => H[Math.max(0, Math.min(S - 1, y)) * S + Math.max(0, Math.min(S - 1, x))];
  const snowLine = lo + (hi - lo) * 0.8;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, h = H[i];
    if (wet[i]) {
      const d = Math.max(0, R.water - h, (R.riverAt(x / K, y / K) || 0) - h);
      const k = Math.min(1, d / 2.2), r = k > 0.55 ? wd : wr;
      let t = 3 - k * 2.2 + (bayer(x, y) - 0.5) * 0.9;
      // glints on open water
      if (k > 0.3 && hash(x >> 1, y, 7) > 0.985) t += 2;
      p.set(x, y, pick(r, t));
      continue;
    }
    const ci = Math.min(N - 1, Math.floor(y / K)) * N + Math.min(N - 1, Math.floor(x / K)), bk = R.b[ci];
    const r = ramps[bk] ?? ramps[0];
    // hill shade from the upper left (dithered steps), height lifts the tone a little
    const gx = hA(x + 1, y) - hA(x - 1, y), gy = hA(x, y + 1) - hA(x, y - 1);
    const sl = (gx + gy * 1.2) * K * 0.9;
    const kh = (h - lo) / Math.max(0.01, hi - lo);
    let t = 3 + kh * 1.6 - 0.8 - sl * 2.2 + (bayer(x, y) - 0.5) * 0.8 + (hash(x >> 1, y >> 1, 9) > 0.93 ? 1 : hash(x, y, 10) > 0.95 ? -1 : 0);
    // steep: hatched rock
    const steep = Math.hypot(gx, gy) * K > 1.3;
    let col = pick(steep ? ramps[3] : r, t);
    if (steep && ((x + y * 2) % 5 === 0)) col = pick(ramps[3], t - 1.5);
    if (h > snowLine && !steep) col = pick(ramps[7], t + 0.5);
    // faint contours every 3 m
    if (Math.floor(h / 3) !== Math.floor(hA(x + 1, y) / 3) || Math.floor(h / 3) !== Math.floor(hA(x, y + 1) / 3)) col = mixHex(col, COOL, 0.18);
    p.set(x, y, col);
  }
  // the shore: a foam line on the water side, a dark wet sand line on the land side
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const i = y * S + x;
    const nb = wet[i - 1] + wet[i + 1] + wet[i - S] + wet[i + S];
    if (wet[i] && nb < 4) p.set(x, y, (x + y) % 3 ? foam : mixHex(foam, pal.water, 0.4));
    else if (!wet[i] && nb > 0) p.set(x, y, mixHex(p.get(x, y), COOL, 0.3));
  }
  // forests: round lit canopies in the planet's foliage colours, each with a shadow down-right
  const fol = pal.foliage.length ? pal.foliage : [pal.grass];
  const step = K >= 1.6 ? 3 : 2, rad = K >= 1.6 ? 2.2 : 1.3;
  const trees: { x: number; y: number; c: number[]; r: number }[] = [];
  for (let y = 0; y < S; y += step) for (let x = 0; x < S; x += step) {
    const jx = x + Math.floor(hash(x, y, 11) * step), jy = y + Math.floor(hash(x, y, 12) * step);
    if (jx >= S || jy >= S || wet[jy * S + jx]) continue;
    const ci = Math.min(N - 1, Math.floor(jy / K)) * N + Math.min(N - 1, Math.floor(jx / K)), f = R.forest[ci] ?? 0;
    if (f < 0.3 || hash(jx, jy, 13) > f * 1.25) continue;
    const c = rampOf(fol[Math.floor(hash(Math.floor(jx / 7), Math.floor(jy / 7), 14) * fol.length)]);
    trees.push({ x: jx, y: jy, c, r: rad * (0.8 + hash(jx, jy, 15) * 0.5) });
  }
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) {
    const R0 = t.r;
    for (let dy = -2; dy <= Math.ceil(R0) + 1; dy++) for (let dx = -1; dx <= Math.ceil(R0) + 2; dx++) { const d = Math.hypot(dx - 1, dy - 1); if (d <= R0) p.shade(t.x + dx, t.y + dy, 0.82); }
    for (let dy = -Math.ceil(R0); dy <= R0; dy++) for (let dx = -Math.ceil(R0); dx <= R0; dx++) {
      const d = Math.hypot(dx, dy); if (d > R0) continue;
      const lit = -(dx * 0.6 + dy * 0.8) / (R0 || 1);
      const edge = d > R0 - 0.9;
      p.set(t.x + dx, t.y + dy, edge && lit < 0 ? pick(t.c, 1) : pick(t.c, 3 + lit * 2 + (bayer(t.x + dx, t.y + dy) - 0.5) * 0.6));
    }
    if (K >= 1.6) p.set(t.x - 1, t.y - 1, pick(t.c, 6));
  }
  const marks = landmarksOf(R);
  // painted peaks on the ranges
  if (K >= 1.6) for (const m of marks) if (m.kind === 'peak') { const g = markGlyph('peak', m.big ? 2 : 1); p.blit(g, Math.round(m.x * K - g.w / 2), Math.round(m.z * K - g.h + 2)); }
  const out = { px: p, marks };
  terrainCache.set(ck, out);
  return out;
}

/** smooth value noise (0..1) and three octaves of it */
function vn(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fbm(x: number, y: number, seed: number) { return vn(x, y, seed) * 0.55 + vn(x * 2.1, y * 2.1, seed + 7) * 0.3 + vn(x * 4.3, y * 4.3, seed + 13) * 0.15; }

/**
 * the fog of war: a dark slate veil over every unseen column (the land's shapes still show through it), heaped with
 * big cloud puffs lit on their upper sides, its edge feathered with ordered dither and picked out by a pale rim
 */
export function paintFog(R: Region, seen: Uint8Array | null, K = 2): Px {
  const N = R.N, S = Math.round(N * K), p = new Px(S, S);
  if (!seen) return p;
  const m = new Float32Array(N * N), B = 3;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    let s = 0, n = 0;
    for (let dz = -B; dz <= B; dz++) for (let dx = -B; dx <= B; dx++) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue; s += seen[Z * N + X] ? 1 : 0; n++; }
    m[z * N + x] = s / n;
  }
  const at = (x: number, y: number) => { const wx = Math.max(0, Math.min(N - 1.001, x / K - 0.5)), wz = Math.max(0, Math.min(N - 1.001, y / K - 0.5)); const x0 = Math.floor(wx), z0 = Math.floor(wz), fx = wx - x0, fz = wz - z0; return (m[z0 * N + x0] * (1 - fx) + m[z0 * N + x0 + 1] * fx) * (1 - fz) + (m[(z0 + 1) * N + x0] * (1 - fx) + m[(z0 + 1) * N + x0 + 1] * fx) * fz; };
  const sc = 1 / (26 * K / 2), F = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) F[y * S + x] = (1 - at(x, y)) * 1.3 + (fbm(x * sc, y * sc, 31) - 0.5) * 0.7 - 0.38;
  const VEIL = [0x141924, 0x1d2432, 0x283142, 0x354052, 0x4a5568, 0x67728a];
  const cs = 1 / (18 * K / 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const f = F[y * S + x]; if (f < 0.5) continue;
    const d = bayer(x, y);
    // the feathered edge: sparse dither first, solid further in
    if (f < 0.56 && d > (f - 0.5) / 0.06) continue;
    const c = fbm(x * cs, y * cs, 53), up = fbm(x * cs, (y - 3) * cs, 53);
    let t = c > 0.62 ? 3 : c > 0.5 ? 2 : c > 0.38 ? 1 : 0;
    if (c > 0.5 && c - up > 0.035) t += 1;          // the lit top of a puff
    if (c > 0.66 && c - up > 0.05 && d > 0.5) t += 1;
    if (t > 0 && d > 0.85 && c < 0.5) t -= 1;
    const a = f < 0.62 ? 175 : 222;
    p.set(x, y, VEIL[Math.min(5, t)], a);
  }
  // a pale rim where the veil begins, and a dark lip on the ground below it
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const f = F[y * S + x], fu = F[(y - 1) * S + x];
    if (f >= 0.56 && fu < 0.56 && fu >= 0.5) p.set(x, y, 0x8a94a8, 200);
    else if (f < 0.5 && fu >= 0.56) p.set(x, y, INK, 90);
  }
  return p;
}
