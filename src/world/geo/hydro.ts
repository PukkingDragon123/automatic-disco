// The water network of a land region. Big rivers rise high in the ranges (snowmelt under the crest) and find the
// cheapest way down through the valleys to the sea (or off the map), carving their channel: the water surface only
// ever falls, flat reaches between rapids, and where the ground steps down a cliff the river drops as a WATERFALL
// into a plunge pool. In the mountains the channel is a gorge with steep walls; in the lowland it has low banks,
// a wide flood plain and walkable valley sides. Valley lakes widen a river where the floor is flat, mountain tarns
// sit on the strata benches and spill into streams that cascade down the risers, tributary streams join the rivers,
// a delta of distributaries and marsh ponds spreads where a big river meets the sea on flat ground, and the mire is
// pocked with shallow pools. Everything is written back into the region: the heightfield, riverY (the inland water
// surface per column, lakes included, so isWater and the ecology see it), rivers, lakes and falls.
import { Rand, clamp, smooth } from '../../core/rand';
import type { Region, RiverPt, Lake, Fall } from '../region';

const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
type P2 = [number, number];

class Heap {
  private a: number[] = [];
  constructor(private f: Float32Array) {}
  get size() { return this.a.length; }
  push(i: number) { const a = this.a; a.push(i); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (this.f[a[p]] <= this.f[a[k]]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; } }
  pop(): number {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) { a[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l; if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r; if (m === k) break; [a[m], a[k]] = [a[k], a[m]]; k = m; } }
    return top;
  }
}

/** context shared by every water body while the network is built */
interface Ctx {
  R: Region; N: number; r: Rand; W: number;
  isSea: (i: number) => boolean; anySea: boolean;
  ds: Float32Array;
  /** lake id + 1 per cell (0 none) */
  lakeId: Int32Array;
}

/** build the whole water network into the region (land regions; ocean regions keep their own) */
export function buildWater(R: Region, r: Rand) {
  const N = R.N, h = R.h, W = R.water, bi = R.biome;
  // the sea: big connected bodies under the water line
  const comp = new Int32Array(N * N).fill(-1), sizes: number[] = [];
  for (let i = 0; i < N * N; i++) {
    if (h[i] >= W || comp[i] >= 0) continue;
    const id = sizes.length, st = [i]; comp[i] = id; let n = 0;
    while (st.length) {
      const c = st.pop()!; n++;
      const x = c % N, z = (c / N) | 0;
      if (x > 0 && h[c - 1] < W && comp[c - 1] < 0) { comp[c - 1] = id; st.push(c - 1); }
      if (x < N - 1 && h[c + 1] < W && comp[c + 1] < 0) { comp[c + 1] = id; st.push(c + 1); }
      if (z > 0 && h[c - N] < W && comp[c - N] < 0) { comp[c - N] = id; st.push(c - N); }
      if (z < N - 1 && h[c + N] < W && comp[c + N] < 0) { comp[c + N] = id; st.push(c + N); }
    }
    sizes.push(n);
  }
  const bigSea = Math.max(30, Math.round(N * N * 0.008)), isSea = (i: number) => comp[i] >= 0 && sizes[comp[i]] >= bigSea;
  const ds = new Float32Array(N * N).fill(99);
  for (let i = 0; i < N * N; i++) if (isSea(i)) ds[i] = 0;
  chamfer(ds, N);
  const C: Ctx = { R, N, r, W, isSea, anySea: sizes.some((n) => n >= bigSea), ds, lakeId: new Int32Array(N * N) };
  const dry = bi.key === 'desert' || bi.key === 'ashland';
  // tarns first: the streams that spill from them are part of the network
  const tarns = dry ? (r.chance(0.35) ? 1 : 0) : bi.key === 'marsh' ? 0 : r.int(1, 2);
  const tarnSrc: P2[] = [];
  for (let k = 0; k < tarns; k++) { const t = makeTarn(C); if (t) tarnSrc.push(t); }
  // big rivers
  const big = dry ? 0 : bi.moist > 0.6 || bi.key === 'meadow' ? (r.chance(0.55) ? 2 : 1) : 1;
  const sources: P2[] = [];
  for (let k = 0; k < big; k++) {
    const src = pickSource(C, sources, k === 0 ? 0.42 : 0.3, true, k === 0);
    if (!src) continue;
    sources.push(src);
    const cells = descend(C, src, k > 0);
    if (!cells) continue;
    const pts = profile(C, cells, k === 0 ? 'main' : 'river');
    if (!pts) continue;
    if (k === 0 && bi.key !== 'marsh') valleyLake(C, pts);
    cut(C, pts, k === 0 ? 'main' : 'river');
    R.rivers.push(pts);
    if (k === 0) delta(C, pts);
  }
  // streams: from the tarns and from high sources, joining whatever water they meet first
  const nStreams = dry ? r.int(0, 1) : bi.key === 'marsh' ? r.int(1, 2) : r.int(3, 5) + (bi.moist > 0.7 ? 1 : 0);
  const streamSrc: P2[] = [...tarnSrc];
  for (let k = tarnSrc.length; k < nStreams; k++) { const s = pickSource(C, [...sources, ...streamSrc], 0.3, false); if (s) streamSrc.push(s); }
  for (const src of streamSrc) {
    const cells = descend(C, src, true);
    if (!cells || cells.length < 14) continue;
    const pts = profile(C, cells, 'stream');
    if (!pts) continue;
    cut(C, pts, 'stream');
    R.rivers.push(pts);
  }
  // plunge pools under the falls
  const pooled: Fall[] = [];
  for (const f of [...R.falls].sort((a, b) => (b.top - b.bottom) - (a.top - a.bottom))) {
    if (f.top - f.bottom < 1.8 || pooled.some((q) => hyp(q.x - f.x, q.z - f.z) < 7)) continue;
    pool(C, f); pooled.push(f);
  }
  // the mire and wet lowland: shallow pools
  const ponds = bi.key === 'marsh' ? r.int(7, 11) : bi.moist > 0.75 ? r.int(1, 3) : bi.key === 'coast' ? r.int(0, 2) : 0;
  for (let k = 0, t = 0; k < ponds && t < 300; t++) if (pond(C)) k++;
  // lakes become water: riverY over every flooded cell, and an outline for the water surface
  for (const L of R.lakes) fill(C, L);
}

