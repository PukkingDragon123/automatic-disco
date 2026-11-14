// Hand-blocked head cages. A skull family is written out as eight cross-section rings, back of the skull to the nose
// plane, with five points per half ring (top, upper side, side, lower side, bottom) placed the way a sculptor blocks
// in planes: brow shelf, orbit, zygomatic arch, cheek, muzzle bridge, whisker pad or tomium, nose plane. The cage is
// mirrored, closed with a back and a nose face, and subdivided twice (Catmull-Clark) with the landmark edges kept
// sharp, so the planes stay crisp and the fill goes soft. Units: x in head widths (hw), y in head heights (hh) about
// the ring's centre line yc, z in head lengths (hl).
import type { SkinB, Region, V3, Wt } from './kit';

export interface Cage {
  z: number[]; yc: number[]; ring: [number, number][][];
  /** sharp edges: the upper loop of these rings (brow shelves), runs of point p from ring r0 to r1, the nose plane's rim */
  crease: { rings: number[]; long: [number, number, number][]; front: boolean };
}
const C = (z: number[], yc: number[], ring: [number, number][][], crease: Cage['crease']): Cage => ({ z, yc, ring, crease });
export const CAGES: Record<string, Cage> = {
  // a cat: domed cranium, the zygomatic arch flaring wide, a hard brow shelf over a deep orbit, a short flat bridge,
  // swollen whisker pads under it and a flat nose plane
  felid: C([-0.2, 0.0, 0.18, 0.32, 0.4, 0.5, 0.6, 0.66], [0.08, 0.2, 0.22, 0.18, 0.1, 0.04, 0.0, -0.03], [
    [[0, 0.42], [0.3, 0.36], [0.42, 0.05], [0.3, -0.3], [0, -0.38]], [[0, 0.56], [0.42, 0.46], [0.6, 0.05], [0.42, -0.4], [0, -0.48]],
    [[0, 0.58], [0.46, 0.44], [0.68, -0.02], [0.44, -0.42], [0, -0.5]], [[0, 0.5], [0.44, 0.44], [0.6, 0.0], [0.42, -0.4], [0, -0.46]],
    [[0, 0.36], [0.3, 0.27], [0.5, -0.04], [0.4, -0.36], [0, -0.42]], [[0, 0.24], [0.2, 0.2], [0.36, -0.06], [0.38, -0.32], [0, -0.38]],
    [[0, 0.2], [0.17, 0.17], [0.32, -0.08], [0.36, -0.3], [0, -0.34]], [[0, 0.16], [0.13, 0.12], [0.24, -0.08], [0.27, -0.26], [0, -0.3]]],
    { rings: [3], long: [[1, 4, 7], [3, 5, 7]], front: true }),
  // a brute or bear: a heavy shelf of brow, the orbit sunk deep under it, a long heavy muzzle with a dropped lip
  brute: C([-0.2, 0.0, 0.16, 0.3, 0.38, 0.52, 0.68, 0.8], [0.1, 0.16, 0.16, 0.14, 0.06, 0.0, -0.04, -0.06], [
    [[0, 0.4], [0.3, 0.34], [0.42, 0.04], [0.3, -0.3], [0, -0.38]], [[0, 0.52], [0.44, 0.44], [0.62, 0.04], [0.44, -0.4], [0, -0.48]],
    [[0, 0.54], [0.5, 0.46], [0.7, 0.0], [0.46, -0.42], [0, -0.5]], [[0, 0.5], [0.52, 0.5], [0.62, 0.02], [0.44, -0.4], [0, -0.46]],
    [[0, 0.3], [0.28, 0.22], [0.5, -0.06], [0.42, -0.38], [0, -0.44]], [[0, 0.26], [0.22, 0.22], [0.36, -0.04], [0.37, -0.33], [0, -0.38]],
    [[0, 0.22], [0.2, 0.2], [0.32, -0.04], [0.33, -0.31], [0, -0.34]], [[0, 0.2], [0.16, 0.16], [0.24, -0.04], [0.25, -0.24], [0, -0.28]]],
    { rings: [3], long: [[1, 4, 7], [3, 5, 7]], front: true }),
  // a deer or bovid: a long narrow face, the eyes high on the sides, a flat bridge running to a soft broad nose
  bovid: C([-0.24, -0.04, 0.14, 0.28, 0.42, 0.62, 0.82, 0.98], [0.08, 0.16, 0.18, 0.12, 0.04, -0.03, -0.06, -0.09], [
    [[0, 0.36], [0.26, 0.3], [0.34, 0.02], [0.26, -0.28], [0, -0.34]], [[0, 0.48], [0.36, 0.42], [0.46, 0.02], [0.36, -0.38], [0, -0.46]],
    [[0, 0.5], [0.4, 0.42], [0.5, 0.0], [0.4, -0.42], [0, -0.48]], [[0, 0.42], [0.36, 0.38], [0.44, 0.0], [0.36, -0.38], [0, -0.44]],
    [[0, 0.32], [0.22, 0.28], [0.32, -0.02], [0.3, -0.34], [0, -0.4]], [[0, 0.27], [0.16, 0.24], [0.24, -0.02], [0.24, -0.3], [0, -0.34]],
    [[0, 0.25], [0.15, 0.22], [0.22, -0.02], [0.22, -0.27], [0, -0.3]], [[0, 0.24], [0.16, 0.2], [0.22, -0.04], [0.2, -0.22], [0, -0.25]]],
    { rings: [], long: [[1, 3, 6], [3, 4, 7]], front: true }),
  // a beaked reptile: a flat broad skull, a ridge over each eye, the beak's cutting edge running to a hooked tip
  reptile: C([-0.24, -0.04, 0.14, 0.28, 0.42, 0.56, 0.7, 0.8], [0.04, 0.1, 0.12, 0.1, 0.04, 0.0, -0.04, -0.08], [
    [[0, 0.32], [0.32, 0.26], [0.38, 0.0], [0.3, -0.26], [0, -0.32]], [[0, 0.4], [0.42, 0.34], [0.5, 0.0], [0.42, -0.34], [0, -0.4]],
    [[0, 0.42], [0.5, 0.42], [0.54, -0.02], [0.46, -0.36], [0, -0.42]], [[0, 0.38], [0.46, 0.38], [0.5, 0.0], [0.42, -0.34], [0, -0.4]],
    [[0, 0.3], [0.34, 0.24], [0.42, -0.02], [0.36, -0.3], [0, -0.36]], [[0, 0.24], [0.22, 0.2], [0.3, -0.04], [0.27, -0.26], [0, -0.3]],
    [[0, 0.16], [0.14, 0.12], [0.18, -0.06], [0.16, -0.22], [0, -0.28]], [[0, 0.02], [0.05, -0.02], [0.07, -0.12], [0.05, -0.22], [0, -0.34]]],
    { rings: [2, 3], long: [[3, 3, 7], [1, 4, 7]], front: false }),
  // a bat: a high domed brain-case, a pushed-in face, wide gape, a short broad nose plane under the noseleaf
  bat: C([-0.22, -0.04, 0.14, 0.28, 0.38, 0.46, 0.53, 0.58], [0.08, 0.17, 0.18, 0.1, 0.0, -0.04, -0.05, -0.06], [
    [[0, 0.4], [0.3, 0.34], [0.42, 0.04], [0.3, -0.3], [0, -0.38]], [[0, 0.52], [0.44, 0.44], [0.58, 0.04], [0.44, -0.4], [0, -0.48]],
    [[0, 0.54], [0.48, 0.44], [0.6, 0.0], [0.46, -0.42], [0, -0.5]], [[0, 0.44], [0.4, 0.38], [0.52, 0.0], [0.42, -0.4], [0, -0.46]],
    [[0, 0.32], [0.28, 0.26], [0.42, -0.04], [0.37, -0.34], [0, -0.4]], [[0, 0.26], [0.22, 0.2], [0.32, -0.06], [0.31, -0.3], [0, -0.34]],
    [[0, 0.22], [0.18, 0.16], [0.26, -0.06], [0.25, -0.26], [0, -0.3]], [[0, 0.2], [0.14, 0.12], [0.2, -0.06], [0.18, -0.22], [0, -0.25]]],
    { rings: [3], long: [[3, 5, 7]], front: true }),
};

