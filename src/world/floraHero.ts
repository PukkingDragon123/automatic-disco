// Hero models: the plant parts that are sculpted as designed 3D forms rather than grown as cards. Trunks flare into
// buttresses, twist, carry knots, burls, deep bark plates, hollows and branch collars, sit in a soil collar, and
// host shelf fungi and epiphytes. Mushrooms have thick rims, real gill fins, rings and volvas. Flowers are built of
// curved cupped petals over a receptacle, with sepals, stamens and a pistil; they open by day. Carnivorous plants:
// snap traps whose hinged lobes and interlocking teeth close on prey, pitchers with a ribbed lip, a hood and pooled
// liquid, sundews with curling glistening tentacles. Alien growth: membrane sails between spines, lure stalks that
// spiral up to a glowing bulb. Lily pads are slit pads, some with raised rims, with flowers rising from the water.
// Every surface uses a hand-drawn pixel texture from the master palette (floraTex) or a palette ramp colour.
import { Rand } from '../core/rand';
import { rampNamed, rampFor } from './pixelKit';
import { FloraTex, BARK, barkU, type Rect } from './floraTex';
import {
  Geo, KIND, tube, vadd, vsub, vmul, vdot, vcross, vlen, vnrm, vperp, linHex, ribbonStrip, leafCard, sphere, facetGrid, disc, SLOT_GAIN, type PlantGeo,
} from './floraMesh';
import type { V3 } from './plantStyle';
import type { PlantSpecies } from './plantArt';

const TAU = Math.PI * 2;
const UP: V3 = [0, 1, 0];
/** Rodrigues rotation of v about unit axis k by a */
const rot = (v: V3, k: V3, a: number): V3 => { const c = Math.cos(a), s = Math.sin(a); return vadd(vadd(vmul(v, c), vmul(vcross(k, v), s)), vmul(k, vdot(k, v) * (1 - c))); };

// ------------------------------------------------------------------------------------------------ trunks
export interface TrunkStyle { lobes: number; flare: number; twist: number; plates: number; knots: [number, number, number][]; hollow: number; slot: number }
/** a species' trunk character (stable per species) */
export function trunkStyle(sp: PlantSpecies, ring: boolean): TrunkStyle {
  const r = new Rand(sp.id * 7907 + 11);
  const slot = ring ? BARK.RING : r.pick([BARK.FURROW, BARK.PLATE, BARK.SMOOTH, BARK.FIBRE, BARK.SCALE]);
  const knots: [number, number, number][] = [];
  for (let k = r.int(1, 4); k > 0; k--) knots.push([r.range(0.3, 0.75), r.range(0, TAU), r.range(0.1, 0.22)]);
  return {
    lobes: ring ? 0 : r.int(3, 6), flare: ring ? 0.35 : r.range(0.45, 0.9), twist: slot === BARK.FIBRE ? r.range(0.5, 0.9) : r.range(0.08, 0.35),
    plates: slot === BARK.PLATE || slot === BARK.SCALE ? 0.06 : slot === BARK.FIBRE ? 0.05 : slot === BARK.FURROW ? 0.035 : 0.012,
    knots, hollow: !ring && r.chance(0.35) ? r.range(0.12, 0.3) : 0, slot,
  };
}

/** a sculpted trunk along a polyline: buttress lobes flaring at the foot, a twist in the grain, plates with depth,
 *  knots and burls, a hollow; the bark texture follows the twist */
export function sculptTrunk(g: Geo, pts: V3[], rad: number[], st: TrunkStyle, sides: number, lod: number, baseCol: [number, number, number]) {
  // a finer foot: split the first segment so the buttresses can flare
  if (pts.length > 1 && lod === 0) {
    const a = pts[0], b = pts[1], ra = rad[0], rb = rad[1];
    pts = [a, vadd(a, vmul(vsub(b, a), 0.18)), vadd(a, vmul(vsub(b, a), 0.45)), ...pts.slice(1)];
    rad = [ra, ra + (rb - ra) * 0.18, ra + (rb - ra) * 0.45, ...rad.slice(1)];
  }
  const n = pts.length, T: V3[] = [], Nn: V3[] = [];
  for (let i = 0; i < n; i++) T.push(vnrm(vsub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let N0: V3 = [1, 0, 0];
  for (let i = 0; i < n; i++) { const t = T[i]; N0 = vnrm(vsub(N0, vmul(t, vdot(N0, t)))); Nn.push(N0); }
  const circ = TAU * Math.max(0.01, rad[0]), vk = (31 / 64) / circ, h0 = pts[0][1];
  let acc = 0, prev = -1;
  const ring: V3[][] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += vlen(vsub(pts[i], pts[i - 1]));
    const t = T[i], nn = Nn[i], bb = vcross(t, nn), h = pts[i][1] - h0, base = g.n, row: V3[] = [];
    const flare = st.flare * Math.exp(-h / 0.32), tw = st.twist * acc;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU, at = a + tw, ca = Math.cos(at), sa = Math.sin(at);
      const lobe = st.lobes ? Math.pow(Math.max(0, Math.cos(st.lobes * a)), 3) : 0;
      let rr = rad[i] * (1 + flare * (0.2 + 1.5 * lobe));
      // bark plates: alternate rings of facets stand proud of the trunk (a hand-set checker, not noise)
      rr *= 1 + st.plates * (((s + (i >> 1)) & 1) ? 1 : -0.6);
      let dark = 1;
      for (const [kh, ka, ks] of st.knots) {
        const dh = (h / Math.max(0.5, pts[n - 1][1] - h0) - kh) / (ks * 0.6), da = Math.atan2(Math.sin(a - ka), Math.cos(a - ka)) / (ks * 4);
        const b = Math.exp(-dh * dh - da * da);
        rr += b * rad[i] * 0.35; if (b > 0.5) dark = 0.8;
      }
      if (st.hollow > 0 && h > 0.06 && h < st.hollow + 0.08) {
        const da = Math.atan2(Math.sin(a - 1.3), Math.cos(a - 1.3));
        if (Math.abs(da) < 0.55) { rr *= 0.5; dark = 0.35; }
      }
      const dir: V3 = [nn[0] * ca + bb[0] * sa, nn[1] * ca + bb[1] * sa, nn[2] * ca + bb[2] * sa];
      const p = vadd(pts[i], vmul(dir, rr));
      row.push(p);
      g.col = [baseCol[0] * dark, baseCol[1] * dark, baseCol[2] * dark];
      g.v(p, vnrm(vadd(dir, [0, flare * 0.6, 0])), barkU(st.slot, (s / sides + tw / TAU) % 1), acc * vk);
    }
    ring.push(row);
    if (prev >= 0) for (let s = 0; s < sides; s++) g.quad(prev + s, prev + s + 1, base + s + 1, base + s);
    prev = base;
  }
  g.col = baseCol;
  return ring;
}

