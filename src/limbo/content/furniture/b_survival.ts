// Furniture B — survival, player-buildable objects and story props: campfires,
// bedding, tents, crafted furniture, planters, traps, stashes, remains,
// memorial shrines and the small uncanny set-pieces (static TV, the phone).
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ModelBuilder } from '../../gfx/modelBuilder';
import {
  makeRamp, mixHex, scaleHex, bayer, ph, tileFbm, hashf, text, textC, scribble, fillNoise, chips, stripes, woodFill,
  grimeBottom, glow, poly, rod, torus, disc, discY, fan, drape, rockBlob, quadW, triW, gradV,
} from './b_common';

const T = ['setB', 'survival'];

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------
addTextureModule(() => {
  const A = atlas();

  A.add('q_flame', 8, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const t = y / 15 + (bayer(x, y) - 0.5) * 0.18; // 0 top .. 1 bottom
      pc.set(x, y, t > 0.82 ? 0xfff4c0 : t > 0.6 ? 0xffd25a : t > 0.38 ? 0xff9a2e : t > 0.18 ? 0xe8562a : 0xb02e1a);
    }
  });
  A.add('q_embers', 16, 16, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8) / 8;
      const n = tileFbm(x, y, 16, 16, 4, 2, 1401);
      let c = d > 0.95 ? 0x3a3632 : 0x241e1a;
      if (d < 0.8 && n > 0.55) c = n > 0.68 ? 0xffb040 : n > 0.62 ? 0xe8602a : 0x8a2a14;
      else if (ph(x, y, 1402) < 0.2) c = 0x4a4440;
      pc.set(x, y, c);
    });
  });
  A.add('q_ash', 16, 16, (pc, rng) => {
    pc.wrap = false;
    pc.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8) / 8;
      const v = ph(x, y, 1403);
      pc.set(x, y, d > 0.95 ? 0x4a4642 : v < 0.25 ? 0x1e1a18 : v < 0.6 ? 0x6a6662 : 0x8a8682);
    });
    pc.speckle(rng, [0x2a2420], 0.08);
  });
  A.add('q_sleeping_bag', 22, 56, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xd8642a, 5, { spread: 0.4 });
    pc.each((x, y) => pc.set(x, y, y % 5 === 0 ? r[1] : y % 5 === 1 ? r[3] : r[2 + (ph(x, y, 1411) < 0.15 ? 1 : 0)]));
    pc.vline(19, 0, 55, 0x5a5a60); pc.vline(20, 0, 55, 0x9a9aa0);
    for (let y = 1; y < 56; y += 2) pc.set(19, y, 0xc8c8d0);
    pc.rect(0, 0, 22, 9, 0x2a7a7a); for (let y = 0; y < 9; y++) pc.set(0, y, 0x1a5a5a);
    pc.grime(0x5a3a2a, 0.5, 3, 1413, 0.62);
    pc.stain(rng.int(4, 16), rng.int(20, 50), 3, 0x8a3a1a, 0x6a2a14, 3);
  });
  A.add('q_bag_lining', 16, 16, (pc) => {
    const r = makeRamp(0x3a8a88, 4, { spread: 0.35 });
    pc.each((x, y) => pc.set(x, y, (x + y) % 4 === 0 ? r[1] : r[2]));
  });
  A.add('q_wool_blanket', 32, 32, (pc, rng) => {
    const r = makeRamp(0x6a5a3e, 5, { spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.5 + (((x + y) % 3 === 0) ? 0.08 : 0) + (tileFbm(x, y, 32, 32, 2, 2, 1421) - 0.5) * 0.25, 0.8);
    for (const [y0, c] of [[4, 0xa83a2a], [7, 0xd8c070], [24, 0xa83a2a], [27, 0xd8c070]] as [number, number][]) for (let x = 0; x < 32; x++) { pc.set(x, y0, c); pc.set(x, y0 + 1, scaleHex(c, 0.85)); }
    pc.speckle(rng, [r[0]], 0.04);
  });
  A.add('q_patchwork', 32, 32, (pc) => {
    const fabrics = [0xb84a3a, 0x3a6a9a, 0xd8b85a, 0x5a8a4a, 0xc89ab8, 0xe8e0d0, 0x8a5a3a, 0x4a9a9a];
    pc.each((x, y) => {
      const cx = Math.floor(x / 8), cy = Math.floor(y / 8);
      const f = fabrics[Math.floor(hashf(cx, cy, 1431) * fabrics.length)];
      const pattern = Math.floor(hashf(cx, cy, 1432) * 3);
      let c = f;
      if (pattern === 1 && (x % 4 === 1 && y % 4 === 1)) c = 0xf0ece0;
      if (pattern === 2 && ((x % 4) === 0 || (y % 4) === 0)) c = scaleHex(f, 0.75);
      if (x % 8 === 0 || y % 8 === 0) c = (x + y) % 2 ? 0xe8e0c8 : scaleHex(f, 0.6);
      pc.set(x, y, c);
    });
    pc.grime(0x4a3a2a, 0.4, 2, 1433, 0.62);
  });
  A.add('q_tent_fabric', 32, 32, (pc, rng) => {
    const r = makeRamp(0x5a7a44, 5, { spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.55 + ((x % 2) ^ (y % 2) ? 0.03 : -0.03) + (tileFbm(x, y, 32, 32, 2, 3, 1441) - 0.5) * 0.3, 0.7);
    for (let x = 0; x < 32; x++) { pc.set(x, 0, r[1]); pc.set(x, 16, r[1]); }
    pc.rect(20, 6, 6, 5, 0x8a6a3a); pc.strokeRect(20, 6, 6, 5, 0x5a4a2a);
    pc.grime(0x3a2e1e, 0.5, 3, 1443, 0.6);
    for (let k = 0; k < 3; k++) { let x = rng.int(0, 31), y = 0; for (let t = 0; t < 10; t++) { pc.set(x, y, r[3]); x += rng.int(0, 1); y += 2; } }
  });
  A.add('q_tent_door', 24, 20, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0x5a7a44, 5, { spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.5 + (ph(x, y, 1451) - 0.5) * 0.1, 0.7);
    // open flap: dark interior triangle with a rolled flap on the right edge
    poly(pc, [[12, 2], [20, 20], [5, 20]], 0x0e100c);
    poly(pc, [[13, 5], [19, 20], [15, 20]], 0x1a1c14);
    for (let y = 3; y < 20; y++) pc.set(Math.round(12 + (y - 2) * 0.47), y, r[4]);
    for (let y = 8; y < 20; y += 3) pc.hline(7, 10, y, 0xd8642a);
    pc.vline(12, 0, 3, 0x3a3a3a);
  });
  A.add('q_soil_bed', 32, 32, (pc, rng) => {
    const r = makeRamp(0x4a3424, 6, { spread: 0.45 });
    pc.fillRamp(r, (x, y) => 0.45 + (ph(x, y, 1461) - 0.5) * 0.4 + (Math.abs(((x % 8) - 3.5)) / 3.5 - 0.5) * 0.3, 1);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x += 8) pc.set(x + 7, y, r[0]);
    pc.speckle(rng, [0x8a7a6a, 0x6a5a4a], 0.03);
    for (let k = 0; k < 5; k++) { const x = rng.int(0, 3) * 8 + 3, y = rng.int(1, 30); pc.set(x, y, 0x6ab048); pc.set(x + 1, y - 1, 0x8ad058); pc.set(x - 1, y - 1, 0x5a9a3a); }
  });
  A.add('q_rough_plank', 32, 32, (pc, rng) => {
    const r = makeRamp(0x9a7a52, 6, { spread: 0.45 });
    woodFill(pc, r, 1471, 6, false, true);
    for (let p = 0; p < 6; p++) { const tint = hashf(p, 9, 1471); if (tint < 0.35) for (let y = p * 6 + 1; y < p * 6 + 6; y++) for (let x = 0; x < 32; x++) pc.shade(x, y, 0.85); }
    for (let k = 0; k < 8; k++) { const x = rng.int(0, 31), y = rng.int(0, 5) * 6 + 3; pc.set(x, y, 0x2a2622); pc.set(x + 1, y, 0x5a5652); }
    for (let k = 0; k < 4; k++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.line(x, y, x + 3, y, r[1]); }
  });
  A.add('q_jerky', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, (x + y * 2) % 5 === 0 ? 0x8a3a24 : (x % 3 === 0 ? 0x5a2014 : 0x6e2a1a))); });
  A.add('q_herbs', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, (x * 3 + y) % 4 === 0 ? 0x8ab060 : ph(x, y, 1481) < 0.4 ? 0x4a7a34 : 0x5e8a40)); });
  A.add('q_bone', 8, 8, (pc, rng) => {
    const r = makeRamp(0xd8ceb0, 4, { spread: 0.3 });
    pc.fillRamp(r, (x, y) => 0.6 + (ph(x, y, 1491) - 0.5) * 0.4, 1);
    pc.speckle(rng, [0x8a7a5a], 0.08);
  });
  A.add('q_jacket', 16, 16, (pc, rng) => {
    const r = makeRamp(0x5a5a3a, 5, { spread: 0.42 });
    fillNoise(pc, r, 0.5, 0.15, 2, 1501, 0.08);
    for (let k = 0; k < 4; k++) { const x = rng.int(0, 15); for (let y = 0; y < 16; y++) if (ph(x, y, k) < 0.7) pc.set(x, y, r[1]); }
    pc.stain(9, 10, 3, 0x3a2a1a, 0x2a1e14, 2);
  });
  A.add('q_ribcage', 12, 14, (pc) => {
    pc.wrap = false;
    const J = makeRamp(0x5a5a3a, 4, { spread: 0.42 });
    pc.fill(J[1]);
    pc.rect(3, 0, 6, 14, 0x1a1612);
    for (let y = 2; y < 12; y += 2) { pc.hline(3, 8, y, 0xd0c6a8); pc.set(3, y + 1, 0xa89e80); pc.set(8, y + 1, 0xa89e80); }
    pc.vline(6, 1, 13, 0xc8be9e);
    for (let y = 0; y < 14; y++) { pc.set(2, y, J[3]); pc.set(9, y, J[3]); }
  });
  A.add('q_denim', 16, 16, (pc, rng) => {
    const r = makeRamp(0x3a5a86, 5, { spread: 0.4 });
    pc.each((x, y) => pc.set(x, y, r[((x + y) % 3 === 0 ? 1 : 2) + (ph(x, y, 1511) < 0.15 ? 1 : 0)]));
    pc.grime(0x2a2a20, 0.5, 2, 1513, 0.6);
    pc.rect(rng.int(2, 10), rng.int(2, 10), 3, 2, 0xc8c0b0);
  });
  const photo = (name: string, sky: number, ground: number, fig: (pc: import('../../gfx/pixel').PixelCanvas) => void) => A.add(name, 6, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0ece2);
    pc.rect(1, 1, 4, 3, sky); pc.rect(1, 4, 4, 2, ground);
    fig(pc);
  });
  photo('q_photo_a', 0x9ac8e8, 0x6aa050, (pc) => { pc.set(2, 3, 0x2a2a2a); pc.set(2, 4, 0x2a2a2a); pc.set(3, 3, 0x6a3a2a); pc.set(3, 4, 0x6a3a2a); });
  photo('q_photo_b', 0xf0c8a8, 0x8a8a8a, (pc) => { pc.rect(2, 2, 2, 2, 0xe8e4dc); pc.set(2, 2, 0xa83a2a); pc.set(3, 2, 0xa83a2a); });
  photo('q_photo_c', 0x3a3a4a, 0x2a2a30, (pc) => { pc.set(2, 2, 0xe8d8c8); pc.set(3, 2, 0xe8d8c8); pc.set(2, 3, 0xe8d8c8); pc.set(3, 3, 0x8a6a5a); });
  A.add('q_candle', 4, 8, (pc) => {
    pc.each((x, y) => pc.set(x, y, x === 0 ? 0xf8f0d8 : x === 3 ? 0xc8b890 : 0xe8dcb8));
    pc.set(1, 1, 0xfff8e8); pc.set(2, 2, 0xfff8e8); pc.set(1, 3, 0xfff8e8);
  });
  A.add('q_rotary_dial', 10, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a1a1a);
    pc.circle(5, 5, 4.8, 0xe8e4d8);
    for (let k = 0; k < 10; k++) { const a = -Math.PI * 0.3 + k * Math.PI * 1.45 / 9; pc.set(Math.round(5 + Math.cos(a) * 3.3), Math.round(5 + Math.sin(a) * 3.3), 0x2a2a2a); }
    pc.circle(5, 5, 1.6, 0xc8281e);
  });
  A.add('q_bakelite', 8, 8, (pc) => {
    const r = makeRamp(0x2a1a18, 4, { spread: 0.5 });
    pc.each((x, y) => pc.set(x, y, (x + y) % 7 === 0 ? r[3] : r[1]));
  });
  A.add('q_doily', 12, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x6a4a2e);
    pc.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 6);
      if (d < 5.8) pc.set(x, y, (Math.floor(d) % 2 === 0 || (x + y) % 3 === 0) ? 0xf4f0e8 : 0xd8d0c0);
    });
  });
  A.add('q_vhs', 8, 4, (pc) => { pc.wrap = false; pc.fill(0x141416); pc.rect(1, 1, 6, 2, 0xe8e4d8); pc.hline(2, 5, 2, 0xc8281e); });
  A.add('q_card_note', 6, 4, (pc) => { pc.wrap = false; pc.fill(0xf4f0e6); pc.hline(1, 4, 1, 0x3a3a5a); pc.hline(1, 3, 2, 0x3a3a5a); });
});

