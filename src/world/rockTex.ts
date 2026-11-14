// Stone, ore, crystal and wood surfaces for the sculpted rocks: 96 x 96 tileable pixel art at 48 px/m (a 2 m repeat,
// the ground's and the plants' own pixel size), drawn from the master palette's ramps only (src/art/palette.ts) and
// built from drawn marks, as a pixel artist would: fracture plates with a lit upper-left rim and a dark lower-right
// one, bedding bands with a bright top row and a dark parting under them, cracks with a lit lip, columns with a lit
// left arris, tafoni hollows lit on their lower rim, lichen rosettes as jagged clusters, rain and varnish streaks,
// glints on quartz. Each rock family has a side face, a top face and an alternate stratum (band); then moss, bark and
// end grain; the ore overlays (transparent where there is no ore: nuggets with outlines, tones and glints laid along
// vein streaks, malachite and rust staining); and the crystal faces (one 24 px face per column: lit arris on the
// left, a darker edge on the right, growth lines and inclusions). Alpha < 255 marks glowing pixels (lumen, gravium).
import * as THREE from 'three';
import { PixelCanvas } from '../limbo/gfx/pixel';
import { Rand } from '../core/rand';
import { RAMPS, nearestRamp, type RampName } from '../art/palette';
import { plates, crackLine, fillPoly, nugget, prism, type P2 } from './pixelKit';
import type { Palette } from './palette';

export const RS = 96;
/** families in layer order (RockMat -> family: GRANITE 0, SANDSTONE 1, BASALT 2, LIMESTONE 3, SLATE 4, TUFF 5) */
export const FAMS = ['granite', 'sandstone', 'basalt', 'limestone', 'slate', 'tuff'] as const;
/** layers: family f has side 3f, top 3f + 1, alternate stratum 3f + 2; then the shared layers, the ore overlays
 *  (by geo B id) and the crystal faces */
export const RL = { moss: 18, bark: 19, end: 20, barkDark: 21, ore0: 22, crystal0: 29 } as const;
/** crystal face layers by hue */
export const CRYSTAL_L: Record<'quartz' | 'lumen' | 'amethyst' | 'sapphire', number> = { quartz: 29, lumen: 30, amethyst: 31, sapphire: 32 };
export const RLAYERS = 33;

type Ramp = readonly number[];
const RA = (n: RampName): Ramp => RAMPS[n];
const at = (r: Ramp, i: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];
const W = (v: number) => ((Math.floor(v) % RS) + RS) % RS;

function canvas() { const pc = new PixelCanvas(RS, RS); pc.wrap = true; return pc; }

