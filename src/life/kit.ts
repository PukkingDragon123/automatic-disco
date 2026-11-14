// Sculpt kit (after LIMBOPHOBIA's creature kit): skinned meshes lofted from cross-section rings along paths, each
// loft unwrapped onto its own rectangle of a hand-painted page (u = angle around, v = along). Rings take a bump
// field (folds, ribs, plates, fuzz), weights blend across joints so bodies bend like flesh, and the page is
// painted with ramps, light baked by angle, fbm and strands.
import * as THREE from 'three';
import { PixelCanvas, bayer } from '../limbo/gfx/pixel';
import { tileFbm } from '../limbo/core/rng';

export type V3 = number[];
/** skin weights: [boneIndex, weight, ...] (up to 4 pairs) */
export type Wt = number[];

export const KPAD = 2;
/** global loft style: superellipse squareness (2 = round, higher = boxier) and a multiplier on sides around */
export const KIT = { sq: 2, nMul: 1 };
export const hash = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** a rectangle of the page; u wraps (tubes), v clamps. Regions are requested at a nominal size while the geometry
 *  is built (UVs are stored region-local) and only placed when the page is packed, so the page is always filled */
export class Region {
  /** alpha-cut region (fur cards): keeps transparent texels */
  cut = false;
  x = 0; y = 0; w: number; h: number;
  /** stored transposed on the page (long bodies lie across it) */
  rot = false;
  /** nominal size and texel-density priority (faces and eyes paint finer than flanks) */
  readonly bw: number; readonly bh: number;
  constructor(public page: Page, public name: string, w: number, h: number, public k = 1) { this.bw = this.w = w; this.bh = this.h = h; }
  /** angle in degrees of a column (0 = the centre column, which lofts put on top) */
  deg(x: number) { return ((x + 0.5) / this.w - 0.5) * 360; }
  th(x: number) { return ((x + 0.5) / this.w - 0.5) * Math.PI * 2; }
  X(deg: number) { return (0.5 + deg / 360) * this.w; }
  private ix(x: number, y: number) {
    const xx = ((Math.floor(x) % this.w) + this.w) % this.w, yy = Math.min(this.h - 1, Math.max(0, Math.floor(y)));
    return this.rot ? [this.x + yy, this.y + xx] : [this.x + xx, this.y + yy];
  }
  /** page texel of a region-local texel (no wrapping) */
  at(x: number, y: number) { return this.rot ? [this.x + y, this.y + x] : [this.x + x, this.y + y]; }
  /** page UV of region-local (u, v) in 0..1 */
  uv(u: number, v: number): [number, number] { return this.rot ? [this.x + v * this.h, this.y + u * this.w] : [this.x + u * this.w, this.y + v * this.h]; }
  get pw() { return this.rot ? this.h : this.w; }
  get ph() { return this.rot ? this.w : this.h; }
  inside(y: number) { return y >= 0 && y < this.h; }
  set(x: number, y: number, c: number, a = 255) { if (!this.inside(Math.floor(y))) return; const [p, q] = this.ix(x, y); this.page.pc.set(p, q, c, a); }
  get(x: number, y: number) { const [p, q] = this.ix(x, y); return this.page.pc.get(p, q); }
  alpha(x: number, y: number, a: number) { if (!this.inside(Math.floor(y))) return; const [p, q] = this.ix(x, y); this.page.pc.data[(q * this.page.W + p) * 4 + 3] = a; }
  blend(x: number, y: number, c: number, t: number) { if (!this.inside(Math.floor(y))) return; const [p, q] = this.ix(x, y); this.page.pc.blend(p, q, c, t); }
  /** dithered write of a fractional ramp index */
  put(x: number, y: number, R: number[], v: number, dither = 0.5) {
    let i = Math.floor(v);
    if (v - i > 0.5 + (bayer(Math.floor(x), Math.floor(y)) - 0.5) * dither) i++;
    this.set(x, y, R[i < 0 ? 0 : i >= R.length ? R.length - 1 : i]);
  }
  fill(R: number[], fn: (x: number, y: number) => number, mask?: (x: number, y: number) => boolean, dither = 0.5) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { if (mask && !mask(x, y)) continue; this.put(x, y, R, fn(x, y), dither); }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, t = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 2000; n++) {
      this.blend(x0, y0, c, t);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, t = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.blend(x, y, c, t);
    }
  }
  /** dithered soft blob */
  blob(cx: number, cy: number, rx: number, ry: number, c: number, strength = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 1 && (1 - d) * strength > bayer(x & 1023, y & 1023)) this.set(x, y, c);
    }
  }
  glow(cx: number, cy: number, rx: number, ry: number, c: number, t: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) this.blend(x, y, c, t * (1 - d));
    }
  }
  /** tileable fbm over the region (cached on the region, so it goes when the page does) */
  private nz = new Map<number, Float32Array>();
  private nzK = -1; private nzF: Float32Array | null = null;
  fbm(x: number, y: number, cells = 3, oct = 2, seed = 0) {
    const w = this.w, h = this.h;
    const key = cells * 1e8 + oct * 1e7 + (seed % 1e7);
    let f = key === this.nzK ? this.nzF! : this.nz.get(key);
    if (!f) {
      f = new Float32Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) f[j * w + i] = tileFbm(i, j, w, h, cells, oct, seed);
      this.nz.set(key, f);
    }
    this.nzK = key; this.nzF = f;
    const xi = ((Math.floor(x) % w) + w) % w, yi = ((Math.floor(y) % h) + h) % h;
    return f[yi * w + xi];
  }
  /** a wandering hairline (veins, cracks, wet partings) */
  crack(x: number, y: number, len: number, dirDeg: number, c: number, seed: number, t = 1, branch = 0.12) {
    let a = (dirDeg * Math.PI) / 180, px = x, py = y;
    for (let i = 0; i < len; i++) {
      this.blend(px, py, c, t);
      a += (hash(i, seed) - 0.5) * 0.9;
      px += Math.cos(a); py += Math.sin(a);
      if (branch > 0 && hash(i, seed + 7) < branch && len > 6) this.crack(px, py, Math.floor(len * 0.4), (a * 180) / Math.PI + (hash(i, seed + 3) < 0.5 ? 50 : -50), c, seed * 3 + i, t * 0.8, 0);
    }
  }
}

