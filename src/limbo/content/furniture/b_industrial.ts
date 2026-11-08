// Furniture B — industrial / maintenance / storage props: shelving, benches,
// machinery, boilers, electrical gear, vents, drums, pallets, dumpsters and the
// pool-pump mission machinery.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { PixelCanvas } from '../../gfx/pixel';
import {
  makeRamp, mixHex, scaleHex, bayer, ph, tileFbm, hashf, text, textC, scribble, fillNoise, rectNoise, rust, chips, stripes,
  grimeBottom, rivet, screw, seamH, seamV, gauge, grille, glow, woodFill, poly, rod, torus, flipY, mirroredStamp, disc, discY, dial,
} from './b_common';

const T = ['setB', 'industrial'];

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------
addTextureModule(() => {
  const A = atlas();

  // --- shelving
  A.add('q_rack_post', 4, 16, (pc) => {
    const r = makeRamp(0x3d6fa8, 5, { spread: 0.45 });
    pc.each((x, y) => pc.set(x, y, x === 0 ? r[4] : x === 3 ? r[0] : r[2 + ((y * 7 + x) % 5 === 0 ? 1 : 0)]));
    for (let y = 1; y < 16; y += 4) { pc.set(1, y, 0x101216); pc.set(1, y + 1, 0x101216); pc.set(2, y + 1, r[1]); }
  });
  A.add('q_rack_beam', 16, 4, (pc) => {
    const r = makeRamp(0xd8742a, 5, { spread: 0.4 });
    pc.each((x, y) => pc.set(x, y, y === 0 ? r[4] : y === 3 ? r[0] : r[2 + (ph(x, y, 3) < 0.2 ? 1 : 0)]));
    pc.set(1, 1, 0xd0d0d0); pc.set(1, 2, 0x404040); pc.set(14, 1, 0xd0d0d0); pc.set(14, 2, 0x404040);
    pc.set(7, 2, 0x6a5040); pc.set(9, 1, 0x8a5a30);
  });
  A.add('q_rack_deck', 32, 32, (pc, rng) => {
    const r = makeRamp(0xb69a6c, 6, { spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.5 + (ph(x, y, 11) - 0.5) * 0.45 + (tileFbm(x, y, 32, 32, 2, 2, 12) - 0.5) * 0.2, 1);
    pc.speckle(rng, [r[5], 0xd8c49a], 0.04);
    pc.speckle(rng, [r[0]], 0.03);
    pc.stain(rng.int(4, 28), rng.int(4, 28), 4, 0x8a6e48, 0x6a5234, 3);
    pc.stain(rng.int(4, 28), rng.int(4, 28), 3, 0x7a6448, 0x5e4a30, 5);
  });
  A.add('q_paint_can', 18, 6, (pc) => {
    pc.wrap = false;
    const m = makeRamp(0x9a9c9e, 4);
    pc.each((x, y) => pc.set(x, y, m[1 + (x % 6 === 0 ? 0 : 1) + (y === 0 ? 1 : 0)]));
    pc.rect(0, 1, 18, 4, 0xe6dec4);
    pc.rect(1, 2, 7, 2, 0x3f7fc0); pc.rect(10, 2, 3, 1, 0x5a5a5a); pc.rect(10, 3, 5, 1, 0x8a8a8a);
    pc.set(4, 1, 0x3f7fc0); pc.set(4, 0, 0x3f7fc0); pc.set(13, 1, 0x3f7fc0);
  });
  A.add('q_paint_can_top', 6, 6, (pc) => {
    pc.wrap = false; pc.fill(0x7a7c80);
    pc.circle(3, 3, 2.6, 0xa8aaae); pc.circle(3, 3, 1.6, 0x8a8c90); pc.set(2, 2, 0xd0d2d4); pc.set(4, 4, 0x3f7fc0);
  });

  // --- workbench
  A.add('q_bench_top', 32, 32, (pc, rng) => {
    const r = makeRamp(0xa77a4c, 6, { spread: 0.45 });
    woodFill(pc, r, 201, 4, false, false);
    for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x++) pc.blend(x, y, r[0], 0.55);
    // oil stains, burns and cut marks
    pc.stain(rng.int(4, 27), rng.int(4, 27), 5, 0x4e3a28, 0x3a2a1c, 2);
    pc.stain(rng.int(4, 27), rng.int(4, 27), 3, 0x30302a, 0x24221e, 7);
    for (let k = 0; k < 6; k++) { const x = rng.int(0, 31), y = rng.int(0, 31), l = rng.int(3, 7); for (let i = 0; i < l; i++) pc.set(x + i, y + Math.floor(i / 3), r[1]); }
    pc.set(rng.int(0, 31), rng.int(0, 31), 0x1e1612);
    pc.grime(0x3a2a1a, 0.5, 3, 203, 0.62);
  });
  A.add('q_pegboard', 64, 32, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0x8c6c4a, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.55 + (ph(x, y, 5) - 0.5) * 0.12 + (tileFbm(x, y, 64, 32, 3, 2, 6) - 0.5) * 0.15, 0.6);
    for (let y = 1; y < 32; y += 3) for (let x = 1; x < 64; x += 3) { pc.set(x, y, 0x34261a); pc.blend(x + 1, y + 1, r[4], 0.3); }
    pc.bevel(0, 0, 64, 32, r[4], r[0]);
    const peg = (x: number, y: number) => { pc.set(x, y, 0xb0b0b0); pc.set(x, y + 1, 0x6a6a6a); };
    // hammer
    peg(6, 4); peg(9, 4);
    pc.rect(4, 6, 8, 2, 0x707478); pc.hline(4, 11, 6, 0xa8acb0); pc.set(4, 7, 0x4a4e52);
    pc.vline(7, 8, 19, 0x8a5a2e); pc.vline(8, 8, 19, 0x6a4220); pc.rect(7, 17, 2, 3, 0x2a2a2a);
    // wrenches, decreasing
    [[14, 20], [17, 17], [20, 14]].forEach(([x, len]) => {
      peg(x, 3);
      pc.set(x - 1, 5, 0xb8bcc0); pc.set(x + 1, 5, 0xb8bcc0); pc.set(x - 1, 6, 0x8a8e92); pc.set(x + 1, 6, 0x8a8e92);
      pc.vline(x, 7, 5 + len, 0xa0a4a8); pc.set(x, 7 + len - 2, 0x6a6e72);
      pc.set(x - 1, 5 + len, 0x8a8e92); pc.set(x + 1, 5 + len, 0x8a8e92); pc.set(x, 6 + len, 0x8a8e92);
    });
    // marker outline of a missing wrench
    for (let y = 4; y < 20; y += 2) pc.set(23, y, 0x1a1410);
    pc.set(22, 4, 0x1a1410); pc.set(24, 4, 0x1a1410);
    // hand saw
    peg(30, 4);
    poly(pc, [[26, 6], [40, 6], [40, 10], [26, 13]], 0xb4b8bc);
    pc.hline(26, 40, 6, 0xd8dce0);
    for (let x = 26; x < 40; x += 2) pc.set(x, 13 - Math.floor((x - 26) * 3 / 14), 0x5a5e62);
    pc.rect(40, 5, 4, 7, 0x8a4a22); pc.rect(41, 7, 2, 3, 0x4a2a14);
    // screwdrivers
    [0xc8322a, 0xe0b030, 0x2f62b0, 0x2a2a2a].forEach((c, i) => {
      const x = 47 + i * 3;
      peg(x, 15);
      pc.rect(x, 17, 2, 4, c); pc.set(x, 17, scaleHex(c, 1.3));
      pc.vline(x, 21, 26, 0xb0b4b8); pc.vline(x + 1, 21, 25, 0x7a7e82);
    });
    // pliers
    peg(54, 4);
    pc.line(53, 6, 52, 14, 0x9a9ea2); pc.line(55, 6, 56, 14, 0x9a9ea2);
    pc.rect(51, 11, 2, 4, 0xc8322a); pc.rect(56, 11, 2, 4, 0xc8322a);
    // tape measure + coiled cord
    pc.rect(59, 4, 4, 4, 0xe8c030); pc.set(60, 5, 0x2a2a2a); pc.hline(59, 62, 7, 0xb08a20);
    pc.circle(31, 22, 5, 0xe0782a); pc.circle(31, 22, 3.6, r[2]); pc.circle(31, 22, 2.2, 0xe0782a); pc.circle(31, 22, 1.2, r[1]);
    pc.line(36, 22, 39, 28, 0xe0782a);
    // clipboard with notes, safety goggles
    pc.rect(5, 22, 7, 8, 0x8a6a3a); pc.rect(6, 23, 5, 6, 0xe8e4d8); scribble(pc, 6, 24, 5, 0x5a5a60, 3, 3, 2);
    pc.rect(16, 25, 7, 3, 0x9ac0d0); pc.set(19, 26, 0x2a3a40); pc.hline(15, 23, 24, 0x2a2a2a);
  });
  A.add('q_drawer_metal', 16, 16, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0x8a9094, 5, { spread: 0.4 });
    pc.fill(r[2]);
    for (let d = 0; d < 4; d++) {
      const y = d * 4;
      pc.bevel(0, y, 16, 4, r[4], r[0]);
      pc.hline(5, 10, y + 2, 0x1e2022); pc.hline(5, 10, y + 1, r[3]);
      pc.set(2, y + 1, 0xe8e4d8); pc.set(3, y + 1, 0xe8e4d8);
    }
    pc.set(12, 6, 0x6a4a2a); pc.set(13, 7, 0x7a5232);
  });

  // --- red rolling tool chest
  A.add('q_toolchest_front', 22, 25, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xc22a24, 6, { spread: 0.42 });
    pc.fill(r[2]);
    const hs = [3, 3, 3, 4, 5, 6];
    let y = 0;
    for (const h of hs) {
      pc.rect(1, y, 20, h, r[3]);
      pc.bevel(1, y, 20, h, r[5], r[0]);
      pc.hline(3, 18, y + 1, 0xd8dcdf); pc.hline(3, 18, y + 2 > y + h - 1 ? y + 1 : y + 2, h > 3 ? r[1] : 0xa8acaf);
      y += h + 1;
    }
    pc.vline(0, 0, 24, r[1]); pc.vline(21, 0, 24, r[0]);
    pc.rect(9, 21, 4, 2, 0xc8ccd0); pc.set(10, 21, 0xffffff);
    chips(pc, rng, 5, 0x8a8a8a, r[0]);
    for (let k = 0; k < 6; k++) pc.set(rng.int(2, 19), rng.int(1, 23), r[5]);
  });
  A.add('q_toolchest_top', 21, 10, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0xc22a24, 6, { spread: 0.42 });
    pc.fill(r[2]);
    pc.rect(0, 0, 21, 3, r[3]); pc.hline(0, 20, 0, r[5]); pc.hline(0, 20, 2, r[0]);
    for (const y of [4, 7]) { pc.bevel(1, y, 19, 3, r[5], r[0]); pc.hline(3, 17, y + 1, 0xd8dcdf); }
    pc.rect(10, 1, 2, 1, 0xd0d4d8);
  });
  A.add('q_toolchest_side', 16, 16, (pc, rng) => {
    const r = makeRamp(0xc22a24, 6, { spread: 0.42 });
    fillNoise(pc, r, 0.55, 0.1, 2, 207, 0.04);
    for (let i = 0; i < 16; i++) { pc.blend(i, (i * 2) % 16, r[5], 0.35); }
    chips(pc, rng, 2, 0x8a8a8a, r[0]);
  });

  // --- portable generator
  A.add('q_gen_tank', 22, 15, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xe0ae22, 6, { spread: 0.42 });
    fillNoise(pc, r, 0.55, 0.1, 2, 211, 0.05);
    pc.bevel(0, 0, 22, 15, r[5], r[0]);
    pc.circle(6, 7, 3, 0x2a2a2c); pc.circle(6, 7, 2, 0x4a4a4e); pc.set(5, 6, 0x8a8a8e);
    pc.circle(16, 5, 2, 0xd8d8d0); pc.set(16, 5, 0xc0302a); pc.set(15, 5, 0x2a2a2a);
    pc.rect(12, 9, 8, 4, 0xece8dc); pc.rect(12, 9, 8, 1, 0xd0302a); scribble(pc, 13, 11, 6, 0x5a5a5a, 4);
    chips(pc, rng, 4, 0x6a6a6a, r[0]);
    pc.stain(9, 10, 2, 0x6a5020, 0x4a3818, 3);
  });
  A.add('q_gen_panel', 8, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a2c30);
    pc.rect(1, 1, 2, 2, 0xd8782a); pc.set(1, 2, 0x2a2a2a);
    pc.rect(4, 1, 2, 2, 0xd0d0c8); pc.set(4, 2, 0x2a2a2a); pc.set(5, 2, 0x2a2a2a);
    pc.set(7, 1, 0xc83020); pc.rect(1, 4, 2, 1, 0x9a9a9a); pc.set(5, 4, 0x40c060); pc.set(6, 4, 0x2a2a2a);
  });

  // --- water heater
  A.add('q_heater_shell', 56, 50, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xd6d1c2, 6, { spread: 0.35 });
    fillNoise(pc, r, 0.6, 0.08, 3, 221, 0.04);
    pc.hline(0, 55, 0, r[1]); pc.hline(0, 55, 1, r[4]); pc.hline(0, 55, 48, r[1]); pc.hline(0, 55, 49, r[0]);
    // sticker (mirrored so it reads correctly on the cylinder)
    mirroredStamp(pc, 13, 17, 1, 12, (s) => {
      s.fill(0xf0ece2); s.rect(0, 0, 13, 3, 0xe07a24); text(s, 'HOT', 1, -1, 0xffffff);
      scribble(s, 1, 5, 11, 0x4a4a4e, 1, 4, 2);
      s.rect(1, 13, 5, 3, 0xf0d040); s.rect(7, 13, 5, 3, 0x5a5a5e);
      s.strokeRect(0, 0, 13, 17, 0xb8b4a8);
    });
    // burner access door
    pc.rect(2, 38, 11, 9, 0x5c5e60); pc.bevel(2, 38, 11, 9, 0x8a8c8e, 0x2a2c2e);
    pc.rect(5, 41, 3, 2, 0x1a1a1c); pc.set(6, 42, 0xe8902a);
    // rust & water staining from the bottom seam
    rust(pc, 223, 0.45, 4, [0, 40, 56, 10]);
    pc.drips(rng, 0x8a6a40, 4, 40, 10, 0.3);
    for (let k = 0; k < 5; k++) pc.set(rng.int(14, 55), rng.int(4, 36), r[2]);
  });
  A.add('q_heater_top', 18, 18, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0xd6d1c2, 5, { spread: 0.35 });
    pc.fill(r[1]);
    pc.circle(9, 9, 8.6, r[2]); pc.circle(9, 9, 7.4, r[3]);
    pc.circle(9, 9, 2.6, 0x2a2826); pc.circle(9, 9, 1.4, 0x121010);
    pc.circle(4, 9, 1.4, 0xb06a3c); pc.circle(14, 9, 1.4, 0xb06a3c);
    rust(pc, 225, 0.3, 3);
  });

  // --- boiler
  A.add('q_boiler_shell', 32, 32, (pc, rng) => {
    const r = makeRamp(0x34403a, 6, { spread: 0.45 });
    fillNoise(pc, r, 0.5, 0.14, 2, 231, 0.06);
    // plate seams with rivet rows
    for (let y = 0; y < 32; y++) { pc.set(0, y, r[0]); pc.set(16, y, r[0]); pc.set(1, y, r[3]); pc.set(17, y, r[3]); }
    for (let x = 0; x < 32; x++) { pc.set(x, 0, r[0]); pc.set(x, 1, r[3]); }
    for (let k = 1; k < 32; k += 3) { rivet(pc, 2, k, r[5], r[0], r[3]); rivet(pc, 18, k, r[5], r[0], r[3]); rivet(pc, k, 2, r[5], r[0], r[3]); }
    rust(pc, 233, 0.28, 3);
    pc.drips(rng, 0x5a3418, 3, 3, 14, 0.3);
    pc.grime(0x15140f, 0.7, 2, 235, 0.55);
  });
  A.add('q_boiler_head', 40, 40, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x2e3632, 6, { spread: 0.45 });
    fillNoise(pc, r, 0.45, 0.14, 3, 237, 0.06);
    // rivet ring
    for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2; rivet(pc, Math.round(19.5 + Math.cos(a) * 17), Math.round(19.5 + Math.sin(a) * 17), r[5], r[0], r[3]); }
    for (let k = 0; k < 360; k += 2) { const a = k * Math.PI / 180; pc.set(Math.round(19.5 + Math.cos(a) * 15.2), Math.round(19.5 + Math.sin(a) * 15.2), r[1]); }
    // brass nameplate
    pc.rect(13, 31, 14, 6, 0xb08a3a); pc.bevel(13, 31, 14, 6, 0xe0c070, 0x6a4a1a); text(pc, 'NO 2', 14, 32, 0x4a3410);
    // soot at the top
    pc.each((x, y) => { if (y < 14 && tileFbm(x, y, 40, 40, 3, 2, 239) > 0.5 && bayer(x, y) < 0.5) pc.set(x, y, 0x161816); });
    rust(pc, 241, 0.35, 3);
    pc.drips(rng, 0x5a3418, 3, 24, 12, 0.35);
    flipY(pc);
  });
  A.add('q_boiler_door', 14, 14, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0x2a2826, 6, { spread: 0.5 });
    pc.fill(r[1]);
    pc.circle(7, 7, 6.6, r[3]); pc.circle(7, 7, 5.4, r[2]);
    pc.rect(0, 3, 2, 2, r[4]); pc.rect(0, 9, 2, 2, r[4]);
    pc.rect(11, 6, 3, 2, 0xb0aaa0); pc.set(13, 6, 0xe0dad0);
    for (let x = 4; x < 10; x += 2) pc.vline(x, 9, 11, 0x0e0c0a);
    rust(pc, 243, 0.5, 2);
  });
  A.add('q_fire_glow', 8, 4, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => pc.set(x, y, y < 1 ? 0xffd27a : y < 2 ? 0xff9c3a : y < 3 ? 0xe8602a : 0xa83a1e));
    pc.set(2, 0, 0xfff0c0); pc.set(5, 1, 0xffd27a);
  });
  A.add('q_gauge_glass', 4, 16, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => pc.set(x, y, x === 0 || x === 3 ? 0xa8843a : y < 7 ? 0x2a3a40 : 0x5a8aa0));
    pc.vline(1, 1, 14, 0x9ac8d8); pc.hline(1, 2, 7, 0xe8f4f8);
    pc.rect(0, 0, 4, 2, 0xb8944a); pc.rect(0, 14, 4, 2, 0xb8944a);
  });

  // --- electrical
  A.add('q_elec_front', 30, 62, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x8e979b, 6, { spread: 0.38 });
    fillNoise(pc, r, 0.55, 0.08, 3, 251, 0.04);
    pc.bevel(0, 0, 30, 62, r[5], r[0]);
    seamV(pc, 14, 1, 60, r[0], r[4]);
    for (const x0 of [2, 17]) {
      grille(pc, x0 + 1, 4, 10, 8, makeRamp(0x8e979b, 5), makeRamp(0x6e777b, 5), 0x16181a);
      grille(pc, x0 + 1, 50, 10, 8, makeRamp(0x8e979b, 5), makeRamp(0x6e777b, 5), 0x16181a);
    }
    // handles
    pc.rect(11, 26, 2, 8, 0x2a2c2e); pc.set(11, 26, 0x6a6c6e);
    pc.rect(17, 26, 2, 8, 0x2a2c2e); pc.set(17, 26, 0x6a6c6e);
    // hazard triangle with bolt
    poly(pc, [[22.5, 15], [27, 23], [18, 23]], 0x1a1a1a);
    poly(pc, [[22.5, 16.5], [25.8, 22.3], [19.2, 22.3]], 0xf0c020);
    pc.set(22, 18, 0x1a1a1a); pc.set(23, 19, 0x1a1a1a); pc.set(22, 20, 0x1a1a1a); pc.set(23, 21, 0x1a1a1a);
    // labels
    pc.rect(3, 16, 9, 5, 0xe8e6de); text(pc, 'HV', 4, 16, 0xc02a22);
    pc.rect(3, 38, 9, 3, 0xe8e6de); scribble(pc, 4, 39, 7, 0x4a4a4e, 9);
    pc.rect(18, 38, 9, 3, 0xe8e6de); scribble(pc, 19, 39, 7, 0x4a4a4e, 10);
    // padlock hasp
    pc.rect(14, 30, 2, 3, 0x9a8a3a); pc.set(14, 29, 0x5a5a5a);
    chips(pc, rng, 6, r[0], r[1]);
    grimeBottom(pc, 0x3a3a30, 14, 0.8, 253);
    for (let k = 0; k < 5; k++) { const x = rng.int(2, 26), y = rng.int(24, 46); pc.line(x, y, x + rng.int(2, 5), y + rng.int(-1, 1), r[5]); }
  });
  A.add('q_transformer', 32, 32, (pc, rng) => {
    const r = makeRamp(0x6c7a6e, 6, { spread: 0.4 });
    fillNoise(pc, r, 0.55, 0.1, 2, 261, 0.05);
    seamH(pc, 0, 31, 0, r[0], r[4]);
    rust(pc, 263, 0.1, 3);
    pc.drips(rng, 0x5a4024, 3, 2, 18, 0.22);
    chips(pc, rng, 4, 0x9a9a92, r[0]);
  });
  A.add('q_hv_sign', 10, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0xece8dc); pc.strokeRect(0, 0, 10, 12, 0x1a1a1a);
    pc.rect(1, 1, 8, 3, 0xc8281e); text(pc, '!', 4, 0, 0xffffff);
    poly(pc, [[6, 4], [3, 8], [5, 8], [4, 11], [7, 7], [5, 7]], 0x1a1a1a);
  });
  A.add('q_porcelain_brown', 8, 8, (pc) => {
    const r = makeRamp(0x7a3a20, 4, { spread: 0.45 });
    pc.each((x, y) => pc.set(x, y, r[y < 2 ? 3 : y < 5 ? 2 : 1]));
    pc.set(2, 1, 0xd89a70);
  });

  // --- vents & covers
  A.add('q_vent_wall', 22, 15, (pc) => {
    pc.wrap = false;
    const f = makeRamp(0xa4a8a6, 5, { spread: 0.4 });
    pc.fill(0x08080a);
    pc.rect(0, 0, 22, 15, f[2]); pc.bevel(0, 0, 22, 15, f[4], f[0]);
    pc.rect(2, 2, 18, 11, 0x060607);
    for (let y = 3; y < 13; y += 2) {
      const bent = y === 7;
      for (let x = 2; x < 20; x++) {
        const yy = bent && x > 9 && x < 15 ? y + 1 : y;
        pc.set(x, yy, f[3]); pc.set(x, yy + 1 > 12 ? yy : yy, f[3]);
        if (yy + 1 < 13) pc.blend(x, yy + 1, f[1], 0.6);
      }
    }
    screw(pc, 1, 1, 0xe0e0e0, 0x303030); screw(pc, 20, 1, 0xe0e0e0, 0x303030); screw(pc, 1, 13, 0xe0e0e0, 0x303030);
    pc.set(20, 13, 0x0a0a0a);
    // claw scratches on the frame
    for (let k = 0; k < 3; k++) for (let t = 0; t < 4; t++) pc.set(15 + k * 2 + t, 9 + t, f[0]);
    pc.blend(4, 12, 0x8a8a84, 0.7); pc.blend(5, 12, 0x6a6a64, 0.7);
  });
  A.add('q_floor_grate', 26, 26, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0x55585a, 6, { spread: 0.5 });
    pc.fill(0x050506);
    for (let y = 0; y < 26; y++) for (let x = 0; x < 26; x++) {
      const border = x < 2 || y < 2 || x > 23 || y > 23;
      const bar = (x - 2) % 5 < 2 || (y - 2) % 5 < 2;
      if (border || bar) pc.set(x, y, r[2 + ((x + y) % 7 === 0 ? 1 : 0)]);
    }
    for (let k = 2; k < 24; k += 5) { pc.hline(0, 25, k, r[3]); pc.vline(k, 0, 25, r[3]); pc.hline(0, 25, k + 1, r[1]); pc.vline(k + 1, 0, 25, r[1]); }
    pc.bevel(0, 0, 26, 26, r[5], r[0]);
    rust(pc, 271, 0.25, 3);
    pc.set(15, 15, 0x8a8c70); pc.set(17, 15, 0x8a8c70);
    pc.blend(5, 10, 0x2a3a3a, 0.5);
  });
  A.add('q_manhole', 24, 24, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0x4a4846, 6, { spread: 0.5 });
    pc.fill(0x2a2826);
    pc.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
      if (d > 11.8) return;
      let k = 2;
      if (d > 10.6) k = 4;
      else if (d > 9.6) k = 1;
      else if (d > 4.4) k = ((x + y) % 4 === 0 || (x - y + 40) % 4 === 0) ? 4 : 2;
      pc.set(x, y, r[k]);
    });
    pc.rect(2, 9, 20, 7, r[2]); pc.hline(2, 21, 9, r[1]); pc.hline(2, 21, 15, r[4]);
    text(pc, 'SEWER', 3, 10, r[5]);
    pc.set(6, 5, 0x0a0a0a); pc.set(17, 18, 0x0a0a0a);
    rust(pc, 273, 0.35, 3);
  });

  // --- drums, tarps, pallets
  A.add('q_drum_side', 58, 28, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x2c5a8c, 6, { spread: 0.42 });
    fillNoise(pc, r, 0.55, 0.1, 3, 281, 0.05);
    for (const y of [9, 18]) { pc.hline(0, 57, y - 1, r[5]); pc.hline(0, 57, y, r[3]); pc.hline(0, 57, y + 1, r[0]); }
    pc.hline(0, 57, 0, r[1]); pc.hline(0, 57, 27, r[0]);
    // hazard diamond (flammable) facing the camera
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) if (Math.abs(i) + Math.abs(j) <= 4) pc.set(7 + i, 13 + j, Math.abs(i) + Math.abs(j) === 4 ? 0xf0ece0 : 0xc8281e);
    pc.set(7, 11, 0xffffff); pc.set(6, 12, 0xffffff); pc.set(7, 12, 0xffffff); pc.set(8, 13, 0xffffff); pc.set(6, 13, 0xffffff); pc.set(7, 14, 0xffffff);
    mirroredStamp(pc, 12, 5, 16, 3, (s) => text(s, 'OIL', 0, 0, 0xe8e4d8));
    rust(pc, 283, 0.28, 4);
    pc.drips(rng, 0x1a1a14, 4, 0, 10, 0.4);
    chips(pc, rng, 8, 0x7a7c7e, r[0]);
    grimeBottom(pc, 0x3a2a1a, 6, 0.9, 285);
  });
  A.add('q_drum_top', 18, 18, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0x2c5a8c, 6, { spread: 0.42 });
    pc.fill(r[1]);
    pc.circle(9, 9, 8.6, r[3]); pc.circle(9, 9, 7.6, r[2]); pc.circle(9, 9, 6.2, r[3]);
    pc.circle(5, 6, 1.8, 0x8a8c8e); pc.set(5, 6, 0x3a3a3a);
    pc.circle(13, 12, 1.2, 0x8a8c8e);
    pc.stain(10, 9, 4, 0x6a4a2a, 0x5a3a1e, 4);
    rust(pc, 287, 0.3, 3);
  });
  A.add('q_plastic_drum', 56, 27, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x2c6cb4, 6, { spread: 0.42 });
    fillNoise(pc, r, 0.55, 0.06, 3, 291, 0.04);
    for (const y of [5, 20]) { pc.hline(0, 55, y, r[5]); pc.hline(0, 55, y + 1, r[1]); }
    pc.each((x, y) => { if (y > 21 && tileFbm(x, y, 56, 27, 4, 2, 293) + (y - 21) * 0.08 > 0.6 && bayer(x, y) < 0.6) pc.set(x, y, ph(x, y, 2) < 0.5 ? 0x3a6a3a : 0x2e5a34); });
    pc.drips(rng, 0x1e4a7a, 5, 6, 12, 0.3);
  });
  const tarp = (name: string, base: number, seed: number) => A.add(name, 32, 32, (pc, rng) => {
    const r = makeRamp(base, 6, { spread: 0.42 });
    pc.fillRamp(r, (x, y) => 0.55 + ((x % 2) ^ (y % 2) ? 0.04 : -0.04) + (tileFbm(x, y, 32, 32, 2, 3, seed) - 0.5) * 0.35, 0.7);
    // creases
    for (let k = 0; k < 5; k++) {
      let x = rng.int(0, 31), y = rng.int(0, 31);
      const dx = rng.pick([-1, 1]);
      for (let t = 0; t < 12; t++) { pc.set(x, y, r[5]); pc.set(x + 1, y, r[1]); x += dx * (t % 2); y += 1; }
    }
    pc.grime(scaleHex(base, 0.4), 0.5, 3, seed + 1, 0.62);
  });
  tarp('q_tarp_blue', 0x2e6ac2, 301);
  tarp('q_tarp_green', 0x56683e, 303);
  A.add('q_pallet_wood', 32, 32, (pc, rng) => {
    const r = makeRamp(0xc4a474, 6, { spread: 0.42 });
    woodFill(pc, r, 311, 32, false, false);
    pc.grime(0x5a4a34, 0.5, 3, 313, 0.6);
    for (let k = 0; k < 6; k++) { const x = rng.int(0, 30), y = rng.int(0, 31); pc.set(x, y, 0x3a3634); pc.set(x + 1, y, 0x5a5654); }
    pc.rect(20, 12, 5, 4, r[1]); pc.set(21, 13, r[4]); pc.set(23, 14, r[4]);
  });
  A.add('q_cinder', 16, 8, (pc, rng) => {
    const r = makeRamp(0x8a8780, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.5 + (ph(x, y, 321) - 0.5) * 0.5, 1);
    pc.speckle(rng, [r[0]], 0.06);
    pc.hline(0, 15, 7, 0x6a6660); pc.vline(15, 0, 7, 0x6a6660);
  });

  // --- crates & dumpster
  A.add('q_crate_side', 27, 24, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xb08452, 6, { spread: 0.45 });
    woodFill(pc, r, 331, 6, false, true);
    const f = makeRamp(0x8a6036, 5, { spread: 0.4 });
    for (let y = 0; y < 24; y++) for (let x = 0; x < 27; x++) if (x < 3 || x > 23 || y < 3 || y > 20) pc.set(x, y, f[2 + (ph(x, y, 9) < 0.25 ? 1 : 0)]);
    pc.bevel(0, 0, 27, 24, f[4], f[0]); pc.bevel(3, 3, 21, 18, f[0], f[4]);
    for (const [x, y] of [[1, 1], [25, 1], [1, 22], [25, 22], [13, 1], [13, 22]]) pc.set(x, y, 0x2a2622);
    text(pc, 'NO.7', 6, 7, 0x2a2018); text(pc, '^^', 9, 14, 0x2a2018);
    pc.stain(rng.int(6, 20), rng.int(6, 18), 3, 0x6a4a2a, 0x4a3420, 5);
  });
  A.add('q_crate_top', 27, 27, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0xb48856, 6, { spread: 0.45 });
    woodFill(pc, r, 333, 5, false, true);
    const f = makeRamp(0x8a6036, 5, { spread: 0.4 });
    for (let y = 0; y < 27; y++) for (let x = 0; x < 27; x++) if (x < 3 || x > 23) pc.set(x, y, f[2 + (ph(x, y, 7) < 0.25 ? 1 : 0)]);
    pc.bevel(0, 0, 27, 27, f[4], f[0]);
    textC(pc, 'TOP', 13, 11, 0x3a2818);
    for (const [x, y] of [[1, 2], [25, 2], [1, 24], [25, 24]]) pc.set(x, y, 0x2a2622);
  });
  A.add('q_dumpster_front', 58, 34, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x3a6a48, 6, { spread: 0.42 });
    fillNoise(pc, r, 0.55, 0.1, 3, 341, 0.05);
    for (let x = 3; x < 58; x += 7) { pc.vline(x, 4, 33, r[5]); pc.vline(x + 1, 4, 33, r[1]); }
    pc.rect(0, 0, 58, 3, r[3]); pc.hline(0, 57, 0, r[5]); pc.hline(0, 57, 2, r[0]);
    textC(pc, 'NO FIRES', 29, 6, 0xe8e4d8);
    // graffiti: magenta tag and a smiley
    for (let t = 0; t < 14; t++) pc.set(8 + t, 21 + Math.round(Math.sin(t * 0.9) * 2), 0xd04aa0);
    pc.line(9, 25, 20, 24, 0xd04aa0);
    pc.circle(45, 21, 4, 0x48a0d8); pc.circle(45, 21, 3, r[2]); pc.set(44, 20, 0x48a0d8); pc.set(46, 20, 0x48a0d8); pc.hline(44, 46, 23, 0x48a0d8);
    pc.rect(28, 16, 7, 5, 0xe8e2c8); scribble(pc, 29, 17, 5, 0x6a6a6a, 2, 2, 2);
    rust(pc, 343, 0.4, 4, [0, 22, 58, 12]);
    rust(pc, 345, 0.1, 3, [0, 0, 58, 22]);
    chips(pc, rng, 10, 0x7a7c78, r[0]);
    grimeBottom(pc, 0x2a2a1a, 8, 0.9, 347);
  });
  A.add('q_dumpster_end', 30, 34, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x3a6a48, 6, { spread: 0.42 });
    fillNoise(pc, r, 0.55, 0.1, 3, 349, 0.05);
    for (let x = 4; x < 30; x += 7) { pc.vline(x, 4, 33, r[5]); pc.vline(x + 1, 4, 33, r[1]); }
    pc.rect(0, 0, 30, 3, r[3]); pc.hline(0, 29, 0, r[5]);
    text(pc, '3', 13, 8, 0xe8e4d8, 2);
    rust(pc, 351, 0.4, 3, [0, 20, 30, 14]);
    chips(pc, rng, 5, 0x7a7c78, r[0]);
  });
  A.add('q_dumpster_lid', 32, 16, (pc, rng) => {
    const r = makeRamp(0x2a2c2e, 5, { spread: 0.45 });
    pc.fillRamp(r, (x, y) => 0.45 + (y % 5 === 0 ? 0.3 : y % 5 === 1 ? -0.25 : 0) + (tileFbm(x, y, 32, 16, 2, 2, 353) - 0.5) * 0.2, 0.7);
    for (let k = 0; k < 6; k++) { const x = rng.int(0, 31), y = rng.int(0, 15); pc.hline(x, x + rng.int(1, 4), y, r[4]); }
  });
  A.add('q_trashbag', 16, 16, (pc, rng) => {
    const r = makeRamp(0x26282c, 5, { spread: 0.5 });
    pc.fillRamp(r, (x, y) => 0.4 + (tileFbm(x, y, 16, 16, 2, 2, 361) - 0.5) * 0.5, 0.8);
    for (let k = 0; k < 7; k++) { const x = rng.int(0, 15), y = rng.int(0, 15), l = rng.int(2, 4); for (let i = 0; i < l; i++) pc.set(x + i, y + (rng.chance(0.4) ? 1 : 0), r[4]); }
    pc.set(3, 4, 0x9aa0a8); pc.set(11, 9, 0x8a9098);
  });
  A.add('q_trashbag_white', 16, 16, (pc, rng) => {
    const r = makeRamp(0x9a9a92, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.45 + (tileFbm(x, y, 16, 16, 2, 2, 363) - 0.5) * 0.5, 0.8);
    for (let k = 0; k < 6; k++) { const x = rng.int(0, 15), y = rng.int(0, 15); pc.hline(x, x + rng.int(1, 3), y, r[1]); }
    pc.stain(8, 10, 3, 0xa09060, 0x887848, 2);
  });

  // --- janitorial
  A.add('q_mop_strands', 16, 16, (pc) => {
    const r = makeRamp(0xb8b4a6, 5, { spread: 0.4 });
    pc.each((x, y) => pc.set(x, y, r[(x % 3 === 0 ? 1 : x % 3 === 1 ? 3 : 2) - (y > 11 && ph(x, y, 2) < 0.5 ? 1 : 0)]));
    pc.grime(0x6a6250, 0.6, 2, 371, 0.55);
  });
  A.add('q_mop_water', 12, 10, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => pc.set(x, y, tileFbm(x, y, 12, 10, 2, 2, 373) > 0.55 ? 0x8a8466 : 0x5e5a44));
    pc.set(3, 3, 0xd8d6c8); pc.set(4, 3, 0xc8c6b8); pc.set(8, 6, 0xd8d6c8);
  });
  A.add('q_janitor_bag', 16, 16, (pc) => {
    const r = makeRamp(0xd8b42a, 5, { spread: 0.42 });
    pc.fillRamp(r, (x, y) => 0.55 + Math.sin(x * 1.3 + tileFbm(x, y, 16, 16, 2, 2, 381) * 4) * 0.2, 0.8);
    pc.grime(0x6a5a20, 0.5, 2, 383, 0.6);
  });
  A.add('q_spray_label', 6, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0xece8dc); pc.rect(0, 0, 6, 2, 0x2a7ac8); pc.hline(1, 4, 3, 0x6a6a6a); pc.hline(1, 3, 4, 0x6a6a6a);
  });

  // --- pump machinery
  A.add('q_motor', 32, 16, (pc, rng) => {
    const r = makeRamp(0x46628a, 6, { spread: 0.45 });
    pc.each((x, y) => pc.set(x, y, r[x % 3 === 0 ? 4 : x % 3 === 1 ? 2 : 1]));
    rust(pc, 391, 0.3, 2);
    chips(pc, rng, 4, 0x8a8a8a, r[0]);
  });
  A.add('q_motor_plate', 8, 5, (pc) => {
    pc.wrap = false;
    pc.fill(0xc0c4c8); pc.bevel(0, 0, 8, 5, 0xe8eaec, 0x7a7e82);
    scribble(pc, 1, 1, 6, 0x4a4e52, 5, 2, 2);
  });
  A.add('q_filter_tank', 32, 32, (pc, rng) => {
    const r = makeRamp(0xc8b086, 6, { spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.55 + (((x + y * 2) % 6) === 0 ? 0.12 : 0) + (tileFbm(x, y, 32, 32, 2, 2, 393) - 0.5) * 0.25, 0.7);
    pc.grime(0x7a6a48, 0.5, 3, 395, 0.6);
    pc.drips(rng, 0x8a7a58, 3, 0, 20, 0.25);
  });
  A.add('q_strainer_lid', 10, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a2c30);
    pc.circle(5, 5, 4.4, 0x3a4a4c); pc.circle(5, 5, 3.4, 0x58706c);
    pc.set(4, 4, 0x6a8a3a); pc.set(6, 5, 0x8a6a2a); pc.set(5, 7, 0x5a7a2a); pc.set(3, 3, 0xd8e8e8);
  });
  A.add('q_console_panel', 30, 18, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x46544c, 6, { spread: 0.38 });
    fillNoise(pc, r, 0.5, 0.08, 3, 401, 0.04);
    pc.bevel(0, 0, 30, 18, r[5], r[0]);
    // mimic diagram: pipe lines with two pump symbols
    const L = 0x7ac0e0;
    pc.hline(2, 20, 4, L); pc.vline(20, 4, 12, L); pc.hline(2, 20, 12, L); pc.vline(11, 4, 12, L);
    pc.circle(6, 4, 1.6, 0xe8e4d8); pc.set(6, 4, 0x2a2a2a); pc.circle(15, 12, 1.6, 0xe8e4d8); pc.set(15, 12, 0x2a2a2a);
    pc.rect(10, 7, 3, 3, 0xe8e4d8); pc.set(11, 8, 0x2a7a3a);
    text(pc, 'P1', 2, 6, 0xe8e4d8); text(pc, 'P2', 14, 14, 0xe8e4d8);
    // e-stop
    pc.rect(23, 2, 6, 6, 0xe8c020); pc.circle(26, 5, 2.4, 0xc8221a); pc.set(25, 4, 0xff8a7a);
    // switch plates
    for (let k = 0; k < 3; k++) { pc.rect(23 + k * 2, 11, 1, 4, 0x1a1a1a); pc.set(23 + k * 2, 10, 0xe8e4d8); }
    chips(pc, rng, 4, r[1], r[0]);
    for (let k = 0; k < 4; k++) pc.set(rng.int(2, 28), rng.int(2, 16), r[5]);
  }, 0.95, 0.56);
  A.add('q_meter_panel', 30, 16, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0x46544c, 6, { spread: 0.38 });
    fillNoise(pc, r, 0.5, 0.08, 3, 403, 0.04);
    pc.bevel(0, 0, 30, 16, r[5], r[0]);
    gauge(pc, 5, 6, 4, 0.3); gauge(pc, 14, 6, 4, 1.4); gauge(pc, 23, 6, 4, -0.9);
    for (const x of [2, 11, 20]) { pc.rect(x, 12, 7, 2, 0xe8e4d8); scribble(pc, x + 1, 12, 5, 0x3a3a3a, x); }
    pc.rect(27, 2, 2, 12, 0x1a1a1a); pc.rect(27, 9, 2, 5, 0x3ad06a);
  });
  A.add('q_clipboard', 8, 11, (pc) => {
    pc.wrap = false;
    pc.fill(0x8a6034); pc.rect(1, 1, 6, 9, 0xeae6d8); pc.rect(3, 0, 2, 2, 0xb0b0b0);
    text(pc, 'LOG', 1, 1, 0x2a2a3a);
    for (let y = 7; y < 10; y++) scribble(pc, 1, y, 5, y === 9 ? 0xc0302a : 0x5a5a6a, y);
  });

  // --- big fuse panel
  A.add('q_fuse_panel', 32, 43, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x5e6468, 6, { spread: 0.4 });
    fillNoise(pc, r, 0.4, 0.08, 3, 411, 0.04);
    pc.bevel(0, 0, 32, 43, r[5], r[0]);
    // copper bus bars
    for (const y of [3, 5]) { pc.hline(2, 29, y, 0xc0783a); pc.hline(2, 29, y + 1 - 1, 0xc0783a); }
    pc.hline(2, 29, 4, 0x8a4a22);
    const missing = new Set([4, 9, 13]);
    let n = 0;
    for (let row = 0; row < 5; row++) for (let col = 0; col < 3; col++) {
      const x = 3 + col * 9, y = 9 + row * 6;
      pc.rect(x, y, 8, 5, 0xd8d0b8); pc.bevel(x, y, 8, 5, 0xf0eadc, 0x8a8470);
      pc.rect(x + 1, y + 1, 1, 3, 0xb08040); pc.rect(x + 6, y + 1, 1, 3, 0xb08040);
      if (!missing.has(n)) {
        const blown = n === 7;
        pc.rect(x + 2, y + 1, 4, 3, blown ? 0x3a2a22 : 0xc8a066); pc.hline(x + 2, x + 5, y + 1, blown ? 0x5a3a2a : 0xe8c890);
        if (blown) { pc.set(x + 3, y + 2, 0x1a1210); pc.set(x + 4, y + 2, 0x7a2a1a); }
      } else { pc.rect(x + 2, y + 1, 4, 3, 0x1a1a1c); }
      n++;
    }
    // label strip & warning
    pc.rect(3, 39, 26, 3, 0xe8e6de); scribble(pc, 4, 40, 24, 0x4a4a4e, 413);
    pc.rect(25, 1, 5, 2, 0xf0c020);
    chips(pc, rng, 4, r[1], r[0]);
  });
  A.add('q_fuse_door', 32, 43, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x8e979b, 6, { spread: 0.38 });
    fillNoise(pc, r, 0.55, 0.08, 3, 415, 0.04);
    pc.bevel(0, 0, 32, 43, r[5], r[0]);
    pc.rect(6, 8, 20, 22, 0xece8da); pc.strokeRect(6, 8, 20, 22, 0xc8c4b4);
    text(pc, 'MAIN', 8, 9, 0x2a2a3a);
    for (let y = 16; y < 29; y += 2) scribble(pc, 8, y, 16, 0x5a5a6a, y, 1);
    pc.rect(15, 6, 2, 3, 0xc8c0a0);
    poly(pc, [[16, 33], [21, 41], [11, 41]], 0x1a1a1a); poly(pc, [[16, 34.5], [19.8, 40.3], [12.2, 40.3]], 0xf0c020);
    pc.set(16, 37, 0x1a1a1a); pc.set(16, 38, 0x1a1a1a); pc.set(16, 40, 0x1a1a1a);
    chips(pc, rng, 5, r[1], r[0]);
  });
});

