// 3D flora meshes. A grown Plant (plantStyle) becomes real geometry: limb chains turn into tapered bark tubes with
// rounded ends, every leaf into its own folded, drooping, double-sided card cut from a hi-res painted leaf, grass and
// strap leaves into creased ribbons, fronds into ribbons whose two halves hang from the rachis carrying the painted
// leaflets, mushroom caps into domes with gills beneath, berries and pods into little spheres. Barrel cacti, crystal
// shards and lily pads are modelled directly, and so is the ground cover (grass tussocks, sedges, meadow flowers,
// clover, young ferns, mushrooms).
//
// Every vertex carries what the vertex shader needs to move it: aW = (sway weight: 0 at the root .. 1 at the top,
// branch weight: how far out on a limb, flutter weight: leaf tips and edges, phase), and aP = (pivot xyz: petals open
// and close and pods breathe around it, kind). Vertex colours carry crown occlusion and per-leaf colour variation.
import * as THREE from 'three';
import { Rand } from '../core/rand';
import { makeRamp, mixHex } from '../limbo/gfx/pixel';
import { K, PROF, type Plant, type Limb, type Leaf, type Ribbon, type V3, type Shape } from './plantStyle';
import { FloraTex, BARK, barkU, type Rect } from './floraTex';
import type { PlantSpecies } from './plantArt';
import type { Palette } from './palette';

export const PXM = 32;
/** vertex kinds (aP.w) */
export const KIND = { BARK: 0, LEAF: 1, PETAL: 2, GLOW: 3, SOLID: 4, STEM: 5, CRYSTAL: 6, TINT: 7 } as const;

const TAU = Math.PI * 2;
const lin = (c: number) => Math.pow(c / 255, 2.2);
/** a hex colour as linear rgb, times k */
const linHex = (hex: number, k = 1): [number, number, number] => [lin((hex >> 16) & 255) * k, lin((hex >> 8) & 255) * k, lin(hex & 255) * k];
/** mean linear value of each neutral bark slot (the tint compensates so a limb keeps its ramp colour) */
const SLOT_GAIN: Record<number, number> = { [BARK.FURROW]: 1 / 0.3, [BARK.PLATE]: 1 / 0.32, [BARK.RING]: 1 / 0.32, [BARK.STEM]: 1 / 0.48, [BARK.FIBRE]: 1 / 0.6, [BARK.FLESH]: 1 / 0.48 };

// ------------------------------------------------------------------------------------------------ vector bits
const vadd = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vmul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const vdot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = (a: V3) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const vnrm = (a: V3): V3 => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vperp = (a: V3): V3 => vnrm(Math.abs(a[1]) < 0.9 ? vcross(a, [0, 1, 0]) : vcross(a, [1, 0, 0]));
const UPV: V3 = [0, 1, 0];
const M = (p: V3): V3 => [p[0] / PXM, p[1] / PXM, p[2] / PXM];

// ------------------------------------------------------------------------------------------------ builder
export class Geo {
  private P: number[] = []; private N: number[] = []; private U: number[] = []; private Cl: number[] = []; private W: number[] = []; private A: number[] = [];
  private I: number[] = [];
  n = 0;
  /** context for the next vertices */
  col: [number, number, number] = [1, 1, 1]; kind: number = KIND.LEAF; pivot: V3 = [0, 0, 0]; phase = 0;
  constructor(readonly H: number) {}
  v(p: V3, n: V3, u: number, v: number, flut = 0): number {
    this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.U.push(u, v);
    this.Cl.push(this.col[0], this.col[1], this.col[2]);
    this.W.push(0, 0, flut, this.phase);
    this.A.push(this.pivot[0], this.pivot[1], this.pivot[2], this.kind);
    return this.n++;
  }
  tri(a: number, b: number, c: number) { this.I.push(a, b, c); }
  quad(a: number, b: number, c: number, d: number) { this.I.push(a, b, c, a, c, d); }
  get tris() { return this.I.length / 3; }
  /** sway (by height) and branch weights (by reach from the stem) from the final positions */
  build(R: number): THREE.BufferGeometry {
    const H = Math.max(0.05, this.H), n = this.n, W = this.W, P = this.P;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const s = Math.max(0, y) / H;
      W[i * 4] = Math.min(1.25, Math.pow(s, 1.5));
      W[i * 4 + 1] = Math.min(1, Math.sqrt(x * x + z * z) / Math.max(0.05, R)) * Math.min(1, s * 1.6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.Cl, 3));
    g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 4));
    g.setAttribute('aP', new THREE.Float32BufferAttribute(this.A, 4));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    return g;
  }
}

// ------------------------------------------------------------------------------------------------ primitives
/** a tapered tube along a polyline (metres), bark from a neutral slot tinted by col; rounded tip */
export function tube(g: Geo, pts: V3[], rad: number[], slot: number, sides: number, cap = true) {
  const n = pts.length; if (n < 2) return;
  const T: V3[] = [], Nn: V3[] = [];
  for (let i = 0; i < n; i++) T.push(vnrm(vsub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
  let N0 = vperp(T[0]);
  for (let i = 0; i < n; i++) { const t = T[i]; N0 = vnrm(vsub(N0, vmul(t, vdot(N0, t)))); Nn.push(N0); }
  const circ = TAU * Math.max(0.004, rad[0]), vk = (31 / 64) / circ;
  let acc = 0, prev = -1;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += vlen(vsub(pts[i], pts[i - 1]));
    const t = T[i], nn = Nn[i], bb = vcross(t, nn), base = g.n;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * TAU, c = Math.cos(a), sn = Math.sin(a);
      const dir: V3 = [nn[0] * c + bb[0] * sn, nn[1] * c + bb[1] * sn, nn[2] * c + bb[2] * sn];
      g.v(vadd(pts[i], vmul(dir, rad[i])), dir, barkU(slot, s / sides), acc * vk);
    }
    if (prev >= 0) for (let s = 0; s < sides; s++) g.quad(prev + s, prev + s + 1, base + s + 1, base + s);
    prev = base;
  }
  if (cap && rad[n - 1] > 0.006) {
    // a rounded tip over the open end (cut limbs read from above)
    const t = T[n - 1], tip = g.v(vadd(pts[n - 1], vmul(t, rad[n - 1] * 0.6)), t, barkU(slot, 0.5), acc * vk + 0.05);
    for (let s = 0; s < sides; s++) g.tri(prev + s, prev + s + 1, tip);
  }
}

