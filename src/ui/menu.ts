// The main menu: no title, no signs. The U.S.S. VANGUARD, the Corps' carrier, hangs in space over the target world
// with her bay doors open on the lit hangar, shuttles plying in and out, radar turning, running lights blinking;
// the camera drifts and leans after the pointer. Beside her the options float as 3D words built block by block
// from the pixel font's own glyphs (painted enamel faces, steel sides): they bob, lean in and light up when you
// point at them, and burst apart and reassemble when you work them. An apple floats by the bow. Kick it.
//   NEW WORLD    the words burst and the camera runs in at the bay mouth (the deploy sequence, src/ui/deploy*.ts,
//                does the carrier interior, the pod and the fall); the SEED field picks the world
//   CONTINUE     resume the world being taken
//   ARCHIVE      the words scatter and the worlds claimed for Earth float in
//   ASSEMBLY BAY refit Unit 07
//   SETTINGS     volume, graphics quality, UI scale, screen shake
// The ascension finale (AscendScreen) is a newsreel: the regions turn, the borders dissolve, a flag goes up.
import * as THREE from 'three';
import type { Screen } from '../app/engine';
import { type Post, resetGrade } from '../gfx/post';
import { el, ui, Tip } from './kit';
import { makeGlobe, makeSpace, stars, type Globe } from './globe';
import { makePlanet, type Planet } from '../world/planet';
import { VEYR } from '../world/palette';
import { GENE } from '../life/genes';
import { Fx } from '../game/fx';
import { Cinema } from '../game/cinema';
import { csfx, cloop, type Loop } from './cineAudio';
import { mat, tex, roundelTex, Pix } from './cineKit';
import { fontVars } from './cineUI';
import { iconURL } from './icons';
import { settings, setSettings, onSettings, resetSettings, type Quality } from '../settings';
import { RAMPS } from '../art/palette';
import { VoxelWord } from './menuText';
import { Apple } from './menuApple';
import { buildMenuCarrier, type MenuCarrier } from './menuShip';

export interface ArchiveEntry { seed: number; name: string; date: string; species: number; genes: string[]; regions: number }

