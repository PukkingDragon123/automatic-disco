// Hand-pixelled textures for the ship hub, in LIMBOPHOBIA's house style (src/limbo/gfx/pixel.ts and
// content/textures): every surface is pixel art drawn texel by texel from short hue-shifted ramps (makeRamp:
// cool shadows, warm lights), soft clustered variation quantised into 3-5 tone bands, then deliberate structure
// (panel seams with a dark groove and a lit lip, screw heads, rails, kick plates) and sparse hand-placed wear
// (chipped edges, boot scuffs, grime gathered at the floor, drips under fixings, stencils). Walls and floors are
// drawn at 64 texels per metre; furniture reuses LIMBOPHOBIA's own material textures (wood, painted and bare
// metal, plastics, fabrics, leather, rubber) lifted out of its atlas, so the ship and the reference game share
// one look. Everything is shown with nearest filtering.
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex, ph } from '../../limbo/gfx/pixel';
import { nz, q } from '../../limbo/content/textures/kit';
import { atlas } from '../../limbo/gfx/atlas';
import { registerAllTextures } from '../../limbo/gfx/textures/index';
import '../../limbo/content/textures/materials';
import { Pix, text as text3 } from '../../ui/machine';
import { Rng, hashStr } from '../../limbo/core/rng';

export const PPM = 64;
const cache = new Map<string, THREE.Texture>();
export function pcached(key: string, make: () => THREE.Texture) { let t = cache.get(key); if (!t) { t = make(); cache.set(key, t); } return t; }

