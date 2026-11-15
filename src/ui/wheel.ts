// The TOOL WHEEL: a machined dial of eight sockets, each a slot holding a tool run by a real unit (an arm, a drone or
// an emplacement; colony/tools.ts). Click a socket to take control of that unit with its tool (the cannon puts you in
// the gunner's seat); right-click it (or CONFIG) to choose the slot's tool and unit and to upgrade the slot with the
// Upgrader. Each socket shows the tool's painted icon, its number, level pips, a lock when the slot is closed, a red
// NO UNIT when nothing can run it, and a phosphor ring while it is in use. The hub's CRT names what is under the
// pointer. [ and ] step the hover, F (or Enter) uses it.
import type { Colony } from '../colony/colony';
import { TOOLS } from '../colony/tools';
import { iconCanvas } from './desk/hudArt';
import { sfx } from '../audio/audio';

const TAU = Math.PI * 2, N = 8, R0 = 60, R1 = 140, RH = 54;
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
  private draw(c: Colony) {
    const dpr = Math.min(2, Math.max(1, Math.round(devicePixelRatio || 1))), S = 304, cv = this.cv, g = this.g;
    if (cv.width !== S * dpr) { cv.width = S * dpr; cv.height = S * dpr; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S); g.imageSmoothingEnabled = false;
    const cx = S / 2, cy = S / 2;
    // the bezel: machined steel ring, knurled, eight index notches
    g.beginPath(); g.arc(cx, cy, 151, 0, TAU); g.fillStyle = '#2a2d2f'; g.fill();
    g.beginPath(); g.arc(cx, cy, 148, 0, TAU); g.fillStyle = '#6d7174'; g.fill();
    g.beginPath(); g.arc(cx, cy, 146, Math.PI * 0.75, Math.PI * 1.75); g.strokeStyle = 'rgba(230,232,225,0.35)'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(cx, cy, 146, Math.PI * 1.75, Math.PI * 2.75); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.stroke();
    for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU; g.strokeStyle = i % 15 === 7 ? '#d9a43a' : 'rgba(30,32,34,0.6)'; g.lineWidth = i % 15 === 7 ? 3 : 1; g.beginPath(); g.moveTo(cx + Math.cos(a) * 143, cy + Math.sin(a) * 143); g.lineTo(cx + Math.cos(a) * 148, cy + Math.sin(a) * 148); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, R1 + 2, 0, TAU); g.fillStyle = '#161916'; g.fill();
    // the sockets
    const step = TAU / N;
    for (let i = 0; i < N; i++) {
      const s = c.slots.slots[i], a0 = -Math.PI / 2 - step / 2 + i * step + 0.035, a1 = a0 + step - 0.07;
      const active = c.slots.active === i, hov = this.hover === i, lock = s.level <= 0;
      const u = s.tool ? c.slots.unitOf(i) : null;
      g.beginPath(); g.arc(cx, cy, R1 - 2, a0, a1); g.arc(cx, cy, R0 + 2, a1, a0, true); g.closePath();
      g.fillStyle = lock ? '#1b1c19' : hov ? '#2a3326' : active ? '#1f2d22' : '#202320'; g.fill();
      // the socket's inner lip: lit on the far side from the light, shadowed near it
      g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.stroke();
      g.beginPath(); g.arc(cx, cy, R1 - 4, a0 + 0.02, a1 - 0.02); g.strokeStyle = 'rgba(200,205,190,0.10)'; g.lineWidth = 1; g.stroke();
      if (lock) { g.save(); g.beginPath(); g.arc(cx, cy, R1 - 2, a0, a1); g.arc(cx, cy, R0 + 2, a1, a0, true); g.closePath(); g.clip(); g.strokeStyle = 'rgba(217,164,58,0.16)'; g.lineWidth = 3; for (let k = -320; k < 320; k += 12) { g.beginPath(); g.moveTo(cx + k, cy - 160); g.lineTo(cx + k + 160, cy + 160); g.stroke(); } g.restore(); }
      if (active) { g.beginPath(); g.arc(cx, cy, R1 - 3, a0 + 0.01, a1 - 0.01); g.arc(cx, cy, R0 + 3, a1 - 0.01, a0 + 0.01, true); g.closePath(); g.strokeStyle = `rgba(143,224,154,${0.65 + 0.35 * Math.sin(this.t * 6)})`; g.lineWidth = 3; g.shadowColor = 'rgba(127,212,138,0.8)'; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0; }
      const am = (a0 + a1) / 2, ix = cx + Math.cos(am) * 100, iy = cy + Math.sin(am) * 100;
      if (lock) { const ic = iconCanvas('v-lock', 36); if (ic) g.drawImage(ic, Math.round(ix - 18), Math.round(iy - 18), 36, 36); }
      else if (s.tool) {
        const ic = iconCanvas(TOOLS[s.tool].icon, 52 * dpr, !u); if (ic) g.drawImage(ic, Math.round(ix - 26), Math.round(iy - 26), 52, 52);
        if (!u) { g.font = "13px 'VT', monospace"; g.fillStyle = '#e0604a'; g.textAlign = 'center'; g.fillText('NO UNIT', ix, iy + 30); }
      } else { g.font = "14px 'VT', monospace"; g.fillStyle = '#5c6a52'; g.textAlign = 'center'; g.fillText('EMPTY', ix, iy + 4); }
      // number and level pips
      const nx = cx + Math.cos(a0 + 0.13) * (R1 - 13), ny = cy + Math.sin(a0 + 0.13) * (R1 - 13);
      g.font = "15px 'Jersey', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = lock ? '#6a6450' : '#d9d1ae'; g.fillText(String(i + 1), nx, ny);
      for (let k = 0; k < 3; k++) { const pa = am - 0.16 + k * 0.16, px = cx + Math.cos(pa) * (R0 + 11), py = cy + Math.sin(pa) * (R0 + 11); g.fillStyle = k < s.level ? '#e2b04a' : '#3a3628'; g.fillRect(Math.round(px - 3), Math.round(py - 3), 6, 6); }
    }
    // the hub: a CRT disc
    g.beginPath(); g.arc(cx, cy, R0 - 2, 0, TAU); g.fillStyle = '#5d6064'; g.fill();
    g.beginPath(); g.arc(cx, cy, RH, 0, TAU); g.fillStyle = '#0b130e'; g.fill();
    for (let y = -RH; y < RH; y += 3) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx - RH, cy + y, RH * 2, 1); }
    const show = this.hover >= 0 ? this.hover : c.slots.active;
    const sl = show >= 0 ? c.slots.slots[show] : null;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(127,212,138,0.6)'; g.shadowBlur = 6; g.fillStyle = '#8fe09a';
    if (sl && sl.tool) {
      g.font = "19px 'VT', monospace"; g.fillText(TOOLS[sl.tool].name.toUpperCase().split(' ')[0], cx, cy - 12);
      g.font = "15px 'VT', monospace"; g.fillText(`SLOT ${show + 1} · LV ${sl.level}`, cx, cy + 8);
      g.fillStyle = c.slots.active === show ? '#e2b04a' : '#5fae6c'; g.fillText(c.slots.active === show ? 'IN USE' : 'READY', cx, cy + 26);
    } else if (sl && sl.level <= 0) { g.font = "17px 'VT', monospace"; g.fillStyle = '#e2b04a'; g.fillText('LOCKED', cx, cy); }
    else { g.font = "18px 'VT', monospace"; g.fillText('TOOLS', cx, cy - 8); g.font = "13px 'VT', monospace"; g.fillStyle = '#5fae6c'; g.fillText('CLICK A SLOT', cx, cy + 12); }
    g.shadowBlur = 0;
  }
}
