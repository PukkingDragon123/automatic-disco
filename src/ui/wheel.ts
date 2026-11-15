// The TOOL WHEEL: a geared revolver drum on a steel housing. Eight machined sockets on the drum each hold a tool run
// by a real unit (an arm, a drone or an emplacement; colony/tools.ts). Choosing a slot (click, [ ] or F) turns the
// drum: its toothed rim drives two side cogs, a piston pumps, and the slot snaps under the lens at the top on a sprung
// detent with a click. Click a socket to take control of its unit with its tool (the cannon puts you in the gunner's
// seat); right-click it (or CONFIGURE) to choose the slot's tool and unit and to upgrade it with the Upgrader. Upgrades
// show as hardware on the socket: a brass collar at level 2, a collar and four bolts at level 3; a closed slot is
// capped with a padlocked plate.
import type { Colony } from '../colony/colony';
import { TOOLS } from '../colony/tools';
import { iconCanvas, lowpixIcon } from './desk/hudArt';
import { Pix, R, fontText } from './desk/pxPanel';
import { sfx } from '../audio/audio';

const TAU = Math.PI * 2, N = 8, STEP = TAU / N;
export interface WheelHost { colony(): Colony | null; config(i: number): void; tip(html: string | null, x?: number, y?: number): void; flash(msg: string, bad?: boolean): void }

