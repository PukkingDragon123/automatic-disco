// ANATOMY LIBRARY: heads. A skull is blocked in like the trunk, as hand-written cross-sections from the occiput to
// the nose plane, seven points per half ring (crown, brow or temporal line, orbit or cheek, zygomatic arch, upper
// lip, lip line, palate), creased on its landmarks: the brow shelf, the lip line, the rim of the nose plane, the
// edge of a beak. SKULLS holds families (a heavy beaked browser, a long low grazer, a plated brute); species tweak
// them. A jaw hangs on the jaw bone under the lip line; eyeballs turn on the eye bones and are painted from their
// own geometry (wet cornea, drawn iris with spokes, a slit, bar, round or W pupil); upper lids ride the lid bones;
// rows of small slit eyes and sensory pits are drawn into sockets on the skull.
import type { V3, Wt } from '../kit';
import { RAMPS } from '../../art/palette';
import { newCM, tube, sheetGrid, creaseRow, type Ring } from '../cage';
import { type Piece, type Chart, type Body } from './core';
import { trunk, type TrunkPiece, type Station } from './trunk';
import { Px, RP, cl } from './paint';

const TAU = Math.PI * 2;
type Paint = (c: Chart, p: Piece, b: Body) => void;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** a skull family: stations z (x head length), centre line y (x head height), half rings of seven points (x head
 *  width, x head height) from the crown down the +x side to the palate's midline; creases by station and point */
