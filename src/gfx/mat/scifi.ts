// SCI-FI AND INDUSTRIAL MATERIALS for the shared library, painted with Limbophobia's own method (its pixel.ts header and
// content/textures/kit.ts): a short hue-shifted ramp per material (makeRamp: cool shadows, warm lights), a near-flat body
// of two or three close tones from low-frequency tileable noise broken by CLUSTERED dithering (clusterT, never a bayer
// checker or a ruled line), then sparse, deliberate, real-material marks: anodising rubbed to bright alloy at the edges,
// curved hairline scratches with a lit edge, enamel chipped to dark steel with rust bleeding from the chip, zinc spangle,
// crinkled foil facets with a lit crease, quilted insulation pinched at the stitches, rubber bloom and crazing, carbon
// twill under clear coat. 32 texels per metre (one repeat = w/32 x h/32 m); every texture tiles on both axes.
import { atlas } from './atlas';
import { addTextureModule } from './textures/index';
import { HD_KIND } from './textures/hd';
import { PixelCanvas, makeRamp, mixHex, ph } from './pixel';
import { Rng } from './rng';
import { nz, scuff, blob, flecks } from './lib/content/textures/kit';

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** tileable cellular noise: the nearest and second-nearest jittered points on a cx x cy grid over the canvas */
function cells(pc: PixelCanvas, x: number, y: number, cx: number, cy: number, seed: number) {
  const fx = ((x + 0.5) / pc.w) * cx, fy = ((y + 0.5) / pc.h) * cy;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = ix + i, gy = iy + j, wx = wrap(gx, cx), wy = wrap(gy, cy);
    const px = gx + 0.15 + ph(wx, wy, seed) * 0.7, py = gy + 0.15 + ph(wx, wy, seed + 1) * 0.7;
    const d = Math.hypot(fx - px, fy - py);
    if (d < d1) { d2 = d1; d1 = d; id = wy * cx + wx; } else if (d < d2) d2 = d;
  }
  return { d1, d2, id, edge: d2 - d1 };
}
/** Limbophobia's body: three close tones (half-steps around the ramp's middle) from low-frequency tileable noise, with
 *  streaks along one axis when `sx`/`sy` stretch it; never full-amplitude noise */
function body(pc: PixelCanvas, R: number[], seed: number, o: { sx?: number; sy?: number; lo?: number; hi?: number; mid?: number } = {}) {
  const m = o.mid ?? Math.floor(R.length / 2);
  const lo = mixHex(R[m], R[m - 1], 0.5), hi = mixHex(R[m], R[m + 1], 0.5);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = nz(pc, x, y, o.sx ?? 3, o.sy ?? 3, 2, seed), k = nz(pc, x, y, 4, 4, 2, seed + 1);
    let c = n < (o.lo ?? 0.4) ? lo : n > (o.hi ?? 0.62) ? hi : R[m];
    if (k < 0.34) c = mixHex(c, R[m - 1], 0.3);
    pc.set(x, y, c);
  }
  return { lo, hi };
}
/** a curved hairline scratch: bare metal, lit on its upper side, fading at both ends */
function scratch(pc: PixelCanvas, rng: Rng, lit: number, dark: number, len = 8, t = 0.7) {
  let x = rng.float(0, pc.w), y = rng.float(0, pc.h), a = rng.float(-0.6, 0.6) + (rng.chance(0.5) ? 0 : Math.PI);
  const bend = rng.float(-0.08, 0.08);
  for (let i = 0; i < len; i++) {
    const e = i === 0 || i === len - 1 ? 0.45 : 1;
    pc.blend(x, y, lit, t * e); pc.blend(x, y + 1, dark, t * 0.35 * e);
    x += Math.cos(a); y += Math.sin(a); a += bend;
  }
}
/** a chip in a paint or enamel coat: dark steel core, a lit lower lip and a rim of the coat's highlight */
function chip(pc: PixelCanvas, x: number, y: number, r: number, core: number, rim: number, lip: number, seed: number) {
  for (let j = -r - 1; j <= r + 1; j++) for (let i = -r - 1; i <= r + 1; i++) {
    const m = blob(x + i, y + j, x + 0.5, y + 0.5, r + 0.4, r * 0.8 + 0.4, seed, 0.5);
    if (m > 0.35) pc.set(x + i, y + j, core);
    else if (m > 0.05) pc.set(x + i, y + j, j > 0 ? lip : rim);
  }
}
/** a countersunk screw head (3 x 3) lit from the upper left */
function screwHead(pc: PixelCanvas, x: number, y: number, R: number[]) {
  const n = R.length;
  pc.set(x - 1, y - 1, R[1]); pc.set(x, y - 1, R[1]); pc.set(x + 1, y - 1, R[2]);
  pc.set(x - 1, y, R[1]); pc.set(x, y, R[n - 2]); pc.set(x + 1, y, R[n - 1]);
  pc.set(x - 1, y + 1, R[2]); pc.set(x, y + 1, R[n - 1]); pc.set(x + 1, y + 1, R[n - 2]);
}
/** a panel seam: dark groove, a lit lip below / right of it, broken where grime fills it */
function seam(pc: PixelCanvas, horiz: boolean, at: number, R: number[], seed: number) {
  const L = horiz ? pc.w : pc.h;
  for (let k = 0; k < L; k++) {
    const fill = nz(pc, horiz ? k : at, horiz ? at : k, 4, 4, 2, seed) > 0.66;
    const x = horiz ? k : at, y = horiz ? at : k;
    pc.set(x, y, fill ? R[1] : R[0]);
    pc.blend(horiz ? x : x + 1, horiz ? y + 1 : y, R[R.length - 2], 0.55);
    pc.blend(horiz ? x : x - 1, horiz ? y - 1 : y, R[1], 0.3);
  }
}

