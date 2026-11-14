// KNUCKLE BRUTE (Brachiograd ferox): all shoulders: forearms thicker than its body walk it on folded knuckles and the
// short hind legs trot behind. It clubs prey flat with one swing. A shag of dark hair over the shoulders, bare grey
// skin on the arms.
import type { SpeciesFn } from './index';
import { rs, sh, fur, hide } from './util';

export const knuckler: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), eye = rs(d.colors.eye);
  return {
    trunk: { chest: [0.54, 0.66, 0.72], barrel: [0.5, 0.58, 0.62], waist: [0.42, 0.46, 0.46], hips: [0.4, 0.42, 0.4], prof: ['shoulder', 'barrel', 'sag', 'hips'], hump: 0.25, neck: { r0: 1.2, r1: 0.9 }, tail: { r0: 0.3, taper: 0.6 } },
    head: { skull: 'brute', len: 0.95, wid: 1.15, hgt: 1.0, muzzle: 0.9, eyes: { r: 0.1, pupil: 'round', iris: eye, fwd: 0.65, lid: 0.2 }, ears: { len: 0.24, wid: 0.2, up: 0.5, out: 1, back: 0.6, cup: 0.6 }, nose: 'leather', teeth: { canine: 0.24, incisors: true }, tongue: 'plain' },
    legs: { fore: { kind: 'knuckle', r: 1.9 }, hind: { kind: 'bear', r: 0.95, claw: 0.8 } },
    coat: {
      base, belly, bellyArc: 0.9,
      surf: { body: fur(W, 1.0, 0.6), back: fur(W, 1.3, 0.5), limb: hide(W, 0.8, 1.0), sock: hide(W, 0.8, 1.0), face: hide(W, 0.5), muzzle: hide(W, 0.4) },
      socks: { c: ['stone', 3], h: rig.dims.legLen * 1.35 }, face: { muzzle: ['stone', 3], mask: sh(base, -1), nose: ['ink', 1] }, claw: ['basalt', 2], scars: 4,
    },
    parts: [
      { k: 'shag', t0: -0.6, t1: 0.55, len: 0.42, density: 1.1, fringe: 1.3, flank: 0.8 },
      { k: 'crest', t0: -0.8, t1: 0.35, h: 0.32, kind: 'bristle', c: sh(base, -1) },
      { k: 'brow', size: 1.6, c: ['stone', 2] },
    ],
  };
};
