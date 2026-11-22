// UI KIT · MATERIAL PAINTING, the Limbophobia way (ported from fictional-octo-train/src/gfx/pixel.ts and
// src/gfx/textures/hd.ts): every surface is a continuous material field (soft value-noise mottling, the material's own
// relief) mapped through a HUE-SHIFTED ramp (shadows drift cool, lights warm) with CLUSTERED dithering (a smooth ~3 px
// noise threshold with a 2 x 2 jitter: ramp steps break along wavy, clumped contours like hand pixelling, never a
// bayer checker or a line pattern), then real wear laid on by hand: pits with a lit lip, curved scratches with a lit
// edge, chipped paint down to the metal, grime settling low, rust blooms, stains, fibres, patina.
//   makeRamp(base, steps, o)            a hue-shifted ramp round a base colour
//   vnoise / fbm / ridge                smooth value noise helpers
//   clusterT(x, y, seed)                the clustered dither threshold (0..1)
//   paintSurface(p, mat, inside, o)     fill every pixel where inside(x, y) with the material (returns its lit ramp)
import { Px, INK, hash, mixHex } from './px';
import { RAMPS } from '../../art/palette';

// ------------------------------------------------------------------ colour
const toRGB = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return [h, s, l];
}
function hslToHex(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  if (s === 0) { const v = Math.round(l * 255); return (v << 16) | (v << 8) | v; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return (Math.round(f(h + 1 / 3) * 255) << 16) | (Math.round(f(h) * 255) << 8) | Math.round(f(h - 1 / 3) * 255);
}
/** a hue-shifted pixel-art ramp round a base colour (Limbophobia's makeRamp): darks cool and a little less saturated, lights warm */
export function makeRamp(base: number, steps = 9, o: { hueShift?: number; spread?: number; satShift?: number } = {}): number[] {
  const [r, g, b] = toRGB(base), [h, s, l] = rgbToHsl(r, g, b);
  const hs = o.hueShift ?? 0.045, sp = o.spread ?? 0.62, ss = o.satShift ?? 0.08, mid = (steps - 1) / 2, out: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i - mid) / Math.max(1, mid);
    const nl = Math.max(0.03, Math.min(0.96, l + t * sp * (t < 0 ? l : 1 - l)));
    const shift = Math.abs(t) * hs, target = t < 0 ? 0.66 : 0.12;
    const nh = h + Math.sign(((target - h + 1.5) % 1) - 0.5) * shift;
    const ns = Math.max(0, Math.min(1, s + (t < 0 ? -ss * Math.abs(t) * 0.5 : ss * t * 0.3)));
    out.push(hslToHex(nh, ns, nl));
  }
  return out;
}

// ------------------------------------------------------------------ noise
export function vnoise(x: number, y: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, seed: number, oct = 3) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 101); n += a; a *= 0.5; f *= 2.03; } return s / n; }
/** the clustered dither threshold: smooth noise at about 3 px plus a 2 x 2 block jitter (never a checker) */
export function clusterT(x: number, y: number, seed = 0) {
  return Math.min(0.98, Math.max(0.02, 0.5 + (vnoise(x / 3, y / 3, seed + 911) - 0.5) * 1.7 + (hash(x >> 1, y >> 1, seed + 5) - 0.5) * 0.22));
}
/** quantise a continuous tone (in ramp steps) with the clustered threshold */
export const qstep = (t: number, x: number, y: number, n: number, seed = 0) => { const i = Math.floor(t), f = t - i; return Math.max(0, Math.min(n - 1, f > clusterT(x, y, seed) ? i + 1 : i)); };

// ------------------------------------------------------------------ the materials
export type Surf = 'steel' | 'gun' | 'enamel' | 'brass' | 'olive' | 'paper' | 'blueprint' | 'wood' | 'glass' | 'leather' | 'rubber' | 'orange' | 'copper' | 'red' | 'white' | 'teal';
interface SurfDef { base: number; steps?: number; metal?: boolean; paint?: boolean; under?: number; spread?: number }
const SURF: Record<Surf, SurfDef> = {
  steel: { base: 0x6b7276, metal: true, spread: 0.7 },
  gun: { base: 0x474d52, metal: true, spread: 0.72 },
  enamel: { base: 0xc9bc96, paint: true, under: 0x5a5f62 },
  brass: { base: 0xa8803a, metal: true, spread: 0.68 },
  olive: { base: 0x5e6236, paint: true, under: 0x5d6366 },
  paper: { base: 0xcfc3a4, spread: 0.5 },
  blueprint: { base: 0x2f5592, spread: 0.55 },
  wood: { base: 0x7a5c3c, spread: 0.66 },
  glass: { base: 0x2b5a5c, spread: 0.8 },
  leather: { base: 0x7e4a2a, spread: 0.64 },
  rubber: { base: 0x3c3a3c, spread: 0.6 },
  orange: { base: 0xc06a30, paint: true, under: 0x5d6366 },
  copper: { base: 0xa8643a, metal: true, spread: 0.7 },
  red: { base: 0x9a3030, paint: true, under: 0x5d6366 },
  white: { base: 0xd8d8cc, paint: true, under: 0x5d6366, spread: 0.5 },
  teal: { base: 0x3f7a6c, paint: true, under: 0x5d6366 },
};
const rampCache = new Map<string, number[]>();
export function surfRamp(m: Surf, steps = 9): number[] { const k = m + steps; let r = rampCache.get(k); if (!r) { const d = SURF[m]; r = makeRamp(d.base, steps, { spread: d.spread ?? 0.62 }); rampCache.set(k, r); } return r; }
export const surfIsMetal = (m: Surf) => !!SURF[m].metal;

