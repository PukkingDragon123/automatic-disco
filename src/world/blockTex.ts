// Terrain block textures: the ground as hand-drawn pixel art. TS pixels per metre (48: the plants' own pixel size, so
// ground and growth read as one drawing at the default 13-30 m zoom) on painted macro tiles of TILE_M x TILE_M metres
// (4 x 4 m, 192 x 192 px), one layer per material and variant in a DataArrayTexture. Each tile is built from drawn
// motifs placed at random (blade clumps with a dark shadow-side edge and a lit tip, flower specks, faceted pebbles
// with an outline and a glint, drawn cracks, ripple strokes, clods, tiny leaves, plates with fracture edges, puddle
// glints, crust with blue shadow clusters), 3-5 flat tones per material from the palette v2 ramps, no gradients and no
// noise fills. The terrain shader (terrain.ts) samples each tile at a random whole-pixel offset per cell of a warped
// grid, knits neighbouring cells and materials together pixel by pixel, and lets the land (slope, height, curvature,
// moisture, fertility, wear, season) choose between the lush, sparse, stony and dry variants: the fields choose and
// vary the motifs, they are never the visible texture.
// Alpha < 255 on a layer marks emissive pixels (glow = 1 - a/255).
import * as THREE from 'three';
import { PixelCanvas } from '../limbo/gfx/pixel';
import { Rand } from '../core/rand';
import { rampFor, rampNamed, kinRamps, stone, nugget, prism, crackLine, leafStroke, fillPoly, Mask, toPalette, type P2 } from './pixelKit';
import { VEYR, RIVALS, type Palette } from './palette';

/** ground pixel density: pixels per metre (the terrain, water and rock shaders read it) */
export const TS = 48;
/** a painted tile covers TILE_M x TILE_M metres */
export const TILE_M = 4;
/** tile size in pixels */
export const TT = TS * TILE_M;
const T = TT;
/** the old art's layout unit (1/32 m) in pixels, and how many square metres one tile covers */
const K = TS / 32, AREA = TILE_M * TILE_M;
const k = (v: number) => Math.round(v * K);

export const L = {
  grassA: 0, grassB: 1, grassSide: 2, soil: 3, rockA: 4, rockB: 5, rockSide: 6, sandA: 7, sandB: 8, mud: 9, clay: 10,
  snow: 11, snowSide: 12, basalt: 13, basaltSide: 14, ore: 15, oreSide: 16, crystal: 17, crystalSide: 18, litter: 19,
  gravel: 20, moss: 21, mossSide: 22, creep0: 23, creep1: 24, creep2: 25, creepSide: 26, dryA: 27, drySide: 28, mudSide: 29, crater: 30,
  /** stony soil: the stonier variant of soil (scree, worn ground) */
  soilB: 31,
  /** burnt ground: char, ash drifts, charred sticks, ember specks (terrain.scorch) */
  ash: 32,
  /** cliff strata by rock family (terrain.setGeo R: 1 sandstone, 3 limestone, 4 slate, 5 granite, 6 tuff) */
  sandstoneSide: 33, limestoneSide: 34, slateSide: 35, graniteSide: 36, tuffSide: 37,
  /** ore veins on transparency, by kind (terrain.setGeo B: 0 iron, 1 lumen, 2 copper, 3 gold, 4 coal, 5 sulphur, 6 gravium) */
  veinIron: 38, veinLumen: 39, veinCopper: 40, veinGold: 41, veinCoal: 42, veinSulphur: 43, veinGravium: 44,
  /** spring mineral crust terraces, from above (terrain.setGeo A >= 128: 0 white, 1 ochre, 2 rust) */
  crustWhite: 45, crustOchre: 46, crustRust: 47,
} as const;
export const LAYERS = 48;
/** rock family -> strata layer, ore kind -> vein layer (terrain.setGeo ids) */
export const FAMILY_SIDE = [L.rockSide, L.sandstoneSide, L.basaltSide, L.limestoneSide, L.slateSide, L.graniteSide, L.tuffSide];
export const VEIN_LAYER = [L.veinIron, L.veinLumen, L.veinCopper, L.veinGold, L.veinCoal, L.veinSulphur, L.veinGravium];

/** surface block kinds */
export const enum B { GRASS, DRY, SOIL, ROCK, SAND, MUD, CLAY, SNOW, BASALT, ORE, CRYSTAL, LITTER, GRAVEL, CRATER }
/** [top layers], side within 1 m of the top, side deeper down */
export const BLOCKS: Record<number, { top: number[]; side: number; deep: number; name: string }> = {
  [B.GRASS]: { top: [L.grassA, L.grassB], side: L.grassSide, deep: L.soil, name: 'grass' },
  [B.DRY]: { top: [L.dryA], side: L.drySide, deep: L.soil, name: 'dry grass' },
  [B.SOIL]: { top: [L.soil, L.soilB], side: L.soil, deep: L.soil, name: 'soil' },
  [B.ROCK]: { top: [L.rockA, L.rockB], side: L.rockSide, deep: L.rockSide, name: 'rock' },
  [B.SAND]: { top: [L.sandA, L.sandB], side: L.sandB, deep: L.soil, name: 'sand' },
  [B.MUD]: { top: [L.mud], side: L.mudSide, deep: L.soil, name: 'mud' },
  [B.CLAY]: { top: [L.clay], side: L.clay, deep: L.rockSide, name: 'clay' },
  [B.SNOW]: { top: [L.snow], side: L.snowSide, deep: L.rockSide, name: 'snow' },
  [B.BASALT]: { top: [L.basalt], side: L.basaltSide, deep: L.basaltSide, name: 'basalt' },
  [B.ORE]: { top: [L.ore], side: L.oreSide, deep: L.rockSide, name: 'ferrite' },
  [B.CRYSTAL]: { top: [L.crystal], side: L.crystalSide, deep: L.rockSide, name: 'lumen crystal' },
  [B.LITTER]: { top: [L.litter], side: L.grassSide, deep: L.soil, name: 'leaf litter' },
  [B.GRAVEL]: { top: [L.gravel], side: L.gravel, deep: L.rockSide, name: 'gravel' },
  [B.CRATER]: { top: [L.crater], side: L.crater, deep: L.basaltSide, name: 'impact glass' },
};

const RF = (c: number) => rampFor(c, 7);
/** a pixel inside the tile, wrapping */
const W = (v: number) => ((Math.floor(v) % T) + T) % T;
const clampI = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ================================================================================================ toolkit
/**
 * Angular tone plates over the whole tile, fast: a jittered grid of seeds (cellPx apart) and an octagonal distance
 * (straight facets, no round cells), each plate one ramp step from idx; bevel lights the upper-left rim and darkens
 * the lower-right one; seam draws the joints between plates in that step (joint is its width in texels).
 */
