// Hero models: the plant parts that are sculpted as designed 3D forms rather than grown as cards. Trunks flare into
// buttresses, twist, carry knots, burls, ridged bark, hollows and lichen, sit in a soil collar and host shelf fungi,
// epiphytes and stilt roots. Mushrooms have thick rims, real gill fins, warts, rings and volvas. Flowers are curved,
// cupped petals in overlapping whorls on a receptacle, with sepals, stamens and a pistil; they open by day and go to
// seed. Carnivorous plants: snap traps whose hinged lobes and interlocking teeth shut on prey, pitchers with a ribbed
// lip, a hood and pooled liquid, sundews with curling, glistening tentacles. Alien growth: membrane sails between
// spines, lure stalks spiralling up to a glowing bulb. Lily pads are slit pads, some with upturned rims, with flowers
// rising from the water. Every surface uses a hand-drawn pixel texture (floraTex) or a master-palette ramp colour.
import { Rand } from '../core/rand';
import { rampNamed, rampFor } from './pixelKit';
import { FloraTex, BARK, barkU, type Rect } from './floraTex';
import { Geo, KIND, tube, vadd, vsub, vmul, vdot, vcross, vlen, vnrm, vperp, linHex, ribbonStrip, leafCard, sphere, facetGrid, SLOT_GAIN, type PlantGeo } from './floraMesh';
import type { V3, Shape } from './plantStyle';
import type { PlantSpecies } from './plantArt';
import type { RampName } from '../art/palette';

