// Baking subdivided cages into a skinned, painted model. Each part (a subdivided cage) is cut into texture charts:
// a swept part unrolls by its ring grid (u round the rings, seam under the belly or on the inner side of a limb,
// v along the sweep, both by arc length), a cap or a flat plate projects onto its own plane. Charts become regions
// of one page, sized in metres so the texel density is even. Every chart is then rasterised into a surface buffer
// (per texel: the 3D point, the normal, the curvature, how occluded it is, and which material the face carries), so
// the painter shades and marks the texture from the real anatomy: planes lit from the upper left, creases dark,
// ridges catching a highlight edge, armpits and the skin under a shell's rim in shadow.
import { Page, SkinB, type Region, type V3, type Wt } from '../kit';
import { type CM, type Grid } from '../cage';

export interface Chart {
  name: string; k: number; faces: number[];
  /** region-local (u, v) of corner c of face f */
  uv: (f: number, c: number) => [number, number];
  /** size in metres (for the region request) */
  wm: number; hm: number;
  reg?: Region; gb?: GBuf;
  /** u wraps round (a tube): painters may read across the seam */
  wrap: boolean;
}
export interface Part {
  name: string; m: CM; charts: Chart[];
  /** skin weights of a point of this part */
  w: (p: V3) => Wt;
  g: number;
  N?: V3[]; K?: Float32Array; A?: Float32Array;
}
/** the surface under every texel of a chart */
export interface GBuf {
  w: number; h: number;
  P: Float32Array; N: Float32Array; K: Float32Array; A: Float32Array;
  /** material id + 1 (0 = no surface here) */
  M: Uint8Array;
  /** final face id under the texel (-1 none) */
  F: Int32Array;
}

