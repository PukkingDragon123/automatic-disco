// Terrain block textures: high-resolution tileable pixel art, TS texels per metre (128) on painted macro tiles of
// TILE_M x TILE_M metres (2 x 2 m, 256 x 256 texels), one layer per material and variant in a DataArrayTexture, plus
// a sheet of scattered stones the terrain stamps here and there. The terrain shader (terrain.ts) samples each tile with
// a random per-cell offset on a warped cell grid and knits neighbouring cells together texel by texel, so nothing
// repeats on a grid.
//
// The art follows src/ui/ART.md TARGET STYLE with the master palette (src/art/palette.ts): realistic but lively
// material colours, clean clusters lit from the upper left, a dark selective outline where forms turn away, a lit edge
// where they face the light, and small specular glints on hard, wet things. Per material:
//   grass   turf of blade clumps over dark soil: a short thatch under, clumps fanning with the wind on top (back
//           blades darker, front ones lit, sun-cured tips), clover, seed heads, fallen straw, the odd flower
//   soil    angular clods and plates, cracks with a lit lip, pebbles with glints, pale root threads, twigs
//   sand    two broad tones, wind ripples (lit crest, shaded trough), grain clusters, small shells, pebbles
//   rock    fractured plates bevelled to the light, hairline fractures, lichen crusts, grit in the joints
//   mud     wet plates, puddles with a sky sheen and a lit lip, hoof prints pressed in, twigs
//   snow    crust plates with blue shadows, wind-cut ridges, sparkles, bird tracks
// Alpha < 255 on a block layer marks emissive pixels (glow = 1 - a/255); the scatter sheet uses alpha for its own cut
// (0 empty, mid a contact shadow, 255 stone).
import * as THREE from 'three';
import { PixelCanvas } from '../limbo/gfx/pixel';
import { Rand } from '../core/rand';
import { rampFor, rampNamed, kinRamps, stone, nugget, prism, crackLine, leafStroke, fillPoly, Mask, toPalette, type P2 } from './pixelKit';
import { VEYR, RIVALS, type Palette } from './palette';

/** ground texel density: texels per metre (the terrain, water and rock shaders read it) */
export const TS = 128;
/** a painted tile covers TILE_M x TILE_M metres */
export const TILE_M = 2;
/** tile size in texels */
export const TT = TS * TILE_M;
const T = TT;
/** the old art's layout unit (1/32 m) in texels, and how many square metres one tile covers */
const K = TS / 32, AREA = TILE_M * TILE_M;
const k = (v: number) => v * K;

export const L = {
  grassA: 0, grassB: 1, grassSide: 2, soil: 3, rockA: 4, rockB: 5, rockSide: 6, sandA: 7, sandB: 8, mud: 9, clay: 10,
  snow: 11, snowSide: 12, basalt: 13, basaltSide: 14, ore: 15, oreSide: 16, crystal: 17, crystalSide: 18, litter: 19,
  gravel: 20, moss: 21, mossSide: 22, creep0: 23, creep1: 24, creep2: 25, creepSide: 26, dryA: 27, drySide: 28, mudSide: 29, crater: 30,
  /** scattered stones (alpha-cut sprites, four 1 m cells) */
  scatter: 31,
} as const;
export const LAYERS = 32;