/** the stations a lofted head would have (so eyes, lids, helms and paint keep working): z, centre, half-width, half-height */
/** a species' version of a family cage: the muzzle stretched or shortened past the orbit, the brow shelf raised */
export function morphCage(c: Cage, m?: { muzzle?: number; brow?: number }): Cage {
  if (!m) return c;
  const z4 = c.z[4], mu = m.muzzle ?? 1, br = m.brow ?? 1;
  return { ...c, z: c.z.map((z, i) => (i > 4 ? z4 + (z - z4) * mu : z)), ring: c.ring.map((r, i) => (i === 3 ? r.map(([x, y], j) => [x, j <= 1 ? y * br : y] as [number, number]) : r)) };
}
/** the orbit's centre on a cage: between the upper-side and side points, part way from the brow ring to the next */
export function cageOrbit(c: Cage, hl: number, hw: number, hh: number, f = 0.55): [number, number, number] {
  const a = c.ring[3], b = c.ring[4], L = (p: [number, number], q: [number, number]) => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f];
  const p = L(a[1], b[1]), q = L(a[2], b[2]), yc = c.yc[3] + (c.yc[4] - c.yc[3]) * f;
  return [((p[0] + q[0]) / 2) * hw * 0.86, (yc + ((p[1] + q[1]) / 2) * 0.86) * hh, (c.z[3] + (c.z[4] - c.z[3]) * f) * hl];
}
export function cageProfile(c: Cage, hl: number, hw: number, hh: number) {
  return { hz: c.z.map((z) => z * hl), hy: c.yc.map((y, i) => y * hh + ((c.ring[i][0][1] + c.ring[i][4][1]) / 2) * hh), rx: c.ring.map((r) => r[2][0] * hw), ry: c.ring.map((r) => ((r[0][1] - r[4][1]) / 2) * hh) };
}

