// Hand-painted pixel-art hardware for the crew and intro UI, drawn pixel by pixel on canvases at whole CSS pixels
// (times a whole device ratio): gunmetal plates with bevels, engraved seams, slotted screws, scratches and chipped
// edges placed by hand, recessed phosphor glass with scanlines and a lit bloom row, cream key caps, a segmented LED
// dial, violet target brackets. Type is the house faces only (Departure Mono 'Body' at 11/22/33, Spleen 'Title' at
// 24/48), binarised so every glyph pixel is a whole pixel.
const GM = ['#0e1012', '#16191c', '#22262a', '#2e3236', '#3a3f44', '#4a5056', '#5c636a', '#727a80', '#8d8f8a', '#b0b2aa'];
const PH = { bg: '#0a1410', bg2: '#0d1a14', line: '#0f2018', ink: '#8fe0b0', dim: '#4f8a6a', hot: '#c8ffd8' };
const CREAM = ['#5a5446', '#8a826c', '#b8b09a', '#d8d2bc', '#ece6d2'];
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
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

/** a slotted screw head, 5 x 5 */
function screw(P: Px, x: number, y: number, seed: number) {
  P.r(x + 1, y, 3, 1, GM[1]).r(x, y + 1, 1, 3, GM[1]).r(x + 4, y + 1, 1, 3, GM[1]).r(x + 1, y + 4, 3, 1, GM[1]);
  P.r(x + 1, y + 1, 3, 3, GM[7]).p(x + 1, y + 1, GM[9]).p(x + 3, y + 3, GM[5]);
  if (seed % 2) P.p(x + 1, y + 3, GM[2]).p(x + 2, y + 2, GM[2]).p(x + 3, y + 1, GM[2]); else P.r(x + 1, y + 2, 3, 1, GM[2]);
}
/** a gunmetal plate: outline, bevels, an engraved seam, screws, placed scratches and chips */
export function plate(P: Px, x: number, y: number, w: number, h: number, seed = 1, o: { screws?: boolean; seam?: boolean; tone?: number } = {}) {
  const t = o.tone ?? 4;
  P.r(x, y, w, h, GM[0]);
  P.r(x + 1, y + 1, w - 2, h - 2, GM[t]);
  // bevels: lit top-left, shadow bottom-right
  P.hl(x + 1, x + w - 2, y + 1, GM[t + 3]).hl(x + 2, x + w - 3, y + 2, GM[t + 2]).vl(x + 1, y + 1, y + h - 2, GM[t + 2]).vl(x + 2, y + 2, y + h - 3, GM[t + 1]);
  P.hl(x + 1, x + w - 2, y + h - 2, GM[t - 3]).hl(x + 2, x + w - 3, y + h - 3, GM[t - 2]).vl(x + w - 2, y + 1, y + h - 2, GM[t - 3]).vl(x + w - 3, y + 2, y + h - 3, GM[t - 2]);
  // a few hand-placed brushed streaks
  for (let i = 0; i < Math.floor(h / 6); i++) { const yy = y + 5 + Math.floor(h1(i, seed) * (h - 10)), x0 = x + 6 + Math.floor(h1(i, seed + 1) * w * 0.5), L = 6 + Math.floor(h1(i, seed + 2) * w * 0.3); P.hl(x0, Math.min(x + w - 6, x0 + L), yy, GM[t + 1]); }
  if (o.seam !== false && h > 22) { P.hl(x + 7, x + w - 8, y + 6, GM[t - 2]).hl(x + 7, x + w - 8, y + 7, GM[t + 1]); P.hl(x + 7, x + w - 8, y + h - 8, GM[t - 2]).hl(x + 7, x + w - 8, y + h - 7, GM[t + 1]); }
  // scratches: three short diagonal strokes, light on the lit side
  for (let i = 0; i < 3; i++) { const sx = x + 12 + Math.floor(h1(i, seed + 7) * (w - 30)), sy = y + 8 + Math.floor(h1(i, seed + 9) * (h - 16)), L = 4 + Math.floor(h1(i, seed + 3) * 7); P.line(sx, sy, sx + L, sy + Math.floor(L / 3), GM[t + 3]); }
  // chipped paint on the top edge: bare steel
  for (let i = 0; i < 2; i++) { const cx = x + 10 + Math.floor(h1(i, seed + 11) * (w - 24)); P.r(cx, y + 1, 3, 1, GM[8]).p(cx + 1, y + 2, GM[7]); }
  if (o.screws !== false) { screw(P, x + 4, y + 4, seed); screw(P, x + w - 9, y + 4, seed + 1); screw(P, x + 4, y + h - 9, seed + 2); screw(P, x + w - 9, y + h - 9, seed + 3); }
}
/** recessed phosphor glass: an inverted bevel, the dark field, scanlines, a lit bloom row under the top edge */
export function glass(P: Px, x: number, y: number, w: number, h: number) {
  P.r(x - 1, y - 1, w + 2, h + 2, GM[1]).hl(x - 1, x + w, y + h, GM[6]).vl(x + w, y - 1, y + h, GM[6]);
  P.r(x, y, w, h, PH.bg);
  for (let j = 0; j < h; j += 2) P.hl(x, x + w - 1, y + j, PH.line);
  P.hl(x + 1, x + w - 2, y + 1, '#163428').hl(x + 2, x + w - 3, y + 2, '#12291f');
  P.p(x + 2, y + 2, '#2a5a44').p(x + 3, y + 2, '#2a5a44').p(x + 2, y + 3, '#1e4434');
}
/** a cream key cap with a label */
export function keycap(P: Px, x: number, y: number, label: string) {
  const w = Math.max(40, label.length * 12 + 16), h = 34;
  P.r(x, y + 2, w, h, CREAM[0]);
  P.r(x, y, w, h - 2, CREAM[1]).r(x + 1, y + 1, w - 2, h - 5, CREAM[3]).hl(x + 1, x + w - 2, y + 1, CREAM[4]).vl(x + 1, y + 1, y + h - 5, CREAM[4]).hl(x + 2, x + w - 2, y + h - 4, CREAM[2]);
  P.text(label, x + w / 2, y + 4, 'Title', 24, '#2a2620', { align: 'center' });
  return w;
}