// ---------------------------------------------------------------------------
// shared pieces
// ---------------------------------------------------------------------------
function stoneRing(mb: ModelBuilder, n = 9, r = 0.36, seed = 1600) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + hashf(k, 1, seed) * 0.3;
    rockBlob(mb, Math.cos(a) * r, 0, Math.sin(a) * r, 0.085 + hashf(k, 2, seed) * 0.03, 0.1 + hashf(k, 3, seed) * 0.05, 0.075, seed + k, 'q_rock_dark', 6, 3, { color: k % 3 ? 0xd8d4cc : 0xffffff });
  }
}
function teepee(mb: ModelBuilder, n: number, h: number, tex: string, tipTex?: string) {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + 0.4;
    const x0 = Math.cos(a) * 0.24, z0 = Math.sin(a) * 0.24, x1 = Math.cos(a) * 0.04, z1 = Math.sin(a) * 0.04;
    rod(mb, x0, 0.02, z0, x1, h, z1, 0.038, 5, tex);
    if (tipTex) rod(mb, x1 + (x0 - x1) * 0.25, 0.02 + (h - 0.02) * 0.75, z1 + (z0 - z1) * 0.25, x1, h, z1, 0.041, 5, tipTex);
  }
}
function flameCone(mb: ModelBuilder, x: number, z: number, r: number, h: number, tilt = 0, rot = 0) {
  mb.push(); mb.translate(x, 0.03, z); mb.rotateY(rot); mb.rotateZ(tilt);
  mb.cylinder(0, 0, 0, r, h, 5, 'q_flame', { rTop: 0.0, fit: true, emissive: 1.7, caps: false });
  mb.pop();
}
function plank(mb: ModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, k = 0) {
  mb.box(x, y, z, w, h, d, 'q_rough_plank', { uvOffset: [k * 0.37, k * 0.19 + 0.05] });
}

