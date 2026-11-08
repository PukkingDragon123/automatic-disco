// Furniture B — labs, server rooms and the radio/broadcast gear of the
// simulation's maintenance crews: racks, terminals, benches, specimen tanks,
// fume hoods, cryo pods, CRT walls and tape mainframes.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { PixelCanvas } from '../../gfx/pixel';
import {
  makeRamp, mixHex, scaleHex, bayer, ph, tileFbm, hashf, text, textC, scribble, fillNoise, rust, chips, stripes,
  grimeBottom, rivet, screw, seamH, seamV, gauge, grille, glow, poly, rod, torus, disc, discY, dial, gradV, mirroredStamp,
} from './b_common';

const T = ['setB', 'lab'];

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------
function crtFrame(pc: PixelCanvas, bg: number) {
  pc.wrap = false;
  pc.fill(bg);
  // rounded CRT corners + scanlines
  for (const [x, y] of [[0, 0], [pc.w - 1, 0], [0, pc.h - 1], [pc.w - 1, pc.h - 1]]) pc.set(x, y, 0x0a0a0c);
}
function scan(pc: PixelCanvas, amt = 0.25) { for (let y = 0; y < pc.h; y += 2) for (let x = 0; x < pc.w; x++) pc.shade(x, y, 1 - amt); }