export interface Skull {
  z: number[]; yc: number[]; half: number[][][]; rows?: { at: number; s: number; ink?: boolean }[]; cols?: { j: number; a: number; b: number; s: number; ink?: boolean }[]; capS?: boolean;
  /** where the family seats its parts: the eye (station, ring point, both fractional; how far the eye turns forward
   *  0 lateral .. 1 binocular), the jaw (hinge and chin [y x hh, z x hl], width x hw, depth x hh), the ear root
   *  (station, ring point), the station where the muzzle starts (the stop) */
  seat?: { eye: [number, number, number]; hinge: [number, number]; chin: [number, number]; jaw: [number, number]; ear: [number, number]; stop: number };
}
export const SKULLS: Record<string, Skull> = {
  /** a heavy browsing skull: a domed crown, a brow shelf over a deep orbit, broad cheeks, a short deep muzzle ending in
   *  a beak; the lip line runs straight back to the jaw hinge */
  browser: {
    z: [-0.42, -0.24, -0.06, 0.1, 0.24, 0.38, 0.5, 0.6],
    yc: [0.12, 0.18, 0.2, 0.18, 0.12, 0.06, 0.0, -0.06],
    half: [
      [[0, 0.5], [0.3, 0.46], [0.46, 0.3], [0.5, 0.04], [0.46, -0.22], [0.36, -0.36], [0, -0.42]],
      [[0, 0.62], [0.4, 0.56], [0.6, 0.36], [0.66, 0.04], [0.6, -0.26], [0.44, -0.44], [0, -0.5]],
      [[0, 0.66], [0.44, 0.62], [0.66, 0.4], [0.74, 0.02], [0.66, -0.3], [0.48, -0.46], [0, -0.52]],
      [[0, 0.6], [0.46, 0.6], [0.62, 0.46], [0.66, 0.0], [0.62, -0.32], [0.46, -0.44], [0, -0.5]],
      [[0, 0.46], [0.36, 0.42], [0.52, 0.22], [0.56, -0.06], [0.54, -0.32], [0.42, -0.42], [0, -0.46]],
      [[0, 0.38], [0.28, 0.34], [0.44, 0.16], [0.48, -0.08], [0.46, -0.3], [0.36, -0.38], [0, -0.42]],
      [[0, 0.3], [0.2, 0.26], [0.34, 0.1], [0.38, -0.1], [0.36, -0.28], [0.28, -0.34], [0, -0.38]],
      [[0, 0.18], [0.12, 0.15], [0.2, 0.04], [0.22, -0.12], [0.2, -0.26], [0.14, -0.3], [0, -0.32]],
    ],
    rows: [{ at: 3, s: 1, ink: true }, { at: 5, s: 2, ink: true }],
    cols: [{ j: 1, a: 2, b: 4, s: 2, ink: true }, { j: 5, a: 3, b: 7, s: 2, ink: true }],
  },
  /** a long low grazing skull: a narrow crown, eyes high on the sides, a long flat bridge, a broad soft muzzle with
   *  nostrils on top, a long lip line */
  grazer: {
    z: [-0.36, -0.2, -0.04, 0.12, 0.3, 0.5, 0.68, 0.8],
    yc: [0.08, 0.14, 0.16, 0.12, 0.05, -0.01, -0.04, -0.06],
    half: [
      [[0, 0.44], [0.26, 0.4], [0.4, 0.26], [0.44, 0.02], [0.4, -0.2], [0.3, -0.34], [0, -0.4]],
      [[0, 0.52], [0.32, 0.48], [0.5, 0.32], [0.54, 0.04], [0.5, -0.24], [0.36, -0.4], [0, -0.46]],
      [[0, 0.52], [0.36, 0.5], [0.54, 0.34], [0.56, 0.0], [0.5, -0.28], [0.38, -0.42], [0, -0.48]],
      [[0, 0.44], [0.3, 0.42], [0.44, 0.26], [0.48, -0.02], [0.46, -0.3], [0.34, -0.42], [0, -0.46]],
      [[0, 0.36], [0.22, 0.34], [0.34, 0.18], [0.38, -0.04], [0.38, -0.28], [0.3, -0.38], [0, -0.42]],
      [[0, 0.32], [0.18, 0.3], [0.3, 0.14], [0.34, -0.06], [0.34, -0.26], [0.26, -0.34], [0, -0.38]],
      [[0, 0.32], [0.2, 0.3], [0.32, 0.12], [0.36, -0.08], [0.34, -0.24], [0.26, -0.3], [0, -0.32]],
      [[0, 0.22], [0.16, 0.2], [0.26, 0.06], [0.28, -0.1], [0.26, -0.2], [0.18, -0.24], [0, -0.26]],
    ],
    rows: [{ at: 2, s: 1, ink: true }],
    cols: [{ j: 5, a: 3, b: 7, s: 2, ink: true }],
  },
  /** a plated brute: a low flat skull under a heavy brow shelf, wide zygomatic flanges, a blunt square muzzle */
  brute: {
    z: [-0.4, -0.22, -0.04, 0.12, 0.26, 0.4, 0.52, 0.6],
    yc: [0.1, 0.14, 0.16, 0.12, 0.06, 0.0, -0.04, -0.06],
    half: [
      [[0, 0.46], [0.34, 0.42], [0.5, 0.26], [0.54, 0.0], [0.5, -0.24], [0.38, -0.38], [0, -0.44]],
      [[0, 0.54], [0.44, 0.52], [0.66, 0.34], [0.72, 0.02], [0.64, -0.28], [0.46, -0.44], [0, -0.5]],
      [[0, 0.56], [0.5, 0.56], [0.76, 0.36], [0.82, 0.0], [0.7, -0.3], [0.5, -0.46], [0, -0.52]],
      [[0, 0.5], [0.5, 0.54], [0.7, 0.4], [0.72, 0.0], [0.64, -0.3], [0.48, -0.44], [0, -0.5]],
      [[0, 0.38], [0.4, 0.38], [0.56, 0.22], [0.6, -0.04], [0.58, -0.3], [0.44, -0.42], [0, -0.46]],
      [[0, 0.34], [0.34, 0.32], [0.5, 0.16], [0.54, -0.06], [0.52, -0.28], [0.4, -0.38], [0, -0.42]],
      [[0, 0.3], [0.3, 0.28], [0.44, 0.12], [0.48, -0.08], [0.46, -0.26], [0.36, -0.34], [0, -0.38]],
      [[0, 0.22], [0.24, 0.2], [0.36, 0.06], [0.4, -0.1], [0.38, -0.24], [0.28, -0.3], [0, -0.32]],
    ],
    rows: [{ at: 3, s: 2, ink: true }],
    cols: [{ j: 1, a: 1, b: 4, s: 2, ink: true }, { j: 3, a: 1, b: 4, s: 1.5, ink: true }, { j: 5, a: 3, b: 7, s: 2, ink: true }],
    seat: { eye: [3.0, 2.0, 0.25], hinge: [-0.28, -0.08], chin: [-0.5, 0.5], jaw: [0.46, 0.3], ear: [1.2, 1.4], stop: 4 },
  },
  // ---- the families of ordinary vertebrates (the gene-built and bestiary species)
  /** a cat: a domed braincase, flaring cheekbones, big forward orbits under a brow, a short broad muzzle with whisker
   *  pads, the nose plane small and high */
  felid: {
    z: [-0.42, -0.26, -0.08, 0.06, 0.18, 0.28, 0.37, 0.44],
    yc: [0.04, 0.12, 0.16, 0.14, 0.06, 0.0, -0.05, -0.08],
    half: [
      [[0, 0.42], [0.3, 0.38], [0.44, 0.22], [0.48, 0], [0.44, -0.2], [0.32, -0.32], [0, -0.36]],
      [[0, 0.58], [0.42, 0.52], [0.58, 0.3], [0.62, 0], [0.56, -0.24], [0.4, -0.38], [0, -0.42]],
      [[0, 0.58], [0.4, 0.55], [0.64, 0.34], [0.8, 0.0], [0.72, -0.26], [0.48, -0.4], [0, -0.44]],
      [[0, 0.5], [0.32, 0.53], [0.56, 0.34], [0.74, 0.02], [0.66, -0.24], [0.46, -0.38], [0, -0.42]],
      [[0, 0.34], [0.24, 0.34], [0.42, 0.18], [0.52, -0.04], [0.52, -0.24], [0.4, -0.36], [0, -0.4]],
      [[0, 0.26], [0.2, 0.25], [0.38, 0.1], [0.48, -0.08], [0.48, -0.24], [0.36, -0.34], [0, -0.36]],
      [[0, 0.2], [0.16, 0.19], [0.32, 0.06], [0.4, -0.1], [0.38, -0.24], [0.28, -0.3], [0, -0.32]],
      [[0, 0.13], [0.1, 0.12], [0.2, 0.02], [0.24, -0.1], [0.22, -0.2], [0.15, -0.24], [0, -0.26]],
    ],
    rows: [{ at: 3, s: 1, ink: true }],
    cols: [{ j: 5, a: 4, b: 7, s: 2, ink: true }, { j: 3, a: 1, b: 3, s: 1, ink: false }],
    seat: { eye: [3.05, 1.45, 0.78], hinge: [-0.26, -0.04], chin: [-0.46, 0.36], jaw: [0.5, 0.2], ear: [1.1, 1.1], stop: 4 },
  },
  /** a dog or wolf: a long braincase with a sagittal ridge, a clear stop, a long narrowing muzzle */
  canid: {
    z: [-0.4, -0.24, -0.08, 0.06, 0.2, 0.38, 0.54, 0.66],
    yc: [0.06, 0.14, 0.16, 0.12, 0.04, -0.02, -0.06, -0.08],
    half: [
      [[0, 0.4], [0.28, 0.36], [0.4, 0.2], [0.44, 0], [0.4, -0.2], [0.3, -0.3], [0, -0.34]],
      [[0, 0.56], [0.36, 0.52], [0.52, 0.3], [0.56, 0], [0.5, -0.24], [0.36, -0.36], [0, -0.4]],
      [[0, 0.56], [0.34, 0.54], [0.54, 0.32], [0.66, 0.0], [0.6, -0.26], [0.42, -0.38], [0, -0.42]],
      [[0, 0.46], [0.28, 0.48], [0.46, 0.3], [0.6, 0.0], [0.56, -0.24], [0.4, -0.36], [0, -0.4]],
      [[0, 0.32], [0.2, 0.32], [0.34, 0.16], [0.4, -0.04], [0.4, -0.22], [0.3, -0.32], [0, -0.36]],
      [[0, 0.26], [0.16, 0.25], [0.28, 0.12], [0.32, -0.06], [0.32, -0.22], [0.24, -0.28], [0, -0.3]],
      [[0, 0.22], [0.14, 0.21], [0.24, 0.1], [0.28, -0.06], [0.28, -0.2], [0.2, -0.25], [0, -0.27]],
      [[0, 0.16], [0.1, 0.15], [0.18, 0.06], [0.2, -0.06], [0.19, -0.16], [0.13, -0.2], [0, -0.22]],
    ],
    rows: [{ at: 3, s: 1, ink: true }],
    cols: [{ j: 5, a: 4, b: 7, s: 2, ink: true }, { j: 0, a: 0, b: 3, s: 1 }],
    seat: { eye: [3.0, 1.65, 0.45], hinge: [-0.24, -0.06], chin: [-0.36, 0.58], jaw: [0.42, 0.16], ear: [1.1, 1.2], stop: 4 },
  },
  /** a bear: a broad domed forehead, wide cheeks, small eyes, a dished stop, a heavy straight muzzle */
  ursid: {
    z: [-0.4, -0.24, -0.06, 0.08, 0.22, 0.36, 0.5, 0.6],
    yc: [0.08, 0.18, 0.22, 0.16, 0.04, -0.02, -0.05, -0.07],
    half: [
      [[0, 0.44], [0.32, 0.4], [0.46, 0.22], [0.5, 0], [0.46, -0.22], [0.34, -0.34], [0, -0.38]],
      [[0, 0.62], [0.42, 0.58], [0.6, 0.34], [0.66, 0], [0.6, -0.26], [0.42, -0.4], [0, -0.44]],
      [[0, 0.64], [0.42, 0.62], [0.64, 0.36], [0.74, 0.0], [0.66, -0.28], [0.46, -0.42], [0, -0.46]],
      [[0, 0.52], [0.32, 0.52], [0.54, 0.32], [0.64, 0.0], [0.6, -0.26], [0.44, -0.4], [0, -0.44]],
      [[0, 0.34], [0.24, 0.34], [0.4, 0.18], [0.46, -0.04], [0.46, -0.24], [0.36, -0.36], [0, -0.4]],
      [[0, 0.3], [0.22, 0.29], [0.36, 0.14], [0.42, -0.06], [0.42, -0.24], [0.32, -0.34], [0, -0.36]],
      [[0, 0.26], [0.2, 0.25], [0.32, 0.12], [0.38, -0.06], [0.38, -0.22], [0.28, -0.3], [0, -0.32]],
      [[0, 0.2], [0.14, 0.19], [0.24, 0.08], [0.28, -0.06], [0.27, -0.18], [0.2, -0.24], [0, -0.26]],
    ],
    rows: [{ at: 3, s: 1, ink: true }],
    cols: [{ j: 5, a: 4, b: 7, s: 2, ink: true }],
    seat: { eye: [3.0, 1.75, 0.4], hinge: [-0.26, -0.04], chin: [-0.4, 0.52], jaw: [0.5, 0.2], ear: [1.0, 1.0], stop: 4 },
  },
  /** a deer or antelope: a narrow crown, eyes set high and lateral, a long flat bridge, deep cheeks over the grinding
   *  muscles, a broad soft muzzle */
  cervid: {
    z: [-0.36, -0.2, -0.04, 0.12, 0.3, 0.5, 0.68, 0.8],
    yc: [0.08, 0.16, 0.18, 0.12, 0.04, -0.02, -0.06, -0.08],
    half: [
      [[0, 0.42], [0.26, 0.38], [0.38, 0.22], [0.42, 0], [0.38, -0.2], [0.28, -0.3], [0, -0.34]],
      [[0, 0.54], [0.32, 0.5], [0.48, 0.3], [0.52, 0], [0.48, -0.26], [0.34, -0.38], [0, -0.42]],
      [[0, 0.52], [0.34, 0.5], [0.54, 0.34], [0.56, 0.0], [0.5, -0.3], [0.36, -0.42], [0, -0.46]],
      [[0, 0.42], [0.28, 0.4], [0.42, 0.24], [0.46, -0.04], [0.46, -0.3], [0.34, -0.42], [0, -0.46]],
      [[0, 0.34], [0.2, 0.32], [0.32, 0.16], [0.34, -0.06], [0.34, -0.26], [0.26, -0.36], [0, -0.4]],
      [[0, 0.28], [0.16, 0.26], [0.26, 0.12], [0.28, -0.08], [0.28, -0.24], [0.22, -0.3], [0, -0.32]],
      [[0, 0.26], [0.18, 0.25], [0.28, 0.12], [0.3, -0.08], [0.3, -0.22], [0.22, -0.28], [0, -0.3]],
      [[0, 0.18], [0.14, 0.17], [0.22, 0.06], [0.24, -0.08], [0.22, -0.18], [0.16, -0.22], [0, -0.24]],
    ],
    rows: [{ at: 2, s: 1, ink: true }],
    cols: [{ j: 5, a: 4, b: 7, s: 2, ink: true }],
    seat: { eye: [2.1, 1.95, 0.12], hinge: [-0.3, -0.02], chin: [-0.4, 0.7], jaw: [0.38, 0.18], ear: [0.9, 1.15], stop: 4 },
  },
  /** a hog: a high forehead sloping in one plane down to the snout disc, heavy jowls, small eyes */
  suid: {
    z: [-0.38, -0.22, -0.06, 0.1, 0.26, 0.42, 0.56, 0.64],
    yc: [0.14, 0.24, 0.22, 0.14, 0.05, -0.02, -0.06, -0.08],
    half: [
      [[0, 0.46], [0.3, 0.42], [0.44, 0.24], [0.48, 0], [0.44, -0.22], [0.32, -0.32], [0, -0.36]],
      [[0, 0.56], [0.38, 0.52], [0.54, 0.3], [0.58, 0], [0.54, -0.26], [0.4, -0.38], [0, -0.42]],
      [[0, 0.48], [0.36, 0.46], [0.54, 0.3], [0.6, 0.0], [0.58, -0.28], [0.42, -0.4], [0, -0.44]],
      [[0, 0.38], [0.28, 0.36], [0.44, 0.22], [0.52, -0.04], [0.54, -0.28], [0.4, -0.38], [0, -0.42]],
      [[0, 0.3], [0.2, 0.28], [0.32, 0.14], [0.36, -0.06], [0.36, -0.24], [0.28, -0.32], [0, -0.34]],
      [[0, 0.24], [0.16, 0.22], [0.24, 0.1], [0.28, -0.06], [0.28, -0.2], [0.2, -0.26], [0, -0.28]],
      [[0, 0.22], [0.16, 0.21], [0.24, 0.09], [0.27, -0.06], [0.27, -0.19], [0.19, -0.24], [0, -0.26]],
      [[0, 0.21], [0.15, 0.2], [0.22, 0.08], [0.25, -0.06], [0.25, -0.18], [0.18, -0.23], [0, -0.25]],
    ],
    rows: [{ at: 6, s: 2, ink: true }],
    cols: [{ j: 5, a: 3, b: 6, s: 2, ink: true }],
    seat: { eye: [2.6, 1.85, 0.25], hinge: [-0.28, -0.02], chin: [-0.36, 0.5], jaw: [0.44, 0.18], ear: [0.7, 1.0], stop: 3 },
  },
  /** a lizard: a flat skull, the jaw muscles bulging behind the eyes, eyes high on the sides, a long tapering snout */
  lacertid: {
    z: [-0.4, -0.26, -0.1, 0.06, 0.22, 0.38, 0.52, 0.62],
    yc: [0.0, 0.06, 0.08, 0.06, 0.02, -0.01, -0.03, -0.05],
    half: [
      [[0, 0.3], [0.34, 0.28], [0.48, 0.16], [0.52, 0], [0.48, -0.16], [0.34, -0.26], [0, -0.3]],
      [[0, 0.36], [0.4, 0.34], [0.56, 0.2], [0.6, 0], [0.56, -0.2], [0.4, -0.3], [0, -0.34]],
      [[0, 0.38], [0.36, 0.36], [0.52, 0.22], [0.56, 0], [0.52, -0.2], [0.38, -0.3], [0, -0.34]],
      [[0, 0.34], [0.28, 0.35], [0.44, 0.22], [0.48, 0], [0.46, -0.18], [0.34, -0.28], [0, -0.32]],
      [[0, 0.28], [0.22, 0.27], [0.36, 0.14], [0.4, -0.02], [0.38, -0.16], [0.28, -0.24], [0, -0.28]],
      [[0, 0.22], [0.18, 0.21], [0.28, 0.1], [0.32, -0.04], [0.3, -0.14], [0.22, -0.2], [0, -0.24]],
      [[0, 0.17], [0.14, 0.16], [0.22, 0.06], [0.24, -0.04], [0.22, -0.12], [0.16, -0.16], [0, -0.19]],
      [[0, 0.11], [0.08, 0.1], [0.14, 0.03], [0.15, -0.04], [0.14, -0.09], [0.1, -0.12], [0, -0.13]],
    ],
    rows: [{ at: 3, s: 1, ink: true }],
    cols: [{ j: 4, a: 0, b: 7, s: 2, ink: true }, { j: 1, a: 2, b: 5, s: 1, ink: true }],
    seat: { eye: [3.0, 1.55, 0.2], hinge: [-0.16, -0.3], chin: [-0.17, 0.56], jaw: [0.5, 0.12], ear: [0.6, 2.4], stop: 4 },
  },
  /** a frog or toad: wide and flat, a short rounded snout, the eyes raised on turrets on top */
  anuran: {
    z: [-0.34, -0.2, -0.04, 0.1, 0.22, 0.32, 0.4, 0.46],
    yc: [0.02, 0.08, 0.1, 0.08, 0.04, 0.0, -0.03, -0.05],
    half: [
      [[0, 0.34], [0.38, 0.3], [0.52, 0.16], [0.56, 0], [0.52, -0.16], [0.38, -0.26], [0, -0.3]],
      [[0, 0.4], [0.44, 0.36], [0.6, 0.2], [0.64, 0], [0.6, -0.18], [0.44, -0.28], [0, -0.32]],
      [[0, 0.4], [0.44, 0.38], [0.62, 0.2], [0.66, 0], [0.62, -0.18], [0.46, -0.28], [0, -0.32]],
      [[0, 0.36], [0.4, 0.34], [0.58, 0.18], [0.62, 0], [0.58, -0.16], [0.44, -0.26], [0, -0.3]],
      [[0, 0.3], [0.34, 0.28], [0.5, 0.14], [0.54, -0.02], [0.5, -0.14], [0.38, -0.22], [0, -0.26]],
      [[0, 0.24], [0.28, 0.22], [0.42, 0.1], [0.44, -0.02], [0.42, -0.12], [0.3, -0.18], [0, -0.22]],
      [[0, 0.18], [0.2, 0.16], [0.3, 0.06], [0.32, -0.02], [0.3, -0.1], [0.22, -0.14], [0, -0.17]],
      [[0, 0.1], [0.1, 0.09], [0.16, 0.03], [0.17, -0.02], [0.16, -0.06], [0.11, -0.08], [0, -0.1]],
    ],
    cols: [{ j: 3, a: 0, b: 7, s: 2, ink: true }],
    seat: { eye: [1.9, 0.75, 0.3], hinge: [-0.16, -0.26], chin: [-0.15, 0.42], jaw: [0.6, 0.12], ear: [1.0, 2.0], stop: 5 },
  },
  /** a bat: a big domed cranium, a short pug muzzle under a nose leaf */
  chiropteran: {
    z: [-0.4, -0.26, -0.08, 0.06, 0.18, 0.28, 0.36, 0.42],
    yc: [0.06, 0.16, 0.18, 0.12, 0.04, -0.02, -0.06, -0.08],
    half: [
      [[0, 0.44], [0.32, 0.4], [0.46, 0.24], [0.5, 0], [0.46, -0.22], [0.32, -0.32], [0, -0.36]],
      [[0, 0.6], [0.42, 0.56], [0.58, 0.32], [0.62, 0], [0.56, -0.26], [0.4, -0.38], [0, -0.42]],
      [[0, 0.58], [0.4, 0.56], [0.58, 0.34], [0.64, 0.0], [0.58, -0.26], [0.42, -0.38], [0, -0.42]],
      [[0, 0.44], [0.3, 0.44], [0.48, 0.28], [0.54, 0.0], [0.52, -0.24], [0.38, -0.36], [0, -0.4]],
      [[0, 0.3], [0.22, 0.3], [0.36, 0.16], [0.42, -0.04], [0.42, -0.22], [0.32, -0.32], [0, -0.36]],
      [[0, 0.26], [0.2, 0.25], [0.32, 0.12], [0.38, -0.06], [0.38, -0.22], [0.28, -0.3], [0, -0.32]],
      [[0, 0.22], [0.16, 0.21], [0.28, 0.1], [0.32, -0.06], [0.32, -0.2], [0.24, -0.26], [0, -0.28]],
      [[0, 0.16], [0.12, 0.15], [0.2, 0.06], [0.24, -0.06], [0.22, -0.16], [0.16, -0.2], [0, -0.22]],
    ],
    rows: [{ at: 3, s: 1, ink: true }],
    cols: [{ j: 5, a: 4, b: 7, s: 2, ink: true }],
    seat: { eye: [3.0, 1.6, 0.5], hinge: [-0.26, -0.04], chin: [-0.4, 0.34], jaw: [0.42, 0.18], ear: [0.9, 1.0], stop: 4 },
  },
  /** a salamander or axolotl: a broad flat rounded head, small eyes far apart, a wide smiling mouth */
  caudate: {
    z: [-0.36, -0.22, -0.06, 0.08, 0.2, 0.3, 0.38, 0.44],
    yc: [0.0, 0.04, 0.06, 0.04, 0.02, 0.0, -0.02, -0.04],
    half: [
      [[0, 0.3], [0.36, 0.28], [0.5, 0.16], [0.54, 0], [0.5, -0.14], [0.36, -0.24], [0, -0.28]],
      [[0, 0.34], [0.42, 0.32], [0.58, 0.18], [0.62, 0], [0.58, -0.16], [0.42, -0.26], [0, -0.3]],
      [[0, 0.34], [0.42, 0.33], [0.6, 0.18], [0.64, 0], [0.6, -0.16], [0.44, -0.26], [0, -0.3]],
      [[0, 0.32], [0.4, 0.31], [0.58, 0.16], [0.62, 0], [0.58, -0.14], [0.42, -0.24], [0, -0.28]],
      [[0, 0.28], [0.36, 0.27], [0.52, 0.14], [0.56, 0], [0.52, -0.12], [0.38, -0.22], [0, -0.26]],
      [[0, 0.24], [0.3, 0.22], [0.44, 0.1], [0.48, -0.02], [0.44, -0.1], [0.32, -0.18], [0, -0.22]],
      [[0, 0.18], [0.22, 0.16], [0.32, 0.06], [0.36, -0.02], [0.32, -0.08], [0.24, -0.13], [0, -0.16]],
      [[0, 0.1], [0.12, 0.09], [0.18, 0.03], [0.2, -0.02], [0.18, -0.05], [0.13, -0.08], [0, -0.1]],
    ],
    cols: [{ j: 3, a: 0, b: 7, s: 2, ink: true }],
    seat: { eye: [3.1, 1.2, 0.25], hinge: [-0.14, -0.26], chin: [-0.13, 0.38], jaw: [0.6, 0.12], ear: [0.8, 2.2], stop: 5 },
  },
};
SKULLS.browser.seat = { eye: [3.0, 2.0, 0.3], hinge: [-0.3, -0.02], chin: [-0.5, 0.5], jaw: [0.42, 0.26], ear: [1.2, 1.4], stop: 4 };
SKULLS.grazer.seat = { eye: [2.1, 2.0, 0.15], hinge: [-0.32, -0.05], chin: [-0.6, 0.68], jaw: [0.36, 0.22], ear: [1.0, 1.3], stop: 4 };
export interface HeadSpec {
  name: string; skull: Skull;
  /** head bone rest position and the head's length, width, height (m) */
  at: V3; hl: number; hw: number; hh: number;
  /** a per-station tweak: [station, point, dx, dy] (x hw, x hh) */
  tw?: [number, number, number, number][];
  /** pitch of the head's long axis (rad, + nose down) */
  pitch?: number;
  bones: { head: number; neck: number };
  paint: Paint; k?: number;
}
/** the skull as a trunk-like piece: rows and columns of its landmarks are known for seating eyes, horns, plates */
export function skull(s: HeadSpec): TrunkPiece {
  const sk = s.skull, cp = Math.cos(s.pitch ?? 0), sp = Math.sin(s.pitch ?? 0);
  const stations: Station[] = sk.z.map((z, i) => {
    const half = sk.half[i].map((q) => [...q]);
    for (const [st, j, dx, dy] of s.tw ?? []) if (st === i) { half[j][0] += dx; half[j][1] += dy; }
    const zz = z * s.hl, yy = sk.yc[i] * s.hh;
    return { c: add(s.at, [0, yy * cp - zz * sp, zz * cp + yy * sp]), s: [s.hw, s.hh], p: half };
  });
  const back = s.at[2] + sk.z[1] * s.hl;
  return trunk({
    name: s.name, stations, tween: 1, capS: sk.capS ?? true, capE: true, rings: sk.rows, cols: sk.cols, k: s.k ?? 1.6, paint: s.paint,
    skin: (p) => (p[2] < back ? [s.bones.head, 0.6, s.bones.neck, 0.4] : [s.bones.head, 1]),
  });
}
/** a jaw under the lip line: a U-section tube from the hinge to the chin */
export function jaw(o: { name: string; hinge: V3; chin: V3; w: number; h: number; bone: number; paint: Paint; k?: number; drop?: number }): Piece {
  const n = 5, st: Station[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), c: V3 = [o.hinge[0] + (o.chin[0] - o.hinge[0]) * f, o.hinge[1] + (o.chin[1] - o.hinge[1]) * f - Math.sin(f * Math.PI) * (o.drop ?? 0.1) * o.h, o.hinge[2] + (o.chin[2] - o.hinge[2]) * f];
    const wk = f < 0.2 ? 1 : 1 - (f - 0.2) * 0.5;
    st.push({ c, s: [o.w * wk, o.h * (1 - f * 0.35)], p: [[0, 0.7], [0.6, 0.72], [0.92, 0.4], [1, 0], [0.86, -0.5], [0.5, -0.86], [0, -1]] });
  }
  return trunk({ name: o.name, stations: st, tween: 0, capS: true, capE: true, rings: [{ at: 0, s: 1 }], cols: [{ j: 1, a: 0, b: 4, s: 2, ink: true }], skin: () => [o.bone, 1], paint: o.paint, k: o.k ?? 1.4 });
}

