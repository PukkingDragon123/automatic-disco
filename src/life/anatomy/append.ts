// ANATOMY LIBRARY: appendages and organs. Horns and tusks (curved tapering cages with growth rings), rayed fins,
// sails, frills, gill fans and tail fans (a fan of bony rays with a thinner membrane between them, a scalloped rim),
// tentacles and barbels (tapering tubes along a curve, optionally with sucker rings), sacs and bladders (a balloon
// seated in the skin), photophore bulbs (small glowing lenses), spines and quills. All are seated by the caller on a
// host point and normal (gridSurf), rooted below the skin so they grow out of it.
import type { V3, Wt } from '../kit';
import { newCM, tube, creaseRow, creaseCol, sheetGrid, pathFrames, type Ring, type CM, type Grid } from '../cage';
import type { Piece, Chart, Body } from './core';

const TAU = Math.PI * 2;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
type Paint = (c: Chart, p: Piece, b: Body) => void;

/** a Catmull-Rom path through control points, n samples */
export function curve(ctrl: V3[], n: number): V3[] {
  const out: V3[] = [], P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let k = 0; k < n; k++) {
    const f = (k / (n - 1)) * (ctrl.length - 1), i = Math.min(ctrl.length - 2, Math.floor(f)), t = f - i;
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    out.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t * t + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t * t * t)));
  }
  return out;
}

/** a tapering tube along a path: radius by t, section by angle (keel, flattening), rings creased every `rings` */
export function stalk(o: {
  name: string; path: V3[]; r: (t: number) => number; around?: number;
  /** section shape: radius multiplier by angle (0 = the frame's y side) */
  sec?: (a: number, t: number) => number; up?: V3;
  /** growth-ring creases every n path stations; a keel crease down column 0 */
  ringEvery?: number; keel?: boolean; capS?: boolean; capE?: boolean;
  skin: (p: V3) => Wt; paint: Paint; levels?: number; k?: number; mat?: number;
}): Piece {
  const m = newCM(), C = o.around ?? 8, fr = pathFrames(o.path, o.up ?? [0, 1, 0]), n = o.path.length;
  const rings: Ring[] = o.path.map((c, i) => {
    const t = i / (n - 1), r = o.r(t);
    return { c, x: fr[i].x, y: fr[i].y, pts: Array.from({ length: C }, (_, j) => { const a = (j / C) * TAU, k = o.sec ? o.sec(a, t) : 1; return [Math.sin(a) * r * k, Math.cos(a) * r * k]; }) };
  });
  const g = tube(m, rings, { tag: 0, capS: o.capS ?? false, capE: o.capE ?? true, mat: o.mat });
  if (o.ringEvery) for (let i = o.ringEvery; i < n - 1; i += o.ringEvery) creaseRow(m, g, i, 1, true);
  if (o.keel) creaseCol(m, g, 0, 0, n - 1, 2, true);
  return { name: o.name, m, grids: [g], levels: o.levels ?? 2, skin: o.skin, paint: o.paint, k: o.k };
}
/** a horn: rooted under the skin at `base`, sweeping through `ctrl`, ringed, keeled, tapering to a point */
export function horn(o: { name: string; ctrl: V3[]; r0: number; skin: (p: V3) => Wt; paint: Paint; flat?: number; rings?: number; k?: number }) {
  const path = curve(o.ctrl, 10);
  return stalk({ name: o.name, path, r: (t) => o.r0 * Math.pow(1 - t * 0.94, 0.9) + o.r0 * 0.02, around: 8, sec: (a) => (Math.cos(a) > 0.7 ? 1.12 : 1) * (Math.abs(Math.sin(a)) > 0.7 ? o.flat ?? 0.85 : 1), ringEvery: o.rings ?? 2, keel: true, skin: o.skin, paint: o.paint, k: o.k });
}

/** a rayed fin, sail or frill: `rays` bony rays run from points along a base line out to their tips; the membrane
 *  between them is thinner and its rim scallops back between the rays. The cage is a flat closed tube (top face
 *  across the rays, back along the bottom face) swept from the base to the rim. */
