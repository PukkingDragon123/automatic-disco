// The carrier's texture atlas: pixel art painted texel by texel from the master palette, at ONE density for the
// whole ship (PPM texels per metre, 25 cm pixels): at the main menu's framing a texel is 1.5-2.5 screen pixels,
// so the hull reads as deliberate pixel art, and up close the pixels simply get bigger. Every mark is drawn at
// that scale: plates in lapped courses, each plate one ramp step with a dark seam, a lit edge dotted with rivet
// heads and a shadowed lap, a dished plate's facet here and there, chipped paint showing red-oxide primer and
// bare steel at the knocks, rust weeping a few pixels down from the seams, grime gathered along the bottom of a
// course in drawn clusters, access panels and bolted doublers. Olive superstructure, gunmetal armour, the sooted
// engine plate, radiator fins, cream propellant tanks with their red bands, colour-coded pipes, lit window bands
// and portholes (emissive), bridge glazing with the watch officers against their consoles, hazard stripes,
// numbered hatches, louvres, container sides, nozzle bells, lamp lenses, and the stencilled lettering, the
// star-and-bar and Unit 07's badge as decals. Procedural code only places and varies these drawn motifs.
import { Sheet, P, hh, rng, stencil, textWidth, AW, AH, SL, ST, OL, BR, RD, AM, RU, PA, INK } from './paint';
import { RAMPS } from '../../art/palette';
import type { Skin } from './geo';

/** texels per metre, everywhere on the ship */
export const PPM = 4;

// composite ramps, dark -> light (cool shadows, warm lights)
export const HULL = [INK[1], SL[0], SL[1], SL[2], ST[2], ST[3], ST[4], ST[5], ST[6]];
export const BLUE = [INK[1], SL[0], SL[1], SL[2], SL[3], SL[4], SL[5], ST[6]];
export const ARMOR = [INK[0], ST[0], ST[1], SL[1], SL[2], ST[2], ST[3], ST[4], ST[5]];
export const OLV = [INK[1], OL[0], OL[1], OL[2], OL[3], OL[4], OL[5], RAMPS.straw[3]];
export const CREAM = [SL[1], ST[2], ST[3], PA[0], PA[1], PA[2], PA[3], PA[4]];
const PRIMER = [RU[0], RU[1], RU[2], RU[3], RU[3], RU[4], RU[4], RU[5]];

// ------------------------------------------------------------------ a 3x5 face for small stencils and tags
const F3: Record<string, string> = {
  0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###', 3: '##.|..#|.#.|..#|##.', 4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.',
  6: '.##|#..|###|#.#|###', 7: '###|..#|..#|.#.|.#.', 8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.', '-': '...|...|###|...|...', ' ': '..|..|..|..|..',
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.', E: '###|#..|##.|#..|###', F: '###|#..|##.|#..|#..',
  H: '#.#|#.#|###|#.#|#.#', K: '#.#|#.#|##.|#.#|#.#', L: '#..|#..|#..|#..|###', N: '#.#|###|###|###|#.#', O: '.#.|#.#|#.#|#.#|.#.', P: '##.|#.#|##.|#..|#..',
  R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.', T: '###|.#.|.#.|.#.|.#.', V: '#.#|#.#|#.#|.#.|.#.', X: '#.#|#.#|.#.|#.#|#.#', '.': '.|.|.|.|#', '/': '..#|..#|.#.|#..|#..',
  G: '.##|#..|#.#|#.#|.##', I: '###|.#.|.#.|.#.|###', M: '#.#|###|###|#.#|#.#', U: '#.#|#.#|#.#|#.#|.##', W: '#.#|#.#|###|###|#.#', Y: '#.#|#.#|.#.|.#.|.#.', Z: '###|..#|.#.|#..|###',
};
const G3 = new Map<string, string[]>(Object.entries(F3).map(([k, v]) => [k, v.split('|')]));
export function tinyWidth(s: string) { let w = 0; for (const ch of s.toUpperCase()) w += (G3.get(ch)?.[0].length ?? 3) + 1; return w - 1; }
/** 3x5 stencil text; with a shadow colour each stroke drops a 1 px shade below it */
export function tiny(p: P, s: string, x: number, y: number, c: number, em = -1, shadow = -1) {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    const g = G3.get(ch) ?? G3.get(' ')!;
    for (let j = 0; j < 5; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i] === '#') { if (shadow >= 0 && g[j + 1]?.[i] !== '#') p.set(cx + i, y + j + 1, shadow); p.set(cx + i, y + j, c, em); }
    cx += g[0].length + 1;
  }
  return cx - 1;
}

// ------------------------------------------------------------------ marks drawn by hand (3+ variants each)
// a = primer ring, b = bare steel, c = the paint edge's shadow
const CHIPS = [['ab', '.c'], ['aa', 'bc'], ['ab.', '.ac'], ['.a', 'ab', '.c'], ['aab', '..c']];
// grime along a course bottom: alternating run lengths and heights (0..2 px)
const GRIME = [[3, 1, 2, 0, 4, 1, 2, 2, 3, 0], [2, 2, 5, 1, 1, 0, 3, 1, 2, 2], [4, 1, 1, 2, 2, 1, 3, 0, 2, 1], [1, 2, 3, 1, 2, 0, 2, 2, 4, 1]];

