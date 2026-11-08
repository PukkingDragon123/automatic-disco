// Live parts of the machine: rolling odometer drums, nixie tubes, needle gauges with a little spring and jitter,
// indicator lamps, momentary toggle switches, stencil text strips and steam vents. Each is a tiny DOM element or
// canvas that only redraws when its value moves.
import { el, Tip } from './kit';
import { sfx } from '../audio/audio';
import { Pix, GM, BR, CR, RD, INK, text, textW, dv, mixc, hex } from './machine';
import { hashf } from '../limbo/core/rng';

/** px in art units, scaled by --s */
export const u = (n: number) => `calc(${n}px * var(--s))`;
export function place<T extends HTMLElement>(e: T, x: number, y: number, w?: number, h?: number): T {
  e.style.left = u(x); e.style.top = u(y);
  if (w !== undefined) e.style.width = u(w);
  if (h !== undefined) e.style.height = u(h);
  return e;
}
export function tip(e: HTMLElement, html: () => string) {
  e.addEventListener('pointerenter', () => Tip.show(html(), e));
  e.addEventListener('pointerleave', () => Tip.hide());
}

// ------------------------------------------------------------------ odometer
export class Odometer {
  readonly e: HTMLDivElement;
  private strips: HTMLDivElement[] = [];
  private cur: number[] = [];
  constructor(parent: HTMLElement, readonly n: number, x: number, y: number, cls = '') {
    this.e = place(el('div', 'odo ' + cls, parent), x, y, n * 8 - 1, 11);
    for (let i = 0; i < n; i++) {
      const w = place(el('div', 'drum', this.e), i * 8, 0, 7, 11);
      this.strips.push(el('div', 'strip', w));
      this.cur.push(0);
    }
  }
  set(v: number) {
    v = Math.max(0, Math.min(10 ** this.n - 1, Math.floor(v)));
    const s = String(v).padStart(this.n, '0');
    for (let i = 0; i < this.n; i++) {
      const d = +s[i], st = this.strips[i], c = this.cur[i];
      if (d === c) continue;
      // roll forward through the wrap: 9 -> 0 goes to the spare 0 cell, then snaps back silently
      if (d === 0 && c === 9) {
        st.style.setProperty('--d', '10');
        setTimeout(() => { st.style.transition = 'none'; st.style.setProperty('--d', '0'); void st.offsetWidth; st.style.transition = ''; }, 260);
      } else st.style.setProperty('--d', String(d));
      this.cur[i] = d;
      // leading zeros print dim, like an unused drum
    }
    let lead = true;
    for (let i = 0; i < this.n; i++) { if (s[i] !== '0' || i === this.n - 1) lead = false; this.strips[i].parentElement!.classList.toggle('lz', lead); }
  }
}

// ------------------------------------------------------------------ nixie
export class Nixie {
  readonly e: HTMLDivElement;
  private tubes: HTMLDivElement[] = [];
  private cur: string[] = [];
  constructor(parent: HTMLElement, readonly n: number, x: number, y: number, readonly blankLead = true) {
    this.e = place(el('div', 'nixie', parent), x, y, n * 10 - 1, 15);
    for (let i = 0; i < n; i++) { const t = place(el('div', 'nx', this.e), i * 10, 0, 9, 15); el('div', 'nxg', t); this.tubes.push(t); this.cur.push(''); }
  }
  set(v: number) {
    v = Math.max(0, Math.min(10 ** this.n - 1, Math.floor(v)));
    let s = String(v).padStart(this.n, this.blankLead ? ' ' : '0');
    if (s.trim() === '') s = s.slice(0, -1) + '0';
    for (let i = 0; i < this.n; i++) {
      if (s[i] === this.cur[i]) continue;
      this.cur[i] = s[i];
      const t = this.tubes[i];
      t.style.setProperty('--n', s[i] === ' ' ? '10' : s[i]);
      t.classList.remove('flk'); void t.offsetWidth; t.classList.add('flk');
    }
  }
}

