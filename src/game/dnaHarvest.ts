// The genome harvest. When Unit 07 absorbs a corpse it takes ALL of it, in a few seconds (any click, tap or key
// skips to the end):
//  1 LIFT     a rune circle burns into the ground and three magnetic rings spin up around the body;
//  2 UNSPOOL  the genome unwinds out of the corpse as a double helix rising into the air, one coloured run of
//             base pairs per gene, while its cells boil out and spiral round the strands;
//  3 TAKE     gene by gene, top first, the strand breaks into glowing capsules that fly into the golem's head; a
//             counter ticks up, new genes are marked NEW and genes it already carries level up;
//  4 SPENT    the rings unwind and the circle burns out. `done` gets every gene (the game applies them and emits
//             'absorb'); the contract of start() is unchanged (cap is ignored now: nothing is left behind).
import * as THREE from 'three';
import { GENE, CAT_NAMES, type GeneCat } from '../life/genes';
import { el, ui, iconImg } from '../ui/kit';
import { sfx } from '../audio/audio';
import type { Run } from './run';
import type { Fx } from './fx';
import type { VeyrChild } from './child';
import { gbuf, GN_DECL } from '../gfx/gbuf';

export const CAT_COL: Record<GeneCat, number> = { body: 0xeee2c4, limb: 0xffd860, sense: 0x6ad0ff, feed: 0xff6a5a, defense: 0xffa040, meta: 0xff8ac0, repro: 0xb8ffb0 };
const TAU = Math.PI * 2;
const RUNGS = 4;
const CELLS = 64;

const CSS = `
.harvest.hv2 { gap: calc(2px * var(--s)); max-width: min(calc(360px * var(--s)), 96vw); padding: calc(1px * var(--s)) calc(4px * var(--s)) !important; }
.hv2 .h-title { font-size: calc(10px * var(--s)); }
.hv-count { display: flex; align-items: baseline; gap: calc(4px * var(--s)); justify-content: center; }
.hv-count .big { font-size: calc(18px * var(--s)); line-height: 1; color: var(--hot); text-shadow: var(--phos-glow); letter-spacing: 2px; }
.hv-count .big.tick { animation: hv-tick 160ms steps(3); }
@keyframes hv-tick { 0% { color: #fff; transform: scale(1.25); } 100% { transform: none; } }
.hv-count .sub { font-size: calc(7px * var(--s)); color: var(--dim); }
.hv-count .sub b.n { color: #7affa0; } .hv-count .sub b.u { color: var(--gold); }
.hv-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: calc(1px * var(--s)); max-width: 100%; min-height: calc(12px * var(--s)); }
.hv-chip { display: flex; align-items: center; gap: 1px; padding: 0 calc(2px * var(--s)); font-size: calc(7px * var(--s)); line-height: calc(10px * var(--s)); color: #1a1610; text-shadow: none; background: linear-gradient(180deg, #ece4c6, #d8cea8); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35), 0 0 0 1px var(--cc); animation: hv-in 200ms steps(4); white-space: nowrap; }
.hv-chip img { width: calc(9px * var(--s)); height: calc(9px * var(--s)); }
.hv-chip i { font-style: normal; font-size: calc(6px * var(--s)); padding: 0 calc(1px * var(--s)); color: #ece4c6; background: #1b6630; margin-left: 1px; }
.hv-chip i.up { background: #8c4a12; } .hv-chip i.max { background: #4a4a4a; }
@keyframes hv-in { 0% { transform: translateY(calc(-6px * var(--s))) scale(1.3); filter: brightness(2); } 100% { transform: none; filter: none; } }
.hv-skip { font-size: calc(6px * var(--s)); color: var(--dim); animation: blink 1.2s steps(2) infinite; }
.hv-tagf { position: fixed; z-index: 13; pointer-events: none; transform: translate(-50%, -120%); font-size: calc(7px * var(--s)); line-height: calc(7px * var(--s)); padding: 0 calc(2px * var(--s)); color: #fff; text-shadow: 0 0 2px #000, 0 0 4px var(--cc); white-space: nowrap; transition: opacity 200ms steps(2); }
`;
function css() { if (document.getElementById('hv2-css')) return; const s = document.createElement('style'); s.id = 'hv2-css'; s.textContent = CSS; document.head.appendChild(s); }

