// Floating text: pixel-font popups in world space ("+12 ORE", "-8 HULL", "CRIT!", "RIGHT ARM ONLINE") and speech
// over speakers. Text is set in the game's pixel faces (PixelSans, CannedPixels, Superwide, RoyaltyMono) at each
// face's native grid size, binarised, shaded in three tones, outlined in ink with a drop shadow, then blown up by a
// whole number of device pixels, so it stays razor sharp on any screen. Popups pop in a size too big, settle, rise
// and fade in dithered steps; speech types itself out on a dark plate and follows its speaker. One overlay canvas
// per game; the player also hangs its hull bar and the context prompt ("[E] DRILL ORE") on it.
//
//   floatText(game, x, y, z, '+12 ORE', 'ore')                                   a popup
//   floatText(game, 0, 0.4, 0, 'Did you feel that?', 'say', { follow: () => head }) speech that follows (y is an offset)
//   options: life, delay, big (extra scale steps), col (custom colour), font, follow, rise, wrap, type, keepCase, plate
//   floatLayer(game).prompt = { x, y, z, key: 'E', text: 'DRILL ORE', ok: true }   (per frame, null to hide)
import { S } from './kit';

export type FloatKind = 'ore' | 'carbon' | 'water' | 'soil' | 'dmg' | 'crit' | 'hurt' | 'heal' | 'skill' | 'point' | 'info' | 'warn' | 'good' | 'kill' | 'say';
interface Owner { screenOf(x: number, y: number, z: number): [number, number, boolean] }

/** fill (light, mid, dark) per kind */
const COL: Record<FloatKind, [number, number, number]> = {
  ore: [0xffd8b0, 0xe08a4a, 0x8a4a22],
  carbon: [0xd8ffc0, 0x8ad86a, 0x3a7a2a],
  water: [0xd0f4ff, 0x5ac8ff, 0x2a6aa8],
  soil: [0xf0dcb8, 0xc0965a, 0x6a4a28],
  dmg: [0xffffff, 0xfff0c0, 0xc0a060],
  crit: [0xfff8a0, 0xffc020, 0xc05010],
  hurt: [0xffc0b0, 0xff4a3a, 0x8a1a12],
  heal: [0xd0fff0, 0x6affd8, 0x1a8a6a],
  skill: [0xfff0c4, 0xffcd6e, 0xa4540e],
  point: [0xe8ffe8, 0x7ae088, 0x1b6630],
  info: [0xf0f0e8, 0xc8c8bc, 0x6a6a60],
  warn: [0xffe0a0, 0xffa432, 0x8a4a08],
  good: [0xe0fff0, 0x9affc0, 0x2a8a5a],
  kill: [0xffd0d0, 0xff6a5a, 0x6a1010],
  say: [0xfffaf0, 0xf0ead8, 0xb8b09c],
};
const INK = '#06070a';

