// OPERATIONS ROOM 7, U.S. Planetary Corps, 1957: a bunker of poured concrete over Hangar 2. The assembly drawing
// lies on a backlit light table in the middle; around it a wall of reel-to-reel computers and oscilloscopes, a
// teletype, a plotting board full of map pins, a radar console, the red phone, mugs and an ashtray, and caged lamps
// that sway on their cables. Through the armoured window, Unit 07 stands in its gantry between two robot arms.
// The Colonel, Dr. Calder, a radio operator and a technician work the room. Geometry, materials and most decals come
// from the gene lab's kit (labGeo / labArt); the people are LIMBOPHOBIA's researcher rigs.
import * as THREE from 'three';
import { Fx } from '../game/fx';
import { VeyrChild } from '../game/child';
import { loadLook } from '../game/babyLook';
import { calderRig } from '../game/story';
import { Researcher, researcherOutfit, type ResearcherGesture } from '../limbo/entities/researcher';
import type { Appearance } from '../limbo/entities/humanRig';
import type { AnimInput } from '../limbo/entities/humanAnim';
import { worldMaterial } from '../limbo/gfx/materials';
import { registerAllTextures } from '../limbo/gfx/textures/index';
import { GN_DECL, gbuf } from '../gfx/gbuf';
import { labTextures } from './labArt';
import { Kit, labMaterials, labMaterial, glowMaterial, type UVR } from './labGeo';
import { C } from './skillDraft';
import { SW, SH } from './skillSheet';
import { hashf } from '../limbo/core/rng';

const TAU = Math.PI * 2;
export const TOP = 0.93;
export const SHEET_W = 1.9, SHEET_H = (1.9 * SH) / SW;
type V3 = [number, number, number];

