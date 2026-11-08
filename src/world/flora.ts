// Flora: plant instances on the region (food for herbivores, life force for the Veyr) drawn as instanced
// pixel-art cards that lean back toward the camera, sway in the wind, wither under moss and cast matching shadows.
import * as THREE from 'three';
import { Region } from './region';
import { makeFlora, buildFloraAtlas, type PlantSpecies, type FloraAtlas } from './plantArt';
import { Rand, hash01 } from '../core/rand';
import { gbuf } from '../gfx/gbuf';
import { SHADER_NOISE, FOW_FN } from './terrain';

const VERT_PARS = /* glsl */`
attribute vec3 iPos; attribute vec2 iSize; attribute vec4 iRect; attribute vec4 iParam; attribute vec2 iAnim;
uniform vec4 uPush[12];
uniform float uTime, uN, uLean, uHComp, uDetail;
uniform vec3 uCamRight, uCamBack;
uniform sampler2D uMoss;
varying float vWither; varying vec3 vBase; varying float vGlowK;
`;
const VERT_BEGIN = /* glsl */`
float mc = texture2D(uMoss, iPos.xz / uN).r;
float wither = clamp(max(1.0 - iParam.z, (mc - 0.4) * 1.8), 0.0, 1.0);
if (uDetail > 0.5) wither = mc > 0.3 ? 1.0 : 0.0;
vWither = wither; vBase = iPos;
float sc = uDetail > 0.5 ? (1.0 - wither) : (1.0 - wither * 0.5) * step(0.02, iParam.z);
vec2 sz = iSize * sc;
vec3 transformed;
if (abs(iParam.w) > 1.5) {
  float br = 1.0 + sin(uTime * 1.2 + iParam.x) * 0.03;
  transformed = iPos + vec3((position.x) * sz.x * br, 0.03, (0.5 - position.y) * sz.y * br);
} else {
  vec3 up = normalize(vec3(0.0, cos(uLean), 0.0) - uCamBack * sin(uLean));
  float yy = position.y, t = uTime + iParam.x, k = iParam.y, typ = iAnim.x, spd = iAnim.y;
  float bend = (sin(t * (1.1 + k * 0.6) + iPos.x * 0.21 + iPos.z * 0.17) * 0.07 + sin(t * 2.9) * 0.02) * k;
  float sx = 1.0, sy = 1.0;
  if (typ > 0.5 && typ < 1.5) { float b = sin(t * 1.7 * spd); sx = 1.0 + b * 0.06 * yy; sy = 1.0 + b * 0.04; }
  else if (typ > 1.5 && typ < 2.5) { bend += sin(t * 2.6 * spd) * 0.07 * yy; sy = 1.0 + sin(t * 3.4 * spd) * 0.035 * yy; }
  else if (typ > 2.5 && typ < 3.5) { bend += sin(t * 19.0 + iParam.x * 3.0) * 0.014 * smoothstep(0.5, 1.0, yy) + sin(t * 1.4) * 0.03; }
  else if (typ > 3.5) { bend += sin(t * 1.3 * spd) * 0.09 * yy; sx += cos(t * 1.3 * spd) * 0.05 * yy; }
  // creatures brushing through push the plant aside
  vec2 push = vec2(0.0);
  for (int i = 0; i < 12; i++) {
    vec4 p = uPush[i];
    if (p.z <= 0.0) continue;
    vec2 d = iPos.xz - p.xy; float dl = length(d), rr = p.z + sz.x * 0.35;
    if (dl < rr) push += (d / max(dl, 0.001)) * (1.0 - dl / rr) * p.w;
  }
  float yy2 = yy * yy;
  transformed = iPos + uCamRight * (position.x * sz.x * sx + (bend * sz.y + dot(push, uCamRight.xz) * 0.6) * yy2) + up * (yy * sz.y * uHComp * sy - 0.06) + uCamBack * (dot(push, uCamBack.xz) * 0.35 * yy2);
  transformed.y -= length(push) * 0.18 * yy2 * sz.y;
}
`;
const UV_PATCH = /* glsl */`
#include <uv_vertex>
float fu = iParam.w < 0.0 ? 1.0 - uv.x : uv.x;
vMapUv = vec2(iRect.x + iRect.z * fu, iRect.y + iRect.w * (1.0 - uv.y));
`;

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
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, f = R.fert[i], w = R.wet[i], h = R.h[i];
      const dl = Math.hypot(x + 0.5 - L.x, z + 0.5 - L.z);
      if (dl < 9) continue;
      const water = h < R.water;
      if (R.b[i] === 2 && !water && r.chance(0.85)) continue;
      const depth = R.water - h;
      // detail ground cover
      if (!water && f > 0.25) {
        const k = Math.floor(f * 1.5 * bi.flora + hash01(x, z, 3) * (0.5 + (nz.n2(x * 0.09, z * 0.09) + 1) * 0.5));
        for (let j = 0; j < k; j++) { const dx = x + r.next(), dz = z + r.next(); det.push([dx, R.heightAt(dx, dz), dz, r.int(0, this.atlas.detail.length - 1)]); }
      }
      // plants: each species rolls with clustered noise
      for (const p of sp) {
        if (p.water !== water) continue;
        if (water && (depth > 1.4 || depth < 0.2)) continue;
        if (!water && (f < p.fert * 0.7 || w < p.wetMin - 0.08 || w > p.wetMax + 0.08)) continue;
        if (p.shore && !water) { // near water
          let near = false;
          for (let d = 1; d <= 3 && !near; d++) for (const [dx, dz] of [[d, 0], [-d, 0], [0, d], [0, -d]]) if (R.inside(x + dx, z + dz) && R.h[(z + dz) * N + x + dx] < R.water) near = true;
          if (!near) continue;
        }
        const cl = (nz.n2(x * 0.07 + p.id * 13.1, z * 0.07 - p.id * 7.3) + 1) * 0.5;
        const clusterK = Math.pow(cl, 1 + p.cluster * 3) * (1 + p.cluster * 2.5);
        const chance = (p.weight / totalW) * clusterK * (water ? 1.2 : (1.6 + f * 4.4)) * bi.flora * (p.tree ? 0.5 : 1);
        if (r.next() > chance) continue;
        const px = x + r.range(0.15, 0.85), pz = z + r.range(0.15, 0.85);
        if (p.tree) {
          if (treeAt.some((t) => (t[0] - px) ** 2 + (t[1] - pz) ** 2 < 5.5)) continue;
          treeAt.push([px, pz]);
        }
        inst.push([px, water ? R.water : R.heightAt(px, pz), pz, p.id, r.int(0, p.sprites.length - 1)]);
      }
    }
    // canopy shade: trees darken a wide ring of ground, shrubs a little patch
    this.shade = new Float32Array(N * N).fill(1);
    for (const p of inst) {
      const sp = this.species[p[3]];
      const rad = sp.tree ? 2.6 : sp.hmax > 0.9 ? 1.2 : 0.7, k = sp.tree ? 0.22 : 0.07;
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const X = Math.floor(p[0]) + dx, Z = Math.floor(p[2]) + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
        const d = Math.hypot(X + 0.5 - p[0], Z + 0.5 - p[2]); if (d > rad) continue;
        this.shade[Z * N + X] = Math.max(0.45, this.shade[Z * N + X] - k * (1 - d / rad));
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
    const SEG = detail ? 1 : 4, gp: number[] = [], gu: number[] = [], gi: number[] = [];
    for (let k = 0; k <= SEG; k++) { const y = k / SEG; gp.push(-0.5, y, 0, 0.5, y, 0); gu.push(0, y, 1, y); if (k < SEG) { const a = k * 2; gi.push(a, a + 1, a + 3, a, a + 3, a + 2); } }
    g.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(gu, 2));
    g.setIndex(gi);
    const pos = new Float32Array(n * 3), size = new Float32Array(n * 2), rect = new Float32Array(n * 4), param = new Float32Array(n * 4), anim = new Float32Array(n * 2);
    const r = new Rand(this.region.seed ^ (detail ? 0xd7 : 0xa1));
    list.forEach((p, i) => {
      const s = detail ? this.atlas.detail[p[3]] : this.species[p[3]].sprites[p[4]];
      const flat = !detail && this.species[p[3]].arch === 'lily';
      const k = detail ? 1 : r.range(0.92, 1.08);
      pos.set([p[0], p[1], p[2]], i * 3);
      size.set([s.w * k, s.h * k], i * 2);
      rect.set([s.u0, s.v0, s.du, s.dv], i * 4);
      param.set([r.range(0, 6.28), detail ? 0.6 : (this.species[p[3]].tree ? 0.35 : 1), 1, (r.chance(0.5) ? 1 : -1) * (flat ? 2 : 1)], i * 4);
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
uniform sampler2D uVis; uniform float uN; uniform vec3 uDark;
varying float vWither; varying vec3 vBase;
${SHADER_NOISE}
${FOW_FN}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
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
