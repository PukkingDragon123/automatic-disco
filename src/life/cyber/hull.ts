// CYBORG WORKERS: the hard-surface kit. Machinery is modelled low-poly and FACETED (every face its own vertices, so
// each plane takes one flat light, the way a pixel artist shades metal), out of convex primitives: boxes, chamfered
// beams, prisms and frustums, ring bands, bolted slabs. Each primitive's faces are grouped by facing into planar
// charts, so its texture is drawn at a high density on clean planes. The painter (hullPaint) then draws what makes
// hardware read up close and at a distance: enamel paint in the worker's livery over dark steel frames, chrome
// piston rods with a sky-and-ground reflection, rubber, hazard stripes, glass with a glint; a lit bevel or a dark
// line on every edge (selective outline), recessed panel lines with a highlight lip, bolts at the corners, rivet
// rows, chipped paint along the edges showing bare steel, grime under the overhangs, stencilled lettering and
// serials, warning stripes, and tiny glowing status lights.
import type { V3, Wt } from '../kit';
import { newCM, type CM } from '../cage';
import { planarChart, type Piece, type Chart, type Body, type Tone } from '../anatomy/core';
import { Px, RP, cell3, h3 } from '../anatomy/paint';
import type { RampName } from '../../art/palette';

export const MAT = { paint: 0, frame: 1, chrome: 2, rubber: 3, hazard: 4, glass: 5, light: 6, brass: 7, accent: 8, pad: 9, steel: 10 } as const;
type C2 = [string, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const V = { add, sub, scl, dot, crs, nrm, len, lerp: (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] };
/** any unit vector perpendicular to n */
export function perp(n: V3): V3 { return nrm(Math.abs(n[1]) < 0.9 ? crs(n, [0, 1, 0]) : crs(n, [1, 0, 0])); }
function newell(P: V3[]): V3 {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]); }
  return nrm([x, y, z]);
}
/** an orthonormal frame from a direction and a rough up */
export function frame(dir: V3, up: V3 = [0, 1, 0]): { d: V3; x: V3; y: V3 } {
  const d = nrm(dir); let x = crs(up, d); if (len(x) < 1e-4) x = perp(d); x = nrm(x);
  return { d, x, y: crs(d, x) };
}

// ------------------------------------------------------------------------------------------------ decals
export type Decal =
  | { kind: 'text'; o: V3; u: V3; v: V3; h: number; text: string; col: C2 }
  | { kind: 'stripes'; o: V3; u: V3; v: V3; w: number; h: number; col?: C2 }
  | { kind: 'light'; o: V3; u: V3; v: V3; size: number; col: 'red' | 'amber' | 'green' | 'cyan' | 'white' }
  | { kind: 'plate'; o: V3; u: V3; v: V3; w: number; h: number; col: C2 };

/** a 3x5 stencil face: each glyph five rows of three bits */
const FONT: Record<string, number[]> = {
  '0': [7, 5, 5, 5, 7], '1': [2, 6, 2, 2, 7], '2': [7, 1, 7, 4, 7], '3': [7, 1, 3, 1, 7], '4': [5, 5, 7, 1, 1], '5': [7, 4, 7, 1, 7], '6': [7, 4, 7, 5, 7], '7': [7, 1, 2, 2, 2], '8': [7, 5, 7, 5, 7], '9': [7, 5, 7, 1, 7],
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [7, 4, 4, 4, 7], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [7, 4, 5, 5, 7], H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 7],
  K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [7, 5, 5, 5, 7], P: [7, 5, 7, 4, 4], Q: [7, 5, 5, 7, 1], R: [6, 5, 6, 5, 5], S: [7, 4, 7, 1, 7], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  '-': [0, 0, 7, 0, 0], '.': [0, 0, 0, 0, 2], '/': [1, 1, 2, 4, 4], '!': [2, 2, 2, 0, 2], '>': [4, 6, 7, 6, 4], '^': [2, 7, 7, 2, 2], ' ': [0, 0, 0, 0, 0], '+': [0, 2, 7, 2, 0], '%': [5, 1, 2, 4, 5],
};
function glyphOn(text: string, col: number, row: number) {
  const gi = Math.floor(col / 4), gx = col - gi * 4;
  if (gi < 0 || gi >= text.length || gx > 2 || row < 0 || row > 4) return false;
  const g = FONT[text[gi]] ?? FONT[' '];
  return ((g[row] >> (2 - gx)) & 1) === 1;
}

