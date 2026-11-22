// UI KIT · JUICE. The feel library: springs and tweens, squash and stretch on press, pops, shakes, counters that roll
// digit by digit, pixel particle bursts, and the placement dust: when anything is put down, a puff of dust scaled by
// its weight and a little bounce. Every effect is pixel art (2 x 2 px blocks from the master ramps, dithered fades),
// never soft blurry sprites. For other agents:
//   ease.outBack / outElastic / outCubic / inOutCubic / outBounce       easing curves (t 0..1)
//   tween(ms, (k) => ..., ease?) -> Promise                             a tween on the frame clock
//   new Spring(value, { k, d })  .target / .step(dt) / .v              a damped spring
//   squash(el, k?)  pop(el, k?)  shake(el, amp?, ms?)  wobble(el)       DOM element reactions
//   screenShake(amp, ms)                                                shake the whole view (#view + #ui)
//   new Counter(el, { size, pad, sound })  .set(n) / .value             a rolling number in Alagard
//   burst(x, y, { n, ramp, speed, life, size, gravity, layer })         a pixel particle burst at a screen point
//   placeDust(x, y, weight, { ground, layer })                          dust puff + pebbles + thud, scaled by weight
//   placeDustWorld(pos, camera, weight, o)                              the same at a 3D point
//   bounce3(obj, weight)  -> Promise                                    drop-and-bounce a placed 3D object
//   bounceEl(el, weight)                                                the same for a DOM element
//   floatUp(x, y, text, { color, size })                               a number or word rising and fading
import * as THREE from 'three';
import { P, bayer, type Ramp } from './px';
import { thudSfx, uiSfx } from './sound';

