// Ground cover sprites, painted blade by blade at 32 px/m: grass tussocks (lush, mixed, sun-cured, tall seeding
// grass), clover and low herbs, small flowers in the planet's bloom colours, young ferns, mushroom clusters, shore
// sedges, pebbles, and flat leaf-litter and twig decals for the forest floor. Each blade is its own curved stroke
// with a base-to-tip ramp, lit from the upper left, back blades darker than front ones.
import { PixelCanvas, makeRamp, mixHex } from '../limbo/gfx/pixel';
import { Rand } from '../core/rand';
import type { Palette } from './palette';

export type GroundKind = 'grass' | 'tall' | 'dry' | 'clover' | 'flower' | 'fern' | 'mush' | 'sedge' | 'pebble' | 'litter' | 'twig';
export interface GroundSprite { kind: GroundKind; pc: PixelCanvas; flat: boolean; /** bloom colour index for flowers */ tint: number }

const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));
const R = (c: number, n = 7, s = 0.6, hs = 0.05) => makeRamp(c, n, { spread: s, hueShift: hs, satShift: 0.06 });

function canvas(w: number, h: number) { const pc = new PixelCanvas(w, h); pc.wrap = false; pc.clear(); return pc; }

/** one curved blade from (x, y) upward: lean sets where the tip goes, droop bends the top over */
function blade(pc: PixelCanvas, x: number, y: number, len: number, lean: number, droop: number, ramp: number[], o: { wide?: boolean; dryTip?: number[]; back?: boolean } = {}) {
  const n = ramp.length - 1, steps = Math.max(2, Math.ceil(len * 1.4));
  let tipX = x, tipY = y;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bx = x + lean * t * t * len * 0.9 + droop * Math.max(0, t - 0.55) ** 2 * len * 1.6;
    const by = y - len * t + droop * Math.max(0, t - 0.6) ** 2 * len * 1.2;
    const lit = lean < 0 ? 0.6 : 0;
    let k = 1.2 + t * (n - 1.6) + lit - (o.back ? 1 : 0);
    let c = ramp[ci(k, 1, n)];
    if (o.dryTip && t > 0.62) c = o.dryTip[ci(2 + (t - 0.62) * 8, 1, o.dryTip.length - 1)];
    pc.set(bx, by, c);
    if (o.wide && t < 0.35) pc.set(bx + 1, by, ramp[ci(k - 1, 1, n)]);
    tipX = bx; tipY = by;
  }
  return [tipX, tipY];
}

function tussock(r: Rand, pal: Palette, kind: 'grass' | 'tall' | 'dry', size: number): PixelCanvas {
  const W = Math.round(14 + size * 8), H = Math.round(kind === 'tall' ? 18 + size * 8 : 10 + size * 7);
  const pc = canvas(W, H + 2);
  // living blades lean green whatever the turf colour; the planet's hue still shows through
  const g0 = kind === 'dry' ? mixHex(pal.grassDry, pal.grass, 0.25) : mixHex(pal.grass, 0x6e9a3a, 0.3);
  const ramps = [
    R(g0, 7, 0.62), R(mixHex(g0, 0x8ab040, 0.22), 7, 0.6), R(mixHex(g0, 0x2e5a34, 0.25), 7, 0.6),
    R(mixHex(g0, pal.grassDry, kind === 'dry' ? 0.6 : 0.3), 7, 0.55),
  ];
  const dry = R(mixHex(pal.grassDry, 0xd8c890, 0.25), 6, 0.5);
  const n = kind === 'tall' ? r.int(16, 24) : r.int(14 + size * 6, 22 + size * 8);
  const cx = W / 2, by = H;
  // back layer then front layer
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < n / 2; i++) {
    const off = r.range(-0.32, 0.32) * W * (0.5 + size * 0.3);
    const x = cx + off, len = H * r.range(0.45, 0.98) * (layer ? 0.9 : 1);
    const lean = off / W * 1.6 + r.range(-0.35, 0.35), droop = r.chance(0.3) ? Math.sign(lean || 1) * r.range(0.1, 0.35) : 0;
    const ramp = kind === 'dry' ? (r.chance(0.6) ? ramps[3] : ramps[r.int(0, 2)]) : ramps[r.weighted([[0, 4], [1, 2], [2, 2], [3, 1]] as [number, number][])];
    blade(pc, x, by, len, lean, droop, ramp, { wide: layer === 1 && r.chance(0.3), dryTip: r.chance(kind === 'dry' ? 0.6 : 0.22) ? dry : undefined, back: layer === 0 });
  }
  if (kind === 'tall' || (kind === 'grass' && r.chance(0.35))) {
    // seeding stems: a fine stalk ending in a nodding panicle of pale seeds
    const seed = R(mixHex(pal.grassDry, r.pick([0xe0d0a0, 0xc8a070, 0xb89aa0]), 0.45), 6, 0.5);
    for (let k = r.int(kind === 'tall' ? 2 : 1, kind === 'tall' ? 4 : 2); k > 0; k--) {
      const x = cx + r.range(-W * 0.2, W * 0.2), lean = r.range(-0.3, 0.3);
      const [tx, ty] = blade(pc, x, by, H * r.range(0.85, 1), lean, 0, ramps[3]);
      const dir = Math.sign(lean || 1);
      for (let j = 0; j < 6; j++) {
        const sx = tx + dir * (j * 0.45) + (j % 2 ? 1 : -1) * 0.6, sy = ty + j * 0.9;
        pc.set(sx, sy, seed[ci(4 - j * 0.4, 1, 5)]);
        if (j % 2 === 0) pc.set(sx + dir, sy, seed[2]);
      }
    }
  }
  return pc;
}

