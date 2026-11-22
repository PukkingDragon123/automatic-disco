// HUD v7 · THE CORNER (top left; replaces the colony plate, the vitals strip and the time plate). One compact cluster:
// a brass SOL DIAL (a sky disc turning behind a horizon window: the sun by day, the moon and stars by night), the sol
// and the hour, the TIME KEYS as floating painted glyphs (pause, 1x, 2x, 3x; the live one lit amber and lifted), and
// the two vitals that matter from minute to minute, POWER (a battery of five lit cells) and OXYGEN (a bottle with a
// sight glass): small and calm while fine; low, they grow, pulse, shake and show the collapse countdown in red.
// The other vitals speak through the alert feed.
import type { Game } from '../../game/game';
import { Px, P, INK } from '../kit/px';
import { pxCanvas } from '../kit/mat';
import { uiSfx } from '../kit/sound';
import { squash, shake, pop } from '../kit/juice';
import { installKitStyle } from '../kit/style';
import { timeGlyph, batteryGlyph, o2Glyph } from './glyphs';
import { panel, kv, bindTip, type Panel, type Kv, type Status } from '../kit/panel';

type G = Game & Record<string, any>;
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** the sol dial: a brass bezel, a turning sky disc (day half, night half with stars), a horizon window plate */
function solDial(day: number): Px {
  const S = 40, p = new Px(S, S), c = (S - 1) / 2, R = 19;
  const a = (day % 1) * Math.PI * 2; // 0 = midnight at the top
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy); if (d > R + 0.5) continue;
    const lit = -(dx * 0.6 + dy * 0.8) / (d || 1);
    if (d > R - 0.5) { p.set(x, y, INK); continue; }
    if (d > R - 3.2) { p.set(x, y, P.brass[lit > 0.35 ? 5 : lit > -0.2 ? 4 : lit > -0.6 ? 3 : 2]); continue; }
    if (d > R - 4) { p.set(x, y, P.brass[1]); continue; }
    // the horizon plate covers the lower half (a lit brass edge on its top)
    if (dy > 2) { p.set(x, y, dy < 3.2 ? P.brass[5] : P.brass[(x + y) % 7 === 0 ? 2 : 3]); continue; }
    if (dy > 1) { p.set(x, y, INK); continue; }
    // the sky disc, turned by the time of day: the half facing up is day when the sun is up
    const ang = Math.atan2(dx, -dy) - a, dayK = Math.cos(ang + Math.PI);
    const sky = dayK > 0.15 ? P.sky[Math.min(5, 3 + Math.round(dayK * 2))] : dayK > -0.15 ? P.coral[4] : P.sapphire[Math.max(0, 1 + Math.round(dayK + 0.5))];
    p.set(x, y, sky);
    if (dayK < -0.2 && ((x * 7 + y * 13) % 23 === 0)) p.set(x, y, P.snow[5]);
  }
  // the sun and the moon ride the disc, opposite each other
  const body = (ang: number, col: number[], rr: number) => { const bx = c + Math.sin(ang) * 10, by = c - Math.cos(ang) * 10; if (by > c + 1) return; for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) { const d = Math.hypot(x, y); if (d > rr + 0.2) continue; const X = Math.round(bx + x), Y = Math.round(by + y); if (Y > c + 1) continue; p.set(X, Y, d > rr - 0.8 ? col[1] : x + y < 0 ? col[4] : col[3]); } };
  body(Math.PI - a, P.glowAmber as unknown as number[], 3);
  body(-a, P.snow as unknown as number[], 2.5);
  // the needle (a brass pointer at the top) and a glint on the glass
  p.set(Math.round(c), 4, P.ruby[4]); p.set(Math.round(c), 5, P.ruby[3]);
  p.set(13, 10, 0xffffff); p.set(12, 11, 0xffffff, 160);
  return p;
}

