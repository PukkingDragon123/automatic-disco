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
    this.host.tip(s.level <= 0 ? `<b>SLOT ${i + 1}</b> · LOCKED<br>Upgrade it with the Upgrader to open it.` : t ? `<b>${t.name.toUpperCase()}</b> · SLOT ${i + 1} · LV ${s.level}<br>${t.desc}<br>${un ? `UNIT: <b>${un}</b>` : '<span class="r">NO UNIT CAN RUN IT: BUILD ONE</span>'}<br><span class="w">CLICK</span> TAKE CONTROL · <span class="w">RIGHT-CLICK</span> CONFIGURE` : `<b>SLOT ${i + 1}</b> · EMPTY<br>Right-click to assign a tool.`, e.clientX, e.clientY);
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
    // the ring: two passes of a wobbling circle
    for (const [r, sd, w] of [[RS, 3, 2], [RS + 2, 9, 1]] as [number, number, number][]) { const n = 140; for (let i = 0; i < n; i++) { const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU; if (w === 1 && i % 9 > 6) continue; stroke(p, cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, sd + i, { w, over: 0, amp: 0.3 }); } }
    // the hub: a paper disc with the tool's name
    for (let y = -22; y <= 22; y++) for (let x = -22; x <= 22; x++) if (x * x + y * y <= 22 * 22) p.set(cx + x, cy + y, y > 14 ? R.paper[4] : R.paper[5]);
    scribble(p, cx, cy, 22, 22, 5, INK);
    for (let i = 0; i < N; i++) {
      const s = c.slots.slots[i], am = -Math.PI / 2 + i * step, sx = Math.round(cx + Math.cos(am) * RS), sy = Math.round(cy + Math.sin(am) * RS);
      const lock = s.level <= 0, act = c.slots.active === i, hv = this.hover === i;
      for (let y = -16; y <= 16; y++) for (let x = -16; x <= 16; x++) if (x * x + y * y <= 16 * 16) p.set(sx + x, sy + y, lock ? R.paper[3] : hv ? R.straw[5] : y > 10 ? R.paper[4] : R.paper[5]);
      scribble(p, sx, sy, 16, 16, 20 + i, act ? R.stampRed[3] : INK);
      if (act) scribble(p, sx, sy, 19, 19, 40 + i, R.stampRed[3]);
      // number outside, pips inside the rim
      const nx = Math.round(cx + Math.cos(am) * (RS + 25)), ny = Math.round(cy + Math.sin(am) * (RS + 25));
      letter(p, String(i + 1), nx, ny - 7, lock ? R.paper[2] : INK, { align: 'center' });
      for (let k = 0; k < 3; k++) { const pa = am + (k - 1) * 0.16, px = Math.round(cx + Math.cos(pa) * (RS - 21)), py = Math.round(cy + Math.sin(pa) * (RS - 21)); p.rect(px - 1, py - 1, 3, 3, k < s.level ? R.stampRed[3] : R.paper[3]); }
      if (lock) { for (let y = 0; y < 8; y++) for (let x = 0; x < 11; x++) p.set(sx - 5 + x, sy - 2 + y, R.ochre[4]); stroke(p, sx - 5, sy - 2, sx + 5, sy - 2, i, { w: 1, over: 0 }); stroke(p, sx - 3, sy - 2, sx - 3, sy - 7, i + 1, { w: 1, over: 0 }); stroke(p, sx + 3, sy - 2, sx + 3, sy - 7, i + 2, { w: 1, over: 0 }); stroke(p, sx - 3, sy - 7, sx + 3, sy - 7, i + 3, { w: 1, over: 0 }); p.set(sx, sy + 2, INK); }
      if (s.level > 0 && !s.tool) letter(p, '+', sx, sy - 7, R.paper[2], { align: 'center' });
    }
    const show = this.hover >= 0 ? this.hover : c.slots.active, sl = show >= 0 ? c.slots.slots[show] : null;
    if (sl && sl.tool) { letter(p, TOOLS[sl.tool].name.toUpperCase().split(' ').pop()!.slice(0, 7), cx, cy - 11, INK, { align: 'center' }); letter(p, `LV ${sl.level}`, cx, cy + 1, c.slots.active === show ? R.stampRed[3] : R.ink[2], { align: 'center' }); }
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
