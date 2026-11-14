// The cinema's screen furniture, as DOM over the canvas: letterbox bars, a fade curtain, film grain, subtitles in
// four styles (a green-phosphor radio CRT, a 1950s newsreel film strip, a field-journal page, plain), newsreel
// title cards, a typed location stamp, the skip hint, and the advancement banner (a brass plate that drops in with
// a rubber stamp; used by the story outside cutscenes too). Its CSS is injected once from here.
import { iconURL } from './icons';
import { onSettings } from '../settings';

export type SubStyle = 'radio' | 'film' | 'journal' | 'plain';

const CSS = /* css */`
.cine { position: fixed; inset: 0; z-index: 40; pointer-events: none !important; font-family: 'VT', monospace; --lb: 0; --u: calc(1px * var(--s, 2)); }
.cine .lb { position: absolute; left: 0; right: 0; height: calc(var(--lb) * 11.5vh); background: #000; }
.cine .lb.t { top: 0; box-shadow: 0 1px 0 rgba(255, 205, 110, calc(var(--lb) * 0.18)); }
.cine .lb.b { bottom: 0; box-shadow: 0 -1px 0 rgba(255, 205, 110, calc(var(--lb) * 0.18)); }
.cine .fade { position: absolute; inset: 0; background: #000; opacity: 0; }
.cine .grain { position: absolute; inset: 0; opacity: calc(var(--lb) * 0.05); mix-blend-mode: screen; background-size: 256px 256px; animation: cine-grain 0.4s steps(4) infinite; }
@keyframes cine-grain { 0% { background-position: 0 0; } 25% { background-position: -71px 33px; } 50% { background-position: 47px -89px; } 75% { background-position: -13px 61px; } }
.cine .vig { position: absolute; inset: 0; opacity: var(--lb); background: radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0, 0, 0, 0.45) 100%); }
.cine .skip { position: absolute; right: calc(8 * var(--u)); top: calc(3 * var(--u)); font-size: var(--cf-vt1); line-height: 1; color: rgba(230, 220, 184, 0.45); letter-spacing: 1px; opacity: calc(var(--lb)); transition: color 0.2s; pointer-events: auto; cursor: pointer; }
.cine .skip b { color: var(--gold, #ffcd6e); }
.cine .skip.arm { color: var(--gold, #ffcd6e); animation: cine-blink 0.5s steps(2) infinite; }
@keyframes cine-blink { 50% { opacity: 0.4; } }
/* subtitles */
.cine .subs { position: absolute; left: 0; right: 0; bottom: calc(var(--lb) * 11.5vh + 2.2vh); display: flex; flex-direction: column; align-items: center; gap: calc(2 * var(--u)); }
.cine .sub { max-width: min(86vw, calc(330 * var(--u))); font-size: var(--cf-vt2); line-height: var(--cf-vt2); animation: cine-sub-in 220ms steps(4); }
.cine .sub .who { display: block; font-size: var(--cf-vt1); line-height: calc(var(--cf-vt1) + 2px); letter-spacing: 1px; }
.cine .sub.out { opacity: 0; transition: opacity 220ms steps(3); }
@keyframes cine-sub-in { 0% { opacity: 0; transform: translateY(calc(3 * var(--u))); } 100% { opacity: 1; transform: none; } }
.cine .sub.radio { background: radial-gradient(ellipse at 50% 45%, #0c3418 0%, #06180c 60%, #031008 100%); border: calc(2 * var(--u)) solid #2a3121; outline: calc(1 * var(--u)) solid #07080a; border-radius: calc(3 * var(--u)); padding: calc(3 * var(--u)) calc(6 * var(--u)); color: var(--ink, #b8f0b4); text-shadow: var(--phos-glow); position: relative; overflow: hidden; box-shadow: 0 0 0 calc(1 * var(--u)) #5a6644 inset; }
.cine .sub.radio::after { content: ''; position: absolute; inset: 0; background: var(--scan); pointer-events: none; animation: cine-roll 3s linear infinite; }
@keyframes cine-roll { from { background-position: 0 0; } to { background-position: 0 calc(40 * var(--u)); } }
.cine .sub.radio .who { color: var(--gold, #ffcd6e); text-shadow: var(--amb-glow); }
.cine .sub.radio .who::before { content: '\\25C9  RX \\00B7  '; color: var(--amber, #ffa432); animation: cine-blink 1s steps(2) infinite; }
.cine .sub.radio.static { animation: cine-sub-in 220ms steps(4), cine-static 120ms steps(2) 3; }
@keyframes cine-static { 0% { filter: brightness(2) contrast(2); } 100% { filter: none; } }
.cine .sub.film { color: #f2ead2; text-shadow: calc(1 * var(--u)) calc(1 * var(--u)) 0 #000, 0 0 calc(3 * var(--u)) rgba(0, 0, 0, 0.9); text-align: center; padding: calc(5 * var(--u)) calc(14 * var(--u)); background:
  radial-gradient(circle, #000 38%, transparent 42%) 0 calc(1 * var(--u)) / calc(10 * var(--u)) calc(4 * var(--u)) repeat-x,
  radial-gradient(circle, #000 38%, transparent 42%) 0 calc(100% - 1 * var(--u)) / calc(10 * var(--u)) calc(4 * var(--u)) repeat-x,
  linear-gradient(180deg, rgba(40, 32, 22, 0.86), rgba(20, 16, 12, 0.9)); border-top: calc(5 * var(--u)) solid rgba(58, 48, 34, 0.92); border-bottom: calc(5 * var(--u)) solid rgba(58, 48, 34, 0.92); }
.cine .sub.film .who { color: #d8ab50; font-family: 'Superwide', monospace; font-size: var(--cf-sw1); letter-spacing: 2px; margin-bottom: calc(2 * var(--u)); }
.cine .sub.journal { color: #2a1c10; background: linear-gradient(180deg, transparent calc(9.6 * var(--u)), rgba(90, 120, 160, 0.35) calc(9.6 * var(--u)), transparent calc(10.2 * var(--u))) 0 calc(2 * var(--u)) / 100% calc(10 * var(--u)), #e9dfc0; padding: calc(4 * var(--u)) calc(8 * var(--u)) calc(4 * var(--u)) calc(14 * var(--u)); border-left: calc(2 * var(--u)) solid rgba(170, 60, 50, 0.6); transform: rotate(-0.6deg); box-shadow: calc(2 * var(--u)) calc(2 * var(--u)) 0 rgba(0, 0, 0, 0.5); }
.cine .sub.journal .who { color: #7a5a3a; font-family: 'Silk', monospace; font-size: var(--cf-ps1); }
.cine .sub.plain { color: #f4f0e4; text-shadow: calc(1 * var(--u)) calc(1 * var(--u)) 0 #000, calc(-1 * var(--u)) 0 0 #000, 0 calc(-1 * var(--u)) 0 #000, calc(1 * var(--u)) 0 0 #000; text-align: center; }
.cine .sub.plain .who { color: #9fd0ff; }
.cine .sub .cur { animation: cine-blink 0.6s steps(2) infinite; }
/* title card */
.cine .card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); text-align: center; color: #efe6c8; opacity: 0; white-space: nowrap; }
.cine .card.on { opacity: 1; animation: cine-card-in 900ms steps(9); }
.cine .card.off { opacity: 0; transition: opacity 600ms steps(6); }
@keyframes cine-card-in { 0% { opacity: 0; letter-spacing: 6px; } 100% { opacity: 1; } }
.cine .card .k { font-family: 'Superwide', monospace; font-size: var(--cf-sw1); letter-spacing: 3px; color: #d8ab50; }
.cine .card .t { font-family: 'Canned', monospace; font-size: var(--cf-sw4); line-height: var(--cf-sw4); color: #f2e2b0; text-shadow: 0 calc(2 * var(--u)) 0 #5c3f13, 0 0 calc(8 * var(--u)) rgba(255, 180, 80, 0.35); margin: calc(3 * var(--u)) 0; }
.cine .card .s { font-size: var(--cf-vt1); color: #c8bc98; letter-spacing: 1px; }
.cine .card .rule { height: calc(1 * var(--u)); margin: calc(3 * var(--u)) auto; width: 70%; background: linear-gradient(90deg, transparent, #d8ab50, transparent); }
/* stamp */
.cine .stamp { position: absolute; left: calc(10 * var(--u)); bottom: calc(var(--lb) * 11.5vh + 1.4vh); font-size: var(--cf-vt1); color: var(--amber, #ffa432); text-shadow: var(--amb-glow); letter-spacing: 1px; }
.cine .stamp.top { bottom: auto; top: calc(var(--lb) * 11.5vh + 1.4vh); }
/* through Unit 07's lens: an iris, a green cast, scanlines, a reticle */
.cine.pov .vig { opacity: 1; background: radial-gradient(circle at 50% 50%, transparent 30%, rgba(0, 20, 12, 0.55) 52%, #000 70%); }
.cine.pov .grain { opacity: 0.12; }
.cine .ret { position: absolute; left: 50%; top: 50%; width: calc(40 * var(--u)); height: calc(40 * var(--u)); transform: translate(-50%, -50%); display: none; border: calc(1 * var(--u)) solid rgba(122, 255, 224, 0.45); border-radius: 50%; }
.cine .ret::before, .cine .ret::after { content: ''; position: absolute; background: rgba(122, 255, 224, 0.5); }
.cine .ret::before { left: 50%; top: calc(-10 * var(--u)); width: calc(1 * var(--u)); height: calc(60 * var(--u)); }
.cine .ret::after { top: 50%; left: calc(-10 * var(--u)); height: calc(1 * var(--u)); width: calc(60 * var(--u)); }
.cine.pov .ret { display: block; animation: cine-blink 1.4s steps(2) infinite; }
.cine.pov::after { content: ''; position: absolute; inset: 0; background: var(--scan); opacity: 0.6; mix-blend-mode: multiply; }
.cine.pov::before { content: ''; position: absolute; inset: 0; background: rgba(60, 255, 170, 0.16); mix-blend-mode: overlay; }
/* flash */
.cine .flash { position: absolute; inset: 0; opacity: 0; }
/* advancement banner (lives outside cutscenes too) */
.adv { position: fixed; left: 50%; top: calc(46 * var(--u, 2px)); z-index: 30; pointer-events: none !important; display: flex; align-items: center; gap: calc(5 * var(--u)); transform: translateX(-50%); padding: calc(4 * var(--u)) calc(10 * var(--u)) calc(4 * var(--u)) calc(5 * var(--u));
  --u: calc(1px * var(--s, 2)); background: linear-gradient(180deg, #4e593a, #38412b 60%, #2a3121); border: calc(2 * var(--u)) solid #171a12; box-shadow: 0 0 0 calc(1 * var(--u)) #77825a inset, 0 calc(3 * var(--u)) 0 rgba(0, 0, 0, 0.55); border-radius: calc(2 * var(--u)); animation: adv-in 380ms cubic-bezier(.2,1.6,.4,1); font-family: 'VT', monospace; }
.adv.out { animation: adv-out 420ms steps(5) forwards; }
@keyframes adv-in { 0% { transform: translate(-50%, calc(-30 * var(--u))) scale(1.25); opacity: 0; } 100% { transform: translateX(-50%); opacity: 1; } }
@keyframes adv-out { to { transform: translate(-50%, calc(-12 * var(--u))); opacity: 0; } }
.adv .ic { width: calc(36 * var(--u) / 2); height: calc(36 * var(--u) / 2); image-rendering: pixelated; flex: none; background: radial-gradient(circle, rgba(122, 255, 224, 0.25), transparent 70%); }
.adv .tx { display: flex; flex-direction: column; }
.adv .k { font-family: 'Silk', monospace; font-size: var(--cf-ps1); letter-spacing: 2px; color: #d8ab50; }
.adv .t { font-family: 'Superwide', monospace; font-size: var(--cf-sw2); line-height: var(--cf-sw2); color: #f2ead2; text-shadow: 0 calc(1 * var(--u)) 0 #111410; letter-spacing: 1px; }
.adv .s { font-size: var(--cf-vt1); line-height: var(--cf-vt1); color: #c0ffc6; text-shadow: var(--phos-glow); }
.adv .st { position: absolute; right: calc(-8 * var(--u)); top: calc(-7 * var(--u)); font-family: 'Silk', monospace; font-size: var(--cf-ps1); color: #c83a28; border: calc(1 * var(--u)) solid #c83a28; padding: 0 calc(2 * var(--u)); transform: rotate(12deg); background: rgba(240, 230, 200, 0.85); animation: adv-stamp 300ms 260ms steps(3) both; }
@keyframes adv-stamp { 0% { transform: rotate(12deg) scale(2.6); opacity: 0; } 100% { transform: rotate(12deg) scale(1); opacity: 1; } }
body.cine-on .hud, body.cine-on .overlay2d, body.cine-on .toasts, body.cine-on .hud-obj, body.cine-on .tip, body.cine-on .wl, body.cine-on .adv, body.cine-on .float-text, body.cine-on .tc-zone, body.cine-on .tc-pad, body.cine-on .tc-btn { visibility: hidden !important; }
`;