/** a page split into regions: requested while modelling, then scaled to fill the page and skyline-packed */
export class Page {
  pc: PixelCanvas;
  regs = new Map<string, Region>();
  /** the scale the last pack settled on (texels per nominal texel) and the fraction of the page it covers */
  scale = 1; fill = 0;
  constructor(public W = 256, public H = 256) { this.pc = new PixelCanvas(W, H); this.pc.wrap = false; }
  reg(name: string, w: number, h: number, k = 1): Region {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    const r = new Region(this, name, w, h, k);
    this.regs.set(name, r);
    return r;
  }
  R(name: string) { const r = this.regs.get(name); if (!r) throw new Error('no region ' + name); return r; }
  /** size every region at the largest common scale (up to maxScale) that still packs, then place them */
  pack(maxScale = 3) {
    const rs = [...this.regs.values()];
    let area = 0;
    for (const r of rs) area += (r.bw * r.k + KPAD * 2) * (r.bh * r.k + KPAD * 2);
    let s = Math.min(maxScale, Math.sqrt((this.W * this.H * 0.94) / Math.max(1, area)));
    for (let n = 0; n < 60; n++, s *= 0.96) if (this.tryPack(rs, s)) { this.scale = s; return s; }
    throw new Error('page overflow');
  }
  private tryPack(rs: Region[], s: number) {
    const W = this.W, H = this.H;
    for (const r of rs) {
      r.w = Math.max(4, Math.min(W - KPAD * 2, Math.round(r.bw * r.k * s)));
      r.h = Math.max(4, Math.min(H - KPAD * 2, Math.round(r.bh * r.k * s)));
    }
    // longest first, either way round; each goes where its top edge ends lowest on the skyline (bottom-left rule)
    const order = [...rs].sort((a, b) => Math.max(b.h, b.w) - Math.max(a.h, a.w) || b.w * b.h - a.w * a.h);
    let sky: { x: number; y: number; w: number }[] = [{ x: 0, y: 0, w: W }];
    let used = 0;
    for (const r of order) {
      let bx = -1, by = Infinity, bt = Infinity, brot = false;
      for (const rot of r.w === r.h ? [false] : [false, true]) {
        const rw = (rot ? r.h : r.w) + KPAD * 2, rh = (rot ? r.w : r.h) + KPAD * 2;
        for (let i = 0; i < sky.length; i++) {
          const x = sky[i].x; if (x + rw > W) break;
          let y = 0;
          for (let j = i; j < sky.length && sky[j].x < x + rw; j++) y = Math.max(y, sky[j].y);
          if (y + rh <= H && (y + rh < bt || (y + rh === bt && y < by))) { by = y; bx = x; bt = y + rh; brot = rot; }
        }
      }
      if (bx < 0) return false;
      r.rot = brot;
      const rw = r.pw + KPAD * 2, rh = r.ph + KPAD * 2;
      r.x = bx + KPAD; r.y = by + KPAD; used += rw * rh;
      // raise the skyline under the new rectangle
      const next: { x: number; y: number; w: number }[] = [];
      for (const g of sky) {
        const g1 = g.x + g.w;
        if (g1 <= bx || g.x >= bx + rw) { next.push(g); continue; }
        if (g.x < bx) next.push({ x: g.x, y: g.y, w: bx - g.x });
        if (g1 > bx + rw) next.push({ x: bx + rw, y: g.y, w: g1 - bx - rw });
      }
      next.push({ x: bx, y: by + rh, w: rw });
      next.sort((a, b) => a.x - b.x);
      sky = [];
      for (const g of next) { const l = sky[sky.length - 1]; if (l && l.y === g.y && l.x + l.w === g.x) l.w += g.w; else sky.push(g); }
    }
    this.fill = used / (W * H);
    return true;
  }
  /** extend every region into its padding (u wraps, v clamps) so mips never bleed */
  finish() {
    const d = this.pc.data, W = this.W;
    for (const r of this.regs.values()) {
      for (let y = -KPAD; y < r.h + KPAD; y++) {
        const sy = Math.min(r.h - 1, Math.max(0, y));
        for (let x = -KPAD; x < r.w + KPAD; x++) {
          if (y >= 0 && y < r.h && x >= 0 && x < r.w) continue;
          const [px, py] = r.at(x, y);
          if (py < 0 || py >= this.H || px < 0 || px >= W) continue;
          const [qx, qy] = r.at(((x % r.w) + r.w) % r.w, sy);
          const si = (qy * W + qx) * 4, di = (py * W + px) * 4;
          d[di] = d[si]; d[di + 1] = d[si + 1]; d[di + 2] = d[si + 2]; d[di + 3] = d[si + 3];
        }
      }
    }
    // gaps between regions stay opaque so distant mips never punch holes (alpha < 1 marks glow); cut regions keep theirs
    const keep = new Uint8Array(this.W * this.H);
    for (const r of this.regs.values()) if (r.cut) for (let y = r.y - KPAD; y < r.y + r.ph + KPAD; y++) for (let x = r.x - KPAD; x < r.x + r.pw + KPAD; x++) if (x >= 0 && y >= 0 && x < W && y < this.H) keep[y * W + x] = 1;
    for (let i = 3, p = 0; i < d.length; i += 4, p++) if (d[i] < 128 && !keep[p]) d[i] = 255;
  }
}

