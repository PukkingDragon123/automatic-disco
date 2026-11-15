// Hand-drawn ink for callouts and wires: lines laid pixel by pixel on canvases at the art scale (shown at 2x),
// with a slight bow, a wobble that is the same every frame (seeded, so a drawn line never shimmers), pressure that
// thickens the stroke where the pen slows at the ends, and a nib arrowhead. Colours are ink, red and blue pencil.
export const INK = '#2b2622', PENCIL_R = '#a8321f', PENCIL_B = '#2f5d8a', PENCIL_G = '#3f6b3a', AMBER = '#c8891e', PAPER = '#f0e8d2';
const hash = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
/** a smooth, seeded wobble along a stroke, -1..1 */
function wob(t: number, seed: number) { return Math.sin(t * 9.1 + seed * 1.7) * 0.6 + Math.sin(t * 23.3 + seed * 3.1) * 0.4; }
/** plot a point list as a pen stroke: 1 px, 2 px near the ends (the pen pressing down and lifting), optional dashes */
function plot(g: CanvasRenderingContext2D, pts: [number, number][], col: string, w = 1, on = 0, off = 0, phase = 0) {
  g.fillStyle = col;
  let lx = 1e9, ly = 1e9, k = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const x = Math.round(pts[i][0]), y = Math.round(pts[i][1]);
    if (x === lx && y === ly) continue;
    lx = x; ly = y; k++;
    if (on && ((k + Math.floor(phase)) % (on + off)) >= on) continue;
    const press = i < n * 0.08 || i > n * 0.92 ? 1 : 0;
    g.fillRect(x, y, w + press, w + (press && w > 1 ? 1 : 0));
  }
}
/** a callout leader: a bowed, slightly wobbly ink line from (x0, y0) to (x1, y1) */
export function inkLine(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, seed = 1, col = INK) {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(6, Math.ceil(L * 1.6));
  const nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1), bow = Math.min(14, L * 0.12) * (hash(seed) > 0.5 ? 1 : -1);
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, b = Math.sin(t * Math.PI) * bow + wob(t, seed) * 0.8; pts.push([x0 + (x1 - x0) * t + nx * b, y0 + (y1 - y0) * t + ny * b]); }
  plot(g, pts, col, 1);
  // a small dot where the leader leaves its label
  g.fillStyle = col; g.fillRect(Math.round(x0) - 1, Math.round(y0) - 1, 2, 2);
}
/** a nib arrowhead at (x1, y1), pointing from (x0, y0) */
export function inkArrow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, col = INK) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  for (const s of [2.6, -2.6]) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 6; i++) pts.push([x1 + Math.cos(a + s) * i, y1 + Math.sin(a + s) * i]);
    plot(g, pts, col, 1);
  }
}
/** a cubic bezier point */
export function bezAt(p: number[][], t: number): [number, number] {
  const u = 1 - t;
  return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0], u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]];
}
/** an inked wire along a bezier, wobbling a little like a hand-drawn line; dashes can crawl with `phase` */
export function inkCurve(g: CanvasRenderingContext2D, p: number[][], col: string, seed: number, w = 1, on = 0, off = 0, phase = 0) {
  let len = 0, prev = bezAt(p, 0); for (let i = 1; i <= 16; i++) { const q = bezAt(p, i / 16); len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
  const n = Math.max(6, Math.ceil(len * 1.6)), pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = bezAt(p, Math.max(0, t - 0.002)), b = bezAt(p, Math.min(1, t + 0.002));
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, o = wob(t * len / 40, seed) * 0.9;
    const q = bezAt(p, t); pts.push([q[0] - dy / l * o, q[1] + dx / l * o]);
  }
  plot(g, pts, col, w, on, off, phase);
}