/** two-pass chamfer distance (in cells) from every cell holding 0 */
function chamfer(d: Float32Array, N: number) {
  for (let pass = 0; pass < 2; pass++) for (let q = 0; q < N * N; q++) {
    const i = pass ? N * N - 1 - q : q, x = i % N, z = (i / N) | 0, sg = pass ? 1 : -1;
    if (x + sg >= 0 && x + sg < N) d[i] = Math.min(d[i], d[i + sg] + 1);
    if (z + sg >= 0 && z + sg < N) d[i] = Math.min(d[i], d[i + sg * N] + 1);
    if (x + sg >= 0 && x + sg < N && z + sg >= 0 && z + sg < N) d[i] = Math.min(d[i], d[i + sg * N + sg] + 1.41);
  }
}

/** a source high in a range (or, with no range, on high ground at the map edge) */
function pickSource(C: Ctx, avoid: P2[], hiK: number, big: boolean, home = false): P2 | null {
  const { R, N, r, W } = C, h = R.h, M = R.mount, L = R.landing;
  let peak = 0; for (let i = 0; i < N * N; i++) if (M[i] > 0.4) peak = Math.max(peak, h[i] - W);
  let best: P2 | null = null, bs = -1e9;
  for (let t = 0; t < 260; t++) {
    let x: number, z: number;
    if (peak > 8) { x = r.range(4, N - 4); z = r.range(4, N - 4); }
    else { const e = r.int(0, 3), u = r.range(6, N - 7); x = e === 0 ? 1 : e === 1 ? N - 2 : u; z = e === 2 ? 1 : e === 3 ? N - 2 : u; }
    const i = Math.floor(z) * N + Math.floor(x), v = h[i] - W;
    if (R.riverY[i] > 0 || C.lakeId[i] || R.passMask[i]) continue;
    if (peak > 8) { if (M[i] < 0.35 || v < peak * hiK || v > peak * (big ? 0.82 : 0.9)) continue; }
    else if (v < 1) continue;
    let sc = v * 0.25 + Math.min(C.ds[i], 90) * (big ? 0.1 : 0.02) + r.range(0, 2) - Math.max(0, 30 - hyp(x - L.x, z - L.z)) * 0.3;
    for (const [sx, sz] of avoid) if (hyp(sx - x, sz - z) < N * (big ? 0.4 : 0.18)) sc -= 30;
    // the first big river runs through the landing's valley
    if (home && R.farSide && R.farSide[i]) sc -= 12;
    if (sc > bs) { bs = sc; best = [x, z]; }
  }
  return best;
}

