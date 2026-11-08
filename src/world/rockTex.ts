// Stone and wood surfaces for sculpted rocks, fallen logs and stumps: 64 x 64 tileable pixel art at 32 px/m (a 2 m
// repeat), painted per planet palette into one array texture. Each rock family has a side face (jointing, bedding,
// grain, weathering) and a top face (weathered, pitted, lichen-crusted); moss, bark and end grain are shared.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex } from '../limbo/gfx/pixel';
import { tileFbm, hashf } from '../limbo/core/rng';
import { Rand } from '../core/rand';
import type { Palette } from './palette';

/** sqrt-based length (Math.hypot is several times slower in the hot loops) */
const hyp = (a: number, b: number, c = 0) => Math.sqrt(a * a + b * b + c * c);
export const RS = 64;
/** layer indices: rock family k has side 2k and top 2k + 1 */
export const RL = { granite: 0, sandstone: 2, basalt: 4, limestone: 6, moss: 8, bark: 9, end: 10, barkDark: 11 } as const;
export const RLAYERS = 12;

const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));
const R = (c: number, n = 8, spread = 0.6, hue = 0.035) => makeRamp(c, n, { spread, hueShift: hue, satShift: 0.05 });
const fbm = (x: number, y: number, cells: number, oct: number, seed: number) => tileFbm(x, y, RS, RS, cells, oct, seed);

/** rock family base colours for a palette */
export function rockColours(pal: Palette) {
  return {
    granite: pal.rock,
    sandstone: mixHex(mixHex(pal.sand, pal.clay, 0.5), 0xc87a46, 0.18),
    basalt: mixHex(pal.basalt, 0x6e6a72, 0.5),
    limestone: mixHex(pal.rock, 0xe0d8c4, 0.55),
    moss: scaleHex(mixHex(mixHex(pal.grass, 0x42742c, 0.55), pal.foliage[0], 0.15), 0.82),
  };
}

/** wrap-aware voronoi on the tile: [d1, d2, index] */
function vor(pts: number[][], x: number, y: number) {
  let d1 = 1e9, d2 = 1e9, i1 = 0;
  for (let i = 0; i < pts.length; i++) {
    let dx = Math.abs(x - pts[i][0]); dx = Math.min(dx, RS - dx);
    let dy = Math.abs(y - pts[i][1]); dy = Math.min(dy, RS - dy);
    const d = hyp(dx * (pts[i][3] ?? 1), dy);
    if (d < d1) { d2 = d1; d1 = d; i1 = i; } else if (d < d2) d2 = d;
  }
  return [d1, d2, i1];
}

/** a wandering crack: a dark core, a shadowed upper lip and a sunlit lower lip (light from the upper left) */
function crack(pc: PixelCanvas, r: Rand, x: number, y: number, n: number, dx: number, dy: number, dark: number, lit: number, wob = 0.5) {
  let a = Math.atan2(dy, dx);
  for (let k = 0; k < n; k++) {
    pc.set(x, y, dark);
    pc.blend(x - 1, y - 1, dark, 0.35);
    pc.blend(x + 1, y + 1, lit, 0.45);
    a += r.range(-wob, wob) * 0.5;
    x += Math.cos(a); y += Math.sin(a);
    if (r.chance(0.04)) { const b = r.pick([-1, 1]); crack(pc, r, x, y, r.int(2, 6), Math.cos(a + b), Math.sin(a + b), dark, lit, wob); }
  }
}

/** lichen rosette: a dithered crust with a paler growing rim */
function lichen(pc: PixelCanvas, r: Rand, x: number, y: number, rad: number, c: number) {
  const C = R(c, 5, 0.4);
  for (let j = -rad - 1; j <= rad + 1; j++) for (let i = -rad - 1; i <= rad + 1; i++) {
    const d = hyp(i, j * 1.15) / rad + (hashf(x + i, y + j, 9) - 0.5) * 0.45;
    if (d > 1) continue;
    if (d > 0.72) pc.set(x + i, y + j, C[3 + (hashf(i, j, 3) > 0.5 ? 1 : 0)]);
    else if (hashf(x + i, y + j, 4) < 0.7) pc.set(x + i, y + j, C[ci(1.5 + hashf(x + i, y + j, 5) * 2, 1, 3)]);
  }
  void r;
}

