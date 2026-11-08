// Sculpted rock formations. Every rock is grown from a primitive (an icosphere for boulders and slabs, a lathe for
// spires, a swept tube for arches, hexagonal prisms for basalt) and then weathered: fbm swelling, planar fracture
// cuts that leave crisp facets, recessed bedding in layered stone, solution grooves in limestone. Normals keep hard
// edges at the fractures (crease angle), each vertex carries a cavity occlusion term, and everything is merged into
// one mesh. The shader paints it with the palette's stone (dominant-axis projection, 32 px/m), world-height strata
// that line up across a whole formation, lichen crusts, moss on top faces (more in damp woods), snow in the cold,
// a dark wet line at the water, the Veyr moss / rival creep overlay and fog of war.
import * as THREE from 'three';
import { Region, RockMat, type RockPiece } from './region';
import { Rand } from '../core/rand';
import { Noise } from '../core/noise';
import { gbuf } from '../gfx/gbuf';
import { SHADER_NOISE, FOW_FN } from './glsl';
import { buildRockTexture, RL } from './rockTex';
import { L, B } from './blockTex';

/** sqrt-based length (Math.hypot is several times slower in the hot loops) */
const hyp = (a: number, b: number, c = 0) => Math.sqrt(a * a + b * b + c * c);
type V3 = [number, number, number];

// ------------------------------------------------------------------------------------------------ mesh builders
/** an indexed triangle soup under construction */
interface Soup { p: number[]; i: number[]; ao?: number[] }

const ICO: { p: Float32Array; i: Uint32Array }[] = [];
/** unit icosphere at a subdivision level (cached) */
function icosphere(level: number) {
  if (ICO[level]) return ICO[level];
  const t = (1 + Math.sqrt(5)) / 2;
  let P: number[] = [-1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0, 0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1];
  let I = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let v = 0; v < P.length; v += 3) { const l = hyp(P[v], P[v + 1], P[v + 2]); P[v] /= l; P[v + 1] /= l; P[v + 2] /= l; }
  for (let s = 0; s < level; s++) {
    const cache = new Map<number, number>(), NI: number[] = [];
    const mid = (a: number, b: number) => {
      const k = a < b ? a * 100000 + b : b * 100000 + a;
      let m = cache.get(k);
      if (m === undefined) {
        const x = P[a * 3] + P[b * 3], y = P[a * 3 + 1] + P[b * 3 + 1], z = P[a * 3 + 2] + P[b * 3 + 2], l = hyp(x, y, z);
        m = P.length / 3; P.push(x / l, y / l, z / l); cache.set(k, m);
      }
      return m;
    };
    for (let f = 0; f < I.length; f += 3) {
      const a = I[f], b = I[f + 1], c = I[f + 2], ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      NI.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    I = NI;
  }
  P = P.slice();
  return (ICO[level] = { p: Float32Array.from(P), i: Uint32Array.from(I) });
}

/** cavity occlusion from the umbrella operator: vertices sitting below their neighbours' average are in a crevice */
function cavity(p: number[], idx: number[], k: number): number[] {
  const n = p.length / 3, sum = new Float32Array(n * 3), cnt = new Float32Array(n), nor = new Float32Array(n * 3);
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f], b = idx[f + 1], c = idx[f + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      sum[u * 3] += p[v * 3]; sum[u * 3 + 1] += p[v * 3 + 1]; sum[u * 3 + 2] += p[v * 3 + 2]; cnt[u]++;
      sum[v * 3] += p[u * 3]; sum[v * 3 + 1] += p[u * 3 + 1]; sum[v * 3 + 2] += p[u * 3 + 2]; cnt[v]++;
    }
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { nor[v * 3] += nx; nor[v * 3 + 1] += ny; nor[v * 3 + 2] += nz; }
  }
  const out: number[] = new Array(n);
  for (let v = 0; v < n; v++) {
    const c = Math.max(1, cnt[v]);
    const dx = sum[v * 3] / c - p[v * 3], dy = sum[v * 3 + 1] / c - p[v * 3 + 1], dz = sum[v * 3 + 2] / c - p[v * 3 + 2];
    const nl = hyp(nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]) || 1;
    const conc = (dx * nor[v * 3] + dy * nor[v * 3 + 1] + dz * nor[v * 3 + 2]) / nl;
    out[v] = Math.max(0.35, Math.min(1, 1 - conc * k));
  }
  return out;
}

