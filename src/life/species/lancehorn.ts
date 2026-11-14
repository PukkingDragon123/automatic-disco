// LANCEHORN (Ensirostrum noctivagus): a low shaggy night-grubber the size of a bull, one great keratin lance swept
// forward off the nose; it walks on the knuckles of its huge clawed forearms.
import type { SpeciesFn } from './index';
import { rs, sh } from './util';

export const lancehorn: SpeciesFn = (d) => {
  const base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), eye = rs(d.colors.eye);
  return {
    trunk: { chest: [0.46, 0.5, 0.66], barrel: [0.5, 0.48, 0.62], waist: [0.47, 0.44, 0.56], hips: [0.46, 0.48, 0.5], hump: 0.12, neck: { r0: 0.95, r1: 0.6 }, tail: { r0: 0.3, taper: 0.76 } },
    head: { skull: 'suid', muzzle: 1.35, len: 1.15, wid: 1.25, hgt: 1.15, eyes: { r: 0.11, pupil: 'round', iris: eye, lid: 0.1 }, ears: { len: 0.5, wid: 0.3, up: 0.8, back: 0.5, out: 0.7 }, nose: 'disc', tongue: 'plain' },
    legs: { fore: { kind: 'bear', r: 1.3, claw: 1.6 }, hind: { kind: 'bear', r: 1.0 } },
    coat: {
      base, belly, back: sh(base, -1), bellyArc: 0.9,
      pattern: { kind: 'saddle', c: pat },
      surf: { body: { fur: { len: 0.14, width: 0.05, down: 0.6 } }, back: { fur: { len: 0.17, width: 0.055, down: 0.4 } }, limb: { fur: { len: 0.09, width: 0.04 } }, face: { fur: { len: 0.05, width: 0.03 } }, muzzle: { pebbles: { size: 0.03, depth: 0.7 }, creases: 0.8 } },
      face: { muzzle: sh(base, 1), nose: ['hide', 2] }, claw: ['bone', 3], horn: ['violet', 2],
    },
    parts: [],
  };
};