/** a card bent along a polyline (ribbon): edges at ±hw along `side`, optional crease or fold (metres) */
function ribbonStrip(g: Geo, pts: V3[], hw: number[], rect: Rect, o: { fold?: number; crease?: number; uOff?: number; uW?: number; vMap?: number[]; flutLen?: boolean; norm?: (i: number, n: V3) => V3; flat?: boolean; side?: V3 }) {
  const n = pts.length; if (n < 2) return;
  const uOff = o.uOff ?? 0, uW = o.uW ?? 1, fold = o.fold ?? 0, crease = o.crease ?? 0;
  let prev: number[] | null = null;
  let sidePrev: V3 | null = null;
  for (let i = 0; i < n; i++) {
    const d = vnrm(vsub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
    let side = o.side ? vsub(o.side, vmul(d, vdot(o.side, d))) : vcross(d, UPV);
    if (vlen(side) < 0.2) side = sidePrev ?? vperp(d);
    side = vnrm(side);
    if (sidePrev && vdot(side, sidePrev) < 0) side = vmul(side, -1);
    sidePrev = side;
    let nn = vnrm(vcross(side, d)); if (nn[1] < 0) nn = vmul(nn, -1);
    const t = o.vMap ? o.vMap[i] : i / (n - 1), v = rect.v0 + rect.dv * t, w = hw[i];
    const nrm = o.norm ? o.norm(i, nn) : nn, fl = o.flutLen ? t : 0.4 + t * 0.6;
    const ca = Math.cos(fold), sa = Math.sin(fold);
    const L = vadd(pts[i], vadd(vmul(side, -w * ca), vmul(nn, -w * sa + crease * w)));
    const Rr = vadd(pts[i], vadd(vmul(side, w * ca), vmul(nn, -w * sa + crease * w)));
    const u0 = rect.u0 + rect.du * uOff, u1 = rect.u0 + rect.du * (uOff + uW), um = (u0 + u1) / 2;
    if (o.flat) {
      const row = [g.v(L, nrm, u0, v, fl), g.v(Rr, nrm, u1, v, fl)];
      if (prev) g.quad(prev[0], row[0], row[1], prev[1]);
      prev = row;
    } else {
      const row = [g.v(L, nrm, u0, v, fl), g.v(pts[i], nrm, um, v, fl * 0.6), g.v(Rr, nrm, u1, v, fl)];
      if (prev) { g.quad(prev[0], row[0], row[1], prev[1]); g.quad(prev[1], row[1], row[2], prev[2]); }
      prev = row;
    }
  }
}

/** a leaf card (metres): base p, along d, face n; folded along the midrib, drooping at the tip */
function leafCard(g: Geo, p: V3, d: V3, n: V3, len: number, hw: number, rect: Rect, fold: number, droop: number, crown: V3 | null) {
  let side = vcross(n, d); if (vlen(side) < 1e-4) side = vperp(d);
  side = vnrm(side);
  let up = vnrm(vcross(d, side));
  const outward = crown ? vnrm(vsub(p, crown)) : UPV;
  if (vdot(up, outward) < 0 && vdot(up, UPV) < 0.3) { up = vmul(up, -1); side = vmul(side, -1); }
  const nrm = vnrm(vadd(vmul(up, 0.4), vmul(outward, 0.6)));
  const segs = len > 0.24 ? 2 : 1, ca = Math.cos(fold), sa = Math.sin(fold);
  let prev: number[] | null = null;
  for (let k = 0; k <= segs; k++) {
    const t = k / segs, c = vadd(vadd(p, vmul(d, len * t)), [0, -droop * len * t * t, 0]);
    const v = rect.v0 + rect.dv * t;
    if (fold > 0.05 && len > 0.11) {
      const L = vadd(c, vadd(vmul(side, -hw * ca), vmul(up, hw * sa))), R = vadd(c, vadd(vmul(side, hw * ca), vmul(up, hw * sa)));
      const row = [g.v(L, nrm, rect.u0, v, t), g.v(c, nrm, rect.u0 + rect.du * 0.5, v, t * 0.7), g.v(R, nrm, rect.u0 + rect.du, v, t)];
      if (prev) { g.quad(prev[0], row[0], row[1], prev[1]); g.quad(prev[1], row[1], row[2], prev[2]); }
      prev = row;
    } else {
      const row = [g.v(vadd(c, vmul(side, -hw)), nrm, rect.u0, v, t), g.v(vadd(c, vmul(side, hw)), nrm, rect.u0 + rect.du, v, t)];
      if (prev) g.quad(prev[0], row[0], row[1], prev[1]);
      prev = row;
    }
  }
}

/** a low sphere (metres) */
function sphere(g: Geo, c: V3, r: number, rect: Rect, seg = 8, rings = 5, sq = 1) {
  const base = g.n;
  for (let j = 0; j <= rings; j++) {
    const th = (j / rings) * Math.PI, y = Math.cos(th), s = Math.sin(th);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU, n: V3 = [Math.cos(a) * s, y, Math.sin(a) * s];
      g.v([c[0] + n[0] * r, c[1] + n[1] * r * sq, c[2] + n[2] * r], n, rect.u0 + rect.du * (i / seg), rect.v0 + rect.dv * (j / rings), 0.2);
    }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, b = a + seg + 1; g.quad(a, b, b + 1, a + 1); }
}

/** a lathe: profile [radius, y] from bottom to top around c (metres); ribs modulate the radius */
function lathe(g: Geo, c: V3, prof: [number, number][], seg: number, rect: Rect, ribs = 0, ribK = 0) {
  const base = g.n, n = prof.length;
  for (let j = 0; j < n; j++) {
    const [r, y] = prof[j], [r0, y0] = prof[Math.max(0, j - 1)], [r1, y1] = prof[Math.min(n - 1, j + 1)];
    const dr = r1 - r0, dy = y1 - y0, ln = Math.hypot(dr, dy) || 1;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU, rib = ribs ? 1 - ribK * Math.pow(Math.abs(Math.cos((a * ribs) / 2)), 0.6) : 1;
      const ca = Math.cos(a), sa = Math.sin(a), rr = r * rib;
      const ribN = ribs ? -Math.sin(a * ribs) * ribK * 1.6 : 0;
      const nx = (dy / ln) * ca - ribN * sa, nz = (dy / ln) * sa + ribN * ca, ny = -dr / ln;
      g.v([c[0] + ca * rr, c[1] + y, c[2] + sa * rr], vnrm([nx, ny, nz]), rect.u0 + rect.du * (i / seg), rect.v0 + rect.dv * (j / (n - 1)), 0);
    }
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, b = a + seg + 1; g.quad(a, b, b + 1, a + 1); }
}

