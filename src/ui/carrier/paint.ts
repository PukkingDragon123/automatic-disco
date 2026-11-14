// Pixel painting on the carrier's atlas: regions (tiling or single cells) packed on shelves into one 1024 px
// sheet, a region painter that wraps for tiles, polygon fills and pixel stamps for drawn marks, and a 5x7 stencil
// face (with stencil bridges and flaked paint) for the hull lettering. Colours come only from palette ramps.
import { RAMPS } from '../../art/palette';

export const AW = 1024, AH = 1024;

export interface Reg { name: string; x: number; y: number; w: number; h: number; pad: number; tile: boolean; decal: boolean }

/** a deterministic hash 0..1 */
export function hh(a: number, b = 0, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** a seeded sequence 0..1 */
export function rng(seed: number) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Sheet {
  readonly d = new Uint8Array(AW * AH * 4);
  readonly e = new Uint8Array(AW * AH);
  readonly regs = new Map<string, Reg>();
  private sx = 0; private sy = 0; private sh = 0;
  /** reserve a region (inner size w x h, plus a gutter) on the current shelf, or a new one */
  alloc(name: string, w: number, h: number, kind: 'tile' | 'cell' | 'decal' = 'tile') {
    const pad = kind === 'tile' ? 8 : 2, W = w + pad * 2, H = h + pad * 2;
    if (this.sx + W > AW) { this.sx = 0; this.sy += this.sh; this.sh = 0; }
    if (this.sy + H > AH) throw new Error(`carrier atlas full at ${name}`);
    const r: Reg = { name, x: this.sx + pad, y: this.sy + pad, w, h, pad, tile: kind === 'tile', decal: kind === 'decal' };
    this.sx += W; this.sh = Math.max(this.sh, H);
    this.regs.set(name, r);
    return new P(this, r);
  }
  /** start a new shelf */
  shelf() { this.sx = 0; this.sy += this.sh; this.sh = 0; }
  used() { return (this.sy + this.sh) / AH; }
  /** fill every gutter: tiles wrap (so mips stay seamless), cells clamp, decals stay clear */
  gutters() {
    for (const r of this.regs.values()) {
      if (r.decal) continue;
      for (let y = -r.pad; y < r.h + r.pad; y++) for (let x = -r.pad; x < r.w + r.pad; x++) {
        if (x >= 0 && y >= 0 && x < r.w && y < r.h) continue;
        const sx = r.tile ? ((x % r.w) + r.w) % r.w : Math.min(r.w - 1, Math.max(0, x));
        const sy = r.tile ? ((y % r.h) + r.h) % r.h : Math.min(r.h - 1, Math.max(0, y));
        const di = (r.y + y) * AW + r.x + x, si = (r.y + sy) * AW + r.x + sx;
        this.d[di * 4] = this.d[si * 4]; this.d[di * 4 + 1] = this.d[si * 4 + 1]; this.d[di * 4 + 2] = this.d[si * 4 + 2]; this.d[di * 4 + 3] = this.d[si * 4 + 3];
        this.e[di] = this.e[si];
      }
    }
  }
}

/** a region painter: coordinates local to the region; tiles wrap, cells clip */
export class P {
  constructor(readonly S: Sheet, readonly r: Reg) {}
  get w() { return this.r.w; } get h() { return this.r.h; }
  private i(x: number, y: number) {
    x = Math.floor(x); y = Math.floor(y);
    const r = this.r;
    if (r.tile) { x = ((x % r.w) + r.w) % r.w; y = ((y % r.h) + r.h) % r.h; }
    else if (x < 0 || y < 0 || x >= r.w || y >= r.h) return -1;
    return (r.y + y) * AW + r.x + x;
  }
  set(x: number, y: number, c: number, em = -1) {
    const i = this.i(x, y); if (i < 0) return;
    const d = this.S.d; d[i * 4] = (c >> 16) & 255; d[i * 4 + 1] = (c >> 8) & 255; d[i * 4 + 2] = c & 255; d[i * 4 + 3] = 255;
    if (em >= 0) this.S.e[i] = em;
  }
  get(x: number, y: number) { const i = this.i(x, y); if (i < 0) return -1; const d = this.S.d; return d[i * 4 + 3] ? (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2] : -1; }
  em(x: number, y: number, v: number) { const i = this.i(x, y); if (i >= 0) this.S.e[i] = v; }
  clear(x: number, y: number) { const i = this.i(x, y); if (i >= 0) { this.S.d[i * 4 + 3] = 0; this.S.e[i] = 0; } }
  rect(x: number, y: number, w: number, h: number, c: number, em = -1) { for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) this.set(x + k, y + j, c, em); }
  hl(x0: number, x1: number, y: number, c: number) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vl(x: number, y0: number, y1: number, c: number) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  /** a framed rect: 1 px lit edge top/left, shadow bottom/right */
  bev(x: number, y: number, w: number, h: number, fill: number, lit: number, shad: number) {
    this.rect(x, y, w, h, fill); this.hl(x, x + w - 1, y, lit); this.vl(x, y, y + h - 1, lit); this.hl(x, x + w - 1, y + h - 1, shad); this.vl(x + w - 1, y, y + h - 1, shad);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  /** scanline polygon fill (pixel centres) */
  poly(pts: [number, number][], c: number | ((x: number, y: number) => number), em = -1) {
    let y0 = Infinity, y1 = -Infinity; for (const [, y] of pts) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5, xs: number[] = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xa, ya] = pts[j], [xb, yb] = pts[i];
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) xs.push(xa + ((yc - ya) / (yb - ya)) * (xb - xa));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, typeof c === 'number' ? c : c(x, y), em);
    }
  }
  /** stamp a pixel pattern: each char looks up a colour in map ('.' or ' ' = leave) */
  stamp(x: number, y: number, rows: string[], map: Record<string, number>, em?: Record<string, number>) {
    for (let j = 0; j < rows.length; j++) for (let k = 0; k < rows[j].length; k++) {
      const ch = rows[j][k]; const c = map[ch]; if (c === undefined) continue;
      this.set(x + k, y + j, c, em?.[ch] ?? -1);
    }
  }
  /** darken / recolour what is there through a ramp: each pixel moves `steps` along the ramp it is nearest in */
  shift(x: number, y: number, R: readonly number[], steps: number) {
    const c = this.get(x, y); if (c < 0) return;
    let bi = 0, bd = Infinity;
    for (let i = 0; i < R.length; i++) { const d = cd(c, R[i]); if (d < bd) { bd = d; bi = i; } }
    this.set(x, y, R[Math.max(0, Math.min(R.length - 1, bi + steps))]);
  }
}
function cd(a: number, b: number) { const dr = ((a >> 16) & 255) - ((b >> 16) & 255), dg = ((a >> 8) & 255) - ((b >> 8) & 255), db = (a & 255) - (b & 255); return dr * dr * 2 + dg * dg * 4 + db * db * 3; }

