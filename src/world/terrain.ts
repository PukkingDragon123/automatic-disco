// Voxel terrain: 16 x 16-column chunks, Minecraft-style smooth AO, array-texture blocks. The fragment shader tints
// the ground the Veyr and its rivals hold (from a territory texture: a metallic sheen, hairline veins pulsing in the
// owner's colour, a bright seam along the claim's edge) and applies fog of war.
// Ground materials blend by their own pixel structure: every texel is contested by the materials around it (the cells'
// own blocks plus dirt and rock on slopes, sand at the shore and in hollows, mud where it is damp, worn dirt on trodden
// paths, dry grass where the soil is poor) and the one whose texel stands highest wins (a height blend on each tile's
// own brightness): grass blades lap over dirt, sand settles into the cracks between stones, pebbles keep ragged edges.
// It is decided per world texel (32 px/m), so it stays pixel art: no fades, no grain.
// Hooks: ecoData()/ecoFlush() (R moisture, G fertility for src/eco; B trampled wear from game/details.ts), U.uWetG.
import * as THREE from 'three';
import { Region } from './region';
import { BLOCKS, L, TS, TILE_M, TT, FAMILY_SIDE, VEIN_LAYER, buildBlockTexture } from './blockTex';
import { clamp01 } from '../core/rand';
import { gbuf, GN_DECL } from '../gfx/gbuf';
import { VEYR, RIVALS } from './palette';
import { RAMPS } from '../art/palette';


export { SHADER_NOISE, FOW_FN } from './glsl';
import { SHADER_NOISE, FOW_FN } from './glsl';
import { makeSea, makeRivers } from './water';
import { Rocks } from './rocks';

/** the ground's texel grid (blockTex.TS texels per metre) as GLSL literals: the grid itself, the painted tile size in
 *  metres and texels */
const TSF = TS.toFixed(1), TMF = TILE_M.toFixed(1), TTF = TT.toFixed(1);

export class Terrain {
  readonly group = new THREE.Group();
  readonly mat: THREE.MeshLambertMaterial;
  readonly moss: THREE.DataTexture;
  readonly vis: THREE.DataTexture;
  readonly heightTex: THREE.DataTexture;
  readonly matTex: THREE.DataTexture;
  readonly shadeTex: THREE.DataTexture;
  readonly dampTex: THREE.DataTexture;
  /** RGBA N x N: R moisture, G fertility (src/eco writes these), B trampled wear (details.ts), A reserved */
  readonly ecoTex: THREE.DataTexture;
  /** burnt ground per cell 0..1 (scorch), fading back through dry soil over a few days */
  readonly burn: Float32Array; private burnTex: THREE.DataTexture; private burnLive = false; private burnT = -1;
  /** geology per cell (setGeo): R rock family, G ore-vein strength, B ore kind, A spare */
  private geoTex: THREE.DataTexture;
  /** the ecology map's bytes; write R (moisture) and G (fertility) 0..255 per column, then ecoFlush() */
  ecoData() { return this.ecoTex.image.data as Uint8Array; }
  ecoFlush() { this.ecoTex.needsUpdate = true; }
  /** moisture and fertility (0..1) for one column */
  setEco(x: number, z: number, moisture: number, fertility: number) {
    const N = this.region.N, i = (Math.min(N - 1, Math.max(0, Math.floor(z))) * N + Math.min(N - 1, Math.max(0, Math.floor(x)))) * 4, d = this.ecoData();
    d[i] = Math.round(clamp01(moisture) * 255); d[i + 1] = Math.round(clamp01(fertility) * 255);
  }
  readonly U: Record<string, THREE.IUniform>;
  readonly avg: number[];
  /** how long painting the ground took (ms) */
  readonly texMs: number;
  waterMesh: THREE.Mesh;
  riverMesh: THREE.Mesh | null;
  readonly rocks: Rocks;
  private mesh!: THREE.Mesh;
  private geo!: THREE.BufferGeometry;

