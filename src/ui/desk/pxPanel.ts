// Hand-pixelled hardware for the colony HUD. Every plate, glass well, key and tag is painted pixel by pixel from the
// master ramps (art/palette.ts) at ONE ART PIXEL = 2 SCREEN PIXELS, light from the upper left: a 1 px outline in the
// material's darkest step, a lit bevel on the top and left, a shaded one on the bottom and right, chamfered corners,
// slotted screws, rivet rows, seams with a lit lip, paint chips down to steel at the edges, a few deliberate scratches,
// grime gathered along the foot, stencilled names. Each panel is painted to its own size (unique wear, never a
// repeated stamp); keys and tags are nine-slice images (flat caps stretch cleanly).
import { Pix, swatch, text3s, textW3s, text5, textW5, R } from './paint';

export const K = 2;
const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export type Mat = 'olive' | 'steel' | 'deck';
const RAMP: Record<Mat, readonly number[]> = { olive: R.olive, steel: R.steel, deck: R.olive };
export interface PlateOpts {
  mat?: Mat; seed?: number;
  /** screws in the corners */
  screws?: boolean;
  /** a stencilled name, top left (or `labelAt`) */
  label?: string; labelAt?: [number, number];
  /** vertical seams at these x (art px) */
  seams?: number[];
  /** rivet rows along the top and bottom edges */
  rivets?: boolean;
  /** glass wells to sink into the plate (art px rects) */
  wells?: [number, number, number, number][];
  /** how worn (0..2) */
  wear?: number;
  /** a hazard band along the bottom */
  hazard?: boolean;
}

/** a slotted screw head, 5 x 5, set in a ring of worn paint */
export function screw(p: Pix, x: number, y: number, seed: number, ramp: readonly number[] = R.olive) {
  for (const [dx, dy] of [[-1, 0], [5, 2], [2, -1], [2, 5], [0, 5], [5, 0]]) p.set(x + dx, y + dy, ramp[1]);
  const S = [[0, 1, 1, 1, 0], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], [0, 1, 1, 1, 0]];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
    if (!S[j][i]) continue;
    const edge = !S[j - 1]?.[i] || !S[j + 1]?.[i] || !S[j][i - 1] || !S[j][i + 1];
    const lit = (2 - i) + (2 - j);
    p.set(x + i, y + j, edge ? (lit > 1 ? R.steel[3] : R.steel[0]) : lit > 1 ? R.steel[5] : lit < -1 ? R.steel[2] : R.steel[4]);
  }
  // the slot, at one of four angles
  const k = Math.floor(hash(seed, 3) * 4);
  const slot = k === 0 ? [[1, 2], [2, 2], [3, 2]] : k === 1 ? [[2, 1], [2, 2], [2, 3]] : k === 2 ? [[1, 1], [2, 2], [3, 3]] : [[3, 1], [2, 2], [1, 3]];
  for (const [i, j] of slot) p.set(x + i, y + j, R.steel[1]);
  p.set(x + 1, y + 1, R.steel[6] ?? R.steel[5]);
}
/** a 2 x 2 rivet: lit cap, shaded foot */
export function rivet(p: Pix, x: number, y: number, ramp: readonly number[]) { p.set(x, y, R.steel[5]); p.set(x + 1, y, R.steel[4]); p.set(x, y + 1, R.steel[3]); p.set(x + 1, y + 1, R.steel[2]); p.set(x + 2, y + 1, ramp[0]); p.set(x + 1, y + 2, ramp[0]); }

/** a sunk CRT well: an outline, a shaded upper-left lip (it is recessed), a lit lower-right lip, dark phosphor glass
 *  with scanlines, darker corners, and one hard glare streak */