// ------------------------------------------------------------------ anodised alloy
/** anodised aluminium: a satin dyed skin of three close tones, rubbed to bright alloy along handled edges, fine scratches */
function anodised(pc: PixelCanvas, rng: Rng, base: number, seed: number) {
  const R = makeRamp(base, 7, { hueShift: 0.03, spread: 0.3, satShift: 0.05 });
  // a satin skin: the dye lot drifts in long soft streaks along the rolling direction
  body(pc, R, seed, { sx: 2, sy: Math.max(4, pc.h >> 2) });
  const bare = mixHex(R[5], 0xc8ccd0, 0.5);
  for (let k = 0; k < 5; k++) scratch(pc, rng, mixHex(R[4], bare, 0.5), R[2], rng.int(3, 7), 0.5);
  // rub-through: a few specks of bright alloy where the dye has worn away
  for (let k = 0; k < 3; k++) { const x = rng.int(0, pc.w - 2), y = rng.int(0, pc.h - 1); pc.set(x, y, bare); if (rng.chance(0.5)) pc.set(x + 1, y, R[4]); }
  for (let i = 0; i < Math.floor(pc.w * pc.h / 170); i++) pc.set(rng.int(0, pc.w - 1), rng.int(0, pc.h - 1), R[2]);
  return R;
}
/** anodised panels: two by two plates of slightly different dye lots, seams, countersunk screws, worn corners */
function anodisedPanel(pc: PixelCanvas, rng: Rng, base: number, seed: number) {
  const R = anodised(pc, rng, base, seed);
  const half = pc.w >> 1;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const lot = ph(x < half ? 0 : 1, y < half ? 0 : 1, seed + 7);
    if (lot > 0.62) pc.shade(x, y, 0.97); else if (lot < 0.3) pc.shade(x, y, 1.02);
  }
  for (const s of [0, half]) { seam(pc, true, s, R, seed + 11); seam(pc, false, s, R, seed + 12); }
  for (const cy of [0, half]) for (const cx of [0, half]) for (const [dx, dy] of [[3, 3], [half - 4, 3], [3, half - 4], [half - 4, half - 4]]) screwHead(pc, cx + dx, cy + dy, R);
  // handling wear at the plate corners
  const bare = mixHex(R[5], 0xd8dce0, 0.5);
  for (const cy of [0, half]) for (const cx of [0, half]) if (ph(cx, cy, seed + 9) > 0.4) { pc.set(cx + 1, cy + 1, bare); pc.set(cx + 2, cy + 1, R[4]); }
}

