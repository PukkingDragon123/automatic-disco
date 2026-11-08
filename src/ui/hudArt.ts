// Housings for the golem's control console, painted once per module at their exact size: riveted olive-drab
// plate with chamfered corners, seams, stencil serials, hazard paint, vents, CRT bezels and meter wells.
import { Pix, OL, GM, BR, CR, PH, RD, INK, metal, rivet, rivet3, screw, bolt, hazard, vent, grille, plate, text, textW, dv, mixc, chamfer as _c, pipe, CU } from './machine';
import { hashf } from '../limbo/core/rng';

export interface HousingOpts { cut?: [number, number, number, number]; tone?: 'olive' | 'gun'; seed?: number; rivetStep?: number; seamsX?: number[]; seamsY?: number[]; noRivets?: ('t' | 'r' | 'b' | 'l')[] }
/** a riveted plate housing; cut = chamfer sizes for [top-left, top-right, bottom-right, bottom-left] */
export function housing(w: number, h: number, o: HousingOpts = {}): Pix {
  const p = new Pix(w, h), R = o.tone === 'gun' ? GM : OL, seed = o.seed ?? 3;
  const [tl, tr, br, bl] = o.cut ?? [6, 6, 6, 6];
  metal(p, 0, 0, w, h, R, { seed, base: R.length * 0.5, rough: 0.55, brushed: 0.28, light: 0.9, scratches: 1.1, grime: 0.6, rust: 0.55, chips: 1.1 });
  const out = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h || x + y < tl || (w - 1 - x) + y < tr || (w - 1 - x) + (h - 1 - y) < br || x + (h - 1 - y) < bl;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (out(x, y)) p.clear(x, y);
  const edge = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!out(x, y) && (out(x - 1, y) || out(x + 1, y) || out(x, y - 1) || out(x, y + 1))) { edge[y * w + x] = 1; p.set(x, y, INK); }
  const E = (x: number, y: number) => x < 0 || y < 0 || x >= w || y >= h ? false : edge[y * w + x] === 1;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (edge[y * w + x] || out(x, y)) continue;
    if (E(x, y - 1) || E(x - 1, y)) p.set(x, y, E(x, y - 1) ? R[R.length - 2] : R[R.length - 3]);
    else if (E(x, y + 1) || E(x + 1, y)) p.set(x, y, E(x, y + 1) ? R[1] : R[2]);
  }
  // seams
  for (const sx of o.seamsX ?? []) { for (let y = 2; y < h - 2; y++) if (!out(sx, y) && !out(sx + 1, y)) { p.set(sx, y, R[1]); p.set(sx + 1, y, R[R.length - 3]); } for (let y = 8; y < h - 6; y += 9) { rivet3(p, sx - 4, y); rivet3(p, sx + 3, y); } }
  for (const sy of o.seamsY ?? []) { for (let x = 2; x < w - 2; x++) if (!out(x, sy) && !out(x, sy + 1)) { p.set(x, sy, R[1]); p.set(x, sy + 1, R[R.length - 3]); } }
  // perimeter rivets
  const st = o.rivetStep ?? 11, no = o.noRivets ?? [];
  if (!no.includes('t')) for (let x = tl + 5; x < w - tr - 7; x += st) rivet(p, x, 3);
  if (!no.includes('b')) for (let x = bl + 5; x < w - br - 7; x += st) rivet(p, x, h - 7);
  if (!no.includes('l')) for (let y = tl + 6; y < h - bl - 8; y += st) rivet(p, 3, y);
  if (!no.includes('r')) for (let y = tr + 6; y < h - br - 8; y += st) rivet(p, w - 7, y);
  return p;
}
/** stencilled paint with a little wear */
export function stencil(p: Pix, s: string, x: number, y: number, col = CR[3], seed = 1) {
  const q = new Pix(textW(s) + 2, 6); text(q, s, 0, 0, col);
  for (let j = 0; j < q.h; j++) for (let i = 0; i < q.w; i++) { const c = q.get(i, j); if (c >= 0 && hashf(i + x, j + y, seed) > 0.05) { p.set(x + i, y + j, hashf(i, j + x, seed + 3) < 0.18 ? mixc(c, 0x000000, 0.22) : c); p.shade(x + i + 1, y + j + 1, 0.85); } }
}
/** CRT bezel around a screen opening (x, y, w, h are the visible screen) */
export function crtWell(p: Pix, x: number, y: number, w: number, h: number, r = 3) {
  // raised bezel
  for (let j = -4; j < h + 4; j++) for (let i = -4; i < w + 4; i++) {
    const o = Math.min(i + 4, j + 4, w + 3 - i, h + 3 - j);
    if (o === 0) p.set(x + i, y + j, i + 4 === 0 || j + 4 === 0 ? GM[7] : GM[1]);
    else if (o === 1) p.set(x + i, y + j, i + 4 === 1 || j + 4 === 1 ? GM[6] : GM[2]);
    else p.set(x + i, y + j, dv(GM, 3.6 - (i + j) / (w + h) * 1.2 + (hashf(x + i, y + j, 6) - 0.5) * 0.5, x + i, y + j));
  }
  // cast shadow under the bezel
  for (let i = -3; i < w + 5; i++) p.shade(x + i, y + h + 4, 0.55);
  for (let j = -3; j < h + 5; j++) p.shade(x + w + 4, y + j, 0.55);
  // screen glass with rounded corners and a phosphor vignette
  for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++) {
    const cx = Math.min(Math.max(i, r), w - 1 - r), cy = Math.min(Math.max(j, r), h - 1 - r);
    const d = Math.hypot(i - cx, j - cy);
    if (d > r + 1) continue;
    if (d > r || i < 0 || j < 0 || i >= w || j >= h) { p.set(x + i, y + j, INK); continue; }
    const ex = Math.min(i, w - 1 - i) / (w / 2), ey = Math.min(j, h - 1 - j) / (h / 2);
    const v = 1.4 + Math.min(1, Math.sqrt(ex * ey) * 1.6) * 1.1;
    p.set(x + i, y + j, dv(PH, v, x + i, y + j));
  }
  // glass reflection streak, top-left
  for (let k = 0; k < Math.min(w, h) * 0.35; k++) { p.set(x + 2 + k, y + 1, 0xb8ffc8, 26); }
  for (let k = 0; k < 4; k++) p.set(x + 1, y + 2 + k, 0xb8ffc8, 30);
}
/** a recessed well (meter, drum window) with a dark floor */
export function socket(p: Pix, x: number, y: number, w: number, h: number, floor = INK) {
  p.rect(x, y, w, h, floor);
  p.hl(x - 1, x + w, y - 1, GM[1]); p.vl(x - 1, y - 1, y + h, GM[1]);
  p.hl(x - 1, x + w, y + h, GM[6]); p.vl(x + w, y - 1, y + h, GM[6]);
  p.hl(x - 2, x + w + 1, y - 2, INK, 160); p.vl(x - 2, y - 2, y + h + 1, INK, 160);
}
/** brass-ringed bezel for drums / nixie windows */
export function brassFrame(p: Pix, x: number, y: number, w: number, h: number) {
  for (let i = -2; i < w + 2; i++) { p.set(x + i, y - 2, BR[6]); p.set(x + i, y + h + 1, BR[2]); }
  for (let j = -2; j < h + 2; j++) { p.set(x - 2, y + j, BR[5]); p.set(x + w + 1, y + j, BR[2]); }
  p.set(x - 2, y - 2, BR[7]); p.set(x + w + 1, y + h + 1, BR[1]);
  socket(p, x, y, w, h);
}
/** knurled rotary knob with a pointer line, d px across */
export function knob(p: Pix, cx: number, cy: number, r: number, ang: number) {
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r + 0.5) { if (d < r + 1.6 && x + y > cx + cy) p.shade(x, y, 0.55); continue; }
    const a = Math.atan2(y - cy, x - cx);
    const lit = -(Math.cos(a) * 0.6 + Math.sin(a) * 0.8);
    if (d > r - 1.3) p.set(x, y, Math.floor(a * 6) % 2 ? BK2[2 + (lit > 0 ? 2 : 0)] : BK2[1 + (lit > 0 ? 2 : 0)]);
    else p.set(x, y, dv(BK2, 2.4 + lit * 1.2 - d / r * 0.6, x, y));
  }
  p.line(cx, cy, cx + Math.sin(ang) * (r - 1), cy - Math.cos(ang) * (r - 1), CR[4]);
  p.set(Math.round(cx - r * 0.4), Math.round(cy - r * 0.5), 0x8a8478);
}
const BK2 = [0x0c0b0a, 0x1a1816, 0x2a2724, 0x3e3a35, 0x58534b, 0x7a7468];
const BK3 = [0x080808, 0x121110, 0x1c1a18, 0x282522, 0x34302c];

