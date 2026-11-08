// Survivor body geometry: one skinned low-poly mesh per character, built from
// lofted cross-section rings (anatomical torso, tapering limbs that bend
// smoothly at elbows and knees, shaped head with jaw/cheekbones/nose/ears,
// hands with a thumb and fingers that curl into a fist, real shoe shapes,
// per-style hair shells, garment silhouettes) and textured from the
// character's own pixel-art texture page (see humanPaint.ts).
import * as THREE from 'three';
import type { Appearance, Outfit } from './humanRig';
import type { OutfitShape, ShellFeat } from './humanClothes';
import { shapeOf, noseOf, noseK, earK, suitLooks, mouthOf } from './humanLooks';

// ------------------------------------------------------------------ skeleton
export const BONES = [
  'hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
  'fing1L', 'fing2L', 'thumbL', 'fing1R', 'fing2R', 'thumbR', 'lids',
] as const;
export type BoneName = typeof BONES[number];
export const BI = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;
export const BONE_PARENT: Record<BoneName, BoneName | ''> = {
  hips: '', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  uarmL: 'chest', farmL: 'uarmL', handL: 'farmL', uarmR: 'chest', farmR: 'uarmR', handR: 'farmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR',
  fing1L: 'handL', fing2L: 'fing1L', thumbL: 'handL', fing1R: 'handR', fing2R: 'fing1R', thumbR: 'handR', lids: 'head',
};

export interface Dims {
  s: number; bw: number; mass: number; fem: number; headS: number;
  /** local offset of each bone from its parent (bind pose) */
  off: Record<BoneName, [number, number, number]>;
  /** bind-pose position of each bone in body space */
  rest: Record<BoneName, [number, number, number]>;
  /** hip height (y of the hips bone) at rest without shoes */
  hipY: number;
}

export function rigDims(app: Appearance): Dims {
  const s = app.height || 1;
  const fem = app.bodyShape ?? 0.3;
  const b = String(app.build);
  // the reference body is a lean adult; 'slim' and 'wiry' are properly thin, 'heavy' and 'stocky' carry real bulk
  const bw = b === 'slim' ? 0.88 : b === 'broad' ? 1.1 : b === 'wiry' ? 0.92 : b === 'heavy' ? 1.1 : b === 'stocky' ? 1.13 : 1;
  const mass = b === 'slim' ? 0.8 : b === 'broad' ? 1.14 : b === 'wiry' ? 0.74 : b === 'heavy' ? 1.34 : b === 'stocky' ? 1.2 : 1;
  // a life-size head: chin to crown about 1/7.5 of the standing height
  const headS = 0.955 - fem * 0.03;
  // shoulder joints set in and down: a natural slope from the neck, not a coat hanger
  const sh = 0.17 * (0.55 + 0.45 * bw) * (1 - 0.07 * fem);
  const hx = 0.082 * (0.6 + 0.4 * bw) * (1 + 0.08 * fem);
  const off = {} as Dims['off'];
  const set = (b: BoneName, x: number, y: number, z: number) => { off[b] = [x, y, z]; };
  set('hips', 0, 0.94 * s, 0);
  set('spine', 0, 0.07 * s, 0);
  set('chest', 0, 0.2 * s, 0);
  set('neck', 0, 0.27 * s, -0.008 * s);
  // a longer neck carrying the smaller head
  set('head', 0, 0.078 * s, 0.012 * s);
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    set(('uarm' + side) as BoneName, k * sh * s, 0.196 * s, -0.012 * s);
    set(('farm' + side) as BoneName, 0, -0.285 * s, 0);
    set(('hand' + side) as BoneName, 0, -0.25 * s, 0);
    set(('thigh' + side) as BoneName, k * hx * s, -0.02 * s, 0);
    set(('shin' + side) as BoneName, 0, -0.43 * s, 0);
    set(('foot' + side) as BoneName, 0, -0.42 * s, 0);
    set(('fing1' + side) as BoneName, 0, -0.088 * s, 0);
    set(('fing2' + side) as BoneName, 0, -0.04 * s, 0);
    set(('thumb' + side) as BoneName, -k * 0.004 * s, -0.022 * s, 0.026 * s);
  }
  set('lids', 0, 0.104 * s * headS, 0.09 * s * headS);
  const rest = {} as Dims['rest'];
  for (const b of BONES) {
    const p = BONE_PARENT[b]; const o = off[b];
    rest[b] = p ? [rest[p][0] + o[0], rest[p][1] + o[1], rest[p][2] + o[2]] : [o[0], o[1], o[2]];
  }
  return { s, bw, mass, fem, headS, off, rest, hipY: 0.94 * s };
}

// ------------------------------------------------------------------ texture page layout
export const PAGE = 256;
export const PAD = 1;
export interface Reg { x: number; y: number; w: number; h: number }
export type RegKey = 'HEAD' | 'HAIR' | 'TORSO' | 'NECK' | 'ARM_L' | 'ARM_R' | 'LEG_L' | 'LEG_R' | 'HAND_L' | 'HAND_R'
  | 'FOOT_L' | 'FOOT_R' | 'SKIRT' | 'HAT' | 'MASK' | 'COLLAR' | 'GEAR' | 'PACK' | 'LIDS' | 'WATCH';
/**
 * Region rectangles (x, y, w, h; PAD free pixels round each) of the 256 x 256
 * page. The low-poly people (src/entities/gg) pack every face of a body part
 * inside its region, so a texel's region still tells which part it belongs
 * to (the creator's part picking, the creatures that repaint a page region).
 * HEAD holds the painted face block on its left and the rest of the head.
 * Close-up rigs use the same layout at twice the size.
 */
const LAYOUT: Record<RegKey, [number, number, number, number]> = {
  HEAD: [1, 1, 111, 95], HAIR: [114, 1, 66, 61], HAT: [182, 1, 73, 33], MASK: [182, 36, 73, 26],
  NECK: [114, 64, 44, 32], COLLAR: [160, 64, 46, 14], WATCH: [208, 64, 22, 14], LIDS: [232, 64, 23, 14], GEAR: [160, 80, 95, 16],
  LEG_L: [1, 98, 39, 157], LEG_R: [42, 98, 39, 157], TORSO: [83, 98, 100, 106], ARM_L: [185, 98, 34, 106], ARM_R: [221, 98, 34, 106],
  SKIRT: [83, 206, 61, 49], PACK: [146, 206, 50, 49], FOOT_L: [198, 206, 27, 23], FOOT_R: [228, 206, 27, 23], HAND_L: [198, 231, 27, 24], HAND_R: [228, 231, 27, 24],
};
/** texels per pixel-art pixel in a region (the face is painted at 2x) */
export const REG_K: Partial<Record<RegKey, number>> = { HEAD: 2, LIDS: 2 };
export const REG = {} as Record<RegKey, Reg>;
(() => {
  for (const [k, [x, y, w, h]] of Object.entries(LAYOUT) as [RegKey, number[]][]) {
    REG[k] = { x, y, w, h };
    if (x - PAD < 0 || y - PAD < 0 || x + w + PAD > PAGE || y + h + PAD > PAGE) throw new Error('human page overflow: ' + k);
  }
})();

/** ranges (reference metres) mapped onto each region's v axis (v=0 bottom row, 1 top row) */
export const VMAP = {
  TORSO: [0.8, 1.5],          // body space y
  ARM: [-0.54, 0.07],         // uarm-local y
  LEG: [-0.87, 0.06],         // thigh-local y
  HEAD: [-0.03, 0.215],       // head-local y
  HAIR: [-0.26, 0.23],        // head-local y
  NECK: [1.44, 1.63],         // body space y
  SKIRT: [0.5, 1.02],         // body space y
};
export const vOf = (range: number[], y: number) => (y - range[0]) / (range[1] - range[0]);
/** sub-rectangle of a region (u0, v0, u1, v1 in region units; v=0 is the bottom row) */
export const subReg = (r: Reg, u0: number, v0: number, u1: number, v1: number): Reg => ({ x: r.x + u0 * r.w, y: r.y + (1 - v1) * r.h, w: (u1 - u0) * r.w, h: (v1 - v0) * r.h });

// ------------------------------------------------------------------ builder
type Wt = number[];   // [bone, w, bone, w, ...]
type V3 = number[];

export class SkinBuilder {
  P: number[] = []; UV: number[] = []; C: number[] = []; SI: number[] = []; SW: number[] = []; I: number[] = []; G: number[] = [];

  vert(p: V3, px: number, py: number, w: Wt, g: number, c = 1): number {
    this.P.push(p[0], p[1], p[2]);
    this.UV.push(px / PAGE, 1 - py / PAGE);
    this.C.push(c, c, c);
    this.G.push(g);
    let tot = 0;
    const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    for (let k = 0; k < 4 && k * 2 < w.length; k++) { si[k] = w[k * 2]; sw[k] = Math.max(0, w[k * 2 + 1]); tot += sw[k]; }
    for (let k = 0; k < 4; k++) sw[k] = tot > 0 ? sw[k] / tot : (k === 0 ? 1 : 0);
    this.SI.push(si[0], si[1], si[2], si[3]); this.SW.push(sw[0], sw[1], sw[2], sw[3]);
    return this.P.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) { this.I.push(a, b, c); }
  pos(i: number): V3 { return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]]; }

  /** emit a triangle with outward winding relative to `inside` */
  triOut(a: number, b: number, c: number, inside: V3, flip = false) {
    const A = this.pos(a), B = this.pos(b), C = this.pos(c);
    const n = cross(sub(B, A), sub(C, A));
    const m = [(A[0] + B[0] + C[0]) / 3 - inside[0], (A[1] + B[1] + C[1]) / 3 - inside[1], (A[2] + B[2] + C[2]) / 3 - inside[2]];
    const out = dot(n, m) >= 0;
    if (out !== flip) this.tri(a, b, c); else this.tri(a, c, b);
  }

  /**
   * Loft through rings of equal point count. Each ring: pts (with the seam
   * point duplicated at the end), v (0..1 in the region), weights. us gives the
   * u coordinate per point. Poles close the ends.
   */
  loft(rings: { pts: V3[]; v: number; w: Wt | ((p: V3, j: number) => Wt); c?: number }[], us: number[], reg: Reg, g: number,
    o: { start?: V3 | null; end?: V3 | null; startV?: number; endV?: number; startW?: Wt; endW?: Wt; double?: boolean; doubleRows?: (i: number) => boolean; flip?: boolean; skip?: (j: number) => boolean; alt?: boolean } = {}) {
    const n = us.length;
    const idx: number[][] = [];
    const cents: V3[] = rings.map((r) => centroid(r.pts.slice(0, n - 1)));
    for (const r of rings) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        const p = r.pts[j];
        const w = typeof r.w === 'function' ? r.w(p, j) : r.w;
        row.push(this.vert(p, reg.x + us[j] * reg.w, reg.y + (1 - r.v) * reg.h, w, g, r.c ?? 1));
      }
      idx.push(row);
    }
    const emit = (flip: boolean, gg: number, rows: number[][], only?: (i: number) => boolean) => {
      for (let i = 0; i + 1 < rows.length; i++) {
        if (only && !only(i)) continue;
        const ins = mid(cents[i], cents[i + 1]);
        for (let j = 0; j + 1 < n; j++) {
          if (o.skip?.(j)) continue;
          const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
          // choose winding from the larger triangle of the quad
          const A = this.pos(a), B = this.pos(b), C = this.pos(c), D = this.pos(d);
          let nrm = cross(sub(B, A), sub(C, A));
          if (len(nrm) < 1e-10) nrm = cross(sub(C, A), sub(D, A));
          const m = sub(mid(A, C), ins);
          const out = dot(nrm, m) >= 0;
          // checkerboard diagonals: the facets read as triangles, not as stripes round the body
          if (o.alt && ((i + j) & 1)) { if (out !== flip) { this.tri(a, b, d); this.tri(b, c, d); } else { this.tri(a, d, b); this.tri(b, d, c); } }
          else if (out !== flip) { this.tri(a, b, c); this.tri(a, c, d); } else { this.tri(a, c, b); this.tri(a, d, c); }
        }
      }
      void gg;
    };
    emit(!!o.flip, g, idx);
    if (o.double) {
      // inner faces: duplicate vertices in their own smoothing group so normals face inward
      const inner = rings.map((r, i) => r.pts.map((p, j) => {
        const w = typeof r.w === 'function' ? r.w(p, j) : r.w;
        return this.vert(p, reg.x + us[j] * reg.w, reg.y + (1 - r.v) * reg.h, w, g + 5000, (r.c ?? 1) * 0.7);
      }));
      void inner;
      emit(!o.flip, g + 5000, inner, o.doubleRows);
    }
    const all = centroid(cents);
    const pole = (P: V3, ring: number[], v: number, w: Wt | undefined, rw: Wt | ((p: V3, j: number) => Wt), rp: V3[]) => {
      for (let j = 0; j + 1 < n; j++) {
        if (o.skip?.(j)) continue;
        const ww = w || (typeof rw === 'function' ? rw(rp[j], j) : rw);
        const pi = this.vert(P, reg.x + (us[j] + us[j + 1]) / 2 * reg.w, reg.y + (1 - v) * reg.h, ww, g);
        this.triOut(pi, ring[j], ring[j + 1], all, !!o.flip);
      }
    };
    if (o.start) pole(o.start, idx[0], o.startV ?? rings[0].v, o.startW, rings[0].w, rings[0].pts);
    if (o.end) pole(o.end, idx[idx.length - 1], o.endV ?? rings[rings.length - 1].v, o.endW, rings[rings.length - 1].w, rings[rings.length - 1].pts);
    return idx;
  }

  /** box with every face mapped onto (a sub-rect of) a region; flat shaded */
  box(c: V3, size: V3, rot: THREE.Matrix4 | null, reg: Reg, w: Wt, sub?: [number, number, number, number], col = 1) {
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const corners: V3[] = [];
    for (const z of [-hz, hz]) for (const y of [-hy, hy]) for (const x of [-hx, hx]) {
      const v = new THREE.Vector3(x, y, z);
      if (rot) v.applyMatrix4(rot);
      corners.push([c[0] + v.x, c[1] + v.y, c[2] + v.z]);
    }
    const [u0, v0, u1, v1] = sub || [0, 0, 1, 1];
    const faces = [[0, 1, 3, 2], [5, 4, 6, 7], [4, 0, 2, 6], [1, 5, 7, 3], [2, 3, 7, 6], [4, 5, 1, 0]];
    for (const f of faces) {
      const ids = f.map((k, i) => {
        const uu = i === 0 || i === 3 ? u0 : u1, vv = i < 2 ? v0 : v1;
        return this.vert(corners[k], reg.x + uu * reg.w, reg.y + (1 - vv) * reg.h, w, -1, col);
      });
      this.triOut(ids[0], ids[1], ids[2], c); this.triOut(ids[0], ids[2], ids[3], c);
    }
  }

  build(): THREE.BufferGeometry {
    const nv = this.P.length / 3;
    const N = new Float32Array(nv * 3);
    for (let t = 0; t < this.I.length; t += 3) {
      const a = this.I[t], b = this.I[t + 1], c = this.I[t + 2];
      const A = this.pos(a), B = this.pos(b), C = this.pos(c);
      const n = cross(sub(B, A), sub(C, A));
      for (const k of [a, b, c]) { N[k * 3] += n[0]; N[k * 3 + 1] += n[1]; N[k * 3 + 2] += n[2]; }
    }
    // merge normals of coincident vertices inside a smoothing group (seams, poles)
    const groups = new Map<string, number[]>();
    for (let i = 0; i < nv; i++) {
      const g = this.G[i]; if (g < 0) continue;
      const key = g + ':' + Math.round(this.P[i * 3] * 2000) + ',' + Math.round(this.P[i * 3 + 1] * 2000) + ',' + Math.round(this.P[i * 3 + 2] * 2000);
      let l = groups.get(key); if (!l) groups.set(key, l = []); l.push(i);
    }
    for (const l of groups.values()) {
      if (l.length < 2) continue;
      let x = 0, y = 0, z = 0;
      for (const i of l) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; }
      for (const i of l) { N[i * 3] = x; N[i * 3 + 1] = y; N[i * 3 + 2] = z; }
    }
    for (let i = 0; i < nv; i++) {
      const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
      N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    const atl = new Float32Array(nv * 4); for (let i = 0; i < nv; i++) { atl[i * 4 + 2] = 1; atl[i * 4 + 3] = 1; }
    g.setAttribute('aAtlas', new THREE.BufferAttribute(atl, 4));
    g.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6);
    return g;
  }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