/** a flat disc facing n (eye, flower head, lily pad), optionally domed (metres) */
function disc(g: Geo, c: V3, n: V3, r: number, rect: Rect, seg = 10, dome = 0, up?: V3) {
  const a1 = up ? vnrm(vsub(up, vmul(n, vdot(up, n)))) : vperp(n), a2 = vcross(n, a1);
  const ctr = g.v(vadd(c, vmul(n, dome * r)), n, rect.u0 + rect.du * 0.5, rect.v0 + rect.dv * 0.5, 0.3);
  const base = g.n;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
    const p = vadd(c, vadd(vmul(a1, ca * r), vmul(a2, sa * r)));
    g.v(p, vnrm(vadd(n, vadd(vmul(a1, ca * dome), vmul(a2, sa * dome)))), rect.u0 + rect.du * (0.5 + ca * 0.5), rect.v0 + rect.dv * (0.5 + sa * 0.5), 1);
  }
  for (let i = 0; i < seg; i++) g.tri(ctr, base + i, base + i + 1);
}

// ------------------------------------------------------------------------------------------------ plants
const ampOf = (a: number | undefined) => 0.32 + 0.74 * Math.pow(Math.max(0, Math.min(1, ((a ?? 0.6) - 0.05) / 0.55)), 0.9);
const PMAX: Partial<Record<Shape, number>> = {};
const pmaxOf = (s: Shape) => { let v = PMAX[s]; if (v === undefined) { v = 0.01; for (let t = 0; t <= 1; t += 0.02) v = Math.max(v, PROF[s](t)); PMAX[s] = v; } return v; };

export interface PlantGeo { geo: THREE.BufferGeometry; H: number; R: number; tris: number; parts?: Record<string, number> }

