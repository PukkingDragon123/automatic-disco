// The intro's screen furniture over the cinema, all painted pixel-art hardware (hw.ts): UNIT 07's own readouts
// (phosphor lines typed into the corner of its vision), the boot-up overlay (scanlines and the dark iris vignette),
// the playable-beat prompt plate (a gunmetal plate with a key cap and the instruction on phosphor glass), the target
// brackets over what can be picked, and the hold dial (24 lamp segments) while the player keeps the button down.
// Everything sits on whole pixels; the type is Departure Mono ('Body') at 22 px.
import { promptPlate, holdDial, brackets } from './hw';

const CSS = /* css */`
.u7 { position: fixed; inset: 0; z-index: 42; pointer-events: none; }
.u7 canvas { position: absolute; image-rendering: pixelated; }
.u7 .hud { position: absolute; left: 36px; top: calc(11.5vh + 18px); display: flex; flex-direction: column; gap: 2px; }
.u7 .hud div { font-family: 'Body', monospace; font-size: 22px; line-height: 26px; color: #8fe0b0; text-shadow: 2px 2px 0 #06100a; opacity: 0; transition: opacity 0.4s steps(4); -webkit-font-smoothing: none; white-space: pre; }
.u7 .hud div.on { opacity: 1; }
.u7 .hud div b { color: #e2b45a; font-weight: normal; }
.u7 .boot { position: absolute; inset: 0; opacity: 0; transition: opacity 0.8s steps(8); background:
  radial-gradient(circle at 50% 50%, transparent 34%, rgba(10, 30, 26, 0.55) 58%, #000 76%),
  repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.2) 0 1px, transparent 1px 3px); }
.u7 .boot.on { opacity: 1; }
.u7 .reticle { position: absolute; left: 50%; top: 50%; width: 22vh; height: 22vh; margin: -11vh 0 0 -11vh; border: 2px solid rgba(143, 224, 176, 0.35); border-radius: 50%; opacity: 0; }
.u7 .reticle.on { opacity: 1; }
.u7 .pr { opacity: 0; transition: opacity 0.3s steps(3); }
.u7 .pr.on { opacity: 1; }
`;
let styled = false;

export class IntroUI {
  readonly root: HTMLDivElement;
  private hud: HTMLDivElement; private boot: HTMLDivElement; private reticle: HTMLDivElement;
  private pr: HTMLCanvasElement | null = null; private prKey = '';
  private ring: HTMLCanvasElement | null = null; private ringKey = '';
  private mk: HTMLCanvasElement | null = null; private mkKey = '';
  constructor() {
    if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
    this.root = document.createElement('div'); this.root.className = 'u7'; document.body.appendChild(this.root);
    this.boot = this.div('boot'); this.reticle = this.div('reticle');
    this.hud = this.div('hud');
  }
  private div(c: string) { const d = document.createElement('div'); d.className = c; this.root.appendChild(d); return d; }
  private swap(old: HTMLCanvasElement | null, c: HTMLCanvasElement) { c.className = 'pr on'; if (old) old.replaceWith(c); else this.root.appendChild(c); return c; }
  private lines: { d: HTMLDivElement; text: string; html: string; i: number; t: number; hold: number }[] = [];
  /** UNIT 07's own readout: a line typed into the corner of its vision ([brackets] in amber); game-timed (update) */
  sys(text: string, hold = 4) {
    const d = document.createElement('div'); this.hud.appendChild(d); d.classList.add('on');
    this.lines.push({ d, text: text.replace(/\[|\]/g, ''), html: text.replace(/\[(.+?)\]/g, '<b>$1</b>'), i: 0, t: 0, hold });
    while (this.lines.length > 5) this.lines.shift()!.d.remove();
  }
  /** type and expire the readouts (call every frame with the game's dt) */
  update(dt: number) {
    for (let k = this.lines.length - 1; k >= 0; k--) {
      const L = this.lines[k]; L.t += dt;
      if (L.i < L.text.length) { L.i = Math.min(L.text.length, Math.floor(L.t * 70)); L.d.textContent = '> ' + L.text.slice(0, L.i); if (L.i >= L.text.length) L.d.innerHTML = '&gt; ' + L.html; }
      if (L.t > L.hold) L.d.classList.remove('on');
      if (L.t > L.hold + 0.6) { L.d.remove(); this.lines.splice(k, 1); }
    }
  }
  bootView(on: boolean) { this.boot.classList.toggle('on', on); this.reticle.classList.toggle('on', on); }
  /** the prompt plate, centred low on the screen (null hides) */
  prompt(key: string | null, text = '', tip = '') {
    if (!key) { this.pr?.remove(); this.pr = null; this.prKey = ''; return; }
    const k = key + '|' + text + '|' + tip;
    if (k !== this.prKey) { this.prKey = k; this.pr = this.swap(this.pr, promptPlate(key, text, tip)); }
    const c = this.pr!, w = parseInt(c.style.width), h = parseInt(c.style.height);
    c.style.left = Math.round(innerWidth / 2 - w / 2) + 'px'; c.style.top = Math.round(innerHeight * 0.885 - 30 - h) + 'px';
  }
  /** target brackets at a screen point, pulsing in two steps (null hides) */
  mark(x: number | null, y = 0, label = '') {
    if (x === null) { this.mk?.remove(); this.mk = null; this.mkKey = ''; return; }
    const t = (Math.floor(performance.now() / 380) % 2) as 0 | 1, k = label + t;
    if (k !== this.mkKey) { this.mkKey = k; this.mk = this.swap(this.mk, brackets(label, t)); }
    const c = this.mk!, w = parseInt(c.style.width);
    c.style.left = Math.round(x - w / 2) + 'px'; c.style.top = Math.round(y - 36) + 'px';
  }
  /** the hold dial at a screen point, k 0..1 (null hides) */
  hold(x: number | null, y = 0, k = 0, label = '') {
    if (x === null) { this.ring?.remove(); this.ring = null; this.ringKey = ''; return; }
    const key = Math.round(k * 24) + '|' + label + '|' + Math.round(k * 100);
    if (key !== this.ringKey) { this.ringKey = key; this.ring = this.swap(this.ring, holdDial(k, label)); }
    const c = this.ring!;
    c.style.left = Math.round(x - 50) + 'px'; c.style.top = Math.round(y - 50) + 'px';
  }
  clear() { this.prompt(null); this.mark(null); this.hold(null); this.bootView(false); this.hud.innerHTML = ''; }
  dispose() { this.root.remove(); }
}
