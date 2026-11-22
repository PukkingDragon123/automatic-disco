// UI KIT · TRANSITIONS between modes and screens, painted as pixel art (one art pixel = 2 screen px, crisp, palette
// ramps) by a full-screen shader overlay:
//   IRIS      a camera diaphragm of eight brushed-steel blades (curved seams, ink edges, lit lips) that turns as it
//             closes on a point (the icon you clicked) and opens again
//   SHUTTER   two riveted blast plates with hazard-striped leading edges slam together (a thud and a shake), then part
//   DISSOLVE  an ordered pixel dissolve with a burning amber front
//   SWOOP     a camera swoop: speed streaks pour out of the point and the edges close in; with swoopCamera() the real
//             THREE camera flies (eased) while the streaks run
// API:
//   transition(kind, mid?, { x, y, ms, hold }) -> Promise     cover, run mid() (switch the mode), reveal
//   cover(kind, o) / reveal(kind, o) -> Promise                 the two halves by themselves
//   swoopCamera(camera, { pos, look, fov? }, ms?, { lines, ease, onUpdate }) -> Promise
//   holdTransition(kind, k, o)                                  freeze at coverage k (screenshots, tests)
import * as THREE from 'three';
import { tween, ease, screenShake, type Ease } from './juice';
import { uiSfx } from './sound';
import { RAMPS } from '../../art/palette';

export type TransitionKind = 'iris' | 'shutter' | 'dissolve' | 'swoop';
const KIND: Record<TransitionKind, number> = { iris: 0, shutter: 1, dissolve: 2, swoop: 3 };
const S = 2; // screen px per art px

