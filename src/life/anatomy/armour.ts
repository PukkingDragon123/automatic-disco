// ANATOMY LIBRARY: armour. Hard parts that follow a host's surface: a shell, a carapace band, a helm over a skull,
// a single plate or osteoderm, a row of overlapping plates. Each is a sheet laid over a patch of the host (its ring
// grid's u round and v along), lifted to a thickness profile, with every edge curling down into the host, so it
// sits on the body with real thickness, a crisp creased rim and no gap; shingled plates overlap with their rear lip
// standing proud. Host surfaces are queried after the host is subdivided (Body.finalize).
import type { V3, Wt } from '../kit';
import { newCM, sheetGrid, crease, creaseRow, creaseCol } from '../cage';
import { type Piece, type Chart, type Body, gridSurf } from './core';

export interface ShellSpec {
  name: string; host: Piece; grid?: number;
  /** the patch of the host: u round (0..1, may run past 1 to wrap), v along (0..1) */
  u: [number, number]; v: [number, number];
  /** cage resolution across and along (edges add two curled rows/cols each) */
  nu: number; nv: number;
  /** height above the host at (a across 0..1, b along 0..1), metres */
  lift: (a: number, b: number) => number;
  /** how far the curled edges sink into the host (m) */
  sink?: number;
  /** which edges curl down (all by default): a0, a1 (the sides), b0, b1 (front and rear) */
  curl?: { a0?: boolean; a1?: boolean; b0?: boolean; b1?: boolean };
  /** rim crease sharpness, keel and ridge columns (fractions across), growth-ring rows (fractions along) */
  rim?: number; ridges?: number[]; rings?: number[];
  /** sideways tilt of the plate's normal (lean the rear lip back along the host) */
  skin: (p: V3) => Wt;
  paint: (c: Chart, p: Piece, b: Body) => void;
  levels?: number; k?: number; mat?: number;
}
/** a hard sheet seated on a patch of a host's surface */
export function shell(s: ShellSpec): Piece {
  const host = s.host, g = host.grids[s.grid ?? 0], m = newCM(), sink = s.sink ?? 0;
  const cu = s.curl ?? {}, A0 = cu.a0 !== false, A1 = cu.a1 !== false, B0 = cu.b0 !== false, B1 = cu.b1 !== false;
  const us: number[] = [], vs: number[] = [];
  // across: a curled column at each side, then nu+1 columns over the top
  const across: [number, number][] = []; // [a, kind: 0 top, -1 curl]
  if (A0) across.push([0, -1]);
  for (let i = 0; i <= s.nu; i++) across.push([i / s.nu, 0]);
  if (A1) across.push([1, -1]);
  const along: [number, number][] = [];
  if (B0) along.push([0, -1]);
  for (let i = 0; i <= s.nv; i++) along.push([i / s.nv, 0]);
  if (B1) along.push([1, -1]);
  const P: V3[][] = along.map(([b, kb]) => across.map(([a, ka]) => {
    const u = s.u[0] + (s.u[1] - s.u[0]) * a, v = s.v[0] + (s.v[1] - s.v[0]) * b, q = gridSurf(host.m, g, u, v);
    const curl = ka < 0 || kb < 0;
    // a curled edge: tucked a little in under the rim and sunk into the host
    const h = curl ? -sink : s.lift(a, b);
    let p: V3 = [q.p[0] + q.n[0] * h, q.p[1] + q.n[1] * h, q.p[2] + q.n[2] * h];
    if (curl) {
      const ia = ka < 0 ? (a < 0.5 ? 1 : -1) : 0, ib = kb < 0 ? (b < 0.5 ? 1 : -1) : 0, lh = s.lift(Math.min(1, Math.max(0, a)), Math.min(1, Math.max(0, b)));
      p = [p[0] + (q.du[0] * ia + q.dv[0] * ib) * lh * 0.35, p[1] + (q.du[1] * ia + q.dv[1] * ib) * lh * 0.35, p[2] + (q.du[2] * ia + q.dv[2] * ib) * lh * 0.35];
    }
    return p;
  }));
  void us; void vs;
  const out = (p: V3) => { const c = gridSurf(host.m, g, (s.u[0] + s.u[1]) / 2, (s.v[0] + s.v[1]) / 2).p; let best = c; void best; return outward(p, host, g, s); };
  const G = sheetGrid(m, P, { tag: 0, mat: s.mat, out });
  const R = P.length, C = P[0].length, rim = s.rim ?? 2;
  // the curled edges carry material 1 (the plate's thickness: painters draw it as a dark edge)
  for (let i = 0; i + 1 < R; i++) for (let j = 0; j + 1 < C; j++) if ((A0 && j === 0) || (A1 && j === C - 2) || (B0 && i === 0) || (B1 && i === R - 2)) m.mat[G.f[i][j]] = (s.mat ?? 0) + 1;
  // the rim: where the top meets the curled edge
  if (A0) creaseCol(m, G, 1, 0, R - 1, rim, true);
  if (A1) creaseCol(m, G, C - 2, 0, R - 1, rim, true);
  if (B0) creaseRow(m, G, 1, rim, true);
  if (B1) creaseRow(m, G, R - 2, rim, true);
  for (const f of s.ridges ?? []) creaseCol(m, G, (A0 ? 1 : 0) + Math.round(f * s.nu), 0, R - 1, 1, true);
  for (const f of s.rings ?? []) creaseRow(m, G, (B0 ? 1 : 0) + Math.round(f * s.nv), 1, true);
  void crease;
  return { name: s.name, m, grids: [G], levels: s.levels ?? 2, skin: s.skin, paint: s.paint, k: s.k };
}
/** the host's outward normal near a point (for facing the sheet) */
function outward(p: V3, host: Piece, g: Piece['grids'][number], s: ShellSpec): V3 {
  // sample the patch centre's normal, good enough for a patch that is not wrapped all the way round
  const best = gridSurf(host.m, g, (s.u[0] + s.u[1]) / 2, (s.v[0] + s.v[1]) / 2);
  const d: V3 = [p[0] - best.p[0], p[1] - best.p[1], p[2] - best.p[2]];
  const dn = d[0] * best.n[0] + d[1] * best.n[1] + d[2] * best.n[2];
  // points far round a wide patch: use the direction from the host's spine (the patch centre pushed in)
  const ctr: V3 = [best.p[0] - best.n[0] * 3, best.p[1] - best.n[1] * 3, best.p[2] - best.n[2] * 3];
  void dn;
  return [p[0] - ctr[0], p[1] - ctr[1], p[2] - ctr[2]];
}

