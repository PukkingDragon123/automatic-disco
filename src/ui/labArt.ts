// The field laboratory's hand-painted pixel textures: linoleum checker floor, glazed wall tiles, cream plaster,
// enamelled steel, brass, copper windings, cable rubber, oak and porcelain (tiling, world-projected at a high
// texel density), plus one decal sheet painted with everything that has a face of its own: the U.S.P.C. banner,
// two chalkboards, warning signs, console fronts, the sequencer cabinet, tape reels, posters, a clock, a door.
// Texels with alpha 200 glow (lamps, lit buttons); alpha below 128 is cut out (the banner's fringe, round reels).
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer } from '../limbo/gfx/pixel';
import { tileFbm, hashf, Rng } from '../limbo/core/rng';
import { text, textC, textW, gauge, rivet, stripes, rust, glow, woodFill, poly, scribble } from '../limbo/content/furniture/b_common';
import { paintMetal } from '../game/child';

export const LIT = 200;
const TAU = Math.PI * 2;

function tex(pc: PixelCanvas, repeat: boolean, smoothMip = false): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(pc.data.buffer.slice(0)), pc.w, pc.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.magFilter = THREE.NearestFilter; t.minFilter = smoothMip ? THREE.NearestMipmapLinearFilter : THREE.NearestMipmapNearestFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
const ramp = (c: number, n = 7, spread = 0.5) => makeRamp(c, n, { spread, hueShift: 0.04 });
const R = (r: number[], k: number) => r[Math.max(0, Math.min(r.length - 1, Math.round(k)))];
/** dithered ramp index */
const D = (r: number[], k: number, x: number, y: number) => R(r, k + (bayer(x, y) - 0.5) * 0.9);

// ================================================================================================ tiling surfaces
/** 1950s linoleum: big cream and teal checker tiles, marbled streaks, scuffs, wax glints, cracked corners */
function floor() {
  const S = 256, pc = new PixelCanvas(S, S);
  const A = ramp(0xcfc4a4, 7, 0.36), B = ramp(0x2f5048, 7, 0.42), grout = 0x24201a;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ix = x >> 6, iy = y >> 6, lx = x & 63, ly = y & 63, dark = (ix + iy) & 1, r = dark ? B : A;
    const marb = Math.sin(x * 0.06 + y * 0.11 + tileFbm(x, y, S, S, 4, 3, 11 + ix * 7 + iy) * 14);
    let k = 3.3 + (tileFbm(x, y, S, S, 8, 3, 3) - 0.5) * 1.3 + (hashf(ix, iy, 3) - 0.5) * 0.9 + (hashf(x, y, 5) - 0.5) * 0.5 + (Math.abs(marb) < 0.08 ? (dark ? 1.4 : -1.1) : 0);
    if (tileFbm(x, y, S, S, 16, 2, 9) > 0.72) k -= 0.9; // scuffs
    if (lx === 0 || ly === 0) { pc.set(x, y, grout); continue; }
    if (lx === 1 || ly === 1) k += 0.8; else if (lx === 63 || ly === 63) k -= 0.9;
    pc.set(x, y, D(r, k, x, y));
  }
  // wax glints and cracked corners
  const rng = new Rng(41);
  for (let i = 0; i < 9; i++) { const cx = rng.int(4, S - 4), cy = rng.int(4, S - 4); for (let j = 0; j < 7; j++) pc.blend(cx + j, cy - (j >> 1), 0xffffff, 0.35); }
  for (let i = 0; i < 6; i++) {
    let x = (rng.int(0, 3) << 6) + rng.int(0, 1) * 63, y = (rng.int(0, 3) << 6) + rng.int(0, 1) * 63;
    for (let j = 0; j < 22; j++) { x += rng.int(-1, 1) + (x & 63 ? 0 : 1); y += rng.int(0, 1) || (j & 1); pc.set(x, y, grout); }
  }
  return tex(pc, true, true);
}
/** glazed sea-foam wall tiles with white grout, glaze highlights, crazing and chips */
function wallTile() {
  const S = 256, pc = new PixelCanvas(S, S), G = ramp(0x84ae98, 7, 0.4), grout = 0xc8c4b0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ix = x >> 5, iy = y >> 5, lx = x & 31, ly = y & 31;
    if (lx === 0 || ly === 0) { pc.set(x, y, mixHex(grout, 0x6a6a5a, tileFbm(x, y, S, S, 6, 2, 5) * 0.5)); continue; }
    let k = 3.6 + (hashf(ix, iy, 2) - 0.5) * 0.9 + (tileFbm(x, y, S, S, 4, 2, 7) - 0.5) * 0.7 - (ly / 31) * 0.8 + (lx < 3 || ly < 3 ? 1 : 0) - (lx > 29 || ly > 29 ? 0.9 : 0);
    if (lx > 4 && lx < 12 && ly === 4) k += 2.2; // glaze highlight
    pc.set(x, y, D(G, k, x, y));
  }
  const rng = new Rng(77);
  for (let i = 0; i < 14; i++) { // crazing
    const tx = rng.int(0, 7) * 32, ty = rng.int(0, 7) * 32;
    let x = tx + rng.int(4, 27), y = ty + rng.int(4, 27);
    for (let j = 0; j < 16; j++) { pc.blend(x, y, G[1], 0.6); x += rng.int(-1, 1); y += rng.int(-1, 1); x = Math.max(tx + 1, Math.min(tx + 31, x)); y = Math.max(ty + 1, Math.min(ty + 31, y)); }
  }
  for (let i = 0; i < 6; i++) { const x = rng.int(0, 7) * 32 + 1, y = rng.int(0, 7) * 32 + 1; pc.rect(x, y, rng.int(2, 4), rng.int(2, 3), 0xe8e4d8); pc.set(x + 1, y + 2, G[2]); }
  return tex(pc, true, true);
}
/** cream plaster with mottling, water stains and hairline cracks */
function plaster() {
  const S = 128, pc = new PixelCanvas(S, S), P = ramp(0xd2c7a6, 7, 0.32);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let k = 3.6 + (tileFbm(x, y, S, S, 4, 4, 13) - 0.5) * 1.8 + (hashf(x, y, 1) - 0.5) * 0.6;
    const st = tileFbm(x, y, S, S, 3, 3, 21);
    if (st > 0.68) k -= (st - 0.68) * 9;
    pc.set(x, y, D(P, k, x, y));
  }
  const rng = new Rng(5);
  for (let i = 0; i < 3; i++) { let x = rng.int(0, S), y = rng.int(0, S); for (let j = 0; j < 30; j++) { pc.blend(x, y, P[1], 0.7); x += rng.int(-1, 1); y += 1; } }
  return tex(pc, true, true);
}
function concrete() {
  const S = 128, pc = new PixelCanvas(S, S), C = ramp(0x7a7870, 7, 0.36);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let k = 3.4 + (tileFbm(x, y, S, S, 6, 4, 31) - 0.5) * 1.6 + (hashf(x, y, 3) - 0.5) * 0.9;
    if (hashf(x, y, 9) > 0.985) k -= 2;
    pc.set(x, y, D(C, k, x, y));
  }
  return tex(pc, true, true);
}
/** brushed brass with polish streaks */
function brass(base = 0xb48c42) {
  const S = 64, pc = new PixelCanvas(S, S), B = ramp(base, 8, 0.6);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = 4 + Math.sin(y * 0.4 + hashf(0, y, 3) * 4) * 0.7 + (hashf(x >> 3, y, 7) - 0.5) * 1.1 + (tileFbm(x, y, S, S, 3, 2, 3) - 0.5) * 1.6;
    pc.set(x, y, D(B, k, x, y));
  }
  return tex(pc, true);
}
/** copper wire windings (rows of round wire with a lit crown) */
function windings() {
  const S = 64, pc = new PixelCanvas(S, S), C = ramp(0xc06a34, 8, 0.65);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = y % 4, k = r === 0 ? 0.6 : r === 1 ? 6.5 : r === 2 ? 4.6 : 2.6;
    pc.set(x, y, D(C, k + (hashf(x, y, 3) - 0.5) * 0.8 + (tileFbm(x, y, S, S, 2, 2, 9) - 0.5), x, y));
  }
  return tex(pc, true);
}
function rubber() {
  const S = 32, pc = new PixelCanvas(S, S), K = ramp(0x2a2826, 6, 0.4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) pc.set(x, y, D(K, 2.4 + (x % 8 === 0 ? -1 : x % 8 === 1 ? 1 : 0) + (hashf(x, y, 1) - 0.5) * 0.6, x, y));
  return tex(pc, true);
}
function oak() {
  const S = 128, pc = new PixelCanvas(S, S);
  woodFill(pc, makeRamp(0x8a5a32, 7, { spread: 0.5, hueShift: 0.04 }), 7, 16, false, true);
  return tex(pc, true);
}
function porcelain() {
  const S = 32, pc = new PixelCanvas(S, S), P = ramp(0xdde4e4, 6, 0.3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) pc.set(x, y, D(P, 3 + (y % 8 < 2 ? 1.6 : 0) + (hashf(x, y, 2) - 0.5) * 0.5, x, y));
  return tex(pc, true);
}
/** an emissive bulb / lamp lens: warm white everywhere (alpha LIT) */
function bulb(c: number) {
  const S = 16, pc = new PixelCanvas(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) pc.set(x, y, mixHex(c, 0xffffff, hashf(x, y, 1) * 0.4), LIT);
  return tex(pc, true);
}

