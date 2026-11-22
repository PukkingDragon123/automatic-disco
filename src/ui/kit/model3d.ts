// UI KIT · 3D ELEMENTS IN THE UI. Small three.js models drawn INTO the 2D UI as pixel art: one shared offscreen WebGL
// context renders a model at art resolution (shown at 2x), then a post pass inks it: a solid BLACK OUTLINE round the
// silhouette, ink contour lines where a nearer part overlaps a farther one, a warm rim on the upper-left edge pixels
// and a shaded lower-right, ordered-dither quantising, and an optional dithered drop shadow. The material is the kit's
// TOON shader: painted pixel textures (src/ui/kit/tex3d.ts), a 5-step banded key light fixed to the view (upper left),
// a cool fill, stepped speculars on metal, a rim, emissive parts (lamps, glass glow). Ported and grown from
// Limbophobia's machine renderer (src/ui/machine/core.ts) and floating icons (src/ui/floatIcon.ts).
//   toon({ color, map, metal, gloss, emissive, rim, opacity })          the material (cached by its options)
//   renderModel(root, ctx, w, h, { yaw, pitch, roll, squash, zoom, shadow })   one frame into a 2D context
//   new ModelView(build, { w, h, scale, pitch, spin, hotSpin, tilt, shadow })  a live, interactive model in the DOM:
//        .cv (the canvas) .hot(on) .press() .poke(v) .setSpin(v) .dispose() .root (when built) .yaw
//   snapshot(key, build, w, h, o) -> HTMLCanvasElement                  a cached still (map markers, icons)
//   fitRoot(obj) -> Group                                               centre a model on its footprint, foot at y = 0
import * as THREE from 'three';
import { onFrame, Spring } from './juice';

// ------------------------------------------------------------------ the toon material
const VERT = /* glsl */`
varying vec3 vN; varying vec2 vUv; varying vec3 vCol; varying vec3 vW;
attribute vec3 color;
void main() {
  vUv = uv;
#ifdef VCOL
  vCol = color;
#else
  vCol = vec3(1.0);
#endif
  vN = normalize(normalMatrix * normal);
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uEmissive; uniform float uMetal; uniform float uGloss; uniform float uRim; uniform float uOpacity; uniform float uLight;
uniform vec3 uKey; uniform vec3 uFill; uniform float uBright;
#ifdef USE_MAP
uniform sampler2D uMap;
#endif
varying vec3 vN; varying vec2 vUv; varying vec3 vCol; varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 base = uColor * vCol;
  float a = uOpacity;
#ifdef USE_MAP
  vec4 t = texture2D(uMap, vUv);
  base *= t.rgb;
  a *= t.a;
  if (a < 0.5) discard;
#endif
  float lam = clamp(dot(n, uKey), 0.0, 1.0);
  lam = floor(lam * 4.0 + 0.5) / 4.0;
  float fill = clamp(dot(n, uFill), 0.0, 1.0);
  vec3 col = base * (0.42 + lam * 0.84 * uLight + fill * 0.18) * uBright;
  col += base * vec3(-0.02, 0.0, 0.05) * fill;
  vec3 h = normalize(uKey + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(n, h), 0.0), 8.0 + uMetal * 36.0);
  col += (step(0.45, sp) * 0.28 + step(0.82, sp) * 0.42) * (uMetal * 0.9 + uGloss * 0.6) * vec3(1.0, 0.96, 0.86);
  float rim = 1.0 - clamp(n.z, 0.0, 1.0);
  col += rim * rim * rim * uRim * vec3(1.0, 0.92, 0.78);
  col += uEmissive;
  gl_FragColor = vec4(col, a);
}`;
const KEY = new THREE.Vector3(-0.55, 0.72, 0.52).normalize(), FILL = new THREE.Vector3(0.7, -0.35, 0.45).normalize();
export interface ToonOpts { color?: number; map?: THREE.Texture | null; metal?: number; gloss?: number; emissive?: number; emissiveK?: number; rim?: number; opacity?: number; side?: THREE.Side; light?: number; vcol?: boolean; bright?: number }
const mats = new Map<string, THREE.ShaderMaterial>();
/** the kit's toon material (cached by options; a map is keyed by its uuid) */
export function toon(o: ToonOpts = {}): THREE.ShaderMaterial {
  const key = JSON.stringify([o.color, o.map?.uuid, o.metal, o.gloss, o.emissive, o.emissiveK, o.rim, o.opacity, o.side, o.light, o.vcol, o.bright]);
  const hit = mats.get(key); if (hit) return hit;
  const c = new THREE.Color(o.color ?? 0xffffff), e = new THREE.Color(o.emissive ?? 0x000000).multiplyScalar(o.emissiveK ?? 1);
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    defines: { ...(o.map ? { USE_MAP: '' } : {}), ...(o.vcol ? { VCOL: '' } : {}) },
    side: o.side ?? THREE.FrontSide,
    transparent: (o.opacity ?? 1) < 1, depthWrite: (o.opacity ?? 1) >= 1,
    uniforms: {
      uColor: { value: new THREE.Vector3(c.r, c.g, c.b) }, uEmissive: { value: new THREE.Vector3(e.r, e.g, e.b) },
      uMetal: { value: o.metal ?? 0 }, uGloss: { value: o.gloss ?? 0.2 }, uRim: { value: o.rim ?? 0.12 }, uOpacity: { value: o.opacity ?? 1 },
      uLight: { value: o.light ?? 1 }, uMap: { value: o.map ?? null }, uKey: { value: KEY }, uFill: { value: FILL }, uBright: { value: o.bright ?? 1 },
    },
  });
  (m as unknown as { _keep: boolean })._keep = true;
  mats.set(key, m);
  return m;
}