// ------------------------------------------------------------------ easing
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outQuint: (t: number) => 1 - (1 - t) ** 5,
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  inBack: (t: number) => { const c1 = 1.70158; return (c1 + 1) * t ** 3 - c1 * t ** 2; },
  outElastic: (t: number) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t: number) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
};
export type Ease = (t: number) => number;
const reduce = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ the frame clock
type Tick = (dt: number, t: number) => boolean | void;
const ticks = new Set<Tick>();
let raf = 0, lastT = 0, clockT = 0;
function loop(now: number) {
  raf = 0;
  const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now; clockT += dt;
  for (const f of [...ticks]) { let more: boolean | void = false; try { more = f(dt, clockT); } catch (e) { console.error(e); } if (more === false) ticks.delete(f); }
  if (ticks.size) raf = requestAnimationFrame(loop);
}
/** run f(dt, t) every frame until it returns false */
export function onFrame(f: Tick) { ticks.add(f); if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(loop); } return () => ticks.delete(f); }
/** a tween: f(k) with k eased 0..1 over ms */
export function tween(ms: number, f: (k: number, raw: number) => void, e: Ease = ease.outCubic): Promise<void> {
  return new Promise((res) => {
    let t = 0;
    f(e(0), 0);
    onFrame((dt) => { t += dt * 1000; const r = Math.min(1, t / Math.max(1, ms)); f(e(r), r); if (r >= 1) { res(); return false; } return true; });
  });
}
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** a damped spring (critically damped-ish by default; lower d for overshoot) */
export class Spring {
  v = 0; target: number;
  constructor(public x: number, public o: { k?: number; d?: number } = {}) { this.target = x; }
  step(dt: number) {
    const k = this.o.k ?? 170, d = this.o.d ?? 14;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
    for (let i = 0; i < steps; i++) { this.v += (k * (this.target - this.x) - d * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
  get settled() { return Math.abs(this.target - this.x) < 0.001 && Math.abs(this.v) < 0.01; }
  snap(x: number) { this.x = this.target = x; this.v = 0; }
  kick(v: number) { this.v += v; }
}

// ------------------------------------------------------------------ DOM reactions (Web Animations, transform only)
/** squash and stretch: pressed flat, then springs tall and settles (origin: its foot) */
export function squash(el: HTMLElement, k = 1) {
  if (reduce()) return;
  el.style.transformOrigin ||= '50% 100%';
  el.animate([
    { transform: 'scale(1, 1)' },
    { transform: `scale(${1 + 0.2 * k}, ${1 - 0.22 * k})`, offset: 0.18 },
    { transform: `scale(${1 - 0.1 * k}, ${1 + 0.14 * k})`, offset: 0.45 },
    { transform: `scale(${1 + 0.04 * k}, ${1 - 0.04 * k})`, offset: 0.7 },
    { transform: 'scale(1, 1)' },
  ], { duration: 420, easing: 'linear', composite: 'add' });
}
/** a pop: grows past its size, rocks and settles (a new badge, a count that went up) */
export function pop(el: HTMLElement, k = 1) {
  if (reduce()) return;
  el.animate([
    { transform: 'scale(1) rotate(0deg)' },
    { transform: `scale(${1 + 0.35 * k}) rotate(${-8 * k}deg)`, offset: 0.25 },
    { transform: `scale(${1 - 0.08 * k}) rotate(${4 * k}deg)`, offset: 0.55 },
    { transform: 'scale(1) rotate(0deg)' },
  ], { duration: 460, easing: 'ease-out', composite: 'add' });
}
/** a decaying shake (an error, a refusal) */
export function shake(el: HTMLElement, amp = 4, ms = 320) {
  if (reduce()) return;
  const f: Keyframe[] = []; const n = 7;
  for (let i = 0; i <= n; i++) { const a = amp * (1 - i / n) * (i % 2 ? -1 : 1); f.push({ transform: `translate(${Math.round(a)}px, ${Math.round(a * 0.25)}px)` }); }
  el.animate(f, { duration: ms, easing: 'linear', composite: 'add' });
}
/** a slow wobble (attention) */
export function wobble(el: HTMLElement) {
  if (reduce()) return;
  el.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-3deg)' }, { transform: 'rotate(0)' }], { duration: 600, easing: 'ease-in-out', composite: 'add' });
}
/** shake the whole view (#view and #ui together); amp in px */
export function screenShake(amp = 6, ms = 300) {
  if (reduce()) return;
  for (const id of ['view', 'ui']) {
    const el = document.getElementById(id); if (!el) continue;
    const f: Keyframe[] = []; const n = 9;
    for (let i = 0; i <= n; i++) { const a = amp * (1 - i / n) ** 1.5; f.push({ transform: `translate(${Math.round((Math.random() - 0.5) * 2 * a)}px, ${Math.round((Math.random() - 0.5) * 2 * a)}px)` }); }
    f[n] = { transform: 'translate(0,0)' };
    el.animate(f, { duration: ms, easing: 'linear' });
  }
}
/** bounce a DOM element as if dropped there: falls in, squashes by its weight, rebounds */
export function bounceEl(el: HTMLElement, weight = 0.5) {
  if (reduce()) return;
  const w = Math.max(0, Math.min(1, weight)), h = 18 + 10 * (1 - w), sq = 0.12 + 0.22 * w;
  el.style.transformOrigin ||= '50% 100%';
  el.animate([
    { transform: `translateY(${-h}px) scale(0.94, 1.08)`, easing: 'cubic-bezier(.5,0,1,.6)' },
    { transform: `translateY(0) scale(${1 + sq}, ${1 - sq})`, offset: 0.32 },
    { transform: `translateY(${-h * 0.28}px) scale(0.96, 1.05)`, offset: 0.55, easing: 'cubic-bezier(.5,0,1,.6)' },
    { transform: `translateY(0) scale(${1 + sq * 0.4}, ${1 - sq * 0.4})`, offset: 0.75 },
    { transform: 'translateY(0) scale(1, 1)' },
  ], { duration: 520 + w * 160, composite: 'add' });
}

// ------------------------------------------------------------------ the rolling counter
/** a number that rolls digit by digit (each digit a column that slides on a spring, whole pixels) */
export class Counter {
  readonly el: HTMLSpanElement;
  private cols: { el: HTMLSpanElement; strip: HTMLSpanElement; s: Spring }[] = [];
  private v = 0; private live = false;
  constructor(host: HTMLElement, readonly o: { size?: 16 | 32 | 48; pad?: number; sound?: boolean; color?: string; fmt?: (n: number) => string } = {}) {
    this.el = document.createElement('span');
    this.el.className = `k7-count k7-t${o.size ?? 32}`;
    if (o.color) this.el.style.color = o.color;
    host.append(this.el);
    this.render(0, true);
  }
  get value() { return this.v; }
  private text(n: number) { const f = this.o.fmt ? this.o.fmt(n) : String(Math.max(0, Math.round(n))); return this.o.pad ? f.padStart(this.o.pad, '0') : f; }
  set(n: number, instant = false) {
    if (n === this.v && !instant) return;
    const up = n > this.v; this.v = n; this.render(n, instant);
    if (!instant) { this.el.classList.toggle('dn', !up); if (this.o.sound !== false) uiSfx('tick', 0.3, up ? 1.2 : 0.9); }
  }
  private render(n: number, instant: boolean) {
    const s = this.text(n), lh = (this.o.size ?? 32) === 16 ? 20 : (this.o.size ?? 32) === 32 ? 38 : 54;
    // one column per character, rebuilt only when the length changes
    if (this.cols.length !== s.length) {
      this.el.innerHTML = ''; this.cols = [];
      for (let i = 0; i < s.length; i++) {
        const c = document.createElement('span'); c.className = 'k7-col';
        const strip = document.createElement('span'); strip.className = 'k7-strip';
        strip.innerHTML = '0123456789'.split('').map((d) => `<i>${d}</i>`).join('') + '<i>.</i><i>k</i><i>M</i><i>-</i><i>+</i><i> </i>';
        c.append(strip); this.el.append(c);
        this.cols.push({ el: c, strip, s: new Spring(0, { k: 260, d: 19 }) });
      }
      instant = true;
    }
    const idx = (ch: string) => { const i = '0123456789.kM-+ '.indexOf(ch); return i < 0 ? 15 : i; };
    const size = this.o.size ?? 32, pad = size / 16;
    s.split('').forEach((ch, i) => { const col = this.cols[i]; col.s.target = idx(ch); if (instant) col.s.snap(idx(ch)); col.el.style.width = Math.round(glyphW(ch, size) + pad * 2) + 'px'; });
    const place = () => { for (const c of this.cols) c.strip.style.transform = `translateY(${-Math.round(c.s.x * lh)}px)`; };
    place();
    if (!this.live && !instant) {
      this.live = true;
      onFrame((dt) => { let moving = false; for (const c of this.cols) { c.s.step(dt); if (!c.s.settled) moving = true; else c.s.snap(c.s.target); } place(); if (!moving) this.live = false; return moving; });
    }
  }
}

let mcv: CanvasRenderingContext2D | null = null;
const gw = new Map<string, number>();
/** the advance of one Alagard glyph at a size (px) */
function glyphW(ch: string, size: number) { const k = ch + size; let w = gw.get(k); if (w === undefined) { mcv ??= document.createElement('canvas').getContext('2d'); mcv!.font = `${size}px Alagard`; w = Math.round(mcv!.measureText(ch).width); if (document.fonts?.check?.(`${size}px Alagard`)) gw.set(k, w); } return w; }

// ------------------------------------------------------------------ the pixel particle layers
interface Part { x: number; y: number; vx: number; vy: number; g: number; life: number; age: number; size: number; ramp: Ramp; kind: 'dust' | 'chip' | 'spark' | 'ring'; floor: number; drag: number; grow: number; bounced?: boolean }
interface Layer { cv: HTMLCanvasElement; c: CanvasRenderingContext2D; parts: Part[]; on: boolean }
const layers: Record<'world' | 'ui', Layer | null> = { world: null, ui: null };
const SC = 2; // one art pixel = 2 screen pixels
function layer(which: 'world' | 'ui'): Layer {
  let L = layers[which];
  if (L && L.cv.isConnected) return L;
  const cv = document.createElement('canvas');
  cv.className = 'k7-fx k7-fx-' + which;
  cv.style.cssText = `position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;image-rendering:pixelated;z-index:${which === 'world' ? 1 : 9000}`;
  document.body.append(cv);
  const c = cv.getContext('2d')!;
  L = layers[which] = { cv, c, parts: [], on: false };
  return L;
}
function runLayer(L: Layer) {
  if (L.on) return;
  L.on = true;
  onFrame((dt) => {
    const W = Math.ceil(innerWidth / SC), H = Math.ceil(innerHeight / SC);
    if (L.cv.width !== W || L.cv.height !== H) { L.cv.width = W; L.cv.height = H; }
    const c = L.c; c.clearRect(0, 0, W, H);
    for (const p of L.parts) {
      p.age += dt;
      p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt);
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.size += p.grow * dt;
      if (p.kind === 'chip' && p.y > p.floor) { if (!p.bounced && p.vy > 30) { p.vy *= -0.35; p.vx *= 0.6; p.bounced = true; p.y = p.floor; } else { p.y = p.floor; p.vy = 0; p.vx *= 0.8; } }
      const k = p.age / p.life; if (k >= 1) continue;
      const r = p.ramp, n = r.length;
      if (p.kind === 'dust') {
        // a dithered pixel puff: lit on its upper-left, thinning out with age
        const R0 = Math.max(1, p.size), thin = k * 1.1;
        for (let y = -Math.ceil(R0); y <= R0; y++) for (let x = -Math.ceil(R0); x <= R0; x++) {
          const d = Math.hypot(x, y * 1.15) / R0; if (d > 1) continue;
          const X = Math.round(p.x / SC) + x, Y = Math.round(p.y / SC) + y;
          if (bayer(X, Y) < thin + d * 0.35) continue;
          const lit = -(x * 0.6 + y * 0.8) / (R0 || 1);
          c.fillStyle = hexs(r[Math.max(0, Math.min(n - 1, Math.round(n * 0.55 + lit * 1.8 - k * 1.5)))]);
          c.fillRect(X, Y, 1, 1);
        }
      } else if (p.kind === 'ring') {
        const R0 = p.size; c.fillStyle = hexs(r[n - 1]);
        const N = Math.max(12, Math.round(R0 * 5));
        for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; if (bayer(i, 3) < k) continue; c.fillRect(Math.round(p.x / SC + Math.cos(a) * R0), Math.round(p.y / SC + Math.sin(a) * R0 * 0.45), 1, 1); }
      } else {
        const s = Math.max(1, Math.round(p.size * (p.kind === 'spark' ? 1 - k : 1)));
        if (p.kind === 'spark' && bayer(Math.round(p.x), Math.round(p.y)) < k * 0.8) continue;
        const X = Math.round(p.x / SC), Y = Math.round(p.y / SC);
        c.fillStyle = '#08090c'; c.fillRect(X - 1, Y - 1, s + 2, s + 2);
        c.fillStyle = hexs(r[Math.max(0, n - 2)]); c.fillRect(X, Y, s, s);
        c.fillStyle = hexs(r[n - 1]); c.fillRect(X, Y, 1, 1);
      }
    }
    L.parts = L.parts.filter((p) => p.age < p.life);
    if (!L.parts.length) { c.clearRect(0, 0, W, H); L.on = false; return false; }
    return true;
  });
}
const hexCache = new Map<number, string>();
const hexs = (c: number) => { let s = hexCache.get(c); if (!s) { s = '#' + c.toString(16).padStart(6, '0'); hexCache.set(c, s); } return s; };

