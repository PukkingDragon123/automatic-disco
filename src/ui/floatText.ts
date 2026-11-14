// Floating text: chunky pixel-font popups in world space ("+12 ORE", "-8 HULL", "CRIT!", "RIGHT ARM ONLINE"). They
// pop in a size too big, settle, rise and fade out in dithered steps, colour-coded by kind. One overlay canvas per
// game; the player also hangs its hull bar and the context prompt ("[E] DRILL ORE") on it.
//
//   floatText(game, x, y, z, '+12 ORE', 'ore')         any system can call this
//   floatLayer(game).prompt = { x, y, z, key: 'E', text: 'DRILL ORE', ok: true }   (per frame, null to hide)
import { S } from './kit';

export type FloatKind = 'ore' | 'carbon' | 'water' | 'soil' | 'dmg' | 'crit' | 'hurt' | 'heal' | 'skill' | 'point' | 'info' | 'warn' | 'good' | 'kill';
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
const hexs = (c: number) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
/** width of a string in font pixels (before outline) */
export function pxTextW(s: string) { let w = 0; for (const ch of s.toUpperCase()) w += (GL.get(ch) ?? GL.get('?')!)[0].length + 1; return Math.max(0, w - 1); }
/** draw text into a 2D context at integer pixel scale k (no outline) */
function glyphs(g: CanvasRenderingContext2D, s: string, x: number, y: number, k: number, rows: (j: number) => string) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const gl = GL.get(ch) ?? GL.get('?')!;
    for (let j = 0; j < 7; j++) { g.fillStyle = rows(j); for (let i = 0; i < gl[j].length; i++) if (gl[j][i]) g.fillRect(cx + i * k, y + j * k, k, k); }
    cx += (gl[0].length + 1) * k;
  }
}
/** a text sprite at 1x: shaded fill, 1 px ink outline, a drop shadow */
const spriteCache = new Map<string, HTMLCanvasElement>();
export function textSprite(s: string, kind: FloatKind): HTMLCanvasElement {
  const key = kind + '|' + s;
  let c = spriteCache.get(key);
  if (c) return c;
  const w = pxTextW(s) + 4, h = 7 + 4;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  // outline: stamp the text in ink at the 8 neighbours, plus a lower drop shadow
  for (const [ox, oy] of [[1, 3], [2, 3], [0, 1], [2, 1], [1, 0], [1, 2], [0, 0], [2, 0], [0, 2], [2, 2]]) glyphs(g, s, 1 + ox, 1 + oy, 1, () => INK);
  const [lt, md, dk] = COL[kind];
  glyphs(g, s, 2, 2, 1, (j) => hexs(j < 2 ? lt : j < 5 ? md : dk));
  if (spriteCache.size > 400) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}

