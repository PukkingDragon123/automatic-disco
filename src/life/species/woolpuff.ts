// WOOLPUFF (Floccus auritus): a shin-high ball of fleece from the screes, all ears: two broad round ear-fans that catch
// the footfall of hunters a field away. It browses lichen and freezes into a stone-coloured lump when the ears turn.
import type { SpeciesFn } from './index';
import { rs, sh, fur, hide } from './util';

export const woolpuff: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), eye = rs(d.colors.eye);
  return {
    trunk: { chest: [0.5, 0.6, 0.6], barrel: [0.58, 0.66, 0.62], waist: [0.58, 0.64, 0.6], hips: [0.52, 0.58, 0.54], prof: ['barrel', 'barrel', 'barrel', 'hips'], neck: { r0: 1.0, r1: 0.8 }, tail: { r0: 0.4, taper: 0.6 } },
    head: { skull: 'canid', len: 0.9, wid: 1.05, muzzle: 0.6, pitch: 0.1, eyes: { r: 0.17, pupil: 'round', iris: eye, fwd: 0.35, lid: 0.04 }, ears: { len: 1.5, wid: 1.25, up: 0.9, out: 0.8, back: 0.25, cup: 0.7, shape: [0.5, 0.86, 1.0, 1.0, 0.9, 0.68, 0.3] }, nose: 'leather', tongue: 'plain' },
    legs: { fore: { kind: 'paw', r: 1.0 }, hind: { kind: 'paw', r: 1.0 } },
    coat: {
      base, belly, bellyArc: 0.7,
      surf: { body: fur(W, 1.5, 0.8), limb: fur(W, 0.8), face: fur(W, 0.6), muzzle: hide(W, 0.3), ear: fur(W, 0.35) },
      face: { muzzle: sh(base, -1), nose: ['ink', 2] }, claw: ['basalt', 2],
    },
    parts: [
      { k: 'fleece', t0: -0.4, t1: 1.15, puff: 1.6 },
      { k: 'shag', t0: -0.3, t1: 1.1, len: 0.38, density: 0.9, fringe: 1.2, flank: 1.0 },
    ],
  };
};
