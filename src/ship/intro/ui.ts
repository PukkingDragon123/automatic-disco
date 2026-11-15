// The intro's screen furniture over the cinema: UNIT 07's own readouts (a phosphor line typed in the corner of its
// vision: "GRAVITY FIELD: ONLINE"), the boot-up overlay (scanlines, a teal iris vignette, the boot log), the
// playable-beat prompt plate (a worn machine plate with a key cap and the instruction) and the hold ring that
// fills while the player keeps the button down.
const CSS = /* css */`
.u7 { position: fixed; inset: 0; z-index: 42; pointer-events: none; font-family: 'VT', monospace; --u: calc(1px * var(--s, 2)); }
.u7 .hud { position: absolute; left: calc(9 * var(--u)); top: calc(var(--lbh, 0px) + 6 * var(--u)); display: flex; flex-direction: column; gap: calc(1 * var(--u)); }
.u7 .hud div { color: #8fe0b0; font-size: var(--cf-vt2, 26px); line-height: 1.05; text-shadow: 0 0 6px rgba(120, 230, 170, 0.45), 1px 1px 0 #000; opacity: 0; transition: opacity 0.6s; }
.u7 .hud div.on { opacity: 1; }
.u7 .hud div b { color: #e2b45a; font-weight: normal; }
.u7 .boot { position: absolute; inset: 0; opacity: 0; transition: opacity 0.8s; background:
  radial-gradient(circle at 50% 50%, transparent 34%, rgba(10, 30, 26, 0.55) 58%, #000 76%),
  repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 3px); }
.u7 .boot.on { opacity: 1; }
.u7 .boot::after { content: ''; position: absolute; inset: 0; background: rgba(100, 220, 190, 0.06); mix-blend-mode: screen; }
.u7 .reticle { position: absolute; left: 50%; top: 50%; width: 22vh; height: 22vh; transform: translate(-50%, -50%); border: 1px solid rgba(143, 224, 176, 0.35); border-radius: 50%; opacity: 0; transition: opacity 0.6s; }
.u7 .reticle.on { opacity: 1; }
.u7 .reticle::before, .u7 .reticle::after { content: ''; position: absolute; background: rgba(143, 224, 176, 0.5); }
.u7 .reticle::before { left: 50%; top: -3vh; width: 1px; height: 3vh; }
.u7 .reticle::after { top: 50%; right: -3vh; height: 1px; width: 3vh; }
.u7 .prompt { position: absolute; left: 50%; bottom: calc(var(--lbh, 0px) + 7vh); transform: translate(-50%, 0) translateY(10px); display: flex; align-items: center; gap: calc(5 * var(--u)); padding: calc(4 * var(--u)) calc(9 * var(--u)) calc(4 * var(--u)) calc(5 * var(--u));
  background: linear-gradient(180deg, #2a3036, #1c2126); border: calc(1 * var(--u)) solid #4a5258; outline: 1px solid #0c0f12; box-shadow: 0 0 0 1px #5c666c inset, 0 8px 24px rgba(0,0,0,0.5);
  color: #dfe3dc; font-size: var(--cf-vt2, 26px); opacity: 0; transition: opacity 0.35s, transform 0.35s; }
.u7 .prompt.on { opacity: 1; transform: translate(-50%, 0); }
.u7 .prompt .key { font-family: 'Superwide', monospace; font-size: var(--cf-sw1, 12px); letter-spacing: 2px; color: #1e2228; background: linear-gradient(180deg, #e8e2cc, #b8b09a); border-radius: calc(2 * var(--u)); padding: calc(3 * var(--u)) calc(5 * var(--u)); box-shadow: 0 calc(2 * var(--u)) 0 #6a6450; }
.u7 .prompt .tip { color: #8fe0b0; font-size: var(--cf-vt1, 20px); margin-left: calc(3 * var(--u)); }
.u7 .ring { position: absolute; width: 96px; height: 96px; transform: translate(-50%, -50%); opacity: 0; transition: opacity 0.2s; }
.u7 .ring.on { opacity: 1; }
.u7 .ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.u7 .ring .lab { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 4px); color: #e2b45a; font-size: var(--cf-vt1, 20px); white-space: nowrap; text-shadow: 1px 1px 0 #000; }
.u7 .mark { position: absolute; width: 64px; height: 64px; transform: translate(-50%, -50%); opacity: 0; transition: opacity 0.3s; }
.u7 .mark.on { opacity: 1; }
.u7 .mark::before, .u7 .mark::after { content: ''; position: absolute; inset: 0; border: 2px solid rgba(154, 140, 255, 0.85); border-radius: 50%; animation: u7-pulse 1.3s ease-out infinite; }
.u7 .mark::after { animation-delay: 0.65s; }
.u7 .mark .t { position: absolute; left: 50%; top: 100%; transform: translate(-50%, 6px); color: #c8c0ff; font-size: var(--cf-vt1, 20px); white-space: nowrap; text-shadow: 1px 1px 0 #000; }
@keyframes u7-pulse { 0% { transform: scale(0.55); opacity: 1; } 100% { transform: scale(1.35); opacity: 0; } }
`;
let styled = false;