/** mesh a grown, normalised plant (its sprite pass ran first: limbs and leaves carry their sky light) */
export function meshPlant(P: Plant, sp: PlantSpecies, tex: FloraTex, seed: number, bladeSet?: BladeSet, lod = 0): PlantGeo {
  const r = new Rand(seed), L1 = lod > 0;
  // extents (metres)
  let H = 0.1, R = 0.05, cy = 0, cn = 0;
  for (const l of P.limbs) { H = Math.max(H, l.b[1] / PXM, l.a[1] / PXM); R = Math.max(R, Math.hypot(l.b[0], l.b[2]) / PXM); }
  for (const l of P.leaves) { const tip = l.p[1] + l.d[1] * l.len; H = Math.max(H, tip / PXM); R = Math.max(R, Math.hypot(l.p[0], l.p[2]) / PXM); if (!l.skip3d) { cy += l.p[1]; cn++; } }
  for (const o of P.orbs) H = Math.max(H, (o.c[1] + o.r) / PXM);
  for (const o of P.caps) H = Math.max(H, (o.c[1] + o.hr) / PXM);
  for (const rb of P.ribbons) for (const p of rb.pts) H = Math.max(H, p[1] / PXM);
  const g = new Geo(H);
  const crown: V3 = [0, cn ? cy / cn / PXM : H * 0.6, 0];
  const tree = sp.tree, leafK = tree ? 1.35 : sp.arch === 'shrub' ? 1.25 : 1.1;

  // ---- limbs: chains -> tubes (pixel-art twigs are a pixel thick; in 3D they thin out, short twigs merge)
  let i = 0;
  const limbs = P.limbs;
  while (i < limbs.length) {
    const l0 = limbs[i];
    if (l0.skip3d) { i++; continue; }
    const pts: V3[] = [M(l0.a), M(l0.b)], rad = [l0.ra / PXM, l0.rb / PXM];
    let amb = l0.amb ?? 0.6, j = i + 1;
    while (j < limbs.length && l0.chain && limbs[j].chain === l0.chain && !limbs[j].skip3d) {
      const lj = limbs[j];
      if (Math.abs(lj.a[0] - limbs[j - 1].b[0]) + Math.abs(lj.a[1] - limbs[j - 1].b[1]) + Math.abs(lj.a[2] - limbs[j - 1].b[2]) > 0.01) break;
      pts.push(M(lj.b)); rad.push(lj.rb / PXM); amb += lj.amb ?? 0.6; j++;
    }
    amb /= j - i;
    i = j;
    const isBark = l0.kind === undefined || l0.kind === K.BARK;
    const r0 = Math.max(...rad);
    // twigs: thinner than their pixel width; the finest end in the leaves and are not drawn at all
    for (let k = 0; k < rad.length; k++) if (rad[k] < 0.035) rad[k] = Math.max(0.0045, rad[k] * (0.45 + rad[k] * 15));
    const crowned = tree || sp.arch === 'shrub' || sp.arch === 'umbrella';
    if (crowned && isBark && r0 < (L1 ? 0.03 : sp.arch === 'shrub' ? 0.03 : 0.022)) continue;
    if (L1 && !crowned && r0 < 0.01 && pts.length > 6) continue;
    // merge short steps on thin limbs
    let P2 = pts, R2 = rad;
    if (L1 && !isBark && r0 < 0.012) continue;
    const stepK = L1 ? (r0 < 0.08 ? (pts.length > 12 ? 4 : 3) : 2) : r0 < 0.05 || sp.arch === 'shrub' ? (pts.length > 16 ? 3 : 2) : 1;
    if (pts.length > 3 && stepK > 1) { P2 = []; R2 = []; for (let k = 0; k < pts.length; k += stepK) { P2.push(pts[k]); R2.push(rad[k]); } if ((pts.length - 1) % stepK) { P2.push(pts[pts.length - 1]); R2.push(rad[rad.length - 1]); } }
    const slot = l0.ring ? BARK.RING : isBark ? ((l0.ridge ?? 0) >= 3 ? (sp.trunk & 1 ? BARK.PLATE : BARK.FURROW) : (l0.ridge ?? 0) >= 2 ? BARK.FURROW : sp.arch === 'coral' ? BARK.FLESH : BARK.STEM) : (l0.ridge ?? 0) >= 3 ? BARK.FIBRE : BARK.STEM;
    const fslot = sp.arch === 'fungus' && isBark ? BARK.FIBRE : slot;
    const green = !isBark || sp.arch === 'coral';
    const rm = Math.max(...R2), sides = sp.arch === 'shrub' && !L1 ? (rm > 0.035 ? 5 : 3) : L1 ? (rm > 0.07 ? 6 : rm > 0.035 && !green ? 4 : 3) : rm > 0.09 ? 8 : rm > 0.045 ? 6 : rm > 0.022 && !(green && rm < 0.04) ? 4 : 3;
    const base = l0.ramp[Math.min(l0.ramp.length - 1, 3)], ao = ampOf(amb);
    g.col = linHex(base, ao * SLOT_GAIN[fslot] * (isBark ? 0.95 : 1));
    g.kind = isBark && sp.arch !== 'coral' && sp.arch !== 'fungus' ? KIND.BARK : KIND.STEM; g.pivot = [0, 0, 0]; g.phase = r.next();
    tube(g, P2, R2, fslot, sides, rm > 0.012);
  }

  const parts: Record<string, number> = { limbs: g.tris };
  // ---- leaves: individual cards. Crowns keep every other leaf, grown larger (the same cover, half the cards)
  // a leaf budget per LOD: thinned crowns grow their remaining leaves so the cover stays the same
  const crown3 = tree || sp.arch === 'shrub' || sp.arch === 'umbrella';
  let nLeaf = 0; for (const l of P.leaves) if (!l.skip3d && l.kind !== K.ACC) nLeaf++;
  const budget = crown3 ? (sp.arch === 'shrub' ? (L1 ? 60 : 165) : L1 ? 260 : 1400) : L1 ? 40 : 400;
  const thin = Math.max(1, Math.round(nLeaf / budget)), grow = thin > 1 ? Math.sqrt(thin) * 0.9 : 1;
  let li = 0;
  for (const l of P.leaves) {
    if (l.skip3d) continue;
    const petal = l.kind === K.ACC;
    if (!petal && thin > 1 && (li++ % thin)) continue;
    const needle = l.shape === 'needle' && !petal;
    const rect = needle ? tex.needles(l.ramp, li & 1) : tex.leaf(l.shape, l.ramp, { vein: l.vein, lat: l.lat, teeth: l.teeth, petal });
    const len = (l.len / PXM) * (petal ? 1.15 : leafK * grow) * (needle ? 1.25 : 1), hw = needle ? len * 0.42 : (l.wid / PXM) * pmaxOf(l.shape) * (petal ? 1.1 : leafK * grow);
    const ao = ampOf(l.amb), vv = r.range(0.88, 1.1), warm = r.range(-0.05, 0.05);
    g.col = [ao * vv * (1 + warm), ao * vv, ao * vv * (1 - warm)];
    g.kind = petal ? KIND.PETAL : KIND.LEAF; g.phase = r.next();
    g.pivot = petal ? M(l.p) : [0, 0, 0];
    leafCard(g, M(l.p), l.d, l.n, len, hw, rect, L1 || len < 0.2 ? 0 : Math.atan(l.fold ?? 0.35) * 0.75, petal ? 0.05 : tree ? 0.22 : 0.16, petal ? null : crown);
  }

  parts.leaves = g.tris - parts.limbs;
  // ---- ribbons: blades (one texture per plant, a fresh and a sun-cured column per ramp), fronds, strands
  const bs = bladeSet ?? bladeSetOf([P]);
  const bladeTex = bs.ramps.length ? tex.blades(bs.ramps, bs.dry, bs.ramps.length * 2, { pairs: true, wide: true }) : null;
  const grassy = sp.arch === 'tuft' || sp.arch === 'reed';
  let bi = 0;
  for (const rb of P.ribbons) {
    const pts = resample(rb.pts.map(M), rb.kind === 'blade' ? (L1 ? 2 : grassy ? 3 : 4) : L1 ? 3 : 6);
    const lim = rb.limbs ?? [];
    let amb = 0; for (const l of lim) amb += l.amb ?? 0.6; amb = lim.length ? amb / lim.length : 0.6;
    g.phase = r.next(); g.pivot = [0, 0, 0]; g.kind = KIND.LEAF;
    const ao = ampOf(amb);
    if (rb.kind === 'blade' && sp.arch === 'shrub' && (L1 || (bi++ & 1))) continue;
    if (rb.kind === 'blade') {
      const w0 = (rb.w[0] / PXM) * 1.25, nc = bs.ramps.length * 2, col = (bs.index.get(rb.ramp.join('.')) ?? 0) * 2 + (rb.dry ? 1 : 0);
      const vv = r.range(0.9, 1.08);
      g.col = [ao * vv, ao * vv, ao * vv];
      ribbonStrip(g, pts, pts.map(() => w0), bladeTex!, { crease: 0.22, flutLen: true, flat: grassy || L1, uOff: col / nc, uW: 1 / nc });
    } else if (rb.kind === 'strand') {
      // a weeping strand: one hanging ribbon painted with its narrow leaves, its face turned out of the crown
      const total = polyLen(rb.pts) / PXM, lmax = (rb.lmax ?? 4) / PXM * 1.3;
      const rect = tex.frond(rb.ramps ?? [rb.ramp], rb.ramp, { len: Math.max(0.3, total), hw: lmax * 0.9, lmax, fwd: rb.fwd ?? 1, wr: rb.wr ?? 0.28, start: 0.02, shape: 'lance' });
      g.col = [ao, ao, ao];
      const out = rb.out ?? [1, 0, 0], side = vnrm(vcross(UPV, vlen(out) > 0.1 ? out : [1, 0, 0]));
      ribbonStrip(g, pts, pts.map(() => lmax * 0.9), rect, { vMap: cumulative(pts), flutLen: true, flat: true, side });
    } else {
      const total = polyLen(rb.pts) / PXM, lmax = (rb.lmax ?? 8) / PXM, fwd = rb.fwd ?? 0.4;
      const hw = lmax / Math.sqrt(1 + fwd * fwd) * 1.04;
      const rect = tex.frond(rb.ramps ?? [rb.ramp], rb.ramp, { len: Math.max(0.3, total), hw, lmax, fwd, wr: rb.wr ?? 0.25, start: rb.start ?? 0.1, shape: rb.shape ?? 'lance', lobes: rb.lobes, dead: rb.dead });
      g.col = [ao, ao, ao];
      const vMap = cumulative(pts);
      ribbonStrip(g, pts, pts.map((_, k) => hw * Math.min(1, 0.35 + vMap[k] * 3)), rect, { fold: rb.fold ?? 0.3, vMap, flutLen: true, flat: L1 && (rb.fold ?? 0.3) < 0.25 });
    }
  }

  parts.ribbons = g.tris - parts.limbs - parts.leaves;
  // ---- orbs: fruit, berries, beads, coral polyps, lantern pods
  const spk = tex.speckle();
  let oi = 0;
  const orbThin = Math.max(1, Math.round(P.orbs.length / (L1 ? 8 : sp.arch === 'shrub' ? 6 : 40)));
  for (const o of P.orbs) {
    if (orbThin > 1 && !o.ribs && (oi++ % orbThin)) continue;
    const c = M(o.c), rr = (o.r / PXM) * (orbThin > 1 ? Math.min(1.5, Math.pow(orbThin, 0.3)) : 1), ao = ampOf(o.amb);
    g.phase = r.next(); g.pivot = c;
    if (o.ribs) {
      // a ribbed lantern pod: lathe with its own painted skin
      const rect = tex.pod(o.ramp, o.ribs * 2, o.glow !== undefined);
      g.kind = o.glow !== undefined ? KIND.GLOW : KIND.SOLID; g.col = [ao, ao, ao];
      const sq = o.sq ?? 1, prof: [number, number][] = [];
      for (let k = 0; k <= 6; k++) { const th = Math.PI * (1 - k / 6); prof.push([Math.max(0.002, Math.sin(th) * rr), Math.cos(th) * rr * sq]); }
      lathe(g, c, L1 ? prof.filter((_, k) => k % 2 === 0) : prof, L1 ? 6 : 10, rect, o.ribs * 2, 0.12);
    } else {
      g.kind = o.glow !== undefined ? KIND.GLOW : KIND.SOLID;
      g.col = linHex(o.ramp[Math.min(o.ramp.length - 1, 4)], ao * 1.35);
      if (L1) sphere(g, c, rr, spk, rr > 0.08 ? 6 : 4, rr > 0.08 ? 3 : 2, o.sq ?? 1);
      else sphere(g, c, rr, spk, rr > 0.08 ? 8 : rr > 0.04 ? 6 : 5, rr > 0.08 ? 4 : rr > 0.04 ? 3 : 2, o.sq ?? 1);
    }
  }

  // ---- mushroom caps: a dome with fibrils and flecks, gills beneath
  for (const o of P.caps) {
    const c = M(o.c), rr = o.r / PXM, hr = o.hr / PXM, ao = ampOf(o.amb);
    const top = tex.cap(o.ramp, Math.min(6, o.spots), o.spotCol), gill = tex.gills(o.gill);
    g.kind = KIND.SOLID; g.pivot = c; g.phase = r.next(); g.col = [ao, ao, ao];
    const seg = L1 ? 7 : rr > 0.08 ? 11 : 8, rings = L1 ? 2 : rr > 0.08 ? 3 : 2, phiMax = Math.PI * 0.56, base = g.n;
    for (let j = 0; j <= rings; j++) {
      const ph = (j / rings) * phiMax, sr = Math.sin(ph), cr = Math.cos(ph);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * TAU, x = Math.cos(a) * sr, z = Math.sin(a) * sr;
        const n = vnrm([x / rr, cr / hr, z / rr]);
        g.v([c[0] + x * rr, c[1] + cr * hr - (j === rings ? hr * 0.08 : 0), c[2] + z * rr], n, top.u0 + top.du * (0.5 + x * 0.5), top.v0 + top.dv * (0.5 + z * 0.5), 0);
      }
    }
    for (let j = 0; j < rings; j++) for (let k = 0; k < seg; k++) { const a = base + j * (seg + 1) + k, b = a + seg + 1; g.quad(a, a + 1, b + 1, b); }
    // gills: a shallow cone from the rim to the stem
    const rim = Math.sin(phiMax), gb = g.n, ctr = g.v([c[0], c[1] + hr * 0.12, c[2]], [0, -1, 0], gill.u0 + gill.du * 0.5, gill.v0 + gill.dv * 0.5);
    for (let k = 0; k <= seg; k++) { const a = (k / seg) * TAU; g.v([c[0] + Math.cos(a) * rim * rr, c[1] + Math.cos(phiMax) * hr - hr * 0.08, c[2] + Math.sin(a) * rim * rr], [0, -1, 0], gill.u0 + gill.du * (0.5 + Math.cos(a) * 0.5), gill.v0 + gill.dv * (0.5 + Math.sin(a) * 0.5)); }
    for (let k = 0; k < seg; k++) g.tri(ctr, gb + 1 + k + 1, gb + 1 + k);
  }

  // ---- eyes
  for (const e of P.eyes) {
    const rect = tex.eye(e.iris);
    g.kind = KIND.SOLID; g.pivot = M(e.p); g.phase = r.next(); g.col = [1, 1, 1];
    disc(g, M(e.p), vnrm(e.n), (e.r / PXM) * 1.1, rect, L1 ? 6 : 10, 0.35, UPV);
  }
  parts.rest = g.tris - parts.limbs - parts.leaves - parts.ribbons;
  return { geo: g.build(R), H, R, tris: g.tris, parts };
}