function plates(pc: PixelCanvas, r: Rand, cellPx: number, ramp: number[], idx: number[], o: { bevel?: boolean; seam?: number; joint?: number } = {}) {
  const G = Math.max(2, Math.round(T / cellPx)), cw = T / G, top = ramp.length - 1, joint = o.joint ?? 1;
  const px = new Float32Array(G * G), py = new Float32Array(G * G), tone = new Int8Array(G * G);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const c = j * G + i; px[c] = (i + r.range(0.12, 0.88)) * cw; py[c] = (j + r.range(0.12, 0.88)) * cw; tone[c] = idx[r.int(0, idx.length - 1)]; }
  const map = new Int32Array(T * T), edge = new Float32Array(T * T);
  for (let y = 0; y < T; y++) {
    const gy = Math.floor(y / cw);
    for (let x = 0; x < T; x++) {
      const gx = Math.floor(x / cw);
      let d1 = 1e9, d2 = 1e9, i1 = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const c = ((gy + dj + G) % G) * G + ((gx + di + G) % G);
        let dx = Math.abs(x + 0.5 - px[c]); dx = Math.min(dx, T - dx);
        let dy = Math.abs(y + 0.5 - py[c]); dy = Math.min(dy, T - dy);
        const d = Math.max(dx, dy) * 0.62 + (dx + dy) * 0.38;
        if (d < d1) { d2 = d1; d1 = d; i1 = c; } else if (d < d2) d2 = d;
      }
      map[y * T + x] = i1; edge[y * T + x] = d2 - d1;
    }
  }
  const at = (x: number, y: number) => map[(((y % T) + T) % T) * T + (((x % T) + T) % T)];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = map[y * T + x];
    let t = tone[i];
    if (o.seam !== undefined && edge[y * T + x] < joint) t = o.seam;
    else if (o.bevel) { if (at(x - 1, y) !== i || at(x, y - 1) !== i) t += 1; else if (at(x + 1, y) !== i || at(x, y + 1) !== i) t -= 1; }
    pc.set(x, y, ramp[clampI(t, 0, top)]);
  }
  return { map, at, edge };
}

/** a blade of grass: a stroke from its root toward ang (radians, texture space), two texels wide near the root,
 *  curving a little, dark at the root and lit toward the tip; tip (another ramp) sun-cures the last third */
function blade(pc: PixelCanvas, x: number, y: number, len: number, ang: number, bend: number, ramp: number[], k0: number, k1: number, tip?: number[], lit = false) {
  const n = ramp.length - 1, dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx;
  let lx = 1e9, ly = 1e9;
  for (let s = 0; s <= len; s += 0.7) {
    const t = s / len, c = bend * t * t * len * 0.35;
    const X = Math.round(x + dx * s + px * c), Y = Math.round(y + dy * s + py * c);
    if (X === lx && Y === ly) continue;
    lx = X; ly = Y;
    const kk = clampI(Math.round(k0 + (k1 - k0) * t), 0, n);
    const col = tip && t > 0.66 ? tip[clampI(kk, 1, tip.length - 1)] : ramp[kk];
    pc.set(X, Y, col);
    // the blade's width near the root: a darker texel on the shadow side
    if (t < 0.45) { if (Math.abs(px) > 0.5) pc.set(X + (px > 0 ? 1 : -1), Y, ramp[clampI(kk - 1, 0, n)]); else pc.set(X, Y + 1, ramp[clampI(kk - 1, 0, n)]); }
    if (lit && t > 0.25 && t < 0.8) pc.set(X - 1, Y, ramp[clampI(kk + 1, 0, n)]);
  }
}

/** an irregular polygon round (cx, cy): n corners at radius r..r*(1-j), as points */
function blobPts(cx: number, cy: number, rx: number, ry: number, n: number, r: Rand, j = 0.35): P2[] {
  const a0 = r.range(0, Math.PI * 2), pts: P2[] = [];
  for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI * 2 + r.range(-0.22, 0.22), s = 1 - r.range(0, j); pts.push([cx + Math.cos(a) * rx * s, cy + Math.sin(a) * ry * s]); }
  return pts;
}
/** fill a polygon with one colour (wrapping) */
function polyFill(pc: PixelCanvas, pts: P2[], col: number, alpha = 255) { fillPoly(pts, (x, y) => pc.set(x, y, col, alpha)); }

/** a wandering line (root, twig, straw): 1 texel, with a darker texel under it */
function thread(pc: PixelCanvas, r: Rand, x: number, y: number, len: number, ang: number, col: number, under: number | null, wobble = 0.35) {
  let a = ang;
  for (let s = 0; s < len; s++) {
    a += r.range(-wobble, wobble) * 0.5;
    x += Math.cos(a); y += Math.sin(a);
    pc.set(Math.round(x), Math.round(y), col);
    if (under !== null) pc.set(Math.round(x), Math.round(y) + 1, under);
  }
}

/** clean up without allocating: a lone texel unlike all four neighbours takes a colour two of them share */
function tidy(pc: PixelCanvas) {
  const d = pc.data, src = new Uint32Array(T * T);
  for (let i = 0; i < T * T; i++) src[i] = d[i * 4 + 3] === 0 ? 0x2000000 : (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2] | (d[i * 4 + 3] < 255 ? 0x1000000 : 0);
  const g = (x: number, y: number) => src[(((y % T) + T) % T) * T + (((x % T) + T) % T)];
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const c = src[y * T + x]; if (c & 0x3000000) continue;
    const a = g(x - 1, y), b = g(x + 1, y), e = g(x, y - 1), f = g(x, y + 1);
    if (a === c || b === c || e === c || f === c) continue;
    let best = -1;
    if ((a === b || a === e || a === f) && !(a & 0x3000000)) best = a;
    else if ((b === e || b === f) && !(b & 0x3000000)) best = b;
    else if (e === f && !(e & 0x3000000)) best = e;
    if (best >= 0) pc.set(x, y, best & 0xffffff, d[(y * T + x) * 4 + 3]);
  }
}

// ================================================================================================ grass
/** one blade as pixel art: a 1 px stroke from its root, its lower half edged in the darkest step on the shadow side,
 *  the body stepping up the ramp, a lit tip pixel (or a sun-cured one) */
function blade1(pc: PixelCanvas, x: number, y: number, len: number, lean: number, R: number[], k0: number, tip: number) {
  const n = R.length - 1;
  for (let i = 0; i < len; i++) {
    const t = len > 1 ? i / (len - 1) : 1, off = Math.round(lean * t * t * len * 0.45);
    const X = x + off, Y = y - i;
    pc.set(X, Y, i === len - 1 ? tip : R[clampI(Math.round(k0 + t * (n - 1 - k0)), 0, n)]);
    if (t < 0.5) pc.set(X + 1, Y, R[clampI(k0 - 1, 0, n)]);
  }
}
/**
 * Turf: a calm floor of broad plates in two neighbouring greens (bare earth showing where it is thin), short blade
 * marks scattered on it, then distinct tussocks spaced apart and drawn back to front: a fan of blades from a shaded
 * root, the sun side lit, the shadow side edged in the darkest step, a bright tip (sun-cured on some). Flower specks
 * and clover where it is lush, fallen straw where it is dry. lush 0..1: 0 thin and dry, 1 dense and in flower.
 */