function granite(pc: PixelCanvas, c: number, seed: number, top: boolean) {
  const r = new Rand(seed), K = R(c, 8, 0.6);
  const feld = mixHex(c, 0xe0c0b0, 0.42), quartz = mixHex(c, 0xf0ece4, 0.55), mica = scaleHex(c, 0.42);
  // broad mottling of the crystal mass, coarse grain on top
  pc.each((x, y) => {
    const n = fbm(x, y, 4, 3, seed) * 0.7 + fbm(x, y, 16, 2, seed + 7) * 0.3;
    let k = 2.6 + n * 3 + (pc.clusterT(x, y) - 0.5) * 0.9;
    if (top) k += (fbm(x, y, 3, 2, seed + 9) - 0.5) * 1.2;
    pc.set(x, y, K[ci(k, 1, 6)]);
    const h = hashf(x, y, seed + 1);
    if (h < 0.07) pc.set(x, y, feld);
    else if (h < 0.1) pc.set(x, y, quartz);
    else if (h < 0.16) pc.set(x, y, h < 0.13 ? mica : K[1]);
  });
  // feldspar phenocrysts: blocky pale crystals with a dark edge
  for (let i = 0; i < 9; i++) {
    const x = r.int(0, RS - 1), y = r.int(0, RS - 1), w = r.int(1, 3), hh = r.int(1, 2);
    for (let j = 0; j < hh; j++) for (let k = 0; k < w; k++) pc.set(x + k, y + j, mixHex(feld, 0xffffff, 0.1));
    pc.set(x + w, y + hh, K[1]);
  }
  if (!top) {
    // joints and exfoliation sheets
    crack(pc, r, r.int(0, RS - 1), 0, RS + 8, r.range(-0.15, 0.15), 1, K[0], K[7], 0.25);
    for (let i = 0; i < 2; i++) crack(pc, r, 0, r.int(4, RS - 4), RS + 4, 1, r.range(-0.2, 0.2), K[0], K[7], 0.3);
    for (let i = 0; i < 5; i++) crack(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(4, 12), r.range(-1, 1), r.range(-1, 1), K[1], K[6], 0.6);
    // rain streaks running down from ledges
    for (let i = 0; i < 6; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1), l = r.int(6, 20); for (let k = 0; k < l; k++) pc.blend(x + (k > l * 0.6 && r.chance(0.2) ? 1 : 0), y + k, K[1], 0.18 * (1 - k / l)); }
  } else {
    // weather pits and grit
    for (let i = 0; i < 4; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1), rr = r.range(1.5, 3); pc.ellipseBlend(x, y, rr, rr * 0.7, K[1], 0.6); pc.blend(x + 1, y + rr * 0.7, K[7], 0.5); }
    for (let i = 0; i < 4; i++) crack(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(5, 14), r.range(-1, 1), r.range(-1, 1), K[0], K[6], 0.6);
  }
  for (let i = 0; i < (top ? 7 : 3); i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(2, 4), r.pick([0xa8b46a, 0xc8b45a, 0x9ab0a6, 0xd09a4a]));
}