export function well(p: Pix, x: number, y: number, w: number, h: number, o: { amber?: boolean; glare?: boolean } = {}) {
  const G = R.malachite;
  p.rect(x, y, w, h, R.ink[0]);
  p.hl(x + 1, x + w - 2, y + 1, R.steel[1]); p.vl(x + 1, y + 1, y + h - 2, R.steel[1]);
  p.hl(x + 1, x + w - 2, y + h - 2, R.steel[4]); p.vl(x + w - 2, y + 1, y + h - 2, R.steel[4]);
  p.set(x + w - 2, y + 1, R.steel[2]); p.set(x + 1, y + h - 2, R.steel[2]);
  const gx = x + 2, gy = y + 2, gw = w - 4, gh = h - 4;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const cx = Math.min(i, gw - 1 - i), cy = Math.min(j, gh - 1 - j), corner = cx + cy < 3;
    p.set(gx + i, gy + j, corner ? R.ink[0] : j % 2 ? R.ink[0] : (o.amber ? R.ink[1] : G[0]));
  }
  // the inner shadow under the lip
  p.hl(gx, gx + gw - 1, gy, R.ink[0]); p.vl(gx, gy, gy + gh - 1, R.ink[0]);
  if (o.glare !== false && gw > 10 && gh > 6) {
    for (let t = 0; t < Math.min(gw, gh) * 0.6; t++) { const a = gx + 3 + t, b = gy + gh - 3 - t; if (b > gy + 1 && a < gx + gw - 2) { p.set(a, b, G[1]); if (t % 3) p.set(a + 2, b, G[1]); } }
  }
}
/** the plate itself */
export function platePix(w: number, h: number, o: PlateOpts = {}): Pix {
  const p = new Pix(w, h), mat = o.mat ?? 'olive', Rm = RAMP[mat], seed = o.seed ?? 1, wear = o.wear ?? 1;
  const sw = swatch(mat === 'steel' ? 'steel' : mat === 'deck' ? 'deck' : 'olive');
  const ox = Math.floor(hash(seed, 1) * 64), oy = Math.floor(hash(seed, 2) * 64);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (((y + oy) & 63) * 64 + ((x + ox) & 63)) * 4; p.set(x, y, (sw.d[i] << 16) | (sw.d[i + 1] << 8) | sw.d[i + 2]); }
  // grime along the foot: runs of the shade step, longer near the bottom
  for (let y = h - 6; y < h - 1; y++) { const k = (y - (h - 6)) / 5; for (let x = 1; x < w - 1; x++) if (hash(Math.floor(x / (3 + Math.floor(hash(y, 9) * 4))), y, seed) < k * 0.8) p.set(x, y, Rm[1]); }
  // seams
  for (const sx of o.seams ?? []) { p.vl(sx, 2, h - 3, Rm[0]); p.vl(sx + 1, 2, h - 3, Rm[3]); for (let y = 6; y < h - 6; y += 9) { rivet(p, sx - 3, y, Rm); rivet(p, sx + 3, y + 4, Rm); } }
  // deliberate scratches: a few diagonal strokes with a lit lip, placed by the seed
  const ns = Math.round((1 + (w * h) / 6000) * wear);
  for (let s = 0; s < ns; s++) {
    const x0 = 6 + Math.floor(hash(seed, 10 + s) * (w - 20)), y0 = 4 + Math.floor(hash(seed, 20 + s) * (h - 10)), L = 4 + Math.floor(hash(seed, 30 + s) * 9), dir = hash(seed, 40 + s) < 0.5 ? 1 : -1;
    for (let t = 0; t < L; t++) { const x = x0 + t, y = y0 + Math.round(t * 0.35 * dir); p.set(x, y, Rm[4]); p.set(x, y + 1, Rm[1]); }
  }
  // chips down to the steel along the edges (a lit lip above-left, a shade below-right)
  const nc = Math.round(((w + h) / 26) * wear);
  for (let s = 0; s < nc; s++) {
    const side = Math.floor(hash(seed, 50 + s) * 4), t = hash(seed, 60 + s);
    let cx = Math.floor(t * (w - 8)) + 4, cy = 3;
    if (side === 1) cy = h - 5; else if (side === 2) { cx = 3; cy = Math.floor(t * (h - 8)) + 4; } else if (side === 3) { cx = w - 5; cy = Math.floor(t * (h - 8)) + 4; }
    const cw = 2 + Math.floor(hash(seed, 70 + s) * 3), ch = 1 + Math.floor(hash(seed, 80 + s) * 2);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw - (j ? 1 : 0); i++) p.set(cx + i + j, cy + j, j === 0 && i === 0 ? R.steel[5] : R.steel[3]);
    p.set(cx + cw, cy + ch, Rm[0]); p.set(cx - 1, cy, Rm[4]);
  }
  if (o.rivets) for (let x = 10; x < w - 10; x += 12) { rivet(p, x, 4, Rm); rivet(p, x + 6, h - 7, Rm); }
  if (o.hazard) { for (let x = 3; x < w - 3; x++) for (let y = h - 6; y < h - 3; y++) p.set(x, y, ((x + y) >> 2) & 1 ? R.ochre[4] : R.ink[1]); p.hl(3, w - 4, h - 7, R.ochre[5]); }
  // bevel: lit top and left, shaded bottom and right, the outline, chamfered corners
  p.hl(1, w - 2, 1, Rm[5] ?? Rm[4]); p.vl(1, 1, h - 2, Rm[4]); p.hl(2, w - 3, 2, Rm[3]); p.vl(2, 2, h - 3, Rm[3]);
  p.hl(1, w - 2, h - 2, Rm[1]); p.vl(w - 2, 1, h - 2, Rm[1]); p.hl(2, w - 3, h - 3, Rm[2] ?? Rm[1]);
  p.hl(0, w - 1, 0, Rm[0]); p.hl(0, w - 1, h - 1, Rm[0]); p.vl(0, 0, h - 1, Rm[0]); p.vl(w - 1, 0, h - 1, Rm[0]);
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) { p.clear(cx, cy); p.clear(cx + sx, cy); p.clear(cx, cy + sy); p.set(cx + sx, cy + sy, Rm[0]); }
  if (o.screws !== false && w > 20 && h > 16) { screw(p, 3, 3, seed); screw(p, w - 8, 3, seed + 1); screw(p, 3, h - 8, seed + 2); screw(p, w - 8, h - 8, seed + 3); }
  for (const [x, y, ww, hh] of o.wells ?? []) well(p, x, y, ww, hh);
  if (o.label) { const [lx, ly] = o.labelAt ?? [11, 3]; const x1 = fontText(p, o.label, lx, ly, R.paper[4], { shadow: Rm[0] }); for (let i = lx + 3; i < x1 - 2; i += 7) p.set(i + Math.floor(hash(seed, i) * 3), ly + 6, Rm[2]); }
  return p;
}