type Mesh = { V: V3[]; F: number[][]; sharp: Set<string> };
const ek = (a: number, b: number) => (a < b ? a * 65536 + b : b * 65536 + a).toString();
const avg = (P: V3[]): V3 => { let x = 0, y = 0, z = 0; for (const p of P) { x += p[0]; y += p[1]; z += p[2]; } const n = P.length; return [x / n, y / n, z / n]; };
/** one Catmull-Clark step; sharp (and open) edges subdivide as curves of their own, crease vertices follow them */
function catmull(m: Mesh): Mesh {
  const { V, F, sharp } = m, nv = V.length;
  const fp = F.map((f) => avg(f.map((i) => V[i])));
  const E = new Map<string, { a: number; b: number; f: number[] }>();
  F.forEach((f, fi) => f.forEach((a, k) => { const b = f[(k + 1) % f.length], key = ek(a, b); let e = E.get(key); if (!e) E.set(key, (e = { a, b, f: [] })); e.f.push(fi); }));
  const out: V3[] = new Array(nv), epIdx = new Map<string, number>(), NV: V3[] = [];
  const hard = (key: string, e: { f: number[] }) => sharp.has(key) || e.f.length < 2;
  // edge points
  const eps: V3[] = [];
  for (const [key, e] of E) {
    const mid: V3 = [(V[e.a][0] + V[e.b][0]) / 2, (V[e.a][1] + V[e.b][1]) / 2, (V[e.a][2] + V[e.b][2]) / 2];
    eps.push(hard(key, e) ? mid : avg([V[e.a], V[e.b], ...e.f.map((i) => fp[i])]));
    epIdx.set(key, nv + F.length + eps.length - 1);
  }
  // vertex points
  const vf: number[][] = V.map(() => []), ve: string[][] = V.map(() => []);
  F.forEach((f, fi) => f.forEach((v) => vf[v].push(fi)));
  for (const [key, e] of E) { ve[e.a].push(key); ve[e.b].push(key); }
  for (let i = 0; i < nv; i++) {
    const hs = ve[i].filter((k) => hard(k, E.get(k)!));
    if (hs.length >= 3) out[i] = V[i];
    else if (hs.length === 2) { const o = hs.map((k) => { const e = E.get(k)!; return V[e.a === i ? e.b : e.a]; }); out[i] = [0, 1, 2].map((c) => 0.75 * V[i][c] + 0.125 * (o[0][c] + o[1][c])); }
    else {
      const n = ve[i].length, Q = avg(vf[i].map((f) => fp[f])), Rm = avg(ve[i].map((k) => { const e = E.get(k)!; return avg([V[e.a], V[e.b]]); }));
      out[i] = [0, 1, 2].map((c) => (Q[c] + 2 * Rm[c] + (n - 3) * V[i][c]) / n);
    }
  }
  NV.push(...out, ...fp, ...eps);
  const NF: number[][] = [], NS = new Set<string>();
  F.forEach((f, fi) => f.forEach((v, k) => { const nx = f[(k + 1) % f.length], pv = f[(k - 1 + f.length) % f.length]; NF.push([v, epIdx.get(ek(v, nx))!, nv + fi, epIdx.get(ek(pv, v))!]); }));
  for (const key of sharp) { const e = E.get(key); if (!e) continue; const m2 = epIdx.get(key)!; NS.add(ek(e.a, m2)); NS.add(ek(m2, e.b)); }
  return { V: NV, F: NF, sharp: NS };
}