/** surface block kinds */
export const enum B { GRASS, DRY, SOIL, ROCK, SAND, MUD, CLAY, SNOW, BASALT, ORE, CRYSTAL, LITTER, GRAVEL, CRATER }
/** [top layers], side within 1 m of the top, side deeper down */
export const BLOCKS: Record<number, { top: number[]; side: number; deep: number; name: string }> = {
  [B.GRASS]: { top: [L.grassA, L.grassB], side: L.grassSide, deep: L.soil, name: 'grass' },
  [B.DRY]: { top: [L.dryA], side: L.drySide, deep: L.soil, name: 'dry grass' },
  [B.SOIL]: { top: [L.soil], side: L.soil, deep: L.soil, name: 'soil' },
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
/**
 * Turf: dark soil under, a short thatch of back blades, then clumps fanning out from their roots with the wind (sorted
 * back to front: the nearer clump overlaps the one behind), each casting a small shadow down and right. Sun-cured
 * tips, clover, seed heads, fallen straw and, now and then, a flower. lush 0..1 sets how green and dense it is.
 */
function grassTop(pc: PixelCanvas, pal: Palette, base: number, seed: number, lush: number) {
  const r = new Rand(seed), S = RF(pal.soil), kin = kinRamps(base), G = kin[0], D = RF(pal.grassDry), Sh = rampNamed('moss');
  const wind = -Math.PI / 2 + r.range(-0.5, 0.5);
  // the soil between the tussocks: dark, shaded plates, a few pebbles
  plates(pc, r, 26, S, [1, 1, 2]);
  for (let i = 0; i < 18 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 6), r.range(2.5, 4.5), rampNamed('stone'), r, S[0]);
  // thatch: thousands of short blades, back and shaded, leaning every which way but mostly with the wind
  const nTh = Math.round((520 + lush * 380) * AREA);
  for (let i = 0; i < nTh; i++) {
    const x = r.int(0, T - 1), y = r.int(0, T - 1), R0 = r.chance(0.15) ? kin[1] : r.chance(0.08) ? D : G;
    blade(pc, x, y, r.range(5, 10), wind + r.range(-0.9, 0.9), r.range(-1, 1), R0, 1, 2);
  }
  // clumps, back (top of the tile) to front
  const clumps: { x: number; y: number; n: number; R: number[] }[] = [];
  const nC = Math.round((15 + lush * 9) * AREA);
  for (let i = 0; i < nC; i++) clumps.push({ x: r.range(0, T), y: r.range(0, T), n: r.int(11, 21), R: r.chance(0.16) ? kin[1] : r.chance(0.06) ? kin[2] : G });
  clumps.sort((a, b) => a.y - b.y);
  for (const c of clumps) {
    const reach = r.range(17, 32);
    // the shadow it throws down and right of the root: angular patches in the darkest soil and leaf steps
    polyFill(pc, blobPts(c.x + 5, c.y + 4, reach * 0.6, reach * 0.36, 8, r), S[0]);
    polyFill(pc, blobPts(c.x + 2, c.y + 1, reach * 0.4, reach * 0.24, 7, r), Sh[0]);
    const order = Array.from({ length: c.n }, (_, i) => i).sort(() => r.next() - 0.5);
    for (let b = 0; b < c.n; b++) {
      const i = order[b], fan = (i / (c.n - 1) - 0.5) * r.range(1.5, 2.2), back = b < c.n * 0.45;
      const len = reach * r.range(0.6, 1.05) * (1 - Math.abs(fan) * 0.25);
      const dry = r.chance(0.12 * (1.2 - lush)) ? D : undefined;
      blade(pc, c.x + r.range(-3, 3), c.y + r.range(-1.5, 1.5), len, wind + fan, r.range(-1.6, 1.6), c.R, back ? 1 : 2, back ? 3 : 6, dry, !back && r.chance(0.6));
    }
  }
  // loose front blades over everything, fine and lit
  for (let i = 0; i < 110 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); blade(pc, x, y, r.range(7, 14), wind + r.range(-0.6, 0.6), r.range(-1, 1), r.chance(0.15) ? kin[1] : G, 3, 6, r.chance(0.1) ? D : undefined); }
  // clover: three drawn leaflets round a dark heart
  const Cl = rampNamed(r.chance(0.5) ? 'sage' : 'moss');
  for (let i = 0; i < Math.round((3 + lush * 5) * AREA); i++) {
    const cx = r.range(0, T), cy = r.range(0, T);
    for (let p = 0; p < r.int(3, 6); p++) {
      const x = cx + r.range(-9, 9), y = cy + r.range(-6, 6), a0 = r.range(0, 2.1);
      for (let l = 0; l < 3; l++) leafStroke(pc, x, y, a0 + (l / 3) * Math.PI * 2, r.range(3, 4.5), r.range(1.6, 2.4), Cl, r, { midrib: false });
      pc.set(Math.round(x), Math.round(y), Cl[1]);
    }
  }
  // seed heads: a stalk and a lit spike of seeds
  for (let i = 0; i < 10 * AREA; i++) {
    const x = r.range(0, T), y = r.range(0, T), a = wind + r.range(-0.4, 0.4), len = r.range(14, 22);
    blade(pc, x, y, len, a, 0.6, D, 2, 4);
    const hx = x + Math.cos(a) * len, hy = y + Math.sin(a) * len;
    for (let s = 0; s < 5; s++) { pc.set(Math.round(hx + Math.cos(a) * s), Math.round(hy + Math.sin(a) * s), D[s % 2 ? 6 : 5]); pc.set(Math.round(hx + Math.cos(a) * s) + 1, Math.round(hy + Math.sin(a) * s), D[3]); }
  }
  // fallen straw lying flat in every direction
  for (let i = 0; i < 14 * AREA; i++) thread(pc, r, r.range(0, T), r.range(0, T), r.range(10, 24), r.range(0, Math.PI * 2), D[r.int(4, 5)], null, 0.08);
  // now and then a flower: petals round an eye, lit on the upper left
  if (lush > 0.3) for (let i = 0; i < Math.round(2 * AREA * lush); i++) {
    const F = RF(r.pick(pal.bloom)), x = r.range(4, T - 4), y = r.range(4, T - 4), n = r.int(4, 6), a0 = r.range(0, 1);
    for (let p = 0; p < n; p++) leafStroke(pc, x, y, a0 + (p / n) * Math.PI * 2, r.range(3, 4.5), r.range(1.4, 2), F, r, { midrib: false });
    pc.set(Math.round(x), Math.round(y), rampNamed('ochre')[5]); pc.set(Math.round(x) - 1, Math.round(y) - 1, rampNamed('ochre')[6]);
  }
  tidy(pc);
}