// ---------------------------------------------------------------------------
// objects
// ---------------------------------------------------------------------------
defObj({
  key: 'campfire', name: 'Campfire', w: 1, d: 1, height: 0.65, block: 'low',
  heat: 'fire', flammable: 0, sound: 'wood',
  light: { color: 0xff8a3a, intensity: 1.2, radius: 6, y: 0.6, kind: 'fire', flicker: 0.5, power: false },
  desc: 'A crackling fire in a ring of stones. For a while, the hum goes quiet.',
  tags: [...T, 'campfire', 'buildable', 'light', 'fire'],
  model: (mb) => {
    stoneRing(mb);
    discY(mb, 0, 0.012, 0, 0.29, 10, 'q_embers', { emissive: 0.9 });
    teepee(mb, 5, 0.34, 'q_bark', 'q_ash');
    flameCone(mb, 0, 0, 0.14, 0.5);
    flameCone(mb, 0.08, 0.05, 0.08, 0.32, -0.25, 0.3);
    flameCone(mb, -0.08, 0.04, 0.08, 0.28, 0.3, 1.2);
    flameCone(mb, 0.0, -0.08, 0.07, 0.3, 0.2, 2.2);
    flameCone(mb, 0.02, 0.0, 0.045, 0.62, 0.05, 0.0);
    // a tin can warming by the fire
    mb.cylinder(0.3, 0.0, 0.3, 0.04, 0.1, 7, 'metal_grey', { color: 0xd0d0c8 });
  },
});

defObj({
  key: 'campfire_unlit', name: 'Fire Pit', w: 1, d: 1, height: 0.38, block: 'low',
  flammable: 0, sound: 'wood',
  desc: 'A ring of stones around cold ash and a stack of dry wood, ready for a match.',
  tags: [...T, 'campfire', 'buildable'],
  model: (mb) => {
    stoneRing(mb, 9, 0.36, 1620);
    discY(mb, 0, 0.012, 0, 0.29, 10, 'q_ash');
    teepee(mb, 5, 0.36, 'q_bark');
    for (let k = 0; k < 4; k++) { const a = k * 1.7; rod(mb, Math.cos(a) * 0.1, 0.03, Math.sin(a) * 0.1, Math.cos(a + 0.6) * 0.03, 0.12, Math.sin(a + 0.6) * 0.03, 0.012, 4, 'wood_light'); }
  },
});

defObj({
  key: 'sleeping_bag', name: 'Sleeping Bag', w: 1, d: 2, height: 0.2, block: 'none', sleep: 0.55,
  movable: 2, sound: 'fabric', flammable: 0.8,
  desc: 'An orange sleeping bag, unzipped at the top as if someone slipped out in a hurry.',
  tags: [...T, 'sleep', 'bed'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.05);
    mb.box(0, 0, 0.05, 0.72, 0.11, 1.75, { top: 'q_sleeping_bag', sides: 'q_bag_lining' }, { fit: { top: true } });
    mb.box(0, 0, -0.78, 0.6, 0.16, 0.28, { top: 'q_bag_lining', sides: 'q_sleeping_bag' });
    // folded-back corner flap
    mb.push(); mb.translate(0.36, 0.11, -0.45); mb.rotateY(0.6);
    mb.box(-0.15, 0, 0.1, 0.3, 0.02, 0.4, { top: 'q_bag_lining', sides: 'q_sleeping_bag' });
    mb.pop();
    mb.box(-0.05, 0.12, -0.72, 0.36, 0.08, 0.2, 'fabric_grey');
    mb.pop();
  },
});