const TAU = Math.PI * 2;
const UP: V3 = [0, 1, 0];
type C3 = [number, number, number];
/** Rodrigues rotation of v about unit axis k by a */
const rot = (v: V3, k: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return vadd(vadd(vmul(v, c), vmul(vcross(k, v), s)), vmul(k, vdot(k, v) * (1 - c))); };
const horiz = (d: V3): V3 => { const h: V3 = [d[0], 0, d[2]]; return vlen(h) > 1e-4 ? vnrm(h) : [1, 0, 0]; };
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------------------------------------------ helpers
type NOut = V3 | ((p: V3) => V3);
const outOf = (o: NOut, p: V3) => (typeof o === 'function' ? o(p) : o);
/** a smooth sheet over a grid of points: normals from the grid, turned to face `out`; winding follows the normals */
export function sheet(g: Geo, P: V3[][], rect: Rect, o: { out?: NOut; flut?: (j: number, i: number) => number; uv?: (j: number, i: number, p: V3) => [number, number] } = {}) {
  const J = P.length - 1, I = P[0].length - 1, base = g.n;
  for (let j = 0; j <= J; j++) {
    const row = P[j], closed = vlen(vsub(row[0], row[I])) < 1e-6;
    for (let i = 0; i <= I; i++) {
      const ip = i < I ? i + 1 : closed ? 1 : I, im = i > 0 ? i - 1 : closed ? I - 1 : 0;
      const du = vsub(row[ip], row[im]), dv = vsub(P[Math.min(J, j + 1)][i], P[Math.max(0, j - 1)][i]);
      let n = vcross(du, dv);
      if (vlen(n) < 1e-12) n = o.out ? outOf(o.out, row[i]) : UP;
      n = vnrm(n);
      if (o.out && vdot(n, outOf(o.out, row[i])) < 0) n = vmul(n, -1);
      const [u, v] = o.uv ? o.uv(j, i, row[i]) : [rect.u0 + rect.du * (i / I), rect.v0 + rect.dv * (j / J)];
      g.v(row[i], n, u, v, o.flut ? o.flut(j, i) : 0);
    }
  }
  for (let j = 0; j < J; j++) for (let i = 0; i < I; i++) { const a = base + j * (I + 1) + i, b = a + I + 1; g.quadN(a, a + 1, b + 1, b); }
}
/** a thin tube textured from an atlas rect (tentacles, filaments: kinds that read the atlas, not the bark) */
export function atube(g: Geo, pts: V3[], rad: number[], rect: Rect, sides: number, flut?: (i: number) => number) {
  const n = pts.length; if (n < 2) return;
  const T: V3[] = []; for (let i = 0; i < n; i++) T.push(vnrm(vsub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let N0 = vperp(T[0]), prev = -1;
  for (let i = 0; i < n; i++) {
    N0 = vnrm(vsub(N0, vmul(T[i], vdot(N0, T[i])))); const bb = vcross(T[i], N0), base = g.n;
    for (let s = 0; s <= sides; s++) { const a = (s / sides) * TAU, dir = vadd(vmul(N0, Math.cos(a)), vmul(bb, Math.sin(a))); g.v(vadd(pts[i], vmul(dir, rad[i])), dir, rect.u0 + rect.du * (s / sides), rect.v0 + rect.dv * (i / (n - 1)), flut ? flut(i) : 0); }
    if (prev >= 0) for (let s = 0; s < sides; s++) g.quadN(prev + s, prev + s + 1, base + s + 1, base + s);
    prev = base;
  }
}
const ring = (c: V3, r: number, y: number, seg: number, jag?: (i: number) => number, ph = 0): V3[] =>
  Array.from({ length: seg + 1 }, (_, i) => { const a = ((i % seg) / seg) * TAU + ph, k = jag ? jag(i % seg) : 1; return [c[0] + Math.cos(a) * r * k, c[1] + y, c[2] + Math.sin(a) * r * k] as V3; });

// ------------------------------------------------------------------------------------------------ trunks
export interface TrunkStyle { slot: number; lobes: number; lobePh: number; flare: number; twist: number; plates: number; ridges: number; knots: [number, number, number][]; hollow: number; hollowA: number; lichen: number; lichenRamp: RampName }
/** a species' trunk character (stable per species): bark kind, buttresses, twist, knots and burls, a hollow, lichen */
export function trunkStyle(sp: PlantSpecies, ringed: boolean): TrunkStyle {
  const r = new Rand(sp.id * 7907 + 11 + (sp.trunk & 0xffff));
  const slot = ringed ? BARK.RING : sp.arch === 'umbrella' ? r.pick([BARK.FURROW, BARK.PLATE, BARK.SCALE]) : r.pick([BARK.FURROW, BARK.PLATE, BARK.SMOOTH, BARK.FIBRE, BARK.SCALE, BARK.FURROW]);
  const [plates, ridges] = ({ [BARK.FURROW]: [0.045, 7], [BARK.PLATE]: [0.07, 4], [BARK.SCALE]: [0.06, 6], [BARK.FIBRE]: [0.035, 9], [BARK.SMOOTH]: [0.012, 3], [BARK.RING]: [0, 0] } as Record<number, [number, number]>)[slot] ?? [0.03, 5];
  const knots: [number, number, number][] = [];
  for (let k = r.int(1, 3); k > 0; k--) knots.push([r.range(0.25, 0.8), r.range(0, TAU), r.range(0.05, 0.1)]);
  if (!ringed && r.chance(0.45)) knots.push([r.range(0.05, 0.14), r.range(0, TAU), r.range(0.13, 0.2)]);
  return {
    slot, lobes: ringed ? 0 : sp.arch === 'umbrella' ? r.int(2, 3) : r.int(3, 6), lobePh: r.range(0, TAU),
    flare: ringed ? 0.42 : sp.arch === 'umbrella' ? r.range(0.3, 0.5) : r.range(0.55, 1.05),
    twist: ringed ? 0 : slot === BARK.FIBRE ? r.range(0.55, 0.95) : r.range(0.05, 0.3) * r.sign(),
    plates, ridges, knots: ringed ? [] : knots, hollow: !ringed && r.chance(0.32) ? r.range(0.2, 0.45) : 0, hollowA: r.range(0, TAU),
    lichen: slot === BARK.SMOOTH || slot === BARK.FURROW || slot === BARK.PLATE ? (r.chance(0.65) ? r.int(2, 5) : 0) : 0,
    lichenRamp: r.pick(['sage', 'straw', 'teal', 'ochre', 'moss'] as const),
  };
}
export interface TrunkRings { rows: V3[][]; dirs: V3[][]; hs: number[]; ctr: V3[]; rad: number[] }
/** a sculpted trunk along a polyline: buttress lobes flaring at the foot, the grain twisting (the bark texture rides
 *  the twist), ridged bark with depth, knots and burls, a hollow; lichen crusts on the bark */
export function sculptTrunk(g: Geo, pts0: V3[], rad0: number[], st: TrunkStyle, lod: number, col: C3, tex: FloraTex, rr: Rand): TrunkRings {
  // rings every 16 cm up close (35 cm on the light mesh) and a fine foot for the flare; the foot is sunk into the soil
  const pts: V3[] = [], rad: number[] = [], stepL = lod ? 0.35 : 0.16;
  for (let i = 0; i < pts0.length - 1; i++) {
    const a = pts0[i], b = pts0[i + 1], k = Math.max(1, Math.ceil(vlen(vsub(b, a)) / stepL));
    for (let j = 0; j < k; j++) { pts.push(lerp3(a, b, j / k)); rad.push(rad0[i] + (rad0[i + 1] - rad0[i]) * (j / k)); }
  }
  pts.push(pts0[pts0.length - 1]); rad.push(rad0[rad0.length - 1]);
  if (!lod && pts.length > 1) {
    const a = pts[0], b = pts[1], L = vlen(vsub(b, a)), rb = rad[1];
    for (const h of [0.12, 0.05]) if (L > h * 1.4) { pts.splice(1, 0, lerp3(a, b, h / L)); rad.splice(1, 0, rad[0] + (rb - rad[0]) * (h / L)); }
  }
  pts[0] = vadd(pts[0], [0, -0.06, 0]);
  const n = pts.length, sides = lod ? 8 : 12, T: V3[] = [], F: V3[] = [];
  for (let i = 0; i < n; i++) T.push(vnrm(vsub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let N0 = vperp(T[0]);
  for (let i = 0; i < n; i++) { N0 = vnrm(vsub(N0, vmul(T[i], vdot(N0, T[i])))); F.push(N0); }
  const h0 = pts0[0][1], Ht = Math.max(0.5, pts[n - 1][1] - h0);
  // the radius field R[i][s] and the darkening (knot eyes, the hollow)
  const R: number[][] = [], D: number[][] = [], hs: number[] = [], acc: number[] = [];
  let L = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) L += vlen(vsub(pts[i], pts[i - 1]));
    const h = Math.max(0, pts[i][1] - h0), flare = st.flare * Math.exp(-h / 0.3), Ri: number[] = [], Di: number[] = [];
    hs.push(h); acc.push(L);
    for (let s = 0; s <= sides; s++) {
      const a = ((s % sides) / sides) * TAU;
      const lobe = st.lobes ? Math.pow(Math.max(0, Math.cos(st.lobes * a + st.lobePh)), 3) : 0;
      let rv = rad[i] * (1 + flare * (0.22 + 1.7 * lobe)) * (1 + st.plates * (st.ridges ? Math.cos(st.ridges * a) : 0)), dark = 1;
      for (const [kh, ka, ks] of st.knots) {
        const dh = (h - kh * Ht) / ks, da = (angDiff(a, ka) * rad[i]) / ks, b = Math.exp(-(dh * dh + da * da) * 2.2);
        rv += b * ks * 0.5; if (b > 0.5) dark = Math.min(dark, b > 0.85 ? 0.55 : 0.8);
      }
      if (st.hollow > 0 && h > 0.03 && h < st.hollow) { const da = Math.abs(angDiff(a, st.hollowA)); if (da < 0.55) { rv *= 0.42 + 0.5 * (da / 0.55) ** 2; dark = Math.min(dark, da < 0.4 ? 0.3 : 0.6); } }
      if (h < 0.05) dark *= 0.8;
      Ri.push(rv); Di.push(dark);
    }
    R.push(Ri); D.push(Di);
  }
  const circ = TAU * Math.max(0.02, rad[0]), vk = (31 / 64) / circ;
  const rows: V3[][] = [], dirs: V3[][] = [];
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const t = T[i], nn = F[i], bb = vcross(t, nn), tw = st.twist * acc[i], base = g.n, row: V3[] = [], drow: V3[] = [];
    const dl = Math.max(1e-3, acc[Math.min(n - 1, i + 1)] - acc[Math.max(0, i - 1)]);
    for (let s = 0; s <= sides; s++) {
      const at = ((s % sides) / sides) * TAU + tw, ca = Math.cos(at), sa = Math.sin(at);
      const dir: V3 = vadd(vmul(nn, ca), vmul(bb, sa)), tan: V3 = vadd(vmul(nn, -sa), vmul(bb, ca));
      const rv = R[i][s], dRa = (R[i][(s + 1) % sides] - R[i][(s + sides - 1) % sides]) / ((2 * TAU) / sides), dRl = (R[Math.min(n - 1, i + 1)][s] - R[Math.max(0, i - 1)][s]) / dl;
      const p = vadd(pts[i], vmul(dir, rv));
      row.push(p); drow.push(dir);
      const k = D[i][s];
      g.col = [col[0] * k, col[1] * k, col[2] * k];
      g.v(p, vnrm(vsub(vsub(dir, vmul(tan, dRa / Math.max(0.01, rv))), vmul(t, dRl))), barkU(st.slot, s / sides), acc[i] * vk);
    }
    rows.push(row); dirs.push(drow);
    if (prev >= 0) for (let s = 0; s < sides; s++) g.quadN(prev + s, prev + s + 1, base + s + 1, base + s);
    prev = base;
  }
  g.col = col;
  // lichen: crusts pressed to the bark between knee and crown
  if (!lod && st.lichen) {
    const rect = tex.lichen(rampNamed(st.lichenRamp), rr.int(0, 2)), kind = g.kind;
    g.kind = KIND.LEAF; g.col = [1, 1, 1];
    for (let k = 0; k < st.lichen; k++) {
      const i = Math.min(n - 2, 1 + Math.floor(rr.range(0.15, 0.7) * (n - 2))), s = rr.int(0, sides - 1);
      const q = [rows[i][s], rows[i][s + 1], rows[i + 1][s + 1], rows[i + 1][s]].map((p, j) => vadd(p, vmul(j === 1 || j === 2 ? dirs[i][s + 1] : dirs[i][s], 0.005)));
      const nn = dirs[i][s];
      g.quad(g.v(q[0], nn, rect.u0, rect.v0), g.v(q[1], nn, rect.u0 + rect.du, rect.v0), g.v(q[2], nn, rect.u0 + rect.du, rect.v0 + rect.dv), g.v(q[3], nn, rect.u0, rect.v0 + rect.dv));
    }
    g.kind = kind; g.col = col;
  }
  return { rows, dirs, hs, ctr: pts, rad };
}
const ringAt = (hs: number[], h: number) => { let i = 0; while (i < hs.length - 2 && hs[i + 1] < h) i++; return i; };

/** a low faceted mound of earth round a trunk or root where it enters the ground */
export function soilCollar(g: Geo, c: V3, r: number, rr: Rand, lod = 0) {
  const sides = lod ? 7 : 10, S = rampNamed('soil'), jag = (i: number) => 0.86 + ((i * 7 + 3) % 5) * 0.06;
  const P: V3[][] = [ring(c, r * 2.2, -0.05, sides, jag, 0.1), ring(c, r * 1.7, r * 0.1 + 0.008, sides, jag, 0.3), ring(c, r * 1.12, r * 0.24 + 0.018, sides, jag, 0.5)];
  const kind = g.kind; g.kind = KIND.STEM; g.pivot = [0, 0, 0]; g.phase = rr.next(); g.col = linHex(S[3], SLOT_GAIN[BARK.FLESH] * 0.9);
  facetGrid(g, P, { u0: barkU(BARK.FLESH, 0), v0: 0, du: barkU(BARK.FLESH, 1) - barkU(BARK.FLESH, 0), dv: 0.35 }, vadd(c, [0, -r, 0]));
  g.kind = kind;
}

/** a bracket (shelf) fungus on a trunk: a faceted half-shelf with a thick growing edge, pored beneath */
export function shelfFungus(g: Geo, tex: FloraTex, p: V3, out: V3, w: number, rr: Rand) {
  const R = rampNamed(rr.pick(['ochre', 'bone', 'rust', 'clay', 'copper'] as const)), top = tex.cap(R, 0, R[1], 3), under = tex.gills(rampNamed('bone'));
  const side = vnrm(vcross(UP, out)), seg = 7, rim: V3[] = [], rimLo: V3[] = [];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI, d = vadd(vmul(side, Math.cos(a) * w), vmul(out, Math.sin(a) * w * 0.85 * (0.92 + (k % 2) * 0.1)));
    rim.push(vadd(vadd(p, d), [0, -w * 0.14 * Math.sin(a), 0])); rimLo.push(vadd(vadd(p, d), [0, -w * 0.3 * Math.sin(a) - w * 0.06, 0]));
  }
  const kind = g.kind; g.kind = KIND.SOLID; g.pivot = [0, 0, 0]; g.phase = rr.next(); g.col = [1.05, 1.05, 1.05];
  const uvT = (k: number, f: number): [number, number] => [top.u0 + top.du * (0.5 + 0.46 * f * Math.cos((k / seg) * Math.PI)), top.v0 + top.dv * (0.5 + 0.46 * f * Math.sin((k / seg) * Math.PI))];
  const c = g.v(vadd(p, [0, w * 0.08, 0]), UP, top.u0 + top.du * 0.5, top.v0 + top.dv * 0.5);
  const ts = rim.map((q, k) => { const [u, v] = uvT(k, 1); return g.v(q, vnrm(vadd(UP, vmul(vnrm(vsub(q, p)), 0.5))), u, v); });
  for (let k = 0; k < seg; k++) g.triN(c, ts[k + 1], ts[k]);
  g.col = linHex(R[2], 2.4);
  for (let k = 0; k < seg; k++) {
    const o0 = vnrm(vsub(rim[k], p)), o1 = vnrm(vsub(rim[k + 1], p)), [u0, v0] = uvT(k, 0.97), [u1, v1] = uvT(k + 1, 0.97);
    g.quadN(g.v(rim[k], o0, u0, v0), g.v(rim[k + 1], o1, u1, v1), g.v(rimLo[k + 1], o1, u1, v1), g.v(rimLo[k], o0, u0, v0));
  }
  g.col = [0.85, 0.85, 0.85];
  const cu = g.v(vadd(p, [0, -w * 0.12, 0]), [0, -1, 0], under.u0 + under.du * 0.5, under.v0 + under.dv * 0.5);
  const us = rimLo.map((q, k) => g.v(q, [0, -1, 0], under.u0 + under.du * (0.5 + 0.46 * Math.cos((k / seg) * Math.PI)), under.v0 + under.dv * (0.5 + 0.46 * Math.sin((k / seg) * Math.PI))));
  for (let k = 0; k < seg; k++) g.triN(cu, us[k], us[k + 1]);
  g.kind = kind;
}