// ------------------------------------------------------------------ a 5x7 face, proportional (empty columns trimmed)
const F: Record<string, string> = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#', B: '####./#...#/#...#/####./#...#/#...#/####.', C: '.###./#...#/#..../#..../#..../#...#/.###.',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.', E: '#####/#..../#..../####./#..../#..../#####', F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.####', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#', I: '###/.#./.#./.#./.#./.#./###',
  J: '..###/...#./...#./...#./...#./#..#./.##..', K: '#...#/#..#./#.#../##.../#.#../#..#./#...#', L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#...#/#...#/##..#/#.#.#/#..##/#...#/#...#', O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....', Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#', R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.', T: '#####/..#../..#../..#../..#../..#../..#..', U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..', W: '#...#/#...#/#...#/#.#.#/#.#.#/#.#.#/.#.#.', X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.', 1: '.#./##./.#./.#./.#./.#./###', 2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '#####/...#./..#../...#./....#/#...#/.###.', 4: '...#./..##./.#.#./#..#./#####/...#./...#.', 5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '..##./.#.../#..../####./#...#/#...#/.###.', 7: '#####/....#/...#./..#../.#.../.#.../.#...', 8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/...#./.##..',
  '+': '...../..#../..#../#####/..#../..#../.....', '-': '...../...../...../####./...../...../.....', '!': '#/#/#/#/#/./#', '?': '.###./#...#/....#/...#./..#../...../..#..',
  '.': './././././././#', ',': '../../../../../.#/#.', ':': './#/./././#/.', '%': '##..#/##..#/...#./..#../.#.../#..##/#..##', '/': '....#/....#/...#./..#../.#.../#..../#....',
  '\'': '#/#/./././././', 'x': '...../...../#...#/.#.#./..#../.#.#./#...#', '(': '..#/.#./#../#../#../.#./..#', ')': '#../.#./..#/..#/..#/.#./#..',
  '>': '#..../.#.../..#../...#./..#../.#.../#....', '<': '....#/...#./..#../.#.../..#../...#./....#', '#': '.#.#./#####/.#.#./.#.#./.#.#./#####/.#.#.',
  ' ': '../../../../../../..', '*': '...../#.#.#/.###./#####/.###./#.#.#/.....', '=': '...../...../####./...../####./...../.....',
};
const GL = new Map<string, boolean[][]>();
for (const [k, v] of Object.entries(F)) {
  const rows = v.split('/').map((r) => [...r].map((c) => c === '#'));
  if (k !== ' ') { // trim empty columns
    let a = 0, b = rows[0].length - 1;
    while (a < b && rows.every((r) => !r[a])) a++;
    while (b > a && rows.every((r) => !r[b])) b--;
    GL.set(k, rows.map((r) => r.slice(a, b + 1)));
  } else GL.set(k, rows);
}
/** width of a string in font pixels (before outline) */
export function pxTextW(s: string) { let w = 0; for (const ch of s.toUpperCase()) w += (GL.get(ch) ?? GL.get('?')!)[0].length + 1; return Math.max(0, w - 1); }
// ------------------------------------------------------------------ pixel faces (styles.css maps the user's fonts)
export type FontKey = 'sans' | 'chunky' | 'wide' | 'mono';
/** CSS family and the size at which one font pixel lands on one canvas pixel (measured: zero partial coverage) */
const FACES: Record<FontKey, { css: string; px: number }> = {
  sans: { css: 'Pixelify', px: 11 }, chunky: { css: 'Canned', px: 10 }, wide: { css: 'Superwide', px: 10 }, mono: { css: 'VT', px: 14 },
};
const ready: Partial<Record<FontKey, boolean>> = {};
function faceReady(f: FontKey) {
  if (ready[f]) return true;
  if (ready[f] === undefined) {
    ready[f] = false;
    const spec = `${FACES[f].px}px ${FACES[f].css}`;
    document.fonts?.load(spec).then(() => { ready[f] = document.fonts.check(spec); spriteCache.clear(); }).catch(() => { /* keep the bitmap face */ });
  }
  return false;
}
const kindFace = (k: FloatKind): FontKey => (k === 'dmg' || k === 'crit' || k === 'hurt' || k === 'kill' || k === 'skill' ? 'chunky' : 'sans');
/** cap band per face (rows from the top of the em box): for the three-tone shading */
const capBand = new Map<FontKey, [number, number]>();
let scratch: CanvasRenderingContext2D | null = null;
function scratchCtx(w: number, h: number) {
  if (!scratch) scratch = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const c = scratch.canvas; if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
  scratch.clearRect(0, 0, c.width, c.height);
  return scratch;
}
/** a binarised mask of lines of text in a face: [mask, w, h, baseline rows] */
function faceMask(lines: string[], f: FontKey, reveal: number, center: boolean) {
  const F = FACES[f], lh = Math.round(F.px * 1.25), asc = Math.round(F.px * 0.95);
  let g = scratchCtx(8, 8);
  g.font = `${F.px}px ${F.css}`;
  const ws = lines.map((l) => Math.ceil(g.measureText(l).width));
  const W = Math.max(1, ...ws) + 2, H = lh * lines.length + 2;
  g = scratchCtx(W, H);
  g.font = `${F.px}px ${F.css}`; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
  let left = reveal;
  lines.forEach((l, i) => {
    if (left <= 0) return;
    const part = l.slice(0, left); left -= l.length + 1;
    g.fillText(part, 1 + (center ? Math.floor((W - 2 - ws[i]) / 2) : 0), 1 + asc + i * lh);
  });
  const d = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  if (!capBand.has(f)) { // where the capitals sit, for shading
    const h = scratchCtx(F.px * 2, F.px * 2); h.font = `${F.px}px ${F.css}`; h.textBaseline = 'alphabetic'; h.fillStyle = '#fff'; h.fillText('H', 1, 1 + asc);
    const hd = h.getImageData(0, 0, F.px * 2, F.px * 2).data; let t = 99, b = 0;
    for (let y = 0; y < F.px * 2; y++) for (let x = 0; x < F.px * 2; x++) if (hd[(y * F.px * 2 + x) * 4 + 3] > 127) { t = Math.min(t, y); b = Math.max(b, y); }
    capBand.set(f, t <= b ? [t - 1, b - 1] : [0, F.px - 1]);
  }
  return { m, W, H, lh, band: capBand.get(f)! };
}
/** the bitmap 5x7 face, as a mask (used until the fonts have loaded) */
function bitmapMask(lines: string[], reveal: number, center: boolean) {
  const lh = 9, ws = lines.map((l) => pxTextW(l)), W = Math.max(1, ...ws) + 2, H = lh * lines.length + 2, m = new Uint8Array(W * H);
  let left = reveal;
  lines.forEach((l, li) => {
    let cx = 1 + (center ? Math.floor((W - 2 - ws[li]) / 2) : 0);
    for (const ch of l.slice(0, Math.max(0, left)).toUpperCase()) {
      const gl = GL.get(ch) ?? GL.get('?')!;
      for (let j = 0; j < 7; j++) for (let i = 0; i < gl[j].length; i++) if (gl[j][i]) m[(1 + li * lh + j) * W + cx + i] = 1;
      cx += gl[0].length + 1;
    }
    left -= l.length + 1;
  });
  return { m, W, H, lh, band: [0, 6] as [number, number] };
}
const spriteCache = new Map<string, HTMLCanvasElement>();
/** a text sprite at 1x: three-tone fill, a 1 px ink outline and a drop shadow. lines may be several (speech) */
export function textSprite(s: string | string[], kind: FloatKind, o: { col?: number; font?: FontKey; reveal?: number; center?: boolean } = {}): HTMLCanvasElement {
  const lines = Array.isArray(s) ? s : [s], f = o.font ?? kindFace(kind), total = lines.join('\n').length;
  const reveal = Math.min(total, o.reveal ?? total), center = o.center ?? true, face = faceReady(f);
  const key = `${face ? f : 'bmp'}|${kind}|${o.col ?? ''}|${reveal}|${center ? 1 : 0}|${lines.join('\n')}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const M = face ? faceMask(lines, f, reveal, center) : bitmapMask(lines, reveal, center);
  const W = M.W + 3, H = M.H + 4;
  c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, img = g.createImageData(W, H), px = new Uint32Array(img.data.buffer);
  const [lt, md, dk] = o.col !== undefined ? [mixc(o.col, 0xffffff, 0.45), o.col, mixc(o.col, 0x000000, 0.42)] : COL[kind];
  const abgr = (c: number) => (255 << 24) | ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255);
  const ink = abgr(0x06070a), cl = abgr(lt), cm = abgr(md), cd = abgr(dk);
  const [t0, t1] = M.band, ch = Math.max(1, t1 - t0);
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) if (M.m[y * M.W + x]) {
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) { if (dy === 2 && dx < 0) continue; px[(y + 1 + dy) * W + x + 1 + dx] = ink; }
  }
  for (let y = 0; y < M.H; y++) {
    const r = ((y - 1) % M.lh) - t0, tt = r / ch, col = tt < 0.3 ? cl : tt > 0.72 ? cd : cm;
    for (let x = 0; x < M.W; x++) if (M.m[y * M.W + x]) px[(y + 1) * W + x + 1] = col;
  }
  g.putImageData(img, 0, 0);
  if (spriteCache.size > 500) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}
const mixc = (a: number, b: number, t: number) => {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, gg = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bb = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(bb);
};
/** break text into lines no wider than w font pixels */
function wrapText(s: string, f: FontKey, w: number) {
  if (!faceReady(f)) { const out: string[] = []; let line = ''; for (const word of s.split(/\s+/)) { const t = line ? line + ' ' + word : word; if (pxTextW(t) > w && line) { out.push(line); line = word; } else line = t; } if (line) out.push(line); return out; }
  const g = scratchCtx(8, 8); g.font = `${FACES[f].px}px ${FACES[f].css}`;
  const out: string[] = []; let line = '';
  for (const word of s.split(/\s+/)) { const t = line ? line + ' ' + word : word; if (g.measureText(t).width > w && line) { out.push(line); line = word; } else line = t; }
  if (line) out.push(line);
  return out;
}

// ------------------------------------------------------------------ the layer
type Anchor = { x: number; y: number; z: number } | (() => { x: number; y: number; z: number } | null);
export interface FloatOpts {
  life?: number; delay?: number;
  /** extra whole scale steps (1 = a size up) */
  big?: number;
  /** a colour of its own instead of the kind's */
  col?: number;
  /** typeface (default: chunky for damage, kills and skills, sans for the rest) */
  font?: FontKey;
  /** follow a speaker: an object with world x, y, z read every frame, or a getter (null ends it). The popup's y is
   *  then an offset above it */
  follow?: Anchor;
  /** drift upward in CSS px at scale 1 (speech: 0) */
  rise?: number;
  /** wrap width in font pixels (speech defaults to 150) */
  wrap?: number;
  /** typewriter speed in characters per second (speech defaults to 45) */
  type?: number;
  /** keep the text's case (speech does); popups are upper case */
  keepCase?: boolean;
  /** a dark plate behind the text (speech does) */
  plate?: boolean;
}
interface Pop { x: number; y: number; z: number; lines: string[]; n: number; kind: FloatKind; t: number; life: number; delay: number; big: number; dx: number; rise: number; stack: number; o: FloatOpts }
export interface Prompt { x: number; y: number; z: number; key: string; text: string; ok: boolean; prog?: number }
export interface HullBar { x: number; y: number; z: number; frac: number; alpha: number; flash: number }

export class FloatLayer {
  readonly cv: HTMLCanvasElement; private g: CanvasRenderingContext2D;
  private pops: Pop[] = [];
  prompt: Prompt | null = null;
  bar: HullBar | null = null;
  /** extra draw hooks (screen space, after the popups) */
  hooks: ((g: CanvasRenderingContext2D, k: number) => void)[] = [];
  private last = performance.now();
  private raf = 0; private alive = true;
  constructor(readonly owner: Owner) {
    this.cv = document.createElement('canvas');
    this.cv.className = 'float-text';
    this.cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:1;image-rendering:pixelated';
    document.body.appendChild(this.cv);
    this.g = this.cv.getContext('2d')!;
    this.resize();
    addEventListener('resize', this.resize);
    for (const f of Object.keys(FACES) as FontKey[]) faceReady(f);
    // draws on its own clock so popups keep moving through hit-stop and pauses
    const loop = () => { if (!this.alive) return; this.raf = requestAnimationFrame(loop); this.draw(); };
    this.raf = requestAnimationFrame(loop);
  }
  /** device pixels per CSS pixel: the canvas is drawn at the screen's own resolution so every font pixel is a
   *  whole number of device pixels (crisp on phones with 2.6x or 3x screens) */
  private dpr = 1;
  private resize = () => { this.dpr = Math.max(1, devicePixelRatio || 1); this.cv.width = Math.round(innerWidth * this.dpr); this.cv.height = Math.round(innerHeight * this.dpr); };
  private scr(x: number, y: number, z: number): [number, number, boolean] { const [a, b, ok] = this.owner.screenOf(x, y, z); return [a * this.dpr, b * this.dpr, ok]; }
  set visible(v: boolean) { this.cv.style.display = v ? '' : 'none'; }
  add(x: number, y: number, z: number, s: string, kind: FloatKind, o: FloatOpts = {}) {
    const say = kind === 'say';
    const text = o.keepCase ?? say ? s : s.toUpperCase(), f = o.font ?? kindFace(kind);
    const wrap = o.wrap ?? (say ? 150 : 0), lines = wrap > 0 ? wrapText(text, f, wrap) : [text];
    // stack onto popups still near the same spot so numbers don't overprint each other
    let stack = 0;
    if (!o.follow) for (const p of this.pops) if (!p.o.follow && p.t < 0.5 && Math.abs(p.x - x) + Math.abs(p.z - z) < 0.5) stack = Math.max(stack, p.stack + 1);
    const dmg = kind === 'dmg' || kind === 'crit' || kind === 'hurt';
    const n = lines.join('\n').length;
    if (say && o.follow) for (const p of this.pops) if (p.o.follow === o.follow && p.kind === 'say') p.life = Math.min(p.life, p.t + 0.15); // a new line replaces the speaker's last
    this.pops.push({
      x, y, z, lines, n, kind, t: 0, life: o.life ?? (say ? 2.2 + n * 0.055 : kind === 'skill' ? 2.6 : dmg ? 0.9 : 1.4), delay: o.delay ?? 0,
      big: o.big ?? (kind === 'skill' || kind === 'crit' ? 1 : 0), dx: dmg ? (Math.random() - 0.5) * 30 : 0, rise: o.rise ?? (say ? 0 : kind === 'skill' ? 26 : dmg ? 34 : 30),
      stack: Math.min(stack, 5), o: { type: say ? 45 : undefined, plate: say, ...o },
    });
    if (this.pops.length > 90) this.pops.splice(0, this.pops.length - 90);
  }
  private draw() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (Math.abs((devicePixelRatio || 1) - this.dpr) > 0.01) this.resize();
    const g = this.g, k = Math.max(1, Math.round(S * this.dpr)), u1 = Math.max(1, Math.round(this.dpr));
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.imageSmoothingEnabled = false;
    if (this.cv.style.display === 'none') return;
    // hull bar: a segmented gauge with rivets, over the golem
    const b = this.bar;
    if (b && b.alpha > 0.02) {
      const [sx, sy, ok] = this.scr(b.x, b.y, b.z);
      if (ok) {
        const segs = 10, w = segs * 3 + 3, x0 = Math.round(sx / k - w / 2) * k, y0 = Math.round(sy / k - 8) * k;
        g.globalAlpha = Math.round(b.alpha * 4) / 4;
        g.fillStyle = INK; g.fillRect(x0 - k, y0 - k, (w + 2) * k, 6 * k);
        g.fillStyle = '#363c43'; g.fillRect(x0, y0, w * k, 4 * k);
        g.fillStyle = '#9da6ad'; g.fillRect(x0, y0, k, k); g.fillRect(x0 + (w - 1) * k, y0, k, k);
        const on = Math.ceil(b.frac * segs - 0.001);
        for (let i = 0; i < segs; i++) {
          const lit = i < on, col = b.flash > 0 && Math.floor(now / 60) % 2 ? '#ffffff' : b.frac > 0.5 ? (lit ? '#7ae088' : '#0b3017') : b.frac > 0.25 ? (lit ? '#ffcd6e' : '#3a1b04') : (lit ? '#ff6c44' : '#380b08');
          g.fillStyle = col; g.fillRect(x0 + (2 + i * 3) * k, y0 + k, 2 * k, 2 * k);
        }
        g.globalAlpha = 1;
      }
    }
    // popups and speech
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.t >= p.life) { this.pops.splice(i, 1); continue; }
      let wx = p.x, wy = p.y, wz = p.z;
      const fo = p.o.follow;
      if (fo) { const a = typeof fo === 'function' ? fo() : fo; if (!a) { this.pops.splice(i, 1); continue; } wx += a.x; wy += a.y; wz += a.z; }
      const [sx, sy, ok] = this.scr(wx, wy, wz);
      if (!ok) continue;
      const u = p.t / p.life, say = p.kind === 'say';
      // pop a size too big, then settle (speech just appears); rise with ease-out; fade in dithered quarter steps
      const sc = k + (p.big + (say ? 0 : p.t < 0.07 ? 2 : p.t < 0.14 ? 1 : 0)) * u1;
      const ease = 1 - (1 - u) ** 3;
      const reveal = p.o.type ? Math.floor(p.t * p.o.type) : p.n;
      const spr = textSprite(p.lines, p.kind, { col: p.o.col, font: p.o.font, reveal, center: !say });
      const full = reveal >= p.n ? spr : textSprite(p.lines, p.kind, { col: p.o.col, font: p.o.font, center: !say });
      const x = Math.round(sx + p.dx * this.dpr * ease - (full.width * sc) / 2), y = Math.round(sy - p.rise * k * ease - p.stack * 10 * k - full.height * sc);
      const fade = say ? Math.min(1, (p.life - p.t) / 0.35) : u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
      g.globalAlpha = Math.max(0, Math.ceil(fade * 4) / 4);
      if (p.kind === 'skill' && Math.floor(p.t * 10) % 2 === 0 && p.t < 0.6) { g.globalAlpha *= 0.6; }
      if (p.o.plate) { // a dark speech plate with a lit top edge and a little tail toward the speaker
        const pw = full.width * sc + 4 * k, ph = full.height * sc + 2 * k, px0 = x - 2 * k, py0 = y - k;
        g.fillStyle = 'rgba(8,10,14,0.78)'; g.fillRect(px0, py0, pw, ph);
        g.fillStyle = 'rgba(200,210,190,0.35)'; g.fillRect(px0, py0, pw, k);
        g.fillStyle = 'rgba(8,10,14,0.78)'; const tx = Math.round(sx / k) * k; g.fillRect(tx - k, py0 + ph, 2 * k, k); g.fillRect(tx - k + (k > 1 ? 0 : 0), py0 + ph + k, k, k);
      }
      g.drawImage(spr, x, y, spr.width * sc, spr.height * sc);
    }
    g.globalAlpha = 1;
    // context prompt: a keycap and the action
    const pr = this.prompt;
    if (pr) {
      const [sx, sy, ok] = this.scr(pr.x, pr.y, pr.z);
      if (ok) {
        const cap = pr.key ? textSprite(pr.key, pr.ok ? 'dmg' : 'info', { font: 'chunky' }) : null, lab = textSprite(pr.text, pr.ok ? 'good' : 'warn', { font: 'sans' });
        const ch = Math.max(13, lab.height + 1), cw = cap ? Math.max(cap.width + 3, ch) : -2, W = (cw + 2 + lab.width) * k, x = Math.round(sx - W / 2), y = Math.round(sy - (ch + 3) * k);
        if (cap) {
          g.fillStyle = INK; g.fillRect(x - k, y - k, (cw + 2) * k, (ch + 2) * k);
          g.fillStyle = pr.ok ? '#5c646c' : '#363c43'; g.fillRect(x, y, cw * k, ch * k);
          g.fillStyle = pr.ok ? '#9da6ad' : '#474e56'; g.fillRect(x, y, cw * k, k); g.fillRect(x, y, k, (ch - 1) * k);
          g.fillStyle = '#1e2227'; g.fillRect(x, y + (ch - 1) * k, cw * k, k);
          g.drawImage(cap, x + Math.round((cw - cap.width) / 2) * k, y + Math.round((ch - cap.height) / 2) * k, cap.width * k, cap.height * k);
        }
        g.drawImage(lab, x + (cw + 2) * k, y + Math.round((ch - lab.height) / 2) * k, lab.width * k, lab.height * k);
        if (pr.prog !== undefined && pr.prog > 0) {
          const pw = cw + 2 + lab.width - 2, by = y + (ch + 2) * k;
          g.fillStyle = INK; g.fillRect(x - k, by, (pw + 2) * k, 4 * k);
          g.fillStyle = '#0b3017'; g.fillRect(x, by + k, pw * k, 2 * k);
          g.fillStyle = '#7ae088'; g.fillRect(x, by + k, Math.round(pw * Math.min(1, pr.prog)) * k, 2 * k);
        }
      }
    }
    for (const h of this.hooks) h(g, k);
  }
  dispose() { this.alive = false; cancelAnimationFrame(this.raf); removeEventListener('resize', this.resize); this.cv.remove(); layers.delete(this.owner); }
}

const layers = new Map<Owner, FloatLayer>();
/** the overlay for a game (made on first use) */
export function floatLayer(owner: Owner): FloatLayer {
  let l = layers.get(owner);
  if (!l) { l = new FloatLayer(owner); layers.set(owner, l); }
  return l;
}
/** pop a line of text at a world point (or above something it follows). kind picks colours and face: resources,
 *  damage, crits, hull, skills, info, 'say' for speech */
export function floatText(owner: Owner, x: number, y: number, z: number, text: string, kind: FloatKind = 'info', o: FloatOpts = {}) {
  floatLayer(owner).add(x, y, z, text, kind, o);
}
/** speech over a speaker: types out on a plate and follows it (ends early if the speaker says something else) */
export function floatSay(owner: Owner, follow: Anchor, text: string, o: FloatOpts = {}) {
  floatLayer(owner).add(0, 0, 0, text, 'say', { follow, ...o });
}