export interface BurstOpts { n?: number; ramp?: Ramp; speed?: number; life?: number; size?: number; gravity?: number; layer?: 'world' | 'ui'; kind?: 'spark' | 'chip' | 'dust'; up?: number; spread?: number }
/** a pixel particle burst at a screen point */
export function burst(x: number, y: number, o: BurstOpts = {}) {
  if (reduce()) return;
  const L = layer(o.layer ?? 'ui'), n = o.n ?? 16, sp = o.speed ?? 220, ramp = o.ramp ?? P.glowAmber;
  for (let i = 0; i < n; i++) {
    const a = (o.up !== undefined ? -Math.PI / 2 + (Math.random() - 0.5) * (o.spread ?? 1.6) : Math.random() * Math.PI * 2), v = sp * (0.4 + Math.random() * 0.8);
    L.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 0), g: o.gravity ?? 520, life: (o.life ?? 0.6) * (0.6 + Math.random() * 0.6), age: 0, size: o.size ?? 1 + Math.floor(Math.random() * 2), ramp, kind: o.kind ?? 'spark', floor: 1e9, drag: 2.2, grow: o.kind === 'dust' ? 6 : 0 });
  }
  runLayer(L);
}
const GROUND: Record<string, Ramp> = { dirt: P.soil, sand: P.sand, stone: P.stone, snow: P.snow, ash: P.basalt, moss: P.moss, metal: P.steel, clay: P.clay };

