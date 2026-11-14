// GILL-EEL (Branchioserpens lentus): a two-and-a-half-metre ambusher of the flooded grass: an eel-long body on four
// short paddling limbs, frilled external gills fanning behind the head, a crest fin from nape to tail.
import type { SpeciesFn } from './index';
import { rs, sh, wet } from './util';

export const gillnewt: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), eye = rs(d.colors.eye), acc = rs(d.colors.accent);
  return {
    trunk: { chest: [0.42, 0.44, 0.48], barrel: [0.44, 0.44, 0.48], waist: [0.42, 0.42, 0.44], hips: [0.42, 0.42, 0.42], prof: ['flat', 'flat', 'flat', 'flat'], neck: { r0: 1.1, r1: 0.95 }, tail: { r0: 0.85, taper: 0.86, flat: 0.55 } },
    head: { skull: 'caudate', len: 1.0, wid: 1.0, hgt: 0.9, eyes: { r: 0.09, pupil: 'bar', iris: eye, lid: 0.05 }, nose: 'nostrils', tongue: 'plain' },
    legs: { fore: { kind: 'sprawl', r: 0.75, toes: 4, web: 0.5 }, hind: { kind: 'sprawl', r: 0.8, web: 0.5 } },
    coat: {
      base, belly, bellyArc: 0.9,
      pattern: { kind: 'spots', c: pat, scale: 0.7, on: { limbs: true, head: true, tail: true } },
      surf: { body: wet(W, 0.25), limb: wet(W, 0.15, 0.6), face: wet(W, 0.2, 0.6) },
      face: { chin: belly }, claw: ['plum', 2],
    },
    parts: [
      { k: 'gills', size: 0.8, c: acc, n: 3 },
      { k: 'crest', t0: -0.4, t1: 3.2, h: 0.4, kind: 'fin', c: sh(base, 1) },
      { k: 'tailFin', h: 0.5, c: sh(base, 1), below: true },
    ],
  };
};