function centroid(ps: V3[]): V3 { let x = 0, y = 0, z = 0; for (const p of ps) { x += p[0]; y += p[1]; z += p[2]; } const n = Math.max(1, ps.length); return [x / n, y / n, z / n]; }
const gauss = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** evenly spaced u coordinates for n segments (+ seam point) */
export const usFor = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);
/** angle (from front +z toward +x) for segment point i of n, seam at the back */
export const thOf = (i: number, n: number, th0 = -Math.PI) => th0 + (Math.PI * 2 * i) / n;

/** superellipse cross-section ring around a vertical axis */
function ellRing(y: number, cx: number, cz: number, rx: number, rf: number, rb: number, n: number, sq: number, mirror: number,
  bump?: (th: number) => number, th0 = -Math.PI): V3[] {
  const pts: V3[] = [];
  const e = 2 / sq;
  for (let i = 0; i <= n; i++) {
    const th = th0 + (Math.PI * 2 * i) / n;
    const sx = Math.sin(th), cz_ = Math.cos(th);
    const ex = Math.sign(sx) * Math.pow(Math.abs(sx), e), ez = Math.sign(cz_) * Math.pow(Math.abs(cz_), e);
    const k = 1 + (bump ? bump(th) : 0);
    pts.push([mirror * (cx + ex * rx * k), y, cz + ez * (cz_ >= 0 ? rf : rb) * k]);
  }
  return pts;
}

/** one point of an ellRing: angle th, centre (cx, cz), radii, squareness, mirror, bump factor kk, height y */
function superPt(th: number, cx: number, cz: number, rx: number, rf: number, rb: number, sq: number, mirror: number, kk: number, y: number): V3 {
  const e = 2 / sq;
  const sx = Math.sin(th), cz_ = Math.cos(th);
  const ex = Math.sign(sx) * Math.pow(Math.abs(sx), e), ez = Math.sign(cz_) * Math.pow(Math.abs(cz_), e);
  return [mirror * (cx + ex * rx * kk), y, cz + ez * (cz_ >= 0 ? rf : rb) * kk];
}

/**
 * A modelled garment detail (humanClothes ShellFeat) standing off a body
 * surface: a chamfered panel (pockets, flaps, number tape, buckles, pouches), a
 * ridge (zips, plackets) or a raised band all the way round (belts,
 * waistbands). UVs come from the same angle / height mapping the painters use,
 * so the painted pocket, zip or buckle lands on its panel.
 */
function shellFeature(B: SkinBuilder, f: ShellFeat, surf: (y: number, deg: number, off: number) => V3, wfn: (y: number) => Wt, reg: Reg, range: number[], g: number) {
  const t = f.t ?? 0.004;
  const dpx = 360 / reg.w, ypx = (range[1] - range[0]) / reg.h;
  const uvOf = (deg: number, y: number): [number, number] => [reg.x + (0.5 + deg / 360) * reg.w, reg.y + (1 - vOf(range, y)) * reg.h];
  const inside = (y: number, deg: number) => surf(y, deg, -0.06);
  // a grid of columns (deg) x rows (y); `raised(i, j)` says which points stand off by t (the rest sit on the cloth)
  const grid = (cols: number[], rows: number[], raised: (i: number, j: number) => boolean, closed = false, uvc?: (i: number, j: number) => [number, number]) => {
    const id: number[][] = rows.map((y, j) => cols.map((deg, i) => {
      const [u, v] = uvc ? uvc(i, j) : uvOf(deg, y);
      return B.vert(surf(y, deg, raised(i, j) ? t : 0.0004), u, v, wfn(y), -1);
    }));
    for (let j = 0; j + 1 < rows.length; j++) for (let i = 0; i + 1 < cols.length; i++) {
      const ins = inside((rows[j] + rows[j + 1]) / 2, (cols[i] + cols[i + 1]) / 2);
      const a = id[j][i], b = id[j][i + 1], c = id[j + 1][i + 1], d = id[j + 1][i];
      if ((i + j) & 1) { B.triOut(a, b, d, ins); B.triOut(b, c, d, ins); } else { B.triOut(a, b, c, ins); B.triOut(a, c, d, ins); }
    }
    void closed;
  };
  if (f.kind === 'band') {
    const y0 = f.y, y1 = f.y - Math.max(1, f.h) * ypx, e = Math.min(ypx * 0.4, (y0 - y1) * 0.3);
    const n = 16, cols = Array.from({ length: n + 1 }, (_, i) => -180 + (360 * i) / n);
    grid(cols, [y0 + e * 0.3, y0 - e, y1 + e, y1 - e * 0.3], (_i, j) => j === 1 || j === 2, true, (i, j) => uvOf(cols[i], [y0, y0 - e, y1 + e, y1][j]));
    return;
  }
  if (f.kind === 'zip') {
    const y0 = f.y, y1 = f.y1 ?? f.y - 0.2, hw = (f.w * dpx) / 2;
    const nv = Math.max(2, Math.ceil((y0 - y1) / 0.05));
    const rows = [y0, ...Array.from({ length: nv - 1 }, (_, i) => y0 - ((y0 - y1) * (i + 1)) / nv), y1];
    grid([f.deg - hw * 1.6, f.deg - hw * 0.5, f.deg + hw * 0.5, f.deg + hw * 1.6], rows, (i, j) => (i === 1 || i === 2) && j > 0 && j < rows.length - 1 || (i === 1 || i === 2) && rows.length <= 2);
    return;
  }
  // panels: patch pockets, flaps, tapes, boxes (buckles, pouches)
  const hw = (f.w * dpx) / 2, y0 = f.y, y1 = f.y - f.h * ypx;
  const box = f.kind === 'box';
  const ed = Math.min(hw * 0.35, dpx * (box ? 0.35 : 0.6)), ey = Math.min((y0 - y1) * 0.3, ypx * (box ? 0.35 : 0.6));
  const nu = Math.max(1, Math.ceil((hw * 2) / 14));
  const inner = Array.from({ length: nu + 1 }, (_, i) => f.deg - hw + ed + ((hw * 2 - ed * 2) * i) / nu);
  const cols = [f.deg - hw, ...inner, f.deg + hw];
  const rows = [y0, y0 - ey, y1 + ey, y1];
  // the rim samples the painted outline; the face samples the inside of the pocket
  grid(cols, rows, (i, j) => i > 0 && i < cols.length - 1 && j > 0 && j < 3, false, (i, j) => uvOf(Math.min(f.deg + hw - dpx * 0.5, Math.max(f.deg - hw + dpx * 0.5, cols[i])), Math.min(y0 - ypx * 0.5, Math.max(y1 + ypx * 0.5, rows[j]))));
}

// ------------------------------------------------------------------ profiles (reference body, s = 1)
interface Row { y: number; rx: number; rf: number; rb: number; sq?: number; cz?: number }
// a lean adult: narrow waist, a ribcage that is deeper than it is square, shoulders that slope from the neck
const TORSO_ROWS: Row[] = [
  { y: 0.815, rx: 0.062, rf: 0.05, rb: 0.058 },
  { y: 0.86, rx: 0.134, rf: 0.076, rb: 0.088 },
  { y: 0.93, rx: 0.146, rf: 0.08, rb: 0.098 },
  { y: 1.0, rx: 0.136, rf: 0.078, rb: 0.086 },
  { y: 1.08, rx: 0.121, rf: 0.077, rb: 0.074 },
  { y: 1.16, rx: 0.126, rf: 0.083, rb: 0.077 },
  { y: 1.25, rx: 0.137, rf: 0.09, rb: 0.083 },
  { y: 1.32, rx: 0.141, rf: 0.089, rb: 0.086, sq: 2.15 },
  { y: 1.37, rx: 0.143, rf: 0.077, rb: 0.08, sq: 2.3 },
  { y: 1.405, rx: 0.124, rf: 0.064, rb: 0.07, sq: 2.25 },
  { y: 1.44, rx: 0.088, rf: 0.056, rb: 0.062, sq: 2.1 },
  { y: 1.475, rx: 0.056, rf: 0.05, rb: 0.052, cz: -0.006 },
];
// thin arms: a small deltoid cap, a slender upper arm, a bony elbow, the forearm tapering to a narrow wrist
const ARM_ROWS: Row[] = [
  { y: 0.01, rx: 0.021, rf: 0.027, rb: 0.027 },
  { y: -0.01, rx: 0.035, rf: 0.039, rb: 0.039 },
  { y: -0.055, rx: 0.038, rf: 0.039, rb: 0.039 },
  { y: -0.12, rx: 0.035, rf: 0.037, rb: 0.035 },
  { y: -0.255, rx: 0.028, rf: 0.028, rb: 0.031 },
  { y: -0.3, rx: 0.028, rf: 0.027, rb: 0.033 },
  { y: -0.345, rx: 0.032, rf: 0.034, rb: 0.03 },
  { y: -0.42, rx: 0.026, rf: 0.028, rb: 0.024 },
  { y: -0.485, rx: 0.017, rf: 0.023, rb: 0.021 },
  { y: -0.535, rx: 0.016, rf: 0.023, rb: 0.021 },
];
// long thin legs: the thigh tapers hard to a knobbly knee, a lean calf, a narrow ankle
const LEG_ROWS: Row[] = [
  { y: 0.055, rx: 0.055, rf: 0.058, rb: 0.062 },
  { y: -0.01, rx: 0.071, rf: 0.072, rb: 0.077 },
  { y: -0.1, rx: 0.066, rf: 0.068, rb: 0.069 },
  { y: -0.22, rx: 0.056, rf: 0.058, rb: 0.056 },
  { y: -0.34, rx: 0.045, rf: 0.048, rb: 0.045 },
  { y: -0.405, rx: 0.041, rf: 0.045, rb: 0.04 },
  { y: -0.445, rx: 0.041, rf: 0.046, rb: 0.039 },
  { y: -0.49, rx: 0.038, rf: 0.04, rb: 0.044 },
  { y: -0.57, rx: 0.04, rf: 0.037, rb: 0.051 },
  { y: -0.67, rx: 0.033, rf: 0.032, rb: 0.039 },
  { y: -0.77, rx: 0.024, rf: 0.026, rb: 0.027 },
  { y: -0.83, rx: 0.022, rf: 0.025, rb: 0.024 },
  { y: -0.865, rx: 0.024, rf: 0.029, rb: 0.028 },
];

function sampleRows(rows: Row[], y: number): Row {
  // rows may be ascending or descending in y
  const asc = rows[0].y < rows[rows.length - 1].y;
  const r = asc ? rows : [...rows].reverse();
  if (y <= r[0].y) return { ...r[0], y };
  if (y >= r[r.length - 1].y) return { ...r[r.length - 1], y };
  for (let i = 0; i + 1 < r.length; i++) {
    const a = r[i], b = r[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1);
      const L = (p: number, q: number) => p + (q - p) * t;
      return { y, rx: L(a.rx, b.rx), rf: L(a.rf, b.rf), rb: L(a.rb, b.rb), sq: L(a.sq ?? 2, b.sq ?? 2), cz: L(a.cz ?? 0, b.cz ?? 0) };
    }
  }
  return { ...r[0], y };
}

/** ring y-list with doubled rings at cloth breaks (hems make a visible step) */
function ringYs(rows: Row[], breaks: number[]): { y: number; eps: number }[] {
  const lo = Math.min(rows[0].y, rows[rows.length - 1].y), hi = Math.max(rows[0].y, rows[rows.length - 1].y);
  const ys = rows.map((r) => ({ y: r.y, eps: 0 }));
  for (const b of breaks) {
    if (b <= lo + 0.005 || b >= hi - 0.005) continue;
    // drop base rows that sit right on top of a break
    for (let i = ys.length - 1; i >= 0; i--) if (ys[i].eps === 0 && Math.abs(ys[i].y - b) < 0.012) ys.splice(i, 1);
    ys.push({ y: b, eps: -1 }, { y: b, eps: 1 });
  }
  const desc = rows[0].y > rows[rows.length - 1].y;
  ys.sort((a, b) => (desc ? b.y - a.y || b.eps - a.eps : a.y - b.y || a.eps - b.eps));
  return ys;
}

// ------------------------------------------------------------------ main build
export interface BuildCond {
  splints: Set<string>;     // body part keys
  bandages: Set<string>;
  /** severed body parts (limb loss): those segments are not built and the limb is capped at the cut */
  severed?: Set<string>;
  /** level of detail: 0 sculpted (default), 1 coarse head and trunk, no shell details (crowds, distant bodies) */
  lod?: number;
}

/** where a limb ends when a part is cut off (reference metres: arms in upper-arm space, legs in thigh space) */
export const CUT_Y = { hand: -0.5, farm: -0.3, foot: -0.8, shin: -0.42 } as const;

/**
 * Where a stump sits for a severed part: the bone it hangs from, the position in that bone's space and
 * the limb radius there (with clothing) — for stump caps, bandages, tourniquets and prosthetics.
 */
