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
import { mixHex } from '../limbo/gfx/pixel';
import { K, PROF, type Plant, type Limb, type Leaf, type Ribbon, type V3, type Shape } from './plantStyle';
import { FloraTex, BARK, barkU, type Rect } from './floraTex';
import type { PlantSpecies } from './plantArt';
import type { Palette } from './palette';
import { rampFor, rampNamed } from './pixelKit';
import { trunkStyle, sculptTrunk, soilCollar, trunkLife, mushroom, flower } from './floraHero';

export const PXM = 32;
/** vertex kinds (aP.w) */
export const KIND = { BARK: 0, LEAF: 1, PETAL: 2, GLOW: 3, SOLID: 4, STEM: 5, CRYSTAL: 6, TINT: 7, LOBE: 8, TENTACLE: 9, MEMBRANE: 10, LIQUID: 11, DEW: 12 } as const;

const TAU = Math.PI * 2;
const lin = (c: number) => Math.pow(c / 255, 2.2);
/** a hex colour as linear rgb, times k */
const linHex = (hex: number, k = 1): [number, number, number] => [lin((hex >> 16) & 255) * k, lin((hex >> 8) & 255) * k, lin(hex & 255) * k];
/** mean linear value of each neutral bark slot (the tint compensates so a limb keeps its ramp colour) */
const SLOT_GAIN: Record<number, number> = { [BARK.FURROW]: 1 / 0.3, [BARK.PLATE]: 1 / 0.32, [BARK.RING]: 1 / 0.32, [BARK.STEM]: 1 / 0.48, [BARK.FIBRE]: 1 / 0.6, [BARK.FLESH]: 1 / 0.48, [BARK.SMOOTH]: 1 / 0.6, [BARK.SCALE]: 1 / 0.3 };
export { SLOT_GAIN };

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
  /** a triangle wound so its front faces along its first vertex's normal */
  triN(a: number, b: number, c: number) {
    const P = this.P, N = this.N;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
    const d = (uy * wz - uz * wy) * N[a * 3] + (uz * wx - ux * wz) * N[a * 3 + 1] + (ux * wy - uy * wx) * N[a * 3 + 2];
    if (d < 0) this.I.push(a, c, b); else this.I.push(a, b, c);
  }
  quadN(a: number, b: number, c: number, d: number) { this.triN(a, b, c); this.triN(a, c, d); }
  /** override one component of a vertex's aW (0 sway, 1 branch, 2 flutter / weight, 3 phase) or its kind */
  setW(i: number, c: number, v: number) { this.W[i * 4 + c] = v; }
  setKind(i: number, k: number) { this.A[i * 4 + 3] = k; }
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