// ================================================================================================ the decal sheet
export const SHEET = 1024;
/** [x, y, w, h] in sheet pixels */
export type Rect = [number, number, number, number];
export const DEC: Record<string, Rect> = {
  banner: [0, 0, 192, 320], chalkA: [192, 0, 512, 256], chalkB: [704, 0, 256, 192],
  consoleA: [192, 256, 256, 96], consoleB: [448, 256, 256, 96], desk: [704, 192, 256, 128],
  reelFace: [0, 320, 128, 256], reelDisc: [128, 320, 64, 64], signHV: [192, 352, 128, 96], signBio: [320, 352, 112, 112], signRad: [432, 352, 112, 112],
  signNo: [544, 352, 128, 48], signAuth: [544, 400, 160, 40], plaque: [704, 320, 128, 40], clock: [832, 320, 64, 64], calendar: [896, 320, 64, 96],
  poster1: [128, 464, 128, 176], poster2: [256, 464, 128, 176], centTop: [384, 464, 128, 128], hazard: [512, 464, 128, 32], blinken: [512, 496, 64, 32],
  labelJar: [576, 496, 64, 24], gaugeBig: [640, 464, 64, 64], keys: [704, 464, 128, 48], door: [832, 416, 128, 256], grate: [0, 640, 128, 128],
  fuse: [128, 640, 96, 128], coilPlate: [224, 640, 96, 48], map: [320, 640, 192, 128], scopeBezel: [512, 528, 96, 80], vent: [608, 528, 96, 64],
  crate: [704, 512, 128, 96], tapeLabel: [224, 688, 96, 24], flask: [512, 608, 32, 32],
};

