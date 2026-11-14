// ANATOMY LIBRARY: core. A creature is assembled from PIECES: each piece is a hand-blocked control cage (cage.ts:
// rings of points swept along a path, creased on its landmarks) with its ring grids, how it is skinned to the rig's
// bones, and how it is painted. The assembly (Body) subdivides every piece, cuts it into texture charts (a swept
// part unrolls by its ring grid: u round the rings with the seam on the hidden side, v along the sweep, both by arc
// length; caps and flat parts project onto their own plane), packs the charts into one page at an even texel
// density, rasterises each chart into a surface buffer (per texel: the 3D point, normal, curvature, ambient
// occlusion, material and face), lets each piece paint its charts from that real anatomy (paint.ts), and emits one
// skinned geometry. Pieces seat on each other through surface queries on already-subdivided hosts (gridSurf).
//
//   const body = new Body(2048);
//   const torso = body.add(trunk({...}));          // generators in trunk.ts, limb.ts, head.ts, armour.ts, append.ts
//   body.finalize(torso);                           // subdivide now, so other pieces can sit on its surface
//   body.add(plateRow(torso, {...}));
//   const { geo, tex, tris } = body.build();        // skinned BufferGeometry + painted DataTexture
import * as THREE from 'three';
import { Page, SkinB, pageTexture, type Region, type V3, type Wt } from '../kit';
import { type CM, type Grid, subdivide } from '../cage';
import { RAMPS } from '../../art/palette';

export interface Chart {
  name: string; k: number; faces: number[];
  /** region-local (u, v) of corner c of face f */
  uv: (f: number, c: number) => [number, number];
  /** size in metres (for the region request) */
  wm: number; hm: number;
  reg?: Region; gb?: GBuf;
  /** u wraps round (a tube): painters may read across the seam */
  wrap: boolean;
  /** which grid of the piece it unrolls (-1 planar) */
  grid: number;
}
/** a part of a creature: its cage, ring grids, skinning and painting */
export interface Piece {
  name: string;
  /** the control cage and its ring grids (both replaced by the subdivided result when finalized) */
  m: CM; grids: Grid[];
  /** subdivision steps (2 for bodies, 1 for small parts, 0 for already-fine pieces) */
  levels: number;
  /** skin weights of a point of this piece */
  skin: (p: V3) => Wt;
  /** charts of the finalized mesh (default: one per grid, caps planar) */
  charts?: (p: Piece) => Chart[];
  /** paint one chart (after the page is packed and the chart rasterised) */
  paint: (c: Chart, p: Piece, body: Body) => void;
  /** texel density priority (faces > flanks > hidden undersides) */
  k?: number;
  done?: boolean; ch?: Chart[];
  N?: V3[]; K?: Float32Array; A?: Float32Array;
  /** leave out of the ambient-occlusion voxels (tiny or floating parts) */
  noOcc?: boolean;
  /** its charts keep texel alpha (translucent membranes) */
  cut?: boolean;
  /** the lab's body region of its vertices (partPreview.ts: torso 1, back 2, head 3, eyes 4, crown 5, jaw 6, feelers 7,
   *  legs 8, arms 9, tail 10, wings 11); written to the geometry as `aReg` */
  reg?: number;
  /** the flat colour of the quick build (far LOD): a ramp and step, and a belly ramp below a normal.y (falls back to the
   *  look lookPaint was given) */
  tone?: Tone;
  /** left out of the quick build (teeth, whiskers, pupils: nothing a far silhouette needs) */
  farSkip?: boolean;
}
export interface Tone { ramp: number[]; step: number; belly?: { ramp: number[]; step: number; below: number } }
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