// ------------------------------------------------------------------------------------------------ drawn marks
/** a lichen rosette: a jagged cluster (a jittered polygon), a darker rim on its lower right, a few satellite flecks */
function lichen(pc: PixelCanvas, r: Rand, x: number, y: number, rad: number, ramp: Ramp) {
  const k = r.int(6, 9), pts: P2[] = [];
  for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2 + r.range(-0.3, 0.3), d = rad * r.range(0.55, 1.1); pts.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85]); }
  const cells: P2[] = [];
  fillPoly(pts, (X, Y) => cells.push([X, Y]));
  const inside = new Set(cells.map(([X, Y]) => W(X) + W(Y) * RS));
  for (const [X, Y] of cells) {
    const edge = !inside.has(W(X + 1) + W(Y) * RS) || !inside.has(W(X) + W(Y + 1) * RS);
    const lit = !inside.has(W(X - 1) + W(Y) * RS) || !inside.has(W(X) + W(Y - 1) * RS);
    pc.set(W(X), W(Y), edge ? at(ramp, 2) : lit ? at(ramp, 5) : at(ramp, (X + Y) % 3 === 0 ? 3 : 4));
  }
  for (let i = r.int(2, 4); i > 0; i--) { const a = r.range(0, 6.28), d = rad + r.range(1, 2.5); pc.set(W(x + Math.cos(a) * d), W(y + Math.sin(a) * d), at(ramp, 4)); }
}
/** a streak running down the face (rain, varnish, rust): 1 px wide, broken, fading out by stopping */
function streak(pc: PixelCanvas, r: Rand, x: number, y: number, len: number, c: number, c2?: number) {
  for (let k = 0; k < len; k++) {
    if (r.chance(0.12)) continue;
    pc.set(W(x), W(y + k), k > len * 0.7 && c2 !== undefined ? c2 : c);
    if (r.chance(0.06)) x += r.sign();
  }
}
/** a hollow (tafoni, pothole, pit): a dark polygon, its upper rim darkest, its lower rim lit */
function hollow(pc: PixelCanvas, r: Rand, x: number, y: number, rx: number, ry: number, ramp: Ramp) {
  const k = r.int(5, 7), pts: P2[] = [];
  for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2 + r.range(-0.25, 0.25); pts.push([x + Math.cos(a) * rx * r.range(0.75, 1), y + Math.sin(a) * ry * r.range(0.75, 1)]); }
  const cells: P2[] = [];
  fillPoly(pts, (X, Y) => cells.push([X, Y]));
  const inside = new Set(cells.map(([X, Y]) => W(X) + W(Y) * RS));
  for (const [X, Y] of cells) {
    const top = !inside.has(W(X) + W(Y - 1) * RS), bot = !inside.has(W(X) + W(Y + 1) * RS);
    pc.set(W(X), W(Y), top ? at(ramp, 0) : at(ramp, 1));
    if (bot) pc.set(W(X), W(Y + 1), at(ramp, 5));
  }
}
/** a small drawn speck: 2-3 px in one of a few shapes (crystal grains, clasts, vesicles) */
function speck(pc: PixelCanvas, r: Rand, x: number, y: number, c: number, lit?: number) {
  const s = r.int(0, 3);
  pc.set(W(x), W(y), c);
  if (s === 0) pc.set(W(x + 1), W(y), c);
  else if (s === 1) pc.set(W(x), W(y + 1), c);
  else if (s === 2) { pc.set(W(x + 1), W(y), c); pc.set(W(x), W(y + 1), c); }
  if (lit !== undefined) pc.set(W(x), W(y), lit);
}
/** horizontal bands down the tile: [start row, thickness, tone] wobbling along a tileable wave */
function bands(r: Rand, minT: number, maxT: number, tones: number[]): { y0: number; t: number; k: number }[] {
  const out: { y0: number; t: number; k: number }[] = [];
  let y = 0;
  while (y < RS) { const t = Math.min(RS - y, r.int(minT, maxT)); out.push({ y0: y, t, k: r.pick(tones) }); y += t; }
  if (out.length > 1 && out[out.length - 1].t < minT) { out[out.length - 2].t += out[out.length - 1].t; out.pop(); }
  return out;
}
const wave = (x: number, a: number, ph: number, f = 1) => Math.round(Math.sin((x / RS) * Math.PI * 2 * f + ph) * a);

// ------------------------------------------------------------------------------------------------ the families
/** rock ramps for a planet: granite takes the planet's own rock colour, the rest are fixed materials */
function famRamps(pal: Palette): Record<(typeof FAMS)[number], { body: Ramp; alt: Ramp; stain: Ramp; lichen: Ramp }> {
  const gk = nearestRamp(pal.rock);
  const g: RampName = gk === 'stone' || gk === 'slate' || gk === 'basalt' || gk === 'quartz' || gk === 'iron' || gk === 'sand' || gk === 'soil' || gk === 'clay' ? gk : 'stone';
  return {
    granite: { body: RA(g), alt: RA('quartz'), stain: RA('rust'), lichen: RA('straw') },
    sandstone: { body: RA('sand'), alt: RA('clay'), stain: RA('rust'), lichen: RA('ochre') },
    basalt: { body: RA('basalt'), alt: RA('stone'), stain: RA('rust'), lichen: RA('sage') },
    limestone: { body: RA('quartz'), alt: RA('bone'), stain: RA('slate'), lichen: RA('straw') },
    slate: { body: RA('slate'), alt: RA('iron'), stain: RA('rust'), lichen: RA('sage') },
    tuff: { body: RA('bone'), alt: RA('sand'), stain: RA('ochre'), lichen: RA('moss') },
  };
}

