// Terrain block textures: 32 x 32 tileable pixel art (32 px/m), painted per planet palette into one
// DataArrayTexture. Alpha < 255 marks emissive pixels (glow = 1 - a/255).
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex } from '../limbo/gfx/pixel';
import { tileFbm, hashf } from '../limbo/core/rng';
import { Rand } from '../core/rand';
import { VEYR, RIVALS, type Palette } from './palette';

export const TS = 32;
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

const clampI = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));
/** natural ramps: gentle hue drift toward cool shadows / warm lights, little saturation gain in the highlights */
const R = (c: number, n = 6, spread = 0.55, hue = 0.03) => makeRamp(c, n, { spread, hueShift: hue, satShift: 0.04 });

/** wrap-aware voronoi: nearest / second-nearest distance and the nearest index */
function voronoi(pts: number[][], x: number, y: number, W: number, H: number, sx = 1, sy = 1) {
  let d1 = 1e9, d2 = 1e9, i1 = 0;
  for (let i = 0; i < pts.length; i++) {
    let dx = Math.abs(x - pts[i][0]); dx = Math.min(dx, W - dx);
    let dy = Math.abs(y - pts[i][1]); dy = Math.min(dy, H - dy);
    const d = Math.hypot(dx * sx, dy * sy);
    if (d < d1) { d2 = d1; d1 = d; i1 = i; } else if (d < d2) d2 = d;
  }
  return [d1, d2, i1];
}

/** single-pixel grain relative to what is already there: dark specks and pale specks */
function grit(pc: PixelCanvas, r: Rand, n: number, light: number, darkP = 0.5, lightA = 0.45) {
  for (let i = 0; i < n; i++) {
    const x = r.int(0, TS - 1), y = r.int(0, TS - 1);
    if (r.chance(darkP)) pc.shade(x, y, r.range(0.74, 0.88)); else pc.blend(x, y, light, r.range(lightA * 0.6, lightA));
  }
}

/** a short random-walk crack: dark line with a faint lit lip above it */
function crack(pc: PixelCanvas, r: Rand, x: number, y: number, n: number, dark: number, lip: number) {
  const dx = r.pick([-1, 1]);
  for (let k = 0; k < n; k++) {
    pc.set(x, y, dark); pc.blend(x, y - 1, lip, 0.3);
    if (r.chance(0.6)) x += dx; if (r.chance(0.5)) y += r.pick([-1, 1]);
  }
}

/** a stone lit from the upper left, with a soft contact shadow toward the lower right */
function pebble(pc: PixelCanvas, x: number, y: number, rad: number, ramp: number[]) {
  const n = ramp.length - 1, inR = (i: number, j: number) => i * i + j * j <= rad * rad + 0.6;
  for (let j = -rad; j <= rad + 1; j++) for (let i = -rad; i <= rad + 1; i++) if (inR(i - 1, j - 1) && !inR(i, j)) pc.shade(x + i, y + j, 0.66);
  for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
    if (!inR(i, j)) continue;
    pc.set(x + i, y + j, ramp[clampI(2.4 + ((-i - j) * 0.8) / Math.max(1, rad), 1, n - 1)]);
  }
  if (rad >= 2) pc.set(x - 1, y - 1, ramp[n]);
}

