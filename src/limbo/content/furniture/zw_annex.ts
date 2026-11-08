// World stream 3 — Annex B (a 1990 research annex) and the Undercroft below
// it: an abandoned expedition base camp (hazmat suits on hooks, tether
// stakes, CRT carts tracking test patterns, VHS camcorders on tripods, hard
// cases, cable drums, work lights, a survey board), then the dark: huge
// pillars, rubble, a ladder down into a pit.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex, ph, bayer } from '../../gfx/pixel';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { text, textC, textW, rod, scribble, rockBlob } from './b_common';
import { WZ, crtGlass } from './a_lib';

const T = ['annex', 'zw'];
const SUIT = [0xe0b828, 0xe07020, 0xe8e8e0, 0xe0b828];

function testCard(pc: PixelCanvas, k: number) {
  pc.wrap = false;
  const W = pc.w, H = pc.h;
  const bars = [0xc0c0c0, 0xc0c000, 0x00c0c0, 0x00c000, 0xc000c0, 0xc00000, 0x0000c0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = y < H * 0.62 ? bars[Math.min(6, Math.floor((x / W) * 7))] : y < H * 0.72 ? bars[6 - Math.min(6, Math.floor((x / W) * 7))] : x < W * 0.25 ? 0x10205a : x < W * 0.5 ? 0xf0f0f0 : x < W * 0.75 ? 0x3a1a6a : 0x0a0a0a;
    if (k === 1 && y > H * 0.2 && y < H * 0.8) c = 0x0a0a10; // signal lost: a black room
    pc.set(x, y, c);
  }
  // tracking error: a torn band of offset lines
  const ty = Math.floor(H * (0.3 + 0.15 * k));
  for (let y = ty; y < Math.min(H, ty + 3); y++) {
    const row: number[] = [];
    for (let x = 0; x < W; x++) row.push(pc.get(x, y));
    for (let x = 0; x < W; x++) pc.set(x, y, row[(x + 5 + y) % W]);
    for (let x = 0; x < W; x++) if (ph(x, y, 8601 + k) < 0.35) pc.set(x, y, 0xf0f0f0);
  }
  text(pc, k === 1 ? 'SECTOR 7' : k === 2 ? 'TETHER 3' : 'PLAY', 2, 2, 0xffffff);
  text(pc, k === 2 ? '00:00:00' : '-:--:--', 2, H - 7, 0xffffff);
  crtGlass(pc, 0, 0, W, H, 0x0a0a0a, 0.5);
}

