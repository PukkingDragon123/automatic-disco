// The sea floor's life: coral heads (staghorn thickets, table and brain corals, sea fans, tube sponges, anemones) on
// the reefs of the warm shallows, seagrass meadows over the sand, and kelp forests on the rocky ground of the cooler,
// deeper water, standing from the bed to the surface and laying their blades out on it. Hand-built faceted shapes in
// the master palette (flat planes, a lit tip step, the post pass outlines them), instanced, swaying in the current and
// the swell. At night the anemones and some corals glow. Also the seabed's harvest (dive.ts works it): ore nodules and
// crystal clusters on the floor, and the kelp itself (carbon), each node shrinking as it is taken.
import * as THREE from 'three';
import type { Region } from '../world/region';
import { B } from '../world/blockTex';
import { Rand, clamp, hash01 } from '../core/rand';
import { RAMPS, type RampName } from '../art/palette';
import { gbuf } from '../gfx/gbuf';

type V = [number, number, number];
const col = (r: RampName, i: number) => { const R = RAMPS[r] as readonly number[]; return new THREE.Color(R[clamp(Math.round(i), 0, R.length - 1)]); };

/** a faceted mesh builder: triangles with a colour, a sway weight (0 rooted .. 1 free) and a glow */
class GB {
  pos: number[] = []; colr: number[] = []; sway: number[] = []; glow: number[] = [];
  tri(a: V, b: V, c: V, k: THREE.Color, w: [number, number, number] = [0, 0, 0], g = 0) {
    for (const [p, ww] of [[a, w[0]], [b, w[1]], [c, w[2]]] as [V, number][]) { this.pos.push(...p); this.colr.push(k.r, k.g, k.b); this.sway.push(ww); this.glow.push(g); }
  }
  quad(a: V, b: V, c: V, d: V, k: THREE.Color, w: [number, number, number, number] = [0, 0, 0, 0], g = 0) { this.tri(a, b, c, k, [w[0], w[1], w[2]], g); this.tri(a, c, d, k, [w[0], w[2], w[3]], g); }
  /** a tapered prism from a to b: n sides, radii r0 -> r1, lit faces a step brighter than the shaded ones */
  prism(a: V, b: V, r0: number, r1: number, n: number, ramp: RampName, step: number, w0 = 0, w1 = 0, g = 0, cap = true) {
    const ax = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = ax.length(); ax.normalize();
    const u = new THREE.Vector3(1, 0, 0); if (Math.abs(ax.x) > 0.9) u.set(0, 0, 1);
    const s = new THREE.Vector3().crossVectors(ax, u).normalize(), t = new THREE.Vector3().crossVectors(ax, s);
    const ring = (o: V, r: number, i: number): V => { const an = (i / n) * Math.PI * 2 + 0.3; return [o[0] + (s.x * Math.cos(an) + t.x * Math.sin(an)) * r, o[1] + (s.y * Math.cos(an) + t.y * Math.sin(an)) * r, o[2] + (s.z * Math.cos(an) + t.z * Math.sin(an)) * r]; };
    for (let i = 0; i < n; i++) {
      const lit = Math.sin((i / n) * Math.PI * 2 + 0.3) > 0 ? 1 : 0;
      this.quad(ring(a, r0, i), ring(a, r0, i + 1), ring(b, r1, i + 1), ring(b, r1, i), col(ramp, step + lit), [w0, w0, w1, w1], g);
    }
    if (cap && r1 > 0.004) for (let i = 0; i < n; i++) this.tri(b, ring(b, r1, i), ring(b, r1, i + 1), col(ramp, step + 2), [w1, w1, w1], g);
    void L;
  }
  /** a lumpy faceted blob (an icosahedron, jittered), planar shading by facing */
  blob(c: V, r: V, ramp: RampName, step: number, seed: number, detail = 1, g = 0, w = 0) {
    const ico = new THREE.IcosahedronGeometry(1, detail), p = ico.attributes.position as THREE.BufferAttribute;
    const jit = (x: number, y: number, z: number) => 1 + (hash01(Math.round(x * 97), Math.round(y * 97) + seed, Math.round(z * 97)) - 0.5) * 0.3;
    for (let i = 0; i < p.count; i += 3) {
      const v: V[] = [0, 1, 2].map((k) => { const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k), j = jit(x, y, z); return [c[0] + x * r[0] * j, c[1] + Math.max(-0.2, y) * r[1] * j, c[2] + z * r[2] * j] as V; });
      const ny = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, nx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const k = step + (ny > 0.55 ? 2 : ny > 0.1 ? 1 : 0) + (nx < -0.3 && ny > 0.1 ? 1 : 0) - (hash01(i, seed) < 0.18 ? 1 : 0);
      this.tri(v[0], v[1], v[2], col(ramp, k), [w * Math.max(0, ny), w * Math.max(0, ny), w * Math.max(0, ny)], g);
    }
    ico.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.colr, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------------------------------------ the shapes
/** staghorn: forking antlers, golden, violet or flame */
function staghorn(seed: number, ramp: RampName) {
  const b = new GB(), r = new Rand(seed);
  const branch = (o: V, dir: THREE.Vector3, len: number, rad: number, lvl: number) => {
    const e: V = [o[0] + dir.x * len, o[1] + dir.y * len, o[2] + dir.z * len];
    b.prism(o, e, rad, rad * 0.7, 4, ramp, 2 + lvl * 0.6, lvl * 0.1, (lvl + 1) * 0.1, 0, lvl >= 2);
    if (lvl >= 2) { b.prism(e, [e[0] + dir.x * 0.04, e[1] + dir.y * 0.04, e[2] + dir.z * 0.04], rad * 0.7, 0.002, 4, ramp, 5, 0.3, 0.3); return; }
    const k = r.int(2, 3);
    for (let i = 0; i < k; i++) {
      const d = dir.clone().add(new THREE.Vector3(r.range(-0.7, 0.7), r.range(0.1, 0.5), r.range(-0.7, 0.7))).normalize();
      branch(e, d, len * r.range(0.6, 0.85), rad * 0.72, lvl + 1);
    }
  };
  for (let i = 0, n = r.int(3, 5); i < n; i++) branch([r.range(-0.15, 0.15), 0, r.range(-0.15, 0.15)], new THREE.Vector3(r.range(-0.5, 0.5), 1, r.range(-0.5, 0.5)).normalize(), r.range(0.22, 0.32), 0.045, 0);
  return b;
}
/** table coral: a stout stalk under a broad, ragged plate with a pale growing rim */
function tableCoral(seed: number, ramp: RampName) {
  const b = new GB(), r = new Rand(seed), n = 9, h = r.range(0.28, 0.4);
  b.prism([0, 0, 0], [0, h, 0], 0.09, 0.06, 5, ramp, 1);
  const rim: V[] = [], inner: V[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, R = r.range(0.42, 0.62), tilt = Math.cos(a - 0.7) * 0.06; rim.push([Math.cos(a) * R, h + 0.04 + tilt, Math.sin(a) * R]); inner.push([Math.cos(a) * R * 0.6, h + 0.07 + tilt * 0.5, Math.sin(a) * R * 0.6]); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    b.tri([0, h + 0.08, 0], inner[i], inner[j], col(ramp, 3 + (i % 2)));
    b.quad(inner[i], rim[i], rim[j], inner[j], col(ramp, 4 + (i % 3 === 0 ? 1 : 0)));
    b.quad(rim[i], [rim[i][0] * 0.95, rim[i][1] - 0.05, rim[i][2] * 0.95], [rim[j][0] * 0.95, rim[j][1] - 0.05, rim[j][2] * 0.95], rim[j], col(ramp, 5));
    b.tri([0, h - 0.02, 0], [rim[j][0] * 0.95, rim[j][1] - 0.05, rim[j][2] * 0.95], [rim[i][0] * 0.95, rim[i][1] - 0.05, rim[i][2] * 0.95], col(ramp, 1));
  }
  return b;
}
/** brain and boulder corals: low faceted domes */
function brain(seed: number, ramp: RampName) {
  const b = new GB(), r = new Rand(seed);
  b.blob([0, 0, 0], [r.range(0.35, 0.5), r.range(0.25, 0.35), r.range(0.35, 0.5)], ramp, 1, seed, 1);
  if (r.chance(0.6)) b.blob([r.range(0.25, 0.4), 0, r.range(-0.2, 0.2)], [0.2, 0.16, 0.2], ramp, 2, seed + 3, 0);
  return b;
}
/** a sea fan: a flat lattice of branching ribs in one plane, swaying */
function seaFan(seed: number, ramp: RampName) {
  const b = new GB(), r = new Rand(seed);
  const rib = (o: V, a: number, len: number, lvl: number) => {
    const e: V = [o[0] + Math.sin(a) * len, o[1] + Math.cos(a) * len, o[2]];
    const w = 0.012 * (3 - lvl);
    const s0 = clamp(o[1] / 0.9, 0, 1), s1 = clamp(e[1] / 0.9, 0, 1);
    b.quad([o[0] - w, o[1], o[2]], [o[0] + w, o[1], o[2]], [e[0] + w * 0.7, e[1], e[2]], [e[0] - w * 0.7, e[1], e[2]], col(ramp, 2 + lvl), [s0, s0, s1, s1]);
    if (lvl < 3) for (const da of [-0.38, 0.32]) rib(e, a + da + r.range(-0.12, 0.12), len * r.range(0.62, 0.8), lvl + 1);
  };
  rib([0, 0, 0], r.range(-0.15, 0.15), 0.28, 0);
  // the web between the ribs, a darker translucent-looking sheet
  for (let i = 0; i < 6; i++) { const a0 = -0.9 + i * 0.3, a1 = a0 + 0.3; b.tri([0, 0.2, -0.004], [Math.sin(a0) * 0.75, 0.2 + Math.cos(a0) * 0.6, -0.004], [Math.sin(a1) * 0.75, 0.2 + Math.cos(a1) * 0.6, -0.004], col(ramp, 1), [0.2, 0.9, 0.9]); }
  return b;
}
/** tube sponges: a cluster of open hexagonal tubes, dark inside */
function sponges(seed: number, ramp: RampName) {
  const b = new GB(), r = new Rand(seed);
  for (let i = 0, n = r.int(3, 5); i < n; i++) {
    const x = r.range(-0.18, 0.18), z = r.range(-0.18, 0.18), h = r.range(0.25, 0.6), rad = r.range(0.05, 0.09), lean = r.range(-0.08, 0.08);
    b.prism([x, 0, z], [x + lean, h, z + lean * 0.5], rad, rad * 1.15, 6, ramp, 2, 0, 0.15, 0, false);
    // the dark mouth
    for (let k = 0; k < 6; k++) { const a0 = (k / 6) * Math.PI * 2 + 0.3, a1 = ((k + 1) / 6) * Math.PI * 2 + 0.3; b.tri([x + lean, h - 0.08, z + lean * 0.5], [x + lean + Math.cos(a0) * rad, h, z + lean * 0.5 + Math.sin(a0) * rad], [x + lean + Math.cos(a1) * rad, h, z + lean * 0.5 + Math.sin(a1) * rad], col(ramp, 0)); }
  }
  return b;
}
/** an anemone: a short column and a crown of tentacles that sway; their tips glow at night */
function anemone(seed: number, ramp: RampName) {
  const b = new GB(), r = new Rand(seed);
  b.prism([0, 0, 0], [0, 0.1, 0], 0.08, 0.07, 6, 'plum', 2);
  for (let i = 0, n = r.int(10, 14); i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.1, 0.1), L = r.range(0.14, 0.24), ou = r.range(0.4, 0.8);
    b.prism([Math.cos(a) * 0.05, 0.1, Math.sin(a) * 0.05], [Math.cos(a) * (0.05 + L * ou), 0.1 + L, Math.sin(a) * (0.05 + L * ou)], 0.012, 0.004, 3, ramp, 3, 0.2, 1, 1, false);
  }
  return b;
}
/** a tuft of seagrass: thin blades leaning out from one root */
function seagrass(seed: number) {
  const b = new GB(), r = new Rand(seed);
  for (let i = 0, n = r.int(5, 8); i < n; i++) {
    const a = r.range(0, Math.PI * 2), lean = r.range(0.05, 0.25), h = r.range(0.25, 0.5), w = r.range(0.012, 0.02), ramp: RampName = r.chance(0.6) ? 'sage' : 'moss';
    const x0 = r.range(-0.06, 0.06), z0 = r.range(-0.06, 0.06), dx = Math.cos(a) * lean, dz = Math.sin(a) * lean, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    b.quad([x0 - px, 0, z0 - pz], [x0 + px, 0, z0 + pz], [x0 + dx * 0.5 + px, h * 0.55, z0 + dz * 0.5 + pz], [x0 + dx * 0.5 - px, h * 0.55, z0 + dz * 0.5 - pz], col(ramp, 2), [0, 0, 0.45, 0.45]);
    b.tri([x0 + dx * 0.5 - px, h * 0.55, z0 + dz * 0.5 - pz], [x0 + dx * 0.5 + px, h * 0.55, z0 + dz * 0.5 + pz], [x0 + dx, h, z0 + dz], col(ramp, 4), [0.45, 0.45, 1]);
  }
  return b;
}
/** kelp: a stipe from the bed to the surface (built at a real height H, scaled a little per plant), broad straps of
 *  blade drooping off it with a gas bladder at each root, and a canopy of long blades tangled out on the surface */
