// Hand-pixelled textures for the cockpit desk, all from the master palette ramps (art/palette.ts). Surfaces are
// small tiling swatches of a real material with a few drawn marks placed on purpose (paint chips with a lit and a
// shaded lip, brushing strokes, fibres), never noise; faces, dials, labels and screens are exact-size decals where one
// texel lands on one art pixel. Light from the upper left.
import { RAMPS } from '../../art/palette';
import { Pix, text as text3, textW as textW3, glyph7 } from '../machine';
import { glyph57 } from '../floatText';
import { iconCanvas } from '../pixelart';

export const R = RAMPS;
export const INKC = R.ink[0];
const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ------------------------------------------------------------------ type
/** proportional 5x7 face (the float-text font); returns the x after the last glyph */
export function text5(p: Pix, s: string, x: number, y: number, col: number, shadow = -1) {
  let cx = Math.round(x);
  for (const ch of s.toUpperCase()) {
    const g = glyph57(ch);
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i]) { if (shadow >= 0) p.set(cx + i + 1, y + j + 1, shadow); }
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i]) p.set(cx + i, y + j, col);
    cx += (ch === ' ' ? 2 : g[0].length) + 1;
  }
  return cx - 1;
}
export function textW5(s: string) { let w = 0; for (const ch of s.toUpperCase()) w += (ch === ' ' ? 2 : glyph57(ch)[0].length) + 1; return Math.max(0, w - 1); }
/** 3x5 stencil face */
export function text3s(p: Pix, s: string, x: number, y: number, col: number, shadow = -1) { if (shadow >= 0) text3(p, s, x + 1, y + 1, shadow); return text3(p, s, x, y, col); }
export const textW3s = textW3;
/** 5x7 counter numerals */
export function num7(p: Pix, ch: string, x: number, y: number, col: number) { const g = glyph7(ch); for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g[j][i]) p.set(x + i, y + j, col); }