// ------------------------------------------------------------------------------------------- charts
/** a chart unrolled from a ring grid (rows i0..i1); faces are the grid's quads */
export function gridChart(m: CM, g: Grid, gi: number, name: string, k = 1, rows?: [number, number]): Chart {
  const R = g.v.length, C = g.v[0].length;
  const i0 = rows ? rows[0] : 0, i1 = rows ? rows[1] : R - 1;
  const U: number[][] = [], circ: number[] = [];
  for (let i = 0; i < R; i++) {
    const cum = [0];
    for (let j = 1; j < C; j++) cum.push(cum[j - 1] + dist(m.V[g.v[i][j - 1]], m.V[g.v[i][j]]));
    const tot = cum[C - 1] + (g.wrap ? dist(m.V[g.v[i][C - 1]], m.V[g.v[i][0]]) : 0) || 1e-6;
    U.push(cum.map((c) => c / tot)); circ.push(tot);
  }
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
    name, k, faces, wm, hm: tot, wrap: g.wrap, grid: gi,
    uv: (f, c) => {
      const F = m.F[f], [i, j] = at.get(F[c])!;
      let u = U[i][j];
      if (g.wrap && j === 0 && F.some((q) => { const p = at.get(q); return p !== undefined && p[1] > C / 2; })) u = 1;
      return [u, Vr[i]];
    },
  };
}
/** a chart projected onto a plane (caps, plates seen from above): `ax`, `ay` the plane's axes */
export function planarChart(m: CM, faces: number[], name: string, ax: V3, ay: V3, k = 1, pad = 0.03): Chart {
  const ids = new Set<number>(); for (const f of faces) for (const i of m.F[f]) ids.add(i);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const pr = new Map<number, [number, number]>();
  for (const i of ids) { const p = m.V[i], x = p[0] * ax[0] + p[1] * ax[1] + p[2] * ax[2], y = p[0] * ay[0] + p[1] * ay[1] + p[2] * ay[2]; pr.set(i, [x, y]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const sw = Math.max(1e-6, x1 - x0), sh = Math.max(1e-6, y1 - y0);
  return {
    name, k, faces, wm: sw * (1 + pad * 2), hm: sh * (1 + pad * 2), wrap: false, grid: -1,
    uv: (f, c) => { const [x, y] = pr.get(m.F[f][c])!; return [(pad + (x - x0) / sw) / (1 + 2 * pad), (pad + (y - y0) / sh) / (1 + 2 * pad)]; },
  };
}
/** the default charts of a piece: each grid unrolled, each grid's caps flattened onto their own plane */
export function defaultCharts(p: Piece): Chart[] {
  const out: Chart[] = [];
  p.grids.forEach((g, gi) => {
    out.push(gridChart(p.m, g, gi, 'g' + gi, p.k ?? 1));
    if (g.caps.length) {
      // split the caps by end (they sit round the first or the last ring)
      const cen = (row: number[]) => { const c = [0, 0, 0]; for (const q of row) { c[0] += p.m.V[q][0]; c[1] += p.m.V[q][1]; c[2] += p.m.V[q][2]; } return c.map((v) => v / row.length) as V3; };
      const c0 = cen(g.v[0]), c1 = cen(g.v[g.v.length - 1]), s: number[] = [], e: number[] = [];
      for (const f of g.caps) { const fc = cen(p.m.F[f]); (dist(fc, c0) < dist(fc, c1) ? s : e).push(f); }
      for (const [fs, nm] of [[s, 'cs'], [e, 'ce']] as [number[], string][]) {
        if (!fs.length) continue;
        const pts: V3[] = []; for (const f of fs) for (const q of p.m.F[f]) pts.push(p.m.V[q]);
        const n = fitNormal(pts), ax = perp(n), ay = cross3(n, ax);
        out.push(planarChart(p.m, fs, nm + gi, ax, ay, p.k ?? 1));
      }
    }
  });
  return out;
}
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const perp = (n: V3): V3 => nrm(Math.abs(n[1]) < 0.9 ? cross3([0, 1, 0], n) : cross3([1, 0, 0], n));
/** the average plane normal of a patch of points (by their spread: the axis of least extent) */
function fitNormal(P: V3[]): V3 {
  const c = [0, 0, 0]; for (const p of P) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } c[0] /= P.length; c[1] /= P.length; c[2] /= P.length;
  const M = [0, 0, 0, 0, 0, 0];
  for (const p of P) { const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2]; M[0] += x * x; M[1] += x * y; M[2] += x * z; M[3] += y * y; M[4] += y * z; M[5] += z * z; }
  // power iteration on the inverse is overkill: take the cross of the two largest spread directions
  let a: V3 = [1, 0.3, 0.2];
  for (let i = 0; i < 24; i++) a = nrm([M[0] * a[0] + M[1] * a[1] + M[2] * a[2], M[1] * a[0] + M[3] * a[1] + M[4] * a[2], M[2] * a[0] + M[4] * a[1] + M[5] * a[2]]);
  let b: V3 = perp(a);
  for (let i = 0; i < 24; i++) { b = [M[0] * b[0] + M[1] * b[1] + M[2] * b[2], M[1] * b[0] + M[3] * b[1] + M[4] * b[2], M[2] * b[0] + M[4] * b[1] + M[5] * b[2]]; const d = b[0] * a[0] + b[1] * a[1] + b[2] * a[2]; b = nrm([b[0] - a[0] * d, b[1] - a[1] * d, b[2] - a[2] * d]); }
  return nrm(cross3(a, b));
}

