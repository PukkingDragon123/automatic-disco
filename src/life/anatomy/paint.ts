// ANATOMY LIBRARY: the pixel painter. Every chart is painted texel by texel from the surface under it (core.ts
// GBuf): the light (upper left) falls on the real normal in 3-5 hard steps, occlusion darkens armpits, creases and the
// skin under a shell's rim, ridges catch a lit edge. Over that the surface is DRAWN, never noised: overlapping rows
// of scales (each with a lit edge, a shadow side and a dark outline), clumped fur strands with lit tips, pebbled and
// wrinkled hide (each pebble a little domed polygon lit on its upper side), pores, spots, scars, bevelled plates
// with growth rings, caked mud in clumps with a clear edge, lichen rosettes and moss cushions, and glints on wet or
// glossy material. Colours are master-palette ramp steps only (palette.ts).
//   const px = new Px(chart, body);
//   px.base((i) => [RP('slate'), 3]);            // ramp + step per texel, before light
//   px.scales({ size: 0.4, ... });                // marks add to the step
//   px.flush();                                   // light + marks -> ramp steps -> page
import { RAMPS, type RampName } from '../../art/palette';
import { hash, oct, type V3 } from '../kit';
import type { Body, Chart, GBuf } from './core';

export const RP = (n: RampName) => RAMPS[n] as unknown as number[];
const TAU = Math.PI * 2;
const cl = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ss = (a: number, b: number, x: number) => { const t = cl((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** a stable hash of an integer triple */
const h3 = (a: number, b: number, c: number) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul((c | 0) + 0x3c6ef372, 0x9e3779b1); x = Math.imul(x ^ (x >>> 15), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };

/** 3D cellular field (jittered lattice): nearest and second-nearest cell distances and the nearest cell's id/centre */
export interface Cell { f1: number; f2: number; id: number; cx: number; cy: number; cz: number }
const _cell: Cell = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0, cz: 0 };
export function cell3(x: number, y: number, z: number, size: number, seed = 0, sx = 1, sy = 1, sz = 1): Cell {
  // anisotropic: stretch space by (sx, sy, sz) before the lattice (wrinkles that run round a joint). The 2x2x2 cells
  // nearest the point are searched (the jitter keeps every feature point inside its own cell)
  const X = (x * sx) / size, Y = (y * sy) / size, Z = (z * sz) / size, ix = Math.floor(X), iy = Math.floor(Y), iz = Math.floor(Z);
  const ox = X - ix < 0.5 ? -1 : 0, oy = Y - iy < 0.5 ? -1 : 0, oz = Z - iz < 0.5 ? -1 : 0;
  let f1 = 1e9, f2 = 1e9, id = 0, cx = 0, cy = 0, cz = 0;
  for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const a = ix + ox + i, b = iy + oy + j, c = iz + oz + k;
    let hh = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c + seed * 977, 0x9e3779b1);
    hh = Math.imul(hh ^ (hh >>> 15), 0x85ebca6b); hh = Math.imul(hh ^ (hh >>> 13), 0xc2b2ae35); hh ^= hh >>> 16;
    const px = a + 0.12 + 0.76 * ((hh & 1023) / 1023), py = b + 0.12 + 0.76 * (((hh >>> 10) & 1023) / 1023), pz = c + 0.12 + 0.76 * (((hh >>> 20) & 1023) / 1023);
    const dx = X - px, dy = Y - py, dz = Z - pz, d = dx * dx + dy * dy + dz * dz;
    if (d < f1) { f2 = f1; f1 = d; id = hh >>> 0; cx = px; cy = py; cz = pz; } else if (d < f2) f2 = d;
  }
  _cell.f1 = Math.sqrt(f1) * size; _cell.f2 = Math.sqrt(f2) * size; _cell.id = id % 1000003; _cell.cx = (cx * size) / sx; _cell.cy = (cy * size) / sy; _cell.cz = (cz * size) / sz;
  return _cell;
}

export interface ScaleOpt {
  /** scale width and row spacing in metres */
  size: number; rowK?: number;
  /** the scale's length over its row spacing (overlap) */
  len?: number;
  /** which way the tips point along v (+1 toward the chart's last row) */
  flow?: number;
  /** shape: 'shield' overlapping roof tiles, 'pebble' beaded tiles that do not overlap, 'scute' broad transverse plates, 'keel' shields with a keel */
  kind?: 'shield' | 'pebble' | 'scute' | 'keel';
  /** where (0..1) scales apply, and a size multiplier per texel */
  mask?: (i: number) => number; sizeK?: (i: number) => number;
  /** marks: outline depth, lit edge, shadow side */
  ink?: number; lit?: number; shade?: number;
  seed?: number;
}
export interface FurOpt { len: number; width: number; flow?: number; down?: number; mask?: (i: number) => number; seed?: number; tip?: number; root?: number; ramp?: number[]; tipRamp?: number[] }