// ---------------------------------------------------------------------------
// shared model pieces
// ---------------------------------------------------------------------------
function pallet(mb: ModelBuilder) {
  const W = 'q_pallet_wood';
  // bottom boards, blocks, stringers, top deck
  for (const z of [-0.34, 0, 0.34]) mb.box(0, 0, z, 1.0, 0.022, 0.1, W, { skip: ['bottom'] });
  for (const x of [-0.44, 0, 0.44]) for (const z of [-0.34, 0, 0.34]) mb.box(x, 0.022, z, 0.11, 0.075, z === 0 ? 0.12 : 0.1, W, { skip: ['bottom'], uvOffset: [x, z] });
  for (const x of [-0.44, 0, 0.44]) mb.box(x, 0.097, 0, 0.11, 0.022, 0.8, W, { skip: ['bottom'] });
  for (let i = 0; i < 5; i++) {
    const z = -0.34 + i * 0.17;
    mb.box(0, 0.119, z, 1.0, 0.022, i === 2 ? 0.1 : 0.12, W, { skip: ['bottom'], uvOffset: [0, i * 0.37] });
  }
}

/** cardboard box with per-face fit textures */
function cbox(mb: ModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, v = 0, rot = 0) {
  const sides = ['q_cardboard_a', 'q_cardboard_b', 'q_cardboard_c'];
  const s = sides[v % 3], s2 = sides[(v + 1) % 3];
  mb.push(); mb.translate(x, y, z); if (rot) mb.rotateY(rot);
  mb.box(0, 0, 0, w, h, d, { south: s, north: s2, east: s2, west: s, top: 'q_cardboard_top' }, { fit: true, skip: ['bottom'] });
  mb.pop();
}

