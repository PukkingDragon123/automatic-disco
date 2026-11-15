// Surfaces of the containers, painted by hand in code from the master ramps at a consistent texel density (64 px a
// metre, the machines' own): sawn timber boards with grain and knots, enamelled plate fastened at its seams with
// chipped edges and grime under the rivets, poured concrete with formwork lines and tie holes, corrugated sheet,
// hazard paint, a frosted lid, wet pit lining, a granular fill for every bulk material, and the stencilled logo plate
// each container carries (its logo, its label, its paint). Nearest-filtered so the pixels stay crisp.
import * as THREE from 'three';
import { RAMPS, nearestRamp, type RampName } from '../art/palette';
import { PAINTS, type PaintId, type LogoId } from './kinds';
import { LOGOS } from './logos';

type Ramp = readonly number[];
const H = (x: number, y: number, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class TPix {
  readonly d: Uint8Array;
  constructor(readonly w: number, readonly h: number) { this.d = new Uint8Array(w * h * 4); }
  set(x: number, y: number, c: number, a = 255) {
    x = ((Math.floor(x) % this.w) + this.w) % this.w; y = ((Math.floor(y) % this.h) + this.h) % this.h;
    const i = (y * this.w + x) * 4;
    if (a >= 255) { this.d[i] = (c >> 16) & 255; this.d[i + 1] = (c >> 8) & 255; this.d[i + 2] = c & 255; this.d[i + 3] = 255; return; }
    const k = a / 255;
    this.d[i] = this.d[i] * (1 - k) + ((c >> 16) & 255) * k; this.d[i + 1] = this.d[i + 1] * (1 - k) + ((c >> 8) & 255) * k; this.d[i + 2] = this.d[i + 2] * (1 - k) + (c & 255) * k; this.d[i + 3] = Math.max(this.d[i + 3], a);
  }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  hl(x0: number, x1: number, y: number, c: number) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  vl(x: number, y0: number, y1: number, c: number) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  tex(repeat = true): THREE.DataTexture {
    const t = new THREE.DataTexture(this.d, this.w, this.h, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.generateMipmaps = true;
    t.flipY = false;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    t.needsUpdate = true;
    return t;
  }
}
const cache = new Map<string, THREE.DataTexture>();
const memo = (k: string, f: () => TPix, repeat = true) => { let t = cache.get(k); if (!t) { t = f().tex(repeat); cache.set(k, t); } return t; };
const pr = (id: PaintId): Ramp => { const r = RAMPS[PAINTS[id].ramp]; return r.length >= 6 ? r : [r[0], r[0], r[1], r[2], r[3], r[r.length - 1]]; };

/** sawn boards across the texture: 4 boards a tile, grain strokes, a knot, nail heads at the ends, lit top edges */
export function planks(tone: 'fresh' | 'weathered' | 'wet' = 'fresh') {
  return memo('planks:' + tone, () => {
    const p = new TPix(64, 64), R = tone === 'wet' ? RAMPS.soil : tone === 'weathered' ? RAMPS.fur : RAMPS.ochre;
    for (let b = 0; b < 4; b++) {
      const y0 = b * 16, base = tone === 'wet' ? 3 : [3, 4, 3, 2][b];
      p.rect(0, y0, 64, 16, R[base]);
      // grain: long strokes that wander a pixel, two shades
      for (let k = 0; k < 6; k++) {
        const yy = y0 + 2 + Math.floor(H(b, k, 1) * 12), x0 = Math.floor(H(b, k, 2) * 64), len = 14 + Math.floor(H(b, k, 3) * 30);
        for (let i = 0; i < len; i++) p.set(x0 + i, yy + (H(b, k * 10 + (i >> 3), 4) < 0.25 ? 1 : 0), R[k % 2 ? base - 1 : base + 1]);
      }
      // a knot with its grain swirling round it
      const kx = 12 + Math.floor(H(b, 7, 5) * 40), ky = y0 + 6 + Math.floor(H(b, 7, 6) * 5);
      p.rect(kx, ky, 3, 2, R[base - 2]); p.set(kx + 1, ky, R[1]); p.hl(kx - 3, kx - 1, ky - 1, R[base - 1]); p.hl(kx + 3, kx + 6, ky + 2, R[base - 1]);
      // lit top edge, dark seam below, nail heads near the ends
      p.hl(0, 63, y0, R[Math.min(R.length - 1, base + 2)]); p.hl(0, 63, y0 + 15, R[0]); p.hl(0, 63, y0 + 14, R[base - 1]);
      for (const nx of [3, 59]) { p.rect(nx, y0 + 6, 2, 2, RAMPS.steel[3]); p.set(nx, y0 + 6, RAMPS.steel[5]); p.set(nx + 1, y0 + 8, R[base - 2], 160); p.set(nx + 1, y0 + 9, R[base - 2], 110); }
      // an end check (a split) on one board
      if (b === 2) { p.hl(56, 63, y0 + 9, R[1]); p.hl(52, 57, y0 + 10, R[1]); }
    }
    return p;
  });
}
/** enamelled steel plate in a paint: a seam a third across, rivets on the seams, chips worn to bare steel where
 *  things knock it, grime trailing down from the rivets, a scuffed lower band */
export function plate(paint: PaintId, o: { rivets?: boolean; seam?: boolean } = {}) {
  return memo(`plate:${paint}:${o.rivets !== false}:${o.seam !== false}`, () => {
    const p = new TPix(64, 64), R = pr(paint), S = RAMPS.steel, b = 3;
    p.rect(0, 0, 64, 64, R[b]);
    // the plate bows a little: a broad lighter plane on the upper part of the big panel
    for (let y = 3; y < 22; y++) for (let x = 24 + Math.floor((y - 3) * 0.2); x < 62; x++) p.set(x, y, R[b + 1], y < 6 ? 255 : 120);
    if (o.seam !== false) { for (let y = 0; y < 64; y++) { p.set(21, y, R[b - 2]); p.set(22, y, R[b + 1]); } }
    for (let x = 0; x < 64; x++) { p.set(x, 0, R[b - 2]); p.set(x, 1, R[b + 1]); }
    if (o.rivets !== false) for (const [x, y] of [[4, 5], [4, 35], [25, 5], [25, 35], [45, 5], [60, 35]]) {
      p.set(x, y, R[Math.min(R.length - 1, b + 2)]); p.set(x + 1, y, R[b + 1]); p.set(x, y + 1, R[b + 1]); p.set(x + 1, y + 1, R[b - 2]);
      const len = 3 + Math.floor(H(x, y, 3) * 8);
      for (let k = 2; k < 2 + len; k++) p.set(x + 1, y + k, R[b - 1], 150 - k * 8);
    }
    // chips: bare steel islands with a dark lower lip, placed by hand
    for (const [cx, cy, w] of [[50, 47, 4], [12, 54, 3], [33, 23, 2], [58, 12, 2], [6, 20, 2]]) {
      for (let j = 0; j < 2; j++) for (let i = 0; i < w - j; i++) p.set(cx + i, cy + j, S[5 - j]);
      p.hl(cx, cx + w - 1, cy + 2, R[b - 2]);
    }
    // scuffs low on the panel, a drip line
    for (let x = 0; x < 64; x++) if (H(x >> 2, 9, 7) < 0.45) p.set(x, 58 + (x % 3 === 0 ? 1 : 0), R[b - 1]);
    for (let y = 40; y < 56; y++) p.set(38, y, R[b - 1], 140);
    return p;
  });
}
/** poured concrete: formwork board lines, tie holes in a grid, rain stains running down, a couple of hairline cracks */
export function concrete(tone = 0) {
  return memo('concrete:' + tone, () => {
    const p = new TPix(64, 64), R = RAMPS.stone, b = 4 + tone;
    p.rect(0, 0, 64, 64, R[b]);
    for (let y = 0; y < 64; y += 16) { p.hl(0, 63, y, R[b - 1]); for (let x = 0; x < 64; x++) if (H(x, y, 1) < 0.3) p.set(x, y + 1, R[b + 1]); }
    for (const [x, y] of [[10, 8], [42, 8], [10, 40], [42, 40]]) { p.rect(x, y, 2, 2, R[1]); p.set(x, y, R[2]); }
    for (let k = 0; k < 5; k++) { const x = Math.floor(H(k, 3, 2) * 64), len = 10 + Math.floor(H(k, 4, 2) * 20); for (let y = 0; y < len; y++) p.set(x + (y > len / 2 ? 1 : 0), 2 + y, R[b - 1], 170 - y * 4); }
    for (const [x0, y0, pts] of [[20, 26, [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 5], [6, 6]]], [50, 50, [[1, 0], [2, 1], [2, 2], [3, 3], [5, 3]]]] as [number, number, number[][]][]) for (const [dx, dy] of pts) p.set(x0 + dx, y0 + dy, R[1]);
    for (let i = 0; i < 40; i++) p.set(Math.floor(H(i, 8, 3) * 64), Math.floor(H(i, 9, 3) * 64), R[H(i, 10, 3) < 0.5 ? b + 1 : b - 1]);
    return p;
  });
}
/** corrugated sheet: vertical ridges in three tones, a lapped seam with rivets, rust weeping from the rivets */
export function corrugated(paint: PaintId) {
  return memo('corr:' + paint, () => {
    const p = new TPix(64, 64), R = pr(paint);
    for (let x = 0; x < 64; x++) { const ph = x % 8, k = ph < 2 ? 4 : ph < 4 ? 3 : ph < 6 ? 2 : 3; for (let y = 0; y < 64; y++) p.set(x, y, R[k]); }
    p.hl(0, 63, 0, R[1]); p.hl(0, 63, 1, R[5]);
    for (let x = 3; x < 64; x += 8) { p.set(x, 4, RAMPS.steel[5]); p.set(x, 5, RAMPS.steel[2]); for (let y = 6; y < 6 + 4 + (x % 3) * 3; y++) p.set(x, y, RAMPS.rust[3], 150); }
    for (let i = 0; i < 6; i++) { const x = Math.floor(H(i, 1, 9) * 60), y = 20 + Math.floor(H(i, 2, 9) * 40); p.rect(x, y, 2, 1, RAMPS.steel[4]); }
    return p;
  });
}
/** hazard paint: amber and black diagonals, worn through at the edge */
export function hazard() {
  return memo('hazard', () => {
    const p = new TPix(64, 16), A = RAMPS.glowAmber, K = RAMPS.basalt;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) p.set(x, y, ((x + y) >> 3) % 2 ? K[1] : A[2]);
    for (let x = 0; x < 64; x++) { p.set(x, 0, A[3]); p.set(x, 15, K[0]); if (H(x, 2, 4) < 0.2) p.set(x, 14, RAMPS.steel[4]); }
    return p;
  });
}
/** frost on a freezer lid: crusted white with ice-crystal fans and a lit edge */
export function frost() {
  return memo('frost', () => {
    const p = new TPix(64, 64), R = RAMPS.snow;
    p.rect(0, 0, 64, 64, R[3]);
    for (let k = 0; k < 9; k++) { const cx = Math.floor(H(k, 1, 5) * 64), cy = Math.floor(H(k, 2, 5) * 64); for (let i = 0; i < 6; i++) { p.set(cx + i, cy - i, R[5]); p.set(cx + i, cy + i, R[4]); p.set(cx - i, cy, R[2]); } }
    for (let i = 0; i < 60; i++) p.set(Math.floor(H(i, 3, 5) * 64), Math.floor(H(i, 4, 5) * 64), R[H(i, 5, 5) < 0.5 ? 5 : 2]);
    return p;
  });
}
/** sight glass: dark glass with two vertical highlight streaks */
export function glass() {
  return memo('glass', () => {
    const p = new TPix(16, 64), R = RAMPS.water;
    p.rect(0, 0, 16, 64, R[1]);
    for (let y = 0; y < 64; y++) { p.set(3, y, R[4]); p.set(4, y, R[3]); p.set(11, y, R[2]); }
    return p;
  });
}
/** packed earth (the pit's floor and spoil): soil clusters, a stone or two, root threads */
export function earth() {
  return memo('earth', () => {
    const p = new TPix(64, 64), R = RAMPS.soil;
    p.rect(0, 0, 64, 64, R[3]);
    for (let i = 0; i < 90; i++) { const x = Math.floor(H(i, 1, 6) * 64), y = Math.floor(H(i, 2, 6) * 64), k = H(i, 3, 6) < 0.5 ? 2 : 4; p.rect(x, y, 2, 1 + (i % 2), R[k]); }
    for (const [x, y] of [[12, 40], [44, 18], [52, 50]]) { p.rect(x, y, 3, 2, RAMPS.stone[4]); p.hl(x, x + 2, y, RAMPS.stone[5]); p.hl(x, x + 2, y + 2, R[1]); }
    for (let i = 0; i < 12; i++) p.set(20 + i, 10 + (i >> 2), RAMPS.straw[2]);
    return p;
  });
}
/** a loose fill of a bulk material, in the ramp nearest its colour: grain clusters lit from the upper left */
export function fill(color: number) {
  const name: RampName = nearestRamp(color);
  return memo('fill:' + name, () => {
    const p = new TPix(32, 32), R = RAMPS[name], n = R.length, mid = Math.floor(n / 2);
    p.rect(0, 0, 32, 32, R[mid]);
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(H(i, 1, 8) * 32), y = Math.floor(H(i, 2, 8) * 32);
      p.set(x, y, R[Math.min(n - 1, mid + 1)]); p.set(x + 1, y + 1, R[Math.max(0, mid - 1)]);
      if (i % 5 === 0) { p.set(x, y + 1, R[Math.max(0, mid - 2)]); p.set(x - 1, y, R[Math.min(n - 1, mid + 2)]); }
    }
    return p;
  });
}
/** loose grain for a pile, near white (the pile's own colour comes from its vertices): clusters of grains lit from
 *  the upper left, a darker crevice under each */