addTextureModule(() => {
  const A = atlas();
  for (let k = 0; k < 3; k++) A.add('zw_testcard_' + k, 32, 24, (pc) => testCard(pc, k));
  // hazmat suit rubberised fabric
  A.add('zw_suit', 16, 16, (pc) => {
    const R = makeRamp(0xd8d0c0, 5, { spread: 0.3 });
    pc.each((x, y) => pc.set(x, y, R[2 + (((x + y * 3) % 7) === 0 ? 1 : 0) - (ph(x >> 1, y >> 2, 8611) < 0.15 ? 1 : 0)]));
    for (let y = 0; y < 16; y += 8) for (let x = 0; x < 16; x++) pc.set(x, y, R[1]);
  });
  A.add('zw_visor', 8, 8, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => pc.set(x, y, mixHex(0x1a2a30, 0x5a7a88, (y / 8) * 0.5 + (x + y === 5 ? 0.5 : 0))));
  });
  // equipment case stencil
  A.add('zw_case_stencil', 32, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x4a5a3a, 5, { spread: 0.3 });
    pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 2, y >> 2, 8621) < 0.15 ? -1 : 0)]));
    textC(pc, 'M.I. ANNEX B', 16, 2, 0xe8e4d0);
    textC(pc, 'TETHER KIT', 16, 9, 0xe8e4d0);
    for (let x = 0; x < 32; x++) if (ph(x, 0, 8622) < 0.3) pc.set(x, 15, R[0]);
  });
  A.add('zw_survey', 64, 32, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0f0ea);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) if (ph(x >> 1, y >> 1, 8631) < 0.06) pc.set(x, y, 0xe0e0d8);
    // the floor plan of the dark sector, drawn three times over
    pc.strokeRect(4, 4, 30, 22, 0x2a3a8a); pc.strokeRect(6, 6, 26, 18, 0x2a3a8a);
    pc.line(4, 15, 34, 15, 0x2a3a8a); pc.line(19, 4, 19, 26, 0x2a3a8a);
    // the ropes, in red, going in and not coming out
    pc.line(36, 26, 26, 18, 0xc02020); pc.line(36, 27, 14, 10, 0xc02020); pc.line(37, 26, 8, 22, 0xc02020);
    pc.set(26, 18, 0x1a1a1a); pc.set(14, 10, 0x1a1a1a); pc.set(8, 22, 0x1a1a1a);
    text(pc, '1', 27, 16, 0xc02020); text(pc, '2', 15, 8, 0xc02020); text(pc, '3', 4, 20, 0xc02020);
    text(pc, 'DO NOT', 40, 4, 0x1a1a1a); text(pc, 'UNCLIP', 40, 10, 0x1a1a1a);
    text(pc, 'T3 LOST', 38, 18, 0xc02020); text(pc, '61M?', 42, 24, 0x2a3a8a);
    for (let x = 1; x < 63; x++) { pc.set(x, 31, 0x8a8a84); }
  });
  A.add('zw_reel', 8, 8, (pc) => {
    pc.wrap = false; pc.clear();
    pc.circle(3.5, 3.5, 3.6, 0xc87a2a); pc.circle(3.5, 3.5, 1.4, 0x3a3a3a);
    for (let a = 0; a < 6.28; a += 0.8) pc.set(Math.round(3.5 + Math.cos(a) * 2.6), Math.round(3.5 + Math.sin(a) * 2.6), 0x8a4a1a);
  });
  A.add('zw_pillar_num', 16, 24, (pc) => {
    pc.wrap = false; pc.clear();
    textC(pc, 'C', 8, 2, 0xd8d0b8, 2);
    textC(pc, '07', 8, 14, 0xd8d0b8, 1);
  });
});

// ============================================================ hazmat
function suit(mb: ModelBuilder, x: number, z: number, col: number, torn: boolean, empty: boolean) {
  const c = { color: col };
  // boots on the floor below it
  for (const dx of [-0.08, 0.08]) mb.box(x + dx, 0, z + 0.06, 0.1, 0.22, 0.22, 'rubber_black', { color: 0x2a2a2a });
  mb.box(x, 1.72, z - 0.02, 0.03, 0.03, 0.08, 'metal_dark'); // the hook
  if (empty) return;
  // hood + visor
  mb.box(x, 1.5, z, 0.28, 0.26, 0.24, 'zw_suit', c);
  mb.box(x, 1.54, z + 0.121, 0.18, 0.13, 0.01, 'zw_visor', { fit: true });
  // body hanging slack from the hook
  mb.box(x, 0.86, z, 0.46, 0.66, 0.2, 'zw_suit', c);
  mb.box(x, 1.36, z, 0.4, 0.14, 0.18, 'zw_suit', { color: scaleHex(col, 0.92) });
  for (const sx of [-1, 1]) {
    mb.push().translate(x + sx * 0.25, 1.4, z).rotateZ(sx * 0.12);
    mb.box(0, -0.62, 0, 0.12, 0.62, 0.14, 'zw_suit', c);
    mb.box(0, -0.74, 0, 0.1, 0.12, 0.1, 'rubber_black', { color: 0x2a2a2a });
    mb.pop();
  }
  for (const sx of [-1, 1]) mb.box(x + sx * 0.11, 0.24, z, 0.17, 0.62, 0.17, 'zw_suit', c);
  // the tape around the ankles and wrists, and the respirator canister
  mb.box(x, 1.12, z + 0.105, 0.2, 0.18, 0.02, 'zw_suit', { color: scaleHex(col, 0.85) });
  mb.cylinderZ(x - 0.06, 1.46, z + 0.15, 0.04, 0.06, 8, 'plastic_black');
  if (torn) mb.box(x + 0.1, 0.7, z + 0.105, 0.12, 0.3, 0.006, 'zw_black');
}

