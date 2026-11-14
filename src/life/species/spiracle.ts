// SPIRACLE STRIDER (Hexapodus quadroculus): a six-limbed grazer of this world's own vertebrate line: four eyes in two
// rows, a row of breathing spiracles down each flank feeding air sacs along the ribs, a back shingled in olive
// plates; it plods in an unbreakable six-footed gait.
import type { SpeciesFn } from './index';
import { rs, sh, hide, scales } from './util';

export const spiracle: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), eye = rs(d.colors.eye), acc = rs(d.colors.accent);
  return {
    trunk: { chest: [0.46, 0.54, 0.62], barrel: [0.5, 0.56, 0.6], waist: [0.48, 0.54, 0.56], hips: [0.46, 0.52, 0.5], prof: ['shoulder', 'barrel', 'barrel', 'hips'], neck: { r0: 0.9, r1: 0.62, arch: 0.1, dewlap: 0.2 }, tail: { r0: 0.5, taper: 0.76 } },
    head: { skull: 'grazer', len: 1.0, wid: 1.0, hgt: 0.95, pitch: 0.18, eyes: { r: 0.11, pupil: 'bar', iris: eye, lid: 0.1 }, ears: { len: 0.35, wid: 0.2, up: 0.4, out: 1, back: 0.5 }, nose: 'nostrils', tongue: 'plain' },
    legs: { fore: { kind: 'hoof', r: 1.0, cleft: true }, mid: { kind: 'hoof', r: 1.0, cleft: true }, hind: { kind: 'hoof', r: 1.05, cleft: true } },
    coat: {
      base, belly, back: sh(base, -1), bellyArc: 0.95,
      pattern: { kind: 'bands', c: pat, scale: 1.4 },
      surf: { body: hide(W, 1.0, 1.0), belly: scales(W, 1.2, 'scute'), limb: hide(W, 0.8, 1.2), face: hide(W, 0.6), muzzle: hide(W, 0.4, 0.5) },
      face: { muzzle: sh(base, 1), chin: belly }, horn: ['basalt', 2],
    },
    parts: [
      { k: 'plates', t0: 0.05, t1: 1.0, rows: 13, per: 4, spread: 1.4, size: 0.45, c: sh(base, 1), keel: true },
      { k: 'spiracles', n: 7, t0: 0.15, t1: 0.92, c: acc },
      { k: 'eyeRows', rows: 1, r: 0.85 },
    ],
  };
};