const FRAG = /* glsl */`
precision highp float;
uniform vec2 uRes; uniform vec2 uC; uniform float uK; uniform float uT; uniform int uKind; uniform float uS;
uniform vec3 uSteel[7]; uniform vec3 uHaz; uniform vec3 uInk; uniform vec3 uAmb[5];
float h1(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float bay(vec2 p) {
  vec2 q = mod(p, 4.0); float x = q.x, y = q.y;
  float v = mod(x, 2.0) * 2.0 + mod(y, 2.0) * 3.0 - mod(x, 2.0) * mod(y, 2.0) * 4.0;
  float w = floor(x / 2.0) * 2.0 + floor(y / 2.0) * 3.0 - floor(x / 2.0) * floor(y / 2.0) * 4.0;
  return (v * 4.0 + w) / 16.0;
}
vec3 steel(float i) { int k = int(clamp(floor(i + 0.5), 0.0, 6.0)); vec3 c = uSteel[0]; for (int j = 0; j < 7; j++) if (j == k) c = uSteel[j]; return c; }
// brushed metal: long horizontal streaks of a step up or down
float brush(vec2 a, float seed) { float row = a.y; float len = 9.0 + floor(h1(vec2(row, seed)) * 14.0); float s = h1(vec2(floor(a.x / len), row + seed * 7.0)); return s > 0.84 ? 1.0 : s < 0.1 ? -1.0 : 0.0; }
void main() {
  vec2 a = floor(gl_FragCoord.xy / uS); a.y = uRes.y - 1.0 - a.y;
  vec4 col = vec4(0.0);
  if (uKind == 0) {
    // IRIS: eight blades round a turning octagonal aperture
    vec2 d = a - uC; float dist = length(d); float th = atan(d.y, d.x);
    float N = 8.0, seg = 6.2831853 / N, rot = uK * 2.4;
    float Rmax = length(uRes) * 1.05;
    float ap = Rmax * (1.0 - uK);
    float loc = mod(th - rot + seg * 0.5, seg) - seg * 0.5;
    float dp = dist * cos(loc);
    if (dp < ap) {
      // the scene through the aperture, darkened by the blades' shadow near the edge
      float sh = ap - dp;
      if (sh < 5.0 && bay(a) < (5.0 - sh) / 6.0) col = vec4(0.0, 0.0, 0.0, 0.55);
    } else {
      float out_ = dp - ap;
      float twist = 1.3 * clamp(out_ / (Rmax * 0.6), 0.0, 1.0);
      float u = (th - rot - twist) / seg;
      float id = floor(u), f = fract(u);
      float w = 1.1 / max(8.0, dist) / seg;
      float base = 2.2 + mod(id, 2.0) * 1.1 + (1.0 - f) * 1.8 - clamp(out_ / 260.0, 0.0, 1.0) * 0.9;
      base += brush(vec2(floor(a.x * 0.7 + a.y * 0.7), floor(a.y * 0.7 - a.x * 0.7) + id * 31.0), id) * 0.6;
      vec3 c = steel(base + (bay(a) - 0.5) * 0.7);
      if (f < w * 2.0) c = uInk;                 // the seam: ink
      else if (f < w * 3.2) c = uSteel[6];       // its lit lip
      else if (f > 1.0 - w * 1.5) c = uSteel[1]; // the shaded far edge
      if (out_ < 1.0) c = uInk;                  // the aperture edge
      else if (out_ < 2.0) c = uSteel[6];
      else if (out_ < 3.0) c = uSteel[5];
      // a rivet on each blade, out near the rim
      vec2 rv = uC + vec2(cos((id + 0.5) * seg + rot + twist), sin((id + 0.5) * seg + rot + twist)) * (ap + 26.0);
      float rd = length(a - rv);
      if (out_ > 18.0 && rd < 2.6) c = rd < 1.4 ? uSteel[6] : uSteel[1];
      col = vec4(c, 1.0);
    }
  } else if (uKind == 1) {
    // SHUTTER: two blast plates meeting at the middle
    float half_ = uRes.y * 0.5, e = uK;
    float top = half_ * e, bot = uRes.y - half_ * e;
    float ly = -1.0; bool isTop = false;
    if (a.y < top) { ly = top - 1.0 - a.y; isTop = true; }
    else if (a.y >= bot) { ly = a.y - bot; }
    if (ly >= 0.0) {
      float x = a.x;
      float v = 3.0 + brush(vec2(x, a.y), isTop ? 1.0 : 2.0) * 0.9 - clamp(ly / 260.0, 0.0, 1.0) * 1.2;
      vec3 c = steel(v + (bay(a) - 0.5) * 0.6);
      // the hazard band along the leading edge
      if (ly >= 3.0 && ly < 15.0) { float s = mod(x + ly * (isTop ? 1.0 : -1.0), 16.0); c = s < 8.0 ? uHaz : uInk; if (ly < 4.0 || ly > 13.0) c = uInk; if (h1(floor(a / 2.0)) > 0.93 && s < 8.0) c = uSteel[4]; }
      if (ly < 1.0) c = uInk; else if (ly < 2.0) c = uSteel[6]; else if (ly < 3.0) c = uSteel[5];
      // panel seams and a weld seam
      if (abs(mod(x, 160.0) - 80.0) < 0.5 && ly > 15.0) c = uInk;
      if (abs(mod(x, 160.0) - 81.0) < 0.5 && ly > 15.0) c = uSteel[5];
      if (abs(ly - 92.0) < 0.5) c = uInk; if (abs(ly - 93.0) < 0.5) c = uSteel[5];
      // rivet rows
      vec2 rp = vec2(mod(x, 24.0) - 12.0, ly - 24.0);
      if (length(rp) < 2.4) c = length(rp + vec2(0.7, 0.7)) < 1.2 ? uSteel[6] : uSteel[1];
      vec2 rp2 = vec2(mod(x + 12.0, 24.0) - 12.0, ly - 104.0);
      if (length(rp2) < 2.4) c = length(rp2 + vec2(0.7, 0.7)) < 1.2 ? uSteel[6] : uSteel[1];
      col = vec4(c, 1.0);
    } else {
      // the gap: the plates' shadows on the scene
      float g = min(a.y - top, bot - 1.0 - a.y);
      if (g < 6.0 && bay(a) < (6.0 - g) / 7.0) col = vec4(0.0, 0.0, 0.0, 0.6);
    }
  } else if (uKind == 2) {
    // DISSOLVE: a wave of pixel blocks spreading out from the point, a burning amber front
    float R = length(uRes) * 0.75;
    float v = clamp(length(a - uC) / R, 0.0, 1.0) * 0.72 + h1(floor(a / 4.0)) * 0.16 + bay(a) * 0.12;
    float k = uK * 1.04;
    if (v < k) {
      vec3 c = mix(vec3(0.035, 0.04, 0.05), vec3(0.075, 0.08, 0.1), h1(floor(a / 6.0)) * 0.7);
      float edge = k - v;
      if (edge < 0.025) c = uAmb[4]; else if (edge < 0.05) c = uAmb[2]; else if (edge < 0.07) c = uAmb[0];
      col = vec4(c, 1.0);
    }
  } else {
    // SWOOP: streaks out of the point, the edges closing in
    vec2 d = a - uC; float dist = length(d); float th = atan(d.y, d.x);
    float R = length(uRes) * 0.6;
    float edge = dist / R;
    float close_ = 1.0 - uK * 1.15 + (bay(a) - 0.5) * 0.12;
    if (edge > close_) {
      vec3 c = mix(vec3(0.03, 0.035, 0.04), vec3(0.06, 0.065, 0.08), h1(floor(a / 3.0)));
      if (edge < close_ + 0.012) c = uSteel[4];
      col = vec4(c, 1.0);
    } else {
      float b = floor((th + 3.14159) * 90.0);
      float r1 = h1(vec2(b, 3.0));
      if (r1 > 0.35) {
        float sp = 300.0 + r1 * 520.0, len = 40.0 + h1(vec2(b, 5.0)) * 120.0;
        float p0 = mod(uT * sp + h1(vec2(b, 7.0)) * R, R);
        if (dist > p0 && dist < p0 + len * uK && dist > 30.0) {
          float k2 = uK * clamp((dist - 30.0) / 120.0, 0.0, 1.0);
          if (bay(a) < k2 * 1.4) col = vec4(mix(uSteel[6], vec3(1.0, 0.95, 0.85), 0.6), 0.95);
        }
      }
    }
  }
  gl_FragColor = col;
}`;

