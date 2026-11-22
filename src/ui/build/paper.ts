// BLUEPRINT MATERIALS as clean pixel art (2 CSS px per art px), every surface from the shared MATERIAL LIBRARY
// (src/gfx/mat: matPixels; the blueprint stock is its 'paper_blueprint', added in src/gfx/mat/blueprint.ts) laid one texel
// per art pixel and lit as an object (bevels, folds), with drawn parts on top (border, creases, ticks, screws):
// the cyan-blue BLUEPRINT SHEET (mottled diazo stock, foxing, a printed border, fold creases, worn and bitten edges, a
// dog-eared corner, pin holes), the steel PARALLEL RULE the build tray hangs on (brushed steel, an engraved scale,
// brass end caps and screws), its brass slide-rule CURSOR, and a steel BULLDOG CLIP. A 1 px ink outline round each.
import { Px, INK, hash, screw, rivet } from '../kit/px';
import { matPixels } from '../../gfx/mat';
import '../../gfx/mat/blueprint';
import { RAMPS as P } from '../../art/palette';

const B = P.sapphire; // 0 deep .. 6 pale

/** every pixel where inside(x, y), from a library material (one texel per art pixel, tiled), times a light factor */
function fillMat(p: Px, name: string, inside: (x: number, y: number) => boolean, light: (x: number, y: number) => number = () => 1, ox = 0, oy = 0) {
  const m = matPixels(name, 1), d = m.data;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (!inside(x, y)) continue;
    const tx = (((x + ox) % m.w) + m.w) % m.w, ty = (((y + oy) % m.h) + m.h) % m.h, i = (ty * m.w + tx) * 4, k = light(x, y);
    const r = Math.min(255, d[i] * k), g = Math.min(255, d[i + 1] * k), b = Math.min(255, d[i + 2] * k);
    p.set(x, y, (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b));
  }
}
/** a bevel's light: the top rows and left column lit, the bottom rows and right column in shade */
const bevelLight = (w: number, h: number, x0 = 0, y0 = 0) => (x: number, y: number) => {
  const lx = x - x0, ly = y - y0;
  return ly < 2 || lx < 1 ? 1.3 : ly > h - 3 || lx > w - 2 ? 0.62 : ly < 4 ? 1.12 : ly > h - 5 ? 0.82 : 1;
};

export interface SheetOpts {
  seed?: number;
  /** fold creases (fractions of w / h) */
  folds?: { x?: number[]; y?: number[] };
  /** the top-right corner dog-eared */
  dogEar?: boolean;
  /** pin holes at the top corners */
  pins?: boolean;
  /** a printed double border inset by n art px */
  border?: number;
}
/** a blueprint sheet w x h art px: the library's blueprint stock, a sun-faded rim, a bitten edge, folds, a dog-ear */
export function blueprintSheet(w: number, h: number, o: SheetOpts = {}): Px {
  const p = new Px(w, h), s = o.seed ?? 3;
  const ear = o.dogEar ? Math.max(6, Math.round(Math.min(w, h) * 0.07)) : 0;
  const fx = (o.folds?.x ?? []).map((f) => Math.round(w * f)), fy = (o.folds?.y ?? []).map((f) => Math.round(h * f));
  const edgeOf = (x: number, y: number) => Math.min(x, y, w - 1 - x, h - 1 - y);
  const inside = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    if (ear && x - (w - ear) > y - 1) return false; // the folded-away corner
    return !(edgeOf(x, y) === 0 && hash(x, y, s + 9) < 0.06); // a bitten edge
  };
  // the stock, its quadrants between the folds tilted a little to the light, the rim faded where the sun caught it
  fillMat(p, 'paper_blueprint', inside, (x, y) => {
    let q = 0; for (const f of fx) if (x > f) q++; for (const f of fy) if (y > f) q += 2;
    const e = edgeOf(x, y);
    return [1, 0.94, 1.05, 0.97][q % 4] * (e < 3 && hash(x >> 1, y >> 1, s + 4) < 0.7 ? 1.18 - e * 0.05 : 1) * (1.04 - (y / h) * 0.08);
  }, s * 7, s * 13);
  // the printed border: a heavy line and a thin one inside it
  const bd = o.border ?? 0;
  if (bd > 0) {
    for (let x = bd; x < w - bd; x++) { if (inside(x, bd)) p.set(x, bd, B[6]); p.set(x, h - 1 - bd, B[6]); if (x > bd + 2 && x < w - bd - 3) { if (inside(x, bd + 3)) p.set(x, bd + 3, B[5], 190); p.set(x, h - 4 - bd, B[5], 190); } }
    for (let y = bd; y < h - bd; y++) { p.set(bd, y, B[6]); if (inside(w - 1 - bd, y)) p.set(w - 1 - bd, y, B[6]); if (y > bd + 2 && y < h - bd - 3) { p.set(bd + 3, y, B[5], 190); if (inside(w - 4 - bd, y)) p.set(w - 4 - bd, y, B[5], 190); } }
  }
  // fold creases: a lit ridge with its shadow, worn soft in places
  for (const f of fy) for (let x = 1; x < w - 1; x++) { if (!inside(x, f)) continue; const k = hash(x >> 1, f, s + 7); p.set(x, f, B[5], 120 + k * 80); p.set(x, f + 1, B[1], 100 + k * 70); }
  for (const f of fx) for (let y = 1; y < h - 1; y++) { if (!inside(f, y)) continue; const k = hash(f, y >> 1, s + 8); p.set(f, y, B[5], 120 + k * 80); p.set(f + 1, y, B[1], 100 + k * 70); }
  // the dog-ear: the paper's pale back, folded over
  if (ear) {
    fillMat(p, 'paper_blueprint_back', (x, y) => x >= w - ear && y < ear && x - (w - ear) < y, (x, y) => (x - (w - ear) === y - 1 ? 0.8 : 1));
    for (let y = 0; y < ear; y++) p.set(w - ear + y, y, INK);
  }
  if (o.pins) for (const px of [7, w - 8 - ear]) { p.set(px, 6, INK); p.set(px + 1, 6, INK); p.set(px, 7, INK); p.set(px + 1, 7, B[0]); p.set(px - 1, 5, B[6], 160); }
  p.outline(INK);
  return p;
}