/** a low faceted mound of earth round a trunk or root where it enters the ground */
export function soilCollar(g: Geo, c: V3, r: number, col: [number, number, number], rr: Rand) {
  const sides = 9, prof: [number, number][] = [[r * 2.3, -0.04], [r * 1.75, r * 0.12 + 0.01], [r * 1.12, r * 0.28 + 0.02]];
  const P: V3[][] = prof.map(([pr, py], j) => Array.from({ length: sides + 1 }, (_, i) => { const a = (i / sides) * TAU + j * 0.2, k = i === sides ? 1 : 0.85 + ((i * 7 + j * 3) % 5) * 0.06; return [c[0] + Math.cos(a) * pr * k, c[1] + py, c[2] + Math.sin(a) * pr * k] as V3; }));
  g.kind = KIND.STEM; g.col = col; g.pivot = [0, 0, 0]; g.phase = rr.next();
  facetGrid(g, P, { u0: barkU(BARK.FLESH, 0), v0: 0, du: barkU(BARK.FLESH, 1) - barkU(BARK.FLESH, 0), dv: 0.5 }, c);
}

/** a bracket (shelf) fungus on a trunk: a faceted half-shelf, thick at the edge, pored beneath */
export function shelfFungus(g: Geo, tex: FloraTex, p: V3, out: V3, w: number, rr: Rand) {
  const R = rampNamed(rr.pick(['ochre', 'bone', 'rust', 'clay'] as const)), top = tex.cap(R, 0, R[1], 3), under = tex.gills(rampNamed('bone'));
  const side = vnrm(vcross(UP, out)), seg = 6, rim: V3[] = [], rimLo: V3[] = [];
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI, d = vadd(vmul(side, Math.cos(a) * w), vmul(out, Math.sin(a) * w * 0.8 * (0.9 + (k % 2) * 0.12)));
    rim.push(vadd(vadd(p, d), [0, -w * 0.12 * Math.sin(a), 0])); rimLo.push(vadd(vadd(p, d), [0, -w * 0.3 * Math.sin(a) - w * 0.08, 0]));
  }
  g.kind = KIND.SOLID; g.pivot = [0, 0, 0]; g.phase = rr.next(); g.col = [1, 1, 1];
  const c = g.v(vadd(p, [0, w * 0.06, 0]), UP, top.u0 + top.du * 0.5, top.v0 + top.dv * 0.5);
  const ts = rim.map((q, k) => g.v(q, vnrm(vadd(UP, vmul(out, 0.4))), top.u0 + top.du * (0.5 + 0.45 * Math.cos((k / seg) * Math.PI)), top.v0 + top.dv * (0.5 + 0.45 * Math.sin((k / seg) * Math.PI))));
  for (let k = 0; k < seg; k++) g.tri(c, ts[k + 1], ts[k]);
  // the thick growing edge, then the pored underside
  g.col = linHex(R[2], 2.2);
  for (let k = 0; k < seg; k++) { const a = g.v(rim[k], out, top.u0, top.v0), b = g.v(rim[k + 1], out, top.u0 + top.du, top.v0), cc = g.v(rimLo[k + 1], out, top.u0 + top.du, top.v0 + top.dv * 0.2), d = g.v(rimLo[k], out, top.u0, top.v0 + top.dv * 0.2); g.quad(a, d, cc, b); }
  g.col = [0.9, 0.9, 0.9];
  const cu = g.v(vadd(p, [0, -w * 0.1, 0]), [0, -1, 0], under.u0 + under.du * 0.5, under.v0 + under.dv * 0.5);
  const us = rimLo.map((q, k) => g.v(q, [0, -1, 0], under.u0 + under.du * (0.5 + 0.45 * Math.cos((k / seg) * Math.PI)), under.v0 + under.dv * (0.5 + 0.45 * Math.sin((k / seg) * Math.PI))));
  for (let k = 0; k < seg; k++) g.tri(cu, us[k], us[k + 1]);
}