// ------------------------------------------------------------------------------------------- vector helpers
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export const lerpV = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function centroid(ps: V3[]): V3 { let x = 0, y = 0, z = 0; for (const p of ps) { x += p[0]; y += p[1]; z += p[2]; } const n = Math.max(1, ps.length); return [x / n, y / n, z / n]; }
export const gauss = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
export const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const usFor = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

// ------------------------------------------------------------------------------------------- geometry builder
export class SkinB {
  P: number[] = []; UV: number[] = []; SI: number[] = []; SW: number[] = []; I: number[] = []; G: number[] = [];
  /** the region each vertex's (region-local, 0..1) UV lives in: resolved to page UVs once the page is packed */
  RG: Region[] = [];
  constructor(public W = 256, public H = 256) {}
  /** a vertex at region-local (u, v): u across the region's columns, v down its rows (0 = first row) */
  vert(p: V3, reg: Region, u: number, v: number, w: Wt, g: number): number {
    this.P.push(p[0], p[1], p[2]);
    this.UV.push(u, v); this.RG.push(reg);
    this.G.push(g);
    let tot = 0;
    const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    for (let k = 0; k < 4 && k * 2 < w.length; k++) { si[k] = w[k * 2]; sw[k] = Math.max(0, w[k * 2 + 1]); tot += sw[k]; }
    for (let k = 0; k < 4; k++) sw[k] = tot > 0 ? sw[k] / tot : k === 0 ? 1 : 0;
    this.SI.push(si[0], si[1], si[2], si[3]); this.SW.push(sw[0], sw[1], sw[2], sw[3]);
    return this.P.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) { this.I.push(a, b, c); }
  pos(i: number): V3 { return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]]; }
  triOut(a: number, b: number, c: number, inside: V3, flip = false) {
    const A = this.pos(a), B = this.pos(b), C = this.pos(c);
    const n = cross(sub(B, A), sub(C, A));
    const m = sub(centroid([A, B, C]), inside);
    if ((dot(n, m) >= 0) !== flip) this.tri(a, b, c); else this.tri(a, c, b);
  }
  /** loft through rings of equal point count (seam point duplicated at the end); poles close the ends */
  loft(rings: { pts: V3[]; v: number; w: Wt | ((j: number) => Wt) }[], us: number[], reg: Region, g: number,
    o: { start?: V3 | null; end?: V3 | null; startV?: number; endV?: number; startW?: Wt; endW?: Wt; double?: boolean; flip?: boolean } = {}) {
    const n = us.length;
    const cents: V3[] = rings.map((r) => centroid(r.pts.slice(0, n - 1)));
    const W = (r: { w: Wt | ((j: number) => Wt) }, j: number) => (typeof r.w === 'function' ? r.w(j) : r.w);
    const mk = (gg: number) => rings.map((r) => r.pts.map((p, j) => this.vert(p, reg, us[j], 1 - r.v, W(r, j), gg)));
    const emit = (flip: boolean, rows: number[][]) => {
      for (let i = 0; i + 1 < rows.length; i++) {
        const ins = mid(cents[i], cents[i + 1]);
        for (let j = 0; j + 1 < n; j++) {
          const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
          const A = this.pos(a), B = this.pos(b), C = this.pos(c), D = this.pos(d);
          let nrm = cross(sub(B, A), sub(C, A));
          if (len(nrm) < 1e-12) nrm = cross(sub(C, A), sub(D, A));
          const out = dot(nrm, sub(mid(A, C), ins)) >= 0;
          if (out !== flip) { this.tri(a, b, c); this.tri(a, c, d); } else { this.tri(a, c, b); this.tri(a, d, c); }
        }
      }
    };
    const idx = mk(g);
    emit(!!o.flip, idx); // (o.double is moot: the material is double-sided and flat shading takes its normal from the screen)
    const all = centroid(cents);
    const pole = (P: V3, ring: number[], v: number, w: Wt | ((j: number) => Wt)) => {
      for (let j = 0; j + 1 < n; j++) {
        const pi = this.vert(P, reg, (us[j] + us[j + 1]) / 2, 1 - v, typeof w === 'function' ? w(j) : w, g);
        this.triOut(pi, ring[j], ring[j + 1], all, !!o.flip);
      }
    };
    if (o.start) pole(o.start, idx[0], o.startV ?? rings[0].v, o.startW ?? rings[0].w);
    if (o.end) pole(o.end, idx[idx.length - 1], o.endV ?? rings[rings.length - 1].v, o.endW ?? rings[rings.length - 1].w);
    return idx;
  }
  /** a quad a-b-c-d with a region sub-rect (a = u0v0, b = u1v0, c = u1v1, d = u0v1) */
  quad(a: V3, b: V3, c: V3, d: V3, reg: Region, subr: [number, number, number, number], w: Wt[], double = false, g = -1) {
    const [u0, v0, u1, v1] = subr;
    const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const mk = (gg: number) => [a, b, c, d].map((p, i) => this.vert(p, reg, uv[i][0], 1 - uv[i][1], w[i], gg));
    const f = mk(g);
    this.tri(f[0], f[1], f[2]); this.tri(f[0], f[2], f[3]);
    void double;
  }
  get tris() { return this.I.length / 3; }
  build(): THREE.BufferGeometry {
    const nv = this.P.length / 3;
    const N = new Float32Array(nv * 3);
    for (let t = 0; t < this.I.length; t += 3) {
      const a = this.I[t], b = this.I[t + 1], c = this.I[t + 2];
      const n = cross(sub(this.pos(b), this.pos(a)), sub(this.pos(c), this.pos(a)));
      for (const k of [a, b, c]) { N[k * 3] += n[0]; N[k * 3 + 1] += n[1]; N[k * 3 + 2] += n[2]; }
    }
    // weld normals across seams and poles of the same loft
    const groups = new Map<string, number[]>();
    for (let i = 0; i < nv; i++) {
      const g = this.G[i]; if (g < 0) continue;
      const key = g + ':' + Math.round(this.P[i * 3] * 4000) + ',' + Math.round(this.P[i * 3 + 1] * 4000) + ',' + Math.round(this.P[i * 3 + 2] * 4000);
      let l = groups.get(key); if (!l) groups.set(key, l = []); l.push(i);
    }
    for (const l of groups.values()) {
      if (l.length < 2) continue;
      let x = 0, y = 0, z = 0;
      for (const i of l) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; }
      for (const i of l) { N[i * 3] = x; N[i * 3 + 1] = y; N[i * 3 + 2] = z; }
    }
    for (let i = 0; i < nv; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    const UV = new Float32Array(nv * 2);
    for (let i = 0; i < nv; i++) { const [px, py] = this.RG[i].uv(this.UV[i * 2], this.UV[i * 2 + 1]); UV[i * 2] = px / this.W; UV[i * 2 + 1] = py / this.H; } // flipY = false: page row 0 is v = 0
    g.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------------------------------- lofting
/** parallel-transported frames along a polyline: no twisting. u = side, v = up-ish */
export function transport(pts: V3[], up0: V3 = [0, 1, 0]): { d: V3; u: V3; v: V3 }[] {
  const out: { d: V3; u: V3; v: V3 }[] = [];
  let prevU: V3 | null = null;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const d = norm(sub(b, a));
    let u: V3;
    if (!prevU) {
      let c = cross(d, up0);
      if (len(c) < 1e-3) c = cross(d, [1, 0, 0]);
      if (len(c) < 1e-3) c = cross(d, [0, 0, 1]);
      u = norm(c);
    } else {
      u = norm(sub(prevU, scl(d, dot(prevU, d))));
      if (len(u) < 1e-4) u = norm(cross(d, [0, 1, 0]));
    }
    out.push({ d, u, v: norm(cross(u, d)) });
    prevU = u;
  }
  return out;
}

