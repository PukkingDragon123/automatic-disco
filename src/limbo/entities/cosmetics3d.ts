// The cosmetics catalogue (src/game/cosmetics.ts) made solid: low-poly models
// hung on the rig's bones (hats, eyewear and masks on the head, tags and
// collars on the neck, tanks and wings on the back) and the jumpsuit variants
// (re-dyed, or re-woven with stripes, hazard chevrons or circuit thread).
// HumanRig calls cosmeticOutfit() while it dresses the body and
// syncCosmetics() after, so every rig that carries `app.cos` (the creator, the
// player, co-op guests) wears them. Real items win: a worn hat, glasses, mask
// or backpack hides the cosmetic in that slot. Geometry is cached per piece
// and shared by every rig; one small mesh per worn piece.
import * as THREE from 'three';
import type { Outfit } from './humanRig';
import type { Dims, BoneName } from './humanModel';
import { ModelBuilder } from '../gfx/modelBuilder';
import { defGarment, garment } from './humanClothes';
import type { Paint } from './humanClothes';
import type { Surf } from './humanPaint';
import { COSMETIC, type CosSlot } from '../game/cosmetics';

type MB = ModelBuilder;
interface Piece { bone: BoneName; build: (mb: MB) => void; flatHair?: boolean; glow?: { color: number; make: () => THREE.BufferGeometry } }
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ faceted kit
// Every piece is built from few-sided lathes, chamfered prisms and jittered
// shells: flat-shaded facets, irregular silhouettes, never a bare primitive.
const hsh = (a: number, b: number) => { const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return x - Math.floor(x); };
interface LatheOpts { jit?: number; sx?: number; sz?: number; cz?: number; cy?: number; a0?: number; a1?: number; top?: boolean; bottom?: boolean; emissive?: number; seed?: number; shade?: (i: number) => number }
/** revolve a profile [[r, y], ...] (bottom to top) round the y axis with few sides; jit roughens it; a0..a1 an arc (0 = the face) */
function lathe(mb: MB, prof: number[][], sides: number, tex: string, color: number, o: LatheOpts = {}) {
  const sx = o.sx ?? 1, sz = o.sz ?? 1, cz = o.cz ?? 0, a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU, closed = Math.abs(a1 - a0 - TAU) < 1e-6;
  const sd = o.seed ?? 1;
  const P = (i: number, j: number) => {
    const jj = closed ? j % sides : j;
    const a = a0 + ((a1 - a0) * j) / sides;
    const k = 1 + (o.jit ? (hsh(i * 7 + sd, jj * 13 + sd) - 0.5) * 2 * o.jit : 0);
    const r = prof[i][0] * k;
    return [Math.sin(a) * r * sx, prof[i][1] + (o.cy ?? 0), cz + Math.cos(a) * r * sz];
  };
  const rows = prof.length - 1;
  for (let i = 0; i < rows; i++) for (let j = 0; j < sides; j++) {
    const shade = o.shade ? o.shade(i) : 1;
    mb.quadRaw([P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j)], [[j / sides, i / rows], [(j + 1) / sides, i / rows], [(j + 1) / sides, (i + 1) / rows], [j / sides, (i + 1) / rows]], tex, color, shade, o.emissive ?? 0);
  }
  const cap = (i: number, up: boolean) => {
    const y = prof[i][1] + (o.cy ?? 0);
    for (let j = 0; j < sides; j++) {
      const a = P(i, j), b = P(i, j + 1), c = [0, y, cz];
      mb.triRaw(up ? [a, b, c] : [b, a, c], [[0, 0], [1, 0], [0.5, 1]], tex, color, up ? 1 : 0.6, o.emissive ?? 0);
    }
  };
  if (o.top && prof[rows][0] > 1e-4) cap(rows, true);
  if (o.bottom && prof[0][0] > 1e-4) cap(0, false);
}
/** a prism with chamfered edges all round (plates, buckles, canisters seen edge-on) centred at x,y,z */
function cbox(mb: MB, x: number, y: number, z: number, w: number, h: number, d: number, c: number, tex: string, color: number, emissive = 0) {
  const hw = w / 2, hd = d / 2;
  const oct = (inset: number) => [[hw - c - inset, hd - inset], [hw - inset, hd - c - inset], [hw - inset, -hd + c + inset], [hw - c - inset, -hd + inset], [-hw + c + inset, -hd + inset], [-hw + inset, -hd + c + inset], [-hw + inset, hd - c - inset], [-hw + c + inset, hd - inset]];
  const rows = [[y - h / 2, c * 0.7], [y - h / 2 + c, 0], [y + h / 2 - c, 0], [y + h / 2, c * 0.7]];
  const ring = rows.map(([yy, ins]) => oct(ins).map(([px, pz]) => [x + px, yy, z + pz]));
  for (let i = 0; i < 3; i++) for (let j = 0; j < 8; j++) {
    const a = ring[i][j], b = ring[i][(j + 1) % 8], cc = ring[i + 1][(j + 1) % 8], dd = ring[i + 1][j];
    // the octagon runs counter-clockwise seen from above, like the lathes: these quads face out
    mb.quadRaw([a, b, cc, dd], [[0, 0], [1, 0], [1, 1], [0, 1]], tex, color, i === 1 ? 1 : 0.85, emissive);
  }
  for (const [i, up] of [[3, true], [0, false]] as const) {
    const r = ring[i];
    for (let j = 1; j < 7; j++) mb.triRaw(up ? [r[0], r[j], r[j + 1]] : [r[0], r[j + 1], r[j]], [[0, 0], [1, 0], [0.5, 1]], tex, color, up ? 1 : 0.6, emissive);
  }
}
/** an eight-faced gem */
function gem(mb: MB, x: number, y: number, z: number, r: number, tex: string, color: number, emissive = 0) {
  const T = [x, y + r * 1.3, z], Bt = [x, y - r * 1.1, z], E = [[x + r, y, z], [x, y, z + r], [x - r, y, z], [x, y, z - r]];
  for (let i = 0; i < 4; i++) { const a = E[i], b = E[(i + 1) % 4]; mb.triRaw([b, a, T], [[0, 0], [1, 0], [0.5, 1]], tex, color, 1, emissive); mb.triRaw([a, b, Bt], [[0, 0], [1, 0], [0.5, 1]], tex, color, 0.7, emissive); }
}
/** a band round the head (an arc a0..a1, 0 = the face), few-sided, squeezed to the skull's oval */
function ring(mb: MB, y: number, r: number, h: number, t: number, n: number, tex: string, color: number, emissive = 0, a0 = 0, a1 = TAU, sx = 1) {
  const sides = Math.max(4, Math.round(Math.min(n, 11) * Math.abs(a1 - a0) / TAU));
  lathe(mb, [[r + t * 0.6, y - h / 2], [r + t, y - h / 2 + Math.min(h * 0.3, t)], [r + t, y + h / 2 - Math.min(h * 0.3, t)], [r + t * 0.6, y + h / 2]], sides, tex, color, { a0, a1, sx, emissive });
}
/** a five-sided rod between two points */
function rod(mb: MB, a: number[], b: number[], r: number, tex: string, color: number, emissive = 0) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
  mb.push().translate(a[0], a[1], a[2]);
  mb.matrix(new THREE.Matrix4().makeRotationFromQuaternion(q));
  lathe(mb, [[r * 0.9, 0], [r, L * 0.15], [r, L * 0.85], [r * 0.9, L]], 5, tex, color, { emissive, top: true, bottom: true });
  mb.pop();
}
/** a curved plate following the face (masks): angles a0..a1, heights y0..y1, off the skin; paint(i, j) may recolour (-1 leaves a hole); jitter roughens it */
function shell(mb: MB, a0: number, a1: number, y0: number, y1: number, off: number, nA: number, nY: number, tex: string, color: number, paint?: (i: number, j: number) => number, jit = 0.002) {
  const rz = (y: number) => 0.1 + off - Math.max(0, y - 0.13) * 0.45 - Math.max(0, 0.03 - y) * 0.6;
  const P = (i: number, j: number) => {
    const a = a0 + ((a1 - a0) * i) / nA, y = y0 + ((y1 - y0) * j) / nY;
    const r = rz(y) + (hsh(i, j) - 0.5) * jit * (i > 0 && i < nA && j > 0 && j < nY ? 1 : 0);
    return [Math.sin(a) * r * 0.86, y, 0.006 + Math.cos(a) * r];
  };
  for (let j = 0; j < nY; j++) for (let i = 0; i < nA; i++) {
    const c = paint ? paint(i, j) : color;
    if (c < 0) continue;
    mb.quadRaw([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], [[i / nA, j / nY], [(i + 1) / nA, j / nY], [(i + 1) / nA, (j + 1) / nY], [i / nA, (j + 1) / nY]], tex, c);
  }
}
/** a two-sided flat panel (wings, plates) */
function plate(mb: MB, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tex: string, color: number) {
  mb.panel(x0, z0, x1, z1, y0, y1, tex, { color, fit: true });
  mb.panel(x1, z1, x0, z0, y0, y1, tex, { color: (color >> 1) & 0x7f7f7f, fit: true });
}

