// The lab's FITTING BAY overlay: no panels. The specimen standing in the bay is the interface, and everything drawn
// over it is a hand-made doodle: ink leader lines with a little wobble, paper tags with a strip of tape, a ring
// sketched under each part on offer. Hover a slot on the body and a callout names it; pick it and the candidate
// parts float round the animal (3D, labBay.ts); drag one onto the body. What each fitted part gives is a callout
// pointing at that part (CARRY +30 at the cargo frame), the role a big tag pointing at the animal. Two taped tags
// in the corners: BACK and FILE. Text is sparse: Departure Mono ('Body', 22 px) and Spleen ('Title', 24/48 px).
import { el, ui, Tip } from './kit';
import { sfx } from '../audio/audio';
import { itemIcon } from '../factory/items';

export interface Callout {
  /** where it points (screen px) */
  x: number; y: number;
  text: string; sub?: string;
  /** a big role tag; a hot (hovered) one; item icons with counts under the text */
  big?: boolean; hot?: boolean; icons?: { id: string; n: number; short?: boolean }[];
  /** which side the tag sits on (-1 left, 1 right), how far up; or an explicit spot for the tag's near edge */
  side?: number; lift?: number; tx?: number; ty?: number;
}
export interface Ring { pts: { x: number; y: number }[]; hot: boolean }
export interface FitHandlers { back(): void; file(): void; fileOk(): string | false }

const INK = '#1b1714', CHALK = '#efe4c8', PAPER = '#e6d9bb', PAPER2 = '#cbbd9c', TAPE = 'rgba(214, 196, 120, 0.72)', HOT = '#f2b23a';
/** a stable jitter from a string (the same tag wobbles the same way every frame) */
const seedOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rnd = (seed: number) => { let s = seed || 1; return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296); };

