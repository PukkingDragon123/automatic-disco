// Dialogue: a field-journal panel with a live portrait (its own small render of the speaker's rig), typewriter
// text and an 8-bit murmur under every line.
import * as THREE from 'three';
import { el, panel, S } from './kit';
import { voice, sfx } from '../audio/audio';

export interface Line { text: string; who?: string; expr?: string; hold?: number; onShow?: () => void }

export interface PortraitRig { root: THREE.Object3D; update(dt: number): void; say(sec: number, expr?: string): void; head(out: THREE.Vector3): THREE.Vector3 }

export class Dialog {
  readonly box: HTMLDivElement;
  private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  private nameEl: HTMLDivElement; private txt: HTMLDivElement;
  private q: Line[] = [];
  private cur: Line | null = null; private shown = 0; private t = 0; private dur = 0;
  private scene = new THREE.Scene(); private cam = new THREE.PerspectiveCamera(22, 1, 0.05, 20);
  private rt = new THREE.WebGLRenderTarget(64, 64);
  private px = new Uint8Array(64 * 64 * 4);
  private img: ImageData;
  private pt = 0;
  onLine?: (l: Line) => void;
  constructor(parent: HTMLElement, readonly renderer: THREE.WebGLRenderer, readonly portrait: PortraitRig | null) {
    this.box = panel('dlg', parent);
    const pf = el('div', 'px-inset dlg-pf', this.box);
    this.cv = el('canvas', 'dlg-cv', pf); this.cv.width = 64; this.cv.height = 64;
    this.g = this.cv.getContext('2d')!; this.img = this.g.createImageData(64, 64);
    const right = el('div', 'dlg-r', this.box);
    this.nameEl = el('div', 'hdr dlg-name', right, 'DR. CALDER');
    this.txt = el('div', 'dlg-txt', right);
    this.box.style.display = 'none';
    this.box.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.skip(); });
    if (portrait) {
      this.scene.add(new THREE.HemisphereLight(0xe8eeff, 0x40302a, 2.0));
      const k = new THREE.DirectionalLight(0xffe8d0, 2.6); k.position.set(-1, 2, 2); this.scene.add(k);
      const r = new THREE.DirectionalLight(0x7affe0, 1.6); r.position.set(1.5, 0.5, -1.5); this.scene.add(r);
      this.scene.add(portrait.root);
    }
  }
  say(lines: Line[]) { this.q.push(...lines); }
  get busy() { return !!this.cur || this.q.length > 0; }
  clear() { this.q = []; this.cur = null; this.box.style.display = 'none'; }
  private skip() { if (!this.cur) return; if (this.shown < this.cur.text.length) this.shown = this.cur.text.length; else this.t = this.dur; }
  update(dt: number) {
    if (!this.cur && this.q.length) {
      this.cur = this.q.shift()!; this.shown = 0; this.t = 0;
      const vlen = voice(this.cur.text, this.cur.who === 'radio' ? 1.25 : 1);
      this.dur = Math.max(2.6, vlen + 1.6, this.cur.text.length * 0.045 + 1.4) + (this.cur.hold ?? 0);
      this.box.style.display = 'flex';
      this.nameEl.textContent = this.cur.who === 'journal' ? 'FIELD JOURNAL' : this.cur.who === 'radio' ? 'STATION FOUR' : 'DR. CALDER';
      this.box.classList.toggle('journal', this.cur.who === 'journal');
      this.portrait?.say(Math.min(vlen || 2, 5), this.cur.expr);
      this.cur.onShow?.();
      this.onLine?.(this.cur);
      sfx('open', 1, 0.3);
    }
    if (!this.cur) return;
    this.t += dt;
    const before = Math.floor(this.shown);
    this.shown = Math.min(this.cur.text.length, this.shown + dt * 42);
    if (Math.floor(this.shown) !== before) this.txt.textContent = this.cur.text.slice(0, Math.floor(this.shown));
    if (this.t >= this.dur) { this.cur = null; if (!this.q.length) this.box.style.display = 'none'; }
    // live portrait at ~10 fps
    this.pt -= dt;
    if (this.portrait && this.pt <= 0) { this.pt = 0.1; this.drawPortrait(); }
  }
  private drawPortrait() {
    const p = this.portrait!, R = this.renderer;
    p.update(0.1);
    const h = p.head(new THREE.Vector3());
    this.cam.position.set(h.x + 0.1, h.y + 0.13, h.z + 0.66); this.cam.lookAt(h.x, h.y + 0.09, h.z);
    const prev = R.getRenderTarget();
    R.setRenderTarget(this.rt); R.setClearColor(0x0c1a1c, 1); R.clear();
    R.render(this.scene, this.cam);
    R.readRenderTargetPixels(this.rt, 0, 0, 64, 64, this.px);
    R.setRenderTarget(prev);
    const d = this.img.data;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const i = ((63 - y) * 64 + x) * 4, o = (y * 64 + x) * 4;
      for (let k = 0; k < 3; k++) d[o + k] = Math.min(255, Math.pow(this.px[i + k] / 255, 1 / 2.2) * 255);
      d[o + 3] = 255;
    }
    // scanline flicker for the field-camera feel
    for (let y = 0; y < 64; y += 2) for (let x = 0; x < 64; x++) { const o = (y * 64 + x) * 4; d[o] *= 0.9; d[o + 1] *= 0.93; d[o + 2] *= 0.95; }
    this.g.putImageData(this.img, 0, 0);
  }
}
void S;
