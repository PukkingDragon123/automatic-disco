// Floating text, made the way Unit 07's engineers would have: resource tallies and speech typed on little paper
// slips (graphite ink, uneven density, a colour-coded tab), crits, kills and installs thumped down as rubber stamps
// (rotated, ragged ink, a registration ghost, a ruled box), damage numbers in bone-white grease pencil. Text is set
// in the game's pixel faces at each face's native grid size and binarised, so every font pixel is a whole number of
// device pixels at 1-2 screen pixels per art pixel; everything wobbles a little, nothing glows. One overlay canvas
// per game; the player also hangs its hull bar and the context prompt ("[E] DRILL ORE") on it.
//
//   floatText(game, x, y, z, '+12 ORE', 'ore')                                       a tally slip
//   floatSay(game, () => headPos, 'Did you feel that?')                              speech that follows its speaker
//   options: life, delay, big (extra scale steps), col (custom ink), font, follow, rise, wrap, type, keepCase
//   floatLayer(game).prompt = { x, y, z, key: 'E', text: 'DRILL ORE', ok: true }       (per frame, null to hide)
import { S } from './kit';

export type FloatKind = 'ore' | 'carbon' | 'water' | 'soil' | 'dmg' | 'crit' | 'hurt' | 'heal' | 'skill' | 'point' | 'info' | 'warn' | 'good' | 'kill' | 'say';
interface Owner { screenOf(x: number, y: number, z: number): [number, number, boolean] }

// ------------------------------------------------------------------ materials (ART.md palette: muted, physical)
const PAPER = 0xd9d2bf, PAPER_HI = 0xe6e0cf, PAPER_LO = 0xb3ab96, GRAPHITE = 0x3b3a36, GRAPHITE_FADE = 0x67645c;
const STAMP_RED = 0xb8382e, AMBER = 0xd9a43a, PHOS = 0x7fb88a, BONE = 0xe4ddc8, OUTLINE = 0x2b2a27;
type Style = 'slip' | 'stamp' | 'num';
/** how each kind is made: a typed slip (with a coloured tab), a stamp (with or without a ruled box), grease pencil */
const STYLE: Record<FloatKind, { st: Style; ink: number; tab?: number; box?: boolean }> = {
  ore: { st: 'slip', ink: GRAPHITE, tab: 0xa8683a }, carbon: { st: 'slip', ink: GRAPHITE, tab: 0x5e7a4a },
  water: { st: 'slip', ink: GRAPHITE, tab: 0x4f7f9c }, soil: { st: 'slip', ink: GRAPHITE, tab: 0x7a5c3c },
  info: { st: 'slip', ink: GRAPHITE }, good: { st: 'slip', ink: GRAPHITE, tab: PHOS }, heal: { st: 'slip', ink: GRAPHITE, tab: PHOS },
  say: { st: 'slip', ink: GRAPHITE },
  dmg: { st: 'num', ink: BONE },
  crit: { st: 'stamp', ink: STAMP_RED }, hurt: { st: 'stamp', ink: STAMP_RED }, kill: { st: 'stamp', ink: STAMP_RED, box: true },
  warn: { st: 'stamp', ink: AMBER }, skill: { st: 'stamp', ink: AMBER, box: true }, point: { st: 'stamp', ink: PHOS, box: true },
};
const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const strHash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const mixc = (a: number, b: number, t: number) => {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, gg = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bb = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(bb);
};

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
/** typed slips in the typewriter face, stamps and pencil numbers in the chunky one, installs in the stencil */
const kindFace = (k: FloatKind): FontKey => (k === 'skill' ? 'wide' : STYLE[k].st === 'slip' ? 'mono' : 'chunky');
let scratch: CanvasRenderingContext2D | null = null;
function scratchCtx(w: number, h: number) {
  if (!scratch) scratch = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  const c = scratch.canvas; if (c.width < w || c.height < h) { c.width = Math.max(c.width, w); c.height = Math.max(c.height, h); }
  scratch.setTransform(1, 0, 0, 1, 0, 0); scratch.clearRect(0, 0, c.width, c.height);
  return scratch;
}
interface Mask { m: Uint8Array; W: number; H: number; lh: number; top: number }
/** set lines in a face, character by character with a little baseline wobble, optionally inside a ruled box and
 *  turned by rot radians (a stamp), then binarise. Everything is drawn at the face's native size */