/** a faceted berry / bead / fruit: a low, slightly irregular polyhedron with flat facets (no smooth spheres) */
function sphere(g: Geo, c: V3, r: number, rect: Rect, seg = 8, rings = 5, sq = 1) {
  const P: V3[][] = [];
  for (let j = 0; j <= rings; j++) {
    const th = (j / rings) * Math.PI, y = Math.cos(th), s = Math.sin(th), row: V3[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU + (j & 1) * (Math.PI / seg), k = j === 0 || j === rings ? 1 : 0.9 + (((i * 7 + j * 13) % 5) / 5) * 0.18;
      row.push([c[0] + Math.cos(a) * s * r * k, c[1] + y * r * sq * (j === 0 ? 1.08 : 1), c[2] + Math.sin(a) * s * r * k]);
    }
    P.push(row);
  }
  facetGrid(g, P, rect, c);
}
/** emit a grid of points as flat-shaded quads (each facet its own normal) */
function facetGrid(g: Geo, P: V3[][], rect: Rect, ctr: V3) {
  const rows = P.length - 1, cols = P[0].length - 1;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const a = P[j][i], b = P[j][i + 1], c = P[j + 1][i + 1], d = P[j + 1][i];
    // both triangles' normals summed: a facet that closes to a point at a pole still gets a true normal
    const nn = vadd(vcross(vsub(d, a), vsub(c, a)), vcross(vsub(c, a), vsub(b, a)));
    if (vlen(nn) < 1e-12) continue;
    // outward: away from the centre of the shape, wound so the outside is the front face
    const mid: V3 = [(a[0] + c[0]) / 2 - ctr[0], (a[1] + c[1]) / 2 - ctr[1], (a[2] + c[2]) / 2 - ctr[2]], inward = vdot(nn, mid) < 0;
    const n = vnrm(inward ? vmul(nn, -1) : nn);
    const u0 = rect.u0 + rect.du * (i / cols), u1 = rect.u0 + rect.du * ((i + 1) / cols), v0 = rect.v0 + rect.dv * (j / rows), v1 = rect.v0 + rect.dv * ((j + 1) / rows);
    const q = [g.v(a, n, u0, v0, 0.2), g.v(b, n, u1, v0, 0.2), g.v(c, n, u1, v1, 0.2), g.v(d, n, u0, v1, 0.2)];
    if (inward) g.quad(q[0], q[1], q[2], q[3]); else g.quad(q[0], q[3], q[2], q[1]);
  }
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
const ampOf = (a: number | undefined) => 0.46 + 0.62 * Math.pow(Math.max(0, Math.min(1, ((a ?? 0.6) - 0.05) / 0.55)), 0.9);
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
    // the finest twigs: dropped on the light mesh, kept up close (cheap, three-sided) so no leaf or fruit floats
    const fine = crowned && isBark && r0 < (sp.arch === 'shrub' ? 0.03 : 0.022);
    if (fine && L1) continue;
    if (L1 && !crowned && r0 < 0.01 && pts.length > 6) continue;
    // merge short steps on thin limbs
    let P2 = pts, R2 = rad;
    if (L1 && !isBark && r0 < 0.012) continue;
    const stepK = fine ? (sp.arch === 'shrub' ? 4 : 3) : L1 ? (r0 < 0.08 ? (pts.length > 12 ? 4 : 3) : 2) : r0 < 0.05 || sp.arch === 'shrub' ? (pts.length > 16 ? 3 : 2) : 1;
    if (pts.length > 3 && stepK > 1) { P2 = []; R2 = []; for (let k = 0; k < pts.length; k += stepK) { P2.push(pts[k]); R2.push(rad[k]); } if ((pts.length - 1) % stepK) { P2.push(pts[pts.length - 1]); R2.push(rad[rad.length - 1]); } }
    // a tree's trunk is sculpted (buttresses, twist, ridged bark, knots, a hollow) and sits in a soil collar; big
    // limbs swell into a collar where they leave their parent; roots sink into little mounds of earth
    const base0 = l0.ramp[Math.min(l0.ramp.length - 1, 3)];
    if (tree && isBark && pts[0][1] < 0.08 && pts[pts.length - 1][1] - pts[0][1] > 0.6 && r0 > 0.045) {
      const st = trunkStyle(sp, !!l0.ring), col = linHex(base0, ampOf(amb) * SLOT_GAIN[st.slot] * 0.95);
      g.kind = KIND.BARK; g.pivot = [0, 0, 0]; g.phase = r.next(); g.col = col;
      const T = sculptTrunk(g, pts, rad, st, lod, col, tex, r);
      soilCollar(g, pts[0], rad[0] * (1 + st.flare * 0.5), r, lod);
      if (!L1) trunkLife(g, tex, sp, T, st, col, r);
      continue;
    }
    if (isBark && crowned && !fine && pts[0][1] > 0.1 && r0 > 0.016 && P2.length > 1) {
      P2 = [P2[0], vadd(P2[0], vmul(vsub(P2[1], P2[0]), 0.2)), ...P2.slice(1)]; R2 = [R2[0] * 1.42, R2[0] * 1.12, ...R2.slice(1)];
    }
    const rootEnd = tree && isBark && !L1 && pts[pts.length - 1][1] < 0.03 && pts[0][1] > pts[pts.length - 1][1] + 0.02;
    const slot = l0.ring ? BARK.RING : isBark ? ((l0.ridge ?? 0) >= 3 ? (sp.trunk & 1 ? BARK.PLATE : BARK.FURROW) : (l0.ridge ?? 0) >= 2 ? BARK.FURROW : sp.arch === 'coral' ? BARK.FLESH : BARK.STEM) : (l0.ridge ?? 0) >= 3 ? BARK.FIBRE : BARK.STEM;
    const fslot = sp.arch === 'fungus' && isBark ? BARK.FIBRE : slot;
    const green = !isBark || sp.arch === 'coral';
    const rm = Math.max(...R2), sides = fine ? 3 : sp.arch === 'shrub' ? (L1 ? 3 : rm > 0.035 ? 5 : 3) : L1 ? (rm > 0.07 ? 6 : rm > 0.035 && !green ? 4 : 3) : rm > 0.09 ? 8 : rm > 0.045 ? 6 : rm > 0.022 && !(green && rm < 0.04) ? 4 : 3;
    const base = l0.ramp[Math.min(l0.ramp.length - 1, 3)], ao = ampOf(amb);
    g.col = linHex(base, ao * SLOT_GAIN[fslot] * (isBark ? 0.95 : 1));
    g.kind = isBark && sp.arch !== 'coral' && sp.arch !== 'fungus' ? KIND.BARK : KIND.STEM; g.pivot = [0, 0, 0]; g.phase = r.next();
    tube(g, P2, R2, fslot, sides, rm > 0.012);
    if (rootEnd) soilCollar(g, pts[pts.length - 1], Math.max(0.02, rad[rad.length - 1] * 1.4), r, 1);
  }

  const parts: Record<string, number> = { limbs: g.tris };
  // ---- leaves: individual cards. Crowns keep every other leaf, grown larger (the same cover, half the cards)
  // a leaf budget per LOD: thinned crowns grow their remaining leaves so the cover stays the same
  const crown3 = tree || sp.arch === 'shrub' || sp.arch === 'umbrella';
  let nLeaf = 0; for (const l of P.leaves) if (!l.skip3d && l.kind !== K.ACC) nLeaf++;
  const budget = crown3 ? (sp.arch === 'shrub' ? (L1 ? 60 : 165) : L1 ? 260 : 1400) : L1 ? 40 : 400;
  const thin = Math.max(1, Math.round(nLeaf / budget)), grow = thin > 1 ? Math.sqrt(thin) * 0.9 : 1;
  let li = 0, vi = seed % 3;
  for (const l of P.leaves) {
    if (l.skip3d) continue;
    const petal = l.kind === K.ACC;
    if (!petal && thin > 1 && (li++ % thin)) continue;
    const needle = l.shape === 'needle' && !petal;
    const rect = needle ? tex.needles(l.ramp, li & 1) : tex.leaf(l.shape, l.ramp, { vein: l.vein, lat: l.lat, teeth: l.teeth, petal, var: petal ? 0 : (vi++ % 3) });
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
  const orbThin = Math.max(1, Math.round(P.orbs.length / (sp.arch === 'shrub' ? (L1 ? 3 : 6) : L1 ? 8 : 40)));
  for (const o of P.orbs) {
    if (orbThin > 1 && !o.ribs && (oi++ % orbThin)) continue;
    const c = M(o.c), rr = (o.r / PXM) * (orbThin > 1 ? Math.min(1.5, Math.pow(orbThin, 0.3)) : 1), ao = ampOf(o.amb);
    g.phase = r.next(); g.pivot = c;
    if (o.ribs) {
      // a ribbed lantern pod: lathe with its own painted skin
      const rect = tex.pod(o.ramp, o.ribs * 2, o.glow !== undefined);
      g.kind = o.glow !== undefined ? KIND.GLOW : KIND.SOLID; g.col = [ao, ao, ao];
      // a lantern pod: six flat facets, a broad shoulder, a pointed tip and a short neck at the stalk
      const sq = o.sq ?? 1, sides = L1 ? 5 : 6, prof: [number, number][] = [[0.15, -1.0], [0.62, -0.72], [0.96, -0.15], [0.84, 0.42], [0.42, 0.85], [0.05, 1.12]];
      const Pg: V3[][] = prof.map(([pr, py], j) => Array.from({ length: sides + 1 }, (_, i) => { const a = (i / sides) * TAU + (j & 1) * 0.25; return [c[0] + Math.cos(a) * pr * rr, c[1] + py * rr * sq, c[2] + Math.sin(a) * pr * rr] as V3; }));
      facetGrid(g, Pg, rect, c);
    } else {
      g.kind = o.glow !== undefined ? KIND.GLOW : KIND.SOLID;
      g.col = linHex(o.ramp[Math.min(o.ramp.length - 1, 4)], ao * 1.35);
      if (L1) sphere(g, c, rr, spk, rr > 0.08 ? 6 : 4, rr > 0.08 ? 3 : 2, o.sq ?? 1);
      else sphere(g, c, rr, spk, rr > 0.08 ? 8 : rr > 0.04 ? 6 : 5, rr > 0.08 ? 4 : rr > 0.04 ? 3 : 2, o.sq ?? 1);
    }
  }

  // ---- mushroom caps: thick-rimmed caps with warts, gill fins beneath, rings and volvas on some species
  const msty = new Rand(sp.id * 61 + 5), ringed = msty.chance(0.55), volva = msty.chance(0.35);
  for (const o of P.caps) {
    const c = M(o.c), rr = o.r / PXM, hr = o.hr / PXM, ao = ampOf(o.amb);
    mushroom(g, tex, [c[0], 0, c[2]], c, rr, hr, { ramp: o.ramp, gill: o.gill, stem: o.gill, spots: o.spots, spotCol: o.spotCol, button: hr > rr * 0.72, glow: sp.glow, ring: ringed, volva, ao }, r, lod, false);
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
  const G = rampFor(mixHex(sp.leaf, 0x5e7e62, 0.5)), A = rampFor(sp.accent);
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
      // a flower at the apex: cupped petals, stamens, a pistil
      const pr = tex.leaf('petal', A, { petal: true, var: k }), top: V3 = [x, th - 0.012, z];
      flower(g, tex, top, UPV, { n: 9, len: w * 0.42, wid: w * 0.14, rect: pr, cup: 0.75, layers: 2, stamens: 12, anther: rampNamed('gold'), pistil: rampNamed('straw'), receptacle: G }, r, 0);
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

// ------------------------------------------------------------------------------------------------ ground cover
export type GroundForm = 'grass' | 'tall' | 'dry' | 'sedge' | 'clover' | 'flower' | 'fern' | 'mush';

/** a tussock: blades rising from a small crown, leaning out, arching over; seed heads on the tall ones */
function tussock3d(g: Geo, r: Rand, tex: FloraTex, pal: Palette, kind: 'grass' | 'tall' | 'dry' | 'sedge', size: number) {
  const g0 = kind === 'dry' ? mixHex(pal.grassDry, pal.grass, 0.25) : kind === 'sedge' ? mixHex(pal.grass, 0x3a6a4a, 0.45) : mixHex(pal.grass, 0x6e9a3a, 0.3);
  const rp = (c: number) => rampFor(c, 7);
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

/** a meadow flower: basal leaves, 1-3 stems, modelled heads tinted per instance (daisy, nodding bell, spike of
 *  florets opening from the bottom, cup), buds on the side stems */
function flower3d(g: Geo, r: Rand, tex: FloraTex, pal: Palette, form: number) {
  const G = rampFor(mixHex(pal.grass, 0x3e7a34, 0.4)), leaf = tex.blades([G], null, 1, { wide: true, var: 3 });
  const paper = rampNamed('paper'), petal = tex.leaf(form === 0 ? 'strap' : form === 1 ? 'round' : 'petal', paper, { petal: true, var: form % 3 }), sep = tex.leaf('lance', G, { var: 2 });
  g.kind = KIND.LEAF; g.pivot = [0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const a = r.range(0, TAU), L = r.range(0.08, 0.14), pts: V3[] = [];
    for (let j = 0; j <= 3; j++) { const t = j / 3; pts.push([Math.cos(a) * L * t, L * 0.6 * t - L * 0.3 * t * t, Math.sin(a) * L * t]); }
    g.col = [0.85, 0.85, 0.85]; g.phase = r.next();
    ribbonStrip(g, pts, pts.map(() => 0.012), leaf, { crease: 0.2, flutLen: true });
  }
  const ns = r.int(1, 3);
  for (let s = 0; s < ns; s++) {
    const a = r.range(0, TAU), H = r.range(0.2, 0.36) * (s ? 0.85 : 1), lean = r.range(0, 0.15);
    const top: V3 = [Math.cos(a) * lean * H, H, Math.sin(a) * lean * H], bud = s > 0 && r.chance(0.45) ? r.range(0.6, 1) : 0;
    g.kind = KIND.STEM; g.col = linHex(G[3], 2); g.phase = r.next(); g.pivot = [0, 0, 0];
    const bend: V3 = form === 1 ? vadd(top, [Math.cos(a) * 0.03, -0.02, Math.sin(a) * 0.03]) : top;
    tube(g, [[0, 0, 0], vmul(top, 0.5), top, ...(form === 1 ? [bend] : [])], form === 1 ? [0.004, 0.0035, 0.003, 0.0028] : [0.004, 0.0035, 0.003], BARK.STEM, 3, false);
    const ax = vnrm([Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3]);
    if (form === 0) flower(g, tex, top, ax, { n: 13, len: 0.03, wid: 0.0055, rect: petal, tinted: true, cup: 0.12, layers: 1, receptacle: rampNamed('ochre'), bud }, r, 1);
    else if (form === 1) flower(g, tex, bend, [Math.cos(a) * 0.5, -1, Math.sin(a) * 0.5], { n: 5, len: 0.036, wid: 0.012, rect: petal, tinted: true, cup: 1.25, layers: 1, reflex: 0.5, bud }, r, 1);
    else if (form === 2) {
      // a spike: florets up the stem, open below, buds toward the tip
      g.kind = KIND.TINT; g.pivot = top; g.col = [1, 1, 1];
      for (let p = 0; p < 9; p++) { const b = p * 2.4, y = p * 0.012, op = 1 - p / 9, d: V3 = vnrm([Math.cos(b) * op, 0.6 + (1 - op) * 1.2, Math.sin(b) * op]); leafCard(g, vadd(top, [0, y, 0]), d, vnrm([-Math.cos(b) * 0.6, 1, -Math.sin(b) * 0.6]), 0.012 + op * 0.012, 0.006 + op * 0.004, petal, 0.2, 0, null); }
    } else flower(g, tex, top, ax, { n: 6, len: 0.032, wid: 0.014, rect: petal, tinted: true, cup: 0.95, layers: 2, sepals: sep, receptacle: G, bud }, r, 1);
  }
}

/** a low mat of clover: trefoils on short stalks */
function clover3d(g: Geo, r: Rand, tex: FloraTex, pal: Palette) {
  const G = rampFor(mixHex(pal.grass, 0x4a8a3a, 0.45), 7);
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
  const c = mixHex(pal.foliage[r.int(0, pal.foliage.length - 1)], 0x3e7a34, 0.55), G = rampFor(c, 7);
  const rect = tex.frond([G, rampFor(mixHex(c, 0xb09a50, 0.2), 7)], G, { len: 0.32, hw: 0.07, lmax: 0.075, fwd: 0.45, wr: 0.32, start: 0.12, shape: 'lobed', lobes: true, var: 2 });
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

/** a cluster of small mushrooms at different stages: a button, opening caps with gill fins, a ring on some */
function mush3d(g: Geo, r: Rand, tex: FloraTex, pal: Palette) {
  const C = rampFor(r.pick(pal.fungus)), Gi = rampNamed(r.pick(['bone', 'paper', 'sand'] as const)), spot = rampNamed('paper')[5];
  const ringed = r.chance(0.5), spots = r.chance(0.5) ? 2 : 0;
  for (let k = r.int(1, 3); k > 0; k--) {
    const x = r.range(-0.07, 0.07), z = r.range(-0.07, 0.07), button = k === 1 && r.chance(0.5), rr = button ? r.range(0.016, 0.024) : r.range(0.024, 0.05), h = button ? rr * 0.9 : r.range(0.045, 0.11);
    mushroom(g, tex, [x, 0, z], [x + r.range(-0.006, 0.006), h, z], rr, rr * (button ? 0.85 : r.range(0.45, 0.62)), { ramp: C, gill: Gi, stem: Gi, spots, spotCol: spot, button, glow: false, ring: ringed, volva: false }, r, 0);
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
/** building blocks shared with the hero modeller (floraHero) */
export { vadd, vsub, vmul, vdot, vcross, vlen, vnrm, vperp, linHex, ribbonStrip, leafCard, sphere, facetGrid, disc, lathe, cumulative, ampOf };