const V3 = THREE.Vector3;
// flat master-palette panels: a plate is a fill, a 1 px ink line, a lit top-left edge and a shaded bottom-right
// edge (hard steps, no gradient, no texture noise) and a hard drop shadow
const CSS = /* css */`
.mn3 { position: fixed; inset: 0; pointer-events: none !important; z-index: 3; font-family: 'VT', monospace; --u: calc(1px * var(--s, 2)); }
.mn3 > * { pointer-events: auto; }
.mn3 .tag { position: absolute; left: 50%; bottom: calc(6 * var(--u)); transform: translateX(-50%); font-size: var(--cf-vt1); line-height: var(--cf-vt1); color: rgba(189, 181, 159, 0.55); letter-spacing: 1px; white-space: nowrap; pointer-events: none !important; text-shadow: 0 calc(1 * var(--u)) 0 #14161b; }
.mn3 .tag b { color: #d2cab4; font-weight: normal; }
@media (max-width: 760px), (pointer: coarse) { .mn3 .tag { display: none; } .mn3 .seed { right: 50%; transform: translateX(50%); bottom: calc(8 * var(--u)); } }
.mn3 .plt { background: #2f3023; color: #d2cab4; text-shadow: 0 1px 0 #14161b; border: 1px solid #14161b;
  box-shadow: inset calc(1 * var(--u)) calc(1 * var(--u)) 0 #585a40, inset calc(-1 * var(--u)) calc(-1 * var(--u)) 0 #1f2019, calc(3 * var(--u)) calc(3 * var(--u)) 0 rgba(20, 22, 27, 0.6); }
.mn3 .tipx { position: fixed; display: none; pointer-events: none !important; padding: calc(5 * var(--u)) calc(8 * var(--u)); max-width: calc(170 * var(--u)); animation: mn-in 160ms steps(4); }
@keyframes mn-in { 0% { transform: translateY(calc(-4 * var(--u))); opacity: 0; } 100% { transform: none; opacity: 1; } }
.mn3 .tipx .h { font-family: 'Superwide', monospace; font-size: var(--cf-sw1); line-height: calc(var(--cf-sw1) + 4px); color: #e2dbc6; }
.mn3 .tipx .h .k { float: right; margin-left: calc(8 * var(--u)); color: #1f232b; background: #d2cab4; padding: 0 calc(2 * var(--u)); text-shadow: none; font-family: 'VT', monospace; font-size: var(--cf-vt1); line-height: var(--cf-sw1); }
.mn3 .tipx .d { font-size: var(--cf-vt1); line-height: var(--cf-vt1); margin-top: calc(2 * var(--u)); color: #bdb59f; }
.mn3 .tipx .w { font-size: var(--cf-vt1); color: #c9a464; margin-top: calc(2 * var(--u)); }
.mn3 .btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: calc(3 * var(--u)); padding: calc(3 * var(--u)) calc(8 * var(--u)); cursor: pointer; font-family: 'Superwide', monospace; font-size: var(--cf-sw1); line-height: var(--cf-sw1); letter-spacing: 1px;
  background: #2f2e31; border: 1px solid #14161b; box-shadow: inset 0 1px 0 #524f4f, 0 calc(2 * var(--u)) 0 #14161b; color: #d2cab4; text-shadow: 0 1px 0 #14161b; transition: transform 60ms, box-shadow 60ms; }
.mn3 .btn:hover { color: #e2dbc6; background: #3f3d3f; }
.mn3 .btn:active { transform: translateY(calc(2 * var(--u))); box-shadow: inset 0 1px 0 #3f3d3f, 0 0 0 #14161b; }
.mn3 .btn.on { transform: translateY(calc(1 * var(--u))); box-shadow: inset 0 1px 0 #14161b, 0 calc(1 * var(--u)) 0 #14161b; color: #e2dbc6; }
.mn3 .btn.on::before { content: ''; width: calc(3 * var(--u)); height: calc(3 * var(--u)); background: #c9a464; margin-right: calc(2 * var(--u)); }
.mn3 .btn.red { background: #80332c; border-color: #3b1a18; box-shadow: inset 0 1px 0 #a2473a, 0 calc(2 * var(--u)) 0 #3b1a18; color: #e2dbc6; }
.mn3 .btn img { width: calc(18 * var(--u)); height: calc(18 * var(--u)); image-rendering: pixelated; }
.mn3 .back { position: absolute; left: calc(10 * var(--u)); bottom: calc(20 * var(--u)); display: none; }
.mn3 .plate { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: none; width: min(94vw, calc(230 * var(--u))); padding: calc(12 * var(--u)) calc(14 * var(--u)); box-sizing: border-box; animation: mn-swing 420ms cubic-bezier(.25,1.6,.45,1); }
@keyframes mn-swing { 0% { transform: translate(-50%, -58%); opacity: 0; } 100% { transform: translate(-50%, -50%); opacity: 1; } }
.mn3 .plate .hd { font-family: 'Superwide', monospace; font-size: var(--cf-sw2); line-height: var(--cf-sw2); color: #e2dbc6; letter-spacing: 3px; margin-bottom: calc(8 * var(--u)); text-align: center; }
.mn3 .plate .hd::after { content: ''; display: block; height: 1px; margin: calc(4 * var(--u)) calc(20 * var(--u)) 0; background: #707254; }
.mn3 .plate .row { display: flex; align-items: center; gap: calc(6 * var(--u)); margin: calc(4 * var(--u)) 0; }
.mn3 .plate .lb { flex: 0 0 calc(78 * var(--u)); font-family: 'Jersey', monospace; font-size: var(--cf-np1); line-height: var(--cf-np1); color: #bdb59f; letter-spacing: 1px; }
.mn3 .plate .opts { display: flex; gap: calc(2 * var(--u)); flex-wrap: wrap; }
.mn3 .plate .opts .btn { padding: calc(2 * var(--u)) calc(4 * var(--u)); }
.mn3 .plate .val { flex: 0 0 calc(22 * var(--u)); text-align: right; font-size: var(--cf-vt1); color: #d2cab4; }
.mn3 .plate input[type=range] { -webkit-appearance: none; appearance: none; flex: 1; height: calc(5 * var(--u)); background: #1f2019; border: 1px solid #14161b; box-shadow: 0 1px 0 #585a40; outline: none; margin: 0; cursor: pointer; }
.mn3 .plate input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: calc(9 * var(--u)); height: calc(13 * var(--u)); background: #3f3d3f; border: 1px solid #14161b; box-shadow: inset 1px 1px 0 #69645f, 0 calc(1 * var(--u)) 0 #14161b; }
.mn3 .plate input[type=range]::-moz-range-thumb { width: calc(9 * var(--u)); height: calc(13 * var(--u)); background: #3f3d3f; border: 1px solid #14161b; border-radius: 0; }
.mn3 .plate .foot { display: flex; justify-content: space-between; margin-top: calc(8 * var(--u)); }
.mn3 .det { left: auto; right: calc(14 * var(--u)); transform: translateY(-50%); width: min(80vw, calc(170 * var(--u))); animation: mn-swing2 360ms cubic-bezier(.25,1.6,.45,1); }
@keyframes mn-swing2 { 0% { transform: translateY(-58%); opacity: 0; } 100% { transform: translateY(-50%); opacity: 1; } }
.mn3 .det .n { font-family: 'Canned', monospace; font-size: var(--cf-sw2); line-height: var(--cf-sw2); color: #e2dbc6; }
.mn3 .det .s { font-size: var(--cf-vt1); line-height: var(--cf-vt1); margin: calc(4 * var(--u)) 0; color: #bdb59f; }
.mn3 .det .gn { display: flex; flex-wrap: wrap; gap: calc(2 * var(--u)); margin: calc(3 * var(--u)) 0 calc(6 * var(--u)); }
.mn3 .det .gn span { font-size: var(--cf-vt1); line-height: var(--cf-vt1); border: 1px solid #55595b; padding: 0 calc(2 * var(--u)); color: #bdb59f; background: #1f2019; }
.mn3 .det .btn { width: 100%; box-sizing: border-box; }
/* the seed: a small stencilled field */
.mn3 .seed { position: absolute; right: calc(10 * var(--u)); bottom: calc(18 * var(--u)); display: flex; align-items: center; gap: calc(4 * var(--u)); padding: calc(3 * var(--u)) calc(5 * var(--u)); }
.mn3 .seed .l { font-family: 'Superwide', monospace; font-size: var(--cf-sw1); color: #bdb59f; letter-spacing: 1px; }
.mn3 .seed input { width: calc(64 * var(--u)); font-family: 'Jersey', monospace; font-size: var(--cf-np1); line-height: var(--cf-np1); padding: calc(1 * var(--u)) calc(3 * var(--u)); background: #d2cab4; color: #1f232b; border: 1px solid #14161b; box-shadow: inset 1px 1px 0 #8c8471; outline: none; letter-spacing: 2px; text-transform: uppercase; border-radius: 0; }
.mn3 .seed input::placeholder { color: #8c8471; }
/* the joke */
.mn3 .crunch { position: fixed; pointer-events: none !important; font-family: 'Canned', monospace; font-size: var(--cf-sw2); color: #e2dbc6; text-shadow: calc(1 * var(--u)) calc(1 * var(--u)) 0 #14161b; transform: translate(-50%, -50%); animation: mn-crunch 1.6s steps(12) forwards; white-space: nowrap; }
@keyframes mn-crunch { 0% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; } 12% { transform: translate(-50%, -60%) scale(1); opacity: 1; } 80% { opacity: 1; } 100% { transform: translate(-50%, -140%); opacity: 0; } }
.mn3.hide > :not(.tipx) { visibility: hidden; }
/* the ascension's button */
.mn3 .big { display: flex; align-items: center; justify-content: center; gap: calc(4 * var(--u)); width: 100%; padding: calc(4 * var(--u)); background: #80332c; border: 1px solid #3b1a18; box-shadow: inset 0 1px 0 #a2473a, 0 calc(3 * var(--u)) 0 #3b1a18; color: #e2dbc6; font-family: 'Superwide', monospace; font-size: var(--cf-sw1); letter-spacing: 1px; cursor: pointer; text-shadow: 0 1px 0 #3b1a18; }
.mn3 .big:hover { background: #a2473a; }
.mn3 .big:active { transform: translateY(calc(2 * var(--u))); }
.mn3 .big img { width: calc(18 * var(--u)); height: calc(18 * var(--u)); image-rendering: pixelated; }
`;
let styled = false;
function style() {
  fontVars();
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
}

/** the carrier's placement and the light (the world is in metres; the ship is 180 m long) */
const SHIP_YAW = 0.62;                                   // her bow swings toward the camera, a little right
const SHIP_C = new V3(0, 4, -4);                         // her middle, ship-local
const VIEW = new V3(0.05, 0.2, 0.98).normalize();        // from the ship toward the camera
const SUN_L = new V3(-0.72, 0.52, 0.16).normalize();     // toward the sun, ship-local: the port side, raking
const WORD_D = 165;                                      // how far in front of the camera the words float
type Mode = 'main' | 'archive' | 'settings' | 'launch' | 'away';
interface Opt { id: string; label: string; key: string; tip: string; word: VoxelWord }