defObj({
  key: 'zw_hazmat', name: 'Hazmat Suit', height: 1.9, block: 'none', onWall: true,
  container: { capacity: 8, kind: 'wardrobe', loot: 'zw_hazmat' },
  sound: 'fabric', hp: 60, flammable: 0.5,
  desc: 'A rubberised suit on a hook, boots set neatly under it. The name tape says the same name as the one next to it.',
  tags: [...T, 'wall', 'clothes', 'container'],
  variant: (s) => String((s.v ?? 0) % 6),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 6;
    suit(mb, 0, WZ + 0.14, SUIT[v % SUIT.length], v === 4, v === 5);
  },
});

// ============================================================ tether
defObj({
  key: 'zw_tether_stake', name: 'Tether Anchor', height: 0.6, block: 'low', movable: 0,
  sound: 'metal', hp: 400,
  disassemble: { tools: ['#wrench'], time: 15, skill: 'mechanics', yields: [['rope', 1, 2], ['scrap_metal', 1, 2]] },
  desc: 'An eye-bolt drilled into the floor, a coil of rope, a carabiner. The rope runs off into the dark and is pulled tight.',
  tags: [...T, 'rope', 'tether'],
  variant: (s) => String((s.v ?? 0) % 2),
  model: (mb, s) => {
    const blue = (s.v ?? 0) % 2 === 1;
    const rope = blue ? 'zw_rope_blue' : 'zw_rope';
    mb.cylinder(0, 0, 0, 0.12, 0.03, 8, 'metal_dark');
    mb.cylinder(0, 0.03, 0, 0.025, 0.18, 6, 'metal_grey');
    mb.cylinderZ(0, 0.25, 0, 0.06, 0.02, 8, 'metal_grey', { caps: false });
    // the coil
    for (let i = 0; i < 4; i++) mb.cylinder(0.24, 0.02 * i, 0.12, 0.17 - i * 0.012, 0.02, 10, rope, { caps: false });
    // the taut run leaving toward the dark (north)
    rod(mb, 0, 0.26, 0, 0, 0.32, -0.5, 0.015, 4, rope);
    mb.box(0.02, 0.25, -0.06, 0.03, 0.06, 0.02, 'metal_grey', { color: 0xe0b020 });
    // tag
    mb.box(0.08, 0.2, 0.03, 0.08, 0.05, 0.004, 'zw_tag', { fit: true });
  },
});

defObj({
  key: 'zw_cable_drum', name: 'Rope Drum', height: 0.8, block: 'solid', movable: 40,
  sound: 'wood', hp: 140, flammable: 0.6,
  disassemble: { tools: ['#saw'], time: 14, skill: 'carpentry', yields: [['rope', 2, 4], ['plank', 1, 3]] },
  desc: 'A wooden drum of climbing rope, mostly paid out. The end is somewhere in the dark sector.',
  tags: [...T, 'rope'],
  model: (mb) => {
    for (const sx of [-1, 1]) mb.cylinderX(sx * 0.3, 0.4, 0, 0.4, 0.05, 14, { all: 'wood_crate', sides: 'wood_crate' }, { caps: true });
    mb.cylinderX(0, 0.4, 0, 0.18, 0.55, 10, 'zw_rope', { caps: false });
    mb.cylinderX(0, 0.4, 0, 0.22, 0.4, 10, 'zw_rope', { caps: false });
    mb.box(0, 0, 0, 0.7, 0.04, 0.3, 'wood_crate');
    rod(mb, 0, 0.6, -0.15, 0, 0.05, -0.5, 0.015, 4, 'zw_rope');
  },
});

