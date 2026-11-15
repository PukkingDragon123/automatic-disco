// The hub's 2D UI materials, hand-pixelled to each element's own size (ONE ART PIXEL = 2 SCREEN PIXELS, light from
// the upper left, every colour from the master ramps in art/palette.ts). Each room names itself in its own material:
// the bridge on a riveted, brushed brass plate going green at the rivets; the medbay on a laminated card with a red
// band and a steel grommet; the mess on a lined pad note taped up with a coffee ring; the lab on frosted glass on
// chrome standoffs; the quarters on an embroidered crew patch; the cargo hold on a stencilled crate board; engineering
// on a hazard-striped painted plate; the core and the workshop on pressed-steel enamel door plates with a pinstripe,
// chipped to the iron and rusting at the screws. Plates are painted once per size and cached.
import { Pix } from '../../ui/machine';
import { RAMPS as R } from '../../art/palette';
import { screw, platePix, fontsReady } from '../../ui/desk/pxPanel';
import { tape } from '../../ui/desk/ink';
import type { RoomId } from './layout';

export const K = 2;
const hash = (a: number, b: number, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const at = (r: readonly number[], i: number) => r[Math.max(0, Math.min(r.length - 1, i))];

export type PlateKind = 'brass' | 'laminate' | 'note' | 'glass' | 'patch' | 'wood' | 'hazard' | 'enamel' | 'enamelBlue' | 'enamelRust' | 'enamelBone' | 'steel';
/** each room's material family (its tags, its callouts and its keys) */
export const ROOM_PLATE: Record<RoomId, PlateKind> = {
  bridge: 'brass', lab: 'glass', medbay: 'laminate', core: 'enamelBlue', quarters: 'patch', workshop: 'enamelRust', mess: 'note', cargo: 'wood', engineering: 'hazard',
};

// ------------------------------------------------------------------ shared marks
/** a flake of enamel chipped off to the iron: an irregular blob, its upper-left lip in shade, its lower-right lip
 *  catching light, rust blooming out of the iron */
function chip(p: Pix, cx: number, cy: number, seed: number, E: readonly number[], size = 1) {
  const pts: [number, number][] = [];
  const rows = size > 1 ? [2, 4, 5, 4, 2] : [2, 3, 2];
  rows.forEach((w, j) => { const off = Math.round((hash(cx, cy + j, seed) - 0.5) * 2); for (let i = 0; i < w; i++) pts.push([cx + off + i - (w >> 1), cy + j]); });
  const has = new Set(pts.map(([x, y]) => x * 4096 + y));
  for (const [x, y] of pts) { if (p.a(x, y) < 200) continue; p.set(x, y, hash(x, y, seed) < 0.35 ? R.rust[2] : R.iron[1]); }
  for (const [x, y] of pts) {
    if (p.a(x, y) < 200) continue;
    if (!has.has((x - 1) * 4096 + y) || !has.has(x * 4096 + y - 1)) p.set(x, y, at(E, 0));
  }
  for (const [x, y] of pts) { if (!has.has((x + 1) * 4096 + y) && p.a(x + 1, y) > 200) p.set(x + 1, y, at(E, E.length - 1)); if (!has.has(x * 4096 + y + 1) && p.a(x, y + 1) > 200) p.set(x, y + 1, at(E, E.length - 1)); }
  // a rust run weeping down from the chip
  if (hash(cx, cy, seed + 9) < 0.5) for (let t = 1; t < 3 + Math.floor(hash(cx, seed, 3) * 4); t++) if (p.a(cx, cy + rows.length + t) > 200) p.set(cx, cy + rows.length + t, R.rust[3], 150 - t * 20);
}
/** the outline with chamfered corners (cleared beyond the chamfer) */
function outline(p: Pix, w: number, h: number, col: number, cham = 2) {
  for (let x = 0; x < w; x++) { p.set(x, 0, col); p.set(x, h - 1, col); }
  for (let y = 0; y < h; y++) { p.set(0, y, col); p.set(w - 1, y, col); }
  for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) {
    for (let j = 0; j < cham; j++) for (let i = 0; i < cham - j; i++) p.clear(cx + sx * i, cy + sy * j);
    for (let k = 0; k <= cham; k++) p.set(cx + sx * k, cy + sy * (cham - k), col);
  }
}
/** a 1 px rim: lit top and left, shade bottom and right, inset d */
function rim(p: Pix, w: number, h: number, d: number, lit: number, dark: number) {
  for (let x = d; x < w - d; x++) { if (p.a(x, d) > 200) p.set(x, d, lit); if (p.a(x, h - 1 - d) > 200) p.set(x, h - 1 - d, dark); }
  for (let y = d; y < h - d; y++) { if (p.a(d, y) > 200) p.set(d, y, lit); if (p.a(w - 1 - d, y) > 200) p.set(w - 1 - d, y, dark); }
}
/** a domed rivet, 3 x 3: a lit cap, a shaded foot, its shadow on the plate */
function dome(p: Pix, x: number, y: number, M: readonly number[]) {
  p.set(x, y, at(M, 5)); p.set(x + 1, y, at(M, 4)); p.set(x + 2, y, at(M, 3));
  p.set(x, y + 1, at(M, 4)); p.set(x + 1, y + 1, at(M, 3)); p.set(x + 2, y + 1, at(M, 2));
  p.set(x, y + 2, at(M, 3)); p.set(x + 1, y + 2, at(M, 2)); p.set(x + 2, y + 2, at(M, 1));
  p.set(x + 3, y + 1, at(M, 0), 150); p.set(x + 3, y + 2, at(M, 0), 170); p.set(x + 1, y + 3, at(M, 0), 150); p.set(x + 2, y + 3, at(M, 0), 170);
}