function caster(mb: ModelBuilder, x: number, z: number, r = 0.035) {
  mb.box(x, r * 2 - 0.005, z, 0.03, 0.03, 0.03, 'metal_grey', { skip: ['bottom'] });
  mb.cylinderX(x, r, z, r, 0.025, 6, 'rubber_black');
}

function handwheel(mb: ModelBuilder, x: number, y: number, z: number, r: number, facing: 'z' | 'y' = 'z', tex = 'q_paint_red') {
  mb.push(); mb.translate(x, y, z); if (facing === 'z') mb.rotateX(Math.PI / 2);
  torus(mb, 0, 0, 0, r, r * 0.16, 8, 4, tex);
  mb.box(0, -r * 0.1, 0, r * 2, r * 0.2, r * 0.18, tex);
  mb.box(0, -r * 0.1, 0, r * 0.18, r * 0.2, r * 2, tex);
  mb.pop();
}

// ---------------------------------------------------------------------------
// objects
// ---------------------------------------------------------------------------
defObj({
  key: 'shelf_metal', name: 'Industrial Shelving', w: 1, d: 1, height: 2.0, block: 'solid', blocksSight: true,
  container: { capacity: 40, kind: 'shelf', loot: 'tool_shelf' },
  disassemble: { tools: ['#wrench'], time: 25, skill: 'mechanics', yields: [['scrap_metal', 3, 6], ['screws', 4, 10]] },
  sound: 'metal', flammable: 0.1, surface: 0,
  desc: 'Boltless steel racking. Someone labelled every shelf, then stopped.',
  tags: [...T, 'storage', 'shelf'],
  model: (mb) => {
    const zc = -0.14, hd = 0.27, hw = 0.47;
    for (const x of [-hw, hw]) for (const z of [zc - hd, zc + hd]) mb.box(x, 0, z, 0.045, 2.0, 0.045, 'q_rack_post', { skip: ['bottom'] });
    const levels = [0.1, 0.56, 1.02, 1.48, 1.94];
    for (const y of levels) {
      mb.box(0, y, zc, hw * 2 - 0.03, 0.025, hd * 2 - 0.02, { top: 'q_rack_deck', sides: 'q_rack_deck', all: 'q_rack_deck' }, { skip: ['bottom'], uvOffset: [0, y * 3] });
      mb.box(0, y - 0.03, zc + hd, hw * 2, 0.06, 0.03, 'q_rack_beam', { skip: ['bottom'] });
      mb.box(0, y - 0.03, zc - hd, hw * 2, 0.06, 0.03, 'q_rack_beam', { skip: ['bottom'] });
    }
    // contents
    const can = (x: number, y: number, z: number, c = 0xffffff) => mb.cylinder(x, y, z, 0.085, 0.19, 7, { sides: 'q_paint_can', top: 'q_paint_can_top' }, { fit: true, color: c });
    can(-0.32, 0.125, zc + 0.05); can(-0.13, 0.125, zc + 0.09, 0xf0e0d0); can(-0.25, 0.315, zc + 0.04);
    cbox(mb, 0.22, 0.125, zc, 0.42, 0.3, 0.42, 0, 0.08);
    // toolbox + cable coil
    mb.box(-0.22, 0.585, zc + 0.02, 0.44, 0.17, 0.22, { sides: 'q_toolchest_side', top: 'q_toolchest_side' }, { skip: ['bottom'] });
    mb.box(-0.22, 0.755, zc + 0.02, 0.2, 0.04, 0.03, 'plastic_black');
    torus(mb, 0.22, 0.62, zc + 0.02, 0.13, 0.035, 9, 3, 'plastic_yellow', { color: 0xffb070 });
    cbox(mb, -0.1, 1.045, zc, 0.5, 0.32, 0.46, 1, -0.04);
    cbox(mb, 0.3, 1.045, zc + 0.02, 0.3, 0.22, 0.36, 2, 0.15);
    // jars & rope
    for (let i = 0; i < 4; i++) mb.cylinder(-0.36 + i * 0.1, 1.505, zc + 0.08, 0.035, 0.13, 6, { sides: 'glass', top: 'metal_brass' }, { color: [0xd8c070, 0xb0d0c0, 0xc8a080, 0xd8c070][i] });
    torus(mb, 0.18, 1.53, zc, 0.14, 0.04, 9, 3, 'q_bark', { color: 0xd8c090 });
    cbox(mb, 0.0, 1.965, zc - 0.02, 0.62, 0.18, 0.4, 2, 0.03);
  },
});