// ------------------------------------------------------------------ modules
export const TOP = { w: 392, h: 31 };
/** x positions of the rail's instruments */
export const RAIL = { bio: 12, min: 78, chg: 146, hel: 213, sup: 249, fld: 290, dom: 336 };
export function topArt() {
  const { w, h } = TOP, X = RAIL;
  const p = housing(w, h, { cut: [0, 0, 9, 9], seed: 21, rivetStep: 12, noRivets: ['t', 'l', 'r', 'b'], seamsX: [142, 285] });
  for (let x = 0; x < w; x++) { p.set(x, 0, INK); p.set(x, 1, OL[2]); }
  const lab = (s: string, x: number) => stencil(p, s, x, 4, CR[3], x);
  // BIOMASS / MINERALS: drums and a little rate CRT
  for (const [n, x] of [['BIOMASS', X.bio], ['MINERALS', X.min]] as [string, number][]) {
    lab(n, x); brassFrame(p, x, 13, 39, 11);
    crtWell(p, x + 43, 14, 17, 9, 1);
  }
  // CHARGE meter + nixies
  lab('CHARGE', X.chg); brassFrame(p, X.chg + 32, 12, 29, 15);
  // HELIX
  lab('HELIX', X.hel); brassFrame(p, X.hel, 12, 29, 15);
  // SUPPLY
  lab('SUPPLY', X.sup); brassFrame(p, X.sup, 13, 15, 11);
  // FIELD level lamps + tube
  lab('FIELD', X.fld);
  for (let i = 0; i < 5; i++) socket(p, X.fld + i * 8, 12, 7, 7, GM[2]);
  socket(p, X.fld, 22, 39, 4, 0x0a120c);
  // DOMINION tube with the claim mark at its end
  lab('DOMINION', X.dom);
  socket(p, X.dom, 13, 46, 7, 0x0a120c);
  for (let k = 0; k <= 4; k++) p.set(X.dom + Math.round((k * 45) / 4), 22, CR[2]);
  for (let y = 11; y <= 23; y++) p.set(X.dom + 46, y, y === 11 || y === 23 ? RD[6] : RD[4]);
  hazard(p, 4, h - 4, 5, 2, 4); hazard(p, w - 9, h - 4, 5, 2, 7, true);
  bolt(p, 138, 21); bolt(p, 281, 21);
  return p;
}
export const BANK = { w: 92, h: 50 };
export function bankArt() {
  const { w, h } = BANK;
  const p = housing(w, h, { cut: [0, 0, 0, 10], seed: 33, noRivets: ['t', 'r', 'b'], rivetStep: 12 });
  for (let x = 0; x < w; x++) { p.set(x, 0, INK); p.set(x, 1, OL[2]); }
  for (let i = 0; i < 4; i++) {
    const x = 7 + i * 21;
    // black Bakelite escutcheon behind each toggle: ON engraved above, a chrome rim
    for (let y = 11; y < 31; y++) for (let xx = x + 2; xx < x + 17; xx++) {
      const e = y === 11 || xx === x + 2 ? GM[7] : y === 30 || xx === x + 16 ? GM[2] : dv(BK3, 2.4 - (y - 11) / 20 * 1.2 + (hashf(xx, y, 4) - 0.5) * 0.4, xx, y);
      p.set(xx, y, e);
    }
    for (let y = 12; y < 32; y++) p.shade(x + 17, y, 0.55); for (let xx = x + 3; xx < x + 18; xx++) p.shade(xx, 31, 0.55);
    text(p, 'ON', x + 6, 12, CR[3]);
  }
  return p;
}
export const PLATE = { w: 104, h: 35 };
export function nameArt() {
  const { w, h } = PLATE;
  const p = housing(w, h, { cut: [0, 0, 10, 0], seed: 41, noRivets: ['t', 'l', 'b'], rivetStep: 12 });
  for (let x = 0; x < w; x++) { p.set(x, 0, INK); p.set(x, 1, OL[2]); }
  plate(p, 5, 4, 'U.S. PLANETARY CORPS', 'brass', { w: 94 });
  brassFrame(p, 7, 16, 42, 15);
  stencil(p, 'UNIT 07', 56, 17, CR[3], 2);
  stencil(p, 'SER 1957-A', 56, 25, CR[2], 3);
  return p;
}
export const SCOPE = { w: 114, h: 136, sx: 9, sy: 23, ss: 96 };
export function scopeArt() {
  const { w, h, sx, sy, ss } = SCOPE;
  const p = housing(w, h, { cut: [0, 9, 0, 0], seed: 52, noRivets: ['b', 'l'], rivetStep: 12 });
  crtWell(p, 7, 5, 100, 9, 1);
  crtWell(p, sx, sy, ss, ss, 4);
  stencil(p, 'TERRAIN SCOPE MK II', 9, h - 9, CR[3], 6);
  screw(p, 3, 18, 1); screw(p, w - 8, 18, 2);
  return p;
}
export const SEL = { w: 206, h: 86, sx: 8, sy: 16, sw: 172, sh: 64 };
export function selArt() {
  const { w, h, sx, sy, sw, sh } = SEL;
  const p = housing(w, h, { cut: [7, 7, 0, 0], seed: 64, noRivets: ['b', 't'], rivetStep: 12, seamsX: [] });
  plate(p, 12, 3, 'UNIT TELEMETRY', 'brass');
  stencil(p, 'MODEL 7-T', 152, 5, CR[2], 5);
  crtWell(p, sx, sy, sw, sh, 3);
  // control column
  socket(p, 187, 17, 15, 15, GM[3]); stencil(p, 'GAIN', 187, 34, CR[2]);
  socket(p, 187, 41, 15, 15, GM[3]); stencil(p, 'TUNE', 187, 58, CR[2]);
  grille(p, 187, 74, 14, 8);
  return p;
}
export const CMD = { w: 114, h: 94, kx: 6, ky: 15 };
export function cmdArt() {
  const { w, h } = CMD;
  const p = housing(w, h, { cut: [7, 7, 0, 0], seed: 77, noRivets: ['b', 'l', 'r'], rivetStep: 12 });
  plate(p, 10, 3, 'COMMAND BANK', 'brass');
  // dark recessed key bed
  socket(p, 5, 14, 104, 78, GM[1]);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { const x = 6 + i * 26, y = 15 + j * 26; p.rect(x, y, 24, 24, GM[2]); }
  return p;
}
export const WHEEL = { w: 172, h: 158, wx: 6, wy: 30, ws: 124 };
export function wheelArt() {
  const { w, h, wx, wy, ws } = WHEEL;
  const p = housing(w, h, { cut: [12, 0, 0, 0], seed: 88, noRivets: ['b', 'r'], rivetStep: 12, seamsX: [136] });
  // name CRT
  crtWell(p, 10, 6, 122, 17, 2);
  // a deep socket the wheel turns in
  const cx = wx + ws / 2, cy = wy + ws / 2;
  for (let y = wy - 4; y < wy + ws + 4; y++) for (let x = wx - 4; x < wx + ws + 4; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d > 63.5) continue;
    if (d > 62.5) p.set(x, y, x + y < cx + cy ? GM[1] : GM[6]);
    else p.set(x, y, dv(GM, 0.6 + (d / 62) * 1.2 + ((x - cx) + (y - cy)) / 124 * 0.8, x, y));
  }
  // right column: charge meter, tubes, armed lamp, vent
  stencil(p, 'CHARGE', 140, 28, CR[3], 3);
  stencil(p, 'B+ HT', 141, 92, CR[2], 2);
  for (const x of [140, 154]) { socket(p, x - 1, 66, 11, 22, 0x0c0a08); }
  stencil(p, 'ARMED', 143, 112, RD[5], 7);
  vent(p, 140, 124, 26, 4);
  hazard(p, 138, h - 7, 34, 3, 9);
  pipe(p, 165, 34, 26, true, CU, 3, [2, 22]);
  bolt(p, 3, 18);
  return p;
}
export const DESC = { w: 172, h: 60 };
export function descArt() {
  const { w, h } = DESC;
  const p = housing(w, h, { cut: [8, 0, 0, 0], tone: 'gun', seed: 91, noRivets: ['b', 'r', 'l'], rivetStep: 12 });
  crtWell(p, 7, 7, 158, 48, 3);
  return p;
}
export const RADIO = { w: 226, h: 62 };
export function radioArt() {
  const { w, h } = RADIO;
  const p = housing(w, h, { cut: [7, 7, 7, 7], seed: 103, noRivets: ['b'], rivetStep: 12 });
  crtWell(p, 7, 8, 44, 44, 3);
  crtWell(p, 60, 8, 158, 46, 2);
  stencil(p, 'SHORTWAVE RX', 8, h - 7, CR[2], 3);
  return p;
}
void _c; void rivet3; void RD; void PH; void mixc; void dv;

export const TITLE = { w: 260, h: 84 };
/** the main-menu nameplate: a riveted sign with the project plate, hazard paint and a tagline CRT */
export function titleArt() {
  const { w, h } = TITLE;
  const p = housing(w, h, { cut: [8, 8, 8, 8], seed: 120, rivetStep: 12, noRivets: [] });
  const pl = 'U.S. PLANETARY CORPS - PROJECT VEYR';
  plate(p, Math.floor((w - (textW(pl) + 14)) / 2), 7, pl, 'brass');
  // the bed the brass letters are bolted to
  socket(p, 10, 19, w - 20, 40, 0x15181c);
  for (let y = 19; y < 59; y++) for (let x = 10; x < w - 10; x++) p.set(x, y, dv(GM, 2.2 + (hashf(x, y, 5) - 0.5) * 0.6 - (y - 19) / 40 * 0.6, x, y));
  for (const x of [14, w - 19]) { screw(p, x, 23, x); screw(p, x, 50, x + 1); }
  crtWell(p, 14, 66, w - 28, 10, 2);
  hazard(p, 12, h - 4, 30, 2, 3); hazard(p, w - 42, h - 4, 30, 2, 5, true);
  return p;
}
