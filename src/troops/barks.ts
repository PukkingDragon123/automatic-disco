// TROOPS · BARKS AND REACTIONS. Units answer orders with a short line (sparse: one voice per order, a global
// cooldown, never two at once), shown the subtitle-strip way (no bubble): the speaker's portrait (a still of their
// own model), their callsign in their colour and the line typed out in Alagard, low over the play with only a soft
// dark fade behind. Machines speak in readouts, the collared workers in grunts the collar translates, the crew in
// their own voices; a unit with low morale answers grimly or hesitates. The units react in the world too: a nod
// when ordered, a flinch when hit, a hop for a kill (applied around the frame's render, so no system's own
// animation is disturbed).
import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Troop, TState, OrderK } from './units';
import type { OrderBook, OrderEvent } from './orders';
import { renderModel } from '../ui/kit/model3d';
import { bitText, bitMeasure } from '../ui/kit/bitfont';
import { uiSfx } from '../ui/kit/sound';
import { portraitBuild, holdLights } from './art';

type G = Game & Record<string, any>;
type Ev = OrderK | 'hurt' | 'kill' | 'break' | 'balk' | 'died' | 'rally';
const L: Record<string, Partial<Record<Ev, string[]>> & { grim?: string[] }> = {
  robot: { move: ['MOVING.', 'COPY.', 'ROUTE LOCKED.', 'ON THE WAY.'], amove: ['WEAPONS FREE.', 'ADVANCING.'], attack: ['TARGET ACQUIRED.', 'ENGAGING.', 'LOCKED ON.'], gather: ['HAULING.'], build: ['TOOLS OUT.'], repair: ['WELDER HOT.'], follow: ['ON YOUR SIX.'], guard: ['PERIMETER SET.'], patrol: ['PATROL LOOP SET.'], hold: ['HOLDING.'], stop: ['HALT.'], hurt: ['TAKING FIRE.', 'HULL BREACH.'], kill: ['TARGET DOWN.'], break: ['CORE CRITICAL. FALLING BACK.'], balk: ['...RECALIBRATING.'], died: ['UNIT LOST.'], grim: ['COMPLYING.', 'AFFIRMATIVE. LOW CONFIDENCE.'] },
  worker: { move: ['*grunt*  (OK)', '*chirrup*  (GOING)', '*snort*  (FINE)'], amove: ['*growl*'], attack: ['*ROAR*'], gather: ['*sniff*  (FOOD?)', '*huff*  (DIGGING)'], build: ['*huff*  (LIFTING)'], follow: ['*trills*'], guard: ['*low rumble*'], patrol: ['*chuff*'], hold: ['*sits*'], stop: ['*halts*'], hurt: ['*yelp*'], kill: ['*bellow*'], break: ['*whimpers*  (AFRAID)'], balk: ['*balks*  (NO)'], grim: ['*sullen grunt*'] },
  kristiansen: { move: ['Moving.', 'On it.', 'Copy that.'], amove: ['Weapons hot.', 'Pushing up.'], attack: ['Contact!', 'I see it.'], gather: ['Taking a sample.'], build: ['Hands on.'], repair: ['I can fix that.'], follow: ['Right behind you.'], guard: ['Nobody gets past.'], patrol: ['Walking the line.'], hold: ['Holding here.'], stop: ['Stopping.'], hurt: ["I'm hit!"], kill: ['Down.'], break: ['Pulling back!'], balk: ['Give me a second...'], died: ['No... not like this.'], grim: ['If you say so.'] },
  mamani: { move: ['Okay, going.', 'On my way.'], amove: ['Do I have to?'], attack: ['Sorry, little one.'], gather: ['Ooh. Sampling.', 'Look at that.'], build: ['I can help.'], repair: ['Let me see.'], follow: ['Coming!'], guard: ['I\'ll keep watch.'], patrol: ['Around and around.'], hold: ['Staying put.'], stop: ['Okay, stopping.'], hurt: ['Ow! Ow!'], kill: ['...it\'s over.'], break: ['I need to go back!'], balk: ['I... wait.'], died: ['Oh no. Oh no.'], grim: ['...fine.'] },
  drone: { move: ['LINK OK. VECTOR SET.', 'BZZT. MOVING.'], patrol: ['ORBIT SET.'], gather: ['WINCH READY.'], repair: ['ARC ONLINE.'], follow: ['TRACKING.'], hold: ['HOVER.'], stop: ['HOVER.'], hurt: ['ROTOR DAMAGE.'], grim: ['SIGNAL WEAK. OK.'] },
};
const COL: Record<string, string> = { robot: '#a8d0ff', worker: '#d8c890', crew: '#ffd080', drone: '#9fe0c0' };