// ------------------------------------------------------------------ the ink post pass
const POST_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const POST_FRAG = /* glsl */`
uniform sampler2D tSrc; uniform sampler2D tDepth; uniform vec2 uRes; uniform vec2 uScale; uniform float uEdge; uniform vec2 uShadow; uniform float uShadowA; uniform float uInk; uniform float uRimK;
varying vec2 vUv;
float bay(vec2 p) {
  vec2 q = mod(p, 4.0); float x = q.x, y = q.y;
  float v = mod(x, 2.0) * 2.0 + mod(y, 2.0) * 3.0 - mod(x, 2.0) * mod(y, 2.0) * 4.0;
  float w = floor(x / 2.0) * 2.0 + floor(y / 2.0) * 3.0 - floor(x / 2.0) * floor(y / 2.0) * 4.0;
  return (v * 4.0 + w) / 16.0;
}
float A(vec2 uv) { return texture2D(tSrc, uv).a; }
float Z(vec2 uv) { return texture2D(tDepth, uv).x; }
void main() {
  vec2 px = 1.0 / uRes;
  vec2 uv = vUv * uScale;
  vec4 c = texture2D(tSrc, uv);
  float a = c.a;
  vec3 INKC = vec3(0.027, 0.03, 0.04);
  if (a < 0.4) {
    float n = max(max(A(uv + vec2(px.x, 0.0)), A(uv - vec2(px.x, 0.0))), max(A(uv + vec2(0.0, px.y)), A(uv - vec2(0.0, px.y))));
    if (uInk > 1.5) n = max(n, max(max(A(uv + px), A(uv - px)), max(A(uv + vec2(px.x, -px.y)), A(uv + vec2(-px.x, px.y)))));
    if (n > 0.4) { gl_FragColor = vec4(INKC, 1.0); return; }
    vec2 so = uv + vec2(-px.x * uShadow.x, px.y * uShadow.y);
    if (uShadowA > 0.0 && A(so) > 0.4 && so.x > 0.0 && so.y < uScale.y && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, uShadowA); return; }
    gl_FragColor = vec4(0.0); return;
  }
  vec3 col = c.rgb;
  // ink contours: a nearer part's edge over a farther one (a depth step, not a slope)
  float d0 = Z(uv), dl = Z(uv - vec2(px.x, 0.0)), dr = Z(uv + vec2(px.x, 0.0)), dd = Z(uv - vec2(0.0, px.y)), du = Z(uv + vec2(0.0, px.y));
  float near = d0 - min(min(dl, dr), min(dd, du));
  float lap = max(abs(dl + dr - 2.0 * d0), abs(dd + du - 2.0 * d0));
  if (near > uEdge && lap > uEdge * 0.8) { gl_FragColor = vec4(mix(INKC, col, 0.12), 1.0); return; }
  // the rim: upper-left silhouette pixels catch the light, lower-right ones drop into shade
  float ul = min(A(uv + vec2(-px.x, px.y)), min(A(uv + vec2(0.0, px.y)), A(uv - vec2(px.x, 0.0))));
  float lr = min(A(uv + vec2(px.x, -px.y)), min(A(uv - vec2(0.0, px.y)), A(uv + vec2(px.x, 0.0))));
  if (ul < 0.4) col = col * (1.0 + 0.28 * uRimK) + vec3(0.12, 0.1, 0.05) * uRimK;
  else if (lr < 0.4) col *= 1.0 - 0.26 * uRimK;
  float dth = bay(floor(gl_FragCoord.xy)) - 0.5;
  col = floor(clamp(col, 0.0, 1.0) * 26.0 + 0.5 + dth * 0.85) / 26.0;
  gl_FragColor = vec4(col, 1.0);
}`;

