// ANATOMY LIBRARY: limbs and feet. A limb is a tube of cross-sections hung on the rig's leg chain (hip or shoulder
// joint, knee or elbow, the foot bone at the sole): each station has a radius, a depth-to-width ratio and landmark
// bumps placed by angle round the limb (0 front, +90 outside, 180 back, -90 inside): the muscle bellies of thigh
// and calf, the bony cap of the knee, the tendons down the back of the shank, the knobs either side of the ankle.
// The pad of the foot flares under the ankle with a lobe per toe; each toe is its own small cage running out of its
// lobe, and each carries a nail or a hooked claw (a keeled, tapering cage). The top of the limb is buried in the
// trunk's shoulder or hip mass. LIMB_TYPES hold ready station sets per kind of leg.
import type { V3, Wt } from '../kit';
import { type CM, newCM, tube, crease, creaseRow, creaseCol, type Ring } from '../cage';
import { type Piece, type Chart, type Body, chainSkin, addWeights } from './core';

const TAU = Math.PI * 2;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const gs = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
const ang = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };

/** a limb station: t along the chain (0 the upper joint, 0.5 the knee, 1 the sole; below 0 is buried in the trunk),
 *  radius (m), depth/width ratio, bumps [angle deg, amplitude (x r), width deg], a crease round it (folds, the knee) */
export interface LimbRing { t: number; r: number; e?: number; b?: [number, number, number][]; crease?: number; ink?: boolean; off?: [number, number] }
export interface ToeSpec {
  /** angle round the foot (deg, 0 forward, + outward), length beyond the pad rim, radius, claw or nail length */
  a: number; len: number; r: number; claw: number;
  /** how much the claw hooks down (0 straight .. 1 sickle), how it splays */
  curl?: number; drop?: number;
}
export interface FootSpec {
  /** the pad: radius at the sole, height of the pad, how far forward its centre sits */
  pad: number; h: number; fwd?: number;
  toes: ToeSpec[];
  /** 'nail' broad flat plates, 'claw' hooked keeled claws, 'hoof' a blunt cap */
  nail: 'nail' | 'claw' | 'hoof';
  /** depth of the lobes on the pad rim (x pad radius) */
  lobe?: number;
}
export interface LimbSpec {
  name: string; side: 1 | -1;
  /** rest positions: the upper joint, the knee, the sole (the foot bone) */
  hip: V3; knee: V3; sole: V3;
  bones: { parent: number; up: number; lo: number; foot: number; flex?: number };
  rings: LimbRing[];
  foot: FootSpec;
  /** cage points round (multiple of 4) */
  around?: number;
  paint: (c: Chart, p: Piece, b: Body) => void;
  /** claws and nails */
  clawPaint: (c: Chart, p: Piece, b: Body) => void;
  k?: number;
}
export interface LimbOut { skin: Piece; toes: Piece; claws: Piece; frame: (t: number) => { c: V3; out: V3; fwd: V3; d: V3 } }

/** the limb's axis frame at t */
function frameAt(s: LimbSpec, t: number) {
  const up = sub(s.hip, s.knee), top = add(s.hip, scl(nrm(up), 1));
  const c = t < 0 ? add(s.hip, scl(nrm(up), -t * 2 * Math.hypot(...up))) : t < 0.5 ? lerp(s.hip, s.knee, t / 0.5) : lerp(s.knee, s.sole, (t - 0.5) / 0.5);
  const d = nrm(t < 0.5 ? sub(s.knee, s.hip) : sub(s.sole, s.knee));
  let out = sub([s.side, 0, 0], scl(d, d[0] * s.side)); out = nrm(out);
  let fwd = crs(out, d); if (fwd[2] < 0) fwd = scl(fwd, -1);
  void top;
  return { c, out, fwd, d };
}