// ------------------------------------------------------------------ swatches (64 x 64, tiling)
const SW = new Map<string, Pix>();
function strokes(p: Pix, n: number, col: number, seed: number, len: [number, number], slope = 0, vert = false) {
  for (let i = 0; i < n; i++) {
    const x0 = Math.floor(hash(i, seed, 1) * 64), y0 = Math.floor(hash(i, seed, 2) * 64), L = len[0] + Math.floor(hash(i, seed, 3) * (len[1] - len[0]));
    for (let t = 0; t < L; t++) { const x = (x0 + (vert ? Math.round(t * slope) : t)) & 63, y = (y0 + (vert ? t : Math.round(t * slope))) & 63; p.set(x, y, col); }
  }
}
/** a paint chip: a small irregular flake of bare metal; its upper-left lip in shade, the lower-right lip catching light */
function chip(p: Pix, cx: number, cy: number, rows: number[], metal: number, shade: number, lit: number) {
  const pts: [number, number][] = [];
  rows.forEach((w, j) => { const off = Math.round((hash(cx, cy, j) - 0.5) * 2); for (let i = 0; i < w; i++) pts.push([(cx + off + i - (w >> 1)) & 63, (cy + j) & 63]); });
  const has = new Set(pts.map(([x, y]) => x + y * 64));
  for (const [x, y] of pts) p.set(x, y, metal);
  for (const [x, y] of pts) {
    if (!has.has(((x - 1) & 63) + y * 64) || !has.has(x + ((y - 1) & 63) * 64)) p.set(x, y, shade);
    else if (!has.has(((x + 1) & 63) + y * 64) || !has.has(x + ((y + 1) & 63) * 64)) p.set(x, y, lit);
  }
}
export function swatch(name: 'olive' | 'steel' | 'bake' | 'brass' | 'rubber' | 'paper' | 'red' | 'amber' | 'blue' | 'deck' | 'cream' | 'wood' | 'copper'): Pix {
  let p = SW.get(name); if (p) return p;
  p = new Pix(64, 64);
  const fill = (c: number) => p!.rect(0, 0, 64, 64, c);
  switch (name) {
    case 'olive': // olive-drab enamel over steel: flat paint, a few chips to bare metal, light scratches
      fill(R.olive[2]);
      strokes(p, 7, R.olive[3], 11, [4, 10], 0.25);
      strokes(p, 3, R.olive[1], 12, [3, 6], -0.3);
      for (const [x, y, r] of [[9, 12, [2, 4, 3, 1]], [41, 7, [3, 2]], [27, 38, [1, 3, 5, 4, 2]], [55, 50, [2, 3, 1]], [12, 54, [3, 4, 2]]] as [number, number, number[]][]) chip(p, x, y, r, R.steel[4], R.olive[0], R.olive[4]);
      break;
    case 'deck': // the deck plates: darker enamel, worn bright along a few hand-paths
      fill(R.olive[1]);
      strokes(p, 9, R.olive[2], 21, [6, 16], 0.08);
      for (const [x, y, r] of [[20, 20, [2, 3, 2]], [48, 40, [3, 4, 3, 1]]] as [number, number, number[]][]) chip(p, x, y, r, R.steel[3], R.olive[0], R.olive[3]);
      break;
    case 'steel': // gunmetal: brushed in one direction
      fill(R.steel[2]);
      strokes(p, 22, R.steel[3], 31, [5, 18]);
      strokes(p, 7, R.steel[1], 32, [4, 10]);
      strokes(p, 3, R.steel[4], 33, [2, 5]);
      break;
    case 'bake': // oxblood Bakelite: deep, a few lit swirls in the moulding
      fill(R.clay[1]);
      strokes(p, 6, R.clay[2], 41, [3, 7], 0.6);
      strokes(p, 4, R.clay[0], 42, [3, 6], -0.5);
      break;
    case 'brass':
      fill(R.brass[3]);
      strokes(p, 16, R.brass[4], 51, [5, 14]);
      strokes(p, 7, R.brass[2], 52, [4, 9]);
      break;
    case 'copper':
      fill(R.copper[3]);
      strokes(p, 14, R.copper[4], 53, [5, 12]);
      strokes(p, 6, R.copper[2], 54, [4, 8]);
      break;
    case 'rubber':
      fill(R.basalt[1]);
      strokes(p, 8, R.basalt[2], 61, [3, 8], 0.15);
      break;
    case 'paper':
      fill(R.paper[4]);
      strokes(p, 14, R.paper[3], 71, [2, 3], 0.5);
      strokes(p, 5, R.paper[5], 72, [2, 4]);
      break;
    case 'cream':
      fill(R.bone[4]);
      strokes(p, 8, R.bone[3], 73, [2, 5]);
      break;
    case 'red':
      fill(R.stampRed[2]);
      strokes(p, 8, R.stampRed[3], 81, [3, 9], 0.2);
      strokes(p, 4, R.stampRed[1], 82, [3, 6]);
      break;
    case 'amber':
      fill(R.ochre[4]);
      strokes(p, 9, R.ochre[5], 91, [3, 9], 0.2);
      strokes(p, 4, R.ochre[3], 92, [3, 6]);
      break;
    case 'blue': // cyanotype: Prussian paper and a faint ruled grid
      fill(R.sapphire[1]);
      for (let i = 0; i < 64; i += 8) { p.hl(0, 63, i, R.sapphire[2]); p.vl(i, 0, 63, R.sapphire[2]); }
      strokes(p, 5, R.sapphire[3], 93, [3, 7]);
      break;
    case 'wood':
      fill(R.fur[3]);
      for (let y = 0; y < 64; y += 5) strokes(p, 3, R.fur[2], 100 + y, [10, 30], 0.04);
      strokes(p, 8, R.fur[4], 99, [6, 18], 0.04);
      break;
  }
  SW.set(name, p);
  return p;
}