function faceMask(lines: string[], f: FontKey, reveal: number, center: boolean, seed: number, rot: number, box: boolean, wobble: boolean): Mask {
  const F = FACES[f], lh = Math.round(F.px * 1.2), asc = Math.round(F.px * 0.92), pad = box ? 4 : 1;
  let g = scratchCtx(8, 8);
  g.font = `${F.px}px ${F.css}`;
  const adv = lines.map((l) => [...l].map((ch) => g.measureText(ch).width));
  const ws = adv.map((a) => Math.ceil(a.reduce((x, y) => x + y, 0)));
  const W0 = Math.max(1, ...ws) + pad * 2, H0 = lh * lines.length + pad * 2 - (lh - Math.round(F.px * 0.95));
  const ca = Math.abs(Math.cos(rot)), sa = Math.abs(Math.sin(rot));
  const W = Math.ceil(W0 * ca + H0 * sa) + 2, H = Math.ceil(W0 * sa + H0 * ca) + 2;
  g = scratchCtx(W, H);
  g.font = `${F.px}px ${F.css}`; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineWidth = 1;
  g.translate(W / 2, H / 2); g.rotate(rot); g.translate(-W0 / 2, -H0 / 2);
  let n = 0;
  lines.forEach((l, i) => {
    let x = pad + (center ? Math.floor((W0 - pad * 2 - ws[i]) / 2) : 0);
    [...l].forEach((ch, j) => {
      if (n++ >= reveal) return;
      const h = hash(seed, i * 97 + j), dy = wobble ? (h < 0.16 ? -1 : h > 0.88 ? 1 : 0) : 0;
      g.fillText(ch, Math.round(x), pad + asc + i * lh + dy);
      x += adv[i][j];
    });
    n++;
  });
  if (box) { g.strokeRect(1.5, 1.5, W0 - 3, H0 - 3); }
  const d = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  return { m, W, H, lh, top: pad };
}
/** the bitmap 5x7 face as a mask (until the fonts have loaded) */
function bitmapMask(lines: string[], reveal: number, center: boolean): Mask {
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
  return { m, W, H, lh, top: 1 };
}

// ------------------------------------------------------------------ the three materials
const spriteCache = new Map<string, HTMLCanvasElement>();
export interface SpriteOpts { col?: number; font?: FontKey; reveal?: number; center?: boolean; tape?: boolean }
/** a finished text object at 1x (one art pixel per canvas pixel) */
export function textSprite(s: string | string[], kind: FloatKind, o: SpriteOpts = {}): HTMLCanvasElement {
  const lines = Array.isArray(s) ? s : [s], f = o.font ?? kindFace(kind), all = lines.join('\n'), total = all.length;
  const reveal = Math.min(total, o.reveal ?? total), center = o.center ?? true, face = faceReady(f), st = STYLE[kind];
  const key = `${face ? f : 'bmp'}|${kind}|${o.col ?? ''}|${reveal}|${center ? 1 : 0}|${o.tape ? 1 : 0}|${all}`;
  let c = spriteCache.get(key);
  if (c) return c;
  const seed = strHash(all + kind);
  const rot = st.st === 'stamp' ? (hash(seed, 1) - 0.5) * 0.16 : 0;
  const M = face ? faceMask(lines, f, reveal, center, seed, rot, !!st.box, st.st !== 'stamp') : bitmapMask(lines, reveal, center);
  const ink = o.col ?? st.ink;
  if (st.st === 'slip') c = slip(M, ink, st.tab, seed, !!o.tape);
  else if (st.st === 'stamp') c = stamp(M, ink, seed);
  else c = pencil(M, ink, seed);
  if (spriteCache.size > 500) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}
