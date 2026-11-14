// Cutscenes. A scene is an async script run against a Cinema: it moves a camera rig (cuts, dollies, cranes, orbits,
// tracking shots, look-at with easing, handheld sway and impact shake), drives actors through per-frame tasks,
// shows subtitles (radio CRT, newsreel film strip, journal page), title cards and typed location stamps, fades,
// flashes and letterbox bars, and plays sound cues. While a scene runs, gameplay input is swallowed at the window
// (Esc skips, a double tap skips) and the HUD is hidden (body.cine-on). Skipping resolves every pending wait at
// once, so a script runs straight through to its end state silently.
//
//   const cine = new Cinema({ enter: () => ..., exit: () => ... });
//   await cine.play(async (c) => {
//     c.cam.cut(new V3(0, 3, 10), new V3(0, 1, 0), 38);
//     c.fade(0, 1.2);
//     c.cam.move({ pos: new V3(2, 2, 6), dur: 4, ease: 'inOut' });
//     await c.say('Unit Seven, do you copy?', { who: 'Lt. Hollis', style: 'radio' });
//     await c.wait(1);
//   });
//   // every frame: cine.update(dt); cine.apply(camera)
import * as THREE from 'three';
import { CineUI, type SubStyle } from '../ui/cineUI';
import { csfx, cloop, cvoice, type CineSfx, type Loop } from '../ui/cineAudio';
import { settings } from '../settings';

export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'outBack' | 'inExpo' | 'outExpo' | 'inCubic' | 'outCubic';
export const EASE: Record<Ease, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};
const V3 = THREE.Vector3;

interface Chan<T> { from: T; to: T; t: number; dur: number; ease: (t: number) => number; done: () => void }
export interface Move { pos?: THREE.Vector3; look?: THREE.Vector3; fov?: number; roll?: number; dur: number; ease?: Ease; lookEase?: Ease }
export interface Orbit { center: THREE.Vector3; radius: number; height: number; from: number; to: number; dur: number; ease?: Ease; look?: THREE.Vector3; radiusTo?: number; heightTo?: number }