// ------------------------------------------------------------------ pixel text strip (3x5 stencil face)
export class PixText {
  readonly cv: HTMLCanvasElement; private g: CanvasRenderingContext2D; private last = '';
  constructor(parent: HTMLElement, x: number, y: number, readonly w: number, readonly align: 'left' | 'right' | 'center' = 'left', cls = '') {
    this.cv = place(el('canvas', 'ptxt ' + cls, parent), x, y, w, 6);
    this.cv.width = w; this.cv.height = 6;
    this.g = this.cv.getContext('2d')!;
  }
  set(s: string, col: number, glow = false) {
    const k = s + col + glow; if (k === this.last) return; this.last = k;
    const p = new Pix(this.w, 6), tw = textW(s);
    const x = this.align === 'right' ? this.w - tw : this.align === 'center' ? Math.floor((this.w - tw) / 2) : 0;
    text(p, s, x, 0, col, glow ? 'flat' : 'shadow');
    this.g.clearRect(0, 0, this.w, 6);
    this.g.putImageData(p.image(), 0, 0);
  }
}

// ------------------------------------------------------------------ lamp
export class Lamp {
  readonly e: HTMLDivElement; private st = '';
  constructor(parent: HTMLElement, x: number, y: number, readonly color: 'g' | 'a' | 'r' = 'g', cls = '') {
    this.e = place(el('div', `lamp l-${color} ${cls}`, parent), x, y, 7, 7);
  }
  set(st: 'off' | 'dim' | 'on' | 'blink' | 'fast', color?: 'g' | 'a' | 'r') {
    const k = st + (color ?? this.color); if (k === this.st) return; this.st = k;
    this.e.className = `lamp l-${color ?? this.color} ${st}`;
  }
}

// ------------------------------------------------------------------ toggle switch (momentary)
export class Toggle {
  readonly e: HTMLDivElement; readonly lamp: Lamp;
  constructor(parent: HTMLElement, x: number, y: number, label: string, key: string, tipHtml: () => string, run: () => void) {
    this.e = place(el('div', 'tog', parent), x, y, 19, 40);
    this.lamp = new Lamp(this.e, 6, 0, 'g', 'dim');
    const bat = place(el('div', 'bat', this.e), 4, 9, 11, 15);
    const lab = new PixText(this.e, 0, 27, 19, 'center'); lab.set(label, CR[4]);
    const kt = new PixText(this.e, 0, 34, 19, 'center'); kt.set(key, BR[6]);
    this.e.addEventListener('pointerenter', () => { this.lamp.set('on'); sfx('hover'); Tip.show(tipHtml(), this.e); });
    this.e.addEventListener('pointerleave', () => { this.lamp.set('dim'); Tip.hide(); });
    this.e.addEventListener('pointerdown', (e) => { e.stopPropagation(); bat.classList.add('down'); sfx('crack', 0.35, 0.35); });
    this.e.addEventListener('pointerup', () => { if (!bat.classList.contains('down')) return; setTimeout(() => bat.classList.remove('down'), 140); sfx('click', 1, 0.6); run(); });
    this.e.addEventListener('pointercancel', () => bat.classList.remove('down'));
  }
}

