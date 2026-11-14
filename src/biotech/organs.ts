// Hand-modelled function organs for the gene lab's card windows: each functional gene shows the part it grows
// (spade claws, a ribbed ore gizzard with pellets in it, spinnerets trailing silk, quartz points on a coral crust,
// an udder, a resin-weeping log with its cup ...), a few primitives each, on a small texture painted in master-
// palette ramps: four quadrants (body, accent, metal or mineral, glow), each banded in planar steps lit from above
// with a single highlight row. Alpha under 255 marks the glowing parts (the lab's symbol material lights them).
import * as THREE from 'three';
import { RAMPS, type RampName } from '../art/palette';

type Geo = THREE.BufferGeometry;
/** texture quadrants: 0 body, 1 accent, 2 mineral/metal, 3 glow */
type Q = 0 | 1 | 2 | 3;
interface Look { q: [RampName, RampName, RampName, RampName]; mark?: 'stripe' | 'rib' | 'scale' | 'fleck' }

const sph = (r: number, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 10, 8); g.scale(sx, sy, sz); return g; };
const ico = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
const cyl = (r0: number, r1: number, h: number, n = 8, open = false) => new THREE.CylinderGeometry(r1, r0, h, n, 1, open);
const cone = (r: number, h: number, n = 6) => new THREE.ConeGeometry(r, h, n);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const tor = (R: number, r: number, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, 6, 14, arc);
function at(g: Geo, x: number, y: number, z: number, s = 1, rx = 0, ry = 0, rz = 0): Geo { g.scale(s, s, s); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; }
/** a curved horn or claw: a bent cone along an arc */
function claw(len: number, r: number, bend: number): Geo {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8, a = t * bend; pts.push(new THREE.Vector3(0, Math.sin(a) * len / Math.max(0.01, bend), (1 - Math.cos(a)) * len / Math.max(0.01, bend))); }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, r, 5);
  // taper to a point
  const P = tube.attributes.position, n = 9, ring = 6;
  for (let i = 0; i < P.count; i++) {
    const seg = Math.floor(i / ring) / n, c = pts[Math.min(8, Math.round(seg * 8))];
    const k = 1 - seg * 0.92; P.setXYZ(i, c.x + (P.getX(i) - c.x) * k, c.y + (P.getY(i) - c.y) * k, c.z + (P.getZ(i) - c.z) * k);
  }
  tube.computeVertexNormals();
  return tube;
}
/** merge parts, remapping each part's uv into its texture quadrant */
function merge(parts: [Geo, Q][]): Geo {
  const pos: number[] = [], uv: number[] = [];
  for (const [p, q] of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const P = g.attributes.position, U = g.attributes.uv;
    const u0 = (q % 2) * 0.5, v0 = Math.floor(q / 2) * 0.5;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); uv.push(u0 + 0.02 + (U ? (U.getX(i) % 1) : 0) * 0.46, v0 + 0.02 + (U ? (U.getY(i) % 1) : 0) * 0.46); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // fit to the unit the card windows expect (about 1.6 across)
  g.computeBoundingBox(); const b = g.boundingBox!, c = b.getCenter(new THREE.Vector3()), s = 1.6 / Math.max(0.01, b.getSize(new THREE.Vector3()).length() * 0.62);
  g.translate(-c.x, -c.y, -c.z); g.scale(s, s, s);
  return g;
}
/** a 64 px texture, four quadrants of planar ramp bands */
function tex(L: Look, seed: number): THREE.DataTexture {
  const S = 64, d = new Uint8Array(S * S * 4);
  for (let qq = 0; qq < 4; qq++) {
    const R = RAMPS[L.q[qq]] as readonly number[], n = R.length, glow = qq === 3;
    const x0 = (qq % 2) * 32, y0 = Math.floor(qq / 2) * 32;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      // bands: dark at the bottom, lit at the top (texture v runs up); a highlight row near the top of each band
      const band = Math.floor((y / 32) * 4);
      let step = clampi(Math.round(n * 0.22 + band * (n * 0.18)), 1, n - 2);
      if (y % 8 === 7) step = Math.min(n - 1, step + 1);
      const m = L.mark;
      if (!glow && m === 'stripe' && ((x + ((seed + y) >> 2)) % 9 === 0)) step = Math.max(0, step - 2);
      if (!glow && m === 'rib' && y % 6 === 0) step = Math.max(0, step - 2);
      if (!glow && m === 'scale' && ((x + (Math.floor(y / 4) % 2) * 3) % 6 === 0) && y % 4 !== 0) step = Math.max(0, step - 1);
      if (!glow && m === 'fleck' && ((x * 7 + y * 13 + seed) % 23 === 0)) step = Math.min(n - 1, step + 2);
      const c = R[step], i = ((y0 + y) * S + x0 + x) * 4;
      d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = glow ? 200 : 255;
    }
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}
const clampi = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const LOOK: Record<string, Look> = {
  dig_claws: { q: ['fur', 'bone', 'soil', 'glowAmber'], mark: 'stripe' }, tunnel_snout: { q: ['ochre', 'flesh', 'clay', 'glowAmber'], mark: 'rib' },
  mound_glands: { q: ['straw', 'ichor', 'clay', 'glowAmber'] }, water_finder: { q: ['hide', 'ink', 'water', 'glowTeal'] },
  ore_gizzard: { q: ['rust', 'ichor', 'steel', 'glowAmber'], mark: 'rib' }, silica_crop: { q: ['flesh', 'bone', 'water', 'glowTeal'] },
  silk_glands: { q: ['straw', 'olive', 'paper', 'glowTeal'], mark: 'stripe' }, oil_glands: { q: ['ochre', 'hide', 'brass', 'glowAmber'], mark: 'fleck' },
  crystal_coral: { q: ['coral', 'plum', 'sky', 'glowTeal'], mark: 'fleck' }, milk_glands: { q: ['flesh', 'bone', 'steel', 'glowAmber'] },
  fleece: { q: ['straw', 'bone', 'fur', 'glowAmber'], mark: 'scale' }, resin_bark: { q: ['fur', 'soil', 'steel', 'glowAmber'], mark: 'stripe' },
  metal_root: { q: ['rust', 'moss', 'steel', 'glowTeal'], mark: 'rib' }, algae_bloom: { q: ['ichor', 'moss', 'water', 'glowTeal'], mark: 'fleck' },
  fruit_set: { q: ['fur', 'moss', 'coral', 'glowAmber'] }, nitro_nodules: { q: ['soil', 'plum', 'clay', 'glowAmber'], mark: 'fleck' },
  desert_greener: { q: ['sage', 'moss', 'sand', 'glowTeal'], mark: 'stripe' }, wetland_maker: { q: ['hide', 'ochre', 'soil', 'glowTeal'], mark: 'scale' },
  soil_binder: { q: ['flesh', 'plum', 'soil', 'glowTeal'], mark: 'rib' }, pollinator: { q: ['ochre', 'straw', 'ink', 'glowAmber'], mark: 'stripe' },
  decomposer: { q: ['soil', 'flesh', 'clay', 'glowAmber'], mark: 'rib' }, pest_eater: { q: ['hide', 'flesh', 'ink', 'glowAmber'] },
  hauler_back: { q: ['hide', 'brass', 'clay', 'glowAmber'], mark: 'stripe' }, operator_hands: { q: ['flesh', 'hide', 'steel', 'glowAmber'] },
  guard_instinct: { q: ['fur', 'bone', 'stone', 'glowAmber'], mark: 'stripe' }, soldier_caste: { q: ['basalt', 'ichor', 'bone', 'stampRed'], mark: 'scale' },
  docility: { q: ['fur', 'bone', 'hide', 'glowAmber'] }, gene_lock: { q: ['violet', 'stampRed', 'steel', 'glowTeal'] },
  sterile: { q: ['bone', 'slate', 'steel', 'glowTeal'] }, growth_accel: { q: ['plum', 'coral', 'flesh', 'glowTeal'], mark: 'fleck' },
};

