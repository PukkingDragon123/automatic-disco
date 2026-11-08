// Furniture A — shared helpers: a tiny pixel font, texture-drawing helpers and
// reusable model parts (legs, casters, handles, CRT monitors, book rows...).
// Textures here are shared by every a_*.ts file (prefix `p_`).
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer, ph } from '../../gfx/pixel';
import { tileFbm, Rng } from '../../core/rng';
import type { ModelBuilder, PrimOpts, TexSpec } from '../../gfx/modelBuilder';

export { atlas, addTextureModule, PixelCanvas, makeRamp, mixHex, scaleHex, bayer, ph, tileFbm, Rng };
export type { ModelBuilder, PrimOpts, TexSpec };

/** Tile-local z of a wall face for onWall objects (walls are 0.12 m thick, centred on the tile edge). */
export const WZ = -0.44;

// ---------------------------------------------------------------- pixel font
// 3x5 capitals/digits (some glyphs narrower). Rows top→bottom, 'X' = ink.
const GLYPHS: Record<string, string[]> = {
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'], B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'], C: ['.XX', 'X..', 'X..', 'X..', '.XX'],
  D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'], E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'], F: ['XXX', 'X..', 'XX.', 'X..', 'X..'],
  G: ['.XX', 'X..', 'X.X', 'X.X', '.XX'], H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'], I: ['XXX', '.X.', '.X.', '.X.', 'XXX'],
  J: ['..X', '..X', '..X', 'X.X', '.X.'], K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'], L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
  M: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'], N: ['XX.', 'X.X', 'X.X', 'X.X', 'X.X'], O: ['.X.', 'X.X', 'X.X', 'X.X', '.X.'],
  P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'], Q: ['.X.', 'X.X', 'X.X', 'XX.', '.XX'], R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'],
  S: ['.XX', 'X..', '.X.', '..X', 'XX.'], T: ['XXX', '.X.', '.X.', '.X.', '.X.'], U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
  V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'], W: ['X.X', 'X.X', 'XXX', 'XXX', 'X.X'], X: ['X.X', 'X.X', '.X.', 'X.X', 'X.X'],
  Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'], Z: ['XXX', '..X', '.X.', 'X..', 'XXX'],
  '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'], '2': ['XX.', '..X', '.X.', 'X..', 'XXX'],
  '3': ['XX.', '..X', '.X.', '..X', 'XX.'], '4': ['X.X', 'X.X', 'XXX', '..X', '..X'], '5': ['XXX', 'X..', 'XX.', '..X', 'XX.'],
  '6': ['.XX', 'X..', 'XXX', 'X.X', 'XXX'], '7': ['XXX', '..X', '.X.', '.X.', '.X.'], '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  '9': ['XXX', 'X.X', 'XXX', '..X', 'XX.'],
  ' ': ['..', '..', '..', '..', '..'], '.': ['.', '.', '.', '.', 'X'], ',': ['..', '..', '..', '.X', 'X.'],
  '!': ['X', 'X', 'X', '.', 'X'], '?': ['XX.', '..X', '.X.', '...', '.X.'], '-': ['...', '...', 'XXX', '...', '...'],
  ':': ['.', 'X', '.', 'X', '.'], '/': ['..X', '..X', '.X.', 'X..', 'X..'], '=': ['...', 'XXX', '...', 'XXX', '...'],
  '+': ['...', '.X.', 'XXX', '.X.', '...'], '(': ['.X', 'X.', 'X.', 'X.', '.X'], ')': ['X.', '.X', '.X', '.X', 'X.'],
  "'": ['X', 'X', '.', '.', '.'], '$': ['.XX', 'XX.', '.X.', '.XX', 'XX.'], '%': ['X.X', '..X', '.X.', 'X..', 'X.X'],
  '#': ['X.X', 'XXX', 'X.X', 'XXX', 'X.X'], '*': ['X.X', '.X.', 'X.X', '...', '...'], '<': ['..X', '.X.', 'X..', '.X.', '..X'],
  '>': ['X..', '.X.', '..X', '.X.', 'X..'], '&': ['.X.', 'X.X', '.X.', 'X.X', '.XX'], '¢': ['.X.', 'XXX', 'X..', 'XXX', '.X.'],
  '♥': ['X.X', 'XXX', 'XXX', '.X.', '...'], '_': ['...', '...', '...', '...', 'XXX'], '"': ['X.X', 'X.X', '...', '...', '...'],
};

