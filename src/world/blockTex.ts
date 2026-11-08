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
const R = (c: number, n = 6, spread = 0.55, hue = 0.05) => makeRamp(c, n, { spread, hueShift: hue });

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

function blades(pc: PixelCanvas, r: Rand, ramp: number[], n: number) {
  for (let i = 0; i < n; i++) {
    const x = r.int(0, TS - 1), y = r.int(0, TS - 1), len = r.int(2, 4), lean = r.pick([-1, 0, 0, 1]);
    if (r.chance(0.35)) pc.set(x, y + 1, ramp[2]);
    for (let k = 0; k < len; k++) pc.set(x + (k === len - 1 ? lean : 0), y - k, ramp[Math.min(ramp.length - 1, 3 + (k >= len - 1 ? 1 : 0) + (r.chance(0.2) ? 1 : 0))]);
  }
}

function pebble(pc: PixelCanvas, x: number, y: number, rad: number, ramp: number[]) {
  for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
    if (i * i + j * j > rad * rad + 0.6) continue;
    const s = -i - j;
    pc.set(x + i, y + j, ramp[clampI(2.5 + s * 0.6, 1, ramp.length - 1)]);
  }
  pc.set(x + rad, y + rad + 1, ramp[0]);
  pc.set(x - rad + 1, y - rad + 1, ramp[ramp.length - 1]);
}

function grassTop(pc: PixelCanvas, base: number, dry: number, seed: number, bloom: number[]) {
  const r = new Rand(seed), G = R(base, 6, 0.5), D = R(dry, 6, 0.5);
  pc.each((x, y) => {
    const n = tileFbm(x, y, TS, TS, 4, 3, seed), d = tileFbm(x, y, TS, TS, 2, 2, seed + 9);
    const k = clampI(1.5 + n * 2.6 + (pc.clusterT(x, y) - 0.5) * 1.1, 1, 4);
    pc.set(x, y, d > 0.66 ? D[k] : G[k]);
  });
  blades(pc, r, G, 60);
  for (let i = 0; i < 3; i++) { const x = r.int(0, 31), y = r.int(0, 31); pc.set(x, y, r.pick(bloom)); pc.set(x + 1, y + 1, G[1]); }
}

function grassSide(pc: PixelCanvas, grass: number, soil: number, seed: number) {
  const r = new Rand(seed), G = R(grass, 6, 0.5), S = R(soil, 6, 0.5);
  soilFill(pc, soil, seed + 1);
  let len = 5;
  for (let x = 0; x < TS; x++) {
    len = Math.max(3, Math.min(10, len + r.int(-2, 2)));
    const l = x === TS - 1 ? 5 : len;
    for (let y = 0; y < l; y++) pc.set(x, y, G[y === 0 ? 4 : y < 2 ? 3 : y >= l - 1 ? 1 : 2 + (hashf(x, y, seed) < 0.3 ? 1 : 0)]);
    pc.set(x, l, S[0]);
    if (r.chance(0.18)) { const e = r.int(1, 3); for (let k = 0; k < e; k++) pc.set(x, l + k, G[1 + (k === 0 ? 1 : 0)]); }
  }
}

function soilFill(pc: PixelCanvas, soil: number, seed: number) {
  const r = new Rand(seed), S = R(soil, 6, 0.55);
  pc.each((x, y) => {
    const n = tileFbm(x, y, TS, TS, 4, 3, seed);
    pc.set(x, y, S[clampI(1.6 + n * 2.2 + (pc.clusterT(x, y) - 0.5) * 1.2, 1, 4)]);
  });
  for (let i = 0; i < 7; i++) pebble(pc, r.int(0, 31), r.int(0, 31), r.int(0, 1), R(mixHex(soil, 0x9a9488, 0.5), 5, 0.5));
  for (let i = 0; i < 3; i++) {
    let x = r.int(0, 31), y = r.int(0, 31);
    for (let k = 0; k < r.int(4, 9); k++) { pc.set(x, y, S[0]); x += r.pick([-1, 0, 1]); y += r.pick([0, 1]); }
  }
}

