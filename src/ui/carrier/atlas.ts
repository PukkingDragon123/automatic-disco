// The carrier's texture atlas, painted pixel by pixel from the master palette (2048 px, one sheet for the whole
// ship). Plate steel in courses of lapped, riveted plates, each plate one ramp step with a lit top-left edge and a
// shadowed bottom-right, a buckled plate's facet here and there, chipped paint showing red-oxide primer and bare
// steel at the knocks, rust weeping down from rivet lines, grime gathered along the bottom of a course in drawn
// clusters, access panels, doubler patches and frame numbers. Olive superstructure plate, gunmetal armour, the
// soot- and heat-tinted engine plate, radiator fins, cream propellant tanks with their red bands, colour-coded
// pipes, lit window bands and portholes (emissive), hazard stripes, numbered hatches, louvres, container sides,
// the nozzle bells, lamp lenses, and the stencilled lettering and the star-and-bar roundel as decals.
import { Sheet, P, hh, rng, stencil, textWidth, AW, AH, SL, ST, OL, BR, RD, AM, RU, PA, INK } from './paint';
import { RAMPS } from '../../art/palette';
import type { Skin } from './geo';

// composite ramps, dark -> light (cool shadows, warm lights), 8 steps each
export const HULL = [INK[1], SL[0], SL[1], SL[2], ST[2], ST[3], ST[4], ST[5], ST[6]];
export const BLUE = [INK[1], SL[0], SL[1], SL[2], SL[3], SL[4], SL[5], ST[6]];
export const ARMOR = [INK[0], ST[0], ST[1], SL[1], SL[2], ST[2], ST[3], ST[4], ST[5]];
export const OLV = [INK[1], OL[0], OL[1], OL[2], OL[3], OL[4], OL[5], RAMPS.straw[3]];
export const CREAM = [SL[1], ST[2], ST[3], PA[0], PA[1], PA[2], PA[3], PA[4]];
const PRIMER = [RU[0], RU[1], RU[2], RU[3], RU[3], RU[4], RU[4], RU[5]];