/** Pixel width of a string in the 3x5 font */
export function txtW(s: string, sp = 1): number {
  let w = 0;
  for (const ch of s.toUpperCase()) w += (GLYPHS[ch] ?? GLYPHS['?'])[0].length + sp;
  return Math.max(0, w - sp);
}

/** Draw text with the 3x5 font. scale enlarges each font pixel. Returns width drawn. */
export function txt(pc: PixelCanvas, s: string, x: number, y: number, c: number, sp = 1, scale = 1): number {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS['?'];
    for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) {
      if (g[j][i] !== 'X') continue;
      for (let a = 0; a < scale; a++) for (let b = 0; b < scale; b++) pc.set(cx + i * scale + a, y + j * scale + b, c);
    }
    cx += (g[0].length + sp) * scale;
  }
  return cx - x - sp * scale;
}

/** Centred text */
export function txtC(pc: PixelCanvas, s: string, cx: number, y: number, c: number, sp = 1, scale = 1) {
  return txt(pc, s, Math.round(cx - (txtW(s, sp) * scale) / 2), y, c, sp, scale);
}

/** Illegible "text lines" (words of 1–4 px separated by gaps) */
export function scribble(pc: PixelCanvas, x0: number, y0: number, w: number, rows: number, c: number, seed: number, gap = 2, alpha = 1) {
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * gap;
    const end = x0 + w - (r === rows - 1 ? Math.floor(ph(r, seed, 3) * w * 0.6) : Math.floor(ph(r, seed, 5) * 2));
    let x = x0 + (r === 0 && ph(seed, 1, 1) < 0.5 ? 1 : 0);
    while (x < end) {
      const wl = 1 + Math.floor(ph(x, y, seed) * 4);
      for (let i = 0; i < wl && x + i < end; i++) {
        if (alpha >= 1) pc.set(x + i, y, c); else pc.blend(x + i, y, c, alpha);
      }
      x += wl + 1;
    }
  }
}

// ---------------------------------------------------------------- texture helpers
/** Fill a sub-rectangle through a ramp with ordered dithering. fn gets local coords. */
export function fillR(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, ramp: number[], fn: (x: number, y: number) => number, dither = 1) {
  const n = ramp.length;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = fn(x, y); v = v < 0 ? 0 : v > 1 ? 1 : v;
    const f = v * (n - 1);
    let i = Math.floor(f);
    if (f - i > 0.5 + (bayer(x0 + x, y0 + y) - 0.5) * dither) i++;
    pc.set(x0 + x, y0 + y, ramp[Math.min(n - 1, i)]);
  }
}

/** Flat-ish panel with soft clustered noise, plus light top/left and dark bottom/right bevel. */
export function plate(pc: PixelCanvas, x: number, y: number, w: number, h: number, base: number, seed = 1, opts: { noise?: number; bevel?: boolean; light?: number; dark?: number } = {}) {
  const R = makeRamp(base, 5, { spread: 0.35 });
  const amp = opts.noise ?? 0.12;
  fillR(pc, x, y, w, h, R, (a, b) => 0.5 + (tileFbm(a + x, b + y, 64, 64, 8, 2, seed) - 0.5) * amp * 4, 0.8);
  if (opts.bevel !== false) {
    const L = opts.light ?? R[4], D = opts.dark ?? R[1];
    pc.hline(x, x + w - 1, y, L); pc.vline(x, y, y + h - 1, L);
    pc.hline(x, x + w - 1, y + h - 1, D); pc.vline(x + w - 1, y, y + h - 1, D);
  }
}