/** the turf edge seen from the side: soil below, a ragged fringe of blades over the lip, roots threading down */
function grassSide(pc: PixelCanvas, grass: number, soil: number, seed: number) {
  const r = new Rand(seed), G = RF(grass), S = RF(soil);
  soilTop(pc, soil, seed + 1, 0.4);
  let len = k(5);
  for (let x = 0; x < T; x++) {
    if (r.chance(0.5)) len = Math.max(k(3), Math.min(k(8), len + r.pick([-1, 1])));
    const l = x >= T - 2 ? k(5) : len;
    for (let y = 0; y < l; y++) pc.set(x, y, G[y < K ? 5 : y < l - 2 * K ? 4 : 3]);
    pc.set(x, l, G[1]); pc.set(x, l + 1, S[1]);
    if (r.chance(0.2)) { const e = r.int(1, 3) * K; for (let j = 0; j < e; j++) pc.set(x, l + j, G[2]); }
    if (r.chance(0.1)) { let rx = x; for (let j = 2; j < r.int(4, 9) * K; j++) { pc.set(rx, l + j, S[5]); if (r.chance(0.3 / K)) rx += r.pick([-1, 1]); } }
  }
  tidy(pc);
}

// ================================================================================================ soil
/** dirt: angular plates and clods lit on their upper left, cracks with a lit lip, pebbles that glint, pale root
 *  threads, a twig or two. stones 0..1 sets how stony it is */
function soilTop(pc: PixelCanvas, soil: number, seed: number, stones = 1) {
  const r = new Rand(seed), S = RF(soil), St = rampNamed('stone'), Tw = rampNamed('fur');
  plates(pc, r, 30, S, [2, 3, 3, 4], { bevel: true });
  // cracks, branching now and then
  for (let i = 0; i < 9 * AREA; i++) {
    const x = r.int(0, T - 1), y = r.int(0, T - 1);
    crackLine(pc, x, y, r.int(14, 40), S[0], S[5], r);
    if (r.chance(0.5)) crackLine(pc, x + r.int(-6, 6), y + r.int(-6, 6), r.int(8, 18), S[0], S[5], r);
  }
  // clods: angular lumps of the soil itself, each with its contact shadow
  for (let i = 0; i < 26 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(5, 12), r.range(4, 9), S, r, S[0]);
  // roots: pale threads with a shadow under, a short branch off them
  for (let i = 0; i < 4 * AREA; i++) {
    const x = r.range(0, T), y = r.range(0, T), a = r.range(0, Math.PI * 2);
    thread(pc, r, x, y, r.range(30, 70), a, S[6], S[1], 0.4);
    thread(pc, r, x + r.range(-8, 8), y + r.range(-8, 8), r.range(8, 20), a + r.range(-1.2, 1.2), S[5], null, 0.5);
  }
  // pebbles (stone() gives them a lit facet and a glint)
  for (let i = 0; i < Math.round(7 * AREA * stones); i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(7, 15), r.range(5.5, 11), r.chance(0.6) ? St : rampNamed('slate'), r, S[0]);
  // twigs
  for (let i = 0; i < 2 * AREA; i++) thread(pc, r, r.range(0, T), r.range(0, T), r.range(14, 30), r.range(0, Math.PI * 2), Tw[3], Tw[1], 0.12);
  tidy(pc);
}

// ================================================================================================ rock
/** bedrock from above: fractured plates bevelled to the light with dark joints, hairline fractures, lichen crusts,
 *  grit in the joints */
function rockTop(pc: PixelCanvas, rock: number, seed: number, cell = 44, lichen = 1) {
  const r = new Rand(seed), Kr = RF(rock);
  const P = plates(pc, r, cell, Kr, [2, 3, 3, 4], { bevel: true, seam: 0, joint: 1.6 });
  // a second, finer fracture set inside the plates
  for (let i = 0; i < 26 * AREA; i++) crackLine(pc, r.int(0, T - 1), r.int(0, T - 1), r.int(8, 26), Kr[1], Kr[5], r);
  // grit lodged in the joints
  for (let i = 0; i < 120 * AREA; i++) {
    const x = r.int(0, T - 1), y = r.int(0, T - 1);
    if (P.edge[y * T + x] > 2.2) continue;
    stone(pc, x, y, r.range(2.5, 4.5), r.range(2, 3.5), r.chance(0.5) ? Kr : rampNamed('stone'), r, Kr[0]);
  }
  // lichen: angular crusts of one colony each, a darker rim, lit on the upper left
  const Li = [rampNamed('sage'), rampNamed('ochre'), rampNamed('straw'), rampNamed('olive')];
  for (let i = 0; i < Math.round(9 * AREA * lichen); i++) {
    const x = r.range(0, T), y = r.range(0, T), Lr = r.pick(Li), rad = r.range(5, 15), m = new Mask(Math.floor(x - rad * 2.4), Math.floor(y - rad * 2.4), Math.ceil(rad * 4.8) + 2, Math.ceil(rad * 4.8) + 2);
    fillPoly(blobPts(x, y, rad, rad * r.range(0.6, 1), 9, r, 0.45), (X, Y) => m.add(X, Y));
    for (let s = 0; s < r.int(1, 3); s++) fillPoly(blobPts(x + r.range(-rad, rad), y + r.range(-rad, rad), rad * 0.35, rad * 0.3, 6, r), (X, Y) => m.add(X, Y));
    m.ink(pc, Lr, (X, Y) => (X + Y < x + y ? 4 : 3), { dark: 1, lit: 5 });
  }
  // glints where a plate's lit rim catches the sun
  for (let i = 0; i < 24 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); if (P.edge[y * T + x] < 1.6 && P.at(x - 1, y) !== P.at(x, y)) pc.set(x + 1, y, rampNamed('snow')[5]); }
  tidy(pc);
}