addTextureModule(() => {
  const A = atlas();

  // --- servers
  A.add('q_server_front', 19, 64, (pc, rng) => {
    pc.wrap = false;
    pc.fill(0x121416);
    let y = 3;
    const units = [4, 3, 3, 6, 3, 3, 4, 3, 6, 3, 3, 4, 3];
    for (const h of units) {
      if (y + h > 61) break;
      const r = makeRamp(rng.chance(0.3) ? 0x3a3e44 : 0x2a2d32, 4, { spread: 0.4 });
      pc.rect(2, y, 15, h - 1, r[1]);
      pc.hline(2, 16, y, r[3]);
      if (h >= 4) for (let x = 4; x < 14; x += 3) { pc.rect(x, y + 1, 2, h - 3, r[2]); pc.set(x, y + 1, r[3]); }
      else for (let x = 4; x < 15; x += 2) pc.set(x, y + 1, 0x08090a);
      pc.set(15, y + 1, rng.pick([0x40e070, 0xffb030, 0x40a0ff, 0x40e070]));
      y += h;
    }
    pc.rect(0, 0, 19, 2, 0x1e2024); pc.rect(0, 62, 19, 2, 0x1e2024);
    pc.vline(0, 0, 63, 0x2a2c30); pc.vline(18, 0, 63, 0x0a0a0c); pc.vline(1, 2, 61, 0x1a1c1e);
    pc.rect(17, 28, 1, 6, 0x6a6c70);
  });
  A.add('q_server_side', 32, 32, (pc) => {
    const r = makeRamp(0x24272b, 5, { spread: 0.4 });
    fillNoise(pc, r, 0.5, 0.08, 2, 1001, 0.04);
    for (let y = 2; y < 30; y += 2) for (let x = 2; x < 30; x += 2) if ((y < 10 || y > 22)) pc.set(x, y, 0x0a0b0c);
    seamV(pc, 0, 0, 31, r[0], r[3]);
  });
  A.add('q_led_strip', 2, 32, (pc) => {
    pc.fill(0x0c0d0e);
    const cols = [0x50ff80, 0xffb030, 0x50b0ff, 0x50ff80, 0xff5040];
    for (let y = 0; y < 32; y += 2) for (let x = 0; x < 2; x++) if (hashf(x, y, 1011) < 0.55) pc.set(x, y, cols[Math.floor(hashf(x, y, 1012) * cols.length)]);
  });

  // --- terminal
  A.add('q_term_screen', 20, 15, (pc) => {
    crtFrame(pc, 0x061a0c);
    const G = 0x58f080, g = 0x2a9a4a;
    text(pc, 'SYS', 1, 1, G);
    scribble(pc, 1, 7, 16, g, 1011, 3, 2);
    text(pc, '>', 1, 9, G); pc.rect(5, 13, 3, 1, G);
    glow(pc, 10, 7, 10, 7, 0x0e3a1c, 0.5);
    scan(pc, 0.2);
  });
  A.add('q_term_body', 16, 16, (pc, rng) => {
    const r = makeRamp(0xc8bc9a, 5, { spread: 0.32 });
    fillNoise(pc, r, 0.55, 0.08, 2, 1021, 0.04);
    for (let y = 3; y < 13; y += 2) pc.hline(10, 14, y, r[1]);
    chips(pc, rng, 2, r[1], r[0]);
  });
  A.add('q_keyboard', 16, 5, (pc) => {
    pc.wrap = false;
    pc.fill(0x8a8270);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 15; i++) if (!(j === 3 && i > 3 && i < 11)) { pc.set(i + (j % 2), j + 1 - 1, 0xd8d0b8); }
    pc.hline(4, 11, 3, 0xd8d0b8);
  });

  // --- lab furniture
  A.add('q_epoxy_top', 32, 32, (pc, rng) => {
    const r = makeRamp(0x22262a, 5, { spread: 0.45 });
    fillNoise(pc, r, 0.4, 0.1, 2, 1031, 0.05);
    pc.stain(rng.int(4, 27), rng.int(4, 27), 4, 0x5a6058, 0x8a9088, 3);
    pc.stain(rng.int(4, 27), rng.int(4, 27), 2, 0x6a5a3a, 0xa08a5a, 7);
    for (let k = 0; k < 5; k++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.line(x, y, x + rng.int(2, 6), y + rng.int(-2, 2), r[3]); }
    pc.set(rng.int(0, 31), rng.int(0, 31), 0xe8e4d8);
  });
  A.add('q_lab_cab_front', 61, 26, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xd6d8d4, 5, { spread: 0.3 });
    fillNoise(pc, r, 0.55, 0.06, 3, 1041, 0.03);
    pc.rect(0, 23, 61, 3, 0x2a2c2e);
    const cells: [number, number, boolean][] = [[0, 15, false], [15, 15, true], [30, 16, false], [46, 15, true]];
    for (const [x0, w, drawers] of cells) {
      if (drawers) for (let k = 0; k < 3; k++) { const y = 1 + k * 7; pc.bevel(x0 + 1, y, w - 2, 6, r[4], r[1]); pc.hline(x0 + 4, x0 + w - 5, y + 2, 0x5a5e62); }
      else { pc.bevel(x0 + 1, 1, w - 2, 21, r[4], r[1]); pc.rect(x0 + w - 4, 4, 1, 5, 0x5a5e62); }
    }
    // hazard stickers
    poly(pc, [[37, 10], [41, 14], [37, 18], [33, 14]], 0xc8281e); pc.set(37, 14, 0xffffff); pc.set(37, 13, 0xffffff);
    pc.rect(4, 12, 7, 4, 0xf0d040); pc.set(7, 13, 0x1a1a1a); pc.set(7, 14, 0x1a1a1a);
    grimeBottom(pc, 0x8a8a7a, 5, 0.6, 1043);
    chips(pc, rng, 3, r[1], r[0]);
  });
  A.add('q_tank_glass', 64, 56, (pc, rng) => {
    const R = makeRamp(0x3a9a74, 6, { hueShift: 0.04, spread: 0.45 });
    pc.fillRamp(R, (x, y) => 0.75 - (y / 56) * 0.45 + (tileFbm(x, y, 64, 56, 3, 2, 1051) - 0.5) * 0.25, 0.9);
    // dark floating silhouette facing the camera (u≈0.15) and a fainter one behind
    const fig = (cx: number, c: number) => {
      pc.ellipse(cx, 10, 3.2, 3.8, c);
      pc.rect(cx - 2, 13, 4, 3, c);
      poly(pc, [[cx - 6, 16], [cx + 6, 16], [cx + 5, 32], [cx - 5, 32]], c);
      poly(pc, [[cx - 6, 16], [cx - 8, 30], [cx - 6, 31], [cx - 4, 19]], c);
      poly(pc, [[cx + 6, 16], [cx + 8, 29], [cx + 6, 30], [cx + 4, 19]], c);
      poly(pc, [[cx - 4, 32], [cx - 1, 32], [cx - 2, 46], [cx - 5, 46]], c);
      poly(pc, [[cx + 1, 32], [cx + 4, 32], [cx + 5, 44], [cx + 2, 45]], c);
    };
    fig(10, 0x10241c); fig(42, 0x1e4a38);
    pc.rect(9, 1, 2, 8, 0x1a3a2c); pc.rect(41, 1, 2, 8, 0x2a5a44);
    // bubbles
    for (let k = 0; k < 26; k++) { const x = rng.int(0, 63), y = rng.int(0, 55); pc.set(x, y, 0xb8f8d8); if (rng.chance(0.4)) { pc.set(x + 1, y, 0x8ae0b8); pc.set(x, y + 1, 0x8ae0b8); } }
    // glass highlights
    for (const x0 of [4, 20, 36, 52]) for (let y = 0; y < 56; y++) { pc.blend(x0, y, 0xe8fff4, 0.45); if (y % 3) pc.blend(x0 + 1, y, 0xe8fff4, 0.2); }
    pc.hline(0, 63, 0, 0xa0e8c8); pc.hline(0, 63, 1, 0x6ac8a0);
  });
  A.add('q_glow_green', 8, 2, (pc) => { pc.fill(0x6affb0); pc.hline(0, 7, 1, 0x3ad080); });
  A.add('q_tank_plate', 10, 4, (pc) => { pc.wrap = false; pc.fill(0xc0c4c8); pc.bevel(0, 0, 10, 4, 0xe8eaec, 0x6a6e72); scribble(pc, 1, 1, 8, 0x2a2e32, 3, 2, 2); });
  A.add('q_fume_sash', 30, 22, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a3236);
    pc.rect(1, 1, 28, 20, 0x3a4448);
    // interior: back baffle slots, a ring stand with flask, a rack
    for (let y = 3; y < 16; y += 3) pc.hline(3, 26, y, 0x2a3236);
    pc.vline(8, 8, 19, 0x8a8e92); pc.hline(6, 10, 19, 0x8a8e92); pc.hline(7, 10, 10, 0x8a8e92);
    poly(pc, [[8, 11], [11, 18], [5, 18]], 0x6ac0a0); pc.hline(6, 10, 17, 0x8ae0c0);
    pc.rect(17, 15, 8, 4, 0x8a8e92); for (let x = 18; x < 25; x += 2) pc.vline(x, 12, 15, [0xd84a3a, 0x4a8ad8, 0xe8c040][x % 3]);
    // glass reflections + label
    for (let x = 0; x < 30; x++) for (let y = 0; y < 22; y++) { const t = (x + y * 1.4) % 30; if (t < 2) pc.blend(x, y, 0xd8e8ec, 0.35); }
    pc.rect(20, 2, 8, 3, 0xf0d040); scribble(pc, 21, 3, 6, 0x2a2a2a, 1051);
    pc.rect(0, 20, 30, 2, 0xb8bcc0); pc.hline(10, 19, 20, 0x5a5e62);
  });
  A.add('q_labcab_front', 29, 64, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xd6d8d4, 5, { spread: 0.3 });
    fillNoise(pc, r, 0.55, 0.06, 3, 1061, 0.03);
    // upper glass doors with shelves of bottles
    for (const x0 of [1, 15]) {
      pc.rect(x0, 2, 13, 30, 0x2a3438); pc.strokeRect(x0, 2, 13, 30, r[1]);
      for (const sy of [11, 21, 31]) {
        pc.hline(x0 + 1, x0 + 11, sy, 0x8a9094);
        for (let i = 0; i < 5; i++) {
          const bx = x0 + 2 + i * 2, h = 3 + Math.floor(hashf(i, sy, x0) * 4);
          const c = [0x8a5a2a, 0x6ab0d0, 0xd8d0b0, 0x4a8a4a, 0xa83a3a][(i + sy + x0) % 5];
          pc.rect(bx, sy - h, 1, h, c); pc.set(bx, sy - h, 0x2a2a2a);
        }
      }
      for (let k = 0; k < 30; k += 3) pc.blend(x0 + 1 + (k % 11), 3 + k, 0xd8e8ec, 0.35);
    }
    // lower doors
    for (const x0 of [1, 15]) { pc.bevel(x0, 34, 13, 28, r[4], r[1]); }
    pc.rect(13, 44, 1, 6, 0x5a5e62); pc.rect(15, 44, 1, 6, 0x5a5e62);
    poly(pc, [[7, 38], [11, 42], [7, 46], [3, 42]], 0xc8281e); pc.set(7, 42, 0xffffff);
    pc.rect(7, 51, 16, 7, 0xf0f0e8); pc.strokeRect(7, 51, 16, 7, 0x2a5a9a); textC(pc, 'CHEM', 15, 52, 0x2a5a9a);
    grimeBottom(pc, 0x8a8a7a, 6, 0.6, 1063);
    chips(pc, rng, 3, r[1], r[0]);
  });
  A.add('q_cryo_window', 20, 40, (pc, rng) => {
    pc.wrap = false;
    const R = makeRamp(0x9ac8e0, 6, { spread: 0.4 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 20, 40, 3, 3, 1071) - 0.5) * 0.4, 0.9);
    // faint face/shoulders under the frost
    pc.ellipseBlend(10, 9, 4, 5, 0x3a5a7a, 0.7, true);
    pc.ellipseBlend(10, 22, 8, 7, 0x3a5a7a, 0.5, true);
    pc.set(8, 8, 0x2a3a5a); pc.set(12, 8, 0x2a3a5a);
    // frost crystals creeping in from the edges
    for (let k = 0; k < 14; k++) {
      let x = rng.pick([0, 19, rng.int(0, 19)]), y = rng.int(0, 39);
      for (let t = 0; t < 6; t++) { pc.set(x, y, 0xf4fcff); x += x < 10 ? 1 : -1; y += rng.int(-1, 1); }
    }
    pc.speckle(rng, [0xffffff, 0xd8f0ff], 0.04);
    pc.strokeRect(0, 0, 20, 40, 0x6a7a88);
  });
  A.add('q_cryo_panel', 12, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a2e34); pc.bevel(0, 0, 12, 10, 0x4a4e54, 0x1a1c20);
    pc.rect(1, 1, 10, 4, 0x08140c);
    pc.hline(1, 3, 3, 0x40e070); pc.set(4, 2, 0x40e070); pc.set(5, 1, 0x40e070); pc.set(6, 3, 0x40e070); pc.hline(7, 10, 3, 0x40e070);
    pc.set(2, 7, 0x40e070); pc.set(5, 7, 0xffb030); pc.set(8, 7, 0x40a0ff);
  });
  A.add('q_keycard', 5, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a2c30); pc.bevel(0, 0, 5, 7, 0x4a4c50, 0x141518);
    pc.hline(1, 3, 2, 0x050506); pc.set(2, 1, 0xff3020);
    pc.set(1, 4, 0x8a8c90); pc.set(3, 4, 0x8a8c90); pc.set(1, 5, 0x8a8c90); pc.set(3, 5, 0x8a8c90);
  });
  A.add('q_caution_sign', 30, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0c828); pc.strokeRect(0, 0, 30, 10, 0x1a1a1a);
    textC(pc, 'CAUTION', 15, 2, 0x1a1a1a);
  });

  // --- radio room
  A.add('q_radio_face', 30, 12, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x46524a, 5, { spread: 0.38 });
    fillNoise(pc, r, 0.5, 0.08, 3, 1081, 0.04);
    pc.bevel(0, 0, 30, 12, r[4], r[0]);
    pc.rect(2, 2, 16, 4, 0x14161a);
    for (const x of [4, 9, 14]) { pc.circle(x, 9, 1.6, 0x1a1a1c); pc.set(x - 1, 8, 0x8a8a8a); }
    pc.rect(20, 2, 7, 5, 0x14161a);
    for (let k = 0; k < 4; k++) pc.set(21 + k * 2, 9, k === 1 ? 0xff5030 : 0xb0b0a8);
    chips(pc, rng, 3, r[1], r[0]);
  });
  A.add('q_dial_scale', 16, 4, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0d898);
    for (let x = 1; x < 16; x += 2) pc.set(x, 0, 0x5a4020);
    for (let x = 1; x < 16; x += 4) { pc.set(x, 1, 0x5a4020); pc.set(x, 3, 0x8a6a30); }
    pc.vline(9, 0, 3, 0xd02010);
  });
  A.add('q_vu_meter', 6, 5, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0c868);
    for (let x = 0; x < 6; x++) pc.set(x, 1, x > 3 ? 0xd02010 : 0x5a4020);
    pc.line(2, 4, 4, 1, 0x1a1a1a);
  });
  A.add('q_reel', 10, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a1a1a);
    pc.circle(5, 5, 4.8, 0xb8bcc0);
    pc.circle(5, 5, 3.6, 0x5a3a24);
    pc.circle(5, 5, 1.6, 0xb8bcc0);
    pc.set(5, 5, 0x2a2a2a);
    for (const [x, y] of [[5, 2], [3, 6], [7, 6]]) pc.set(x, y, 0x1a1a1a);
  });
  A.add('q_mic_mesh', 4, 4, (pc) => { pc.each((x, y) => pc.set(x, y, (x + y) % 2 ? 0x9a9ea2 : 0x4a4e52)); });

  // --- CRTs
  A.add('q_crt_body', 16, 16, (pc, rng) => {
    const r = makeRamp(0xb8ae94, 5, { spread: 0.35 });
    fillNoise(pc, r, 0.5, 0.1, 2, 1091, 0.05);
    for (let y = 3; y < 8; y += 2) pc.hline(9, 14, y, r[1]);
    chips(pc, rng, 2, r[1], r[0]);
  });
  A.add('q_crt_static', 16, 12, (pc) => {
    crtFrame(pc, 0x7a7a7a);
    pc.each((x, y) => { const v = ph(x, y, 1101); pc.set(x, y, v < 0.3 ? 0x2a2a2e : v < 0.6 ? 0x8a8a8e : v < 0.85 ? 0xc8c8cc : 0xf0f0f4); });
    for (let x = 0; x < 16; x++) pc.blend(x, 5, 0xffffff, 0.5);
  });
  A.add('q_crt_eye', 16, 12, (pc) => {
    crtFrame(pc, 0x1a0e14);
    pc.ellipse(8, 6, 6.5, 3.2, 0xe8dcd8); pc.circle(8, 6, 2.6, 0x4a7ab8); pc.circle(8, 6, 1.3, 0x0a0a0c); pc.set(7, 5, 0xffffff);
    pc.hline(2, 13, 2, 0x3a1e24); pc.hline(3, 12, 9, 0x3a1e24);
    scan(pc, 0.3);
  });
  A.add('q_crt_blue', 16, 12, (pc) => {
    crtFrame(pc, 0x1838c8);
    text(pc, 'AV1', 1, 1, 0xe8f0ff);
    pc.rect(6, 7, 4, 3, 0xe8f0ff);
    scan(pc, 0.15);
  });
  A.add('q_crt_hall', 16, 12, (pc) => {
    crtFrame(pc, 0xc8b462);
    poly(pc, [[0, 0], [6, 4], [6, 8], [0, 12]], 0xa8964a); poly(pc, [[16, 0], [10, 4], [10, 8], [16, 12]], 0xb8a456);
    pc.rect(6, 4, 4, 4, 0x2a2410); pc.rect(0, 0, 16, 2, 0xe8e4c8); poly(pc, [[0, 12], [6, 8], [10, 8], [16, 12]], 0x8a7a3a);
    pc.rect(7, 5, 1, 3, 0x0a0a08);
    scan(pc, 0.25);
  });
  A.add('q_crt_text', 16, 12, (pc) => {
    crtFrame(pc, 0x0a0a0a);
    text(pc, 'WAKE', 1, 0, 0xe8e8e8); text(pc, 'UP', 1, 6, 0xd02020);
    scan(pc, 0.3);
  });
  A.add('q_crt_bars', 16, 12, (pc) => {
    crtFrame(pc, 0x000000);
    const bars = [0xc0c0c0, 0xc0c000, 0x00c0c0, 0x00c000, 0xc000c0, 0xc00000, 0x0000c0, 0x101010];
    pc.each((x, y) => pc.set(x, y, y < 9 ? bars[Math.floor(x / 2)] : (x < 4 ? 0x0a1a6a : x < 8 ? 0xe8e8e8 : 0x2a0a5a)));
  });
  A.add('q_crt_face', 16, 12, (pc) => {
    crtFrame(pc, 0x101418);
    pc.set(5, 3, 0xf0f0f0); pc.set(10, 3, 0xf0f0f0); pc.set(5, 4, 0xf0f0f0); pc.set(10, 4, 0xf0f0f0);
    pc.set(3, 7, 0xf0f0f0); pc.hline(4, 11, 8, 0xf0f0f0); pc.set(12, 7, 0xf0f0f0);
    scan(pc, 0.3);
  });
  A.add('q_crt_radar', 16, 12, (pc) => {
    crtFrame(pc, 0x041008);
    pc.circle(8, 6, 5.5, 0x0e3a1a); pc.circle(8, 6, 4.5, 0x041008); pc.circle(8, 6, 2.5, 0x0e3a1a); pc.circle(8, 6, 1.5, 0x041008);
    pc.line(8, 6, 13, 3, 0x6af08a); pc.set(5, 4, 0xf0f060);
  });

  // --- tape mainframe
  A.add('q_mainframe_front', 29, 58, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x8a9aa4, 5, { spread: 0.35 });
    fillNoise(pc, r, 0.55, 0.06, 3, 1111, 0.03);
    pc.bevel(0, 0, 29, 58, r[4], r[0]);
    pc.rect(2, 3, 25, 26, 0x1a1e22); pc.strokeRect(2, 3, 25, 26, r[1]);
    pc.rect(11, 18, 7, 9, 0x2a3036); pc.rect(12, 19, 2, 7, 0x0a0c0e); pc.rect(15, 19, 2, 7, 0x0a0c0e);
    pc.rect(2, 31, 25, 4, 0x14161a);
    for (let y = 38; y < 54; y += 2) pc.hline(3, 25, y, r[1]);
    pc.rect(3, 54, 10, 3, 0xe8e6de); scribble(pc, 4, 55, 8, 0x3a3a3e, 1113);
    chips(pc, rng, 3, r[1], r[0]);
  });
  A.add('q_lamp_strip', 16, 3, (pc) => {
    pc.wrap = false;
    pc.fill(0x0a0a0a);
    const c = [0xff4030, 0xffb030, 0x50ff70, 0xf0f0e0];
    for (let x = 1; x < 16; x += 2) for (let y = 0; y < 3; y += 2) if (hashf(x, y, 1121) < 0.7) pc.set(x, y, c[(x + y) % 4]);
  });
});

