// Small hand-drawing kit for the factory's pixel art (item icons, machine panels, catalogue plates). Shapes are
// polygons filled one ramp step per plane (light from the upper left), finished with a selective outline; every
// colour comes from the master palette (src/art/palette.ts).
import { Pix } from '../ui/machine';
import { RAMPS } from '../art/palette';

export { Pix };
export type Pt = [number, number];
export const RA = RAMPS as unknown as Record<keyof typeof RAMPS, number[]>;
export const INKC = RAMPS.ink[0];

/** fill a polygon (pixel centres inside, even-odd) */
export function poly(p: Pix, pts: Pt[], c: number, a = 255) {
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
/** selective outline: transparent pixels touching the shape get ink on the shadow side (right / below) and a dark
 *  ramp step on the lit side (left / above); `lit` -1 leaves the lit side open */
export function selout(p: Pix, lit = -1, dark = INKC) {
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
export const ln = (p: Pix, x0: number, y0: number, x1: number, y1: number, c: number, a = 255) => p.line(x0, y0, x1, y1, c, a);
/** a quad from four corners */
export const quad = (p: Pix, a: Pt, b: Pt, c: Pt, d: Pt, col: number) => poly(p, [a, b, c, d], col);
/** an RGBA buffer as a data URL */
export function toURL(p: Pix) { return p.url(); }