defObj({
  key: 'workbench', name: 'Workbench', w: 2, d: 1, height: 1.95, block: 'table', surface: 0.9,
  container: { capacity: 30, kind: 'tool', loot: 'toolbox' },
  disassemble: { tools: ['#hammer', '#saw'], time: 40, skill: 'carpentry', yields: [['plank', 3, 5], ['nails', 4, 10], ['scrap_metal', 1, 3]] },
  sound: 'wood', flammable: 0.5,
  desc: 'A heavy bench with a pegboard of tool outlines. One outline is empty.',
  tags: [...T, 'workbench'],
  model: (mb) => {
    const zc = -0.1;
    // legs + rails
    for (const x of [-0.92, 0.92]) for (const z of [zc - 0.3, zc + 0.3]) mb.box(x, 0, z, 0.06, 0.83, 0.06, 'q_steel_dark', { skip: ['bottom'] });
    for (const x of [-0.92, 0.92]) mb.box(x, 0.18, zc, 0.04, 0.05, 0.6, 'q_steel_dark');
    mb.box(0, 0.16, zc, 1.82, 0.03, 0.62, { top: 'q_pallet_wood', sides: 'q_steel_dark' }, { skip: ['bottom'] });
    // top
    mb.box(0, 0.83, zc, 1.96, 0.07, 0.72, { top: 'q_bench_top', sides: 'q_bench_top' }, { skip: ['bottom'] });
    // drawer unit
    mb.box(0.55, 0.26, zc + 0.02, 0.56, 0.56, 0.6, { south: 'q_drawer_metal', sides: 'q_steel_grey', top: 'q_steel_grey' }, { fit: { south: true }, skip: ['bottom'] });
    // pegboard
    for (const x of [-0.95, 0.95]) mb.box(x, 0.9, zc - 0.33, 0.05, 1.05, 0.05, 'q_steel_dark', { skip: ['bottom'] });
    mb.box(0, 0.92, zc - 0.34, 1.88, 0.98, 0.025, { south: 'q_pegboard', sides: 'wood_dark', all: 'wood_dark' }, { fit: { south: true }, skip: ['bottom'] });
    mb.box(0, 1.9, zc - 0.34, 1.94, 0.05, 0.08, 'q_pallet_wood', { skip: ['bottom'] });
    // vice
    const vx = -0.78, vz = zc + 0.26;
    mb.box(vx, 0.9, vz - 0.04, 0.16, 0.06, 0.18, 'q_steel_blue', { skip: ['bottom'] });
    mb.box(vx, 0.96, vz - 0.08, 0.16, 0.1, 0.05, 'q_steel_blue', { skip: ['bottom'] });
    mb.box(vx, 0.96, vz + 0.04, 0.16, 0.1, 0.05, 'q_steel_blue', { skip: ['bottom'] });
    mb.box(vx, 0.995, vz + 0.12, 0.04, 0.04, 0.12, 'metal_grey');
    mb.box(vx, 1.0, vz + 0.18, 0.18, 0.02, 0.02, 'metal_grey');
    // clamp lamp
    mb.cylinder(0.85, 0.9, zc - 0.22, 0.05, 0.03, 6, 'q_steel_dark');
    rod(mb, 0.85, 0.93, zc - 0.22, 0.72, 1.35, zc - 0.12, 0.012, 4, 'metal_grey');
    rod(mb, 0.72, 1.35, zc - 0.12, 0.55, 1.25, zc + 0.05, 0.012, 4, 'metal_grey');
    mb.push(); mb.translate(0.55, 1.12, zc + 0.05); mb.rotateZ(0.5);
    mb.cylinder(0, 0, 0, 0.08, 0.13, 7, 'q_steel_green', { rTop: 0.035 });
    mb.pop();
    // clutter on the top
    mb.box(-0.25, 0.9, zc + 0.05, 0.3, 0.04, 0.18, 'q_steel_grey', { skip: ['bottom'] });
    for (let i = 0; i < 5; i++) mb.box(-0.36 + i * 0.055, 0.94, zc + 0.05, 0.02, 0.012, 0.02, 'metal_brass');
    mb.box(0.25, 0.9, zc + 0.12, 0.34, 0.006, 0.09, 'metal_brushed', { skip: ['bottom'] });
    mb.box(0.47, 0.9, zc + 0.12, 0.1, 0.03, 0.04, 'wood_dark', { skip: ['bottom'] });
    mb.box(0.05, 0.9, zc - 0.15, 0.22, 0.02, 0.16, 'fabric_red', { skip: ['bottom'] });
    mb.cylinder(-0.6, 0.9, zc - 0.18, 0.05, 0.13, 6, { sides: 'q_paint_can', top: 'q_paint_can_top' }, { fit: true });
    // lower shelf stuff
    mb.cylinder(-0.55, 0.19, zc + 0.02, 0.15, 0.28, 8, 'plastic_black', { rTop: 0.17 });
    cbox(mb, -0.1, 0.19, zc, 0.36, 0.25, 0.4, 2, 0.1);
  },
});