/** a canvas view onto one rect of the sheet: draw in local coords */
class Sub {
  constructor(readonly pc: PixelCanvas, readonly r: Rect) {}
  get w() { return this.r[2]; } get h() { return this.r[3]; }
  ok(x: number, y: number) { return x >= 0 && y >= 0 && x < this.r[2] && y < this.r[3]; }
  set(x: number, y: number, c: number, a = 255) { x = Math.floor(x); y = Math.floor(y); if (this.ok(x, y)) this.pc.set(this.r[0] + x, this.r[1] + y, c, a); }
  get(x: number, y: number) { return this.pc.get(this.r[0] + x, this.r[1] + y); }
  blend(x: number, y: number, c: number, t: number) { x = Math.floor(x); y = Math.floor(y); if (this.ok(x, y)) this.pc.blend(this.r[0] + x, this.r[1] + y, c, t); }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
  stroke(x: number, y: number, w: number, h: number, c: number) { for (let i = 0; i < w; i++) { this.set(x + i, y, c); this.set(x + i, y + h - 1, c); } for (let j = 0; j < h; j++) { this.set(x, y + j, c); this.set(x + w - 1, y + j, c); } }
  bevel(x: number, y: number, w: number, h: number, lite: number, dark: number) { for (let i = 0; i < w; i++) { this.set(x + i, y, lite); this.set(x + i, y + h - 1, dark); } for (let j = 0; j < h; j++) { this.set(x, y + j, lite); this.set(x + w - 1, y + j, dark); } }
  circle(cx: number, cy: number, r: number, c: number, a = 255) { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.set(x, y, c, a); }
  ring(cx: number, cy: number, r0: number, r1: number, c: number, a = 255) { for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d >= r0 && d <= r1) this.set(x, y, c, a); } }
  line(x0: number, y0: number, x1: number, y1: number, c: number, t = 1, rough = 0, seed = 0) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) { if (rough && hashf(i, seed, 9) < rough) continue; const u = i / n; this.blend(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, c, t * (rough ? 0.65 + hashf(i, seed, 3) * 0.35 : 1)); }
  }
  /** pixel-font text through a temporary canvas (so chalk can be roughened) */
  text(s: string, x: number, y: number, c: number, scale = 1, opts: { center?: boolean; shadow?: number; chalk?: number; alpha?: number } = {}) {
    const w = textW(s, scale) + 2, h = 5 * scale + 2;
    const t = new PixelCanvas(w, h); t.wrap = false;
    text(t, s, 0, 0, 0xffffff, scale);
    const ox = opts.center ? Math.round(x - (w - 2) / 2) : x;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (!t.alpha(i, j)) continue;
      if (opts.shadow !== undefined) this.set(ox + i + 1, y + j + 1, opts.shadow);
      if (opts.chalk) { if (hashf(ox + i, y + j, 5) < opts.chalk * 0.25) continue; this.blend(ox + i, y + j, c, 0.7 + hashf(i, j, 3) * 0.3); }
      else if (opts.alpha !== undefined) this.set(ox + i, y + j, c, opts.alpha); else this.set(ox + i, y + j, c);
    }
    if (opts.shadow !== undefined) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (t.alpha(i, j)) this.set(ox + i, y + j, c, opts.alpha ?? 255);
    return ox + w;
  }
  fill(r: number[], fn: (x: number, y: number) => number) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, D(r, fn(x, y), this.r[0] + x, this.r[1] + y)); }
  /** enamelled steel panel ground with seams and screws */
  steel(base: number, seed: number, area: Rect = [0, 0, this.w, this.h]) {
    const M = ramp(base, 7, 0.4);
    const [ax, ay, aw, ah] = area;
    for (let y = ay; y < ay + ah; y++) for (let x = ax; x < ax + aw; x++) {
      const k = 3.6 + (tileFbm(this.r[0] + x, this.r[1] + y, SHEET, SHEET, 32, 3, seed) - 0.5) * 1.1 + (hashf(x, y, seed) - 0.5) * 0.5;
      this.set(x, y, D(M, k, this.r[0] + x, this.r[1] + y));
    }
    this.bevel(ax, ay, aw, ah, M[5], M[1]);
    for (const [sx, sy] of [[ax + 2, ay + 2], [ax + aw - 4, ay + 2], [ax + 2, ay + ah - 4], [ax + aw - 4, ay + ah - 4]]) { this.set(sx, sy, M[6]); this.set(sx + 1, sy, M[4]); this.set(sx, sy + 1, M[3]); this.set(sx + 1, sy + 1, M[0]); }
    return M;
  }
  lamp(cx: number, cy: number, r: number, c: number, on: boolean) {
    this.circle(cx, cy, r + 1, 0x18181a);
    this.circle(cx, cy, r, on ? c : scaleHex(c, 0.35), on ? LIT : 255);
    if (on) this.set(cx - r * 0.4, cy - r * 0.4, mixHex(c, 0xffffff, 0.7), LIT);
  }
  toggle(x: number, y: number, up: boolean) {
    this.rect(x - 2, y - 2, 5, 5, 0x3a3a3e); this.bevel(x - 2, y - 2, 5, 5, 0x6a6a70, 0x1a1a1c);
    this.circle(x + 0.5, y + 0.5, 1.2, 0xc8c8c8);
    for (let i = 1; i <= 4; i++) this.set(x, up ? y - i : y + i, i === 4 ? 0xe8e8e8 : 0xa8a8ac);
  }
  knob(cx: number, cy: number, r: number, a: number, col = 0x1e1c1a) {
    this.circle(cx, cy, r + 1, 0x0c0c0c); this.circle(cx, cy, r, col); this.circle(cx - r * 0.25, cy - r * 0.25, r * 0.55, mixHex(col, 0xffffff, 0.15));
    for (let t = 0; t < r; t += 0.5) this.set(cx + Math.cos(a) * t, cy + Math.sin(a) * t, 0xe8e0c8);
    for (let k = 0; k < 9; k++) { const b = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5; this.set(cx + Math.cos(b) * (r + 3), cy + Math.sin(b) * (r + 3), 0xe8e0c8); }
  }
  gauge(cx: number, cy: number, r: number, a: number) { gauge(this.pc, this.r[0] + cx, this.r[1] + cy, r, a); }
  plate(x: number, y: number, w: number, label: string, ink = 0x1a1814, bg = 0xd8d0b0) { this.rect(x, y, w, 9, bg); this.bevel(x, y, w, 9, mixHex(bg, 0xffffff, 0.4), scaleHex(bg, 0.6)); this.text(label, x + w / 2, y + 2, ink, 1, { center: true }); }
}

function chalkStroke(s: Sub, pts: [number, number][], c: number, seed: number) { for (let i = 0; i + 1 < pts.length; i++) s.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, 0.9, 0.12, seed + i); }

function paintBanner(s: Sub) {
  const navy = ramp(0x24325e, 7, 0.45), gold = 0xd8b050, goldD = 0x8a6a28, red = 0xb02a28, white = 0xece6d4;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const fold = Math.sin(x * 0.11) * 0.9 + Math.sin(x * 0.037 + 1) * 0.5;
    s.set(x, y, D(navy, 3.2 + fold + (hashf(x, y, 3) - 0.5) * 0.5 + ((x + y) % 3 === 0 ? 0.2 : 0), s.r[0] + x, s.r[1] + y));
  }
  // fringe: cut a zigzag hem, gold tassels
  const hem = s.h - 26;
  for (let y = hem; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const tri = Math.abs(((x % 24) - 12)) ; const cut = y - hem > 16 - tri * 1.3;
    if (y >= hem + 2 && cut) { const tass = x % 6 < 2 && y < s.h - 1; if (tass) s.set(x, y, (y & 1) ? gold : goldD); else s.set(x, y, 0, 0); }
  }
  for (let x = 0; x < s.w; x++) { s.set(x, hem, gold); s.set(x, hem + 1, goldD); }
  // border and top hem with grommets
  for (const [o, c] of [[4, gold], [5, goldD], [8, goldD]] as [number, number][]) { for (let x = o; x < s.w - o; x++) s.set(x, o, c); for (let y = o; y < hem - 2; y++) { s.set(o, y, c); s.set(s.w - 1 - o, y, c); } }
  for (let x = 0; x < s.w; x++) for (let y = 0; y < 4; y++) s.set(x, y, y === 3 ? navy[0] : navy[4]);
  for (let gx = 14; gx < s.w; gx += 41) { s.ring(gx, 2, 1, 2.5, 0xb8b8b0); s.set(gx, 2, 0x101018); }
  // emblem: gold ring, white star over a ringed planet
  const cx = s.w / 2, cy = 116;
  s.circle(cx, cy, 52, goldD); s.circle(cx, cy, 50, gold); s.circle(cx, cy, 46, navy[2]);
  for (let y = -46; y <= 46; y++) for (let x = -46; x <= 46; x++) {
    const d = Math.hypot(x, y);
    if (d > 45) continue;
    if (Math.hypot(x + 10, y - 10) < 26) s.set(cx + x, cy + y, mixHex(0x3a7a8a, 0x1a3a4a, (x + y + 40) / 90 + (hashf(x, y, 2) - 0.5) * 0.15));
    const e = (x * 0.92 + y * 0.4) / 44, f = (y - x * 0.38) / 10;
    if (Math.abs(e * e + f * f - 1) < 0.12 && d < 44) s.set(cx + x, cy + y, mixHex(white, gold, 0.4));
  }
  const star: [number, number][] = [];
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * TAU) / 10, r = k % 2 ? 13 : 32; star.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  poly(s.pc, star.map(([x, y]) => [x + s.r[0], y + s.r[1]] as [number, number]), white);
  s.text('U.S.', cx, 40, gold, 3, { center: true, shadow: navy[0] });
  s.text('PLANETARY', cx, 182, gold, 3, { center: true, shadow: navy[0] });
  s.text('CORPS', cx, 202, gold, 3, { center: true, shadow: navy[0] });
  for (let x = 16; x < s.w - 16; x++) { s.set(x, 225, gold); }
  s.text('FIELD LABORATORY', cx, 232, white, 2, { center: true });
  s.text('STATION FOUR', cx, 248, white, 2, { center: true });
  for (let y = 266; y < hem - 4; y++) for (let x = 12; x < s.w - 12; x++) s.set(x, y, ((y - 266) >> 2) & 1 ? white : red);
}