/** build a cage head into the skin builder: subdivided twice, charted by angle round the head and length along it */
export function cageHead(B: SkinB, reg: Region, g: number, c: Cage, head: V3, hl: number, hw: number, hh: number, w: (t: number) => Wt) {
  const R = c.ring.length, P = 8, V: V3[] = [];
  for (let i = 0; i < R; i++) {
    const r = c.ring[i], pts = [r[0], r[1], r[2], r[3], r[4], [-r[3][0], r[3][1]], [-r[2][0], r[2][1]], [-r[1][0], r[1][1]]];
    for (const [x, y] of pts) V.push([head[0] + x * hw, head[1] + (c.yc[i] + y) * hh, head[2] + c.z[i] * hl]);
  }
  const F: number[][] = [], sharp = new Set<string>(), id = (i: number, j: number) => i * P + (((j % P) + P) % P);
  for (let i = 0; i + 1 < R; i++) for (let j = 0; j < P; j++) F.push([id(i, j), id(i, j + 1), id(i + 1, j + 1), id(i + 1, j)]);
  F.push(Array.from({ length: P }, (_, j) => id(0, P - 1 - j)), Array.from({ length: P }, (_, j) => id(R - 1, j)));
  for (const r of c.crease.rings) for (const [a, b] of [[0, 1], [1, 2], [0, 7], [7, 6]]) sharp.add(ek(id(r, a), id(r, b)));
  for (const [p, r0, r1] of c.crease.long) for (let i = r0; i < r1; i++) for (const q of [p, (P - p) % P]) sharp.add(ek(id(i, q), id(i + 1, q)));
  if (c.crease.front) for (let j = 0; j < P; j++) sharp.add(ek(id(R - 1, j), id(R - 1, j + 1)));
  let m: Mesh = { V, F, sharp };
  m = catmull(catmull(m));
  // chart: u = angle round the head's centre line (0 = top), v = along it, as a lofted head would be painted
  const z0 = head[2] + c.z[0] * hl, z1 = head[2] + c.z[R - 1] * hl;
  const ycAt = (z: number) => { const t = (z - head[2]) / hl; for (let i = 0; i + 1 < R; i++) if (t <= c.z[i + 1]) { const f = (t - c.z[i]) / Math.max(1e-6, c.z[i + 1] - c.z[i]); return head[1] + (c.yc[i] + (c.yc[i + 1] - c.yc[i]) * Math.max(0, Math.min(1, f))) * hh; } return head[1] + c.yc[R - 1] * hh; };
  const uvOf = (p: V3): [number, number] => [0.5 + Math.atan2(p[0] - head[0], p[1] - ycAt(p[2])) / (Math.PI * 2), Math.max(0, Math.min(1, (p[2] - z0) / (z1 - z0)))];
  const ctr: V3 = [head[0], head[1], (z0 + z1) / 2];
  for (const f of m.F) for (const tri of [[f[0], f[1], f[2]], [f[0], f[2], f[3]]]) {
    const ps = tri.map((i) => m.V[i]), uv = ps.map(uvOf);
    // a triangle straddling the chart's seam under the chin keeps to one side of it
    if (Math.max(...uv.map((q) => q[0])) - Math.min(...uv.map((q) => q[0])) > 0.5) { const side = uv.filter((q) => q[0] > 0.5).length >= 2 ? 0.999 : 0.001; for (const q of uv) q[0] = side; }
    const ids = ps.map((p, k) => B.vert(p, reg, uv[k][0], uv[k][1], w(uv[k][1]), g));
    B.triOut(ids[0], ids[1], ids[2], ctr);
  }
}