// ------------------------------------------------------------------------------------------- surface queries
/** a point on a (subdivided) grid surface at u round (0..1, by column) and v along (0..1, by row), its outward normal
 *  and the two tangents (du round, dv along) */
export function gridSurf(m: CM, g: Grid, u: number, v: number): { p: V3; n: V3; du: V3; dv: V3 } {
  const R = g.v.length, C = g.v[0].length;
  const fi = Math.max(0, Math.min(R - 1 - 1e-6, v * (R - 1))), fj = g.wrap ? (((u % 1) + 1) % 1) * C : Math.max(0, Math.min(C - 1 - 1e-6, u * (C - 1)));
  const i0 = Math.floor(fi), a = fi - i0, j0 = Math.floor(fj) % C, b = fj - Math.floor(fj), i1 = Math.min(R - 1, i0 + 1), j1 = g.wrap ? (j0 + 1) % C : Math.min(C - 1, j0 + 1);
  const P00 = m.V[g.v[i0][j0]], P01 = m.V[g.v[i0][j1]], P10 = m.V[g.v[i1][j0]], P11 = m.V[g.v[i1][j1]];
  const p: V3 = [0, 1, 2].map((k) => (P00[k] * (1 - b) + P01[k] * b) * (1 - a) + (P10[k] * (1 - b) + P11[k] * b) * a);
  const du: V3 = [0, 1, 2].map((k) => (P01[k] - P00[k]) * (1 - a) + (P11[k] - P10[k]) * a);
  const dv: V3 = [0, 1, 2].map((k) => (P10[k] - P00[k]) * (1 - b) + (P11[k] - P01[k]) * b);
  let n = nrm(cross3(dv, du));
  // outward: away from the ring's centre
  const c = [0, 0, 0]; for (const q of g.v[i0]) { c[0] += m.V[q][0]; c[1] += m.V[q][1]; c[2] += m.V[q][2]; }
  const out: V3 = [p[0] - c[0] / C, p[1] - c[1] / C, p[2] - c[2] / C];
  if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
  return { p, n, du: nrm(du), dv: nrm(dv) };
}

// ------------------------------------------------------------------------------------------- skinning helpers
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** weights along a chain of joints: a point takes the bone of the segment it projects onto, blending smoothly into
 *  the neighbouring bone over `blend` (fraction of each segment) either side of every joint. bones[k] drives the
 *  segment joints[k] -> joints[k+1]. */
export function chainSkin(joints: V3[], bones: number[], blend = 0.25): (p: V3) => Wt {
  return (p) => {
    let best = 0, bd = Infinity, bt = 0;
    for (let s = 0; s + 1 < joints.length; s++) {
      const a = joints[s], b = joints[s + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2));
      const d = Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
      if (d < bd - 1e-9) { bd = d; best = s; bt = t; }
    }
    const me = bones[best];
    if (best + 1 < bones.length && bt > 1 - blend) { const k = 0.5 * sstep(1 - blend, 1, bt); if (bones[best + 1] !== me) return [me, 1 - k, bones[best + 1], k]; }
    if (best > 0 && bt < blend) { const k = 0.5 * (1 - sstep(0, blend, bt)); if (bones[best - 1] !== me) return [me, 1 - k, bones[best - 1], k]; }
    return [me, 1];
  };
}
/** mix extra bones into a weight set: each extra takes its share from the others */
export function addWeights(w: Wt, extra: [number, number][]): Wt {
  let tot = 0; for (const [, k] of extra) tot += k;
  if (tot <= 0.001) return w;
  const out: Wt = [];
  for (let j = 0; j + 1 < w.length; j += 2) out.push(w[j], w[j + 1] * (1 - tot));
  for (const [b, k] of extra) if (k > 0.001) out.push(b, k);
  // at most four bones: keep the heaviest
  const pairs: [number, number][] = []; for (let j = 0; j + 1 < out.length; j += 2) pairs.push([out[j], out[j + 1]]);
  const merged = new Map<number, number>(); for (const [b, k] of pairs) merged.set(b, (merged.get(b) ?? 0) + k);
  return [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).flat();
}

