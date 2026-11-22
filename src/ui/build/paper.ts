// BLUEPRINT MATERIALS painted as clean pixel art (2 CSS px per art px): the cyan-blue BLUEPRINT SHEET (mottled
// diazo paper with fibres, a printed grid, fold creases, worn and nicked edges, a dog-eared corner, foxing rings and
// pin holes) and the steel PARALLEL RULE the build tray hangs on (brushed steel with an engraved scale, brass end
// caps and screws). Everything from the master ramps; light from the upper left; a 1 px ink outline round each object.
import { Px, INK, hash, bayer, mixHex, screw, rivet } from '../kit/px';
import { RAMPS as P } from '../../art/palette';

const B = P.sapphire; // 0 deep .. 6 pale
/** smooth value noise 0..1 */
function vn(x: number, y: number, s: number) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export interface SheetOpts {
  seed?: number;
  /** grid pitch in art px (0 = none) and the major every n */
  grid?: number; major?: number;
  /** fold creases (fractions of w / h) */
  folds?: { x?: number[]; y?: number[] };
  /** the top-right corner dog-eared */
  dogEar?: boolean;
  /** pin holes at the top corners */
  pins?: boolean;
  /** a printed double border inset by n art px */
  border?: number;
}
/** a blueprint sheet w x h art px */
export function blueprintSheet(w: number, h: number, o: SheetOpts = {}): Px {
  const p = new Px(w, h), s = o.seed ?? 3;
  const ear = o.dogEar ? Math.max(6, Math.round(Math.min(w, h) * 0.07)) : 0;
  const fx = (o.folds?.x ?? []).map((f) => Math.round(w * f)), fy = (o.folds?.y ?? []).map((f) => Math.round(h * f));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (ear && x > w - 1 - ear + (y - 0) && y < ear) continue; // the folded-away corner
    // the edges: a bitten, slightly irregular outline
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (edge === 0 && hash(x, y, s + 9) < 0.05) continue;
    let L = 2.4 + (vn(x / 23, y / 23, s) - 0.5) * 0.9 + (vn(x / 7, y / 7, s + 1) - 0.5) * 0.35 + (hash(x, y, s + 2) - 0.5) * 0.3;
    // quadrants between folds sit at slightly different angles to the light
    let q = 0; for (const f of fx) if (x > f) q++; for (const f of fy) if (y > f) q += 2;
    L += [0, -0.12, 0.1, -0.05][q % 4];
    // worn, sun-faded rim
    if (edge < 4) L += (4 - edge) * 0.18 + (hash(x, y, s + 3) - 0.5) * 0.4;
    // foxing rings
    for (let k = 0; k < 2; k++) {
      const cx = w * (0.25 + hash(k, 1, s) * 0.5), cy = h * (0.3 + hash(k, 2, s) * 0.5), r = 6 + hash(k, 3, s) * 10;
      const d = Math.abs(Math.hypot(x - cx, y - cy) - r);
      if (d < 1.2 && hash(x, y, s + 11 + k) < 0.7) L += 0.6;
    }
    // fibres
    if (hash(Math.floor(x / 4), y, s + 5) > 0.975) L += 0.6;
    if (hash(x, Math.floor(y / 3), s + 6) > 0.985) L -= 0.5;
    const i = Math.max(1, Math.min(4, Math.floor(L + bayer(x, y) - 0.5 + 0.5)));
    p.set(x, y, B[i]);
  }
  // the printed grid
  const g = o.grid ?? 0, M = o.major ?? 5, bd = o.border ?? 0;
  if (g > 0) for (let y = bd + 2; y < h - bd - 2; y++) for (let x = bd + 2; x < w - bd - 2; x++) {
    const gx = (x - bd) % g === 0, gy = (y - bd) % g === 0;
    if (!gx && !gy) continue;
    if (p.alpha(x, y) === 0) continue;
    const maj = gx && Math.floor((x - bd) / g) % M === 0 || gy && Math.floor((y - bd) / g) % M === 0;
    p.set(x, y, maj ? B[5] : B[4], maj ? 150 : 95);
  }
  // the printed border: a heavy line and a thin one inside it
  if (bd > 0) {
    for (let x = bd; x < w - bd; x++) { p.set(x, bd, B[6]); p.set(x, h - 1 - bd, B[6]); if (x > bd + 2 && x < w - bd - 3) { p.set(x, bd + 3, B[5], 200); p.set(x, h - 4 - bd, B[5], 200); } }
    for (let y = bd; y < h - bd; y++) { p.set(bd, y, B[6]); p.set(w - 1 - bd, y, B[6]); if (y > bd + 2 && y < h - bd - 3) { p.set(bd + 3, y, B[5], 200); p.set(w - 4 - bd, y, B[5], 200); } }
  }
  // fold creases: a lit ridge with its shadow
  for (const f of fx) for (let y = 1; y < h - 1; y++) { if (p.alpha(f, y)) { p.set(f, y, B[5], 170); p.set(f + 1, y, B[1], 150); } }
  for (const f of fy) for (let x = 1; x < w - 1; x++) { if (p.alpha(x, f)) { p.set(x, f, B[5], 170); p.set(x, f + 1, B[1], 150); } }
  // the dog-ear: the paper's pale back, folded over
  if (ear) for (let y = 0; y < ear; y++) for (let x = w - ear; x < w; x++) {
    const lx = x - (w - ear), ly = y;
    if (lx < ly) { p.set(x, y, lx === ly - 1 ? P.quartz[2] : mixHex(P.quartz[4], P.sapphire[5], 0.35 + (hash(x, y, s) - 0.5) * 0.15)); }
    else if (lx === ly) p.set(x, y, INK);
  }
  // pin holes at the top corners
  if (o.pins) for (const px of [7, w - 8 - ear]) { p.set(px, 6, INK); p.set(px + 1, 6, INK); p.set(px, 7, INK); p.set(px + 1, 7, B[0]); p.set(px - 1, 5, B[6], 160); }
  // ink outline round the sheet, a soft drop shadow lip on the bottom-right
  p.outline(INK);
  return p;
}