// head-local unit space (scaled by height × head size): y 0 at the jaw hinge,
// eyes at y≈0.1 / z≈0.095, crown at y≈0.215; +z is the face, +x the subject's left
const SQ = 0.84; // the skull is narrower side to side than front to back
const PIECES: Record<string, Piece> = {
  hat_watch: { bone: 'head', flatHair: true, build: (mb) => {
    // knitted cap: a fat folded cuff (ribbed facets), the crown gathering to a blunt top
    const rib = (i: number) => (i % 2 ? 0.9 : 1);
    lathe(mb, [[0.111, 0.104], [0.117, 0.111], [0.118, 0.124], [0.117, 0.138], [0.112, 0.145]], 10, 'fabric_grey', 0x34442f, { sx: SQ, jit: 0.02, shade: rib, seed: 3 });
    lathe(mb, [[0.109, 0.145], [0.108, 0.17], [0.098, 0.2], [0.075, 0.226], [0.04, 0.242], [0, 0.248]], 10, 'fabric_grey', 0x3a4a3a, { sx: SQ, jit: 0.035, seed: 4 });
  } },
  hat_bucket: { bone: 'head', flatHair: true, build: (mb) => {
    // a drooping canvas brim, a tapered crown, a band; the canvas is lumpy
    lathe(mb, [[0.168, 0.104], [0.14, 0.122], [0.112, 0.13]], 11, 'fabric_brown', 0x7e6e4a, { sx: 0.9, jit: 0.04, seed: 5 });
    lathe(mb, [[0.112, 0.13], [0.162, 0.113], [0.172, 0.1]], 11, 'fabric_brown', 0x6a5c3c, { sx: 0.9, jit: 0.04, seed: 5 });
    lathe(mb, [[0.111, 0.128], [0.106, 0.17], [0.098, 0.205], [0.07, 0.222], [0, 0.226]], 9, 'fabric_brown', 0x9a8a5e, { sx: SQ + 0.02, jit: 0.03, seed: 6 });
    ring(mb, 0.142, 0.106, 0.018, 0.006, 9, 'fabric_grey', 0x4a3e2a, 0, 0, TAU, SQ + 0.02);
  } },
  hat_crown: { bone: 'head', flatHair: true, build: (mb) => {
    ring(mb, 0.14, 0.106, 0.045, 0.006, 10, 'paper', 0xe8c84a, 0, 0, TAU, SQ + 0.04);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, w = 0.22, R = 0.112;
      const L = [Math.sin(a - w) * R * 0.88, 0.16, Math.cos(a - w) * R], Rr = [Math.sin(a + w) * R * 0.88, 0.16, Math.cos(a + w) * R], T = [Math.sin(a) * (R + 0.006) * 0.88, 0.218 + (i % 2) * 0.012, Math.cos(a) * (R + 0.006)];
      mb.triRaw([L, Rr, T], [[0, 0], [1, 0], [0.5, 1]], 'paper', 0xf0d860);
      mb.triRaw([Rr, L, T], [[0, 0], [1, 0], [0.5, 1]], 'paper', 0xb89a40);
      gem(mb, T[0] * 1.02, T[1] + 0.006, T[2] * 1.02, 0.007, 'plastic_red', i % 2 ? 0x3a6ac8 : 0xc83a2a, 0.2);
    }
  } },
  hat_cone: { bone: 'head', flatHair: true, build: (mb) => {
    // a square rubber base with bevelled edges, an eight-sided cone with two reflective bands, scuffed and dented
    cbox(mb, 0, 0.135, 0, 0.27, 0.022, 0.27, 0.03, 'plastic_white', 0xc84a14);
    lathe(mb, [[0.112, 0.146], [0.088, 0.215], [0.084, 0.228], [0.066, 0.29], [0.063, 0.302], [0.022, 0.43], [0.012, 0.44]], 8, 'plastic_white', 0xf06a24, { jit: 0.025, seed: 9, top: true, shade: (i) => (i === 1 || i === 3 ? 1.25 : 1) });
    lathe(mb, [[0.0885, 0.214], [0.0845, 0.229]], 8, 'plastic_white', 0xf0ece0, { emissive: 0.15 });
    lathe(mb, [[0.0665, 0.289], [0.0635, 0.303]], 8, 'plastic_white', 0xf0ece0, { emissive: 0.15 });
  } },
  hat_tophat: { bone: 'head', flatHair: true, build: (mb) => {
    // a brim curled up at the sides, a crown that flares toward the top, a silk band
    const brim = 11;
    for (let j = 0; j < brim; j++) {
      const a0 = (j / brim) * TAU, a1 = ((j + 1) / brim) * TAU;
      const curl = (a: number) => Math.abs(Math.sin(a)) * 0.018;
      const P = (a: number, r: number, y: number) => [Math.sin(a) * r * 0.92, y, Math.cos(a) * r];
      const i0 = P(a0, 0.1, 0.132), i1 = P(a1, 0.1, 0.132), o0 = P(a0, 0.158, 0.132 + curl(a0)), o1 = P(a1, 0.158, 0.132 + curl(a1));
      mb.quadRaw([i0, o0, o1, i1], [[0, 0], [1, 0], [1, 1], [0, 1]], 'fabric_grey', 0x1a1816);
      mb.quadRaw([i1, o1, o0, i0], [[0, 0], [1, 0], [1, 1], [0, 1]], 'fabric_grey', 0x0e0c0a, 0.6);
    }
    lathe(mb, [[0.1, 0.132], [0.098, 0.2], [0.104, 0.31], [0.106, 0.322]], 10, 'fabric_grey', 0x221e1c, { sx: 0.92, top: true, jit: 0.01 });
    lathe(mb, [[0.1005, 0.137], [0.0995, 0.17]], 10, 'fabric_red', 0x6a1414, { sx: 0.93 });
  } },
  hat_antlers: { bone: 'head', build: (mb) => {
    for (const k of [1, -1]) {
      const b = [k * 0.06, 0.17, -0.01], m1 = [k * 0.13, 0.28, -0.03], t1 = [k * 0.15, 0.38, -0.02], t2 = [k * 0.22, 0.33, -0.05], t3 = [k * 0.09, 0.35, 0.02], m2 = [k * 0.18, 0.31, -0.04];
      rod(mb, b, m1, 0.007, 'metal_grey', 0x9a9488); rod(mb, m1, t1, 0.006, 'metal_grey', 0x9a9488);
      rod(mb, m1, m2, 0.006, 'metal_grey', 0x8a847a); rod(mb, m2, t2, 0.005, 'metal_grey', 0x8a847a); rod(mb, [k * 0.1, 0.23, -0.02], t3, 0.005, 'metal_grey', 0x9a9488);
      // twisted wire knots where the tines join
      gem(mb, m1[0], m1[1], m1[2], 0.011, 'metal_grey', 0x6a645a);
    }
    ring(mb, 0.15, 0.105, 0.012, 0.004, 9, 'metal_grey', 0x7a746a, 0, 0, TAU, SQ + 0.04);
  } },
  hat_halo: { bone: 'head', build: () => { /* glow only */ }, glow: { color: 0x7ff6ff, make: () => new THREE.TorusGeometry(0.11, 0.012, 3, 9).rotateX(Math.PI / 2).translate(0, 0.33, -0.01) } },
  eyes_shades: { bone: 'head', build: (mb) => {
    // a wraparound visor: a faceted lens band, a chrome top bar, arms back over the ears
    lathe(mb, [[0.104, 0.082], [0.112, 0.092], [0.113, 0.106], [0.108, 0.114]], 8, 'plastic_black', 0x101214, { a0: -1.25, a1: 1.25, sx: 0.86 });
    lathe(mb, [[0.11, 0.113], [0.112, 0.119]], 8, 'chrome', 0x8a9aa8, { a0: -0.95, a1: 0.95, sx: 0.86, emissive: 0.3 });
    ring(mb, 0.106, 0.098, 0.008, 0.004, 9, 'plastic_black', 0x1a1a1a, 0, 1.25, TAU - 1.25, 0.86);
  } },
  eyes_cinema: { bone: 'head', build: (mb) => {
    lathe(mb, [[0.1, 0.08], [0.106, 0.086], [0.107, 0.116], [0.102, 0.122]], 8, 'plastic_white', 0xf0ece0, { a0: -1.2, a1: 1.2, sx: 0.86 });
    lathe(mb, [[0.108, 0.088], [0.109, 0.113]], 3, 'plastic_white', 0xe83a3a, { a0: 0.12, a1: 0.72, sx: 0.86, emissive: 0.6 });
    lathe(mb, [[0.108, 0.088], [0.109, 0.113]], 3, 'plastic_white', 0x3ad8e8, { a0: -0.72, a1: -0.12, sx: 0.86, emissive: 0.6 });
    ring(mb, 0.104, 0.098, 0.01, 0.004, 9, 'plastic_white', 0xe8e4d8, 0, 1.2, TAU - 1.2, 0.86);
  } },
  eyes_goggles: { bone: 'head', build: (mb) => {
    for (const k of [1, -1]) {
      // eight-sided brass-rimmed cups, smoked lenses set back in them
      mb.push().translate(k * 0.04, 0.1, 0.098).rotateX(Math.PI / 2).rotateY(Math.PI / 8);
      lathe(mb, [[0.03, 0], [0.032, -0.012], [0.03, -0.026], [0.024, -0.028]], 8, 'metal_dark', 0x4a5a4a, { jit: 0.03, seed: k + 3 });
      lathe(mb, [[0.024, -0.024], [0, -0.022]], 8, 'glass_dark', 0x223022, { emissive: 0.25 });
      mb.pop();
    }
    rod(mb, [-0.012, 0.1, 0.122], [0.012, 0.1, 0.122], 0.004, 'metal_dark', 0x3a3a3a);
    ring(mb, 0.1, 0.1, 0.02, 0.006, 10, 'leather_black', 0x2a2420, 0, 0, TAU, 0.82);
  } },
  eyes_monocle: { bone: 'head', build: (mb) => {
    mb.push().translate(0.04, 0.1, 0.104).rotateX(Math.PI / 2).rotateY(Math.PI / 8);
    lathe(mb, [[0.026, 0], [0.028, -0.004], [0.026, -0.008]], 8, 'metal_brass', 0xc8a04a);
    lathe(mb, [[0.0235, -0.005], [0, -0.0045]], 8, 'glass', 0xc8e0e8, { emissive: 0.5 });
    mb.pop();
    // the crack, and the chain looping down to a pocket
    rod(mb, [0.03, 0.108, 0.109], [0.05, 0.094, 0.109], 0.0012, 'metal_grey', 0x2a2a2a);
    let prev = [0.066, 0.09, 0.104];
    for (let i = 1; i <= 5; i++) { const t = i / 5; const p = [0.066 + t * 0.03, 0.09 - t * 0.11 - Math.sin(t * Math.PI) * 0.02, 0.104 - t * 0.04]; rod(mb, prev, p, 0.0022, 'metal_brass', 0xc8a04a); prev = p; }
  } },
  eyes_led: { bone: 'head', build: (mb) => {
    lathe(mb, [[0.1, 0.08], [0.11, 0.088], [0.112, 0.112], [0.104, 0.12]], 8, 'plastic_black', 0x101010, { a0: -1.2, a1: 1.2, sx: 0.86 });
    lathe(mb, [[0.1125, 0.096], [0.1135, 0.104]], 10, 'led_red', 0xff3a4a, { a0: -0.95, a1: 0.95, sx: 0.86, emissive: 1.6 });
    ring(mb, 0.1, 0.1, 0.022, 0.005, 9, 'plastic_black', 0x161616, 0, 0, TAU, 0.82);
  } },
  face_bandana: { bone: 'head', build: (mb) => {
    ring(mb, 0.05, 0.104, 0.05, 0.006, 10, 'fabric_red', 0x8a2a2a, 0, 0, TAU, 0.82);
    shell(mb, -1.1, 1.1, 0.0, 0.075, 0.012, 8, 3, 'fabric_red', 0x9a3030, undefined, 0.006);
    // the point hanging under the chin, and the knot behind
    mb.triRaw([[-0.07, 0.0, 0.11], [0.07, 0.0, 0.11], [0.006, -0.065, 0.098]], [[0, 1], [1, 1], [0.5, 0]], 'fabric_red', 0x8a2828);
    mb.triRaw([[0.07, 0.0, 0.11], [-0.07, 0.0, 0.11], [0.006, -0.065, 0.098]], [[0, 1], [1, 1], [0.5, 0]], 'fabric_red', 0x5a1818, 0.6);
    gem(mb, 0, 0.055, -0.11, 0.016, 'fabric_red', 0x7a2222);
    for (const k of [1, -1]) rod(mb, [0, 0.05, -0.11], [k * 0.02, -0.02, -0.12], 0.006, 'fabric_red', 0x7a2424);
  } },
  face_resp: { bone: 'head', build: (mb) => {
    // a rubber snout with a chamfered intake, two hex filters canted out, a strap
    mb.push().translate(0, 0.028, 0.104).rotateX(Math.PI / 2);
    lathe(mb, [[0.044, 0], [0.042, -0.018], [0.034, -0.032], [0.02, -0.036]], 8, 'rubber_black', 0x3a3e40, { jit: 0.02, top: false });
    lathe(mb, [[0.02, -0.036], [0, -0.035]], 8, 'grate', 0x5a6064);
    mb.pop();
    shell(mb, -0.8, 0.8, -0.01, 0.07, 0.006, 6, 3, 'rubber_black', 0x2e3234);
    for (const k of [1, -1]) {
      mb.push().translate(k * 0.052, 0.025, 0.112).rotateY(k * 0.55).rotateX(Math.PI / 2 + 0.4);
      lathe(mb, [[0.022, 0], [0.024, -0.008], [0.024, -0.03], [0.02, -0.036]], 6, 'metal_grey', 0x6a7074);
      lathe(mb, [[0.02, -0.036], [0, -0.035]], 6, 'grate', 0x4a5054);
      mb.pop();
    }
    ring(mb, 0.065, 0.102, 0.012, 0.004, 10, 'rubber_black', 0x222424, 0, 0, TAU, 0.82);
  } },
  face_muzzle: { bone: 'head', build: (mb) => {
    ring(mb, 0.058, 0.108, 0.01, 0.004, 10, 'metal_grey', 0x6a6460, 0, 0, TAU, 0.82);
    for (let i = -3; i <= 3; i++) { const a = i * 0.24; rod(mb, [Math.sin(a) * 0.11, 0.058, Math.cos(a) * 0.11], [Math.sin(a) * 0.09, -0.005, Math.cos(a) * 0.105], 0.004, 'metal_grey', 0x7a746e); }
    ring(mb, 0.0, 0.1, 0.008, 0.004, 10, 'metal_grey', 0x6a6460, 0, 0, TAU, 0.82);
    ring(mb, -0.004, 0.1, 0.008, 0.004, 6, 'metal_grey', 0x5a544e, 0, -0.8, 0.8, 0.9);
    for (const k of [1, -1]) cbox(mb, k * 0.088, 0.058, 0.06, 0.012, 0.016, 0.01, 0.003, 'metal_rusty', 0x8a6a4a);
  } },
  face_goalie: { bone: 'head', build: (mb) => {
    // 10 columns across the face, 8 rows from chin to brow: eye slots and breathing holes are left open, chevrons painted red
    shell(mb, -1.25, 1.25, -0.03, 0.2, 0.014, 10, 8, 'plastic_white', 0xe8e4d8, (i, j) => {
      if (j === 5 && (i === 2 || i === 3 || i === 6 || i === 7)) return -1;
      if ((j === 1 || j === 2) && (i === 4 || i === 5) && (i + j) % 2) return -1;
      if (j === 3 && (i === 1 || i === 8)) return 0xa82a22;
      return j === 0 ? 0xd8d4c8 : 0xe8e4d8;
    }, 0.004);
  } },
  face_smile: { bone: 'head', build: (mb) => {
    // a polished plate with eye slits and a painted grin (the grin curves up at the corners)
    shell(mb, -1.2, 1.2, -0.04, 0.2, 0.012, 12, 12, 'chrome', 0xb8bcc0, (i, j) => {
      if (j === 8 && (i === 3 || i === 4 || i === 7 || i === 8)) return 0x050505;
      const grin = Math.round(2.6 + Math.pow((i - 5.5) / 4.2, 2) * 2.2);
      if (i >= 2 && i <= 9 && j === grin) return 0x1a0a0a;
      return 0xb8bcc0;
    }, 0.003);
  } },
  // neck-local: y 0 at the base of the neck, the collarbones a little below
  neck_tags: { bone: 'neck', build: (mb) => {
    ring(mb, 0.02, 0.07, 0.005, 0.003, 10, 'metal_grey', 0xa8acb0);
    rod(mb, [0.03, 0.01, 0.065], [0.0, -0.09, 0.115], 0.002, 'metal_grey', 0xa8acb0);
    rod(mb, [-0.03, 0.01, 0.065], [0.0, -0.09, 0.115], 0.002, 'metal_grey', 0xa8acb0);
    mb.push().translate(0.006, -0.1, 0.118).rotateZ(0.12); cbox(mb, 0, -0.02, 0, 0.026, 0.04, 0.004, 0.006, 'chrome', 0xc8ccd0, 0.2); mb.pop();
    mb.push().translate(-0.008, -0.095, 0.122).rotateZ(-0.1); cbox(mb, 0, -0.02, 0, 0.026, 0.04, 0.004, 0.006, 'chrome', 0xb0b4b8); mb.pop();
  } },
  neck_scarf: { bone: 'neck', build: (mb) => {
    // two loose wraps and a knot, one end hanging down the chest
    lathe(mb, [[0.078, -0.06], [0.088, -0.045], [0.086, -0.022], [0.08, -0.012], [0.084, 0.004], [0.08, 0.02], [0.072, 0.03]], 9, 'fabric_blue', 0x4a6a8a, { jit: 0.05, seed: 11, sx: 1.05 });
    gem(mb, 0.035, -0.035, 0.09, 0.022, 'fabric_blue', 0x3e5e7e);
    mb.push().translate(0.04, -0.04, 0.1).rotateZ(0.08).rotateX(-0.12);
    cbox(mb, 0, -0.14, 0, 0.055, 0.22, 0.016, 0.006, 'fabric_blue', 0x3e5e7e);
    cbox(mb, 0, -0.262, 0.001, 0.056, 0.022, 0.017, 0.004, 'fabric_red', 0x8a2a2a);
    for (let i = 0; i < 5; i++) rod(mb, [-0.022 + i * 0.011, -0.272, 0], [-0.024 + i * 0.012, -0.3, 0.002], 0.002, 'fabric_red', 0x7a2424); // fringe
    mb.pop();
  } },
  neck_collar: { bone: 'neck', build: (mb) => {
    lathe(mb, [[0.064, 0.004], [0.068, 0.01], [0.068, 0.03], [0.064, 0.036]], 9, 'leather_black', 0x2a2a2a, { jit: 0.01 });
    cbox(mb, 0, 0.02, 0.07, 0.042, 0.04, 0.022, 0.006, 'metal_dark', 0x3a3a3a);
    cbox(mb, 0, 0.03, 0.082, 0.012, 0.009, 0.004, 0.002, 'led_red', 0xff2a2a, 2);
    for (const k of [1, -1]) gem(mb, k * 0.014, 0.012, 0.082, 0.004, 'metal_grey', 0x8a8e92);
  } },
  // chest-local, moved out to the back surface (z ≤ 0 points away from the spine)
  back_cable: { bone: 'chest', build: (mb) => {
    cbox(mb, 0, 0.21, -0.01, 0.06, 0.05, 0.04, 0.01, 'metal_dark', 0x3a3e40);
    cbox(mb, 0, 0.21, -0.031, 0.03, 0.03, 0.006, 0.005, 'led_green', 0x3aff8a, 1.2);
    const pts = [[0, 0.21, -0.03], [0.02, 0.12, -0.09], [0.05, -0.05, -0.13], [0.08, -0.3, -0.16], [0.1, -0.55, -0.14], [0.14, -0.72, -0.1]];
    for (let i = 0; i + 1 < pts.length; i++) { rod(mb, pts[i], pts[i + 1], 0.013, 'rubber_black', 0x2a2e30); gem(mb, pts[i + 1][0], pts[i + 1][1], pts[i + 1][2], 0.016, 'rubber_black', 0x22262a); }
    cbox(mb, 0.14, -0.74, -0.1, 0.035, 0.05, 0.035, 0.008, 'metal_rusty', 0x8a6a4a);
  } },
  back_tank: { bone: 'chest', build: (mb) => {
    // an eight-sided cylinder with domed facets, a valve, a gauge, straps
    lathe(mb, [[0, -0.21], [0.048, -0.2], [0.066, -0.18], [0.068, 0.12], [0.05, 0.155], [0.022, 0.168], [0.014, 0.18]], 8, 'metal_sheet', 0x5a8a9a, { cz: -0.085, jit: 0.015, top: true });
    cbox(mb, 0, 0.195, -0.085, 0.03, 0.03, 0.03, 0.006, 'metal_brass', 0xc8a04a);
    rod(mb, [0, 0.21, -0.085], [0.03, 0.235, -0.085], 0.005, 'metal_brass', 0xb8903a);
    cbox(mb, 0, -0.02, -0.155, 0.04, 0.12, 0.006, 0.006, 'plastic_white', 0xe8e4d8);
    cbox(mb, 0, 0.0, -0.159, 0.03, 0.02, 0.004, 0.003, 'led_green', 0x3ae8ff, 1.2);
    for (const y of [0.05, -0.15]) cbox(mb, 0, y, -0.02, 0.2, 0.025, 0.035, 0.006, 'leather_black', 0x2a2420);
  } },
  back_wings: { bone: 'chest', build: (mb) => {
    for (const k of [1, -1]) {
      plate(mb, k * 0.05, -0.03, k * 0.42, -0.22, 0.02, 0.3, 'metal_sheet', 0xb8bcc0);
      plate(mb, k * 0.07, -0.04, k * 0.36, -0.2, -0.18, 0.02, 'metal_sheet', 0xa8acb0);
      plate(mb, k * 0.09, -0.05, k * 0.28, -0.16, -0.3, -0.16, 'metal_sheet', 0x989ca0);
      for (let i = 0; i < 4; i++) gem(mb, k * (0.12 + i * 0.08), 0.28 - i * 0.03, -0.06 - i * 0.04, 0.008, 'metal_rusty', 0x8a6a4a);
    }
    cbox(mb, 0, 0.12, -0.02, 0.14, 0.2, 0.03, 0.012, 'metal_dark', 0x4a4e52);
  } },
};