/** an epiphyte on a branch or trunk: a small bromeliad-like rosette of strap leaves, sometimes a flower spike */
export function epiphyte(g: Geo, tex: FloraTex, p: V3, out: V3, size: number, rr: Rand) {
  const R = rampNamed(rr.pick(['sage', 'teal', 'olive', 'moss'] as const)), rect = tex.leaf('strap', R, { var: 1 });
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.col = [1, 1, 1];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU + rr.range(-0.2, 0.2), d = vnrm(vadd(vadd(vmul(out, 0.6), [Math.cos(a) * 0.7, 0.9, Math.sin(a) * 0.7]), [0, 0, 0]));
    g.phase = rr.next();
    leafCard(g, p, d, vnrm(vcross(d, vcross(UP, d))), size * rr.range(0.7, 1), size * 0.12, rect, 0.4, 0.3, null);
  }
  if (rr.chance(0.4)) {
    const A = rampNamed(rr.pick(['coral', 'plum', 'rust'] as const)), top = vadd(p, [0, size * 0.9, 0]);
    g.kind = KIND.STEM; g.col = linHex(R[3], SLOT_GAIN[BARK.STEM]);
    tube(g, [p, top], [0.005, 0.004], BARK.STEM, 3, false);
    g.kind = KIND.PETAL; g.pivot = top; g.col = [1, 1, 1];
    const pr = tex.leaf('strap', A, { petal: true });
    for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU; leafCard(g, vadd(top, [0, -k * 0.012, 0]), vnrm([Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4]), vnrm([Math.cos(a), 0.2, Math.sin(a)]), size * 0.28, size * 0.07, pr, 0.4, 0, null); }
  }
}

// ------------------------------------------------------------------------------------------------ mushrooms
export interface MushOpts { ramp: number[]; gill: number[]; stem: number[]; spots: number; spotCol: number; button: boolean; glow: boolean; ring: boolean; volva: boolean }
/** a mushroom: stem from base to cap with a skirt-like ring and a cupped volva, a cap with a thick curled rim,
 *  radial gill fins beneath; a button is a closed egg on a stub */
export function mushroom(g: Geo, tex: FloraTex, base: V3, c: V3, r: number, hr: number, o: MushOpts, rr: Rand, lod: number) {
  const seg = lod ? 7 : r > 0.06 ? 12 : 9, stemR = Math.max(0.006, r * (o.button ? 0.45 : 0.2));
  // stem: slightly swollen at the foot
  g.kind = KIND.STEM; g.pivot = [0, 0, 0]; g.phase = rr.next(); g.col = linHex(o.stem[3], SLOT_GAIN[BARK.FIBRE]);
  const sp: V3[] = [base, vadd(base, vmul(vsub(c, base), 0.25)), vadd(base, vmul(vsub(c, base), 0.65)), c];
  tube(g, sp, [stemR * 1.5, stemR * 1.1, stemR, stemR * 0.95], BARK.FIBRE, lod ? 4 : 6, false);
  if (o.volva && lod === 0) {
    // the volva: a ragged cup of torn veil round the foot
    const cup: V3[][] = [0, 1].map((j) => Array.from({ length: 8 }, (_, i) => { const a = (i / 7) * TAU, k = j ? 1.9 + (i % 2) * 0.35 : 1.45; return [base[0] + Math.cos(a) * stemR * k, base[1] + j * stemR * 1.6, base[2] + Math.sin(a) * stemR * k] as V3; }));
    g.kind = KIND.SOLID; g.col = linHex(o.stem[4], 1.2);
    facetGrid(g, cup, tex.speckle(), base);
  }
  if (o.ring && !o.button && lod === 0) {
    // the ring (annulus): a short skirt hanging from the upper stem
    const at = vadd(base, vmul(vsub(c, base), 0.72));
    const sk: V3[][] = [0, 1].map((j) => Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * TAU; const k = j ? 2.6 : 1.05; return [at[0] + Math.cos(a) * stemR * k, at[1] - j * stemR * 1.4 - (j && i % 2 ? stemR * 0.4 : 0), at[2] + Math.sin(a) * stemR * k] as V3; }));
    g.kind = KIND.SOLID; g.col = linHex(o.stem[5] ?? o.stem[4], 1.2);
    facetGrid(g, sk, tex.speckle(), at);
  }
  // the cap: a lathe from the crown over a thick rim that curls under
  const top = tex.cap(o.ramp, Math.min(6, o.spots), o.spotCol), gl = tex.gills(o.gill);
  const prof: [number, number][] = o.button
    ? [[0, hr * 1.2], [0.55, hr * 1.05], [0.9, hr * 0.6], [1.0, hr * 0.15], [0.82, -hr * 0.1]]
    : [[0, hr], [0.42, hr * 0.92], [0.78, hr * 0.62], [0.97, hr * 0.24], [1.02, 0.02 * hr], [0.94, -hr * 0.12], [0.86, -hr * 0.08]];
  g.kind = o.glow ? KIND.GLOW : KIND.SOLID; g.pivot = c; g.col = [1, 1, 1];
  const P: V3[][] = prof.map(([pr, py]) => Array.from({ length: seg + 1 }, (_, i) => { const a = (i / seg) * TAU; return [c[0] + Math.cos(a) * pr * r, c[1] + py, c[2] + Math.sin(a) * pr * r] as V3; }));
  // planar uv from above for the top, so the drawn cap lands the right way up
  const base0 = g.n;
  for (let j = 0; j < P.length; j++) for (let i = 0; i <= seg; i++) {
    const q = P[j][i], dx = (q[0] - c[0]) / r, dz = (q[2] - c[2]) / r, ny = j === 0 ? 1 : Math.max(0.05, 1 - j / (P.length - 1)) * (j >= P.length - 2 ? -0.4 : 1);
    g.v(q, vnrm([dx, ny * 1.4, dz]), top.u0 + top.du * (0.5 + dx * 0.48), top.v0 + top.dv * (0.5 + dz * 0.48));
  }
  for (let j = 0; j < P.length - 1; j++) for (let i = 0; i < seg; i++) { const a = base0 + j * (seg + 1) + i, b = a + seg + 1; g.quad(a, a + 1, b + 1, b); }
  if (o.button) return;
  // the gill chamber's roof, then radial gill fins hanging from it
  const y0 = c[1] - hr * 0.06, rin = r * 0.86;
  g.kind = KIND.SOLID; g.col = [0.8, 0.8, 0.8]; g.pivot = [0, 0, 0];
  const roof: V3[][] = [Array.from({ length: seg + 1 }, (_, i) => { const a = (i / seg) * TAU; return [c[0] + Math.cos(a) * stemR, y0 + hr * 0.04, c[2] + Math.sin(a) * stemR] as V3; }), Array.from({ length: seg + 1 }, (_, i) => { const a = (i / seg) * TAU; return [c[0] + Math.cos(a) * rin, y0, c[2] + Math.sin(a) * rin] as V3; })];
  facetGrid(g, roof, gl, vadd(c, [0, hr * 2, 0]));
  const fins = lod ? 0 : Math.round(10 + r * 140);
  g.col = linHex(o.gill[3], 1.6);
  for (let k = 0; k < fins; k++) {
    const a = (k / fins) * TAU, ca = Math.cos(a), sa = Math.sin(a), short = k % 2 === 1, ri = short ? r * 0.55 : stemR * 1.2;
    const n: V3 = [-sa, 0, ca];
    const q = [g.v([c[0] + ca * rin, y0, c[2] + sa * rin], n, gl.u0, gl.v0), g.v([c[0] + ca * ri, y0 + hr * 0.03, c[2] + sa * ri], n, gl.u0 + gl.du * 0.5, gl.v0),
      g.v([c[0] + ca * ri, y0 - hr * 0.16, c[2] + sa * ri], n, gl.u0 + gl.du * 0.5, gl.v0 + gl.dv * 0.5), g.v([c[0] + ca * rin * 0.97, y0 - hr * 0.05, c[2] + sa * rin * 0.97], n, gl.u0, gl.v0 + gl.dv * 0.5)];
    g.quad(q[0], q[1], q[2], q[3]);
  }
}