let R: THREE.WebGLRenderer | null = null, dead = false;
let rt: THREE.WebGLRenderTarget | null = null;
let post: { scene: THREE.Scene; cam: THREE.Camera; mat: THREE.ShaderMaterial } | null = null;
const scene = new THREE.Scene();
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
/** draws so far (dev probes) */
export const m3Stats = { draws: 0, ms: 0 };
export function m3Ok(): boolean { return !!gl(); }
function gl(): THREE.WebGLRenderer | null {
  if (R || dead) return R;
  try {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
    R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power', depth: true, stencil: false });
    R.setPixelRatio(1); R.autoClear = false;
    R.outputColorSpace = THREE.LinearSRGBColorSpace;
    cv.addEventListener('webglcontextlost', (e) => e.preventDefault());
    const mat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false, transparent: false,
      uniforms: { tSrc: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uScale: { value: new THREE.Vector2(1, 1) }, uEdge: { value: 0.02 }, uShadow: { value: new THREE.Vector2(2, 2) }, uShadowA: { value: 0 }, uInk: { value: 1 }, uRimK: { value: 1 } },
    });
    const ps = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; ps.add(q);
    post = { scene: ps, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
  } catch (e) { console.warn('ui kit: no WebGL for 3D elements', e); R = null; dead = true; }
  return R;
}
function ensureRT(w: number, h: number) {
  if (rt && rt.width >= w && rt.height >= h) return;
  const nw = Math.max(256, Math.ceil(w / 128) * 128, rt?.width ?? 0), nh = Math.max(256, Math.ceil(h / 128) * 128, rt?.height ?? 0);
  rt?.dispose();
  const dt = new THREE.DepthTexture(nw, nh); dt.minFilter = dt.magFilter = THREE.NearestFilter;
  rt = new THREE.WebGLRenderTarget(nw, nh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: dt, generateMipmaps: false });
  post!.mat.uniforms.tDepth.value = dt; post!.mat.uniforms.uRes.value.set(nw, nh);
}

/** centre a model on its footprint with its foot at y = 0; records its radius for framing (userData.fitR, fitH) */
export function fitRoot(obj: THREE.Object3D): THREE.Group {
  const g = new THREE.Group(), box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= box.min.y;
  g.add(obj);
  g.userData.fitR = Math.max(0.001, Math.hypot(s.x, s.y, s.z) / 2); g.userData.fitH = s.y; g.userData.fitW = Math.max(s.x, s.z);
  return g;
}