// ------------------------------------------------------------------ painting onto elements
const urls = new Map<string, string>();
function url(key: string, f: () => Pix) { let u = urls.get(key); if (!u) { u = f().url(); urls.set(key, u); if (urls.size > 400) urls.delete(urls.keys().next().value as string); } return u; }
/** paint an element's background to its own size (art px = css / K), repainted when it resizes */
export function skin(el: HTMLElement, paint: (w: number, h: number) => Pix, key = '') {
  el.classList.add('px-skin');
  let last = '';
  const apply = () => {
    const w = Math.max(8, Math.round(el.offsetWidth / K)), h = Math.max(8, Math.round(el.offsetHeight / K)), k = `${key}|${w}x${h}`;
    if (k === last || !el.offsetWidth) return; last = k;
    el.style.backgroundImage = `url(${key ? url(k, () => paint(w, h)) : paint(w, h).url()})`;
  };
  new ResizeObserver(() => fontsReady.then(apply)).observe(el);
  fontsReady.then(() => requestAnimationFrame(apply));
  return apply;
}

// ------------------------------------------------------------------ nine-slice pieces (keys, tags, wells)
export type KeyCol = 'bake' | 'olive' | 'red' | 'blue' | 'amber' | 'steel';
const KEYR: Record<KeyCol, readonly number[]> = { bake: R.clay, olive: R.olive, red: R.stampRed, blue: R.sapphire, amber: R.ochre, steel: R.steel };
/** a key cap 16 x 16 (slice 5): outline, a lit cap face with a highlight corner, the darker skirt below; down: sunk,
 *  no skirt; lit: a phosphor lamp line along the cap's top */