function rockTop(pc: PixelCanvas, rock: number, seed: number, sx = 1, sy = 1, n = 9) {
  const r = new Rand(seed), K = R(rock, 6, 0.6);
  const pts = Array.from({ length: n }, () => [r.range(0, TS), r.range(0, TS), r.int(2, 3)]);
  const cell = (x: number, y: number) => voronoi(pts, ((x % TS) + TS) % TS, ((y % TS) + TS) % TS, TS, TS, sx, sy);
  pc.each((x, y) => {
    const [d1, d2, i] = cell(x, y);
    if (d2 - d1 < 1.1) { pc.set(x, y, K[0]); return; }
    let k = pts[i][2] + (tileFbm(x, y, TS, TS, 4, 2, seed + 3) - 0.5) * 1.6;
    if (cell(x - 1, y - 1)[2] !== i) k += 1.3; else if (cell(x + 1, y + 1)[2] !== i) k -= 1.2;
    pc.set(x, y, K[clampI(k, 1, 5)]);
  });
  for (let i = 0; i < 10; i++) pc.set(r.int(0, 31), r.int(0, 31), K[r.chance(0.5) ? 1 : 4]);
}

function rockSide(pc: PixelCanvas, rock: number, seed: number) {
  rockTop(pc, rock, seed, 0.55, 1.6, 8);
  const K = R(rock, 6, 0.6);
  for (let y = 0; y < TS; y += 8) for (let x = 0; x < TS; x++) if (hashf(x >> 2, y, seed) < 0.55) pc.blend(x, y + 3, K[1], 0.55);
}

function sand(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), S = R(c, 6, 0.42);
  pc.each((x, y) => {
    const n = tileFbm(x, y, TS, TS, 4, 3, seed);
    const w = Math.sin((2 * Math.PI * (x * 1 + y * 2)) / TS + n * 4);
    let k = 2.2 + n * 1.4 + (pc.clusterT(x, y) - 0.5) * 0.8;
    if (w > 0.88) k += 1.2; else if (w < -0.92) k -= 1.1;
    pc.set(x, y, S[clampI(k, 1, 5)]);
  });
  for (let i = 0; i < 18; i++) pc.set(r.int(0, 31), r.int(0, 31), S[r.chance(0.6) ? 1 : 5]);
}

function mud(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), M = R(c, 6, 0.5);
  pc.each((x, y) => { const n = tileFbm(x, y, TS, TS, 3, 3, seed); pc.set(x, y, M[clampI(1.4 + n * 2.4, 1, 3)]); });
  for (let i = 0; i < 4; i++) {
    const x = r.int(0, 31), y = r.int(0, 31), rx = r.int(2, 5), ry = r.int(1, 3);
    pc.ellipse(x, y, rx, ry, M[0]);
    pc.set(x - rx + 1, y - 1, M[4]); pc.set(x - rx + 2, y - 1, M[3]);
  }
  for (let i = 0; i < 9; i++) pc.set(r.int(0, 31), r.int(0, 31), M[5]);
}

function clay(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), C = R(c, 6, 0.45);
  const pts = Array.from({ length: 7 }, () => [r.range(0, TS), r.range(0, TS)]);
  pc.each((x, y) => {
    const [d1, d2] = voronoi(pts, x, y, TS, TS);
    const n = tileFbm(x, y, TS, TS, 3, 2, seed);
    pc.set(x, y, d2 - d1 < 1.3 ? C[0] : d2 - d1 < 2.3 ? C[2] : C[clampI(3 + (n - 0.5) * 1.5, 2, 4)]);
  });
}

function snow(pc: PixelCanvas, c: number, seed: number) {
  const r = new Rand(seed), S = R(c, 5, 0.18, 0.08);
  pc.each((x, y) => { const n = tileFbm(x, y, TS, TS, 3, 3, seed); pc.set(x, y, S[clampI(1.5 + n * 2.5 + (pc.clusterT(x, y) - 0.5) * 0.7, 1, 4)]); });
  for (let i = 0; i < 6; i++) pc.set(r.int(0, 31), r.int(0, 31), 0xffffff);
}

