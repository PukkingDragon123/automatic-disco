// The ordnance selector: a heavy machined revolver dial with the golem's nine field powers seated in brass
// chambers around its rim. It turns with the mouse wheel, by dragging, by clicking a chamber or with the [ ] / , .
// keys, ratcheting from detent to detent under a spring pawl. The chamber under the pawl is the selection: its
// name, cost and readout print on the CRT above; the red mushroom button in the hub (or Enter / F, or the old
// number keys) arms it. Lighting is computed in screen space every redraw, so the rim turns but the light stays.
import { el, Tip } from './kit';
import { sfx } from '../audio/audio';
import { ABILITIES, type Ability, type Hive } from '../game/hive';
import { iconCanvas } from './pixelart';
import { Pix, GM, BR, RD, PH, AM, CR, HZ, INK, dv, text, mixc, hex } from './machine';
import { Gauge, Lamp, meterFace, place, steamVent, u } from './gadgets';
import { WHEEL, DESC, wheelArt, descArt } from './hudArt';
import { hashf } from '../limbo/core/rng';

export interface WheelCtx { hive: Hive; arm(a: Ability): void; armed(): Ability | null }

const ORDER: Ability[] = (Object.keys(ABILITIES) as Ability[]).sort((a, b) => +ABILITIES[a].key - +ABILITIES[b].key);
const N = ORDER.length, STEP = (Math.PI * 2) / N;
const SZ = WHEEL.ws, C = SZ / 2;
const R_TOOTH = 61.6, R_ROOT = 58.2, R_KNURL = 52.6, R_HAZ0 = 18.5, R_HAZ1 = 23.5, R_CH = 37.6, R_LAMP = 51;
const TEETH = N * 4;
const LX = -0.55, LY = -0.83; // light from the top left
const wrap = (a: number) => { a %= Math.PI * 2; if (a > Math.PI) a -= Math.PI * 2; if (a < -Math.PI) a += Math.PI * 2; return a; };

