// A speech balloon drawn by hand on paper, floating over a speaker's head in world space: a sheet of the master
// palette's paper with clipped corners, an ink outline that wobbles like a pen line, a few hatch strokes of shade in
// one corner, a tail that points at the speaker, the line typed in as it is spoken, a small name in the corner. It settles in with a slight tilt and lifts away when done.
// Drawn on a canvas at device resolution, so the line work is fine and crisp.
const CSS = /* css */`
.bub { position: fixed; left: 0; top: 0; z-index: 4; pointer-events: auto; cursor: pointer; transform-origin: 50% 100%; opacity: 0; will-change: transform, opacity; }
.bub canvas { position: absolute; left: 0; top: 0; pointer-events: none; }
.bub .bt { position: relative; font-family: 'Body', monospace; font-size: 22px; line-height: 26px; color: #1f232b; white-space: pre-wrap; -webkit-font-smoothing: none; }
.bub .bn { position: relative; font-family: 'Body', monospace; font-size: 11px; line-height: 14px; color: #6f6858; letter-spacing: 1px; margin-bottom: 4px; -webkit-font-smoothing: none; }
.bub .bt .cur { opacity: 0.6; }
body.cine-on .bub { visibility: hidden; }
body.cine-on .bub.keep { visibility: visible; z-index: 41; }
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
    const pad = 10 * u;
    this.txt.textContent = text; this.el.style.width = 'auto';
    this.el.style.padding = `${pad * 0.8}px ${pad}px ${pad * 0.9}px`;
    this.el.style.maxWidth = `${230 * u}px`;
    const r = this.el.getBoundingClientRect();
    this.w = Math.ceil(r.width); this.h = Math.ceil(r.height); this.tail = 12 * u;
    this.el.style.width = this.w + 'px';
    this.txt.textContent = '';
    this.tipRel = -1; this.up = false;
    this.draw(u);
  }
  hide() { this.want = 0; }
  /** finish typing now */
  hurry() { this.shown = this.text.length; }
  /** HUD panels the balloon must stay clear of (visible ones only) */
  static AVOID = '.hud .mod, .hud .wl, .hud .wl-desc, .hud-obj, .hud-dialog .dlg';
  private rects: DOMRect[] = []; private rectT = 0;
  private tipRel = -1; private up = false; private u = 2;
  /** paint the sheet with its tail leaving the bottom edge (or the top edge when flipped) at tipRel px from the left */
  private draw(u: number, tipRel = -1, up = false) {
    // pixel art at whole pixels: a textured paper sheet (fibres, a little foxing, a fold) and a hand-inked border laid
    // with a square pen that wobbles, the tail in the same stroke; a hard offset shadow under it
    this.u = u;
    const k = Math.max(1, Math.round(devicePixelRatio || 1));
    const W = Math.round(this.w + 8 * u), H = Math.round(this.h + this.tail + 8 * u);
    const cv = this.cv; cv.width = W * k; cv.height = H * k;
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.style.left = Math.round(-4 * u) + 'px'; cv.style.top = Math.round(up ? -4 * u - this.tail : -4 * u) + 'px';
    cv.style.imageRendering = 'pixelated';
    const g = cv.getContext('2d')!; g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = false;
    if (up) { g.translate(0, H); g.scale(1, -1); }
    const x0 = Math.round(4 * u), y0 = Math.round(4 * u), w = Math.round(this.w), h = Math.round(this.h), c = Math.round(5 * u), s = this.seed;
    const tr = tipRel < 0 ? Math.round(w * (0.34 + h1(s, 5) * 0.12) - 6 * u) : Math.round(tipRel);
    const tipX = x0 + tr, tx = Math.round(Math.min(x0 + w - c - 9 * u, Math.max(x0 + c + 6 * u, tipX + 6 * u))), tipY = y0 + h + this.tail;
    this.tipRel = tr; this.up = up;
    // the outline points: a box with clipped corners, the tail in one stroke
    const P: [number, number][] = [[x0 + c, y0], [x0 + w - c, y0], [x0 + w, y0 + c], [x0 + w, y0 + h - c], [x0 + w - c, y0 + h], [tx + 7 * u, y0 + h], [tipX, tipY], [tx - 2 * u, y0 + h], [x0 + c, y0 + h], [x0, y0 + h - c], [x0, y0 + c], [x0 + c, y0]];
    const poly = (dx: number, dy: number) => { g.beginPath(); P.forEach(([px, py], i) => (i ? g.lineTo(px + dx, py + dy) : g.moveTo(px + dx, py + dy))); g.closePath(); };
    g.fillStyle = 'rgba(14, 12, 10, 0.55)'; poly(3, 3); g.fill();
    g.fillStyle = '#e4dcc6'; poly(0, 0); g.fill();
    // paper: fibres (short 1 px strokes, a shade either way), foxing specks placed sparsely, a soft fold
    g.save(); poly(0, 0); g.clip();
    for (let i = 0; i < (w * h) / 22; i++) {
      const fx = x0 + Math.floor(h1(i, s + 1) * w), fy = y0 + Math.floor(h1(i, s + 2) * h), L = 2 + Math.floor(h1(i, s + 3) * 4), dir = h1(i, s + 4) < 0.5;
      g.fillStyle = h1(i, s + 6) < 0.55 ? '#d8cfb6' : '#efe8d6';
      if (dir) g.fillRect(fx, fy, L, 1); else g.fillRect(fx, fy, 1, Math.max(1, L - 2));
    }
    for (let i = 0; i < 3; i++) { const fx = x0 + 8 + Math.floor(h1(i, s + 9) * (w - 16)), fy = y0 + 6 + Math.floor(h1(i, s + 10) * (h - 12)); g.fillStyle = '#cdb994'; g.fillRect(fx, fy, 2, 1); g.fillRect(fx + 1, fy + 1, 1, 1); if (i === 0) { g.fillStyle = '#d6c4a2'; g.fillRect(fx + 2, fy + 1, 2, 2); } }
    const fold = x0 + Math.round(w * (0.55 + h1(s, 12) * 0.2));
    g.fillStyle = 'rgba(150, 136, 110, 0.35)'; g.fillRect(fold, y0, 1, h); g.fillStyle = 'rgba(255, 252, 240, 0.4)'; g.fillRect(fold + 1, y0, 1, h);
    g.fillStyle = 'rgba(120, 104, 80, 0.12)'; g.fillRect(x0 + w - 18 * u, y0 + h - 7 * u, 14 * u, 5 * u);
    g.restore();
    // the inked border: a square pen walked round the outline, drifting a little
    const pen = (bw: number, col: string) => {
      g.fillStyle = col; let n = 0;
      for (let i = 0; i < P.length - 1; i++) {
        const [ax, ay] = P[i], [bx, by] = P[i + 1], L = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay)));
        for (let j = 0; j < L; j++, n++) {
          const t = j / L, d = (Math.sin(n * 0.17 + s) + Math.sin(n * 0.43 + s * 2.1) * 0.5) * 0.6;
          g.fillRect(Math.round(ax + (bx - ax) * t - bw / 2 + d), Math.round(ay + (by - ay) * t - bw / 2 + d * 0.7), bw, bw);
        }
      }
    };
    pen(Math.max(2, Math.round(u)), '#1f1b17');
  }
  /** where to put the sheet so the tail touches (x, y): above or below, shifted sideways, clear of the HUD */
  private place(x: number, y: number) {
    const u = this.u, w = this.w, h = this.h, T = this.tail, M = 6;
    const lo = 13 * u, hi = w - 13 * u; // the tail may leave anywhere along this stretch of the edge
    let best = { left: 0, top: 0, tip: this.tipRel, up: false }, bs = 1e18;
    const overlap = (L: number, Tp: number) => {
      let a = 0;
      for (const r of this.rects) { const ox = Math.min(L + w, r.right + M) - Math.max(L, r.left - M), oy = Math.min(Tp + h, r.bottom + M) - Math.max(Tp, r.top - M); if (ox > 0 && oy > 0) a += ox * oy; }
      const offX = Math.max(0, 4 - L) + Math.max(0, L + w - innerWidth + 4), offY = Math.max(0, 4 - Tp) + Math.max(0, Tp + h - innerHeight + 4);
      return a + (offX + offY) * h * 4;
    };
    for (const up of [false, true]) for (let k = 0; k <= 8; k++) {
      const tip = lo + ((hi - lo) * k) / 8;
      const L = x - tip, Tp = up ? y + 46 * u + T : y - h - T; // flipped: below the speaker, the tail reaching back up
      const sc = overlap(L, Tp) * 10 + Math.abs(tip - this.tipRel) * 0.5 + (up ? h * w * 0.6 : 0);
      if (sc < bs) { bs = sc; best = { left: L, top: Tp, tip, up }; }
    }
    if (Math.abs(best.tip - this.tipRel) > 1 || best.up !== this.up) this.draw(u, best.tip, best.up);
    return best;
  }
  /** follow the speaker: (x, y) is the screen point the tail should touch (above their head) */
  private offT = 0;
  update(dt: number, x: number, y: number, onScreen: boolean) {
    this.offT = onScreen ? 0 : this.offT + dt;
    const show = this.want && this.offT < 0.4;
    this.alpha += ((show ? 1 : 0) - this.alpha) * Math.min(1, dt * (show ? 14 : 6));
    if (show && this.alpha > 0.97) this.alpha = 1;
    if (this.alpha < 0.01 && !this.want) { this.el.style.display = 'none'; return; }
    const before = Math.floor(this.shown);
    this.shown = Math.min(this.text.length, this.shown + dt * 42);
    const n = Math.floor(this.shown);
    if (n !== before || !this.txt.textContent) this.txt.textContent = this.text.slice(0, n);
    // the HUD's panels, re-read a few times a second
    this.rectT -= dt;
    if (this.rectT <= 0) {
      this.rectT = 0.25;
      this.rects = [];
      document.querySelectorAll<HTMLElement>(SpeechBubble.AVOID).forEach((e) => {
        const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return; // (fixed panels have no offsetParent: test the box itself)
        const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return;
        this.rects.push(r);
      });
    }
    const p = this.place(x, y);
    const lift = (1 - this.alpha) * (this.want ? 10 : -14) * (p.up ? -1 : 1);
    const sc = 0.94 + this.alpha * 0.06;
    // whole-pixel placement only: no rotation or scale, so the type stays on its pixel grid
    void sc;
    this.el.style.transform = `translate(${Math.round(p.left)}px, ${Math.round(p.top + lift)}px)`;
    this.el.style.opacity = this.alpha.toFixed(3);
  }
  dispose() { this.el.remove(); }
}