// ------------------------------------------------------------------------------------------------ flowers
export interface FlowerOpts { n: number; len: number; wid: number; rect: Rect; tinted?: boolean; cup: number; layers: number; sepals?: Rect; stamens?: number; anther?: number[]; pistil?: number[]; bud?: number; receptacle?: number[] }
/** a modelled flower: curved, cupped petals in overlapping whorls on a receptacle, sepals below, stamens and a
 *  pistil inside; bud > 0 closes it toward a bud. Petals open by day (PETAL kind, pivot at the heart). */
export function flower(g: Geo, tex: FloraTex, c: V3, axis: V3, o: FlowerOpts, rr: Rand, lod: number) {
  axis = vnrm(axis);
  const a1 = vperp(axis), a2 = vcross(axis, a1), bud = o.bud ?? 0;
  const kind = o.tinted ? KIND.TINT : KIND.PETAL;
  // receptacle: a faceted swelling where the petals join the stem
  if (o.receptacle) { g.kind = KIND.SOLID; g.pivot = [0, 0, 0]; g.col = linHex(o.receptacle[3], 1.3); sphere(g, vadd(c, vmul(axis, -o.len * 0.06)), o.len * 0.12, tex.speckle(), lod ? 5 : 6, 2, 0.9); }
  if (o.sepals && lod === 0) {
    g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.col = [0.9, 0.9, 0.9];
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.3, d = vnrm(vadd(vadd(vmul(a1, Math.cos(a)), vmul(a2, Math.sin(a))), vmul(axis, -0.25 + bud * 0.9))); g.phase = rr.next(); leafCard(g, vadd(c, vmul(axis, -o.len * 0.05)), d, vnrm(vadd(axis, vmul(d, -0.3))), o.len * 0.45, o.wid * 0.45, o.sepals, 0.3, 0.05, null); }
  }
  g.kind = kind; g.pivot = c; g.col = [1, 1, 1];
  for (let L = 0; L < o.layers; L++) {
    const n = o.n, scale = 1 - L * 0.22, lift = o.cup + L * 0.25 + bud * 1.2;
    for (let k = 0; k < n; k++) {
      const a = ((k + L * 0.5) / n) * TAU + rr.range(-0.08, 0.08), radial = vadd(vmul(a1, Math.cos(a)), vmul(a2, Math.sin(a)));
      // the petal's spine curves: it rises at the base (cup) and relaxes toward the tip
      const len = o.len * scale * rr.range(0.9, 1.05), pts: V3[] = [];
      const el0 = Math.min(1.45, lift), el1 = Math.min(1.45, lift * 0.45 - 0.15 + bud * 1.1);
      let q = vadd(c, vmul(radial, o.len * 0.08));
      pts.push(q);
      for (let s = 1; s <= (lod ? 2 : 3); s++) { const t = s / (lod ? 2 : 3), el = el0 + (el1 - el0) * t; const d = vnrm(vadd(vmul(radial, Math.cos(el)), vmul(axis, Math.sin(el)))); q = vadd(q, vmul(d, len / (lod ? 2 : 3))); pts.push(q); }
      g.phase = rr.next();
      // cupped: the edges ride up, the base is narrow and thick (a crease)
      ribbonStrip(g, pts, pts.map((_, i) => o.wid * scale * (i === 0 ? 0.45 : 1)), o.rect, { crease: 0.32, flutLen: true, side: vcross(axis, radial), flat: lod > 0 });
    }
  }
  if (lod === 0 && (o.stamens ?? 0) > 0) {
    // stamens: fine filaments with anthers; a pistil with a three-lobed stigma
    const A = o.anther ?? rampNamed('ochre');
    for (let k = 0; k < (o.stamens ?? 0); k++) {
      const a = (k / (o.stamens ?? 1)) * TAU + rr.range(-0.2, 0.2), radial = vadd(vmul(a1, Math.cos(a)), vmul(a2, Math.sin(a)));
      const tip = vadd(c, vadd(vmul(axis, o.len * rr.range(0.32, 0.45)), vmul(radial, o.len * 0.14)));
      g.kind = KIND.STEM; g.pivot = c; g.col = linHex(A[4], SLOT_GAIN[BARK.STEM] * 0.9);
      tube(g, [c, tip], [0.0016, 0.0012], BARK.STEM, 3, false);
      g.kind = KIND.SOLID; g.col = linHex(A[5], 1.3);
      sphere(g, tip, Math.max(0.003, o.len * 0.035), tex.speckle(), 4, 2, 1.3);
    }
    if (o.pistil) {
      const tip = vadd(c, vmul(axis, o.len * 0.5));
      g.kind = KIND.STEM; g.col = linHex(o.pistil[4], SLOT_GAIN[BARK.STEM] * 0.9);
      tube(g, [c, tip], [0.003, 0.002], BARK.STEM, 4, false);
      g.kind = KIND.SOLID; g.col = linHex(o.pistil[5] ?? o.pistil[4], 1.3);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU, d = vadd(vmul(a1, Math.cos(a)), vmul(a2, Math.sin(a))); tube(g, [tip, vadd(tip, vadd(vmul(d, o.len * 0.06), vmul(axis, o.len * 0.02)))], [0.0022, 0.0012], BARK.STEM, 3, false); }
    }
  }
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0];
}