function clover(r: Rand, pal: Palette): PixelCanvas {
  // a low mat of trefoil leaves on short stalks, a few pom flowers
  const W = 16, H = 9, pc = canvas(W, H);
  const G = R(mixHex(pal.grass, 0x4a8a3a, 0.45), 7, 0.6);
  for (let k = r.int(6, 10); k > 0; k--) {
    const x = r.range(2, W - 3), y = r.range(3, H - 2);
    pc.set(x, y + 1, G[1]);
    for (let l = 0; l < 3; l++) {
      const a = -Math.PI / 2 + (l - 1) * 2.1, lx = x + Math.cos(a) * 1.3, ly = y + Math.sin(a) * 0.9;
      pc.set(lx, ly, G[ci(4 + (l === 0 ? 1 : 0) - (y > H - 4 ? 1 : 0), 1, 6)]);
      pc.set(lx + (l === 2 ? 1 : l === 1 ? -1 : 0), ly, G[3]);
    }
    if (r.chance(0.15)) pc.set(x, y - 1, mixHex(G[6], 0xffffff, 0.3));
  }
  if (r.chance(0.6)) for (let k = r.int(1, 3); k > 0; k--) {
    const x = r.range(3, W - 4), y = r.range(1, 3), F = R(r.chance(0.5) ? 0xf0e8e0 : mixHex(pal.bloom[2] ?? 0xd06a90, 0xffffff, 0.35), 5, 0.4);
    pc.set(x, y + 1, G[2]); pc.set(x, y, F[3]); pc.set(x + 1, y, F[2]); pc.set(x, y - 1, F[4]); pc.set(x - 1, y, F[3]);
  }
  return pc;
}

function flower(r: Rand, pal: Palette, tint: number): PixelCanvas {
  const W = 12, H = 14, pc = canvas(W, H), G = R(mixHex(pal.grass, 0x3e7a34, 0.4), 6, 0.55);
  const col = pal.bloom[tint % pal.bloom.length], F = R(col, 6, 0.55, 0.06), eye = mixHex(pal.bloom[(tint + 3) % pal.bloom.length], 0xf0c040, 0.5);
  const form = r.int(0, 3);
  // a few basal leaves
  for (let k = 0; k < 4; k++) blade(pc, W / 2 + r.range(-2, 2), H - 1, r.range(2, 4), r.range(-1.2, 1.2), 0, G);
  for (let k = r.int(2, 4); k > 0; k--) {
    const x = W / 2 + r.range(-3.5, 3.5), [tx, ty] = blade(pc, x, H - 1, r.range(H * 0.45, H * 0.85), r.range(-0.25, 0.25), 0, G);
    if (form === 0) { // daisy: a ring of petals round a bright eye
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1]]) pc.set(tx + dx, ty + dy - 1, F[dy < 0 ? 5 : 3]);
      pc.set(tx, ty - 1, eye);
    } else if (form === 1) { // bell: a hanging cup
      pc.set(tx + 1, ty, F[4]); pc.set(tx + 1, ty + 1, F[3]); pc.set(tx + 2, ty + 1, F[2]); pc.set(tx + 1, ty + 2, F[1]);
    } else if (form === 2) { // spike: a column of florets, opening from the bottom
      for (let j = 0; j < 5; j++) { pc.set(tx, ty - j, F[ci(4 - j * 0.5, 1, 5)]); if (j < 3) pc.set(tx + (j % 2 ? 1 : -1), ty - j, F[ci(3 - j * 0.4, 1, 5)]); }
    } else { // puff: a round head
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i * i + j * j < 2) pc.set(tx + i, ty + j - 1, F[ci(3.6 - (i + j) * 0.8, 1, 5)]);
    }
  }
  return pc;
}