export function cutSpec(part: string, d: Dims, sh?: OutfitShape): { bone: BoneName; pos: [number, number, number]; r: number; side: 'L' | 'R' } | null {
  const side = part.endsWith('_l') ? 'L' : 'R', k = side === 'L' ? 1 : -1;
  const s = d.s, fem = d.fem;
  const armFm = (1 - fem * 0.12) * (0.82 + 0.18 * d.mass), legFm = 0.85 + 0.15 * d.mass;
  const sleeveY = !sh ? 999 : sh.sleeve === 'long' ? -0.515 : sh.sleeve === 'short' ? -0.15 : sh.sleeve === 'cap' ? -0.03 : 999;
  const pantsHem = !sh ? 1 : sh.legKind === 'pants' ? -0.835 + sh.legLen : sh.legKind === 'shorts' ? -0.2 : sh.legKind === 'brief' ? 0.02 : 1;
  const armR = (y: number) => { const r = sampleRows(ARM_ROWS, y); return (Math.max(r.rx, r.rf, r.rb) * armFm + (sh && y > sleeveY ? sh.armThick : 0)) * s; };
  const legR = (y: number) => { const r = sampleRows(LEG_ROWS, y); return (Math.max(r.rx, r.rf, r.rb) * legFm + (sh && y > pantsHem ? sh.legThick : 0)) * s; };
  switch (part.slice(0, -2)) {
    case 'hand': return { bone: ('farm' + side) as BoneName, pos: [0, (CUT_Y.hand + 0.285) * s, 0], r: armR(CUT_Y.hand), side };
    case 'farm': return { bone: ('uarm' + side) as BoneName, pos: [0, CUT_Y.farm * s, 0], r: armR(CUT_Y.farm), side };
    case 'uarm': { const o = d.off[('uarm' + side) as BoneName]; return { bone: 'chest', pos: [o[0] + k * 0.012 * s, o[1] - 0.03 * s, o[2]], r: 0.05 * s * armFm, side }; }
    case 'foot': return { bone: ('shin' + side) as BoneName, pos: [0, (CUT_Y.foot + 0.43) * s, 0], r: legR(CUT_Y.foot), side };
    case 'shin': return { bone: ('thigh' + side) as BoneName, pos: [0, CUT_Y.shin * s, 0], r: legR(CUT_Y.shin), side };
    case 'thigh': { const o = d.off[('thigh' + side) as BoneName]; return { bone: 'hips', pos: [o[0] + k * 0.01 * s, o[1] - 0.09 * s, o[2]], r: 0.075 * s * legFm, side }; }
  }
  return null;
}

export interface BuildResult { geometry: THREE.BufferGeometry; tris: number; sole: number }