function basalt(pc: PixelCanvas, c: number, seed: number, side: boolean) {
  const K = R(c, 6, 0.6);
  pc.each((x, y) => {
    if (side) {
      const col = Math.floor(x / 8), gap = x % 8 === 0;
      const k = 2 + (hashf(col, 0, seed) - 0.5) * 2 + (x % 8 === 1 ? 1 : x % 8 === 7 ? -0.8 : 0);
      pc.set(x, y, gap ? K[0] : K[clampI(k + (tileFbm(x, y, TS, TS, 2, 2, seed) - 0.5), 1, 4)]);
      if (!gap && (y + col * 5) % 13 === 0) pc.set(x, y, K[1]);
    } else {
      // hex columns seen end-on
      const hy = y / 6.928, row = Math.floor(hy), hx = x / 8 - (row % 2) * 0.5;
      const fx = hx - Math.floor(hx), fy = hy - row;
      const edge = fx < 0.12 || fx > 0.88 || fy < 0.1;
      pc.set(x, y, edge ? K[0] : K[clampI(2.5 + (hashf(Math.floor(hx), row, seed) - 0.5) * 2 + (fy < 0.3 ? 1 : 0), 1, 5)]);
    }
  });
}

function ore(pc: PixelCanvas, rock: number, ore: number, seed: number, side: boolean) {
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed);
  const r = new Rand(seed + 7), O = R(ore, 6, 0.6, 0.08);
  for (let i = 0; i < 7; i++) {
    const x = r.int(2, 29), y = r.int(2, 29), rad = r.int(1, 3);
    for (let j = -rad; j <= rad; j++) for (let k = -rad; k <= rad; k++) {
      if (k * k + j * j > rad * rad + 0.5) continue;
      pc.set(x + k, y + j, O[clampI(2.5 - (k + j) * 0.7, 1, 4)]);
    }
    pc.set(x - rad + 1, y - rad + 1, 0xf4f0ff); pc.set(x + rad, y + rad, O[0]);
  }
}

function crystal(pc: PixelCanvas, rock: number, cry: number, seed: number, side: boolean) {
  if (side) rockSide(pc, rock, seed); else rockTop(pc, rock, seed);
  const r = new Rand(seed + 3), C = R(cry, 6, 0.6, 0.06);
  for (let i = 0; i < 5; i++) {
    const x = r.int(3, 28), y = r.int(6, 30), h = r.int(4, 8), w = r.int(1, 2);
    for (let k = 0; k < h; k++) for (let j = -w; j <= w; j++) {
      const t = k / h, edge = Math.abs(j) === w;
      if (k > h - 2 && Math.abs(j) > 0) continue;
      pc.set(x + j, y - k, C[clampI(edge ? (j < 0 ? 4 : 1) : 2.5 + t * 2, 1, 5)], edge ? 255 : 150);
    }
    pc.set(x, y - h + 1, 0xffffff, 60);
  }
}

function litter(pc: PixelCanvas, soil: number, foliage: number[], seed: number) {
  soilFill(pc, soil, seed);
  const r = new Rand(seed + 5);
  for (let i = 0; i < 26; i++) {
    const F = R(r.pick(foliage), 5, 0.5);
    const x = r.int(0, 31), y = r.int(0, 31), a = r.range(0, Math.PI);
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let k = -2; k <= 2; k++) { pc.set(x + dx * k, y + dy * k, F[2 + (k < 0 ? 1 : 0)]); pc.set(x + dx * k - dy, y + dy * k + dx, F[k === 0 ? 1 : 2]); }
    pc.set(x + dx * 2, y + dy * 2, F[4]);
  }
}

function gravel(pc: PixelCanvas, rock: number, seed: number) {
  const r = new Rand(seed), K = R(rock, 6, 0.6);
  pc.fill(K[1]);
  for (let i = 0; i < 60; i++) pebble(pc, r.int(0, 31), r.int(0, 31), r.int(0, 2), R(mixHex(rock, r.chance(0.5) ? 0xb0a090 : 0x707888, 0.35), 5, 0.6));
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
  for (let i = 0; i < 6; i++) { // glassy impact beads
    const x = r.int(0, 31), y = r.int(0, 31);
    pc.set(x, y, 0x6a5a7a); pc.set(x - 1, y - 1, 0xc8b8e8); pc.set(x + 1, y + 1, K[0]);
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
  paint(L.grassA, (p) => grassTop(p, pal.grass, pal.grassDry, s + 1, pal.bloom));
  paint(L.grassB, (p) => grassTop(p, mixHex(pal.grass, pal.grassDry, 0.18), pal.grassDry, s + 2, pal.bloom));
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
  paint(L.dryA, (p) => grassTop(p, pal.grassDry, pal.grassDry, s + 22, pal.bloom));
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