  constructor(readonly region: Region) {
    const N = region.N;
    const { tex, avg, ms } = buildBlockTexture(region.pal, region.seed);
    this.texMs = ms;
    this.avg = avg;
    const mk = (data: Uint8Array | Float32Array, type: THREE.TextureDataType, fmt: THREE.PixelFormat = THREE.RGBAFormat, nearest = false) => {
      const t = new THREE.DataTexture(data, N, N, fmt, type);
      t.magFilter = t.minFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      return t;
    };
    this.moss = mk(new Uint8Array(N * N * 4), THREE.UnsignedByteType);
    const vd = new Uint8Array(N * N * 4); vd.fill(255);
    this.vis = mk(vd, THREE.UnsignedByteType);
    this.heightTex = mk(new Float32Array(N * N), THREE.FloatType, THREE.RedFormat, true);
    this.matTex = mk(new Uint8Array(N * N), THREE.UnsignedByteType, THREE.RedFormat, true);
    this.shadeTex = mk(new Uint8Array(N * N).fill(255), THREE.UnsignedByteType, THREE.RedFormat);
    this.dampTex = mk(Uint8Array.from(region.damp, (v) => Math.round(clamp01(v) * 255)), THREE.UnsignedByteType, THREE.RedFormat);
    // ecology: R moisture, G fertility (seeded from the region, rewritten by src/eco), B trampled wear (details.ts)
    const eco = new Uint8Array(N * N * 4);
    for (let i = 0; i < N * N; i++) { eco[i * 4] = Math.round(clamp01(region.damp[i] * 0.6 + region.wet[i] * 0.4) * 255); eco[i * 4 + 1] = Math.round(clamp01(region.fert[i]) * 255); eco[i * 4 + 3] = 255; }
    this.ecoTex = mk(eco, THREE.UnsignedByteType);
    this.burn = new Float32Array(N * N);
    this.burnTex = mk(new Uint8Array(N * N), THREE.UnsignedByteType, THREE.RedFormat);
    const geo0 = (region as unknown as { geo?: Uint8Array }).geo;
    this.geoTex = mk(geo0 && geo0.length === N * N * 4 ? Uint8Array.from(geo0) : new Uint8Array(N * N * 4), THREE.UnsignedByteType, THREE.RGBAFormat, true);
    // each layer's mean brightness (linear): a texel brighter than its tile's mean stands proud in the height blend
    const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const avgL = avg.map((c) => lin((c >> 16) & 255) * 0.3 + lin((c >> 8) & 255) * 0.59 + lin(c & 255) * 0.11);
    while (avgL.length < 48) avgL.push(0.3);
    // material id -> two array-layer variants
    const lay: number[] = [];
    for (let b = 0; b < 16; b++) { const d = BLOCKS[b] ?? BLOCKS[0]; lay.push(d.top[0], d.top[d.top.length - 1]); }
    this.U = {
      uBlocks: { value: tex }, uMoss: { value: this.moss }, uVis: { value: this.vis }, uHeight: { value: this.heightTex }, uMat: { value: this.matTex }, uShade: { value: this.shadeTex }, uDamp: { value: this.dampTex },
      uLay: { value: lay }, uRockSide: { value: L.rockSide }, uEco: { value: this.ecoTex }, uBurn: { value: this.burnTex }, uGeo: { value: this.geoTex }, uFamLay: { value: FAMILY_SIDE.slice() }, uVeinLay: { value: VEIN_LAYER.slice() }, uAvgL: { value: avgL }, uWetG: { value: 0 },
      // per block kind: how far its texels stand proud (+) or settle (-) in a blend, and how much it darkens wet
      uHB: { value: [0.09, 0.07, -0.04, 0.07, -0.09, -0.1, -0.02, 0.1, 0.05, 0.05, 0.08, 0.02, 0.0, 0.0, 0, 0] },
      uAbs: { value: [0.55, 0.6, 1, 0.2, 1, 0.6, 0.9, 0, 0.2, 0.2, 0, 0.7, 0.4, 0.3, 0, 0] },
      uN: { value: N }, uTime: { value: 0 }, uCore: { value: new THREE.Vector3(region.landing.x, 0, region.landing.z) },
      uVein: { value: new THREE.Color(VEYR.vein) }, uMossLight: { value: new THREE.Color(VEYR.mossLight) },
      uRivalVein: { value: new THREE.Color(RIVALS[0].vein) }, uRivalLayer: { value: L.creep0 }, uRivalCore: { value: new THREE.Vector3(-999, 0, -999) },
      uDark: { value: new THREE.Color(0x07080c) }, uVeinGain: { value: 1 },
      uWater: { value: region.water },
      // the seasonal water stage (eco.level) the sea and river surfaces ride on (water.ts)
      uStage: { value: 0 },
      // the procedural ground: each block kind's shadow, body and lit colours (linear), the sky seen in puddles,
      // lichen, the prevailing wind (blade streaks, ripples, drifts), and the climate's terms (setClimate)
      uSnow: { value: 0 }, uFrost: { value: 0 }, uDry: { value: 0 }, uFrostC: { value: new THREE.Color(RAMPS.snow[5]) },
      // the height over the water where snow lies all year: low in cold country, out of reach in hot
      uSnowLine: { value: 8 + region.biome.temp * 26 },
    };
    this.mat = this.makeMaterial();
    this.buildMesh();
    this.syncMaps();
    this.waterMesh = makeSea(region, this.U);
    this.group.add(this.waterMesh);
    this.riverMesh = makeRivers(region, this.U);
    if (this.riverMesh) this.group.add(this.riverMesh);
    this.rocks = new Rocks(region, this.U);
    this.group.add(this.rocks.mesh);
  }

  setRival(k: number, x: number, z: number) {
    this.U.uRivalVein.value = new THREE.Color(RIVALS[k].vein);
    this.U.uRivalLayer.value = [L.creep0, L.creep1, L.creep2][k];
    (this.U.uRivalCore.value as THREE.Vector3).set(x, 0, z);
  }
  /** heights and materials -> textures */
  syncMaps() {
    (this.heightTex.image.data as Float32Array).set(this.region.h);
    this.heightTex.needsUpdate = true;
    (this.matTex.image.data as Uint8Array).set(this.region.b);
    this.matTex.needsUpdate = true;
  }
  syncHeight() { this.syncMaps(); }
  /** canopy shade (0 dark .. 1 open sky) from the flora */
  setShade(sh: Float32Array) {
    const d = this.shadeTex.image.data as Uint8Array;
    for (let i = 0; i < d.length; i++) d[i] = Math.round(clamp01(sh[i]) * 255);
    this.shadeTex.needsUpdate = true;
  }
  /** rebuild after the ground changed (craters, camps) */
  flushDirty() {
    if (!this.region.dirty.size) return;
    this.rocks.reseat(this.region.dirty);
    this.region.dirty.clear();
    this.writeVerts();
    this.syncMaps();
  }

