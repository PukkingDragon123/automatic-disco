import * as THREE from 'three';
import { atlas, AtlasRect } from './atlas';

export type FaceKey = 'top' | 'bottom' | 'north' | 'south' | 'east' | 'west';
export type TexSpec = string | Partial<Record<FaceKey | 'sides' | 'all', string>>;

export interface PrimOpts {
  /** vertex tint 0xRRGGBB (multiplied with texture) */
  color?: number;
  /** emissive strength (0 = none). Emissive surfaces show texture at full brightness */
  emissive?: number;
  /** stretch the texture across each face exactly once */
  fit?: boolean | Partial<Record<FaceKey, boolean>>;
  /** extra uv offset in metres (to vary repeated textures) */
  uvOffset?: [number, number];
  /** uv scale multiplier */
  uvScale?: number;
  /** foliage sway weight */
  sway?: number;
  /** skip these faces */
  skip?: FaceKey[];
  /** darken bottom-ish faces for fake AO (default true) */
  ao?: boolean;
  /** rotate texture 90deg on top faces */
  rotTop?: boolean;
  /**
   * Low-poly facet look (on by default, see ModelBuilder.facets): chamfer size in metres for box /
   * cylinder edges. A number forces it, 0 or false keeps the plain primitive, omitted picks it from
   * the part's size (furniture-sized parts get irregular chamfers; thin panels, wall-like slabs and
   * tiny knobs stay square so they still butt and align).
   */
  bevel?: number | false;
}

const FACE_SHADE: Record<FaceKey, number> = { top: 1.0, bottom: 0.55, north: 0.86, south: 0.94, east: 0.9, west: 0.82 };

/** baked facet shade for any normal, matching FACE_SHADE on the axes; up-facing bevels catch a little extra light */
function shadeOf(nx: number, ny: number, nz: number): number {
  const side = 0.88 + 0.04 * nz + 0.03 * nx;
  if (ny >= 0) {
    const s = side * (1 - ny) + ny;
    // a chamfer between a top and a side reads as a lit lip, like a hand-drawn bevel
    return s + 0.07 * Math.max(0, 1 - Math.abs(ny - 0.62) * 3);
  }
  return side * (1 + ny) - 0.55 * ny;
}

