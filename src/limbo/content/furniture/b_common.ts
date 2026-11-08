// Furniture B — shared helpers: tiny pixel font, texture treatments (rust,
// paint chips, hazard stripes, gauges, grilles), geometry helpers (rods,
// tori, rocks, draped cloth) and the shared `q_` material textures used by
// the industrial / pool / outdoor / playground / lab / anomaly / survival sets.
import * as THREE from 'three';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer, ph } from '../../gfx/pixel';
import { Rng, tileFbm, hashf } from '../../core/rng';
import { ModelBuilder, PrimOpts, TexSpec } from '../../gfx/modelBuilder';

export { makeRamp, mixHex, scaleHex, bayer, ph, tileFbm, hashf };
export type { PixelCanvas, Rng, ModelBuilder, PrimOpts, TexSpec };

// ---------------------------------------------------------------------------
// tiny 3x5 pixel font
// ---------------------------------------------------------------------------

const FONT: Record<string, boolean[]> = {};
const RAW: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'], N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'], '-': ['...', '...', '###', '...', '...'], '.': ['...', '...', '...', '...', '.#.'],
  ',': ['...', '...', '...', '.#.', '#..'], '!': ['.#.', '.#.', '.#.', '...', '.#.'], '?': ['##.', '..#', '.#.', '...', '.#.'],
  ':': ['...', '.#.', '...', '.#.', '...'], '/': ['..#', '..#', '.#.', '#..', '#..'], "'": ['.#.', '.#.', '...', '...', '...'],
  '=': ['...', '###', '...', '###', '...'], '(': ['..#', '.#.', '.#.', '.#.', '..#'], ')': ['#..', '.#.', '.#.', '.#.', '#..'],
  '+': ['...', '.#.', '###', '.#.', '...'], '%': ['#.#', '..#', '.#.', '#..', '#.#'], '#': ['#.#', '###', '#.#', '###', '#.#'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'], '<': ['..#', '.#.', '#..', '.#.', '..#'], '_': ['...', '...', '...', '...', '###'],
  '*': ['...', '#.#', '.#.', '#.#', '...'], ' ': ['...', '...', '...', '...', '...'],
};
for (const k of Object.keys(RAW)) FONT[k] = RAW[k].join('').split('').map((c) => c === '#');

/** width in px of a string drawn with text() */
export function textW(s: string, scale = 1) { return Math.max(0, s.length * 4 - 1) * scale; }

/** Draw text with the 3x5 pixel font. Returns the end x. */
export function text(pc: PixelCanvas, s: string, x: number, y: number, c: number, scale = 1, shadow?: number) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = FONT[ch] || FONT['?'];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i]) {
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
        if (shadow !== undefined) pc.set(cx + i * scale + sx + 1, y + j * scale + sy + 1, shadow);
        pc.set(cx + i * scale + sx, y + j * scale + sy, c);
      }
    }
    // redraw glyph over its own shadow
    if (shadow !== undefined) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i])
      for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) pc.set(cx + i * scale + sx, y + j * scale + sy, c);
    cx += 4 * scale;
  }
  return cx;
}
/** centred text */
export function textC(pc: PixelCanvas, s: string, cx: number, y: number, c: number, scale = 1, shadow?: number) {
  return text(pc, s, Math.round(cx - textW(s, scale) / 2), y, c, scale, shadow);
}
/** illegible "small print": dashes of varying length that read as text lines */
export function scribble(pc: PixelCanvas, x: number, y: number, w: number, c: number, seed = 1, lines = 1, gap = 2) {
  for (let l = 0; l < lines; l++) {
    let cx = x;
    const yy = y + l * gap;
    let k = 0;
    while (cx < x + w) {
      const len = 1 + Math.floor(hashf(k, l, seed) * 4);
      for (let i = 0; i < len && cx + i < x + w; i++) pc.set(cx + i, yy, c);
      cx += len + 1; k++;
    }
  }
}

