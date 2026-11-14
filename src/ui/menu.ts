// The main menu floats in space. Unit 07's meteor drifts and turns slowly over the target world, its fissures
// breathing teal light, the golem's brass lens peeking out of the rock and following the pointer, small rocks on
// tilted orbits, glittering dust, a twinkling starfield and nebula, the sun's glare rimming everything. The options
// are cast-iron signs hanging on chains and tethered to the rock: they bob and swing, light up and lean in when you
// point at them, and clank and swing when you work them. An iron cog opens the settings plate.
//   NEW WORLD    nixie tubes on the sign count down and the camera dives past the rock to the planet (the deploy
//                sequence, src/ui/deploy*.ts, does the carrier, the pod and the fall)
//   CONTINUE     resume the world being taken
//   ARCHIVE      the camera drifts to the worlds claimed for Earth, each hanging on its own iron tag
//   ASSEMBLY BAY refit Unit 07; SEED CARD (a small tag) launches at a hand-punched seed
// The ascension finale (AscendScreen) is a newsreel: the regions turn, the borders dissolve, a flag goes up.
import * as THREE from 'three';
import type { Screen } from '../app/engine';
import { type Post, resetGrade } from '../gfx/post';
import { el, ui, Tip } from './kit';
import { makeGlobe, stars, type Globe } from './globe';
import { makePlanet, type Planet } from '../world/planet';
import { VEYR } from '../world/palette';
import { GENE } from '../life/genes';
import { Fx } from '../game/fx';
import { Cinema } from '../game/cinema';
import { csfx, cloop, type Loop } from './cineAudio';
import { mat, tex, roundelTex, Pix, CR, RD } from './cineKit';
import { makeMeteor, makeRockSwarm, makeSparkles, makeSign, stepSign, kickSign, makeGear, makeSunGlare, Nixies, Chain, ironURL, enamelURL, type Sign, type Meteor } from './cineSigns';
import { fontVars } from './cineUI';
import { iconURL } from './icons';
import { gbuf } from '../gfx/gbuf';
import { settings, setSettings, onSettings, resetSettings, type Quality } from '../settings';

export interface ArchiveEntry { seed: number; name: string; date: string; species: number; genes: string[]; regions: number }