/**
 * the material's relief at a pixel, in ramp steps round its middle (about -2.5 .. +2.5): soft mottling everywhere,
 * then each material's own detail (all from smooth noise: no stripes, no lines, no flat fills)
 */
export function surfField(m: Surf, x: number, y: number, seed = 1): number {
  const mott = (fbm(x / 22, y / 18, seed) - 0.5) * 1.5 + (fbm(x / 7, y / 7, seed + 3) - 0.5) * 0.6;
  switch (m) {
    case 'steel': case 'gun': case 'copper': {
      // brushed metal: a soft streaky sheen (noise stretched along x), fine pitting in clumps
      const sheen = (vnoise(x / 14, y / 1.6, seed + 7) - 0.5) * 0.9;
      const pit = hash(x, y, seed + 9) < 0.035 && vnoise(x / 6, y / 6, seed + 10) > 0.5 ? -1.6 : 0;
      return mott * 0.9 + sheen + pit;
    }
    case 'brass': {
      // polished: broad soft highlight bands, tarnish in clumps
      const band = Math.pow(Math.max(0, Math.sin((x * 0.04 + y * 0.11) + fbm(x / 30, y / 30, seed + 2) * 3)), 6) * 1.6;
      return mott * 0.8 + band - (fbm(x / 9, y / 9, seed + 4) > 0.64 ? 0.9 : 0);
    }
    case 'enamel': case 'olive': case 'orange': case 'red': case 'white': case 'teal':
      // paint: flat-ish with soft orange-peel mottling and a few drips of shade
      return mott * 0.7 + (vnoise(x / 3, y / 3, seed + 12) - 0.5) * 0.35;
    case 'paper': {
      const fib = hash(x, y, seed + 13) < 0.05 ? (hash(x, y, seed + 14) < 0.5 ? 0.9 : -0.9) : 0;
      return mott * 0.6 + fib;
    }
    case 'blueprint': return mott * 0.7 + (hash(x, y, seed + 15) < 0.03 ? 0.8 : 0);
    case 'wood': {
      // grain along the plank, bent round knots by a warp field; soft, no hard lines
      const warp = fbm(x / 40, y / 12, seed + 16) * 6;
      const g = vnoise(x / 26, y / 1.9 + warp, seed + 17);
      return mott * 0.6 + (g - 0.5) * 1.6 + (g > 0.8 ? -0.6 : 0);
    }
    case 'glass': return (fbm(x / 30, y / 30, seed + 18) - 0.5) * 1.2;
    case 'leather': {
      // pebble grain (small soft cells) and creases
      const peb = (vnoise(x / 1.7, y / 1.7, seed + 19) - 0.5) * 0.7;
      return mott * 0.8 + peb;
    }
    case 'rubber': return mott * 0.6 + (vnoise(x / 1.5, y / 1.5, seed + 20) - 0.5) * 0.5;
  }
}