defObj({
  key: 'tent', name: 'Tent', w: 2, d: 2, height: 1.38, block: 'solid', sleep: 0.7,
  container: { capacity: 20, kind: 'pile', loot: 'camp_supplies' },
  sound: 'fabric', flammable: 0.9,
  disassemble: { tools: [], time: 30, skill: 'carpentry', yields: [['rag', 4, 8], ['pipe', 1, 2]] },
  desc: 'A two-person tent pitched on nothing in particular. The flap is tied open.',
  tags: [...T, 'sleep', 'bed', 'shelter'],
  model: (mb) => {
    const hw = 0.82, H = 1.22, L = 0.88;
    mb.box(0, 0, 0, 1.78, 0.012, 1.86, 'q_tarp_green');
    // sloped panels (outer + inner faces)
    for (const s of [-1, 1]) {
      const p = s > 0
        ? [[hw, 0, L], [hw, 0, -L], [0, H, -L], [0, H, L]]
        : [[-hw, 0, -L], [-hw, 0, L], [0, H, L], [0, H, -L]];
      quadW(mb, p, 'q_tent_fabric', { shade: s > 0 ? 0.95 : 0.85 });
    }
    // back wall and front door
    mb.triRaw([[hw, 0, -L], [-hw, 0, -L], [0, H, -L]], [[0, 0], [1, 0], [0.5, 1]], 'q_tent_fabric', 0xffffff, 0.86);
    mb.triRaw([[-hw, 0, L], [hw, 0, L], [0, H, L]], [[0, 0], [1, 0], [0.5, 1]], 'q_tent_door', 0xffffff, 0.94);
    // poles, ridge cord, guy lines and stakes
    for (const z of [-L - 0.02, L + 0.02]) rod(mb, 0, 0, z, 0, H + 0.14, z, 0.016, 5, 'metal_grey');
    for (const [x, z, tx, tz] of [[0, L, 0, 0.99], [0, -L, 0, -0.99], [hw * 0.5, 0, 0.98, 0.3], [-hw * 0.5, 0, -0.98, -0.3]]) {
      const y = x === 0 ? H + 0.1 : H * 0.5;
      rod(mb, x, y, z, tx, 0.02, tz, 0.004, 4, 'fabric_grey');
      mb.box(tx, 0, tz, 0.025, 0.08, 0.025, 'metal_grey');
    }
    // sleeping bag edge glimpsed inside
    mb.box(0.05, 0.012, 0.6, 0.4, 0.06, 0.3, 'q_sleeping_bag');
  },
});

defObj({
  key: 'bedroll', name: 'Bedroll', w: 1, d: 2, height: 0.18, block: 'none', sleep: 0.5,
  movable: 3, sound: 'fabric', flammable: 0.8,
  desc: 'A wool blanket on a thin mat. It smells of smoke and somebody else.',
  tags: [...T, 'sleep', 'bed'],
  model: (mb) => {
    mb.push(); mb.rotateY(-0.06);
    mb.box(0, 0, 0, 0.66, 0.025, 1.82, 'q_tarp_green');
    mb.box(0.02, 0.025, 0.22, 0.62, 0.05, 1.25, 'q_wool_blanket');
    mb.box(0.02, 0.075, -0.34, 0.62, 0.02, 0.14, 'q_wool_blanket', { color: 0xd0c8b8 });
    mb.cylinderX(0, 0.085, -0.74, 0.085, 0.56, 8, 'q_wool_blanket');
    for (const x of [-0.16, 0.16]) mb.cylinderX(x, 0.085, -0.74, 0.088, 0.025, 8, 'leather_brown');
    mb.pop();
  },
});

defObj({
  key: 'crafted_bed', name: 'Crafted Bed', w: 1, d: 2, height: 0.75, block: 'solid', sleep: 0.65, sit: true,
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 30, skill: 'carpentry', yields: [['plank', 3, 6], ['nails', 4, 10], ['rag', 2, 4]] },
  desc: 'A bed nailed together from scavenged planks, padded with an old mattress and a patchwork quilt.',
  tags: [...T, 'sleep', 'bed', 'buildable'],
  model: (mb) => {
    for (const x of [-0.42, 0.42]) for (const z of [-0.93, 0.93]) plank(mb, x, 0, z, 0.08, z < 0 ? 0.75 : 0.42, 0.08, x > 0 ? 1 : 2);
    for (const x of [-0.42, 0.42]) plank(mb, x, 0.16, 0, 0.05, 0.16, 1.8, 3);
    plank(mb, 0, 0.16, 0.93, 0.8, 0.16, 0.05, 4);
    for (let i = 0; i < 3; i++) plank(mb, -0.25 + i * 0.25, 0.32, -0.95, 0.2, 0.4, 0.04, 5 + i);
    plank(mb, 0, 0.62, -0.95, 0.9, 0.08, 0.05, 8);
    mb.box(0, 0.24, 0.0, 0.78, 0.15, 1.82, 'mattress');
    // quilt with drop sides + pillow
    mb.box(0, 0.39, 0.22, 0.84, 0.035, 1.36, 'q_patchwork');
    for (const s of [-1, 1]) mb.box(s * 0.425, 0.25, 0.22, 0.012, 0.17, 1.36, 'q_patchwork');
    mb.box(0, 0.25, 0.905, 0.84, 0.17, 0.012, 'q_patchwork');
    mb.box(0.0, 0.39, -0.7, 0.5, 0.09, 0.28, 'pillow');
  },
});

defObj({
  key: 'crate_built', name: 'Plank Crate', w: 1, d: 1, height: 0.66, block: 'solid',
  container: { capacity: 35, kind: 'crate', loot: 'crate_supplies' },
  movable: 20, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 15, skill: 'carpentry', yields: [['plank', 2, 4], ['nails', 2, 6]] },
  desc: 'A crate knocked together from mismatched planks. The nails are bent over on the inside.',
  tags: [...T, 'storage', 'buildable'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.08);
    mb.box(0, 0.02, 0, 0.66, 0.56, 0.56, 'q_void', { skip: ['bottom', 'top'] });
    for (let i = 0; i < 4; i++) {
      const y = 0.02 + i * 0.145;
      plank(mb, 0, y, 0.29, 0.74, 0.12, 0.025, i);
      plank(mb, 0, y, -0.29, 0.74, 0.12, 0.025, i + 2);
      plank(mb, 0.36, y, 0, 0.025, 0.12, 0.56, i + 4);
      plank(mb, -0.36, y, 0, 0.025, 0.12, 0.56, i + 6);
    }
    for (const x of [-0.34, 0.34]) for (const z of [-0.27, 0.27]) plank(mb, x, 0, z, 0.05, 0.62, 0.05, 9);
    for (let i = 0; i < 3; i++) plank(mb, 0, 0.6, -0.2 + i * 0.2, 0.76, 0.03, 0.17, 10 + i);
    plank(mb, 0.0, 0.63, 0, 0.1, 0.025, 0.6, 13);
    mb.pop();
  },
});