function grassTop(pc: PixelCanvas, base: number, dry: number, soil: number, seed: number, bloom: number[]) {
  const r = new Rand(seed), G = R(base, 7, 0.55), D = R(dry, 7, 0.5), S = R(soil, 6, 0.5);
  const dryN = (x: number, y: number) => tileFbm(x, y, TS, TS, 2, 3, seed + 9);
  // under-layer: shadowed turf, sun-cured patches, the odd peek of bare soil between clumps
  pc.each((x, y) => {
    const n = tileFbm(x, y, TS, TS, 4, 3, seed), bare = tileFbm(x, y, TS, TS, 8, 2, seed + 21);
    const k = clampI(1.1 + n * 2.4 + (pc.clusterT(x, y) - 0.5) * 1.0, 1, 3);
    if (bare < 0.34 && hashf(x, y, seed) < 0.55) { pc.set(x, y, S[clampI(1 + n * 2, 1, 2)]); return; }
    pc.set(x, y, dryN(x, y) > 0.6 + (hashf(x, y, seed + 3) - 0.5) * 0.08 ? D[k] : G[k]);
  });
  const blade = (x: number, y: number, len: number, lean: number, ramp: number[]) => {
    pc.shade(x + 1, y + 1, 0.8);
    for (let k = 0; k < len; k++) {
      const t = k / Math.max(1, len - 1);
      const tipDry = k === len - 1 && r.chance(0.28);
      pc.set(x + (t > 0.55 ? lean : 0), y - k, tipDry ? D[5] : ramp[clampI(2 + t * 2.6 + (r.chance(0.18) ? 1 : 0), 1, 6)]);
    }
  };
  // tussocks: blades fanning out of one root
  for (let i = 0; i < 6; i++) {
    const cx = r.int(0, TS - 1), cy = r.int(0, TS - 1), ramp = dryN(cx, cy) > 0.6 ? D : G;
    pc.set(cx, cy + 1, ramp[0]);
    for (let b = 0; b < r.int(5, 8); b++) blade(cx + r.int(-1, 1), cy, r.int(3, 6), r.pick([-2, -1, -1, 0, 1, 1, 2]), ramp);
  }
  // loose blades everywhere
  for (let i = 0; i < 140; i++) {
    const x = r.int(0, TS - 1), y = r.int(0, TS - 1);
    blade(x, y, r.int(2, 5), r.pick([-1, 0, 0, 0, 1]), (dryN(x, y) > 0.6) !== r.chance(0.12) ? D : G);
  }
  // seed heads, a rare small flower, grit
  for (let i = 0; i < 4; i++) { const x = r.int(0, 31), y = r.int(0, 31); pc.set(x, y, D[6]); pc.set(x, y + 1, D[4]); }
  if (r.chance(0.7)) { const x = r.int(0, 31), y = r.int(0, 31), f = mixHex(r.pick(bloom), G[4], 0.3); pc.set(x, y, f); pc.set(x + 1, y + 1, G[1]); }
  for (let i = 0; i < 2; i++) pebble(pc, r.int(0, 31), r.int(0, 31), 0, R(mixHex(soil, 0x9a9488, 0.55), 5, 0.5));
}

function grassSide(pc: PixelCanvas, grass: number, soil: number, seed: number) {
  const r = new Rand(seed), G = R(grass, 7, 0.5), S = R(soil, 6, 0.5);
  soilFill(pc, soil, seed + 1, 5);
  let len = 5;
  for (let x = 0; x < TS; x++) {
    len = Math.max(3, Math.min(9, len + r.int(-2, 2)));
    const l = x === TS - 1 ? 5 : len;
    for (let y = 0; y < l; y++) pc.set(x, y, G[clampI(4.6 - (y / l) * 3 + (hashf(x, y, seed) - 0.5) * 1.6, 1, 6)]);
    pc.set(x, l, S[0]);
    pc.shade(x, l + 1, 0.82);
    // blades hanging over the lip, and roots threading down into the soil
    if (r.chance(0.22)) { const e = r.int(1, 4); for (let k = 0; k < e; k++) pc.set(x, l + k, G[k === 0 ? 2 : 1]); }
    if (r.chance(0.12)) { let rx = x; const n = r.int(3, 8); for (let k = 1; k < n; k++) { pc.blend(rx, l + k, S[4], 0.7); if (r.chance(0.3)) rx += r.pick([-1, 1]); } }
  }
}