export function buildBody(app: Appearance, o: Outfit, sh: OutfitShape, d: Dims, cond: BuildCond): BuildResult {
  ({ o, sh } = suitLooks(app, o, sh));
  const lod = cond.lod ?? HEAD_LOD;
  if (lod) sh = { ...sh, feats: undefined };
  const prevLod = HEAD_LOD; HEAD_LOD = lod;
  const B = new SkinBuilder();
  const s = d.s, fem = d.fem, mass = d.mass, bw = d.bw;
  const R = d.rest;
  const sole = sh.sole;

  // ---------------- torso
  {
    const reg = REG.TORSO;
    const thick = (y: number) => {
      let t = 0;
      if (sh.legKind !== 'none' && y <= sh.waist) t += sh.legThick * 0.8;
      if (sh.top && y >= sh.topHem) t += sh.topThick;
      if (sh.outer && y >= sh.outerHem) t += sh.outerThick;
      if (sh.tuck && y <= sh.waist + 0.005 && y > sh.waist - 0.07 && sh.top) t += 0.004;
      return t;
    };
    const breaks: number[] = [];
    if (sh.top) breaks.push(sh.topHem);
    if (sh.outer) breaks.push(sh.outerHem);
    const ys = ringYs(TORSO_ROWS, breaks);
    const coat = sh.outer ? 0.55 : sh.top ? 0.85 : 1;
    const bump = (th: number, y: number) => {
      let k = 0;
      // bust / pecs
      const chest = gauss(y, 1.255, 0.045);
      if (chest > 0.01) {
        const side = gauss(Math.abs(angd(th, 0)), 0.48, 0.33);
        k += chest * side * (fem * 0.2 + (1 - fem) * 0.05 * mass) * coat;
      }
      // under-bust crease
      k -= gauss(y, 1.185, 0.02) * gauss(Math.abs(th), 0.48, 0.35) * fem * 0.05 * coat;
      // buttocks
      k += gauss(y, 0.915, 0.05) * gauss(Math.abs(angd(th, Math.PI)), 0.45, 0.4) * (0.05 + fem * 0.06) * coat;
      // shoulder blades
      k += gauss(y, 1.31, 0.05) * gauss(Math.abs(angd(th, Math.PI)), 0.6, 0.3) * 0.035 * coat;
      // spine groove
      k -= gauss(y, 1.15, 0.2) * gauss(Math.abs(angd(th, Math.PI)), 0, 0.14) * 0.035 * coat;
      // belly for broad builds
      k += gauss(y, 1.07, 0.06) * gauss(th, 0, 0.7) * (mass - 1) * 0.6;
      // navel dip
      k -= gauss(y, 1.035, 0.012) * gauss(th, 0, 0.08) * 0.03 * (sh.top ? 0 : 1);
      // bare skin: collarbones, the line down the belly
      if (!sh.top && !sh.outer) {
        k += gauss(y, 1.445, 0.012) * gauss(Math.abs(th), 0.55, 0.3) * 0.03;
        k -= gauss(y, 1.12, 0.07) * gauss(th, 0, 0.1) * 0.025 * (1 - fem * 0.6);
      }
      // cloth: the top blouses over a tucked waist and ripples at a loose hem, folds drape from the armpits
      if (sh.top || sh.outer) {
        const fold = (a: number) => Math.sin(th * 7 + a) * 0.6 + Math.sin(th * 11 + a * 2.3) * 0.4;
        if (sh.tuck) k += gauss(y, sh.waist + 0.035, 0.022) * (0.018 + 0.012 * fold(1.7));
        const hem = sh.outer ? sh.outerHem : sh.topHem;
        k += gauss(y, hem + 0.035, 0.03) * 0.012 * fold(0.4) * (sh.tuck && !sh.outer ? 0 : 1);
        k += gauss(y, 1.2, 0.05) * gauss(Math.abs(th), 1.25, 0.3) * 0.016 * fold(2.9);
      }
      return k;
    };
    const femX = (y: number) => 1 + fem * (-0.14 * gauss(y, 1.1, 0.07) - 0.08 * gauss(y, 1.33, 0.08) + 0.11 * gauss(y, 0.93, 0.05) + 0.05 * gauss(y, 0.86, 0.04));
    const wOf = (y: number): Wt => {
      if (y < 0.98) return [BI.hips, 1];
      if (y < 1.03) { const t = (y - 0.98) / 0.05; return [BI.hips, 1 - t, BI.spine, t]; }
      if (y < 1.13) return [BI.spine, 1];
      if (y < 1.22) { const t = (y - 1.13) / 0.09; return [BI.spine, 1 - t, BI.chest, t]; }
      if (y < 1.47) return [BI.chest, 1];
      return [BI.chest, 0.6, BI.neck, 0.4];
    };
    const n = lod ? 12 : 16;
    const rings = ys.map(({ y, eps }) => {
      const r = sampleRows(TORSO_ROWS, y);
      const t = thick(y + eps * 0.0005);
      const fx = femX(y);
      const rx = r.rx * bw * fx + t, rf = r.rf * mass + t, rb = r.rb * mass + t;
      const pts = ellRing(y * s, 0, (r.cz ?? 0) * s, rx * s, rf * s, rb * s, n, r.sq ?? 2.2, 1, (th) => bump(th, y));
      return { pts, v: vOf(VMAP.TORSO, y), w: wOf(y) };
    });
    B.loft(rings, usFor(n), reg, 1, { start: [0, 0.8 * s, -0.005], end: [0, 1.5 * s, -0.006 * s], startW: [BI.hips, 1], endW: [BI.chest, 0.5, BI.neck, 0.5], alt: true });
    // the same surface as a function, for the pockets, zips and belts that stand off it
    const surf = (y: number, deg: number, off: number): V3 => {
      const r = sampleRows(TORSO_ROWS, y);
      const t = thick(y) + off, fx = femX(y);
      const th = (deg * Math.PI) / 180;
      return superPt(th, 0, (r.cz ?? 0) * s, (r.rx * bw * fx + t) * s, (r.rf * mass + t) * s, (r.rb * mass + t) * s, r.sq ?? 2.2, 1, 1 + bump(th, y), y * s);
    };
    for (const f of sh.feats || []) if (f.part === 'torso') shellFeature(B, f, surf, wOf, reg, VMAP.TORSO, 1);
  }

  // ---------------- neck (+ collar / scarf)
  {
    const reg = REG.NECK;
    const nr = 0.05 * (0.8 + 0.2 * mass) * (1 - fem * 0.12);
    const ys = [1.44, 1.48, 1.52, 1.56, 1.6, 1.625];
    const n = 10;
    const hx = R.head[1];
    const rings = ys.map((y) => {
      const r = nr * (y < 1.47 ? 1.18 : y > 1.58 ? 0.97 : 1);
      // the Adam's apple, the two cords from behind the ears down to the collarbones, the nape
      const neckK = (th: number) => gauss(y, 1.52, 0.015) * gauss(th, 0, 0.3) * 0.16 * (1 - fem)
        + gauss(Math.abs(th), 0.75 - (y - 1.45) * 4, 0.22) * 0.07 * (1 - fem * 0.5) - gauss(Math.abs(th), 0.25, 0.15) * gauss(y, 1.47, 0.02) * 0.06
        + gauss(Math.abs(angd(th, Math.PI)), 0.55, 0.3) * gauss(y, 1.47, 0.03) * 0.12;
      return { pts: ellRing(y * s, 0, -0.008 * s, r * s, r * 1.04 * s, r * 1.02 * s, n, 2.1, 1, neckK), v: vOf(VMAP.NECK, y),
        w: (y * s < hx - 0.02 ? [BI.chest, y < 1.47 ? 0.7 : 0.15, BI.neck, y < 1.47 ? 0.3 : 0.85] : [BI.neck, 0.4, BI.head, 0.6]) as Wt };
    });
    B.loft(rings, usFor(n), reg, 2, { alt: true });
    if (sh.collar === 'shirt' || sh.collar === 'coat') {
      // folded collar: flared ring open at the front
      const cr = nr + 0.012 + (sh.collar === 'coat' ? 0.012 : 0);
      const cy0 = 1.47, cy1 = sh.collar === 'coat' ? 1.545 : 1.52;
      const rr = [
        { pts: ellRing(cy0 * s, 0, -0.012 * s, (cr + 0.012) * s, (cr + 0.02) * s, (cr + 0.006) * s, 10, 2, 1), v: 0.0, w: [BI.chest, 1] as Wt },
        { pts: ellRing(cy1 * s, 0, -0.014 * s, (cr + 0.004) * s, (cr + 0.008) * s, (cr + 0.004) * s, 10, 2, 1), v: 1.0, w: [BI.chest, 0.6, BI.neck, 0.4] as Wt },
      ];
      B.loft(rr, usFor(10), REG.COLLAR, 3, { double: true, skip: (j) => j === 4 || j === 5 });
    } else if (sh.collar === 'hood') {
      // hood bunched behind the neck
      const hy = [1.44, 1.49, 1.54, 1.575];
      const hr = [0.07, 0.085, 0.075, 0.04];
      const rr = hy.map((y, i) => ({ pts: ellRing(y * s, 0, -0.07 * s, hr[i] * 1.5 * s, hr[i] * 0.6 * s, hr[i] * s, 10, 2.2, 1), v: i / 3, w: [BI.chest, 1] as Wt }));
      B.loft(rr, usFor(10), REG.COLLAR, 4, { end: [0, 1.585 * s, -0.07 * s] });
    }
    if (sh.face === 'scarf') {
      const ry = [1.44, 1.48, 1.53, 1.575];
      const rr = ry.map((y, i) => ({ pts: ellRing(y * s, 0, -0.005 * s, (nr + 0.03 + (i === 1 ? 0.006 : 0)) * s, (nr + 0.034) * s, (nr + 0.028) * s, 10, 2.3, 1), v: i / 3, w: [BI.neck, i < 1 ? 0.4 : 1, BI.chest, i < 1 ? 0.6 : 0] as Wt }));
      B.loft(rr, usFor(10), REG.MASK, 5, {});
      // hanging tail
      B.box([0.04 * s, 1.36 * s, (nr + 0.05) * s], [0.06 * s, 0.2 * s, 0.018 * s], new THREE.Matrix4().makeRotationZ(0.08), REG.MASK, [BI.chest, 1], [0, 0, 1, 1]);
    }
  }

  // ---------------- arms + hands
  const sleeveY = sh.sleeve === 'long' ? -0.515 : sh.sleeve === 'short' ? -0.15 : sh.sleeve === 'cap' ? -0.03 : 999;
  const sev = cond.severed;
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    const U = BI[('uarm' + side) as BoneName], F = BI[('farm' + side) as BoneName], H = BI[('hand' + side) as BoneName];
    const ua = R[('uarm' + side) as BoneName];
    const reg = REG[('ARM_' + side) as RegKey];
    const lc = side.toLowerCase();
    // limb loss: no arm at all, or the arm ends at the elbow / wrist with a capped stump
    if (sev?.has('uarm_' + lc)) continue;
    const cutF = !!sev?.has('farm_' + lc), cutH = cutF || !!sev?.has('hand_' + lc);
    const cutY = cutF ? CUT_Y.farm : cutH ? CUT_Y.hand : null;
    const breaks: number[] = [];
    if (sleeveY < 1) breaks.push(sleeveY);
    if (sh.gloves && !cutH) breaks.push(-0.485);
    let ys = ringYs(ARM_ROWS, breaks);
    // sleeves: extra rings for the folds bunching inside the elbow and stacking above the cuff
    if (sleeveY < -0.3) { for (const y of [-0.235, -0.285, -0.32]) ys.push({ y, eps: 0 }); if (sleeveY < -0.45) for (const y of [-0.455, -0.478]) ys.push({ y, eps: 0 }); ys.sort((a, b) => b.y - a.y || b.eps - a.eps); }
    else if (sleeveY < 0.5 && sleeveY > -0.3) { ys.push({ y: sleeveY + 0.03, eps: 0 }); ys.sort((a, b) => b.y - a.y || b.eps - a.eps); }
    if (cutY !== null) { ys = ys.filter((r) => r.y > cutY + 0.008); ys.push({ y: cutY, eps: 0 }); }
    const fm = (1 - fem * 0.12) * (0.66 + 0.34 * mass);
    const wOf = (y: number): Wt => {
      if (y > 0.04) return [U, 0.8, BI.chest, 0.2];
      if (y > -0.25 || cutF) return [U, 1];
      if (y > -0.33) { const t = (y + 0.25) / -0.08; return [U, 1 - t, F, t]; }
      if (y > -0.5 || cutH) return [F, 1];
      const t = clamp01((y + 0.5) / -0.04); return [F, 1 - t * 0.5, H, t * 0.5];
    };
    const tOf = (yy: number) => {
      let t = 0;
      if (yy > sleeveY) t += sh.armThick + (yy > sleeveY + 0.02 || sh.sleeve !== 'short' ? 0 : 0.004);
      if (sh.gloves && yy < -0.485) t += 0.004;
      return t;
    };
    // muscle under the skin (deltoid cap, biceps, the forearm's belly), cloth folds over it
    const armBump = (th: number, y: number, t: number) => {
      const cloth = t > 0.003 && y > sleeveY;
      let b = (gauss(y, -0.03, 0.04) * gauss(Math.abs(th), 1.4, 0.7) * 0.07 + gauss(y, -0.13, 0.05) * gauss(th, 0.1, 0.6) * 0.06
        - gauss(y, -0.28, 0.03) * gauss(th, 0, 0.5) * 0.04 + gauss(y, -0.35, 0.04) * gauss(th, 0.6, 0.6) * 0.05) * (cloth ? 0.3 : 1);
      if (cloth) {
        const f = Math.sin(th * 3 + y * 90) * 0.6 + Math.sin(th * 5 - y * 140) * 0.4;
        b += gauss(y, -0.29, 0.035) * gauss(th, 0, 0.9) * 0.09 * (0.6 + 0.4 * f);       // bunched inside the elbow
        if (sh.sleeve === 'long') b += gauss(y, -0.475, 0.02) * 0.06 * (0.5 + 0.5 * f);    // stacked over the cuff
        if (sh.sleeve === 'short') b += gauss(y, sleeveY + 0.025, 0.02) * 0.08 * (0.6 + 0.4 * f);
      }
      return b;
    };
    const rings = ys.map(({ y, eps }) => {
      const r = sampleRows(ARM_ROWS, y);
      const yy = y + eps * 0.0005;
      const t = tOf(yy);
      const rx = r.rx * fm + t, rf = r.rf * fm + t, rb = r.rb * fm + t;
      const pts = ellRing(ua[1] + y * s, 0, ua[2], rx * s, rf * s, rb * s, 8, 2, k, (th) => armBump(th, y, t));
      for (const p of pts) p[0] += ua[0];
      return { pts, v: vOf(VMAP.ARM, y), w: wOf(y) };
    });
    B.loft(rings, usFor(8), reg, 10 + (k > 0 ? 0 : 1), {
      start: [ua[0] - k * 0.012 * s, ua[1] + 0.02 * s, ua[2]], startW: [U, 0.8, BI.chest, 0.2], alt: true,
      ...(cutY !== null ? { end: [ua[0], ua[1] + (cutY - 0.014) * s, ua[2]], endW: (cutF ? [U, 1] : [F, 1]) as Wt } : {}),
    });
    {
      const surf = (y: number, deg: number, off: number): V3 => {
        const r = sampleRows(ARM_ROWS, y), t = tOf(y) + off, th = (deg * Math.PI) / 180;
        const p = superPt(th, 0, ua[2], (r.rx * fm + t) * s, (r.rf * fm + t) * s, (r.rb * fm + t) * s, 2, k, 1 + armBump(th, y, tOf(y)), ua[1] + y * s);
        p[0] += ua[0];
        return p;
      };
      for (const f of sh.feats || []) if (f.part === 'arm' && (cutY === null || f.y - 0.05 > cutY)) shellFeature(B, f, surf, wOf, reg, VMAP.ARM, 12);
    }
    if (!cutH) hand(B, d, side, k, sh.gloves);
    // wrist monitor: a chunky band and face on the back of the left wrist
    if (side === 'L' && o.wrist && !cutF) {
      const r = sampleRows(ARM_ROWS, -0.47);
      const fm2 = (1 - fem * 0.12) * (0.66 + 0.34 * mass);
      const t = (sh.sleeve === 'long' ? sh.armThick : 0) + 0.006;
      const band = [-0.452, -0.49].map((y, i) => {
        const pts = ellRing(ua[1] + y * s, 0, ua[2], (r.rx * fm2 + t) * s, (r.rf * fm2 + t) * s, (r.rb * fm2 + t) * s, 8, 2, k);
        for (const p of pts) p[0] += ua[0];
        return { pts, v: i === 0 ? 0.45 : 0.0, w: [F, 1] as Wt };
      });
      B.loft(band, usFor(8), subReg(REG.WATCH, 0, 0, 1, 0.45), 15);
      const fx = ua[0] + k * (r.rx * fm2 + t + 0.006) * s;
      B.box([fx, ua[1] - 0.471 * s, ua[2]], [0.014 * s, 0.036 * s, 0.03 * s], null, REG.WATCH, [F, 1], [0, 0.5, 1, 1]);
    }
    // splints on the forearm
    if ((cond.splints.has('farm_' + side.toLowerCase()) && !cutF) || cond.splints.has('uarm_' + side.toLowerCase())) {
      const yy = cond.splints.has('farm_' + side.toLowerCase()) ? -0.41 : -0.14;
      const bone = yy < -0.3 ? F : U;
      for (const zz of [0.045, -0.045]) B.box([ua[0] + k * 0.005, ua[1] + yy * s, ua[2] + zz * s], [0.012 * s, 0.2 * s, 0.01 * s], null, REG.GEAR, [bone, 1], [0.55, 0, 1, 1]);
    }
  }

  // ---------------- legs + feet
  const pantsHem = sh.legKind === 'pants' ? -0.835 + sh.legLen : sh.legKind === 'shorts' ? -0.2 : sh.legKind === 'brief' ? 0.02 : -0.3;
  for (const [side, k] of [['L', 1], ['R', -1]] as const) {
    const T = BI[('thigh' + side) as BoneName], S = BI[('shin' + side) as BoneName], Ft = BI[('foot' + side) as BoneName];
    const th = R[('thigh' + side) as BoneName];
    const reg = REG[('LEG_' + side) as RegKey];
    const lc = side.toLowerCase();
    // limb loss: no leg, or it ends above the knee / at the ankle
    if (sev?.has('thigh_' + lc)) continue;
    const cutS = !!sev?.has('shin_' + lc), cutFt = cutS || !!sev?.has('foot_' + lc);
    const cutY = cutS ? CUT_Y.shin : cutFt ? CUT_Y.foot : null;
    const breaks: number[] = [];
    if (sh.legKind === 'pants' || sh.legKind === 'shorts') breaks.push(pantsHem);
    if (sh.feet === 'sock' && !cutFt) breaks.push(-0.72);
    let ys = ringYs(LEG_ROWS, breaks);
    if (sh.legKind === 'pants') { for (const y of [-0.72, -0.795]) if (y > pantsHem + 0.02) ys.push({ y, eps: 0 }); ys.sort((a, b) => b.y - a.y || b.eps - a.eps); }
    if (cutY !== null) { ys = ys.filter((r) => r.y > cutY + 0.008); ys.push({ y: cutY, eps: 0 }); }
    const fm = (0.7 + 0.3 * mass);
    const femLeg = (y: number) => 1 + fem * (0.09 * gauss(y, -0.08, 0.12) - 0.05 * gauss(y, -0.6, 0.1));
    // kneecap, the hamstring hollow behind it; trousers fold behind the knee and stack over the shoe
    const legBump = (thx: number, y: number, covered: boolean) => {
      let b = gauss(y, -0.445, 0.025) * gauss(thx, 0, 0.5) * (covered ? 0.04 : 0.12);
      if (covered && sh.legKind === 'pants') {
        const f = Math.sin(thx * 3 + y * 70) * 0.6 + Math.sin(thx * 5 - y * 120) * 0.4;
        b += gauss(y, -0.46, 0.03) * gauss(Math.abs(angd(thx, Math.PI)), 0, 0.9) * 0.08 * (0.6 + 0.4 * f);
        b += gauss(y, pantsHem + 0.05, 0.035) * 0.07 * (0.55 + 0.45 * f);
        b += gauss(y, -0.12, 0.05) * gauss(Math.abs(thx), 0.5, 0.4) * 0.03 * f;
      } else if (!covered) b -= gauss(y, -0.47, 0.02) * gauss(Math.abs(angd(thx, Math.PI)), 0, 0.5) * 0.05;
      return b;
    };
    const wOf = (y: number): Wt => {
      if (y > 0.02) return [BI.hips, 0.5, T, 0.5];
      if (y > -0.05) { const t = (0.02 - y) / 0.07; return [BI.hips, 0.5 - t * 0.4, T, 0.5 + t * 0.4]; }
      if (y > -0.39 || cutS) return [BI.hips, y > -0.12 ? 0.1 * (1 - (-0.05 - y) / 0.07) : 0, T, 1];
      if (y > -0.48) { const t = (y + 0.39) / -0.09; return [T, 1 - t, S, t]; }
      if (y > -0.8 || cutFt) return [S, 1];
      const t = clamp01((y + 0.8) / -0.06); return [S, 1 - t * 0.6, Ft, t * 0.6];
    };
    const rings = ys.map(({ y, eps }) => {
      const r = sampleRows(LEG_ROWS, y);
      const yy = y + eps * 0.0005;
      let t = 0, flare = 0;
      const covered = sh.legKind === 'pants' ? yy > pantsHem : sh.legKind === 'shorts' ? yy > pantsHem : sh.legKind === 'brief' ? yy > 0.0 : false;
      if (covered) {
        t += sh.legThick;
        // trousers hang straighter than legs: fill the ankle / knee taper
        if (sh.legKind === 'pants') flare = Math.max(0, (-0.43 - y) / 0.42) * (0.012 + sh.legFlare);
      }
      if (sh.feet === 'sock' && yy < -0.72) t += 0.003;
      const fl = femLeg(y);
      const knee = (thx: number) => legBump(thx, y, covered);
      const rx = r.rx * fm * fl + t + flare, rf = r.rf * fm * fl + t + flare, rb = r.rb * fm * fl + t + flare * 0.6;
      const pts = ellRing(th[1] + y * s, 0, th[2], rx * s, rf * s, rb * s, 8, 2, k, knee);
      for (const p of pts) p[0] += th[0];
      return { pts, v: vOf(VMAP.LEG, y), w: wOf(y) };
    });
    B.loft(rings, usFor(8), reg, 20 + (k > 0 ? 0 : 1), cutY !== null
      ? { start: [th[0], th[1] + 0.07 * s, th[2]], end: [th[0], th[1] + (cutY - 0.016) * s, th[2]], startW: [BI.hips, 0.6, T, 0.4], endW: (cutS ? [T, 1] : [S, 1]) as Wt, alt: true }
      : { start: [th[0], th[1] + 0.07 * s, th[2]], end: [th[0], th[1] - 0.875 * s, th[2] + 0.004], startW: [BI.hips, 0.6, T, 0.4], endW: [Ft, 1], alt: true });
    {
      const surf = (y: number, deg: number, off: number): V3 => {
        const r = sampleRows(LEG_ROWS, y), fl = femLeg(y), thr = (deg * Math.PI) / 180;
        const flare = sh.legKind === 'pants' ? Math.max(0, (-0.43 - y) / 0.42) * (0.012 + sh.legFlare) : 0;
        const t = sh.legThick + off;
        const p = superPt(thr, 0, th[2], (r.rx * fm * fl + t + flare) * s, (r.rf * fm * fl + t + flare) * s, (r.rb * fm * fl + t + flare * 0.6) * s, 2, k, 1 + legBump(thr, y, true), th[1] + y * s);
        p[0] += th[0];
        return p;
      };
      for (const f of sh.feats || []) if (f.part === 'leg' && (cutY === null || f.y - 0.1 > cutY)) shellFeature(B, f, surf, wOf, reg, VMAP.LEG, 22);
    }
    if (!cutFt) foot(B, d, side, k, sh);
    const sp = (p: string) => cond.splints.has(p + '_' + side.toLowerCase()) && !sev?.has(p + '_' + side.toLowerCase());
    if (sp('shin') || sp('thigh') || sp('foot')) {
      const yy = sp('thigh') ? -0.22 : -0.62;
      const bone = yy > -0.43 ? T : S;
      for (const xx of [0.06, -0.06]) B.box([th[0] + k * xx * s, th[1] + yy * s, th[2]], [0.012 * s, 0.26 * s, 0.014 * s], null, REG.GEAR, [bone, 1], [0.55, 0, 1, 1]);
    }
  }

  // ---------------- skirt / coat tails (double sided, swing with the thighs)
  if (sh.tails || sh.legKind === 'skirt') {
    const skirt = sh.legKind === 'skirt' && !sh.tails;
    const top = skirt ? 1.0 : sh.outerHem + 0.06;
    const bot = skirt ? 0.66 : sh.tails;
    const n = 14;
    const ys = [top, top - (top - bot) * 0.35, bot];
    const rTop = sampleRows(TORSO_ROWS, top);
    const tk = skirt ? 0.012 + sh.legThick : sh.outerThick + sh.topThick + 0.006;
    const rings = ys.map((y, i) => {
      const f = i / 2;
      const hip = sampleRows(TORSO_ROWS, Math.max(0.86, y));
      const rx = (Math.max(rTop.rx, hip.rx) * bw * (1 + fem * 0.08) + tk + f * (skirt ? 0.05 : 0.03)) * s;
      const rf = (Math.max(rTop.rf, 0.09) * mass + tk + f * (skirt ? 0.04 : 0.025)) * s;
      const rb = (Math.max(rTop.rb, 0.108) * mass + tk + f * (skirt ? 0.05 : 0.03)) * s;
      const ww = (p: V3): Wt => {
        const kk = f * 0.75;
        const l = clamp01(0.5 + p[0] / (rx * 0.9) * 0.5);
        return [BI.hips, 1 - kk, BI.thighL, kk * l, BI.thighR, kk * (1 - l)];
      };
      // pleats and hanging folds deepen toward the hem
      const pleat = (th: number) => (Math.sin(th * 7 + 0.4) * 0.6 + Math.sin(th * 4 + 1.9) * 0.4) * 0.05 * f;
      return { pts: ellRing(y * s, 0, 0, rx, rf, rb, n, 2.2, 1, pleat), v: 1 - i / 2, w: ww };
    });
    B.loft(rings, usFor(n), REG.SKIRT, 30, { double: true, skip: sh.tailsOpen ? (j) => j === 6 || j === 7 : undefined, alt: true });
  }

  // ---------------- head, face, hair, headwear
  head(B, d, app, sh);

  // ---------------- backpack
  if (sh.back > 0) backpack(B, d, sh);

  // bandage bulk is painted; splints added above
  void o;
  HEAD_LOD = prevLod;
  const geometry = B.build();
  return { geometry, tris: B.I.length / 3, sole };
}