// ------------------------------------------------------------------------------------------------ carnivorous
/** a snap trap plant: a rosette of winged petioles each ending in a hinged pair of lobes rimmed with interlocking
 *  teeth and set with trigger hairs; the lobes (LOBE kind) shut on prey and slowly reopen */
export function meshSnaptrap(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(h);
  const G = rampFor(sp.leaf), A = rampFor(sp.accent);
  const outer = tex.leaf('lance', G, { lat: true, var: 1 }), inner = tex.leaf('round', A, { petal: true }), pet = tex.leaf('strap', G, { var: 2 });
  const n = lod ? r.int(4, 5) : r.int(5, 7);
  let R = 0.1;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * TAU + r.range(-0.2, 0.2), el = r.range(0.25, 0.6), L = h * r.range(0.6, 0.95), dir: V3 = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
    const hinge0 = vmul(dir, L * 0.45), axis = vnrm([dir[0], dir[1] * 0.5, dir[2]]);
    // the winged petiole
    g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.phase = r.next(); g.col = [0.95, 0.95, 0.95];
    ribbonStrip(g, [[0, 0.01, 0], vmul(dir, L * 0.22), hinge0], [0.006, h * 0.05, h * 0.03], pet, { flat: true });
    // the trap: two lobes on a hinge along `axis`, open at about 55 degrees, each cupped
    const tl = L * 0.55, tw = L * 0.24, up = vnrm(vsub(UP, vmul(axis, vdot(UP, axis)))), sideV = vnrm(vcross(axis, up));
    for (const sg of [-1, 1]) {
      const open = 0.95, lobeN = vnrm(rot(vmul(sideV, sg), axis, -sg * open));
      // which way closes: rotating the lobe edge toward the midline (up) about the hinge
      const probe = vmul(lobeN, 1), test = rot(probe, axis, 0.3), side = test[1] > probe[1] ? 1 : -1;
      g.phase = Math.atan2(axis[2], axis[0]) / TAU; if (g.phase < 0) g.phase += 1;
      g.pivot = hinge0;
      // lobe as a grid: along the hinge (u) and out from it (w), cupped
      const U = lod ? 4 : 6, Wn = lod ? 2 : 3, grid: V3[][] = [];
      for (let j = 0; j <= Wn; j++) {
        const row: V3[] = [];
        for (let i = 0; i <= U; i++) {
          const u = i / U, w = j / Wn, prof = Math.sin(Math.PI * Math.min(1, 0.06 + u * 0.92));
          const along = vmul(axis, tl * u), outw = vmul(lobeN, tw * w * prof), cupD = vmul(rot(lobeN, axis, sg * 1.2), tw * 0.22 * w * w * prof);
          row.push(vadd(vadd(vadd(hinge0, along), outw), cupD));
        }
        grid.push(row);
      }
      for (const [rect, off] of [[outer, -0.0015], [inner, 0.0015]] as [Rect, number][]) {
        g.kind = KIND.LOBE; g.col = rect === inner ? [1, 1, 1] : [0.92, 0.92, 0.92];
        const base = g.n, nrm = vmul(rot(lobeN, axis, sg * 1.57), off > 0 ? 1 : -1);
        for (let j = 0; j <= Wn; j++) for (let i = 0; i <= U; i++) g.v(vadd(grid[j][i], vmul(nrm, off * 2)), nrm, rect.u0 + rect.du * (0.5 + (j / Wn) * 0.5 * (rect === inner ? 1 : -1)), rect.v0 + rect.dv * (i / U), side);
        for (let j = 0; j < Wn; j++) for (let i = 0; i < U; i++) { const a = base + j * (U + 1) + i, b = a + U + 1; g.quad(a, a + 1, b + 1, b); }
      }
      // interlocking teeth along the free rim, and three trigger hairs inside
      g.col = linHex(G[4], 1.2);
      const teeth = lod ? 5 : 11, rim = grid[Wn];
      for (let k2 = 1; k2 < teeth; k2++) {
        const u = k2 / teeth, idx = u * U, i0 = Math.min(U - 1, Math.floor(idx)), f = idx - i0;
        const at = vadd(vmul(rim[i0], 1 - f), vmul(rim[i0 + 1], f)), out = vnrm(vsub(at, vadd(hinge0, vmul(axis, tl * u))));
        const tip = vadd(at, vadd(vmul(out, tw * 0.45), vmul(rot(lobeN, axis, sg * 1.57), tw * 0.08)));
        const sd = vmul(axis, tl * 0.02);
        const q = [g.v(vsub(at, sd), out, outer.u0, outer.v0, side), g.v(vadd(at, sd), out, outer.u0 + outer.du * 0.1, outer.v0, side), g.v(tip, out, outer.u0 + outer.du * 0.05, outer.v0 + outer.dv * 0.1, side)];
        g.tri(q[0], q[1], q[2]);
      }
      if (lod === 0) for (let k2 = 0; k2 < 3; k2++) {
        const at = vadd(vadd(hinge0, vmul(axis, tl * (0.3 + k2 * 0.2))), vmul(lobeN, tw * 0.35)), up2 = vmul(rot(lobeN, axis, sg * 1.57), tw * 0.18);
        const q = [g.v(at, lobeN, inner.u0, inner.v0, side), g.v(vadd(at, vmul(axis, 0.002)), lobeN, inner.u0, inner.v0, side), g.v(vadd(at, up2), lobeN, inner.u0, inner.v0, side)];
        g.tri(q[0], q[1], q[2]);
      }
    }
    R = Math.max(R, L);
  }
  g.pivot = [0, 0, 0];
  return { geo: g.build(R), H: h, R, tris: g.tris };
}

