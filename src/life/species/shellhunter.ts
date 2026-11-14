// SHELLHUNTER (Venatorcarapax pallidus): the plains apex: five metres of pale muscle under a slate-blue helm and
// back-shield, a ruff of white fur at the throat, three slit eyes down each side of the helm, and a long whip tail
// ending in a red signal fan it flicks before it charges.
import type { SpeciesFn } from './index';
import { rs, sh, fur, scales } from './util';

export const shellhunter: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), eye = rs(d.colors.eye);
  return {
    trunk: { chest: [0.46, 0.52, 0.74], barrel: [0.5, 0.5, 0.64], waist: [0.42, 0.46, 0.44], hips: [0.46, 0.5, 0.48], prof: ['shoulder', 'barrel', 'sag', 'hips'], neck: { r0: 1.0, r1: 0.7, arch: 0.05 }, tail: { r0: 0.42, taper: 0.8 } },
    head: { skull: 'felid', len: 1.0, wid: 1.0, muzzle: 1.25, pitch: 0.05, eyes: { r: 0.13, pupil: 'slit', iris: eye, fwd: 0.55, lid: 0.12 }, ears: { len: 0.3, wid: 0.22, up: 0.6, out: 0.8, back: 0.5, cup: 0.8 }, nose: 'leather', teeth: { canine: 0.26, incisors: true }, whiskers: 0.55, tongue: 'plain' },
    legs: { fore: { kind: 'paw', r: 1.3, claw: 1.6 }, hind: { kind: 'paw', r: 1.15, claw: 1.4 } },
    coat: {
      base, belly, bellyArc: 1.0,
      surf: { body: fur(W, 0.6, 0.4), limb: fur(W, 0.45), face: fur(W, 0.3), muzzle: fur(W, 0.2), tail: scales(W, 0.8, 'keel') },
      face: { muzzle: sh(belly, 1), nose: ['plum', 1], mask: sh(pat, -1) }, claw: ['basalt', 1], scars: 3, ribs: 0.4,
    },
    parts: [
      { k: 'helm', c: pat, rim: sh(pat, -1) },
      { k: 'eyeRows', rows: 2, r: 0.62 },
      { k: 'carapace', t0: -0.18, t1: 0.5, bands: 4, spread: 1.45, lift: 1.1, c: pat, rim: sh(pat, -1), dome: true },
      { k: 'tailFan', size: 0.75, c: ['coral', 3], rays: 9 },
      { k: 'mane', len: 0.42, c: sh(belly, 1), ruff: 1.4 },
    ],
  };
};
