// Mobile controls: a virtual stick on the left, round machine buttons on the right (PUNCH, USE, THROW, POWER and
// a small knob that turns the ability wheel), one-finger drag to swing the camera round, pinch to zoom and a
// two-finger twist to rotate. Everything is pixel art in the console's style: riveted gunmetal bezels, painted
// caps with stencilled labels, little lamps that light when the button can do something. Hidden on desktop.
// body.touch-ui carries --tc-safe-left / --tc-safe-bottom (the stick's corner) and --tc-safe-right /
// --tc-safe-bottom-right (the buttons') for other UI to keep clear; the objectives are parked and collapsed here.
import { Pix, GM, RD, PH, AM, CR, INK, BK, OL, dv, text, textW, mixc } from './machine';
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
// ART.md materials: muted enamel and Bakelite, soft phosphor, one accent (the red PUNCH cap)
const mute = (R: number[], k = 0.38) => R.map((c) => mixc(c, 0x5a554c, k));
const RED = mute(RD, 0.42), BAK = [...BK, 0x6a5a4c, 0x7e6c5a, 0x968470].map((c) => mixc(c, 0x3a2418, 0.25)), LAMP_G = mute(PH, 0.3), LAMP_A = mute(AM, 0.3);
const STEEL = 0x8d8f8a;
/** art pixels per layout pixel: the controls are painted at twice the HUD's pixel density, so their pixels are
 *  finer (and the labels set in the NanoPlus face) while the layout still snaps to the console's grid */
const Q = 2;
/** a label in a pixel face, binarised: falls back to the 3x5 stencil (scaled) until the font has loaded */
function labelMask(label: string): { m: Uint8Array; w: number; h: number } {
  const face = '13px Jersey';
  if (document.fonts?.check(face)) {
    const c = document.createElement('canvas'); c.width = 120; c.height = 20;
    const g = c.getContext('2d', { willReadFrequently: true })!; g.font = face; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.fillText(label, 1, 13);
    const w = Math.ceil(g.measureText(label).width) + 2, d = g.getImageData(0, 0, 120, 20).data, m = new Uint8Array(w * 20);
    let top = 20, bot = 0;
    for (let y = 0; y < 20; y++) for (let x = 0; x < w; x++) if (d[(y * 120 + x) * 4 + 3] > 127) { m[y * w + x] = 1; top = Math.min(top, y); bot = Math.max(bot, y); }
    if (top <= bot) return { m: m.slice(top * w, (bot + 1) * w), w, h: bot - top + 1 };
  }
  const p = new Pix(textW(label) + 2, 7); text(p, label, 0, 0, 0xffffff);
  const w = p.w * 2, h = 10, m = new Uint8Array(w * h);
  for (let y = 0; y < 5; y++) for (let x = 0; x < p.w; x++) if (p.a(x, y)) for (let i = 0; i < 4; i++) m[(y * 2 + (i >> 1)) * w + x * 2 + (i & 1)] = 1;
  return { m, w, h };
}
/** a round button: gunmetal bezel with rivets, a domed painted cap, a label. 3 frames: idle, pressed, dead.
 *  r is in layout pixels; D comes back in layout pixels too (the sheet is Q times larger) */