// ------------------------------------------------------------------ hands
function hand(B: SkinBuilder, d: Dims, side: 'L' | 'R', k: number, gloves: boolean) {
  const s = d.s;
  const H = BI[('hand' + side) as BoneName], F1 = BI[('fing1' + side) as BoneName], F2 = BI[('fing2' + side) as BoneName], TH = BI[('thumb' + side) as BoneName];
  const hp = d.rest[('hand' + side) as BoneName];
  const reg = REG[('HAND_' + side) as RegKey];
  const g = gloves ? 0.004 : 0;
  const hs = s * (1 - d.fem * 0.08) * (0.9 + 0.1 * d.mass);
  const tr = (p: V3): V3 => [hp[0] + p[0], hp[1] + p[1], hp[2] + p[2]];
  // palm: thickness on x (back of hand outward), width on z
  // palm: a boxy six-sided loft, broadest across the knuckles, the heel of the hand and the knuckle ridge standing out
  const prow = [
    { y: 0.004, rx: 0.018, rf: 0.027, rb: 0.025, v: 1, w: [BI[('farm' + side) as BoneName], 0.4, H, 0.6] },
    { y: -0.026, rx: 0.021, rf: 0.042, rb: 0.037, v: 0.82, w: [H, 1] },
    { y: -0.06, rx: 0.019, rf: 0.046, rb: 0.042, v: 0.66, w: [H, 1] },
    { y: -0.084, rx: 0.019, rf: 0.047, rb: 0.043, v: 0.56, w: [H, 0.65, F1, 0.35] },
  ];
  const knuckle = (th: number) => Math.max(0, Math.sin(th)) * 0.05;
  const rings = prow.map((r, ri) => ({ pts: ellRing(r.y * hs, 0, 0.002, (r.rx + g) * hs, (r.rf + g) * hs, (r.rb + g) * hs, 6, 2.6, k, ri === 3 ? knuckle : undefined, -Math.PI + Math.PI / 6).map(tr), v: r.v, w: r.w as Wt }));
  B.loft(rings, usFor(6), reg, 40 + (k > 0 ? 0 : 1), { end: tr([0, -0.092 * hs, 0.002]), endW: [H, 0.6, F1, 0.4], alt: true });
  // fingers: 4 square tubes in three segments (knuckle, middle and end joints), fat knuckles, a blunt tip
  const fz = [0.03, 0.0102, -0.0098, -0.0285], fl = [0.077, 0.085, 0.08, 0.064], fr = [0.0102, 0.0108, 0.0101, 0.0087];
  for (let i = 0; i < 4; i++) {
    const L = fl[i] * hs, r = (fr[i] + g * 0.6) * hs, z = fz[i] * hs;
    const y0 = -0.08 * hs, ym = -0.088 * hs - 0.04 * hs, yd = ym - (L - 0.048 * hs) * 0.55, y1 = -0.082 * hs - L;
    const fr4 = (y: number, rr: number) => ellRing(y, 0, z, rr * 1.08, rr, rr, 4, 2, k, undefined, -Math.PI + Math.PI / 4).map(tr);
    const rr = [
      { pts: fr4(y0, r * 1.08), v: 0.55, w: [H, 0.3, F1, 0.7] as Wt },
      { pts: fr4(ym + 0.005 * hs, r * 1.0), v: 0.32, w: [F1, 0.7, F2, 0.3] as Wt },
      { pts: fr4(ym - 0.004 * hs, r * 1.02), v: 0.26, w: [F1, 0.3, F2, 0.7] as Wt },
      { pts: fr4(yd, r * 0.9), v: 0.14, w: [F2, 1] as Wt },
      { pts: fr4(y1 + 0.007 * hs, r * 0.82), v: 0.04, w: [F2, 1] as Wt },
    ];
    B.loft(rr, usFor(4), reg, 42 + i * 2 + (k > 0 ? 0 : 1), { end: tr([0, y1, z + 0.0005]), endW: [F2, 1], endV: 0 });
  }
  // thumb: tube along a diagonal axis from the heel of the palm
  {
    const base: V3 = [-k * 0.004 * hs, -0.024 * hs, 0.028 * hs];
    const dir = norm([-k * 0.22, -0.72, 0.62]);
    const side2 = norm(cross(dir, [k, 0, 0]));
    const up = norm(cross(side2, dir));
    const ring = (t: number, r: number): V3[] => {
      const c = [base[0] + dir[0] * t, base[1] + dir[1] * t, base[2] + dir[2] * t];
      const out: V3[] = [];
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI + (Math.PI * 2 * i) / 5;
        out.push(tr([c[0] + (Math.cos(a) * up[0] + Math.sin(a) * side2[0]) * r, c[1] + (Math.cos(a) * up[1] + Math.sin(a) * side2[1]) * r, c[2] + (Math.cos(a) * up[2] + Math.sin(a) * side2[2]) * r]));
      }
      return out;
    };
    const L = 0.066 * hs, r = (0.0128 + g * 0.6) * hs;
    const rr = [
      { pts: ring(-0.004 * hs, r * 1.45), v: 0.5, w: [H, 0.6, TH, 0.4] as Wt },
      { pts: ring(L * 0.42, r * 1.05), v: 0.3, w: [TH, 1] as Wt },
      { pts: ring(L * 0.62, r * 1.02), v: 0.2, w: [TH, 1] as Wt },
      { pts: ring(L * 0.92, r * 0.84), v: 0.05, w: [TH, 1] as Wt },
    ];
    const tip = tr([base[0] + dir[0] * L, base[1] + dir[1] * L, base[2] + dir[2] * L]);
    B.loft(rr, usFor(5), reg, 50 + (k > 0 ? 0 : 1), { end: tip, endW: [TH, 1], endV: 0 });
  }
}
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ------------------------------------------------------------------ feet & shoes
interface FootRow { z: number; rx: number; top: number; lip?: number }
const FOOT_BARE: FootRow[] = [
  { z: -0.062, rx: 0.022, top: -0.03 },
  { z: -0.048, rx: 0.029, top: -0.005 },
  { z: -0.015, rx: 0.033, top: 0.022 },
  { z: 0.03, rx: 0.037, top: 0.004 },
  { z: 0.08, rx: 0.043, top: -0.026 },
  { z: 0.122, rx: 0.046, top: -0.043 },
  { z: 0.158, rx: 0.042, top: -0.05 },
  { z: 0.178, rx: 0.03, top: -0.056 },
];
function shoeRows(kind: OutfitShape['feet']): { rows: FootRow[]; soleH: number; lip: number; toe: number; shaft: number } {
  switch (kind) {
    case 'sneaker': return { soleH: 0.024, lip: 0.005, toe: 0.192, shaft: 0, rows: [
      { z: -0.072, rx: 0.03, top: -0.012 }, { z: -0.058, rx: 0.036, top: 0.016 }, { z: -0.02, rx: 0.041, top: 0.03 },
      { z: 0.03, rx: 0.045, top: 0.012 }, { z: 0.085, rx: 0.051, top: -0.018 }, { z: 0.13, rx: 0.053, top: -0.034 },
      { z: 0.165, rx: 0.048, top: -0.043 }, { z: 0.186, rx: 0.034, top: -0.05 }] };
    case 'boot': return { soleH: 0.03, lip: 0.007, toe: 0.19, shaft: 0.13, rows: [
      { z: -0.07, rx: 0.033, top: 0.02 }, { z: -0.055, rx: 0.039, top: 0.04 }, { z: -0.02, rx: 0.044, top: 0.05 },
      { z: 0.03, rx: 0.047, top: 0.02 }, { z: 0.085, rx: 0.052, top: -0.012 }, { z: 0.13, rx: 0.055, top: -0.03 },
      { z: 0.163, rx: 0.051, top: -0.038 }, { z: 0.185, rx: 0.038, top: -0.046 }] };
    case 'dress': return { soleH: 0.016, lip: 0.003, toe: 0.2, shaft: 0, rows: [
      { z: -0.068, rx: 0.027, top: -0.015 }, { z: -0.054, rx: 0.033, top: 0.008 }, { z: -0.018, rx: 0.037, top: 0.02 },
      { z: 0.03, rx: 0.041, top: 0.004 }, { z: 0.085, rx: 0.045, top: -0.024 }, { z: 0.135, rx: 0.045, top: -0.04 },
      { z: 0.172, rx: 0.036, top: -0.049 }, { z: 0.196, rx: 0.022, top: -0.054 }] };
    case 'slipper': return { soleH: 0.016, lip: 0.002, toe: 0.19, shaft: 0, rows: [
      { z: -0.07, rx: 0.036, top: -0.035 }, { z: -0.056, rx: 0.044, top: -0.025 }, { z: -0.02, rx: 0.05, top: -0.018 },
      { z: 0.03, rx: 0.054, top: 0.002 }, { z: 0.085, rx: 0.058, top: -0.012 }, { z: 0.13, rx: 0.06, top: -0.022 },
      { z: 0.163, rx: 0.054, top: -0.03 }, { z: 0.183, rx: 0.04, top: -0.04 }] };
    case 'sock': return { soleH: 0.004, lip: 0, toe: 0.182, shaft: 0, rows: FOOT_BARE.map((r) => ({ ...r, rx: r.rx + 0.003, top: r.top + 0.003 })) };
    default: return { soleH: 0.003, lip: 0, toe: 0.18, shaft: 0, rows: FOOT_BARE };
  }
}

function foot(B: SkinBuilder, d: Dims, side: 'L' | 'R', k: number, sh: OutfitShape) {
  const s = d.s;
  const Ft = BI[('foot' + side) as BoneName], S = BI[('shin' + side) as BoneName];
  const fp = d.rest[('foot' + side) as BoneName];
  const reg = REG[('FOOT_' + side) as RegKey];
  const spec0 = shoeRows(sh.feet);
  const spec = { ...spec0, rows: spec0.rows.filter((_, i) => i !== 3) };
  const fs = s * (1 - d.fem * 0.06);
  const ground = -0.07 * s - sh.sole;
  const sole = spec.soleH;
  // cross-section angles from the top (+y) toward the outer side; ledge at +-90 for the sole lip
  const AN = [-180, -125, -91, -89, -45, 0, 45, 89, 91, 125, 180];
  const us = AN.map((a) => 0.5 + a / 360);
  const rings = spec.rows.map((r, i) => {
    const toeLift = r.z > 0.15 ? (r.z - 0.15) * 0.25 : 0;
    const yb = ground + toeLift * s;
    const ym = yb + (sole + (r.z < -0.02 && sh.feet === 'dress' ? 0.008 : 0)) * fs;
    const yt = Math.max(ym + 0.012 * s, (r.top - 0.0) * fs + (r.z < 0 && spec.shaft ? 0 : 0));
    const rx = r.rx * fs, rl = rx + spec.lip * fs;
    const pts: V3[] = AN.map((a) => {
      const t = (a * Math.PI) / 180;
      if (Math.abs(a) < 90) {
        // upper: rounded
        const sx = Math.sin(t), cy = Math.cos(t);
        return [k * Math.sign(sx) * Math.pow(Math.abs(sx), 0.85) * rx, ym + Math.pow(Math.max(0, cy), 0.8) * (yt - ym), r.z * fs];
      }
      // sole: boxy
      const sx = Math.sin(t), cy = -Math.cos(t);
      return [k * Math.sign(sx) * Math.pow(Math.abs(sx), 0.35) * rl, ym - Math.pow(Math.max(0, cy), 0.3) * (ym - yb), r.z * fs];
    });
    for (const p of pts) { p[0] += fp[0]; p[1] += fp[1]; p[2] += fp[2]; }
    return { pts, v: 0.04 + 0.66 * (i / (spec.rows.length - 1)), w: [Ft, 1] as Wt };
  });
  const last = spec.rows[spec.rows.length - 1];
  B.loft(rings, us, reg, 60 + (k > 0 ? 0 : 1), {
    start: [fp[0], fp[1] + ground + 0.03 * s, fp[2] + (spec.rows[0].z - 0.006) * fs],
    end: [fp[0], fp[1] + ground + (sole + 0.012) * fs, fp[2] + (last.z + 0.012) * fs], endV: 0.72, startV: 0.0, alt: true,
  });
  // laces: bars crossing the vamp up the instep, the tongue standing proud above them (shoes and boots)
  if (sh.feet === 'sneaker' || sh.feet === 'boot' || sh.feet === 'dress') {
    const topAt = (z: number) => {
      const R = spec.rows;
      let i = 0; while (i < R.length - 2 && R[i + 1].z < z) i++;
      const a = R[i], b = R[i + 1], f = clamp01((z - a.z) / (b.z - a.z || 1));
      return { top: (a.top + (b.top - a.top) * f) * fs, rx: (a.rx + (b.rx - a.rx) * f) * fs };
    };
    const n = sh.feet === 'boot' ? 5 : sh.feet === 'dress' ? 3 : 4;
    const z0 = sh.feet === 'boot' ? -0.01 : 0.015, z1 = sh.feet === 'dress' ? 0.08 : 0.105;
    const lace = [0.46, 0.3, 0.54, 0.46] as [number, number, number, number];
    for (let i = 0; i < n; i++) {
      const z = z0 + ((z1 - z0) * i) / Math.max(1, n - 1);
      const h0 = topAt(z - 0.012), h1 = topAt(z + 0.012);
      const slope = Math.atan2(h0.top - h1.top, 0.024 * fs);
      const c: V3 = [fp[0], fp[1] + topAt(z).top + 0.0035 * s, fp[2] + z * fs];
      B.box(c, [topAt(z).rx * 0.9, 0.0045 * s, 0.0075 * s], new THREE.Matrix4().makeRotationX(slope).multiply(new THREE.Matrix4().makeRotationY(i & 1 ? 0.18 : -0.18)), reg, [Ft, 1], lace);
    }
    if (sh.feet !== 'dress') {
      const zt = z0 - 0.022;
      const ht = topAt(zt);
      B.box([fp[0], fp[1] + ht.top + 0.012 * s, fp[2] + zt * fs], [ht.rx * 0.95, 0.03 * s, 0.006 * s], new THREE.Matrix4().makeRotationX(-0.35), reg, [Ft, 0.5, S, 0.5], [0.44, 0.6, 0.56, 0.72]);
    }
  }
  // boot shaft around the ankle / lower shin: a padded collar at the top, a pull tab behind
  if (spec.shaft) {
    const shp = d.rest[('shin' + side) as BoneName];
    const ys = [-0.86, -0.8, -0.752, -0.738, -0.728];
    const over = sh.legKind === 'pants' && !sh.tuckPants ? 0.013 : 0;
    const rr = ys.map((y, i) => {
      const r = sampleRows(LEG_ROWS, y);
      const t = (i === 4 ? 0.003 : i === 3 ? 0.014 : 0.009) + over;
      const pts = ellRing(shp[1] + (y + 0.43) * s, 0, shp[2] + 0.004, (r.rx + t) * s, (r.rf + t) * s, (r.rb + t) * s, 8, 2.2, k);
      for (const p of pts) p[0] += shp[0];
      return { pts, v: 0.76 + 0.24 * (i / 4), w: (y < -0.8 ? [Ft, 0.6, S, 0.4] : [S, 1]) as Wt };
    });
    B.loft(rr, usFor(8), reg, 64 + (k > 0 ? 0 : 1), { double: true, alt: true });
    const r = sampleRows(LEG_ROWS, -0.74);
    B.box([shp[0], shp[1] + (-0.74 + 0.43 + 0.012) * s, shp[2] + 0.004 - (r.rb + 0.016 + over) * s], [0.016 * s, 0.03 * s, 0.006 * s], null, reg, [S, 1], [0.02, 0.8, 0.08, 0.95]);
  }
}