function grassTop(pc: PixelCanvas, pal: Palette, base: number, seed: number, lush: number) {
  const r = new Rand(seed), S = RF(pal.soil), kin = kinRamps(base), G = kin[0], D = RF(pal.grassDry);
  const P = plates(pc, r, 11, G, [2, 2, 3, 3]);
  // bare earth in the thin places (whole plates, so the patches have drawn edges)
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) if ((((P.map[y * T + x] * 2654435761) >>> 0) >>> 24) / 256 < 0.18 - lush * 0.16) pc.set(x, y, S[(P.map[y * T + x] & 1) + 2]);
  // blade marks on the floor: two-pixel strokes, a lit one over a shaded one
  for (let i = 0; i < Math.round((70 + lush * 50) * AREA); i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, G[4]); pc.set(x, y + 1, G[1]); }
  // tussocks, kept apart, back (top) to front
  const tufts: { x: number; y: number; n: number; R: number[] }[] = [];
  const want = Math.round((13 + lush * 12) * AREA);
  for (let t = 0; tufts.length < want && t < want * 6; t++) {
    const x = r.int(0, T - 1), y = r.int(0, T - 1);
    if (tufts.some((q) => Math.abs(q.x - x) < 4 && Math.abs(q.y - y) < 4)) continue;
    tufts.push({ x, y, n: r.int(3, 6), R: r.chance(0.15) ? kin[1] : r.chance(0.12 + (1 - lush) * 0.3) ? D : G });
  }
  tufts.sort((a, b) => a.y - b.y);
  for (const t of tufts) {
    // the root's shadow, falling down and to the right
    pc.set(t.x, t.y + 1, t.R[0]); pc.set(t.x + 1, t.y + 1, t.R[0]); pc.set(t.x + 2, t.y + 1, t.R[1]);
    const reach = r.int(4, 6);
    for (let b = 0; b < t.n; b++) {
      const fan = (b - (t.n - 1) / 2) * 1.1, len = Math.max(3, Math.round(reach - Math.abs(fan) * 0.7 + r.range(-0.5, 0.5)));
      const sun = fan < 0, dry = r.chance(0.08 + (1 - lush) * 0.3);
      blade1(pc, t.x + Math.round(fan), t.y, len, fan * 0.45, t.R, sun ? 4 : 2, dry ? D[5] : t.R[sun ? 6 : 5]);
    }
  }
  // flower specks: a four-petal cross round an eye
  if (lush > 0.4) for (let i = 0; i < Math.round(1.2 * AREA * lush); i++) {
    const F = RF(r.pick(pal.bloom)), x = r.int(1, T - 2), y = r.int(1, T - 2), O = rampNamed('ochre');
    pc.set(x, y - 1, F[5]); pc.set(x - 1, y, F[5]); pc.set(x + 1, y, F[4]); pc.set(x, y + 1, F[3]); pc.set(x, y, O[5]); pc.set(x + 1, y + 1, F[1]);
  }
  // clover: three leaflets round a dark heart
  const Cl = rampNamed('sage');
  for (let i = 0; i < Math.round(0.8 * AREA * lush); i++) {
    const x = r.int(1, T - 2), y = r.int(1, T - 2);
    pc.set(x, y - 1, Cl[4]); pc.set(x - 1, y, Cl[4]); pc.set(x + 1, y, Cl[3]); pc.set(x - 1, y - 1, Cl[5]); pc.set(x + 1, y - 1, Cl[3]); pc.set(x, y, Cl[1]); pc.set(x, y + 1, Cl[2]);
  }
  // fallen straw where it is dry
  for (let i = 0; i < Math.round(2 * AREA * (1.2 - lush)); i++) {
    let x = r.int(0, T - 1), y = r.int(0, T - 1); const dx = r.pick([-1, 1]), l = r.int(4, 7);
    for (let j = 0; j < l; j++) { pc.set(x, y, D[5]); pc.set(x, y + 1, D[2]); x += dx; if (r.chance(0.3)) y += r.pick([-1, 1]); }
  }
  tidy(pc);
}

/** the turf edge seen from the side: soil below, a ragged fringe of blades over the lip, roots threading down */
function grassSide(pc: PixelCanvas, grass: number, soil: number, seed: number) {
  const r = new Rand(seed), G = RF(grass), S = RF(soil);
  soilTop(pc, soil, seed + 1, 0.4);
  let len = 5;
  for (let x = 0; x < T; x++) {
    if (r.chance(0.5)) len = Math.max(3, Math.min(8, len + r.pick([-1, 1])));
    const l = x >= T - 2 ? 5 : len;
    for (let y = 0; y < l; y++) pc.set(x, y, G[y < 1 ? 5 : y < l - 2 ? 4 : 3]);
    pc.set(x, l, G[1]); pc.set(x, l + 1, S[1]);
  }
  tidy(pc);
}

// ================================================================================================ soil
/** dirt: angular plates and clods lit on their upper left, drawn cracks with a lit lip, faceted pebbles with an outline
 *  and a glint, pale root threads, a twig or two. stones 0..1 sets how stony it is (soilB is the stony variant) */
function soilTop(pc: PixelCanvas, soil: number, seed: number, stones = 1) {
  const r = new Rand(seed), S = RF(soil), St = rampNamed('stone'), Tw = rampNamed('fur');
  plates(pc, r, 10, S, [2, 3, 3, 4], { bevel: true });
  for (let i = 0; i < 4 * AREA; i++) crackLine(pc, r.int(0, T - 1), r.int(0, T - 1), r.int(4, 10), S[0], S[5], r);
  // clods: lumps of the soil itself, lit facet, dark rim, contact shadow
  for (let i = 0; i < 9 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 6), r.range(2.5, 4.5), S, r, S[0]);
  // roots: pale threads with a shadow under
  for (let i = 0; i < 1.5 * AREA; i++) {
    let x = r.int(0, T - 1), y = r.int(0, T - 1); const dx = r.pick([-1, 1]);
    for (let j = 0; j < r.int(6, 14); j++) { pc.set(x, y, S[6]); pc.set(x, y + 1, S[1]); x += dx; if (r.chance(0.35)) y += r.pick([-1, 1]); }
  }
  // pebbles: faceted 3-6 px stones with an outline and a glint
  for (let i = 0; i < Math.round((1.5 + stones * 4) * AREA); i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 5.5), r.range(2.5, 4.5), r.chance(0.6) ? St : r.chance(0.5) ? rampNamed('slate') : rampNamed('sand'), r, S[0]);
  for (let i = 0; i < AREA; i++) { let x = r.int(0, T - 1), y = r.int(0, T - 1); const dx = r.pick([-1, 1]); for (let j = 0; j < r.int(5, 9); j++) { pc.set(x, y, Tw[4]); pc.set(x, y + 1, Tw[1]); x += dx; if (r.chance(0.25)) y += 1; } }
  tidy(pc);
}

// ================================================================================================ rock
/** bedrock from above: plates bevelled to the light with dark joints, drawn fracture lines, lichen crusts with a dark
 *  rim, grit lodged in the joints, a glint where a lit edge turns */
function rockTop(pc: PixelCanvas, rock: number, seed: number, cell = 16, lichen = 1) {
  const r = new Rand(seed), Kr = RF(rock);
  const P = plates(pc, r, cell, Kr, [2, 3, 3, 4], { bevel: true, seam: 0, joint: 1 });
  for (let i = 0; i < 7 * AREA; i++) crackLine(pc, r.int(0, T - 1), r.int(0, T - 1), r.int(4, 10), Kr[1], Kr[5], r);
  for (let i = 0; i < 24 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); if (P.edge[y * T + x] > 1.2) continue; stone(pc, x, y, r.range(2.5, 3.5), r.range(2, 3), r.chance(0.5) ? Kr : rampNamed('stone'), r, Kr[0]); }
  const Li = [rampNamed('sage'), rampNamed('ochre'), rampNamed('straw'), rampNamed('olive')];
  for (let i = 0; i < Math.round(3 * AREA * lichen); i++) {
    const x = r.range(0, T), y = r.range(0, T), Lr = r.pick(Li), rad = r.range(2, 5), m = new Mask(Math.floor(x - rad * 2.5), Math.floor(y - rad * 2.5), Math.ceil(rad * 5) + 2, Math.ceil(rad * 5) + 2);
    fillPoly(blobPts(x, y, rad, rad * r.range(0.6, 1), 7, r, 0.4), (X, Y) => m.add(X, Y));
    if (r.chance(0.5)) fillPoly(blobPts(x + r.range(-rad, rad), y + r.range(-rad, rad), rad * 0.5, rad * 0.4, 5, r), (X, Y) => m.add(X, Y));
    m.ink(pc, Lr, (X, Y) => (X + Y < x + y ? 4 : 3), { dark: 1, lit: 5 });
  }
  for (let i = 0; i < 6 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); if (P.edge[y * T + x] < 1 && P.at(x - 1, y) !== P.at(x, y)) pc.set(x + 1, y, rampNamed('snow')[5]); }
  tidy(pc);
}

