// ANATOMY LIBRARY: looks. A look is a declarative material recipe a piece is painted with: the ramp and step of the
// hide (and of the belly under a line, and of a second material by face id), and the drawn surface laid over it:
// scales of a kind and size, fur locks, pebbled hide, folds round an axis, spots, mud up the legs, lichen rosettes,
// scars and glints. Generators take a Look (or a function of the chart) so any creature can wear any hide.
//   lookPaint({ ramp: 'olive', step: 3, belly: { ramp: 'straw', step: 4, below: -0.35 }, scales: { size: 0.3 } })
import { type RampName } from '../../art/palette';
import type { V3 } from '../kit';
import type { Body, Chart, Piece } from './core';
import { Px, RP, type ScaleOpt, type FurOpt, cl } from './paint';

export interface Look {
  ramp: RampName; step: number;
  /** a pale belly where the surface normal points down past `below` (normal.y) */
  belly?: { ramp: RampName; step: number; below: number; scales?: ScaleOpt };
  /** a second (third...) material by face material id: its own ramp/step and drawn surface */
  mats?: Record<number, Look>;
  scales?: ScaleOpt;
  fur?: FurOpt;
  pebbles?: { size: number; depth?: number; pores?: number; aniso?: [number, number, number] };
  folds?: { axis: V3; origin: V3; spacing: number; depth?: number; near?: (p: V3) => number };
  spots?: { size: number; ramp: RampName; step: number; density?: number; up?: number };
  mud?: { top: number | ((p: V3) => number); ramp?: RampName; clump?: number };
  lichen?: { c: V3; n: V3; r: number; ramp: RampName; cup?: RampName }[];
  scars?: { pts: V3[]; w: number; ramp?: RampName }[];
  glints?: { size?: number; every?: number };
  /** ridges and valleys of the cage drawn as lit edges and dark lines */
  creases?: number;
  /** light strength baked in (1 full) */
  light?: number;
  /** extra drawing after everything (bespoke marks) */
  extra?: (px: Px, ch: Chart) => void;
  glow?: (px: Px, i: number) => boolean;
  eye?: boolean;
}

/** paint a chart with a look (or a look chosen per chart) */
export function lookPaint(look: Look | ((c: Chart, p: Piece) => Look)) {
  return (ch: Chart, p: Piece, b: Body) => {
    const L = typeof look === 'function' ? look(ch, p) : look;
    const px = new Px(ch, b);
    paintLook(px, L);
    px.flush({ glow: L.glow ? (i) => L.glow!(px, i) : undefined, eye: L.eye ? () => true : undefined });
  };
}
const _p: V3 = [0, 0, 0];
export function paintLook(px: Px, L: Look) {
  const gb = px.gb, N = gb.N, M = gb.M, n = px.n;
  px.lightK = L.light ?? 1;
  const matOf = (i: number) => M[i] - 1;
  const lookOf = (i: number): Look => (L.mats && L.mats[matOf(i)]) || L;
  const R = RP(L.ramp), Rb = L.belly ? RP(L.belly.ramp) : R;
  const matR = new Map<number, [number[], number]>();
  if (L.mats) for (const k of Object.keys(L.mats)) matR.set(+k, [RP(L.mats[+k].ramp), L.mats[+k].step]);
  px.base((i) => {
    const mm = matR.get(M[i] - 1);
    if (mm) px.put(i, mm[0], mm[1]);
    else if (L.belly && N[i * 3 + 1] < L.belly.below) px.put(i, Rb, L.belly.step);
    else px.put(i, R, L.step);
  });
  const isMain = (i: number) => lookOf(i) === L;
  const notBelly = (i: number) => (isMain(i) && (!L.belly || N[i * 3 + 1] >= L.belly.below + 0.06) ? 1 : 0);
  const bellyM = (i: number) => (isMain(i) && L.belly && N[i * 3 + 1] < L.belly.below - 0.02 ? 1 : 0);
  if (L.spots) { const s = L.spots; px.spots(s.size, RP(s.ramp), s.step, { mask: (i) => (isMain(i) && N[i * 3 + 1] > (s.up ?? -0.3) ? 1 : 0), density: s.density }); }
  if (L.scales) px.scales({ ...L.scales, mask: L.scales.mask ?? notBelly });
  if (L.belly?.scales) px.scales({ ...L.belly.scales, mask: bellyM });
  if (L.fur) px.fur({ ...L.fur, mask: L.fur.mask ?? isMain as any });
  if (L.pebbles) px.pebbles(L.pebbles.size, { depth: L.pebbles.depth, pores: L.pebbles.pores, aniso: L.pebbles.aniso, mask: (i) => (isMain(i) ? 1 : 0) });
  if (L.folds) { const f = L.folds; px.folds(f.axis, f.origin, f.spacing, { depth: f.depth, mask: f.near ? (i) => (isMain(i) ? f.near!(px.P(i)) : 0) : (i) => (isMain(i) ? 1 : 0) }); }
  if (L.creases) px.creaseInk(L.creases);
  // second materials paint their own drawn surface
  if (L.mats) for (const k of Object.keys(L.mats)) {
    const lk = L.mats[+k], mask = (i: number) => (matOf(i) === +k ? 1 : 0);
    if (lk.scales) px.scales({ ...lk.scales, mask });
    if (lk.pebbles) px.pebbles(lk.pebbles.size, { depth: lk.pebbles.depth, mask });
    if (lk.creases) px.creaseInk(lk.creases, { mask });
    if (lk.glints) px.glints(RP(lk.ramp), { mask, size: lk.glints.size, every: lk.glints.every });
    lk.extra?.(px, px.ch);
  }
  if (L.mud) { const m = L.mud, P = gb.P, tf = m.top, top = typeof tf === 'number' ? () => tf : (i: number) => { _p[0] = P[i * 3]; _p[1] = P[i * 3 + 1]; _p[2] = P[i * 3 + 2]; return tf(_p); }; px.mud(top, RP(m.ramp ?? 'soil'), { clump: m.clump }); }
  if (L.lichen?.length) px.rosettes(L.lichen.map((s) => ({ c: s.c, n: s.n, r: s.r, R: RP(s.ramp), cup: s.cup ? RP(s.cup) : undefined })));
  for (const s of L.scars ?? []) px.scar(s.pts, s.w, RP(s.ramp ?? 'hide'));
  if (L.glints) px.glints(R, { size: L.glints.size, every: L.glints.every, mask: (i) => (isMain(i) ? 1 : 0) });
  L.extra?.(px, px.ch);
  void n; void cl;
}
