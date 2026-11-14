// The controllable descent: Unit 07's drop pod falls from the entry interface to the ground of the chosen region,
// and the player flies it. A small RCS thruster drifts the pod inside its descent cone (WASD / arrows / the touch
// stick, a burst on Space or the BURST button) while cinematic cameras cut in and blend back out: the plasma sheath
// glowing white-orange round the heat shield with streaks tearing past and the buffet shaking everything, the radio
// blackout, the fireball seen from the ground, punching through the weather decks, the region itself rushing up
// (the real Region heightfield the game will play on, its woods, rocks, rivers and seams, set in a stylised
// landscape that curves away to the horizon), the red smoke of the drop zone, the chute blooming, the retro flare
// and the impact: a dust shockwave and a white flash. Accuracy is scored against the pin set on the plotting table.
// World frame: region cell (rx, rz) sits at (rx - N/2, height, rz - N/2), metres.
import * as THREE from 'three';
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import type { Post } from '../gfx/post';
import { resetGrade } from '../gfx/post';
import type { Region } from '../world/region';
import type { Palette } from '../world/palette';
import { gbuf } from '../gfx/gbuf';
import { Fx } from './fx';
import type { CineUI } from '../ui/cineUI';
import { csfx, cloop, cvoice, type Loop } from '../ui/cineAudio';
import { sfx } from '../audio/audio';
import { settings } from '../settings';
import { isTouchDevice } from '../ui/touch';
import { Bin, lit, mesh, fxMat, rawMat, V3, TAU, sm, ease, hash, type V } from '../ui/deployKit';
import { makePod, portholeWorld, type Pod } from '../ui/deployPod';
import { clamp, damp, lerp } from '../core/rand';

export type Grade = 'BULLSEYE' | 'ON TARGET' | 'CLOSE' | 'WIDE' | 'AUTOPILOT';
/** what a landing earns (applied to the run by the deployment): within 6 m a core cell and ore, close in some ore */
export function bonusFor(g: Grade): { cells: number; res: Partial<Record<'ore' | 'carbon' | 'water' | 'soil', number>>; text: string } {
  if (g === 'BULLSEYE') return { cells: 1, res: { ore: 15, carbon: 10 }, text: '+1 CORE CELL · +15 ORE · +10 CARBON' };
  if (g === 'ON TARGET') return { cells: 0, res: { ore: 12, soil: 8 }, text: '+12 ORE · +8 SOIL' };
  if (g === 'CLOSE' || g === 'AUTOPILOT') return { cells: 0, res: { ore: 6 }, text: '+6 ORE' };
  return { cells: 0, res: {}, text: 'NO DROP BONUS' };
}
export interface DescentResult { x: number; z: number; dist: number; grade: Grade; auto: boolean; water: boolean }
export interface DescentOpts {
  engine: Engine; input: Input; region: Region; pal: Palette; regionName: string; planetName: string;
  /** the drop zone (region coordinates) */
  lz: { x: number; z: number };
  first: boolean; ui: CineUI;
  onDone(r: DescentResult): void;
  /** QA: freeze time when a named moment comes (entry, porthole, ground-up, cloud, low, chute, flare, impact) */
  hold?: string | null;
}

const RP = 60000; // the curvature of the stylised world (m)
const CHUTE_ALT = 115, RETRO_ALT = 7;
/** descent rate by altitude (m/s), before the chute */
const VTAB: [number, number][] = [[3000, 135], [1200, 122], [900, 86], [400, 56], [150, 42], [0, 40]];
function vAt(alt: number) { for (let i = 0; i < VTAB.length - 1; i++) { const [a0, v0] = VTAB[i], [a1, v1] = VTAB[i + 1]; if (alt >= a1) return lerp(v1, v0, (alt - a1) / (a0 - a1)); } return VTAB[VTAB.length - 1][1]; }
/** seconds to the ground from alt (free fall, chute and flare included, roughly) */
function tToGround(alt: number) {
  let t = 0, a = alt;
  while (a > CHUTE_ALT) { const v = vAt(a); const step = Math.min(50, a - CHUTE_ALT); t += step / v; a -= step; }
  return t + a / 11;
}

// ------------------------------------------------------------------ shaders
const SKY_V = `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_F = `uniform vec3 uSun, uZen, uHor, uSpace, uSunCol; uniform float uAlt, uWhite, uDip;
varying vec3 vD;
float hs(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vD);
  float h = d.y + uDip;
  float hc = clamp(h, 0.0, 1.0);
  vec3 low = mix(uZen, uHor, pow(1.0 - hc, 5.0));
  vec3 high = mix(uSpace, uHor * 1.1, pow(1.0 - hc, 40.0)) + uHor * 0.25 * pow(1.0 - hc, 9.0);
  vec3 col = mix(low, high, uAlt);
  if (h < 0.0) col = mix(uHor * 0.85, uHor * 0.55, clamp(-h * 3.0, 0.0, 1.0));
  float s = max(dot(d, uSun), 0.0);
  col += uSunCol * (pow(s, 1400.0) * 9.0 + pow(s, 60.0) * 0.35 + pow(s, 7.0) * 0.08 * (1.0 - uAlt * 0.6));
  if (uAlt > 0.05 && h > 0.0) { float st = step(0.9982, hs(floor(d * 380.0))); col += vec3(0.85, 0.85, 0.8) * st * uAlt * clamp(h * 5.0, 0.0, 1.0); }
  col = floor(col * 48.0) / 48.0;
  col = mix(col, vec3(0.82, 0.84, 0.86), uWhite);
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(0.0);
}`;
const CLOUD_V = `varying vec2 vW; varying float vY; uniform vec3 uCam; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`;
const CLOUD_F = `uniform float uT, uCover, uSlice, uShade, uFadeNear; uniform vec3 uLit, uDark, uCam; uniform vec2 uWind;
varying vec2 vW; varying float vY;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }
void main(){
  vec2 p = (vW + uWind * uT) * 0.0021;
  float n = fbm(p) * 0.75 + fbm(p * 3.1 + 7.0) * 0.25;
  // each slice is a level set of the same field: the cloud is thickest in the middle slices
  float th = mix(0.62, 0.42, uCover) + abs(uSlice) * 0.07;
  float a = smoothstep(th, th + 0.08, n);
  float far = length(vW - uCam.xz);
  a *= 1.0 - smoothstep(9000.0, 16000.0, far);
  // never a hard sheet across the lens: fade a slice the camera is about to cross
  a *= mix(1.0, smoothstep(2.0, 22.0, abs(vY - uCam.y)), uFadeNear);
  a = floor(a * 5.0) / 5.0 * 0.9;
  vec3 c = mix(uDark, uLit, clamp(0.5 + uShade + (n - th) * 2.5, 0.0, 1.0));
  gl_FragColor = vec4(c * a, a);
  gNormal = vec4(0.0);
}`;
const PL_V = `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
/** the plasma sheath: white-hot at the shield, orange, then torn red streamers flowing up off the rim */
const PLASMA_F = `uniform float uT, uK, uWake; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float v = uWake > 0.5 ? vUv.y : 1.0 - vUv.y;
  float flow = vn(vec2(vUv.x * 18.0, v * 6.0 - uT * 14.0)) * 0.6 + vn(vec2(vUv.x * 41.0, v * 13.0 - uT * 23.0)) * 0.4;
  float rim = abs(dot(normalize(vN), normalize(vV)));
  float body = uWake > 0.5 ? pow(1.0 - v, 1.4) * smoothstep(0.25, 0.75, flow) * (0.4 + 0.6 * (1.0 - rim)) : pow(1.0 - rim, 1.2) * (0.6 + 0.6 * flow);
  float a = body * uK;
  vec3 hot = vec3(2.2, 1.7, 1.2), mid = vec3(1.7, 0.62, 0.12), cool = vec3(0.7, 0.12, 0.04);
  float heat = uWake > 0.5 ? (1.0 - v) * (0.6 + flow * 0.5) : 0.7 + rim * 0.3;
  vec3 c = heat > 0.66 ? mix(mid, hot, (heat - 0.66) * 3.0) : mix(cool, mid, heat * 1.5);
  a = floor(a * 6.0) / 6.0;
  gl_FragColor = vec4(c * a, 0.0);
  gNormal = vec4(0.0);
}`;
/** a coloured smoke column: rising puffs, thinning and spreading with height */
const SMOKE_F = `uniform float uT; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float y = vUv.y;
  float n = vn(vec2(vUv.x * 9.0, y * 22.0 - uT * 1.6)) * 0.65 + vn(vec2(vUv.x * 23.0, y * 51.0 - uT * 3.1)) * 0.35;
  float rim = abs(dot(normalize(vN), normalize(vV)));
  float a = smoothstep(0.3, 0.7, n) * pow(rim, 0.8) * (1.0 - y) * (0.35 + 0.65 * smoothstep(0.0, 0.05, y));
  a = floor(a * 5.0) / 5.0 * 0.85;
  vec3 c = uCol * (0.75 + 0.35 * n);
  gl_FragColor = vec4(c * a, a);
  gNormal = vec4(0.0);
}`;
/** the impact shockwave: a ring of dust racing outward, thick at its front */
const SHOCK_F = `uniform float uK, uT; uniform vec3 uCol; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float r = vUv.y;
  float a = smoothstep(0.0, 0.7, r) * (1.0 - smoothstep(0.85, 1.0, r)) * uK;
  a *= 0.7 + 0.3 * h2(floor(vUv * vec2(64.0, 8.0)));
  a = floor(a * 5.0) / 5.0;
  gl_FragColor = vec4(uCol * a, a);
  gNormal = vec4(0.0);
}`;