/** Tiny screw head (2x2 or 1px) */
export function screw(pc: PixelCanvas, x: number, y: number, light: number, dark: number, big = false) {
  if (big) { pc.set(x, y, light); pc.set(x + 1, y, mixHex(light, dark, 0.5)); pc.set(x, y + 1, mixHex(light, dark, 0.5)); pc.set(x + 1, y + 1, dark); }
  else { pc.set(x, y, dark); pc.blend(x - 1, y - 1, light, 0.4); }
}

/** Seamless scuffs / wear lines */
export function scuffs(pc: PixelCanvas, rng: Rng, c: number, n: number, alpha = 0.35) {
  for (let k = 0; k < n; k++) {
    const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1), len = rng.int(2, 5);
    const dx = rng.chance(0.5) ? 1 : 0, dy = dx ? (rng.chance(0.3) ? 1 : 0) : 1;
    for (let i = 0; i < len; i++) pc.blend(x + i * dx, y + i * dy, c, alpha);
  }
}

/** Dark frame border of thickness t */
export function border(pc: PixelCanvas, c: number, t = 1, x = 0, y = 0, w = pc.w, h = pc.h) {
  for (let i = 0; i < t; i++) pc.strokeRect(x + i, y + i, w - i * 2, h - i * 2, c);
}

/** Vertical CRT-style curved-glass vignette and scanlines over a rect */
export function crtGlass(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, edge: number, strength = 0.5, scan = true) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h * 2 - 1;
    const d = Math.max(Math.abs(u) ** 3, Math.abs(v) ** 3);
    if (d > 0.35) pc.blend(x0 + x, y0 + y, edge, Math.min(1, (d - 0.35) * strength * 1.6));
    if (scan && y % 2 === 1) pc.blend(x0 + x, y0 + y, edge, 0.12);
  }
  // corner pixels rounded
  pc.set(x0, y0, edge); pc.set(x0 + w - 1, y0, edge); pc.set(x0, y0 + h - 1, edge); pc.set(x0 + w - 1, y0 + h - 1, edge);
  // glare
  pc.blend(x0 + 1, y0 + 1, 0xffffff, 0.35); pc.blend(x0 + 2, y0 + 1, 0xffffff, 0.2); pc.blend(x0 + 1, y0 + 2, 0xffffff, 0.2);
}

/** A row of book spines (tileable horizontally) inside rect */
export function bookRow(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, seed: number, opts: { lean?: boolean; gaps?: number; dusty?: boolean; palette?: number[] } = {}) {
  const pal = opts.palette ?? [0x7a2e2a, 0x2f4a6e, 0x3e5e3a, 0x8a6a2e, 0x5a3a5e, 0x9a8a6a, 0x2a2a30, 0xb4a27a, 0x6e2a3a, 0x40606a, 0xa05a2a, 0xd8cfb4];
  // dark shelf-back first
  pc.rect(x0, y0, w, h, 0x1c1610);
  let x = x0;
  let k = 0;
  while (x < x0 + w) {
    const r = ph(k, seed, 11);
    const bw = r < 0.15 ? 1 : r < 0.6 ? 2 : r < 0.9 ? 3 : 4;
    const gap = (opts.gaps ?? 0.08) > ph(k, seed, 13);
    if (gap) { x += bw; k++; continue; }
    const bh = h - Math.floor(ph(k, seed, 17) * Math.min(4, h * 0.4));
    const col = pal[Math.floor(ph(k, seed, 19) * pal.length)];
    const R = makeRamp(col, 4, { spread: 0.4 });
    for (let i = 0; i < bw && x + i < x0 + w; i++) {
      for (let j = h - bh; j < h; j++) {
        const shade = i === 0 && bw > 1 ? R[3] : i === bw - 1 && bw > 2 ? R[1] : R[2];
        pc.set(x + i, y0 + j, shade);
      }
      // title band / gilt lines
      if (bh > 5) {
        const by = y0 + h - bh + 1 + Math.floor(ph(k, seed, 23) * 2);
        if (ph(k, seed, 29) < 0.6) pc.set(x + i, by, mixHex(col, 0xe8d08a, 0.6));
        if (ph(k, seed, 31) < 0.5) pc.set(x + i, y0 + h - 2, mixHex(col, 0x000000, 0.4));
        if (bw >= 3 && i === 1 && ph(k, seed, 37) < 0.7) pc.set(x + i, by + 2, mixHex(col, 0xf0e6c8, 0.5));
      }
    }
    // top of spine slightly lighter
    pc.set(x, y0 + h - bh, R[3]);
    if (opts.dusty) for (let i = 0; i < bw; i++) pc.blend(x + i, y0 + h - bh, 0xb0a890, 0.5);
    x += bw;
    k++;
  }
}