export interface ShotOpts {
  yaw?: number; pitch?: number; roll?: number;
  /** squash and stretch about the foot: + flat and wide, - tall and thin */
  squash?: number;
  /** framing: 1 fits the bounding sphere; > 1 closer */
  zoom?: number;
  /** a dithered drop shadow down-right (art px) */
  shadow?: [number, number, number];
  /** 1 thin 4-way outline, 2 heavy 8-way */
  ink?: number;
  /** lift (fraction of the frame, up) */
  lift?: number;
  /** contour threshold (fraction of the model's depth span) */
  edge?: number;
  rimK?: number;
}
const pivot = new THREE.Group(); scene.add(pivot);
/** render one frame of a fitted model (fitRoot) into a 2D context at (dx, dy), w x h art pixels */
export function renderModel(root: THREE.Object3D, out: CanvasRenderingContext2D, w: number, h: number, o: ShotOpts = {}, dx = 0, dy = 0): boolean {
  const r = gl(); if (!r || !post) return false;
  const t0 = performance.now();
  ensureRT(w, h);
  const cv = r.domElement;
  if (cv.width < w || cv.height < h) r.setSize(Math.max(cv.width, Math.ceil(w / 64) * 64), Math.max(cv.height, Math.ceil(h / 64) * 64), false);
  const R0 = (root.userData.fitR as number) || 1, H0 = (root.userData.fitH as number) || R0;
  // the turntable: yaw about the foot, the squash from the foot, a little roll for tilt
  pivot.rotation.set(0, 0, 0); pivot.scale.set(1, 1, 1);
  root.rotation.y = o.yaw ?? 0;
  const sq = o.squash ?? 0;
  pivot.scale.set(1 + sq * 0.8, 1 - sq, 1 + sq * 0.8);
  pivot.rotation.z = o.roll ?? 0;
  pivot.position.set(0, -H0 / 2, 0);
  pivot.add(root);
  // the camera: orthographic, pitched down, framing the bounding sphere
  const zoom = o.zoom ?? 1, half = R0 / zoom, asp = w / h, pitch = o.pitch ?? 0.45, dist = R0 * 4;
  cam.left = -half * Math.max(1, asp); cam.right = half * Math.max(1, asp); cam.top = half / Math.min(1, asp); cam.bottom = -half / Math.min(1, asp);
  cam.near = dist - R0 * 1.6; cam.far = dist + R0 * 1.6;
  const lift = (o.lift ?? 0) * half * 2;
  cam.position.set(0, Math.sin(pitch) * dist - lift, Math.cos(pitch) * dist);
  cam.lookAt(0, -lift, 0);
  cam.updateProjectionMatrix();
  const target = rt!;
  target.viewport.set(0, 0, w, h); target.scissor.set(0, 0, Math.min(target.width, w + 2), Math.min(target.height, h + 2)); target.scissorTest = true;
  r.setRenderTarget(target); r.setClearColor(0x000000, 0); r.clear(true, true, false);
  target.scissor.set(0, 0, w, h);
  r.render(scene, cam);
  pivot.remove(root);
  r.setRenderTarget(null); r.setScissorTest(false); r.setViewport(0, 0, w, h);
  r.setClearColor(0x000000, 0); r.clear(true, false, false);
  const u = post.mat.uniforms;
  u.tSrc.value = target.texture; u.uScale.value.set(w / target.width, h / target.height);
  const sh = o.shadow; u.uShadow.value.set(sh?.[0] ?? 2, sh?.[1] ?? 2); u.uShadowA.value = sh ? sh[2] : 0;
  u.uEdge.value = (o.edge ?? 0.06) * (R0 * 2) / (cam.far - cam.near);
  u.uInk.value = o.ink ?? 1; u.uRimK.value = o.rimK ?? 1;
  r.render(post.scene, post.cam);
  out.clearRect(dx, dy, w, h);
  out.drawImage(cv, 0, cv.height - h, w, h, dx, dy, w, h);
  m3Stats.draws++; m3Stats.ms += performance.now() - t0;
  return true;
}