const hash2 = (a: number, b: number) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };
function buttonSheet(r1: number, cap: number[], label: string, rivets = 6) {
  const r = r1 * Q, D = r * 2 + 2, p = new Pix(D * 3, D), c = r + 0.5, bz = 4 * Q, seed = [...label].reduce((s, ch) => s + ch.charCodeAt(0), r1) % 97;
  const L = label ? labelMask(label) : null;
  for (let f = 0; f < 3; f++) {
    const o = f * D, pressed = f === 1, dead = f === 2;
    const C = dead ? cap.map((x) => mixc(x, 0x1e2227, 0.65)) : cap;
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      if (d > r + 0.4) continue;
      const lit = -(dx * LX + dy * LY) / Math.max(1, d);
      if (d > r - 1.2) { p.set(o + x, y, INK); continue; }
      if (d > r - bz) { // bezel: olive enamel over machined steel, the enamel chipped back where thumbs have worn it
        const outer = d > r - bz * 0.55, ang = Math.atan2(dy, dx);
        const chip = outer && (Math.sin(ang * 7 + seed) + Math.sin(ang * 13 + seed * 2.3)) * 0.5 + (hash2(Math.floor(ang * 18), seed) - 0.5) > 0.62;
        if (outer && !chip) p.set(o + x, y, dv(OL, 3.6 + lit * 2.2 + (d > r - 2.2 ? lit : 0), o + x, y));
        else { const ring = Math.floor(d * 0.75) % 2; p.set(o + x, y, chip ? mixc(STEEL, GM[3], 0.35 - lit * 0.3) : dv(GM, 4.6 + lit * 2.6 + ring * 0.3, o + x, y)); }
        continue;
      }
      if (d > r - bz - 1.6) { p.set(o + x, y, INK); continue; }
      // the cap: a dome; pressed sinks and darkens
      const rr = r - bz - 1.6, ox = pressed ? 1.4 : 0, nx = (dx - ox) / rr, ny = (dy - ox) / rr, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const sh = -(nx * LX + ny * LY) * 0.72 + nz * 0.6;
      p.set(o + x, y, dv(C, 1.5 + sh * 4.2 - (pressed ? 1 : 0) - (d / rr) * 0.6, o + x, y));
    }
    // one slotted set-screw holding the cap, at its own angle, and an engraved index tick at the top
    { const a = seed * 2.39 + 2.2, sx = Math.round(o + c + Math.cos(a) * (r - bz * 0.72)), sy = Math.round(c + Math.sin(a) * (r - bz * 0.72));
      for (let yy = -2; yy <= 2; yy++) for (let xx = -2; xx <= 2; xx++) if (xx * xx + yy * yy <= 5) p.set(sx + xx, sy + yy, xx + yy < 0 ? GM[8] : GM[4]);
      const sa = a * 1.7; for (let t = -2; t <= 2; t++) p.set(Math.round(sx + Math.cos(sa) * t), Math.round(sy + Math.sin(sa) * t), GM[1]); }
    for (let t = 0; t < 3; t++) p.set(Math.round(o + c), Math.round(c - r + 2 + t), GM[1]);
    void rivets;
    if (!dead) { // a specular glint on the dome
      const hx = o + Math.round(c - r * 0.36) + (pressed ? 2 : 0), hy = Math.round(c - r * 0.42) + (pressed ? 2 : 0);
      p.rect(hx, hy, 3, 2, 0xe8e2d0, 150); p.rect(hx, hy + 2, 2, 1, 0xe8e2d0, 90);
    }
    if (L) { // the label, painted on the cap with a dark under-shadow
      const tx = Math.round(o + c - L.w / 2) + (pressed ? 2 : 0), ty = Math.round(c + r * 0.12) + (pressed ? 2 : 0);
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.m[y * L.w + x]) { p.set(tx + x + 1, ty + y + 1, C[0], 230); }
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (L.m[y * L.w + x] && hash2(x * 3 + o, y + seed) > 0.08) p.set(tx + x, ty + y, dead ? GM[4] : hash2(x, y * 7 + seed) < 0.2 ? CR[2] : CR[3]);
    }
  }
  return { url: p.url(), D: D / Q };
}
/** the stick's housing: a riveted ring round a recessed well with an engraved cross; and its bakelite knob */
function stickArt() {
  const R = 30 * Q, D = R * 2 + 2, p = new Pix(D, D), c = R + 0.5, bz = 5 * Q;
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    if (d > R + 0.4) continue;
    const lit = -(dx * LX + dy * LY) / Math.max(1, d);
    if (d > R - 1.2) p.set(x, y, INK);
    else if (d > R - bz) p.set(x, y, dv(GM, 4.2 + lit * 2.6 + (Math.floor(d * 0.7) % 2) * 0.4, x, y));
    else if (d > R - bz - 2) p.set(x, y, INK);
    else { const wall = Math.max(0, (d - (R - 12 * Q)) / (6 * Q)); p.set(x, y, dv(GM, 1.4 - wall * lit * 1.4, x, y), 230); }
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, x = Math.round(c + Math.cos(a) * (R - bz / 2) - 1), y = Math.round(c + Math.sin(a) * (R - bz / 2) - 1);
    p.set(x + 2, y + 2, GM[1]); p.set(x, y, GM[9]); p.set(x + 1, y, GM[7]); p.set(x, y + 1, GM[7]); p.set(x + 1, y + 1, GM[5]);
  }
  const in0 = R - 9 * Q;
  for (let k = -in0; k <= in0; k++) { if (Math.abs(k) < 4 * Q) continue; p.set(Math.round(c + k), Math.round(c), GM[0], 170); p.set(Math.round(c), Math.round(c + k), GM[0], 170); }
  // four phosphor chevrons
  for (const [ax, ay] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) for (let t = 0; t < 3 * Q; t++) for (let s = -t; s <= t; s++) {
    const x = Math.round(c + ax * (R - 9 * Q - t) + (ay ? s : 0)), y = Math.round(c + ay * (R - 9 * Q - t) + (ax ? s : 0));
    p.set(x, y, t < 2 ? LAMP_G[8] : LAMP_G[5]);
  }
  const K = 12 * Q, KD = K * 2 + 2, k = new Pix(KD, KD), kc = K + 0.5;
  for (let y = 0; y < KD; y++) for (let x = 0; x < KD; x++) {
    const dx = x - kc, dy = y - kc, d = Math.hypot(dx, dy);
    if (d > K + 0.4) continue;
    if (d > K - 1.2) { k.set(x, y, INK); continue; }
    const nx = dx / K, ny = dy / K, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)), sh = -(nx * LX + ny * LY) * 0.7 + nz * 0.6;
    if (d > K - 3.4 * Q && d < K - 1.6 * Q) { k.set(x, y, dv(OL, 3 + sh * 3.5, x, y)); continue; }
    // knurled grip rings on the bakelite
    k.set(x, y, dv(BAK, 0.8 + sh * 4.5 + (d < K * 0.5 && Math.floor(d) % 3 === 0 ? -0.6 : 0), x, y));
  }
  k.rect(Math.round(kc - 4 * Q), Math.round(kc - 5 * Q), 3, 2, 0xe8e2d0, 150);
  return { base: p.url(), D: D / Q, knob: k.url(), KD: KD / Q };
}
/** a small lamp: off / green / amber, painted at the controls' resolution */
function lampSheet() {
  const s = 5 * Q, p = new Pix(s * 3, s);
  const cols = [[GM[2], GM[3], GM[4]], [LAMP_G[6], LAMP_G[8], LAMP_G[9]], [LAMP_A[4], LAMP_A[6], LAMP_A[7]]];
  cols.forEach(([a, b, h], i) => {
    const o = i * s; p.rect(o, 0, s, s, INK); p.rect(o + 2, 2, s - 4, s - 4, a); p.rect(o + 2, 2, s - 5, 2, b); p.rect(o + 2, 2, 2, s - 5, b); p.set(o + 3, 3, h);
  });
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
/* the corners the controls own: other UI keeps out of them (body.touch-ui sets --tc-safe-left/-bottom/-right) */
body.touch-ui .hud-obj { position: fixed !important; left: var(--tc-obj-left, 6px) !important; top: var(--tc-obj-top, 64px) !important; right: auto !important; bottom: auto !important;
  width: auto !important; max-width: min(46vw, calc(150px * var(--s))) !important; max-height: calc(13px * var(--s)); overflow: hidden; z-index: 26; pointer-events: auto !important; cursor: pointer;
  font-size: calc(10px * var(--s)) !important; transform-origin: top left; transition: max-height 160ms steps(4); }
body.touch-ui .hud-obj.tc-open { max-height: 52vh; }
body.touch-ui .hud-obj h4::after { content: ' \25BE'; opacity: 0.7; }
body.touch-ui .hud-obj.tc-open h4::after { content: ' \25B4'; }
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
  private stickId: number | null = null; private sx = 0; private sy = 0; private kx = 0; private ky = 0;
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
      lamp.style.width = lamp.style.height = 5 * k / Q * 1.6 + 'px'; lamp.style.backgroundImage = `url(${lamps})`; lamp.style.backgroundSize = `${15 * k / Q * 1.6}px ${5 * k / Q * 1.6}px`;
      lamp.style.left = (s.D / 2 - 2.5 * 1.6 / Q) * k + 'px'; lamp.style.top = k * 0.6 + 'px';
      e.appendChild(lamp);
      return { e, D: s.D, lamp, st: '', lampSt: '', id: null, x0: 0, y0: 0, dx: 0, dy: 0 };
    };
    const C = { x: 34, y: 32 };
    // (x, y are distances from the right and bottom edges: 0 deg is straight left of PUNCH, 90 deg straight above)
    const at = (deg: number, d: number) => ({ x: C.x + Math.cos((deg * Math.PI) / 180) * d, y: C.y + Math.sin((deg * Math.PI) / 180) * d });
    const pU = at(0, 41), pT = at(48, 42), pP = at(94, 42), pW = at(70, 64);
    this.b = {
      punch: mk(21, RED, 'PUNCH', C.x, C.y),
      use: mk(15, BAK, 'USE', pU.x, pU.y),
      throw: mk(15, BAK, 'THROW', pT.x, pT.y),
      power: mk(15, BAK, 'POWER', pP.x, pP.y),
      wheel: mk(9, mute(OL, 0.1), '', pW.x, pW.y),
    };
    // the wheel knob: a turning arrow
    { const n = 9 * Q, p = new Pix(n, n), cc = (n - 1) / 2;
      for (let a = 0; a < 60; a++) { const t = (a / 60) * Math.PI * 1.55 + 0.7, rr = n * 0.36; for (const w of [0, 1]) p.set(Math.round(cc + Math.cos(t) * (rr - w)), Math.round(cc + Math.sin(t) * (rr - w)), INK); }
      const tx = Math.round(cc + Math.cos(0.7) * n * 0.36), ty = Math.round(cc + Math.sin(0.7) * n * 0.36);
      for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) { p.set(tx - 3 + i, ty - 4 + j, INK); p.set(tx - 3 + j, ty - 4 + i, INK); }
      const ic = p.canvas(); ic.className = 'tc-ic'; ic.style.width = ic.style.height = 9 * k + 'px'; ic.style.top = '50%'; this.b.wheel.e.appendChild(ic); }
    // the labels are set in the pixel face: repaint the caps once it has loaded
    const relabel = () => {
      for (const [id, r, cap, label] of [['punch', 21, RED, 'PUNCH'], ['use', 15, BAK, 'USE'], ['throw', 15, BAK, 'THROW'], ['power', 15, BAK, 'POWER']] as const) {
        this.b[id].e.style.backgroundImage = `url(${buttonSheet(r, cap as unknown as number[], label).url})`;
      }
    };
    if (!document.fonts?.check('13px Jersey')) document.fonts?.load('13px Jersey').then(relabel).catch(() => { /* keep the stencil */ });
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
    addEventListener('resize', this.safe);
    // the objectives collapse to one line on touch: a tap opens them
    document.addEventListener('pointerup', this.objTap, true);
    this.safe();
  }
  private objTap = (e: PointerEvent) => {
    const o = (e.target as HTMLElement | null)?.closest?.('.hud-obj') as HTMLElement | null;
    if (o && document.body.classList.contains('touch-ui')) o.classList.toggle('tc-open');
  };
  private safeT = 0;
  /** publish the controls' corners as CSS variables and park the objectives clear of the stick: to the right of the
   *  minimap when there is room, else under it */
  private safe = () => {
    const r = document.body.style, zb = this.zone.getBoundingClientRect(), pb = this.pad.getBoundingClientRect();
    const btns = [...this.pad.querySelectorAll('.tc-btn')].map((b) => b.getBoundingClientRect());
    const padW = btns.length ? innerWidth - Math.min(...btns.map((b) => b.left)) : pb.width, padH = btns.length ? innerHeight - Math.min(...btns.map((b) => b.top)) : pb.height;
    const base = this.base.getBoundingClientRect();
    r.setProperty('--tc-safe-left', Math.round(base.right + 8) + 'px');
    r.setProperty('--tc-safe-bottom', Math.round(innerHeight - base.top + 8) + 'px');
    r.setProperty('--tc-safe-right', Math.round(padW + 8) + 'px');
    r.setProperty('--tc-safe-bottom-right', Math.round(padH + 8) + 'px');
    void zb;
    const mm = document.querySelector('.hud .mm, .hud-mm, canvas.mm') as HTMLElement | null, m = mm?.getBoundingClientRect();
    let left = 6, top = Math.round(30 * S);
    if (m && m.width > 0) {
      if (innerWidth - m.right > 200) { left = Math.round(m.right + 10); top = Math.round(m.top); }
      else { left = Math.round(m.left); top = Math.round(m.bottom + 8); }
    }
    // never down into the stick's corner
    top = Math.min(top, Math.max(4, base.top - 16 * S - 8));
    r.setProperty('--tc-obj-left', left + 'px'); r.setProperty('--tc-obj-top', top + 'px');
  };
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
    this.kx = ux * R; this.ky = uy * R;
    this.host.stick(ux, uy, true);
  }
  private stickUp(e: PointerEvent) {
    if (e.pointerId !== this.stickId) return;
    this.stickId = null;
    this.zone.classList.remove('on');
    this.host.stick(0, 0, false);
    // the knob springs home past the centre and settles, then the housing returns to its rest spot
    const x0 = this.kx, y0 = this.ky, t0 = performance.now(), cx = this.sx, cy = this.sy;
    this.kx = this.ky = 0;
    const step = () => {
      if (this.stickId !== null) return;
      const t = (performance.now() - t0) / 1000, f = Math.exp(-t * 11) * Math.cos(t * 26);
      if (t > 0.32) { this.restStick(); return; }
      this.place(cx, cy, cx + x0 * f, cy + y0 * f);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
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
    if ((this.safeT += 1) % 60 === 0) this.safe();
    const L = this.host.labels();
    const lamp = (b: Btn, st: 0 | 1 | 2) => { const s = String(st); if (b.lampSt !== s) { b.lampSt = s; b.lamp.style.backgroundPositionX = `${-st * 5 * S / Q * 1.6}px`; } };
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
        // the hi-res icon where the art has one (twice the density, like the buttons)
        const pc = iconCanvas(key, { shadow: true, px: 18 * Q }) as unknown as { w: number; h: number; toImageData(): ImageData };
        const cv = document.createElement('canvas'); cv.width = pc.w; cv.height = pc.h; cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
        // sized to sit above the stencilled label, not over it
        cv.className = 'tc-ic'; cv.style.width = cv.style.height = 12 * S + 'px'; cv.style.top = '34%';
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
    removeEventListener('resize', this.restStick); removeEventListener('resize', this.safe);
    document.removeEventListener('pointerup', this.objTap, true);
    for (const v of ['--tc-safe-left', '--tc-safe-bottom', '--tc-safe-right', '--tc-safe-bottom-right', '--tc-obj-left', '--tc-obj-top']) document.body.style.removeProperty(v);
    this.zone.remove(); this.pad.remove(); this.style.remove();
    document.body.classList.remove('touch-ui');
  }
}
