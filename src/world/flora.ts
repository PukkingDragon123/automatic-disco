// Flora: plant instances on the region (food for herbivores, life force for the Veyr), grown as real 3D plants
// near the camera and drawn as their painted sprites far away, over a dense layer of 3D ground cover (grass
// tussocks, sedges, meadow flowers, clover, young ferns, mushrooms) with pebble, litter and twig decals.
//
// Each species is grown (plantStyle) into a few variant structures; each structure is rasterised into the sprite
// atlas (the far LOD) and meshed (floraMesh) with hi-res painted leaves, fronds, blades and bark (floraTex). Instances
// are sorted into 8 m chunks per draw (floraBatch) and only chunks in view are drawn, 3D near, cards far, with a
// dithered cross-fade. Everything moves in the shared wind field and in a physical spring field (floraField): what
// walks through pushes the growth aside, heavy things trample it flat for a while, blasts whip it about.
//
// PUBLIC API (other systems):
//   x, z, sp, bio, n, species, near(), eat(), tick(), reseat(), shade        simulation (unchanged)
//   push(x, z, r, s)      hold growth aside this frame (call every frame while something is there): r metres,
//                         s 0.3 brush past .. 1 heavy (tramples above ~0.45). setPush(list) does this for a list.
//   impulse(x, z, r, s)   one-off outward kick (explosions, impacts): s 0.5 gust .. 3 blast (flattens above ~0.8)
//   trampledAt(x, z)      0..1 how flattened the growth is
//   setGraft(i, k, fac)   modified look (steel sheath climbing from the root, veins in faction colour 0 Veyr..3)
//   setDissolve(i, k)     absorbed plant dissolves in sparks; setGrow(i, k) sown plants grow in
//   setTint(i, rgb, k)    generic per-plant colour hook (0 off .. 1 full), e.g. poisoned, highlighted
//   addPlant(kind, seed, x, z) -> index (spare slots), remove(i)
import * as THREE from 'three';
import { Region } from './region';
import { makeFlora, buildFloraAtlas, type PlantSpecies, type FloraAtlas } from './plantArt';
import type { GroundKind } from './groundArt';
import { B } from './blockTex';
import { Rand, hash01 } from '../core/rand';
import { VEYR, RIVALS } from './palette';
import { FloraTex } from './floraTex';
import { meshPlant, meshBarrel, meshCrystal, meshLily, meshGround, bladeSetOf, type GroundForm, type PlantGeo } from './floraMesh';
import { FloraField } from './floraField';
import { Batch, CH } from './floraBatch';
import { plant3dMaterial, cardMaterial, STATE_W } from './floraGL';
import { settings, onSettings, type Quality } from '../settings';

/** spare instance slots for plants sown during play */
const SPARE = 320;
/** sqrt-based length (Math.hypot is several times slower in the hot loops) */
const hyp = (a: number, b: number, c = 0) => Math.sqrt(a * a + b * b + c * c);
/** wind strength by biome: open steppe and savanna are windy, the jungle floor is still */
const WIND: Partial<Record<string, number>> = { meadow: 1, jungle: 0.55, savanna: 1.15, marsh: 0.8, highland: 1.2, tundra: 1.25, desert: 1.05, crystal: 0.9, ashland: 0.9, coast: 1.2 };
const STIFF: Partial<Record<GroundKind, number>> = { grass: 1.2, tall: 1.45, dry: 1.1, sedge: 1.0, flower: 1.0, fern: 0.6, clover: 0.2, mush: 0.05, pebble: 0, litter: 0, twig: 0 };
/** ground cover kinds grown in 3D near the camera, and how many variants each has */
const GROUND3D: Partial<Record<GroundKind, [GroundForm, number]>> = { grass: ['grass', 3], tall: ['tall', 2], dry: ['dry', 2], sedge: ['sedge', 2], clover: ['clover', 2], flower: ['flower', 4], fern: ['fern', 2], mush: ['mush', 2] };
/** how a plant kind bends: wind flex, push response */
const BENDS: Record<string, [number, number]> = {
  tuft: [0.5, 1], reed: [0.4, 0.8], fern: [0.26, 0.7], shrub: [0.12, 0.35], broadleaf: [0.028, 0.03], umbrella: [0.03, 0.03], palm: [0.06, 0.04], weeper: [0.04, 0.04],
  spike: [0.3, 0.75], rosette: [0.05, 0.2], coral: [0.06, 0.3], fungus: [0.02, 0.15], bulb: [0.3, 0.7], barrel: [0.0, 0.02], crystalbloom: [0.0, 0.0], lily: [0.05, 0.2], eyeflower: [0.25, 0.7], fiddle: [0.22, 0.6],
};
/**
 * LOD ranges per quality tier (camera distance, metres): full 3D fades to the lighter 3D mesh over near, that to the
 * painted cards over plant (small plants: small); 3D ground cover fades to its cards over ground. Low keeps full 3D
 * within ~10 m only (shrubs on their light mesh), cards beyond, and half the grass.
 */
