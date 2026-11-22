// TOOL MODELS · MATERIAL PAINTING (the Limbophobia way, as V7.md "TEXTURES" asks; built on the UI kit's port of it,
// src/ui/kit/paint.ts): every tile is a continuous material field (soft value-noise mottling and the material's own
// relief) mapped through a HUE-SHIFTED ramp round a master-palette colour, quantised with a CLUSTERED threshold (wavy
// clumps, never a checker or a line pattern), then real wear laid on: enamel chipped to the metal with a dark lip and a
// lit edge, curved scratches, pits with a lit lip, scuffs, tarnish. The noise is periodic, so a 64 px tile (2 m at
// 32 px/m) repeats without a seam.
//   paintTile(p, kind, base, seed, o)   kind 'paint' | 'metal' | 'polished' | 'cast' | 'rubber' | 'brass' | 'glass' | 'ceramic'
import { Px, hash } from '../../ui/kit/px';
import { makeRamp } from '../../ui/kit/paint';
import { RAMPS } from '../../art/palette';

export type TileKind = 'paint' | 'metal' | 'polished' | 'cast' | 'rubber' | 'brass' | 'glass' | 'ceramic';
const W = 64;
const wrap = (i: number, P: number) => ((i % P) + P) % P;
/** periodic value noise: cell sizes cx, cy (px, dividing 64) */
function pn(x: number, y: number, cx: number, cy: number, seed: number) {
  const X = x / cx, Y = y / cy, PX = W / cx, PY = W / cy, xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const h = (i: number, j: number) => hash(wrap(i, PX), wrap(j, PY), seed);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x: number, y: number, c: number, seed: number) => pn(x, y, c, c, seed) * 0.6 + pn(x, y, c / 2, c / 2, seed + 7) * 0.28 + pn(x, y, c / 4, c / 4, seed + 13) * 0.12;
/** the clustered dither threshold (about 4 px clumps plus a 2 x 2 jitter) */
const clusterT = (x: number, y: number, seed: number) => Math.min(0.97, Math.max(0.03, 0.5 + (pn(x, y, 4, 4, seed + 911) - 0.5) * 1.7 + (hash(wrap(x >> 1, 32), wrap(y >> 1, 32), seed + 5) - 0.5) * 0.22));
const q = (t: number, x: number, y: number, n: number, seed: number) => { const i = Math.floor(t), f = t - i; return Math.max(0, Math.min(n - 1, f > clusterT(x, y, seed) ? i + 1 : i)); };

interface Kind { spread: number; steps: number; field: (x: number, y: number, s: number) => number; wear: number; under?: number; pits?: boolean }
const KINDS: Record<TileKind, Kind> = {
  // enamel paint: orange-peel mottling, soft clouds of shade, a few dark specks in clumps
  paint: { spread: 0.5, steps: 9, wear: 0.7, under: RAMPS.steel[3], field: (x, y, s) => (fbm(x, y, 32, s) - 0.5) * 1.1 + (pn(x, y, 4, 4, s + 3) - 0.5) * 0.35 + speck(x, y, s) },
  // machined metal: a soft streaky sheen (noise stretched along the rows, never lines), pits in clumps
  metal: { spread: 0.62, steps: 9, wear: 0.5, pits: true, field: (x, y, s) => (fbm(x, y, 32, s) - 0.5) * 0.9 + (pn(x, y, 16, 2, s + 5) - 0.5) * 0.9 + speck(x, y, s) },
  // polished: broad bright clouds and a hard glint band, very little wear
  polished: { spread: 0.7, steps: 9, wear: 0.25, field: (x, y, s) => (fbm(x, y, 32, s) - 0.5) * 1.6 + Math.pow(pn(x, y, 32, 8, s + 9), 4) * 2.2 },
  // cast or sand-blasted dark metal: coarse grain and pitting
  cast: { spread: 0.55, steps: 9, wear: 0.6, pits: true, field: (x, y, s) => (fbm(x, y, 16, s) - 0.5) * 0.9 + (pn(x, y, 2, 2, s + 4) - 0.5) * 0.7 + speck(x, y, s) },
  rubber: { spread: 0.5, steps: 7, wear: 0.15, field: (x, y, s) => (fbm(x, y, 32, s) - 0.5) * 0.6 + (pn(x, y, 2, 2, s + 6) - 0.5) * 0.9 },
  // brass: broad soft highlight clouds, tarnish in clumps
  brass: { spread: 0.66, steps: 9, wear: 0.45, field: (x, y, s) => (fbm(x, y, 32, s) - 0.5) * 1.1 + Math.pow(pn(x, y, 32, 16, s + 2), 3) * 1.8 - (fbm(x, y, 8, s + 4) > 0.68 ? 0.9 : 0) },
  glass: { spread: 0.7, steps: 7, wear: 0, field: (x, y, s) => (fbm(x, y, 32, s) - 0.5) * 1.3 + Math.pow(pn(x, y, 64, 8, s + 3), 6) * 3 },
  ceramic: { spread: 0.42, steps: 7, wear: 0.3, field: (x, y, s) => (fbm(x, y, 16, s) - 0.5) * 0.8 + speck(x, y, s) * 0.8 },
};
function speck(x: number, y: number, s: number) { const h = hash(x, y, s + 2); return h < 0.05 && pn(x, y, 8, 8, s + 6) > 0.5 ? -1 : h > 0.99 ? 0.8 : 0; }

