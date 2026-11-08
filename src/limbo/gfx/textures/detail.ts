// Close-up detail maps for the first-person eye. World textures are authored at 32 px per metre,
// which is right for the iso view but turns into big blocks a metre from your face. These two
// tiles (64 x 64 px covering half a metre: 128 px per metre) hold only light / dark relief around
// mid-grey: plaster pores, hairline cracks, paint chips, water runs (walls and props), grit, scuffs,
// dust clumps and tiny cracks (floors). The world shader multiplies them in, projected in world
// space, and fades them in only when a base texel grows past a couple of screen pixels.
import { atlas } from '../atlas';
import { PixelCanvas, ph } from '../pixel';
import { Rng, tileFbm } from '../../core/rng';

const N = 64;
const g = (v: number) => { const c = Math.max(0, Math.min(255, Math.round(v))); return (c << 16) | (c << 8) | c; };

function walk(pc: PixelCanvas, rng: Rng, len: number, dark: number, light: number, vert: boolean) {
  let x = rng.int(0, N - 1), y = rng.int(0, N - 1);
  for (let i = 0; i < len; i++) {
    pc.set(x, y, g(dark));
    pc.set(x + (vert ? 1 : 0), y + (vert ? 0 : 1), g(light));
    if (vert) { y++; if (rng.chance(0.35)) x += rng.chance(0.5) ? 1 : -1; } else { x++; if (rng.chance(0.35)) y += rng.chance(0.5) ? 1 : -1; }
  }
}

function wallDetail(pc: PixelCanvas, rng: Rng) {
  // soft grime field, quantised into a few steps (no per-pixel static)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = tileFbm(x, y, N, N, 4, 3, 17);
    pc.set(x, y, g(f < 0.4 ? 120 : f > 0.62 ? 134 : 128));
  }
  // water runs: faint vertical streaks, a few px wide
  for (let k = 0; k < 5; k++) {
    const x0 = rng.int(0, N - 1), y0 = rng.int(0, N - 1), len = rng.int(14, 40), w = rng.int(1, 2);
    for (let i = 0; i < len; i++) for (let j = 0; j < w; j++) pc.set(x0 + j, y0 + i, g(116 - (i / len) * -6));
  }
  // pores in clumps
  for (let k = 0; k < 120; k++) {
    const x = rng.int(0, N - 1), y = rng.int(0, N - 1);
    if (ph(x >> 2, y >> 2, 5) < 0.45) continue;
    pc.set(x, y, g(98)); if (rng.chance(0.4)) pc.set(x + 1, y, g(110));
    pc.set(x, y + 1, g(142));
  }
  // hairline cracks with a lit edge
  for (let k = 0; k < 3; k++) walk(pc, rng, rng.int(16, 34), 84, 150, rng.chance(0.6));
  // paint chips: a pale fleck with a dark lip below
  for (let k = 0; k < 9; k++) {
    const x = rng.int(0, N - 3), y = rng.int(0, N - 3), w = rng.int(1, 3);
    for (let i = 0; i < w; i++) { pc.set(x + i, y, g(170)); pc.set(x + i, y + 1, g(92)); }
  }
}

function floorDetail(pc: PixelCanvas, rng: Rng) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = tileFbm(x, y, N, N, 3, 3, 29);
    pc.set(x, y, g(f < 0.38 ? 118 : f > 0.64 ? 136 : 128));
  }
  // grit: dark specks with a lit side, in drifts
  for (let k = 0; k < 160; k++) {
    const x = rng.int(0, N - 1), y = rng.int(0, N - 1);
    if (tileFbm(x, y, N, N, 3, 2, 7) < 0.48) continue;
    pc.set(x, y, g(92)); pc.set(x + 1, y, g(150));
  }
  // scuff arcs from shoes and dragged things
  for (let k = 0; k < 4; k++) {
    const cx = rng.int(0, N - 1), cy = rng.int(0, N - 1), r = rng.int(6, 14), a0 = rng.next() * 6.28, span = 0.6 + rng.next() * 0.8;
    for (let a = a0; a < a0 + span; a += 0.06) pc.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), g(146));
  }
  for (let k = 0; k < 2; k++) walk(pc, rng, rng.int(12, 26), 86, 140, rng.chance(0.5));
  // dust clumps
  for (let k = 0; k < 6; k++) {
    const x = rng.int(0, N - 3), y = rng.int(0, N - 3);
    pc.set(x, y, g(150)); pc.set(x + 1, y, g(144)); pc.set(x, y + 1, g(140));
  }
}

export function registerDetailTextures() {
  const A = atlas();
  A.add('detail_wall', N, N, wallDetail, 0.5, 0.5);
  A.add('detail_floor', N, N, floorDetail, 0.5, 0.5);
}