/** a cliff face: beds of different thickness and tone; hard beds jut (a lit lip, a shaded underside); joints */
function rockSide(pc: PixelCanvas, rock: number, seed: number) {
  const r = new Rand(seed), Kr = RF(rock);
  const bands: { y0: number; t: number; k: number; hard: boolean }[] = [];
  for (let y = 0; y < T;) { let t = r.int(3, 7) * K + r.int(0, K - 1); if (T - (y + t) < 3 * K) t = T - y; bands.push({ y0: y, t, k: r.pick([2, 3, 3, 4]), hard: r.chance(0.45) }); y += t; }
  // the bed boundaries wander in hand-set steps along the face
  const lift: number[] = []; let lv = 0; for (let x = 0; x < T; x++) { if (x % (r.int(3, 6) * K) === 0) lv = r.pick([-2, -1, 0, 0, 1, 2]); lift.push(x === T - 1 ? 0 : lv); }
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const yy = W(y + lift[x]);
    let b = bands[0]; for (const q of bands) if (yy >= q.y0) b = q;
    const local = yy - b.y0;
    let kk = b.k;
    if (b.hard) { if (local < 2) kk = 5; else if (local >= b.t - 2) kk = 1; }
    else if (local >= b.t - 1) kk -= 1;
    pc.set(x, y, Kr[kk]);
  }
  for (const b of bands) if (b.hard && b.t >= 3) for (let j = 0; j < r.int(1, 2) * AREA * 2; j++) { const x = r.int(0, T - 1); for (let i = 2; i < b.t - 2; i++) { pc.set(x, W(b.y0 + i - lift[x]), Kr[1]); pc.set(x - 1, W(b.y0 + i - lift[x]), Kr[4]); } }
  for (let i = 0; i < 20 * AREA; i++) crackLine(pc, r.int(0, T - 1), r.int(0, T - 1), r.int(8, 22), Kr[0], Kr[5], r);
  tidy(pc);
}

// ================================================================================================ sand
/** sand: two broad tones, wind ripples (a lit crest over a shaded trough) that waver and break, grain clusters,
 *  small shells and pebbles */
function sand(pc: PixelCanvas, c: number, seed: number, wavy: number) {
  const r = new Rand(seed), S = RF(c), Sh = rampNamed('bone'), Co = rampNamed('coral');
  plates(pc, r, 60, S, [3, 3, 4]);
  // ripples: crests 10-14 cm apart running across the wind, each one wavering and breaking now and then
  const ph = r.range(0, 6.28), slope = r.range(-0.25, 0.25), gap = r.range(12, 16);
  const rows = Math.floor(T / gap);
  for (let j = 0; j < rows; j++) {
    const y0 = j * (T / rows) + r.range(-3, 3), amp = r.range(1.5, 4.5) * wavy, f1 = r.int(1, 3), f2 = r.int(3, 6);
    for (let x = 0; x < T; x++) {
      if (r.chance(0.014)) x += r.int(4, 14);
      const y = W(y0 + x * slope + Math.round(Math.sin((x / T) * Math.PI * 2 * f1 + ph + j) * amp + Math.sin((x / T) * Math.PI * 2 * f2 + j * 1.7) * amp * 0.4));
      pc.set(x, y - 1, S[5]); pc.set(x, y, S[6]); pc.set(x, y + 1, S[2]); pc.set(x, y + 2, S[2]); pc.set(x, y + 3, S[3]);
    }
  }
  // grains: small two-texel clusters, darker and lighter
  for (let i = 0; i < 260 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1), col = r.chance(0.5) ? S[1] : S[6]; pc.set(x, y, col); pc.set(x + (r.chance(0.5) ? 1 : 0), y + 1, col); }
  // shells: a fan of ribs (a cockle) or a little spiral (a whelk), pale with a dark outline
  for (let i = 0; i < 3 * AREA; i++) {
    const x = r.range(0, T), y = r.range(0, T), Rm = r.chance(0.6) ? Sh : Co, a0 = r.range(0, 6.28);
    if (r.chance(0.65)) {
      const m = new Mask(Math.floor(x - 8), Math.floor(y - 8), 17, 17), pts: P2[] = [[x, y]];
      for (let s = 0; s <= 6; s++) { const a = a0 + (s / 6) * 2.2 - 1.1; pts.push([x + Math.cos(a) * 5.5, y + Math.sin(a) * 5.5]); }
      fillPoly(pts, (X, Y) => m.add(X, Y));
      m.ink(pc, Rm, (X, Y) => (Math.floor(Math.atan2(Y + 0.5 - y, X + 0.5 - x) * 2.6) % 2 === 0 ? 4 : 3), { dark: 1, lit: 5 });
    } else {
      for (let s = 0; s < 14; s++) { const a = a0 + s * 0.75, rr = 1 + s * 0.28; pc.set(Math.round(x + Math.cos(a) * rr), Math.round(y + Math.sin(a) * rr), Rm[s % 3 === 0 ? 2 : 4]); }
      pc.set(Math.round(x), Math.round(y), Rm[5]);
    }
  }
  for (let i = 0; i < 4 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 7), r.range(2.5, 5.5), rampNamed('stone'), r, S[1]);
  tidy(pc);
}

