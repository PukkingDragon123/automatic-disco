// SCALEBACK (Squamipellis fossor): a hunched digger shingled nose to tail in overlapping horn plates that lie back like
// a pine cone and flare when it curls; it tears open root-stores with hooked fore-claws and licks out the grubs with
// a long narrow snout.
import type { SpeciesFn } from './index';
import { rs, sh, scales, hide } from './util';

export const scaleback: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), eye = rs(d.colors.eye), acc = rs(d.colors.accent);
  return {
    trunk: { chest: [0.42, 0.58, 0.5], barrel: [0.5, 0.7, 0.5], waist: [0.48, 0.66, 0.46], hips: [0.44, 0.56, 0.44], prof: ['barrel', 'barrel', 'barrel', 'hips'], neck: { r0: 0.9, r1: 0.6 }, tail: { r0: 0.7, taper: 0.84, flat: 1.25, droop: 0.15 } },
    head: { skull: 'lacertid', len: 0.9, wid: 0.75, hgt: 0.85, muzzle: 1.55, pitch: 0.15, eyes: { r: 0.1, pupil: 'round', iris: eye, lid: 0.15 }, nose: 'nostrils', tongue: 'flick' },
    legs: { fore: { kind: 'bear', r: 1.0, claw: 2.4, toes: 3 }, hind: { kind: 'bear', r: 0.95, claw: 1.0 } },
    coat: {
      base, belly, bellyArc: 0.8,
      surf: { body: scales(W, 2.0, 'shield'), belly: hide(W, 0.7, 0.8), limb: scales(W, 0.9, 'shield'), foot: hide(W, 0.5), face: scales(W, 0.6, 'shield'), muzzle: hide(W, 0.35) },
      face: { muzzle: sh(base, -1) }, claw: ['bone', 3],
    },
    parts: [
      { k: 'plates', t0: -0.9, t1: 2.6, rows: 26, per: 5, spread: 2.2, size: 0.5, c: acc, keel: true },
    ],
  };
};