type R2 = [number, number];
interface LodSet { near: R2; plant: R2; small: R2; ground: R2; grassKeep: number; low: boolean }
const LODS: Record<Quality, LodSet> = {
  high: { near: [21, 23.5], plant: [59, 64], small: [44, 48], ground: [42, 46], grassKeep: 1, low: false },
  medium: { near: [12, 14], plant: [32, 36], small: [24, 27], ground: [24, 27], grassKeep: 1, low: false },
  low: { near: [8, 10], plant: [8, 10], small: [8, 10], ground: [8, 10], grassKeep: 2, low: true },
};
/** plants shorter than this hand over to their cards at the nearer LOD_SMALL range */
const SMALL_H = 1.25;

const I3D: [string, number, number][] = [['iA', 4, 0], ['iB', 4, 4]];
const ICARD: [string, number, number][] = [['cA', 4, 0], ['cB', 4, 4], ['cR', 4, 8], ['cC', 4, 12]];

export class Flora {
  readonly species: PlantSpecies[];
  /** the painted sprites (far LOD, ground decals) */
  readonly atlas: FloraAtlas;
  /** the hi-res 3D textures */
  readonly tex: FloraTex;
  /** the physical push / trample field */
  readonly field: FloraField;
  n = 0;
  x!: Float32Array; z!: Float32Array; sp!: Uint8Array; bio!: Float32Array;
  /** spatial hash: cell (4 m) -> plant indices */
  private cells = new Map<number, number[]>();
  /** far-LOD plant cards and ground-cover cards (kept for compatibility) */
  readonly mesh: THREE.Mesh;
  readonly detail: THREE.Mesh;
  readonly U: Record<string, THREE.IUniform>;
  private recovering = new Set<number>();
  shade!: Float32Array;
  readonly group = new THREE.Group();
  /** per-species, per-variant, per-LOD 3D draws */
  private p3d: Batch[][][] = [];
  private pGeo: PlantGeo[][][] = [];
  private pCards!: Batch;
  private g3d: Batch[] = [];
  private gFar!: Batch; private gAlways!: Batch;
  private all: Batch[] = [];
  private nc: number;
  private chunkY: Float32Array;
  private state: Uint8Array; private stateTex: THREE.DataTexture; private stateRows = [1e9, -1]; private stateUp = false;
  private variants = 3;
  private lastT = -1;
  readonly stats = { gen: 0, tris3d: 0, batches: 0, drawn: 0, inst3d: 0, tAtlas: 0, tPlace: 0, tPlants: 0, tGround: 0, tMesh: 0 };
  private frustum = new THREE.Frustum(); private pm = new THREE.Matrix4();