/** weathered sphere: fbm swelling, flattened underside, planar fracture cuts; returns unit-box geometry (|x|,|z| <= 1, y 0..1) */
function boulderShape(nz: Noise, r: Rand, level: number, o: { rough: number; cuts: number; cutLo: number; flat: number; box?: number; layers?: number; recess?: number }): Soup {
  const src = icosphere(level), n = src.p.length / 3, p: number[] = new Array(n * 3);
  const ox = r.range(-100, 100), oy = r.range(-100, 100), oz = r.range(-100, 100);
  const cuts: [V3, number][] = [];
  for (let k = 0; k < o.cuts; k++) {
    const a = r.range(0, Math.PI * 2), el = r.range(-0.25, 1.1);
    cuts.push([[Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)], r.range(o.cutLo, o.cutLo + 0.22)]);
  }
  for (let v = 0; v < n; v++) {
    let x = src.p[v * 3], y = src.p[v * 3 + 1], z = src.p[v * 3 + 2];
    if (o.box) { // squarer blocks: push toward a rounded cube
      const e = o.box;
      x = Math.sign(x) * Math.pow(Math.abs(x), e); y = Math.sign(y) * Math.pow(Math.abs(y), e); z = Math.sign(z) * Math.pow(Math.abs(z), e);
    }
    const f = 1 + nz.fbm3(x * 1.3 + ox, y * 1.3 + oy, z * 1.3 + oz, 3) * o.rough + nz.n3(x * 4.1 - oy, y * 4.1 + ox, z * 4.1) * o.rough * 0.3;
    x *= f; y *= f; z *= f;
    if (y < 0) y *= o.flat;
    for (const [c, d] of cuts) { const s = x * c[0] + y * c[1] + z * c[2]; if (s > d) { const k = (s - d) * 0.94; x -= c[0] * k; y -= c[1] * k; z -= c[2] * k; } }
    p[v * 3] = x; p[v * 3 + 1] = y; p[v * 3 + 2] = z;
  }
  // normalise into the unit box: base at y = 0, top at 1, reaching 0.97 of the box on x and z (so the requested
  // size is the size you see, give or take the odd bump)
  let y0 = 1e9, y1 = -1e9, xm = 0, zm = 0;
  for (let v = 0; v < n; v++) { y0 = Math.min(y0, p[v * 3 + 1]); y1 = Math.max(y1, p[v * 3 + 1]); xm = Math.max(xm, Math.abs(p[v * 3])); zm = Math.max(zm, Math.abs(p[v * 3 + 2])); }
  for (let v = 0; v < n; v++) {
    let y = (p[v * 3 + 1] - y0) / (y1 - y0);
    let s = 1;
    p[v * 3] *= 0.97 / xm; p[v * 3 + 2] *= 0.97 / zm;
    if (o.layers) { // bedding: soft beds weather back, hard ones stand proud as ledges
      const L = o.layers, b = Math.floor(y * L), fr = y * L - b;
      s *= 1 - (o.recess ?? 0.08) * (hashL(b, 3) * 0.8 + 0.2) * Math.sin(Math.PI * fr) ** 0.5;
      y = (b + Math.pow(fr, 0.85)) / L;
    }
    p[v * 3] *= s; p[v * 3 + 2] *= s; p[v * 3 + 1] = y;
  }
  const idx = Array.from(src.i);
  return { p, i: idx, ao: cavity(p, idx, level >= 3 ? 9 : level === 2 ? 5 : 3) };
}
const hashL = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** a spire as a lathe: rings up the height with a per-family profile, bedding recesses and grooves, a domed top */
function spireShape(nz: Noise, r: Rand, p: RockPiece): Soup {
  const H = p.sy, R0 = p.sx, NR = Math.max(10, Math.min(34, Math.round(H * 5.5))), NS = 14;
  const fam = p.mat === RockMat.SANDSTONE ? 'hoodoo' : p.mat === RockMat.LIMESTONE ? 'pillar' : 'stack';
  const ox = r.range(-50, 50), waist = r.range(0.5, 0.7), beds = r.range(1.6, 2.6);
  const prof = (t: number) => {
    if (fam === 'hoodoo') {
      const cap = t > 0.84 ? 1.22 + (t - 0.84) * 0.6 : 0;
      const body = 1.3 - 0.55 * Math.sin(Math.min(1, t / waist) * Math.PI * 0.5) + Math.max(0, t - waist) * 0.5;
      return Math.max(cap, body);
    }
    if (fam === 'pillar') return 1.18 - 0.42 * t + 0.08 * Math.sin(t * 9 + ox);
    return 1.12 - 0.22 * t;
  };
  const P: number[] = [], I: number[] = [];
  for (let j = 0; j <= NR; j++) {
    const t = j / NR, y = -0.45 + (H + 0.45) * t;
    const bed = Math.floor((y + 0.45) * beds), fr = (y + 0.45) * beds - bed;
    const recess = fam === 'stack' ? 0.05 : 0.1;
    for (let k = 0; k < NS; k++) {
      const a = (k / NS) * Math.PI * 2 + (j % 2) * (Math.PI / NS);
      const ca = Math.cos(a), sa = Math.sin(a);
      let rr = R0 * prof(Math.max(0, t)) * (1 + nz.fbm3(ca * 1.2 + ox, y * 0.45, sa * 1.2, 3) * 0.22);
      rr *= 1 - recess * hashL(bed, 7) * Math.sin(Math.PI * fr) ** 0.6;
      if (fam === 'pillar') rr *= 1 + 0.07 * Math.cos(a * 7 + nz.n2(y * 0.6, ox) * 2);
      if (t > 0.97) rr *= 0.86;
      P.push(ca * rr, y, sa * rr * (p.sz / p.sx));
    }
  }
  // domed top
  const top = P.length / 3; P.push(0, H + R0 * (fam === 'hoodoo' ? 0.25 : 0.35), 0);
  for (let j = 0; j < NR; j++) for (let k = 0; k < NS; k++) {
    const a = j * NS + k, b = j * NS + ((k + 1) % NS), c = a + NS, d = b + NS;
    I.push(a, c, b, b, c, d);
  }
  for (let k = 0; k < NS; k++) I.push(NR * NS + k, top, NR * NS + ((k + 1) % NS));
  return { p: P, i: I, ao: cavity(P, I, 3) };
}