// ------------------------------------------------------------------ a tiny 3x5 face for frame numbers and tags
const F3: Record<string, string> = {
  0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.', 4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.',
  6: '.##|#..|###|#.#|###', 7: '###|..#|..#|.#.|.#.', 8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.', '-': '...|...|###|...|...', ' ': '..|..|..|..|..',
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.', E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..',
  H: '#.#|#.#|###|#.#|#.#', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###', N: '#.#|###|###|###|#.#', O: '.#.|#.#|#.#|#.#|.#.', P: '##.|#.#|##.|#..|#..',
  R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.', T: '###|.#.|.#.|.#.|.#.', V: '#.#|#.#|#.#|.#.|.#.', X: '#.#|#.#|.#.|#.#|#.#', '.': '.|.|.|.|#', '/': '..#|..#|.#.|#..|#..',
  G: '.##|#..|#.#|#.#|.##', I: '###|.#.|.#.|.#.|###', M: '#.#|###|###|#.#|#.#', U: '#.#|#.#|#.#|#.#|.##', W: '#.#|#.#|###|###|#.#', Y: '#.#|#.#|.#.|.#.|.#.', Z: '###|..#|.#.|#..|###',
};
const G3 = new Map<string, string[]>(Object.entries(F3).map(([k, v]) => [k, v.split('|')]));
export function tiny(p: P, s: string, x: number, y: number, c: number, em = -1) {
  let cx = x;
  for (const ch of s.toUpperCase()) { const g = G3.get(ch) ?? G3.get(' ')!; for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') p.set(cx + i, y + j, c, em); cx += g[0].length + 1; }
  return cx - 1;
}

// ------------------------------------------------------------------ marks drawn by hand (3+ variants each)
const CHIPS = [
  ['.aa.', 'abba', '.abb', '..ac'],
  ['aa...', 'abba.', '.abbac', '..aac'],
  ['.a.', 'aba', 'aac'],
  ['aaa..', 'abbaa', '.abbbc', '..aacc'],
  ['.aa', 'abb', 'abac', '.ac'],
];
const GRIME = [[1, 1, 2, 2, 3, 2, 2, 1], [2, 3, 3, 2, 1, 1, 2, 2, 3, 4, 3, 2], [1, 2, 2, 1, 1, 1, 2, 3, 3, 2], [3, 2, 2, 1, 2, 2, 3, 3, 2, 1, 1]];

interface PlateOpts {
  R: readonly number[]; base: number; seed: number;
  courses: number[]; widths: number[];
  rivet?: number; bolts?: boolean; alt?: readonly number[]; altP?: number; twins?: number[];
  facet?: number; chips?: number; rust?: number; grime?: number; panels?: number; marks?: number; doubler?: number; primer?: number;
}
interface Plate { x0: number; y0: number; x1: number; y1: number; t: number; R: readonly number[]; fill: number }

/** steel plate in lapped courses: the shared painter behind every hull skin */
function plates(p: P, o: PlateOpts) {
  const rnd = rng(o.seed), R0 = o.R, out: Plate[] = [];
  let y = 0;
  for (const ch of o.courses) {
    const start = Math.floor(rnd() * 48);
    let x = start;
    while (x < start + p.w) {
      let w = o.widths[Math.floor(rnd() * o.widths.length)];
      if (start + p.w - (x + w) < 14) w = start + p.w - x;
      const r = rnd();
      const R = o.alt && r < (o.altP ?? 0) ? o.alt : r > 0.985 && o.primer ? PRIMER : R0;
      const t = R === R0 ? (r < 0.7 ? o.base : r < 0.8 ? o.base - 1 : r < 0.88 ? o.base + 1 : o.base) : R === PRIMER ? 2 : o.base - 1;
      const fill = R === R0 && o.twins && r >= 0.88 ? o.twins[Math.floor(rnd() * o.twins.length)] : -1;
      out.push({ x0: x, y0: y, x1: x + w, y1: y + ch, t, R, fill });
      x += w;
    }
    y += ch;
  }
  // 1. fill, buckled facets, the seams and bevels
  for (const q of out) {
    const { x0, y0, x1, y1, t, R } = q, w = x1 - x0, h = y1 - y0;
    p.rect(x0, y0, w, h, q.fill >= 0 ? q.fill : R[t]);
    if (o.facet && w * h > 1600 && rnd() < o.facet) {
      // a plate dished between its frames: the lower-right plane turned from the light, one step down
      const a = 0.35 + rnd() * 0.4, b = 0.3 + rnd() * 0.5;
      p.poly([[x0 + w * a, y1], [x1, y0 + h * b], [x1, y1]], R[t - 1]);
    }
    p.hl(x0, x1 - 1, y0, R[1]); p.vl(x0, y0, y1 - 1, R[1]);
    p.hl(x0 + 1, x1 - 1, y0 + 1, R[Math.min(R.length - 1, t + 1)]); p.vl(x0 + 1, y0 + 1, y1 - 2, R[Math.min(R.length - 1, t + 1)]);
    p.hl(x0 + 1, x1 - 1, y1 - 1, R[t - 1]); p.vl(x1 - 1, y0 + 1, y1 - 1, R[t - 1]);
  }
  // 2. per plate detail
  for (const q of out) {
    const { x0, y0, x1, y1, t, R } = q, w = x1 - x0, h = y1 - y0;
    const hi = R[Math.min(R.length - 1, t + 2)], lo = R[Math.max(0, t - 2)];
    // grime along the bottom of the plate: a ragged band in two steps
    if (o.grime && rnd() < o.grime) {
      const prof = GRIME[Math.floor(rnd() * GRIME.length)], sc = 1 + Math.floor(rnd() * 2);
      let xx = x0 + 2;
      for (let k = 0; xx < x1 - 2; k++) {
        const run = 2 + Math.floor(hh(k, x0, y0) * 4), gh = prof[k % prof.length] * sc;
        for (let i = 0; i < run && xx < x1 - 2; i++, xx++) {
          for (let j = 0; j < gh; j++) p.set(xx, y1 - 2 - j, R[t - 1]);
          if (gh > 2) p.set(xx, y1 - 2, R[Math.max(1, t - 2)]);
        }
      }
    }
    // rivets: top and bottom of the course, down each butt seam
    if (o.rivet) {
      const rv = (x: number, yy: number) => { if (o.bolts) { p.set(x, yy, hi); p.set(x + 1, yy, R[Math.min(R.length - 1, t + 1)]); p.set(x, yy + 1, R[Math.min(R.length - 1, t + 1)]); p.set(x + 1, yy + 1, lo); } else { p.set(x, yy, hi); p.set(x + 1, yy + 1, lo); } };
      for (let x = x0 + 3; x < x1 - 3; x += o.rivet) { rv(x, y0 + 3); rv(x, y1 - 4); }
      for (let yy = y0 + 3 + o.rivet; yy < y1 - 4; yy += o.rivet) { rv(x0 + 3, yy); rv(x1 - 4, yy); }
    } else if (rnd() < 0.6) {
      // a welded seam instead: a bead of alternating lit and dark
      for (let yy = y0 + 1; yy < y1 - 1; yy++) p.set(x0 + 1, yy, (yy & 1) ? R[Math.min(R.length - 1, t + 1)] : R[t - 1]);
    }
    // access panel with screws, sometimes a handle and a tag
    if (o.panels && w > 30 && h > 22 && rnd() < o.panels) {
      const pw = 10 + Math.floor(rnd() * 3) * 4, ph = 8 + Math.floor(rnd() * 2) * 4;
      const px = x0 + 6 + Math.floor(rnd() * Math.max(1, w - pw - 12)), py = y0 + 6 + Math.floor(rnd() * Math.max(1, h - ph - 12));
      p.rect(px, py, pw, ph, R[t]); p.hl(px - 1, px + pw, py - 1, R[1]); p.vl(px - 1, py - 1, py + ph, R[1]);
      p.hl(px, px + pw - 1, py, R[Math.min(R.length - 1, t + 1)]); p.vl(px, py, py + ph - 1, R[Math.min(R.length - 1, t + 1)]);
      p.hl(px, px + pw, py + ph, R[Math.min(R.length - 1, t + 1)]); p.vl(px + pw, py, py + ph, R[Math.min(R.length - 1, t + 1)]);
      p.hl(px + 1, px + pw - 1, py + ph - 1, R[t - 1]);
      for (const [sx, sy] of [[px + 1, py + 1], [px + pw - 2, py + 1], [px + 1, py + ph - 2], [px + pw - 2, py + ph - 2]]) p.set(sx, sy, hi);
      if (rnd() < 0.5) { p.hl(px + (pw >> 1) - 2, px + (pw >> 1) + 1, py + (ph >> 1), R[1]); p.hl(px + (pw >> 1) - 2, px + (pw >> 1) + 1, py + (ph >> 1) - 1, R[Math.min(R.length - 1, t + 1)]); }
      else tiny(p, ['A', 'B', 'C', 'E', 'H', 'K'][Math.floor(rnd() * 6)] + (1 + Math.floor(rnd() * 9)), px + 2, py + 2, R[Math.min(R.length - 1, t + 2)]);
    }
    // a doubler patch bolted over the plate
    if (o.doubler && w > 36 && rnd() < o.doubler) {
      const dw = 14 + Math.floor(rnd() * 10), dh = 10 + Math.floor(rnd() * 8);
      const dx = x0 + 4 + Math.floor(rnd() * (w - dw - 8)), dy = y0 + 4 + Math.floor(rnd() * Math.max(1, h - dh - 8));
      const tt = Math.min(6, t + 1);
      p.rect(dx, dy, dw, dh, R[tt]); p.hl(dx, dx + dw - 1, dy, R[tt + 1]); p.vl(dx, dy, dy + dh - 1, R[tt + 1]);
      p.hl(dx + 1, dx + dw, dy + dh, R[Math.max(1, t - 2)]); p.vl(dx + dw, dy + 1, dy + dh, R[Math.max(1, t - 2)]);
      for (let x = dx + 2; x < dx + dw - 1; x += 3) { p.set(x, dy + 2, R[Math.min(R.length - 1, tt + 1)]); p.set(x, dy + dh - 3, R[t - 1]); }
    }
    // chipped paint at a corner or along the top edge: primer ring, bare steel inside, a shadow under the edge
    if (o.chips && rnd() < o.chips) {
      const n = 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const s = CHIPS[Math.floor(rnd() * CHIPS.length)];
        const edge = rnd();
        const cx = edge < 0.4 ? x0 + 2 + Math.floor(rnd() * 3) : x0 + 4 + Math.floor(rnd() * Math.max(1, w - 10));
        const cy = edge < 0.4 ? y0 + 2 + Math.floor(rnd() * 3) : edge < 0.8 ? y0 + 2 : y1 - 6;
        p.stamp(cx, cy, s, { a: R === PRIMER ? ST[2] : PRIMER[2], b: ST[4], c: R[Math.max(1, t - 2)] });
      }
    }
    // frame number / service mark stencilled near the top of the plate
    if (o.marks && w > 40 && rnd() < o.marks) {
      const kind = rnd();
      const mx = x0 + 5 + Math.floor(rnd() * (w - 34)), my = y0 + 6;
      if (kind < 0.55) tiny(p, 'FR ' + (20 + Math.floor(rnd() * 180)), mx, my, PA[1]);
      else if (kind < 0.8) { p.rect(mx, my, 16, 3, RD[2]); p.rect(mx + 16, my, 4, 3, PA[2]); }
      else { p.rect(mx, my, 3, 7, BR[3]); tiny(p, String(1 + Math.floor(rnd() * 9)) + '-' + Math.floor(rnd() * 90 + 10), mx + 5, my + 1, PA[1]); }
    }
  }
  // 3. rust weeping from the bottom rivet line, across the seam, down the plate below
  if (o.rust) for (const q of out) {
    if (rnd() > o.rust) continue;
    const { x0, x1, y1, t } = q, n = 1 + Math.floor(rnd() * 2);
    for (let k = 0; k < n; k++) {
      const sx = x0 + 3 + Math.floor(rnd() * Math.max(1, (x1 - x0 - 6) / (o.rivet || 4))) * (o.rivet || 4), sy = y1 - 4;
      const L = 10 + Math.floor(rnd() * 30);
      p.set(sx, sy, RU[3]); p.set(sx + 1, sy, RU[2]); p.set(sx, sy + 1, RU[2]); p.set(sx + 1, sy + 1, RU[1]);
      let wide = 2;
      for (let j = 2; j < L; j++) {
        if (j > L * 0.4) wide = 1;
        if (hh(sx, j, 7) < 0.08) continue;
        const c = j < L * 0.5 ? RU[1] : (q.R[Math.max(1, t - 1)]);
        for (let i = 0; i < wide; i++) p.set(sx + i, sy + j, c);
      }
    }
  }
  return out;
}