const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** a chart unrolled from a ring grid; faces are the grid's quads (caps go to their own planar charts) */
export function gridChart(m: CM, g: Grid, name: string, k = 1, rows?: [number, number]): Chart {
  const R = g.v.length, C = g.v[0].length;
  const i0 = rows ? rows[0] : 0, i1 = rows ? rows[1] : R - 1;
  const U: number[][] = [], circ: number[] = [];
  for (let i = 0; i < R; i++) {
    const cum = [0];
    for (let j = 1; j < C; j++) cum.push(cum[j - 1] + dist(m.V[g.v[i][j - 1]], m.V[g.v[i][j]]));
    const tot = cum[C - 1] + (g.wrap ? dist(m.V[g.v[i][C - 1]], m.V[g.v[i][0]]) : 0) || 1e-6;
    U.push(cum.map((c) => c / tot)); circ.push(tot);
  }
  // along: mean arc length down the columns, from row i0 to i1
  const along = new Array(R).fill(0);
  for (let j = 0; j < C; j++) { let s = 0; for (let i = i0 + 1; i <= i1; i++) { s += dist(m.V[g.v[i - 1][j]], m.V[g.v[i][j]]); along[i] += s / C; } }
  const tot = along[i1] || 1e-6;
  const Vr = along.map((a) => a / tot);
  const at = new Map<number, [number, number]>();
  for (let i = i0; i <= i1; i++) for (let j = 0; j < C; j++) if (!at.has(g.v[i][j])) at.set(g.v[i][j], [i, j]);
  const faces: number[] = [];
  for (let i = i0; i < i1; i++) for (let j = 0; j < g.f[i].length; j++) faces.push(g.f[i][j]);
  let wm = 0; for (let i = i0; i <= i1; i++) wm = Math.max(wm, circ[i]);
  return {
    name, k, faces, wm, hm: tot, wrap: g.wrap,
    uv: (f, c) => {
      const F = m.F[f], [i, j] = at.get(F[c])!;
      let u = U[i][j];
      // a face across the seam: its corners on column 0 take u = 1
      if (g.wrap && j === 0 && F.some((q) => { const p = at.get(q); return p !== undefined && p[1] > C / 2; })) u = 1;
      return [u, Vr[i]];
    },
  };
}
/** a chart projected onto a plane (caps, plates seen from above): `ax`, `ay` the plane's axes */
export function planarChart(m: CM, faces: number[], name: string, ax: V3, ay: V3, k = 1, pad = 0.02): Chart {
  const ids = new Set<number>(); for (const f of faces) for (const i of m.F[f]) ids.add(i);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const pr = new Map<number, [number, number]>();
  for (const i of ids) { const p = m.V[i], x = p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2], y = p[0] * ay[0] + p[1] * ay[1] + p[2] * ay[2]; pr.set(i, [x, y]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const wm = Math.max(1e-4, x1 - x0) * (1 + pad * 2), hm = Math.max(1e-4, y1 - y0) * (1 + pad * 2);
  return {
    name, k, faces, wm, hm, wrap: false,
    uv: (f, c) => { const [x, y] = pr.get(m.F[f][c])!; return [pad / (1 + 2 * pad) + ((x - x0) / Math.max(1e-6, x1 - x0)) / (1 + 2 * pad), pad / (1 + 2 * pad) + ((y - y0) / Math.max(1e-6, y1 - y0)) / (1 + 2 * pad)]; },
  };
}

/** smooth vertex normals and a curvature (+ ridge, - valley, in units of the local edge length) for a part */
export function surfaceInfo(p: Part) {
  const { V, F } = p.m, n = V.length, N: V3[] = V.map(() => [0, 0, 0]), nb: Set<number>[] = V.map(() => new Set());
  for (const f of F) {
    for (let k = 0; k < f.length; k++) { nb[f[k]].add(f[(k + 1) % f.length]); nb[f[(k + 1) % f.length]].add(f[k]); }
    for (let k = 1; k + 1 < f.length; k++) {
      const a = V[f[0]], b = V[f[k]], c = V[f[k + 1]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const i of [f[0], f[k], f[k + 1]]) { N[i][0] += nx; N[i][1] += ny; N[i][2] += nz; }
    }
  }
  for (const v of N) { const l = Math.hypot(v[0], v[1], v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; }
  const K = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = nb[i]; if (!s.size) continue;
    let x = 0, y = 0, z = 0, el = 0;
    for (const j of s) { x += V[j][0]; y += V[j][1]; z += V[j][2]; el += dist(V[i], V[j]); }
    x = x / s.size - V[i][0]; y = y / s.size - V[i][1]; z = z / s.size - V[i][2]; el /= s.size;
    K[i] = -(x * N[i][0] + y * N[i][1] + z * N[i][2]) / Math.max(1e-6, el);
  }
  p.N = N; p.K = K;
}

/** ambient occlusion per vertex over all parts: rays marched through a voxel grid of the whole model */
export function occlusion(parts: Part[], res = 72, reach = 0.22, rays = 14) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of parts) for (const v of p.m.V) { x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); z0 = Math.min(z0, v[2]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); z1 = Math.max(z1, v[2]); }
  const span = Math.max(x1 - x0, y1 - y0, z1 - z0) * 1.02 + 1e-6, cs = span / res, nx = Math.ceil((x1 - x0) / cs) + 2, ny = Math.ceil((y1 - y0) / cs) + 2, nz = Math.ceil((z1 - z0) / cs) + 2;
  const occ = new Uint8Array(nx * ny * nz), cell = (x: number, y: number, z: number) => { const i = Math.floor((x - x0) / cs) + 1, j = Math.floor((y - y0) / cs) + 1, k = Math.floor((z - z0) / cs) + 1; return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : (k * ny + j) * nx + i; };
  // voxelise the surfaces densely enough that no cell is skipped
  for (const p of parts) for (const f of p.m.F) for (let k = 1; k + 1 < f.length; k++) {
    const a = p.m.V[f[0]], b = p.m.V[f[k]], c = p.m.V[f[k + 1]], s = Math.max(2, Math.ceil(Math.max(dist(a, b), dist(a, c), dist(b, c)) / (cs * 0.5)));
    for (let u = 0; u <= s; u++) for (let v = 0; v + u <= s; v++) { const U = u / s, Vv = v / s, W = 1 - U - Vv, q = cell(a[0] * W + b[0] * U + c[0] * Vv, a[1] * W + b[1] * U + c[1] * Vv, a[2] * W + b[2] * U + c[2] * Vv); if (q >= 0) occ[q] = 1; }
  }
  // ray directions: a fixed fan over the hemisphere (cosine weighted), turned onto each normal
  const dirs: V3[] = [];
  for (let i = 0; i < rays; i++) { const t = (i + 0.5) / rays, r = Math.sqrt(t), a = i * 2.39996; dirs.push([r * Math.cos(a), Math.sqrt(1 - t), r * Math.sin(a)]); }
  const steps = Math.max(4, Math.round((reach * res))), skip = 1.6;
  for (const p of parts) {
    const A = new Float32Array(p.m.V.length);
    p.m.V.forEach((v, i) => {
      const n = p.N![i];
      const t1: V3 = Math.abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [0, -n[2], n[1]], l1 = Math.hypot(t1[0], t1[1], t1[2]) || 1; t1[0] /= l1; t1[1] /= l1; t1[2] /= l1;
      const t2: V3 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
      let hit = 0;
      for (const d of dirs) {
        const dx = t1[0] * d[0] + n[0] * d[1] + t2[0] * d[2], dy = t1[1] * d[0] + n[1] * d[1] + t2[1] * d[2], dz = t1[2] * d[0] + n[2] * d[1] + t2[2] * d[2];
        for (let s = 0; s < steps; s++) {
          const r = (skip + s) * cs, q = cell(v[0] + dx * r, v[1] + dy * r, v[2] + dz * r);
          if (q < 0) break;
          if (occ[q]) { hit += 1 - s / steps * 0.5; break; }
        }
      }
      A[i] = hit / rays;
    });
    p.A = A;
  }
}