// ---------------------------------------------------------------------------
// objects
// ---------------------------------------------------------------------------
function crt(mb: ModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, screen: string, rot = 0, emis = 1.0) {
  mb.push(); mb.translate(x, y, z); if (rot) mb.rotateY(rot);
  mb.box(0, 0, 0, w, h, d * 0.55, { sides: 'q_crt_body', top: 'q_crt_body' }, { skip: ['bottom'] });
  mb.box(0, h * 0.12, -d * 0.45, w * 0.75, h * 0.75, d * 0.45, 'q_crt_body', { skip: ['bottom'] });
  mb.box(0, h * 0.14, d * 0.276, w * 0.78, h * 0.74, 0.01, screen, { fit: true, emissive: emis });
  mb.pop();
}

defObj({
  key: 'server_rack', name: 'Server Rack', w: 1, d: 1, height: 2.05, block: 'solid', blocksSight: true, tall: true,
  container: { capacity: 25, kind: 'cabinet', loot: 'server_room', lockable: true },
  power: true, hum: 'server', sound: 'metal',
  disassemble: { tools: ['#screwdriver'], time: 45, skill: 'electrical', yields: [['electronics_scrap', 3, 6], ['wire', 2, 5], ['sheet_metal', 1, 3], ['screws', 4, 10]] },
  desc: 'A rack of humming servers. Their lights blink in a pattern that repeats every 7 seconds.',
  tags: [...T, 'server'],
  model: (mb) => {
    mb.box(0, 0.03, -0.02, 0.62, 1.98, 0.92, { south: 'q_server_front', north: 'q_server_side', sides: 'q_server_side', top: 'q_server_side' }, { fit: { south: true } });
    for (const x of [-0.27, 0.27]) for (const z of [-0.4, 0.36]) mb.box(x, 0, z, 0.05, 0.03, 0.05, 'metal_dark');
    for (const [x, e] of [[-0.205, 1.3], [-0.02, 1.1], [0.16, 1.25]] as [number, number][]) mb.box(x, 0.18, 0.443, 0.02, 1.7, 0.004, 'q_led_strip', { emissive: e });
    mb.box(0.27, 0.95, 0.45, 0.02, 0.18, 0.02, 'metal_grey');
    // cable bundles up into the ceiling tray
    const cc = ['plastic_blue', 'plastic_yellow', 'plastic_black', 'plastic_red'];
    cc.forEach((t, i) => mb.cylinder(-0.18 + i * 0.1, 2.01, -0.35, 0.025, 0.69, 5, t, { caps: false }));
    mb.box(0, 2.01, -0.35, 0.5, 0.04, 0.12, 'metal_dark');
  },
});

