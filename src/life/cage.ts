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
    [[0, 0.42], [0.48, 0.36], [0.54, -0.02], [0.46, -0.36], [0, -0.42]], [[0, 0.38], [0.44, 0.34], [0.5, 0.0], [0.42, -0.34], [0, -0.4]],
    [[0, 0.3], [0.34, 0.24], [0.42, -0.02], [0.36, -0.3], [0, -0.36]], [[0, 0.24], [0.24, 0.2], [0.32, -0.04], [0.28, -0.26], [0, -0.3]],
    [[0, 0.18], [0.16, 0.14], [0.22, -0.04], [0.2, -0.2], [0, -0.24]], [[0, 0.1], [0.08, 0.06], [0.12, -0.06], [0.1, -0.16], [0, -0.2]]],
    { rings: [2], long: [[3, 3, 7]], front: false }),
  // a bat: a high domed brain-case, a pushed-in face, wide gape, a short broad nose plane under the noseleaf
  bat: C([-0.22, -0.04, 0.14, 0.28, 0.38, 0.46, 0.53, 0.58], [0.08, 0.17, 0.18, 0.1, 0.0, -0.04, -0.05, -0.06], [
    [[0, 0.4], [0.3, 0.34], [0.42, 0.04], [0.3, -0.3], [0, -0.38]], [[0, 0.52], [0.44, 0.44], [0.58, 0.04], [0.44, -0.4], [0, -0.48]],
    [[0, 0.54], [0.48, 0.44], [0.6, 0.0], [0.46, -0.42], [0, -0.5]], [[0, 0.44], [0.4, 0.38], [0.52, 0.0], [0.42, -0.4], [0, -0.46]],
    [[0, 0.32], [0.28, 0.26], [0.42, -0.04], [0.37, -0.34], [0, -0.4]], [[0, 0.26], [0.22, 0.2], [0.32, -0.06], [0.31, -0.3], [0, -0.34]],
    [[0, 0.22], [0.18, 0.16], [0.26, -0.06], [0.25, -0.26], [0, -0.3]], [[0, 0.2], [0.14, 0.12], [0.2, -0.06], [0.18, -0.22], [0, -0.25]]],
    { rings: [3], long: [[3, 5, 7]], front: true }),
};

/** the stations a lofted head would have (so eyes, lids, helms and paint keep working): z, centre, half-width, half-height */
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
