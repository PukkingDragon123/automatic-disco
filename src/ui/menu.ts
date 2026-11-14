// The main menu is a place: U.S.P.C. Launch Control 4, an orbital hangar. Unit 07 stands in its launch cradle on
// a rail aimed through a huge window at the target world; the options are the physical controls on the
// operator's desk. Hover lights them and outlines them; clicking works them: the RESUME lever throws, the
// ARCHIVE selector turns (the camera walks to the gallery of claimed worlds on their stands), the LAUNCH cover
// flips up and the button goes down (klaxons, nixie countdown, the blast shutter opens, the cradle fires, the
// camera chases the golem out of the window at the planet), the SEED CARD reader takes a hand-punched card, the
// ASSEMBLY BAY knife switch closes. The camera drifts and leans with the mouse (or a finger).
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
import { VeyrChild } from '../game/child';
import { loadLook } from '../game/babyLook';
import { buildRoom, type Room, type Control } from './cineRoom';
import { Cinema } from '../game/cinema';
import { csfx, cloop, type Loop } from './cineAudio';
import { brassWord } from './machine';
import { setHover, mat, glowMat, tex, roundelTex, labelTex, Pix, CR, RD } from './cineKit';
import { iconURL } from './icons';
import { gbuf } from '../gfx/gbuf';

export interface ArchiveEntry { seed: number; name: string; date: string; species: number; genes: string[]; regions: number }