/** the distinct blade ramps of a species' variants: one blade texture serves them all */
export interface BladeSet { ramps: number[][]; dry: number[] | null; index: Map<string, number> }
export function bladeSetOf(plants: (Plant | null | undefined)[]): BladeSet {
  const out: BladeSet = { ramps: [], dry: null, index: new Map() };
  for (const P of plants) if (P) for (const rb of P.ribbons) {
    if (rb.kind !== 'blade') continue;
    const k = rb.ramp.join('.');
    if (!out.index.has(k)) { out.index.set(k, out.ramps.length); out.ramps.push(rb.ramp); }
    if (rb.dry && !out.dry) out.dry = rb.dry;
  }
  return out;
}
function polyLen(p: V3[]) { let s = 0; for (let i = 1; i < p.length; i++) s += vlen(vsub(p[i], p[i - 1])); return s; }
function cumulative(p: V3[]) { const out = [0]; let s = 0; for (let i = 1; i < p.length; i++) { s += vlen(vsub(p[i], p[i - 1])); out.push(s); } return out.map((v) => v / (s || 1)); }
/** keep at most n segments (polyline vertices evenly by index; ends kept) */
function resample(p: V3[], n: number): V3[] {
  if (p.length <= n + 1) return p;
  const out: V3[] = [];
  for (let k = 0; k <= n; k++) out.push(p[Math.round((k / n) * (p.length - 1))]);
  return out;
}

// ------------------------------------------------------------------------------------------------ modelled kinds
/** barrel cacti: ribbed lathe bodies with painted areoles and spines, a crown of petals */
export function meshBarrel(sp: PlantSpecies, h: number, tex: FloraTex, seed: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(h);
  const G = makeRamp(mixHex(sp.leaf, 0x5e7e62, 0.5), 6, { spread: 0.58, hueShift: 0.045 }), A = makeRamp(sp.accent, 6, { spread: 0.55 });
  const n = r.int(1, 2), ribs = r.int(9, 14);
  const skin = tex.cactus(G, ribs, 0);
  let R = 0.1;
  for (let k = 0; k < n; k++) {
    const th = h * (k === 0 ? 0.92 : r.range(0.5, 0.7)), w = h * r.range(0.24, 0.32) * (n === 1 ? 1.1 : 0.85), x = n === 1 ? 0 : (k - 0.5) * w * 1.7, z = r.range(-0.05, 0.05);
    R = Math.max(R, Math.abs(x) + w);
    const prof: [number, number][] = [];
    for (let j = 0; j <= 9; j++) {
      const t = j / 9, y = t * th;
      const dome = th - w * 1.05, rr = y > dome ? w * Math.sqrt(Math.max(0, 1 - ((y - dome) / (w * 1.05)) ** 2)) : w * (0.86 + 0.14 * Math.sin(t * Math.PI));
      prof.push([Math.max(0.004, rr), y]);
    }
    g.kind = KIND.SOLID; g.pivot = [x, th * 0.5, z]; g.phase = r.next(); g.col = [1, 1, 1];
    lathe(g, [x, -0.03, z], prof, 28, skin, ribs, 0.1);
    if (r.chance(0.75)) {
      // a crown of petals at the apex
      const pr = tex.leaf('petal', A, { petal: true });
      g.kind = KIND.PETAL; const top: V3 = [x, th - 0.01, z]; g.pivot = top;
      for (let p = 0; p < 9; p++) { const a = (p / 9) * TAU + r.range(-0.1, 0.1), d: V3 = vnrm([Math.cos(a), 0.9, Math.sin(a)]); leafCard(g, top, d, vnrm([Math.cos(a) * -0.6, 1, Math.sin(a) * -0.6]), w * 0.5, w * 0.17, pr, 0.2, 0.05, null); }
    }
  }
  return { geo: g.build(R), H: h, R, tris: g.tris };
}

