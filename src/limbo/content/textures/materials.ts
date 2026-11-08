// Surfaces stream — GENERIC MATERIALS used on furniture and props everywhere.
// They tile seamlessly at 32 px/m and are deliberately calm: low contrast,
// small-scale detail only, so a 3 px table leg and a 2 m wardrobe side both
// read correctly. Neutral bases tint well with vertex colours.
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { PixelCanvas, makeRamp, mixHex, ph } from '../../gfx/pixel';
import { Rng } from '../../core/rng';
import { nz, q, blob, flecks, scuff, stamp } from './kit';

// ---------------------------------------------------------------------------
// wood
// ---------------------------------------------------------------------------

/** Long horizontal grain: streaks from x-stretched noise, a few dark pore dashes. */
function woodGrain(pc: PixelCanvas, rng: Rng, base: number, seed: number, contrast = 0.36, pores = 10) {
  const R = makeRamp(base, 6, { spread: 0.4, hueShift: 0.03 });
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const g = nz(pc, x, y, 2, Math.max(4, pc.h >> 1), 2, seed);
    const r = nz(pc, x, y, 1, Math.max(2, pc.h >> 3), 1, seed + 3);
    const v = 0.5 + (g - 0.5) * contrast * 2 + (r - 0.5) * 0.18;
    pc.set(x, y, q(R, v, x, y, 0.15));
  }
  for (let i = 0; i < pores; i++) {
    const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1), len = rng.int(2, 5);
    for (let k = 0; k < len; k++) pc.set(x + k, y, R[1]);
  }
  return R;
}

function woodLight(pc: PixelCanvas, rng: Rng) {
  const R = woodGrain(pc, rng, 0xc49c66, 701);
  // a small knot
  pc.set(21, 12, R[1]); pc.set(22, 12, R[0]); pc.set(23, 12, R[1]); pc.set(22, 11, R[2]); pc.set(22, 13, R[2]);
}
function woodDark(pc: PixelCanvas, rng: Rng) {
  const R = woodGrain(pc, rng, 0x5c3a25, 711, 0.4);
  for (let i = 0; i < 6; i++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.set(x, y, R[4]); pc.set(x + 1, y, R[3]); }   // varnish catch-lights
}

function woodTrim(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xe4e0d4, 4, { spread: 0.18 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, nz(pc, x, y, 2, 8, 2, 721) < 0.42 ? R[1] : R[2]);
  pc.set(rng.int(0, 15), rng.int(0, 15), R[0]);
}

function woodCrate(pc: PixelCanvas, rng: Rng) {
  const tones = [0xb79c74, 0xab9068, 0xbfa57c, 0xa58a64];
  for (let b = 0; b < 4; b++) {
    const R = makeRamp(tones[b], 6, { spread: 0.4, hueShift: 0.03 });
    for (let y = b * 8; y < b * 8 + 8; y++) for (let x = 0; x < 32; x++) {
      const ly = y - b * 8;
      let c: number;
      if (ly === 7) c = 0x2a2119;                                   // gap between slats
      else if (ly === 6) c = R[1];
      else if (ly === 0) c = R[4];
      else { const g = nz(pc, x + b * 9, y, 2, 16, 2, 731 + b); c = g < 0.38 ? R[1] : g > 0.62 ? R[3] : R[2]; }
      pc.set(x, y, c);
    }
    // nails where the slat meets the bearer
    for (const nx of [3, 28]) { pc.set(nx, b * 8 + 2, 0x3a3632); pc.set(nx, b * 8 + 4, 0x3a3632); pc.set(nx - 1, b * 8 + 2, R[5]); }
    // splinters / rough fibres
    for (let k = 0; k < 3; k++) { const x = rng.int(0, 30), y = b * 8 + rng.int(1, 5); pc.set(x, y, R[0]); pc.set(x + 1, y, R[1]); }
  }
  // faint stencil fragment
  for (const [x, y] of [[12, 10], [13, 10], [14, 10], [12, 11], [12, 12], [13, 12], [16, 10], [16, 11], [16, 12], [17, 12]]) pc.blend(x, y, 0x2e2a26, 0.4);
}

