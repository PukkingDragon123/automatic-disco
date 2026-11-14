// A speech balloon drawn by hand on paper, floating over a speaker's head in world space: an off-white sheet with
// a faint grain, a graphite outline that wobbles like a pencil line, a tail that points at the speaker, the line
// typed in as it is spoken, a small name in the corner. It settles in with a slight tilt and lifts away when done.
// Drawn on a canvas at device resolution, so the line work is fine and crisp.
const CSS = /* css */`
.bub { position: fixed; left: 0; top: 0; z-index: 4; pointer-events: auto; cursor: pointer; transform-origin: 50% 100%; opacity: 0; will-change: transform, opacity; }
.bub canvas { position: absolute; left: 0; top: 0; pointer-events: none; }
.bub .bt { position: relative; font-family: 'VT', monospace; font-size: var(--cf-vt2, 28px); line-height: calc(var(--cf-vt2, 28px) + 2px); color: #1f1e1b; white-space: pre-wrap; }
.bub .bn { position: relative; font-family: 'Silk', monospace; font-size: var(--cf-ps1, 11px); line-height: var(--cf-ps1, 11px); color: #4a4944; letter-spacing: 1px; margin-bottom: 4px; }
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
    this.u = u;
    const dpr = Math.max(1, Math.min(3, devicePixelRatio || 1));
    const W = this.w + 8 * u, H = this.h + this.tail + 8 * u;
    const cv = this.cv; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.style.left = -4 * u + 'px'; cv.style.top = (up ? -4 * u - this.tail : -4 * u) + 'px';
    const g = cv.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (up) { g.translate(0, H); g.scale(1, -1); } // flipped: the same drawing mirrored, tail up (the text sits on top of it)
    const x0 = 4 * u, y0 = 4 * u, w = this.w, h = this.h, r = 7 * u, s = this.seed;
    const tr = tipRel < 0 ? w * (0.34 + h1(s, 5) * 0.12) - 6 * u : tipRel;
    const tipX = x0 + tr, tx = Math.min(x0 + w - r - 9 * u, Math.max(x0 + r + 6 * u, tipX + 6 * u)), tipY = y0 + h + this.tail;
    this.tipRel = tr; this.up = up;
    // the outline as a pencil would go round it: a rounded box, its points nudged off true, the tail in one stroke
    const pts: [number, number][] = [];
    const seg = (ax: number, ay: number, bx: number, by: number) => { const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / (6 * u))); for (let k = 0; k < n; k++) { const t = k / n; pts.push([ax + (bx - ax) * t, ay + (by - ay) * t]); } };
    const arc = (cx: number, cy: number, a0: number) => { for (let k = 0; k < 4; k++) { const a = a0 + (k / 4) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    seg(x0 + r, y0, x0 + w - r, y0); arc(x0 + w - r, y0 + r, -Math.PI / 2);
    seg(x0 + w, y0 + r, x0 + w, y0 + h - r); arc(x0 + w - r, y0 + h - r, 0);
    seg(x0 + w - r, y0 + h, tx + 7 * u, y0 + h);
    pts.push([tx + 3 * u, y0 + h + this.tail * 0.45], [tipX, tipY], [tx - 1 * u, y0 + h + this.tail * 0.35]);
    seg(tx - 4 * u, y0 + h, x0 + r, y0 + h); arc(x0 + r, y0 + h - r, Math.PI / 2);
    seg(x0, y0 + h - r, x0, y0 + r); arc(x0 + r, y0 + r, Math.PI);
    const wob = (k: number) => (h1(k, s) - 0.5) * 0.9;
    const path = () => { g.beginPath(); pts.forEach(([px, py], k) => { const X = px + wob(k), Y = py + wob(k + 99); if (k) g.lineTo(X, Y); else g.moveTo(X, Y); }); g.closePath(); };
    g.save(); g.translate(2 * u, up ? -3 * u : 3 * u); path(); g.fillStyle = 'rgba(10, 10, 12, 0.5)'; g.fill(); g.restore();
    path(); g.fillStyle = '#e4ddcb'; g.fill();
    g.save(); path(); g.clip();
    for (let k = 0; k < (W * H) / 9; k++) { const px = h1(k, s + 1) * W, py = h1(k, s + 2) * H; g.fillStyle = h1(k, s + 3) < 0.5 ? 'rgba(90, 80, 60, 0.07)' : 'rgba(255, 252, 240, 0.12)'; g.fillRect(px, py, 1, 1); }
    g.restore();
    g.lineJoin = 'round'; g.lineCap = 'round';
    path(); g.strokeStyle = '#2a2925'; g.lineWidth = Math.max(1.5, u * 0.9); g.stroke();
    g.save(); g.translate(0.6, -0.4); path(); g.strokeStyle = 'rgba(59, 58, 54, 0.3)'; g.lineWidth = 1; g.stroke(); g.restore();
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
    this.el.style.transformOrigin = p.up ? `${p.tip}px 0` : `${p.tip}px 100%`;
    this.el.style.transform = `translate(${Math.round(p.left)}px, ${Math.round(p.top + lift)}px) rotate(${this.tilt * this.alpha}deg) scale(${sc})`;
    this.el.style.opacity = this.alpha.toFixed(3);
  }
  dispose() { this.el.remove(); }
}
