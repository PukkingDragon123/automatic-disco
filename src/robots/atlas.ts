// The machine atlas: every robot, the golem and the soldiers' armour are painted into one 512 px page per livery,
// hand-drawn the way ART.md asks (master-palette ramps only, planar shading lit from the upper left, sel-out
// outlines, drawn marks instead of noise). Plate steel in three hand-variants per paint, bare and machined steel,
// brass, rubber, cloth-wrapped cable, hazard paint, louvres, track pads, canvas, panel meters, lens glass and lamps
// (emissive texels carry alpha < 1), faction markings and stencilled serials in Latin, Cyrillic or Chinese.
// kitMaterial() draws it: a flat-shaded Lambert that tiles inside atlas regions (textureGrad keeps the mips clean),
// lights the emissive texels, darkens when wet, flashes when hit, and writes the G-buffer.
import * as THREE from 'three';
import { RAMPS, nearestRamp, type RampName } from '../art/palette';
import { gbuf } from '../gfx/gbuf';
import { hash01 } from '../core/rand';

export const AT = 512;
export type LiveryId = 'uspc' | 'sov' | 'prc' | 'exp';
export interface Livery {
  id: LiveryId;
  /** main paint, second paint, lamps, cloth on the cables, the bare-metal ramp */
  a: RampName; b: RampName; glow: RampName; cable: RampName; rock: RampName;
  /** weathering 0 clean .. 2 hard-used */
  wear: number;
  serials: string[];
}
const L0: Record<LiveryId, Livery> = {
  uspc: { id: 'uspc', a: 'olive', b: 'steel', glow: 'glowTeal', cable: 'stampRed', rock: 'basalt', wear: 1, serials: ['U.S.P.C. UNIT 07', 'USPC 1957', 'UNIT 07', 'A-07 CORPS'] },
  sov: { id: 'sov', a: 'sage', b: 'rust', glow: 'stampRed', cable: 'basalt', rock: 'basalt', wear: 2, serials: ['СССР К-114', 'ТБ-57', 'СССР Л-21', 'ПД-09'] },
  prc: { id: 'prc', a: 'moss', b: 'sand', glow: 'glowAmber', cable: 'ochre', rock: 'basalt', wear: 1, serials: ['中国 工-52', '五一-07', '中国 三-18', '人工-25'] },
  exp: { id: 'exp', a: 'paper', b: 'slate', glow: 'glowTeal', cable: 'rust', rock: 'stone', wear: 0, serials: ['EXPED. 58', 'I.G.Y. 1958', 'EXP-3 SURVEY', 'FIELD 12'] },
};
export function livery(id: LiveryId, o: Partial<Livery> = {}): Livery { return { ...L0[id], ...o }; }
export function liveryFor(faction: string): LiveryId { return faction === 'soviet' ? 'sov' : faction === 'prc' ? 'prc' : faction === 'expedition' ? 'exp' : 'uspc'; }
/** the golem's dressing (babyLook colours) as a livery: paint by nearest ramp, lamps by hue */
export function lookLivery(metal: number, glow: number, rock: number, moss: string, veins: string): Livery {
  let a = nearestRamp(metal);
  if (a === 'stone' || a === 'basalt') a = 'steel';
  const r = (glow >> 16) & 255, g = (glow >> 8) & 255, b = glow & 255;
  const warm = r > g * 1.05 && r > b;
  const gl: RampName = warm ? (g < r * 0.55 ? 'stampRed' : 'glowAmber') : 'glowTeal';
  const cable: RampName = veins === 'veins' ? 'brass' : veins === 'runes' ? 'olive' : 'stampRed';
  return { ...L0.uspc, a, b: a === 'steel' ? 'olive' : 'steel', glow: gl, cable, rock: nearestRamp(rock), wear: moss === 'none' ? 0 : moss === 'moss' ? 2 : 1 };
}