function plank(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xb08a5c, 6, { spread: 0.42, hueShift: 0.03 });
  for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) {
    let c: number;
    if (y === 0) c = R[4];
    else if (y === 7) c = R[0];
    else if (y === 6) c = R[1];
    else { const g = nz(pc, x, y, 2, 8, 2, 741); c = g < 0.4 ? R[1] : g > 0.62 ? R[3] : R[2]; }
    pc.set(x, y, c);
  }
  pc.set(9, 3, R[0]); pc.set(10, 3, R[1]); pc.set(10, 4, R[0]); pc.set(8, 4, R[2]);
  for (let k = 0; k < 4; k++) { const x = rng.int(0, 29), y = rng.int(2, 5); pc.set(x, y, R[1]); pc.set(x + 1, y, R[1]); pc.set(x + 2, y, R[1]); }
}

// ---------------------------------------------------------------------------
// metals
// ---------------------------------------------------------------------------

function metalBase(pc: PixelCanvas, rng: Rng, base: number, seed: number, scratches = 8, spread = 0.2): number[] {
  const R = makeRamp(base, 5, { spread, hueShift: 0.025 });
  const lo = mixHex(R[2], R[1], 0.5), hi = mixHex(R[2], R[3], 0.5);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const s = nz(pc, x, y, 2, Math.max(4, pc.h >> 1), 2, seed), m = nz(pc, x, y, 3, 3, 2, seed + 1);
    let c = s < 0.4 ? lo : s > 0.62 ? hi : R[2];
    if (m < 0.36) c = mixHex(c, R[1], 0.35);
    pc.set(x, y, c);
  }
  for (let i = 0; i < scratches; i++) {
    const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1), len = rng.int(2, 5);
    for (let k = 0; k < len; k++) pc.set(x + k, y + (k > 2 && rng.chance(0.3) ? 1 : 0), k === 0 || k === len - 1 ? hi : R[4]);
  }
  for (let i = 0; i < Math.floor(pc.w * pc.h / 170); i++) pc.set(rng.int(0, pc.w - 1), rng.int(0, pc.h - 1), R[1]);
  return R;
}

function metalBrass(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xb48e3c, 6, { spread: 0.5, hueShift: 0.03 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const g = nz(pc, x, y, 2, 8, 2, 761);
    let i = g < 0.42 ? 2 : g > 0.6 ? 4 : 3;
    if (y === 3 || y === 4) i = 5;                           // polished catch-light band
    if (y === 11) i = 1;
    pc.set(x, y, R[i]);
  }
  pc.set(rng.int(0, 15), rng.int(6, 10), 0x6a5a2c);          // tarnish
  pc.set(5, 3, 0xfff2c0); pc.set(12, 4, 0xfff2c0);
}

function metalRusty(pc: PixelCanvas, rng: Rng) {
  const Ru = makeRamp(0x7a4a2f, 6, { spread: 0.34, hueShift: 0.03 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const n = nz(pc, x, y, 4, 4, 2, 772), f = nz(pc, x, y, 6, 6, 1, 773);
    let c = n < 0.42 ? Ru[1] : n > 0.62 ? Ru[3] : Ru[2];
    if (f > 0.68 && n > 0.5) c = Ru[4];                      // fresh orange bloom
    if (ph(x, y, 774) < 0.035) c = Ru[0];                      // pitting
    pc.set(x, y, c);
  }
  // a few islands of bare steel and flakes of old green paint
  for (const [x, y] of [[6, 7], [22, 19], [13, 27]]) { pc.set(x, y, 0x77746e); pc.set(x + 1, y, 0x6a6762); pc.set(x, y + 1, 0x5f5c58); pc.set(x + 1, y + 1, Ru[1]); }
  for (let i = 0; i < 4; i++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.set(x, y, 0x56664f); pc.set(x + 1, y, 0x4a5a45); }
  // run-off streaks
  for (const sx of [9, 25]) for (let y = 0; y < 32; y++) if (nz(pc, sx, y, 3, 3, 2, 775) > 0.46) pc.set(sx, y, Ru[1]);
}

function metalSheet(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x8b939a, 6, { spread: 0.46, hueShift: 0.03 });
  const prof = [3, 4, 5, 4, 3, 2, 1, 2];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let i = prof[x & 7];
    if (nz(pc, x, y, 3, 3, 2, 781) < 0.38 && i > 1) i -= 1;
    pc.set(x, y, R[i]);
  }
  // rust spots on the troughs and white zinc bloom streaks
  const Ru = [0x7a4a2c, 0x965c34];
  for (let i = 0; i < 9; i++) { const x = rng.int(0, 3) * 8 + 5 + rng.int(0, 1), y = rng.int(0, 31); pc.set(x, y, Ru[i & 1]); if (i & 1) pc.blend(x, y + 1, Ru[0], 0.5); }
  for (let i = 0; i < 4; i++) { const x = rng.int(0, 31), y = rng.int(0, 24); for (let k = 0; k < 6; k++) pc.blend(x, y + k, 0xd6dcdc, 0.25); }
  // fixing screws along a purlin line
  for (let x = 2; x < 32; x += 8) { pc.set(x, 15, 0x3e4246); pc.set(x, 14, R[5]); }
}