// ================================================================================================ mud
/** mud: wet dark plates, puddles with a sky sheen and a lit lip, hoof prints pressed in, twigs and leaves */
function mud(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), M = RF(c), Wt = rampNamed('water'), Sk = rampNamed('sky'), Tw = rampNamed('fur');
  plates(pc, r, 34, M, [1, 2, 2, 3], { bevel: true });
  for (let i = 0; i < 10 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(4, 9), r.range(3, 6), M, r, M[0]);
  // hoof prints: a trail of paired hollows pressed in (dark floor, a lit far wall)
  for (let t = 0; t < AREA; t++) {
    let x = r.range(0, T), y = r.range(0, T); const a = r.range(0, 6.28), stp = r.range(16, 24);
    for (let s = 0; s < r.int(4, 8); s++) {
      for (const side of [-1, 1]) {
        const px = x + Math.cos(a + Math.PI / 2) * side * 4, py = y + Math.sin(a + Math.PI / 2) * side * 4;
        polyFill(pc, blobPts(px, py, 3.2, 4.2, 6, r, 0.15), M[0]);
        pc.set(Math.round(px + 2), Math.round(py + 3), M[4]); pc.set(Math.round(px + 3), Math.round(py + 2), M[4]);
      }
      x += Math.cos(a) * stp + r.range(-2, 2); y += Math.sin(a) * stp + r.range(-2, 2);
    }
  }
  // puddles
  for (let i = 0; i < 2 * AREA; i++) {
    const x = r.range(0, T), y = r.range(0, T), rx = r.range(14, 36), ry = rx * r.range(0.45, 0.75), m = new Mask(Math.floor(x - rx * 1.3) - 2, Math.floor(y - ry * 1.3) - 2, Math.ceil(rx * 2.6) + 5, Math.ceil(ry * 2.6) + 5);
    fillPoly(blobPts(x, y, rx, ry, 11, r, 0.3), (X, Y) => m.add(X, Y));
    // the water: dark, the sky caught in it toward the far (upper) side
    m.ink(pc, Wt, (_X, Y) => (Y < y - ry * 0.35 ? 3 : Y < y + ry * 0.2 ? 2 : 2), { dark: 2, lit: null });
    for (let s = 0; s < r.int(2, 4); s++) { const sy = Math.round(y - ry * r.range(0.1, 0.5)), sx = Math.round(x + r.range(-rx * 0.5, rx * 0.2)), l = r.int(4, 10); for (let q = 0; q < l; q++) if (m.has(sx + q, sy)) pc.set(sx + q, sy, Sk[q < 2 ? 5 : 4]); }
    // the lip: lit mud where the rim rises toward the light, a dark wet ring on the far side
    for (let Y = m.y0; Y < m.y0 + m.h; Y++) for (let X = m.x0; X < m.x0 + m.w; X++) {
      if (m.has(X, Y)) continue;
      if (m.has(X + 1, Y) || m.has(X, Y + 1)) pc.set(X, Y, M[5]);
      else if (m.has(X - 1, Y) || m.has(X, Y - 1)) pc.set(X, Y, M[0]);
    }
  }
  for (let i = 0; i < 3 * AREA; i++) thread(pc, r, r.range(0, T), r.range(0, T), r.range(12, 26), r.range(0, Math.PI * 2), Tw[3], Tw[1], 0.1);
  for (let i = 0; i < 4 * AREA; i++) leafStroke(pc, r.range(0, T), r.range(0, T), r.range(0, 6.28), r.range(5, 8), r.range(2, 3), rampNamed(r.pick(['rust', 'ochre', 'olive'] as const)), r, { midrib: true });
  tidy(pc);
}