/** a cliff face: strata of different thickness and tone; hard beds jut (a lit lip, a shaded underside); joints */
function rockSide(pc: PixelCanvas, rock: number, seed: number) {
  const r = new Rand(seed), Kr = RF(rock);
  const bands: { y0: number; t: number; k: number; hard: boolean }[] = [];
  for (let y = 0; y < T;) { let t = r.int(4, 11); if (T - (y + t) < 4) t = T - y; bands.push({ y0: y, t, k: r.pick([2, 3, 3, 4]), hard: r.chance(0.45) }); y += t; }
  const lift: number[] = []; let lv = 0; for (let x = 0; x < T; x++) { if (x % r.int(4, 9) === 0) lv = r.pick([-1, 0, 0, 1]); lift.push(x === T - 1 ? 0 : lv); }
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const yy = W(y + lift[x]);
    let b = bands[0]; for (const q of bands) if (yy >= q.y0) b = q;
    const local = yy - b.y0;
    let kk = b.k;
    if (b.hard) { if (local === 0) kk = 5; else if (local === b.t - 1) kk = 1; }
    else if (local === b.t - 1) kk -= 1;
    pc.set(x, y, Kr[kk]);
  }
  for (const b of bands) if (b.hard && b.t >= 3) for (let j = 0; j < r.int(3, 8); j++) { const x = r.int(0, T - 1); for (let i = 1; i < b.t - 1; i++) { pc.set(x, W(b.y0 + i - lift[x]), Kr[1]); pc.set(x - 1, W(b.y0 + i - lift[x]), Kr[4]); } }
  for (let i = 0; i < 5 * AREA; i++) crackLine(pc, r.int(0, T - 1), r.int(0, T - 1), r.int(4, 9), Kr[0], Kr[5], r);
  tidy(pc);
}

// ================================================================================================ sand
/** sand: two broad tones, wind-ripple strokes (a lit crest over a shaded trough) that waver and break, grain pairs,
 *  little drawn shells, a few pebbles. ripples 0..1 */
function sand(pc: PixelCanvas, c: number, seed: number, ripples: number) {
  const r = new Rand(seed), S = RF(c), Sh = rampNamed('bone');
  plates(pc, r, 26, S, [3, 3, 4]);
  const ph = r.range(0, 6.28), slope = r.range(-0.3, 0.3), gap = r.range(5, 7);
  const rows = Math.floor(T / gap);
  if (ripples > 0) for (let j = 0; j < rows; j++) {
    const y0 = j * (T / rows), amp = r.range(0.6, 1.6), f1 = r.int(1, 4) * 2;
    for (let x = 0; x < T; x++) {
      if (r.chance(0.04 * (1.2 - ripples))) { x += r.int(3, 10); continue; }
      const y = W(y0 + x * slope + Math.round(Math.sin((x / T) * Math.PI * f1 + ph + j) * amp));
      pc.set(x, y, S[5]); pc.set(x, y + 1, S[2]);
    }
  }
  for (let i = 0; i < 26 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1), col = r.chance(0.5) ? S[1] : S[6]; pc.set(x, y, col); pc.set(x + 1, y, col); }
  for (let i = 0; i < Math.round(0.6 * AREA); i++) {
    const x = r.int(2, T - 3), y = r.int(2, T - 3);
    pc.set(x - 1, y, Sh[4]); pc.set(x, y - 1, Sh[5]); pc.set(x + 1, y, Sh[3]); pc.set(x, y, Sh[4]); pc.set(x - 1, y + 1, Sh[1]); pc.set(x, y + 1, Sh[2]); pc.set(x + 1, y + 1, Sh[1]);
  }
  for (let i = 0; i < 1.5 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 4.5), r.range(2.5, 3.5), rampNamed('stone'), r, S[1]);
  tidy(pc);
}

// ================================================================================================ mud
/** mud: wet dark plates, puddles with a drawn sky glint and a lit lip, hoof prints pressed in, twigs and leaves */
function mud(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), M = RF(c), Wt = rampNamed('water'), Sk = rampNamed('sky'), Tw = rampNamed('fur');
  plates(pc, r, 12, M, [1, 2, 2, 3], { bevel: true });
  for (let i = 0; i < 3 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 5), r.range(2.5, 4), M, r, M[0]);
  // hoof prints: paired hollows along a trail (dark floor, a lit far edge)
  for (let t = 0; t < AREA / 2; t++) {
    let x = r.range(0, T), y = r.range(0, T); const a = r.range(0, 6.28), stp = r.range(6, 9);
    for (let s = 0; s < r.int(4, 8); s++) {
      for (const side of [-1, 1]) {
        const px = Math.round(x + Math.cos(a + 1.57) * side * 1.6), py = Math.round(y + Math.sin(a + 1.57) * side * 1.6);
        pc.set(px, py, M[0]); pc.set(px, py + 1, M[0]); pc.set(px + 1, py + 1, M[4]);
      }
      x += Math.cos(a) * stp; y += Math.sin(a) * stp;
    }
  }
  // puddles: flat water, the sky caught in a drawn glint, a lit lip toward the light, a dark wet rim away from it
  for (let i = 0; i < 0.9 * AREA; i++) {
    const x = r.range(0, T), y = r.range(0, T), rx = r.range(4, 11), ry = rx * r.range(0.45, 0.7), m = new Mask(Math.floor(x - rx * 1.3) - 2, Math.floor(y - ry * 1.3) - 2, Math.ceil(rx * 2.6) + 5, Math.ceil(ry * 2.6) + 5);
    fillPoly(blobPts(x, y, rx, ry, 9, r, 0.3), (X, Y) => m.add(X, Y));
    m.ink(pc, Wt, (_X, Y) => (Y < y - ry * 0.3 ? 3 : 2), { dark: 2, lit: null });
    const sy = Math.round(y - ry * 0.35), sx = Math.round(x - rx * 0.3);
    for (let q = 0; q < r.int(2, 4); q++) if (m.has(sx + q, sy)) pc.set(sx + q, sy, Sk[q === 0 ? 5 : 4]);
    for (let Y = m.y0; Y < m.y0 + m.h; Y++) for (let X = m.x0; X < m.x0 + m.w; X++) {
      if (m.has(X, Y)) continue;
      if (m.has(X + 1, Y) || m.has(X, Y + 1)) pc.set(X, Y, M[5]);
      else if (m.has(X - 1, Y) || m.has(X, Y - 1)) pc.set(X, Y, M[0]);
    }
  }
  for (let i = 0; i < AREA; i++) { let x = r.int(0, T - 1), y = r.int(0, T - 1); const dx = r.pick([-1, 1]); for (let j = 0; j < r.int(4, 8); j++) { pc.set(x, y, Tw[3]); pc.set(x, y + 1, Tw[1]); x += dx; if (r.chance(0.2)) y += 1; } }
  for (let i = 0; i < AREA; i++) leafStroke(pc, r.range(0, T), r.range(0, T), r.range(0, 6.28), r.range(2.5, 4), r.range(1, 1.6), rampNamed(r.pick(['rust', 'ochre', 'olive'] as const)), r, { midrib: false });
  tidy(pc);
}

/** clay: sun-baked crazing, plates with up-curled lit rims and dark cracks between */
function clay(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), C = RF(c);
  plates(pc, r, 9, C, [3, 3, 4], { bevel: true, seam: 0, joint: 1 });
  for (let i = 0; i < 2 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 4.5), r.range(2.5, 3.5), C, r, C[0]);
  tidy(pc);
}

// ================================================================================================ snow
/** snow: crust plates lit to the sun, flakes of wind-packed crust with blue shadow edges, blue shadow clusters in the
 *  hollows, wind-cut ridge strokes, sparkles, bird tracks */