// ------------------------------------------------------------------ live interactive views
/** `?k7static`: no live re-rendering (only state changes redraw): for headless QA on software GL */
const STATIC = typeof location !== 'undefined' && location.search.includes('k7static');
const views = new Set<ModelView>();
let viewTick: (() => void) | null = null;
export interface ViewOpts {
  w?: number; h?: number;
  /** screen px per art px */
  scale?: number;
  pitch?: number;
  /** idle turn (rad/s; 0 = a slow rock either side of yaw0) */
  spin?: number;
  /** turn while hot */
  hotSpin?: number;
  yaw0?: number;
  zoom?: number;
  /** tilt toward the pointer while hot */
  tilt?: boolean;
  shadow?: [number, number, number];
  ink?: number;
  /** frames in the idle turntable cache */
  frames?: number;
  /** the idle rock either side of yaw0 (rad) when spin is 0 */
  rock?: number;
  lift?: number;
  cls?: string;
  /** called every rendered frame with the time and hot state (live parts: bubbles, lamps, needles) */
  anim?: (root: THREE.Object3D, t: number, hot: boolean) => void;
  /** render live while idle too (for animated parts), at this many fps */
  liveFps?: number;
}
/**
 * a live 3D element in the DOM: an outlined pixel-art model that turns on its turntable, turns faster and tilts toward
 * the pointer while hot, squashes and springs when pressed, spins when poked. Idle frames are cached (a turntable sheet
 * built lazily), so a page of resting models costs nothing.
 */