/** a mandible fitted to a skull: from station `from` to just behind the nose plane, its outer face flush with the
 *  skull along the lip line (point 5 of the half rings) and running down below the palate to a rounded underside,
 *  deepest at the back (the ramus) and shallowing to the chin. Returns the piece, the hinge (the back of the jaw at
 *  the lip line, where the jaw bone pivots) and the chin. */
export function mandible(o: { name: string; skull: Skull; at: V3; hl: number; hw: number; hh: number; pitch?: number; from?: number; to?: number; depth: number; bone: number; paint: Paint; k?: number; flare?: number }): { piece: TrunkPiece; hinge: V3; chin: V3 } {
  const sk = o.skull, cp = Math.cos(o.pitch ?? 0), sp = Math.sin(o.pitch ?? 0), from = o.from ?? 1.6, to = o.to ?? 6.75;
  const lerp1 = (a: number, b: number, f: number) => a + (b - a) * f;
  const at = (s: number, j: number, c: 0 | 1) => { const a = Math.max(0, Math.min(7, Math.floor(s))), b = Math.min(7, a + 1), f = s - a; return lerp1(sk.half[a][j][c], sk.half[b][j][c], f); };
  const zAt = (s: number) => { const a = Math.max(0, Math.min(7, Math.floor(s))), b = Math.min(7, a + 1); return lerp1(sk.z[a], sk.z[b], s - a); };
  const ycAt = (s: number) => { const a = Math.max(0, Math.min(7, Math.floor(s))), b = Math.min(7, a + 1); return lerp1(sk.yc[a], sk.yc[b], s - a); };
  const n = 6, stations: Station[] = [];
  const pos = (z: number, y: number): V3 => add(o.at, [0, y * o.hh * cp - z * o.hl * sp, z * o.hl * cp + y * o.hh * sp]);
  let hinge: V3 = o.at, chin: V3 = o.at;
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1), s = from + (to - from) * f, z = zAt(s), yc = ycAt(s);
    const x5 = at(s, 5, 0), y5 = at(s, 5, 1), y6 = at(s, 6, 1), dep = o.depth * (1 - 0.45 * f) * (i === n - 1 ? 0.8 : 1);
    const yb = y6 - dep, fl = o.flare ?? 1.04, xs = Math.max(0.04, x5) * (i === n - 1 ? 0.85 : 1);
    // relative to the station centre (yc): the top inside the mouth, the lip line, the cheek, the underside
    const half = [[0, y5 + 0.07 - yc], [xs * 0.8, y5 + 0.07 - yc], [xs * 0.98, y5 + 0.01 - yc], [xs * fl, (y5 + yb) / 2 - yc], [xs * 0.9 * fl, yb + (y5 - yb) * 0.2 - yc], [xs * 0.5, yb - yc], [0, yb - 0.015 - yc]];
    stations.push({ c: pos(z, yc), s: [o.hw, o.hh], p: half });
    if (i === 0) hinge = pos(z - 0.02, y5);
    if (i === n - 1) chin = pos(z, (y5 + yb) / 2);
  }
  const piece = trunk({ name: o.name, stations, tween: 0, capS: true, capE: true, cols: [{ j: 2, a: 0, b: n - 1, s: 1.5, ink: true }], skin: () => [o.bone, 1], paint: o.paint, k: o.k ?? 1.5, levels: 1 });
  return { piece, hinge, chin };
}