defObj({
  key: 'terminal_lab', name: 'Lab Terminal', w: 1, d: 1, height: 1.2, block: 'solid',
  power: true, sound: 'plastic',
  light: { color: 0x7affa0, intensity: 0.35, radius: 2.5, y: 1.0, kind: 'screen', power: true },
  disassemble: { tools: ['#screwdriver'], time: 30, skill: 'electrical', yields: [['electronics_scrap', 2, 5], ['wire', 1, 3], ['glass_shard', 1, 2]] },
  desc: 'A green-screen terminal, logged in. The cursor has been blinking since before you arrived.',
  tags: [...T, 'terminal'],
  model: (mb) => {
    const zc = -0.08;
    mb.box(0, 0, zc, 0.92, 0.7, 0.62, { sides: 'q_steel_cream', top: 'q_steel_cream' }, { skip: ['bottom'] });
    mb.box(0, 0.12, zc + 0.311, 0.5, 0.4, 0.01, 'q_grille', { fit: true });
    mb.box(0, 0.7, zc, 0.96, 0.04, 0.66, 'q_epoxy_top');
    // CRT monitor
    mb.box(-0.05, 0.74, zc - 0.05, 0.46, 0.4, 0.3, { sides: 'q_term_body', top: 'q_term_body' });
    mb.box(-0.05, 0.78, zc - 0.28, 0.34, 0.3, 0.18, 'q_term_body');
    mb.box(-0.05, 0.81, zc + 0.101, 0.36, 0.27, 0.01, 'q_term_screen', { fit: true, emissive: 1.1 });
    mb.box(-0.05, 0.74, zc + 0.12, 0.42, 0.02, 0.06, 'q_term_body');
    // keyboard
    mb.push(); mb.translate(-0.05, 0.74, zc + 0.22); mb.rotateX(0.08);
    mb.box(0, 0, 0, 0.46, 0.03, 0.15, { top: 'q_keyboard', sides: 'q_term_body' }, { fit: { top: true } });
    mb.pop();
    // side box of switches + a mug
    mb.box(0.36, 0.74, zc - 0.05, 0.18, 0.22, 0.26, { sides: 'q_steel_dark', top: 'q_steel_dark' });
    for (let i = 0; i < 3; i++) mb.box(0.36, 0.8 + i * 0.05, zc + 0.085, 0.03, 0.02, 0.02, i === 0 ? 'led_green' : 'plastic_white', { emissive: i === 0 ? 1.2 : 0 });
    mb.cylinder(0.33, 0.74, zc + 0.2, 0.04, 0.09, 7, 'porcelain', { color: 0xe8d8c0 });
  },
});