// ------------------------------------------------------------------ head
// polar radius tables per height (head-local metres) at angles 0,22,45,70,95,125,155,180 deg
const HA = [0, 22, 45, 70, 95, 125, 155, 180];
interface HeadRow { y: number; zc: number; r: number[] }
const HEAD_ROWS: HeadRow[] = [
  { y: -0.03, zc: -0.004, r: [0.052, 0.051, 0.049, 0.046, 0.045, 0.044, 0.044, 0.044] },
  { y: -0.013, zc: 0.006, r: [0.086, 0.078, 0.062, 0.055, 0.054, 0.05, 0.047, 0.047] },
  { y: 0.008, zc: 0.006, r: [0.096, 0.089, 0.072, 0.066, 0.064, 0.061, 0.064, 0.067] },
  { y: 0.033, zc: 0.006, r: [0.099, 0.091, 0.076, 0.07, 0.068, 0.07, 0.079, 0.083] },
  { y: 0.058, zc: 0.006, r: [0.101, 0.094, 0.081, 0.074, 0.072, 0.078, 0.091, 0.096] },
  { y: 0.078, zc: 0.006, r: [0.099, 0.095, 0.086, 0.077, 0.074, 0.082, 0.098, 0.103] },
  { y: 0.096, zc: 0.006, r: [0.098, 0.094, 0.086, 0.078, 0.075, 0.084, 0.1, 0.106] },
  { y: 0.114, zc: 0.006, r: [0.1, 0.098, 0.088, 0.078, 0.076, 0.085, 0.1, 0.106] },
  { y: 0.143, zc: 0.004, r: [0.096, 0.093, 0.086, 0.077, 0.076, 0.084, 0.098, 0.104] },
  { y: 0.173, zc: 0.0, r: [0.083, 0.081, 0.076, 0.071, 0.069, 0.075, 0.086, 0.09] },
  { y: 0.199, zc: -0.004, r: [0.056, 0.055, 0.053, 0.05, 0.049, 0.052, 0.058, 0.06] },
];
const HEAD_ANG = [-180, -155, -125, -95, -70, -45, -22, 0, 22, 45, 70, 95, 125, 155, 180];

function headR(row: HeadRow, deg: number): number {
  const a = Math.abs(deg);
  for (let i = 0; i + 1 < HA.length; i++) {
    if (a <= HA[i + 1]) {
      const t = (a - HA[i]) / (HA[i + 1] - HA[i]);
      const st = t * t * (3 - 2 * t);
      return row.r[i] + (row.r[i + 1] - row.r[i]) * (0.5 * t + 0.5 * st);
    }
  }
  return row.r[row.r.length - 1];
}
function sampleHead(y: number): HeadRow {
  const R = HEAD_ROWS;
  if (y <= R[0].y) return R[0];
  if (y >= R[R.length - 1].y) return R[R.length - 1];
  for (let i = 0; i + 1 < R.length; i++) {
    const a = R[i], b = R[i + 1];
    if (y >= a.y && y <= b.y) { const t = (y - a.y) / (b.y - a.y); return { y, zc: a.zc + (b.zc - a.zc) * t, r: a.r.map((v, j) => v + (b.r[j] - v) * t) }; }
  }
  return R[0];
}

// the sculpted head: rows and columns crowd round the eyes, nose and mouth (head-local metres / degrees from the face)
const FACE_ROWS = [-0.03, -0.015, 0.003, 0.018, 0.028, 0.0355, 0.0425, 0.051, 0.062, 0.077, 0.09, 0.0995, 0.108, 0.118, 0.134, 0.154, 0.176, 0.2];
const FACE_ANG = [-180, -150, -122, -101, -86, -72, -59, -47, -36, -26, -17, -8, 0, 8, 17, 26, 36, 47, 59, 72, 86, 101, 122, 150, 180];
const FACE_ROWS_LO = [-0.03, -0.013, 0.008, 0.033, 0.058, 0.078, 0.096, 0.114, 0.143, 0.173, 0.199];
const FACE_ANG_LO = HEAD_ANG;
/** level of detail for heads built from now on (0 sculpted, 1 coarse: crowds, distant NPCs) */
export let HEAD_LOD = 0;
export function setHeadLod(l: number) { HEAD_LOD = l; }

/**
 * Anatomy laid over the base skull (radial offset in head-local metres):
 * brow ridge, eye sockets with the eyeball under the lids, cheekbones and the
 * hollows under them, the muzzle of the teeth, lips and the line between
 * them, the dip under the lower lip, chin, jaw corners and temples.
 */
export function faceRelief(y: number, deg: number, fem: number, sk: { hollow: number }, mouth = 0): number {
  const a = Math.abs(deg);
  if (a > 112 || y < -0.035 || y > 0.15) return 0;
  const g = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
  const masc = 1 - fem;
  let r = 0;
  // brow ridge: a bar over both eyes fading out at the temples, heavier on masculine skulls
  r += (0.0035 + 0.0035 * masc) * g(y, 0.116, 0.0062) * (a < 46 ? 1 : g(a, 46, 11)) * (0.75 + 0.25 * g(a, 20, 12));
  r -= 0.0013 * g(y, 0.108, 0.006) * g(a, 0, 5);
  // the sockets: the eye sits deep under the brow, the ball bulges a little under the lids
  r -= 0.0095 * g(y, 0.1, 0.0068) * g(a, 18, 8.5);
  r += 0.0036 * g(y, 0.098, 0.0036) * g(a, 18, 5.5);
  // cheekbones, the hollow under them (gaunt faces sink), the nasolabial fold
  r += (0.0042 + 0.0012 * fem) * g(y, 0.077, 0.0085) * g(a, 43, 12);
  r -= (0.0018 + 0.004 * sk.hollow) * g(y, 0.05, 0.011) * g(a, 47, 13);
  r -= 0.0016 * g(y, 0.052 - (a - 22) * 0.0006, 0.004) * g(a, 24, 6);
  // the muzzle over the teeth, lips and the line between them
  r += 0.0028 * g(y, 0.04, 0.018) * g(a, 0, 25);
  const full = mouth === 3 ? 1.35 : mouth === 2 ? 0.6 : 1;
  r += (0.0028 + 0.0012 * fem) * full * g(y, 0.0455, 0.0042) * g(a, 0, 13);
  r += (0.0034 + 0.0014 * fem) * full * g(y, 0.0305, 0.0045) * g(a, 0, 11);
  r -= 0.0032 * g(y, 0.0375, 0.0022) * g(a, 0, 15);
  // under the lower lip, the chin, the corners of the jaw
  r -= 0.0024 * g(y, 0.02, 0.0038) * g(a, 0, 12);
  r += (0.0032 + 0.0022 * masc) * g(y, 0.006, 0.0085) * g(a, 0, 13);
  r += 0.003 * masc * g(y, 0.006, 0.01) * g(a, 74, 9);
  // temples
  r -= 0.0026 * g(y, 0.124, 0.014) * g(a, 74, 12);
  return r;
}

function head(B: SkinBuilder, d: Dims, app: Appearance, sh: OutfitShape) {
  const hs = d.s * d.headS;
  const hp = d.rest.head;
  const fem = d.fem;
  const H = BI.head;
  const lod = HEAD_LOD;
  // shape tweaks: jaw width, chin, cheekbones per face shape (humanLooks) / body shape
  const SK = shapeOf(app);
  const jaw = (1 - fem * 0.12) * SK.jaw;
  const chin = (1 - fem * 0.06) * SK.chin;
  const cheek = SK.cheek + fem * 0.01;
  const mouthK = mouthOf(app);
  const tweak = (row: HeadRow, deg: number) => {
    let r = headR(row, deg);
    const a = Math.abs(deg);
    const lowFace = row.y < 0.05 ? 1 - Math.max(0, row.y) / 0.05 : 0;
    if (a >= 30 && a <= 110) r *= 1 + (jaw - 1) * lowFace;
    if (a < 30) r *= 1 + (chin - 1) * lowFace;
    if (row.y > 0.06 && row.y < 0.1 && a > 15 && a < 70) r *= cheek;
    // gaunt: hollow under the cheekbones
    if (SK.hollow && row.y > 0.02 && row.y < 0.065 && a > 25 && a < 80) r *= 1 - 0.05 * SK.hollow * Math.sin(((row.y - 0.02) / 0.045) * Math.PI);
    if (SK.wide !== 1 && a > 20 && a < 160) r *= 1 + (SK.wide - 1) * Math.sin((a * Math.PI) / 180);
    return r;
  };
  // a longer / shorter lower face stretches the rows under the cheekbones
  const longY = (y: number) => (SK.long !== 1 && y < 0.07 ? 0.07 + (y - 0.07) * SK.long : y);
  const tr = (p: V3): V3 => [hp[0] + p[0] * hs, hp[1] + longY(p[1]) * hs, hp[2] + p[2] * hs];
  /** a point on the skull at height y and angle deg, `off` metres out from the skin; relief adds the face's anatomy */
  const skull = (y: number, deg: number, off = 0, relief = true): V3 => {
    const row = sampleHead(y);
    const t = (deg * Math.PI) / 180;
    const r = tweak(row, deg) + off + (relief && lod === 0 ? faceRelief(y, deg, fem, SK, mouthK) : 0);
    return [Math.sin(t) * r, y, row.zc + Math.cos(t) * r];
  };
  const headPt = (y: number, deg: number, off = 0): V3 => skull(y, deg, off);
  const ROWS = lod ? FACE_ROWS_LO : FACE_ROWS, ANG = lod ? FACE_ANG_LO : FACE_ANG;
  const us = ANG.map((a) => 0.5 + a / 360);
  const rings = ROWS.map((y, i) => ({
    pts: ANG.map((a) => tr(skull(y, a))), v: vOf(VMAP.HEAD, y),
    w: (i === 0 ? [H, 0.7, BI.neck, 0.3] : [H, 1]) as Wt,
  }));
  B.loft(rings, us, REG.HEAD, 70, { end: tr([0, 0.215, -0.006]), endW: [H, 1], endV: 1, start: tr([0, -0.034, -0.01]), startW: [H, 0.6, BI.neck, 0.4], startV: 0, alt: true });

  // projection helpers into the head region
  const projUV = (p: V3): [number, number] => {
    const lx = (p[0] - hp[0]) / hs, ly0 = (p[1] - hp[1]) / hs, lz = (p[2] - hp[2]) / hs - 0.006;
    const ly = SK.long !== 1 && ly0 < 0.07 ? 0.07 + (ly0 - 0.07) / SK.long : ly0;
    const a = Math.atan2(lx, lz) / (Math.PI * 2) + 0.5;
    return [REG.HEAD.x + a * REG.HEAD.w, REG.HEAD.y + (1 - vOf(VMAP.HEAD, ly)) * REG.HEAD.h];
  };
  const vP = (p: V3, g: number, w: Wt = [H, 1]) => { const [px, py] = projUV(p); return B.vert(p, px, py, w, g); };
  const centre = tr([0, 0.08, 0.0]);

  // nose: root between the brows, a bridge with a ridge, the tip, the wings round the nostrils, the columella
  {
    const NK = noseK(noseOf(app));
    const sf = (y: number, deg = 0) => skull(y, deg)[2];
    const sx = (y: number, deg: number) => skull(y, deg)[0];
    const nw = 0.0155 * NK.w * (1 - fem * 0.12);
    const L = 0.022 * NK.len * (1 - fem * 0.15) * (1 - NK.flat * 0.35);
    const cx = NK.crook;
    const pt = (x: number, y: number, z: number): V3 => tr([x, y, z]);
    const root = pt(0, 0.106, sf(0.106) + 0.001);
    const brL = pt(nw * 0.42, 0.094, sf(0.094, 6) + 0.002), brR = pt(-nw * 0.42, 0.094, sf(0.094, -6) + 0.002);
    const ridge = pt(cx * 0.5, 0.08, sf(0.08) + L * 0.38 + NK.bump);
    const tipT = pt(cx, 0.062, sf(0.062) + L * 0.92);
    const tip = pt(cx, 0.056, sf(0.056) + L);
    const tipL = pt(cx + nw * 0.42, 0.057, sf(0.057) + L * 0.8), tipR = pt(cx - nw * 0.42, 0.057, sf(0.057) + L * 0.8);
    const sideL = pt(cx * 0.7 + nw * 0.62, 0.074, sf(0.074, 9) + L * 0.25), sideR = pt(cx * 0.7 - nw * 0.62, 0.074, sf(0.074, -9) + L * 0.25);
    const alaL = pt(cx * 0.4 + nw * 1.05, 0.054, Math.max(sf(0.054, 12) + 0.002, sf(0.054) + L * 0.22)), alaR = pt(cx * 0.4 - nw * 1.05, 0.054, Math.max(sf(0.054, -12) + 0.002, sf(0.054) + L * 0.22));
    const baseL = pt(sx(0.05, 10) * 0.6 + cx * 0.3, 0.049, sf(0.049, 8) + 0.002), baseR = pt(sx(0.05, -10) * 0.6 + cx * 0.3, 0.049, sf(0.049, -8) + 0.002);
    const col = pt(cx * 0.8, 0.05, sf(0.05) + L * 0.5);
    const P = [root, brL, brR, ridge, tipT, tip, tipL, tipR, sideL, sideR, alaL, alaR, baseL, baseR, col].map((p) => vP(p, 80));
    const [RT, BL, BR, RG, TT, TP, TL, TR, SL, SR, AL, AR, NL, NR, CO] = P;
    const ins = tr([0, 0.075, sf(0.075) - 0.03]);
    const T = (a: number, b: number, c: number) => B.triOut(a, b, c, ins);
    T(RT, BL, RG); T(RT, RG, BR); T(BL, SL, RG); T(BR, RG, SR);
    T(RG, SL, TT); T(RG, TT, SR); T(SL, TL, TT); T(SR, TT, TR); T(TT, TL, TP); T(TT, TP, TR);
    T(SL, AL, TL); T(SR, TR, AR); T(TL, AL, CO); T(TR, CO, AR); T(TL, CO, TP); T(TR, TP, CO);
    T(AL, NL, CO); T(AR, CO, NR); T(BL, AL, SL); T(BR, SR, AR); T(BL, NL, AL); T(BR, AR, NR);
  }
  // ears: a rim (helix) curling back from the side of the head, the bowl inside it, a lobe; both faces drawn
  const EK = earK(app.ears ?? 0);
  for (const k of [1, -1]) {
    const a = k * 95;
    const es = EK.size, ym = 0.08;
    const Y = (y: number) => ym + (y - ym) * es;
    const out = (0.013 * EK.out + EK.lump * 0.004);
    const base = (y: number, back: number) => { const p = skull(Y(y), a - k * back, -0.002, false); return p; };
    const rim = (y: number, o: number, back: number) => { const p = skull(Y(y), a - k * back, 0, false); return [p[0] + k * o, p[1], p[2]] as V3; };
    const pts: V3[] = [
      base(0.104, 2), base(0.082, 0), base(0.058, 2),                       // 0..2 root on the skull
      rim(0.111, out * 0.6, 9), rim(0.107, out * 0.92, 19), rim(0.092, out * 1.05, 25), rim(0.07, out * 0.95, 23), rim(0.054, out * 0.6, 13), // 3..7 helix
      rim(0.09, out * 0.42, 12), rim(0.073, out * 0.4, 11),                 // 8..9 bowl
      rim(0.046, out * 0.32, 6),                                            // 10 lobe tip
    ].map((p) => tr(p));
    const F = pts.map((p) => vP(p, -1)), Bk = pts.map((p) => vP(p, -1));
    const tris = [[0, 3, 8], [3, 4, 8], [4, 5, 8], [8, 5, 9], [5, 6, 9], [6, 7, 9], [9, 7, 2], [8, 9, 1], [0, 8, 1], [1, 9, 2], [2, 7, 10]];
    const outside = tr([k * 0.2, 0.08, 0.02]);
    for (const t of tris) { B.triOut(F[t[0]], F[t[1]], F[t[2]], centre); B.triOut(Bk[t[0]], Bk[t[1]], Bk[t[2]], outside); }
  }
  // eyelids (collapse onto the lid line unless blinking / asleep)
  {
    const reg = REG.LIDS;
    const L = BI.lids;
    for (const k of [1, -1]) {
      const cols = [9, 14, 19, 24, 29].map((a) => k * a);
      const top = cols.map((a, i) => tr(headPt(0.105, a, 0.0028 + (i === 0 || i === 4 ? 0 : 0.0008))));
      const bot = cols.map((a, i) => tr(headPt(0.0905, a, 0.0032 + (i === 0 || i === 4 ? 0 : 0.0012))));
      const ids: number[][] = [top, bot].map((row, ri) => row.map((p, ci) => B.vert(p, reg.x + (k > 0 ? 0.5 + ci / 9 : 0.5 - ci / 9) * reg.w, reg.y + (ri === 0 ? 0.1 : 0.9) * reg.h, [L, 1], 90)));
      for (let c = 0; c < cols.length - 1; c++) { B.triOut(ids[0][c], ids[1][c], ids[1][c + 1], centre); B.triOut(ids[0][c], ids[1][c + 1], ids[0][c + 1], centre); }
    }
  }
  // facial hair geometry (stubble and soul patches are painted)
  const fh = String(app.facialHair || (app.beard ? 'beard' : 'none'));
  const masked = sh.face === 'gasmask' || sh.face === 'mask';
  if (!masked && (fh === 'beard' || fh === 'goatee' || fh === 'chops' || fh === 'chin_strap')) {
    const ang = fh === 'goatee' ? [-28, -14, 0, 14, 28] : [-92, -70, -48, -25, 0, 25, 48, 70, 92];
    const ys = fh === 'goatee' ? [-0.02, -0.006, 0.01, 0.026] : fh === 'chops' ? [-0.006, 0.012, 0.03, 0.05, 0.072] : [-0.028, -0.012, 0.006, 0.024, 0.045];
    const off = (y: number, a: number) => (fh === 'beard' ? 0.006 + (y < 0 ? 0.005 : 0) + (Math.abs(a) < 30 && y < 0 ? 0.006 : 0)
      : fh === 'chin_strap' ? 0.003 : fh === 'chops' ? 0.006 + (y < 0.02 ? 0.003 : 0) : 0.005 + (y < 0 ? 0.004 : 0));
    const top = (a: number) => {
      const aa = Math.abs(a);
      if (fh === 'chin_strap') return aa > 75 ? 0.075 : aa > 55 ? 0.03 : 0.004;
      if (fh === 'chops') return aa > 60 ? 0.1 : 0.05;
      return aa < 18 ? 0.018 : aa < 34 ? 0.03 : 0.052;
    };
    const rr = ys.map((y, i) => ({ pts: ang.map((a) => { const yy = Math.min(y, top(a)); return tr(headPt(yy, a, yy >= top(a) - 0.001 ? 0.002 : off(yy, a))); }).map((p) => (i === 0 ? [p[0], p[1] - 0.006 * hs, p[2] - 0.006 * hs] : p)), v: 0.42 + 0.14 * (i / (ys.length - 1)), w: [H, 1] as Wt }));
    const uu = ang.map((a) => 0.5 + a / 360);
    // mutton chops leave the chin bare
    B.loft(rr, uu, REG.HAIR, 100, fh === 'chops' ? { skip: (j) => j >= 2 && j <= 5 } : {});
  }
  if (!masked && (fh === 'moustache' || fh === 'beard' || fh === 'chops' || fh === 'handlebar')) {
    const bar = fh === 'handlebar';
    const ang = bar ? [-44, -32, -15, 0, 15, 32, 44] : [-30, -15, 0, 15, 30];
    // handlebar ends sweep out and curl up
    const lift = (a: number) => (bar && Math.abs(a) > 30 ? (Math.abs(a) - 30) * 0.0011 : 0) - (bar ? 0 : Math.abs(a) * 0.00025);
    const rr = [0.043, 0.052].map((y, i) => ({ pts: ang.map((a) => tr(headPt(y + lift(a), a, 0.004 + (i === 0 ? 0.002 : 0) + (bar && Math.abs(a) > 30 ? 0.003 : 0)))), v: 0.36 + 0.03 * i, w: [H, 1] as Wt }));
    B.loft(rr, ang.map((a) => 0.5 + a / 360), REG.HAIR, 101, {});
  }

  hair(B, d, app, sh, tr, headPt);
  headwear(B, d, sh, tr, headPt);
}