// ---------------------------------------------------------------- model helpers
/** Four square legs inset at the corners of a w×d rect centred at (cx,cz) */
export function legs4(mb: ModelBuilder, w: number, d: number, h: number, t: number, tex: TexSpec, o: PrimOpts = {}, cx = 0, cz = 0, y = 0, inset = 0) {
  const hx = w / 2 - t / 2 - inset, hz = d / 2 - t / 2 - inset;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(cx + sx * hx, y, cz + sz * hz, t, h, t, tex, o);
}

/** Four round legs (low-seg cylinders) */
export function rlegs4(mb: ModelBuilder, w: number, d: number, h: number, r: number, tex: TexSpec, o: PrimOpts & { rTop?: number } = {}, cx = 0, cz = 0, y = 0, segs = 6) {
  const hx = w / 2 - r, hz = d / 2 - r;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.cylinder(cx + sx * hx, y, cz + sz * hz, r, h, segs, tex, o);
}

/** Swivel caster: fork block + small wheel along x */
export function caster(mb: ModelBuilder, x: number, z: number, r = 0.035, y = 0) {
  mb.cylinderX(x, y + r, z, r, r * 0.9, 6, 'rubber_black');
  mb.box(x, y + r, z, r * 1.3, r * 1.2, r * 0.9, 'metal_dark');
}

/** Bar handle on a +z facing front at depth z: two posts + bar */
export function hbar(mb: ModelBuilder, cx: number, cy: number, z: number, w: number, tex = 'chrome', o: PrimOpts = {}, standoff = 0.035) {
  mb.box(cx - w / 2 + 0.01, cy - 0.01, z + standoff / 2, 0.02, 0.02, standoff, tex, o);
  mb.box(cx + w / 2 - 0.01, cy - 0.01, z + standoff / 2, 0.02, 0.02, standoff, tex, o);
  mb.box(cx, cy - 0.012, z + standoff, w, 0.024, 0.022, tex, o);
}

/** Vertical bar handle */
export function vbar(mb: ModelBuilder, cx: number, cy: number, z: number, h: number, tex = 'chrome', o: PrimOpts = {}, standoff = 0.035) {
  mb.box(cx, cy - h / 2, z + standoff / 2, 0.02, 0.02, standoff, tex, o);
  mb.box(cx, cy + h / 2 - 0.02, z + standoff / 2, 0.02, 0.02, standoff, tex, o);
  mb.box(cx, cy - h / 2, z + standoff, 0.024, h, 0.022, tex, o);
}

/** Small knob */
export function knob(mb: ModelBuilder, x: number, y: number, z: number, s = 0.035, tex = 'metal_brass', o: PrimOpts = {}) {
  mb.box(x, y - s / 2, z + s / 2, s, s, s, tex, o);
}