const V3 = THREE.Vector3;
const CSS = /* css */`
.mn3 { position: fixed; inset: 0; pointer-events: none !important; z-index: 3; font-family: 'VT', monospace; --u: calc(1px * var(--s, 2)); }
.mn3 > * { pointer-events: auto; }
.mn3 .logo { position: absolute; left: calc(10 * var(--u)); top: calc(8 * var(--u)); pointer-events: none; filter: drop-shadow(0 calc(2 * var(--u)) 0 rgba(0,0,0,0.6)); }
.mn3 .logo canvas { image-rendering: pixelated; display: block; }
.mn3 .tag { font-size: calc(8 * var(--u)); color: var(--gold, #ffcd6e); text-shadow: var(--amb-glow); letter-spacing: 1px; margin-top: calc(2 * var(--u)); }
.mn3 .tag .cur { animation: mn-blink 0.9s steps(2) infinite; }
@keyframes mn-blink { 50% { opacity: 0; } }
.mn3 .foot { position: absolute; left: 0; right: 0; bottom: calc(5 * var(--u)); text-align: center; font-size: calc(7 * var(--u)); color: rgba(230, 220, 184, 0.55); letter-spacing: 1px; pointer-events: none; }
.mn3 .foot b { color: var(--gold, #ffcd6e); font-weight: normal; }
.mn3 .tipx { position: fixed; display: none; pointer-events: none !important; padding: calc(3 * var(--u)) calc(6 * var(--u)); background: radial-gradient(ellipse at 50% 45%, #0c3418 0%, #06180c 60%, #031008 100%); border: calc(2 * var(--u)) solid #2a3121; outline: calc(1 * var(--u)) solid #07080a; border-radius: calc(3 * var(--u)); color: var(--ink, #b8f0b4); text-shadow: var(--phos-glow); max-width: calc(170 * var(--u)); animation: mn-crt 160ms steps(4); }
@keyframes mn-crt { 0% { transform: scaleY(0.1); opacity: 0.4; } 100% { transform: none; opacity: 1; } }
.mn3 .tipx .h { font-size: calc(10 * var(--u)); line-height: calc(10 * var(--u)); color: var(--gold, #ffcd6e); text-shadow: var(--amb-glow); }
.mn3 .tipx .h .k { float: right; margin-left: calc(8 * var(--u)); color: #0c1a10; background: var(--gold, #ffcd6e); padding: 0 calc(2 * var(--u)); text-shadow: none; }
.mn3 .tipx .d { font-size: calc(8 * var(--u)); line-height: calc(8 * var(--u)); margin-top: calc(2 * var(--u)); }
.mn3 .tipx .w { font-size: calc(8 * var(--u)); color: var(--warn, #ff6c44); margin-top: calc(2 * var(--u)); }
.mn3 .back { position: absolute; left: calc(10 * var(--u)); bottom: calc(18 * var(--u)); display: none; padding: calc(3 * var(--u)) calc(8 * var(--u)); background: linear-gradient(180deg, #5a6644, #38412b); border: calc(2 * var(--u)) solid #171a12; box-shadow: 0 0 0 calc(1 * var(--u)) #8a956a inset, 0 calc(2 * var(--u)) 0 #000; color: #ece4c6; font-size: calc(9 * var(--u)); cursor: pointer; letter-spacing: 1px; }
.mn3 .back:hover { color: var(--gold, #ffcd6e); }
.mn3 .back:active { transform: translateY(calc(1 * var(--u))); box-shadow: 0 0 0 calc(1 * var(--u)) #8a956a inset; }
.mn3 .det { position: absolute; right: calc(10 * var(--u)); top: 50%; transform: translateY(-50%); width: calc(150 * var(--u)); display: none; padding: calc(6 * var(--u)); background: radial-gradient(ellipse at 50% 45%, #0c3418 0%, #06180c 60%, #031008 100%); border: calc(3 * var(--u)) solid #2a3121; outline: calc(1 * var(--u)) solid #07080a; box-shadow: 0 0 0 calc(1 * var(--u)) #5a6644 inset, 0 calc(4 * var(--u)) 0 rgba(0,0,0,0.6); border-radius: calc(3 * var(--u)); color: var(--ink, #b8f0b4); text-shadow: var(--phos-glow); animation: mn-crt 200ms steps(5); }
.mn3 .det .n { font-family: 'Jersey', monospace; font-size: calc(18 * var(--u)); line-height: calc(16 * var(--u)); color: var(--gold, #ffcd6e); text-shadow: var(--amb-glow); }
.mn3 .det .s { font-size: calc(8 * var(--u)); line-height: calc(8 * var(--u)); margin: calc(3 * var(--u)) 0; }
.mn3 .det .gn { display: flex; flex-wrap: wrap; gap: calc(2 * var(--u)); margin: calc(3 * var(--u)) 0 calc(6 * var(--u)); }
.mn3 .det .gn span { font-size: calc(7 * var(--u)); border: calc(1 * var(--u)) solid #2a6a34; padding: 0 calc(2 * var(--u)); color: #c0ffc6; }
.mn3 .big { display: flex; align-items: center; justify-content: center; gap: calc(4 * var(--u)); width: 100%; padding: calc(4 * var(--u)); background: radial-gradient(circle at 50% 35%, #ff7a5a, #c8301e 55%, #7a140a); border: calc(2 * var(--u)) solid #2a0a06; border-radius: calc(4 * var(--u)); box-shadow: 0 calc(3 * var(--u)) 0 #4a0c06, 0 0 0 calc(1 * var(--u)) #ffb090 inset; color: #fff0e0; font-family: 'VT', monospace; font-size: calc(10 * var(--u)); letter-spacing: 1px; cursor: pointer; text-shadow: 0 calc(1 * var(--u)) 0 #4a0c06; }
.mn3 .big:hover { filter: brightness(1.15); }
.mn3 .big:active { transform: translateY(calc(2 * var(--u))); box-shadow: 0 calc(1 * var(--u)) 0 #4a0c06, 0 0 0 calc(1 * var(--u)) #ffb090 inset; }
.mn3 .big img { width: calc(18 * var(--u)); height: calc(18 * var(--u)); image-rendering: pixelated; }
/* the punch card */
.mn3 .pcard { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%) rotate(-1deg); display: none; width: min(92vw, calc(260 * var(--u))); padding: calc(6 * var(--u)) calc(8 * var(--u)) calc(8 * var(--u)); background: linear-gradient(180deg, #f2ead2, #e4dab8); color: #3a2a18; box-shadow: calc(3 * var(--u)) calc(4 * var(--u)) 0 rgba(0, 0, 0, 0.55); clip-path: polygon(calc(10 * var(--u)) 0, 100% 0, 100% 100%, 0 100%, 0 calc(10 * var(--u))); animation: mn-card 360ms cubic-bezier(.2,1.4,.4,1); }
@keyframes mn-card { 0% { transform: translate(-50%, 30%) rotate(4deg); opacity: 0; } 100% { transform: translate(-50%, -50%) rotate(-1deg); opacity: 1; } }
.mn3 .pcard .hd { display: flex; justify-content: space-between; font-family: 'Silk', monospace; font-size: calc(6 * var(--u)); color: #a8321c; letter-spacing: 1px; }
.mn3 .pcard .cols { display: grid; grid-template-columns: repeat(9, 1fr); gap: calc(3 * var(--u)); margin: calc(5 * var(--u)) 0; }
.mn3 .pcard .col { display: flex; flex-direction: column; align-items: center; gap: calc(1 * var(--u)); }
.mn3 .pcard .ch { font-size: calc(12 * var(--u)); line-height: calc(11 * var(--u)); height: calc(11 * var(--u)); color: #2a1c10; }
.mn3 .pcard .holes { display: grid; grid-template-rows: repeat(10, calc(3 * var(--u))); gap: calc(1 * var(--u)); }
.mn3 .pcard .holes i { display: block; width: calc(4 * var(--u)); height: calc(3 * var(--u)); background: rgba(90, 70, 40, 0.18); }
.mn3 .pcard .holes i.p { background: #1a120a; animation: mn-punch 140ms steps(2); }
@keyframes mn-punch { 0% { transform: scale(1.8); } 100% { transform: none; } }
.mn3 .pcard .row { display: flex; gap: calc(4 * var(--u)); align-items: center; }
.mn3 .pcard input { position: absolute; opacity: 0; pointer-events: none; }
.mn3 .pcard .hint { flex: 1; font-size: calc(7 * var(--u)); color: #6a5a3a; }
.mn3 .pcard .btn { padding: calc(2 * var(--u)) calc(6 * var(--u)); border: calc(2 * var(--u)) solid #3a2a18; background: #d8ccaa; font-family: 'VT', monospace; font-size: calc(9 * var(--u)); color: #2a1c10; cursor: pointer; }
.mn3 .pcard .btn.go { background: #c8301e; color: #fff0e0; border-color: #4a0c06; }
.mn3 .pcard .btn:active { transform: translateY(calc(1 * var(--u))); }
.mn3.hide > :not(.tipx) { visibility: hidden; }
`;
let styled = false;
function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }

/** a rough asteroid shell for the launch (the golem curls inside it) */
function shellMesh() {
  const g = new THREE.IcosahedronGeometry(1.25, 2);
  const p = g.attributes.position as THREE.BufferAttribute, v = new V3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); v.multiplyScalar(0.82 + Math.abs(Math.sin(v.x * 7.1) * Math.cos(v.y * 5.3 + v.z * 3.1)) * 0.3); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const m = new THREE.MeshLambertMaterial({ color: 0x3a3442, emissive: new THREE.Color(0xff6a20), emissiveIntensity: 0, flatShading: true }); gbuf(m, 1);
  return new THREE.Mesh(g, m);
}