export type PupilKind = 'slit' | 'bar' | 'round' | 'w' | 'pin';
export interface EyeSpec { name: string; c: V3; ax: V3; r: number; bone: number; iris: number[]; pupil: PupilKind; irisA?: number; sclera?: number[]; k?: number; levels?: number; around?: number }
/** an eyeball: a sphere on its own bone, painted wet (the shader lights its cornea with the sun's specular) */
export function eyeball(o: EyeSpec): Piece {
  const m = newCM(), ax = nrm(o.ax), side = nrm(crs([0, 1, 0], ax)), up = crs(ax, side), rings: Ring[] = [];
  const st = (o.levels ?? 1) === 0 ? [-0.7, 0.0, 0.6, 0.92] : [-0.92, -0.6, -0.2, 0.2, 0.55, 0.8, 0.95], C = o.around ?? 12;
  for (const f of st) { const k = Math.sqrt(Math.max(0.02, 1 - f * f)); rings.push({ c: add(o.c, scl(ax, f * o.r)), x: side, y: up, pts: Array.from({ length: C }, (_, j) => { const a = (j / C) * TAU; return [Math.sin(a) * o.r * k, Math.cos(a) * o.r * k]; }) }); }
  const g = tube(m, rings, { tag: 0, capS: true, capE: true });
  const irisA = o.irisA ?? 0.62, sclera = o.sclera ?? RP('bone');
  return {
    name: o.name, m, grids: [g], levels: o.levels ?? 1, k: o.k ?? 2.4, noOcc: true, skin: () => [o.bone, 1],
    paint: (ch, _p, b) => {
      const px = new Px(ch, b), P = px.gb.P, n = px.n;
      px.lightK = 0.5;
      px.base((i) => {
        const dx = P[i * 3] - o.c[0], dy = P[i * 3 + 1] - o.c[1], dz = P[i * 3 + 2] - o.c[2], l = Math.hypot(dx, dy, dz) || 1;
        const cz = (dx * ax[0] + dy * ax[1] + dz * ax[2]) / l, a = Math.acos(cl(cz, -1, 1));
        const ux = (dx * side[0] + dy * side[1] + dz * side[2]) / l, uy = (dx * up[0] + dy * up[1] + dz * up[2]) / l;
        if (a > irisA + 0.06) return [sclera, uy > 0.2 ? 2 : 3];
        if (a > irisA) return [RP('ink'), 1];
        // the pupil
        const X = ux / Math.sin(irisA), Y = uy / Math.sin(irisA);
        const pup = o.pupil === 'slit' ? Math.abs(X) < 0.13 * (1 - Y * Y * 0.7) : o.pupil === 'bar' ? Math.abs(Y) < 0.12 && Math.abs(X) < 0.78 : o.pupil === 'w' ? Math.abs(Y + 0.18 * Math.abs(Math.sin(X * 4.2))) < 0.12 && Math.abs(X) < 0.72 : o.pupil === 'pin' ? Math.hypot(X, Y) < 0.12 : Math.hypot(X, Y) < 0.34;
        if (pup) return [RP('ink'), 0];
        // the iris: darker under the lid, lit low, dark spokes, a pale ring round the pupil
        const r = Math.hypot(X, Y), sp = Math.abs(Math.sin(Math.atan2(Y, X) * 7 + r * 3)) < 0.18;
        return [o.iris, (Y > 0.35 ? 2 : Y < -0.3 ? 4 : 3) - (sp && r > 0.45 ? 1 : 0) + (r < 0.5 && r > 0.36 ? 1 : 0) - (r > 0.88 ? 1 : 0)];
      });
      for (let i = 0; i < n; i++) px.mark[i] = 0;
      px.flush({ eye: () => true });
    },
  };
}
/** an upper eyelid: a thick band of skin over the top of the eye, on the lid bone (a blink turns it down) */
export function eyelid(o: { name: string; c: V3; ax: V3; r: number; bone: number; paint: Paint; lower?: boolean; cover?: number; root?: number }): Piece {
  const m = newCM(), ax = nrm(o.ax), sd0 = crs([0, 1, 0], ax), side = Math.hypot(...sd0) > 0.25 ? nrm(sd0) : nrm(crs([0, 0, 1], ax)), up0 = crs(ax, side), up = o.lower ? scl(up0, -1) : up0;
  const rows: V3[][] = [];
  const th1 = o.cover ?? 0.55, th0 = o.root ?? 1.75; // angles from the axis: margin .. the lid's root over the eye (deep in the socket, so a full blink still covers the cornea)
  for (let k = 0; k <= 6; k++) {
    const ph = -1.35 + (2.7 * k) / 6, row: V3[] = [];
    // outer face from the root to the margin, then back along the inner face
    for (let q = 0; q <= 4; q++) { const th = th0 + ((th1 - th0) * q) / 4; row.push(add(o.c, scl(nrm(add(add(scl(ax, Math.cos(th)), scl(up, Math.sin(th) * Math.cos(ph))), scl(side, Math.sin(th) * Math.sin(ph)))), o.r * 1.16))); }
    for (let q = 4; q >= 0; q--) { const th = th0 + ((th1 - th0) * q) / 4 + 0.05; row.push(add(o.c, scl(nrm(add(add(scl(ax, Math.cos(th)), scl(up, Math.sin(th) * Math.cos(ph))), scl(side, Math.sin(th) * Math.sin(ph)))), o.r * 1.04))); }
    rows.push(row);
  }
  const g = sheetGrid(m, rows, { tag: 0, out: (p) => [p[0] - o.c[0], p[1] - o.c[1], p[2] - o.c[2]], wrapCols: true, capS: true, capE: true });
  creaseRow(m, g, 0, 0); for (let i = 0; i < rows.length - 1; i++) { /* margin crease */ }
  return { name: o.name, m, grids: [g], levels: 1, skin: () => [o.bone, 1], paint: o.paint, k: 1.6, noOcc: true };
}
/** sensory pits and the sockets of small slit eyes drawn into a chart: a dark hollow with a lit lower lip */
export function drawPits(px: Px, sites: { c: V3; r: number; slit?: boolean; glow?: number[] }[]) {
  const P = px.gb.P, tpm = 1 / px.mpt;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    for (const s of sites) {
      const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2];
      // an oval stretched along the head (z) for slits
      const d = s.slit ? Math.hypot(dx * 1.0, dy * 2.6, dz * 0.55) : Math.hypot(dx, dy, dz);
      if (d > s.r * 1.25) continue;
      if (d < s.r) {
        px.rampI[i] = px.ramp(s.glow ?? RAMPS.ink as unknown as number[]); px.step[i] = s.glow ? 3 + (dy > 0 ? 1 : 0) : 0; px.mark[i] = 0;
        if (s.glow && (d / s.r) < 0.35) px.step[i] += 1;
      } else px.mark[i] += dy < 0 ? 1.4 : -1.2; // the lit lower lip, the shadowed upper rim
      void tpm;
    }
  }
}
export { Px };