function soilFill(pc: PixelCanvas, soil: number, seed: number, stones = 8) {
  const r = new Rand(seed), S = R(soil, 7, 0.55);
  pc.each((x, y) => {
    const n = tileFbm(x, y, TS, TS, 4, 3, seed), hum = tileFbm(x, y, TS, TS, 2, 2, seed + 5);
    pc.set(x, y, S[clampI(1.6 + n * 2.6 + (pc.clusterT(x, y) - 0.5) * 1.1 - (hum > 0.6 ? 0.8 : 0), 1, 5)]);
  });
  grit(pc, r, 90, S[6]);
  for (let i = 0; i < 3; i++) crack(pc, r, r.int(0, 31), r.int(0, 31), r.int(4, 9), S[0], S[5]);
  // pale root fibres
  for (let i = 0; i < 2; i++) {
    let x = r.int(0, 31), y = r.int(0, 31);
    const dx = r.pick([-1, 1]);
    for (let k = 0; k < r.int(3, 6); k++) { pc.blend(x, y, S[6], 0.55); x += dx; if (r.chance(0.4)) y += r.pick([-1, 1]); }
  }
  for (let i = 0; i < stones; i++) {
    const tone = r.pick([0x9a9488, 0xa08a70, 0x7a7a7e, 0x8a7a68]);
    pebble(pc, r.int(0, 31), r.int(0, 31), r.chance(0.7) ? 0 : 1, R(mixHex(soil, tone, r.range(0.4, 0.65)), 5, 0.5));
  }
}

function rockTop(pc: PixelCanvas, rock: number, seed: number, sx = 1, sy = 1, n = 9, lichen = true) {
  const r = new Rand(seed), K = R(rock, 7, 0.55);
  const pts = Array.from({ length: n }, () => [r.range(0, TS), r.range(0, TS), r.range(2.4, 4)]);
  const cell = (x: number, y: number) => voronoi(pts, ((x % TS) + TS) % TS, ((y % TS) + TS) % TS, TS, TS, sx, sy);
  pc.each((x, y) => {
    const [d1, d2, i] = cell(x, y);
    if (d2 - d1 < 0.9) { pc.set(x, y, K[0]); return; }
    let k = pts[i][2] + (tileFbm(x, y, TS, TS, 4, 3, seed + 3) - 0.5) * 1.8 + (pc.clusterT(x, y) - 0.5) * 0.5;
    if (cell(x - 1, y - 1)[2] !== i) k += 1.2; else if (cell(x + 1, y + 1)[2] !== i) k -= 1.1;
    pc.set(x, y, K[clampI(k, 1, 6)]);
  });
  // mineral flecks and hairline fractures
  grit(pc, r, 80, K[6], 0.55, 0.5);
  for (let i = 0; i < 3; i++) crack(pc, r, r.int(0, 31), r.int(0, 31), r.int(3, 6), K[1], K[5]);
  // crusts of lichen: dull sage and mustard, dithered at the edges
  if (lichen) for (let i = 0; i < r.int(2, 4); i++) {
    const c = mixHex(rock, r.pick([0x8c9a6a, 0xb0a064, 0xa0a8a0]), r.range(0.35, 0.5));
    const x = r.int(0, 31), y = r.int(0, 31), rx = r.range(1.5, 3.2), ry = r.range(1.2, 2.6);
    pc.ditherBlob(x, y, rx, ry, c, 1.4);
    pc.set(x - 1, y - 1, mixHex(c, 0xffffff, 0.15));
  }
}