defObj({
  key: 'lab_bench', name: 'Lab Bench', w: 2, d: 1, height: 1.6, block: 'table', surface: 0.9,
  container: { capacity: 30, kind: 'counter', loot: 'lab_bench' },
  sound: 'ceramic',
  desc: 'A black-topped lab bench. The microscope slide is labelled with today\'s date, next year.',
  tags: [...T],
  model: (mb) => {
    const zc = -0.08;
    mb.box(0, 0, zc, 1.9, 0.85, 0.68, { south: 'q_lab_cab_front', sides: 'q_steel_cream', top: 'q_steel_cream' }, { fit: { south: true }, skip: ['bottom'] });
    mb.box(0, 0.85, zc, 1.98, 0.05, 0.76, 'q_epoxy_top');
    // reagent shelf
    for (const x of [-0.92, 0.92]) mb.box(x, 0.9, zc - 0.3, 0.04, 0.69, 0.04, 'metal_brushed');
    mb.box(0, 1.3, zc - 0.28, 1.88, 0.025, 0.2, 'q_steel_cream');
    mb.box(0, 1.57, zc - 0.3, 1.88, 0.02, 0.04, 'metal_brushed');
    const bottle = (x: number, h: number, c: number, amber = false) => {
      mb.cylinder(x, 1.325, zc - 0.28, 0.035, h, 6, amber ? 'glass_dark' : 'glass', { color: c });
      mb.cylinder(x, 1.325 + h, zc - 0.28, 0.018, 0.04, 5, 'plastic_black');
    };
    bottle(-0.8, 0.16, 0x8a5a2a, true); bottle(-0.7, 0.12, 0xd0e8f0); bottle(-0.6, 0.18, 0x8a5a2a, true); bottle(-0.3, 0.14, 0xd0f0d0);
    bottle(0.1, 0.16, 0xffffff); bottle(0.4, 0.12, 0x8a5a2a, true); bottle(0.55, 0.15, 0xf0d0f0); bottle(0.75, 0.13, 0xd0e8f0);
    const y0 = 0.9;
    // microscope
    mb.box(-0.6, y0, zc + 0.05, 0.18, 0.04, 0.22, 'plastic_black');
    mb.box(-0.6, y0 + 0.04, zc - 0.03, 0.06, 0.28, 0.06, 'plastic_white');
    mb.box(-0.6, y0 + 0.15, zc + 0.07, 0.14, 0.02, 0.12, 'plastic_black');
    mb.push(); mb.translate(-0.6, y0 + 0.28, zc + 0.02); mb.rotateX(-0.5);
    mb.cylinder(0, 0, 0, 0.025, 0.16, 6, 'plastic_white');
    mb.pop();
    mb.cylinder(-0.6, y0 + 0.2, zc + 0.08, 0.02, 0.06, 6, 'chrome');
    // test tube rack
    mb.box(-0.15, y0, zc + 0.1, 0.24, 0.07, 0.07, 'plastic_white');
    [0xd84a3a, 0x4ad87a, 0x4a8ad8, 0xe8c040, 0xd84a3a].forEach((c, i) => mb.cylinder(-0.24 + i * 0.045, y0 + 0.02, zc + 0.1, 0.012, 0.13, 5, 'glass', { color: c, emissive: 0.25 }));
    // flasks
    mb.cylinder(0.2, y0, zc + 0.05, 0.08, 0.13, 8, 'glass', { rTop: 0.025, color: 0x8af0b0, emissive: 0.35 });
    mb.cylinder(0.2, y0 + 0.13, zc + 0.05, 0.022, 0.07, 6, 'glass');
    mb.sphere(0.42, y0 + 0.08, zc - 0.05, 0.08, 7, 5, 'glass', { color: 0xb08af0, emissive: 0.3 });
    mb.cylinder(0.42, y0 + 0.15, zc - 0.05, 0.02, 0.1, 6, 'glass');
    mb.cylinder(0.62, y0, zc + 0.12, 0.05, 0.12, 8, 'glass', { color: 0x9ad8ff, emissive: 0.2 });
    // notebook
    mb.box(0.75, y0, zc - 0.02, 0.22, 0.012, 0.28, 'paper', { color: 0xf0ecd8 });
    mb.box(0.68, y0, zc - 0.02, 0.06, 0.014, 0.28, 'leather_brown');
  },
});

