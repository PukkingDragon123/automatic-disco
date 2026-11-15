// The intro's marks over the scene, all hand-drawn pixel pen strokes (crew/doodle.ts), never panels: an inked loop
// round what to grab with a curved arrow from a scribbled word ("GRAB IT"), the instruction written low on the
// frame with a pen underline, a loop that fills stroke by stroke while the button is held, and UNIT 07's own
// readouts typed in cream and amber in the corner of its vision. Lines draw themselves in, then boil a little.
import { Ink, INK, textW } from '../crew/doodle';

const CSS = /* css */`
.u7 { position: fixed; inset: 0; z-index: 42; pointer-events: none; }
.u7 canvas { position: absolute; image-rendering: pixelated; }
.u7 .hud { position: absolute; left: 40px; top: calc(11.5vh + 18px); display: flex; flex-direction: column; gap: 2px; }
.u7 .hud div { font-family: 'Body', monospace; font-size: 22px; line-height: 26px; color: #efe6cf; text-shadow: 2px 0 0 #1a1714, -2px 0 0 #1a1714, 0 2px 0 #1a1714, 0 -2px 0 #1a1714; opacity: 0; transition: opacity 0.4s steps(4); -webkit-font-smoothing: none; white-space: pre; }
.u7 .hud div.on { opacity: 1; }
.u7 .hud div b { color: #e8a83a; font-weight: normal; }
.u7 .boot { position: absolute; inset: 0; opacity: 0; transition: opacity 0.8s steps(8); background: radial-gradient(circle at 50% 50%, transparent 40%, rgba(8, 10, 12, 0.6) 62%, #050607 80%); }
.u7 .boot.on { opacity: 1; }
`;
let styled = false;
type P2 = [number, number];

