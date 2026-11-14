// GALLOWNECK (Patibulicollis maculatus): a spotted stilt-hunter four and a half metres tall that stands over the reed
// beds like a gallows, neck raised, then drops its narrow crested head like a pickaxe onto anything below.
import type { SpeciesFn } from './index';
import { rs, sh, fur, hide } from './util';

export const gallowneck: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), eye = rs(d.colors.eye), acc = rs(d.colors.accent);
  return {
    trunk: { chest: [0.42, 0.54, 0.7], barrel: [0.46, 0.5, 0.6], waist: [0.4, 0.46, 0.42], hips: [0.42, 0.48, 0.44], prof: ['shoulder', 'barrel', 'sag', 'hips'], neck: { r0: 0.85, r1: 0.48, arch: 0.04 }, tail: { r0: 0.3, taper: 0.72 } },
    head: { skull: 'canid', len: 1.05, wid: 0.78, hgt: 0.9, muzzle: 1.35, pitch: 0.1, eyes: { r: 0.16, pupil: 'slit', iris: eye, fwd: 0.6, lid: 0.08 }, ears: { len: 0.55, wid: 0.25, up: 1, out: 0.4, back: 0.4, cup: 0.9 }, nose: 'leather', teeth: { canine: 0.16, incisors: true }, tongue: 'plain' },
    legs: { fore: { kind: 'paw', r: 0.85, claw: 1.3 }, hind: { kind: 'paw', r: 0.9, claw: 1.3 } },
    coat: {
      base, belly, bellyArc: 0.9,
      pattern: { kind: 'spots', c: pat, scale: 1.25, on: { limbs: true, tail: true } },
      surf: { body: fur(W, 0.7, 0.5), limb: fur(W, 0.5), face: fur(W, 0.4), muzzle: fur(W, 0.25) },
      face: { muzzle: sh(belly, 0), nose: ['ink', 1] }, claw: ['basalt', 2],
    },
    parts: [
      { k: 'skullCrest', len: 1.1, h: 0.55, c: acc },
      { k: 'crest', t0: -1.2, t1: 0.3, h: 0.25, kind: 'bristle', c: acc },
      { k: 'tuft', len: 0.3, c: acc },
    ],
  };
};