/** an epiphyte perched on a trunk: a bromeliad-like rosette of strap leaves, sometimes a flower spike */
export function epiphyte(g: Geo, tex: FloraTex, p: V3, out: V3, size: number, rr: Rand) {
  const R = rampNamed(rr.pick(['sage', 'teal', 'olive', 'moss'] as const)), rect = tex.leaf('strap', R, { var: 1 });
  const kind = g.kind; g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.col = [1, 1, 1];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + rr.range(-0.2, 0.2), d = vnrm(vadd(vmul(out, 0.7), [Math.cos(a) * 0.75, 0.85, Math.sin(a) * 0.75]));
    g.phase = rr.next();
    leafCard(g, p, d, vnrm(vcross(d, vcross(UP, d))), size * rr.range(0.7, 1), size * 0.11, rect, 0.5, 0.35, null);
  }
  if (rr.chance(0.5)) {
    const A = rampNamed(rr.pick(['coral', 'plum', 'rust', 'ruby'] as const)), top = vadd(p, vadd([0, size * 0.85, 0], vmul(out, size * 0.1)));
    g.kind = KIND.STEM; g.col = linHex(R[3], SLOT_GAIN[BARK.STEM]);
    tube(g, [p, top], [0.006, 0.004], BARK.STEM, 3, false);
    g.kind = KIND.PETAL; g.pivot = top; g.col = [1, 1, 1];
    const pr = tex.leaf('strap', A, { petal: true });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + k * 0.4; leafCard(g, vadd(top, [0, -k * 0.014, 0]), vnrm([Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45]), vnrm([Math.cos(a), 0.2, Math.sin(a)]), size * 0.26, size * 0.07, pr, 0.4, 0, null); }
    g.pivot = [0, 0, 0];
  }
  g.kind = kind;
}

/** stilt (prop) roots: arching from the lower trunk down into the soil, each in its own little mound */
export function stiltRoots(g: Geo, T: TrunkRings, slot: number, col: C3, rr: Rand, n: number) {
  const foot = T.ctr[0], r0 = T.rad[0], kind = g.kind;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + rr.range(-0.25, 0.25), o: V3 = [Math.cos(a), 0, Math.sin(a)], h = rr.range(0.25, 0.55), reach = r0 * rr.range(2.2, 3.4) + 0.12;
    const p0 = vadd(vadd(foot, [0, h + 0.06, 0]), vmul(o, r0 * 0.85)), p1 = vadd(vadd(foot, [0, h * 0.75, 0]), vmul(o, reach * 0.55)), p2 = vadd(vadd(foot, [0, 0.02, 0]), vmul(o, reach));
    const rad = Math.max(0.014, r0 * rr.range(0.16, 0.24));
    g.kind = KIND.BARK; g.col = col; g.phase = rr.next(); g.pivot = [0, 0, 0];
    tube(g, [p0, p1, vadd(p2, [0, 0.03, 0]), vadd(p2, [0, -0.05, 0])], [rad * 1.1, rad, rad * 0.95, rad], slot === BARK.RING ? BARK.FIBRE : slot, 5, false);
    soilCollar(g, vadd(p2, [0, 0.01, 0]), rad * 1.3, rr, 1);
  }
  g.kind = kind;
}

/** the life on a big trunk (full mesh only): shelf fungi, an epiphyte or two, stilt roots on palms and weepers */
export function trunkLife(g: Geo, tex: FloraTex, sp: PlantSpecies, T: TrunkRings, st: TrunkStyle, col: C3, rr: Rand) {
  const n = T.rows.length, sides = T.rows[0].length - 1, top = T.hs[n - 1];
  if (st.slot !== BARK.RING && rr.chance(0.42)) {
    const s0 = rr.int(0, sides - 1);
    let h = rr.range(0.25, Math.max(0.3, Math.min(0.9, top * 0.35)));
    for (let k = rr.int(1, 3); k > 0; k--) { const i = ringAt(T.hs, h), s = (s0 + k) % sides, out = horiz(T.dirs[i][s]); shelfFungus(g, tex, vadd(T.rows[i][s], vmul(out, -0.012)), out, rr.range(0.05, 0.1), rr); h += rr.range(0.07, 0.12); }
  }
  if (sp.arch !== 'umbrella' && rr.chance(0.5)) for (let k = rr.int(1, 2); k > 0; k--) {
    const i = ringAt(T.hs, top * rr.range(0.55, 0.9)), s = rr.int(0, sides - 1);
    epiphyte(g, tex, T.rows[i][s], horiz(T.dirs[i][s]), rr.range(0.13, 0.22), rr);
  }
  if ((st.slot === BARK.RING || sp.arch === 'weeper') && rr.chance(0.75)) stiltRoots(g, T, st.slot, col, rr, rr.int(5, 8));
}

// ------------------------------------------------------------------------------------------------ mushrooms
export interface MushOpts { ramp: number[]; gill: number[]; stem: number[]; spots: number; spotCol: number; button: boolean; glow: boolean; ring: boolean; volva: boolean; ao?: number }
/** a mushroom: (optionally) a stem swelling at the foot, a ragged volva, a skirt-like ring; a cap with a thick rim
 *  curling under, raised warts, the gill chamber's roof and radial gill fins beneath. A button is a closed egg. */
