// THE BLUEPRINT WORLD: while build mode is open the world is drawn as a blueprint. A full-screen pass after the game's
// own image (it wraps engine.post.render for the world scene only, so the HUD's 3D hardware still draws over it) reads
// the G-buffer (depth, world normals) and a MASK of the colony's structures (the factory render group drawn again with
// a flat id / normal / kind material) and paints, at 2 screen px per art px:
//   cyan-blue paper: mottled in world space, fibre grain, a posterised hill-shade, ordered dither between the tones;
//   a crisp 1 m grid with 5 m majors, terrain contours every 0.5 m (2 m majors), hatched water;
//   flora, rocks and creatures as outlined stippled masses (a site plan's trees);
//   buildings as WHITE TECHNICAL DRAWINGS: bright silhouettes, part and crease lines, roofs washed, walls hatched;
//   construction sites dashed in amber; the ghost in hand as a glowing green (fits) or red (does not) hologram with a
//   scan sweep; the selection with a halo; power cables as lines; ore seams stippled; around the cursor while a
//   building is in hand, every cell it cannot use is hatched red and the grid lights up where it can.
// The pass is revealed by a radial WIPE with a dissolving, glowing front (the transition in and out of build mode).
import * as THREE from 'three';
import type { Factory } from '../../factory/factory';
import type { Post } from '../../gfx/post';
import { FDEFS, type FKind } from '../../factory/defs';

/** mask kinds (alpha = kind / 16) */
export const MK = { none: 0, building: 1, site: 2, ghostOk: 3, ghostBad: 4, sel: 5, res: 6, line: 7, item: 8, hover: 9, moving: 10 } as const;

const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const MASK_V = /* glsl */`
#include <common>
varying vec3 vN; varying float vI;
void main() {
  #include <beginnormal_vertex>
  #include <begin_vertex>
  vec3 n = objectNormal;
  vec4 wp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  wp = instanceMatrix * wp; n = mat3(instanceMatrix) * n; vI = float(gl_InstanceID);
#else
  vI = 0.0;
#endif
  wp = modelMatrix * wp;
  vN = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const MASK_F = /* glsl */`
