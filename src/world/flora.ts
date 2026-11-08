// Flora: plant instances on the region (food for herbivores, life force for the Veyr) drawn as instanced
// pixel-art cards that lean back toward the camera, wither under moss and cast matching shadows, plus a dense
// layer of ground cover (tussocks, clover, flower patches, young ferns, litter, mushrooms). Everything moves in one
// wind field: gusts roll across the meadows, blades bend from the root with the tip doing most of the travelling,
// each tuft with its own stiffness; shrubs sway, trees lean slowly while their leaves flutter; creatures brushing
// through push the growth aside.
import * as THREE from 'three';
import { Region } from './region';
import { makeFlora, buildFloraAtlas, type PlantSpecies, type FloraAtlas } from './plantArt';
import type { GroundKind } from './groundArt';
import { B } from './blockTex';
import { Rand, hash01 } from '../core/rand';
import { gbuf } from '../gfx/gbuf';
import { SHADER_NOISE, FOW_FN, WIND_FN } from './glsl';

const VERT_PARS = /* glsl */`
attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iRect; attribute vec4 iParam; attribute vec2 iAnim;
uniform vec4 uPush[12];
uniform float uTime, uN, uLean, uHComp, uDetail;
uniform vec3 uCamRight, uCamBack;
uniform sampler2D uMoss;
varying float vWither; varying vec3 vBase; varying float vGlowK; varying float vFlut;
${SHADER_NOISE}
${WIND_FN}
`;
const VERT_BEGIN = /* glsl */`
float mc = texture2D(uMoss, iPos.xz / uN).r;
float wither = clamp(max(1.0 - iParam.z, (mc - 0.4) * 1.8), 0.0, 1.0);
if (uDetail > 0.5) wither = mc > 0.3 ? 1.0 : 0.0;
vWither = wither; vBase = iPos; vFlut = 0.0;
float sc = uDetail > 0.5 ? (1.0 - wither) : (1.0 - wither * 0.5) * step(0.02, iParam.z);
vec2 sz = iSize * sc;
vec3 transformed;
vec3 wnd = windAt(iPos.xz, uTime);
if (abs(iParam.w) > 1.5) {
  // lying flat (lily pads, leaf litter): turned to its own angle, pads bob on the water
  float br = 1.0 + sin(uTime * 1.2 + iParam.x) * 0.03 * step(0.5, iParam.y);
  float a = iParam.x;
  vec2 o = vec2(position.x * sz.x, (0.5 - position.y) * sz.y) * br;
  o = vec2(o.x * cos(a) - o.y * sin(a), o.x * sin(a) + o.y * cos(a));
  transformed = iPos + vec3(o.x, 0.04, o.y);
} else {
  vec3 up = normalize(vec3(0.0, cos(uLean), 0.0) - uCamBack * sin(uLean));
  float yy = position.y, t = uTime + iParam.x, k = iParam.y, typ = iAnim.x, spd = iAnim.y;
  bool tree = k < 0.5 && uDetail < 0.5;
  // wind: stiffness k scales the bend; blades and stems bend from the root (tip-weighted), trees lean from the
  // trunk with a slow sway of their own; a fast flutter rides on the gusts
  float yy2 = yy * yy;
  // tip travel in a full gust: ~35% of the height for grass, a few percent for a tree
  float flex = tree ? 0.035 : 0.21 * k;
  vec2 bendW = wnd.xy * flex;
  float flutter = sin(t * (5.5 + k * 3.0) + iPos.x * 1.7) * (0.015 + 0.04 * wnd.z) * k * (tree ? 0.2 : 1.0) * uWind;
  float bend = flutter + (tree ? sin(t * 0.7 + iPos.z * 0.13) * 0.012 : 0.0);
  float sx = 1.0, sy = 1.0;
  if (typ > 0.5 && typ < 1.5) { float b = sin(t * 1.7 * spd); sx = 1.0 + b * 0.06 * yy; sy = 1.0 + b * 0.04; }
  else if (typ > 1.5 && typ < 2.5) { bend += sin(t * 2.6 * spd) * 0.07 * yy; sy = 1.0 + sin(t * 3.4 * spd) * 0.035 * yy; }
  else if (typ > 2.5 && typ < 3.5) { bend += sin(t * 19.0 + iParam.x * 3.0) * 0.014 * smoothstep(0.5, 1.0, yy); }
  else if (typ > 3.5) { bend += sin(t * 1.3 * spd) * 0.09 * yy; sx += cos(t * 1.3 * spd) * 0.05 * yy; }
  // creatures brushing through push the plant aside
  vec2 push = vec2(0.0);
  for (int i = 0; i < 12; i++) {
    vec4 p = uPush[i];
    if (p.z <= 0.0) continue;
    vec2 d = iPos.xz - p.xy; float dl = length(d), rr = p.z + sz.x * 0.35;
    if (dl < rr) push += (d / max(dl, 0.001)) * (1.0 - dl / rr) * p.w;
  }
  vec2 off = bendW * sz.y * yy2;
  transformed = iPos + uCamRight * (position.x * sz.x * sx + (bend * sz.y + dot(push, uCamRight.xz) * 0.6) * yy2) + up * (yy * sz.y * uHComp * sy - 0.06) + uCamBack * (dot(push, uCamBack.xz) * 0.35 * yy2);
  transformed.xz += off;
  // a bent stem is shorter
  transformed.y -= (length(push) * 0.18 + dot(bendW, bendW) * 0.45) * yy2 * sz.y;
  vFlut = uDetail < 0.5 && (tree || typ < 0.5) ? smoothstep(0.35, 1.0, yy) * (0.25 + wnd.z * 0.75) * uWind : 0.0;
}
`;
const UV_PATCH = /* glsl */`
#include <uv_vertex>
float fu = iParam.w < 0.0 ? 1.0 - uv.x : uv.x;
vMapUv = vec2(iRect.x + iRect.z * fu, iRect.y + iRect.w * (1.0 - uv.y));
`;
/** leaves flutter: in the upper crown, small blocks of texels shift a pixel back and forth with the gusts */
const FLUTTER = /* glsl */`
vec2 fTex = floor(vMapUv * 2048.0);
float fBlk = h2(floor(fTex / 3.0) + floor(uTime * 6.0 + h2(floor(fTex / 7.0)) * 4.0) * 1.37);
vec2 fUv = vMapUv;
if (vFlut > 0.0 && fBlk > 1.0 - vFlut * 0.13) fUv.x += (fBlk > 1.0 - vFlut * 0.065 ? 1.0 : -1.0) / 2048.0;
vec4 sampledDiffuseColor = texture2D(map, fUv);
`;