const V3 = THREE.Vector3;
const CSS = /* css */`
.mn3 { position: fixed; inset: 0; pointer-events: none !important; z-index: 3; font-family: 'VT', monospace; --u: calc(1px * var(--s, 2)); }
.mn3 > * { pointer-events: auto; }
.mn3 .tag { position: absolute; left: 50%; bottom: calc(6 * var(--u)); transform: translateX(-50%); font-size: var(--cf-vt1); line-height: var(--cf-vt1); color: rgba(217, 210, 191, 0.45); letter-spacing: 1px; white-space: nowrap; pointer-events: none !important; text-shadow: 0 calc(1 * var(--u)) 0 #000; }
.mn3 .tag b { color: #d9d2bf; font-weight: normal; }
.mn3 .iron { background: var(--iron) 0 0 / 100% 100%; image-rendering: pixelated; box-shadow: 0 calc(4 * var(--u)) calc(6 * var(--u)) rgba(8, 9, 12, 0.6); color: #d9d2bf; text-shadow: 0 1px 0 #16171a; }
.mn3 .enamel { background: var(--enamel) 0 0 / 100% 100%; image-rendering: pixelated; box-shadow: 0 calc(4 * var(--u)) calc(6 * var(--u)) rgba(8, 9, 12, 0.6); color: #d9d2bf; text-shadow: 0 1px 0 #1e2016; }
.mn3 .tipx { position: fixed; display: none; pointer-events: none !important; padding: calc(5 * var(--u)) calc(8 * var(--u)); max-width: calc(170 * var(--u)); animation: mn-in 160ms steps(4); }
@keyframes mn-in { 0% { transform: translateY(calc(-4 * var(--u))); opacity: 0; } 100% { transform: none; opacity: 1; } }
.mn3 .tipx .h { font-family: 'Superwide', monospace; font-size: var(--cf-sw1); line-height: calc(var(--cf-sw1) + 4px); color: #d9d2bf; }
.mn3 .tipx .h .k { float: right; margin-left: calc(8 * var(--u)); color: #2a1a12; background: #d9d2bf; border-radius: 2px; padding: 0 calc(2 * var(--u)); text-shadow: none; font-family: 'VT', monospace; font-size: var(--cf-vt1); line-height: var(--cf-sw1); }
.mn3 .tipx .d { font-size: var(--cf-vt1); line-height: var(--cf-vt1); margin-top: calc(2 * var(--u)); color: #b8b2a2; }
.mn3 .tipx .w { font-size: var(--cf-vt1); color: #d9a43a; margin-top: calc(2 * var(--u)); }
.mn3 .btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: calc(3 * var(--u)); padding: calc(3 * var(--u)) calc(8 * var(--u)); cursor: pointer; font-family: 'Superwide', monospace; font-size: var(--cf-sw1); line-height: var(--cf-sw1); letter-spacing: 1px; background: linear-gradient(180deg, #4a2e20, #3a2418 55%, #2a1a12); border: 1px solid #16100c; border-radius: calc(2 * var(--u)); box-shadow: 0 1px 0 rgba(217, 210, 191, 0.18) inset, 0 calc(2 * var(--u)) 0 #16100c; color: #d9d2bf; text-shadow: 0 1px 0 #16100c; transition: transform 60ms, box-shadow 60ms; }
.mn3 .btn:hover { color: #efe8d6; background: linear-gradient(180deg, #553626, #42291c 55%, #2e1d14); }
.mn3 .btn:active { transform: translateY(calc(2 * var(--u))); box-shadow: 0 1px 0 rgba(217, 210, 191, 0.1) inset, 0 0 0 #16100c; }
.mn3 .btn.on { transform: translateY(calc(1 * var(--u))); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.4) inset, 0 calc(1 * var(--u)) 0 #16100c; color: #efe8d6; }
.mn3 .btn.on::before { content: ''; width: calc(3 * var(--u)); height: calc(3 * var(--u)); border-radius: 50%; background: #d9a43a; box-shadow: 0 0 calc(3 * var(--u)) rgba(217, 164, 58, 0.6); margin-right: calc(2 * var(--u)); }
.mn3 .btn.red { background: linear-gradient(180deg, #c4473b, #b8382e 55%, #8e2a22); border-color: #3a120e; box-shadow: 0 1px 0 rgba(255, 220, 200, 0.25) inset, 0 calc(2 * var(--u)) 0 #3a120e; color: #efe8d6; }
.mn3 .btn img { width: calc(18 * var(--u)); height: calc(18 * var(--u)); image-rendering: pixelated; }
.mn3 .back { position: absolute; left: calc(10 * var(--u)); bottom: calc(20 * var(--u)); display: none; }
/* iron plates: the settings and an archived world's details */
.mn3 .plate { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: none; width: calc(230 * var(--u)); padding: calc(12 * var(--u)) calc(14 * var(--u)); box-sizing: border-box; animation: mn-swing 520ms cubic-bezier(.25,1.6,.45,1); transform-origin: 50% 0; }
@keyframes mn-swing { 0% { transform: translate(-50%, -62%) rotate(-5deg); opacity: 0; } 60% { transform: translate(-50%, -50%) rotate(2deg); opacity: 1; } 100% { transform: translate(-50%, -50%) rotate(0); } }
.mn3 .plate .hd { font-family: 'Superwide', monospace; font-size: var(--cf-sw2); line-height: var(--cf-sw2); color: #d9d2bf; letter-spacing: 3px; margin-bottom: calc(8 * var(--u)); text-align: center; }
.mn3 .plate .hd::after { content: ''; display: block; height: 1px; margin: calc(4 * var(--u)) calc(20 * var(--u)) 0; background: rgba(217, 210, 191, 0.35); }
.mn3 .plate .row { display: flex; align-items: center; gap: calc(6 * var(--u)); margin: calc(4 * var(--u)) 0; }
.mn3 .plate .lb { flex: 0 0 calc(78 * var(--u)); font-family: 'Jersey', monospace; font-size: var(--cf-np1); line-height: var(--cf-np1); color: #c8c2b0; letter-spacing: 1px; }
.mn3 .plate .opts { display: flex; gap: calc(2 * var(--u)); flex-wrap: wrap; }
.mn3 .plate .opts .btn { padding: calc(2 * var(--u)) calc(4 * var(--u)); }
.mn3 .plate .val { flex: 0 0 calc(22 * var(--u)); text-align: right; font-size: var(--cf-vt1); color: #d9d2bf; }
.mn3 .plate input[type=range] { -webkit-appearance: none; appearance: none; flex: 1; height: calc(5 * var(--u)); background: linear-gradient(180deg, #1a1c14, #2a2c20); border: 1px solid #16180f; box-shadow: 0 1px 0 rgba(217, 210, 191, 0.15); outline: none; margin: 0; cursor: pointer; }
.mn3 .plate input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: calc(9 * var(--u)); height: calc(13 * var(--u)); border-radius: calc(2 * var(--u)); background: linear-gradient(90deg, #553626, #3a2418 50%, #2a1a12); border: 1px solid #16100c; box-shadow: 0 calc(1 * var(--u)) 0 #16100c, 0 1px 0 rgba(217, 210, 191, 0.2) inset; }
.mn3 .plate input[type=range]::-moz-range-thumb { width: calc(9 * var(--u)); height: calc(13 * var(--u)); background: linear-gradient(90deg, #553626, #3a2418 50%, #2a1a12); border: 1px solid #16100c; border-radius: calc(2 * var(--u)); }
.mn3 .plate .foot { display: flex; justify-content: space-between; margin-top: calc(8 * var(--u)); }
.mn3 .det { left: auto; right: calc(14 * var(--u)); transform: translateY(-50%); width: calc(170 * var(--u)); }
@keyframes mn-swing2 { 0% { transform: translateY(-60%) rotate(4deg); opacity: 0; } 100% { transform: translateY(-50%); opacity: 1; } }
.mn3 .det { animation: mn-swing2 420ms cubic-bezier(.25,1.6,.45,1); }
.mn3 .det .n { font-family: 'Canned', monospace; font-size: var(--cf-sw2); line-height: var(--cf-sw2); color: #d9d2bf; }
.mn3 .det .s { font-size: var(--cf-vt1); line-height: var(--cf-vt1); margin: calc(4 * var(--u)) 0; color: #b8b2a2; }
.mn3 .det .gn { display: flex; flex-wrap: wrap; gap: calc(2 * var(--u)); margin: calc(3 * var(--u)) 0 calc(6 * var(--u)); }
.mn3 .det .gn span { font-size: var(--cf-vt1); line-height: var(--cf-vt1); border: 1px solid #5c5f5e; padding: 0 calc(2 * var(--u)); color: #c8c2b0; background: rgba(22, 23, 26, 0.5); }
.mn3 .det .btn { width: 100%; box-sizing: border-box; }
/* the punch card */
.mn3 .pcard { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%) rotate(-1deg); display: none; width: min(92vw, calc(260 * var(--u))); padding: calc(6 * var(--u)) calc(8 * var(--u)) calc(8 * var(--u)); background: linear-gradient(180deg, #f2ead2, #e4dab8); color: #3a2a18; text-shadow: none; box-shadow: calc(3 * var(--u)) calc(4 * var(--u)) 0 rgba(0, 0, 0, 0.55); clip-path: polygon(calc(10 * var(--u)) 0, 100% 0, 100% 100%, 0 100%, 0 calc(10 * var(--u))); animation: mn-card 360ms cubic-bezier(.2,1.4,.4,1); }
@keyframes mn-card { 0% { transform: translate(-50%, 30%) rotate(4deg); opacity: 0; } 100% { transform: translate(-50%, -50%) rotate(-1deg); opacity: 1; } }
.mn3 .pcard .hd { display: flex; justify-content: space-between; font-family: 'Silk', monospace; font-size: var(--cf-ps1); color: #a8321c; letter-spacing: 1px; }
.mn3 .pcard .cols { display: grid; grid-template-columns: repeat(9, 1fr); gap: calc(3 * var(--u)); margin: calc(5 * var(--u)) 0; }
.mn3 .pcard .col { display: flex; flex-direction: column; align-items: center; gap: calc(1 * var(--u)); }
.mn3 .pcard .ch { font-size: var(--cf-vt2); line-height: var(--cf-vt2); height: var(--cf-vt2); color: #2a1c10; }
.mn3 .pcard .holes { display: grid; grid-template-rows: repeat(10, calc(3 * var(--u))); gap: calc(1 * var(--u)); }
.mn3 .pcard .holes i { display: block; width: calc(4 * var(--u)); height: calc(3 * var(--u)); background: rgba(90, 70, 40, 0.18); }
.mn3 .pcard .holes i.p { background: #1a120a; animation: mn-punch 140ms steps(2); }
@keyframes mn-punch { 0% { transform: scale(1.8); } 100% { transform: none; } }
.mn3 .pcard .row { display: flex; gap: calc(4 * var(--u)); align-items: center; }
.mn3 .pcard input { position: absolute; opacity: 0; pointer-events: none; }
.mn3 .pcard .hint { flex: 1; font-size: var(--cf-vt1); line-height: var(--cf-vt1); color: #6a5a3a; }
.mn3.hide > :not(.tipx) { visibility: hidden; }
/* the ascension's button */
.mn3 .big { display: flex; align-items: center; justify-content: center; gap: calc(4 * var(--u)); width: 100%; padding: calc(4 * var(--u)); background: linear-gradient(180deg, #c4473b, #b8382e 55%, #8e2a22); border: 1px solid #3a120e; border-radius: calc(2 * var(--u)); box-shadow: 0 1px 0 rgba(255, 220, 200, 0.25) inset, 0 calc(3 * var(--u)) 0 #3a120e; color: #efe8d6; font-family: 'Superwide', monospace; font-size: var(--cf-sw1); letter-spacing: 1px; cursor: pointer; text-shadow: 0 1px 0 #3a120e; }
.mn3 .big:hover { filter: brightness(1.08); }
.mn3 .big:active { transform: translateY(calc(2 * var(--u))); }
.mn3 .big img { width: calc(18 * var(--u)); height: calc(18 * var(--u)); image-rendering: pixelated; }
`;
let styled = false;
function style() {
  fontVars();
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  document.documentElement.style.setProperty('--iron', `url(${ironURL(230, 160, 9)})`);
  document.documentElement.style.setProperty('--enamel', `url(${enamelURL(230, 150, 4)})`);
}