// ------------------------------------------------------------------ the materials
/** pressed steel in coloured vitreous enamel: a glossy field with a broad sheen and a hard glint, a rolled rim, a
 *  cream pinstripe, two screws at the ends, chips to the iron (one round a screw), crazing, grime at the foot */
function enamel(w: number, h: number, seed: number, E: readonly number[], stripe: number) {
  const p = new Pix(w, h), n = E.length, base = n > 6 ? 3 : 3;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const v = y / h, sheen = Math.abs(v - 0.3) < 0.09 && hash(x >> 3, y, seed) < 0.82 ? 1 : 0, foot = v > 0.82 && hash(x >> 2, y, seed + 1) < (v - 0.82) * 6 ? -1 : 0;
    p.set(x, y, at(E, base + sheen + foot));
  }
  // the hard glint: two short strokes up at the left
  for (let t = 0; t < Math.min(14, w / 5); t++) { p.set(6 + t, Math.round(h * 0.22), at(E, n - 1)); if (t < 6) p.set(8 + t, Math.round(h * 0.22) + 1, at(E, n - 2)); }
  // crazing: fine dark hairlines wandering a few pixels
  for (let k = 0; k < 2 + Math.floor(w / 60); k++) { let x = 10 + Math.floor(hash(seed, k, 3) * (w - 20)), y = 4 + Math.floor(hash(seed, k, 4) * (h - 8)); for (let t = 0; t < 6; t++) { p.set(x, y, at(E, base - 1), 170); x += 1; y += hash(seed, k * 9 + t, 5) < 0.5 ? 0 : hash(seed, t, k) < 0.5 ? 1 : -1; } }
  // dust specks
  for (let k = 0; k < (w * h) / 70; k++) { const x = 2 + Math.floor(hash(k, seed, 6) * (w - 4)), y = 2 + Math.floor(hash(k, seed, 7) * (h - 4)); p.set(x, y, at(E, hash(k, seed, 8) < 0.5 ? base - 1 : base + 1)); }
  // the pinstripe, broken here and there
  const si = 3;
  for (let x = si + 2; x < w - si - 2; x++) { if (hash(x >> 1, seed, 11) > 0.06) { p.set(x, si, stripe); p.set(x, h - 1 - si, stripe); } }
  for (let y = si + 2; y < h - si - 2; y++) { if (hash(y >> 1, seed, 12) > 0.06) { p.set(si, y, stripe); p.set(w - 1 - si, y, stripe); } }
  for (const [x, y] of [[si + 1, si + 1], [w - si - 2, si + 1], [si + 1, h - si - 2], [w - si - 2, h - si - 2]]) p.set(x, y, stripe);
  // the rolled rim and outline
  rim(p, w, h, 1, at(E, n - 1), at(E, 1)); rim(p, w, h, 2, at(E, base + 1), at(E, base - 1));
  outline(p, w, h, R.ink[0], 2);
  // screws at both ends, mid-height
  const sy = Math.round(h / 2) - 2;
  screw(p, 6, sy, seed, E); screw(p, w - 11, sy, seed + 1, E);
  // chips: along the edges and one round a screw
  const nc = 2 + Math.floor(w / 46);
  for (let k = 0; k < nc; k++) {
    const side = Math.floor(hash(seed, 20 + k) * 4), t = 0.1 + hash(seed, 30 + k) * 0.8;
    const [cx, cy] = side === 0 ? [Math.floor(t * w), 2] : side === 1 ? [Math.floor(t * w), h - 5] : side === 2 ? [3, Math.floor(t * (h - 6)) + 2] : [w - 5, Math.floor(t * (h - 6)) + 2];
    chip(p, cx, cy, seed + k, E, hash(seed, 40 + k) < 0.3 ? 2 : 1);
  }
  chip(p, w - 9, sy + 4, seed + 7, E, 1);
  return p;
}