/** sqrt-based length (Math.hypot is several times slower in the hot loops) */
const hyp = (a: number, b: number, c = 0) => Math.sqrt(a * a + b * b + c * c);
/** wind strength by biome: open steppe and savanna are windy, the jungle floor is still */
const WIND: Partial<Record<string, number>> = { meadow: 1, jungle: 0.55, savanna: 1.15, marsh: 0.8, highland: 1.2, tundra: 1.25, desert: 1.05, crystal: 0.9, ashland: 0.9, coast: 1.2 };
const STIFF: Partial<Record<GroundKind, number>> = { grass: 1.2, tall: 1.45, dry: 1.1, sedge: 1.0, flower: 1.0, fern: 0.6, clover: 0.2, mush: 0.05, pebble: 0, litter: 0, twig: 0 };

export class Flora {
  readonly species: PlantSpecies[];
  readonly atlas: FloraAtlas;
  n = 0;
  x!: Float32Array; z!: Float32Array; sp!: Uint8Array; bio!: Float32Array;
  /** spatial hash: cell (4 m) -> plant indices */
  private cells = new Map<number, number[]>();
  readonly mesh: THREE.Mesh;
  readonly detail: THREE.Mesh;
  readonly U: Record<string, THREE.IUniform>;
  private param!: THREE.InstancedBufferAttribute;
  private recovering = new Set<number>();
  shade!: Float32Array;
  readonly group = new THREE.Group();

  constructor(readonly region: Region, moss: THREE.Texture, vis: THREE.Texture) {
    this.species = makeFlora(region.pal, region.biome.key, region.seed);
    this.atlas = buildFloraAtlas(this.species, region.pal, region.seed);
    this.U = {
      uTime: { value: 0 }, uN: { value: region.N }, uLean: { value: 0.42 }, uHComp: { value: 1.08 }, uDetail: { value: 0 },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamBack: { value: new THREE.Vector3(0, 0, 1) },
      uMoss: { value: moss }, uVis: { value: vis }, uDark: { value: new THREE.Color(0x07080c) },
      uPush: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uWindDir: { value: new THREE.Vector2(Math.cos(region.seed * 1.7), Math.sin(region.seed * 1.7)) }, uWind: { value: WIND[region.biome.key] ?? 1 },
    };
    const { inst, det } = this.place();
    this.mesh = this.makeMesh(inst, false);
    this.detail = this.makeMesh(det, true);
    this.mesh.castShadow = true;
    this.group.add(this.mesh, this.detail);
  }

