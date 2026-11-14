// ANATOMY LIBRARY: trunks. A bilateral body (tail tip to the back of the skull, or any stretch of it) is blocked in as
// key cross-sections written out by hand: each station a centre, a half-width and half-height, and a half profile of
// nine points from the top of the back down the right flank to the belly (the left side is its mirror). Named
// profiles give the landmarks a sculptor blocks first (the scapula ridge over the shoulders, the barrel of the ribs
// and the sag of the belly, the points of the hips, the dorsal ridge of a tail). In-between rings are tweened, the
// cage is creased where folds or ridges run, and subdivision turns it into one continuous skin.
import { type V3, type Wt } from '../kit';
import { type CM, type Grid, newCM, tube, tweenRings, sideFrames, mirrorRing, creaseRow, creaseCol, type Ring } from '../cage';
import type { Piece, Chart, Body } from './core';

/** half profiles: nine points (x in half-widths, y in half-heights about the station centre), top of the back to the
 *  midline of the belly down the +x flank */
export const PROFILES: Record<string, number[][]> = {
  round: [[0, 1], [0.38, 0.93], [0.71, 0.71], [0.93, 0.38], [1, 0], [0.93, -0.38], [0.71, -0.71], [0.38, -0.93], [0, -1]],
  /** a dorsal ridge and a rounded belly: tails, necks of the reptile-kind */
  ridge: [[0, 1], [0.26, 0.86], [0.62, 0.64], [0.9, 0.3], [1, -0.05], [0.94, -0.42], [0.74, -0.74], [0.4, -0.94], [0, -1]],
  /** the shoulders: the spine sunk between two scapula ridges, the deep keel of the chest below */
  shoulder: [[0, 0.9], [0.3, 0.97], [0.66, 0.84], [0.9, 0.5], [0.98, 0.06], [0.92, -0.36], [0.72, -0.7], [0.36, -0.94], [0, -1]],
  /** the barrel of the ribs: widest above the middle, a heavy belly */
  barrel: [[0, 1], [0.4, 0.96], [0.76, 0.78], [0.97, 0.42], [1, 0], [0.96, -0.4], [0.82, -0.72], [0.46, -0.95], [0, -1]],
  /** a sagging belly: the flanks swing out low */
  sag: [[0, 1], [0.38, 0.95], [0.7, 0.76], [0.88, 0.4], [0.97, -0.02], [1, -0.4], [0.88, -0.74], [0.5, -0.97], [0, -1]],
  /** the hips: the points of the ilium high on the flanks, a flat croup between them */
  hips: [[0, 0.96], [0.36, 1], [0.74, 0.9], [0.96, 0.5], [0.94, 0.04], [0.86, -0.36], [0.68, -0.68], [0.36, -0.9], [0, -0.96]],
  /** a tall narrow neck with a throat fold */
  neck: [[0, 1], [0.36, 0.94], [0.7, 0.7], [0.94, 0.34], [1, -0.06], [0.94, -0.44], [0.7, -0.76], [0.3, -0.96], [0, -1]],
  /** a flattened, wide section (the tail root of a swimmer, a flat-backed armoured animal) */
  flat: [[0, 1], [0.44, 0.97], [0.8, 0.82], [0.98, 0.46], [1, 0], [0.96, -0.44], [0.8, -0.8], [0.42, -0.97], [0, -1]],
};
export interface Station {
  /** centre */ c: V3;
  /** half width, half height (metres) */ s: [number, number];
  /** a profile name or nine points written out */ p: string | number[][];
  /** a per-point tweak: [point index, dx, dy] in half-widths/heights (a landmark pushed out or in) */
  tw?: [number, number, number][];
}
export interface TrunkSpec {
  name: string;
  stations: Station[];
  /** in-between rings after each station (one number for all) */
  tween?: number | number[];
  capS?: boolean; capE?: boolean;
  /** creases: round a station's ring (sharpness, ink), or down a column (the profile point index, from station a to b) */
  rings?: { at: number; s: number; ink?: boolean; arc?: [number, number] }[];
  cols?: { j: number; a: number; b: number; s: number; ink?: boolean }[];
  skin: (p: V3) => Wt;
  paint: (c: Chart, p: Piece, b: Body) => void;
  levels?: number; k?: number;
  charts?: (p: Piece) => Chart[];
}
export interface TrunkPiece extends Piece {
  /** the tube row of each station (after tweening and subdivision) */ row: (station: number) => number;
  /** the tube column of a profile point on the +x side (j) or its mirror (-j) after subdivision */ col: (j: number, side?: 1 | -1) => number;
  rows0: number; cols0: number;
}
/** a profile point index on the full ring (mirrorRing order: bottom, -x side up, top, +x side down) */
export const ringIndex = (j: number, side: 1 | -1 = 1, K = 9) => (side < 0 ? K - 1 - j : j === 0 ? K - 1 : j === K - 1 ? 0 : K - 1 + j);

export function trunk(o: TrunkSpec): TrunkPiece {
  const m: CM = newCM();
  const fr = sideFrames(o.stations.map((s) => s.c));
  const keys: Ring[] = o.stations.map((s, i) => {
    const prof = (typeof s.p === 'string' ? PROFILES[s.p] : s.p).map((q) => [...q]);
    for (const [j, dx, dy] of s.tw ?? []) { prof[j][0] += dx; prof[j][1] += dy; }
    return { c: s.c, x: fr[i].x, y: fr[i].y, pts: mirrorRing(prof.map(([x, y]) => [x * s.s[0], y * s.s[1]])) };
  });
  const tw = o.tween ?? 1, rings = tweenRings(keys, tw);
  const keyRow: number[] = []; { let r = 0; for (let i = 0; i < keys.length; i++) { keyRow.push(r); r += 1 + (Array.isArray(tw) ? tw[i] ?? 0 : tw); } }
  const g: Grid = tube(m, rings, { tag: 0, capS: o.capS, capE: o.capE });
  for (const c of o.rings ?? []) {
    const C = g.v[0].length;
    if (c.arc) { for (let j = c.arc[0]; j < c.arc[1]; j++) { const a = ((j % C) + C) % C; creaseRowSeg(m, g, keyRow[c.at], a, c.s, !!c.ink); } }
    else creaseRow(m, g, keyRow[c.at], c.s, !!c.ink);
  }
  const K = (C0n: number) => C0n / 2 + 1, Kp = K(keys[0].pts.length);
  for (const c of o.cols ?? []) for (const side of [1, -1] as const) creaseCol(m, g, ringIndex(c.j, side, Kp), keyRow[c.a], keyRow[c.b], c.s, !!c.ink);
  const lv = o.levels ?? 2, f = 2 ** lv, C0 = keys[0].pts.length;
  const piece: TrunkPiece = {
    name: o.name, m, grids: [g], levels: lv, skin: o.skin, paint: o.paint, k: o.k, charts: o.charts,
    rows0: rings.length, cols0: C0,
    row: (s) => keyRow[s] * f, col: (j, side = 1) => ringIndex(j, side, Kp) * f,
  };
  return piece;
}
function creaseRowSeg(m: CM, g: Grid, i: number, j: number, s: number, ink: boolean) {
  const C = g.v[i].length;
  const a = g.v[i][j], b = g.v[i][(j + 1) % C];
  const k = a < b ? a * 4194304 + b : b * 4194304 + a;
  if (s > 0) m.sharp.set(k, Math.max(m.sharp.get(k) ?? 0, s));
  if (ink) m.ink.add(k);
}