// ------------------------------------------------------------------ machined steel
/** machined steel: bright, cool, faintly directional from the cutter, chatter marks, an oil film, a few deep tool scores */
function machined(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0xa9b0b6, 7, { hueShift: 0.025, spread: 0.46 });
  body(pc, R, 931, { sx: 2, sy: Math.max(4, pc.h >> 1), mid: 4 });
  // the cutter's passes: wide soft bands of sheen, half a tone up, each with an irregular edge
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const band = Math.sin(((y + nz(pc, x, y, 2, 2, 1, 933) * 6) / pc.h) * Math.PI * 2);
    if (band > 0.86 && pc.clusterT(x, y) < 0.6) pc.set(x, y, mixHex(R[4], R[5], 0.5));
  }
  // oil film: a faint warm rainbow smear
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) { const m = blob(x, y, pc.w * 0.66, pc.h * 0.3, pc.w * 0.2, pc.h * 0.12, 5); if (m > pc.clusterT(x, y) * 0.8) pc.blend(x, y, m > 0.5 ? 0x8a7a5a : 0x6a7a8a, 0.18); }
  for (let k = 0; k < 9; k++) scratch(pc, rng, R[6], R[2], rng.int(3, 10), 0.6);
  // tool scores: short deeper grooves, dark with a bright lip
  for (let k = 0; k < 3; k++) { const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1), L = rng.int(3, 6); for (let i = 0; i < L; i++) { pc.set(x + i, y, R[1]); pc.set(x + i, y + 1, R[6]); } }
  flecks(pc, rng, [R[2], R[6]], 10, 0.2);
}

// ------------------------------------------------------------------ quilted insulation
/** quilted insulation blanket: puffed cushions (doming toward the light), pinched at the stitches, Beta-cloth weave, grime */
function quilt(pc: PixelCanvas, rng: Rng, base: number, seed: number) {
  const R = makeRamp(base, 8, { hueShift: 0.04, spread: 0.5 });
  const CW = 16, CH = 16;
  const cell = (x: number, y: number) => {
    const row = Math.floor(y / CH), off = row & 1 ? CW / 2 : 0;
    const u = wrap(x + off, CW), v = y - row * CH;
    return { u: (u + 0.5) / CW, v: (v + 0.5) / CH, row, col: Math.floor((x + off) / CW) };
  };
  pc.fillRamp(R, (x, y) => {
    const c = cell(x, y), du = c.u * 2 - 1, dv = c.v * 2 - 1;
    // the cushion's dome, light from the upper left
    const dome = Math.sqrt(clamp(1 - du * du * 0.6)) * Math.sqrt(clamp(1 - dv * dv * 0.6));
    // the light across each cushion carries the quilting; the seam is only where the next one's lit side begins
    const lit = (-du * 0.45 - dv * 0.65) * 0.15 * dome;
    const e = Math.min(Math.min(c.u, 1 - c.u) * CW, Math.min(c.v, 1 - c.v) * CH);
    const stitch = (wrap(x, 4) === 0 && (c.v < 0.07 || c.v > 0.93)) || (wrap(y, 4) === 0 && (c.u < 0.07 || c.u > 0.93));
    const pinch = e < 1 ? (stitch ? -0.1 : -0.035) : 0;
    const lot = (ph(c.col, c.row, seed + 9) - 0.5) * 0.04;
    const soft = (nz(pc, x, y, 2, 2, 2, seed + 1) - 0.5) * 0.05;
    return 0.5 + dome * 0.04 + lit + pinch + lot + soft;
  }, 0.75);
  // grime low and at the seams, handprints, a scuffed knee-height band
  // a few hand-dark smudges low down, stray fibres
  for (let k = 0; k < 2; k++) { const x = rng.int(0, pc.w - 1), y = rng.int(pc.h >> 1, pc.h - 1); for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) if (blob(x + i, y + j, x, y, 3.2, 2.2, seed + k) > pc.clusterT(x + i, y + j)) pc.shade(x + i, y + j, 0.94); }
  flecks(pc, rng, [R[3], R[5]], Math.floor(pc.w * pc.h / 160), 0.15);
}

