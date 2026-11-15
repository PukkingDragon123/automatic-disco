// The bridge's MAIN MONITOR: the galaxy scan and the deploy. The camera falls into the big screen and the screen
// becomes the view: the whole galaxy turning, a sweep ring racing out from the ship's position and pinging the
// systems it passes, then a dive into the KEPLER-442 arm, where the system's worlds come up one by one with their
// survey and a difficulty rating (the easiest is marked: start there). Click a world: the camera flies to it and
// its full survey opens; CHOOSE LANDING SITE goes down to the orbital survey (planetScreen.ts: regions, the dive,
// the ground scan and the drop point), whose DEPLOY hands back here for the pod drop.
import * as THREE from 'three';
import type { Engine, Screen } from '../../app/engine';
import { type Post, resetGrade } from '../../gfx/post';
import type { ShipHub } from './hub';
import type { Flow } from '../../flow';
import { makePlanet, type Planet, type PRegion } from '../../world/planet';
import type { Region } from '../../world/region';
import { makeGlobe, makeSpace, type Globe } from '../../ui/globe';
import { PlanetScreen } from '../../ui/planetScreen';
import { GN_DECL, gbuf, F_EMIT } from '../../gfx/gbuf';
import { hashi } from '../../core/rand';
import { csfx } from '../../ui/cineAudio';
import { ui } from '../../ui/kit';

export interface MonitorOpts { onDeploy: (planetSeed: number, r: PRegion, lz: { x: number; z: number } | undefined, region: Region | undefined) => void; fromPlanet?: boolean }

/** fly into the main monitor, then the monitor becomes the screen */
export async function openMonitor(engine: Engine, hub: ShipHub, flow: Flow, o: MonitorOpts) {
  hub.lockInput(true);
  const mon = hub.interior.rooms.bridge.ctx.refs.monitor as THREE.Mesh;
  const p = mon.getWorldPosition(new THREE.Vector3());
  await hub.shot({ pos: p.clone().add(new THREE.Vector3(0, 0.05, -4.2)), look: p, fov: 36 }, 1.3);
  csfx('static', 0.5); csfx('beep', 0.5);
  const seed = flow.run ? flow.run.seed : 1;
  engine.push(new GalaxyScreen(engine, seed, {
    onClose: () => { engine.pop(); hub.lockInput(false); hub.release(); },
    onDeploy: (ps, r, lz, region) => { engine.pop(); hub.lockInput(false); o.onDeploy(ps, r, lz, region); },
  }));
}

// ------------------------------------------------------------------ the worlds of the system
export interface World { seed: number; planet: Planet; diff: number; orbit: number; size: number; ph: number; facts: [string, string][]; tag: string }
const HARSH = new Set(['tundra', 'desert', 'ashland', 'crystal', 'ocean', 'reef']);
export function systemWorlds(runSeed: number): World[] {
  const out: World[] = [];
  for (let i = 0; i < 5; i++) {
    const seed = (hashi(runSeed, 4421, i) % 900000) + 1000;
    const planet = makePlanet(seed);
    const avg = planet.regions.reduce((a, r) => a + r.danger, 0) / planet.regions.length;
    const harsh = planet.regions.filter((r) => HARSH.has(r.biome)).length / planet.regions.length;
    const h = (k: number) => (hashi(seed, k) % 1000) / 1000;
    const g = 0.62 + h(1) * 0.7, temp = Math.round(-30 + (1 - harsh) * 40 + h(2) * 25 - (i * 6));
    let diff = Math.round(1 + (avg - 1) * 1.4 + harsh * 2.4 + Math.abs(g - 1) * 2.2);
    diff = Math.max(1, Math.min(5, diff));
    const biomes = new Map<string, number>(); for (const r of planet.regions) biomes.set(r.biome, (biomes.get(r.biome) ?? 0) + 1);
    const top = [...biomes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b]) => b.toUpperCase()).join(' · ');
    const water = Math.round(20 + h(3) * 60);
    out.push({
      seed, planet, diff, orbit: 9 + i * 6.2 + h(4) * 2, size: 0.9 + h(5) * 1.3, ph: h(6) * Math.PI * 2, tag: top,
      facts: [['GRAVITY', `${g.toFixed(2)} G`], ['ATMOSPHERE', h(7) > 0.3 ? `N2-O2 ${(0.6 + h(8) * 0.7).toFixed(1)} ATM` : 'THIN CO2'], ['MEAN TEMP', `${temp} C`], ['SURFACE WATER', `${water}%`], ['LIFE SIGNS', h(9) > 0.15 ? `${Math.round(30 + h(10) * 400)} SPECIES` : 'NONE'], ['REGIONS', `${planet.regions.length}`]],
    });
  }
  // the gentlest world is the recommended first landing: make sure one is clearly the easiest
  const min = Math.min(...out.map((w) => w.diff));
  const easiest = out.find((w) => w.diff === min)!;
  easiest.diff = Math.max(1, Math.min(easiest.diff, 2));
  return out;
}