defObj({
  key: 'table_built', name: 'Plank Table', w: 1, d: 1, height: 0.8, block: 'table', surface: 0.78,
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 20, skill: 'carpentry', yields: [['plank', 3, 5], ['nails', 3, 8]] },
  desc: 'A sturdy enough table of rough planks. It wobbles exactly once, then stops.',
  tags: [...T, 'table', 'buildable'],
  model: (mb) => {
    for (const x of [-0.38, 0.38]) for (const z of [-0.33, 0.33]) plank(mb, x, 0, z, 0.07, 0.74, 0.07, (x > 0 ? 1 : 0) + (z > 0 ? 2 : 0));
    for (const s of [-1, 1]) {
      rod(mb, -0.36, 0.12, s * 0.33, 0.36, 0.6, s * 0.33, 0.018, 4, 'q_rough_plank');
      plank(mb, 0, 0.62, s * 0.33, 0.7, 0.06, 0.04, 5);
    }
    const widths = [0.2, 0.22, 0.18, 0.2];
    let z = -0.41;
    widths.forEach((w, i) => { plank(mb, (i % 2 ? 0.02 : -0.01), 0.74, z + w / 2, 0.92 + (i % 2) * 0.04, 0.04, w - 0.01, 6 + i); z += w; });
  },
});

defObj({
  key: 'chair_built', name: 'Plank Chair', w: 1, d: 1, height: 0.95, block: 'low', sit: true,
  movable: 6, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 12, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 2, 5]] },
  desc: 'A crude chair lashed and nailed together. More comfortable than the floor.',
  tags: [...T, 'sit', 'chair', 'buildable'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.1);
    for (const x of [-0.19, 0.19]) { plank(mb, x, 0, 0.17, 0.05, 0.45, 0.05, 1); plank(mb, x, 0, -0.17, 0.05, 0.95, 0.05, 2); }
    for (let i = 0; i < 2; i++) plank(mb, 0, 0.45, -0.1 + i * 0.2, 0.46, 0.03, 0.19, 3 + i);
    for (const y of [0.64, 0.82]) plank(mb, 0, y, -0.19, 0.44, 0.09, 0.025, 5);
    plank(mb, 0, 0.18, 0, 0.4, 0.04, 0.03, 6);
    for (const [x, y, z] of [[-0.19, 0.44, 0.17], [0.19, 0.44, 0.17], [-0.19, 0.66, -0.19], [0.19, 0.66, -0.19]]) mb.box(x, y, z, 0.07, 0.04, 0.07, 'fabric_brown', { color: 0xc8a878 });
    mb.pop();
  },
});

defObj({
  key: 'farm_planter', name: 'Raised Planter', w: 1, d: 2, height: 0.42, block: 'low',
  sound: 'wood', flammable: 0.6,
  disassemble: { tools: ['#hammer'], time: 25, skill: 'carpentry', yields: [['plank', 3, 6], ['nails', 4, 8]] },
  desc: 'A raised bed of dark soil. Things grow here, if you are patient, and lucky, and it is allowed.',
  tags: [...T, 'farm', 'buildable'],
  model: (mb) => {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        plank(mb, s * 0.44, i * 0.18, 0, 0.05, 0.17, 1.9, i + (s > 0 ? 2 : 0));
        plank(mb, 0, i * 0.18, s * 0.94, 0.83, 0.17, 0.05, i + 4);
      }
    }
    for (const x of [-0.44, 0.44]) for (const z of [-0.94, 0.94]) plank(mb, x, 0, z, 0.08, 0.42, 0.08, 7);
    mb.box(0, 0, 0, 0.83, 0.32, 1.83, { top: 'q_soil_bed', sides: 'q_soil_bed' }, { skip: ['bottom'] });
    // trowel stuck in a corner
    mb.push(); mb.translate(0.3, 0.32, 0.75); mb.rotateX(-0.4);
    mb.box(0, -0.06, 0, 0.05, 0.1, 0.012, 'metal_grey');
    mb.box(0, 0.04, 0, 0.025, 0.12, 0.025, 'wood_dark');
    mb.pop();
  },
});

defObj({
  key: 'drying_rack', name: 'Drying Rack', w: 1, d: 1, height: 1.45, block: 'low',
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#saw'], time: 15, skill: 'carpentry', yields: [['plank', 1, 3]] },
  desc: 'Strips of meat and bundles of herbs drying on a frame of sticks.',
  tags: [...T, 'buildable', 'food_prep'],
  model: (mb) => {
    const W = 'q_bark';
    for (const x of [-0.45, 0.45]) { rod(mb, x, 1.42, 0, x, 0, 0.3, 0.025, 5, W); rod(mb, x, 1.42, 0, x, 0, -0.3, 0.025, 5, W); }
    rod(mb, -0.5, 1.38, 0, 0.5, 1.38, 0, 0.022, 5, W);
    for (const z of [-0.17, 0.17]) rod(mb, -0.47, 0.75, z, 0.47, 0.75, z, 0.018, 5, W);
    for (let i = 0; i < 5; i++) {
      const x = -0.32 + i * 0.16;
      mb.box(x, 1.02 + (i % 2) * 0.05, 0, 0.05, 0.34 - (i % 2) * 0.05, 0.012, 'q_jerky');
    }
    for (const x of [-0.3, 0.0, 0.28]) {
      mb.box(x, 0.5, 0.17, 0.06, 0.24, 0.06, 'q_herbs');
      mb.box(x, 0.72, 0.17, 0.03, 0.04, 0.03, 'fabric_brown');
    }
    // rag draped over the back bar
    mb.box(0.2, 0.55, -0.17, 0.28, 0.2, 0.012, 'fabric_red', { color: 0xc8b8a8 });
    mb.box(0.2, 0.75, -0.17, 0.28, 0.012, 0.06, 'fabric_red', { color: 0xc8b8a8 });
  },
});

defObj({
  key: 'trap_box', name: 'Box Trap', w: 1, d: 1, height: 0.42, block: 'low',
  movable: 4, sound: 'wood', flammable: 0.8,
  disassemble: { tools: [], time: 8, skill: 'trapping', yields: [['plank', 1, 2]] },
  desc: 'A box propped up on a trigger stick over a scrap of bait.',
  tags: [...T, 'trap', 'buildable'],
  model: (mb) => {
    // propped box, hinged at the back edge
    mb.push(); mb.translate(0, 0.0, -0.22); mb.rotateX(-0.42);
    plank(mb, 0, 0.3, 0.22, 0.46, 0.025, 0.44, 1);
    for (const s of [-1, 1]) plank(mb, s * 0.22, 0, 0.22, 0.02, 0.3, 0.44, 2);
    plank(mb, 0, 0, 0.0, 0.46, 0.3, 0.02, 3);
    mb.pop();
    rod(mb, 0.02, 0.0, 0.12, 0.0, 0.2, 0.16, 0.012, 4, 'q_bark');
    rod(mb, -0.08, 0.06, 0.1, 0.1, 0.06, 0.1, 0.008, 4, 'q_bark');
    mb.box(0.0, 0.0, 0.0, 0.05, 0.03, 0.05, 'plastic_red', { color: 0xe08a3a });
  },
});