/** sedimentary cliff: wavy beds of varied thickness and tone, hard beds jut out (lit lip, shadowed underside) */
function rockSide(pc: PixelCanvas, rock: number, seed: number) {
  const r = new Rand(seed), K = R(rock, 7, 0.55);
  const bands: { y0: number; t: number; tone: number; hard: boolean }[] = [];
  for (let y = 0; y < TS;) {
    let t = r.int(2, 7);
    if (TS - (y + t) < 2) t = TS - y;
    bands.push({ y0: y, t, tone: r.range(-0.9, 0.9), hard: r.chance(0.45) });
    y += t;
  }
  const warpAt = (x: number) => (tileFbm(x, 0, TS, TS, 2, 2, seed + 4) - 0.5) * 5;
  const bandAt = (yy: number) => { const w = ((yy % TS) + TS) % TS; for (const b of bands) if (w < b.y0 + b.t) return [b, w - b.y0] as const; return [bands[bands.length - 1], 0] as const; };
  pc.each((x, y) => {
    const [b, local] = bandAt(Math.floor(y + warpAt(x)));
    let k = 3 + b.tone + (tileFbm(x, y, TS, TS, 4, 3, seed) - 0.5) * 1.6 + (pc.clusterT(x, y) - 0.5) * 0.6;
    if (b.hard) { if (local === 0) k += 1.3; else if (local === b.t - 1) k -= 1.5; }
    else if (local === b.t - 1 && hashf(x >> 1, b.y0, seed) < 0.5) k -= 0.9;
    pc.set(x, y, K[clampI(k, 1, 6)]);
  });
  // vertical joints through the hard beds
  for (const b of bands) if (b.hard && b.t >= 3) for (let j = 0; j < r.int(1, 2); j++) {
    const x = r.int(0, 31);
    for (let k = 1; k < b.t - 1; k++) { const y = Math.round(b.y0 + k - warpAt(x)); pc.set(x, y, K[1]); pc.blend(x - 1, y, K[5], 0.35); }
  }
  grit(pc, r, 70, K[6], 0.55, 0.45);
}

function sand(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), S = R(c, 7, 0.4);
  pc.each((x, y) => {
    const n = tileFbm(x, y, TS, TS, 4, 3, seed);
    const w = Math.sin((2 * Math.PI * (x + y * 2) * 2) / TS + n * 5);
    let k = 3 + (n - 0.5) * 1.8 + (pc.clusterT(x, y) - 0.5) * 0.7;
    if (w > 0.8) k += 1; else if (w < -0.86) k -= 1;
    pc.set(x, y, S[clampI(k, 1, 6)]);
  });
  // grains: dark minerals, pale quartz, the odd rusty one
  for (let i = 0; i < 120; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), q = r.next();
    if (q < 0.45) pc.shade(x, y, r.range(0.78, 0.88)); else if (q < 0.92) pc.blend(x, y, S[6], 0.5); else pc.set(x, y, mixHex(S[2], 0x7a5a48, 0.4));
  }
  for (let i = 0; i < 2; i++) pebble(pc, r.int(0, 31), r.int(0, 31), 0, R(mixHex(c, 0x8a8478, 0.5), 5, 0.5));
}

function mud(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), M = R(c, 7, 0.5);
  pc.each((x, y) => { const n = tileFbm(x, y, TS, TS, 3, 3, seed); pc.set(x, y, M[clampI(1.6 + n * 2.6 + (pc.clusterT(x, y) - 0.5) * 0.8, 1, 4)]); });
  // standing water in the hollows: dark, with a dull sky glint along the far rim
  for (let i = 0; i < 4; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), rx = r.int(2, 5), ry = r.int(1, 2);
    pc.ellipse(x, y, rx, ry + 0.5, M[1]);
    pc.ellipse(x + 0.5, y + 0.5, Math.max(1, rx - 1), Math.max(1, ry - 0.5), M[0]);
    for (let k = -rx + 2; k < rx - 1; k++) if (hashf(k, i, seed) < 0.6) pc.set(x + k, y - ry + 1, mixHex(M[4], 0x9aa4a8, 0.3));
  }
  // pits with a lit lower lip, organic flecks, a few twigs
  for (let i = 0; i < 24; i++) { const x = r.int(0, 31), y = r.int(0, 31); if (r.chance(0.5)) { pc.set(x, y, M[0]); pc.set(x, y + 1, M[4]); } else pc.blend(x, y, M[6], 0.35); }
  for (let i = 0; i < 2; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), l = r.int(3, 6), dy = r.pick([-1, 0, 1]);
    for (let k = 0; k < l; k++) { pc.set(x + k, y + Math.round(k * dy * 0.4), mixHex(M[3], 0x6a5038, 0.5)); pc.shade(x + k, y + Math.round(k * dy * 0.4) + 1, 0.75); }
  }
}