// ------------------------------------------------------------------------------------------------ regions
/** [x, y, w, h] in atlas pixels; tiled regions are 64 px and 64-aligned so mips never bleed */
export const REG: Record<string, [number, number, number, number]> = {};
const T = (k: string, c: number, r: number, w = 1, h = 1) => { REG[k] = [c * 64, r * 64, w * 64, h * 64]; };
// row 0: paint
T('pa0', 0, 0); T('pa1', 1, 0); T('pa2', 2, 0); T('pb0', 3, 0); T('pb1', 4, 0); T('pas', 5, 0); T('pbs', 6, 0); T('pb2', 7, 0);
// row 1: metal and rubber
T('st0', 0, 1); T('st1', 1, 1); T('dk', 2, 1); T('br', 3, 1); T('rb', 4, 1); T('cab', 5, 1); T('hz', 6, 1); T('gr', 7, 1);
// row 2: wear, glass and light
T('tr', 0, 2); T('cv', 1, 2); T('gauge', 2, 2); T('lens', 3, 2); T('lamp', 4, 2); T('off', 5, 2); T('red', 6, 2); T('glass', 7, 2);
// row 3: decals and odd materials
T('mark', 0, 3); T('markB', 1, 3); T('num', 2, 3, 2, 1); T('rock', 4, 3); T('soot', 5, 3); T('knurl', 6, 3); T('hose', 7, 3);
// row 4: serial strips (128 x 16)
for (let i = 0; i < 4; i++) REG['ser' + i] = [i * 128, 256, 128, 16];
for (let i = 0; i < 4; i++) REG['serB' + i] = [i * 128, 272, 128, 16];
// row 5 (64-aligned, below the serial strips)
REG.hzB = [0, 320, 64, 64]; REG.pc0 = [64, 320, 64, 64]; REG.plainA = [128, 320, 64, 64]; REG.plainB = [192, 320, 64, 64];
REG.vent = [256, 320, 64, 64]; REG.lensB = [320, 320, 64, 64]; REG.felt = [384, 320, 64, 64]; REG.ammo = [448, 320, 64, 64];
export type RegKey = string;

// ------------------------------------------------------------------------------------------------ painting
type Pt = [number, number];
class Page {
  readonly d = new Uint8Array(AT * AT * 4);
  ox = 0; oy = 0; w = 64; h = 64;
  set(x: number, y: number, c: number, a = 255) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = ((this.oy + y) * AT + this.ox + x) * 4;
    this.d[i] = (c >> 16) & 255; this.d[i + 1] = (c >> 8) & 255; this.d[i + 2] = c & 255; this.d[i + 3] = a;
  }
  get(x: number, y: number) { const i = ((this.oy + y) * AT + this.ox + x) * 4; return (this.d[i] << 16) | (this.d[i + 1] << 8) | this.d[i + 2]; }
  region(k: string) { const r = REG[k]; this.ox = r[0]; this.oy = r[1]; this.w = r[2]; this.h = r[3]; return this; }
  fill(c: number, a = 255) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c, a); }
  rect(x0: number, y0: number, w: number, h: number, c: number, a = 255) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a); }
  hline(x0: number, x1: number, y: number, c: number, a = 255) { for (let x = x0; x <= x1; x++) this.set(x, y, c, a); }
  vline(x: number, y0: number, y1: number, c: number, a = 255) { for (let y = y0; y <= y1; y++) this.set(x, y, c, a); }
  /** a filled polygon (pixel centres inside, even-odd) */
  poly(P: Pt[], c: number | ((x: number, y: number) => number), a = 255) {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.h - 1, Math.ceil(y1)); y++) {
      const py = y + 0.5;
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(this.w - 1, Math.ceil(x1)); x++) {
        const px = x + 0.5;
        let inside = false;
        for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
          const [xi, yi] = P[i], [xj, yj] = P[j];
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.set(x, y, typeof c === 'number' ? c : c(x, y), a);
      }
    }
  }
  /** a pixel line (Bresenham) */
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (let k = 0; k < 400; k++) { this.set(x0, y0, c, a); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
}
const H = (a: number, b: number, s: number) => hash01(a, b, s);

/** three hand-drawn chip shapes (bare steel showing through the paint), relative to an anchor on a panel edge */
const CHIPS: Pt[][] = [
  [[0, 0], [4, 0], [5, 1], [3, 3], [1, 2]],
  [[0, 0], [2, 0], [6, 1], [7, 2], [3, 2], [1, 4], [0, 2]],
  [[0, 1], [2, 0], [3, 1], [3, 4], [1, 5], [0, 3]],
];
/** a rivet: a lit cap, a shadowed skirt */
function rivet(P: Page, x: number, y: number, R: readonly number[]) {
  const n = R.length;
  P.set(x, y, R[n - 1]); P.set(x + 1, y, R[n - 2]); P.set(x, y + 1, R[n - 2]); P.set(x + 1, y + 1, R[2]);
  P.set(x + 2, y + 1, R[1]); P.set(x + 1, y + 2, R[1]); P.set(x + 2, y + 2, R[0]);
}
/** a slotted screw head */
function screw(P: Page, x: number, y: number, S: readonly number[]) {
  P.rect(x, y, 3, 3, S[4]); P.set(x + 2, y + 2, S[2]); P.set(x + 2, y, S[3]); P.set(x, y + 2, S[3]);
  P.line(x, y + 2, x + 2, y, S[1]); P.set(x + 3, y + 1, S[1]); P.set(x + 3, y + 2, S[1]); P.set(x + 1, y + 3, S[1]); P.set(x + 2, y + 3, S[1]);
}