// ------------------------------------------------------------------ needle gauge
export interface GaugeOpts { w: number; h: number; cx: number; cy: number; r: number; a0: number; a1: number; face: (p: Pix) => void; needle?: number; hub?: boolean }
/** an analog meter: a pre-painted face and a sprung needle that swings and trembles */
export class Gauge {
  readonly cv: HTMLCanvasElement; private g: CanvasRenderingContext2D; private face: Pix;
  private v = 0; private vel = 0; target = 0; private drawn = -9; private t = Math.random() * 10;
  jitter = 0.006; red = false; private redDrawn = false;
  marks: number[] = [];
  constructor(parent: HTMLElement, x: number, y: number, readonly o: GaugeOpts, cls = '') {
    this.cv = place(el('canvas', 'gauge ' + cls, parent), x, y, o.w, o.h);
    this.cv.width = o.w; this.cv.height = o.h;
    this.g = this.cv.getContext('2d')!;
    this.face = new Pix(o.w, o.h); o.face(this.face);
  }
  set(v: number) { this.target = Math.max(-0.02, Math.min(1.04, v)); }
  kick(dv2: number) { this.vel += dv2; }
  update(dt: number) {
    this.t += dt;
    const k = 90, c = 11;
    this.vel += (k * (this.target - this.v) - c * this.vel) * dt;
    this.v += this.vel * dt;
    const shown = this.v + Math.sin(this.t * 37) * this.jitter + Math.sin(this.t * 13.7) * this.jitter * 0.6;
    if (Math.abs(shown - this.drawn) < 0.002 && this.red === this.redDrawn) return;
    this.drawn = shown; this.redDrawn = this.red;
    const o = this.o, p = new Pix(o.w, o.h); p.d.set(this.face.d);
    // marks (e.g. an ability's cost) as little red ticks on the rim
    for (const m of this.marks) {
      const a = o.a0 + (o.a1 - o.a0) * m;
      for (let r = o.r - 2; r <= o.r; r++) p.set(Math.round(o.cx + Math.sin(a) * r), Math.round(o.cy - Math.cos(a) * r), RD[5]);
    }
    const a = o.a0 + (o.a1 - o.a0) * Math.max(0, Math.min(1, shown));
    const L = o.needle ?? o.r - 1, tx = o.cx + Math.sin(a) * L, ty = o.cy - Math.cos(a) * L;
    const col = this.red ? RD[6] : RD[4];
    p.line(o.cx + 1, o.cy + 1, tx + 1, ty + 1, INK, 110);
    p.line(o.cx, o.cy, tx, ty, col);
    p.set(Math.round(tx), Math.round(ty), this.red ? RD[7] : RD[6]);
    if (o.hub !== false) { p.disc(o.cx, o.cy, 1.6, BR[3]); p.set(o.cx - 1, o.cy - 1, BR[7]); p.set(o.cx, o.cy, BR[5]); }
    this.g.putImageData(p.image(), 0, 0);
  }
}
/** paint a round meter face: brass bezel, cream card, tick marks, optional red zone and a stencil label */
export function meterFace(p: Pix, cx: number, cy: number, r: number, a0: number, a1: number, o: { label?: string; red?: [number, number]; ticks?: number; dark?: boolean; full?: boolean } = {}) {
  const card = o.dark ? [0x0e1410, 0x142018, 0x1a2a1e] : [0xb8ae8a, 0xd2c8a2, 0xe6dcb8];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r + 2.5) continue;
    if (!o.full && y > cy + 2) continue;
    if (d > r + 1.2) p.set(x, y, d > r + 2 ? INK : x + y < cx + cy ? BR[6] : BR[2]);
    else if (d > r + 0.2) p.set(x, y, BR[1]);
    else p.set(x, y, dv(card, 1.6 - (y - (cy - r)) / (2 * r) * 1.2 + (hashf(x, y, 2) - 0.5) * 0.4, x, y));
  }
  if (o.red) for (let k = 0; k <= 24; k++) {
    const a = a0 + (a1 - a0) * (o.red[0] + (o.red[1] - o.red[0]) * (k / 24));
    for (let rr = r - 3; rr <= r - 1; rr++) p.set(Math.round(cx + Math.sin(a) * rr), Math.round(cy - Math.cos(a) * rr), RD[4]);
  }
  const n = o.ticks ?? 10;
  for (let k = 0; k <= n; k++) {
    const a = a0 + (a1 - a0) * (k / n), big = k % (n / 2) === 0 || k === n;
    for (let rr = r - (big ? 3 : 2); rr <= r - 1; rr++) p.set(Math.round(cx + Math.sin(a) * rr), Math.round(cy - Math.cos(a) * rr), o.dark ? 0x7ae088 : 0x2a2418);
  }
  if (o.label) text(p, o.label, cx - Math.floor(textW(o.label) / 2), Math.round(cy - r * 0.45) - 2, o.dark ? 0x43b65a : 0x5a4a30);
  // glass glint
  p.set(Math.round(cx - r * 0.55), Math.round(cy - r * 0.6), 0xffffff, 150); p.set(Math.round(cx - r * 0.45), Math.round(cy - r * 0.7), 0xffffff, 110);
}

// ------------------------------------------------------------------ steam
/** a vent that breathes now and then */
export function steamVent(parent: HTMLElement, x: number, y: number, every = 6) {
  const puff = () => {
    if (!parent.isConnected) return;
    if (parent.offsetParent !== null || getComputedStyle(parent).position === 'fixed') {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) setTimeout(() => {
        const s = place(el('div', 'puff', parent), x - 7 + Math.round((Math.random() - 0.5) * 4), y - 12, 14, 14);
        s.style.setProperty('--dx', String(Math.round((Math.random() - 0.3) * 6)));
        setTimeout(() => s.remove(), 1300);
      }, i * 160);
    }
    setTimeout(puff, (every * 0.5 + Math.random() * every) * 1000);
  };
  setTimeout(puff, Math.random() * every * 1000);
}

