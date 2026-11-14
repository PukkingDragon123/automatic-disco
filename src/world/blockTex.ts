// Terrain block textures: TS x TS tileable pixel art (TS px/m; 64 since the art direction's double density), drawn
// at the same world scale whatever TS is (shapes and strokes are laid out on a 32-unit grid scaled by K = TS / 32,
// so a larger tile carries the same forms with finer edges and more marks), per planet into one DataArrayTexture from the
// master palette ramps: angular tone plates, blade clumps, faceted stones with contact shadows, drawn cracks and
// ripples, litter of drawn leaves. Alpha < 255 marks emissive pixels (glow = 1 - a/255).
import * as THREE from 'three';
import { PixelCanvas } from '../limbo/gfx/pixel';
import { Rand } from '../core/rand';
import { rampFor, rampNamed, plates, stone, nugget, prism, bladeStroke, crackLine, leafStroke, fillPoly, Mask, tidy, toPalette, type P2 } from './pixelKit';
import { VEYR, RIVALS, type Palette } from './palette';

/** tile size in pixels (one tile per metre). The terrain and water shaders read it (terrain.ts, water.ts) */
export const TS = 64;
/** the art's scale over its 32-unit layout grid */
const K = TS / 32;
/** a length on the 32 grid, in pixels */
const k = (v: number) => v * K;
export const L = {
  grassA: 0, grassB: 1, grassSide: 2, soil: 3, rockA: 4, rockB: 5, rockSide: 6, sandA: 7, sandB: 8, mud: 9, clay: 10,
  snow: 11, snowSide: 12, basalt: 13, basaltSide: 14, ore: 15, oreSide: 16, crystal: 17, crystalSide: 18, litter: 19,
  gravel: 20, moss: 21, mossSide: 22, creep0: 23, creep1: 24, creep2: 25, creepSide: 26, dryA: 27, drySide: 28, mudSide: 29, crater: 30,
} as const;
export const LAYERS = 31;

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

const T = TS;
const RF = (c: number) => rampFor(c, 7);
/** a pixel inside the tile, wrapping */
const W = (v: number) => ((Math.floor(v) % T) + T) % T;

/** turf: plates of two greens (and a sun-cured one), clumps of blades fanning from a root, loose blades, seed heads */
function grassTop(pc: PixelCanvas, base: number, dry: number, soil: number, seed: number, bloom: number[]) {
  const r = new Rand(seed), G = RF(base), D = RF(dry), S = RF(soil);
  // small plates in two neighbouring steps (nothing distinct enough to show the 1 m repeat), blades over them
  plates(pc, r, 16, G, [3, 4]);
  const rampAt = (_x: number, _y: number) => (r.chance(0.22) ? D : G);
  // clumps: 3-6 blades fanning out of one root, a dark root pixel beside them
  for (let i = 0; i < 10; i++) {
    const cx = r.int(0, T - 1), cy = r.int(0, T - 1), R0 = rampAt(cx, cy), m = r.int(3, 6) * K;
    for (let j = 0; j < K; j++) pc.set(cx + 1 + j, cy + 1, S[1]);
    for (let b = 0; b < m; b++) bladeStroke(pc, cx + b - (m >> 1), cy, Math.round(r.int(3, 6) * K * r.range(0.8, 1.1)), ((b - (m - 1) / 2) * 1.2) / K, R0, r.chance(0.25) ? D : undefined);
  }
  for (let i = 0; i < 70 * K; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); bladeStroke(pc, x, y, r.int(2, 4) * K - r.int(0, K - 1), r.pick([-1, 0, 0, 1]), rampAt(x, y)); }
  for (let i = 0; i < 3 * K; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, D[5]); pc.set(x, y + 1, D[4]); pc.set(x + 1, y + 1, D[3]); }
  if (r.chance(0.4)) {
    // a small flower: four petals round an eye (each petal a lit and a shaded pixel at double density)
    const F = RF(r.pick(bloom)), x = r.int(K, T - 1 - K), y = r.int(K, T - 1 - K), O = rampNamed('ochre');
    for (let j = 1; j <= K; j++) { pc.set(x, y - j, F[5]); pc.set(x - j, y, F[5]); pc.set(x + j, y, F[4]); pc.set(x, y + j, F[3]); }
    if (K > 1) { pc.set(x - 1, y - 1, F[4]); pc.set(x + 1, y - 1, F[4]); pc.set(x - 1, y + 1, F[3]); pc.set(x + 1, y + 1, F[2]); }
    pc.set(x, y, O[5]);
  }
  tidy(pc);
}

