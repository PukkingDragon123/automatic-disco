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
export interface Skull { z: number[]; yc: number[]; half: number[][][]; rows?: { at: number; s: number; ink?: boolean }[]; cols?: { j: number; a: number; b: number; s: number; ink?: boolean }[]; capS?: boolean }
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
  },
};
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

export type PupilKind = 'slit' | 'bar' | 'round' | 'w' | 'pin';
export interface EyeSpec { name: string; c: V3; ax: V3; r: number; bone: number; iris: number[]; pupil: PupilKind; irisA?: number; sclera?: number[]; k?: number }
/** an eyeball: a sphere on its own bone, painted wet (the shader lights its cornea with the sun's specular) */
export function eyeball(o: EyeSpec): Piece {
  const m = newCM(), ax = nrm(o.ax), side = nrm(crs([0, 1, 0], ax)), up = crs(ax, side), rings: Ring[] = [];
  const st = [-0.92, -0.6, -0.2, 0.2, 0.55, 0.8, 0.95];
  for (const f of st) { const k = Math.sqrt(Math.max(0.02, 1 - f * f)); rings.push({ c: add(o.c, scl(ax, f * o.r)), x: side, y: up, pts: Array.from({ length: 12 }, (_, j) => { const a = (j / 12) * TAU; return [Math.sin(a) * o.r * k, Math.cos(a) * o.r * k]; }) }); }
  const g = tube(m, rings, { tag: 0, capS: true, capE: true });
  const irisA = o.irisA ?? 0.62, sclera = o.sclera ?? RP('bone');
  return {
    name: o.name, m, grids: [g], levels: 1, k: o.k ?? 2.4, noOcc: true, skin: () => [o.bone, 1],
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
export function eyelid(o: { name: string; c: V3; ax: V3; r: number; bone: number; paint: Paint; lower?: boolean; cover?: number }): Piece {
  const m = newCM(), ax = nrm(o.ax), side = nrm(crs([0, 1, 0], ax)), up0 = crs(ax, side), up = o.lower ? scl(up0, -1) : up0;
  const rows: V3[][] = [];
  const th1 = o.cover ?? 0.55, th0 = 1.75; // angles from the axis: margin .. the lid's root over the eye
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