// ------------------------------------------------------------------------------------------- the assembly
export class Body {
  page: Page; B: SkinB; pieces: Piece[] = [];
  /** shared state the painters may read (palette choices, seed) */
  seed = 1; den = 40;
  /** the light the page is shaded for (upper left, a little in front) */
  light: V3 = nrm([-0.45, 0.82, 0.36]);
  private gid = 1;
  /** triangles per piece family (debugging the budget) */
  stats = new Map<string, number>();
  /** quick mode (placeholder silhouettes while the real model builds elsewhere, and the far LOD): cage-level geometry
   *  on a tiny page of ramp rows, each face one ramp (its piece's tone, the belly's below a line) and each vertex a
   *  step of it by the light, so the far model still reads as the animal in hard-stepped planes */
  static quick = false;
  /** build only the pieces this keeps (part icons: everything is still built and seated, only these are charted,
   *  painted and emitted) */
  static keepPiece: ((p: Piece) => boolean) | null = null;
  readonly quick: boolean;
  /** subdivision steps of the quick build (titans 1, ordinary creatures 0) */
  quickLevels = 1;
  /** at most this many subdivision steps per piece (ordinary creatures keep to a triangle budget) */
  levelCap = Infinity;
  /** the lab region of every emitted vertex (geometry attribute aReg) */
  private vreg: number[] = [];
  constructor(size = 1024, h = size) { this.quick = Body.quick; if (this.quick) { size = 16; h = 128; } this.page = new Page(size, h); this.B = new SkinB(size, h); }
  add<T extends Piece>(p: T): T { this.pieces.push(p); return p; }
  /** subdivide a piece now (pieces that others sit on are finalized first) */
  finalize<T extends Piece>(p: T): T {
    if (p.done) return p;
    let m = p.m;
    const n = this.quick ? Math.min(this.quickLevels, p.levels) : Math.min(this.levelCap, p.levels);
    for (let l = 0; l < n; l++) m = subdivide(m, p.grids);
    p.m = m; p.done = true;
    return p;
  }
  /** tag the vertices emitted since `from` with a piece's lab region */
  private tagRegs(from: number, reg: number) { const n = this.B.P.length / 3; for (let i = from; i < n; i++) this.vreg[i] = reg; }
  private withRegs(geo: THREE.BufferGeometry) {
    const n = this.B.P.length / 3, a = new Float32Array(n);
    let any = false; for (let i = 0; i < n; i++) { a[i] = this.vreg[i] ?? 0; if (a[i]) any = true; }
    if (any) geo.setAttribute('aReg', new THREE.BufferAttribute(a, 1));
    return geo;
  }
  /** subdivide, chart, pack, rasterise, occlude, paint and emit everything */
  build(o: { den?: number; maxScale?: number; occlusion?: boolean; snap?: (d: Uint8ClampedArray) => void } = {}): { geo: THREE.BufferGeometry; tex: THREE.DataTexture; tris: number; scale: number } {
    if (this.quick) return this.buildQuick();
    if (Body.keepPiece) { const k = Body.keepPiece; this.pieces = this.pieces.filter((p) => k(p)); }
    const T = (globalThis as { __bodyTimes?: Record<string, number> }).__bodyTimes, now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let t0 = now(); const lap = (k: string) => { if (T) { const t = now(); T[k] = (T[k] ?? 0) + t - t0; t0 = t; } };
    for (const p of this.pieces) { this.finalize(p); p.ch = (p.charts ?? defaultCharts)(p); surfaceInfo(p); }
    lap('subdiv');
    if (o.occlusion !== false) occlusion(this.pieces.filter((p) => !p.noOcc));
    lap('occl');
    const den = o.den ?? this.den;
    for (const p of this.pieces) for (const ch of p.ch!) { ch.reg = this.page.reg(p.name + '.' + ch.name, Math.max(4, ch.wm * den), Math.max(4, ch.hm * den), ch.k); ch.reg.cut = !!p.cut; }
    const scale = this.page.pack(o.maxScale ?? 3);
    this.den = den * scale;
    for (const p of this.pieces) rasterPiece(p);
    lap('raster');
    for (const p of this.pieces) for (const ch of p.ch!) { p.paint(ch, p, this); if (T) lap('paint:' + p.name.replace(/[0-9_lrs.-]+$/, '')); }
    o.snap?.(this.page.pc.data as unknown as Uint8ClampedArray);
    this.page.finish();
    lap('finish');
    for (const p of this.pieces) { const t0 = this.B.tris, v0 = this.B.P.length / 3; emitPiece(this.B, p, this.gid++); if (p.reg) this.tagRegs(v0, p.reg); const k = p.name.replace(/[0-9_lrs.-]+$/, ''); this.stats.set(k, (this.stats.get(k) ?? 0) + this.B.tris - t0); }
    // the surface buffers are big: let them go
    for (const p of this.pieces) for (const ch of p.ch!) ch.gb = undefined;
    return { geo: this.withRegs(this.B.build()), tex: pageTexture(this.page), tris: this.B.tris, scale };
  }
  /** the quick build: cage-level pieces on a palette page (a block of 8 rows per ramp, one texel per ramp step); each
   *  face takes its piece's ramp (or the belly's), each vertex the step its normal's light gives, so the texture
   *  coordinate runs along the ramp and nearest sampling cuts the faces into hard-stepped light planes */
  buildQuick() {
    const ramps: number[][] = [], rowOf = (R: number[]) => { let k = ramps.indexOf(R); if (k < 0) { if (ramps.length >= 15) return 0; ramps.push(R); k = ramps.length - 1; } return k; };
    const grey = RAMPS.stone as unknown as number[];
    rowOf(grey);
    const reg = this.page.reg('pal', this.page.W, this.page.H);
    reg.x = 0; reg.y = 0; reg.w = this.page.W; reg.h = this.page.H; reg.rot = false;
    const L = this.light, W = this.page.W, H = this.page.H;
    // the far model keeps only what shapes the silhouette: no alpha-cut hair, nothing under 1/25 of the animal's size
    const box = (V: V3[]) => { let a = Infinity, b = Infinity, c = Infinity, d = -Infinity, e = -Infinity, f = -Infinity; for (const v of V) { a = Math.min(a, v[0]); b = Math.min(b, v[1]); c = Math.min(c, v[2]); d = Math.max(d, v[0]); e = Math.max(e, v[1]); f = Math.max(f, v[2]); } return Math.hypot(d - a, e - b, f - c); };
    const all = box(this.pieces.flatMap((p) => p.m.V)), small = this.pieces.length > 12 ? all / 25 : 0;
    for (const p of this.pieces) {
      if (p.farSkip || p.cut || box(p.m.V) < small) continue;
      this.finalize(p); surfaceInfo(p);
      const tone: Tone | undefined = p.tone ?? toneOf(p.paint);
      const R0 = tone?.ramp ?? grey, Rb = tone?.belly?.ramp ?? R0, st0 = tone?.step ?? 3, stB = tone?.belly?.step ?? st0, below = tone?.belly?.below ?? -2;
      const r0 = rowOf(R0), rb = rowOf(Rb);
      const Wm = new Map<number, Wt>(), wOf = (i: number) => { let w = Wm.get(i); if (!w) Wm.set(i, (w = p.skin(p.m.V[i]))); return w; };
      const v0 = this.B.P.length / 3, g = this.gid++;
      for (const f of p.m.F) {
        const fn = faceNormal(p.m.V, f), belly = fn[1] < below, row = belly ? rb : r0, R = belly ? Rb : R0, st = belly ? stB : st0;
        const ids = f.map((vi) => {
          const n = p.N![vi], lam = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
          const v = Math.max(0, Math.min(R.length - 1, st + lam * 1.5 + 0.15 + n[1] * 0.35 - 0.6));
          return this.B.vert(p.m.V[vi], reg, (v + 0.5) / W, (row * 8 + 4) / H, wOf(vi), g);
        });
        for (let k = 1; k + 1 < ids.length; k++) this.B.tri(ids[0], ids[k], ids[k + 1]);
      }
      if (p.reg) this.tagRegs(v0, p.reg);
    }
    for (let k = 0; k < ramps.length; k++) for (let y = k * 8; y < k * 8 + 8; y++) for (let x = 0; x < W; x++) this.page.pc.set(x, y, ramps[k][Math.min(ramps[k].length - 1, x)], 255);
    return { geo: this.withRegs(this.B.build()), tex: pageTexture(this.page), tris: this.B.tris, scale: 1 };
  }
}
const faceNormal = (V: V3[], f: number[]): V3 => { let x = 0, y = 0, z = 0; for (let i = 0; i < f.length; i++) { const a = V[f[i]], b = V[f[(i + 1) % f.length]]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); } const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
/** the tone a lookPaint painter carries (look.ts tags its painters with their look's ramp and belly) */
const toneOf = (paint: unknown): Tone | undefined => (paint as { tone?: Tone }).tone;