/** the turf edge seen from the side: soil below, a ragged fringe of blades over the lip, roots threading down */
function grassSide(pc: PixelCanvas, grass: number, soil: number, seed: number) {
  const r = new Rand(seed), G = RF(grass), S = RF(soil);
  soilFill(pc, soil, seed + 1, 3);
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

/** soil: angular clods (each one tone, lit on its upper left), faceted pebbles, a crack or two, pale root fibres */
function soilFill(pc: PixelCanvas, soil: number, seed: number, stones = 6) {
  const r = new Rand(seed), S = RF(soil), Kst = rampNamed('stone');
  plates(pc, r, 18, S, [3, 4]);
  for (let i = 0; i < 2 * K; i++) crackLine(pc, r.int(0, T - 1), r.int(0, T - 1), r.int(4, 8) * K, S[0], S[4], r);
  for (let i = 0; i < 2 * K; i++) { let x = r.int(0, T - 1), y = r.int(0, T - 1); const dx = r.pick([-1, 1]); for (let j = 0; j < r.int(3, 6) * K; j++) { pc.set(x, y, S[5]); x += dx; if (r.chance(0.35 / K)) y += r.pick([-1, 1]); } }
  for (let i = 0; i < stones; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), k(r.range(2.2, 4)), k(r.range(2, 3.2)), r.chance(0.5) ? Kst : rampFor(soil), r, S[1]);
  tidy(pc);
}

/** bedrock from above: bevelled plates split by joints, hairline cracks, small angular crusts of lichen */
function rockTop(pc: PixelCanvas, rock: number, seed: number, n = 7, lichen = true) {
  const r = new Rand(seed), Kr = RF(rock), Li = rampNamed(r.chance(0.5) ? 'sage' : 'ochre');
  plates(pc, r, n, Kr, [2, 3, 3, 4], { bevel: true, seam: 1 });
  for (let i = 0; i < 3 * K; i++) crackLine(pc, r.int(0, T - 1), r.int(0, T - 1), r.int(3, 7) * K, Kr[0], Kr[5], r);
  if (lichen) for (let i = 0; i < r.int(2, 4); i++) {
    const x = r.int(0, T - 1), y = r.int(0, T - 1), m = new Mask(x - 4 * K, y - 4 * K, 9 * K, 9 * K), pts: P2[] = [];
    for (let j = 0; j < 5 + K; j++) { const a = (j / (5 + K)) * Math.PI * 2 + r.range(-0.3, 0.3); pts.push([x + Math.cos(a) * k(r.range(1.4, 2.8)), y + Math.sin(a) * k(r.range(1, 2.2))]); }
    fillPoly(pts, (X, Y) => m.add(X, Y));
    m.ink(pc, Li, (X, Y) => (X + Y < x + y ? 4 : 3), { dark: 2, lit: null });
  }
  tidy(pc);
}

/** a cliff face: beds of different thickness and tone; hard beds jut (a lit lip, a shaded underside); joints */
function rockSide(pc: PixelCanvas, rock: number, seed: number) {
  const r = new Rand(seed), Kr = RF(rock);
  const bands: { y0: number; t: number; k: number; hard: boolean }[] = [];
  for (let y = 0; y < T;) { let t = r.int(3, 7) * K + r.int(0, K - 1); if (T - (y + t) < 3 * K) t = T - y; bands.push({ y0: y, t, k: r.pick([2, 3, 3, 4]), hard: r.chance(0.45) }); y += t; }
  // the bed boundaries wander by a pixel in hand-set steps along the face
  const lift: number[] = []; let lv = 0; for (let x = 0; x < T; x++) { if (x % (r.int(3, 6) * K) === 0) lv = r.pick([-1, 0, 0, 1]); lift.push(x === T - 1 ? 0 : lv); }
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const yy = W(y + lift[x]);
    let b = bands[0]; for (const q of bands) if (yy >= q.y0) b = q;
    const local = yy - b.y0;
    let kk = b.k;
    if (b.hard) { if (local === 0) kk = 5; else if (local === b.t - 1) kk = 1; }
    else if (local === b.t - 1) kk -= 1;
    pc.set(x, y, Kr[kk]);
  }
  for (const b of bands) if (b.hard && b.t >= 3) for (let j = 0; j < r.int(1, 2) * K; j++) { const x = r.int(0, T - 1); for (let i = 1; i < b.t - 1; i++) { pc.set(x, W(b.y0 + i - lift[x]), Kr[1]); pc.set(x - 1, W(b.y0 + i - lift[x]), Kr[4]); } }
  tidy(pc);
}