/** Generic drawer/door fronts: a dark recess panel with proud fronts separated by ~1px gaps. */
export function frontGrid(mb: ModelBuilder, x0: number, x1: number, y0: number, y1: number, z: number, cols: number[], rows: number[], tex: TexSpec, o: PrimOpts = {}, gap = 0.03, recessTex = 'metal_dark') {
  // recess
  mb.boxMinMax(x0, y0, z - 0.01, x1, y1, z + 0.002, recessTex, { color: 0x6a6a6a });
  const W = x1 - x0, H = y1 - y0;
  const cs = cols.reduce((a, b) => a + b, 0), rs = rows.reduce((a, b) => a + b, 0);
  const cells: { x0: number; x1: number; y0: number; y1: number }[] = [];
  let cy = y1;
  for (const r of rows) {
    const h = (r / rs) * H;
    let cx = x0;
    for (const c of cols) {
      const w = (c / cs) * W;
      cells.push({ x0: cx + gap / 2, x1: cx + w - gap / 2, y0: cy - h + gap / 2, y1: cy - gap / 2 });
      cx += w;
    }
    cy -= h;
  }
  for (const c of cells) mb.boxMinMax(c.x0, c.y0, z, c.x1, c.y1, z + 0.02, tex, o);
  return cells;
}

/** Beige 90s CRT monitor sitting at y (front +z). Returns screen top y. */
export function crtMonitor(mb: ModelBuilder, cx: number, y: number, cz: number, size = 1, screen = 'p_crt_term', glow = 0.85, body = 'plastic_beige', bodyCol = 0xffffff) {
  const s = size;
  // swivel foot
  mb.box(cx, y, cz, 0.24 * s, 0.025, 0.22 * s, body, { color: bodyCol });
  mb.box(cx, y + 0.025, cz, 0.12 * s, 0.03, 0.12 * s, body, { color: scaleHex(bodyCol, 0.9) });
  const y0 = y + 0.055;
  // tapered tube housing behind
  mb.box(cx, y0 + 0.03 * s, cz - 0.11 * s, 0.26 * s, 0.24 * s, 0.2 * s, body, { color: scaleHex(bodyCol, 0.92) });
  mb.box(cx, y0 + 0.06 * s, cz - 0.23 * s, 0.18 * s, 0.17 * s, 0.06 * s, body, { color: scaleHex(bodyCol, 0.85) });
  // front bezel
  mb.box(cx, y0, cz + 0.03 * s, 0.38 * s, 0.33 * s, 0.1 * s, body, { color: bodyCol });
  // screen glass (slightly inset look via a thin proud box with fit texture)
  mb.box(cx - 0.005 * s, y0 + 0.07 * s, cz + 0.08 * s + 0.002, 0.3 * s, 0.225 * s, 0.006, { south: screen, all: 'glass_dark' }, { fit: { south: true }, emissive: glow });
  // power led + button
  mb.box(cx + 0.15 * s, y0 + 0.025, cz + 0.082 * s, 0.02, 0.015, 0.006, 'led_green', { emissive: glow > 0 ? 1.2 : 0 });
  mb.box(cx + 0.1 * s, y0 + 0.022, cz + 0.082 * s, 0.03, 0.02, 0.008, body, { color: scaleHex(bodyCol, 0.8) });
  return y0 + 0.33 * s;
}

/** Beige keyboard lying at y */
export function keyboard(mb: ModelBuilder, cx: number, y: number, cz: number, w = 0.44, tex = 'p_keyboard') {
  mb.wedge(cx, y, cz, w, 0.16, 0.035, 0.02, { top: tex, all: 'plastic_beige' });
}

/** A few small paper sheets lying on a surface */
export function papers(mb: ModelBuilder, cx: number, y: number, cz: number, n = 3, seed = 1) {
  for (let i = 0; i < n; i++) {
    const a = (ph(i, seed, 3) - 0.5) * 0.6;
    const dx = (ph(i, seed, 5) - 0.5) * 0.12, dz = (ph(i, seed, 7) - 0.5) * 0.08;
    mb.push().translate(cx + dx, y + 0.002 + i * 0.003, cz + dz).rotateY(a);
    mb.box(0, 0, 0, 0.21, 0.003, 0.29, { top: 'p_paper_doc', all: 'paper' }, { fit: { top: true } });
    mb.pop();
  }
}