export class ModelView {
  readonly cv: HTMLCanvasElement; readonly c: CanvasRenderingContext2D;
  root: THREE.Group | null = null;
  yaw: number; private vy = 0; private t = Math.random() * 10; private isHot = false; private dirty = true; private last = '';
  private sq = new Spring(0, { k: 300, d: 13 }); private tx = new Spring(0, { k: 90, d: 12 }); private tz = new Spring(0, { k: 90, d: 12 });
  private cache = new Map<number, HTMLCanvasElement>(); private seenT = 0; private visible = true; private liveAcc = 0;
  readonly w: number; readonly h: number;
  private pointer: { x: number; y: number } | null = null;
  constructor(build: () => THREE.Object3D | Promise<THREE.Object3D | null>, readonly o: ViewOpts = {}) {
    this.w = o.w ?? 64; this.h = o.h ?? 64;
    const cv = this.cv = document.createElement('canvas');
    cv.width = this.w; cv.height = this.h; cv.className = 'k7-model' + (o.cls ? ' ' + o.cls : '');
    const sc = o.scale ?? 2;
    cv.style.width = this.w * sc + 'px'; cv.style.height = this.h * sc + 'px'; cv.style.imageRendering = 'pixelated';
    this.c = cv.getContext('2d')!; this.c.imageSmoothingEnabled = false;
    this.yaw = o.yaw0 ?? 0.6;
    void Promise.resolve(build()).then((obj) => { if (!obj) return; this.root = obj.userData.fitR ? obj as THREE.Group : fitRoot(obj); this.dirty = true; this.cache.clear(); this.frame(0); });
    views.add(this);
    if (!viewTick) viewTick = onFrame((dt) => { for (const v of views) v.frame(dt); return views.size > 0 ? true : (viewTick = null, false); }) as unknown as () => void;
  }
  /** hover state: faster turn, a tilt toward the pointer */
  hot(on: boolean) { if (on === this.isHot) return; this.isHot = on; this.dirty = true; if (!on) { this.tx.target = 0; this.tz.target = 0; this.pointer = null; } }
  /** pointer position over the element (for the tilt), client px */
  point(x: number, y: number) { this.pointer = { x, y }; }
  /** pressed: squash flat, spring tall, settle */
  press(k = 1) { this.sq.kick(9 * k); this.dirty = true; }
  /** a spin kick (rad/s) */
  poke(v = 9) { this.vy += v; this.dirty = true; }
  setSpin(v: number) { this.o.spin = v; }
  invalidate() { this.cache.clear(); this.dirty = true; }
  /** the hardware state object of a kit hardware model (hardware.ts: root.userData.state), once it is built */
  state<T = Record<string, unknown>>(): T | null { return (this.root?.children[0]?.userData.state ?? this.root?.userData.state ?? null) as T | null; }
  dispose() { views.delete(this); this.cache.clear(); this.cv.remove(); }
  private frame(dt: number) {
    if (!this.root) return;
    // skip views that are not on the page (check their box twice a second)
    this.seenT -= dt;
    if (this.seenT <= 0) {
      this.seenT = 0.5;
      if (!this.cv.isConnected) { this.visible = false; if (!document.body.contains(this.cv)) { this.offT = (this.offT ?? 0) + 0.5; if (this.offT > 30) views.delete(this); } return; }
      this.offT = 0;
      const r = this.cv.getBoundingClientRect(); this.visible = r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    }
    if (!this.visible) return;
    this.t += dt;
    const o = this.o, spin = o.spin ?? 0.35, hs = o.hotSpin ?? 2.6;
    const y0 = this.yaw;
    if (this.isHot) this.yaw += dt * hs;
    else if (spin > 0) this.yaw += dt * spin;
    else { const goal = (o.yaw0 ?? 0.6) + Math.sin(this.t * 0.55) * (o.rock ?? 0.45), r = this.yaw; this.yaw = r + (goal - r) * Math.min(1, dt * 2); }
    this.yaw += this.vy * dt; this.vy *= Math.exp(-dt * 3.5);
    // the tilt toward the pointer
    if (this.isHot && o.tilt !== false && this.pointer) {
      const r = this.cv.getBoundingClientRect(), nx = ((this.pointer.x - r.left) / r.width - 0.5) * 2, ny = ((this.pointer.y - r.top) / r.height - 0.5) * 2;
      this.tz.target = -nx * 0.22; this.tx.target = ny * 0.18;
    }
    this.sq.step(dt); this.tx.step(dt); this.tz.step(dt);
    const animating = !this.sq.settled || !this.tx.settled || !this.tz.settled || Math.abs(this.vy) > 0.05 || this.isHot;
    const selfAnim = !!(this.root.children[0]?.userData?.update ?? this.root.userData.update);
    const fps = STATIC ? 0 : o.liveFps ?? (selfAnim ? 12 : 0);
    const live = animating || !!fps;
    if (fps && !animating) { this.liveAcc += dt; if (this.liveAcc < 1 / fps) return; this.liveAcc = 0; }
    const N = o.frames ?? 48;
    if (!live) {
      // idle: a cached frame per 1/N turn
      const f = ((Math.round((this.yaw / (Math.PI * 2)) * N) % N) + N) % N, key = 'f' + f;
      if (key === this.last && !this.dirty) return;
      this.last = key; this.dirty = false;
      const hit = this.cache.get(f);
      if (hit) { this.c.clearRect(0, 0, this.w, this.h); this.c.drawImage(hit, 0, 0); return; }
      this.draw((f / N) * Math.PI * 2, 0, 0, 0);
      const cc = document.createElement('canvas'); cc.width = this.w; cc.height = this.h; cc.getContext('2d')!.drawImage(this.cv, 0, 0); this.cache.set(f, cc);
      return;
    }
    if (y0 === this.yaw && !animating && !this.dirty && !fps) return;
    this.dirty = false; this.last = '';
    this.draw(this.yaw, this.sq.x * 0.05, this.tx.x, this.tz.x);
  }
  private offT = 0;
  private lastDraw = 0;
  private draw(yaw: number, squash: number, tiltX: number, tiltZ: number) {
    const o = this.o, root = this.root!;
    o.anim?.(root, this.t, this.isHot);
    // a provided model that animates itself
    const up = (root.children[0]?.userData?.update ?? root.userData.update) as ((dt: number, t: number) => void) | undefined;
    if (up) { const dt = Math.min(0.1, this.t - this.lastDraw); try { up(dt, this.t); } catch { /* its own business */ } }
    this.lastDraw = this.t;
    renderModel(root, this.c, this.w, this.h, { yaw, pitch: (o.pitch ?? 0.45) + tiltX, roll: tiltZ, squash, zoom: o.zoom, shadow: o.shadow, ink: o.ink, lift: o.lift });
  }
}

const snaps = new Map<string, HTMLCanvasElement>();
/** a cached still of a model (for map markers and small icons) */
export function snapshot(key: string, build: () => THREE.Object3D, w: number, h: number, o: ShotOpts = {}): HTMLCanvasElement | null {
  const hit = snaps.get(key); if (hit) return hit;
  if (!gl()) return null;
  const obj = build(), root = obj.userData.fitR ? obj : fitRoot(obj);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  renderModel(root, c, w, h, o);
  snaps.set(key, cv);
  return cv;
}