export class LabFit {
  readonly root: HTMLDivElement;
  private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  private back: HTMLButtonElement; private file: HTMLButtonElement;
  private icons = new Map<string, HTMLImageElement>();
  private onResize = () => this.size();
  private on = false; private t = 0;
  constructor(readonly h: FitHandlers) {
    // the gene bench's paper UI (instrument strip, record, card file, speech bubbles) steps aside in the bay
    if (!document.getElementById('lbv-css')) { const st = document.createElement('style'); st.id = 'lbv-css'; st.textContent = 'body.lab-fit .lab { display: none !important; }'; document.head.appendChild(st); }
    this.root = el('div', 'lbv', ui()) as HTMLDivElement;
    Object.assign(this.root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '4', display: 'none' });
    this.cv = el('canvas', '', this.root) as HTMLCanvasElement;
    Object.assign(this.cv.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', imageRendering: 'pixelated' });
    this.g = this.cv.getContext('2d')!;
    const tag = (label: string, right: boolean, tip: string, fn: () => void) => {
      const b = el('button', '', this.root, label) as HTMLButtonElement;
      Object.assign(b.style, { position: 'absolute', top: '18px', [right ? 'right' : 'left']: '22px', pointerEvents: 'auto', border: 'none', cursor: 'pointer', font: "24px 'Title', monospace", color: INK, padding: '14px 26px 12px', backgroundColor: 'transparent', backgroundSize: '100% 100%', imageRendering: 'pixelated' });
      b.addEventListener('click', (e) => { e.stopPropagation(); sfx('click', 1, 0.6); fn(); });
      b.addEventListener('pointerenter', () => { Tip.show(tip, b); sfx('hover', 1.3, 0.3); b.style.filter = 'brightness(1.08)'; });
      b.addEventListener('pointerleave', () => { Tip.hide(); b.style.filter = ''; });
      requestAnimationFrame(() => { b.style.backgroundImage = `url(${this.paperTag(b.offsetWidth, b.offsetHeight, seedOf(label))})`; });
      return b;
    };
    this.back = tag('BACK', false, 'Leave the bay. [ESC]', () => h.back());
    this.file = tag('FILE WORKER', true, '<h4>File the worker</h4>Stamp the design: the colony can grow and fit it.', () => h.file());
    this.size(); addEventListener('resize', this.onResize);
  }
  private size() { this.cv.width = innerWidth; this.cv.height = innerHeight; }
  setMode(m: 'genes' | 'fit') {
    this.on = m === 'fit';
    this.root.style.display = this.on ? '' : 'none';
    document.body.classList.toggle('lab-fit', this.on);
  }
  /** a paper tag with a torn edge, an ink outline and a strip of tape (a data URL for buttons) */
  private paperTag(w: number, hh: number, seed: number) {
    const c = document.createElement('canvas'); c.width = Math.max(8, w); c.height = Math.max(8, hh);
    const g = c.getContext('2d')!; this.tagShape(g, 2, 2, c.width - 4, c.height - 4, seed, false);
    return c.toDataURL();
  }
  /** the tag body: an uneven paper quad, its ink edge drawn twice by hand, tape across one corner */
  private tagShape(g: CanvasRenderingContext2D, x: number, y: number, w: number, hh: number, seed: number, hot: boolean) {
    const r = rnd(seed), j = () => Math.round((r() - 0.5) * 3);
    const pts = [[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + hh + j()], [x + j(), y + hh + j()]];
    g.fillStyle = hot ? '#f3e6c4' : PAPER; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill();
    g.fillStyle = PAPER2; g.fillRect(Math.round(x + 2), Math.round(y + hh - 3), Math.round(w - 4), 2);
    for (let k = 0; k < 2; k++) { g.strokeStyle = INK; g.lineWidth = k ? 1 : 2; g.beginPath(); pts.forEach(([px, py], i) => { const qx = px + (k ? j() * 0.5 : 0), qy = py + (k ? j() * 0.5 : 0); if (i) g.lineTo(qx, qy); else g.moveTo(qx, qy); }); g.closePath(); g.stroke(); }
    // tape
    g.save(); g.translate(Math.round(x + (r() < 0.5 ? 10 : w - 10)), Math.round(y)); g.rotate((r() - 0.5) * 0.6); g.fillStyle = TAPE; g.fillRect(-12, -6, 24, 11); g.restore();
  }
  /** an ink line drawn by hand: a dark underline for contrast, a chalk line over it, each with its own wobble */
  private ink(pts: { x: number; y: number }[], seed: number, hot: boolean, w = 2) {
    const g = this.g;
    for (const [col, lw, sd] of [[INK, w + 2, seed], [hot ? HOT : CHALK, w, seed + 7]] as [string, number, number][]) {
      const r = rnd(sd);
      g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
      pts.forEach((p, i) => { const x = Math.round(p.x + (r() - 0.5) * 1.6) + 0.5, y = Math.round(p.y + (r() - 0.5) * 1.6) + 0.5; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    }
  }
  private icon(id: string): HTMLImageElement | null {
    let im = this.icons.get(id);
    if (!im) { im = new Image(); try { im.src = itemIcon(id); } catch { /* unknown item */ } this.icons.set(id, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  /** draw this frame's doodles */
  frame(dt: number, calls: Callout[], rings: Ring[], hint?: string) {
    if (!this.on) return;
    this.t += dt;
    const g = this.g, W = this.cv.width, Hh = this.cv.height;
    g.clearRect(0, 0, W, Hh); g.imageSmoothingEnabled = false; g.textBaseline = 'top';
    // rings under the parts on offer
    rings.forEach((r, i) => { if (r.pts.length > 2) this.ink([...r.pts, r.pts[0]], 900 + i, r.hot, r.hot ? 2 : 1); });
    // callouts: a leader line with an elbow from the point to a taped paper tag
    for (const c of calls) {
      const seed = seedOf(c.text), side = c.side ?? (c.x < W / 2 ? -1 : 1), lift = c.lift ?? 70;
      g.font = c.big ? "48px 'Title', monospace" : "24px 'Title', monospace";
      const tw = g.measureText(c.text).width; g.font = "22px 'Body', monospace";
      const sw = c.sub ? g.measureText(c.sub).width : 0, iw = (c.icons?.length ?? 0) * 52;
      const w = Math.round(Math.max(tw, sw, iw) + 28), hh = (c.big ? 58 : 34) + (c.sub ? 26 : 0) + (c.icons?.length ? 30 : 0);
      const ex = Math.round(c.tx ?? c.x + side * (c.big ? 70 : 54)), ey = Math.round(c.ty ?? c.y - lift), tx = side > 0 ? ex : ex - w, ty = ey - Math.round(hh / 2);
      // the dot where it points, then the line
      g.fillStyle = INK; g.fillRect(Math.round(c.x) - 3, Math.round(c.y) - 3, 7, 7); g.fillStyle = c.hot ? HOT : CHALK; g.fillRect(Math.round(c.x) - 2, Math.round(c.y) - 2, 5, 5);
      this.ink([{ x: c.x, y: c.y }, { x: c.x + side * 14, y: ey }, { x: ex, y: ey }], seed, !!c.hot);
      this.tagShape(g, tx, ty, w, hh, seed, !!c.hot);
      g.fillStyle = INK; g.font = c.big ? "48px 'Title', monospace" : "24px 'Title', monospace"; g.fillText(c.text, tx + 14, ty + 8);
      let yy = ty + (c.big ? 58 : 34);
      if (c.sub) { g.font = "22px 'Body', monospace"; g.fillStyle = '#4a3c35'; g.fillText(c.sub, tx + 14, yy - 2); yy += 26; }
      if (c.icons?.length) {
        let x = tx + 14;
        g.font = "22px 'Body', monospace";
        for (const ic of c.icons) { const im = this.icon(ic.id); if (im) g.drawImage(im, x, yy, 22, 22); g.fillStyle = ic.short ? '#9a1f26' : INK; g.fillText(String(ic.n), x + 25, yy); x += 52; }
      }
    }
    if (hint) {
      g.font = "22px 'Body', monospace"; const w = g.measureText(hint).width;
      g.fillStyle = INK; g.fillText(hint, Math.round(W / 2 - w / 2) + 1, Hh - 47); g.fillStyle = CHALK; g.fillText(hint, Math.round(W / 2 - w / 2), Hh - 48);
    }
    const why = this.h.fileOk(); this.file.style.opacity = why ? '0.55' : '1'; this.file.title = why || '';
  }
  dispose() { removeEventListener('resize', this.onResize); document.body.classList.remove('lab-fit'); this.root.remove(); Tip.hide(); }
}