/** Crisp pixel-font sizes: every face is drawn on its own pixel grid (RoyaltyMono 'VT' 14 px, PixelSans 'Silk' /
 * 'Pixelify' / 'Tiny5' 11 px, NanoPlus 'Jersey' / 'SilkB' 13 px, CannedPixels 'Canned' / 'Jacquard' and 'Superwide'
 * 10 px), so text only stays sharp at whole multiples of that. These CSS variables give those multiples for the
 * current UI scale: -1 small (body), -2 large, -4 title. */
export function fontVars() {
  const S = Math.max(2, Number(document.documentElement.style.getPropertyValue('--s')) || (innerHeight >= 1040 ? 3 : 2)), k1 = Math.max(1, Math.round(S / 2));
  const r = document.documentElement.style, px = (n: number) => n + 'px';
  r.setProperty('--cf-vt1', px(14 * k1)); r.setProperty('--cf-vt2', px(14 * S));
  r.setProperty('--cf-ps1', px(11 * k1)); r.setProperty('--cf-ps2', px(11 * S));
  r.setProperty('--cf-np1', px(13 * k1)); r.setProperty('--cf-np2', px(13 * S));
  r.setProperty('--cf-sw1', px(10 * k1)); r.setProperty('--cf-sw2', px(10 * S)); r.setProperty('--cf-sw4', px(20 * S));
}
/** a font size that keeps a face on its pixel grid: the largest whole multiple of its native size not above want */
export function crispPx(face: 'VT' | 'Silk' | 'Jersey' | 'Canned' | 'Superwide', want: number) {
  const n = face === 'VT' ? 14 : face === 'Silk' ? 11 : face === 'Jersey' ? 13 : 10;
  return n * Math.max(1, Math.floor(want / n));
}
let styled = false;
function style() {
  fontVars();
  if (styled) return; styled = true;
  const s = document.createElement('style'); s.id = 'cine-css'; s.textContent = CSS; document.head.appendChild(s);
  addEventListener('resize', fontVars);
  onSettings(() => setTimeout(fontVars, 0));
}
let grainURL = '';
function grain() {
  if (grainURL) return grainURL;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, d = g.createImageData(128, 128);
  for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 255); d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  // a short scratch and a few dust flecks
  const sx = Math.floor(Math.random() * 128), sy = Math.floor(Math.random() * 80);
  for (let y = sy; y < sy + 40; y++) { const i = (y * 128 + sx) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = 200; }
  for (let k = 0; k < 4; k++) { const x = Math.floor(Math.random() * 126), y = Math.floor(Math.random() * 126); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) { const i = ((y + dy) * 128 + x + dx) * 4; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; } }
  g.putImageData(d, 0, 0);
  return (grainURL = c.toDataURL());
}
const div = (cls: string, parent: HTMLElement, html?: string) => { const e = document.createElement('div'); e.className = cls; if (html !== undefined) e.innerHTML = html; parent.appendChild(e); return e; };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export class CineUI {
  readonly root: HTMLDivElement;
  private fadeEl: HTMLDivElement; private flashEl: HTMLDivElement;
  private subs: HTMLDivElement; private cardEl: HTMLDivElement; private stampEl: HTMLDivElement; readonly skipEl: HTMLDivElement;
  lb = 0; private lbGoal = 0; private lbSpeed = 2;
  fadeV = 0; private fadeGoal = 0; private fadeSpeed = 1;
  private flashV = 0; private flashSpeed = 2;
  private cur: { el: HTMLDivElement; text: string; shown: number; t: number; dur: number; who: string; done: () => void; type?: () => void } | null = null;
  private stampTxt = ''; private stampShown = 0; private stampT = 0;
  constructor() {
    style();
    this.root = div('cine', document.body) as HTMLDivElement;
    const gr = div('grain', this.root); gr.style.backgroundImage = `url(${grain()})`;
    div('vig', this.root);
    div('lb t', this.root); div('lb b', this.root);
    div('ret', this.root);
    this.flashEl = div('flash', this.root) as HTMLDivElement;
    this.fadeEl = div('fade', this.root) as HTMLDivElement;
    this.subs = div('subs', this.root) as HTMLDivElement;
    this.cardEl = div('card', this.root) as HTMLDivElement;
    this.stampEl = div('stamp', this.root) as HTMLDivElement;
    this.skipEl = div('skip', this.root, '<b>ESC</b> SKIP') as HTMLDivElement;
    this.skipEl.style.display = 'none';
  }
  letterbox(on: boolean, dur = 0.6) { this.lbGoal = on ? 1 : 0; this.lbSpeed = 1 / Math.max(0.01, dur); }
  fade(to: number, dur = 1, color = '#000') { this.fadeGoal = to; this.fadeSpeed = 1 / Math.max(0.01, dur); this.fadeEl.style.background = color; if (dur <= 0) { this.fadeV = to; this.fadeEl.style.opacity = String(to); } }
  flash(color = '#fff', dur = 0.5, peak = 1) { this.flashEl.style.background = color; this.flashV = peak; this.flashSpeed = peak / Math.max(0.01, dur); }
  get fadeDone() { return this.fadeV === this.fadeGoal; }
  showSkip(on: boolean, armed = false) { this.skipEl.style.display = on ? '' : 'none'; this.skipEl.classList.toggle('arm', armed); this.skipEl.innerHTML = armed ? 'TAP AGAIN TO <b>SKIP</b>' : '<b>ESC</b> SKIP'; }
  /** show a subtitle; done() fires when it has been read */
  sub(text: string, o: { who?: string; style?: SubStyle; dur?: number; onType?: () => void }, done: () => void) {
    this.endSub();
    const st = o.style ?? 'radio';
    const el = div('sub ' + st + (st === 'radio' ? ' static' : ''), this.subs) as HTMLDivElement;
    if (o.who) div('who', el, esc(o.who.toUpperCase()));
    const tx = div('tx', el);
    tx.innerHTML = '<span class="cur">&#9608;</span>';
    const dur = o.dur ?? Math.max(2.2, text.length * 0.055 + 1.2);
    this.cur = { el, text, shown: 0, t: 0, dur, who: o.who ?? '', done, type: o.onType };
  }
  /** hurry the current line: finish typing, or end it */
  hurry() { const c = this.cur; if (!c) return; if (c.shown < c.text.length) c.shown = c.text.length; else c.t = c.dur; }
  endSub() {
    const c = this.cur; if (!c) return; this.cur = null;
    c.el.classList.add('out'); setTimeout(() => c.el.remove(), 260);
    c.done();
  }
  card(title: string, sub = '', kicker = '') {
    this.cardEl.className = 'card';
    this.cardEl.innerHTML = (kicker ? `<div class="k">${esc(kicker)}</div><div class="rule"></div>` : '') + `<div class="t">${esc(title)}</div>` + (sub ? `<div class="rule"></div><div class="s">${esc(sub)}</div>` : '');
    void this.cardEl.offsetWidth; this.cardEl.classList.add('on');
  }
  cardOff() { this.cardEl.classList.remove('on'); this.cardEl.classList.add('off'); }
  stamp(text: string, top = false) { this.stampTxt = text; this.stampShown = 0; this.stampT = 0; this.stampEl.classList.toggle('top', top); this.stampEl.textContent = ''; }
  stampOff() { this.stampTxt = ''; this.stampEl.textContent = ''; }
  update(dt: number) {
    const mv = (v: number, g: number, s: number) => (v < g ? Math.min(g, v + s * dt) : Math.max(g, v - s * dt));
    this.lb = mv(this.lb, this.lbGoal, this.lbSpeed);
    const e = this.lb < 0.5 ? 2 * this.lb * this.lb : 1 - Math.pow(-2 * this.lb + 2, 2) / 2;
    this.root.style.setProperty('--lb', e.toFixed(3));
    this.fadeV = mv(this.fadeV, this.fadeGoal, this.fadeSpeed);
    this.fadeEl.style.opacity = (Math.round(this.fadeV * 12) / 12).toFixed(3);
    this.flashV = Math.max(0, this.flashV - this.flashSpeed * dt);
    this.flashEl.style.opacity = this.flashV.toFixed(3);
    const c = this.cur;
    if (c) {
      c.t += dt;
      const before = Math.floor(c.shown);
      c.shown = Math.min(c.text.length, c.shown + dt * 38);
      if (Math.floor(c.shown) !== before) {
        const n = Math.floor(c.shown);
        (c.el.querySelector('.tx') as HTMLElement).innerHTML = esc(c.text.slice(0, n)) + (n < c.text.length ? '<span class="cur">&#9608;</span>' : '');
        if (c.type && n % 2 === 0) c.type();
      }
      if (c.t >= c.dur && c.shown >= c.text.length) this.endSub();
    }
    if (this.stampTxt) {
      this.stampT += dt; const n = Math.min(this.stampTxt.length, Math.floor(this.stampT * 24));
      if (n !== this.stampShown) { this.stampShown = n; this.stampEl.textContent = this.stampTxt.slice(0, n) + (n < this.stampTxt.length ? '█' : ''); }
      // it types itself out, holds, then deletes itself
      const hold = this.stampTxt.length / 24 + 4.5;
      if (this.stampT > hold) { const k = Math.max(0, this.stampTxt.length - Math.floor((this.stampT - hold) * 48)); this.stampEl.textContent = this.stampTxt.slice(0, k); if (!k) this.stampOff(); }
    }
  }
  clear() { this.endSub(); this.subs.innerHTML = ''; this.cardEl.className = 'card'; this.stampOff(); }
  dispose() { this.cur = null; this.root.remove(); }
}