/** least-cost descent from a source to the sea, a lake, another river (if join) or, with no sea, the map edge */
function descend(C: Ctx, src: P2, join: boolean): number[] | null {
  const { R, N, W } = C, h = R.h, L = R.landing;
  const g = new Float32Array(N * N).fill(1e9), from = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
  const s0 = Math.floor(src[1]) * N + Math.floor(src[0]);
  const heap = new Heap(g);
  g[s0] = 0; heap.push(s0);
  let lo = 1e9; for (let i = 0; i < N * N; i++) lo = Math.min(lo, h[i]);
  const span = Math.max(1, h[s0] - lo);
  const myLake = C.lakeId[s0];
  let end = -1;
  while (heap.size) {
    const c = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    const cx = c % N, cz = (c / N) | 0;
    const far = hyp(cx - src[0], cz - src[1]);
    if (c !== s0 && far > 6) {
      if (C.isSea(c)) { end = c; break; }
      if (C.lakeId[c] && C.lakeId[c] !== myLake) { end = c; break; }
      if (join && R.riverY[c] > 0) { end = c; break; }
      if (!C.anySea && (cx === 0 || cz === 0 || cx === N - 1 || cz === N - 1) && far > N * 0.4) { end = c; break; }
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
      const j = Z * N + X; if (done[j]) continue;
      const dl = hyp(X + 0.5 - L.x, Z + 0.5 - L.z), rim = Math.min(X, Z, N - 1 - X, N - 1 - Z);
      const up = Math.max(0, h[j] - h[c]);
      const cost = (dx && dz ? 1.414 : 1) * (1 + Math.max(0, (h[j] - W) / span) * 14 + up * 6 + (dl < 17 ? 60 : 0) + (rim < 9 && far > 8 ? (9 - rim) * 6 : 0)
        + (C.ds[j] > 0 && C.ds[j] < 6 ? (6 - C.ds[j]) * 2 : 0) + (R.passMask[j] ? 40 : 0) + R.noise.n2(X * 0.08 + src[0], Z * 0.08) * 0.35);
      if (g[c] + cost < g[j]) { g[j] = g[c] + cost; from[j] = c; heap.push(j); }
    }
  }
  if (end < 0) return null;
  const cells: number[] = [];
  for (let c = end; c >= 0; c = from[c]) cells.push(c);
  return cells.reverse();
}

/**
 * The river's centre line and water surface. The path is smoothed and given meanders (none in a gorge), then the
 * surface follows the running minimum of the ground under it (never rising), so reaches are flat, rapids run where
 * the ground falls steadily, and where it steps down a cliff the surface drops at once: a waterfall.
 */