/** paint a 64 px tile of a material round a base colour */
export function paintTile(p: Px, kind: TileKind, base: number, seed = 1, o: { wear?: number; light?: number } = {}) {
  const K = KINDS[kind], R = makeRamp(base, K.steps, { spread: K.spread }), n = R.length, mid = (n - 1) / 2 + (o.light ?? 0), wear = o.wear ?? K.wear;
  const under = K.under !== undefined ? makeRamp(K.under, 7, { spread: 0.7 }) : null;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, R[q(mid + K.field(x, y, seed), x, y, n, seed)]);
  if (wear <= 0) return R;
  // chips through the paint to the metal: a clump with a dark upper-left lip and a lit lower-right edge
  if (under) {
    const N = Math.round(2 + wear * 3);
    for (let i = 0; i < N; i++) {
      const cx = Math.floor(hash(i, 1, seed + 20) * W), cy = Math.floor(hash(i, 2, seed + 20) * W), r = 1 + hash(i, 3, seed + 20) * 1.6;
      for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) {
        const d = Math.hypot(k, j * 1.2) / r + (pn(cx + k, cy + j, 2, 2, seed + 21) - 0.5) * 0.7;
        if (d > 1) continue;
        const X = wrap(cx + k, W), Y = wrap(cy + j, W);
        p.set(X, Y, under[d < 0.5 ? 4 : 3]);
      }
      for (let j = -3; j <= 3; j++) for (let k = -3; k <= 3; k++) {
        const X = wrap(cx + k, W), Y = wrap(cy + j, W), d = Math.hypot(k, j * 1.2) / r + (pn(cx + k, cy + j, 2, 2, seed + 21) - 0.5) * 0.7;
        if (d <= 1 || d > 1.45) continue;
        p.set(X, Y, k + j < 0 ? R[Math.max(0, Math.round(mid) - 2)] : R[Math.min(n - 1, Math.round(mid) + 1)]);
      }
    }
  }
  // pits with a lit lip, in clumps
  if (K.pits) for (let i = 0; i < Math.round(18 * wear); i++) {
    const x = Math.floor(hash(i, 4, seed + 30) * W), y = Math.floor(hash(i, 5, seed + 30) * W);
    if (pn(x, y, 8, 8, seed + 31) < 0.45) continue;
    p.set(x, y, R[1]); p.set(wrap(x + 1, W), wrap(y + 1, W), R[n - 2]);
  }
  // curved scratches: a dark groove with a lit edge
  for (let i = 0; i < Math.round(3 * wear); i++) {
    let x = hash(i, 6, seed + 40) * W, y = hash(i, 7, seed + 40) * W, a = (hash(i, 8, seed + 40) - 0.5) * 1.6;
    const L = 4 + Math.floor(hash(i, 9, seed + 40) * 9);
    for (let k = 0; k < L; k++) {
      const X = wrap(Math.round(x), W), Y = wrap(Math.round(y), W);
      p.set(X, Y, under ? under[4] : R[Math.min(n - 1, Math.round(mid) + 2)]); p.set(X, wrap(Y + 1, W), R[Math.max(0, Math.round(mid) - 2)]);
      x += Math.cos(a); y += Math.sin(a); a += (hash(i, k, seed + 41) - 0.5) * 0.4;
    }
  }
  return R;
}