defObj({
  key: 'specimen_tank', name: 'Specimen Tank', w: 1, d: 1, height: 2.6, block: 'solid', tall: true,
  power: true, sound: 'glass', hum: 'machine',
  light: { color: 0x6affb0, intensity: 0.4, radius: 3, y: 1.2, kind: 'screen', power: true },
  desc: 'A glass cylinder of green fluid. Something curled inside turns, slowly, to face you.',
  tags: [...T, 'specimen', 'creepy'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.48, 0.28, 12, { sides: 'q_steel_dark', top: 'q_steel_dark' });
    mb.cylinder(0, 0.27, 0, 0.485, 0.035, 12, 'q_glow_green', { caps: false, emissive: 1.3 });
    mb.cylinder(0, 0.3, 0, 0.42, 1.76, 14, 'q_tank_glass', { fit: true, caps: false, emissive: 0.55 });
    mb.cylinder(0, 2.04, 0, 0.47, 0.22, 12, { sides: 'q_steel_dark', top: 'q_steel_dark' });
    mb.cylinder(0, 2.26, 0, 0.36, 0.1, 12, 'q_steel_dark', { rTop: 0.2 });
    for (const [x, z, t] of [[0.12, -0.1, 'plastic_black'], [-0.12, -0.05, 'q_pipe_paint'], [0.0, 0.14, 'plastic_black']] as [number, number, string][]) mb.cylinder(x, 2.36, z, 0.035, 0.34, 6, t, { caps: false });
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; mb.box(Math.cos(a) * 0.44, 0.3, Math.sin(a) * 0.44, 0.04, 1.76, 0.04, 'metal_dark'); }
    mb.box(0, 0.08, 0.48, 0.28, 0.1, 0.01, 'q_tank_plate', { fit: true });
    rod(mb, 0.3, 0.12, -0.36, 0.55, 0.05, -0.55, 0.04, 6, 'q_pipe_paint');
  },
});

defObj({
  key: 'fume_hood', name: 'Fume Hood', w: 1, d: 1, height: 2.7, block: 'solid', blocksSight: true, tall: true,
  power: true, hum: 'machine', sound: 'metal',
  desc: 'A fume hood with the sash half-open. The fan pulls air in, and with it, whispers.',
  tags: [...T],
  model: (mb) => {
    const zc = -0.1;
    mb.box(0, 0, zc, 0.96, 0.84, 0.74, { sides: 'q_steel_cream', top: 'q_steel_cream', south: 'q_lab_cab_front' }, { fit: { south: true }, skip: ['bottom'] });
    mb.box(0, 0.84, zc, 0.98, 0.05, 0.76, 'q_epoxy_top');
    // hood body
    for (const x of [-0.45, 0.45]) mb.box(x, 0.89, zc, 0.06, 1.2, 0.74, 'q_steel_cream');
    mb.box(0, 0.89, zc - 0.34, 0.86, 1.2, 0.06, 'q_steel_cream');
    mb.box(0, 1.6, zc + 0.03, 0.96, 0.49, 0.68, { sides: 'q_steel_cream', top: 'q_steel_cream' });
    mb.box(0, 0.98, zc + 0.33, 0.86, 0.66, 0.02, 'q_fume_sash', { fit: true });
    mb.box(0, 1.62, zc + 0.375, 0.8, 0.03, 0.03, 'metal_brushed');
    mb.box(0.32, 1.78, zc + 0.375, 0.16, 0.1, 0.01, 'q_term_screen', { fit: true, emissive: 0.9 });
    // exhaust duct
    mb.cylinder(0, 2.09, zc - 0.05, 0.16, 0.61, 8, 'metal_brushed', { caps: false });
    mb.cylinder(0, 2.09, zc - 0.05, 0.19, 0.05, 8, 'metal_dark');
  },
});

defObj({
  key: 'centrifuge', name: 'Centrifuge', w: 1, d: 1, height: 0.3, block: 'none',
  movable: 12, power: true, sound: 'plastic',
  disassemble: { tools: ['#screwdriver'], time: 20, skill: 'electrical', yields: [['electronics_scrap', 1, 3], ['wire', 1, 2], ['scrap_metal', 1, 2]] },
  desc: 'A benchtop centrifuge, lid locked. The display counts down from a number that keeps rising.',
  tags: [...T, 'surface_item'],
  model: (mb) => {
    for (const x of [-0.16, 0.16]) for (const z of [-0.15, 0.15]) mb.cylinder(x, 0, z, 0.02, 0.015, 5, 'rubber_black');
    mb.box(0, 0.015, 0, 0.4, 0.17, 0.42, { sides: 'plastic_white', top: 'plastic_white' });
    mb.cylinder(0, 0.185, -0.03, 0.17, 0.04, 12, 'plastic_white', { rTop: 0.15 });
    discY(mb, 0, 0.226, -0.03, 0.12, 12, 'glass_dark');
    mb.wedge(0, 0.015, 0.18, 0.4, 0.08, 0.17, 0.1, { top: 'q_cryo_panel', sides: 'plastic_white' });
    mb.box(-0.08, 0.125, 0.205, 0.12, 0.035, 0.01, 'q_pay_screen', { fit: true, emissive: 0.9, color: 0xc0ffd0 });
  },
});

defObj({
  key: 'lab_cabinet', name: 'Chemical Cabinet', w: 1, d: 1, height: 2.0, block: 'solid', blocksSight: true, tall: true,
  container: { capacity: 30, kind: 'cabinet', loot: 'lab_cabinet', lockable: true },
  sound: 'glass',
  desc: 'Glass-fronted shelves of labelled bottles. Some labels have been rewritten in the same handwriting as yours.',
  tags: [...T, 'storage'],
  model: (mb) => {
    const zc = -0.25;
    mb.box(0, 0, zc, 0.92, 1.96, 0.48, { south: 'q_labcab_front', sides: 'q_steel_cream', top: 'q_steel_cream' }, { fit: { south: true }, skip: ['bottom'] });
    for (const x of [-0.04, 0.04]) mb.box(x, 1.0, zc + 0.245, 0.02, 0.14, 0.02, 'metal_brushed');
    mb.box(-0.2, 1.96, zc, 0.3, 0.16, 0.3, { sides: 'q_cardboard_b', top: 'q_cardboard_top' }, { fit: true });
    mb.cylinder(0.25, 1.96, zc + 0.05, 0.06, 0.2, 7, 'glass_dark', { color: 0x8a6a4a });
  },
});

defObj({
  key: 'cryo_pod', name: 'Cryo Pod', w: 1, d: 2, height: 1.25, block: 'solid',
  power: true, hum: 'machine', sound: 'metal',
  light: { color: 0x9ad8ff, intensity: 0.3, radius: 2.5, y: 0.9, kind: 'screen', power: true },
  desc: 'A sealed sleeper pod, frosted from the inside. The occupant\'s breath fogs the glass, very slowly.',
  tags: [...T, 'cryo', 'creepy'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.86, 0.32, 1.9, { sides: 'q_steel_dark', top: 'q_steel_dark' });
    for (const s of [-1, 1]) mb.box(s * 0.433, 0.06, 0, 0.006, 0.03, 1.7, 'q_tube_light', { emissive: 1.2, color: 0x9ad8ff });
    mb.box(0, 0.32, 0, 0.76, 0.38, 1.82, { sides: 'plastic_white', top: 'plastic_white' });
    mb.cylinderZ(0, 0.7, 0, 0.38, 1.82, 12, 'plastic_white', { caps: true });
    mb.box(0, 1.03, -0.12, 0.46, 0.06, 1.28, { top: 'q_cryo_window', sides: 'metal_brushed' }, { fit: { top: true } });
    // foot console
    mb.wedge(0, 0.32, 0.86, 0.6, 0.18, 0.5, 0.32, { top: 'q_cryo_panel', sides: 'plastic_white' });
    // hoses at the head end
    for (const x of [-0.2, 0.2]) {
      rod(mb, x, 0.8, -0.91, x * 1.5, 0.5, -0.98, 0.035, 6, 'plastic_black');
      rod(mb, x * 1.5, 0.5, -0.98, x * 1.7, 0.0, -0.98, 0.035, 6, 'plastic_black');
    }
    mb.box(0, 0.75, -0.92, 0.3, 0.2, 0.05, 'q_grille_dark', { fit: true });
  },
});