  private vh(x: number, z: number) {
    // height at a cell corner: average of the (up to) four cells meeting there
    const R = this.region, N = R.N;
    let s = 0, c = 0;
    for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue; s += R.h[Z * N + X]; c++; }
    return c ? s / c : 0;
  }
  private buildMesh() {
    const N = this.region.N, V = N + 1;
    const g = (this.geo = new THREE.BufferGeometry());
    const pos = new Float32Array((V * V + V * 4 * 2) * 3), nor = new Float32Array(pos.length);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // how far each corner sits below its surroundings (hollows fill with sand or mud)
    g.setAttribute('aHol', new THREE.BufferAttribute(new Float32Array(pos.length / 3), 1));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    const idx: number[] = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const a = z * V + x, b = a + 1, c = a + V, d = c + 1;
      if ((x + z) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    // skirt: a lip folding down around the edge so the world reads as a cut piece of land
    let k = V * V;
    const ring: number[] = [];
    for (let x = 0; x < N; x++) ring.push(x);
    for (let z = 0; z < N; z++) ring.push(z * V + N);
    for (let x = N; x > 0; x--) ring.push(N * V + x);
    for (let z = N; z > 0; z--) ring.push(z * V);
    this.skirt = ring;
    for (let i = 0; i < ring.length; i++) {
      const top = ring[i], nxt = ring[(i + 1) % ring.length];
      const bt = k + i, bn = k + ((i + 1) % ring.length);
      idx.push(top, bt, nxt, nxt, bt, bn);
    }
    g.setIndex(idx);
    this.writeVerts();
    const m = (this.mesh = new THREE.Mesh(g, this.mat));
    m.receiveShadow = true; m.castShadow = true; m.name = 'terrain';
    m.frustumCulled = false;
    this.group.add(m);
  }
  private skirt: number[] = [];
  private writeVerts() {
    const N = this.region.N, V = N + 1, g = this.geo;
    const pos = g.attributes.position.array as Float32Array, nor = g.attributes.normal.array as Float32Array;
    for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) { const i = (z * V + x) * 3; pos[i] = x; pos[i + 1] = this.vh(x, z); pos[i + 2] = z; }
    for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) {
      const hl = this.vh(Math.max(0, x - 1), z), hr = this.vh(Math.min(N, x + 1), z), hd = this.vh(x, Math.max(0, z - 1)), hu = this.vh(x, Math.min(N, z + 1));
      const nx = hl - hr, nz = hd - hu, ny = 2, l = Math.hypot(nx, ny, nz);
      const i = (z * V + x) * 3; nor[i] = nx / l; nor[i + 1] = ny / l; nor[i + 2] = nz / l;
    }
    const hol = g.attributes.aHol.array as Float32Array;
    for (let z = 0; z <= N; z++) for (let x = 0; x <= N; x++) {
      const a = (this.vh(Math.max(0, x - 2), z) + this.vh(Math.min(N, x + 2), z) + this.vh(x, Math.max(0, z - 2)) + this.vh(x, Math.min(N, z + 2))) * 0.25;
      hol[z * V + x] = a - this.vh(x, z);
    }
    g.attributes.aHol.needsUpdate = true;
    const k = V * V;
    this.skirt.forEach((t, j) => { const o = (k + j) * 3; pos[o] = pos[t * 3]; pos[o + 1] = pos[t * 3 + 1] - 3; pos[o + 2] = pos[t * 3 + 2]; nor[o] = nor[t * 3]; nor[o + 1] = 0.2; nor[o + 2] = nor[t * 3 + 2]; });
    g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
    g.computeBoundingSphere();
  }

  private makeMaterial() {
    const m = new THREE.MeshLambertMaterial();
    const U = this.U;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute float aHol;
varying vec3 vWp; varying vec3 vNw; varying float vHol;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vec4 wpos4 = modelMatrix * vec4(transformed, 1.0);
vWp = wpos4.xyz; vNw = normalize(mat3(modelMatrix) * objectNormal); vHol = aHol;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform highp sampler2DArray uBlocks;
uniform sampler2D uMoss, uVis, uMat, uShade, uDamp, uEco, uBurn, uGeo;
uniform float uN, uTime, uRivalLayer, uVeinGain, uRockSide, uWetG, uWater;
uniform float uLay[32];
uniform float uAvgL[48];
uniform float uFamLay[7];
uniform float uVeinLay[7];
uniform float uHB[16];
uniform float uAbs[16];
uniform vec3 uCore, uVein, uMossLight, uRivalVein, uRivalCore, uDark;
varying vec3 vWp; varying vec3 vNw; varying float vHol;
${SHADER_NOISE}
${FOW_FN}
int matAt(vec2 cell) { return int(floor(texture2D(uMat, (clamp(cell, vec2(0.0), vec2(uN - 1.0)) + 0.5) / uN).r * 255.0 + 0.5)); }
/** a painted tile's texel offset for one cell of the stochastic grid (whole texels, so the art stays on its grid) */
vec2 tOff(vec2 c, float lay) { return floor(vec2(h2(c * 1.37 + lay * 7.13 + 0.5), h2(c * 2.11 + vec2(31.7, 3.3) + lay * 3.31)) * ${TTF}) / ${TSF}; }
/**
 * One material layer at p (metres) with no visible repeat: the plane is cut into tile-sized cells on a warped grid,
 * each cell samples the painted tile at its own random offset, and across a band either side of a cell border the two
 * cells contend texel by texel (the brighter, prouder texel wins, more so the nearer its own cell), so the seam is a
 * ragged line through the art's own clusters rather than a straight cut.
 */
// the stochastic grid at this fragment (blkGrid sets it once; every layer reuses it)
vec2 sgC, sgN, sgGu, sgGv; float sgD;
void blkGrid(vec2 p, vec2 gx, vec2 gy) {
  vec2 w = (vec2(vn(p * 0.37 + 2.3), vn(p * 0.37 + 9.1)) - 0.5) * 0.9;
  vec2 q = (p + w) / ${TMF}, f;
  sgC = floor(q); f = q - sgC;
  vec2 e = min(f, 1.0 - f);
  sgD = min(e.x, e.y);
  sgN = sgC + (e.x < e.y ? vec2(f.x < 0.5 ? -1.0 : 1.0, 0.0) : vec2(0.0, f.y < 0.5 ? -1.0 : 1.0));
  sgGu = gx / ${TMF}; sgGv = gy / ${TMF};
}
vec4 blk(float lay, vec2 p) {
  vec4 a = textureGrad(uBlocks, vec3((p + tOff(sgC, lay)) / ${TMF}, lay), sgGu, sgGv);
  const float band = 0.07;
  if (sgD > band) return a;
  vec4 b = textureGrad(uBlocks, vec3((p + tOff(sgN, lay)) / ${TMF}, lay), sgGu, sgGv);
  float la = dot(a.rgb, vec3(0.3, 0.59, 0.11)), lb = dot(b.rgb, vec3(0.3, 0.59, 0.11));
  float wb = 0.5 * (1.0 - sgD / band);
  return (lb - la) * 2.2 + (wb - 0.5) * 1.6 > 0.0 ? b : a;
}
// ---------------------------------------------------------------- the pixel-art ground
// Every texel is a pixel of a hand-drawn tile (blockTex.ts). The land only chooses: which material a pixel belongs to
// (the cell's block kind, dirt on slopes and trodden paths, sand at the shore, mud where it is wet, scree in gullies,
// stone on worn ridges, snow by season and height) and which painted variant (lush or thin grass, smooth or stony
// soil, bare or lichen-crusted rock, rippled or flat sand). Neighbours contend pixel by pixel: a pixel brighter than its
// tile's mean stands proud, so tussocks overlap dirt and sand fills the cracks, with no blending and no gradients.
uniform float uSnow, uFrost, uDry, uSnowLine;
uniform vec3 uFrostC;
// toward the sun in the ground plane (gfx/lights.ts Sun.dir): faces turned away stay damp and mossy
const vec2 LXZ = vec2(-0.842, -0.539);
/** one contender for this pixel: its weight, plus how proud its own pixel stands (its brightness against its tile's);
 *  vb picks between the kind's two painted variants the same way: a preference, decided pixel by pixel */
void contend(int id, float w, float pref, float vb, vec2 p, inout float bestS, inout vec4 bestT, inout int bestId) {
  if (w <= 0.015) return;
  bool two = uLay[id * 2 + 1] != uLay[id * 2];
  for (int v = 0; v < 2; v++) {
    if (v == 1 && !two) break;
    if (two && (v == 0 ? vb > 0.8 : vb < 0.2)) continue;
    float lay = uLay[id * 2 + v];
    vec4 t = blk(lay, p);
    float l = dot(t.rgb, vec3(0.3, 0.59, 0.11)), a = uAvgL[int(lay)];
    float h = clamp(0.5 + (l - a) / (a + 0.03) * 0.6, 0.0, 1.0);
    float sc = w + pref + uHB[id] + (h - 0.5) * 0.55 + (two ? (v == 0 ? 0.5 - vb : vb - 0.5) * 0.6 : 0.0);
    if (sc > bestS) { bestS = sc; bestT = t; bestId = id; }
  }
}`)
        .replace('#include <map_fragment>', `
vec3 emis = vec3(0.0);
vec2 pxw = floor(vWp.xz * ${TSF});
vec2 pc = (pxw + 0.5) / ${TSF};
// gradients halved: whole pixels stay crisp at play zoom, a coarser mip only past 2x minification
vec2 gx = dFdx(vWp.xz) * 0.5, gy = dFdy(vWp.xz) * 0.5;
blkGrid(pc, gx, gy);
vec4 eco = texture2D(uEco, pc / uN);
float damp = texture2D(uDamp, pc / uN).r;
// the cells round this pixel, their borders bent by a slow warp (shape only: no per-pixel grain)
vec2 q = pc - 0.5 + (vec2(vn(pc * 0.55 + 3.1), vn(pc * 0.55 + 17.7)) - 0.5) * 0.9;
vec2 i0 = floor(q), fq = q - i0;
int ids[4]; float ws[4];
ids[0] = matAt(i0); ids[1] = matAt(i0 + vec2(1.0, 0.0)); ids[2] = matAt(i0 + vec2(0.0, 1.0)); ids[3] = matAt(i0 + vec2(1.0, 1.0));
ws[0] = (1.0 - fq.x) * (1.0 - fq.y); ws[1] = fq.x * (1.0 - fq.y); ws[2] = (1.0 - fq.x) * fq.y; ws[3] = fq.x * fq.y;
for (int a = 1; a < 4; a++) for (int b = 0; b < 4; b++) { if (b < a && ids[b] == ids[a] && ws[a] > 0.0) { ws[b] += ws[a]; ws[a] = 0.0; } }
int dom = ids[0]; float dw = ws[0];
for (int a = 1; a < 4; a++) if (ws[a] > dw) { dw = ws[a]; dom = ids[a]; }
// the lie of the land: slope, height over the water, curvature (hol > 0 a hollow or gully, < 0 a ridge), aspect
float slope = 1.0 - vNw.y;
float hw = vWp.y - uWater;
float hol = vHol;
float shadedFace = clamp(dot(vNw.xz, -LXZ) * 3.0, 0.0, 1.0) * smoothstep(0.05, 0.3, slope);
bool soft = dom == 0 || dom == 1 || dom == 2 || dom == 11 || dom == 6;
float moist = max(damp, eco.r);
float G1 = vn(pc * 0.17 + 5.0), G2 = vn(pc * 0.71 + 9.0), Gm = vn(pc * 0.035 + 13.0) * 0.6 + vn(pc * 0.09 + 41.0) * 0.4;
float bestS = -1e9; vec4 bestT = vec4(0.5); int bestId = dom;
// a grass cell on poor soil gives way to dry grass (fertility from the ecology, drought from the climate), plus broad
// patches of its own, 10-30 m across, so a meadow is never one even green
float dryK = smoothstep(0.42, 0.16, eco.g + (vn(pc * 0.3 + 4.0) - 0.5) * 0.18 + (Gm - 0.5) * 0.3 - uDry * 0.35);
// the variants the land asks for: lush grass on fertile damp ground, stony soil where it is worn or steep, lichen on
// damp rock turned from the sun, flat sand where the wind has less fetch
float vGrass = smoothstep(0.42, 0.72, eco.g * 0.6 + moist * 0.4 + (G1 - 0.5) * 0.35 - uDry * 0.4);
float vSoil = smoothstep(0.3, 0.6, slope * 2.5 + eco.b * 0.6 + (G2 - 0.5) * 0.4);
float vRock = smoothstep(0.3, 0.6, shadedFace * 0.6 + moist * 0.5 + (G1 - 0.5) * 0.4);
float vSand = smoothstep(0.4, 0.6, G1 + (G2 - 0.5) * 0.3);
for (int a = 0; a < 4; a++) {
  int id = ids[a]; float w = ws[a];
  float vb = id == 0 ? vGrass : id == 2 ? vSoil : id == 3 ? vRock : id == 4 ? vSand : smoothstep(0.38, 0.62, vn(pc * 0.21 + 9.0 + float(id) * 3.7));
  float pref = 0.0;
  if (id == 0) { if (dryK > 0.05) contend(1, w, (dryK - 0.5) * 0.8, 0.0, pc, bestS, bestT, bestId); pref = dryK > 0.05 ? (0.5 - dryK) * 0.8 : 0.0; }
  contend(id, w, pref, vb, pc, bestS, bestT, bestId);
}
if (soft || dom == 4) {
  // dirt breaks through on slopes and along trodden paths (stony where worn), stone on the steeper ones
  float sw = dom == 4 ? 0.0 : smoothstep(0.1, 0.22, slope) * 0.9;
  float pw = smoothstep(0.12, 0.6, eco.b) * (dom == 4 ? 0.0 : 1.05);
  contend(2, max(sw, pw), 0.0, vSoil, pc, bestS, bestT, bestId);
  if (dom != 4) contend(3, smoothstep(0.2, 0.3, slope) * 0.95, 0.0, vRock, pc, bestS, bestT, bestId);
}
if (soft) {
  // sand at the waterline and settled in the hollows (mud instead where it is wet), mud where the ground is damp
  float shore = (1.0 - smoothstep(0.04, 0.42, hw)) * (1.0 - smoothstep(0.06, 0.2, slope)) * 0.95;
  float hollow = smoothstep(0.12, 0.4, hol) * 0.75 * (1.0 - smoothstep(0.1, 0.3, slope));
  contend(moist > 0.62 ? 5 : 4, max(shore, hollow), 0.0, 0.5, pc, bestS, bestT, bestId);
  contend(5, smoothstep(0.58, 0.92, moist) * 0.92 * (1.0 - uDry * 0.6), 0.0, 0.0, pc, bestS, bestT, bestId);
  // lush growth on damp slopes turned from the sun
  if (shadedFace * moist > 0.1) contend(0, smoothstep(0.1, 0.4, shadedFace * moist) * 0.7, 0.0, 1.0, pc, bestS, bestT, bestId);
}
// gullies collect scree; ridges wear down to the stone
float gully = smoothstep(0.1, 0.4, hol) * smoothstep(0.06, 0.2, slope);
if (gully > 0.02) contend(12, gully * 0.95, 0.0, 0.5, pc, bestS, bestT, bestId);
float ridge = smoothstep(-0.08, -0.35, hol) * smoothstep(0.06, 0.22, slope);
if (ridge > 0.02) contend(3, ridge * 0.9, 0.0, vRock, pc, bestS, bestT, bestId);
// snow (the climate's cover, and the high ground above the snow line) settles on the flats, never on steep faces
float snowK = clamp(uSnow * 1.15 + smoothstep(uSnowLine, uSnowLine + 10.0, hw) * 0.9 + (G1 - 0.5) * 0.35 + hol * 0.6 - slope * 2.4, 0.0, 1.0);
if (snowK > 0.02) contend(7, snowK * 1.25, 0.15, 0.5, pc, bestS, bestT, bestId);
// the geology: spring mineral crust (terraces) and waterfall spray (A channel)
vec4 geoT = texture2D(uGeo, (floor(pc) + 0.5) / uN);
float ga = geoT.a * 255.0, spray = ga < 127.5 ? ga / 127.0 : 0.0;
if (ga > 128.5) {
  float ck = floor((ga - 128.0) / 32.0), cs = mod(ga - 128.0, 32.0) / 31.0;
  float cl = ck < 0.5 ? ${L.crustWhite}.0 : ck < 1.5 ? ${L.crustOchre}.0 : ${L.crustRust}.0;
  vec4 tc = blk(cl, pc);
  float lc = dot(tc.rgb, vec3(0.3, 0.59, 0.11)), ac = uAvgL[int(cl)];
  float sc = cs * 1.7 + (clamp(0.5 + (lc - ac) / (ac + 0.03) * 0.6, 0.0, 1.0) - 0.5) * 0.55 - slope * 2.0;
  if (sc > bestS) { bestS = sc; bestT = tc; }
}
// burnt ground (scorch): char and ash while fresh, dry soil as it fades
float burn = texture2D(uBurn, pc / uN).r;
bool charred = false;
if (burn > 0.02) {
  vec4 ta = blk(${L.ash}.0, pc);
  float la = dot(ta.rgb, vec3(0.3, 0.59, 0.11)), aa = uAvgL[${L.ash}];
  float sa = smoothstep(0.25, 0.55, burn) * 1.9 + (clamp(0.5 + (la - aa) / (aa + 0.03) * 0.6, 0.0, 1.0) - 0.5) * 0.55;
  if (sa > bestS) { bestS = sa; bestT = ta; charred = true; }
  contend(2, smoothstep(0.0, 0.12, burn) * (1.0 - smoothstep(0.3, 0.5, burn)) * 1.4, 0.0, 0.0, pc, bestS, bestT, bestId);
  if (charred && bestT.a < 1.0 && burn < 0.7) bestT.a = 1.0;
}
vec3 base;
float glowA;
if (vNw.y < 0.74) {
  // cliffs: the painted strata, projected on the face's dominant horizontal axis, each 4 m panel at its own offset
  vec2 uvs = abs(vNw.x) > abs(vNw.z) ? vec2(vWp.z, -vWp.y) : vec2(vWp.x, -vWp.y);
  uvs = (floor(uvs * ${TSF}) + 0.5) / ${TSF};
  vec2 pan = floor(uvs / ${TMF});
  vec4 geo = texture2D(uGeo, (floor(vWp.xz) + 0.5) / uN);
  int fam = int(geo.r * 255.0 + 0.5);
  float lay = dom == 8 ? ${L.basaltSide}.0 : fam > 0 && fam < 7 ? uFamLay[fam] : uRockSide;
  vec2 cuv = (uvs + floor(vec2(h2(pan + 1.3), h2(pan + 7.9)) * ${TTF}) / ${TSF}) / ${TMF}, cgx = dFdx(uvs) * 0.5 / ${TMF}, cgy = dFdy(uvs) * 0.5 / ${TMF};
  vec4 tr = textureGrad(uBlocks, vec3(cuv, lay), cgx, cgy);
  // ore veins: where the geology says so, the painted ore strata show through, the proudest pixels first
  if (geo.g > 0.06) {
    int vk = int(clamp(geo.b * 255.0 + 0.5, 0.0, 6.0));
    vec4 tv = textureGrad(uBlocks, vec3(cuv, uVeinLay[vk]), cgx, cgy);
    // the vein's own pixels, more of them where the vein runs strong (a slow patchiness, never a fade)
    if (tv.a > 0.1 && geo.g * 1.5 + (vn(uvs * 0.45 + 5.0) - 0.5) * 0.9 > 0.55) tr = vec4(tv.rgb, tv.a > 0.95 ? 1.0 : tv.a);
  }
  base = tr.rgb; glowA = tr.a; bestId = 3;
} else {
  base = bestT.rgb; glowA = bestT.a;
  // frost: on cold nights the proudest pixels (blade tips, crests, pebble tops) rime over first
  if (uFrost > 0.01) { float l = dot(base, vec3(0.3, 0.59, 0.11)); if (l > 0.06 * (1.6 - uFrost) && fract(pxw.x * 0.37 + pxw.y * 0.61) < uFrost * 0.9) base = uFrostC; }
}
if (spray > 0.01) {
  // spray: soaked darker, and a few of the proudest pixels catch the light as wet glints, twinkling
  base *= 1.0 - 0.38 * spray;
  if (h2(pxw + floor(uTime * 3.0 + h2(pxw) * 7.0) * 1.7) < spray * 0.05) base = mix(base, uFrostC, 0.75);
}
emis += base * (1.0 - glowA) * 2.0;
// darker under canopy
float shade = texture2D(uShade, pc / uN).r;
base *= 0.55 + 0.45 * shade;
// damp and rain-wet ground soaks darker by how much it drinks (sand and soil a lot, stone little, snow not at all)
float ab = uAbs[bestId];
base *= 1.0 - (0.16 * smoothstep(0.3, 0.9, moist) + 0.24 * uWetG) * ab;
// held ground (game/hive.ts writes the Veyr's claim into b, a rival's into a). No carpet: the soil itself is changed,
// a faint cold metallic sheen, hairline veins in the owner's colour that pulse now and then, sparse rivet studs and a
// bright seam along the edge of the claim
// (drawn on its own coarser 32 px/m grid, so its hairlines, studs and seam stay readable at play zoom)
vec2 pxo = floor(vWp.xz * 32.0), pco = (pxo + 0.5) / 32.0;
vec4 cov = texture2D(uMoss, pco / uN);
float nT = vn(vWp.xz * 0.6) * 0.6 + vn(vWp.xz * 2.7) * 0.4;
float thr = 0.42 + nT * 0.14 + (h2(pxo) - 0.5) * 0.05;
bool mineT = cov.b > thr;
bool theirT = !mineT && cov.a > thr;
if (mineT || theirT) {
  float c = mineT ? cov.b : cov.a;
  // the owner's colour, muted: the ground is etched, not lit up
  vec3 vc0 = mineT ? uVein : uRivalVein;
  vec3 vc = mix(vec3(dot(vc0, vec3(0.3, 0.59, 0.11))), vc0, 0.6);
  float inner = smoothstep(thr, thr + 0.22, c);
  float l = dot(base, vec3(0.3, 0.59, 0.11));
  base = mix(base, vec3(l) * vec3(0.82, 0.92, 0.98) * 1.1 + vc * 0.04, 0.34 * inner);
  // hairline veins: one-pixel contour lines of a slow noise field (a line wherever a contour crosses into the next pixel)
  float vf = vn(pco * 0.11 + 5.0) * 0.75 + vn(pco * 0.37 + 2.0) * 0.25;
  float vr = vn((pco + vec2(1.0 / 32.0, 0.0)) * 0.11 + 5.0) * 0.75 + vn((pco + vec2(1.0 / 32.0, 0.0)) * 0.37 + 2.0) * 0.25;
  float vd = vn((pco + vec2(0.0, 1.0 / 32.0)) * 0.11 + 5.0) * 0.75 + vn((pco + vec2(0.0, 1.0 / 32.0)) * 0.37 + 2.0) * 0.25;
  float lv = floor(vf * 7.0);
  if ((lv != floor(vr * 7.0) || lv != floor(vd * 7.0)) && inner > 0.15 && h2(vec2(lv, 3.0)) > 0.25) {
    float ph = fract(vf * 2.0 - uTime * 0.2 + h2(vec2(lv, 9.0)));
    base = mix(base, vc * 0.55, 0.4 * inner);
    emis += vc * (0.06 + 1.2 * smoothstep(0.92, 1.0, ph)) * 0.35 * inner * uVeinGain;
  }
  vec2 rg = mod(pxo, 40.0);
  if (rg.x < 1.0 && rg.y < 1.0 && inner > 0.6 && h2(floor(pxo / 40.0) + 3.0) > 0.5) { base = vec3(0.8, 0.86, 0.9) * (0.6 + l); emis += vc * 0.25; }
  // the seam: this pixel is held and one of its four neighbours is not
  float t0 = 0.42 + nT * 0.14, px1 = 1.0 / 32.0;
  vec4 nA = texture2D(uMoss, (pco + vec2(px1, 0.0)) / uN), nB = texture2D(uMoss, (pco - vec2(px1, 0.0)) / uN);
  vec4 nC = texture2D(uMoss, (pco + vec2(0.0, px1)) / uN), nD = texture2D(uMoss, (pco - vec2(0.0, px1)) / uN);
  float nm = mineT ? min(min(nA.b, nB.b), min(nC.b, nD.b)) : min(min(nA.a, nB.a), min(nC.a, nD.a));
  if (nm < t0 - 0.02 && h2(pxo * 0.5 + 4.0) > 0.18) { base = mix(base, vc * 0.6, 0.38); emis += vc * 0.1 * uVeinGain; }
}
diffuseColor.rgb *= base;
`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += emis;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = applyFow(gl_FragColor.rgb, vWp);');
    };
    m.customProgramCacheKey = () => 'oddworld-terrain-pixel48';
    return gbuf(m, 0);
  }

  // ---------------------------------------------------------------- coverage / vision updates
  /** Veyr territory [0,1] for a column (blue channel; red and green, the old moss and creep carpets, stay empty) */
  setMoss(i: number, v: number) { (this.moss.image.data as Uint8Array)[i * 4 + 2] = Math.round(v * 255); }
  /** rival territory [0,1] (alpha channel) */
  setCreep(i: number, v: number) { (this.moss.image.data as Uint8Array)[i * 4 + 3] = Math.round(v * 255); }
  mossFlush() { this.moss.needsUpdate = true; }
  /** vision: r = visible now, g = explored */
  visData() { return this.vis.image.data as Uint8Array; }
  visFlush() { this.vis.needsUpdate = true; }

  update(t: number) {
    this.U.uTime.value = t;
    // burns fade: ash and char for a day or so, then dry soil, then the ground's own cover again (~3 days of 420 s)
    if (this.burnLive) {
      const dt = this.burnT < 0 ? 0 : Math.min(5, t - this.burnT);
      if (this.burnT < 0 || dt >= 1) {
        this.burnT = t;
        const b = this.burn, d = this.burnTex.image.data as Uint8Array, k = dt / 1260;
        let any = false;
        for (let i = 0; i < b.length; i++) { if (b[i] <= 0) continue; b[i] = Math.max(0, b[i] - k); d[i] = Math.round(b[i] * 255); any = true; }
        this.burnTex.needsUpdate = true;
        if (!any) this.burnLive = false;
      }
    }
  }
  /**
   * Burn the ground round (x, z): k 0..1 of char within r metres (a ragged edge), kept if already burnt harder. Drawn as
   * pixel-art char, ash drifts, charred sticks and ember specks (the embers glow only while the burn is fresh); it fades
   * through dry soil back to the ground's own cover over about three in-game days. Drop pods, fires, blasts.
   */
  /**
   * Geology per cell (the landscape generator's): N*N*4 bytes.
   *   R rock family of the cliffs: 0 the planet's rock, 1 sandstone, 2 basalt, 3 limestone, 4 slate, 5 granite, 6 tuff
   *   G ore-vein strength 0..255: painted veins show through the cliff strata, more of them the stronger
   *   B ore kind: 0 iron, 1 lumen crystal, 2 copper, 3 gold, 4 coal, 5 sulphur, 6 gravium
   *   A below 128: waterfall-spray wetness (A / 127: the ground darkens and glints); 128 and up: spring mineral crust,
   *     kind (A - 128) >> 5 (0 white, 1 ochre, 2 rust) and strength ((A - 128) & 31) / 31, drawn as travertine terraces
   * Call again after the ground changes; a Region carrying `geo` is picked up at construction.
   */
  setGeo(data: Uint8Array) {
    const d = this.geoTex.image.data as Uint8Array;
    if (data.length !== d.length) { console.warn('terrain.setGeo: expected', d.length, 'bytes, got', data.length); return; }
    d.set(data); this.geoTex.needsUpdate = true;
  }
  scorch(x: number, z: number, r: number, k = 1) {
    const N = this.region.N, b = this.burn, d = this.burnTex.image.data as Uint8Array, ext = Math.ceil(r + 1);
    for (let Z = Math.floor(z) - ext; Z <= Math.floor(z) + ext; Z++) for (let X = Math.floor(x) - ext; X <= Math.floor(x) + ext; X++) {
      if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
      const dd = Math.hypot(X + 0.5 - x, Z + 0.5 - z) / Math.max(0.3, r);
      const jag = (((X * 73856093) ^ (Z * 19349663)) >>> 0) % 1000 / 1000;
      const v = k * clamp01((1.15 - dd - jag * 0.3) * 2.2);
      const i = Z * N + X;
      if (v > b[i]) { b[i] = v; d[i] = Math.round(v * 255); }
    }
    this.burnTex.needsUpdate = true; this.burnLive = true;
  }
  /**
   * The climate's hold on the ground, each 0..1: snow cover (settles on the flats and high ground first), frost (rime
   * on grass tips and open ground), drought (grass cures yellow, soil and mud crack, puddles dry) and rain-wet ground
   * (darker, by how much each material drinks). Uniforms on U: uSnow, uFrost, uDry, uWetG.
   */
  setClimate(c: { snow?: number; frost?: number; dry?: number; wet?: number }) {
    if (c.snow !== undefined) this.U.uSnow.value = clamp01(c.snow);
    if (c.frost !== undefined) this.U.uFrost.value = clamp01(c.frost);
    if (c.dry !== undefined) this.U.uDry.value = clamp01(c.dry);
    if (c.wet !== undefined) this.U.uWetG.value = clamp01(c.wet);
  }
  /** the seasonal water stage in metres over the region's water line (eco.level): rivers rise by it, the sea by half */
  setStage(level: number) { this.U.uStage.value = level; }
}
