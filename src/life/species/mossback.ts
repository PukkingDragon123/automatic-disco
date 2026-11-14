// MOSSBACK (Testudocervus muscosus): a five-metre browser carrying its ribs outside, a domed shield of overlapping bone
// bands grown over with moss, over a shaggy body; a small beaked head hangs low under the shield's rim; near-blind.
import type { SpeciesFn } from './index';
import { rs, sh, fur, hide } from './util';

export const mossback: SpeciesFn = (d, rig) => {
  const W = rig.dims.W, base = rs(d.colors.base), belly = rs(d.colors.belly), eye = rs(d.colors.eye);
  return {
    trunk: { chest: [0.44, 0.5, 0.72], barrel: [0.52, 0.56, 0.7], waist: [0.5, 0.5, 0.62], hips: [0.47, 0.5, 0.52], prof: ['shoulder', 'barrel', 'sag', 'hips'], neck: { r0: 0.95, r1: 0.6, arch: -0.05, dewlap: 0.3 }, tail: { r0: 0.35, taper: 0.7 } },
    head: { skull: 'browser', len: 1.0, wid: 1.05, pitch: 0.25, muzzle: 1.1, eyes: { r: 0.09, pupil: 'round', iris: eye, lid: 0.18 }, ears: { len: 0.32, wid: 0.22, up: 0.1, out: 1, back: 0.5, cup: 0.7, curl: 0.3 }, nose: 'nostrils', tongue: 'plain' },
    legs: { fore: { kind: 'pillar', r: 1.15 }, hind: { kind: 'pillar', r: 1.2 } },
    coat: {
      base, belly, back: sh(base, -1), bellyArc: 1.1,
      surf: { body: fur(W, 1.5, 0.7), limb: hide(W, 1.1, 1.2), sock: hide(W, 1.1, 1.2), foot: hide(W, 0.8), face: hide(W, 0.6), muzzle: hide(W, 0.5) },
      socks: { c: ['hide', 2], h: rig.dims.legLen * 0.85 }, face: { muzzle: ['hide', 2] }, claw: ['basalt', 2], scars: 2, mud: { h: rig.dims.legLen * 0.35, ramp: 'soil' },
    },
    parts: [
      { k: 'carapace', t0: -0.15, t1: 1.0, bands: 7, spread: 2.05, lift: 2.4, c: ['stone', 4], rim: ['stone', 4], moss: 1.6, dome: true },
      { k: 'shag', t0: 0.0, t1: 1.0, len: 0.34, density: 0.55, fringe: 1.6, flank: 0.0, col: sh(base, -1) },
      { k: 'beak', c: ['basalt', 3], hook: 1.2 },
      { k: 'brow', size: 1.2, c: ['stone', 3] },
    ],
  };
};