/** painted plate: a panel grid, bevelled seams, rivet rows, an inspection hatch, chips, scuffs, rust runs, grime */
function paintPlate(P: Page, R: readonly number[], L: Livery, v: number, seed: number, smooth = false) {
  const S = RAMPS.steel, Ru = RAMPS.rust, n = R.length, mid = Math.min(3, n - 3);
  P.fill(R[mid]);
  // planar light: a lit band under each top seam, a darker band over each bottom seam
  const rows = smooth ? [0] : v === 1 ? [0, 32] : [0];
  const cols = smooth ? [0] : v === 2 ? [0, 40] : [0];
  if (!smooth) {
    for (const y0 of rows) { P.hline(0, 63, y0, R[0]); P.hline(0, 63, y0 + 1, R[mid + 1]); P.hline(0, 63, y0 + 2, R[mid + 1]); }
    for (const y0 of rows) { const yb = (y0 + (rows.length > 1 ? 31 : 63)) % 64; P.hline(0, 63, yb, R[mid - 1]); }
    for (const x0 of cols) { P.vline(x0, 0, 63, R[0]); P.vline(x0 + 1, 0, 63, R[mid + 1]); const xr = (x0 + 63) % 64; P.vline(xr, 0, 63, R[mid - 1]); }
    for (const y0 of rows) P.hline(0, 0, y0, R[0]);
    // rivet rows along the seams, every 8 px; not every seam gets them
    for (const y0 of rows) for (let x = 4; x < 64; x += 8) rivet(P, x, y0 + 3, R);
    if (v !== 1) for (const x0 of cols) for (let y = 7; y < 60; y += 8) rivet(P, x0 + 3, y, R);
  } else {
    // smooth enamel: two broad planes split by a soft fold line
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (x + y * 0.4 > 44 + (seed & 7)) P.set(x, y, R[mid - 1]);
    for (let x = 0; x < 64; x += 1) if (((x * 7 + seed) & 15) < 9) P.set(x, Math.floor(44 - x * 0.4 + (seed & 7) * 0.4) & 63, R[mid]);
  }
  if (v === 2 && !smooth) {
    // inspection hatch with four screws
    const hx = 14, hy = 20, hw = 20, hh = 16;
    P.rect(hx, hy, hw, hh, R[mid]);
    P.hline(hx, hx + hw - 1, hy, R[0]); P.vline(hx, hy, hy + hh - 1, R[0]);
    P.hline(hx + 1, hx + hw - 1, hy + 1, R[mid + 1]); P.vline(hx + 1, hy + 1, hy + hh - 1, R[mid + 1]);
    P.hline(hx, hx + hw, hy + hh, R[mid + 1]); P.vline(hx + hw, hy, hy + hh, R[mid + 1]);
    P.hline(hx + 2, hx + hw - 1, hy + hh - 1, R[mid - 1]); P.vline(hx + hw - 1, hy + 2, hy + hh - 1, R[mid - 1]);
    for (const [sx, sy] of [[hx + 3, hy + 3], [hx + hw - 6, hy + 3], [hx + 3, hy + hh - 6], [hx + hw - 6, hy + hh - 6]]) screw(P, sx, sy, S);
    // a stencilled arrow on the hatch
    P.poly([[hx + 7, hy + 9], [hx + 12, hy + 9], [hx + 12, hy + 7], [hx + 15, hy + 10], [hx + 12, hy + 13], [hx + 12, hy + 11], [hx + 7, hy + 11]], R[mid + 2] ?? R[n - 1]);
  }
  // wear: chips at panel edges and corners, scuffs, rust runs from a rivet or two, grime along the bottom
  const k = L.wear;
  const nChip = smooth ? k : 2 + k * 2;
  for (let i = 0; i < nChip; i++) {
    const sh = CHIPS[(i + v + seed) % 3], onEdge = H(i, seed, 11) < 0.6;
    const ax = onEdge ? (H(i, seed, 1) < 0.5 ? 2 : 56) : 6 + Math.floor(H(i, seed, 2) * 50);
    const ay = 5 + Math.floor(H(i, seed, 3) * 52);
    const flip = H(i, seed, 4) < 0.5 ? 1 : -1;
    const pts = sh.map(([x, y]) => [ax + x * flip, ay + y] as Pt);
    P.poly(pts, S[4]);
    // sel-out: the chip's lower-right rim is the shadowed paint edge, upper-left the lit edge
    for (const [x, y] of pts) { P.set(x + 1, y + 1, R[0]); }
    P.set(pts[0][0], pts[0][1], S[5]);
  }
  for (let i = 0; i < 2 + k; i++) {
    const x = 8 + Math.floor(H(i, seed, 21) * 46), y = 8 + Math.floor(H(i, seed, 22) * 46), l = 3 + Math.floor(H(i, seed, 23) * 4);
    P.line(x, y, x + l, y - Math.floor(l / 2), R[Math.min(n - 1, mid + 1)]);
  }
  if (k > 0 && !smooth) for (let i = 0; i < k; i++) {
    const x = 5 + 8 * Math.floor(H(i, seed, 31) * 7), y0 = rows[0] + 6, l = 5 + Math.floor(H(i, seed, 32) * 8);
    P.vline(x, y0, y0 + l, Ru[3]); P.vline(x + 1, y0 + 1, y0 + Math.floor(l * 0.6), Ru[2]);
  }
  if (!smooth) for (let x = 0; x < 64; x++) { const j = (x * 5 + seed) % 7 < 3 ? 1 : 0; P.vline(x, 60 - j - k, 61, R[Math.max(0, mid - 1)]); }
}
/** bare / machined steel: brushed strokes, a lathe line, a little oil */
function paintSteel(P: Page, S: readonly number[], v: number, seed: number) {
  P.fill(S[v ? 4 : 3]);
  for (let y = 0; y < 64; y++) {
    const x0 = Math.floor(H(y, seed, 1) * 64), l = 6 + Math.floor(H(y, seed, 2) * 18);
    if (H(y, seed, 3) < 0.55) P.hline(x0, Math.min(63, x0 + l), y, S[v ? 5 : 4]);
    else if (H(y, seed, 4) < 0.3) P.hline(x0, Math.min(63, x0 + l), y, S[v ? 3 : 2]);
  }
  P.hline(0, 63, 31, S[v ? 2 : 1]); P.hline(0, 63, 32, S[v ? 6 : 5]);
}
/** brass: lathe rings with lit lips */
function paintBrass(P: Page) {
  const B = RAMPS.brass;
  for (let y = 0; y < 64; y++) { const m = y % 8; P.hline(0, 63, y, m === 0 ? B[5] : m === 1 ? B[4] : m < 5 ? B[3] : m === 7 ? B[1] : B[2]); }
  for (let i = 0; i < 6; i++) { const x = (i * 23) % 61, y = (i * 17) % 60; P.hline(x, x + 3, y + 2, B[5]); }
}
/** rubber and hoses: ribs */
function paintRubber(P: Page, ribbed: boolean) {
  const K = RAMPS.basalt;
  P.fill(K[2]);
  if (ribbed) for (let y = 0; y < 64; y += 4) { P.hline(0, 63, y, K[4]); P.hline(0, 63, y + 1, K[3]); P.hline(0, 63, y + 3, K[1]); }
  else for (let i = 0; i < 9; i++) { const x = (i * 29) % 60, y = (i * 13) % 62; P.hline(x, x + 4, y, K[3]); }
}
/** cloth-wrapped cable: a diagonal braid */
function paintCable(P: Page, C: readonly number[]) {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = (x + y) & 7, b = (x - y + 64) & 7;
    const k = a < 3 ? (b < 4 ? 3 : 2) : a < 6 ? (b < 4 ? 2 : 1) : 1;
    P.set(x, y, C[Math.min(C.length - 1, k)]);
  }
}
/** hazard paint: amber and ink bands, worn at the edges */
function paintHazard(P: Page, A: readonly number[], seed: number) {
  const I = RAMPS.ink;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const s = ((x + y) & 31) < 16;
    P.set(x, y, s ? A[Math.min(A.length - 1, 4)] : I[1]);
    if (s && ((x + y) & 31) === 0) P.set(x, y, A[A.length - 1]);
    if (s && ((x + y) & 31) === 15) P.set(x, y, A[2]);
  }
  for (let i = 0; i < 4; i++) { const sh = CHIPS[i % 3], ax = Math.floor(H(i, seed, 41) * 56), ay = Math.floor(H(i, seed, 42) * 56); P.poly(sh.map(([x, y]) => [ax + x, ay + y] as Pt), RAMPS.steel[4]); }
}
/** louvres: lit lip, slat face, dark slot */
function paintGrille(P: Page, R: readonly number[]) {
  const I = RAMPS.ink;
  P.fill(R[2]);
  for (let y = 0; y < 64; y++) { const m = y % 8; P.hline(3, 60, y, m === 0 ? R[4] : m < 3 ? R[3] : m < 5 ? R[2] : I[0]); }
  P.vline(0, 0, 63, R[1]); P.vline(1, 0, 63, R[4]); P.vline(63, 0, 63, R[1]); P.vline(62, 0, 63, R[2]);
}
/** track pads: a grouser bar per 16 px pad, pin bosses */
function paintTread(P: Page) {
  const S = RAMPS.steel, K = RAMPS.basalt;
  P.fill(S[2]);
  for (let y = 0; y < 64; y += 16) {
    P.hline(0, 63, y, K[0]); P.hline(0, 63, y + 1, S[1]);
    P.rect(4, y + 5, 56, 4, S[4]); P.hline(4, 59, y + 5, S[5]); P.hline(4, 59, y + 9, S[1]);
    for (const x of [2, 60]) { P.rect(x, y + 12, 2, 3, S[5]); P.set(x + 1, y + 14, S[1]); }
  }
}
/** canvas and webbing: a drawn weave */
function paintCanvas(P: Page, C: readonly number[]) {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const w = ((x >> 1) + (y >> 1)) & 1;
    P.set(x, y, C[w ? 3 : 2]);
  }
  for (let y = 7; y < 64; y += 16) P.hline(0, 63, y, C[1]);
  for (let x = 5; x < 64; x += 24) for (let y = 0; y < 64; y += 3) P.set(x, y, C[4]);
}
/** a rectangular panel meter (no dials as discs): paper face, a curved scale of ticks, a red zone, a needle */
function paintGauge(P: Page, seed: number) {
  const Pp = RAMPS.paper, I = RAMPS.ink, B = RAMPS.brass, Rd = RAMPS.stampRed;
  P.fill(B[2]);
  P.rect(0, 0, 64, 2, B[4]); P.rect(0, 0, 2, 64, B[4]); P.rect(0, 62, 64, 2, B[1]); P.rect(62, 0, 2, 64, B[1]);
  P.rect(5, 6, 54, 40, Pp[4]); P.hline(5, 58, 6, Pp[2]); P.vline(5, 6, 45, Pp[2]);
  for (let i = 0; i <= 10; i++) {
    const a = -1.0 + (i / 10) * 2.0, cx = 32, cy = 48, r0 = 30, r1 = i % 5 === 0 ? 24 : 27;
    P.line(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0 * 0.95, cx + Math.sin(a) * r1, cy - Math.cos(a) * r1 * 0.95, i >= 8 ? Rd[2] : I[1]);
  }
  const na = -0.6 + H(seed, 1, 5) * 1.2;
  P.line(32, 44, 32 + Math.sin(na) * 26, 44 - Math.cos(na) * 25, I[0]);
  P.rect(28, 42, 8, 4, I[2]);
  P.rect(8, 50, 48, 10, I[1]); for (let x = 10; x < 54; x += 6) P.rect(x, 53, 3, 4, Pp[3]);
}
/** lens and lamp glass: cut facets around a bright core (emissive alpha) */
function paintGlass(P: Page, G: readonly number[], strong: boolean, dark: boolean) {
  const n = G.length;
  const cx = 32, cy = 32;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = Math.atan2(y - cy, x - cx), f = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 8;
    const lit = f === 5 || f === 6, sh = f === 1 || f === 2;
    const d = Math.max(Math.abs(x - cx), Math.abs(y - cy)), core = d < 9;
    let k = core ? n - 1 : lit ? n - 2 : sh ? 1 : 2;
    if (dark) k = core ? 2 : lit ? 2 : sh ? 0 : 1;
    P.set(x, y, G[Math.min(n - 1, k)], dark ? 235 : strong ? 110 : 190);
  }
  if (!dark) { P.rect(18, 16, 6, 3, G[n - 1], 90); P.rect(18, 19, 3, 3, G[n - 1], 90); }
}
/** cockpit / visor glass: dark slate with reflection bars, faintly lit from inside */
function paintWindow(P: Page) {
  const S = RAMPS.slate, G = RAMPS.glowTeal;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const b = (x + y * 0.6) % 40;
    P.set(x, y, b < 5 ? S[4] : b < 7 ? S[3] : y > 48 ? G[0] : S[1], b < 7 ? 255 : 215);
  }
}
/** soot and exhaust black */
function paintSoot(P: Page) {
  const K = RAMPS.basalt;
  P.fill(K[1]);
  for (let i = 0; i < 12; i++) { const x = Math.floor(H(i, 7, 1) * 60), y = Math.floor(H(i, 7, 2) * 56); P.vline(x, y, y + 6, K[0]); P.vline(x + 1, y + 2, y + 5, K[2]); }
}
/** knurled grip */
function paintKnurl(P: Page) {
  const S = RAMPS.steel;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const a = (x + y) & 3, b = (x - y + 64) & 3; P.set(x, y, a === 0 || b === 0 ? S[2] : a === 1 && b === 1 ? S[5] : S[4]); }
}
/** stacked rounds in a feed: brass cases, steel links */
function paintAmmo(P: Page) {
  const B = RAMPS.brass, S = RAMPS.steel;
  P.fill(S[1]);
  for (let x = 0; x < 64; x += 8) { P.rect(x + 1, 6, 6, 40, B[3]); P.vline(x + 1, 6, 45, B[5]); P.vline(x + 2, 6, 45, B[4]); P.vline(x + 6, 6, 45, B[1]); P.rect(x + 2, 2, 4, 4, S[4]); P.rect(x, 46, 8, 6, S[3]); P.hline(x, x + 7, 46, S[5]); }
  P.rect(0, 52, 64, 12, S[2]);
}
/** faceted rubble (the field still carries a few stones) */
function paintRock(P: Page, R: readonly number[], seed: number) {
  P.fill(R[2]);
  const facets: Pt[][] = [[[0, 0], [30, 0], [22, 20], [0, 26]], [[30, 0], [64, 0], [64, 18], [40, 24], [22, 20]], [[0, 26], [22, 20], [40, 24], [34, 46], [0, 50]], [[40, 24], [64, 18], [64, 52], [34, 46]], [[0, 50], [34, 46], [64, 52], [64, 64], [0, 64]]];
  const k = [4, 3, 3, 1, 2];
  facets.forEach((f, i) => P.poly(f, R[Math.min(R.length - 1, k[(i + seed) % 5])]));
  P.line(22, 20, 40, 24, R[0]); P.line(40, 24, 34, 46, R[0]); P.line(10, 38, 18, 44, R[0]); P.line(48, 8, 52, 14, R[0]);
  P.line(23, 19, 39, 23, R[5] ?? R[4]);
}