/** crystal blooms: faceted hexagonal shards with pointed tips fanning from a stony boss */
export function meshCrystal(sp: PlantSpecies, h: number, tex: FloraTex, seed: number, pal: Palette): PlantGeo {
  const r = new Rand(seed), g = new Geo(h), cr = tex.crystal(), spk = tex.speckle();
  // the boss
  g.kind = KIND.SOLID; g.pivot = [0, 0, 0]; g.col = linHex(mixHex(pal.rock, 0x6a6460, 0.5), 2.2);
  sphere(g, [0, 0.02, 0], h * 0.18, spk, 7, 3, 0.45);
  const n = r.int(4, 7);
  g.kind = KIND.CRYSTAL;
  for (let i = 0; i < n; i++) {
    const az = r.range(0, TAU), tilt = i === 0 ? r.range(0, 0.15) : r.range(0.25, 0.75);
    const d: V3 = [Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)];
    const len = h * (i === 0 ? 1 : r.range(0.45, 0.85)), w = len * r.range(0.1, 0.16);
    const a1 = vperp(d), a2 = vcross(d, a1), base: V3 = vmul(d, h * 0.05), tipStart = vadd(base, vmul(d, len * 0.78)), tip = vadd(base, vmul(d, len));
    g.col = linHex(mixHex(sp.accent, 0xffffff, r.range(0, 0.25)), 1.4); g.phase = r.next(); g.pivot = base;
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * TAU, b0 = ((k + 1) / 6) * TAU;
      const e0 = vadd(vmul(a1, Math.cos(a0) * w), vmul(a2, Math.sin(a0) * w)), e1 = vadd(vmul(a1, Math.cos(b0) * w), vmul(a2, Math.sin(b0) * w));
      const fn = vnrm(vadd(e0, e1)), tn = vnrm(vadd(fn, vmul(d, 0.6)));
      const q0 = g.v(vadd(base, e0), fn, cr.u0, cr.v0, 0), q1 = g.v(vadd(base, e1), fn, cr.u0 + cr.du, cr.v0, 0);
      const q2 = g.v(vadd(tipStart, e1), fn, cr.u0 + cr.du, cr.v0 + cr.dv * 0.8, 0), q3 = g.v(vadd(tipStart, e0), fn, cr.u0, cr.v0 + cr.dv * 0.8, 0);
      g.quad(q0, q1, q2, q3);
      const t0 = g.v(vadd(tipStart, e0), tn, cr.u0, cr.v0 + cr.dv * 0.8, 0), t1 = g.v(vadd(tipStart, e1), tn, cr.u0 + cr.du, cr.v0 + cr.dv * 0.8, 0), t2 = g.v(tip, tn, cr.u0 + cr.du * 0.5, cr.v0 + cr.dv, 0);
      g.tri(t0, t1, t2);
    }
  }
  return { geo: g.build(h * 0.5), H: h, R: h * 0.5, tris: g.tris };
}

/** floating lily pads, slightly cupped, and sometimes a flower standing among them */
export function meshLily(sp: PlantSpecies, h: number, tex: FloraTex, seed: number): PlantGeo {
  const r = new Rand(seed), g = new Geo(0.2);
  const G = makeRamp(sp.leaf, 6, { spread: 0.55 }), A = makeRamp(sp.accent, 6, { spread: 0.55 });
  let R = 0.1;
  for (let i = r.int(2, 4); i > 0; i--) {
    const x = r.range(-0.3, 0.3) * h, z = r.range(-0.3, 0.3) * h, rad = r.range(0.22, 0.32) * h, rect = tex.pad(G, r.int(0, 3));
    R = Math.max(R, Math.hypot(x, z) + rad);
    g.kind = KIND.LEAF; g.pivot = [0, 0, 0]; g.phase = r.next(); g.col = [1, 1, 1];
    const rot = r.range(0, TAU), base = g.n, seg = 14;
    g.v([x, 0.03, z], UPV, rect.u0 + rect.du * 0.5, rect.v0 + rect.dv * 0.5, 0.2);
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * TAU, u = Math.cos(a + rot), w = Math.sin(a + rot);
      g.v([x + Math.cos(a) * rad, 0.05, z + Math.sin(a) * rad], vnrm([Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15]), rect.u0 + rect.du * (0.5 + u * 0.5), rect.v0 + rect.dv * (0.5 + w * 0.5), 1);
    }
    for (let k = 0; k < seg; k++) g.tri(base, base + 2 + k, base + 1 + k);
  }
  if (r.chance(0.55)) {
    const pr = tex.leaf('petal', A, { petal: true }), c: V3 = [r.range(-0.1, 0.1), 0.06, r.range(-0.1, 0.1)];
    g.kind = KIND.PETAL; g.pivot = c;
    for (let ring = 0; ring < 2; ring++) for (let p = 0; p < 8; p++) {
      const a = (p / 8) * TAU + ring * 0.4, el = ring ? 0.9 : 0.45;
      const d: V3 = vnrm([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)]);
      g.phase = r.next();
      leafCard(g, c, d, vnrm([-Math.cos(a) * Math.sin(el), Math.cos(el), -Math.sin(a) * Math.sin(el)]), h * (ring ? 0.16 : 0.2), h * 0.06, pr, 0.25, 0.02, null);
    }
    g.kind = KIND.GLOW; g.col = linHex(0xf0d060, 1); sphere(g, vadd(c, [0, 0.02, 0]), h * 0.035, tex.speckle(), 6, 3);
  }
  return { geo: g.build(R), H: 0.2, R, tris: g.tris };
}

// ------------------------------------------------------------------------------------------------ ground cover
export type GroundForm = 'grass' | 'tall' | 'dry' | 'sedge' | 'clover' | 'flower' | 'fern' | 'mush';