export interface FinSpec {
  name: string;
  /** ray roots (a polyline along the body) and each ray's direction and length */
  roots: V3[]; dirs: V3[]; lens: number[];
  /** the fin's side (normal) direction at each ray */
  side: V3[];
  /** thickness of a ray and of the membrane at the root (m), scallop depth of the rim (fraction) */
  ray: number; web: number; scallop?: number;
  /** stations from root to rim */
  steps?: number;
  /** curl of the rays toward their side (droop), per unit length */
  droop?: number;
  skin: (p: V3, ray: number, f: number) => Wt; paint: Paint; levels?: number; k?: number;
}
export function fin(o: FinSpec): Piece {
  const m = newCM(), N = o.roots.length, S = o.steps ?? 5, sc = o.scallop ?? 0.12;
  // across: ray, mid-web, ray, ... (2N-1 points), then back along the other face
  const rows: V3[][] = [];
  for (let s = 0; s <= S; s++) {
    const f = s / S, top: V3[] = [], bot: V3[] = [];
    for (let k = 0; k < 2 * N - 1; k++) {
      const isRay = k % 2 === 0, a = Math.floor(k / 2), b = Math.min(N - 1, a + (isRay ? 0 : 1)), t = isRay ? 0 : 0.5;
      const root = lerp(o.roots[a], o.roots[b], t), dir = nrm(lerp(o.dirs[a], o.dirs[b], t)), L = o.lens[a] + (o.lens[b] - o.lens[a]) * t, sd = nrm(lerp(o.side[a], o.side[b], t));
      const reach = isRay ? f : f * (1 - sc * Math.pow(f, 3));
      const droop = (o.droop ?? 0) * L * reach * reach;
      const c = add(add(root, scl(dir, L * reach)), scl(sd, -droop));
      const th = (isRay ? o.ray : o.web) * (1 - f * 0.75) + 0.0005;
      top.push(add(c, scl(sd, th))); bot.push(sub(c, scl(sd, th)));
    }
    rows.push([...top, ...bot.reverse()]);
  }
  const cen = (p: V3) => p; void cen;
  // facing: away from the fin's mid-plane on each face
  const mid = o.roots[Math.floor(N / 2)], sd0 = o.side[Math.floor(N / 2)];
  const G = sheetGrid(m, rows, { tag: 0, out: (p) => { const d = sub(p, mid); return scl(sd0, d[0] * sd0[0] + d[1] * sd0[1] + d[2] * sd0[2] >= 0 ? 1 : -1); }, wrapCols: true, capE: true });
  // ray ridges
  for (let k = 0; k < 2 * N - 1; k += 2) { creaseCol(m, G, k, 0, S, 1, true); creaseCol(m, G, 4 * N - 3 - k, 0, S, 1, true); }
  creaseRow(m, G, S, 2, true);
  const ws = new Map<number, [number, number]>();
  G.v.forEach((row, s) => row.forEach((vi, j) => { const k = j < 2 * N - 1 ? j : 4 * N - 3 - j; ws.set(vi, [Math.round(k / 2), s / S]); }));
  const skinFn = o.skin;
  return { name: o.name, m, grids: [G], levels: o.levels ?? 1, k: o.k, paint: o.paint, skin: (p) => skinFn(p, 0, 0), noOcc: true, ...{ rayOf: ws } } as Piece;
}

/** a balloon seated in the skin (throat sac, air sac, egg-like bladder): `n` its outward normal at the seat */
export function sac(o: { name: string; at: V3; n: V3; r: [number, number, number]; up?: V3; skin: (p: V3) => Wt; paint: Paint; sink?: number; k?: number; levels?: number }): Piece {
  const m = newCM(), ax = nrm(o.n), side = nrm(crs(o.up ?? [0, 0, 1], ax)), up = crs(ax, side);
  const rings: Ring[] = [];
  const st = [-0.3, 0.0, 0.35, 0.68, 0.9, 1.0];
  for (const f of st) {
    const k = f < 0 ? 0.92 : Math.sqrt(Math.max(0.04, 1 - (f * 2 - 1) ** 2)) * (f < 0.2 ? 0.96 : 1);
    rings.push({ c: add(o.at, scl(ax, (f - (o.sink ?? 0.15)) * o.r[2] * 2)), x: side, y: up, pts: Array.from({ length: 8 }, (_, j) => { const a = (j / 8) * TAU; return [Math.sin(a) * o.r[0] * k, Math.cos(a) * o.r[1] * k]; }) });
  }
  const g = tube(m, rings, { tag: 0, capE: true });
  return { name: o.name, m, grids: [g], levels: o.levels ?? 2, skin: o.skin, paint: o.paint, k: o.k };
}
/** small bulbs (photophores, warts, barnacle cones, lichen cups) at many seats, one piece */
export function bulbs(o: { name: string; seats: { p: V3; n: V3; r: number; h?: number; cone?: boolean; up?: V3 }[]; skin: (p: V3) => Wt; paint: Paint; levels?: number; k?: number; around?: number }): Piece {
  const m: CM = newCM(), grids: Grid[] = [], C = o.around ?? 6;
  for (const s of o.seats) {
    const ax = nrm(s.n), side = nrm(crs(Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], ax)), up = crs(ax, side), h = s.h ?? s.r;
    // a cone opens at the top (barnacle), a bulb domes over
    const prof: [number, number][] = s.cone ? [[-0.4, 1.05], [0.1, 1.0], [0.75, 0.62], [1.0, 0.52], [0.8, 0.3]] : [[-0.4, 0.9], [0.05, 1.0], [0.55, 0.88], [0.9, 0.5], [1.0, 0.12]];
    const rings: Ring[] = prof.map(([f, k]) => ({ c: add(s.p, scl(ax, f * h)), x: side, y: up, pts: Array.from({ length: C }, (_, j) => { const a = (j / C) * TAU + 0.3; return [Math.sin(a) * s.r * k, Math.cos(a) * s.r * k]; }) }));
    const g = tube(m, rings, { tag: 0, capE: true });
    if (s.cone) creaseRow(m, g, 3, 2, true);
    grids.push(g);
  }
  return { name: o.name, m, grids, levels: o.levels ?? 1, skin: o.skin, paint: o.paint, k: o.k, noOcc: true };
}
/** a quill or thorn: a short straight cone */
export function spine(o: { name: string; at: V3; dir: V3; len: number; r: number; skin: (p: V3) => Wt; paint: Paint; k?: number }) {
  return stalk({ name: o.name, path: [sub(o.at, scl(nrm(o.dir), o.r)), o.at, add(o.at, scl(nrm(o.dir), o.len * 0.5)), add(o.at, scl(nrm(o.dir), o.len))], r: (t) => o.r * (1 - t * 0.96) + 0.001, around: 6, skin: o.skin, paint: o.paint, levels: 1, k: o.k });
}
export { sub, add, scl, nrm, crs, lerp };
