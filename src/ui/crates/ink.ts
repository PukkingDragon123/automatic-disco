// The stores' hand-drawn finish: frames are a few inked strokes (not boxes): each edge one pen line that wavers a
// pixel, swells and thins, overshoots its corner, sometimes doubles back as a second lighter pass; a strip of masking
// tape on a corner, a pin, rubber stamps with a broken ring. Drawn as pixel strokes at screen resolution (a 2 px pen
// at 1080p), from the master ramps, cached by size. The 3D vignette inside is the star; the ink only holds it.
import { RAMPS } from '../../art/palette';

const INK = RAMPS.ink[1], INK2 = RAMPS.ink[2], PAPER = RAMPS.paper, RED = RAMPS.stampRed;
const hex = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };
const cache = new Map<string, string>();

/** one pen stroke from a to b: a wavering line of square dabs, w px wide, swelling in the middle, a little tremor */
export function penLine(x: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, w: number, col: number, seed: number, wobble = 1) {
  const L = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.ceil(L)), nx = -(by - ay) / (L || 1), ny = (bx - ax) / (L || 1);
  x.fillStyle = hex(col);
  for (let i = 0; i <= n; i++) {
    const t = i / n, sw = Math.sin(t * Math.PI), j = (Math.sin(t * 7.3 + seed) * 0.6 + Math.sin(t * 19.1 + seed * 2) * 0.4) * wobble;
    const px = ax + (bx - ax) * t + nx * j, py = ay + (by - ay) * t + ny * j;
    const ww = Math.max(1, Math.round(w * (0.7 + 0.45 * sw) + (h1(i >> 3, seed) < 0.15 ? -1 : 0)));
    x.fillRect(Math.round(px - ww / 2), Math.round(py - ww / 2), ww, ww);
  }
}
/** a frame of four inked strokes round w x h, overshooting at the corners; a lighter second pass on two edges */
export function drawInkFrame(x: CanvasRenderingContext2D, w: number, h: number, pen: number, seed = 1, inset = 6) {
  const o = inset, ov = pen * 3;
  const j = (k: number) => (h1(k, seed) - 0.5) * pen * 2;
  const P = [[o + j(1), o + j(2)], [w - o + j(3), o + j(4)], [w - o + j(5), h - o + j(6)], [o + j(7), h - o + j(8)]];
  for (let e = 0; e < 4; e++) {
    const a = P[e], b = P[(e + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    // start a little before the corner, end a little past the next one (the pen overshoots)
    const s0 = ov * (0.4 + h1(e, seed + 3)), s1 = ov * (0.6 + h1(e, seed + 4));
    penLine(x, a[0] - ux * s0, a[1] - uy * s0, b[0] + ux * s1, b[1] + uy * s1, pen, INK, seed + e * 13, 1.1);
    if (e === 1 || e === 2) penLine(x, a[0] + ux * L * 0.15 + uy * 2, a[1] + uy * L * 0.15 - ux * 2, a[0] + ux * L * 0.55 + uy * 2, a[1] + uy * L * 0.55 - ux * 2, Math.max(1, pen - 1), INK2, seed + e * 7, 0.8);
  }
}
/** a strip of masking tape, len x wid, at an angle: translucent paper with torn, jagged ends and a lit edge */
export function drawTape(x: CanvasRenderingContext2D, cx: number, cy: number, len: number, wid: number, ang: number, seed = 1) {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  const hw = len / 2, hh = wid / 2;
  for (let yy = -hh; yy < hh; yy += 2) {
    const tl = hw - Math.floor(h1(yy, seed) * 4) * 2, tr = hw - Math.floor(h1(yy, seed + 1) * 4) * 2;
    x.fillStyle = hex(PAPER[4], 0.78); x.fillRect(-tl, yy, tl + tr, 2);
  }
  x.fillStyle = hex(PAPER[5], 0.6); x.fillRect(-hw + 4, -hh, len - 8, 2);
  x.fillStyle = hex(PAPER[1], 0.35); x.fillRect(-hw + 4, hh - 2, len - 8, 2);
  x.restore();
}
/** a drawing pin: a domed head with a glint and a shadow */
export function drawPin(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, col = RED[3]) {
  x.fillStyle = 'rgba(19,22,28,.35)'; x.fillRect(cx - r + 3, cy - r + 5, r * 2, r * 2);
  for (let yy = -r; yy <= r; yy += 2) { const ww = Math.round(Math.sqrt(Math.max(0, r * r - yy * yy)) / 2) * 2; x.fillStyle = hex(yy < -r / 3 ? RED[3] : yy > r / 3 ? RED[1] : col); x.fillRect(cx - ww, cy + yy, ww * 2, 2); }
  x.fillStyle = hex(0xe7a092); x.fillRect(cx - r / 2, cy - r / 2, 2, 2);
}
/** a card: an ink frame (no fill: what is behind shows), tape on one corner, a pin on another; returns a data URL */
export function cardURL(w: number, h: number, pen: number, seed = 1, o: { tape?: boolean; pin?: boolean; paper?: boolean } = {}) {
  const key = `card:${w}x${h}:${pen}:${seed}:${o.tape !== false}:${!!o.pin}:${!!o.paper}`;
  let u = cache.get(key);
  if (u) return u;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d')!;
  if (o.paper) paper(x, w, h, pen, seed);
  drawInkFrame(x, w, h, pen, seed, pen * 3);
  if (o.tape !== false) drawTape(x, pen * 10, pen * 6, pen * 22, pen * 7, -0.55, seed);
  if (o.pin) drawPin(x, w - pen * 8, pen * 7, pen * 3);
  u = c.toDataURL(); cache.set(key, u);
  return u;
}
/** a sheet of drafting paper: aged off-white, a few fibres, a faint fold, a soft curl shadow at one corner */
function paper(x: CanvasRenderingContext2D, w: number, h: number, pen: number, seed: number) {
  const i = pen * 3;
  x.fillStyle = hex(PAPER[4]); x.fillRect(i, i, w - i * 2, h - i * 2);
  x.fillStyle = hex(PAPER[5]); x.fillRect(i, i, w - i * 2, pen);
  for (let k = 0; k < (w * h) / 900; k++) { x.fillStyle = hex(PAPER[h1(k, seed) < 0.5 ? 3 : 5], 0.7); x.fillRect(i + Math.floor(h1(k, seed + 1) * (w - i * 2)), i + Math.floor(h1(k, seed + 2) * (h - i * 2)), pen * (1 + (k % 3)), Math.max(1, pen / 2)); }
  x.fillStyle = hex(PAPER[3], 0.5); x.fillRect(Math.floor(w * 0.62), i, Math.max(1, pen / 2), h - i * 2);
  x.fillStyle = hex(PAPER[2], 0.5); for (let k = 0; k < pen * 6; k += 2) x.fillRect(w - i - pen * 6 + k, h - i - pen, pen * 6 - k, 2);
}
/** a rubber stamp: a broken inked ring (round or square) at size s, in red or ink, rotated a little */
export function stampURL(s: number, round: boolean, col: 'red' | 'ink', seed = 1, lit = false) {
  const key = `stamp:${s}:${round}:${col}:${seed}:${lit}`;
  let u = cache.get(key);
  if (u) return u;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const x = c.getContext('2d')!, C = col === 'red' ? RED[lit ? 3 : 2] : INK, pen = Math.max(2, Math.round(s / 22) * 2);
  x.translate(s / 2, s / 2); x.rotate((h1(seed, 3) - 0.5) * 0.18); x.translate(-s / 2, -s / 2);
  if (lit) { x.fillStyle = hex(col === 'red' ? RED[3] : PAPER[2], 0.22); x.fillRect(pen * 2, pen * 2, s - pen * 4, s - pen * 4); }
  const n = round ? 28 : 4, r = s / 2 - pen * 1.5;
  for (let i = 0; i < n; i++) {
    if (h1(i, seed) < 0.12) continue; // a dry patch in the ring
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    if (round) penLine(x, s / 2 + Math.cos(a0) * r, s / 2 + Math.sin(a0) * r, s / 2 + Math.cos(a1) * r, s / 2 + Math.sin(a1) * r, pen, C, seed + i, 0.4);
    else { const q = [[pen * 1.5, pen * 1.5], [s - pen * 1.5, pen * 1.5], [s - pen * 1.5, s - pen * 1.5], [pen * 1.5, s - pen * 1.5]]; const a = q[i], b = q[(i + 1) % 4]; penLine(x, a[0], a[1], b[0], b[1], pen, C, seed + i, 0.5); }
  }
  u = c.toDataURL(); cache.set(key, u);
  return u;
}
/** an inked callout leader: a hand line from (ax, ay) to (bx, by) with a dot at the thing it points at (SVG path) */
export function leaderPath(ax: number, ay: number, bx: number, by: number, seed = 1) {
  const mx = (ax + bx) / 2 + (h1(seed, 1) - 0.5) * 10, my = (ay + by) / 2 + (h1(seed, 2) - 0.5) * 10;
  return `M${ax},${ay} Q${mx},${my} ${bx},${by}`;
}
export const INK_HEX = hex(INK), PAPER_HEX = hex(PAPER[4]), RED_HEX = hex(RED[3]);
const pins = new Map<string, string>();
/** a drawing pin, pushed in (red) or lying loose (faded) */
export function pinURL(on: boolean) {
  const key = String(on); let u = pins.get(key); if (u) return u;
  const c = document.createElement('canvas'); c.width = c.height = 12; const x = c.getContext('2d')!;
  drawPin(x, 6, 5, 4, on ? RED[3] : PAPER[1]);
  if (!on) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(214,202,176,.45)'; x.fillRect(0, 0, 12, 12); }
  u = c.toDataURL(); pins.set(key, u);
  return u;
}