// ------------------------------------------------------------------ jumpsuit variants
const SUIT_TEX: Record<string, string> = { suit_stripe: 'c_jsuit_stripe', suit_hazard: 'c_jsuit_hazard', suit_circuit: 'c_jsuit_circuit' };
const hash = (x: number, y: number, s: number) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 1442695041, 1274126177); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000; };
type Pat = (S: Surf, x: number, y: number, part: string) => number | null;
const PATTERNS: Record<string, Pat> = {
  c_jsuit_stripe: (_S, _x, y) => (Math.floor(y / 3) % 2 ? 0x1c1a18 : null),
  c_jsuit_hazard: (S, x, y, part) => {
    const lower = part === 'leg' ? S.yAt(y) < -0.45 : part === 'arm' ? S.yAt(y) < -0.25 : part === 'torso' && S.yAt(y) < 0.93;
    return lower && Math.floor((x + y) / 3) % 2 ? 0x17150f : null;
  },
  c_jsuit_circuit: (_S, x, y) => {
    const gx = x % 9 === 0 && hash(x >> 3, y >> 2, 3) > 0.45, gy = y % 7 === 0 && hash(x >> 2, y >> 3, 5) > 0.5;
    if (gx || gy) return 0x3ae8f0;
    return hash(x, y, 9) > 0.985 ? 0x8afcff : null;
  },
};
/** the zones the number stencils live in (left breast patch, the back), which patterns leave alone */
const keepOut = (S: Surf, x: number, y: number) => {
  const yy = S.yAt(y), d = S.deg(x);
  return (yy > 1.31 && yy < 1.41 && d > -40 && d < -18) || (yy > 1.22 && yy < 1.43 && Math.abs(Math.abs(d) - 180) < 42);
};
let suitsDefined = false;
function defineSuits() {
  if (suitsDefined) return true;
  const base = garment('c_jumpsuit');
  if (!base) return false;
  suitsDefined = true;
  for (const tex of Object.values(SUIT_TEX)) {
    const pat = PATTERNS[tex];
    const over = (part: string, fn?: (S: Surf, P: Paint) => void) => (S: Surf, P: Paint) => {
      fn?.(S, P);
      const sl = P.lp.sleeve || 'long';
      for (let y = 0; y < S.h; y++) {
        const yy = S.yAt(y);
        if (part === 'torso' && (yy > 1.47 || yy < P.sh.topHem)) continue;
        if (part === 'arm' && (sl === 'none' || (sl === 'short' && yy < -0.2) || yy < -0.52)) continue;
        for (let x = 0; x < S.w; x++) {
          if (part === 'torso' && keepOut(S, x, y)) continue;
          const c = pat(S, x, y, part);
          if (c != null) S.pc.blend(x, y, c, 0.82);
        }
      }
    };
    defGarment(tex, {
      ...base,
      torso: over('torso', base.torso), pelvis: over('pelvis', base.pelvis), arm: over('arm', base.arm), leg: over('leg', base.leg),
    }, {
      top: { sleeve: 'long', thick: 0.008, hem: 0.93, collar: 'shirt', tuck: true },
      leg: { kind: 'pants', thick: 0.01, flare: 0.012 },
    });
  }
  return true;
}