function profile(C: Ctx, cells: number[], kind: 'main' | 'river' | 'stream'): RiverPt[] | null {
  const { R, N, W, r } = C, M = R.mount, L = R.landing;
  if (cells.length < 12) return null;
  let P: P2[] = [];
  const c0 = cells[0];
  P.push([(c0 % N) + 0.5, ((c0 / N) | 0) + 0.5]);
  for (let i = 2; i < cells.length; i += 3) P.push([(cells[i] % N) + 0.5, ((cells[i] / N) | 0) + 0.5]);
  const ce = cells[cells.length - 1];
  P.push([(ce % N) + 0.5, ((ce / N) | 0) + 0.5]);
  for (let it = 0; it < 3; it++) {
    const Q: P2[] = [P[0]];
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    Q.push(P[P.length - 1]); P = Q;
  }
  const raw: P2[] = [];
  let carry = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], l = hyp(b[0] - a[0], b[1] - a[1]);
    let t = carry;
    for (; t < l; t += 0.5) raw.push([a[0] + ((b[0] - a[0]) * t) / l, a[1] + ((b[1] - a[1]) * t) / l]);
    carry = t - l;
  }
  const tot = raw.length * 0.5, amp = kind === 'stream' ? r.range(0.4, 1.0) : r.range(1.8, 3.4), seed = r.range(0, 99);
  const pts: RiverPt[] = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[Math.max(0, i - 2)], b = raw[Math.min(raw.length - 1, i + 2)];
    const tx = b[0] - a[0], tz = b[1] - a[1], tl = hyp(tx, tz) || 1;
    const s = i * 0.5, env = Math.sin(Math.PI * Math.min(1, s / tot)) ** 0.6;
    const mi = Math.floor(clamp(raw[i][1], 0, N - 1)) * N + Math.floor(clamp(raw[i][0], 0, N - 1));
    // meanders on the plain, none in the gorges
    const off = R.noise.n2(s * 0.035 + seed, 3.3) * amp * env * (1 - smooth(0.2, 0.5, M[mi]));
    let x = raw[i][0] - (tz / tl) * off, z = raw[i][1] + (tx / tl) * off;
    const dl = hyp(x - L.x, z - L.z);
    if (dl < 15) { x = L.x + ((x - L.x) / dl) * 15; z = L.z + ((z - L.z) / dl) * 15; }
    pts.push({ x, z, y: 0, w: 0, s, v: 0 });
  }
  // the surface: the running minimum of the ground, a little under it
  const endI = cells[cells.length - 1];
  const endY = C.isSea(endI) ? W : C.lakeId[endI] ? R.lakes[C.lakeId[endI] - 1].level : R.riverY[endI] > 0 ? R.riverY[endI] : -1e9;
  const sub = kind === 'stream' ? 0.22 : 0.42;
  let ws = 1e9;
  const gr = pts.map((p) => R.groundSmooth(clamp(p.x, 0, N), clamp(p.z, 0, N)));
  // a lake source starts at the lake's level
  const lk = C.lakeId[Math.floor(clamp(pts[0].z, 0, N - 1)) * N + Math.floor(clamp(pts[0].x, 0, N - 1))];
  if (lk) ws = R.lakes[lk - 1].level + 0.002;
  for (let i = 0; i < pts.length; i++) { ws = Math.min(ws - 0.002, gr[i] - sub); pts[i].y = Math.max(endY, W, ws); }
  // find the drops (more than 1.1 m within 2 m of channel), smooth each reach between them, keep it monotone
  const brk: number[] = [];
  for (let i = 4; i < pts.length; i++) if (pts[i - 4].y - pts[i].y > 1.1) { brk.push(i - 2); i += 6; }
  const seg = [0, ...brk, pts.length];
  for (let k = 0; k < seg.length - 1; k++) {
    const a = seg[k] + (k ? 2 : 0), b = seg[k + 1] - (k + 1 < seg.length - 1 ? 2 : 0);
    const ys = pts.slice(a, b).map((p) => p.y);
    for (let i = a; i < b; i++) { let s = 0, c = 0; for (let j = Math.max(a, i - 6); j < Math.min(b, i + 7); j++) { s += ys[j - a]; c++; } pts[i].y = s / c; }
  }
  for (let i = 1; i < pts.length; i++) pts[i].y = Math.min(pts[i].y, pts[i - 1].y - 0.001);
  for (const p of pts) p.y = Math.max(endY, W, p.y);
  // trim where it has run out into the sea
  let cut2 = pts.length;
  for (let i = 0; i < pts.length; i++) if (pts[i].y <= W + 0.01 && R.groundSmooth(clamp(pts[i].x, 0, N), clamp(pts[i].z, 0, N)) < W - 0.3) { cut2 = Math.min(pts.length, i + 8); break; }
  pts.length = cut2;
  if (pts.length < 10) return null;
  // width, speed, white water, the falls
  const last = Math.max(1, pts[pts.length - 1].s);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], t = p.s / last;
    p.w = (kind === 'main' ? 1.7 + 1.9 * t : kind === 'river' ? 1.1 + 0.9 * t : 0.38 + 0.32 * t) * (1 + R.noise.n2(p.s * 0.05, 9.1 + seed) * 0.16);
    const a = pts[Math.max(0, i - 6)], b = pts[Math.min(pts.length - 1, i + 6)];
    const slope = (a.y - b.y) / Math.max(0.5, b.s - a.s);
    p.v = clamp(0.45 + slope * 26, 0.45, 2.8);
    if (slope > 0.05) p.rapid = clamp((slope - 0.05) * 9, 0, 1);
    // narrower and faster in a gorge
    const mi = Math.floor(clamp(p.z, 0, N - 1)) * N + Math.floor(clamp(p.x, 0, N - 1));
    if (R.mount[mi] > 0.4) p.w *= 0.8;
  }
  for (const bI of brk) {
    if (bI >= pts.length - 2) continue;
    const top = Math.max(0, bI - 3), bot = Math.min(pts.length - 1, bI + 3);
    const A = pts[top], Bp = pts[bot];
    const dx = Bp.x - A.x, dz = Bp.z - A.z, dl = hyp(dx, dz) || 1;
    const drop = A.y - Bp.y;
    if (drop < 1) continue;
    for (let j = top; j <= bot; j++) { pts[j].drop = drop / Math.max(1, (bot - top) * 0.5); pts[j].rapid = 1; pts[j].v = Math.max(pts[j].v, 2.6); }
    R.falls.push({ x: (A.x + Bp.x) / 2, z: (A.z + Bp.z) / 2, top: A.y, bottom: Bp.y, w: (A.w + Bp.w) * 0.9, dir: [dx / dl, dz / dl] });
  }
  return pts;
}