// ------------------------------------------------------------------ hair
type HeadPt = (y: number, deg: number, off?: number) => V3;
function hair(B: SkinBuilder, d: Dims, app: Appearance, sh: OutfitShape, tr: (p: V3) => V3, headPt: HeadPt) {
  const st = String(app.hairStyle);
  // bald and shaved heads are all paint (shaved: a stubble shadow)
  if (st === 'bald' || st === 'shaved') return;
  const H = BI.head;
  const hat = sh.hat;
  const hairW = (p: V3): Wt => {
    const ly = (p[1] - d.rest.head[1]) / (d.s * d.headS);
    if (ly > -0.02) return [H, 1];
    const t = clamp01((-0.02 - ly) / 0.2);
    return [H, 1 - t * 0.75, BI.chest, t * 0.75];
  };
  // mohawk: a crest from the forehead over the crown to the nape (the sides are painted stubble)
  if (st === 'mohawk') {
    if (hat) return;
    // the scalp's midline profile: up the forehead, over the crown, down to the nape
    const prof: V3[] = [
      ...[0.148, 0.168, 0.186, 0.2].map((y) => headPt(y, 0, 0.001)),
      [0, 0.214, -0.006] as V3,
      ...[0.2, 0.182, 0.155, 0.12, 0.085].map((y) => headPt(y, 180, 0.001)),
    ];
    const n = prof.length - 1;
    const rings: { pts: V3[]; v: number; w: Wt }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const base = prof[i];
      const nx = 0, ny = base[1] - 0.08, nz = base[2] + 0.004;
      const nl = Math.hypot(ny, nz) || 1;
      const hgt = 0.006 + 0.034 * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (t > 0.88 ? (1 - t) / 0.12 : 1);
      const half = 0.012 - t * 0.004;
      const tx = nx, ty = (ny / nl) * hgt, tz = (nz / nl) * hgt;
      const pts: V3[] = [
        [base[0] + half, base[1], base[2]], [base[0] + half * 0.55 + tx, base[1] + ty, base[2] + tz],
        [base[0] - half * 0.55 + tx, base[1] + ty, base[2] + tz], [base[0] - half, base[1], base[2]], [base[0] + half, base[1], base[2]],
      ].map((q) => tr(q as V3));
      rings.push({ pts, v: 0.3 + 0.6 * t, w: hairW(pts[0]) });
    }
    B.loft(rings, [0, 0.25, 0.5, 0.75, 1], REG.HAIR, 113, {});
    return;
  }
  const longish = st === 'long' || st === 'bob' || st === 'mullet';
  // hairline height by angle: front, temple, side (over ear), back
  const line = (deg: number) => {
    const a = Math.abs(deg);
    let front = 0.152, temple = 0.13, side = 0.112, back = 0.02;
    if (st === 'long' || st === 'bob') { side = st === 'bob' ? -0.005 : -0.07; back = st === 'bob' ? -0.015 : -0.2; temple = 0.12; }
    if (st === 'curly') { side = 0.08; back = 0.0; }
    if (st === 'afro') { front = 0.15; temple = 0.124; side = 0.06; back = -0.02; }
    if (st === 'ponytail' || st === 'topknot') { side = 0.105; back = 0.03; }
    if (st === 'mullet') { side = 0.1; back = -0.15; }
    if (st === 'undercut') { temple = 0.15; side = 0.165; back = 0.13; }
    if (st === 'receding') { front = 0.188; temple = 0.172; }
    if (a < 25) return front;
    if (a < 60) return front + (temple - front) * ((a - 25) / 35);
    if (a < 105) return temple + (side - temple) * ((a - 60) / 45);
    return side + (back - side) * Math.min(1, (a - 105) / 55);
  };
  const thick = st === 'buzz' || st === 'cornrows' ? 0.0035 : st === 'curly' ? 0.024 : st === 'afro' ? 0.044 : st === 'short' || st === 'spiky' ? 0.011
    : st === 'undercut' ? 0.017 : st === 'receding' ? 0.008 : st === 'topknot' ? 0.008 : 0.012;
  const hatLine = hat === 'cap' ? 0.132 : hat === 'beanie' ? 0.124 : hat === 'hardhat' ? 0.135 : hat === 'helmet' ? 0.13 : hat === 'flat' ? 0.128 : 99;
  const ys = [-0.25, -0.14, -0.05, 0.0, 0.035, 0.07, 0.105, 0.14, 0.17, 0.198];
  const minY = Math.min(...HEAD_ANG.map((a) => line(a)));
  const rowYs = ys.filter((y) => y >= minY - 0.03);
  const us = HEAD_ANG.map((a) => 0.5 + a / 360);
  const curlAmp = st === 'curly' ? 0.008 : st === 'afro' ? 0.013 : 0;
  const curl = (deg: number, y: number) => (curlAmp ? (Math.sin(deg * 0.21 + y * 90) * 0.5 + Math.cos(deg * 0.13 - y * 140) * 0.5) * curlAmp : 0);
  const spike = (deg: number, y: number) => (st === 'spiky' && y > 0.11 ? Math.max(0, Math.sin(deg * 0.31 + y * 210)) * 0.016 * clamp01((y - 0.11) / 0.05) : 0);
  // polygon clumps: every vertex off the scalp line is pushed in or out a little; tufts poke down at the hairline, long ends hang ragged
  const hh = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7 + (app.hair & 255) * 0.37) * 43758.5453; return x - Math.floor(x); };
  const nA = HEAD_ANG.length - 1;
  const clumpAmp = st === 'buzz' || st === 'cornrows' ? 0 : st === 'curly' || st === 'afro' ? 0.011 : st === 'spiky' ? 0.009 : 0.0065;
  const tufts = !hat && (st === 'short' || st === 'spiky' || st === 'undercut' || st === 'curly' || st === 'mullet' || st === 'receding' || st === 'ponytail' || st === 'topknot');
  const rings = rowYs.map((y, ri) => {
    const pts = HEAD_ANG.map((a, ci) => {
      const cj = ci % nA;
      let yy = Math.max(y, line(a));
      if (ri === 0 && tufts && Math.abs(a) < 115 && (cj & 1)) yy -= st === 'spiky' ? 0.012 : 0.007;
      let yc = Math.min(yy, hat ? hatLine + 0.004 : 99);
      if (yc < 0 && ri === 0 && (cj & 1)) yc -= 0.025 + hh(cj, 3) * 0.02;
      const below = yc < 0.0;
      let p: V3;
      if (below) {
        // hanging hair: continue down from the back/sides of the head and fall outward over the shoulders
        const base = headPt(0.0, a, thick);
        const drop = -yc;
        const flare = (st === 'long' ? 0.03 : st === 'afro' ? 0.02 : 0.012) * drop / 0.25 + 0.004;
        const t = (a * Math.PI) / 180;
        const back = Math.abs(a) > 100 ? 1 : 0;
        p = [base[0] + Math.sin(t) * flare, yc, base[2] + Math.cos(t) * flare - back * drop * (st === 'mullet' ? 0.2 : 0.12)];
      } else {
        // hair hugs the scalp at its edges and gains volume toward the crown
        const edge = (st === 'long' || st === 'bob' || st === 'afro' ? 1 : 0.3 + 0.7 * clamp01((yc - line(a)) / 0.04)) * ((st === 'short' || st === 'undercut') && Math.abs(a) < 50 && yc > 0.16 ? 1.5 : 1);
        const clump = ri > 0 || yc > line(a) + 0.01 ? (hh(ri, cj) - 0.35) * clumpAmp * clamp01((yc - line(a) + 0.01) / 0.03) : 0;
        p = headPt(yc, a, thick * edge + curl(a, yc) + spike(a, yc) + clump + ((st === 'curly' || st === 'afro') && yc > 0.1 ? 0.006 : 0) + (yc > 0.12 && st !== 'buzz' && st !== 'cornrows' ? 0.003 : 0));
      }
      if (below) { const j = (hh(ri + 7, cj) - 0.5) * 0.012; p = [p[0] * (1 + j * 4), p[1], p[2] + j]; }
      return tr(p);
    });
    return { pts, v: vOf(VMAP.HAIR, y), w: hairW };
  });
  const capOff = hat ? null : tr([0, 0.215 + thick + (st === 'curly' ? 0.01 : st === 'afro' ? 0.02 : st === 'spiky' ? 0.012 : 0), -0.008]);
  B.loft(rings, us, REG.HAIR, 110, { end: capOff, endW: [H, 1], endV: 1, double: longish || st === 'afro', doubleRows: (i) => rowYs[i] < 0.02, alt: true });
  // fringe / bangs
  if (!hat && (st === 'bob' || st === 'long' || st === 'curly' || st === 'afro')) {
    const ang = [-50, -30, -12, 0, 12, 30, 50];
    const y0 = st === 'bob' ? 0.128 : st === 'long' ? 0.14 : 0.148;
    const rr = [
      { pts: ang.map((a) => tr(headPt(0.165, a, thick + 0.004))), v: vOf(VMAP.HAIR, 0.165), w: [H, 1] as Wt },
      { pts: ang.map((a, i) => tr(headPt(y0 - (Math.abs(a) < 20 ? 0.006 : 0) - (i % 2) * 0.007 - (i === 2 ? 0.004 : 0), a, thick * 0.6 + 0.004))), v: vOf(VMAP.HAIR, y0 - 0.02), w: [H, 1] as Wt },
    ];
    B.loft(rr, ang.map((a) => 0.5 + a / 360), REG.HAIR, 111, { double: true });
  }
  // undercut: the long top swept to one side
  if (!hat && st === 'undercut') {
    const ang = [-40, -20, 0, 20, 40];
    const rr = [
      { pts: ang.map((a) => tr(headPt(0.19, a, thick + 0.006))), v: vOf(VMAP.HAIR, 0.19), w: [H, 1] as Wt },
      { pts: ang.map((a, i) => { const q = headPt(0.158 - i * 0.004, a + 14, thick * 0.9); return tr([q[0] - 0.012, q[1], q[2] + 0.008]); }), v: vOf(VMAP.HAIR, 0.15), w: [H, 1] as Wt },
    ];
    B.loft(rr, ang.map((a) => 0.5 + a / 360), REG.HAIR, 114, { double: true });
  }
  // ponytail: tie at the crown-back, tail falling down the back
  if (st === 'ponytail') {
    const base = headPt(0.12, 180, thick);
    const pts = [0, 1, 2, 3, 4].map((i) => {
      const t = i / 4;
      return { c: [0, 0.12 - t * 0.28, base[2] - 0.02 - Math.sin(t * Math.PI * 0.8) * 0.035 + t * 0.03] as V3, r: [0.022, 0.026, 0.024, 0.018, 0.008][i] };
    });
    const rr = pts.map((q, i) => ({
      pts: ellRing(q.c[1], 0, q.c[2], q.r, q.r * 0.9, q.r * 0.9, 6, 2, 1).map(tr),
      v: vOf(VMAP.HAIR, -0.05 - i * 0.05),
      w: (i < 2 ? [H, 1] : [H, 1 - i * 0.18, BI.chest, i * 0.18]) as Wt,
    }));
    B.loft(rr, usFor(6), REG.HAIR, 112, { end: tr([0, -0.18, pts[4].c[2] + 0.005]) });
  }
  // top knot: a bun on the crown
  if (st === 'topknot' && !hat) {
    const c = headPt(0.2, 160, thick + 0.022);
    const ysK = [-0.026, -0.012, 0.006, 0.02];
    const rr = ysK.map((dy, i) => {
      const r = [0.016, 0.028, 0.026, 0.014][i];
      return { pts: ellRing(c[1] + dy, c[0], c[2], r, r, r, 6, 2, 1).map(tr), v: 0.86 + i * 0.03, w: [H, 1] as Wt };
    });
    B.loft(rr, usFor(6), REG.HAIR, 115, { end: tr([c[0], c[1] + 0.03, c[2]]) });
  }
}

