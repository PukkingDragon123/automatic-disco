// DUSKWING (Chiropteroides foliinasus): a fruit-and-moth hunter on hand wings: skin over four long finger bones, a
// thumb claw for climbing, ears bigger than its face and a leaf of skin on the nose that aims its calls. By day it
// hangs folded under rock overhangs.
import type { SpeciesFn } from './index';
import { rs, sh, fur, hide } from './util';

export const duskwing: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), eye = rs(d.colors.eye), acc = rs(d.colors.accent);
  return {
    trunk: { chest: [0.48, 0.52, 0.56], barrel: [0.5, 0.5, 0.54], waist: [0.44, 0.44, 0.46], hips: [0.42, 0.42, 0.42], neck: { r0: 1.0, r1: 0.85 }, tail: { r0: 0.3, taper: 0.7 } },
    head: { skull: 'chiropteran', len: 1.0, wid: 1.0, muzzle: 0.85, eyes: { r: 0.12, pupil: 'round', iris: eye, fwd: 0.5, lid: 0.05 }, ears: { len: 1.9, wid: 0.95, up: 1, out: 0.55, back: 0.1, cup: 1.0, shape: [0.55, 0.9, 1.0, 0.9, 0.7, 0.4, 0.06], curl: 0.2 }, nose: 'none', teeth: { canine: 0.16 }, tongue: 'plain' },
    legs: { fore: { kind: 'paw', r: 0.75, claw: 1.5 }, hind: { kind: 'paw', r: 0.75, claw: 1.5 } },
    coat: {
      base, belly, bellyArc: 1.1,
      surf: { body: fur(W, 0.9, 0.5), limb: fur(W, 0.5), face: fur(W, 0.45), muzzle: hide(W, 0.3), ear: hide(W, 0.3, 0.6) },
      face: { muzzle: sh(base, -1) }, claw: ['bone', 3],
    },
    parts: [
      { k: 'wings', span: 1.25, c: sh(acc, -1) },
      { k: 'noseleaf', size: 0.8, c: sh(base, -1) },
      { k: 'mane', len: 0.2, c: sh(base, 1), ruff: 0.6 },
    ],
  };
};