type CosApp = { cos?: string[] };
/** dress-time hook: re-dye or re-weave the jumpsuit, flatten the hair under a cosmetic hat */
export function cosmeticOutfit(o: Outfit, app: CosApp): Outfit {
  const cos = app.cos;
  if (!cos?.length) return o;
  let out = o;
  for (const k of cos) {
    const def = COSMETIC.get(k);
    if (!def) continue;
    if (def.slot === 'suit' && k !== 'suit_std') {
      const jump = (lp?: { tex: string; item?: string }) => !!lp && (lp.tex === 'c_jumpsuit' || lp.item === 'prison_jumpsuit');
      if (!jump(out.torso) && !jump(out.legs)) continue;
      const tex = SUIT_TEX[k] && defineSuits() ? SUIT_TEX[k] : 'c_jumpsuit';
      out = { ...out };
      if (jump(out.torso)) out.torso = { ...out.torso!, tex, color: def.color };
      if (jump(out.legs)) out.legs = { ...out.legs!, tex, color: def.color };
    } else if (def.slot === 'hat' && PIECES[k]?.flatHair && !out.head) {
      out = { ...out, hatFlat: true } as Outfit;
    }
  }
  return out;
}

/** the hazmat suit's hood and visor: eyewear and face pieces would sit inside it */
const hooded = (o: Outfit) => o.torso?.tex === 'c_hazmat';
const blocked = (slot: CosSlot, o: Outfit) => (slot === 'hat' && !!o.head) || (slot === 'eyes' && (!!o.eyes || hooded(o))) || (slot === 'face' && (!!o.face || hooded(o))) || (slot === 'back' && !!o.back);