export class IntroUI {
  readonly root: HTMLDivElement;
  private hud: HTMLDivElement; private boot: HTMLDivElement;
  private cueC: HTMLCanvasElement | null = null; private cueKey = ''; private cueT = 0;
  private noteC: HTMLCanvasElement | null = null; private noteKey = ''; private noteT = 0;
  private ringC: HTMLCanvasElement | null = null; private ringKey = '';
  private retC: HTMLCanvasElement | null = null;
  private lines: { d: HTMLDivElement; text: string; html: string; i: number; t: number; hold: number }[] = [];
  private t = 0;
  constructor() {
    if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
    this.root = document.createElement('div'); this.root.className = 'u7'; document.body.appendChild(this.root);
    this.boot = this.div('boot'); this.hud = this.div('hud');
  }
  private div(c: string) { const d = document.createElement('div'); d.className = c; this.root.appendChild(d); return d; }
  private put(old: HTMLCanvasElement | null, c: HTMLCanvasElement) { if (old) old.replaceWith(c); else this.root.appendChild(c); return c; }
  /** UNIT 07's own readout typed into the corner of its vision ([brackets] in amber); game-timed */
  sys(text: string, hold = 4) {
    const d = document.createElement('div'); this.hud.appendChild(d); d.classList.add('on');
    this.lines.push({ d, text: text.replace(/\[|\]/g, ''), html: text.replace(/\[(.+?)\]/g, '<b>$1</b>'), i: 0, t: 0, hold });
    while (this.lines.length > 5) this.lines.shift()!.d.remove();
  }
  /** call every frame with the game's dt: typing, expiry, the pen lines drawing in */
  update(dt: number) {
    this.t += dt; this.cueT += dt; this.noteT += dt;
    for (let k = this.lines.length - 1; k >= 0; k--) {
      const L = this.lines[k]; L.t += dt;
      if (L.i < L.text.length) { L.i = Math.min(L.text.length, Math.floor(L.t * 70)); L.d.textContent = '> ' + L.text.slice(0, L.i); if (L.i >= L.text.length) L.d.innerHTML = '&gt; ' + L.html; }
      if (L.t > L.hold) L.d.classList.remove('on');
      if (L.t > L.hold + 0.6) { L.d.remove(); this.lines.splice(k, 1); }
    }
  }
  /** the boot view: a dark iris round the edge of its vision and a pen-drawn reticle loop */
  bootView(on: boolean) {
    this.boot.classList.toggle('on', on);
    if (on && !this.retC) {
      const S = Math.round(innerHeight * 0.24), I = new Ink(S + 40, S + 40); I.seed = 3;
      I.loop((S + 40) / 2, (S + 40) / 2, S / 2, S / 2, 2, INK.mute, { turns: 1.04 });
      I.stroke([[(S + 40) / 2, 6], [(S + 40) / 2, 22]], 2, INK.mute).stroke([[S + 34, (S + 40) / 2], [S + 18, (S + 40) / 2]], 2, INK.mute);
      this.retC = this.put(null, I.c); this.retC.style.opacity = '0.55';
      this.retC.style.left = Math.round(innerWidth / 2 - (S + 40) / 2) + 'px'; this.retC.style.top = Math.round(innerHeight / 2 - (S + 40) / 2) + 'px';
    }
    if (!on && this.retC) { this.retC.remove(); this.retC = null; }
  }
  /** the instruction, written low on the frame with a pen underline (null hides). key is the verb (CLICK, DRAG, HOLD) */
  prompt(key: string | null, text = '', tip = '') {
    if (!key) { this.noteC?.remove(); this.noteC = null; this.noteKey = ''; return; }
    const k = key + '|' + text + '|' + tip + '|' + Math.min(4, Math.floor(this.noteT * 8)) + '|' + Math.floor(this.t * 4);
    if (k === this.noteKey) return;
    if (!this.noteKey.startsWith(key + '|' + text + '|' + tip)) this.noteT = 0;
    this.noteKey = k;
    const line = text + (tip ? '  (' + tip + ')' : '');
    const wk = textW(key, 'Title', 24), wl = textW(line, 'Body', 22), W = wk + wl + 60, H = 60;
    const I = new Ink(W, H); I.seed = Math.floor(this.t * 4) % 7 + 1;
    I.label(key, 6, 8, 'Title', 24, INK.amber);
    I.label(line, wk + 26, 10, 'Body', 22, INK.light);
    I.stroke([[4, 44], [wk + 10, 46]], 3, INK.amber, { outline: INK.dark, reveal: Math.min(1, this.noteT * 3), taper: true });
    this.noteC = this.put(this.noteC, I.c);
    this.noteC.style.left = Math.round(innerWidth / 2 - W / 2) + 'px'; this.noteC.style.top = Math.round(innerHeight * 0.885 - 14 - H) + 'px';
  }
  /** a loop round a target on screen, an arrow in from a scribbled word (null hides) */
  mark(x: number | null, y = 0, label = '', r = 46) {
    if (x === null) { this.cueC?.remove(); this.cueC = null; this.cueKey = ''; return; }
    const boil = Math.floor(this.t * 4), rev = Math.min(1, this.cueT * 2.2);
    const k = label + '|' + boil + '|' + Math.round(rev * 10) + '|' + r;
    if (!this.cueKey.startsWith(label + '|')) this.cueT = 0;
    const left = x > innerWidth * 0.55;
    const W = 460, H = 300, tx = left ? W - r - 20 : r + 20, ty = H - r - 20;
    if (k !== this.cueKey) {
      this.cueKey = k;
      const I = new Ink(W, H); I.seed = boil % 6 + 1;
      I.loop(tx, ty, r, r * 0.86, 3, INK.violet, { outline: INK.dark, reveal: rev });
      const lw = textW(label, 'Title', 24), lx = left ? 16 : W - lw - 16, ly = 18;
      const a: P2 = [left ? lx + lw * 0.6 : lx + lw * 0.4, ly + 34], b: P2 = [tx + (left ? -r * 0.75 : r * 0.75), ty - r * 0.75];
      I.arrow(a, b, 3, INK.light, { outline: INK.dark, bend: left ? -40 : 40, reveal: Math.max(0, rev * 1.4 - 0.3) });
      I.label(label, lx, ly, 'Title', 24, INK.light);
      this.cueC = this.put(this.cueC, I.c);
    }
    const c = this.cueC!;
    c.style.left = Math.round(x - tx) + 'px'; c.style.top = Math.round(y - ty) + 'px';
  }
  /** a loop that fills stroke by stroke while the button is held, k 0..1 (null hides) */
  hold(x: number | null, y = 0, k = 0, label = '') {
    if (x === null) { this.ringC?.remove(); this.ringC = null; this.ringKey = ''; return; }
    const boil = Math.floor(this.t * 4), key = Math.round(k * 40) + '|' + label + '|' + boil;
    const S = 150, c0 = S / 2;
    if (key !== this.ringKey) {
      this.ringKey = key;
      const I = new Ink(S, S + 40); I.seed = boil % 5 + 2;
      I.loop(c0, c0, 52, 52, 2, INK.mute, { turns: 1.0 });
      if (k > 0.01) I.loop(c0, c0, 52, 52, 5, INK.amber, { outline: INK.dark, reveal: Math.min(1, k), turns: 1.0 });
      I.label(label || Math.round(k * 100) + '%', c0, S - 6, 'Body', 22, INK.light, 'center');
      this.ringC = this.put(this.ringC, I.c);
    }
    const c = this.ringC!;
    c.style.left = Math.round(x - c0) + 'px'; c.style.top = Math.round(y - c0) + 'px';
  }
  clear() { this.prompt(null); this.mark(null); this.hold(null); this.bootView(false); this.hud.innerHTML = ''; }
  dispose() { this.root.remove(); }
}