function sandstone(pc: PixelCanvas, c: number, seed: number, top: boolean) {
  const r = new Rand(seed), K = R(c, 8, 0.55, 0.03);
  const bandT = Array.from({ length: RS }, (_, y) => fbm(0, y, 8, 3, seed + 3));
  pc.each((x, y) => {
    if (top) {
      // slickrock: smooth swells of colour, fine sand grain, shallow potholes
      const n = fbm(x, y, 3, 3, seed) * 0.7 + fbm(x, y, 12, 2, seed + 5) * 0.3;
      pc.set(x, y, K[ci(2.8 + n * 2.6 + (pc.clusterT(x, y) - 0.5) * 0.8, 1, 6)]);
    } else {
      // laminations: thin beds of slightly different tone, warped, with cross-bedded sets inside the thicker ones
      const yy = y + (fbm(x, y, 2, 2, seed + 11) - 0.5) * 6;
      const b = bandT[ci(yy, 0, RS - 1)] ?? 0.5;
      let k = 2.4 + b * 3.4 + (pc.clusterT(x, y) - 0.5) * 0.7;
      const set = Math.floor(yy / 11);
      if (hashf(set, 0, seed) > 0.5 && ((x * 0.45 + yy * (hashf(set, 1, seed) > 0.5 ? 1 : -1)) % 4 + 4) % 4 < 0.9) k -= 0.8;
      if (((yy % 11) + 11) % 11 < 0.9) k -= 1.4;
      pc.set(x, y, K[ci(k, 1, 6)]);
    }
    if (hashf(x, y, seed + 2) < 0.06) pc.set(x, y, hashf(x, y, seed + 6) < 0.5 ? K[6] : K[2]);
  });
  // tafoni / potholes: honeycomb hollows, dark inside, lit lower lip
  for (let i = 0; i < (top ? 3 : 6); i++) {
    const x = r.int(0, RS - 1), y = r.int(0, RS - 1), rx = r.range(1.5, top ? 4 : 3.2), ry = rx * r.range(0.55, 0.85);
    pc.ellipseBlend(x, y, rx, ry, K[0], 0.75);
    for (let k = -Math.floor(rx); k <= Math.floor(rx); k++) pc.blend(x + k, y + ry + 0.5, K[7], 0.55);
  }
  if (!top) {
    // desert varnish: dark streaks hanging from the top of the face
    for (let i = 0; i < 5; i++) { const x = r.int(0, RS - 1), l = r.int(10, 40), w = r.int(1, 3); for (let k = 0; k < l; k++) for (let j = 0; j < w; j++) pc.blend(x + j, k, mixHex(K[0], 0x3a2a2a, 0.4), 0.32 * (1 - k / l)); }
    for (let i = 0; i < 3; i++) crack(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(8, 22), r.range(-0.2, 0.2), 1, K[0], K[7], 0.3);
  } else for (let i = 0; i < 3; i++) crack(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(6, 16), r.range(-1, 1), r.range(-1, 1), K[1], K[7], 0.5);
  for (let i = 0; i < (top ? 3 : 1); i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(1, 3), r.pick([0xc89a4a, 0xa8a868, 0xd0784a]));
}

function basalt(pc: PixelCanvas, c: number, seed: number, top: boolean) {
  const r = new Rand(seed), K = R(c, 8, 0.6, 0.04);
  const pts = Array.from({ length: top ? 7 : 5 }, (_, i) => [top ? r.range(0, RS) : (i + r.range(0.3, 0.7)) * (RS / 5), r.range(0, RS), r.range(2.6, 4.2), top ? 1 : 0.06]);
  pc.each((x, y) => {
    const [d1, d2, i] = vor(pts, x, y), e = d2 - d1;
    const n = fbm(x, y, 6, 3, seed);
    let k = pts[i][2] + (n - 0.5) * 1.8 + (pc.clusterT(x, y) - 0.5) * 0.8;
    if (e < 1.2) k = 0.4;
    else if (e < 2.4) k += (top ? -1 : 1) * 0.8; // bevelled joint edges
    pc.set(x, y, K[ci(k, 0, 6)]);
    if (hashf(x, y, seed + 4) < 0.05) pc.set(x, y, K[6]);
  });
  // vesicles: gas bubbles frozen in the lava, dark pits with a lit lower rim
  for (let i = 0; i < 26; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1); pc.set(x, y, K[0]); if (r.chance(0.5)) pc.set(x + 1, y, K[0]); pc.set(x, y + 1, K[6]); }
  // cross joints and rusty oxidation
  if (!top) for (let i = 0; i < 6; i++) crack(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(4, 10), 1, r.range(-0.15, 0.15), K[0], K[5], 0.2);
  for (let i = 0; i < 3; i++) pc.ditherBlob(r.int(0, RS - 1), r.int(0, RS - 1), r.range(3, 7), r.range(2, 5), mixHex(c, 0x8a4a2a, 0.45), 0.8);
}