function metalBrushed(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xb3b8bc, 5, { spread: 0.24, hueShift: 0.02 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const s = nz(pc, x, y, 2, 32, 1, 791) * 0.7 + nz(pc, x, y, 4, 16, 1, 792) * 0.3;
    pc.set(x, y, s < 0.42 ? R[1] : s > 0.6 ? R[3] : R[2]);
  }
  for (let i = 0; i < 6; i++) { const x = rng.int(0, 31), y = rng.int(0, 31); for (let k = 0; k < 6; k++) pc.set(x + k, y, R[4]); }
  // fingerprint smudge
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const m = blob(x, y, 20, 18, 3, 2.5, 3); if (m > 0.2 && ((x + y) & 1)) pc.blend(x, y, R[1], 0.35); }
}

function metalPaintedGreen(pc: PixelCanvas, rng: Rng) {
  const R = metalBase(pc, rng, 0x4e6b56, 801, 0, 0.18);
  // chips through to bare steel, some rusting
  for (let i = 0; i < 9; i++) {
    const x = rng.int(0, 31), y = rng.int(0, 31), big = rng.chance(0.4);
    pc.set(x, y, 0x8a8e8c); if (big) { pc.set(x + 1, y, 0x9a9e9c); pc.set(x, y + 1, 0x7a4a2c); }
    pc.blend(x - 1, y, R[4], 0.5);
  }
  for (let i = 0; i < 5; i++) scuff(pc, rng.int(0, 28), rng.int(0, 31), rng.int(3, 6), 1, rng.float(-0.3, 0.3), R[4], 0.5);
}

function chrome(pc: PixelCanvas, rng: Rng) {
  // reflected environment: bright ceiling, dark horizon, floor bounce
  const rows = [0xf3f6f9, 0xe2e8ee, 0xc6ced6, 0xa4aeb8, 0x8894a0, 0x6e7a86, 0x3e4650, 0x2e343c, 0x4c5660, 0x66717c, 0x7e8a96, 0x96a2ae, 0xb0bac4, 0xc8d0d8, 0xdbe1e7, 0xe9eef2];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, rows[y]);
  for (let x = 0; x < 16; x += 5) { pc.set(x, 1, 0xffffff); pc.set(x + 1, 1, 0xffffff); }
  pc.set(rng.int(0, 15), 7, 0x5a6470);
}

// ---------------------------------------------------------------------------
// plastics / rubber / ceramics
// ---------------------------------------------------------------------------

function plastic(pc: PixelCanvas, rng: Rng, base: number, seed: number, opts: { stipple?: number; scuffs?: number; spread?: number; yellow?: number } = {}): number[] {
  const R = makeRamp(base, 5, { spread: opts.spread ?? 0.14, hueShift: 0.025 });
  const lo = mixHex(R[2], R[1], 0.5), hi = mixHex(R[2], R[3], 0.5);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = nz(pc, x, y, 4, 4, 2, seed);
    let c = n < 0.37 ? lo : n > 0.65 ? hi : R[2];
    if (opts.stipple && ph(x, y, seed + 1) < opts.stipple) c = lo;
    pc.set(x, y, c);
  }
  if (opts.yellow) for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (nz(pc, x, y, 2, 2, 2, seed + 2) > 0.6) pc.blend(x, y, 0xc8b070, opts.yellow);
  for (let i = 0; i < (opts.scuffs ?? 3); i++) scuff(pc, rng.int(0, pc.w - 4), rng.int(0, pc.h - 1), rng.int(2, 4), 1, rng.float(-0.4, 0.4), R[1], 0.5);
  return R;
}

function porcelain(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xecefec, 5, { spread: 0.14, hueShift: 0.03 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, nz(pc, x, y, 2, 2, 2, 811) < 0.42 ? R[2] : R[3]);
  // glaze highlight
  for (const [x, y] of [[3, 2], [4, 2], [2, 3], [3, 3], [11, 9], [12, 9]]) pc.set(x, y, 0xffffff);
  pc.set(rng.int(5, 14), rng.int(5, 14), R[1]);
}