function granite(pc: PixelCanvas, r: Rand, K: ReturnType<typeof famRamps>['granite'], face: 'side' | 'top' | 'band') {
  const b = K.body, top = face === 'top';
  // jointed blocks: angular plates, lit on their upper-left rims
  plates(pc, r, top ? 7 : 11, [...b], top ? [4, 5, 5, 6] : face === 'band' ? [3, 4, 4, 5] : [4, 4, 5, 3], { bevel: true, sy: top ? 1 : 1.6 });
  // feldspar phenocrysts (blocky pale crystals with a dark lower edge), quartz grains, mica flakes
  for (let i = 0; i < 16; i++) {
    const x = r.int(0, RS - 1), y = r.int(0, RS - 1), w = r.int(2, 4), hh = r.int(1, 2), c = r.chance(0.6) ? at(RA('coral'), 5) : at(RA('bone'), 5);
    for (let j = 0; j < hh; j++) for (let k = 0; k < w; k++) pc.set(W(x + k), W(y + j), c);
    for (let k = 0; k < w; k++) pc.set(W(x + k), W(y + hh), at(b, 1));
  }
  for (let i = 0; i < 26; i++) { const q = r.next(); speck(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), q < 0.6 ? at(RA('quartz'), 5) : at(b, 0), q < 0.25 ? at(RA('snow'), 5) : undefined); }
  if (!top) {
    crackLine(pc, r.int(0, RS - 1), 0, RS + 10, at(b, 0), at(b, 5), r);
    for (let i = 0; i < 3; i++) crackLine(pc, r.int(0, RS - 1), r.int(0, RS - 1), r.int(10, 26), at(b, 1), at(b, 5), r);
    for (let i = 0; i < 6; i++) streak(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(8, 26), at(b, 2), at(b, 1));
  } else {
    for (let i = 0; i < 5; i++) hollow(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(1.5, 3), r.range(1.2, 2.2), [...b]);
    for (let i = 0; i < 3; i++) crackLine(pc, r.int(0, RS - 1), r.int(0, RS - 1), r.int(8, 20), at(b, 0), at(b, 5), r);
  }
  for (let i = 0; i < (top ? 7 : 3); i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(1.8, 4), r.chance(0.6) ? K.lichen : RA('sage'));
}

function sandstone(pc: PixelCanvas, r: Rand, K: ReturnType<typeof famRamps>['sandstone'], face: 'side' | 'top' | 'band') {
  const b = face === 'band' ? K.alt : K.body, top = face === 'top';
  if (top) {
    plates(pc, r, 6, [...b], [3, 4, 4, 5], { bevel: true });
    // bedding traces crossing the slickrock
    for (let k = 0; k < 4; k++) { const y0 = r.int(0, RS - 1), ph = r.range(0, 6.28); for (let x = 0; x < RS; x++) if ((x + k) % 7 !== 0) pc.set(x, W(y0 + wave(x, 3, ph)), at(b, 2)); }
    for (let i = 0; i < 3; i++) hollow(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(2, 4), r.range(1.5, 3), [...b]);
  } else {
    // laminated beds: each bed one tone, its top row lit, a dark parting under the thicker ones; cross-bedded sets
    const ph = r.range(0, 6.28), BD = bands(r, 3, 11, [2, 3, 4, 3, 5]);
    for (const bd of BD) for (let x = 0; x < RS; x++) {
      const off = wave(x, 2, ph);
      for (let j = 0; j < bd.t; j++) {
        let k = bd.k;
        if (j === 0) k += 1; else if (j === bd.t - 1 && bd.t > 5) k = 1;
        if (bd.t > 7 && j > 0 && j < bd.t - 1 && ((x + j * 2) % 6) === 0) k -= 1;
        pc.set(x, W(bd.y0 + j + off), at(b, k));
      }
    }
    // tafoni: honeycomb hollows
    for (let i = 0; i < 5; i++) hollow(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(2, 4.5), r.range(1.5, 3.2), [...b]);
    // desert varnish hanging from the top of the face
    for (let i = 0; i < 5; i++) streak(pc, r, r.int(0, RS - 1), 0, r.int(14, 46), at(K.stain, 1), at(K.stain, 2));
    for (let i = 0; i < 2; i++) crackLine(pc, r.int(0, RS - 1), r.int(0, RS - 1), r.int(10, 24), at(b, 0), at(b, 5), r);
  }
  for (let i = 0; i < 40; i++) pc.set(r.int(0, RS - 1), r.int(0, RS - 1), at(b, r.chance(0.5) ? 5 : 1));
  for (let i = 0; i < (top ? 3 : 1); i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(1.5, 3), K.lichen);
}