/** a chart's paint layer: per-texel ramp and step, plus overlays, flushed to the page in one pass */
export class Px {
  gb: GBuf; w: number; h: number; n: number;
  /** ramp per texel (index into rampT) and the step chosen by material and pattern */
  rampI: Int16Array; step: Float32Array;
  /** marks added on top of the light (scales, wrinkles, ...) */
  mark: Float32Array;
  /** final colour overrides (-1 none) and alpha */
  over: Int32Array; alpha: Uint8Array;
  /** shading strength for this chart (1 = full light baked) */
  lightK = 1;
  rampT: number[][] = [];
  /** metres per texel */
  mpt: number;
  /** metric along (Y) of each row, circumference of each row */
  Y: Float32Array; circ: Float32Array;
  constructor(public ch: Chart, public body: Body) {
    const gb = ch.gb!; this.gb = gb; this.w = gb.w; this.h = gb.h; this.n = gb.w * gb.h;
    this.rampI = new Int16Array(this.n); this.step = new Float32Array(this.n).fill(3); this.mark = new Float32Array(this.n);
    this.over = new Int32Array(this.n).fill(-1); this.alpha = new Uint8Array(this.n).fill(255);
    this.mpt = 1 / Math.max(1e-6, body.den);
    this.Y = new Float32Array(this.h); this.circ = new Float32Array(this.h);
    // row metrics from the surface itself
    const P = gb.P;
    for (let y = 0; y < this.h; y++) {
      let c = 0;
      for (let x = 0; x + 1 < this.w; x++) { const i = (y * this.w + x) * 3, j = i + 3; c += Math.hypot(P[j] - P[i], P[j + 1] - P[i + 1], P[j + 2] - P[i + 2]); }
      if (ch.wrap) { const i = (y * this.w + this.w - 1) * 3, j = y * this.w * 3; c += Math.hypot(P[j] - P[i], P[j + 1] - P[i + 1], P[j + 2] - P[i + 2]); }
      this.circ[y] = Math.max(1e-4, c);
    }
    const mx = Math.floor(this.w / 2);
    for (let y = 1; y < this.h; y++) { const i = ((y - 1) * this.w + mx) * 3, j = (y * this.w + mx) * 3; this.Y[y] = this.Y[y - 1] + Math.hypot(P[j] - P[i], P[j + 1] - P[i + 1], P[j + 2] - P[i + 2]); }
  }
  ramp(R: number[]) { let k = this.rampT.indexOf(R); if (k < 0) { this.rampT.push(R); k = this.rampT.length - 1; } return k; }
  /** material and pattern: a ramp and a step for every texel */
  base(fn: (i: number, x: number, y: number) => [number[], number] | void) {
    for (let y = 0, i = 0; y < this.h; y++) for (let x = 0; x < this.w; x++, i++) { const r = fn(i, x, y); if (r) { this.rampI[i] = this.ramp(r[0]); this.step[i] = r[1]; } }
  }
  /** set a texel's ramp and step (inside base callbacks, without allocating) */
  put(i: number, R: number[], step: number) { this.rampI[i] = R === this._lastR ? this._lastK : this.ramp(R); this._lastR = R; this._lastK = this.rampI[i]; this.step[i] = step; }
  private _lastR: number[] | null = null; private _lastK = 0;
  /** the baked light: Lambert from the upper left in hard steps, occlusion, ridges and valleys */
  shadeAt(i: number) {
    const N = this.gb.N, L = this.body.light, lam = N[i * 3] * L[0] + N[i * 3 + 1] * L[1] + N[i * 3 + 2] * L[2];
    const k = this.gb.K[i], a = this.gb.A[i];
    return (lam * 1.5 + 0.15 + N[i * 3 + 1] * 0.35) * this.lightK + cl(k * 1.4, -0.9, 0.9) - a * 2.3;
  }
  // ------------------------------------------------------------------------------------- coordinates
  /** metric coordinates of a texel: X round (metres, by the row's own circumference), Y along (metres) */
  X(x: number, y: number) { return ((x + 0.5) / this.w) * this.circ[y]; }
  P(i: number): V3 { const P = this.gb.P; return [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]; }
  /** the angle round a wrapped chart (0 = the middle column, which for bilateral tubes is the top) */
  th(x: number) { return ((x + 0.5) / this.w - 0.5) * TAU; }