/** sand: two broad tones, wind ripples drawn as wavy lines (a lit crest over a shaded trough), a few pebbles */
function sand(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), S = RF(c);
  plates(pc, r, 6, S, [3, 4]);
  const ph = r.range(0, 6.28);
  for (let j = 0; j < 5; j++) for (let x = 0; x < T; x++) {
    const y = W(x * 0.5 + k(j * 6.4) + Math.round(Math.sin((x / T) * Math.PI * 2 + ph + j) * k(1.5)));
    pc.set(x, y, S[5]); pc.set(x, y + 1, S[2]); if (K > 1) pc.set(x, y + 2, S[3]);
  }
  for (let i = 0; i < 2 + K; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), k(2.4) * r.range(0.6, 1), k(2) * r.range(0.6, 1), rampNamed('stone'), r, S[2]);
  tidy(pc);
}

/** mud: dark wet plates, standing hollows with a pale lip of sky, twigs pressed in */
function mud(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), M = RF(c), Wt = rampNamed('water');
  plates(pc, r, 8, M, [1, 2, 2, 3], { bevel: true });
  for (let i = 0; i < 3; i++) {
    const x = r.int(0, T - 1), y = r.int(0, T - 1), pts: P2[] = [], m = new Mask(x - 6 * K, y - 4 * K, 13 * K, 9 * K);
    for (let j = 0; j < 6 + K; j++) { const a = (j / (6 + K)) * Math.PI * 2 + r.range(-0.3, 0.3); pts.push([x + Math.cos(a) * k(r.range(2.4, 4.5)), y + Math.sin(a) * k(r.range(1.3, 2.6))]); }
    fillPoly(pts, (X, Y) => m.add(X, Y));
    m.ink(pc, Wt, (X, Y) => (Y < y ? 3 : 2), { dark: 1, lit: null });
  }
  for (let i = 0; i < 2 * K; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1), l = r.int(3, 6) * K, dy = r.pick([-1, 0, 1]); for (let j = 0; j < l; j++) pc.set(x + j, y + Math.round((j * dy * 0.4) / K), M[4]); }
  tidy(pc);
}

/** clay: sun-baked crazing, plates with up-curled lit rims and dark cracks between */
function clay(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), C = RF(c);
  plates(pc, r, 9, C, [3, 3, 4], { bevel: true, seam: 0 });
  tidy(pc);
}

/** snow: drifted plates, wind ripples, a few deliberate glints */
function snow(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), S = rampNamed('snow');
  void c;
  plates(pc, r, 6, S, [3, 4, 4]);
  const ph = r.range(0, 6.28);
  for (let j = 0; j < 3; j++) for (let x = 0; x < T; x++) { const y = W(x * 0.5 + k(j * 10.7) + Math.round(Math.sin((x / T) * Math.PI * 4 + ph) * k(1.2))); pc.set(x, y, S[2]); pc.set(x, y - 1, S[5]); }
  for (let i = 0; i < 4 * K; i++) pc.set(r.int(0, T - 1), r.int(0, T - 1), S[5]);
}