function clay(pc: PixelCanvas, c: number, seed: number) {
  // sun-baked crazing: polygon plates whose rims curl up (lit on the upper left, shadowed lower right)
  const r = new Rand(seed), C = R(c, 7, 0.45);
  const pts = Array.from({ length: 9 }, () => [r.range(0, TS), r.range(0, TS), r.range(-0.6, 0.6)]);
  pc.each((x, y) => {
    const [d1, d2, i] = voronoi(pts, x, y, TS, TS);
    const e = d2 - d1;
    let k: number;
    if (e < 1.1) k = 0;
    else if (e < 2.2) k = voronoi(pts, x - 1, y - 1, TS, TS)[2] !== i ? 4.6 : 2;
    else k = 3.2 + pts[i][2] + (tileFbm(x, y, TS, TS, 3, 2, seed) - 0.5) * 1.4 + (pc.clusterT(x, y) - 0.5) * 0.6;
    pc.set(x, y, C[clampI(k, 0, 6)]);
  });
  grit(pc, r, 50, C[6], 0.5, 0.35);
}

function snow(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), S = R(c, 6, 0.2, 0.06);
  pc.each((x, y) => {
    const n = tileFbm(x, y, TS, TS, 3, 3, seed);
    const w = Math.sin((2 * Math.PI * (x * 2 + y)) / TS + n * 6);
    const k = 2.4 + (n - 0.5) * 2 + (pc.clusterT(x, y) - 0.5) * 0.6 + (w > 0.75 ? 0.9 : w < -0.8 ? -0.9 : 0);
    pc.set(x, y, S[clampI(k, 1, 5)]);
  });
  for (let i = 0; i < 8; i++) pc.set(r.int(0, 31), r.int(0, 31), mixHex(S[5], 0xffffff, 0.6));
  for (let i = 0; i < 16; i++) pc.shade(r.int(0, 31), r.int(0, 31), 0.94);
}

function basalt(pc: PixelCanvas, c: number, seed: number, side: boolean) {
  const r = new Rand(seed), K = R(c, 7, 0.55);
  pc.each((x, y) => {
    if (side) {
      const col = Math.floor(x / 8), gap = x % 8 === 0;
      const k = 2.4 + (hashf(col, 0, seed) - 0.5) * 2 + (x % 8 === 1 ? 1 : x % 8 === 7 ? -0.8 : 0);
      pc.set(x, y, gap ? K[0] : K[clampI(k + (tileFbm(x, y, TS, TS, 2, 2, seed) - 0.5), 1, 5)]);
      if (!gap && (y + col * 5) % 13 === 0) { pc.set(x, y, K[1]); pc.blend(x, y + 1, K[4], 0.4); }
    } else {
      // hex columns seen end-on
      const hy = y / 6.928, row = Math.floor(hy), hx = x / 8 - (row % 2) * 0.5;
      const fx = hx - Math.floor(hx), fy = hy - row;
      const edge = fx < 0.12 || fx > 0.88 || fy < 0.1;
      pc.set(x, y, edge ? K[0] : K[clampI(2.6 + (hashf(Math.floor(hx), row, seed) - 0.5) * 2 + (fy < 0.3 ? 1 : 0) + (tileFbm(x, y, TS, TS, 4, 2, seed) - 0.5), 1, 5)]);
    }
  });
  // vesicles: gas pits with a lit lower rim
  for (let i = 0; i < 10; i++) { const x = r.int(0, 31), y = r.int(0, 31); pc.set(x, y, K[0]); pc.blend(x, y + 1, K[4], 0.5); }
  grit(pc, r, 40, K[5], 0.5, 0.35);
}