export interface SacOpt {
  n?: number;
  /** radius multiplier field: a = angle (0 top / +v, +-pi underneath, +pi/2 the +u side), t = 0..1 along */
  bump?: (a: number, t: number) => number;
  /** displacement along the ring's v axis (sag a belly, lift a ridge), in metres */
  shift?: (a: number, t: number) => number;
  start?: boolean; end?: boolean; up?: V3; tv?: number[]; double?: boolean; flip?: boolean;
  /** tip pull for the end caps (fraction of radius) */
  cap?: number;
  /** superellipse squareness of the rings (default KIT.sq) */
  sq?: number;
  /** per-vertex weights (a = angle around, t = 0..1 along); null falls back to the ring's */
  wv?: (a: number, t: number) => Wt | null;
}
/** a lofted segment along explicit points with radii (u, v) and per-point weights */
export function sac(B: SkinB, reg: Region, g: number, pts: V3[], radii: [number, number][], w: Wt[] | ((i: number) => Wt), o: SacOpt = {}) {
  const n = Math.max(4, Math.round((o.n ?? 10) * KIT.nMul));
  const e = 2 / (o.sq ?? KIT.sq);
  const fr = transport(pts, o.up ?? [0, 1, 0]);
  const N = pts.length;
  const tv = o.tv ?? pts.map((_, i) => 1 - i / Math.max(1, N - 1));
  const W = (i: number) => (typeof w === 'function' ? w(i) : w[i]);
  const rings = pts.map((c, i) => {
    const P: V3[] = [];
    const t = i / Math.max(1, N - 1);
    for (let j = 0; j <= n; j++) {
      const a = -Math.PI + (Math.PI * 2 * j) / n;
      const k = 1 + (o.bump ? o.bump(a, t) : 0);
      const sa = Math.sin(a), ca = Math.cos(a);
      const cu = Math.sign(sa) * Math.pow(Math.abs(sa), e) * radii[i][0] * k, sv = Math.sign(ca) * Math.pow(Math.abs(ca), e) * radii[i][1] * k + (o.shift ? o.shift(a, t) : 0);
      const f = fr[i];
      P.push([c[0] + f.u[0] * cu + f.v[0] * sv, c[1] + f.u[1] * cu + f.v[1] * sv, c[2] + f.u[2] * cu + f.v[2] * sv]);
    }
    const wi = W(i);
    return { pts: P, v: tv[i], w: o.wv ? (j: number) => o.wv!(-Math.PI + (Math.PI * 2 * j) / n, t) ?? wi : wi };
  });
  const capK = o.cap ?? 0.5;
  const tip = (i: number, dir: number): V3 => {
    const f = fr[i], r = Math.min(radii[i][0], radii[i][1]) * capK;
    const sh = o.shift ? o.shift(0, i / Math.max(1, N - 1)) * 0 : 0;
    return [pts[i][0] + f.d[0] * r * dir + f.v[0] * sh, pts[i][1] + f.d[1] * r * dir + f.v[1] * sh, pts[i][2] + f.d[2] * r * dir + f.v[2] * sh];
  };
  return B.loft(rings, usFor(n), reg, g, {
    start: o.start ?? true ? tip(0, -1) : null, end: o.end ?? true ? tip(N - 1, 1) : null,
    startW: W(0), endW: W(N - 1), startV: tv[0], endV: tv[N - 1], double: o.double, flip: o.flip,
  });
}

