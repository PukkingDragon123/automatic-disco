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
import { BLOCKS, L, TS, TILE_M, TT, buildBlockTexture } from './blockTex';
import { clamp01 } from '../core/rand';
import { gbuf, GN_DECL } from '../gfx/gbuf';
import { VEYR, RIVALS } from './palette';


export { SHADER_NOISE, FOW_FN } from './glsl';
import { SHADER_NOISE, FOW_FN } from './glsl';
import { makeSea, makeRivers } from './water';
import { Rocks } from './rocks';

/** the ground's texel grid (blockTex.TS texels per metre) as GLSL literals: the grid itself, the painted tile size in
 *  metres and texels */
const TSF = TS.toFixed(1), TMF = TILE_M.toFixed(1), TTF = TT.toFixed(1);

/** per block kind (blockTex B order): a shadow, body and lit colour for the procedural ground, from the planet's
 *  palette (linear), plus the sky caught in puddles, lichen and the region's prevailing wind */
function matColours(region: Region): Record<string, THREE.IUniform> {
  const p = region.pal;
  const body = [p.grass, p.grassDry, p.soil, p.rock, p.sand, p.mud, p.clay, p.snow, p.basalt, p.ore, p.crystal, p.soil, mixHex(p.rock, 0x8a8478, 0.35), 0x3a3836];
  const A: THREE.Color[] = [], D: THREE.Color[] = [], Lc: THREE.Color[] = [];
  const cool = new THREE.Color(0x2a3440), warm = new THREE.Color(0xfff0d0);
  body.forEach((hex, k) => {
    const c = new THREE.Color(hex);
    A.push(c);
    // shadow: darker and cooler (the sky fills the shade); lit: lighter and a touch warmer (the sun); snow keeps its blue
    D.push(c.clone().multiplyScalar(k === 7 ? 0.62 : 0.42).lerp(cool, k === 7 ? 0.25 : 0.12));
    Lc.push(c.clone().multiplyScalar(k === 7 ? 1.12 : 1.38).lerp(warm, 0.08));
  });
  const a = region.seed * 1.7;
  return {
    uMatA: { value: A }, uMatD: { value: D }, uMatL: { value: Lc },
    uSkyC: { value: new THREE.Color(p.sky).lerp(new THREE.Color(0xc8d4dc), 0.3) }, uLichen: { value: new THREE.Color(mixHex(0x9a9a5a, p.grassDry, 0.35)) },
    uWindXZ: { value: new THREE.Vector2(Math.cos(a), Math.sin(a)) },
  };
}
const mixHex = (a: number, b: number, t: number) => {
  const ch = (c: number, s: number) => (c >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
};

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
    // each layer's mean brightness (linear): a texel brighter than its tile's mean stands proud in the height blend
    const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const avgL = avg.map((c) => lin((c >> 16) & 255) * 0.3 + lin((c >> 8) & 255) * 0.59 + lin(c & 255) * 0.11);
    while (avgL.length < 32) avgL.push(0.3);
    // material id -> two array-layer variants
    const lay: number[] = [];
    for (let b = 0; b < 16; b++) { const d = BLOCKS[b] ?? BLOCKS[0]; lay.push(d.top[0], d.top[d.top.length - 1]); }
    this.U = {
      uBlocks: { value: tex }, uMoss: { value: this.moss }, uVis: { value: this.vis }, uHeight: { value: this.heightTex }, uMat: { value: this.matTex }, uShade: { value: this.shadeTex }, uDamp: { value: this.dampTex },
      uLay: { value: lay }, uRockSide: { value: L.rockSide }, uEco: { value: this.ecoTex }, uAvgL: { value: avgL }, uWetG: { value: 0 },
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
      ...matColours(region),
      uSnow: { value: 0 }, uFrost: { value: 0 }, uDry: { value: 0 },
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
uniform sampler2D uMoss, uVis, uMat, uShade, uDamp, uEco;
uniform float uN, uTime, uRivalLayer, uVeinGain, uRockSide, uWetG, uWater;
uniform float uLay[32];
uniform float uAvgL[32];
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
// ---------------------------------------------------------------- the procedural ground
// Every material is computed per texel (pixel-quantised to the TS grid) from a few shared fields evaluated once per
// fragment: noise octaves from ~25 m patches down to ~9 cm grain, blade streaks along the wind, and two cellular
// layers (small cells ~12 cm: tussocks, pebbles; large cells ~55 cm: clods, plates). Each material returns its
// colour and a height; neighbouring materials then contend texel by texel on weight + height, so stones stand
// proud through sand and grass tussocks over soil instead of cross-fading.
uniform vec3 uMatA[14]; uniform vec3 uMatD[14]; uniform vec3 uMatL[14];
uniform vec3 uSkyC, uLichen;
uniform vec2 uWindXZ;
uniform float uSnow, uFrost, uDry;
// toward the sun in the ground plane (gfx/lights.ts Sun.dir): the side of every lump that catches the light
const vec2 LXZ = vec2(-0.842, -0.539);
float Gm, G1, G2, G3, G4, Gpx, Gst;
// detail that changes with scale: how much of each band survives at this fragment's footprint (m per pixel), so
// distant ground reads by its broad forms instead of fizzing with sub-pixel grain
float kFine, kSmall, kMid;
float sF1, sF2, sId, lF1, lF2, lId; vec2 sD, lD;
void cells(vec2 p, out float f1, out float f2, out float id, out vec2 d) {
  vec2 i = floor(p), f = p - i; f1 = 9.0; f2 = 9.0; id = 0.0; d = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y)), o = vec2(h2(i + g), h2(i + g + 17.17)) * 0.8 + 0.1;
    vec2 r = g + o - f; float dd = dot(r, r);
    if (dd < f1) { f2 = f1; f1 = dd; id = h2(i + g + 3.3); d = -r; } else if (dd < f2) f2 = dd;
  }
  f1 = sqrt(f1); f2 = sqrt(f2);
}
void fields(vec2 p, float fw) {
  kFine = 1.0 - smoothstep(0.008, 0.03, fw); kSmall = 1.0 - smoothstep(0.03, 0.09, fw); kMid = 1.0 - smoothstep(0.09, 0.25, fw);
  Gm = vn(p * 0.035 + 13.0) * 0.6 + vn(p * 0.09 + 41.0) * 0.4;
  G1 = vn(p * 0.17 + 5.0); G2 = vn(p * 0.71 + 9.0);
  G3 = mix(0.5, vn(p * 3.1 + 2.0), kMid); G4 = mix(0.5, vn(p * 11.0 + 7.0), kSmall);
  Gpx = mix(0.5, h2(floor(p * ${TSF}) + 0.37), kFine);
  vec2 w = uWindXZ, u = vec2(dot(p, w), dot(p, vec2(-w.y, w.x)));
  Gst = mix(0.5, vn(vec2(u.x * 3.4, u.y * 30.0) + G2 * 1.5), kSmall) * 0.65 + mix(0.5, vn(vec2(u.x * 7.0, u.y * 64.0) + 11.0), kFine) * 0.35;
  cells(p * 8.0 + G3 * 0.6, sF1, sF2, sId, sD);
  cells(p * 1.8 + (G2 - 0.5) * 0.5, lF1, lF2, lId, lD);
}
/** a material's colour along its ramp: 0 shadow .. 0.5 body .. 1 lit */
vec3 tone(int id, float t) { t = clamp(t, 0.0, 1.0); return t < 0.5 ? mix(uMatD[id], uMatA[id], t * 2.0) : mix(uMatA[id], uMatL[id], t * 2.0 - 1.0); }
/** how much a lump's side at offset d (from its centre) faces the sun, -1..1 */
float litOf(vec2 d) { float l = length(d); return l > 1e-4 ? dot(d / l, LXZ) : 0.0; }