// ================================================================================================ general cage toolkit
// Whole bodies, limbs, plates, toes and fins are blocked in as low-poly control cages written out as data (rings of
// hand-placed points swept along a path), then subdivided (Catmull-Clark) with semi-sharp creases on the landmarks:
// a crease of sharpness s stays hard for s subdivision steps and then relaxes, so a plate rim reads crisp, a skin
// fold reads as a soft ridge. Ring grids survive subdivision, so every swept part keeps a clean (around, along)
// parameterisation for its texture chart.

/** a control cage: points, faces (CCW seen from outside), a tag per face (its texture chart) and a material id per face
 *  (what the painter lays there), edge sharpness, and the edges drawn as ink lines on the page (survive subdivision) */
export interface CM { V: V3[]; F: number[][]; tag: number[]; mat: number[]; sharp: Map<number, number>; ink: Set<number> }
export const newCM = (): CM => ({ V: [], F: [], tag: [], mat: [], sharp: new Map(), ink: new Set() });
export const ekey = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a);
/** crease an edge (sharpness s: hard for s subdivision steps); `ink` also draws it as a line on the texture */
export function crease(m: CM, a: number, b: number, s = 8, ink = false) {
  if (a === b) return;
  const k = ekey(a, b);
  if (s > 0) m.sharp.set(k, Math.max(m.sharp.get(k) ?? 0, s));
  if (ink) m.ink.add(k);
}
/** a ring grid on a cage: v[row][col] point ids, f[row][col] the quad from (row, col) to (row+1, col+1); cols wrap round
 *  a tube, rows close for a ring-shaped path (a torus); caps are the end faces */
export interface Grid { v: number[][]; f: number[][]; wrap: boolean; closed: boolean; caps: number[] }
/** a cross-section ring: centre, its two in-plane axes and the points in that plane */
export interface Ring { c: V3; x: V3; y: V3; pts: number[][] }

const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vnorm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vlerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** Newell normal of a polygon */
export function polyNormal(P: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); }
  return vnorm([x, y, z]);
}

/** a full ring from a half profile (top to bottom down the +x side): it starts at the bottom, climbs the -x side,
 *  crosses the top and comes down the +x side, so the texture seam runs under the belly */
export function mirrorRing(half: number[][]): number[][] {
  const K = half.length, out: number[][] = [];
  for (let i = K - 1; i >= 0; i--) out.push([-half[i][0], half[i][1]]);
  for (let i = 1; i < K - 1; i++) out.push([half[i][0], half[i][1]]);
  return out;
}

/** sweep rings into a tube on the cage: quads between neighbouring rings, optional end caps; faces come out facing
 *  away from the rings' centres whatever order the points were written in */
export function tube(m: CM, rings: Ring[], o: { tag: number; mat?: number; capS?: boolean; capE?: boolean; closed?: boolean; open?: boolean }): Grid {
  const R = rings.length, C = rings[0].pts.length, mat = o.mat ?? 0;
  const v = rings.map((r) => r.pts.map(([x, y]) => { m.V.push([r.c[0] + r.x[0] * x + r.y[0] * y, r.c[1] + r.x[1] * x + r.y[1] * y, r.c[2] + r.x[2] * x + r.y[2] * y]); return m.V.length - 1; }));
  const wrap = !o.open, nr = o.closed ? R : R - 1, nc = wrap ? C : C - 1;
  // which way round: vote over the quads
  let vote = 0;
  for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
    const q = [v[i][j], v[i][(j + 1) % C], v[(i + 1) % R][(j + 1) % C], v[(i + 1) % R][j]].map((k) => m.V[k]);
    const cen = vlerp(rings[i].c, rings[(i + 1) % R].c, 0.5), fc = vscl(vadd(vadd(q[0], q[1]), vadd(q[2], q[3])), 0.25);
    vote += Math.sign(vdot(polyNormal(q), vsub(fc, cen)));
  }
  const flip = vote < 0;
  const f: number[][] = [];
  for (let i = 0; i < nr; i++) {
    const row: number[] = [];
    for (let j = 0; j < nc; j++) {
      const q = [v[i][j], v[i][(j + 1) % C], v[(i + 1) % R][(j + 1) % C], v[(i + 1) % R][j]];
      m.F.push(flip ? q.reverse() : q); m.tag.push(o.tag); m.mat.push(mat); row.push(m.F.length - 1);
    }
    f.push(row);
  }
  const caps: number[] = [];
  const cap = (i: number, out: V3) => {
    let ids = [...v[i]];
    if (vdot(polyNormal(ids.map((k) => m.V[k])), out) < 0) ids = ids.reverse();
    m.F.push(ids); m.tag.push(o.tag); m.mat.push(mat); caps.push(m.F.length - 1);
  };
  if (!o.closed && wrap) {
    if (o.capS) cap(0, vsub(rings[0].c, rings[1].c));
    if (o.capE) cap(R - 1, vsub(rings[R - 1].c, rings[R - 2].c));
  }
  return { v, f, wrap, closed: !!o.closed, caps };
}