/** brushed, riveted brass: horizontal brushing runs, an engraved double border, domed rivets along the top and foot,
 *  verdigris gathering in the corners and round the rivets, the middle rubbed bright by hands */
function brass(w: number, h: number, seed: number) {
  const p = new Pix(w, h), B = R.brass;
  for (let y = 1; y < h - 1; y++) {
    let x = 1;
    while (x < w - 1) {
      const L = 4 + Math.floor(hash(x, y, seed) * 18), d = hash(x, y, seed + 1) < 0.14 ? 1 : hash(x, y, seed + 2) < 0.1 ? -1 : 0;
      const rub = Math.hypot((x - w / 2) / (w * 0.42), (y - h / 2) / (h * 0.5)) < 0.7 && hash(x >> 2, y, seed + 3) < 0.25 ? 1 : 0;
      for (let i = 0; i < L && x < w - 1; i++, x++) p.set(x, y, at(B, 3 + d + rub));
    }
  }
  // the engraved border: a dark cut with a lit lower lip
  const e = 5;
  for (let x = e; x < w - e; x++) { p.set(x, e, B[1]); p.set(x, e + 1, B[5]); p.set(x, h - 1 - e, B[1]); p.set(x, h - e, B[5]); }
  for (let y = e; y < h - e; y++) { p.set(e, y, B[1]); p.set(e + 1, y, B[5]); p.set(w - 1 - e, y, B[1]); p.set(w - e, y, B[5]); }
  // bevel and outline
  rim(p, w, h, 1, B[5], B[1]); rim(p, w, h, 2, B[4], B[2]);
  outline(p, w, h, B[0], 3);
  // rivets and verdigris
  const riv: [number, number][] = [];
  for (let x = 8; x < w - 9; x += 12) { riv.push([x, 2]); riv.push([x + 6 > w - 9 ? x : x + 6, h - 5]); }
  riv.push([2, Math.round(h / 2) - 1], [w - 5, Math.round(h / 2) - 1]);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (p.a(x, y) < 200) continue;
    const dc = Math.min(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
    const dr = Math.min(...riv.map(([rx, ry]) => Math.hypot(x - rx - 1, y - ry - 1)));
    const k = Math.max(0, 1 - dc / 8) * 0.45 + Math.max(0, 1 - dr / 4) * 0.3;
    if (hash(x, y, seed + 5) < k) p.set(x, y, hash(x, y, seed + 6) < 0.5 ? R.teal[4] : hash(x, y, seed + 7) < 0.5 ? R.sage[4] : R.teal[5]);
  }
  for (const [x, y] of riv) dome(p, x, y, B);
  return p;
}