// ------------------------------------------------------------------ crinkled foil
/** crinkled multi-layer insulation foil: flat facets each tilted its own way, a lit crease on the folds facing the light */
function foil(pc: PixelCanvas, rng: Rng, base: number, seed: number) {
  const R = makeRamp(base, 8, { hueShift: 0.05, spread: 0.68 });
  const { lo, hi } = body(pc, R, seed, { sx: 2, sy: 2, mid: 4 });
  // the crinkles: each facet tilts half a step lighter or darker; its fold lines are a dark valley with a lit ridge above
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const N = Math.round(pc.w / 7), c = cells(pc, x, y, N, N, seed);
    const tilt = ph(c.id, 0, seed + 2);
    if (c.edge < 0.12) { const up = cells(pc, x, y - 1, N, N, seed); pc.set(x, y, up.id === c.id ? R[2] : R[6]); }
    else if (tilt > 0.68) pc.set(x, y, tilt > 0.9 ? R[5] : hi);
    else if (tilt < 0.25) pc.set(x, y, lo);
  }
  for (let k = 0; k < Math.floor(pc.w * pc.h / 200); k++) pc.set(rng.int(0, pc.w - 1), rng.int(0, pc.h - 1), mixHex(R[7], 0xffffff, 0.35));
}

// ------------------------------------------------------------------ rubber
/** rubber floor: matte charcoal, sheen where worn, dust in the low spots, boot-sole arcs and grit */
function rubberFloor(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x34363a, 7, { hueShift: 0.04, spread: 0.5 });
  body(pc, R, 941, { sx: 3, sy: 3 });
  // a walked path, polished half a step lighter
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) { const p = nz(pc, x, y, 1, 2, 2, 943); if (p > 0.62 && pc.clusterT(x, y) < 0.55) pc.set(x, y, mixHex(R[3], R[4], 0.5)); }
  // dust settled away from the path
  pc.grime(0x5a5650, 0.3, 2, 944, 0.66);
  // boot-sole arcs: short curved scuffs, black
  for (let k = 0; k < 6; k++) {
    const cx = rng.int(0, pc.w - 1), cy = rng.int(0, pc.h - 1), r = rng.int(3, 6), a0 = rng.float(0, 6.28);
    for (let a = a0; a < a0 + 1.2; a += 0.22) pc.blend(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 0x141416, 0.55);
  }
  flecks(pc, rng, [0x6a6458, R[1], R[4]], Math.floor(pc.w * pc.h / 90), 0.1);
}
/** a black rubber seal / grommet stock: soft sheen, waxy bloom, fine ozone crazing */
function rubberSeal(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x2a2a2e, 6, { hueShift: 0.03, spread: 0.55 });
  body(pc, R, 951, { sx: 2, sy: 4 });
  pc.grime(0x5a5a5a, 0.15, 2, 952, 0.7);                           // the bloom
  for (let k = 0; k < 14; k++) { const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1), L = rng.int(2, 4); for (let i = 0; i < L; i++) pc.set(x + i, y + (i === L - 1 && rng.chance(0.5) ? 1 : 0), R[0]); }
  for (let k = 0; k < 4; k++) scuff(pc, rng.int(0, pc.w - 1), rng.int(0, pc.h - 1), rng.int(3, 6), 1, rng.float(-0.3, 0.3), R[4], 0.45);
}

// ------------------------------------------------------------------ carbon composite
/** carbon-fibre composite: charcoal twill under a clear coat (the weave only a faint clumped shimmer at this density),
 *  resin-rich glossy pools, chips through the coat to dull grey fibre */