  constructor(readonly region: Region, moss: THREE.Texture, vis: THREE.Texture) {
    const t0 = performance.now();
    const pal = region.pal, N = region.N;
    this.species = makeFlora(pal, region.biome.key, region.seed);
    this.atlas = buildFloraAtlas(this.species, pal, region.seed, this.variants);
    this.stats.tAtlas = performance.now() - t0;
    this.tex = new FloraTex(region.seed);
    this.field = new FloraField(N);
    this.nc = Math.ceil(N / CH);
    this.chunkY = new Float32Array(this.nc * this.nc * 2);
    for (let c = 0; c < this.nc * this.nc; c++) { this.chunkY[c * 2] = 1e9; this.chunkY[c * 2 + 1] = -1e9; }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const c = Math.floor(z / CH) * this.nc + Math.floor(x / CH), h = region.h[z * N + x];
      this.chunkY[c * 2] = Math.min(this.chunkY[c * 2], h); this.chunkY[c * 2 + 1] = Math.max(this.chunkY[c * 2 + 1], h);
    }
    this.U = {
      uTime: { value: 0 }, uN: { value: N }, uLean: { value: 0.42 }, uHComp: { value: 1.08 },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamBack: { value: new THREE.Vector3(0, 0, 1) }, uCamPos: { value: new THREE.Vector3(0, 50, 0) },
      // LOD bands (set by setQuality): 3D near / light 3D per category (big, small, shrub), ground, and the card fades
      uLod: { value: new THREE.Vector2() }, uLodS: { value: new THREE.Vector2() }, uLodGr: { value: new THREE.Vector2() },
      uLodA: { value: new THREE.Vector4() }, uLodB: { value: new THREE.Vector4() }, uLodBs: { value: new THREE.Vector4() },
      uLodAsh: { value: new THREE.Vector4() }, uLodBsh: { value: new THREE.Vector4() }, uLodG: { value: new THREE.Vector4() },
      uMoss: { value: moss }, uVis: { value: vis }, uDark: { value: new THREE.Color(0x07080c) },
      uField: { value: this.field.tex }, uBark: { value: this.tex.bark },
      uWindDir: { value: new THREE.Vector2(Math.cos(region.seed * 1.7), Math.sin(region.seed * 1.7)) }, uWind: { value: WIND[region.biome.key] ?? 1 },
      uGraftCol: { value: [VEYR.vein, ...RIVALS.map((r) => r.vein)].slice(0, 4).map((c) => new THREE.Color(c)) },
      uBloom: { value: Array.from({ length: 8 }, (_, i) => new THREE.Color(pal.bloom[i % pal.bloom.length]).convertSRGBToLinear()) },
    };
    let tq = performance.now();
    const { inst, det } = this.place();
    this.stats.tPlace = performance.now() - tq; tq = performance.now();
    const cap = inst.length + SPARE;
    // per-plant state (2 texels each)
    const rows = Math.ceil((cap * 2) / STATE_W);
    this.state = new Uint8Array(STATE_W * rows * 4);
    for (let i = 0; i < this.n; i++) { this.state[i * 8] = 255; this.state[i * 8 + 3] = 255; }
    this.stateTex = new THREE.DataTexture(this.state, STATE_W, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.stateTex.magFilter = this.stateTex.minFilter = THREE.NearestFilter; this.stateTex.generateMipmaps = false; this.stateTex.flipY = false;
    this.stateTex.needsUpdate = true; this.stateTex.onUpdate = () => { this.stateUp = true; };
    this.U.uState = { value: this.stateTex };
    const grow = <T extends Float32Array | Uint8Array>(a: T, b: T) => { b.set(a); return b; };
    this.x = grow(this.x, new Float32Array(cap)); this.z = grow(this.z, new Float32Array(cap));
    this.sp = grow(this.sp, new Uint8Array(cap)); this.bio = grow(this.bio, new Float32Array(cap));
    this.buildPlants(inst);
    this.stats.tPlants = performance.now() - tq; tq = performance.now();
    this.buildGround(det);
    this.stats.tGround = performance.now() - tq;
    this.mesh = this.pCards.mesh; this.detail = this.gFar.mesh;
    this.tex.finish();
    for (const b of this.all) this.group.add(b.mesh);
    this.stats.batches = this.all.length;
    this.setQuality(settings.quality);
    this.offSettings = onSettings((st, ch) => { if (ch.includes('quality')) this.setQuality(st.quality); });
    this.stats.gen = performance.now() - t0;
  }

  // ---------------------------------------------------------------- placement (where everything grows)
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

  private isSmall(s: PlantSpecies) { return !s.tree && s.hmax < SMALL_H + 0.3 && s.arch !== 'shrub'; }
  private chunk(x: number, z: number) { const nc = this.nc; return Math.min(nc - 1, Math.max(0, Math.floor(z / CH))) * nc + Math.min(nc - 1, Math.max(0, Math.floor(x / CH))); }