type Mode = 'console' | 'archive' | 'card' | 'launch' | 'away';
export class MenuScreen implements Screen {
  private scene = new THREE.Scene(); private fxScene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
  private fx: Fx; private room: Room; private golem: VeyrChild; private globe: Globe; private moon: THREE.Mesh;
  private shell: THREE.Mesh;
  private worlds: { g: Globe; e: ArchiveEntry; i: number }[] = [];
  private root: HTMLDivElement; private tipEl: HTMLDivElement; private backEl: HTMLDivElement; private detEl: HTMLDivElement; private cardEl: HTMLDivElement;
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2(); private ptrIn = false; private ptrX = 0; private ptrY = 0;
  private par = new THREE.Vector2();
  private hovered: Control | null = null; private hoverStand = -1;
  private mode: Mode = 'console'; private focus = -1;
  private t = 0;
  private camPos = new V3(0, 2.35, 4.2); private camLook = new V3(0.3, 0.95, -4.5);
  private cine: Cinema;
  private hum: Loop | null = null;
  private anims: { c: Control; from: number; to: number; t: number; dur: number; done?: () => void }[] = [];
  private busy = false; private closed = false;
  private seedTxt = '';
  private downAt: { x: number; y: number; t: number } | null = null;
  private off: (() => void)[] = [];
  private knobTurns = 0;
  private tipHtml = '';