function ore(pc: PixelCanvas, rock: number, ore: number, seed: number, side: boolean) {
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed, 1, 1, 9, false);
  const r = new Rand(seed + 7), O = R(ore, 7, 0.55, 0.05), rust = mixHex(rock, 0x8a5a3a, 0.45);
  for (let i = 0; i < 7; i++) {
    const x = r.int(2, 29), y = r.int(2, 29), rad = r.int(1, 3);
    pc.ditherBlob(x + 0.5, y + 1, rad + 1.8, rad + 1.6, rust, 0.9); // weathering stain
    for (let j = -rad; j <= rad; j++) for (let k = -rad; k <= rad; k++) {
      if (k * k + j * j > rad * rad + 0.5) continue;
      pc.set(x + k, y + j, O[clampI(3 - (k + j) * 0.7, 1, 5)]);
    }
    pc.set(x - rad + 1, y - rad + 1, mixHex(O[6], 0xffffff, 0.3)); pc.set(x + rad, y + rad, O[0]);
  }
}

function crystal(pc: PixelCanvas, rock: number, cry: number, seed: number, side: boolean) {
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed, 1, 1, 9, false);
  const r = new Rand(seed + 3), C = R(cry, 6, 0.55, 0.05);
  for (let i = 0; i < 5; i++) {
    const x = r.int(3, 28), y = r.int(6, 30), h = r.int(4, 8), w = r.int(1, 2);
    for (let k = 0; k < h; k++) for (let j = -w; j <= w; j++) {
      const t = k / h, edge = Math.abs(j) === w;
      if (k > h - 2 && Math.abs(j) > 0) continue;
      pc.set(x + j, y - k, C[clampI(edge ? (j < 0 ? 4 : 1) : 2.5 + t * 2, 1, 5)], edge ? 255 : 170);
    }
    pc.set(x, y - h + 1, mixHex(C[5], 0xffffff, 0.5), 90);
  }
}

function litter(pc: PixelCanvas, soil: number, foliage: number[], seed: number) {
  soilFill(pc, mixHex(soil, 0x3a2e24, 0.25), seed, 3);
  const r = new Rand(seed + 5);
  // twigs
  for (let i = 0; i < 3; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), l = r.int(4, 8), a = r.range(0, Math.PI), tw = mixHex(soil, 0x8a6a48, 0.5);
    for (let k = 0; k < l; k++) { const X = x + Math.cos(a) * k, Y = y + Math.sin(a) * k; pc.set(X, Y, tw); pc.shade(X + 1, Y + 1, 0.72); }
  }
  // fallen leaves: mostly browned, a few still green, each with a blade, a midrib and a contact shadow
  for (let i = 0; i < 30; i++) {
    const fresh = r.chance(0.22);
    const F = R(mixHex(r.pick(foliage), r.pick([0x7a5a34, 0x8a6a3a, 0x5a4430]), fresh ? 0.2 : r.range(0.5, 0.75)), 6, 0.45);
    const x = r.range(0, TS), y = r.range(0, TS), a = r.range(0, Math.PI), len = r.int(2, 3), wid = r.chance(0.5) ? 1 : 1.5;
    const dx = Math.cos(a), dy = Math.sin(a);
    pc.shade(x + dx * len + 1, y + dy * len + 1, 0.7);
    for (let k = -len; k <= len; k++) {
      const w = wid * (1 - Math.abs(k) / (len + 1)) + 0.5;
      for (let s = -w; s <= w; s += 0.5) pc.set(x + dx * k - dy * s, y + dy * k + dx * s, F[clampI(3 + (s < 0 ? 1 : -0.6), 1, 5)]);
    }
    for (let k = -len + 1; k < len; k++) pc.set(x + dx * k, y + dy * k, F[2]);
  }
}

