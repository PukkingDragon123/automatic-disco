// Mobile controls: a virtual stick on the left, round machine buttons on the right (PUNCH, USE, THROW, POWER and
// a small knob that turns the ability wheel), one-finger drag to swing the camera round, pinch to zoom and a
// two-finger twist to rotate. Everything is pixel art in the console's style: riveted gunmetal bezels, painted
// caps with stencilled labels, little lamps that light when the button can do something. Hidden on desktop.
import { Pix, GM, RD, PH, AM, CR, INK, BR, dv, text, textW, mixc } from './machine';
import { iconCanvas } from './pixelart';
import { S } from './kit';
import { sfx } from '../audio/audio';

export interface TouchHost {
  stick(x: number, y: number, on: boolean): void;
  useDown(): void; useUp(): void;
  punch(on: boolean): void;
  throwPress(): void; throwAim(dx: number, dy: number): void; throwRelease(): void;
  powerPress(): void; powerRelease(dx: number, dy: number): void;
  turnWheel(): void;
  zoom(f: number): void; rotate(da: number): void;
  labels(): { use: string; useOk: boolean; holding: boolean; canThrow: boolean; power: string; punch: boolean };
  /** canvas touches belong to the controls (camera gestures) rather than the game's own click handling
   *  (false while a power is armed and waits for a tap on its target, in cutscenes, during a harvest) */
  readonly captureView: boolean;
}

/** a phone or tablet: coarse pointer (touch screens with a mouse keep the desktop layout until touched) */
export function isTouchDevice() {
  try { return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches); } catch { return false; }
}