// ---------------------------------------------------------------------------
// texture treatments
// ---------------------------------------------------------------------------
/** Clustered-noise ramp fill (tileable when cells divides evenly). */
export function fillNoise(pc: PixelCanvas, ramp: number[], base = 0.5, amp = 0.2, cells = 3, seed = 1, fine = 0.05, dither = 0.8) {
  pc.fillRamp(ramp, (x, y) => base + (tileFbm(x, y, pc.w, pc.h, cells, 3, seed) - 0.5) * amp * 2 + (ph(x, y, seed + 7) - 0.5) * fine, dither);
}
/** fill a rect with a ramp + clustered noise (non tiling) */
export function rectNoise(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, ramp: number[], base = 0.5, amp = 0.15, seed = 3, fine = 0.05) {
  const n = ramp.length;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    let v = base + (tileFbm(x, y, 32, 32, 4, 2, seed) - 0.5) * amp * 2 + (ph(x, y, seed) - 0.5) * fine;
    v = Math.max(0, Math.min(1, v));
    const f = v * (n - 1); let i = Math.floor(f);
    if (f - i > bayer(x, y)) i++;
    pc.set(x, y, ramp[Math.min(n - 1, i)]);
  }
}
/** Dithered vertical gradient between two colours over a rect (t=0 top). */
export function gradV(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, c0: number, c1: number, steps = 4) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = h <= 1 ? 0 : y / (h - 1);
    const q = Math.floor(t * steps + bayer(x0 + x, y0 + y) * 0.999) / steps;
    pc.set(x0 + x, y0 + y, mixHex(c0, c1, Math.min(1, q)));
  }
}
/** Rust clusters: amount 0..1. Optional rect restricts the area. */
export function rust(pc: PixelCanvas, seed: number, amount = 0.5, cells = 3, area?: [number, number, number, number]) {
  const RR = [0x3a2418, 0x553020, 0x6c4026, 0x82502e, 0x966238];
  const [ax, ay, aw, ah] = area || [0, 0, pc.w, pc.h];
  const th = 0.7 - amount * 0.22;
  for (let y = ay; y < ay + ah; y++) for (let x = ax; x < ax + aw; x++) {
    const n = tileFbm(x, y, pc.w, pc.h, cells, 3, seed) * 0.85 + ph(x, y, seed) * 0.15;
    if (n < th) continue;
    const t = Math.min(1, (n - th) / (1 - th) * 1.6);
    if (t < 0.18) { if (bayer(x, y) < 0.5) pc.blend(x, y, RR[3], 0.55); continue; }
    const k = Math.min(4, Math.floor((1 - t) * 3.2 + bayer(x, y) * 1.2) + (ph(x, y, seed + 1) < 0.2 ? 1 : 0));
    pc.set(x, y, RR[Math.max(0, Math.min(4, k))]);
  }
}
/** Paint chips revealing an undercoat; edge colour on the lower-right of each chip */
export function chips(pc: PixelCanvas, rng: Rng, n: number, under: number, edge: number, area?: [number, number, number, number]) {
  const [ax, ay, aw, ah] = area || [0, 0, pc.w, pc.h];
  for (let k = 0; k < n; k++) {
    const cx = ax + rng.int(0, aw - 1), cy = ay + rng.int(0, ah - 1);
    const s = rng.int(1, 3);
    const pts: [number, number][] = [];
    for (let j = 0; j < s; j++) for (let i = 0; i < s + (rng.chance(0.5) ? 1 : 0); i++) if (!(i === 0 && j === 0 && s > 2 && rng.chance(0.5))) pts.push([cx + i, cy + j]);
    for (const [x, y] of pts) pc.set(x, y, under);
    for (const [x, y] of pts) { if (!pts.some(([a, b]) => a === x && b === y + 1)) pc.blend(x, y + 1, edge, 0.6); }
  }
}
/** Diagonal stripes (hazard tape style) inside a rect */
export function stripes(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, c1: number, c2: number, period = 8, dir = 1) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const v = (((x * dir + y) % period) + period) % period;
    pc.set(x, y, v < period / 2 ? c1 : c2);
  }
}
/** Darken toward the bottom rows (dirt accumulation) */
export function grimeBottom(pc: PixelCanvas, c: number, rows: number, strength = 0.5, seed = 5) {
  for (let y = pc.h - rows; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const t = (y - (pc.h - rows)) / rows;
    const n = tileFbm(x, y, pc.w, pc.h, 4, 2, seed);
    if (t * strength + n * 0.4 - 0.2 > bayer(x, y)) pc.blend(x, y, c, 0.3 + 0.4 * t);
  }
}
/** single rivet / screw head */
export function rivet(pc: PixelCanvas, x: number, y: number, light: number, dark: number, mid?: number) {
  if (mid !== undefined) pc.set(x, y, mid);
  pc.set(x, y, light); pc.set(x + 1, y, mid ?? light); pc.set(x, y + 1, mid ?? dark); pc.set(x + 1, y + 1, dark);
}
export function screw(pc: PixelCanvas, x: number, y: number, light: number, dark: number) {
  pc.set(x, y, light); pc.blend(x + 1, y + 1, dark, 0.7);
}
/** recessed seam: dark line with a light line after it (horizontal) */
export function seamH(pc: PixelCanvas, x0: number, x1: number, y: number, dark: number, light: number) {
  pc.hline(x0, x1, y, dark); pc.hline(x0, x1, y + 1, light);
}
export function seamV(pc: PixelCanvas, x: number, y0: number, y1: number, dark: number, light: number) {
  pc.vline(x, y0, y1, dark); pc.vline(x + 1, y0, y1, light);
}
/** Mirror canvas horizontally (cylinder sides map u right-to-left seen from outside) */
export function mirrorX(pc: PixelCanvas) {
  const d = pc.data, w = pc.w;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < w / 2; x++) {
    const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4;
    for (let k = 0; k < 4; k++) { const t = d[a + k]; d[a + k] = d[b + k]; d[b + k] = t; }
  }
}
/** Flip canvas vertically (cylinderZ front caps map v downward) */
export function flipY(pc: PixelCanvas) {
  const d = pc.data, w = pc.w;
  for (let y = 0; y < pc.h / 2; y++) for (let x = 0; x < w; x++) {
    const a = (y * w + x) * 4, b = ((pc.h - 1 - y) * w + x) * 4;
    for (let k = 0; k < 4; k++) { const t = d[a + k]; d[a + k] = d[b + k]; d[b + k] = t; }
  }
}
/** draw into a scratch canvas, then copy it mirrored (for text on cylinders) */
export function mirroredStamp(pc: PixelCanvas, w: number, h: number, dx: number, dy: number, draw: (s: PixelCanvas) => void) {
  const s = new PixelCanvas(w, h);
  s.wrap = false;
  draw(s);
  mirrorX(s);
  pc.blit(s, dx, dy);
}
/** round gauge face (dial) centred at cx,cy */
export function gauge(pc: PixelCanvas, cx: number, cy: number, r: number, needleA = -0.6, face = 0xe8e0c8, bezel = 0x2c2c30, red = true) {
  pc.circle(cx, cy, r + 0.6, bezel);
  pc.circle(cx, cy, r - 0.4, face);
  // ticks
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI * 0.75 + (k / 6) * Math.PI * 1.5;
    const tx = cx + Math.cos(a) * (r - 1.3), ty = cy + Math.sin(a) * (r - 1.3);
    pc.set(Math.floor(tx), Math.floor(ty), k >= 5 && red ? 0xc8321e : 0x4a4640);
  }
  const a = -Math.PI / 2 + needleA;
  for (let t = 0; t < r - 1; t += 0.5) pc.set(Math.floor(cx + Math.cos(a) * t), Math.floor(cy + Math.sin(a) * t), 0x1a1614);
  pc.set(Math.floor(cx), Math.floor(cy), 0xc8321e);
  // glass glint
  pc.blend(Math.floor(cx - r * 0.5), Math.floor(cy - r * 0.55), 0xffffff, 0.6);
}
/** louvred grille in a rect */
export function grille(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, frame: number[], slat: number[], deep = 0x0c0c0e) {
  pc.rect(x0, y0, w, h, frame[2]);
  pc.bevel(x0, y0, w, h, frame[4], frame[0]);
  for (let y = y0 + 1; y < y0 + h - 1; y++) {
    const k = (y - y0 - 1) % 3;
    for (let x = x0 + 1; x < x0 + w - 1; x++) pc.set(x, y, k === 0 ? slat[3] : k === 1 ? slat[1] : deep);
  }
}
/** soft dithered glow spot (for lamp lenses etc.) */
export function glow(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, c: number, strength = 1) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 1 && (1 - d) * strength * 1.4 > bayer(x, y)) pc.set(x, y, c);
  }
}
/** quick wood plank fill (tileable vertically), grain along y when vertical=true */
export function woodFill(pc: PixelCanvas, ramp: number[], seed: number, plankW = 8, vertical = false, gap = true) {
  const W = pc.w, H = pc.h;
  pc.fillRamp(ramp, (x, y) => {
    const a = vertical ? x : y, b = vertical ? y : x;
    const plank = Math.floor(a / plankW);
    const off = hashf(plank, 0, seed) * 0.3 - 0.15;
    const grain = Math.sin((b * 0.35 + hashf(plank, 1, seed) * 20) + tileFbm(x, y, W, H, 2, 2, seed + plank) * 6) * 0.08;
    return 0.55 + off + grain + (tileFbm(x, y, W, H, 4, 2, seed + 9) - 0.5) * 0.18;
  }, 0.7);
  if (gap) for (let a = 0; a < (vertical ? W : H); a += plankW) {
    for (let b = 0; b < (vertical ? H : W); b++) {
      if (vertical) { pc.set(a, b, ramp[0]); pc.blend(a + 1, b, ramp[ramp.length - 1], 0.25); }
      else { pc.set(b, a, ramp[0]); pc.blend(b, a + 1, ramp[ramp.length - 1], 0.25); }
    }
  }
  // knots
  const rng = new Rng(seed);
  for (let k = 0; k < Math.max(1, Math.floor(W * H / 500)); k++) {
    const kx = rng.int(0, W - 1), ky = rng.int(0, H - 1);
    pc.set(kx, ky, ramp[0]); pc.blend(kx + 1, ky, ramp[1], 0.6); pc.blend(kx, ky + 1, ramp[1], 0.4);
  }
}
/** draw a filled polygon (convex or simple concave) */
export function poly(pc: PixelCanvas, pts: [number, number][], c: number) {
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
      const yy = y + 0.5;
      if ((y0 <= yy && y1 > yy) || (y1 <= yy && y0 > yy)) xs.push(x0 + (yy - y0) / (y1 - y0) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) pc.set(x, y, c);
  }
}

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0);
/** Bar from p0 to p1: square bar when segs <= 4, else a cylinder */
export function rod(mb: ModelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r: number, segs: number, tex: TexSpec, o: PrimOpts = {}) {
  const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
  const len = dir.length();
  if (len < 1e-5) return;
  dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir);
  mb.push(); mb.translate(x0, y0, z0); mb.matrix(new THREE.Matrix4().makeRotationFromQuaternion(q));
  if (segs <= 4) mb.box(0, 0, 0, r * 2, len, r * 2, tex, o);
  else mb.cylinder(0, 0, 0, r, len, segs, tex, { caps: false, ...o });
  mb.pop();
}
/** Torus lying in the XZ plane (ring), u wraps once around the ring */
export function torus(mb: ModelBuilder, cx: number, cy: number, cz: number, R: number, r: number, segs: number, tube: number, tex: string, o: PrimOpts = {}) {
  const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
  const P = (a: number, b: number) => [cx + Math.cos(a) * (R + r * Math.cos(b)), cy + r * Math.sin(b), cz + Math.sin(a) * (R + r * Math.cos(b))];
  for (let i = 0; i < segs; i++) for (let j = 0; j < tube; j++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const b0 = (j / tube) * Math.PI * 2, b1 = ((j + 1) / tube) * Math.PI * 2;
    const shade = 0.72 + 0.28 * Math.max(0, Math.sin((b0 + b1) / 2) * 0.6 + 0.5);
    mb.quadRaw([P(a0, b0), P(a0, b1), P(a1, b1), P(a1, b0)], [[i / segs, j / tube], [i / segs, (j + 1) / tube], [(i + 1) / segs, (j + 1) / tube], [(i + 1) / segs, j / tube]], tex, c, shade, e);
  }
}
/**
 * Irregular low-poly rock / blob sitting on y = cy. rx/rz are horizontal radii,
 * h the total height. flat = how much of the lower hemisphere is cut flat.
 */