// ============================================================ AV kit
defObj({
  key: 'zw_crt_cart', name: 'Monitor Cart', height: 1.45, block: 'solid', movable: 35, power: true, hum: 'tv',
  light: { color: 0xc8d8ff, intensity: 0.38, radius: 2.8, y: 1.15, kind: 'screen', power: true, flicker: 0.15 },
  sound: 'metal', hp: 160,
  disassemble: { tools: ['#screwdriver'], time: 25, skill: 'electrical', yields: [['electronics_scrap', 3, 5], ['glass_shard', 1, 3], ['scrap_metal', 1, 3], ['wire', 1, 3]] },
  desc: 'A CRT on a rolling AV cart, a VCR under it, tracking lines crawling up the picture. The tape counter is running backwards.',
  tags: [...T, 'tv', 'screens', 'electronics'],
  variant: (s) => String((s.v ?? 0) % 3) + (s.unpowered ? 'x' : ''),
  model: (mb, s) => {
    const k = (s.v ?? 0) % 3, lit = !s.unpowered;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mb.box(sx * 0.3, 0.05, sz * 0.22, 0.03, 0.9, 0.03, 'metal_grey', { color: 0x4a4a4e });
      mb.cylinder(sx * 0.3, 0, sz * 0.22, 0.035, 0.05, 6, 'rubber_black');
    }
    for (const y of [0.2, 0.55, 0.92]) mb.box(0, y, 0, 0.66, 0.025, 0.5, 'metal_grey', { color: 0x4a4a4e });
    // VCR + tapes
    mb.box(0, 0.575, 0.02, 0.48, 0.09, 0.32, 'plastic_black', { color: 0x3a3a3e });
    mb.box(0, 0.6, 0.181, 0.4, 0.04, 0.004, 'p_vcr', { fit: true, emissive: lit ? 0.8 : 0 });
    for (let i = 0; i < 4; i++) mb.box(-0.2 + i * 0.1, 0.225, 0.05, 0.03, 0.19, 0.11, 'plastic_black', { color: 0x1a1a1a });
    // the monitor
    mb.box(0, 0.945, -0.05, 0.56, 0.46, 0.44, 'plastic_beige', { color: 0x9a968a });
    mb.box(-0.02, 1.0, 0.172, 0.44, 0.34, 0.01, { south: lit ? 'zw_testcard_' + k : 'p_crt_off', all: 'glass_dark' }, { fit: { south: true }, emissive: lit ? 1.0 : 0 });
    mb.box(0.24, 0.98, 0.172, 0.04, 0.03, 0.01, 'led_green', { emissive: lit ? 1.2 : 0 });
    // cables to the floor
    mb.box(0.25, 0.05, -0.24, 0.02, 0.9, 0.02, 'plastic_black');
  },
});

defObj({
  key: 'zw_camcorder', name: 'Camcorder on Tripod', height: 1.6, block: 'low', movable: 6,
  container: { capacity: 4, kind: 'box', loot: 'zw_camcorder' },
  sound: 'plastic', hp: 50,
  desc: 'A VHS camcorder on a tripod, pointed into the dark sector. The red light is on. The tape is full.',
  tags: [...T, 'camera', 'electronics', 'container'],
  model: (mb) => {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      rod(mb, Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32, 0, 1.25, 0, 0.012, 4, 'metal_dark');
    }
    mb.cylinder(0, 1.22, 0, 0.04, 0.06, 6, 'metal_dark');
    mb.push().translate(0, 1.28, 0).rotateY(Math.PI);
    mb.box(0, 0, 0, 0.11, 0.13, 0.3, 'plastic_black', { color: 0x2a2a2e });
    mb.cylinderZ(0, 0.065, -0.17, 0.045, 0.08, 8, 'plastic_black', { caps: true });
    mb.cylinderZ(0, 0.065, -0.21, 0.035, 0.005, 8, 'glass_dark', { caps: true });
    mb.box(0.06, 0.07, 0.08, 0.02, 0.06, 0.1, 'plastic_black', { color: 0x4a4a4e });
    mb.box(0, 0.135, 0.02, 0.05, 0.03, 0.12, 'plastic_black');
    mb.box(-0.03, 0.11, -0.12, 0.012, 0.012, 0.012, 'led_red', { emissive: 1.8 });
    mb.pop();
  },
});