export class MenuScreen implements Screen {
  private scene = new THREE.Scene(); private fxScene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(36, 1, 1, 9000);
  private ship: MenuCarrier; private globe: Globe; private apple: Apple; private fx: Fx;
  private words: Opt[] = []; private empty: VoxelWord | null = null;
  private worlds: { g: Globe; e: ArchiveEntry; at: THREE.Vector3 }[] = [];
  private lamp: THREE.PointLight;
  private root: HTMLDivElement; private tipEl: HTMLDivElement; private backEl: HTMLDivElement; private detEl: HTMLDivElement; private setEl: HTMLDivElement; private seedIn: HTMLInputElement;
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2(); private ptrIn = false; private ptrX = 0; private ptrY = 0;
  private par = new THREE.Vector2();
  private hovered: Opt | null = null; private hoverApple = false; private hoverWorld = -1; private hoverEmpty = false;
  private mode: Mode = 'main'; private focus = -1;
  private t = 0; private archK = 0;
  private rest = { pos: new V3(), look: new V3(), fov: 36, right: new V3(), up: new V3() };
  private camPos = new V3(); private camLook = new V3(); private shipW = new V3();
  private cine: Cinema; private hum: Loop | null = null;
  private busy = false; private closed = false; private tipHtml = '';
  private downAt: { x: number; y: number } | null = null;
  private off: (() => void)[] = [];
  private bonk = 0;