// ------------------------------------------------------------------ shaders
const STAR_V = `attribute vec3 aCol; attribute float aSize; uniform float uH, uK; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vC = aCol * uK; gl_PointSize = clamp(aSize * uH * 0.0016 * 300.0 / max(1.0, -mv.z), 1.0, 9.0); gl_Position = projectionMatrix * mv; }`;
const STAR_F = `varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = 1.0 - smoothstep(0.1, 0.5, length(d)); gl_FragColor = vec4(vC * a, 0.0); gNormal = vec4(0.0); }`;
const RING_V = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_F = `uniform float uR, uK; uniform vec3 uCol; varying vec2 vUv;
void main(){ float d = length(vUv - 0.5) * 2.0; float lead = smoothstep(uR - 0.06, uR, d) * (1.0 - smoothstep(uR, uR + 0.006, d)); float trail = step(d, uR) * 0.06 * (1.0 - d);
  float grid = step(0.985, fract(d * 12.0)) * step(d, uR) * 0.12; float a = (lead + trail + grid) * uK; gl_FragColor = vec4(uCol * a, 0.0); gNormal = vec4(0.0); }`;
const ORBIT_F = `uniform vec3 uCol; uniform float uK; void main(){ gl_FragColor = vec4(uCol * uK, 0.0); gNormal = vec4(0.0); }`;
const ORBIT_V = `void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLOW_F = `uniform vec3 uCol; uniform float uK; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2) * uK; gl_FragColor = vec4(uCol * a, 0.0); gNormal = vec4(0.0); }`;
function fx(vert: string, frag: string, u: Record<string, THREE.IUniform>, add = true) {
  const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: GN_DECL + frag, uniforms: u, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: add ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide });
  (m as any).__gb = true; return m;
}

// ------------------------------------------------------------------ CSS
const CSS = /* css */`
.gmon { position: fixed; inset: 0; z-index: 6; pointer-events: none; font-family: 'Body'; color: #9fe0aa; --g: #7fd48a; --gd: #3f8f58; --gh: #d6ffd8; --am: #d9a43a;
  --fs: 22px; --fl: 22px; --fx: 48px; --u: clamp(1px, 0.1vh, 2px); text-shadow: 0 0 calc(4 * var(--u)) rgba(127,212,138,0.45); }
