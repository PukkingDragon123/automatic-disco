// The planet from orbit, and where on it to fall: one seamless 3D scene, no panels.
//   ORBIT   the world turning in deep space, its cloud decks drifting, the U.S.S. VANGUARD holding station in the
//           foreground. Drag turns the planet, the wheel or a pinch zooms. Hovering a region lights its border; a
//           floating pixel label names it (biome, danger, who holds it). Held and burnt regions show on the globe.
//   DIVE    click a region: the globe turns it to face you and the camera falls toward it, into the cloud deck...
//   SURVEY  ...and out under it, above the region itself: the real Region the game will generate, in its landscape.
//           A phosphor scan sweeps out from the middle, laying a survey grid and contour lines over the ground,
//           and every find pops up as a tiny pixel-art marker with its label as the sweep passes it: ore and
//           crystal seams, open water, rivers, steep ground, dense woods, herds and predator sign, hostile creep
//           and enemy bases (when the game knows of any), the recommended LZ.
//   CHOOSE  click the ground to set the drop point: painted rings, the landing ellipse, a beacon, a verdict and the
//           LAUNCH plate. Launch goes straight into the carrier's launch and the controllable descent.
//   Esc, right-click or the ORBIT tag backs out (from orbit: back to the menu). Touch: drag, pinch, tap.
import * as THREE from 'three';
import type { Screen } from '../app/engine';
import { type Post, resetGrade } from '../gfx/post';
import { sfx } from '../audio/audio';
import { csfx } from './cineAudio';
import { makeGlobe, makeSpace, type Globe } from './globe';
import { buildCarrier, type Carrier } from './deployShip';
import { type Planet, type PRegion, owned } from '../world/planet';
import { Region, BIOMES } from '../world/region';
import { planetPalette, RIVALS } from '../world/palette';
import { RAMPS } from '../art/palette';
import { Pix } from './machine';
import { Bin, fxMat, mesh, V3, sm, ease, hash, type V } from './deployKit';
import { makeWorld, buildGround, makeSky, skyAt, dropMarks, assessLZ, slopeAt, type World, type Sky, type LZInfo } from '../game/descentWorld';
import { clamp, lerp, damp } from '../core/rand';
import { gbuf } from '../gfx/gbuf';
import { factionsForRegion } from '../game/factions/plan';

/** an enemy presence inside a region, when the game knows of one (factions): drawn as a scan marker */
export interface Intel { kind: 'soviet' | 'prc' | 'camp' | 'rival'; x: number; z: number; label: string }
export interface PlanetOpts {
  /** the region and the drop point chosen from orbit (region coordinates), and the Region already generated */
  onLand: (r: PRegion, lz?: { x: number; z: number }, region?: Region) => void;
  onBack: () => void;
  canLand: (r: PRegion) => string | null;
  note?: string;
  /** enemy bases / camps in a region (default: the factions' own plan, game/factions/plan.ts, the same sites the
   *  region screen will build them on) */
  intel?: (r: PRegion) => Intel[];
}

const R = 900;
const SUN = new V3(-0.55, 0.35, 0.76).normalize();
const P = RAMPS;
const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

// ------------------------------------------------------------------ pixel-art marker icons (12 x 12, master palette)
type Kind = 'ore' | 'crystal' | 'water' | 'river' | 'steep' | 'woods' | 'herd' | 'predator' | 'rival' | 'soviet' | 'prc' | 'camp' | 'lz';
const ICON_CACHE = new Map<Kind, string>();
function star(p: Pix, cx: number, cy: number, r0: number, r1: number, c: number) {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? r1 : r0; pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    let ins = false;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) { const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1]; if ((yi > y + 0.5) !== (yj > y + 0.5) && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) ins = !ins; }
    if (ins) p.set(x, y, c);
  }
}
function iconURL(k: Kind): string {
  const hit = ICON_CACHE.get(k); if (hit) return hit;
  const p = new Pix(12, 12), ink = P.ink[0];
  const rim = () => { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (!p.a(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => p.a(x + dx, y + dy) > 200 && p.get(x + dx, y + dy) !== ink)) p.set(x, y, ink); };
  switch (k) {
    case 'ore': { for (let y = 3; y < 10; y++) for (let x = 6 - (y - 3) * 0.8; x <= 5 + (y - 3) * 0.8; x++) p.set(x, y, P.rust[3 + (x < 6 ? 0 : 1)]); p.hl(2, 9, 9, P.rust[2]); p.set(5, 5, P.brass[5]); p.set(6, 7, P.brass[5]); break; }
    case 'crystal': { for (let y = 1; y < 11; y++) { const w = y < 5 ? y - 1 : 10 - y; for (let x = 6 - w; x <= 5 + w; x++) p.set(x, y, P.glowTeal[x < 6 ? 2 : 3]); } p.vl(6, 2, 9, P.glowTeal[4]); break; }
    case 'water': for (const y of [3, 6, 9]) for (let x = 1; x < 11; x++) p.set(x, y + Math.round(Math.sin(x * 1.1) * 0.8), P.water[5]); break;
    case 'river': for (let y = 0; y < 12; y++) { const x = 6 + Math.round(Math.sin(y * 0.7) * 2.5); p.set(x, y, P.water[6]); p.set(x - 1, y, P.water[5]); } break;
    case 'steep': { for (let y = 2; y < 11; y++) { const w = (y - 2) * 0.62; for (let x = Math.round(6 - w); x <= Math.round(5 + w); x++) p.set(x, y, P.glowAmber[3]); } p.vl(6, 4, 7, ink); p.set(6, 9, ink); p.vl(5, 4, 7, ink); p.set(5, 9, ink); break; }
    case 'woods': for (const [cx, cy] of [[4, 5], [8, 4]]) { for (let y = -3; y <= 3; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x) <= (y + 3) * 0.5) p.set(cx + x, cy + y, P.moss[3 + (x < 0 ? 0 : 1)]); p.vl(cx, cy + 4, cy + 6, P.soil[3]); } break;
    case 'herd': for (const [cx, cy] of [[3, 3], [8, 6], [4, 9]]) { p.rect(cx, cy, 2, 2, P.bone[4]); p.set(cx - 1, cy - 1, P.bone[3]); p.set(cx + 2, cy - 1, P.bone[3]); } break;
    case 'predator': for (let i = 0; i < 3; i++) for (let y = 1; y < 11; y++) p.set(3 + i * 3 + Math.round((y - 1) * 0.25), y, P.stampRed[3 - (y > 8 ? 1 : 0)]); break;
    case 'rival': { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const d = Math.hypot(x - 5.5, y - 5.5) + Math.sin(Math.atan2(y - 5.5, x - 5.5) * 5) * 0.9; if (d < 4.6) p.set(x, y, d < 2 ? P.coral[5] : P.plum[3 + (d < 3.4 ? 1 : 0)]); } break; }
    case 'soviet': star(p, 5.5, 6, 5.4, 2.2, P.stampRed[3]); p.set(5, 4, P.coral[5]); break;
    case 'prc': p.rect(0, 1, 12, 10, P.stampRed[2]); star(p, 4, 5, 3.6, 1.5, P.glowAmber[3]); p.set(9, 3, P.glowAmber[3]); p.set(10, 5, P.glowAmber[3]); p.set(10, 7, P.glowAmber[3]); p.set(9, 9, P.glowAmber[3]); break;
    case 'camp': for (let y = 3; y < 10; y++) { const w = (y - 3) * 0.8; for (let x = Math.round(6 - w); x <= Math.round(5 + w); x++) p.set(x, y, P.olive[3 + (x < 6 ? 0 : 1)]); } p.vl(6, 7, 9, ink); p.vl(5, 7, 9, ink); p.vl(6, 1, 3, P.steel[5]); p.set(7, 1, P.stampRed[3]); p.set(8, 1, P.stampRed[3]); break;
    case 'lz': for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; p.set(Math.round(5.5 + Math.cos(t) * 4.5), Math.round(5.5 + Math.sin(t) * 4.5), P.paper[4]); } p.vl(6, 0, 11, P.stampRed[3]); p.hl(0, 11, 6, P.stampRed[3]); break;
  }
  rim();
  const u = p.url(); ICON_CACHE.set(k, u); return u;
}
const KIND_COL: Record<Kind, number> = {
  ore: P.rust[6], crystal: P.glowTeal[4], water: P.water[6], river: P.water[6], steep: P.glowAmber[4], woods: P.moss[6], herd: P.bone[5], predator: P.coral[5],
  rival: P.coral[5], soviet: P.coral[5], prc: P.glowAmber[4], camp: P.olive[5], lz: P.paper[5],
};