const part = (h: number) => (h >= 6 && h < 18 ? 'DAY' : h >= 18 && h < 20 ? 'DUSK' : h >= 5 && h < 6 ? 'DAWN' : 'NIGHT');
const pct = (k: number) => Math.round(Math.max(0, Math.min(1, k)) * 100);
export class Corner {
  readonly el: HTMLDivElement;
  private dial: HTMLCanvasElement; private sol: HTMLDivElement; private hour: HTMLDivElement;
  private keys: { el: HTMLButtonElement; cv: HTMLCanvasElement; kind: 'pause' | 'x1' | 'x2' | 'x3'; on: boolean }[] = [];
  private pw: { el: HTMLDivElement; cv: HTMLCanvasElement; t: HTMLDivElement; lvl: string };
  private ox: { el: HTMLDivElement; cv: HTMLCanvasElement; t: HTMLDivElement; lvl: string };
  private dayKey = -1; private acc = 0; private t = 0;
  private tip: HTMLDivElement;
  private card: Panel; private rows: Record<string, Kv> = {}; private st: Status; private o2Prev = -1; private o2Trend = 0;
  constructor(readonly g: G) {
    installKitStyle(); injectCornerCSS();
    const el = this.el = document.createElement('div'); el.className = 'h7-corner';
    const clock = document.createElement('div'); clock.className = 'h7-clock';
    this.dial = pxCanvas(solDial(0.3), 2, 'h7-dial');
    const tx = document.createElement('div'); tx.className = 'h7-cltx';
    this.sol = document.createElement('div'); this.sol.className = 'k7-t32'; this.sol.textContent = 'SOL 1';
    this.hour = document.createElement('div'); this.hour.className = 'k7-t16 h7-hour'; this.hour.textContent = '06:00';
    tx.append(this.sol, this.hour); clock.append(this.dial, tx);
    const keys = document.createElement('div'); keys.className = 'h7-keys';
    for (const kind of ['pause', 'x1', 'x2', 'x3'] as const) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'h7-key'; b.setAttribute('aria-label', kind === 'pause' ? 'Pause' : kind.slice(1) + 'x speed');
      const cv = pxCanvas(timeGlyph(kind, false), 2); b.append(cv);
      b.addEventListener('pointerenter', () => uiSfx('hover', 0.4));
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); squash(b, 0.8); });
      b.addEventListener('click', (e) => { e.stopPropagation(); const c = this.g.colony; uiSfx('switch', 0.7); if (kind === 'pause') { if (c) c.togglePause(); else this.g.paused = !this.g.paused; } else { const n = Number(kind.slice(1)); if (c) c.setSpeed(n); else { this.g.speed = n; this.g.paused = false; } } this.acc = 0; });
      keys.append(b);
      this.keys.push({ el: b, cv, kind, on: false });
    }
    const vit = document.createElement('div'); vit.className = 'h7-vit';
    const gauge = (name: string) => { const e = document.createElement('div'); e.className = 'h7-gauge'; e.dataset.v = name; const cv = document.createElement('canvas'); cv.style.imageRendering = 'pixelated'; const t = document.createElement('div'); t.className = 'k7-t32 h7-gt'; e.append(cv, t); vit.append(e); return { el: e, cv, t, lvl: 'ok' }; };
    this.pw = gauge('power'); this.ox = gauge('oxygen');
    el.append(clock, keys, vit);
    // COLONY STATUS: the time and every vital spelled out, and one line on what needs doing
    this.card = panel({ title: 'COLONY STATUS', tone: 'gun', lamps: ['green', 'amber', 'red'], glands: 1, vents: false, foot: 12, cls: 'h7-status' });
    const row = (k: string, label: string, title: string) => { const r = kv(label, '-', { title, barCol: k === 'power' ? '#ffb02a' : k === 'oxygen' ? '#40d8f0' : '#8ce070' }); this.rows[k] = r; this.card.body.append(r.el); };
    row('time', 'Time', 'Local time on the planet and the part of the day');
    row('speed', 'Speed', 'How fast the colony runs');
    row('power', 'Battery', 'Charge in the pod battery');
    row('net', 'Power net', 'Generation minus draw');
    row('oxygen', 'Oxygen', 'Pod tank; scrubbers refill it on power');
    row('food', 'Food', 'Meals in rations and the stores');
    row('hull', 'Pod hull', 'Pod integrity');
    row('morale', 'Morale', 'How the crew is holding up');
    this.st = this.card.status('', 'ok');
    el.append(this.card.el);
    const KEYDESC: Record<string, [string, string]> = { pause: ['PAUSE', 'Stop the clock. Orders can still be given.'], x1: ['NORMAL SPEED', 'Run the colony at 1x.'], x2: ['FAST', 'Run the colony at 2x.'], x3: ['FASTEST', 'Run the colony at 3x.'] };
    this.keys.forEach((k) => bindTip(k.el, () => ({ title: KEYDESC[k.kind][0], desc: KEYDESC[k.kind][1], status: k.on ? ['Active now', 'ok'] : undefined })));
    this.tip = document.createElement('div'); this.tip.className = 'k7-tip k7-t16'; document.body.append(this.tip);
    for (const [gg, f] of [[this.pw, () => this.powerTip()], [this.ox, () => this.o2Tip()]] as const) {
      gg.el.addEventListener('pointerenter', () => { this.tip.textContent = f(); const r = gg.el.getBoundingClientRect(); this.tip.style.left = Math.round(r.left + r.width / 2) + 'px'; this.tip.style.top = Math.round(r.bottom + 30) + 'px'; this.tip.classList.add('on'); });
      gg.el.addEventListener('pointerleave', () => this.tip.classList.remove('on'));
    }
  }
  private powerTip() { const v = this.g.colony?.vitals; return v ? `${Math.round(v.battery)} / ${v.batteryCap} KWH   ${v.gen >= v.draw ? '+' : ''}${(v.gen - v.draw).toFixed(1)} KW` : ''; }
  private o2Tip() { const v = this.g.colony?.vitals; return v ? `OXYGEN ${Math.round(v.o2)}%` : ''; }
  /** the status card: time, speed, every vital with its unit, and the most urgent thing to do */
  private fillStatus(hh: number, hr: string, v: any) {
    const g = this.g, r = this.rows;
    r.time.set(`${hr} · ${part(hh)}`);
    r.speed.set(g.paused ? 'PAUSED' : (g.speed ?? 1) === 1 ? 'NORMAL 1x' : `FAST ${g.speed}x`, { color: g.paused ? '#ffb02a' : undefined });
    if (!v) { for (const k of ['power', 'net', 'oxygen', 'food', 'hull', 'morale']) r[k].set('-'); this.st.set('No colony vitals yet.', 'info'); return; }
    const net = v.gen - v.draw;
    r.power.set(`${Math.round(v.battery)} / ${v.batteryCap} kWh`, { bar: v.battery / v.batteryCap, color: v.levels.power === 'ok' ? undefined : v.levels.power === 'crit' ? '#ff7a5a' : '#ffc860' });
    r.net.set(`${net >= 0 ? '+' : ''}${net.toFixed(1)} kW (${v.gen.toFixed(0)} in, ${v.draw.toFixed(0)} out)`, { color: net < 0 ? '#ffc860' : '#a8e890' });
    if (this.o2Prev >= 0) this.o2Trend = this.o2Trend * 0.8 + (v.o2 - this.o2Prev) * 0.2; this.o2Prev = v.o2;
    r.oxygen.set(`${Math.round(v.o2)} % ${this.o2Trend > 0.01 ? 'rising' : this.o2Trend < -0.01 ? 'falling' : 'steady'}`, { bar: v.o2 / 100, color: v.levels.oxygen === 'ok' ? undefined : v.levels.oxygen === 'crit' ? '#ff7a5a' : '#ffc860' });
    const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
    r.food.set(ok(v.food) ? `${Math.floor(v.food)} meals` : '-', { color: v.levels.food === 'ok' ? undefined : '#ffc860' });
    r.hull.set(ok(v.integrity) ? `${pct(v.integrity)} %` : '-', { bar: ok(v.integrity) ? v.integrity : 0, color: v.levels.integrity === 'ok' ? undefined : '#ffc860' });
    r.morale.set(ok(v.morale) ? `${Math.round(v.morale)} %` : '-', { bar: ok(v.morale) ? v.morale / 100 : 0, color: v.levels.morale === 'ok' ? undefined : '#ffc860' });
    // the most urgent line
    const t = v.timers ?? {};
    const lines: [number, string, 'bad' | 'warn'][] = [];
    if (v.levels.power === 'crit') lines.push([3, `Power failing${t.power != null ? `: blackout in ${mmss(t.power)}` : ''}. Build a generator or cut draw.`, 'bad']);
    if (v.levels.oxygen === 'crit') lines.push([4, `Oxygen failing${t.oxygen != null ? `: ${mmss(t.oxygen)} of air left` : ''}. Power the scrubbers, seal the hull.`, 'bad']);
    if (v.levels.food === 'crit') lines.push([2, `Starving${t.food != null ? `: ${mmss(t.food)} left` : ''}. Gather or grow food.`, 'bad']);
    if (v.levels.power === 'warn') lines.push([1, 'Battery low: draw is above generation.', 'warn']);
    if (v.levels.oxygen === 'warn') lines.push([1, 'Oxygen low: keep the scrubbers powered.', 'warn']);
    if (v.levels.food === 'warn') lines.push([1, 'Food running low.', 'warn']);
    if (v.levels.integrity !== 'ok') lines.push([1, 'Pod hull damaged: weld it.', 'warn']);
    if (v.levels.morale !== 'ok') lines.push([0, 'Crew morale low: rest, food, light.', 'warn']);
    lines.sort((a, b) => b[0] - a[0]);
    if (lines.length) this.st.set(lines[0][1], lines[0][2]); else this.st.set('All systems holding.', 'ok');
    const worst = lines[0]?.[2]; this.card.lamp(0, !worst); this.card.lamp(1, worst === 'warn'); this.card.lamp(2, worst === 'bad');
  }
  update(dt: number) {
    this.t += dt; this.acc -= dt;
    if (this.acc > 0) return; this.acc = 0.2;
    const g = this.g, c = g.colony;
    // time keys
    this.keys.forEach((k, i) => {
      const on = i === 0 ? !!g.paused : !g.paused && (g.speed ?? 1) === i;
      if (on !== k.on) { k.on = on; timeGlyph(k.kind, on).canvas(k.cv); k.el.classList.toggle('on', on); if (on) pop(k.el, 0.6); }
    });
    // the dial and the clock
    const day = (g.world?.day ?? 0.3), dk = Math.floor(day * 96);
    if (dk !== this.dayKey) { this.dayKey = dk; solDial(day + 0.25).canvas(this.dial); }
    const hh = Math.floor(((day + 0.25) % 1) * 24), mm = Math.floor(((((day + 0.25) % 1) * 24) % 1) * 60);
    const sol = `SOL ${c?.sol ?? 1}`, hr = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (this.sol.textContent !== sol) this.sol.textContent = sol;
    if (this.hour.textContent !== hr) this.hour.textContent = hr;
    // power and oxygen
    const v = c?.vitals;
    this.fillStatus(hh, hr, v);
    if (!v) return;
    const blink = Math.floor(this.t * 3) % 2 === 0;
    const set = (gg: Corner['pw'], lvl: string, art: Px, timer: number | null | undefined) => {
      art.canvas(gg.cv); gg.cv.style.width = art.w * 2 + 'px'; gg.cv.style.height = art.h * 2 + 'px';
      if (lvl !== gg.lvl) { gg.lvl = lvl; gg.el.className = 'h7-gauge h7-' + lvl; if (lvl !== 'ok') { shake(gg.el, 5); uiSfx(lvl === 'crit' ? 'error' : 'bong', 0.5); } }
      const tt = lvl === 'ok' ? '' : timer !== null && timer !== undefined ? mmss(Math.max(0, timer)) : lvl === 'crit' ? '!' : '';
      if (gg.t.textContent !== tt) gg.t.textContent = tt;
    };
    const pl = v.levels.power, ol = v.levels.oxygen;
    set(this.pw, pl, batteryGlyph(Math.max(0, Math.min(1, v.battery / v.batteryCap)), pl, pl === 'crit' && blink), v.timers?.power);
    set(this.ox, ol, o2Glyph(Math.max(0, Math.min(1, v.o2 / 100)), ol), v.timers?.oxygen);
  }
}