/** a pitcher plant: strap leaves at the foot, and pitchers with a ribbed lip, a hood leaning over the mouth and a
 *  pool of digestive liquid inside, hung on tendrils from the leaf tips */
export function meshPitcher(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(h);
  const G = rampFor(sp.leaf), A = rampFor(sp.accent), skin = tex.pitcher(G, A), hood = tex.leaf('heart', A, { lat: true, var: 1 }), strap = tex.leaf('strap', G, { var: 0 });
  const W = rampNamed('water');
  let R = 0.15;
  // basal leaves
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.col = [0.95, 0.95, 0.95];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + r.range(-0.3, 0.3), d = vnrm([Math.cos(a), r.range(0.3, 0.7), Math.sin(a)]); g.phase = r.next(); leafCard(g, [0, 0.01, 0], d, vnrm(vcross(d, vcross(UP, d))), h * r.range(0.35, 0.5), h * 0.07, strap, 0.4, 0.25, null); }
  const np = lod ? 2 : r.int(3, 4);
  for (let k = 0; k < np; k++) {
    const a = (k / np) * TAU + r.range(-0.4, 0.4), dist = h * r.range(0.25, 0.45), ph = h * r.range(0.45, 0.8) * (k === 0 ? 1.15 : 1), pr = ph * 0.22;
    const c: V3 = [Math.cos(a) * dist, 0.0, Math.sin(a) * dist];
    R = Math.max(R, dist + pr);
    // the tendril from the leaf rosette to the pitcher's foot
    g.kind = KIND.STEM; g.col = linHex(G[3], SLOT_GAIN[BARK.STEM]); g.pivot = [0, 0, 0];
    tube(g, [[0, 0.02, 0], [c[0] * 0.5, 0.06, c[2] * 0.5], [c[0], 0.03, c[2]]], [0.004, 0.0035, 0.004], BARK.STEM, 3, false);
    // the body: bulbous belly, a waist, a flared ribbed lip; then down the inner wall to the pool
    const sides = lod ? 7 : 10;
    const prof: [number, number][] = [[0.25, 0], [0.78, 0.14], [1.0, 0.38], [0.82, 0.68], [0.62, 0.84], [0.9, 0.95], [0.74, 0.985], [0.6, 0.9], [0.55, 0.62]];
    const P: V3[][] = prof.map(([q, y], j) => Array.from({ length: sides + 1 }, (_, i) => { const t = (i / sides) * TAU, rib = j === 5 ? 1 + 0.06 * Math.cos(t * 9) : 1; return [c[0] + Math.cos(t) * q * pr * rib, c[1] + y * ph, c[2] + Math.sin(t) * q * pr * rib] as V3; }));
    g.kind = KIND.SOLID; g.col = [1, 1, 1]; g.phase = r.next();
    facetGrid(g, P.slice(0, 7), skin, vadd(c, [0, ph * 0.45, 0]));
    g.col = linHex(A[1], 1.6);
    facetGrid(g, P.slice(6), skin, vadd(c, [0, ph * 1.4, 0]));
    // the pool
    g.kind = KIND.LIQUID; g.col = linHex(W[4], 1.4);
    disc(g, vadd(c, [0, ph * 0.66, 0]), UP, pr * 0.52, tex.speckle(), 7, 0);
    // the hood, leaning over the mouth from the back of the lip
    g.kind = KIND.LEAF; g.col = [1, 1, 1];
    const back = vnrm([-Math.cos(a), 0, -Math.sin(a)]), hp = vadd(c, [back[0] * pr * 0.7, ph * 0.99, back[2] * pr * 0.7]);
    const hd = vnrm([-back[0], 0.75, -back[2]]);
    leafCard(g, hp, hd, vnrm(vcross(hd, vcross(UP, hd))), pr * 1.5, pr * 0.75, hood, 0.55, 0.45, null);
  }
  return { geo: g.build(R), H: h, R, tris: g.tris };
}

/** a sundew: spoon leaves pressed to the ground, each bristling with tentacles tipped by glistening droplets that
 *  glow faintly at night and curl in on prey (TENTACLE kind) */