defObj({
  key: 'keycard_reader', name: 'Keycard Reader', w: 1, d: 1, height: 1.4, block: 'none', onWall: true,
  power: true, sound: 'plastic',
  desc: 'A card reader with a red light. It is waiting for a card with your name on it.',
  tags: [...T, 'mission', 'security'],
  model: (mb) => {
    // wall face is at z = -0.44: mount everything just in front of it
    mb.box(0.3, 1.06, -0.42, 0.13, 0.2, 0.04, { south: 'q_keycard', sides: 'metal_dark', top: 'metal_dark' }, { fit: { south: true } });
    mb.box(0.3, 1.21, -0.397, 0.03, 0.02, 0.01, 'led_red', { emissive: 1.5 });
    mb.box(0.3, 0.95, -0.435, 0.18, 0.06, 0.01, 'q_tank_plate', { fit: true });
    rod(mb, 0.3, 1.26, -0.43, 0.3, 2.7, -0.43, 0.012, 4, 'metal_grey');
  },
});

defObj({
  key: 'hazard_barrier', name: 'Hazard Barricade', w: 1, d: 1, height: 1.05, block: 'low',
  movable: 8, sound: 'plastic',
  desc: 'CAUTION. Beyond it the floor looks exactly the same.',
  tags: [...T, 'barrier', 'industrial'],
  model: (mb) => {
    for (const x of [-0.42, 0.42]) {
      rod(mb, x, 1.0, 0, x, 0, 0.22, 0.025, 4, 'q_paint_yellow');
      rod(mb, x, 1.0, 0, x, 0, -0.22, 0.025, 4, 'q_paint_yellow');
      mb.box(x, 0.98, 0, 0.06, 0.05, 0.06, 'plastic_black');
    }
    mb.box(0, 0.78, 0.04, 0.96, 0.18, 0.025, 'q_hazard');
    mb.box(0, 0.36, 0.13, 0.96, 0.14, 0.02, 'q_hazard');
    mb.box(0, 0.78, -0.04, 0.96, 0.18, 0.025, 'q_hazard');
    mb.box(0, 0.5, 0.11, 0.94, 0.26, 0.012, 'q_caution_sign', { fit: true });
  },
});

defObj({
  key: 'radio_console', name: 'Radio Desk', w: 2, d: 1, height: 1.55, block: 'table', surface: 0.76,
  power: true, sound: 'metal', hum: 'machine',
  light: { color: 0xffc070, intensity: 0.3, radius: 2.5, y: 1.0, kind: 'screen', power: true },
  desc: 'Receivers, a tape deck and a microphone. On one frequency someone reads out coordinates, endlessly.',
  tags: [...T, 'radio', 'mission'],
  model: (mb) => {
    const zc = -0.08;
    // desk
    mb.box(0, 0.72, zc, 1.96, 0.04, 0.72, 'wood_dark');
    mb.box(-0.72, 0, zc, 0.5, 0.72, 0.68, { sides: 'q_steel_grey', south: 'q_drawer_metal' }, { fit: { south: true }, skip: ['bottom'] });
    for (const z of [zc - 0.3, zc + 0.3]) mb.box(0.92, 0, z, 0.05, 0.72, 0.05, 'metal_dark');
    // receiver stack
    mb.box(-0.48, 0.76, zc - 0.12, 0.92, 0.36, 0.42, { south: 'q_radio_face', sides: 'q_steel_green', top: 'q_steel_green' }, { fit: { south: true } });
    mb.box(-0.69, 0.98, zc + 0.095, 0.48, 0.1, 0.01, 'q_dial_scale', { fit: true, emissive: 1.1 });
    for (const x of [-0.78, -0.62, -0.46]) { mb.cylinderZ(x, 0.83, zc + 0.11, 0.035, 0.04, 8, 'plastic_black'); }
    mb.box(-0.48, 1.12, zc - 0.15, 0.8, 0.22, 0.36, { sides: 'q_steel_dark', top: 'q_grille_dark' });
    for (const x of [-0.7, -0.5]) mb.box(x, 1.17, zc + 0.031, 0.15, 0.12, 0.01, 'q_vu_meter', { fit: true, emissive: 1.0 });
    for (const x of [-0.3, -0.18]) mb.cylinderZ(x, 1.2, zc + 0.04, 0.03, 0.03, 8, 'metal_brushed');
    // reel-to-reel deck (upright)
    mb.box(0.45, 0.76, zc - 0.2, 0.62, 0.66, 0.2, { south: 'q_steel_grey', sides: 'q_steel_grey', top: 'q_steel_dark' });
    for (const x of [0.3, 0.6]) {
      mb.cylinderZ(x, 1.22, zc - 0.07, 0.13, 0.03, 12, 'metal_brushed');
      disc(mb, x, 1.22, zc - 0.054, 0.13, 12, 'q_reel');
    }
    mb.box(0.45, 0.86, zc - 0.095, 0.5, 0.1, 0.01, 'q_lamp_strip', { fit: true, emissive: 0.9 });
    // microphone, headphones, log
    mb.cylinder(0.1, 0.76, zc + 0.15, 0.07, 0.02, 8, 'metal_dark');
    rod(mb, 0.1, 0.78, zc + 0.15, 0.08, 1.02, zc + 0.12, 0.01, 4, 'chrome');
    mb.cylinder(0.08, 1.02, zc + 0.12, 0.03, 0.09, 8, 'q_mic_mesh');
    torus(mb, -0.15, 0.78, zc + 0.22, 0.08, 0.012, 8, 3, 'plastic_black');
    for (const x of [-0.23, -0.07]) mb.cylinder(x, 0.76, zc + 0.22, 0.04, 0.03, 7, 'leather_brown', { color: 0x5a5a5a });
    mb.box(0.65, 0.76, zc + 0.18, 0.24, 0.012, 0.3, 'paper', { color: 0xf0ecd8 });
    // antenna lead
    rod(mb, 0.85, 1.42, zc - 0.25, 0.9, 2.7, zc - 0.35, 0.012, 4, 'plastic_black');
  },
});

