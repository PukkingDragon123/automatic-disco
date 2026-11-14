// Mountain ranges with passes. A range is a ridgeline (a wandering polyline that runs off the map at one or both
// ends) with a crest that rises into summits and dips into saddles; its flanks fall away on a concave profile, widened
// into spurs by a ridged multifractal so side valleys run down between them. After erosion the core of every range is
// stepped into strata benches with cliff risers (no walker climbs a riser), so a range is a wall you cannot cross
// except at its PASSES: saddles where a road is graded through a notch at a walkable slope, valley to valley.
import { Noise } from '../../core/noise';
import { Rand, clamp, smooth } from '../../core/rand';

const hyp = (a: number, b: number) => Math.sqrt(a * a + b * b);
export type P2 = [number, number];

export interface Spine {
  /** the ridgeline, 2 m apart, running past the map edge where it leaves the map */
  pts: P2[];
  /** cumulative arc length per point */
  s: number[];
  /** flank half-width (m) and crest height over the valley floor (m) */
  w: number; peak: number;
  /** saddles along it (arc length) where a pass will be cut */
  passS: number[];
  kind: 'main' | 'rim' | 'spur';
}
export interface PassSite { x: number; z: number; nx: number; nz: number; spine: number }
/** a graded pass: its road centre line (valley to valley through the saddle) and the saddle's road height */
export interface Pass { x: number; z: number; y: number; path: P2[]; w: number }

/** per-biome range plans: how many, how tall (m over the valley floor), how wide (flank half-width, m) */
const PLAN: Record<string, { kinds: ('main' | 'rim' | 'spur')[]; peak: number; w: number; extra?: number }> = {
  highland: { kinds: ['main', 'rim', 'spur'], peak: 56, w: 23 },
  tundra: { kinds: ['main', 'rim'], peak: 48, w: 22, extra: 0.6 },
  meadow: { kinds: ['main', 'spur'], peak: 44, w: 21, extra: 0.6 },
  jungle: { kinds: ['main', 'spur'], peak: 38, w: 20, extra: 0.5 },
  crystal: { kinds: ['main', 'rim'], peak: 44, w: 21 },
  ashland: { kinds: ['main', 'spur'], peak: 46, w: 21 },
  coast: { kinds: ['main'], peak: 34, w: 19, extra: 0.4 },
  savanna: { kinds: ['spur', 'rim'], peak: 27, w: 17 },
  desert: { kinds: ['main'], peak: 26, w: 17 },
  marsh: { kinds: [], peak: 0, w: 0 },
};

/**
 * Lay the ranges out. `seaX, seaZ` is where the low ground (the sea) lies, or null: the main range runs across the
 * map away from it, so rivers fall from the range through the landing valley to the sea. Returns the spines and a
 * hint for the landing (the middle of the big valley).
 */
