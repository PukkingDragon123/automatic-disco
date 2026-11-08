// Level 0 — "The Lobby": mono-yellow wallpaper, damp mustard carpet, the hum.
import { atlas } from '../atlas';
import { PixelCanvas, makeRamp, ph, mixHex } from '../pixel';
import { Rng, tileFbm } from '../../core/rng';

export const WALL_PX = 86; // 2.7m at 32px/m

/**
 * The iconic wallpaper, aged: 0.5 m paper strips with lapped seams, faint pinstripes and a printed
 * chevron motif, a stepped shadow under the ceiling and a grimy band below it, chair-height scuffs,
 * damp wicking up from the carpet with a salt tide line, and a chipped skirting board with a black
 * edge line top and bottom. Everything is drawn in clusters and lines, never per-pixel static.
 */
function wallpaperYellow(pc: PixelCanvas, rng: Rng, variant: number) {
  const R = makeRamp(0xcbb662, 8, { hueShift: 0.03, spread: 0.55 });
  // R[0]=darkest .. R[7]=lightest ; base sits around R[4]
  const W = pc.w, H = pc.h;
  const FLOOR = H - 5;      // first skirting row
  pc.fillRamp(R, (x, y) => 0.565 + (tileFbm(x, y, W, H, 3, 3, 11 + variant) - 0.5) * 0.13 + (tileFbm(x, y, W, H, 8, 2, 41 + variant) - 0.5) * 0.04, 0.55);
  // faint pinstripes midway between the motif columns
  for (const sx of [4, 12, 20, 28]) for (let y = 0; y < FLOOR; y++) pc.blend(sx, y, R[3], 0.32);
  // printed chevrons ("^") in two staggered columns, with a 1px printed highlight
  for (const [cx, off] of [[8, 0], [24, 5]] as [number, number][]) {
    for (let y = 4 + off; y < FLOOR - 24; y += 10) {
      pc.blend(cx, y, R[2], 0.6);
      pc.blend(cx - 1, y + 1, R[2], 0.55); pc.blend(cx + 1, y + 1, R[2], 0.55);
      pc.blend(cx - 2, y + 2, R[3], 0.5); pc.blend(cx + 2, y + 2, R[3], 0.5);
      pc.blend(cx, y + 1, R[6], 0.3);
    }
  }
  // lapped paper seams every half metre: a dark shadow line and the lifted edge catching light
  for (const sx of [0, 16]) for (let y = 0; y < FLOOR; y++) {
    pc.blend(sx, y, R[1], 0.5);
    pc.blend(sx + 1, y, R[6], 0.32);
  }
  // under the ceiling: a stepped junction shadow, then a band of grime and smoke yellowing
  const ceil = [0.72, 0.5, 0.32, 0.18];
  for (let y = 0; y < ceil.length; y++) for (let x = 0; x < W; x++) pc.blend(x, y, R[0], ceil[y]);
  for (let y = 4; y < 16; y++) for (let x = 0; x < W; x++) {
    const t = (16 - y) / 12;
    if (tileFbm(x, y, W, H, 4, 2, 70 + variant) * t > pc.clusterT(x, y) * 0.55) pc.blend(x, y, mixHex(R[2], 0x6d5a24, 0.4), 0.22 + 0.18 * t);
  }
  // chair-height scuffs (about a metre up): short horizontal strokes, a few per strip
  const scuffY = FLOOR - 32;
  for (let k = 0; k < 5 + variant; k++) {
    const sx = Math.floor(ph(k, variant, 81) * W), sy = scuffY + Math.floor(ph(k, variant, 82) * 9) - 4, len = 2 + Math.floor(ph(k, variant, 83) * 5);
    for (let i = 0; i < len; i++) pc.blend(sx + i, sy, R[2], 0.42 - i * 0.04);
    if (ph(k, variant, 84) < 0.5) pc.blend(sx + 1, sy + 1, R[3], 0.3);
  }
  // damp wicking up from the carpet: two stepped bands under a wavy tide line, a pale salt rim above it
  const damp = mixHex(R[1], 0x6b6a3a, 0.4);
  for (let x = 0; x < W; x++) {
    const tide = FLOOR - 7 - Math.floor(tileFbm(x, 0, W, H, 4, 2, 5 + variant) * 12 + (variant === 2 ? 5 : 0));
    pc.blend(x, tide - 1, R[6], 0.28);
    pc.blend(x, tide, R[1], 0.5);
    for (let y = tide + 1; y < FLOOR; y++) {
      const deep = y > tide + 2 + Math.floor(ph(x >> 1, 3, 19 + variant) * 3);
      pc.blend(x, y, damp, deep ? 0.42 : 0.26);
    }
  }
  // skirting board: black edge line, a lit lip, two body rows with grain, a black foot line
  const bb = makeRamp(0x7a6834, 5);
  for (let x = 0; x < W; x++) {
    pc.set(x, FLOOR, 0x1c160a);
    pc.set(x, FLOOR + 1, ph(x >> 1, 1, 9) < 0.15 ? bb[2] : bb[4]);
    pc.set(x, FLOOR + 2, bb[2]); pc.set(x, FLOOR + 3, bb[2]);
    if (ph(x, 2, 11) < 0.3) pc.set(x, FLOOR + 2 + (x & 1), bb[1]);
    pc.set(x, H - 1, 0x1c160a);
  }
  // a dent knocked into the skirting
  { const dx = Math.floor(ph(variant, 1, 13) * (W - 4)); pc.set(dx, FLOOR + 1, bb[1]); pc.set(dx + 1, FLOOR + 1, bb[0]); pc.set(dx + 1, FLOOR + 2, bb[1]); }
  // variant ageing
  if (variant === 1) {
    pc.stain(rng.int(6, 26), rng.int(18, 50), rng.int(5, 8), mixHex(R[2], 0x7d6a2a, 0.5), R[1], variant);
    pc.drips(rng, R[2], 3, 4, 30, 0.25);
  } else if (variant === 2) {
    pc.drips(rng, mixHex(R[1], 0x55502a, 0.5), 5, 4, 45, 0.3);
    pc.stain(rng.int(8, 24), rng.int(52, 64), rng.int(4, 7), R[3], R[1], variant + 3);
    // black mould freckles low on the wall, in clumps
    for (let k = 0; k < 14; k++) {
      const mx = rng.int(0, W - 1), my = FLOOR - rng.int(4, 16);
      pc.blend(mx, my, 0x2a2a16, 0.6); if (rng.chance(0.6)) pc.blend(mx + 1, my, 0x3a3a20, 0.45); if (rng.chance(0.4)) pc.blend(mx, my - 1, 0x3a3a20, 0.4);
    }
  } else if (variant === 3) {
    // peeling seam: a curled strip of paper with grey drywall showing beneath
    const sx = 16;
    const y0 = rng.int(8, 20), y1 = rng.int(40, 62);
    for (let y = y0; y < y1; y++) {
      const wdt = 1 + Math.floor(ph(1, y >> 2, 4) * 2.5);
      for (let i = 0; i < wdt; i++) pc.set(sx + i, y, i === 0 ? 0x8f8a78 : 0xa8a28c);
      pc.set(sx + wdt, y, R[6]);
      pc.blend(sx + wdt + 1, y, R[1], 0.45);
    }
  }
}