  private place() {
    const R = this.region, N = R.N, r = new Rand(R.seed ^ 0xf1), bi = R.biome, sp = this.species, nz = R.noise;
    const inst: number[][] = [], det: number[][] = [];
    const treeAt: number[][] = [];
    const L = R.landing;
    const totalW = sp.reduce((s, p) => s + p.weight, 0);
    // clearings around rock formations: thin soil, no trees, low growth only
    const rocky = new Float32Array(N * N);
    for (const p of R.rocks) {
      if (p.kind === 'pebble' || p.kind === 'river' || p.kind === 'log' || p.kind === 'stump') continue;
      const rr = Math.max(p.sx, p.sz) * (p.kind === 'arch' ? 1.2 : 1), ext = Math.ceil(rr + 5);
      for (let z = Math.floor(p.z) - ext; z <= Math.floor(p.z) + ext; z++) for (let x = Math.floor(p.x) - ext; x <= Math.floor(p.x) + ext; x++) {
        if (!R.inside(x, z)) continue;
        const d = hyp(x + 0.5 - p.x, z + 0.5 - p.z) - rr, i = z * N + x;
        rocky[i] = Math.max(rocky[i], Math.min(1, 1 - d / 5));
      }
    }
    // fallen logs and stumps keep a little space around them so they read on the forest floor
    for (const p of R.rocks) {
      if (p.kind !== 'log' && p.kind !== 'stump') continue;
      const c = Math.cos(p.yaw), s2 = Math.sin(p.yaw), half = p.kind === 'log' ? p.sx : 0, ext = Math.ceil(half + 2);
      for (let z = Math.floor(p.z) - ext; z <= Math.floor(p.z) + ext; z++) for (let x = Math.floor(p.x) - ext; x <= Math.floor(p.x) + ext; x++) {
        if (!R.inside(x, z)) continue;
        const dx = x + 0.5 - p.x, dz = z + 0.5 - p.z, u = Math.max(-half, Math.min(half, dx * c + dz * s2));
        const d = hyp(dx - u * c, dz - u * s2) - p.sy;
        if (d < 1.6) rocky[z * N + x] = Math.max(rocky[z * N + x], 0.85);
      }
    }
    // the forest floor: ferns and fungi thrive in the shade; bushes crowd the woodland edges and thin out inside
    const under = new Set(['fern', 'fungus', 'fiddle', 'eyeflower']), edge = new Set(['shrub', 'bulb', 'coral']);
    // shore plants: water within three cells along the axes
    const wet = new Uint8Array(N * N), nearW = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) wet[i] = R.h[i] < R.water || (R.riverY[i] > 0 && R.h[i] < R.riverY[i] - 0.05) ? 1 : 0;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      let near = 0;
      for (let d = 1; d <= 3 && !near; d++) near = (x + d < N && wet[z * N + x + d]) || (x - d >= 0 && wet[z * N + x - d]) || (z + d < N && wet[(z + d) * N + x]) || (z - d >= 0 && wet[(z - d) * N + x]) ? 1 : 0;
      nearW[z * N + x] = near;
    }
    // ground cover sprites by kind (flowers by bloom colour)
    const kinds = new Map<GroundKind, number[]>(), flowers: number[][] = [];
    this.atlas.detailInfo.forEach((g, i) => { let l = kinds.get(g.kind); if (!l) kinds.set(g.kind, (l = [])); l.push(i); if (g.kind === 'flower') (flowers[g.tint] ??= []).push(i); });
    const pick = (k: GroundKind) => { const l = kinds.get(k); return l ? l[r.int(0, l.length - 1)] : -1; };
    const putD = (k: number, dx: number, dz: number, y?: number) => { if (k >= 0) det.push([dx, y ?? R.heightAt(dx, dz), dz, k]); };
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, f = R.fert[i], w = R.wet[i], h = R.h[i];
      const dl = hyp(x + 0.5 - L.x, z + 0.5 - L.z);
      if (dl < 9) continue;
      if (R.solid[i]) continue;
      const ry = R.riverY[i], inRiver = ry > 0 && h < ry + 0.05;
      const water = h < R.water || inRiver, surf = inRiver ? ry : R.water;
      if (R.b[i] === B.SOIL && !water && r.chance(0.85)) continue;
      const depth = surf - h, fo = R.forest[i], rk = rocky[i];
      // ground cover: dense tussocks in the meadows, clover and flower patches, litter and ferns under trees,
      // sedges in damp margins, pebbles on stony ground
      if (!water) {
        const bk = R.b[i], lush = Math.min(1.4, f * bi.flora), patch = (nz.n2(x * 0.09, z * 0.09) + 1) * 0.5, damp = R.damp[i];
        let nG = 0, nTall = 0, nDry = 0, nClover = 0, nFl = 0, nFern = 0, nMush = 0, nLit = 0, nSedge = 0, nPeb = 0;
        if (bk === B.GRASS || bk === B.CLAY) {
          nG = Math.floor(1 + lush * (2.2 + patch * 2.6) + hash01(x, z, 3) * 1.4);
          if (patch > 0.62 && r.chance(0.7)) nTall = r.int(1, 2);
          if (nz.n2(x * 0.16 + 30, z * 0.16) > 0.42) nClover = r.int(1, 2);
          nFl = nz.n2(x * 0.11 + 50, z * 0.11 - 20) > 0.38 ? r.int(1, 3) : r.chance(0.04) ? 1 : 0;
          if (fo > 0.25 && r.chance(fo * 0.5)) nFern = 1;
        } else if (bk === B.DRY) {
          nDry = Math.floor(1 + lush * 2.5 + hash01(x, z, 3) * 1.5); nG = r.chance(0.4) ? 1 : 0;
          nFl = nz.n2(x * 0.11 + 50, z * 0.11 - 20) > 0.5 ? 1 : 0;
        } else if (bk === B.LITTER) {
          nLit = r.int(1, 2); nG = r.chance(0.5) ? 1 : 0; nFern = r.chance(0.45) ? 1 : 0; nMush = r.chance(0.06) ? 1 : 0;
          if (r.chance(0.12)) nLit++;
          if (r.chance(0.1)) putD(pick('twig'), x + r.next(), z + r.next());
        } else if (bk === B.SAND || bk === B.GRAVEL || bk === B.MUD) {
          if (damp > 0.3 && r.chance(0.55 * damp + (bk === B.MUD ? 0.3 : 0))) nSedge = 1;
          if (r.chance(0.12)) nPeb = 1;
          if (bk === B.MUD && r.chance(0.5)) nG = 1;
        } else if (bk === B.ROCK || bk === B.BASALT) { if (r.chance(0.25)) nPeb = 1; if (r.chance(0.3)) nG = 1; }
        else if (bk === B.SOIL) { if (r.chance(0.3)) nG = 1; if (r.chance(0.1)) nPeb = 1; }
        else if (bk !== B.SNOW && bk !== B.CRATER && f > 0.2) nG = r.chance(0.5) ? 1 : 0;
        if (damp > 0.45 && bk !== B.SAND && r.chance(damp * 0.5)) nSedge++;
        if (rk > 0.5 && r.chance(rk * 0.25)) nPeb++;
        for (let k = 0; k < nG; k++) putD(pick('grass'), x + r.next(), z + r.next());
        for (let k = 0; k < nTall; k++) putD(pick('tall'), x + r.next(), z + r.next());
        for (let k = 0; k < nDry; k++) putD(pick('dry'), x + r.next(), z + r.next());
        for (let k = 0; k < nClover; k++) putD(pick('clover'), x + r.next(), z + r.next());
        if (nFl) {
          // flowers grow in patches of one kind
          const tint = Math.floor(hash01(Math.floor(x / 7), Math.floor(z / 7), 11) * flowers.length), list = flowers[tint] ?? flowers[0];
          if (list) for (let k = 0; k < nFl; k++) putD(list[r.int(0, list.length - 1)], x + r.next(), z + r.next());
        }
        for (let k = 0; k < nFern; k++) putD(pick('fern'), x + r.next(), z + r.next());
        for (let k = 0; k < nMush; k++) putD(pick('mush'), x + r.next(), z + r.next());
        for (let k = 0; k < nLit; k++) putD(pick('litter'), x + r.next(), z + r.next());
        for (let k = 0; k < nSedge; k++) putD(pick('sedge'), x + r.next(), z + r.next());
        for (let k = 0; k < nPeb; k++) putD(pick('pebble'), x + r.next(), z + r.next());
      }
      // plants: each species rolls with clustered noise, trees gather into woods, nothing tall by the rocks
      for (const p of sp) {
        if (p.water !== water) continue;
        if (water && (depth > 1.4 || depth < 0.2)) continue;
        if (water && inRiver && (p.arch !== 'lily' || depth > 0.7)) continue;
        if (!water && (f < p.fert * 0.7 || w < p.wetMin - 0.08 || w > p.wetMax + 0.08)) continue;
        if (p.shore && !water && !nearW[i]) continue;
        const cl = (nz.n2(x * 0.07 + p.id * 13.1, z * 0.07 - p.id * 7.3) + 1) * 0.5;
        const clusterK = Math.pow(cl, 1 + p.cluster * 3) * (1 + p.cluster * 2.5);
        let mul = p.tree ? (bi.key === 'desert' || bi.key === 'savanna' ? 0.35 + fo * 2 : 0.1 + fo * 2.5) : under.has(p.arch) ? 0.75 + fo * 0.9 : edge.has(p.arch) ? 1 + 1.6 * fo * (1 - fo) - fo * fo * 0.55 : 1.15 - fo * 0.7;
        if (p.tree) mul *= 1 - rk; else if (p.hmax > 1.2) mul *= 1 - rk * 0.75;
        const chance = (p.weight / totalW) * clusterK * (water ? 1.2 : (1.6 + f * 4.4)) * bi.flora * (p.tree ? 0.5 : 1) * mul;
        if (r.next() > chance) continue;
        const px = x + r.range(0.15, 0.85), pz = z + r.range(0.15, 0.85);
        if (p.tree) {
          if (treeAt.some((t) => (t[0] - px) ** 2 + (t[1] - pz) ** 2 < 5.5)) continue;
          treeAt.push([px, pz]);
        }
        inst.push([px, water ? surf : R.heightAt(px, pz), pz, p.id, r.int(0, p.sprites.length - 1)]);
      }
    }
    // mushrooms and ferns on the fallen logs
    for (const p of R.rocks) {
      if (p.kind !== 'log') continue;
      const c = Math.cos(p.yaw), s2 = Math.sin(p.yaw);
      for (let k = r.int(0, 3); k > 0; k--) {
        const t = r.range(-0.8, 0.8) * p.sx, dy = -Math.sin(p.tilt) * t * Math.cos(p.tiltDir - p.yaw);
        putD(r.chance(0.7) ? pick('mush') : pick('fern'), p.x + c * t, p.z + s2 * t, p.y + p.sz * 1.75 + dy);
      }
    }
    // canopy shade: trees darken a wide ring of ground, shrubs a little patch
    this.shade = new Float32Array(N * N).fill(1);
    for (const p of inst) {
      const sp = this.species[p[3]];
      const rad = sp.tree ? 2.6 : sp.hmax > 0.9 ? 1.2 : 0.7, k = sp.tree ? 0.22 : 0.07;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const X = Math.floor(p[0]) + dx, Z = Math.floor(p[2]) + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
        const d = hyp(X + 0.5 - p[0], Z + 0.5 - p[2]); if (d > rad) continue;
        this.shade[Z * N + X] = Math.max(0.45, this.shade[Z * N + X] - k * (1 - d / rad));
      }
    }
    // contact occlusion: the ground darkens where it tucks in under rocks and logs
    for (const p of R.rocks) {
      if (p.kind === 'pebble') continue;
      const rr = Math.max(p.sx, p.sz) + 1.1, ext = Math.ceil(rr);
      for (let z = Math.floor(p.z) - ext; z <= Math.floor(p.z) + ext; z++) for (let x = Math.floor(p.x) - ext; x <= Math.floor(p.x) + ext; x++) {
        if (!R.inside(x, z)) continue;
        const d = hyp(x + 0.5 - p.x, z + 0.5 - p.z) / rr; if (d > 1) continue;
        const i = z * N + x; this.shade[i] = Math.max(0.45, this.shade[i] - 0.22 * (1 - d) * (p.kind === 'river' ? 0.5 : 1));
      }
    }
    this.n = inst.length;
    this.x = new Float32Array(this.n); this.z = new Float32Array(this.n); this.sp = new Uint8Array(this.n); this.bio = new Float32Array(this.n).fill(1);
    inst.forEach((p, i) => {
      this.x[i] = p[0]; this.z[i] = p[2]; this.sp[i] = p[3];
      const key = (Math.floor(p[2] / 4) << 8) | Math.floor(p[0] / 4);
      let c = this.cells.get(key); if (!c) this.cells.set(key, (c = [])); c.push(i);
    });
    return { inst, det };
  }

  private makeMesh(list: number[][], detail: boolean): THREE.Mesh {
    const n = list.length;
    const g = new THREE.InstancedBufferGeometry();
    const SEG = detail ? 2 : 4, gp: number[] = [], gu: number[] = [], gi: number[] = [];
    for (let k = 0; k <= SEG; k++) { const y = k / SEG; gp.push(-0.5, y, 0, 0.5, y, 0); gu.push(0, y, 1, y); if (k < SEG) { const a = k * 2; gi.push(a, a + 1, a + 3, a, a + 3, a + 2); } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2));
    g.setIndex(gi);
    const pos = new Float32Array(n * 3), size = new Float32Array(n * 2), rect = new Float32Array(n * 4), param = new Float32Array(n * 4), anim = new Float32Array(n * 2);
    const r = new Rand(this.region.seed ^ (detail ? 0xd7 : 0xa1));
    list.forEach((p, i) => {
      const s = detail ? this.atlas.detail[p[3]] : this.species[p[3]].sprites[p[4]];
      const gk = detail ? this.atlas.detailInfo[p[3]] : null;
      const flat = detail ? gk!.flat : this.species[p[3]].arch === 'lily';
      const k = detail ? r.range(0.85, 1.15) : r.range(0.92, 1.08);
      pos.set([p[0], p[1], p[2]], i * 3);
      size.set([s.w * k, s.h * k], i * 2);
      rect.set([s.u0, s.v0, s.du, s.dv], i * 4);
      // stiffness: grasses and sedges flex, flowers nod, low mats and stones barely stir; trees are stiff
      const stiff = gk ? (STIFF[gk.kind] ?? 1) * r.range(0.75, 1.3) : this.species[p[3]].tree ? 0.35 : this.species[p[3]].arch === 'lily' ? 1 : r.range(0.75, 1.15);
      param.set([r.range(0, 6.28), stiff, 1, (r.chance(0.5) ? 1 : -1) * (flat ? 2 : 1)], i * 4);
      anim.set([detail ? 0 : this.species[p[3]].anim, r.range(0.8, 1.25)], i * 2);
    });
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 2));
    g.setAttribute('iRect', new THREE.InstancedBufferAttribute(rect, 4));
    g.setAttribute('iAnim', new THREE.InstancedBufferAttribute(anim, 2));
    const pa = new THREE.InstancedBufferAttribute(param, 4);
    pa.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iParam', pa);
    if (!detail) this.param = pa;
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(this.region.N / 2, 5, this.region.N / 2), this.region.N);
    const U = { ...this.U, uDetail: { value: detail ? 1 : 0 } };
    const m = new THREE.MeshLambertMaterial({ map: this.atlas.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(vec3(0.0, 1.0, 0.0) + uCamBack * 0.15);')
        .replace('#include <begin_vertex>', VERT_BEGIN)
        .replace('#include <uv_vertex>', UV_PATCH);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D uVis; uniform float uN, uTime; uniform vec3 uDark;
varying float vWither; varying vec3 vBase; varying float vFlut;
${SHADER_NOISE}
${FOW_FN}`)
        .replace('#include <map_fragment>', `${FLUTTER}
diffuseColor *= sampledDiffuseColor;
float glowA = sampledDiffuseColor.a;
vec3 glowC = sampledDiffuseColor.rgb;
float lumW = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumW) * vec3(0.62, 0.5, 0.36), vWither * 0.85);`)
        .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.5) discard;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA < 0.98) totalEmissiveRadiance += glowC * 1.3 * (1.0 - vWither);\ntotalEmissiveRadiance += diffuseColor.rgb * 0.22;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = applyFow(gl_FragColor.rgb, vBase);');
    };
    m.customProgramCacheKey = () => 'oddworld-flora';
    gbuf(m, 0);
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.receiveShadow = true;
    mesh.name = detail ? 'flora-detail' : 'flora';
    if (!detail) {
      const dm = new THREE.MeshDepthMaterial({ map: this.atlas.tex, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
      dm.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\n' + VERT_PARS)
          .replace('#include <begin_vertex>', VERT_BEGIN)
          .replace('#include <uv_vertex>', UV_PATCH);
      };
      dm.customProgramCacheKey = () => 'oddworld-flora-depth';
      mesh.customDepthMaterial = dm;
    }
    return mesh;
  }

  /** camera basis for the cards (call each frame before rendering) */
  update(t: number, cam: THREE.Camera) {
    this.U.uTime.value = t;
    const e = cam.matrixWorld.elements;
    const right = this.U.uCamRight.value as THREE.Vector3, back = this.U.uCamBack.value as THREE.Vector3;
    right.set(e[0], 0, e[2]).normalize();
    back.set(e[8], 0, e[10]).normalize();
    // lean the cards back with the camera so they read at nearly full height from a steep view
    const pitch = Math.asin(Math.min(1, Math.max(-1, e[9])));
    const lean = pitch * 0.62;
    this.U.uLean.value = lean;
    this.U.uHComp.value = 1 / Math.max(0.7, Math.cos(pitch - lean));
  }

  /** movers that part the plants: [x, z, radius, strength] */
  setPush(list: [number, number, number, number][]) {
    const arr = this.U.uPush.value as THREE.Vector4[];
    for (let i = 0; i < 12; i++) { const p = list[i]; if (p) arr[i].set(p[0], p[1], p[2], p[3]); else arr[i].set(0, 0, 0, 0); }
  }

  // ---------------------------------------------------------------- simulation hooks
  near(x: number, z: number, rad: number, fn: (i: number, d2: number) => void) {
    const c0 = Math.floor((x - rad) / 4), c1 = Math.floor((x + rad) / 4), r0 = Math.floor((z - rad) / 4), r1 = Math.floor((z + rad) / 4);
    for (let cz = r0; cz <= r1; cz++) for (let cx = c0; cx <= c1; cx++) {
      const c = this.cells.get((cz << 8) | cx); if (!c) continue;
      for (const i of c) { const d2 = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d2 <= rad * rad) fn(i, d2); }
    }
  }
  /** re-seat plants after the ground moved: they ride the earth up or down; drowned ones die back */
  reseat(x: number, z: number, rad: number) {
    for (const g of [this.mesh.geometry, this.detail.geometry]) {
      const pa = g.getAttribute('iPos') as THREE.InstancedBufferAttribute, a = pa.array as Float32Array;
      for (let i = 0; i < pa.count; i++) {
        const px = a[i * 3], pz = a[i * 3 + 2];
        if ((px - x) ** 2 + (pz - z) ** 2 > rad * rad) continue;
        a[i * 3 + 1] = this.region.heightAt(px, pz);
      }
      pa.needsUpdate = true;
    }
    this.near(x, z, rad, (i) => { if (this.region.heightAt(this.x[i], this.z[i]) < this.region.water - 0.05 && this.bio[i] > 0) { this.bio[i] = 0; this.setHealth(i); } });
  }
  /** take up to amt (fraction of the plant); returns biomass gained */
  eat(i: number, amt: number): number {
    const take = Math.min(this.bio[i], amt);
    if (take <= 0) return 0;
    this.bio[i] -= take;
    this.setHealth(i);
    this.recovering.add(i);
    return take * this.species[this.sp[i]].food;
  }
  private setHealth(i: number) {
    const a = this.param.array as Float32Array;
    a[i * 4 + 2] = this.bio[i];
    this.param.addUpdateRange(i * 4 + 2, 1);
    this.param.needsUpdate = true;
  }
  /** regrowth tick */
  tick(dt: number) {
    for (const i of this.recovering) {
      const sp = this.species[this.sp[i]];
      this.bio[i] = Math.min(1, this.bio[i] + dt / sp.regrow);
      this.setHealth(i);
      if (this.bio[i] >= 1) this.recovering.delete(i);
    }
  }
}