export function planRanges(N: number, key: string, r: Rand, n: Noise, sea: P2 | null): { spines: Spine[]; hint: P2 } {
  const P = PLAN[key] ?? PLAN.meadow, c = N / 2, spines: Spine[] = [];
  let kinds = [...P.kinds];
  if (P.extra !== undefined && kinds.length > 1 && !r.chance(P.extra)) kinds = kinds.slice(0, 1);
  // the main axis: the range's normal points from it toward the landing valley (and the sea, when there is one)
  let ang = r.range(0, Math.PI * 2);
  if (sea) ang = Math.atan2(sea[1] - c, sea[0] - c) + r.range(-0.5, 0.5);
  const nx = Math.cos(ang), nz = Math.sin(ang), tx = -nz, tz = nx;
  // the landing valley's middle: on the normal side of the main range
  const off = N * (key === 'coast' ? r.range(0.2, 0.25) : r.range(0.1, 0.15));
  const hint: P2 = [c + nx * N * 0.16, c + nz * N * 0.16];
  const line = (ox: number, oz: number, dx: number, dz: number, len0: number, len1: number, wob: number, seed: number): P2[] => {
    const pts: P2[] = [];
    for (let s = -len0; s <= len1; s += 2) {
      const w = n.fbm2(s * 0.018 + seed, seed * 0.37, 3) * wob + n.n2(s * 0.06 + seed * 3, 1.7) * wob * 0.25;
      pts.push([ox + dx * s - dz * w, oz + dz * s + dx * w]);
    }
    return pts;
  };
  for (const kind of kinds) {
    let pts: P2[];
    const seed = r.range(0, 900);
    if (kind === 'main') {
      // across the whole map, on the far side of the middle from the valley
      const ox = c - nx * off, oz = c - nz * off;
      pts = line(ox, oz, tx, tz, N * 0.9, N * 0.9, 11, seed);
    } else if (kind === 'rim') {
      // along the edge behind the landing valley (or, without a main range, the far edge), part of its length
      const sgn = kinds.includes('main') ? 1 : -1, d = N * r.range(0.4, 0.46);
      const ox = c + nx * d * sgn, oz = c + nz * d * sgn, shift = r.range(-0.25, 0.25) * N;
      pts = line(ox + tx * shift, oz + tz * shift, tx, tz, N * r.range(0.35, 0.6), N * r.range(0.35, 0.6), 7, seed);
    } else {
      // a spur running in from an edge on one flank of the valley, stopping short of the landing
      const side = r.sign(), ex = c + tx * side * N * 0.72 + nx * N * r.range(0.02, 0.2), ez = c + tz * side * N * 0.72 + nz * N * r.range(0.02, 0.2);
      const dx = -tx * side + nx * r.range(-0.35, 0.35), dz = -tz * side + nz * r.range(-0.35, 0.35), dl = hyp(dx, dz);
      pts = line(ex, ez, dx / dl, dz / dl, 0, N * r.range(0.42, 0.52), 8, seed);
    }
    const s: number[] = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + hyp(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const scale = kind === 'main' ? 1 : kind === 'rim' ? 0.85 : 0.72;
    const sp: Spine = { pts, s, w: P.w * (kind === 'main' ? 1 : 0.8) * r.range(0.9, 1.1), peak: P.peak * scale * r.range(0.9, 1.08), passS: [], kind };
    // saddles: where the ridge is on the map and well in from the edges, apart from each other
    const onMap = (i: number) => { const [x, z] = pts[i]; return Math.min(x, z, N - x, N - z); };
    const want = kind === 'main' ? (r.chance(0.5) ? 2 : 1) : kind === 'rim' ? (r.chance(0.6) ? 1 : 0) : 0;
    for (let k = 0, t = 0; k < want && t < 80; t++) {
      const i = r.int(0, pts.length - 1);
      if (onMap(i) < N * 0.16) continue;
      if (sp.passS.some((q) => Math.abs(q - s[i]) < N * 0.32)) continue;
      sp.passS.push(s[i]); k++;
    }
    spines.push(sp);
  }
  return { spines, hint };
}

/** distance from p to a spine polyline, and the arc length of the nearest point */
function nearest(sp: Spine, x: number, z: number): [number, number] {
  let bd = 1e9, bs = 0;
  const P = sp.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const ax = P[i][0], az = P[i][1], bx = P[i + 1][0], bz = P[i + 1][1];
    const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
    // quick reject on the bounding box
    const qx = x - ax, qz = z - az;
    if (qx * qx + qz * qz > (bd + 3) * (bd + 3) && (x - bx) * (x - bx) + (z - bz) * (z - bz) > (bd + 3) * (bd + 3)) continue;
    const t = clamp((qx * ex + qz * ez) / (l2 || 1), 0, 1);
    const dx = qx - ex * t, dz = qz - ez * t, d = Math.sqrt(dx * dx + dz * dz);
    if (d < bd) { bd = d; bs = sp.s[i] + (sp.s[i + 1] - sp.s[i]) * t; }
  }
  return [bd, bs];
}

/**
 * Raise the ranges into S (heights, m). Writes the mountain mask M (0 lowland .. 1 range core) and returns nothing.
 * The crest varies along the ridge (summits, shoulders) and dips at each saddle; the flank is concave and broken by
 * spurs. Ranges combine by maximum, so where two meet they knot into one massif instead of stacking.
 */
export function raiseRanges(S: Float32Array, M: Float32Array, N: number, spines: Spine[], n: Noise, k: number, base: number) {
  if (!spines.length) return;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, px = x + 0.5, pz = z + 0.5;
    // the flanks wander: a warp of the sample point
    const wx = px + n.fbm2(px * 0.03 + 50, pz * 0.03, 2) * 6, wz = pz + n.fbm2(px * 0.03, pz * 0.03 - 50, 2) * 6;
    let best = 0, mask = 0;
    for (const sp of spines) {
      const [d, s] = nearest(sp, wx, wz);
      // spurs: the ridged field widens the flank in tongues running down from the crest
      const rg = n.ridge2(px * 0.042 + sp.peak, pz * 0.042, 3);
      const W = sp.w * (0.78 + 0.5 * rg) * (sp.kind === 'spur' ? smooth(0, 14, s) * 0.5 + 0.5 : 1);
      const u = d / W;
      mask = Math.max(mask, smooth(1.25, 0.6, u));
      if (u >= 1.6) continue;
      // the crest line: shoulders and summits along the ridge, saddles at the passes, tapering at a spur's tip
      let C = sp.peak * (0.72 + 0.2 * (n.fbm2(s * 0.03 + sp.w, 7.1, 3) * 0.5 + 0.5) + 0.16 * Math.pow(n.ridge2(s * 0.05, sp.peak * 0.1, 2), 3));
      if (sp.kind === 'spur') C *= 0.35 + 0.65 * smooth(sp.s[sp.s.length - 1], sp.s[sp.s.length - 1] * 0.55, s);
      for (const ps of sp.passS) { const g = Math.exp(-(((s - ps) / 11) ** 2)); C = C + (Math.min(C, 11) - C) * g; }
      let v = 0;
      if (u < 1) {
        // concave flank, a sharper crest
        const prof = Math.pow(1 - u, 1.45) * (1 + 0.35 * u * (1 - u));
        v = C * prof * (0.78 + 0.32 * rg);
      }
      // foothills fading out past the foot
      v += Math.pow(n.ridge2(px * 0.07 + 31, pz * 0.07 - 7, 3), 2) * 4.2 * smooth(1.6, 0.85, u) * smooth(0.25, 0.9, u);
      if (v > best) best = v;
    }
    S[i] += best * k;
    M[i] = Math.max(M[i], mask * Math.min(1, k * 1.2));
  }
  void base;
}