/** clay: sun-baked crazing, plates with up-curled lit rims and dark cracks between */
function clay(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), C = RF(c);
  plates(pc, r, 30, C, [3, 3, 4], { bevel: true, seam: 0, joint: 1.3 });
  for (let i = 0; i < 6 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(3, 6), r.range(2.5, 4.5), C, r, C[0]);
  tidy(pc);
}

// ================================================================================================ snow
/** snow: crust plates with blue shadows, wind-cut ridges (a lit crest, a blue shadow under), sparkles, bird tracks */
function snow(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), S = rampNamed('snow'), Bl = rampNamed('sky');
  plates(pc, r, 46, S, [3, 4, 4, 5], { bevel: true });
  // sastrugi: long wind-cut ridges
  const ph = r.range(0, 6.28), slope = r.range(-0.3, 0.3);
  for (let j = 0; j < 12; j++) {
    const y0 = r.range(0, T), amp = r.range(2, 6), len = r.int(60, 220), x0 = r.int(0, T - 1);
    for (let x = x0; x < x0 + len; x++) {
      const y = W(y0 + (x - x0) * slope + Math.round(Math.sin((x / T) * Math.PI * 4 + ph + j) * amp));
      pc.set(x, y - 1, S[5]); pc.set(x, y, S[5]); pc.set(x, y + 1, Bl[4]); pc.set(x, y + 2, S[2]);
    }
  }
  // crust: flat flakes of wind-packed snow, lit on the upper left, a blue shadow along the lower right
  for (let i = 0; i < 46 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(7, 18), r.range(4, 9), S, r, S[2]);
  // blue hollows
  for (let i = 0; i < 6 * AREA; i++) polyFill(pc, blobPts(r.range(0, T), r.range(0, T), r.range(6, 16), r.range(3, 8), 7, r), S[2]);
  // sparkles: a bright texel, now and then a little cross
  for (let i = 0; i < 26 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, S[5]); if (r.chance(0.25)) { pc.set(x - 1, y, S[4]); pc.set(x + 1, y, S[4]); pc.set(x, y - 1, S[4]); pc.set(x, y + 1, S[4]); } }
  // bird tracks: three-toed prints in a line
  let x = r.range(0, T), y = r.range(0, T); const a = r.range(0, 6.28);
  for (let s = 0; s < 9; s++) {
    for (const da of [-0.55, 0, 0.55]) for (let q = 0; q < 5; q++) { pc.set(Math.round(x + Math.cos(a + da) * q), Math.round(y + Math.sin(a + da) * q), S[1]); pc.set(Math.round(x + Math.cos(a + da) * q) + 1, Math.round(y + Math.sin(a + da) * q) + 1, S[4]); }
    pc.set(Math.round(x - Math.cos(a) * 2), Math.round(y - Math.sin(a) * 2), S[1]);
    x += Math.cos(a) * 9 + (s % 2 ? 3 : -3) * Math.cos(a + 1.57); y += Math.sin(a) * 9 + (s % 2 ? 3 : -3) * Math.sin(a + 1.57);
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
    for (let col = 0; col < cols; col++) for (let y = r.int(0, 13 * K); y < T; y += r.int(10, 16) * K) for (let x = col * CW + 1; x < col * CW + CW; x++) { pc.set(x, y, Kb[1]); pc.set(x, y + 1, Kb[4]); }
  } else {
    plates(pc, r, 36, Kb, [2, 3, 3, 4], { bevel: true, seam: 0, joint: 1.5 });
    for (let i = 0; i < 20 * AREA; i++) crackLine(pc, r.int(0, T - 1), r.int(0, T - 1), r.int(6, 16), Kb[0], Kb[4], r);
  }
  tidy(pc);
}