/** a tussock: blades rising from a small crown, leaning out, arching over; seed heads on the tall ones */
function tussock3d(g: Geo, r: Rand, tex: FloraTex, pal: Palette, kind: 'grass' | 'tall' | 'dry' | 'sedge', size: number) {
  const g0 = kind === 'dry' ? mixHex(pal.grassDry, pal.grass, 0.25) : kind === 'sedge' ? mixHex(pal.grass, 0x3a6a4a, 0.45) : mixHex(pal.grass, 0x6e9a3a, 0.3);
  const rp = (c: number) => makeRamp(c, 7, { spread: 0.62, hueShift: 0.05, satShift: 0.06 });
  const ramps = [rp(g0), rp(mixHex(g0, 0x8ab040, 0.22)), rp(mixHex(g0, 0x2e5a34, 0.25)), rp(mixHex(g0, pal.grassDry, kind === 'dry' ? 0.6 : 0.3))];
  const dry = rp(mixHex(pal.grassDry, 0xd8c890, 0.25));
  const cols = 8, rect = tex.blades(ramps, dry, cols, { dryP: kind === 'dry' ? 0.7 : kind === 'sedge' ? 0.25 : 0.22, var: kind === 'tall' ? 1 : 0 });
  const n = kind === 'tall' ? r.int(13, 18) : kind === 'sedge' ? r.int(10, 14) : r.int(9 + size * 3, 12 + size * 4);
  const Hh = kind === 'tall' ? r.range(0.6, 0.85) : kind === 'sedge' ? r.range(0.5, 0.7) : 0.28 + size * 0.1 + r.range(0, 0.06);
  const spread = kind === 'sedge' ? 0.07 : 0.1 + size * 0.03;
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const a = r.range(0, TAU), d0 = Math.sqrt(r.next()) * spread, x = Math.cos(a) * d0, z = Math.sin(a) * d0;
    const len = Hh * r.range(0.55, 1), lean = (d0 / spread) * r.range(0.25, 0.6) + r.range(0, 0.15), arch = r.range(0.05, kind === 'sedge' ? 0.25 : 0.55);
    const dir: V3 = [Math.cos(a) * lean, 1, Math.sin(a) * lean], pts: V3[] = [];
    for (let k = 0; k <= 3; k++) {
      const t = k / 3, up = vnrm(dir);
      pts.push([x + up[0] * len * t + Math.cos(a) * arch * len * t * t * 0.6, up[1] * len * t - arch * len * t * t * t * 0.55, z + up[2] * len * t + Math.sin(a) * arch * len * t * t * 0.6]);
    }
    const ao = 0.62 + 0.38 * (len / Hh) * r.range(0.8, 1);
    g.col = [ao, ao, ao]; g.phase = r.next();
    const w = (kind === 'sedge' ? 0.016 : 0.014) * r.range(0.85, 1.25);
    ribbonStrip(g, pts, pts.map(() => w), rect, { flat: true, uOff: r.int(0, cols - 1) / cols, uW: 1 / cols, flutLen: true });
  }
  if (kind === 'tall' || (kind === 'grass' && r.chance(0.3))) {
    // seeding stems: a fine stalk and a nodding panicle
    const pan = tex.panicle(rp(mixHex(pal.grassDry, r.pick([0xe0d0a0, 0xc8a070, 0xb89aa0]), 0.45)));
    for (let k = r.int(kind === 'tall' ? 2 : 1, kind === 'tall' ? 4 : 2); k > 0; k--) {
      const a = r.range(0, TAU), lean = r.range(0.05, 0.25), L = Hh * r.range(1, 1.25);
      const top: V3 = [Math.cos(a) * lean * L, L, Math.sin(a) * lean * L];
      g.col = linHex(mixHex(pal.grassDry, pal.grass, 0.4), 2.2); g.kind = KIND.STEM; g.phase = r.next();
      tube(g, [[0, 0, 0], vmul(top, 0.5), top], [0.004, 0.003, 0.002], BARK.STEM, 3, false);
      g.kind = KIND.LEAF; g.col = [1, 1, 1];
      const d = vnrm([Math.cos(a) * 0.9, -0.5, Math.sin(a) * 0.9]);
      leafCard(g, top, d, vnrm([-Math.sin(a), 0, Math.cos(a)]), 0.12, 0.03, pan, 0, 0, null);
      leafCard(g, top, d, vnrm([Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5]), 0.12, 0.03, pan, 0, 0, null);
    }
  }
  if (kind === 'sedge' && r.chance(0.5)) {
    const L = Hh * 1.05, top: V3 = [r.range(-0.02, 0.02), L, r.range(-0.02, 0.02)];
    g.col = linHex(mixHex(pal.grass, 0x3a6a4a, 0.45), 2.2); g.kind = KIND.STEM;
    tube(g, [[0, 0, 0], top], [0.005, 0.004], BARK.STEM, 3, false);
    g.col = linHex(0x6a4428, 1.9); g.kind = KIND.BARK;
    tube(g, [vadd(top, [0, -0.13, 0]), top], [0.016, 0.014], BARK.FIBRE, 5, true);
  }
}

/** a meadow flower: basal leaves, 1-3 stems, a head (daisy, bell, spike or puff) tinted per instance */
function flower3d(g: Geo, r: Rand, tex: FloraTex, pal: Palette, form: number) {
  const G = makeRamp(mixHex(pal.grass, 0x3e7a34, 0.4), 6, { spread: 0.55 }), leaf = tex.blades([G], null, 1, { wide: true, var: 3 });
  const petal = tex.leaf('petal', makeRamp(0xd8d4cc, 6, { spread: 0.5, hueShift: 0 }), { petal: true }), head = tex.floret(form);
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const a = r.range(0, TAU), L = r.range(0.08, 0.14), pts: V3[] = [];
    for (let j = 0; j <= 3; j++) { const t = j / 3; pts.push([Math.cos(a) * L * t, L * 0.6 * t - L * 0.3 * t * t, Math.sin(a) * L * t]); }
    g.col = [0.85, 0.85, 0.85]; g.phase = r.next();
    ribbonStrip(g, pts, pts.map(() => 0.012), leaf, { crease: 0.2, flutLen: true });
  }
  for (let s = r.int(1, 3); s > 0; s--) {
    const a = r.range(0, TAU), H = r.range(0.2, 0.36), lean = r.range(0, 0.15);
    const top: V3 = [Math.cos(a) * lean * H, H, Math.sin(a) * lean * H];
    g.kind = KIND.STEM; g.col = linHex(G[3], 2); g.phase = r.next(); g.pivot = [0, 0, 0];
    tube(g, [[0, 0, 0], vmul(top, 0.5), top], [0.004, 0.0035, 0.003], BARK.STEM, 3, false);
    g.pivot = top; g.col = [1, 1, 1];
    if (form === 0) {
      // daisy: a flat ring of petals round a disc, facing up and a little out
      g.kind = KIND.TINT; disc(g, top, vnrm([Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3]), 0.035, head, 10, 0.25);
    } else if (form === 1) {
      // bell: petals hanging in a cup
      g.kind = KIND.TINT;
      for (let p = 0; p < 5; p++) { const b = (p / 5) * TAU, d: V3 = vnrm([Math.cos(b) * 0.45, -1, Math.sin(b) * 0.45]); leafCard(g, top, d, vnrm([Math.cos(b), 0.3, Math.sin(b)]), 0.045, 0.016, petal, 0.3, -0.1, null); }
    } else if (form === 2) {
      // spike: a column of florets, opening from the bottom
      g.kind = KIND.TINT;
      for (let p = 0; p < 9; p++) { const b = p * 2.4, y = p * 0.012, d: V3 = vnrm([Math.cos(b), 0.6, Math.sin(b)]); leafCard(g, vadd(top, [0, y, 0]), d, vnrm([-Math.cos(b) * 0.6, 1, -Math.sin(b) * 0.6]), 0.02 + (9 - p) * 0.002, 0.009, petal, 0, 0, null); }
    } else {
      // puff: a round head of crossed florets
      g.kind = KIND.TINT;
      for (let p = 0; p < 3; p++) { const b = (p / 3) * Math.PI; disc(g, vadd(top, [0, 0.02, 0]), [Math.cos(b), 0, Math.sin(b)], 0.03, head, 8, 0); }
      disc(g, vadd(top, [0, 0.02, 0]), UPV, 0.03, head, 8, 0.2);
    }
  }
}