export class IntroUI {
  readonly root: HTMLDivElement;
  private hud: HTMLDivElement; private boot: HTMLDivElement; private reticle: HTMLDivElement;
  private promptEl: HTMLDivElement; private ring: HTMLDivElement; private ringArc: SVGCircleElement; private ringLab: HTMLDivElement;
  private markEl: HTMLDivElement;
  constructor() {
    if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
    this.root = document.createElement('div'); this.root.className = 'u7'; document.body.appendChild(this.root);
    this.boot = this.div('boot'); this.reticle = this.div('reticle');
    this.hud = this.div('hud');
    this.promptEl = this.div('prompt');
    this.markEl = this.div('mark'); this.markEl.innerHTML = '<div class="t"></div>';
    this.ring = this.div('ring');
    this.ring.innerHTML = '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="rgba(20,24,28,0.55)" stroke="#3a4248" stroke-width="7"/><circle class="a" cx="50" cy="50" r="42" fill="none" stroke="#9a8cff" stroke-width="7" stroke-dasharray="264" stroke-dashoffset="264" stroke-linecap="butt"/></svg><div class="lab"></div>';
    this.ringArc = this.ring.querySelector('circle.a') as SVGCircleElement; this.ringLab = this.ring.querySelector('.lab') as HTMLDivElement;
  }
  private div(c: string) { const d = document.createElement('div'); d.className = c; this.root.appendChild(d); return d; }
  /** UNIT 07's own readout: a line typed into the corner of its vision */
  sys(text: string, hold = 4) {
    const d = document.createElement('div'); this.hud.appendChild(d);
    const html = text.replace(/\[(.+?)\]/g, '<b>$1</b>');
    let i = 0; const plain = text.replace(/\[|\]/g, '');
    requestAnimationFrame(() => d.classList.add('on'));
    const tick = () => { i = Math.min(plain.length, i + 2); d.textContent = '> ' + plain.slice(0, i); if (i < plain.length) setTimeout(tick, 22); else d.innerHTML = '&gt; ' + html; };
    tick();
    setTimeout(() => { d.classList.remove('on'); setTimeout(() => d.remove(), 700); }, hold * 1000);
    while (this.hud.children.length > 5) this.hud.firstElementChild?.remove();
  }
  bootView(on: boolean) { this.boot.classList.toggle('on', on); this.reticle.classList.toggle('on', on); }
  /** the prompt plate: a key cap and the instruction (null hides) */
  prompt(key: string | null, text = '', tip = '') {
    if (!key) { this.promptEl.classList.remove('on'); return; }
    this.promptEl.innerHTML = `<span class="key">${key}</span><span>${text}</span>${tip ? `<span class="tip">${tip}</span>` : ''}`;
    this.promptEl.classList.add('on');
  }
  /** a pulsing target mark at a screen point (null hides) */
  mark(x: number | null, y = 0, label = '') {
    if (x === null) { this.markEl.classList.remove('on'); return; }
    this.markEl.classList.add('on'); this.markEl.style.left = x + 'px'; this.markEl.style.top = y + 'px';
    const t = this.markEl.querySelector('.t') as HTMLDivElement; if (t.textContent !== label) t.textContent = label;
  }
  /** the hold ring at a screen point, k 0..1 (null hides) */
  hold(x: number | null, y = 0, k = 0, label = '') {
    if (x === null) { this.ring.classList.remove('on'); return; }
    this.ring.classList.add('on'); this.ring.style.left = x + 'px'; this.ring.style.top = y + 'px';
    this.ringArc.setAttribute('stroke-dashoffset', String(264 * (1 - Math.max(0, Math.min(1, k)))));
    if (this.ringLab.textContent !== label) this.ringLab.textContent = label;
  }
  clear() { this.prompt(null); this.mark(null); this.hold(null); this.bootView(false); this.hud.innerHTML = ''; }
  dispose() { this.root.remove(); }
}
