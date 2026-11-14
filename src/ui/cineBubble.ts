// A speech balloon drawn by hand on paper, floating over a speaker's head in world space: an off-white sheet with
// a faint grain, a graphite outline that wobbles like a pencil line, a tail that points at the speaker, the line
// typed in as it is spoken, a small name in the corner. It settles in with a slight tilt and lifts away when done.
// Drawn on a canvas at device resolution, so the line work is fine and crisp.
const CSS = /* css */`
.bub { position: fixed; left: 0; top: 0; z-index: 4; pointer-events: auto; cursor: pointer; transform-origin: 50% 100%; opacity: 0; will-change: transform, opacity; }
.bub canvas { position: absolute; left: 0; top: 0; pointer-events: none; }
.bub .bt { position: relative; font-family: 'VT', monospace; font-size: var(--cf-vt1, 14px); line-height: calc(var(--cf-vt1, 14px) + 2px); color: #3b3a36; white-space: pre-wrap; }
.bub .bn { position: relative; font-family: 'Silk', monospace; font-size: var(--cf-ps1, 11px); line-height: var(--cf-ps1, 11px); color: #6b6a62; letter-spacing: 1px; margin-bottom: 2px; }
.bub .bt .cur { opacity: 0.6; }
body.cine-on .bub { visibility: hidden; }
`;
let styled = false;
const h1 = (i: number, s: number) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