function basalt(pc: PixelCanvas, r: Rand, K: ReturnType<typeof famRamps>['basalt'], face: 'side' | 'top' | 'band') {
  const b = K.body, top = face === 'top';
  if (top) {
    // column heads: angular plates parted by dark joints
    plates(pc, r, 9, [...b], [2, 3, 3, 4], { bevel: true, seam: 0 });
  } else {
    // columns: vertical prisms, each one tone, a lit left arris and a dark joint on the right, cross-joints
    let x = 0;
    while (x < RS) {
      const w = Math.min(RS - x, r.int(13, 20)), k = r.pick([2, 3, 3, 2, 4]), cj = [r.int(0, RS - 1), r.int(0, RS - 1)];
      for (let i = 0; i < w; i++) for (let y = 0; y < RS; y++) {
        let t = k;
        if (i === 0) t = k + 2; else if (i === 1) t = k + 1; else if (i === w - 1) t = 0; else if (i === w - 2) t = Math.max(1, k - 1);
        pc.set(x + i, y, at(b, t));
      }
      for (const yy of cj) for (let i = 1; i < w - 1; i++) { pc.set(x + i, W(yy + (i > w / 2 ? 1 : 0)), at(b, 0)); pc.set(x + i, W(yy + 1 + (i > w / 2 ? 1 : 0)), at(b, 5)); }
      x += w;
    }
  }
  // vesicles: frozen gas bubbles, a dark pit with a lit lower pixel
  for (let i = 0; i < 40; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1); pc.set(x, y, at(b, 0)); if (r.chance(0.5)) pc.set(W(x + 1), y, at(b, 0)); pc.set(x, W(y + 1), at(b, 5)); }
  // rusty oxidation crusts
  for (let i = 0; i < 4; i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(1.5, 3.5), K.stain);
  if (face === 'band') for (let i = 0; i < 4; i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(2, 3), K.lichen);
}

function limestone(pc: PixelCanvas, r: Rand, K: ReturnType<typeof famRamps>['limestone'], face: 'side' | 'top' | 'band') {
  const b = face === 'band' ? K.alt : K.body, top = face === 'top';
  if (top) {
    // clints and grikes: pale blocks parted by dark solution fissures
    plates(pc, r, 8, [...b], [2, 3, 3, 4], { bevel: true, seam: 1 });
    for (let i = 0; i < 4; i++) hollow(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(1.5, 3), r.range(1.2, 2.4), [...b]);
  } else {
    // courses of blocks: bedding planes (dark parting, lit row under it), joints offset course to course, karren runnels
    let y = 0;
    while (y < RS) {
      const t = Math.min(RS - y, r.int(14, 24)), k = r.pick([2, 3, 2, 4]);
      const joints = [r.int(0, RS - 1), r.int(0, RS - 1)];
      for (let j = 0; j < t; j++) for (let x = 0; x < RS; x++) {
        let tone = k;
        if (j === 0) tone = 1; else if (j === 1) tone = k + 1;
        if (joints.some((jx) => x === jx) && j > 0) tone = 1;
        if (joints.some((jx) => x === W(jx + 1)) && j > 1) tone = k + 1;
        // runnels: rain-etched grooves down the block
        if (j > 2 && ((x * 7 + y) % 11) === 0 && (x % 3) === 0) tone = k - 1;
        pc.set(x, W(y + j), at(b, tone));
      }
      y += t;
    }
    // dark algae streaks
    for (let i = 0; i < 6; i++) streak(pc, r, r.int(0, RS - 1), r.int(0, RS / 2), r.int(10, 32), at(K.stain, 1), at(K.stain, 2));
  }
  for (let i = 0; i < 24; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1); pc.set(x, y, at(b, 1)); pc.set(x, W(y + 1), at(b, 5)); }
  for (let i = 0; i < 4; i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(1.8, 3.5), K.lichen);
}

