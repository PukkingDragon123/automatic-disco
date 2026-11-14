// Drafting kit for the assembly drawing. Every drawing is recorded as strokes (polylines in sheet units), so the
// same record can be inked crisply at any resolution, shown as a faint construction sketch, filled when approved,
// or replayed stroke by stroke as ink drawing itself. Lettering is a single-stroke technical alphabet (the kind a
// Leroy scriber cuts), so labels are strokes too and get the same hand: slight wobble, uneven ink, overshoot.
import { hashf } from '../limbo/core/rng';

// ------------------------------------------------------------------ palette (ART.md)
export const C = {
  paper: '#1d3b5a', paperDk: '#152c45', paperLt: '#27496b', grid: '#2a4d70', ink: '#e8eef0', pencil: '#9fb4c2',
  graphite: '#3b3a36', draft: '#d9d2bf', red: '#b8382e', olive: '#4d5038', gun: '#3a3d40', steel: '#8d8f8a', bake: '#3a2418',
  silver: '#c9ccc4', amber: '#d9a43a',
};

// ------------------------------------------------------------------ the single-stroke alphabet (4 x 6 grid)
const GL: Record<string, string> = {
  A: '0,6 2,0 4,6|0.8,3.9 3.2,3.9', B: '0,3 3,3 4,4 4,5 3,6 0,6 0,0 3,0 4,1 4,2 3,3', C: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5', D: '0,0 0,6 2.4,6 4,4.4 4,1.6 2.4,0 0,0',
  E: '4,0 0,0 0,6 4,6|0,3 3,3', F: '4,0 0,0 0,6|0,3 3,3', G: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3.4 2.4,3.4', H: '0,0 0,6|4,0 4,6|0,3 4,3',
  I: '2,0 2,6|1,0 3,0|1,6 3,6', J: '4,0 4,5 3,6 1,6 0,5', K: '0,0 0,6|4,0 0,3.6|1.3,2.7 4,6', L: '0,0 0,6 4,6', M: '0,6 0,0 2,3.6 4,0 4,6',
  N: '0,6 0,0 4,6 4,0', O: '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0', P: '0,6 0,0 3,0 4,1 4,2 3,3 0,3', Q: '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|2.4,4.4 4.2,6.4',
  R: '0,6 0,0 3,0 4,1 4,2 3,3 0,3|2,3 4,6', S: '4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5', T: '0,0 4,0|2,0 2,6', U: '0,0 0,5 1,6 3,6 4,5 4,0',
  V: '0,0 2,6 4,0', W: '0,0 1,6 2,2.4 3,6 4,0', X: '0,0 4,6|4,0 0,6', Y: '0,0 2,3 4,0|2,3 2,6', Z: '0,0 4,0 0,6 4,6',
  0: '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|0.5,5.3 3.5,0.7', 1: '1,1.2 2,0 2,6|1,6 3,6', 2: '0,1 1,0 3,0 4,1 4,2 0,6 4,6', 3: '0,1 1,0 3,0 4,1 4,2 3,3 4,4 4,5 3,6 1,6 0,5|1.4,3 3,3',
  4: '3,6 3,0 0,4 4,4', 5: '4,0 0,0 0,2.6 3,2.6 4,3.6 4,5 3,6 1,6 0,5', 6: '3.4,0 1.6,0 0,2 0,5 1,6 3,6 4,5 4,4 3,3 0,3', 7: '0,0 4,0 1.4,6',
  8: '1,3 0,2 0,1 1,0 3,0 4,1 4,2 3,3 1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3', 9: '4,3 1,3 0,2 0,1 1,0 3,0 4,1 4,4 2.4,6 0.6,6',
  '.': '1.8,5.6 2.2,6', ',': '2.2,5.4 1.6,6.8', '-': '0.8,3 3.2,3', '/': '0.4,6 3.6,0', ':': '2,1.6 2,2.2|2,5.4 2,6', "'": '2,0 2,1.6', '"': '1.3,0 1.3,1.6|2.7,0 2.7,1.6',
  '(': '2.6,0 1.4,1.6 1.4,4.4 2.6,6', ')': '1.4,0 2.6,1.6 2.6,4.4 1.4,6', '#': '1.2,0 1.2,6|2.8,0 2.8,6|0,2 4,2|0,4 4,4', '+': '2,1.4 2,4.6|0.4,3 3.6,3',
  '!': '2,0 2,4.2|2,5.6 2,6', '?': '0,1 1,0 3,0 4,1 4,2 2,3.4 2,4.2|2,5.6 2,6', '=': '0.4,2.2 3.6,2.2|0.4,3.8 3.6,3.8', '%': '0.4,6 3.6,0|0.6,0.6 1.2,1.2|2.8,4.8 3.4,5.4',
  '*': '2,1 2,5|0.6,2 3.4,4|3.4,2 0.6,4', '&': '4,6 1,2 1,1 2,0 3,1 3,2 0,4 0,5 1,6 2,6 4,4', '<': '3.6,0.8 0.4,3 3.6,5.2', '>': '0.4,0.8 3.6,3 0.4,5.2', '·': '2,2.8 2,3.2',
  '°': '1.4,0 2.6,0 3,0.6 3,1.4 2.6,2 1.4,2 1,1.4 1,0.6 1.4,0', '_': '0,6.6 4,6.6', '~': '0,3.4 1,2.6 3,3.4 4,2.6',
};
const GLY = new Map<string, number[][]>();
for (const [k, v] of Object.entries(GL)) GLY.set(k, v.split('|').map((s) => s.trim().split(/\s+/).flatMap((p) => p.split(',').map(Number))));
/** advance of one character at cap height 1 */
export const ADV = 5.4 / 6;
export function textWidth(s: string, size: number) { return Math.max(0, s.length * ADV * size - 1.4 * (size / 6)); }