/** smooth vertex normals and a curvature (+ ridge, - valley, in units of the local edge length) for a piece */
export function surfaceInfo(p: Piece) {
  const { V, F } = p.m, n = V.length, N: V3[] = V.map(() => [0, 0, 0]), nb: number[][] = V.map(() => []);
  for (const f of F) {
    for (let k = 0; k < f.length; k++) { const a = f[k], b = f[(k + 1) % f.length]; if (!nb[a].includes(b)) nb[a].push(b); if (!nb[b].includes(a)) nb[b].push(a); }
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
    const s = nb[i]; if (!s.length) continue;
    let x = 0, y = 0, z = 0, el = 0;
    for (const j of s) { x += V[j][0]; y += V[j][1]; z += V[j][2]; el += dist(V[i], V[j]); }
    x = x / s.length - V[i][0]; y = y / s.length - V[i][1]; z = z / s.length - V[i][2]; el /= s.length;
    K[i] = -(x * N[i][0] + y * N[i][1] + z * N[i][2]) / Math.max(1e-6, el);
  }
  p.N = N; p.K = K;
}

/** ambient occlusion per vertex over all pieces: rays marched through a voxel grid of the whole model */
export function occlusion(pieces: Piece[], res = 80, reach = 0.2, rays = 14) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of pieces) for (const v of p.m.V) { x0 = Math.min(x0, v[0]); y0 = Math.min(y0, v[1]); z0 = Math.min(z0, v[2]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); z1 = Math.max(z1, v[2]); }
  const span = Math.max(x1 - x0, y1 - y0, z1 - z0) * 1.02 + 1e-6, cs = span / res, nx = Math.ceil((x1 - x0) / cs) + 3, ny = Math.ceil((y1 - y0) / cs) + 3, nz = Math.ceil((z1 - z0) / cs) + 3;
  const occ = new Uint8Array(nx * ny * nz);
  const cell = (x: number, y: number, z: number) => { const i = Math.floor((x - x0) / cs) + 1, j = Math.floor((y - y0) / cs) + 1, k = Math.floor((z - z0) / cs) + 1; return i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz ? -1 : (k * ny + j) * nx + i; };
  for (const p of pieces) for (const f of p.m.F) for (let k = 1; k + 1 < f.length; k++) {
    const a = p.m.V[f[0]], b = p.m.V[f[k]], c = p.m.V[f[k + 1]], s = Math.max(1, Math.ceil(Math.max(dist(a, b), dist(a, c), dist(b, c)) / (cs * 0.6)));
    for (let u = 0; u <= s; u++) for (let v = 0; v + u <= s; v++) { const U = u / s, Vv = v / s, W = 1 - U - Vv, q = cell(a[0] * W + b[0] * U + c[0] * Vv, a[1] * W + b[1] * U + c[1] * Vv, a[2] * W + b[2] * U + c[2] * Vv); if (q >= 0) occ[q] = 1; }
  }
  // the ground is there too
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { const q = cell(x0 + (i - 1) * cs, 0 - cs * 0.5, z0 + (k - 1) * cs); if (q >= 0) occ[q] = 1; }
  const dirs: V3[] = [];
  for (let i = 0; i < rays; i++) { const t = (i + 0.5) / rays, r = Math.sqrt(t), a = i * 2.39996; dirs.push([r * Math.cos(a), Math.sqrt(1 - t), r * Math.sin(a)]); }
  const steps = Math.max(4, Math.round(reach * res)), skip = 1.7;
  for (const p of pieces) {
    const A = new Float32Array(p.m.V.length);
    p.m.V.forEach((v, i) => {
      const n = p.N![i];
      const t1 = perp(n), t2 = cross3(n, t1);
      let hit = 0;
      for (const d of dirs) {
        const dx = t1[0] * d[0] + n[0] * d[1] + t2[0] * d[2], dy = t1[1] * d[0] + n[1] * d[1] + t2[1] * d[2], dz = t1[2] * d[0] + n[2] * d[1] + t2[2] * d[2];
        for (let s = 0; s < steps; s++) {
          const r = (skip + s) * cs, q = cell(v[0] + dx * r, v[1] + dy * r, v[2] + dz * r);
          if (q < 0) break;
          if (occ[q]) { hit += 1 - (s / steps) * 0.6; break; }
        }
      }
      A[i] = hit / rays;
    });
    p.A = A;
  }
}

