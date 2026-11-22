// THE SUBTITLE STRIP (v7; no speech bubbles, Limbophobia's rule): the speaker's portrait (their own rig), their name
// in their colour and the line in Alagard 32 px with a 1 px ink outline, typed out with a soft tick, floating over
// the picture low in the middle with nothing behind it but a soft dark fade. Choices float under it as styled,
// slightly 3D words with their icon (keys 1-4 or click); they press and spring.
//   subs.say(who, text, o?)       queue a line (who: a social id, or null for UNIT 07's own readout)
//   subs.lines(who, [..])         queue several
//   subs.choose(opts): Promise<i> show choices and wait (Esc picks the last)
//   subs.clear()                  stop everything
import { bitText, bitMeasure, bitReady } from '../ui/kit/bitfont';
import { uiSfx } from '../ui/kit/sound';
import { iconCanvas } from '../research/ui/icons';
import { portrait } from './portrait';
import { PEOPLE } from './social';

export interface Choice { icon: string | HTMLCanvasElement; label: string; key?: string; dim?: boolean }
interface Line { who: string | null; text: string; t: number; dur: number; shown: number }

const CSS = `
.sub7 { position: fixed; left: 50%; bottom: var(--sub7-y, 176px); transform: translateX(-50%); z-index: 640; pointer-events: none;
  display: flex; flex-direction: column; align-items: center; gap: 10px; opacity: 0; transition: opacity .25s ease-out, transform .25s ease-out; }
.sub7.on { opacity: 1; }
.sub7 .s7-fade { position: absolute; left: -120px; right: -120px; top: -26px; bottom: -22px; z-index: -1;
  background: radial-gradient(closest-side, rgba(6,7,10,.62), rgba(6,7,10,.38) 55%, rgba(6,7,10,0)); }
.sub7 canvas { image-rendering: pixelated; display: block; }
.sub7 .s7-row { display: flex; align-items: flex-end; gap: 14px; }
.sub7 .s7-who { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.sub7 .s7-opts { display: flex; gap: 26px; pointer-events: auto; margin-top: 4px; }
.sub7 .s7-opt { cursor: pointer; transition: transform .12s cubic-bezier(.3,1.6,.5,1), filter .12s; filter: drop-shadow(0 3px 0 rgba(0,0,0,.4)); }
.sub7 .s7-opt:hover { transform: translateY(-4px) scale(1.04); filter: drop-shadow(0 6px 0 rgba(0,0,0,.35)) brightness(1.15); }
.sub7 .s7-opt.down { transform: translateY(2px) scale(.97); transition-duration: .05s; }
.sub7 .s7-opt.dim { filter: saturate(.3) brightness(.6); }
.sub7 .s7-opt { opacity: 0; transform: translateY(8px); animation: s7in .28s cubic-bezier(.3,1.5,.5,1) forwards; }
@keyframes s7in { to { opacity: 1; transform: none; } }
`;
export class Subs {
  private el: HTMLDivElement; private row: HTMLDivElement; private who: HTMLDivElement; private cv: HTMLCanvasElement; private nameCv: HTMLCanvasElement; private face: HTMLCanvasElement;
  private opts: HTMLDivElement;
  private q: Line[] = []; private cur: Line | null = null;
  private raf = 0; private last = performance.now(); private shownChars = -1;
  private pick: ((i: number) => void) | null = null;
  /** a voice for a line (Web Speech, the crew's cspeak) */
  voice: ((who: string, text: string) => void) | null = null;
  /** an actor's mouth and hands while their line plays */
  onLine: ((who: string, sec: number) => void) | null = null;
  constructor() {
    if (!document.getElementById('sub7-css')) { const s = document.createElement('style'); s.id = 'sub7-css'; s.textContent = CSS; document.head.append(s); }
    this.el = document.createElement('div'); this.el.className = 'sub7';
    this.el.innerHTML = '<div class="s7-fade"></div>';
    this.row = document.createElement('div'); this.row.className = 's7-row';
    this.who = document.createElement('div'); this.who.className = 's7-who';
    this.face = document.createElement('canvas'); this.nameCv = document.createElement('canvas');
    this.who.append(this.face, this.nameCv);
    this.cv = document.createElement('canvas');
    this.row.append(this.who, this.cv);
    this.opts = document.createElement('div'); this.opts.className = 's7-opts';
    this.el.append(this.row, this.opts);
    document.body.append(this.el);
    addEventListener('keydown', this.onKey, true);
    void bitReady().then(() => { this.shownChars = -1; });
  }
  get busy() { return !!this.cur || this.q.length > 0; }
  get choosing() { return !!this.pick; }
  say(who: string | null, text: string, o: { dur?: number } = {}) {
    const dur = o.dur ?? Math.max(2.4, Math.min(7, 1.2 + text.length * 0.055));
    this.q.push({ who, text, t: 0, dur, shown: 0 });
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.tick); }
  }
  lines(who: string | null, ls: string[]) { for (const l of ls) this.say(who, l); }
  /** skip the line that is playing (a click on the strip, Space while talking) */
  skip() { if (this.cur) { if (this.cur.shown < this.cur.text.length) this.cur.shown = this.cur.text.length; else this.cur.t = this.cur.dur; } }
  clear() { this.q = []; this.cur = null; this.paint(); this.el.classList.remove('on'); this.endChoice(-1); }
  /** float choices and wait for one */
  choose(list: Choice[]): Promise<number> {
    this.endChoice(-1);
    this.opts.replaceChildren();
    list.forEach((c, i) => {
      const b = document.createElement('div'); b.className = 's7-opt' + (c.dim ? ' dim' : ''); b.style.animationDelay = i * 0.06 + 's';
      b.append(choiceArt(c, i + 1));
      b.addEventListener('pointerenter', () => uiSfx('hover', 0.7));
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); b.classList.add('down'); uiSfx('click'); });
      b.addEventListener('pointerup', (e) => { e.stopPropagation(); b.classList.remove('down'); this.endChoice(i); });
      this.opts.append(b);
    });
    this.el.classList.add('on');
    return new Promise((res) => { this.pick = res; });
  }
  private endChoice(i: number) { const p = this.pick; this.pick = null; this.opts.replaceChildren(); if (p) p(i); if (!this.cur && !this.q.length) this.el.classList.remove('on'); }
  private onKey = (e: KeyboardEvent) => {
    if (!this.pick) return;
    const n = Number(e.key);
    const count = this.opts.children.length;
    if (n >= 1 && n <= count) { e.preventDefault(); e.stopPropagation(); uiSfx('click'); this.endChoice(n - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); uiSfx('back'); this.endChoice(count - 1); }
  };
  private tick = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (!this.cur && this.q.length) {
      this.cur = this.q.shift()!; this.shownChars = -1;
      if (this.cur.who) { this.voice?.(this.cur.who, this.cur.text); this.onLine?.(this.cur.who, this.cur.dur); }
      this.paintWho(); this.el.classList.add('on');
    }
    const c = this.cur;
    if (c) {
      c.t += dt;
      const before = Math.floor(c.shown);
      c.shown = Math.min(c.text.length, c.shown + dt * 42);
      if (Math.floor(c.shown) !== before && Math.floor(c.shown) % 3 === 0 && c.shown < c.text.length) uiSfx('tick', 0.25, 1.5 + Math.random() * 0.3);
      if (Math.floor(c.shown) !== this.shownChars) this.paint();
      if (c.t >= c.dur) { this.cur = null; if (!this.q.length && !this.pick) this.el.classList.remove('on'); }
    }
    if (this.cur || this.q.length) this.raf = requestAnimationFrame(this.tick);
  };
  private paintWho() {
    const c = this.cur; const id = c?.who;
    const p = id ? PEOPLE[id] : null;
    const face = id ? portrait(id) : null;
    if (face) { this.face.width = face.width; this.face.height = face.height; this.face.getContext('2d')!.drawImage(face, 0, 0); this.face.style.width = face.width * 2 + 'px'; this.face.style.height = face.height * 2 + 'px'; this.face.style.display = ''; }
    else this.face.style.display = 'none';
    const name = p?.short ?? (id ? id.toUpperCase() : 'UNIT 07');
    const w = bitMeasure(name) + 4;
    this.nameCv.width = w; this.nameCv.height = 20; this.nameCv.style.width = w + 'px'; this.nameCv.style.height = '20px';
    const g = this.nameCv.getContext('2d')!; g.clearRect(0, 0, w, 20); bitText(g, name, w / 2, 1, { color: p?.col ?? '#9fe0ff', align: 'center' });
  }
  private paint() {
    const c = this.cur;
    this.shownChars = c ? Math.floor(c.shown) : -1;
    const text = c ? c.text.slice(0, Math.floor(c.shown)) : '';
    // two lines at most, 32 px (scale 2), wrapped at ~640 px
    const maxW = 330;
    const words = (c?.text ?? '').split(' '), rows: string[] = []; let line = '';
    for (const wd of words) { const tr = line ? line + ' ' + wd : wd; if (bitMeasure(tr) > maxW && line) { rows.push(line); line = wd; } else line = tr; }
    if (line) rows.push(line);
    const W = Math.max(...rows.map((r) => bitMeasure(r)), 10) + 6, H = rows.length * 17 + 4;
    this.cv.width = W; this.cv.height = H; this.cv.style.width = W * 2 + 'px'; this.cv.style.height = H * 2 + 'px';
    const g = this.cv.getContext('2d')!; g.clearRect(0, 0, W, H);
    let left = text.length;
    rows.forEach((r, i) => { const s = r.slice(0, Math.max(0, left)); left -= r.length + 1; if (s) bitText(g, s, 3, 2 + i * 17, { color: '#f4ecd6', shadow: '#000000' }); });
  }
  dispose() { removeEventListener('keydown', this.onKey, true); this.el.remove(); }
}
/** a floating choice: the icon over its word, extruded a little */
function choiceArt(c: Choice, n: number): HTMLCanvasElement {
  const word = c.label.toUpperCase(), w = Math.max(40, bitMeasure(word) + 8), cv = document.createElement('canvas');
  cv.width = w; cv.height = 52;
  const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
  const ic = typeof c.icon === 'string' ? iconCanvas(c.icon, 'phos') : c.icon;
  const isz = 32;
  if (ic) g.drawImage(ic, Math.round((w - isz) / 2), 0, isz, isz);
  bitText(g, word, w / 2, 33, { color: c.dim ? '#8a8270' : '#ffe2a0', extrude: [1, '#5a3a14'], align: 'center' });
  // the key number, small, at the icon's corner
  bitText(g, String(n), Math.round((w + isz) / 2) - 2, 18, { color: '#c8c0a8', align: 'left' });
  cv.style.width = w * 2 + 'px'; cv.style.height = 104 + 'px';
  return cv;
}