interface Line { t: Troop; text: string; shown: number; age: number; dur: number; face: HTMLCanvasElement | null; col: string; name: string }

export class Barks {
  readonly el: HTMLDivElement; private cv: HTMLCanvasElement; private c: CanvasRenderingContext2D;
  private cur: Line | null = null; private q: Line[] = [];
  private cool = 0; private hurtT = new Map<string, number>();
  private faces = new Map<string, HTMLCanvasElement>();
  private t = 0;
  constructor(readonly g: G, readonly book: OrderBook) {
    injectCSS();
    const el = this.el = document.createElement('div'); el.className = 'trp-bark';
    el.innerHTML = '<div class="trp-bark-fade"></div>';
    this.cv = document.createElement('canvas'); this.cv.width = 520; this.cv.height = 40; this.cv.style.width = '1040px'; this.cv.style.height = '80px';
    this.c = this.cv.getContext('2d')!; this.c.imageSmoothingEnabled = false;
    el.append(this.cv);
    document.body.append(el);
  }
  dispose() { this.el.remove(); }
  /** an order went out: one of them answers */
  ordered(e: OrderEvent) {
    for (const t of e.troops) { const s = this.book.stateOf(t); s.react = 0.42; s.reactK = 'ack'; try { (t.ref.crewModel?.rig as { gesture?: () => void } | undefined)?.gesture?.(); } catch { /* rig optional */ } }
    if (this.cool > 0 && !(e.k === 'attack' && this.cool < 1)) return;
    const t = e.troops[Math.floor(Math.random() * Math.min(3, e.troops.length))];
    if (!t) return;
    this.say(t, e.k);
  }
  /** something happened to a unit (orders.ts onEvent) */
  event(k: 'died' | 'hurt' | 'kill' | 'break' | 'rally' | 'arrive' | 'balk', t: Troop, s: TState) {
    if (k === 'arrive') return;
    if (k === 'kill') { s.react = 0.5; s.reactK = 'cheer'; }
    if (k === 'balk') { s.react = 0.6; s.reactK = 'balk'; }
    if (k === 'hurt') { const last = this.hurtT.get(t.key) ?? -99; if (this.t - last < 9 || this.cool > 0) return; this.hurtT.set(t.key, this.t); }
    if (k === 'died') {
      // a comrade says it (the nearest living one)
      let near: Troop | null = null, bd = 30;
      for (const o of this.book.troops) { if (o === t) continue; const d = Math.hypot(o.x - t.x, o.z - t.z); if (d < bd) { bd = d; near = o; } }
      if (near) this.say(near, 'died', true);
      return;
    }
    this.say(t, k, k === 'break' || k === 'balk');
  }
  private voice(t: Troop) { return t.kind === 'crew' ? (L[t.ref.id] ? t.ref.id : 'kristiansen') : t.kind; }
  private say(t: Troop, k: Ev, urgent = false) {
    const s = this.book.stateOf(t), lib = L[this.voice(t)];
    let pool = lib?.[k];
    if (!pool?.length) return;
    if (s.morale < 0.3 && lib.grim?.length && (k === 'move' || k === 'amove' || k === 'attack' || k === 'guard' || k === 'patrol')) pool = lib.grim;
    const text = pool[Math.floor(Math.random() * pool.length)];
    const line: Line = { t, text, shown: 0, age: 0, dur: 1.4 + text.length * 0.045, face: this.face(t), col: COL[t.kind] ?? '#ffffff', name: s.call };
    this.cool = urgent ? 1.2 : 2.6;
    if (this.cur && !urgent) { this.q = [line]; return; }
    this.cur = line; this.q = [];
    uiSfx(t.kind === 'robot' || t.kind === 'drone' ? 'glitch' : 'tick', 0.22, t.kind === 'robot' ? 1.4 : 1);
  }
  /** a small still of the speaker's own model */
  private face(t: Troop): HTMLCanvasElement | null {
    const hit = this.faces.get(t.key); if (hit) return hit;
    try {
      const root = portraitBuild(t)() as THREE.Group;
      holdLights(root, 0.5);
      const cv = document.createElement('canvas'); cv.width = 36; cv.height = 36;
      const ctx = cv.getContext('2d')!;
      if (!renderModel(root, ctx, 36, 36, { yaw: 0.5, pitch: 0.25, zoom: 1.25, lift: 0.18 })) return null;
      this.faces.set(t.key, cv);
      return cv;
    } catch { return null; }
  }
  /** the frame: type the line out, fade it, take the next */
  frame(dt: number) {
    this.t += dt; this.cool = Math.max(0, this.cool - dt);
    const L0 = this.cur;
    const on = !!L0 && !document.body.classList.contains('cine-on') && !document.querySelector('.sub7.on');
    this.el.classList.toggle('on', on);
    if (!L0) { if (this.q.length && this.cool < 1.6) { this.cur = this.q.shift()!; } return; }
    L0.age += dt;
    const n = Math.min(L0.text.length, Math.floor(L0.age * 42));
    if (n !== L0.shown) { L0.shown = n; this.draw(L0); }
    if (L0.age > L0.dur + 0.6) { this.cur = null; this.draw(null); }
  }
  private draw(l: Line | null) {
    const c = this.c; c.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!l) return;
    let x = 2;
    if (l.face) { c.drawImage(l.face, 0, 2); x = 40; }
    const nameW = bitMeasure(l.name);
    bitText(c, l.name, x, 3, { color: l.col });
    bitText(c, l.text.slice(0, l.shown), x + nameW + 10, 3, { color: '#f2ead2' });
    void x;
  }
  /** the in-world reactions: apply the offsets just before the frame is drawn, undo them right after */
  private saved: [THREE.Object3D, number, number, number, number][] = [];
  apply() {
    this.saved = [];
    for (const t of this.book.troops) {
      const s = this.book.st.get(t.key); if (!s || s.react <= 0) continue;
      const o = t.body(); if (!o) continue;
      const k = s.react, dur = s.reactK === 'ack' ? 0.42 : 0.5, u = 1 - k / dur;
      this.saved.push([o, o.position.x, o.position.y, o.rotation.x, o.rotation.z]);
      const h = Math.max(0.6, t.height);
      if (s.reactK === 'ack') { o.position.y += Math.sin(u * Math.PI) * 0.07 * h; o.rotation.x += Math.sin(u * Math.PI * 2) * 0.09; }
      else if (s.reactK === 'hit') { o.position.x += Math.sin(u * 40) * 0.05 * (1 - u); o.rotation.z += Math.sin(u * 30) * 0.08 * (1 - u); }
      else if (s.reactK === 'cheer') { o.position.y += Math.abs(Math.sin(u * Math.PI * 2)) * 0.16 * h * (1 - u * 0.5); }
      else if (s.reactK === 'balk') { o.rotation.z += Math.sin(u * 14) * 0.1 * (1 - u); }
    }
  }
  restore() { for (const [o, x, y, rx, rz] of this.saved) { o.position.x = x; o.position.y = y; o.rotation.x = rx; o.rotation.z = rz; } this.saved = []; }
}

let css = false;
function injectCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.trp-bark { position: fixed; left: calc(50% - 450px); bottom: 172px; z-index: 600; pointer-events: none; opacity: 0; transform: translateY(8px); transition: opacity .2s ease-out, transform .25s cubic-bezier(.3,1.5,.5,1); }
.trp-bark.on { opacity: 1; transform: none; }
body.trp-cards-on .trp-bark { bottom: 214px; }
.trp-bark canvas { position: relative; display: block; image-rendering: pixelated; }
.trp-bark .trp-bark-fade { position: absolute; left: -60px; right: 380px; top: -18px; bottom: -14px; z-index: -1; background: radial-gradient(closest-side, rgba(6,7,10,.6), rgba(6,7,10,.32) 60%, rgba(6,7,10,0)); }
`;
  document.head.append(s);
}
