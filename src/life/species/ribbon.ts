// RIBBON STRIDER (Taeniocursor tenuis): three metres of scaled ribbon slung between four tiny, widely spread legs; it
// slides through the grass stems like a dropped belt, flat head first, and strikes small animals from below.
import type { SpeciesFn } from './index';
import { rs, sh, scales } from './util';

export const ribbon: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), eye = rs(d.colors.eye);
  return {
    trunk: { chest: [0.4, 0.36, 0.4], barrel: [0.42, 0.36, 0.42], waist: [0.4, 0.36, 0.4], hips: [0.4, 0.36, 0.38], prof: ['flat', 'flat', 'flat', 'flat'], neck: { r0: 1.0, r1: 0.9 }, tail: { r0: 0.95, taper: 0.88, flat: 1.3 } },
    head: { skull: 'lacertid', len: 1.0, wid: 1.15, hgt: 0.75, muzzle: 1.1, eyes: { r: 0.13, pupil: 'slit', iris: eye, lid: 0.06 }, nose: 'nostrils', teeth: { canine: 0.12 }, tongue: 'flick' },
    legs: { fore: { kind: 'sprawl', r: 0.7 }, hind: { kind: 'sprawl', r: 0.75 } },
    coat: {
      base, belly, bellyArc: 0.75,
      pattern: { kind: 'bands', c: pat, scale: 0.7 },
      surf: { body: scales(W, 1.2, 'keel'), belly: scales(W, 1.6, 'scute'), limb: scales(W, 0.6, 'shield'), face: scales(W, 0.6, 'pebble'), muzzle: scales(W, 0.45, 'pebble') },
      face: { chin: belly }, claw: ['basalt', 2],
    },
    parts: [{ k: 'crest', t0: -0.5, t1: 2.5, h: 0.12, kind: 'spikes', c: sh(base, -1) }],
  };
};