/** a laminated card: clear plastic past the card with a lit edge and a bubble, a red band down the left with a cross,
 *  a punched hole with a steel grommet at the right, a long diagonal glare across it all */
function laminate(w: number, h: number, seed: number) {
  const p = new Pix(w, h), Q = R.quartz, C = R.snow;
  // the laminate (clear, slightly blue), with rounded corners
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = Math.min(x, w - 1 - x), cy = Math.min(y, h - 1 - y);
    if (cx + cy < 3 && Math.hypot(3 - cx, 3 - cy) > 3.2) continue;
    const edge = cx === 0 || cy === 0 || Math.hypot(3 - cx, 3 - cy) > 2.3 && cx < 3 && cy < 3;
    p.set(x, y, edge ? Q[1] : Q[4], edge ? 230 : 120);
  }
  for (let x = 3; x < w - 3; x++) p.set(x, 1, Q[5], 200);
  // the card
  const x0 = 3, y0 = 3, x1 = w - 4, y1 = h - 4;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.set(x, y, hash(x, y, seed) < 0.07 ? C[4] : C[5]);
  for (let x = x0; x <= x1; x++) p.set(x, y1, C[3]);
  for (let k = 0; k < (w * h) / 120; k++) { const x = x0 + 2 + Math.floor(hash(k, seed, 2) * (w - 12)), y = y0 + 2 + Math.floor(hash(k, seed, 3) * (h - 10)); p.set(x, y, C[3]); p.set(x + 1, y, C[4]); }
  // the red band, with its white cross
  const S = R.stampRed, bx = x0, bw = 6;
  for (let y = y0; y <= y1; y++) for (let x = bx; x < bx + bw; x++) p.set(x, y, x === bx ? S[2] : x === bx + bw - 1 ? S[1] : S[3]);
  const my = Math.round((y0 + y1) / 2);
  for (let d = -2; d <= 2; d++) { p.set(bx + 2 + 0, my + d, C[5]); p.set(bx + 3, my + d, C[5]); }
  for (let d = -1; d <= 2; d++) { p.set(bx + 1 + d, my, C[5]); p.set(bx + 1 + d, my - 1 + 0, C[5]); }
  p.set(bx + 4, my, C[4]); p.set(bx + 4, my - 1, C[4]);
  // printed rules at the foot of the card
  for (let x = bx + bw + 3; x < x1 - 14; x += 1) if ((x >> 1) % 6) p.set(x, y1 - 2, C[3]);
  // the punched hole and its grommet
  const gx = w - 9, gy = my;
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
    const r = Math.hypot(i, j);
    if (r <= 1.6) p.clear(gx + i, gy + j);
    else if (r <= 3.2) p.set(gx + i, gy + j, i + j < -1 ? R.steel[6] : i + j > 1 ? R.steel[2] : R.steel[4]);
  }
  // glare, and a trapped bubble
  for (let t = 0; t < h + 6; t++) { const x = Math.round(w * 0.58) + t, y = h - 2 - t; if (y > 1 && x < w - 2) { p.set(x, y, 0xffffff, 120); p.set(x + 1, y, 0xffffff, 70); } const x2 = x + 5; if (y > 1 && x2 < w - 2 && t % 5 < 3) p.set(x2, y, 0xffffff, 80); }
  const bxx = Math.round(w * 0.3), byy = y0 + 3;
  for (const [i, j] of [[0, 0], [1, -1], [2, -1], [3, 0], [3, 1], [2, 2], [1, 2], [0, 1]]) p.set(bxx + i, byy + j, 0xffffff, 140);
  return p;
}

/** a note torn off a lined pad and taped up: paper with fibres and foxing, blue rules and a red margin, the pad's
 *  torn top, a coffee ring, a folded corner, a strip of tape */
