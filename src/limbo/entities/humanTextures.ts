// Character atlas textures: neutral (light grey) designs tinted via vertex
// colours. Survivors themselves are now painted onto a per-character texture
// page (humanPaint.ts / humanClothes.ts keyed by these same look names); these
// atlas versions remain registered as the fallback for unknown looks and for
// anything else that wants a flat swatch of a garment.
import { atlas } from '../gfx/atlas';
import { addTextureModule } from '../gfx/textures/index';
import { PixelCanvas, makeRamp, ph } from '../gfx/pixel';
import { Rng, tileFbm } from '../core/rng';

const N = makeRamp(0xc8c8c8, 7, { hueShift: 0, spread: 0.6 }); // neutral ramp dark..light

function cloth(pc: PixelCanvas, rng: Rng, base = 4, fold = true) {
  pc.fillRamp(N, (x, y) => 0.62 + (tileFbm(x, y, pc.w, pc.h, 2, 2, 3) - 0.5) * 0.2 + (ph(x, y, 4) - 0.5) * 0.06, 0.6);
  if (fold) {
    // soft fold shadows
    for (let k = 0; k < 2; k++) {
      const fx = rng.int(2, pc.w - 3);
      for (let y = 2; y < pc.h - 2; y++) if (ph(fx, y, k) < 0.7) pc.blend(fx + (y % 5 === 0 ? 1 : 0), y, N[base - 2], 0.35);
    }
  }
}

function seams(pc: PixelCanvas, c: number) {
  for (let y = 0; y < pc.h; y++) { pc.blend(0, y, c, 0.4); pc.blend(pc.w - 1, y, c, 0.4); }
}