function gravel(pc: PixelCanvas, rock: number, seed: number) {
  const r = new Rand(seed), K = R(rock, 7, 0.55);
  pc.each((x, y) => pc.set(x, y, K[clampI(0.6 + tileFbm(x, y, TS, TS, 6, 2, seed) * 1.8, 0, 2)]));
  for (let i = 0; i < 80; i++) {
    const tone = r.pick([0xb0a090, 0x707888, 0x9a8a7a, 0x8a8a8a, 0x6a6058]);
    pebble(pc, r.int(0, 31), r.int(0, 31), r.chance(0.55) ? 1 : r.chance(0.6) ? 0 : 2, R(mixHex(rock, tone, r.range(0.25, 0.5)), 6, 0.55));
  }
}

function moss(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), M = R(VEYR.moss, 7, 0.62, 0.07);
  pc.each((x, y) => { const n = tileFbm(x, y, TS, TS, 4, 3, seed); pc.set(x, y, M[clampI(1.2 + n * 2.2, 1, 3)]); });
  for (let i = 0; i < 70; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), rad = r.range(0.8, 2.6);
    for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) {
      const d = Math.hypot(k, j); if (d > rad) continue;
      pc.set(x + k, y + j, M[clampI(3 + (-(k + j) / Math.max(1, rad)) * 1.4 + (d > rad - 0.8 && k + j > 0 ? -1.5 : 0), 1, 6)]);
    }
  }
  for (let i = 0; i < 4; i++) {
    const x = r.int(0, 31), y = r.int(3, 31), h = r.int(2, 3);
    for (let k = 0; k < h; k++) pc.set(x, y - k, M[2]);
    pc.set(x, y - h, VEYR.spore, 200); pc.set(x + 1, y - h + 1, M[1]);
  }
  for (let i = 0; i < 2; i++) pc.set(r.int(0, 31), r.int(0, 31), VEYR.vein, 150);
}

function mossSide(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), M = R(VEYR.moss, 7, 0.62, 0.07);
  pc.each((x, y) => pc.set(x, y, M[clampI(1 + tileFbm(x, y, TS, TS, 4, 2, seed) * 2.5 + (hashf(x, 0, seed) - 0.5) * 1.5, 1, 4)]));
  for (let x = 0; x < TS; x++) if (hashf(x, 1, seed) < 0.15) { const y = r.int(4, 30); pc.set(x, y, VEYR.spore, 200); pc.set(x, y - 1, M[5]); }
}

function creep(pc: PixelCanvas, k: number, seed: number) {
  const rv = RIVALS[k], C = R(rv.creep, 7, 0.62, 0.06), r = new Rand(seed);
  if (k === 0) { // crystalline shards
    pc.each((x, y) => pc.set(x, y, C[clampI(1 + tileFbm(x, y, TS, TS, 4, 2, seed) * 2, 1, 3)]));
    for (let i = 0; i < 14; i++) {
      const x = r.int(0, 31), y = r.int(0, 31), h = r.int(3, 7), a = r.range(-0.6, 0.6);
      for (let t = 0; t < h; t++) for (let w = -1; w <= 1; w++) pc.set(x + Math.round(a * t) + w, y - t, C[clampI(w < 0 ? 5 : w > 0 ? 2 : 4 - t / h, 1, 6)], t === h - 1 ? 140 : 255);
    }
  } else if (k === 1) { // fungal mat with gills
    pc.each((x, y) => { const n = tileFbm(x, y, TS, TS, 6, 3, seed); pc.set(x, y, C[clampI(1 + n * 3 + Math.sin((x + y * 0.3) * 1.2) * 0.6, 1, 4)]); });
    for (let i = 0; i < 9; i++) { const x = r.int(0, 31), y = r.int(0, 31); pc.ellipse(x, y, 2, 1, C[5]); pc.set(x - 1, y - 1, C[6]); pc.set(x, y + 1, C[1]); pc.set(x, y, rv.vein, 120); }
  } else { // pale filaments
    pc.each((x, y) => pc.set(x, y, C[clampI(1.5 + tileFbm(x, y, TS, TS, 3, 3, seed) * 1.5, 1, 3)]));
    for (let i = 0; i < 22; i++) { let x = r.int(0, 31), y = r.int(0, 31); for (let t = 0; t < 8; t++) { pc.set(x, y, C[4 + (t % 3 === 0 ? 1 : 0)]); x += r.pick([-1, 0, 1]); y += r.pick([-1, 0, 1]); } }
  }
}