export interface SurfOpts {
  seed?: number;
  /** the face's light: k(x, y) adds ramp steps (a bevel, a global top-left light) */
  light?: (x: number, y: number) => number;
  /** distance to the edge (for edge wear); return large numbers away from edges */
  edge?: (x: number, y: number) => number;
  /** 0..2 */
  wear?: number;
  /** 0..1 grime gathered toward the foot */
  grime?: number;
  /** the face's height (for the grime gradient) */
  h?: number;
  steps?: number;
}
/** paint a material over every pixel where inside(x, y); returns its ramp */
export function paintSurface(p: Px, m: Surf, inside: (x: number, y: number) => boolean, o: SurfOpts = {}): number[] {
  const R = surfRamp(m, o.steps ?? 9), n = R.length, mid = (n - 1) / 2, seed = o.seed ?? 1, wear = o.wear ?? 0.6, H = o.h ?? p.h, d = SURF[m];
  const under = d.under !== undefined ? makeRamp(d.under, 7, { spread: 0.7 }) : null;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (!inside(x, y)) continue;
    let t = mid + surfField(m, x, y, seed) + (o.light?.(x, y) ?? 0);
    // grime settles toward the foot in clumps
    const gr = (o.grime ?? 0.5) * Math.max(0, y / H - 0.55) * 2.2;
    if (gr > 0 && fbm(x / 9, y / 6, seed + 30) < gr) t -= 1.2;
    // edge wear: paint chipped through to the metal, bare metal burnished bright
    const e = o.edge?.(x, y) ?? 99;
    if (wear > 0 && e < 6) {
      const chip = vnoise(x / 3.2, y / 3.2, seed + 31) + (6 - e) * 0.06 * wear;
      if (under && chip > 0.86 - wear * 0.06) { const k = chip > 0.9 ? 4 : 3; p.set(x, y, under[k]); continue; }
      if (!under && d.metal && chip > 0.82) t += 1.3;
    }
    p.set(x, y, R[qstep(t, x, y, n, seed)]);
  }
  // pits (metal) and paint scuffs: a dark speck with a lit lower-right pixel, in clumps
  if (d.metal || d.paint) {
    const N = Math.round(p.w * p.h * 0.0025 * (0.5 + wear));
    for (let i = 0; i < N; i++) {
      const x = Math.floor(hash(i, 1, seed + 40) * p.w), y = Math.floor(hash(i, 2, seed + 40) * p.h);
      if (!inside(x, y) || !inside(x + 1, y + 1) || vnoise(x / 8, y / 8, seed + 41) < 0.45) continue;
      p.set(x, y, R[1]); p.set(x + 1, y + 1, R[n - 2]);
    }
  }
  // scratches: curved random walks, a dark groove with a lit edge
  const S = Math.round((p.w * p.h) / 5000 * wear * (d.metal || d.paint ? 1.2 : 0.5));
  for (let i = 0; i < S; i++) {
    let x = hash(i, 3, seed + 50) * p.w, y = hash(i, 4, seed + 50) * p.h, a = (hash(i, 5, seed + 50) - 0.5) * 1.4;
    const L = 5 + Math.floor(hash(i, 6, seed + 50) * 18);
    for (let k = 0; k < L; k++) {
      const X = Math.round(x), Y = Math.round(y);
      if (inside(X, Y) && inside(X, Y + 1) && (o.edge?.(X, Y) ?? 99) > 3) { p.set(X, Y, under && d.paint ? under[4] : R[Math.min(n - 1, Math.round(mid) + 2)]); p.set(X, Y + 1, R[Math.max(0, Math.round(mid) - 2)]); }
      x += Math.cos(a); y += Math.sin(a); a += (hash(i, k, seed + 51) - 0.5) * 0.35;
    }
  }
  // rust blooms on painted steel and old metal (a dark core, orange flecks round it)
  if ((d.paint || m === 'steel' || m === 'gun') && wear > 0.5) {
    const rust = RAMPS.rust, B = Math.round(wear * 1.5);
    for (let i = 0; i < B; i++) {
      const cx = hash(i, 7, seed + 60) * p.w, cy = p.h * (0.55 + hash(i, 8, seed + 60) * 0.4), r = 2 + hash(i, 9, seed + 60) * 3.5;
      for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        if (!inside(x, y)) continue;
        const dd = Math.hypot(x - cx, (y - cy) * 1.2) / r + (vnoise(x / 2, y / 2, seed + 61) - 0.5) * 0.7;
        if (dd < 0.55) p.set(x, y, rust[dd < 0.3 ? 1 : 2]); else if (dd < 1 && hash(x, y, seed + 62) > 0.5) p.set(x, y, rust[dd < 0.8 ? 3 : 4]);
      }
    }
  }
  // brass: verdigris in the low places
  if (m === 'brass') for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) { if (!inside(x, y)) continue; if ((o.edge?.(x, y) ?? 99) < 5 && vnoise(x / 3, y / 3, seed + 70) > 0.78) p.set(x, y, mixHex(0x4f8f7a, R[3], 0.35)); }
  // paper: foxing stains (mottled rings) and a few fibres
  if (m === 'paper' || m === 'blueprint') {
    for (let i = 0; i < Math.round(wear * 3); i++) {
      const cx = hash(i, 11, seed + 80) * p.w, cy = hash(i, 12, seed + 80) * p.h, r = 3 + hash(i, 13, seed + 80) * 7;
      for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
        if (!inside(x, y)) continue;
        const a = Math.atan2(y - cy, x - cx), wob = r * (0.8 + 0.3 * vnoise(a * 2 + 9, i, seed + 81)), dd = Math.hypot(x - cx, y - cy);
        if (dd < wob - 1 && clusterT(x, y, seed) < 0.25) p.set(x, y, R[Math.max(0, Math.round(mid) - 1)]);
        else if (dd < wob + 0.5 && dd > wob - 1) p.set(x, y, mixHex(R[Math.round(mid)], 0x8a6a3a, 0.35));
      }
    }
  }
  return R;
}
export { INK };