defObj({
  key: 'tool_chest', name: 'Rolling Tool Chest', w: 1, d: 1, height: 1.2, block: 'solid',
  container: { capacity: 25, kind: 'tool', loot: 'toolbox', lockable: true },
  disassemble: { tools: ['#screwdriver'], time: 18, skill: 'mechanics', yields: [['scrap_metal', 3, 6], ['screws', 3, 8]] },
  movable: 60, sound: 'metal',
  desc: 'Glossy red drawers that still glide perfectly. The bottom one sticks.',
  tags: [...T, 'storage'],
  model: (mb) => {
    const zc = -0.06;
    for (const x of [-0.29, 0.29]) for (const z of [zc - 0.18, zc + 0.18]) caster(mb, x, z, 0.04);
    mb.box(0, 0.075, zc, 0.7, 0.79, 0.46, { south: 'q_toolchest_front', sides: 'q_toolchest_side', top: 'q_toolchest_side' }, { fit: { south: true }, skip: ['bottom'] });
    mb.box(0, 0.865, zc, 0.72, 0.012, 0.48, 'plastic_black', { skip: ['bottom'] });
    mb.box(0, 0.877, zc - 0.01, 0.68, 0.3, 0.42, { south: 'q_toolchest_top', sides: 'q_toolchest_side', top: 'q_toolchest_side' }, { fit: { south: true }, skip: ['bottom'] });
    // side handle
    for (const z of [zc - 0.15, zc + 0.15]) mb.box(0.37, 0.72, z, 0.05, 0.03, 0.03, 'chrome');
    mb.box(0.4, 0.72, zc, 0.025, 0.03, 0.33, 'chrome');
    // clutter on top
    mb.box(-0.12, 1.177, zc + 0.04, 0.22, 0.012, 0.04, 'metal_brushed', { skip: ['bottom'] });
    mb.box(-0.02, 1.177, zc + 0.04, 0.06, 0.015, 0.06, 'metal_brushed', { skip: ['bottom'] });
    mb.cylinder(0.18, 1.177, zc - 0.05, 0.045, 0.14, 6, 'plastic_blue', { rTop: 0.035 });
    mb.box(0.18, 1.317, zc - 0.05, 0.02, 0.03, 0.02, 'plastic_red');
    mb.box(0.12, 1.177, zc + 0.1, 0.12, 0.03, 0.08, 'fabric_grey', { skip: ['bottom'] });
  },
});

defObj({
  key: 'generator', name: 'Portable Generator', w: 1, d: 1, height: 0.78, block: 'low',
  movable: 55, sound: 'metal', flammable: 0.3, hum: 'generator',
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 45, skill: 'electrical', yields: [['scrap_metal', 4, 8], ['wire', 2, 4], ['electronics_scrap', 2, 4], ['pipe', 1, 2], ['screws', 2, 6]] },
  desc: 'A gas generator in a tubular cage. Smells of old fuel and summer storms.',
  tags: [...T, 'generator', 'machine'],
  model: (mb) => {
    const F = 'metal_dark', r = 0.018;
    const hx = 0.4, hz = 0.27;
    // tubular frame: skids, uprights and top loop
    for (const z of [-hz, hz]) { rod(mb, -hx, 0.03, z, hx, 0.03, z, r, 6, F); rod(mb, -hx, 0.63, z, hx, 0.63, z, r, 6, F); }
    for (const x of [-hx, hx]) rod(mb, x, 0.63, -hz, x, 0.63, hz, r, 6, F);
    for (const x of [-hx, hx]) for (const z of [-hz, hz]) rod(mb, x, 0.03, z, x, 0.63, z, r, 6, F);
    mb.box(0, 0.0, 0, 0.82, 0.02, 0.06, F);
    // engine block with fins + alternator
    mb.box(-0.16, 0.05, 0, 0.32, 0.3, 0.32, { sides: 'q_steel_dark', top: 'q_grille_dark' }, { skip: ['bottom'] });
    for (let i = 0; i < 4; i++) mb.box(-0.16, 0.38 + i * 0.03, 0, 0.26, 0.012, 0.26, 'metal_dark');
    mb.box(-0.22, 0.16, 0.17, 0.12, 0.12, 0.04, 'plastic_black');
    mb.box(-0.29, 0.21, 0.2, 0.06, 0.03, 0.04, 'plastic_red');
    mb.cylinderX(0.17, 0.22, 0, 0.13, 0.3, 8, { sides: 'q_steel_blue', top: 'q_grille_dark', bottom: 'q_grille_dark' });
    // control panel
    mb.box(0.17, 0.12, 0.165, 0.26, 0.2, 0.03, { south: 'q_gen_panel', sides: 'metal_dark', top: 'metal_dark' }, { fit: { south: true } });
    // muffler
    mb.cylinderX(-0.05, 0.3, -0.2, 0.06, 0.24, 6, 'q_pipe_rust');
    rod(mb, 0.07, 0.3, -0.2, 0.12, 0.36, -0.27, 0.015, 5, 'q_pipe_rust');
    // fuel tank on top
    mb.box(0, 0.5, -0.01, 0.7, 0.13, 0.48, { top: 'q_gen_tank', sides: 'plastic_yellow' }, { fit: { top: true }, skip: ['bottom'], color: 0xfff2d0 });
    mb.cylinder(-0.15, 0.63, -0.01, 0.045, 0.04, 7, { sides: 'plastic_black', top: 'plastic_black' });
  },
});

defObj({
  key: 'water_heater', name: 'Water Heater', w: 1, d: 1, height: 1.95, block: 'solid',
  sound: 'metal', water: { capacity: 40, tap: false },
  disassemble: { tools: ['#wrench'], time: 30, skill: 'mechanics', yields: [['sheet_metal', 1, 3], ['pipe', 1, 3], ['scrap_metal', 2, 4]] },
  desc: 'Forty gallons of lukewarm, rust-tinted water. The pilot light is out.',
  tags: [...T, 'water', 'utility'],
  model: (mb) => {
    const zc = -0.12;
    mb.cylinder(0, 0, zc, 0.33, 0.04, 10, { sides: 'plastic_black', top: 'q_steel_dark' });
    for (let i = 0; i < 3; i++) { const a = i * 2.1; mb.box(Math.cos(a) * 0.2, 0.04, zc + Math.sin(a) * 0.2, 0.05, 0.06, 0.05, 'metal_dark'); }
    mb.cylinder(0, 0.1, zc, 0.28, 1.5, 12, { sides: 'q_heater_shell', top: 'q_heater_top', bottom: 'q_heater_top' }, { fit: true });
    // flue + draft hood
    mb.cylinder(0, 1.6, zc, 0.07, 0.08, 7, 'metal_grey');
    mb.cylinder(0, 1.68, zc, 0.13, 0.06, 7, 'metal_grey', { rTop: 0.08 });
    mb.cylinder(0, 1.74, zc, 0.075, 0.21, 7, 'metal_brushed');
    // copper supply lines
    for (const x of [-0.17, 0.17]) {
      mb.cylinder(x, 1.6, zc, 0.025, 0.35, 6, 'q_pipe_copper', { caps: false });
      mb.cylinder(x, 1.68, zc, 0.035, 0.04, 6, 'metal_brass');
    }
    handwheel(mb, -0.17, 1.82, zc + 0.05, 0.04, 'z', 'plastic_blue');
    // T&P valve + discharge pipe
    mb.box(0.28, 1.4, zc + 0.04, 0.07, 0.05, 0.05, 'metal_brass');
    rod(mb, 0.32, 1.42, zc + 0.04, 0.32, 0.15, zc + 0.04, 0.018, 6, 'q_pipe_copper');
    // gas control + line
    mb.box(0, 0.3, zc + 0.27, 0.12, 0.1, 0.06, 'q_steel_dark');
    mb.box(0.03, 0.33, zc + 0.3, 0.04, 0.04, 0.02, 'plastic_red');
    rod(mb, 0.06, 0.34, zc + 0.27, 0.36, 0.34, zc + 0.27, 0.014, 5, 'metal_dark');
  },
});