export function mushroom(g: Geo, tex: FloraTex, base: V3, c: V3, r: number, hr: number, o: MushOpts, rr: Rand, lod: number, drawStem = true) {
  const seg = lod ? 8 : r > 0.06 ? 14 : 10, stemR = Math.max(0.005, r * (o.button ? 0.42 : 0.2)), ao = o.ao ?? 1, kind0 = g.kind, spk = tex.speckle();
  g.pivot = [0, 0, 0]; g.phase = rr.next();
  if (drawStem) {
    g.kind = KIND.STEM; g.col = linHex(o.stem[4] ?? o.stem[3], SLOT_GAIN[BARK.FIBRE] * ao);
    const top = vadd(c, [0, hr * 0.1, 0]);
    tube(g, [vadd(base, [0, -0.01, 0]), lerp3(base, top, 0.2), lerp3(base, top, 0.6), top], [stemR * 1.5, stemR * 1.15, stemR, stemR * 0.92], BARK.FIBRE, lod ? 4 : 6, false);
  }
  if (o.volva && !lod) {
    // the volva: a ragged cup of torn veil round the foot
    const jag = (i: number) => (i % 3 === 0 ? 1.25 : i % 3 === 1 ? 0.95 : 1.1);
    g.kind = KIND.SOLID; g.col = linHex(o.gill[3], 1.25 * ao);
    facetGrid(g, [ring(base, stemR * 1.55, -0.005, 8), ring(base, stemR * 2.0, stemR * 1.1, 8, jag, 0.2), ring(base, stemR * 2.25, stemR * 2.0, 8, jag, 0.4)], spk, vadd(base, [0, stemR, 0]));
  }
  if (o.ring && !o.button && !lod) {
    // the ring (annulus): a short skirt hanging from the upper stem, its edge torn
    const at = lerp3(base, c, 0.74), jag = (i: number) => (i % 2 ? 0.9 : 1.05);
    g.kind = KIND.SOLID; g.col = linHex(o.gill[4] ?? o.gill[3], 1.2 * ao);
    facetGrid(g, [ring(at, stemR * 1.05, 0, 9), ring(at, stemR * 2.0, -stemR * 0.7, 9, jag, 0.15), ring(at, stemR * 2.5, -stemR * 1.6, 9, jag, 0.3)], spk, vadd(at, [0, stemR * 2, 0]));
  }
  // the cap: a profile from the crown over a thick rim that curls under
  const top = tex.cap(o.ramp, Math.min(6, o.spots), o.spotCol, rr.int(0, 2)), gl = tex.gills(o.gill);
  const prof: [number, number][] = o.button
    ? [[0, 1.18], [0.5, 1.06], [0.84, 0.72], [1.0, 0.25], [0.9, -0.1], [0.5, -0.18]]
    : [[0, 1], [0.42, 0.93], [0.76, 0.66], [0.95, 0.3], [1.02, 0.04], [0.97, -0.13], [0.87, -0.1]];
  g.kind = o.glow ? KIND.GLOW : KIND.SOLID; g.pivot = c; g.col = [ao, ao, ao];
  const P = prof.map(([pr, py], j) => ring(c, pr * r, py * hr, seg, j > 2 ? (i) => 0.97 + ((i * 5 + j) % 3) * 0.025 : undefined));
  const ctrLow = vadd(c, [0, -hr * 0.35, 0]);
  sheet(g, P, top, { out: (p) => vsub(p, ctrLow), uv: (_j, _i, p) => [top.u0 + top.du * (0.5 + ((p[0] - c[0]) / r) * 0.47), top.v0 + top.dv * (0.5 + ((p[2] - c[2]) / r) * 0.47)] });
  // warts: raised flecks of the universal veil on spotted caps
  if (!lod && o.spots > 0) {
    g.col = linHex(o.spotCol, 1.3 * ao);
    for (let k = 0; k < Math.min(14, o.spots * 2 + 2); k++) {
      const t = rr.range(0.12, 0.78), a = rr.range(0, TAU), j = t * 3, j0 = Math.min(2, Math.floor(j)), f = j - j0;
      const pr = prof[j0][0] + (prof[j0 + 1][0] - prof[j0][0]) * f, py = prof[j0][1] + (prof[j0 + 1][1] - prof[j0][1]) * f;
      const q: V3 = [c[0] + Math.cos(a) * pr * r, c[1] + py * hr, c[2] + Math.sin(a) * pr * r], nn = vnrm(vsub(q, ctrLow)), w = r * rr.range(0.06, 0.1);
      const a1 = vperp(nn), a2 = vcross(nn, a1), tip = g.v(vadd(q, vmul(nn, w * 0.6)), nn, spk.u0 + spk.du * 0.3, spk.v0 + spk.dv * 0.2);
      const rim = [0, 1, 2, 3].map((m) => { const b = (m / 4) * TAU + a, d = vadd(vmul(a1, Math.cos(b)), vmul(a2, Math.sin(b))); return g.v(vadd(q, vmul(d, w)), vnrm(vadd(nn, vmul(d, 0.6))), spk.u0 + spk.du * 0.5, spk.v0 + spk.dv * 0.7); });
      for (let m = 0; m < 4; m++) g.triN(tip, rim[m], rim[(m + 1) % 4]);
    }
  }
  if (o.button) { g.kind = kind0; g.pivot = [0, 0, 0]; return; }
  // the gill chamber's roof, then radial gill fins hanging from it (they glow on luminous species)
  const y0 = -hr * 0.06, rin = r * 0.88;
  g.kind = o.glow ? KIND.GLOW : KIND.SOLID; g.col = [0.75 * ao, 0.75 * ao, 0.75 * ao]; g.pivot = [0, 0, 0];
  sheet(g, [ring(c, stemR, y0 + hr * 0.05, seg), ring(c, rin * 0.6, y0 + hr * 0.02, seg), ring(c, rin, y0, seg)], gl, { out: [0, -1, 0] });
  const fins = lod ? 0 : Math.round(14 + r * 170);
  g.col = linHex(o.gill[3], 1.6 * ao);
  for (let k = 0; k < fins; k++) {
    const a = (k / fins) * TAU, ca = Math.cos(a), sa = Math.sin(a), short = k % 2 === 1, ri = short ? r * 0.55 : stemR * 1.15, n: V3 = [-sa, 0, ca];
    const dep = hr * (short ? 0.11 : 0.17);
    g.quadN(g.v([c[0] + ca * rin, c[1] + y0, c[2] + sa * rin], n, gl.u0, gl.v0), g.v([c[0] + ca * ri, c[1] + y0 + hr * 0.04, c[2] + sa * ri], n, gl.u0 + gl.du * 0.5, gl.v0),
      g.v([c[0] + ca * ri, c[1] + y0 - dep, c[2] + sa * ri], n, gl.u0 + gl.du * 0.5, gl.v0 + gl.dv * 0.5), g.v([c[0] + ca * rin * 0.96, c[1] + y0 - hr * 0.06, c[2] + sa * rin * 0.96], n, gl.u0, gl.v0 + gl.dv * 0.5));
  }
  g.kind = kind0;
}

// ------------------------------------------------------------------------------------------------ flowers
export interface FlowerOpts { n: number; len: number; wid: number; rect: Rect; tinted?: boolean; cup: number; layers: number; sepals?: Rect; stamens?: number; anther?: number[]; pistil?: number[]; bud?: number; receptacle?: number[]; fruit?: number[]; reflex?: number }
/** a modelled flower: curved, cupped petals in overlapping whorls on a receptacle, sepals below, stamens with anthers
 *  and a three-lobed pistil inside. bud > 0 closes it toward a bud; fruit replaces it with a swelling seed capsule
 *  under dry sepals. Petals open by day (PETAL / TINT kind, pivot at the heart). */
