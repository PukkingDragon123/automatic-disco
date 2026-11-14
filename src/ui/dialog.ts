// Dialogue: the golem's radio receiver. A live portrait (its own small render of the speaker's rig, or static for a
// voice from orbit, or the field journal's page), typewriter text with a tick per letter, and an 8-bit murmur under
// every line. Speakers: Dr. Calder (default), 'journal', 'radio' (Station Four), 'hollis', 'brandt', or any name.
import * as THREE from 'three';
import { el, panel, S } from './kit';
import { voice, sfx } from '../audio/audio';
import { csfx } from './cineAudio';
import { hiIcon } from './icons';

export interface Line { text: string; who?: string; expr?: string; hold?: number; onShow?: () => void }

export interface PortraitRig { root: THREE.Object3D; update(dt: number): void; say(sec: number, expr?: string): void; head(out: THREE.Vector3): THREE.Vector3 }

const NAMES: Record<string, string> = { calder: 'DR. CALDER', journal: 'FIELD JOURNAL', radio: 'STATION FOUR', station: 'STATION FOUR', hollis: 'LT. HOLLIS · RADIO', brandt: 'DR. BRANDT' };
const PITCH: Record<string, number> = { radio: 0.8, station: 0.8, hollis: 0.85, brandt: 1.35 };

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
  /** a line has finished (read, skipped or cleared) */
  onDone?: (l: Line) => void;
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
  clear() { const c = this.cur; this.q = []; this.cur = null; this.box.style.display = 'none'; if (c) this.onDone?.(c); }
  /** finish typing the line, or end it */
  skip() { if (!this.cur) return; if (this.shown < this.cur.text.length) this.shown = this.cur.text.length; else this.t = this.dur; }
  private kind() { const w = this.cur?.who ?? 'calder'; return w; }
  update(dt: number) {
    if (!this.cur && this.q.length) {
      this.cur = this.q.shift()!; this.shown = 0; this.t = 0;
      const w = this.kind(), radio = w === 'radio' || w === 'station' || w === 'hollis';
      const vlen = w === 'journal' ? 0 : voice(this.cur.text, PITCH[w] ?? 1);
      this.dur = Math.max(2.6, vlen + 1.6, this.cur.text.length * 0.045 + 1.4) + (this.cur.hold ?? 0);
      this.box.style.display = 'flex';
      this.nameEl.textContent = NAMES[w] ?? w.toUpperCase();
      this.box.classList.toggle('journal', w === 'journal');
      this.box.classList.toggle('radio', radio);
      if (w === 'calder') this.portrait?.say(Math.min(vlen || 2, 5), this.cur.expr);
      this.cur.onShow?.();
      this.onLine?.(this.cur);
      if (radio) csfx('squelch', 0.5); else if (w === 'journal') csfx('page', 0.4); else sfx('open', 1, 0.3);
      this.pt = 0;
    }
    if (!this.cur) return;
    this.t += dt;
    const before = Math.floor(this.shown);
    this.shown = Math.min(this.cur.text.length, this.shown + dt * 42);
    const n = Math.floor(this.shown);
    if (n !== before) { this.txt.textContent = this.cur.text.slice(0, n); if (this.kind() === 'journal' && n % 3 === 0) csfx('type', 0.35); }
    if (this.t >= this.dur) { const c = this.cur; this.cur = null; if (!this.q.length) this.box.style.display = 'none'; this.onDone?.(c); return; }
    // the portrait at ~10 fps: the rig, static from orbit, or the journal's page
    this.pt -= dt;
    if (this.pt <= 0) {
      this.pt = 0.1;
      const w = this.kind();
      if (w === 'radio' || w === 'station' || w === 'hollis') this.drawStatic();
      else if (w === 'journal') this.drawJournal();
      else if (this.portrait) this.drawPortrait();
    }
  }
  private drawStatic() {
    const d = this.img.data;
    for (let i = 0; i < 64 * 64; i++) { const v = Math.random() < 0.5 ? 20 + Math.random() * 60 : 120 + Math.random() * 135; const o = i * 4; d[o] = v * 0.7; d[o + 1] = v; d[o + 2] = v * 0.75; d[o + 3] = 255; }
    // a rolling bar and a faint transmitter mast
    const bar = Math.floor((performance.now() / 30) % 64);
    for (let x = 0; x < 64; x++) for (let k = 0; k < 4; k++) { const o = (((bar + k) % 64) * 64 + x) * 4; d[o] *= 0.4; d[o + 1] *= 0.5; d[o + 2] *= 0.4; }
    for (let y = 18; y < 54; y++) { const o = (y * 64 + 32) * 4; d[o] = 30; d[o + 1] = 60; d[o + 2] = 30; }
    this.g.putImageData(this.img, 0, 0);
  }
  private drawJournal() {
    const g = this.g;
    g.fillStyle = '#e9dfc0'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(90,120,160,0.4)'; for (let y = 8; y < 64; y += 6) g.fillRect(0, y, 64, 1);
    g.fillStyle = 'rgba(170,60,50,0.5)'; g.fillRect(9, 0, 1, 64);
    const ic = hiIcon('journal', 40);
    if (ic) { const c = document.createElement('canvas'); c.width = ic.w; c.height = ic.h; c.getContext('2d')!.putImageData(ic.toImageData(), 0, 0); g.drawImage(c, 12, 12); }
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