vec4 mGrass(int id) {
  float tuft = mix(0.5, 1.0 - smoothstep(0.15, 0.75, sF1), kSmall);
  // tussock groups ~0.5 m across (large cells) and 1-5 m patches: the structure that still reads from far off
  float group = 1.0 - smoothstep(0.2, 0.85, lF1);
  float t = 0.12 + Gst * 0.45 + tuft * 0.25 + group * 0.22 + (G2 - 0.5) * 0.3 + (G1 - 0.5) * 0.2 + (G3 - 0.5) * 0.2 + (Gpx - 0.5) * 0.12;
  // each tussock lit on its sun side; the ground between them in shade
  t += litOf(sD) * tuft * 0.2 * kSmall + litOf(lD) * group * 0.14 - (1.0 - tuft) * 0.1;
  vec3 c = tone(id, t);
  // greener and yellower patches and sun-cured tips (more in a drought)
  float dry = clamp(smoothstep(0.45, 0.85, Gm * 0.7 + G1 * 0.3) * 0.55 + uDry * 0.7, 0.0, 1.0);
  if (id == 0) c = mix(c, tone(1, t), dry * (0.3 + Gst * 0.5));
  // bare earth between the tussocks
  float gap = smoothstep(0.6, 0.95, lF1) * smoothstep(0.6, 0.3, Gst) * smoothstep(0.35, 0.6, G2);
  c = mix(c, tone(2, 0.25 + G4 * 0.3), gap * 0.75);
  return vec4(c, 0.35 + tuft * 0.35 + Gst * 0.25 - gap * 0.3);
}
vec4 mSoil(int id, vec2 p) {
  float edge = lF2 - lF1;
  float t = 0.36 + (lId - 0.5) * 0.42 + (G2 - 0.5) * 0.3 + (G1 - 0.5) * 0.2 + (G3 - 0.5) * 0.2 + (G4 - 0.5) * 0.08;
  t += smoothstep(0.3, 0.05, edge) * litOf(lD) * 0.36;
  vec3 c = tone(id, t);
  c *= 1.0 - smoothstep(0.07, 0.0, edge) * (0.5 + uDry * 0.3);
  float h = 0.3 + smoothstep(0.0, 0.3, edge) * 0.2;
  // roots: pale threads where the soil is rooty
  float rt = abs(vn(p * vec2(2.6, 0.7) + 31.0) - 0.5);
  if (rt < 0.011 && G1 > 0.5) c = mix(c, uMatL[id] * 1.15, 0.7);
  // a stone in one clod in twelve (~20 cm, reads from far off)
  if (lId > 0.92 && lF1 < 0.42) {
    float pl = litOf(lD), r = lF1 / 0.42;
    c = tone(3, 0.38 + pl * 0.4 + (lId - 0.96) * 3.0);
    if (r > 0.82) c *= 0.5;
    if (pl > 0.65 && r > 0.35 && r < 0.62) c = mix(c, vec3(1.0), 0.35 * kSmall);
    return vec4(c, 0.9);
  }
  // pebbles in about one small cell in four, a lit face, a dark rim, a glint (brighter when wet)
  float rad = 0.3 + (sId - 0.74) * 1.2;
  if (sId > 0.74 && sF1 < rad && kSmall > 0.2) {
    float pl = litOf(sD), r = sF1 / rad;
    c = tone(3, 0.35 + pl * 0.35 + (sId - 0.89) * 2.0);
    if (r > 0.8) c *= 0.55;
    if (pl > 0.7 && r > 0.4 && r < 0.68) c = mix(c, vec3(1.0), 0.45);
    h = 0.8 + (1.0 - r) * 0.2;
  }
  return vec4(c, h);
}
vec4 mRock(int id, vec2 p, float shadedFace, float moist) {
  float edge = lF2 - lF1;
  float t = 0.42 + (lId - 0.5) * 0.45 + (G2 - 0.5) * 0.25 + (G3 - 0.5) * 0.22 + (G4 - 0.5) * 0.1;
  t += smoothstep(0.3, 0.06, edge) * litOf(lD) * 0.4;
  vec3 c = tone(id, t);
  c *= 1.0 - smoothstep(0.06, 0.0, edge) * 0.65;
  float fr = abs(vn(p * 5.5 + 4.0) - 0.5);
  c *= 1.0 - smoothstep(0.018, 0.0, fr) * 0.35 * kSmall;
  // lichen crusts, thicker on damp stone turned from the sun
  float lk = vn(p * 2.4 + 70.0) * 0.6 + G3 * 0.4;
  if (lk > 0.68 - shadedFace * 0.12 - moist * 0.08) c = mix(c, uLichen * (0.75 + G4 * 0.5), 0.7);
  return vec4(c, 0.55 + smoothstep(0.0, 0.25, edge) * 0.35);
}
vec4 mSand(vec2 p) {
  vec2 w = uWindXZ, a = vec2(-w.y, w.x);
  float ph = dot(p, a) * 7.5 + G2 * 4.0 + G3 * 0.8, sn = sin(ph), cs = cos(ph);
  float t = 0.45 + (G1 - 0.5) * 0.3 + (G2 - 0.5) * 0.2 + (G3 - 0.5) * 0.15;
  t += (cs * dot(a, LXZ) * 0.24 + smoothstep(0.85, 1.0, sn) * 0.1) * kSmall;
  t += (step(0.93, Gpx) - step(Gpx, 0.06)) * 0.12;
  vec3 c = tone(4, t);
  if (sId > 0.985 && sF1 < 0.3) c = mix(uMatL[4], vec3(0.85, 0.8, 0.72), 0.6);
  return vec4(c, 0.2 + sn * 0.08);
}
vec4 mMud(vec2 p) {
  float t = 0.3 + (G2 - 0.5) * 0.3 + (G3 - 0.5) * 0.2;
  vec3 c = tone(5, t);
  float pud = G1 * 0.55 + G2 * 0.45;
  if (pud < 0.34 - uDry * 0.3) {
    // a puddle: dark water with the sky in it and the odd glint
    c = mix(uMatD[5] * 0.7, uSkyC, 0.22 + (1.0 - smoothstep(0.2, 0.34, pud)) * 0.12);
    if (Gpx > 0.985) c += vec3(0.25);
    return vec4(c, 0.0);
  }
  c *= 1.0 - smoothstep(0.05, 0.0, lF2 - lF1) * uDry * 0.5;
  return vec4(c, 0.15 + G3 * 0.1);
}
vec4 mClay(vec2 p) {
  float edge = sF2 - sF1;
  float t = 0.45 + (lId - 0.5) * 0.25 + (G3 - 0.5) * 0.2 + smoothstep(0.2, 0.05, edge) * litOf(sD) * 0.25;
  vec3 c = tone(6, t);
  c *= 1.0 - smoothstep(0.06, 0.0, edge) * 0.55;
  return vec4(c, 0.4 + smoothstep(0.0, 0.2, edge) * 0.2);
}
vec4 mSnow(vec2 p) {
  vec2 w = uWindXZ;
  float t = 0.62 + (G1 - 0.5) * 0.2 + (G2 - 0.5) * 0.25;
  float ph = dot(p, w) * 1.4 + G2 * 3.0;
  t += cos(ph) * dot(w, LXZ) * 0.15 - smoothstep(0.1, 0.0, lF2 - lF1) * 0.1;
  vec3 c = tone(7, t);
  c = mix(c, c * vec3(0.82, 0.9, 1.1), smoothstep(0.55, 0.3, t));
  if (Gpx > 0.992) c = vec3(1.25);
  return vec4(c, 0.6 + G2 * 0.2);
}
vec4 mGravel(int id) {
  float r = sF1 / 0.48, pl = litOf(sD);
  vec3 c = tone(id, 0.32 + (sId - 0.5) * 0.5 + pl * 0.3 * smoothstep(0.2, 0.9, r));
  if (r > 0.85) c *= 0.5;
  if (pl > 0.8 && r > 0.5 && r < 0.75 && sId > 0.5) c = mix(c, vec3(1.0), 0.4);
  return vec4(c, 0.5 + (1.0 - r) * 0.4);
}
/** one material's colour and height at p; glow is the painted layer's emissive alpha (1 = none) */
vec4 matOf(int id, vec2 p, float shadedFace, float moist, out float glow) {
  glow = 1.0;
  if (id == 0 || id == 1) return mGrass(id);
  if (id == 2) return mSoil(2, p);
  if (id == 3 || id == 8) return mRock(id, p, shadedFace, moist);
  if (id == 4) return mSand(p);
  if (id == 5) return mMud(p);
  if (id == 6) return mClay(p);
  if (id == 7) return mSnow(p);
  if (id == 12) return mGravel(12);
  // painted layers (ore and crystal seams, leaf litter, impact glass), sampled without repeats
  float lay = uLay[id * 2];
  vec4 t = blk(lay, p);
  glow = t.a;
  float l = dot(t.rgb, vec3(0.3, 0.59, 0.11)), a = uAvgL[int(lay)];
  return vec4(t.rgb, clamp(0.5 + (l - a) / (a + 0.03) * 0.6, 0.0, 1.0));
}
void contend(int id, float w, float pref, vec2 p, float shadedFace, float moist, inout float bestS, inout vec4 bestT, inout int bestId, inout float bestG) {
  if (w <= 0.015) return;
  float gl;
  vec4 t = matOf(id, p, shadedFace, moist, gl);
  float sc = w + pref + uHB[id] + (t.a - 0.5) * 0.55;
  if (sc > bestS) { bestS = sc; bestT = t; bestId = id; bestG = gl; }
}`)
        .replace('#include <map_fragment>', `