/** rasterise each chart of a piece into its surface buffer */
export function rasterPiece(p: Piece) {
  const { V, F } = p.m, nv = V.length;
  // flat copies (monomorphic, fast)
  const VP = new Float32Array(nv * 3), VN = new Float32Array(nv * 3), VK = new Float32Array(nv), VA = p.A ?? new Float32Array(nv);
  for (let i = 0; i < nv; i++) { VP[i * 3] = V[i][0]; VP[i * 3 + 1] = V[i][1]; VP[i * 3 + 2] = V[i][2]; VN[i * 3] = p.N![i][0]; VN[i * 3 + 1] = p.N![i][1]; VN[i * 3 + 2] = p.N![i][2]; VK[i] = p.K![i]; }
  for (const ch of p.ch!) {
    const r = ch.reg!, w = r.w, h = r.h, n = w * h;
    const gb: GBuf = ch.gb = { w, h, P: new Float32Array(n * 3), N: new Float32Array(n * 3), K: new Float32Array(n), A: new Float32Array(n), M: new Uint8Array(n), F: new Int32Array(n).fill(-1) };
    const best = new Float32Array(n).fill(-1e9);
    const GP = gb.P, GN = gb.N, GK = gb.K, GA = gb.A, GM = gb.M, GF = gb.F;
    for (const f of ch.faces) {
      const c = F[f], mat = p.m.mat[f] + 1, nc = c.length;
      const us = new Float64Array(nc), vs = new Float64Array(nc);
      for (let k = 0; k < nc; k++) { const q = ch.uv(f, k); us[k] = q[0] * w; vs[k] = q[1] * h; }
      for (let k = 1; k + 1 < nc; k++) {
        const X0 = us[0], Y0 = vs[0], X1 = us[k], Y1 = vs[k], X2 = us[k + 1], Y2 = vs[k + 1];
        const v0 = c[0], v1 = c[k], v2 = c[k + 1];
        const det = (X1 - X0) * (Y2 - Y0) - (X2 - X0) * (Y1 - Y0);
        if (Math.abs(det) < 1e-9) continue;
        const id = 1 / det;
        const xa = Math.floor(Math.min(X0, X1, X2) - 0.5), xb = Math.ceil(Math.max(X0, X1, X2) + 0.5), ya = Math.max(0, Math.floor(Math.min(Y0, Y1, Y2) - 0.5)), yb = Math.min(h - 1, Math.ceil(Math.max(Y0, Y1, Y2) + 0.5));
        for (let y = ya; y <= yb; y++) {
          const py = y + 0.5;
          for (let x = xa; x <= xb; x++) {
            const px = x + 0.5;
            const b1 = ((px - X0) * (Y2 - Y0) - (X2 - X0) * (py - Y0)) * id, b2 = ((X1 - X0) * (py - Y0) - (px - X0) * (Y1 - Y0)) * id, b0 = 1 - b1 - b2;
            const inside = b0 < b1 ? (b0 < b2 ? b0 : b2) : (b1 < b2 ? b1 : b2);
            if (inside < -0.4) continue;
            const i = y * w + (x < 0 ? x + w : x >= w ? x - w : x);
            if (inside <= best[i]) continue;
            best[i] = inside;
            let t0 = b0 > 0 ? b0 : 0, t1 = b1 > 0 ? b1 : 0, t2 = b2 > 0 ? b2 : 0; const bs = 1 / (t0 + t1 + t2); t0 *= bs; t1 *= bs; t2 *= bs;
            const a0 = v0 * 3, a1 = v1 * 3, a2 = v2 * 3, i3 = i * 3;
            GP[i3] = VP[a0] * t0 + VP[a1] * t1 + VP[a2] * t2; GP[i3 + 1] = VP[a0 + 1] * t0 + VP[a1 + 1] * t1 + VP[a2 + 1] * t2; GP[i3 + 2] = VP[a0 + 2] * t0 + VP[a1 + 2] * t1 + VP[a2 + 2] * t2;
            const nx = VN[a0] * t0 + VN[a1] * t1 + VN[a2] * t2, ny = VN[a0 + 1] * t0 + VN[a1 + 1] * t1 + VN[a2 + 1] * t2, nz = VN[a0 + 2] * t0 + VN[a1 + 2] * t1 + VN[a2 + 2] * t2, nl = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
            GN[i3] = nx * nl; GN[i3 + 1] = ny * nl; GN[i3 + 2] = nz * nl;
            GK[i] = VK[v0] * t0 + VK[v1] * t1 + VK[v2] * t2;
            GA[i] = VA[v0] * t0 + VA[v1] * t1 + VA[v2] * t2;
            GM[i] = mat; GF[i] = f;
          }
        }
      }
    }
    // texels no triangle reached (planar charts' corners) take their nearest covered neighbour (a breadth-first fill)
    const q = new Int32Array(n); let qn = 0;
    for (let i = 0; i < n; i++) if (GM[i]) q[qn++] = i;
    const take = (k: number, j: number) => { GP[k * 3] = GP[j * 3]; GP[k * 3 + 1] = GP[j * 3 + 1]; GP[k * 3 + 2] = GP[j * 3 + 2]; GN[k * 3] = GN[j * 3]; GN[k * 3 + 1] = GN[j * 3 + 1]; GN[k * 3 + 2] = GN[j * 3 + 2]; GK[k] = GK[j]; GA[k] = GA[j]; GM[k] = GM[j]; GF[k] = GF[j]; q[qn++] = k; };
    for (let qi = 0; qi < qn; qi++) {
      const j = q[qi], x = j % w, y = (j - x) / w;
      if (x + 1 < w) { if (!GM[j + 1]) take(j + 1, j); } else if (ch.wrap && !GM[y * w]) take(y * w, j);
      if (x > 0) { if (!GM[j - 1]) take(j - 1, j); } else if (ch.wrap && !GM[y * w + w - 1]) take(y * w + w - 1, j);
      if (y + 1 < h && !GM[j + w]) take(j + w, j);
      if (y > 0 && !GM[j - w]) take(j - w, j);
    }
  }
}