// ------------------------------------------------------------------ the layer
interface Pop { x: number; y: number; z: number; s: string; kind: FloatKind; t: number; life: number; delay: number; big: number; dx: number; rise: number; stack: number }
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
  add(x: number, y: number, z: number, s: string, kind: FloatKind, o: { life?: number; delay?: number; big?: number } = {}) {
    // stack onto popups still near the same spot so numbers don't overprint each other
    let stack = 0;
    for (const p of this.pops) if (p.t < 0.5 && Math.abs(p.x - x) + Math.abs(p.z - z) < 0.5) stack = Math.max(stack, p.stack + 1);
    const dmg = kind === 'dmg' || kind === 'crit' || kind === 'hurt';
    this.pops.push({ x, y, z, s: s.toUpperCase(), kind, t: 0, life: o.life ?? (kind === 'skill' ? 2.6 : dmg ? 0.9 : 1.4), delay: o.delay ?? 0, big: o.big ?? (kind === 'skill' || kind === 'crit' ? 1 : 0), dx: dmg ? (Math.random() - 0.5) * 30 : 0, rise: kind === 'skill' ? 26 : dmg ? 34 : 30, stack: Math.min(stack, 5) });
    if (this.pops.length > 90) this.pops.splice(0, this.pops.length - 90);
  }
  private draw() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (Math.abs((devicePixelRatio || 1) - this.dpr) > 0.01) this.resize();
    const g = this.g, k = Math.max(1, Math.round(S * this.dpr));
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
    // popups
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.t += dt;
      if (p.t >= p.life) { this.pops.splice(i, 1); continue; }
      const [sx, sy, ok] = this.scr(p.x, p.y, p.z);
      if (!ok) continue;
      const u = p.t / p.life;
      // pop a size too big, then settle; rise with ease-out; fade in dithered quarter steps
      const u1 = Math.max(1, Math.round(this.dpr)), sc = k + (p.big + (p.t < 0.07 ? 2 : p.t < 0.14 ? 1 : 0)) * u1;
      const ease = 1 - (1 - u) ** 3;
      const spr = textSprite(p.s, p.kind);
      const x = Math.round(sx + p.dx * this.dpr * ease - (spr.width * sc) / 2), y = Math.round(sy - p.rise * k * ease - p.stack * 10 * k - spr.height * sc);
      const a = u < 0.65 ? 1 : 1 - (u - 0.65) / 0.35;
      g.globalAlpha = Math.max(0, Math.ceil(a * 4) / 4);
      if (p.kind === 'skill' && Math.floor(p.t * 10) % 2 === 0 && p.t < 0.6) { g.globalAlpha *= 0.6; }
      g.drawImage(spr, x, y, spr.width * sc, spr.height * sc);
    }
    g.globalAlpha = 1;
    // context prompt: a keycap and the action
    const pr = this.prompt;
    if (pr) {
      const [sx, sy, ok] = this.scr(pr.x, pr.y, pr.z);
      if (ok) {
        const cap = pr.key ? textSprite(pr.key, pr.ok ? 'dmg' : 'info') : null, lab = textSprite(pr.text, pr.ok ? 'good' : 'warn');
        const cw = cap ? Math.max(cap.width + 4, 13) : -2, W = (cw + 2 + lab.width) * k, x = Math.round(sx - W / 2), y = Math.round(sy - 16 * k);
        if (cap) {
          g.fillStyle = INK; g.fillRect(x - k, y - k, (cw + 2) * k, 15 * k);
          g.fillStyle = pr.ok ? '#5c646c' : '#363c43'; g.fillRect(x, y, cw * k, 13 * k);
          g.fillStyle = pr.ok ? '#9da6ad' : '#474e56'; g.fillRect(x, y, cw * k, k); g.fillRect(x, y, k, 12 * k);
          g.fillStyle = '#1e2227'; g.fillRect(x, y + 12 * k, cw * k, k);
          g.drawImage(cap, x + Math.round((cw - cap.width) / 2) * k, y + k, cap.width * k, cap.height * k);
        }
        g.drawImage(lab, x + (cw + 2) * k, y + k, lab.width * k, lab.height * k);
        if (pr.prog !== undefined && pr.prog > 0) {
          const pw = cw + 2 + lab.width - 2;
          g.fillStyle = INK; g.fillRect(x - k, y + 15 * k, (pw + 2) * k, 4 * k);
          g.fillStyle = '#0b3017'; g.fillRect(x, y + 16 * k, pw * k, 2 * k);
          g.fillStyle = '#7ae088'; g.fillRect(x, y + 16 * k, Math.round(pw * Math.min(1, pr.prog)) * k, 2 * k);
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
/** pop a line of text at a world point. kind picks the colours: resources, damage, crits, hull, skills, info */
export function floatText(owner: Owner, x: number, y: number, z: number, text: string, kind: FloatKind = 'info', o: { life?: number; delay?: number; big?: number } = {}) {
  floatLayer(owner).add(x, y, z, text, kind, o);
}