/** pass sites: the saddle point of every saddle, and the ridge normal there (pointing either way) */
export function passSites(spines: Spine[], N: number): PassSite[] {
  const out: PassSite[] = [];
  spines.forEach((sp, si) => {
    for (const ps of sp.passS) {
      let i = 0; while (i < sp.s.length - 1 && sp.s[i + 1] < ps) i++;
      const a = sp.pts[Math.max(0, i - 1)], b = sp.pts[Math.min(sp.pts.length - 1, i + 1)], p = sp.pts[i];
      const tx = b[0] - a[0], tz = b[1] - a[1], tl = hyp(tx, tz) || 1;
      if (p[0] < 4 || p[1] < 4 || p[0] > N - 4 || p[1] > N - 4) continue;
      out.push({ x: p[0], z: p[1], nx: -tz / tl, nz: tx / tl, spine: si });
    }
  });
  return out;
}

/**
 * The road over a pass: from the saddle, walk down each side (choosing at each metre the lowest of a few headings
 * near the ridge normal) until the valley floor, then smooth it. The road is graded later, once the land is final.
 */
export function passRoute(h: Float32Array, M: Float32Array, N: number, ps: PassSite, floor: number): P2[] {
  const g = (x: number, z: number) => { const X = clamp(Math.floor(x), 0, N - 1), Z = clamp(Math.floor(z), 0, N - 1); return h[Z * N + X]; };
  const half = (sg: number): P2[] => {
    const out: P2[] = [];
    let x = ps.x, z = ps.z, ax = ps.nx * sg, az = ps.nz * sg;
    for (let k = 0; k < 70; k++) {
      let best = 1e9, bx = ax, bz = az;
      for (const da of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const c = Math.cos(da), s = Math.sin(da), dx = ax * c - az * s, dz = ax * s + az * c;
        // prefer straight on and downhill
        const v = g(x + dx * 2, z + dz * 2) + Math.abs(da) * 0.6;
        if (v < best) { best = v; bx = dx; bz = dz; }
      }
      // keep near the ridge normal so the road does not wander along the range
      const bl = hyp(bx * 0.75 + ps.nx * sg * 0.25, bz * 0.75 + ps.nz * sg * 0.25) || 1;
      ax = (bx * 0.75 + ps.nx * sg * 0.25) / bl; az = (bz * 0.75 + ps.nz * sg * 0.25) / bl;
      x += ax; z += az;
      if (x < 2 || z < 2 || x > N - 2 || z > N - 2) break;
      out.push([x, z]);
      const i = Math.floor(z) * N + Math.floor(x);
      if (M[i] < 0.12 && g(x, z) < floor + 2.5 && k > 10) { for (let e = 0; e < 4; e++) { x += ax; z += az; if (x > 2 && z > 2 && x < N - 2 && z < N - 2) out.push([x, z]); } break; }
    }
    return out;
  };
  const A = half(-1).reverse(), B = half(1);
  let P: P2[] = [...A, [ps.x, ps.z], ...B];
  // smooth: decimate to 3 m, then Chaikin twice
  const D: P2[] = [P[0]];
  for (const p of P) if (hyp(p[0] - D[D.length - 1][0], p[1] - D[D.length - 1][1]) >= 3) D.push(p);
  if (D[D.length - 1] !== P[P.length - 1]) D.push(P[P.length - 1]);
  P = D;
  for (let it = 0; it < 2; it++) {
    const Q: P2[] = [P[0]];
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    Q.push(P[P.length - 1]); P = Q;
  }
  return P;
}

