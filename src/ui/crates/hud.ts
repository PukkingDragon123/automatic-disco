// The crate HUD, bottom left: the pod's hold and every container as a live 3D miniature (its kind, paint and logo,
// cut away so what is really inside shows as tiny item art), three to a page. A new container pops in; scroll, swipe
// or the arrow keys turn the page; hover shows what it holds; click opens its grid window. Drawn by a small three.js
// view of its own that only renders while something moves.
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { Storage } from '../../inv/storage';
import type { Container } from '../../inv/container';
import { ContainerModel } from '../../inv/models';
import { itemDef, itemIcon } from '../../factory/items';
import type { InvUI } from './grid';
import { injectCrateCSS } from './style';
import { panelURL, wellURL, lampURL } from './hw';
import { PH } from '../machine';
import { sfx } from '../../audio/audio';

const PER = 3, SPACE = 2.5;
const ik = () => (innerHeight >= 1000 ? 2 : 1);
interface Mini { m: ContainerModel; pivot: THREE.Group; born: number; ver: number; fit: number }
export class CrateHud {
  readonly root: HTMLDivElement;
  private bed: HTMLDivElement; private canvas: HTMLCanvasElement; private labels: HTMLDivElement; private dots: HTMLDivElement; private title: HTMLDivElement; private hov: HTMLDivElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene(); private cam = new THREE.PerspectiveCamera(26, 3, 0.1, 100);
  private minis = new Map<Container, Mini>();
  page = 0; private camX = 0; private hover = -1; private dirty = true; private last = 0; private raf = 0; private t = 0;
  private swipe: { x: number; px: number; moved: boolean } | null = null;
  private labelKey = '';
  constructor(readonly g: Game, readonly st: Storage, readonly ui: InvUI) {
    injectCrateCSS();
    const r = (this.root = document.createElement('div'));
    r.className = 'crate-hud';
    r.innerHTML = `<div class="bed"><canvas></canvas><div class="hov"></div><div class="labels"></div></div>
      <div class="row"><button class="inv-key sq prev" title="Previous page (scroll)">${ARROW_L}</button><div class="t">STORES</div><div class="dots"></div><button class="inv-key sq next" title="Next page (scroll)">${ARROW_R}</button></div>`;
    this.bed = r.querySelector('.bed')!; this.canvas = r.querySelector('canvas')!; this.labels = r.querySelector('.labels')!; this.dots = r.querySelector('.dots')!; this.title = r.querySelector('.t')!; this.hov = r.querySelector('.hov')!;
    this.layoutHw();
    addEventListener('resize', () => this.layoutHw());
    r.querySelector<HTMLButtonElement>('.prev')!.onclick = () => this.turn(-1);
    r.querySelector<HTMLButtonElement>('.next')!.onclick = () => this.turn(1);
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); this.turn(e.deltaY + e.deltaX > 0 ? 1 : -1); }, { passive: false });
    this.canvas.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; this.swipe = { x: e.clientX, px: this.camX, moved: false }; this.canvas.setPointerCapture(e.pointerId); e.stopPropagation(); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (this.swipe) { const dx = e.clientX - this.swipe.x; if (Math.abs(dx) > 6) this.swipe.moved = true; if (this.swipe.moved) { this.camX = this.swipe.px - (dx / this.bed.clientWidth) * PER * SPACE; this.dirty = true; } return; }
      this.setHover(this.slotAt(e.clientX), e);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      const s = this.swipe; this.swipe = null;
      if (s?.moved) { const dx = e.clientX - s.x; this.turn(dx < -20 ? 1 : dx > 20 ? -1 : 0); return; }
      const i = this.slotAt(e.clientX), list = this.list(), c = list[this.page * PER + i];
      if (c) { this.ui.open(c); sfx('click', 0.8, 0.5); }
    });
    this.canvas.addEventListener('pointerleave', () => this.setHover(-1));
    r.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(r);
    st.on('container', (d: { c: Container; added: boolean }) => {
      if (d.added) { const i = this.list().indexOf(d.c); if (i >= 0) { this.page = Math.floor(i / PER); this.root.classList.remove('flash'); void this.root.offsetWidth; this.root.classList.add('flash'); sfx('done', 1.3, 0.4); } }
      this.dirty = true;
    });
    st.on('change', () => (this.dirty = true));
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setClearColor(0x000000, 0);
    } catch (e) { console.warn('crate hud: no WebGL', e); }
    this.scene.add(new THREE.HemisphereLight(0xc7d6c4, 0x3a2f24, 1.5));
    const key = new THREE.DirectionalLight(0xffe7c4, 2.4); key.position.set(-3, 5, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb8a8, 0.9); rim.position.set(4, 2, -3); this.scene.add(rim);
    const loop = (t: number) => { this.raf = requestAnimationFrame(loop); this.frame(t); };
    this.raf = requestAnimationFrame(loop);
  }
  /** the hardware: a painted panel 216 x 132 art pixels, a glass bed, the key row (all at --ik) */
  private layoutHw() {
    const k = innerHeight >= 1000 ? 2 : 1, W = 216, H = 132;
    Object.assign(this.root.style, { width: W * k + 'px', height: H * k + 'px', backgroundImage: `url(${panelURL(W, H, 0, 11)})`, backgroundSize: `${W * k}px ${H * k}px` });
    const bw = 202, bh = 96;
    Object.assign(this.bed.style, { left: 7 * k + 'px', top: 7 * k + 'px', width: bw * k + 'px', height: bh * k + 'px', backgroundImage: `url(${wellURL(bw, bh)})`, backgroundSize: `${bw * k}px ${bh * k}px` });
    const row = this.root.querySelector<HTMLDivElement>('.row')!;
    Object.assign(row.style, { left: 7 * k + 'px', top: 107 * k + 'px', width: bw * k + 'px', height: 20 * k + 'px' });
    this.dirty = true; this.labelKey = '';
  }
  /** the hold first, then the containers in the order they were built */
  list(): Container[] { return this.st.all(); }
  get pages() { return Math.max(1, Math.ceil(this.list().length / PER)); }
  turn(d: number) {
    const p = Math.max(0, Math.min(this.pages - 1, this.page + d));
    if (p !== this.page) sfx('click', 1.2, 0.35);
    this.page = p; this.dirty = true; this.setHover(-1);
  }
  private slotAt(x: number) { const r = this.canvas.getBoundingClientRect(); return Math.max(0, Math.min(PER - 1, Math.floor(((x - r.left) / r.width) * PER))); }
  private setHover(i: number, e?: PointerEvent) {
    const c = i >= 0 ? this.list()[this.page * PER + i] : undefined;
    if (!c) i = -1;
    if (i !== this.hover) { this.hover = i; this.dirty = true; }
    if (i < 0 || !c) { this.hov.style.display = 'none'; this.ui.tip(null); return; }
    const w = this.bed.clientWidth / PER;
    Object.assign(this.hov.style, { display: 'block', left: i * w + 2 + 'px', width: w - 4 + 'px', top: '2px', bottom: '2px' });
    if (e) this.ui.tip(this.summary(c), e.clientX, e.clientY - 120 * ik());
  }
  private summary(c: Container) {
    const top = c.contents().slice(0, 6);
    const mass = c.stacks.reduce((m, s) => m + itemDef(s.item).mass * s.n, 0);
    const rows = top.map((e) => `<div class="row"><span><img src="${itemIcon(e.item, 32)}" style="width:${16 * ik()}px;height:${16 * ik()}px"> ${itemDef(e.item).name}</span><span>${e.n}</span></div>`).join('');
    const more = c.contents().length - top.length;
    return `<h4>${c.label}</h4><div class="row"><span class="g">${c.info.name.toUpperCase()}</span><span>${Math.round(c.fill() * 100)}%</span></div>${rows || '<div class="g">Empty</div>'}${more > 0 ? `<div class="g">+ ${more} more kinds</div>` : ''}<div class="row"><span class="g">MASS</span><span>${Math.round(mass)} KG</span></div><div class="g">Click to open</div>`;
  }
  /** keep a miniature for every container: built cut away, scaled to fit its slot */
  private sync() {
    const list = this.list();
    for (const [c, m] of this.minis) if (!list.includes(c)) { m.m.dispose(); m.pivot.removeFromParent(); this.minis.delete(c); }
    list.forEach((c, i) => {
      let m = this.minis.get(c);
      if (!m) {
        const model = new ContainerModel(c, { cutaway: true, shadow: false });
        const pivot = new THREE.Group(); pivot.add(model.root); this.scene.add(pivot);
        const box = new THREE.Box3().setFromObject(model.root), sz = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
        const fit = 2.0 / Math.max(sz.x, sz.z * 1.0, sz.y * 1.05);
        model.root.position.set(-ctr.x, -box.min.y, -ctr.z);
        m = { m: model, pivot, born: performance.now() - c.born > 3000 ? 0 : performance.now(), ver: -1, fit };
        this.minis.set(c, m);
      }
      m.pivot.position.x = i * SPACE;
      const on = Math.abs(i - (this.page * PER + 1)) <= PER + 1;
      m.pivot.visible = on;
    });
  }
  private frame(t: number) {
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000); this.last = t; this.t += dt;
    if (!this.renderer || !this.root.isConnected || this.root.style.display === 'none') return;
    this.sync();
    // the page slides; pops and hover keep it rendering; otherwise a slow sway at a low rate
    const goal = (this.page * PER + 1) * SPACE;
    if (!this.swipe) { const d = goal - this.camX; this.camX += d * Math.min(1, dt * 9); if (Math.abs(d) > 0.002) this.dirty = true; else this.camX = goal; }
    const now = performance.now();
    let anim = false;
    for (const [c, m] of this.minis) {
      if (m.ver !== c.ver) { m.ver = c.ver; m.m.update(); this.dirty = true; }
      const age = m.born ? (now - m.born) / 1000 : 9;
      const pop = age < 0.7 ? popEase(age / 0.7) : 1;
      if (age < 0.7) anim = true;
      const i = this.list().indexOf(c), slot = i - this.page * PER, hov = slot === this.hover;
      m.pivot.scale.setScalar(m.fit * pop * (hov ? 1.08 : 1));
      m.pivot.rotation.y = -0.42 + Math.sin(this.t * 0.6 + i * 1.7) * 0.06 + (hov ? 0.25 : 0);
      m.pivot.position.y = hov ? 0.08 : 0;
    }
    // a slow sway at about 12 fps when idle, full rate while something moves
    const slow = !this.dirty && !anim;
    if (slow && Math.floor(this.t * 12) === Math.floor((this.t - dt) * 12)) return;
    this.dirty = false;
    // rendered at art resolution (one art pixel = --ik screen pixels) and blown up crisp: the miniatures are pixel art
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, pr = (devicePixelRatio || 1) / (innerHeight >= 1000 ? 2 : 1);
    if (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h * pr)) { this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); }
    this.cam.aspect = w / Math.max(1, h); this.cam.fov = 2 * Math.atan((SPACE * PER * 0.5) / (this.cam.aspect * 9.2)) * 180 / Math.PI;
    this.cam.position.set(this.camX, 4.4, 8.0); this.cam.lookAt(this.camX, 0.55, 0); this.cam.updateProjectionMatrix();
    this.renderer.render(this.scene, this.cam);
    this.renderLabels();
  }
  private renderLabels() {
    const list = this.list(), p = this.page;
    const vis = list.slice(p * PER, p * PER + PER);
    const key = p + '|' + vis.map((c) => `${c.id}:${c.label}:${Math.round(c.fill() * 100)}`).join(',') + '|' + list.length;
    if (key === this.labelKey) return;
    this.labelKey = key;
    this.labels.innerHTML = Array.from({ length: PER }, (_, i) => { const c = vis[i]; return c ? `<div class="${c.fill() > 0.9 ? 'full' : ''}"><span class="nm">${c.label}</span><span class="g"><b style="width:${Math.round(c.fill() * 100)}%"></b></span></div>` : '<div></div>'; }).join('');
    this.dots.innerHTML = Array.from({ length: this.pages }, (_, i) => `<img src="${lampURL(i === p, PH)}" data-p="${i}">`).join('');
    this.dots.querySelectorAll<HTMLElement>('img').forEach((d) => (d.onclick = () => { this.page = Number(d.dataset.p); this.dirty = true; }));
    this.title.textContent = `STORES ${list.length}`;
    (this.root.querySelector('.prev') as HTMLElement).classList.toggle('dis', p <= 0);
    (this.root.querySelector('.next') as HTMLElement).classList.toggle('dis', p >= this.pages - 1);
  }
  /** a slot's screen rectangle (the tutorial points at it) */
  slotRect(i: number): DOMRect { const r = this.bed.getBoundingClientRect(), w = r.width / PER; return new DOMRect(r.left + i * w, r.top, w, r.height); }
  dispose() { cancelAnimationFrame(this.raf); for (const m of this.minis.values()) m.m.dispose(); this.renderer?.dispose(); this.root.remove(); }
}
/** a pop with overshoot */
function popEase(k: number) { const s = 1.70158 * 1.4; k = k - 1; return Math.max(0.001, k * k * ((s + 1) * k + s) + 1); }
const ARROW_L = `<svg viewBox="0 0 8 8" shape-rendering="crispEdges"><path fill="currentColor" d="M5 1h1v6H5V6H4V5H3V3h1V2h1z"/></svg>`;
const ARROW_R = `<svg viewBox="0 0 8 8" shape-rendering="crispEdges"><path fill="currentColor" d="M2 1h1v1h1v1h1v2H4v1H3v1H2z"/></svg>`;