// ------------------------------------------------------------------ the pieces
/** the playable-beat prompt: a plate with a key cap and the instruction on phosphor glass */
export function promptPlate(key: string, text: string, tip = ''): HTMLCanvasElement {
  const mw = document.createElement('canvas').getContext('2d')!; mw.font = "22px 'Body'";
  const tw = Math.ceil(mw.measureText(text).width) + (tip ? Math.ceil(mw.measureText('  ' + tip).width) : 0);
  const kw = Math.max(40, key.length * 12 + 16);
  const W = 16 + kw + 14 + tw + 26, H = 58;
  const P = new Px(W, H);
  plate(P, 0, 0, W, H, key.length + text.length, { seam: false });
  keycap(P, 13, 10, key);
  const gx = 13 + kw + 10;
  glass(P, gx, 10, W - gx - 13, H - 20);
  const w1 = P.text(text, gx + 8, 16, 'Body', 22, PH.ink, { shadow: '#06100a' });
  if (tip) P.text('  ' + tip, gx + 8 + w1, 16, 'Body', 22, '#e2b45a', { shadow: '#06100a' });
  return P.c;
}
/** the hold dial: a steel bezel ring with 24 lamp segments lit to k, a label plate under it */
export function holdDial(k: number, label: string): HTMLCanvasElement {
  const S = 100, P = new Px(S, S + 34), c = S / 2;
  // the bezel: rings of pixels, lit from the upper left
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
    if (d > 47 || d < 30) continue;
    const lit = (-dx - dy) / (d || 1);
    if (d > 45.5) P.p(x, y, GM[0]);
    else if (d > 41) P.p(x, y, lit > 0.3 ? GM[7] : lit > -0.3 ? GM[5] : GM[3]);
    else if (d > 32) P.p(x, y, GM[1]);
    else P.p(x, y, lit > 0 ? GM[2] : GM[5]);
  }
  // 24 lamp segments in the channel
  const n = 24, on = Math.round(k * n);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI * 2;
    for (let r = 34; r <= 39; r++) for (let da = -0.08; da <= 0.08; da += 0.02) {
      const x = Math.round(c + Math.cos(a + da) * r - 0.5), y = Math.round(c + Math.sin(a + da) * r - 0.5);
      P.p(x, y, i < on ? (r === 36 ? '#e8e0ff' : '#9a8cff') : '#26233a');
    }
  }
  // the hub: a dark cap with the percentage
  P.text(Math.round(k * 100) + '%', c, c - 12, 'Body', 22, '#c8c0ff', { align: 'center', shadow: '#000000' });
  if (label) { const lw = Math.min(S, label.length * 11 + 12); plate(P, c - lw / 2, S + 2, lw, 28, 3, { screws: false, seam: false, tone: 3 }); P.text(label, c, S + 5, 'Body', 22, '#e2b45a', { align: 'center' }); }
  return P.c;
}
/** violet target brackets round a pick (two frames: t 0 or 1, for a stepped pulse) and a label plate */
export function brackets(label: string, t: 0 | 1): HTMLCanvasElement {
  const S = 72, lw = Math.max(S, label.length * 11 + 16), P = new Px(Math.max(S, lw), S + 34);
  const o = (P.w - S) / 2, m = t ? 4 : 8, L = 14;
  const col = ['#3a2f7a', '#9a8cff', '#e8e0ff'];
  for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as [number, number][]) {
    const x = o + (sx ? S - m - 1 : m), y = sy ? S - m - 1 : m, dx = sx ? -1 : 1, dy = sy ? -1 : 1;
    for (let i = 0; i < L; i++) { P.p(x + i * dx, y, col[1]).p(x, y + i * dy, col[1]); P.p(x + i * dx, y + dy, col[0]).p(x + dx, y + i * dy, col[0]); }
    P.p(x, y, col[2]);
  }
  P.r(o + S / 2 - 1, S / 2 - 1, 3, 3, col[1]).p(o + S / 2, S / 2, col[2]);
  if (label) { plate(P, (P.w - lw) / 2, S + 2, lw, 30, label.length, { screws: false, seam: false, tone: 3 }); P.text(label, P.w / 2, S + 6, 'Body', 22, '#c8c0ff', { align: 'center' }); }
  return P.c;
}
/** a big machine panel for a dossier: the frame, screws, a phosphor glass field (x, y, w, h) inside it */
export function panel(w: number, h: number, seed = 7, glassR?: [number, number, number, number]): HTMLCanvasElement {
  const P = new Px(w, h);
  plate(P, 0, 0, w, h, seed);
  // a second, inset plate course and rivet rows along the frame
  for (let x = 24; x < w - 24; x += 46) { P.r(x, 12, 2, 2, GM[7]).p(x + 1, 13, GM[2]); P.r(x, h - 14, 2, 2, GM[7]).p(x + 1, h - 13, GM[2]); }
  if (glassR) glass(P, ...glassR);
  return P.c;
}