function snow(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), S = rampNamed('snow'), Bl = rampNamed('sky');
  plates(pc, r, 16, S, [3, 4, 4, 5], { bevel: true });
  for (let i = 0; i < 6 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 7), r.range(2, 4), S, r, S[2]);
  for (let i = 0; i < 2 * AREA; i++) polyFill(pc, blobPts(r.range(0, T), r.range(0, T), r.range(3, 7), r.range(1.5, 3), 6, r), S[2]);
  const ph = r.range(0, 6.28), slope = r.range(-0.3, 0.3);
  for (let j = 0; j < 9; j++) {
    const y0 = r.range(0, T), amp = r.range(1, 2.5), len = r.int(20, 70), x0 = r.int(0, T - 1);
    for (let x = x0; x < x0 + len; x++) { const y = W(y0 + (x - x0) * slope + Math.round(Math.sin((x / T) * Math.PI * 6 + ph + j) * amp)); pc.set(x, y, S[5]); pc.set(x, y + 1, Bl[4]); }
  }
  for (let i = 0; i < 6 * AREA; i++) { const x = r.int(1, T - 2), y = r.int(1, T - 2); pc.set(x, y, S[5]); if (r.chance(0.3)) { pc.set(x - 1, y, S[4]); pc.set(x + 1, y, S[4]); pc.set(x, y - 1, S[4]); pc.set(x, y + 1, S[4]); } }
  let x = r.range(0, T), y = r.range(0, T); const a = r.range(0, 6.28);
  for (let s = 0; s < 14; s++) {
    for (const da of [-0.6, 0, 0.6]) pc.set(Math.round(x + Math.cos(a + da) * 1.5), Math.round(y + Math.sin(a + da) * 1.5), S[1]);
    pc.set(Math.round(x), Math.round(y), S[1]);
    x += Math.cos(a) * 4 + (s % 2 ? 1 : -1) * Math.cos(a + 1.57); y += Math.sin(a) * 4 + (s % 2 ? 1 : -1) * Math.sin(a + 1.57);
  }
  tidy(pc);
}

// ================================================================================================ burnt ground
/** burnt ground: angular char plates, drifts of pale ash, charred sticks, the odd glowing ember (emissive: the terrain
 *  lets embers glow only while the burn is fresh) */
function ash(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), C = rampNamed('basalt'), A = rampNamed('stone'), Em = rampNamed('glowAmber'), In = rampNamed('ink');
  plates(pc, r, 9, C, [1, 1, 2, 2]);
  // ash drifts: flat pale clusters, lit on their upper left
  for (let i = 0; i < 4 * AREA; i++) { polyFill(pc, blobPts(r.range(0, T), r.range(0, T), r.range(2, 6), r.range(1.5, 3.5), 6, r), r.chance(0.5) ? A[4] : A[3]); }
  for (let i = 0; i < 6 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, A[5]); pc.set(x + 1, y, A[4]); }
  // charred sticks: a black stroke with a lit grey edge and a glowing tip now and then
  for (let i = 0; i < 1.5 * AREA; i++) {
    let x = r.int(0, T - 1), y = r.int(0, T - 1); const dx = r.pick([-1, 1]), l = r.int(4, 9);
    for (let j = 0; j < l; j++) { pc.set(x, y, In[0]); pc.set(x, y - 1, C[3]); x += dx; if (r.chance(0.25)) y += r.pick([-1, 1]); }
    if (r.chance(0.4)) pc.set(x, y, Em[3], 150);
  }
  // embers: two-pixel clusters, glowing (alpha < 255)
  for (let i = 0; i < 3 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, Em[4], 120); pc.set(x + 1, y, Em[2], 170); }
  tidy(pc);
}

// ================================================================================================ strata and veins
/** beds across a cliff panel: thickness from th(), each bed drawn by bed(y0, t, i); the boundaries wander a pixel or
 *  two in hand-set steps along the face */