// ------------------------------------------------------------------ static art
let pre: { r: Float32Array; th: Float32Array; scratch: Uint8Array; lit: Float32Array; face: Float32Array } | null = null;
function precompute() {
  if (pre) return pre;
  const r = new Float32Array(SZ * SZ), th = new Float32Array(SZ * SZ), scratch = new Uint8Array(SZ * SZ), lit = new Float32Array(SZ * SZ), face = new Float32Array(SZ * SZ);
  const thL = Math.atan2(-LX, LY);
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    const i = y * SZ + x, dx = x + 0.5 - C, dy = y + 0.5 - C, rr = Math.hypot(dx, dy), t = Math.atan2(dx, -dy); // clockwise from 12 o'clock
    r[i] = rr; th[i] = t;
    const nx = dx / Math.max(1, rr), ny = dy / Math.max(1, rr);
    lit[i] = -(nx * LX + ny * LY);
    // machined face: a shallow dome, lathe rings, the spun-metal highlight cross (all fixed to the light, not the disc)
    const dome = lit[i] * (rr / R_KNURL) * 1.3, lathe = Math.sin(rr * 2.1) * 0.22 + (hashf(Math.floor(rr * 2), 0, 9) - 0.5) * 0.35;
    const spec = Math.pow(Math.max(0, Math.cos(2 * (t - thL))), 8) * 1.4;
    face[i] = 4.2 + dome + lathe + spec - (rr < R_HAZ0 ? 0.8 : 0) - (rr > R_KNURL - 3 ? 0.9 : 0);
  }
  // machining scratches fixed to the disc (sampled in disc space)
  for (let i = 0; i < 70; i++) {
    const a = hashf(i, 1, 5) * Math.PI * 2, rr = 26 + hashf(i, 2, 5) * 24, len = 2 + hashf(i, 3, 5) * 6, da = (hashf(i, 4, 5) - 0.5) * 2.2;
    for (let t = 0; t < len; t++) {
      const x = Math.round(C + Math.sin(a) * rr + Math.cos(a + da) * t), y = Math.round(C - Math.cos(a) * rr + Math.sin(a + da) * t);
      if (x >= 0 && y >= 0 && x < SZ && y < SZ) scratch[y * SZ + x] = 1 + (t % 3 === 0 ? 1 : 0);
    }
  }
  return (pre = { r, th, scratch, lit, face });
}
/** brass chamber ring with a dark bore, 24x24, lit from the top left (drawn upright at any rotation) */
let chamberPix: Pix | null = null, chamberSel: Pix | null = null;
function chamber(sel: boolean) {
  if (sel && chamberSel) return chamberSel; if (!sel && chamberPix) return chamberPix;
  const p = new Pix(25, 25), c = 12;
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    if (d > 12.2) continue;
    const lit = -(dx * LX + dy * LY) / Math.max(1, d);
    if (d > 11.3) p.set(x, y, INK);
    else if (d > 9.6) p.set(x, y, dv(sel ? AM : BR, (sel ? 4.2 : 4.4) + lit * 2.6, x, y));
    else if (d > 8.7) p.set(x, y, INK);
    else {
      // the bore: its upper-left inner wall falls into shadow, the lower-right wall catches light
      const wall = Math.max(0, (d - 5.5) / 3.2);
      p.set(x, y, dv(GM, 1.0 + wall * (-lit) * 1.6 + (sel ? 0.4 : 0), x, y));
    }
  }
  if (sel) { chamberSel = p; return p; } chamberPix = p; return p;
}
/** spring pawl that rides the ratchet teeth, 15x14: a brass pivot boss, a hardened claw, a coil spring */
function pawlURL() {
  const p = new Pix(15, 14);
  for (let y = 0; y < 7; y++) for (let x = 3; x < 12; x++) { const d = Math.hypot(x - 7, y - 3); if (d <= 3.4) p.set(x, y, d > 2.6 ? INK : dv(BR, 5 - (x - 7) * 0.5 - (y - 3) * 0.6, x, y)); }
  p.set(7, 3, GM[2]); p.set(6, 2, BR[8]); p.set(8, 3, GM[5]);
  for (let y = 6; y < 13; y++) {
    const half = Math.max(0, Math.round(2.2 - (y - 6) * 0.36));
    for (let x = 7 - half; x <= 7 + half; x++) p.set(x, y, x === 7 - half && half ? BR[7] : x === 7 + half && half ? BR[2] : y > 9 ? GM[8] : BR[5]);
    p.set(7 - half - 1, y, INK); p.set(7 + half + 1, y, INK);
  }
  p.set(7, 13, INK);
  for (let k = 0; k < 3; k++) { p.set(12, 3 + k * 2, GM[8]); p.set(13, 4 + k * 2, GM[4]); }
  return p.url();
}
/** the red mushroom button in its chrome collar, 5 frames of 36x36: idle, hover, pressed, dead, armed */
function fireSheet() {
  const S = 36, p = new Pix(S * 5, S), c = 17.5;
  const ramps = [RD, RD, RD, RD.map((x) => mixc(x, 0x241c1a, 0.55)), RD.map((x, i) => mixc(x, AM[Math.min(7, i + 1)], 0.35))];
  for (let f = 0; f < 5; f++) {
    const o = f * S, R = ramps[f], pressed = f === 2, glow = f === 1 || f === 4;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      if (d > 17.4) continue;
      const lit = -(dx * LX + dy * LY) / Math.max(1, d);
      if (d > 16.6) { p.set(o + x, y, INK); continue; }
      if (d > 13.4) { // chrome collar with machined rings
        const ring = Math.floor(d * 1.5) % 2;
        p.set(o + x, y, dv(GM, 5.6 + lit * 3.2 + ring * 0.5, o + x, y)); continue;
      }
      if (d > 12.6) { p.set(o + x, y, INK); continue; }
      // the dome
      const dd = d / 12.6, ox = pressed ? 0.6 : 0;
      const nx = (dx - ox) / 12.6, ny = (dy - ox) / 12.6, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const sh = -(nx * LX + ny * LY) * 0.75 + nz * 0.55;
      let v = 1.6 + sh * 4.2 - (pressed ? 0.9 : 0) + (glow ? 0.9 : 0) - dd * 0.4;
      p.set(o + x, y, dv(R, v, o + x, y));
    }
    // specular highlight
    if (f !== 3) { const hx = o + (pressed ? 13 : 12), hy = pressed ? 11 : 10; p.set(hx, hy, 0xffffff); p.set(hx + 1, hy, 0xffe8e0); p.set(hx, hy + 1, 0xffd8d0); p.set(hx + 2, hy - 1, 0xffd0c0, 160); p.set(hx - 1, hy + 2, 0xffd0c0, 140); }
    // stamped ring of text on the collar
    text(p, 'FIRE', o + 11, 27 + (pressed ? 1 : 0), f === 3 ? RD[3] : CR[4], 'shadow');
  }
  return p.url();
}