defObj({
  key: 'antenna_mast', name: 'Antenna Mast', w: 1, d: 1, height: 5.6, block: 'solid', tall: true,
  sound: 'metal', hp: 2500,
  desc: 'A lattice mast tipped with a red light. It is tuned to a station that only broadcasts silence.',
  tags: [...T, 'antenna', 'outdoor'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.7, 0.12, 0.7, 'concrete', { skip: ['bottom'] });
    const H = 4.9, lv = 6;
    const half = (y: number) => 0.2 - (y / H) * 0.08;
    for (let i = 0; i < lv; i++) {
      const y0 = 0.12 + (i / lv) * (H - 0.12), y1 = 0.12 + ((i + 1) / lv) * (H - 0.12);
      const a = half(y0), b = half(y1);
      const tex = i % 2 ? 'q_paint_white' : 'q_paint_red';
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(mb, sx * a, y0, sz * a, sx * b, y1, sz * b, 0.016, 4, tex, { skip: ['top', 'bottom'] });
      // ring + diagonals
      for (const [p, q] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as number[][][]) {
        rod(mb, p[0] * b, y1, p[1] * b, q[0] * b, y1, q[1] * b, 0.01, 4, 'metal_grey', { skip: ['top', 'bottom'] });
        rod(mb, p[0] * a, y0, p[1] * a, q[0] * b, y1, q[1] * b, 0.008, 4, 'metal_grey', { skip: ['top', 'bottom'] });
      }
    }
    // mast top: whip, dipoles and aviation light
    rod(mb, 0, H, 0, 0, H + 0.6, 0, 0.02, 6, 'metal_grey');
    for (const y of [H + 0.15, H + 0.35]) rod(mb, -0.35, y, 0, 0.35, y, 0, 0.01, 4, 'metal_grey');
    mb.sphere(0, H + 0.62, 0, 0.05, 6, 4, 'led_red', { emissive: 1.6 });
    // guy wires to the tile corners
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) rod(mb, 0, 2.6, 0, sx * 0.48, 0.12, sz * 0.48, 0.004, 4, 'metal_grey');
    mb.box(0.18, 0.12, 0.24, 0.24, 0.3, 0.14, { sides: 'q_steel_grey', top: 'q_steel_grey' });
  },
});

defObj({
  key: 'crt_bank', name: 'Wall of Televisions', w: 2, d: 1, height: 2.0, block: 'solid', blocksSight: true, tall: true,
  power: true, sound: 'glass', hum: 'fluoro',
  light: { color: 0x9ab8ff, intensity: 0.45, radius: 3.5, y: 1.2, kind: 'screen', power: true },
  disassemble: { tools: ['#screwdriver'], time: 60, skill: 'electrical', yields: [['electronics_scrap', 4, 8], ['wire', 2, 5], ['glass_shard', 2, 5]] },
  desc: 'Stacked televisions, all tuned to different channels of the same room.',
  tags: [...T, 'screens', 'dream'],
  model: (mb) => {
    const zc = -0.15;
    for (const x of [-0.94, 0.94]) mb.box(x, 0, zc, 0.04, 1.95, 0.55, 'metal_dark');
    for (const y of [0.05, 0.68, 1.3]) mb.box(0, y, zc, 1.9, 0.03, 0.55, 'metal_dark');
    crt(mb, -0.6, 0.08, zc, 0.62, 0.55, 0.5, 'q_crt_static');
    crt(mb, 0.05, 0.08, zc, 0.55, 0.48, 0.45, 'q_crt_hall', 0.05);
    crt(mb, 0.62, 0.08, zc, 0.5, 0.45, 0.45, 'q_crt_blue', -0.06);
    crt(mb, -0.62, 0.71, zc, 0.5, 0.45, 0.45, 'q_crt_eye', 0.08);
    crt(mb, -0.05, 0.71, zc, 0.6, 0.55, 0.5, 'q_crt_text');
    crt(mb, 0.6, 0.71, zc, 0.5, 0.42, 0.42, 'q_crt_bars');
    crt(mb, -0.55, 1.33, zc, 0.55, 0.48, 0.45, 'q_crt_radar', -0.05);
    crt(mb, 0.05, 1.33, zc, 0.45, 0.4, 0.4, 'q_crt_face', 0.1);
    crt(mb, 0.6, 1.33, zc, 0.5, 0.45, 0.42, 'q_crt_static', -0.08);
    // rabbit ears on top + dangling cables
    rod(mb, 0.05, 1.73, zc - 0.05, -0.15, 2.0, zc - 0.1, 0.006, 4, 'chrome');
    rod(mb, 0.05, 1.73, zc - 0.05, 0.28, 1.98, zc - 0.05, 0.006, 4, 'chrome');
    for (const x of [-0.3, 0.3, 0.8]) rod(mb, x, 0.68, zc + 0.27, x + 0.05, 0.02, zc + 0.35, 0.008, 4, 'plastic_black');
  },
});

defObj({
  key: 'tape_mainframe', name: 'Tape Mainframe', w: 2, d: 1, height: 1.95, block: 'solid', blocksSight: true, tall: true,
  power: true, hum: 'server', sound: 'metal',
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 70, skill: 'electrical', yields: [['electronics_scrap', 4, 8], ['wire', 3, 6], ['sheet_metal', 2, 4]] },
  desc: 'Reel-to-reel tape drives that still spin up when you walk past, storing something about you.',
  tags: [...T, 'server', 'computer'],
  model: (mb) => {
    const zc = -0.14;
    for (const x of [-0.48, 0.48]) {
      mb.box(x, 0, zc, 0.92, 1.85, 0.68, { south: 'q_mainframe_front', sides: 'q_steel_blue', top: 'q_steel_blue' }, { fit: { south: true }, skip: ['bottom'] });
      for (const [dx, dy] of [[-0.18, 1.5], [0.18, 1.5]]) {
        mb.cylinderZ(x + dx, dy, zc + 0.36, 0.17, 0.04, 12, 'metal_brushed');
        disc(mb, x + dx, dy, zc + 0.381, 0.17, 12, 'q_reel');
      }
      mb.box(x, 0.86, zc + 0.342, 0.76, 0.1, 0.01, 'q_lamp_strip', { fit: true, emissive: 1.0 });
    }
    mb.box(0, 1.85, zc, 1.9, 0.05, 0.7, 'q_steel_dark');
    for (let i = 0; i < 3; i++) mb.cylinder(-0.4 + i * 0.4, 1.9, zc - 0.25, 0.04, 0.8, 6, 'plastic_black', { caps: false });
  },
});