uniform float uKind, uObj; varying vec3 vN; varying float vI;
void main() {
  vec3 n = vN; float l = length(n); n = l > 1e-4 ? n / l : vec3(0.0, 1.0, 0.0);
  if (!gl_FrontFacing) n = -n;
  float id = fract(sin(uObj * 12.9898 + vI * 78.233 + 0.5) * 43758.5453);
  gl_FragColor = vec4(id, n.x * 0.5 + 0.5, n.z * 0.5 + 0.5, uKind / 16.0 + 0.01);
}`;
const LINE_V = /* glsl */`
void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }`;
const LINE_F = /* glsl */`
uniform float uKind; void main() { gl_FragColor = vec4(0.0, 0.5, 0.5, uKind / 16.0 + 0.01); }`;

const BP_F = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth, tNormal, tMask, tCell, tHgt;
uniform mat4 uInvProj, uCamWorld;
uniform vec2 uRes, uWipeC;
uniform float uTime, uMix, uWipe, uN, uFovK, uK, uHand, uSeam, uTray, uSelPulse;
uniform vec3 uCursor;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
// the kit's CLUSTERED dither threshold (src/ui/kit/paint.ts clusterT): smooth noise at ~3 art px plus a 2 x 2 jitter,
// so tone steps break along wavy clumps like hand pixelling (never a bayer checker or a line pattern)
float clusterT(vec2 p) { return clamp(0.5 + (vnoise(p / 3.0 + 91.7) - 0.5) * 1.7 + (h21(floor(p / 2.0) + 5.3) - 0.5) * 0.22, 0.02, 0.98); }
// the blueprint ramp (palette: sapphire, quartz light)
vec3 rampC(float i) {
  if (i < 0.5) return vec3(0.051, 0.090, 0.188);
  if (i < 1.5) return vec3(0.082, 0.149, 0.310);
  if (i < 2.5) return vec3(0.118, 0.227, 0.447);
  if (i < 3.5) return vec3(0.169, 0.322, 0.573);
  if (i < 4.5) return vec3(0.267, 0.447, 0.678);
  if (i < 5.5) return vec3(0.435, 0.600, 0.773);
  if (i < 6.5) return vec3(0.659, 0.769, 0.859);
  return vec3(0.890, 0.902, 0.875);
}
const vec3 WHITE = vec3(0.890, 0.902, 0.875);
const vec3 OKC = vec3(0.584, 0.800, 0.690), OKL = vec3(0.780, 0.902, 0.808);
const vec3 BADC = vec3(0.608, 0.259, 0.220), BADL = vec3(0.855, 0.529, 0.416);
const vec3 AMB = vec3(0.933, 0.800, 0.557), AMBD = vec3(0.698, 0.490, 0.204);
struct S { vec3 P; float vz; bool sky; };
S at(vec2 uv) {
  float d = texture2D(tDepth, uv).r; S s; s.sky = d >= 0.99999;
  vec4 c = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vec3 V = c.xyz / c.w;
  s.vz = -V.z; s.P = (uCamWorld * vec4(V, 1.0)).xyz; return s;
}
float gh(vec2 xz) { return texture2D(tHgt, xz / uN).r; }
bool isObj(S s) { return !s.sky && s.P.y - gh(s.P.xz) > 0.5; }
float kindOf(vec4 m) { return floor(m.a * 16.0 + 0.3); }
vec4 cellAt(vec2 xz) { return texture2D(tCell, (floor(xz) + 0.5) / uN); }
bool same(vec4 a, vec4 b) { return abs(a.r - b.r) < 0.004 && length(a.gb - b.gb) < 0.16; }

void main() {
  // drawn at the art resolution (one fragment per art pixel), then blown up with nearest filtering
  vec2 cp = floor(gl_FragCoord.xy);
  vec2 fc = (cp + 0.5) * uK;
  vec2 uv = fc / uRes, dx = vec2(uK / uRes.x, 0.0), dy = vec2(0.0, uK / uRes.y);
  // the wipe: a dissolving front, art pixel by art pixel
  float r = length((fc - uWipeC) / uRes.y);
  float thr = r + (h21(cp * 0.731 + 3.1) - 0.5) * 0.06;
  float front = uWipe * 1.25;
  if (thr > front) discard;
  float edgeK = clamp(1.0 - (front - thr) / 0.035, 0.0, 1.0);
  float glowK = clamp(1.0 - (front - thr) / 0.22, 0.0, 1.0) * step(0.001, 1.0 - uWipe);

  S s = at(uv), sr = at(uv + dx), su = at(uv + dy);
  float pxW = s.vz * uFovK / uRes.y * uK; // world metres per art pixel
  bool obj = isObj(s), objR = isObj(sr), objU = isObj(su);
  vec3 N = normalize(texture2D(tNormal, uv).xyz * 2.0 - 1.0);
  vec4 cell = cellAt(s.P.xz);
  bool water = !obj && !s.sky && cell.g > 0.5;

  // ---- paper
  float L = 2.45;
  L += (vnoise(s.P.xz * 0.045) - 0.5) * 0.55 + (vnoise(s.P.xz * 0.17 + 7.0) - 0.5) * 0.22;
  float hs = dot(N, normalize(vec3(-0.55, 0.78, -0.32)));
  if (!obj) L += clamp((hs - 0.8) * 1.6, -0.8, 0.35);
  float fib = h21(cp);
  L += (fib - 0.5) * 0.18;
  if (h21(cp + 11.0) > 0.985) L += 0.6; // paper flecks
  if (h21(cp * 1.31 + 23.0) > 0.99) L -= 0.5;
  if (s.sky) L = 2.0 + (fib - 0.5) * 0.4;
  if (water) {
    // water: a deeper tone with soft ripple glints drifting over it (clumps, not lines)
    L = 1.55 + (vnoise(s.P.xz * 0.3 + uTime * 0.05) - 0.5) * 0.5;
    if (vnoise(vec2(s.P.x * 1.1, s.P.z * 2.6) + vec2(uTime * 0.21, -uTime * 0.13)) > 0.74) L += 1.0;
  }
  float tray = uTray * clamp(1.0 - fc.y / (uRes.y * 0.24), 0.0, 1.0);
  L -= tray * tray * 1.6;
  float Lf = floor(L); L = clamp(Lf + step(clusterT(cp), L - Lf), 0.0, 4.0);
  vec3 col = rampC(L);

  // ---- grid (ground only) and contours
  bool smooth = !s.sky && abs(s.vz - sr.vz) < 0.35 + s.vz * 0.012 && abs(s.vz - su.vz) < 0.35 + s.vz * 0.012;
  bool flatG = !obj && !objR && !objU && smooth;
  float minorK = clamp(1.6 - pxW * 3.2, 0.0, 1.0);
  vec4 cur = cellAt(s.P.xz);
  float nearC = uHand * clamp(1.0 - length(s.P.xz - uCursor.xy) / max(1.0, uCursor.z), 0.0, 1.0);
  if (flatG) {
    float c0 = floor(s.P.y / 0.5), cR = floor(sr.P.y / 0.5), cU = floor(su.P.y / 0.5);
    bool cont = c0 != cR || c0 != cU;
    bool contM = floor(s.P.y / 2.0) != floor(sr.P.y / 2.0) || floor(s.P.y / 2.0) != floor(su.P.y / 2.0);
    if (cont && !water) col = mix(col, rampC(contM ? 5.0 : 4.0), contM ? 0.7 : 0.5);
  }
  // ---- seams (ore under the ground): stippled, outlined
  if (!obj && cell.b > 0.5) {
    float k = 0.35 + uSeam * 0.45;
    if (clusterT(cp + 40.0) < 0.3) col = mix(col, rampC(6.0), k);
    vec4 cr = cellAt(sr.P.xz), cu = cellAt(su.P.xz);
    if (cr.b < 0.5 || cu.b < 0.5) col = mix(col, uSeam > 0.5 ? OKL : rampC(6.0), 0.8);
  } else if (!obj) {
    vec4 cr = cellAt(sr.P.xz), cu = cellAt(su.P.xz);
    if (cr.b > 0.5 || cu.b > 0.5) col = mix(col, uSeam > 0.5 ? OKL : rampC(6.0), 0.8);
  }
  // ---- where the building in hand can go (near the cursor)
  if (nearC > 0.0 && !s.sky) {
    if (cur.r < 0.5) col = mix(col, clusterT(cp * 0.8 + 3.0) < 0.38 ? BADL : BADC, (0.3 + 0.25 * nearC) * nearC + 0.06);
    else if (!obj) {
      // a small cross at each free cell's corner, the cells it may use lighting up round the cursor
      vec2 q = abs(fract(s.P.xz + 0.5) - 0.5);
      if ((q.x < pxW * 0.6 && q.y < 0.14) || (q.y < pxW * 0.6 && q.x < 0.14)) col = mix(col, OKL, nearC);
    }
  }
  // ---- flora, rocks, creatures: stippled masses with a pale outline
  if (obj) {
    // a site plan's vegetation: a quiet mass one tone down, its crowns lit on the upper left
    float oh = clamp((hs + 0.1) * 1.2, 0.0, 1.0);
    col = rampC(clamp(floor(L - 0.6 + oh * 0.9 + clusterT(cp + 17.0) * 0.6), 1.0, 3.0));
  }
  if ((obj != objR || obj != objU) && !s.sky) col = mix(col, rampC(4.0), 0.35);
  // the printed grid runs over everything on the sheet (1 m minor, 5 m major)
  if (smooth) {
    vec2 g0 = floor(s.P.xz), gR = floor(sr.P.xz), gU = floor(su.P.xz);
    bool minor = any(notEqual(g0, gR)) || any(notEqual(g0, gU));
    vec2 M0 = floor(s.P.xz / 5.0), MR = floor(sr.P.xz / 5.0), MU = floor(su.P.xz / 5.0);
    bool major = any(notEqual(M0, MR)) || any(notEqual(M0, MU));
    if (minor) col = mix(col, rampC(4.0 + nearC * 2.0), (obj ? 0.3 : 0.42 + nearC * 0.45) * minorK + glowK * 0.5);
    if (major) col = mix(col, rampC(5.0 + nearC), (obj ? 0.6 : 0.78) + glowK * 0.2);
  }

  // ---- the colony's structures (the mask)
  vec4 m = texture2D(tMask, uv), mr = texture2D(tMask, uv + dx), mu = texture2D(tMask, uv + dy), ml = texture2D(tMask, uv - dx), md = texture2D(tMask, uv - dy);
  float k = kindOf(m), kr = kindOf(mr), ku = kindOf(mu), kl = kindOf(ml), kd = kindOf(md);
  if (k > 0.5) {
    bool sil = kr < 0.5 || ku < 0.5 || kl < 0.5 || kd < 0.5;
    bool crease = (kr > 0.5 && !same(m, mr)) || (ku > 0.5 && !same(m, mu)) || abs(s.vz - sr.vz) > 0.08 + s.vz * 0.006 || abs(s.vz - su.vz) > 0.08 + s.vz * 0.006;
    float ny = sqrt(max(0.0, 1.0 - pow(m.g * 2.0 - 1.0, 2.0) - pow(m.b * 2.0 - 1.0, 2.0)));
    bool wall = ny < 0.55;
    float dash = step(mod(cp.x + cp.y, 6.0), 2.9);
    if (k == 7.0) { col = mix(col, rampC(6.0), 0.85); }
    else if (k == 8.0) { col = WHITE; }
    else if (k == 6.0) {
      col = mix(col, rampC(3.0), 0.6);
      if (clusterT(cp + 61.0) < 0.3) col = mix(col, rampC(6.0), 0.5);
      if (sil || crease) col = rampC(6.0);
    } else if (k == 2.0) {
      // a construction site: a pale plan washed amber in clumps, dashed in amber
      col = mix(col, rampC(3.0), 0.55);
      if (clusterT(cp + 7.0) < 0.3) col = mix(col, AMBD, 0.45);
      if (sil) col = mix(col, AMB, dash);
      else if (crease) col = mix(col, rampC(5.0), 0.6);
    } else if (k == 3.0 || k == 4.0) {
      // the hologram in hand
      bool ok = k == 3.0;
      vec3 fill = ok ? OKC : BADC, line = ok ? OKL : BADL;
      float sweep = fract((s.P.x + s.P.z) * 0.18 - uTime * 0.7);
      float band = smoothstep(0.0, 0.06, sweep) * (1.0 - smoothstep(0.06, 0.18, sweep));
      col = mix(col, fill, 0.42 + band * 0.3 + (wall ? 0.08 : 0.0));
      if (wall && clusterT(cp) < 0.4) col = mix(col, line, 0.3);
      if (crease) col = mix(col, line, 0.75);
      if (sil) col = mix(line, WHITE, 0.35);
    } else if (k == 10.0) {
      // the original of a building being moved: a faint dashed ghost of where it was
      col = mix(col, rampC(3.0), 0.4);
      if (sil) col = mix(col, rampC(6.0), dash * 0.8);
    } else {
      // a building: white technical drawing
      bool hot = k == 5.0 || k == 9.0;
      col = mix(col, rampC(wall ? 3.0 : 4.0), wall ? 0.55 : 0.5);
      if (wall && clusterT(cp + 29.0) < 0.32) col = mix(col, rampC(4.0), 0.6);
      if (!wall && h21(cp * 0.37) > 0.93) col = mix(col, rampC(5.0), 0.4);
      if (crease) col = mix(col, rampC(6.0), hot ? 1.0 : 0.85);
      if (sil) col = WHITE;
      if (k == 5.0) col = mix(col, vec3(0.66, 0.9, 1.0), 0.18 + 0.12 * uSelPulse);
    }
  } else {
    // just outside a structure: a dark keyline (separation), and the selection's halo
    float nk = max(max(kr, ku), max(kl, kd));
    if (nk > 0.5) {
      bool hot = kr == 5.0 || ku == 5.0 || kl == 5.0 || kd == 5.0;
      bool gst = kr == 3.0 || ku == 3.0 || kl == 3.0 || kd == 3.0 || kr == 4.0 || ku == 4.0 || kl == 4.0 || kd == 4.0;
      col = hot ? mix(vec3(0.5, 0.85, 1.0), WHITE, uSelPulse * 0.5) : gst ? mix(col, rampC(0.0), 0.5) : mix(col, rampC(0.0), 0.75);
    }
  }
  // ---- the wipe front: a bright, printing edge
  if (glowK > 0.0) col = mix(col, rampC(6.0), glowK * 0.18);
  if (edgeK > 0.0 && uWipe < 0.999) col = mix(col, WHITE, edgeK * (0.6 + 0.4 * step(0.5, h21(cp + floor(uTime * 20.0)))));
  gl_FragColor = vec4(col, 1.0);
}`;
const BLIT_F = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tArt; uniform float uMix;
void main() { vec4 c = texture2D(tArt, vUv); if (c.a < 0.5) discard; gl_FragColor = vec4(c.rgb, uMix); }`;

/** world -> blueprint */
export class BlueprintWorld {
  /** overall strength 0..1 and the radial reveal 0..1 */
  mix = 0; wipe = 0;
  /** the wipe's centre (screen px, top-left origin) */
  wipeAt: [number, number] = [innerWidth / 2, innerHeight / 2];
  /** the bottom tray's darkening 0..1 */
  tray = 0;
  /** a building in hand: its kind (cell validity is computed for it) and the cursor (world) */
  hand: FKind | null = null;
  cursor: [number, number] = [0, 0];
  /** extra kinds for structures: the build mode marks the selection, the hover and a building being moved */
  marks = new Map<THREE.Object3D, number>();
  /** the factory's selected building (drawn singly) is the one being carried: draw it as the faint original */
  selMoving = false;
  private maskRT: THREE.WebGLRenderTarget; private artRT: THREE.WebGLRenderTarget; private blit: THREE.ShaderMaterial;
  private quad: THREE.Mesh; private qs = new THREE.Scene(); private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private maskMats = new Map<number, THREE.ShaderMaterial>(); private lineMats = new Map<number, THREE.ShaderMaterial>();
  private cellTex: THREE.DataTexture; private cellData: Uint8Array;
  private hgtTex: THREE.DataTexture; private hgtData: Uint16Array;
  private cellKey = ''; private cellT = 0; private hgtKey = '';
  private origRender: Post['render'] | null = null;
  private t = 0;

  constructor(readonly f: Factory) {
    const N = f.N;
    this.maskRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.artRT = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    this.blit = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BLIT_F, transparent: true, depthTest: false, depthWrite: false, uniforms: { tArt: { value: this.artRT.texture }, uMix: { value: 1 } } });
    this.cellData = new Uint8Array(N * N * 4);
    this.cellTex = new THREE.DataTexture(this.cellData, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.cellTex.minFilter = this.cellTex.magFilter = THREE.NearestFilter; this.cellTex.needsUpdate = true;
    this.hgtData = new Uint16Array(N * N);
    this.hgtTex = new THREE.DataTexture(this.hgtData, N, N, THREE.RedFormat, THREE.HalfFloatType);
    this.hgtTex.minFilter = this.hgtTex.magFilter = THREE.LinearFilter; this.hgtTex.needsUpdate = true;
    const post = f.g.engine.post;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: BP_F, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        tDepth: post.U.tDepth, tNormal: post.U.tNormal, tMask: { value: this.maskRT.texture }, tCell: { value: this.cellTex }, tHgt: { value: this.hgtTex },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
        uRes: { value: new THREE.Vector2(1, 1) }, uWipeC: { value: new THREE.Vector2() },
        uTime: { value: 0 }, uMix: { value: 0 }, uWipe: { value: 0 }, uN: { value: N }, uFovK: { value: 1 }, uK: { value: 2 }, uHand: { value: 0 }, uSeam: { value: 0 }, uTray: { value: 0 }, uSelPulse: { value: 0 },
        uCursor: { value: new THREE.Vector3() },
      },
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.quad = new THREE.Mesh(g, this.mat); this.quad.frustumCulled = false; this.qs.add(this.quad);
    this.install();
  }
  /** the blueprint draws right after the world's image, before the HUD's 3D */
  private install() {
    const post = this.f.g.engine.post;
    if (this.origRender) return;
    const orig = (this.origRender = post.render.bind(post));
    post.render = (scene, cam, fx, t) => {
      orig(scene, cam, fx, t);
      if (this.mix > 0.001 && scene === this.f.g.world.scene) { try { this.draw(cam); } catch (e) { console.error('blueprint', e); this.mix = 0; } }
    };
  }
  dispose() {
    if (this.origRender) { const post = this.f.g.engine.post; post.render = this.origRender; this.origRender = null; }
    this.maskRT.dispose(); this.artRT.dispose(); this.blit.dispose(); this.cellTex.dispose(); this.hgtTex.dispose(); this.mat.dispose();
    for (const m of [...this.maskMats.values(), ...this.lineMats.values()]) m.dispose();
  }

  private maskMat(kind: number, line: boolean) {
    const map = line ? this.lineMats : this.maskMats;
    let m = map.get(kind);
    if (m) return m;
    m = new THREE.ShaderMaterial({ vertexShader: line ? LINE_V : MASK_V, fragmentShader: line ? LINE_F : MASK_F, uniforms: { uKind: { value: kind }, uObj: { value: 0 } }, side: THREE.DoubleSide });
    if (!line) {
      const mm = m;
      mm.onBeforeRender = (_r, _s, _c, _g, obj) => { mm.uniforms.uObj.value = obj.id % 4093; mm.uniformsNeedUpdate = true; };
    }
    map.set(kind, m);
    return m;
  }
  /** what a mesh in the factory group is (building, site, ghost, cable, crate, outcrop) */
  private kindOf(o: THREE.Object3D, siteOf: Set<THREE.Object3D>): number {
    const ud = o.userData as { bpKind?: number; bpSkip?: boolean };
    if (ud.bpKind) return ud.bpKind;
    // marks set by the build mode (selection, hover, a building being moved) on an object or an ancestor
    for (let p: THREE.Object3D | null = o; p; p = p.parent) { const mk = this.marks.get(p); if (mk) return mk; if (siteOf.has(p)) return MK.site; if (p === this.f.render.group) break; }
    if ((o as THREE.LineSegments).isLineSegments || (o as THREE.Line).isLine) return MK.line;
    const mat = (o as THREE.Mesh).material as THREE.Material & { __flag?: { value: number } };
    if (mat && (mat as { __flag?: { value: number } }).__flag) { const fl = mat.__flag!.value; return fl & 2 ? (this.selMoving ? MK.moving : MK.sel) : fl & 4 ? MK.hover : MK.building; }
    if ((o as THREE.InstancedMesh).isInstancedMesh) return mat === this.f.render.mat ? MK.building : MK.item;
    if (o.parent === this.f.render.group && mat === this.f.render.mat) return MK.res;
    return MK.building;
  }
  /** other structures drawn as buildings: the colony pod */
  private extras(): THREE.Object3D[] {
    const c = (this.f.g as unknown as { colony?: { pod?: { model?: { root?: THREE.Object3D } } } }).colony;
    const pod = c?.pod?.model?.root;
    return pod && pod.visible ? [pod] : [];
  }
  private renderMask(cam: THREE.Camera, w: number, h: number) {
    const r = this.f.g.engine.renderer, grp = this.f.render.group, extras = this.extras();
    if (this.maskRT.width !== w || this.maskRT.height !== h) this.maskRT.setSize(w, h);
    const siteOf = new Set<THREE.Object3D>(this.f.sites?.list.map((s) => s.mesh) ?? []);
    const swaps: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const hidden: THREE.Object3D[] = [];
    const swap = (root: THREE.Object3D, force?: number) => root.traverseVisible((o) => {
      if ((o.userData as { bpSkip?: boolean }).bpSkip) { hidden.push(o); return; }
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Line).isLine && !(o as THREE.LineSegments).isLineSegments) return;
      if ((o as THREE.Points).isPoints || (o as unknown as THREE.Sprite).isSprite) return;
      const line = !m.isMesh;
      const mat = m.material as THREE.Material & { transparent?: boolean; blending?: number };
      if (force && (mat?.transparent || mat?.blending === THREE.AdditiveBlending)) { hidden.push(o); return; }
      swaps.push([m, m.material]);
      m.material = this.maskMat(force && !line ? force : this.kindOf(o, siteOf), line);
    });
    swap(grp);
    for (const e of extras) swap(e, MK.building);
    for (const o of hidden) o.visible = false;
    const prev = r.getRenderTarget(), pc = r.getClearColor(new THREE.Color()).getHex(), pa = r.getClearAlpha(), ac = r.autoClear;
    const sh = r.shadowMap.enabled;
    try {
      r.shadowMap.enabled = false;
      r.setRenderTarget(this.maskRT); r.setClearColor(0x000000, 0); r.autoClear = false; r.clear(true, true, false);
      r.render(grp, cam);
      for (const e of extras) r.render(e, cam);
    } finally {
      for (const [m, mat] of swaps) m.material = mat;
      for (const o of hidden) o.visible = true;
      r.setRenderTarget(prev); r.setClearColor(pc, pa); r.autoClear = ac; r.shadowMap.enabled = sh;
    }
  }
  private draw(cam: THREE.PerspectiveCamera) {
    const post = this.f.g.engine.post, r = this.f.g.engine.renderer;
    this.renderMask(cam, post.w, post.h);
    const U = this.mat.uniforms;
    (U.uInvProj.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    (U.uCamWorld.value as THREE.Matrix4).copy(cam.matrixWorld);
    (U.uRes.value as THREE.Vector2).set(post.w, post.h);
    const sc = post.w / Math.max(1, innerWidth);
    (U.uWipeC.value as THREE.Vector2).set(this.wipeAt[0] * sc, post.h - this.wipeAt[1] * sc);
    U.uTime.value = this.t; U.uMix.value = this.mix; U.uWipe.value = this.wipe;
    U.uFovK.value = 2 * Math.tan((cam.fov * Math.PI) / 360);
    const K = Math.max(1, Math.round(2 * sc));
    U.uK.value = K;
    U.uHand.value = this.hand ? 1 : 0; U.uTray.value = this.tray;
    U.uSeam.value = this.hand && FDEFS[this.hand]?.extract === 'node' ? 1 : 0;
    U.uSelPulse.value = 0.5 + 0.5 * Math.sin(this.t * 5);
    (U.uCursor.value as THREE.Vector3).set(this.cursor[0], this.cursor[1], 11);
    const aw = Math.ceil(post.w / K), ah = Math.ceil(post.h / K);
    if (this.artRT.width !== aw || this.artRT.height !== ah) this.artRT.setSize(aw, ah);
    const prev = r.getRenderTarget(), ac = r.autoClear, pc = r.getClearColor(new THREE.Color()).getHex(), pa = r.getClearAlpha();
    // the blueprint at one fragment per art pixel, then laid over the image (nearest: crisp 2 x 2 pixels)
    r.setRenderTarget(this.artRT); r.setClearColor(0x000000, 0); r.autoClear = false; r.clear(true, false, false);
    this.quad.material = this.mat; r.render(this.qs, this.ortho);
    r.setRenderTarget(null);
    this.blit.uniforms.uMix.value = this.mix;
    this.quad.material = this.blit; r.render(this.qs, this.ortho);
    this.quad.material = this.mat;
    r.autoClear = ac; r.setRenderTarget(prev); r.setClearColor(pc, pa);
  }

  // ------------------------------------------------------------------ the cell maps
  update(dt: number) {
    this.t += dt;
    if (this.mix <= 0.001) return;
    const f = this.f;
    const hk = `${f.buildings.length}|${f.sites?.list.length ?? 0}`;
    if (hk !== this.hgtKey) { this.hgtKey = hk; this.heights(); }
    this.cellT -= dt;
    const ck = `${this.hand}|${hk}`;
    if (ck !== this.cellKey || this.cellT <= 0) { this.cellKey = ck; this.cellT = 1.5; this.cells(); }
  }
  private heights() {
    const R = this.f.g.region, N = this.f.N, d = this.hgtData;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) d[z * N + x] = THREE.DataUtils.toHalfFloat(Math.max(R.water - 0.2, R.groundSmooth(x + 0.5, z + 0.5)));
    this.hgtTex.needsUpdate = true;
  }
  /** per cell: R = the building in hand may use it, G = water, B = an ore seam, A = taken */
  private cells() {
    const f = this.f, R = f.g.region, N = f.N, d = this.cellData, k = this.hand, def = k ? FDEFS[k] : null;
    const core = f.hive.core;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x, o = i * 4;
      const wet = R.isWater(x + 0.5, z + 0.5);
      const seam = f.seamAt[i] >= 0;
      const taken = f.grid[i] !== 0 || R.solid[i] === 1;
      let ok = !taken && x >= 2 && z >= 2 && x < N - 2 && z < N - 2;
      if (ok && def) {
        if (def.extract === 'water') ok = wet;
        else if (wet && k !== 'found' && k !== 'dam' && k !== 'sluice' && k !== 'pipe' && !f.foundAt(x, z)) ok = false;
        if (ok && def.extract === 'node') ok = seam;
        if (ok && core && Math.hypot(x + 0.5 - core.x, z + 0.5 - core.z) < 2.4) ok = false;
        if (ok && !wet) {
          // too steep for a footing
          const h = R.h[i], hx = R.h[Math.min(N - 1, x + 1) + z * N], hz = R.h[x + Math.min(N - 1, z + 1) * N];
          if (Math.abs(h - hx) > 1.2 || Math.abs(h - hz) > 1.2) ok = false;
        }
      }
      d[o] = ok ? 255 : 0; d[o + 1] = wet ? 255 : 0; d[o + 2] = seam ? 255 : 0; d[o + 3] = taken ? 255 : 0;
    }
    this.cellTex.needsUpdate = true;
  }
}
