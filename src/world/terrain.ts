// Voxel terrain: 16 x 16-column chunks, Minecraft-style smooth AO, array-texture blocks. The fragment shader tints
// the ground the Veyr and its rivals hold (from a territory texture: a metallic sheen, hairline veins pulsing in the
// owner's colour, a bright seam along the claim's edge) and applies fog of war.
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
    // material id -> two array-layer variants
    const lay: number[] = [];
    for (let b = 0; b < 16; b++) { const d = BLOCKS[b] ?? BLOCKS[0]; lay.push(d.top[0], d.top[d.top.length - 1]); }
    this.U = {
      uBlocks: { value: tex }, uMoss: { value: this.moss }, uVis: { value: this.vis }, uHeight: { value: this.heightTex }, uMat: { value: this.matTex }, uShade: { value: this.shadeTex }, uDamp: { value: this.dampTex },
      uLay: { value: lay }, uRockSide: { value: L.rockSide },
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
uniform sampler2D uMoss, uVis, uMat, uShade, uDamp;
uniform float uN, uTime, uRivalLayer, uVeinGain, uRockSide;
uniform float uLay[32];
uniform vec3 uCore, uVein, uMossLight, uRivalVein, uRivalCore, uDark;
varying vec3 vWp; varying vec3 vNw;
${SHADER_NOISE}
${FOW_FN}`)
        .replace('#include <map_fragment>', `
vec3 emis = vec3(0.0);
vec2 pxw = floor(vWp.xz * 32.0);
vec2 pc = (pxw + 0.5) / 32.0;
// jittered nearest material: a smooth warp for wavy borders plus per-pixel grain for a dithered edge
vec2 warp = vec2(vn(pc * 0.55 + 3.1), vn(pc * 0.55 + 17.7)) - 0.5;
vec2 grain = vec2(h2(pxw), h2(pxw + 31.0)) - 0.5;
vec2 mp = pc + warp * 1.5 + grain * 0.55;
float mid = floor(texture2D(uMat, (floor(clamp(mp, vec2(0.0), vec2(uN - 0.01))) + 0.5) / uN).r * 255.0 + 0.5);
int mi = int(mid);
float vsel = step(0.5, vn(pc * 0.21 + 9.0) + (h2(pxw + 7.0) - 0.5) * 0.25);
float lay = vsel > 0.5 ? uLay[mi * 2 + 1] : uLay[mi * 2];
vec3 base;
float glowA;
if (vNw.y < 0.74) {
  // steep ground: rock strata projected on the dominant horizontal axis
  vec2 uvs = abs(vNw.x) > abs(vNw.z) ? vec2(vWp.z, -vWp.y) : vec2(vWp.x, -vWp.y);
  vec4 tr = texture(uBlocks, vec3(uvs, uRockSide), -0.35);
  base = tr.rgb; glowA = tr.a;
} else {
  vec4 texel = texture(uBlocks, vec3(vWp.xz, lay), -0.35);
  base = texel.rgb; glowA = texel.a;
}
emis += base * (1.0 - glowA) * 2.0;
// painterly variation: broad warm/cool patches, darker under canopy
float tpatch = vn(pc * 0.09 + 40.0);
base *= mix(vec3(0.92, 0.95, 0.88), vec3(1.07, 1.03, 0.94), tpatch);
float shade = texture2D(uShade, pc / uN).r;
base *= 0.55 + 0.45 * shade;
// damp ground along rivers and shores: darker, richer, a soaked band right at the water
float damp = texture2D(uDamp, pc / uN).r;
damp = clamp(damp + (vn(pc * 1.3) - 0.5) * 0.35, 0.0, 1.0);
float dl = dot(base, vec3(0.3, 0.59, 0.11));
base = mix(base, mix(vec3(dl), base, 1.18) * 0.66, smoothstep(0.25, 0.85, damp) * 0.85);
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
    m.customProgramCacheKey = () => 'oddworld-terrain-smooth';
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