function slate(pc: PixelCanvas, r: Rand, K: ReturnType<typeof famRamps>['slate'], face: 'side' | 'top' | 'band') {
  const b = face === 'band' ? K.alt : K.body, top = face === 'top';
  if (top) {
    plates(pc, r, 8, [...b], [2, 3, 3, 4], { bevel: true, seam: 1, sx: 1, sy: 2.2 });
  } else {
    // cleavage: thin slanted laminae, each a tone, a few lit cleavage faces catching the light
    const sl = r.range(0.25, 0.45), ph = r.range(0, 30);
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) {
      const v = y + x * sl + ph, lam = Math.floor(v / 3);
      const k = face === 'band' ? [3, 3, 4, 3, 2, 3][((lam % 6) + 6) % 6] : [2, 3, 2, 4, 3, 1][((lam % 6) + 6) % 6];
      pc.set(x, y, at(b, (Math.floor(v) % 3 === 0 && lam % 4 === 0) ? 1 : k));
    }
    for (let i = 0; i < 10; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1), l = r.int(3, 8); for (let k = 0; k < l; k++) pc.set(W(x + k), W(y - Math.round(k * sl)), at(b, 5)); }
    for (let i = 0; i < 3; i++) crackLine(pc, r.int(0, RS - 1), r.int(0, RS - 1), r.int(12, 30), at(b, 0), at(b, 5), r);
  }
  for (let i = 0; i < 4; i++) streak(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(6, 20), at(K.stain, 2), at(K.stain, 3));
  for (let i = 0; i < 3; i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(1.5, 3), K.lichen);
}

function tuff(pc: PixelCanvas, r: Rand, K: ReturnType<typeof famRamps>['tuff'], face: 'side' | 'top' | 'band') {
  const b = face === 'band' ? K.alt : K.body, top = face === 'top';
  if (top) plates(pc, r, 7, [...b], [2, 3, 3, 4], { bevel: true });
  else {
    // ash beds: soft thick bands, a faint parting between them
    const ph = r.range(0, 6.28), BD = bands(r, 6, 16, [2, 3, 3, 4]);
    for (const bd of BD) for (let x = 0; x < RS; x++) for (let j = 0; j < bd.t; j++) pc.set(x, W(bd.y0 + j + wave(x, 1, ph, 2)), at(b, j === 0 ? bd.k + 1 : j === bd.t - 1 ? bd.k - 1 : bd.k));
  }
  // pumice (pale, outlined) and dark lithic clasts
  for (let i = 0; i < 18; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1), w = r.int(2, 4), hh = r.int(1, 3); for (let j = 0; j < hh; j++) for (let k = 0; k < w; k++) pc.set(W(x + k), W(y + j), at(RA('bone'), 5)); for (let k = 0; k < w; k++) pc.set(W(x + k), W(y + hh), at(b, 1)); }
  for (let i = 0; i < 16; i++) speck(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), at(RA('basalt'), 1), at(RA('basalt'), 3));
  for (let i = 0; i < 3; i++) streak(pc, r, r.int(0, RS - 1), 0, r.int(10, 30), at(K.stain, 2), at(K.stain, 3));
}