/** louvre, grille or exhaust cells */
function vent(p: P, x: number, y: number, w: number, h: number, kind: number, R: readonly number[]) {
  p.bev(x, y, w, h, R[2], R[5], R[1]);
  if (kind === 0) for (let yy = y + 2; yy < y + h - 2; yy += 3) { p.hl(x + 2, x + w - 3, yy, R[4]); p.hl(x + 2, x + w - 3, yy + 1, R[1]); p.hl(x + 2, x + w - 3, yy + 2, INK[0]); }
  else if (kind === 1) for (let yy = y + 2; yy < y + h - 2; yy += 2) for (let xx = x + 2; xx < x + w - 2; xx += 2) { p.set(xx, yy, INK[0]); p.set(xx + 1, yy, R[3]); }
  else { p.rect(x + 3, y + 3, w - 6, h - 6, INK[0]); for (let xx = x + 4; xx < x + w - 4; xx += 3) p.vl(xx, y + 3, y + h - 4, R[1]); p.hl(x + 3, x + w - 4, y + 3, R[4]); }
}

export interface CarrierAtlas { sheet: Sheet; skin(name: string, ppm?: number, bucket?: string): Skin; regs: Map<string, { x: number; y: number; w: number; h: number }> }

let cached: { d: Uint8Array; e: Uint8Array; regs: Map<string, { x: number; y: number; w: number; h: number; tile: boolean }> } | null = null;