/** the camera rig: position, look target, fov and roll, each tweened on its own channel */
export class CineCam {
  readonly pos = new V3(0, 5, 10);
  readonly look = new V3();
  fov = 40; roll = 0;
  /** handheld sway amplitude (world units at the camera; 0 = locked off) */
  handheld = 0;
  private cp: Chan<THREE.Vector3> | null = null; private cl: Chan<THREE.Vector3> | null = null;
  private cf: Chan<number> | null = null; private cr: Chan<number> | null = null;
  private orb: (Orbit & { t: number; done: () => void }) | null = null;
  private trackFn: (() => { pos?: THREE.Vector3; look?: THREE.Vector3 } | null) | null = null; private trackK = 6;
  private shakeA = 0; private shakeT = 0; private t = 0;
  skipping = false;
  cut(pos: THREE.Vector3, look: THREE.Vector3, fov?: number) {
    this.finishAll();
    this.pos.copy(pos); this.look.copy(look); if (fov) this.fov = fov;
  }
  /** dolly / crane / pan / zoom: any of pos, look, fov, roll to new values over dur */
  move(o: Move): Promise<void> {
    const e = EASE[o.ease ?? 'inOut'], le = EASE[o.lookEase ?? o.ease ?? 'inOut'];
    this.orb?.done(); this.orb = null;
    const ps: Promise<void>[] = [];
    if (o.pos) { this.cp?.done(); ps.push(new Promise((r) => { this.cp = { from: this.pos.clone(), to: o.pos!.clone(), t: 0, dur: o.dur, ease: e, done: r }; })); }
    if (o.look) { this.cl?.done(); ps.push(new Promise((r) => { this.cl = { from: this.look.clone(), to: o.look!.clone(), t: 0, dur: o.dur, ease: le, done: r }; })); }
    if (o.fov !== undefined) { this.cf?.done(); ps.push(new Promise((r) => { this.cf = { from: this.fov, to: o.fov!, t: 0, dur: o.dur, ease: e, done: r }; })); }
    if (o.roll !== undefined) { this.cr?.done(); ps.push(new Promise((r) => { this.cr = { from: this.roll, to: o.roll!, t: 0, dur: o.dur, ease: e, done: r }; })); }
    if (this.skipping) this.finishAll();
    return Promise.all(ps).then(() => undefined);
  }
  /** circle a point (angles in radians around +y, 0 = +z side) */
  orbit(o: Orbit): Promise<void> {
    this.orb?.done(); this.cp?.done(); this.cp = null;
    const p = new Promise<void>((r) => { this.orb = { ...o, t: 0, done: r }; });
    this.applyOrbit(0);
    if (o.look === undefined) { this.cl?.done(); this.cl = null; this.look.copy(o.center); }
    if (this.skipping) this.finishAll();
    return p;
  }
  /** follow something every frame (null stops); k is the damping rate */
  track(fn: (() => { pos?: THREE.Vector3; look?: THREE.Vector3 } | null) | null, k = 6) { this.trackFn = fn; this.trackK = k; }
  shake(a: number, t = 0.4) { if (this.skipping || !settings.shake) return; this.shakeA = Math.max(this.shakeA, a); this.shakeT = Math.max(this.shakeT, t); }
  private applyOrbit(u: number) {
    const o = this.orb!; const e = EASE[o.ease ?? 'inOut'](u);
    const a = o.from + (o.to - o.from) * e, R = o.radius + ((o.radiusTo ?? o.radius) - o.radius) * e, H = o.height + ((o.heightTo ?? o.height) - o.height) * e;
    this.pos.set(o.center.x + Math.sin(a) * R, o.center.y + H, o.center.z + Math.cos(a) * R);
    if (o.look) this.look.copy(o.look);
  }
  finishAll() {
    const fin = <T>(c: Chan<T> | null, set: (v: T) => void) => { if (c) { set(c.to); c.done(); } };
    fin(this.cp, (v) => this.pos.copy(v)); fin(this.cl, (v) => this.look.copy(v)); fin(this.cf, (v) => (this.fov = v)); fin(this.cr, (v) => (this.roll = v));
    this.cp = this.cl = this.cf = this.cr = null;
    if (this.orb) { this.applyOrbit(1); this.orb.done(); this.orb = null; }
  }
  update(dt: number) {
    this.t += dt;
    const step = <T>(c: Chan<T> | null, lerp: (a: T, b: T, k: number) => void): Chan<T> | null => {
      if (!c) return null; c.t += dt; const u = Math.min(1, c.t / Math.max(1e-4, c.dur)); lerp(c.from, c.to, c.ease(u));
      if (u >= 1) { c.done(); return null; } return c;
    };
    this.cp = step(this.cp, (a, b, k) => this.pos.lerpVectors(a, b, k));
    this.cl = step(this.cl, (a, b, k) => this.look.lerpVectors(a, b, k));
    this.cf = step(this.cf, (a, b, k) => (this.fov = a + (b - a) * k));
    this.cr = step(this.cr, (a, b, k) => (this.roll = a + (b - a) * k));
    if (this.orb) { this.orb.t += dt; const u = Math.min(1, this.orb.t / this.orb.dur); this.applyOrbit(u); if (u >= 1) { this.orb.done(); this.orb = null; } }
    if (this.trackFn) {
      const w = this.trackFn();
      if (w) { const k = 1 - Math.exp(-this.trackK * dt); if (w.pos) this.pos.lerp(w.pos, k); if (w.look) this.look.lerp(w.look, k); }
    }
    this.shakeT = Math.max(0, this.shakeT - dt); if (this.shakeT <= 0) this.shakeA *= Math.exp(-dt * 10);
  }
  private _p = new V3(); private _l = new V3();
  /** write the rig into a camera (handheld sway and shake added on top) */
  apply(cam: THREE.PerspectiveCamera) {
    const t = this.t, h = this.handheld, s = this.shakeA;
    const n = (a: number, b: number, c: number) => Math.sin(t * a + c) * 0.6 + Math.sin(t * b + c * 2.3) * 0.4;
    this._p.copy(this.pos);
    this._l.copy(this.look);
    if (h > 0) { this._p.x += n(0.9, 2.3, 0.2) * h; this._p.y += n(1.1, 2.9, 1.7) * h * 0.7; this._p.z += n(0.7, 1.9, 3.1) * h * 0.5; this._l.x += n(1.3, 3.1, 4.4) * h * 0.6; this._l.y += n(1.7, 2.7, 5.2) * h * 0.5; }
    if (s > 0.001) { this._p.x += (Math.random() - 0.5) * s; this._p.y += (Math.random() - 0.5) * s; this._l.x += (Math.random() - 0.5) * s * 0.6; this._l.y += (Math.random() - 0.5) * s * 0.6; }
    cam.position.copy(this._p);
    cam.up.set(0, 1, 0);
    cam.lookAt(this._l);
    if (this.roll) cam.rotateZ(this.roll);
    if (Math.abs(cam.fov - this.fov) > 1e-3) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
  }
  /** start from where a camera is now */
  from(cam: THREE.PerspectiveCamera, dist = 10) {
    this.pos.copy(cam.position);
    this.look.copy(cam.position).add(new V3(0, 0, -dist).applyQuaternion(cam.quaternion));
    this.fov = cam.fov; this.roll = 0;
  }
}