// ------------------------------------------------------------------------------------------------ moss, wood
function moss(pc: PixelCanvas, r: Rand) {
  // cushion moss: rounded-off angular clumps, lit on the upper left, dark crevices, bright tips, ruddy spore stalks
  const M = RA('moss');
  plates(pc, r, 40, [...M], [2, 3, 3, 4], { bevel: true, seam: 1 });
  for (let i = 0; i < 70; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1); pc.set(x, y, at(M, 5)); if (r.chance(0.4)) pc.set(W(x + 1), y, at(M, 4)); }
  for (let i = 0; i < 14; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1); pc.set(x, y, at(RA('rust'), 3)); pc.set(x, W(y - 1), at(RA('rust'), 5)); pc.set(x, W(y + 1), at(M, 1)); }
}
function bark(pc: PixelCanvas, r: Rand, B: Ramp, dark: boolean) {
  // furrowed bark along u: ridges broken into plates, dark furrows, a little lichen
  const lanes = 11, off = dark ? 1 : 0;
  for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) {
    const yy = y + wave(x, 2, y * 0.05, 2), lane = (yy / RS) * lanes, f = lane - Math.floor(lane), L = Math.floor(lane);
    const plate = (Math.floor((x + L * 17) / 12) * 7 + L * 3) % 5;
    let k = 3 - off + (f < 0.3 ? 1 : 0) + (plate === 0 ? -1 : plate === 3 ? 1 : 0);
    if (f < 0.14 || f > 0.9) k = 0;
    else if (f > 0.8) k = 1;
    if ((x + L * 17) % 12 === 0 && f > 0.14 && f < 0.9) k = 1;
    pc.set(x, y, at(B, k));
  }
  for (let i = 0; i < 3; i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.range(1.5, 3), RA(r.chance(0.5) ? 'sage' : 'straw'));
}
function endGrain(pc: PixelCanvas, r: Rand, wood: Ramp, heart: Ramp) {
  // a cut end: growth rings round the pith drawn as octagons (no circles), heartwood darker, radial checks, a bark rim
  const c = RS / 2 - 0.5;
  for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) {
    const dx = Math.abs(x - c), dy = Math.abs(y - c), d = (Math.max(dx, dy) * 0.6 + (dx + dy) * 0.4) / (RS / 2);
    const ring = Math.floor(d * 13 + ((x * 3 + y * 5) % 7 === 0 ? 0.3 : 0));
    const ramp = d < 0.5 ? heart : wood;
    let k = ring % 3 === 0 ? 2 : 4 - Math.floor(d * 2);
    if (d > 0.92) k = 0;
    pc.set(x, y, at(ramp, k));
  }
  for (let i = 0; i < 5; i++) { const a = r.range(0, 6.28), l = r.range(10, 34); for (let k = 3; k < l; k++) pc.set(W(c + Math.cos(a) * k), W(c + Math.sin(a) * k), at(wood, 0)); }
}