// ------------------------------------------------------------------ strokes
/** o object line, t thin (dims, lettering, leaders), x section hatching, c centre (dash-dot), h hidden (dashed), p phantom, n pencil note, r red pencil */
export type Kind = 'o' | 't' | 'x' | 'c' | 'h' | 'p' | 'n' | 'r';
export interface Stroke { k: Kind; p: Float32Array; len: number; a: number }
export interface Fill { p: Float32Array; tone: number }
const TAU = Math.PI * 2;

/** a recorder. Transform with at(); every primitive appends strokes in drawing order */
export class Sk {
  strokes: Stroke[] = []; fills: Fill[] = []; len = 0;
  /** ink density multiplier for strokes added next (stroboscopic studies fade their earlier poses) */
  am = 1;
  x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity;
  private tx = 0; private ty = 0; private s = 1; private ca = 1; private sa = 0; private seed: number;
  constructor(seed = 1) { this.seed = seed; }
  at(x: number, y: number, s = 1, rot = 0) { this.tx = x; this.ty = y; this.s = s; this.ca = Math.cos(rot); this.sa = Math.sin(rot); return this; }
  private rnd(i: number) { return hashf(i, this.strokes.length, this.seed) - 0.5; }
  private X(x: number, y: number) { return this.tx + (x * this.ca - y * this.sa) * this.s; }
  private Y(x: number, y: number) { return this.ty + (x * this.sa + y * this.ca) * this.s; }
  /** a polyline in local coordinates; open object lines overshoot a hair at both ends like a drafted line */
  pl(pts: number[], k: Kind = 'o', close = false, over = k === 'o' || k === 't') {
    if (pts.length < 4) return this;
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(this.X(pts[i], pts[i + 1]), this.Y(pts[i], pts[i + 1]));
    if (close) out.push(out[0], out[1]);
    if (over && !close && out.length >= 4) {
      const ext = (ia: number, ib: number, e: number) => { const dx = out[ia] - out[ib], dy = out[ia + 1] - out[ib + 1], L = Math.hypot(dx, dy) || 1; out[ia] += (dx / L) * e; out[ia + 1] += (dy / L) * e; };
      const e = k === 'o' ? 0.9 : 0.4;
      ext(0, 2, e * (0.6 + this.rnd(1) * 0.8 + 0.4)); const n = out.length; ext(n - 2, n - 4, e * (0.6 + this.rnd(2) * 0.8 + 0.4));
    }
    let len = 0;
    for (let i = 2; i < out.length; i += 2) len += Math.hypot(out[i] - out[i - 2], out[i + 1] - out[i - 1]);
    for (let i = 0; i < out.length; i += 2) { this.x0 = Math.min(this.x0, out[i]); this.x1 = Math.max(this.x1, out[i]); this.y0 = Math.min(this.y0, out[i + 1]); this.y1 = Math.max(this.y1, out[i + 1]); }
    this.strokes.push({ k, p: new Float32Array(out), len, a: (0.86 + this.rnd(3) * 0.22) * this.am });
    this.len += len;
    return this;
  }
  line(x0: number, y0: number, x1: number, y1: number, k: Kind = 'o') { return this.pl([x0, y0, x1, y1], k); }
  /** box drawn as four ruled lines that cross at the corners */
  box(x: number, y: number, w: number, h: number, k: Kind = 'o') {
    return this.line(x, y, x + w, y, k).line(x + w, y, x + w, y + h, k).line(x + w, y + h, x, y + h, k).line(x, y + h, x, y, k);
  }
  arc(cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = TAU, k: Kind = 'o', rot = 0) {
    const n = Math.max(8, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry) * this.s) / 2.2)), pts: number[] = [], c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i <= n; i++) { const t = a0 + ((a1 - a0) * i) / n, x = Math.cos(t) * rx, y = Math.sin(t) * ry; pts.push(cx + x * c - y * s, cy + x * s + y * c); }
    return this.pl(pts, k, false, false);
  }
  circ(cx: number, cy: number, r: number, k: Kind = 'o') { return this.arc(cx, cy, r, r, -Math.PI / 2, Math.PI * 1.5, k); }
  ell(cx: number, cy: number, rx: number, ry: number, k: Kind = 'o', rot = 0) { return this.arc(cx, cy, rx, ry, 0, TAU, k, rot); }
  fill(pts: number[], tone = 0.12) { const o: number[] = []; for (let i = 0; i < pts.length; i += 2) o.push(this.X(pts[i], pts[i + 1]), this.Y(pts[i], pts[i + 1])); this.fills.push({ p: new Float32Array(o), tone }); return this; }
  fillEll(cx: number, cy: number, rx: number, ry: number, tone = 0.12) { const p: number[] = []; for (let i = 0; i < 28; i++) { const t = (i / 28) * TAU; p.push(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry); } return this.fill(p, tone); }
  /** section hatching inside a polygon (local coords) at 45 degrees */
  hatch(poly: number[], gap = 3, ang = Math.PI / 4) {
    const c = Math.cos(ang), s = Math.sin(ang), n = poly.length / 2;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const d = -poly[i * 2] * s + poly[i * 2 + 1] * c; lo = Math.min(lo, d); hi = Math.max(hi, d); }
    for (let d = Math.ceil(lo / gap) * gap; d <= hi; d += gap) {
      const ts: number[] = [];
      for (let i = 0; i < n; i++) {
        const ax = poly[i * 2], ay = poly[i * 2 + 1], bx = poly[((i + 1) % n) * 2], by = poly[((i + 1) % n) * 2 + 1];
        const da = -ax * s + ay * c - d, db = -bx * s + by * c - d;
        if ((da < 0) === (db < 0)) continue;
        const u = da / (da - db), x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
        ts.push(x * c + y * s);
      }
      ts.sort((a, b) => a - b);
      for (let i = 0; i + 1 < ts.length; i += 2) { const p0 = ts[i], p1 = ts[i + 1]; this.pl([p0 * c - d * s, p0 * s + d * c, p1 * c - d * s, p1 * s + d * c], 'x', false, false); }
    }
    return this;
  }
  /** lettering. size = cap height; slant shears like a hand; wobble lifts each letter a little */
  text(str: string, x: number, y: number, size: number, o: { align?: 'l' | 'c' | 'r'; k?: Kind; slant?: number; wobble?: number } = {}) {
    const k = o.k ?? 't', u = size / 6, sl = o.slant ?? 0.08, wob = o.wobble ?? 0.12, w = textWidth(str, size);
    let cx = o.align === 'c' ? x - w / 2 : o.align === 'r' ? x - w : x;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i].toUpperCase(), g = GLY.get(ch);
      if (g) {
        const dy = (hashf(i, str.length, this.seed + 7) - 0.5) * wob * size * 0.35, rot = (hashf(i, 3, this.seed + 9) - 0.5) * wob * 0.5;
        for (const poly of g) {
          const p: number[] = [];
          for (let j = 0; j < poly.length; j += 2) { const gx = poly[j] - 2, gy = poly[j + 1] - 3; const rx = gx * Math.cos(rot) - gy * Math.sin(rot), ry = gx * Math.sin(rot) + gy * Math.cos(rot); p.push(cx + (rx + 2 + (3 - (ry + 3)) * sl) * u, y + (ry + 3) * u + dy); }
          this.pl(p, k, false, false);
        }
      }
      cx += ADV * size;
    }
    return this;
  }
  /** arrowhead at (x1,y1) pointing from (x0,y0) */
  arrowHead(x0: number, y0: number, x1: number, y1: number, size = 4, k: Kind = 't') {
    const a = Math.atan2(y1 - y0, x1 - x0);
    return this.pl([x1 + Math.cos(a + 2.75) * size, y1 + Math.sin(a + 2.75) * size, x1, y1, x1 + Math.cos(a - 2.75) * size, y1 + Math.sin(a - 2.75) * size], k, false, false);
  }
  /** a leader: line with a dot on the part end and nothing on the balloon end */
  leader(x0: number, y0: number, x1: number, y1: number) { this.line(x0, y0, x1, y1, 't'); return this.arc(x1, y1, 1.1, 1.1, 0, TAU, 't'); }
  /** dimension: extension lines, a dimension line with arrows at offset off, and its figure */
  dim(x0: number, y0: number, x1: number, y1: number, off: number, label: string, size = 6) {
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux, sg = Math.sign(off) || 1;
    this.line(x0 + nx * 1.5 * sg, y0 + ny * 1.5 * sg, x0 + nx * (off + 2 * sg), y0 + ny * (off + 2 * sg), 't');
    this.line(x1 + nx * 1.5 * sg, y1 + ny * 1.5 * sg, x1 + nx * (off + 2 * sg), y1 + ny * (off + 2 * sg), 't');
    const ax = x0 + nx * off, ay = y0 + ny * off, bx = x1 + nx * off, by = y1 + ny * off;
    this.line(ax, ay, bx, by, 't'); this.arrowHead(bx, by, ax, ay, 3.2); this.arrowHead(ax, ay, bx, by, 3.2);
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (Math.abs(ux) > 0.5) this.text(label, mx, my - size - 1.6, size, { align: 'c' });
    else this.text(label, mx + 3, my - size / 2, size, { align: 'l' });
    return this;
  }
  /** a faceted boulder outline (closed), returns its polygon for fills / hatching */
  rock(cx: number, cy: number, rx: number, ry: number, seed: number, n = 11, k: Kind = 'o') {
    const pts: number[] = [];
    for (let i = 0; i < n; i++) { const t = (i / n) * TAU + hashf(i, seed, 1) * 0.35, r = 0.84 + hashf(i, seed, 2) * 0.22; pts.push(cx + Math.cos(t) * rx * r, cy + Math.sin(t) * ry * r); }
    this.pl(pts, k, true, false);
    return pts;
  }
  /** facet lines inside a rock polygon: a few short ridges from vertices toward the centre */
  facets(poly: number[], cx: number, cy: number, n = 3, seed = 1) {
    const m = poly.length / 2;
    for (let i = 0; i < n; i++) { const j = Math.floor(hashf(i, seed, 5) * m), x = poly[j * 2], y = poly[j * 2 + 1], f = 0.35 + hashf(i, seed, 6) * 0.25; this.line(x, y, x + (cx - x) * f, y + (cy - y) * f, 't'); }
    return this;
  }
  bbox() { return { x: this.x0, y: this.y0, w: this.x1 - this.x0, h: this.y1 - this.y0 }; }
}