export function limb(s: LimbSpec): LimbOut {
  const C = s.around ?? 16, m: CM = newCM();
  const ft = s.foot, fr = (t: number) => frameAt(s, t);
  // ring points start at the inner back (the seam), go round through the front
  const angles = Array.from({ length: C }, (_, j) => -135 + (j * 360) / C);
  const ringAt = (st: LimbRing, extra?: (a: number) => number): Ring => {
    const f = fr(st.t), e = st.e ?? 1, off = st.off ?? [0, 0];
    const pts = angles.map((deg) => {
      const a = (deg * Math.PI) / 180;
      let k = 1;
      for (const [bd, amp, bw] of st.b ?? []) k += amp * gs(ang(a, (bd * Math.PI) / 180), 0, (bw * Math.PI) / 180);
      if (extra) k += extra(a);
      // x = outward, y = forward in the ring plane
      return [Math.sin(a) * st.r * k + off[0] * st.r, Math.cos(a) * st.r * k * e + off[1] * st.r];
    });
    // the ring plane: out and fwd axes (mirrored legs list their points the other way round; tube() fixes the facing)
    return { c: f.c, x: f.out, y: f.fwd, pts };
  };
  const rings = s.rings.map((st) => ringAt(st));
  // the foot pad: rings flaring from the ankle to the sole rim, lobed at the toes, then turning in under the sole
  const sole = s.sole, fw = ft.fwd ?? 0.1;
  const lobes = (a: number) => { let k = 0; for (const t of ft.toes) k += (ft.lobe ?? 0.18) * gs(ang(a, (t.a * Math.PI) / 180), 0, 0.22); return k; };
  const padSt: [number, number, number][] = [[ft.h * 0.85, 0.82, 0.3], [ft.h * 0.45, 0.97, 0.75], [ft.h * 0.12, 1.0, 1], [0, 0.94, 1], [0, 0.62, 0.4], [0, 0.28, 0]];
  const fz = fr(1);
  for (const [hh, rk, lk] of padSt) {
    const c = add(add(sole, [0, hh, 0]), scl(fz.fwd, ft.pad * fw * rk));
    const pts = angles.map((deg) => { const a = (deg * Math.PI) / 180, k = 1 + lobes(a) * lk; return [Math.sin(a) * ft.pad * rk * k, Math.cos(a) * ft.pad * rk * k * 1.04]; });
    rings.push({ c, x: [s.side, 0, 0], y: [0, 0, 1], pts });
  }
  const g = tube(m, rings, { tag: 0, capE: true });
  const R = rings.length;
  // creases: folds round the knee and the station rings asked for, the sole's rim, tendons down the back
  s.rings.forEach((st, i) => { if (st.crease) creaseRow(m, g, i, st.crease, !!st.ink); });
  creaseRow(m, g, R - 3, 1.5, true); // the sole's rim
  // claws/nails and toes
  const toes = newCM(), claws = newCM(), tg: number[] = [];
  const toeGrids = [], clawGrids = [];
  for (const t of ft.toes) {
    const a = (t.a * Math.PI) / 180, dir: V3 = nrm([Math.sin(a) * s.side, -0.15 - (t.drop ?? 0), Math.cos(a)]);
    const base = add(add(sole, [0, ft.h * 0.4, 0]), add(scl([Math.sin(a) * s.side, 0, Math.cos(a)], ft.pad * 0.55), scl(fz.fwd, ft.pad * fw)));
    const tipD = ft.pad * 0.5 + t.len;
    const up: V3 = [0, 1, 0], side = nrm(crs(dir, up)), upn = nrm(crs(side, dir));
    const tr: Ring[] = [];
    // root (buried in the pad), the knuckle, the toe's pad, the tip under the nail
    const st: [number, number, number][] = [[0, 0.9, 0], [0.45, 1.08, 0.05], [0.75, 1.0, 0.0], [1.0, 0.82, -0.08]];
    for (const [f, rk, dy] of st) {
      const c = add(add(base, scl(dir, tipD * f)), [0, t.r * dy - (f > 0.5 ? (f - 0.5) * t.r * 0.6 : 0), 0]);
      tr.push({ c, x: side, y: upn, pts: Array.from({ length: 8 }, (_, j) => { const q = (j / 8) * TAU; return [Math.sin(q) * t.r * rk, Math.cos(q) * t.r * rk * (Math.cos(q) < 0 ? 0.62 : 0.85)]; }) });
    }
    const gt = tube(toes, tr, { tag: 0, capE: true });
    creaseRow(toes, gt, 1, 1, true); // the knuckle fold
    toeGrids.push(gt); tg.push(0);
    // the claw or nail: rooted under the skin of the toe's last third, keeled on top, tapering to its point
    const cl = t.claw, cr = t.r * (ft.nail === 'nail' ? 1.0 : ft.nail === 'hoof' ? 1.05 : 0.7), curl = t.curl ?? (ft.nail === 'claw' ? 0.6 : 0.15);
    const c0 = add(add(base, scl(dir, tipD * 0.62)), scl(upn, t.r * 0.25));
    const cr2: Ring[] = [];
    const n = 5;
    for (let k = 0; k < n; k++) {
      const f = k / (n - 1), bend = curl * f * f;
      const c = add(add(c0, scl(dir, (tipD * 0.42 + cl) * f * (1 - bend * 0.25))), scl(upn, -cl * bend * 0.9 + t.r * 0.25 * Math.sin(f * Math.PI) * (ft.nail === 'claw' ? 1 : 0.4)));
      const rr = cr * (f < 0.25 ? 1 : 1 - (f - 0.25) / 0.75 * (ft.nail === 'nail' || ft.nail === 'hoof' ? 0.5 : 0.96));
      // a keeled section: flat or hollow underneath, a ridge on top
      const pts = Array.from({ length: 8 }, (_, j) => { const q = (j / 8) * TAU, cq = Math.cos(q); return [Math.sin(q) * rr * (ft.nail === 'claw' ? 0.62 : 1.05), (cq > 0 ? cq * (ft.nail === 'claw' ? 1.15 : 0.5) : cq * 0.25) * rr]; });
      // the claw's local frame turns down as it curls
      const dd = nrm(add(dir, scl(upn, -curl * f * 1.6))), uu = nrm(crs(side, dd));
      cr2.push({ c, x: side, y: uu, pts });
    }
    const gc = tube(claws, cr2, { tag: 0, capE: true, capS: true });
    creaseCol(claws, gc, 0, 0, n - 1, 2, true); creaseCol(claws, gc, 4, 0, n - 1, 1.5, true);
    creaseRow(claws, gc, 0, 2, true);
    clawGrids.push(gc);
  }
  void crease; void tg;
  // skin weights: the chain hip -> knee -> ankle -> sole, the buried top blending into the trunk, the muscle belly
  // of the upper segment partly on the flex bone (it swells as the joint closes)
  const B = s.bones, ankle = add(sole, [0, ft.h * 1.6, 0]), top = fr(-0.2).c;
  const chain = chainSkin([top, s.hip, s.knee, ankle, add(sole, [0, -1, 0])], [B.parent, B.up, B.lo, B.foot], 0.3);
  const legL = Math.hypot(...sub(s.hip, s.knee));
  const skin = (p: V3): Wt => {
    let w = chain(p);
    if (B.flex !== undefined) { const t = (s.hip[1] - p[1]) / (legL * 2); const k = 0.45 * gs(t, 0.22, 0.09); if (k > 0.03) w = addWeights(w, [[B.flex, k]]); }
    return w;
  };
  const footW: Wt = [B.foot, 1];
  const base = { levels: 2, k: s.k ?? 1 };
  const skinP: Piece = { name: s.name, m, grids: [g], skin, paint: s.paint, ...base };
  const toeP: Piece = { name: s.name + 'T', m: toes, grids: toeGrids, skin: () => footW, paint: s.paint, levels: 1, k: s.k ?? 1 };
  const clawP: Piece = { name: s.name + 'C', m: claws, grids: clawGrids, skin: () => footW, paint: s.clawPaint, levels: 2, k: (s.k ?? 1) * 1.3 };
  return { skin: skinP, toes: toeP, claws: clawP, frame: fr };
}