/** Mug (cylinder) */
export function mug(mb: ModelBuilder, x: number, y: number, z: number, col = 0xe8e2d4) {
  mb.cylinder(x, y, z, 0.04, 0.09, 7, { sides: 'porcelain', top: 'p_coffee_top', bottom: 'porcelain' }, { color: col, fit: true });
  mb.box(x + 0.048, y + 0.025, z, 0.016, 0.045, 0.012, 'porcelain', { color: col });
}

/** Mirror a canvas horizontally (cylinder side textures read mirrored from outside) */
export function flipH(pc: PixelCanvas) {
  const was = pc.wrap; pc.wrap = false;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w / 2; x++) {
    const a = pc.get(x, y), aa = pc.alpha(x, y), b = pc.get(pc.w - 1 - x, y), ba = pc.alpha(pc.w - 1 - x, y);
    pc.set(x, y, b, ba); pc.set(pc.w - 1 - x, y, a, aa);
  }
  pc.wrap = was;
}

/** Mirror a canvas vertically (cylinderZ caps read upside-down) */
export function flipV(pc: PixelCanvas) {
  const was = pc.wrap; pc.wrap = false;
  for (let y = 0; y < pc.h / 2; y++) for (let x = 0; x < pc.w; x++) {
    const a = pc.get(x, y), aa = pc.alpha(x, y), b = pc.get(x, pc.h - 1 - y), ba = pc.alpha(x, pc.h - 1 - y);
    pc.set(x, y, b, ba); pc.set(x, pc.h - 1 - y, a, aa);
  }
  pc.wrap = was;
}

/** Cross-card foliage helper drawing (transparent background): leaves radiating from bottom centre */
export function leafCard(pc: PixelCanvas, rng: Rng, opts: { base: number; n: number; len: [number, number]; width?: number; spread?: number; droop?: number; stem?: number }) {
  const R = makeRamp(opts.base, 6, { hueShift: 0.06, spread: 0.55 });
  const W = pc.w, H = pc.h;
  const cx = W / 2;
  for (let i = 0; i < opts.n; i++) {
    const t = opts.n > 1 ? i / (opts.n - 1) : 0.5;
    const ang = -Math.PI / 2 + (t - 0.5) * (opts.spread ?? 2.2) + (rng.next() - 0.5) * 0.25;
    const len = rng.float(opts.len[0], opts.len[1]);
    const lw = opts.width ?? 1.6;
    const droop = opts.droop ?? 0.012;
    let x = cx + (rng.next() - 0.5) * 2, y = H - 1;
    let dx = Math.cos(ang), dy = Math.sin(ang);
    for (let s = 0; s < len; s++) {
      const prog = s / len;
      const wdt = Math.max(0.5, lw * Math.sin(Math.PI * Math.min(1, prog * 1.15 + 0.08)));
      for (let k = -Math.ceil(wdt); k <= Math.ceil(wdt); k++) {
        if (Math.abs(k) > wdt) continue;
        const px = Math.round(x - dy * k), py = Math.round(y + dx * k);
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const side = k < 0 ? 1 : 0; // light upper side
        const shade = 2 + side + (prog > 0.5 ? 1 : 0) - (Math.abs(k) >= wdt - 0.5 ? 1 : 0);
        pc.set(px, py, R[Math.max(0, Math.min(5, shade))]);
      }
      // midrib
      const mx = Math.round(x), my = Math.round(y);
      if (mx >= 0 && my >= 0 && mx < W && my < H && prog > 0.1) pc.set(mx, my, R[1 + (prog > 0.6 ? 1 : 0)]);
      x += dx; y += dy;
      dy += droop * (1 + prog * 2);
      const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    }
  }
  if (opts.stem) for (let y = H - opts.stem; y < H; y++) pc.set(Math.round(cx), y, R[1]);
}