  // ---------------------------------------------------------------- plants: 3D near, cards far
  /** one plant's 3D record: x y z yaw | scale id seed flex */
  private rec3d(i: number, x: number, y: number, z: number, seed: number, out: number[] = []) {
    out.push(x, y, z, hash01(i, seed, 41) * Math.PI * 2, 0.9 + hash01(i, seed, 43) * 0.2, i, hash01(i, 7, seed), 0.8 + hash01(i, 3, seed) * 0.4);
    return out;
  }
  /** one plant's card record (far LOD) */
  private recCard(i: number, x: number, y: number, z: number, spi: number, v: number, seed: number, out: number[] = []) {
    const s = this.species[spi], spr = s.sprites[v], k = 0.92 + hash01(i, seed, 5) * 0.16, flat = s.arch === 'lily';
    const stiff = s.tree ? 0.35 : flat ? 1 : 0.75 + hash01(i, seed, 9) * 0.4;
    out.push(x, y, z, (hash01(i, seed, 13) < 0.5 ? 1 : -1) * (flat ? 2 : 1), spr.w * k, spr.h * k, hash01(i, seed, 17) * 6.28, stiff, spr.u0, spr.v0, spr.du, spr.dv, i, s.anim, 0.8 + hash01(i, seed, 19) * 0.45, this.isSmall(s) ? 2 : 1);
    return out;
  }
  private buildPlants(inst: number[][]) {
    const nc2 = this.nc * this.nc, sp = this.species, V = this.variants;
    const per3d: number[][][][] = sp.map(() => Array.from({ length: V }, () => [] as number[][]));
    const perCard: number[][] = [];
    inst.forEach((p, i) => {
      const c = this.chunk(p[0], p[2]), v = p[4] % V;
      this.rec3d(i, p[0], p[1], p[2], 1, (per3d[p[3]][v][c] ??= []));
      this.recCard(i, p[0], p[1], p[2], p[3], p[4], 1, (perCard[c] ??= []));
    });
    let tris = 0;
    sp.forEach((s, si) => {
      this.p3d[si] = []; this.pGeo[si] = [];
      const bset = bladeSetOf(s.forms ?? []);
      const [flex, pushK] = BENDS[s.arch] ?? [0.2, 0.5];
      const shadow = s.tree || s.hmax > 1.05 || s.arch === 'shrub';
      for (let v = 0; v < V; v++) {
        const form = s.forms?.[v], h = s.heights?.[v] ?? s.hmax, seed = this.region.seed * 131 + si * 17 + v;
        const pgs: PlantGeo[] = [], tm = performance.now();
        if (form) { pgs.push(meshPlant(form, s, this.tex, seed, bset, 0), meshPlant(form, s, this.tex, seed, bset, 1)); s.forms![v] = null; }
        else {
          const pg = s.arch === 'barrel' ? meshBarrel(s, h, this.tex, seed) : s.arch === 'crystalbloom' ? meshCrystal(s, h, this.tex, seed, this.region.pal) : meshLily(s, h, this.tex, seed);
          pgs.push(pg, pg);
        }
        this.stats.tMesh += performance.now() - tm;
        this.pGeo[si][v] = pgs; this.p3d[si][v] = [];
        pgs.forEach((pg, lod) => {
          tris += pg.tris;
          const small = this.isSmall(s), shrub = s.arch === 'shrub', U = this.U;
          const band = lod ? (shrub ? U.uLodBsh : small ? U.uLodBs : U.uLodB) : shrub ? U.uLodAsh : U.uLodA;
          const { mat, depth } = plant3dMaterial(this.U, this.tex.tex, { uH: pg.H, uFlex: flex, uPushK: pushK, uBob: s.arch === 'lily' ? 1 : 0, lod: band });
          const b = new Batch(`flora3d:${s.arch}:${v}:${lod}`, pg.geo, mat, shadow ? depth : null, 8, I3D, per3d[si][v], nc2, 24);
          this.p3d[si][v][lod] = b; this.all.push(b);
        });
      }
    });
    this.stats.tris3d = tris;
    const { mat, depth } = cardMaterial(this.U, this.atlas.tex, false, true);
    this.pCards = new Batch('flora-cards', cardGeo(4), mat, depth, 16, ICARD, perCard, nc2, SPARE);
    this.all.push(this.pCards);
  }