/** frames along a path whose rings stand square to it with their x axis held to `side` (bilateral bodies: side = +x) */
export function sideFrames(path: V3[], side: V3 = [1, 0, 0]): { x: V3; y: V3; d: V3 }[] {
  return path.map((_, i) => {
    const d = vnorm(vsub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]));
    let x = vsub(side, vscl(d, vdot(side, d)));
    if (Math.hypot(x[0], x[1], x[2]) < 1e-4) x = vcross(d, [0, 0, 1]);
    x = vnorm(x);
    return { x, y: vnorm(vcross(d, x)), d };
  });
}
/** parallel-transported frames along a path (no twist), starting with `up` as the y axis */
export function pathFrames(path: V3[], up: V3 = [0, 1, 0]): { x: V3; y: V3; d: V3 }[] {
  const out: { x: V3; y: V3; d: V3 }[] = [];
  let y0: V3 | null = null;
  for (let i = 0; i < path.length; i++) {
    const d = vnorm(vsub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]));
    let y = vsub(y0 ?? up, vscl(d, vdot(y0 ?? up, d)));
    if (Math.hypot(y[0], y[1], y[2]) < 1e-4) y = vsub([0, 0, 1], vscl(d, d[2]));
    y = vnorm(y); y0 = y;
    out.push({ d, y, x: vnorm(vcross(y, d)) });
  }
  return out;
}

/** one Catmull-Clark step with semi-sharp creases (DeRose et al.): open edges and edges of sharpness >= 1 subdivide as
 *  curves of their own, fractional sharpness blends the smooth and sharp rules, every crease loses one step of
 *  sharpness; tags, materials and ink lines pass to the children, and the grids are refined to match */