// ============================================================ camp kit
defObj({
  key: 'zw_hard_case', name: 'Equipment Case', height: 0.55, block: 'low', movable: 30,
  container: { capacity: 25, kind: 'crate', loot: 'zw_expedition' },
  sound: 'plastic', hp: 220,
  disassemble: { tools: ['#screwdriver'], time: 10, yields: [['scrap_metal', 1, 2], ['rag', 1, 2]] },
  desc: 'A ribbed olive case with foam cut-outs inside. Some of the shapes are still filled. One shape is a hand.',
  tags: [...T, 'crate', 'container'],
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3;
    const w = [0.9, 0.7, 0.55][v], d = [0.55, 0.5, 0.4][v], h = [0.42, 0.36, 0.3][v];
    mb.box(0, 0, 0, w, h, d, { south: 'zw_case_stencil', all: 'plastic_black' }, { fit: { south: true }, color: 0xffffff });
    mb.box(0, 0, 0, w, h, d, 'plastic_black', { color: 0x4a5a3a, skip: ['south'] });
    for (let i = 0; i < 3; i++) mb.box(-w / 2 + w * (i + 0.5) / 3, h - 0.002, 0, 0.04, 0.01, d + 0.01, 'plastic_black', { color: 0x3a4a2a });
    for (const sx of [-1, 1]) mb.box(sx * (w / 2 - 0.12), h * 0.55, d / 2 + 0.01, 0.07, 0.06, 0.02, 'metal_grey');
    mb.box(0, h, 0, 0.18, 0.03, 0.04, 'plastic_black');
    if (v === 0) mb.box(0.2, h, 0.1, 0.26, 0.012, 0.18, 'paper', { color: 0xf0ecd8 });
  },
});

defObj({
  key: 'zw_field_table', name: 'Field Table', w: 2, d: 1, height: 0.95, block: 'table', surface: 0.74, movable: 18,
  container: { capacity: 12, kind: 'box', loot: 'zw_expedition' },
  sound: 'metal', hp: 120,
  disassemble: { tools: ['#wrench'], time: 10, yields: [['scrap_metal', 1, 3], ['pipe', 1, 2]] },
  desc: 'A folding table: a radio set, a logbook open at the last page, four mugs, a fifth mug that nobody has used.',
  tags: [...T, 'table', 'container'],
  model: (mb) => {
    for (const sx of [-1, 1]) {
      mb.push().translate(sx * 0.8, 0, 0).rotateX(0.35); mb.box(0, 0, 0, 0.03, 0.78, 0.03, 'metal_grey'); mb.pop();
      mb.push().translate(sx * 0.8, 0, 0).rotateX(-0.35); mb.box(0, 0, 0, 0.03, 0.78, 0.03, 'metal_grey'); mb.pop();
    }
    mb.box(0, 0.72, 0, 1.86, 0.03, 0.74, 'plastic_white', { color: 0xc8c4b8 });
    // radio set with a handset
    mb.box(-0.55, 0.75, -0.12, 0.42, 0.2, 0.3, 'metal_painted_green', { color: 0x5a6a4a });
    mb.box(-0.55, 0.8, 0.031, 0.36, 0.1, 0.004, 'q_radio_face', { fit: true });
    mb.cylinder(-0.5, 0.95, -0.2, 0.006, 0.5, 4, 'metal_dark');
    mb.box(-0.25, 0.75, 0.0, 0.06, 0.04, 0.16, 'plastic_black');
    // logbook, pens, mugs
    mb.box(0.15, 0.75, 0.05, 0.42, 0.02, 0.3, 'paper', { color: 0xf0ecd8 });
    mb.box(0.15, 0.752, 0.05, 0.02, 0.022, 0.3, 'plastic_black', { color: 0x6a1a1a });
    for (let i = 0; i < 5; i++) mb.cylinder(0.5 + (i % 3) * 0.12, 0.75, -0.2 + Math.floor(i / 3) * 0.15, 0.04, 0.09, 7, 'porcelain', { color: i === 4 ? 0xf8f8f8 : 0xc8b8a0 });
    // map weighted down by a flashlight
    mb.box(0.55, 0.75, 0.2, 0.4, 0.004, 0.25, 'zw_survey', { fit: true });
    mb.cylinderX(0.55, 0.77, 0.2, 0.025, 0.2, 6, 'plastic_black');
  },
});