/**
 * the placement dust: a ring of dust puffs rolling out along the ground (flattened into the view), a few pebbles kicked
 * up that bounce once, a faint shock ring and the thud. Weight 0 (a seed) .. 1 (a building); a heavy one shakes the view.
 */
export function placeDust(x: number, y: number, weight = 0.5, o: { ground?: keyof typeof GROUND | Ramp; layer?: 'world' | 'ui'; sound?: boolean; scale?: number } = {}) {
  const w = Math.max(0, Math.min(1, weight)), sc = o.scale ?? 1;
  if (o.sound !== false) thudSfx(w, typeof o.ground === 'string' && o.ground === 'metal' ? 'metal' : w > 0.6 ? 'gravel' : 'dirt');
  if (reduce()) return;
  const L = layer(o.layer ?? 'world'), ramp = (typeof o.ground === 'string' ? GROUND[o.ground] : o.ground) ?? P.sand;
  const n = Math.round(8 + w * 22), R0 = (14 + w * 46) * sc, sp = (70 + w * 170) * sc;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, v = sp * (0.55 + Math.random() * 0.6);
    L.parts.push({ x: x + Math.cos(a) * R0 * 0.25, y: y + Math.sin(a) * R0 * 0.12, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.42 - 14 * (1 + w), g: -24, life: 0.55 + w * 0.65 + Math.random() * 0.3, age: 0, size: (1.5 + w * 3.2 + Math.random() * 1.5) * sc, ramp, kind: 'dust', floor: 1e9, drag: 3.4, grow: (2 + w * 4) * sc });
  }
  // a few dust columns rising behind for the heavy ones
  for (let i = 0; i < Math.round(w * 5); i++) L.parts.push({ x: x + (Math.random() - 0.5) * R0 * 0.8, y: y - 2, vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 40 * w, g: 0, life: 0.8 + Math.random() * 0.5, age: 0, size: (3 + w * 3) * sc, ramp, kind: 'dust', floor: 1e9, drag: 1.5, grow: 4 * sc });
  // pebbles
  const nc = Math.round(2 + w * 9);
  for (let i = 0; i < nc; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = (110 + w * 200) * (0.5 + Math.random() * 0.7) * sc;
    L.parts.push({ x, y: y - 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, life: 0.7 + Math.random() * 0.4, age: 0, size: Math.random() < 0.3 + w * 0.3 ? 2 : 1, ramp: P.stone, kind: 'chip', floor: y + (Math.random() - 0.3) * 10 * sc, drag: 0.6, grow: 0 });
  }
  L.parts.push({ x, y, vx: 0, vy: 0, g: 0, life: 0.35 + w * 0.2, age: 0, size: 4 * sc, ramp: P.paper, kind: 'ring', floor: 1e9, drag: 0, grow: (60 + w * 90) * sc / SC });
  runLayer(L);
  if (w >= 0.7) screenShake(2 + (w - 0.7) * 14, 220 + w * 120);
}
const _v = new THREE.Vector3();
/** placeDust at a 3D point (the canvas is assumed to fill the window) */
export function placeDustWorld(pos: THREE.Vector3, camera: THREE.Camera, weight = 0.5, o: Parameters<typeof placeDust>[3] = {}) {
  _v.copy(pos).project(camera);
  if (_v.z > 1) return;
  placeDust((_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, weight, o);
}
/**
 * drop-and-bounce a just-placed 3D object: it falls a little, squashes by its weight on landing (feet stay planted),
 * rebounds once and settles. Optional `dust` fires placeDustWorld at the landing.
 */
export function bounce3(obj: THREE.Object3D, weight = 0.5, o: { camera?: THREE.Camera; dust?: boolean; drop?: number; ground?: Parameters<typeof placeDust>[3] extends infer Q ? Q extends { ground?: infer G } ? G : never : never } = {}): Promise<void> {
  const w = Math.max(0, Math.min(1, weight)), y0 = obj.position.y, s0 = obj.scale.clone(), drop = o.drop ?? 0.6 + (1 - w) * 0.5;
  if (reduce()) { if (o.dust && o.camera) placeDustWorld(obj.position, o.camera, w, { ground: o.ground }); return Promise.resolve(); }
  let landed = false;
  const sq = 0.1 + 0.2 * w;
  return tween(560 + w * 200, (_k, t) => {
    let dy = 0, sx = 1, sy = 1;
    if (t < 0.3) { const u = t / 0.3; dy = drop * (1 - u * u); sx = 0.95; sy = 1.07; }
    else if (t < 0.45) { const u = (t - 0.3) / 0.15; sx = 1 + sq * Math.sin(u * Math.PI); sy = 1 - sq * Math.sin(u * Math.PI); if (!landed) { landed = true; if (o.dust && o.camera) placeDustWorld(obj.position, o.camera, w, { ground: o.ground }); } }
    else if (t < 0.7) { const u = (t - 0.45) / 0.25; dy = drop * 0.18 * (1 - w * 0.6) * Math.sin(u * Math.PI); sx = 0.97; sy = 1.03; }
    else { const u = (t - 0.7) / 0.3; sx = 1 + sq * 0.35 * Math.sin(u * Math.PI) * (1 - u); sy = 1 - sq * 0.35 * Math.sin(u * Math.PI) * (1 - u); }
    obj.position.y = y0 + dy; obj.scale.set(s0.x * sx, s0.y * sy, s0.z * sx);
  }, ease.linear).then(() => { obj.position.y = y0; obj.scale.copy(s0); });
}

/** a number or short word rising and fading at a screen point (Alagard, outlined) */
export function floatUp(x: number, y: number, text: string, o: { color?: string; size?: 16 | 32 } = {}) {
  const e = document.createElement('div');
  e.className = `k7-float k7-t${o.size ?? 32}`;
  e.textContent = text;
  if (o.color) e.style.color = o.color;
  e.style.left = Math.round(x) + 'px'; e.style.top = Math.round(y) + 'px';
  document.body.append(e);
  void tween(900, (k) => { e.style.transform = `translate(-50%, ${Math.round(-k * 40)}px)`; e.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3); }, ease.outCubic).then(() => e.remove());
}