  // ------------------------------------------------------------------------------------- drawn surfaces
  /** overlapping rows of drawn scales: each one a shield (or bead, or scute) lit on its upper edge, shadowed on its
   *  lower side and outlined in the darkest step; the row above casts a thin shadow on the row it overlaps */
  scales(o: ScaleOpt) {
    const { w, h } = this, seed = o.seed ?? 7, flow = o.flow ?? 1, kind = o.kind ?? 'shield', lenK = o.len ?? (kind === 'pebble' ? 1 : kind === 'scute' ? 1.12 : 1.55);
    const ink = o.ink ?? 2.2, lit = o.lit ?? 1, sh = o.shade ?? 1;
    const L = this.body.light, N = this.gb.N, P = this.gb.P, mpt = this.mpt;
    const cand: number[] = [];
    for (let y = 0; y < h; y++) {
      const Yr = this.Y[y], circ = this.circ[y];
      for (let x = 0; x < w; x++) {
        const i = y * w + x, m = o.mask ? o.mask(i) : 1;
        if (m <= 0.02) continue;
        const sz = o.size * (o.sizeK ? o.sizeK(i) : 1), sy = sz * (o.rowK ?? (kind === 'scute' ? 0.42 : kind === 'pebble' ? 0.88 : 0.6)), sw = kind === 'scute' ? sz * 2.4 : sz;
        const u = (x + 0.5) / w, ry = (flow > 0 ? Yr : -Yr) / sy, r0 = Math.floor(ry);
        // candidates: [order, s, e, hw, id, outside distance in texels]
        cand.length = 0;
        for (let dr = -2; dr <= 1; dr++) {
          const r = r0 + dr, nc = Math.max(3, Math.round(circ / sw)), off = (r & 1) * 0.5;
          const cu = Math.floor(u * nc - off);
          for (let dc = -1; dc <= 1; dc++) {
            const c = cu + dc, cm = ((c % nc) + nc) % nc, hs = h3(r, cm, seed);
            const jx = (hs - 0.5) * 0.16, jy = (h3(cm, r, seed + 3) - 0.5) * 0.18;
            let du = u - (c + off + 0.5 + jx) / nc; du -= Math.round(du);
            const e = du * nc * 2, s = (ry - r - jy) / lenK;
            if (s < -0.3 || s > 1.3) continue;
            const hw = kind === 'pebble' ? Math.sqrt(Math.max(0, 1 - (2 * cl(s, 0, 1) - 1) ** 2)) * 1.02 : kind === 'scute' ? (s > 0.84 ? 1 - (s - 0.84) * 1.4 : 1.02) : s < 0.5 ? 1.02 : 1.02 * Math.sqrt(Math.max(0, 1 - ((s - 0.5) / 0.5) ** 2));
            // tips lie over the next row's roots: earlier rows on top; beads and plates abut
            const order = kind === 'pebble' ? -(Math.abs(e) + Math.abs(2 * s - 1)) : -r * 4 - Math.abs(e) * 0.01;
            const oa = Math.max(0, Math.abs(e) - hw) * sw * 0.5, ob = s > 1 ? (s - 1) * lenK * sy : s < 0 ? -s * lenK * sy : 0;
            cand.push(order, s, e, hw, Math.floor(hs * 997), Math.max(oa, ob) / mpt);
          }
        }
        let bi = -1;
        for (let k = 0; k < cand.length; k += 6) if (cand[k + 5] === 0 && (bi < 0 || cand[k] > cand[bi])) bi = k;
        if (bi < 0) { this.mark[i] -= ink * 0.7 * m; continue; }
        const bs = cand[bi + 1], be = cand[bi + 2], bhw = cand[bi + 3], bid = cand[bi + 4];
        // a scale on top that this texel just misses casts its shadow here
        let shadow = false;
        for (let k = 0; k < cand.length; k += 6) if (cand[k] > cand[bi] && cand[k + 5] > 0 && cand[k + 5] < 2.2) { shadow = true; break; }
        // inside distance to the free rim (the tip and the sides; the root is under the row before)
        const rimT = Math.min((bhw - Math.abs(be)) * sw * 0.5, kind === 'pebble' ? Math.min(bs, 1 - bs) * lenK * sy : (1 - bs) * lenK * sy) / mpt;
        // the scale's dome: tilt the surface normal across (e) and toward the tip (s) along the real tangents
        const xr = (x + 1) % w, yr = Math.min(h - 1, y + 1), yl = Math.max(0, y - 1), ir = y * w + xr, iu = yr * w + x, il = yl * w + x;
        const tux = P[ir * 3] - P[i * 3], tuy = P[ir * 3 + 1] - P[i * 3 + 1], tuz = P[ir * 3 + 2] - P[i * 3 + 2], tul = Math.hypot(tux, tuy, tuz) || 1;
        const tvx = P[iu * 3] - P[il * 3], tvy = P[iu * 3 + 1] - P[il * 3 + 1], tvz = P[iu * 3 + 2] - P[il * 3 + 2], tvl = (Math.hypot(tvx, tvy, tvz) || 1) * flow;
        const ka = be * 0.55, kb = (bs - 0.45) * (kind === 'pebble' ? 0.9 : 0.5);
        const nx = N[i * 3] + (tux / tul) * ka + (tvx / tvl) * kb, ny = N[i * 3 + 1] + (tuy / tul) * ka + (tvy / tvl) * kb, nz = N[i * 3 + 2] + (tuz / tul) * ka + (tvz / tvl) * kb;
        const nl = Math.hypot(nx, ny, nz) || 1, lam = (nx * L[0] + ny * L[1] + nz * L[2]) / nl, lam0 = N[i * 3] * L[0] + N[i * 3 + 1] * L[1] + N[i * 3 + 2] * L[2], dl = lam - lam0;
        let mk = dl > 0.16 ? lit : dl > 0.05 ? lit * 0.45 : dl < -0.2 ? -sh : dl < -0.08 ? -sh * 0.45 : 0;
        if (rimT < 1.05) mk = -ink; // the outline round the free edge
        else if (rimT < 2.1) mk = dl > 0.02 ? lit * 1.4 : -sh * 1.2; // a lit lip on the light side, a dark one in shadow
        if (shadow && rimT >= 1.05) mk = Math.min(mk, -sh * 1.1);
        if (kind === 'keel' && Math.abs(be) < 0.1 && bs > 0.2 && rimT > 2) mk += lit * 0.9;
        if (kind === 'scute' && rimT > 2 && Math.abs(bs - 0.55) < 0.05) mk -= 0.6;
        // a glint where the dome turns square to the light
        if (lam > 0.86 && rimT > 1.5 && rimT < 3.5 && dl > 0.1 && (bid % 5) === 0) mk += 2.4;
        this.mark[i] += mk * m;
      }
    }
  }
  /** fur: clumped locks combed along the flow, dark at the root, lit at the tip, single-texel strands between */
  fur(o: FurOpt) {
    const { w, h } = this, seed = o.seed ?? 11, flow = o.flow ?? 1;
    for (let y = 0; y < h; y++) {
      const Yr = this.Y[y], circ = this.circ[y];
      for (let x = 0; x < w; x++) {
        const i = y * w + x, m = o.mask ? o.mask(i) : 1; if (m <= 0.02) continue;
        const u = (x + 0.5) / w, sy = o.len * 0.55, ry = (flow > 0 ? Yr : -Yr) / sy, r0 = Math.floor(ry);
        let best = -1e9, bs = 0, be = 0, bid = 0;
        const th = (u - 0.5) * TAU, side = Math.sin(th) * (o.down ?? 0.5);
        for (let dr = -2; dr <= 0; dr++) {
          const r = r0 + dr, nc = Math.max(4, Math.round(circ / o.width)), off = (r & 1) * 0.5, cu = Math.floor(u * nc - off);
          for (let dc = -1; dc <= 1; dc++) {
            const c = cu + dc, hs = h3(r, ((c % nc) + nc) % nc, seed);
            const uc = (c + off + 0.5 + (hs - 0.5) * 0.4) / nc, s = (ry - r - (h3(c, r, seed) - 0.5) * 0.4) / 1.9;
            if (s < 0 || s > 1) continue;
            const e = (u - uc) * nc * 2 - side * s * 1.2 - Math.sin(s * 3 + hs * 6) * 0.25;
            const hw = 1.05 * (1 - s * s * 0.75);
            if (Math.abs(e) > hw) continue;
            const ord = r - s * 0.2;
            if (ord > best) { best = ord; bs = s; be = e / hw; bid = Math.floor(hs * 1e4); }
          }
        }
        let mk: number;
        if (best <= -1e8) mk = -1.6; // the dark underfur between the locks
        else {
          mk = (o.root ?? -1.2) + bs * ((o.tip ?? 1.4) - (o.root ?? -1.2)) + (be < -0.3 ? 0.5 : be > 0.55 ? -0.7 : 0);
          // strands: a darker hair line every few texels across the lock
          const strand = Math.abs(((be * 3.2 + bid * 0.37) % 1 + 1) % 1 - 0.5) < 0.12;
          if (strand && bs > 0.15) mk -= 0.8;
          if (Math.abs(be) > 0.82) mk -= 1.1;
          if (bs > 0.9 && (bid & 1)) mk += 0.6;
        }
        this.mark[i] += mk * m;
      }
    }
  }
  /** the lock under each texel after locks(): its position along the lock (0 root .. 1 tip, -1 bare underfur) */
  lockS: Float32Array | null = null;
  /** fur drawn as pixel art: shingled locks, each a pointed flame of hair (a curved, tapering outline swept along the
   *  flow and down the flanks), lying over the roots of the row behind it. Every lock is shaded from its own dome on
   *  the real surface: a lit side and a shadow side, a selective outline (dark on the shadow side, a soft line on the
   *  lit side), one or two strand lines running its length, a bright tip where it turns to the light; the lock on top
   *  casts a short shadow on the one under it, and the gaps between them are dark underfur. */
  locks(o: { len: number; width: number; flow?: number; down?: number; bend?: number; mask?: (i: number) => number; seed?: number; tip?: number; ink?: number; under?: number }) {
    const { w, h } = this, seed = o.seed ?? 31, flow = o.flow ?? 1, sy = o.len * 0.42, lenK = o.len / sy, ink = o.ink ?? 2, tipK = o.tip ?? 1.5, under = o.under ?? 1.7;
    const L = this.body.light, N = this.gb.N, P = this.gb.P, mpt = this.mpt, down = o.down ?? 0.5, bendK = o.bend ?? 0.7;
    const S = this.lockS ?? (this.lockS = new Float32Array(this.n).fill(-2));
    const cand: number[] = [];
    for (let y = 0; y < h; y++) {
      const Yr = this.Y[y], circ = this.circ[y];
      const nc = Math.max(3, Math.round(circ / o.width));
      for (let x = 0; x < w; x++) {
        const i = y * w + x, m = o.mask ? o.mask(i) : 1;
        if (m <= 0.02) continue;
        const u = (x + 0.5) / w, ry = (flow > 0 ? Yr : -Yr) / sy, r0 = Math.floor(ry);
        const side = this.ch.wrap ? Math.sin((u - 0.5) * TAU) : 0;
        cand.length = 0;
        for (let dr = -3; dr <= 0; dr++) {
          const r = r0 + dr, off = (r & 1) * 0.5, cu = Math.floor(u * nc - off);
          for (let dc = -1; dc <= 1; dc++) {
            const c = cu + dc, cm = ((c % nc) + nc) % nc, hs = h3(r, cm, seed);
            const Ll = lenK * (0.82 + 0.36 * h3(cm, r, seed + 1)), s = (ry - r - (h3(cm, r, seed + 4) - 0.5) * 0.3) / Ll;
            if (s < -0.05 || s > 1.05) continue;
            let du = u - (c + off + 0.5 + (hs - 0.5) * 0.3) / nc; du -= Math.round(du);
            const bend = (h3(r, cm, seed + 2) - 0.5) * bendK, sc = Math.max(0, Math.min(1, s));
            const e = du * nc * 2 - bend * sc * sc * 2 - side * down * sc * 1.4;
            // the outline: a rounded root, full in the middle, pointed at the tip
            const hw = (sc < 0.18 ? 0.72 + sc * 1.55 : 1.0) * (1 - Math.pow(Math.max(0, sc - 0.3) / 0.7, 1.7) * 0.92) + 0.04;
            const outA = Math.max(0, Math.abs(e) - hw) * o.width * 0.5, outB = s > 1 ? (s - 1) * Ll * sy : s < 0 ? -s * Ll * sy : 0;
            cand.push(-r * 4 - Math.abs(e) * 0.01, sc, e, hw, Math.floor(hs * 9973), Math.max(outA, outB) / mpt, Ll);
          }
        }
        let bi = -1;
        for (let k = 0; k < cand.length; k += 7) if (cand[k + 5] === 0 && (bi < 0 || cand[k] > cand[bi])) bi = k;
        if (bi < 0) { this.mark[i] -= under * m; S[i] = -1; continue; }
        const bs = cand[bi + 1], be = cand[bi + 2], bhw = cand[bi + 3], bid = cand[bi + 4], bL = cand[bi + 6];
        S[i] = bs;
        let shadow = false;
        for (let k = 0; k < cand.length; k += 7) if (cand[k] > cand[bi] && cand[k + 5] > 0 && cand[k + 5] < 1.8) { shadow = true; break; }
        const rimT = Math.min((bhw - Math.abs(be)) * o.width * 0.5, (1 - bs) * bL * sy) / mpt;
        // the lock's dome: the normal tilted across it and toward its tip along the real tangents
        const xr = (x + 1) % w, yu = Math.min(h - 1, y + 1), yl = Math.max(0, y - 1), ir = y * w + xr, iu = yu * w + x, il = yl * w + x;
        const tux = P[ir * 3] - P[i * 3], tuy = P[ir * 3 + 1] - P[i * 3 + 1], tuz = P[ir * 3 + 2] - P[i * 3 + 2], tul = Math.hypot(tux, tuy, tuz) || 1;
        const tvx = P[iu * 3] - P[il * 3], tvy = P[iu * 3 + 1] - P[il * 3 + 1], tvz = P[iu * 3 + 2] - P[il * 3 + 2], tvl = (Math.hypot(tvx, tvy, tvz) || 1) * flow;
        const ka = (be / Math.max(0.2, bhw)) * 0.6, kb = (bs - 0.35) * 0.45;
        const nx = N[i * 3] + (tux / tul) * ka + (tvx / tvl) * kb, ny = N[i * 3 + 1] + (tuy / tul) * ka + (tvy / tvl) * kb, nz = N[i * 3 + 2] + (tuz / tul) * ka + (tvz / tvl) * kb;
        const nl = Math.hypot(nx, ny, nz) || 1, lam = (nx * L[0] + ny * L[1] + nz * L[2]) / nl, lam0 = N[i * 3] * L[0] + N[i * 3 + 1] * L[1] + N[i * 3 + 2] * L[2], dl = lam - lam0;
        let mk = dl > 0.1 ? 0.9 : dl > 0.03 ? 0.4 : dl < -0.12 ? -0.9 : dl < -0.04 ? -0.4 : 0;
        // strand lines along the lock (wide locks get two)
        const wT = bhw * o.width * 0.5 / mpt, nS = wT > 3.2 ? 2 : wT > 1.8 ? 1 : 0;
        if (nS && bs > 0.12 && bs < 0.86) { const en = be / bhw, k1 = nS === 2 ? Math.min(Math.abs(en - 0.38), Math.abs(en + 0.38)) : Math.abs(en - (bid % 2 ? 0.2 : -0.2)); if (k1 * bhw * o.width * 0.5 / mpt < 0.55) mk -= 0.9; }
        if (bs < 0.16) mk -= 0.6; // the root, in the shadow of the lock over it
        if (bs > 0.68 && dl > -0.03) mk += tipK * (bs > 0.84 ? 1 : 0.6); // the lit tip
        if (rimT < 1) mk = dl > 0.02 ? -0.7 : -ink; // the selective outline
        if (shadow && rimT >= 1) mk = Math.min(mk, -1.1);
        this.mark[i] += mk * m;
      }
    }
  }
  /** pebbled hide: a network of small domed polygons (each lit on its upper side, a dark crease round it); `aniso`
   *  stretches the cells (wrinkles running round a joint: [sx, sy, sz] in world axes) */
  pebbles(size: number, o: { mask?: (i: number) => number; depth?: number; aniso?: [number, number, number]; seed?: number; pores?: number } = {}) {
    const { n } = this, P = this.gb.P, L = this.body.light, N = this.gb.N, d = o.depth ?? 1, an = o.aniso ?? [1, 1, 1], tpm = 1 / this.mpt;
    for (let i = 0; i < n; i++) {
      const m = o.mask ? o.mask(i) : 1; if (m <= 0.02) continue;
      const c = cell3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], size, o.seed ?? 3, an[0], an[1], an[2]);
      const gap = (c.f2 - c.f1) * tpm; // texels to the crease
      // which side of its pebble the texel is on, against the light
      const vx = P[i * 3] - c.cx, vy = P[i * 3 + 1] - c.cy, vz = P[i * 3 + 2] - c.cz;
      const nd = vx * N[i * 3] + vy * N[i * 3 + 1] + vz * N[i * 3 + 2];
      const tx = vx - N[i * 3] * nd, ty = vy - N[i * 3 + 1] * nd, tz = vz - N[i * 3 + 2] * nd, tl = Math.hypot(tx, ty, tz) || 1;
      const face = (tx * L[0] + ty * L[1] + tz * L[2]) / tl, rel = tl / Math.max(1e-4, size * 0.5);
      let mk = 0;
      if (gap < 0.9) mk = -1.6 * d;
      else if (gap < 1.9) mk = face > 0.2 ? 0.7 * d : -0.8 * d;
      else mk = face > 0.35 && rel > 0.35 ? 0.35 * d : face < -0.4 && rel > 0.5 ? -0.35 * d : 0;
      if (o.pores && gap > 2.5 && (c.id % 11) < o.pores * 11 && rel < 0.18) mk -= 1.2 * d;
      this.mark[i] += mk * m;
    }
  }
  /** deep skin folds: long creases running round a limb or neck (a dark line with a lit lip above), at metric
   *  spacing along an axis; `wob` lets them wander and fork */
  folds(axis: V3, origin: V3, spacing: number, o: { mask?: (i: number) => number; depth?: number; wob?: number; seed?: number } = {}) {
    const P = this.gb.P, tpm = 1 / this.mpt, d = o.depth ?? 1, seed = o.seed ?? 5;
    for (let i = 0; i < this.n; i++) {
      const m = o.mask ? o.mask(i) : 1; if (m <= 0.02) continue;
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      const t = (px - origin[0]) * axis[0] + (py - origin[1]) * axis[1] + (pz - origin[2]) * axis[2];
      const c = cell3(px, py, pz, spacing * 1.6, seed);
      const wob = (o.wob ?? 0.35) * spacing * (h3(c.id, 1, seed) - 0.5);
      const f = (t + wob) / spacing, k = Math.round(f), dd = (f - k) * spacing * tpm;
      // folds break and restart: each cell decides whether this fold runs through it
      if ((c.id + k * 7) % 5 === 0) continue;
      let mk = 0;
      if (Math.abs(dd) < 0.8) mk = -1.8; else if (dd > 0.8 && dd < 2) mk = 0.9; else if (dd < -0.8 && dd > -2.2) mk = -0.5;
      this.mark[i] += mk * d * m;
    }
  }
  /** drawn spots: irregular hexagonal patches laid out in 3D (so they run across the charts), each with a darker rim */
  spots(size: number, R: number[], step: number, o: { mask?: (i: number) => number; density?: number; seed?: number; rim?: boolean } = {}) {
    const P = this.gb.P, dens = o.density ?? 0.5, seed = o.seed ?? 9;
    for (let i = 0; i < this.n; i++) {
      const m = o.mask ? o.mask(i) : 1; if (m <= 0.3) continue;
      const c = cell3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], size, seed);
      if (h3(c.id, 7, seed) > dens) continue;
      const r = size * (0.22 + 0.2 * h3(c.id, 9, seed));
      // a polygon: radius by angle in 6 jittered sectors (in the plane of two world axes, good enough for patches)
      const dx = P[i * 3] - c.cx, dy = P[i * 3 + 1] - c.cy, dz = P[i * 3 + 2] - c.cz, dd = Math.hypot(dx, dy, dz);
      const a = Math.atan2(dy, dx + dz * 0.7), sec = Math.floor(((a + Math.PI) / TAU) * 6), rr = r * (0.7 + 0.45 * h3(c.id, sec, seed + 1));
      if (dd > rr) continue;
      this.rampI[i] = this.ramp(R); this.step[i] = step;
      if (o.rim !== false && dd > rr - this.mpt * 1.5) this.mark[i] -= 0.8;
    }
  }
  /** caked mud up a leg: below a ragged line, clumps lit on top with a dark edge, a raised rim at the line, drips */
  mud(top: (i: number) => number, R: number[], o: { clump?: number; seed?: number; wet?: number[] } = {}) {
    const P = this.gb.P, tpm = 1 / this.mpt, cs = o.clump ?? 0.35, seed = o.seed ?? 13, N = this.gb.N, L = this.body.light;
    for (let i = 0; i < this.n; i++) {
      const y = P[i * 3 + 1], lim = top(i);
      // the ragged edge: each clump decides its own height
      const c = cell3(P[i * 3], y, P[i * 3 + 2], cs, seed);
      const edge = lim + (h3(c.id, 3, seed) - 0.5) * cs * 1.4;
      const drip = h3(Math.floor(P[i * 3] * 6 + P[i * 3 + 2] * 6), 5, seed) < 0.12 ? cs * 2.2 * h3(Math.floor(P[i * 3] * 6 + P[i * 3 + 2] * 6), 8, seed) : 0;
      if (y > edge + drip) {
        // splatter: a few lone blobs above the line
        if (y < edge + cs * 4 && h3(c.id, 11, seed) < 0.06 && c.f1 < cs * 0.22) { this.rampI[i] = this.ramp(R); this.step[i] = 2; this.mark[i] = c.f1 * tpm < 1 ? -1 : 0; }
        continue;
      }
      this.rampI[i] = this.ramp(o.wet && y < lim - cs * 3 ? o.wet : R);
      const gap = (c.f2 - c.f1) * tpm;
      const vx = P[i * 3] - c.cx, vy = y - c.cy, vz = P[i * 3 + 2] - c.cz, face = (vx * L[0] + vy * L[1] + vz * L[2]) / (Math.hypot(vx, vy, vz) || 1);
      let s = 3 + (h3(c.id, 2, seed) - 0.5) * 1.2;
      if (gap < 1) s -= 1.6; else if (gap < 2.2) s += face > 0 ? 0.8 : -0.9;
      if (edge - y < 1.6 * this.mpt * 1.0) s -= 1.4; // the dark lip under the raised edge
      else if (edge - y < 3 * this.mpt) s += 1;
      if (drip && y > edge) s -= 0.4;
      this.step[i] = s; this.mark[i] = 0; this.lightTweak(i, N);
    }
  }
  private lightTweak(_i: number, _N: Float32Array) { /* mud keeps the baked light */ }
  /** lichen and crust rosettes placed in 3D: lobed rings, a pale rim, a darker heart with fruiting cups */
  rosettes(sites: { c: V3; n: V3; r: number; R: number[]; cup?: number[] }[], o: { seed?: number } = {}) {
    if (!sites.length) return;
    const P = this.gb.P, tpm = 1 / this.mpt, seed = o.seed ?? 17;
    // cull to the sites near this chart, then hash each into every cell it covers
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < this.n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    const near = sites.filter((s) => s.c[0] + s.r * 1.3 > x0 && s.c[0] - s.r * 1.3 < x1 && s.c[1] + s.r * 1.3 > y0 && s.c[1] - s.r * 1.3 < y1 && s.c[2] + s.r * 1.3 > z0 && s.c[2] - s.r * 1.3 < z1);
    if (!near.length) return;
    const cs = Math.max(...near.map((s) => s.r)) * 1.3, key = (a: number, b: number, c: number) => ((a & 1023) << 20) | ((b & 1023) << 10) | (c & 1023);
    const grid = new Map<number, number[]>();
    near.forEach((s, k) => {
      const r = s.r * 1.3;
      for (let a = Math.floor((s.c[0] - r) / cs); a <= Math.floor((s.c[0] + r) / cs); a++) for (let b = Math.floor((s.c[1] - r) / cs); b <= Math.floor((s.c[1] + r) / cs); b++) for (let c = Math.floor((s.c[2] - r) / cs); c <= Math.floor((s.c[2] + r) / cs); c++) {
        const kk = key(a, b, c); let l = grid.get(kk); if (!l) grid.set(kk, (l = [])); l.push(k);
      }
    });
    const rIdx = near.map((s) => this.ramp(s.R)), cIdx = near.map((s) => (s.cup ? this.ramp(s.cup) : -1));
    for (let i = 0; i < this.n; i++) {
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      const l = grid.get(key(Math.floor(px / cs), Math.floor(py / cs), Math.floor(pz / cs))); if (!l) continue;
      for (const k of l) {
        const s = near[k], dx = px - s.c[0], dy = py - s.c[1], dz = pz - s.c[2];
        const nd = dx * s.n[0] + dy * s.n[1] + dz * s.n[2]; if (nd > s.r * 0.8 || nd < -s.r * 0.8) continue;
        const tx = dx - s.n[0] * nd, ty = dy - s.n[1] * nd, tz = dz - s.n[2] * nd, d = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (d > s.r * 1.3) continue;
        const ang = Math.atan2(tx * s.n[2] - tz * s.n[0] + ty * 0.3, ty * s.n[2] - tz * s.n[1] + tx * 0.3);
        const lobes = 5 + (k % 4), rr = s.r * (0.82 + 0.18 * Math.cos(ang * lobes + k) + 0.06 * Math.cos(ang * (lobes * 2 + 1)));
        if (d > rr) continue;
        const dT = (rr - d) * tpm;
        this.rampI[i] = rIdx[k];
        let st = d < rr * 0.45 ? 2 : 3.4;
        if (dT < 1) st = 1.2; else if (dT < 2.2) st = 4.6;
        if (Math.abs(d - rr * 0.62) * tpm < 0.6) st -= 1;
        if (cIdx[k] >= 0 && d < rr * 0.5 && h3(Math.floor((tx * tpm) / 2.5), Math.floor(((ty + tz) * tpm) / 2.5), k + seed) < 0.18) { this.rampI[i] = cIdx[k]; st = 3; }
        this.step[i] = st; this.mark[i] = 0;
        break;
      }
    }
  }
  /** a scar: a raised pale seam along a 3D polyline with dark stitched edges */
  /** the chart's surface bounds (for culling features that cannot touch it) */
  get box() {
    if (!this._box) { const P = this.gb.P, b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (let i = 0; i < this.n; i++) for (let k = 0; k < 3; k++) { const v = P[i * 3 + k]; if (v < b[k]) b[k] = v; if (v > b[k + 3]) b[k + 3] = v; } this._box = b; }
    return this._box;
  }
  private _box: number[] | null = null;
  scar(pts: V3[], width: number, R: number[]) {
    const P = this.gb.P, tpm = 1 / this.mpt, pad = width * 1.5 + this.mpt * 2;
    const lo = [0, 1, 2].map((k) => Math.min(...pts.map((q) => q[k])) - pad), hi = [0, 1, 2].map((k) => Math.max(...pts.map((q) => q[k])) + pad), b = this.box;
    if (lo[0] > b[3] || hi[0] < b[0] || lo[1] > b[4] || hi[1] < b[1] || lo[2] > b[5] || hi[2] < b[2]) return;
    for (let i = 0; i < this.n; i++) {
      const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
      if (px < lo[0] || px > hi[0] || py < lo[1] || py > hi[1] || pz < lo[2] || pz > hi[2]) continue;
      let bd = 1e9, bt = 0;
      for (let s = 0; s + 1 < pts.length; s++) {
        const a = pts[s], b = pts[s + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9;
        const t = cl(((px - a[0]) * ab[0] + (py - a[1]) * ab[1] + (pz - a[2]) * ab[2]) / L2, 0, 1);
        const d = Math.hypot(px - a[0] - ab[0] * t, py - a[1] - ab[1] * t, pz - a[2] - ab[2] * t);
        if (d < bd) { bd = d; bt = (s + t) / (pts.length - 1); }
      }
      const wv = width * (0.35 + 0.65 * Math.sin(Math.PI * bt)) ;
      if (bd > wv + this.mpt * 1.5) continue;
      const dT = (wv - bd) * tpm;
      this.rampI[i] = this.ramp(R);
      if (dT < 0) { this.mark[i] -= 1.3; continue; }
      this.step[i] = dT < 1.2 ? 2 : bd < wv * 0.35 ? 4.4 : 3.4; this.mark[i] = 0;
      if (Math.abs(Math.sin(bt * 60)) < 0.15 && dT > 1) this.step[i] -= 1; // the pulled skin across it
    }
  }
  /** glints: single bright texels where a glossy or wet surface turns to the light (sparse, on a lattice of cells) */
  glints(R: number[], o: { mask?: (i: number) => number; every?: number; seed?: number; size?: number } = {}) {
    const P = this.gb.P, N = this.gb.N, L = this.body.light, H = norm3([L[0], L[1] + 0.2, L[2] + 0.9]);
    for (let i = 0; i < this.n; i++) {
      const m = o.mask ? o.mask(i) : 1; if (m <= 0.3) continue;
      const sp = N[i * 3] * H[0] + N[i * 3 + 1] * H[1] + N[i * 3 + 2] * H[2]; if (sp < 0.93) continue;
      const c = cell3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], o.size ?? 0.4, o.seed ?? 23);
      if (c.f1 > this.mpt * 1.1 || h3(c.id, 4, 1) > (o.every ?? 0.5)) continue;
      this.over[i] = R[R.length - 1];
    }
  }
  /** an ink line on every texel within `wT` texels of the given mask's edge (sel-out between materials) */
  outlineMat(mat: number, R: number[], step = 0, wT = 1) {
    const { w, h } = this, M = this.gb.M;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (M[i] !== mat + 1) continue;
      let edge = false;
      for (let d = 1; d <= wT && !edge; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        const xx = this.ch.wrap ? (x + dx + w) % w : x + dx, yy = y + dy;
        if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
        if (M[yy * w + xx] !== mat + 1) { edge = true; break; }
      }
      if (edge) this.over[i] = R[step];
    }
  }
  /** mark texels whose surface is within `wT` texels of a crease line drawn on the cage (ink edges) by their
   *  curvature: valleys sharper than `k` get a dark line, ridges a lit edge */
  creaseInk(k = 0.9, o: { mask?: (i: number) => number; dark?: number; lit?: number } = {}) {
    const K = this.gb.K;
    for (let i = 0; i < this.n; i++) {
      const m = o.mask ? o.mask(i) : 1; if (m <= 0.02) continue;
      if (K[i] < -k) this.mark[i] -= (o.dark ?? 1.6) * m;
      else if (K[i] > k * 1.2) this.mark[i] += (o.lit ?? 0.9) * m;
    }
  }
  /** write everything to the page: step + light + marks rounded to a ramp step (hard clusters) */
  flush(o: { glow?: (i: number) => boolean; eye?: (i: number) => boolean } = {}) {
    const { w, h } = this, r = this.ch.reg!;
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      let c: number;
      if (this.over[i] >= 0) c = this.over[i];
      else {
        const R = this.rampT[this.rampI[i]] ?? RP('stone');
        const v = this.step[i] + this.shadeAt(i) + this.mark[i];
        c = R[cl(Math.round(v), 0, R.length - 1)];
      }
      r.set(x, y, c, o.glow?.(i) ? 192 : o.eye?.(i) ? 253 : this.alpha[i]);
    }
  }
}
const norm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export { oct, ss, cl, h3 };