function note(w: number, h: number, seed: number) {
  const p = new Pix(w, h), Pp = R.paper, top = 3;
  for (let y = top; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const edge = Math.min(x, w - 1 - x, y - top, h - 1 - y), yel = edge < 3 && hash(x, y, seed) < 0.5 ? -1 : 0;
    p.set(x, y, at(Pp, 5 + yel));
  }
  // the torn top: a ragged profile, a few perforation stubs
  for (let x = 1; x < w - 1; x++) { const d = Math.floor(hash(x >> 1, seed, 1) * 2.2); for (let y = top; y < top + d; y++) p.clear(x, y); if (hash(x, seed, 2) < 0.12) p.set(x, top + d, Pp[3]); }
  // fibres and foxing
  for (let k = 0; k < (w * h) / 40; k++) { const x = 2 + Math.floor(hash(k, seed, 3) * (w - 5)), y = top + 2 + Math.floor(hash(k, seed, 4) * (h - top - 4)), L = 2 + Math.floor(hash(k, seed, 5) * 4); for (let t = 0; t < L; t++) if (p.a(x + t, y + (t >> 2)) > 200) p.set(x + t, y + (t >> 2), Pp[4]); }
  for (let k = 0; k < 3; k++) { const fx = 6 + Math.floor(hash(seed, k, 6) * (w - 12)), fy = top + 4 + Math.floor(hash(seed, k, 7) * (h - top - 8)); for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (hash(i, j, seed + k) < 0.55 && p.a(fx + i, fy + j) > 200) p.set(fx + i, fy + j, R.ochre[5], 120); }
  // the rules and the margin
  for (let y = top + 7; y < h - 3; y += 6) for (let x = 2; x < w - 2; x++) if (p.a(x, y) > 200 && hash(x >> 2, y, seed) > 0.04) p.set(x, y, R.sky[3], 120);
  for (let y = top + 1; y < h - 2; y++) if (p.a(8, y) > 200) p.set(8, y, R.coral[4], 170);
  // a coffee ring: an uneven brown ring, darker at its rim, broken where the mug was lifted
  const rx = w - 16 - Math.floor(hash(seed, 9) * 10), ry = h - 7, rr = 7;
  for (let j = -rr - 1; j <= rr + 1; j++) for (let i = -rr - 1; i <= rr + 1; i++) {
    const d = Math.hypot(i, j * 1.15), a = Math.atan2(j, i);
    if (d > rr - 1.2 && d < rr + 0.6 && !(a > 0.6 && a < 1.5) && p.a(rx + i, ry + j) > 200) p.set(rx + i, ry + j, d > rr - 0.2 ? R.fur[3] : R.fur[4], 120 + Math.round(hash(i, j, seed) * 60));
  }
  // a folded corner at the bottom right
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5 - j; i++) { p.clear(w - 2 - i, h - 2 - j); }
  for (let j = 0; j < 5; j++) for (let i = 0; i <= j; i++) p.set(w - 7 + i + (4 - j) + 0, h - 6 + j, i === j ? Pp[2] : Pp[3]);
  // a strip of tape across the top
  tape(p, Math.round(w / 2) - 8, 0, seed, -0.12 + hash(seed, 10) * 0.24);
  return p;
}