// ------------------------------------------------------------------ HUD
const CSS = /* css */`
.dsc { position: fixed; inset: 0; z-index: 41; pointer-events: none; font-family: 'VT', monospace; --u: calc(1px * var(--s, 2)); color: #d9d2bf; }
.dsc .bar { position: absolute; left: 0; right: 0; height: 11.5vh; display: flex; align-items: center; gap: calc(10 * var(--u)); padding: 0 calc(12 * var(--u)); box-sizing: border-box; opacity: var(--hud, 1); transition: opacity 300ms; }
.dsc .bar.b { bottom: 0; } .dsc .bar.t { top: 0; justify-content: space-between; }
.dsc .blk { display: flex; flex-direction: column; justify-content: center; }
.dsc .lbl { font-size: var(--cf-vt1, 14px); line-height: 1; color: #8d8f8a; letter-spacing: 1px; }
.dsc .num { font-size: var(--cf-vt2, 28px); line-height: 1; color: #ffb060; text-shadow: 0 0 calc(3 * var(--u)) rgba(255, 120, 30, 0.55); letter-spacing: 1px; }
.dsc .num.dim { color: #c8c2b0; text-shadow: none; }
.dsc .gauge { width: calc(60 * var(--u)); height: calc(5 * var(--u)); border: 1px solid #5f6261; background: #16181a; position: relative; margin-top: calc(2 * var(--u)); }
.dsc .gauge i { position: absolute; left: 0; top: 0; bottom: 0; background: repeating-linear-gradient(90deg, #7fb88a 0 calc(4 * var(--u)), transparent calc(4 * var(--u)) calc(5 * var(--u))); }
.dsc .gauge.low i { background: repeating-linear-gradient(90deg, #d9a43a 0 calc(4 * var(--u)), transparent calc(4 * var(--u)) calc(5 * var(--u))); }
.dsc .lamps { display: flex; gap: calc(3 * var(--u)); margin-top: calc(2 * var(--u)); }
.dsc .lamps i { width: calc(6 * var(--u)); height: calc(6 * var(--u)); border-radius: 50%; background: #2a1a12; box-shadow: inset 0 0 0 1px #4b4e50; }
.dsc .lamps i.on { background: #ff9a40; box-shadow: 0 0 calc(4 * var(--u)) rgba(255, 140, 40, 0.8), inset 0 0 0 1px #ffd8a0; }
.dsc .wind { width: calc(14 * var(--u)); height: calc(14 * var(--u)); border: 1px solid #5f6261; border-radius: 50%; position: relative; margin-top: calc(1 * var(--u)); }
.dsc .wind i { position: absolute; left: 50%; top: 50%; width: calc(12 * var(--u)); height: 2px; background: #c8c2b0; transform-origin: 0 50%; }
.dsc .wind i::after { content: ''; position: absolute; right: -2px; top: -3px; border: 4px solid transparent; border-left: 6px solid #c8c2b0; }
.dsc .sp { flex: 1; }
.dsc .t .lbl { color: #9fb4c2; }
.dsc .mk { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); text-align: center; }
.dsc .mk .d { width: calc(14 * var(--u)); height: calc(14 * var(--u)); border: 2px solid #e05a3a; transform: rotate(45deg); margin: 0 auto; box-shadow: 0 0 calc(3 * var(--u)) rgba(255, 90, 50, 0.6); }
.dsc .mk .m { font-size: var(--cf-vt1, 14px); color: #f0d8c0; text-shadow: 1px 1px 0 #000; margin-top: calc(3 * var(--u)); white-space: nowrap; }
.dsc .mk.edge .d { border-color: #d9a43a; }
.dsc .pip { position: absolute; left: 0; top: 0; width: calc(16 * var(--u)); height: calc(16 * var(--u)); transform: translate(-50%, -50%); }
.dsc .pip::before, .dsc .pip::after { content: ''; position: absolute; background: #7fd48a; box-shadow: 0 0 calc(2 * var(--u)) rgba(127, 212, 138, 0.6); }
.dsc .pip::before { left: 50%; top: 0; bottom: 0; width: 2px; margin-left: -1px; } .dsc .pip::after { top: 50%; left: 0; right: 0; height: 2px; margin-top: -1px; }
.dsc .pip.hit::before, .dsc .pip.hit::after { background: #ffe0a0; }
.dsc .hint { position: absolute; left: 50%; bottom: calc(11.5vh + 7vh); transform: translateX(-50%); font-size: var(--cf-vt1, 14px); letter-spacing: 1px; color: rgba(232, 238, 240, 0.85); text-shadow: 1px 1px 0 #000; transition: opacity 600ms; white-space: nowrap; }
.dsc .hint b { color: #ffb060; font-weight: normal; }
.dsc .warn { position: absolute; left: 50%; top: calc(11.5vh + 3vh); transform: translateX(-50%); font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 10px); letter-spacing: 3px; color: #ffb060; opacity: 0; text-shadow: 0 0 calc(3 * var(--u)) rgba(255, 120, 30, 0.6); }
.dsc .warn.on { opacity: 1; animation: dsc-blink 0.6s steps(2) infinite; }
@keyframes dsc-blink { 50% { opacity: 0.35; } }
.dsc.black .num, .dsc.black .lbl { animation: dsc-garble 0.18s steps(2) infinite; }
@keyframes dsc-garble { 50% { opacity: 0.25; transform: translateX(1px); } }
.dsc .stick { position: absolute; left: 0; top: 0; bottom: 0; width: 45%; pointer-events: auto; touch-action: none; }
.dsc .burst { position: absolute; right: calc(16 * var(--u)); bottom: calc(11.5vh + 6 * var(--u)); width: calc(44 * var(--u)); height: calc(44 * var(--u)); border-radius: 50%; pointer-events: auto; touch-action: none;
  background: radial-gradient(circle at 40% 35%, #a2463a, #72241d 60%, #34100d); box-shadow: 0 0 0 calc(3 * var(--u)) #3a3d40, 0 0 0 calc(4 * var(--u)) #16181a; font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 10px); color: #ecd9c0; display: flex; align-items: center; justify-content: center; letter-spacing: 1px; }
.dsc .knob { position: absolute; width: calc(26 * var(--u)); height: calc(26 * var(--u)); border-radius: 50%; transform: translate(-50%, -50%); background: radial-gradient(circle at 40% 35%, #5f6261, #2b2e31); box-shadow: 0 0 0 calc(18 * var(--u)) rgba(43, 46, 49, 0.35); display: none; }
`;
let styled = false;
function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.id = 'descent-css'; s.textContent = CSS; document.head.appendChild(s); }
const div = (cls: string, parent: HTMLElement, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };

// ------------------------------------------------------------------ the descent
interface Shot { name: string; t: number; dur: number; pose(t: number, pos: V, look: V): number }
const _v = new V3(), _v2 = new V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Descent {
  readonly scene = new THREE.Scene();
  readonly fxScene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(56, 1, 0.3, 60000);
  private bin = new Bin();
  private fx: Fx;
  private pod: Pod;
  private R: Region; private N: number;
  private sky: THREE.Mesh; private skyU: Record<string, THREE.IUniform>;
  private sun: THREE.DirectionalLight; private hemi: THREE.HemisphereLight; private heatLight: THREE.PointLight;
  private clouds: { y: number; cover: number; slices: THREE.Mesh[]; u: Record<string, THREE.IUniform>[] }[] = [];
  private plasma: THREE.Mesh[] = []; private plasmaU: Record<string, THREE.IUniform>[] = [];
  private streaks: THREE.LineSegments; private streakP: Float32Array; private streakC: Float32Array; private streakSeed: Float32Array;
  private smokeU: Record<string, THREE.IUniform>; private smoke: THREE.Mesh;
  private shock: THREE.Mesh | null = null; private shockU: Record<string, THREE.IUniform> | null = null;
  private scorch: THREE.Mesh;
  private strobe: THREE.Mesh;
  // state
  private alt: number; private alt0: number;
  private p = new THREE.Vector2(); private v = new THREE.Vector2(); private wind = new THREE.Vector2();
  private vy = 120; private t = 0;
  private F = new THREE.Vector2(0, -1); private Rt = new THREE.Vector2(1, 0);
  private lzW = new V3(); private lz: { x: number; z: number };
  private fuel = 1; private bursts = 3; private burstCD = 0; private thrusting = 0;
  private chute = 0; private chuteT = -1; private retro = 0; private landed = false; private landT = 0; private auto = false;
  private ff = 1;
  private spin = 0; private sway = new THREE.Vector2(); private swayV = new THREE.Vector2(); private lean = new THREE.Vector2();
  private shakeK = 0; private kick = 0;
  private stick = new THREE.Vector2(); private stickId: number | null = null; private stickO = new THREE.Vector2();
  private shots: Shot[] = []; private shot: Shot | null = null; private blendT = 1; private blendFrom = { pos: new V3(), q: new THREE.Quaternion(), fov: 56 };
  private chase = { pos: new V3(), look: new V3(), init: false };
  private said = new Set<string>();
  private loops: Loop[] = []; private wind$: Loop | null = null; private fire$: Loop | null = null; private static$: Loop | null = null;
  private blackout = false;
  private result: DescentResult | null = null;
  // HUD
  private hud: HTMLDivElement; private el: Record<string, HTMLElement> = {};
  private off: (() => void)[] = [];
  private touch = isTouchDevice();

  constructor(readonly o: DescentOpts) {
    style();
    const R = (this.R = o.region), N = (this.N = R.N), bin = this.bin, pal = o.pal;
    this.lz = { ...o.lz };
    this.lzW.set(o.lz.x - N / 2, R.groundSmooth(o.lz.x, o.lz.z), o.lz.z - N / 2);
    this.alt0 = this.alt = o.first ? 2600 : 1800;
    this.scene.background = new THREE.Color(0x05070a);
    this.fx = new Fx(this.fxScene, this.scene);
    // ---- sky
    this.skyU = {
      uSun: { value: new V3(-0.45, 0.42, -0.78).normalize() }, uZen: { value: new THREE.Color(pal.sky).lerp(new THREE.Color(0x44607a), 0.35) },
      uHor: { value: new THREE.Color(pal.horizon).lerp(new THREE.Color(0xc8d0d4), 0.25) }, uSpace: { value: new THREE.Color(0x03050a) },
      uSunCol: { value: new THREE.Color(pal.sun).lerp(new THREE.Color(0xfff0d8), 0.5) }, uAlt: { value: 1 }, uWhite: { value: 0 }, uDip: { value: 0 },
    };
    this.sky = mesh(bin, new THREE.SphereGeometry(30000, 32, 16), rawMat(bin, SKY_V, SKY_F, this.skyU, { side: THREE.BackSide, depthWrite: false }), this.scene, 0, 0, 0, false);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    // ---- light
    const sd = this.skyU.uSun.value as V;
    this.sun = new THREE.DirectionalLight(new THREE.Color(pal.sun).lerp(new THREE.Color(0xfff2dc), 0.5), 3.0);
    this.sun.position.copy(sd).multiplyScalar(200);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -30; sc.right = sc.top = 30; sc.near = 1; sc.far = 600; this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(new THREE.Color(pal.sky).lerp(new THREE.Color(0xb8c8d8), 0.5), new THREE.Color(pal.groundLight ?? 0x4a4030), 1.1);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.Fog(new THREE.Color(pal.horizon), 400, 16000);
    // ---- the ground: far landscape, the region itself, water, woods, rocks
    this.buildFar(); this.buildRegion(); this.buildWater();
    // ---- clouds: two weather decks, thicker over wet biomes
    const moist = R.biome.moist, cover = clamp(0.3 + moist * 0.45, 0.25, 0.85);
    for (const [y, cv] of [[820, cover], [470, cover * 0.75]] as [number, number][]) this.buildCloud(y, cv);
    // ---- the drop zone: painted rings on the ground, red smoke, a strobe
    this.buildLZ();
    // ---- the pod, plasma, chute, streaks
    this.pod = makePod(bin);
    this.scene.add(this.pod.root);
    this.pod.setHatch(0); this.pod.addChute(); this.pod.setChute(0, 0);
    this.heatLight = new THREE.PointLight(0xff7a30, 0, 30, 1.6); this.heatLight.position.set(0, -1.2, 0); this.pod.root.add(this.heatLight);
    for (const wake of [0, 1]) {
      const u = { uT: { value: 0 }, uK: { value: 0 }, uWake: { value: wake } };
      const g = wake ? new THREE.CylinderGeometry(4.8, 1.25, 22, 24, 1, true) : new THREE.SphereGeometry(1.75, 24, 8, 0, TAU, Math.PI * 0.5, Math.PI * 0.5);
      const m = mesh(bin, g, fxMat(bin, PL_V, PLASMA_F, u, 'add', { side: THREE.DoubleSide }), this.pod.root, 0, wake ? 11.2 : 0.05, 0, false);
      if (!wake) m.scale.set(1, 0.6, 1);
      this.plasma.push(m); this.plasmaU.push(u);
    }
    const NS = 180;
    this.streakP = new Float32Array(NS * 6); this.streakC = new Float32Array(NS * 6); this.streakSeed = new Float32Array(NS * 3);
    for (let i = 0; i < NS; i++) { this.streakSeed[i * 3] = Math.random() * TAU; this.streakSeed[i * 3 + 1] = 3 + Math.random() * 26; this.streakSeed[i * 3 + 2] = Math.random() * 80 - 40; }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.streakP, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(this.streakC, 3).setUsage(THREE.DynamicDrawUsage));
    const sm2 = bin.m(gbuf(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0));
    this.streaks = new THREE.LineSegments(bin.g(sg), sm2); this.streaks.frustumCulled = false; this.scene.add(this.streaks);
    // ---- the wind: a steady drift and the start offset (upwind of the pin, so it can be flown down)
    const rs = hash(o.lz.x, o.lz.z, R.seed % 97);
    const wa = rs * TAU, ws = (R.biome.key === 'coast' || R.biome.key === 'highland' || R.biome.key === 'tundra' ? 6 : 4) + rs * 2;
    this.wind.set(Math.cos(wa), Math.sin(wa)).multiplyScalar(ws);
    const startD = o.first ? 330 : 260, sa = wa + Math.PI + (hash(R.seed, 3) - 0.5) * 1.6;
    this.p.set(this.lzW.x + Math.cos(sa) * startD, this.lzW.z + Math.sin(sa) * startD);
    // the camera faces from the start toward the pin: forward on the stick flies toward it
    this.F.set(this.lzW.x - this.p.x, this.lzW.z - this.p.y).normalize();
    this.Rt.set(-this.F.y, this.F.x);
    this.vy = vAt(this.alt);
    // ---- cinematic cuts, by altitude
    this.planShots();
    // ---- HUD and input
    this.hud = div('dsc', document.body) as HTMLDivElement;
    this.buildHud();
    this.bindInput();
    o.ui.letterbox(true, 0.6);
    o.ui.stamp(`ENTRY INTERFACE · ${o.planetName.toUpperCase()} · ${o.regionName.toUpperCase()}`, true);
    this.wind$ = cloop('drone', 0.5); this.fire$ = cloop('fire', 0.0); this.loops.push(this.wind$, this.fire$);
    csfx('whoosh', 1, 0.6); csfx('boom', 0.6, 0.7);
    this.say(o.first ? 'Unit Seven, clean separation. You are on your own now. Steer for the red smoke.' : 'Separation, Seven. Steer for the smoke.', 'Launch Control', 0.85);
  }

  // ================================================================ build
  private gH(x: number, z: number) { return this.R.groundSmooth(x + this.N / 2, z + this.N / 2); }
  private buildFar() {
    const R = this.R, N = this.N, pal = this.o.pal, bin = this.bin;
    const n = R.noise, G = 132, ext = 22000;
    const coord = (i: number) => { const u = (i / (G - 1)) * 2 - 1, a = Math.abs(u); return Math.sign(u) * (a < 0.08 ? (a / 0.08) * 70 : 70 + Math.pow((a - 0.08) / 0.92, 2.15) * (ext - 70)); };
    const pos = new Float32Array(G * G * 3), col = new Float32Array(G * G * 3);
    const bk = R.biome.key;
    const cA = new THREE.Color(bk === 'desert' ? pal.sand : bk === 'tundra' ? pal.snow : bk === 'ashland' ? pal.basalt : bk === 'savanna' ? pal.grassDry : bk === 'marsh' ? pal.mud : pal.grass);
    const cB = new THREE.Color(bk === 'desert' ? pal.clay : bk === 'tundra' ? pal.rock : bk === 'ashland' ? pal.rock : (pal.foliage[0] ?? pal.grass)).multiplyScalar(bk === 'jungle' ? 0.7 : 0.85);
    const cR = new THREE.Color(pal.rock), cS = new THREE.Color(pal.sand), cN = new THREE.Color(pal.snow);
    const amp = 6 + R.biome.rough * 60, c = new THREE.Color();
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const x = coord(i), z = coord(j), k = (j * G + i) * 3;
      const dIn = Math.max(Math.abs(x), Math.abs(z)) - N / 2;
      let y: number;
      const big = n.fbm2(x * 0.00045 + 31, z * 0.00045 - 7, 4), mid = n.fbm2(x * 0.004, z * 0.004, 3);
      const hFar = 4.2 + big * amp * 1.4 + mid * amp * 0.25 + Math.max(0, n.ridge2(x * 0.0008, z * 0.0008, 3) - 0.4) * amp * 2 * R.biome.rough;
      if (dIn < 0) y = this.gH(clamp(x, -N / 2 + 1, N / 2 - 1), clamp(z, -N / 2 + 1, N / 2 - 1)) - 2.5;
      else { const edge = this.gH(clamp(x, -N / 2 + 0.5, N / 2 - 0.5), clamp(z, -N / 2 + 0.5, N / 2 - 0.5)); y = lerp(edge - 0.3, hFar, sm(0, 220, dIn)); }
      const d2 = x * x + z * z; y -= d2 / (2 * RP);
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      // colour: ground, woods, rock on the heights, sand at the shore, snow up high
      const h = y + d2 / (2 * RP);
      const f = n.fbm2(x * 0.0021 + 50, z * 0.0021, 3);
      c.copy(cA).lerp(cB, clamp((f + 0.1) * 2.2 * (bk === 'desert' ? 0.4 : 1), 0, 1));
      if (h < 5.2) c.lerp(cS, clamp((5.2 - h) / 1.4, 0, 1) * 0.8);
      if (h > 22) c.lerp(cR, clamp((h - 22) / 30, 0, 0.8));
      if (h > 60 && bk !== 'desert') c.lerp(cN, clamp((h - 60) / 40, 0, 0.9));
      c.multiplyScalar(0.92 + hash(i, j, 3) * 0.12);
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    const idx: number[] = [];
    for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) { const a = j * G + i, b = a + 1, cc = a + G, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = mesh(bin, g, lit(bin, 0xffffff, { vertexColors: true, flat: true, flag: 0 }), this.scene, 0, 0, 0, false);
    m.receiveShadow = true; m.frustumCulled = false;
  }
  private blockColor(b: number, x: number, z: number, out: THREE.Color) {
    const p = this.o.pal;
    const tbl = [p.grass, p.grassDry, p.soil, p.rock, p.sand, p.mud, p.clay, p.snow, p.basalt, p.ore, p.crystal, p.soil, p.rock, p.basalt];
    out.set(tbl[b] ?? p.grass);
    if (b === 11) out.lerp(new THREE.Color(p.grass), 0.4);
    if (b === 12) out.lerp(new THREE.Color(p.sand), 0.4);
    return out.multiplyScalar(0.9 + hash(x, z, 5) * 0.16);
  }
  private buildRegion() {
    const R = this.R, N = this.N, bin = this.bin, pal = this.o.pal;
    // one vertex per cell centre, plus a skirt round the edge down into the far landscape
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const c = new THREE.Color(), fol = new THREE.Color(pal.foliage[0] ?? pal.grass).multiplyScalar(0.62), wat = new THREE.Color(pal.water).lerp(new THREE.Color(0x2a4a5a), 0.3);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x;
      let y = R.h[i];
      const ry = R.riverY[i];
      this.blockColor(R.b[i], x, z, c);
      const f = R.forest[i]; if (f > 0.2) c.lerp(fol, clamp((f - 0.2) * 1.1, 0, 0.75));
      if (ry > 0 && y < ry) { c.copy(wat); y = ry - 0.1; }
      if (R.damp[i] > 0.3) c.multiplyScalar(1 - (R.damp[i] - 0.3) * 0.25);
      pos.push(x + 0.5 - N / 2, y, z + 0.5 - N / 2); col.push(c.r, c.g, c.b);
    }
    for (let z = 0; z < N - 1; z++) for (let x = 0; x < N - 1; x++) { const a = z * N + x, b = a + 1, cc = a + N, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = mesh(bin, g, lit(bin, 0xffffff, { vertexColors: true, flat: true, flag: 1 }), this.scene, 0, 0, 0, false);
    m.receiveShadow = true;
    // woods: instanced conifers and broadleaf lumps where the forest is thick
    const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5); trunk.translate(0, 0.6, 0);
    const crownA = new THREE.ConeGeometry(1.1, 2.6, 6); crownA.translate(0, 2.3, 0);
    const crownB = new THREE.ConeGeometry(0.8, 1.8, 6); crownB.translate(0, 3.3, 0);
    const tg = mergeGeos([trunk, crownA, crownB]);
    [trunk, crownA, crownB].forEach((x) => x.dispose());
    const spots: [number, number, number][] = [];
    for (let z = 2; z < N - 2; z += 2) for (let x = 2; x < N - 2; x += 2) {
      const f = R.forest[z * N + x];
      if (f < 0.4 || hash(x, z, 11) > f || R.isWater(x + 0.5, z + 0.5) || R.isSolid(x + 0.5, z + 0.5)) continue;
      spots.push([x + 0.5 + (hash(x, z, 1) - 0.5) * 1.6, z + 0.5 + (hash(x, z, 2) - 0.5) * 1.6, 0.8 + hash(x, z, 3) * 0.9]);
      if (spots.length > 2200) break;
    }
    if (spots.length) {
      const im = new THREE.InstancedMesh(bin.g(tg), lit(bin, 0xffffff, { flat: true }), spots.length);
      const fc = pal.foliage.length ? pal.foliage : [pal.grass];
      spots.forEach(([x, z, s], i) => {
        _m.compose(_v.set(x - N / 2, R.groundSmooth(x, z) - 0.1, z - N / 2), _q.setFromAxisAngle(new V3(0, 1, 0), hash(x, z, 4) * TAU), _v2.set(s, s * (0.8 + hash(x, z, 6) * 0.5), s));
        im.setMatrixAt(i, _m);
        im.setColorAt(i, new THREE.Color(fc[Math.floor(hash(x, z, 7) * fc.length)]).multiplyScalar(0.7 + hash(x, z, 8) * 0.25));
      });
      im.castShadow = true; im.receiveShadow = true; this.scene.add(im);
    } else bin.g(tg);
    // rock formations as faceted boulders
    const rocks = R.rocks.filter((r) => r.kind !== 'pebble');
    if (rocks.length) {
      const rg = new THREE.DodecahedronGeometry(0.5, 0); rg.translate(0, 0.35, 0);
      const im = new THREE.InstancedMesh(bin.g(rg), lit(bin, 0xffffff, { flat: true }), rocks.length);
      const rc = [pal.rock, pal.sand, pal.basalt, pal.rock, 0x6a5038];
      rocks.forEach((r, i) => {
        _m.compose(_v.set(r.x - N / 2, r.y - 0.2, r.z - N / 2), _q.setFromEuler(new THREE.Euler(r.tilt * Math.cos(r.tiltDir), r.yaw, r.tilt * Math.sin(r.tiltDir))), _v2.set(r.sx, r.sy, r.sz));
        im.setMatrixAt(i, _m); im.setColorAt(i, new THREE.Color(rc[r.mat] ?? pal.rock).multiplyScalar(0.85 + hash(i, 1) * 0.2));
      });
      im.castShadow = true; im.receiveShadow = true; this.scene.add(im);
    }
    // lumen seams glint: small crystal spires
    const cr = R.deposits.filter((d) => d.kind === 'crystal');
    if (cr.length) {
      const sg = new THREE.ConeGeometry(0.25, 1.6, 5); sg.translate(0, 0.7, 0);
      const cm = bin.m(gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.crystal).multiplyScalar(1.6) }), 32));
      const im = new THREE.InstancedMesh(bin.g(sg), cm, cr.length * 6);
      let k = 0;
      for (const d of cr) for (let j = 0; j < 6; j++) {
        const a = (j / 6) * TAU + hash(d.x, j) * 0.8, rr = 0.6 + hash(d.z, j) * 1.8, x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
        _m.compose(_v.set(x - N / 2, R.groundSmooth(x, z) - 0.1, z - N / 2), _q.setFromEuler(new THREE.Euler((hash(j, 1) - 0.5) * 0.6, 0, (hash(j, 2) - 0.5) * 0.6)), _v2.setScalar(0.6 + hash(x, z) * 0.9));
        im.setMatrixAt(k++, _m);
      }
      this.scene.add(im);
    }
  }
  private buildWater() {
    const pal = this.o.pal;
    const m = lit(this.bin, new THREE.Color(pal.water).lerp(new THREE.Color(0x234656), 0.45).getHex(), { phong: true, shininess: 90, flat: false, flag: 0 });
    (m as THREE.MeshPhongMaterial).specular = new THREE.Color(0x8a9aa0);
    const w = mesh(this.bin, new THREE.CircleGeometry(22000, 48), m, this.scene, 0, this.R.water - 0.08, 0, false);
    w.rotation.x = -Math.PI / 2; w.receiveShadow = true;
  }
  private buildCloud(y: number, cover: number) {
    const L = { y, cover, slices: [] as THREE.Mesh[], u: [] as Record<string, THREE.IUniform>[] };
    const lc = new THREE.Color(0xe8e6de), dc = new THREE.Color(this.o.pal.horizon).lerp(new THREE.Color(0x5a6470), 0.6);
    for (let s = -2; s <= 2; s++) {
      const u = { uT: { value: 0 }, uCover: { value: cover }, uSlice: { value: s / 2 }, uShade: { value: s * 0.12 }, uLit: { value: lc }, uDark: { value: dc }, uCam: { value: new V3() }, uWind: { value: new THREE.Vector2(6, 2) }, uFadeNear: { value: 1 } };
      const m = mesh(this.bin, new THREE.PlaneGeometry(40000, 40000), fxMat(this.bin, CLOUD_V, CLOUD_F, u, 'alpha', { side: THREE.DoubleSide }), this.scene, 0, y + s * 14, 0, false);
      m.rotation.x = -Math.PI / 2; m.frustumCulled = false; m.renderOrder = 2;
      L.slices.push(m); L.u.push(u);
    }
    this.clouds.push(L);
  }
  private buildLZ() {
    const bin = this.bin, L = this.lzW;
    // the painted rings: an 18 m dashed circle (on target), the 6 m red ring (bullseye), a cross
    const ring = (r0: number, r1: number, col: number, dash = 0) => {
      const seg = 96, pos: number[] = [];
      for (let i = 0; i < seg; i++) {
        if (dash && i % 2) continue;
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const P = (a: number, r: number) => { const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r; return [x, this.gH(x, z) + 0.12, z]; };
        const A = P(a0, r0), B = P(a1, r0), C = P(a0, r1), D = P(a1, r1);
        pos.push(...A, ...C, ...B, ...B, ...C, ...D);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      const m = bin.m(gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.4), side: THREE.DoubleSide }), 32));
      mesh(bin, g, m, this.scene, 0, 0, 0, false);
    };
    ring(17.4, 18, 0xe8e2d0, 1); ring(5.4, 6.2, 0xd04a34); ring(0, 0.9, 0xe8e2d0);
    for (const a of [0, Math.PI / 2]) {
      const pos: number[] = [];
      for (let i = -1; i <= 1; i += 2) for (let k = 0; k < 6; k++) {
        const r0 = 1.6 + k * 0.6, r1 = r0 + 0.6, w = 0.25, ca = Math.cos(a), sa = Math.sin(a);
        const P = (r: number, s: number) => { const x = L.x + ca * r * i - sa * s, z = L.z + sa * r * i + ca * s; return [x, this.gH(x, z) + 0.12, z]; };
        const A = P(r0, -w), B = P(r1, -w), C = P(r0, w), D = P(r1, w);
        pos.push(...A, ...C, ...B, ...B, ...C, ...D);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      mesh(bin, g, bin.m(gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8e2d0).multiplyScalar(1.3), side: THREE.DoubleSide }), 32)), this.scene, 0, 0, 0, false);
    }
    // red smoke column, leaning downwind
    this.smokeU = { uT: { value: 0 }, uCol: { value: new THREE.Color(0xa83a2a) } };
    const sg = new THREE.CylinderGeometry(14, 1.4, 260, 20, 12, true); sg.translate(0, 130, 0);
    const p = sg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const yy = p.getY(i), k = (yy / 260) ** 1.6; p.setX(i, p.getX(i) + k * 70); }
    this.smoke = mesh(bin, sg, fxMat(bin, PL_V, SMOKE_F, this.smokeU, 'alpha', { side: THREE.DoubleSide }), this.scene, L.x, L.y, L.z, false);
    this.smoke.renderOrder = 3;
    // a strobe at the pin, visible from altitude
    const stm = bin.m(gbuf(new THREE.MeshBasicMaterial({ color: 0xffd8b0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0));
    this.strobe = mesh(bin, new THREE.SphereGeometry(1, 10, 8), stm, this.scene, L.x, L.y + 1.2, L.z, false);
    // the scorched disc left by the impact (hidden until then)
    const scm = bin.m(gbuf(new THREE.MeshLambertMaterial({ color: 0x2a221c, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), 0));
    this.scorch = mesh(bin, new THREE.CircleGeometry(4.2, 24), scm, this.scene, 0, 0, 0, false);
    this.scorch.rotation.x = -Math.PI / 2; this.scorch.visible = false;
  }

  // ================================================================ shots
  private planShots() {
    const a0 = this.alt0, P = () => this.pod.root.position;
    // relative to the pod, in the camera's heading frame: side, up, forward
    const rel = (s: number, u: number, f: number, out: V) => out.set(P().x + this.Rt.x * s + this.F.x * f, P().y + u, P().z + this.Rt.y * s + this.F.y * f);
    const add = (name: string, alt: number, dur: number, pose: Shot['pose']) => { if (alt < a0 - 60) this.shots.push({ name, t: alt, dur, pose }); };
    // 1. alongside, through the sheath, the horizon curving behind
    add('plasma-side', a0 - 120, 3.0, (t, pos, look) => { rel(-9 + t * 1.2, -2.5 + t * 0.6, 3 - t * 1.2, pos); rel(0, -0.6, 0, look); return 38; });
    // 2. the porthole: Unit 07's lens in the orange light
    add('porthole', 1700, 2.4, (t, pos, look) => { portholeWorld(this.pod, look); const out = look.clone().sub(P()).setY(0).normalize(); pos.copy(look).addScaledVector(out, 1.6 - t * 0.25).add(_v.set(0, 0.35, 0)); return 34; });
    // 3. from the ground at the pin: a fireball crossing the sky
    add('ground-up', 1180, 3.0, (t, pos, look) => { pos.set(this.lzW.x - this.F.x * 30 + this.Rt.x * 12, this.lzW.y + 1.7, this.lzW.z - this.F.y * 30 + this.Rt.y * 12); look.copy(P()); return 30 - t * 4; });
    // 4. under the first deck, looking up as the pod punches through
    add('cloud-punch', 860, 2.4, (t, pos, look) => { rel(16, -95 + t * 12, 6, pos); pos.y = Math.min(pos.y, this.clouds[0].y - 70); look.copy(P()); return 46; });
    // 5. low and wide: the chute blooms
    this.shots.push({ name: 'chute', t: CHUTE_ALT + 4, dur: 2.6, pose: (t, pos, look) => { rel(-14, -10 + t * 1.5, 10, pos); rel(0, 3 + t * 1.5, 0, look); return 40; } });
  }
  private shotPose(pos: V, look: V): number | null {
    if (!this.shot) return null;
    return this.shot.pose(clamp(this.shot.t, 0, this.shot.dur), pos, look);
  }

  // ================================================================ HUD
  private buildHud() {
    const h = this.hud, e = this.el;
    const top = div('bar t', h);
    div('', top, '<div class="lbl">U.S.P.C. &middot; UNIT 07 &middot; PLANETARY INSERTION</div>');
    e.clock = div('lbl', top, 'T+00:00');
    const bot = div('bar b', h);
    const blk = (lbl: string, cls = 'num') => { const b = div('blk', bot); div('lbl', b, lbl); return div(cls, b); };
    e.alt = blk('ALTITUDE');
    e.vs = blk('DESCENT', 'num dim');
    e.dist = blk('TO THE PIN', 'num dim');
    const rcs = div('blk', bot); div('lbl', rcs, 'RCS'); e.gauge = div('gauge', rcs); e.fuel = document.createElement('i'); e.gauge.appendChild(e.fuel);
    const bu = div('blk', bot); div('lbl', bu, 'BURST'); e.lamps = div('lamps', bu, '<i class="on"></i><i class="on"></i><i class="on"></i>');
    const wi = div('blk', bot); div('lbl', wi, 'WIND'); e.wind = div('wind', wi, '<i></i>');
    div('sp', bot);
    e.mode = div('lbl', bot, 'MANUAL');
    e.mk = div('mk', h, '<div class="d"></div><div class="m"></div>');
    e.pip = div('pip', h);
    e.warn = div('warn', h, '');
    e.hint = div('hint', h, this.touch ? '<b>DRAG</b> LEFT SIDE TO STEER &middot; <b>BURST</b> BUTTON &middot; PUT THE <b>+</b> ON THE SMOKE' : '<b>WASD / ARROWS</b> STEER &middot; <b>SPACE</b> BURST &middot; PUT THE <b>+</b> ON THE SMOKE &middot; <b>ESC</b> AUTOPILOT');
    setTimeout(() => { if (e.hint) e.hint.style.opacity = '0'; }, 7000);
    if (this.touch) {
      e.stick = div('stick', h); e.knob = div('knob', h); e.burst = div('burst', h, 'BURST');
    }
  }
  private updateHud() {
    const e = this.el, cam = this.cam, W = innerWidth, H = innerHeight;
    const t = this.t, mm = Math.floor(t / 60), ss = Math.floor(t % 60);
    e.clock.textContent = `T+${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    const black = this.blackout;
    const g = (s: string) => (black ? s.replace(/[0-9]/g, () => '#%&@'[Math.floor(Math.random() * 4)]) : s);
    e.alt.textContent = g(`${String(Math.max(0, Math.round(this.alt))).padStart(4, '0')} M`);
    e.vs.textContent = g(`${Math.round(this.landed ? 0 : this.vy)} M/S`);
    const d = Math.hypot(this.p.x - this.lzW.x, this.p.y - this.lzW.z);
    e.dist.textContent = g(`${Math.round(d)} M`);
    e.fuel.style.width = `${Math.round(this.fuel * 100)}%`; e.gauge.classList.toggle('low', this.fuel < 0.25);
    [...e.lamps.children].forEach((l, i) => l.classList.toggle('on', i < this.bursts));
    const wr = this.wind.x * this.Rt.x + this.wind.y * this.Rt.y, wf = this.wind.x * this.F.x + this.wind.y * this.F.y;
    (e.wind.firstElementChild as HTMLElement).style.transform = `rotate(${Math.atan2(-wf, wr)}rad)`;
    e.mode.textContent = this.auto ? 'AUTOPILOT' : this.chute > 0 ? 'UNDER CHUTE' : 'MANUAL';
    this.hud.classList.toggle('black', black);
    const showMk = !this.landed && !this.shot;
    // the pin
    _v.copy(this.lzW).setY(this.lzW.y + 1).project(cam);
    let x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    const behind = _v.z > 1;
    const m = 34, on = !behind && x > m && x < W - m && y > H * 0.13 && y < H * 0.85;
    if (!on) { const cx = W / 2, cy = H / 2; let dx = x - cx, dy = y - cy; if (behind) { dx = -dx; dy = -dy; } const k = Math.min((W / 2 - m) / Math.max(1, Math.abs(dx)), (H * 0.36) / Math.max(1, Math.abs(dy))); x = cx + dx * k; y = cy + dy * k; }
    e.mk.style.display = showMk ? '' : 'none';
    e.mk.style.left = `${x}px`; e.mk.style.top = `${y}px`; e.mk.classList.toggle('edge', !on);
    (e.mk.lastElementChild as HTMLElement).textContent = black ? '- - -' : `PIN ${Math.round(d)} M`;
    // the predicted touchdown (green cross): where the pod lands if the stick is let go now
    const pr = this.predict(new THREE.Vector2());
    _v.set(pr.x, this.gH(pr.x, pr.y) + 0.5, pr.y).project(cam);
    const px = (_v.x * 0.5 + 0.5) * W, py = (-_v.y * 0.5 + 0.5) * H;
    e.pip.style.display = showMk && _v.z < 1 && px > 0 && px < W && py > 0 && py < H ? '' : 'none';
    e.pip.style.left = `${px}px`; e.pip.style.top = `${py}px`;
    e.pip.classList.toggle('hit', Math.hypot(pr.x - this.lzW.x, pr.y - this.lzW.z) < 6);
  }
  /** where the pod would touch down with no more thrust: drift toward the wind over the time left */
  private predict(out: THREE.Vector2) {
    const T = this.landed ? 0 : this.chute > 0 ? this.alt / 11 : tToGround(this.alt);
    const k = this.chute > 0 ? 0.9 : 0.16;
    const f = (1 - Math.exp(-k * T)) / k;
    return out.set(this.p.x + this.wind.x * T + (this.v.x - this.wind.x) * f, this.p.y + this.wind.y * T + (this.v.y - this.wind.y) * f);
  }

  // ================================================================ input
  private bindInput() {
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === ' ') { e.preventDefault(); this.burst(); }
      else if (e.key === 'Escape') this.engageAuto();
    };
    addEventListener('keydown', key);
    this.off.push(() => removeEventListener('keydown', key));
    const st = this.el.stick, kn = this.el.knob, bu = this.el.burst;
    if (st && kn) {
      const down = (e: PointerEvent) => { this.stickId = e.pointerId; this.stickO.set(e.clientX, e.clientY); kn.style.display = 'block'; kn.style.left = `${e.clientX}px`; kn.style.top = `${e.clientY}px`; st.setPointerCapture(e.pointerId); };
      const move = (e: PointerEvent) => { if (e.pointerId !== this.stickId) return; const R = 46 * (Number(document.documentElement.style.getPropertyValue('--s')) || 2) / 2; this.stick.set((e.clientX - this.stickO.x) / R, (e.clientY - this.stickO.y) / R); if (this.stick.length() > 1) this.stick.normalize(); kn.style.left = `${this.stickO.x + this.stick.x * R}px`; kn.style.top = `${this.stickO.y + this.stick.y * R}px`; };
      const up = (e: PointerEvent) => { if (e.pointerId !== this.stickId) return; this.stickId = null; this.stick.set(0, 0); kn.style.display = 'none'; };
      st.addEventListener('pointerdown', down); st.addEventListener('pointermove', move); st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
    }
    if (bu) bu.addEventListener('pointerdown', (e) => { e.preventDefault(); this.burst(); });
  }
  private steer(out: THREE.Vector2) {
    const k = this.o.input.keys;
    let x = 0, y = 0;
    if (k.has('a') || k.has('ArrowLeft')) x -= 1; if (k.has('d') || k.has('ArrowRight')) x += 1;
    if (k.has('w') || k.has('ArrowUp')) y += 1; if (k.has('s') || k.has('ArrowDown')) y -= 1;
    const st = this.o.input.stick;
    if (st.on) { x += st.x; y -= st.y; }
    x += this.stick.x; y -= this.stick.y;
    out.set(x, y); if (out.length() > 1) out.normalize();
    return out;
  }
  private burst() {
    if (this.landed || this.bursts <= 0 || this.burstCD > 0 || this.auto) return;
    const s = this.steer(new THREE.Vector2());
    if (s.lengthSq() < 0.01) s.set(0, 1);
    const dir = new THREE.Vector2(this.F.x * s.y + this.Rt.x * s.x, this.F.y * s.y + this.Rt.y * s.x).normalize();
    const k = this.chute > 0 ? 0.45 : 1;
    this.v.addScaledVector(dir, 11 * k);
    this.bursts--; this.burstCD = 0.9; this.kick = 1;
    csfx('thrust', 0.9, 0.35); csfx('relay', 0.5); sfx('hit', 0.6, 0.4);
    this.puff(dir, 26);
  }
  private engageAuto() {
    if (this.landed) return;
    if (!this.auto) { this.auto = true; this.el.warn.textContent = 'AUTOPILOT ENGAGED'; this.el.warn.classList.add('on'); setTimeout(() => this.el.warn?.classList.remove('on'), 2400); csfx('beepHi', 0.6); }
    this.ff = 4; this.shot = null; this.shots = this.shots.filter((s) => s.name === 'chute');
    this.o.ui.endSub();
  }
  /** RCS gas: white puffs out of the ports facing away from the thrust */
  private puff(dir: THREE.Vector2, n: number) {
    for (const port of this.pod.rcsPorts) {
      const d = _v.copy(port.d).applyQuaternion(this.pod.body.getWorldQuaternion(_q));
      if (d.x * dir.x + d.z * dir.y > -0.3) continue;
      const w = this.pod.body.localToWorld(_v2.copy(port.p));
      this.fx.spray(w.x, w.y, w.z, d.x, d.y + 0.1, d.z, Math.ceil(n / 2), 0xe8ecf0, { speed: 9, cone: 0.25, size: 2.2, life: 0.4, drag: 5 });
    }
  }
  private say(text: string, who: string, pitch = 1, radio = true) {
    csfx('squelch', 0.6);
    const sec = cvoice(text, pitch, radio);
    this.o.ui.sub(text, { who, style: 'radio', dur: Math.max(2.4, sec + 1.1, text.length * 0.05 + 1.2) }, () => {});
  }
  private once(id: string, f: () => void) { if (this.said.has(id)) return; this.said.add(id); f(); }

  // ================================================================ frame
  update(dt: number) {
    const sdt = dt * this.ff;
    this.t += sdt;
    if (!this.landed) this.fly(sdt); else this.afterImpact(dt);
    this.effects(sdt, dt);
    this.camera(dt);
    this.fx.update(dt, this.o.engine.h, this.cam.fov);
    this.updateHud();
  }
  private fly(dt: number) {
    const auth = this.chute > 0 ? 0.35 : 1;
    // vertical: the table above, then the chute, then the flare
    if (this.chute <= 0) this.vy = damp(this.vy, vAt(this.alt), 3, dt);
    else this.vy = damp(this.vy, this.retro > 0 ? 2.5 : 11, this.retro > 0 ? 6 : 1.6, dt);
    this.alt -= this.vy * dt;
    if (this.alt < CHUTE_ALT && this.chute <= 0) this.deployChute();
    if (this.chuteT >= 0) { this.chuteT += dt; this.chute = Math.min(1, this.chuteT / 1.6); this.pod.setChute(this.chute, this.t); }
    if (this.alt < RETRO_ALT && this.retro <= 0) { this.retro = 1; csfx('ignite', 1); csfx('thrust', 1, 0.6); this.shakeK = Math.max(this.shakeK, 0.5); this.ff = 1; }
    if (this.alt < 70 && this.ff > 1) this.ff = 1;
    // lateral: stick, wind drag, autopilot
    const s = this.steer(new THREE.Vector2());
    if (this.auto) {
      const T = Math.max(1.5, this.chute > 0 ? this.alt / 11 : tToGround(this.alt) * 0.8);
      const want = new THREE.Vector2(this.lzW.x - this.p.x, this.lzW.z - this.p.y).divideScalar(T);
      const dv = want.sub(this.v).multiplyScalar(1.5);
      // to stick space
      s.set(dv.x * this.Rt.x + dv.y * this.Rt.y, dv.x * this.F.x + dv.y * this.F.y).divideScalar(16 * auth);
      if (s.length() > 1) s.normalize();
    }
    const thrust = this.fuel > 0 || this.auto ? s.length() : 0;
    this.thrusting = thrust;
    const ax = (this.F.x * s.y + this.Rt.x * s.x) * 16 * auth * (thrust > 0 ? 1 : 0), az = (this.F.y * s.y + this.Rt.y * s.x) * 16 * auth * (thrust > 0 ? 1 : 0);
    const drag = this.chute > 0 ? 0.9 : 0.16;
    this.v.x += (ax + (this.wind.x - this.v.x) * drag) * dt;
    this.v.y += (az + (this.wind.y - this.v.y) * drag) * dt;
    if (this.v.length() > 48) this.v.setLength(48);
    this.p.addScaledVector(this.v, dt);
    if (thrust > 0.05 && !this.auto) this.fuel = Math.max(0, this.fuel - dt * 0.03 * thrust);
    this.burstCD = Math.max(0, this.burstCD - dt);
    if (thrust > 0.1 && Math.random() < dt * 14) this.puff(new THREE.Vector2(ax, az).normalize(), 4);
    if (thrust > 0.1 && Math.random() < dt * 3) csfx('steam', 0.12, 0.6);
    // the pod's attitude: a slow spin on entry, a lean into the thrust, a pendulum under the chute
    this.spin += dt * (this.chute > 0 ? 0.1 : 0.6);
    this.lean.x = damp(this.lean.x, -s.y * 0.12, 4, dt); this.lean.y = damp(this.lean.y, s.x * 0.12, 4, dt);
    if (this.chute > 0) { this.swayV.x += (-this.sway.x * 3 - this.swayV.x * 0.4 + ax * 0.02) * dt; this.swayV.y += (-this.sway.y * 3 - this.swayV.y * 0.4 + az * 0.02) * dt; this.sway.addScaledVector(this.swayV, dt); }
    const gy = this.gH(this.p.x, this.p.y);
    const P = this.pod.root.position; P.set(this.p.x, gy + Math.max(0, this.alt), this.p.y);
    this.pod.root.rotation.set(this.lean.x * this.F.x + this.sway.y * 0.6, this.spin, this.lean.y + this.sway.x * 0.6);
    // radio and cues by altitude
    const A = this.alt;
    if (A < this.alt0 - 260) this.once('interface', () => this.say('Entry interface. Heat shield coming up to temperature.', 'Vanguard Control', 1.0));
    if (A < 1950 && A > 1200) this.once('blackout', () => { this.say('Seven, you are going into blackout. See you on the other side.', 'Vanguard Control', 1.0); setTimeout(() => { if (!this.landed && this.alt > 1150) { this.blackout = true; this.static$ = cloop('radio', 0.6); this.loops.push(this.static$); } }, 2600); });
    if (A < 1150 && this.blackout) { this.blackout = false; this.static$?.stop(0.3); this.once('reacquire', () => this.say('...Seven, Vanguard. We have you again. Good shield.', 'Vanguard Control', 1.0)); }
    if (A < 980) this.once('weather', () => this.say('Weather deck at eight hundred. You will be blind for a moment.', 'Vanguard Control', 1.0));
    if (A < 400) this.once('ground', () => { const dir = this.compass(-this.wind.x, -this.wind.y); this.say(`Ground in sight. Wind out of the ${dir} at ${Math.round(this.wind.length() * 1.94)} knots. Hold upwind of the smoke.`, 'Launch Control', 0.85); });
    if (A < 34) this.once('retro', () => this.say('Retros armed. Stand by.', 'Launch Control', 0.85));
    // shots: start the next one whose altitude has come
    const nx = this.shots[0];
    if (!this.shot && nx && A <= nx.t) { this.shots.shift(); this.startShot(nx); }
    if (this.shot) { this.shot.t += dt; if (this.shot.t >= this.shot.dur) this.endShot(); }
    if (A <= 0) this.touchdown();
    const h = this.o.hold;
    if (h && ((h === 'entry' && A < this.alt0 - 300) || (h === 'low' && A < 230) || (h === 'cloud' && A < this.clouds[0].y + 6) || (h === 'flare' && A < 3.5) || (h === 'chute' && this.chute > 0.9 && A < CHUTE_ALT - 20) || (this.shot && this.shot.name === h && this.shot.t > this.shot.dur * 0.55))) { this.o.engine.timeScale = 0; this.o.hold = null; console.log('descent hold', h); }
  }
  private compass(x: number, z: number) {
    // world -z is north on the chart
    const a = (Math.atan2(x, -z) + TAU) % TAU;
    return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(a / (TAU / 8)) % 8];
  }
  private deployChute() {
    this.chuteT = 0; this.chute = 0.001;
    csfx('boom', 0.5, 1.6); csfx('whoosh', 0.8, 1.4); sfx('crack', 1.6, 0.7);
    this.pod.noseCap.visible = false;
    const w = this.pod.noseCap.getWorldPosition(new V3());
    this.fx.burst(w.x, w.y, w.z, 14, 0x8a2e24, { speed: 6, up: 4, size: 3, life: 1.2, grav: 9 });
    this.shakeK = Math.max(this.shakeK, 0.9);
    this.vy *= 0.75;
    this.once('chute', () => this.say('Chute! Good chute!', 'Launch Control', 0.85));
  }
  private startShot(s: Shot) {
    if (s.name === 'porthole' && this.shot) return;
    s.t = 0; this.shot = s;
    // a hard cut in
    this.blendT = 1;
  }
  private endShot() {
    // blend back to the chase camera from where the shot left it
    this.blendFrom.pos.copy(this.cam.position); this.blendFrom.q.copy(this.cam.quaternion); this.blendFrom.fov = this.cam.fov;
    this.blendT = 0; this.shot = null;
  }
  private touchdown() {
    this.landed = true; this.landT = 0; this.alt = 0;
    const P = this.pod.root.position; P.y = this.gH(this.p.x, this.p.y);
    this.retro = 0; this.pod.setRetro(0, this.t);
    // score
    const rx = this.p.x + this.N / 2, rz = this.p.y + this.N / 2;
    const dist = Math.hypot(this.p.x - this.lzW.x, this.p.y - this.lzW.z);
    const grade: Grade = this.auto ? 'AUTOPILOT' : dist <= 6 ? 'BULLSEYE' : dist <= 18 ? 'ON TARGET' : dist <= 45 ? 'CLOSE' : 'WIDE';
    this.result = { x: clamp(rx, 6, this.N - 6), z: clamp(rz, 6, this.N - 6), dist, grade, auto: this.auto, water: this.R.isWater(rx, rz) };
    // the impact: flash, shake, a ring of dust racing out, debris, the scorch
    const ui = this.o.ui;
    ui.flash('#fff', 0.9, 1);
    csfx('impact', 1, 0.8); csfx('boom', 1, 0.6); csfx('crunch', 0.8); sfx('crack', 3, 1);
    this.shakeK = 2.2; this.kick = 2;
    const g = P.y;
    for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; this.fx.spray(P.x + Math.cos(a) * 1.2, g + 0.3, P.z + Math.sin(a) * 1.2, Math.cos(a), 0.18, Math.sin(a), 5, i % 3 ? 0xb8a888 : 0x8a7a62, { speed: 14, cone: 0.35, size: 5, life: 2.2, grav: -0.3, drag: 1.6 }); }
    this.fx.burst(P.x, g + 0.4, P.z, 40, 0x5a4a3a, { speed: 9, up: 9, size: 3, life: 1.6, grav: 14 });
    this.fx.burst(P.x, g + 0.4, P.z, 24, 0xffb060, { glow: true, speed: 7, up: 6, size: 2, life: 0.7, grav: 10 });
    this.shockU = { uK: { value: 1 }, uT: { value: 0 }, uCol: { value: new THREE.Color(0xc8b898) } };
    const rg = new THREE.RingGeometry(0.2, 1, 48, 1);
    const ruv = rg.attributes.uv as THREE.BufferAttribute, rp = rg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < ruv.count; i++) ruv.setXY(i, Math.atan2(rp.getY(i), rp.getX(i)) / TAU + 0.5, Math.hypot(rp.getX(i), rp.getY(i)) > 0.6 ? 1 : 0);
    this.shock = mesh(this.bin, rg, fxMat(this.bin, PL_V, SHOCK_F, this.shockU, 'alpha', { side: THREE.DoubleSide }), this.scene, P.x, g + 0.6, P.z, false);
    this.shock.rotation.x = -Math.PI / 2;
    this.scorch.visible = true; this.scorch.position.set(P.x, g + 0.08, P.z);
    // the pod settles half buried and tipped; the chute collapses downwind
    this.pod.root.position.y = g - 0.45;
    this.pod.root.rotation.set(0.14, this.spin, -0.1);
    this.endShot();
    // the impact shot: wide and low
    this.shot = { name: 'impact', t: 0, dur: 99, pose: (t, pos, look) => { pos.set(P.x - this.F.x * 26 + this.Rt.x * 14, g + 4.5 + t * 0.3, P.z - this.F.y * 26 + this.Rt.y * 14); look.set(P.x, g + 2, P.z); return 40 - Math.min(6, t * 2); } };
    this.blendT = 1;
    for (const l of this.loops) l.stop(0.4);
    const pn = this.o.planetName;
    const line = grade === 'BULLSEYE' ? 'Dead on the smoke. Beautiful flying, Seven.' : grade === 'ON TARGET' ? 'On target. Close enough to walk it.' : grade === 'CLOSE' ? 'You are down, Seven. A short walk to the pin.' : grade === 'AUTOPILOT' ? 'Autopilot put you down. Close to the pin.' : 'Long way from the pin, Seven. But you are down.';
    setTimeout(() => this.say(`Touchdown. Welcome to ${pn}, Seven. ${line}`, 'Launch Control', 0.85), 900);
  }
  private afterImpact(dt: number) {
    this.landT += dt;
    const P = this.pod.root.position;
    if (this.shot) this.shot.t += dt;
    // the chute settles over to one side
    const c = this.pod.chute;
    if (c) { c.root.rotation.z = Math.min(1.35, this.landT * 0.8); c.root.scale.y = Math.max(0.15, 1 - this.landT * 0.4); c.root.scale.x = c.root.scale.z = Math.max(0.5, 1 - this.landT * 0.15); }
    if (this.shockU && this.shock) { const k = 1 - Math.exp(-this.landT * 1.6); this.shock.scale.setScalar(2 + k * 46); this.shockU.uK.value = Math.max(0, 1 - this.landT / 2.6); }
    if (Math.random() < dt * 8) this.fx.burst(P.x + (Math.random() - 0.5) * 2, P.y + 1, P.z + (Math.random() - 0.5) * 2, 1, Math.random() < 0.5 ? 0x5a5650 : 0x3e3a36, { speed: 0.3, up: 1.4, size: 6, life: 3, grav: -0.3 });
    if (this.o.hold === 'impact' && this.landT > 0.7) { this.o.engine.timeScale = 0; this.o.hold = null; }
    if (this.landT > 2.2 && this.result) this.once('card', () => {
      const r = this.result!;
      this.o.ui.card(r.grade === 'WIDE' ? 'TOUCHDOWN' : r.grade, `${r.auto ? 'ON THE PIN' : `${Math.round(r.dist * 10) / 10} M FROM THE PIN`} · ${bonusFor(r.grade).text}`, 'UNIT 07 IS DOWN', r.grade === 'BULLSEYE' ? 'BULLSEYE' : 'U.S.P.C.');
      csfx('sting', 0.7);
    });
    if (this.landT > 6.4 && this.result) this.once('done', () => { this.o.ui.cardOff(); this.o.onDone(this.result!); });
  }
  private effects(dt: number, rdt: number) {
    const A = this.alt, pod = this.pod, P = pod.root.position;
    // plasma: builds after the interface, peaks, dies by the weather deck
    const heat = this.landed ? 0 : sm(this.alt0 + 50, this.alt0 - 300, A) * (1 - sm(1300, 900, A));
    for (const u of this.plasmaU) { u.uT.value = this.t; u.uK.value = heat * (u.uWake.value ? 0.9 : 1.2); }
    this.plasma.forEach((m) => (m.visible = heat > 0.01));
    pod.heat.value = Math.max(heat * 1.4, pod.heat.value - dt * 0.15);
    this.heatLight.intensity = heat * 12;
    this.fire$?.set(heat * 1.4);
    this.wind$?.set(0.3 + (1 - heat) * 0.4 * (this.landed ? 0 : 1));
    pod.lens.value = 0.8 + Math.sin(this.t * 3) * 0.2 + heat * 0.4;
    pod.setRetro(this.retro, this.t);
    pod.update(dt, this.t);
    // buffet: dynamic pressure through the entry, turbulence in the decks, the chute's jolt
    let q = heat * 0.8;
    for (const L of this.clouds) q += (1 - sm(0, 60, Math.abs(A - L.y))) * 0.5;
    this.shakeK = Math.max(q, this.shakeK - rdt * 1.5);
    // smoke trail and glowing ablation shed off the shield
    if (heat > 0.2 && Math.random() < rdt * 60) this.fx.burst(P.x + (Math.random() - 0.5) * 2, P.y + 2 + Math.random() * 4, P.z + (Math.random() - 0.5) * 2, 1, 0xff8a3a, { glow: true, speed: 2, up: this.vy * 0.25, size: 3, life: 0.6, grav: -this.vy * 0.4 });
    if (heat > 0.05 && heat < 0.9 && Math.random() < rdt * 30) this.fx.burst(P.x, P.y + 4, P.z, 1, 0x4a4440, { speed: 1, up: this.vy * 0.5, size: 7, life: 2.5, grav: -2 });
    if (this.retro > 0 && !this.landed) {
      for (let i = 0; i < 6; i++) { const a = Math.random() * TAU; const g = this.gH(P.x, P.z); this.fx.spray(P.x + Math.cos(a) * 2, g + 0.3, P.z + Math.sin(a) * 2, Math.cos(a), 0.15, Math.sin(a), 2, 0xb8a888, { speed: 11, cone: 0.3, size: 5, life: 1.4, grav: -0.3, drag: 1.5 }); }
    }
    // streaks: lines of torn air (orange in the plasma, grey wisps in cloud) rushing up past the pod
    const sp = this.streakP, sc = this.streakC, ss = this.streakSeed, n = sp.length / 6;
    let wisp = 0; for (const L of this.clouds) wisp = Math.max(wisp, 1 - sm(10, 70, Math.abs(A - L.y)));
    const vis = this.landed ? 0 : Math.max(heat, wisp * 0.8, sm(400, 150, A) * 0.18);
    const len = 3 + this.vy * 0.09;
    for (let i = 0; i < n; i++) {
      const a = ss[i * 3], r = ss[i * 3 + 1];
      let y = ss[i * 3 + 2] + this.t * this.vy * 1.0;
      y = ((y + 40) % 80 + 80) % 80 - 40;
      const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r, yy = P.y + y;
      sp.set([x, yy, z, x, yy + len, z], i * 6);
      const k = vis * (1 - Math.abs(y) / 40);
      const cr = heat > wisp ? [1.4 * k, 0.6 * k, 0.2 * k] : [0.6 * k, 0.62 * k, 0.65 * k];
      sc.set([cr[0], cr[1], cr[2], 0, 0, 0], i * 6);
    }
    (this.streaks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.streaks.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    // the world: smoke, strobe, clouds drifting
    this.smokeU.uT.value = this.t;
    (this.strobe.material as THREE.MeshBasicMaterial).color.setScalar(Math.sin(this.t * 6) > 0.85 ? 3 : 0.0);
    this.strobe.scale.setScalar(1 + clamp(A / 250, 0, 10));
    for (const L of this.clouds) for (const u of L.u) { u.uT.value = this.t; (u.uCam.value as V).copy(this.cam.position); }
    // sky, fog and light by altitude
    const altK = sm(250, 2200, A);
    this.skyU.uAlt.value = altK;
    this.skyU.uDip.value = Math.sin(Math.sqrt((2 * Math.max(0, this.cam.position.y)) / RP));
    let white = 0; for (const L of this.clouds) white = Math.max(white, (1 - sm(4, 34, Math.abs(this.cam.position.y - L.y))) * clamp(L.cover * 1.3, 0, 1));
    this.skyU.uWhite.value = white;
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.skyU.uHor.value as THREE.Color).lerp(new THREE.Color(0xd4d8dc), white);
    fog.near = lerp(260 + A * 0.5, 4, white); fog.far = lerp(5500 + A * 5, 90, white);
    (this.scene.background as THREE.Color).copy(fog.color).multiplyScalar(1 - altK * 0.9);
    // the sun's shadow box follows the pod low down
    this.sun.position.copy(this.skyU.uSun.value as V).multiplyScalar(220).add(P); this.sun.target.position.copy(P);
    this.sun.castShadow = A < 260;
  }
  private camera(dt: number) {
    const cam = this.cam, P = this.pod.root.position, A = this.alt;
    // the chase rig: high and behind on the way down, closing in and coming level near the ground
    const low = sm(320, 30, A);
    const back = lerp(12, 13, low), up = lerp(30, 5.5, low);
    const vx = this.v.x * 0.35, vz = this.v.y * 0.35;
    const want = _v.set(P.x - this.F.x * back - vx * 0.2, P.y + up, P.z - this.F.y * back - vz * 0.2);
    const look = _v2.set(P.x + this.F.x * lerp(6, 18, low) + vx, P.y - lerp(40, 4, low), P.z + this.F.y * lerp(6, 18, low) + vz);
    if (!this.chase.init) { this.chase.pos.copy(want); this.chase.look.copy(look); this.chase.init = true; }
    this.chase.pos.lerp(want, 1 - Math.exp(-dt * 5)); this.chase.look.lerp(look, 1 - Math.exp(-dt * 3.2));
    // never below the ground
    this.chase.pos.y = Math.max(this.chase.pos.y, this.gH(this.chase.pos.x, this.chase.pos.z) + 2);
    let fov = lerp(60, 48, low);
    cam.position.copy(this.chase.pos); cam.up.set(0, 1, 0); cam.lookAt(this.chase.look);
    // a cut overrides it; a blend eases back out
    if (this.shot) {
      const sp = new V3(), sl = new V3();
      fov = this.shotPose(sp, sl) ?? fov;
      cam.position.copy(sp); cam.lookAt(sl);
    } else if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / 0.8);
      const e = ease.inOut(this.blendT);
      cam.position.lerpVectors(this.blendFrom.pos, cam.position, e);
      cam.quaternion.slerpQuaternions(this.blendFrom.q, cam.quaternion, e);
      fov = lerp(this.blendFrom.fov, fov, e);
    }
    // shake: rotation jitter, scaled by buffet and kicks
    const s = (this.shakeK * 0.012 + this.kick * 0.01) * (settings.shake ? 1 : 0.15);
    this.kick = Math.max(0, this.kick - dt * 3);
    if (s > 0.0005) cam.rotateX((Math.random() - 0.5) * s), cam.rotateY((Math.random() - 0.5) * s), cam.rotateZ((Math.random() - 0.5) * s * 0.6);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    this.sky.position.copy(cam.position);
  }
  render(post: Post, t: number) {
    resetGrade(post.grade);
    const g = post.grade, heat = this.plasmaU[0]?.uK.value ?? 0;
    g.bloom = 0.42 + heat * 0.3; g.vig = 0.42; g.sat = 1.02;
    g.gain.setRGB(1.1 + heat * 0.08, 1.07, 1.02 - heat * 0.05);
    post.render(this.scene, this.cam, this.fxScene, t);
  }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  /** the landing as it stands (for a skip): put the pod down at once */
  finishNow(): DescentResult {
    if (!this.result) {
      const rx = this.lz.x, rz = this.lz.z;
      this.result = { x: rx, z: rz, dist: 0, grade: 'AUTOPILOT', auto: true, water: false };
    }
    return this.result;
  }
  dispose() {
    for (const f of this.off.splice(0)) f();
    for (const l of this.loops) l.stop(0.2);
    this.hud.remove();
    this.bin.dispose();
    this.scene.clear(); this.fxScene.clear();
  }
}

/** merge plain geometries (position + normal + uv) into one */
function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array as Float32Array, o * 3); nrm.set(g.attributes.normal.array as Float32Array, o * 3); o += g.attributes.position.count; }
  parts.forEach((g, i) => { if (g !== list[i]) g.dispose(); });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