// ------------------------------------------------------------------ inking
export interface Style { col: string; a: number; wo: number; wt: number; fills: number; hatch: boolean; centre: boolean; dashLocked?: boolean }
/** draw a record onto a context already scaled to sheet units; k = device px per sheet unit. upTo = length to draw */
export function ink(g: CanvasRenderingContext2D, sk: Sk, st: Style, k: number, upTo = Infinity) {
  g.save();
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (st.fills > 0 && upTo >= sk.len) for (const f of sk.fills) {
    g.globalAlpha = Math.min(1, st.fills * f.tone);
    g.fillStyle = st.col;
    g.beginPath(); g.moveTo(f.p[0], f.p[1]); for (let i = 2; i < f.p.length; i += 2) g.lineTo(f.p[i], f.p[i + 1]); g.closePath(); g.fill();
  }
  let done = 0;
  for (const s of sk.strokes) {
    if (done >= upTo) break;
    if ((s.k === 'x' && !st.hatch) || (s.k === 'c' && !st.centre)) { done += s.len; continue; }
    const kind = s.k;
    g.strokeStyle = kind === 'n' ? C.silver : kind === 'r' ? C.red : st.col;
    g.globalAlpha = Math.min(1, st.a * s.a * (kind === 't' ? 0.85 : kind === 'x' ? 0.55 : kind === 'c' || kind === 'h' || kind === 'p' ? 0.62 : kind === 'n' ? 0.85 : 1));
    g.lineWidth = (kind === 'o' ? st.wo : kind === 'n' ? st.wo * 0.9 : kind === 'r' ? st.wo * 1.6 : kind === 'x' ? st.wt * 0.8 : st.wt) / k;
    g.setLineDash(kind === 'c' ? [10, 2.5, 1.6, 2.5] : kind === 'h' ? [3.2, 2.2] : kind === 'p' ? [14, 2.2, 1.4, 2.2, 1.4, 2.2] : st.dashLocked && kind === 'o' ? [5, 2.4] : []);
    const p = s.p;
    g.beginPath(); g.moveTo(p[0], p[1]);
    let acc = done;
    for (let i = 2; i < p.length; i += 2) {
      const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
      if (acc + L > upTo) { const u = (upTo - acc) / L; g.lineTo(p[i - 2] + (p[i] - p[i - 2]) * u, p[i - 1] + (p[i + 1] - p[i - 1]) * u); acc = upTo; break; }
      g.lineTo(p[i], p[i + 1]); acc += L;
    }
    g.stroke();
    done += s.len;
  }
  g.restore();
}
/** where the pen is after drawing upTo of a record (for the pen-tip spark during draw-on) */
export function penAt(sk: Sk, upTo: number): [number, number] | null {
  let acc = 0;
  for (const s of sk.strokes) {
    if (acc + s.len < upTo) { acc += s.len; continue; }
    const p = s.p;
    for (let i = 2; i < p.length; i += 2) { const L = Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); if (acc + L >= upTo) { const u = (upTo - acc) / Math.max(1e-6, L); return [p[i - 2] + (p[i] - p[i - 2]) * u, p[i - 1] + (p[i + 1] - p[i - 1]) * u]; } acc += L; }
    return [p[p.length - 2], p[p.length - 1]];
  }
  return null;
}