function paintChalkA(s: Sub) {
  const slate = ramp(0x2c3c34, 7, 0.36);
  s.fill(slate, (x, y) => 3.2 + (tileFbm(s.r[0] + x, s.r[1] + y, SHEET, SHEET, 48, 3, 4) - 0.5) * 1.4 + (Math.abs(Math.sin(x * 0.03 + y * 0.05)) < 0.15 ? 0.6 : 0));
  // eraser smears
  for (let k = 0; k < 7; k++) { const cx = hashf(k, 1, 3) * s.w, cy = hashf(k, 2, 3) * s.h; for (let a = 0; a < 140; a++) { const t = a / 140; s.blend(cx + Math.cos(t * 9 + k) * 30 * t, cy + Math.sin(t * 7) * 14, slate[5], 0.25); } }
  const W = 0xe8e6da, Y = 0xe8d878, P = 0xe8a0ac, B = 0xa8d0e8;
  s.text('GENOME SEQUENCE - UNIT 07 / SPECIMEN', 12, 10, W, 2, { chalk: 1 });
  for (let x = 12; x < 300; x++) if (hashf(x, 1, 4) > 0.15) s.blend(x, 23 + (x % 37 === 0 ? 1 : 0), W, 0.8);
  // double helix
  for (let y = 34; y < 236; y++) {
    const a = (y - 34) * 0.075, x1 = 46 + Math.sin(a) * 22, x2 = 46 - Math.sin(a) * 22;
    s.blend(x1, y, W, 0.85); s.blend(x1 + 1, y, W, 0.5); s.blend(x2, y, Y, 0.85); s.blend(x2 + 1, y, Y, 0.5);
    if ((y - 34) % 9 === 0) s.line(Math.min(x1, x2) + 2, y, Math.max(x1, x2) - 1, y, (y >> 3) % 3 === 0 ? P : B, 0.8, 0.15, y);
  }
  s.text('A-T', 74, 60, W, 1, { chalk: 1 }); s.text('G-C', 74, 96, W, 1, { chalk: 1 }); s.text('X-V ?', 74, 132, P, 1, { chalk: 1 });
  // equations
  const eq = ['DG = DH - T DS', 'F = Q(E + V x B)', 'L = H / MV', 'N(T) = N0 E^-KT', 'SPLICE: 2^N PERMS', 'MASS ~ L^3   LEG ~ L^2 !!'];
  eq.forEach((e, i) => s.text(e, 110, 40 + i * 18, i === 5 ? Y : W, 2, { chalk: 1 }));
  // creature sketch with labels
  const ox = 330, oy = 120;
  chalkStroke(s, [[ox, oy], [ox + 20, oy - 18], [ox + 80, oy - 22], [ox + 112, oy - 8], [ox + 130, oy - 26], [ox + 150, oy - 20], [ox + 154, oy - 4], [ox + 132, oy + 4], [ox + 112, oy + 10], [ox + 84, oy + 22], [ox + 30, oy + 22], [ox, oy]], W, 3);
  for (const lx of [ox + 18, ox + 36, ox + 84, ox + 102]) chalkStroke(s, [[lx, oy + 20], [lx + 4, oy + 46], [lx - 2, oy + 70], [lx + 6, oy + 72]], W, lx);
  chalkStroke(s, [[ox, oy], [ox - 30, oy - 6], [ox - 52, oy + 8]], W, 9);
  s.circle(ox + 140, oy - 14, 2, W);
  chalkStroke(s, [[ox + 60, oy + 70], [ox + 40, oy + 92]], P, 11); s.text('LEGS?', ox + 4, oy + 96, P, 2, { chalk: 1 });
  chalkStroke(s, [[ox - 40, oy + 4], [ox - 60, oy + 40]], Y, 13); s.text('TAIL', ox - 80, oy + 44, Y, 2, { chalk: 1 });
  chalkStroke(s, [[ox + 150, oy - 26], [ox + 160, oy - 60]], B, 15); s.text('HORN + EYES', ox + 100, oy - 76, B, 2, { chalk: 1 });
  s.text('VIABLE ?', 360, 222, Y, 2, { chalk: 1 });
  s.ring(388, 227, 26, 27.2, Y);
  // tally marks
  for (let i = 0; i < 12; i++) s.line(450 + i * 4 + (i % 5 === 4 ? -14 : 0), 30, 452 + i * 4 + (i % 5 === 4 ? 0 : 0), 44, W, 0.8, 0.1, i);
}
function paintChalkB(s: Sub) {
  const slate = ramp(0x2a362e, 7, 0.36);
  s.fill(slate, (x, y) => 3.1 + (tileFbm(s.r[0] + x, s.r[1] + y, SHEET, SHEET, 48, 3, 9) - 0.5) * 1.4);
  const W = 0xe8e6da, Y = 0xe8d878, P = 0xe8a0ac;
  s.text('PHENOTYPE TRIALS', 10, 8, W, 2, { chalk: 1 });
  const rows = ['HEXAPOD   OK', 'QUADRUPED OK', 'SERPENT   ?', 'GASTROPOD SLOW', 'SPLICE X-LIN  !'];
  rows.forEach((r, i) => s.text(`${i + 1}. ${r}`, 12, 32 + i * 14, i === 4 ? P : W, 1, { chalk: 1 }));
  // bar chart
  for (let i = 0; i < 6; i++) { const h = 10 + hashf(i, 3, 7) * 50; for (let y = 0; y < h; y++) for (let x = 0; x < 10; x++) if (x === 0 || x === 9 || y === 0 || (x + y) % 4 === 0) s.blend(140 + i * 18 + x, 150 - y, i === 3 ? Y : W, 0.75); }
  s.line(134, 151, 250, 151, W, 0.9, 0.1, 3); s.line(134, 151, 134, 92, W, 0.9, 0.1, 4);
  s.text('DAY 41', 12, 170, Y, 2, { chalk: 1 });
}