// ------------------------------------------------------------------ hats & face gear
function headwear(B: SkinBuilder, d: Dims, sh: OutfitShape, tr: (p: V3) => V3, headPt: HeadPt) {
  const H = BI.head;
  const reg = REG.HAT;
  const us = HEAD_ANG.map((a) => 0.5 + a / 360);
  const dome = (y0: number, off: number, g: number, top: number, sx = 1, back = 0) => {
    const ys = [y0, y0 + (0.2 - y0) * 0.35, y0 + (0.2 - y0) * 0.7, 0.2];
    const rings = ys.map((y, i) => ({
      pts: HEAD_ANG.map((a) => {
        const p = headPt(y, a, off + (i === 0 ? 0.002 : 0));
        const bk = Math.abs(a) > 120 ? back * (1 - i / 3) : 0;
        return tr([p[0] * sx, p[1], p[2] - bk]);
      }), v: 0.3 + 0.7 * (i / 3), w: [H, 1] as Wt,
    }));
    B.loft(rings, us, reg, g, { end: tr([0, top, -0.01]), endV: 1 });
  };
  switch (sh.hat) {
    case 'cap': {
      dome(0.128, 0.012, 120, 0.232);
      // brim: curved plate in front
      const ang = [-60, -40, -20, 0, 20, 40, 60];
      const inner = ang.map((a) => tr(headPt(0.133, a, 0.013)));
      const outer = ang.map((a) => { const p = headPt(0.128, a, 0.013); const t = (a * Math.PI) / 180; const L = 0.065 * Math.cos(t * 0.9); return tr([p[0] + Math.sin(t) * L * 0.5, p[1] - 0.004 - Math.abs(a) * 0.00008, p[2] + Math.cos(t) * L]); });
      const rr = [{ pts: inner, v: 0.25, w: [H, 1] as Wt }, { pts: outer, v: 0.0, w: [H, 1] as Wt }];
      B.loft(rr, ang.map((a) => 0.5 + a / 360), reg, 121, { double: true });
      B.box(tr([0, 0.232, -0.01]), [0.014, 0.008, 0.014], null, reg, [H, 1], [0.48, 0.9, 0.52, 1]);
      break;
    }
    case 'beanie': {
      dome(0.122, 0.017, 122, 0.245);
      // folded cuff
      const rr = [0.12, 0.152].map((y, i) => ({ pts: HEAD_ANG.map((a) => tr(headPt(y, a, 0.024))), v: 0.05 + i * 0.22, w: [H, 1] as Wt }));
      B.loft(rr, us, reg, 123, {});
      break;
    }
    case 'hardhat': {
      dome(0.135, 0.024, 124, 0.25);
      const ang = HEAD_ANG;
      const inner = ang.map((a) => tr(headPt(0.135, a, 0.024)));
      const outer = ang.map((a) => { const t = (a * Math.PI) / 180; const p = headPt(0.129, a, 0.024); const L = Math.abs(a) < 40 ? 0.045 : Math.abs(a) > 140 ? 0.035 : 0.018; return tr([p[0] + Math.sin(t) * L, p[1] - 0.006, p[2] + Math.cos(t) * L]); });
      B.loft([{ pts: inner, v: 0.2, w: [H, 1] }, { pts: outer, v: 0.0, w: [H, 1] }], us, reg, 125, { double: true });
      break;
    }
    case 'helmet': {
      dome(0.13, 0.022, 126, 0.248, 1.03, 0.025);
      break;
    }
  }
  // glasses: frames are painted on the face, temples are geometry
  if (sh.eyes) {
    for (const k of [1, -1]) {
      const p0 = headPt(0.1, k * 58, 0.006), p1 = headPt(0.105, k * 100, 0.004);
      const a = tr(p0), b = tr(p1);
      const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0));
      B.box(c, [0.004, sh.eyes === 'goggles' ? 0.012 : 0.005, L], m, REG.GEAR, [H, 1], [0.0, 0, 0.45, 1]);
    }
    if (sh.eyes === 'goggles') {
      // strap around the head
      const rr = [0.095, 0.11].map((y, i) => ({ pts: HEAD_ANG.map((a) => tr(headPt(y, a, 0.005))), v: 0.5 + i * 0.5, w: [H, 1] as Wt }));
      B.loft(rr, us, subReg(REG.GEAR, 0, 0, 0.45, 1), 130, { skip: (j) => j >= 6 && j <= 7 });
    }
  }
  // face masks
  if (sh.face === 'mask' || sh.face === 'gasmask') {
    const gas = sh.face === 'gasmask';
    const ang = gas ? [-95, -70, -45, -22, 0, 22, 45, 70, 95] : [-80, -55, -30, -12, 0, 12, 30, 55, 80];
    const ys = gas ? [-0.03, -0.005, 0.03, 0.06, 0.09, 0.125] : [0.02, 0.04, 0.06, 0.085];
    const rr = ys.map((y, i) => ({
      pts: ang.map((a) => {
        const nose = !gas && Math.abs(a) < 15 && y > 0.05 ? 0.012 : 0;
        const snout = gas && Math.abs(a) < 30 && y < 0.07 && y > 0.0 ? 0.03 * Math.cos((a * Math.PI) / 60) : 0;
        return tr(headPt(y, a, (gas ? 0.014 : 0.005) + nose + snout + (i === 0 && !gas ? -0.002 : 0)));
      }), v: i / (ys.length - 1), w: [H, 1] as Wt,
    }));
    B.loft(rr, ang.map((_, i) => i / (ang.length - 1)), REG.MASK, 131, { double: gas });
    if (gas) {
      // filter canister on the snout
      const base = tr(headPt(0.03, 0, 0.05));
      const rr2 = [0, 0.04].map((t, i) => ({ pts: ellRing(0, 0, 0, 0.024, 0.024, 0.024, 8, 2, 1).map((p) => { const q = new THREE.Vector3(p[0], p[2], -p[1] + t).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.5); return [base[0] + q.x, base[1] + q.y, base[2] + q.z] as V3; }), v: 0.5 + i * 0.5, w: [H, 1] as Wt }));
      B.loft(rr2, usFor(8), subReg(REG.GEAR, 0, 0, 0.45, 1), 132, { end: [base[0], base[1] - 0.04 * Math.sin(0.5), base[2] + 0.04 * Math.cos(0.5)] });
    }
  }
}

// ------------------------------------------------------------------ backpack
function backpack(B: SkinBuilder, d: Dims, sh: OutfitShape) {
  const s = d.s;
  const sz = sh.back;
  const C = BI.chest;
  const back = sampleRows(TORSO_ROWS, 1.25).rb * d.mass + sh.topThick + sh.outerThick;
  const field = sh.backKind === 'field';
  const w = (field ? 0.34 : 0.3) * sz * (d.bw * 0.5 + 0.5), h = (field ? 0.44 : 0.42) * sz * (sh.backKind === 'hiking' ? 1.3 : 1), dep = (field ? 0.22 : 0.15) * sz;
  const cz = -(back + dep / 2 + 0.01) * s;
  const top = 1.43 * s, bot = top - h * s;
  const ys = [bot, bot + 0.02 * s, top - 0.04 * s, top];
  const rings = ys.map((y, i) => {
    const k = i === 0 || i === 3 ? 0.86 : 1;
    return { pts: ellRing(y, 0, cz, (w / 2) * k * s, (dep / 2) * k * s, (dep / 2) * k * s, field ? 8 : 12, 4, 1, undefined, field ? Math.PI / 8 : 0), v: (y - bot) / (top - bot), w: [C, 1] as Wt };
  });
  B.loft(rings, usFor(field ? 8 : 12), subReg(REG.PACK, 0, 0.3, 1, 1), 140, { start: [0, bot - 0.004, cz], end: [0, top + 0.01, cz], startV: 0, endV: 1 });
  // front pocket
  B.box([0, bot + h * 0.28 * s, cz - (dep / 2 + 0.02) * s], [w * 0.75 * s, h * 0.4 * s, 0.05 * s], null, REG.PACK, [C, 1], [0.02, 0.02, 0.53, 0.26], 0.92);
  // shoulder straps
  const chestF = sampleRows(TORSO_ROWS, 1.3).rf * d.mass + sh.topThick + sh.outerThick + 0.006;
  for (const k of [1, -1]) {
    const x = k * 0.085 * s * d.bw;
    const pts: V3[] = [[x, top, cz + dep * 0.3 * s], [x * 1.05, 1.47 * s, -0.02 * s], [x * 1.12, 1.42 * s, (chestF - 0.01) * s], [x * 1.2, 1.2 * s, (chestF + 0.004) * s], [x * 1.25, 1.04 * s, (chestF - 0.012) * s]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const L = Math.hypot(dx, dy, dz);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(1, 0, 0));
      B.box(c, [0.045 * s, 0.01 * s, L + 0.01], m, REG.PACK, [C, 1], [0.62, 0.02, 0.98, 0.26], 0.8);
    }
  }
  if (field) {
    // the Meridian field pack: a steel frame up both sides of the back pad with a bar standing
    // proud above the top, a rubberised base band, two compression straps and the band's padlock
    const strapUV: [number, number, number, number] = [0.62, 0.02, 0.98, 0.26];
    const rz = cz + (dep / 2 - 0.012) * s;
    for (const k of [1, -1]) B.box([k * (w / 2 + 0.008) * s, (bot + top) / 2 + 0.025 * s, rz], [0.018 * s, h * s + 0.07 * s, 0.022 * s], null, REG.PACK, [C, 1], strapUV, 0.55);
    B.box([0, top + 0.05 * s, rz], [w * s + 0.034 * s, 0.018 * s, 0.022 * s], null, REG.PACK, [C, 1], strapUV, 0.6);
    B.box([0, bot + 0.025 * s, cz], [w * s + 0.006 * s, 0.05 * s, dep * s + 0.008 * s], null, REG.PACK, [C, 1], strapUV, 0.45);
    for (const f of [0.38, 0.7]) B.box([0, bot + h * f * s, cz - (dep / 2 + 0.003) * s], [w * s + 0.012 * s, 0.026 * s, 0.012 * s], null, REG.PACK, [C, 1], strapUV, 0.5);
    B.box([0, top - 0.05 * s, cz - (dep / 2 + 0.03) * s], [0.04 * s, 0.045 * s, 0.022 * s], null, REG.PACK, [C, 1], [0.02, 0.02, 0.2, 0.1], 1.25);
  }
  if (sh.backKind === 'hiking') {
    // bedroll on top
    const y = top + 0.04 * s;
    const rr = [-1, 1].map((k, i) => ({ pts: ellRing(0, 0, 0, 0.045 * s, 0.045 * s, 0.045 * s, 8, 2, 1).map((p) => [k * w * 0.55 * s, y + p[2], cz + p[0]] as V3), v: i, w: [C, 1] as Wt }));
    B.loft(rr, usFor(8), subReg(REG.PACK, 0.02, 0.02, 0.53, 0.26), 141, { start: [-w * 0.55 * s, y, cz], end: [w * 0.55 * s, y, cz] });
  }
}