/** rasterise each chart of a part into its surface buffer */
export function rasterPart(p: Part) {
  const { V, F } = p.m, N = p.N!, K = p.K!, A = p.A ?? new Float32Array(V.length);
  for (const ch of p.charts) {
    const r = ch.reg!, w = r.w, h = r.h, n = w * h;
    const gb: GBuf = ch.gb = { w, h, P: new Float32Array(n * 3), N: new Float32Array(n * 3), K: new Float32Array(n), A: new Float32Array(n), M: new Uint8Array(n), F: new Int32Array(n).fill(-1) };
    const best = new Float32Array(n).fill(-1e9);
    for (const f of ch.faces) {
      const c = F[f], uv = c.map((_, k) => ch.uv(f, k)), mat = p.m.mat[f] + 1;
      for (let k = 1; k + 1 < c.length; k++) {
        const ids = [0, k, k + 1], X = ids.map((q) => uv[q][0] * w), Y = ids.map((q) => uv[q][1] * h), vi = ids.map((q) => c[q]);
        const xa = Math.floor(Math.min(...X) - 0.5), xb = Math.ceil(Math.max(...X) + 0.5), ya = Math.max(0, Math.floor(Math.min(...Y) - 0.5)), yb = Math.min(h - 1, Math.ceil(Math.max(...Y) + 0.5));
        const det = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]);
        if (Math.abs(det) < 1e-9) continue;
        for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
          const px = x + 0.5, py = y + 0.5;
          const b1 = ((px - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (py - Y[0])) / det, b2 = ((X[1] - X[0]) * (py - Y[0]) - (px - X[0]) * (Y[1] - Y[0])) / det, b0 = 1 - b1 - b2;
          const inside = Math.min(b0, b1, b2);
          const xx = ((x % w) + w) % w, i = y * w + xx;
          // texels whose centre falls just outside every triangle still take the nearest one (no holes on chart edges)
          if (inside < -0.35 || inside <= best[i]) continue;
          best[i] = inside;
          const bb = [Math.max(0, b0), Math.max(0, b1), Math.max(0, b2)], bs = bb[0] + bb[1] + bb[2];
          let nx = 0, ny = 0, nz = 0;
          for (let q = 0; q < 3; q++) {
            const t = bb[q] / bs, P = V[vi[q]], Nn = N[vi[q]];
            gb.P[i * 3] += 0; nx += Nn[0] * t; ny += Nn[1] * t; nz += Nn[2] * t;
          }
          const P0 = V[vi[0]], P1 = V[vi[1]], P2 = V[vi[2]], t0 = bb[0] / bs, t1 = bb[1] / bs, t2 = bb[2] / bs;
          gb.P[i * 3] = P0[0] * t0 + P1[0] * t1 + P2[0] * t2; gb.P[i * 3 + 1] = P0[1] * t0 + P1[1] * t1 + P2[1] * t2; gb.P[i * 3 + 2] = P0[2] * t0 + P1[2] * t1 + P2[2] * t2;
          const nl = Math.hypot(nx, ny, nz) || 1;
          gb.N[i * 3] = nx / nl; gb.N[i * 3 + 1] = ny / nl; gb.N[i * 3 + 2] = nz / nl;
          gb.K[i] = K[vi[0]] * t0 + K[vi[1]] * t1 + K[vi[2]] * t2;
          gb.A[i] = A[vi[0]] * t0 + A[vi[1]] * t1 + A[vi[2]] * t2;
          gb.M[i] = mat; gb.F[i] = f;
        }
      }
    }
    // any texel no triangle reached copies its nearest painted neighbour along the row
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (gb.M[i]) continue;
      for (let d = 1; d < Math.max(w, h); d++) {
        const cand = [y * w + ((x + d) % w), y * w + ((x - d + w * 4) % w), Math.min(h - 1, y + d) * w + x, Math.max(0, y - d) * w + x];
        const j = cand.find((q) => gb.M[q] && best[q] > -1e8);
        if (j !== undefined) { gb.P.copyWithin(i * 3, j * 3, j * 3 + 3); gb.N.copyWithin(i * 3, j * 3, j * 3 + 3); gb.K[i] = gb.K[j]; gb.A[i] = gb.A[j]; gb.M[i] = gb.M[j]; gb.F[i] = gb.F[j]; break; }
      }
    }
  }
}