// ------------------------------------------------------------------------------------------------ the hull
/**
 * One machine part under construction: convex primitives added in rest-pose model space, one material per face,
 * decals in 3D. `piece()` turns it into an anatomy Piece (cage level, faceted, its own planar charts) that the
 * creature's Body charts, paints and emits with the rest of the animal, skinned rigidly to the bones it rides.
 */
export class Hull {
  m: CM = newCM();
  private bins: { faces: number[]; n: V3 }[] = [];
  decals: Decal[] = [];
  /** faces large enough to carry panel lines and corner bolts */
  constructor(readonly name: string) {}
  get tris() { let t = 0; for (const f of this.m.F) t += f.length - 2; return t; }
  /** a convex primitive: polygons listed counter-clockwise seen from outside, one material each (or one for all) */
  prim(polys: V3[][], mats: number | number[]) {
    const local: { faces: number[]; n: V3 }[] = [];
    // a convex solid: every face turned to look away from the solid's centre, whatever order it was listed in
    let cx = 0, cy = 0, cz = 0, cnt = 0;
    for (const pts of polys) for (const q of pts) { cx += q[0]; cy += q[1]; cz += q[2]; cnt++; }
    const C: V3 = [cx / cnt, cy / cnt, cz / cnt];
    polys.forEach((pts, k) => {
      if (pts.length < 3) return;
      let n = newell(pts);
      const pc = scl(pts.reduce((a, b) => add(a, b), [0, 0, 0] as V3), 1 / pts.length);
      if (dot(n, sub(pc, C)) < 0) { pts = [...pts].reverse(); n = scl(n, -1); }
      const base = this.m.V.length;
      for (const p of pts) this.m.V.push([p[0], p[1], p[2]]);
      const f = this.m.F.length;
      this.m.F.push(pts.map((_, i) => base + i)); this.m.tag.push(0); this.m.mat.push(Array.isArray(mats) ? mats[k] ?? mats[0] : mats);
      let b = local.find((x) => dot(x.n, n) > 0.94);
      if (!b) { b = { faces: [], n }; local.push(b); }
      b.faces.push(f);
    });
    this.bins.push(...local);
    return this;
  }
  /** an extruded convex section: `sec` (2D points CCW in the frame's x/y) swept from a to b, scaled by k0 at a, k1 at b */
  extrude(a: V3, b: V3, sec: number[][], up: V3, mat: number | { side: number; cap: number }, k0 = 1, k1 = 1, capA = true, capB = true) {
    const F = frame(sub(b, a), up), at = (c: V3, q: number[], k: number): V3 => add(c, add(scl(F.x, q[0] * k), scl(F.y, q[1] * k)));
    const A = sec.map((q) => at(a, q, k0)), B = sec.map((q) => at(b, q, k1)), n = sec.length, polys: V3[][] = [], mats: number[] = [];
    const ms = typeof mat === 'number' ? mat : mat.side, mc = typeof mat === 'number' ? mat : mat.cap;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; polys.push([A[i], A[j], B[j], B[i]]); mats.push(ms); }
    if (capA) { polys.push([...A].reverse()); mats.push(mc); }
    if (capB) { polys.push([...B]); mats.push(mc); }
    // orientation: the section must run so the side quads face out; flip them all if they face in
    const c = scl(add(a, b), 0.5), q0 = polys[0], n0 = newell(q0), m0 = scl(add(q0[0], q0[2]), 0.5);
    if (dot(n0, sub(m0, c)) < 0) for (const p of polys) p.reverse();
    return this.prim(polys, mats);
  }
  /** a beam: a rectangular section (w x h, chamfered by `ch` of the smaller side) from a to b */
  beam(a: V3, b: V3, w: number, h: number, up: V3, mat: number | { side: number; cap: number }, ch = 0.22, k1 = 1, caps = true) {
    const x = w / 2, y = h / 2, c = Math.min(x, y) * ch;
    const sec = c > 1e-6 ? [[x, y - c], [x - c, y], [-x + c, y], [-x, y - c], [-x, -y + c], [-x + c, -y], [x - c, -y], [x, -y + c]] : [[x, y], [-x, y], [-x, -y], [x, -y]];
    return this.extrude(a, b, sec.reverse(), up, mat, 1, k1, caps, caps);
  }
  /** a prism or frustum: an n-gon of radius r0 at a, r1 at b */
  cyl(a: V3, b: V3, r0: number, n: number, mat: number | { side: number; cap: number }, r1 = r0, up: V3 = [0, 1, 0], rot = 0.5) {
    const sec = Array.from({ length: n }, (_, i) => { const t = ((i + rot) / n) * Math.PI * 2; return [Math.cos(t), Math.sin(t)]; });
    return this.extrude(a, b, sec, up, mat, r0, r1);
  }
  /** a box from a centre and three half-axis vectors */
  box(c: V3, X: V3, Y: V3, Z: V3, mat: number | number[]) {
    const p = (i: number, j: number, k: number): V3 => add(c, add(scl(X, i), add(scl(Y, j), scl(Z, k))));
    return this.prim([
      [p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1)], [p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1), p(-1, -1, -1)],
      [p(-1, 1, -1), p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1)], [p(-1, -1, 1), p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1)],
      [p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1)], [p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1)],
    ], mat);
  }
  /** a slab: a convex polygon (CCW seen from outside along n) given thickness, its top face inset for a bevel */
  slab(pts: V3[], n: V3, thick: number, mat: number, inset = 0.12, side = MAT.frame) {
    const cen = scl(pts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / pts.length);
    const top = pts.map((p) => add(add(p, scl(sub(cen, p), inset)), scl(n, thick))), bot = pts.map((p) => add(p, scl(n, -thick * 0.15)));
    const N = pts.length, polys: V3[][] = [[...top]], mats: number[] = [mat];
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; polys.push([bot[i], bot[j], top[j], top[i]]); mats.push(side === MAT.frame ? mat : side); }
    polys.push([...bot].reverse()); mats.push(MAT.frame);
    if (dot(newell(polys[0]), n) < 0) for (const p of polys) p.reverse();
    return this.prim(polys, mats);
  }
  /** a band of n blocks round an axis (a collar, a hose clamp, a bearing race) */
  band(c: V3, axis: V3, r: number, w: number, thick: number, n: number, mat: number, gap = 0.08) {
    const F = frame(axis), half = w / 2;
    for (let i = 0; i < n; i++) {
      const a0 = ((i + gap / 2) / n) * Math.PI * 2, a1 = ((i + 1 - gap / 2) / n) * Math.PI * 2;
      const dir = (a: number): V3 => add(scl(F.x, Math.cos(a)), scl(F.y, Math.sin(a)));
      const P = (a: number, rr: number, s: number): V3 => add(add(c, scl(dir(a), rr)), scl(F.d, s * half));
      const ri = r, ro = r + thick;
      const quads: V3[][] = [
        [P(a0, ro, -1), P(a1, ro, -1), P(a1, ro, 1), P(a0, ro, 1)], [P(a0, ri, 1), P(a1, ri, 1), P(a1, ri, -1), P(a0, ri, -1)],
        [P(a0, ri, 1), P(a0, ro, 1), P(a1, ro, 1), P(a1, ri, 1)], [P(a1, ri, -1), P(a1, ro, -1), P(a0, ro, -1), P(a0, ri, -1)],
        [P(a0, ri, -1), P(a0, ro, -1), P(a0, ro, 1), P(a0, ri, 1)], [P(a1, ri, 1), P(a1, ro, 1), P(a1, ro, -1), P(a1, ri, -1)],
      ];
      const mid = add(c, scl(dir((a0 + a1) / 2), r + thick / 2));
      for (const q of quads) { const nq = newell(q), mq = scl(q.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 0.25); if (dot(nq, sub(mq, mid)) < 0) q.reverse(); }
      this.prim(quads, mat);
    }
    return this;
  }
  decal(d: Decal) { this.decals.push(d); return this; }
  /** the finished piece: cage-level, faceted, its own planar charts */
  piece(o: { skin: (p: V3) => Wt; paint: (c: Chart, p: Piece, b: Body) => void; k?: number; reg?: number; tone?: Tone }): Piece {
    const bins = this.bins, k = o.k ?? 2.4, name = this.name;
    return {
      name, m: this.m, grids: [], levels: 0, skin: o.skin, paint: o.paint, k, reg: o.reg ?? 12, tone: o.tone,
      charts: (p) => bins.map((b, i) => { const ax = perp(b.n); return planarChart(p.m, b.faces, 'h' + i, ax, crs(b.n, ax), k, 0.02); }),
    };
  }
}