// ------------------------------------------------------------------ materials
/** fine paper grain, a tile used as a pattern */
let grainTile: HTMLCanvasElement | null = null;
export function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas'); c.width = c.height = 192;
  const g = c.getContext('2d')!, d = g.createImageData(192, 192);
  for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
    const i = (y * 192 + x) * 4, n = hashf(x, y, 3), fib = Math.abs(Math.sin(x * 0.21 + Math.sin(y * 0.05) * 3 + hashf(Math.floor(y / 6), 0, 4) * 6)) > 0.985 ? 1 : 0;
    const v = n > 0.5 ? 255 : 0;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = Math.round(Math.abs(n - 0.5) * 34 + fib * 26);
  }
  g.putImageData(d, 0, 0);
  return (grainTile = c);
}
/** the cyanotype: uneven Prussian blue, darker toward the edges, two fold creases, one coffee ring */
export function paper(g: CanvasRenderingContext2D, W: number, H: number) {
  g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
  // mottling: a soft low-res cloud, smoothed up
  const m = document.createElement('canvas'), mw = 48, mh = Math.round((48 * H) / W); m.width = mw; m.height = mh;
  const mg = m.getContext('2d')!, md = mg.createImageData(mw, mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const n = hashf(x >> 1, y >> 1, 11) * 0.5 + hashf(x, y, 12) * 0.35 + hashf(x >> 2, y >> 2, 13) * 0.6, i = (y * mw + x) * 4;
    const light = n > 0.78;
    md.data[i] = light ? 70 : 8; md.data[i + 1] = light ? 110 : 22; md.data[i + 2] = light ? 150 : 40; md.data[i + 3] = Math.round(Math.abs(n - 0.72) * 70);
  }
  mg.putImageData(md, 0, 0);
  g.save(); g.imageSmoothingEnabled = true; g.globalAlpha = 0.9; g.drawImage(m, 0, 0, W, H); g.restore();
  // edge burn (cyanotypes darken where the light was uneven)
  const eg = (x0: number, y0: number, x1: number, y1: number) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(8,18,32,0.55)'); gr.addColorStop(1, 'rgba(8,18,32,0)'); return gr; };
  const e = Math.min(W, H) * 0.08;
  g.fillStyle = eg(0, 0, e, 0); g.fillRect(0, 0, e, H); g.fillStyle = eg(W, 0, W - e, 0); g.fillRect(W - e, 0, e, H);
  g.fillStyle = eg(0, 0, 0, e); g.fillRect(0, 0, W, e); g.fillStyle = eg(0, H, 0, H - e); g.fillRect(0, H - e, W, e);
  // grain
  g.save(); g.globalAlpha = 0.55; g.fillStyle = g.createPattern(grain(), 'repeat')!; g.fillRect(0, 0, W, H); g.restore();
}
/** fold creases at the thirds (light ridge, dark valley), drawn in sheet units */
export function folds(g: CanvasRenderingContext2D, W: number, H: number, k: number) {
  g.save();
  const crease = (x0: number, y0: number, x1: number, y1: number) => {
    const nx = y1 - y0 ? 1 : 0, ny = y1 - y0 ? 0 : 1;
    g.lineWidth = 3; g.strokeStyle = 'rgba(120,160,200,0.07)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.lineWidth = 1 / k; g.strokeStyle = 'rgba(190,215,235,0.16)'; g.beginPath(); g.moveTo(x0 - nx, y0 - ny); g.lineTo(x1 - nx, y1 - ny); g.stroke();
    g.strokeStyle = 'rgba(5,12,22,0.35)'; g.beginPath(); g.moveTo(x0 + nx * 1.2, y0 + ny * 1.2); g.lineTo(x1 + nx * 1.2, y1 + ny * 1.2); g.stroke();
  };
  crease(W / 3, 0, W / 3 + 2, H); crease((W * 2) / 3, 0, (W * 2) / 3 - 1, H); crease(0, H / 2, W, H / 2 + 1.5);
  g.restore();
}
/** a coffee ring, placed by hand: an uneven brown rim and a faint stain inside */
export function coffeeRing(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, k: number) {
  g.save();
  const st = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
  st.addColorStop(0, 'rgba(90,60,30,0.05)'); st.addColorStop(0.85, 'rgba(90,60,30,0.09)'); st.addColorStop(1, 'rgba(90,60,30,0)');
  g.fillStyle = st; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  for (let pass = 0; pass < 3; pass++) {
    g.beginPath();
    for (let i = 0; i <= 90; i++) { const t = (i / 90) * TAU * 0.93 + pass * 0.7, rr = r * (0.96 + hashf(i >> 2, pass, 8) * 0.05); const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.strokeStyle = `rgba(105,70,35,${0.16 - pass * 0.04})`; g.lineWidth = (2.4 - pass * 0.6) / k * 1.6; g.stroke();
  }
  g.restore();
}
/** a strip of aged masking tape across a corner, torn ends */
export function tape(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, rot: number, seed: number) {
  g.save(); g.translate(cx, cy); g.rotate(rot);
  g.beginPath();
  const n = 9;
  g.moveTo(-w / 2, -h / 2);
  for (let i = 0; i <= n; i++) g.lineTo(-w / 2 + (w * i) / n, -h / 2 + (hashf(i, seed, 1) - 0.5) * 0.6);
  for (let i = 0; i <= n; i++) g.lineTo(w / 2 + (hashf(i, seed, 2) - 0.5) * 3, -h / 2 + (h * i) / n);
  for (let i = n; i >= 0; i--) g.lineTo(-w / 2 + (w * i) / n, h / 2 + (hashf(i, seed, 3) - 0.5) * 0.6);
  for (let i = n; i >= 0; i--) g.lineTo(-w / 2 + (hashf(i, seed, 4) - 0.5) * 3, -h / 2 + (h * i) / n);
  g.closePath();
  g.fillStyle = 'rgba(217,210,191,0.78)'; g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 3; g.shadowOffsetY = 1; g.fill();
  g.shadowColor = 'transparent'; g.globalAlpha = 0.35; g.fillStyle = g.createPattern(grain(), 'repeat')!; g.fill();
  g.restore();
}

// ------------------------------------------------------------------ the rubber stamp
const stamps: HTMLCanvasElement[] = [];
/** APPROVED - U.S.P.C.: double border, uneven pressure, worn rubber; three slightly different impressions */
export function stampArt(i: number): HTMLCanvasElement {
  if (stamps[i % 3]) return stamps[i % 3];
  const W = 300, H = 112, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.strokeStyle = g.fillStyle = C.red;
  const rr = (x: number, y: number, w: number, h: number, r: number, lw: number) => { g.lineWidth = lw; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.stroke(); };
  rr(6, 6, W - 12, H - 12, 14, 7); rr(17, 17, W - 34, H - 34, 8, 2.5);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `60px Superwide, Jersey, sans-serif`; g.fillText('APPROVED', W / 2, H / 2 - 9);
  g.font = `22px VT, monospace`; g.fillText('U.S.P.C.  ·  INSP. 7', W / 2, H / 2 + 28);
  // wear: speckle the ink away in clumps, press harder on one side
  const d = g.getImageData(0, 0, W, H), side = (hashf(i, 1, 1) - 0.5) * 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const j = (y * W + x) * 4; if (!d.data[j + 3]) continue;
    const clump = hashf(x >> 2, y >> 2, 31 + i) * 0.7 + hashf(x, y, 32 + i) * 0.5, press = 0.75 + side * ((x / W) - 0.5) * 0.5;
    if (clump > 0.92 * press + 0.12) d.data[j + 3] = 0;
    else d.data[j + 3] = Math.round(d.data[j + 3] * Math.min(1, press * (0.78 + hashf(x, y, 33) * 0.3)));
  }
  g.putImageData(d, 0, 0);
  return (stamps[i % 3] = c);
}