defObj({
  key: 'boiler', name: 'Boiler', w: 2, d: 2, height: 2.65, block: 'solid', blocksSight: true,
  sound: 'metal', hum: 'machine',
  desc: 'A riveted iron boiler, warm to the touch though nobody has fed it in years.',
  tags: [...T, 'machine', 'heat'],
  model: (mb) => {
    // plinth + saddles
    mb.box(0, 0, 0, 1.6, 0.18, 1.86, 'concrete', { skip: ['bottom'] });
    for (const z of [-0.5, 0.5]) mb.box(0, 0.18, z, 1.1, 0.32, 0.18, 'q_steel_dark', { skip: ['bottom'] });
    // drum (axis along z) — front head faces +z
    mb.cylinderZ(0, 0.95, -0.02, 0.62, 1.72, 14, 'q_boiler_shell', { caps: false });
    disc(mb, 0, 0.95, 0.84, 0.62, 14, 'q_boiler_head');
    mb.push(); mb.translate(0, 0.95, -0.88); mb.rotateY(Math.PI); disc(mb, 0, 0, 0, 0.62, 14, 'q_boiler_head'); mb.pop();
    // banding rings
    for (const z of [-0.6, 0.0, 0.6]) mb.cylinderZ(0, 0.95, z, 0.635, 0.05, 14, 'metal_dark', { caps: false });
    // firebox door + glow slit
    mb.box(0, 0.62, 0.86, 0.42, 0.42, 0.05, { south: 'q_boiler_door', sides: 'metal_dark', top: 'metal_dark' }, { fit: { south: true } });
    mb.box(0, 0.66, 0.89, 0.2, 0.05, 0.01, 'q_fire_glow', { fit: true, emissive: 1.4 });
    // gauge glass + pressure gauge
    mb.box(0.42, 0.95, 0.85, 0.05, 0.42, 0.04, 'q_gauge_glass', { fit: { south: true } });
    rod(mb, -0.4, 1.3, 0.8, -0.4, 1.3, 0.88, 0.015, 5, 'metal_brass');
    dial(mb, -0.4, 1.3, 0.88, 0.1);
    // steam dome + safety valve + header pipe up to the ceiling
    mb.cylinder(0, 1.5, -0.25, 0.2, 0.22, 10, { sides: 'q_boiler_shell', top: 'q_steel_dark' });
    mb.cylinder(0.3, 1.52, 0.2, 0.05, 0.25, 6, 'metal_brass');
    mb.cylinder(0.3, 1.77, 0.2, 0.07, 0.06, 6, 'metal_brass');
    mb.cylinder(0, 1.72, -0.25, 0.08, 0.93, 8, 'q_pipe_paint', { caps: false });
    mb.cylinder(0, 2.0, -0.25, 0.11, 0.05, 8, 'metal_dark');
    rod(mb, 0, 2.45, -0.25, 0, 2.45, -0.95, 0.08, 8, 'q_pipe_paint');
    mb.sphere(0, 2.45, -0.25, 0.09, 6, 4, 'q_pipe_paint');
    // smoke flue at the back
    mb.cylinder(-0.45, 1.3, -0.72, 0.16, 1.35, 8, 'q_pipe_rust', { caps: false });
    mb.cylinder(-0.45, 1.3, -0.72, 0.19, 0.08, 8, 'metal_dark');
    // side feed pipe with valve down to the floor
    rod(mb, 0.62, 0.95, 0.3, 0.85, 0.95, 0.3, 0.05, 7, 'q_pipe_rust');
    rod(mb, 0.85, 0.95, 0.3, 0.85, 0.0, 0.3, 0.05, 7, 'q_pipe_rust');
    mb.cylinder(0.85, 0.5, 0.3, 0.075, 0.1, 7, 'metal_dark');
    handwheel(mb, 0.85, 0.66, 0.3, 0.11, 'y');
    mb.cylinder(0.85, 0.58, 0.3, 0.015, 0.08, 4, 'metal_dark');
    // warning plate
    mb.box(-0.3, 0.32, 0.92, 0.2, 0.12, 0.01, 'q_hv_sign', { fit: true });
  },
});

defObj({
  key: 'pipes_cluster', name: 'Wall Pipes', w: 1, d: 1, height: 2.6, block: 'none', onWall: true,
  sound: 'metal',
  disassemble: { tools: ['#wrench'], time: 25, skill: 'mechanics', yields: [['pipe', 2, 4], ['scrap_metal', 1, 2]] },
  desc: 'Pipes that run along the wall and into it. Something knocks inside, twice.',
  tags: [...T, 'decor', 'pipes'],
  model: (mb) => {
    const zw = -0.5;
    // horizontal runs span the whole tile so neighbours join seamlessly
    const run = (y: number, r: number, z: number, tex: string) => { mb.cylinderX(0, y, z, r, 1.0, 8, tex, { caps: false }); };
    run(2.32, 0.075, zw + 0.1, 'q_pipe_paint');
    run(2.08, 0.045, zw + 0.07, 'q_pipe_copper');
    run(0.32, 0.09, zw + 0.12, 'q_pipe_rust');
    run(1.15, 0.03, zw + 0.05, 'metal_dark');
    // flanges on the big runs
    for (const x of [-0.3, 0.32]) { mb.cylinderX(x, 2.32, zw + 0.1, 0.1, 0.04, 8, 'metal_dark'); }
    mb.cylinderX(-0.05, 0.32, zw + 0.12, 0.12, 0.05, 8, 'metal_dark');
    // brackets
    for (const x of [-0.42, 0.42]) {
      mb.box(x, 2.2, zw + 0.06, 0.04, 0.22, 0.12, 'q_steel_dark');
      mb.box(x, 0.2, zw + 0.07, 0.04, 0.24, 0.14, 'q_steel_dark');
    }
    // vertical riser with elbows, valve and gauge
    mb.cylinder(0.22, 0.42, zw + 0.12, 0.06, 1.83, 8, 'q_pipe_paint', { caps: false });
    mb.sphere(0.22, 2.3, zw + 0.12, 0.075, 7, 4, 'q_pipe_paint');
    mb.cylinder(0.22, 0.32, zw + 0.12, 0.095, 0.12, 8, 'metal_dark');
    mb.cylinder(0.22, 1.25, zw + 0.12, 0.085, 0.16, 8, 'metal_dark');
    handwheel(mb, 0.22, 1.33, zw + 0.27, 0.12, 'z');
    rod(mb, 0.22, 1.33, zw + 0.18, 0.22, 1.33, zw + 0.26, 0.015, 4, 'metal_dark');
    rod(mb, 0.22, 1.7, zw + 0.12, 0.22, 1.7, zw + 0.24, 0.014, 4, 'metal_brass');
    dial(mb, 0.22, 1.7, zw + 0.24, 0.07, 'q_gauge_b');
    // small drain pipe dropping to the floor with a drip stain
    rod(mb, -0.25, 0.32, zw + 0.12, -0.25, 0.0, zw + 0.12, 0.03, 6, 'q_pipe_rust');
    mb.cylinder(-0.25, 0.002, zw + 0.12, 0.12, 0.004, 8, 'water', { color: 0x8a7a5a });
  },
});

defObj({
  key: 'electrical_cabinet', name: 'Power Cabinet', w: 1, d: 1, height: 2.7, block: 'solid', blocksSight: true,
  sound: 'metal', hum: 'fluoro',
  disassemble: { tools: ['#screwdriver'], time: 35, skill: 'electrical', yields: [['wire', 2, 5], ['electronics_scrap', 1, 3], ['fuse', 1, 3], ['sheet_metal', 1, 2]] },
  desc: 'Distribution cabinet. Warm, humming, stencilled with a circuit number that keeps changing.',
  tags: [...T, 'breaker', 'electrical'],
  model: (mb) => {
    const zc = -0.24;
    mb.box(0, 0, zc, 0.92, 0.08, 0.46, 'metal_dark', { skip: ['bottom'] });
    mb.box(0, 0.08, zc, 0.9, 1.92, 0.44, { south: 'q_elec_front', sides: 'q_steel_grey', top: 'q_steel_grey' }, { fit: { south: true }, skip: ['bottom'] });
    mb.box(0, 2.0, zc, 0.96, 0.04, 0.5, 'q_steel_dark', { skip: ['bottom'] });
    // door handles proud of the surface
    for (const x of [-0.08, 0.08]) mb.box(x, 0.86, zc + 0.225, 0.03, 0.22, 0.03, 'metal_dark');
    // conduits up to the ceiling
    for (const x of [-0.3, -0.1, 0.25]) { mb.cylinder(x, 2.04, zc - 0.05, 0.035, 0.66, 6, 'metal_grey', { caps: false }); mb.cylinder(x, 2.04, zc - 0.05, 0.05, 0.05, 6, 'metal_dark'); }
    // status lamps on the top edge
    mb.box(0.32, 1.9, zc + 0.225, 0.04, 0.04, 0.02, 'led_green', { emissive: 1.2 });
    mb.box(0.38, 1.9, zc + 0.225, 0.04, 0.04, 0.02, 'led_red', { emissive: 0.4 });
  },
});

defObj({
  key: 'transformer', name: 'Transformer', w: 2, d: 1, height: 1.75, block: 'solid',
  sound: 'metal', hum: 'machine', hp: 2000,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 90, skill: 'electrical', yields: [['wire', 6, 12], ['scrap_metal', 4, 8], ['sheet_metal', 2, 4]] },
  desc: 'An oil-filled transformer. The fins tick as they cool, even when nothing runs.',
  tags: [...T, 'electrical', 'machine'],
  model: (mb) => {
    mb.box(0, 0, 0, 1.92, 0.1, 0.92, 'concrete', { skip: ['bottom'] });
    mb.box(0, 0.1, 0, 1.0, 1.15, 0.66, 'q_transformer', { skip: ['bottom'] });
    mb.box(0, 1.25, 0, 1.06, 0.05, 0.72, 'q_steel_dark', { skip: ['bottom'] });
    // radiator fin banks on both sides
    for (const s of [-1, 1]) {
      for (let i = 0; i < 7; i++) mb.box(s * 0.58 + s * i * 0.045, 0.2, 0, 0.018, 0.92, 0.56, 'q_transformer', { skip: ['bottom'], uvOffset: [i * 0.13, 0] });
      mb.box(s * 0.72, 1.12, 0, 0.32, 0.05, 0.08, 'q_steel_dark');
      mb.box(s * 0.72, 0.17, 0, 0.32, 0.05, 0.08, 'q_steel_dark');
    }
    // HV bushings (porcelain discs)
    for (const x of [-0.3, 0, 0.3]) {
      mb.cylinder(x, 1.3, -0.12, 0.035, 0.36, 6, 'q_porcelain_brown', { caps: false });
      for (let k = 0; k < 3; k++) mb.cylinder(x, 1.36 + k * 0.09, -0.12, 0.07, 0.035, 7, 'q_porcelain_brown');
      mb.cylinder(x, 1.66, -0.12, 0.025, 0.06, 5, 'metal_brass');
    }
    // conservator tank
    mb.cylinderX(0.25, 1.48, 0.22, 0.12, 0.6, 8, 'q_transformer');
    rod(mb, 0.25, 1.3, 0.22, 0.25, 1.38, 0.22, 0.02, 5, 'metal_dark');
    // LV terminals + sign
    for (const x of [-0.25, 0, 0.25]) mb.cylinder(x, 1.3, 0.2, 0.025, 0.08, 5, 'metal_brass');
    mb.box(0, 0.65, 0.335, 0.2, 0.24, 0.01, 'q_hv_sign', { fit: true });
  },
});

defObj({
  key: 'vent_wall', name: 'Wall Vent', w: 1, d: 1, height: 0.6, block: 'none', onWall: true,
  sound: 'metal',
  desc: 'A low ventilation grille. One slat is bent outward, from the inside.',
  tags: [...T, 'vent'],
  model: (mb) => {
    // wall faces sit at z = -0.44 (0.12 m walls), so the grille must stand proud of that
    mb.box(0, 0.06, -0.425, 0.74, 0.5, 0.04, { south: 'q_vent_wall', sides: 'metal_grey', top: 'metal_grey' }, { fit: { south: true }, skip: ['bottom'] });
    mb.box(0, 0.04, -0.42, 0.78, 0.02, 0.05, 'metal_grey');
  },
});

defObj({
  key: 'vent_floor', name: 'Floor Grate', w: 1, d: 1, height: 0.04, block: 'none',
  sound: 'metal',
  desc: 'A heavy floor grate over a drop into the dark. It is not bolted down.',
  tags: [...T, 'vent'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.06);
    mb.box(0, 0.0, 0, 0.82, 0.03, 0.82, { top: 'q_floor_grate', sides: 'metal_dark' }, { fit: { top: true }, skip: ['bottom'] });
    mb.pop();
  },
});

defObj({
  key: 'manhole', name: 'Manhole Cover', w: 1, d: 1, height: 0.04, block: 'none',
  sound: 'metal',
  desc: 'Cast iron, slightly ajar. Warm air breathes out of the gap.',
  tags: [...T, 'portal', 'manhole'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.44, 0.012, 14, { sides: 'concrete', top: 'concrete' }, { color: 0xb0aca4 });
    mb.cylinder(0, 0.004, 0, 0.37, 0.012, 14, 'q_void');
    mb.cylinder(0.07, 0.006, 0.02, 0.38, 0.03, 14, { sides: 'metal_dark', top: 'q_manhole' }, { fit: true });
  },
});

defObj({
  key: 'ladder_wall', name: 'Wall Ladder', w: 1, d: 1, height: 2.7, block: 'none', onWall: true,
  sound: 'metal',
  desc: 'A steel ladder bolted to the wall, climbing into a hatch that should not fit.',
  tags: [...T, 'portal', 'ladder'],
  model: (mb) => {
    const z = -0.36;
    for (const x of [-0.23, 0.23]) {
      mb.box(x, 0, z, 0.05, 2.7, 0.05, 'q_paint_yellow', { skip: ['bottom'] });
      for (const y of [0.35, 1.4, 2.45]) mb.box(x, y, (z - 0.5) / 2, 0.04, 0.05, 0.5 + z - 0.02, 'q_steel_dark');
    }
    for (let y = 0.28; y < 2.65; y += 0.28) mb.box(0, y, z, 0.42, 0.03, 0.03, 'metal_grey');
    // hatch frame up at the ceiling
    mb.box(0, 2.6, -0.3, 0.7, 0.08, 0.4, 'q_steel_dark', { skip: ['bottom'] });
    mb.box(0, 2.62, -0.3, 0.6, 0.07, 0.32, 'q_void');
  },
});