function canvasOf(W: number, H: number) { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!; const img = g.createImageData(W, H); return { c, g, img, d: img.data }; }
function put(d: Uint8ClampedArray, W: number, x: number, y: number, col: number, a = 255) {
  const i = (y * W + x) * 4;
  if (a >= 255 || d[i + 3] === 0) { d[i] = (col >> 16) & 255; d[i + 1] = (col >> 8) & 255; d[i + 2] = col & 255; d[i + 3] = a; return; }
  const t = a / 255; d[i] = d[i] * (1 - t) + ((col >> 16) & 255) * t; d[i + 1] = d[i + 1] * (1 - t) + ((col >> 8) & 255) * t; d[i + 2] = d[i + 2] * (1 - t) + (col & 255) * t;
}
/** a typed paper slip: aged paper with a lit top edge, a darker fold at the bottom, a soft cast shadow, an optional
 *  colour tab, graphite type of uneven density with the odd dropped-out pixel, and (speech) a strip of tape */
function slip(M: Mask, ink: number, tab: number | undefined, seed: number, tape: boolean) {
  const tw = tab !== undefined ? 3 : 0, PW = M.W + 4 + tw, PH = M.H + 2, W = PW + 1, H = PH + 1 + (tape ? 1 : 0), oy = tape ? 1 : 0;
  const { c, g, img, d } = canvasOf(W, H);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
    const edge = y === 0 || x === 0 ? PAPER_HI : y === PH - 1 || x === PW - 1 ? PAPER_LO : PAPER;
    // paper fibre: the odd darker fleck
    put(d, W, x, y + oy, mixc(edge, 0x000000, hash(x >> 1, y, seed) < 0.12 ? 0.06 : 0));
  }
  for (let y = 1; y <= PH; y++) put(d, W, PW, y + oy, 0x14120e, 90);
  for (let x = 1; x < PW; x++) put(d, W, x, PH + oy, 0x14120e, 90);
  if (tab !== undefined) for (let y = 1; y < PH - 1; y++) for (let x = 1; x < 1 + tw; x++) put(d, W, x, y + oy, x === 1 ? mixc(tab, 0xffffff, 0.15) : tab);
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
    if (!M.m[y * M.W + x]) continue;
    const h = hash(x, y, seed);
    if (h < 0.035) continue; // the ribbon skipped
    put(d, W, x + 2 + tw, y + 1 + oy, h < 0.2 ? GRAPHITE_FADE : ink);
  }
  if (tape) for (let y = 0; y < 3; y++) for (let x = 0; x < 8; x++) put(d, W, x + 1 + (y === 0 ? 1 : 0), y, 0xc9c2a6, 170);
  g.putImageData(img, 0, 0);
  return c;
}
/** a rubber stamp: ink with ragged coverage (blocks and single pixels missing), a faint registration ghost and a
 *  thin graphite halo so it reads over bright ground */