/**
 * Carve one river into the land: a parabolic channel under the surface, low banks, then valley sides. On the plain
 * the sides are walkable (0.62) and run out across a wide floodplain; in the ranges they steepen into gorge walls.
 * Marks riverY over the wetted columns.
 */
function cut(C: Ctx, pts: RiverPt[], kind: 'main' | 'river' | 'stream') {
  const { R, N } = C, h = R.h, M = R.mount;
  const bestD = new Float32Array(N * N).fill(1e9), bestI = new Int32Array(N * N).fill(-1);
  const BANK = kind === 'stream' ? 1.2 : 2.8, VAL = kind === 'stream' ? 7 : 22, PLAIN = kind === 'main' ? 4.5 : kind === 'river' ? 2.5 : 0;
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k], Rr = p.w + BANK + PLAIN + VAL;
    for (let z = Math.max(0, Math.floor(p.z - Rr)); z <= Math.min(N - 1, Math.ceil(p.z + Rr)); z++)
      for (let x = Math.max(0, Math.floor(p.x - Rr)); x <= Math.min(N - 1, Math.ceil(p.x + Rr)); x++) {
        const d = hyp(x + 0.5 - p.x, z + 0.5 - p.z), i = z * N + x;
        if (d < bestD[i]) { bestD[i] = d; bestI[i] = k; }
      }
  }
  for (let i = 0; i < N * N; i++) {
    const k = bestI[i]; if (k < 0) continue;
    const p = pts[k], d = bestD[i], w = p.w, dep = kind === 'stream' ? 0.18 + 0.2 * w : 0.34 + 0.22 * w;
    const m = M[i], side = 0.62 + (1.6 - 0.62) * smooth(0.25, 0.6, m), plain = PLAIN * (1 - smooth(0.15, 0.4, m));
    if (d > w + BANK + plain + VAL) continue;
    let t: number;
    if (d < w) t = Math.max(R.water + 0.02, p.y - dep * (1 - (d / w) ** 2) - 0.04);
    else if (d < w + BANK) t = p.y + 0.06 + (d - w) * (m > 0.4 ? 0.9 : 0.36);
    else if (d < w + BANK + plain) t = p.y + 0.06 + BANK * 0.36 + (d - w - BANK) * 0.05;
    else t = p.y + 0.06 + BANK * (m > 0.4 ? 0.9 : 0.36) + plain * 0.05 + (d - w - BANK - plain) * side;
    if (h[i] > t) h[i] = t;
    else if (d < w + BANK * 0.6 && h[i] < p.y + 0.06 && p.y > R.water + 0.05 && R.riverY[i] <= 0 && !C.lakeId[i]) h[i] = t; // a low levee holds the water in
    if (d < w + 0.35 && h[i] < p.y) R.riverY[i] = Math.max(R.riverY[i], p.y);
  }
}