/** basalt: column ends as bevelled polygons on a staggered lattice (top), column flanks with cross joints (side) */
function basalt(pc: PixelCanvas, c: number, seed: number, side: boolean) {
  const r = new Rand(seed), Kb = RF(c), CW = 8 * K;
  if (side) {
    for (let x = 0; x < T; x++) { const col = Math.floor(x / CW), kk = [2, 3, 2, 4][col], e = x % CW; for (let y = 0; y < T; y++) pc.set(x, y, e === 0 ? Kb[0] : e === 1 ? Kb[kk + 1] : e === CW - 1 ? Kb[kk - 1] : Kb[kk]); }
    for (let col = 0; col < 4; col++) for (let y = (col * 5 * K) % (13 * K); y < T; y += 13 * K) for (let x = col * CW + 1; x < col * CW + CW; x++) { pc.set(x, y, Kb[1]); pc.set(x, y + 1, Kb[4]); }
  } else {
    plates(pc, r, 12, Kb, [2, 3, 3, 4], { bevel: true, seam: 0 });
    for (let i = 0; i < 6 * K; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, Kb[0]); pc.set(x + 1, y, Kb[0]); pc.set(x, y + 1, Kb[4]); }
  }
  tidy(pc);
}

/** ore: bedrock with faceted nuggets of ferrite, each in its rust stain */
function ore(pc: PixelCanvas, rock: number, oreC: number, seed: number, side: boolean) {
  // ferrite: rock studded with chunky metal nuggets (iron grey-brown, now and then copper or a fleck of gold), each
  // faceted with a glint, sitting in a rusty stain with its contact shadow
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed, 9, false);
  const r = new Rand(seed + 7), Fe = rampNamed('iron'), Cu = rampNamed('copper'), Au = rampNamed('gold'), Ru = rampNamed('rust'), Kr = RF(rock);
  void oreC;
  const spots: [number, number][] = [];
  for (let tries = 0; spots.length < 4 && tries < 60; tries++) {
    const x = k(r.range(6, 26)), y = k(r.range(6, 26)), gap = k(spots.length < 2 ? 13 : 9);
    if (spots.some(([a, b]) => Math.abs(a - x) < gap && Math.abs(b - y) < gap)) continue;
    spots.push([x, y]);
  }
  spots.forEach(([x, y], i) => {
    const M = i === 3 && r.chance(0.6) ? Au : i === 2 || r.chance(0.2) ? Cu : Fe, big = i < 2;
    nugget(pc, x, y, k(big ? r.range(10, 12.5) : r.range(6, 8)), k(big ? r.range(7.5, 9.5) : r.range(5, 6.5)), M, r, i % 2 ? Kr[1] : Ru[1]);
  });
}

/** crystal: bedrock pierced by clusters of faceted prisms fanning from a shared root (glowing a little: alpha < 255) */
function crystal(pc: PixelCanvas, rock: number, cry: number, seed: number, side: boolean) {
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed, 9, false);
  const r = new Rand(seed + 3), C = RF(cry), Kr = RF(rock);
  for (let c = 0; c < 3; c++) {
    const bx = k(5 + c * 10 + r.range(-1.5, 1.5)), by = k(r.range(16, 30)), n = r.int(3, 5) + (K > 1 ? 1 : 0);
    // the root: a dark socket of broken rock the prisms grow from
    for (let j = -3 * K; j <= 3 * K; j++) { pc.set(bx + j, by + 1, Kr[1]); if (Math.abs(j) < 3 * K) pc.set(bx + j, by, Kr[0]); if (K > 1 && Math.abs(j) < 2 * K) pc.set(bx + j, by + 2, Kr[2]); }
    // back to front: the tall ones behind, short leaning ones in front
    const ps = Array.from({ length: n }, (_, j) => ({ lean: (j / (n - 1) - 0.5) * r.range(0.5, 0.9), h: k(r.range(8, 14)) * (j === (n >> 1) ? 1.25 : 1), hw: k(r.range(1.8, 2.8)), dx: k((j / (n - 1) - 0.5) * 5) }));
    ps.sort((a, b) => b.h - a.h);
    for (const p of ps) prism(pc, bx + p.dx, by, p.hw, Math.min(by - 1, p.h), p.lean, C, 190);
  }
}