export class ToolWheel {
  readonly cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  hover = -1; focus = 0; private dirty = true; private t = 0; private acc = 0; private lastKey = '';
  /** the drum's angle and spin (a sprung detent): the chosen slot comes round under the lens */
  ang = 0; private vel = 0; private sel = 0; private piston = 0;
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
    if (d < 56 || d > 124) return -1;
    let a = Math.atan2(y, x) + Math.PI / 2 + Math.PI / N - this.ang; a = ((a % TAU) + TAU) % TAU;
    return Math.floor(a / STEP) % N;
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
    // the drum turns the chosen slot (the one in use, else the focus) to the top, overshoots and settles on its detent
    const want = c.slots.active >= 0 ? c.slots.active : this.focus;
    if (want !== this.sel) { this.sel = want; sfx('crack', 0.5, 0.3); }
    let goal = -want * STEP; while (goal - this.ang > Math.PI) goal -= TAU; while (goal - this.ang < -Math.PI) goal += TAU;
    const a0 = this.ang; this.vel += (180 * (goal - this.ang) - 16 * this.vel) * Math.min(dt, 0.05); this.ang += this.vel * Math.min(dt, 0.05);
    if (Math.abs(goal - this.ang) < 0.002 && Math.abs(this.vel) < 0.05) { if (this.vel !== 0) sfx('hit', 1.6, 0.25); this.ang = goal; this.vel = 0; }
    this.piston = Math.max(0, Math.min(1, this.piston * 0.9 + Math.abs(this.ang - a0) * 4));
    const moving = this.vel !== 0 || this.piston > 0.01;
    if (!this.dirty && this.acc > 0 && !moving) return;
    this.acc = moving ? 0 : c.slots.active >= 0 ? 0.12 : 0.5; this.dirty = false;
    this.draw(c);
  }
  /** the device in art pixels (160 x 160, shown 2x), lit from the upper left: the housing ring with bolts, two side
   *  cogs and a piston, the toothed drum with its sockets and their hardware, the lens bracket, the brass hub */
  private draw(c: Colony) {
    const S = 160, cv = this.cv, g = this.g, cx = 80, cy = 82, RS = 42, ang = this.ang;
    if (cv.width !== 320) { cv.width = 320; cv.height = 320; }
    const p = new Pix(S, S), lit = (nx: number, ny: number) => -(nx * 0.6 + ny * 0.8);
    const disc = (ox: number, oy: number, r0: number, r1: number, f: (d: number, l: number, a: number) => number | -1) => {
      for (let y = Math.floor(oy - r1 - 1); y <= oy + r1 + 1; y++) for (let x = Math.floor(ox - r1 - 1); x <= ox + r1 + 1; x++) {
        const dx = x - ox + 0.5, dy = y - oy + 0.5, d = Math.hypot(dx, dy); if (d > r1 || d < r0) continue;
        const col = f(d, lit(dx / (d || 1), dy / (d || 1)), Math.atan2(dy, dx)); if (col >= 0) p.set(x, y, col);
      }
    };
    const cog = (ox: number, oy: number, r: number, teeth: number, rot: number) => disc(ox, oy, 0, r + 3, (d, l, a) => {
      const tooth = Math.cos((a - rot) * teeth) > 0.1;
      if (d > r + 2.5) return tooth ? R.steel[0] : -1;
      if (d > r) return tooth ? R.steel[l > 0.2 ? 4 : 2] : -1;
      if (d > r - 1) return R.steel[0];
      if (d < 2.5) return d < 1.5 ? R.brass[2] : R.brass[l > 0 ? 5 : 3];
      const spoke = Math.abs(Math.sin((a - rot) * 2)) < 0.25;
      return spoke || d > r - 3 ? R.steel[l > 0.3 ? 5 : l > -0.3 ? 3 : 2] : R.ink[0];
    });
    // the side cogs, driven by the drum's teeth
    cog(cx + 55, cy - 52, 11, 8, -ang * (66 / 11));
    cog(cx - 58, cy + 50, 9, 7, -ang * (66 / 9));
    // the housing: a steel ring with four bolts
    disc(cx, cy, 70, 77, (d, l) => (d > 76 ? R.steel[0] : d < 71 ? R.ink[0] : R.steel[l > 0.4 ? 5 : l > 0 ? 4 : l > -0.4 ? 3 : 2]));
    for (const a of [0.8, 2.35, 3.9, 5.5]) { const bx = Math.round(cx + Math.cos(a) * 73.5), by = Math.round(cy + Math.sin(a) * 73.5); p.rect(bx - 1, by - 1, 3, 3, R.steel[1]); p.set(bx - 1, by - 1, R.steel[6] ?? R.steel[5]); }
    // the piston at the lower right: a barrel and a rod that pumps while the drum turns
    { const ext = 4 + this.piston * 6, a = 0.75, ux = Math.cos(a), uy = Math.sin(a);
      for (let k = 0; k < 16; k++) for (let w = -3; w <= 3; w++) { const x = Math.round(cx + ux * (96 - k) - uy * w), y = Math.round(cy + uy * (96 - k) + ux * w); p.set(x, y, Math.abs(w) === 3 ? R.steel[0] : w < 0 ? R.olive[4] : R.olive[2]); }
      for (let k = 0; k < ext + 4; k++) for (let w = -1; w <= 1; w++) { const x = Math.round(cx + ux * (80 - k) - uy * w), y = Math.round(cy + uy * (80 - k) + ux * w); p.set(x, y, w < 0 ? R.steel[6] ?? R.steel[5] : R.steel[4]); } }
    // the drum: a toothed rim, machined rings, the sockets
    disc(cx, cy, 0, 69, (d, l, a) => {
      if (d > 66) { const tooth = Math.cos((a - ang) * 48) > 0; return tooth ? (d > 68.2 ? R.steel[0] : R.steel[l > 0.2 ? 5 : 3]) : -1; }
      if (d > 65) return R.steel[0];
      if (Math.abs(d - 61) < 0.6 || Math.abs(d - 25) < 0.6) return R.steel[1];
      if (Math.abs(d - 60) < 0.6 || Math.abs(d - 24) < 0.6) return R.steel[5];
      return R.steel[l > 0.45 ? 4 : l > -0.45 ? 3 : 2];
    });
    for (let i = 0; i < N; i++) {
      const s = c.slots.slots[i], am = -Math.PI / 2 + i * STEP + ang, sx = Math.round(cx + Math.cos(am) * RS), sy = Math.round(cy + Math.sin(am) * RS);
      const lock = s.level <= 0, act = c.slots.active === i, hv = this.hover === i, E = act ? R.rust : R.bone, n = E.length;
      // the socket: a bored cup in the drum, enamel inside (orange enamel while in use)
      disc(sx, sy, 0, 15, (d, l) => d > 14 ? R.steel[0] : d > 12.5 ? R.steel[l > 0 ? 1 : 5] : d > 11.5 ? R.ink[1] : lock ? R.steel[l > 0.3 ? 4 : 3] : hv ? E[n - 1] : E[l > 0.3 ? n - 1 : n - 2]);
      if (s.level >= 2 && !lock) disc(sx, sy, 15, 17.2, (d, l) => (d > 16.6 ? R.brass[1] : R.brass[l > 0.3 ? 5 : l > -0.3 ? 4 : 2]));
      if (s.level >= 3) for (const k of [0.785, 2.356, 3.927, 5.498]) { const bx = Math.round(sx + Math.cos(k + ang) * 16), by = Math.round(sy + Math.sin(k + ang) * 16); p.rect(bx - 1, by - 1, 2, 2, R.steel[6] ?? R.steel[5]); p.set(bx, by, R.steel[1]); }
      if (lock) { p.rect(sx - 5, sy - 1, 11, 8, R.ochre[4]); p.hl(sx - 5, sx + 5, sy - 1, R.ochre[5]); p.hl(sx - 5, sx + 5, sy + 6, R.ochre[2]); p.line(sx - 3, sy - 1, sx - 3, sy - 5, R.steel[2]); p.line(sx + 3, sy - 1, sx + 3, sy - 5, R.steel[2]); p.line(sx - 3, sy - 6, sx + 3, sy - 6, R.steel[2]); p.rect(sx, sy + 1, 1, 3, R.ink[1]); }
      // the stamped number on the drum, outside the socket
      const nx = Math.round(cx + Math.cos(am) * 57), ny = Math.round(cy + Math.sin(am) * 57);
      fontText(p, String(i + 1), nx, ny - 6, lock ? R.steel[1] : R.ink[1], { align: 'center', shadow: R.steel[5] });
    }
    // the hub: a brass cap with a wrench struck in it, level pips of the chosen slot
    disc(cx, cy, 0, 21, (d, l) => (d > 20 ? R.brass[0] : d > 18 ? R.brass[l > 0.3 ? 5 : l > -0.3 ? 4 : 2] : R.brass[l > 0.4 ? 4 : 3]));
    { const W2 = [[-8, 8], [-7, 7], [-6, 6], [-5, 5], [-4, 4], [-3, 3], [-2, 2], [-1, 1], [0, 0], [1, -1], [2, -2]];
      for (const [x, y] of W2) { p.rect(cx + x - 1, cy + y - 1, 3, 3, R.brass[1]); p.set(cx + x - 1, cy + y - 1, R.brass[5]); }
      disc(cx + 5, cy - 5, 0, 5, (d, l, a) => (d > 4 ? R.brass[1] : Math.abs(a + 2.36) < 0.5 && d > 1.5 ? R.brass[3] : R.brass[l > 0 ? 2 : 1])); }
    const show = this.hover >= 0 ? this.hover : c.slots.active >= 0 ? c.slots.active : this.focus, sl = c.slots.slots[show];
    if (sl) for (let k = 0; k < 3; k++) { p.rect(cx - 7 + k * 6, cy + 12, 4, 4, R.brass[0]); p.rect(cx - 7 + k * 6, cy + 12, 3, 3, k < sl.level ? R.rust[5] : R.brass[2]); }
    // the lens on its bracket at the top: amber when a tool is in use
    { const on = c.slots.active >= 0; p.rect(cx - 7, 0, 15, 9, R.steel[1]); p.rect(cx - 6, 1, 13, 7, R.steel[4]); p.hl(cx - 6, cx + 6, 1, R.steel[5]);
      disc(cx, 10, 0, 6, (d, l) => (d > 5 ? R.steel[0] : on ? (l > 0.4 ? R.glowAmber[4] : R.glowAmber[3]) : (l > 0.4 ? R.sky[4] : R.sky[2])));
      p.set(cx - 2, 8, R.snow[5]); p.set(cx - 1, 7, R.snow[5]);
      p.set(cx, 17, R.rust[4]); p.hl(cx - 1, cx + 1, 16, R.rust[4]); }
    const tmp = (this as unknown as { tmp?: HTMLCanvasElement }).tmp ?? document.createElement('canvas'); (this as unknown as { tmp: HTMLCanvasElement }).tmp = tmp;
    tmp.width = S; tmp.height = S; tmp.getContext('2d')!.putImageData(p.image(), 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 320, 320); g.drawImage(tmp, 0, 0, 320, 320);
    // the tools in their sockets, at full resolution
    for (let i = 0; i < N; i++) {
      const s = c.slots.slots[i]; if (s.level <= 0 || !s.tool) continue;
      const am = -Math.PI / 2 + i * STEP + ang, ix = Math.round((cx + Math.cos(am) * RS) * 2), iy = Math.round((cy + Math.sin(am) * RS) * 2);
      const dim = !c.slots.unitOf(i), lp = lowpixIcon(TOOLS[s.tool].icon);
      g.globalAlpha = dim ? 0.4 : 1;
      if (lp && lp.complete && lp.naturalWidth) g.drawImage(lp, Math.round(ix - lp.naturalWidth / 2), Math.round(iy - lp.naturalHeight / 2));
      else { const ic = iconCanvas(TOOLS[s.tool].icon, 44, dim); if (ic) g.drawImage(ic, ix - 22, iy - 22, 44, 44); }
      g.globalAlpha = 1;
    }
  }
}