let R: THREE.WebGLRenderer | null = null, mat: THREE.ShaderMaterial | null = null, scene: THREE.Scene | null = null;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
let cv: HTMLCanvasElement | null = null, busy = 0, startT = performance.now();
const v3 = (c: number) => new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
function layer() {
  if (R && cv?.isConnected) return R;
  cv = document.createElement('canvas');
  cv.className = 'k7-tr';
  cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:9500;pointer-events:none;display:none;image-rendering:pixelated';
  document.body.append(cv);
  try {
    R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, premultipliedAlpha: false });
    R.setPixelRatio(1); R.outputColorSpace = THREE.LinearSRGBColorSpace;
    mat = new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) }, uC: { value: new THREE.Vector2() }, uK: { value: 0 }, uT: { value: 0 }, uKind: { value: 0 }, uS: { value: S },
        uSteel: { value: RAMPS.steel.map(v3) }, uHaz: { value: v3(RAMPS.ochre[5]) }, uInk: { value: v3(0x08090c) }, uAmb: { value: RAMPS.glowAmber.map(v3) },
      },
    });
    scene = new THREE.Scene();
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; scene.add(q);
  } catch (e) { console.warn('transitions: no WebGL', e); R = null; }
  return R;
}
function draw(kind: TransitionKind, k: number, x: number, y: number) {
  const r = layer(); if (!r || !mat || !scene || !cv) return;
  const W = innerWidth, H = innerHeight;
  if (cv.width !== W || cv.height !== H) r.setSize(W, H, false);
  const u = mat.uniforms;
  u.uRes.value.set(Math.ceil(W / S), Math.ceil(H / S)); u.uC.value.set(Math.round(x / S), Math.round(y / S));
  u.uK.value = k; u.uKind.value = KIND[kind]; u.uT.value = (performance.now() - startT) / 1000;
  cv.style.display = k > 0.0005 ? 'block' : 'none';
  r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam);
}
export interface TrOpts { x?: number; y?: number; ms?: number; sound?: boolean; e?: Ease }
const centre = (o: TrOpts) => [o.x ?? innerWidth / 2, o.y ?? innerHeight / 2] as const;
/** close the transition over the screen (resolves fully covered) */
export function cover(kind: TransitionKind, o: TrOpts = {}): Promise<void> {
  const [x, y] = centre(o);
  busy++; if (cv) cv.style.pointerEvents = 'auto';
  if (o.sound !== false) {
    if (kind === 'iris') { uiSfx('shutter', 0.6, 0.9); uiSfx('swishOut', 0.5); }
    else if (kind === 'shutter') uiSfx('creak', 0.5, 1.3);
    else if (kind === 'swoop') uiSfx('swishIn', 0.7, 0.85);
    else uiSfx('glitch', 0.35);
  }
  const ms = o.ms ?? (kind === 'shutter' ? 420 : kind === 'dissolve' ? 380 : 360);
  const e = o.e ?? (kind === 'shutter' ? ease.outBounce : kind === 'iris' ? ease.inOutCubic : ease.inCubic);
  let slammed = false;
  return tween(ms, (k, raw) => {
    draw(kind, k, x, y);
    if (kind === 'shutter' && !slammed && raw > 0.36) { slammed = true; if (o.sound !== false) { uiSfx('slam', 0.8); uiSfx('thudHeavy', 0.5, 0.7); } screenShake(5, 260); }
  }, e).then(() => { if (cv) { cv.style.display = 'block'; cv.style.pointerEvents = 'auto'; } draw(kind, 1, x, y); });
}
/** open the transition again (resolves fully revealed) */
export function reveal(kind: TransitionKind, o: TrOpts = {}): Promise<void> {
  const [x, y] = centre(o);
  if (o.sound !== false) { if (kind === 'iris') uiSfx('swishIn', 0.45, 1.1); else if (kind === 'shutter') uiSfx('metalClose', 0.5, 0.8); else if (kind === 'swoop') uiSfx('swishOut', 0.4, 1.2); }
  const ms = o.ms ?? (kind === 'shutter' ? 360 : 340);
  const e = o.e ?? (kind === 'iris' ? ease.inOutCubic : ease.inCubic);
  return tween(ms, (k) => draw(kind, 1 - k, x, y), e).then(() => {
    draw(kind, 0, x, y);
    busy = Math.max(0, busy - 1);
    if (cv && !busy) { cv.style.display = 'none'; cv.style.pointerEvents = 'none'; }
  });
}
/** cover, switch (mid may be async), reveal */
export async function transition(kind: TransitionKind, mid?: () => void | Promise<void>, o: TrOpts & { hold?: number } = {}) {
  await cover(kind, o);
  try { await mid?.(); } catch (e) { console.error('transition mid', e); }
  if (o.hold) await new Promise((r) => setTimeout(r, o.hold));
  await reveal(kind, o);
}
/** freeze a transition at coverage k (for screenshots and tests); k <= 0 hides it */
export function holdTransition(kind: TransitionKind, k: number, o: TrOpts = {}) { const [x, y] = centre(o); draw(kind, Math.max(0, Math.min(1, k)), x, y); }

