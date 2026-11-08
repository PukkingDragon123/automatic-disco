// Voxel terrain: 16 x 16-column chunks, Minecraft-style smooth AO, array-texture blocks. The fragment shader
// overlays the Veyr's moss and rival creep from a coverage texture (organic, pixel-snapped growth fronts, drips
// down cliff faces, glowing veins pulsing toward the core) and applies fog of war.
import * as THREE from 'three';
import { Region } from './region';
import { BLOCKS, L, buildBlockTexture } from './blockTex';
import { clamp01 } from '../core/rand';
import { gbuf, GN_DECL } from '../gfx/gbuf';
import { VEYR, RIVALS } from './palette';


export const SHADER_NOISE = /* glsl */`
float h2(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
float bayer4(vec2 p) { vec2 q = mod(floor(p), 4.0); float i = q.x + q.y * 4.0;
  return (i == 0.0 ? 0.0 : i == 1.0 ? 8.0 : i == 2.0 ? 2.0 : i == 3.0 ? 10.0 : i == 4.0 ? 12.0 : i == 5.0 ? 4.0 : i == 6.0 ? 14.0 : i == 7.0 ? 6.0 :
          i == 8.0 ? 3.0 : i == 9.0 ? 11.0 : i == 10.0 ? 1.0 : i == 11.0 ? 9.0 : i == 12.0 ? 15.0 : i == 13.0 ? 7.0 : i == 14.0 ? 13.0 : 5.0) / 16.0 + 1.0 / 32.0; }
`;

/** fog-of-war application shared by world shaders: needs uVis, uN, uDark */
export const FOW_FN = /* glsl */`
vec3 applyFow(vec3 c, vec3 wp) {
  vec2 px = floor(wp.xz * 8.0);
  vec2 v = texture2D(uVis, (px + 0.5) / 8.0 / uN).rg;
  float d = bayer4(px) * 0.5 + 0.25;
  if (v.g < d) return uDark;
  if (v.r < d) { float l = dot(c, vec3(0.3, 0.59, 0.11)); return mix(vec3(l), c, 0.5) * 0.42 + uDark * 0.4; }
  return c;
}
`;