export function flower(g: Geo, tex: FloraTex, c: V3, axis: V3, o: FlowerOpts, rr: Rand, lod: number) {
  axis = vnrm(axis);
  const a1 = vperp(axis), a2 = vcross(axis, a1), bud = o.bud ?? 0, kind0 = g.kind, spk = tex.speckle();
  g.pivot = [0, 0, 0];
  if (o.fruit) {
    // gone to seed: a faceted capsule with a crown of dry sepal tips
    g.kind = KIND.SOLID; g.col = linHex(o.fruit[4] ?? o.fruit[3], 1.35);
    const cc = vadd(c, vmul(axis, o.len * 0.25));
    sphere(g, cc, o.len * 0.3, spk, lod ? 5 : 7, lod ? 2 : 3, 1.25);
    if (o.sepals && !lod) { g.kind = KIND.LEAF; g.col = [0.7, 0.62, 0.5]; for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU, d = vnrm(vadd(vadd(vmul(a1, Math.cos(a)), vmul(a2, Math.sin(a))), vmul(axis, 0.6))); leafCard(g, vadd(cc, vmul(axis, o.len * 0.22)), d, axis, o.len * 0.3, o.wid * 0.3, o.sepals, 0.2, 0.05, null); } }
    g.kind = kind0; return;
  }
  if (o.receptacle) { g.kind = KIND.SOLID; g.col = linHex(o.receptacle[3], 1.3); sphere(g, vadd(c, vmul(axis, -o.len * 0.04)), Math.max(0.004, o.len * 0.11), spk, lod ? 5 : 6, 2, 0.95); }
  if (o.sepals && !lod) {
    g.kind = KIND.LEAF; g.col = [0.9, 0.9, 0.9];
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.3, d = vnrm(vadd(vadd(vmul(a1, Math.cos(a)), vmul(a2, Math.sin(a))), vmul(axis, -0.3 + bud * 1.5))); g.phase = rr.next(); leafCard(g, vadd(c, vmul(axis, -o.len * 0.05)), d, vnrm(vadd(axis, vmul(d, -0.3))), o.len * (0.4 + bud * 0.25), o.wid * 0.45, o.sepals, 0.3, 0.04, null); }
  }
  g.kind = o.tinted ? KIND.TINT : KIND.PETAL; g.pivot = c; g.col = [1, 1, 1];
  const segs = lod ? 2 : 3;
  for (let L = 0; L < o.layers; L++) {
    const scale = (1 - L * 0.2) * (1 - bud * 0.45), lift = o.cup + L * 0.28 + bud * 1.3;
    for (let k = 0; k < o.n; k++) {
      const a = ((k + L * 0.5) / o.n) * TAU + rr.range(-0.09, 0.09), radial = vadd(vmul(a1, Math.cos(a)), vmul(a2, Math.sin(a)));
      // the petal's spine: rising at the base (the cup), relaxing or reflexing toward the tip
      const len = o.len * scale * rr.range(0.9, 1.06), pts: V3[] = [];
      const el0 = Math.min(1.5, lift), el1 = Math.min(1.5, lift * 0.45 - 0.15 - (o.reflex ?? 0) + bud * 1.2);
      let q = vadd(c, vmul(radial, o.len * 0.07));
      pts.push(q);
      for (let s = 1; s <= segs; s++) { const el = el0 + (el1 - el0) * (s / segs), d = vnrm(vadd(vmul(radial, Math.cos(el)), vmul(axis, Math.sin(el)))); q = vadd(q, vmul(d, len / segs)); pts.push(q); }
      g.phase = rr.next();
      ribbonStrip(g, pts, pts.map((_, i) => o.wid * scale * (i === 0 ? 0.4 : i === segs ? 0.85 : 1)), o.rect, { crease: 0.3, flutLen: true, side: vcross(axis, radial), flat: lod > 0 });
    }
  }
  if (!lod && bud < 0.5 && (o.stamens ?? 0) > 0) {
    const A = o.anther ?? rampNamed('ochre'), ns = o.stamens ?? 0;
    for (let k = 0; k < ns; k++) {
      const a = (k / ns) * TAU + rr.range(-0.2, 0.2), radial = vadd(vmul(a1, Math.cos(a)), vmul(a2, Math.sin(a)));
      const tip = vadd(c, vadd(vmul(axis, o.len * rr.range(0.3, 0.42)), vmul(radial, o.len * 0.15)));
      g.kind = KIND.STEM; g.pivot = c; g.col = linHex(A[4] ?? A[3], SLOT_GAIN[BARK.STEM] * 0.9);
      tube(g, [c, tip], [0.0016, 0.0012], BARK.STEM, 3, false);
      g.kind = KIND.SOLID; g.col = linHex(A[5] ?? A[4], 1.35);
      sphere(g, tip, Math.max(0.0028, o.len * 0.035), spk, 4, 2, 1.4);
    }
    if (o.pistil) {
      const tip = vadd(c, vmul(axis, o.len * 0.48));
      g.kind = KIND.STEM; g.col = linHex(o.pistil[4] ?? o.pistil[3], SLOT_GAIN[BARK.STEM] * 0.9);
      tube(g, [c, tip], [0.003, 0.002], BARK.STEM, 4, false);
      g.col = linHex(o.pistil[5] ?? o.pistil[4], SLOT_GAIN[BARK.STEM]);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU, d = vadd(vmul(a1, Math.cos(a)), vmul(a2, Math.sin(a))); tube(g, [tip, vadd(tip, vadd(vmul(d, o.len * 0.07), vmul(axis, o.len * 0.02)))], [0.0022, 0.0013], BARK.STEM, 3, false); }
    }
  }
  g.kind = kind0; g.pivot = [0, 0, 0];
}

/** a flowering herb: a rosette of veined leaves, leafy stems with leaves on petioles at the nodes, and modelled
 *  flowers at every stage (tight buds, half-open, open, gone to seed) */
export function meshBloom(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), sty = new Rand(sp.id * 313 + 7), g = new Geo(h);
  const G = rampFor(sp.leaf), A = rampFor(sp.accent);
  const shape = sty.pick<Shape>(['petal', 'petal', 'round', 'heart']), lshape = sty.pick<Shape>(['lance', 'ovate', 'heart']);
  const n = sty.pick([5, 5, 6, 8, 12]), layers = n >= 8 ? 1 : sty.int(1, 2), cup = sty.range(0.15, 0.85), reflex = sty.chance(0.3) ? sty.range(0.2, 0.5) : 0;
  const pet = tex.leaf(shape, A, { petal: true, var: sty.int(0, 2) }), sep = tex.leaf('lance', G, { var: 1 }), leafR = tex.leaf(lshape, G, { lat: true, var: r.int(0, 2) });
  const anther = rampNamed(sty.pick(['ochre', 'straw', 'gold'] as const)), pistil = rampNamed(sty.pick(['straw', 'sage', 'coral'] as const));
  const flen = h * sty.range(0.085, 0.12) * (n >= 8 ? 0.85 : 1), fwid = flen * (n >= 8 ? 0.22 : 0.42);
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0];
  for (let k = lod ? 4 : 7; k > 0; k--) { const a = r.range(0, TAU), d = vnrm([Math.cos(a), r.range(0.35, 0.7), Math.sin(a)]); g.phase = r.next(); g.col = [0.9, 0.9, 0.9]; leafCard(g, [0, 0.01, 0], d, vnrm(vcross(d, vcross(UP, d))), h * r.range(0.2, 0.3), h * 0.06, leafR, 0.45, 0.3, null); }
  const ns = r.int(2, lod ? 3 : 5);
  for (let k = 0; k < ns; k++) {
    const a = (k / ns) * TAU + r.range(-0.4, 0.4), lean = r.range(0.08, 0.3), L = h * (k === 0 ? 0.95 : r.range(0.6, 0.9)), pts: V3[] = [];
    for (let s = 0; s <= 4; s++) { const t = s / 4; pts.push([Math.cos(a) * (lean * L * t * t + 0.01), L * t, Math.sin(a) * (lean * L * t * t + 0.01)]); }
    g.kind = KIND.STEM; g.col = linHex(G[3], SLOT_GAIN[BARK.STEM]); g.phase = r.next(); g.pivot = [0, 0, 0];
    tube(g, pts, [0.0065, 0.006, 0.005, 0.0045, 0.004], BARK.STEM, lod ? 3 : 4, false);
    // leaves at the nodes, each on a short petiole, alternating
    if (!lod) for (let m = 1; m <= 2; m++) {
      const node = pts[m], side = (m & 1 ? 1 : -1) * 1.6 + a, d = vnrm([Math.cos(side), 0.45, Math.sin(side)]), pe = vadd(node, vmul(d, 0.025));
      g.kind = KIND.STEM; g.col = linHex(G[3], SLOT_GAIN[BARK.STEM]); tube(g, [node, pe], [0.0028, 0.0022], BARK.STEM, 3, false);
      g.kind = KIND.LEAF; g.col = [0.95, 0.95, 0.95]; leafCard(g, pe, d, vnrm(vcross(d, vcross(UP, d))), h * 0.15 * (1.2 - m * 0.2), h * 0.04, leafR, 0.4, 0.2, null);
    }
    const tip = pts[4], ax = vnrm(vadd(vsub(pts[4], pts[3]), [0, 0.6, 0]));
    // the stage: the main stem flowers; the others are buds, opening, open or gone to seed
    const stage = k === 0 ? 0 : r.pick([0, 0, 0.35, 0.8, 1, 2]);
    flower(g, tex, tip, ax, { n, len: flen, wid: fwid, rect: pet, cup, layers, reflex, sepals: sep, stamens: n >= 8 ? 14 : 9, anther, pistil, receptacle: G, bud: stage >= 2 ? 0 : stage, fruit: stage >= 2 ? G : undefined }, r, lod);
  }
  return { geo: g.build(h * 0.4), H: h, R: h * 0.4, tris: g.tris };
}