function carbon(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x2c2f34, 7, { hueShift: 0.05, spread: 0.55 });
  const { lo, hi } = body(pc, R, 961, { sx: 2, sy: 2, mid: 2 });
  // 2 x 2 tows stepping diagonally (the twill): only where the clear coat catches the light does it show, as a shimmer
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const sh = nz(pc, x, y, 2, 2, 2, 962);
    if (sh < 0.52) continue;
    const tw = (Math.floor(x / 2) + Math.floor(y / 2)) % 4 < 2;
    if (tw && pc.clusterT(x, y) < (sh - 0.45) * 3) pc.set(x, y, sh > 0.62 ? R[3] : hi);
    else if (!tw && sh > 0.6) pc.set(x, y, lo);
  }
  for (let k = 0; k < 4; k++) chip(pc, rng.int(0, pc.w - 1), rng.int(0, pc.h - 1), rng.int(0, 1), 0x6a6c6e, R[5], R[1], 960 + k);
  for (let k = 0; k < 5; k++) scratch(pc, rng, R[5], R[0], rng.int(4, 8), 0.5);
}

// ------------------------------------------------------------------ enamel
/** baked enamel: glossy and smooth (a faint orange peel), catch-light glints, chipped to dark steel with rust bleeding */
function enamel(pc: PixelCanvas, rng: Rng, base: number, seed: number, wear = 1) {
  const R = makeRamp(base, 7, { hueShift: 0.035, spread: 0.24 });
  // a glossy coat: near flat, two tones of orange peel in big soft patches
  body(pc, R, seed, { sx: 3, sy: 3, lo: 0.36, hi: 0.66 });
  // grime in the low half, a fingerprint smudge
  pc.grime(mixHex(R[2], 0x3a3020, 0.3), 0.22 * wear, 2, seed + 2, 0.66);
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) { const m = blob(x, y, pc.w * 0.7, pc.h * 0.62, 2.5, 2, seed); if (m > pc.clusterT(x, y)) pc.blend(x, y, R[2], 0.3); }
  // chips: dark steel core, a rust halo below
  for (let k = 0; k < Math.round(3 * wear); k++) {
    const x = rng.int(1, pc.w - 2), y = rng.int(1, pc.h - 2);
    chip(pc, x, y, 0, 0x3a3c40, R[5], R[2], seed + 20 + k);
    if (rng.chance(0.6)) for (let j = 1; j < rng.int(3, 6); j++) pc.blend(x, y + j, 0x7a4022, 0.25 * (1 - j / 7));
  }
  // catch-light glints
  for (let k = 0; k < 3; k++) { const x = rng.int(0, pc.w - 2), y = rng.int(0, pc.h - 1); pc.set(x, y, mixHex(R[6], 0xffffff, 0.5)); pc.set(x + 1, y, R[6]); }
}

// ------------------------------------------------------------------ galvanised steel
/** hot-dip galvanised steel: crystalline zinc spangle (each grain its own grey), feathered grain edges, white-rust runs */
function galvanised(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x9aa2a6, 9, { hueShift: 0.02, spread: 0.3 });
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const c = cells(pc, x, y, Math.round(pc.w / 10), Math.round(pc.h / 10), 971);
    let i = 3 + Math.floor(ph(c.id, 3, 972) * 2.99);
    // dendrite feathering inside a grain: its neighbour tone in clumps
    if (nz(pc, x, y, 8, 8, 1, 973 + (c.id & 7)) > 0.66) i += ph(c.id, 4, 974) > 0.5 ? 1 : -1;
    if (c.edge < 0.04) i = 3;
    pc.set(x, y, R[Math.max(0, Math.min(8, i))]);
  }
  // white rust: chalky runs below a few points
  for (let k = 0; k < 4; k++) { const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1), L = rng.int(4, 10); for (let i = 0; i < L; i++) pc.blend(x + (i > L / 2 && rng.chance(0.3) ? 1 : 0), y + i, 0xe4e6e0, 0.35 * (1 - i / L)); }
  for (let k = 0; k < 3; k++) scratch(pc, rng, R[6], R[1], rng.int(4, 7), 0.5);
}