export function subdivide(m: CM, grids: Grid[] = []): CM {
  const { V, F } = m, nv = V.length, nf = F.length;
  const fp: V3[] = F.map((f) => { let x = 0, y = 0, z = 0; for (const i of f) { x += V[i][0]; y += V[i][1]; z += V[i][2]; } return [x / f.length, y / f.length, z / f.length]; });
  const eIdx = new Map<number, number>(), ea: number[] = [], eb: number[] = [], ef: number[][] = [];
  for (let fi = 0; fi < nf; fi++) {
    const f = F[fi];
    for (let k = 0; k < f.length; k++) {
      const a = f[k], b = f[(k + 1) % f.length], key = ekey(a, b);
      let e = eIdx.get(key);
      if (e === undefined) { e = ea.length; eIdx.set(key, e); ea.push(a); eb.push(b); ef.push([]); }
      ef[e].push(fi);
    }
  }
  const ne = ea.length, es = new Float32Array(ne);
  for (let e = 0; e < ne; e++) es[e] = ef[e].length < 2 ? 1e9 : m.sharp.get(ekey(ea[e], eb[e])) ?? 0;
  const out: V3[] = new Array(nv + nf + ne);
  for (let f = 0; f < nf; f++) out[nv + f] = fp[f];
  for (let e = 0; e < ne; e++) {
    const A = V[ea[e]], Bv = V[eb[e]], mid: V3 = [(A[0] + Bv[0]) / 2, (A[1] + Bv[1]) / 2, (A[2] + Bv[2]) / 2], s = es[e];
    if (s >= 1) { out[nv + nf + e] = mid; continue; }
    const f0 = fp[ef[e][0]], f1 = fp[ef[e][1]];
    const sm: V3 = [(A[0] + Bv[0] + f0[0] + f1[0]) / 4, (A[1] + Bv[1] + f0[1] + f1[1]) / 4, (A[2] + Bv[2] + f0[2] + f1[2]) / 4];
    out[nv + nf + e] = s > 0 ? vlerp(sm, mid, s) : sm;
  }
  const vE: number[][] = Array.from({ length: nv }, () => []), vF: number[][] = Array.from({ length: nv }, () => []);
  for (let e = 0; e < ne; e++) { vE[ea[e]].push(e); vE[eb[e]].push(e); }
  for (let f = 0; f < nf; f++) for (const i of F[f]) vF[i].push(f);
  for (let i = 0; i < nv; i++) {
    const P = V[i], ie = vE[i];
    if (!ie.length) { out[i] = P; continue; }
    const n = ie.length;
    let qx = 0, qy = 0, qz = 0;
    for (const f of vF[i]) { qx += fp[f][0]; qy += fp[f][1]; qz += fp[f][2]; }
    const nfv = Math.max(1, vF[i].length); qx /= nfv; qy /= nfv; qz /= nfv;
    let rx = 0, ry = 0, rz = 0;
    for (const e of ie) { const o = V[ea[e] === i ? eb[e] : ea[e]]; rx += (P[0] + o[0]) / 2; ry += (P[1] + o[1]) / 2; rz += (P[2] + o[2]) / 2; }
    rx /= n; ry /= n; rz /= n;
    const smooth: V3 = [(qx + 2 * rx + (n - 3) * P[0]) / n, (qy + 2 * ry + (n - 3) * P[1]) / n, (qz + 2 * rz + (n - 3) * P[2]) / n];
    const sh = ie.filter((e) => es[e] > 0);
    if (sh.length < 2) { out[i] = smooth; continue; }
    const avgS = Math.min(1, sh.reduce((s, e) => s + Math.min(1, es[e]), 0) / sh.length);
    let hard: V3;
    if (sh.length === 2) { const a = V[ea[sh[0]] === i ? eb[sh[0]] : ea[sh[0]]], b = V[ea[sh[1]] === i ? eb[sh[1]] : ea[sh[1]]]; hard = [0.75 * P[0] + 0.125 * (a[0] + b[0]), 0.75 * P[1] + 0.125 * (a[1] + b[1]), 0.75 * P[2] + 0.125 * (a[2] + b[2])]; }
    else hard = P;
    // an open boundary always follows its own curve
    const open = sh.some((e) => ef[e].length < 2);
    out[i] = open || avgS >= 1 ? hard : vlerp(smooth, hard, avgS);
  }
  const N: CM = { V: out, F: [], tag: [], mat: [], sharp: new Map(), ink: new Set() };
  const EP = (a: number, b: number) => nv + nf + eIdx.get(ekey(a, b))!;
  const child0: number[] = new Array(nf);
  for (let f = 0; f < nf; f++) {
    const c = F[f], n = c.length; child0[f] = N.F.length;
    for (let k = 0; k < n; k++) { N.F.push([c[k], EP(c[k], c[(k + 1) % n]), nv + f, EP(c[(k - 1 + n) % n], c[k])]); N.tag.push(m.tag[f]); N.mat.push(m.mat[f]); }
  }
  for (const [key, s] of m.sharp) {
    const e = eIdx.get(key); if (e === undefined || s <= 1) continue;
    const mp = nv + nf + e; N.sharp.set(ekey(ea[e], mp), s - 1); N.sharp.set(ekey(mp, eb[e]), s - 1);
  }
  for (const key of m.ink) { const e = eIdx.get(key); if (e === undefined) continue; const mp = nv + nf + e; N.ink.add(ekey(ea[e], mp)); N.ink.add(ekey(mp, eb[e])); }
  // refine the ring grids: old points at even (row, col), edge points between, face points at odd-odd
  for (const g of grids) {
    const R = g.v.length, C = g.v[0].length, nr = g.f.length, nc = g.f[0]?.length ?? 0;
    const R2 = g.closed ? 2 * R : 2 * (R - 1) + 1, C2 = g.wrap ? 2 * C : 2 * (C - 1) + 1;
    const v2: number[][] = Array.from({ length: R2 }, () => new Array(C2).fill(-1));
    for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
      v2[2 * i][2 * j] = g.v[i][j];
      if (g.wrap || j + 1 < C) v2[2 * i][2 * j + 1] = EP(g.v[i][j], g.v[i][(j + 1) % C]);
      if (g.closed || i + 1 < R) v2[(2 * i + 1) % R2][2 * j] = EP(g.v[i][j], g.v[(i + 1) % R][j]);
    }
    const f2: number[][] = Array.from({ length: nr * 2 }, () => new Array(nc * 2).fill(-1));
    for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
      const f = g.f[i][j]; v2[2 * i + 1][2 * j + 1] = nv + f;
      const corner = (vi: number) => child0[f] + F[f].indexOf(vi);
      f2[2 * i][2 * j] = corner(g.v[i][j]); f2[2 * i][2 * j + 1] = corner(g.v[i][(j + 1) % C]);
      f2[2 * i + 1][2 * j] = corner(g.v[(i + 1) % R][j]); f2[2 * i + 1][2 * j + 1] = corner(g.v[(i + 1) % R][(j + 1) % C]);
    }
    const caps2: number[] = [];
    for (const c of g.caps) for (let k = 0; k < F[c].length; k++) caps2.push(child0[c] + k);
    g.v = v2; g.f = f2; g.caps = caps2;
  }
  return N;
}