/** a natural arch: the remnant of a sandstone fin. A boxy cross-section (superellipse) swept over a half ellipse,
 *  thin over the span and swelling into massive buttressed legs, bedded like the rest of the formation */
function archShape(nz: Noise, r: Rand, p: RockPiece): Soup {
  const span = p.sx, H = p.sy, th = p.sz, NA = 34, NS = 16, P: number[] = [], I: number[] = [];
  const ox = r.range(-50, 50), lintel = H * r.range(0.24, 0.32), beds = r.range(1.8, 2.6);
  const path: V3[] = [];
  path.push([-span - lintel * 0.4, -0.9, 0]);
  for (let j = 0; j <= NA; j++) { const a = Math.PI - (j / NA) * Math.PI; path.push([Math.cos(a) * span, Math.sin(a) * (H - lintel * 0.5), 0]); }
  path.push([span + lintel * 0.4, -0.9, 0]);
  const se = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.42);
  for (let j = 0; j < path.length; j++) {
    const a = path[Math.max(0, j - 1)], b = path[Math.min(path.length - 1, j + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const tl = hyp(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    const u = j / (path.length - 1), foot = Math.pow(Math.abs(u - 0.5) * 2, 2.2);
    const rv = lintel * 0.5 + foot * span * 0.42, rz = th * (0.8 + foot * 0.7);
    for (let k = 0; k < NS; k++) {
      const a2 = (k / NS) * Math.PI * 2, c = se(Math.cos(a2)), sn = se(Math.sin(a2));
      const q: V3 = [path[j][0] + nx * c * rv, path[j][1] + ny * c * rv, sn * rz];
      let f = 1 + nz.fbm3(q[0] * 0.7 + ox, q[1] * 0.7, q[2] * 0.7, 3) * 0.22;
      const bed = Math.floor((q[1] + 1) * beds), fr = (q[1] + 1) * beds - bed;
      f *= 1 - 0.09 * hashL(bed, 11) * Math.sin(Math.PI * fr) ** 0.6;
      P.push(path[j][0] + (q[0] - path[j][0]) * f, Math.max(-0.9, path[j][1] + (q[1] - path[j][1]) * f), q[2] * f);
    }
  }
  for (let j = 0; j < path.length - 1; j++) for (let k = 0; k < NS; k++) {
    const a = j * NS + k, b = j * NS + ((k + 1) % NS), c = a + NS, d = b + NS;
    I.push(a, b, c, b, d, c);
  }
  return { p: P, i: I, ao: cavity(P, I, 3) };
}

/** a creased-normal, non-indexed copy of a soup (smooth across gentle curvature, sharp across fractures) */
function crease(s: Soup, cosT: number) {
  const n = s.p.length / 3, F = s.i.length / 3, fn = new Float32Array(F * 3), un = new Float32Array(F * 3);
  for (let f = 0; f < F; f++) {
    const a = s.i[f * 3], b = s.i[f * 3 + 1], c = s.i[f * 3 + 2];
    const ux = s.p[b * 3] - s.p[a * 3], uy = s.p[b * 3 + 1] - s.p[a * 3 + 1], uz = s.p[b * 3 + 2] - s.p[a * 3 + 2];
    const vx = s.p[c * 3] - s.p[a * 3], vy = s.p[c * 3 + 1] - s.p[a * 3 + 1], vz = s.p[c * 3 + 2] - s.p[a * 3 + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = hyp(x, y, z) || 1e-9;
    fn[f * 3] = x; fn[f * 3 + 1] = y; fn[f * 3 + 2] = z; un[f * 3] = x / l; un[f * 3 + 1] = y / l; un[f * 3 + 2] = z / l;
  }
  // vertex -> faces (CSR)
  const deg = new Uint32Array(n + 1);
  for (const v of s.i) deg[v + 1]++;
  for (let v = 0; v < n; v++) deg[v + 1] += deg[v];
  const adj = new Uint32Array(s.i.length), fill = deg.slice(0, n);
  for (let f = 0; f < F; f++) for (let k = 0; k < 3; k++) { const v = s.i[f * 3 + k]; adj[fill[v]++] = f; }
  const pos = new Float32Array(F * 9), nor = new Float32Array(F * 9), ao = new Float32Array(F * 3);
  for (let f = 0; f < F; f++) for (let k = 0; k < 3; k++) {
    const v = s.i[f * 3 + k], o = (f * 3 + k) * 3;
    let x = 0, y = 0, z = 0;
    for (let e = deg[v]; e < deg[v + 1]; e++) {
      const g = adj[e];
      if (un[f * 3] * un[g * 3] + un[f * 3 + 1] * un[g * 3 + 1] + un[f * 3 + 2] * un[g * 3 + 2] < cosT) continue;
      x += fn[g * 3]; y += fn[g * 3 + 1]; z += fn[g * 3 + 2];
    }
    const l = hyp(x, y, z) || 1;
    pos[o] = s.p[v * 3]; pos[o + 1] = s.p[v * 3 + 1]; pos[o + 2] = s.p[v * 3 + 2];
    nor[o] = x / l; nor[o + 1] = y / l; nor[o + 2] = z / l;
    ao[f * 3 + k] = s.ao ? s.ao[v] : 1;
  }
  return { pos, nor, ao };
}

/** columnar basalt: hexagonal prisms on a jittered hex grid, stepped toward the edge, with chamfered tilted tops */
function columns(nz: Noise, r: Rand, p: RockPiece) {
  const s = r.range(0.56, 0.7), rc = (s / Math.sqrt(3)) * 0.97, R = p.sx, H = p.sy;
  const pos: number[] = [], nor: number[] = [], ao: number[] = [];
  const tri = (a: V3, b: V3, c: V3, n: V3 | null, aa: number, ab: number, ac: number) => {
    let N = n;
    if (!N) { const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = hyp(x, y, z) || 1; N = [x / l, y / l, z / l]; }
    pos.push(...a, ...b, ...c); nor.push(...N, ...N, ...N); ao.push(aa, ab, ac);
  };
  const ox = r.range(-50, 50);
  for (let q = -8; q <= 8; q++) for (let w = -8; w <= 8; w++) {
    const cx = (q + w * 0.5) * s, cz = w * s * 0.866;
    const d = hyp(cx, cz), edge = R * (0.78 + 0.3 * nz.n2(Math.atan2(cz, cx) * 1.5 + ox, 0.5));
    if (d > edge) continue;
    let ht = H * (0.3 + 0.7 * Math.pow(1 - d / edge, 0.55)) * r.range(0.72, 1.18);
    if (r.chance(0.12)) ht *= r.range(0.3, 0.6); // a broken column
    const tx = r.range(-0.18, 0.18), tz = r.range(-0.18, 0.18), ch = 0.05;
    const ring = (rad: number, y: number, tilt: boolean): V3[] => Array.from({ length: 6 }, (_, k) => {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      return [cx + x, y + (tilt ? x * tx + z * tz : 0), cz + z];
    });
    const bot = ring(rc, -0.45, false), mid = ring(rc, ht - ch, true), top = ring(rc - ch * 1.6, ht, true);
    const cTop: V3 = [cx, ht, cz];
    for (let k = 0; k < 6; k++) {
      const k2 = (k + 1) % 6;
      const a0 = 0.45, a1 = 0.62 + 0.38 * Math.min(1, ht / H);
      tri(bot[k], mid[k], bot[k2], null, a0, a1, a0); tri(bot[k2], mid[k], mid[k2], null, a0, a1, a1);
      tri(mid[k], top[k], mid[k2], null, a1, 1, a1); tri(mid[k2], top[k], top[k2], null, a1, 1, 1);
      tri(top[k], cTop, top[k2], null, 1, 1, 1);
    }
  }
  return { pos: Float32Array.from(pos), nor: Float32Array.from(nor), ao: Float32Array.from(ao) };
}

/** wood: barrel normals around the axis, bark UVs along it, end grain on the caps (uv.z = texture layer) */
interface WoodGeo { pos: Float32Array; nor: Float32Array; ao: Float32Array; uv: Float32Array }
function woodSoup() { return { pos: [] as number[], nor: [] as number[], ao: [] as number[], uv: [] as number[] }; }
type WS = ReturnType<typeof woodSoup>;
function wtri(S: WS, v: [V3, V3, number, [number, number, number]][]) { for (const [p, n, a, u] of v) { S.pos.push(...p); S.nor.push(...n); S.ao.push(a); S.uv.push(...u); } }
function woodOut(S: WS): WoodGeo { return { pos: Float32Array.from(S.pos), nor: Float32Array.from(S.nor), ao: Float32Array.from(S.ao), uv: Float32Array.from(S.uv) }; }

/** a fallen trunk: tapering, slightly bowed, one end broken into splinters, sunk a little into the ground */
function logShape(nz: Noise, r: Rand, p: RockPiece): WoodGeo {
  const S = woodSoup(), len = p.sx * 2, rad = p.sy, NS = 10, NL = Math.max(4, Math.ceil(len / 0.3));
  const bow = r.range(-0.15, 0.15), ox = r.range(-50, 50), bark = r.chance(0.5) ? RL.bark : RL.barkDark;
  const brokenA = r.chance(0.6), brokenB = r.chance(0.35);
  const ring = (j: number) => {
    const t = j / NL, x = -len / 2 + len * t, rr = rad * (1.08 - 0.22 * t) * (1 + nz.n2(t * 6 + ox, 0) * 0.06);
    const zc = Math.sin(t * Math.PI) * bow;
    return Array.from({ length: NS + 1 }, (_, k) => {
      const a = (k / NS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      let xx = x;
      if (j === 0 && brokenA) xx += r.range(-0.18, 0.05) * (k % 2 ? 1 : 0.4);
      if (j === NL && brokenB) xx += r.range(-0.05, 0.18) * (k % 2 ? 1 : 0.4);
      const pt: V3 = [xx, rad + ca * rr, zc + sa * rr], n: V3 = [0, ca, sa];
      return { p: pt, n, a: 0.55 + 0.45 * Math.max(0, ca * 0.7 + 0.3), u: [x / 2, (a * rad) / 2, bark] as [number, number, number] };
    });
  };
  const rings = Array.from({ length: NL + 1 }, (_, j) => ring(j));
  for (let j = 0; j < NL; j++) for (let k = 0; k < NS; k++) {
    const A = rings[j][k], Bq = rings[j][k + 1], C = rings[j + 1][k], D = rings[j + 1][k + 1];
    wtri(S, [[A.p, A.n, A.a, A.u], [C.p, C.n, C.a, C.u], [Bq.p, Bq.n, Bq.a, Bq.u]]);
    wtri(S, [[Bq.p, Bq.n, Bq.a, Bq.u], [C.p, C.n, C.a, C.u], [D.p, D.n, D.a, D.u]]);
  }
  // end caps: end grain mapped round the pith
  for (const [j, sg] of [[0, -1], [NL, 1]] as [number, number][]) {
    const rg = rings[j], cx = rg.reduce((s2, q) => s2 + q.p[0], 0) / rg.length + sg * 0.02, c: V3 = [cx, rad, rg[0].p[2] - Math.cos(0) * 0 + (rg[0].p[2] + rg[NS / 2].p[2]) / 2 - rg[0].p[2]];
    const n: V3 = [sg, 0, 0];
    for (let k = 0; k < NS; k++) {
      const a0 = (k / NS) * Math.PI * 2, a1 = ((k + 1) / NS) * Math.PI * 2;
      const u0: [number, number, number] = [0.5 + Math.cos(a0) * 0.47, 0.5 + Math.sin(a0) * 0.47, RL.end], u1: [number, number, number] = [0.5 + Math.cos(a1) * 0.47, 0.5 + Math.sin(a1) * 0.47, RL.end];
      const tri: [V3, V3, number, [number, number, number]][] = [[c, n, 1, [0.5, 0.5, RL.end]], [rg[k].p, n, 0.9, u0], [rg[k + 1].p, n, 0.9, u1]];
      if (sg < 0) tri.reverse();
      wtri(S, tri);
    }
  }
  return woodOut(S);
}

/** a stump: buttress roots flaring into the ground, bark up the sides, a sawn or splintered top */
function stumpShape(nz: Noise, r: Rand, p: RockPiece): WoodGeo {
  const S = woodSoup(), R0 = p.sx, H = p.sy, NS = 12, NR = 8, roots = r.int(3, 5), ox = r.range(-50, 50), bark = r.chance(0.5) ? RL.bark : RL.barkDark;
  const broken = H > 0.85 || r.chance(0.4);
  const topY = Array.from({ length: NS + 1 }, (_, k) => H + (broken ? (k % 2 ? r.range(-0.25, 0.05) : r.range(0, 0.22)) : r.range(-0.02, 0.02)));
  topY[NS] = topY[0];
  const rings: { p: V3; n: V3; a: number; u: [number, number, number] }[][] = [];
  for (let j = 0; j <= NR; j++) {
    const t = j / NR;
    rings.push(Array.from({ length: NS + 1 }, (_, k) => {
      const a = (k / NS) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const y = -0.15 + (topY[k] + 0.15) * t;
      const root = Math.max(0, Math.cos(a * roots + ox)) ** 2 * Math.exp(-Math.max(0, y) * 5) * 0.9;
      const rr = R0 * (1 + 0.35 * Math.exp(-Math.max(0, y) * 6) + root) * (1 + nz.n2(a * 2 + ox, y * 3) * 0.05);
      return { p: [ca * rr, y, sa * rr] as V3, n: [ca, 0.25 * Math.exp(-Math.max(0, y) * 4), sa] as V3, a: 0.5 + 0.5 * Math.min(1, Math.max(0, y) / Math.max(0.3, H)), u: [(a * R0) / 2, -y / 2, bark] as [number, number, number] };
    }));
  }
  for (let j = 0; j < NR; j++) for (let k = 0; k < NS; k++) {
    const A = rings[j][k], Bq = rings[j][k + 1], C = rings[j + 1][k], D = rings[j + 1][k + 1];
    wtri(S, [[A.p, A.n, A.a, A.u], [Bq.p, Bq.n, Bq.a, Bq.u], [C.p, C.n, C.a, C.u]]);
    wtri(S, [[Bq.p, Bq.n, Bq.a, Bq.u], [D.p, D.n, D.a, D.u], [C.p, C.n, C.a, C.u]]);
  }
  const top = rings[NR], c: V3 = [0, H - (broken ? 0.08 : 0), 0], n: V3 = [0, 1, 0];
  for (let k = 0; k < NS; k++) {
    const a0 = (k / NS) * Math.PI * 2, a1 = ((k + 1) / NS) * Math.PI * 2;
    wtri(S, [[c, n, 1, [0.5, 0.5, RL.end]], [top[k + 1].p, n, 0.95, [0.5 + Math.cos(a1) * 0.47, 0.5 + Math.sin(a1) * 0.47, RL.end]], [top[k].p, n, 0.95, [0.5 + Math.cos(a0) * 0.47, 0.5 + Math.sin(a0) * 0.47, RL.end]]]);
  }
  return woodOut(S);
}

// ------------------------------------------------------------------------------------------------ the mesh
export class Rocks {
  readonly mesh: THREE.Mesh;
  private ranges: { start: number; count: number; cell: number; h0: number }[] = [];

  constructor(readonly region: Region, U: Record<string, THREE.IUniform>) {
    const R = region, nz = new Noise(R.seed ^ 0x2a0c), parts: { pos: Float32Array; nor: Float32Array; ao: Float32Array; uv?: Float32Array; piece: RockPiece }[] = [];
    let total = 0;
    const shared: Record<string, ReturnType<typeof crease>[]> = {};
    for (const p of R.rocks) {
      const r = new Rand(p.seed);
      let g!: { pos: Float32Array; nor: Float32Array; ao: Float32Array; uv?: Float32Array };
      if (p.kind === 'column') g = columns(nz, r, p);
      else if (p.kind === 'log') g = logShape(nz, r, p);
      else if (p.kind === 'stump') g = stumpShape(nz, r, p);
      else {
        let soup: Soup, unit = true;
        const big = Math.max(p.sx, p.sz, p.sy * 0.6) * 0.85;
        if (p.kind === 'spire') { soup = spireShape(nz, r, p); unit = false; }
        else if (p.kind === 'arch') { soup = archShape(nz, r, p); unit = false; }
        else if (p.kind === 'pebble' || p.kind === 'river') {
          // small stones share a handful of shapes: scaled, the creased normals follow the inverse scale
          const key = p.kind, list = (shared[key] ??= []), vi = r.int(0, 7);
          if (!list[vi]) {
            const vr = new Rand(R.seed * 31 + vi * 977 + (key === 'river' ? 5 : 0));
            list[vi] = crease(key === 'pebble' ? boulderShape(nz, vr, 1, { rough: 0.25, cuts: vr.int(3, 5), cutLo: 0.35, flat: 0.5 }) : boulderShape(nz, vr, 2, { rough: 0.1, cuts: vr.chance(0.3) ? 1 : 0, cutLo: 0.7, flat: 0.45 }), Math.cos(key === 'river' ? 1.2 : 0.62));
          }
          const u = list[vi], P = new Float32Array(u.pos.length), Nn = new Float32Array(u.nor.length);
          for (let v = 0; v < P.length; v += 3) {
            P[v] = u.pos[v] * p.sx; P[v + 1] = u.pos[v + 1] * p.sy; P[v + 2] = u.pos[v + 2] * p.sz;
            const nx = u.nor[v] / p.sx, ny = u.nor[v + 1] / p.sy, nz2 = u.nor[v + 2] / p.sz, l = hyp(nx, ny, nz2) || 1;
            Nn[v] = nx / l; Nn[v + 1] = ny / l; Nn[v + 2] = nz2 / l;
          }
          soup = { p: [], i: [] }; unit = false;
          g = { pos: P, nor: Nn, ao: u.ao };
        }
        else if (p.kind === 'slab') soup = boulderShape(nz, r, big > 1.6 ? 3 : 2, { rough: 0.14, cuts: r.int(3, 6), cutLo: 0.6, flat: 0.8, box: 0.45, layers: p.mat === RockMat.GRANITE || p.mat === RockMat.BASALT ? 3 : Math.max(3, Math.round(p.sy * 2.6)), recess: 0.11 });
        else {
          const layered = p.mat === RockMat.SANDSTONE || p.mat === RockMat.LIMESTONE;
          soup = boulderShape(nz, r, big > 1.35 ? 3 : 2, {
            rough: p.mat === RockMat.GRANITE ? 0.2 : 0.17, cuts: p.mat === RockMat.BASALT ? r.int(5, 8) : r.int(2, 5), cutLo: p.mat === RockMat.BASALT ? 0.45 : 0.6, flat: 0.55,
            box: p.mat === RockMat.BASALT ? 0.7 : layered ? 0.8 : undefined, layers: layered ? Math.max(2, Math.round(p.sy * 2.2)) : 0, recess: 0.07,
          });
        }
        if (unit) for (let v = 0; v < soup.p.length; v += 3) { soup.p[v] *= p.sx; soup.p[v + 1] *= p.sy; soup.p[v + 2] *= p.sz; }
        if (soup.i.length) g = crease(soup, Math.cos(0.62));
      }
      // tilt, yaw, place: one rotation matrix M = Tilt(about the horizontal axis normal to tiltDir) * Yaw
      const c = Math.cos(p.yaw), sn = Math.sin(p.yaw), tc = Math.cos(p.tilt), ts = Math.sin(p.tilt);
      const kx = -Math.sin(p.tiltDir), kz = Math.cos(p.tiltDir), u1 = 1 - tc;
      const t00 = tc + kx * kx * u1, t01 = -kz * ts, t02 = kx * kz * u1;
      const t10 = kz * ts, t11 = tc, t12 = -kx * ts;
      const t20 = kx * kz * u1, t21 = kx * ts, t22 = tc + kz * kz * u1;
      const m00 = t00 * c + t02 * sn, m01 = t01, m02 = -t00 * sn + t02 * c;
      const m10 = t10 * c + t12 * sn, m11 = t11, m12 = -t10 * sn + t12 * c;
      const m20 = t20 * c + t22 * sn, m21 = t21, m22 = -t20 * sn + t22 * c;
      const P = g.pos, Nn = g.nor;
      for (let i = 0; i < P.length; i += 3) {
        const x = P[i], y = P[i + 1], z = P[i + 2];
        P[i] = m00 * x + m01 * y + m02 * z + p.x; P[i + 1] = m10 * x + m11 * y + m12 * z + p.y; P[i + 2] = m20 * x + m21 * y + m22 * z + p.z;
        const nx = Nn[i], ny = Nn[i + 1], nz2 = Nn[i + 2];
        Nn[i] = m00 * nx + m01 * ny + m02 * nz2; Nn[i + 1] = m10 * nx + m11 * ny + m12 * nz2; Nn[i + 2] = m20 * nx + m21 * ny + m22 * nz2;
      }
      parts.push({ ...g, piece: p });
      const cell = Math.min(R.N - 1, Math.max(0, Math.floor(p.z))) * R.N + Math.min(R.N - 1, Math.max(0, Math.floor(p.x)));
      this.ranges.push({ start: total, count: g.pos.length / 3, cell, h0: R.h[cell] });
      total += g.pos.length / 3;
    }
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), info = new Float32Array(total * 3), uvs = new Float32Array(total * 3).fill(-1);
    let o = 0;
    for (const { pos: P, nor: Nn, ao, uv, piece: p } of parts) {
      pos.set(P, o * 3); nor.set(Nn, o * 3);
      if (uv) uvs.set(uv, o * 3);
      let ground = 1e9;
      for (let a = 0; a < 6; a++) ground = Math.min(ground, R.heightAt(p.x + Math.cos(a * 1.05) * (p.sx * 1.08 + 0.3), p.z + Math.sin(a * 1.05) * (p.sz * 1.08 + 0.3)));
      let wl = R.heightAt(p.x, p.z) < R.water + 0.6 ? R.water : -99;
      if (p.wet) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) wl = Math.max(wl, R.riverAt(p.x + dx, p.z + dz) || -99);
      const kindK = p.kind === 'pebble' || p.kind === 'river' ? 1 : 0;
      for (let v = 0; v < ao.length; v++) {
        col[(o + v) * 3] = ao[v]; col[(o + v) * 3 + 1] = p.moss; col[(o + v) * 3 + 2] = kindK;
        info[(o + v) * 3] = p.mat; info[(o + v) * 3 + 1] = wl; info[(o + v) * 3 + 2] = Math.min(ground, p.y + p.sy * 0.25);
      }
      o += ao.length;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aRock', new THREE.BufferAttribute(info, 3));
    geo.setAttribute('aUvL', new THREE.BufferAttribute(uvs, 3));
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, this.material(U));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'rocks';
  }

  private material(TU: Record<string, THREE.IUniform>) {
    const R = this.region, pal = R.pal;
    const U = {
      uRock: { value: buildRockTexture(pal, R.seed) }, uBlocks: TU.uBlocks, uMoss: TU.uMoss, uVis: TU.uVis, uN: TU.uN, uDark: TU.uDark, uTime: TU.uTime, uRivalLayer: TU.uRivalLayer,
      uSnow: { value: R.biome.key === 'tundra' ? 1 : 0 }, uSnowCol: { value: new THREE.Color(pal.snow) },
    };
    const m = new THREE.MeshLambertMaterial();
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec3 aCol; attribute vec3 aRock; attribute vec3 aUvL;
varying vec3 vWp; varying vec3 vNw; varying vec3 vCol; varying vec3 vRock; varying vec3 vUvL;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vNw = normalize(mat3(modelMatrix) * objectNormal); vCol = aCol; vRock = aRock; vUvL = aUvL;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform highp sampler2DArray uRock, uBlocks;
uniform sampler2D uMoss, uVis;
uniform float uN, uTime, uSnow, uRivalLayer;
uniform vec3 uDark, uSnowCol;
varying vec3 vWp; varying vec3 vNw; varying vec3 vCol; varying vec3 vRock; varying vec3 vUvL;
${SHADER_NOISE}
${FOW_FN}
vec3 lichenCol(float h) { return h < 0.33 ? vec3(0.78, 0.74, 0.42) : h < 0.66 ? vec3(0.62, 0.7, 0.58) : vec3(0.86, 0.56, 0.3); }`)
        .replace('#include <map_fragment>', `
vec3 n = normalize(vNw);
float mat = floor(vRock.x + 0.5);
vec3 cell = floor(vWp * 32.0);
float dith = h2(cell.xz + cell.y * 7.31);
bool topF = n.y > 0.6 + (dith - 0.5) * 0.16;
vec2 uv = topF ? vWp.xz : (abs(n.x) > abs(n.z) ? vec2(vWp.z * sign(n.x), -vWp.y) : vec2(-vWp.x * sign(n.z), -vWp.y));
bool wood = vUvL.z > -0.5;
vec3 base = wood ? texture(uRock, vec3(vUvL.xy, floor(vUvL.z + 0.5)), -0.35).rgb : texture(uRock, vec3(uv * 0.5, mat * 2.0 + (topF ? 1.0 : 0.0)), -0.35).rgb;
// strata that run through the whole formation at the same heights (layered stone)
if (mat > 0.5 && mat < 1.5 || mat > 2.5 && mat < 3.5) {
  float k = mat < 1.5 ? 2.3 : 1.25;
  float sy = vWp.y * k + (vn(vWp.xz * 0.22 + 5.0) - 0.5) * 1.3;
  float bh = h2(vec2(floor(sy), mat * 7.0));
  base *= mat < 1.5 ? mix(vec3(1.13, 0.9, 0.78), vec3(0.92, 0.94, 1.02), bh) * (0.9 + bh * 0.2) : mix(vec3(0.95), vec3(1.06, 1.04, 0.98), bh);
  if (!topF && fract(sy) < 0.06) base *= 0.76;
}
// broad weathering tones
base *= 0.88 + vn(vWp.xz * 0.35 + vWp.y * 0.3) * 0.24;
// cavity occlusion and the dark damp foot where stone meets soil
base *= mix(0.38, 1.0, vCol.x);
float foot = smoothstep(0.0, 0.5, vWp.y - vRock.z);
base *= mix(0.6, 1.0, foot);
// lichen crusts on the faces
float lc = vn(vWp.xz * 1.4 + vec2(vWp.y * 1.9, mat * 13.0));
if (!topF && lc > 0.8 && dith > 0.2) base = mix(base, lichenCol(h2(floor(vWp.xz * 2.0) + floor(vWp.y * 2.0))), 0.5);
// moss on the upward faces, thicker in damp woods
float mk = vCol.y;
float patchN = vn(vWp.xz * 1.1 + vWp.y * 0.5) * 0.65 + vn(vWp.xz * 3.7 - vWp.y) * 0.35;
float mossA = mk * smoothstep(0.4, 0.92, n.y) * (0.2 + patchN * 1.1);
if (mossA > 0.5 + (dith - 0.5) * 0.08) base = texture(uRock, vec3(uv * 0.5, ${RL.moss}.0), -0.35).rgb * mix(0.85, 1.0, foot) * (0.92 + patchN * 0.16);
else if (mk > 0.3 && vWp.y - vRock.z < 0.25 + mk * 0.3 && dith > 0.4 && n.y > -0.3) base = mix(base, texture(uRock, vec3(uv * 0.5, ${RL.moss}.0), -0.35).rgb * 0.8, 0.85);
// snow caps in the cold
float snowP = vn(vWp.xz * 1.3 + vWp.y * 0.8) * 0.7 + vn(vWp.xz * 4.1) * 0.3;
if (uSnow > 0.5 && n.y > 0.84 - (dith - 0.5) * 0.06 && snowP > 0.4) base = uSnowCol * (0.8 + dith * 0.08);
// wet stone at the waterline
float wl = vRock.y;
if (wl > -50.0) { float wet = 1.0 - smoothstep(wl - 0.02, wl + 0.22, vWp.y); base = mix(base, base * vec3(0.55, 0.6, 0.64), wet); }
// the Veyr moss and rival creep spread over the stone as they do over the ground
vec3 emis = vec3(0.0);
vec4 cov = texture2D(uMoss, vWp.xz / uN);
float thr = 0.3 + (vn(vWp.xz * 0.85) * 0.62 + vn(vWp.xz * 3.3) * 0.38) * 0.4 + (n.y < 0.3 ? 0.18 : 0.0);
if (cov.r > thr || cov.g > thr + 0.02) {
  vec4 mt = texture(uBlocks, vec3(uv, cov.r > thr ? ${L.moss}.0 : uRivalLayer), -0.35);
  base = mt.rgb; emis = mt.rgb * (1.0 - mt.a) * 1.1;
}
diffuseColor.rgb *= base;
`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += emis;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = applyFow(gl_FragColor.rgb, vWp);');
    };
    m.customProgramCacheKey = () => 'oddworld-rocks';
    return gbuf(m, 1);
  }

  /** after the ground moved: rocks ride it up or down; an impact shatters what stood in the crater */
  reseat(dirty: Set<number>) {
    if (!dirty.size) return;
    const R = this.region, a = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute, info = this.mesh.geometry.getAttribute('aRock') as THREE.BufferAttribute;
    const P = a.array as Float32Array, I = info.array as Float32Array;
    let moved = false;
    for (const rg of this.ranges) {
      if (!dirty.has(rg.cell)) continue;
      const crater = R.b[rg.cell] === B.CRATER;
      const dy = crater ? -60 : R.h[rg.cell] - rg.h0;
      if (Math.abs(dy) < 1e-3) continue;
      rg.h0 = R.h[rg.cell];
      for (let v = rg.start; v < rg.start + rg.count; v++) { P[v * 3 + 1] += dy; I[v * 3 + 2] += dy; }
      moved = true;
    }
    if (moved) { a.needsUpdate = true; info.needsUpdate = true; }
  }
}