/**
 * the camera swoop: fly a THREE camera to a new position and look-at point on an eased curve (it arcs up a little
 * on the way), with the speed streaks running while it moves (lines: false for none)
 */
export function swoopCamera(camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, to: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }, ms = 900, o: { lines?: boolean; ease?: Ease; from?: { look: THREE.Vector3 }; onUpdate?: (k: number) => void; arc?: number } = {}): Promise<void> {
  const p0 = camera.position.clone(), dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const l0 = o.from?.look.clone() ?? p0.clone().add(dir.multiplyScalar(10));
  const f0 = (camera as THREE.PerspectiveCamera).fov, arc = o.arc ?? p0.distanceTo(to.pos) * 0.15;
  const look = new THREE.Vector3();
  if (o.lines !== false) uiSfx('swishIn', 0.55, 0.8);
  return tween(ms, (k) => {
    camera.position.lerpVectors(p0, to.pos, k); camera.position.y += Math.sin(k * Math.PI) * arc;
    look.lerpVectors(l0, to.look, k); camera.lookAt(look);
    if (to.fov && f0 !== undefined) { (camera as THREE.PerspectiveCamera).fov = f0 + (to.fov - f0) * k; (camera as THREE.PerspectiveCamera).updateProjectionMatrix(); }
    if (o.lines !== false) draw('swoop', Math.sin(k * Math.PI) * 0.55, innerWidth / 2, innerHeight / 2);
    o.onUpdate?.(k);
  }, o.ease ?? ease.inOutCubic).then(() => { if (o.lines !== false) draw('swoop', 0, 0, 0); if (cv) cv.style.display = 'none'; });
}