// ------------------------------------------------------------------ hull plating
/** white hull plating: enamelled plates in a staggered bond, seams, fastener rows, scorch and grime streaks from vents */
function hullWhite(pc: PixelCanvas, rng: Rng) {
  enamel(pc, rng, 0xd6d8d4, 981, 0.6);
  const R = makeRamp(0xd6d8d4, 7, { hueShift: 0.035, spread: 0.5 });
  const PH = 16, PW = 32;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const row = Math.floor(y / PH), off = row & 1 ? PW / 2 : 0, col = Math.floor((x + off) / PW);
    const lot = ph(wrap(col, pc.w / PW), row, 982);
    if (lot > 0.66) pc.shade(x, y, 0.965); else if (lot < 0.25) pc.shade(x, y, 1.025);
  }
  for (let r = 0; r * PH < pc.h; r++) {
    seam(pc, true, r * PH, R, 983);
    const off = r & 1 ? PW / 2 : 0;
    for (let c = 0; c * PW < pc.w; c++) {
      const sx = wrap(c * PW - off, pc.w);
      for (let y = r * PH + 1; y < Math.min(pc.h, (r + 1) * PH); y++) { pc.set(sx, y, R[1]); pc.blend(sx + 1, y, R[5], 0.5); }
      for (let x = 3; x < PW - 2; x += 5) pc.set(wrap(sx + x, pc.w), r * PH + 2, R[2]);
    }
  }
  // streaks: grime and scorch running down from a few points
  for (let k = 0; k < 5; k++) { const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1), L = rng.int(6, 16), c = k < 2 ? 0x2a2420 : 0x6a6050; for (let i = 0; i < L; i++) pc.blend(x, y + i, c, 0.3 * (1 - i / L)); }
}

// ------------------------------------------------------------------ deck plating
/** steel deck plates: worn grey deck paint over steel, a polished walking path, grime in the seams, bolts, oil */
function deckPlate(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x5a5e5c, 8, { hueShift: 0.04, spread: 0.55 });
  body(pc, R, 991, { sx: 3, sy: 3 });
  // the walking path: paint worn thin, then through to steel in a few clumps
  const bare = 0x8a8c88;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) { const p = nz(pc, x, y, 1, 2, 3, 993); if (p > 0.62 && p - 0.62 > pc.clusterT(x, y) * 0.3) pc.set(x, y, p > 0.7 ? bare : mixHex(R[4], R[5], 0.5)); }
  const half = pc.w >> 1;
  for (const s of [0, half]) { seam(pc, true, s, R, 994); seam(pc, false, s, R, 995); }
  for (const cy of [0, half]) for (const cx of [0, half]) for (const [dx, dy] of [[3, 3], [half - 4, 3], [3, half - 4], [half - 4, half - 4]]) screwHead(pc, cx + dx, cy + dy, R);
  pc.grime(0x2a241e, 0.35, 3, 996, 0.58);
  // an oil stain, scuffs
  for (let k = 0; k < 6; k++) scuff(pc, rng.int(0, pc.w - 1), rng.int(0, pc.h - 1), rng.int(3, 6), 1, rng.float(-0.4, 0.4), 0x1a1816, 0.4);
  flecks(pc, rng, [R[6], R[1], 0x7a6a50], Math.floor(pc.w * pc.h / 70), 0.1);
}