export function rockBlob(mb: ModelBuilder, cx: number, cy: number, cz: number, rx: number, h: number, rz: number, seed: number, tex: string, segs = 7, rings = 4, o: PrimOpts & { flat?: number; jit?: number } = {}) {
  const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
  const tr = atlas().get(tex);
  const flat = o.flat ?? 0.35, jit = o.jit ?? 0.28;
  const ry = h / (2 - flat);
  const bottom = -ry * (1 - flat);
  const P = (i: number, j: number) => {
    const ii = ((i % segs) + segs) % segs;
    const th = (ii / segs) * Math.PI * 2 + hashf(ii, 3, seed) * 0.4;
    const phi = (j / rings) * Math.PI;
    const k = j === 0 || j === rings ? 1 : 1 - jit + 2 * jit * hashf(ii, j, seed);
    const s = Math.sin(phi);
    let y = Math.cos(phi) * ry;
    if (y < bottom) y = bottom;
    const yk = j === 0 || j === rings ? 1 : 0.85 + 0.3 * hashf(ii, j + 9, seed);
    return [cx + s * Math.cos(th) * rx * k, cy + (y - bottom) * yk, cz + s * Math.sin(th) * rz * k];
  };
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
    const a = P(i, j), b = P(i + 1, j), cc = P(i + 1, j + 1), d = P(i, j + 1);
    const uv = (p: number[]) => [(p[0] + p[2] * 0.7) / tr.mw, p[1] / tr.mh];
    const shade = 0.68 + 0.32 * (1 - j / rings);
    if (j === 0) mb.triRaw([cc, d, a], [uv(cc), uv(d), uv(a)], tex, c, shade, e);
    else if (j === rings - 1) mb.triRaw([b, d, a], [uv(b), uv(d), uv(a)], tex, c, shade, e);
    else mb.quadRaw([b, cc, d, a], [uv(b), uv(cc), uv(d), uv(a)], tex, c, shade, e);
  }
}
/** Draped sheet over a height function; skirt drops to y=0 around the edge */
export function drape(mb: ModelBuilder, x0: number, z0: number, x1: number, z1: number, nx: number, nz: number, hf: (x: number, z: number) => number, tex: string, o: PrimOpts = {}) {
  const c = o.color ?? 0xffffff;
  const tr = atlas().get(tex);
  const X = (i: number) => x0 + (x1 - x0) * i / nx, Z = (j: number) => z0 + (z1 - z0) * j / nz;
  const pt = (i: number, j: number) => [X(i), hf(X(i), Z(j)), Z(j)];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const p00 = pt(i, j + 1), p10 = pt(i + 1, j + 1), p11 = pt(i + 1, j), p01 = pt(i, j);
    const uv = (p: number[]) => [(p[0] - x0) / tr.mw, (z1 - p[2]) / tr.mh + p[1] * 0.3 / tr.mh];
    const ny = (p00[1] + p10[1] + p11[1] + p01[1]) / 4;
    const slope = Math.abs(p00[1] - p11[1]) + Math.abs(p10[1] - p01[1]);
    const shade = Math.max(0.7, 1 - slope * 0.25) * (0.94 + 0.06 * Math.min(1, ny));
    mb.quadRaw([p00, p10, p11, p01], [uv(p00), uv(p10), uv(p11), uv(p01)], tex, c, shade);
  }
  // skirts
  const skirt = (pa: number[], pb: number[], shade: number) => {
    if (pa[1] < 0.005 && pb[1] < 0.005) return;
    const L = Math.hypot(pb[0] - pa[0], pb[2] - pa[2]);
    mb.quadRaw([[pa[0], 0, pa[2]], [pb[0], 0, pb[2]], [pb[0], pb[1], pb[2]], [pa[0], pa[1], pa[2]]], [[0, 0], [L / tr.mw, 0], [L / tr.mw, pb[1] / tr.mh], [0, pa[1] / tr.mh]], tex, c, shade);
  };
  for (let i = 0; i < nx; i++) { skirt(pt(i, nz), pt(i + 1, nz), 0.92); skirt(pt(i + 1, 0), pt(i, 0), 0.8); }
  for (let j = 0; j < nz; j++) { skirt(pt(nx, j + 1), pt(nx, j), 0.86); skirt(pt(0, j), pt(0, j + 1), 0.78); }
}
/**
 * Push a local frame at p0 whose +z runs toward p1 and +y stays as close to
 * world-up as possible (for chutes, beams and planks along a path). Call
 * mb.pop() when done. Returns the segment length.
 */