// ---------------------------------------------------------------------------
// textiles
// ---------------------------------------------------------------------------

type Weave = 'plain' | 'twill' | 'tweed' | 'velour';
function fabric(pc: PixelCanvas, rng: Rng, base: number, seed: number, weave: Weave, spread = 0.22): number[] {
  const R = makeRamp(base, 5, { spread, hueShift: 0.03 });
  const lo = mixHex(R[2], R[1], 0.55), hi = mixHex(R[2], R[3], 0.5);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = nz(pc, x, y, 4, 4, 2, seed);
    let c = n < 0.38 ? lo : R[2];                                     // compressed / pilled patches
    if (weave === 'twill' && (x + y) % 4 === 0) c = c === lo ? R[1] : lo;
    if (weave === 'plain' && ((x + y) & 1) === 0 && ph(x >> 1, y >> 1, seed) < 0.3) c = lo;
    if (weave === 'velour' && n > 0.68) c = hi;                       // nap catching the light
    pc.set(x, y, c);
  }
  const n = weave === 'tweed' ? 60 : 10;
  for (let k = 0; k < n; k++) {
    const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1);
    const c = weave === 'tweed' ? (k % 3 === 0 ? R[4] : k % 3 === 1 ? R[1] : mixHex(R[3], 0xd8c890, 0.3)) : (k & 1 ? hi : R[1]);
    pc.set(x, y, c); if (weave === 'tweed' || k % 3 === 0) pc.set(x + 1, y, c);
  }
  return R;
}

function fabricFloral(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xd9c9aa, 5, { spread: 0.22 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) pc.set(x, y, nz(pc, x, y, 3, 3, 2, 821) < 0.42 ? R[1] : R[2]);
  const flower = ['.pPp.', 'pPRPp', 'PRrRP', 'pPRPp', '.pPp.'];
  const leaf = ['ll.', '.Ll', '..l'];
  const pal = { p: 0x9e5a5e, P: 0xb8727a, R: 0xcf9198, r: 0xe0b3b5, l: 0x6f7f5c, L: 0x8a9a72 };
  for (const [x, y, f] of [[3, 3, false], [19, 11, true], [8, 20, true], [24, 26, false]] as [number, number, boolean][]) {
    stamp(pc, x, y, flower, pal);
    stamp(pc, f ? x - 3 : x + 5, y + 4, leaf, pal, 255, f);
    stamp(pc, f ? x + 5 : x - 2, y - 2, leaf, pal, 255, !f);
  }
  for (const [x, y] of [[14, 4], [29, 6], [2, 14], [15, 27], [27, 17]]) { pc.set(x, y, 0x8a9a72); pc.set(x + 1, y + 1, 0x6f7f5c); pc.set(x, y + 1, 0xb8727a); }
  void rng;
}

function leather(pc: PixelCanvas, rng: Rng, base: number, seed: number) {
  const R = makeRamp(base, 6, { spread: 0.34, hueShift: 0.03 });
  const sheen = mixHex(R[3], R[4], 0.5), fold = mixHex(R[2], R[1], 0.6);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const n = nz(pc, x, y, 3, 3, 2, seed), w = nz(pc, x, y, 2, 6, 2, seed + 1);
    let c = n > 0.66 ? mixHex(R[3], sheen, 0.5) : n < 0.36 ? mixHex(R[2], R[3], 0.35) : mixHex(R[2], R[3], 0.6);
    if (Math.abs(w - 0.5) < 0.016) c = fold;                        // soft wrinkles, dark only
    if (ph(x, y, seed + 2) < 0.035) c = mixHex(c, R[1], 0.5);        // pebble grain
    pc.set(x, y, c);
  }
  for (let k = 0; k < 5; k++) { const x = rng.int(0, 30), y = rng.int(0, 31); pc.set(x, y, R[4]); }
}

function curtain(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false;
  const R = makeRamp(0xb08c42, 7, { spread: 0.5, hueShift: 0.035 });
  // three heavy folds across 16px: lit crest, broad face, deep shadow in the valley
  const prof = [3, 5, 6, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5, 4, 2];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
    const sway = y > 3 ? Math.round(Math.sin(y * 0.21 + x * 0.1) * 0.7) : 0;
    let i = prof[Math.min(15, Math.max(0, x + sway))];
    if (y > 3 && nz(pc, x, y, 2, 4, 1, 831) < 0.33 && i > 0) i -= 1;
    pc.set(x, y, R[i]);
  }
  // header: gathered pleat tops under the rod
  for (let x = 0; x < 16; x++) { pc.set(x, 0, R[1]); pc.set(x, 1, x % 4 === 0 ? R[0] : R[5]); pc.set(x, 2, x % 4 === 0 ? R[1] : R[3]); }
  // weighted hem
  for (let x = 0; x < 16; x++) { pc.set(x, 29, Math.min(6, prof[x] + 1) === 6 ? R[6] : R[Math.min(6, prof[x] + 1)]); pc.set(x, 30, R[Math.max(0, prof[x] - 1)]); pc.set(x, 31, R[0]); }
  void rng;
}

