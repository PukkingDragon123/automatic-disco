// UI KIT · BITMAP TEXT. Alagard (Hewett Tsoi), the game's one font (V7.md), rasterised once at its native 16 px grid
// and thresholded to hard 1-bit glyphs, then drawn whole-pixel with an 8-way ink outline (and an optional drop shadow
// or stepped extrusion), scaled by whole numbers only (16 / 32 / 48 px). Ported from Limbophobia's src/gfx/bitfont.ts.
//   await bitReady()                                    the face is loaded
//   bitText(ctx, 'HELLO', x, y, { color, outline, shadow, scale, align, maxW, extrude })
//   bitPx(px, 'HELLO', x, y, color, o)                  the same into a kit Px buffer (art pixels)
//   bitCanvas('HELLO', o)                               a cached canvas at scale 1 (draw it with smoothing off)
//   bitMeasure('HELLO')                                 width in font pixels
import { Px, INK, hex } from './px';

export interface BitOpts {
  color?: string;
  /** 8-way outline colour (null = none; default ink) */
  outline?: string | null;
  /** 1 px drop shadow down-right (null = none) */
  shadow?: string | null;
  /** a stepped extrusion down-right this many font pixels deep, in this colour */
  extrude?: [number, string];
  /** whole-number scale: 1 = 16 px, 2 = 32 px, 3 = 48 px */
  scale?: number;
  align?: 'left' | 'center' | 'right';
  /** wrap at this width (font pixels) */
  maxW?: number;
  lh?: number;
}
const FACE = { family: "'Alagard'", size: 16, asc: 13, desc: 4 };
interface Glyph { adv: number; w: number; h: number; a: Uint8Array }
const glyphs = new Map<string, Glyph>();
let ready = false, readyP: Promise<void> | null = null;

export function bitReady(): Promise<void> {
  if (readyP) return readyP;
  const fs = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
  readyP = (fs?.load ? fs.load(`${FACE.size}px ${FACE.family}`).then(() => undefined).catch(() => undefined) : Promise.resolve())
    .then(() => { ready = true; glyphs.clear(); cache.clear(); });
  return readyP;
}
export const bitIsReady = () => ready;
void bitReady();

let gcv: HTMLCanvasElement | null = null, gctx: CanvasRenderingContext2D | null = null;
function cut(ch: string): Glyph {
  const hit = glyphs.get(ch); if (hit) return hit;
  if (!gcv) { gcv = document.createElement('canvas'); gcv.width = 96; gcv.height = 64; gctx = gcv.getContext('2d', { willReadFrequently: true }); }
  const c = gctx!;
  c.clearRect(0, 0, 96, 64);
  c.font = `${FACE.size}px ${FACE.family}`; c.textBaseline = 'alphabetic'; c.fillStyle = '#fff';
  c.fillText(ch, 8, 4 + FACE.asc);
  const adv = Math.max(1, Math.round(c.measureText(ch).width)), h = FACE.asc + FACE.desc, w = adv + 8;
  const d = c.getImageData(4, 4, w, h).data, a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  const g = { adv, w, h, a };
  if (ready) glyphs.set(ch, g);
  return g;
}
export function bitMeasure(str: string): number { let w = 0; for (const ch of String(str)) w += cut(ch).adv; return w; }
function wrap(str: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(str).split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) { const next = cur ? cur + ' ' + word : word; if (cur && bitMeasure(next) > maxW) { out.push(cur); cur = word; } else cur = next; }
    out.push(cur);
  }
  return out;
}
const OUT8: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
type Plot = (x: number, y: number, s: number, col: string) => void;
function draw(plot: Plot, str: string, x: number, y: number, o: BitOpts): number {
  const sc = Math.max(1, Math.round(o.scale || 1));
  if (o.maxW) {
    const lines = wrap(str, o.maxW), lh = (o.lh ?? FACE.asc + FACE.desc - 2) * sc;
    let w = 0; lines.forEach((ln, i) => { w = Math.max(w, draw(plot, ln, x, y + i * lh, { ...o, maxW: 0 })); }); return w;
  }
  const s = String(str), W = bitMeasure(s) * sc;
  const x0 = Math.round(o.align === 'center' ? x - W / 2 : o.align === 'right' ? x - W : x), y0 = Math.round(y);
  const passes: [string, [number, number][]][] = [];
  if (o.extrude) { const [n, col] = o.extrude; const offs: [number, number][] = []; for (let k = 1; k <= n; k++) offs.push([k, k]); passes.push([o.outline ?? hex(INK), offs.flatMap(([a, b]) => OUT8.map(([dx, dy]) => [a + dx, b + dy] as [number, number]))]); passes.push([col, offs]); }
  if (o.outline !== null) passes.push([o.outline ?? hex(INK), OUT8]);
  if (o.shadow) passes.push([o.shadow, [[1, 1]]]);
  passes.push([o.color || '#f2ead2', [[0, 0]]]);
  for (const [col, offs] of passes) {
    let px = x0;
    for (const ch of s) {
      const g = cut(ch);
      for (let r = 0; r < g.h; r++) for (let c = 0; c < g.w; c++) { if (!g.a[r * g.w + c]) continue; for (const [dx, dy] of offs) plot(px + (c - 4 + dx) * sc, y0 + (r + dy) * sc, sc, col); }
      px += g.adv * sc;
    }
  }
  return W;
}
/** draw text at (x, y) = top-left of the line box (or its centre / right edge with align); returns the width */
export function bitText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: BitOpts = {}): number {
  let last = '';
  return draw((px, py, s, col) => { if (col !== last) { ctx.fillStyle = col; last = col; } ctx.fillRect(px, py, s, s); }, str, x, y, o);
}
/** the same into a kit Px buffer (colours as '#rrggbb') */
export function bitPx(p: Px, str: string, x: number, y: number, o: BitOpts = {}): number {
  const cache2 = new Map<string, number>();
  return draw((px, py, s, col) => { let c = cache2.get(col); if (c === undefined) { c = parseInt(col.slice(1), 16); cache2.set(col, c); } for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) p.set(px + i, py + j, c); }, str, x, y, o);
}
const cache = new Map<string, HTMLCanvasElement>();
/** a cached canvas of the text at scale 1 (2 px margin for the outline, more for an extrusion) */
export function bitCanvas(str: string, o: BitOpts = {}): HTMLCanvasElement {
  const key = JSON.stringify([str, o.color, o.outline, o.shadow, o.maxW, o.lh, o.extrude, o.align]);
  const hit = cache.get(key); if (hit) return hit;
  const lines = o.maxW ? wrap(str, o.maxW) : String(str).split('\n'), lh = o.lh ?? FACE.asc + FACE.desc - 2, ex = o.extrude?.[0] ?? 0;
  const w = Math.max(1, ...lines.map((l) => bitMeasure(l))) + 4 + ex, h = lh * (lines.length - 1) + FACE.asc + FACE.desc + 4 + ex;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const ax = o.align === 'center' ? (w - ex) / 2 : o.align === 'right' ? w - 2 - ex : 2;
  lines.forEach((ln, i) => bitText(ctx, ln, ax, 2 + i * lh, { ...o, scale: 1, maxW: 0 }));
  if (ready) { if (cache.size > 500) cache.clear(); cache.set(key, cv); }
  return cv;
}