/** ore: bedrock with faceted nuggets of ferrite (now and then copper or a fleck of gold), each in its rust stain */
function ore(pc: PixelCanvas, rock: number, seed: number, side: boolean) {
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed, 40, 0.3);
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
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed, 40, 0.3);
  const r = new Rand(seed + 3), C = RF(cry), Kr = RF(rock);
  for (let q = 0; q < AREA; q++) {
    const ox = (q % TILE_M) * TS, oy = Math.floor(q / TILE_M) * TS;
    for (let c = 0; c < 3; c++) {
      const bx = ox + k(5 + c * 10 + r.range(-1.5, 1.5)), by = oy + k(r.range(16, 30)), n = r.int(4, 6);
      for (let j = -3 * K; j <= 3 * K; j++) { pc.set(bx + j, by + 1, Kr[1]); if (Math.abs(j) < 3 * K) pc.set(bx + j, by, Kr[0]); if (Math.abs(j) < 2 * K) pc.set(bx + j, by + 2, Kr[2]); }
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
  for (let i = 0; i < 4 * AREA; i++) thread(pc, r, r.range(0, T), r.range(0, T), r.range(18, 40), r.range(0, Math.PI * 2), Tw[3], Tw[1], 0.1);
  const browns: number[][] = [rampNamed('rust'), rampNamed('ochre'), rampNamed('clay'), rampNamed('coral')];
  for (let i = 0; i < 90 * AREA; i++) {
    const R0 = r.chance(0.15) ? rampFor(r.pick(foliage)) : r.pick(browns);
    leafStroke(pc, r.range(0, T), r.range(0, T), r.range(0, Math.PI * 2), r.range(7, 15), r.range(2.6, 5), R0, r, { midrib: true, notch: r.chance(0.2) });
  }
  tidy(pc);
}

/** gravel: a bed of faceted stones of a few kinds, each with its contact shadow, grit between */
function gravel(pc: PixelCanvas, rock: number, seed: number) {
  const r = new Rand(seed), Kr = RF(rock), kinds = [Kr, rampNamed('stone'), rampNamed('sand'), rampNamed('slate')];
  plates(pc, r, 24, Kr, [1, 2]);
  for (let i = 0; i < 160 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(2.5, 4), r.range(2, 3.4), r.pick(kinds), r, Kr[0]);
  for (let i = 0; i < 110 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), k(r.range(1.8, 3.6)), k(r.range(1.5, 2.8)), r.pick(kinds), r, Kr[0]);
  tidy(pc);
}

/** the Veyr's moss: cushions of angular clumps, spore stalks, the odd vein glint (emissive) */
function moss(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), M = rampFor(VEYR.moss), G = rampNamed('glowTeal');
  plates(pc, r, 28, M, [1, 2]);
  for (let i = 0; i < 26 * AREA; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), k(r.range(2.6, 5)), k(r.range(2.2, 4)), M, r, M[0]);
  for (let i = 0; i < 16 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1), h = r.int(2, 3) * K; for (let j = 0; j < h; j++) pc.set(x, y - j, M[2]); pc.set(x, y - h, rampNamed('straw')[4], 200); }
  for (let i = 0; i < 8 * AREA; i++) pc.set(r.int(0, T - 1), r.int(0, T - 1), G[3], 150);
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
    plates(pc, r, 36, C, [1, 2]);
    for (let i = 0; i < 14 * K * AREA; i++) {
      const x = r.int(0, T - 1), y = r.int(0, T - 1), h = r.int(3, 7) * K, a = r.range(-0.6, 0.6);
      for (let t = 0; t < h; t++) for (let w = -1; w <= 1; w++) pc.set(x + Math.round(a * t) + w, y - t, C[w < 0 ? 5 : w > 0 ? 2 : 4], t === h - 1 ? 140 : 255);
    }
  } else if (kind === 1) {
    plates(pc, r, 30, C, [1, 2, 3], { bevel: true });
    for (let i = 0; i < 9 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); stone(pc, x, y, r.range(3, 5) * K, r.range(2, 3) * K, C, r, C[0]); pc.set(x, y + 1, V[3], 120); }
  } else {
    plates(pc, r, 40, C, [1, 2]);
    for (let i = 0; i < 22 * K * AREA; i++) { let x = r.int(0, T - 1), y = r.int(0, T - 1); for (let t = 0; t < 8 * K; t++) { pc.set(x, y, C[t % 3 === 0 ? 5 : 4]); x += r.pick([-1, 0, 1]); y += r.pick([-1, 0, 1]); } }
  }
}

/** an impact crater floor: fused glass plates, faceted beads, now and then a cooling ember (emissive) */
function crater(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), Kc = rampNamed('basalt'), G = rampNamed('slate');
  plates(pc, r, 32, Kc, [1, 2, 3], { bevel: true, seam: 0 });
  for (let i = 0; i < 24 * AREA; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, G[3]); pc.set(x + 1, y, G[2]); pc.set(x, y - 1, G[5]); pc.set(x + 1, y + 1, Kc[0]); }
  for (let i = 0; i < 3; i++) if (r.chance(0.5)) pc.set(r.int(0, T - 1), r.int(0, T - 1), rampNamed('glowAmber')[3], 210);
}

/** the scatter sheet: four 1 m cells (2 x 2), each a small group of stones round a big one, on transparency, with
 *  contact shadows (alpha ~110); the terrain stamps one here and there */
