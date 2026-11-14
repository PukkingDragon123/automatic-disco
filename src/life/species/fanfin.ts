// FANFIN WADER (Flabellipinna vadans): a tall wader of the lungfish-lizard line: smooth wet skin, a fan of rayed frills
// behind the jaw it spreads to cool its blood and to court, a second fan at the tail tip, a long soft sieving snout.
import type { SpeciesFn } from './index';
import { rs, sh, wet } from './util';

export const fanfin: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), eye = rs(d.colors.eye), acc = rs(d.colors.accent);
  return {
    trunk: { chest: [0.42, 0.52, 0.62], barrel: [0.46, 0.5, 0.56], waist: [0.4, 0.46, 0.44], hips: [0.42, 0.48, 0.44], prof: ['barrel', 'barrel', 'sag', 'hips'], neck: { r0: 0.72, r1: 0.45, arch: 0.06 }, tail: { r0: 0.45, taper: 0.78, flat: 0.7 } },
    head: { skull: 'lacertid', len: 1.0, wid: 0.85, hgt: 1.05, muzzle: 1.4, pitch: 0.12, eyes: { r: 0.17, pupil: 'w', iris: eye, lid: 0.04, sink: 0.3 }, nose: 'nostrils', tongue: 'plain' },
    legs: { fore: { kind: 'stilt', r: 0.9, cleft: true }, hind: { kind: 'stilt', r: 0.95, cleft: true } },
    coat: {
      base, belly, bellyArc: 0.95,
      pattern: { kind: 'speckle', c: pat, scale: 0.6, on: { limbs: true, head: true, tail: true } },
      surf: { body: wet(W, 0.18), limb: wet(W, 0.1, 0.7), face: wet(W, 0.15, 0.6) },
      face: { chin: sh(belly, 0) }, horn: ['plum', 1], ribs: 0.8,
    },
    parts: [
      { k: 'headFans', size: 1.15, c: acc, rays: 7 },
      { k: 'tailFan', size: 0.6, c: acc, rays: 7 },
      { k: 'crest', t0: -0.3, t1: 1.6, h: 0.16, kind: 'fin', c: sh(acc, -1) },
    ],
  };
};