function kelp(seed: number, H: number) {
  const b = new GB(), r = new Rand(seed);
  // the stipe wanders a little on its way up
  const pts: V[] = []; for (let i = 0; i <= 8; i++) { const y = (i / 8) * H; pts.push([Math.sin(i * 1.3 + seed) * 0.08 * (i / 8), y, Math.cos(i * 0.9 + seed) * 0.08 * (i / 8)]); }
  for (let i = 0; i < 8; i++) b.prism(pts[i], pts[i + 1], 0.035, 0.03, 3, 'olive', 2, pts[i][1] / H, pts[i + 1][1] / H, 0, false);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.prism([0, 0.05, 0], [Math.cos(a) * 0.22, -0.05, Math.sin(a) * 0.22], 0.035, 0.01, 3, 'soil', 3, 0, 0, 0, false); }
  for (let y = 0.35, side = 0; y < H - 0.3; y += r.range(0.28, 0.45), side++) {
    const a = side * 2.4 + r.range(-0.4, 0.4), L = r.range(0.55, 1.0), wd = r.range(0.07, 0.12), droop = r.range(0.1, 0.35);
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * wd, pz = dx * wd, k = y / H, k2 = Math.min(1, (y + 0.3) / H);
    const ramp: RampName = r.chance(0.55) ? 'ochre' : 'olive', st = r.int(2, 4);
    const m: V = [dx * L * 0.5, y + 0.12, dz * L * 0.5], e: V = [dx * L, y + 0.12 - droop, dz * L];
    b.quad([0, y, 0], [m[0] + px, m[1], m[2] + pz], e, [m[0] - px, m[1], m[2] - pz], col(ramp, st), [k, k2, k2, k2]);
    b.tri([m[0] + px, m[1], m[2] + pz], [m[0] + px * 0.2, m[1] + 0.01, m[2] + pz * 0.2], e, col(ramp, st + 1), [k2, k2, k2]);
    b.blob([dx * 0.06, y, dz * 0.06], [0.045, 0.06, 0.045], 'ochre', 3, seed + Math.round(y * 100), 0, 0, k);
  }
  // the canopy: long blades lying out on the surface, crossing each other
  for (let i = 0; i < 11; i++) {
    const a = r.range(0, Math.PI * 2), L = r.range(0.7, 1.6), wd = r.range(0.06, 0.11), dx = Math.cos(a), dz = Math.sin(a), px = -dz * wd, pz = dx * wd, o = r.range(0, 0.25);
    const y0 = H - 0.02 + i * 0.002;
    b.quad([dx * o, y0, dz * o], [dx * (o + L * 0.5) + px, y0, dz * (o + L * 0.5) + pz], [dx * (o + L), y0 - 0.01, dz * (o + L)], [dx * (o + L * 0.5) - px, y0, dz * (o + L * 0.5) - pz], col(i % 3 ? 'ochre' : 'olive', 3 + (i % 2)), [1, 1, 1, 1]);
  }
  return b;
}
/** a seabed nodule field (ore): dark iron-manganese lumps with a rust bloom */
function nodules(seed: number) { const b = new GB(), r = new Rand(seed); for (let i = 0; i < 9; i++) b.blob([r.range(-0.7, 0.7), 0, r.range(-0.7, 0.7)], [r.range(0.12, 0.26), r.range(0.1, 0.18), r.range(0.12, 0.26)], i % 3 ? 'iron' : 'rust', 2, seed + i, 0); return b; }
/** a crystal cluster: hexagonal quartz and sapphire prisms bursting out of a rock, faintly glowing */
function crystals(seed: number) {
  const b = new GB(), r = new Rand(seed);
  b.blob([0, 0, 0], [0.5, 0.25, 0.45], 'slate', 2, seed, 0);
  for (let i = 0; i < 8; i++) {
    const d = new THREE.Vector3(r.range(-0.6, 0.6), 1, r.range(-0.6, 0.6)).normalize(), L = r.range(0.35, 0.8), o: V = [r.range(-0.25, 0.25), 0.1, r.range(-0.25, 0.25)];
    const ramp: RampName = i % 3 ? 'sapphire' : 'quartz';
    b.prism(o, [o[0] + d.x * L, o[1] + d.y * L, o[2] + d.z * L], 0.07, 0.06, 6, ramp, 3, 0, 0, 0.6, false);
    const e: V = [o[0] + d.x * L, o[1] + d.y * L, o[2] + d.z * L];
    b.prism(e, [e[0] + d.x * 0.12, e[1] + d.y * 0.12, e[2] + d.z * 0.12], 0.06, 0.003, 6, ramp, 5, 0, 0, 1);
  }
  return b;
}