function stamp(M: Mask, ink: number, seed: number) {
  const W = M.W + 3, H = M.H + 3, { c, g, img, d } = canvasOf(W, H);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < M.W && y < M.H && M.m[y * M.W + x] === 1;
  for (let y = -1; y <= M.H; y++) for (let x = -1; x <= M.W; x++) {
    if (on(x, y)) continue;
    if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) put(d, W, x + 1, y + 1, OUTLINE, 95);
  }
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) if (on(x, y) && !on(x + 1, y + 1)) put(d, W, x + 2, y + 2, mixc(ink, OUTLINE, 0.35), 90);
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
    if (!on(x, y)) continue;
    const blk = hash(x >> 1, y >> 1, seed), px = hash(x, y, seed + 3);
    if (blk < 0.1 || px < 0.05) continue;
    put(d, W, x + 1, y + 1, px < 0.25 ? mixc(ink, PAPER, 0.25) : ink, px > 0.93 ? 200 : 255);
  }
  g.putImageData(img, 0, 0);
  return c;
}
/** bone-white grease pencil: shaded top to bottom, a graphite outline and drop shadow */
function pencil(M: Mask, ink: number, seed: number) {
  const W = M.W + 3, H = M.H + 4, { c, g, img, d } = canvasOf(W, H);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < M.W && y < M.H && M.m[y * M.W + x] === 1;
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) if (on(x, y)) {
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) { if (dy === 2 && dx < 0) continue; put(d, W, x + 1 + dx, y + 1 + dy, OUTLINE); }
  }
  let t0 = M.H, t1 = 0;
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) if (on(x, y)) { t0 = Math.min(t0, y); t1 = Math.max(t1, y); }
  const hi = mixc(ink, 0xffffff, 0.3), lo = mixc(ink, 0x6b6450, 0.45);
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) if (on(x, y)) {
    const t = (y - t0) / Math.max(1, t1 - t0), streak = hash(x, y >> 1, seed) < 0.12;
    put(d, W, x + 1, y + 1, t < 0.25 ? hi : t > 0.75 || streak ? lo : ink);
  }
  g.putImageData(img, 0, 0);
  return c;
}
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
      big: o.big ?? 0, dx: dmg ? (Math.random() - 0.5) * 30 : 0, rise: o.rise ?? (say ? 0 : kind === 'skill' ? 18 : dmg ? 26 : 16),
      stack: Math.min(stack, 5), o: { type: say ? 45 : undefined, ...o },
    });
    if (this.pops.length > 90) this.pops.splice(0, this.pops.length - 90);
  }
  /** screen pixels per art pixel: 1 at 540 lines, 2 at 1080 (ART.md: never chunkier), times the device ratio */
  private get px() { return Math.max(1, Math.round(this.dpr * Math.min(2, Math.max(1, innerHeight / 540)))); }
  private draw() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (Math.abs((devicePixelRatio || 1) - this.dpr) > 0.01) this.resize();
    const g = this.g, k = this.px, u1 = Math.max(1, Math.round(this.dpr));
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    g.imageSmoothingEnabled = false;
    if (this.cv.style.display === 'none') return;
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
    // hull gauge: a strip of phosphor cells in a gunmetal frame over the golem
    const b = this.bar;
    if (b && b.alpha > 0.02) {
      const [sx, sy, ok] = this.scr(b.x, b.y, b.z);
      if (ok) {
        const segs = 12, w = segs * 3 + 3, x0 = Math.round(sx / k - w / 2) * k, y0 = Math.round(sy / k - 10) * k;
        g.globalAlpha = Math.round(b.alpha * 4) / 4;
        g.fillStyle = hex(OUTLINE); g.fillRect(x0 - k, y0 - k, (w + 2) * k, 6 * k);
        g.fillStyle = '#3a3d40'; g.fillRect(x0, y0, w * k, 4 * k);
        g.fillStyle = '#8d8f8a'; g.fillRect(x0, y0, w * k, k);
        const on = Math.ceil(b.frac * segs - 0.001), flick = b.flash > 0 && Math.floor(now / 70) % 2 === 1;
        for (let i = 0; i < segs; i++) {
          const lit = i < on, base = b.frac > 0.5 ? 0x7fd48a : b.frac > 0.25 ? AMBER : STAMP_RED;
          g.fillStyle = flick ? hex(BONE) : lit ? hex(i === on - 1 ? mixc(base, 0xffffff, 0.2) : base) : hex(mixc(base, 0x1a1c1c, 0.82));
          g.fillRect(x0 + (2 + i * 3) * k, y0 + k, 2 * k, 2 * k);
        }
        g.globalAlpha = 1;
      }
    }
    // tallies, stamps, numbers and speech
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
      const u = p.t / p.life, say = p.kind === 'say', st = STYLE[p.kind].st;
      const reveal = p.o.type ? Math.floor(p.t * p.o.type) : p.n;
      const sp = { col: p.o.col, font: p.o.font, center: !say, tape: say };
      const spr = textSprite(p.lines, p.kind, { ...sp, reveal });
      const full = reveal >= p.n ? spr : textSprite(p.lines, p.kind, sp);
      let sw = k + p.big * u1, sh = sw, lift = 0;
      if (st === 'stamp') { // thump: it lands big, squashes, settles
        if (p.t < 0.05) { sw += 2 * u1; sh += 2 * u1; } else if (p.t < 0.1) { sw = sw * 1.12; sh = sh * 0.84; }
        lift = Math.min(1, p.t / 0.4) * p.rise * 0.3;
      } else if (st === 'num') { // a quick pop, then it drifts up and aside
        if (p.t < 0.06) { sw += u1; sh += u1; }
        lift = (1 - (1 - u) ** 3) * p.rise;
      } else { // a slip drops into place, then floats up slowly with a little bob
        lift = (say ? 0 : (1 - (1 - u) ** 2) * p.rise * 0.8) - (p.t < 0.1 ? (0.1 - p.t) * 30 : 0);
        lift += Math.sin(p.t * 2.6 + (p.stack + p.n) * 1.7) * 0.6;
      }
      const W = Math.round(full.width * sw), H = Math.round(full.height * sh);
      const x = Math.round(sx + (st === 'num' ? p.dx * this.dpr * (1 - (1 - u) ** 3) : 0) - W / 2);
      const y = Math.round(sy - lift * k - p.stack * (full.height + 2) * k - H);
      const fade = say ? Math.min(1, (p.life - p.t) / 0.35) : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      g.globalAlpha = Math.max(0, Math.ceil(fade * 4) / 4);
      if (say) { // the slip's tail: a torn corner pointing down at the speaker
        const tx = Math.round(sx / k) * k, ty = y + H - k;
        g.fillStyle = hex(PAPER); g.fillRect(tx - 2 * k, ty, 4 * k, 2 * k); g.fillRect(tx - k, ty + 2 * k, 2 * k, k);
        g.fillStyle = hex(PAPER_LO); g.fillRect(tx - k, ty + 3 * k, k, k);
      }
      g.drawImage(spr, x, y, Math.round(spr.width * sw), Math.round(spr.height * sh));
    }
    g.globalAlpha = 1;
    // context prompt: a Bakelite key and the action typed on a slip
    const pr = this.prompt;
    if (pr) {
      const [sx, sy, ok] = this.scr(pr.x, pr.y, pr.z);
      if (ok) {
        const lab = textSprite(pr.text, 'info', { col: pr.ok ? GRAPHITE : 0x8a2a22 });
        const cap = pr.key ? textSprite(pr.key, 'dmg', { font: 'chunky' }) : null;
        const ch = lab.height, cw = cap ? Math.max(cap.width + 2, ch) : -2, W = (cw + 2 + lab.width) * k;
        const x = Math.round(sx - W / 2), y = Math.round(sy - (ch + 3) * k);
        if (cap) {
          const press = pr.prog !== undefined && pr.prog > 0 ? k : 0;
          g.fillStyle = hex(OUTLINE); g.fillRect(x, y + k, cw * k, (ch - 1) * k);
          g.fillStyle = '#3a2418'; g.fillRect(x, y + press, cw * k, (ch - 2) * k);
          g.fillStyle = '#5c3c2a'; g.fillRect(x, y + press, cw * k, k); g.fillRect(x, y + press, k, (ch - 3) * k);
          g.fillStyle = '#24160e'; g.fillRect(x + (cw - 1) * k, y + press + k, k, (ch - 3) * k);
          g.drawImage(cap, x + Math.round((cw - cap.width) / 2) * k, y + press + Math.round((ch - 2 - cap.height) / 2) * k, cap.width * k, cap.height * k);
        }
        g.drawImage(lab, x + (cw + 2) * k, y, lab.width * k, lab.height * k);
        if (pr.prog !== undefined && pr.prog > 0) {
          const pw = lab.width - 2, bx = x + (cw + 3) * k, by = y + (ch + 1) * k;
          g.fillStyle = hex(OUTLINE); g.fillRect(bx - k, by, (pw + 2) * k, 3 * k);
          g.fillStyle = '#1e2a20'; g.fillRect(bx, by + k, pw * k, k);
          g.fillStyle = '#7fd48a'; g.fillRect(bx, by + k, Math.round(pw * Math.min(1, pr.prog)) * k, k);
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