// ------------------------------------------------------------------------------------------------ lettering
// stencil fonts with bridges in the closed letters (3 x 5 Latin and Cyrillic, 7 x 7 Chinese)
const LAT: Record<string, string> = {
  A: '#.##.####.##.#', B: '##.#.###.#.###.', C: '.###..#..#...##', D: '##.#.##.##.###.', E: '####..##.#..###', F: '####..##.#..#..', G: '.###..#.##.#.##', H: '#.##.####.##.##', I: '###.#..#..#.###', K: '#.##.###.#.##.#',
  L: '#..#..#..#..###', M: '#.####.#.##.##.#', N: '#.###.####.##.#', O: '.#.#.##.##.#.#.', P: '##.#.###.#..#..', R: '##.#.###.#.##.#', S: '.###...#...###.', T: '###.#..#..#..#.', U: '#.##.##.##.#.#.', V: '#.##.##.##.#.#.',
  W: '#.##.##.#####.#', X: '#.##.#.#.#.##.#', Y: '#.##.#.#..#..#.', Z: '###..#.#.#..###', '0': '.#.#.##.##.#.#.', '1': '.#.##..#..#.###', '2': '##...#.#.#..###', '3': '##...#.#...###.', '4': '#.##.####..#..#', '5': '####..##...###.',
  '6': '.##.#.##.##.#.#', '7': '###..#.#..#..#.', '8': '.#.#.#.#.#.#.#.', '9': '.#.#.##.#..#.#.', '.': '............#..', '-': '......###......', ' ': '...............', '/': '..#..#.#..#.#..',
  // Cyrillic (shapes that are not Latin look-alikes)
  'С': '.###..#..#...##', 'Р': '##.#.###.#..#..', 'К': '#.##.###.#.##.#', 'Т': '###.#..#..#..#.', 'Б': '####..##.#.###.', 'Л': '.##.##.##.##.##', 'Д': '.#..#.#.####.##', 'П': '####.##.##.##.#', 'И': '#.##.###.##.##.#', 'Г': '####..#..#..#..',
};
const HAN: Record<string, string[]> = {
  '中': ['...#...', '#######', '#..#..#', '#######', '...#...', '...#...', '...#...'],
  '国': ['#######', '#.....#', '#.###.#', '#..#..#', '#.###.#', '#...#.#', '#######'],
  '工': ['.......', '.#####.', '...#...', '...#...', '...#...', '#######', '.......'],
  '五': ['#######', '..#....', '..#....', '######.', '..#..#.', '..#..#.', '#######'],
  '一': ['.......', '.......', '.......', '#######', '.......', '.......', '.......'],
  '三': ['.#####.', '.......', '..###..', '.......', '.......', '#######', '.......'],
  '人': ['...#...', '...#...', '...#...', '..#.#..', '.#...#.', '#.....#', '.......'],
  '八': ['.......', '..#.#..', '..#.#..', '.#...#.', '.#...#.', '#.....#', '.......'],
};
/** stencil a string: Latin/Cyrillic glyphs at sc, Chinese glyphs a size up; returns the width */
function stencil(P: Page, s: string, x: number, y: number, c: number, sc = 2, dry = false): number {
  let cx = x;
  for (const ch of s) {
    const h = HAN[ch];
    if (h) {
      const k = Math.max(1, sc - 1 + (sc === 1 ? 0 : 0));
      if (!dry) for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) if (h[j][i] === '#') P.rect(cx + i * k, y - 1 + j * k, k, k, c);
      cx += 8 * k; continue;
    }
    const g = LAT[ch] ?? LAT[ch.toUpperCase()] ?? LAT[' '];
    if (!dry) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '#') P.rect(cx + i * sc, y + j * sc, sc, sc, c);
    cx += 4 * sc;
  }
  return cx - x;
}