  constructor(readonly opts: { hasSave: boolean; archive: ArchiveEntry[]; onNew: (seed: number) => void; onContinue: () => void; onLaunch: (e: ArchiveEntry) => void; onMirror: (back: () => void) => void }) {
    style();
    this.scene.background = new THREE.Color(0x02030a);
    this.fx = new Fx(this.fxScene, this.scene);
    // the carrier, whole, working
    this.ship = buildMenuCarrier();
    this.ship.group.rotation.y = SHIP_YAW; this.scene.add(this.ship.group);
    const sroot = this.ship.carrier.ship.root;
    this.ship.carrier.ship.sun.position.copy(SUN_L).multiplyScalar(220);
    this.ship.group.updateMatrixWorld(true);
    this.shipW.copy(SHIP_C).applyMatrix4(sroot.matrixWorld);
    // space: the galaxy band, nebulae, twinkling stars, dust drifting through the near field
    const sunW = SUN_L.clone().applyAxisAngle(new V3(0, 1, 0), SHIP_YAW);
    this.scene.add(makeSpace({ stars: 2800, radius: 4200, sun: sunW, dust: 300, dustR: [60, 420], nebula: true }).group);
    // the target world, vast, below and behind
    const planet: Planet = makePlanet(1000 + Math.floor(Math.random() * 9000));
    this.globe = makeGlobe(planet, 1500, { orbit: true });
    this.globe.group.rotation.set(0.35, 0.4, 0.2);
    // the planet keeps its own sun behind and to the right: a lit crescent and a long night side under the ship
    (this.globe.mat.uniforms.uSun?.value as THREE.Vector3 | undefined)?.set(0.62, 0.42, -0.66).normalize();
    // under the menu's grade the planet's day side and cloud tops clip to white: a menu-only exposure (own programs)
    const expose = (m: THREE.Material, k: number, key: string) => {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (sh, r) => {
        prev.call(m, sh, r);
        sh.uniforms.uMenuExp = { value: k };
        const i = sh.fragmentShader.lastIndexOf('}');
        sh.fragmentShader = 'uniform float uMenuExp;\n' + sh.fragmentShader.slice(0, i) + '  gl_FragColor.rgb *= uMenuExp;\n' + sh.fragmentShader.slice(i);
      };
      m.customProgramCacheKey = () => 'menu-exp-' + key;
      m.needsUpdate = true;
    };
    this.globe.group.traverse((o) => {
      const me = o as THREE.Mesh; if (!me.isMesh || !(me.material instanceof THREE.ShaderMaterial)) return;
      if (me === this.globe.mesh) expose(me.material, 0.55, 'ground');
      else if (/cloud/.test(me.name)) expose(me.material, 0.45, 'cloud' + me.id);
      else if (me === this.globe.atmo) expose(me.material, 0.75, 'air');
    });
    this.scene.add(this.globe.group);
    // a work lamp that swings onto whichever word you point at
    this.lamp = new THREE.PointLight(RAMPS.glowAmber[4], 0, 90, 1.6); this.scene.add(this.lamp);
    // the apple
    this.apple = new Apple(5.5); this.scene.add(this.apple.group);
    // the claimed worlds (shown in ARCHIVE)
    opts.archive.slice(-6).forEach((e) => {
      const p = makePlanet(e.seed); for (const r of p.regions) r.state = 'veyr';
      const g = makeGlobe(p, 9, { ascended: true }); g.refresh(); g.group.visible = false; this.scene.add(g.group);
      this.worlds.push({ g, e, at: new V3() });
    });
    // the overlay
    this.root = el('div', 'mn3', ui());
    el('div', 'tag', this.root, '<b>N</b> NEW WORLD · <b>C</b> CONTINUE · <b>A</b> ARCHIVE · <b>B</b> ASSEMBLY · <b>O</b> SETTINGS · <b>S</b> SEED');
    this.tipEl = el('div', 'tipx plt', this.root);
    this.backEl = el('div', 'btn back', this.root, '◀ BACK');
    this.backEl.addEventListener('click', (e) => { e.stopPropagation(); this.toMain(); });
    this.detEl = el('div', 'plate det plt', this.root);
    this.setEl = el('div', 'plate plt', this.root);
    const sd = el('div', 'seed plt', this.root); el('div', 'l', sd, 'SEED');
    this.seedIn = el('input', '', sd) as HTMLInputElement; this.seedIn.maxLength = 9; this.seedIn.placeholder = 'RANDOM'; this.seedIn.autocapitalize = 'characters'; this.seedIn.spellcheck = false;
    this.seedIn.title = 'Up to 9 letters or digits. The same seed always finds the same world.';
    this.seedIn.addEventListener('input', () => { this.seedIn.value = this.seedIn.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 9); csfx('type', 0.8); });
    this.seedIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { this.seedIn.blur(); this.work(this.words.find((w) => w.id === 'new') ?? null); } if (e.key === 'Escape') this.seedIn.blur(); });
    this.seedIn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.cine = new Cinema({});
    this.cine.ui.root.remove(); ui().appendChild(this.cine.ui.root);
    this.bindInput();
    this.hum = cloop('drone', 0.35);
    this.cine.ui.fade(1, 0); this.cine.ui.fade(0, 1.8);
    this.off.push(onSettings(() => { if (this.mode === 'settings') this.drawSettings(); }));
    this.layout();
    this.camPos.copy(this.rest.pos).addScaledVector(VIEW, 60); this.camLook.copy(this.rest.look);
    void this.buildWords();
    (window as any).__menu = this;
  }

  /** the words, once the pixel font is in (their blocks are its glyph pixels) */
  private async buildWords() {
    try { await document.fonts.load("13px 'Jersey'"); } catch { /* the fallback still makes blocks */ }
    if (this.closed) return;
    const defs: [string, string, string, string][] = [
      ['new', 'NEW WORLD', 'N', 'Fire Unit 07 at a new world.'],
      ['continue', 'CONTINUE', 'C', 'Back to the world you are taking.'],
      ['archive', 'ARCHIVE', 'A', `The worlds claimed for Earth (${this.opts.archive.length}).`],
      ['assembly', 'ASSEMBLY BAY', 'B', 'Refit Unit 07: paint, plating, lens and name.'],
      ['settings', 'SETTINGS', 'O', 'Volume, graphics quality, UI scale, screen shake.'],
    ];
    defs.forEach(([id, label, key, tip], i) => {
      const word = new VoxelWord(id, label, { enabled: id !== 'continue' || this.opts.hasSave, yaw: 0.34 - i * 0.03, phase: i * 1.37 });
      this.scene.add(word.group);
      const o: Opt = { id, label, key, tip, word };
      this.words.push(o);
    });
    if (!this.worlds.length) { this.empty = new VoxelWord('none', 'NO WORLDS CLAIMED YET', { yaw: 0, phase: 2 }); this.empty.group.visible = false; this.scene.add(this.empty.group); }
    this.layout();
    // they arrive: a burst in reverse, from scattered blocks into words
    this.words.forEach((o, i) => setTimeout(() => { if (!this.closed) { o.word.burst(0.8); csfx('tick', 0.4, 0.8 + i * 0.1); } }, 80 + i * 90));
  }

  /** frame the shot for this screen's shape: where the camera rests, where the words and the apple float */
  private layout() {
    const a = innerWidth / Math.max(1, innerHeight), r = this.rest, portrait = a < 1.05;
    r.fov = portrait ? 46 : 36;
    const tanV = Math.tan(THREE.MathUtils.degToRad(r.fov / 2));
    // distance so the ship's ~150 m of length fills the share of the width it is given
    const share = portrait ? 0.95 : 0.6, dist = 150 / share / (2 * tanV * a);
    r.look.copy(this.shipW); r.pos.copy(this.shipW).addScaledVector(VIEW, Math.max(190, dist));
    const fwd = r.look.clone().sub(r.pos).normalize();
    r.right.crossVectors(fwd, new V3(0, 1, 0)).normalize(); r.up.crossVectors(r.right, fwd).normalize();
    // slide the camera so the ship sits where it should on screen (left of centre; high up in portrait)
    const D = r.pos.distanceTo(this.shipW), hy = D * tanV, hx = hy * a;
    const sx = portrait ? 0 : -0.36, sy = portrait ? 0.42 : 0.08;
    const shift = r.right.clone().multiplyScalar(-sx * hx).addScaledVector(r.up, -sy * hy);
    r.pos.add(shift); r.look.add(shift);
    // the planet: its limb arcs across the bottom of the view (lower in portrait, under the words)
    { const D = 4200, c = THREE.MathUtils.degToRad(r.fov / 2 + (portrait ? 18 : 14)), off = portrait ? 0 : -0.12;
      this.globe.group.position.copy(r.pos).addScaledVector(fwd, Math.cos(c) * D).addScaledVector(r.up, -Math.sin(c) * D).addScaledVector(r.right, off * D); }
    // the word column, at WORD_D in front of the camera
    const wy = WORD_D * tanV, wx = wy * a;
    const colX = portrait ? 0 : 0.55, avail = portrait ? wx * 1.6 : wx * 0.66;
    const maxW = Math.max(1, ...this.words.map((o) => o.word.w));
    const size = Math.min(1.25, avail / maxW);
    const y0 = portrait ? -0.06 : 0.52, dy = portrait ? 0.17 : 0.26;
    this.words.forEach((o, i) => {
      o.word.size = size;
      o.word.home.copy(r.pos).addScaledVector(fwd, WORD_D).addScaledVector(r.right, colX * wx).addScaledVector(r.up, (y0 - i * dy) * wy);
    });
    if (this.empty) { this.empty.size = Math.min(1, (wx * 1.4) / this.empty.w); this.empty.home.copy(r.pos).addScaledVector(fwd, WORD_D).addScaledVector(r.up, -0.1 * wy); }
    // the apple floats off the bow, near the camera
    const ad = 120, ay = ad * tanV, ax = ay * a;
    this.apple.place(r.pos.clone().addScaledVector(fwd, ad).addScaledVector(r.right, (portrait ? 0.55 : 0.02) * ax).addScaledVector(r.up, (portrait ? 0.1 : -0.62) * ay));
    // the archive: the worlds in a row across the view, nearer than the ship
    const n = this.worlds.length, gd = 110, gy = gd * tanV, gx = gy * a;
    this.worlds.forEach((w, i) => {
      const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;
      w.at.copy(r.pos).addScaledVector(fwd, gd).addScaledVector(r.right, u * gx * (portrait ? 0.6 : 0.62)).addScaledVector(r.up, (Math.sin(i * 1.7) * 0.12 + (portrait ? 0.1 : 0.05)) * gy);
      w.g.group.scale.setScalar(portrait ? 0.8 : 1);
    });
  }

  /** where an option (or the apple) is on screen, in CSS pixels (test pages) */
  screenPos(id: string): [number, number] {
    const p = id === 'apple' ? this.apple.group.position.clone() : (this.words.find((o) => o.id === id)?.word.group.position.clone() ?? new V3());
    p.project(this.cam); return [Math.round((p.x * 0.5 + 0.5) * innerWidth), Math.round((-p.y * 0.5 + 0.5) * innerHeight)];
  }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const cv = document.getElementById('view') as HTMLCanvasElement;
    const setPtr = (e: PointerEvent) => { this.ptrX = e.clientX; this.ptrY = e.clientY; this.ptrIn = true; this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };
    const move = (e: PointerEvent) => setPtr(e);
    const down = (e: PointerEvent) => { if (e.target !== cv) return; setPtr(e); this.downAt = { x: e.clientX, y: e.clientY }; this.pick(); };
    const up = (e: PointerEvent) => {
      const d = this.downAt; this.downAt = null; if (!d || e.target !== cv) return;
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 18) return;
      setPtr(e); this.pick(); this.click();
      if (e.pointerType === 'touch') { this.ptrIn = false; setTimeout(() => { if (!this.downAt) this.clearHover(); }, 700); }
    };
    const leave = () => { this.ptrIn = false; this.clearHover(); };
    const key = (e: KeyboardEvent) => {
      if (this.closed || this.cine.active || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === 'Escape') { if (this.mode !== 'main') this.toMain(); return; }
      if (this.mode === 'archive' && (k === 'ArrowRight' || k === 'ArrowLeft')) { const n = this.worlds.length; if (n) this.focusWorld(((this.focus < 0 ? 0 : this.focus + (k === 'ArrowRight' ? 1 : -1)) + n) % n); return; }
      if (k === 's') { e.preventDefault(); this.seedIn.focus(); return; }
      const id = ({ n: 'new', c: 'continue', a: 'archive', b: 'assembly', o: 'settings', g: 'settings' } as Record<string, string>)[k];
      const o = id ? this.words.find((w) => w.id === id) ?? null : null; if (o) this.work(o);
    };
    cv.addEventListener('pointermove', move); addEventListener('pointerdown', down); addEventListener('pointerup', up); cv.addEventListener('pointerleave', leave); addEventListener('keydown', key);
    const rs = () => this.layout(); addEventListener('resize', rs);
    this.off.push(() => { cv.removeEventListener('pointermove', move); removeEventListener('pointerdown', down); removeEventListener('pointerup', up); cv.removeEventListener('pointerleave', leave); removeEventListener('keydown', key); removeEventListener('resize', rs); });
  }
  private clearHover() {
    for (const o of this.words) o.word.hover = 0;
    this.hovered = null; this.hoverApple = false; this.hoverWorld = -1; this.hoverEmpty = false;
    this.tipEl.style.display = 'none'; this.tipHtml = ''; document.body.style.cursor = '';
  }
  /** what is under the pointer */
  private pick() {
    if (this.busy || this.cine.active || this.mode === 'launch' || this.mode === 'away' || this.mode === 'settings') { this.clearHover(); return; }
    this.ray.setFromCamera(this.ndc, this.cam);
    let best = 1e9, ho: Opt | null = null, ha = false, hw = -1, he = false;
    if (this.mode === 'main') for (const o of this.words) { const h = this.ray.intersectObject(o.word.hit, false)[0]; if (h && h.distance < best) { best = h.distance; ho = o; } }
    { const h = this.ray.intersectObject(this.apple.group, true)[0]; if (h && h.distance < best) { best = h.distance; ho = null; ha = true; } }
    if (this.mode === 'archive') {
      this.worlds.forEach((w, i) => { const h = this.ray.intersectObject(w.g.mesh, false)[0]; if (h && h.distance < best) { best = h.distance; hw = i; ho = null; ha = false; } });
      if (this.empty) { const h = this.ray.intersectObject(this.empty.hit, false)[0]; if (h && h.distance < best) { best = h.distance; he = true; ha = false; } }
    }
    if (ho !== this.hovered) { this.hovered = ho; if (ho) { csfx('hover', 0.7); csfx('tick', 0.5); } }
    for (const o of this.words) o.word.hover = o === ho ? 1 : 0;
    if (ha !== this.hoverApple) { this.hoverApple = ha; if (ha) csfx('tick', 0.6, 1.4); }
    if (hw !== this.hoverWorld) { this.hoverWorld = hw; if (hw >= 0) csfx('hover', 0.6, 0.8); }
    this.hoverEmpty = he;
    let html = '';
    if (ho) html = `<div class="h">${ho.label}<span class="k">${ho.key}</span></div><div class="d">${ho.tip}</div>` + (!ho.word.enabled ? '<div class="w">NO MISSION IN PROGRESS</div>' : '');
    else if (ha) html = this.apple.bitten ? '<div class="h">AN APPLE</div><div class="d">Somebody took a bite. Nobody aboard will say who.</div>' : '<div class="h">AN APPLE</div><div class="d">Floating out here. Nobody knows why. Kick it.</div>';
    else if (hw >= 0) { const e = this.worlds[hw].e; html = `<div class="h">${e.name.toUpperCase()}</div><div class="d">${e.regions} REGIONS · ${e.species} SPECIES · CLAIMED ${e.date}</div>`; }
    else if (he) html = '<div class="h">THE ARCHIVE</div><div class="d">Claim a world for Earth and it will float here, green.</div>';
    if (html && this.ptrIn) {
      if (this.tipHtml !== html) { this.tipHtml = html; this.tipEl.innerHTML = html; }
      if (this.tipEl.style.display !== 'block') this.tipEl.style.display = 'block';
      const w = this.tipEl.offsetWidth, h = this.tipEl.offsetHeight;
      const left = this.ptrX - w - 24 < 6 ? this.ptrX + 24 : this.ptrX - w - 24;
      this.tipEl.style.left = Math.max(6, Math.min(innerWidth - w - 6, left)) + 'px'; this.tipEl.style.top = Math.max(6, Math.min(innerHeight - h - 6, this.ptrY - h / 2)) + 'px';
      document.body.style.cursor = 'pointer';
    } else { if (this.tipEl.style.display !== 'none') this.tipEl.style.display = 'none'; this.tipHtml = ''; document.body.style.cursor = ''; }
  }
  private click() {
    if (this.busy || this.cine.active) return;
    if (this.hoverApple) { this.kickApple(); return; }
    if (this.mode === 'archive') { if (this.hoverWorld >= 0) this.focusWorld(this.hoverWorld); else if (this.hoverEmpty && this.empty) { this.empty.burst(0.5); csfx('clamp', 0.4); } return; }
    if (this.hovered) this.work(this.hovered);
  }

  // ------------------------------------------------------------------ the apple
  private kickApple() {
    const dir = this.ray.ray.direction.clone().add(new V3((Math.random() - 0.5) * 0.5, 0.15 + Math.random() * 0.3, 0)).normalize();
    this.apple.kick(dir, 1);
    csfx('thud', 0.9, 1.3); csfx('whoosh', 0.5, 1.6);
    if (this.apple.kicks === 6 && !this.apple.bitten) setTimeout(() => {
      if (this.closed) return;
      this.apple.bite(); csfx('crunch', 1); csfx('crunch', 0.7, 0.8);
      const p = this.apple.group.position.clone().project(this.cam);
      const c = el('div', 'crunch', this.root, 'CRUNCH.'); c.style.left = ((p.x * 0.5 + 0.5) * innerWidth) + 'px'; c.style.top = ((-p.y * 0.5 + 0.5) * innerHeight) + 'px';
      setTimeout(() => c.remove(), 1700);
    }, 900);
  }

  // ------------------------------------------------------------------ working the options
  private work(o: Opt | null) {
    if (!o || this.busy || this.closed || this.mode === 'launch' || this.mode === 'away') return;
    Tip.hide();
    if (!o.word.enabled) { o.word.shake(); csfx('deny'); this.tipEl.innerHTML = '<div class="h">CONTINUE</div><div class="w">NO MISSION IN PROGRESS</div>'; return; }
    o.word.burst(1); csfx('clamp', 0.7, 0.9 + Math.random() * 0.3); csfx('whoosh', 0.35, 2);
    const after = (f: () => void, ms = 420) => { this.busy = true; setTimeout(() => { this.busy = false; f(); }, ms); };
    switch (o.id) {
      case 'new': after(() => this.launch(this.seedFromField())); break;
      case 'continue': after(() => { csfx('hum', 0.7); this.leave(() => this.opts.onContinue(), 0.9); }); break;
      case 'archive': after(() => this.toArchive(), 250); break;
      case 'settings': after(() => this.openSettings(), 200); break;
      case 'assembly': after(() => {
        this.root.style.visibility = 'hidden'; this.cine.ui.root.style.visibility = 'hidden';
        this.opts.onMirror(() => { this.root.style.visibility = ''; this.cine.ui.root.style.visibility = ''; csfx('leverLock', 0.6); });
      }); break;
    }
  }
  private seedFromField() {
    const s = this.seedIn.value.trim();
    return s ? Math.abs(parseInt(s, 36) || 1) % 1e9 : Math.floor(Math.random() * 1e6);
  }

  // ------------------------------------------------------------------ settings: an enamel plate
  private openSettings() {
    if (this.mode === 'launch' || this.mode === 'away') return;
    csfx('servo', 0.6, 1.2);
    if (this.mode === 'settings') { this.toMain(); return; }
    this.closePanels(); this.mode = 'settings'; this.clearHover();
    this.drawSettings();
    this.setEl.style.display = 'block'; this.setEl.style.animation = 'none'; void this.setEl.offsetWidth; this.setEl.style.animation = '';
  }
  private drawSettings() {
    const d = this.setEl; d.innerHTML = '';
    el('div', 'hd', d, 'SETTINGS');
    const slider = (label: string, key: 'master' | 'music' | 'sfx') => {
      const r = el('div', 'row', d); el('div', 'lb', r, label);
      const inp = el('input', '', r) as HTMLInputElement; inp.type = 'range'; inp.min = '0'; inp.max = '100'; inp.value = String(Math.round(settings[key] * 100));
      const v = el('div', 'val', r, inp.value);
      inp.addEventListener('input', () => { v.textContent = inp.value; setSettings({ [key]: Number(inp.value) / 100 }); });
      inp.addEventListener('change', () => csfx('tick', 0.8));
      inp.addEventListener('pointerdown', (e) => e.stopPropagation()); inp.addEventListener('keydown', (e) => e.stopPropagation());
    };
    const choice = <T extends string | number | boolean>(label: string, cur: T, opts: [T, string][], set: (v: T) => void) => {
      const r = el('div', 'row', d); el('div', 'lb', r, label);
      const o = el('div', 'opts', r);
      for (const [v, name] of opts) { const b = el('div', 'btn' + (v === cur ? ' on' : ''), o, name); b.addEventListener('click', (e) => { e.stopPropagation(); csfx('switch', 0.8); set(v); }); }
    };
    slider('MASTER VOLUME', 'master'); slider('MUSIC', 'music'); slider('SOUND EFFECTS', 'sfx');
    choice<Quality>('GRAPHICS', settings.quality, [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']], (v) => setSettings({ quality: v }));
    choice<number>('UI SCALE', settings.uiScale, [[0, 'AUTO'], [2, '2X'], [3, '3X'], [4, '4X']], (v) => setSettings({ uiScale: v }));
    choice<boolean>('SCREEN SHAKE', settings.shake, [[true, 'ON'], [false, 'OFF']], (v) => setSettings({ shake: v }));
    const f = el('div', 'foot', d);
    const rs = el('div', 'btn', f, 'DEFAULTS'); rs.addEventListener('click', (e) => { e.stopPropagation(); csfx('relay'); resetSettings(); });
    const ok = el('div', 'btn on', f, 'DONE ▶'); ok.addEventListener('click', (e) => { e.stopPropagation(); csfx('leverLock', 0.6); this.toMain(); });
  }

  // ------------------------------------------------------------------ the archive
  private toArchive() {
    this.closePanels(); this.mode = 'archive'; this.focus = -1; this.clearHover();
    this.backEl.style.display = 'inline-flex';
    for (const o of this.words) o.word.burst(0.6);
    csfx('whoosh', 0.5, 1.6);
  }
  private focusWorld(i: number) {
    const w = this.worlds[i]; if (!w) return;
    this.focus = i; csfx('chime', 0.4);
    const e = w.e, d = this.detEl;
    d.innerHTML = '';
    el('div', 'n', d, e.name.toUpperCase());
    el('div', 's', d, `CLAIMED FOR EARTH ${e.date}<br>${e.regions} REGIONS · ${e.species} SPECIES · ${e.genes.length} GENES`);
    const gn = el('div', 'gn', d);
    for (const id of e.genes.slice(0, 18)) if (GENE[id]) el('span', '', gn, GENE[id].name.toUpperCase());
    const b = el('div', 'btn red', d);
    const im = document.createElement('img'); im.src = iconURL('planet', 36); b.appendChild(im);
    el('span', '', b, 'LAUNCH OFFSPRING');
    b.title = 'Throw a seed of this world at a new one. It carries three of its genes.';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); csfx('button'); this.launch(Math.floor(Math.random() * 1e6), e); });
    d.style.display = 'block'; d.style.animation = 'none'; void d.offsetWidth; d.style.animation = '';
  }
  private closePanels() { this.detEl.style.display = 'none'; this.setEl.style.display = 'none'; this.backEl.style.display = 'none'; }
  private toMain() {
    const was = this.mode;
    this.closePanels(); this.mode = 'main'; this.focus = -1; this.tipEl.style.display = 'none';
    if (was === 'archive') { csfx('whoosh', 0.5, 1.3); for (const o of this.words) o.word.burst(0.6); }
  }

  // ------------------------------------------------------------------ setting out (the deploy sequence does the launch itself)
  private async launch(seed: number, offspring?: ArchiveEntry) {
    if (this.mode === 'launch') return;
    this.closePanels(); this.mode = 'launch'; this.busy = true; this.clearHover();
    this.root.classList.add('hide');
    const sroot = this.ship.carrier.ship.root;
    const mouth = sroot.localToWorld(new V3(0, -8.5, 66)), inside = sroot.localToWorld(new V3(0, -9, 30)), out = sroot.localToWorld(new V3(6, -2, 130));
    const end = () => { this.close(() => (offspring ? this.opts.onLaunch(offspring) : this.opts.onNew(seed))); };
    await this.cine.play(async (c) => {
      c.cam.cut(this.cam.position.clone(), this.camLook.clone(), this.cam.fov);
      c.stamp(offspring ? `OFFSPRING OF ${offspring.name.toUpperCase()} · SEED ${seed}` : `TARGET SEED ${seed}`, true);
      for (const o of this.words) o.word.burst(1.4);
      c.sfx('whoosh', 0.7, 0.8); c.sfx('swell', 0.5);
      // round to the bow and in at the bay mouth, where the pod waits on its rail
      c.cam.move({ pos: out, look: mouth, fov: 40, dur: 2.6, ease: 'inOut' });
      c.say(offspring ? `Offspring of ${offspring.name}: target acquired.` : 'Target acquired. Bay two, stand by to receive Seven.', { who: 'Station Four', style: 'radio', pitch: 0.8 });
      await c.wait(2.4);
      c.cam.move({ pos: mouth, look: inside, fov: 48, dur: 1.6, ease: 'inCubic' });
      await c.wait(1.2);
      await c.fade(1, 0.5, '#d2cab4');
      await c.wait(0.2);
    }, { name: 'setout' });
    end();
  }
  private leave(then: () => void, dur = 0.8) {
    this.mode = 'away'; this.clearHover();
    this.cine.ui.fade(1, dur);
    setTimeout(() => this.close(then), dur * 1000 + 60);
  }

  // ------------------------------------------------------------------ the frame
  update(dt: number) {
    this.t += dt;
    const t = this.t;
    this.cine.update(dt);
    this.ship.update(dt, t);
    this.globe.group.rotation.y += dt * 0.004; this.globe.mat.uniforms.uT.value = t;
    // the words float (gone while the archive is up), the lamp follows the one pointed at
    this.archK += ((this.mode === 'archive' ? 1 : 0) - this.archK) * Math.min(1, dt * 3);
    for (const o of this.words) {
      const w = o.word;
      w.group.visible = this.archK < 0.98;
      w.update(dt, t, this.cam);
      if (this.archK > 0.01) { w.group.position.addScaledVector(this.rest.up, this.archK * 70 * (1 + this.words.indexOf(o) * 0.15)); }
    }
    if (this.empty) { this.empty.group.visible = this.archK > 0.02; this.empty.update(dt, t, this.cam); this.empty.group.position.addScaledVector(this.rest.up, (1 - this.archK) * -60); }
    this.worlds.forEach((w, i) => {
      w.g.group.visible = this.archK > 0.02;
      w.g.group.position.copy(w.at).addScaledVector(this.rest.up, (1 - this.archK) * -80 - Math.sin(t * 0.5 + i) * 1.2);
      w.g.group.rotation.y += dt * (this.focus === i ? 0.5 : 0.15); w.g.mat.uniforms.uT.value = t;
    });
    const lit = this.hovered?.word;
    if (lit) this.lamp.position.lerp(lit.group.position.clone().addScaledVector(this.rest.up, 10).add(this.cam.position.clone().sub(lit.group.position).normalize().multiplyScalar(22)), Math.min(1, dt * 10));
    this.lamp.intensity += ((lit ? 520 : 0) - this.lamp.intensity) * Math.min(1, dt * 8);
    // the apple: physics against the hull and the words
    const boxes = [...this.ship.boxes, ...this.words.filter((o) => o.word.group.visible).map((o) => ({ half: o.word.halfSize, m: o.word.group.matrixWorld, inv: new THREE.Matrix4().copy(o.word.group.matrixWorld).invert(), hit: () => { o.word.burst(0.3); } }))];
    this.bonk = Math.max(0, this.bonk - dt);
    this.apple.update(dt, t, boxes, (sp) => { if (this.bonk > 0) return; this.bonk = 0.15; csfx(sp > 25 ? 'clamp' : 'thud', Math.min(1, sp / 40), 1.2); });
    this.fx.update(dt, innerHeight, this.cam.fov);
    // the camera: a slow drift and a lean toward the pointer
    if (this.cine.active) { this.cine.apply(this.cam); return; }
    const qx = this.ptrIn ? this.ndc.x : 0, qy = this.ptrIn ? this.ndc.y : 0;
    this.par.x += (qx - this.par.x) * Math.min(1, dt * 1.6); this.par.y += (qy - this.par.y) * Math.min(1, dt * 1.6);
    const r = this.rest;
    const pos = r.pos.clone().addScaledVector(r.right, this.par.x * 16 + Math.sin(t * 0.07) * 6).addScaledVector(r.up, this.par.y * 9 + Math.sin(t * 0.11) * 3);
    const look = r.look.clone().addScaledVector(r.right, this.par.x * 7).addScaledVector(r.up, this.par.y * 4);
    if (this.mode === 'archive') pos.addScaledVector(look.clone().sub(pos).normalize(), 18);
    const k = 1 - Math.exp(-dt * 1.6);
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
    this.cam.position.copy(this.camPos); this.cam.lookAt(this.camLook);
    if (Math.abs(this.cam.fov - r.fov) > 0.01) { this.cam.fov += (r.fov - this.cam.fov) * k; this.cam.updateProjectionMatrix(); }
    this.cam.updateMatrixWorld();
    if (this.ptrIn && !this.downAt) this.pick();
  }
  render(post: Post, t: number) {
    resetGrade(post.grade); post.grade.bloom = 0.32; post.grade.vig = 0.5; post.grade.sat = 0.96;
    post.render(this.scene, this.cam, this.fxScene, t);
  }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); fontVars(); this.layout(); }
  private close(then: () => void) {
    if (this.closed) return;
    this.closed = true; this.dispose(); then();
  }
  dispose() {
    this.closed = true;
    this.off.forEach((f) => f()); this.off = [];
    this.hum?.stop(0.4); this.hum = null;
    this.root.remove(); this.cine.dispose(); Tip.hide(); document.body.style.cursor = '';
    for (const o of this.words) o.word.dispose();
    this.empty?.dispose(); this.apple.dispose(); this.ship.dispose();
  }
}