function mattress(pc: PixelCanvas, rng: Rng) {
  const cream = makeRamp(0xe5dfcd, 4, { spread: 0.2 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const n = nz(pc, x, y, 2, 2, 2, 841) < 0.42 ? 1 : 2;
    const k = x & 7;
    let c = cream[n];
    if (k === 0) c = 0x76869e;
    else if (k === 2) c = 0x9ba7b9;
    pc.set(x, y, c);
  }
  // quilting tufts
  for (let ty = 4; ty < 32; ty += 16) for (let tx = 5; tx < 32; tx += 16) {
    const x = tx + (ty > 16 ? 8 : 0);
    pc.set(x, ty, 0x8a8778); pc.set(x - 1, ty - 1, cream[0]); pc.set(x + 1, ty + 1, cream[3]);
  }
  // an old yellowed sweat stain
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const m = blob(x, y, 20, 21, 6, 4, 9);
    if (m > 0.04 && m < 0.16) pc.blend(x, y, 0xb59a5c, 0.45);
    else if (m >= 0.16) pc.blend(x, y, 0xcdb986, 0.3);
  }
  void rng;
}

function pillow(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xebe9e1, 4, { spread: 0.16 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, nz(pc, x, y, 2, 2, 2, 851) < 0.4 ? R[1] : R[2]);
  // soft creases
  for (const [x, y, dx, dy, l] of [[3, 4, 1, 1, 4], [9, 10, 1, -1, 4], [11, 3, 1, 1, 3]]) for (let k = 0; k < l; k++) { pc.set(x + dx * k, y + dy * k, R[0]); pc.set(x + dx * k, y + dy * k - 1, R[3]); }
  void rng;
}

function towel(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xe7e3d8, 5, { spread: 0.24 });
  const B = makeRamp(0x8fb3c8, 4, { spread: 0.3 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const n = nz(pc, x, y, 4, 4, 2, 861);
    // terry loops: tiny soft clusters, low contrast
    let c = n < 0.4 ? mixHex(R[2], R[1], 0.5) : R[2];
    if (((x >> 1) + (y >> 1)) % 3 === 0 && ph(x >> 1, y >> 1, 862) < 0.5) c = mixHex(c, R[1], 0.6);
    if (y >= 23 && y <= 27) c = y === 23 || y === 27 ? B[1] : (x + y) & 1 ? B[2] : B[3];   // woven dobby band
    pc.set(x, y, c);
  }
  void rng;
}

function carpetRug(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false;
  const red = makeRamp(0x8a2a2c, 5, { spread: 0.36, hueShift: 0.03 });
  const navy = 0x27304e, navyL = 0x3a4672, gold = 0xc49a4c, cream = 0xe6d8b6;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let c = nz(pc, x, y, 3, 3, 2, 871) < 0.4 ? red[1] : red[2];
    // field lattice
    if (((x + y) % 6 === 0 || (x - y + 60) % 6 === 0) && ph(x, y, 872) < 0.75) c = red[1];
    pc.set(x, y, c);
  }
  // borders
  for (let y = 2; y < 30; y++) for (let x = 0; x < 32; x++) {
    const e = Math.min(x, 31 - x, y - 2, 29 - y);
    if (e <= 2) pc.set(x, y, ((x + y) % 4 === 0 && e === 1) ? gold : e === 0 ? navyL : navy);
    else if (e === 3) pc.set(x, y, gold);
  }
  // central medallion
  for (let y = 9; y < 23; y++) for (let x = 8; x < 24; x++) {
    const d = Math.abs(x - 15.5) / 8 + Math.abs(y - 15.5) / 7;
    if (d < 0.35) pc.set(x, y, cream);
    else if (d < 0.55) pc.set(x, y, gold);
    else if (d < 0.88) pc.set(x, y, navy);
    else if (d < 1.0) pc.set(x, y, gold);
  }
  for (const [x, y] of [[15, 15], [16, 16], [15, 16], [16, 15]]) pc.set(x, y, red[3]);
  // fringe
  for (let x = 0; x < 32; x++) for (const y of [0, 1, 30, 31]) pc.set(x, y, x & 1 ? cream : (y === 0 || y === 31) ? 0 : mixHex(cream, 0x8a7a60, 0.4), x & 1 || y === 1 || y === 30 ? 255 : 0);
  // worn patch
  for (let y = 4; y < 28; y++) for (let x = 3; x < 29; x++) if (blob(x, y, 22, 22, 5, 4, 3) > 0.25 && ((x + y) & 1)) pc.blend(x, y, 0xb07a62, 0.35);
  void rng;
}