// ------------------------------------------------------------------------------------------------ the painter
export interface HullLook {
  paint: C2; accent: C2; frame: C2;
  /** spacing of panel seams (m) on big faces; 0 none */
  panel?: number;
  /** chipped paint along edges (0..1) and grime underneath (0..1) */
  wear?: number; grime?: number;
  seed?: number;
}
const LIGHT: Record<string, [RampName, number]> = { red: ['ruby', 5], amber: ['gold', 5], green: ['malachite', 5], cyan: ['teal', 6], white: ['snow', 6] };
interface FaceInfo { n: V3; ax: V3; ay: V3; P2: number[][]; x0: number; x1: number; y0: number; y1: number; o: V3; area: number }
/** paint a hull piece (all its charts) in a livery with the full set of hard-surface marks */
export function hullPaint(look: HullLook, decals: Decal[]) {
  const seed = look.seed ?? 7, wear = look.wear ?? 0.5, grime = look.grime ?? 0.5, panel = look.panel ?? 0;
  const R = (c: C2) => RP(c[0] as RampName);
  const f = (ch: Chart, pc: Piece, b: Body) => {
    const px = new Px(ch, b), gb = px.gb, n = px.n, P = gb.P, N = gb.N, FI = gb.F, MM = gb.M, L = b.light;
    const tpm = Math.max(gb.w, gb.h) / Math.max(1e-6, ch.wm, ch.hm), cellM = 1 / tpm;
    const glow = new Uint8Array(n);
    const info = new Map<number, FaceInfo>();
    const face = (fi: number): FaceInfo => {
      let I = info.get(fi); if (I) return I;
      const pts = pc.m.F[fi].map((v) => pc.m.V[v]), nn = newell(pts);
      // the face's own axes: along its longest edge, and across
      let best = 0, ax: V3 = perp(nn);
      for (let k = 0; k < pts.length; k++) { const e = sub(pts[(k + 1) % pts.length], pts[k]), l = len(e); if (l > best) { best = l; ax = scl(e, 1 / l); } }
      const ay = nrm(crs(nn, ax)), o = pts[0], P2 = pts.map((p) => [dot(sub(p, o), ax), dot(sub(p, o), ay)]);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const q of P2) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      I = { n: nn, ax, ay, P2, x0, x1, y0, y1, o, area: (x1 - x0) * (y1 - y0) };
      info.set(fi, I); return I;
    };
    const Rp = R(look.paint), Ra = R(look.accent), Rf = R(look.frame), Rs = RP('steel'), Rk = RP('ink'), Rbr = RP('brass'), Rg = RP('sapphire'), Rh = RP('ochre'), Rpad = RP('basalt'), Rsoil = RP('soil');
    const q: V3 = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const m = MM[i] - 1; if (m < 0) continue;
      q[0] = P[i * 3]; q[1] = P[i * 3 + 1]; q[2] = P[i * 3 + 2];
      const fi = FI[i]; if (fi < 0) continue;
      const F = face(fi), lam = F.n[0] * L[0] + F.n[1] * L[1] + F.n[2] * L[2];
      const d = sub(q, F.o), sx = dot(d, F.ax), sy = dot(d, F.ay);
      // distance to the face's outline, in texels
      let de = Infinity;
      for (let k = 0; k < F.P2.length; k++) {
        const a = F.P2[k], c = F.P2[(k + 1) % F.P2.length], ex = c[0] - a[0], ey = c[1] - a[1], l2 = ex * ex + ey * ey || 1e-12;
        const t = Math.max(0, Math.min(1, ((sx - a[0]) * ex + (sy - a[1]) * ey) / l2)), dx = sx - a[0] - ex * t, dy = sy - a[1] - ey * t;
        de = Math.min(de, Math.hypot(dx, dy));
      }
      de *= tpm;
      const painted = m === MAT.paint || m === MAT.accent || m === MAT.hazard;
      // the material
      let Rm = Rp, st = look.paint[1];
      switch (m) {
        case MAT.accent: Rm = Ra; st = look.accent[1]; break;
        case MAT.frame: Rm = Rf; st = look.frame[1]; break;
        case MAT.steel: Rm = Rs; st = 3; break;
        case MAT.chrome: { Rm = Rs; const ny = F.n[1]; st = ny > 0.45 ? 6 : ny > 0.05 ? 4 : ny > -0.25 ? 2 : 1; break; }
        case MAT.rubber: Rm = Rk; st = 1; break;
        case MAT.pad: Rm = Rpad; st = 1; break;
        case MAT.brass: Rm = Rbr; st = 3; break;
        case MAT.glass: Rm = Rg; st = 1; break;
        case MAT.hazard: { const w = 0.045, s = (sx + sy) / w; Rm = (Math.floor(s) & 1) ? Rk : Rh; st = (Math.floor(s) & 1) ? 1 : 5; break; }
        case MAT.light: px.over[i] = RP('gold')[5]; glow[i] = 1; break;
      }
      px.put(i, Rm, st);
      if (m === MAT.light) continue;
      let mk = 0;
      // selective outline: a lit bevel on faces toward the light, a dark line on the others
      if (de < 1) mk += lam > 0.2 ? 1.5 : -1.5;
      else if (de < 2 && lam > 0.55) mk += 0.5;
      // glass: a dark rim and one hard diagonal glint
      if (m === MAT.glass) { const g = ((sx - sy * 0.6) / Math.max(0.02, (F.x1 - F.x0) * 0.6)) % 1; if (de >= 1 && Math.abs(g - 0.35) < 0.05) mk += 4; else if (de >= 1 && Math.abs(g - 0.47) < 0.02) mk += 3; }
      // chrome: a sharp horizon line in the reflection, glints
      if (m === MAT.chrome && de >= 1) { const hz = ((q[1] * 7.3 + q[0] * 2.1) % 1 + 1) % 1; if (hz < 0.08) mk -= 1.2; }
      // panels: a recessed line inset from the edge on large faces, seams across long faces, bolts in the corners
      const big = (F.x1 - F.x0) * tpm > 22 && (F.y1 - F.y0) * tpm > 14;
      if ((painted || m === MAT.frame) && big) {
        if (de >= 3 && de < 4) mk -= 1.3; else if (de >= 4 && de < 5 && lam > 0.1) mk += 0.6;
        if (panel > 0 && de >= 5) {
          const span = F.x1 - F.x0, k = Math.max(1, Math.round(span / panel));
          if (k > 1) { const u = ((sx - F.x0) / span) * k, fr = (u - Math.round(u)) * (span / k) * tpm; if (Math.abs(Math.round(u) - u) < 0.5 && Math.round(u) > 0 && Math.round(u) < k) { if (Math.abs(fr) < 0.5) mk -= 1.4; else if (fr >= 0.5 && fr < 1.5) mk += 0.7; } }
          // a rivet row along the inset line
          if (de >= 6 && de < 8) { const rv = ((sx - F.x0) * tpm) % 7; if (rv < 2 && de < 7.5) mk += de < 7 ? 1.2 : -1; }
        }
        // corner bolts: a 2x2 head, lit on top and dark under
        for (const [cx, cy] of [[F.x0, F.y0], [F.x1, F.y0], [F.x0, F.y1], [F.x1, F.y1]]) {
          const bx = (sx - (cx + Math.sign((F.x0 + F.x1) / 2 - cx) * 6.5 * cellM)) * tpm, by = (sy - (cy + Math.sign((F.y0 + F.y1) / 2 - cy) * 6.5 * cellM)) * tpm;
          if (Math.abs(bx) < 1.2 && Math.abs(by) < 1.2) { mk += by > 0 ? 1.6 : -1; px.rampI[i] = px.ramp(Rs); px.step[i] = 3; }
          else if (Math.abs(bx) < 2 && Math.abs(by) < 2) mk -= 0.8;
        }
      }
      // wear: paint chipped off the edges to bare steel, in clusters; scratches on big faces
      if (painted && de < 4) { const c = cell3(q[0], q[1], q[2], cellM * 3, seed); if (h3(c.id, 3, seed) < wear * (de < 2 ? 0.55 : 0.25)) { px.rampI[i] = px.ramp(Rs); px.step[i] = de < 1.5 ? 5 : 4; } }
      if (painted && big) { const c = cell3(q[0] * 0.6, q[1] * 3, q[2] * 0.6, cellM * 5, seed + 9); if (h3(c.id, 5, seed) < wear * 0.05) mk -= 0.8; }
      // grime: dark under the overhangs, earth up the feet
      if (F.n[1] < -0.25) mk -= 0.8 * grime;
      if (q[1] < 0.12 && m !== MAT.glass) { const c = cell3(q[0], q[1] * 2, q[2], cellM * 3, seed + 3); if (h3(c.id, 1, seed) < grime * (1 - q[1] / 0.12)) { px.rampI[i] = px.ramp(Rsoil); px.step[i] = 2; } }
      px.mark[i] += mk;
    }
    // decals: stencils, stripes, plates, lights
    for (const dc of decals) {
      const nn = nrm(crs(dc.u, dc.v)), tol = 'h' in dc ? Math.max(dc.h, 0.02) * 0.8 : 0.03;
      const cell = dc.kind === 'text' ? dc.h / 5 : 0;
      for (let i = 0; i < n; i++) {
        if (MM[i] === 0) continue;
        if (N[i * 3] * nn[0] + N[i * 3 + 1] * nn[1] + N[i * 3 + 2] * nn[2] < 0.55) continue;
        q[0] = P[i * 3]; q[1] = P[i * 3 + 1]; q[2] = P[i * 3 + 2];
        const d = sub(q, dc.o); if (Math.abs(dot(d, nn)) > tol) continue;
        const s = dot(d, dc.u), t = dot(d, dc.v);
        if (dc.kind === 'text') {
          const wid = dc.text.length * 4 * cell - cell, col = Math.floor((s + wid / 2) / cell), row = Math.floor((dc.h / 2 - t) / cell);
          if (glyphOn(dc.text, col, row)) px.put(i, R(dc.col), dc.col[1]), (px.mark[i] = 0);
        } else if (dc.kind === 'stripes') {
          if (Math.abs(s) < dc.w / 2 && Math.abs(t) < dc.h / 2) { const k = Math.floor((s + t) / (dc.h * 0.9)) & 1; if (k) px.put(i, Rk, 1); else px.put(i, R(dc.col ?? ['ochre', 5]), (dc.col ?? ['ochre', 5])[1]); if (Math.abs(Math.abs(t) - dc.h / 2) * tpm < 1) px.mark[i] -= 1.2; }
        } else if (dc.kind === 'plate') {
          if (Math.abs(s) < dc.w / 2 && Math.abs(t) < dc.h / 2) { px.put(i, R(dc.col), dc.col[1]); const e = Math.min(dc.w / 2 - Math.abs(s), dc.h / 2 - Math.abs(t)) * tpm; px.mark[i] = e < 1 ? -1.5 : 0; }
        } else if (dc.kind === 'light') {
          const hs = Math.max(dc.size / 2, 1.1 * cellM), as = Math.abs(s), at = Math.abs(t);
          if (as < hs && at < hs) { const [rn, rs] = LIGHT[dc.col]; px.over[i] = RP(rn)[(as < hs * 0.5 && at < hs * 0.5) ? rs : rs - 1]; glow[i] = 1; }
          else if (as < hs + cellM && at < hs + cellM) { px.over[i] = RP('ink')[1]; }
        }
      }
    }
    px.flush({ glow: (i) => glow[i] === 1 });
  };
  (f as unknown as { tone: Tone }).tone = { ramp: RP(look.paint[0] as RampName), step: look.paint[1] };
  return f;
}