/** Catmull-Rom through control points, resampled evenly by arc length; returns points and their t (0..1) */
export function spline(ctrl: V3[], count: number): { pts: V3[]; t: number[]; L: number } {
  const dense: V3[] = [];
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i + 1 < ctrl.length; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < 16; k++) {
      const t = k / 16, t2 = t * t, t3 = t2 * t;
      dense.push([0, 1, 2].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  dense.push(ctrl[ctrl.length - 1]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + len(sub(dense[i], dense[i - 1])));
  const L = cum[cum.length - 1] || 1e-6;
  const pts: V3[] = [], ts: number[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const s = (k / (count - 1)) * L;
    while (j < dense.length - 2 && cum[j + 1] < s) j++;
    const f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    pts.push(lerpV(dense[j], dense[j + 1], Math.min(1, Math.max(0, f))));
    ts.push(k / (count - 1));
  }
  return { pts, t: ts, L };
}

/** weights along a run of joints (positions + bone ids): each point takes the bone of the segment it lies on,
 *  blending into the neighbour within `bl` (metres) of a joint */
export function chainWeights(pts: V3[], joints: V3[], ids: number[], bl: number): Wt[] {
  return pts.map((p) => {
    // nearest segment
    let best = 0, bd = 1e9, bt = 0;
    for (let s = 0; s + 1 < joints.length; s++) {
      const a = joints[s], b = joints[s + 1], ab = sub(b, a), L2 = Math.max(1e-9, dot(ab, ab));
      const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / L2));
      const d = len(sub(p, lerpV(a, b, t)));
      if (d < bd - 1e-6) { bd = d; best = s; bt = t; }
    }
    const a = joints[best], b = joints[best + 1], L = len(sub(b, a));
    const dA = bt * L, dB = (1 - bt) * L;
    const me = ids[best];
    if (best + 1 < ids.length && dB < bl) { const k = 0.5 * (1 - dB / bl); return [me, 1 - k, ids[best + 1], k]; }
    if (best > 0 && dA < bl) { const k = 0.5 * (1 - dA / bl); return [me, 1 - k, ids[best - 1], k]; }
    return [me, 1];
  });
}

