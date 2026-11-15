// The TOOL WHEEL: a machined dial of eight sockets, each a slot holding a tool run by a real unit (an arm, a drone or
// an emplacement; colony/tools.ts). Click a socket to take control of that unit with its tool (the cannon puts you in
// the gunner's seat); right-click it (or CONFIG) to choose the slot's tool and unit and to upgrade the slot with the
// Upgrader. Each socket shows the tool's painted icon, its number, level pips, a lock when the slot is closed, a red
// NO UNIT when nothing can run it, and a phosphor ring while it is in use. The hub's CRT names what is under the
// pointer. [ and ] step the hover, F (or Enter) uses it.
import type { Colony } from '../colony/colony';
import { TOOLS } from '../colony/tools';
import { iconCanvas, lowpixIcon } from './desk/hudArt';
import { Pix, R } from './desk/pxPanel';
import { stroke, scribble, letter, INK } from './desk/ink';
import { sfx } from '../audio/audio';

const TAU = Math.PI * 2, N = 8;
export interface WheelHost { colony(): Colony | null; config(i: number): void; tip(html: string | null, x?: number, y?: number): void; flash(msg: string, bad?: boolean): void }

export class ToolWheel {
  readonly cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  hover = -1; focus = 0; private dirty = true; private t = 0; private acc = 0; private lastKey = '';
  constructor(parent: HTMLElement, readonly host: WheelHost) {
    this.cv = document.createElement('canvas'); this.cv.className = 'dial'; parent.appendChild(this.cv);
    this.g = this.cv.getContext('2d')!;
    this.cv.addEventListener('pointermove', (e) => this.move(e));
    this.cv.addEventListener('pointerleave', () => { this.hover = -1; this.dirty = true; this.host.tip(null); });
    this.cv.addEventListener('pointerdown', (e) => { e.stopPropagation(); const i = this.slotAt(e); if (i < 0) return; if (e.button === 2) { this.host.config(i); sfx('open', 1.4, 0.4); } else this.use(i); });
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  private slotAt(e: PointerEvent | MouseEvent) {
    const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2, d = Math.hypot(x, y) * (320 / r.width);
    if (d < 70 || d > 148) return -1;
    let a = Math.atan2(y, x) + Math.PI / 2 + Math.PI / N; a = ((a % TAU) + TAU) % TAU;
    return Math.floor(a / (TAU / N)) % N;
  }
  private move(e: PointerEvent) {
    const i = this.slotAt(e);
    if (i !== this.hover) { this.hover = i; this.dirty = true; if (i >= 0) sfx('hover', 1, 0.3); }
    const c = this.host.colony(); if (!c || i < 0) { this.host.tip(null); return; }
    const s = c.slots.slots[i], t = s.tool ? TOOLS[s.tool] : null, u = c.slots.unitOf(i), un = u ? (c.unitById(u) as { name?: string } | null)?.name ?? u : null;
    this.host.tip(s.level <= 0 ? `<b>SLOT ${i + 1}</b> LOCKED` : t ? `<b>${t.name.toUpperCase()}</b> LV ${s.level}<br>${un ? un : '<span class="r">NO UNIT</span>'}` : `<b>SLOT ${i + 1}</b> EMPTY`, e.clientX, e.clientY);
  }
  use(i: number) {
    const c = this.host.colony(); if (!c) return;
    const why = c.useSlot(i);
    if (why) { sfx('deny', 1, 0.6); this.host.flash(why, true); } else { sfx('click', 0.9, 0.7); sfx('hit', 0.5, 0.3); }
    this.dirty = true;
  }
  key(k: string) {
    if (k === '[' || k === ']') { this.focus = (this.focus + (k === ']' ? 1 : -1) + N) % N; this.hover = this.focus; this.dirty = true; sfx('hover', 1.2, 0.4); return true; }
    if (k === 'f') { this.use(this.hover >= 0 ? this.hover : this.focus); return true; }
    return false;
  }
  update(dt: number) {
    this.t += dt; this.acc -= dt;
    const c = this.host.colony(); if (!c) return;
    const key = c.slots.slots.map((s) => `${s.tool}${s.level}${s.unit}`).join() + c.slots.active + c.arms.length + c.drones.length + c.structures.length + this.hover + (c.ctl.k);
    if (key !== this.lastKey) { this.lastKey = key; this.dirty = true; }
    if (!this.dirty && this.acc > 0) return;
    this.acc = c.slots.active >= 0 ? 0.06 : 0.5; this.dirty = false;
    this.draw(c);
  }
  /** the ring, hand-drawn (art 160 x 160 at 2x): a paper disc for each slot circled in ink, a sketched ring through
   *  them, the slot numbers lettered outside, level pips as ink dots, a red scribble round the slot in use, a doodled
   *  padlock on a closed slot; the tool renders (lowpix) sit on the discs at full resolution */
  private draw(c: Colony) {
    const S = 160, cv = this.cv, g = this.g, cx = 80, cy = 80, step = TAU / N, RS = 54;
    if (cv.width !== 320) { cv.width = 320; cv.height = 320; }
    const p = new Pix(S, S);
    // the ring: a machined steel band, lit on its upper-left slope, knurled, with orange index marks
    const lit = (nx: number, ny: number) => -(nx * 0.6 + ny * 0.8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5, d = Math.hypot(dx, dy); if (d < RS - 5 || d > RS + 5) continue;
      if (d > RS + 4 || d < RS - 4) { p.set(x, y, R.steel[0]); continue; }
      const l = lit(dx / d, dy / d) * (d > RS ? 1 : -1); let k = l > 0.5 ? 5 : l > 0.1 ? 4 : l > -0.3 ? 3 : 2;
      const a = Math.atan2(dy, dx); if (Math.floor(((a + Math.PI) / TAU) * 160) % 2 === 0 && Math.abs(d - RS) < 2) k = Math.max(1, k - 1);
      p.set(x, y, R.steel[k]);
    }
    // the hub: a cream enamel dial with a steel bezel
    for (let y = -24; y <= 24; y++) for (let x = -24; x <= 24; x++) { const d = Math.hypot(x + 0.5, y + 0.5); if (d > 24) continue; const l = lit((x + 0.5) / (d || 1), (y + 0.5) / (d || 1)); p.set(cx + x, cy + y, d > 23 ? R.steel[0] : d > 20.5 ? R.steel[l > 0.3 ? 5 : l > -0.3 ? 3 : 2] : d > 19.5 ? R.steel[1] : y < -12 ? R.bone[5] : R.bone[4]); }
    for (let i = 0; i < N; i++) {
      const s = c.slots.slots[i], am = -Math.PI / 2 + i * step, sx = Math.round(cx + Math.cos(am) * RS), sy = Math.round(cy + Math.sin(am) * RS);
      const lock = s.level <= 0, act = c.slots.active === i, hv = this.hover === i;
      // a socket: an enamel cup in a steel rim (orange enamel when in use), chipped on one edge
      for (let y = -17; y <= 17; y++) for (let x = -17; x <= 17; x++) {
        const d = Math.hypot(x + 0.5, y + 0.5); if (d > 17) continue; const l = lit((x + 0.5) / (d || 1), (y + 0.5) / (d || 1));
        const E = act ? R.rust : lock ? R.basalt : R.bone, n = E.length;
        p.set(sx + x, sy + y, d > 16 ? R.steel[0] : d > 14 ? R.steel[l > 0.3 ? 5 : l > -0.3 ? 3 : 2] : d > 13 ? (l > 0 ? R.ink[1] : E[Math.max(0, n - 3)]) : hv ? E[n - 1] : y < -6 ? E[n - 1] : E[Math.max(0, n - 2)]);
      }
      p.set(sx + 9, sy + 10, R.steel[4]); p.set(sx + 10, sy + 9, R.steel[4]); p.set(sx + 10, sy + 10, R.steel[2]);
      // number outside, pips inside the rim
      const nx = Math.round(cx + Math.cos(am) * (RS + 25)), ny = Math.round(cy + Math.sin(am) * (RS + 25));
      letter(p, String(i + 1), nx, ny - 7, lock ? R.steel[3] : R.paper[5], { align: 'center', shadow: R.ink[0] });
      for (let k = 0; k < 3; k++) { const pa = am + (k - 1) * 0.16, px = Math.round(cx + Math.cos(pa) * (RS - 21)), py = Math.round(cy + Math.sin(pa) * (RS - 21)); p.rect(px - 1, py - 1, 3, 3, R.ink[0]); p.rect(px - 1, py - 1, 2, 2, k < s.level ? R.rust[5] : R.steel[2]); }
      if (lock) { p.rect(sx - 5, sy - 2, 11, 8, R.ochre[4]); p.hl(sx - 5, sx + 5, sy - 2, R.ochre[5]); p.hl(sx - 5, sx + 5, sy + 5, R.ochre[2]); for (const [x0, y0, x1, y1] of [[-3, -2, -3, -6], [3, -2, 3, -6], [-3, -7, 3, -7]]) p.line(sx + x0, sy + y0, sx + x1, sy + y1, R.steel[3]); p.set(sx, sy + 1, R.ink[1]); p.set(sx, sy + 2, R.ink[1]); }
      if (s.level > 0 && !s.tool) letter(p, '+', sx, sy - 7, R.bone[2], { align: 'center' });
    }
    const show = this.hover >= 0 ? this.hover : c.slots.active, sl = show >= 0 ? c.slots.slots[show] : null;
    if (sl && sl.tool) { letter(p, TOOLS[sl.tool].name.toUpperCase().split(' ').pop()!.slice(0, 7), cx, cy - 11, INK, { align: 'center' }); letter(p, `LV ${sl.level}`, cx, cy + 1, c.slots.active === show ? R.rust[3] : R.ink[2], { align: 'center' }); }
    else if (sl && sl.level <= 0) letter(p, 'LOCKED', cx, cy - 6, R.ochre[2], { align: 'center' });
    else { letter(p, 'TOOLS', cx, cy - 11, INK, { align: 'center' }); letter(p, 'PICK', cx, cy + 1, R.ink[2], { align: 'center' }); }
    const tmp = (this as unknown as { tmp?: HTMLCanvasElement }).tmp ?? document.createElement('canvas'); (this as unknown as { tmp: HTMLCanvasElement }).tmp = tmp;
    tmp.width = S; tmp.height = S; tmp.getContext('2d')!.putImageData(p.image(), 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 320, 320); g.drawImage(tmp, 0, 0, 320, 320);
    for (let i = 0; i < N; i++) {
      const s = c.slots.slots[i]; if (s.level <= 0 || !s.tool) continue;
      const am = -Math.PI / 2 + i * step, ix = Math.round(160 + Math.cos(am) * RS * 2), iy = Math.round(160 + Math.sin(am) * RS * 2);
      const dim = !c.slots.unitOf(i), lp = lowpixIcon(TOOLS[s.tool].icon);
      g.globalAlpha = dim ? 0.4 : 1;
      if (lp && lp.complete && lp.naturalWidth) g.drawImage(lp, Math.round(ix - lp.naturalWidth / 2), Math.round(iy - lp.naturalHeight / 2));
      else { const ic = iconCanvas(TOOLS[s.tool].icon, 44, dim); if (ic) g.drawImage(ic, ix - 22, iy - 22, 44, 44); }
      g.globalAlpha = 1;
    }
  }
}
