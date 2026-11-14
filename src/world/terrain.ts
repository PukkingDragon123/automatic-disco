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
import { BLOCKS, L, buildBlockTexture } from './blockTex';
import { clamp01 } from '../core/rand';
import { gbuf, GN_DECL } from '../gfx/gbuf';
import { VEYR, RIVALS } from './palette';


export { SHADER_NOISE, FOW_FN } from './glsl';
import { SHADER_NOISE, FOW_FN } from './glsl';
import { makeSea, makeRivers } from './water';
import { Rocks } from './rocks';

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
  waterMesh: THREE.Mesh;
  riverMesh: THREE.Mesh | null;
  readonly rocks: Rocks;
  private mesh!: THREE.Mesh;
  private geo!: THREE.BufferGeometry;

  constructor(readonly region: Region) {
    const N = region.N;
    const { tex, avg } = buildBlockTexture(region.pal, region.seed);
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
varying vec3 vWp; varying vec3 vNw;`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
vec4 wpos4 = modelMatrix * vec4(transformed, 1.0);
vWp = wpos4.xyz; vNw = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform highp sampler2DArray uBlocks;
uniform sampler2D uMoss, uVis, uMat, uShade, uDamp, uEco, uHeight;
uniform float uN, uTime, uRivalLayer, uVeinGain, uRockSide, uWetG, uWater;
uniform float uLay[32];
uniform float uAvgL[32];
uniform float uHB[16];
uniform float uAbs[16];
uniform vec3 uCore, uVein, uMossLight, uRivalVein, uRivalCore, uDark;
varying vec3 vWp; varying vec3 vNw;
${SHADER_NOISE}
${FOW_FN}
int matAt(vec2 cell) { return int(floor(texture2D(uMat, (clamp(cell, vec2(0.0), vec2(uN - 1.0)) + 0.5) / uN).r * 255.0 + 0.5)); }
float hAtT(vec2 p) { return texture2D(uHeight, (floor(clamp(p, vec2(0.0), vec2(uN - 0.01))) + 0.5) / uN).r; }
/** one contender for this texel: its weight, plus how proud its own texel stands (its brightness against its tile's) */
void contend(int id, float w, float vb, vec2 pc, vec2 gx, vec2 gy, inout float bestS, inout vec4 bestT, inout int bestId) {
  if (w <= 0.015) return;
  for (int v = 0; v < 2; v++) {
    float wv = v == 0 ? w * (1.0 - vb) : w * vb;
    if (wv <= 0.015) continue;
    float lay = uLay[id * 2 + v];
    vec4 t = textureGrad(uBlocks, vec3(pc, lay), gx, gy);
    float l = dot(t.rgb, vec3(0.3, 0.59, 0.11)), a = uAvgL[int(lay)];
    float h = clamp(0.5 + (l - a) / (a + 0.03) * 0.6, 0.0, 1.0);
    float sc = wv + uHB[id] + (h - 0.5) * 0.55;
    if (sc > bestS) { bestS = sc; bestT = t; bestId = id; }
  }
}`)
        .replace('#include <map_fragment>', `
vec3 emis = vec3(0.0);
vec2 pxw = floor(vWp.xz * 32.0);
vec2 pc = (pxw + 0.5) / 32.0;
vec2 gx = dFdx(vWp.xz), gy = dFdy(vWp.xz);
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
// the lie of the land: slope, height over the water, hollows
float slope = 1.0 - vNw.y;
float hw = vWp.y - uWater;
float hol = (hAtT(pc + vec2(1.6, 0.0)) + hAtT(pc - vec2(1.6, 0.0)) + hAtT(pc + vec2(0.0, 1.6)) + hAtT(pc - vec2(0.0, 1.6))) * 0.25 - hAtT(pc);
bool soft = dom == 0 || dom == 1 || dom == 2 || dom == 11 || dom == 6;
float moist = max(damp, eco.r);
float bestS = -1e9; vec4 bestT = vec4(0.5); int bestId = dom;
// a grass cell on poor soil gives way to dry grass (fertility from the ecology)
float dryK = smoothstep(0.42, 0.16, eco.g + (vn(pc * 0.3 + 4.0) - 0.5) * 0.18);
for (int a = 0; a < 4; a++) {
  int id = ids[a]; float w = ws[a];
  float vb = smoothstep(0.38, 0.62, vn(pc * 0.21 + 9.0 + float(id) * 3.7));
  if (id == 0) { contend(1, w * dryK, 0.0, pc, gx, gy, bestS, bestT, bestId); w *= 1.0 - dryK; }
  contend(id, w, vb, pc, gx, gy, bestS, bestT, bestId);
}
if (soft || dom == 4) {
  // dirt breaks through on slopes and along trodden paths, stone on the steeper ones
  float sw = dom == 4 ? 0.0 : smoothstep(0.1, 0.22, slope) * 0.9;
  float pw = smoothstep(0.12, 0.6, eco.b) * (dom == 4 ? 0.0 : 1.05);
  contend(2, max(sw, pw), 0.0, pc, gx, gy, bestS, bestT, bestId);
  if (dom != 4) contend(3, smoothstep(0.2, 0.3, slope) * 0.95, 0.5, pc, gx, gy, bestS, bestT, bestId);
}
if (soft) {
  // sand at the waterline and settled in the hollows (mud instead where it is wet), mud where the ground is damp
  float shore = (1.0 - smoothstep(0.04, 0.42, hw)) * (1.0 - smoothstep(0.06, 0.2, slope)) * 0.95;
  float hollow = smoothstep(0.12, 0.4, hol) * 0.75;
  contend(moist > 0.62 ? 5 : 4, max(shore, hollow), 0.5, pc, gx, gy, bestS, bestT, bestId);
  contend(5, smoothstep(0.58, 0.92, moist) * 0.92, 0.0, pc, gx, gy, bestS, bestT, bestId);
}
vec3 base;
float glowA;
if (vNw.y < 0.74) {
  // steep ground: rock strata projected on the dominant horizontal axis
  vec2 uvs = abs(vNw.x) > abs(vNw.z) ? vec2(vWp.z, -vWp.y) : vec2(vWp.x, -vWp.y);
  vec4 tr = texture(uBlocks, vec3(uvs, uRockSide), -0.35);
  base = tr.rgb; glowA = tr.a; bestId = 3;
} else {
  base = bestT.rgb; glowA = bestT.a;
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
vec4 cov = texture2D(uMoss, pc / uN);
float nT = vn(vWp.xz * 0.6) * 0.6 + vn(vWp.xz * 2.7) * 0.4;
float thr = 0.42 + nT * 0.14 + (h2(pxw) - 0.5) * 0.05;
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
  float vf = vn(pc * 0.11 + 5.0) * 0.75 + vn(pc * 0.37 + 2.0) * 0.25;
  float vr = vn((pc + vec2(1.0 / 32.0, 0.0)) * 0.11 + 5.0) * 0.75 + vn((pc + vec2(1.0 / 32.0, 0.0)) * 0.37 + 2.0) * 0.25;
  float vd = vn((pc + vec2(0.0, 1.0 / 32.0)) * 0.11 + 5.0) * 0.75 + vn((pc + vec2(0.0, 1.0 / 32.0)) * 0.37 + 2.0) * 0.25;
  float lv = floor(vf * 7.0);
  if ((lv != floor(vr * 7.0) || lv != floor(vd * 7.0)) && inner > 0.15 && h2(vec2(lv, 3.0)) > 0.25) {
    float ph = fract(vf * 2.0 - uTime * 0.2 + h2(vec2(lv, 9.0)));
    base = mix(base, vc * 0.55, 0.4 * inner);
    emis += vc * (0.06 + 1.2 * smoothstep(0.92, 1.0, ph)) * 0.35 * inner * uVeinGain;
  }
  vec2 rg = mod(pxw, 40.0);
  if (rg.x < 1.0 && rg.y < 1.0 && inner > 0.6 && h2(floor(pxw / 40.0) + 3.0) > 0.5) { base = vec3(0.8, 0.86, 0.9) * (0.6 + l); emis += vc * 0.25; }
  // the seam: this pixel is held and one of its four neighbours is not
  float t0 = 0.42 + nT * 0.14, px1 = 1.0 / 32.0;
  vec4 nA = texture2D(uMoss, (pc + vec2(px1, 0.0)) / uN), nB = texture2D(uMoss, (pc - vec2(px1, 0.0)) / uN);
  vec4 nC = texture2D(uMoss, (pc + vec2(0.0, px1)) / uN), nD = texture2D(uMoss, (pc - vec2(0.0, px1)) / uN);
  float nm = mineT ? min(min(nA.b, nB.b), min(nC.b, nD.b)) : min(min(nA.a, nB.a), min(nC.a, nD.a));
  if (nm < t0 - 0.02 && h2(pxw * 0.5 + 4.0) > 0.18) { base = mix(base, vc * 0.6, 0.38); emis += vc * 0.1 * uVeinGain; }
}
diffuseColor.rgb *= base;
`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += emis;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = applyFow(gl_FragColor.rgb, vWp);');
    };
    m.customProgramCacheKey = () => 'oddworld-terrain-blend2';
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
}