function beds(pc: PixelCanvas, r: Rand, th: () => number, bed: (x: number, y: number, local: number, t: number, i: number) => number | null) {
  const list: { y0: number; t: number }[] = [];
  for (let y = 0; y < T;) { let t = th(); if (T - (y + t) < 3) t = T - y; list.push({ y0: y, t }); y += t; }
  const lift: number[] = []; let lv = 0; for (let x = 0; x < T; x++) { if (x % r.int(5, 11) === 0) lv = r.pick([-1, 0, 0, 1]); lift.push(x === T - 1 ? 0 : lv); }
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const yy = W(y + lift[x]);
    let i = 0; for (let q = 0; q < list.length; q++) if (yy >= list[q].y0) i = q;
    const c = bed(x, y, yy - list[i].y0, list[i].t, i);
    if (c !== null) pc.set(x, y, c);
  }
  return { list, lift };
}
/** sandstone: warm banded layers (sand, ochre, clay, rust), cross-bedding inside the thick ones, weathered pits */
function sandstoneSide(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), R = [rampNamed('sand'), rampNamed('ochre'), rampNamed('clay'), rampNamed('rust')];
  const tone = Array.from({ length: 80 }, () => ({ R: r.pick(R), k: r.pick([2, 3, 3, 4]), xb: r.chance(0.4) }));
  beds(pc, r, () => r.int(3, 9), (x, _y, local, t, i) => {
    const b = tone[i % tone.length];
    if (local === 0) return b.R[Math.min(6, b.k + 2)];
    if (local === t - 1) return b.R[Math.max(0, b.k - 2)];
    if (b.xb && t > 5 && (x + local * 3) % 11 === 0) return b.R[b.k - 1];
    return b.R[b.k];
  });
  for (let i = 0; i < 3 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1), w = r.int(2, 4); for (let j = 0; j < w; j++) { pc.set(x + j, y, rampNamed('clay')[0]); pc.set(x + j, y + 1, rampNamed('clay')[1]); } pc.set(x - 1, y, rampNamed('sand')[5]); }
  tidy(pc);
}
/** limestone: pale blocky beds split by joints into blocks (lit top-left rims, dark bottom-right), solution pits */
function limestoneSide(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), R = rampNamed('bone'), St = rampNamed('stone');
  const joints = Array.from({ length: 60 }, () => Array.from({ length: 6 }, () => r.int(0, T - 1)));
  const tones = Array.from({ length: 60 }, () => r.pick([2, 3, 3, 4]));
  beds(pc, r, () => r.int(8, 15), (x, _y, local, t, i) => {
    const J = joints[i % joints.length];
    if (J.some((j) => j === x)) return St[2];
    if (J.some((j) => j === x - 1)) return R[5];
    if (local === 0) return R[5];
    if (local === t - 1) return St[3];
    return R[tones[i % tones.length]];
  });
  for (let i = 0; i < 9 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, St[1]); pc.set(x + 1, y, St[2]); if (r.chance(0.4)) pc.set(x, y + 1, St[2]); pc.set(x, y - 1, R[5]); }
  tidy(pc);
}
/** slate and shale: thin dark laminations, two or three tones, gently wavy, cut by a few slanting fractures */
function slateSide(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), S = rampNamed('slate'), Bs = rampNamed('basalt');
  const tone = Array.from({ length: 200 }, () => r.pick([S[1], S[2], S[2], S[3], Bs[2]]));
  beds(pc, r, () => r.int(1, 3), (_x, _y, local, _t, i) => (local === 0 && i % 3 === 0 ? S[4] : tone[i % tone.length]));
  for (let i = 0; i < 4 * AREA; i++) { let x = r.int(0, T - 1), y = r.int(0, T - 1); for (let j = 0; j < r.int(5, 12); j++) { pc.set(x, y, S[0]); pc.set(x + 1, y, S[4]); x += 1; y += 1; } }
  tidy(pc);
}
/** granite: big blocks with drawn joints (lit rims), speckled with feldspar, quartz and mica clusters */
function graniteSide(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), G = rampNamed('stone'), Fe = rampNamed('coral'), Q = rampNamed('quartz');
  plates(pc, r, 26, G, [3, 4, 4, 5], { bevel: true, seam: 1, joint: 1 });
  for (let i = 0; i < 40 * AREA; i++) {
    const x = r.int(0, T - 1), y = r.int(0, T - 1), k = r.next();
    if (k < 0.4) { pc.set(x, y, G[1]); if (r.chance(0.5)) pc.set(x + 1, y, G[1]); }
    else if (k < 0.75) { pc.set(x, y, Fe[4]); pc.set(x, y + 1, Fe[3]); }
    else { pc.set(x, y, Q[5]); pc.set(x + 1, y, Q[4]); }
  }
  tidy(pc);
}
/** volcanic tuff: soft layers of ash (pale grey, ochre) with pumice clots (pale, pitted) and dark lapilli */
function tuffSide(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), A = rampNamed('stone'), O = rampNamed('ochre'), Bo = rampNamed('bone');
  const tone = Array.from({ length: 80 }, () => (r.chance(0.6) ? A[r.pick([3, 4, 4])] : O[r.pick([3, 4])]));
  beds(pc, r, () => r.int(4, 12), (_x, _y, local, _t, i) => (local === 0 ? Bo[4] : tone[i % tone.length]));
  for (let i = 0; i < 5 * AREA; i++) {
    const x = r.range(0, T), y = r.range(0, T), m = new Mask(Math.floor(x - 8), Math.floor(y - 6), 17, 13);
    fillPoly(blobPts(x, y, r.range(2.5, 6), r.range(2, 4), 7, r), (X, Y) => m.add(X, Y));
    m.ink(pc, Bo, (X, Y) => ((X * 7 + Y * 13) % 9 === 0 ? 1 : X + Y < x + y ? 5 : 4), { dark: 2, lit: null });
  }
  for (let i = 0; i < 8 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, rampNamed('basalt')[0]); pc.set(x + 1, y, rampNamed('basalt')[1]); }
  tidy(pc);
}
/** an ore vein on transparency: wavy bands of R (lit top, dark bottom) wandering across the panel, with specks */
function veinBands(pc: PixelCanvas, r: Rand, R: number[], n: number, thick: [number, number], speck?: (x: number, y: number) => void, alpha = 255) {
  pc.clear();
  for (let b = 0; b < n; b++) {
    const y0 = r.range(0, T), slope = r.range(-0.35, 0.35), amp = r.range(1, 5), th = r.int(thick[0], thick[1]), ph = r.range(0, 6.28), x0 = r.int(0, T - 1), len = r.int(40, 150);
    for (let x = x0; x < x0 + len; x++) {
      const w = Math.max(1, th + Math.round(Math.sin(x * 0.21 + b) * 1.2)), yc = Math.round(y0 + (x - x0) * slope + Math.sin(x * 0.07 + ph) * amp);
      for (let j = 0; j < w; j++) pc.set(x, yc + j, R[j === 0 ? 5 : j === w - 1 ? 1 : 3], alpha);
      if (speck && r.chance(0.08)) speck(x, yc + r.int(0, w - 1));
    }
  }
}
function veinIron(pc: PixelCanvas, seed: number) { const r = new Rand(seed), Ru = rampNamed('rust'), Fe = rampNamed('iron'); veinBands(pc, r, Ru, 10, [2, 4], (x, y) => { pc.set(x, y, Fe[5]); pc.set(x + 1, y, Fe[2]); }); }
function veinCopper(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), M = rampNamed('malachite'), Cu = rampNamed('copper');
  pc.clear();
  for (let i = 0; i < 2 * AREA; i++) { let x = r.range(0, T), y = r.range(0, T); let a = r.range(-0.6, 0.6); for (let s = 0; s < r.int(14, 40); s++) { pc.set(Math.round(x), Math.round(y), M[s % 4 === 0 ? 5 : 3]); pc.set(Math.round(x), Math.round(y) + 1, M[1]); x += Math.cos(a); y += Math.sin(a); a += r.range(-0.3, 0.3); if (r.chance(0.06)) { pc.set(Math.round(x), Math.round(y) - 1, Cu[5]); pc.set(Math.round(x) + 1, Math.round(y) - 1, Cu[3]); } } }
}
function veinGold(pc: PixelCanvas, seed: number) { const r = new Rand(seed), Q = rampNamed('quartz'), Au = rampNamed('gold'); veinBands(pc, r, Q, 7, [3, 5], (x, y) => { pc.set(x, y, Au[6]); pc.set(x + 1, y, Au[4]); pc.set(x, y + 1, Au[3]); }); }
function veinCoal(pc: PixelCanvas, seed: number) { const r = new Rand(seed), C = rampNamed('basalt'), In = rampNamed('ink'); veinBands(pc, r, [In[0], In[0], C[0], C[1], C[2], C[3], C[4]], 6, [4, 7], (x, y) => pc.set(x, y, C[5])); }
function veinSulphur(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), Y = rampNamed('gold'), St = rampNamed('straw');
  pc.clear();
  for (let i = 0; i < 4 * AREA; i++) { const x = r.range(0, T), y = r.range(0, T), m = new Mask(Math.floor(x - 9), Math.floor(y - 6), 19, 13); fillPoly(blobPts(x, y, r.range(3, 8), r.range(1.5, 4), 8, r, 0.45), (X, Yy) => m.add(X, Yy)); m.ink(pc, r.chance(0.6) ? Y : St, (X, Yy) => (X + Yy < x + y ? 6 : 5), { dark: 3, lit: null }); }
}
function veinLumen(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), C = rampNamed('glowTeal');
  pc.clear();
  for (let i = 0; i < 3 * AREA; i++) { const bx = r.range(4, T - 4), by = r.range(8, T - 2); for (let k = 0; k < r.int(2, 4); k++) prism(pc, bx + r.range(-3, 3), by, r.range(1.2, 2), r.range(4, 9), r.range(-0.5, 0.5), C, 190); }
}
function veinGravium(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), V = rampNamed('amethyst'), Gt = rampNamed('glowTeal');
  veinBands(pc, r, V, 7, [2, 4]);
  // floating speckles: lit motes drifting above the band, glowing
  for (let i = 0; i < 10 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, r.chance(0.8) ? V[6] : Gt[4], 180); }
}
/** spring crust from above: travertine terraces, scalloped rims (lit lip, shaded under) round shallow pools */
function crust(pc: PixelCanvas, seed: number, R: number[]) {
  const r = new Rand(seed), Wt = rampNamed('water');
  plates(pc, r, 14, R, [3, 4, 4]);
  for (let i = 0; i < 3 * AREA; i++) {
    const x = r.range(0, T), y = r.range(0, T), rx = r.range(5, 14), m = new Mask(Math.floor(x - rx * 1.4), Math.floor(y - rx), Math.ceil(rx * 2.8) + 2, Math.ceil(rx * 2) + 2);
    fillPoly(blobPts(x, y, rx, rx * 0.6, 10, r, 0.25), (X, Y) => m.add(X, Y));
    m.ink(pc, Wt, (_X, Y) => (Y < y ? 4 : 3), { dark: 3, lit: null });
    // the rim: a bright lip on the near (lower) edge, a shaded step under it
    for (let X = m.x0; X < m.x0 + m.w; X++) for (let Y = m.y0; Y < m.y0 + m.h; Y++) if (m.has(X, Y) && !m.has(X, Y + 1)) { pc.set(X, Y + 1, R[6]); pc.set(X, Y + 2, R[2]); }
  }
  tidy(pc);
}