defObj({
  key: 'zw_floodlight', name: 'Work Light', height: 1.9, block: 'low', movable: 12,
  light: { color: 0xfff0d0, intensity: 1.0, radius: 7, y: 1.7, kind: 'lamp', power: false, flicker: 0.03 },
  sound: 'metal', hp: 80,
  disassemble: { tools: ['#screwdriver'], time: 10, skill: 'electrical', yields: [['wire', 1, 2], ['lightbulb', 0, 1], ['scrap_metal', 1, 2]] },
  desc: 'A twin-head work light on a tripod, running off a battery pack that should have died years ago.',
  tags: [...T, 'light'],
  model: (mb) => {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; rod(mb, Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35, 0, 1.0, 0, 0.014, 4, 'metal_painted_green', { color: 0xe0b020 }); }
    mb.cylinder(0, 0.95, 0, 0.02, 0.75, 6, 'metal_grey');
    mb.box(0, 1.68, 0, 0.6, 0.03, 0.03, 'metal_grey');
    for (const sx of [-1, 1]) {
      mb.push().translate(sx * 0.2, 1.6, 0.05).rotateX(-0.4);
      mb.box(0, 0, 0, 0.18, 0.15, 0.1, 'metal_dark', { color: 0xe0b020 });
      mb.box(0, 0.02, 0.051, 0.15, 0.11, 0.004, 'white', { color: 0xfff4d8, emissive: 1.8 });
      mb.pop();
    }
    mb.box(0.25, 0, 0.25, 0.22, 0.18, 0.16, 'plastic_black', { color: 0x3a3a3a });
    mb.box(0.25, 0.18, 0.25, 0.04, 0.03, 0.04, 'led_green', { emissive: 1.2 });
  },
});

defObj({
  key: 'zw_survey_board', name: 'Survey Board', w: 2, d: 1, height: 2.0, block: 'none', onWall: true,
  sound: 'plastic', hp: 120,
  desc: 'A whiteboard map of the dark sector. Three tether lines go in. Somebody has written T3 LOST, and under it, in different handwriting, NOT LOST.',
  tags: [...T, 'wall', 'board'],
  model: (mb) => {
    mb.box(0, 0.95, WZ + 0.02, 1.86, 0.92, 0.03, { south: 'zw_survey', all: 'metal_brushed' }, { fit: { south: true } });
    mb.box(0, 0.92, WZ + 0.05, 1.8, 0.03, 0.06, 'metal_brushed');
    for (let i = 0; i < 3; i++) mb.box(-0.3 + i * 0.08, 0.95, WZ + 0.07, 0.06, 0.02, 0.02, 'plastic_red', { color: [0xc02020, 0x2a3a8a, 0x1a1a1a][i] });
  },
});