// ------------------------------------------------------------------------------------------------ the material
/** lit, vertex-coloured, swaying in the current and the swell, glowing a little at night */
export function reefMaterial(U: { uTime: { value: number }; uCur: { value: THREE.Vector2 }; uGlowK: { value: number } }, amp: number, key: string, outline = 1) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSway; attribute float aGlow; uniform float uTime, uGlowK; uniform vec2 uCur; varying float vGlow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float ph = 0.0;
#ifdef USE_INSTANCING
ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
#endif
float sw = aSway * ${amp.toFixed(3)};
vec2 cur = uCur * (0.6 + 0.4 * sin(uTime * 0.45 + ph));
transformed.xz += (cur + vec2(sin(uTime * 1.25 + ph * 2.0 + position.y * 3.0), cos(uTime * 1.05 + ph + position.y * 2.0)) * 0.45) * sw;
transformed.y -= length(cur) * sw * 0.25;
vGlow = aGlow * uGlowK;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vGlow * 2.2;');
  };
  m.customProgramCacheKey = () => 'ocean-reef-' + key;
  return gbuf(m, outline);
}

// ------------------------------------------------------------------------------------------------ the reef
export interface Node { x: number; z: number; y: number; kind: 'ore' | 'crystal'; amount: number; max: number; i: number }
interface Plant { x: number; y: number; z: number; s: number; yaw: number; h: number; carbon: number; cls?: number; j?: number }
const nearestH = (KH: number[], h: number) => { let b = 0; for (let i = 1; i < KH.length; i++) if (Math.abs(KH[i] - h) < Math.abs(KH[b] - h)) b = i; return b; };