// ---------------------------------------------------------------- dev preview fallbacks
// Only with `?fafb=1` in the URL: flat stand-ins for generic material names that
// no texture module has defined yet (runs after every other registrar).
const FALLBACK: Record<string, number> = {
  wood_light: 0xb08a5a, wood_dark: 0x6a4a2e, wood_trim: 0x8a6a44, metal_grey: 0x8a8c8e, metal_dark: 0x4a4c50,
  metal_brass: 0xb08a3a, metal_rusty: 0x8a5a3a, metal_brushed: 0xa8aaac, chrome: 0xc8ccd0, plastic_white: 0xe4e2dc,
  plastic_black: 0x2c2c2e, plastic_beige: 0xcfc6ac, plastic_red: 0xc03a30, plastic_blue: 0x3a6ab0, plastic_yellow: 0xe0c040,
  fabric_grey: 0x8a8a88, fabric_blue: 0x4a5a8a, fabric_red: 0x9a3a3a, fabric_floral: 0xc8a8a0, fabric_brown: 0x7a5a3a,
  fabric_green: 0x4a6a4a, leather_brown: 0x6a4228, leather_black: 0x2a2624, rubber_black: 0x1e1e20, porcelain: 0xeeeee8,
  paper: 0xe8e4d6, cardboard: 0xb08a5a, glass: 0xb8d0d8, glass_dark: 0x2a3438, mattress: 0xd8d4c8, pillow: 0xeeeae0,
  towel: 0xd8e0e8, marble: 0xe0dcd4, screen_off: 0x1a1e1e, screen_on: 0x6ac8e8, led_green: 0x40ff60, led_red: 0xff3030,
  curtain: 0xb8a890, carpet_rug: 0x8a3a3a, water: 0x3a8ab0,
};
addTextureModule(() => {
  if (typeof location === 'undefined' || !location.search.includes('fafb=1')) return;
  addTextureModule(() => {
    const A = atlas();
    for (const [name, c] of Object.entries(FALLBACK)) {
      if (A.has(name)) continue;
      A.add(name, 16, 16, (pc) => {
        const R = makeRamp(c, 4, { spread: 0.3 });
        pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 16, 16, 4, 2, c & 255) - 0.5) * 0.5 + (name.startsWith('wood') ? Math.sin(y * 0.9 + x * 0.15) * 0.12 : 0), 0.8);
      });
    }
  });
});