// ------------------------------------------------------------------ advancement banner
const advQ: { title: string; sub: string; icon: string; kicker: string; stamp: string }[] = [];
let advBusy = false;
/** a brass-and-olive plate that drops in under the HUD's top bar: an icon, a kicker, a title and a phosphor sub line */
export function advance(title: string, sub = '', icon = 'cell', o: { kicker?: string; stamp?: string } = {}) {
  style();
  advQ.push({ title, sub, icon, kicker: o.kicker ?? 'ADVANCEMENT', stamp: o.stamp ?? 'U.S.P.C.' });
  if (!advBusy) nextAdv();
}
function nextAdv() {
  const a = advQ.shift(); if (!a) { advBusy = false; return; }
  advBusy = true;
  const el = div('adv', document.body);
  const s = Number(document.documentElement.style.getPropertyValue('--s')) || 2;
  const ic = document.createElement('img'); ic.className = 'ic'; ic.src = iconURL(a.icon, 18 * s, { shadow: true }); ic.style.width = ic.style.height = 18 * s + 'px'; el.appendChild(ic);
  const tx = div('tx', el);
  div('k', tx, esc(a.kicker)); div('t', tx, esc(a.title)); if (a.sub) div('s', tx, esc(a.sub));
  if (a.stamp) div('st', el, esc(a.stamp));
  setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); nextAdv(); }, 430); }, 3300);
}