// ================================================================== ASCENSION
/** the newsreel at the end of a world: the regions go over one by one, the borders dissolve, a flag goes up */
export class AscendScreen implements Screen {
  private scene = new THREE.Scene(); private fxScene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
  private globe: Globe; private root: HTMLDivElement;
  private cine: Cinema; private fx: Fx;
  private flag = new THREE.Group(); private cloth: THREE.Mesh; private clothBase: Float32Array;
  private t = 0; private flipped = 0; private order: number[];
  private finished = false;
  constructor(readonly planet: Planet, readonly name: string, readonly done: () => void) {
    style();
    this.scene.background = new THREE.Color(0x02040a);
    this.scene.add(stars(1800, 80));
    this.fx = new Fx(this.fxScene, this.scene);
    const hemi = new THREE.HemisphereLight(0xdde8ff, 0x302820, 1.4); this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(-3, 4, 5); this.scene.add(key);
    this.globe = makeGlobe(planet, 1); this.scene.add(this.globe.group);
    this.order = planet.regions.filter((r) => r.state !== 'veyr').map((r) => r.id);
    // the flag: a pole, a cloth with the Corps roundel, planted at the top of the world
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 6), mat({ color: RAMPS.steel[6], phong: true })); pole.position.y = 0.17; this.flag.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), mat({ color: RAMPS.brass[5], phong: true })); knob.position.y = 0.345; this.flag.add(knob);
    const fp = new Pix(32, 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) fp.set(x, y, Math.floor(y / 3) % 2 ? RAMPS.paper[4] : RAMPS.stampRed[2]);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 13; x++) fp.set(x, y, RAMPS.slate[1]);
    for (const [x, y] of [[2, 2], [6, 2], [10, 2], [4, 5], [8, 5], [2, 8], [6, 8], [10, 8]]) fp.set(x, y, RAMPS.paper[5]);
    const cg = new THREE.PlaneGeometry(0.2, 0.125, 10, 4); cg.translate(0.1, 0, 0);
    this.cloth = new THREE.Mesh(cg, mat({ map: tex(fp), side: THREE.DoubleSide, flat: false }));
    this.cloth.position.set(0.006, 0.27, 0); this.flag.add(this.cloth);
    this.clothBase = Float32Array.from((cg.attributes.position as THREE.BufferAttribute).array as Float32Array);
    const em = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), mat({ map: roundelTex() })); (em.material as THREE.MeshLambertMaterial).alphaTest = 0.5; em.position.set(0, 0.05, 0.004); void em;
    this.flag.position.set(0, 1.0, 0); this.flag.scale.setScalar(0.001); this.globe.group.add(this.flag);
    this.root = el('div', 'mn3', ui());
    this.cine = new Cinema({}); this.cine.ui.root.remove(); ui().appendChild(this.cine.ui.root);
    this.cam.position.set(0, 0.4, 4.2); this.cam.lookAt(0, 0, 0);
    void this.run();
  }
  private async run() {
    const P = this.planet, n = this.order.length;
    await this.cine.play(async (c) => {
      c.ui.fade(1, 0);
      c.cam.cut(new V3(0, 0.5, 4.6), new V3(0, 0, 0), 30);
      c.cam.orbit({ center: new V3(0, 0, 0), radius: 4.6, height: 0.5, from: 0, to: 1.4, dur: n * 0.5 + 22, ease: 'inOut', radiusTo: 3.2, heightTo: 1.1 });
      c.fade(0, 2);
      const drone = c.loop('drone', 0.5);
      await c.card('SURVEY COMPLETE', P.name.toUpperCase(), 'U.S. PLANETARY CORPS NEWSREEL', 3.2);
      // the regions go over, one by one
      let k = 0;
      c.task((dt) => {
        k += dt;
        const want = Math.min(n, Math.floor(k / 0.5));
        while (this.flipped < want) {
          const r = P.regions[this.order[this.flipped]]; r.state = 'veyr'; this.flipped++; this.globe.refresh();
          c.sfx('chime', 0.25, 0.8 + this.flipped * 0.05);
          const v = new V3(...r.c).normalize().multiplyScalar(1.02).applyMatrix4(this.globe.group.matrixWorld);
          this.fx.burst(v.x, v.y, v.z, 10, VEYR.vein, { glow: true, speed: 0.25, up: 0.2, size: 3, life: 0.9 });
        }
        return this.flipped >= n;
      });
      const lines = [`${P.name} answers to Earth now.`, 'Every root, every river, every beast: logged, tagged, ours.', 'The rivals are scrap metal. The survey is complete.', `${this.name} plants the flag.`];
      for (let i = 0; i < 3; i++) { await c.say(lines[i], { who: 'Newsreel', style: 'film', pitch: 0.75 }); await c.wait(0.4); }
      await c.until(() => this.flipped >= n, n * 0.5 + 2);
      // the borders dissolve
      this.globe.mat.uniforms.uAsc.value = 1; (this.globe.atmo.material as THREE.ShaderMaterial).uniforms.uCol.value.set(VEYR.vein);
      c.sfx('swell', 0.7); c.flash('#c0fff0', 0.6, 0.35);
      await c.wait(0.8);
      // the flag goes up at the top of the world
      c.cam.move({ pos: new V3(0.9, 1.55, 1.9), look: new V3(0, 1.08, 0), fov: 26, dur: 3.5, ease: 'inOut' });
      await c.wait(1.6);
      c.sfx('thud', 0.6); c.sfx('sting', 0.8);
      c.tween(0.9, (u) => this.flag.scale.setScalar(Math.max(0.001, u)), 'outBack');
      await c.say(lines[3], { who: 'Newsreel', style: 'film', pitch: 0.75 });
      drone.set(0.8);
      await c.wait(1.2);
      await c.fade(1, 1.2);
      await c.card(`${P.name.toUpperCase()}`, 'CLAIMED FOR HUMANITY', 'U.S.P.C. · WORLD ' + String(P.seed % 1000).padStart(3, '0'), 3.6, 'CLAIMED');
      c.fade(0, 1.2);
      c.cam.cut(new V3(0, 0.35, 3.4), new V3(0, 0, 0), 32);
    }, { name: 'ascend' });
    // make sure the end state holds after a skip
    for (const id of this.order) this.planet.regions[id].state = 'veyr';
    this.flipped = this.order.length; this.globe.refresh(); this.globe.mat.uniforms.uAsc.value = 1; this.flag.scale.setScalar(1);
    this.finished = true;
    const b = el('div', 'big', this.root);
    b.style.cssText = 'position:absolute;left:50%;bottom:calc(16px * var(--s));transform:translateX(-50%);width:auto;padding:calc(5px * var(--s)) calc(14px * var(--s))';
    const im = document.createElement('img'); im.src = iconURL('planet', 36); b.appendChild(im);
    el('span', '', b, 'INTO THE ARCHIVE');
    b.addEventListener('click', (e) => { e.stopPropagation(); csfx('button'); this.dispose(); this.done(); });
  }
  update(dt: number) {
    this.t += dt;
    this.cine.update(dt);
    this.globe.group.rotation.y += dt * (this.cine.active ? 0.06 : 0.15);
    this.globe.mat.uniforms.uT.value = this.t;
    // the cloth ripples
    const pa = (this.cloth.geometry.attributes.position as THREE.BufferAttribute), arr = pa.array as Float32Array;
    for (let i = 0; i < pa.count; i++) { const x = this.clothBase[i * 3]; arr[i * 3 + 2] = Math.sin(this.t * 6 - x * 40) * x * 0.12; arr[i * 3 + 1] = this.clothBase[i * 3 + 1] - x * x * 0.4; }
    pa.needsUpdate = true;
    this.fx.update(dt, innerHeight, this.cam.fov);
    if (this.cine.active || !this.finished) this.cine.apply(this.cam);
    else { const a = this.t * 0.05; this.cam.position.set(Math.sin(a) * 3.4, 0.35, Math.cos(a) * 3.4); this.cam.lookAt(0, 0, 0); this.cam.updateMatrixWorld(); }
  }
  render(post: Post, t: number) { resetGrade(post.grade); post.grade.bloom = 0.5; post.render(this.scene, this.cam, this.fxScene, t); }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  dispose() { this.root.remove(); this.cine.dispose(); }
}