/** frosted glass on chrome standoffs: a fine frost grain, a polished bevel, an etched border, two sheen streaks */
function glass(w: number, h: number, seed: number) {
  const p = new Pix(w, h), Q = R.quartz, T = R.teal;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const f = hash(x, y, seed);
    p.set(x, y, f < 0.42 ? Q[3] : f < 0.9 ? Q[4] : T[5], 215);
  }
  rim(p, w, h, 1, Q[5], Q[1]);
  for (let x = 2; x < w - 2; x++) p.set(x, 2, 0xffffff, 120);
  outline(p, w, h, R.slate[1], 2);
  const e = 6;
  for (let x = e; x < w - e; x++) if ((x & 7) !== 0) { p.set(x, e, Q[5], 200); p.set(x, h - 1 - e, Q[5], 200); }
  for (let y = e; y < h - e; y++) if ((y & 7) !== 0) { p.set(e, y, Q[5], 200); p.set(w - 1 - e, y, Q[5], 200); }
  for (let t = 0; t < h; t++) { const x = 14 + t, y = h - 3 - t; if (y > 2) { p.set(x, y, 0xffffff, 110); p.set(x + 1, y, 0xffffff, 60); p.set(x + 6, y, 0xffffff, 70); } }
  for (const [x, y] of [[2, 2], [w - 7, 2], [2, h - 7], [w - 7, h - 7]]) {
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) { const r = Math.hypot(i - 2, j - 2); if (r > 2.4) continue; p.set(x + i, y + j, r > 1.6 ? R.steel[1] : i + j < 3 ? R.steel[6] : i + j > 5 ? R.steel[3] : R.steel[5]); }
    p.set(x + 1, y + 1, 0xffffff);
  }
  return p;
}

/** an embroidered crew patch: twill fabric, a satin-stitched merrowed border, a running stitch inside, two stars */
function patch(w: number, h: number, seed: number) {
  const p = new Pix(w, h), F = R.sapphire, T = R.ochre;
  const inside = (x: number, y: number, inset: number) => { const r = 5 - inset * 0.2; const cx = Math.min(x, w - 1 - x) - inset, cy = Math.min(y, h - 1 - y) - inset; if (cx < 0 || cy < 0) return false; return !(cx < r && cy < r && Math.hypot(r - cx, r - cy) > r); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y, 0)) continue;
    // twill: diagonal ribs, with a fleck of slub now and then
    const rib = ((x + y * 2) % 4) < 2;
    p.set(x, y, rib ? F[2] : F[1]);
    if (hash(x, y, seed) < 0.04) p.set(x, y, F[3]);
  }
  // the merrowed border: satin stitches wrapping the edge, 4 px wide
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y, 0) || inside(x, y, 4)) continue;
    const s = (x - y) % 3 === 0 || (x - y) % 3 === -0 ? 3 : (x + 2 * y) % 5 === 0 ? 6 : 5;
    p.set(x, y, at(T, s));
    if (!inside(x, y, 1)) p.set(x, y, T[2]);
  }
  // the inner running stitch
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y, 6) || inside(x, y, 7)) continue;
    if (((x + y) >> 1) % 2 === 0) p.set(x, y, R.bone[5]);
  }
  // two stars stitched at the ends
  const star = (cx: number, cy: number) => { for (const [i, j] of [[0, -2], [0, -1], [-2, 0], [-1, 0], [0, 0], [1, 0], [2, 0], [0, 1], [-1, 2], [1, 2], [-1, 1], [1, 1]]) p.set(cx + i, cy + j, j < 0 || i < 0 ? T[6] : T[5]); };
  star(11, Math.round(h / 2) - 1); star(w - 12, Math.round(h / 2) - 1);
  return p;
}

/** a stencilled crate board: a plank of pine with wavy grain and a knot, a split between two planks, nail heads
 *  weeping rust, a red painted corner */