/** a low mat of clover: trefoils on short stalks */
function clover3d(g: Geo, r: Rand, tex: FloraTex, pal: Palette) {
  const G = makeRamp(mixHex(pal.grass, 0x4a8a3a, 0.45), 7, { spread: 0.6 });
  g.pivot = [0, 0, 0];
  for (let k = r.int(7, 12); k > 0; k--) {
    const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.16, x = Math.cos(a) * d, z = Math.sin(a) * d, h = r.range(0.03, 0.08);
    g.kind = KIND.STEM; g.col = linHex(G[2], 2); g.phase = r.next();
    tube(g, [[x * 0.5, 0, z * 0.5], [x, h, z]], [0.002, 0.0018], BARK.STEM, 3, false);
    g.kind = KIND.LEAF; g.col = [r.range(0.85, 1.05), r.range(0.85, 1.05), 0.9];
    disc(g, [x, h, z], vnrm([r.range(-0.3, 0.3), 1, r.range(-0.3, 0.3)]), r.range(0.022, 0.032), tex.trefoil(G, r.int(0, 2)), 6, 0.1);
  }
}

/** a young fern: a few small arching fronds */
function fern3d(g: Geo, r: Rand, tex: FloraTex, pal: Palette) {
  const c = mixHex(pal.foliage[r.int(0, pal.foliage.length - 1)], 0x3e7a34, 0.55), G = makeRamp(c, 7, { spread: 0.6 });
  const rect = tex.frond([G, makeRamp(mixHex(c, 0xb09a50, 0.2), 7, { spread: 0.6 })], G, { len: 0.32, hw: 0.07, lmax: 0.075, fwd: 0.45, wr: 0.32, start: 0.12, shape: 'lobed', lobes: true, var: 2 });
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0];
  for (let f = r.int(4, 6); f > 0; f--) {
    const a = r.range(0, TAU), L = r.range(0.22, 0.34), el = r.range(0.5, 1.0), pts: V3[] = [];
    let d: V3 = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)], q: V3 = [0, 0.01, 0];
    pts.push(q);
    for (let k = 0; k < 6; k++) { d = vnrm(vadd(d, [0, -0.16, 0])); q = vadd(q, vmul(d, L / 6)); pts.push(q); }
    g.col = [0.9, 0.9, 0.9]; g.phase = r.next();
    const vMap = cumulative(pts);
    ribbonStrip(g, pts, pts.map((_, k) => 0.07 * Math.min(1, 0.35 + vMap[k] * 3)), rect, { fold: 0.15, vMap, flutLen: true });
  }
}

/** a cluster of small mushrooms */
function mush3d(g: Geo, r: Rand, tex: FloraTex, pal: Palette) {
  const C = makeRamp(r.pick(pal.fungus), 6, { spread: 0.55 }), S = mixHex(pal.fungus[0], 0xf0e8d8, 0.6);
  const top = tex.cap(C, 2, mixHex(C[5], 0xf0ead8, 0.6), 2), gill = tex.gills(makeRamp(mixHex(C[3], 0xd8ccb0, 0.6), 5, { spread: 0.45 }));
  for (let k = r.int(1, 3); k > 0; k--) {
    const x = r.range(-0.07, 0.07), z = r.range(-0.07, 0.07), h = r.range(0.04, 0.11), rr = r.range(0.022, 0.05);
    g.kind = KIND.STEM; g.col = linHex(S, 1.4); g.phase = r.next(); g.pivot = [0, 0, 0];
    tube(g, [[x, 0, z], [x, h, z]], [rr * 0.28, rr * 0.22], BARK.FIBRE, 5, false);
    g.kind = KIND.SOLID; g.col = [1, 1, 1]; g.pivot = [x, h, z];
    const seg = 9, base = g.n, hr = rr * 0.6;
    for (let j = 0; j <= 3; j++) {
      const ph = (j / 3) * Math.PI * 0.55, sr = Math.sin(ph), cr = Math.cos(ph);
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * TAU, cx = Math.cos(a) * sr, cz = Math.sin(a) * sr; g.v([x + cx * rr, h + cr * hr, z + cz * rr], vnrm([cx / rr, cr / hr, cz / rr]), top.u0 + top.du * (0.5 + cx * 0.5), top.v0 + top.dv * (0.5 + cz * 0.5)); }
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < seg; i++) { const a = base + j * (seg + 1) + i, b = a + seg + 1; g.quad(a, a + 1, b + 1, b); }
    disc(g, [x, h + hr * Math.cos(Math.PI * 0.55), z], [0, -1, 0], rr * Math.sin(Math.PI * 0.55), gill, 9, -0.2);
  }
}

/** ground cover variants: each form has a few, built once per planet */
export function meshGround(form: GroundForm, variant: number, tex: FloraTex, pal: Palette, seed: number): PlantGeo {
  const r = new Rand(seed * 977 + variant * 131 + form.length * 7);
  const H = form === 'tall' || form === 'sedge' ? 0.8 : form === 'grass' || form === 'dry' ? 0.45 : form === 'flower' ? 0.35 : form === 'fern' ? 0.3 : 0.12;
  const g = new Geo(H);
  if (form === 'grass' || form === 'tall' || form === 'dry' || form === 'sedge') tussock3d(g, r, tex, pal, form, variant % 3);
  else if (form === 'flower') flower3d(g, r, tex, pal, variant % 4);
  else if (form === 'clover') clover3d(g, r, tex, pal);
  else if (form === 'fern') fern3d(g, r, tex, pal);
  else mush3d(g, r, tex, pal);
  return { geo: g.build(0.25), H, R: 0.25, tris: g.tris };
}
export type { Leaf, Limb, Ribbon };
