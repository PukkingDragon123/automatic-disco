// Hand-drawn pixel-art strokes for the colony HUD (the user's LIVING VIGNETTES direction): irregular inked outlines
// that overshoot their corners like a sketch, paper cards with a deckled edge and fibres, strips of tape, map pins,
// scribbled circles and underlines, doodled glyphs. Everything is drawn into Pix art (one art pixel = 2 screen
// pixels) from the master ramps; the stroke wobble, pressure and overshoot come from a seeded hand, never noise fill.
import { Pix, R } from './paint';
import { fontText, textWidth, type FontFace } from './pxPanel';

const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const INK = R.ink[1], INK2 = R.ink[2], PAPER = R.paper[5], PAPER2 = R.paper[4], PAPER3 = R.paper[3];
/** a hand's wobble along a stroke: smooth, a pixel or two */
const wob = (t: number, seed: number, amp = 1) => Math.round((Math.sin(t * 0.21 + seed * 1.7) * 0.7 + Math.sin(t * 0.067 + seed * 3.1) * 1.1) * amp);
/** a pen dot of width w (1 or 2) */
function dot(p: Pix, x: number, y: number, w: number, col: number, a = 255) { p.set(x, y, col, a); if (w >= 2) { p.set(x + 1, y, col, a); p.set(x, y + 1, col, a); } }
/** an ink stroke from a to b: wobbling, pressure varying (2 px in the middle, 1 px at the ends), overshooting a little */
export function stroke(p: Pix, x0: number, y0: number, x1: number, y1: number, seed: number, o: { col?: number; w?: number; over?: number; amp?: number; a?: number } = {}) {
  const col = o.col ?? INK, over = o.over ?? 2, L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
  const s0 = -over * hash(seed, 1) - 0.5, s1 = L + over * hash(seed, 2) + 0.5;
  for (let s = s0; s <= s1; s += 0.5) {
    const k = (s - s0) / (s1 - s0), w = (o.w ?? 2) >= 2 && k > 0.08 && k < 0.92 && hash(Math.floor(s / 6), seed, 3) > 0.15 ? 2 : 1;
    const off = wob(s, seed, o.amp ?? 1);
    dot(p, Math.round(x0 + ux * s + nx * off), Math.round(y0 + uy * s + ny * off), w, col, o.a ?? 255);
  }
}
/** a sketched rectangle: four strokes, each overshooting its corner */
export function inkRect(p: Pix, x: number, y: number, w: number, h: number, seed: number, o: { col?: number; w?: number } = {}) {
  stroke(p, x, y, x + w - 1, y, seed + 1, { ...o, over: 3 }); stroke(p, x + w - 1, y, x + w - 1, y + h - 1, seed + 2, { ...o, over: 3 });
  stroke(p, x + w - 1, y + h - 1, x, y + h - 1, seed + 3, { ...o, over: 3 }); stroke(p, x, y + h - 1, x, y, seed + 4, { ...o, over: 3 });
}
/** a paper card: cream paper with a deckled edge, fibres, a shade step along the bottom, an inked outline */
export function paperCard(w: number, h: number, seed: number, o: { tape?: boolean; pin?: boolean; ink?: boolean; tint?: readonly number[] } = {}) {
  const p = new Pix(w, h), Pp = o.tint ?? R.paper;
  for (let y = 2; y < h - 2; y++) {
    const l = 2 + (hash(y >> 2, seed, 1) < 0.2 ? 1 : 0), r = w - 3 - (hash(y >> 2, seed, 2) < 0.2 ? 1 : 0);
    for (let x = l; x <= r; x++) p.set(x, y, Pp[5]);
  }
  for (let x = 3; x < w - 3; x++) { if (hash(x >> 2, seed, 3) < 0.25) p.set(x, 2, Pp[4]); p.set(x, h - 3, Pp[3]); p.set(x, h - 4, Pp[4]); }
  for (let i = 0; i < (w * h) / 90; i++) { const x = 4 + Math.floor(hash(i, seed, 4) * (w - 10)), y = 4 + Math.floor(hash(i, seed, 5) * (h - 10)), L = 2 + Math.floor(hash(i, seed, 6) * 5); for (let t = 0; t < L; t++) p.set(x + t, y + (t >> 2), Pp[4]); }
  if (o.ink !== false) inkRect(p, 2, 2, w - 4, h - 4, seed);
  if (o.tape) { tape(p, 4, 0, seed, -0.35); tape(p, w - 20, h - 9, seed + 7, -0.3); }
  if (o.pin) pin(p, Math.floor(w / 2) - 2, 1, seed);
  return p;
}
/** a strip of tape, 16 x 6, at a slight angle, torn ends */
export function tape(p: Pix, x: number, y: number, seed: number, ang = 0.3) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let j = -3; j <= 3; j++) for (let i = -8; i <= 8; i++) {
    if (Math.abs(i) > 7 - (hash(j, seed, 9) < 0.5 ? 1 : 0)) continue;
    const X = Math.round(x + 8 + i * c - j * s), Y = Math.round(y + 3 + i * s + j * c);
    p.set(X, Y, j === -3 ? R.sand[5] : j === 3 ? R.sand[3] : R.sand[4], 215);
  }
}
/** a map pin: a red head with a lit corner and a shadow */
export function pin(p: Pix, x: number, y: number, seed: number) {
  void seed;
  p.rect(x, y, 4, 4, R.stampRed[3]); p.set(x, y, R.coral[5]); p.set(x + 1, y, R.coral[5]); p.set(x, y + 1, R.coral[5]);
  p.set(x + 3, y + 3, R.stampRed[1]); p.set(x + 4, y + 4, R.ink[0], 120); p.set(x + 2, y + 4, R.steel[4]); p.set(x + 2, y + 5, R.steel[3]);
}
/** a scribbled loop round a point (for the active choice) */
export function scribble(p: Pix, cx: number, cy: number, rx: number, ry: number, seed: number, col: number = R.stampRed[3]) {
  const turns = 1.25, n = Math.ceil((rx + ry) * 6);
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * turns * Math.PI * 2 + hash(seed, 1) * 6, k = 1 + Math.sin(t * 1.3 + seed) * 0.06 + (i / n) * 0.08;
    dot(p, Math.round(cx + Math.cos(t) * rx * k), Math.round(cy + Math.sin(t) * ry * k), i % 7 < 5 ? 2 : 1, col);
  }
}
/** a hand-drawn underline (two passes, slightly apart) */
export function underline(p: Pix, x0: number, x1: number, y: number, seed: number, col: number = R.stampRed[3]) { stroke(p, x0, y, x1, y + 1, seed, { col, w: 1, over: 3 }); stroke(p, x0 + 2, y + 2, x1 - 3, y + 1, seed + 5, { col, w: 1, over: 2 }); }
/** a lettered label in ink (the Body face), returns the x after it */
export function letter(p: Pix, s: string, x: number, y: number, col: number = INK, o: { face?: FontFace; align?: 'left' | 'center' | 'right'; shadow?: number } = {}) { return fontText(p, s, x, y, col, o); }
export { textWidth };
/** doodled glyphs for notes: '!' (alarm), 'v' (good), '^' (warning), 'i' (note) */
export function doodle(p: Pix, kind: '!' | 'v' | '^' | 'i', x: number, y: number, seed: number) {
  if (kind === '!') { scribble(p, x + 5, y + 6, 6, 6, seed, R.stampRed[3]); stroke(p, x + 5, y + 2, x + 5, y + 7, seed, { col: R.stampRed[3], w: 2, over: 0 }); p.rect(x + 5, y + 9, 2, 2, R.stampRed[3]); }
  else if (kind === 'v') { stroke(p, x + 1, y + 6, x + 4, y + 10, seed, { col: R.moss[3], w: 2, over: 0 }); stroke(p, x + 4, y + 10, x + 11, y + 1, seed + 1, { col: R.moss[3], w: 2, over: 1 }); }
  else if (kind === '^') { stroke(p, x, y + 11, x + 6, y, seed, { col: R.ochre[3], w: 2, over: 0 }); stroke(p, x + 6, y, x + 12, y + 11, seed + 1, { col: R.ochre[3], w: 2, over: 0 }); stroke(p, x + 12, y + 11, x, y + 11, seed + 2, { col: R.ochre[3], w: 2, over: 1 }); p.rect(x + 6, y + 4, 1, 4, INK); p.set(x + 6, y + 9, INK); }
  else { stroke(p, x + 5, y + 4, x + 5, y + 11, seed, { col: INK2, w: 2, over: 0 }); p.rect(x + 5, y + 1, 2, 2, INK2); }
}