/** deterministic hash of a primitive's parameters, and a 0..1 value per (hash, k) */
function hseed(a: number, b: number, c: number, d: number, e: number, f: number): number {
  let h = 2166136261 >>> 0;
  for (const v of [a, b, c, d, e, f]) { h ^= Math.round(v * 997) | 0; h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
function hfrac(h: number, k: number): number {
  let x = (h ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

type V3 = [number, number, number];
/** planar uv projection of one box face (same corners / uvs the plain box uses), applied to any point */
interface FaceMap { t: string; r: AtlasRect; p0: V3; e1: V3; e3: V3; l1: number; l3: number; uv0: number[]; d1: number[]; d3: number[] }

/**
 * Procedural low-poly geometry builder. Everything in the game — walls,
 * furniture, items, creatures — is assembled from these primitives and
 * textured from the shared pixel-art atlas with world-scale UVs, so texel
 * density stays consistent and crisp across every model.
 */
export class ModelBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private atl: number[] = [];
  private hd: number[] = [];
  private fx: number[] = [];
  private idx: number[] = [];
  private stack: THREE.Matrix4[] = [];
  private m = new THREE.Matrix4();
  private nm = new THREE.Matrix3();
  private tmp = new THREE.Vector3();
  private tmpN = new THREE.Vector3();
  /** global tint multiplied into every vertex colour */
  tint = 0xffffff;
  /** default aFx.y when a primitive gives no sway (walls store their axis here: 1 = along x, 2 = along z) */
  swayDefault = 0;
  private faceShade = true;
  private nmDirty = true;
  /** default for new builders: chamfered, faceted primitives (the polygon low-poly look) */
  static facetsDefault = (() => { try { return !globalThis.localStorage?.getItem('lp_flatprims'); } catch { return true; } })();
  /** chamfer boxes / bevel and facet cylinders and spheres when the part is big enough (PrimOpts.bevel overrides) */
  facets = ModelBuilder.facetsDefault;
  /** turn the facet look on / off for everything this builder emits from now on (walls, tiles: off) */
  setFacets(on: boolean) { this.facets = on; return this; }

  get vertexCount() { return this.pos.length / 3; }
  get isEmpty() { return this.idx.length === 0; }

  setFaceShading(on: boolean) { this.faceShade = on; return this; }

  // ---------- transform stack ----------
  push() { this.stack.push(this.m.clone()); return this; }
  pop() { const m = this.stack.pop(); if (m) { this.m.copy(m); this.nmDirty = true; } return this; }
  identity() { this.m.identity(); this.nmDirty = true; return this; }
  translate(x: number, y: number, z: number) { this.m.multiply(new THREE.Matrix4().makeTranslation(x, y, z)); return this; }
  rotateY(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationY(a)); this.nmDirty = true; return this; }
  rotateX(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationX(a)); this.nmDirty = true; return this; }
  rotateZ(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationZ(a)); this.nmDirty = true; return this; }
  scale(x: number, y: number, z: number) { this.m.multiply(new THREE.Matrix4().makeScale(x, y, z)); this.nmDirty = true; return this; }
  matrix(m: THREE.Matrix4) { this.m.multiply(m); this.nmDirty = true; return this; }

  // ---------- low level ----------
  private vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: number, shade: number, r: AtlasRect, emis: number, sway: number) {
    this.tmp.set(x, y, z).applyMatrix4(this.m);
    if (this.nmDirty) { this.nm.getNormalMatrix(this.m); this.nmDirty = false; }
    this.tmpN.set(nx, ny, nz).applyMatrix3(this.nm).normalize();
    this.pos.push(this.tmp.x, this.tmp.y, this.tmp.z);
    this.nor.push(this.tmpN.x, this.tmpN.y, this.tmpN.z);
    this.uv.push(u, v);
    const t = this.tint;
    const s = this.faceShade ? shade : 1;
    this.col.push(
      (((c >> 16) & 255) / 255) * (((t >> 16) & 255) / 255) * s,
      (((c >> 8) & 255) / 255) * (((t >> 8) & 255) / 255) * s,
      ((c & 255) / 255) * ((t & 255) / 255) * s,
    );
    this.atl.push(r.u0, r.v0, r.du, r.dv);
    // the close-up version for the first-person eye (dv stored negative: a marker no default attribute value has)
    const h = r.hd !== undefined ? r.hd : atlas().hdOf(r);
    if (h) this.hd.push(h.u0, h.v0, h.du, -h.dv); else this.hd.push(0, 0, 0, 0);
    this.fx.push(emis, sway || this.swayDefault);
  }

  /**
   * Add a quad from 4 corners (counter-clockwise seen from the front).
   * uvs: per-corner [u,v] in texture repeats.
   */
  quadRaw(p: number[][], uvs: number[][], tex: string, color = 0xffffff, shade = 1, emis = 0, sway = 0, normal?: number[]) {
    const r = atlas().get(tex);
    let n = normal;
    if (!n) {
      const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
      const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      n = [nx / l, ny / l, nz / l];
    }
    const base = this.vertexCount;
    for (let i = 0; i < 4; i++) this.vert(p[i][0], p[i][1], p[i][2], n[0], n[1], n[2], uvs[i][0], uvs[i][1], color, shade, r, emis, sway);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  triRaw(p: number[][], uvs: number[][], tex: string, color = 0xffffff, shade = 1, emis = 0, sway = 0) {
    const r = atlas().get(tex);
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    const base = this.vertexCount;
    for (let i = 0; i < 3; i++) this.vert(p[i][0], p[i][1], p[i][2], nx / l, ny / l, nz / l, uvs[i][0], uvs[i][1], color, shade, r, emis, sway);
    this.idx.push(base, base + 1, base + 2);
  }

  // ---------- primitives ----------
  private texFor(spec: TexSpec, face: FaceKey): string {
    if (typeof spec === 'string') return spec;
    if (spec[face]) return spec[face]!;
    if ((face === 'north' || face === 'south' || face === 'east' || face === 'west') && spec.sides) return spec.sides;
    return spec.all || 'white';
  }

  /**
   * Axis-aligned box: x,z = centre, y = bottom, w (x size), h (y size), d (z size)
   */
  box(x: number, y: number, z: number, w: number, h: number, d: number, tex: TexSpec, o: PrimOpts = {}) {
    const cb = this.bevelFor(w, h, d, o);
    if (cb > 0) return this.chamferBox(x, y, z, w, h, d, tex, o, cb);
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    const c = o.color ?? 0xffffff, e = o.emissive ?? 0, sw = o.sway ?? 0;
    const skip = o.skip || [];
    const fitAll = o.fit === true;
    const fitOf = (f: FaceKey) => fitAll || (typeof o.fit === 'object' && !!o.fit[f]);
    const us = o.uvScale ?? 1;
    const [ou, ov] = o.uvOffset || [0, 0];
    const ao = o.ao !== false;
    const face = (f: FaceKey, p: number[][], ext: [number, number], uvOrigin: [number, number]) => {
      if (skip.includes(f)) return;
      const t = this.texFor(tex, f);
      const r = atlas().get(t);
      let uvs: number[][];
      if (fitOf(f)) uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
      else {
        const u0 = (uvOrigin[0] + ou) / r.mw * us, v0 = (uvOrigin[1] + ov) / r.mh * us;
        const u1 = u0 + ext[0] / r.mw * us, v1 = v0 + ext[1] / r.mh * us;
        uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      }
      if (f === 'top' && o.rotTop) uvs = [uvs[1], uvs[2], uvs[3], uvs[0]];
      this.quadRaw(p, uvs, t, c, ao ? FACE_SHADE[f] : 1, e, sw);
    };
    // south (+z)
    face('south', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [w, h], [x0, y0]);
    // north (-z)
    face('north', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [w, h], [-x1, y0]);
    // east (+x)
    face('east', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [d, h], [-z1, y0]);
    // west (-x)
    face('west', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [d, h], [z0, y0]);
    // top
    face('top', [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [w, d], [x0, -z1]);
    // bottom
    face('bottom', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [w, d], [x0, z0]);
    return this;
  }

  /**
   * Chamfer size for a box part, 0 = keep it square. Furniture-sized parts get a bevel that reads as
   * one or two low-res pixels; parts that must butt against neighbours (wall-like slabs), thin panels
   * standing on edge and tiny knobs stay plain. Table tops and shelves get a bevelled top edge.
   */
  private bevelFor(w: number, h: number, d: number, o: PrimOpts): number {
    if (o.bevel === false || o.bevel === 0) return 0;
    if (!(w > 0 && h > 0 && d > 0)) return 0;
    if (o.skip && o.skip.some((f) => f !== 'bottom')) return 0;
    const mnH = Math.min(w, d), mxH = Math.max(w, d);
    if (typeof o.bevel === 'number') return Math.min(o.bevel, h * 0.45, mnH * 0.3);
    if (!this.facets) return 0;
    const mx = Math.max(mxH, h);
    if (mx < 0.12 || mx > 4.5) return 0;
    if (mnH < 0.05) return 0;
    if (mxH >= 0.95 && mnH <= 0.16 && h >= 0.9) return 0;
    if (h < 0.05) return mnH >= 0.25 && h >= 0.018 ? h * 0.45 : 0;
    const c = Math.min(0.05, Math.max(0.012, Math.min(mnH, h) * 0.12));
    // slabs (table tops, crowns, shelves, seat pads): the bevel scales with the thickness
    return h < 0.12 && h < mnH * 0.4 ? Math.max(c, h * 0.4) : c;
  }

  /** the plain box's per-face uv mapping, generalised to points off the face (chamfers continue the projection) */
  private faceMap(f: FaceKey, tex: TexSpec, o: PrimOpts, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): FaceMap {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    const fitAll = o.fit === true;
    const fit = fitAll || (typeof o.fit === 'object' && !!o.fit[f]);
    const us = o.uvScale ?? 1;
    const [ou, ov] = o.uvOffset || [0, 0];
    const t = this.texFor(tex, f);
    const r = atlas().get(t);
    let p: V3[], ext: [number, number], org: [number, number];
    switch (f) {
      case 'south': p = [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]; ext = [w, h]; org = [x0, y0]; break;
      case 'north': p = [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]; ext = [w, h]; org = [-x1, y0]; break;
      case 'east': p = [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]; ext = [d, h]; org = [-z1, y0]; break;
      case 'west': p = [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]; ext = [d, h]; org = [z0, y0]; break;
      case 'top': p = [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]; ext = [w, d]; org = [x0, -z1]; break;
      default: p = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]; ext = [w, d]; org = [x0, z0]; break;
    }
    let uvs: number[][];
    if (fit) uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    else {
      const u0 = (org[0] + ou) / r.mw * us, v0 = (org[1] + ov) / r.mh * us;
      const u1 = u0 + ext[0] / r.mw * us, v1 = v0 + ext[1] / r.mh * us;
      uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    }
    if (f === 'top' && o.rotTop) uvs = [uvs[1], uvs[2], uvs[3], uvs[0]];
    const e1: V3 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
    const e3: V3 = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
    return {
      t, r, p0: p[0], e1, e3, l1: e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], l3: e3[0] * e3[0] + e3[1] * e3[1] + e3[2] * e3[2],
      uv0: uvs[0], d1: [uvs[1][0] - uvs[0][0], uvs[1][1] - uvs[0][1]], d3: [uvs[3][0] - uvs[0][0], uvs[3][1] - uvs[0][1]],
    };
  }

  /** one flat polygon (convex, 3..8 points) with a planar face mapping; wound to face away from `ctr` */
  private facetPoly(pts: V3[], fm: FaceMap, ctr: V3, color: number, shadeK: number | null, emis: number, sway: number) {
    const n = pts.length;
    // newell normal (robust for any convex polygon)
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
      cx += a[0]; cy += a[1]; cz += a[2];
    }
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    if (nx * (cx / n - ctr[0]) + ny * (cy / n - ctr[1]) + nz * (cz / n - ctr[2]) < 0) { pts = pts.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
    const shade = shadeK ?? shadeOf(nx, ny, nz);
    const base = this.vertexCount;
    for (const q of pts) {
      const dx = q[0] - fm.p0[0], dy = q[1] - fm.p0[1], dz = q[2] - fm.p0[2];
      const a = fm.l1 > 0 ? (dx * fm.e1[0] + dy * fm.e1[1] + dz * fm.e1[2]) / fm.l1 : 0;
      const b = fm.l3 > 0 ? (dx * fm.e3[0] + dy * fm.e3[1] + dz * fm.e3[2]) / fm.l3 : 0;
      this.vert(q[0], q[1], q[2], nx, ny, nz, fm.uv0[0] + a * fm.d1[0] + b * fm.d3[0], fm.uv0[1] + a * fm.d1[1] + b * fm.d3[1], color, shade, fm.r, emis, sway);
    }
    for (let i = 1; i < n - 1; i++) this.idx.push(base, base + i, base + i + 1);
  }

  /**
   * Box with chamfered top and vertical edges (bottom edges stay sharp: the camera never sees them).
   * Every edge gets its own deterministic chamfer width and the corner cuts are asymmetric, so the
   * part reads as a hand-built low-poly model with visibly different facets, not a primitive. All
   * polygons are planar; the textures keep their plain-box projection, so they wrap over the bevels.
   */
  private chamferBox(x: number, y: number, z: number, w: number, h: number, d: number, tex: TexSpec, o: PrimOpts, c: number) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    const col = o.color ?? 0xffffff, e = o.emissive ?? 0, sw = o.sway ?? 0;
    const ao = o.ao !== false;
    const seed = hseed(x, y, z, w, h, d);
    const J = (k: number) => 0.55 + 0.9 * hfrac(seed, k);
    // corner cuts (along x, along z) for SW, SE, NE, NW and top-edge chamfers for S, E, N, W
    const ax = (k: number) => Math.min(c * J(k), w * 0.3), bz = (k: number) => Math.min(c * J(k + 4), d * 0.3);
    const aSW = ax(0), aSE = ax(1), aNE = ax(2), aNW = ax(3);
    const bSW = bz(0), bSE = bz(1), bNE = bz(2), bNW = bz(3);
    const ctz = (k: number) => Math.min(c * J(k + 8), h * 0.45, d * 0.3), ctx = (k: number) => Math.min(c * J(k + 8), h * 0.45, w * 0.3);
    const cS = ctz(0), cE = ctx(1), cN = ctz(2), cW = ctx(3);
    const yS = y1 - cS, yE = y1 - cE, yN = y1 - cN, yW = y1 - cW;
    const S1: V3 = [x0 + aSW, 0, z1], S2: V3 = [x1 - aSE, 0, z1];
    const E1: V3 = [x1, 0, z1 - bSE], E2: V3 = [x1, 0, z0 + bNE];
    const N1: V3 = [x1 - aNE, 0, z0], N2: V3 = [x0 + aNW, 0, z0];
    const W1: V3 = [x0, 0, z0 + bNW], W2: V3 = [x0, 0, z1 - bSW];
    const at = (p: V3, yy: number): V3 => [p[0], yy, p[2]];
    const TSW: V3 = [x0 + cW, y1, z1 - cS], TSE: V3 = [x1 - cE, y1, z1 - cS], TNE: V3 = [x1 - cE, y1, z0 + cN], TNW: V3 = [x0 + cW, y1, z0 + cN];
    const ctr: V3 = [x, y + h / 2, z];
    const M = {} as Record<FaceKey, FaceMap>;
    for (const f of ['top', 'bottom', 'north', 'south', 'east', 'west'] as FaceKey[]) M[f] = this.faceMap(f, tex, o, x0, x1, y0, y1, z0, z1);
    const sh = (f: FaceKey) => (ao ? FACE_SHADE[f] : 1);
    const shs = ao ? null : 1;
    const P = (pts: V3[], f: FaceKey, k: number | null) => this.facetPoly(pts, M[f], ctr, col, k, e, sw);
    // flat faces
    P([TSW, TSE, TNE, TNW], 'top', sh('top'));
    P([at(S1, y0), at(S2, y0), at(S2, yS), at(S1, yS)], 'south', sh('south'));
    P([at(E1, y0), at(E2, y0), at(E2, yE), at(E1, yE)], 'east', sh('east'));
    P([at(N1, y0), at(N2, y0), at(N2, yN), at(N1, yN)], 'north', sh('north'));
    P([at(W1, y0), at(W2, y0), at(W2, yW), at(W1, yW)], 'west', sh('west'));
    if (!o.skip?.includes('bottom')) P([at(S1, y0), at(S2, y0), at(E1, y0), at(E2, y0), at(N1, y0), at(N2, y0), at(W1, y0), at(W2, y0)], 'bottom', sh('bottom'));
    // top-edge chamfers continue the side textures over the lip
    P([at(S1, yS), at(S2, yS), TSE, TSW], 'south', shs);
    P([at(E1, yE), at(E2, yE), TNE, TSE], 'east', shs);
    P([at(N1, yN), at(N2, yN), TNW, TNE], 'north', shs);
    P([at(W1, yW), at(W2, yW), TSW, TNW], 'west', shs);
    // vertical corner cuts (projected from whichever side they lean toward)
    P([at(S2, y0), at(E1, y0), at(E1, yE), at(S2, yS)], aSE >= bSE ? 'south' : 'east', shs);
    P([at(E2, y0), at(N1, y0), at(N1, yN), at(E2, yE)], aNE >= bNE ? 'north' : 'east', shs);
    P([at(N2, y0), at(W1, y0), at(W1, yW), at(N2, yN)], aNW >= bNW ? 'north' : 'west', shs);
    P([at(W2, y0), at(S1, y0), at(S1, yS), at(W2, yW)], aSW >= bSW ? 'south' : 'west', shs);
    // corner facets
    P([at(S2, yS), at(E1, yE), TSE], 'top', shs);
    P([at(E2, yE), at(N1, yN), TNE], 'top', shs);
    P([at(N2, yN), at(W1, yW), TNW], 'top', shs);
    P([at(W2, yW), at(S1, yS), TSW], 'top', shs);
    return this;
  }

  /** Box given by min/max corners */
  boxMinMax(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: TexSpec, o: PrimOpts = {}) {
    return this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, tex, o);
  }

  /** Vertical cylinder / prism with n segments. Centre x,z, bottom y. */
  cylinder(x: number, y: number, z: number, r: number, h: number, segs: number, tex: TexSpec, o: PrimOpts & { rTop?: number; caps?: boolean } = {}) {
    const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
    const rt = o.rTop ?? r;
    const sideT = this.texFor(tex, 'north');
    const sr = atlas().get(sideT);
    const circ = 2 * Math.PI * Math.max(r, rt);
    const fit = o.fit === true;
    // facet look: a slightly irregular polygon (each side its own width) and bevelled rims
    const facet = this.facets && o.bevel !== false && o.bevel !== 0;
    const seed = hseed(x, y, z, r, h, segs + rt);
    const jit = facet && Math.max(r, rt) >= 0.04 && segs >= 5 ? 0.08 : 0;
    const K = (i: number) => 1 + (hfrac(seed, ((i % segs) + segs) % segs) - 0.5) * jit;
    let cb = 0;
    if (o.caps !== false && h > 0 && Math.min(r, rt) >= 0.03) {
      if (typeof o.bevel === 'number') cb = Math.min(o.bevel, h * 0.3, Math.min(r, rt) * 0.4);
      else if (facet && Math.max(r, rt) >= 0.05 && h >= 0.05) cb = Math.min(0.04, 0.16 * Math.min(r, rt, h));
    }
    const rAt = (yy: number) => r + (rt - r) * (yy / h);
    const yb = cb, ytp = h - cb;
    const rB = rAt(yb), rT = rAt(ytp);
    const vOf = (yy: number) => fit ? yy / h : yy / sr.mh;
    const ring = (i: number, rr: number, yy: number) => {
      const a = (i / segs) * Math.PI * 2, k = K(i);
      return [x + Math.cos(a) * rr * k, y + yy, z + Math.sin(a) * rr * k];
    };
    const band = (rr0: number, yy0: number, rr1: number, yy1: number) => {
      for (let i = 0; i < segs; i++) {
        const u0 = fit ? i / segs : (i / segs) * circ / sr.mw, u1 = fit ? (i + 1) / segs : ((i + 1) / segs) * circ / sr.mw;
        const p = [ring(i, rr0, yy0), ring(i + 1, rr0, yy0), ring(i + 1, rr1, yy1), ring(i, rr1, yy1)];
        // outward normal of this facet: (p1 - p0) x (p3 - p0)
        const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
        const bx = p[3][0] - p[0][0], by = p[3][1] - p[0][1], bz = p[3][2] - p[0][2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx = -nx / l; ny = -ny / l; nz = -nz / l;
        const shade = facet ? shadeOf(nx, ny, nz) : 0.8 + 0.2 * Math.max(0, Math.cos(((i + 0.5) / segs) * Math.PI * 2 - 0.8));
        const v0 = vOf(yy0), v1 = vOf(yy1);
        this.quadRaw([p[3], p[2], p[1], p[0]], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], sideT, c, shade, e);
      }
    };
    if (cb > 0) band(Math.max(0.001, r - cb), 0, rB, yb);
    band(rB, yb, rT, ytp);
    if (cb > 0) band(rT, ytp, Math.max(0.001, rt - cb), h);
    if (o.caps !== false) {
      const topT = this.texFor(tex, 'top'), botT = this.texFor(tex, 'bottom');
      const tr = atlas().get(topT);
      const rtc = cb > 0 ? Math.max(0.001, rt - cb) : rt, rbc = cb > 0 ? Math.max(0.001, r - cb) : r;
      const kmax = 1 + jit * 0.5;
      for (let i = 0; i < segs; i++) {
        const p0 = [x, y + h, z], p1 = ring(i + 1, rtc, h), p2 = ring(i, rtc, h);
        const uvt = (p: number[]) => fit ? [0.5 + (p[0] - x) / (2 * rtc * kmax), 0.5 + (p[2] - z) / (2 * rtc * kmax)] : [p[0] / tr.mw, p[2] / tr.mh];
        if (rt > 0.001) this.triRaw([p0, p1, p2], [uvt(p0), uvt(p1), uvt(p2)], topT, c, 1, e);
        const q0 = [x, y, z], q1 = ring(i, rbc, 0), q2 = ring(i + 1, rbc, 0);
        const uvb = (p: number[]) => fit ? [0.5 + (p[0] - x) / (2 * rbc * kmax), 0.5 + (p[2] - z) / (2 * rbc * kmax)] : [p[0] / tr.mw, p[2] / tr.mh];
        if (r > 0.001) this.triRaw([q0, q1, q2], [uvb(q0), uvb(q1), uvb(q2)], botT, c, 0.55, e);
      }
    }
    return this;
  }

  /** Horizontal cylinder along X axis. centre x,y,z */
  cylinderX(x: number, y: number, z: number, r: number, len: number, segs: number, tex: TexSpec, o: PrimOpts & { caps?: boolean } = {}) {
    this.push().translate(x, y, z).rotateZ(-Math.PI / 2).translate(0, -len / 2, 0);
    this.cylinder(0, 0, 0, r, len, segs, tex, o);
    return this.pop();
  }
  cylinderZ(x: number, y: number, z: number, r: number, len: number, segs: number, tex: TexSpec, o: PrimOpts & { caps?: boolean } = {}) {
    this.push().translate(x, y, z).rotateX(Math.PI / 2).translate(0, -len / 2, 0);
    this.cylinder(0, 0, 0, r, len, segs, tex, o);
    return this.pop();
  }

  /** Low-poly sphere (UV sphere with few segments). centre x,y,z */
  sphere(x: number, y: number, z: number, r: number, segs: number, rings: number, tex: string, o: PrimOpts & { sy?: number } = {}) {
    const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
    const sy = o.sy ?? 1;
    const tr = atlas().get(tex);
    const fit = o.fit === true;
    // facet look: every vertex pushed in or out a little (deterministic), each triangle flat-shaded on its own
    const facet = this.facets && o.bevel !== false && o.bevel !== 0 && r >= 0.025;
    const seed = hseed(x, y, z, r, segs, rings + sy);
    const P = (i: number, j: number) => {
      const th = (i / segs) * Math.PI * 2, ph = (j / rings) * Math.PI;
      const k = facet && j > 0 && j < rings ? 1 + (hfrac(seed, (((i % segs) + segs) % segs) * 64 + j) - 0.5) * 0.13 : 1;
      return [x + Math.sin(ph) * Math.cos(th) * r * k, y + Math.cos(ph) * r * sy * k, z + Math.sin(ph) * Math.sin(th) * r * k];
    };
    const tri = (a: number[], b: number[], cc: number[], ua: number[], ub: number[], uc: number[], shade: number) => {
      if (facet) {
        const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], bx = cc[0] - a[0], by = cc[1] - a[1], bz = cc[2] - a[2];
        const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.hypot(nx, ny, nz) || 1;
        shade = shadeOf(nx / l, ny / l, nz / l);
      }
      this.triRaw([a, b, cc], [ua, ub, uc], tex, c, shade, e);
    };
    for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
      const a = P(i, j), b = P(i + 1, j), cc = P(i + 1, j + 1), d = P(i, j + 1);
      const uv = (ii: number, jj: number) => fit ? [ii / segs, 1 - jj / rings] : [(ii / segs) * 2 * Math.PI * r / tr.mw, (1 - jj / rings) * Math.PI * r / tr.mh];
      const shade = 0.75 + 0.25 * (1 - j / rings);
      // order (b, cc, d, a) is counter-clockwise seen from outside
      if (j === 0) tri(cc, d, a, uv(i + 1, j + 1), uv(i, j + 1), uv(i, j), shade);
      else if (j === rings - 1) tri(b, d, a, uv(i + 1, j), uv(i, j + 1), uv(i, j), shade);
      else if (facet) {
        tri(b, cc, d, uv(i + 1, j), uv(i + 1, j + 1), uv(i, j + 1), shade);
        tri(b, d, a, uv(i + 1, j), uv(i, j + 1), uv(i, j), shade);
      } else this.quadRaw([b, cc, d, a], [uv(i + 1, j), uv(i + 1, j + 1), uv(i, j + 1), uv(i, j)], tex, c, shade, e);
    }
    return this;
  }

  /** A flat horizontal quad (floor decal etc.) centred at x,z at height y */
  flat(x: number, y: number, z: number, w: number, d: number, tex: string, o: PrimOpts & { rot?: number } = {}) {
    const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
    const r = atlas().get(tex);
    const fit = o.fit !== false;
    const hw = w / 2, hd = d / 2;
    const rot = o.rot ?? 0;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const P = (dx: number, dz: number) => [x + dx * cs - dz * sn, y, z + dx * sn + dz * cs];
    const u1 = fit ? 1 : w / r.mw, v1 = fit ? 1 : d / r.mh;
    this.quadRaw([P(-hw, hd), P(hw, hd), P(hw, -hd), P(-hw, -hd)], [[0, 0], [u1, 0], [u1, v1], [0, v1]], tex, c, 1, e, o.sway ?? 0, [0, 1, 0]);
    return this;
  }

  /** Vertical billboard-ish card (two crossed quads) for plants/grass */
  cross(x: number, y: number, z: number, w: number, h: number, tex: string, o: PrimOpts & { rot?: number } = {}) {
    const c = o.color ?? 0xffffff;
    const rot = o.rot ?? 0;
    for (let k = 0; k < 2; k++) {
      const a = rot + k * Math.PI / 2;
      const dx = Math.cos(a) * w / 2, dz = Math.sin(a) * w / 2;
      this.quadRaw([[x - dx, y, z - dz], [x + dx, y, z + dz], [x + dx, y + h, z + dz], [x - dx, y + h, z - dz]],
        [[0, 0], [1, 0], [1, 1], [0, 1]], tex, c, 1, o.emissive ?? 0, o.sway ?? 1, [0, 1, 0]);
    }
    return this;
  }

  /** Vertical panel (single quad) from (x0,z0) to (x1,z1); its normal is (-dz, 0, dx) */
  panel(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tex: string, o: PrimOpts = {}) {
    const r = atlas().get(tex);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const fit = o.fit === true;
    const [ou, ov] = o.uvOffset || [0, 0];
    const u0 = fit ? 0 : ou / r.mw, u1 = fit ? 1 : (ou + len) / r.mw;
    const v0 = fit ? 0 : (y0 + ov) / r.mh, v1 = fit ? 1 : (y1 + ov) / r.mh;
    this.quadRaw([[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], tex, o.color ?? 0xffffff, 1, o.emissive ?? 0, o.sway ?? 0);
    return this;
  }

  /** Wedge/ramp: box whose top slopes from height h0 at -z to h1 at +z */
  wedge(x: number, y: number, z: number, w: number, d: number, h0: number, h1: number, tex: TexSpec, o: PrimOpts = {}) {
    const c = o.color ?? 0xffffff;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    const top = this.texFor(tex, 'top'), side = this.texFor(tex, 'east');
    const rs = atlas().get(side);
    const rt = atlas().get(top);
    const slope = Math.hypot(d, h1 - h0);
    this.quadRaw([[x0, y + h1, z1], [x1, y + h1, z1], [x1, y + h0, z0], [x0, y + h0, z0]], [[0, 0], [w / rt.mw, 0], [w / rt.mw, slope / rt.mh], [0, slope / rt.mh]], top, c, 1);
    this.quadRaw([[x0, y, z1], [x1, y, z1], [x1, y + h1, z1], [x0, y + h1, z1]], [[0, 0], [w / rs.mw, 0], [w / rs.mw, h1 / rs.mh], [0, h1 / rs.mh]], side, c, 0.94);
    this.quadRaw([[x1, y, z0], [x0, y, z0], [x0, y + h0, z0], [x1, y + h0, z0]], [[0, 0], [w / rs.mw, 0], [w / rs.mw, h0 / rs.mh], [0, h0 / rs.mh]], side, c, 0.86);
    this.quadRaw([[x1, y, z1], [x1, y, z0], [x1, y + h0, z0], [x1, y + h1, z1]], [[0, 0], [d / rs.mw, 0], [d / rs.mw, h0 / rs.mh], [0, h1 / rs.mh]], side, c, 0.9);
    this.quadRaw([[x0, y, z0], [x0, y, z1], [x0, y + h1, z1], [x0, y + h0, z0]], [[0, 0], [d / rs.mw, 0], [d / rs.mw, h1 / rs.mh], [0, h0 / rs.mh]], side, c, 0.82);
    return this;
  }

  /** Append another builder's geometry (already in world space) */
  append(other: ModelBuilder) {
    const base = this.vertexCount;
    // element-wise (a spread of a big chunk's arrays would overflow the call stack)
    const cat = (a: number[], b: number[]) => { for (let i = 0; i < b.length; i++) a.push(b[i]); };
    cat(this.pos, other.pos); cat(this.nor, other.nor); cat(this.uv, other.uv);
    cat(this.col, other.col); cat(this.atl, other.atl); cat(this.hd, other.hd); cat(this.fx, other.fx);
    for (const i of other.idx) this.idx.push(i + base);
    return this;
  }

  /**
   * Append a cached geometry with a transform. Used by the chunk mesher to
   * stamp furniture models into merged chunk meshes.
   */
  appendGeometry(g: THREE.BufferGeometry, m: THREE.Matrix4, tint = 0xffffff, fxY?: number) {
    const base = this.vertexCount;
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), UV = g.getAttribute('uv');
    const C = g.getAttribute('color'), A = g.getAttribute('aAtlas'), F = g.getAttribute('aFx'), HD = g.getAttribute('aHd');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    const tr = ((tint >> 16) & 255) / 255, tg = ((tint >> 8) & 255) / 255, tb = (tint & 255) / 255;
    for (let i = 0; i < P.count; i++) {
      v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m);
      n.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z); this.nor.push(n.x, n.y, n.z);
      this.uv.push(UV.getX(i), UV.getY(i));
      this.col.push(C.getX(i) * tr, C.getY(i) * tg, C.getZ(i) * tb);
      this.atl.push(A.getX(i), A.getY(i), A.getZ(i), A.getW(i));
      if (HD) this.hd.push(HD.getX(i), HD.getY(i), HD.getZ(i), HD.getW(i)); else this.hd.push(0, 0, 0, 0);
      this.fx.push(F.getX(i), fxY ?? F.getY(i));
    }
    const I = g.getIndex()!;
    for (let i = 0; i < I.count; i++) this.idx.push(I.getX(i) + base);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aAtlas', new THREE.Float32BufferAttribute(this.atl, 4));
    g.setAttribute('aHd', new THREE.Float32BufferAttribute(this.hd, 4));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.fx, 2));
    const vc = this.vertexCount;
    g.setIndex(vc > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  reset() {
    this.pos.length = 0; this.nor.length = 0; this.uv.length = 0; this.col.length = 0;
    this.atl.length = 0; this.hd.length = 0; this.fx.length = 0; this.idx.length = 0; this.m.identity(); this.stack.length = 0; this.nmDirty = true;
    return this;
  }
}