// ---------------------------------------------------------------- shared textures
addTextureModule(() => {
  const A = atlas();

  // green-phosphor terminal screen (fit) 10x8
  A.add('p_crt_term', 10, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0x08160c);
    const G = [0x1d4a26, 0x2f7a3a, 0x58c060, 0x9af08a];
    fillR(pc, 0, 0, 10, 8, [0x07120a, 0x0c2212, 0x123018], (x, y) => 0.6 - Math.hypot(x - 4.5, y - 3.5) / 9, 1);
    // text lines
    const rows = [[1, 6], [1, 4], [1, 7], [1, 3]];
    rows.forEach(([x, l], i) => { for (let k = 0; k < l; k++) if (ph(k, i, 41) > 0.18) pc.set(x + k, 1 + i * 1.5 | 0, G[1 + (k % 3 === 0 ? 1 : 0)]); });
    pc.set(1, 6, G[3]); pc.set(2, 6, G[2]); // prompt "> _"
    pc.set(4, 6, G[3]);
    crtGlass(pc, 0, 0, 10, 8, 0x020604, 0.6);
  });
  // blue desktop-ish CRT screen (fit) 10x8
  A.add('p_crt_blue', 10, 8, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 10, 8, makeRamp(0x2a4a9a, 4), (x, y) => 0.75 - Math.hypot(x - 4.5, y - 3.5) / 10, 1);
    pc.rect(1, 1, 8, 1, 0xd8dce8); pc.set(8, 1, 0x9a3030);
    pc.rect(2, 3, 5, 3, 0xc8c8c0); pc.rect(2, 3, 5, 1, 0x1a2a7a); pc.set(3, 4, 0x404040); pc.set(5, 4, 0x404040);
    crtGlass(pc, 0, 0, 10, 8, 0x0a0f20, 0.6);
  });
  // switched-off CRT: dark, slightly green-grey glass with reflection
  A.add('p_crt_off', 12, 10, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 12, 10, [0x0b0d0c, 0x151917, 0x1e2422, 0x2b3330], (x, y) => 0.55 - Math.hypot(x - 5.5, y - 4.5) / 12 + (x + y < 7 ? 0.2 : 0), 1);
    pc.blend(2, 2, 0xb8c8c0, 0.35); pc.blend(3, 2, 0xb8c8c0, 0.2); pc.blend(2, 3, 0xb8c8c0, 0.2);
    pc.line(8, 2, 10, 4, 0x3a4440);
    crtGlass(pc, 0, 0, 12, 10, 0x050606, 0.5, false);
  });
  // keyboard top 14x5 (fit)
  A.add('p_keyboard', 14, 5, (pc) => {
    pc.wrap = false;
    pc.fill(0xb8ae94);
    for (let y = 1; y < 4; y++) for (let x = 1; x < 13; x++) if ((x + (y === 2 ? 1 : 0)) % 2 === 1 || x > 10) pc.set(x, y, x > 10 ? 0x9a927a : 0xd8d0b8);
    pc.hline(3, 9, 4, 0xd8d0b8);
    for (let x = 0; x < 14; x++) pc.set(x, 4, 0x8a8268);
    pc.hline(1, 12, 0, 0xcfc6ac);
    pc.set(12, 1, 0x6aaa5a);
  });
  // document page with typed lines (fit) 7x9
  A.add('p_paper_doc', 7, 9, (pc) => {
    pc.wrap = false;
    pc.fill(0xe8e4d6);
    scribble(pc, 1, 1, 5, 4, 0x8a8a90, 3, 2);
    pc.set(6, 8, 0xc8c2b0); pc.set(0, 8, 0xd0cab8);
  });
  // coffee surface for mugs (top)
  A.add('p_coffee_top', 4, 4, (pc) => {
    pc.wrap = false;
    pc.fill(0xe8e2d4); pc.rect(1, 1, 2, 2, 0x3a2414); pc.set(1, 1, 0x5a3a20);
  });
  // book rows (tileable horizontally, 0.32m tall shelves)
  A.add('p_books_a', 32, 10, (pc) => bookRow(pc, 0, 0, 32, 10, 101));
  A.add('p_books_b', 32, 10, (pc) => bookRow(pc, 0, 0, 32, 10, 202, { gaps: 0.18 }));
  A.add('p_books_c', 32, 10, (pc) => bookRow(pc, 0, 0, 32, 10, 303, { dusty: true, palette: [0x6a5a4a, 0x4a4a52, 0x7a6a50, 0x3a4a3a, 0x8a7a62, 0x5a4038, 0xa89878] }));
  // generic ventilation louvres (tiles) 8x8
  A.add('p_vent', 8, 8, (pc) => {
    pc.fill(0x8a8c88);
    for (let y = 0; y < 8; y += 2) { pc.hline(0, 7, y, 0x3a3c3a); pc.hline(0, 7, y + 1, 0xa8aaa4); }
  });
  // small white sticker label (fit) 6x3
  A.add('p_label', 6, 3, (pc) => {
    pc.wrap = false;
    pc.fill(0xe6e0cc); pc.hline(1, 4, 1, 0x7a7a80); pc.set(5, 2, 0xc8c0a8);
  });
  // grey speaker grille / perforated metal (tile) 8x8
  A.add('p_perf', 8, 8, (pc) => {
    pc.fill(0x6a6c6c);
    for (let y = 0; y < 8; y += 2) for (let x = (y % 4 === 0 ? 0 : 1); x < 8; x += 2) pc.set(x, y, 0x2a2c2c);
  });
});