/** leaf litter: soil strewn with drawn leaves at every angle (browned, a few still fresh), twigs across them */
function litter(pc: PixelCanvas, soil: number, foliage: number[], seed: number) {
  soilFill(pc, soil, seed, 2);
  const r = new Rand(seed + 5), Tw = rampNamed('fur');
  for (let i = 0; i < 3; i++) {
    const x = r.int(0, T - 1), y = r.int(0, T - 1), l = r.int(4, 8) * K, dx = r.pick([-1, 1]);
    for (let j = 0; j < l; j++) { const X = x + j * dx, Y = y + Math.floor(j / 3); pc.set(X, Y, Tw[3]); if (K > 1) pc.set(X, Y + 1, Tw[2]); pc.set(X, Y + K, Tw[1]); }
  }
  const browns: number[][] = [rampNamed('rust'), rampNamed('ochre'), rampNamed('clay'), rampNamed('coral')];
  for (let i = 0; i < 24; i++) {
    const R0 = r.chance(0.15) ? rampFor(r.pick(foliage)) : r.pick(browns);
    leafStroke(pc, r.range(0, T), r.range(0, T), r.range(0, Math.PI * 2), k(r.range(2.5, 4.2)), k(r.range(0.9, 1.5)), R0, r, { midrib: K > 1 });
  }
  tidy(pc);
}

/** gravel: a bed of faceted stones of a few kinds, each with its contact shadow */
function gravel(pc: PixelCanvas, rock: number, seed: number) {
  const r = new Rand(seed), Kr = RF(rock), kinds = [Kr, rampNamed('stone'), rampNamed('sand'), rampNamed('slate')];
  plates(pc, r, 8, Kr, [1, 2]);
  for (let i = 0; i < 46; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), k(r.range(2.2, 4.4)), k(r.range(1.8, 3.4)), r.pick(kinds), r, Kr[0]);
  // grit between the stones
  for (let i = 0; i < 30 * (K - 1); i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), r.range(2.2, 3.2), r.range(1.8, 2.6), r.pick(kinds), r, Kr[0]);
  tidy(pc);
}

/** the Veyr's moss: cushions of angular clumps, spore stalks, the odd vein glint (emissive) */
function moss(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), M = rampFor(VEYR.moss), G = rampNamed('glowTeal');
  plates(pc, r, 8, M, [1, 2]);
  for (let i = 0; i < 26; i++) stone(pc, r.int(0, T - 1), r.int(0, T - 1), k(r.range(2.6, 5)), k(r.range(2.2, 4)), M, r, M[0]);
  for (let i = 0; i < 4 * K; i++) { const x = r.int(0, T - 1), y = r.int(3 * K, T - 1), h = r.int(2, 3) * K; for (let j = 0; j < h; j++) pc.set(x, y - j, M[2]); pc.set(x, y - h, rampNamed('straw')[4], 200); }
  for (let i = 0; i < 2 * K; i++) pc.set(r.int(0, T - 1), r.int(0, T - 1), G[3], 150);
}
function mossSide(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), M = rampFor(VEYR.moss);
  for (let x = 0; x < T; x++) { const kk = [2, 3, 2, 1][Math.floor(x / (8 * K))]; for (let y = 0; y < T; y++) pc.set(x, y, M[(y + x * 3) % 11 === 0 ? kk + 1 : kk]); }
  for (let x = 0; x < T; x++) if (r.chance(0.15)) { const y = r.int(4 * K, 30 * K); pc.set(x, y, rampNamed('straw')[4], 200); pc.set(x, y - 1, M[5]); }
}

/** a rival's creep: crystalline shards, a fungal mat of little caps, or pale filaments */
function creep(pc: PixelCanvas, k: number, seed: number) {
  const rv = RIVALS[k], C = rampFor(rv.creep), r = new Rand(seed), V = rampFor(rv.vein);
  if (k === 0) {
    plates(pc, r, 7, C, [1, 2]);
    for (let i = 0; i < 14 * K; i++) {
      const x = r.int(0, T - 1), y = r.int(0, T - 1), h = r.int(3, 7) * K, a = r.range(-0.6, 0.6);
      for (let t = 0; t < h; t++) for (let w = -1; w <= 1; w++) pc.set(x + Math.round(a * t) + w, y - t, C[w < 0 ? 5 : w > 0 ? 2 : 4], t === h - 1 ? 140 : 255);
    }
  } else if (k === 1) {
    plates(pc, r, 9, C, [1, 2, 3], { bevel: true });
    for (let i = 0; i < 9; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); stone(pc, x, y, r.range(3, 5) * K, r.range(2, 3) * K, C, r, C[0]); pc.set(x, y + 1, V[3], 120); }
  } else {
    plates(pc, r, 6, C, [1, 2]);
    for (let i = 0; i < 22 * K; i++) { let x = r.int(0, T - 1), y = r.int(0, T - 1); for (let t = 0; t < 8 * K; t++) { pc.set(x, y, C[t % 3 === 0 ? 5 : 4]); x += r.pick([-1, 0, 1]); y += r.pick([-1, 0, 1]); } }
  }
}