defObj({
  key: 'zw_cot', name: 'Camp Bed', w: 1, d: 2, height: 0.5, block: 'low', sleep: 0.55, sit: true, movable: 9,
  sound: 'fabric', hp: 60, flammable: 0.7,
  disassemble: { tools: ['#wrench'], time: 8, yields: [['pipe', 1, 2], ['rag', 2, 4]] },
  desc: 'A folding camp bed. The sleeping bag is unzipped and still holds the shape of someone lying on their side.',
  tags: [...T, 'bed', 'sleep', 'sit'],
  model: (mb) => {
    for (const sx of [-1, 1]) mb.box(sx * 0.33, 0.36, 0, 0.03, 0.03, 1.9, 'metal_grey', { color: 0x5a6a4a });
    for (const z of [-0.85, 0, 0.85]) {
      mb.push().translate(0, 0, z).rotateZ(0.6); mb.box(0, 0, 0, 0.025, 0.46, 0.025, 'metal_grey', { color: 0x5a6a4a }); mb.pop();
      mb.push().translate(0, 0, z).rotateZ(-0.6); mb.box(0, 0, 0, 0.025, 0.46, 0.025, 'metal_grey', { color: 0x5a6a4a }); mb.pop();
    }
    mb.box(0, 0.37, 0, 0.66, 0.02, 1.86, 'fabric_green', { color: 0x6a7a5a });
    mb.box(0, 0.39, 0.15, 0.6, 0.1, 1.4, 'fabric_blue', { color: 0x3a5a8a });
    mb.box(-0.05, 0.47, 0.1, 0.42, 0.06, 1.0, 'fabric_blue', { color: 0x4a6a9a });
    mb.box(0, 0.39, -0.72, 0.42, 0.08, 0.3, 'pillow', { color: 0xc8c0b0 });
  },
});

defObj({
  key: 'zw_decon_arch', name: 'Decontamination Arch', w: 2, d: 1, height: 2.4, block: 'none', tall: true, movable: 0,
  sound: 'plastic', hp: 200,
  desc: 'A frame of pipe and heavy plastic sheeting, with spray nozzles. It still drips. The drain under it leads nowhere you can see.',
  tags: [...T, 'decon'],
  model: (mb) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.95, 0, sz * 0.42, 0.05, 2.3, 0.05, 'metal_grey', { color: 0xc8c8c0 });
    for (const sz of [-1, 1]) mb.box(0, 2.28, sz * 0.42, 1.95, 0.05, 0.05, 'metal_grey', { color: 0xc8c8c0 });
    for (const sx of [-1, 1]) mb.box(sx * 0.95, 2.28, 0, 0.05, 0.05, 0.85, 'metal_grey', { color: 0xc8c8c0 });
    // sheeting drawn back on the sides
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) mb.box(sx * (0.9 - k * 0.04), 0.1, -0.3 + k * 0.26, 0.012, 2.15, 0.22, 'glass', { color: 0xd0e0d8 });
    for (let k = 0; k < 5; k++) mb.cylinder(-0.6 + k * 0.3, 2.18, 0, 0.02, 0.1, 6, 'chrome');
    mb.box(0, 0.002, 0, 1.6, 0.012, 0.7, 'grate', { color: 0x8a8a84 });
  },
});

// ============================================================ the undercroft
defObj({
  key: 'zw_pillar_huge', name: 'Pillar', w: 2, d: 2, height: 2.7, block: 'solid', blocksSight: true, tall: true, movable: 0,
  sound: 'metal', hp: 99999,
  desc: 'A pillar two metres across. It goes up past where the ceiling should be. Somebody painted a letter on it, and the letter is wrong.',
  tags: [...T, 'pillar', 'undercroft', 'fixed'],
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3;
    mb.box(0, 0, 0, 1.92, 2.7, 1.92, { sides: 'zw_wall_under', top: 'wall_top_concrete' }, {});
    mb.box(0, 0, 0, 2.02, 0.22, 2.02, 'concrete', { color: 0x6a6a64 });
    if (v !== 2) mb.box(0, 1.3, 0.965, 0.5, 0.75, 0.004, 'zw_pillar_num', { fit: true });
    // a rope tied around it, going somewhere
    if (v === 1) { mb.box(0, 0.9, 0, 1.96, 0.03, 1.96, 'zw_rope'); }
  },
});