/** paint the whole sheet (cached: the pixels are the same every time; textures are made per carrier) */
export function paintAtlas() {
  if (cached) return cached;
  const S = new Sheet();
  // ---------------------------------------------------------------- shelf 1: the big hull plates (16 px per metre)
  const hullA = S.alloc('hullA', 1008, 512);
  plates(hullA, { R: HULL, base: 6, seed: 11, courses: [40, 48, 44, 52, 44, 40, 56, 48, 40, 48, 52], widths: [96, 112, 128, 144, 160, 176, 80, 104], rivet: 4, alt: BLUE, altP: 0.04, twins: [RAMPS.stone[4], SL[4], RAMPS.iron[4], ST[4]], facet: 0.3, chips: 0.45, rust: 0.3, grime: 0.6, panels: 0.3, marks: 0.2, doubler: 0.12, primer: 1 });
  const hullB = S.alloc('hullB', 1008, 512);
  plates(hullB, { R: ARMOR, base: 6, seed: 23, courses: [64, 56, 72, 64, 48, 80, 64, 64], widths: [128, 160, 192, 144, 224], rivet: 6, bolts: true, twins: [RAMPS.stone[3], RAMPS.iron[3], SL[3]], facet: 0.35, chips: 0.5, rust: 0.45, grime: 0.8, panels: 0.12, marks: 0.14, doubler: 0.16 });
  // ---------------------------------------------------------------- shelf 2
  const olive = S.alloc('olive', 1008, 256);
  plates(olive, { R: OLV, base: 4, seed: 5, courses: [28, 36, 32, 40, 28, 36, 32, 24], widths: [32, 40, 48, 56, 64, 72], rivet: 4, facet: 0.25, chips: 0.5, rust: 0.08, grime: 0.5, panels: 0.22, marks: 0.1, doubler: 0.04 });
  const scorch = S.alloc('scorch', 496, 256);
  plates(scorch, { R: ARMOR, base: 5, seed: 41, courses: [32, 32, 32, 32, 32, 32, 32, 32], widths: [48, 64, 80], rivet: 6, bolts: true, facet: 0.3, chips: 0.2, rust: 0.1, grime: 0.6 });
  {
    // soot and heat: row 0 is the hot (aft) end. broad tongues of soot licking forward (their front drawn as a
    // max of hand-sized parabolic lobes, banded in three steps, the edge broken by a pixel), heat-tint bands at
    // the hot end, a few soot runs past the front, and bare metal polished through where the exhaust scours
    const p = scorch, rnd = rng(77), W = p.w;
    const lobes: [number, number, number][] = [];
    for (let x = 0; x < W + 60;) { const w = 26 + Math.floor(rnd() * 50), L = 50 + Math.floor(rnd() * 150); lobes.push([x, w, L]); x += Math.floor(w * (0.45 + rnd() * 0.3)); }
    const D = (x: number) => { let d = 18; for (const [cx, w, L] of lobes) for (const o of [-W, 0, W]) { const u = (x - cx - o) / (w / 2); if (Math.abs(u) < 1) d = Math.max(d, L * (1 - u * u)); } return d; };
    for (let x = 0; x < W; x++) {
      const d = D(x) + (hh(x >> 1, 3, 77) < 0.3 ? 1 : 0) - (hh(x >> 2, 4, 77) < 0.25 ? 2 : 0);
      for (let y = 0; y < d; y++) {
        const k = y / d;
        if (k < 0.32) p.set(x, y, k < 0.12 ? INK[0] : ST[0]);
        else if (k < 0.62) p.set(x, y, (x + (y >> 1)) % 7 === 0 ? ST[0] : ST[1]);
        else p.shift(x, y, ARMOR, -1);
      }
    }
    for (let k = 0; k < 14; k++) { const sx = Math.floor(rnd() * W), d = D(sx), L = 12 + Math.floor(rnd() * 40); for (let y = Math.floor(d) - 2; y < d + L; y++) { p.set(sx, y, y < d + L * 0.5 ? ST[1] : ST[2]); if (y < d + L * 0.3) p.set(sx + 1, y, ST[1]); } }
    for (let x = 0; x < W; x++) {
      const b = 7 + (hh(x >> 4, 1, 9) < 0.5 ? 1 : 0) + (hh(x >> 3, 5, 9) < 0.3 ? 1 : 0);
      for (let y = 0; y < b; y++) p.set(x, y, y < 2 ? INK[0] : y < 4 ? RU[1] : y < 6 ? BR[1] : RU[0]);
    }
    for (let k = 0; k < 9; k++) { const sx = Math.floor(rnd() * W), sy = 10 + Math.floor(rnd() * 26), w = 4 + Math.floor(rnd() * 8); for (let j = 0; j < 3; j++) p.hl(sx + j, sx + w - j, sy + j, j === 0 ? ST[4] : ST[3]); }
  }
  const deck = S.alloc('deck', 496, 256);
  {
    const p = deck;
    plates(p, { R: ARMOR, base: 5, seed: 61, courses: [64, 64, 64, 64], widths: [32, 48, 64], facet: 0.2, chips: 0.2, grime: 0.3, panels: 0.06, rust: 0.03 });
    // tie-down points on a 2 m grid, a painted guide line, tyre scuffs
    for (let y = 16; y < p.h; y += 32) for (let x = 16; x < p.w; x += 32) p.stamp(x - 2, y - 2, ['.a.', 'aba', '.a.'], { a: ARMOR[1], b: ARMOR[6] });
    for (let x = 0; x < p.w; x++) if ((x >> 3) % 3 !== 2) for (let y = 126; y < 129; y++) if (hh(x >> 1, y, 4) > 0.08) p.set(x, y, y === 128 ? BR[2] : BR[3]);
    for (let k = 0; k < 6; k++) { const sx = Math.floor(hh(k, 1, 6) * p.w), sy = Math.floor(hh(k, 2, 6) * p.h); for (let i = 0; i < 40; i++) { const xx = sx + i, yy = sy + Math.round(Math.sin(i * 0.09 + k) * 6); p.set(xx, yy, ARMOR[2]); p.set(xx, yy + 3, ARMOR[2]); } }
  }
  // ---------------------------------------------------------------- shelf 3: machinery skins
  S.shelf();
  const rad = S.alloc('radiator', 256, 128);
  {
    const p = rad;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const f = y % 4;
      p.set(x, y, f === 0 ? SL[3] : f === 1 ? SL[2] : f === 2 ? SL[1] : SL[0]);
    }
    for (let x = 0; x < p.w; x += 32) for (let y = 0; y < p.h; y++) { p.set(x, y, BR[1]); p.set(x + 1, y, BR[3]); p.set(x + 2, y, BR[2]); p.set(x + 3, y, INK[1]); }
    for (let y = 0; y < p.h; y += 64) for (let x = 0; x < p.w; x++) { p.set(x, y, ST[2]); p.set(x, y + 1, ST[4]); p.set(x, y + 2, ST[1]); }
    for (let x = 4; x < p.w; x += 64) tiny(p, 'C' + (x >> 6), x + 6, 6, ST[3]);
    // heat creeping out from the header pipes: one tint step, drawn as tapering runs
    for (let x = 0; x < p.w; x += 32) for (let y = 0; y < p.h; y++) { const run = 3 + Math.floor(hh(x, y >> 2, 3) * 4); for (let i = 4; i < 4 + run; i++) if (y % 4 === 1) p.set(x + i, y, RU[0]); }
  }
  const tank = S.alloc('tank', 256, 128);
  {
    // a sphere unwrapped pole to pole (v fits the sphere once): cream gores, weld rings, the red equator band
    const p = tank, rnd = rng(8);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, CREAM[5]);
    for (let g = 0; g < 8; g++) {
      const x0 = g * 32, tone = [5, 6, 5, 4, 5, 6, 4, 5][g];
      p.rect(x0, 0, 32, p.h, CREAM[tone]);
      p.poly([[x0 + 20, 20], [x0 + 32, 30], [x0 + 32, 98], [x0 + 22, 108]], CREAM[tone - 1]);
      p.vl(x0, 0, p.h - 1, CREAM[2]); p.vl(x0 + 1, 0, p.h - 1, CREAM[7]);
    }
    for (const yy of [32, 96]) for (let x = 0; x < p.w; x++) { p.set(x, yy, CREAM[3]); p.set(x, yy + 1, (x & 1) ? CREAM[7] : CREAM[4]); }
    for (let y = 58; y < 70; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y === 58 ? RD[3] : y === 69 ? RD[0] : y < 61 ? RD[3] : RD[2]);
    for (let x = 6; x < p.w; x += 128) stencil(p, 'LH2', x + 8, 61, 1, PA[4], { bridges: false, wear: 0.02 });
    for (let y = 0; y < 6; y++) for (let x = 0; x < p.w; x++) { p.set(x, y, y < 3 ? ST[2] : ST[4]); p.set(x, p.h - 1 - y, y < 3 ? ST[2] : ST[3]); }
    for (let k = 0; k < 10; k++) { const s = CHIPS[k % CHIPS.length]; p.stamp(Math.floor(rnd() * p.w), 34 + Math.floor(rnd() * 20), s, { a: ST[4], b: ST[5], c: CREAM[2] }); }
    for (let k = 0; k < 8; k++) { const sx = Math.floor(rnd() * p.w); for (let j = 0; j < 10 + rnd() * 14; j++) p.set(sx, 70 + j, j < 6 ? RD[1] : CREAM[3]); }
  }
  const ctank = S.alloc('ctank', 256, 128);
  plates(ctank, { R: CREAM, base: 5, seed: 17, courses: [32, 32, 32, 32], widths: [64, 64, 128], rivet: 0, facet: 0.4, chips: 0.25, grime: 0.15 });
  for (let x = 0; x < 256; x++) for (let y = 60; y < 68; y++) ctank.set(x, y, y === 60 ? RD[3] : y === 67 ? RD[0] : RD[2]);
  for (let x = 20; x < 256; x += 128) stencil(ctank, 'LH2', x, 61, 1, PA[4], { bridges: false, wear: 0 });
  const truss = S.alloc('truss', 64, 64);
  plates(truss, { R: HULL, base: 6, seed: 31, courses: [16, 16, 16, 16], widths: [16, 24, 32], rivet: 3, facet: 0, chips: 0.2, rust: 0.15, grime: 0.3 });
  const gunT = S.alloc('gunT', 64, 64);
  plates(gunT, { R: ARMOR, base: 5, seed: 37, courses: [16, 16, 16, 16], widths: [24, 32, 40, 48], rivet: 3, facet: 0, chips: 0.3, rust: 0.25, grime: 0.4 });
  const nozzle = S.alloc('nozzle', 128, 128);
  {
    // bell outside, throat (row 0) to lip: heat bands, ring stiffeners, soot at the lip
    const p = nozzle;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const k = y / p.h;
      const c = k < 0.06 ? RU[2] : k < 0.12 ? BR[2] : k < 0.2 ? BR[1] : k < 0.3 ? RU[1] : k < 0.85 ? ST[2 + ((x >> 2) % 2)] : k < 0.93 ? ST[1] : INK[0];
      p.set(x, y, c);
    }
    for (let y = 16; y < p.h - 12; y += 16) for (let x = 0; x < p.w; x++) { p.set(x, y, ST[1]); p.set(x, y + 1, ST[4]); p.set(x, y + 2, ST[3]); }
    for (let x = 0; x < p.w; x += 4) for (let y = 30; y < 108; y++) if (hh(x, y >> 3, 5) < 0.4) p.set(x, y, ST[1]);
  }
  const nozIn = S.alloc('nozIn', 64, 128);
  {
    // bell inside: the coolant tube wall glowing from the throat (emissive), banded, not graded
    const p = nozIn;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const k = y / p.h, tube = x % 3 === 0;
      const band = k < 0.08 ? 4 : k < 0.16 ? 3 : k < 0.28 ? 2 : k < 0.45 ? 1 : 0;
      const c = band > 0 ? AM[Math.max(0, band - (tube ? 1 : 0))] : tube ? ST[0] : ST[1];
      p.set(x, y, c, band > 0 ? [0, 70, 130, 200, 255][band] : 0);
    }
  }
  const pipes = ['pipeRed', 'pipeBrass', 'pipeOlive', 'pipeSteel'];
  const pipeR: [readonly number[], number][] = [[[INK[0], RD[0], RD[1], RD[2], RD[3], RU[4]], 3], [[INK[0], BR[0], BR[1], BR[2], BR[3], BR[4]], 3], [[INK[0], OL[1], OL[2], OL[3], OL[4], OL[5]], 3], [[INK[0], ST[1], ST[2], ST[3], ST[4], ST[5]], 3]];
  pipes.forEach((n, i) => {
    const p = S.alloc(n, 32, 64), [R, b] = pipeR[i];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) p.set(x, y, R[b]);
    for (let y = 0; y < 64; y += 32) { p.rect(0, y, 32, 3, R[b - 1]); p.hl(0, 31, y, R[1]); p.hl(0, 31, y + 3, R[b + 1]); }
    for (let y = 14; y < 18; y++) for (let x = 0; x < 32; x++) p.set(x, y, y === 14 || y === 17 ? PA[2] : i === 0 ? PA[4] : RD[3]);
    for (let y = 40; y < 64; y += 5) p.set(8 + (y % 3), y, R[b - 1]);
  });
  const grate = S.alloc('grate', 32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) grate.set(x, y, (x % 4 === 0 || y % 4 === 0) ? (y % 4 === 0 ? ST[4] : ST[3]) : INK[0]);
  // container sides: corrugated, a frame, the owner's stencil
  const conts: [string, readonly number[], string][] = [['contOlive', OLV, 'USPC 4471'], ['contRust', PRIMER, 'USPC 2038'], ['contBlue', BLUE, 'USPC 0915']];
  for (const [n, R, label] of conts) {
    const p = S.alloc(n, 128, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) { const f = x % 6; p.set(x, y, R[f < 2 ? 5 : f < 4 ? 4 : 3]); }
    p.rect(0, 0, 128, 4, R[2]); p.hl(0, 127, 0, R[5]); p.rect(0, 60, 128, 4, R[2]); p.hl(0, 127, 63, R[1]);
    p.rect(0, 0, 4, 64, R[2]); p.rect(124, 0, 4, 64, R[2]);
    p.rect(16, 18, 66, 11, R[2]);
    stencil(p, label, 18, 20, 1, PA[4], { bridges: false, wear: 0.04, seed: label.length });
    for (let k = 0; k < 5; k++) { const sx = 10 + Math.floor(hh(k, 3, R[3]) * 108); for (let j = 4; j < 14 + k * 3; j++) p.set(sx, j, RU[1]); }
  }
  // small solid cells: lenses, glow, dark, brass, steel, rubber
  const cell = (n: string, c: number, em = 0) => { const p = S.alloc(n, 16, 16, 'cell'); p.rect(0, 0, 16, 16, c, em); };
  cell('lensAmber', AM[4], 255); cell('lensRed', RD[3], 255); cell('lensGreen', RAMPS.glowTeal[2], 255); cell('lensWhite', PA[5], 255); cell('glow', AM[3], 230);
  cell('dark', INK[0]); cell('steelC', ST[4]); cell('brassC', BR[4]); cell('rubber', INK[2]); cell('gunC', ST[2]); cell('redC', RD[2]); cell('oliveC', OL[3]);
  cell('glass', SL[1]); cell('creamC', CREAM[5]); cell('ochreC', RAMPS.ochre[4]);
  // ---------------------------------------------------------------- shelf 4: lights and stripes (v fits the band)
  S.shelf();
  const winBand = (n: string, seed: number, w: number, h: number, kind: 'office' | 'bridge' | 'hab') => {
    const p = S.alloc(n, w, h), rnd = rng(seed);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, kind === 'hab' ? OLV[3] : HULL[4]);
    const ww = kind === 'bridge' ? 22 : kind === 'hab' ? 10 : 12, gap = kind === 'bridge' ? 3 : 6, wh = h - (kind === 'bridge' ? 6 : 8);
    for (let x0 = 2; x0 + ww <= w; x0 += ww + gap) {
      const y0 = kind === 'bridge' ? 3 : 4, r = rnd();
      const state = r < 0.12 ? 'dark' : r < 0.3 ? 'blind' : r < 0.45 ? 'dim' : 'lit';
      // frame
      p.rect(x0 - 1, y0 - 1, ww + 2, wh + 2, INK[1]);
      for (let y = y0; y < y0 + wh; y++) for (let x = x0; x < x0 + ww; x++) {
        let c = AM[3], e = 210;
        if (kind === 'bridge') {
          const yy = y - y0;
          c = yy < 2 ? AM[4] : yy < 4 ? AM[2] : yy < wh - 9 ? ((x - x0) % 11 < 1 ? AM[0] : AM[1]) : AM[2];
          e = yy < 2 ? 255 : yy < 4 ? 140 : yy < wh - 9 ? 70 : 120;
          if (state === 'dark') { c = (x - x0 + yy) % 9 === 3 ? SL[3] : SL[0]; e = 0; }
          p.set(x, y, c, e); continue;
        }
        if (state === 'dark') { c = (x - x0 + y - y0) === 3 ? SL[3] : SL[0]; e = 0; }
        else if (state === 'dim') { c = y - y0 < 2 ? AM[3] : AM[2]; e = 150; }
        else if (state === 'blind') { c = (y - y0) % 2 ? AM[2] : AM[3]; e = 170; }
        else { c = y - y0 < 2 ? AM[4] : y - y0 > wh - 4 ? AM[2] : AM[3]; e = y - y0 < 2 ? 255 : 220; }
        p.set(x, y, c, e);
      }
      // what is inside: a figure, a console, a lamp
      if (state === 'lit' || state === 'dim') {
        const k = rnd();
        if (k < 0.35) { const fx = x0 + 2 + Math.floor(rnd() * (ww - 6)); p.stamp(fx, y0 + wh - 8, ['.##.', '.##.', '####', '####', '####', '####', '####', '####'], { '#': AM[0] }, { '#': 30 }); }
        else if (k < 0.65) p.rect(x0, y0 + wh - 3, ww, 3, AM[1], 40);
        if (kind === 'bridge') {
          p.rect(x0, y0 + wh - 6, ww, 6, INK[2], 0); for (let x = x0; x < x0 + ww; x++) p.set(x, y0 + wh - 7, AM[3], 160);
          for (let x = x0 + 2; x < x0 + ww - 2; x += 3) p.set(x, y0 + wh - 4, [RD[3], RAMPS.glowTeal[3], AM[4], AM[3]][(x * 7 + x0) % 4], 255);
          if (rnd() < 0.6) { const fx = x0 + 3 + Math.floor(rnd() * (ww - 8)); p.stamp(fx, y0 + wh - 15, ['.##.', '####', '.##.', '####', '####', '####', '####', '####', '####'], { '#': INK[1] }, { '#': 0 }); }
        }
      }
      // sill and lintel
      p.hl(x0 - 1, x0 + ww, y0 + wh + 1, HULL[7]); p.hl(x0 - 1, x0 + ww, y0 - 2, HULL[2]);
    }
    return p;
  };
  winBand('winA', 3, 256, 24, 'office'); winBand('winB', 9, 256, 24, 'office'); winBand('winBridge', 5, 256, 40, 'bridge'); winBand('winHab', 12, 128, 20, 'hab');
  {
    const p = S.alloc('port', 64, 16), rnd = rng(4);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) p.set(x, y, HULL[5]);
    for (let k = 0; k < 4; k++) {
      const x0 = k * 16 + 3, lit = rnd() > 0.25;
      p.stamp(x0, 3, ['..aaaa..', '.abbbba.', 'abccccbd', 'abccccbd', 'abceecbd', 'abceecbd', '.dbbbbd.', '..dddd..'],
        { a: BR[4], b: BR[2], d: BR[1], c: lit ? AM[3] : SL[0], e: lit ? AM[4] : SL[1] }, { c: lit ? 220 : 0, e: lit ? 255 : 0, a: 0, b: 0, d: 0 });
      p.set(x0 + 2, 5, lit ? AM[4] : SL[3], lit ? 255 : 0);
    }
  }
  const stripes = (n: string, a: number, b: number, w = 64, h = 16) => {
    const p = S.alloc(n, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.set(x, y, ((x + y) % 16) < 8 ? a : b);
    p.hl(0, w - 1, 0, INK[1]); p.hl(0, w - 1, h - 1, INK[0]);
    for (let k = 0; k < 4; k++) p.stamp(Math.floor(hh(k, 1, w) * w), 2 + Math.floor(hh(k, 2, w) * (h - 6)), CHIPS[k % CHIPS.length], { a: ST[3], b: ST[4], c: INK[1] });
    return p;
  };
  stripes('haz', BR[4], INK[1]); stripes('hazRed', RD[3], PA[4]);
  {
    // numbered hatches (3 m) and a docking collar face
    for (let n = 1; n <= 8; n++) {
      const p = S.alloc('hatch' + n, 48, 48, 'cell'), R = n > 4 ? OLV : HULL.slice(1);
      p.rect(0, 0, 48, 48, R[4]);
      p.bev(0, 0, 48, 48, R[3], R[6], R[1]); p.bev(3, 3, 42, 42, R[4], R[5], R[2]);
      p.rect(4, 4, 40, 3, R[2]); for (const hx of [8, 34]) { p.bev(hx, 4, 6, 5, ST[3], ST[5], ST[1]); }
      if (n % 3 === 0) for (let i = 0; i < 48; i++) for (const yy of [0, 1, 46, 47]) p.set(i, yy, ((i + yy) % 8) < 4 ? BR[4] : INK[1]);
      stencil(p, String(n), 17, 13, 3, PA[4], { wear: 0.05, seed: n });
      p.hl(18, 29, 38, R[1]); p.hl(18, 29, 37, R[6]); p.set(17, 37, R[1]); p.set(30, 37, R[1]);
    }
    for (let k = 0; k < 3; k++) { const p = S.alloc('vent' + k, 48, 32, 'cell'); p.rect(0, 0, 48, 32, HULL[5]); vent(p, 1, 1, 46, 30, k, HULL.slice(1)); }
    const d = S.alloc('dockFace', 64, 64, 'cell');
    d.rect(0, 0, 64, 64, HULL[5]);
    d.poly([[20, 2], [44, 2], [62, 20], [62, 44], [44, 62], [20, 62], [2, 44], [2, 20]], ST[3]);
    d.poly([[22, 6], [42, 6], [58, 22], [58, 42], [42, 58], [22, 58], [6, 42], [6, 22]], ST[2]);
    d.poly([[24, 12], [40, 12], [52, 24], [52, 40], [40, 52], [24, 52], [12, 40], [12, 24]], OLV[4]);
    for (let a = 0; a < 8; a++) { const x = 32 + Math.cos(a * Math.PI / 4) * 24, y = 32 + Math.sin(a * Math.PI / 4) * 24; d.rect(x - 1, y - 1, 3, 3, BR[4]); d.set(x + 1, y + 1, BR[1]); }
    for (let i = 0; i < 64; i++) for (const yy of [0, 63]) d.set(i, yy, ((i + yy) % 8) < 4 ? BR[4] : INK[1]);
    stencil(d, 'DOCK', 21, 27, 1, PA[4], { bridges: false, wear: 0 });
  }
  // ---------------------------------------------------------------- shelf 5: decals (transparent)
  S.shelf();
  const words: [string, string, number, number][] = [
    ['tCorps', 'UNITED STATES PLANETARY CORPS', 3, PA[4]], ['tName', 'U.S.S. VANGUARD', 4, PA[4]], ['tVanguard', 'VANGUARD', 6, PA[4]],
    ['tHull', 'CVS-01', 8, PA[4]], ['t01', '01', 10, PA[4]], ['tUSPC', 'U.S.P.C.', 6, PA[4]], ['tNoStep', 'NO STEP', 2, RD[3]],
    ['tBay', 'LAUNCH BAY 2', 3, PA[4]], ['tDanger', 'DANGER - KEEP CLEAR', 2, RD[3]], ['tLH2', 'LH2', 4, RD[3]], ['tReactor', 'REACTOR - NO ENTRY', 3, BR[4]],
    ['tRad', 'RADIATION AREA', 2, BR[4]], ['tHab', 'HAB RING - ROTATING', 2, PA[4]], ['tDock1', 'DOCK 1', 3, PA[4]], ['tDock2', 'DOCK 2', 3, PA[4]],
    ['tAir', 'AIRLOCK', 2, PA[4]], ['tFwd', 'FWD >', 2, PA[3]], ['tBlast', 'CAUTION - EXHAUST', 2, RD[3]], ['tProp', 'PROPELLANT - LH2', 2, PA[4]],
    ['t2', '2', 8, PA[4]], ['t3', '3', 6, PA[4]], ['t4', '4', 6, PA[4]], ['t5', '5', 6, PA[4]], ['t6', '6', 6, PA[4]], ['tPC1', 'PC-1', 3, PA[4]], ['tPC2', 'PC-2', 3, PA[4]], ['tPC3', 'PC-3', 3, PA[4]],
  ];
  for (const [n, s, sc, c] of words) {
    const w = textWidth(s, sc) + 2, h = 7 * sc + 2;
    const p = S.alloc(n, w, h, 'decal');
    stencil(p, s, 1, 1, sc, c, { wear: sc >= 4 ? 0.05 : 0.03, seed: n.length * 7 + sc });
  }
  {
    // the national insignia: star and bars, with the red stripe (no gradients; the disc is drawn, not computed soft)
    const W = 128, H = 56, p = S.alloc('insignia', W, H, 'decal'), cx = W / 2 - 0.5, cy = H / 2 - 0.5, R = 24.5;
    const blue = SL[1], white = PA[4], red = RD[3];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dy = Math.abs(y - cy);
      if (dy < 11 && Math.abs(x - cx) < 62) p.set(x, y, dy > 9 ? blue : dy < 3 ? red : white);
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - cx, y - cy); if (d < R) p.set(x, y, d > R - 2 ? INK[1] : blue); }
    const star: [number, number][] = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 8.8 : 22.5; star.push([cx + 0.5 + Math.cos(a) * r, cy + 0.5 + Math.sin(a) * r]); }
    p.poly(star, white);
    for (let k = 0; k < 9; k++) { const x = Math.floor(hh(k, 5, 1) * W), y = Math.floor(hh(k, 6, 1) * H); if (p.get(x, y) >= 0) { p.clear(x, y); p.clear(x + 1, y); p.clear(x, y + 1); } }
  }
  {
    // the unit patch: Unit 07's machine-golem badge (a shield, a gear, "07")
    const p = S.alloc('patch', 48, 56, 'decal');
    p.poly([[2, 2], [46, 2], [46, 34], [24, 54], [2, 34]], INK[1]);
    p.poly([[5, 5], [43, 5], [43, 33], [24, 50], [5, 33]], OL[3]);
    p.poly([[5, 5], [43, 5], [43, 14], [5, 14]], RD[2]);
    stencil(p, 'USPC', 9, 7, 1, PA[4], { bridges: false, wear: 0 });
    for (let a = 0; a < 8; a++) { const x = 24 + Math.cos(a * Math.PI / 4) * 10, y = 31 + Math.sin(a * Math.PI / 4) * 10; p.rect(Math.round(x) - 2, Math.round(y) - 2, 4, 4, BR[4]); }
    p.poly([[16, 23], [32, 23], [32, 39], [16, 39]], BR[3]); p.poly([[19, 26], [29, 26], [29, 36], [19, 36]], OL[2]);
    stencil(p, '07', 19, 28, 1, PA[4], { bridges: false, wear: 0 });
  }
  S.gutters();
  const regs = new Map<string, { x: number; y: number; w: number; h: number; tile: boolean }>();
  for (const [k, r] of S.regs) regs.set(k, { x: r.x, y: r.y, w: r.w, h: r.h, tile: r.tile });
  cached = { d: S.d, e: S.e, regs };
  if ((globalThis as any).__carrierAtlasDebug) console.log('carrier atlas used', (S.used() * 100).toFixed(0) + '%');
  return cached;
}

/** a skin for a region: ppm = texels per metre (tiles), bucket = the material group */
export function makeSkins(regs: Map<string, { x: number; y: number; w: number; h: number; tile: boolean }>) {
  const memo = new Map<string, Skin>();
  return (name: string, ppm = 16, bucket = 'm'): Skin => {
    const key = name + '|' + ppm + '|' + bucket;
    let s = memo.get(key); if (s) return s;
    const r = regs.get(name); if (!r) throw new Error('carrier atlas: no region ' + name);
    s = { r: [r.x / AW, r.y / AH, r.w / AW, r.h / AH], su: ppm / r.w, sv: ppm / r.h, b: bucket };
    memo.set(key, s);
    return s;
  };
}
export const ATLAS_SIZE = [AW, AH] as const;
