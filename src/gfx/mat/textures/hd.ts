// Close-up (first-person) versions of the world's surface textures. The atlas textures are pixel art
// at 32 px per metre, right for the iso camera; the eye camera puts a wall 40 cm from your face and
// one texel would cover a dozen screen pixels. paintHd() rebuilds a texture at 2x or 4x the density:
//  1. a pixel-art upscale: hard features (seams, grout, outlines, printed motifs) are doubled with
//     Scale2x so lines stay one texel thin and diagonals stay diagonal; soft fields (paint mottling,
//     carpet colour, concrete) are re-dithered between neighbouring texels in organic clumps, so no
//     big flat squares are left and no new colours appear;
//  2. light from the top left embosses the hard features (grooves get a shadowed wall and a lit lip);
//  3. a material layer chosen from the texture name: carpet loop pile and stray fibres, paper fibre
//     and plaster pores, wood grain, concrete pits and aggregate, tile glaze, brushed metal, woven
//     cloth, ceiling-tile fissures, grit and blades of grass.
// The atlas keeps the result in a second texture (atlas().hdOf, src/gfx/atlas.ts); the world shader
// switches to it only in the eye view, once a base texel grows past a couple of pixels.

export type HdKind = 'carpet' | 'paper' | 'tile' | 'wood' | 'stone' | 'metal' | 'cloth' | 'ceiling' | 'ground' | 'plain';

/** which world textures get a close-up version at all (opaque surfaces people walk past) */
export const HD_RULE = /^(wall_|carpet|tile|ceil_|concrete|wood|metal|fabric|plastic|door_|plank|linoleum|checker|terrazzo|asphalt|dirt|soil|sand|gravel|grass|sidewalk|lab_floor|server_floor|rubber|grate|brick|leather|curtain|cloth|upholstery|paper|cardboard|window_frame|fence|zw_wall|zw_floor|zw_carpet|zw_tile|bw_)/;

export function hdKind(name: string): HdKind {
  const n = name;
  if (/carpet|rug|mat_/.test(n)) return 'carpet';
  if (/^ceil_tile/.test(n)) return 'ceiling';
  if (/wood|plank|panel|door_wood|door_house|fence|cardboard/.test(n)) return 'wood';
  if (/concrete|cinder|asphalt|sidewalk|tunnel|garage|brick|ceil_concrete|terrazzo/.test(n)) return 'stone';
  if (/tile|checker|pool|linoleum|lab_floor|bathroom|kitchen/.test(n)) return 'tile';
  if (/metal|grate|server|door_metal|window_frame/.test(n)) return 'metal';
  if (/fabric|cloth|curtain|upholstery|leather/.test(n)) return 'cloth';
  if (/dirt|soil|sand|gravel|grass/.test(n)) return 'ground';
  if (/^wall_|paper|plaster|ceil_/.test(n)) return 'paper';
  return 'plain';
}