// ------------------------------------------------------------------ art
const LX = -0.55, LY = -0.83;
const VIO = [0x14081e, 0x26103a, 0x3a1a58, 0x522878, 0x6c3a98, 0x8a54b8, 0xa878d4, 0xc8a4ec, 0xe8d4ff];
/** a round button: gunmetal bezel with rivets, a domed painted cap, a stencilled label. 3 frames: idle, pressed, dead */
function buttonSheet(r: number, cap: number[], label: string, rivets = 6) {
  const D = r * 2 + 2, p = new Pix(D * 3, D), c = r + 0.5;
  for (let f = 0; f < 3; f++) {
    const o = f * D, pressed = f === 1, dead = f === 2;
    const C = dead ? cap.map((x) => mixc(x, 0x1e2227, 0.65)) : cap;
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      if (d > r + 0.4) continue;
      const lit = -(dx * LX + dy * LY) / Math.max(1, d);
      if (d > r - 0.6) { p.set(o + x, y, INK); continue; }
      if (d > r - 4) { // bezel: machined ring, lit from the top left
        const ring = Math.floor(d * 1.3) % 2;
        p.set(o + x, y, dv(GM, 4.4 + lit * 2.6 + ring * 0.4, o + x, y)); continue;
      }
      if (d > r - 5) { p.set(o + x, y, INK); continue; }
      // the cap: a dome; pressed sinks and darkens
      const rr = r - 5, ox = pressed ? 0.7 : 0, nx = (dx - ox) / rr, ny = (dy - ox) / rr, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const sh = -(nx * LX + ny * LY) * 0.7 + nz * 0.6;
      p.set(o + x, y, dv(C, 1.6 + sh * 4 - (pressed ? 1 : 0) - (d / rr) * 0.5, o + x, y));
    }
    // rivets round the bezel
    for (let i = 0; i < rivets; i++) {
      const a = (i / rivets) * Math.PI * 2 + 0.4, x = Math.round(o + c + Math.cos(a) * (r - 2) - 0.5), y = Math.round(c + Math.sin(a) * (r - 2) - 0.5);
      p.set(x, y, GM[8]); p.set(x + 1, y + 1, GM[1]); p.set(x + 1, y, GM[5]); p.set(x, y + 1, GM[3]);
    }
    if (!dead) { const hx = o + Math.round(c - r * 0.35) + (pressed ? 1 : 0), hy = Math.round(c - r * 0.42) + (pressed ? 1 : 0); p.set(hx, hy, 0xffffff, 220); p.set(hx + 1, hy, 0xffffff, 150); p.set(hx, hy + 1, 0xffffff, 120); }
    if (label) {
      const w = textW(label), tx = Math.round(o + c - w / 2) + (pressed ? 1 : 0), ty = Math.round(c + r * 0.3) + (pressed ? 1 : 0);
      text(p, label, tx, ty, dead ? GM[4] : CR[4], 'shadow', -1, C[0]);
    }
  }
  return { url: p.url(), D };
}
/** the stick's housing: a riveted ring round a recessed well with an engraved cross; and its bakelite knob */
function stickArt() {
  const R = 30, D = R * 2 + 2, p = new Pix(D, D), c = R + 0.5;
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    if (d > R + 0.4) continue;
    const lit = -(dx * LX + dy * LY) / Math.max(1, d);
    if (d > R - 0.6) p.set(x, y, INK);
    else if (d > R - 5) p.set(x, y, dv(GM, 4.2 + lit * 2.4 + (Math.floor(d * 1.3) % 2) * 0.4, x, y));
    else if (d > R - 6) p.set(x, y, INK);
    else { const wall = Math.max(0, (d - (R - 12)) / 6); p.set(x, y, dv(GM, 1.4 - wall * lit * 1.3, x, y), 230); }
  }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2, x = Math.round(c + Math.cos(a) * (R - 2.5) - 0.5), y = Math.round(c + Math.sin(a) * (R - 2.5) - 0.5); p.set(x, y, GM[8]); p.set(x + 1, y + 1, GM[1]); }
  for (let k = -R + 9; k <= R - 9; k++) { if (Math.abs(k) < 4) continue; p.set(Math.round(c + k), Math.round(c), GM[0], 180); p.set(Math.round(c), Math.round(c + k), GM[0], 180); }
  for (const [ax, ay] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) for (let t = 0; t < 3; t++) for (let s = -t; s <= t; s++) {
    const x = Math.round(c + ax * (R - 9 - t) + (ay ? s : 0)), y = Math.round(c + ay * (R - 9 - t) + (ax ? s : 0));
    p.set(x, y, PH[5]);
  }
  const K = 12, KD = K * 2 + 2, k = new Pix(KD, KD), kc = K + 0.5;
  for (let y = 0; y < KD; y++) for (let x = 0; x < KD; x++) {
    const dx = x - kc, dy = y - kc, d = Math.hypot(dx, dy);
    if (d > K + 0.4) continue;
    if (d > K - 0.6) { k.set(x, y, INK); continue; }
    const nx = dx / K, ny = dy / K, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), sh = -(nx * LX + ny * LY) * 0.7 + nz * 0.6;
    if (d > K - 3.2 && d < K - 1.6) { k.set(x, y, dv(PH, 4 + sh * 4, x, y)); continue; }
    k.set(x, y, dv(GM, 0.8 + sh * 4.5, x, y));
  }
  k.set(Math.round(kc - 4), Math.round(kc - 5), 0xffffff, 200); k.set(Math.round(kc - 3), Math.round(kc - 5), 0xffffff, 120);
  return { base: p.url(), D, knob: k.url(), KD };
}
/** a small lamp: off / green / amber */
function lampSheet() {
  const p = new Pix(15, 5);
  const cols = [[GM[2], GM[3]], [PH[6], PH[9]], [AM[4], AM[7]]];
  cols.forEach(([a, b], i) => { const o = i * 5; p.rect(o, 0, 5, 5, INK); p.rect(o + 1, 1, 3, 3, a); p.set(o + 1, 1, b); p.set(o + 2, 1, b); p.set(o + 1, 2, b); });
  return p.url();
}
const CSS = `
.tc-zone { position: fixed; left: 0; bottom: 0; width: 42vw; height: 72vh; z-index: 25; touch-action: none; pointer-events: auto; }
.tc-base, .tc-knob { position: absolute; background-size: 100% 100%; image-rendering: pixelated; pointer-events: none; transform: translate(-50%, -50%); }
.tc-base { opacity: 0.55; transition: opacity 120ms steps(3); }
.tc-zone.on .tc-base { opacity: 1; }
.tc-pad { position: fixed; right: 0; bottom: 0; z-index: 30; pointer-events: none; }
.tc-btn { position: absolute; background-repeat: no-repeat; image-rendering: pixelated; touch-action: none; pointer-events: auto; border-radius: 50%; -webkit-tap-highlight-color: transparent; }
.tc-btn .tc-ic { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); image-rendering: pixelated; pointer-events: none; }
.tc-lamp { position: absolute; background-repeat: no-repeat; image-rendering: pixelated; pointer-events: none; }
.tc-lab { position: absolute; image-rendering: pixelated; pointer-events: none; transform: translateX(-50%); white-space: nowrap; }
.tc-hide { display: none !important; }
`;