export class Reef {
  readonly group = new THREE.Group();
  readonly U = { uTime: { value: 0 }, uCur: { value: new THREE.Vector2(0.1, 0.04) }, uGlowK: { value: 0 } };
  readonly nodes: Node[] = [];
  /** kelp plants (carbon to take), with their instance */
  readonly kelp: Plant[] = [];
  private kelpMats: (THREE.InstancedMesh | null)[] = []; private kelpH: number[] = [];
  private nodeMesh = new Map<string, THREE.InstancedMesh>();
  /** coral heads per square metre of reef, for the fish to find (x, z, y) */
  readonly coral: [number, number, number][] = [];
  private geos: THREE.BufferGeometry[] = []; private mats: THREE.Material[] = [];
  constructor(readonly R: Region, readonly level: () => number) {
    this.group.name = 'reef';
    this.build();
  }
  private inst(geo: THREE.BufferGeometry, mat: THREE.Material, list: { x: number; y: number; z: number; s: number; yaw: number; sy?: number }[]) {
    if (!list.length) return null;
    const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
    list.forEach((p, i) => { o.position.set(p.x, p.y, p.z); o.rotation.set(0, p.yaw, 0); o.scale.set(p.s, p.sy ?? p.s, p.s); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false;
    this.group.add(m); this.geos.push(geo); this.mats.push(mat);
    return m;
  }
  private build() {
    const R = this.R, N = R.N, W = R.water, r = new Rand(R.seed ^ 0x7ee5), n = R.noise, bi = R.biome;
    const warm = bi.temp, oce = R.oceanic;
    const coralK = oce ? clamp((warm - 0.55) * 2.6, 0.15, 1) * (bi.key === 'reef' ? 1.3 : 1) : 0;
    const kelpK = oce ? clamp((0.85 - warm) * 3, 0.25, 1) : 0;
    const grassK = oce ? 0.8 : 0.35;
    // shapes: a few hand-built variants of each, in a few palette families
    const fams: RampName[] = ['ochre', 'plum', 'coral', 'violet', 'rust', 'teal'];
    const designs: { kind: string; geo: THREE.BufferGeometry; amp: number; pick: (d: number) => number }[] = [];
    for (let v = 0; v < 3; v++) {
      designs.push({ kind: 'stag' + v, geo: staghorn(R.seed + v * 11, fams[(v * 2) % fams.length]).build(), amp: 0.04, pick: (d) => (d > 0.6 && d < 3.5 ? 3 : 1) });
      designs.push({ kind: 'table' + v, geo: tableCoral(R.seed + v * 13, (['ochre', 'sage', 'plum'] as RampName[])[v]).build(), amp: 0, pick: (d) => (d > 1.2 ? 2 : 0.4) });
      designs.push({ kind: 'brain' + v, geo: brain(R.seed + v * 17, (['straw', 'coral', 'sage'] as RampName[])[v]).build(), amp: 0, pick: () => 2 });
      designs.push({ kind: 'fan' + v, geo: seaFan(R.seed + v * 19, (['violet', 'coral', 'plum'] as RampName[])[v]).build(), amp: 0.12, pick: (d) => (d > 1.5 ? 2 : 0.3) });
      designs.push({ kind: 'sponge' + v, geo: sponges(R.seed + v * 23, (['rust', 'ochre', 'violet'] as RampName[])[v]).build(), amp: 0, pick: (d) => (d > 1.8 ? 1.4 : 0.3) });
      designs.push({ kind: 'anem' + v, geo: anemone(R.seed + v * 29, (['glowTeal', 'coral', 'violet'] as RampName[])[v]).build(), amp: 0.5, pick: () => 1 });
    }
    const lists = designs.map(() => [] as { x: number; y: number; z: number; s: number; yaw: number }[]);
    const grass: { x: number; y: number; z: number; s: number; yaw: number }[] = [];
    const lag = R.lagoon;
    let corals = 0, grasses = 0;
    for (let z = 1; z < N - 1; z++) for (let x = 1; x < N - 1; x++) {
      const i = z * N + x, h = R.h[i], d = W - h;
      if (d < 0.3 || R.riverY[i] > 0) continue;
      const b = R.b[i], patch = n.fbm2(x * 0.06 + 310, z * 0.06 - 40, 3) * 0.5 + 0.5;
      // reefs: the warm shallows, thickest along a lagoon's crest
      let reefK = coralK * smoothK(0.35, 0.9, d) * (1 - smoothK(4.5, 6.5, d)) * smoothK(0.42, 0.7, patch);
      if (lag) { const dc = Math.hypot(x - lag.x, z - lag.z); reefK *= 1 + Math.max(0, 1 - Math.abs(dc - lag.r - 2) / 7) * 2; }
      if (b === B.MUD) reefK *= 0.2;
      for (let k = 0; k < 2 && corals < 900; k++) {
        if (r.next() > reefK * 0.55) continue;
        const px = x + r.next(), pz = z + r.next(), y = R.groundSmooth(px, pz) - 0.03;
        let tot = 0; for (const ds of designs) tot += ds.pick(d);
        let q = r.next() * tot, j = 0; for (; j < designs.length - 1; j++) { q -= designs[j].pick(d); if (q <= 0) break; }
        lists[j].push({ x: px, y, z: pz, s: r.range(0.6, 1.35) * (designs[j].kind.startsWith('anem') ? 0.9 : 1), yaw: r.range(0, Math.PI * 2) });
        this.coral.push([px, pz, y]); corals++;
      }
      // seagrass meadows over sand in the shallows
      if (b === B.SAND && d < 3.8 && grasses < 1400) { const gk = grassK * smoothK(0.55, 0.75, n.fbm2(x * 0.08 - 70, z * 0.08 + 30, 2) * 0.5 + 0.5) * (1 - reefK); for (let k = 0; k < 3; k++) if (r.next() < gk * 0.8) { const px = x + r.next(), pz = z + r.next(); grass.push({ x: px, y: R.groundSmooth(px, pz) - 0.02, z: pz, s: r.range(0.7, 1.4), yaw: r.range(0, 6.28) }); grasses++; } }
      // kelp forests: rocky and gravelly ground in the cooler, deeper water, in stands
      if (this.kelp.length < 320 && d > 2.6 && d < 15 && (b === B.ROCK || b === B.GRAVEL || patch > 0.6)) {
        const kk = kelpK * smoothK(0.5, 0.68, n.fbm2(x * 0.045 + 90, z * 0.045 + 12, 3) * 0.5 + 0.5);
        if (r.next() < kk * 0.45) { const px = x + r.next(), pz = z + r.next(), y = R.groundSmooth(px, pz) - 0.05; this.kelp.push({ x: px, y, z: pz, s: r.range(0.8, 1.3), yaw: r.range(0, 6.28), h: W - y + r.range(-0.1, 0.25), carbon: 6 }); }
      }
    }
    designs.forEach((ds, j) => { const m = this.inst(ds.geo, reefMaterial(this.U, ds.amp, ds.kind.replace(/\d/, ''), ds.kind.startsWith('fan') || ds.kind.startsWith('anem') ? 0 : 1), lists[j]); if (m) m.name = 'coral-' + ds.kind; else ds.geo.dispose(); });
    this.inst(seagrass(R.seed).build(), reefMaterial(this.U, 0.16, 'grass', 0), grass);
    // kelp in three height classes, each plant scaled from the nearest
    const KH = [4, 8, 13];
    this.kelpMats = KH.map((H, c) => { const list = this.kelp.map((p, i) => ({ p, i })).filter(({ p }) => nearestH(KH, p.h) === c); list.forEach(({ p }, j) => { p.cls = c; p.j = j; }); return this.inst(kelp(R.seed + c * 7, H).build(), reefMaterial(this.U, 0.22, 'kelp', 0), list.map(({ p }) => ({ ...p, sy: p.h / H }))); });
    this.kelpH = KH;
    // the harvest: ore nodule fields and crystal clusters on the open floor, kept apart
    if (oce) {
      for (let t = 0, made = 0; t < 600 && made < 7; t++) {
        const x = r.range(8, N - 8), z = r.range(8, N - 8), d = W - R.groundSmooth(x, z);
        if (d < 2.2 || d > 13 || this.nodes.some((o) => Math.hypot(o.x - x, o.z - z) < 14)) continue;
        const kind: Node['kind'] = made % 3 === 2 ? 'crystal' : 'ore', max = kind === 'ore' ? 140 : 90;
        this.nodes.push({ x, z, y: R.groundSmooth(x, z) - 0.05, kind, amount: max, max, i: this.nodes.filter((o) => o.kind === kind).length });
        made++;
      }
      for (const kind of ['ore', 'crystal'] as const) {
        const list = this.nodes.filter((o) => o.kind === kind);
        const m = this.inst((kind === 'ore' ? nodules(R.seed) : crystals(R.seed + 5)).build(), reefMaterial(this.U, 0, kind), list.map((o) => ({ x: o.x, y: o.y, z: o.z, s: 1, yaw: hash01(o.x, o.z) * 6.28 })));
        if (m) { m.name = 'seabed-' + kind; this.nodeMesh.set(kind, m); }
      }
    }
  }
  /** the nearest seabed node with something left, within r of a point (3D) */
  nodeNear(x: number, y: number, z: number, r: number): Node | null {
    let best: Node | null = null, bd = r * r;
    for (const o of this.nodes) { if (o.amount <= 0) continue; const d = (o.x - x) ** 2 + (o.y - y) ** 2 * 0.5 + (o.z - z) ** 2; if (d < bd) { bd = d; best = o; } }
    return best;
  }
  /** the nearest kelp with carbon left within r */
  kelpNear(x: number, y: number, z: number, r: number): number {
    let best = -1, bd = r * r;
    this.kelp.forEach((p, i) => { if (p.carbon <= 0 || y < p.y - 0.5) return; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  /** take from a node (it shrinks as it empties); returns what was taken */
  take(o: Node, n: number) {
    const got = Math.min(o.amount, n); o.amount -= got;
    const m = this.nodeMesh.get(o.kind);
    if (m) { const k = Math.max(0, o.amount / o.max), M = new THREE.Matrix4(); const s = k <= 0 ? 0 : 0.35 + 0.65 * k; M.compose(new THREE.Vector3(o.x, o.y - (1 - k) * 0.2, o.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash01(o.x, o.z) * 6.28), new THREE.Vector3(s, s, s)); m.setMatrixAt(o.i, M); m.instanceMatrix.needsUpdate = true; }
    return got;
  }
  /** cut a kelp plant down by `n` carbon (it shortens; cut out entirely, it grows back slowly) */
  cutKelp(i: number, n: number) {
    const p = this.kelp[i]; if (!p) return 0;
    const got = Math.min(p.carbon, n); p.carbon -= got; this.setKelp(i); return got;
  }
  private setKelp(i: number) {
    const p = this.kelp[i], m = this.kelpMats[p.cls ?? 0]; if (!m || p.j === undefined) return;
    const k = Math.max(0, p.carbon / 6), M = new THREE.Matrix4(), H = this.kelpH[p.cls ?? 0];
    M.compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3(p.s, Math.max(0.02, (p.h / H) * (0.15 + 0.85 * k)), p.s));
    m.setMatrixAt(p.j, M); m.instanceMatrix.needsUpdate = true;
  }
  private regrowT = 0;
  update(dt: number, t: number, night: number, current: THREE.Vector2) {
    this.U.uTime.value = t; this.U.uGlowK.value = night;
    this.U.uCur.value.lerp(current, Math.min(1, dt * 0.5));
    // kelp grows back
    if ((this.regrowT -= dt) <= 0) { this.regrowT = 4; this.kelp.forEach((p, i) => { if (p.carbon < 6) { p.carbon = Math.min(6, p.carbon + 0.15); this.setKelp(i); } }); }
  }
  /** carbon standing in the kelp, ore and crystal left on the floor (for the field survey) */
  stock() { let c = 0, o = 0, x = 0; for (const p of this.kelp) c += p.carbon; for (const n of this.nodes) { if (n.kind === 'ore') o += n.amount; else x += n.amount; } return { carbon: c, ore: o, crystal: x }; }
  dispose() { this.group.removeFromParent(); for (const g of this.geos) g.dispose(); for (const m of this.mats) m.dispose(); }
}
const smoothK = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