/** a mountain tarn on a strata bench: a rock bowl, its outlet the source of a stream. Returns the outlet point */
function makeTarn(C: Ctx): P2 | null {
  const { R, N, r, W } = C, h = R.h, M = R.mount;
  let peak = 0; for (let i = 0; i < N * N; i++) if (M[i] > 0.4) peak = Math.max(peak, h[i] - W);
  if (peak < 12) return null;
  let best: [number, number, number] | null = null, bs = -1e9;
  for (let t = 0; t < 400; t++) {
    const x = r.range(10, N - 10), z = r.range(10, N - 10), i = Math.floor(z) * N + Math.floor(x);
    if (M[i] < 0.45 || R.passMask[i]) continue;
    const v = h[i] - W; if (v < peak * 0.3 || v > peak * 0.75) continue;
    // flat: the lowest and highest ground round the bowl differ little (a bench)
    let lo = 1e9, hi = -1e9;
    for (let a = 0; a < 10; a++) for (const d of [2, 4]) { const g = R.groundSmooth(x + Math.cos(a * 0.628) * d, z + Math.sin(a * 0.628) * d); lo = Math.min(lo, g); hi = Math.max(hi, g); }
    const sc = -(hi - lo) * 2 + v * 0.05 + r.range(0, 1);
    if (hi - lo > 2.4) continue;
    if (sc > bs) { bs = sc; best = [x, z, lo]; }
  }
  if (!best) return null;
  const [x, z] = best, rad = r.range(3.5, 5.5), ry = rad * r.range(0.7, 1), ya = r.range(0, Math.PI);
  // the rim: the lowest ground round the bowl; the water a hand under it
  let rim = 1e9;
  for (let a = 0; a < 24; a++) rim = Math.min(rim, R.groundSmooth(x + Math.cos(a * 0.2618) * (rad + 1.2), z + Math.sin(a * 0.2618) * (rad + 1.2)));
  const level = rim - 0.25;
  const dep = r.range(1.0, 1.6);
  const ft = bowl(C, x, z, rad, ry, ya, level, dep);
  R.lakes.push({ level, poly: [], kind: 'fresh', x, z, r: rad, tarn: true });
  C.lakeId[Math.floor(z) * N + Math.floor(x)] = R.lakes.length;
  stampLake(C, R.lakes.length - 1, ft);
  return [x, z];
}

/** carve an elliptical bowl (radii rx, rz, rotated ya) to `dep` under `level`, its sides easing into the ground */
function bowl(C: Ctx, x: number, z: number, rx: number, rz: number, ya: number, level: number, dep: number): (x: number, z: number) => boolean {
  const { R, N } = C, h = R.h, c = Math.cos(ya), s = Math.sin(ya), ext = Math.ceil(Math.max(rx, rz) + 3);
  for (let Z = Math.floor(z) - ext; Z <= Math.floor(z) + ext; Z++) for (let X = Math.floor(x) - ext; X <= Math.floor(x) + ext; X++) {
    if (!R.inside(X, Z)) continue;
    const dx = X + 0.5 - x, dz = Z + 0.5 - z, u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz;
    const e = Math.sqrt(u * u + v * v) + R.noise.n2(X * 0.25, Z * 0.25) * 0.12;
    const i = Z * N + X;
    let t: number;
    if (e < 1) t = level - 0.12 - dep * (1 - e * e);
    else t = level - 0.12 + (e - 1) * Math.max(rx, rz) * 0.55;
    if (h[i] > t) h[i] = t;
  }
  return (px: number, pz: number) => { const dx = px - x, dz = pz - z, u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz; return u * u + v * v < 1.3; };
}

/** flood a lake's id onto its cells (h under the level, connected to its centre, within reach of its radius) */
function stampLake(C: Ctx, li: number, foot?: (x: number, z: number) => boolean) {
  const { R, N } = C, L = R.lakes[li], h = R.h;
  const s0 = Math.floor(L.z) * N + Math.floor(L.x), st = [s0], lim = (L.r * 1.25 + 1.5) ** 2;
  const seen = new Uint8Array(N * N); seen[s0] = 1;
  while (st.length) {
    const c = st.pop()!, x = c % N, z = (c / N) | 0;
    if (h[c] >= L.level) continue;
    if (!C.lakeId[c]) C.lakeId[c] = li + 1;
    for (const j of [c - 1, c + 1, c - N, c + N]) {
      if (j < 0 || j >= N * N || seen[j]) continue;
      const X = j % N, Z = (j / N) | 0; if (Math.abs(X - x) > 1) continue;
      if ((X + 0.5 - L.x) ** 2 + (Z + 0.5 - L.z) ** 2 > lim || (foot && !foot(X + 0.5, Z + 0.5))) continue;
      seen[j] = 1; st.push(j);
    }
  }
}