function youngFern(r: Rand, pal: Palette): PixelCanvas {
  const W = 20, H = 14, pc = canvas(W, H), G = R(mixHex(pal.foliage[r.int(0, pal.foliage.length - 1)], 0x3e7a34, 0.55), 7, 0.6);
  for (let f = r.int(3, 5); f > 0; f--) {
    const dir = r.chance(0.5) ? 1 : -1, len = r.range(7, 12), steps = 14;
    let px = W / 2 + r.range(-1, 1), py = H - 1;
    for (let i = 0; i < steps; i++) {
      const t = i / steps, nx = px + dir * (len / steps) * (0.4 + t * 0.9), ny = py - (len / steps) * (1.2 - t * 1.6);
      pc.set(nx, ny, G[2]);
      if (i > 2 && i % 2 === 0) { const l = Math.round((1 - t) * 3) + 1; for (let k = 1; k <= l; k++) { pc.set(nx - dir * 0.3, ny - k, G[ci(3 + k * 0.6, 1, 6)]); pc.set(nx + dir * 0.3, ny + k * 0.6, G[ci(2 + k * 0.3, 1, 5)]); } }
      px = nx; py = ny;
    }
  }
  return pc;
}

function mushrooms(r: Rand, pal: Palette): PixelCanvas {
  const W = 12, H = 9, pc = canvas(W, H);
  const C = R(r.pick(pal.fungus), 6, 0.55), S = R(mixHex(pal.fungus[0], 0xf0e8d8, 0.6), 5, 0.4);
  for (let k = r.int(1, 3); k > 0; k--) {
    const x = r.range(3, W - 4), h = r.int(2, 4), w = r.int(1, 2), top = H - 1 - h;
    for (let j = top; j < H; j++) pc.set(x, j, S[j === H - 1 ? 1 : 3]);
    for (let i = -w - 1; i <= w + 1; i++) { pc.set(x + i, top, C[ci(3.5 - i * 0.6, 1, 5)]); if (Math.abs(i) <= w) pc.set(x + i, top - 1, C[ci(4.5 - i * 0.6, 1, 5)]); }
    pc.set(x - w, top - 1, C[5]);
    if (r.chance(0.4)) pc.set(x + 1, top - 1, mixHex(C[5], 0xffffff, 0.5));
  }
  return pc;
}

function sedge(r: Rand, pal: Palette): PixelCanvas {
  const W = 14, H = 22, pc = canvas(W, H), G = R(mixHex(pal.grass, 0x3a6a4a, 0.45), 7, 0.6), D = R(mixHex(pal.grassDry, 0x8a7040, 0.3), 6, 0.5);
  for (let k = r.int(10, 16); k > 0; k--) blade(pc, W / 2 + r.range(-3, 3), H - 1, r.range(H * 0.5, H * 0.98), r.range(-0.4, 0.4), r.chance(0.2) ? r.range(-0.3, 0.3) : 0, G, { dryTip: r.chance(0.25) ? D : undefined, back: r.chance(0.4) });
  if (r.chance(0.5)) { const x = W / 2 + r.range(-2, 2); const [tx, ty] = blade(pc, x, H - 1, H * 0.9, r.range(-0.1, 0.1), 0, G); const B = R(0x6a4428, 5, 0.45); for (let j = 1; j < 5; j++) { pc.set(tx, ty + j, B[ci(3 - j * 0.3, 1, 4)]); pc.set(tx + 1, ty + j, B[1]); } }
  return pc;
}