/** emit a part's faces into the skin builder, one vertex per (point, chart, uv) */
export function emitPart(B: SkinB, p: Part) {
  const { V, F } = p.m;
  const W = new Map<number, Wt>();
  const wOf = (i: number) => { let w = W.get(i); if (!w) W.set(i, (w = p.w(V[i]))); return w; };
  for (const ch of p.charts) {
    const map = new Map<string, number>();
    for (const f of ch.faces) {
      const c = F[f], ids = c.map((vi, k) => {
        const uv = ch.uv(f, k), key = vi + ':' + uv[0].toFixed(5) + ':' + uv[1].toFixed(5);
        let id = map.get(key);
        if (id === undefined) map.set(key, (id = B.vert(V[vi], ch.reg!, uv[0], uv[1], wOf(vi), p.g)));
        return id;
      });
      if (c.length === 4) {
        // split each quad along its shorter diagonal
        if (dist(V[c[0]], V[c[2]]) <= dist(V[c[1]], V[c[3]])) { B.tri(ids[0], ids[1], ids[2]); B.tri(ids[0], ids[2], ids[3]); }
        else { B.tri(ids[0], ids[1], ids[3]); B.tri(ids[1], ids[2], ids[3]); }
      } else for (let k = 1; k + 1 < c.length; k++) B.tri(ids[0], ids[k], ids[k + 1]);
    }
  }
}

/** request every chart's region (sized by its metres at `den` texels per metre and its priority), then pack */
export function layout(page: Page, parts: Part[], den: number, maxScale = 3) {
  for (const p of parts) for (const ch of p.charts) ch.reg = page.reg(p.name + '.' + ch.name, Math.max(4, ch.wm * den), Math.max(4, ch.hm * den), ch.k);
  return page.pack(maxScale);
}