  // ---------------------------------------------------------------- ground cover
  private buildGround(det: number[][]) {
    const nc2 = this.nc * this.nc, info = this.atlas.detailInfo, pal = this.region.pal;
    const forms: { key: string; form: GroundForm; v: number; per: number[][] }[] = [];
    const formIdx = new Map<string, number>();
    const farCards: number[][] = [], alwaysCards: number[][] = [];
    const r = new Rand(this.region.seed ^ 0xd7);
    det.forEach((p, j) => {
      const gi = info[p[3]], s = this.atlas.detail[p[3]], c = this.chunk(p[0], p[2]);
      const g3 = GROUND3D[gi.kind];
      const k = r.range(0.85, 1.15), stiff = (STIFF[gi.kind] ?? 1) * r.range(0.75, 1.3);
      const L = ((g3 ? farCards : alwaysCards)[c] ??= []);
      L.push(p[0], p[1], p[2], (r.chance(0.5) ? 1 : -1) * (gi.flat ? 2 : 1), s.w * k, s.h * k, r.range(0, 6.28), stiff, s.u0, s.v0, s.du, s.dv, -1, 0, r.range(0.8, 1.25), g3 ? 3 : 0);
      if (!g3) return;
      const [form, nv] = g3, v = gi.kind === 'flower' ? (hash01(gi.tint, 3, this.region.seed) * 4) | 0 : (p[3] + j) % nv;
      const key = form + v;
      let fi = formIdx.get(key);
      if (fi === undefined) { fi = forms.length; formIdx.set(key, fi); forms.push({ key, form, v, per: [] }); }
      const tint = gi.kind === 'flower' ? gi.tint % 8 : 0;
      (forms[fi].per[c] ??= []).push(p[0], p[1], p[2], r.range(0, 6.2832), k, -1, tint + r.range(0, 0.999), r.range(0.75, 1.3));
    });
    for (const f of forms) {
      const pg = meshGround(f.form, f.v, this.tex, pal, this.region.seed);
      const flex = f.form === 'mush' ? 0.02 : f.form === 'clover' ? 0.12 : f.form === 'fern' ? 0.3 : f.form === 'flower' ? 0.38 : 0.55;
      const pushK = f.form === 'mush' ? 0.15 : f.form === 'clover' ? 0.5 : 1;
      const { mat } = plant3dMaterial(this.U, this.tex.tex, { uH: pg.H, uFlex: flex, uPushK: pushK, uGround: true, lod: this.U.uLodG });
      const b = new Batch(`ground3d:${f.key}`, pg.geo, mat, null, 8, I3D, f.per, nc2);
      this.g3d.push(b); this.all.push(b);
      this.stats.tris3d += pg.tris;
    }
    const cg = cardGeo(2);
    const far = cardMaterial(this.U, this.atlas.tex, true, false);
    this.gFar = new Batch('ground-cards', cg, far.mat, null, 16, ICARD, farCards, nc2);
    const alw = cardMaterial(this.U, this.atlas.tex, true, false);
    this.gAlways = new Batch('ground-decals', cg, alw.mat, null, 16, ICARD, alwaysCards, nc2);
    this.all.push(this.gFar, this.gAlways);
  }

  // ---------------------------------------------------------------- quality
  private L: LodSet = LODS.high;
  private offSettings: (() => void) | null = null;
  /** switch LOD tier ('low' | 'medium' | 'high'); follows settings.quality automatically */
  setQuality(q: Quality) {
    const L = (this.L = LODS[q] ?? LODS.high), U = this.U, HIDE: [number, number] = [1e6, 1e6 + 1], ALL: [number, number] = [-2, -1];
    const v4 = (u: THREE.IUniform, a: R2, b: R2) => (u.value as THREE.Vector4).set(a[0], a[1], b[0], b[1]);
    v4(U.uLodA, ALL, L.near); v4(U.uLodB, L.near, L.plant); v4(U.uLodBs, L.near, L.small); v4(U.uLodG, ALL, L.ground);
    // on low, shrubs show their light mesh up close instead of the full one
    if (L.low) { v4(U.uLodAsh, HIDE, HIDE); v4(U.uLodBsh, ALL, L.near); } else { v4(U.uLodAsh, ALL, L.near); v4(U.uLodBsh, L.near, L.plant); }
    (U.uLod.value as THREE.Vector2).set(...(L.low ? L.near : L.plant)); (U.uLodS.value as THREE.Vector2).set(...(L.low ? L.near : L.small)); (U.uLodGr.value as THREE.Vector2).set(...L.ground);
    for (const b of this.all) b.dirty = true;
  }
  /** stop following the settings (call when the world is thrown away) */
  dispose() { this.offSettings?.(); this.offSettings = null; }