// ------------------------------------------------------------------------------------------------ ores and crystals
/** ore overlay by geo B id: transparent except for the ore, laid along a few vein streaks */
function oreLayer(pc: PixelCanvas, r: Rand, geo: number) {
  pc.clear();
  const veins = Array.from({ length: 3 }, () => ({ x: r.int(0, RS - 1), y: r.int(0, RS - 1), a: r.range(-0.6, 0.6) + (r.chance(0.5) ? 0 : Math.PI), len: r.int(40, 90) }));
  const along = (fn: (x: number, y: number, k: number) => void, step: number) => {
    for (const v of veins) { let x = v.x, y = v.y, a = v.a; for (let k = 0; k < v.len; k += step) { fn(x + r.int(-2, 2), y + r.int(-2, 2), k); a += r.range(-0.15, 0.15); x += Math.cos(a) * step; y += Math.sin(a) * step * 0.6; } }
  };
  const nug = (ramp: RampName, w0: number, w1: number, stain?: RampName) => (x: number, y: number) => {
    if (stain) for (let i = 0; i < 2; i++) lichen(pc, r, x + r.int(-6, 6), y + r.int(-4, 4), r.range(2, 3.5), RA(stain));
    nugget(pc, W(x), W(y), r.range(w0, w1), r.range(w0 * 0.7, w1 * 0.8), [...RA(ramp)], r);
  };
  if (geo === 0) { along(nug('iron', 7, 13, 'rust'), 9); for (let i = 0; i < 4; i++) nug('iron', 6, 10)(r.int(0, RS - 1), r.int(0, RS - 1)); }
  else if (geo === 2) {
    along((x, y) => { if (r.chance(0.7)) lichen(pc, r, x, y, r.range(2.5, 4.5), RA('malachite')); }, 7);
    along(nug('copper', 7, 12), 10);
  } else if (geo === 3) {
    // gold in quartz: white quartz stringers carrying gold nuggets and flecks
    along((x, y) => { for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) pc.set(W(x + k), W(y + j + (k >> 1)), at(RA('quartz'), j === 0 ? 5 : j === 2 ? 2 : 4)); }, 2);
    along(nug('gold', 5, 10), 11);
    for (let i = 0; i < 14; i++) speck(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), at(RA('gold'), 4), at(RA('gold'), 6));
  } else if (geo === 4) {
    // coal: black seams with glossy conchoidal facets
    const y0 = r.int(0, RS - 1), t = r.int(18, 28), ph = r.range(0, 6.28);
    for (let x = 0; x < RS; x++) for (let j = 0; j < t; j++) {
      const y = W(y0 + j + wave(x, 3, ph));
      const facet = ((x >> 3) + (j >> 2)) % 4;
      pc.set(x, y, at(RA('basalt'), j === 0 ? 3 : j === t - 1 ? 0 : facet === 0 ? 4 : facet === 2 ? 2 : 1));
    }
    for (let i = 0; i < 12; i++) { const x = r.int(0, RS - 1); pc.set(x, W(y0 + 2 + wave(x, 3, ph)), at(RA('steel'), 6)); }
    along(nug('basalt', 5, 9), 12);
  } else if (geo === 5) {
    // sulphur: crusts of small yellow crystals
    along((x, y) => { if (r.chance(0.6)) lichen(pc, r, x, y + 3, r.range(3, 5), RA('ochre')); }, 8);
    along((x, y) => { prism(pc, W(x), W(y + 5), r.range(2, 3.5), r.range(7, 12), r.range(-0.3, 0.3), [...RA('straw')]); }, 6);
  } else if (geo === 6) {
    // gravium: dark violet nuggets whose lit facets glow
    along(nug('amethyst', 7, 13), 9);
    for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) if (pc.alpha(x, y) > 0) { const c = pc.get(x, y); if (c === at(RA('amethyst'), 5) || c === at(RA('amethyst'), 6) || c === at(RA('amethyst'), 4)) pc.set(x, y, c, 150); }
  } else {
    // quartz: clusters of small prisms
    along((x, y) => prism(pc, W(x), W(y + 8), r.range(2, 3.5), r.range(9, 16), r.range(-0.35, 0.35), [...RA('quartz')]), 7);
  }
}
/** crystal faces: four 24 px face variants side by side; u across a face, v up it */
function crystalLayer(pc: PixelCanvas, r: Rand, ramp: Ramp, glow: boolean) {
  const n = ramp.length - 1, A = glow ? 170 : 255;
  for (let col = 0; col < 4; col++) {
    const x0 = col * 24, base = r.pick([n - 3, n - 2, n - 2, n - 1]);
    for (let y = 0; y < RS; y++) for (let i = 0; i < 24; i++) {
      let k = base;
      if (i === 0) k = n; else if (i === 1) k = n - 1; else if (i >= 22) k = Math.max(0, base - 2);
      // a milky base (the crystal clouds toward its root: v runs up the face, so the bottom rows of the tile), a
      // faint growth line here and there
      else if (y > RS - 30 + ((i * 5 + col * 3) % 7)) k = base - 1;
      else if (y % 31 === (col * 11) % 31 && i > 4 && i < 19) k = base + 1;
      pc.set(x0 + i, y, at(ramp, k), i === 0 || i >= 22 ? 255 : A);
    }
    // inner fractures (bright lines running obliquely) and an inclusion or two
    for (let f = 0; f < 2; f++) { let x = x0 + r.int(4, 18), y = r.int(0, RS - 1); const d = r.sign(); for (let k = 0; k < r.int(6, 14); k++) { pc.set(x, W(y), at(ramp, n), A); y += 1; if (k % 2) x += d; if (x <= x0 + 2 || x >= x0 + 21) break; } }
    for (let f = 0; f < 3; f++) speck(pc, r, x0 + r.int(4, 18), r.int(0, RS - 1), at(ramp, 1));
    // a glint near the arris
    const gy = r.int(0, RS - 1); pc.set(x0 + 2, gy, RAMPS.snow[5]); pc.set(x0 + 3, gy, RAMPS.snow[5]); pc.set(x0 + 2, W(gy + 1), at(ramp, n));
  }
}