defObj({
  key: 'trap_snare', name: 'Snare', w: 1, d: 1, height: 0.5, block: 'none',
  movable: 1, sound: 'wood',
  disassemble: { tools: [], time: 5, skill: 'trapping', yields: [['wire', 1, 1]] },
  desc: 'A wire noose on a bent sapling, set along a run where something small passes.',
  tags: [...T, 'trap', 'buildable'],
  model: (mb) => {
    mb.box(-0.25, 0, -0.1, 0.03, 0.22, 0.03, 'q_bark');
    // bent sapling
    const pts: [number, number, number][] = [[-0.3, 0, -0.3], [-0.28, 0.25, -0.25], [-0.15, 0.42, -0.12], [0.02, 0.45, 0.0], [0.12, 0.38, 0.06]];
    for (let i = 0; i + 1 < pts.length; i++) rod(mb, ...pts[i], ...pts[i + 1], 0.012 - i * 0.002, 4, 'q_bark');
    rod(mb, 0.12, 0.38, 0.06, 0.12, 0.2, 0.06, 0.003, 4, 'metal_grey');
    mb.push(); mb.translate(0.12, 0.12, 0.06); mb.rotateX(Math.PI / 2);
    torus(mb, 0, 0, 0, 0.08, 0.004, 10, 3, 'metal_grey');
    mb.pop();
    mb.box(0.12, 0, 0.0, 0.02, 0.06, 0.02, 'q_bark');
    rod(mb, -0.24, 0.2, -0.1, 0.1, 0.05, 0.02, 0.006, 4, 'q_bark');
  },
});

defObj({
  key: 'survivor_stash', name: 'Tarp-covered Stash', w: 1, d: 1, height: 0.85, block: 'solid',
  container: { capacity: 40, kind: 'pile', loot: 'survivor_stash' },
  sound: 'fabric', flammable: 0.6,
  desc: 'Supplies hidden under a weighted tarp. Whoever left them meant to come back.',
  tags: [...T, 'storage'],
  model: (mb) => {
    // what lies under the tarp: a crate, a barrel and a sack
    const hf = (x: number, z: number) => {
      const edge = Math.min(0.47 - Math.abs(x), 0.47 - Math.abs(z));
      const fall = Math.max(0, Math.min(1, edge / 0.1));
      const crate = (Math.abs(x + 0.14) < 0.25 && Math.abs(z + 0.12) < 0.24) ? 0.58 : 0;
      const bd = Math.hypot(x - 0.2, z - 0.12);
      const barrel = bd < 0.2 ? 0.8 : Math.max(0, 0.8 - (bd - 0.2) * 3.2);
      const sack = Math.max(0, 0.34 - Math.hypot(x + 0.12, z - 0.28) * 1.2);
      return Math.max(0.02, Math.max(crate, barrel, sack) * fall);
    };
    drape(mb, -0.48, -0.48, 0.48, 0.48, 7, 7, hf, 'q_tarp_green');
    // ropes over the top
    rod(mb, -0.48, 0.03, -0.05, -0.12, 0.62, -0.05, 0.012, 4, 'fabric_brown', { color: 0xd8c090 });
    rod(mb, -0.12, 0.62, -0.05, 0.2, 0.82, 0.0, 0.012, 4, 'fabric_brown', { color: 0xd8c090 });
    rod(mb, 0.2, 0.82, 0.0, 0.48, 0.03, 0.05, 0.012, 4, 'fabric_brown', { color: 0xd8c090 });
    // rocks pinning the corners
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.4], [0.4, 0.42], [-0.43, 0.4]]) rockBlob(mb, x, 0, z, 0.08, 0.09, 0.07, Math.round((x + 1) * 100 + z * 10), 'q_rock', 5, 3);
    // jerrycan corner and a strap poking out
    mb.push(); mb.translate(0.32, 0, 0.42); mb.rotateY(0.3);
    mb.box(0, 0, 0, 0.16, 0.22, 0.08, 'plastic_red', { color: 0xd04a3a });
    mb.box(0.03, 0.22, 0, 0.06, 0.03, 0.03, 'plastic_black');
    mb.pop();
    mb.box(-0.3, 0.005, 0.47, 0.04, 0.01, 0.1, 'fabric_grey');
  },
});