  constructor(readonly opts: { hasSave: boolean; archive: ArchiveEntry[]; onNew: (seed: number) => void; onContinue: () => void; onLaunch: (e: ArchiveEntry) => void; onMirror: (back: () => void) => void }) {
    style();
    this.scene.background = new THREE.Color(0x02040a);
    this.scene.add(stars(2200, 120));
    this.fx = new Fx(this.fxScene, this.scene);
    // the target world through the window, and a small moon
    const planet: Planet = makePlanet(1000 + Math.floor(Math.random() * 9000));
    this.globe = makeGlobe(planet, 9);
    this.globe.group.position.set(-3.2, 3.6, -34); this.globe.group.rotation.set(0.25, 0, 0.18);
    this.scene.add(this.globe.group);
    this.moon = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 2), gbuf(new THREE.MeshLambertMaterial({ color: 0x8a8490, flatShading: true }), 1));
    this.moon.position.set(9, 7.5, -48); this.scene.add(this.moon);
    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), glowMat(0xfff4e0)); sunDisc.position.set(16, 11, -80); sunDisc.lookAt(0, 0, 0); this.scene.add(sunDisc);
    // the hangar
    const nStands = Math.max(4, Math.min(7, opts.archive.length + 1));
    this.room = buildRoom(this.scene, nStands);
    // Unit 07 in its cradle, facing the operator
    this.golem = new VeyrChild(this.fx, 1.25, loadLook(), { grown: true });
    this.golem.hatch = 1;
    this.golem.root.position.copy(this.room.golemAt);
    this.golem.root.rotation.y = 0.35;
    this.scene.add(this.golem.root);
    this.shell = shellMesh(); this.shell.scale.setScalar(0.001); this.shell.visible = false; this.scene.add(this.shell);
    // claimed worlds on their stands
    opts.archive.slice(-this.room.stands.length).forEach((e, i) => {
      const p = makePlanet(e.seed); for (const r of p.regions) r.state = 'veyr';
      const g = makeGlobe(p, 0.3, { ascended: true });
      g.group.position.copy(this.room.stands[i].top); g.refresh(); this.scene.add(g.group);
      this.worlds.push({ g, e, i });
      const st = this.room.stands[i];
      const pm = st.plate.material as THREE.MeshLambertMaterial; pm.map = labelTex(e.name.toUpperCase().slice(0, 16), 'brass'); pm.needsUpdate = true;
    });
    // the overlay
    this.root = el('div', 'mn3', ui());
    const logo = el('div', 'logo', this.root);
    brassWord('ODDWORLD', 'Jersey', 40).then((c) => { const s = Number(document.documentElement.style.getPropertyValue('--s')) || 2; c.style.width = c.width * s + 'px'; c.style.height = c.height * s + 'px'; logo.prepend(c); });
    el('div', 'tag', logo, 'U.S.P.C. LAUNCH CONTROL 4 · TAKE THE WORLD FOR EARTH<span class="cur">&#9608;</span>');
    el('div', 'foot', this.root, 'WORK THE CONTROLS ON THE DESK · <b>N</b> LAUNCH · <b>C</b> RESUME · <b>A</b> ARCHIVE · <b>B</b> ASSEMBLY · <b>S</b> SEED CARD');
    this.tipEl = el('div', 'tipx', this.root);
    this.backEl = el('div', 'back', this.root, '◀ BACK TO THE DESK');
    this.backEl.addEventListener('click', (e) => { e.stopPropagation(); this.toConsole(); });
    this.detEl = el('div', 'det', this.root);
    this.cardEl = el('div', 'pcard', this.root);
    this.plaque();
    // lever locked without a save
    const lever = this.ctl('continue'); if (lever) lever.enabled = opts.hasSave;
    if (!opts.hasSave && lever?.lamp) lever.lamp.color.set(0x401010);
    this.cine = new Cinema({});
    this.cine.ui.root.remove(); ui().appendChild(this.cine.ui.root);
    this.room.nixies.set('000000');
    this.bindInput();
    this.hum = cloop('room', 0.7);
    csfx('relay'); csfx('hum', 0.6);
    this.cine.ui.fade(1, 0); this.cine.ui.fade(0, 1.4);
    (window as any).__menu = this;
  }

  private ctl(id: string) { return this.room.controls.find((c) => c.id === id) ?? null; }
  /** where a control (or archive stand n) is on screen, in CSS pixels (test pages) */
  screenPos(id: string): [number, number] {
    const p = new V3();
    if (id.startsWith('stand')) p.copy(this.room.stands[Number(id.slice(5))]?.top ?? p); else this.ctl(id)?.root.getWorldPosition(p);
    p.project(this.cam); return [Math.round((p.x * 0.5 + 0.5) * innerWidth), Math.round((-p.y * 0.5 + 0.5) * innerHeight)];
  }
  private async plaque() {
    try {
      const c = await brassWord('ODDWORLD', 'Jersey', 40);
      const m = this.room.plaque.material as THREE.MeshLambertMaterial;
      const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
      m.map = t; m.color.set(0xffffff); m.transparent = false; m.alphaTest = 0.4; m.needsUpdate = true;
      this.room.plaque.scale.set(1, (c.height / c.width) * 4.4 / 1.1, 1);
    } catch { /* the plaque stays plain */ }
  }

  // ------------------------------------------------------------------ input
  private bindInput() {
    const cv = document.getElementById('view') as HTMLCanvasElement;
    const setPtr = (e: PointerEvent) => { this.ptrX = e.clientX; this.ptrY = e.clientY; this.ptrIn = true; this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };
    const move = (e: PointerEvent) => { setPtr(e); if (e.pointerType === 'touch' && this.downAt) { this.par.x += e.movementX * 0.004; this.par.y += e.movementY * 0.004; } };
    const down = (e: PointerEvent) => { if (e.target !== cv) return; setPtr(e); this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; this.pick(); };
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
      if (k === 'Escape') { if (this.mode !== 'console') this.toConsole(); return; }
      if (this.mode === 'archive' && (k === 'ArrowRight' || k === 'ArrowLeft')) { const n = this.worlds.length; if (n) this.focusWorld(((this.focus < 0 ? 0 : this.focus + (k === 'ArrowRight' ? 1 : -1)) + n) % n); return; }
      const id = { n: 'new', c: 'continue', a: 'archive', b: 'assembly', s: 'seed' }[k as 'n'];
      if (id) { const c = this.ctl(id); if (c) this.activate(c); }
    };
    cv.addEventListener('pointermove', move); addEventListener('pointerdown', down); addEventListener('pointerup', up); cv.addEventListener('pointerleave', leave); addEventListener('keydown', key);
    this.off.push(() => { cv.removeEventListener('pointermove', move); removeEventListener('pointerdown', down); removeEventListener('pointerup', up); cv.removeEventListener('pointerleave', leave); removeEventListener('keydown', key); });
  }
  private clearHover() {
    if (this.hovered) { setHover(this.hovered.flag, false); this.hovered = null; }
    if (this.hoverStand >= 0) { setHover(this.room.stands[this.hoverStand].flag, false); this.hoverStand = -1; }
    this.tipEl.style.display = 'none'; document.body.style.cursor = '';
  }
  /** what is under the pointer (a control on the desk, or a stand in the gallery) */
  private pick() {
    if (this.busy || this.cine.active || this.mode === 'launch' || this.mode === 'away' || this.mode === 'card') { this.clearHover(); return; }
    this.ray.setFromCamera(this.ndc, this.cam);
    let hitC: Control | null = null, hitS = -1, best = 1e9;
    if (this.mode === 'console' || this.mode === 'archive') for (const c of this.room.controls) {
      const h = this.ray.intersectObjects(c.hits, true)[0];
      if (h && h.distance < best) { best = h.distance; hitC = c; }
    }
    if (this.mode === 'archive') this.room.stands.forEach((s, i) => {
      const w = this.worlds.find((x) => x.i === i);
      const objs: THREE.Object3D[] = [s.hit, ...(w ? [w.g.mesh] : [])];
      const h = this.ray.intersectObjects(objs, true)[0];
      if (h && h.distance < best) { best = h.distance; hitS = i; hitC = null; }
    });
    if (hitC !== this.hovered) {
      if (this.hovered) setHover(this.hovered.flag, false);
      this.hovered = hitC;
      if (hitC) { setHover(hitC.flag, true); csfx('hover', 0.7); }
    }
    if (hitS !== this.hoverStand) {
      if (this.hoverStand >= 0) setHover(this.room.stands[this.hoverStand].flag, false);
      this.hoverStand = hitS;
      if (hitS >= 0) { setHover(this.room.stands[hitS].flag, true); csfx('hover', 0.6, 0.8); }
    }
    // the tooltip: a little CRT that follows the pointer
    const c = this.hovered;
    let html = '';
    if (c) html = `<div class="h">${c.label}<span class="k">${c.key}</span></div><div class="d">${c.tip}</div>` + (c.id === 'continue' && !c.enabled ? '<div class="w">NO MISSION IN PROGRESS</div>' : '') + (c.id === 'archive' && !this.worlds.length ? '<div class="w">NO WORLDS CLAIMED YET</div>' : '');
    else if (hitS >= 0) { const w = this.worlds.find((x) => x.i === hitS); html = w ? `<div class="h">${w.e.name.toUpperCase()}</div><div class="d">${w.e.regions} REGIONS · ${w.e.species} SPECIES · CLAIMED ${w.e.date}</div>` : '<div class="h">AWAITING CLAIM</div><div class="d">An empty stand. Claim a world and it will hang here.</div>'; }
    if (html && this.ptrIn) {
      if (this.tipHtml !== html) { this.tipHtml = html; this.tipEl.innerHTML = html; }
      if (this.tipEl.style.display !== 'block') this.tipEl.style.display = 'block';
      const w = this.tipEl.offsetWidth, h = this.tipEl.offsetHeight;
      this.tipEl.style.left = Math.min(innerWidth - w - 6, this.ptrX + 18) + 'px'; this.tipEl.style.top = Math.max(6, Math.min(innerHeight - h - 6, this.ptrY - h - 12)) + 'px';
      document.body.style.cursor = 'pointer';
    } else { if (this.tipEl.style.display !== 'none') this.tipEl.style.display = 'none'; this.tipHtml = ''; document.body.style.cursor = ''; }
  }
  private click() {
    if (this.busy || this.cine.active) return;
    if (this.hovered) { this.activate(this.hovered); return; }
    if (this.mode === 'archive' && this.hoverStand >= 0) {
      const w = this.worlds.find((x) => x.i === this.hoverStand);
      if (w) this.focusWorld(this.worlds.indexOf(w)); else csfx('deny', 0.6);
    }
  }
  private play(c: Control, to: number, dur: number, done?: () => void) { this.anims = this.anims.filter((a) => a.c !== c); this.anims.push({ c, from: c.anim, to, t: 0, dur, done }); }

  // ------------------------------------------------------------------ the controls
  private activate(c: Control) {
    if (this.busy || this.closed || this.mode === 'launch' || this.mode === 'away') return;
    Tip.hide();
    switch (c.id) {
      case 'new': {
        this.busy = true; csfx('cover'); this.lamp(c, true);
        this.play(c, 1, 0.9, () => { csfx('button'); this.launch(Math.floor(Math.random() * 1e6)); });
        setTimeout(() => csfx('button', 0.8), 620);
        break;
      }
      case 'continue': {
        if (!c.enabled) { csfx('deny'); csfx('leverLock', 0.8); this.play(c, 0.18, 0.12, () => this.play(c, 0, 0.25)); this.flashTip(); return; }
        this.busy = true; csfx('lever'); this.lamp(c, true);
        this.play(c, 1, 0.45, () => { csfx('relay'); csfx('hum', 0.7); this.leave(() => this.opts.onContinue(), 0.9); });
        break;
      }
      case 'archive': {
        csfx('switch'); csfx('relay', 0.6, 0.8);
        this.knobTurns++;
        this.play(c, this.knobTurns, 0.3);
        if (this.mode === 'archive') this.toConsole(); else this.toArchive();
        break;
      }
      case 'seed': this.openCard(); break;
      case 'assembly': {
        this.busy = true; csfx('switch', 1, 0.7); this.lamp(c, true);
        this.play(c, 1, 0.35, () => {
          csfx('relay'); csfx('hum', 0.8);
          const p = new V3(); c.root.getWorldPosition(p);
          this.fx.burst(p.x, p.y + 0.08, p.z, 14, 0xffd890, { glow: true, speed: 1.6, up: 1.4, size: 2, life: 0.4, grav: 6 });
          setTimeout(() => {
            this.root.style.visibility = 'hidden'; this.cine.ui.root.style.visibility = 'hidden';
            this.opts.onMirror(() => {
              this.root.style.visibility = ''; this.cine.ui.root.style.visibility = '';
              this.golem.setLook(loadLook()); this.golem.wave();
              this.play(c, 0, 0.4); this.lamp(c, false); this.busy = false; csfx('leverLock', 0.6);
            });
          }, 380);
        });
        break;
      }
    }
  }
  private lamp(c: Control, on: boolean) { if (c.lamp) c.lamp.color.set(on ? c.lampCol : new THREE.Color(c.lampCol).multiplyScalar(0.18)); }
  private flashTip() { this.tipEl.style.animation = 'none'; void this.tipEl.offsetWidth; this.tipEl.style.animation = ''; }

  // ------------------------------------------------------------------ the archive gallery
  private toArchive() {
    this.mode = 'archive'; this.focus = -1;
    this.backEl.style.display = 'block'; this.detEl.style.display = 'none';
    csfx('servo', 0.5, 0.8);
    if (!this.worlds.length) setTimeout(() => { if (this.mode === 'archive') { this.tipEl.innerHTML = '<div class="h">THE GALLERY IS EMPTY</div><div class="d">Claim a world for Earth and it will hang here, green, on its own stand.</div>'; this.tipEl.style.display = 'block'; this.tipEl.style.left = innerWidth / 2 - this.tipEl.offsetWidth / 2 + 'px'; this.tipEl.style.top = innerHeight * 0.3 + 'px'; } }, 900);
  }
  private focusWorld(i: number) {
    const w = this.worlds[i]; if (!w) return;
    this.focus = i; csfx('servo', 0.4, 1.2); csfx('chime', 0.4);
    const e = w.e, d = this.detEl;
    d.innerHTML = '';
    el('div', 'n', d, e.name.toUpperCase());
    el('div', 's', d, `CLAIMED FOR EARTH ${e.date}<br>${e.regions} REGIONS · ${e.species} SPECIES IN ITS TREE · ${e.genes.length} GENES`);
    const gn = el('div', 'gn', d);
    for (const id of e.genes.slice(0, 18)) if (GENE[id]) el('span', '', gn, GENE[id].name.toUpperCase());
    const b = el('div', 'big', d);
    const im = document.createElement('img'); im.src = iconURL('planet', 36); b.appendChild(im);
    el('span', '', b, 'LAUNCH OFFSPRING');
    b.title = 'Throw a seed of this world at a new one. It carries three of its genes.';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); csfx('button'); this.launch(Math.floor(Math.random() * 1e6), e); });
    d.style.display = 'block';
  }
  private toConsole() {
    if (this.mode === 'card') this.closeCard();
    this.mode = 'console'; this.focus = -1;
    this.backEl.style.display = 'none'; this.detEl.style.display = 'none'; this.tipEl.style.display = 'none';
    csfx('servo', 0.5, 0.7);
  }

  // ------------------------------------------------------------------ the punch card
  private openCard() {
    if (this.mode === 'card') return;
    this.mode = 'card'; this.clearHover();
    const rd = this.room.reader; this.play(rd, -0.6, 0.3); csfx('card'); csfx('cardFeed', 0.4);
    this.seedTxt = '';
    const c = this.cardEl; c.innerHTML = '';
    const hd = el('div', 'hd', c); el('span', '', hd, 'U.S.P.C. FORM 7-S · TARGET SEED'); el('span', '', hd, 'DO NOT FOLD, SPINDLE OR MUTILATE');
    const cols = el('div', 'cols', c);
    for (let i = 0; i < 9; i++) { const col = el('div', 'col', cols); el('div', 'ch', col, '&nbsp;'); const h = el('div', 'holes', col); for (let k = 0; k < 10; k++) el('i', '', h); }
    const row = el('div', 'row', c);
    el('div', 'hint', row, 'TYPE UP TO 9 LETTERS OR DIGITS. THE SAME CARD ALWAYS FINDS THE SAME WORLD.');
    const cancel = el('div', 'btn', row, 'ESC CANCEL'); cancel.addEventListener('click', (e) => { e.stopPropagation(); this.toConsole(); });
    const go = el('div', 'btn go', row, 'FEED CARD ▶'); go.addEventListener('click', (e) => { e.stopPropagation(); this.feedCard(); });
    // a hidden input so phones raise a keyboard
    const inp = el('input', '', c) as HTMLInputElement; inp.maxLength = 9; inp.autocapitalize = 'characters';
    inp.addEventListener('input', () => { this.seedTxt = inp.value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 9); inp.value = this.seedTxt; this.drawCard(); csfx('card', 0.8); });
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.feedCard(); if (e.key === 'Escape') this.toConsole(); });
    c.addEventListener('pointerdown', (e) => { e.stopPropagation(); inp.focus(); });
    c.style.display = 'block';
    setTimeout(() => inp.focus(), 50);
    this.backEl.style.display = 'none';
  }
  private cardKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { this.toConsole(); return; }
    if (e.key === 'Enter') { this.feedCard(); return; }
    if (e.key === 'Backspace') { this.seedTxt = this.seedTxt.slice(0, -1); this.drawCard(); csfx('tick'); return; }
    if (/^[0-9a-zA-Z]$/.test(e.key) && this.seedTxt.length < 9) { this.seedTxt += e.key.toUpperCase(); this.drawCard(); csfx('card', 0.8); }
  }
  private drawCard() {
    const cols = this.cardEl.querySelectorAll('.col');
    cols.forEach((col, i) => {
      const ch = this.seedTxt[i] ?? '';
      (col.querySelector('.ch') as HTMLElement).innerHTML = ch || '&nbsp;';
      const code = ch ? parseInt(ch, 36) : -1;
      col.querySelectorAll('i').forEach((h, k) => h.classList.toggle('p', code >= 0 && (code % 10 === k || (code >= 10 && Math.floor(code / 10) - 1 === k % 3 && k < 3))));
    });
    const inp = this.cardEl.querySelector('input'); if (inp && inp.value !== this.seedTxt) inp.value = this.seedTxt;
    this.room.nixies.set(this.seedTxt ? String(Math.abs(parseInt(this.seedTxt, 36) || 1) % 1e6).padStart(6, '0') : '000000');
  }
  private feedCard() {
    if (!this.seedTxt) { csfx('deny'); return; }
    const seed = Math.abs(parseInt(this.seedTxt, 36) || 1) % 1e9;
    this.closeCard(); csfx('cardFeed');
    const rd = this.room.reader; this.lamp(rd, true);
    this.busy = true;
    this.play(rd, 1, 0.5, () => { csfx('relay'); this.launch(seed); });
  }
  private closeCard() {
    this.cardEl.style.display = 'none'; this.cardEl.innerHTML = '';
    if (this.mode === 'card') this.mode = 'console';
    const rd = this.room.reader; if (rd.anim < 0) this.play(rd, 0, 0.3);
  }

  // ------------------------------------------------------------------ the launch
  private async launch(seed: number, offspring?: ArchiveEntry) {
    if (this.mode === 'launch') return;
    this.mode = 'launch'; this.busy = true; this.clearHover();
    this.detEl.style.display = 'none'; this.backEl.style.display = 'none';
    this.root.classList.add('hide');
    const R = this.room, G = this.golem, start = R.golemAt.clone();
    const head = () => G.headPos(new V3());
    const end = () => { this.close(() => (offspring ? this.opts.onLaunch(offspring) : this.opts.onNew(seed))); };
    const skipped = await this.cine.play(async (c) => {
      c.cam.cut(this.cam.position.clone(), this.camLook.clone(), this.cam.fov);
      // ---- alarm: klaxons, beacons, red light, the room dims
      let alarm = true;
      c.task((dt, t) => {
        if (!alarm) return true;
        const k = 0.5 + 0.5 * Math.sin(t * 7);
        R.alarm.intensity = 6 + k * 14;
        for (const l of R.roomLights) l.intensity = Math.max(1.2, l.intensity - dt * 8);
        for (const b of R.beacons) { b.head.rotation.y += dt * 6; b.light.intensity = 30; b.mat.color.set(0xffa432); }
        return false;
      });
      let kl = 0; c.task((dt) => { if (!alarm) return true; kl -= dt; if (kl <= 0) { c.sfx('klaxon', 0.55); kl = 0.95; } return false; });
      c.cam.move({ pos: new V3(0, 1.6, 2.75), look: new V3(0, 1.16, 1.3), fov: 34, dur: 1.2, ease: 'inOut' });
      c.stamp(offspring ? `OFFSPRING OF ${offspring.name.toUpperCase()} · SEED ${seed}` : `TARGET SEED ${seed}`, true);
      for (let n = 10; n >= 7; n--) { R.nixies.set(String(n).padStart(6, '0')); c.sfx('beep', 0.6, n === 10 ? 1 : 0.9); await c.wait(0.45); }
      // ---- the cradle: clamps bite, steam, the golem turns to the window, the shutter opens
      c.cam.cut(new V3(start.x - 1.7, 0.85, start.z + 3.3), new V3(start.x + 0.3, 2.3, start.z - 6), 46);
      c.cam.move({ pos: new V3(start.x - 1.1, 1.05, start.z + 2.4), look: new V3(start.x + 0.15, 2.1, start.z - 6), dur: 4.4, ease: 'inOut' });
      c.sfx('clamp'); c.sfx('steam', 0.8);
      c.tween(0.5, (u) => { R.clamps[0].rotation.z = -u * 0.12; R.clamps[1].rotation.z = u * 0.12; }, 'outBack');
      const yaw0 = G.root.rotation.y;
      c.tween(1.6, (u) => { G.root.rotation.y = yaw0 + (Math.PI - yaw0) * u; }, 'inOut');
      c.task((_, t) => { if (t > 4) return true; if (Math.random() < 0.4) this.fx.burst(start.x + (Math.random() - 0.5) * 1.4, 0.3, start.z + (Math.random() - 0.5) * 1.4, 4, 0xd8d8d0, { speed: 0.7, up: 1.8, size: 2.5, life: 1.3, grav: -0.4 }); return false; });
      c.sfx('servo', 0.8, 0.6);
      c.tween(2.4, (u) => { R.shutters[0].position.x = -1.05 - u * 2.3; R.shutters[1].position.x = 1.05 + u * 2.3; }, 'inOut');
      for (let n = 6; n >= 4; n--) { R.nixies.set(String(n).padStart(6, '0')); c.sfx('beep', 0.6, 0.9); await c.wait(0.5); }
      // ---- the shell closes round it
      this.shell.visible = true; this.shell.position.copy(start).setY(start.y + 0.95);
      G.cast(new V3(start.x, 1.2, -30));
      c.sfx('crunch', 0.9); c.sfx('hum', 0.8);
      c.tween(1.2, (u) => this.shell.scale.setScalar(Math.max(0.001, u)), 'outBack');
      c.cam.cut(new V3(start.x + 2.2, 1.0, start.z + 2.6), new V3(start.x, 1.1, start.z), 34);
      for (let n = 3; n >= 1; n--) { R.nixies.set(String(n).padStart(6, '0')); c.sfx('beep', 0.7, 0.8); await c.wait(0.5); }
      R.nixies.set('000000'); c.sfx('beepHi', 0.8);
      // ---- ignition
      alarm = false; R.alarm.intensity = 0;
      c.flash('#fff2d0', 0.5, 0.9); c.sfx('ignite'); c.sfx('boom', 0.8); c.cam.shake(0.25, 0.8);
      const roar = c.loop('engine', 1);
      c.sfx('launch', 0.9);
      let z = start.z, v = 0; const sm = this.shell.material as THREE.MeshLambertMaterial;
      G.root.visible = false;
      c.task((dt) => {
        v += dt * (z > -10 ? 22 : 40); z -= v * dt;
        const y = start.y + 0.95 + Math.max(0, -10 - z) * 0.12;
        R.cradle.position.z = Math.max(-10, z);
        this.shell.position.set(start.x - Math.max(0, -10 - z) * 0.08, y, z);
        this.shell.rotation.x -= dt * 3; this.shell.rotation.z += dt * 1.3;
        sm.emissiveIntensity = Math.min(1.6, Math.max(0, -z - 6) * 0.06);
        const p = this.shell.position;
        for (let i = 0; i < 7; i++) this.fx.glow.emit(p.x + (Math.random() - 0.5) * 1.1, p.y + (Math.random() - 0.5) * 1.1, p.z + 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 0.5 + Math.random(), new THREE.Color(Math.random() < 0.5 ? 0xffa040 : 0xff5a20).multiplyScalar(2.2), 1, 2 + Math.random() * 1.6, 0.45, 0, 1.5);
        if (z > -10 && Math.random() < 0.8) this.fx.burst(start.x + (Math.random() < 0.5 ? -0.45 : 0.45), 0.15, Math.max(-10, z) + 0.5, 3, 0xffd070, { glow: true, speed: 2.5, up: 1.4, size: 2, life: 0.4, grav: 7 });
        return false;
      });
      // ---- chase it out of the window at the planet
      c.cam.track(() => ({ pos: this.shell.position.clone().add(new V3(2.3, 1.7, 4.4)), look: this.shell.position.clone().add(new V3(-0.2, 0, -2.5)) }), 14);
      c.cam.move({ fov: 60, dur: 2.2, ease: 'in' });
      await c.until(() => this.shell.position.z < -24, 6);
      c.cam.track(() => ({ pos: this.shell.position.clone().add(new V3(1.8, 1.4, 4.0)), look: this.shell.position.clone().lerp(this.globe.group.position, 0.35) }), 10);
      c.cam.move({ fov: 44, dur: 1.5 });
      c.say(offspring ? `Offspring of ${offspring.name}, away.` : 'Unit Seven is away. Godspeed, big fella.', { who: 'Launch Control', style: 'radio', pitch: 0.8 });
      await c.wait(1.7);
      roar.stop(0.6);
      c.sfx('whoosh', 1, 1.4);
      await c.fade(1, 0.5, '#fff6e8');
      await c.wait(0.3);
    }, { name: 'launch' });
    void skipped;
    end();
  }
  /** fade, then leave */
  private leave(then: () => void, dur = 0.8) {
    this.mode = 'away'; this.clearHover();
    this.cine.ui.fade(1, dur);
    setTimeout(() => this.close(then), dur * 1000 + 60);
  }

  // ------------------------------------------------------------------ the frame
  update(dt: number) {
    this.t += dt;
    const t = this.t, R = this.room;
    this.cine.update(dt);
    // the worlds turn
    this.globe.group.rotation.y += dt * 0.012; this.globe.mat.uniforms.uT.value = t;
    this.moon.rotation.y += dt * 0.05;
    for (const w of this.worlds) { w.g.group.rotation.y += dt * (this.focus >= 0 && this.worlds[this.focus] === w ? 0.5 : 0.18); w.g.mat.uniforms.uT.value = t; }
    // control animations and hover
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i]; a.t += dt; const u = Math.min(1, a.t / a.dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      a.c.anim = a.from + (a.to - a.from) * e;
      if (u >= 1) { this.anims.splice(i, 1); a.done?.(); }
    }
    for (const c of R.controls) {
      c.hover += ((c === this.hovered ? 1 : 0) - c.hover) * Math.min(1, dt * 12);
      c.pose(c.id === 'archive' ? c.anim : c.anim);
      if (c.lamp && c !== this.hovered && c.anim === 0 && !this.busy && c.enabled) c.lamp.color.set(new THREE.Color(c.lampCol).multiplyScalar(0.18 + c.hover * 0.8 + (Math.sin(t * 2 + c.root.position.x) > 0.96 ? 0.3 : 0)));
      else if (c.lamp && c === this.hovered) c.lamp.color.set(c.enabled ? c.lampCol : Math.sin(t * 14) > 0 ? 0xff2a14 : 0x401010);
    }
    // the golem watches the operator (or the pointer) until it is fired
    if (this.mode !== 'launch') {
      const look = this.ptrIn ? this.ray.ray.at(6, new V3()) : this.cam.position.clone();
      this.golem.look.lerp(look, Math.min(1, dt * 3));
    }
    this.golem.update(dt, this.cam);
    this.fx.update(dt, innerHeight, this.cam.fov);
    // idle telemetry on the CRTs and the mission clock on the nixies
    if (Math.floor(t * 8) !== Math.floor((t - dt) * 8)) this.drawCRT();
    if (this.mode === 'console' && !this.busy) { const d = new Date(); this.room.nixies.set(`${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`); }
    // the camera: a drift, a lean toward the pointer, and the mode's framing
    if (this.cine.active) { this.cine.apply(this.cam); return; }
    const px = this.ptrIn ? this.ndc.x : 0, py = this.ptrIn ? this.ndc.y : 0;
    this.par.x += (px - this.par.x) * Math.min(1, dt * 2.5); this.par.y += (py - this.par.y) * Math.min(1, dt * 2.5);
    let pos: THREE.Vector3, look: THREE.Vector3, fov = 50;
    if (this.mode === 'archive') {
      const w = this.focus >= 0 ? this.worlds[this.focus] : null;
      if (w) { const top = R.stands[w.i].top; pos = top.clone().add(new V3(-1.7, 0.25, 1.0)); look = top.clone().add(new V3(0, -0.05, 0)); fov = 36; }
      else { pos = new V3(2.4, 1.9, 1.6); look = new V3(5.6, 1.3, -2.6); fov = 48; }
    } else if (this.mode === 'card') {
      const p = new V3(); R.reader.root.getWorldPosition(p);
      pos = p.clone().add(new V3(0, 0.75, 0.85)); look = p.clone().add(new V3(0, 0, -0.1)); fov = 40;
    } else { pos = new V3(0, 2.35, 4.2); look = new V3(0.3, 0.95, -4.5); }
    pos.x += this.par.x * 0.32 + Math.sin(t * 0.13) * 0.06; pos.y += this.par.y * 0.16 + Math.sin(t * 0.21) * 0.03;
    look.x += this.par.x * 0.8; look.y += this.par.y * 0.4;
    const k = 1 - Math.exp(-dt * 3);
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
    this.cam.position.copy(this.camPos); this.cam.lookAt(this.camLook);
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov += (fov - this.cam.fov) * k; this.cam.updateProjectionMatrix(); }
    this.cam.updateMatrixWorld();
    if (this.ptrIn && !this.downAt) this.pick();
  }
  private drawCRT() {
    const [a, b] = this.room.crt, t = this.t;
    a.clear();
    a.text('U.S.P.C. LAUNCH CONTROL 4', 4, 4, 0x7ae088);
    a.text('UNIT 07 · STATUS', 4, 12, 0x43b65a);
    a.text(this.mode === 'launch' ? 'IGNITION' : this.busy ? 'ARMED' : 'READY', 4, 20, this.mode === 'launch' ? 0xffcd6e : 0xc0ffc6);
    a.text(`ARCHIVE ${String(this.opts.archive.length).padStart(2, '0')}`, 4, 30, 0x43b65a);
    a.text(`CRADLE PSI ${String(1200 + Math.round(Math.sin(t * 0.7) * 40))}`, 4, 38, 0x43b65a);
    if (Math.floor(t * 2) % 2) a.text('_', 4 + 4 * 9, 20, 0xc0ffc6);
    const g = a.g; g.strokeStyle = '#2a8c42'; g.lineWidth = 1;
    g.beginPath(); for (let x = 0; x < 88; x++) { const y = 54 + Math.sin(x * 0.25 + t * 4) * 4 * Math.sin(t * 0.7 + x * 0.05); x ? g.lineTo(4 + x, y) : g.moveTo(4, y); } g.stroke();
    a.scan(); a.flush();
    b.clear();
    b.text('TRAJECTORY', 4, 4, 0x7ae088);
    const gg = b.g; gg.strokeStyle = '#1b6630';
    gg.beginPath(); gg.arc(64, 36, 18, 0, Math.PI * 2); gg.stroke();
    gg.fillStyle = '#43b65a'; gg.beginPath(); gg.arc(64, 36, 8, 0, Math.PI * 2); gg.fill();
    gg.strokeStyle = '#7ae088'; gg.setLineDash([2, 2]); gg.beginPath(); gg.moveTo(8, 58); gg.quadraticCurveTo(30, 10, 56, 32); gg.stroke(); gg.setLineDash([]);
    const u = (t * 0.25) % 1, bx = 8 + (56 - 8) * u, by = (1 - u) * (1 - u) * 58 + 2 * (1 - u) * u * 10 + u * u * 32;
    gg.fillStyle = '#ffcd6e'; gg.fillRect(Math.round(bx) - 1, Math.round(by) - 1, 3, 3);
    b.text('ETA 21D', 4, 54, 0x43b65a);
    b.scan(); b.flush();
  }
  render(post: Post, t: number) {
    resetGrade(post.grade); post.grade.bloom = 0.55; post.grade.vig = 0.42;
    post.render(this.scene, this.cam, this.fxScene, t);
  }
  resize(w: number, h: number) { this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
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
      await c.card(`${P.name.toUpperCase()}`, 'CLAIMED FOR HUMANITY', 'U.S.P.C. · WORLD ' + String(P.seed % 1000).padStart(3, '0'), 3.6);
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
