// A whole-pixel canvas for the crew and intro UI (crew/doodle.ts draws its pen strokes on it): drawn at whole CSS
// pixels times a whole device ratio, never smoothed. Type is the house faces only (Departure Mono 'Body' at 11/22/33,
// Spleen 'Title' at 24/48), binarised so every glyph pixel is a whole pixel.
export const DPR = () => Math.max(1, Math.round(devicePixelRatio || 1));

export class Px {
  readonly c: HTMLCanvasElement; readonly g: CanvasRenderingContext2D; readonly k: number;
  constructor(readonly w: number, readonly h: number) {
    this.k = DPR();
    this.c = document.createElement('canvas'); this.c.width = w * this.k; this.c.height = h * this.k;
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px'; this.c.style.imageRendering = 'pixelated';
    this.g = this.c.getContext('2d', { willReadFrequently: true })!; this.g.imageSmoothingEnabled = false; this.g.scale(this.k, this.k);
  }
  r(x: number, y: number, w: number, h: number, c: string) { this.g.fillStyle = c; this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); return this; }
  p(x: number, y: number, c: string) { return this.r(x, y, 1, 1, c); }
  hl(x0: number, x1: number, y: number, c: string) { return this.r(x0, y, x1 - x0 + 1, 1, c); }
  vl(x: number, y0: number, y1: number, c: string) { return this.r(x, y0, 1, y1 - y0 + 1, c); }
  /** a pixel line (Bresenham) */
  line(x0: number, y0: number, x1: number, y1: number, c: string) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (let i = 0; i < 2000; i++) { this.p(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
    return this;
  }
  /** text in a house face at a native size, binarised to whole pixels; returns its width */
  text(s: string, x: number, y: number, face: 'Body' | 'Title' | 'TitleL', size: number, col: string, o: { shadow?: string; align?: 'left' | 'center' | 'right' } = {}) {
    const g = this.g; g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = `${size * this.k}px '${face}', monospace`; g.textBaseline = 'top';
    const w = Math.ceil(g.measureText(s).width / this.k);
    const X = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
    // draw on a scratch canvas, threshold, stamp
    const sc = document.createElement('canvas'); sc.width = (w + 4) * this.k; sc.height = Math.ceil(size * 1.4) * this.k;
    const sg = sc.getContext('2d', { willReadFrequently: true })!; sg.font = g.font; sg.textBaseline = 'top'; sg.fillStyle = '#fff'; sg.fillText(s, 0, Math.round(size * 0.1 * this.k));
    const d = sg.getImageData(0, 0, sc.width, sc.height), out = sg.createImageData(sc.width, sc.height);
    const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const put = (col: string, ox: number, oy: number) => { const [r, gg, b] = rgb(col); for (let i = 0; i < d.data.length; i += 4) if (d.data[i + 3] > 110) { const px = (i / 4) % sc.width + ox, py = Math.floor(i / 4 / sc.width) + oy; if (px < 0 || py < 0 || px >= sc.width || py >= sc.height) continue; const j = (py * sc.width + px) * 4; out.data[j] = r; out.data[j + 1] = gg; out.data[j + 2] = b; out.data[j + 3] = 255; } };
    if (o.shadow) put(o.shadow, this.k, this.k);
    put(col, 0, 0);
    sg.putImageData(out, 0, 0);
    g.drawImage(sc, X * this.k, Math.round(y) * this.k);
    g.restore();
    return w;
  }
}
