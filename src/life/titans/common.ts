// Shared scaffolding for the titans (titans/*.ts): rig landmarks, the spine's skin weights (tail tip to nose, the
// barrel breathing on the ribs bone, the scapulae riding the forelegs), and the entry that builds a titan's model.
import type { V3, Wt } from '../kit';
import type { Rig } from '../morph';
import type { Design } from '../design';
import { addWeights } from '../anatomy/core';

export interface TitanCtx {
  d: Design; rig: Rig; rest: V3[];
  bi: (n: string) => number; at: (n: string) => V3;
  D: Record<string, number>;
  /** the spine's weights for a point of the trunk */
  spine: (p: V3) => Wt;
}
const gs = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w));
const sst = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function titanCtx(d: Design, rig: Rig, rest: V3[]): TitanCtx {
  const bi = (n: string) => { const i = rig.bones.findIndex((b) => b.name === n); if (i < 0) throw new Error('titan: no bone ' + n); return i; };
  const at = (n: string) => rest[bi(n)];
  // the spine chain: tail tip .. tail bones .. hips .. chest .. neck .. head .. nose
  const tails = rig.tail.map((i) => rest[i]);
  const tl = tails[tails.length - 1], tp = tails.length > 1 ? tails[tails.length - 2] : at('hips');
  const tip: V3 = [tl[0] * 2 - tp[0], tl[1] * 2 - tp[1], tl[2] * 2 - tp[2]];
  const head = at('head'), neck = at('neck'), chest = at('chest'), hips = at('hips');
  const nose: V3 = [head[0], head[1], head[2] + (rig.dims.hl ?? 2) * 0.8];
  const J: V3[] = [tip, ...[...tails].reverse(), hips, chest, neck, head, nose];
  const tb = [...rig.tail].reverse();
  const SB: number[] = [...tb, rig.root, rig.root, bi('chest'), bi('neck'), rig.head];
  // segment k from J[k] to J[k+1] is driven by SB[k]
  const iC = bi('chest'), iR = rig.ribs;
  const fore = rig.legs.filter((l) => l.kind === 'fore' && l.pair === 0);
  const W = rig.dims.W, H = rig.dims.H;
  const spine = (p: V3): Wt => {
    let best = 0, bd = Infinity, bt = 0;
    for (let s = 0; s + 1 < J.length; s++) {
      const a = J[s], b = J[s + 1], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / L2));
      // distance measured mostly along the body: the trunk is fat, so weigh the sideways offset less
      const d = Math.hypot((p[0] - a[0] - ab[0] * t) * 0.4, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
      if (d < bd - 1e-9) { bd = d; best = s; bt = t; }
    }
    let w: Wt;
    const me = SB[best], hipSeg = tails.length + 1; // the hips -> chest segment
    if (best === hipSeg) { const k = sst(0.25, 0.95, bt); w = k > 0.01 ? [rig.root, 1 - k, iC, k] : [rig.root, 1]; }
    else {
      const nb = bt > 0.7 && best + 1 < SB.length ? SB[best + 1] : bt < 0.3 && best > 0 ? SB[best - 1] : -1;
      const k = bt > 0.7 ? 0.5 * sst(0.7, 1, bt) : 0.5 * (1 - sst(0, 0.3, bt));
      w = nb >= 0 && nb !== me && k > 0.01 ? [me, 1 - k, nb, k] : [me, 1];
    }
    // the barrel breathes; the shoulder blades ride the upper forelegs
    const extra: [number, number][] = [];
    if (iR >= 0) { const r = rest[iR], k = 0.5 * gs(p[2], r[2], W * 0.45) * sst(r[1] + H * 0.25, r[1] - H * 0.2, p[1]); if (k > 0.03) extra.push([iR, k]); }
    for (const lg of fore) { const up = rest[lg.bones[0]], k = 0.42 * gs(p[2], up[2], W * 0.22) * gs(p[1], up[1] + H * 0.15, H * 0.22) * gs(p[0] * lg.side, Math.abs(up[0]) * 1.15, W * 0.2); if (k > 0.03) extra.push([lg.bones[0], k]); }
    return extra.length ? addWeights(w, extra) : w;
  };
  // elephantine forelegs: the mid joint (the wrist) bends forward, so every leg bone keeps its rest frame
  for (const lg of rig.legs) lg.pole = [0, -0.1, 1];
  return { d, rig, rest, bi, at, D: rig.dims, spine };
}
/** a point between two bones, offset in metres */
export const between = (a: V3, b: V3, t: number, off: V3 = [0, 0, 0]): V3 => [a[0] + (b[0] - a[0]) * t + off[0], a[1] + (b[1] - a[1]) * t + off[1], a[2] + (b[2] - a[2]) * t + off[2]];
export { gs, sst };