// ------------------------------------------------------------------------------------------------ markings
/** a five-point star, bevelled: each arm split along its spine into a lit and a shadow facet */
function star(P: Page, cx: number, cy: number, R0: number, lit: number, shd: number, line: number, rim?: number) {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R0 * 0.4 : R0; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  if (rim !== undefined) {
    const big: Pt[] = pts.map(([x, y]) => [cx + (x - cx) * 1.2, cy + (y - cy) * 1.2]);
    P.poly(big, rim);
  }
  for (let i = 0; i < 10; i++) {
    const a = pts[i], b = pts[(i + 1) % 10];
    // facet normal in screen space: perpendicular to the edge, away from the centre
    const ex = b[0] - a[0], ey = b[1] - a[1], nx = ey, ny = -ex, mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    const s = nx * mx + ny * my > 0 ? 1 : -1, l = Math.hypot(nx, ny) || 1;
    const lightK = (-0.62 * nx * s - 0.78 * ny * s) / l;
    P.poly([[cx, cy], a, b], lightK > 0 ? lit : shd);
  }
  // sel-out: dark edge on the lower right
  for (let i = 0; i < 10; i++) { const a = pts[i], b = pts[(i + 1) % 10]; if ((a[0] + b[0]) / 2 > cx - 2 && (a[1] + b[1]) / 2 > cy - 6) P.line(a[0], a[1], b[0], b[1], line); }
}
function paintMark(P: Page, L: Livery, bg: readonly number[]) {
  const Pp = RAMPS.paper, I = RAMPS.ink, Rd = RAMPS.stampRed, O = RAMPS.ochre, Sl = RAMPS.slate;
  const mid = Math.min(3, bg.length - 3);
  P.fill(bg[mid]);
  if (L.id === 'uspc') {
    // star and bars, with the red stripe in the bars
    P.rect(4, 26, 56, 13, I[1]); P.rect(5, 27, 54, 11, Pp[4]); P.rect(5, 31, 54, 3, Rd[2]); P.hline(5, 58, 27, Pp[5]);
    star(P, 32, 33, 22, Pp[5], Pp[3], I[1], I[1]);
  } else if (L.id === 'sov') {
    star(P, 32, 33, 25, Rd[3], Rd[1], Rd[0], Pp[2]);
  } else if (L.id === 'prc') {
    star(P, 32, 33, 25, Rd[3], Rd[1], Rd[0], O[5]);
    stencil(P, '八', 23, 28, O[5], 2); // the Aug-1 characters on the star (八一)
    stencil(P, '一', 31, 28, O[5], 2);
  } else {
    P.rect(0, 26, 64, 12, Sl[2]); P.hline(0, 63, 26, Sl[4]); P.hline(0, 63, 37, Sl[0]);
    const pts: Pt[] = [[32, 6], [37, 27], [58, 32], [37, 37], [32, 58], [27, 37], [6, 32], [27, 27]];
    P.poly(pts, Pp[4]); P.poly([[32, 6], [37, 27], [32, 32]], Pp[5]); P.poly([[6, 32], [27, 27], [32, 32]], Pp[5]); P.poly([[32, 58], [37, 37], [32, 32]], Pp[2]); P.poly([[58, 32], [37, 37], [32, 32]], Pp[2]);
  }
}