export function grain() {
  return memo('grain', () => {
    const p = new TPix(32, 32), R = RAMPS.snow;
    p.rect(0, 0, 32, 32, R[4]);
    for (let i = 0; i < 80; i++) {
      const x = Math.floor(H(i, 1, 11) * 32), y = Math.floor(H(i, 2, 11) * 32);
      p.set(x, y, R[5]); p.set(x + 1, y, R[5]); p.set(x, y + 1, R[2]); p.set(x + 1, y + 1, R[1]);
      if (i % 4 === 0) { p.set(x - 1, y, R[3]); p.set(x + 2, y + 1, R[0]); }
    }
    return p;
  });
}
/** a steel tread / grille for walkways and freezer kick plates */
export function grille() {
  return memo('grille', () => {
    const p = new TPix(32, 32), S = RAMPS.steel;
    p.rect(0, 0, 32, 32, S[2]);
    for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x += 4) { p.rect(x + 1, y + 1, 2, 2, S[0]); p.set(x, y, S[4]); }
    return p;
  });
}

// ------------------------------------------------------------------ the logo plate (per container, redrawn on change)
const PLATE_W = 96, PLATE_H = 48;
/** a stencilled plate: the paint band, the logo in a sprayed stencil (bridges left in), the label under it, worn
 *  corners and screw heads */