/** widen a big river into a lake where its valley floor runs flat for a while, well away from the landing */
function valleyLake(C: Ctx, pts: RiverPt[]) {
  const { R, N, r, W } = C, L = R.landing;
  if (!r.chance(0.7)) return;
  let best = -1, bs = -1e9;
  for (let i = 20; i < pts.length - 30; i += 4) {
    const p = pts[i], q = pts[i + 24];
    if (p.y - q.y > 0.6 || p.y < W + 0.6) continue;
    const mi = Math.floor(p.z) * N + Math.floor(p.x);
    if (R.mount[mi] > 0.3 || hyp(p.x - L.x, p.z - L.z) < 30 || p.x < 16 || p.z < 16 || p.x > N - 16 || p.z > N - 16) continue;
    const sc = -(p.y - q.y) * 3 + r.range(0, 1) + (R.mount[mi] < 0.1 ? 1 : 0);
    if (sc > bs) { bs = sc; best = i; }
  }
  if (best < 0) return;
  const mid = pts[best + 12], a = pts[best], b = pts[best + 24];
  const ya = Math.atan2(b.z - a.z, b.x - a.x), rx = r.range(9, 13), rz = rx * r.range(0.55, 0.75), level = mid.y;
  // the river runs level through the lake
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], dx = p.x - mid.x, dz = p.z - mid.z, u = (dx * Math.cos(ya) + dz * Math.sin(ya)) / (rx + 2), v = (-dx * Math.sin(ya) + dz * Math.cos(ya)) / (rz + 2);
    if (u * u + v * v < 1) { p.y = Math.min(p.y, level); p.y = Math.max(p.y, level - 0.001); p.rapid = 0; }
  }
  for (let i = 1; i < pts.length; i++) pts[i].y = Math.min(pts[i].y, pts[i - 1].y - 0.0005);
  const ft = bowl(C, mid.x, mid.z, rx, rz, ya, level, r.range(1.4, 2.4));
  R.lakes.push({ level, poly: [], kind: 'fresh', x: mid.x, z: mid.z, r: rx });
  C.lakeId[Math.floor(mid.z) * N + Math.floor(mid.x)] = R.lakes.length;
  stampLake(C, R.lakes.length - 1, ft);
}

/** a plunge pool at the foot of a fall */
function pool(C: Ctx, f: Fall) {
  const { R, N } = C;
  const x = f.x + f.dir[0] * (f.w * 0.5 + 0.8), z = f.z + f.dir[1] * (f.w * 0.5 + 0.8);
  if (!R.inside(Math.floor(x), Math.floor(z))) return;
  const rad = Math.max(1.6, f.w * 0.75 + 0.8);
  const ft = bowl(C, x, z, rad, rad * 0.85, Math.atan2(f.dir[1], f.dir[0]), f.bottom + 0.1, 0.7 + Math.min(1, (f.top - f.bottom) * 0.12));
  R.lakes.push({ level: f.bottom, poly: [], kind: 'fresh', x, z, r: rad });
  C.lakeId[Math.floor(z) * N + Math.floor(x)] = R.lakes.length;
  stampLake(C, R.lakes.length - 1, ft);
}

