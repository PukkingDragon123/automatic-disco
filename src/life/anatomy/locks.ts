// ANATOMY LIBRARY: hair locks with real geometry, for silhouettes that a painted coat cannot give: a shaggy back, a
// mane, a belly fringe, a tail tuft, cheek ruffs, feathering at the fetlocks, a fleece. Each lock is a ribbon rooted
// under the host's skin, arched across (a spine down its middle) and curving from the root out along the hair flow
// and down under its own weight to a pointed or split tip. All the locks of a piece share one small atlas of drawn
// lock tiles (a few shapes in a few coat colours), cut out of the page with alpha, so a coat of hundreds of locks
// costs geometry only.
//   const P = locks({ name, seats: [{ p, n, dir, len, wid, col, w }], tiles: [ramp, ramp], skin })
import type { V3, Wt } from '../kit';
import { newCM, sheetGrid, type Grid } from '../cage';
import type { Piece, Chart, Body } from './core';
import { h3 } from './paint';

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface LockSeat {
  /** root point on the host, its outward normal, the hair's flow direction there */
  p: V3; n: V3; dir: V3;
  /** length and width (m), how far it stands off the skin (0 lies flat .. 1 stands out), how much it droops */
  len: number; wid: number; lift?: number; droop?: number;
  /** which colour tile (index into tiles), skin weights at the root */
  col: number; w: Wt;
}
const VAR = 4, ROWS = 3;
/** a piece of many locks over one shared atlas: VAR shapes across, one row of tiles per colour ramp */
export function locks(o: { name: string; seats: LockSeat[]; tiles: number[][]; steps?: number[]; seed?: number; reg?: number; den?: number }): Piece | null {
  if (!o.seats.length) return null;
  const m = newCM(), grids: Grid[] = [], seed = o.seed ?? 5;
  const lockOf: { g: Grid; vari: number; col: number }[] = [];
  let maxL = 0, maxW = 0;
  o.seats.forEach((s, k) => {
    const n = nrm(s.n), side = nrm(crs(n, s.dir)), fl = nrm(add(s.dir, scl(n, -dot(s.dir, n))));
    const lift = s.lift ?? 0.35, droop = s.droop ?? 0.35;
    // the lock's spine: out of the skin, along the flow, sagging under its weight
    const rows: V3[][] = [];
    for (let i = 0; i <= ROWS; i++) {
      const t = i / ROWS, root = i === 0;
      const c = add(add(add(s.p, scl(n, root ? -s.len * 0.08 : s.len * lift * Math.sin(t * 1.4) * 0.6)), scl(fl, s.len * t)), [0, -s.len * droop * t * t, 0]);
      const w = s.wid * (t < 0.3 ? 0.8 + t * 0.7 : 1 - (t - 0.3) * 0.9);
      const arch = s.wid * 0.18 * (1 - t);
      rows.push([add(c, scl(side, -w)), add(add(c, scl(n, arch)), [0, 0, 0]), add(c, scl(side, w))]);
    }
    const g = sheetGrid(m, rows, { tag: 0, out: () => n });
    grids.push(g);
    lockOf.push({ g, vari: Math.floor(h3(k, 3, seed) * VAR), col: Math.min(o.tiles.length - 1, s.col) });
    maxL = Math.max(maxL, s.len); maxW = Math.max(maxW, s.wid * 2);
  });
  const nT = o.tiles.length;
  const W = o.seats.map((s) => s.w);
  const faceLock = new Map<number, number>(); grids.forEach((g, k) => g.f.forEach((row) => row.forEach((f) => faceLock.set(f, k))));
  // the atlas: VAR columns of shapes, one row per colour; a lock's rows run down its tile
  const charts = (p: Piece): Chart[] => {
    // the grids were refined by subdivision (levels 0 keeps them as built)
    const faces: number[] = []; for (const g of p.grids) for (const row of g.f) for (const f of row) faces.push(f);
    const vIdx = new Map<number, [number, number, number]>();
    p.grids.forEach((g, k) => { const R = g.v.length, C = g.v[0].length; g.v.forEach((row, i) => row.forEach((vi, j) => vIdx.set(vi, [k, i / (R - 1), j / (C - 1)]))); });
    return [{
      name: 'atlas', k: 1, faces, wm: maxW * VAR * 1.1, hm: maxL * nT * 1.05, wrap: false, grid: -1,
      uv: (f, c) => {
        const vi = p.m.F[f][c], [k, along, across] = vIdx.get(vi)!, L = lockOf[k];
        return [(L.vari + 0.06 + across * 0.88) / VAR, (L.col + 0.03 + along * 0.94) / nT];
      },
    }];
  };
  void faceLock;
  return {
    name: o.name, m, grids, levels: 0, cut: true, noOcc: true, reg: o.reg ?? 2, k: 0.8, charts,
    skin: (p) => { // the nearest root's weights
      let best = 0, bd = Infinity;
      for (let k = 0; k < o.seats.length; k++) { const q = o.seats[k].p, d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (d < bd) { bd = d; best = k; } }
      return W[best];
    },
    paint: (ch, _p, b) => paintAtlas(ch, b, o.tiles, o.steps, seed),
    tone: { ramp: o.tiles[0], step: o.steps?.[0] ?? 3 },
  };
}
/** draw the lock tiles: each a flame of hair with a darker root, a lit edge on one side, strand lines along it and
 *  a ragged tip (two or three points), transparent outside its outline */
function paintAtlas(ch: Chart, _b: Body, tiles: number[][], steps: number[] | undefined, seed: number) {
  const r = ch.reg!, TW = r.w / VAR, TH = r.h / tiles.length;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const v = Math.floor(x / TW), col = Math.min(tiles.length - 1, Math.floor(y / TH)), R = tiles[col], st = steps?.[col] ?? 3;
    const fx = (x - v * TW) / TW, fy = (y - col * TH) / TH; // across 0..1, along 0..1 (root at 0)
    const e = (fx - 0.5) * 2, t = Math.max(0, Math.min(1, (fy - 0.03) / 0.94));
    // the outline: full to two thirds, then the tip splits into 2-3 points by variant
    const pts = 2 + (v % 2), tipK = t > 0.62 ? (t - 0.62) / 0.38 : 0;
    const lobe = Math.abs(Math.sin((e * 0.5 + 0.5) * Math.PI * pts + v));
    const hw = (t < 0.15 ? 0.7 + t * 2 : 1) * (1 - tipK * (0.55 + 0.45 * (1 - lobe)));
    const inside = Math.abs(e) < hw * 0.92 && t < 0.995 - (1 - lobe) * 0.18 * tipK;
    if (!inside) { r.set(x, y, R[0], 0); continue; }
    // shading: dark at the root, lit along one edge, strands along the lock, a light tip
    let k = st - (t < 0.18 ? 1.2 : 0) + (e < -0.25 ? 0.8 : e > 0.55 ? -0.7 : 0) + (t > 0.7 ? 0.6 : 0);
    const strand = Math.abs(((e * 2.2 + h3(v, col, seed) * 2) % 1 + 1) % 1 - 0.5) < 0.1;
    if (strand && t > 0.12 && t < 0.92) k -= 0.9;
    if (Math.abs(e) > hw * 0.78) k -= 1.1; // the outline
    r.set(x, y, R[Math.max(0, Math.min(R.length - 1, Math.round(k)))], 255);
  }
}