// ------------------------------------------------------------------ controls
interface Btn { e: HTMLDivElement; D: number; lamp: HTMLDivElement; st: string; lampSt: string; id: number | null; x0: number; y0: number; dx: number; dy: number; ic?: HTMLCanvasElement }
export class TouchControls {
  active = true;
  punchHeld = false; useHeld = false;
  private style: HTMLStyleElement;
  private zone: HTMLDivElement; private base: HTMLDivElement; private knob: HTMLDivElement;
  private pad: HTMLDivElement;
  private b: Record<'punch' | 'use' | 'throw' | 'power' | 'wheel', Btn>;
  private stickId: number | null = null; private sx = 0; private sy = 0;
  private gest = new Map<number, { x: number; y: number }>();
  private gd = 0; private ga = 0;
  private holdingAtPress = false;
  private art = stickArt();
  private iconKey = '';
  constructor(readonly host: TouchHost) {
    document.body.classList.add('touch-ui');
    this.style = document.createElement('style'); this.style.textContent = CSS; document.head.appendChild(this.style);
    const k = S;
    // ---- stick
    this.zone = document.createElement('div'); this.zone.className = 'tc-zone'; document.body.appendChild(this.zone);
    this.base = document.createElement('div'); this.base.className = 'tc-base'; this.zone.appendChild(this.base);
    this.knob = document.createElement('div'); this.knob.className = 'tc-knob'; this.zone.appendChild(this.knob);
    this.base.style.backgroundImage = `url(${this.art.base})`; this.knob.style.backgroundImage = `url(${this.art.knob})`;
    this.base.style.width = this.base.style.height = this.art.D * k + 'px';
    this.knob.style.width = this.knob.style.height = this.art.KD * k + 'px';
    this.restStick();
    this.zone.addEventListener('pointerdown', (e) => this.stickDown(e));
    this.zone.addEventListener('pointermove', (e) => this.stickMove(e));
    this.zone.addEventListener('pointerup', (e) => this.stickUp(e));
    this.zone.addEventListener('pointercancel', (e) => this.stickUp(e));
    // ---- buttons: PUNCH the big one in the corner, the rest on an arc round it
    this.pad = document.createElement('div'); this.pad.className = 'tc-pad'; document.body.appendChild(this.pad);
    const lamps = lampSheet();
    const mk = (r: number, cap: number[], label: string, cx: number, cy: number): Btn => {
      const s = buttonSheet(r, cap, label);
      const e = document.createElement('div'); e.className = 'tc-btn';
      e.style.width = e.style.height = s.D * k + 'px';
      e.style.backgroundImage = `url(${s.url})`; e.style.backgroundSize = `${s.D * 3 * k}px ${s.D * k}px`;
      e.style.right = (cx - s.D / 2) * k + 'px'; e.style.bottom = (cy - s.D / 2) * k + 'px';
      this.pad.appendChild(e);
      const lamp = document.createElement('div'); lamp.className = 'tc-lamp';
      lamp.style.width = lamp.style.height = 5 * k + 'px'; lamp.style.backgroundImage = `url(${lamps})`; lamp.style.backgroundSize = `${15 * k}px ${5 * k}px`;
      lamp.style.left = (s.D / 2 - 2.5) * k + 'px'; lamp.style.top = k + 'px';
      e.appendChild(lamp);
      return { e, D: s.D, lamp, st: '', lampSt: '', id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
    };
    const C = { x: 34, y: 32 };
    // (x, y are distances from the right and bottom edges: 0 deg is straight left of PUNCH, 90 deg straight above)
    const at = (deg: number, d: number) => ({ x: C.x + Math.cos((deg * Math.PI) / 180) * d, y: C.y + Math.sin((deg * Math.PI) / 180) * d });
    const pU = at(0, 41), pT = at(48, 42), pP = at(94, 42), pW = at(70, 64);
    this.b = {
      punch: mk(21, RD, 'PUNCH', C.x, C.y),
      use: mk(15, PH, 'USE', pU.x, pU.y),
      throw: mk(15, AM, 'THROW', pT.x, pT.y),
      power: mk(15, VIO, 'POWER', pP.x, pP.y),
      wheel: mk(9, BR, '', pW.x, pW.y),
    };
    // the wheel knob: a turning arrow
    { const p = new Pix(9, 9); for (let a = 0; a < 18; a++) { const t = (a / 18) * Math.PI * 1.6 + 0.6; p.set(Math.round(4 + Math.cos(t) * 3.2), Math.round(4 + Math.sin(t) * 3.2), INK); } p.set(6, 1, INK); p.set(7, 2, INK); p.set(5, 2, INK);
      const ic = p.canvas(); ic.className = 'tc-ic'; ic.style.width = ic.style.height = 9 * k + 'px'; ic.style.top = '50%'; this.b.wheel.e.appendChild(ic); }
    // ---- wiring
    this.press(this.b.punch, () => { this.punchHeld = true; host.punch(true); }, () => { this.punchHeld = false; host.punch(false); });
    this.press(this.b.use, () => { this.useHeld = true; host.useDown(); }, () => { this.useHeld = false; host.useUp(); });
    this.press(this.b.throw, () => { this.holdingAtPress = host.labels().holding; host.throwPress(); }, (b) => { if (this.holdingAtPress) host.throwRelease(); void b; }, (b) => { if (this.holdingAtPress) host.throwAim(b.dx, b.dy); });
    this.press(this.b.power, () => host.powerPress(), (b) => host.powerRelease(b.dx, b.dy));
    this.press(this.b.wheel, () => host.turnWheel(), () => {});
    // camera gestures on the open view: one finger swings it round, two pinch and twist
    addEventListener('pointerdown', this.gDown, true);
    addEventListener('pointermove', this.gMove, true);
    addEventListener('pointerup', this.gUp, true);
    addEventListener('pointercancel', this.gUp, true);
    addEventListener('resize', this.restStick);
  }
  private press(b: Btn, down: (b: Btn) => void, up: (b: Btn) => void, move?: (b: Btn) => void) {
    const R = (b.D / 2) * S;
    b.e.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (b.id !== null) return;
      b.id = e.pointerId; b.x0 = e.clientX; b.y0 = e.clientY; b.dx = b.dy = 0;
      try { b.e.setPointerCapture(e.pointerId); } catch { /* a pointer the browser no longer tracks */ }
      b.e.style.backgroundPositionX = `${-b.D * S}px`;
      sfx('click', 1.2, 0.35);
      down(b);
    });
    b.e.addEventListener('pointermove', (e) => {
      if (b.id !== e.pointerId) return;
      b.dx = (e.clientX - b.x0) / (R * 2.2); b.dy = (e.clientY - b.y0) / (R * 2.2);
      move?.(b);
    });
    const end = (e: PointerEvent) => {
      if (b.id !== e.pointerId) return;
      b.id = null; b.e.style.backgroundPositionX = '';
      up(b);
    };
    b.e.addEventListener('pointerup', end); b.e.addEventListener('pointercancel', end);
    b.e.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // ---- stick
  private restStick = () => {
    const k = S, x = 18 * k + this.art.D * k / 2, y = this.zone.clientHeight - 16 * k - this.art.D * k / 2;
    this.place(x, y, x, y);
  };
  private place(bx: number, by: number, kx: number, ky: number) {
    this.base.style.left = bx + 'px'; this.base.style.top = by + 'px';
    this.knob.style.left = kx + 'px'; this.knob.style.top = ky + 'px';
  }
  private stickDown(e: PointerEvent) {
    e.preventDefault(); e.stopPropagation();
    if (this.stickId !== null) return;
    this.stickId = e.pointerId; try { this.zone.setPointerCapture(e.pointerId); } catch { /* ditto */ }
    const r = this.zone.getBoundingClientRect();
    this.sx = e.clientX - r.left; this.sy = e.clientY - r.top;
    this.zone.classList.add('on');
    this.place(this.sx, this.sy, this.sx, this.sy);
    this.host.stick(0, 0, true);
  }
  private stickMove(e: PointerEvent) {
    if (e.pointerId !== this.stickId) return;
    const r = this.zone.getBoundingClientRect(), R = (this.art.D / 2 - 9) * S;
    let dx = e.clientX - r.left - this.sx, dy = e.clientY - r.top - this.sy;
    const d = Math.hypot(dx, dy);
    // drag the housing along when the thumb runs past the rim
    if (d > R * 1.6) { const k = (d - R * 1.6) / d; this.sx += dx * k; this.sy += dy * k; dx -= dx * k; dy -= dy * k; }
    const dl = Math.hypot(dx, dy), cl = Math.min(1, dl / R);
    const ux = dl > 0 ? (dx / dl) * cl : 0, uy = dl > 0 ? (dy / dl) * cl : 0;
    this.place(this.sx, this.sy, this.sx + ux * R, this.sy + uy * R);
    this.host.stick(ux, uy, true);
  }
  private stickUp(e: PointerEvent) {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.zone.classList.remove('on');
    this.host.stick(0, 0, false);
    this.restStick();
  }
  // ---- gestures on the canvas
  private isView(e: PointerEvent) { const t = e.target as HTMLElement; return e.pointerType === 'touch' && t && t.tagName === 'CANVAS' && t.id === 'view'; }
  private gDown = (e: PointerEvent) => {
    if (!this.isView(e) || !this.host.captureView || !this.active) return;
    e.stopPropagation();
    this.gest.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.gest.size === 2) { const [a, b] = [...this.gest.values()]; this.gd = Math.hypot(a.x - b.x, a.y - b.y); this.ga = Math.atan2(b.y - a.y, b.x - a.x); }
  };
  private gMove = (e: PointerEvent) => {
    const p = this.gest.get(e.pointerId); if (!p) return;
    e.stopPropagation();
    const dx = e.clientX - p.x; p.x = e.clientX; p.y = e.clientY;
    if (this.gest.size === 1) { this.host.rotate(-dx * 0.006); return; }
    const [a, b] = [...this.gest.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), an = Math.atan2(b.y - a.y, b.x - a.x);
    if (this.gd > 10 && d > 10) this.host.zoom(this.gd / d);
    let da = an - this.ga; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
    this.host.rotate(-da);
    this.gd = d; this.ga = an;
  };
  private gUp = (e: PointerEvent) => { if (this.gest.delete(e.pointerId)) e.stopPropagation(); };

  /** refresh lamps, the use label and the power icon (cheap; only touches the DOM on change) */
  update() {
    if (!this.active) return;
    const L = this.host.labels();
    const lamp = (b: Btn, st: 0 | 1 | 2) => { const s = String(st); if (b.lampSt !== s) { b.lampSt = s; b.lamp.style.backgroundPositionX = `${-st * 5 * S}px`; } };
    const dead = (b: Btn, d: boolean) => { const s = d ? 'd' : ''; if (b.st !== s) { b.st = s; if (b.id === null) b.e.style.backgroundPositionX = d ? `${-b.D * 2 * S}px` : ''; } };
    lamp(this.b.punch, 1); dead(this.b.punch, false);
    lamp(this.b.use, L.use ? (L.useOk ? 1 : 2) : 0); dead(this.b.use, !L.use);
    lamp(this.b.throw, L.holding ? 2 : L.canThrow ? 1 : 0); dead(this.b.throw, !L.canThrow && !L.holding);
    lamp(this.b.power, L.power ? 1 : 0); dead(this.b.power, !L.power);
    // the armed power's icon on its cap
    const key = L.power;
    if (key !== this.iconKey) {
      this.iconKey = key;
      this.b.power.ic?.remove(); this.b.power.ic = undefined;
      if (key) {
        const pc = iconCanvas(key, { shadow: true }) as unknown as { w: number; h: number; toImageData(): ImageData };
        const cv = document.createElement('canvas'); cv.width = pc.w; cv.height = pc.h; cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
        cv.className = 'tc-ic'; cv.style.width = pc.w * S + 'px'; cv.style.height = pc.h * S + 'px';
        this.b.power.e.appendChild(cv); this.b.power.ic = cv;
      }
    }
  }
  setVisible(v: boolean) {
    this.active = v;
    this.zone.classList.toggle('tc-hide', !v); this.pad.classList.toggle('tc-hide', !v);
    if (!v) { this.host.stick(0, 0, false); this.punchHeld = this.useHeld = false; }
  }
  dispose() {
    removeEventListener('pointerdown', this.gDown, true); removeEventListener('pointermove', this.gMove, true);
    removeEventListener('pointerup', this.gUp, true); removeEventListener('pointercancel', this.gUp, true);
    removeEventListener('resize', this.restStick);
    this.zone.remove(); this.pad.remove(); this.style.remove();
    document.body.classList.remove('touch-ui');
  }
}