/**
 * Level 0 carpet: light tan loop pile (~#a8956e), deliberately low contrast.
 * Soft damp mottling at mid frequency (so 1 m repeats don't read as a grid),
 * sparse 2px tufts instead of per-pixel static. The floor is laid with random
 * 90° turns, so one-off marks stay away from the tile edges.
 */
function carpetYellow(pc: PixelCanvas, rng: Rng, variant: number) {
  const R = makeRamp(0xa8956e, 6, { hueShift: 0.03, spread: 0.3 });
  const W = pc.w, H = pc.h;
  const lo = mixHex(R[2], R[3], 0.3), mid = mixHex(R[2], R[3], 0.65), hi = mixHex(R[3], R[4], 0.25);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = tileFbm(x, y, W, H, 5, 2, 21 + variant) * 0.7 + tileFbm(x, y, W, H, 8, 1, 31 + variant) * 0.3;
    let c = m < 0.41 ? lo : m < 0.5 ? mid : m < 0.61 ? R[3] : hi;
    // loop-pile tufts: tiny 2px clusters, sparse
    const t = ph((x + (y & 1)) >> 1, y >> 1, 17 + variant);
    if (t < 0.05) c = mixHex(R[2], lo, 0.3);
    else if (t > 0.985) c = mixHex(R[3], R[4], 0.5);
    pc.set(x, y, c);
  }
  if (variant === 1) {
    // an old coffee-coloured stain with a darker tide line
    const cx = rng.int(12, 20), cy = rng.int(12, 20), r = rng.int(4, 6);
    pc.stain(cx, cy, r, 0x7a6438, 0x5e4a26, 7);
  } else if (variant === 2) {
    // a damp patch: darker, faintly green-brown, with a few wet glints
    for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
      const dx = (x - 15.5) / 10, dy = (y - 16.5) / 8;
      const d = dx * dx + dy * dy + (tileFbm(x, y, W, H, 4, 2, 55) - 0.5) * 0.9;
      if (d < 1) {
        pc.blend(x, y, 0x6c6240, d < 0.55 ? 0.42 : 0.26);
        if (d < 0.5 && ph(x, y, 6) < 0.04) pc.set(x, y, 0xd2c99e);
      }
    }
  }
}