/** a flat double-sided blade: spine points with a width per point along `side`, skinned per point */
export function blade(B: SkinB, reg: Region, pts: V3[], width: number[], side: V3 | V3[], w: Wt[], o: { edge?: number; seed?: number; offset?: number } = {}) {
  const n = pts.length;
  const S = (i: number) => (Array.isArray(side[0]) ? (side as V3[])[i] : (side as V3));
  const off = o.offset ?? 0, seed = o.seed ?? 1;
  for (let i = 0; i + 1 < n; i++) {
    const v0 = 1 - i / (n - 1), v1 = 1 - (i + 1) / (n - 1);
    const e0 = 1 + (o.edge ? (hash(i, seed) - 0.5) * o.edge : 0), e1 = 1 + (o.edge ? (hash(i + 1, seed) - 0.5) * o.edge : 0);
    const a0 = addV(pts[i], scl(S(i), width[i] * off)), a1 = addV(pts[i + 1], scl(S(i + 1), width[i + 1] * off));
    const b0 = addV(pts[i], scl(S(i), width[i] * (1 + off) * e0)), b1 = addV(pts[i + 1], scl(S(i + 1), width[i + 1] * (1 + off) * e1));
    B.quad(a0, b0, b1, a1, reg, [0, v0, 1, v1], [w[i], w[i], w[i + 1], w[i + 1]], true);
  }
}