/** an RGBA buffer painted with row 0 at the top -> a repeating, nearest-filtered texture (mips for distance) */
export function texOf(data: Uint8ClampedArray | Uint8Array, w: number, h: number, o: { repeat?: boolean; mips?: boolean } = {}) {
  const flipped = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) flipped.set(data.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const t = new THREE.DataTexture(flipped, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  t.minFilter = o.mips === false ? THREE.NearestFilter : THREE.NearestMipmapLinearFilter; t.generateMipmaps = o.mips !== false;
  if (o.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
const T = (pc: PixelCanvas, o?: { repeat?: boolean; mips?: boolean }) => texOf(pc.data, pc.w, pc.h, o);

// ------------------------------------------------------------------ LIMBOPHOBIA's materials, lifted out of its atlas
/** a LIMBOPHOBIA atlas texture as a stand-alone repeating texture, and the metres one repeat covers */
export function limbo(name: string): { tex: THREE.Texture; mw: number; mh: number } {
  registerAllTextures();
  const A = atlas(); A.flush();
  const r = A.get(name); A.flush();
  const key = 'limbo|' + name;
  let t = cache.get(key);
  if (!t) {
    const S = A.size, out = new Uint8ClampedArray(r.w * r.h * 4);
    for (let j = 0; j < r.h; j++) out.set(A.data.subarray(((r.y + j) * S + r.x) * 4, ((r.y + j) * S + r.x + r.w) * 4), j * r.w * 4);
    // the atlas stores rows top-down with v0 at the top row and flipY off: rows are already in texture order
    const tt = new THREE.DataTexture(new Uint8Array(out), r.w, r.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    tt.colorSpace = THREE.SRGBColorSpace; tt.magFilter = THREE.NearestFilter; tt.minFilter = THREE.NearestMipmapLinearFilter; tt.generateMipmaps = true;
    tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.needsUpdate = true;
    cache.set(key, (t = tt));
  }
  return { tex: t, mw: r.mw, mh: r.mh };
}

// ------------------------------------------------------------------ drawing helpers
type R = number[];
/** a recessed seam across x (row y): a dark groove, a lit lip under it (light from above) */
function seamH(pc: PixelCanvas, x0: number, x1: number, y: number, Rr: R) { for (let x = x0; x <= x1; x++) { pc.set(x, y, Rr[0]); pc.set(x, y + 1, Rr[Rr.length - 1]); pc.set(x, y - 1, Rr[1]); } }
function seamV(pc: PixelCanvas, x: number, y0: number, y1: number, Rr: R) { for (let y = y0; y <= y1; y++) { pc.set(x, y, Rr[0]); pc.set(x + 1, y, Rr[Rr.length - 2]); pc.set(x - 1, y, Rr[1]); } }
/** a 3x3 screw head: dark ring, lit top-left, slot */
function screw(pc: PixelCanvas, x: number, y: number, Rr: R, slot = 0) {
  const n = Rr.length;
  pc.set(x, y - 1, Rr[n - 2]); pc.set(x - 1, y, Rr[n - 2]); pc.set(x, y, Rr[n - 1]); pc.set(x + 1, y, Rr[1]); pc.set(x, y + 1, Rr[0]); pc.set(x + 1, y + 1, Rr[0]);
  pc.set(x - 1, y - 1, Rr[2]); pc.set(x + 1, y - 1, Rr[2]); pc.set(x - 1, y + 1, Rr[1]);
  if (slot) pc.set(x + (slot > 0 ? 1 : -1), y + (slot > 0 ? -1 : -1), Rr[1]);
}
/** a chip: a small cluster of bare paint at an edge, with a dark lower rim */
function chip(pc: PixelCanvas, x: number, y: number, lit: number, dark: number, s: number) {
  const w = 1 + Math.floor(s * 3), h = 1 + Math.floor((s * 7) % 2);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pc.set(x + i, y + j, lit);
  for (let i = 0; i < w; i++) pc.set(x + i, y + h, dark);
}
/** a short drip of grime below a point */
function drip(pc: PixelCanvas, x: number, y: number, len: number, f = 0.88) { for (let k = 0; k < len; k++) pc.shade(x, y + k, f + (k / len) * (1 - f)); }
/** pixel text from the machine's 3x5 face, painted into a PixelCanvas */
function txt(pc: PixelCanvas, s: string, x: number, y: number, c: number) {
  const W = s.length * 4 + 2, p = new Pix(W, 7);
  text3(p, s, 1, 1, 0xffffff);
  for (let j = 0; j < 7; j++) for (let i = 0; i < W; i++) if (p.d[(j * W + i) * 4 + 3] > 128) pc.set(x + i - 1, y + j - 1, c);
}
/** crisp pixel text from a pixel font (thresholded canvas text) as an alpha mask callback */
function fontText(s: string, font: string, size: number, fn: (x: number, y: number) => void) {
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  g.font = `${size}px ${font}`; const w = Math.ceil(g.measureText(s).width) + 4, h = Math.ceil(size * 1.3) + 2;
  c.width = w; c.height = h; g.font = `${size}px ${font}`; g.fillStyle = '#fff'; g.textBaseline = 'top'; g.fillText(s, 2, 1);
  const d = g.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 110) fn(x, y);
  return { w, h };
}
export function measure(s: string, font: string, size: number) { const g = document.createElement('canvas').getContext('2d')!; g.font = `${size}px ${font}`; return { w: Math.ceil(g.measureText(s).width) + 4, h: Math.ceil(size * 1.3) + 2 }; }

// ------------------------------------------------------------------ themes (base colours; ramps derive from them)
export interface PTheme { key: string; wall: number; low: number; band: number; rail: number; stripe: number; trim: number; floor: 'tread' | 'rubber' | 'carpet' | 'tiles' | 'deck' | 'grate' | 'lino'; fa: number; fb: number }
export const PTHEMES: Record<string, PTheme> = {
  bridge: { key: 'bridge', wall: 0x4a5866, low: 0x323c46, band: 0x1e242c, rail: 0x5c6a76, stripe: 0x58b4c8, trim: 0x505a62, floor: 'deck', fa: 0x343a42, fb: 0x454c55 },
  lab: { key: 'lab', wall: 0xd2d4c8, low: 0x8a9c94, band: 0x46524e, rail: 0x6e7e78, stripe: 0x4aa678, trim: 0x8c9690, floor: 'rubber', fa: 0x56645e, fb: 0x6c7a73 },
  medbay: { key: 'medbay', wall: 0xdcdcd2, low: 0x98aeac, band: 0x50605e, rail: 0x7a8c8a, stripe: 0xc0463a, trim: 0x9aa6a2, floor: 'lino', fa: 0xa2aea8, fb: 0xbcc6c0 },
  core: { key: 'core', wall: 0x2c3432, low: 0x1e2422, band: 0x121614, rail: 0x3e4a44, stripe: 0x5ec67e, trim: 0x3c4642, floor: 'grate', fa: 0x2a302e, fb: 0x404846 },
  quarters: { key: 'quarters', wall: 0xbca88a, low: 0x806a50, band: 0x483a2c, rail: 0x604a36, stripe: 0xb07a3a, trim: 0x6e604c, floor: 'carpet', fa: 0x6a4434, fb: 0x7e5642 },
  mess: { key: 'mess', wall: 0xcabc9c, low: 0x8e5a38, band: 0x4c3a2a, rail: 0x6e4a32, stripe: 0xd27a36, trim: 0x7e7460, floor: 'tiles', fa: 0x9c9682, fb: 0x3e4644 },
  workshop: { key: 'workshop', wall: 0x6e7050, low: 0x4e5038, band: 0x2a2c20, rail: 0x3c3e2c, stripe: 0xd4a43a, trim: 0x56584a, floor: 'tread', fa: 0x5c6062, fb: 0x7e8284 },
  cargo: { key: 'cargo', wall: 0x606852, low: 0x444c3c, band: 0x242820, rail: 0x363c2e, stripe: 0xd4a43a, trim: 0x4e5446, floor: 'tread', fa: 0x4e5454, fb: 0x6c7070 },
  engineering: { key: 'engineering', wall: 0x4c5054, low: 0x36393c, band: 0x1a1c1e, rail: 0x2c2e30, stripe: 0xda7a2c, trim: 0x484c4e, floor: 'grate', fa: 0x3c4042, fb: 0x585c5e },
  corridor: { key: 'corridor', wall: 0x8e948a, low: 0x5e6662, band: 0x2e3432, rail: 0x4a524e, stripe: 0x58b4c8, trim: 0x5e6664, floor: 'deck', fa: 0x3e4446, fb: 0x50585a },
};

// ------------------------------------------------------------------ walls (2 m wide, 3.4 m tall)
export const WALL_PX = { w: 128, h: 218 };
export function pixWall(th: PTheme, variant = 0) {
  return pcached(`pw|${th.key}|${variant}`, () => {
    const W = WALL_PX.w, H = WALL_PX.h, pc = new PixelCanvas(W, H), rng = new Rng(hashStr(th.key) + variant * 911);
    const Y = (m: number) => Math.round(H - m * PPM);
    const RW = makeRamp(th.wall, 6, { spread: 0.42 }), RL = makeRamp(th.low, 6, { spread: 0.45 }), RB = makeRamp(th.band, 5, { spread: 0.5 }), RR = makeRamp(th.rail, 5, { spread: 0.55 }), RT = makeRamp(th.trim, 5, { spread: 0.5 });
    const seed = hashStr(th.key) % 997;
    // the upper field: two or three calm tones in soft clusters, a touch lighter toward the top (lamps above)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = 0.52 + (nz(pc, x, y, 4, 7, 2, seed) - 0.5) * 0.55 + (1 - y / H) * 0.08;
      pc.set(x, y, q(RW.slice(1, 5), v, x, y, 0.35));
    }
    const top = Y(2.8), bot = Y(1.06);
    // the top band: a recess, the cable tray lip, conduit clamps
    for (let y = 0; y < top; y++) for (let x = 0; x < W; x++) pc.set(x, y, q(RB.slice(0, 3), 0.5 + (nz(pc, x, y, 6, 3, 1, seed + 3) - 0.5) * 0.6, x, y, 0.4));
    for (let x = 0; x < W; x++) { pc.set(x, top - 2, RB[4]); pc.set(x, top - 1, RB[3]); pc.set(x, top, RW[0]); pc.set(x, top + 1, RW[1]); }
    for (let x = 6; x < W; x += 21) for (let k = 0; k < 9; k++) { pc.set(x + k, Y(3.18), RB[4]); pc.set(x + k, Y(3.18) + 1, RB[2]); pc.set(x + k, Y(3.18) + 2, RB[0]); }
    for (let x = 0; x < W; x++) { pc.set(x, Y(3.05), RB[3]); pc.set(x, Y(3.05) + 1, RB[2]); }
    // panels: two per tile, seams, screws, a mid seam, wear
    for (let i = 0; i < 2; i++) {
      const x0 = i * 64, x1 = x0 + 63;
      seamV(pc, x0, top + 2, bot - 1, RW);
      const ys = Y(1.92) + (variant + i) % 2;
      seamH(pc, x0 + 2, x1, ys, RW);
      for (let x = x0 + 2; x < x1; x++) { pc.set(x, top + 2, RW[4]); }
      for (const yy of [top + 5, ys - 4, ys + 5, bot - 5]) for (const xx of [x0 + 5, x1 - 4]) screw(pc, xx, yy, RW, (xx + yy) % 2 ? 1 : -1);
      // drips under the lower screws and grime pooling above the rail
      for (const xx of [x0 + 5, x1 - 4]) if (ph(xx, variant, 3) < 0.7) drip(pc, xx, ys + 7, 5 + Math.floor(ph(xx, 1, variant) * 12));
      for (let x = x0 + 2; x < x1; x++) if (ph(x, 9, variant) < 0.5) pc.shade(x, bot - 2, 0.9);
      // chips on the panel edges near the corners
      for (let k = 0; k < 5; k++) { const e = rng.next(); chip(pc, x0 + 2 + Math.floor(rng.next() * 60), (k % 2 ? ys + 2 : top + 3), RW[5], RW[1], e); }
      // one panel in two carries a detail: a label plate, a louvred vent, or an access hatch
      const k = (i + variant) % 3;
      if (k === 0) {
        const lx = x0 + 12, ly = ys - 30, lw = 34, lh = 12;
        const RP = makeRamp(mixHex(th.wall, 0xe8e2cc, 0.6), 4, { spread: 0.35 });
        pc.rect(lx - 1, ly - 1, lw + 2, lh + 2, RW[0]); pc.rect(lx, ly, lw, lh, RP[2]); pc.hline(lx, lx + lw - 1, ly, RP[3]); pc.hline(lx, lx + lw - 1, ly + lh - 1, RP[1]);
        txt(pc, `${th.key.slice(0, 2).toUpperCase()}-${10 + ((variant * 7 + i * 3) % 80)}`, lx + 3, ly + 4, RW[0]);
        screw(pc, lx + lw - 3, ly + 3, RP); screw(pc, lx + lw - 3, ly + lh - 4, RP);
      } else if (k === 1) {
        const vx = x0 + 14, vy = ys + 14, vw = 36, vh = 22;
        pc.rect(vx - 1, vy - 1, vw + 2, vh + 2, RW[0]); pc.rect(vx, vy, vw, vh, RW[2]);
        for (let yy = vy + 2; yy < vy + vh - 2; yy += 3) { pc.hline(vx + 2, vx + vw - 3, yy, RW[0]); pc.hline(vx + 2, vx + vw - 3, yy + 1, RW[4]); }
        for (const [a, b] of [[vx + 1, vy + 1], [vx + vw - 2, vy + 1], [vx + 1, vy + vh - 2], [vx + vw - 2, vy + vh - 2]]) pc.set(a, b, RW[5]);
        for (let x = vx; x < vx + vw; x += 3) drip(pc, x + 1, vy + vh + 1, 3 + Math.floor(ph(x, 2, 7) * 8), 0.86);
      } else {
        const hx = x0 + 36, hy = Y(1.78), hw = 20, hh = 26;
        pc.strokeRect(hx, hy, hw, hh, RW[0]); pc.hline(hx + 1, hx + hw - 2, hy + 1, RW[5]); pc.vline(hx + 1, hy + 1, hy + hh - 2, RW[5]);
        pc.rect(hx + hw - 5, hy + hh / 2 - 3, 3, 6, RW[1]); pc.set(hx + hw - 5, hy + hh / 2 - 3, RW[5]);
        txt(pc, 'AC', hx + 5, hy + 4, RW[1]);
      }
    }
    // the bumper rail: a rounded bar (lit top, shadow under), the room's colour stripe set into it
    const ry0 = bot, ry1 = Y(0.9);
    for (let y = ry0; y < ry1; y++) { const t = (y - ry0) / (ry1 - ry0); for (let x = 0; x < W; x++) pc.set(x, y, RR[t < 0.15 ? 4 : t < 0.45 ? 3 : t < 0.8 ? 2 : 1]); }
    if (th.stripe >= 0) { const RS = makeRamp(th.stripe, 4, { spread: 0.4 }); for (let x = 0; x < W; x++) { pc.set(x, ry0 + 3, RS[3]); pc.set(x, ry0 + 4, RS[2]); pc.set(x, ry0 + 5, RS[1]); } }
    for (let x = 14; x < W; x += 32) screw(pc, x, ry1 - 3, RR);
    for (let k = 0; k < 9; k++) chip(pc, Math.floor(rng.next() * W), ry0, RR[4], RR[1], rng.next());
    for (let x = 0; x < W; x++) { pc.set(x, ry1, RL[0]); pc.set(x, ry1 + 1, RL[1]); }
    // lower panels: darker, boot scuffs and cart rubs
    for (let y = ry1 + 2; y < Y(0.15); y++) for (let x = 0; x < W; x++) pc.set(x, y, q(RL.slice(1, 5), 0.5 + (nz(pc, x, y, 5, 3, 2, seed + 7) - 0.5) * 0.6, x, y, 0.35));
    seamV(pc, 64 + (variant % 2) * 0, ry1 + 2, Y(0.15) - 1, RL); seamV(pc, 0, ry1 + 2, Y(0.15) - 1, RL);
    for (let k = 0; k < 14; k++) { const sx = Math.floor(rng.next() * W), sy = Y(0.18 + rng.next() * 0.5), sw = 3 + Math.floor(rng.next() * 10), c = rng.next() < 0.6 ? RL[1] : RL[4]; for (let x = 0; x < sw; x++) pc.set(sx + x, sy, c); }
    // the kick plate: dark steel with tread marks, grime at the floor
    const ky = Y(0.15);
    for (let y = ky; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, ((x + y) % 6 < 2 && y > ky + 2) ? RT[1] : RT[2]);
    for (let x = 0; x < W; x++) { pc.set(x, ky, RT[4]); pc.set(x, ky + 1, RT[3]); pc.set(x, H - 1, RT[0]); if (ph(x, 4, seed) < 0.6) pc.set(x, H - 2, RT[0]); if (ph(x, 5, seed) < 0.3) pc.set(x, H - 3, RT[1]); }
    return T(pc);
  });
}

// ------------------------------------------------------------------ floors (2 m x 2 m, 128 x 128)
export function pixFloor(th: PTheme) {
  return pcached(`pf|${th.key}`, () => {
    const W = 128, pc = new PixelCanvas(W, W), rng = new Rng(hashStr(th.key + 'floor')), seed = hashStr(th.key) % 991;
    const RA = makeRamp(th.fa, 6, { spread: 0.45 }), RB = makeRamp(th.fb, 6, { spread: 0.45 });
    const base = (R2: R, s = 0.45) => { for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) pc.set(x, y, q(R2.slice(1, 5), 0.5 + (nz(pc, x, y, 6, 6, 2, seed) - 0.5) * s * 2, x, y, 0.35)); };
    if (th.floor === 'tread') {
      base(RA, 0.3);
      // diamond tread: raised lozenges in alternating diagonals, each a lit top-left pixel and a dark tail
      for (let y = 2; y < W; y += 6) for (let x = 2; x < W; x += 6) {
        const f = ((x + y) / 6) % 2 === 0;
        const pts = f ? [[0, 0], [1, 1], [2, 2]] : [[2, 0], [1, 1], [0, 2]];
        pts.forEach(([a, b], i) => pc.set(x + a, y + b, i === 0 ? RB[5] : RB[3]));
        pc.set(x + (f ? 3 : -1), y + 3, RA[0]);
      }
      for (const s of [0, 64]) { seamH(pc, 0, W - 1, s, RA); seamV(pc, s, 0, W - 1, RA); }
      for (const s of [0, 64]) for (let k = 8; k < W; k += 20) { screw(pc, s + 3, k, RB); screw(pc, k, s + 3, RB); }
      // a worn, polished path down the middle; oil stains
      for (let y = 0; y < W; y++) for (let x = 40; x < 88; x++) if (ph(x >> 1, y >> 1, 3) < 0.18) pc.set(x, y, RB[4]);
      for (let k = 0; k < 2; k++) pc.ditherBlob(20 + rng.next() * 90, 20 + rng.next() * 90, 7 + rng.next() * 6, 5 + rng.next() * 4, RA[0], 0.6);
    } else if (th.floor === 'rubber' || th.floor === 'lino') {
      for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
        const R2 = (tx + ty) % 2 ? RA : RB;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) pc.set(tx * 32 + x, ty * 32 + y, q(R2.slice(2, 5), 0.5 + (nz(pc, tx * 32 + x, ty * 32 + y, 8, 8, 2, seed + tx) - 0.5) * 0.5, x, y, 0.3));
        if (th.floor === 'rubber') for (let y = 4; y < 32; y += 7) for (let x = 4; x < 32; x += 7) { const X = tx * 32 + x, Yy = ty * 32 + y; pc.set(X, Yy, R2[5]); pc.set(X + 1, Yy, R2[4]); pc.set(X, Yy + 1, R2[4]); pc.set(X + 1, Yy + 1, R2[1]); pc.set(X + 2, Yy + 1, R2[1]); pc.set(X + 1, Yy + 2, R2[1]); }
        else for (let i = 0; i < 26; i++) pc.set(tx * 32 + Math.floor(rng.next() * 32), ty * 32 + Math.floor(rng.next() * 32), rng.next() < 0.5 ? R2[1] : R2[5]);
        pc.hline(tx * 32, tx * 32 + 31, ty * 32, RA[0]); pc.vline(tx * 32, ty * 32, ty * 32 + 31, RA[0]);
        pc.hline(tx * 32 + 1, tx * 32 + 31, ty * 32 + 1, R2[5]);
      }
    } else if (th.floor === 'carpet') {
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const w = ((x >> 1) + (y >> 1)) % 2; pc.set(x, y, q(RA.slice(1, 5), 0.5 + (w ? 0.08 : -0.08) + (nz(pc, x, y, 4, 4, 2, seed) - 0.5) * 0.5, x, y, 0.5)); }
      const RG = makeRamp(0xb08a50, 4, { spread: 0.4 });
      for (const yy of [10, 116]) { for (let x = 0; x < W; x++) { pc.set(x, yy, RB[1]); pc.set(x, yy + 1, RG[2]); pc.set(x, yy + 2, RG[1]); pc.set(x, yy + 3, RB[1]); } for (let x = 4; x < W; x += 16) { pc.set(x, yy - 3, RG[2]); pc.set(x + 1, yy - 4, RG[3]); pc.set(x + 2, yy - 3, RG[2]); pc.set(x + 1, yy - 2, RG[1]); } }
      for (let k = 0; k < 40; k++) pc.set(Math.floor(rng.next() * W), Math.floor(rng.next() * W), RA[0]);
    } else if (th.floor === 'tiles') {
      for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
        const R2 = (tx + ty) % 2 ? RA : RB;
        for (let y = 1; y < 16; y++) for (let x = 1; x < 16; x++) pc.set(tx * 16 + x, ty * 16 + y, q(R2.slice(2, 5), 0.5 + (nz(pc, tx * 16 + x, ty * 16 + y, 16, 16, 1, seed) - 0.5) * 0.5, x, y, 0.3));
        pc.hline(tx * 16 + 2, tx * 16 + 7, ty * 16 + 2, R2[5]); pc.set(tx * 16 + 2, ty * 16 + 3, R2[5]);
        if (ph(tx, ty, seed) < 0.1) { pc.set(tx * 16 + 12, ty * 16 + 2, R2[1]); pc.set(tx * 16 + 13, ty * 16 + 2, R2[1]); pc.set(tx * 16 + 13, ty * 16 + 3, R2[0]); }
      }
      for (let k = 0; k < W; k += 16) { pc.hline(0, W - 1, k, 0x2a2824); pc.vline(k, 0, W - 1, 0x2a2824); }
    } else if (th.floor === 'deck') {
      base(RA, 0.35);
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
        for (const [ax, ay] of [[6, 6], [36, 6], [6, 36], [36, 36]]) {
          const X = tx * 64 + ax, Yy = ty * 64 + ay;
          for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) pc.set(X + x, Yy + y, ((x * 7 + y * 13 + ax) % 5 === 0) ? RB[1] : ((x * 3 + y * 5) % 7 === 0 ? RB[4] : RB[2]));
          pc.hline(X - 1, X + 22, Yy - 1, RA[0]); pc.vline(X - 1, Yy - 1, Yy + 22, RA[0]); pc.hline(X - 1, X + 22, Yy + 22, RA[4]); pc.vline(X + 22, Yy - 1, Yy + 22, RA[4]);
        }
        seamH(pc, tx * 64, tx * 64 + 63, ty * 64, RA); seamV(pc, tx * 64, ty * 64, ty * 64 + 63, RA);
        for (const [sx, sy] of [[3, 3], [61, 3], [3, 61], [61, 61]]) screw(pc, tx * 64 + sx, ty * 64 + sy, RB);
      }
    } else {
      // grating over the sump: coloured pipes and cable runs far below, a bar grid over them
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) pc.set(x, y, RA[0]);
      const pipes = [[14, 0x6a3a28], [44, 0x2e4a5c], [78, 0x5a5a30], [104, 0x402a48]] as [number, number][];
      for (const [py, col] of pipes) { const RP = makeRamp(scaleHex(col, 0.7), 4, { spread: 0.4 }); for (let x = 0; x < W; x++) { pc.set(x, py, RP[3]); for (let k = 1; k < 6; k++) pc.set(x, py + k, RP[k < 3 ? 2 : 1]); pc.set(x, py + 6, RP[0]); } }
      for (let x = 0; x < W; x += 6) for (let y = 0; y < W; y++) { pc.set(x, y, RB[3]); pc.set(x + 1, y, RB[2]); pc.set(x + 2, y, RB[1]); }
      for (let y = 0; y < W; y += 16) for (let x = 0; x < W; x++) { pc.set(x, y, RB[4]); pc.set(x, y + 1, RB[3]); pc.set(x, y + 2, RB[1]); }
      for (const s of [0, 64]) { for (let k = 0; k < W; k++) { pc.set(k, s, RA[4]); pc.set(k, s + 1, RA[3]); pc.set(k, s + 2, RA[2]); pc.set(k, s + 3, RA[1]); pc.set(s, k, RA[4]); pc.set(s + 1, k, RA[3]); pc.set(s + 2, k, RA[2]); pc.set(s + 3, k, RA[1]); } }
    }
    return T(pc);
  });
}