/** a dome profile for shells: highest in the middle across, a lip standing at the rear (b near 1) */
export const domeLift = (h: number, lip = 0.3, edge = 0.25) => (a: number, b: number) => {
  const x = Math.abs(a - 0.5) * 2, across = Math.cos(Math.min(1, x) * Math.PI / 2) ** 0.6;
  const lipK = b > 0.82 ? 1 + lip * ((b - 0.82) / 0.18) : 1;
  return h * (edge + (1 - edge) * across) * lipK * (0.85 + 0.15 * Math.sin(Math.PI * b));
};

/** rows of plates shingled down a host: each plate a small shell lying back along v with its tip lifted */
export function plateRows(o: {
  name: string; host: Piece; grid?: number;
  /** rows along v (fractions), plates per row and the u span they cover */
  rows: number[]; perRow: (row: number) => number; u: [number, number];
  /** plate size along (v units) and across (fraction of its slot), height */
  len: number; wid?: number; h: number;
  skin: (p: V3) => Wt; paint: (c: Chart, p: Piece, b: Body) => void; k?: number; offset?: boolean;
}): Piece[] {
  const out: Piece[] = [];
  o.rows.forEach((v, r) => {
    const n = o.perRow(r), span = o.u[1] - o.u[0], slot = span / n, off = o.offset !== false && r & 1 ? slot * 0.5 : 0;
    for (let i = 0; i < n; i++) {
      const uc = o.u[0] + slot * (i + 0.5) + off, w = slot * (o.wid ?? 0.9) * 0.5;
      if (uc - w < o.u[0] - slot * 0.2 || uc + w > o.u[1] + slot * 0.2) continue;
      out.push(shell({ name: `${o.name}${r}_${i}`, host: o.host, grid: o.grid, u: [uc - w, uc + w], v: [v, v + o.len], nu: 3, nv: 3, rim: 2,
        lift: (a, b) => o.h * (0.35 + 0.65 * b) * Math.cos((a - 0.5) * 2 * Math.PI / 2.4) ** 0.5, curl: { b1: true, b0: true }, sink: o.h * 0.4, ridges: [0.5],
        skin: o.skin, paint: o.paint, k: o.k, levels: 1 }));
    }
  });
  return out;
}