// ---------------------------------------------------------------------------
// stone & nature
// ---------------------------------------------------------------------------

function marble(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xe3e1dc, 5, { spread: 0.16, hueShift: 0.02 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) pc.set(x, y, nz(pc, x, y, 3, 3, 2, 884) < 0.4 ? mixHex(R[2], R[3], 0.5) : R[3]);
  // veins: slope ±1 paths with periodic wobble so they continue seamlessly into the next tile
  const vein = (x0: number, slope: number, amp: number, seed: number, dark: number, halo: number, hair = false) => {
    for (let y = 0; y < 32; y++) {
      const w = amp * Math.sin((y / 32) * Math.PI * 2 + seed) + amp * 0.5 * Math.sin((y / 32) * Math.PI * 4 + seed * 2.1);
      const x = Math.round(x0 + slope * y + w);
      pc.set(x, y, dark);
      if (!hair) { if (ph(x, y, seed) < 0.6) pc.set(x + 1, y, halo); if (ph(x, y, seed + 1) < 0.35) pc.set(x - 1, y, halo); }
    }
  };
  vein(4, 1, 2.5, 1.3, 0x9d9ca2, R[1]);
  vein(20, 1, 3.5, 4.1, 0xb4b3b8, R[2], true);
  vein(28, -1, 2, 2.2, 0xc4c3c6, R[2], true);
  for (let k = 0; k < 3; k++) pc.set(rng.int(0, 31), rng.int(0, 31), 0xffffff);
}

function stoneRough(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x7d7870, 6, { spread: 0.44, hueShift: 0.03 });
  const h = (x: number, y: number) => nz(pc, x, y, 4, 4, 3, 891);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const a = h(x, y), b = h(x + 1, y + 1);
    const slope = (a - b) * 9;                    // emboss: lit from the top-left
    const v = 0.5 + slope * 0.5 + (a - 0.5) * 0.5;
    pc.set(x, y, q(R, v, x, y, 0.15));
    if (Math.abs(nz(pc, x, y, 3, 3, 2, 892) - 0.5) < 0.012) pc.set(x, y, R[0]);   // cracks
  }
  // lichen
  for (let i = 0; i < 5; i++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.set(x, y, 0x8f9a6a); pc.set(x + 1, y, 0xa3ab7a); pc.set(x, y + 1, 0x7d8a5e); }
}

function bark(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x5c4c3e, 6, { spread: 0.46, hueShift: 0.03 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const n = nz(pc, x, y, 6, 2, 3, 901), l = nz(pc, x - 1, y, 6, 2, 3, 901);
    let i: number;
    if (n < 0.38) i = 0;                                // deep fissure
    else if (n < 0.44) i = 1;
    else i = 3 + (n - l > 0.012 ? 1 : n - l < -0.012 ? -1 : 0);
    if (i >= 3 && nz(pc, x, y, 8, 8, 1, 902) > 0.62) i = Math.min(5, i + 1);
    pc.set(x, y, R[i]);
  }
  for (let i = 0; i < 4; i++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.set(x, y, 0x6e7a52); }   // moss flecks
}

function leaves(pc: PixelCanvas, rng: Rng) {
  pc.clear();
  const R = makeRamp(0x4f7d3c, 6, { spread: 0.48, hueShift: 0.05 });
  for (let k = 0; k < 64; k++) {
    const cx = rng.float(0, 32), cy = rng.float(0, 32), rx = rng.float(1.4, 2.6), ry = rng.float(1.0, 1.8);
    const tone = rng.int(1, 3);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy > 1) continue;
      const l = dx * 0.6 + dy;
      pc.set(x, y, R[Math.max(0, Math.min(5, tone + (l < -0.5 ? 2 : l < 0 ? 1 : l > 0.6 ? -1 : 0)))], 255);
    }
    // midrib
    if (rng.chance(0.4)) pc.set(Math.round(cx), Math.round(cy), R[Math.max(0, tone - 1)], 255);
  }
}