function crater(pc: PixelCanvas, seed: number) {
  const r = new Rand(seed), K = R(0x3a3038, 6, 0.6);
  pc.each((x, y) => {
    const n = tileFbm(x, y, TS, TS, 4, 3, seed);
    pc.set(x, y, K[clampI(1 + n * 2.6 + (pc.clusterT(x, y) - 0.5), 1, 4)]);
  });
  grit(pc, r, 50, K[5], 0.5, 0.4);
  for (let i = 0; i < 6; i++) { // glassy impact beads
    const x = r.int(0, 31), y = r.int(0, 31);
    pc.set(x, y, 0x5e5866); pc.set(x - 1, y - 1, 0xa8a2b4); pc.set(x + 1, y + 1, K[0]);
  }
  if (r.chance(0.5)) pc.set(r.int(0, 31), r.int(0, 31), 0xff9a4a, 210);
}

/** paint every layer for this palette into a mipmapped array texture */
export function buildBlockTexture(pal: Palette, seed: number): { tex: THREE.DataArrayTexture; avg: number[] } {
  const data = new Uint8Array(TS * TS * 4 * LAYERS);
  const avg: number[] = [];
  const paint = (layer: number, fn: (pc: PixelCanvas) => void) => {
    const pc = new PixelCanvas(TS, TS);
    pc.fill(0x000000);
    fn(pc);
    data.set(pc.data, layer * TS * TS * 4);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < TS * TS; i++) { r += pc.data[i * 4]; g += pc.data[i * 4 + 1]; b += pc.data[i * 4 + 2]; }
    avg[layer] = ((r / TS / TS) << 16) | ((g / TS / TS) << 8) | (b / TS / TS);
  };
  const s = seed * 131;
  paint(L.grassA, (p) => grassTop(p, pal.grass, pal.grassDry, pal.soil, s + 1, pal.bloom));
  paint(L.grassB, (p) => grassTop(p, mixHex(pal.grass, pal.grassDry, 0.18), pal.grassDry, pal.soil, s + 2, pal.bloom));
  paint(L.grassSide, (p) => grassSide(p, pal.grass, pal.soil, s + 3));
  paint(L.soil, (p) => soilFill(p, mixHex(pal.soil, pal.sand, 0.55), s + 4));
  paint(L.rockA, (p) => rockTop(p, pal.rock, s + 5));
  paint(L.rockB, (p) => rockTop(p, scaleHex(pal.rock, 0.94), s + 6));
  paint(L.rockSide, (p) => rockSide(p, pal.rock, s + 7));
  paint(L.sandA, (p) => sand(p, pal.sand, s + 8));
  paint(L.sandB, (p) => sand(p, scaleHex(pal.sand, 0.95), s + 9));
  paint(L.mud, (p) => mud(p, pal.mud, s + 10));
  paint(L.clay, (p) => clay(p, pal.clay, s + 11));
  paint(L.snow, (p) => snow(p, pal.snow, s + 12));
  paint(L.snowSide, (p) => { rockSide(p, pal.rock, s + 13); const S = R(pal.snow, 5, 0.2); for (let x = 0; x < TS; x++) { const l = 4 + Math.floor(hashf(x >> 1, 0, s) * 6); for (let y = 0; y < l; y++) p.set(x, y, S[y === l - 1 ? 1 : 3]); } });
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
  paint(L.dryA, (p) => grassTop(p, pal.grassDry, mixHex(pal.grassDry, pal.sand, 0.3), pal.soil, s + 22, pal.bloom));
  paint(L.drySide, (p) => grassSide(p, pal.grassDry, pal.soil, s + 23));
  paint(L.mudSide, (p) => { soilFill(p, scaleHex(pal.mud, 1.15), s + 24); });
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