/** an impact crater floor: fused glass plates, faceted beads, now and then a cooling ember (emissive) */
function crater(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), Kc = rampNamed('basalt'), G = rampNamed('slate');
  plates(pc, r, 10, Kc, [1, 2, 3], { bevel: true, seam: 0 });
  for (let i = 0; i < 6 * K; i++) { const x = r.int(0, T - 1), y = r.int(0, T - 1); pc.set(x, y, G[3]); pc.set(x + 1, y, G[2]); pc.set(x, y - 1, G[5]); pc.set(x + 1, y + 1, Kc[0]); }
  if (r.chance(0.5)) pc.set(r.int(0, T - 1), r.int(0, T - 1), rampNamed('glowAmber')[3], 210);
}

/** paint every layer for this palette into a mipmapped array texture */
export function buildBlockTexture(pal: Palette, seed: number): { tex: THREE.DataArrayTexture; avg: number[] } {
  const data = new Uint8Array(TS * TS * 4 * LAYERS);
  const avg: number[] = [];
  const paint = (layer: number, fn: (pc: PixelCanvas) => void) => {
    const pc = new PixelCanvas(TS, TS);
    pc.fill(0x000000);
    fn(pc);
    toPalette(pc);
    data.set(pc.data, layer * TS * TS * 4);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < TS * TS; i++) { r += pc.data[i * 4]; g += pc.data[i * 4 + 1]; b += pc.data[i * 4 + 2]; }
    avg[layer] = ((r / TS / TS) << 16) | ((g / TS / TS) << 8) | (b / TS / TS);
  };
  const s = seed * 131;
  paint(L.grassA, (p) => grassTop(p, pal.grass, pal.grassDry, pal.soil, s + 1, pal.bloom));
  paint(L.grassB, (p) => grassTop(p, pal.grass, pal.grassDry, pal.soil, s + 2, pal.bloom));
  paint(L.grassSide, (p) => grassSide(p, pal.grass, pal.soil, s + 3));
  paint(L.soil, (p) => soilFill(p, pal.soil, s + 4));
  paint(L.rockA, (p) => rockTop(p, pal.rock, s + 5));
  paint(L.rockB, (p) => rockTop(p, pal.rock, s + 6));
  paint(L.rockSide, (p) => rockSide(p, pal.rock, s + 7));
  paint(L.sandA, (p) => sand(p, pal.sand, s + 8));
  paint(L.sandB, (p) => sand(p, pal.sand, s + 9));
  paint(L.mud, (p) => mud(p, pal.mud, s + 10));
  paint(L.clay, (p) => clay(p, pal.clay, s + 11));
  paint(L.snow, (p) => snow(p, pal.snow, s + 12));
  paint(L.snowSide, (p) => { rockSide(p, pal.rock, s + 13); const S = rampNamed('snow'), r = new Rand(s + 13); let l = 6 * K; for (let x = 0; x < TS; x++) { if (x % (3 * K) === 0) l = Math.max(4 * K, Math.min(9 * K, l + r.pick([-K, 0, K]))); for (let y = 0; y < l; y++) p.set(x, y, S[y === l - 1 ? 1 : y < K ? 5 : 4]); } });
  paint(L.basalt, (p) => basalt(p, pal.basalt, s + 14, false));
  paint(L.basaltSide, (p) => basalt(p, pal.basalt, s + 15, true));
  paint(L.ore, (p) => ore(p, pal.rock, pal.ore, s + 16, false));
  paint(L.oreSide, (p) => ore(p, pal.rock, pal.ore, s + 17, true));
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
  paint(L.dryA, (p) => grassTop(p, pal.grassDry, pal.sand, pal.soil, s + 22, pal.bloom));
  paint(L.drySide, (p) => grassSide(p, pal.grassDry, pal.soil, s + 23));
  paint(L.mudSide, (p) => { soilFill(p, pal.mud, s + 24); });
  paint(L.crater, (p) => crater(p, s + 25));
  const tex = new THREE.DataArrayTexture(data, TS, TS, LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return { tex, avg };
}