export function meshSundew(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(Math.max(0.12, h));
  const G = rampFor(sp.leaf), A = rampFor(sp.accent), blade = tex.leaf('round', A, { lat: false, var: 0 }), pet = tex.leaf('strap', G, { var: 1 }), spk = tex.speckle();
  const n = r.int(6, 8);
  let R = 0.1;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * TAU + r.range(-0.15, 0.15), L = h * r.range(0.9, 1.3), d: V3 = [Math.cos(az), 0.18, Math.sin(az)], dn = vnrm(d);
    R = Math.max(R, L);
    g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.phase = r.next(); g.col = [0.95, 0.95, 0.95];
    ribbonStrip(g, [[0, 0.004, 0], vmul(dn, L * 0.5)], [0.003, 0.004], pet, { flat: true });
    const bc = vmul(dn, L * 0.5), bl = L * 0.5, bw = L * 0.18;
    leafCard(g, bc, dn, UP, bl, bw, blade, 0.1, 0.0, null);
    // tentacles over the blade, longer toward the rim
    const nt = lod ? 6 : 22, axisAz = Math.atan2(dn[0], -dn[2]) / TAU;
    for (let t = 0; t < nt; t++) {
      const u = r.range(0.1, 0.95), s = r.range(-0.85, 0.85) * Math.sin(Math.PI * u), side = vnrm(vcross(UP, dn));
      const at = vadd(vadd(bc, vmul(dn, bl * u)), vmul(side, bw * s * 0.8));
      const lean = vnrm(vadd(vadd(UP, vmul(dn, 0.5 + u * 0.4)), vmul(side, s * 0.6))), len = h * (0.14 + Math.abs(s) * 0.12 + u * 0.08), tip = vadd(at, vmul(lean, len));
      g.kind = KIND.TENTACLE; g.pivot = at; g.phase = (axisAz + 1) % 1; g.col = linHex(A[3], SLOT_GAIN[BARK.STEM]);
      if (lod) { const v0 = g.v(at, UP, blade.u0, blade.v0, 0), v1 = g.v(vadd(at, vmul(side, 0.002)), UP, blade.u0, blade.v0, 0), v2 = g.v(tip, UP, blade.u0, blade.v0, 1); g.tri(v0, v1, v2); }
      else {
        const b0 = g.n;
        tube(g, [at, tip], [0.0012, 0.0009], BARK.STEM, 3, false);
        for (let q = b0; q < g.n; q++) (g as any).setFlut(q, q < b0 + 4 ? 0 : 1);
      }
      // the droplet: a faceted bead of glue
      g.kind = KIND.GLOW; g.col = linHex(rampNamed('glowAmber')[3], 0.9); g.pivot = at;
      const b1 = g.n;
      sphere(g, tip, lod ? 0.003 : 0.0024, spk, 4, 2, 1);
      for (let q = b1; q < g.n; q++) (g as any).setKind(q, KIND.TENTACLE, 1);
    }
  }
  return { geo: g.build(R), H: g.H, R, tris: g.tris };
}

// ------------------------------------------------------------------------------------------------ alien
/** a membrane sail: curved spines fanning from a bulbous root with translucent veined membranes stretched between
 *  them (MEMBRANE kind: they ripple in the wind and glow faintly at night) */
export function meshSail(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(h);
  const S = rampFor(sp.trunk), M = rampFor(sp.accent), mem = tex.membrane(M);
  g.kind = KIND.SOLID; g.pivot = [0, h * 0.06, 0]; g.col = linHex(S[4], 1.4);
  sphere(g, [0, h * 0.06, 0], h * 0.1, tex.speckle(), lod ? 5 : 7, lod ? 2 : 3, 0.8);
  const ns = r.int(3, 5), az0 = r.range(0, TAU), spines: V3[][] = [];
  for (let k = 0; k < ns; k++) {
    const az = az0 + (k / (ns - 1) - 0.5) * 1.6, L = h * r.range(0.8, 1.0) * (1 - Math.abs(k / (ns - 1) - 0.5) * 0.4), pts: V3[] = [];
    for (let s = 0; s <= 5; s++) { const t = s / 5, el = 1.45 - t * (0.7 + Math.abs(k / (ns - 1) - 0.5) * 0.6); pts.push([Math.cos(az) * Math.cos(el) * L * t * 0.9, h * 0.1 + Math.sin(el) * L * t, Math.sin(az) * Math.cos(el) * L * t * 0.9]); }
    spines.push(pts);
    g.kind = KIND.BARK; g.col = linHex(S[3], SLOT_GAIN[BARK.SCALE]); g.pivot = [0, 0, 0]; g.phase = r.next();
    tube(g, pts, pts.map((_, i) => Math.max(0.004, h * 0.025 * (1 - i / 6))), BARK.SCALE, lod ? 4 : 5, true);
  }
  g.kind = KIND.MEMBRANE; g.col = [1, 1, 1];
  for (let k = 0; k + 1 < spines.length; k++) {
    const a = spines[k], b = spines[k + 1], rows: V3[][] = [];
    for (let s = 1; s <= 5; s++) { const row: V3[] = []; for (let j = 0; j <= 3; j++) { const t = j / 3, sag = Math.sin(Math.PI * t) * h * 0.04 * (s / 5); row.push(vadd(vadd(vmul(a[s], 1 - t), vmul(b[s], t)), [0, -sag, 0])); } rows.push(row); }
    const base = g.n;
    for (let s = 0; s < rows.length; s++) for (let j = 0; j <= 3; j++) {
      const p = rows[s][j], nn = vnrm(vcross(vsub(rows[s][Math.min(3, j + 1)], rows[s][Math.max(0, j - 1)]), [0, 1, 0]));
      g.v(p, vlen(nn) > 0.1 ? nn : [0, 0, 1], mem.u0 + mem.du * (j / 3), mem.v0 + mem.dv * (s / (rows.length - 1)), Math.sin(Math.PI * (j / 3)) * (s / 5));
    }
    for (let s = 0; s < rows.length - 1; s++) for (let j = 0; j < 3; j++) { const q = base + s * 4 + j; g.quad(q, q + 1, q + 5, q + 4); }
  }
  return { geo: g.build(h * 0.6), H: h, R: h * 0.6, tris: g.tris };
}

