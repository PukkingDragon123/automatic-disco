// STILTWOOL (Lanigrallator altus): a woolly hay-bale of a body held three metres up on bare black stilts so the
// high-meadow wind passes under it; a small head on a drooping neck grazes the grass tops; the fleece keeps it warm.
import type { SpeciesFn } from './index';
import { rs, sh, fur, hide } from './util';

export const stiltwool: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), eye = rs(d.colors.eye);
  return {
    trunk: { chest: [0.5, 0.58, 0.62], barrel: [0.56, 0.64, 0.66], waist: [0.56, 0.62, 0.62], hips: [0.5, 0.58, 0.52], prof: ['barrel', 'barrel', 'barrel', 'hips'], neck: { r0: 0.75, r1: 0.5, arch: 0.22 }, tail: { r0: 0.3, taper: 0.7 } },
    head: { skull: 'cervid', len: 1.0, wid: 0.95, pitch: 0.2, eyes: { r: 0.16, pupil: 'bar', iris: eye, lid: 0.05 }, ears: { len: 0.7, wid: 0.32, up: 0.35, out: 1, back: 0.3, cup: 0.9 }, nose: 'leather', tongue: 'plain' },
    legs: { fore: { kind: 'stilt', r: 0.75 }, hind: { kind: 'stilt', r: 0.8 } },
    coat: {
      base, belly, bellyArc: 0.8,
      surf: { body: { fur: { len: 0.07 * W, width: 0.075 * W, down: 0.8, tooth: 1.0, clump: 0.3 }, scales: { size: 0.085 * W * 0.7, kind: 'pebble', ink: 1.6 } }, limb: hide(W, 0.5), sock: hide(W, 0.45, 0.6), face: fur(W, 0.45), muzzle: hide(W, 0.3) },
      socks: { c: ['basalt', 2], h: rig.dims.legLen * 0.88 }, face: { muzzle: ['hide', 2], nose: ['ink', 2] }, horn: ['basalt', 1],
    },
    parts: [
      { k: 'shag', t0: -0.1, t1: 1.05, len: 0.3, density: 0.7, fringe: 1.5, flank: 0.9 },
      { k: 'tuft', len: 0.25 },
    ],
  };
};