// ---------------------------------------------------------------- helpers
const lumOf = (c: number) => (((c >>> 16) & 255) * 0.3 + ((c >>> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** tileable value noise over a W x H canvas with `cx` x `cy` cells */
function vnoise(x: number, y: number, W: number, H: number, cx: number, cy: number, s: number): number {
  const fx = (x / W) * cx, fy = (y / H) * cy;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const m = (v: number, p: number) => ((v % p) + p) % p;
  const a = hash(m(x0, cx), m(y0, cy), s), b = hash(m(x0 + 1, cx), m(y0, cy), s);
  const c = hash(m(x0, cx), m(y0 + 1, cy), s), d = hash(m(x0 + 1, cx), m(y0 + 1, cy), s);
  const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Scale2x (EPX) with wrap-around: hard pixel-art edges doubled without blur */
function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * h * 4), W2 = w * 2;
  const at = (x: number, y: number) => src[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    let e0 = P, e1 = P, e2 = P, e3 = P;
    if (C === A && C !== D && A !== B) e0 = A;
    if (A === B && A !== C && B !== D) e1 = B;
    if (D === C && D !== B && C !== A) e2 = C;
    if (B === D && B !== A && D !== C) e3 = D;
    const o = y * 2 * W2 + x * 2;
    out[o] = e0; out[o + 1] = e1; out[o + W2] = e2; out[o + W2 + 1] = e3;
  }
  return out;
}

const mulC = (c: number, k: number) => {
  const r = Math.max(0, Math.min(255, Math.round(((c >>> 16) & 255) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((c >>> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
};

/**
 * Rebuild a w x h RGBA texture at S (2 or 4) times the density. Returns RGBA bytes (S*w x S*h).
 * The texture is treated as tiling (wrap-around neighbours), like the world uses it.
 */
export function paintHd(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, name: string, S: 2 | 4): Uint8Array {
  const n = w * h;
  const src = new Uint32Array(n);
  for (let i = 0; i < n; i++) src[i] = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = lumOf(src[i]);
  let sharp = scale2x(src, w, h);
  if (S === 4) sharp = scale2x(sharp, w * 2, h * 2);
  const W = w * S, H = h * S;
  const kind = hdKind(name);
  const seed = (() => { let s = 7; for (let i = 0; i < name.length; i++) s = Math.imul(s ^ name.charCodeAt(i), 16777619); return s >>> 0; })();
  const bl = (x: number, y: number) => lum[((y + h) % h) * w + ((x + w) % w)];
  const bc = (x: number, y: number) => src[((y + h) % h) * w + ((x + w) % w)];
  // the grain of the texture: are its features mostly horizontal bands or vertical ones?
  let gx = 0, gy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { gx += Math.abs(bl(x + 1, y) - bl(x, y)); gy += Math.abs(bl(x, y + 1) - bl(x, y)); }
  const bandsHoriz = gy > gx * 1.15;
  const HARD = 0.085;
  // 1. upscale: hard features from Scale2x, soft fields re-dithered between neighbours
  const base = new Uint32Array(W * H);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const bx = (X + 0.5) / S - 0.5, by = (Y + 0.5) / S - 0.5;
    const ix = Math.floor(bx), iy = Math.floor(by), fx = bx - ix, fy = by - iy;
    const l00 = bl(ix, iy), l10 = bl(ix + 1, iy), l01 = bl(ix, iy + 1), l11 = bl(ix + 1, iy + 1);
    const lmax = Math.max(l00, l10, l01, l11), lmin = Math.min(l00, l10, l01, l11);
    if (lmax - lmin > HARD) { base[Y * W + X] = sharp[Y * W + X]; continue; }
    // clumped threshold at the new density (2 px clumps), so transitions break organically
    const t = Math.min(0.999, Math.max(0, 0.5 + (vnoise(X, Y, W, H, Math.max(1, W >> 1), Math.max(1, H >> 1), seed) - 0.5) * 1.6));
    const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy;
    base[Y * W + X] = t < w00 ? bc(ix, iy) : t < w00 + w10 ? bc(ix + 1, iy) : t < w00 + w10 + w01 ? bc(ix, iy + 1) : bc(ix + 1, iy + 1);
  }
  // 2. emboss the hard features (light from the top left), on the sharp picture only
  const sl = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) sl[i] = lumOf(sharp[i]);
  const sAt = (x: number, y: number) => sl[((y + H) % H) * W + ((x + W) % W)];
  const out = new Uint8Array(W * H * 4);
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    let c = base[Y * W + X];
    let k = 1;
    const e = sAt(X - 1, Y - 1) - sAt(X + 1, Y + 1);
    if (Math.abs(e) > 0.05) k *= 1 - Math.max(-0.3, Math.min(0.3, e)) * 0.85;
    // 3. the material layer
    const r = hash(X, Y, seed);
    switch (kind) {
      case 'carpet': {
        // loop pile: irregular tufts (clumps of 1-3 px), each lit on its upper edge and shaded below,
        // matted paths where feet have pressed the pile flat
        const tf = vnoise(X, Y, W, H, Math.max(1, Math.round(W / 1.7)), Math.max(1, Math.round(H / 1.7)), seed + 1);
        const up = vnoise(X, Y - 1, W, H, Math.max(1, Math.round(W / 1.7)), Math.max(1, Math.round(H / 1.7)), seed + 1);
        k *= 1 + (tf - 0.5) * 0.22 + (tf - up) * 0.25;
        k *= 1 - Math.max(0, vnoise(X, Y, W, H, Math.max(1, W >> 4), Math.max(1, H >> 4), seed + 11) - 0.62) * 0.4;
        // stray fibres: a neighbour's colour pulled across
        if (r < 0.035) c = bc(Math.floor(X / S) + (r < 0.017 ? 1 : -1), Math.floor(Y / S) + (hash(X, Y, seed + 2) < 0.5 ? 1 : 0));
        break;
      }
      case 'paper': {
        // plaster / paper: faint fibre streaks, clumped pores, a few lit flecks
        k *= 1 + (vnoise(X, Y, W, H, Math.max(1, W >> 3), Math.max(1, H >> 1), seed + 3) - 0.5) * 0.06;
        if (r < 0.022) k *= 0.82; else if (r > 0.99) k *= 1.1;
        break;
      }
      case 'wood': {
        // grain running along the planks, with darker late-wood lines and the odd pore
        const along = bandsHoriz ? X : Y, across = bandsHoriz ? Y : X;
        const L = bandsHoriz ? W : H, A = bandsHoriz ? H : W;
        const g = vnoise(along, across * 6 + vnoise(along, across, L, A, 3, 2, seed + 4) * 9, L, A * 6, 2, Math.max(2, A), seed + 5);
        k *= 1 + (g - 0.5) * 0.16;
        if (g > 0.78) k *= 0.85;
        if (r < 0.012) k *= 0.75;
        break;
      }
      case 'stone': {
        // pits with a lit rim below them, aggregate specks, fine grit
        if (r < 0.03) k *= 0.7;
        else if (hash(X - 1, Y - 1, seed) < 0.03) k *= 1.12;
        else if (r > 0.975) k *= 1.08;
        k *= 1 + (vnoise(X, Y, W, H, Math.max(1, W >> 2), Math.max(1, H >> 2), seed + 6) - 0.5) * 0.1;
        break;
      }
      case 'tile': {
        // glaze: a faint lit sheen in the upper left of each tile face, pinhole specks
        k *= 1 + (vnoise(X, Y, W, H, Math.max(1, W >> 4), Math.max(1, H >> 4), seed + 7) - 0.5) * 0.08;
        if (r < 0.012) k *= 0.8; else if (r > 0.992) k *= 1.12;
        break;
      }
      case 'metal': {
        // brushed: short streaks along the rows, a few bright scratches
        const row = hash(Math.floor(X / 7), Y, seed + 8);
        k *= 1 + (row - 0.5) * 0.08;
        if (((X + Y * 3 + seed) % 97) === 0) k *= 1.2;
        break;
      }
      case 'cloth': {
        // woven: one-pixel over-under, every third row a little darker
        k *= 1 + (((X + Y) & 1) ? 0.05 : -0.05) + (Y % 3 === 0 ? -0.04 : 0);
        break;
      }
      case 'ceiling': {
        // fissured acoustic tile: little dark worms
        if (r < 0.03 || hash(X - 1, Y, seed) < 0.015) k *= 0.82;
        k *= 1 + (vnoise(X, Y, W, H, Math.max(1, W >> 2), Math.max(1, H >> 2), seed + 9) - 0.5) * 0.06;
        break;
      }
      case 'ground': {
        if (r < 0.06) k *= 0.78; else if (r > 0.95) k *= 1.15;
        break;
      }
      default:
        k *= 1 + (vnoise(X, Y, W, H, Math.max(1, W >> 1), Math.max(1, H >> 1), seed + 10) - 0.5) * 0.07;
    }
    if (k !== 1) c = mulC(c, k);
    const o = (Y * W + X) * 4;
    out[o] = (c >>> 16) & 255; out[o + 1] = (c >>> 8) & 255; out[o + 2] = c & 255; out[o + 3] = 255;
  }
  return out;
}