/** the world positions of the scene's pieces (the camera looks at the origin from +z) */
const M0 = new V3(-1.9, -0.05, 0);              // the meteor
const SIGN_X = 2.75, SIGN_Y = [1.45, 0.48, -0.49, -1.46];
const SUN = new V3(0.55, 0.42, -0.72).normalize();
const PLANET = new V3(-6.5, -13, -24), PLANET_R = 10;
const ARCH = new V3(12, 0.2, -1);               // where the archive gallery hangs

type Mode = 'main' | 'archive' | 'card' | 'settings' | 'launch' | 'away';
export class MenuScreen implements Screen {
  private scene = new THREE.Scene(); private fxScene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
  private fx: Fx; private meteor: Meteor; private swarm: ReturnType<typeof makeRockSwarm>; private dust: ReturnType<typeof makeSparkles>;
  private globe: Globe; private sky: THREE.Group;
  private signs: Sign[] = []; private title: Sign; private seedTag: Sign; private gearTag: Sign;
  private chains: { c: Chain; a: () => THREE.Vector3; b: () => THREE.Vector3; sag: number }[] = [];
  private gear: ReturnType<typeof makeGear>; private gearSpin = 0; private gearHover = 0;
  private nix: Nixies;
  private worlds: { g: Globe; e: ArchiveEntry; tag: Sign; at: THREE.Vector3 }[] = [];
  private emptyTag: Sign | null = null;
  private glowLight: THREE.PointLight; private lamp: THREE.PointLight;
  private root: HTMLDivElement; private tipEl: HTMLDivElement; private backEl: HTMLDivElement; private detEl: HTMLDivElement; private cardEl: HTMLDivElement; private setEl: HTMLDivElement;
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2(); private ptrIn = false; private ptrX = 0; private ptrY = 0;
  private par = new THREE.Vector2();
  private hovered: Sign | null = null; private hoverGear = false; private hoverWorld = -1;
  private mode: Mode = 'main'; private focus = -1;
  private t = 0;
  private camPos = new V3(0.5, 0.25, 9.4); private camLook = new V3(0.6, 0.0, 0);
  private cine: Cinema;
  private hum: Loop | null = null;
  private busy = false; private closed = false;
  private seedTxt = ''; private tipHtml = '';
  private downAt: { x: number; y: number } | null = null;
  private off: (() => void)[] = [];
  private launchK = 0;