defObj({
  key: 'skeleton', name: 'Remains', w: 1, d: 1, height: 0.75, block: 'none',
  container: { capacity: 20, kind: 'pile', loot: 'survivor_corpse' },
  sound: 'flesh',
  desc: 'Someone sat down against the wall here and did not get up. Their jacket is still zipped to the chest.',
  tags: [...T, 'corpse', 'story', 'creepy'],
  model: (mb) => {
    // floor stain
    const st: [number, number][] = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const r = 0.28 + hashf(i, 1, 1701) * 0.12; st.push([Math.cos(a) * r * 1.2, -0.12 + Math.sin(a) * r]); }
    fan(mb, 0, 0.004, -0.12, st, 'q_jerky', { color: 0x5a4a44 });
    // pelvis + legs in jeans + boots (one leg out, one knee raised) — kept inside the tile
    mb.box(0, 0.02, -0.27, 0.3, 0.12, 0.16, 'q_denim');
    mb.box(-0.1, 0.03, -0.1, 0.13, 0.12, 0.38, 'q_denim');
    mb.box(-0.1, 0.03, 0.22, 0.11, 0.11, 0.3, 'q_denim');
    mb.box(-0.1, 0.0, 0.4, 0.12, 0.13, 0.2, 'leather_brown');
    mb.push(); mb.translate(0.1, 0.06, -0.24); mb.rotateX(-0.6);
    mb.box(0, -0.06, 0.19, 0.13, 0.12, 0.4, 'q_denim');
    mb.pop();
    mb.push(); mb.translate(0.1, 0.29, 0.08); mb.rotateX(-0.3);
    mb.box(0, -0.3, 0, 0.11, 0.3, 0.11, 'q_denim');
    mb.pop();
    mb.box(0.1, 0.0, 0.17, 0.12, 0.12, 0.22, 'leather_brown');
    // torso in an open jacket, leaning back on the wall
    mb.push(); mb.translate(0, 0.12, -0.28); mb.rotateX(-0.22);
    mb.box(0, 0, 0, 0.38, 0.44, 0.2, { south: 'q_ribcage', sides: 'q_jacket', top: 'q_jacket' }, { fit: { south: true } });
    mb.box(0, 0.44, 0, 0.12, 0.05, 0.08, 'q_bone');
    // arms: one limp at the side, one across the lap
    mb.box(-0.24, 0.0, 0.03, 0.11, 0.38, 0.11, 'q_jacket');
    mb.box(0.24, 0.18, 0.06, 0.11, 0.24, 0.11, 'q_jacket');
    mb.pop();
    mb.box(-0.27, 0.02, 0.05, 0.08, 0.06, 0.16, 'q_jacket');
    for (let i = 0; i < 3; i++) mb.box(-0.29 + i * 0.025, 0.0, 0.17, 0.015, 0.015, 0.07, 'q_bone');
    mb.push(); mb.translate(0.2, 0.2, -0.1); mb.rotateY(-0.9);
    mb.box(0, 0, 0.1, 0.1, 0.1, 0.24, 'q_jacket');
    for (let i = 0; i < 3; i++) mb.box(-0.03 + i * 0.025, 0.01, 0.26, 0.015, 0.015, 0.07, 'q_bone');
    mb.pop();
    // slumped skull with a beanie
    mb.push(); mb.translate(0.05, 0.57, -0.33); mb.rotateZ(0.42); mb.rotateX(0.35);
    mb.box(0, 0, 0, 0.15, 0.15, 0.17, 'q_bone');
    mb.box(0, -0.05, 0.05, 0.11, 0.05, 0.08, 'q_bone');
    for (const x of [-0.035, 0.035]) mb.box(x, 0.06, 0.081, 0.04, 0.035, 0.012, 'q_void');
    mb.box(0, 0.025, 0.083, 0.018, 0.025, 0.01, 'q_void');
    mb.box(0, -0.035, 0.087, 0.07, 0.012, 0.01, 'q_void');
    mb.box(0, 0.1, -0.01, 0.165, 0.07, 0.185, 'fabric_red', { color: 0xd0a0a0 });
    mb.pop();
    // backpack and an empty bottle
    mb.push(); mb.translate(-0.4, 0, -0.25); mb.rotateY(0.4);
    mb.box(0, 0, 0, 0.26, 0.36, 0.16, 'fabric_green');
    mb.box(0, 0.08, 0.09, 0.2, 0.14, 0.04, 'fabric_green', { color: 0xc8c8b8 });
    mb.pop();
    mb.push(); mb.translate(0.32, 0.035, 0.2); mb.rotateZ(Math.PI / 2); mb.rotateX(0.5);
    mb.cylinder(0, -0.1, 0, 0.035, 0.2, 6, 'glass', { color: 0xa0d0b0 });
    mb.pop();
  },
});

defObj({
  key: 'shrine', name: 'Memorial Shrine', w: 1, d: 1, height: 0.8, block: 'low',
  sound: 'wood', flammable: 0.6,
  light: { color: 0xffa050, intensity: 0.55, radius: 3, y: 0.5, kind: 'fire', flicker: 0.3, power: false },
  desc: 'Candles, photographs and flowers left for someone. One photograph shows you.',
  tags: [...T, 'story', 'light'],
  model: (mb) => {
    const zc = -0.18;
    mb.box(0, 0, zc, 0.72, 0.3, 0.4, { sides: 'q_crate_side', top: 'q_crate_top' }, { fit: true });
    mb.box(0, 0.3, zc, 0.76, 0.012, 0.44, 'fabric_grey', { color: 0xf0ece4 });
    for (const s of [-1, 1]) mb.box(s * 0.375, 0.18, zc, 0.01, 0.13, 0.44, 'fabric_grey', { color: 0xf0ece4 });
    // framed photos, leaning back
    const photo = (x: number, tex: string, w: number, h: number, rot: number) => {
      mb.push(); mb.translate(x, 0.312, zc - 0.1); mb.rotateY(rot); mb.rotateX(-0.25);
      mb.box(0, 0, 0, w + 0.03, h + 0.03, 0.015, 'wood_dark');
      mb.box(0, 0.015, 0.009, w, h, 0.004, tex, { fit: true });
      mb.pop();
    };
    photo(-0.18, 'q_photo_a', 0.13, 0.17, 0.2); photo(0.05, 'q_photo_c', 0.15, 0.2, -0.05); photo(0.25, 'q_photo_b', 0.12, 0.15, -0.3);
    // candles (on the shrine and on the floor in front)
    const candle = (x: number, y: number, z: number, h: number, r = 0.025) => {
      mb.cylinder(x, y, z, r, h, 6, 'q_candle');
      mb.cylinder(x, y + h, z, 0.018, 0.065, 5, 'q_flame', { rTop: 0, fit: true, emissive: 1.8, caps: false });
    };
    candle(-0.28, 0.312, zc + 0.12, 0.12); candle(-0.12, 0.312, zc + 0.14, 0.07); candle(0.17, 0.312, zc + 0.13, 0.16, 0.03);
    candle(-0.2, 0, 0.18, 0.1); candle(0.05, 0, 0.25, 0.06, 0.03); candle(0.24, 0, 0.12, 0.14); candle(-0.05, 0, 0.1, 0.18, 0.035);
    discY(mb, 0.05, 0.003, 0.25, 0.06, 7, 'q_candle');
    // jar of flowers
    mb.cylinder(0.3, 0.312, zc - 0.02, 0.05, 0.12, 7, 'glass', { color: 0xc8e0f0 });
    const blooms = [0xf28ab4, 0xf2d244, 0xf4f2ea, 0xb294e6, 0xf28ab4];
    blooms.forEach((c, i) => {
      const a = i * 1.3, dx = Math.cos(a) * 0.05, dz = Math.sin(a) * 0.04;
      rod(mb, 0.3, 0.4, zc - 0.02, 0.3 + dx, 0.55 + (i % 2) * 0.05, zc - 0.02 + dz, 0.005, 4, 'q_herbs');
      mb.box(0.3 + dx, 0.55 + (i % 2) * 0.05, zc - 0.02 + dz, 0.05, 0.035, 0.05, 'plastic_white', { color: c });
    });
    // teddy bear sitting by the shrine
    mb.sphere(-0.36, 0.09, 0.15, 0.085, 7, 4, 'fabric_brown');
    mb.sphere(-0.36, 0.22, 0.17, 0.06, 7, 4, 'fabric_brown');
    for (const x of [-0.41, -0.31]) mb.sphere(x, 0.27, 0.16, 0.022, 5, 3, 'fabric_brown');
    mb.box(-0.36, 0.21, 0.225, 0.03, 0.02, 0.02, 'plastic_black');
    mb.box(0.12, 0.003, 0.32, 0.12, 0.004, 0.08, 'q_card_note', { fit: true });
  },
});