defObj({
  key: 'barrel_oil', name: 'Oil Drum', w: 1, d: 1, height: 0.9, block: 'solid',
  container: { capacity: 30, kind: 'bin', loot: 'generic' },
  movable: 25, sound: 'metal', flammable: 0.4,
  desc: 'A 55-gallon drum. It sloshes, faintly, when you are not touching it.',
  tags: [...T, 'storage', 'pushable'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.29, 0.88, 12, { sides: 'q_drum_side', top: 'q_drum_top', bottom: 'q_drum_top' }, { fit: true });
    for (const y of [0.0, 0.86]) mb.cylinder(0, y, 0, 0.297, 0.022, 12, 'metal_dark', { caps: false });
  },
});

defObj({
  key: 'rain_collector', name: 'Rain Collector', w: 1, d: 1, height: 1.45, block: 'solid',
  water: { capacity: 40, tap: true, tainted: true },
  disassemble: { tools: ['#hammer'], time: 20, skill: 'carpentry', yields: [['plank', 1, 2], ['rag', 1, 3]] },
  sound: 'plastic', flammable: 0.2,
  desc: 'A barrel under a tarp funnel. Rainwater should be boiled. Rain here is not quite water.',
  tags: [...T, 'survival', 'rain', 'buildable', 'water'],
  model: (mb) => {
    // cinder block stand
    for (const x of [-0.17, 0.17]) mb.box(x, 0, 0, 0.3, 0.19, 0.38, 'q_cinder', { skip: ['bottom'] });
    mb.cylinder(0, 0.19, 0, 0.27, 0.82, 12, { sides: 'q_plastic_drum', top: 'plastic_blue' });
    // spigot
    mb.box(0, 0.27, 0.27, 0.05, 0.04, 0.08, 'metal_brass');
    mb.box(0, 0.24, 0.31, 0.025, 0.05, 0.025, 'metal_brass');
    // corner sticks
    const c = 0.44;
    for (const x of [-c, c]) for (const z of [-c, c]) rod(mb, x, 0, z, x * 0.98, 1.45, z * 0.98, 0.022, 4, 'q_pallet_wood');
    // tarp funnel: four sloped quads from the stick tops down to the barrel mouth
    const top = 1.4, low = 1.06, ri = 0.13;
    const P = [[-c, top, c], [c, top, c], [c, top, -c], [-c, top, -c]];
    const I = [[-ri, low, ri], [ri, low, ri], [ri, low, -ri], [-ri, low, -ri]];
    for (let k = 0; k < 4; k++) {
      const a = P[k], b = P[(k + 1) % 4], ia = I[k], ib = I[(k + 1) % 4];
      // sag the outer edge midpoint a little by splitting into two quads
      const mid = [(a[0] + b[0]) / 2, top - 0.08, (a[2] + b[2]) / 2], imid = [(ia[0] + ib[0]) / 2, low, (ia[2] + ib[2]) / 2];
      mb.quadRaw([a, mid, imid, ia], [[0, 1], [0.5, 1], [0.5, 0], [0, 0]], 'q_tarp_blue', 0xffffff, 0.95);
      mb.quadRaw([mid, b, ib, imid], [[0.5, 1], [1, 1], [1, 0], [0.5, 0]], 'q_tarp_blue', 0xffffff, 0.9);
      // underside
      mb.quadRaw([ia, imid, mid, a], [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], 'q_tarp_blue', 0xb0b0b0, 0.7);
      mb.quadRaw([imid, ib, b, mid], [[0.5, 0], [1, 0], [1, 1], [0.5, 1]], 'q_tarp_blue', 0xb0b0b0, 0.7);
    }
    mb.flat(0, low + 0.005, 0, ri * 2, ri * 2, 'water', { fit: false });
    for (const x of [-c, c]) for (const z of [-c, c]) mb.box(x, top - 0.04, z, 0.06, 0.05, 0.06, 'fabric_brown');
  },
});

defObj({
  key: 'pallet', name: 'Pallet', w: 1, d: 1, height: 0.14, block: 'low',
  movable: 22, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#crowbar'], time: 20, skill: 'carpentry', yields: [['plank', 2, 4], ['nails', 4, 10]] },
  desc: 'A wooden shipping pallet, stamped with a mark you do not recognise.',
  tags: [...T, 'pallet'],
  model: (mb) => pallet(mb),
});

defObj({
  key: 'pallet_boxes', name: 'Pallet of Boxes', w: 1, d: 1, height: 1.2, block: 'solid', blocksSight: true,
  container: { capacity: 50, kind: 'crate', loot: 'crate_supplies' },
  sound: 'paper', flammable: 0.7,
  desc: 'Boxes stacked on a pallet and strapped down. The shipping labels are all addressed here.',
  tags: [...T, 'storage'],
  model: (mb) => {
    pallet(mb);
    const y0 = 0.141;
    cbox(mb, -0.25, y0, -0.2, 0.48, 0.42, 0.38, 0); cbox(mb, 0.25, y0, -0.2, 0.48, 0.42, 0.38, 1);
    cbox(mb, -0.25, y0, 0.2, 0.48, 0.42, 0.38, 2); cbox(mb, 0.25, y0, 0.2, 0.48, 0.42, 0.38, 0);
    cbox(mb, -0.25, y0 + 0.42, -0.2, 0.48, 0.4, 0.38, 1); cbox(mb, 0.25, y0 + 0.42, -0.2, 0.48, 0.4, 0.38, 2);
    cbox(mb, -0.23, y0 + 0.42, 0.21, 0.46, 0.4, 0.36, 0, 0.05);
    cbox(mb, 0.0, y0 + 0.82, -0.18, 0.5, 0.24, 0.4, 2, -0.12);
    // straps
    for (const x of [-0.3, 0.3]) {
      mb.box(x, y0 + 0.82, -0.2, 0.04, 0.008, 0.4, 'plastic_black');
      mb.box(x, y0, -0.395, 0.04, 0.82, 0.008, 'plastic_black');
    }
  },
});

defObj({
  key: 'crate_wood', name: 'Wooden Crate', w: 1, d: 1, height: 0.78, block: 'solid',
  container: { capacity: 40, kind: 'crate', loot: 'crate_supplies' },
  movable: 30, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#crowbar'], time: 15, skill: 'carpentry', yields: [['plank', 2, 4], ['nails', 3, 8]] },
  desc: 'A nailed shipping crate. NO.7 — there are always seven.',
  tags: [...T, 'storage', 'pushable'],
  model: (mb) => {
    mb.push(); mb.rotateY(-0.05);
    mb.box(0, 0, 0, 0.84, 0.74, 0.84, { sides: 'q_crate_side', top: 'q_crate_top' }, { fit: true, skip: ['bottom'] });
    for (const x of [-0.43, 0.43]) for (const z of [-0.43, 0.43]) mb.box(x, 0, z, 0.04, 0.76, 0.04, 'wood_dark', { skip: ['bottom'] });
    for (const x of [-0.43, 0.43]) mb.box(x, 0.3, 0, 0.03, 0.12, 0.2, 'fabric_brown');
    mb.pop();
  },
});

defObj({
  key: 'cardboard_box', name: 'Cardboard Box', w: 1, d: 1, height: 0.38, block: 'low',
  container: { capacity: 15, kind: 'box', loot: 'generic' },
  movable: 4, sound: 'paper', flammable: 1,
  desc: 'A taped box. Someone wrote a name on it, then scribbled it out.',
  tags: [...T, 'storage', 'box'],
  model: (mb) => { cbox(mb, 0.02, 0, 0.0, 0.55, 0.36, 0.44, 0, 0.14); },
});

defObj({
  key: 'cardboard_stack', name: 'Stacked Boxes', w: 1, d: 1, height: 1.3, block: 'solid', blocksSight: true,
  container: { capacity: 30, kind: 'box', loot: 'generic' },
  sound: 'paper', flammable: 1,
  desc: 'Moving boxes stacked like someone was always about to leave.',
  tags: [...T, 'storage', 'box'],
  model: (mb) => {
    cbox(mb, -0.2, 0, -0.08, 0.46, 0.42, 0.62, 0, 0.03);
    cbox(mb, 0.25, 0, -0.06, 0.42, 0.38, 0.55, 1, -0.06);
    cbox(mb, 0.02, 0.42, -0.05, 0.7, 0.4, 0.52, 2, 0.1);
    cbox(mb, -0.08, 0.82, -0.08, 0.5, 0.3, 0.42, 1, -0.18);
    cbox(mb, 0.12, 1.12, -0.04, 0.3, 0.18, 0.3, 0, 0.35);
    cbox(mb, 0.28, 0, 0.32, 0.3, 0.22, 0.26, 2, 0.5);
  },
});

defObj({
  key: 'dumpster', name: 'Dumpster', w: 2, d: 1, height: 1.28, block: 'solid',
  container: { capacity: 80, kind: 'trash', loot: 'dumpster' },
  sound: 'metal', hp: 1500,
  desc: 'A green steel dumpster. One lid is propped open on something soft.',
  tags: [...T, 'trash', 'outdoor', 'storage'],
  model: (mb) => {
    const zc = -0.02;
    for (const x of [-0.78, 0.78]) for (const z of [zc - 0.36, zc + 0.36]) caster(mb, x, z, 0.05);
    mb.box(0, 0.1, zc, 1.82, 1.04, 0.96, { south: 'q_dumpster_front', north: 'q_dumpster_front', east: 'q_dumpster_end', west: 'q_dumpster_end', top: 'q_void' }, { fit: true, skip: ['bottom'] });
    // rim
    mb.box(0, 1.12, zc + 0.47, 1.86, 0.06, 0.05, 'q_steel_green');
    mb.box(0, 1.12, zc - 0.47, 1.86, 0.06, 0.05, 'q_steel_green');
    // fork pockets
    for (const s of [-1, 1]) mb.box(s * 0.94, 0.55, zc, 0.06, 0.14, 0.8, 'q_steel_green');
    // lids: left closed (sloping), right propped open on a trash bag
    mb.push(); mb.translate(-0.46, 1.16, zc - 0.48); mb.rotateX(0.06);
    mb.box(0, 0, 0.5, 0.9, 0.04, 1.0, 'q_dumpster_lid');
    mb.pop();
    mb.push(); mb.translate(0.46, 1.16, zc - 0.48); mb.rotateX(-0.42);
    mb.box(0, 0, 0.5, 0.9, 0.04, 1.0, 'q_dumpster_lid');
    mb.pop();
    mb.sphere(0.38, 1.08, zc + 0.12, 0.22, 7, 4, 'q_trashbag', { sy: 0.6 });
    mb.box(0.33, 1.2, zc + 0.3, 0.12, 0.02, 0.16, 'cardboard');
  },
});

defObj({
  key: 'trash_bags', name: 'Trash Bags', w: 1, d: 1, height: 0.62, block: 'low',
  container: { capacity: 20, kind: 'pile', loot: 'trash' },
  sound: 'plastic', flammable: 0.8,
  desc: 'Knotted garbage bags. One of them is breathing. No — it is just settling.',
  tags: [...T, 'trash'],
  model: (mb) => {
    const bag = (x: number, z: number, r: number, h: number, tex: string, tie = true) => {
      mb.sphere(x, h * 0.5, z, r, 7, 5, tex, { sy: h / (2 * r) });
      if (tie) { mb.cylinder(x, h * 0.92, z, r * 0.18, r * 0.35, 5, tex, { rTop: r * 0.06 }); mb.box(x + 0.02, h * 0.92 + r * 0.3, z, 0.08, 0.02, 0.03, tex); }
    };
    bag(-0.2, -0.15, 0.28, 0.5, 'q_trashbag');
    bag(0.18, -0.2, 0.26, 0.46, 'q_trashbag');
    bag(0.02, 0.18, 0.25, 0.42, 'q_trashbag_white');
    bag(-0.25, 0.22, 0.2, 0.3, 'q_trashbag', false);
    mb.box(0.3, 0.0, 0.3, 0.14, 0.05, 0.1, 'cardboard');
  },
});

defObj({
  key: 'mop_bucket', name: 'Mop Bucket', w: 1, d: 1, height: 1.25, block: 'low',
  movable: 8, sound: 'plastic',
  desc: 'Grey water with a skin on it. The mop is still damp.',
  tags: [...T, 'janitorial'],
  model: (mb) => {
    for (const x of [-0.2, 0.2]) for (const z of [-0.13, 0.13]) caster(mb, x, z, 0.03);
    mb.box(0, 0.06, 0, 0.52, 0.32, 0.36, { sides: 'plastic_yellow', top: 'q_mop_water' }, { fit: { top: true }, skip: ['bottom'], color: 0xfff0b0 });
    mb.box(0, 0.38, 0.17, 0.54, 0.03, 0.03, 'plastic_yellow');
    mb.box(0, 0.38, -0.17, 0.54, 0.03, 0.03, 'plastic_yellow');
    // wringer
    mb.box(0.13, 0.38, 0, 0.2, 0.18, 0.3, 'plastic_black', { skip: ['bottom'] });
    rod(mb, 0.22, 0.52, 0, 0.36, 0.95, 0, 0.018, 4, 'metal_grey');
    mb.box(0.37, 0.93, 0, 0.04, 0.12, 0.04, 'plastic_black');
    // mop leaning in the wringer
    rod(mb, 0.1, 0.4, 0.02, -0.08, 1.25, -0.08, 0.016, 6, 'wood_light');
    mb.box(0.1, 0.33, 0.0, 0.16, 0.16, 0.16, 'q_mop_strands');
  },
});