/** the steel PARALLEL RULE (w x 14 art px): the library's brushed steel with a bevel, an engraved scale, brass end caps */
export function parallelRule(w: number): Px {
  const h = 14, p = new Px(w, h + 2), S = P.steel;
  fillMat(p, 'metal_brushed', (x, y) => x > 0 && x < w - 1 && y > 0 && y < h - 1, bevelLight(w, h));
  // the engraved scale along the top (a tick every 4, taller every 20, tallest every 100)
  for (let x = 16; x < w - 16; x += 4) {
    const n = (x - 16) / 4, len = n % 25 === 0 ? 6 : n % 5 === 0 ? 4 : 2;
    for (let y = 3; y < 3 + len; y++) { p.set(x, y, S[1]); p.set(x + 1, y, S[6], 120); }
  }
  // brass end caps with a screw each
  for (const x0 of [0, w - 12]) {
    fillMat(p, 'metal_brass', (x, y) => x >= x0 && x < x0 + 12 && y >= 0 && y < h, bevelLight(12, h, x0, 0), x0);
    screw(p, x0 + 3, 4, x0 + 1);
  }
  p.outline(INK);
  // a hard shadow under the bar
  for (let x = 2; x < w; x++) p.set(x, h, 0x000000, 90);
  return p;
}

/** the slide-rule CURSOR that marks the open category: a brass frame round a glass window with a red hairline */
export function ruleCursor(w = 30): Px {
  const h = 20, p = new Px(w, h);
  const fr = (x: number, y: number) => x < 3 || x > w - 4 || y < 3 || y > h - 4;
  fillMat(p, 'metal_brass', (x, y) => fr(x, y), (x, y) => (x < 2 || y < 2 ? 1.3 : x > w - 3 || y > h - 3 ? 0.65 : 1));
  // the glass window: the library's glass, mostly clear
  const gl = matPixels('glass', 1);
  for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) { const i = ((y % gl.h) * gl.w + (x % gl.w)) * 4; p.set(x, y, (gl.data[i] << 16) | (gl.data[i + 1] << 8) | gl.data[i + 2], 70); }
  for (let y = 3; y < h - 3; y++) p.set(Math.floor(w / 2), y, P.stampRed[3]);
  rivet(p, 2, 2, 1, P.brass); rivet(p, w - 3, 2, 1, P.brass); rivet(p, 2, h - 3, 1, P.brass); rivet(p, w - 3, h - 3, 1, P.brass);
  p.outline(INK);
  return p;
}

/** a steel BULLDOG CLIP (holds a sheet's top edge) 20 x 18 art px */
export function bulldogClip(): Px {
  const p = new Px(20, 18), S = P.steel;
  fillMat(p, 'metal_brushed', (x, y) => x >= 1 && x < 19 && y >= 6 && y < 16, bevelLight(18, 10, 1, 6));
  // the jaw's teeth and the wire handle
  for (let x = 2; x < 18; x += 3) p.set(x, 14, S[1]);
  for (let x = 4; x < 16; x++) p.set(x, 1, S[5]);
  for (let y = 1; y < 7; y++) { p.set(4, y, S[5]); p.set(15, y, S[3]); }
  rivet(p, 4, 10, 1); rivet(p, 15, 10, 1);
  p.outline(INK);
  return p;
}