/** the steel PARALLEL RULE (w x 14 art px): brushed steel, engraved ticks, brass end caps with screws */
export function parallelRule(w: number): Px {
  const h = 14, p = new Px(w, h + 2), S = P.steel;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    // a bevelled bar: lit top, shaded bottom, brushed streaks
    let i = y < 3 ? 5 : y > h - 4 ? 2 : 4;
    if (y === 1) i = 6;
    if (y === h - 2) i = 1;
    if (i > 1 && i < 6 && hash(Math.floor(x / (3 + Math.floor(hash(y, 1, 5) * 6))), y, 4) > 0.82) i += hash(x, y, 2) > 0.5 ? 1 : -1;
    p.set(x, y, S[Math.max(0, Math.min(6, i))]);
  }
  // the engraved scale along the top (a tick every 4, taller every 20, tallest every 100)
  for (let x = 10; x < w - 10; x += 4) {
    const n = (x - 10) / 4, len = n % 25 === 0 ? 6 : n % 5 === 0 ? 4 : 2;
    for (let y = 3; y < 3 + len; y++) { p.set(x, y, S[1]); p.set(x + 1, y, S[6], 140); }
  }
  // brass end caps with a screw each
  for (const x0 of [0, w - 12]) {
    for (let y = 0; y < h; y++) for (let x = x0; x < x0 + 12; x++) { const lit = (y < 3 ? 2 : y > h - 4 ? -2 : 0) + (x === x0 ? 1 : x === x0 + 11 ? -1 : 0); p.set(x, y, P.brass[Math.max(0, Math.min(5, 3 + lit))]); }
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
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fr = x < 3 || x > w - 4 || y < 3 || y > h - 4;
    if (fr) { const lit = (x < 2 || y < 2) ? 5 : (x > w - 3 || y > h - 3) ? 2 : 4; p.set(x, y, P.brass[lit]); }
    else p.set(x, y, P.quartz[4], 70);
  }
  for (let y = 3; y < h - 3; y++) p.set(Math.floor(w / 2), y, P.stampRed[3]);
  rivet(p, 2, 2, 1, P.brass); rivet(p, w - 3, 2, 1, P.brass); rivet(p, 2, h - 3, 1, P.brass); rivet(p, w - 3, h - 3, 1, P.brass);
  p.outline(INK);
  return p;
}

/** a steel BULLDOG CLIP (holds a sheet's top edge) 18 x 16 art px */
export function bulldogClip(): Px {
  const p = new Px(20, 18), S = P.steel;
  // the jaw plate
  for (let y = 6; y < 16; y++) for (let x = 1; x < 19; x++) p.set(x, y, S[y < 8 ? 6 : y > 13 ? 2 : 4]);
  for (let x = 2; x < 18; x += 3) p.set(x, 14, S[1]);
  // the wire handle
  for (let x = 4; x < 16; x++) { p.set(x, 1, S[5]); }
  for (let y = 1; y < 7; y++) { p.set(4, y, S[5]); p.set(15, y, S[3]); }
  rivet(p, 4, 10, 1); rivet(p, 15, 10, 1);
  p.outline(INK);
  return p;
}