/** a lure stalk: a stalk spiralling up from coiled leaves to a glowing faceted bulb in a ruff of membranes */
export function meshLure(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(h);
  const G = rampFor(sp.leaf), A = rampFor(sp.accent), mem = tex.membrane(A), strap = tex.leaf('strap', G, { var: 2 });
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.col = [0.95, 0.95, 0.95];
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU, d = vnrm([Math.cos(a), 0.35, Math.sin(a)]); g.phase = r.next(); leafCard(g, [0, 0.01, 0], d, vnrm(vcross(d, vcross(UP, d))), h * 0.3, h * 0.05, strap, 0.4, 0.5, null); }
  const pts: V3[] = [], turns = r.range(1.2, 2.2), rad0 = h * 0.06;
  for (let s = 0; s <= (lod ? 8 : 16); s++) { const t = s / (lod ? 8 : 16), a = t * turns * TAU; pts.push([Math.cos(a) * rad0 * (1 - t * 0.6), t * h * 0.92, Math.sin(a) * rad0 * (1 - t * 0.6)]); }
  g.kind = KIND.STEM; g.col = linHex(G[3], SLOT_GAIN[BARK.STEM]); g.phase = r.next();
  tube(g, pts, pts.map((_, i) => 0.008 * (1 - i / (pts.length + 4))), BARK.STEM, lod ? 3 : 5, false);
  const top = pts[pts.length - 1];
  g.kind = KIND.MEMBRANE; g.pivot = top; g.col = [1, 1, 1];
  for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + 0.3, d = vnrm([Math.cos(a), -0.25, Math.sin(a)]); leafCard(g, vadd(top, [0, -0.01, 0]), d, vnrm([Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3]), h * 0.12, h * 0.045, mem, 0.3, 0.2, null); }
  g.kind = KIND.GLOW; g.col = linHex(rampNamed('glowTeal')[3], 0.9);
  sphere(g, vadd(top, [0, h * 0.04, 0]), h * 0.045, tex.speckle(), lod ? 5 : 7, lod ? 3 : 4, 1.25);
  return { geo: g.build(h * 0.3), H: h, R: h * 0.3, tris: g.tris };
}

/** lily pads: slit pads, some with an upturned rim, veined and tilted a little; flowers on stems rising from the
 *  water (they part and bob when something wades through: the shader moves them with the water) */
export function meshLilyHero(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, lod: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(0.3);
  const G = rampFor(sp.leaf), A = rampFor(sp.accent), rim = sp.id % 3 === 0;
  let R = 0.1;
  for (let i = r.int(3, 5); i > 0; i--) {
    const x = r.range(-0.35, 0.35) * h, z = r.range(-0.35, 0.35) * h, rad = r.range(0.2, 0.32) * h, rect = tex.pad(G, r.int(0, 3)), slit = r.range(0, TAU), seg = lod ? 10 : 16;
    R = Math.max(R, Math.hypot(x, z) + rad);
    g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.phase = r.next(); g.col = [1, 1, 1];
    const ctr = g.v([x, 0.03, z], UP, rect.u0 + rect.du * 0.5, rect.v0 + rect.dv * 0.5, 0.2), ring: number[] = [];
    for (let k = 0; k <= seg; k++) {
      // the pad runs from one side of the slit to the other
      const a = slit + 0.12 + (k / seg) * (TAU - 0.24), u = Math.cos(a - slit), w = Math.sin(a - slit);
      const lift = 0.035 + (rim ? 0 : Math.sin(k * 1.7) * 0.004);
      ring.push(g.v([x + Math.cos(a) * rad, lift, z + Math.sin(a) * rad], vnrm([Math.cos(a) * 0.12, 1, Math.sin(a) * 0.12]), rect.u0 + rect.du * (0.5 + u * 0.5), rect.v0 + rect.dv * (0.5 + w * 0.5), 1));
    }
    for (let k = 0; k < seg; k++) g.tri(ctr, ring[k + 1], ring[k]);
    if (rim && lod === 0) {
      // the upturned rim: a band round the edge, its outside a step darker
      g.col = linHex(G[2], 1.5);
      const b0 = g.n;
      for (let k = 0; k <= seg; k++) { const a = slit + 0.12 + (k / seg) * (TAU - 0.24), o: V3 = [Math.cos(a), 0, Math.sin(a)]; g.v([x + o[0] * rad, 0.035, z + o[2] * rad], o, rect.u0, rect.v0); g.v([x + o[0] * rad * 1.04, 0.035 + rad * 0.22, z + o[2] * rad * 1.04], o, rect.u0, rect.v0 + rect.dv * 0.1, 1); }
      for (let k = 0; k < seg; k++) { const a = b0 + k * 2; g.quad(a, a + 2, a + 3, a + 1); }
      g.col = [1, 1, 1];
    }
  }
  // flowers rising from the water, one sometimes still a bud
  const nf = r.chance(0.65) ? r.int(1, 2) : 0, pr = tex.leaf('petal', A, { petal: true }), sep = tex.leaf('lance', G, { var: 1 });
  for (let k = 0; k < nf; k++) {
    const c: V3 = [r.range(-0.15, 0.15) * h, r.range(0.1, 0.22) * h, r.range(-0.15, 0.15) * h];
    g.kind = KIND.STEM; g.col = linHex(G[3], SLOT_GAIN[BARK.STEM]); g.pivot = [0, 0, 0];
    tube(g, [[c[0] * 0.8, 0.0, c[2] * 0.8], c], [0.006, 0.005], BARK.STEM, 4, false);
    flower(g, tex, c, UP, { n: 8, len: h * 0.2, wid: h * 0.055, rect: pr, cup: 0.55, layers: 2, sepals: sep, stamens: 10, pistil: rampNamed('ochre'), bud: k === 1 ? 0.8 : 0, receptacle: G }, r, lod);
  }
  return { geo: g.build(R), H: 0.3, R, tris: g.tris };
}