vec3 emis = vec3(0.0);
vec2 pxw = floor(vWp.xz * ${TSF});
vec2 pc = (pxw + 0.5) / ${TSF};
vec2 gx = dFdx(vWp.xz), gy = dFdy(vWp.xz);
blkGrid(pc, gx, gy);
fields(pc, max(length(gx), length(gy)));
vec4 eco = texture2D(uEco, pc / uN);
float damp = texture2D(uDamp, pc / uN).r;
// the cells round this texel, their borders bent by a slow warp (shape only: no per-pixel grain)
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
float bestS = -1e9; vec4 bestT = vec4(0.5); int bestId = dom; float bestG = 1.0;
// a grass cell on poor soil gives way to dry grass (fertility from the ecology, drought from the climate), plus broad
// patches of its own, 10-30 m across, so a meadow is never one even green
float dryK = smoothstep(0.42, 0.16, eco.g + (vn(pc * 0.3 + 4.0) - 0.5) * 0.18 + (Gm - 0.5) * 0.3 - uDry * 0.35);
for (int a = 0; a < 4; a++) {
  int id = ids[a]; float w = ws[a];
  float pref = 0.0;
  if (id == 0) { if (dryK > 0.05) contend(1, w, (dryK - 0.5) * 0.8, pc, shadedFace, moist, bestS, bestT, bestId, bestG); pref = dryK > 0.05 ? (0.5 - dryK) * 0.8 : 0.0; }
  contend(id, w, pref, pc, shadedFace, moist, bestS, bestT, bestId, bestG);
}
if (soft || dom == 4) {
  // dirt breaks through on slopes and along trodden paths, stone on the steeper ones
  float sw = dom == 4 ? 0.0 : smoothstep(0.1, 0.22, slope) * 0.9;
  float pw = smoothstep(0.12, 0.6, eco.b) * (dom == 4 ? 0.0 : 1.05);
  contend(2, max(sw, pw), 0.0, pc, shadedFace, moist, bestS, bestT, bestId, bestG);
  if (dom != 4) contend(3, smoothstep(0.2, 0.3, slope) * 0.95, 0.0, pc, shadedFace, moist, bestS, bestT, bestId, bestG);
}
if (soft) {
  // sand at the waterline and settled in the hollows (mud instead where it is wet), mud where the ground is damp
  float shore = (1.0 - smoothstep(0.04, 0.42, hw)) * (1.0 - smoothstep(0.06, 0.2, slope)) * 0.95;
  float hollow = smoothstep(0.12, 0.4, hol) * 0.75 * (1.0 - smoothstep(0.1, 0.3, slope));
  contend(moist > 0.62 ? 5 : 4, max(shore, hollow), 0.0, pc, shadedFace, moist, bestS, bestT, bestId, bestG);
  contend(5, smoothstep(0.58, 0.92, moist) * 0.92 * (1.0 - uDry * 0.6), 0.0, pc, shadedFace, moist, bestS, bestT, bestId, bestG);
}
// gullies collect scree and washed gravel; ridges wear down to the stone
float gully = smoothstep(0.1, 0.4, hol) * smoothstep(0.06, 0.2, slope);
if (gully > 0.02) contend(12, gully * 0.95, 0.0, pc, shadedFace, moist, bestS, bestT, bestId, bestG);
float ridge = smoothstep(-0.08, -0.35, hol) * smoothstep(0.06, 0.22, slope);
if (ridge > 0.02) contend(3, ridge * 0.9, 0.0, pc, shadedFace, moist, bestS, bestT, bestId, bestG);
// snow (the climate's cover, and always some on the high ground) settles on the flats, never on steep faces
float snowK = clamp(uSnow * 1.15 + smoothstep(16.0, 28.0, hw) * 0.9 + (G1 - 0.5) * 0.35 + hol * 0.6 - slope * 2.4, 0.0, 1.0);
if (snowK > 0.02) contend(7, snowK * 1.25, 0.15, pc, shadedFace, moist, bestS, bestT, bestId, bestG);
vec3 base;
float glowA;
if (vNw.y < 0.74) {
  // cliffs: beds of stone in different tones and hardness (hard beds jut with a lit lip over a shaded underside),
  // vertical joints, rain streaks down the face, moss on damp faces turned from the sun
  vec2 side = abs(vNw.x) > abs(vNw.z) ? vec2(vWp.z, vWp.y) : vec2(vWp.x, vWp.y);
  float yy = vWp.y + (vn(vec2(side.x * 0.35, 1.0)) - 0.5) * 0.9 + (G3 - 0.5) * 0.12;
  float bed = floor(yy * 1.5), lb = fract(yy * 1.5), hb = h2(vec2(bed, 3.1));
  float t = 0.28 + hb * 0.45 + (G3 - 0.5) * 0.15 + (G4 - 0.5) * 0.08;
  if (hb > 0.55) t += lb > 0.86 ? 0.25 : lb < 0.14 ? -0.3 : 0.0;
  int rid = dom == 8 ? 8 : 3;
  vec3 c = tone(rid, t);
  float joint = abs(vn(vec2(side.x * 2.4, bed * 7.0 + 0.5)) - 0.5);
  c *= 1.0 - smoothstep(0.028, 0.0, joint) * 0.55;
  c *= 0.86 + 0.14 * vn(vec2(side.x * 1.3, side.y * 0.08));
  if (shadedFace * moist > 0.15 && G2 > 0.55) c = mix(c, uMatD[0] * 1.3, 0.45);
  base = c; glowA = 1.0; bestId = rid;
} else {
  base = bestT.rgb; glowA = bestG;
}
// ridges bleach, hollows hold the damp and the shade; broad macro patches 10-30 m across
base *= (1.0 + smoothstep(-0.05, -0.4, hol) * 0.08) * (1.0 - smoothstep(0.05, 0.4, hol) * 0.1);
base *= 0.86 + 0.26 * Gm;
// moss creeps over damp soil and stone on slopes turned away from the sun
if ((bestId == 3 || bestId == 2 || bestId == 12) && shadedFace * moist > 0.12) base = mix(base, uMatD[0] * 1.25, smoothstep(0.12, 0.45, shadedFace * moist + (G2 - 0.5) * 0.3) * 0.55);
// frost: on cold nights rime whitens the grass tips and the open ground
if (uFrost > 0.01) base = mix(base, vec3(0.82, 0.87, 0.93), uFrost * (bestId <= 1 ? 0.2 + Gst * 0.55 : 0.3) * (1.0 - smoothstep(0.2, 0.4, slope)));
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
    m.customProgramCacheKey = () => 'oddworld-terrain-procedural1';
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

  update(t: number) { this.U.uTime.value = t; }
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