function parts(id: string): [Geo, Q][] {
  switch (id) {
    case 'dig_claws': { const P: [Geo, Q][] = [[at(sph(0.45, 1.1, 0.55, 0.9), 0, 0.2, 0), 0], [at(cyl(0.3, 0.38, 0.5), 0, 0.6, -0.15, 1, -0.4), 0]]; for (let i = 0; i < 5; i++) P.push([at(claw(0.75, 0.07, 1.4), -0.32 + i * 0.16, 0.05, 0.25, 1, -0.2, (i - 2) * 0.08), 1]); return P; }
    case 'tunnel_snout': { const P: [Geo, Q][] = []; for (let i = 0; i < 4; i++) P.push([at(cyl(0.42 - i * 0.08, 0.36 - i * 0.08, 0.26), 0, i * 0.24, 0), 0]); for (let k = 0; k < 11; k++) { const a = (k / 11) * Math.PI * 2; P.push([at(cone(0.035, 0.28), Math.cos(a) * 0.14, 1.05, Math.sin(a) * 0.14, 1, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6), 1]); } return P; }
    case 'mound_glands': return [[at(sph(0.32, 1, 1.2, 1), -0.24, 0, 0), 0], [at(sph(0.3, 1, 1.15, 1), 0.24, 0.02, 0), 0], [at(claw(0.5, 0.06, 1.2), -0.14, 0.42, 0.1, 1, 0, 0, 0.5), 1], [at(claw(0.5, 0.06, 1.2), 0.14, 0.42, 0.1, 1, 0, 0, -0.5), 1], [at(ico(0.16), 0, -0.45, 0.1), 2]];
    case 'water_finder': { const P: [Geo, Q][] = [[at(sph(0.5, 1.4, 0.7, 0.8), 0, 0, 0), 0]]; for (let i = 0; i < 7; i++) P.push([at(sph(0.06), -0.5 + i * 0.16, -0.14, 0.37), 1]); P.push([at(sph(0.14, 1, 1.3, 1), 0.2, 0.75, 0), 3], [at(cone(0.14, 0.22, 8), 0.2, 0.98, 0), 3]); return P; }
    case 'ore_gizzard': { const P: [Geo, Q][] = []; for (let i = 0; i < 6; i++) { const t = i / 5, r = 0.32 + Math.sin(t * Math.PI) * 0.22; P.push([at(cyl(r, r * 0.96, 0.17, 10), 0, -0.45 + i * 0.18, 0), 0]); } P.push([at(tor(0.26, 0.06), 0, 0.62, 0, 1, Math.PI / 2), 1]); for (let k = 0; k < 7; k++) P.push([at(ico(0.09, 0), Math.cos(k * 2.4) * 0.5, -0.65 - (k % 3) * 0.12, Math.sin(k * 2.4) * 0.2 + 0.3), 2]); return P; }
    case 'silica_crop': { const P: [Geo, Q][] = [[at(sph(0.48, 1, 0.9, 1), 0, 0, 0), 0], [at(cyl(0.12, 0.16, 0.5), 0, 0.6, 0), 1]]; for (let k = 0; k < 9; k++) P.push([at(sph(0.08), Math.cos(k * 2.4) * 0.65, -0.3 + (k % 3) * 0.12, Math.sin(k * 2.4) * 0.65), 3]); return P; }
    case 'silk_glands': { const P: [Geo, Q][] = [[at(sph(0.42, 1, 1.25, 1), 0, 0.2, 0), 0]]; for (let k = 0; k < 6; k++) P.push([at(cyl(0.05, 0.04, 0.3), (k % 3 - 1) * 0.12, -0.4, (k < 3 ? -1 : 1) * 0.06, 1, 0.2), 1]); P.push([at(cyl(0.22, 0.22, 0.4, 12), 0.55, -0.7, 0, 1, 0, 0, Math.PI / 2), 2]); for (let k = 0; k < 3; k++) P.push([at(cyl(0.008, 0.008, 0.6, 3), 0.25 + k * 0.03, -0.62, 0, 1, 0, 0, 1.1), 2]); return P; }
    case 'oil_glands': { const P: [Geo, Q][] = []; for (let k = 0; k < 6; k++) P.push([at(ico(0.2 + (k % 3) * 0.04, 1), Math.cos(k) * 0.35, (k % 2) * 0.15, Math.sin(k) * 0.3), 0]); P.push([at(sph(0.13, 1, 1.25, 1), 0, -0.55, 0.1), 3], [at(cone(0.13, 0.2, 8), 0, -0.37, 0.1), 3]); return P; }
    case 'crystal_coral': { const P: [Geo, Q][] = [[at(sph(0.6, 1.3, 0.3, 1), 0, 0, 0), 0], [at(ico(0.2, 0), -0.5, 0.1, 0.3), 1]]; for (let k = 0; k < 6; k++) { const a = k * 1.1, r = 0.15 + (k % 3) * 0.12, h = 0.45 + (k % 3) * 0.2, tilt = (k % 3 - 1) * 0.35; P.push([at(cyl(0.08, 0.08, h, 6), Math.cos(a) * r, 0.12 + h / 2, Math.sin(a) * r, 1, tilt, 0, -tilt), 3], [at(cone(0.08, 0.12, 6), Math.cos(a) * r + Math.sin(-tilt) * (h + 0.06), 0.12 + h + 0.06, Math.sin(a) * r + Math.sin(tilt) * (h + 0.06), 1, tilt, 0, -tilt), 3]); } return P; }
    case 'milk_glands': { const P: [Geo, Q][] = [[at(sph(0.5, 1.2, 0.75, 1), 0, 0, 0), 0]]; for (let k = 0; k < 4; k++) P.push([at(cyl(0.06, 0.08, 0.3), (k % 2 ? 1 : -1) * 0.25, -0.45, (k < 2 ? 1 : -1) * 0.2), 1]); P.push([at(cyl(0.22, 0.26, 0.38, 10, true), 0.75, -0.6, 0), 2]); return P; }
    case 'fleece': { const P: [Geo, Q][] = []; for (let k = 0; k < 12; k++) { const a = k * 2.4, r = 0.2 + (k % 4) * 0.12; P.push([at(ico(0.2 + (k % 3) * 0.05, 1), Math.cos(a) * r, (k % 3) * 0.12, Math.sin(a) * r * 0.6), k % 5 ? 0 : 1]); } return P; }
    case 'resin_bark': { const P: [Geo, Q][] = [[at(cyl(0.34, 0.3, 1.4, 9), 0, 0, 0), 0]]; for (let k = 0; k < 3; k++) P.push([at(box(0.03, 0.22, 0.05), 0.27, 0.3 - k * 0.2, 0.18, 1, 0, 0, 0.8), 1], [at(sph(0.06, 1, 1.4, 1), 0.33, 0.18 - k * 0.2, 0.2), 3]); P.push([at(cyl(0.12, 0.14, 0.18, 10, true), 0.42, -0.55, 0.22), 2], [at(cyl(0.11, 0.11, 0.06, 10), 0.42, -0.6, 0.22), 3]); return P; }
    case 'metal_root': { const P: [Geo, Q][] = [[at(cone(0.28, 0.9, 7), 0, -0.3, 0, 1, Math.PI), 0], [at(sph(0.3, 1, 0.6, 1), 0, 0.15, 0), 2]]; for (let k = 0; k < 4; k++) P.push([at(sph(0.3, 0.45, 0.06, 1), Math.cos(k * 1.57) * 0.35, 0.5, Math.sin(k * 1.57) * 0.35, 1, 0.5 * Math.sin(k * 1.57), -k * 1.57, 0.5 * Math.cos(k * 1.57)), k % 2 ? 1 : 2]); return P; }
    case 'algae_bloom': { const P: [Geo, Q][] = [[at(cyl(0.75, 0.7, 0.12, 12), 0, 0, 0), 0]]; for (let k = 0; k < 8; k++) P.push([at(ico(0.13, 1), Math.cos(k * 2.4) * 0.45, 0.08, Math.sin(k * 2.4) * 0.45, 1), 1]); for (let k = 0; k < 6; k++) P.push([at(sph(0.06), Math.cos(k * 1.9) * 0.3, 0.1 + (k % 2) * 0.06, Math.sin(k * 1.9) * 0.3), 3]); return P; }
    case 'fruit_set': { const P: [Geo, Q][] = [[at(cyl(0.05, 0.08, 1.2, 6), 0, 0, 0, 1, 0, 0, 0.5), 0]]; for (let k = 0; k < 9; k++) P.push([at(sph(0.14 + (k % 3) * 0.02), -0.3 + (k % 5) * 0.16, 0.05 - Math.floor(k / 3) * 0.17, (k % 2) * 0.12), 2]); for (let k = 0; k < 4; k++) P.push([at(sph(0.2, 1, 0.12, 0.5), 0.25 - k * 0.2, 0.45 - k * 0.08, 0.1, 1, 0, k, 0.4), 1]); return P; }
    case 'nitro_nodules': { const P: [Geo, Q][] = [[at(cyl(0.07, 0.12, 1.2, 6), 0, 0, 0), 0]]; for (let k = 0; k < 4; k++) P.push([at(cyl(0.03, 0.05, 0.7, 5), 0, -0.2 - k * 0.1, 0, 1, 0, k * 1.6, 0.9), 0]); for (let k = 0; k < 14; k++) P.push([at(sph(0.06 + (k % 3) * 0.015), Math.cos(k * 1.7) * (0.15 + (k % 4) * 0.08), -0.15 - (k % 5) * 0.1, Math.sin(k * 1.7) * (0.15 + (k % 4) * 0.08)), 1]); return P; }
    case 'desert_greener': { const P: [Geo, Q][] = []; for (let k = 0; k < 9; k++) { const a = k * 0.7, l = 0.5 + (k % 3) * 0.15; P.push([at(cone(0.12, l, 5), Math.cos(a) * l * 0.4, l * 0.35, Math.sin(a) * l * 0.4, 1, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9), k % 4 ? 0 : 1]); } for (let k = 0; k < 5; k++) P.push([at(sph(0.05), Math.cos(k * 1.3) * 0.35, 0.5, Math.sin(k * 1.3) * 0.35), 3]); P.push([at(sph(0.3, 1.4, 0.25, 1.4), 0, -0.05, 0), 2]); return P; }
    case 'wetland_maker': return [[at(sph(0.45, 0.9, 0.18, 1.5), 0, 0, -0.3), 0], [at(cyl(0.16, 0.22, 0.5), 0, 0, 0.55, 1, Math.PI / 2), 0], [at(box(0.1, 0.24, 0.06), -0.06, 0.3, 0.9), 1], [at(box(0.1, 0.24, 0.06), 0.06, 0.3, 0.9), 1], [at(ico(0.12, 0), 0.4, 0.15, 0.6), 2]];
    case 'soil_binder': return [[at(tor(0.42, 0.13, Math.PI * 1.7), 0, 0, 0, 1, Math.PI / 2), 0], [at(sph(0.15), 0.42, 0, 0), 1], [at(sph(0.5, 1.2, 0.08, 1.2), 0, -0.18, 0), 3], [at(ico(0.08), -0.3, -0.12, 0.45), 2]];
    case 'pollinator': { const P: [Geo, Q][] = [[at(ico(0.36, 2), 0, 0.2, 0), 0], [at(sph(0.3, 1, 1, 1.4), 0, 0.15, -0.5), 2]]; for (const s of [-1, 1]) P.push([at(cyl(0.03, 0.03, 0.6, 4), s * 0.25, -0.2, 0, 1, 0, 0, s * 0.3), 2], [at(sph(0.12, 1, 1.3, 1), s * 0.33, -0.4, 0), 1]); return P; }
    case 'decomposer': return [[new THREE.TorusKnotGeometry(0.42, 0.12, 64, 7, 2, 3), 0], [at(tor(0.16, 0.07), 0, 0.55, 0.4, 1, 0.3), 1]];
    case 'pest_eater': return [[at(sph(0.4, 1, 0.9, 1.1), 0, 0, 0), 0], [at(cone(0.16, 0.8, 8), 0, -0.05, 0.7, 1, Math.PI / 2), 1], [at(cone(0.16, 0.45, 5), -0.22, 0.45, -0.05, 1, 0, 0, 0.35), 0], [at(cone(0.16, 0.45, 5), 0.22, 0.45, -0.05, 1, 0, 0, -0.35), 0], [at(sph(0.05), 0, -0.06, 1.1), 2]];
    case 'hauler_back': return [[at(box(1.0, 0.24, 0.7), 0, 0.2, 0), 0], [at(sph(0.5, 1, 0.35, 0.7), 0, 0, 0), 0], [at(box(0.3, 0.42, 0.5), -0.62, -0.1, 0), 1], [at(box(0.3, 0.42, 0.5), 0.62, -0.1, 0), 1], [at(box(1.5, 0.04, 0.08), 0, 0.33, 0), 2]];
    case 'operator_hands': { const P: [Geo, Q][] = [[at(box(0.5, 0.55, 0.16), 0, 0, 0), 0], [at(cyl(0.12, 0.14, 0.4), 0, -0.45, 0), 1]]; for (let k = 0; k < 4; k++) P.push([at(cyl(0.05, 0.06, 0.42 - Math.abs(k - 1.5) * 0.05, 5), -0.18 + k * 0.12, 0.47, 0, 1, 0.2), 0]); P.push([at(cyl(0.055, 0.065, 0.32, 5), 0.32, 0.05, 0.05, 1, 0, 0, -0.9), 0], [at(box(0.06, 0.4, 0.06), 0.55, 0.5, 0.1, 1, 0, 0, 0.3), 2]); return P; }
    case 'guard_instinct': { const P: [Geo, Q][] = [[at(sph(0.6, 1.4, 0.4, 0.7), 0, 0, 0), 0]]; for (let k = 0; k < 9; k++) P.push([at(cone(0.06, 0.32 + Math.sin((k / 8) * Math.PI) * 0.18, 4), -0.7 + k * 0.175, 0.3, 0, 1, 0, 0, (k - 4) * -0.06), 1]); return P; }
    case 'soldier_caste': return [[at(sph(0.5, 1, 0.85, 1.1), 0, 0, 0), 0], [at(claw(0.6, 0.08, 1.3), -0.2, -0.15, 0.45, 1, 0, -0.3, 0.3), 2], [at(claw(0.6, 0.08, 1.3), 0.2, -0.15, 0.45, 1, 0, 0.3, -0.3), 2], [at(box(0.04, 0.3, 0.02), 0.2, 0.25, 0.45, 1, 0, 0, 0.6), 3], [at(sph(0.08), -0.25, 0.15, 0.42), 1], [at(sph(0.08), 0.25, 0.15, 0.42), 1]];
    case 'docility': return [[at(sph(0.5), 0, 0, 0), 0], [at(sph(0.3, 0.6, 1.4, 0.3), -0.5, -0.1, 0, 1, 0, 0, 0.5), 2], [at(sph(0.3, 0.6, 1.4, 0.3), 0.5, -0.1, 0, 1, 0, 0, -0.5), 2], [at(sph(0.14, 0.9, 1.6, 0.4), 0, 0.22, 0.42), 1], [at(sph(0.2, 1, 0.8, 0.9), 0, -0.25, 0.4), 1]];
    case 'gene_lock': { const P: [Geo, Q][] = []; for (let i = 0; i < 12; i++) { const t = i / 11, a = t * Math.PI * 2.5, y = (t - 0.5) * 1.4; P.push([at(sph(0.08), Math.cos(a) * 0.3, y, Math.sin(a) * 0.3), 0], [at(sph(0.08), -Math.cos(a) * 0.3, y, -Math.sin(a) * 0.3), 0], [at(cyl(0.025, 0.025, 0.6, 4), 0, y, 0, 1, 0, -a, Math.PI / 2), 2]); } P.push([at(cyl(0.42, 0.42, 0.16, 12, true), 0, 0.05, 0), 1], [at(cyl(0.44, 0.44, 0.04, 12, true), 0, 0.15, 0), 3]); return P; }
    case 'sterile': return [[at(sph(0.42, 1, 1.3, 1), 0, 0, 0), 0], [at(tor(0.43, 0.06), 0, 0, 0, 1, Math.PI / 2), 1], [at(tor(0.43, 0.04), 0, 0, 0, 1, 0, 0, 0.0), 2]];
    case 'growth_accel': return [[at(sph(0.4), 0, -0.3, 0), 0], [at(sph(0.28), 0.3, 0.2, 0), 1], [at(sph(0.19), 0.45, 0.55, 0.05), 1], [at(sph(0.12), 0.5, 0.82, 0.1), 3], [at(cyl(0.06, 0.06, 0.4, 5), 0.17, 0, 0, 1, 0, 0, -0.6), 2]];
    default: return [[ico(0.5, 1), 0]];
  }
}

const CACHE = new Map<string, { geo: Geo; tex: THREE.DataTexture }>();
/** the organ model for a functional gene (cached; the lab disposes copies it no longer needs) */
export function bioSymbol(id: string): { geo: Geo; tex: THREE.DataTexture } {
  let c = CACHE.get(id);
  if (!c) { c = { geo: merge(parts(id)), tex: tex(LOOK[id] ?? { q: ['flesh', 'bone', 'steel', 'glowTeal'] }, id.length * 7) }; CACHE.set(id, c); }
  const t = c.tex.clone(); t.needsUpdate = true;
  return { geo: c.geo.clone(), tex: t };
}