/** a shallow marsh pool on low, flat, wet ground */
function pond(C: Ctx): boolean {
  const { R, N, r, W } = C, L = R.landing;
  const x = r.range(8, N - 8), z = r.range(8, N - 8), i = Math.floor(z) * N + Math.floor(x);
  const g = R.h[i];
  if (g < W + 0.1 || g > W + 2.4 || R.riverY[i] > 0 || C.lakeId[i] || R.mount[i] > 0.2 || R.passMask[i]) return false;
  if (hyp(x - L.x, z - L.z) < 22) return false;
  let lo = 1e9, hi = -1e9;
  for (let a = 0; a < 8; a++) { const v = R.groundSmooth(x + Math.cos(a * 0.785) * 3.5, z + Math.sin(a * 0.785) * 3.5); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (hi - lo > 0.9) return false;
  if (R.lakes.some((q) => hyp(q.x - x, q.z - z) < q.r + 6)) return false;
  const rad = r.range(1.8, 4.2), level = Math.min(lo, g) - 0.04;
  const ft = bowl(C, x, z, rad, rad * r.range(0.6, 1), r.range(0, 3.14), level, r.range(0.25, 0.5));
  R.lakes.push({ level, poly: [], kind: 'marsh', x, z, r: rad });
  C.lakeId[i] = R.lakes.length;
  stampLake(C, R.lakes.length - 1, ft);
  return true;
}

/** a delta: where the big river crosses flat ground into the sea, two distributaries peel off, marsh pools between */
function delta(C: Ctx, pts: RiverPt[]) {
  const { R, N, r, W } = C;
  if (!C.anySea || pts.length < 60) return;
  const mouth = pts[pts.length - 1];
  if (!C.isSea(Math.floor(clamp(mouth.z, 0, N - 1)) * N + Math.floor(clamp(mouth.x, 0, N - 1))) && mouth.y > W + 0.05) return;
  // flat for the last 16 m
  const bI = Math.max(0, pts.length - 44), b = pts[bI];
  if (b.y > W + 1.2 || R.mount[Math.floor(b.z) * N + Math.floor(b.x)] > 0.1) return;
  for (const sg of r.chance(0.5) ? [-1, 1] : [r.sign()]) {
    const a = pts[Math.max(0, bI - 4)], tx = b.x - a.x, tz = b.z - a.z, tl = hyp(tx, tz) || 1;
    let dx = tx / tl, dz = tz / tl;
    const ang = sg * r.range(0.45, 0.8), c = Math.cos(ang), s = Math.sin(ang);
    [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    const out: RiverPt[] = [];
    let x = b.x, z = b.z, y = b.y;
    for (let k = 0; k < 120; k++) {
      const i = Math.floor(clamp(z, 0, N - 1)) * N + Math.floor(clamp(x, 0, N - 1));
      out.push({ x, z, y, w: 0.8 + 0.5 * (k / 120), s: k * 0.5, v: 0.5 });
      if (C.isSea(i) && k > 8) break;
      const turn = R.noise.n2(k * 0.06 + sg * 5, 2.2) * 0.05;
      [dx, dz] = [dx * Math.cos(turn) - dz * Math.sin(turn), dx * Math.sin(turn) + dz * Math.cos(turn)];
      x += dx * 0.5; z += dz * 0.5;
      if (x < 1 || z < 1 || x > N - 1 || z > N - 1) break;
      y = Math.max(W, Math.min(y - 0.004, R.groundSmooth(x, z) - 0.2));
    }
    if (out.length < 16) continue;
    cut(C, out, 'stream');
    R.rivers.push(out);
  }
  // marsh pools on the delta flats
  for (let k = 0, t = 0; k < 4 && t < 80; t++) {
    const p = pts[Math.max(0, pts.length - 1 - r.int(0, 40))], a = r.range(0, 6.28), d = r.range(5, 12);
    const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, i = Math.floor(clamp(z, 0, N - 1)) * N + Math.floor(clamp(x, 0, N - 1));
    if (x < 4 || z < 4 || x > N - 4 || z > N - 4 || R.h[i] < W + 0.08 || R.h[i] > W + 1 || R.riverY[i] > 0 || C.lakeId[i]) continue;
    const rad = r.range(1.5, 3), level = R.h[i] - 0.05;
    const ft = bowl(C, x, z, rad, rad * 0.8, a, level, 0.3);
    R.lakes.push({ level, poly: [], kind: 'marsh', x, z, r: rad });
    C.lakeId[i] = R.lakes.length;
    stampLake(C, R.lakes.length - 1, ft);
    k++;
  }
}

/** a lake becomes water: riverY over its cells, its outline traced from the centre */
function fill(C: Ctx, L: Lake) {
  const { R, N } = C, li = R.lakes.indexOf(L) + 1, h = R.h;
  let n = 0;
  for (let i = 0; i < N * N; i++) if (C.lakeId[i] === li && h[i] < L.level) { R.riverY[i] = Math.max(R.riverY[i], L.level); n++; }
  // the outline: from the centre outward until the ground stands above the water, then a little under the bank
  const poly: P2[] = [];
  const K = Math.max(24, Math.min(56, Math.round(L.r * 7)));
  for (let k = 0; k < K; k++) {
    const a = (k / K) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    let d = 0;
    for (; d < L.r * 2.4 + 3; d += 0.25) {
      const x = L.x + c * d, z = L.z + s * d;
      if (x < 0 || z < 0 || x > N || z > N || R.groundSmooth(x, z) >= L.level) break;
    }
    poly.push([L.x + c * (d + 0.35), L.z + s * (d + 0.35)]);
  }
  L.poly = poly;
  L.cells = n;
}