// ---------------------------------------------------------------------------
// glass, screens, LEDs, paper goods
// ---------------------------------------------------------------------------

function glass(pc: PixelCanvas, base: number, streak: number, glint: number) {
  const R = makeRamp(base, 4, { spread: 0.2 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = (x + y) & 15;
    let c = R[1];
    if (d >= 3 && d <= 5) c = streak;
    else if (d === 8) c = mixHex(streak, R[1], 0.5);
    else if (nz(pc, x, y, 2, 2, 1, 911) > 0.6) c = R[2];
    pc.set(x, y, c);
  }
  pc.set(2, 2, glint); pc.set(3, 1, glint);
}

function screenOff(pc: PixelCanvas) {
  pc.wrap = false;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - 7.5) / 8, dy = (y - 7.5) / 8, v = dx * dx + dy * dy;
    let c = v > 0.85 ? 0x101517 : v > 0.55 ? 0x161d20 : 0x1c2528;
    const d = x + y;
    if (d >= 5 && d <= 7 && v < 0.85) c = 0x2a3639;
    if (d === 6 && x > 1 && x < 6) c = 0x3b4a4e;
    pc.set(x, y, c);
  }
  pc.set(3, 2, 0x6f8288); pc.set(2, 3, 0x56686e);
}

function screenOn(pc: PixelCanvas) {
  pc.wrap = false;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - 7.5) / 8, dy = (y - 7.5) / 8, v = dx * dx + dy * dy;
    let c = v > 0.85 ? 0x7fa8d0 : v > 0.45 ? 0xa8cdee : 0xc8e4fa;
    if (y & 1) c = mixHex(c, 0x5a86b8, 0.22);
    pc.set(x, y, c);
  }
  pc.set(4, 3, 0xf2faff); pc.set(5, 3, 0xf2faff);
}

function led(pc: PixelCanvas, ramp: number[]) {
  pc.wrap = false;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4);
    let c = 0x1a1a1c;
    if (d < 3.6) c = ramp[0];
    if (d < 2.8) c = ramp[1];
    if (d < 1.8) c = ramp[2];
    if (d < 0.9) c = ramp[3];
    pc.set(x, y, c);
  }
  pc.set(3, 2, 0xffffff);
}

function paper(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xe9e4d4, 4, { spread: 0.12 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, nz(pc, x, y, 2, 2, 2, 921) < 0.42 ? R[1] : R[2]);
  flecks(pc, rng, [R[0]], 2, 0);
}

function cardboard(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xb18a58, 5, { spread: 0.26, hueShift: 0.03 });
  const lo = mixHex(R[2], R[1], 0.5);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let c = nz(pc, x, y, 4, 4, 2, 931) < 0.38 ? lo : R[2];
    if (y % 4 === 0) c = mixHex(c, R[3], 0.45);                     // flutes pressing through the liner
    pc.set(x, y, c);
  }
  for (let i = 0; i < 4; i++) scuff(pc, rng.int(0, 28), rng.int(0, 31), rng.int(2, 5), 1, rng.float(-0.4, 0.4), R[1], 0.6);
  // a coffee-cup ring
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x + 0.5 - 23, y + 0.5 - 10); if (d > 3.1 && d < 4.1 && ph(x, y, 933) < 0.75) pc.set(x, y, R[1]); }
}

function foam(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xd8c47c, 5, { spread: 0.3 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const n = nz(pc, x, y, 4, 4, 2, 941);
    let c = n < 0.42 ? R[2] : R[3];
    const p = ph(x, y, 942);
    if (p < 0.09) c = R[1];
    else if (p < 0.11) c = R[0];
    pc.set(x, y, c);
  }
  void rng;
}

function windowFrame(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xe5e1d6, 4, { spread: 0.18 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, nz(pc, x, y, 2, 4, 2, 951) < 0.42 ? R[1] : R[2]);
  for (let x = 0; x < 16; x++) { pc.set(x, 7, R[0]); pc.set(x, 8, R[3]); }   // putty/glazing bead line
  pc.set(rng.int(0, 15), rng.int(10, 15), 0xb8b0a0);
}