let css = false;
function injectCornerCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-status { position: fixed; left: 12px; top: 74px; width: 330px; z-index: 34; pointer-events: auto; }
body.cine-on .h7-status, body.h7-ws-open .h7-status { display: none !important; }
.h7-corner { position: fixed; left: 14px; top: 10px; z-index: 35; display: flex; align-items: center; gap: 16px; pointer-events: none; }
.h7-clock { display: flex; align-items: center; gap: 10px; }
.h7-dial { display: block; filter: drop-shadow(2px 3px 0 rgba(5,6,8,.45)); }
.h7-cltx { display: flex; flex-direction: column; gap: 0; }
.h7-hour { color: var(--k7-dim); margin-left: 2px; }
.h7-keys { display: flex; align-items: center; gap: 6px; pointer-events: auto; }
.h7-key { position: relative; border: 0; background: none; padding: 4px; margin: 0; cursor: pointer; line-height: 0; transition: transform .18s cubic-bezier(.2,.9,.3,1.5), filter .15s; filter: drop-shadow(2px 3px 0 rgba(5,6,8,.45)); }
.h7-key canvas { display: block; }
.h7-key:hover { transform: translateY(-3px); filter: brightness(1.2) drop-shadow(2px 5px 0 rgba(5,6,8,.4)); }
.h7-key.on { transform: translateY(-2px); filter: drop-shadow(0 0 6px rgba(255,190,80,.65)) drop-shadow(2px 4px 0 rgba(5,6,8,.4)); }
.h7-vit { display: flex; align-items: center; gap: 10px; pointer-events: auto; }
.h7-gauge { position: relative; display: flex; align-items: center; gap: 4px; opacity: .78; transform: scale(.82); transform-origin: 0 50%; transition: transform .25s cubic-bezier(.2,.9,.3,1.5), opacity .2s, filter .2s; filter: drop-shadow(2px 3px 0 rgba(5,6,8,.45)); }
.h7-gauge canvas { display: block; }
.h7-gauge.h7-warn { opacity: 1; transform: scale(1); filter: drop-shadow(0 0 6px rgba(255,190,80,.6)); }
.h7-gauge.h7-crit { opacity: 1; transform: scale(1.1); filter: drop-shadow(0 0 8px rgba(255,80,60,.75)); animation: h7-throb .7s ease-in-out infinite; }
.h7-gauge .h7-gt { color: var(--k7-amber); }
.h7-gauge.h7-crit .h7-gt { color: var(--k7-red); }
@keyframes h7-throb { 50% { transform: scale(1.18); } }
`;
  document.head.append(s);
}
