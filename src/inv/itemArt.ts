// The real-item icons: one object per icon, centred, in the icon style of ui/icons.ts (a bold angular silhouette,
// planar shading lit from the upper left, 3-5 tones per material in flat clusters, a 1 px outline in the darkest step
// of the object's own ramp, a highlight edge and a glint on hard or wet things). Realistic material colours from the
// master ramps: bark is fur-brown, clay is clay, granite is speckled stone, malachite is banded green. Authored on the
// painter's 32-unit grid; rasterised at the size shown. Each item gets its own drawing, never a shared stamp.
import { RAMPS } from '../art/palette';
import { registerItemArt, type IconPainter as IP, P_SH, P_MID, P_TOP, P_LIT, crystalForm, itemIngot, type IconRamp as Ramp, type IconArt } from '../ui/icons';

const R = RAMPS;
const WOOD = R.fur, BARK = R.hide, LEAF = R.moss, SAGE = R.sage, STRAW = R.straw, SOIL = R.soil, CLAY = R.clay, SAND = R.sand;
const STONE = R.stone, BASALT = R.basalt, SLATE = R.slate, BONE = R.bone, FLESH = R.flesh, GLASS = R.water, STEEL = R.steel;
const PAPER = R.paper, INK = R.ink, BRASS = R.brass, CORK = R.ochre, SNOW = R.snow;
const TAU = Math.PI * 2;
const h1 = (i: number, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

// ------------------------------------------------------------------ shared shapes (each used with its own drawing)
/** a mound of loose material: a faceted heap, then drawn grains in two ramp steps on its lit and shaded flanks */
function heap(p: IP, ramp: Ramp, seed: number, o: { top?: number; w?: number; grains?: number; dark?: number; light?: number } = {}) {
  const top = o.top ?? 12, w = o.w ?? 13;
  const pts = [16 - w, 27.5, 16 - w * 0.8, 23, 16 - w * 0.45, 17.5 + (top - 12) * 0.4, 13.5, top + 1.2, 17.5, top, 16 + w * 0.5, 17 + (top - 12) * 0.4, 16 + w * 0.85, 22.5, 16 + w, 27.5];
  const g = p.gem(pts, ramp, { crown: 0.22, top: 0.5 });
  const n = o.grains ?? 14, dk = o.dark ?? 1, lt = o.light ?? ramp.length - 1;
  p.clip = g.inside;
  for (let i = 0; i < n; i++) {
    const x = 16 - w * 0.85 + h1(seed + i, 1) * w * 1.7, y = top + 3 + h1(seed + i, 2) * (27 - top - 3);
    const lit = x + (y - top) * 0.3 < 16;
    p.fdot(x, y, 0.45, ramp[lit ? lt : dk]);
  }
  p.clip = null;
  return g;
}
/** a stoppered glass vial (specimens): glass tube, the sample inside, a cork or a crimped cap, a paper label */
function vial(p: IP, content: Ramp, o: { cap?: Ramp; lean?: number; fill?: number; label?: boolean; x?: number; w?: number } = {}) {
  const x = o.x ?? 11.5, w = o.w ?? 9, top = 7, bot = 28, lean = o.lean ?? 0;
  const g = p.tank(x, top + 3, w, bot - top - 3, GLASS, { r: 2.6, gain: 1.05 });
  const fill = o.fill ?? 0.55, fy = bot - (bot - top - 4) * fill;
  p.box(x, fy, w, bot - fy, content, { clip: g.inside, lum: 0.55, bevel: 0.8 });
  // the meniscus and a highlight streak down the glass
  p.fline(x + 1.4, fy, x + w - 1.4, fy, content[content.length - 1]);
  p.fline(x + 1.6, top + 5, x + 1.6, bot - 3.5, SNOW[5]);
  const cap = o.cap ?? CORK;
  p.box(x - 0.8, top, w + 1.6, 4.2, cap, { bevel: 0.7, lum: 0.6 });
  if (o.label !== false) { const l = p.box(x + 0.6, top + 8, w - 1.2, 5, PAPER, { bevel: 0.4, lum: 0.62 }); p.mark([x + 1.8, top + 10, x + w - 2.6, top + 10], l.part, 1); p.mark([x + 1.8, top + 11.6, x + w - 4, top + 11.6], l.part, 2); }
  void lean;
  return g;
}
/** a stone of a given rock family: a big faceted lump with one or two smaller ones behind */
function stone(p: IP, ramp: Ramp, seed: number, o: { sq?: number; n?: number; jag?: number; gloss?: boolean; small?: boolean } = {}) {
  if (o.small !== false) p.rock(24.5, 23, 4.2, seed + 7, ramp, { n: 6, sq: 0.8, gloss: o.gloss });
  return p.rock(14.5, 17.5, 11, seed, ramp, { n: o.n ?? 8, sq: o.sq ?? 0.84, jag: o.jag ?? 0.22, gloss: o.gloss, cracks: 1 });
}
/** a drum, can or flask with a sight window showing the fluid (fluids) */
function flask(p: IP, body: Ramp, fluid: Ramp, o: { neck?: boolean; level?: number } = {}) {
  const c = p.tank(8, 7, 16, 21, body, { r: 2.2 });
  const lv = o.level ?? 0.6, y0 = 26 - 15 * lv;
  p.box(12, 10, 8, 16, INK, { clip: c.inside, lum: 0.3, bevel: 0.4 });
  p.box(12.6, y0, 6.8, 26 - y0, fluid, { clip: c.inside, lum: 0.62, bevel: 0.5 });
  p.fline(13, y0, 19, y0, fluid[fluid.length - 1]);
  for (const y of [11, 18, 25]) p.mark([12.2, y, 19.8, y], c.part, 1);
  p.box(8, 7, 16, 1.6, body, { lum: 0.78, bevel: 0.3, clip: c.inside });
  p.box(8, 26.4, 16, 1.6, body, { lum: 0.3, bevel: 0.3, clip: c.inside });
  if (o.neck !== false) { p.box(13, 3.4, 6, 4, BRASS, { bevel: 0.6, lum: 0.6 }); p.box(12, 2.4, 8, 1.8, BRASS, { bevel: 0.3, lum: 0.7 }); }
  return c;
}
/** a crystal cluster on a matrix stone */
function cluster(p: IP, gem: Ramp, matrix: Ramp, seed: number, o: { glow?: Ramp } = {}) {
  p.rock(16, 26.5, 11, seed, matrix, { sq: 0.36, n: 7 });
  crystalForm(p, 9.5, 26, 2.6, 7.5, -1.8, gem, 0.92);
  crystalForm(p, 23, 26.5, 2.4, 6.5, 2, gem, 0.9);
  crystalForm(p, 16.5, 26, 3.6, 13, 0.5, gem);
  crystalForm(p, 12.5, 26.5, 1.6, 4, -0.6, gem, 0.85);
  if (o.glow) { p.glow(17, 12, 1.2, o.glow); p.fdot(10, 18, 0.5, o.glow[o.glow.length - 1]); }
}
/** a burlap sack, tied at the neck */
function sack(p: IP, ramp: Ramp, o: { tie?: Ramp } = {}) {
  const s = p.bevel([9, 10, 23, 10, 26.5, 18, 26, 26, 22.5, 28.5, 9.5, 28.5, 6, 26, 5.5, 18], ramp, { w: 1.6, lum: P_MID });
  for (let k = 0; k < 4; k++) p.mark([8 + k * 4.4, 13, 7.5 + k * 4.6, 27.6], s.part, ramp.length > 5 ? 2 : 1);
  p.poly([11, 10.4, 21, 10.4, 19.5, 7, 22, 3.6, 16, 5.6, 10, 3.6, 12.5, 7], ramp, P_TOP);
  p.box(11, 8.6, 10, 2.2, o.tie ?? STRAW, { bevel: 0.4, lum: 0.55 });
  return s;
}

// ------------------------------------------------------------------ the drawings
const ART: Record<string, IconArt> = {
  // ---- bio
  wood(p) {
    // two split logs: bark round the back, the cut end facing us with its rings and a radial check
    for (const [y, sh] of [[8.5, 0.9], [15, 1]] as [number, number][]) {
      const b = p.poly([6, y + 3, 22, y, 27, y + 1.5, 27.5, y + 9.5, 11, y + 12.5, 6.5, y + 11.5], BARK, (x, yy) => (yy - y < 3.6 ? P_LIT : yy - y > 9 ? P_SH : P_MID) * sh);
      for (let k = 0; k < 3; k++) p.mark([10 + k * 5, y + 3.8 - k * 0.6, 12 + k * 5, y + 9.6 - k * 0.6], b.part, 1);
      const e = p.gem([3, y + 6.5, 5, y + 3, 8.5, y + 2.4, 11, y + 5.5, 11, y + 9.5, 8, y + 12.6, 4.5, y + 12], WOOD, { crown: 0.1, top: 0.85 });
      p.mark([5.5, y + 7.4, 7, y + 6, 8.6, y + 7.2, 8.6, y + 9.4, 6.8, y + 10.6, 5.4, y + 9.4, 5.5, y + 7.4], e.part, 3);
      p.mark([7, y + 8.2, 10.4, y + 7], e.part, 1);
    }
  },
  bark(p) {
    // curled slabs of bark: furrowed outer face, a pale inner face where it curls
    for (const [x, y, s, k] of [[4, 13, 1, 0], [11, 8, 1.1, 1], [9, 18, 0.9, 2]] as [number, number, number, number][]) {
      const b = p.poly([x, y + 4 * s, x + 14 * s, y, x + 18 * s, y + 3 * s, x + 17 * s, y + 9 * s, x + 3 * s, y + 13 * s, x - 1, y + 10 * s], BARK, (xx, yy) => (yy - y < 4 * s ? P_LIT : P_MID - (k === 2 ? 0.1 : 0)));
      for (let i = 0; i < 4; i++) p.mark([x + (2 + i * 3.6) * s, y + (4.4 - i * 0.9) * s, x + (3.4 + i * 3.6) * s, y + (11.2 - i * 0.9) * s], b.part, 1);
      p.poly([x + 14 * s, y, x + 18 * s, y + 3 * s, x + 16.5 * s, y + 4 * s, x + 13 * s, y + 1.6 * s], WOOD, P_LIT);
    }
  },
  leaves(p) {
    // a bunch of cut leaves fanned on a stem: pointed, folded on the midrib, veined
    p.seg(15.5, 28.5, 16, 17, 1.2, WOOD);
    p.leaf(15.5, 20, 4, 9, 7, SAGE, { bend: -0.12 });
    p.leaf(16, 19, 28, 8, 7, LEAF, { bend: 0.14 });
    p.leaf(16, 18, 14, 3, 7.5, LEAF, { bend: 0.08 });
    p.leaf(16, 23, 26.5, 21, 5.5, SAGE, { bend: 0.1 });
    p.leaf(15.5, 24, 5, 23, 5, LEAF, { bend: -0.1 });
  },
  fibre(p) {
    // a hank of combed fibre, bound twice with cord, the loose ends fanning out
    for (let i = 0; i < 7; i++) { const dx = (i - 3) * 1.4; p.seg(14 + dx * 0.6, 5, 15 + dx * 1.6, 28, 1.5, i % 2 ? STRAW : R.sand, { gain: 0.95 + (i % 3) * 0.05 }); }
    p.box(10.5, 11, 10.5, 2.4, CORK, { bevel: 0.5, lum: 0.5 });
    p.box(9.8, 19, 12.5, 2.4, CORK, { bevel: 0.5, lum: 0.5 });
  },
  berries(p) {
    // a woven punnet heaped with dark berries
    const bk = p.bevel([5, 18, 27, 18, 24.5, 28.5, 7.5, 28.5], STRAW, { w: 1.2, lum: P_MID });
    for (let k = 0; k < 5; k++) p.mark([8 + k * 4, 19, 9 + k * 3.6, 28], bk.part, 1);
    p.mark([6, 22.5, 26, 22.5], bk.part, 1);
    for (const [x, y, r] of [[9, 16.5, 2.8], [14, 15, 3], [19.5, 15.6, 2.9], [24, 17, 2.4], [11.5, 11.8, 2.6], [17, 11, 2.8], [21.6, 12.6, 2.2]] as [number, number, number][]) p.ball(x, y, r, r, R.plum, { n: 7, gloss: true, crown: 0.34 });
    p.leaf(16.5, 9, 22, 4, 3, LEAF, { bend: 0.1 });
  },
  tuber(p) {
    // knobbly roots with eyes and a few hair roots, soil still on them
    p.ball(12, 19, 8, 6, CLAY, { n: 8, rot: -0.4 });
    p.ball(21.5, 15, 6.4, 4.8, CLAY, { n: 7, rot: 0.5 });
    p.ball(19, 24, 5, 3.8, CLAY, { n: 7 });
    for (const [x, y] of [[9, 17], [14, 21], [21, 13.5], [24, 16.6], [18, 24.5]]) p.fdot(x, y, 0.5, CLAY[1]);
    p.fline(5, 22, 2.5, 25, SOIL[3]); p.fline(26.5, 17, 29.5, 18.6, SOIL[3]); p.fline(14, 25, 13, 28.6, SOIL[3]);
    p.leaf(21, 10, 24, 3.5, 2.6, LEAF, { bend: 0.15 });
  },
  kelp(p) {
    // long wavy kelp fronds with a gas bladder at each blade's base, still wet
    for (const [x0, ramp, ph] of [[9, R.teal, 0], [16, R.ichor, 1.3], [22, R.teal, 2.4]] as [number, Ramp, number][]) {
      const pts: number[] = [];
      for (let i = 0; i <= 6; i++) { const y = 29 - i * 4.2, x = x0 + Math.sin(i * 1.1 + ph) * 2.2; pts.push(x, y); }
      for (let i = 0; i + 3 < pts.length; i += 2) p.leaf(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], 4.2, ramp, { bend: 0.2, vein: false });
      p.ball(pts[2], pts[3] + 0.8, 1.6, 1.6, ramp, { n: 6, gloss: true });
    }
  },
  mushroom(p) {
    // three caps of different sizes on pale gills and stems
    for (const [x, y, s] of [[11, 18, 1], [21.5, 20, 0.8], [17, 25, 0.55]] as [number, number, number][]) {
      p.box(x - 1.8 * s, y, 3.6 * s, 8 * s, BONE, { lum: 0.6, bevel: 0.6 * s });
      p.poly([x - 7.5 * s, y + 0.5, x + 7.5 * s, y + 0.5, x + 6 * s, y + 1.8 * s, x - 6 * s, y + 1.8 * s], BONE, P_SH);
      p.gem([x - 8 * s, y + 0.6, x - 6 * s, y - 4 * s, x - 1.5 * s, y - 6.6 * s, x + 3 * s, y - 6 * s, x + 7 * s, y - 3 * s, x + 8 * s, y + 0.6], R.hide, { crown: 0.3, top: 0.55 });
      p.fdot(x - 3 * s, y - 3.6 * s, 0.6 * s, BONE[5]); p.fdot(x + 2.4 * s, y - 4.4 * s, 0.5 * s, BONE[4]);
    }
  },
  meat(p) {
    // a cut of red meat with a fat cap and a bone end: marbled with drawn fat lines
    const m = p.gem([4, 17, 8, 10.5, 16, 8, 24, 10, 28, 15, 27, 22, 20, 26, 9, 25.5], FLESH, { crown: 0.25, top: 0.5 });
    for (const pts of [[9, 14, 13, 16, 17, 14.5], [12, 20, 17, 21, 22, 18.5], [19, 12, 23, 14]]) p.mark(pts, m.part, 4);
    p.poly([8, 10.5, 16, 8, 24, 10, 22.5, 11.5, 15.5, 10, 9, 12.4], BONE, P_TOP);
    p.ball(28, 17, 2.4, 2.4, BONE, { n: 6 }); p.disc(28.4, 17.2, 0.8, BONE[2]);
  },
  hide(p) {
    // a stretched hide, pegged at the corners: an irregular outline, a darker spine stripe, hair strokes
    const h = p.bevel([6, 6, 12, 4, 20, 4.5, 26, 6, 28.5, 12, 27, 20, 28.5, 27, 21, 28.5, 11, 28.5, 4, 27, 5.5, 19, 3.5, 12], R.hide, { w: 1.4, lum: P_MID });
    p.poly([14, 5, 18, 5, 18.5, 28, 13.5, 28], R.hide, P_SH, { clip: h.inside, part: h.part });
    for (let i = 0; i < 9; i++) { const x = 7 + (i % 3) * 7.5, y = 9 + Math.floor(i / 3) * 6.5; p.mark([x, y, x + 1.6, y + 1.8], h.part, 1); }
    for (const [x, y] of [[6, 6], [26, 6], [28, 27], [4.5, 27]]) p.fdot(x, y, 0.9, BRASS[4]);
  },
  bone(p) {
    // a long bone, knuckled at both ends
    p.seg(9, 23, 23, 9, 4.4, BONE);
    for (const [x, y] of [[6.6, 23.2], [8.8, 26.2], [23.2, 6.4], [26.2, 8.8]]) p.ball(x, y, 3.2, 3.2, BONE, { n: 7 });
    p.fline(11, 19.5, 19.5, 11, BONE[5]);
  },

  // ---- seeds
  seed_grass(p) {
    // three nodding seed heads on stalks: plump grains along a spike
    for (const [x0, x1, ramp] of [[10, 7, STRAW], [16, 16, R.sand], [22, 25, STRAW]] as [number, number, Ramp][]) {
      p.seg(x0, 29, x1, 13, 0.9, STRAW);
      for (let i = 0; i < 5; i++) { const t = i / 5, x = x1 + (x1 - x0) * 0.05 * i, y = 14 - i * 2.2; p.ball(x - 1.4, y, 1.2, 1.7, ramp, { n: 5, rot: -0.5 }); p.ball(x + 1.4, y - 0.8, 1.2, 1.7, ramp, { n: 5, rot: 0.5 }); void t; }
    }
  },
  seed_reed(p) {
    // a reed head bursting into fluff: a brown spike, white down drifting off it
    p.seg(12, 29, 14, 9, 1.1, STRAW);
    const s = p.tank(11.5, 5, 6, 12, R.fur, { r: 2.4 });
    for (let i = 0; i < 4; i++) p.mark([12.4, 7 + i * 2.6, 16.6, 7.6 + i * 2.6], s.part, 1);
    for (const [x, y] of [[20, 6], [23.5, 10], [21, 14.5], [26, 5], [25, 15.5], [19, 19]]) { p.fline(x - 1.6, y, x + 1.6, y, SNOW[5]); p.fline(x, y - 1.6, x, y + 1.6, SNOW[4]); p.fline(x - 1.1, y - 1.1, x + 1.1, y + 1.1, SNOW[3]); p.fdot(x, y, 0.4, R.fur[2]); }
  },
  spore_fern(p) {
    // a folded paper twist of spores; a curled frond tip with rows of spore dots on its underside
    const tw = p.bevel([6, 14, 18, 10, 22, 26, 10, 28.5], PAPER, { w: 1.2, lum: P_TOP });
    p.mark([7, 15, 11, 27.6], tw.part, 2); p.poly([18, 10, 24, 6.5, 22.5, 12, 19.5, 14], PAPER, P_LIT);
    const fr = p.leaf(26, 28, 21, 9, 6, SAGE, { bend: -0.2 });
    for (let i = 0; i < 5; i++) p.fdot(22.6 + i * 0.7, 25 - i * 3.2, 0.55, R.ochre[3]);
    for (const [x, y] of [[13, 20], [15, 22.5], [12, 24], [16.4, 18]]) p.fdot(x, y, 0.45, R.ochre[2]);
    void fr;
  },
  seed_shrub(p) {
    // a small heap of hard dark pips, a few split showing the white kernel
    for (const [x, y, s] of [[10, 22, 1], [15, 24, 1.1], [20.5, 22.5, 1], [24.5, 25.5, 0.9], [7, 26, 0.9], [13, 18.5, 1], [18.5, 18, 0.95], [16, 13.6, 1]] as [number, number, number][]) {
      p.ball(x, y, 2.4 * s, 3.2 * s, R.plum, { n: 6, rot: 0.4, gloss: true, crown: 0.3 });
    }
    p.fdot(15.4, 23.4, 0.6, BONE[5]); p.fdot(20, 21.8, 0.5, BONE[4]);
  },
  seed_tree(p) {
    // two winged nuts (samaras): a ribbed papery wing off a hard seed
    for (const [x, y, a, ramp] of [[10, 22, -0.9, WOOD], [21, 20, -2.1, R.ochre]] as [number, number, number, Ramp][]) {
      const ex = x + Math.cos(a) * 14, ey = y + Math.sin(a) * 14;
      const w = p.leaf(x, y, ex, ey, 7, ramp, { bend: 0.18, lean: 0.6 });
      for (let k = 1; k <= 3; k++) p.mark([x, y, x + Math.cos(a + 0.12 * k - 0.2) * (5 + k * 2.6), y + Math.sin(a + 0.12 * k - 0.2) * (5 + k * 2.6)], w.part, 2);
      p.ball(x, y, 3, 2.4, R.fur, { n: 6, rot: a, gloss: true });
    }
  },
  seed_cone(p) {
    // a seed cone: overlapping scales in offset rows, each its own faceted plate
    p.seg(16, 4, 16, 8, 1.4, WOOD);
    for (let row = 0; row < 6; row++) {
      const y = 8 + row * 3.3, half = 7.5 - Math.abs(row - 2.2) * 1.3, n = row % 2 ? 3 : 4;
      for (let i = 0; i < n; i++) {
        const x = 16 - half + ((i + (row % 2 ? 0.5 : 0)) / (n - (row % 2 ? 0 : 1))) * half * 2 * (row % 2 ? 0.8 : 1) + (row % 2 ? half * 0.1 : 0);
        p.gem([x - 2.6, y, x + 2.6, y, x + 1.8, y + 3.6, x, y + 4.6, x - 1.8, y + 3.6], R.fur, { crown: 0.3, top: 0.55 });
      }
    }
  },
  seed_palm(p) {
    // a fibrous palm nut: a husk with drawn fibres, one split open on the hard brown shell
    const n = p.ball(13.5, 17.5, 9.5, 10, R.ochre, { n: 9, crown: 0.26 });
    for (let i = 0; i < 6; i++) { const a = -1.2 + i * 0.45; p.mark([13.5 + Math.cos(a) * 3, 17.5 + Math.sin(a) * 3, 13.5 + Math.cos(a) * 9, 17.5 + Math.sin(a) * 9.4], n.part, 2); }
    p.ball(23.5, 23.5, 5.2, 5, R.fur, { n: 7, gloss: true });
    p.fdot(22.5, 21.5, 0.6, R.fur[1]); p.fdot(24.6, 22, 0.6, R.fur[1]); p.fdot(23.6, 24.3, 0.6, R.fur[1]);
  },
  spore_fungus(p) {
    // a sealed vial of violet spore dust beside the gilled cap it was printed from
    vial(p, R.violet, { cap: STEEL, fill: 0.4, x: 6.5, w: 8.5 });
    p.gem([16.5, 22, 18.5, 16.5, 23, 14.6, 27.5, 16.6, 29.5, 22], R.hide, { crown: 0.3 });
    p.poly([17, 22, 29, 22, 28, 24, 18, 24], R.violet, P_SH);
    for (let i = 0; i < 5; i++) p.fline(18.5 + i * 2.2, 22.2, 18.8 + i * 2.2, 23.8, R.violet[1]);
    p.box(22, 24, 2.6, 4.5, BONE, { lum: 0.55, bevel: 0.5 });
  },
  seed_bulb(p) {
    // two papery bulbs, pointed tips and a tuft of roots
    for (const [x, y, s] of [[12, 19, 1], [22, 22, 0.75]] as [number, number, number][]) {
      const b = p.gem([x, y - 11 * s, x + 3 * s, y - 5 * s, x + 7.5 * s, y + 1 * s, x + 6 * s, y + 6.5 * s, x - 6 * s, y + 6.5 * s, x - 7.5 * s, y + 1 * s, x - 3 * s, y - 5 * s], CLAY, { crown: 0.28 });
      for (const dx of [-3.2, 0, 3.2]) p.mark([x + dx * 0.3 * s, y - 9 * s, x + dx * s, y + 5.6 * s], b.part, 2);
      for (const dx of [-3, -1, 1, 3]) p.fline(x + dx * s, y + 6.6 * s, x + dx * 1.3 * s, y + 9.4 * s, BONE[3]);
    }
  },
  seed_cactus(p) {
    // a split dry pod spilling tiny black seeds
    const pod = p.gem([5, 20, 9, 12, 16, 9, 23, 11, 27, 18, 24, 24, 16, 22.5, 9, 24], SAGE, { crown: 0.25 });
    p.poly([9, 17, 15, 14.5, 22, 16, 21, 19.5, 15.5, 20.5, 9.5, 19.5], R.coral, P_MID, { part: pod.part });
    for (const [x, y] of [[11, 17.6], [13.4, 18.4], [15.6, 17], [17.8, 18.6], [19.8, 17.4], [12.6, 26.5], [16, 27.5], [19.6, 26.4], [22.5, 27.6], [9, 27.4]]) p.fdot(x, y, 0.55, INK[0]);
    for (const [x, y] of [[8, 12], [24, 12.4]]) p.fline(x, y, x - 1.6, y - 2.6, BONE[4]);
  },
  seed_crystal(p) {
    // a faceted alien seed: an octahedral gem with a living glow at its heart
    p.gem([16, 3, 24.5, 13, 22, 26, 16, 29.5, 10, 26, 7.5, 13], R.amethyst, { crown: 0.3, top: 0.4, gloss: true });
    p.fline(16, 3.5, 16, 29, R.amethyst[5]); p.fline(8, 13.2, 24, 13.2, R.amethyst[2]);
    p.glow(15, 16, 2.2, R.glowTeal);
  },
  seed_flower(p) {
    // a dried seed head: a disc packed with seeds in a drawn spiral, ragged petals curled back
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.2; p.leaf(16 + Math.cos(a) * 5, 15 + Math.sin(a) * 5, 16 + Math.cos(a) * 12, 15 + Math.sin(a) * 11, 4, R.coral, { bend: 0.15, vein: false }); }
    const d = p.ball(16, 15, 6.6, 6.2, R.fur, { n: 9 });
    for (let i = 0; i < 18; i++) { const a = i * 2.4, r = 1 + i * 0.28; p.fdot(16 + Math.cos(a) * r, 15 + Math.sin(a) * r, 0.42, i % 2 ? R.fur[1] : R.ochre[4]); }
    p.seg(16.5, 21, 17.5, 29.5, 1.2, SAGE); void d;
  },
  seed_trap(p) {
    // a trap-plant seed pod: a green capsule with a toothed seam, split at the top on red seeds
    const pod = p.ball(16, 18, 8, 10.5, R.ichor, { n: 9, crown: 0.28 });
    p.mark([16, 8, 15.4, 28], pod.part, 1);
    for (let i = 0; i < 6; i++) { const y = 10 + i * 3.2; p.fline(16, y, 18, y + 1, R.ichor[4]); p.fline(16, y, 14, y + 1, R.ichor[4]); }
    p.ball(16, 9, 3.4, 2.4, R.ruby, { n: 6, gloss: true });
    p.seg(16, 28, 16, 30.5, 1.2, R.ichor);
  },

  // ---- specimens
  tissue(p) {
    vial(p, FLESH, { cap: STEEL, fill: 0.42 });
    p.ball(16, 22.5, 2.4, 1.8, FLESH, { n: 6 });
  },
  blood_sample(p) {
    // two tubes in a rack: one full of dark blood, one half, red-banded caps
    const rk = p.box(4, 20, 24, 8.5, STEEL, { bevel: 0.8, lum: 0.5 });
    vial(p, R.blood, { cap: R.stampRed, fill: 0.7, x: 7, w: 7.5, label: false });
    vial(p, R.blood, { cap: R.stampRed, fill: 0.38, x: 17.5, w: 7.5, label: false });
    p.box(4, 22, 24, 2.2, STEEL, { bevel: 0.4, lum: 0.62 });
    void rk;
  },
  egg(p) {
    // a speckled egg in a straw nest
    p.ball(16, 14.5, 8.4, 10.5, BONE, { n: 9, crown: 0.3, gloss: true });
    for (const [x, y, r] of [[13, 11, 0.9], [18, 9, 0.7], [19.5, 15, 1], [12, 17, 0.7], [16, 19.5, 0.8], [21, 19, 0.6]] as [number, number, number][]) p.fdot(x, y, r, R.hide[2]);
    const n = p.bevel([3, 22, 29, 22, 26, 29, 6, 29], STRAW, { w: 1.2, lum: P_MID });
    for (let k = 0; k < 6; k++) p.mark([4 + k * 4.4, 23, 7.5 + k * 3.8, 28.5], n.part, 1);
    p.fline(2, 23, 9, 21, STRAW[5]); p.fline(23, 21.5, 30, 23.5, STRAW[4]);
  },
  embryo(p) {
    // a cryo vial: steel caps, frost on the glass, a curled embryo floating in teal gel
    const g = vial(p, R.glowTeal, { cap: STEEL, fill: 0.72, label: false });
    p.clip = g.inside;
    p.ball(16, 19.5, 2.6, 2.2, FLESH, { n: 7 }); p.ball(17.5, 22.6, 1.6, 1.4, FLESH, { n: 5 });
    p.fdot(15.2, 18.8, 0.5, INK[0]);
    p.clip = null;
    p.box(10.7, 27, 10.6, 2.4, STEEL, { bevel: 0.4, lum: 0.45 });
    for (const [x, y] of [[12.6, 15], [19, 13], [13.5, 25]]) { p.fline(x - 1, y, x + 1, y, SNOW[5]); p.fline(x, y - 1, x, y + 1, SNOW[5]); }
  },
  plant_cutting(p) {
    // a cutting rooting in a jar of water: a stem with two leaves, white roots in the water
    const j = p.tank(8.5, 14, 15, 15, GLASS, { r: 2 });
    p.box(8.5, 19, 15, 10, R.water, { clip: j.inside, lum: 0.62, bevel: 0.6 });
    p.clip = j.inside; for (const dx of [-3, -1, 1.6, 3.4]) p.fline(16, 20, 16 + dx, 27, BONE[5]); p.clip = null;
    p.box(7.5, 12.4, 17, 2.4, STEEL, { bevel: 0.4, lum: 0.6 });
    p.seg(16, 21, 16.5, 6, 1.1, LEAF);
    p.leaf(16.3, 10, 7, 4, 5, LEAF, { bend: -0.15 }); p.leaf(16.4, 8, 26, 3, 5.4, LEAF, { bend: 0.15 });
  },
  venom_gland(p) {
    // a ligated venom sac on a steel dish: a glossy green-amber bulb, its duct tied off with red thread
    p.poly([3, 24, 29, 24, 26, 28.5, 6, 28.5], STEEL, P_MID);
    p.poly([3, 24, 29, 24, 27.5, 25.2, 4.5, 25.2], STEEL, P_LIT);
    const s = p.ball(14.5, 16.5, 8, 7, R.ichor, { n: 9, gloss: true, crown: 0.32 });
    p.mark([9, 14, 12.5, 18, 17.5, 16.5, 20, 20], s.part, 2);
    p.seg(21, 12, 26.5, 7, 2, FLESH);
    p.box(21.5, 9, 3, 2.2, R.stampRed, { bevel: 0.3, lum: 0.6 });
  },

  // ---- earth
  topsoil(p) {
    const g = heap(p, SOIL, 11, { top: 11, grains: 12, dark: 0, light: 4 });
    p.clip = g.inside; p.fline(8, 20, 12, 22.5, R.straw[4]); p.fline(12, 22.5, 13, 26, R.straw[3]); p.fline(20, 17, 24, 19.5, R.straw[4]); p.clip = null;
    p.leaf(15.5, 12, 11, 5.5, 3.6, LEAF, { bend: -0.15 }); p.leaf(16.5, 12, 22, 6.5, 3.6, LEAF, { bend: 0.15 });
  },
  clay(p) {
    // a wire-cut block of clay: smooth planes, the wire's drag lines, a thumbprint
    const top = p.poly([5, 13, 17, 7.5, 28, 11.5, 16, 17.5], CLAY, P_LIT);
    p.poly([5, 13, 16, 17.5, 16, 28.5, 5, 23.5], CLAY, P_MID, { part: top.part });
    p.poly([16, 17.5, 28, 11.5, 28, 22.5, 16, 28.5], CLAY, P_SH, { part: top.part });
    for (const y of [19.5, 22, 24.5]) p.mark([6, y - 4, 15.5, y], top.part, 2);
    p.mark([18, 11, 21, 12.4], top.part, 3);
    p.fdot(22, 11.4, 0.7, CLAY[3]);
  },
  sand(p) {
    // a long wind-shaped dune: a steep lee face, ripple marks on the windward slope, a shell
    const d = p.gem([2, 27.5, 5, 23, 10.5, 18.5, 16, 15.5, 20.5, 15, 23.5, 17.5, 27, 22.5, 30, 27.5], SAND, { crown: 0.2, top: 0.42 });
    p.clip = d.inside;
    for (let k = 0; k < 4; k++) { const y = 19.5 + k * 2.2, x0 = 6 + k * 0.6; p.fline(x0, y + 1, x0 + 3, y, SAND[5]); p.fline(x0 + 3, y, x0 + 6, y + 0.8, SAND[5]); p.fline(x0 + 6, y + 0.8, x0 + 9, y + 0.2, SAND[2]); }
    for (let i = 0; i < 10; i++) p.fdot(14 + h1(i, 3) * 13, 20 + h1(i, 4) * 7, 0.4, SAND[h1(i, 5) < 0.5 ? 1 : 5]);
    p.clip = null;
    p.gem([22, 27.6, 23.5, 25, 26, 24.6, 27.4, 26.4, 26.5, 28], R.bone, { crown: 0.3 });
  },
  gravel(p) {
    // angular pebbles of mixed stone, piled
    let s = 30;
    for (const [x, y, r, ramp] of [[7, 25, 3, STONE], [12.5, 26, 3.3, SLATE], [18.5, 25.6, 3.1, STONE], [24.5, 26.2, 3, R.sand], [9.5, 20, 3, SLATE], [15.5, 20.4, 3.2, STONE], [21.6, 20.6, 2.9, BASALT], [12.5, 15, 2.8, STONE], [18.4, 14.8, 2.9, R.sand], [15.5, 9.8, 2.6, SLATE]] as [number, number, number, Ramp][]) p.rock(x, y, r, s++, ramp, { n: 6, sq: 0.82, cracks: 0 });
  },
  peat(p) {
    // three cut peat bricks stacked: fibrous dark faces with root strands
    for (const [x, y] of [[5, 18], [17, 18], [10.5, 9.5]] as [number, number][]) {
      const t = p.poly([x, y + 3, x + 3, y, x + 13, y, x + 10, y + 3], SOIL, P_LIT);
      p.poly([x, y + 3, x + 10, y + 3, x + 10, y + 10, x, y + 10], SOIL, P_MID, { part: t.part });
      p.poly([x + 10, y + 3, x + 13, y, x + 13, y + 7, x + 10, y + 10], SOIL, P_SH, { part: t.part });
      for (let k = 0; k < 3; k++) p.mark([x + 1 + k * 3, y + 4.5 + (k % 2), x + 3 + k * 3, y + 8 + (k % 2)], t.part, 0);
      p.fline(x + 2, y + 6, x + 6, y + 7, R.straw[2]);
    }
  },
  compost(p) {
    const g = heap(p, SOIL, 41, { top: 12, grains: 10, dark: 1, light: 5 });
    p.clip = g.inside;
    for (const [x, y, a, ramp] of [[10, 20, 0.4, R.ochre], [19, 17, -0.6, LEAF], [21, 24, 0.9, R.ochre], [13.5, 25, -0.2, SAGE]] as [number, number, number, Ramp][]) p.leaf(x, y, x + Math.cos(a) * 5, y + Math.sin(a) * 3, 2.8, ramp, { vein: false });
    p.fdot(16, 15, 0.6, R.coral[3]); p.fdot(24, 22, 0.5, R.straw[4]);
    p.clip = null;
  },
  ash(p) {
    // a soft grey cone of ash: a charred stick in it, a last ember glowing at the crown
    const g = heap(p, STONE, 57, { top: 11, grains: 18, dark: 2, light: 6, w: 11.5 });
    p.seg(19, 13.5, 26, 7, 1.8, BASALT, { gloss: true });
    p.clip = g.inside; for (const [x, y, r] of [[9, 24, 1.2], [21, 23, 1], [14, 19, 0.8]] as [number, number, number][]) p.rock(x, y, r, 300 + x, BASALT, { n: 5, cracks: 0 }); p.clip = null;
    p.fdot(16.5, 12.6, 0.7, R.glowAmber[3]); p.fdot(17.4, 12.4, 0.45, R.glowAmber[4]);
    p.fline(17, 10.5, 16, 7.5, STONE[4]); p.fline(16, 7.5, 17, 4.5, STONE[3]);
  },
  rock_granite(p) {
    const r = stone(p, STONE, 3);
    p.clip = r.inside;
    for (let i = 0; i < 22; i++) { const x = 5 + h1(i, 4) * 19, y = 9 + h1(i, 5) * 16; p.fdot(x, y, i % 3 ? 0.5 : 0.75, i % 4 === 0 ? R.coral[4] : i % 2 ? STONE[1] : STONE[6]); }
    p.clip = null;
  },
  rock_basalt(p) {
    // columnar basalt: three hexagonal columns, flat tops lit, a few gas vesicles
    for (const [x, y, h] of [[8, 13, 15], [16.5, 9, 19], [24, 15, 12]] as [number, number, number][]) {
      const top = p.poly([x - 4, y, x - 2, y - 2.2, x + 2, y - 2.2, x + 4, y, x + 2, y + 2.2, x - 2, y + 2.2], BASALT, P_LIT);
      p.poly([x - 4, y, x - 2, y + 2.2, x - 2, y + h + 2, x - 4, y + h], BASALT, P_MID, { part: top.part });
      p.poly([x - 2, y + 2.2, x + 2, y + 2.2, x + 2, y + h + 2, x - 2, y + h + 2], BASALT, P_MID + 0.05, { part: top.part });
      p.poly([x + 2, y + 2.2, x + 4, y, x + 4, y + h, x + 2, y + h + 2], BASALT, P_SH, { part: top.part });
      p.mark([x - 1.6, y + h * 0.6, x + 1.6, y + h * 0.55], top.part, 0);
    }
    for (const [x, y] of [[15.5, 16], [17.5, 22], [8.5, 21], [24.5, 21]]) p.fdot(x, y, 0.5, BASALT[0]);
  },
  rock_limestone(p) {
    const r = stone(p, BONE, 9, { n: 7 });
    // a spiral shell fossil and two bivalves pressed into it
    p.clip = r.inside;
    p.farc(14, 16, 3.4, 0, TAU * 0.85, BONE[1]); p.farc(14.6, 16.3, 1.8, 0.5, TAU * 0.8, BONE[1]); p.fdot(14.8, 16.2, 0.4, BONE[1]);
    for (const [x, y] of [[8, 21], [20, 21.5]]) { p.farc(x, y, 1.6, Math.PI, TAU, BONE[2]); p.fline(x - 1.6, y, x + 1.6, y, BONE[2]); }
    p.clip = null;
  },
  rock_sandstone(p) {
    // layered sandstone: strata bands in alternating ramps, cross-bedded
    const r = stone(p, SAND, 15, { n: 7, sq: 0.8 });
    p.clip = r.inside;
    for (let k = 0; k < 5; k++) { const y = 10 + k * 3.6; p.fpoly([3, y, 27, y - 1.6, 27, y + 1.1, 3, y + 2.4], k % 2 ? R.clay[4] : R.sand[2]); }
    p.fline(8, 14, 13, 12.4, R.sand[5]); p.fline(16, 20.5, 22, 18.4, R.sand[5]);
    p.clip = null;
  },
  rock_slate(p) {
    // slate splitting into sheets: four thin stacked slabs, offset
    for (let k = 0; k < 4; k++) {
      const y = 22 - k * 3.6, x = 4 + (k % 2) * 2.5 + k * 0.6;
      const t = p.poly([x, y, x + 6, y - 4.5, x + 24, y - 4.5, x + 19, y], SLATE, P_LIT);
      p.poly([x, y, x + 19, y, x + 19, y + 2.2, x, y + 2.2], SLATE, P_MID, { part: t.part });
      p.poly([x + 19, y, x + 24, y - 4.5, x + 24, y - 2.3, x + 19, y + 2.2], SLATE, P_SH, { part: t.part });
      p.mark([x + 7, y - 2.2, x + 13, y - 3], t.part, 2);
    }
  },
  rock_obsidian(p) {
    // volcanic glass: sharp conchoidal facets, near-black with a cold blue sheen and bright glints
    p.gem([4, 22, 8, 10, 15, 4.5, 21, 7, 27.5, 13, 26, 24, 17, 28.5, 9, 27.5], INK.concat(SLATE.slice(2)) as Ramp, { crown: 0.34, top: 0.35, gloss: true });
    p.fline(9, 13, 14, 8, SLATE[5]); p.fline(16, 8.5, 22, 11, SLATE[4]); p.farc(17, 20, 4.5, -2.4, -0.8, SLATE[3]);
    p.fdot(10.5, 11.2, 0.6, SNOW[5]);
  },

  // ---- minerals
  malachite(p) {
    // a polished nodule of malachite: concentric green bands
    const m = p.ball(16, 17, 12, 10.5, R.malachite, { n: 9, crown: 0.24, gloss: true });
    p.clip = m.inside;
    for (let k = 0; k < 4; k++) p.farc(13, 21, 3 + k * 2.6, -2.9, 0.2, R.malachite[k % 2 ? 1 : 5], 0.5);
    p.clip = null;
  },
  amethyst(p) { cluster(p, R.amethyst, STONE, 71); },
  ruby(p) {
    // hexagonal corundum barrels in a pale matrix, deep red with a silky sheen
    p.rock(16, 26.5, 11.5, 81, R.bone, { sq: 0.36, n: 7 });
    for (const [x, y, h, w] of [[11, 26, 12, 3.4], [20, 26.5, 15, 3.8], [25.5, 27, 7, 2.6]] as [number, number, number, number][]) {
      p.poly([x - w, y, x - w * 0.5, y + 1.2, x - w * 0.5, y - h + 1.2, x - w, y - h], R.ruby, P_MID);
      p.poly([x - w * 0.5, y + 1.2, x + w * 0.5, y + 1.2, x + w * 0.5, y - h + 1.2, x - w * 0.5, y - h + 1.2], R.ruby, P_TOP);
      p.poly([x + w * 0.5, y + 1.2, x + w, y, x + w, y - h, x + w * 0.5, y - h + 1.2], R.ruby, P_SH);
      p.poly([x - w, y - h, x - w * 0.5, y - h - 1.2, x + w * 0.5, y - h - 1.2, x + w, y - h, x + w * 0.5, y - h + 1.2, x - w * 0.5, y - h + 1.2], R.ruby, P_LIT, { gloss: true });
    }
  },
  salt(p) {
    // a heap of cubic halite crystals
    let s = 90;
    for (const [x, y, w] of [[6, 22, 6], [12.5, 23, 6.5], [19.5, 22.5, 6], [9.5, 16, 5.5], [16, 16.5, 6], [13, 10.5, 5]] as [number, number, number][]) {
      const t = p.poly([x, y, x + w * 0.4, y - w * 0.35, x + w * 1.1, y - w * 0.35, x + w * 0.7, y], SNOW, P_LIT, { gloss: true });
      p.poly([x, y, x + w * 0.7, y, x + w * 0.7, y + w * 0.7, x, y + w * 0.7], SNOW, P_MID, { part: t.part });
      p.poly([x + w * 0.7, y, x + w * 1.1, y - w * 0.35, x + w * 1.1, y + w * 0.35, x + w * 0.7, y + w * 0.7], SNOW, P_SH, { part: t.part });
      s++;
    }
    void s;
  },
  saltpetre(p) {
    // white-yellow nitre crust scraped into an enamel dish
    p.poly([3, 21, 29, 21, 26, 28.5, 6, 28.5], R.olive, P_MID);
    p.poly([3, 21, 29, 21, 27.5, 22.4, 4.5, 22.4], R.olive, P_LIT);
    for (const [x, y, r, sd] of [[9, 19, 3.6, 1], [15, 17.5, 4.4, 2], [21.5, 18.8, 3.8, 3], [12, 13.6, 2.8, 4], [18, 13, 2.6, 5]] as [number, number, number, number][]) p.rock(x, y, r, 100 + sd, PAPER, { n: 6, sq: 0.7, cracks: 0 });
    for (const [x, y] of [[10, 18], [16, 16], [20, 17.6], [13, 12.8]]) p.fdot(x, y, 0.45, R.straw[5]);
  },
  gold_ore(p) {
    const r = p.rock(16, 17, 12, 37, R.quartz, { sq: 0.82, n: 8 });
    p.clip = r.inside;
    p.seg(6, 20, 25, 12, 1.4, STONE);
    for (const [x, y, rr, sd] of [[11, 15, 2.4, 1], [18.5, 19.5, 2, 2], [22.5, 12.5, 1.8, 3], [9, 22, 1.4, 4], [15, 11, 1.2, 5]] as [number, number, number, number][]) p.rock(x, y, rr, 120 + sd, R.gold, { n: 5, gloss: true });
    p.clip = null;
  },
  sulphur(p) {
    // a crust of sulphur crystals on grey vent rock
    p.rock(16, 24.5, 12, 47, STONE, { sq: 0.5, n: 7 });
    for (const [x, y, w, h, l] of [[9, 23, 2.4, 6, -1], [14, 22.5, 3, 9, 0.4], [19.5, 23, 2.6, 7, 1.2], [24, 23.5, 2, 4.5, 1.4], [11.5, 23.5, 1.6, 3.5, -0.4]] as [number, number, number, number, number][]) crystalForm(p, x, y, w, h, l, R.straw, 0.95);
    p.fdot(6, 22, 0.6, R.straw[5]); p.fdot(26, 21, 0.5, R.straw[4]);
  },
  lumen_crystal(p) { cluster(p, R.glowTeal, BASALT, 61, { glow: R.glowTeal }); },
  gravium(p) {
    // a dark violet stone hovering over its own shadow, field lines bending round it
    p.plate(16, 28, 9, 1.8, INK[1]);
    p.rock(16, 15, 10, 51, R.amethyst, { n: 7, sq: 0.86, gloss: true });
    p.farc(16, 15, 13, -2.6, -0.5, R.violet[4], 0, 0.6, -1, 1); p.farc(16, 15, 13, 0.5, 2.6, R.violet[4], 0, 0.6, -1, 1);
    p.fdot(12, 11, 0.6, R.amethyst[6]);
  },

  // ---- fluids
  brine(p) {
    const c = flask(p, R.olive, R.water, { level: 0.7 });
    p.box(9, 22, 14, 3, SNOW, { clip: c.inside, lum: 0.75, bevel: 0.4 });
    for (const [x, y] of [[10, 21.4], [21, 21.6], [15, 21.2]]) p.fdot(x, y, 0.5, SNOW[5]);
  },
  sap(p) {
    // a tapped sap bucket: a tin pail on a spile, amber sap dripping into it
    p.seg(8, 6, 17, 9, 1.6, STEEL);
    const b = p.bevel([7, 14, 25, 14, 23, 28.5, 9, 28.5], STEEL, { w: 1.2, lum: P_MID });
    p.poly([8, 14, 24, 14, 23.4, 17, 8.6, 17], R.ochre, P_TOP, { clip: b.inside, gloss: true });
    p.mark([8, 21, 24, 21], b.part, 1);
    p.fline(17.5, 9.5, 17.5, 12.5, R.ochre[5]); p.fdot(17.5, 13.2, 0.6, R.ochre[4]);
    p.seg(7, 14, 4, 9, 0.8, STEEL); p.seg(25, 14, 28, 9, 0.8, STEEL);
  },

  // ---- refined goods
  plank(p) {
    // three sawn planks stacked crosswise: end grain on the cut ends, a knot, saw lines
    for (const [y, k] of [[20, 0], [14.5, 1], [9, 2]] as [number, number][]) {
      const t = p.poly([3, y + 3, 7, y, 29, y, 25, y + 3], R.ochre, P_LIT);
      p.poly([3, y + 3, 25, y + 3, 25, y + 6.5, 3, y + 6.5], R.ochre, P_MID, { part: t.part });
      p.poly([25, y + 3, 29, y, 29, y + 3.5, 25, y + 6.5], WOOD, P_MID, { part: t.part });
      p.mark([8, y + 1.4, 22, y + 1.4], t.part, 2); p.mark([5, y + 4.6, 18 + k * 2, y + 4.6], t.part, 2);
      if (k === 1) p.fdot(14, y + 4.8, 0.7, R.ochre[1]);
    }
  },
  charcoal(p) {
    // chunks of charcoal: black with the wood's grain still showing, a silvery sheen on the breaks
    let s = 140;
    for (const [x, y, r] of [[10, 21, 6.5], [21.5, 22, 6], [15.5, 12.5, 6]] as [number, number, number][]) {
      const c = p.rock(x, y, r, s++, BASALT, { n: 6, sq: 0.9, gloss: true, cracks: 0 });
      for (let k = -1; k <= 1; k++) p.mark([x - r * 0.7, y + k * 2 - 1, x + r * 0.6, y + k * 2 + 0.6], c.part, 0);
    }
  },
  brick(p) {
    // fired bricks stacked two and one, mortar-free: frogged tops, kiln-dark edges
    for (const [x, y] of [[4, 18], [16, 18], [10, 9.5]] as [number, number][]) {
      const t = p.poly([x, y + 3.2, x + 3.2, y, x + 14.2, y, x + 11, y + 3.2], CLAY, P_LIT);
      p.poly([x, y + 3.2, x + 11, y + 3.2, x + 11, y + 9.5, x, y + 9.5], CLAY, P_MID + 0.05, { part: t.part });
      p.poly([x + 11, y + 3.2, x + 14.2, y, x + 14.2, y + 6.4, x + 11, y + 9.5], CLAY, P_SH, { part: t.part });
      p.mark([x + 4, y + 1.6, x + 9.5, y + 1.6], t.part, 2);
      p.fdot(x + 2, y + 7.5, 0.5, CLAY[1]);
    }
  },
  feed(p) {
    const s = sack(p, STRAW);
    p.box(10.5, 17, 11, 6.5, PAPER, { bevel: 0.5, lum: 0.62 });
    p.mark([12, 19.4, 20, 19.4], s.part, 1);
    for (const [x, y] of [[4, 28], [6.5, 29.5], [27, 29], [25, 30]]) p.fdot(x, y, 0.6, STRAW[2]);
    p.fline(12.5, 19.6, 19.5, 19.6, INK[1]); p.fline(12.5, 21.4, 17, 21.4, INK[1]);
  },
  crushed_ore(p) {
    // crushed, washed ferrite: a pile of small sharp chunks, rust bloom on a few faces
    let n = 160;
    for (const [x, y, r] of [[7, 26, 2.6], [12, 26.6, 2.8], [17.5, 26.2, 2.7], [23, 26.5, 2.6], [27, 27, 1.8], [9.5, 21.6, 2.6], [14.8, 21.8, 2.8], [20.4, 21.6, 2.7], [25, 22.6, 2], [12.4, 17, 2.5], [18, 17.2, 2.6], [15.4, 12.6, 2.4], [21.5, 13.5, 1.6]] as [number, number, number][]) {
      p.rock(x, y, r, n++, R.iron, { n: 5, sq: 0.85, jag: 0.35, cracks: 0, gloss: n % 3 === 0 });
    }
    for (const [x, y] of [[12, 25.5], [19, 21], [16, 16.5], [24, 25.5], [9, 21]]) p.fdot(x, y, 0.5, R.rust[4]);
  },
  gold_ingot(p) { itemIngot(p, R.gold); },
  acid(p) {
    // a stoppered glass carboy of yellow acid in a wicker cage
    const g = p.ball(16, 19, 10, 9.5, GLASS, { n: 9, gloss: true });
    p.box(6, 18, 20, 11, R.straw, { clip: g.inside, lum: 0.6, bevel: 0.6 });
    p.box(13, 6, 6, 4.5, GLASS, { bevel: 0.6, lum: 0.6 }); p.box(12.6, 4, 6.8, 2.6, CORK, { bevel: 0.5, lum: 0.55 });
    p.clip = g.inside; for (let k = 0; k < 5; k++) p.fline(7 + k * 4.5, 12, 6 + k * 5, 29, R.ochre[2]); p.fline(5, 24, 27, 24, R.ochre[2]); p.clip = null;
    p.gem([16, 20, 18.4, 23.6, 16, 26, 13.6, 23.6], INK, { crown: 0.2 });
  },
  powder(p) {
    // a powder keg: banded staves, a stencilled mark, a fuse
    const k = p.tank(7, 7, 18, 21, WOOD, { r: 2.4 });
    for (const y of [10, 25]) p.box(7, y, 18, 1.6, STEEL, { clip: k.inside, lum: 0.5, bevel: 0.3 });
    for (let i = 0; i < 4; i++) p.mark([10 + i * 4, 8, 10 + i * 4, 27], k.part, 2);
    p.gem([16, 14, 19.4, 17.5, 16, 21, 12.6, 17.5], R.stampRed, { crown: 0.2 });
    p.fline(16, 7, 19, 3, BASALT[3]); p.fdot(19.4, 2.6, 0.6, R.glowAmber[3]);
  },
  gold_leaf(p) {
    // a card of gold contacts: bright tabs in a row on a Bakelite strip
    p.box(4, 12, 24, 9, CLAY, { bevel: 0.8, lum: 0.5 });
    for (let i = 0; i < 6; i++) p.box(5.5 + i * 3.8, 17, 2.6, 7.5, R.gold, { bevel: 0.4, lum: 0.62, gloss: true });
    p.fline(6, 14, 26, 14, CLAY[4]);
  },
  lumen_lens(p) {
    // a ground lumen crystal set in a brass bezel, catching light
    p.ring(16, 16, 9, 12.5, BRASS, { n: 10 });
    p.gem([16, 7.5, 23, 11, 24, 18, 19.5, 24, 12.5, 24, 8, 18, 9, 11], R.glowTeal, { crown: 0.32, top: 0.5 });
    p.glow(13.5, 13, 1.6, R.glowTeal);
    for (const [x, y] of [[16, 4], [27, 16], [16, 28], [5, 16]]) p.rivet(x, y, 0.8, BRASS);
  },
  grav_plate(p) {
    // a steel plate with a violet gravium inlay, floating a hair over its shadow
    p.plate(16, 27.5, 12, 1.6, INK[1]);
    const t = p.poly([3, 15, 10, 9, 29, 9, 22, 15], STEEL, P_LIT);
    p.poly([3, 15, 22, 15, 22, 20, 3, 20], STEEL, P_MID, { part: t.part });
    p.poly([22, 15, 29, 9, 29, 14, 22, 20], STEEL, P_SH, { part: t.part });
    p.poly([8, 13.6, 12, 10.4, 24, 10.4, 20, 13.6], R.amethyst, P_TOP, { gloss: true });
    p.fline(12, 12, 21, 12, R.violet[5]);
  },
  precision_circuit(p) {
    // a green-black board with gold traces and a gold edge connector
    const b = p.bevel([4, 8, 28, 8, 28, 24, 4, 24], R.teal, { w: 1, lum: P_SH });
    for (const pts of [[7, 12, 12, 12, 14, 15, 20, 15], [7, 19, 11, 19, 13, 17, 24, 17], [17, 11, 22, 11, 24, 13]]) p.mark(pts, b.part, 4);
    p.box(14, 18.5, 5, 4, INK, { bevel: 0.5, lum: 0.4 });
    for (let i = 0; i < 7; i++) p.box(5.5 + i * 3.1, 24, 1.8, 4, R.gold, { bevel: 0.3, lum: 0.62 });
    p.fdot(22.5, 21, 0.7, R.ruby[4]);
  },
  lumen_cell(p) {
    // a brass-capped cell, a window on a glowing lumen core
    const c = p.tank(9, 6, 14, 22, STEEL, { r: 2 });
    p.box(12, 11, 8, 12, INK, { clip: c.inside, lum: 0.3, bevel: 0.4 });
    p.glow(16, 17, 3, R.glowTeal);
    p.box(9, 5, 14, 3, BRASS, { bevel: 0.5, lum: 0.6 }); p.box(9, 25.5, 14, 3, BRASS, { bevel: 0.5, lum: 0.5 });
    p.box(14, 2.4, 4, 2.8, BRASS, { bevel: 0.4, lum: 0.7 });
  },
  grav_coil(p) {
    // a violet core wound with copper, steel end flanges
    p.seg(16, 4, 16, 28, 5, R.amethyst);
    for (let i = 0; i < 6; i++) p.ring(16, 9 + i * 3, 2.8, 6.5, R.copper, { ry: 0.36, n: 8 });
    p.box(8, 3.6, 16, 3, STEEL, { bevel: 0.6, lum: 0.6 }); p.box(8, 26, 16, 3, STEEL, { bevel: 0.6, lum: 0.45 });
    p.glow(16, 6.5, 1, R.glowTeal);
  },

  // ---- redrawn in the icon style (these had only the old 16 px drawing)
  carbon(p) {
    // a bale of chopped biomass: a block of stalk ends and husk, bound with two cords
    const t = p.poly([4, 12, 11, 6, 28, 6, 21, 12], STRAW, P_LIT);
    p.poly([4, 12, 21, 12, 21, 27, 4, 27], R.ochre, P_MID, { part: t.part });
    p.poly([21, 12, 28, 6, 28, 21, 21, 27], R.ochre, P_SH, { part: t.part });
    for (let i = 0; i < 9; i++) { const x = 5.5 + (i % 5) * 3.3, y = 14.5 + Math.floor(i / 5) * 6; p.mark([x, y, x + 1.4, y + 3.6], t.part, 1); }
    for (let i = 0; i < 6; i++) p.mark([7 + i * 3.4, 8.5, 9 + i * 3.4, 10.5], t.part, 3);
    for (const x of [9, 16]) { p.fline(x, 12, x, 27, R.fur[1]); p.fline(x, 12, x + 7, 6, R.fur[1]); }
  },
};

let done = false;
/** register every drawing with the icon set (items.ts calls this once) */
export function installItemArt() {
  if (done) return;
  done = true;
  for (const [id, art] of Object.entries(ART)) registerItemArt(id, art);
}
export const REAL_ART_IDS = Object.keys(ART);
void P_SH; void P_MID; void P_TOP; void P_LIT;