// ------------------------------------------------------------------ CSS: floating pixel labels only
const CSS = /* css */`
.pls { position: fixed; inset: 0; z-index: 20; pointer-events: none; --u: calc(1px * var(--s, 2)); font-family: 'VT', monospace; color: #c3bdab; }
.pls .hd { position: absolute; left: calc(12 * var(--u)); top: calc(10 * var(--u)); text-shadow: 0 1px 0 #06070a, 1px 0 0 #06070a; transition: opacity 400ms; }
.pls .hd .k { font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 10px); letter-spacing: 3px; color: #7d8888; }
.pls .hd .t { font-family: 'Canned', monospace; font-size: var(--cf-sw4, 40px); line-height: 1; color: #d2cab4; margin: calc(2 * var(--u)) 0; letter-spacing: 2px; }
.pls .hd .s { font-size: var(--cf-vt1, 14px); color: #a69d88; letter-spacing: 1px; }
.pls .hint { position: absolute; left: 50%; bottom: calc(8 * var(--u)); transform: translateX(-50%); font-size: var(--cf-vt1, 14px); letter-spacing: 1px; color: rgba(194, 198, 189, 0.7); text-shadow: 0 1px 0 #06070a; white-space: nowrap; transition: opacity 400ms; }
.pls .hint b { color: #c9a464; font-weight: normal; }
.pls .lab { position: absolute; left: 0; top: 0; white-space: nowrap; font-size: var(--cf-vt1, 14px); line-height: 1; text-shadow: 0 1px 0 #06070a, 1px 0 0 #06070a, -1px 0 0 #06070a, 0 -1px 0 #06070a; transform: translate(-50%, -100%); }
.pls .rg .n { font-family: 'Superwide', monospace; font-size: var(--cf-sw2, 20px); color: #e2dbc6; letter-spacing: 2px; display: block; text-align: center; }
.pls .rg .d { display: block; text-align: center; margin-top: calc(2 * var(--u)); color: #a69d88; }
.pls .rg .w { display: block; text-align: center; margin-top: calc(2 * var(--u)); color: #a2473a; }
.pls .rg.no { animation: pls-shake 300ms steps(6); }
@keyframes pls-shake { 25% { margin-left: 4px; } 50% { margin-left: -4px; } 75% { margin-left: 2px; } }
.pls .ship { color: #8c8471; font-size: var(--cf-vt1, 14px); }
.pls .ship::before { content: ''; display: inline-block; width: calc(10 * var(--u)); height: 1px; background: #8c8471; vertical-align: middle; margin-right: calc(3 * var(--u)); }
.pls .mk { display: flex; align-items: center; gap: calc(3 * var(--u)); transform: translate(calc(-6 * var(--u)), -100%); animation: pls-pop 260ms cubic-bezier(.3,1.8,.5,1) both; }
.pls .mk img { width: calc(12 * var(--u)); height: calc(12 * var(--u)); image-rendering: pixelated; flex: none; }
.pls .mk span { color: var(--c); }
.pls .mk i { position: absolute; left: calc(6 * var(--u)); top: 100%; width: 1px; height: var(--stalk, 20px); background: var(--c); opacity: 0.6; }
@keyframes pls-pop { 0% { opacity: 0; transform: translate(calc(-6 * var(--u)), -60%) scale(0.4); } 100% { opacity: 1; transform: translate(calc(-6 * var(--u)), -100%) scale(1); } }
.pls .rt { transform: translate(calc(10 * var(--u)), -50%); display: flex; flex-direction: column; gap: calc(3 * var(--u)); }
.pls .rt .g { font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 10px); letter-spacing: 2px; color: #e2dbc6; }
.pls .rt .v { font-size: var(--cf-vt1, 14px); }
.pls .rt .v.good { color: #9cc5ae; } .pls .rt .v.warn { color: #c9a464; } .pls .rt .v.bad { color: #a2473a; }
.pls .go { pointer-events: auto; cursor: pointer; align-self: flex-start; font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 10px); letter-spacing: 2px; color: #e2dbc6; padding: calc(4 * var(--u)) calc(9 * var(--u)) calc(4 * var(--u)) calc(7 * var(--u));
  background: var(--plate) center / 100% 100% no-repeat; image-rendering: pixelated; text-shadow: 0 1px 0 #1e1012; transition: filter 120ms; }
.pls .go:hover { filter: brightness(1.18); }
.pls .go:active { transform: translateY(1px); }
.pls .back { position: absolute; left: calc(12 * var(--u)); bottom: calc(8 * var(--u)); pointer-events: auto; cursor: pointer; font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 10px); letter-spacing: 2px; color: #a69d88; text-shadow: 0 1px 0 #06070a; }
.pls .back:hover { color: #e2dbc6; }
.pls .flash { position: absolute; inset: 0; background: #e2e1d8; opacity: 0; }
.pls .scanhud { position: absolute; right: calc(12 * var(--u)); top: calc(10 * var(--u)); text-align: right; font-size: var(--cf-vt1, 14px); color: #6c9e8c; text-shadow: 0 0 calc(2 * var(--u)) rgba(108, 158, 140, 0.4), 0 1px 0 #06070a; letter-spacing: 1px; line-height: 1.25; }
`;
let styled = false;
function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.id = 'planet-css'; s.textContent = CSS; document.head.appendChild(s); }
const div = (cls: string, parent: HTMLElement, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** the LAUNCH plate: oxide-red enamel, riveted, a bevel (drawn once) */
let plateURL = '';
function launchPlate() {
  if (plateURL) return plateURL;
  const W = 64, H = 16, p = new Pix(W, H), Rr = [P.stampRed[0], P.stampRed[1], P.stampRed[2], P.stampRed[3], P.coral[3]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) p.set(x, y, Rr[clamp(Math.round(2.4 + (y < 2 ? 1.4 : y > H - 3 ? -1.4 : 0) + (hash(x, y, 3) - 0.5) * 0.6 - x / W * 0.4), 0, 4)]);
  p.hl(0, W - 1, 0, P.ink[1]); p.hl(0, W - 1, H - 1, P.ink[0]); p.vl(0, 0, H - 1, P.ink[1]); p.vl(W - 1, 0, H - 1, P.ink[0]);
  for (const [x, y] of [[3, 3], [W - 4, 3], [3, H - 4], [W - 4, H - 4]]) { p.set(x, y, P.steel[5]); p.set(x + 1, y + 1, P.ink[1]); }
  plateURL = p.url(); return plateURL;
}

// ------------------------------------------------------------------ the scan overlay (on a copy of the region's ground)
const SCAN_V = `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SCAN_F = `uniform float uR, uK, uEcho, uT; uniform vec3 uCol; uniform vec2 uC; varying vec3 vW;
void main(){
  float d = length(vW.xz - uC);
  float lead = smoothstep(uR - 7.0, uR, d) * (1.0 - smoothstep(uR, uR + 0.6, d));
  float inside = step(d, uR);
  // the survey grid every 8 m and contour lines every metre, hairline at any distance
  vec2 g = abs(fract(vW.xz / 8.0 + 0.5) - 0.5) * 8.0; vec2 gw = fwidth(vW.xz) * 1.1;
  float grid = max(1.0 - smoothstep(0.0, gw.x, g.x), 1.0 - smoothstep(0.0, gw.y, g.y));
  float ch = abs(fract(vW.y + 0.5) - 0.5), cw = fwidth(vW.y) * 1.2;
  float cont = 1.0 - smoothstep(0.0, cw, ch);
  float edge = abs(max(abs(vW.x), abs(vW.z)) - 63.6); float border = 1.0 - smoothstep(0.0, fwidth(vW.x) * 2.0, edge);
  float echo = (1.0 - smoothstep(0.0, 2.5, abs(d - uEcho))) * 0.35;
  float a = lead * 1.3 + inside * (grid * 0.32 + cont * 0.16 + border * 0.7) + echo;
  a *= uK;
  a = floor(a * 6.0 + 0.5) / 6.0;
  gl_FragColor = vec4(uCol * a, 0.0);
  gNormal = vec4(0.0);
}`;
const PING_F = `uniform float uK; uniform vec3 uCol; varying vec3 vW; void main(){ gl_FragColor = vec4(uCol * uK, 0.0); gNormal = vec4(0.0); }`;
const BEAM_F = `uniform float uK; uniform vec3 uCol; varying vec3 vW; uniform float uY0; void main(){ float a = (1.0 - clamp((vW.y - uY0) / 60.0, 0.0, 1.0)) * uK; a = floor(a * 6.0) / 6.0; gl_FragColor = vec4(uCol * a, 0.0); gNormal = vec4(0.0); }`;

interface Mark { kind: Kind; x: number; z: number; label: string; d: number; el: HTMLDivElement | null; shown: boolean }
type Mode = 'orbit' | 'dive' | 'survey' | 'rise' | 'launch' | 'gone';

export class PlanetScreen implements Screen {
  // ---- orbit
  private scene = new THREE.Scene(); private fxScene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(38, 1, 0.5, 16000);
  private bin = new Bin();
  private globe: Globe; private carrier: Carrier;
  private q = new THREE.Quaternion(); private spin = new THREE.Vector2(0.0016, 0);
  private dist = 4.1 * R; private distGoal = 4.1 * R;
  // ---- the region close-up (built on the dive, freed on the way back up)
  private local: { scene: THREE.Scene; bin: Bin; W: World; sky: Sky; region: Region; pr: PRegion; sun: THREE.DirectionalLight; scan: Record<string, THREE.IUniform>; marks: Mark[]; pings: { m: THREE.Mesh; u: Record<string, THREE.IUniform>; t: number }[]; reticle: THREE.Group | null; ellipse: THREE.Group | null; beam: THREE.Mesh | null; beamU: Record<string, THREE.IUniform> | null } | null = null;
  private lcam = new THREE.PerspectiveCamera(44, 1, 0.5, 60000);
  private view = { tx: 0, tz: 4, d: 190, tx2: 0, tz2: 4, d2: 190 };
  private mode: Mode = 'orbit';
  private T = 0; private t = 0;
  private dive: { r: PRegion; from: THREE.Quaternion; to: THREE.Quaternion; d0: number; built: boolean } | null = null;
  private arrive = 0; private scanR = 0; private scanT = 0;
  private lz: LZInfo | null = null;
  // ---- input
  private hover = -1;
  private drag: { x: number; y: number; moved: boolean; btn: number } | null = null;
  private pts = new Map<number, { x: number; y: number }>(); private pinch = 0;
  // ---- DOM
  private root: HTMLDivElement; private hd: HTMLDivElement; private hint: HTMLDivElement; private rlab: HTMLDivElement; private slab: HTMLDivElement;
  private flash: HTMLDivElement; private back: HTMLDivElement; private scanHud: HTMLDivElement; private ret: HTMLDivElement;
  private white = 0; private whiteGoal = 0;
  private closed = false;

  constructor(readonly planet: Planet, readonly opts: PlanetOpts) {
    style();
    const sc = this.scene, bin = this.bin;
    sc.background = new THREE.Color(0x020306);
    const space = makeSpace({ stars: 2600, radius: 7000, sun: SUN, dust: 0, seed: planet.seed });
    sc.add(space.group); bin.adopt(space.group);
    this.globe = makeGlobe(planet, R, { orbit: true });
    this.globe.mat.uniforms.uSun.value.copy(SUN);
    sc.add(this.globe.group); bin.adopt(this.globe.group);
    this.q.setFromEuler(new THREE.Euler(0.35, -0.6, 0));
    // the carrier holding station off the planet, in the foreground (its own lights; the sun matched)
    this.carrier = buildCarrier({ people: false });
    const cg = this.carrier.group;
    cg.position.set(-205, -100, 4.1 * R - 560); cg.rotation.set(0.1, Math.PI - 0.75, 0.05);
    this.carrier.ship.sun.position.copy(SUN.clone().applyQuaternion(cg.quaternion.clone().invert())).multiplyScalar(220);
    sc.add(cg);
    // DOM: the header, hover label, the carrier's tag, hints, the white of the cloud deck
    this.root = div('pls', document.body) as HTMLDivElement;
    this.hd = div('hd', this.root);
    div('k', this.hd, 'U.S.P.C. ORBITAL SURVEY');
    div('t', this.hd, esc(planet.name.toUpperCase()));
    div('s', this.hd, esc(opts.note ?? `${owned(planet)} OF ${planet.goal} REGIONS HELD · HOLD ${planet.goal} AND THE WORLD BECOMES YOU`));
    this.rlab = div('lab rg', this.root); this.rlab.style.display = 'none';
    this.slab = div('lab ship', this.root, 'U.S.S. VANGUARD &middot; CVS-01 &middot; HOLDING ORBIT');
    this.scanHud = div('scanhud', this.root); this.scanHud.style.display = 'none';
    this.ret = div('lab rt', this.root); this.ret.style.display = 'none';
    this.hint = div('hint', this.root, '<b>DRAG</b> TO TURN THE WORLD &middot; <b>WHEEL</b> TO ZOOM &middot; <b>CLICK</b> A REGION TO SURVEY IT &middot; <b>ESC</b> BACK');
    this.back = div('back', this.root, '&#9664; MENU');
    this.back.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.goBack(); });
    this.flash = div('flash', this.root) as HTMLDivElement;
    addEventListener('pointerdown', this.onDown); addEventListener('pointermove', this.onMove); addEventListener('pointerup', this.onUp); addEventListener('pointercancel', this.onUp);
    addEventListener('wheel', this.onWheel, { passive: false }); addEventListener('keydown', this.onKey); addEventListener('contextmenu', this.onCtx);
    sfx('open');
    (window as any).__planet = this;
  }

  // ================================================================ input
  private onCanvas(e: Event) { const t = e.target as HTMLElement; return t?.tagName === 'CANVAS' || t === document.body || !!t?.closest?.('.pls') && !t?.closest?.('.go, .back'); }
  private onDown = (e: PointerEvent) => {
    if (!this.onCanvas(e) || this.closed) return;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 2) { const [a, b] = [...this.pts.values()]; this.pinch = Math.hypot(a.x - b.x, a.y - b.y); this.drag = null; return; }
    this.drag = { x: e.clientX, y: e.clientY, moved: false, btn: e.button };
  };
  private onMove = (e: PointerEvent) => {
    if (this.closed) return;
    if (this.pts.has(e.pointerId)) this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pts.size === 2 && this.pinch) {
      const [a, b] = [...this.pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), k = this.pinch / Math.max(1, d); this.pinch = d;
      this.zoom(k); return;
    }
    const d = this.drag;
    if (d) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
      if (d.moved) {
        if (this.mode === 'orbit') { this.q.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dy * 0.005, dx * 0.005, 0))); this.spin.set(dx * 0.0003, dy * 0.0003); }
        else if (this.mode === 'survey') { const k = this.view.d2 / 520; this.view.tx2 = clamp(this.view.tx2 - dx * k, -56, 56); this.view.tz2 = clamp(this.view.tz2 - dy * k * 1.3, -50, 60); }
        d.x = e.clientX; d.y = e.clientY;
      }
      return;
    }
    if (this.mode === 'orbit' && this.onCanvas(e)) this.hoverAt(e.clientX, e.clientY);
  };
  private onUp = (e: PointerEvent) => {
    this.pts.delete(e.pointerId); if (this.pts.size < 2) this.pinch = 0;
    const d = this.drag; this.drag = null;
    if (!d || d.moved || this.closed) return;
    if (d.btn === 2) { this.goBack(); return; }
    if (this.mode === 'orbit') { const i = this.pickRegion(e.clientX, e.clientY); if (i >= 0) this.choose(this.planet.regions[i]); }
    else if (this.mode === 'survey') this.pickGround(e.clientX, e.clientY);
  };
  private onWheel = (e: WheelEvent) => { if (this.closed || (e.target as HTMLElement)?.tagName !== 'CANVAS') return; e.preventDefault(); this.zoom(Math.exp(Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60 + 0.5) * 0.12)); };
  private onKey = (e: KeyboardEvent) => {
    if (this.closed) return;
    if (e.key === 'Escape') this.goBack();
    else if ((e.key === 'Enter' || e.key === ' ') && this.mode === 'survey' && this.lz?.ok) { e.preventDefault(); this.launch(); }
  };
  private onCtx = (e: Event) => { if ((e.target as HTMLElement)?.tagName === 'CANVAS') e.preventDefault(); };
  private zoom(k: number) {
    if (this.mode === 'orbit') this.distGoal = clamp(this.distGoal * k, 2.1 * R, 5.4 * R);
    else if (this.mode === 'survey') this.view.d2 = clamp(this.view.d2 * k, 70, 300);
  }
  private ray(x: number, y: number, cam: THREE.Camera) { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), cam); return rc; }
  private pickRegion(x: number, y: number) { return this.globe.pick(this.ray(x, y, this.cam).ray); }
  private hoverAt(x: number, y: number) {
    const i = this.pickRegion(x, y);
    if (i !== this.hover) { this.hover = i; if (i >= 0) sfx('hover', 1.2, 0.3); this.globe.setHover(i); this.labelRegion(i >= 0 ? this.planet.regions[i] : null); }
    document.body.style.cursor = i >= 0 ? 'pointer' : 'grab';
  }
  private labelRegion(r: PRegion | null, why?: string) {
    const L = this.rlab;
    if (!r) { L.style.display = 'none'; return; }
    const b = BIOMES[r.biome];
    const st = r.state === 'veyr' ? 'YOURS' : r.state === 'rival' ? 'HELD BY A RIVAL' : r.state === 'lost' ? 'BURNT OUT' : 'UNCLAIMED';
    L.style.display = '';
    L.innerHTML = `<span class="n">${esc(r.name.toUpperCase())}</span><span class="d">${esc(b.name.toUpperCase())} &middot; DANGER ${'&#9670;'.repeat(r.danger)}${'&#9671;'.repeat(3 - r.danger)} &middot; ${st}</span>` + (why ? `<span class="w">&#9650; ${esc(why.toUpperCase())}</span>` : '');
    L.classList.remove('no'); if (why) { void L.offsetWidth; L.classList.add('no'); }
  }

  // ================================================================ orbit -> region
  private choose(r: PRegion) {
    const why = this.opts.canLand(r);
    if (why) { sfx('deny'); this.labelRegion(r, why); return; }
    sfx('click'); csfx('relay', 0.6);
    const camDir = this.cam.position.clone().normalize();
    this.dive = { r, from: this.q.clone(), to: new THREE.Quaternion().setFromUnitVectors(new V3(...r.c), camDir), d0: this.dist, built: false };
    this.mode = 'dive'; this.T = 0;
    this.globe.setHover(r.id);
    this.hint.style.opacity = '0'; this.hd.style.opacity = '0'; this.slab.style.display = 'none'; this.rlab.style.display = 'none';
    sfx('pulse', 0.5, 0.9); csfx('whoosh', 0.9, 0.5); csfx('wind', 0.6, 0.7);
  }
  /** the region's ground, generated now (the screen is white: the hitch is hidden) */
  private buildLocal(pr: PRegion) {
    const bin = new Bin(), scene = new THREE.Scene();
    const pal = planetPalette(pr.seed, this.planet.palKey);
    const region = new Region(pr.seed, BIOMES[pr.biome], pal);
    scene.background = new THREE.Color(pal.horizon);
    scene.fog = new THREE.Fog(new THREE.Color(pal.horizon), 400, 9000);
    const W = makeWorld(region, pal, bin, scene);
    const sky = makeSky(W);
    buildGround(W);
    const sun = new THREE.DirectionalLight(new THREE.Color(pal.sun).lerp(new THREE.Color(0xfff2dc), 0.5), 3.0);
    sun.position.copy(sky.U.uSun.value as V).multiplyScalar(160); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -80; sc.right = sc.top = 80; sc.near = 10; sc.far = 400; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.08;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(new THREE.Color(pal.sky).lerp(new THREE.Color(0xb8c8d8), 0.5), new THREE.Color(pal.groundLight ?? 0x4a4030), 1.1));
    // the scan: an additive copy of the ground, a hair above it
    const scan = { uR: { value: 0 }, uK: { value: 1 }, uEcho: { value: -99 }, uT: { value: 0 }, uCol: { value: new THREE.Color(P.glowTeal[3]).multiplyScalar(1.6) }, uC: { value: new THREE.Vector2(0, 0) } };
    const sm2 = mesh(bin, W.regionMesh!.geometry.clone(), fxMat(bin, SCAN_V, SCAN_F, scan, 'add'), scene, 0, 0.06, 0, false);
    sm2.renderOrder = 4;
    this.local = { scene, bin, W, sky, region, pr, sun, scan, marks: this.findings(region, pr), pings: [], reticle: null, ellipse: null, beam: null, beamU: null };
  }
  /** what the scan will turn up, nearest first */
  private findings(Rg: Region, pr: PRegion): Mark[] {
    const N = Rg.N, out: Mark[] = [];
    const add = (kind: Kind, x: number, z: number, label: string) => out.push({ kind, x: x - N / 2, z: z - N / 2, label, d: 0, el: null, shown: false });
    for (const d of Rg.deposits) add(d.kind === 'ore' ? 'ore' : 'crystal', d.x, d.z, d.kind === 'ore' ? 'FERRITE' : 'LUMEN');
    // open water: the water cell nearest the middle of the biggest body
    let wx = 0, wz = 0, wn = 0;
    for (let z = 4; z < N - 4; z += 3) for (let x = 4; x < N - 4; x += 3) if (Rg.h[z * N + x] < Rg.water - 0.3) { wx += x; wz += z; wn++; }
    if (wn > 12) { let best = Infinity, bx = 0, bz = 0; for (let z = 4; z < N - 4; z += 2) for (let x = 4; x < N - 4; x += 2) if (Rg.h[z * N + x] < Rg.water - 0.3) { const dd = Math.hypot(x - wx / wn, z - wz / wn); if (dd < best) { best = dd; bx = x; bz = z; } } add('water', bx, bz, wn > 220 ? 'OPEN SEA' : 'POOL'); }
    for (const rv of Rg.rivers) { const p = rv[Math.floor(rv.length * 0.55)]; if (p) add('river', p.x, p.z, 'RIVER'); }
    // the steepest ground, the thickest woods
    let sx = 0, sz = 0, sb = 0, fx = 0, fz = 0, fb = 0;
    for (let z = 8; z < N - 8; z += 2) for (let x = 8; x < N - 8; x += 2) {
      if (Rg.isWater(x, z)) continue;
      const s = slopeAt(Rg, x, z); if (s > sb) { sb = s; sx = x; sz = z; }
      let f = 0; for (let dz = -3; dz <= 3; dz += 3) for (let dx = -3; dx <= 3; dx += 3) f += Rg.forest[(z + dz) * N + x + dx]; if (f > fb) { fb = f; fx = x; fz = z; }
    }
    if (sb > 0.55) add('steep', sx, sz, 'STEEP');
    if (fb > 4) add('woods', fx, fz, 'WOODS');
    // life signs: herds where the ground is fertile and open; predator sign in the dangerous regions
    const herds = 2 + Math.round(Rg.biome.fauna * 1.5);
    for (let k = 0, made = 0; k < 400 && made < herds; k++) {
      const x = 10 + hash(k, pr.seed % 997, 1) * (N - 20), z = 10 + hash(k, pr.seed % 991, 2) * (N - 20);
      if (Rg.isWater(x, z) || Rg.isSolid(x, z) || Rg.fert[Math.floor(z) * N + Math.floor(x)] < 0.35) continue;
      if (out.some((m) => Math.hypot(m.x - (x - N / 2), m.z - (z - N / 2)) < 18)) continue;
      const n = 4 + Math.floor(hash(k, 9) * 10 * Rg.biome.fauna);
      add(made === 0 && pr.danger >= 2 ? 'predator' : 'herd', x, z, made === 0 && pr.danger >= 2 ? (pr.danger === 3 ? 'PREDATOR · LARGE' : 'PREDATOR') : `HERD ×${n}`);
      made++;
    }
    // hostiles: a rival's creep when the region is held; enemy bases when the game knows of any
    if (pr.state === 'rival') { const rv = RIVALS[this.planet.seed % RIVALS.length]; add('rival', N - Rg.landing.x, N - Rg.landing.z, `CREEP · ${rv.name.toUpperCase()}`); }
    const intel: Intel[] = this.opts.intel?.(pr) ?? factionsForRegion(pr, this.planet).map((f) => ({
      kind: f.faction === 'soviet' ? 'soviet' as const : f.faction === 'prc' ? 'prc' as const : 'camp' as const, x: f.x, z: f.z,
      label: f.faction === 'expedition' ? `${f.name} · EXPEDITION (INBOUND)` : `${f.name} · ${f.faction === 'soviet' ? 'SOVIET' : 'PRC'} BASE`,
    }));
    for (const it of intel) add(it.kind, it.x, it.z, it.label.toUpperCase());
    add('lz', Rg.landing.x, Rg.landing.z, 'LZ ALPHA (REC.)');
    for (const m of out) m.d = Math.hypot(m.x, m.z);
    return out.sort((a, b) => a.d - b.d);
  }
  private pickGround(x: number, y: number) {
    const L = this.local; if (!L) return;
    const hit = this.ray(x, y, this.lcam).intersectObject(L.W.regionMesh!, false)[0];
    if (!hit) { sfx('deny', 1, 0.4); return; }
    this.setDrop(hit.point.x + L.region.N / 2, hit.point.z + L.region.N / 2);
  }
  private setDrop(rx: number, rz: number) {
    const L = this.local!; const W = L.W, N = L.region.N;
    const a = assessLZ(L.region, rx, rz);
    this.lz = a;
    for (const g of [L.reticle, L.ellipse]) if (g) { g.removeFromParent(); }
    if (L.beam) L.beam.removeFromParent();
    const at = new V3(a.x - N / 2, W.gH(a.x - N / 2, a.z - N / 2), a.z - N / 2);
    L.reticle = dropMarks(W, at, { paint: P.paper[5], red: P.stampRed[3] });
    // the landing ellipse: dashed, long along the approach (from the carrier's track, roughly east-west)
    const eg = new THREE.Group(), pos: number[] = [], seg = 64;
    for (let i = 0; i < seg; i += 2) for (const [r0, r1] of [[1, 1.04]]) {
      const P2 = (t: number, k: number) => { const x = at.x + Math.cos(t) * 26 * k, z = at.z + Math.sin(t) * 13 * k; return [x, W.gH(x, z) + 0.14, z]; };
      const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
      const A = P2(t0, r0), B = P2(t1, r0), C = P2(t0, r1), D = P2(t1, r1);
      pos.push(...A, ...C, ...B, ...B, ...C, ...D);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    mesh(L.bin, geo, L.bin.m(gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(P.glowAmber[3]).multiplyScalar(1.3), side: THREE.DoubleSide }), 32)), eg, 0, 0, 0, false);
    L.scene.add(eg); L.ellipse = eg;
    // a beacon of light standing on the point
    L.beamU = { uK: { value: 0.9 }, uCol: { value: new THREE.Color(a.ok ? P.glowAmber[4] : P.stampRed[3]).multiplyScalar(1.4) }, uY0: { value: at.y } };
    L.beam = mesh(L.bin, new THREE.CylinderGeometry(0.5, 0.5, 60, 10, 1, true), fxMat(L.bin, SCAN_V, BEAM_F, L.beamU, 'add', { side: THREE.DoubleSide }), L.scene, at.x, at.y + 30, at.z, false);
    this.ping(at.x, at.z, a.ok ? P.glowAmber[4] : P.stampRed[3]);
    csfx(a.ok ? 'thud' : 'deny', 0.6, 1.8); sfx('click', 1, 0.5); csfx('beep', 0.4, 1.4);
    const r = this.ret;
    r.style.display = '';
    r.innerHTML = `<span class="g">DROP POINT &middot; GRID ${a.grid}</span><span class="v ${a.verdict === 'SUITABLE' ? 'good' : a.verdict === 'ROUGH' ? 'warn' : 'bad'}">${a.verdict} &middot; ${esc(a.note)}${a.seam ? ` &middot; ${a.seam.kind === 'ore' ? 'FERRITE' : 'LUMEN'} ${Math.round(a.seam.dist)} M` : ''}</span>` + (a.ok ? `<span class="go" style="--plate:url(${launchPlate()})">LAUNCH &#9654;</span>` : '');
    const go = r.querySelector('.go') as HTMLElement | null;
    if (go) { go.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.launch(); }); go.addEventListener('pointerenter', () => sfx('hover', 1.2, 0.3)); }
    (r as any).__at = at;
  }
  private ping(x: number, z: number, col: number) {
    const L = this.local; if (!L) return;
    const u = { uK: { value: 1 }, uCol: { value: new THREE.Color(col).multiplyScalar(1.5) } };
    const m = mesh(L.bin, new THREE.RingGeometry(0.85, 1, 32), fxMat(L.bin, SCAN_V, PING_F, u, 'add', { side: THREE.DoubleSide }), L.scene, x, L.W.gH(x, z) + 0.4, z, false);
    m.rotation.x = -Math.PI / 2;
    L.pings.push({ m, u, t: 0 });
  }
  private launch() {
    if (this.mode !== 'survey' || !this.lz?.ok || !this.local) return;
    this.mode = 'launch'; this.T = 0;
    csfx('button', 1); csfx('relay', 0.7); csfx('swell', 0.7, 1.4); sfx('pulse', 0.4, 1);
    this.ret.style.display = 'none'; this.hint.style.opacity = '0'; this.scanHud.style.display = 'none';
    for (const m of this.local.marks) m.el?.remove();
  }
  private goBack() {
    if (this.mode === 'orbit') { this.close(() => this.opts.onBack()); return; }
    if (this.mode !== 'survey') return;
    this.mode = 'rise'; this.T = 0; csfx('whoosh', 0.7, 0.6);
    this.ret.style.display = 'none'; this.scanHud.style.display = 'none'; this.hint.style.opacity = '0';
    for (const m of this.local?.marks ?? []) { m.el?.remove(); m.el = null; }
  }
  private freeLocal() { const L = this.local; if (!L) return; L.bin.dispose(); L.scene.clear(); this.local = null; this.lz = null; }

  // ================================================================ frame
  update(dt: number) {
    this.t += dt; this.T += dt;
    this.globe.mat.uniforms.uT.value = this.t;
    this.carrier.update(dt);
    // the carrier drifts a little on station
    this.carrier.group.position.y = -100 + Math.sin(this.t * 0.21) * 3;
    this.carrier.group.rotation.z = 0.05 + Math.sin(this.t * 0.17) * 0.012;
    switch (this.mode) {
      case 'orbit': this.orbit(dt); break;
      case 'dive': this.diving(dt); break;
      case 'survey': this.survey(dt); break;
      case 'rise': this.rising(dt); break;
      case 'launch': this.launching(dt); break;
    }
    this.white = damp(this.white, this.whiteGoal, 9, dt);
    this.flash.style.opacity = (Math.round(this.white * 10) / 10).toFixed(2);
    this.place();
  }
  private orbit(dt: number) {
    if (!this.drag) { this.q.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.spin.y, this.spin.x, 0))); this.spin.x += (0.0016 - this.spin.x) * Math.min(1, dt * 0.8); this.spin.y *= 0.96; }
    this.dist = damp(this.dist, this.distGoal, 6, dt);
    this.globe.group.quaternion.copy(this.q);
    this.cam.position.set(0, R * 0.05, this.dist); this.cam.lookAt(0, 0, 0); this.cam.updateMatrixWorld();
  }
  private diving(dt: number) {
    const D = this.dive!, u = clamp(this.T / 2.6, 0, 1);
    this.q.slerpQuaternions(D.from, D.to, ease.inOut(clamp(this.T / 1.5, 0, 1)));
    this.globe.group.quaternion.copy(this.q);
    this.dist = lerp(D.d0, 1.1 * R, ease.inCubic(u));
    this.cam.position.set(0, R * 0.05 * (1 - u), this.dist); this.cam.lookAt(0, 0, 0);
    this.cam.fov = lerp(38, 50, ease.in(u)); this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld();
    this.whiteGoal = sm(1.5 * R, 1.16 * R, this.dist);
    if (u > 0.4 && Math.random() < dt * 8) csfx('wind', 0.2, 0.9);
    if (u >= 1 && this.white > 0.96) {
      if (!D.built) { D.built = true; this.buildLocal(D.r); }
      this.mode = 'survey'; this.T = 0; this.arrive = 0; this.scanR = 0; this.scanT = 0;
      this.view = { tx: 0, tz: 4, d: 1400, tx2: 0, tz2: 4, d2: 190 };
      this.whiteGoal = 0;
      this.cam.fov = 38; this.cam.updateProjectionMatrix();
      this.back.innerHTML = '&#9664; ORBIT';
      this.hint.innerHTML = '<b>CLICK</b> THE GROUND TO SET THE DROP POINT &middot; <b>DRAG</b> TO PAN &middot; <b>WHEEL</b> TO ZOOM &middot; <b>ESC</b> BACK TO ORBIT';
      this.scanHud.style.display = ''; this.scanHud.innerHTML = '';
      csfx('beepHi', 0.5, 0.8);
    }
  }
  private survey(dt: number) {
    const L = this.local!; const v = this.view;
    this.arrive = Math.min(1, this.arrive + dt / 2.6);
    // fall out of the cloud deck to the overview, then follow the pan and zoom
    v.tx = damp(v.tx, v.tx2, 7, dt); v.tz = damp(v.tz, v.tz2, 7, dt);
    v.d = this.arrive < 1 ? lerp(1400, v.d2, ease.outCubic(this.arrive)) : damp(v.d, v.d2, 7, dt);
    if (this.arrive >= 1 && this.T > 2.7 && this.hint.style.opacity === '0') this.hint.style.opacity = '1';
    const tgt = new V3(v.tx, L.W.gH(v.tx, v.tz), v.tz);
    this.lcam.position.set(v.tx + Math.sin(this.t * 0.07) * v.d * 0.04, tgt.y + v.d * 0.8, v.tz + v.d * 0.6);
    this.lcam.lookAt(tgt); this.lcam.updateMatrixWorld();
    skyAt(L.sky, L.scene, this.lcam.position.y, this.lcam.position.y);
    L.sky.mesh.position.copy(this.lcam.position);
    L.sun.target.position.copy(tgt); L.sun.position.copy(L.sky.U.uSun.value as V).multiplyScalar(160).add(tgt);
    // the scan: one full sweep on arrival, then a faint echo every few seconds
    if (this.arrive > 0.55) {
      const before = this.scanR;
      this.scanR = Math.min(115, this.scanR + dt * 34);
      if (Math.floor(before / 12) !== Math.floor(this.scanR / 12) && this.scanR < 115) csfx('tick', 0.5);
      if (before === 0) { csfx('hum', 0.6); csfx('swell', 0.4, 0.8); }
      this.scanT += dt;
      L.scan.uEcho.value = this.scanR >= 115 ? ((this.scanT * 30) % 140) : -99;
    }
    L.scan.uR.value = this.scanR; L.scan.uT.value = this.t;
    L.scan.uK.value = 0.85 + Math.sin(this.t * 3) * 0.05;
    // findings pop up as the sweep passes them
    let n = 0;
    for (const m of L.marks) {
      if (!m.shown && this.scanR >= m.d) {
        m.shown = true;
        const el = div('lab mk', this.root, `<img src="${iconURL(m.kind)}"><span>${esc(m.label)}</span><i></i>`) as HTMLDivElement;
        el.style.setProperty('--c', css(KIND_COL[m.kind]));
        if (m.kind === 'lz') { el.style.pointerEvents = 'auto'; el.style.cursor = 'pointer'; el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.setDrop(m.x + L.region.N / 2, m.z + L.region.N / 2); }); }
        m.el = el;
        this.ping(m.x, m.z, KIND_COL[m.kind]);
        csfx('beep', 0.25, m.kind === 'rival' || m.kind === 'soviet' || m.kind === 'prc' || m.kind === 'predator' ? 0.6 : 1.6);
      }
      if (m.shown) n++;
    }
    const pct = Math.round((this.scanR / 115) * 100);
    this.scanHud.innerHTML = `SURVEY SCAN ${String(pct).padStart(3, ' ')}%<br>${n} CONTACTS<br>${esc(L.pr.name.toUpperCase())} &middot; ${esc(L.region.biome.name.toUpperCase())}`;
    for (const p of L.pings) { p.t += dt; p.m.scale.setScalar(1 + p.t * 14); p.u.uK.value = Math.max(0, 1 - p.t / 0.9); if (p.t > 0.9) p.m.visible = false; }
    if (L.beamU) L.beamU.uK.value = 0.7 + Math.sin(this.t * 4) * 0.2;
  }
  private rising(dt: number) {
    const L = this.local;
    if (L) {
      const u = clamp(this.T / 1.1, 0, 1);
      this.view.d = lerp(this.view.d, 1600, ease.in(u) * 0.2 + dt * 0.5);
      this.lcam.position.y += dt * 900 * ease.in(u);
      this.lcam.lookAt(this.view.tx, 0, this.view.tz); this.lcam.updateMatrixWorld();
      skyAt(L.sky, L.scene, this.lcam.position.y, this.lcam.position.y); L.sky.mesh.position.copy(this.lcam.position);
      this.whiteGoal = sm(0.3, 1, u);
      if (u >= 1 && this.white > 0.95) {
        this.freeLocal();
        this.dist = 1.1 * R; this.distGoal = 4.1 * R; this.T = 0;
        this.whiteGoal = 0; this.mode = 'orbit';
        this.back.innerHTML = '&#9664; MENU';
        this.hd.style.opacity = '1'; this.slab.style.display = ''; this.hint.style.opacity = '1';
        this.hint.innerHTML = '<b>DRAG</b> TO TURN THE WORLD &middot; <b>WHEEL</b> TO ZOOM &middot; <b>CLICK</b> A REGION TO SURVEY IT &middot; <b>ESC</b> BACK';
        this.cam.fov = 38; this.cam.updateProjectionMatrix();
      }
    }
  }
  private launching(dt: number) {
    const L = this.local!;
    const u = clamp(this.T / 1.3, 0, 1);
    this.lcam.position.y += dt * 1400 * ease.in(u);
    this.lcam.lookAt(this.view.tx, 0, this.view.tz); this.lcam.updateMatrixWorld();
    skyAt(L.sky, L.scene, this.lcam.position.y, this.lcam.position.y); L.sky.mesh.position.copy(this.lcam.position);
    this.whiteGoal = sm(0.35, 1, u);
    if (u >= 1 && this.white > 0.95 && this.mode === 'launch') {
      this.mode = 'gone';
      const lz = { x: this.lz!.x, z: this.lz!.z }, region = L.region, pr = L.pr;
      this.close(() => this.opts.onLand(pr, lz, region));
    }
  }
  /** project the floating labels */
  private place() {
    const W = innerWidth, H = innerHeight, v = new V3();
    const at = (p: V, cam: THREE.Camera, el: HTMLElement, dy = 0) => {
      v.copy(p).project(cam);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.visibility = on ? '' : 'hidden';
      el.style.left = `${Math.round((v.x * 0.5 + 0.5) * W)}px`; el.style.top = `${Math.round((-v.y * 0.5 + 0.5) * H + dy)}px`;
      return v;
    };
    if (this.mode === 'orbit') {
      if (this.hover >= 0 && this.rlab.style.display !== 'none') {
        const r = this.planet.regions[this.hover];
        const p = this.globe.group.localToWorld(new V3(...r.c).multiplyScalar(R * 1.1));
        at(p, this.cam, this.rlab, -12);
      }
      at(this.carrier.group.localToWorld(new V3(0, 30, -10)), this.cam, this.slab);
    }
    const L = this.local;
    if (L && (this.mode === 'survey')) {
      const sScale = (Number(document.documentElement.style.getPropertyValue('--s')) || 2) / 2;
      // each label stands on a stalk over its find; labels that would overlap climb their stalks until clear
      const placed: [number, number, number, number][] = [];
      const items = L.marks.filter((m) => m.el).map((m) => {
        const g = new V3(m.x, L.W.gH(m.x, m.z), m.z), gp = g.clone().project(this.lcam);
        return { m, gx: (gp.x * 0.5 + 0.5) * W, gy: (-gp.y * 0.5 + 0.5) * H, on: gp.z < 1 && Math.abs(gp.x) < 1.1 && Math.abs(gp.y) < 1.1 };
      }).sort((a, b) => b.gy - a.gy);
      const lift = 16 * sScale, lh = 14 * sScale + 2;
      for (const it of items) {
        const el = it.m.el!; el.style.visibility = it.on ? '' : 'hidden'; if (!it.on) continue;
        const w = el.offsetWidth || 80;
        let y = it.gy - lift, x0 = it.gx - 6 * sScale;
        for (let k = 0; k < 8; k++) { const hit = placed.find(([px, py, pw, ph]) => x0 < px + pw && x0 + w > px && y > py - ph && y - lh < py); if (!hit) break; y = hit[1] - hit[3] - 1; }
        placed.push([x0, y, w, lh]);
        el.style.left = `${Math.round(it.gx)}px`; el.style.top = `${Math.round(y)}px`;
        el.style.setProperty('--stalk', `${Math.max(0, Math.round(it.gy - y))}px`);
      }
      const ra = (this.ret as any).__at as V | undefined;
      if (ra && this.ret.style.display !== 'none') at(ra.clone().setY(ra.y + 2), this.lcam, this.ret);
    }
  }
  render(post: Post, t: number) {
    resetGrade(post.grade);
    if (this.local && (this.mode === 'survey' || this.mode === 'rise' || this.mode === 'launch' || this.mode === 'gone')) {
      post.grade.bloom = 0.4; post.grade.vig = 0.4;
      post.render(this.local.scene, this.lcam, undefined, t);
    } else {
      post.grade.vig = 0.42; post.grade.bloom = 0.38; post.grade.sat = 1.0;
      post.render(this.scene, this.cam, this.fxScene, t);
    }
  }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); this.lcam.aspect = w / h; this.lcam.updateProjectionMatrix(); }
  private unbind() {
    removeEventListener('pointerdown', this.onDown); removeEventListener('pointermove', this.onMove); removeEventListener('pointerup', this.onUp); removeEventListener('pointercancel', this.onUp);
    removeEventListener('wheel', this.onWheel); removeEventListener('keydown', this.onKey); removeEventListener('contextmenu', this.onCtx);
    document.body.style.cursor = '';
  }
  private close(then: () => void) {
    if (this.closed) return; this.closed = true;
    this.unbind();
    then();
  }
  dispose() {
    if (!this.closed) { this.closed = true; this.unbind(); }
    this.root.remove();
    this.freeLocal();
    this.carrier.dispose();
    this.bin.dispose();
    this.scene.clear();
    if ((window as any).__planet === this) (window as any).__planet = null;
  }
}