// ------------------------------------------------------------------------------------------------ the page
export interface Atlas { tex: THREE.DataTexture; L: Livery; key: string }
const CACHE = new Map<string, Atlas>();
export function atlasFor(L: Livery): Atlas {
  const key = JSON.stringify(L);
  const hit = CACHE.get(key); if (hit) return hit;
  const P = new Page();
  const A = RAMPS[L.a], B = RAMPS[L.b], S = RAMPS.steel, G = RAMPS[L.glow];
  for (let v = 0; v < 3; v++) { P.region('pa' + v); paintPlate(P, A, L, v, 11 + v * 7); }
  P.region('pb0'); paintPlate(P, B, L, 0, 51); P.region('pb1'); paintPlate(P, B, L, 2, 57); P.region('pb2'); paintPlate(P, B, L, 1, 63);
  P.region('pas'); paintPlate(P, A, L, 0, 71, true); P.region('pbs'); paintPlate(P, B, L, 0, 73, true);
  P.region('pc0'); paintPlate(P, RAMPS.olive === A ? RAMPS.steel : RAMPS.olive, L, 1, 79);
  P.region('plainA'); P.fill(A[Math.min(3, A.length - 3)]); P.region('plainB'); P.fill(B[Math.min(3, B.length - 3)]);
  P.region('st0'); paintSteel(P, S, 0, 3); P.region('st1'); paintSteel(P, S, 1, 5);
  P.region('dk'); paintSteel(P, RAMPS.basalt, 0, 9);
  P.region('br'); paintBrass(P);
  P.region('rb'); paintRubber(P, false); P.region('hose'); paintRubber(P, true);
  P.region('cab'); paintCable(P, RAMPS[L.cable]);
  P.region('hz'); paintHazard(P, RAMPS.ochre, 3); P.region('hzB'); paintHazard(P, RAMPS.stampRed.concat([RAMPS.coral[4], RAMPS.coral[5]]), 5);
  P.region('gr'); paintGrille(P, S); P.region('vent'); paintGrille(P, A);
  P.region('tr'); paintTread(P);
  P.region('cv'); paintCanvas(P, L.id === 'prc' ? RAMPS.sand : RAMPS.straw);
  P.region('felt'); paintCanvas(P, RAMPS.olive);
  P.region('gauge'); paintGauge(P, 3);
  P.region('lens'); paintGlass(P, G, true, false); P.region('lensB'); paintGlass(P, RAMPS.glowAmber, true, false);
  P.region('lamp'); paintGlass(P, G, true, false); for (let y = 0; y < 64; y += 9) P.hline(0, 63, y, G[G.length - 2], 110);
  P.region('off'); paintGlass(P, RAMPS.slate, false, true);
  P.region('red'); paintGlass(P, RAMPS.stampRed.concat([RAMPS.coral[4], RAMPS.coral[5]]), true, false);
  P.region('glass'); paintWindow(P);
  P.region('soot'); paintSoot(P);
  P.region('knurl'); paintKnurl(P);
  P.region('ammo'); paintAmmo(P);
  P.region('rock'); paintRock(P, RAMPS[L.rock], 2);
  P.region('mark'); paintMark(P, L, A);
  P.region('markB'); paintMark(P, L, B);
  // stencils: light ink on the dark paints, dark ink on the light ones
  const lum = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
  const inkOn = (R: readonly number[]) => (lum(R[Math.min(3, R.length - 3)]) > 120 ? RAMPS.ink[1] : RAMPS.paper[4]);
  for (let i = 0; i < 4; i++) {
    const s = L.serials[i % L.serials.length];
    P.region('ser' + i); paintPlate(P, A, { ...L, wear: 0 }, 0, 90 + i, true);
    const w = stencil(P, s, 0, 0, 0, 2, true); stencil(P, s, Math.max(1, Math.floor((128 - w) / 2)), 3, inkOn(A), 2);
    P.region('serB' + i); paintPlate(P, B, { ...L, wear: 0 }, 0, 95 + i, true);
    const w2 = stencil(P, s, 0, 0, 0, 2, true); stencil(P, s, Math.max(1, Math.floor((128 - w2) / 2)), 3, inkOn(B), 2);
  }
  P.region('num'); paintPlate(P, A, L, 0, 99, true);
  const num = L.id === 'uspc' ? '07' : L.id === 'sov' ? '14' : L.id === 'prc' ? '52' : '58';
  stencil(P, num, 20, 9, inkOn(A), 9);
  const tex = new THREE.DataTexture(P.d, AT, AT, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapNearestFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const at: Atlas = { tex, L, key };
  CACHE.set(key, at);
  return at;
}

// ------------------------------------------------------------------------------------------------ the material
export interface KitU { glow: { value: number }; wet: { value: number }; flash: { value: THREE.Color }; lit: { value: number } }
export function kitUniforms(): KitU { return { glow: { value: 1 }, wet: { value: 0 }, flash: { value: new THREE.Color(0, 0, 0) }, lit: { value: 1 } }; }
/** the atlas material: tiles within regions, emissive texels glow (uGlow), wet darkens, uFlash adds a hit flash */
export function kitMaterial(at: Atlas, U: KitU = kitUniforms(), flag = 1): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: at.tex, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowK = U.glow; sh.uniforms.uWet = U.wet; sh.uniforms.uFlash = U.flash; sh.uniforms.uLit = U.lit;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 reg;\nvarying vec4 vReg;\nvarying vec2 vUvT;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvUvT = uv; vReg = reg;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlowK; uniform float uWet; uniform vec3 uFlash; uniform float uLit;\nvarying vec4 vReg;\nvarying vec2 vUvT;')
      .replace('#include <map_fragment>', `vec2 kuv = vReg.xy + fract(vUvT) * vReg.zw;
vec4 sampledDiffuseColor = textureGrad(map, kuv, dFdx(vUvT) * vReg.zw, dFdy(vUvT) * vReg.zw);
float glowA = sampledDiffuseColor.a; vec3 glowC = sampledDiffuseColor.rgb;
diffuseColor.rgb *= sampledDiffuseColor.rgb * mix(vec3(1.0), vec3(0.56, 0.6, 0.68), uWet);
diffuseColor.a = 1.0;`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA < 0.98) totalEmissiveRadiance += glowC * uGlowK * uLit * (glowA < 0.7 ? 1.7 : 0.45);\ntotalEmissiveRadiance += uFlash;');
  };
  m.customProgramCacheKey = () => 'oddworld-kit-v1';
  gbuf(m, flag);
  return m;
}
/** normalized region rectangle for the vertex attribute */
export function regOf(k: RegKey): [number, number, number, number] {
  const r = REG[k] ?? REG.pa0;
  return [r[0] / AT, r[1] / AT, r[2] / AT, r[3] / AT];
}
export const PAINT_A = ['pa0', 'pa1', 'pa2'], PAINT_B = ['pb0', 'pb1', 'pb2'];