/** subtle 1px light spill painted into a housing around an opening */
export function glowRim(p: Pix, x: number, y: number, w: number, h: number, col: number, a = 60) {
  for (let i = -1; i <= w; i++) { p.set(x + i, y - 2, col, a); p.set(x + i, y + h + 1, col, a * 0.6); }
  for (let j = -1; j <= h; j++) { p.set(x - 2, y + j, col, a * 0.8); p.set(x + w + 1, y + j, col, a * 0.6); }
}
export { mixc, hex, GM };

// ------------------------------------------------------------------ rotary knob
/** a knurled Bakelite knob you can drag (up/down) or scroll; it clicks through detents */
export class Knob {
  readonly cv: HTMLCanvasElement; private g: CanvasRenderingContext2D; private drawn = -1;
  constructor(parent: HTMLElement, x: number, y: number, public v: number, readonly steps: number, readonly onChange: (v: number) => void, tipHtml?: () => string) {
    this.cv = place(el('canvas', 'knob', parent), x, y, 15, 15);
    this.cv.width = 15; this.cv.height = 15;
    this.g = this.cv.getContext('2d')!;
    this.draw();
    let drag: { y: number; v: number } | null = null;
    this.cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.cv.setPointerCapture(e.pointerId); drag = { y: e.clientY, v: this.v }; });
    this.cv.addEventListener('pointermove', (e) => { if (drag) this.set(drag.v + (drag.y - e.clientY) / 60); });
    this.cv.addEventListener('pointerup', () => { drag = null; });
    this.cv.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); this.set(this.v + (e.deltaY < 0 ? 1 : -1) / this.steps); }, { passive: false });
    if (tipHtml) tip(this.cv, tipHtml);
  }
  set(v: number) {
    const q = Math.round(Math.max(0, Math.min(1, v)) * this.steps) / this.steps;
    if (q === this.v) return;
    this.v = q; sfx('crack', 0.3, 0.2); sfx('qte-tick', 1, 0.4);
    this.draw(); this.onChange(q);
  }
  private draw() {
    if (this.drawn === this.v) return; this.drawn = this.v;
    const p = new Pix(15, 15), cx = 7, cy = 7, r = 6, ang = -2.4 + this.v * 4.8;
    const K = [0x0c0b0a, 0x1a1816, 0x2a2724, 0x3e3a35, 0x58534b, 0x7a7468];
    for (let y = 0; y < 15; y++) for (let x = 0; x < 15; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 0.5) { if (d < r + 1.6 && x + y > cx + cy) p.set(x, y, INK, 140); continue; }
      const a = Math.atan2(y - cy, x - cx), lit = -(Math.cos(a) * -0.55 + Math.sin(a) * -0.83);
      if (d > r - 1.3) { const ridge = Math.floor(((a - ang) / (Math.PI * 2)) * 18 + 100) % 2; p.set(x, y, K[Math.max(0, Math.min(5, Math.round(2.5 + lit * 1.6 + (ridge ? 0.8 : -0.6))))]); }
      else p.set(x, y, dv(K, 2.4 + lit * 1.2 - (d / r) * 0.6, x, y));
    }
    // pointer line + a brass index dot
    for (let t = 1; t < r - 0.5; t += 0.5) p.set(Math.round(cx + Math.sin(ang) * t), Math.round(cy - Math.cos(ang) * t), CR[4]);
    p.set(cx - 2, cy - 3, 0x8a8478);
    this.g.clearRect(0, 0, 15, 15); this.g.putImageData(p.image(), 0, 0);
  }
}

// ------------------------------------------------------------------ CRT settings (shared by every phosphor screen)
const store = { get(k: string, d: number) { try { const v = localStorage.getItem(k); return v === null ? d : +v; } catch { return d; } }, set(k: string, v: number) { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } } };
export const crtSettings = {
  gain: store.get('oddworld.crt.gain', 0.5),
  tint: store.get('oddworld.crt.tint', 0),
  apply() {
    const r = document.documentElement.style;
    r.setProperty('--crt-gain', String(0.7 + this.gain * 0.6));
    document.body.classList.toggle('p3', this.tint >= 0.5);
  },
  setGain(v: number) { this.gain = v; store.set('oddworld.crt.gain', v); this.apply(); },
  setTint(v: number) { this.tint = v; store.set('oddworld.crt.tint', v); this.apply(); },
};