const shellMat = (col: THREE.Color) => new THREE.ShaderMaterial({
  uniforms: { uCol: { value: col }, uK: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
  fragmentShader: GN_DECL + 'uniform vec3 uCol; uniform float uK; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float q = floor(f * 5.0) / 5.0; gl_FragColor = vec4(uCol * (0.2 + q * 1.7) * uK, 1.0); gNormal = vec4(0.0); }',
});
const bandMat = (col: number) => new THREE.ShaderMaterial({
  uniforms: { uCol: { value: new THREE.Color(col) }, uK: { value: 0 }, uT: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: GN_DECL + 'uniform vec3 uCol; uniform float uK, uT; varying vec2 vUv; void main(){ float d = step(0.5, fract(vUv.x * 48.0 - uT * 3.0)); float k = uK * (0.45 + 0.55 * d); gl_FragColor = vec4(uCol * k * 0.95, 1.0); gNormal = vec4(0.0); }',
});
/** the rune circle: two rings, a hexagram and twelve glyphs, hand-pixelled into a canvas */
function runeTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!; g.fillStyle = '#fff';
  const px = (x: number, y: number) => g.fillRect(Math.round(x), Math.round(y), 1, 1);
  const circle = (r: number) => { for (let i = 0; i < 720; i++) { const a = (i / 720) * TAU; px(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } };
  circle(62); circle(60); circle(46); circle(44); circle(14);
  const line = (a: number, b: number, r: number) => { for (let i = 0; i <= 200; i++) { const t = i / 200, x = Math.cos(a) * r * (1 - t) + Math.cos(b) * r * t, y = Math.sin(a) * r * (1 - t) + Math.sin(b) * r * t; px(64 + x, 64 + y); } };
  for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) line(k * Math.PI / 3 + (i * TAU) / 3, k * Math.PI / 3 + ((i + 1) * TAU) / 3, 44);
  const GLYPHS = ['10101.01110.11011.01110.10101', '11111.10001.10101.10001.11111', '00100.01110.10101.00100.00100', '10001.01010.00100.01010.10001', '01110.10000.01110.00001.01110', '11100.10100.11111.00101.00111'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, cx = 64 + Math.cos(a) * 53, cy = 64 + Math.sin(a) * 53;
    GLYPHS[i % GLYPHS.length].split('.').forEach((row, y) => row.split('').forEach((b, x) => { if (b === '1') px(cx - 2 + x, cy - 2 + y); }));
  }
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
const bez = (out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number) => {
  const u = 1 - t;
  return out.set(0, 0, 0).addScaledVector(a, u * u * u).addScaledVector(b, 3 * u * u * t).addScaledVector(c, 3 * u * t * t).addScaledVector(d, t * t * t);
};

interface Gene { id: string; col: THREE.Color; i: number; status: 'new' | 'up' | 'max'; lv: number; t0: number; fly: number; got: boolean; cap: THREE.Group | null; shell: THREE.Mesh | null; tag: HTMLDivElement | null; from: THREE.Vector3; c1: THREE.Vector3; c2: THREE.Vector3 }
interface Cell { delay: number; dur: number; seed: number; r: number; h: number; col: THREE.Color }

export class Harvest {
  open = false;
  child: VeyrChild | null = null;
  private genes: Gene[] = [];
  private cells: Cell[] = [];
  private cellMesh: THREE.InstancedMesh | null = null;
  private beads: THREE.InstancedMesh | null = null;
  private rungs: THREE.InstancedMesh | null = null;
  private rings: THREE.Mesh[] = [];
  private rune: THREE.Mesh | null = null;
  private box: HTMLDivElement | null = null;
  private countEl: HTMLDivElement | null = null; private subEl: HTMLDivElement | null = null; private chips: HTMLDivElement | null = null; private status: HTMLDivElement | null = null;
  private src = new THREE.Vector3(); private coreAt = new THREE.Vector3();
  private done: ((chosen: string[]) => void) | null = null;
  private T = 0; private end = 0; private fade = 0; private zapT = 0; private castT = 0;
  private got = 0; private nNew = 0; private nUp = 0;
  private N = 16; private step = 0.12; private spin = 0;
  private cam: THREE.Camera | null = null;
  private onKey = (e: KeyboardEvent) => { if (this.blocking && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); this.skip(); } };

  constructor(readonly scene: THREE.Scene, readonly fxScene: THREE.Scene, readonly run: Run, readonly fx: Fx) {}

  start(at: THREE.Vector3, speciesName: string, genes: string[], _cap: number, core: THREE.Vector3, done: (chosen: string[]) => void) {
    if (this.open) this.finish(true);
    this.cleanup();
    css();
    this.open = true; this.done = done; this.T = 0; this.fade = 0; this.got = 0; this.nNew = 0; this.nUp = 0;
    this.src.copy(at); this.coreAt.copy(core);
    const ids = [...new Set(genes.filter((g) => GENE[g]))];
    sfx('pulse', 0.8, 0.8); sfx('absorb', 1, 0.6);
    // ---- the trap
    const rm = new THREE.MeshBasicMaterial({ map: runeTexture(), color: new THREE.Color(0x7affe0).multiplyScalar(1.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    gbuf(rm, 0);
    this.rune = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), rm);
    this.rune.rotation.x = -Math.PI / 2; this.rune.position.copy(at).add(new THREE.Vector3(0, 0.08, 0)); this.rune.scale.setScalar(0.01);
    this.scene.add(this.rune);
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.0 + i * 0.4, 0.035, 6, 96), bandMat(i === 1 ? 0xb8a0ff : 0x7affe0));
      r.position.copy(at).add(new THREE.Vector3(0, 0.6 + i * 0.7, 0)); r.rotation.set(Math.PI / 2 + (i - 1) * 0.35, i * 0.7, 0);
      this.scene.add(r); this.rings.push(r);
    }
    // ---- the genome: one run of base pairs per gene, top gene first to leave
    const n = Math.max(1, ids.length);
    this.N = Math.max(16, n * RUNGS);
    this.step = Math.min(0.16, 3.2 / this.N);
    const stagger = Math.min(0.17, 1.7 / n);
    this.genes = ids.map((id, i) => {
      const g = this.run.genes.get(id);
      const status: Gene['status'] = !g ? 'new' : g.level >= 3 ? 'max' : 'up';
      return { id, col: new THREE.Color(CAT_COL[GENE[id].cat]), i, status, lv: !g ? 1 : Math.min(3, g.level + 1), t0: 1.75 + (n - 1 - i) * stagger, fly: 0, got: false, cap: null, shell: null, tag: null, from: new THREE.Vector3(), c1: new THREE.Vector3(), c2: new THREE.Vector3() };
    });
    this.end = this.genes.length ? Math.max(...this.genes.map((g) => g.t0)) + 0.95 : 1.2;
    const bm = new THREE.MeshLambertMaterial({ color: 0xffffff }); gbuf(bm, 1 + 32);
    this.beads = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.065, 0), bm, this.N * 2);
    this.beads.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 6), 3);
    const rmat = new THREE.MeshLambertMaterial({ color: 0xffffff }); gbuf(rmat, 1 + 32);
    this.rungs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.035, 0.035), rmat, this.N);
    this.rungs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.N * 3), 3);
    const back = new THREE.Color(0x7affe0).multiplyScalar(1.6), back2 = new THREE.Color(0xb8a0ff).multiplyScalar(1.4);
    for (let j = 0; j < this.N; j++) {
      const g = this.genes[Math.min(this.genes.length - 1, Math.floor(j / RUNGS))];
      this.beads.setColorAt(j * 2, back); this.beads.setColorAt(j * 2 + 1, back2);
      this.rungs.setColorAt(j, (g ? g.col : back).clone().multiplyScalar(j % RUNGS === 0 ? 2.6 : 1.8));
    }
    this.beads.frustumCulled = false; this.rungs.frustumCulled = false; this.beads.castShadow = true;
    this.scene.add(this.beads, this.rungs);
    // ---- its cells
    const cm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec3 vC; varying vec3 vN; varying vec3 vV; void main(){\n#ifdef USE_INSTANCING_COLOR\n vC = instanceColor;\n#else\n vC = vec3(1.0);\n#endif\n vec4 mv = modelViewMatrix * instanceMatrix * vec4(position,1.0); vN = normalize(normalMatrix * mat3(instanceMatrix) * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: GN_DECL + 'varying vec3 vC; varying vec3 vN; varying vec3 vV; void main(){ float d = abs(dot(normalize(vN), vV)); float rim = pow(1.0 - d, 1.6); float nuc = smoothstep(0.82, 0.95, d); vec3 c = vC * (0.25 + rim * 1.6) * (1.0 - nuc * 0.85); gl_FragColor = vec4(c, 1.0); gNormal = vec4(0.0); }',
    });
    this.cellMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.07, 1), cm, CELLS);
    this.cellMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CELLS * 3), 3);
    this.cellMesh.frustumCulled = false;
    this.cells = [];
    for (let c = 0; c < CELLS; c++) {
      const g = this.genes[c % Math.max(1, this.genes.length)];
      const col = (g ? g.col : new THREE.Color(0x7affe0)).clone().multiplyScalar(1.3);
      this.cells.push({ delay: 0.15 + (c / CELLS) * 1.4 + Math.random() * 0.2, dur: 1.1 + Math.random() * 0.6, seed: Math.random() * 100, r: 0.4 + Math.random() * 0.7, h: 0.6 + Math.random() * this.N * this.step, col });
      this.cellMesh.setColorAt(c, col);
    }
    this.scene.add(this.cellMesh);
    // ---- the readout
    this.box = el('div', 'px-dark harvest hv2', ui());
    el('div', 'hdr h-title', this.box, `ABSORBING THE GENOME OF THE ${speciesName.toUpperCase()}`);
    this.status = el('div', 'small h-status', this.box, 'MAGNETIC LIFT · THE FIELD TAKES HOLD');
    const row = el('div', 'hv-count', this.box);
    this.countEl = el('div', 'big', row, `00/${String(this.genes.length).padStart(2, '0')}`);
    this.subEl = el('div', 'sub', row, 'GENES');
    this.chips = el('div', 'hv-chips', this.box);
    el('div', 'hv-skip', this.box, 'CLICK, TAP OR [SPACE] TO SKIP');
    this.box.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.skip(); });
    addEventListener('keydown', this.onKey, true);
    if (!this.genes.length) this.end = 1.0;
  }

  /** jump to the end: every gene arrives at once */
  skip() {
    if (!this.open || this.fade > 0) return;
    for (const g of this.genes) if (!g.got) this.arrive(g, true);
    sfx('absorb', 1.2, 0.8);
    this.finish(false);
  }
  click(_mx: number, _my: number, cam: THREE.Camera): boolean { this.cam = cam; if (!this.blocking) return false; this.skip(); return true; }
  hoverAt(_mx: number, _my: number, cam: THREE.Camera) { this.cam = cam; }
  get blocking() { return this.open && this.fade <= 0; }

  private target() { return this.child ? this.child.headPos() : this.coreAt.clone(); }
  /** helix point j on strand s (0/1), world */
  private strand(j: number, s: number, out: THREE.Vector3, k = 1) {
    const a = j * 0.52 + this.spin + s * Math.PI, r = 0.3 * k;
    return out.set(this.src.x + Math.cos(a) * r, this.src.y + 0.45 + j * this.step, this.src.z + Math.sin(a) * r);
  }
  private detach(g: Gene) {
    const mid = this.strand(g.i * RUNGS + RUNGS / 2, 0, new THREE.Vector3(), 0); mid.x = this.src.x; mid.z = this.src.z;
    g.from.copy(mid);
    const to = this.target();
    const side = new THREE.Vector3(to.z - mid.z, 0, mid.x - to.x).normalize().multiplyScalar((g.i % 2 ? 1 : -1) * (1.2 + Math.random()));
    g.c1.copy(mid).add(new THREE.Vector3(0, 1.6 + Math.random(), 0)).add(side);
    g.c2.copy(to).add(new THREE.Vector3(0, 2.2, 0)).add(side.multiplyScalar(0.4));
    const cap = new THREE.Group(); cap.position.copy(mid);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), (() => { const m = new THREE.MeshBasicMaterial({ color: g.col.clone().multiplyScalar(2.2) }); gbuf(m, 1 + 32); return m; })());
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), shellMat(g.col.clone()));
    cap.add(core, shell); this.scene.add(cap);
    g.cap = cap; g.shell = shell; g.fly = 0.0001;
    this.fx.burst(mid.x, mid.y, mid.z, 12, g.col.getHex(), { glow: true, speed: 1.8, up: 0.8, size: 2.5, life: 0.6, grav: 0 });
    this.fx.arc(mid, this.target(), 0.25, g.col.getHex(), 0.3);
    const tag = el('div', 'hv-tagf', document.body, GENE[g.id].name.toUpperCase());
    tag.style.setProperty('--cc', '#' + g.col.getHexString());
    g.tag = tag;
    sfx('zap', 1.6 + Math.random() * 0.4, 0.25);
  }
  private arrive(g: Gene, quiet = false) {
    if (g.got) return;
    g.got = true; this.got++;
    if (g.status === 'new') this.nNew++; else if (g.status === 'up') this.nUp++;
    const to = this.target();
    if (!quiet) { this.fx.burst(to.x, to.y, to.z, 24, g.col.getHex(), { glow: true, up: 2.5, speed: 2.5, size: 3, life: 0.9 }); sfx('done', 1 + this.got * 0.03, 0.6); this.child?.cast(this.src); }
    if (g.cap) { g.cap.removeFromParent(); g.cap.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }); g.cap = null; }
    g.tag?.remove(); g.tag = null;
    if (this.countEl) { this.countEl.textContent = `${String(this.got).padStart(2, '0')}/${String(this.genes.length).padStart(2, '0')}`; this.countEl.classList.remove('tick'); void this.countEl.offsetWidth; this.countEl.classList.add('tick'); }
    if (this.subEl) this.subEl.innerHTML = `GENES · <b class="n">${this.nNew} NEW</b> · <b class="u">${this.nUp} LEVEL UP</b>`;
    if (this.chips) {
      const c = el('div', 'hv-chip', this.chips); c.style.setProperty('--cc', '#' + g.col.getHexString());
      iconImg('cat-' + GENE[g.id].cat, '', c);
      el('span', '', c, GENE[g.id].name);
      el('i', g.status === 'new' ? '' : g.status === 'up' ? 'up' : 'max', c, g.status === 'new' ? 'NEW' : g.status === 'up' ? `LV ${g.lv}` : 'MAX');
      c.title = CAT_NAMES[GENE[g.id].cat];
    }
  }
  private finish(abrupt: boolean) {
    if (this.fade > 0 && !abrupt) return;
    if (this.status) this.status.textContent = `GENOME ABSORBED · ${this.genes.length} GENES TAKEN`;
    this.fade = abrupt ? 0.01 : 0.9;
    removeEventListener('keydown', this.onKey, true);
    const d = this.done; this.done = null;
    d?.(this.genes.map((g) => g.id));
    if (abrupt) this.cleanup();
  }

  update(dt: number, cam?: THREE.Camera) {
    if (!this.open) return;
    if (cam) this.cam = cam;
    this.T += dt; const T = this.T;
    this.spin += dt * 1.4;
    const fading = this.fade > 0;
    if (fading) { this.fade -= dt; if (this.fade <= 0) { this.cleanup(); return; } }
    const fk = fading ? Math.max(0, this.fade / 0.9) : 1;
    // ---- status
    if (this.status && !fading) this.status.textContent = T < 0.6 ? 'MAGNETIC LIFT · THE FIELD TAKES HOLD' : T < 1.75 ? 'UNSPOOLING THE GENOME · CELLS SEPARATING' : 'TAKING EVERY GENE';
    // ---- the trap
    const trapK = Math.min(1, T * 1.8) * fk;
    if (this.rune) { this.rune.scale.setScalar(0.01 + trapK); this.rune.rotation.z += dt * 0.3; (this.rune.material as THREE.MeshBasicMaterial).opacity = trapK * (0.75 + Math.sin(T * 3) * 0.15); }
    this.rings.forEach((r, i) => {
      r.rotation.x += dt * (0.6 + i * 0.35) * (i % 2 ? 1 : -1); r.rotation.y += dt * (0.4 + i * 0.2);
      const u = (r.material as THREE.ShaderMaterial).uniforms; u.uK.value = trapK * 0.7; u.uT.value = T;
      r.scale.setScalar(0.4 + trapK * 0.6);
    });
    if (!fading) {
      this.zapT -= dt;
      if (this.zapT <= 0) {
        this.zapT = 0.07;
        const r = this.rings[Math.floor(Math.random() * 3)], a = Math.random() * TAU, rr = 1.0 + Math.random() * 0.8;
        const p = new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0).applyEuler(r.rotation).add(r.position);
        this.fx.arc(p, this.src.clone().add(new THREE.Vector3(0, 0.3 + Math.random() * 0.6, 0)), 0.12, Math.random() < 0.5 ? 0x7affe0 : 0xb8a0ff, 0.18);
        if (Math.random() < 0.12) sfx('zap', 1.4, 0.12);
      }
      this.castT -= dt; if (this.castT <= 0) { this.castT = 0.8; this.child?.cast(this.src.clone().add(new THREE.Vector3(0, 1.5, 0))); }
    }
    // ---- the helix: unspools upward, then leaves gene by gene
    if (this.beads && this.rungs) {
      const grow = Math.min(1, Math.max(0, (T - 0.3) / 1.35));
      const shown = this.N * grow;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), c = new THREE.Vector3();
      for (let j = 0; j < this.N; j++) {
        const g = this.genes[Math.floor(j / RUNGS)];
        let k = j < shown ? Math.min(1, shown - j) : 0;
        if (g && g.fly > 0) k = Math.max(0, 1 - g.fly * 6);
        if (fading) k *= fk;
        const unz = Math.max(0, 1 - (shown - j) / 4) * 0.9; // the leading turn is still unzipping
        this.strand(j, 0, p0, 1 + unz); this.strand(j, 1, p1, 1 + unz);
        p0.y += unz * 0.12; p1.y -= unz * 0.12;
        if (g && g.fly > 0) { c.copy(g.from); p0.lerp(c, 1 - k); p1.lerp(c, 1 - k); }
        m.compose(p0, q.identity(), s.setScalar(k)); this.beads.setMatrixAt(j * 2, m);
        m.compose(p1, q, s); this.beads.setMatrixAt(j * 2 + 1, m);
        c.addVectors(p0, p1).multiplyScalar(0.5);
        const len = p0.distanceTo(p1);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(p1.z - p0.z, p1.x - p0.x));
        m.compose(c, q, s.set(len * k, k, k)); this.rungs.setMatrixAt(j, m);
      }
      this.beads.instanceMatrix.needsUpdate = true; this.rungs.instanceMatrix.needsUpdate = true;
    }
    // ---- cells boil out and spiral up round the strands
    if (this.cellMesh) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      this.cells.forEach((c, i) => {
        const u = (T - c.delay) / c.dur;
        if (u <= 0 || u >= 1 || fading) { m.makeScale(0, 0, 0); this.cellMesh!.setMatrixAt(i, m); return; }
        const a = c.seed + u * TAU * 1.6, r = c.r * (1 - u * 0.55);
        p.set(this.src.x + Math.cos(a) * r, this.src.y + 0.2 + c.h * Math.sin(u * Math.PI * 0.5), this.src.z + Math.sin(a) * r);
        m.compose(p, q, s.setScalar(0.6 + Math.sin(u * Math.PI) * 0.8)); this.cellMesh!.setMatrixAt(i, m);
      });
      this.cellMesh.instanceMatrix.needsUpdate = true;
    }
    // ---- capsules fly into the golem
    const to = this.target(), tmp = new THREE.Vector3();
    for (const g of this.genes) {
      if (g.got) continue;
      if (g.fly <= 0 && T >= g.t0 && !fading) this.detach(g);
      if (g.fly > 0 && g.cap) {
        g.fly += dt / 0.8;
        const u = Math.min(1, g.fly), e = u * u * (3 - 2 * u);
        g.c2.lerp(to.clone().add(new THREE.Vector3(0, 2.2, 0)), 0.1);
        bez(tmp, g.from, g.c1, g.c2, to, e);
        g.cap.position.copy(tmp);
        g.cap.scale.setScalar(Math.max(0.2, 1 - e * 0.7));
        g.cap.rotation.y += dt * 6;
        if (Math.random() < dt * 14) this.fx.burst(tmp.x, tmp.y, tmp.z, 1, g.col.getHex(), { glow: true, speed: 0.2, up: 0.1, size: 2, life: 0.5, grav: 0 });
        if (g.tag && this.cam) {
          const v = tmp.clone().project(this.cam);
          g.tag.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; g.tag.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px';
          g.tag.style.opacity = v.z < 1 ? String(1 - Math.max(0, e - 0.75) * 4) : '0';
        }
        if (u >= 1) this.arrive(g);
      }
    }
    if (!fading && T >= this.end) this.finish(false);
  }
  private cleanup() {
    removeEventListener('keydown', this.onKey, true);
    for (const g of this.genes) { if (g.cap) { g.cap.removeFromParent(); g.cap.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }); } g.tag?.remove(); }
    for (const r of this.rings) { r.removeFromParent(); r.geometry.dispose(); (r.material as THREE.Material).dispose(); }
    if (this.rune) { this.rune.removeFromParent(); this.rune.geometry.dispose(); const mm = this.rune.material as THREE.MeshBasicMaterial; mm.map?.dispose(); mm.dispose(); }
    for (const im of [this.cellMesh, this.beads, this.rungs]) if (im) { im.removeFromParent(); im.geometry.dispose(); (im.material as THREE.Material).dispose(); }
    this.box?.remove();
    this.genes = []; this.cells = []; this.rings = []; this.rune = null; this.cellMesh = null; this.beads = null; this.rungs = null; this.box = null;
    this.open = false; this.fade = 0;
  }
}