// ------------------------------------------------------------------ the 5x7 stencil face
const F: Record<string, string> = {
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#', B: '####.|#...#|#...#|####.|#...#|#...#|####.', C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.', E: '#####|#....|#....|####.|#....|#....|#####', F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####', H: '#...#|#...#|#...#|#####|#...#|#...#|#...#', I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..', K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#', O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....', Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.', T: '#####|..#..|..#..|..#..|..#..|..#..|..#..', U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..', W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  0: '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', 1: '..#..|.##..|..#..|..#..|..#..|..#..|.###.', 2: '.###.|#...#|....#|...#.|..#..|.#...|#####',
  3: '#####|...#.|..#..|...#.|....#|#...#|.###.', 4: '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', 5: '#####|#....|####.|....#|....#|#...#|.###.',
  6: '..##.|.#...|#....|####.|#...#|#...#|.###.', 7: '#####|....#|...#.|..#..|.#...|.#...|.#...', 8: '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  9: '.###.|#...#|#...#|.####|....#|...#.|.##..', '.': '..|..|..|..|..|##|##', '-': '.....|.....|.....|####.|.....|.....|.....',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....', ' ': '...|...|...|...|...|...|...', "'": '##|##|.#|..|..|..|..', '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
  '>': '#....|.#...|..#..|...#.|..#..|.#...|#....', '<': '....#|...#.|..#..|.#...|..#..|...#.|....#', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
};
const G = new Map<string, boolean[][]>();
for (const [k, v] of Object.entries(F)) G.set(k, v.split('|').map((r) => [...r].map((c) => c === '#')));
export function textWidth(s: string, sc: number) { let w = 0; for (const ch of s.toUpperCase()) w += ((G.get(ch)?.[0].length ?? 5) + 1) * sc; return w - sc; }
/**
 * Stencil lettering at an integer scale: stencil bridges cut through lone vertical strokes at the mid row, a few
 * flakes of paint lost (in clusters, at stroke edges), and an optional 1 px drop shadow (for raised letters).
 */
export function stencil(p: P, s: string, x: number, y: number, sc: number, col: number, o: { bridges?: boolean; wear?: number; seed?: number; shadow?: number; off?: number; em?: number } = {}) {
  let cx = x; const wear = o.wear ?? 0.04, seed = o.seed ?? 3, off = o.off ?? 1;
  // the shade first (painted where the letters' own paint will not cover it), then the letters
  if (o.shadow !== undefined) stencil(p, s, x + off, y + off, sc, o.shadow, { ...o, shadow: undefined, em: -1 });
  for (const ch of s.toUpperCase()) {
    const g = G.get(ch) ?? G.get(' ')!;
    for (let j = 0; j < 7; j++) for (let i = 0; i < g[0].length; i++) {
      if (!g[j][i]) continue;
      const lone = (i === 0 || !g[j][i - 1]) && (i === g[0].length - 1 || !g[j][i + 1]) && j > 0 && j < 6 && g[j - 1][i] && g[j + 1][i];
      for (let b = 0; b < sc; b++) for (let a = 0; a < sc; a++) {
        if (o.bridges !== false && sc >= 2 && lone && j === 3 && b < Math.max(1, sc >> 1)) continue;
        const X = cx + i * sc + a, Y = y + j * sc + b;
        if (wear > 0 && hh(X >> 1, Y >> 1, seed) < wear && hh(X >> 2, Y >> 2, seed + 1) < 0.5) continue;
        p.set(X, Y, col, o.em ?? -1);
      }
    }
    cx += (g[0].length + 1) * sc;
  }
  return cx - sc;
}

// ------------------------------------------------------------------ palette shorthands
export const SL = RAMPS.slate, ST = RAMPS.steel, OL = RAMPS.olive, BR = RAMPS.brass, RD = RAMPS.stampRed, AM = RAMPS.glowAmber, RU = RAMPS.rust, PA = RAMPS.paper, INK = RAMPS.ink;