export interface SayOpts { who?: string; style?: SubStyle; hold?: number; pitch?: number; radio?: boolean; voice?: boolean; onShow?: () => void }
export interface CineHost {
  /** a scene starts: hide the HUD, freeze the game */
  enter?(): void;
  /** the scene is over (skipped or not) */
  exit?(skipped: boolean): void;
  /** a subtitle line is shown (lip-sync a rig, etc.) */
  line?(text: string, o: SayOpts, sec: number): void;
}
export type Script = (c: Cinema) => Promise<void>;

export class Cinema {
  readonly ui: CineUI;
  readonly cam = new CineCam();
  active = false; skipping = false; skippable = true;
  t = 0; name = '';
  private waits: { at: number; res: () => void }[] = [];
  private tasks: { fn: (dt: number, t: number) => boolean | void; t0: number }[] = [];
  private loops: Loop[] = [];
  private ends: (() => void)[] = [];
  private tapT = -9;
  private offInput: (() => void) | null = null;
  constructor(readonly host: CineHost = {}) { this.ui = new CineUI(); }

  /** run a scene; resolves true if it was skipped */
  async play(script: Script, o: { letterbox?: boolean; skippable?: boolean; name?: string } = {}): Promise<boolean> {
    if (this.active) this.skip();
    this.active = true; this.skipping = false; this.cam.skipping = false; this.skippable = o.skippable !== false; this.t = 0; this.name = o.name ?? '';
    document.body.classList.add('cine-on');
    this.host.enter?.();
    this.grabInput();
    if (o.letterbox !== false) this.ui.letterbox(true, 0.7);
    this.ui.showSkip(this.skippable);
    let skipped = false;
    try { await script(this); } catch (e) { console.error('cutscene', this.name, e); }
    skipped = this.skipping;
    for (const f of this.ends.splice(0)) { try { f(); } catch (e) { console.error('cutscene end', e); } }
    for (const l of this.loops.splice(0)) l.stop(skipped ? 0.05 : 0.8);
    this.tasks = []; this.waits = [];
    this.cam.track(null);
    this.ui.clear(); this.ui.showSkip(false); this.ui.letterbox(false, skipped ? 0.2 : 0.6);
    if (skipped) { this.ui.fade(1, 0); this.ui.fade(0, 0.5); } else if (this.ui.fadeV > 0) this.ui.fade(0, 0.6);
    this.offInput?.(); this.offInput = null;
    this.active = false; this.skipping = false; this.cam.skipping = false;
    document.body.classList.remove('cine-on');
    this.host.exit?.(skipped);
    return skipped;
  }
  /** jump to the end: every wait resolves now, sounds stop, the script runs through silently */
  skip() {
    if (!this.active || this.skipping) return;
    this.skipping = true; this.cam.skipping = true;
    this.cam.finishAll();
    this.ui.clear();
    for (const w of this.waits.splice(0)) w.res();
    for (const l of this.loops) l.stop(0.05);
  }
  update(dt: number) {
    this.ui.update(dt);
    this.lastTick = performance.now();
    if (!this.active) return;
    this.t += dt;
    this.cam.update(dt);
    for (let i = this.tasks.length - 1; i >= 0; i--) { const k = this.tasks[i]; let r: boolean | void = false; try { r = k.fn(dt, this.t - k.t0); } catch (e) { console.error('cine task', e); r = true; } if (r) this.tasks.splice(i, 1); }
    for (let i = this.waits.length - 1; i >= 0; i--) if (this.t >= this.waits[i].at) { const w = this.waits[i]; this.waits.splice(i, 1); w.res(); }
  }
  apply(cam: THREE.PerspectiveCamera) { this.cam.apply(cam); }