// ------------------------------------------------------------------ small surfaces
/** the cut wall's section: dark plate between two lit edges, cross bracing (repeats along u, 1 m) */
export function pixCap() {
  return pcached('pcap', () => {
    const pc = new PixelCanvas(64, 8), R2 = makeRamp(0x34383c, 5, { spread: 0.5 });
    pc.fill(R2[1]);
    for (let x = 0; x < 64; x++) { pc.set(x, 0, R2[4]); pc.set(x, 7, R2[3]); if ((x % 16) < 10) { pc.set(x, 3, R2[0]); pc.set(x, 4, R2[2]); } }
    return T(pc);
  });
}
export function pixHazard(a = 0xd8a63a, b = 0x1e1c18) {
  return pcached(`phaz|${a}|${b}`, () => {
    const pc = new PixelCanvas(32, 8), RA = makeRamp(a, 4, { spread: 0.35 }), RB = makeRamp(b, 3, { spread: 0.4 });
    for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) { const s = ((x + y) % 16) < 8; pc.set(x, y, s ? (y === 0 ? RA[3] : y === 7 ? RA[1] : RA[2]) : (y === 0 ? RB[2] : RB[1])); }
    for (const x of [3, 13, 22, 29]) { pc.set(x, 0, RB[0]); pc.set(x + 1, 0, RB[0]); pc.set(x, 7, RB[2]); }
    return T(pc);
  });
}
/** a lit console deck: button banks, toggles and indicator lamps in pixel rows (fit once onto a face) */
export function pixConsole(seed = 1) {
  return pcached('pcon|' + seed, () => {
    const W = 64, H = 24, pc = new PixelCanvas(W, H), R2 = makeRamp(0x30363c, 5, { spread: 0.5 });
    pc.fill(R2[1]);
    const cols = [0x6ad08a, 0xe0a040, 0x6ad0d8, 0xe0503a, 0xd8d0b0];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 14; k++) {
      const x = 2 + k * 4 + (r % 2) * 2, y = 2 + r * 7;
      if (ph(k, r, seed) < 0.15) continue;
      const c = cols[Math.floor(ph(k, r + 5, seed) * cols.length)];
      pc.rect(x, y, 3, 3, R2[0]); pc.rect(x, y, 2, 2, c); pc.set(x, y, mixHex(c, 0xffffff, 0.5));
    }
    for (let k = 0; k < 6; k++) { const x = 4 + k * 10; pc.rect(x, 19, 2, 4, R2[3]); pc.set(x, 19, R2[4]); }
    pc.hline(0, W - 1, 0, R2[4]); pc.hline(0, W - 1, H - 1, R2[0]);
    return T(pc, { repeat: false, mips: false });
  });
}
/** server rack face: rows of blinking LEDs over dark bays (fit once) */
export function pixRack(seed = 1) {
  return pcached('prack|' + seed, () => {
    const W = 32, H = 120, pc = new PixelCanvas(W, H), R2 = makeRamp(0x1c2220, 5, { spread: 0.6 });
    pc.fill(R2[0]);
    for (let y = 2; y < H - 2; y += 6) {
      pc.rect(2, y, W - 4, 5, R2[1]); pc.hline(2, W - 3, y, R2[3]);
      for (let x = 4; x < W - 4; x += 3) { const v = ph(x, y, seed); pc.set(x, y + 2, v > 0.82 ? 0xe0a040 : v > 0.35 ? 0x6ad08a : 0x1a3a24); }
      pc.set(W - 5, y + 2, R2[4]); pc.set(W - 4, y + 2, R2[2]);
    }
    return T(pc, { repeat: false, mips: false });
  });
}
/** a sign: pixel-font text on a plate (or cut out), crisp */
export function pixSign(s: string, o: { fg?: number; bg?: number; size?: number; font?: string; border?: number; pad?: number } = {}) {
  const key = `psign|${s}|${JSON.stringify(o)}`;
  const t = pcached(key, () => {
    const size = o.size ?? 16, font = o.font ?? "'Superwide', monospace", pad = o.pad ?? Math.round(size * 0.4);
    const m = measure(s, font, size), W = m.w + pad * 2, H = m.h + pad;
    const pc = new PixelCanvas(W, H);
    if (o.bg !== undefined) {
      const RB2 = makeRamp(o.bg, 4, { spread: 0.4 });
      pc.fill(RB2[1]); pc.hline(0, W - 1, 0, RB2[3]); pc.vline(0, 0, H - 1, RB2[2]); pc.hline(0, W - 1, H - 1, RB2[0]); pc.vline(W - 1, 0, H - 1, RB2[0]);
      for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) { pc.set(x, y, RB2[3]); pc.set(x + 1, y + 1, RB2[0]); }
    }
    const fg = o.fg ?? 0xe8e4d4, sh = scaleHex(fg, 0.35);
    fontText(s, font, size, (x, y) => { if (o.bg !== undefined) pc.set(x + pad + 1, y + Math.round(pad / 2) + 1, sh); });
    fontText(s, font, size, (x, y) => pc.set(x + pad, y + Math.round(pad / 2), fg));
    const tt = T(pc, { repeat: false, mips: false }); (tt as any).aspect = W / H;
    return tt;
  });
  return t;
}
/** a pixel poster (fit once): the lived-in layer, drawn by hand at 128 texels per metre */
export function pixPoster(kind: string, seed = 1) {
  return pcached(`ppost|${kind}|${seed}`, () => {
    const W = 64, H = 88, pc = new PixelCanvas(W, H), rng = new Rng(seed * 77 + kind.length);
    const paper = makeRamp(0xd8cfb8, 4, { spread: 0.3 });
    pc.fill(paper[2]);
    const sign = (s: string, x: number, y: number, c: number) => txt(pc, s, x, y, c);
    const ctr = (s: string, y: number, c: number) => sign(s, Math.round(W / 2 - (s.length * 4 - 1) / 2), y, c);
    if (kind === 'unaa') {
      for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) pc.set(x, y, q(makeRamp(0x1c2c44, 4, { spread: 0.4 }), y / H, x, y, 0.8));
      for (let i = 0; i < 40; i++) pc.set(3 + Math.floor(rng.next() * (W - 6)), 3 + Math.floor(rng.next() * 50), 0xe8e2cc);
      const RP = makeRamp(0xc9773d, 5, { spread: 0.5 });
      for (let y = 0; y < 30; y++) for (let x = 3; x < W - 3; x++) { const dx = x - W / 2, dy = y + 50; if (dx * dx + (dy - 90) * (dy - 90) < 1600) pc.set(x, H - 30 + y - 3, RP[Math.min(4, 1 + Math.floor((1 - (x / W)) * 3 + (y < 2 ? 2 : 0)))]); }
      pc.line(40, 30, 50, 22, 0xe8e2cc); pc.line(41, 31, 51, 23, 0xe8e2cc); pc.line(39, 32, 24, 52, 0xd8a63a);
      ctr('UNAA', 8, 0xe8e2cc); ctr('REACH', 15, 0xd8a63a); ctr('FURTHER', 21, 0xd8a63a);
    } else if (kind === 'safety') {
      for (let x = 0; x < W; x++) for (let y = 0; y < 6; y++) { pc.set(x, y, ((x + y) % 8) < 4 ? 0xd8a63a : 0x1e1c18); pc.set(x, H - 1 - y, ((x + y) % 8) < 4 ? 0xd8a63a : 0x1e1c18); }
      ctr('SECURE', 12, 0x1e1c18); ctr('LOOSE', 19, 0x1e1c18); ctr('OBJECTS', 26, 0x1e1c18);
      const RM = makeRamp(0xb8382e, 4, { spread: 0.45 });
      pc.rect(24, 44, 12, 14, RM[2]); pc.vline(24, 44, 57, RM[3]); pc.rect(36, 47, 4, 2, RM[2]); pc.rect(38, 47, 2, 8, RM[2]); pc.rect(36, 53, 4, 2, RM[1]);
      for (const y of [44, 49, 54]) pc.line(14, y + 6, 20, y + 3, 0x1e1c18);
      pc.hline(10, 54, 66, 0x1e1c18); pc.hline(10, 54, 67, 0x4a463e);
      ctr('PROTOCOL 4.2', 72, 0x4a463e);
    } else if (kind === 'earth') {
      pc.fill(0x05070c);
      for (let i = 0; i < 40; i++) pc.set(Math.floor(rng.next() * W), Math.floor(rng.next() * H), 0x9aa0b0);
      const RE = makeRamp(0x2a5a8a, 5, { spread: 0.5 }), RL = makeRamp(0x5a7a3a, 4, { spread: 0.4 });
      for (let y = -24; y <= 24; y++) for (let x = -24; x <= 24; x++) if (x * x + y * y <= 576) { const lit = 1 - (x + y + 34) / 68; const land = nz(pc, x + 32, y + 36, 4, 4, 3, 77) > 0.56; pc.set(32 + x, 36 + y, land ? RL[Math.max(0, Math.min(3, Math.floor(lit * 4)))] : RE[Math.max(0, Math.min(4, Math.floor(lit * 5)))]); }
      for (let i = 0; i < 9; i++) { const cx = 14 + Math.floor(rng.next() * 36), cy = 18 + Math.floor(rng.next() * 36); for (let k = 0; k < 6; k++) pc.set(cx + k, cy, 0xd8dce0); }
      ctr('HOME', 70, 0xd8cfb8); ctr('4.2 LY BEHIND', 78, 0x8f9a94);
    } else if (kind === 'band') {
      pc.fill(0x2a1830);
      for (let i = 0; i < 6; i++) for (let x = 0; x < W; x++) pc.set(x, 40 + i * 5, [0xd86a3a, 0xe8b84a, 0xc84a6a][i % 3]);
      ctr('THE COMET', 10, 0xe8b84a); ctr('KIDS', 18, 0xe8e2cc); ctr('LIVE', 70, 0xd8cfb8); ctr('HALO STN', 77, 0xd86a3a);
    } else if (kind === 'kid') {
      pc.fill(0xefe8d6);
      pc.hline(2, W - 3, 74, 0x3a6ad8); pc.hline(2, W - 3, 75, 0x3a6ad8);
      pc.line(14, 40, 44, 28, 0xd83a3a); pc.line(44, 28, 50, 33, 0xd83a3a); pc.line(50, 33, 20, 46, 0xd83a3a); pc.line(20, 46, 14, 40, 0xd83a3a);
      for (let k = 0; k < 3; k++) pc.line(14 - k * 2, 43 + k, 6 - k * 2, 48 + k * 2, 0xe8a82a);
      for (const [x, c] of [[18, 0x2a2a2a], [28, 0x8a3ab8], [38, 0x2a8a3a]] as [number, number][]) { pc.circle(x, 56, 3, c); pc.vline(x, 59, 66, c); pc.hline(x - 3, x + 3, 61, c); pc.line(x, 66, x - 2, 71, c); pc.line(x, 66, x + 2, 71, c); }
      pc.circle(54, 12, 6, 0xe8c82a);
      ctr('COME HOME', 4, 0x3a6ad8);
    } else if (kind === 'calendar') {
      pc.rect(0, 0, W, 14, 0xb8382e); ctr('DAY 400', 4, 0xe8e2cc);
      for (let i = 0; i < 35; i++) { const x = 3 + (i % 7) * 8, y = 18 + Math.floor(i / 7) * 13; pc.strokeRect(x, y, 8, 13, 0x8a7e68); if (i < 23) { pc.line(x + 1, y + 1, x + 6, y + 11, 0xb8382e); pc.line(x + 6, y + 1, x + 1, y + 11, 0xb8382e); } }
    } else if (kind === 'pinup') {
      for (let y = 3; y < 54; y++) for (let x = 3; x < W - 3; x++) pc.set(x, y, y < 38 ? q(makeRamp(0x7aa6c8, 4, { spread: 0.35 }), 1 - y / 60, x, y, 0.8) : y < 46 ? 0x3a7a8a : 0xd8c08a);
      pc.vline(16, 20, 46, 0x3a4a2a); for (let k = 0; k < 5; k++) pc.line(16, 20, 16 + Math.cos(k * 0.7 + 2.5) * 12, 20 - Math.sin(k * 0.7 + 2.5) * 6, 0x4a6a2a);
      pc.rect(0, 56, W, H - 56, 0xefe8d6); ctr('CABO 2051', 66, 0x3a3630);
    } else if (kind === 'bio') {
      pc.fill(0xe4ead8);
      for (let y = 6; y < 62; y++) { const a = Math.sin(y * 0.22) * 12; pc.set(32 + a, y, 0x2a6a4a); pc.set(32 - a, y, 0x2a6a4a); if (y % 4 === 0) pc.hline(32 - Math.abs(a), 32 + Math.abs(a), y, [0xb8382e, 0xd8a63a, 0x3a6ad8, 0x2a8a3a][(y / 4) % 4]); }
      ctr('GENE', 68, 0x1c3a2a); ctr('SPLICING', 76, 0x1c3a2a);
    } else if (kind === 'reactor') {
      pc.fill(0xe8d8a8);
      for (let y = -18; y <= 18; y++) for (let x = -18; x <= 18; x++) { const d = x * x + y * y, a = Math.atan2(y, x); if (d <= 324 && (d < 20 || ((a + 3.2) % 2.094) < 1.05)) pc.set(32 + x, 30 + y, 0x1e1c18); }
      ctr('RADIATION', 58, 0x1e1c18); ctr('AREA', 66, 0x1e1c18); ctr('DOSIMETER', 76, 0x4a463e);
    } else if (kind === 'menu') {
      pc.fill(0x1e2422);
      ctr('GALLEY', 4, 0xd8a63a);
      ['MON CHILI', 'TUE NOODLE', 'WED LOAF', 'THU TACOS', 'FRI CHEF', 'SAT PIZZA', 'SUN REMIX'].forEach((s, i) => sign(s, 4, 14 + i * 9, 0xe8e2cc));
      ctr('NO FISH', 78, 0xb8382e);
    } else if (kind === 'firstaid') {
      pc.fill(0xefefe8); pc.rect(26, 10, 12, 40, 0xb8382e); pc.rect(12, 24, 40, 12, 0xb8382e); pc.hline(26, 37, 10, 0xd8584a);
      ctr('FIRST', 60, 0x1e1c18); ctr('AID', 68, 0x1e1c18); ctr('STN 3', 78, 0x5a5a50);
    } else if (kind === 'eye') {
      pc.fill(0xefefe8);
      ['E', 'F P', 'T O Z', 'L P E D', 'P E C F D', 'E D F C Z P'].forEach((s, i) => ctr(s, 6 + i * 13, 0x1e1c18));
    } else if (kind === 'tools') {
      pc.fill(0x3a3c2c); ctr('TOOL CHECK', 4, 0xd8a63a);
      ['TORQUE', 'SEALANT', 'PATCH KIT', 'MAG BOOT', 'CUTTER'].forEach((s, i) => { pc.strokeRect(4, 16 + i * 13, 6, 6, 0xe8e2cc); sign(s, 14, 17 + i * 13, 0xe8e2cc); if (i < 3) { pc.line(5, 19 + i * 13, 7, 21 + i * 13, 0x7fd48a); pc.line(7, 21 + i * 13, 11, 14 + i * 13, 0x7fd48a); } });
    } else {
      // star chart
      pc.fill(0x16304a);
      for (let k = 0; k < W; k += 8) { pc.vline(k, 0, H - 1, 0x22405c); } for (let k = 0; k < H; k += 8) pc.hline(0, W - 1, k, 0x22405c);
      for (let i = 0; i < 7; i++) { const x = 8 + Math.floor(rng.next() * 48), y = 10 + Math.floor(rng.next() * 60); pc.circle(x, y, 1 + Math.floor(rng.next() * 2), 0xe8e2cc); }
      ctr('KEPLER-442', 78, 0xe8e2cc);
    }
    // paper wear: a fold, edge darkening in clusters, two strips of tape
    for (let x = 0; x < W; x++) { if (ph(x, 1, seed) < 0.6) pc.shade(x, H >> 1, 1.1); pc.shade(x, 0, 0.85); pc.shade(x, H - 1, 0.8); }
    for (let y = 0; y < H; y++) { pc.shade(0, y, 0.85); pc.shade(W - 1, y, 0.8); }
    for (const tx of [2, W - 9]) for (let k = 0; k < 7; k++) { pc.set(tx + k, 1 + (tx > 10 ? 6 - k : k) * 0, 0xd8d0a8); pc.set(tx + k, 2, 0xc8c098); }
    const tt = T(pc, { repeat: false, mips: false }); (tt as any).aspect = W / H;
    return tt;
  });
}
/** exterior hull plating, 8 m per tile at 16 texels per metre: plate courses, seams, rivet rows, wear */
export function pixHull(key: string, base: number) {
  return pcached('phull|' + key, () => {
    const W = 128, pc = new PixelCanvas(W, W), rng = new Rng(hashStr(key)), R2 = makeRamp(base, 6, { spread: 0.4 }), seed = hashStr(key) % 997;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) pc.set(x, y, q(R2.slice(2, 5), 0.5 + (nz(pc, x, y, 4, 4, 2, seed) - 0.5) * 0.45, x, y, 0.3));
    for (let cx = 0; cx < 4; cx++) {
      let y = -Math.floor(rng.next() * 16);
      while (y < W) {
        const len = 24 + Math.floor(rng.next() * 4) * 8, x0 = cx * 32;
        const tone = rng.next() < 0.2 ? 1 : rng.next() < 0.3 ? 4 : -1;
        if (tone >= 0) for (let j = 2; j < len - 1; j++) for (let i = 2; i < 31; i++) if (ph(x0 + i, y + j, seed) < 0.85) pc.set(x0 + i, y + j, R2[tone === 1 ? 2 : 4]);
        for (let i = 0; i < 32; i++) { pc.set(x0 + i, y, R2[0]); pc.set(x0 + i, y + 1, R2[5]); }
        for (let k = 3; k < len - 2; k += 4) { pc.set(x0 + 2, y + k, R2[1]); pc.set(x0 + 29, y + k, R2[1]); }
        if (rng.next() < 0.25) for (let k = 0; k < 6 + Math.floor(rng.next() * 10); k++) pc.shade(x0 + 6 + Math.floor(rng.next() * 20), y + 3 + k, 0.9);
        if (rng.next() < 0.08) { pc.strokeRect(x0 + 8, y + 6, 14, 12, R2[0]); pc.hline(x0 + 9, x0 + 20, y + 7, R2[5]); }
        y += len;
      }
      for (let y = 0; y < W; y++) { pc.set(cx * 32, y, R2[0]); pc.set(cx * 32 + 1, y, R2[4]); }
    }
    return T(pc);
  });
}