const GEO = new Map<string, THREE.BufferGeometry>();
const GLOW = new Map<string, { geo: THREE.BufferGeometry; mat: THREE.MeshBasicMaterial }>();
function geoOf(k: string): THREE.BufferGeometry | null {
  let g = GEO.get(k);
  if (g === undefined) {
    const p = PIECES[k];
    const mb = new ModelBuilder();
    p?.build(mb);
    g = mb.vertexCount ? mb.build() : (null as any);
    GEO.set(k, g!);
  }
  return g || null;
}
/** the geometry of one piece in its bone's unit space (thumbnails) */
export function cosmeticGeometry(k: string): { geo: THREE.BufferGeometry | null; glow: THREE.BufferGeometry | null; bone: BoneName } | null {
  const p = PIECES[k];
  if (!p) return null;
  return { geo: geoOf(k), glow: p.glow ? glowOf(k).geo : null, bone: p.bone };
}
function glowOf(k: string) {
  let g = GLOW.get(k);
  if (!g) { const p = PIECES[k].glow!; g = { geo: p.make(), mat: new THREE.MeshBasicMaterial({ color: p.color, fog: false }) }; GLOW.set(k, g); }
  return g;
}

interface RigLike { app: CosApp; bones: Record<string, THREE.Object3D>; dims: Dims }
const WORN = new WeakMap<object, { key: string; meshes: THREE.Object3D[] }>();
/** hang the worn pieces on the rig's bones (cheap when nothing changed) */
export function syncCosmetics(rig: RigLike, o: Outfit, mat: THREE.Material) {
  const d = rig.dims;
  const list = (rig.app.cos || []).filter((k) => PIECES[k] && !blocked(COSMETIC.get(k)!.slot, o));
  const hood = hooded(o);
  const key = list.length ? list.join(',') + '|' + d.s.toFixed(3) + '|' + d.headS.toFixed(3) + '|' + d.mass.toFixed(2) + (hood ? '|h' : '') : '';
  const cur = WORN.get(rig);
  if ((cur?.key ?? '') === key) return;
  for (const m of cur?.meshes || []) m.removeFromParent();
  const meshes: THREE.Object3D[] = [];
  for (const k of list) {
    const p = PIECES[k];
    const bone = rig.bones[p.bone];
    if (!bone) continue;
    // over the hazmat hood a head piece sits a size up (the hood adds a couple of centimetres all round)
    const sc = p.bone === 'head' ? d.s * d.headS * (hood ? 1.16 : 1) : d.s;
    const place = (m: THREE.Object3D) => {
      m.scale.setScalar(sc);
      if (p.bone === 'chest') { m.position.set(0, 0, -(0.1 * d.mass + 0.012) * d.s); m.scale.set(sc * (0.85 + 0.15 * d.mass), sc, sc); }
      if (p.bone === 'head' && hood) m.position.set(0, 0.012 * d.s, -0.008 * d.s);
      if (p.bone === 'neck') m.scale.set(sc * (0.9 + 0.1 * d.mass), sc, sc * (0.9 + 0.1 * d.mass));
      m.name = 'cosmetic:' + k;
      bone.add(m);
      meshes.push(m);
    };
    const g = geoOf(k);
    if (g) { const m = new THREE.Mesh(g, mat); m.castShadow = true; place(m); }
    if (p.glow) { const gl = glowOf(k); place(new THREE.Mesh(gl.geo, gl.mat)); }
  }
  WORN.set(rig, { key, meshes });
}