function paintConsoleA(s: Sub) {
  const M = s.steel(0x9aa08e, 3);
  ['VOLTS', 'AMPS', 'FIELD', 'FLUX'].forEach((l, i) => { const cx = 32 + i * 64; s.rect(cx - 15, 6, 30, 30, M[1]); s.gauge(cx, 21, 12, -0.9 + i * 0.6); s.text(l, cx, 39, 0x1a1814, 1, { center: true }); });
  for (let i = 0; i < 14; i++) s.toggle(14 + i * 17, 60, i % 3 !== 1);
  s.rect(6, 48, s.w - 12, 2, M[1]);
  for (let i = 0; i < 14; i++) s.lamp(14 + i * 17, 78, 2.2, [0xff5a3a, 0xffb040, 0x7aff7a][i % 3], hashf(i, 1, 2) > 0.4);
  s.plate(s.w - 66, 84, 60, 'BANK A');
  rust(s.pc, 12, 0.15, 6, [s.r[0], s.r[1], s.w, s.h]);
}
function paintConsoleB(s: Sub) {
  const M = s.steel(0x8e9a8a, 5);
  for (let i = 0; i < 2; i++) {
    const x = 10 + i * 70; s.rect(x, 8, 58, 34, 0x141210); s.rect(x + 2, 10, 54, 30, 0xe8b860, LIT);
    for (let k = 0; k < 9; k++) { const a = Math.PI * 1.15 + (k / 8) * Math.PI * 0.7; s.set(x + 29 + Math.cos(a) * 22, 40 + Math.sin(a) * 22, 0x3a2a14, LIT); }
    s.line(x + 29, 39, x + 29 + Math.cos(Math.PI * 1.4 + i * 0.3) * 24, 39 + Math.sin(Math.PI * 1.4 + i * 0.3) * 24, 0x1a1008); s.text('VU', x + 29, 30, 0x3a2a14, 1, { center: true, alpha: LIT });
  }
  const cols = [0xd84a3a, 0xe8b040, 0x5ad86a, 0x5aa8e8, 0xe8e8d8];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 6; i++) { const x = 158 + i * 15, y = 10 + j * 13, c = cols[(i + j) % 5], on = hashf(i, j, 5) > 0.55; s.rect(x, y, 11, 9, 0x101010); s.rect(x + 1, y + 1, 9, 7, on ? c : scaleHex(c, 0.45), on ? LIT : 255); s.set(x + 2, y + 2, mixHex(c, 0xffffff, 0.6), on ? LIT : 255); }
  for (let i = 0; i < 5; i++) s.knob(26 + i * 44, 70, 9, -2.2 + i * 0.9);
  s.plate(150, 52, 96, 'SEQUENCER CONTROL');
  void M;
}
function paintDesk(s: Sub) {
  const M = s.steel(0xb8b092, 7);
  s.rect(8, 8, 110, 50, M[1]); s.rect(10, 10, 106, 46, 0x203a24);
  for (let y = 0; y < 46; y += 2) for (let x = 0; x < 106; x++) if (hashf(x, y, 3) > 0.6) s.set(10 + x, 10 + y, 0x7aff7a, LIT);
  s.text('READY', 16, 14, 0xb8ffb8, 1, { alpha: LIT });
  for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) { const x = 130 + i * 14, y = 10 + j * 12; s.rect(x, y, 11, 9, 0x2a2826); s.bevel(x, y, 11, 9, 0x5a5652, 0x0a0a0a); s.set(x + 5, y + 4, j === 0 ? 0xe8b040 : 0xe8e0c8); }
  for (let i = 0; i < 4; i++) s.knob(24 + i * 30, 86, 8, -1.6 + i * 1.1);
  s.rect(140, 64, 100, 8, 0x0e0e0e); s.text('PUNCH CARD IN', 190, 76, 0x2a2620, 1, { center: true });
  for (let i = 0; i < 16; i++) s.lamp(140 + i * 6.4, 96, 1.6, i % 4 === 0 ? 0xff5a3a : 0x7aff7a, hashf(i, 9, 1) > 0.45);
  s.plate(150, 108, 90, 'GENE TRANSFER');
  void M;
}
function paintReelFace(s: Sub) {
  const M = s.steel(0x9aa4a8, 11);
  s.plate(8, 6, s.w - 16, 'MK-II SEQUENCER', 0xe8e0c8, 0x2a3a5a);
  for (const cy of [52, 112]) { s.circle(64, cy, 27, M[0]); s.circle(64, cy, 25, 0x16181a); for (let a = 0; a < 40; a++) s.set(64 + Math.cos(a / 40 * TAU) * 24, cy + Math.sin(a / 40 * TAU) * 24, 0x30343a); }
  for (const x of [20, 96]) { s.rect(x, 146, 12, 44, 0x101214); s.stroke(x - 1, 145, 14, 46, M[1]); for (let y = 0; y < 18; y++) s.set(x + 6 + Math.sin(y * 0.5) * 2, 150 + y * 2, 0x6a4a2a); }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) s.lamp(38 + i * 7, 152 + j * 9, 1.6, j % 2 ? 0xffb040 : 0xff5a3a, hashf(i, j, 7) > 0.5);
  for (let y = 200; y < 244; y += 3) s.rect(12, y, s.w - 24, 1, M[0]);
  s.rect(0, s.h - 8, s.w, 8, 0x2a2c30);
  s.text('U.S.P.C.', 64, 192, 0x1a1814, 1, { center: true });
}
function paintReelDisc(s: Sub) {
  const c = 32;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c), a = Math.atan2(y - c, x - c);
    if (d > 31) { s.set(x, y, 0, 0); continue; }
    let col = mixHex(0xc8ccd0, 0x8a9096, (Math.sin(a * 2) + 1) * 0.3 + hashf(x, y, 1) * 0.15);
    if (d < 25 && d > 9) col = mixHex(0x5a3a22, 0x3a2414, ((d * 3) % 2) * 0.3 + hashf(x, y, 2) * 0.2);
    const hole = d > 14 && d < 27 && Math.abs(((a / TAU) * 3 + 10) % 1 - 0.5) < 0.14;
    if (hole) col = d < 25 && d > 9 ? mixHex(0x5a3a22, 0x2a1a10, 0.4) : 0x141618;
    if (d < 5) col = 0xd8dce0; if (d < 2) col = 0x101010;
    if (d > 29.5) col = 0x6a7078;
    s.set(x, y, col);
  }
}
function paintSignHV(s: Sub) {
  const Y = ramp(0xe0b830, 6, 0.3);
  s.fill(Y, (x, y) => 3 + (hashf(x, y, 1) - 0.5) * 0.6);
  s.rect(0, 0, s.w, 26, 0xb82a24); s.rect(4, 4, s.w - 8, 18, 0x101010); s.rect(6, 6, s.w - 12, 14, 0xc82e28);
  s.text('DANGER', s.w / 2, 9, 0xf0ece0, 2, { center: true });
  const bolt: [number, number][] = [[70, 30], [52, 58], [64, 58], [50, 84], [80, 52], [66, 52], [80, 30]];
  poly(s.pc, bolt.map(([x, y]) => [s.r[0] + x - 8, s.r[1] + y] as [number, number]), 0x101010);
  s.text('HIGH', 16, 40, 0x101010, 2); s.text('VOLT', 86, 40, 0x101010, 2); s.text('AGE', 88, 54, 0x101010, 2);
  s.text('KEEP OUT', s.w / 2, 86, 0x101010, 1, { center: true });
  s.stroke(0, 0, s.w, s.h, 0x101010); s.stroke(1, 1, s.w - 2, s.h - 2, 0x101010);
  rust(s.pc, 3, 0.25, 4, [s.r[0], s.r[1], s.w, s.h]);
}
function trefoil(s: Sub, cx: number, cy: number, r: number, c: number, bio: boolean) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y), a = Math.atan2(y, x) + Math.PI / 2;
    if (bio) {
      let on = false;
      for (let k = 0; k < 3; k++) { const b = (k * TAU) / 3 - Math.PI / 2, ox = Math.cos(b) * r * 0.42, oy = Math.sin(b) * r * 0.42; const dd = Math.hypot(x - ox, y - oy), di = Math.hypot(x - Math.cos(b) * r * 0.52, y - Math.sin(b) * r * 0.52); if (dd < r * 0.5 && di > r * 0.34) on = true; }
      if (d < r * 0.2 && d > r * 0.11) on = true;
      if (Math.abs(d - r * 0.36) < r * 0.05) on = !on ? true : on;
      if (on) s.set(cx + x, cy + y, c);
    } else {
      const sec = ((a % (TAU / 3)) + TAU / 3) % (TAU / 3) < TAU / 6;
      if ((d < r && d > r * 0.3 && sec) || d < r * 0.18) s.set(cx + x, cy + y, c);
    }
  }
}
function paintSignBio(s: Sub) {
  s.rect(0, 0, s.w, s.h, 0xe8a030); s.stroke(2, 2, s.w - 4, s.h - 4, 0x101010);
  trefoil(s, 56, 46, 34, 0x101010, true);
  s.text('BIOHAZARD', 56, 92, 0x101010, 2, { center: true });
  rust(s.pc, 5, 0.2, 4, [s.r[0], s.r[1], s.w, s.h]);
}
function paintSignRad(s: Sub) {
  s.rect(0, 0, s.w, s.h, 0xe8d040); s.stroke(2, 2, s.w - 4, s.h - 4, 0x7a2a7a);
  trefoil(s, 56, 44, 30, 0x8a2a8a, false);
  s.text('CAUTION', 56, 82, 0x8a2a8a, 2, { center: true }); s.text('RADIATION AREA', 56, 98, 0x101010, 1, { center: true });
}
function paintSignNo(s: Sub) { s.rect(0, 0, s.w, s.h, 0xece6d8); s.stroke(1, 1, s.w - 2, s.h - 2, 0xb82a24); s.text('NO SMOKING', s.w / 2, 12, 0xb82a24, 2, { center: true }); s.text('OXYGEN IN USE', s.w / 2, 32, 0x2a2620, 1, { center: true }); }
function paintSignAuth(s: Sub) { s.rect(0, 0, s.w, s.h, 0xece6d8); s.rect(0, 0, s.w, 14, 0x2a4a8a); s.text('NOTICE', s.w / 2, 4, 0xece6d8, 1, { center: true }); s.text('AUTHORIZED PERSONNEL ONLY', s.w / 2, 22, 0x101010, 1, { center: true }); }
function paintPlaque(s: Sub) {
  const B = ramp(0xb48c42, 7, 0.5);
  s.fill(B, (x, y) => 3.5 + Math.sin(y * 0.5) * 0.4 + (hashf(x, y, 3) - 0.5) * 0.7);
  s.bevel(0, 0, s.w, s.h, B[6], B[0]); s.bevel(2, 2, s.w - 4, s.h - 4, B[1], B[5]);
  s.text('SPECIMEN TANK NO.1', s.w / 2, 9, 0x2a1a0a, 1, { center: true }); s.text('DO NOT TAP THE GLASS', s.w / 2, 24, 0x2a1a0a, 1, { center: true });
  rivet(s.pc, s.r[0] + 4, s.r[1] + 4, B[6], B[0]); rivet(s.pc, s.r[0] + s.w - 6, s.r[1] + 4, B[6], B[0]);
}
function paintClock(s: Sub) {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32); s.set(x, y, d > 31 ? 0 : d > 28 ? 0x2a2a2c : 0xf0ece0, d > 31 ? 0 : 255); }
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; for (let t = 22; t < 26; t++) s.set(32 + Math.cos(a) * t, 32 + Math.sin(a) * t, 0x101010); }
  s.line(32, 32, 32 + Math.cos(-2.1) * 14, 32 + Math.sin(-2.1) * 14, 0x101010); s.line(33, 32, 33 + Math.cos(-1.05) * 20, 32 + Math.sin(-1.05) * 20, 0x101010);
  s.line(32, 32, 32 + Math.cos(1.2) * 22, 32 + Math.sin(1.2) * 22, 0xb82a24); s.text('USPC', 32, 40, 0x6a6660, 1, { center: true });
}
function paintCalendar(s: Sub) {
  s.rect(0, 0, s.w, s.h, 0xece8dc); s.rect(0, 0, s.w, 22, 0xb82a24);
  s.text('NOV', s.w / 2, 4, 0xece8dc, 2, { center: true }); s.text('1958', s.w / 2, 26, 0x101010, 1, { center: true });
  for (let i = 0; i < 30; i++) { const x = 4 + (i % 7) * 8, y = 36 + Math.floor(i / 7) * 10; s.text(String(i + 1), x, y, 0x3a3a3a); if (i < 8) { s.line(x - 1, y - 1, x + 6, y + 6, 0xb82a24); s.line(x + 6, y - 1, x - 1, y + 6, 0xb82a24); } }
}
function paintPoster1(s: Sub) {
  s.rect(0, 0, s.w, s.h, 0xe4dcc4);
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (hashf(x, y, 4) > 0.93) s.blend(x, y, 0xb8a888, 0.5);
  s.text('XENO-ANATOMY', s.w / 2, 6, 0x2a2018, 2, { center: true }); s.text('PLATE IV', s.w / 2, 20, 0x8a2a1a, 1, { center: true });
  // a cut-away beast: body ellipse, ribs, organs
  for (let y = -26; y <= 26; y++) for (let x = -48; x <= 48; x++) { const e = (x / 48) ** 2 + (y / 26) ** 2; if (e < 1) s.set(64 + x, 80 + y, e > 0.86 ? 0x5a3a2a : mixHex(0xd8a890, 0xb87a6a, e)); }
  for (let i = 0; i < 7; i++) s.line(30 + i * 10, 58, 34 + i * 10, 102, 0xf0e8d8);
  s.circle(50, 78, 9, 0xb82a2a); s.circle(76, 84, 11, 0x8a6a2a); s.circle(92, 74, 6, 0x5a8a5a);
  for (let i = 0; i < 4; i++) { const lx = 30 + i * 22; s.rect(lx, 104, 6, 28, 0x5a3a2a); }
  s.circle(118, 70, 10, 0x5a3a2a); s.set(122, 67, 0xffffff);
  [['COR', 50, 78], ['VISC', 76, 84], ['GLND', 92, 74]].forEach(([l, x, y], i) => { s.line(x as number, y as number, 14 + i * 40, 146, 0x2a2018); s.text(l as string, 14 + i * 40, 148, 0x2a2018); });
  scribble(s.pc, s.r[0] + 10, s.r[1] + 160, 108, 0x6a6050, 3, 3, 4);
}
function paintPoster2(s: Sub) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) s.set(x, y, mixHex(0x1e2a4a, 0x8a3a3a, Math.max(0, (y - 40) / 160) + (bayer(x, y) - 0.5) * 0.08));
  for (let i = 0; i < 40; i++) s.set(hashf(i, 1, 1) * s.w, hashf(i, 2, 1) * 100, 0xf0f0e0);
  s.circle(96, 132, 30, 0xd8a050); s.circle(88, 124, 22, 0xe8c070);
  poly(s.pc, [[46, 30], [56, 60], [56, 120], [36, 120], [36, 60]].map(([x, y]) => [s.r[0] + x, s.r[1] + y] as [number, number]), 0xe8e4d8);
  poly(s.pc, [[36, 104], [24, 128], [36, 120]].map(([x, y]) => [s.r[0] + x, s.r[1] + y] as [number, number]), 0xb82a24);
  poly(s.pc, [[56, 104], [68, 128], [56, 120]].map(([x, y]) => [s.r[0] + x, s.r[1] + y] as [number, number]), 0xb82a24);
  for (let y = 122; y < 150; y++) for (let x = 38; x < 54; x++) if (hashf(x, y, 3) > (y - 122) / 28) s.set(x, y, y < 132 ? 0xffe070 : 0xff8a30, LIT);
  s.circle(46, 70, 4, 0x3a7aa8);
  s.text('REACH FOR', s.w / 2, 6, 0xf0e4c0, 2, { center: true }); s.text('NEW WORLDS', s.w / 2, 20, 0xffd060, 2, { center: true });
  s.rect(0, s.h - 22, s.w, 22, 0xe8e0c8); s.text('JOIN THE', s.w / 2, s.h - 19, 0x1e2a4a, 1, { center: true }); s.text('PLANETARY CORPS', s.w / 2, s.h - 11, 0xb82a24, 1, { center: true });
}
function paintCentTop(s: Sub) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const d = Math.hypot(x + 0.5 - 64, y + 0.5 - 64), a = Math.atan2(y - 64, x - 64);
    s.set(x, y, mixHex(0xb8bcc0, 0x6a7076, (Math.sin(a * 6) + 1) * 0.2 + (d % 9 < 1 ? 0.4 : 0) + hashf(x, y, 1) * 0.12));
  }
  s.circle(64, 64, 14, 0x3a3e44); s.circle(64, 64, 8, 0xb8bcc0); s.circle(64, 64, 3, 0x101010);
  s.rect(24, 92, 80, 18, 0xe8c030); s.stroke(24, 92, 80, 18, 0x101010); s.text('DO NOT OPEN', 64, 95, 0x101010, 1, { center: true }); s.text('WHILE SPINNING', 64, 103, 0x101010, 1, { center: true });
}
function paintHazard(s: Sub) { stripes(s.pc, s.r[0], s.r[1], s.w, s.h, 0xe0b830, 0x18181a, 16, 1); rust(s.pc, 9, 0.2, 4, [s.r[0], s.r[1], s.w, s.h]); }
function paintBlinken(s: Sub) { s.rect(0, 0, s.w, s.h, 0x1a1c1e); for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) s.lamp(4 + i * 8, 4 + j * 8, 1.8, [0xff5a3a, 0xffb040, 0x7aff7a, 0x7ac8ff][j], hashf(i, j, 3) > 0.45); }
function paintLabelJar(s: Sub) { s.rect(0, 0, s.w, s.h, 0xe8e0c4); s.stroke(1, 1, s.w - 2, s.h - 2, 0x8a7a5a); s.text('SPEC.', 4, 4, 0x2a2018); scribble(s.pc, s.r[0] + 4, s.r[1] + 12, 54, 0x4a4030, 7, 2, 4); }
function paintGaugeBig(s: Sub) {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32); s.set(x, y, d > 31 ? 0 : d > 28 ? 0xb48c42 : d > 26 ? 0x5a4a2a : 0xece6d4, d > 31 ? 0 : 255); }
  for (let k = 0; k <= 20; k++) { const a = Math.PI * 0.75 + (k / 20) * Math.PI * 1.5, r0 = k % 5 ? 21 : 18; for (let t = r0; t < 24; t++) s.set(32 + Math.cos(a) * t, 32 + Math.sin(a) * t, k > 15 ? 0xb82a24 : 0x2a2620); }
  s.text('PSI', 32, 40, 0x2a2620, 1, { center: true }); s.line(32, 32, 32 + Math.cos(-0.4) * 20, 32 + Math.sin(-0.4) * 20, 0x101010); s.circle(32, 32, 2, 0xb82a24);
}
function paintKeys(s: Sub) {
  s.rect(0, 0, s.w, s.h, 0x3a3e3a);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 12 - (j === 3 ? 4 : 0); i++) { const x = 6 + i * 10 + j * 3, y = 4 + j * 11; s.circle(x + 3, y + 3, 4, 0x101010); s.circle(x + 3, y + 3, 3, 0xe8e0c8); s.set(x + 2, y + 2, 0xffffff); s.set(x + 3, y + 3, 0x2a2620); }
  s.rect(40, 40, 50, 6, 0xe8e0c8);
}
function paintDoor(s: Sub) {
  const M = s.steel(0x5a6448, 21);
  s.bevel(6, 6, s.w - 12, s.h - 12, M[5], M[0]);
  s.circle(64, 70, 26, M[0]); s.circle(64, 70, 24, 0xb48c42); s.circle(64, 70, 20, 0x1a2a2a);
  for (let y = -20; y < 20; y++) for (let x = -20; x < 20; x++) if (Math.hypot(x, y) < 20 && x + y < -14 && x + y > -20) s.set(64 + x, 70 + y, 0x8ab8b8);
  s.rect(96, 128, 22, 8, 0xb8bcc0); s.bevel(96, 128, 22, 8, 0xe8e8e8, 0x5a5e62);
  s.plate(30, 150, 68, 'LAB 4');
  s.rect(0, s.h - 30, s.w, 30, M[1]); stripes(s.pc, s.r[0] + 6, s.r[1] + s.h - 26, s.w - 12, 20, 0xe0b830, 0x18181a, 12, 1);
  rust(s.pc, 31, 0.3, 5, [s.r[0], s.r[1], s.w, s.h]);
}
function paintGrate(s: Sub) { const M = ramp(0x4a4e52, 6, 0.4); s.fill(M, (x, y) => 3 + (hashf(x, y, 1) - 0.5)); for (let y = 6; y < s.h - 6; y += 8) s.rect(8, y, s.w - 16, 4, 0x08090a); s.bevel(0, 0, s.w, s.h, M[5], M[0]); }
function paintFuse(s: Sub) {
  const M = s.steel(0x7a8478, 13);
  for (let j = 0; j < 6; j++) for (let i = 0; i < 2; i++) { const x = 12 + i * 40, y = 12 + j * 16; s.rect(x, y, 30, 10, 0x1a1a1a); s.rect(x + 2 + (j % 3 === 1 && i ? 18 : 0), y + 2, 8, 6, 0xd8d0b8); scribble(s.pc, s.r[0] + x, s.r[1] + y + 12, 30, 0x2a2620, 4 + j, 1); }
  s.rect(66, 112, 20, 12, 0xb82a24); s.text('MAIN', 48, 114, 0x101010);
  void M;
}
function paintCoilPlate(s: Sub) { s.rect(0, 0, s.w, s.h, 0x2a3a5a); s.bevel(0, 0, s.w, s.h, 0x5a6a8a, 0x101828); s.text('FIELD EMITTER', s.w / 2, 8, 0xe8e0c8, 1, { center: true }); s.text('500 KV', s.w / 2, 20, 0xffd060, 2, { center: true }); s.text('U.S.P.C.', s.w / 2, 36, 0xe8e0c8, 1, { center: true }); }
function paintMap(s: Sub) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const n = tileFbm(x, y, 192, 128, 5, 4, 77);
    s.set(x, y, n > 0.55 ? mixHex(0xc8b888, 0x8a9a5a, (n - 0.55) * 3) : mixHex(0x9ab8c0, 0x6a8aa0, (0.55 - n) * 2));
    if (x % 24 === 0 || y % 24 === 0) s.blend(x, y, 0x2a3a4a, 0.4);
  }
  for (let i = 0; i < 6; i++) { const x = 20 + hashf(i, 1, 4) * 150, y = 16 + hashf(i, 2, 4) * 96; s.circle(x, y, 2.5, i === 0 ? 0xb82a24 : 0x2a5ac8); s.set(x, y - 4, 0x101010); }
  s.stroke(0, 0, s.w, s.h, 0x2a2620); s.text('SURVEY REGION 4', 6, 4, 0x2a2018);
}
function paintScopeBezel(s: Sub) {
  const M = s.steel(0x3a3e44, 17);
  s.rect(8, 6, 80, 56, 0x0a0c0a);
  for (let i = 0; i < 3; i++) s.knob(20 + i * 28, 70, 5, -1 + i);
  void M;
}
function paintVent(s: Sub) { const M = ramp(0x8a9088, 6, 0.4); s.fill(M, (x, y) => 3 + (hashf(x, y, 2) - 0.5) * 0.6); for (let y = 6; y < s.h - 6; y += 5) { s.rect(6, y, s.w - 12, 3, 0x141614); s.rect(6, y + 3, s.w - 12, 1, M[5]); } s.bevel(0, 0, s.w, s.h, M[5], M[0]); }
function paintCrate(s: Sub) {
  const W = makeRamp(0x9a7a4a, 7, { spread: 0.45 });
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) s.set(x, y, D(W, 3.4 + Math.sin(x * 0.4 + hashf(0, y >> 4, 2) * 9) * 0.4 + (hashf(x, y, 1) - 0.5) * 0.6 - ((y & 15) === 0 ? 2 : 0), s.r[0] + x, s.r[1] + y));
  s.stroke(0, 0, s.w, s.h, W[0]); s.line(0, 0, s.w, s.h, W[1]);
  s.text('U.S.P.C.', s.w / 2, 30, 0x2a1a0a, 3, { center: true }); s.text('FRAGILE', s.w / 2, 56, 0x8a2a1a, 2, { center: true }); s.text('SPECIMEN GLASS', s.w / 2, 74, 0x2a1a0a, 1, { center: true });
}
function paintTapeLabel(s: Sub) { s.rect(0, 0, s.w, s.h, 0xe8e0c8); s.text('REEL 07 GENOME', 4, 4, 0x2a2018); scribble(s.pc, s.r[0] + 4, s.r[1] + 14, 88, 0x4a4030, 2, 1); }
function paintFlask(s: Sub) { for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) s.set(x, y, mixHex(0x7affb0, 0xffffff, hashf(x, y, 1) * 0.3), LIT); }