/** ready station sets (radii in multiples of the limb's base radius `r`): heavy pillars, muscular striders */
export const LIMB_TYPES: Record<string, (r: number) => LimbRing[]> = {
  /** an elephantine column: a heavy thigh, a broad knee with a skin fold either side, a straight shin, a flared ankle */
  pillar: (r) => [
    { t: -0.22, r: r * 1.25, e: 1.1 },
    { t: -0.05, r: r * 1.22, e: 1.12, b: [[0, 0.12, 40], [180, 0.1, 50]] },
    { t: 0.14, r: r * 1.12, e: 1.08, b: [[20, 0.14, 45], [180, 0.12, 45], [-90, -0.05, 40]] },
    { t: 0.3, r: r * 0.98, e: 1.04, b: [[10, 0.1, 40], [175, 0.1, 40]] },
    { t: 0.43, r: r * 0.9, e: 1.02, b: [[0, 0.08, 30], [150, 0.04, 30], [-150, 0.04, 30]], crease: 1, ink: true },
    { t: 0.5, r: r * 0.93, e: 1.04, b: [[0, 0.16, 32], [180, -0.05, 40]], crease: 1.5, ink: true },
    { t: 0.57, r: r * 0.9, e: 1.02, b: [[0, 0.06, 30], [180, 0.04, 40]], crease: 1, ink: true },
    { t: 0.68, r: r * 0.86, e: 1.0, b: [[180, 0.08, 45], [20, 0.04, 30]] },
    { t: 0.8, r: r * 0.84, e: 1.0, b: [[90, 0.05, 30], [-90, 0.05, 30], [170, 0.06, 30]] },
  ],
  /** a muscular strider: thigh muscle front and back, a bony knee cap, a lean shank with tendons behind, ankle knobs */
  strider: (r) => [
    { t: -0.22, r: r * 1.2, e: 1.15 },
    { t: -0.05, r: r * 1.18, e: 1.2, b: [[10, 0.16, 40], [175, 0.18, 45]] },
    { t: 0.13, r: r * 1.08, e: 1.18, b: [[15, 0.2, 40], [170, 0.2, 40], [-80, -0.06, 30]] },
    { t: 0.3, r: r * 0.88, e: 1.1, b: [[10, 0.12, 35], [175, 0.14, 35]] },
    { t: 0.44, r: r * 0.7, e: 1.05, b: [[0, 0.1, 30], [150, 0.1, 18], [-150, 0.1, 18]] },
    { t: 0.5, r: r * 0.72, e: 1.06, b: [[0, 0.26, 26], [180, -0.08, 40]], crease: 1.2, ink: true },
    { t: 0.56, r: r * 0.68, e: 1.04, b: [[0, 0.1, 26], [165, 0.14, 30]] },
    { t: 0.66, r: r * 0.66, e: 1.06, b: [[170, 0.2, 35], [10, 0.05, 25]] },
    { t: 0.78, r: r * 0.5, e: 1.0, b: [[160, 0.18, 14], [-160, 0.18, 14], [0, 0.06, 20]] },
    { t: 0.86, r: r * 0.5, e: 0.95, b: [[90, 0.16, 22], [-90, 0.16, 22], [180, 0.12, 16]] },
  ],
};