/** paint every rock / wood / ore / crystal layer into one mipmapped array texture */
export function buildRockTexture(pal: Palette, seed: number): THREE.DataArrayTexture {
  const data = new Uint8Array(RS * RS * 4 * RLAYERS);
  const F = famRamps(pal);
  const paint = (layer: number, fn: (pc: PixelCanvas) => void) => { const pc = canvas(); pc.fill(0); fn(pc); data.set(pc.data, layer * RS * RS * 4); };
  const s = seed * 977 + 13;
  const painters = { granite, sandstone, basalt, limestone, slate, tuff } as const;
  FAMS.forEach((f, k) => {
    (['side', 'top', 'band'] as const).forEach((face, j) => paint(k * 3 + j, (pc) => (painters[f] as (pc: PixelCanvas, r: Rand, K: unknown, face: 'side' | 'top' | 'band') => void)(pc, new Rand(s + k * 31 + j * 7), F[f], face)));
  });
  const BK = RA(nearestRamp(pal.bark[0]));
  paint(RL.moss, (pc) => moss(pc, new Rand(s + 301)));
  paint(RL.bark, (pc) => bark(pc, new Rand(s + 302), BK, false));
  paint(RL.end, (pc) => endGrain(pc, new Rand(s + 303), RA('bone'), RA('fur')));
  paint(RL.barkDark, (pc) => bark(pc, new Rand(s + 304), BK, true));
  for (let g = 0; g < 7; g++) paint(RL.ore0 + g, (pc) => oreLayer(pc, new Rand(s + 400 + g * 13), g));
  paint(CRYSTAL_L.quartz, (pc) => crystalLayer(pc, new Rand(s + 501), RA('quartz'), false));
  paint(CRYSTAL_L.lumen, (pc) => crystalLayer(pc, new Rand(s + 502), RA('glowTeal'), true));
  paint(CRYSTAL_L.amethyst, (pc) => crystalLayer(pc, new Rand(s + 503), RA('amethyst'), false));
  paint(CRYSTAL_L.sapphire, (pc) => crystalLayer(pc, new Rand(s + 504), RA('sapphire'), false));
  const tex = new THREE.DataArrayTexture(data, RS, RS, RLAYERS);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

/** the painted layers as one RGBA strip (debug sheets): every layer side by side */
export function rockSheet(pal: Palette, seed: number): { w: number; h: number; data: Uint8Array } {
  const t = buildRockTexture(pal, seed), src = t.image.data as Uint8Array, w = RS * RLAYERS, out = new Uint8Array(w * RS * 4);
  for (let l = 0; l < RLAYERS; l++) for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) {
    const a = (l * RS * RS + y * RS + x) * 4, b = (y * w + l * RS + x) * 4;
    out[b] = src[a]; out[b + 1] = src[a + 1]; out[b + 2] = src[a + 2]; out[b + 3] = src[a + 3];
  }
  return { w, h: RS, data: out };
}
