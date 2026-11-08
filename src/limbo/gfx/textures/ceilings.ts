// Ceilings, only ever seen from the first-person eye (src/fp/eye.ts): dropped acoustic tiles in a
// T-bar grid (stained, sagging, the odd one missing), cast concrete slabs, cracked house plaster,
// and the fixtures set into them. Pixel art at the world density (32 px per metre), drawn in clusters
// and lines, black lines where pieces meet. Fixture diffusers are painted bright and rendered with a
// negative emissive so they glow with whatever light the grid says they give right now.
import { atlas } from '../atlas';
import { PixelCanvas, makeRamp, mixHex, ph } from '../pixel';
import { Rng, tileFbm } from '../../core/rng';

const TILE = 20; // one acoustic tile = 20 px = 0.625 m; the texture holds 2 x 2 of them

/** off-white fissured acoustic tiles in a T-bar grid; the base is neutral, zones tint it */
function acoustic(pc: PixelCanvas, rng: Rng, kind: 'plain' | 'stain' | 'gap' | 'mould' | 'sag') {
  const R = makeRamp(0xd9d6cc, 6, { spread: 0.42, hueShift: 0.02 });
  const W = pc.w, H = pc.h;
  pc.fillRamp(R, (x, y) => {
    const lx = x % TILE, ly = y % TILE;
    // each tile sags a little toward its middle and darkens toward the grid
    const edge = Math.min(lx, ly, TILE - 1 - lx, TILE - 1 - ly);
    return 0.6 + Math.min(edge, 4) * 0.012 + (tileFbm(x, y, W, H, 4, 2, 31) - 0.5) * 0.12;
  }, 0.7);
  // fissures: short worm marks, a few per tile, in clumps
  for (let k = 0; k < 70; k++) {
    const x = rng.int(0, W - 1), y = rng.int(0, H - 1);
    if (x % TILE === 0 || y % TILE === 0) continue;
    const len = rng.int(1, 3), horiz = rng.chance(0.5);
    for (let i = 0; i < len; i++) pc.blend(horiz ? x + i : x, horiz ? y : y + i, R[1], 0.55);
  }
  // pinholes
  for (let k = 0; k < 40; k++) pc.blend(rng.int(0, W - 1), rng.int(0, H - 1), R[2], 0.5);
  // the T-bar grid: a lit lip, the bar, a black seam
  const bar = makeRamp(0xc8c6be, 4);
  for (let i = 0; i < W; i++) for (const g of [0, TILE]) {
    pc.set(i, g, 0x16140f); pc.set(i, g + 1, bar[3]);
    pc.set(g, i, 0x16140f); pc.set(g + 1, i, bar[2]);
  }
  if (kind === 'stain') {
    // a tea-brown water stain with a darker tide ring (tile 1,0), dripping toward the seam
    const cx = TILE + 10 + rng.int(-2, 2), cy = 9 + rng.int(-2, 2);
    pc.stain(cx, cy, 6, 0xb08c50, 0x6e5426, 3);
    pc.stain(cx + 2, cy + 1, 3, 0x9c7a44, 0x6e5426, 5);
    for (let y = cy + 5; y < TILE - 1; y++) if (ph(cx, y, 2) < 0.7) pc.blend(cx + (y & 1), y, 0x7a5c2c, 0.35);
  } else if (kind === 'gap') {
    // one tile pushed up and gone: the dark plenum, a fibreglass tuft, a pipe crossing it
    for (let y = TILE + 2; y < H; y++) for (let x = 2; x < TILE; x++) {
      const d = Math.min(x - 2, y - TILE - 2, TILE - 1 - x, H - 1 - y);
      pc.set(x, y, d < 1 ? 0x0c0b09 : d < 2 ? 0x15130f : 0x090807);
    }
    for (let x = 2; x < TILE; x++) { pc.set(x, TILE + 9, 0x3a3833); pc.set(x, TILE + 10, 0x26241f); }
    for (let k = 0; k < 9; k++) pc.set(3 + rng.int(0, 5), TILE + 3 + rng.int(0, 4), rng.chance(0.5) ? 0xc8a860 : 0x9a7c3c);
  } else if (kind === 'mould') {
    for (let k = 0; k < 22; k++) {
      const x = rng.int(TILE + 2, W - 3), y = rng.int(TILE + 2, H - 3);
      pc.blend(x, y, 0x30321c, 0.65); if (rng.chance(0.6)) pc.blend(x + 1, y, 0x484a2a, 0.5); if (rng.chance(0.5)) pc.blend(x, y + 1, 0x484a2a, 0.45);
    }
  } else if (kind === 'sag') {
    // a waterlogged tile bowing down: darker belly, a lighter lip where it pulls off the bar
    for (let y = 2; y < TILE; y++) for (let x = TILE + 2; x < W; x++) {
      const dx = (x - TILE - 10) / 9, dy = (y - 10) / 9, d = dx * dx + dy * dy;
      if (d < 1) pc.blend(x, y, 0x8c8064, d < 0.4 ? 0.4 : 0.22);
    }
    for (let x = TILE + 2; x < W; x++) pc.blend(x, 2, 0xf0ece0, 0.5);
  }
}