  // ---------------- script helpers
  wait(s: number): Promise<void> { if (this.skipping || s <= 0) return Promise.resolve(); return new Promise((res) => this.waits.push({ at: this.t + s, res })); }
  /** wait until pred() is true (checked every frame; gives up after max seconds) */
  async until(pred: () => boolean, max = 30) { const t0 = this.t; while (!this.skipping && !pred() && this.t - t0 < max) await this.wait(0.001); }
  /** run fn every frame until it returns true (or the scene ends) */
  task(fn: (dt: number, t: number) => boolean | void) { const k = { fn, t0: this.t }; this.tasks.push(k); return () => { const i = this.tasks.indexOf(k); if (i >= 0) this.tasks.splice(i, 1); }; }
  /** drive fn(u) from 0 to 1 over dur (u eased); on skip it jumps to 1 */
  tween(dur: number, fn: (u: number) => void, ease: Ease = 'inOut'): Promise<void> {
    const e = EASE[ease];
    if (this.skipping || dur <= 0) { fn(1); return Promise.resolve(); }
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (done) return; done = true; fn(1); res(); };
      this.task((_, t) => { if (this.skipping) { fin(); return true; } const u = Math.min(1, t / dur); fn(e(u)); if (u >= 1) { fin(); return true; } return false; });
      this.ends.push(fin);
    });
  }
  /** a subtitle line; resolves when it has been read */
  say(text: string, o: SayOpts = {}): Promise<void> {
    if (this.skipping) return Promise.resolve();
    const radio = o.radio ?? o.style === 'radio';
    if (radio) csfx('squelch', 0.7);
    const sec = o.voice === false ? 0 : cvoice(text, o.pitch ?? 1, radio);
    const dur = Math.max(2.2, sec + 1.1, text.length * 0.05 + 1.2) + (o.hold ?? 0);
    this.host.line?.(text, o, Math.min(sec || 2, 6));
    o.onShow?.();
    return new Promise((res) => {
      this.ui.sub(text, { who: o.who, style: o.style ?? 'radio', dur }, res);
    });
  }
  /** a newsreel title card */
  async card(title: string, sub = '', kicker = '', dur = 3.2, stamp = 'U.S.P.C.') {
    if (this.skipping) return;
    this.ui.card(title, sub, kicker, stamp); csfx('sting', 0.6);
    setTimeout(() => { if (!this.skipping) csfx('thud', 0.5, 1.4); }, 900);
    await this.wait(dur);
    this.ui.cardOff();
    await this.wait(0.6);
  }
  stamp(text: string, top = false) { if (!this.skipping) this.ui.stamp(text, top); }
  fade(to: number, dur = 1, color = '#000'): Promise<void> { this.ui.fade(to, this.skipping ? 0 : dur, color); return this.wait(dur); }
  flash(color = '#fff', dur = 0.5, peak = 1) { if (!this.skipping) this.ui.flash(color, dur, peak); }
  letterbox(on: boolean, dur = 0.6) { this.ui.letterbox(on, dur); }
  sfx(name: CineSfx, v = 1, k = 1) { if (!this.skipping) csfx(name, v, k); }
  /** a sustained sound bed that stops when the scene ends */
  loop(kind: Parameters<typeof cloop>[0], v = 1): Loop { const l = this.skipping ? { set() {}, stop() {} } : cloop(kind, v); this.loops.push(l); return l; }
  /** something to run when the scene ends, skipped or not (put final state here) */
  onEnd(fn: () => void) { this.ends.push(fn); }

  // ---------------- input: swallowed at the window while a scene runs
  private lastTick = 0;
  /** the screen that drives this cinema stopped updating it (torn down mid-scene): let go of the input */
  private stale() { if (this.active && performance.now() - this.lastTick > 1500) { this.offInput?.(); this.offInput = null; this.skip(); return true; } return false; }
  private grabInput() {
    this.lastTick = performance.now();
    const isUI = (e: Event) => e.target instanceof Node && this.ui.skipEl.contains(e.target);
    /** only the world view and the page itself are swallowed; real UI (a result panel, a dialog) stays usable */
    const onView = (e: Event) => { const t = e.target as HTMLElement | null; return !t || t.tagName === 'CANVAS' || t === document.body || t === document.documentElement || !!t.closest?.('.cine'); };
    const key = (e: KeyboardEvent) => {
      if (!this.active || this.stale()) return;
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.repeat) return;
      if (e.key === 'Escape' && this.skippable) this.skip();
      else if (e.key === ' ' || e.key === 'Enter') this.ui.hurry();
    };
    const down = (e: PointerEvent) => {
      if (!this.active || this.stale()) return;
      if (isUI(e)) { e.stopImmediatePropagation(); this.skip(); return; }
      if (!onView(e)) return;
      e.stopImmediatePropagation(); e.preventDefault();
      this.ui.hurry();
      if (!this.skippable) return;
      if (this.t - this.tapT < 2.2) this.skip();
      else { this.tapT = this.t; this.ui.showSkip(true, true); setTimeout(() => { if (this.active && !this.skipping) this.ui.showSkip(true, false); }, 2200); }
    };
    const eat = (e: Event) => { if (this.active && !isUI(e) && onView(e) && !this.stale()) { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); } };
    addEventListener('keydown', key, true);
    addEventListener('pointerdown', down, true);
    addEventListener('wheel', eat, { capture: true, passive: false });
    addEventListener('contextmenu', eat, true);
    addEventListener('click', eat, true);
    this.offInput = () => {
      removeEventListener('keydown', key, true); removeEventListener('pointerdown', down, true);
      removeEventListener('wheel', eat, true); removeEventListener('contextmenu', eat, true); removeEventListener('click', eat, true);
    };
  }
  dispose() { this.skip(); this.offInput?.(); this.ui.dispose(); }
}

/** smooth position along a Catmull-Rom path through points (u 0..1) */
export function pathAt(pts: THREE.Vector3[], u: number, out = new V3()) {
  const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  return c.getPoint(Math.min(1, Math.max(0, u)), out);
}
