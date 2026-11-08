// Horror wear the chunk mesher scatters over every zone (src/world/chunkMesher.ts): water damage
// running down from the ceiling, mould blooming out of wall corners, rust bleeding from fixings,
// soot plumes, damp floor patches, and (when gore is on) bloody handprints and drag marks.
// Decals: transparent background, alpha in a few hard steps so they stay crisp after the
// renderer's posterise, 32 px per metre like the walls they sit on, dark 1px edges on the paint.
import { atlas } from '../atlas';
import { PixelCanvas, mixHex, ph } from '../pixel';
import { Rng, tileFbm } from '../../core/rng';
import { blob, over } from '../../content/textures/kit';

const BLOOD = [0x240405, 0x3c0708, 0x58090b, 0x7a1214, 0xa83234];

/** a right hand, palm and fingers, 9 x 11 px, pressed at (x0, y0); smear drags it down */
function hand(pc: PixelCanvas, x0: number, y0: number, flip: boolean, a: number, smear: number, seed: number) {
  const H = [
    '.#.#.#...',
    '.#.#.#.#.',
    '.#.#.#.#.',
    '.#######.',
    '########.',
    '#######..',
    '.######..',
    '.#####...',
    '..####...',
    '..###....',
    '...#.....',
  ];
  for (let j = 0; j < H.length; j++) for (let i = 0; i < 9; i++) {
    if (H[j][flip ? 8 - i : i] !== '#') continue;
    if (ph(x0 + i, y0 + j, seed) < 0.12) continue;                    // skin creases leave gaps
    const edge = (H[j - 1]?.[flip ? 8 - i : i] !== '#') || H[j][flip ? 7 - i : i + 1] !== '#';
    over(pc, x0 + i, y0 + j, edge ? BLOOD[1] : ph(i, j, seed + 1) < 0.3 ? BLOOD[3] : BLOOD[2], a);
    // the hand slid: streaks run down from the palm
    if (smear > 0 && j > 4 && ph(i, 0, seed + 2) < 0.6) {
      const len = Math.floor(smear * (0.5 + ph(i, 1, seed + 3)));
      for (let k = 1; k <= len; k++) over(pc, x0 + i, y0 + j + k, k < len * 0.6 ? BLOOD[2] : BLOOD[1], a * (1 - k / (len + 2)));
    }
  }
}

function handprint(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  hand(pc, 3, 2, false, 235, 0, 11);
  for (let k = 0; k < 5; k++) { const y = 13 + k * 2; over(pc, 7 + (k & 1), y, BLOOD[1], 200 - k * 30); }
  void rng;
}

function handSmear(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  hand(pc, 4, 3, false, 235, 10, 21);
  hand(pc, 18, 9, true, 210, 16, 23);
  // drips off the lowest knuckles
  for (let k = 0; k < 4; k++) { const x = rng.int(5, 26), y0 = rng.int(22, 26), len = rng.int(3, 8); for (let j = 0; j < len; j++) over(pc, x, y0 + j, BLOOD[1], 210 - j * 18); }
}

/** something heavy dragged along the floor: two broad smeared bands with gaps, a pool where it lay (fit 32 x 64: 1 x 2 m) */
function dragMarks(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  for (const cx of [10, 21]) {
    for (let y = 2; y < 50; y++) {
      const t = y / 50;                          // 0 far end (faint) .. 1 at the pool
      const sway = Math.round(Math.sin(y * 0.11 + cx) * 1.5);
      const wdt = 3 + Math.floor(t * 3);
      for (let i = 0; i < wdt; i++) {
        const x = cx + sway + i - (wdt >> 1);
        // the smear breaks up where the drag skipped, thicker toward the pool
        if (tileFbm(x, y, 32, 64, 4, 2, 17) < 0.42 - t * 0.25) continue;
        const edge = i === 0 || i === wdt - 1;
        over(pc, x, y, edge ? BLOOD[1] : ph(x, y, 4) < 0.25 ? BLOOD[3] : BLOOD[2], Math.round(90 + t * 140));
      }
    }
  }
  // the pool the body was lying in
  for (let y = 40; y < 64; y++) for (let x = 2; x < 30; x++) {
    const m = blob(x, y, 16, 55, 11, 7, 7, 0.45);
    if (m > 0) over(pc, x, y, m < 0.15 ? BLOOD[0] : m > 0.6 && ph(x, y, 3) < 0.2 ? BLOOD[4] : BLOOD[2], m < 0.15 ? 220 : 240);
  }
  // smudged palm marks beside the bands
  for (let k = 0; k < 3; k++) { const x = rng.int(3, 27), y = rng.int(8, 36); for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (ph(x + i, y + j, 2) < 0.7) over(pc, x + i, y + j, BLOOD[1], 170); }
}