// ------------------------------------------------------------------ decals
/** a stencilled label on a transparent decal (cream paint, dark under-shadow) */
export function label(s: string, col: number = R.bone[4], big = false, shadow: number = INKC) {
  const w = (big ? textW5(s) : textW3s(s)) + 2, h = big ? 9 : 7, p = new Pix(w, h);
  if (big) text5(p, s, 0, 0, col, shadow); else text3s(p, s, 0, 0, col, shadow);
  return p;
}
/** a small riveted name plate: a dark plate with an engraved word */
export function plate(s: string, ink: number = R.bone[4], bg: number = R.ink[1], rim: number = R.steel[3]) {
  const w = textW3s(s) + 6, h = 9, p = new Pix(w, h);
  p.rect(0, 0, w, h, rim); p.rect(1, 1, w - 2, h - 2, bg);
  p.set(1, 1, R.steel[5]); p.set(w - 2, 1, R.steel[4]);
  text3s(p, s, 3, 2, ink);
  return p;
}
/** the digit band of a counter wheel: ten 5x7 numerals on black, `cell` texels apart, wrapped round the wheel */
export function digitBand(cell = 8, ink: number = R.bone[5], bg: number = R.ink[1]) {
  const p = new Pix(7, cell * 10);
  p.rect(0, 0, 7, cell * 10, bg);
  for (let d = 0; d < 10; d++) {
    // texture rows run top-down; the wheel's v runs up, so digit d sits in row band (9 - d) and they roll in order
    // glyph in rows 0-6 of its cell, a dark gap on row 7 (so the glyph centre sits at v = (d + 0.5) / 10)
    num7(p, String(d), 1, (9 - d) * cell, ink);
    p.hl(0, 6, (9 - d) * cell + cell - 1, R.ink[0]);
  }
  return p;
}
/** a gauge face: cream enamel disc, graphite ticks round a sweep, a red zone, a printed word */
export function gaugeFace(D: number, o: { a0: number; a1: number; ticks: number; red?: [number, number]; word?: string; face?: number; ink?: number; full?: boolean }) {
  const p = new Pix(D, D), c = (D - 1) / 2, r = D / 2 - 0.4;
  const face = o.face ?? R.bone[4], ink = o.ink ?? R.ink[1];
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
    if (d > r) continue;
    // the enamel catches light along its upper-left rim, sinks into shade at the lower right
    const lit = (-dx * 0.6 - dy * 0.8) / Math.max(1, d);
    p.set(x, y, d > r - 1.2 ? (lit > 0.3 ? R.bone[5] : R.bone[2]) : d < 1.6 ? R.steel[2] : face);
  }
  const A = (t: number) => o.a0 + (o.a1 - o.a0) * t;
  const at = (a: number, rr: number) => [Math.round(c + Math.sin(a) * rr), Math.round(c - Math.cos(a) * rr)] as const;
  if (o.red) for (let t = o.red[0]; t <= o.red[1]; t += 0.01) { const [x, y] = at(A(t), r - 2.2); p.set(x, y, R.stampRed[3]); const [x2, y2] = at(A(t), r - 3.1); p.set(x2, y2, R.stampRed[2]); }
  for (let i = 0; i <= o.ticks; i++) {
    const a = A(i / o.ticks), major = i % 2 === 0;
    for (let k = 0; k < (major ? 3 : 2); k++) { const [x, y] = at(a, r - 2 - k); p.set(x, y, ink); }
  }
  if (o.word) { const w = textW3s(o.word); text3s(p, o.word, Math.round(c - w / 2), Math.round(c + r * 0.3), R.ink[2]); }
  return p;
}
/** an icon at a given pixel size (the game's icon art) as a Pix */
export function iconPix(name: string, px: number, dim = false) {
  const pc = iconCanvas(name, { px, shadow: false, dim });
  const p = new Pix(pc.w, pc.h), d = pc.toImageData().data;
  p.d.set(d);
  return p;
}
/** the faint glass of a dial or tube: clear except for one hard diagonal reflection and its echo */
export function glassStreak(w: number, h: number) {
  const p = new Pix(w, h);
  p.rect(0, 0, w, h, R.sky[5], 70);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x + y * 0.9 - w * 0.28;
    if (u > 0 && u < 2.2) p.set(x, y, R.snow[5], 210);
    else if (u > 4 && u < 5) p.set(x, y, R.snow[4], 150);
  }
  return p;
}
export { Pix };