// ------------------------------------------------------------------------------------------------ carnivorous
/** a snap trap: a rosette of winged petioles, each ending in a hinged pair of lobes (LOBE kind: they swing shut on the
 *  per-plant closure), red inside, rimmed with teeth that interlock when shut, three trigger hairs on each lobe */
export function meshSnaptrap(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(h);
  const G = rampFor(sp.leaf), A = rampNamed(sp.id % 3 ? 'ruby' : 'coral'), trap = tex.trap(G, A), pet = tex.leaf('strap', G, { var: 2 });
  const n = lod ? 4 : r.int(5, 7);
  let R = 0.1;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * TAU + r.range(-0.2, 0.2), el = r.range(0.3, 0.6), L = h * r.range(0.75, 1.0) * (k === 0 ? 1 : r.range(0.8, 1));
    const dir: V3 = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)], hinge0 = vmul(dir, L * 0.45), axis = horiz(dir);
    g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.phase = r.next(); g.col = [0.95, 0.95, 0.95];
    ribbonStrip(g, [[0, 0.01, 0], vmul(dir, L * 0.25), hinge0], [0.006, h * 0.05, h * 0.03], pet, { flat: true });
    const tl = L * 0.55, tw = L * 0.25, phase = ((Math.atan2(axis[2], axis[0]) / TAU) % 1 + 1) % 1;
    for (const sg of [1, -1]) {
      const lobeN = rot(UP, axis, sg * 1.0), inward = rot(lobeN, axis, -sg * Math.PI / 2), side = -sg;
      const U = lod ? 4 : 7, Wn = lod ? 2 : 3, grid: V3[][] = [];
      for (let j = 0; j <= Wn; j++) {
        const row: V3[] = [];
        for (let i = 0; i <= U; i++) {
          const u = i / U, w = j / Wn, prof = Math.pow(Math.sin(Math.PI * (0.04 + u * 0.92)), 0.7);
          row.push(vadd(vadd(vadd(hinge0, vmul(axis, tl * u)), vmul(lobeN, tw * w * prof)), vmul(inward, tw * 0.28 * w * w * prof)));
        }
        grid.push(row);
      }
      g.kind = KIND.LOBE; g.pivot = hinge0; g.phase = phase;
      // the outer (green) and inner (red, glandular) faces, a hair apart; uv: the hinge on the rect's centre line
      for (const inner of [false, true]) {
        g.col = inner ? [1, 1, 1] : [0.92, 0.92, 0.92];
        const P = grid.map((row) => row.map((p) => vadd(p, vmul(inward, inner ? 0.0012 : -0.0012))));
        sheet(g, P, trap, { out: inner ? inward : vmul(inward, -1), flut: () => side, uv: (j, i) => [trap.u0 + trap.du * (inner ? 0.5 + (j / Wn) * 0.49 : 0.5 - (j / Wn) * 0.49), trap.v0 + trap.dv * (i / U)] });
      }
      // teeth along the free rim (offset half a tooth between the lobes, so they interlock), trigger hairs inside
      g.col = linHex(G[4] ?? G[3], 1.25);
      const teeth = lod ? 6 : 13, rim = grid[Wn], tu = trap.u0 + trap.du * 0.03, tv = trap.v0 + trap.dv * 0.5;
      for (let m = 0; m < teeth; m++) {
        const u = (m + (sg > 0 ? 0.25 : 0.75)) / teeth, x = u * U, i0 = Math.min(U - 1, Math.floor(x)), at = lerp3(rim[i0], rim[i0 + 1], x - i0);
        const prof = Math.pow(Math.sin(Math.PI * (0.04 + u * 0.92)), 0.7), len = tw * 0.45 * (0.5 + prof * 0.5), sd = vmul(axis, tl * 0.018);
        const tip = vadd(at, vadd(vmul(lobeN, len), vmul(inward, len * 0.12))), nn = vnrm(vcross(axis, lobeN));
        g.tri(g.v(vsub(at, sd), nn, tu, tv, side), g.v(vadd(at, sd), nn, tu, tv, side), g.v(tip, nn, tu, tv, side));
      }
      if (!lod) for (let m = 0; m < 3; m++) {
        const at = vadd(vadd(vadd(hinge0, vmul(axis, tl * (0.3 + m * 0.2))), vmul(lobeN, tw * 0.38)), vmul(inward, tw * 0.05)), up2 = vmul(inward, tw * 0.22), hu = trap.u0 + trap.du * 0.7;
        g.tri(g.v(at, lobeN, hu, tv, side), g.v(vadd(at, vmul(axis, 0.0025)), lobeN, hu, tv, side), g.v(vadd(at, up2), lobeN, hu, tv, side));
      }
    }
    R = Math.max(R, L);
  }
  return { geo: g.build(R), H: h, R, tris: g.tris };
}

/** a pitcher plant: strap leaves at the foot and pitchers (squat ground pitchers on tendrils, or tall trumpets) with a
 *  ribbed lip, a hood over the mouth and a pool of digestive liquid inside */