/** emit a piece's faces into the skin builder, one vertex per (point, chart, uv) */
export function emitPiece(B: SkinB, p: Piece, g: number) {
  const { V, F } = p.m;
  const W = new Map<number, Wt>();
  const wOf = (i: number) => { let w = W.get(i); if (!w) W.set(i, (w = p.skin(V[i]))); return w; };
  for (const ch of p.ch!) {
    const map = new Map<string, number>();
    for (const f of ch.faces) {
      const c = F[f], ids = c.map((vi, k) => {
        const uv = ch.uv(f, k), key = vi + ':' + Math.round(uv[0] * 1e5) + ':' + Math.round(uv[1] * 1e5);
        let id = map.get(key);
        if (id === undefined) map.set(key, (id = B.vert(V[vi], ch.reg!, uv[0], uv[1], wOf(vi), g)));
        return id;
      });
      if (c.length === 4) {
        if (dist(V[c[0]], V[c[2]]) <= dist(V[c[1]], V[c[3]])) { B.tri(ids[0], ids[1], ids[2]); B.tri(ids[0], ids[2], ids[3]); }
        else { B.tri(ids[0], ids[1], ids[3]); B.tri(ids[1], ids[2], ids[3]); }
      } else for (let k = 1; k + 1 < c.length; k++) B.tri(ids[0], ids[k], ids[k + 1]);
    }
  }
}