defObj({
  key: 'tv_static', name: 'Television', w: 1, d: 1, height: 0.75, block: 'low',
  power: true, sound: 'glass', hum: 'fluoro',
  light: { color: 0xc8d0ff, intensity: 0.5, radius: 3, y: 0.4, kind: 'screen', flicker: 0.3, power: true },
  disassemble: { tools: ['#screwdriver'], time: 20, skill: 'electrical', yields: [['electronics_scrap', 2, 4], ['wire', 1, 2], ['glass_shard', 1, 3]] },
  desc: 'An old television on the floor, showing static. Between the snow, sometimes, a room.',
  tags: [...T, 'story', 'screens'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.2);
    mb.box(0, 0, 0, 0.58, 0.46, 0.26, { sides: 'q_crt_body', top: 'q_crt_body' }, { skip: ['bottom'] });
    mb.box(0, 0.06, -0.24, 0.44, 0.36, 0.24, 'q_crt_body', { skip: ['bottom'] });
    mb.box(-0.05, 0.07, 0.131, 0.38, 0.31, 0.01, 'q_crt_static', { fit: true, emissive: 1.25 });
    for (let i = 0; i < 3; i++) mb.cylinderZ(0.22, 0.32 - i * 0.08, 0.135, 0.022, 0.02, 6, 'plastic_black');
    // rabbit ears
    mb.box(0, 0.46, -0.05, 0.12, 0.03, 0.08, 'plastic_black');
    rod(mb, -0.02, 0.48, -0.05, -0.22, 0.75, -0.1, 0.005, 4, 'chrome');
    rod(mb, 0.02, 0.48, -0.05, 0.25, 0.72, -0.02, 0.005, 4, 'chrome');
    mb.pop();
    rod(mb, 0.0, 0.02, -0.35, 0.42, 0.01, -0.48, 0.01, 4, 'plastic_black');
    mb.push(); mb.translate(0.25, 0, 0.32); mb.rotateY(-0.4);
    mb.box(0, 0, 0, 0.19, 0.025, 0.1, { top: 'q_vhs', sides: 'plastic_black' }, { fit: { top: true } });
    mb.pop();
  },
});

defObj({
  key: 'phone_desk', name: 'Telephone Table', w: 1, d: 1, height: 0.95, block: 'table', surface: 0.74,
  sound: 'wood', flammable: 0.6,
  desc: 'An old rotary phone on a little table with a lace doily. It is going to ring.',
  tags: [...T, 'phone', 'mission', 'story'],
  model: (mb) => {
    const W = 'wood_dark';
    for (const x of [-0.21, 0.21]) for (const z of [-0.15, 0.15]) mb.cylinder(x, 0, z, 0.018, 0.71, 6, W, { rTop: 0.024 });
    mb.box(0, 0.71, 0, 0.52, 0.03, 0.4, W);
    mb.box(0, 0.6, 0.0, 0.46, 0.1, 0.36, W);
    mb.box(0, 0.62, 0.181, 0.2, 0.05, 0.01, 'wood_light');
    mb.box(0, 0.2, 0, 0.44, 0.02, 0.32, W);
    mb.box(0.05, 0.22, 0, 0.26, 0.06, 0.2, 'paper', { color: 0xe8d870 });
    mb.box(0, 0.741, 0, 0.36, 0.004, 0.3, 'q_doily', { fit: true });
    // rotary phone
    const y0 = 0.745;
    mb.box(0, y0, -0.02, 0.2, 0.06, 0.22, 'q_bakelite');
    mb.wedge(0, y0 + 0.06, -0.02, 0.2, 0.22, 0.07, 0.02, 'q_bakelite');
    // dial lies on the sloped top (slope ~0.22 rad)
    mb.push(); mb.translate(0, y0 + 0.098, 0.03); mb.rotateX(-1.35);
    disc(mb, 0, 0, 0.0, 0.065, 10, 'q_rotary_dial');
    mb.pop();
    // handset in the cradle
    mb.box(0, y0 + 0.13, -0.06, 0.22, 0.03, 0.05, 'q_bakelite');
    for (const x of [-0.1, 0.1]) mb.box(x, y0 + 0.11, -0.06, 0.06, 0.04, 0.07, 'q_bakelite');
    // coiled cord + notepad and pencil
    for (let i = 0; i < 5; i++) { mb.push(); mb.translate(-0.13 - i * 0.025, y0 + 0.02, 0.05 + i * 0.01); mb.rotateZ(Math.PI / 2); torus(mb, 0, 0, 0, 0.012, 0.003, 6, 3, 'q_bakelite'); mb.pop(); }
    mb.box(0.17, y0, 0.08, 0.11, 0.008, 0.14, 'paper', { color: 0xf4f0e0 });
    rod(mb, 0.12, y0 + 0.01, 0.03, 0.22, y0 + 0.01, 0.11, 0.005, 4, 'plastic_yellow');
  },
});

defObj({
  key: 'chair_stack', name: 'Stacked Chairs', w: 1, d: 1, height: 2.05, block: 'solid', tall: true,
  sound: 'plastic',
  desc: 'A leaning tower of stacking chairs, one taller than it should be able to stand.',
  tags: [...T, 'decor', 'liminal'],
  model: (mb) => {
    const n = 12, step = 0.09;
    const cols = [0xe07a3a, 0x4aa8a0, 0xd8d0b8, 0xe07a3a, 0x4aa8a0];
    // bottom chair legs
    for (const x of [-0.2, 0.2]) for (const z of [-0.18, 0.2]) rod(mb, x * 1.1, 0, z * 1.1, x, 0.43, z, 0.012, 4, 'chrome');
    for (let i = 0; i < n; i++) {
      const y = 0.43 + i * step, lean = i * 0.006, c = cols[i % cols.length];
      mb.push(); mb.translate(lean, 0, lean * 0.5);
      mb.box(0, y, 0.01, 0.44, 0.03, 0.42, 'q_paint_white', { color: c, skip: ['bottom'] });
      mb.box(0, y - 0.07, 0.21, 0.42, 0.07, 0.012, 'chrome', { skip: ['bottom', 'top'] });
      for (const x of [-0.215, 0.215]) mb.box(x, y - 0.07, 0.01, 0.012, 0.07, 0.42, 'chrome', { skip: ['bottom', 'top'] });
      mb.push(); mb.translate(0, y + 0.03, -0.2); mb.rotateX(-0.12);
      mb.box(0, 0.12, 0, 0.42, 0.22, 0.022, 'q_paint_white', { color: c, skip: ['bottom'] });
      for (const x of [-0.2, 0.2]) mb.box(x, 0, 0, 0.014, 0.34, 0.014, 'chrome', { skip: ['bottom'] });
      mb.pop();
      mb.pop();
    }
  },
});