addTextureModule(() => {
  const A = atlas();
  // ---------- skin & faces ----------
  A.add('c_skin', 8, 8, (pc) => {
    pc.fillRamp(N, (x, y) => 0.8 + (ph(x, y, 7) - 0.5) * 0.06, 0.5);
  });
  const face = (pc: PixelCanvas, v: number) => {
    pc.wrap = false;
    pc.fillRamp(N, (x, y) => 0.8 - (y > 12 ? 0.04 : 0) + (x === 0 || x === 15 ? -0.05 : 0), 0.5);
    const eyeY = 6 + (v === 2 ? 1 : 0);
    const dark = 0x2a2522, white = 0xf0eee8, brow = 0x4a4038;
    // brows
    for (const ex of [4, 10]) { pc.set(ex - 1, eyeY - 2, brow); pc.set(ex, eyeY - 2, brow); pc.set(ex + 1, eyeY - 2, v === 3 ? brow : N[3]); }
    // eyes (whites + iris)
    for (const ex of [4, 10]) { pc.set(ex - 1, eyeY, white); pc.set(ex, eyeY, dark); pc.set(ex + 1, eyeY, white); pc.set(ex, eyeY + 1, N[4]); }
    // nose shadow
    pc.set(7, eyeY + 2, N[4]); pc.set(8, eyeY + 3, N[4]); pc.set(7, eyeY + 4, N[3]);
    // mouth
    const my = eyeY + 6;
    if (v === 1) { pc.hline(6, 9, my, 0x6a3a34); pc.set(5, my - 1, 0x6a3a34); pc.set(10, my - 1, 0x6a3a34); }
    else { pc.hline(6, 9, my, 0x7a4a44); pc.set(7, my + 1, N[4]); pc.set(8, my + 1, N[4]); }
    // cheek shading / jaw
    for (let x = 1; x < 15; x++) pc.blend(x, 15, N[3], 0.5);
    if (v === 3) { pc.set(3, eyeY + 4, N[4]); pc.set(12, eyeY + 4, N[4]); } // freckles
  };
  for (let v = 0; v < 4; v++) A.add('c_face_' + v, 16, 16, (pc) => face(pc, v));
  // hollow face for mimics / uncanny entities
  A.add('c_face_blank', 16, 16, (pc) => { pc.fillRamp(N, () => 0.82, 0.5); pc.set(4, 7, N[4]); pc.set(11, 7, N[4]); });
  A.add('c_hair', 16, 16, (pc) => {
    pc.fillRamp(N, (x, y) => 0.55 + (Math.sin(x * 1.7 + y * 0.3) * 0.5 + 0.5) * 0.25 + (ph(x, y, 9) - 0.5) * 0.15, 1);
    for (let x = 0; x < 16; x += 3) for (let y = 0; y < 16; y++) if (ph(x, y, 2) < 0.4) pc.blend(x, y, N[1], 0.4);
  });
  A.add('c_hair_fringe', 16, 6, (pc) => {
    pc.wrap = false;
    pc.fillRamp(N, (x, y) => 0.6 + (ph(x, y, 4) - 0.5) * 0.2, 1);
    for (let x = 0; x < 16; x++) { const len = 2 + Math.floor(ph(x, 0, 5) * 4); for (let y = len; y < 6; y++) pc.setRGBA(x, y, 0, 0, 0, 0); }
  });

  // ---------- clothing (tinted per item colour) ----------
  A.add('c_shirt', 16, 16, (pc, r) => { cloth(pc, r); seams(pc, N[2]); for (let x = 5; x < 11; x++) pc.blend(x, 0, N[1], 0.6); });
  A.add('c_shirt_stripe', 16, 16, (pc, r) => { cloth(pc, r); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) { pc.blend(x, y, N[1], 0.6); pc.blend(x, y + 1, N[1], 0.5); } });
  A.add('c_shirt_button', 16, 16, (pc, r) => {
    cloth(pc, r, 4, false);
    pc.vline(8, 0, 15, N[3]);
    for (let y = 2; y < 16; y += 4) pc.set(8, y, 0xf4f4f0);
    pc.set(5, 0, N[1]); pc.set(6, 1, N[1]); pc.set(11, 0, N[1]); pc.set(10, 1, N[1]);
    pc.rect(2, 4, 3, 3, N[3]); pc.hline(2, 4, 4, N[2]); // pocket
  });
  A.add('c_sweater', 16, 16, (pc) => {
    pc.fillRamp(N, (x, y) => 0.6 + ((x + (y >> 1)) % 4 < 2 ? 0.05 : -0.05) + (ph(x, y, 3) - 0.5) * 0.06, 0.6);
    for (let x = 0; x < 16; x++) { pc.blend(x, 14, N[2], 0.5); pc.blend(x, 15, N[2], 0.6); }
    for (let y = 2; y < 14; y += 4) for (let x = 0; x < 16; x++) if ((x + y) % 2 === 0) pc.blend(x, y, N[6], 0.3);
  });
  A.add('c_hoodie', 16, 16, (pc, r) => {
    cloth(pc, r);
    pc.rect(4, 9, 8, 4, N[3]); pc.hline(4, 11, 9, N[2]); // pouch pocket
    pc.set(6, 1, N[6]); pc.set(6, 2, N[6]); pc.set(9, 1, N[6]); pc.set(9, 2, N[6]); // drawstrings
  });
  A.add('c_jacket', 16, 16, (pc, r) => {
    cloth(pc, r);
    pc.vline(8, 0, 15, N[1]); for (let y = 0; y < 16; y += 2) pc.set(8, y, 0xb0b0b0); // zipper
    pc.rect(2, 9, 4, 1, N[2]); pc.rect(10, 9, 4, 1, N[2]);
    for (let x = 0; x < 16; x++) pc.blend(x, 15, N[2], 0.5);
  });
  A.add('c_jacket_leather', 16, 16, (pc) => {
    pc.fillRamp(N, (x, y) => 0.45 + (tileFbm(x, y, 16, 16, 3, 2, 8) - 0.5) * 0.3, 1);
    pc.vline(9, 0, 15, N[1]); for (let y = 3; y < 15; y += 3) pc.set(9, y, 0xd0d0d0);
    for (let x = 2; x < 7; x++) pc.set(x, 2 + Math.floor((x - 2) / 2), N[5]); // collar highlight
    pc.speckle(new Rng(3), [N[5]], 0.04);
  });
  A.add('c_coat', 16, 16, (pc, r) => {
    cloth(pc, r, 4);
    for (let y = 3; y < 16; y += 4) { pc.set(6, y, 0x202020); pc.set(10, y, 0x202020); }
    pc.vline(8, 0, 15, N[2]);
    for (let x = 0; x < 16; x++) pc.blend(x, 0, N[1], 0.5);
  });
  A.add('c_vest_hiviz', 16, 16, (pc) => {
    pc.fillRamp(N, (x, y) => 0.75 + (ph(x, y, 5) - 0.5) * 0.08, 0.5);
    for (let x = 0; x < 16; x++) { pc.set(x, 7, 0xf8f8f8); pc.set(x, 8, 0xe0e0e0); pc.set(x, 12, 0xf8f8f8); }
  });
  A.add('c_labcoat', 16, 16, (pc, r) => {
    cloth(pc, r, 4, true);
    pc.vline(8, 0, 15, N[4]);
    pc.rect(2, 9, 4, 3, N[5]); pc.hline(2, 5, 9, N[3]); pc.set(3, 8, 0x3050c0); // pen in pocket
    pc.set(10, 2, 0x606060); pc.set(11, 2, 0x606060); // badge
  });
  A.add('c_scrubs', 16, 16, (pc, r) => { cloth(pc, r); pc.line(5, 0, 8, 4, N[2]); pc.line(11, 0, 8, 4, N[2]); pc.rect(10, 7, 3, 3, N[3]); });
  A.add('c_uniform', 16, 16, (pc, r) => {
    cloth(pc, r);
    pc.vline(8, 0, 15, N[2]); for (let y = 2; y < 14; y += 3) pc.set(8, y, 0xc8b060);
    pc.rect(3, 3, 3, 3, N[3]); pc.set(4, 4, 0xd8c070); // badge
    pc.hline(0, 15, 13, N[1]); pc.set(8, 13, 0xc0c0c0); // belt
  });
  A.add('c_jeans', 16, 16, (pc) => {
    pc.fillRamp(N, (x, y) => 0.55 + ((x + y) % 3 === 0 ? 0.06 : 0) + (tileFbm(x, y, 16, 16, 2, 2, 4) - 0.5) * 0.25, 1);
    pc.vline(3, 0, 15, N[5]); pc.vline(12, 0, 15, N[5]);
    for (let x = 4; x < 12; x++) if (ph(x, 7, 2) < 0.4) pc.blend(x, 7, N[6], 0.4); // fade on knees
  });
  A.add('c_slacks', 16, 16, (pc, r) => { cloth(pc, r, 4, false); pc.vline(8, 0, 15, N[3]); });
  A.add('c_shorts', 16, 16, (pc, r) => { cloth(pc, r); pc.hline(0, 15, 15, N[2]); });
  A.add('c_sweatpants', 16, 16, (pc, r) => { cloth(pc, r); pc.vline(2, 0, 15, N[6]); pc.vline(13, 0, 15, N[6]); for (let x = 0; x < 16; x++) pc.blend(x, 15, N[2], 0.6); });
  A.add('c_skirt', 16, 16, (pc, r) => { cloth(pc, r); for (let x = 1; x < 16; x += 3) pc.vline(x, 4, 15, N[3]); });
  A.add('c_pajama', 16, 16, (pc, r) => { cloth(pc, r); for (let y = 1; y < 16; y += 5) for (let x = 1; x < 16; x += 5) { pc.set(x, y, N[6]); pc.set(x + 1, y, N[6]); pc.set(x, y + 1, N[6]); } });
  A.add('c_underwear', 16, 16, (pc) => { pc.fillRamp(N, () => 0.82, 0.5); pc.hline(0, 15, 0, N[3]); });
  A.add('c_shoes_sneaker', 16, 16, (pc) => {
    pc.fillRamp(N, (x, y) => (y > 11 ? 0.95 : 0.6) + (ph(x, y, 6) - 0.5) * 0.05, 0.5);
    for (let x = 3; x < 13; x += 2) pc.set(x, 5, 0xf0f0f0);
    pc.hline(0, 15, 11, N[2]);
  });
  A.add('c_shoes_boot', 16, 16, (pc) => {
    pc.fillRamp(N, (x, y) => (y > 12 ? 0.25 : 0.5) + (tileFbm(x, y, 16, 16, 2, 2, 9) - 0.5) * 0.2, 1);
    for (let y = 2; y < 10; y += 2) { pc.set(6, y, N[5]); pc.set(9, y, N[5]); }
  });
  A.add('c_shoes_dress', 16, 16, (pc) => { pc.fillRamp(N, (x, y) => 0.35 + (y < 4 ? 0.2 : 0) + (ph(x, y, 1) - 0.5) * 0.05, 0.5); pc.set(10, 3, 0xffffff); });
  A.add('c_gloves', 16, 16, (pc, r) => { cloth(pc, r, 4, false); for (let x = 2; x < 16; x += 4) pc.vline(x, 8, 15, N[3]); });
  A.add('c_hat_cap', 16, 16, (pc, r) => { cloth(pc, r, 4, false); pc.set(8, 0, N[2]); pc.line(8, 0, 8, 15, N[4]); });
  A.add('c_beanie', 16, 16, (pc) => { pc.fillRamp(N, (x, y) => 0.6 + (x % 3 === 0 ? -0.08 : 0.03) + (y > 11 ? -0.1 : 0), 0.6); });
  A.add('c_hardhat', 16, 16, (pc) => { pc.fillRamp(N, (x, y) => 0.85 - y * 0.012, 0.6); pc.hline(0, 15, 15, N[3]); pc.vline(8, 0, 12, N[6]); });
  A.add('c_glasses', 8, 4, (pc) => { pc.wrap = false; pc.fill(0x202020); pc.rect(1, 1, 2, 2, 0x88a8b8); pc.rect(5, 1, 2, 2, 0x88a8b8); });
  A.add('c_mask', 16, 16, (pc) => { pc.fillRamp(N, (x, y) => 0.85 - Math.abs(x - 8) * 0.01, 0.5); for (let y = 4; y < 14; y += 3) pc.hline(3, 12, y, N[4]); });
  A.add('c_backpack', 16, 16, (pc, r) => { cloth(pc, r, 4, false); pc.rect(3, 8, 10, 6, N[3]); pc.hline(3, 12, 8, N[2]); pc.vline(8, 1, 6, 0x303030); });
  A.add('c_bag', 16, 16, (pc, r) => { cloth(pc, r, 4, false); pc.hline(0, 15, 3, N[2]); });
});