  constructor(readonly opts: { hasSave: boolean; archive: ArchiveEntry[]; onNew: (seed: number) => void; onContinue: () => void; onLaunch: (e: ArchiveEntry) => void; onMirror: (back: () => void) => void }) {
    style();
    this.scene.background = new THREE.Color(0x02030a);
    this.sky = stars(2600, 120); this.scene.add(this.sky);
    this.fx = new Fx(this.fxScene, this.scene);
    // light: the sun behind and above (a rim on everything), a cool fill from the viewer, the planet's glow below
    this.scene.add(new THREE.HemisphereLight(0x5a6478, 0x1c1a1e, 0.6));
    const sun = new THREE.DirectionalLight(0xf0e2c8, 3.0); sun.position.copy(SUN).multiplyScalar(40); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = -7; sc.right = 7; sc.top = 6; sc.bottom = -6; sc.near = 10; sc.far = 80; sun.shadow.bias = -0.001;
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xa8b4cc, 1.25); fill.position.set(-4, 3, 10); this.scene.add(fill);
    const planetGlow = new THREE.PointLight(0x7aa0c8, 20, 34, 1.4); planetGlow.position.set(-4.5, -6.5, -5); this.scene.add(planetGlow);
    this.glowLight = new THREE.PointLight(0x6aa89a, 3.5, 7, 1.6);
    // the work lamp: one warm light that swings onto whichever sign you point at
    this.lamp = new THREE.PointLight(0xe8b868, 0, 3.2, 1.6); this.scene.add(this.lamp); this.glowLight.position.copy(M0).add(new V3(1.4, 0.2, 1.0)); this.scene.add(this.glowLight);
    const glare = makeSunGlare(26); glare.position.copy(SUN).multiplyScalar(110); glare.lookAt(0, 0, 0); this.scene.add(glare);
    // the target world, huge below and behind
    const planet: Planet = makePlanet(1000 + Math.floor(Math.random() * 9000));
    this.globe = makeGlobe(planet, PLANET_R, { orbit: true });
    this.globe.group.position.copy(PLANET); this.globe.group.rotation.set(0.35, 0.4, 0.2);
    (this.globe.mat.uniforms.uSun?.value as THREE.Vector3 | undefined)?.copy(SUN);
    this.scene.add(this.globe.group);
    // the meteor, its swarm and its dust
    this.meteor = makeMeteor(1.7, 7); this.meteor.group.position.copy(M0); this.scene.add(this.meteor.group);
    this.swarm = makeRockSwarm(18, 2.25, 3.0); this.swarm.group.position.copy(M0); this.scene.add(this.swarm.group);
    this.dust = makeSparkles(260, 4.4); this.dust.points.position.copy(M0); this.scene.add(this.dust.points);
    // the iron signs, hanging in a column, chained to each other and tethered to the rock
    const defs: [string, string, string, string, string?][] = [
      ['new', 'NEW WORLD', 'N', 'Fire Unit 07 at a new world.'],
      ['continue', 'CONTINUE', 'C', 'Back to the world you are taking.'],
      ['archive', 'ARCHIVE', 'A', 'The worlds claimed for Earth.', `${opts.archive.length} CLAIMED`],
      ['assembly', 'ASSEMBLY BAY', 'B', 'Refit Unit 07: paint, plating, lens and name.'],
    ];
    defs.forEach(([id, label, key, tip, sub], i) => {
      const s = makeSign(id, label, 2.5, 0.64, 31 + i * 7, { key, tip, sub });
      s.rest.set(SIGN_X, SIGN_Y[i], 0.55 - i * 0.12); s.pos.copy(s.rest).add(new V3(4, 3, 0)); s.vel.set(-3, -2, 0);
      if (id === 'continue' && !opts.hasSave) { s.enabled = false; (s.mat.map as THREE.Texture).needsUpdate = true; s.mat.color.setScalar(0.55); }
      this.scene.add(s.root); this.signs.push(s);
    });
    this.seedTag = makeSign('seed', 'SEED CARD', 1.25, 0.34, 77, { key: 'S', tip: 'Punch a seed by hand and launch at that exact world.' });
    this.seedTag.rest.set(SIGN_X + 0.62, SIGN_Y[3] - 0.78, 0.35); this.seedTag.pos.copy(this.seedTag.rest).add(new V3(3, -2, 0)); this.scene.add(this.seedTag.root); this.signs.push(this.seedTag);
    this.title = makeSign('title', 'ODDWORLD', 3.6, 1.0, 11, { font: 'Canned', size: 100, sub: 'U.S. PLANETARY CORPS · UNIT 07' });
    this.title.rest.set(-1.6, 2.55, 0.5); this.title.pos.copy(this.title.rest).add(new V3(0, 3, 0)); this.title.enabled = false; this.scene.add(this.title.root);
    this.nix = new Nixies(2, 0.1); this.nix.root.position.set(1.02, -0.07, 0.04); this.nix.root.scale.setScalar(1.1); this.signs[0].root.add(this.nix.root); this.nix.set('--');
    // chains: the title hangs from above; each sign hangs from the one above it; tethers run back to the rock
    const top = (x: number) => () => new V3(x, 6.5, 0.4);
    const bottom = (s: Sign, side: number) => () => s.root.localToWorld(new V3(side * s.w * 0.38, -s.h / 2 - 0.02, 0));
    const add = (n: number, a: () => THREE.Vector3, b: () => THREE.Vector3, sag = 0.06, link = 0.075) => { const c = new Chain(n, link); this.scene.add(c.group); this.chains.push({ c, a, b, sag }); };
    add(26, top(-2.9), () => this.title.eye(0)); add(26, top(-0.3), () => this.title.eye(1));
    add(30, top(SIGN_X - 0.95), () => this.signs[0].eye(0)); add(30, top(SIGN_X + 0.95), () => this.signs[0].eye(1));
    for (let i = 1; i < 4; i++) { const up = this.signs[i - 1], s = this.signs[i]; add(5, bottom(up, -1), () => s.eye(0), 0.02); add(5, bottom(up, 1), () => s.eye(1), 0.02); }
    add(9, bottom(this.signs[3], 1), () => this.seedTag.eye(0), 0.03, 0.06);
    for (let i = 0; i < 4; i++) { const s = this.signs[i]; add(16, () => this.meteor.anchor(i + 1), () => s.root.localToWorld(new V3(-s.w / 2 - 0.02, 0.05, 0)), 0.22, 0.07); }
    // the settings cog, with its own little tag
    this.gear = makeGear(0.5); this.gear.mesh.position.set(4.75, -2.15, 1.4); this.scene.add(this.gear.mesh);
    this.gearTag = makeSign('settings', 'SETTINGS', 1.15, 0.3, 91, { key: 'O', tip: 'Volume, graphics quality, UI scale, screen shake.' });
    this.gearTag.rest.set(4.75, -2.85, 1.45); this.gearTag.pos.copy(this.gearTag.rest); this.scene.add(this.gearTag.root);
    add(4, () => this.gear.mesh.position.clone().add(new V3(0, -0.3, 0)), () => this.gearTag.eye(0), 0.01, 0.05); add(4, () => this.gear.mesh.position.clone().add(new V3(0, -0.3, 0)), () => this.gearTag.eye(1), 0.01, 0.05);
    // the archive: claimed worlds hanging in a row, each on its iron tag
    opts.archive.slice(-7).forEach((e, i) => {
      const p = makePlanet(e.seed); for (const r of p.regions) r.state = 'veyr';
      const g = makeGlobe(p, 0.5, { ascended: true }); g.refresh();
      const at = ARCH.clone().add(new V3((i - 3) * 1.9, Math.sin(i * 1.7) * 0.5 + 0.4, -(i % 2) * 0.9));
      g.group.position.copy(at); this.scene.add(g.group);
      const tag = makeSign('world' + i, e.name.toUpperCase().slice(0, 14), 1.5, 0.34, 100 + i, { tip: `${e.regions} regions, ${e.species} species, claimed ${e.date}.` });
      tag.rest.copy(at).add(new V3(0, -0.95, 0.1)); tag.pos.copy(tag.rest); this.scene.add(tag.root);
      add(5, () => g.group.position.clone().add(new V3(-0.35, -0.42, 0)), () => tag.eye(0), 0.03, 0.06); add(5, () => g.group.position.clone().add(new V3(0.35, -0.42, 0)), () => tag.eye(1), 0.03, 0.06);
      this.worlds.push({ g, e, tag, at });
    });
    if (!this.worlds.length) {
      this.emptyTag = makeSign('none', 'NO WORLDS CLAIMED YET', 3.2, 0.5, 120, { tip: 'Claim a world for Earth and it will hang here, green, on its own tag.' });
      this.emptyTag.rest.copy(ARCH).add(new V3(0, 0.3, 0)); this.emptyTag.pos.copy(this.emptyTag.rest); this.scene.add(this.emptyTag.root);
      add(20, () => ARCH.clone().add(new V3(-1.2, 4.5, 0)), () => this.emptyTag!.eye(0)); add(20, () => ARCH.clone().add(new V3(1.2, 4.5, 0)), () => this.emptyTag!.eye(1));
    }
    // the overlay
    this.root = el('div', 'mn3', ui());
    el('div', 'tag', this.root, 'POINT AT A SIGN · <b>N</b> NEW WORLD · <b>C</b> CONTINUE · <b>A</b> ARCHIVE · <b>B</b> ASSEMBLY · <b>S</b> SEED · <b>O</b> SETTINGS');
    this.tipEl = el('div', 'tipx iron', this.root);
    this.backEl = el('div', 'btn back', this.root, '◀ BACK');
    this.backEl.addEventListener('click', (e) => { e.stopPropagation(); this.toMain(); });
    this.detEl = el('div', 'plate det iron', this.root);
    this.cardEl = el('div', 'pcard', this.root);
    this.setEl = el('div', 'plate enamel', this.root);
    this.cine = new Cinema({});
    this.cine.ui.root.remove(); ui().appendChild(this.cine.ui.root);
    this.bindInput();
    this.hum = cloop('drone', 0.35);
    this.cine.ui.fade(1, 0); this.cine.ui.fade(0, 1.6);
    this.off.push(onSettings(() => { if (this.mode === 'settings') this.drawSettings(); }));
    (window as any).__menu = this;
  }

  /** where a sign (or the gear) is on screen, in CSS pixels (test pages) */
  screenPos(id: string): [number, number] {
    const p = id === 'gear' ? this.gear.mesh.position.clone() : (this.signs.find((s) => s.id === id)?.pos.clone() ?? new V3());
    p.project(this.cam); return [Math.round((p.x * 0.5 + 0.5) * innerWidth), Math.round((-p.y * 0.5 + 0.5) * innerHeight)];
  }
  private sign(id: string) { return this.signs.find((s) => s.id === id) ?? null; }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const cv = document.getElementById('view') as HTMLCanvasElement;
    const setPtr = (e: PointerEvent) => { this.ptrX = e.clientX; this.ptrY = e.clientY; this.ptrIn = true; this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };
    const move = (e: PointerEvent) => setPtr(e);
    const down = (e: PointerEvent) => { if (e.target !== cv) return; setPtr(e); this.downAt = { x: e.clientX, y: e.clientY }; this.pick(); };
    const up = (e: PointerEvent) => {
      const d = this.downAt; this.downAt = null; if (!d || e.target !== cv) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14) return;
      setPtr(e); this.pick(); this.click();
      if (e.pointerType === 'touch') { this.ptrIn = false; setTimeout(() => { if (!this.downAt) this.clearHover(); }, 700); }
    };
    const leave = () => { this.ptrIn = false; this.clearHover(); };
    const key = (e: KeyboardEvent) => {
      if (this.closed || this.cine.active || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (this.mode === 'card') { this.cardKey(e); return; }
      if (k === 'Escape') { if (this.mode !== 'main') this.toMain(); return; }
      if (this.mode === 'archive' && (k === 'ArrowRight' || k === 'ArrowLeft')) { const n = this.worlds.length; if (n) this.focusWorld(((this.focus < 0 ? 0 : this.focus + (k === 'ArrowRight' ? 1 : -1)) + n) % n); return; }
      if (k === 'o' || k === 'g') { this.openSettings(); return; }
      const id = ({ n: 'new', c: 'continue', a: 'archive', b: 'assembly', s: 'seed' } as Record<string, string>)[k];
      const s = id ? this.sign(id) : null; if (s) this.work(s);
    };
    cv.addEventListener('pointermove', move); addEventListener('pointerdown', down); addEventListener('pointerup', up); cv.addEventListener('pointerleave', leave); addEventListener('keydown', key);
    this.off.push(() => { cv.removeEventListener('pointermove', move); removeEventListener('pointerdown', down); removeEventListener('pointerup', up); cv.removeEventListener('pointerleave', leave); removeEventListener('keydown', key); });
  }
  private clearHover() {
    if (this.hovered) this.hovered.hover = 0;
    this.hovered = null; this.hoverGear = false; this.hoverWorld = -1;
    this.tipEl.style.display = 'none'; this.tipHtml = ''; document.body.style.cursor = '';
  }
  /** what is under the pointer */
  private pick() {
    if (this.busy || this.cine.active || this.mode === 'launch' || this.mode === 'away' || this.mode === 'card' || this.mode === 'settings') { this.clearHover(); return; }
    this.ray.setFromCamera(this.ndc, this.cam);
    let best = 1e9, hs: Sign | null = null, hg = false, hw = -1;
    const pool = this.mode === 'main' ? [...this.signs, this.gearTag] : this.worlds.map((w) => w.tag).concat(this.emptyTag ? [this.emptyTag] : []);
    for (const s of pool) { const h = this.ray.intersectObject(s.plate, false)[0]; if (h && h.distance < best) { best = h.distance; hs = s; } }
    if (this.mode === 'main') { const h = this.ray.intersectObject(this.gear.mesh, true)[0]; if (h && h.distance < best) { best = h.distance; hs = null; hg = true; } }
    if (this.mode === 'archive') this.worlds.forEach((w, i) => { const h = this.ray.intersectObject(w.g.mesh, false)[0]; if (h && h.distance < best) { best = h.distance; hw = i; hs = null; } if (hs === w.tag) hw = i; });
    if (hs === this.gearTag) { hs = null; hg = true; }
    if (hs !== this.hovered) {
      if (this.hovered) this.hovered.hover = 0;
      this.hovered = hs; if (hs) { hs.hover = 1; csfx('hover', 0.7); csfx('tick', 0.5); }
    }
    if (hg !== this.hoverGear) { this.hoverGear = hg; if (hg) { csfx('servo', 0.25, 1.6); } }
    if (hw !== this.hoverWorld) { this.hoverWorld = hw; if (hw >= 0) csfx('hover', 0.6, 0.8); }
    this.gearTag.hover = hg ? 1 : 0;
    let html = '';
    const s = this.hovered;
    if (s) html = `<div class="h">${s.label}${s.key ? `<span class="k">${s.key}</span>` : ''}</div><div class="d">${s.tip}</div>` + (s.id === 'continue' && !s.enabled ? '<div class="w">NO MISSION IN PROGRESS</div>' : '');
    else if (hg) html = `<div class="h">SETTINGS<span class="k">O</span></div><div class="d">${this.gearTag.tip}</div>`;
    else if (hw >= 0) { const e = this.worlds[hw].e; html = `<div class="h">${e.name.toUpperCase()}</div><div class="d">${e.regions} REGIONS · ${e.species} SPECIES · CLAIMED ${e.date}</div>`; }
    if (html && this.ptrIn) {
      if (this.tipHtml !== html) { this.tipHtml = html; this.tipEl.innerHTML = html; }
      if (this.tipEl.style.display !== 'block') this.tipEl.style.display = 'block';
      const w = this.tipEl.offsetWidth, h = this.tipEl.offsetHeight;
      this.tipEl.style.left = Math.max(6, Math.min(innerWidth - w - 6, this.ptrX - w - 24)) + 'px'; this.tipEl.style.top = Math.max(6, Math.min(innerHeight - h - 6, this.ptrY - h / 2)) + 'px';
      document.body.style.cursor = 'pointer';
    } else { if (this.tipEl.style.display !== 'none') this.tipEl.style.display = 'none'; this.tipHtml = ''; document.body.style.cursor = ''; }
  }
  private click() {
    if (this.busy || this.cine.active) return;
    if (this.hoverGear) { this.openSettings(); return; }
    if (this.mode === 'archive') { if (this.hoverWorld >= 0) this.focusWorld(this.hoverWorld); else if (this.hovered === this.emptyTag && this.emptyTag) { kickSign(this.emptyTag, 0.6); csfx('clamp', 0.5); } return; }
    if (this.hovered) this.work(this.hovered);
  }

  // ------------------------------------------------------------------ working the signs
  private work(s: Sign) {
    if (this.busy || this.closed || this.mode === 'launch' || this.mode === 'away') return;
    Tip.hide();
    kickSign(s); csfx('clamp', 0.9, 0.8 + Math.random() * 0.3); csfx('leverLock', 0.6);
    if (!s.enabled) { csfx('deny'); kickSign(s, 0.5); this.tipEl.innerHTML = '<div class="h">CONTINUE</div><div class="w">NO MISSION IN PROGRESS</div>'; return; }
    const after = (f: () => void, ms = 380) => { this.busy = true; setTimeout(() => { this.busy = false; f(); }, ms); };
    switch (s.id) {
      case 'new': after(() => this.launch(Math.floor(Math.random() * 1e6))); break;
      case 'continue': after(() => { csfx('hum', 0.7); this.leave(() => this.opts.onContinue(), 0.9); }); break;
      case 'archive': after(() => this.toArchive(), 250); break;
      case 'seed': after(() => this.openCard(), 250); break;
      case 'assembly': after(() => {
        this.root.style.visibility = 'hidden'; this.cine.ui.root.style.visibility = 'hidden';
        this.opts.onMirror(() => { this.root.style.visibility = ''; this.cine.ui.root.style.visibility = ''; csfx('leverLock', 0.6); });
      }); break;
    }
  }

  // ------------------------------------------------------------------ settings: an iron plate
  private openSettings() {
    if (this.mode === 'launch' || this.mode === 'away') return;
    this.gearSpin += 6; csfx('servo', 0.6, 1.2); csfx('clamp', 0.6);
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
    csfx('whoosh', 0.5, 1.6);
  }
  private focusWorld(i: number) {
    const w = this.worlds[i]; if (!w) return;
    this.focus = i; csfx('chime', 0.4); kickSign(w.tag, 0.4);
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
  private closePanels() {
    this.detEl.style.display = 'none'; this.setEl.style.display = 'none'; this.backEl.style.display = 'none';
    if (this.mode === 'card') this.closeCard();
  }
  private toMain() {
    const was = this.mode;
    this.closePanels(); this.mode = 'main'; this.focus = -1; this.tipEl.style.display = 'none';
    if (was === 'archive') csfx('whoosh', 0.5, 1.3);
  }

  // ------------------------------------------------------------------ the punch card
  private openCard() {
    if (this.mode === 'card') return;
    this.closePanels(); this.mode = 'card'; this.clearHover();
    csfx('card'); csfx('cardFeed', 0.4);
    this.seedTxt = '';
    const c = this.cardEl; c.innerHTML = '';
    const hd = el('div', 'hd', c); el('span', '', hd, 'U.S.P.C. FORM 7-S · TARGET SEED'); el('span', '', hd, 'DO NOT FOLD, SPINDLE OR MUTILATE');
    const cols = el('div', 'cols', c);
    for (let i = 0; i < 9; i++) { const col = el('div', 'col', cols); el('div', 'ch', col, '&nbsp;'); const h = el('div', 'holes', col); for (let k = 0; k < 10; k++) el('i', '', h); }
    const row = el('div', 'row', c);
    el('div', 'hint', row, 'TYPE UP TO 9 LETTERS OR DIGITS. THE SAME CARD ALWAYS FINDS THE SAME WORLD.');
    const cancel = el('div', 'btn', row, 'ESC'); cancel.addEventListener('click', (e) => { e.stopPropagation(); this.toMain(); });
    const go = el('div', 'btn red', row, 'FEED CARD ▶'); go.addEventListener('click', (e) => { e.stopPropagation(); this.feedCard(); });
    const inp = el('input', '', c) as HTMLInputElement; inp.maxLength = 9; inp.autocapitalize = 'characters';
    inp.addEventListener('input', () => { this.seedTxt = inp.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 9); inp.value = this.seedTxt; this.drawCard(); csfx('card', 0.8); });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.feedCard(); if (e.key === 'Escape') this.toMain(); });
    c.addEventListener('pointerdown', (e) => { e.stopPropagation(); inp.focus(); });
    c.style.display = 'block';
    setTimeout(() => inp.focus({ preventScroll: true }), 50);
  }
  private cardKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { this.toMain(); return; }
    if (e.key === 'Enter') { this.feedCard(); return; }
    if (e.key === 'Backspace') { this.seedTxt = this.seedTxt.slice(0, -1); this.drawCard(); csfx('tick'); return; }
    if (/^[0-9a-zA-Z]$/.test(e.key) && this.seedTxt.length < 9) { this.seedTxt += e.key.toUpperCase(); this.drawCard(); csfx('card', 0.8); }
  }
  private drawCard() {
    this.cardEl.querySelectorAll('.col').forEach((col, i) => {
      const ch = this.seedTxt[i] ?? '';
      (col.querySelector('.ch') as HTMLElement).innerHTML = ch || '&nbsp;';
      const code = ch ? parseInt(ch, 36) : -1;
      col.querySelectorAll('i').forEach((h, k) => h.classList.toggle('p', code >= 0 && (code % 10 === k || (code >= 10 && Math.floor(code / 10) - 1 === k % 3 && k < 3))));
    });
    const inp = this.cardEl.querySelector('input'); if (inp && inp.value !== this.seedTxt) inp.value = this.seedTxt;
    this.nix.set(this.seedTxt ? String(Math.abs(parseInt(this.seedTxt, 36) || 1) % 100).padStart(2, '0') : '--');
  }
  private feedCard() {
    if (!this.seedTxt) { csfx('deny'); return; }
    const seed = Math.abs(parseInt(this.seedTxt, 36) || 1) % 1e9;
    this.closeCard(); csfx('cardFeed'); kickSign(this.seedTag, 0.8);
    this.busy = true; setTimeout(() => { this.busy = false; this.launch(seed); }, 450);
  }
  private closeCard() { this.cardEl.style.display = 'none'; this.cardEl.innerHTML = ''; if (this.mode === 'card') this.mode = 'main'; }

  // ------------------------------------------------------------------ setting out (the deploy sequence does the launch itself)
  private async launch(seed: number, offspring?: ArchiveEntry) {
    if (this.mode === 'launch') return;
    this.closePanels(); this.mode = 'launch'; this.busy = true; this.clearHover();
    this.root.classList.add('hide');
    const M = this.meteor.group.position.clone();
    const end = () => { this.close(() => (offspring ? this.opts.onLaunch(offspring) : this.opts.onNew(seed))); };
    await this.cine.play(async (c) => {
      c.cam.cut(this.cam.position.clone(), this.camLook.clone(), this.cam.fov);
      c.stamp(offspring ? `OFFSPRING OF ${offspring.name.toUpperCase()} \u00b7 SEED ${seed}` : `TARGET SEED ${seed}`, true);
      // the other signs swing clear; NEW WORLD stays to count it down on its nixies
      this.signs.forEach((s, i) => { if (s.id !== 'new') { kickSign(s, 0.7); setTimeout(() => (s.gone = 1), 120 + i * 90); } });
      this.title.gone = 0.6; this.gearTag.gone = 1;
      c.tween(2.6, (u) => { this.launchK = u * 0.6; }, 'in');
      c.cam.move({ pos: M.clone().add(new V3(2.6, 0.9, 4.6)), look: M.clone().add(new V3(0.6, -0.2, 0)), fov: 34, dur: 2.2, ease: 'inOut' });
      for (let n = 3; n >= 1; n--) { this.nix.set(String(n).padStart(2, '0')); c.sfx('beep', 0.6, n === 1 ? 1.25 : 1); kickSign(this.signs[0], 0.15); await c.wait(0.75); }
      this.nix.set('00'); c.sfx('beepHi', 0.7); this.signs[0].gone = 1;
      // down past the rock and the planet comes up to meet the camera
      c.sfx('whoosh', 0.8, 0.9); c.sfx('swell', 0.6);
      const target = PLANET.clone().addScaledVector(M.clone().sub(PLANET).normalize(), PLANET_R * 1.05);
      c.cam.move({ pos: target.clone().add(new V3(1.5, 3.5, 6)), look: PLANET.clone(), fov: 46, dur: 2.4, ease: 'inCubic' });
      c.say(offspring ? `Offspring of ${offspring.name}: target acquired.` : 'Target acquired. Bringing the carrier round, Seven.', { who: 'Station Four', style: 'radio', pitch: 0.8 });
      await c.wait(1.9);
      await c.fade(1, 0.5, '#d9d2bf');
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
    const t = this.t, met = this.meteor, L = this.launchK;
    this.cine.update(dt);
    // the meteor turns and drifts; its fissures breathe; the swarm orbits; dust glitters
    if (this.mode !== 'launch' || L < 1) {
      met.group.rotation.set(Math.sin(t * 0.13) * 0.12 + L * 0.4, Math.sin(t * 0.09) * 0.42 + t * 0.015, Math.sin(t * 0.11 + 1) * 0.08);
      if (this.mode !== 'launch') met.group.position.set(M0.x, M0.y + Math.sin(t * 0.32) * 0.13, M0.z + Math.sin(t * 0.21) * 0.08);
    }
    met.group.updateMatrixWorld();
    met.t.value = t; met.glow.value = 1 + L * 2.6 + (this.hovered?.id === 'new' ? 0.4 : 0);
    this.glowLight.intensity = 3.5 + L * 16;
    const ls = this.hovered ?? (this.hoverGear ? this.gearTag : null);
    if (ls) this.lamp.position.lerp(ls.pos.clone().add(new V3(0, ls.h * 0.9, 0.75)), Math.min(1, dt * 10));
    this.lamp.intensity += ((ls ? 6 + Math.sin(t * 31) * 0.25 : 0) - this.lamp.intensity) * Math.min(1, dt * 9);
    this.swarm.group.position.copy(met.group.position); this.swarm.update(dt, L);
    this.dust.points.position.copy(met.group.position); this.dust.update(t);
    // the lens follows the pointer
    const px = this.ptrIn ? this.ndc.x : Math.sin(t * 0.3) * 0.3, py = this.ptrIn ? this.ndc.y : Math.sin(t * 0.23) * 0.2;
    met.pupil.position.x += (Math.max(-1, Math.min(1, px + 0.5)) * 0.1 - met.pupil.position.x) * Math.min(1, dt * 6);
    met.pupil.position.y += (py * 0.08 - met.pupil.position.y) * Math.min(1, dt * 6);
    (met.pupil.material as THREE.MeshBasicMaterial).color.set(0x8fd0b8).multiplyScalar(1 + L * 1.6 + Math.max(0, Math.sin(t * 2.4)) * 0.15);
    this.globe.group.rotation.y += dt * 0.008; this.globe.mat.uniforms.uT.value = t;
    // the signs: springs, swings, chains
    for (const s of this.signs) stepSign(s, dt, t);
    stepSign(this.title, dt, t); stepSign(this.gearTag, dt, t);
    for (const w of this.worlds) { w.g.group.rotation.y += dt * (this.focus >= 0 && this.worlds[this.focus] === w ? 0.5 : 0.15); w.g.mat.uniforms.uT.value = t; w.tag.hover = this.hoverWorld >= 0 && this.worlds[this.hoverWorld] === w ? 1 : 0; stepSign(w.tag, dt, t); w.g.group.position.y = w.at.y + Math.sin(t * 0.5 + w.at.x) * 0.06; }
    if (this.emptyTag) stepSign(this.emptyTag, dt, t);
    for (const ch of this.chains) ch.c.update(ch.a(), ch.b(), ch.sag);
    // the cog
    this.gearHover += ((this.hoverGear ? 1 : 0) - this.gearHover) * Math.min(1, dt * 8);
    this.gearSpin *= Math.exp(-dt * 1.5);
    this.gear.mesh.rotation.z -= dt * (0.25 + this.gearHover * 2.2 + this.gearSpin);
    this.gear.mesh.rotation.y = Math.sin(t * 0.4) * 0.15 - 0.25; this.gear.mesh.position.y = -2.15 + Math.sin(t * 0.6) * 0.05;
    this.fx.update(dt, innerHeight, this.cam.fov);
    // the camera: a drift and a lean toward the pointer, framed by the mode
    if (this.cine.active) { this.cine.apply(this.cam); return; }
    const qx = this.ptrIn ? this.ndc.x : 0, qy = this.ptrIn ? this.ndc.y : 0;
    this.par.x += (qx - this.par.x) * Math.min(1, dt * 2.2); this.par.y += (qy - this.par.y) * Math.min(1, dt * 2.2);
    let pos: THREE.Vector3, look: THREE.Vector3, fov = 38;
    if (this.mode === 'archive') {
      const w = this.focus >= 0 ? this.worlds[this.focus] : null;
      if (w) { pos = w.at.clone().add(new V3(-0.8, 0.1, 3.2)); look = w.at.clone().add(new V3(0.55, -0.2, 0)); fov = 34; }
      else { pos = ARCH.clone().add(new V3(0, 0.4, 9.5)); look = ARCH.clone().add(new V3(0, -0.1, 0)); fov = 40; }
    } else if (this.mode === 'settings' || this.mode === 'card') { pos = new V3(0.2, 0.4, 10.6); look = new V3(0.1, 0.15, 0); fov = 40; }
    else { pos = new V3(0.5, 0.25, 9.4); look = new V3(0.6, 0.0, 0); }
    pos.x += this.par.x * 0.42 + Math.sin(t * 0.11) * 0.12; pos.y += this.par.y * 0.24 + Math.sin(t * 0.17) * 0.07;
    look.x += this.par.x * 0.3; look.y += this.par.y * 0.18;
    const k = 1 - Math.exp(-dt * 2.4);
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
    this.cam.position.copy(this.camPos); this.cam.lookAt(this.camLook);
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov += (fov - this.cam.fov) * k; this.cam.updateProjectionMatrix(); }
    this.cam.updateMatrixWorld();
    if (this.ptrIn && !this.downAt) this.pick();
  }
  render(post: Post, t: number) {
    resetGrade(post.grade); post.grade.bloom = 0.45; post.grade.vig = 0.5; post.grade.sat = 0.96;
    post.render(this.scene, this.cam, this.fxScene, t);
  }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); fontVars(); }
  private close(then: () => void) {
    if (this.closed) return;
    this.closed = true; this.dispose(); then();
  }
  dispose() {
    this.closed = true;
    this.off.forEach((f) => f()); this.off = [];
    this.hum?.stop(0.4); this.hum = null;
    this.root.remove(); this.cine.dispose(); Tip.hide(); document.body.style.cursor = '';
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
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.34, 6), mat({ color: 0xc9d0d4, phong: true })); pole.position.y = 0.17; this.flag.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), mat({ color: 0xd8ab50, phong: true })); knob.position.y = 0.345; this.flag.add(knob);
    const fp = new Pix(32, 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 32; x++) fp.set(x, y, Math.floor(y / 3) % 2 ? CR[4] : RD[4]);
    for (let y = 0; y < 11; y++) for (let x = 0; x < 13; x++) fp.set(x, y, 0x1c2e6a);
    for (const [x, y] of [[2, 2], [6, 2], [10, 2], [4, 5], [8, 5], [2, 8], [6, 8], [10, 8]]) fp.set(x, y, 0xffffff);
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