// ------------------------------------------------------------------ painted stencils and boards (my own atlas)
const AT = 1024;
const AREA: Record<string, [number, number, number, number]> = {
  ops: [0, 0, 1024, 120], hangar: [0, 120, 1024, 150], unit: [0, 270, 512, 110], plot: [0, 380, 640, 400], arrow: [512, 270, 512, 110],
  nosmoke: [640, 380, 384, 90], secret: [640, 470, 384, 90], radio: [640, 560, 384, 90], lever: [640, 650, 384, 130], tele: [0, 780, 640, 244],
};
let atlas: { tex: THREE.CanvasTexture; uv: (k: string) => UVR } | null = null;
function opsAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas'); c.width = c.height = AT;
  const g = c.getContext('2d')!;
  const stencil = (k: string, s: string, col: string, size: number, font = 'Superwide') => {
    const [x, y, w, h] = AREA[k];
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.font = `${size}px ${font}, Jersey, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col;
    g.fillText(s, x + w / 2, y + h / 2);
    // stencil bridges and overspray, then wear: punch holes so the concrete shows through
    const d = g.getImageData(x, y, w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const p = (j * w + i) * 4; if (!d.data[p + 3]) continue;
      const wear = hashf(i >> 2, j >> 2, x + y) * 0.7 + hashf(i, j, 3) * 0.4;
      d.data[p + 3] = wear > 0.86 ? 0 : 255;
      if ((i % Math.round(size * 1.1)) < 2 && hashf(Math.floor(i / size), 1, y) < 0.5) d.data[p + 3] = 0;
    }
    g.putImageData(d, x, y); g.restore();
  };
  stencil('ops', 'OPERATIONS ROOM 7  ·  U.S.P.C.', '#d9d2bf', 64);
  stencil('hangar', 'HANGAR 2', '#d9a43a', 120);
  stencil('unit', 'UNIT 07', '#d9d2bf', 78);
  stencil('arrow', 'GANTRY ▶', '#d9a43a', 64);
  // plain enamel signs (opaque)
  const sign = (k: string, bg: string, fg: string, lines: string[], size: number) => {
    const [x, y, w, h] = AREA[k]; g.fillStyle = bg; g.fillRect(x, y, w, h);
    g.strokeStyle = fg; g.lineWidth = 5; g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = fg; g.font = `${size}px Jersey, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * size * 1.05));
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(40,30,20,${hashf(i, 2, x) * 0.18})`; g.fillRect(x + hashf(i, 3, y) * w, y + hashf(i, 4, y) * h, 2 + hashf(i, 5, 1) * 5, 2); }
  };
  sign('nosmoke', '#b8382e', '#d9d2bf', ['NO SMOKING', 'NEAR THE CHARTS'], 34);
  sign('secret', '#d9d2bf', '#3b3a36', ['SECRET', 'U.S.P.C. EYES ONLY'], 34);
  sign('radio', '#3a3d40', '#d9d2bf', ['RADIO ROOM', 'SILENCE DURING TRAFFIC'], 32);
  sign('lever', '#d9a43a', '#3b3a36', ['GANTRY', 'ARMS', 'ENGAGE'], 34);
  // the plotting board: drafting paper, a coastline, grid squares, contour lines, range rings
  { const [x, y, w, h] = AREA.plot; g.fillStyle = C.draft; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(159,180,194,0.9)'; g.lineWidth = 1; for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i, y + h); g.stroke(); } for (let j = 0; j <= h; j += 32) { g.beginPath(); g.moveTo(x, y + j); g.lineTo(x + w, y + j); g.stroke(); }
    g.strokeStyle = '#3b3a36'; g.lineWidth = 2.5; g.beginPath();
    for (let i = 0; i <= 60; i++) { const t = i / 60, px = x + 40 + t * (w - 80), py = y + h * 0.55 + Math.sin(t * 9) * 30 + Math.sin(t * 23) * 12; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke();
    g.lineWidth = 1; g.strokeStyle = 'rgba(59,58,54,0.5)';
    for (let r = 1; r < 5; r++) { g.beginPath(); for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU, rr = r * 26 + Math.sin(a * 3 + r) * 6; const px = x + w * 0.3 + Math.cos(a) * rr * 1.4, py = y + h * 0.3 + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py); } g.stroke(); }
    g.strokeStyle = 'rgba(184,56,46,0.75)'; g.setLineDash([6, 4]); for (let r = 1; r < 4; r++) { g.beginPath(); g.arc(x + w * 0.66, y + h * 0.42, r * 52, 0, TAU); g.stroke(); } g.setLineDash([]);
    g.fillStyle = '#3b3a36'; g.font = '22px VT, monospace'; g.fillText('SECTOR 7 - LANDING GRID', x + 20, y + 30); g.font = '16px VT, monospace';
    for (let i = 0; i < 10; i++) g.fillText(String.fromCharCode(65 + i), x + 8 + i * 64, y + h - 8);
  }
  // teletype roll (redrawn as it prints)
  { const [x, y, w, h] = AREA.tele; g.fillStyle = '#e4dfcc'; g.fillRect(x, y, w, h); }
  const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.magFilter = THREE.LinearFilter;
  const uv = (k: string): UVR => { const [x, y, w, h] = AREA[k]; return [(x + 0.5) / AT, (y + 0.5) / AT, (x + w - 0.5) / AT, (y + h - 0.5) / AT]; };
  return (atlas = { tex, uv });
}

// ------------------------------------------------------------------ shaders for the screens
const SCR_V = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const SCOPE_F = GN_DECL + `uniform float uT, uSeed, uWild; varying vec2 vUv;
void main(){
  vec2 G = vec2(96.0, 64.0); vec2 g = (floor(vUv * G) + 0.5) / G; float x = g.x * 6.2831;
  float w = sin(x * (2.0 + uSeed) + uT * 2.4) * 0.22 * (1.0 + uWild) + sin(x * 9.0 + uT * 7.0 + uSeed * 4.0) * 0.05 * (1.0 + uWild * 4.0);
  float line = smoothstep(1.6 / G.y, 0.0, abs(g.y - 0.5 - w));
  float grid = (mod(floor(vUv.x * G.x), 12.0) < 0.5 || mod(floor(vUv.y * G.y), 8.0) < 0.5) ? 0.12 : 0.0;
  vec2 q = vUv - 0.5; float vig = 1.0 - dot(q, q) * 1.8;
  vec3 c = vec3(0.42, 0.85, 0.5) * (line * 1.6 + grid + 0.05) * vig;
  gl_FragColor = vec4(c, 1.0); gNormal = vec4(0.5, 0.5, 1.0, 33.0);
}`;
const RADAR_F = GN_DECL + `uniform float uT; varying vec2 vUv;
void main(){
  vec2 q = vUv * 2.0 - 1.0; float r = length(q); if (r > 1.0) discard;
  float a = atan(q.y, q.x); float sw = mod(uT * 1.3, 6.2831);
  float d = mod(sw - a + 6.2831, 6.2831);
  float beam = exp(-d * 2.4) * step(r, 0.98);
  float rings = step(abs(fract(r * 4.0) - 0.5), 0.02) * 0.25 + step(abs(q.x), 0.004) * 0.2 + step(abs(q.y), 0.004) * 0.2;
  float blip = 0.0;
  for (int i = 0; i < 4; i++) { float fi = float(i); vec2 p = vec2(cos(fi * 2.1 + 0.6), sin(fi * 2.1 + 0.6)) * (0.3 + fi * 0.15); float ba = atan(p.y, p.x); float age = mod(sw - ba + 6.2831, 6.2831); blip += smoothstep(0.05, 0.0, length(q - p)) * exp(-age * 0.7); }
  vec3 c = vec3(0.45, 0.85, 0.55) * (beam * 0.9 + rings + blip * 1.6 + 0.04) * (1.0 - r * 0.35);
  gl_FragColor = vec4(c, 1.0); gNormal = vec4(0.5, 0.5, 1.0, 33.0);
}`;
const PULSE_F = GN_DECL + `uniform float uK; uniform vec3 uCol; varying vec2 vUv;
void main(){ vec2 q = vUv * 2.0 - 1.0; float r = length(q); float ring = smoothstep(0.16, 0.0, abs(r - 0.8)); float a = ring * uK; gl_FragColor = vec4(uCol * a * 1.6, a); gNormal = vec4(0.0); }`;

// ------------------------------------------------------------------ the people
interface Op { rig: Researcher; name: string; home: THREE.Vector3; yaw: number; work: string; t: number; act: string; actT: number; actDur: number; look: THREE.Vector3 | null; pitch: number }
const COLONEL: Appearance = { skin: 0xd8ae8a, hair: 0x8a8478, hairStyle: 'short', face: 1, build: 'broad', height: 1.04, bodyShape: 0.2, eyeColor: 0x4a5a6a, facialHair: 'moustache', freckles: 0, scars: 0, age: 0.75, jaw: 3, eyeShape: 0, brows: 3, nose: 3, mouth: 2, ears: 2 } as unknown as Appearance;
const RADIO: Appearance = { skin: 0xb88660, hair: 0x2a1a10, hairStyle: 'short', face: 3, build: 'slim', height: 1.0, bodyShape: 0, eyeColor: 0x3a2a1a, facialHair: 'none', freckles: 0.1, scars: 0, age: 0.12, jaw: 2, eyeShape: 1, brows: 2, nose: 2, mouth: 2, ears: 1 } as unknown as Appearance;
const TECH: Appearance = { skin: 0x7a5034, hair: 0x120c08, hairStyle: 'buzz', face: 2, build: 'average', height: 1.02, bodyShape: 0.1, eyeColor: 0x2a1a10, facialHair: 'stubble', freckles: 0, scars: 0, age: 0.3, jaw: 3, eyeShape: 0, brows: 2, nose: 3, mouth: 1, ears: 2 } as unknown as Appearance;
const wm = () => worldMaterial({ noVis: true, noFog: true, noGrid: true });

class RobotArm {
  readonly root = new THREE.Group(); readonly a = new THREE.Group(); readonly b = new THREE.Group(); readonly tip = new THREE.Object3D();
  k = 0; goal = 0; t = Math.random() * 10;
  constructor(M: Record<string, THREE.Material>, readonly side: number) {
    const base = new Kit(); base.cyl(0, -0.3, 0, 0.32, 0.3, 14, 'haz').cyl(0, 0, 0, 0.22, 0.25, 12, 'gun');
    this.root.add(base.build(M));
    const up = new Kit(); up.box(0, 0, 0, 0.22, 1.7, 0.22, 'cream').cyl(0, 1.6, 0, 0.16, 0.12, 10, 'gun');
    this.a.add(up.build(M)); this.a.position.y = 0.25; this.root.add(this.a);
    const fo = new Kit(); fo.box(0, 0, 0, 0.16, 1.5, 0.16, 'cream').box(0, 1.45, 0, 0.26, 0.12, 0.26, 'gun').cyl(0, 1.57, 0, 0.05, 0.18, 8, 'copper');
    this.b.add(fo.build(M)); this.b.position.y = 1.65; this.a.add(this.b);
    this.tip.position.y = 1.78; this.b.add(this.tip);
  }
  update(dt: number) {
    this.t += dt; this.k += (this.goal - this.k) * Math.min(1, dt * 3);
    const s = this.side, k = this.k;
    this.root.rotation.y = s * (0.15 + k * 0.55) + Math.sin(this.t * 0.4) * 0.03;
    this.a.rotation.z = s * (0.25 + k * 0.55) + Math.sin(this.t * 0.7) * 0.02;
    this.b.rotation.z = s * (0.9 - k * 0.2) + Math.sin(this.t * 0.9 + 1) * 0.04 + (k > 0.6 ? Math.sin(this.t * 17) * 0.03 : 0);
  }
}

export class OpsRoom {
  readonly scene = new THREE.Scene(); readonly fxs = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.05, 90);
  readonly fx: Fx; readonly M: Record<string, THREE.Material>;
  readonly sheet: THREE.Mesh; readonly ov: THREE.Mesh; readonly sheetTex: THREE.CanvasTexture; readonly ovTex: THREE.CanvasTexture;
  readonly card: THREE.Group; readonly cardTex: THREE.CanvasTexture; readonly cardHome = new THREE.Vector3();
  readonly stamp = new THREE.Group(); readonly stampHome = new THREE.Vector3(1.13, TOP + 0.045, 0.3); readonly stampHead = new THREE.Group();
  readonly eraser = new THREE.Group(); readonly eraserHome = new THREE.Vector3(1.12, TOP, -0.06);
  readonly phone = new THREE.Group(); private handset = new THREE.Group();
  readonly golem: VeyrChild; readonly golemAt = new THREE.Vector3(0, -1.2, -9.4);
  readonly arms: RobotArm[] = [];
  readonly ops: Op[] = [];
  readonly lever = new THREE.Group(); leverK = 0; leverGoal = 0;
  private lamps: { g: THREE.Object3D; light: THREE.PointLight; ph: number; amp: number; base: number; bulb: THREE.Mesh }[] = [];
  private reels: { m: THREE.Object3D; w: number }[] = [];
  private screens: { uT: { value: number }; uWild?: { value: number } }[] = [];
  private pulses: THREE.Mesh[] = []; private pulseMat: THREE.ShaderMaterial[] = [];
  private tele: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; lines: string[]; feed: number; mesh: THREE.Mesh };
  private flood: THREE.SpotLight;
  wild = 0;
  t = 0;

  constructor(sheetCanvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement, cardCanvas: HTMLCanvasElement) {
    registerAllTextures();
    this.M = labMaterials(labTextures());
    const A = opsAtlas();
    this.M.ops = labMaterial(A.tex, 'ops', { side: THREE.DoubleSide });
    this.fx = new Fx(this.fxs, this.scene);
    this.scene.background = new THREE.Color(0x07090a);
    this.scene.fog = null;
    // ---- the drawing, its overlay, the card
    this.sheetTex = new THREE.CanvasTexture(sheetCanvas); this.sheetTex.colorSpace = THREE.SRGBColorSpace; this.sheetTex.anisotropy = 16; this.sheetTex.generateMipmaps = true; this.sheetTex.minFilter = THREE.LinearMipmapLinearFilter;
    const sm = new THREE.MeshLambertMaterial({ map: this.sheetTex, emissive: 0xffffff, emissiveMap: this.sheetTex, emissiveIntensity: 0.3 }); gbuf(sm, 0);
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(SHEET_W, SHEET_H), sm); this.sheet.rotation.x = -Math.PI / 2; this.sheet.position.set(0, TOP + 0.003, 0); this.sheet.receiveShadow = true; this.scene.add(this.sheet);
    this.ovTex = new THREE.CanvasTexture(overlayCanvas); this.ovTex.colorSpace = THREE.SRGBColorSpace; this.ovTex.anisotropy = 8;
    const om = new THREE.MeshBasicMaterial({ map: this.ovTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }); gbuf(om, 0);
    this.ov = new THREE.Mesh(new THREE.PlaneGeometry(SHEET_W, SHEET_H), om); this.ov.rotation.x = -Math.PI / 2; this.ov.position.set(0, TOP + 0.005, 0); this.ov.visible = false; this.ov.renderOrder = 2; this.scene.add(this.ov);
    this.cardTex = new THREE.CanvasTexture(cardCanvas); this.cardTex.colorSpace = THREE.SRGBColorSpace; this.cardTex.anisotropy = 16;
    this.card = this.buildCard();
    const pg = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 48; i++) {
      const pm = new THREE.ShaderMaterial({ uniforms: { uK: { value: 0 }, uCol: { value: new THREE.Color(0xe8eef0) } }, vertexShader: SCR_V, fragmentShader: PULSE_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(pg, pm); m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 3; this.scene.add(m); this.pulses.push(m); this.pulseMat.push(pm);
    }
    // ---- the room
    this.lights();
    this.room();
    this.table();
    this.computers();
    this.plotting();
    this.radarDesk();
    this.windowAndHangar();
    this.tele = this.teletype();
    this.flood = this.scene.getObjectByName('flood') as THREE.SpotLight;
    this.golem = new VeyrChild(this.fx, 3.1, loadLook(), { grown: true, parts: [] });
    this.golem.hatch = 1; this.golem.root.position.copy(this.golemAt); this.golem.look.set(0, 3, 0);
    this.scene.add(this.golem.root);
    this.people();
  }

  // ---------------------------------------------------------------------------------------------- lights
  private lights() {
    this.scene.add(new THREE.HemisphereLight(0x9aacc0, 0x3a342c, 0.95));
    const key = new THREE.SpotLight(0xf2e6d0, 22, 9, 0.75, 0.65, 1.5);
    key.position.set(0.6, 3.25, 0.8); key.target.position.set(0, TOP, 0);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02; key.shadow.camera.near = 0.5; key.shadow.camera.far = 6;
    this.scene.add(key, key.target);
    const win = new THREE.DirectionalLight(0x7a9ab8, 0.55); win.position.set(0.5, 2, -6); this.scene.add(win);
  }
  private add(k: Kit, x = 0, y = 0, z = 0, ry = 0, parent: THREE.Object3D = this.scene, shadows = true) { const g = k.build(this.M, shadows); g.position.set(x, y, z); g.rotation.y = ry; parent.add(g); return g; }
  /** a caged work lamp on a cable; sways a little */
  private lamp(x: number, z: number, y = 2.75, col = 0xffd6a0, power = 9) {
    const pivot = new THREE.Group(); pivot.position.set(x, 3.6, z); this.scene.add(pivot);
    const k = new Kit(), L = 3.6 - y;
    k.cyl(0, -L, 0, 0.012, L, 6, 'rubber').cyl(0, -L - 0.02, 0, 0.05, 0.08, 10, 'gun').cyl(0, -L - 0.2, 0, 0.26, 0.18, 16, 'olive', { rTop: 0.06 });
    for (let i = 0; i < 3; i++) k.torus(0, -L - 0.24 - i * 0.06, 0, 0.11 - i * 0.02, 0.006, 12, 4, 'gun');
    const g = this.add(k, 0, 0, 0, 0, pivot, false);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), glowMaterial(0xffd890, 2.4)); bulb.position.y = -L - 0.27; pivot.add(bulb);
    const light = new THREE.PointLight(col, power, 7, 1.6); light.position.y = -L - 0.3; if (power > 0) pivot.add(light);
    this.lamps.push({ g: pivot, light, ph: Math.random() * 10, amp: 0.02 + Math.random() * 0.02, base: power, bulb });
    void g;
  }

  // ---------------------------------------------------------------------------------------------- the room shell
  private room() {
    const k = new Kit(), A = opsAtlas();
    const X0 = -5.6, X1 = 5.6, Z0 = -4, Z1 = 5, H = 3.6;
    k.quad('concrete', [X0, 0, Z1], [X1, 0, Z1], [X1, 0, Z0], [X0, 0, Z0], undefined, 0x6e6c66);
    k.quad('concrete', [X0, H, Z0], [X1, H, Z0], [X1, H, Z1], [X0, H, Z1], undefined, 0x7a7a7a);
    const wall = (a: V3, b: V3, col = 0xc4bcb4) => { k.quad('concrete', [a[0], 0, a[2]], [b[0], 0, b[2]], [b[0], H, b[2]], [a[0], H, a[2]], undefined, col); };
    wall([X0, 0, Z1], [X0, 0, Z0]); wall([X1, 0, Z0], [X1, 0, Z1]); wall([X1, 0, Z1], [X0, 0, Z1]);
    // back wall around the window opening
    const WX = 2.3, WY0 = 1.05, WY1 = 2.65;
    k.quad('concrete', [X0, 0, Z0], [X1, 0, Z0], [X1, WY0, Z0], [X0, WY0, Z0], undefined, 0xc4bcb4);
    k.quad('concrete', [X0, WY1, Z0], [X1, WY1, Z0], [X1, H, Z0], [X0, H, Z0], undefined, 0xc4bcb4);
    k.quad('concrete', [X0, WY0, Z0], [-WX, WY0, Z0], [-WX, WY1, Z0], [X0, WY1, Z0], undefined, 0xc4bcb4);
    k.quad('concrete', [WX, WY0, Z0], [X1, WY0, Z0], [X1, WY1, Z0], [WX, WY1, Z0], undefined, 0xc4bcb4);
    // a painted dado band and floor skirting all round
    for (const [a, b] of [[[X0, 0, Z1], [X0, 0, Z0]], [[X1, 0, Z0], [X1, 0, Z1]], [[X0, 0, Z0], [X1, 0, Z0]]] as [V3, V3][]) {
      const dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz), nx = (-dz / L) * 0.012, nz = (dx / L) * 0.012;
      k.quad('olive', [a[0] + nx, 0, a[2] + nz], [b[0] + nx, 0, b[2] + nz], [b[0] + nx, 0.95, b[2] + nz], [a[0] + nx, 0.95, a[2] + nz], undefined, 0x8a9070);
      k.quad('haz', [a[0] + nx * 1.4, 0.95, a[2] + nz * 1.4], [b[0] + nx * 1.4, 0.95, b[2] + nz * 1.4], [b[0] + nx * 1.4, 1.0, b[2] + nz * 1.4], [a[0] + nx * 1.4, 1.0, a[2] + nz * 1.4]);
    }
    // stencils
    k.push().at(0, 0, Z0 + 0.02); k.quad('ops', [-2.6, 2.86, 0], [2.6, 2.86, 0], [2.6, 3.44, 0], [-2.6, 3.44, 0], A.uv('ops')); k.pop();
    k.push().at(X1 - 0.02, 0, 0, -Math.PI / 2); k.quad('ops', [-2.8, 2.9, 0], [-0.2, 2.9, 0], [-0.2, 3.24, 0], [-2.8, 3.24, 0], A.uv('radio')); k.quad('ops', [1.6, 1.6, 0], [2.6, 1.6, 0], [2.6, 1.84, 0], [1.6, 1.84, 0], A.uv('nosmoke')); k.pop();
    k.push().at(X0 + 0.02, 0, 0, Math.PI / 2); k.quad('ops', [-1.2, 2.86, 0], [0.4, 2.86, 0], [0.4, 3.24, 0], [-1.2, 3.24, 0], A.uv('secret')); k.pop();
    // ceiling beams and a pipe run
    for (const z of [-2.6, 0, 2.6]) k.box(0, H - 0.3, z, X1 - X0, 0.3, 0.24, 'gun', { col: 0x8a8a8a });
    for (const [y, r, mat] of [[3.38, 0.06, 'copper'], [3.22, 0.045, 'olive'], [3.1, 0.08, 'cream']] as [number, number, string][]) k.tube([[X0 + 0.2, y, Z0 + 0.25], [X1 - 0.2, y, Z0 + 0.25]], r, 8, mat);
    k.push().at(X0 + 0.02, 0, 3.2, Math.PI / 2).panel(0, 1.12, 0, 1.2, 2.2, 'door').panel(0, 2.5, 0.01, 0.9, 0.22, 'signAuth').pop();
    k.push().at(X1 - 0.02, 0, 3.4, -Math.PI / 2).panel(0, 2.4, 0, 0.5, 0.5, 'clock').panel(1.0, 1.7, 0, 0.42, 0.6, 'calendar').panel(-0.8, 1.6, 0, 0.36, 0.48, 'fuse').pop();
    this.add(k);
    this.lamp(0.2, -0.9, 2.75, 0xf2dcc0, 5); this.lamp(-3.4, -1.2, 2.7, 0xf2dcc0, 5); this.lamp(3.4, -1.6, 2.7, 0xf2dcc0, 5); this.lamp(-0.4, 3.2, 2.8, 0xf2dcc0, 0);
  }

  // ---------------------------------------------------------------------------------------------- the light table and its props
  private table() {
    const k = new Kit(), W = 2.6, D = 1.5;
    k.box(0, TOP - 0.07, 0, W, 0.07, D, 'gun', { col: 0x9aa088 }).box(0, TOP - 0.11, 0, W - 0.08, 0.04, D - 0.08, 'gun', { col: 0x6a6e66 });
    k.box(0, TOP - 0.004, 0, SHEET_W + 0.14, 0.004, SHEET_H + 0.12, 'gun', { col: 0x5a5e58 });
    for (const [x, z] of [[-1.18, -0.64], [1.18, -0.64], [-1.18, 0.64], [1.18, 0.64]]) k.box(x, 0, z, 0.08, TOP - 0.11, 0.08, 'gun');
    k.box(0, 0.22, 0, W - 0.3, 0.04, D - 0.3, 'gun').box(0.7, 0.45, 0.6, 0.9, 0.36, 0.12, 'olive', { col: 0x9aa088 });
    // T-square along the near edge and a pencil, a mug, an ashtray
    k.box(-0.15, TOP, 0.67, 1.6, 0.012, 0.05, 'cream', { col: 0xe2d6b8 }).box(-0.98, TOP - 0.03, 0.7, 0.06, 0.05, 0.16, 'oak');
    k.push().at(0.72, TOP + 0.007, 0.62, 0.35, 0, Math.PI / 2).cyl(0, -0.08, 0, 0.007, 0.16, 6, 'olive', { col: 0x7a8060 }).cyl(0, 0.08, 0, 0.007, 0.018, 6, 'red', { rTop: 0.001 }).pop();
    k.cyl(-1.12, TOP, 0.52, 0.045, 0.1, 14, 'porcelain', { col: 0xe8e2d4 }).torus(-1.165, TOP + 0.05, 0.52, 0.025, 0.007, 8, 4, 'porcelain');
    k.cyl(-1.12, TOP + 0.085, 0.52, 0.04, 0.003, 14, 'oak', { col: 0x3a2418 });
    k.cyl(1.12, TOP, -0.45, 0.07, 0.025, 14, 'gun', { rTop: 0.06 }).cyl(1.12, TOP + 0.02, -0.45, 0.05, 0.004, 14, 'rubber');
    k.push().at(1.14, TOP + 0.026, -0.44, 0.6, 0, Math.PI / 2).cyl(0, -0.03, 0, 0.005, 0.06, 6, 'cream').pop();
    // the stamp pad
    k.box(1.13, TOP, 0.3, 0.17, 0.02, 0.11, 'gun').box(1.13, TOP + 0.02, 0.3, 0.15, 0.004, 0.09, 'red', { col: 0x8a2c24 });
    this.add(k);
    // the APPROVED stamp: a turned oak handle, a steel neck, the block and its rubber
    const s = new Kit();
    s.box(0, 0, 0, 0.11, 0.032, 0.065, 'oak').box(0, -0.008, 0, 0.104, 0.008, 0.058, 'red', { col: 0x6a2018 });
    s.cyl(0, 0.032, 0, 0.012, 0.05, 8, 'gun').lathe(0, 0.08, 0, [[0.016, 0], [0.026, 0.02], [0.02, 0.05], [0.032, 0.075], [0.0, 0.1]], 12, 'oak');
    this.stampHead.add(s.build(this.M)); this.stamp.add(this.stampHead); this.stamp.position.copy(this.stampHome); this.scene.add(this.stamp);
    // the eraser
    const e = new Kit(); e.cbox(0, 0, 0, 0.09, 0.024, 0.042, 0.006, 'cream', { col: 0xc89a92 }); e.box(0.015, 0.024, 0, 0.03, 0.001, 0.03, 'decal', { dec: 'tapeLabel' });
    this.eraser.add(e.build(this.M)); this.eraser.position.copy(this.eraserHome); this.eraser.rotation.y = 0.3; this.scene.add(this.eraser);
  }
  private buildCard() {
    const g = new THREE.Group();
    const k = new Kit(); k.box(0, -0.01, 0, 0.5, 0.008, 0.34, 'oak', { col: 0x9a7a54 }).box(0, -0.004, -0.158, 0.13, 0.014, 0.03, 'gun', { col: 0xb8bcc0 });
    g.add(k.build(this.M));
    const cm = new THREE.MeshLambertMaterial({ map: this.cardTex, emissive: 0xffffff, emissiveMap: this.cardTex, emissiveIntensity: 0.06 }); gbuf(cm, 1);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.2875), cm); card.rotation.x = -Math.PI / 2; card.position.y = 0.0; card.name = 'cardFace';
    g.add(card);
    this.cardHome.set(0.98, TOP + 0.055, 0.58);
    g.position.copy(this.cardHome); g.rotation.set(0.62, -0.25, 0, 'YXZ');
    this.scene.add(g);
    return g;
  }

  // ---------------------------------------------------------------------------------------------- the computer wall, scopes, teletype
  private computers() {
    const k = new Kit(), X = -5.6 + 0.35;
    for (let i = 0; i < 6; i++) {
      const z = -3.1 + i * 0.95;
      k.push().at(X, 0, z, Math.PI / 2);
      k.box(0, 0, 0, 0.88, 2.15, 0.6, i % 2 ? 'cream' : 'olive', { col: i % 2 ? 0xd0c8b0 : 0xa0a888 }).panel(0, 1.25, 0.301, 0.8, 1.6, 'reelFace').panel(0, 0.32, 0.301, 0.7, 0.24, 'blinken').panel(0, 2.03, 0.302, 0.6, 0.1, 'tapeLabel');
      k.pop();
      for (const dy of [1.62, 1.62]) void dy;
      for (const [dz, y] of [[-0.2, 1.62], [0.2, 1.62]] as [number, number][]) {
        const rk = new Kit(); rk.push().at(0, 0, 0, 0, Math.PI / 2).cyl(0, -0.012, 0, 0.15, 0.024, 18, 'gun', { capDec: 'reelDisc', a0: 0 }).pop();
        const g = rk.build(this.M); const holder = new THREE.Group(); holder.position.set(X + 0.32, y, z + dz); holder.rotation.y = Math.PI / 2; holder.add(g); this.scene.add(holder);
        this.reels.push({ m: g, w: (hashf(i, dz * 10, 3) - 0.3) * 3 });
      }
    }
    this.add(k);
    // a console of scopes in front of the computers
    const c = new Kit(); c.box(0, 0, 0, 1.8, 0.95, 0.7, 'olive', { col: 0x9aa088 }).box(0, 0.95, -0.05, 1.8, 0.5, 0.36, 'gun').panel(0, 0.6, 0.351, 1.6, 0.5, 'consoleA').panel(-0.7, 1.22, 0.131, 0.3, 0.3, 'gaugeBig').panel(0.7, 1.22, 0.131, 0.3, 0.3, 'gaugeBig');
    const cg = this.add(c, -4.4, 0, 1.6, Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const U = { uT: { value: 0 }, uSeed: { value: i * 0.7 + 0.3 }, uWild: { value: 0 } };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SCR_V, fragmentShader: SCOPE_F }));
      m.position.set(-0.35 + i * 0.35, 1.22, 0.135); cg.add(m); this.screens.push(U);
    }
  }
  private teletype() {
    const k = new Kit(); k.box(0, 0, 0, 0.7, 0.72, 0.5, 'gun').box(0, 0.72, 0, 0.62, 0.26, 0.46, 'cream', { col: 0xd8d0b8 }).box(0, 0.98, 0.04, 0.5, 0.06, 0.36, 'cream', { col: 0xc8c0a8 }).panel(0, 0.86, 0.231, 0.5, 0.12, 'keys');
    k.push().at(0, 1.07, -0.08, 0, 0, Math.PI / 2).cyl(0, -0.24, 0, 0.04, 0.48, 10, 'cream', { col: 0xe8e2d0 }).pop();
    const g = this.add(k, -4.5, 0, -0.4, Math.PI / 2);
    const A = opsAtlas(), [x, y, w, h] = AREA.tele;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const pm = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }); gbuf(pm, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.4), pm); mesh.position.set(0, 1.3, -0.06); mesh.rotation.x = -0.25; g.add(mesh);
    void A; void x; void y;
    const t = { cv, tex, lines: ['U.S.P.C. NET 7 ..... READY', 'OPS7 DE WASHINGTON QSL', 'UNIT 07 TELEMETRY NOMINAL', 'AWAIT REQUISITIONS', ''], feed: 0, mesh };
    this.drawTele(t);
    return t;
  }
  private drawTele(t: { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; lines: string[] }) {
    const g = t.cv.getContext('2d')!, W = t.cv.width, H = t.cv.height;
    g.fillStyle = '#e4dfcc'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(159,180,194,0.25)'; for (let y = 0; y < H; y += 40) g.fillRect(0, y, W, 20);
    g.font = '26px VT, monospace'; g.fillStyle = '#3b3a36';
    const L = t.lines.slice(-7);
    L.forEach((l, i) => g.fillText(l, 22, H - 18 - (L.length - 1 - i) * 32));
    t.tex.needsUpdate = true;
  }
  /** the lamps warm up as the room comes on (k 0..1), with a stutter or two */
  lampWarm(k: number) {
    for (const [i, l] of this.lamps.entries()) {
      const kk = Math.max(0, Math.min(1, k * 1.6 - i * 0.12)), flick = kk < 1 && hashf(Math.floor(k * 30), i, 5) < 0.3 ? 0.2 : 1;
      l.light.intensity = l.base * kk * flick; l.bulb.visible = kk * flick > 0.15;
    }
  }
  /** the teletype chatters out a line */
  print(line: string) { this.tele.lines.push(line); this.tele.feed = 1; this.drawTele(this.tele); }

  // ---------------------------------------------------------------------------------------------- plotting board, radar, the red phone
  private plotting() {
    const A = opsAtlas(), k = new Kit(), X = 5.6 - 0.04;
    k.push().at(X, 0, -0.6, -Math.PI / 2);
    k.box(0, 1.02, -0.03, 3.3, 1.9, 0.05, 'oak').quad('ops', [-1.6, 1.07, 0.0], [1.6, 1.07, 0.0], [1.6, 2.87, 0.0], [-1.6, 2.87, 0.0], A.uv('plot'));
    for (let i = 0; i < 22; i++) { const x = -1.45 + hashf(i, 1, 7) * 2.9, y = 1.2 + hashf(i, 2, 7) * 1.55; k.ball(x, y, 0.02, 0.018, i % 3 ? 'red' : 'cream', { segs: 6 }); }
    for (let i = 0; i < 5; i++) { const a = [-1.2 + i * 0.5, 1.5 + hashf(i, 3, 2) * 1.1, 0.025] as V3, b = [-1.0 + i * 0.45, 1.3 + hashf(i, 4, 2) * 1.2, 0.025] as V3; k.cable(a, b, 0.0, 0.003, 'red'); }
    k.pop();
    this.add(k);
  }
  private radarDesk() {
    const k = new Kit(), X = 4.95;
    k.push().at(X, 0, -1.7, -Math.PI / 2);
    k.box(0, 0, 0, 1.4, 0.9, 0.7, 'olive', { col: 0x9aa088 }).box(0, 0.9, 0.12, 1.4, 0.6, 0.46, 'gun').panel(0, 0.55, 0.351, 1.2, 0.4, 'consoleB').panel(-0.5, 1.22, 0.351, 0.24, 0.24, 'gaugeBig');
    k.cyl(0.05, 1.18, 0.36, 0.25, 0.04, 24, 'gun').pop();
    this.add(k);
    const U = { uT: { value: 0 } };
    const rm = new THREE.Mesh(new THREE.CircleGeometry(0.22, 40), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SCR_V, fragmentShader: RADAR_F }));
    rm.position.set(X - 0.36 - 0.06, 1.2, -1.7 - 0.05); rm.rotation.y = -Math.PI / 2; this.scene.add(rm); this.screens.push(U);
    // a side desk: the red phone, a mug, papers
    const d = new Kit(); d.box(0, 0, 0, 1.2, 0.76, 0.6, 'oak').box(-0.25, 0.76, 0, 0.3, 0.006, 0.4, 'cream', { col: 0xe8e2d0 }).cyl(0.4, 0.76, 0.15, 0.04, 0.09, 12, 'porcelain', { col: 0xd8d2c4 });
    d.cbox(0.15, 0.76, -0.1, 0.22, 0.08, 0.18, 0.02, 'red', { col: 0x9a2a22 }).cyl(0.15, 0.84, -0.04, 0.035, 0.01, 12, 'cream', { col: 0xe8e2d0 });
    this.add(d, 4.9, 0, 1.4, -Math.PI / 2);
    const h = new Kit(); h.box(0, 0, 0, 0.05, 0.03, 0.22, 'red', { col: 0x9a2a22 }).box(0, -0.015, -0.1, 0.06, 0.04, 0.05, 'red', { col: 0x9a2a22 }).box(0, -0.015, 0.1, 0.06, 0.04, 0.05, 'red', { col: 0x9a2a22 });
    this.handset.add(h.build(this.M)); this.handset.position.set(0, 0.87, 0); this.phone.add(this.handset);
    this.phone.position.set(4.9 + 0.1, 0, 1.4 - 0.15); this.phone.rotation.y = -Math.PI / 2; this.scene.add(this.phone);
  }

  // ---------------------------------------------------------------------------------------------- the window and Hangar 2
  private windowAndHangar() {
    const k = new Kit(), Z = -4, WX = 2.3, WY0 = 1.05, WY1 = 2.65, A = opsAtlas();
    k.box(0, WY0 - 0.12, Z + 0.06, WX * 2 + 0.3, 0.12, 0.42, 'gun').box(0, WY1, Z, WX * 2 + 0.3, 0.16, 0.3, 'gun');
    for (const x of [-WX - 0.08, WX + 0.08, -0.78, 0.78]) k.box(x, WY0, Z, x === -0.78 || x === 0.78 ? 0.08 : 0.16, WY1 - WY0, 0.26, 'gun');
    for (let x = -WX; x <= WX; x += 0.24) { k.ball(x, WY1 + 0.08, Z + 0.16, 0.014, 'gun', { segs: 5 }); k.ball(x, WY0 - 0.06, Z + 0.28, 0.014, 'gun', { segs: 5 }); }
    // the lever panel beside the window
    k.push().at(-3.0, 0, Z + 0.15).box(0, 0.9, 0, 0.5, 0.7, 0.18, 'olive', { col: 0x8a9070 }).quad('ops', [-0.22, 1.32, 0.091], [0.22, 1.32, 0.091], [0.22, 1.55, 0.091], [-0.22, 1.55, 0.091], A.uv('lever')).pop();
    this.add(k);
    const lk = new Kit(); lk.box(0, 0, 0, 0.03, 0.34, 0.03, 'gun').ball(0, 0.36, 0, 0.035, 'red');
    this.lever.add(lk.build(this.M)); this.lever.position.set(-3.0, 1.05, Z + 0.26); this.scene.add(this.lever);
    // armoured glass (a faint tint and reflection)
    const gm = new THREE.MeshBasicMaterial({ color: 0x9ab4c8, transparent: true, opacity: 0.08, depthWrite: false }); gbuf(gm, 0);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(WX * 2, WY1 - WY0), gm); glass.position.set(0, (WY0 + WY1) / 2, Z + 0.02); this.scene.add(glass);
    // Hangar 2, a level below
    const h = new Kit(), FY = -1.2, HZ0 = -16, HX = 9;
    h.quad('concrete', [-HX, FY, Z - 0.3], [HX, FY, Z - 0.3], [HX, FY, HZ0], [-HX, FY, HZ0], undefined, 0x8a8a86);
    h.quad('concrete', [-HX, FY, HZ0], [HX, FY, HZ0], [HX, 9, HZ0], [-HX, 9, HZ0], undefined, 0x8a8a86);
    h.quad('concrete', [-HX, FY, Z - 0.3], [-HX, FY, HZ0], [-HX, 9, HZ0], [-HX, 9, Z - 0.3], undefined, 0x7a7a76);
    h.quad('concrete', [HX, FY, HZ0], [HX, FY, Z - 0.3], [HX, 9, Z - 0.3], [HX, 9, HZ0], undefined, 0x7a7a76);
    h.quad('concrete', [-HX, Z * 0 + 9, Z - 0.3], [HX, 9, Z - 0.3], [HX, 9, HZ0], [-HX, 9, HZ0], undefined, 0x5a5a58);
    h.quad('concrete', [-HX, FY, Z - 0.3], [HX, FY, Z - 0.3], [HX, WY0 - 0.2, Z - 0.3], [-HX, WY0 - 0.2, Z - 0.3], undefined, 0x7a7a76);
    h.push().at(0, 0, HZ0 + 0.03); h.quad('ops', [-4.5, 5.2, 0], [4.5, 5.2, 0], [4.5, 6.6, 0], [-4.5, 6.6, 0], A.uv('hangar')); h.quad('ops', [-1.6, 3.9, 0], [1.6, 3.9, 0], [1.6, 4.6, 0], [-1.6, 4.6, 0], A.uv('unit')); h.pop();
    for (let i = 0; i < 6; i++) h.box(-7.5 + i * 3, FY, HZ0 + 0.5, 0.4, 10, 0.5, 'gun');
    // floor markings: a hazard ring round the pad
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, a2 = ((i + 0.6) / 16) * TAU, r0 = 3.2, r1 = 3.5; const p = this.golemAt; h.quad('haz', [p.x + Math.cos(a) * r0, FY + 0.01, p.z + Math.sin(a) * r0], [p.x + Math.cos(a2) * r0, FY + 0.01, p.z + Math.sin(a2) * r0], [p.x + Math.cos(a2) * r1, FY + 0.01, p.z + Math.sin(a2) * r1], [p.x + Math.cos(a) * r1, FY + 0.01, p.z + Math.sin(a) * r1]); }
    // the gantry: two lattice towers and a bridge
    for (const sx of [-1, 1]) {
      const x = this.golemAt.x + sx * 2.6, z = this.golemAt.z;
      for (const dx of [-0.35, 0.35]) for (const dz of [-0.35, 0.35]) h.box(x + dx, FY, z + dz, 0.1, 7.4, 0.1, 'haz');
      for (let y = FY + 0.6; y < FY + 7.4; y += 0.9) { h.box(x, y, z - 0.35, 0.8, 0.06, 0.06, 'gun'); h.box(x, y, z + 0.35, 0.8, 0.06, 0.06, 'gun'); h.box(x - 0.35, y, z, 0.06, 0.06, 0.8, 'gun'); h.box(x + 0.35, y, z, 0.06, 0.06, 0.8, 'gun'); }
    }
    h.box(this.golemAt.x, FY + 7.2, this.golemAt.z, 6.0, 0.4, 0.8, 'olive', { col: 0x8a9070 });
    this.add(h, 0, 0, 0, 0, this.scene, false);
    for (const sx of [-1, 1]) { const arm = new RobotArm(this.M, sx); arm.root.position.set(this.golemAt.x + sx * 2.6, FY + 2.2, this.golemAt.z + 0.5); arm.root.rotation.y = sx * 0.2; this.scene.add(arm.root); this.arms.push(arm); }
    const fl = new THREE.SpotLight(0xb8d0e8, 160, 22, 0.55, 0.5, 1.4); fl.name = 'flood'; fl.position.set(0, 8, -5.5); fl.target.position.copy(this.golemAt).add(new THREE.Vector3(0, 2, 0)); this.scene.add(fl, fl.target);
    const fl2 = new THREE.PointLight(0xd9a43a, 14, 9, 1.6); fl2.position.set(-4, 2, -12); this.scene.add(fl2);
  }

  // ---------------------------------------------------------------------------------------------- the people
  private people() {
    const mk = (app: Appearance, name: string, outfit: Parameters<Researcher['setOutfit']>[0], badge: number[]) => {
      const r = new Researcher(app, wm()); (r as any).ggOverrides = { badge: { col: badge, name } }; r.setOutfit(outfit); r.skin.castShadow = true; r.setExpression('neutral'); return r;
    };
    const colonel = mk(COLONEL, 'Col. Whitlock', {
      torso: { tex: 'c_uniform', color: 0x5a5e44, sleeve: 'long' }, legs: { tex: 'c_slacks', color: 0x55583e }, legsKind: 'pants',
      feet: { tex: 'c_shoes_dress', color: 0x1e1a16, item: 'dress_shoes' }, head: { tex: 'c_hat_cap', color: 0x4e5238, hat: 'cap' },
    } as any, [90, 96, 60]);
    const radio = mk(RADIO, 'Sgt. Ruiz', {
      torso: { tex: 'c_shirt_button', color: 0xa89a72, sleeve: 'short' }, legs: { tex: 'c_slacks', color: 0x55583e }, legsKind: 'pants', feet: { tex: 'c_shoes_boot', color: 0x2a2018 },
    } as any, [120, 110, 70]);
    const tech = mk(TECH, 'Cpl. Okafor', {
      torso: { tex: 'c_jumpsuit', color: 0x5c6050, sleeve: 'short' }, legs: { tex: 'c_slacks', color: 0x50544a }, legsKind: 'pants', feet: { tex: 'c_shoes_boot', color: 0x2a2018 }, hands: { tex: 'c_gloves', color: 0x3a2a1c },
    } as any, [90, 96, 60]);
    const calder = calderRig();
    this.headset(radio);
    const put = (rig: Researcher, name: string, x: number, z: number, yaw: number, work: string) => { rig.root.position.set(x, 0, z); rig.root.rotation.y = yaw; this.scene.add(rig.root); this.ops.push({ rig, name, home: new THREE.Vector3(x, 0, z), yaw, work, t: 2 + Math.random() * 4, act: '', actT: 0, actDur: 99, look: null, pitch: 0 }); };
    put(colonel, 'COL. WHITLOCK', 0.35, -1.2, 0, 'clipboard');
    put(calder, 'DR. CALDER', -1.72, 0.25, Math.PI / 2, 'think');
    put(radio, 'SGT. RUIZ', 4.15, -1.7, Math.PI / 2, 'type');
    put(tech, 'CPL. OKAFOR', -3.0, -3.35, Math.PI, 'type');
    colonel.gesture('clipboard', { hold: true });
  }
  /** headphones on a sprung band, a boom mic */
  private headset(r: Researcher) {
    const h = r.j.head; if (!h) return;
    const s = (r as any).s ?? 1, k = new Kit();
    k.push().at(0, 0, 0, 0, 0, Math.PI / 2).torus(0, 0, 0, 0.1, 0.009, 14, 4, 'gun').pop();
    for (const sx of [-1, 1]) k.push().at(sx * 0.1, 0, 0, 0, 0, Math.PI / 2).cyl(0, -0.02, 0, 0.042, 0.04, 12, 'rubber').pop();
    k.tube([[-0.11, -0.02, 0.02], [-0.09, -0.07, 0.08], [-0.03, -0.09, 0.11]], 0.005, 5, 'gun');
    const g = k.build(this.M, false); g.scale.setScalar(s); g.position.set(0, 0.105 * s, 0.0); h.add(g);
  }
  /** people react to what you do */
  react(kind: 'stage' | 'deny' | 'undo' | 'confirm' | 'install' | 'phone') {
    const [col, cal, rad, tec] = this.ops;
    const G = (o: Op, g: ResearcherGesture, d = 0, at?: THREE.Vector3) => setTimeout(() => o.rig.gesture(g, at ? { at } : {}), d);
    if (kind === 'stage') { G(cal, Math.random() < 0.5 ? 'nod' : 'point', 120, new THREE.Vector3(0, TOP, 0)); }
    if (kind === 'deny') { G(col, 'shrug', 100); col.rig.setExpression('angry', 1.6); }
    if (kind === 'undo') { G(cal, 'think', 80); }
    if (kind === 'confirm') { G(col, 'nod', 200); G(rad, 'talk', 0); col.rig.setExpression('smile', 2); }
    if (kind === 'install') { tec.act = 'push'; tec.actT = 0; tec.actDur = 1.2; this.leverGoal = 1; setTimeout(() => (this.leverGoal = 0), 1400); G(cal, 'present', 600); }
    if (kind === 'phone') { G(col, 'talk', 100); }
  }
  /** a world point for a sheet coordinate */
  sheetToWorld(x: number, y: number, out = new THREE.Vector3()) { return out.set((x / SW - 0.5) * SHEET_W, TOP + 0.006, (y / SH - 0.5) * SHEET_H); }
  /** show pulsing rings at these sheet points */
  setPulses(pts: [number, number][], rSU = 15) {
    this.pulses.forEach((m, i) => { const p = pts[i]; m.visible = !!p; if (p) { this.sheetToWorld(p[0], p[1], m.position); m.position.y += 0.002; m.userData.r = (rSU / SW) * SHEET_W; m.userData.ph = i * 0.37; } });
  }
  headOf(i: number, out = new THREE.Vector3()) { const r = this.ops[i].rig; return r.j.head ? r.j.head.getWorldPosition(out).add(new THREE.Vector3(0, 0.32, 0)) : out.copy(this.ops[i].home).setY(2); }

  update(dt: number) {
    this.t += dt; const t = this.t;
    for (const l of this.lamps) { l.g.rotation.z = Math.sin(t * 0.55 + l.ph) * l.amp; l.g.rotation.x = Math.sin(t * 0.41 + l.ph * 1.3) * l.amp * 0.7; }
    for (const r of this.reels) r.m.rotation.z += dt * r.w * (1 + this.wild * 3);
    for (const s of this.screens) { s.uT.value = t; if (s.uWild) s.uWild.value = this.wild; }
    this.wild = Math.max(0, this.wild - dt * 0.4);
    this.pulses.forEach((m, i) => { if (!m.visible) return; const k = ((t * 0.9 + m.userData.ph) % 1); const r = m.userData.r * (1 + k * 0.9); m.scale.set(r * 2, r * 2, 1); this.pulseMat[i].uniforms.uK.value = (1 - k) * 0.9; });
    if (this.tele.feed > 0) { this.tele.feed = Math.max(0, this.tele.feed - dt); this.tele.mesh.position.y = 1.3 + Math.sin(t * 60) * 0.002 * this.tele.feed; }
    this.leverK += (this.leverGoal - this.leverK) * Math.min(1, dt * 6); this.lever.rotation.x = -0.5 + this.leverK * 1.0;
    this.handset.position.y = 0.87 + (this.ringing > 0 ? Math.abs(Math.sin(t * 40)) * 0.006 : 0); this.ringing = Math.max(0, this.ringing - dt);
    for (const a of this.arms) a.update(dt);
    this.golem.update(dt, this.cam);
    this.fx.update(dt, innerHeight, this.cam.fov);
    for (const o of this.ops) {
      o.t -= dt; o.actT += dt;
      if (o.t <= 0) {
        o.t = 4 + Math.random() * 6;
        if (o.work === 'type') { o.act = Math.random() < 0.75 ? 'type' : ''; o.actT = 0; o.actDur = 99; }
        else if (o.work === 'think' && Math.random() < 0.5) o.rig.gesture(Math.random() < 0.5 ? 'think' : 'clipboard');
        else if (o.work === 'clipboard' && Math.random() < 0.3) o.rig.gesture('nod');
      }
      const act = o.act && o.actT < o.actDur ? o.act : '';
      if (o.act && o.actT >= o.actDur) o.act = o.work === 'type' ? 'type' : '';
      o.rig.lookAt(o.look);
      const inp: Partial<AnimInput> = { speed: 0, stance: 'stand', full: '', action: act as any, actionT: o.actT, actionDur: o.actDur === 99 ? 1.6 : o.actDur, fidget: !act, lookYaw: 0 };
      o.rig.update(dt, inp as AnimInput);
    }
  }
  ringing = 0;
  /** put the props back and clear the moment's leftovers (the room is reused between openings) */
  reset() {
    this.stamp.position.copy(this.stampHome); this.stamp.rotation.set(0, 0, 0); this.stampHead.scale.set(1, 1, 1);
    this.eraser.position.copy(this.eraserHome); this.eraser.rotation.set(0, 0.3, 0);
    this.ov.visible = false; for (const a of this.arms) a.goal = 0; this.leverGoal = 0; this.wild = 0;
    this.card.position.copy(this.cardHome); this.card.rotation.set(0.62, -0.25, 0, 'YXZ');
    this.sheet.position.z = 0; this.ov.position.z = 0; this.sheet.rotation.z = 0;
  }
  dispose() {
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry && !(o as any).isSkinnedMesh) m.geometry.dispose(); });
    for (const o of this.ops) (o.rig as any).dispose?.();
    this.sheetTex.dispose(); this.ovTex.dispose(); this.cardTex.dispose(); this.tele.tex.dispose();
  }
}