function pebbles(r: Rand, pal: Palette): PixelCanvas {
  const W = 12, H = 6, pc = canvas(W, H);
  for (let k = r.int(2, 4); k > 0; k--) {
    const x = r.range(2, W - 3), y = r.range(2, H - 2), rr = r.range(0.8, 1.8), K = R(mixHex(pal.rock, r.pick([0xb0a090, 0x707888, 0x9a8a7a]), 0.3), 5, 0.55);
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if ((i * i) / (rr * rr) + (j * j) / (rr * rr * 0.6) <= 1) pc.set(x + i, y + j, K[ci(2.6 - (i + j) * 0.7, 1, 4)]);
  }
  return pc;
}

/** flat decal seen from above: fallen leaves, browned with a few still bright, and the odd twig */
function litter(r: Rand, pal: Palette, twig: boolean): PixelCanvas {
  const W = twig ? 20 : 18, H = twig ? 12 : 16, pc = canvas(W, H);
  if (twig) {
    const T = R(mixHex(pal.bark[1], 0x8a6a48, 0.3), 5, 0.5);
    let x = 2, y = r.range(4, H - 4), a = r.range(-0.4, 0.4);
    for (let k = 0; k < W - 4; k++) { pc.set(x, y, T[3]); pc.set(x, y + 1, T[1]); if (r.chance(0.12)) { let bx = x, byy = y; const s = r.pick([-1, 1]); for (let j = 0; j < r.int(2, 4); j++) { bx += 0.7; byy += s; pc.set(bx, byy, T[2]); } } x += Math.cos(a); y += Math.sin(a); a += r.range(-0.2, 0.2); }
    return pc;
  }
  for (let k = r.int(5, 9); k > 0; k--) {
    const fresh = r.chance(0.25);
    const base = fresh ? mixHex(r.pick(pal.foliage), 0x8a6a3a, 0.25) : mixHex(r.pick([...pal.foliage, ...pal.bloom]), r.pick([0x8a5a2a, 0xa06a30, 0x6a4a2a, 0xb08a3a]), r.range(0.58, 0.8));
    const F = R(base, 6, 0.5), x = r.range(3, W - 3), y = r.range(3, H - 3), a = r.range(0, Math.PI), len = r.range(1.6, 3), wid = r.range(0.8, 1.4);
    const dx = Math.cos(a), dy = Math.sin(a) * 0.7;
    for (let t = -len; t <= len; t += 0.5) {
      const w = wid * (1 - Math.abs(t) / (len + 0.6));
      for (let s = -w; s <= w; s += 0.5) pc.set(x + dx * t - dy * s, y + dy * t + dx * s * 0.7, F[ci(3 + (s < 0 ? 1 : -0.5), 1, 5)]);
    }
    for (let t = -len + 0.5; t < len; t += 0.5) pc.set(x + dx * t, y + dy * t, F[2]);
  }
  return pc;
}

/** the full ground-cover set for a planet */
export function paintGround(pal: Palette, seed: number): GroundSprite[] {
  const r = new Rand(seed ^ 0x6a0d), out: GroundSprite[] = [];
  const add = (kind: GroundKind, pc: PixelCanvas, flat = false, tint = 0) => out.push({ kind, pc, flat, tint });
  for (let i = 0; i < 8; i++) add('grass', tussock(r, pal, 'grass', i % 3));
  for (let i = 0; i < 4; i++) add('tall', tussock(r, pal, 'tall', 1 + (i % 2)));
  for (let i = 0; i < 5; i++) add('dry', tussock(r, pal, 'dry', i % 3));
  for (let i = 0; i < 4; i++) add('clover', clover(r, pal));
  for (let i = 0; i < pal.bloom.length * 2; i++) add('flower', flower(r, pal, i % pal.bloom.length), false, i % pal.bloom.length);
  for (let i = 0; i < 4; i++) add('fern', youngFern(r, pal));
  for (let i = 0; i < 4; i++) add('mush', mushrooms(r, pal));
  for (let i = 0; i < 3; i++) add('sedge', sedge(r, pal));
  for (let i = 0; i < 3; i++) add('pebble', pebbles(r, pal));
  for (let i = 0; i < 5; i++) add('litter', litter(r, pal, false), true);
  for (let i = 0; i < 2; i++) add('twig', litter(r, pal, true), true);
  return out;
}