// ------------------------------------------------------------------ the dial
export class AbilityWheel {
  readonly root: HTMLDivElement;
  private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D; private img: ImageData;
  private pawl: HTMLDivElement; private fire: HTMLDivElement;
  private nameEl: HTMLDivElement; private costEl: HTMLDivElement; private crt: HTMLDivElement;
  private desc: HTMLDivElement; private descTxt: HTMLDivElement; private descT = 0; private descShown = ''; private typed = 0;
  private gauge: Gauge; private armLamp: Lamp; private tubes: HTMLDivElement[] = [];
  private icons: { n: HTMLCanvasElement; d: HTMLCanvasElement }[] = [];
  sel = 0; private ang = 0; private vel = 0; private target = 0; private lastDet = 0;
  private drag: { a0: number; ang0: number; moved: boolean; x: number; y: number; id: number } | null = null;
  private hover = -1; private dirty = true; private drawnAng = 99; private stateKey = ''; private t = 0;
  private wheelAcc = 0; private wheelT = 0; private flash = 0; private flashMsg = '';
  private settled = true; private lastArmed: Ability | null = null; private ptr: { x: number; y: number } | null = null;

  constructor(parent: HTMLElement, readonly c: WheelCtx) {
    precompute();
    const W = WHEEL;
    this.root = place(el('div', 'wl', parent), 0, 0, W.w, W.h);
    this.root.style.left = ''; this.root.style.top = '';
    this.root.style.backgroundImage = `url(${wheelArt().url()})`;
    // readout tray (slides up from behind the housing)
    this.desc = el('div', 'wl-desc', parent);
    this.desc.style.width = u(DESC.w); this.desc.style.height = u(DESC.h);
    this.desc.style.backgroundImage = `url(${descArt().url()})`;
    this.descTxt = place(el('div', 'scr wl-dtxt', this.desc), 7, 7, 158, 48);
    // name CRT
    this.crt = place(el('div', 'scr wl-crt', this.root), 10, 5, 122, 16);
    this.nameEl = el('div', 'wl-name', this.crt); this.costEl = el('div', 'wl-cost', this.crt);
    // the dial
    this.cv = place(el('canvas', 'wl-dial', this.root), W.wx, W.wy, SZ, SZ);
    this.cv.width = SZ; this.cv.height = SZ;
    this.g = this.cv.getContext('2d')!; this.img = this.g.createImageData(SZ, SZ);
    this.pawl = place(el('div', 'wl-pawl', this.root), W.wx + C - 7, W.wy - 8, 15, 14);
    this.pawl.style.backgroundImage = `url(${pawlURL()})`;
    this.fire = place(el('div', 'wl-fire', this.root), W.wx + C - 18, W.wy + C - 18, 36, 36);
    this.fire.style.backgroundImage = `url(${fireSheet()})`;
    // meter, tubes, lamp, vent
    this.gauge = new Gauge(this.root, 137, 34, { w: 30, h: 28, cx: 15, cy: 16, r: 11, a0: -2.2, a1: 2.2, face: (p) => meterFace(p, 15, 16, 11, -2.2, 2.2, { full: true, ticks: 8, red: [0, 0.15] }) });
    for (const x of [140, 154]) { const t = place(el('div', 'tube', this.root), x - 1, 66, 9, 20); this.tubes.push(t); }
    this.armLamp = new Lamp(this.root, 150, 102, 'r', 'off');
    steamVent(this.root, 153, 124, 7);
    for (const a of ORDER) {
      const n = iconCanvas(a, { shadow: true }), d = iconCanvas(a, { dim: true, shadow: true });
      this.icons.push({ n: toCanvas(n), d: toCanvas(d) });
    }
    // ---- input
    this.cv.addEventListener('pointerdown', (e) => this.down(e));
    this.cv.addEventListener('pointermove', (e) => this.move(e));
    this.cv.addEventListener('pointerup', (e) => this.up(e));
    this.cv.addEventListener('pointercancel', () => { this.drag = null; this.snap(); });
    this.cv.addEventListener('pointerleave', () => { this.ptr = null; if (!this.drag) { this.hover = -1; this.dirty = true; Tip.hide(); } });
    this.root.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); this.onWheel(e.deltaY); }, { passive: false });
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.fire.addEventListener('pointerenter', () => { this.fire.classList.add('hov'); sfx('hover'); this.showDesc(); });
    this.fire.addEventListener('pointerleave', () => { this.fire.classList.remove('hov', 'prs'); });
    this.fire.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.fire.classList.add('prs'); sfx('crack', 0.4, 0.3); });
    this.fire.addEventListener('pointerup', () => { if (!this.fire.classList.contains('prs')) return; this.fire.classList.remove('prs'); this.trigger(); });
    this.crt.addEventListener('pointerenter', () => this.showDesc());
  }

  // ------------------------------------------------------------------ controls
  get current(): Ability { return ORDER[this.sel]; }
  /** turn by n detents (positive = clockwise = next) */
  turn(n: number) {
    const armed = this.c.armed();
    if (armed && armed === this.current) this.c.arm(armed);
    this.sel = (((this.sel + n) % N) + N) % N;
    this.target += n * STEP;
    this.settled = false; this.showDesc();
  }
  select(i: number) {
    let d = i - this.sel; if (d > N / 2) d -= N; if (d < -N / 2) d += N;
    if (d) this.turn(d);
  }
  trigger() {
    const a = this.current, why = this.c.hive.can(a);
    this.showDesc();
    if (why && this.c.armed() !== a) {
      sfx('deny'); this.flash = 1.4; this.flashMsg = why.toUpperCase(); this.gauge.kick(-1.5);
      this.crt.classList.remove('err'); void this.crt.offsetWidth; this.crt.classList.add('err');
      return;
    }
    sfx('click', 0.8, 1); sfx('hit', 0.5, 0.35);
    this.root.classList.remove('kick'); void this.root.offsetWidth; this.root.classList.add('kick');
    this.c.arm(a);
  }
  /** keyboard: returns true when the key belonged to the selector */
  key(k: string) {
    if (k === '[' || k === ',') { this.turn(-1); return true; }
    if (k === ']' || k === '.') { this.turn(1); return true; }
    if (k === 'Enter' || k === 'f') { this.trigger(); return true; }
    return false;
  }
  private onWheel(dy: number) {
    const now = performance.now();
    this.wheelAcc += dy;
    if (Math.abs(this.wheelAcc) < 30 && Math.abs(dy) < 30) return;
    if (now - this.wheelT < 70) { this.wheelAcc = 0; return; }
    this.wheelT = now;
    this.turn(this.wheelAcc > 0 ? 1 : -1); this.wheelAcc = 0;
  }
  private local(e: PointerEvent) { const r = this.cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * SZ, y: ((e.clientY - r.top) / r.height) * SZ }; }
  private chamberAt(x: number, y: number) {
    let best = -1, bd = 12.5;
    for (let i = 0; i < N; i++) { const a = this.ang - i * STEP, px = C + Math.sin(a) * R_CH, py = C - Math.cos(a) * R_CH, d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } }
    return best;
  }
  private down(e: PointerEvent) {
    e.stopPropagation();
    const { x, y } = this.local(e), d = Math.hypot(x - C, y - C);
    if (d > R_TOOTH + 1 || d < R_HAZ0 - 1) return;
    this.cv.setPointerCapture(e.pointerId);
    this.drag = { a0: Math.atan2(x - C, -(y - C)), ang0: this.ang, moved: false, x: e.clientX, y: e.clientY, id: e.pointerId };
    this.vel = 0;
  }
  private move(e: PointerEvent) {
    const { x, y } = this.local(e);
    this.ptr = { x, y };
    if (this.drag) {
      if (Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 4) this.drag.moved = true;
      if (!this.drag.moved) return;
      const a = Math.atan2(x - C, -(y - C));
      this.ang = this.drag.ang0 + wrap(a - this.drag.a0);
      this.drag.a0 = a; this.drag.ang0 = this.ang;
      this.target = this.ang; this.dirty = true; this.settled = false;
      this.showDesc();
      return;
    }
    const h = Math.hypot(x - C, y - C) < R_KNURL ? this.chamberAt(x, y) : -1;
    if (h !== this.hover) {
      this.hover = h; this.dirty = true;
      if (h >= 0) { sfx('hover'); this.showDesc(h); }
    }
  }
  private up(e: PointerEvent) {
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.moved) { this.snap(); return; }
    const { x, y } = this.local(e), i = this.chamberAt(x, y);
    if (i < 0) return;
    if (i === this.sel) this.trigger(); else { this.select(i); sfx('click', 1, 0.5); }
  }
  /** after a drag: settle into the nearest detent */
  private snap() {
    const k = Math.round(this.ang / STEP);
    this.target = k * STEP;
    this.sel = ((k % N) + N) % N;
    this.settled = false; this.showDesc();
  }
  private showDesc(i = -1) {
    const a = ORDER[i >= 0 ? i : this.sel];
    this.descT = 4.5;
    if (this.descShown !== a) { this.descShown = a; this.typed = 0; }
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    this.t += dt;
    const h = this.c.hive, armed = this.c.armed();
    // a number key or the command card armed something: swing the dial round to it
    if (armed !== this.lastArmed) { this.lastArmed = armed; if (armed && armed !== this.current && !this.drag) { const i = ORDER.indexOf(armed); let d = i - this.sel; if (d > N / 2) d -= N; if (d < -N / 2) d += N; this.sel = i; this.target += d * STEP; this.settled = false; this.showDesc(); } }
    // spring into the detent, a little overshoot for weight
    if (!this.drag) {
      const k = 260, damp = 21;
      this.vel += (k * (this.target - this.ang) - damp * this.vel) * dt;
      this.ang += this.vel * dt;
      if (Math.abs(this.target - this.ang) < 0.0015 && Math.abs(this.vel) < 0.01) { this.ang = this.target; this.vel = 0; if (!this.settled) { this.settled = true; sfx('hit', 0.45, 0.22); } }
    }
    // ratchet: every tooth that passes the pawl clicks it
    const det = Math.floor(this.ang / (STEP / 2) + 0.5);
    if (det !== this.lastDet) {
      const n = Math.min(3, Math.abs(det - this.lastDet)); this.lastDet = det;
      sfx('crack', 0.3, 0.16 + n * 0.04); sfx('qte-tick', 1, 0.5);
      this.pawl.classList.remove('kick'); void this.pawl.offsetWidth; this.pawl.classList.add('kick');
    }
    if (Math.abs(this.ang - this.drawnAng) > 0.0008) {
      this.dirty = true;
      if (this.ptr && !this.drag) this.hover = Math.hypot(this.ptr.x - C, this.ptr.y - C) < R_KNURL ? this.chamberAt(this.ptr.x, this.ptr.y) : -1;
    }
    // states for lamps / shutters
    const st = ORDER.map((a) => {
      const d = ABILITIES[a];
      const cd = h.cooldowns[a] ?? 0;
      return d.em > h.emLevel ? 'L' : cd > 0 ? 'C' + Math.ceil((cd / d.cd) * 24) : h.res.charge < d.charge || h.res.bio < d.bio ? 'P' : 'R';
    }).join('|') + (armed ?? '') + this.hover;
    const blinks = !!armed || ORDER.some((a) => (h.cooldowns[a] ?? 0) > 0);
    const st2 = st + (blinks ? Math.floor(this.t * 2.5) % 2 : '');
    if (st2 !== this.stateKey) { this.stateKey = st2; this.dirty = true; }
    if (this.dirty) { this.render(armed); this.dirty = false; this.drawnAng = this.ang; }
    // fire button state
    const a = this.current, why = h.can(a);
    this.fire.dataset.st = armed === a ? 'armed' : why ? 'dead' : 'idle';
    this.armLamp.set(armed ? 'blink' : why ? 'off' : 'dim', armed ? 'a' : 'r');
    for (const [i, t] of this.tubes.entries()) t.dataset.st = armed ? 'hot' : this.settled ? (i ? 'warm' : 'hot') : 'warm';
    // charge meter, with the cost of the selected power marked on the rim
    const cap = 60 + h.emLevel * 40, d = ABILITIES[a];
    this.gauge.set(h.res.charge / cap); this.gauge.marks = d.charge ? [d.charge / cap] : [];
    this.gauge.red = h.res.charge < d.charge;
    this.gauge.update(dt);
    // CRT name + cost
    this.flash = Math.max(0, this.flash - dt);
    const shown = this.hover >= 0 && !this.drag ? ORDER[this.hover] : this.drag ? ORDER[(((Math.round(this.ang / STEP)) % N) + N) % N] : a;
    const sd = ABILITIES[shown];
    const nm = `${sd.key} ${sd.name.toUpperCase()}`;
    if (this.nameEl.textContent !== nm) { this.nameEl.textContent = nm; this.crt.classList.remove('roll'); void this.crt.offsetWidth; this.crt.classList.add('roll'); }
    const cost = this.flash > 0 ? `<span class="bad">${this.flashMsg}</span>` : armed === shown ? '<span class="arm">ARMED &middot; CLICK TARGET</span>' : this.costLine(shown);
    if (this.costEl.innerHTML !== cost) this.costEl.innerHTML = cost;
    // the readout tray
    this.descT -= dt;
    const open = this.descT > 0 || !!this.drag || this.hover >= 0;
    this.desc.classList.toggle('open', open);
    if (open) {
      const ab = ABILITIES[this.descShown as Ability] ?? sd;
      const body = ab.desc.replace(/<[^>]+>/g, '');
      this.typed = Math.min(body.length, this.typed + dt * 160);
      const why2 = h.can(this.descShown as Ability);
      const txt = body.slice(0, Math.floor(this.typed));
      const html = `<div class="dt-h">&gt; ${ab.name.toUpperCase()}</div><div class="dt-b">${txt}${this.typed < body.length ? '<span class="cur">&#9608;</span>' : ''}</div>` +
        `<div class="dt-f">${why2 ? `<span class="bad">&#9650; ${why2.toUpperCase()}</span>` : '<span>READY</span>'} &middot; KEY ${ab.key} &middot; CD ${ab.cd}S</div>`;
      if (this.descTxt.innerHTML !== html) this.descTxt.innerHTML = html;
    }
  }
  private costLine(a: Ability) {
    const d = ABILITIES[a], h = this.c.hive, cd = h.cooldowns[a] ?? 0;
    if (d.em > h.emLevel) return `<span class="bad">LOCKED &middot; FIELD LV ${d.em}</span>`;
    const c = d.charge ? `<span class="${h.res.charge < d.charge ? 'bad' : ''}">${d.charge} CHG</span>` : '';
    const b = d.bio ? `<span class="${h.res.bio < d.bio ? 'bad' : ''}">${d.bio} BIO</span>` : '';
    const r = cd > 0 ? `<span class="wait">RECHARGE ${cd.toFixed(1)}S</span>` : `CD ${d.cd}S`;
    return [c, b, r].filter(Boolean).join(' &middot; ');
  }

  // ------------------------------------------------------------------ the pixels
  private render(armed: Ability | null) {
    const { r: RR, th: TH, scratch, lit: LIT, face: FACE } = pre!, D = this.img.data, ang = this.ang, h = this.c.hive;
    const cosA = Math.cos(-ang), sinA = Math.sin(-ang);
    const put = (i: number, c: number) => { D[i * 4] = (c >> 16) & 255; D[i * 4 + 1] = (c >> 8) & 255; D[i * 4 + 2] = c & 255; D[i * 4 + 3] = 255; };
    for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
      const i = y * SZ + x, r = RR[i], th = TH[i];
      if (r > R_TOOTH + 0.5) { D[i * 4 + 3] = 0; continue; }
      const phi = th - ang; // angle in disc space
      const rimLit = LIT[i]; // -1..1, + facing the light
      // ratchet teeth: a sawtooth profile around the outside
      if (r > R_ROOT) {
        const uu = (((phi / (Math.PI * 2)) * TEETH) % 1 + 1) % 1;
        const top = R_ROOT + (R_TOOTH - R_ROOT) * (1 - uu);
        if (r > top + 0.5) { D[i * 4 + 3] = 0; continue; }
        const flank = uu > 0.9 || r > top - 0.6;
        put(i, flank ? (rimLit > 0.1 ? GM[9] : INK) : dv(GM, 5.6 + rimLit * 2.6, x, y));
        continue;
      }
      if (r > R_ROOT - 0.8) { put(i, INK); continue; }
      // knurled grip band
      if (r > R_KNURL) {
        const k = Math.floor(((phi / (Math.PI * 2)) * 72 % 1 + 1) % 1 * 3);
        const band = (r - R_KNURL) / (R_ROOT - R_KNURL);
        const v = 5.2 + rimLit * (2.2 + band) + (k === 0 ? 1.3 : k === 1 ? 0 : -1.3) + (band > 0.8 ? 1.6 * rimLit : 0);
        put(i, dv(GM, v, x, y)); continue;
      }
      if (r > R_KNURL - 0.8) { put(i, rimLit > 0 ? GM[2] : GM[7]); continue; }
      // hazard ring around the hub: diagonal paint stripes that turn with the disc
      if (r > R_HAZ0 && r < R_HAZ1) {
        const s = ((phi * 21 + (r - R_HAZ0) * 1.3) % 10 + 10) % 10;
        const yel = s < 5;
        const edge = r < R_HAZ0 + 0.9 || r > R_HAZ1 - 0.9;
        const sx = Math.round(C + (x + 0.5 - C) * cosA - (y + 0.5 - C) * sinA - 0.5), sy = Math.round(C + (x + 0.5 - C) * sinA + (y + 0.5 - C) * cosA - 0.5);
        const worn = sx >= 0 && sy >= 0 && sx < SZ && sy < SZ && hashf(sx, sy, 3) < 0.08;
        put(i, edge ? INK : worn ? GM[5] : yel ? (rimLit > 0.3 ? HZ.yl : rimLit < -0.4 ? HZ.yd : HZ.y) : HZ.k);
        continue;
      }
      let v = FACE[i];
      // scratches belong to the disc: sample them rotated
      const sx = Math.round(C + (x + 0.5 - C) * cosA - (y + 0.5 - C) * sinA - 0.5), sy = Math.round(C + (x + 0.5 - C) * sinA + (y + 0.5 - C) * cosA - 0.5);
      if (sx >= 0 && sy >= 0 && sx < SZ && sy < SZ && scratch[sy * SZ + sx]) v += scratch[sy * SZ + sx] === 2 ? 1.6 : 0.9;
      // engraved spokes between the chambers
      const between = wrap(phi + STEP / 2 - Math.round((phi + STEP / 2) / STEP) * STEP);
      if (r > 25 && r < 51 && Math.abs(between * r) < 0.55) v = 1.4;
      else if (r > 25 && r < 51 && Math.abs((between) * r - 1) < 0.5) v += 1.4;
      put(i, dv(GM, v, x, y));
    }
    this.g.putImageData(this.img, 0, 0);
    // chambers, icons, lamps and numerals: upright sprites riding the disc
    const g = this.g;
    for (let i = 0; i < N; i++) {
      const a = ang - i * STEP, cx = C + Math.sin(a) * R_CH, cy = C - Math.cos(a) * R_CH;
      const top = Math.abs(wrap(a)) < STEP * 0.3;
      const ab = ORDER[i], d = ABILITIES[ab], cd = h.cooldowns[ab] ?? 0;
      const locked = d.em > h.emLevel, poor = h.res.charge < d.charge || h.res.bio < d.bio;
      const ch = chamber(top && !locked);
      const X = Math.round(cx - 12.5), Y = Math.round(cy - 12.5);
      drawPix(g, ch, X, Y);
      const ic = this.icons[i];
      if (locked) g.drawImage(ic.d, X + 4, Y + 4);
      else if (poor) { g.globalAlpha = 0.5; g.drawImage(ic.n, X + 4, Y + 4); g.globalAlpha = 1; }
      else g.drawImage(ic.n, X + 4, Y + 4);
      if (locked) { // padlock grate across the bore
        g.fillStyle = hex(GM[2]); for (let k = 0; k < 4; k++) g.fillRect(X + 6, Y + 7 + k * 3, 13, 1);
        g.fillStyle = hex(GM[6]); for (let k = 0; k < 4; k++) g.fillRect(X + 6, Y + 8 + k * 3, 13, 1);
      }
      if (cd > 0) { // recharge shutter: a dark sweep that opens clockwise
        const f = cd / d.cd;
        g.save(); g.beginPath(); g.moveTo(X + 12.5, Y + 12.5); g.arc(X + 12.5, Y + 12.5, 9, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); g.closePath(); g.clip();
        g.fillStyle = 'rgba(4,8,6,0.72)'; g.fillRect(X, Y, 25, 25); g.restore();
      }
      // status lamp just outside the chamber
      const lx = Math.round(C + Math.sin(a) * R_LAMP - 1.5), ly = Math.round(C - Math.cos(a) * R_LAMP - 1.5);
      const blink = Math.floor(this.t * 2.5) % 2 === 0;
      const lc = locked ? [GM[2], GM[3]] : cd > 0 ? (blink ? [AM[4], AM[6]] : [AM[2], AM[3]]) : poor ? [RD[4], RD[6]] : [PH[6], PH[8]];
      g.fillStyle = hex(INK); g.fillRect(lx - 1, ly - 1, 5, 5);
      g.fillStyle = hex(lc[0]); g.fillRect(lx, ly, 3, 3); g.fillStyle = hex(lc[1]); g.fillRect(lx, ly, 2, 1); g.fillRect(lx, ly, 1, 2);
      // hotkey numeral, stencilled at the top-left of the bore
      const np = numPix(d.key, top ? AM[6] : CR[3]);
      drawPix(g, np, X + 3, Y + 2);
      // hover / armed rings
      if (i === this.hover && !top) ring(g, cx, cy, 12.6, PH[7]);
      if (top && armed === ab && blink) ring(g, cx, cy, 12.6, AM[6]);
      else if (top && !locked && this.settled) ring(g, cx, cy, 12.6, poor ? RD[5] : PH[7]);
    }
  }
}

// ------------------------------------------------------------------ helpers
function toCanvas(pc: { w: number; h: number; toImageData(): ImageData }) { const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h; c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0); return c; }
const pixCache = new WeakMap<Pix, HTMLCanvasElement>();
function drawPix(g: CanvasRenderingContext2D, p: Pix, x: number, y: number) { let c = pixCache.get(p); if (!c) { c = p.canvas(); pixCache.set(p, c); } g.drawImage(c, x, y); }
const numCache = new Map<string, Pix>();
function numPix(s: string, col: number) { const k = s + col; let p = numCache.get(k); if (!p) { p = new Pix(5, 7); text(p, s, 1, 1, col, 'shadow'); numCache.set(k, p); } return p; }
function ring(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, col: number) {
  g.fillStyle = hex(col);
  for (let k = 0; k < 72; k++) { const a = (k / 72) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(a) * r - 0.5), Math.round(cy + Math.sin(a) * r - 0.5), 1, 1); }
}
void CR;
