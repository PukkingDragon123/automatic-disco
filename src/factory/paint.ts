// Small hand-drawing kit for the factory's pixel art (item icons, machine panels, catalogue plates). Shapes are
// polygons filled one ramp step per plane (light from the upper left), finished with a selective outline; every
// colour comes from the master palette (src/art/palette.ts).
import { Pix } from '../ui/machine';
import { RAMPS } from '../art/palette';

export { Pix };
export type Pt = [number, number];
export const RA = RAMPS as unknown as Record<keyof typeof RAMPS, number[]>;
export const INKC = RAMPS.ink[0];

/**
 * An icon canvas drawn in 16-unit coordinates onto a finer native buffer (k = 1.5: 24 px icons). Areas, strokes and
 * single marks land as contiguous blocks; polygons are filled at the native resolution so planes keep crisp edges;
 * the outline is one native pixel.
 */
export class KPix {
  readonly p: Pix; readonly w = 16; readonly h = 16;
  constructor(readonly k = 1.5) { this.p = new Pix(Math.round(16 * k), Math.round(16 * k)); }
  private X(v: number) { return Math.floor(v * this.k + 1e-6); }
  get d() { return this.p.d; }
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < 16 && y < 16; }
  set(x: number, y: number, c: number, a = 255) { x = Math.floor(x); y = Math.floor(y); const x0 = this.X(x), y0 = this.X(y), x1 = Math.max(x0 + 1, this.X(x + 1)), y1 = Math.max(y0 + 1, this.X(y + 1)); for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.p.set(i, j, c, a); }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255) { const x0 = this.X(x), y0 = this.X(y), x1 = this.X(x + w), y1 = this.X(y + h); for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.p.set(i, j, c, a); }
  hl(x0: number, x1: number, y: number, c: number, a = 255) { this.rect(x0, y, x1 - x0 + 1, 1, c, a); }
  vl(x: number, y0: number, y1: number, c: number, a = 255) { this.rect(x, y0, 1, y1 - y0 + 1, c, a); }
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) { this.set(x0, y0, c, a); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  /** opacity at a 16-unit point */
  a(x: number, y: number) { return this.p.a(this.X(x + 0.5), this.X(y + 0.5)); }
  get(x: number, y: number) { return this.p.get(this.X(x + 0.5), this.X(y + 0.5)); }
  /** a native 1-2 px specular glint (hard, glossy or wet materials) */
  glint(x: number, y: number, c: number) { const X = this.X(x + 0.5), Y = this.X(y + 0.5); this.p.set(X, Y, c); if (this.p.a(X + 1, Y + 1) > 0) this.p.set(X + 1, Y + 1, c, 140); }
  url() { return this.p.url(); }
}
/** fill a polygon (pixel centres inside, even-odd); on a KPix the points are scaled and filled natively */
export function poly(p0: Pix | KPix, pts0: Pt[], c: number, a = 255) {
  const kp = p0 instanceof KPix ? p0 : null, p = kp ? kp.p : (p0 as Pix);
  const pts: Pt[] = kp ? pts0.map(([x, y]) => [x * kp.k, y * kp.k]) : pts0;
  let y0 = 1e9, y1 = -1e9;
  for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5, xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) p.set(x, y, c, a);
  }
}
/** the outline: every transparent pixel touching the shape takes the object's own darkest step (`lit`, its ramp's
 *  dark end); `lit` -1 falls back to ink (pale things) */
export function selout(p0: Pix | KPix, lit = -1, dark = INKC) {
  const p = p0 instanceof KPix ? p0.p : p0;
  if (lit >= 0) dark = lit;
  const w = p.w, h = p.h, solid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) solid[y * w + x] = p.a(x, y) > 0 ? 1 : 0;
  const S = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && solid[y * w + x] === 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (solid[y * w + x]) continue;
    const shadow = S(x - 1, y) || S(x, y - 1), litSide = S(x + 1, y) || S(x, y + 1);
    if (shadow) p.set(x, y, dark);
    else if (litSide && lit >= 0) p.set(x, y, lit);
  }
}
/** a 1 px line of ramp colour between two points */
export const ln = (p: Pix | KPix, x0: number, y0: number, x1: number, y1: number, c: number, a = 255) => p.line(x0, y0, x1, y1, c, a);
/** a quad from four corners */
export const quad = (p: Pix | KPix, a: Pt, b: Pt, c: Pt, d: Pt, col: number) => poly(p, [a, b, c, d], col);
/** an RGBA buffer as a data URL */
export function toURL(p: Pix) { return p.url(); }