export interface LabTex {
  floor: THREE.DataTexture; tile: THREE.DataTexture; plaster: THREE.DataTexture; concrete: THREE.DataTexture;
  olive: THREE.DataTexture; cream: THREE.DataTexture; gun: THREE.DataTexture; navy: THREE.DataTexture; red: THREE.DataTexture; haz: THREE.DataTexture;
  brass: THREE.DataTexture; copper: THREE.DataTexture; rubber: THREE.DataTexture; oak: THREE.DataTexture; porcelain: THREE.DataTexture;
  bulb: THREE.DataTexture; bulbCyan: THREE.DataTexture; decal: THREE.DataTexture;
}
let CACHE: LabTex | null = null;
/** every lab texture (painted once, kept for the session) */
export function labTextures(): LabTex {
  if (CACHE) return CACHE;
  const sheet = new PixelCanvas(SHEET, SHEET); sheet.wrap = false;
  sheet.fill(0x808080);
  const P: Record<string, (s: Sub) => void> = {
    banner: paintBanner, chalkA: paintChalkA, chalkB: paintChalkB, consoleA: paintConsoleA, consoleB: paintConsoleB, desk: paintDesk, reelFace: paintReelFace, reelDisc: paintReelDisc,
    signHV: paintSignHV, signBio: paintSignBio, signRad: paintSignRad, signNo: paintSignNo, signAuth: paintSignAuth, plaque: paintPlaque, clock: paintClock, calendar: paintCalendar,
    poster1: paintPoster1, poster2: paintPoster2, centTop: paintCentTop, hazard: paintHazard, blinken: paintBlinken, labelJar: paintLabelJar, gaugeBig: paintGaugeBig, keys: paintKeys,
    door: paintDoor, grate: paintGrate, fuse: paintFuse, coilPlate: paintCoilPlate, map: paintMap, scopeBezel: paintScopeBezel, vent: paintVent, crate: paintCrate, tapeLabel: paintTapeLabel, flask: paintFlask,
  };
  for (const [k, f] of Object.entries(P)) { try { f(new Sub(sheet, DEC[k])); } catch (e) { console.error('lab decal', k, e); } }
  CACHE = {
    floor: floor(), tile: wallTile(), plaster: plaster(), concrete: concrete(),
    olive: paintMetal(0x5a6448), cream: paintMetal(0xbab092), gun: paintMetal(0x4c535a), navy: paintMetal(0x2e3c58), red: paintMetal(0x8a2c24), haz: paintMetal(0x5a5a5a, true),
    brass: brass(), copper: windings(), rubber: rubber(), oak: oak(), porcelain: porcelain(), bulb: bulb(0xffd890), bulbCyan: bulb(0x7affe0), decal: tex(sheet, false),
  };
  return CACHE;
}
/** uv corners of a decal rect (flipY = false: sheet row 0 is v = 0) as [u0, vTop, u1, vBottom] */
export function decUV(name: string, inset = 0): [number, number, number, number] {
  const [x, y, w, h] = DEC[name];
  return [(x + inset) / SHEET, (y + inset) / SHEET, (x + w - inset) / SHEET, (y + h - inset) / SHEET];
}
void glow;