function wood(w: number, h: number, seed: number) {
  const p = new Pix(w, h), W = R.sand, split = h > 26 ? Math.round(h / 2) : -1;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const g = Math.sin(x * 0.07 + Math.sin(x * 0.023 + seed + y * 0.15) * 2.6 + y * 0.9) + Math.sin(y * 0.45 + seed) * 0.5;
    p.set(x, y, at(W, g > 1.05 ? 2 : g > 0.7 ? 3 : g < -1.1 ? 5 : 4));
  }
  // a knot
  const kx = 18 + Math.floor(hash(seed, 1) * (w - 36)), ky = Math.round(h * 0.6);
  for (let j = -4; j <= 4; j++) for (let i = -7; i <= 7; i++) { const d = Math.hypot(i / 1.8, j); if (d < 3.6) p.set(kx + i, ky + j, d < 1.2 ? R.clay[1] : d < 2.0 ? R.clay[3] : (Math.round(d * 2) % 2) ? W[2] : W[3]); }
  if (split > 0) for (let x = 1; x < w - 1; x++) { p.set(x, split, W[0]); p.set(x, split + 1, W[5]); }
  rim(p, w, h, 1, W[5], W[1]);
  outline(p, w, h, R.soil[1], 1);
  // nails at both ends, top and foot
  for (const [x, y] of [[4, 3], [4, h - 6], [w - 7, 3], [w - 7, h - 6]]) {
    p.set(x, y, R.steel[4]); p.set(x + 1, y, R.steel[3]); p.set(x, y + 1, R.steel[3]); p.set(x + 1, y + 1, R.steel[1]);
    for (let t = 2; t < 5; t++) p.set(x + 1, y + t, R.rust[3], 160 - t * 25);
  }
  // a red-painted corner wedge, worn through
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8 - j; i++) if (hash(i, j, seed + 4) > 0.15) p.set(w - 2 - i, 1 + j, i + j > 5 ? R.coral[2] : R.coral[3]);
  return p;
}

/** painted hazard plate: an ochre-painted steel plate with brushing, black-and-yellow stripes at both ends, chips
 *  to the steel, screws in the stripes, grime along the foot */
function hazard(w: number, h: number, seed: number) {
  const O = R.ochre, p = new Pix(w, h), band = 10;
  for (let y = 1; y < h - 1; y++) {
    let x = 1;
    while (x < w - 1) { const L = 3 + Math.floor(hash(x, y, seed) * 14), d = hash(x, y, seed + 1) < 0.2 ? 1 : hash(x, y, seed + 2) < 0.15 ? -1 : 0; for (let i = 0; i < L && x < w - 1; i++, x++) p.set(x, y, at(O, 4 + d)); }
  }
  for (let y = 1; y < h - 1; y++) for (const [a, b] of [[1, band], [w - 1 - band, w - 1]]) for (let x = a; x < b; x++) p.set(x, y, ((x + y) >> 2) & 1 ? R.ink[1] : at(O, 5));
  for (let y = 1; y < h - 1; y++) { p.set(band, y, R.ink[0]); p.set(w - 1 - band, y, R.ink[0]); }
  for (let y = h - 7; y < h - 2; y++) { const k = (y - (h - 7)) / 5; for (let x = 2; x < w - 2; x++) if (hash(x >> 1, y, seed + 3) < k * 0.7) p.set(x, y, at(O, 2)); }
  rim(p, w, h, 1, at(O, 6), at(O, 1));
  outline(p, w, h, R.ink[0], 2);
  screw(p, 3, 3, seed, O); screw(p, w - 8, 3, seed + 1, O); screw(p, 3, h - 8, seed + 2, O); screw(p, w - 8, h - 8, seed + 3, O);
  for (let k = 0; k < 2 + Math.floor(w / 40); k++) { const t = 0.15 + hash(seed, 50 + k) * 0.7, top = hash(seed, 60 + k) < 0.5; chip(p, Math.floor(t * w), top ? 2 : h - 5, seed + k, O, 1); }
  return p;
}