/** board-formed concrete slab: plank seams every 10 px, tie holes, a damp streak along a seam */
function concrete(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x77756e, 6, { spread: 0.4 });
  const W = pc.w, H = pc.h;
  pc.fillRamp(R, (x, y) => 0.5 + (tileFbm(x, y, W, H, 3, 3, 7) - 0.5) * 0.3 + ((y % 10) === 9 ? -0.12 : 0), 0.8);
  for (let x = 0; x < W; x++) { pc.blend(x, 0, R[0], 0.5); pc.blend(x, 10, R[0], 0.4); pc.blend(x, 20, R[0], 0.45); pc.blend(x, 1, R[4], 0.25); }
  for (const [hx, hy] of [[6, 5], [22, 15], [14, 25]]) { pc.set(hx, hy, 0x1a1916); pc.set(hx + 1, hy, R[1]); pc.set(hx, hy + 1, R[1]); }
  for (let x = 0; x < W; x++) if (ph(x >> 1, 4, 3) < 0.55) { pc.blend(x, 11, 0x3e3c34, 0.4); if (ph(x, 5, 3) < 0.3) pc.blend(x, 12, 0x3e3c34, 0.3); }
  for (let k = 0; k < 14; k++) pc.blend(rng.int(0, W - 1), rng.int(0, H - 1), R[1], 0.5);
}

/** house plaster: flat paint in hard-edged roller patches, hairline cracks, a faint yellowed water mark */
function plaster(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xd2ccbc, 5, { spread: 0.3 });
  const W = pc.w, H = pc.h;
  pc.fillRamp(R, (x, y) => 0.6 + (tileFbm(x, y, W, H, 2, 2, 12) - 0.5) * 0.14, 0.6);
  let x = rng.int(4, 12), y = 0;
  while (y < H) { pc.blend(x, y, R[0], 0.6); y++; if (ph(x, y, 9) < 0.35) x += ph(y, x, 3) < 0.5 ? 1 : -1; }
  pc.stain(rng.int(18, 26), rng.int(8, 22), 5, 0xc8b88a, 0xa8925c, 4);
}

/** a recessed fluorescent troffer: black frame, steel lip, prismatic diffuser with two tube shadows (fit) */
function troffer(pc: PixelCanvas) {
  const W = pc.w, H = pc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = 0xf4f2e8;
    if ((x + y) % 3 === 0) c = 0xe6e2d2;                 // prismatic dimples
    if (x === 4 || x === W - 5) c = 0xfffef6;            // the tubes behind read brighter
    if (x === 5 || x === W - 6) c = 0xfaf8ee;
    pc.set(x, y, c);
  }
  for (let y = 0; y < H; y++) { pc.set(0, y, 0x101010); pc.set(W - 1, y, 0x101010); pc.set(1, y, 0x8c8a84); pc.set(W - 2, y, 0x6a6862); }
  for (let x = 0; x < W; x++) { pc.set(x, 0, 0x101010); pc.set(x, H - 1, 0x101010); pc.set(x, 1, 0x8c8a84); pc.set(x, H - 2, 0x6a6862); }
  // dead flies in the corner of the diffuser
  pc.set(3, H - 4, 0x5a5448); pc.set(4, H - 4, 0x6a6458); pc.set(W - 4, 3, 0x5a5448);
}

/** a caged bulb / sodium housing seen from below (fit) */
function bulbFixture(pc: PixelCanvas) {
  const W = pc.w, H = pc.h, cx = (W - 1) / 2, cy = (H - 1) / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.max(Math.abs(x - cx), Math.abs(y - cy)) + Math.min(Math.abs(x - cx), Math.abs(y - cy)) * 0.45;
    const r = W / 2;
    pc.set(x, y, d > r - 0.5 ? 0x23211d : d > r - 1.5 ? 0x141210 : d > r - 2.5 ? 0x3a3630 : d > r * 0.45 ? 0xf6eedc : 0xfffcf2);
  }
  // the wire cage across the glass
  for (let i = 2; i < W - 2; i += 3) for (let y = 2; y < H - 2; y++) { const c = pc.get(i, y); if (c === 0xf6eedc || c === 0xfffcf2) pc.set(i, y, 0x2a2622); }
}

export function registerCeilingTextures() {
  const A = atlas();
  const M = (TILE * 2) / 32;
  A.add('ceil_tile', TILE * 2, TILE * 2, (pc, r) => acoustic(pc, r, 'plain'), M, M);
  A.add('ceil_tile_stain', TILE * 2, TILE * 2, (pc, r) => acoustic(pc, r, 'stain'), M, M);
  A.add('ceil_tile_gap', TILE * 2, TILE * 2, (pc, r) => acoustic(pc, r, 'gap'), M, M);
  A.add('ceil_tile_mould', TILE * 2, TILE * 2, (pc, r) => acoustic(pc, r, 'mould'), M, M);
  A.add('ceil_tile_sag', TILE * 2, TILE * 2, (pc, r) => acoustic(pc, r, 'sag'), M, M);
  A.add('ceil_concrete', 32, 30, concrete, 1, 30 / 32);
  A.add('ceil_plaster', 32, 32, plaster);
  A.add('ceil_troffer', 14, 30, troffer);
  A.add('ceil_bulb', 9, 9, bulbFixture);
}