/** merge cage b into a (b's grids are re-indexed in place) */
export function mergeCM(a: CM, b: CM, grids: Grid[] = []) {
  const o = a.V.length, fo = a.F.length;
  a.V.push(...b.V);
  for (let i = 0; i < b.F.length; i++) { a.F.push(b.F[i].map((k) => k + o)); a.tag.push(b.tag[i]); a.mat.push(b.mat[i]); }
  for (const [k, s] of b.sharp) { const x = Math.floor(k / 4194304), y = k % 4194304; a.sharp.set(ekey(x + o, y + o), s); }
  for (const k of b.ink) { const x = Math.floor(k / 4194304), y = k % 4194304; a.ink.add(ekey(x + o, y + o)); }
  for (const g of grids) { g.v = g.v.map((r) => r.map((k) => k + o)); g.f = g.f.map((r) => r.map((k) => k + fo)); g.caps = g.caps.map((k) => k + fo); }
}

/** crease a whole ring of a grid (a skin fold running round, a plate rim) */
export function creaseRow(m: CM, g: Grid, i: number, s = 2, ink = false, j0 = 0, j1 = -1) {
  const C = g.v[i].length, end = j1 < 0 ? (g.wrap ? C : C - 1) : j1;
  for (let j = j0; j < end; j++) crease(m, g.v[i][j], g.v[i][(j + 1) % C], s, ink);
}
/** crease a run down a grid column from row i0 to i1 (a lip line, a ridge, the keel of a plate) */
export function creaseCol(m: CM, g: Grid, j: number, i0: number, i1: number, s = 2, ink = false) {
  const R = g.v.length, C = g.v[0].length, jj = ((j % C) + C) % C;
  for (let i = i0; i < i1; i++) crease(m, g.v[i % R][jj], g.v[(i + 1) % R][jj], s, ink);
}
/** Catmull-Rom between key rings: n in-betweens from each key to the next (all keys must have equal point counts) */
export function tweenRings(keys: Ring[], n: number[] | number): Ring[] {
  const out: Ring[] = [], K = keys.length;
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  const crV = (a: V3, b: V3, c: V3, d: V3, t: number): V3 => [0, 1, 2].map((k) => cr(a[k], b[k], c[k], d[k], t));
  for (let i = 0; i < K; i++) {
    out.push(keys[i]);
    if (i + 1 >= K) break;
    const ni = Array.isArray(n) ? n[i] : n;
    const A = keys[Math.max(0, i - 1)], B = keys[i], Cc = keys[i + 1], D = keys[Math.min(K - 1, i + 2)];
    for (let s = 1; s <= ni; s++) {
      const t = s / (ni + 1);
      out.push({ c: crV(A.c, B.c, Cc.c, D.c, t), x: vnorm(vlerp(B.x, Cc.x, t)), y: vnorm(vlerp(B.y, Cc.y, t)), pts: B.pts.map((_, j) => [0, 1].map((k) => cr(A.pts[j][k], B.pts[j][k], Cc.pts[j][k], D.pts[j][k], t))) });
    }
  }
  return out;
}