interface PlateOpts {
  R: readonly number[]; base: number; seed: number;
  courses: number[]; widths: number[];
  rivets?: boolean; twins?: number[]; alt?: readonly number[]; altP?: number;
  facet?: number; chips?: number; rust?: number; grime?: number; panels?: number; marks?: number; doubler?: number; primer?: number;
}
interface Plate { x0: number; y0: number; x1: number; y1: number; t: number; R: readonly number[]; fill: number }

/** steel plate in lapped courses: the shared painter behind every hull skin (one texel = 25 cm) */
function plates(p: P, o: PlateOpts) {
  const rnd = rng(o.seed), R0 = o.R, out: Plate[] = [], top = (R: readonly number[]) => R.length - 1;
  let y = 0;
  for (const ch of o.courses) {
    const start = Math.floor(rnd() * 12);
    let x = start;
    while (x < start + p.w) {
      let w = o.widths[Math.floor(rnd() * o.widths.length)];
      if (start + p.w - (x + w) < 6) w = start + p.w - x;
      const r = rnd();
      const R = o.alt && r < (o.altP ?? 0) ? o.alt : r > 0.988 && o.primer ? PRIMER : R0;
      const t = R === R0 ? (r < 0.7 ? o.base : r < 0.8 ? o.base - 1 : r < 0.88 ? o.base + 1 : o.base) : R === PRIMER ? 2 : o.base - 1;
      const fill = R === R0 && o.twins && r >= 0.88 ? o.twins[Math.floor(rnd() * o.twins.length)] : -1;
      out.push({ x0: x, y0: y, x1: x + w, y1: y + ch, t, R, fill });
      x += w;
    }
    y += ch;
  }
  // 1. fill, dished facets, seams, the lit lap edge (dotted with rivet heads), the shadow under it
  for (const q of out) {
    const { x0, y0, x1, y1, t, R } = q, w = x1 - x0, h = y1 - y0, T = top(R);
    p.rect(x0, y0, w, h, q.fill >= 0 ? q.fill : R[t]);
    if (o.facet && w >= 20 && h >= 8 && t >= o.base && q.fill < 0 && rnd() < o.facet) {
      const a = 0.4 + rnd() * 0.35, b = 0.35 + rnd() * 0.4;
      p.poly([[x0 + w * a, y1], [x1, y0 + h * b], [x1, y1]], R[t - 1]);
    }
    p.hl(x0, x1 - 1, y0, R[Math.max(1, t - 3)]); p.vl(x0, y0, y1 - 1, R[Math.max(1, t - 2)]);
    for (let x = x0 + 1; x < x1; x++) p.set(x, y0 + 1, o.rivets && (x - x0) % 2 === 0 ? R[Math.min(T, t + 2)] : R[Math.min(T, t + 1)]);
    for (let yy = y0 + 1; yy < y0 + Math.min(h - 1, 4); yy++) p.set(x0 + 1, yy, R[Math.min(T, t + 1)]);
    p.hl(x0 + 1, x1 - 1, y1 - 1, R[t - 1]);
  }
  // 2. per plate marks
  for (const q of out) {
    const { x0, y0, x1, y1, t, R } = q, w = x1 - x0, h = y1 - y0, T = top(R);
    // grime gathered along the bottom of the plate: drawn runs of 0-2 px
    if (o.grime && rnd() < o.grime) {
      const prof = GRIME[Math.floor(rnd() * GRIME.length)];
      let xx = x0 + 2 + Math.floor(rnd() * 3);
      for (let k = 0; xx < x1 - 2; k += 2) {
        const run = prof[k % prof.length] + 1, g = prof[(k + 1) % prof.length], gh = g > 1 ? 2 : g;
        for (let i = 0; i < run && xx < x1 - 2; i++, xx++) for (let j = 0; j < gh; j++) p.set(xx, y1 - 2 - j, R[j === 0 && gh > 1 ? Math.max(1, t - 2) : t - 1]);
      }
    }
    // access panel: a 4x3 or 5x3 hatch, dark groove top-left, lit bottom-right lip, one screw glint
    if (o.panels && w >= 14 && h >= 8 && rnd() < o.panels) {
      const pw = 4 + Math.floor(rnd() * 2), ph = 3, px = x0 + 3 + Math.floor(rnd() * (w - pw - 5)), py = y0 + 3 + Math.floor(rnd() * Math.max(1, h - ph - 5));
      p.hl(px, px + pw - 1, py, R[Math.max(1, t - 2)]); p.vl(px, py, py + ph - 1, R[Math.max(1, t - 2)]); p.hl(px + 1, px + pw, py + ph, R[Math.min(T, t + 1)]); p.vl(px + pw, py + 1, py + ph, R[Math.min(T, t + 1)]);
      p.set(px + pw - 1, py + 1, R[Math.min(T, t + 2)]);
    }
    // a doubler patch bolted over the plate: raised, lit along the top, its shadow cast down-right
    if (o.doubler && w >= 16 && h >= 9 && rnd() < o.doubler) {
      const dw = 5 + Math.floor(rnd() * 4), dh = 3 + Math.floor(rnd() * 2), dx = x0 + 3 + Math.floor(rnd() * (w - dw - 5)), dy = y0 + 3 + Math.floor(rnd() * Math.max(1, h - dh - 5));
      const tt = Math.min(T - 1, t + 1);
      p.rect(dx, dy, dw, dh, R[tt]); p.hl(dx, dx + dw - 1, dy, R[Math.min(T, tt + 1)]);
      p.hl(dx + 1, dx + dw, dy + dh, R[Math.max(1, t - 2)]); p.vl(dx + dw, dy + 1, dy + dh, R[Math.max(1, t - 2)]);
    }
    // chipped paint at a corner or along the lapped edge
    if (o.chips && rnd() < o.chips) {
      const n = 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const s = CHIPS[Math.floor(rnd() * CHIPS.length)], edge = rnd();
        const cx = edge < 0.45 ? x0 + 1 + Math.floor(rnd() * 2) : x0 + 3 + Math.floor(rnd() * Math.max(1, w - 6));
        const cy = edge < 0.85 ? y0 + 1 : y1 - 3;
        p.stamp(cx, cy, s, { a: R === PRIMER ? ST[2] : PRIMER[2], b: ST[4], c: R[Math.max(1, t - 2)] });
      }
    }
    // a service mark: a coloured tick or a pair (frame and line identification)
    if (o.marks && w >= 16 && rnd() < o.marks) {
      const mx = x0 + 3 + Math.floor(rnd() * (w - 8)), my = y0 + 3, c = [RD[2], BR[3], PA[2]][Math.floor(rnd() * 3)];
      p.hl(mx, mx + 2, my, c); if (rnd() < 0.5) p.set(mx + 4, my, PA[2]);
    }
  }
  // 3. rust weeping from the lap, a few pixels down the plate below
  if (o.rust) for (const q of out) {
    if (rnd() > o.rust) continue;
    const { x0, x1, y1, t, R } = q;
    const sx = x0 + 2 + Math.floor(rnd() * Math.max(1, x1 - x0 - 4)), L = 2 + Math.floor(rnd() * 6);
    p.set(sx, y1 - 1, RU[2]);
    for (let j = 0; j < L; j++) p.set(sx, y1 + j, j < L - 2 ? RU[1] : R[Math.max(1, t - 1)]);
    if (L > 4) p.set(sx + 1, y1, RU[1]);
  }
  return out;
}