/** Soaked carpet: darker, matted pile with standing water sheen (no static). */
function carpetWet(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x7e6d4a, 6, { hueShift: 0.04, spread: 0.34 });
  const W = pc.w, H = pc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = tileFbm(x, y, W, H, 5, 2, 8);
    let c = m < 0.42 ? R[1] : m < 0.56 ? mixHex(R[1], R[2], 0.6) : R[2];
    if (ph((x + (y & 1)) >> 1, y, 31) < 0.07) c = R[1];
    pc.set(x, y, c);
  }
  // standing water: slightly green-grey sheen pooling in the low spots, sparse glints
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = tileFbm(x, y, W, H, 4, 2, 91);
    if (n > 0.55) {
      pc.blend(x, y, 0x48503e, n > 0.6 ? 0.45 : 0.28);
      if (n > 0.6 && ph(x, y, 2) < 0.05) pc.set(x, y, 0xcfcaa6);
    }
  }
  void rng;
}

/**
 * Wall tops seen from above: the sawn edge of plaster over studs, dusty and lighter than the
 * shadows around it so the maze reads as clean lines in the dark. Clustered mottling, a few
 * flecks of debris, a darker mid seam where the two boards meet.
 */
function wallTop(pc: PixelCanvas, rng: Rng, base: number) {
  const R = makeRamp(base, 5, { spread: 0.45 });
  const W = pc.w, H = pc.h;
  pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, W, H, 3, 2, 9) - 0.5) * 0.35, 1);
  for (let x = 0; x < W; x++) if (ph(x >> 1, 0, 3) < 0.7) pc.blend(x, H >> 1, R[0], 0.35);
  for (let k = 0; k < 6; k++) { const fx = rng.int(0, W - 1), fy = rng.int(0, H - 1); pc.set(fx, fy, R[4]); pc.blend(fx + 1, fy, R[3], 0.6); }
}

/** stepped contact shadow laid on the floor along wall bases (alpha ramp across, wall side at u = 0) */
function aoStrip(pc: PixelCanvas) {
  const A = [0.62, 0.62, 0.46, 0.46, 0.3, 0.18, 0.08, 0.0];
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) pc.set(x, y, 0x080604, Math.round(A[x] * 255));
}

export function registerLobbyTextures() {
  const A = atlas();
  A.add('wall_yellow', 32, WALL_PX, (pc, r) => wallpaperYellow(pc, r, 0), 1, 2.7);
  A.add('wall_yellow_b', 32, WALL_PX, (pc, r) => wallpaperYellow(pc, r, 1), 1, 2.7);
  A.add('wall_yellow_c', 32, WALL_PX, (pc, r) => wallpaperYellow(pc, r, 2), 1, 2.7);
  A.add('wall_yellow_d', 32, WALL_PX, (pc, r) => wallpaperYellow(pc, r, 3), 1, 2.7);
  A.add('carpet_yellow', 32, 32, (pc, r) => carpetYellow(pc, r, 0));
  A.add('carpet_yellow_b', 32, 32, (pc, r) => carpetYellow(pc, r, 1));
  A.add('carpet_yellow_c', 32, 32, (pc, r) => carpetYellow(pc, r, 2));
  A.add('carpet_wet', 32, 32, carpetWet);
  A.add('wall_top', 16, 16, (pc, r) => wallTop(pc, r, 0x6a5e44));
  A.add('wall_top_concrete', 16, 16, (pc, r) => wallTop(pc, r, 0x5e5c56));
  A.add('wall_top_white', 16, 16, (pc, r) => wallTop(pc, r, 0x9da2a4));
  A.add('ao_strip', 8, 4, aoStrip, 0.25, 0.125);
}