export class Terrain {
  readonly group = new THREE.Group();
  readonly mat: THREE.MeshLambertMaterial;
  readonly moss: THREE.DataTexture;
  readonly vis: THREE.DataTexture;
  readonly heightTex: THREE.DataTexture;
  readonly matTex: THREE.DataTexture;
  readonly shadeTex: THREE.DataTexture;
  readonly U: Record<string, THREE.IUniform>;
  readonly avg: number[];
  waterMesh: THREE.Mesh;
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
    // material id -> two array-layer variants
    const lay: number[] = [];
    for (let b = 0; b < 16; b++) { const d = BLOCKS[b] ?? BLOCKS[0]; lay.push(d.top[0], d.top[d.top.length - 1]); }
    this.U = {
      uBlocks: { value: tex }, uMoss: { value: this.moss }, uVis: { value: this.vis }, uHeight: { value: this.heightTex }, uMat: { value: this.matTex }, uShade: { value: this.shadeTex },
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
    this.waterMesh = this.makeWater();
    this.group.add(this.waterMesh);
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
uniform sampler2D uMoss, uVis, uMat, uShade;
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
vec4 cov = texture2D(uMoss, pc / uN);
float nLow = vn(vWp.xz * 0.85) * 0.62 + vn(vWp.xz * 3.3) * 0.38;
float thr = 0.3 + nLow * 0.4 + (h2(pxw) - 0.5) * 0.1;
bool mossOn = cov.r > thr;
bool creepOn = !mossOn && cov.g > thr + 0.02;
if (mossOn || creepOn) {
  vec4 mt = texture(uBlocks, vec3(vWp.xz, mossOn ? ${L.moss}.0 : uRivalLayer), -0.35);
  base = mt.rgb;
  float c = mossOn ? cov.r : cov.g;
  vec3 vc = mossOn ? uVein : uRivalVein;
  emis = mt.rgb * (1.0 - mt.a) * 1.1;
  if (c - thr < 0.06) base = mix(base, mossOn ? uMossLight : vc, 0.4);
  vec3 cc = mossOn ? uCore : uRivalCore;
  vec2 dv = pc - cc.xz;
  float rr = length(dv), ang = atan(dv.y, dv.x) / 6.2831853;
  float lvl = clamp(floor(log2(max(rr, 2.0) / 2.2)), 0.0, 5.0);
  float spokes = 4.0 * pow(2.0, lvl);
  float wob = (vn(vec2(rr * 0.22, ang * 7.0)) - 0.5) * 0.45 + (vn(vec2(rr * 0.9, ang * 23.0)) - 0.5) * 0.08;
  float fsec = fract(ang * spokes + wob * (1.0 + lvl * 0.3));
  float across = abs(fsec - 0.5) * 6.2831853 * rr / spokes * 32.0;
  float width = 0.9 + 1.6 * exp(-rr * 0.12);
  if (across < width && c > thr + 0.14 && rr > 1.6) {
    float ph = fract(rr * 0.13 + uTime * 0.42 + h2(vec2(floor(ang * spokes), lvl)) * 0.3);
    float pulse = 0.25 + 2.6 * smoothstep(0.86, 1.0, ph);
    base = mix(base, vc * 0.75, 0.75);
    emis += vc * pulse * 0.7 * uVeinGain;
  }
}
diffuseColor.rgb *= base;
`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += emis;')
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = applyFow(gl_FragColor.rgb, vWp);');
    };
    m.customProgramCacheKey = () => 'oddworld-terrain-smooth';
    return gbuf(m, 0);
  }

  private makeWater(): THREE.Mesh {
    const R = this.region, N = R.N;
    const g = new THREE.PlaneGeometry(N + 400, N + 400, 1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(N / 2, R.water, N / 2);
    const pal = R.pal;
    const m = new THREE.ShaderMaterial({
      uniforms: {
        ...this.U, uShallow: { value: new THREE.Color(pal.water) }, uDeep: { value: new THREE.Color(pal.waterDeep) }, uFoam: { value: new THREE.Color(pal.foam) },
        uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3) }, uSky: { value: new THREE.Color(pal.sky) },
      },
      vertexShader: /* glsl */`
varying vec3 vWp;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWp = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
${GN_DECL}
uniform sampler2D uHeight, uVis;
uniform float uN, uTime, uWater;
uniform vec3 uShallow, uDeep, uFoam, uDark, uSky;
varying vec3 vWp;
${SHADER_NOISE}
${FOW_FN}
float hAt(vec2 p) { if (p.x < 0.0 || p.y < 0.0 || p.x >= uN || p.y >= uN) return -2.0; return texture2D(uHeight, (floor(p) + 0.5) / uN).r; }
void main() {
  vec2 px = floor(vWp.xz * 32.0);
  vec2 p = (px + 0.5) / 32.0;
  // depth from the bilinear neighbourhood of column tops
  vec2 q = p - 0.5; vec2 i = floor(q), f = q - i;
  float hb = mix(mix(hAt(i), hAt(i + vec2(1.0, 0.0)), f.x), mix(hAt(i + vec2(0.0, 1.0)), hAt(i + vec2(1.0, 1.0)), f.x), f.y);
  float depth = max(0.0, uWater - hb);
  float t = 1.0 - exp(-depth * 0.85);
  vec3 c = mix(uShallow, uDeep, smoothstep(0.05, 1.0, t));
  // slow caustic mottling
  float m = vn(p * 0.8 + vec2(uTime * 0.05, uTime * 0.03)) * 0.6 + vn(p * 2.1 - uTime * 0.07) * 0.4;
  c *= 0.9 + m * 0.16;
  // glints: sparse, slow twinkles of sky on the surface, a rare bright sun sparkle on open water
  float g1 = h2(px + floor(uTime * 2.0 + h2(px) * 9.0) * 3.7);
  float g2 = h2(floor(px / 2.0) * 1.7 + floor(uTime * 1.2 + h2(floor(px / 2.0)) * 5.0));
  if (g1 > 0.985) c = mix(c, vec3(0.95), 0.32);
  else if (g1 > 0.945) c = mix(c, uShallow * 1.25 + 0.03, 0.22);
  if (g2 > 0.997 && depth > 0.3) c = mix(c, vec3(1.15), 0.6);
  // shore: a pale rim melting into the bank
  float shore = 1.0 - smoothstep(0.0, 0.45, depth);
  c = mix(c, mix(uShallow, uFoam, 0.35), shore * 0.45);
  c = applyFow(c, vWp);
  gl_FragColor = vec4(c, 1.0);
  gNormal = vec4(0.5, 1.0, 0.5, 0.0);
}`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.name = 'water';
    mesh.receiveShadow = false;
    return mesh;
  }

  // ---------------------------------------------------------------- coverage / vision updates
  /** veyr moss coverage [0,1] for a column */
  setMoss(i: number, v: number) { (this.moss.image.data as Uint8Array)[i * 4] = Math.round(v * 255); }
  setCreep(i: number, v: number) { (this.moss.image.data as Uint8Array)[i * 4 + 1] = Math.round(v * 255); }
  mossFlush() { this.moss.needsUpdate = true; }
  /** vision: r = visible now, g = explored */
  visData() { return this.vis.image.data as Uint8Array; }
  visFlush() { this.vis.needsUpdate = true; }

  update(t: number) { this.U.uTime.value = t; }
}