defObj({
  key: 'zw_pit_ladder', name: 'Ladder', height: 1.2, block: 'none', movable: 0,
  sound: 'metal', hp: 99999,
  desc: 'Two rusted rails bolted to the lip of the pit, rungs going down into a dark that eats the torch beam after four metres.',
  tags: [...T, 'ladder', 'portal', 'fixed'],
  model: (mb) => {
    // rails rise a metre above the lip (grab handles) and run down the north face of the pit
    for (const sx of [-1, 1]) {
      mb.box(sx * 0.22, -3.0, -0.46, 0.05, 4.1, 0.05, 'metal_rusty');
      mb.push().translate(sx * 0.22, 1.05, -0.46).rotateX(-1.2); mb.box(0, 0, 0, 0.05, 0.3, 0.05, 'metal_rusty'); mb.pop();
    }
    for (let i = 0; i < 12; i++) mb.box(0, 0.85 - i * 0.3, -0.46, 0.44, 0.03, 0.03, 'metal_rusty', { color: i < 4 ? 0xffffff : scaleHex(0xffffff, Math.max(0.15, 1 - (i - 3) * 0.12)) });
    mb.box(0, 0.0, -0.3, 0.6, 0.03, 0.3, 'metal_rusty', { color: 0x8a6a5a });
  },
});

defObj({
  key: 'zw_rubble', name: 'Rubble', height: 0.6, block: 'low', movable: 0,
  sound: 'metal', hp: 99999,
  desc: 'Broken concrete, rebar, a single carpet tile from upstairs.',
  tags: [...T, 'rubble', 'undercroft', 'fixed'],
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3;
    for (let i = 0; i < 6; i++) {
      const x = (ph(i, v, 8641) - 0.5) * 0.7, z = (ph(i, v, 8642) - 0.5) * 0.7, r = 0.12 + ph(i, v, 8643) * 0.16;
      rockBlob(mb, x, 0, z, r, r * 1.4, r * 0.9, 8650 + i + v * 10, 'concrete', 6, 3, { color: 0x8a8a84 });
    }
    rod(mb, -0.2, 0.1, 0.1, 0.3, 0.5, -0.2, 0.012, 4, 'metal_rusty');
    if (v === 1) mb.box(0.15, 0.2, 0.15, 0.4, 0.02, 0.4, 'carpet_yellow');
  },
});
void bayer; void textW; void scribble; void mixHex;

defObj({
  key: 'zw_rope_hanging', name: 'Rope', height: 2.7, block: 'none', movable: 0,
  sound: 'fabric', hp: 99999,
  desc: 'A rope hanging out of a hole in the ceiling, knotted every half metre. It is warm where somebody held it.',
  tags: [...T, 'rope', 'portal', 'fixed'],
  variant: (s) => String((s.v ?? 0) % 2),
  model: (mb, s) => {
    const tex = (s.v ?? 0) % 2 ? 'zw_rope_blue' : 'zw_rope';
    mb.cylinder(0.05, 0.05, -0.05, 0.022, 2.7, 6, tex);
    for (let y = 0.4; y < 2.6; y += 0.5) mb.sphere(0.05, y, -0.05, 0.04, 6, 4, tex);
    for (let i = 0; i < 3; i++) mb.cylinder(0.2, 0.02 * i, 0.12, 0.16 - i * 0.02, 0.02, 10, tex, { caps: false });
    // the ragged lip of the hole above, and the light that comes down through it
    mb.box(0, 2.68, 0, 0.9, 0.02, 0.9, 'zw_black');
  },
});

defObj({
  key: 'zw_annex_pillar', name: 'Column', height: 2.7, block: 'solid', movable: 0,
  sound: 'metal', hp: 99999,
  desc: 'A boxed-in column in the same beige as the walls, with a fire hose reel nobody has ever unrolled.',
  tags: [...T, 'column', 'fixed'],
  variant: (s) => String((s.v ?? 0) % 2),
  model: (mb, s) => {
    mb.box(0, 0, 0, 0.66, 2.7, 0.66, { sides: 'zw_wall_annex', top: 'wall_top' }, {});
    if ((s.v ?? 0) % 2) {
      mb.box(0, 1.0, 0.36, 0.42, 0.42, 0.06, 'metal_painted_green', { color: 0xc03028 });
      mb.cylinderZ(0, 1.21, 0.39, 0.15, 0.04, 10, 'plastic_red', { caps: true });
    } else mb.box(0, 1.9, 0.335, 0.2, 0.08, 0.01, 'zw_tag', { fit: true });
  },
});