const PAINT: Record<PlateKind, (w: number, h: number, seed: number) => Pix> = {
  brass, laminate, note, glass, patch, wood, hazard,
  enamel: (w, h, s) => enamel(w, h, s, R.moss, R.bone[5]),
  enamelBlue: (w, h, s) => enamel(w, h, s, R.sapphire, R.bone[5]),
  enamelRust: (w, h, s) => enamel(w, h, s, R.rust, R.bone[5]),
  enamelBone: (w, h, s) => enamel(w, h, s, R.bone, R.sapphire[2]),
  steel: (w, h, s) => platePix(w, h, { mat: 'steel', seed: s, rivets: w > 60 && h > 30, wear: 0.7 }),
};
/** the materials' own clearances (screws, stripes, tape) and the lettering each one takes */
const CSS = /* css */`
.pl { background-repeat: no-repeat; background-position: 0 0; image-rendering: pixelated; filter: drop-shadow(0 4px 0 rgba(10,8,6,0.5)); text-shadow: none; }
.pl-brass { padding: 12px 24px; color: #31260f; text-shadow: 2px 2px 0 #cea457; }
.pl-laminate { padding: 10px 32px 10px 28px; color: #1e232c; }
.pl-laminate .s { color: #8c2920; opacity: 1; }
.pl-note { padding: 16px 20px 10px 26px; color: #1e232c; }
.pl-note .s { color: #1e3a72; opacity: 1; }
.pl-glass { padding: 14px 26px; color: #16262e; text-shadow: 2px 2px 0 rgba(255,255,255,0.45); }
.pl-patch { padding: 14px 34px; color: #e9cb89; text-shadow: 2px 2px 0 #0d1730; }
.pl-wood { padding: 12px 26px; color: #1e232c; }
.pl-hazard { padding: 12px 32px; color: #13161c; }
.pl-enamel, .pl-enamelBlue, .pl-enamelRust { padding: 10px 32px; color: #e0cfa6; text-shadow: 2px 2px 0 rgba(10,8,6,0.6); }
.pl-enamelBone { padding: 10px 32px; color: #15264f; }
.pl-steel { padding: 12px 24px; color: #d6cab0; text-shadow: 2px 2px 0 #1c1e20; }
`;
let styled = false;
function style() { if (styled) return; styled = true; const e = document.createElement('style'); e.textContent = CSS; document.head.appendChild(e); }

const urls = new Map<string, string>();
export function plateURL(kind: PlateKind, w: number, h: number, seed = 1) {
  const k = `${kind}|${w}x${h}|${seed}`;
  let u = urls.get(k);
  if (!u) { u = PAINT[kind](w, h, seed).url(); urls.set(k, u); if (urls.size > 300) urls.delete(urls.keys().next().value as string); }
  return u;
}
/** paint an element's background in a material, to its own size, at whole art pixels (repainted when it resizes);
 *  returns a function that stops watching it */
export function plate(el: HTMLElement, kind: PlateKind, seed = 1): () => void {
  style();
  el.classList.add('pl', 'pl-' + kind);
  let last = '';
  const apply = () => {
    if (!el.isConnected || !el.offsetWidth) return;
    const w = Math.max(10, Math.floor(el.offsetWidth / K)), h = Math.max(10, Math.floor(el.offsetHeight / K)), k = `${w}x${h}`;
    if (k === last) return; last = k;
    el.style.backgroundImage = `url(${plateURL(kind, w, h, seed)})`;
    el.style.backgroundSize = `${w * K}px ${h * K}px`;
  };
  const ro = new ResizeObserver(() => fontsReady.then(apply)); ro.observe(el);
  fontsReady.then(() => requestAnimationFrame(apply));
  return () => ro.disconnect();
}

/** a stitched leather strap (the room tab strip): grained hide, saddle stitching along both edges, a brass stud at
 *  each end */
export function strapURL(w: number, h: number) {
  const k = `strap|${w}x${h}`; let u = urls.get(k); if (u) return u;
  const p = new Pix(w, h), H = R.hide;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const g = hash(x >> 1, y, 3) < 0.18 ? -1 : hash(x, y >> 1, 4) < 0.08 ? 1 : 0; p.set(x, y, at(H, 2 + g + (y < 4 ? 1 : y > h - 5 ? -1 : 0))); }
  for (let x = 4; x < w - 4; x++) if ((x >> 1) % 2 === 0) { p.set(x, 3, R.bone[4]); p.set(x, h - 4, R.bone[3]); }
  rim(p, w, h, 1, H[4], H[0]); outline(p, w, h, R.ink[0], 2);
  dome(p, 2, Math.round(h / 2) - 1, R.brass); dome(p, w - 5, Math.round(h / 2) - 1, R.brass);
  u = p.url(); urls.set(k, u); return u;
}