function limestone(pc: PixelCanvas, c: number, seed: number, top: boolean) {
  const r = new Rand(seed), K = R(c, 8, 0.55, 0.03);
  const pts = Array.from({ length: 6 }, () => [r.range(0, RS), r.range(0, RS), r.range(3, 4.4), 1]);
  pc.each((x, y) => {
    let k: number;
    if (top) {
      // clints and grikes: pale blocks parted by dark solution fissures
      const [d1, d2, i] = vor(pts, x, y), e = d2 - d1;
      k = pts[i][2] + (fbm(x, y, 5, 3, seed) - 0.5) * 1.6 + (pc.clusterT(x, y) - 0.5) * 0.7;
      if (e < 1.4) k = 0.5; else if (e < 2.6) k -= 0.9;
    } else {
      // karren: vertical runnels etched by rain, faint bedding
      const xx = x + (fbm(x, y, 2, 2, seed + 3) - 0.5) * 8;
      const g = Math.sin((xx / RS) * Math.PI * 2 * 7 + hashf(Math.floor(xx / 9), 0, seed) * 2);
      k = 3.2 + g * 0.9 + (fbm(x, y, 4, 3, seed) - 0.5) * 1.6 + (pc.clusterT(x, y) - 0.5) * 0.6;
      if (((y + Math.floor(fbm(x, 0, 3, 1, seed + 8) * 4)) % 16) === 0) k -= 1.2;
    }
    pc.set(x, y, K[ci(k, 0, 6)]);
    if (hashf(x, y, seed + 2) < 0.05) pc.set(x, y, K[hashf(x, y, seed + 3) < 0.5 ? 1 : 7]);
  });
  for (let i = 0; i < 18; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1); pc.set(x, y, K[1]); pc.set(x, y + 1, K[7]); }
  // dark algae streaks and lichen
  if (!top) for (let i = 0; i < 6; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS / 2), l = r.int(10, 30); for (let k = 0; k < l; k++) pc.blend(x, y + k, mixHex(K[1], 0x3a4a3a, 0.4), 0.3 * (1 - k / l)); }
  for (let i = 0; i < 4; i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(2, 4), r.pick([0xb8c070, 0xd8b050, 0x9ab4a4]));
}

function moss(pc: PixelCanvas, c: number, seed: number) {
  // cushion moss: domed clumps lit from the upper left, dark crevices between them, bright fresh tips and a few
  // ruddy sporophyte stalks
  const r = new Rand(seed), K = R(c, 8, 0.6, 0.05);
  const pts = Array.from({ length: 40 }, () => [r.range(0, RS), r.range(0, RS), r.range(-0.6, 0.6), 1]);
  pc.each((x, y) => {
    const [d1, d2, i] = vor(pts, x, y), e = d2 - d1;
    const rr = Math.max(1, (d1 + d2) * 0.5);
    let dx = x - pts[i][0], dy = y - pts[i][1];
    if (dx > RS / 2) dx -= RS; if (dx < -RS / 2) dx += RS; if (dy > RS / 2) dy -= RS; if (dy < -RS / 2) dy += RS;
    const lit = -(dx + dy) / rr;
    let k = 3.2 + lit * 1.6 + pts[i][2] + (pc.clusterT(x, y) - 0.5) * 1.1;
    if (e < 1.1) k = 0.6;
    pc.set(x, y, K[ci(k, 0, 7)]);
    if (hashf(x, y, seed + 3) < 0.05) pc.set(x, y, K[7]);
  });
  for (let i = 0; i < 10; i++) { const x = r.int(0, RS - 1), y = r.int(0, RS - 1); pc.set(x, y, 0x9a5a3a); pc.set(x, y - 1, 0xc0844a); }
}