  // ---------------------------------------------------------------- per frame
  /** camera basis for the cards, LOD chunk lists, physics field (call each frame before rendering) */
  update(t: number, cam: THREE.Camera) {
    const dt = this.lastT < 0 ? 1 / 60 : Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;
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
    const cp = (this.U.uCamPos.value as THREE.Vector3).set(e[12], e[13], e[14]);
    this.field.step(dt);
    this.cull(cam as THREE.PerspectiveCamera, cp);
    this.flushState();
  }

  private lists = { n0: new Int32Array(4096), n1: new Int32Array(4096), n1s: new Int32Array(4096), far: new Int32Array(4096), gNear: new Int32Array(4096), gFar: new Int32Array(4096), vis: new Int32Array(4096) };
  private box = new THREE.Box3();
  private cull(cam: THREE.PerspectiveCamera, cp: THREE.Vector3) {
    cam.updateMatrixWorld();
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm);
    const nc = this.nc, L = this.lists, box = this.box, M = 2.5, LL = this.L;
    let n0 = 0, n1 = 0, n1s = 0, nF = 0, gN = 0, gF = 0, nV = 0;
    let s0 = 17, s1 = 23, s1s = 29, sF = 31, sGN = 7, sGF = 11, sV = 3;
    const mix = (h: number, c: number) => (Math.imul(h ^ (c + 0x9e37), 0x01000193) >>> 0);
    for (let cz = 0; cz < nc; cz++) for (let cx = 0; cx < nc; cx++) {
      const c = cz * nc + cx, y0 = this.chunkY[c * 2], y1 = this.chunkY[c * 2 + 1];
      if (y0 > 1e8) continue;
      // a margin for crowns overhanging the chunk, bending growth and shadows cast into view
      const x0 = cx * CH, z0 = cz * CH, x1 = x0 + CH, z1 = z0 + CH;
      box.min.set(x0 - M, y0 - 1.5, z0 - M); box.max.set(x1 + M, y1 + 7, z1 + M);
      if (!this.frustum.intersectsBox(box)) continue;
      const qx = Math.max(x0, Math.min(cp.x, x1)), qy = Math.max(y0, Math.min(cp.y, y1 + 3)), qz = Math.max(z0, Math.min(cp.z, z1));
      const dmin = hyp(qx - cp.x, qy - cp.y, qz - cp.z) - M;
      const fx = Math.abs(cp.x - x0) > Math.abs(cp.x - x1) ? x0 : x1, fz = Math.abs(cp.z - z0) > Math.abs(cp.z - z1) ? z0 : z1;
      const dmax = hyp(fx - cp.x, cp.y - y0, fz - cp.z) + M;
      L.vis[nV++] = c; sV = mix(sV, c);
      if (dmin < LL.near[1]) { L.n0[n0++] = c; s0 = mix(s0, c); }
      if (dmax > LL.near[0] && dmin < LL.plant[1]) { L.n1[n1++] = c; s1 = mix(s1, c); }
      if (dmax > LL.near[0] && dmin < LL.small[1]) { L.n1s[n1s++] = c; s1s = mix(s1s, c); }
      if (dmax > Math.min(LL.small[0], LL.plant[0])) { L.far[nF++] = c; sF = mix(sF, c); }
      if (dmin < LL.ground[1]) { L.gNear[gN++] = c; sGN = mix(sGN, c); }
      if (dmax > LL.ground[0]) { L.gFar[gF++] = c; sGF = mix(sGF, c); }
    }
    let drawn = 0, i3 = 0;
    this.p3d.forEach((row, si) => { const s = this.species[si], small = this.isSmall(s), shrub = s.arch === 'shrub'; for (const pair of row) {
      if (LL.low) {
        // low: full 3D up close only (shrubs on their light mesh), nothing in between
        pair[0].rebuild(L.n0, shrub ? 0 : n0, s0); pair[1].rebuild(L.n0, shrub ? n0 : 0, s0 + 1);
      } else {
        pair[0].rebuild(L.n0, n0, s0);
        if (small) pair[1].rebuild(L.n1s, n1s, s1s); else pair[1].rebuild(L.n1, n1, s1);
      }
      drawn += pair[0].count + pair[1].count; i3 += pair[0].count + pair[1].count;
    } });
    for (const b of this.g3d) { b.rebuild(L.gNear, gN, sGN, LL.grassKeep); drawn += b.count; i3 += b.count; }
    this.pCards.rebuild(L.far, nF, sF); this.gFar.rebuild(L.gFar, gF, sGF, LL.grassKeep); this.gAlways.rebuild(L.vis, nV, sV);
    drawn += this.pCards.count + this.gFar.count + this.gAlways.count;
    this.stats.drawn = drawn; this.stats.inst3d = i3;
  }

  /** triangles drawn by the flora this frame (colour pass), by group */
  frameTris() {
    const t = (b: Batch) => b.count * ((b.mesh.geometry.index?.count ?? 0) / 3);
    let plants = 0, ground = 0, cards = 0;
    for (const row of this.p3d) for (const pair of row) for (const b of pair) plants += t(b);
    for (const b of this.g3d) ground += t(b);
    cards = t(this.pCards) + t(this.gFar) + t(this.gAlways);
    return { plants: Math.round(plants), ground: Math.round(ground), cards: Math.round(cards), draws: this.all.filter((b) => b.mesh.visible).length };
  }

  // ---------------------------------------------------------------- physics hooks
  /** movers that part the plants: [x, z, radius, strength] (creatures, each frame) */
  setPush(list: [number, number, number, number][]) { for (const p of list) this.field.push(p[0], p[1], p[2], p[3]); }
  /** hold growth aside this frame (call every frame while something is there): s 0.3 brush .. 1 heavy (tramples) */
  push(x: number, z: number, r: number, s: number) { this.field.push(x, z, r, s); }
  /** one-off outward kick: explosions, thrown rocks landing (s 0.5 gust .. 3 blast; flattens above ~0.8) */
  impulse(x: number, z: number, r: number, s: number) { this.field.impulse(x, z, r, s); }
  /** how flattened the growth is at a point, 0..1 */
  trampledAt(x: number, z: number) { return this.field.trampled(x, z); }

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
    const R = this.region, c0x = Math.floor((x - rad - 1) / CH), c1x = Math.floor((x + rad + 1) / CH), c0z = Math.floor((z - rad - 1) / CH), c1z = Math.floor((z + rad + 1) / CH);
    for (const b of this.all) {
      let hit = false;
      b.forEach(c0x, c0z, c1x, c1z, this.nc, (a, o) => {
        const px = a[o], pz = a[o + 2];
        if ((px - x) ** 2 + (pz - z) ** 2 > rad * rad) return;
        a[o + 1] = R.heightAt(px, pz); hit = true;
      });
      if (hit) b.dirty = true;
    }
    for (let cz = Math.max(0, c0z); cz <= Math.min(this.nc - 1, c1z); cz++) for (let cx = Math.max(0, c0x); cx <= Math.min(this.nc - 1, c1x); cx++) {
      const c = cz * this.nc + cx;
      for (let zz = cz * CH; zz < (cz + 1) * CH; zz++) for (let xx = cx * CH; xx < (cx + 1) * CH; xx++) {
        if (!R.inside(xx, zz)) continue;
        const h = R.h[zz * R.N + xx]; this.chunkY[c * 2] = Math.min(this.chunkY[c * 2], h); this.chunkY[c * 2 + 1] = Math.max(this.chunkY[c * 2 + 1], h);
      }
    }
    this.near(x, z, rad, (i) => { if (R.heightAt(this.x[i], this.z[i]) < R.water - 0.05 && this.bio[i] > 0) { this.bio[i] = 0; this.setHealth(i); } });
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
  private sset(i: number, texel: number, ch: number, v: number) {
    const o = (i * 2 + texel) * 4 + ch, b = Math.max(0, Math.min(255, Math.round(v)));
    if (this.state[o] === b) return;
    this.state[o] = b;
    const row = ((i * 2 + texel) / STATE_W) | 0;
    if (row < this.stateRows[0]) this.stateRows[0] = row;
    if (row > this.stateRows[1]) this.stateRows[1] = row;
  }
  private flushState() {
    const [a, b] = this.stateRows;
    if (b < a) return;
    const t = this.stateTex;
    if (this.stateUp && b - a < 24) for (let r = a; r <= b; r++) t.addUpdateRange(r * STATE_W * 4, STATE_W * 4);
    else t.clearUpdateRanges();
    t.needsUpdate = true;
    this.stateRows[0] = 1e9; this.stateRows[1] = -1;
  }
  private setHealth(i: number) { this.sset(i, 0, 0, this.bio[i] * 255); }

  // ---------------------------------------------------------------- grafting, sowing, tinting (game/hive.ts)
  private fac = new Uint8Array(0); private tintK = new Uint8Array(0);
  private packB(i: number) {
    if (this.fac.length <= i) { const f = new Uint8Array(this.x.length), k = new Uint8Array(this.x.length); f.set(this.fac); k.set(this.tintK); this.fac = f; this.tintK = k; }
    this.sset(i, 1, 3, this.fac[i] * 64 + this.tintK[i]);
  }
  /** modified look: k 0..1 (sheathing climbs from the root), faction colour slot (0 Veyr, 1..3 rivals) */
  setGraft(i: number, k: number, faction: number) {
    this.packB(i); this.fac[i] = Math.max(0, Math.min(3, Math.round(faction))); this.packB(i);
    this.sset(i, 0, 1, k * 255);
  }
  /** dissolve 0..1 (absorbed) */
  setDissolve(i: number, k: number) { this.sset(i, 0, 2, k * 255); }
  /** growth scale 0..1 (sown plants grow in) */
  setGrow(i: number, k: number) { this.sset(i, 0, 3, k * 255); }
  /** generic colour hook: blend the plant toward rgb (0xRRGGBB) by k 0..1 */
  setTint(i: number, rgb: number, k: number) {
    this.packB(i);
    this.sset(i, 1, 0, (rgb >> 16) & 255); this.sset(i, 1, 1, (rgb >> 8) & 255); this.sset(i, 1, 2, rgb & 255);
    this.tintK[i] = Math.max(0, Math.min(63, Math.round(k * 63))); this.packB(i);
  }
  /** take a plant out of the world for good */
  remove(i: number) {
    this.bio[i] = 0; this.setHealth(i); this.recovering.delete(i);
    const c = this.cells.get((Math.floor(this.z[i] / 4) << 8) | Math.floor(this.x[i] / 4));
    if (c) { const k = c.indexOf(i); if (k >= 0) c.splice(k, 1); }
  }
  /** plant a new instance of species `kind` (variant chosen by seed) in a spare slot; returns its index or -1 */
  addPlant(kind: number, seed: number, x: number, z: number): number {
    const sp = this.species[kind];
    if (this.n >= this.x.length || !sp) return -1;
    const i = this.n++, R = this.region, V = this.variants, v = ((seed % V) + V) % V;
    const h = R.heightAt(x, z), ry = R.riverAt(x, z), y = R.isWater(x, z) ? (ry > 0 && h < ry + 0.05 ? ry : R.water) : h;
    const c = this.chunk(x, z);
    for (const b of this.p3d[kind][v]) b.add(c, this.rec3d(i, x, y, z, seed + 1));
    this.pCards.add(c, this.recCard(i, x, y, z, kind, v % sp.sprites.length, seed + 1));
    this.x[i] = x; this.z[i] = z; this.sp[i] = kind; this.bio[i] = 1;
    this.sset(i, 0, 0, 255); this.sset(i, 0, 1, 0); this.sset(i, 0, 2, 0); this.sset(i, 0, 3, 255);
    const key = (Math.floor(z / 4) << 8) | Math.floor(x / 4);
    let cl = this.cells.get(key); if (!cl) this.cells.set(key, (cl = [])); cl.push(i);
    return i;
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

/** a vertical card from x -0.5..0.5, y 0..1 with seg rows */
function cardGeo(seg: number) {
  const g = new THREE.BufferGeometry(), gp: number[] = [], gu: number[] = [], gi: number[] = [];
  for (let k = 0; k <= seg; k++) { const y = k / seg; gp.push(-0.5, y, 0, 0.5, y, 0); gu.push(0, y, 1, y); if (k < seg) { const a = k * 2; gi.push(a, a + 1, a + 3, a, a + 3, a + 2); } }
  g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2));
  g.setIndex(gi);
  return g;
}