export class SpeechBubble {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement; private nameEl: HTMLDivElement; private txt: HTMLDivElement;
  private text = ''; private shown = 0; private alpha = 0; private want = 0; private tilt = 0; private seed = 1;
  private w = 0; private h = 0; private tail = 0;
  onClick?: () => void;
  constructor(parent: HTMLElement) {
    if (!styled) { styled = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
    this.el = document.createElement('div'); this.el.className = 'bub'; parent.appendChild(this.el);
    this.cv = document.createElement('canvas'); this.el.appendChild(this.cv);
    this.nameEl = document.createElement('div'); this.nameEl.className = 'bn'; this.el.appendChild(this.nameEl);
    this.txt = document.createElement('div'); this.txt.className = 'bt'; this.el.appendChild(this.txt);
    this.el.style.display = 'none';
    this.el.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.onClick?.(); });
  }
  get visible() { return this.alpha > 0.01; }
  /** start a line: the balloon is sized for the whole text, then the text types in */
  show(text: string, who = '') {
    this.text = text; this.shown = 0; this.want = 1; this.seed = Math.floor(Math.random() * 1000);
    this.tilt = (h1(this.seed, 3) - 0.5) * 1.6;
    this.nameEl.textContent = who.toUpperCase();
    this.el.style.display = 'block';
    const S = Number(document.documentElement.style.getPropertyValue('--s')) || 2, u = S;
    const pad = 7 * u;
    this.txt.textContent = text; this.el.style.width = 'auto';
    this.el.style.padding = `${pad * 0.8}px ${pad}px ${pad * 0.9}px`;
    this.el.style.maxWidth = `${170 * u}px`;
    const r = this.el.getBoundingClientRect();
    this.w = Math.ceil(r.width); this.h = Math.ceil(r.height); this.tail = 12 * u;
    this.el.style.width = this.w + 'px';
    this.txt.textContent = '';
    this.draw(u);
  }
  hide() { this.want = 0; }
  /** finish typing now */
  hurry() { this.shown = this.text.length; }
  private draw(u: number) {
    const dpr = Math.max(1, Math.min(3, devicePixelRatio || 1));
    const W = this.w + 8 * u, H = this.h + this.tail + 8 * u;
    const cv = this.cv; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.style.left = -4 * u + 'px'; cv.style.top = -4 * u + 'px';
    const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x0 = 4 * u, y0 = 4 * u, w = this.w, h = this.h, r = 7 * u, s = this.seed;
    // the outline as a pencil would go round it: a rounded box, its points nudged off true, the tail drawn in one stroke
    const tx = x0 + w * (0.34 + h1(s, 5) * 0.12), tipX = tx - 6 * u, tipY = y0 + h + this.tail;
    const pts: [number, number][] = [];
    const seg = (ax: number, ay: number, bx: number, by: number) => { const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / (6 * u))); for (let i = 0; i < n; i++) { const t = i / n; pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]); } };
    const arc = (cx: number, cy: number, a0: number) => { for (let i = 0; i < 4; i++) { const a = a0 + (i / 4) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    seg(x0 + r, y0, x0 + w - r, y0); arc(x0 + w - r, y0 + r, -Math.PI / 2);
    seg(x0 + w, y0 + r, x0 + w, y0 + h - r); arc(x0 + w - r, y0 + h - r, 0);
    seg(x0 + w - r, y0 + h, tx + 7 * u, y0 + h);
    pts.push([tx + 3 * u, y0 + h + this.tail * 0.45], [tipX, tipY], [tx - 1 * u, y0 + h + this.tail * 0.35]);
    seg(tx - 4 * u, y0 + h, x0 + r, y0 + h); arc(x0 + r, y0 + h - r, Math.PI / 2);
    seg(x0, y0 + h - r, x0, y0 + r); arc(x0 + r, y0 + r, Math.PI);
    const wob = (i: number) => (h1(i, s) - 0.5) * 0.9;
    const path = () => { g.beginPath(); pts.forEach(([px, py], i) => { const X = px + wob(i), Y = py + wob(i + 99); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.closePath(); };
    // a soft shadow where the sheet lifts off, the paper, its grain
    g.save(); g.translate(1.5 * u, 2 * u); path(); g.fillStyle = 'rgba(12, 12, 14, 0.32)'; g.fill(); g.restore();
    path(); g.fillStyle = '#dcd5c2'; g.fill();
    g.save(); path(); g.clip();
    for (let i = 0; i < (W * H) / 9; i++) { const px = h1(i, s + 1) * W, py = h1(i, s + 2) * H; g.fillStyle = h1(i, s + 3) < 0.5 ? 'rgba(90, 80, 60, 0.07)' : 'rgba(255, 252, 240, 0.12)'; g.fillRect(px, py, 1, 1); }
    g.fillStyle = 'rgba(160, 150, 120, 0.12)'; g.fillRect(x0, y0 + h - 3 * u, w, 3 * u);
    g.restore();
    // the graphite line: two passes, the second a hair off, like a pencil going round twice
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(); g.strokeStyle = 'rgba(59, 58, 54, 0.9)'; g.lineWidth = Math.max(1.25, u * 0.75); g.stroke();
    g.save(); g.translate(0.6, -0.4); path(); g.strokeStyle = 'rgba(59, 58, 54, 0.3)'; g.lineWidth = 1; g.stroke(); g.restore();
    (this as any)._tip = [tipX - x0 + 4 * u - 4 * u, this.h + this.tail];
  }
  /** follow the speaker: (x, y) is the screen point the tail should touch (above their head) */
  update(dt: number, x: number, y: number, onScreen: boolean) {
    this.alpha += ((this.want && onScreen ? 1 : 0) - this.alpha) * Math.min(1, dt * (this.want ? 9 : 6));
    if (this.alpha < 0.01 && !this.want) { this.el.style.display = 'none'; return; }
    const before = Math.floor(this.shown);
    this.shown = Math.min(this.text.length, this.shown + dt * 42);
    const n = Math.floor(this.shown);
    if (n !== before || !this.txt.textContent) this.txt.textContent = this.text.slice(0, n);
    const tip = (this as any)._tip as [number, number] | undefined;
    const lift = (1 - this.alpha) * (this.want ? 10 : -14);
    const left = Math.round(x - (tip ? tip[0] : this.w / 2)), top = Math.round(y - (tip ? tip[1] : this.h) + lift);
    const sc = 0.94 + this.alpha * 0.06;
    this.el.style.transform = `translate(${Math.max(4, Math.min(innerWidth - this.w - 4, left))}px, ${Math.max(4, top)}px) rotate(${this.tilt * this.alpha}deg) scale(${sc})`;
    this.el.style.opacity = this.alpha.toFixed(3);
  }
  dispose() { this.el.remove(); }
}