addTextureModule(() => {
  const A = atlas();
  A.add('wood_light', 32, 32, woodLight);
  A.add('wood_dark', 32, 32, woodDark);
  A.add('wood_trim', 16, 16, woodTrim);
  A.add('wood_crate', 32, 32, woodCrate);
  A.add('plank', 32, 8, plank, 1, 0.13);
  A.add('metal_grey', 32, 32, (pc, r) => { metalBase(pc, r, 0x8a8f95, 751); });
  A.add('metal_dark', 32, 32, (pc, r) => { metalBase(pc, r, 0x4a4e55, 752, 6, 0.26); });
  A.add('metal_brass', 16, 16, metalBrass);
  A.add('metal_rusty', 32, 32, metalRusty);
  A.add('metal_sheet', 32, 32, metalSheet);
  A.add('metal_brushed', 32, 32, metalBrushed);
  A.add('metal_painted_green', 32, 32, metalPaintedGreen);
  A.add('chrome', 16, 16, chrome);
  A.add('plastic_white', 32, 32, (pc, r) => { plastic(pc, r, 0xe1e0d9, 811, { spread: 0.1 }); });
  A.add('plastic_black', 32, 32, (pc, r) => { const R = plastic(pc, r, 0x2c2d31, 812, { spread: 0.16, scuffs: 0 }); for (let i = 0; i < 4; i++) scuff(pc, r.int(0, 28), r.int(0, 31), r.int(2, 4), 1, 0, R[4], 0.5); });
  A.add('plastic_beige', 32, 32, (pc, r) => { plastic(pc, r, 0xcec4a6, 813, { stipple: 0.05, yellow: 0.18 }); });
  A.add('plastic_red', 32, 32, (pc, r) => { plastic(pc, r, 0xb63c34, 814, { spread: 0.08 }); });
  A.add('plastic_blue', 32, 32, (pc, r) => { plastic(pc, r, 0x3b66ab, 815, { spread: 0.08 }); });
  A.add('plastic_yellow', 32, 32, (pc, r) => { plastic(pc, r, 0xdfb43e, 816, { spread: 0.08 }); });
  A.add('fabric_grey', 32, 32, (pc, r) => { fabric(pc, r, 0x7c7f84, 821, 'plain'); });
  A.add('fabric_blue', 32, 32, (pc, r) => { fabric(pc, r, 0x4b5f86, 822, 'twill'); });
  A.add('fabric_red', 32, 32, (pc, r) => { fabric(pc, r, 0x8a3638, 823, 'twill'); });
  A.add('fabric_floral', 32, 32, fabricFloral);
  A.add('fabric_brown', 32, 32, (pc, r) => { fabric(pc, r, 0x7a5a3f, 824, 'velour', 0.16); });
  A.add('fabric_green', 32, 32, (pc, r) => { fabric(pc, r, 0x5c7a52, 825, 'tweed'); });
  A.add('leather_brown', 32, 32, (pc, r) => leather(pc, r, 0x6c4229, 831));
  A.add('leather_black', 32, 32, (pc, r) => leather(pc, r, 0x2d2a2a, 832));
  A.add('rubber_black', 32, 32, (pc, r) => { plastic(pc, r, 0x27272a, 833, { spread: 0.16, stipple: 0.04, scuffs: 2 }); });
  A.add('porcelain', 16, 16, porcelain);
  A.add('paper', 16, 16, paper);
  A.add('cardboard', 32, 32, cardboard);
  A.add('foam', 32, 32, foam);
  A.add('glass', 16, 16, (pc) => glass(pc, 0xb7cdd2, 0xe2eef0, 0xffffff));
  A.add('glass_dark', 16, 16, (pc) => glass(pc, 0x27343c, 0x45576a, 0x9ab0bc));
  A.add('window_frame', 16, 16, windowFrame);
  A.add('curtain', 16, 32, curtain);
  A.add('mattress', 32, 32, mattress);
  A.add('pillow', 16, 16, pillow);
  A.add('towel', 32, 32, towel);
  A.add('carpet_rug', 32, 32, carpetRug);
  A.add('marble', 32, 32, marble);
  A.add('stone_rough', 32, 32, stoneRough);
  A.add('bark', 32, 32, bark);
  A.add('leaves', 32, 32, leaves);
  A.add('screen_off', 16, 16, screenOff);
  A.add('screen_on', 16, 16, screenOn);
  A.add('led_green', 8, 8, (pc) => led(pc, [0x1f6a32, 0x2fa84a, 0x6ae67e, 0xd2ffd8]));
  A.add('led_red', 8, 8, (pc) => led(pc, [0x6e1a18, 0xb02a24, 0xf0564a, 0xffd0c8]));
});
