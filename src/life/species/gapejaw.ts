// GAPEJAW (Latirictus bufoformis): a squat warty toad-thing that is half head: a mouth as wide as its body, a flat
// skull with pinhole eyes raised on top. It sits in a puddle as a rock and swallows anything that fits.
import type { SpeciesFn } from './index';
import { rs, sh, wet } from './util';

export const gapejaw: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), eye = rs(d.colors.eye), acc = rs(d.colors.accent);
  return {
    trunk: { chest: [0.46, 0.48, 0.5], barrel: [0.52, 0.5, 0.5], waist: [0.5, 0.46, 0.44], hips: [0.4, 0.36, 0.34], prof: ['barrel', 'barrel', 'sag', 'round'] },
    head: { skull: 'anuran', len: 1.0, wid: 1.25, hgt: 0.9, eyes: { r: 0.18, pupil: 'pin', iris: eye, turret: 0.7, lid: 0.0 }, nose: 'nostrils', tongue: 'shoot', throat: 0.75 },
    legs: { fore: { kind: 'leap', r: 0.9, web: 0.3 }, hind: { kind: 'leap', r: 1.0, web: 0.75 } },
    coat: {
      base, belly, bellyArc: 1.0,
      pattern: { kind: 'blotches', c: pat, scale: 0.8, on: { limbs: true, head: true } },
      surf: { body: wet(W, 0.55, 1.2), belly: wet(W, 0.0), limb: wet(W, 0.35, 0.8), face: wet(W, 0.45, 0.8) },
      face: { chin: belly }, claw: ['olive', 2],
    },
    parts: [
      { k: 'warts', n: 70, size: 0.07, c: sh(base, 1) },
    ],
  };
};