export function meshPitcher(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(h), trumpet = sp.id % 2 === 0;
  const G = rampFor(sp.leaf), A = rampNamed((['ruby', 'plum', 'coral'] as const)[sp.id % 3]), skin = tex.pitcher(G, A), hood = tex.leaf('heart', A, { lat: true, var: 1 }), strap = tex.leaf('strap', G, { var: 0 });
  const W = rampNamed('water');
  let R = 0.15;
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0];
  for (let k = 0; k < (lod ? 4 : 7); k++) { const a = (k / 7) * TAU + r.range(-0.3, 0.3), d = vnrm([Math.cos(a), r.range(0.25, 0.6), Math.sin(a)]); g.phase = r.next(); g.col = [0.95, 0.95, 0.95]; leafCard(g, [0, 0.01, 0], d, vnrm(vcross(d, vcross(UP, d))), h * r.range(0.3, 0.45), h * 0.06, strap, 0.4, 0.25, null); }
  const np = lod ? 2 : r.int(3, 5);
  for (let k = 0; k < np; k++) {
    const a = (k / np) * TAU + r.range(-0.4, 0.4), dist = trumpet ? h * r.range(0.02, 0.12) : h * r.range(0.25, 0.45);
    const ph = trumpet ? h * r.range(0.7, 1.0) * (k === 0 ? 1.05 : 1) : h * r.range(0.4, 0.65), pr = trumpet ? ph * 0.1 : ph * 0.26;
    const c: V3 = [Math.cos(a) * dist, 0, Math.sin(a) * dist];
    R = Math.max(R, dist + pr * 1.5);
    if (!trumpet) { g.kind = KIND.STEM; g.col = linHex(G[3], SLOT_GAIN[BARK.STEM]); g.pivot = [0, 0, 0]; tube(g, [[0, 0.02, 0], [c[0] * 0.5, 0.07, c[2] * 0.5], [c[0], 0.04, c[2]]], [0.004, 0.0035, 0.004], BARK.STEM, 3, false); }
    const sides = lod ? 7 : 11;
    // the outer wall up over the rolled, ribbed lip, then down the inner wall to the pool
    const outer: [number, number][] = trumpet ? [[0.3, 0], [0.45, 0.25], [0.65, 0.6], [0.88, 0.86], [1.05, 0.97], [1.12, 1.0], [0.92, 1.01]] : [[0.25, 0], [0.8, 0.14], [1.0, 0.4], [0.82, 0.68], [0.6, 0.84], [0.88, 0.95], [0.95, 0.99], [0.74, 1.0]];
    const inner: [number, number][] = trumpet ? [[0.92, 1.01], [0.8, 0.94], [0.62, 0.72]] : [[0.74, 1.0], [0.6, 0.92], [0.55, 0.7]];
    const ribbed = (i: number) => (i % 2 ? 1.06 : 0.96);
    g.kind = KIND.SOLID; g.col = [1, 1, 1]; g.phase = r.next(); g.pivot = [0, 0, 0];
    sheet(g, outer.map(([q, y], j) => ring(c, q * pr, y * ph, sides, j >= outer.length - 3 ? ribbed : undefined)), skin, { out: (p) => [p[0] - c[0], (p[1] - c[1] - ph * 0.45) * 0.3, p[2] - c[2]] });
    g.col = linHex(A[1], 1.7);
    sheet(g, inner.map(([q, y], j) => ring(c, q * pr, y * ph, sides, j === 0 ? ribbed : undefined)), skin, { out: (p) => [c[0] - p[0], 0.4 * pr, c[2] - p[2]] });
    // the pool
    g.kind = KIND.LIQUID; g.col = linHex(W[4], 1.5);
    const py = inner[2][1] * ph - 0.004, pl = ring(c, inner[2][0] * pr, py, sides), cc = g.v(vadd(c, [0, py, 0]), UP, skin.u0 + skin.du * 0.5, skin.v0 + skin.dv * 0.5);
    const rimI = pl.map((p, i) => g.v(p, UP, skin.u0 + skin.du * (i / sides), skin.v0));
    for (let i = 0; i < sides; i++) g.triN(cc, rimI[i], rimI[i + 1]);
    // the hood, leaning over the mouth from the back of the lip
    g.kind = KIND.LEAF; g.col = [1, 1, 1];
    const back = vnrm([-Math.cos(a + 0.6), 0, -Math.sin(a + 0.6)]), hp = vadd(c, [back[0] * pr * 0.85, ph * 1.0, back[2] * pr * 0.85]);
    const hd = vnrm([-back[0], trumpet ? 1.1 : 0.7, -back[2]]);
    leafCard(g, hp, hd, vnrm(vcross(hd, vcross(UP, hd))), pr * (trumpet ? 2.6 : 1.5), pr * (trumpet ? 1.15 : 0.75), hood, 0.6, trumpet ? 0.6 : 0.45, null);
  }
  return { geo: g.build(R), H: h, R, tris: g.tris };
}

/** a sundew: spoon leaves pressed to the ground, bristling with tentacles tipped by glistening drops of glue that glow
 *  faintly at night and curl in over prey (TENTACLE / DEW kinds) */
export function meshSundew(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(Math.max(0.12, h));
  const G = rampFor(sp.leaf), A = rampNamed((['ruby', 'coral', 'rust'] as const)[sp.id % 3]), blade = tex.leaf('round', A, { var: 0 }), pet = tex.leaf('strap', G, { var: 1 }), spk = tex.speckle();
  const dew = linHex(rampNamed('glowAmber')[4], 0.8), stalk = linHex(A[4] ?? A[3], 1.35);
  const n = r.int(6, 9);
  let R = 0.1;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * TAU + r.range(-0.15, 0.15), L = h * r.range(0.9, 1.3), dn = vnrm([Math.cos(az), 0.16, Math.sin(az)]), side = vnrm(vcross(UP, dn));
    R = Math.max(R, L);
    g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.phase = r.next(); g.col = [0.95, 0.95, 0.95];
    ribbonStrip(g, [[0, 0.004, 0], vmul(dn, L * 0.5)], [0.003, 0.0045], pet, { flat: true });
    const bc = vmul(dn, L * 0.5), bl = L * 0.5, bw = L * 0.19, mid = vadd(bc, vmul(dn, bl * 0.5));
    leafCard(g, bc, dn, UP, bl, bw, blade, 0.15, 0.0, null);
    const nt = lod ? 7 : 24;
    for (let t = 0; t < nt; t++) {
      const u = 0.08 + 0.88 * ((t * 0.618) % 1), s = (((t * 0.382 + 0.5) % 1) * 2 - 1) * Math.sin(Math.PI * Math.min(1, u * 1.05));
      const at = vadd(vadd(bc, vmul(dn, bl * u)), vmul(side, bw * s * 0.78));
      const lean = vnrm(vadd(vadd(UP, vmul(dn, (u - 0.4) * 0.9)), vmul(side, s * 0.7))), len = h * (0.11 + Math.abs(s) * 0.1 + u * 0.06), tip = vadd(at, vmul(lean, len));
      // curl axis: horizontal, square to the way toward the middle of the blade
      const toMid = horiz(vsub(mid, at)), ax = vnrm(vcross(UP, vlen(vsub(mid, at)) > 0.004 ? toMid : dn)), ph = ((Math.atan2(ax[2], ax[0]) / TAU) % 1 + 1) % 1;
      g.kind = KIND.TENTACLE; g.pivot = at; g.phase = ph; g.col = stalk;
      if (lod) g.tri(g.v(at, UP, spk.u0, spk.v0, 0), g.v(vadd(at, vmul(side, 0.0025)), UP, spk.u0, spk.v0, 0), g.v(tip, UP, spk.u0, spk.v0, 1));
      else atube(g, [at, lerp3(at, tip, 0.5), tip], [0.0011, 0.0009, 0.0007], spk, 3, (i) => i * 0.5);
      g.kind = KIND.DEW; g.col = dew;
      const b1 = g.n;
      sphere(g, tip, lod ? 0.0032 : 0.0026, spk, 4, 2, 1);
      for (let q = b1; q < g.n; q++) g.setW(q, 2, 1);
    }
  }
  return { geo: g.build(R), H: g.H, R, tris: g.tris };
}

// ------------------------------------------------------------------------------------------------ alien
/** a membrane sail: curved scaly spines fanning from a bulbous root, translucent veined membranes stretched between
 *  them (MEMBRANE kind: they ripple in the wind and glow faintly at night) */
export function meshSail(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(h);
  const S = rampFor(sp.trunk), M = rampFor(sp.accent), mem = tex.membrane(M);
  g.kind = KIND.SOLID; g.pivot = [0, h * 0.06, 0]; g.col = linHex(S[4] ?? S[3], 1.4); g.phase = r.next();
  sphere(g, [0, h * 0.05, 0], h * 0.11, tex.speckle(), lod ? 5 : 8, lod ? 2 : 3, 0.75);
  const ns = r.int(4, 6), az0 = r.range(0, TAU), spines: V3[][] = [], fan = r.range(1.4, 2.2);
  for (let k = 0; k < ns; k++) {
    const f = k / (ns - 1) - 0.5, az = az0 + f * fan, L = h * r.range(0.85, 1.0) * (1 - Math.abs(f) * 0.45), pts: V3[] = [];
    for (let s = 0; s <= 6; s++) { const t = s / 6, el = 1.5 - t * (0.55 + Math.abs(f) * 0.9); pts.push([Math.cos(az) * Math.cos(el) * L * t * 0.95, h * 0.09 + Math.sin(el) * L * t, Math.sin(az) * Math.cos(el) * L * t * 0.95]); }
    spines.push(pts);
    g.kind = KIND.BARK; g.col = linHex(S[3], SLOT_GAIN[BARK.SCALE]); g.pivot = [0, 0, 0]; g.phase = r.next();
    tube(g, pts, pts.map((_, i) => Math.max(0.004, h * 0.026 * (1 - i / 7))), BARK.SCALE, lod ? 4 : 5, true);
  }
  g.kind = KIND.MEMBRANE; g.col = [1, 1, 1];
  for (let k = 0; k + 1 < spines.length; k++) {
    const a = spines[k], b = spines[k + 1], rows: V3[][] = [];
    for (let s = 1; s <= 6; s++) { const row: V3[] = []; for (let j = 0; j <= 4; j++) { const t = j / 4, sag = Math.sin(Math.PI * t) * h * 0.05 * (s / 6); row.push(vadd(lerp3(a[s], b[s], t), [0, -sag, 0])); } rows.push(row); }
    sheet(g, rows, mem, { out: horiz(lerp3(a[3], b[3], 0.5)), flut: (s, j) => Math.sin(Math.PI * (j / 4)) * ((s + 1) / 6) });
  }
  return { geo: g.build(h * 0.6), H: h, R: h * 0.6, tris: g.tris };
}

