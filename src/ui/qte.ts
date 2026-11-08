// Skill QTEs. Each draws itself as pixel art on a small canvas near the action and resolves with a grade:
// 0 miss, 1 good, 2 perfect. While one runs the world slows down.
import { el, ui, S } from './kit';
import { sfx } from '../audio/audio';
import { PAL } from './icons';

export type Grade = 0 | 1 | 2;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

abstract class Qte {
  readonly cv: HTMLCanvasElement; readonly g: CanvasRenderingContext2D;
  protected t = 0; done = false; label: HTMLDivElement;
  resolve!: (g: Grade) => void;
  readonly p: Promise<Grade>;
  private raf = 0; private last = performance.now();
  constructor(w: number, h: number, x: number, y: number, text: string) {
    this.cv = el('canvas', 'qte', ui());
    this.cv.width = w; this.cv.height = h;
    this.cv.style.cssText = `position:fixed;left:${x - (w * S) / 2}px;top:${y - (h * S) / 2}px;width:${w * S}px;height:${h * S}px;image-rendering:pixelated;z-index:30;pointer-events:none`;
    this.g = this.cv.getContext('2d')!;
    this.label = el('div', 'qte-label hdr', ui(), text);
    this.label.style.cssText = `position:fixed;left:${x}px;top:${y + (h * S) / 2 + 4}px;transform:translateX(-50%);font-size:${10 * S}px;z-index:30;pointer-events:none;text-shadow:0 2px 0 #000`;
    this.p = new Promise((r) => (this.resolve = r));
    const loop = (now: number) => {
      if (this.done) return;
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.t += dt; this.step(dt); this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  abstract step(dt: number): void;
  abstract draw(): void;
  finish(g: Grade) {
    if (this.done) return;
    this.done = true; cancelAnimationFrame(this.raf);
    sfx(g ? 'qte-good' : 'qte-bad');
    this.label.textContent = g === 2 ? 'PERFECT' : g === 1 ? 'GOOD' : 'MISS';
    this.label.style.color = g === 2 ? '#ffe070' : g === 1 ? '#7affe0' : '#ff7a5a';
    this.cv.style.transition = 'opacity 300ms'; this.cv.style.opacity = '0';
    setTimeout(() => { this.cv.remove(); this.label.remove(); }, 420);
    this.resolve(g);
  }
  protected px(x: number, y: number, c: number, w = 1, h = 1) { this.g.fillStyle = hex(c); this.g.fillRect(Math.round(x), Math.round(y), w, h); }
  protected ring(cx: number, cy: number, r: number, c: number, th = 1) {
    for (let a = 0; a < 360; a += Math.max(1, 90 / Math.max(1, r))) { const t = (a * Math.PI) / 180; for (let k = 0; k < th; k++) this.px(cx + Math.cos(t) * (r - k), cy + Math.sin(t) * (r - k), c); }
  }
}

/** a ring closes on the target circle: strike when they meet */
class RingQte extends Qte {
  private r0 = 30; private speed: number; private hit = 9;
  constructor(x: number, y: number, speed: number, text: string) { super(72, 72, x, y, text); this.speed = speed; }
  get r() { return this.r0 - this.t * this.speed; }
  press() {
    const d = Math.abs(this.r - this.hit);
    this.finish(d < 1.6 ? 2 : d < 4.5 ? 1 : 0);
  }
  step() { if (this.r < 2) this.finish(0); }
  draw() {
    const g = this.g; g.clearRect(0, 0, 72, 72);
    const c = 36;
    this.ring(c, c, this.hit + 4, 0x163a32, 1); this.ring(c, c, this.hit - 4, 0x163a32, 1);
    this.ring(c, c, this.hit + 1, PAL.g, 2);
    const near = Math.abs(this.r - this.hit) < 4.5;
    this.ring(c, c, Math.max(1, this.r), near ? PAL.y : PAL.b, 2);
    this.ring(c, c, Math.max(1, this.r) + 2, PAL.k, 1);
    // tick marks
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + this.t; this.px(c + Math.cos(a) * (this.r + 4), c + Math.sin(a) * (this.r + 4), PAL.g, 2, 2); }
  }
}

/** a gauge swells and ebbs: release inside the bright band */
class ChargeQte extends Qte {
  private v = 0; private dir = 1; private zone: [number, number];
  constructor(x: number, y: number, text: string) { super(20, 64, x, y, text); this.zone = [0.72, 0.86]; }
  get value() { return this.v; }
  step(dt: number) {
    this.v += this.dir * dt * 1.15;
    if (this.v >= 1) { this.v = 1; this.dir = -1; } else if (this.v <= 0 && this.dir < 0) { this.finish(0); }
  }
  release() { const v = this.v; this.finish(v >= this.zone[0] && v <= this.zone[1] ? 2 : v > 0.45 ? 1 : 0); }
  draw() {
    const g = this.g; g.clearRect(0, 0, 20, 64);
    this.px(4, 2, PAL.k, 12, 60);
    this.px(5, 3, 0x14202a, 10, 58);
    const z0 = 3 + 58 * (1 - this.zone[1]), z1 = 3 + 58 * (1 - this.zone[0]);
    this.px(5, z0, 0x3a2a7a, 10, z1 - z0);
    const h = Math.round(58 * this.v);
    for (let y = 0; y < h; y++) this.px(6, 61 - y, y % 3 === 0 ? PAL.V : PAL.v, 8, 1);
    this.px(2, z0, PAL.y, 2, 1); this.px(16, z0, PAL.y, 2, 1); this.px(2, z1, PAL.y, 2, 1); this.px(16, z1, PAL.y, 2, 1);
  }
}

/** hammer a key to hold on: fill before the timer drains */
class MashQte extends Qte {
  private v = 0.35; private dur: number; private need: number;
  constructor(x: number, y: number, dur: number, resist: number, text: string) { super(64, 18, x, y, text); this.dur = dur; this.need = resist; }
  press() { this.v = Math.min(1, this.v + 0.11 / this.need); sfx('qte-tick'); if (this.v >= 1) this.finish(this.t < this.dur * 0.6 ? 2 : 1); }
  step(dt: number) { this.v -= dt * 0.22 * this.need; if (this.v <= 0 || this.t > this.dur) this.finish(this.v > 0.6 ? 1 : 0); }
  draw() {
    const g = this.g; g.clearRect(0, 0, 64, 18);
    this.px(1, 4, PAL.k, 62, 10); this.px(2, 5, 0x14202a, 60, 8);
    const w = Math.round(60 * this.v);
    for (let x = 0; x < w; x++) this.px(2 + x, 5, x % 4 === 3 ? PAL.n : PAL.G, 1, 8);
    const tw = Math.round(60 * Math.max(0, 1 - this.t / this.dur));
    this.px(2, 15, PAL.y, tw, 1);
    if (Math.floor(this.t * 6) % 2) this.px(28, 0, PAL.w, 8, 3);
  }
}

let active: Qte | null = null;
export const qteActive = () => active !== null;
function bind(q: Qte, onPress: (q: any) => void, onRelease?: (q: any) => void) {
  active = q;
  const auto = (window as any).__qteAuto;
  if (auto !== undefined) setTimeout(() => q.finish(auto as Grade), 60);
  const kd = (e: KeyboardEvent) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onPress(q); } };
  const pd = (e: PointerEvent) => { e.stopPropagation(); e.preventDefault(); if (e.button === 0) onPress(q); };
  const pu = (e: PointerEvent) => { if (e.button === 0) onRelease?.(q); };
  const ku = (e: KeyboardEvent) => { if (e.key === ' ') onRelease?.(q); };
  addEventListener('keydown', kd, true); addEventListener('pointerdown', pd, true); addEventListener('pointerup', pu, true); addEventListener('keyup', ku, true);
  q.p.then(() => { active = null; removeEventListener('keydown', kd, true); removeEventListener('pointerdown', pd, true); removeEventListener('pointerup', pu, true); removeEventListener('keyup', ku, true); });
  return q.p;
}
export const QTE = {
  ring(x: number, y: number, speed = 26, text = 'STRIKE!'): Promise<Grade> { return bind(new RingQte(x, y, speed, text), (q: RingQte) => q.press()); },
  charge(x: number, y: number, text = 'STRIKE AT THE PEAK'): Promise<Grade> {
    return bind(new ChargeQte(x, y, text), (qq: ChargeQte) => { if (qq.value > 0.05) qq.release(); });
  },
  mash(x: number, y: number, dur = 3, resist = 1, text = 'HOLD ON! [SPACE]'): Promise<Grade> { return bind(new MashQte(x, y, dur, resist, text), (q: MashQte) => q.press()); },
};