// ================================================================================================ the rest
/** basalt: column ends as bevelled polygons (top), column flanks with cross joints (side) */
function basalt(pc: PixelCanvas, c: number, seed: number, side: boolean) {
  const r = new Rand(seed), Kb = RF(c), CW = 8 * K;
  if (side) {
    const cols = Math.round(T / CW), tones = Array.from({ length: cols }, () => r.pick([2, 3, 3, 4]));
    for (let x = 0; x < T; x++) { const col = Math.floor(x / CW), kk = tones[col], e = x % CW; for (let y = 0; y < T; y++) pc.set(x, y, e === 0 ? Kb[0] : e === 1 ? Kb[kk + 1] : e === CW - 1 ? Kb[kk - 1] : Kb[kk]); }
    for (let col = 0; col < cols; col++) for (let y = r.int(0, 13 * K); y < T; y += Math.round(r.int(10, 16) * K)) for (let x = col * CW + 1; x < col * CW + CW; x++) { pc.set(x, y, Kb[1]); pc.set(x, y + 1, Kb[4]); }
  } else {
    plates(pc, r, 14, Kb, [2, 3, 3, 4], { bevel: true, seam: 0, joint: 1 });
    for (let i = 0; i < 5 * AREA; i++) crackLine(pc, r.int(0, T - 1), r.int(0, T - 1), r.int(3, 7), Kb[0], Kb[4], r);
  }
  tidy(pc);
}

/** ore: bedrock with faceted nuggets of ferrite (now and then copper or a fleck of gold), each in its rust stain */
function ore(pc: PixelCanvas, rock: number, seed: number, side: boolean) {
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed, 16, 0.3);
  const r = new Rand(seed + 7), Fe = rampNamed('iron'), Cu = rampNamed('copper'), Au = rampNamed('gold'), Ru = rampNamed('rust'), Kr = RF(rock);
  for (let q = 0; q < AREA; q++) {
    const ox = (q % TILE_M) * TS, oy = Math.floor(q / TILE_M) * TS, spots: [number, number][] = [];
    for (let tries = 0; spots.length < 4 && tries < 60; tries++) {
      const x = ox + k(r.range(5, 27)), y = oy + k(r.range(5, 27)), gap = k(spots.length < 2 ? 13 : 9);
      if (spots.some(([a, b]) => Math.abs(a - x) < gap && Math.abs(b - y) < gap)) continue;
      spots.push([x, y]);
    }
    spots.forEach(([x, y], i) => {
      const M = i === 3 && r.chance(0.6) ? Au : i === 2 || r.chance(0.2) ? Cu : Fe, big = i < 2;
      polyFill(pc, blobPts(x + 3, y + 3, k(big ? 7 : 4.5), k(big ? 5.5 : 3.5), 8, r), Ru[2]);
      nugget(pc, x, y, k(big ? r.range(10, 12.5) : r.range(6, 8)), k(big ? r.range(7.5, 9.5) : r.range(5, 6.5)), M, r, i % 2 ? Kr[1] : Ru[1]);
    });
  }
}

/** crystal: bedrock pierced by clusters of faceted prisms fanning from a shared root (glowing a little: alpha < 255) */
function crystal(pc: PixelCanvas, rock: number, cry: number, seed: number, side: boolean) {
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed, 16, 0.3);
  const r = new Rand(seed + 3), C = RF(cry), Kr = RF(rock);
  for (let q = 0; q < AREA; q++) {
    const ox = (q % TILE_M) * TS, oy = Math.floor(q / TILE_M) * TS;
    for (let c = 0; c < 3; c++) {
      const bx = ox + k(5 + c * 10 + r.range(-1.5, 1.5)), by = oy + k(r.range(16, 30)), n = r.int(4, 6);
      for (let j = -k(3); j <= k(3); j++) { pc.set(bx + j, by + 1, Kr[1]); if (Math.abs(j) < k(3)) pc.set(bx + j, by, Kr[0]); if (Math.abs(j) < k(2)) pc.set(bx + j, by + 2, Kr[2]); }
      const ps = Array.from({ length: n }, (_, j) => ({ lean: (j / (n - 1) - 0.5) * r.range(0.5, 0.9), h: k(r.range(8, 14)) * (j === (n >> 1) ? 1.25 : 1), hw: k(r.range(1.8, 2.8)), dx: k((j / (n - 1) - 0.5) * 5) }));
      ps.sort((a, b) => b.h - a.h);
      for (const p of ps) prism(pc, bx + p.dx, by, p.hw, Math.min(by - oy - 1, p.h), p.lean, C, 190);
    }
  }
}

/** leaf litter: soil strewn with drawn leaves at every angle (browned, a few still fresh), twigs across them */
function litter(pc: PixelCanvas, soil: number, foliage: number[], seed: number) {
  soilTop(pc, soil, seed, 0.3);
  const r = new Rand(seed + 5), Tw = rampNamed('fur');
  for (let i = 0; i < AREA; i++) { let x = r.int(0, T - 1), y = r.int(0, T - 1); const dx = r.pick([-1, 1]); for (let j = 0; j < r.int(6, 12); j++) { pc.set(x, y, Tw[3]); pc.set(x, y + 1, Tw[1]); x += dx; if (r.chance(0.25)) y += 1; } }
  const browns: number[][] = [rampNamed('rust'), rampNamed('ochre'), rampNamed('clay'), rampNamed('coral')];
  for (let i = 0; i < 26 * AREA; i++) {
    const R0 = r.chance(0.15) ? rampFor(r.pick(foliage)) : r.pick(browns);
    leafStroke(pc, r.range(0, T), r.range(0, T), r.range(0, Math.PI * 2), r.range(3, 5.5), r.range(1.2, 2), R0, r, { midrib: false, notch: r.chance(0.2) });
  }
  tidy(pc);
}

/** gravel: a bed of faceted stones of a few kinds, each with its contact shadow, grit between */
function gravel(pc: PixelCanvas, rock: number, seed: number) {
  const r = new Rand(seed), Kr = RF(rock), kinds = [Kr, rampNamed('stone'), rampNamed('sand'), rampNamed('slate')];
  plates(pc, r, 9, Kr, [1, 2]);
  for (let i = 0; i < 30 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 4.5), r.range(2.5, 3.5), r.pick(kinds), r, Kr[0]);
  for (let i = 0; i < 12 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(4, 6.5), r.range(3, 5), r.pick(kinds), r, Kr[0]);
  tidy(pc);
}

/** the Veyr's moss: cushions of angular clumps, spore stalks, the odd vein glint (emissive) */
function moss(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), M = rampFor(VEYR.moss), G = rampNamed('glowTeal');
  plates(pc, r, 10, M, [1, 2]);
  for (let i = 0; i < 7 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(4, 7.5), r.range(3.5, 6), M, r, M[0]);
  for (let i = 0; i < 4 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1), h = r.int(2, 4); for (let j = 0; j < h; j++) pc.set(x, y - j, M[2]); pc.set(x, y - h, rampNamed('straw')[4], 200); }
  for (let i = 0; i < 2 * AREA; i++) pc.set(r.int(0, T - 1), r.int(0, T - 1), G[3], 150);
}
function mossSide(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), M = rampFor(VEYR.moss);
  for (let x = 0; x < T; x++) { const kk = [2, 3, 2, 1][Math.floor(x / (8 * K)) % 4]; for (let y = 0; y < T; y++) pc.set(x, y, M[(y + x * 3) % 11 === 0 ? kk + 1 : kk]); }
  for (let x = 0; x < T; x++) if (r.chance(0.15)) { const y = r.int(4 * K, T - 4); pc.set(x, y, rampNamed('straw')[4], 200); pc.set(x, y - 1, M[5]); }
}