export function pushSeg(mb: ModelBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  const f = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
  const len = f.length();
  f.normalize();
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(f.dot(up)) > 0.98) up = new THREE.Vector3(0, 0, -1);
  const r = new THREE.Vector3().crossVectors(up, f).normalize();
  const u = new THREE.Vector3().crossVectors(f, r).normalize();
  mb.push(); mb.translate(x0, y0, z0); mb.matrix(new THREE.Matrix4().makeBasis(r, u, f));
  return len;
}
/** Horizontal fan polygon at height y (outline points CCW seen from above in x,z) */
export function fan(mb: ModelBuilder, cx: number, y: number, cz: number, pts: [number, number][], tex: string, o: PrimOpts & { fitR?: number } = {}) {
  const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
  const R = o.fitR ?? 0.5;
  const uv = (x: number, z: number) => [0.5 + (x - cx) / (2 * R), 0.5 - (z - cz) / (2 * R)];
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    // winding: centre, b, a gives an upward normal for CCW (x right, z down) outlines
    mb.triRaw([[cx, y, cz], [bx, y, bz], [ax, y, az]], [uv(cx, cz), uv(bx, bz), uv(ax, az)], tex, c, 1, e);
  }
}
/** Flat disc facing +z (orient with push/rotate). Fit uvs, image upright along +y. */
export function disc(mb: ModelBuilder, cx: number, cy: number, cz: number, r: number, segs: number, tex: string, o: PrimOpts = {}) {
  const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    mb.triRaw([[cx, cy, cz], [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cz], [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, cz]],
      [[0.5, 0.5], [0.5 + Math.cos(a0) / 2, 0.5 + Math.sin(a0) / 2], [0.5 + Math.cos(a1) / 2, 0.5 + Math.sin(a1) / 2]], tex, c, 1, e);
  }
}
/** Horizontal disc facing up with fit uvs (image top toward -z) */
export function discY(mb: ModelBuilder, cx: number, y: number, cz: number, r: number, segs: number, tex: string, o: PrimOpts = {}) {
  const pts: [number, number][] = [];
  for (let i = 0; i < segs; i++) { const a = (i / segs) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  fan(mb, cx, y, cz, pts, tex, { ...o, fitR: r });
}
/** Short round dial/gauge facing +z: brass body plus a fit-textured face */
export function dial(mb: ModelBuilder, x: number, y: number, z: number, r: number, tex = 'q_gauge', body = 'metal_brass', depth = 0.05) {
  mb.cylinderZ(x, y, z + depth / 2, r * 1.08, depth, 8, body);
  disc(mb, x, y, z + depth + 0.002, r, 10, tex);
}
/** Ring band between two outlines (outer/inner) at height y */
export function ringBand(mb: ModelBuilder, y: number, outer: [number, number][], inner: [number, number][], tex: string, o: PrimOpts = {}) {
  const c = o.color ?? 0xffffff, e = o.emissive ?? 0;
  const tr = atlas().get(tex);
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const o0 = outer[i], o1 = outer[(i + 1) % n], i0 = inner[i], i1 = inner[(i + 1) % n];
    const uv = (p: [number, number]) => [p[0] / tr.mw, -p[1] / tr.mh];
    mb.quadRaw([[i0[0], y, i0[1]], [i1[0], y, i1[1]], [o1[0], y, o1[1]], [o0[0], y, o0[1]]], [uv(i0), uv(i1), uv(o1), uv(o0)], tex, c, 1, e, 0, [0, 1, 0]);
  }
}
/** quad with world-scale uvs computed from its edge lengths */
export function quadW(mb: ModelBuilder, p: number[][], tex: string, o: PrimOpts & { shade?: number; fitQ?: boolean } = {}) {
  const tr = atlas().get(tex);
  const L = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
  const H = Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
  const u1 = o.fitQ ? 1 : L / tr.mw, v1 = o.fitQ ? 1 : H / tr.mh;
  mb.quadRaw(p, [[0, 0], [u1, 0], [u1, v1], [0, v1]], tex, o.color ?? 0xffffff, o.shade ?? 1, o.emissive ?? 0, o.sway ?? 0);
}
/** triangle with planar uvs (u along p0->p1) */
export function triW(mb: ModelBuilder, p: number[][], tex: string, o: PrimOpts & { shade?: number } = {}) {
  const tr = atlas().get(tex);
  const ax = new THREE.Vector3(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
  const L = ax.length(); ax.normalize();
  const v2 = new THREE.Vector3(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
  const u2 = v2.dot(ax), h2 = Math.sqrt(Math.max(0, v2.lengthSq() - u2 * u2));
  mb.triRaw(p, [[0, 0], [L / tr.mw, 0], [u2 / tr.mw, h2 / tr.mh]], tex, o.color ?? 0xffffff, o.shade ?? 1, o.emissive ?? 0, o.sway ?? 0);
}

// ---------------------------------------------------------------------------
// shared textures
// ---------------------------------------------------------------------------
export const PAL = {
  ink: 0x16141a,
  void: 0x07070a,
  white: 0xece8dc,
  hazardY: 0xe0b42a,
  hazardK: 0x24211e,
  red: 0xb8322a,
  rust: 0x8a4a24,
};

addTextureModule(() => {
  const A = atlas();

  // yellow/black hazard stripes (tiling)
  A.add('q_hazard', 16, 16, (pc, rng) => {
    const Y = makeRamp(PAL.hazardY, 5, { spread: 0.35 }), K = makeRamp(0x2a2622, 4, { spread: 0.3 });
    pc.each((x, y) => {
      const v = (x + y) % 8;
      const n = tileFbm(x, y, 16, 16, 2, 2, 4);
      const yel = v < 4;
      const r = yel ? Y : K;
      const k = Math.max(0, Math.min(r.length - 1, Math.round((r.length - 1) * (0.55 + (n - 0.5) * 0.6) + (bayer(x, y) - 0.5) * 0.8)));
      pc.set(x, y, r[k]);
    });
    chips(pc, rng, 5, 0x8a8a86, 0x3a3836);
    pc.grime(0x3a3020, 0.6, 2, 9, 0.6);
  });
  A.add('q_hazard_red', 16, 16, (pc, rng) => {
    const Rr = makeRamp(0xb83228, 4, { spread: 0.3 }), W = makeRamp(0xe6e2d6, 4, { spread: 0.25 });
    pc.each((x, y) => {
      const v = (x + y) % 8;
      const r = v < 4 ? Rr : W;
      const n = tileFbm(x, y, 16, 16, 2, 2, 8);
      pc.set(x, y, r[Math.max(0, Math.min(3, Math.round(1.6 + (n - 0.5) * 2 + (bayer(x, y) - 0.5))))]);
    });
    chips(pc, rng, 3, 0x9a9a96, 0x4a4846);
  });

  // industrial painted steel panels
  const steel = (name: string, base: number, seed: number, rustAmt: number) => A.add(name, 32, 32, (pc, rng) => {
    const r = makeRamp(base, 6, { spread: 0.4 });
    fillNoise(pc, r, 0.52, 0.12, 2, seed, 0.06);
    // vertical streaks
    for (let x = 0; x < 32; x++) if (ph(x, 0, seed) < 0.25) for (let y = 0; y < 32; y++) if (ph(x, y, seed + 2) < 0.6) pc.blend(x, y, r[1], 0.25);
    // panel seams at tile edge + rivets
    seamH(pc, 0, 31, 0, r[0], r[4]); seamV(pc, 0, 0, 31, r[0], r[4]);
    for (let k = 3; k < 32; k += 7) { rivet(pc, k, 3, r[5], r[0], r[3]); rivet(pc, 3, k, r[5], r[0], r[3]); }
    chips(pc, rng, rustAmt > 0 ? 4 : 2, scaleHex(base, 0.75), r[1]);
    if (rustAmt > 0) rust(pc, seed + 5, rustAmt, 3);
  });
  steel('q_steel_grey', 0x7e878c, 21, 0.06);
  steel('q_steel_green', 0x55705a, 22, 0.15);
  steel('q_steel_blue', 0x4d6a86, 23, 0.06);
  steel('q_steel_dark', 0x3c4044, 24, 0);
  steel('q_steel_cream', 0xc9c2a8, 25, 0);

  // rusty pipe (cylinder sides: u around, v along)
  A.add('q_pipe_rust', 16, 32, (pc) => {
    const r = makeRamp(0x6a6660, 5, { spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.5 + (tileFbm(x, y, 16, 32, 2, 3, 31) - 0.5) * 0.4 + Math.sin(x / 16 * Math.PI * 2) * 0.12, 0.8);
    rust(pc, 33, 0.65, 2);
    for (let y = 0; y < 32; y += 16) { pc.hline(0, 15, y, 0x2a2622); pc.hline(0, 15, y + 1, 0x7a7670); }
  });
  A.add('q_pipe_paint', 16, 32, (pc, rng) => {
    const r = makeRamp(0x5d7568, 5, { spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.55 + (tileFbm(x, y, 16, 32, 2, 3, 41) - 0.5) * 0.25 + Math.sin(x / 16 * Math.PI * 2) * 0.14, 0.8);
    rust(pc, 43, 0.35, 2);
    chips(pc, rng, 3, 0x8a8478, 0x34302a);
    pc.drips(rng, 0x4a3a2a, 2, 4, 20, 0.3);
  });
  A.add('q_pipe_copper', 16, 16, (pc) => {
    const r = makeRamp(0xb06a3c, 5, { spread: 0.45 });
    pc.fillRamp(r, (x, y) => 0.5 + Math.sin(x / 16 * Math.PI * 2) * 0.25 + (tileFbm(x, y, 16, 16, 2, 2, 51) - 0.5) * 0.2, 0.8);
    // verdigris
    pc.each((x, y) => { if (tileFbm(x, y, 16, 16, 2, 3, 52) > 0.66) pc.set(x, y, bayer(x, y) < 0.5 ? 0x5f9a82 : 0x467a66); });
  });
  A.add('q_pvc', 16, 16, (pc) => {
    const r = makeRamp(0xd8d6ce, 4, { spread: 0.3 });
    pc.fillRamp(r, (x, y) => 0.55 + Math.sin(x / 16 * Math.PI * 2) * 0.22 + (ph(x, y, 61) - 0.5) * 0.05, 0.8);
    pc.grime(0x8a8470, 0.5, 2, 62, 0.6);
    text(pc, 'PVC', 2, 5, 0x6a6a72);
  });

  // round gauge (fit)
  A.add('q_gauge', 12, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x3a3a3e);
    gauge(pc, 6, 6, 5.4, 0.7);
  });
  A.add('q_gauge_b', 12, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x3a3a3e);
    gauge(pc, 6, 6, 5.4, -1.1, 0xf0ead6, 0x2a2a2e, false);
  });

  // louvred grille (fit)
  A.add('q_grille', 16, 16, (pc) => {
    pc.wrap = false;
    grille(pc, 0, 0, 16, 16, makeRamp(0x8c9092, 5), makeRamp(0x6c7072, 5));
    screw(pc, 1, 1, 0xd0d0d0, 0x2a2a2a); screw(pc, 14, 1, 0xd0d0d0, 0x2a2a2a); screw(pc, 1, 14, 0xd0d0d0, 0x2a2a2a); screw(pc, 14, 14, 0xd0d0d0, 0x2a2a2a);
  });
  A.add('q_grille_dark', 16, 16, (pc) => {
    pc.wrap = false;
    grille(pc, 0, 0, 16, 16, makeRamp(0x3e4246, 5), makeRamp(0x2e3236, 5), 0x050506);
  });

  // rough stone (tiling) with lichen
  A.add('q_rock', 32, 32, (pc, rng) => {
    const r = makeRamp(0x6a6b6c, 7, { spread: 0.62, hueShift: 0.06 });
    pc.fillRamp(r, (x, y) => {
      const n = tileFbm(x, y, 32, 32, 3, 4, 71);
      const facet = Math.floor(tileFbm(x, y, 32, 32, 2, 1, 72) * 5) / 5;
      return 0.3 + n * 0.45 + facet * 0.2;
    }, 0.9);
    // cracks
    for (let k = 0; k < 3; k++) {
      let x = rng.int(0, 31), y = rng.int(0, 31);
      for (let s = 0; s < 10; s++) { pc.set(x, y, r[0]); pc.blend(x + 1, y + 1, r[5], 0.4); x += rng.int(-1, 1); y += 1; }
    }
    // lichen clusters
    pc.each((x, y) => {
      const n = tileFbm(x, y, 32, 32, 4, 3, 73);
      if (n > 0.68 && ph(x, y, 74) < 0.7) pc.set(x, y, ph(x, y, 75) < 0.5 ? 0x7e8c4e : 0x66743e);
      else if (n > 0.64 && bayer(x, y) < 0.3) pc.set(x, y, 0x9a9a6c);
    });
  });
  A.add('q_rock_dark', 32, 32, (pc, rng) => {
    const r = makeRamp(0x55524e, 6, { spread: 0.5 });
    pc.fillRamp(r, (x, y) => 0.3 + tileFbm(x, y, 32, 32, 3, 4, 81) * 0.5 + Math.floor(tileFbm(x, y, 32, 32, 2, 1, 82) * 4) / 4 * 0.2, 0.9);
    pc.speckle(rng, [r[0]], 0.03);
    pc.grime(0x2a2622, 0.6, 3, 83, 0.6);
  });

  // bark (opaque, tiling) and cut log ends
  A.add('q_bark', 32, 32, (pc) => {
    const r = makeRamp(0x5a4232, 7, { spread: 0.55, hueShift: 0.05 });
    pc.fillRamp(r, (x, y) => {
      const wob = tileFbm(x, y, 32, 32, 2, 2, 91) * 5;
      const ridge = Math.abs(Math.sin(((x + wob) / 32) * Math.PI * 6));
      const n = tileFbm(x, y, 32, 32, 4, 3, 92);
      return 0.18 + ridge * 0.5 + (n - 0.5) * 0.3 + (ph(x, y, 93) - 0.5) * 0.1;
    }, 0.6);
    // moss at random patches
    pc.each((x, y) => { if (tileFbm(x, y, 32, 32, 3, 3, 94) > 0.68 && bayer(x, y) < 0.6) pc.set(x, y, ph(x, y, 1) < 0.5 ? 0x56683a : 0x48582e); });
  });
  A.add('q_bark_grey', 32, 32, (pc) => {
    const r = makeRamp(0x6e6a64, 7, { spread: 0.55, hueShift: 0.03 });
    pc.fillRamp(r, (x, y) => {
      const wob = tileFbm(x, y, 32, 32, 2, 2, 95) * 6;
      const ridge = Math.abs(Math.sin(((x + wob) / 32) * Math.PI * 5));
      return 0.2 + ridge * 0.45 + (tileFbm(x, y, 32, 32, 4, 3, 96) - 0.5) * 0.35;
    }, 0.6);
    // pale splits
    pc.each((x, y) => { if (tileFbm(x, y, 32, 32, 2, 2, 97) > 0.7 && ph(x, y, 9) < 0.5) pc.set(x, y, 0xb2aca0); });
  });
  A.add('q_log_end', 16, 16, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0xb08a5a, 6, { spread: 0.5 });
    pc.fill(0x4a3626);
    pc.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d < 7.2) {
        const ring = Math.sin(d * 2.6 + tileFbm(x, y, 16, 16, 2, 2, 98) * 3) * 0.5 + 0.5;
        pc.set(x, y, r[Math.min(5, Math.max(0, Math.round(2 + ring * 2.4 - d * 0.12 + (bayer(x, y) - 0.5))))]);
      }
    });
    // radial crack + pith
    for (let t = 0; t < 6; t++) pc.set(8 + t, 8 - Math.floor(t / 2), 0x3a2a1e);
    pc.set(8, 8, 0x5a4026);
  });

  // dark void (holes, stairs into nothing)
  A.add('q_void', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, bayer(x * 3, y * 5) < 0.15 ? 0x0c0c12 : 0x050508)); });

  // chain links (thin rods)
  A.add('q_chain', 4, 8, (pc) => {
    pc.fill(0x2a2a2c);
    const L = 0xb8b8b4, M = 0x7e7e7a, D = 0x46464a;
    // link facing camera (ring) then side link (bar)
    pc.set(1, 0, L); pc.set(2, 0, M); pc.set(0, 1, L); pc.set(3, 1, D); pc.set(0, 2, M); pc.set(3, 2, D); pc.set(1, 3, M); pc.set(2, 3, D);
    for (let y = 4; y < 8; y++) { pc.set(1, y, y < 6 ? L : M); pc.set(2, y, D); }
  });

  // chipped playground paint (one per colour)
  const paint = (name: string, base: number, seed: number, rustAmt = 0.12, nChips = 9) => A.add(name, 32, 32, (pc, rng) => {
    const r = makeRamp(base, 6, { spread: 0.42 });
    fillNoise(pc, r, 0.6, 0.12, 2, seed, 0.05);
    // faded sun-bleach on the upper half of each tile
    pc.each((x, y) => { if (tileFbm(x, y, 32, 32, 2, 2, seed + 1) > 0.6 && bayer(x, y) < 0.35) pc.set(x, y, r[5]); });
    chips(pc, rng, nChips, 0x8c8a84, r[0]);
    if (rustAmt > 0) rust(pc, seed + 3, rustAmt, 3);
    // brush marks
    for (let y = 2; y < 32; y += 5) for (let x = 0; x < 32; x++) if (ph(x, y, seed) < 0.3) pc.blend(x, y, r[4], 0.35);
  });
  paint('q_paint_red', 0xc0392f, 101);
  paint('q_paint_blue', 0x3f6fb8, 102);
  paint('q_paint_yellow', 0xe2b437, 103);
  paint('q_paint_green', 0x4c9a52, 104);
  paint('q_paint_pink', 0xe59ab4, 105, 0.04, 4);
  paint('q_paint_teal', 0x4fb3ac, 106, 0.06, 5);
  paint('q_paint_lilac', 0xa996d6, 107, 0.04, 4);
  paint('q_paint_white', 0xe4e2da, 108, 0);
  paint('q_paint_orange', 0xe0782e, 109);

  // cardboard box face (fit) with tape and marker scrawl
  const box = (name: string, seed: number, mark: string) => A.add(name, 16, 12, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xb08a58, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.55 + (ph(x, y, seed) - 0.5) * 0.12 + ((x + seed) % 3 === 0 ? -0.06 : 0) + (tileFbm(x, y, 16, 12, 2, 2, seed) - 0.5) * 0.2, 0.7);
    pc.bevel(0, 0, 16, 12, r[4], r[1]);
    // tape strip down the middle (top flaps seam) and along the top edge
    for (let y = 0; y < 12; y++) { pc.set(7, y, 0xc8b88a); pc.set(8, y, 0xd6c89c); }
    pc.hline(0, 15, 0, 0xc8b88a);
    // marker text / arrows
    if (mark) text(pc, mark, 2, 5, 0x2a2420);
    else { pc.set(3, 4, 0x2a2420); pc.set(2, 5, 0x2a2420); pc.set(4, 5, 0x2a2420); pc.vline(3, 5, 8, 0x2a2420); pc.set(12, 4, 0x2a2420); pc.set(11, 5, 0x2a2420); pc.set(13, 5, 0x2a2420); pc.vline(12, 5, 8, 0x2a2420); }
    // label
    if (seed % 2 === 0) { pc.rect(10, 7, 5, 3, 0xe8e4d8); scribble(pc, 11, 8, 3, 0x6a6660, seed); }
    pc.stain(rng.int(2, 13), rng.int(6, 10), 2, 0x8a6a40, 0x6a5030, seed);
  });
  box('q_cardboard_a', 2, '');
  box('q_cardboard_b', 3, 'XMAS');
  box('q_cardboard_c', 4, '');
  A.add('q_cardboard_top', 16, 16, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0xa88252, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.55 + (ph(x, y, 9) - 0.5) * 0.12 + (tileFbm(x, y, 16, 16, 2, 2, 9) - 0.5) * 0.2, 0.7);
    pc.bevel(0, 0, 16, 16, r[4], r[1]);
    pc.hline(0, 15, 7, r[0]);
    for (let x = 0; x < 16; x++) { pc.set(x, 6, 0xc8b88a); pc.set(x, 8, 0xd6c89c); pc.blend(x, 7, 0xd0c090, 0.7); }
  });
});