export interface CarrierAtlas { d: Uint8Array; e: Uint8Array; regs: Map<string, { x: number; y: number; w: number; h: number; tile: boolean }> }
let cached: CarrierAtlas | null = null;

/** paint the whole sheet (cached: the pixels are the same every time; textures are made per carrier) */
export function paintAtlas(): CarrierAtlas {
  if (cached) return cached;
  const S = new Sheet();
  // ---------------------------------------------------------------- the big hull plates: 252 x 60 m before they repeat
  const hullA = S.alloc('hullA', 1008, 240);
  plates(hullA, { R: HULL, base: 6, seed: 11, courses: [10, 12, 11, 13, 10, 12, 14, 11, 12, 10, 13, 12, 11, 12, 10, 13, 12, 11, 14, 11], widths: [24, 28, 32, 36, 40, 44, 20, 48], rivets: true, alt: BLUE, altP: 0.02, twins: [RAMPS.stone[4], SL[3], RAMPS.iron[4], ST[4]], facet: 0.3, chips: 0.45, rust: 0.35, grime: 0.6, panels: 0.18, marks: 0.2, doubler: 0.15 });
  S.shelf();
  const hullB = S.alloc('hullB', 1008, 240);
  plates(hullB, { R: ARMOR, base: 6, seed: 23, courses: [16, 14, 18, 16, 12, 18, 16, 14, 16, 18, 14, 16, 18, 14], widths: [32, 40, 48, 56, 36, 64], rivets: true, twins: [RAMPS.stone[4], RAMPS.iron[3], ST[3]], facet: 0.35, chips: 0.55, rust: 0.5, grime: 0.8, panels: 0.15, marks: 0.15, doubler: 0.2 });
  S.shelf();
  const olive = S.alloc('olive', 496, 120);
  plates(olive, { R: OLV, base: 4, seed: 5, courses: [10, 12, 11, 12, 10, 13, 11, 12, 10, 9], widths: [16, 20, 24, 28, 32, 36], rivets: true, facet: 0.25, chips: 0.5, rust: 0.12, grime: 0.5, panels: 0.15, marks: 0.12, doubler: 0.06 });
  const deck = S.alloc('deck', 496, 120);
  {
    const p = deck;
    plates(p, { R: ARMOR, base: 5, seed: 61, courses: [16, 16, 16, 16, 16, 16, 16, 8], widths: [12, 16, 20, 24], facet: 0.2, chips: 0.25, grime: 0.3, panels: 0.08, rust: 0.04 });
    // tie-down points on a 2 m grid, a dashed guide line, tyre scuffs
    for (let y = 4; y < p.h; y += 8) for (let x = 4; x < p.w; x += 8) { p.set(x, y, ARMOR[7]); p.set(x + 1, y + 1, ARMOR[2]); }
    for (let x = 0; x < p.w; x++) if ((x >> 2) % 3 !== 2) p.set(x, 60, BR[3]);
    for (let k = 0; k < 6; k++) { const sx = Math.floor(hh(k, 1, 6) * p.w), sy = Math.floor(hh(k, 2, 6) * p.h); for (let i = 0; i < 14; i++) { if (i % 5 === 4) continue; p.set(sx + i, sy + (i > 6 ? 1 : 0), ARMOR[3]); p.set(sx + i, sy + 2 + (i > 6 ? 1 : 0), ARMOR[3]); } }
  }
  S.shelf();
  // ---------------------------------------------------------------- the engine plate: row 0 is the hot (aft) end
  const scorch = S.alloc('scorch', 240, 72);
  plates(scorch, { R: ARMOR, base: 6, seed: 41, courses: [9, 9, 9, 9, 9, 9, 9, 9], widths: [16, 20, 24], rivets: true, facet: 0.3, chips: 0.2, rust: 0.12, grime: 0.6 });
  {
    // soot tongues licking forward (their front a max of parabolic lobes, three bands, the edge broken by a
    // pixel), heat-tint bands at the hot end, soot runs past the front, bare metal scoured through
    const p = scorch, rnd = rng(77), W = p.w;
    const lobes: [number, number, number][] = [];
    for (let x = 0; x < W + 16;) { const w = 8 + Math.floor(rnd() * 14), L = 12 + Math.floor(rnd() * 40); lobes.push([x, w, L]); x += Math.floor(w * (0.45 + rnd() * 0.3)); }
    const D = (x: number) => { let d = 5; for (const [cx, w, L] of lobes) for (const o of [-W, 0, W]) { const u = (x - cx - o) / (w / 2); if (Math.abs(u) < 1) d = Math.max(d, L * (1 - u * u)); } return Math.floor(d); };
    for (let x = 0; x < W; x++) {
      const d = D(x) + (hh(x >> 1, 3, 77) < 0.3 ? 1 : 0);
      for (let y = 0; y < d; y++) { const k = y / d; if (k < 0.34) p.set(x, y, k < 0.14 ? INK[0] : ST[0]); else if (k < 0.66) p.set(x, y, ST[1]); else p.shift(x, y, ARMOR, -1); }
    }
    for (let k = 0; k < 9; k++) { const sx = Math.floor(rnd() * W), d = D(sx), L = 3 + Math.floor(rnd() * 8); for (let y = d - 1; y < d + L; y++) p.set(sx, y, y < d + L * 0.5 ? ST[1] : ST[2]); }
    for (let x = 0; x < W; x++) { p.set(x, 0, INK[0]); p.set(x, 1, RU[1]); p.set(x, 2, (x >> 2) % 3 ? BR[1] : RU[1]); }
    for (let k = 0; k < 7; k++) { const sx = Math.floor(rnd() * W), sy = 4 + Math.floor(rnd() * 8), w = 2 + Math.floor(rnd() * 3); p.hl(sx, sx + w, sy, ST[4]); p.hl(sx + 1, sx + w - 1, sy + 1, ST[3]); }
  }
  // ---------------------------------------------------------------- machinery skins
  const rad = S.alloc('radiator', 128, 64);
  {
    // radiator panels: fins in alternating lit / shade rows, brass header tubes every 4 m, frame seams, heat tint
    const p = rad;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y % 2 ? SL[1] : SL[2]);
    for (let x = 0; x < p.w; x += 16) for (let y = 0; y < p.h; y++) { p.set(x, y, BR[3]); p.set(x + 1, y, BR[1]); }
    for (let y = 0; y < p.h; y += 32) for (let x = 0; x < p.w; x++) { p.set(x, y, ST[3]); p.set(x, y + 1, ST[1]); }
    for (let x = 0; x < p.w; x += 16) for (let y = 2; y < p.h; y += 2) if (hh(x, y >> 2, 3) < 0.5) p.set(x + 2, y, RU[0]);
  }
  const tank = S.alloc('tank', 64, 64);
  {
    // a sphere unwrapped pole to pole (v fits the sphere once): cream gores, weld rings, the red band and its stencil
    const p = tank;
    for (let g = 0; g < 8; g++) {
      const x0 = g * 8, tone = [5, 6, 5, 4, 5, 6, 4, 5][g];
      p.rect(x0, 0, 8, p.h, CREAM[tone]);
      p.poly([[x0 + 5, 14], [x0 + 8, 18], [x0 + 8, 46], [x0 + 5, 50]], CREAM[tone - 1]);
      p.vl(x0, 0, p.h - 1, CREAM[3]);
    }
    for (const yy of [16, 47]) for (let x = 0; x < p.w; x++) p.set(x, yy, (x & 1) ? CREAM[7] : CREAM[3]);
    for (let y = 28; y < 36; y++) for (let x = 0; x < p.w; x++) p.set(x, y, y === 28 ? RD[3] : y === 35 ? RD[0] : RD[2]);
    tiny(p, 'LH2', 6, 30, PA[4]); tiny(p, 'LH2', 38, 30, PA[4]);
    for (let y = 0; y < 3; y++) for (let x = 0; x < p.w; x++) { p.set(x, y, y < 1 ? ST[2] : ST[4]); p.set(x, p.h - 1 - y, y < 1 ? ST[2] : ST[3]); }
    for (const [cx, cy] of [[12, 20], [44, 23], [27, 41]]) p.stamp(cx, cy, CHIPS[(cx + cy) % CHIPS.length], { a: ST[3], b: ST[5], c: CREAM[2] });
    for (const sx of [9, 30, 51]) for (let j = 0; j < 4; j++) p.set(sx, 36 + j, j < 2 ? RD[1] : CREAM[3]);
  }
  const ctank = S.alloc('ctank', 64, 32);
  plates(ctank, { R: CREAM, base: 5, seed: 17, courses: [8, 8, 8, 8], widths: [16, 16, 32], facet: 0.3, chips: 0.3, grime: 0.15 });
  for (let x = 0; x < 64; x++) for (let y = 12; y < 19; y++) ctank.set(x, y, y === 12 ? RD[3] : y === 18 ? RD[0] : RD[2]);
  tiny(ctank, 'LH2', 4, 13, PA[4]); tiny(ctank, 'LH2', 36, 13, PA[4]);
  const truss = S.alloc('truss', 32, 32);
  plates(truss, { R: HULL, base: 6, seed: 31, courses: [8, 8, 8, 8], widths: [8, 12, 16], rivets: true, facet: 0, chips: 0.2, rust: 0.2, grime: 0.3 });
  const gunT = S.alloc('gunT', 32, 32);
  plates(gunT, { R: ARMOR, base: 5, seed: 37, courses: [8, 8, 8, 8], widths: [8, 12, 16], rivets: true, facet: 0, chips: 0.3, rust: 0.25, grime: 0.4 });
  const nozzle = S.alloc('nozzle', 32, 64);
  {
    // bell outside, throat (row 0) to lip: heat bands, ring stiffeners, soot at the lip
    const p = nozzle;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const k = y / p.h;
      p.set(x, y, k < 0.06 ? RU[2] : k < 0.13 ? BR[2] : k < 0.2 ? BR[1] : k < 0.3 ? RU[1] : k < 0.86 ? ST[2 + ((x >> 1) & 1)] : k < 0.94 ? ST[1] : INK[0]);
    }
    for (let y = 10; y < p.h - 6; y += 9) for (let x = 0; x < p.w; x++) { p.set(x, y, ST[1]); p.set(x, y + 1, ST[4]); }
  }
  const nozIn = S.alloc('nozIn', 32, 64);
  {
    // bell inside: the coolant tube wall glowing from the throat, banded, not graded
    const p = nozIn;
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
      const k = y / p.h, tube = x % 2 === 0, band = k < 0.07 ? 4 : k < 0.15 ? 3 : k < 0.27 ? 2 : k < 0.42 ? 1 : 0;
      p.set(x, y, band > 0 ? AM[Math.max(0, band - (tube ? 1 : 0))] : tube ? ST[0] : ST[1], band > 0 ? [0, 70, 130, 200, 255][band] : 0);
    }
  }
  const pipeR: [string, readonly number[]][] = [['pipeRed', [INK[0], RD[0], RD[1], RD[2], RD[3], RU[4]]], ['pipeBrass', [INK[0], BR[0], BR[1], BR[2], BR[3], BR[4]]], ['pipeOlive', [INK[0], OL[1], OL[2], OL[3], OL[4], OL[5]]], ['pipeSteel', [INK[0], ST[1], ST[2], ST[3], ST[4], ST[5]]]];
  for (const [n, R] of pipeR) {
    // a painted pipe: its colour, a flanged coupling every 4 m, an identification band (paper with the line colour)
    const p = S.alloc(n, 16, 16);
    p.rect(0, 0, 16, 16, R[3]);
    p.hl(0, 15, 0, R[1]); p.hl(0, 15, 1, R[4]);
    for (let x = 0; x < 16; x++) { p.set(x, 7, PA[2]); p.set(x, 8, n === 'pipeRed' ? PA[4] : RD[3]); p.set(x, 9, PA[2]); }
    p.set(4, 12, R[2]); p.set(11, 4, R[2]);
  }
  const grate = S.alloc('grate', 8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) grate.set(x, y, x % 2 === 1 && y % 2 === 1 ? INK[0] : y % 2 === 0 ? ST[4] : ST[3]);
  // container sides: corrugated, a frame, the owner's stencil
  const conts: [string, readonly number[], string][] = [['contOlive', OLV, 'UNAA 4471'], ['contRust', PRIMER, 'UNAA 2038'], ['contBlue', BLUE, 'UNAA 0915']];
  for (const [n, R, label] of conts) {
    const p = S.alloc(n, 64, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) p.set(x, y, R[(x & 1) ? 4 : 5]);
    p.hl(0, 63, 0, R[6]); p.hl(0, 63, 1, R[2]); p.hl(0, 63, 14, R[2]); p.hl(0, 63, 15, R[1]);
    p.vl(0, 0, 15, R[2]); p.vl(63, 0, 15, R[2]);
    p.rect(5, 5, tinyWidth(label) + 2, 7, R[2]); tiny(p, label, 6, 6, PA[4]);
    for (const sx of [44, 51, 58]) for (let j = 2; j < 2 + (sx % 5); j++) p.set(sx, j, RU[1]);
  }
  // small solid cells: lenses, glow, dark, brass, steel, rubber
  const cell = (n: string, c: number, em = 0) => { const p = S.alloc(n, 4, 4, 'cell'); p.rect(0, 0, 4, 4, c, em); };
  cell('lensAmber', AM[4], 255); cell('lensRed', RD[3], 255); cell('lensGreen', RAMPS.glowTeal[2], 255); cell('lensWhite', PA[5], 255); cell('glow', AM[3], 230);
  cell('dark', INK[0]); cell('steelC', ST[4]); cell('brassC', BR[4]); cell('rubber', INK[2]); cell('gunC', ST[2]); cell('redC', RD[2]); cell('oliveC', OL[3]);
  cell('glass', SL[1]); cell('creamC', CREAM[5]); cell('ochreC', RAMPS.ochre[4]);
  S.shelf();
  // ---------------------------------------------------------------- lights and stripes (v fits the band)
  const winBand = (n: string, seed: number, w: number, h: number, kind: 'office' | 'bridge' | 'hab') => {
    const p = S.alloc(n, w, h), rnd = rng(seed);
    const wall = kind === 'hab' ? OLV : HULL;
    p.rect(0, 0, w, h, wall[5]); p.hl(0, w - 1, 0, wall[3]); p.hl(0, w - 1, h - 1, wall[7]);
    if (kind === 'bridge') {
      // 2 m panes between mullions: a lamp strip along the deckhead, the dim bridge, the watch at their consoles
      for (let x0 = 0; x0 < w; x0 += 8) {
        p.vl(x0, 1, h - 2, INK[1]);
        const dark = rnd() < 0.12;
        for (let y = 1; y < h - 1; y++) for (let x = x0 + 1; x < x0 + 8; x++) {
          const yy = y - 1;
          let c = yy < 2 ? AM[4] : yy < 3 ? AM[3] : yy < h - 7 ? ((x - x0) === 4 ? AM[1] : AM[2]) : AM[3], e = yy < 2 ? 255 : yy < 3 ? 200 : yy < h - 7 ? 120 : 170;
          if (dark) { c = yy === 2 && x === x0 + 2 ? SL[3] : SL[0]; e = 0; }
          p.set(x, y, c, e);
        }
        if (dark) continue;
        for (let x = x0 + 1; x < x0 + 8; x++) { p.set(x, h - 5, INK[2], 0); p.set(x, h - 4, INK[2], 0); p.set(x, h - 3, INK[1], 0); }
        for (let x = x0 + 1; x < x0 + 8; x += 2) p.set(x, h - 4, [RD[3], RAMPS.glowTeal[3], AM[4]][(x + x0) % 3], 255);
        if (rnd() < 0.55) { const fx = x0 + 2 + Math.floor(rnd() * 4); p.stamp(fx, h - 9, ['.#.', '###', '###', '###'], { '#': INK[1] }, { '#': 0 }); }
      }
      return p;
    }
    // office and hab windows: 3 px panes in 1 px frames; lit, dim, blinds, dark, now and then a figure
    const pw = 3, per = kind === 'hab' ? 4 : 5, y0 = 1, ph = h - 2;
    for (let x0 = 1; x0 + pw <= w; x0 += per) {
      const r = rnd(), state = r < 0.14 ? 'dark' : r < 0.3 ? 'blind' : r < 0.45 ? 'dim' : 'lit';
      for (let y = y0; y < y0 + ph; y++) for (let x = x0; x < x0 + pw; x++) {
        const yy = y - y0;
        let c = AM[3], e = 220;
        if (state === 'dark') { c = yy === 0 && x === x0 ? SL[3] : SL[0]; e = 0; }
        else if (state === 'dim') { c = yy === 0 ? AM[3] : AM[2]; e = 150; }
        else if (state === 'blind') { c = yy % 2 ? AM[1] : AM[3]; e = 170; }
        else { c = yy === 0 ? AM[4] : yy === ph - 1 ? AM[2] : AM[3]; e = yy === 0 ? 255 : 220; }
        p.set(x, y, c, e);
      }
      if (state === 'lit' && rnd() < 0.3) { const fx = x0 + Math.floor(rnd() * pw); p.set(fx, y0 + ph - 1, AM[0], 30); if (ph > 2) p.set(fx, y0 + ph - 2, AM[0], 30); }
    }
    return p;
  };
  winBand('winA', 3, 128, 6, 'office'); winBand('winB', 9, 128, 6, 'office'); winBand('winBridge', 5, 128, 18, 'bridge'); winBand('winHab', 64, 64, 5, 'hab');
  {
    // portholes every metre: a brass rim, lit glass (some dark), on hull plate
    const p = S.alloc('port', 16, 4), rnd = rng(4);
    p.rect(0, 0, 16, 4, HULL[6]);
    for (let k = 0; k < 4; k++) {
      const lit = rnd() > 0.25;
      p.stamp(k * 4, 0, ['.bb.', 'bgGd', 'bGgd', '.dd.'], { b: BR[3], d: BR[1], g: lit ? AM[3] : SL[0], G: lit ? AM[4] : SL[1] }, { g: lit ? 210 : 0, G: lit ? 255 : 0, b: 0, d: 0 });
    }
  }
  const stripes = (n: string, a: number, b: number) => {
    // safety stripes, 2 px diagonals, one knock to bare steel
    const p = S.alloc(n, 16, 2);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 16; x++) p.set(x, y, ((x + y) % 4) < 2 ? a : b);
    p.set(11, 0, ST[4]); p.set(12, 1, ST[3]);
  };
  stripes('haz', BR[4], INK[1]); stripes('hazRed', RD[3], PA[4]);
  {
    // numbered hatches (3 m): raised frame, two hinges, the number, a recessed grab handle; every third striped
    for (let n = 1; n <= 8; n++) {
      const p = S.alloc('hatch' + n, 12, 12, 'cell'), R = n > 4 ? OLV : HULL.slice(1);
      p.rect(0, 0, 12, 12, R[3]);
      p.hl(0, 11, 0, R[6]); p.vl(0, 0, 11, R[6]); p.hl(0, 11, 11, R[1]); p.vl(11, 0, 11, R[1]);
      p.rect(1, 1, 10, 10, R[4]); p.hl(1, 10, 1, R[5]);
      p.set(3, 1, ST[2]); p.set(8, 1, ST[2]);
      if (n % 3 === 0) for (let i = 0; i < 12; i++) { p.set(i, 0, (i % 4) < 2 ? BR[4] : INK[1]); p.set(i, 11, ((i + 1) % 4) < 2 ? BR[4] : INK[1]); }
      tiny(p, String(n), 5, 3, PA[4]);
      p.hl(4, 7, 9, R[1]); p.hl(4, 7, 10, R[6]);
    }
    // louvres, a grille, an exhaust port (2 x 1.25 m)
    for (let k = 0; k < 3; k++) {
      const p = S.alloc('vent' + k, 8, 5, 'cell');
      p.rect(0, 0, 8, 5, HULL[4]); p.hl(0, 7, 0, HULL[7]); p.vl(0, 0, 4, HULL[7]); p.hl(0, 7, 4, HULL[2]); p.vl(7, 0, 4, HULL[2]);
      if (k === 0) for (const y of [1, 3]) { p.hl(1, 6, y, HULL[6]); if (y + 1 < 4) p.hl(1, 6, y + 1, INK[0]); }
      else if (k === 1) for (let y = 1; y < 4; y++) for (let x = 1; x < 7; x++) p.set(x, y, (x + y) % 2 ? INK[0] : HULL[5]);
      else { p.rect(1, 1, 6, 3, INK[0]); p.hl(1, 6, 1, HULL[3]); }
    }
    // the docking collar's face: a brass ring, the olive hatch, its locking dogs
    const d = S.alloc('dockFace', 16, 16, 'cell');
    d.rect(0, 0, 16, 16, HULL[5]);
    d.stamp(0, 0, ['....oooooooo....', '...oOOOOOOOOo...', '..oOggggggggOo..', '.oOggrrrrrrggOo.', 'oOggrrrrrrrrggOo', 'oOgrrrrkkrrrrgOo', 'oOgrrrkKKkrrrgOo', 'oOgrrrKKKKrrrgOo',
      'oOgrrrKKKKrrrgOo', 'oOgrrrkKKkrrrgOo', 'oOgrrrrkkrrrrgOo', 'oOggrrrrrrrrggOo', '.oOggrrrrrrggOo.', '..oOggggggggOo..', '...oOOOOOOOOo...', '....oooooooo....'],
    { o: INK[1], O: BR[4], g: ST[3], r: OL[4], k: OL[2], K: OL[1] });
    for (const [x, y] of [[4, 4], [11, 4], [4, 11], [11, 11]]) d.set(x, y, BR[4]);
  }
  S.shelf();
  // ---------------------------------------------------------------- decals (transparent), drawn at the same density
  const words: [string, string, number, number, 'big' | 'tiny'][] = [
    ['tCorps', 'UNAA PLANETARY SURVEY', 1, PA[4], 'big'], ['tName', 'UNAA MERIDIAN', 1, PA[4], 'big'], ['tVanguard', 'MERIDIAN', 1, PA[4], 'big'],
    ['tHull', 'CVS-01', 1, PA[4], 'big'], ['t01', '01', 2, PA[4], 'big'], ['tUSPC', 'UNAA', 2, PA[4], 'big'], ['tNoStep', 'NO STEP', 1, RD[3], 'tiny'],
    ['tBay', 'LAUNCH BAY 2', 1, PA[4], 'big'], ['tDanger', 'DANGER', 1, RD[3], 'big'], ['tLH2', 'LH2', 1, RD[3], 'big'], ['tReactor', 'REACTOR - NO ENTRY', 1, BR[4], 'tiny'],
    ['tRad', 'RADIATION AREA', 1, BR[4], 'tiny'], ['tHab', 'HAB', 1, PA[4], 'tiny'], ['tDock1', 'DOCK 1', 1, PA[4], 'tiny'], ['tDock2', 'DOCK 2', 1, PA[4], 'tiny'],
    ['tBlast', 'CAUTION - EXHAUST', 1, RD[3], 'tiny'], ['t2', '2', 2, PA[4], 'big'], ['t3', '3', 1, PA[4], 'big'], ['t4', '4', 1, PA[4], 'big'], ['t5', '5', 1, PA[4], 'big'], ['t6', '6', 1, PA[4], 'big'],
    ['tPC1', 'PC-1', 1, PA[4], 'tiny'], ['tPC2', 'PC-2', 1, PA[4], 'tiny'], ['tPC3', 'PC-3', 1, PA[4], 'tiny'],
  ];
  for (const [n, s, sc, c, face] of words) {
    if (face === 'tiny') { const p = S.alloc(n, tinyWidth(s) + 2, 7, 'decal'); tiny(p, s, 1, 1, c, -1, INK[1]); continue; }
    const p = S.alloc(n, textWidth(s, sc) + 3, 7 * sc + 3, 'decal');
    stencil(p, s, 1, 1, sc, c, { wear: 0.04, seed: n.length * 7 + sc, bridges: sc >= 2, shadow: INK[1], off: 1 });
  }
  {
    // the national insignia, hand-placed: blue disc, white star, white bars with the red stripe, blue outline
    const p = S.alloc('insignia', 31, 13, 'decal');
    const disc = ['....bbbbb....', '..bbbbbbbbb..', '.bbbbbwbbbbb.', '.bbbbbwbbbbb.', 'bbbbbwwwbbbbb', 'bwwwwwwwwwwwb', 'bbwwwwwwwwwbb', 'bbbwwwwwwwbbb', 'bbbbwwwwwbbbb', '.bbbwwbwwbbb.', '.bbwwbbbwwbb.', '..bwbbbbbwb..', '....bbbbb....'];
    const bar = ['bbbbbbbbb', 'wwwwwwwww', 'rrrrrrrrr', 'wwwwwwwww', 'bbbbbbbbb'];
    const map = { b: SL[1], w: PA[4], r: RD[3] };
    p.stamp(0, 4, bar, map); p.stamp(22, 4, bar, map); p.stamp(9, 0, disc, map);
    p.clear(3, 5); p.set(25, 7, PA[2]);
  }
  {
    // Unit 07's badge: an olive shield, a red chief with the Corps' three stars, a brass gear
    const p = S.alloc('patch', 11, 12, 'decal');
    p.stamp(0, 0, ['kkkkkkkkkkk', 'krrrrrrrrrk', 'krrrrrrrrrk', 'koooooooook', 'koogogogook', 'kogggggggok', 'kogggKgggok', 'kogggggggok', 'koogogogook', '.koooooook.', '..koooook..', '....kkk....'],
      { k: INK[1], r: RD[2], o: OL[3], g: BR[3], K: OL[1] });
    p.set(3, 1, PA[4]); p.set(5, 1, PA[4]); p.set(7, 1, PA[4]);
  }
  S.gutters();
  const regs = new Map<string, { x: number; y: number; w: number; h: number; tile: boolean }>();
  for (const [k, r] of S.regs) regs.set(k, { x: r.x, y: r.y, w: r.w, h: r.h, tile: r.tile });
  cached = { d: S.d, e: S.e, regs };
  return cached;
}

/**
 * Skins: tiling regions always map at PPM texels per metre (the ship's one pixel size, whatever a caller asks);
 * cells and decals are mapped once onto their panel, and the parts are sized from the art (pixels / PPM).
 */
export function makeSkins(regs: Map<string, { x: number; y: number; w: number; h: number; tile: boolean }>) {
  const memo = new Map<string, Skin>();
  return (name: string, _ppm = PPM, bucket = 'm'): Skin => {
    const key = name + '|' + bucket;
    let s = memo.get(key); if (s) return s;
    const r = regs.get(name); if (!r) throw new Error('carrier atlas: no region ' + name);
    s = { r: [r.x / AW, r.y / AH, r.w / AW, r.h / AH], su: PPM / r.w, sv: PPM / r.h, b: bucket, tile: r.tile, px: [r.w, r.h] };
    memo.set(key, s);
    return s;
  };
}
export const ATLAS_SIZE = [AW, AH] as const;