.gmon .pe { pointer-events: auto; }
.gmon .crt { position: absolute; inset: 0; background: repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 1px, rgba(0,0,0,0) 1px 3px), radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,8,4,0.55) 100%); }
.gmon .bez { position: absolute; inset: 0; border: 16px solid transparent; border-image: var(--steel) 8 fill / 16px stretch; image-rendering: pixelated; background: none; -webkit-mask: none; }
.gmon .bez { border-image-outset: 0; }
.gmon .hd { position: absolute; left: calc(40 * var(--u)); top: calc(34 * var(--u)); }
.gmon .hd .k { font-family: 'Body'; font-size: 22px; color: var(--gd); }
.gmon .hd .t { font-family: 'Title'; font-size: 48px; color: var(--gh); line-height: 1.05; }
.gmon .hd .s { font-size: var(--fl); color: var(--g); }
.gmon .prog { position: absolute; left: calc(40 * var(--u)); bottom: calc(40 * var(--u)); font-size: var(--fl); }
.gmon .prog .bar { width: calc(420 * var(--u)); height: calc(10 * var(--u)); border: calc(1 * var(--u)) solid var(--gd); margin-top: calc(6 * var(--u)); }
.gmon .prog .bar i { display: block; height: 100%; background: var(--g); box-shadow: 0 0 calc(8 * var(--u)) var(--g); }
.gmon .list { position: absolute; left: calc(40 * var(--u)); top: calc(170 * var(--u)); width: calc(430 * var(--u)); display: flex; flex-direction: column; gap: calc(6 * var(--u)); }
.gmon .w { padding: calc(8 * var(--u)) calc(12 * var(--u)); border: calc(1 * var(--u)) solid rgba(127,212,138,0.35); background: rgba(4,16,8,0.62); cursor: pointer; animation: gm-in 360ms steps(6) both; }
@keyframes gm-in { 0% { opacity: 0; clip-path: inset(0 100% 0 0); } 100% { opacity: 1; clip-path: inset(0 0 0 0); } }
.gmon .w:hover, .gmon .w.h { border-color: var(--g); background: rgba(10,40,18,0.75); }
.gmon .w .r1 { display: flex; justify-content: space-between; align-items: baseline; }
.gmon .w .n { font-family: 'Title'; font-size: 24px; color: var(--gh); }
.gmon .w .pips { font-size: var(--fl); }
.gmon .w .pips b { color: var(--am); font-weight: normal; } .gmon .w .pips s { color: #2a4a32; text-decoration: none; }
.gmon .w .b { font-family: 'Body'; font-size: 22px; color: #7fae88; }
.gmon .w .rec { display: inline-block; margin-top: calc(4 * var(--u)); font-family: 'Body'; font-size: 22px; color: #0a1a0e; background: var(--g); padding: 0 calc(6 * var(--u)); text-shadow: none; }
.gmon .lab { position: absolute; left: 0; top: 0; transform: translate(-50%, calc(-100% - 14 * var(--u))); white-space: nowrap; text-align: center; transition: opacity 200ms; }
.gmon .lab .n { font-family: 'Title'; font-size: 24px; color: var(--gh); }
.gmon .lab .d { font-size: var(--fs); color: var(--am); }
.gmon .lab .rec { font-family: 'Body'; font-size: 11px; color: #0a1a0e; background: var(--g); padding: 0 calc(4 * var(--u)); text-shadow: none; }
.gmon .det { position: absolute; right: calc(40 * var(--u)); top: calc(110 * var(--u)); width: calc(470 * var(--u)); padding: calc(14 * var(--u)) calc(16 * var(--u)); border: calc(1 * var(--u)) solid var(--g); background: rgba(4,16,8,0.72); animation: gm-in 420ms steps(8) both; }
.gmon .det .n { font-family: 'Title'; font-size: 48px; color: var(--gh); line-height: 1; }
.gmon .det .tg { font-family: 'Body'; font-size: 22px; color: #7fae88; margin: calc(6 * var(--u)) 0 calc(10 * var(--u)); }
.gmon .det .f { display: flex; justify-content: space-between; font-size: var(--fl); line-height: 1.3; border-bottom: calc(1 * var(--u)) dashed rgba(127,212,138,0.18); }
.gmon .det .f span:last-child { color: var(--gh); }
.gmon .det .dif { margin: calc(10 * var(--u)) 0; font-size: var(--fl); }
.gmon .det .dif b { color: var(--am); font-weight: normal; } .gmon .det .dif s { color: #2a4a32; text-decoration: none; }
.gmon .btn { display: flex; justify-content: space-between; align-items: center; margin-top: calc(8 * var(--u)); padding: calc(10 * var(--u)) calc(14 * var(--u)); cursor: pointer; border: 16px solid transparent; border-image: var(--key) 8 fill / 16px stretch; image-rendering: pixelated; font-family: 'Title'; font-size: 24px; color: #e4f4e6; }
.gmon .btn:hover { border-image: var(--keyHi) 8 fill / 16px stretch; image-rendering: pixelated; }
.gmon .btn.pri { font-size: var(--fl); }
.gmon .btn .hk { font-family: 'Jersey', monospace; color: #0a1a0e; background: var(--g); padding: 0 calc(5 * var(--u)); text-shadow: none; }
.gmon .back { position: absolute; left: calc(40 * var(--u)); bottom: calc(36 * var(--u)); width: calc(260 * var(--u)); }
.gmon .hint { position: absolute; right: calc(40 * var(--u)); bottom: calc(36 * var(--u)); font-family: 'Body'; font-size: 22px; color: #5f8a68; }
`;
let styled = false;
function style() { if (styled) return; styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
const div = (cls: string, parent: HTMLElement, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; parent.appendChild(e); return e; };
const pips = (n: number) => `<b>${'■'.repeat(n)}</b><s>${'■'.repeat(5 - n)}</s>`;
const DIFF = ['', 'GENTLE', 'FAIR', 'HARSH', 'SEVERE', 'LETHAL'];

type Phase = 'galaxy' | 'dive' | 'system' | 'world';
export class GalaxyScreen implements Screen {
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 20000);
  private own: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  private galaxy: THREE.Points; private gU: Record<string, THREE.IUniform>;
  private ring: THREE.Mesh; private rU: Record<string, THREE.IUniform>;
  private sys = new THREE.Group(); private star: THREE.Mesh;
  private worlds: World[]; private globes: Globe[] = []; private orbits: THREE.LineLoop[] = [];
  private phase: Phase = 'galaxy'; private T = 0; private t = 0;
  private here = new THREE.Vector3();
  private sel = -1; private hov = -1;
  private camFrom = { p: new THREE.Vector3(), l: new THREE.Vector3() }; private camTo = { p: new THREE.Vector3(), l: new THREE.Vector3() }; private camK = 1; private camDur = 1;
  private camP = new THREE.Vector3(); private camL = new THREE.Vector3();
  private root: HTMLElement; private hd: HTMLElement; private prog: HTMLElement; private list: HTMLElement; private det: HTMLElement | null = null; private labs: HTMLElement[] = []; private backEl: HTMLElement;
  private ray = new THREE.Raycaster(); private ptr = new THREE.Vector2(-9, -9);
  private off: (() => void)[] = [];
  private closed = false;

  constructor(readonly engine: Engine, runSeed: number, readonly o: { onClose: () => void; onDeploy: MonitorOpts['onDeploy'] }) {
    style();
    this.scene.background = new THREE.Color(0x010302);
    this.worlds = systemWorlds(runSeed);
    // ---- the galaxy
    const N = 16000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N);
    let s = (runSeed * 2654435761) >>> 0; const rnd = () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); while (v === 0) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283 * v); };
    const R = 100;
    for (let i = 0; i < N; i++) {
      const bulge = i < N * 0.18;
      let x: number, y: number, z: number, r: number;
      if (bulge) { r = Math.abs(gauss()) * 12; const a = rnd() * 6.283; x = Math.cos(a) * r; z = Math.sin(a) * r * 0.85; y = gauss() * 4 * Math.max(0.2, 1 - r / 24); }
      else { r = 8 + Math.pow(rnd(), 0.75) * R; const arm = i % 2, th = arm * Math.PI + Math.log(r / 6) * 2.25 + gauss() * (0.22 + 6 / r); x = Math.cos(th) * r; z = Math.sin(th) * r; y = gauss() * 1.6 * (1 - r / (R * 1.4)); }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      const warm = Math.max(0, 1 - r / 30), hii = !bulge && rnd() < 0.025;
      const c = hii ? [1.0, 0.45, 0.6] : [0.65 + warm * 0.4, 0.75 + warm * 0.15, 1.0 - warm * 0.45];
      const b = (bulge ? 0.5 : 0.35) + rnd() * 0.5;
      col[i * 3] = c[0] * b; col[i * 3 + 1] = c[1] * b; col[i * 3 + 2] = c[2] * b;
      size[i] = (hii ? 3.2 : 1) * (0.6 + rnd() * rnd() * 2.6);
    }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gg.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); gg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.gU = { uH: { value: 1080 }, uK: { value: 1.6 } };
    const gm = fx(STAR_V, STAR_F, this.gU);
    this.galaxy = new THREE.Points(gg, gm); this.galaxy.frustumCulled = false; this.scene.add(this.galaxy); this.own.push(gg, gm);
    this.here.set(Math.cos(2.6) * 62, 0, Math.sin(2.6) * 62);
    // the sweep ring, centred on the ship's position
    this.rU = { uR: { value: 0 }, uK: { value: 1 }, uCol: { value: new THREE.Color(0.5, 1.6, 0.7) } };
    const rg = new THREE.PlaneGeometry(400, 400); rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, fx(RING_V, RING_F, this.rU)); this.ring.position.copy(this.here); this.scene.add(this.ring); this.own.push(rg, this.ring.material as THREE.Material);
    const hereM = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.7, 32), fx(ORBIT_V, ORBIT_F, { uCol: { value: new THREE.Color(0.5, 1.6, 0.7) }, uK: { value: 1.2 } }));
    hereM.rotation.x = -Math.PI / 2; hereM.position.copy(this.here); this.scene.add(hereM); this.own.push(hereM.geometry, hereM.material as THREE.Material);
    // ---- the system (placed at the ship's position, tiny until the dive)
    this.sys.position.copy(this.here); this.sys.scale.setScalar(0.06); this.scene.add(this.sys);
    const glowG = new THREE.PlaneGeometry(1, 1);
    this.star = new THREE.Mesh(glowG, fx(RING_V, GLOW_F, { uCol: { value: new THREE.Color(1.6, 1.3, 0.8) }, uK: { value: 1.6 } })); this.star.scale.setScalar(10); this.sys.add(this.star); this.own.push(glowG, this.star.material as THREE.Material);
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.4) }));
    gbuf(core.material as THREE.Material, F_EMIT);
    this.sys.add(core); this.own.push(core.geometry, core.material as THREE.Material);
    const space = makeSpace({ stars: 1800, radius: 9000, sun: null, dust: 0, seed: runSeed }); this.scene.add(space.group);
    this.worlds.forEach((w, i) => {
      const pts: THREE.Vector3[] = []; for (let k = 0; k <= 96; k++) { const a = (k / 96) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * w.orbit, 0, Math.sin(a) * w.orbit)); }
      const og = new THREE.BufferGeometry().setFromPoints(pts);
      const om = fx(ORBIT_V, ORBIT_F, { uCol: { value: new THREE.Color(0.3, 0.9, 0.45) }, uK: { value: 0 } });
      const ol = new THREE.LineLoop(og, om); this.sys.add(ol); this.orbits.push(ol); this.own.push(og, om);
      const gl = makeGlobe(w.planet, w.size); gl.group.visible = false; this.sys.add(gl.group); this.globes.push(gl);
      void i;
    });
    // ---- DOM
    this.root = div('gmon', ui());
    div('crt', this.root);
    this.hd = div('hd', this.root, `<div class="k">MERIDIAN · MAIN MONITOR</div><div class="t">LONG RANGE SCAN</div><div class="s">SECTOR KEPLER-442 · ORION SPUR</div>`);
    this.prog = div('prog', this.root, `<div>SWEEP <span class="pc">0%</span> · <span class="ct">0</span> SYSTEMS</div><div class="bar"><i style="width:0%"></i></div>`);
    this.list = div('list pe', this.root); this.list.style.display = 'none';
    this.backEl = div('back btn pe', this.root, '◀ BRIDGE <span class="hk">ESC</span>');
    this.backEl.addEventListener('click', (e) => { e.stopPropagation(); this.back(); });
    div('hint', this.root, 'CLICK A WORLD · ESC BACK');
    for (const w of this.worlds) { const l = div('lab', this.root); l.style.opacity = '0'; l.innerHTML = `<div class="n">${w.planet.name.toUpperCase()}</div><div class="d">${'■'.repeat(w.diff)}</div>`; this.labs.push(l); }
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    // ---- input
    const cv = engine.canvas;
    const move = (e: PointerEvent) => { this.ptr.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };
    const down = (e: PointerEvent) => { if (e.button === 2) { this.back(); return; } if (this.phase === 'system' && this.hov >= 0) this.pick(this.hov); else if (this.phase === 'galaxy' || this.phase === 'dive') this.T = Math.max(this.T, this.phase === 'galaxy' ? 3.4 : this.T); };
    const key = (e: KeyboardEvent) => { if (this.closed) return; if (e.key === 'Escape') this.back(); if (e.key === 'Enter' && this.phase === 'world') this.land(); };
    cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', down); addEventListener('keydown', key);
    this.off.push(() => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerdown', down); removeEventListener('keydown', key); });
    // the opening shot: the whole disc, from above at a slant
    this.setCam(new THREE.Vector3(30, 150, 190), new THREE.Vector3(0, 0, 0), 0);
    csfx('cardFeed', 0.5);
  }

  private setCam(p: THREE.Vector3, l: THREE.Vector3, dur: number) {
    this.camFrom.p.copy(this.camP); this.camFrom.l.copy(this.camL); this.camTo.p.copy(p); this.camTo.l.copy(l);
    if (dur <= 0) { this.camP.copy(p); this.camL.copy(l); this.camK = 1; } else { this.camK = 0; this.camDur = dur; }
  }
  private worldPos(i: number, out = new THREE.Vector3()) { return this.globes[i].group.getWorldPosition(out); }

  private showList() {
    this.list.style.display = ''; this.list.innerHTML = '';
    const order = this.worlds.map((w, i) => i).sort((a, b) => this.worlds[a].diff - this.worlds[b].diff);
    const best = order[0];
    order.forEach((i, k) => {
      const w = this.worlds[i];
      const e = div('w', this.list, `<div class="r1"><span class="n">${w.planet.name.toUpperCase()}</span><span class="pips">${pips(w.diff)}</span></div><div class="b">${DIFF[w.diff]} · ${w.tag}</div>${i === best ? '<span class="rec">RECOMMENDED · START HERE</span>' : ''}`);
      e.style.animationDelay = `${k * 90}ms`;
      e.addEventListener('pointerenter', () => { this.hov = i; csfx('hover', 0.3); });
      e.addEventListener('pointerleave', () => { if (this.hov === i) this.hov = -1; });
      e.addEventListener('click', (ev) => { ev.stopPropagation(); this.pick(i); });
      (e as any).__i = i;
    });
    this.labs.forEach((l, i) => { if (i === best) l.innerHTML += '<div class="rec">RECOMMENDED</div>'; });
  }
  private pick(i: number) {
    if (this.phase !== 'system' && this.phase !== 'world') return;
    csfx('button', 0.6); csfx('relay', 0.5);
    this.sel = i; this.phase = 'world'; this.T = 0;
    this.list.style.display = 'none';
    const w = this.worlds[i];
    this.det?.remove();
    const best = this.worlds.reduce((b, x, k) => (x.diff < this.worlds[b].diff ? k : b), 0);
    this.det = div('det pe', this.root, `<div class="n">${w.planet.name.toUpperCase()}</div><div class="tg">${w.tag}</div>${w.facts.map(([a, b]) => `<div class="f"><span>${a}</span><span>${b}</span></div>`).join('')}<div class="dif">DIFFICULTY ${pips(w.diff)} ${DIFF[w.diff]}${i === best ? ' · RECOMMENDED' : ''}</div>`);
    const go = div('btn pri', this.det, 'CHOOSE LANDING SITE <span class="hk">ENTER</span>'); go.addEventListener('click', (e) => { e.stopPropagation(); this.land(); });
    const bk = div('btn', this.det, '◀ SYSTEM <span class="hk">ESC</span>'); bk.addEventListener('click', (e) => { e.stopPropagation(); this.back(); });
  }
  /** down to the orbital survey of the chosen world */
  private land() {
    if (this.phase !== 'world' || this.sel < 0) return;
    const w = this.worlds[this.sel];
    csfx('swell', 0.6);
    this.root.style.display = 'none';
    this.engine.push(new PlanetScreen(w.planet, {
      canLand: (r) => (r.state === 'veyr' ? 'Already yours.' : r.state === 'lost' ? 'Burnt out. Nothing will take root here again.' : null),
      onBack: () => { this.engine.pop(); this.root.style.display = ''; },
      onLand: (r, lz, region) => { this.engine.pop(); this.o.onDeploy(w.seed, r, lz, region); },
      note: `DIFFICULTY ${'■'.repeat(w.diff)} ${DIFF[w.diff]} · CHOOSE A REGION, THEN THE DROP POINT`,
    }));
  }
  private back() {
    csfx('tick', 0.6);
    if (this.phase === 'world') { this.phase = 'system'; this.sel = -1; this.det?.remove(); this.det = null; this.list.style.display = ''; this.setCam(this.sysCam(), this.sys.position.clone(), 1.2); return; }
    this.close();
  }
  private close() { if (this.closed) return; this.closed = true; this.o.onClose(); }
  private sysCam() { return this.sys.position.clone().add(new THREE.Vector3(14, 30, 46)); }

  update(dt: number, t: number) {
    this.t = t; this.T += dt;
    this.galaxy.rotation.y += dt * 0.006;
    const sweepEnd = 3.6;
    if (this.phase === 'galaxy') {
      const k = Math.min(1, this.T / sweepEnd);
      this.rU.uR.value = k; this.rU.uK.value = 1.4 * (1 - Math.max(0, k - 0.85) / 0.15);
      const pc = this.prog.querySelector('.pc'), ct = this.prog.querySelector('.ct'), bar = this.prog.querySelector('i') as HTMLElement;
      if (pc) pc.textContent = `${Math.round(k * 100)}%`; if (ct) ct.textContent = `${Math.round(k * k * 4122)}`; bar.style.width = `${k * 100}%`;
      if (Math.floor(this.T * 8) !== Math.floor((this.T - dt) * 8)) csfx('geiger', 0.25);
      if (this.T >= sweepEnd) {
        this.phase = 'dive'; this.T = 0; csfx('whoosh', 0.7);
        this.hd.innerHTML = `<div class="k">MERIDIAN · MAIN MONITOR</div><div class="t">KEPLER-442</div><div class="s">5 WORLDS · SCANNING</div>`;
        this.prog.style.display = 'none';
        this.setCam(this.sysCam(), this.here.clone(), 2.4);
      }
    } else if (this.phase === 'dive') {
      const k = Math.min(1, this.T / 2.4);
      this.sys.scale.setScalar(0.06 + (1 - 0.06) * k * k);
      this.gU.uK.value = 1.6 * (1 - k * 0.65);
      if (this.T > 2.4) { this.phase = 'system'; this.T = 0; }
    }
    // reveal the worlds one by one as the system sweep passes their orbits
    if (this.phase === 'system' || this.phase === 'world') {
      this.worlds.forEach((w, i) => {
        const on = this.T > 0.3 + i * 0.35 || this.phase === 'world';
        if (on && !this.globes[i].group.visible) { this.globes[i].group.visible = true; csfx('beep', 0.4, 1 + i * 0.12); }
        (this.orbits[i].material as THREE.ShaderMaterial).uniforms.uK.value = on ? (i === this.hov || i === this.sel ? 0.9 : 0.35) : 0;
      });
      if (this.T > 0.3 + this.worlds.length * 0.35 && this.list.style.display === 'none' && this.phase === 'system') { this.showList(); this.hd.querySelector('.s')!.textContent = '5 WORLDS · SURVEY COMPLETE'; }
    }
    // planets orbit (slowly; the chosen one stops so the camera can hold on it)
    this.worlds.forEach((w, i) => {
      const a = w.ph + (i === this.sel ? 0 : t * 0.04 / Math.sqrt(w.orbit / 9));
      if (i !== this.sel) w.ph = w.ph;
      this.globes[i].group.position.set(Math.cos(a) * w.orbit, 0, Math.sin(a) * w.orbit);
      this.globes[i].group.rotation.y = t * 0.1;
      this.globes[i].mat.uniforms.uT.value = t;
      if (i === this.sel) w.ph = a;
    });
    // hover by ray (system view)
    if (this.phase === 'system') {
      this.ray.setFromCamera(this.ptr, this.cam);
      let best = -1, bd = 1e9;
      this.worlds.forEach((w, i) => { if (!this.globes[i].group.visible) return; const p = this.worldPos(i); const d = this.ray.ray.distanceToPoint(p); if (d < w.size * 2.4 && d < bd) { bd = d; best = i; } });
      if (best !== this.hov && best >= 0) csfx('hover', 0.3);
      if (best >= 0 || !this.list.matches(':hover')) this.hov = best;
      for (const e of Array.from(this.list.children)) e.classList.toggle('h', (e as any).__i === this.hov);
      this.engine.canvas.style.cursor = this.hov >= 0 ? 'pointer' : '';
    }
    if (this.phase === 'world' && this.sel >= 0) {
      const p = this.worldPos(this.sel), w = this.worlds[this.sel];
      const want = p.clone().add(new THREE.Vector3(-w.size * 2.6, w.size * 0.9, w.size * 4.2));
      if (this.T < dt * 1.5) this.setCam(want, p, 1.4); else if (this.camK >= 1) { this.camP.copy(want); this.camL.copy(p); }
    }
    // camera
    if (this.camK < 1) {
      this.camK = Math.min(1, this.camK + dt / this.camDur);
      const e = this.camK < 0.5 ? 4 * this.camK ** 3 : 1 - Math.pow(-2 * this.camK + 2, 3) / 2;
      this.camP.lerpVectors(this.camFrom.p, this.camTo.p, e); this.camL.lerpVectors(this.camFrom.l, this.camTo.l, e);
    } else if (this.phase === 'galaxy') { this.camP.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 0.02); }
    this.cam.position.copy(this.camP); this.cam.lookAt(this.camL); this.cam.aspect = this.engine.w / Math.max(1, this.engine.h); this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld();
    this.star.quaternion.copy(this.cam.quaternion);
    this.gU.uH.value = this.engine.h;
    // labels over the worlds
    const v = new THREE.Vector3();
    this.labs.forEach((l, i) => {
      const vis = this.globes[i].group.visible && (this.phase === 'system');
      this.worldPos(i, v); v.y += this.worlds[i].size * 1.2; v.project(this.cam);
      l.style.opacity = vis && v.z < 1 ? (i === this.hov ? '1' : '0.8') : '0';
      l.style.left = ((v.x * 0.5 + 0.5) * innerWidth).toFixed(1) + 'px'; l.style.top = ((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1) + 'px';
    });
  }
  render(post: Post, t: number) { resetGrade(post.grade); post.grade.bloom = 0.7; post.grade.sat = 1.0; post.grade.vig = 0.5; post.U.uFade.value = 0; post.render(this.scene, this.cam, undefined, t); }
  resize(w: number, h: number) { this.cam.aspect = w / Math.max(1, h); this.cam.updateProjectionMatrix(); }
  suspend() { this.root.style.display = 'none'; }
  resume() { this.root.style.display = ''; }
  dispose() {
    this.off.forEach((f) => f()); this.root.remove(); this.engine.canvas.style.cursor = '';
    this.own.forEach((x) => x.dispose());
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
  }
}