/** a membrane sheet over a grid of points (rows x cols), double-sided, planar UV over the region */
export function sheet(B: SkinB, reg: Region, g: number, grid: V3[][], w: (i: number, j: number) => Wt) {
  const rows = grid.length, cols = grid[0].length;
  const ids = grid.map((row, i) => row.map((p, j) => B.vert(p, reg, j / (cols - 1), i / (rows - 1), w(i, j), g)));
  for (let i = 0; i + 1 < rows; i++) for (let j = 0; j + 1 < cols; j++) {
    const a = ids[i][j], b = ids[i][j + 1], c = ids[i + 1][j + 1], d = ids[i + 1][j];
    B.tri(a, b, c); B.tri(a, c, d);
  }
}

/** an ellipsoid as a sac along its local axis `ax` (eyes, knuckles, pods) */
export function ball(B: SkinB, reg: Region, g: number, c: V3, ax: V3, r: [number, number, number], w: Wt, o: { n?: number; rings?: number; up?: V3; bump?: (a: number, t: number) => number; tv?: number[]; sq?: number } = {}) {
  const rings = o.rings ?? 6, A = norm(ax);
  const pts: V3[] = [], radii: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, ang = -Math.PI / 2 + Math.PI * (0.06 + t * 0.88), k = Math.cos(ang);
    pts.push(addV(c, scl(A, Math.sin(ang) * r[2])));
    radii.push([r[0] * k, r[1] * k]);
  }
  return sac(B, reg, g, pts, radii, pts.map(() => w), { n: o.n ?? 10, up: o.up, bump: o.bump, cap: 0.35, tv: o.tv, sq: o.sq });
}

// ------------------------------------------------------------------------------------------- painters
/** shading value for a lofted region pixel: light from above baked by angle */
export const litTop = (r: Region, x: number, k = 0.8) => Math.cos(r.th(x)) * k;

export function paintEye(r: Region, iris: number, o: { pupil?: number; slit?: boolean; white?: number; size?: number; glossy?: boolean } = {}) {
  // the eye ball loft: top centre column, v along the axis (front = last rows)
  const pupil = o.pupil ?? 0x07060a;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const fy = y / (r.h - 1); // 0 = back of the ball, 1 = front
    const th = r.th(x);
    const front = fy;
    let c = o.white ?? 0x2a2018;
    if (front > 0.45) c = iris;
    if (front > 0.62) c = mixC(iris, 0xffffff, Math.cos(th) * 0.18 + 0.05);
    if (front > 0.8) c = o.slit ? (Math.abs(Math.sin(th)) < 0.32 ? pupil : iris) : pupil;
    if (front > 0.45 && front < 0.52) c = mixC(iris, 0x000000, 0.55);
    r.set(x, y, c);
  }
  // catchlights: one big, one small, upper-left of the cornea
  const hx = r.X(-35), hy = r.h * 0.78;
  r.set(hx, hy, 0xffffff); r.set(hx + 1, hy, 0xffffff); r.set(hx, hy - 1, 0xf0f0ff);
  if (o.glossy) r.set(r.X(40), r.h * 0.9, 0xd8e0ff);
}
const mixC = (a: number, b: number, t: number) => {
  t = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255, br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};
export { mixC };

export function pageTexture(page: Page): THREE.DataTexture {
  const d = page.pc.data;
  const tex = new THREE.DataTexture(new Uint8Array(d.buffer, d.byteOffset, d.byteLength), page.W, page.H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
