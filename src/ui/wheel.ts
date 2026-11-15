// The TOOL WHEEL: a machined dial of eight sockets, each a slot holding a tool run by a real unit (an arm, a drone or
// an emplacement; colony/tools.ts). Click a socket to take control of that unit with its tool (the cannon puts you in
// the gunner's seat); right-click it (or CONFIG) to choose the slot's tool and unit and to upgrade the slot with the
// Upgrader. Each socket shows the tool's painted icon, its number, level pips, a lock when the slot is closed, a red
// NO UNIT when nothing can run it, and a phosphor ring while it is in use. The hub's CRT names what is under the
// pointer. [ and ] step the hover, F (or Enter) uses it.
import type { Colony } from '../colony/colony';
import { TOOLS } from '../colony/tools';
import { iconCanvas, lowpixIcon } from './desk/hudArt';
import { Pix, R, fontText } from './desk/pxPanel';
import { sfx } from '../audio/audio';

const TAU = Math.PI * 2, N = 8, R0 = 60, R1 = 140;
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
    const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2, d = Math.hypot(x, y) * (304 / r.width);
    if (d < R0 - 4 || d > R1 + 6) return -1;
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
  private base: Pix | null = null; private baseKey = '';
  /** the dial in art pixels (152 x 152 at K = 2): a knurled steel bezel lit from the upper left, eight recessed sockets
   *  between raised ribs, brass index notches, a brass hub ring and the hub's phosphor glass */
  private paintBase(c: Colony, hover: number): Pix {
    const S = 152, p = new Pix(S, S), cx = 75.5, cy = 75.5, step = TAU / N;
    const st = c.slots.slots.map((s) => (s.level <= 0 ? 'L' : s.tool ? 'T' : 'E')).join('') + c.slots.active + '|' + hover;
    if (this.base && this.baseKey === st) return this.base;
    const lit = (nx: number, ny: number) => -(nx * 0.6 + ny * 0.8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy); if (d > 75.2) continue;
      const nx = dx / (d || 1), ny = dy / (d || 1);
      let a = Math.atan2(dy, dx) + Math.PI / 2 + step / 2; a = ((a % TAU) + TAU) % TAU;
      const si = Math.floor(a / step) % N, af = a - si * step, edgeA = Math.min(af, step - af) * d;
      if (d > 74.2) { p.set(x, y, R.steel[0]); continue; }
      if (d > 66) {
        // the bezel: a rounded steel ring (lit outer slope above-left, lit inner slope below-right), knurled
        const outer = d > 70, l = outer ? lit(nx, ny) : -lit(nx, ny);
        let k = l > 0.55 ? 5 : l > 0.15 ? 4 : l > -0.3 ? 3 : 2;
        if (d > 69 && d < 73 && Math.floor((a / TAU) * 180) % 2 === 0) k = Math.max(1, k - 1);
        if (Math.abs(af - step / 2) * d < 1.2 && d > 68 && d < 73) { p.set(x, y, R.brass[af > step / 2 ? 2 : 5]); continue; }
        p.set(x, y, R.steel[k]); continue;
      }
      if (d > 65) { p.set(x, y, R.ink[0]); continue; }
      if (d > 31) {
        const s = c.slots.slots[si], lock = s.level <= 0, act = c.slots.active === si, hv = hover === si;
        if (edgeA < 1.6) { // the rib between sockets: raised, lit on its upper-left face
          const ra = si * step - step / 2 - Math.PI / 2, rx = -Math.sin(ra), ry = Math.cos(ra);
          const side = (dx * rx + dy * ry) > 0 ? 1 : -1; p.set(x, y, edgeA < 0.6 ? R.steel[1] : lit(rx * side, ry * side) > 0 ? R.steel[4] : R.steel[2]); continue;
        }
        // the recess: shadowed on the lip nearest the light, lit on the far lip; the floor flat
        const nearOuter = 65 - d < 1.5, nearInner = d - 31 < 1.5, nearSide = edgeA < 2.6;
        let col = lock ? R.ink[1] : hv ? R.olive[2] : act ? R.malachite[0] : R.olive[1];
        if (lock && ((x + y) >> 2) % 2 === 0) col = R.ochre[1];
        if (nearOuter) col = lit(nx, ny) > 0 ? R.ink[0] : R.olive[3];
        else if (nearInner) col = lit(-nx, -ny) > 0 ? R.ink[0] : R.olive[3];
        else if (nearSide) col = R.olive[0];
        if (act && (nearOuter || nearInner || (edgeA < 2.6 && edgeA >= 1.6))) col = R.malachite[5];
        p.set(x, y, col); continue;
      }
      if (d > 30) { p.set(x, y, R.ink[0]); continue; }
      if (d > 26.5) { const l = lit(nx, ny); p.set(x, y, R.brass[l > 0.5 ? 5 : l > 0 ? 4 : l > -0.5 ? 3 : 2]); continue; }
      if (d > 25.5) { p.set(x, y, R.ink[0]); continue; }
      // the hub glass: scanlines, darker rim, a glare
      const g2 = d > 23 ? R.ink[0] : y % 2 ? R.ink[0] : R.malachite[0];
      p.set(x, y, g2);
      const u = dx + dy; if (d < 22 && u > -22 && u < -20) p.set(x, y, R.malachite[1]);
    }
    this.base = p; this.baseKey = st;
    return p;
  }
  private draw(c: Colony) {
    const S = 152, cv = this.cv, g = this.g;
    if (cv.width !== 304) { cv.width = 304; cv.height = 304; }
    const p = new Pix(S, S); p.d.set(this.paintBase(c, this.hover).d);
    const step = TAU / N, cx = 75.5, cy = 75.5;
    // numbers, pips, NO UNIT in the house face
    for (let i = 0; i < N; i++) {
      const s = c.slots.slots[i], am = -Math.PI / 2 + i * step, a0 = am - step / 2 + 0.16;
      fontText(p, String(i + 1), Math.round(cx + Math.cos(a0) * 58), Math.round(cy + Math.sin(a0) * 58) - 6, s.level <= 0 ? R.ochre[2] : R.paper[4], { shadow: R.ink[0], align: 'center' });
      for (let k = 0; k < 3; k++) { const pa = am - 0.2 + k * 0.2, px = Math.round(cx + Math.cos(pa) * 36), py = Math.round(cy + Math.sin(pa) * 36); p.rect(px - 1, py - 1, 3, 3, R.ink[0]); p.rect(px - 1, py - 1, 2, 2, k < s.level ? R.ochre[5] : R.ochre[1]); }
      if (s.level > 0 && s.tool && !c.slots.unitOf(i)) fontText(p, 'NO UNIT', Math.round(cx + Math.cos(am) * 48), Math.round(cy + Math.sin(am) * 48) + 7, R.coral[5], { shadow: R.ink[0], align: 'center' });
      if (s.level > 0 && !s.tool) fontText(p, 'EMPTY', Math.round(cx + Math.cos(am) * 48), Math.round(cy + Math.sin(am) * 48) - 5, R.olive[3], { align: 'center' });
    }
    // the hub's readout
    const show = this.hover >= 0 ? this.hover : c.slots.active, sl = show >= 0 ? c.slots.slots[show] : null;
    const G = R.malachite;
    if (sl && sl.tool) {
      const nm = TOOLS[sl.tool].name.toUpperCase().split(' ').pop()!.slice(0, 7);
      fontText(p, nm, 76, 61, G[5], { glow: G[1], align: 'center' });
      fontText(p, `LV ${sl.level}`, 76, 73, c.slots.active === show ? R.ochre[5] : G[4], { glow: G[1], align: 'center' });
    } else if (sl && sl.level <= 0) fontText(p, 'LOCKED', 76, 67, R.ochre[5], { glow: R.ochre[1], align: 'center' });
    else { fontText(p, 'TOOLS', 76, 61, G[5], { glow: G[1], align: 'center' }); fontText(p, 'PICK', 76, 73, G[3], { align: 'center' }); }
    // upscale the art 2x, then the tool vignettes at full resolution on top
    const tmp = (this as unknown as { tmp?: HTMLCanvasElement }).tmp ?? document.createElement('canvas'); (this as unknown as { tmp: HTMLCanvasElement }).tmp = tmp;
    tmp.width = S; tmp.height = S; tmp.getContext('2d')!.putImageData(p.image(), 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 304, 304); g.drawImage(tmp, 0, 0, 304, 304);
    for (let i = 0; i < N; i++) {
      const s = c.slots.slots[i], am = -Math.PI / 2 + i * step, ix = Math.round(152 + Math.cos(am) * 98), iy = Math.round(152 + Math.sin(am) * 98);
      const name = s.level <= 0 ? 'v-lock' : s.tool ? TOOLS[s.tool].icon : null; if (!name) continue;
      const dim = s.level > 0 && !c.slots.unitOf(i), lp = s.level > 0 ? lowpixIcon(name) : null;
      if (lp && lp.complete && lp.naturalWidth) { g.globalAlpha = dim ? 0.45 : 1; g.drawImage(lp, Math.round(ix - lp.naturalWidth / 2), Math.round(iy - lp.naturalHeight / 2 - (dim ? 6 : 0))); g.globalAlpha = 1; continue; }
      const sz = s.level <= 0 ? 36 : 52, ic = iconCanvas(name, sz, dim);
      if (ic) g.drawImage(ic, ix - sz / 2, iy - sz / 2 - (s.tool && dim ? 6 : 0), sz, sz);
    }
  }
}