/** a rival's creep: crystalline shards, a fungal mat of little caps, or pale filaments */
function creep(pc: PixelCanvas, kind: number, seed: number) {
  const rv = RIVALS[kind], C = rampFor(rv.creep), r = new Rand(seed), V = rampFor(rv.vein);
  if (kind === 0) {
    plates(pc, r, 12, C, [1, 2]);
    for (let i = 0; i < 5 * AREA; i++) {
      const x = r.int(0, T - 1), y = r.int(0, T - 1), h = r.int(4, 9), a = r.range(-0.6, 0.6);
      for (let t = 0; t < h; t++) for (let w = -1; w <= 1; w++) pc.set(x + Math.round(a * t) + w, y - t, C[w < 0 ? 5 : w > 0 ? 2 : 4], t === h - 1 ? 140 : 255);
    }
  } else if (kind === 1) {
    plates(pc, r, 11, C, [1, 2, 3], { bevel: true });
    for (let i = 0; i < 2.5 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); stone(pc, x, y, r.range(4, 7), r.range(3, 4.5), C, r, C[0]); pc.set(x, y + 1, V[3], 120); }
  } else {
    plates(pc, r, 14, C, [1, 2]);
    for (let i = 0; i < 6 * AREA; i++) { let x = r.int(0, T - 1), y = r.int(0, T - 1); for (let t = 0; t < 12; t++) { pc.set(x, y, C[t % 3 === 0 ? 5 : 4]); x += r.pick([-1, 0, 1]); y += r.pick([-1, 0, 1]); } }
  }
}

/** an impact crater floor: fused glass plates, faceted beads, now and then a cooling ember (emissive) */
function crater(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), Kc = rampNamed('basalt'), G = rampNamed('slate');
  plates(pc, r, 12, Kc, [1, 2, 3], { bevel: true, seam: 0 });
  for (let i = 0; i < 6 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, G[3]); pc.set(x + 1, y, G[2]); pc.set(x, y - 1, G[5]); pc.set(x + 1, y + 1, Kc[0]); }
  for (let i = 0; i < 3; i++) if (r.chance(0.5)) pc.set(r.int(0, T - 1), r.int(0, T - 1), rampNamed('glowAmber')[3], 210);
}

// ================================================================================================ the array
/** paint every layer for this palette into a mipmapped array texture (avg: each layer's mean colour, 0xRRGGBB) */
export function buildBlockTexture(pal: Palette, seed: number): { tex: THREE.DataArrayTexture; avg: number[]; ms: number } {
  const t0 = performance.now();
  const data = new Uint8Array(T * T * 4 * LAYERS);
  const avg: number[] = [];
  const paint = (layer: number, fn: (pc: PixelCanvas) => void, palette = true) => {
    const pc = new PixelCanvas(T, T);
    pc.fill(0x000000);
    fn(pc);
    if (palette) toPalette(pc);
    data.set(pc.data, layer * T * T * 4);
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < T * T; i++) { if (pc.data[i * 4 + 3] === 0) continue; r += pc.data[i * 4]; g += pc.data[i * 4 + 1]; b += pc.data[i * 4 + 2]; n++; }
    n = Math.max(1, n);
    avg[layer] = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  };
  const s = seed * 131;
  // the side and scatter layers are no longer drawn from (the terrain paints its cliffs and stones procedurally):
  // a flat fill keeps the array's layout for anything that still indexes them
  const flat = (c: number) => (p: PixelCanvas) => p.fill(c);
  paint(L.grassA, (p) => grassTop(p, pal, pal.grass, s + 1, 0.55));
  paint(L.grassB, (p) => grassTop(p, pal, pal.grass, s + 2, 1));
  paint(L.grassSide, flat(pal.soil));
  paint(L.soil, (p) => soilTop(p, pal.soil, s + 4));
  paint(L.rockA, (p) => rockTop(p, pal.rock, s + 5));
  paint(L.rockB, (p) => rockTop(p, pal.rock, s + 6, 56, 1.4));
  paint(L.rockSide, (p) => rockSide(p, pal.rock, s + 7));
  paint(L.sandA, (p) => sand(p, pal.sand, s + 8, 1));
  paint(L.sandB, (p) => sand(p, pal.sand, s + 9, 0.5));
  paint(L.mud, (p) => mud(p, pal.mud, s + 10));
  paint(L.clay, (p) => clay(p, pal.clay, s + 11));
  paint(L.snow, (p) => snow(p, s + 12));
  paint(L.snowSide, flat(pal.rock));
  paint(L.basalt, (p) => basalt(p, pal.basalt, s + 14, false));
  paint(L.basaltSide, (p) => basalt(p, pal.basalt, s + 15, true));
  paint(L.ore, (p) => ore(p, pal.rock, s + 16, false));
  paint(L.oreSide, (p) => ore(p, pal.rock, s + 17, true));
  paint(L.crystal, (p) => crystal(p, pal.rock, pal.crystal, s + 18, false));
  paint(L.crystalSide, (p) => crystal(p, pal.rock, pal.crystal, s + 19, true));
  paint(L.litter, (p) => litter(p, pal.soil, pal.foliage, s + 20));
  paint(L.gravel, (p) => gravel(p, pal.rock, s + 21));
  paint(L.moss, (p) => moss(p, 777));
  paint(L.mossSide, flat(VEYR.moss));
  paint(L.creep0, (p) => creep(p, 0, 801));
  paint(L.creep1, (p) => creep(p, 1, 802));
  paint(L.creep2, (p) => creep(p, 2, 803));
  paint(L.creepSide, flat(RIVALS[1].creep));
  paint(L.dryA, (p) => grassTop(p, pal, pal.grassDry, s + 22, 0.1));
  paint(L.drySide, flat(pal.soil));
  paint(L.mudSide, flat(pal.mud));
  paint(L.crater, (p) => crater(p, s + 25));
  paint(L.soilB, (p) => soilTop(p, pal.soil, s + 26, 2.4));
  paint(L.ash, (p) => ash(p, s + 27));
  paint(L.sandstoneSide, (p) => sandstoneSide(p, s + 28));
  paint(L.limestoneSide, (p) => limestoneSide(p, s + 29));
  paint(L.slateSide, (p) => slateSide(p, s + 30));
  paint(L.graniteSide, (p) => graniteSide(p, s + 31));
  paint(L.tuffSide, (p) => tuffSide(p, s + 32));
  paint(L.veinIron, (p) => veinIron(p, s + 33));
  paint(L.veinLumen, (p) => veinLumen(p, s + 34));
  paint(L.veinCopper, (p) => veinCopper(p, s + 35));
  paint(L.veinGold, (p) => veinGold(p, s + 36));
  paint(L.veinCoal, (p) => veinCoal(p, s + 37));
  paint(L.veinSulphur, (p) => veinSulphur(p, s + 38));
  paint(L.veinGravium, (p) => veinGravium(p, s + 39));
  paint(L.crustWhite, (p) => crust(p, s + 40, rampNamed('bone')));
  paint(L.crustOchre, (p) => crust(p, s + 41, rampNamed('ochre')));
  paint(L.crustRust, (p) => crust(p, s + 42, rampNamed('rust')));
  const tex = new THREE.DataArrayTexture(data, T, T, LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  // crisp pixels at play zoom: nearest everywhere, a coarser mip only well past 2x minification (terrain.ts biases)
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { tex, avg, ms: performance.now() - t0 };
}
void [grassSide, mossSide];
/** GPU memory of the block array with its mip chain, bytes (about 6 MB) */
export const BLOCK_BYTES = Math.round((T * T * 4 * LAYERS * 4) / 3);