function bark(pc: PixelCanvas, c: number, seed: number) {
  // furrowed bark along the u (length) axis: ridges broken into plates, deep dark furrows, a little lichen
  const r = new Rand(seed), K = R(c, 8, 0.6, 0.04);
  const lanes = 9;
  pc.each((x, y) => {
    const yy = y + (fbm(x, y, 3, 2, seed) - 0.5) * 5;
    const lane = (yy / RS) * lanes, f = lane - Math.floor(lane);
    const plate = hashf(Math.floor(lane), Math.floor((x + hashf(Math.floor(lane), 3, seed) * 20) / 9), seed);
    let k = 2.5 + Math.sin(f * Math.PI) * 2.2 + (plate - 0.5) * 1.2 + (pc.clusterT(x, y) - 0.5) * 0.6;
    if (f < 0.14 || f > 0.92) k = 0.3;
    if (hashf(Math.floor(lane), Math.floor(x / 9), seed + 1) < 0.18 && ((x % 9) === 0)) k = 0.8;
    pc.set(x, y, K[ci(k, 0, 6)]);
  });
  for (let i = 0; i < 3; i++) lichen(pc, r, r.int(0, RS - 1), r.int(0, RS - 1), r.int(1, 3), r.pick([0xa8b46a, 0x9ab0a6, 0xc8b45a]));
}

function endGrain(pc: PixelCanvas, c: number, heart: number, seed: number) {
  // a cut or broken end: growth rings around the pith, darker heartwood, radial checks, a rim of bark
  const r = new Rand(seed), W = R(c, 7, 0.5), H = R(heart, 7, 0.5), cx = RS / 2 - 0.5, cy = RS / 2 - 0.5;
  pc.each((x, y) => {
    const dx = x - cx, dy = y - cy, d = hyp(dx, dy) / (RS / 2), a = Math.atan2(dy, dx);
    const ring = Math.sin((d * 11 + Math.sin(a * 3 + seed) * 0.15) * Math.PI * 2);
    const ramp = d < 0.55 ? H : W;
    let k = 3.4 + ring * 0.7 - d * 0.6 + (pc.clusterT(x, y) - 0.5) * 0.5;
    if (d > 0.93) k = 0.8;
    pc.set(x, y, ramp[ci(k, 0, 6)]);
  });
  for (let i = 0; i < 5; i++) { const a = r.range(0, Math.PI * 2), l = r.range(6, 20); for (let k = 2; k < l; k++) pc.set(cx + Math.cos(a) * k, cy + Math.sin(a) * k, W[0]); }
}

/** paint every rock / wood layer into one mipmapped array texture */
export function buildRockTexture(pal: Palette, seed: number): THREE.DataArrayTexture {
  const data = new Uint8Array(RS * RS * 4 * RLAYERS);
  const col = rockColours(pal);
  const paint = (layer: number, fn: (pc: PixelCanvas) => void) => { const pc = new PixelCanvas(RS, RS); pc.fill(0); fn(pc); data.set(pc.data, layer * RS * RS * 4); };
  const s = seed * 977 + 13;
  paint(RL.granite, (p) => granite(p, col.granite, s + 1, false));
  paint(RL.granite + 1, (p) => granite(p, scaleHex(col.granite, 1.04), s + 2, true));
  paint(RL.sandstone, (p) => sandstone(p, col.sandstone, s + 3, false));
  paint(RL.sandstone + 1, (p) => sandstone(p, scaleHex(col.sandstone, 1.05), s + 4, true));
  paint(RL.basalt, (p) => basalt(p, col.basalt, s + 5, false));
  paint(RL.basalt + 1, (p) => basalt(p, col.basalt, s + 6, true));
  paint(RL.limestone, (p) => limestone(p, col.limestone, s + 7, false));
  paint(RL.limestone + 1, (p) => limestone(p, col.limestone, s + 8, true));
  paint(RL.moss, (p) => moss(p, col.moss, s + 9));
  paint(RL.bark, (p) => bark(p, pal.bark[0], s + 10));
  paint(RL.end, (p) => endGrain(p, mixHex(pal.bark[1], 0xc8a878, 0.45), mixHex(pal.bark[0], 0x8a5a3a, 0.3), s + 11));
  paint(RL.barkDark, (p) => bark(p, mixHex(pal.bark[2], 0x2a2420, 0.25), s + 12));
  const tex = new THREE.DataArrayTexture(data, RS, RS, RLAYERS);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType; tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}