/** distance from a point to a polyline and the arc length along it */
export function polyNear(P: P2[], x: number, z: number): [number, number] {
  let bd = 1e9, bs = 0, acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const ax = P[i][0], az = P[i][1], ex = P[i + 1][0] - ax, ez = P[i + 1][1] - az, l = hyp(ex, ez);
    const t = clamp(((x - ax) * ex + (z - az) * ez) / (l * l || 1), 0, 1);
    const d = hyp(x - ax - ex * t, z - az - ez * t);
    if (d < bd) { bd = d; bs = acc + l * t; }
    acc += l;
  }
  return [bd, bs];
}

/**
 * Step the range cores into strata: heights in the mask are pulled onto benches (risers `riser` m tall, the phase
 * wandering a little so benches follow the contours but never climb a whole riser), skipping the pass corridors.
 * Every riser is a cliff (taller than a walker's 0.75 m climb), so the core of a range cannot be walked.
 */
export function strata(h: Float32Array, M: Float32Array, N: number, n: Noise, riser: number, base: number, keep: Uint8Array) {
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x, m = M[i];
    if (m < 0.2 || keep[i]) continue;
    const v = h[i] - base; if (v < 2.5) continue;
    const ph = n.fbm2(x * 0.02 + 11, z * 0.02 - 4, 2) * 0.35;
    const t = v / riser + ph, f = t - Math.floor(t);
    const terr = (Math.floor(t) + smooth(0.78, 0.97, f) - ph) * riser;
    const k = smooth(0.2, 0.55, m) * smooth(2.5, 6, v) * 0.92;
    h[i] = base + v + (terr - v) * k;
  }
}

/**
 * Grade a pass road into the heightfield: the road follows the ground but never climbs or falls faster than
 * `grade` (m per m), cut down through the saddle as a notch; the road bed (half-width w) is set to that grade and
 * the notch walls beside it are cut back at a steep angle. Writes the corridor into `keep`. Returns the saddle's
 * road height.
 */
export function gradePass(h: Float32Array, N: number, P: P2[], w: number, grade: number, keep: Uint8Array): number {
  // sample the ground along the road at 0.5 m
  const S: { x: number; z: number; s: number }[] = [];
  let acc = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], l = hyp(b[0] - a[0], b[1] - a[1]);
    for (let t = 0; t < l; t += 0.5) S.push({ x: a[0] + ((b[0] - a[0]) * t) / l, z: a[1] + ((b[1] - a[1]) * t) / l, s: acc + t });
    acc += l;
  }
  if (S.length < 4) return 0;
  const gs = (x: number, z: number) => {
    const fx = clamp(x - 0.5, 0, N - 1.001), fz = clamp(z - 0.5, 0, N - 1.001), X = Math.floor(fx), Z = Math.floor(fz), u = fx - X, v = fz - Z;
    return (h[Z * N + X] * (1 - u) + h[Z * N + X + 1] * u) * (1 - v) + (h[(Z + 1) * N + X] * (1 - u) + h[(Z + 1) * N + X + 1] * u) * v;
  };
  const g = S.map((p) => gs(p.x, p.z));
  // a smoothed version of the ground, then the largest profile under it whose slope stays within the grade
  const y = g.map((_, i) => { let s = 0, c = 0; for (let j = Math.max(0, i - 6); j <= Math.min(g.length - 1, i + 6); j++) { s += g[j]; c++; } return Math.min(g[i] + 0.3, s / c); });
  const ds = 0.5 * grade;
  for (let i = 1; i < y.length; i++) y[i] = Math.min(y[i], y[i - 1] + ds);
  for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] + ds);
  // write the road into the cells along it
  const ext = w + 7;
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const p of S) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
  const roadAt = (x: number, z: number): [number, number] => {
    let bd = 1e9, bi = 0;
    for (let i = 0; i < S.length; i += 2) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    for (let i = Math.max(0, bi - 2); i <= Math.min(S.length - 1, bi + 2); i++) { const d = (S[i].x - x) ** 2 + (S[i].z - z) ** 2; if (d < bd) { bd = d; bi = i; } }
    return [Math.sqrt(bd), bi];
  };
  for (let z = Math.max(0, Math.floor(z0 - ext)); z <= Math.min(N - 1, Math.ceil(z1 + ext)); z++)
    for (let x = Math.max(0, Math.floor(x0 - ext)); x <= Math.min(N - 1, Math.ceil(x1 + ext)); x++) {
      const [d, k] = roadAt(x + 0.5, z + 0.5);
      if (d > ext) continue;
      const i = z * N + x, yr = y[k];
      // the ends fade into the valley floor
      if (d < w) { h[i] = h[i] + (yr - h[i]) * smooth(w, w - 1.2, d); keep[i] = 2; }
      else { const wall = yr + (d - w) * 1.35; if (h[i] > wall) h[i] = wall; if (!keep[i]) keep[i] = 1; }
    }
  let top = -1e9; for (const v of y) top = Math.max(top, v);
  return top;
}