export function keyURL(col: KeyCol, state: 'up' | 'down' | 'lit' = 'up') {
  return url(`key|${col}|${state}`, () => {
    const p = new Pix(16, 16), Rk = KEYR[col], n = Rk.length;
    const down = state === 'down', top = down ? 2 : 0, skirt = down ? 0 : 3;
    p.rect(1, top + 1, 14, 14 - top - 1, R.ink[1]);
    // the skirt (the key's side)
    for (let y = 15 - skirt; y < 15; y++) p.hl(1, 14, y, Rk[Math.max(0, 1)]);
    // the cap
    const c0 = top + 1, c1 = 14 - skirt;
    p.rect(2, c0, 12, c1 - c0, Rk[Math.min(n - 1, 3)]);
    p.hl(2, 13, c0, Rk[n - 1]); p.vl(2, c0, c1 - 1, Rk[Math.min(n - 1, 4)]);
    p.hl(2, 13, c1 - 1, Rk[2]); p.vl(13, c0, c1 - 1, Rk[2]);
    p.set(3, c0 + 1, Rk[n - 1]); p.set(4, c0 + 1, Rk[Math.min(n - 1, 4)]);
    if (state === 'lit') { p.hl(4, 11, c0 + 1, R.malachite[5]); p.hl(4, 11, c0 + 2, R.malachite[3]); }
    // outline (coloured, chamfered)
    p.hl(1, 14, top, R.ink[0]); p.hl(1, 14, 15, R.ink[0]); p.vl(0, top + 1, 14, R.ink[0]); p.vl(15, top + 1, 14, R.ink[0]);
    return p;
  });
}
/** a dark glass strip 16 x 16 (slice 5) for tags and small readouts */
export function glassURL(amber = false) { return url('glass|' + amber, () => { const p = new Pix(16, 16); well(p, 0, 0, 16, 16, { amber, glare: false }); return p; }); }
/** an alert tag: a riveted dark plate with a coloured lamp bar on the left (slice 6) */
export function tagURL(level: 'info' | 'good' | 'warn' | 'bad' | 'crit') {
  return url('tag|' + level, () => {
    const p = new Pix(24, 16), L = level === 'good' ? R.malachite : level === 'warn' ? R.ochre : level === 'bad' || level === 'crit' ? R.stampRed : R.olive;
    p.rect(1, 1, 22, 14, level === 'crit' ? R.stampRed[0] : R.ink[1]);
    for (let y = 2; y < 14; y += 2) p.hl(7, 21, y, R.ink[0]);
    p.rect(1, 1, 4, 14, L[2]); p.vl(1, 1, 14, L[Math.min(L.length - 1, 4)]); p.vl(4, 1, 14, L[1]);
    p.hl(1, 22, 1, R.steel[2]); p.hl(1, 22, 14, R.ink[0]); p.vl(22, 1, 14, R.steel[1]);
    p.hl(0, 23, 0, R.ink[0]); p.hl(0, 23, 15, R.ink[0]); p.vl(0, 0, 15, R.ink[0]); p.vl(23, 0, 15, R.ink[0]);
    rivet(p, 19, 3, R.steel); rivet(p, 19, 11, R.steel);
    return p;
  });
}
/** a small pixel-font readout painted to a canvas (for numbers that must be pixel art) */
export function pixText(s: string, col: number, big = true, glow = -1) {
  const w = (big ? textW5(s) : textW3s(s)) + 2, h = big ? 9 : 7, p = new Pix(w, h);
  if (glow >= 0) { if (big) { text5(p, s, 0, 1, glow); text5(p, s, 2, 1, glow); text5(p, s, 1, 0, glow); text5(p, s, 1, 2, glow); } else { text3s(p, s, 0, 1, glow); text3s(p, s, 2, 1, glow); } }
  if (big) text5(p, s, 1, 1, col); else text3s(p, s, 1, 1, col);
  return p;
}
export { Pix, R, text3s, text5, textW3s, textW5 };

// ------------------------------------------------------------------ the house fonts as pixels
// Departure Mono ('Body', 11 px grid) and Spleen ('Title' 12x24, 'TitleL' 16x32) drawn into art canvases with a hard
// alpha threshold, so a glyph is exact pixels (at K = 2 they read as the 22 / 48 px sizes on screen).
let fcv: HTMLCanvasElement | null = null, fg: CanvasRenderingContext2D | null = null;
export type FontFace = 'Body' | 'Title' | 'TitleL';
export function fontPx(face: FontFace) { return face === 'Body' ? 11 : face === 'Title' ? 24 : 32; }
/** width of a string in the face (art px) */
export function textWidth(s: string, face: FontFace = 'Body') { fcv ??= document.createElement('canvas'); fg ??= fcv.getContext('2d', { willReadFrequently: true })!; fg.font = `${fontPx(face)}px '${face}'`; return Math.ceil(fg.measureText(s).width); }
/** draw text as hard pixels: col, with an optional 1 px hard shadow (down-right) or a 1 px glow ring */
export function fontText(p: Pix, s: string, x: number, y: number, col: number, o: { face?: FontFace; shadow?: number; glow?: number; align?: 'left' | 'center' | 'right' } = {}) {
  const face = o.face ?? 'Body', size = fontPx(face), w = textWidth(s, face) + 4, h = Math.ceil(size * 1.3) + 2;
  if (w <= 4) return x;
  if (fcv!.width < w || fcv!.height < h) { fcv!.width = Math.max(w, fcv!.width); fcv!.height = Math.max(h, fcv!.height); }
  const g = fg!; g.clearRect(0, 0, fcv!.width, fcv!.height); g.font = `${size}px '${face}'`; g.textBaseline = 'top'; g.fillStyle = '#fff'; g.fillText(s, 1, 1);
  const d = g.getImageData(0, 0, w, h).data, x0 = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && d[(j * w + i) * 4 + 3] > 110;
  if (o.glow !== undefined) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (!on(i, j) && (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1))) p.set(x0 + i, y + j, o.glow);
  if (o.shadow !== undefined) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (on(i, j) && !on(i + 1, j + 1)) p.set(x0 + i + 1, y + j + 1, o.shadow);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (on(i, j)) p.set(x0 + i, y + j, col);
  return x0 + w;
}
/** make sure the faces are loaded before anything paints with them */
export const fontsReady = (() => { try { return Promise.all([document.fonts.load("11px 'Body'"), document.fonts.load("24px 'Title'"), document.fonts.load("32px 'TitleL'")]).then(() => true); } catch { return Promise.resolve(true); } })();