defObj({
  key: 'janitor_cart', name: 'Janitor Cart', w: 1, d: 1, height: 1.15, block: 'solid',
  container: { capacity: 30, kind: 'shelf', loot: 'janitor' },
  movable: 20, sound: 'plastic',
  desc: 'A cleaning cart parked mid-shift. The schedule clipped to it is for tomorrow.',
  tags: [...T, 'janitorial', 'storage'],
  model: (mb) => {
    for (const x of [-0.35, 0.35]) for (const z of [-0.18, 0.18]) caster(mb, x, z, 0.04);
    mb.box(0, 0.08, 0, 0.9, 0.06, 0.48, 'plastic_black', { skip: ['bottom'] });
    for (const x of [-0.43, 0.43]) mb.box(x, 0.14, -0.2, 0.04, 0.85, 0.04, 'plastic_black', { skip: ['bottom'] });
    mb.box(0.15, 0.55, -0.02, 0.56, 0.04, 0.44, 'plastic_black', { skip: ['bottom'] });
    mb.box(0.15, 0.95, -0.05, 0.56, 0.04, 0.38, 'plastic_black', { skip: ['bottom'] });
    mb.box(0.15, 0.99, -0.23, 0.56, 0.06, 0.02, 'plastic_black');
    // vinyl bag on its frame
    mb.box(-0.27, 0.16, 0.02, 0.32, 0.8, 0.42, { sides: 'q_janitor_bag', top: 'q_void' }, { skip: ['bottom'] });
    mb.box(-0.27, 0.95, 0.02, 0.36, 0.04, 0.46, 'plastic_black', { skip: ['bottom'] });
    // bucket & supplies
    mb.cylinder(0.25, 0.14, 0.02, 0.16, 0.26, 8, 'plastic_blue', { rTop: 0.17 });
    mb.cylinder(0.25, 0.38, 0.02, 0.13, 0.005, 8, 'q_mop_water', { fit: true });
    const bottle = (x: number, z: number, c: number) => {
      mb.cylinder(x, 0.99, z, 0.035, 0.17, 6, { sides: 'plastic_white', top: 'plastic_white' }, { color: c });
      mb.box(x, 1.16, z, 0.04, 0.05, 0.05, 'plastic_white');
      mb.box(x, 1.17, z + 0.035, 0.015, 0.02, 0.03, 'plastic_white', { color: 0xc04040 });
    };
    bottle(0.0, 0.0, 0x80b8ff); bottle(0.1, 0.05, 0x90e090); bottle(0.2, -0.02, 0xff9ad0);
    mb.cylinder(0.33, 0.99, 0.05, 0.06, 0.12, 7, 'paper');
    mb.cylinder(0.08, 0.59, -0.1, 0.06, 0.12, 7, 'paper');
    cbox(mb, 0.25, 0.59, -0.05, 0.22, 0.14, 0.2, 1);
    rod(mb, 0.4, 0.14, -0.15, 0.45, 1.3, -0.2, 0.015, 5, 'wood_light');
    mb.box(0.05, 0.75, 0.2, 0.12, 0.17, 0.01, 'q_clipboard', { fit: true });
  },
});

defObj({
  key: 'sawhorse', name: 'Sawhorse', w: 1, d: 1, height: 0.75, block: 'low',
  movable: 6, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 10, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 2, 6]] },
  desc: 'A paint-spattered sawhorse.',
  tags: [...T, 'carpentry'],
  model: (mb) => {
    mb.box(0, 0.66, 0, 1.0, 0.09, 0.09, 'q_pallet_wood');
    for (const x of [-0.38, 0.38]) for (const s of [-1, 1]) rod(mb, x, 0.68, s * 0.03, x + Math.sign(x) * 0.08, 0, s * 0.22, 0.025, 4, 'q_pallet_wood');
    for (const x of [-0.41, 0.41]) mb.box(x, 0.3, 0, 0.03, 0.08, 0.3, 'q_pallet_wood');
    mb.box(0.1, 0.75, 0.0, 0.08, 0.002, 0.05, 'plastic_white', { color: 0x9ad0ff });
  },
});

defObj({
  key: 'pump_machine', name: 'Pool Pump', w: 2, d: 1, height: 1.35, block: 'solid',
  sound: 'metal', hum: 'machine', power: true, hp: 1200,
  desc: 'The circulation pump for the pools. If it stops, the water stops moving. Then other things move.',
  tags: [...T, 'pool', 'pump', 'mission', 'machine'],
  model: (mb) => {
    mb.box(0, 0, 0, 1.92, 0.1, 0.9, 'concrete', { skip: ['bottom'] });
    // motor with fan cowl, feet and junction box
    for (const x of [-0.62, -0.32]) mb.box(x, 0.1, 0, 0.06, 0.1, 0.36, 'q_steel_dark');
    mb.cylinderX(-0.48, 0.38, 0, 0.21, 0.56, 10, { sides: 'q_motor', top: 'q_steel_blue', bottom: 'q_steel_blue' });
    mb.cylinderX(-0.82, 0.38, 0, 0.19, 0.12, 10, { sides: 'q_steel_blue', top: 'q_grille_dark', bottom: 'q_grille_dark' });
    mb.box(-0.45, 0.58, 0.0, 0.16, 0.1, 0.16, 'q_steel_blue', { skip: ['bottom'] });
    rod(mb, -0.45, 0.68, 0, -0.45, 1.35, -0.3, 0.02, 5, 'metal_grey');
    mb.box(-0.48, 0.34, 0.21, 0.12, 0.08, 0.01, 'q_motor_plate', { fit: true });
    // coupling guard
    mb.box(-0.12, 0.24, 0, 0.18, 0.28, 0.24, 'q_hazard', { skip: ['bottom'] });
    // pump volute + suction / discharge
    mb.cylinderZ(0.1, 0.38, 0, 0.22, 0.2, 10, { sides: 'q_steel_blue', top: 'q_steel_blue', bottom: 'q_steel_blue' });
    mb.box(0.1, 0.1, 0, 0.26, 0.08, 0.2, 'q_steel_dark');
    rod(mb, 0.32, 0.38, 0, 0.55, 0.38, 0, 0.07, 8, 'q_pvc');
    // strainer pot
    mb.cylinder(0.62, 0.1, 0, 0.14, 0.42, 9, 'q_steel_blue');
    discY(mb, 0.62, 0.522, 0, 0.13, 9, 'q_strainer_lid');
    // discharge riser to filter, with valve
    rod(mb, 0.1, 0.6, 0, 0.1, 1.05, 0, 0.065, 8, 'q_pvc');
    rod(mb, 0.1, 1.05, 0, 0.62, 1.05, -0.25, 0.065, 8, 'q_pvc');
    mb.sphere(0.1, 1.05, 0, 0.08, 6, 4, 'q_pvc');
    mb.box(0.1, 0.8, 0, 0.12, 0.1, 0.12, 'plastic_red');
    rod(mb, 0.1, 0.9, 0, 0.1, 0.94, 0.16, 0.015, 4, 'plastic_red');
    // sand filter tank
    mb.cylinder(0.72, 0.1, -0.22, 0.25, 0.85, 10, 'q_filter_tank');
    mb.cylinder(0.72, 0.95, -0.22, 0.25, 0.14, 10, 'q_filter_tank', { rTop: 0.13 });
    mb.cylinder(0.72, 1.09, -0.22, 0.12, 0.08, 8, 'plastic_black');
    mb.box(0.72, 1.17, -0.22, 0.04, 0.03, 0.22, 'plastic_black');
    dial(mb, 0.86, 1.14, -0.17, 0.05);
    // drain + label
    rod(mb, 0.72, 0.2, 0.03, 0.72, 0.2, 0.36, 0.03, 6, 'q_pvc');
    mb.box(0.62, 0.48, 0.255, 0.18, 0.1, 0.01, 'q_motor_plate', { fit: true });
  },
});

defObj({
  key: 'pump_control', name: 'Pump Control Console', w: 1, d: 1, height: 1.6, block: 'solid',
  power: true, sound: 'metal', hum: 'machine',
  light: { color: 0x9adfa0, intensity: 0.25, radius: 2.0, y: 1.2, kind: 'screen', power: true },
  desc: 'Levers, dials and a big red button. The log sheet ends mid-sentence.',
  tags: [...T, 'pool', 'pump', 'mission'],
  model: (mb) => {
    const zc = -0.08;
    mb.box(0, 0, zc, 0.98, 0.06, 0.6, 'metal_dark', { skip: ['bottom'] });
    mb.box(0, 0.06, zc, 0.95, 0.8, 0.56, { sides: 'q_steel_cream', top: 'q_steel_cream' }, { skip: ['bottom'] });
    mb.box(0, 0.25, zc + 0.285, 0.7, 0.42, 0.01, 'q_grille', { fit: true });
    // slanted desk panel
    mb.wedge(0, 0.86, zc, 0.95, 0.56, 0.28, 0.06, { top: 'q_console_panel', sides: 'q_steel_cream' });
    // upright meter panel
    mb.box(0, 1.14, zc - 0.24, 0.95, 0.46, 0.08, { south: 'q_meter_panel', sides: 'q_steel_cream', top: 'q_steel_cream' }, { fit: { south: true }, skip: ['bottom'] });
    mb.box(0, 1.6, zc - 0.24, 0.99, 0.03, 0.1, 'metal_dark');
    // levers, lamps and e-stop sit on the sloped panel surface
    const topAt = (z: number) => 0.86 + 0.28 + (0.06 - 0.28) * ((z - (zc - 0.28)) / 0.56);
    const lever = (x: number, z: number, tilt: number, knob: string) => {
      mb.push(); mb.translate(x, topAt(z) - 0.01, z); mb.rotateX(tilt);
      mb.box(0, 0, 0, 0.02, 0.2, 0.02, 'chrome');
      mb.box(0, 0.19, 0, 0.045, 0.045, 0.045, knob);
      mb.pop();
    };
    lever(-0.36, zc + 0.02, 0.5, 'plastic_black'); lever(-0.28, zc + 0.02, -0.3, 'plastic_black'); lever(-0.2, zc + 0.02, 0.5, 'plastic_red');
    const lamp = (x: number, z: number, tex: string, e: number) => mb.box(x, topAt(z) - 0.012, z, 0.035, 0.03, 0.035, tex, { emissive: e });
    lamp(0.05, zc + 0.12, 'led_green', 1.3); lamp(0.12, zc + 0.12, 'led_red', 0.3); lamp(0.19, zc + 0.12, 'plastic_yellow', 1.0);
    mb.cylinder(0.33, topAt(zc - 0.05) - 0.02, zc - 0.05, 0.05, 0.06, 8, 'plastic_red', { emissive: 0.15 });
    // log clipboard hanging on the side
    mb.box(0.48, 0.45, zc + 0.05, 0.01, 0.34, 0.25, { east: 'q_clipboard', sides: 'wood_dark' }, { fit: { east: true } });
  },
});

defObj({
  key: 'fuse_panel_big', name: 'Main Fuse Panel', w: 1, d: 1, height: 2.7, block: 'none', onWall: true,
  power: false, sound: 'metal', hum: 'fluoro',
  desc: 'The main fuse board. Three fuses are missing, one is blown black.',
  tags: [...T, 'breaker', 'mission', 'electrical'],
  model: (mb) => {
    const zc = -0.39;
    mb.box(0, 0.68, zc, 1.0, 1.38, 0.2, { south: 'q_fuse_panel', sides: 'q_steel_grey', top: 'q_steel_grey' }, { fit: { south: true }, skip: ['bottom'] });
    // open door swung out from the left hinge
    mb.push(); mb.translate(-0.5, 0.68, zc + 0.1); mb.rotateY(-1.9);
    mb.box(0.5, 0, 0.0, 1.0, 1.38, 0.03, { north: 'q_fuse_door', south: 'q_steel_grey', sides: 'q_steel_grey' }, { fit: { north: true } });
    mb.pop();
    // knife switch handle on the right side
    mb.box(0.52, 1.25, zc + 0.03, 0.06, 0.16, 0.1, 'q_steel_dark');
    mb.push(); mb.translate(0.56, 1.33, zc + 0.03); mb.rotateZ(-0.6);
    mb.box(0, 0, 0, 0.03, 0.34, 0.03, 'metal_grey');
    mb.box(0, 0.32, 0, 0.06, 0.08, 0.05, 'plastic_red');
    mb.pop();
    // conduits
    for (const x of [-0.3, 0.0, 0.3]) mb.cylinder(x, 2.06, zc - 0.03, 0.035, 0.64, 6, 'metal_grey', { caps: false });
    mb.cylinder(0.25, 0.0, zc - 0.03, 0.04, 0.68, 6, 'metal_grey', { caps: false });
    mb.box(0.3, 0.55, zc + 0.08, 0.14, 0.1, 0.06, 'q_steel_dark');
  },
});