/** water damage pouring from the ceiling joint: tide-lined tongue, drip runs, rust-brown edge (fit 32 x 64) */
function waterRun(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  const body = 0x5e4a26, rim = 0x3e2c12;
  const runs: number[] = [];
  for (let k = 0; k < 5; k++) runs.push(rng.int(5, 27));
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
    // a broad tongue under the ceiling that thins into runs
    const width = 13 * (1 - y / 40) + (tileFbm(x, y, 32, 64, 3, 2, 5) - 0.5) * 8;
    const dx = Math.abs(x - 16);
    let m = width > 0 ? (width - dx) / Math.max(1, width) : -1;
    for (const r of runs) if (Math.abs(x - r) < 1 && y < 30 + (r % 7) * 4) m = Math.max(m, 0.25);
    if (m <= 0) continue;
    over(pc, x, y, m < 0.18 ? rim : body, m < 0.18 ? 170 : 90 + Math.floor((1 - y / 64) * 50));
  }
  // older inner tide line
  for (let x = 6; x < 26; x++) { const y = 8 + Math.floor(tileFbm(x, 0, 32, 64, 4, 1, 9) * 6); over(pc, x, y, rim, 150); }
}

/** mould blooming out of a corner along the skirting: black-green clumps, fuzzy speckled rim (fit 32 x 32) */
function mould(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  const C = [0x0e120a, 0x1c2412, 0x2e3a1c, 0x4a5a2c];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let m = blob(x, y, 9, 28, 12, 14, 3, 0.55);
    m = Math.max(m, blob(x, y, 22, 30, 8, 7, 6, 0.6) * 0.9, blob(x, y, 5, 12, 5, 6, 9, 0.6) * 0.8);
    if (m <= 0) { if (m > -0.08 && ph(x, y, 4) < 0.25) over(pc, x, y, C[2], 160); continue; }
    const f = tileFbm(x, y, 32, 32, 4, 2, 13);
    over(pc, x, y, m > 0.5 ? (f > 0.55 ? C[0] : C[1]) : m > 0.2 ? C[1] : f > 0.5 ? C[2] : C[1], m > 0.2 ? 235 : 200);
    if (m > 0.3 && ph(x, y, 7) < 0.05) over(pc, x, y, C[3], 230);    // spore heads catching the light
  }
  void rng;
}

/** rust bleeding down from a fixing: bolt head, orange-brown streaks (fit 16 x 48) */
function rustBleed(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  const R = [0x3a1a0a, 0x5e2c10, 0x8a4418, 0xb06628];
  for (let k = 0; k < 4; k++) {
    const x = 6 + rng.int(-2, 3), len = rng.int(18, 44);
    for (let y = 4; y < 4 + len; y++) {
      const t = (y - 4) / len;
      over(pc, x, y, t < 0.3 ? R[2] : R[1], 220 - t * 150);
      if (t < 0.5 && ph(x, y, k) < 0.5) over(pc, x + 1, y, R[1], 150 - t * 120);
    }
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) over(pc, 5 + i, 1 + j, i === 0 || j === 0 ? 0x16120e : j === 3 || i === 3 ? R[0] : R[3], 255);
}

/** soot plume climbing a wall from a fire at its foot (fit 32 x 64) */
function sootPlume(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
    const t = 1 - y / 64;                        // 0 at the floor (bottom) .. 1 at the top
    const w = 5 + t * 11 + (tileFbm(x, y, 32, 64, 3, 2, 21) - 0.5) * 10;
    const d = Math.abs(x - 16) / w;
    if (d >= 1) continue;
    const core = d < 0.35 && t < 0.3 + tileFbm(x, y, 32, 64, 4, 2, 23) * 0.25;
    over(pc, x, y, core ? 0x0a0806 : d < 0.75 ? 0x1c1712 : 0x2e2620, core ? 240 : d < 0.75 ? 200 : 130);
  }
  for (let k = 0; k < 10; k++) over(pc, rng.int(8, 24), rng.int(46, 63), 0x050403, 255);
}

/** a damp patch spreading on the floor: darker body, a wet sheen ring, grit at the tide line (fit 32 x 32) */
function dampPatch(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const m = Math.max(blob(x, y, 16, 16, 13, 11, 5, 0.5), blob(x, y, 24, 22, 6, 5, 8, 0.5) * 0.9);
    if (m <= 0) continue;
    if (m < 0.1) over(pc, x, y, 0x1a1610, 150);
    else if (m < 0.18) over(pc, x, y, mixHex(0x8a8a78, 0x1a1610, 0.4), 110);   // the wet sheen catching light
    else over(pc, x, y, 0x14110c, 120);
  }
  for (let k = 0; k < 12; k++) { const x = rng.int(4, 28), y = rng.int(4, 28); if (pc.alpha(x, y) > 0) over(pc, x, y, 0x0c0a07, 190); }
}

export function registerHorrorTextures() {
  const A = atlas();
  A.add('hd_handprint', 12, 24, handprint);
  A.add('hd_hand_smear', 32, 32, handSmear);
  A.add('hd_drag', 32, 64, dragMarks);
  A.add('hd_water_run', 32, 64, waterRun);
  A.add('hd_mould', 32, 32, mould);
  A.add('hd_rust', 16, 48, rustBleed);
  A.add('hd_soot', 32, 64, sootPlume);
  A.add('hd_damp', 32, 32, dampPatch);
}