function scatter(pc: PixelCanvas, pal: Palette, seed: number) {
  const r = new Rand(seed), kinds = [RF(pal.rock), rampNamed('stone'), rampNamed('slate'), RF(pal.sand)];
  const SH = 0x10141a;
  pc.clear();
  for (let q = 0; q < AREA; q++) {
    // (kept well inside its 1 m cell: the terrain cuts the sheet at the cell's edge)
    const cx = (q % TILE_M) * TS + TS / 2 + r.range(-6, 6), cy = Math.floor(q / TILE_M) * TS + TS / 2 + r.range(-6, 6);
    const K0 = r.pick(kinds), big = r.range(24, 40);
    stone(pc, cx, cy, big, big * r.range(0.65, 0.9), K0, r, SH);
    for (let s = 0; s < r.int(2, 6); s++) {
      const a = r.range(0, 6.28), d = big * r.range(0.7, 1.1);
      stone(pc, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r.range(6, 15), r.range(5, 11), r.chance(0.7) ? K0 : r.pick(kinds), r, SH);
    }
  }
  toPalette(pc);
  // shadows half see-through (black), everything else solid
  const d = pc.data, s0 = toPaletteOf(SH);
  for (let i = 0; i < T * T; i++) if (d[i * 4 + 3] > 0) {
    const sh = d[i * 4] === s0[0] && d[i * 4 + 1] === s0[1] && d[i * 4 + 2] === s0[2];
    if (sh) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 0; d[i * 4 + 3] = 110; } else d[i * 4 + 3] = 255;
  }
}
/** a colour as the palette snap turns it (rgb bytes) */
function toPaletteOf(c: number): [number, number, number] {
  const p = new PixelCanvas(1, 1); p.fill(0); p.set(0, 0, c); toPalette(p);
  return [p.data[0], p.data[1], p.data[2]];
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
  paint(L.grassA, (p) => grassTop(p, pal, pal.grass, s + 1, 0.55));
  paint(L.grassB, (p) => grassTop(p, pal, pal.grass, s + 2, 1));
  paint(L.grassSide, (p) => grassSide(p, pal.grass, pal.soil, s + 3));
  paint(L.soil, (p) => soilTop(p, pal.soil, s + 4));
  paint(L.rockA, (p) => rockTop(p, pal.rock, s + 5));
  paint(L.rockB, (p) => rockTop(p, pal.rock, s + 6, 56, 1.4));
  paint(L.rockSide, (p) => rockSide(p, pal.rock, s + 7));
  paint(L.sandA, (p) => sand(p, pal.sand, s + 8, 1));
  paint(L.sandB, (p) => sand(p, pal.sand, s + 9, 0.5));
  paint(L.mud, (p) => mud(p, pal.mud, s + 10));
  paint(L.clay, (p) => clay(p, pal.clay, s + 11));
  paint(L.snow, (p) => snow(p, s + 12));
  paint(L.snowSide, (p) => { rockSide(p, pal.rock, s + 13); const S = rampNamed('snow'), r = new Rand(s + 13); let l = 6 * K; for (let x = 0; x < T; x++) { if (x % (3 * K) === 0) l = Math.max(4 * K, Math.min(9 * K, l + r.pick([-K, 0, K]))); for (let y = 0; y < l; y++) p.set(x, y, S[y === l - 1 ? 1 : y < K ? 5 : 4]); } });
  paint(L.basalt, (p) => basalt(p, pal.basalt, s + 14, false));
  paint(L.basaltSide, (p) => basalt(p, pal.basalt, s + 15, true));
  paint(L.ore, (p) => ore(p, pal.rock, s + 16, false));
  paint(L.oreSide, (p) => ore(p, pal.rock, s + 17, true));
  paint(L.crystal, (p) => crystal(p, pal.rock, pal.crystal, s + 18, false));
  paint(L.crystalSide, (p) => crystal(p, pal.rock, pal.crystal, s + 19, true));
  paint(L.litter, (p) => litter(p, pal.soil, pal.foliage, s + 20));
  paint(L.gravel, (p) => gravel(p, pal.rock, s + 21));
  paint(L.moss, (p) => moss(p, 777));
  paint(L.mossSide, (p) => mossSide(p, 778));
  paint(L.creep0, (p) => creep(p, 0, 801));
  paint(L.creep1, (p) => creep(p, 1, 802));
  paint(L.creep2, (p) => creep(p, 2, 803));
  paint(L.creepSide, (p) => creep(p, 1, 804));
  paint(L.dryA, (p) => grassTop(p, pal, pal.grassDry, s + 22, 0.1));
  paint(L.drySide, (p) => grassSide(p, pal.grassDry, pal.soil, s + 23));
  paint(L.mudSide, (p) => soilTop(p, pal.mud, s + 24, 0.4));
  paint(L.crater, (p) => crater(p, s + 25));
  paint(L.scatter, (p) => scatter(p, pal, s + 26), false);
  const tex = new THREE.DataArrayTexture(data, T, T, LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  // crisp texels close up; down the mip chain at a distance (nearest texel, blended between levels) so it never
  // shimmers
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { tex, avg, ms: performance.now() - t0 };
}
/** GPU memory of the block array with its mip chain, bytes (about 11 MB) */
export const BLOCK_BYTES = Math.round((T * T * 4 * LAYERS * 4) / 3);
