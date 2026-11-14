// REEDNECK (Calamicollis insidians): an ambusher that is mostly neck: a squat mud-coloured body hidden in the marsh
// and a single stalk of neck standing straight up like a reed, topped by a head fringed in green leaf-frills.
import type { SpeciesFn } from './index';
import { rs, sh, hide, scales } from './util';

export const reedneck: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), eye = rs(d.colors.eye), acc = rs(d.colors.accent);
  return {
    trunk: { chest: [0.5, 0.48, 0.5], barrel: [0.54, 0.5, 0.5], waist: [0.52, 0.48, 0.48], hips: [0.48, 0.46, 0.44], prof: ['barrel', 'barrel', 'sag', 'hips'], neck: { r0: 0.55, r1: 0.4, arch: 0.02 }, tail: { r0: 0.55, taper: 0.8 } },
    head: { skull: 'lacertid', len: 1.0, wid: 0.9, muzzle: 1.2, pitch: 0.25, eyes: { r: 0.15, pupil: 'pin', iris: eye, fwd: 0.4, lid: 0.06 }, nose: 'nostrils', teeth: { canine: 0.1 }, tongue: 'flick' },
    legs: { fore: { kind: 'sprawl', r: 0.9 }, hind: { kind: 'sprawl', r: 0.95 } },
    coat: {
      base, belly, bellyArc: 0.9,
      pattern: { kind: 'mottled', c: pat, scale: 0.8, on: { limbs: true } },
      surf: { body: hide(W, 1.0, 0.8), neck: scales(W, 0.5, 'keel'), limb: hide(W, 0.7), face: scales(W, 0.35, 'pebble') },
      face: { chin: belly }, claw: ['basalt', 2], mud: { h: rig.dims.legLen * 0.6, ramp: 'soil' },
    },
    parts: [
      { k: 'headFans', size: 1.3, c: acc, rays: 6, fwd: true },
      { k: 'crest', t0: -2.5, t1: 0.2, h: 0.18, kind: 'fin', c: acc },
    ],
  };
};