export function logoPlate(logo: LogoId, paint: PaintId, label: string): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = PLATE_W; c.height = PLATE_H;
  const x = c.getContext('2d')!;
  drawLogoPlate(x, logo, paint, label, PLATE_W, PLATE_H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}
const hexs = (c: number) => '#' + c.toString(16).padStart(6, '0');
export function drawLogoPlate(x: CanvasRenderingContext2D, logo: LogoId, paint: PaintId, label: string, W: number, Hh: number) {
  const R = pr(paint), S = RAMPS.steel, P = RAMPS.paper;
  x.imageSmoothingEnabled = false;
  x.fillStyle = hexs(S[2]); x.fillRect(0, 0, W, Hh);
  x.fillStyle = hexs(R[3]); x.fillRect(2, 2, W - 4, Hh - 4);
  x.fillStyle = hexs(R[4]); x.fillRect(2, 2, W - 4, 2);
  x.fillStyle = hexs(R[1]); x.fillRect(2, Hh - 4, W - 4, 2);
  // the logo, stencilled in cream (ink on pale paints)
  const ink = luma(R[3]) > 130 ? RAMPS.ink[1] : P[4];
  drawLogo(x, logo, 6, 6, 3, ink, R[2]);
  // the label in a stencil hand
  x.fillStyle = hexs(ink);
  x.font = '12px Superwide, Jersey, monospace'; x.textBaseline = 'middle';
  const lines = label.toUpperCase().slice(0, 14);
  x.fillText(lines, 46, 18, W - 50);
  x.font = '9px VT, monospace'; x.fillStyle = hexs(luma(R[3]) > 130 ? RAMPS.ink[2] : R[5] ?? P[3]);
  x.fillText('UNAA / U-07', 46, 33, W - 50);
  // worn corners, screws
  x.fillStyle = hexs(S[4]);
  for (const [sx, sy] of [[4, 4], [W - 6, 4], [4, Hh - 6], [W - 6, Hh - 6]]) x.fillRect(sx, sy, 2, 2);
  x.fillStyle = hexs(S[5]); x.fillRect(W - 12, 3, 3, 1); x.fillRect(3, Hh - 9, 1, 3);
}
const luma = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
/** a 12 x 12 stencil logo at scale k, with a 1 px shadow in `shade` (sprayed paint) */
export function drawLogo(x: CanvasRenderingContext2D, logo: LogoId, ox: number, oy: number, k: number, col: number, shade: number) {
  const g = LOGOS[logo] ?? LOGOS.unaa;
  for (const [c, dx, dy] of [[shade, 1, 1], [col, 0, 0]] as [number, number, number][]) {
    x.fillStyle = hexs(c);
    for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') x.fillRect(ox + (i + dx * 0.34) * k, oy + (j + dy * 0.34) * k, k, k);
  }
}