// ------------------------------------------------------------------ frost (decal)
/** frost: a feathery bloom of ice creeping out from a crack (alpha decal, stepped alpha), fern-like crystals reaching out */
function frost(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false;
  const R = makeRamp(0xc8e4f0, 5, { spread: 0.5, hueShift: 0.02 }), S = 0x5a6a70;
  const C = pc.w / 2, rad = pc.w / 2 - 2;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const dx = (x - C) / rad, dy = (y - C) / rad, d = Math.sqrt(dx * dx + dy * dy) * (0.75 + nz(pc, x, y, 4, 4, 3, 1201) * 0.55);
    const k = clamp(1 - d);
    if (k <= 0 || k * 1.4 < pc.clusterT(x, y)) continue;
    pc.set(x, y, R[Math.min(4, 1 + Math.floor(k * 4 + (ph(x, y, 1202) - 0.5)))], k > 0.4 ? 230 : k > 0.15 ? 160 : 90);
  }
  // ferns of ice reaching outward, each frond lit on one side
  for (let f = 0; f < 9; f++) {
    let a = rng.float(0, Math.PI * 2), x = C + Math.cos(a) * rad * 0.4, y = C + Math.sin(a) * rad * 0.4;
    for (let st = 0; st < rad * 0.5; st++) {
      a += rng.float(-0.35, 0.35); x += Math.cos(a); y += Math.sin(a);
      pc.set(x, y, 0xf4fcff, 220);
      if (st % 3 === 0) { pc.set(x + Math.cos(a + 1.2) * 2, y + Math.sin(a + 1.2) * 2, R[3], 180); pc.set(x + Math.cos(a - 1.2) * 2, y + Math.sin(a - 1.2) * 2, S, 120); }
    }
  }
}

/** the new set's names (also MAT_FAMILIES.scifi) */
export const SCIFI_MATS: string[] = [];
addTextureModule(() => {
  const A = atlas();
  const add = (name: string, w: number, h: number, draw: (pc: PixelCanvas, rng: Rng) => void, kind?: Parameters<typeof HD_KIND.set>[1]) => {
    A.add(name, w, h, draw); if (!SCIFI_MATS.includes(name)) SCIFI_MATS.push(name); if (kind) HD_KIND.set(name, kind);
  };
  add('metal_anodised_blue', 32, 32, (pc, r) => { anodised(pc, r, 0x3a5a86, 901); }, 'metal');
  add('metal_anodised_red', 32, 32, (pc, r) => { anodised(pc, r, 0x9a3a32, 902); }, 'metal');
  add('metal_anodised_teal', 32, 32, (pc, r) => { anodised(pc, r, 0x2e7a78, 903); }, 'metal');
  add('metal_anodised_grey', 32, 32, (pc, r) => { anodised(pc, r, 0x6a7078, 904); }, 'metal');
  add('panel_anodised_grey', 64, 64, (pc, r) => anodisedPanel(pc, r, 0x6e747c, 905), 'metal');
  add('panel_anodised_blue', 64, 64, (pc, r) => anodisedPanel(pc, r, 0x40608a, 906), 'metal');
  add('metal_machined', 32, 32, machined, 'metal');
  add('quilt_insulation', 64, 64, (pc, r) => quilt(pc, r, 0xc8c2ae, 911), 'paper');
  add('quilt_insulation_grey', 64, 64, (pc, r) => quilt(pc, r, 0x6e706c, 912), 'paper');
  add('foil_gold', 32, 32, (pc, r) => foil(pc, r, 0xb8913c, 921), 'plain');
  add('foil_silver', 32, 32, (pc, r) => foil(pc, r, 0xa8b0b6, 922), 'plain');
  add('rubber_floor', 64, 64, rubberFloor, 'stone');
  add('rubber_seal', 32, 32, rubberSeal, 'plain');
  add('carbon_composite', 32, 32, carbon, 'plain');
  add('enamel_white', 32, 32, (pc, r) => enamel(pc, r, 0xdcdcd4, 941), 'tile');
  add('enamel_cream', 32, 32, (pc, r) => enamel(pc, r, 0xd8ccae, 942), 'tile');
  add('enamel_red', 32, 32, (pc, r) => enamel(pc, r, 0xa83a2e, 943), 'tile');
  add('enamel_green', 32, 32, (pc, r) => enamel(pc, r, 0x4e7058, 944), 'tile');
  add('enamel_olive', 32, 32, (pc, r) => enamel(pc, r, 0x6a6c48, 945), 'tile');
  add('steel_galvanised', 64, 64, galvanised, 'metal');
  add('panel_hull_white', 64, 64, hullWhite, 'tile');
  add('deck_plate', 64, 64, deckPlate, 'metal');
  add('decal_frost', 64, 64, frost);
});