/** a lure stalk: a stalk spiralling up from a rosette of strap leaves to a glowing faceted bulb in a ruff of
 *  translucent membranes; it pulses at night */
export function meshLure(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(h);
  const G = rampFor(sp.leaf), M = rampFor(sp.accent), ruff = tex.leaf('lance', M, { petal: true, var: 1 }), strap = tex.leaf('strap', G, { var: 2 });
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0];
  for (let k = 0; k < (lod ? 4 : 6); k++) { const a = (k / 6) * TAU + r.range(-0.2, 0.2), d = vnrm([Math.cos(a), 0.35, Math.sin(a)]); g.phase = r.next(); g.col = [0.95, 0.95, 0.95]; leafCard(g, [0, 0.01, 0], d, vnrm(vcross(d, vcross(UP, d))), h * 0.3, h * 0.05, strap, 0.45, 0.5, null); }
  const pts: V3[] = [], turns = r.range(1.2, 2.2), rad0 = h * 0.06, N = lod ? 8 : 18;
  for (let s = 0; s <= N; s++) { const t = s / N, a = t * turns * TAU; pts.push([Math.cos(a) * rad0 * (1 - t * 0.7), t * h * 0.9, Math.sin(a) * rad0 * (1 - t * 0.7)]); }
  g.kind = KIND.STEM; g.col = linHex(G[3], SLOT_GAIN[BARK.STEM]); g.phase = r.next();
  tube(g, pts, pts.map((_, i) => 0.009 * (1 - i / (pts.length + 5))), BARK.STEM, lod ? 3 : 5, false);
  const top = pts[pts.length - 1];
  g.kind = KIND.MEMBRANE; g.pivot = top; g.col = [1, 1, 1];
  for (let k = 0; k < (lod ? 4 : 7); k++) { const a = (k / 7) * TAU + 0.3, d = vnrm([Math.cos(a), -0.2 + (k % 2) * 0.35, Math.sin(a)]); leafCard(g, vadd(top, [0, -0.008, 0]), d, vnrm([Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3]), h * 0.13, h * 0.045, ruff, 0.35, 0.25, null); }
  g.kind = KIND.GLOW; g.col = linHex(rampNamed('glowTeal')[3], 0.95);
  sphere(g, vadd(top, [0, h * 0.045, 0]), h * 0.048, tex.speckle(), lod ? 5 : 7, lod ? 3 : 4, 1.25);
  return { geo: g.build(h * 0.3), H: h, R: h * 0.3, tris: g.tris };
}

/** lily pads: slit pads, some species with an upturned rim, veined and a little tilted; flowers on stems rising from
 *  the water, one sometimes still a bud (the clump bobs and drifts aside when something wades through) */
export function meshLilyHero(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(0.3);
  const G = rampFor(sp.leaf), A = rampFor(sp.accent), rimmed = sp.id % 3 === 0;
  let R = 0.1;
  for (let i = r.int(3, 5); i > 0; i--) {
    const x = r.range(-0.35, 0.35) * h, z = r.range(-0.35, 0.35) * h, rad = r.range(0.2, 0.32) * h, pv = r.int(0, 2), rect = tex.pad(G, pv), slit = r.range(0, TAU), seg = lod ? 10 : 18;
    const notch = 0.25 + pv * 1.7, half = 0.3, y = 0.03 + r.range(0, 0.006);
    R = Math.max(R, Math.hypot(x, z) + rad);
    // uv: the painted pad's own notch lines up with the modelled slit
    const uvA = (a: number, k: number): [number, number] => { const b = a - slit + notch; return [rect.u0 + rect.du * (0.5 + Math.cos(b) * 0.47 * k), rect.v0 + rect.dv * (0.5 + Math.sin(b) * 0.47 * k)]; };
    g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.phase = r.next(); g.col = [1, 1, 1];
    const ctr = g.v([x, y + 0.004, z], UP, rect.u0 + rect.du * 0.5, rect.v0 + rect.dv * 0.5, 0), mid: number[] = [], edge: number[] = [];
    for (let k = 0; k <= seg; k++) {
      const a = slit + half + (k / seg) * (TAU - half * 2), ca = Math.cos(a), sa = Math.sin(a), lift = rimmed ? 0 : ((k * 7) % 3) * 0.002;
      const [mu, mv] = uvA(a, 0.55), [eu, ev] = uvA(a, 1);
      mid.push(g.v([x + ca * rad * 0.55, y + 0.002, z + sa * rad * 0.55], UP, mu, mv, 0.05));
      edge.push(g.v([x + ca * rad, y + lift, z + sa * rad], vnrm([ca * 0.1, 1, sa * 0.1]), eu, ev, 0.15));
    }
    for (let k = 0; k < seg; k++) { g.tri(ctr, mid[k + 1], mid[k]); g.quad(mid[k], mid[k + 1], edge[k + 1], edge[k]); }
    if (rimmed && !lod) {
      // the upturned rim: a band standing round the edge, its outer face a step darker
      g.col = linHex(G[2], 1.6);
      const b0 = g.n;
      for (let k = 0; k <= seg; k++) {
        const a = slit + half + (k / seg) * (TAU - half * 2), o: V3 = [Math.cos(a), 0, Math.sin(a)], [u, v] = uvA(a, 0.96);
        g.v([x + o[0] * rad, y, z + o[2] * rad], o, u, v, 0.1); g.v([x + o[0] * rad * 1.04, y + rad * 0.2, z + o[2] * rad * 1.04], o, u, v, 0.2);
      }
      for (let k = 0; k < seg; k++) { const a = b0 + k * 2; g.quad(a, a + 2, a + 3, a + 1); }
      g.col = [1, 1, 1];
    }
  }
  const nf = r.chance(0.7) ? r.int(1, 2) : 0, pr = tex.leaf('petal', A, { petal: true, var: r.int(0, 2) }), sep = tex.leaf('lance', G, { var: 1 });
  for (let k = 0; k < nf; k++) {
    const c: V3 = [r.range(-0.15, 0.15) * h, r.range(0.06, 0.16) * h + 0.04, r.range(-0.15, 0.15) * h];
    g.kind = KIND.STEM; g.col = linHex(G[3], SLOT_GAIN[BARK.STEM]); g.pivot = [0, 0, 0];
    tube(g, [[c[0] * 0.8, -0.04, c[2] * 0.8], c], [0.006, 0.005], BARK.STEM, 4, false);
    flower(g, tex, c, UP, { n: 9, len: h * 0.18, wid: h * 0.05, rect: pr, cup: 0.5, layers: 2, sepals: sep, stamens: 14, anther: rampNamed('gold'), pistil: rampNamed('straw'), bud: k === 1 ? 0.85 : 0, receptacle: G }, r, lod);
  }
  return { geo: g.build(R), H: 0.3, R, tris: g.tris };
}

/** the species modelled whole by this file (both LODs: full up close, lighter in the mid range) */
export const HERO: Record<string, (sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number) => PlantGeo> = {
  snaptrap: meshSnaptrap, pitcher: meshPitcher, sundew: meshSundew, sail: meshSail, lure: meshLure, bloom: meshBloom, lily: meshLilyHero,
};
