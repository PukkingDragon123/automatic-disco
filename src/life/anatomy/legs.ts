// ANATOMY LIBRARY: legs by kind. Station sets (LimbRing) and feet (FootSpec) for every kind of vertebrate leg, written
// against the leg's own joints so they fit any rig: a hoofed runner (a heavy haunch over a lean gaskin, the point of
// the hock, a slender cannon with its tendon standing behind, the fetlock knob, a short pastern into the hoof), a
// digitigrade paw (the same leg ending in a padded foot of four toes), a bear's plantigrade column on a broad sole of
// five clawed toes, a lizard's sprawling limb (a bulging thigh, splayed fingers), a frog's folded leaper (a huge thigh,
// long shin and tarsus, long webbed toes), a bird's leg (drumstick and scaly shank, three toes forward and one back),
// the pillar of a giant, and the knuckle-walker's fist.
//   const R = legRings('hoof', fore, r, tj, segL)      tj: t of every joint (hip .. sole), segL: segment lengths (m)
//   const F = legFoot('hoof', fore, r, o)
import type { LimbRing, FootSpec, ToeSpec } from './limb';
import { LIMB_TYPES } from './limb';

export type LegKind = 'hoof' | 'stilt' | 'paw' | 'bear' | 'pillar' | 'sprawl' | 'leap' | 'bird' | 'knuckle';

/** rings for a leg of a kind; `r` the base radius (m), `tj` the joints' t (hip, knee, [hock], sole), `segL` the
 *  segments' lengths, `foot` the height (m) of whatever stands at the sole (hoof wall, pad) */
export function legRings(kind: LegKind, fore: boolean, r: number, tj: number[], segL: number[], foot: number): LimbRing[] {
  const n = tj.length - 1, last = segL[n - 1];
  const at = (seg: number, f: number) => tj[seg] + (tj[seg + 1] - tj[seg]) * f;
  const up = (m: number) => Math.max(tj[n - 1] + 0.02, 1 - (m / Math.max(1e-6, last)) * (1 - tj[n - 1]));
  const R = (t: number, k: number, e = 1, b?: [number, number, number][], crease?: number, off?: [number, number]): LimbRing => ({ t, r: r * k, e, b, crease, ink: !!crease, off });
  const top: LimbRing[] = [R(-0.32, 0.8, 1.6, undefined, undefined, [-0.45, 0]), R(-0.1, 1.02, 1.5, [[0, 0.1, 50], [175, 0.2, 50]], undefined, [-0.15, 0])];
  switch (kind) {
    case 'hoof': case 'stilt': {
      const k = kind === 'stilt' ? 0.72 : 1, hh = foot, three = n === 3;
      const low = [
        R(up(hh * 2.5), 0.3 * k, 1.12, [[175, 0.16, 26]]),
        R(up(hh * 2.0), 0.37 * k, 1.12, [[0, 0.06, 40], [180, 0.22, 40], [90, 0.05, 30], [-90, 0.05, 30]], 1), // the fetlock
        R(up(hh * 1.45), 0.31 * k, 1.05, [[0, 0.04, 40]]), // the pastern
        R(up(hh * 0.98), 0.36 * k, 1.1, undefined, 1.2), // the coronet band
        R(up(hh * 0.55), 0.3 * k, 1.0),
      ];
      if (three) return [...top,
        R(at(0, 0.45), 1.15 * (kind === 'stilt' ? 0.85 : 1), 1.35, [[15, 0.14, 45], [170, 0.26, 40], [-90, -0.05, 40]]),
        R(at(0, 0.86), 0.8 * k, 1.2, [[0, 0.16, 30], [180, 0.1, 40]]),
        R(tj[1], 0.62 * k, 1.12, [[0, 0.26, 26]], 1), // the stifle
        R(at(1, 0.28), 0.6 * k, 1.3, [[170, 0.28, 40], [10, 0.06, 30]]), // the gaskin
        R(at(1, 0.72), 0.4 * k, 1.35, [[180, 0.32, 20]]), // the achilles tendon
        R(tj[2], 0.4 * k, 1.38, [[180, 0.6, 22], [90, 0.12, 30], [-90, 0.12, 30]], 1.2), // the hock and its point
        R(at(2, 0.16), 0.32 * k, 1.12, [[175, 0.16, 25]]),
        R(at(2, 0.5), 0.28 * k, 1.3, [[180, 0.26, 20]]), // the cannon, the flexor tendon behind
        ...low];
      return [...top,
        R(at(0, 0.32), 0.95 * (kind === 'stilt' ? 0.8 : 1), 1.15, [[10, 0.18, 45], [-70, 0.06, 40], [170, 0.08, 40]]), // the forearm's muscle
        R(at(0, 0.78), 0.56 * k, 1.05, [[0, 0.04, 40]]),
        R(tj[1], 0.54 * k, 0.95, [[0, 0.12, 50], [180, 0.24, 25]], 1), // the knee (carpus): flat in front, the accessory bone behind
        R(at(1, 0.14), 0.4 * k, 1.05),
        R(at(1, 0.48), 0.3 * k, 1.3, [[180, 0.24, 22]]),
        ...low];
    }
    case 'paw': {
      const hh = foot, three = n === 3;
      const low = [R(up(hh * 2.2), 0.34, 1.1, [[180, 0.1, 30]]), R(up(hh * 1.2), 0.38, 1.05, [[0, 0.05, 40]])];
      if (three) return [...top,
        R(at(0, 0.45), 1.12, 1.3, [[15, 0.14, 45], [170, 0.24, 40], [-90, -0.05, 40]]),
        R(at(0, 0.86), 0.78, 1.15, [[0, 0.14, 30], [180, 0.08, 40]]),
        R(tj[1], 0.62, 1.1, [[0, 0.22, 26]], 1),
        R(at(1, 0.3), 0.6, 1.25, [[170, 0.3, 40], [10, 0.05, 30]]), // the calf
        R(at(1, 0.74), 0.4, 1.3, [[180, 0.24, 22]]),
        R(tj[2], 0.38, 1.32, [[180, 0.5, 24], [90, 0.1, 30], [-90, 0.1, 30]], 1.2),
        R(at(2, 0.3), 0.32, 1.15, [[180, 0.14, 25]]),
        ...low];
      return [...top,
        R(at(0, 0.3), 0.96, 1.12, [[10, 0.2, 45], [-60, 0.06, 40], [175, 0.1, 40]]),
        R(at(0, 0.72), 0.62, 1.05, [[0, 0.06, 40]]),
        R(tj[1], 0.5, 1.0, [[0, 0.1, 45], [180, 0.16, 30]], 1), // the wrist
        R(at(1, 0.3), 0.4, 1.1, [[180, 0.12, 25]]),
        ...low];
    }
    case 'bear': case 'knuckle': {
      const kk = kind === 'knuckle' && fore ? 1.18 : 1;
      return [R(-0.32, 0.82, 1.55, undefined, undefined, [-0.45, 0]),
        R(-0.1, 1.08 * kk, 1.4, [[0, 0.12, 50], [180, 0.16, 50]], undefined, [-0.15, 0]),
        R(at(0, 0.3), 1.22 * kk, 1.18, [[15, 0.18, 45], [170, 0.2, 45], [-90, -0.04, 40]]),
        R(at(0, 0.72), 0.95 * kk, 1.1, [[10, 0.1, 40], [175, 0.12, 40]]),
        R(tj[1], 0.86 * kk, 1.05, [[0, 0.18, 32], [180, -0.06, 40]], 1),
        R(at(1, 0.22), 0.86 * kk, 1.1, [[fore ? 10 : 170, 0.22, 45]]), // the forearm's or the calf's mass
        R(at(1, 0.62), 0.7 * kk, 1.05, [[180, 0.1, 40]]),
        R(up(foot * 1.6), 0.66 * kk, 1.0, [[90, 0.06, 30], [-90, 0.06, 30]]),
      ];
    }
    case 'pillar': return LIMB_TYPES.pillar(r);
    case 'sprawl': return [R(-0.3, 0.95, 1.0, undefined, undefined, [-0.2, 0]),
      R(-0.06, 1.2, 1.0, [[0, 0.1, 50], [180, 0.14, 50]]),
      R(at(0, 0.35), 1.08, 1.05, [[20, 0.12, 50], [170, 0.18, 50]]), // the bulging thigh or upper arm
      R(at(0, 0.8), 0.72, 1.0),
      R(tj[1], 0.66, 1.0, [[0, 0.16, 35]], 1), // knee or elbow
      R(at(1, 0.3), 0.62, 1.05, [[170, 0.14, 45]]),
      R(at(1, 0.72), 0.46, 1.0),
      R(up(foot * 1.4), 0.44, 1.0, [[90, 0.08, 30], [-90, 0.08, 30]]),
    ];
    case 'leap': {
      if (n === 3 && !fore) return [R(-0.3, 1.1, 1.0, undefined, undefined, [-0.3, 0]),
        R(-0.06, 1.45, 1.05, [[0, 0.12, 50], [180, 0.2, 50]]),
        R(at(0, 0.4), 1.4, 1.1, [[15, 0.2, 45], [170, 0.24, 45]]), // the great thigh
        R(at(0, 0.85), 0.86, 1.05),
        R(tj[1], 0.6, 1.0, undefined, 1),
        R(at(1, 0.3), 0.66, 1.1, [[170, 0.22, 45]]), // the shin muscle
        R(at(1, 0.8), 0.42, 1.0),
        R(tj[2], 0.38, 1.05, [[180, 0.14, 30]], 1),
        R(at(2, 0.5), 0.3, 1.0),
        R(up(foot * 1.3), 0.3, 1.0)];
      return [R(-0.3, 0.9, 1.0, undefined, undefined, [-0.25, 0]), R(-0.06, 1.0, 1.0), R(at(0, 0.5), 0.8, 1.0, [[10, 0.1, 40]]), R(tj[1], 0.6, 1.0, undefined, 1), R(at(1, 0.5), 0.55, 1.0), R(up(foot * 1.4), 0.5, 1.0)];
    }
    case 'bird': return [...top,
      R(at(0, 0.4), 1.2, 1.25, [[0, 0.12, 50], [180, 0.18, 50]]), // the drumstick
      R(at(0, 0.88), 0.7, 1.1),
      R(tj[1], 0.58, 1.05, [[0, 0.16, 30]], 1),
      R(at(1, 0.35), 0.62, 1.2, [[170, 0.22, 40]]),
      R(at(1, 0.8), 0.34, 1.1),
      R(tj[2], 0.34, 1.15, [[180, 0.3, 26]], 1),
      R(at(2, 0.5), 0.26, 1.1),
      R(up(foot * 1.5), 0.27, 1.0)];
  }
}

/** the foot at the sole of a leg of a kind */
export function legFoot(kind: LegKind, fore: boolean, r: number, o: { toes?: number; claw?: number; web?: number; small?: boolean } = {}): FootSpec {
  const ta = o.small ? 6 : 8, cl = o.claw ?? 1;
  const fan = (n: number, spread: number, len: number, tr: number, claw: number, curl: number, drop = 0.2): ToeSpec[] => Array.from({ length: n }, (_, i) => { const f = n === 1 ? 0 : i / (n - 1) - 0.5; return { a: f * spread * 2, len: len * (1 - Math.abs(f) * 0.5), r: tr * (1 - Math.abs(f) * 0.25), claw: claw * (1 - Math.abs(f) * 0.3), curl, drop }; });
  switch (kind) {
    case 'paw': {
      const toes = fan(o.toes ?? 4, 40, r * 0.38, r * 0.17, r * 0.22 * cl, 0.7, 0.25);
      if (fore) toes.push({ a: -100, len: r * 0.05, r: r * 0.1, claw: r * 0.14 * cl, curl: 0.8, drop: -0.6 }); // the dewclaw, high on the inside
      return { pad: r * 0.5, h: r * 0.32, fwd: 0.35, nail: 'claw', lobe: 0.2, toes, toeAround: ta };
    }
    case 'bear': return { pad: r * 0.72, h: r * 0.3, fwd: 0.25, nail: 'claw', lobe: 0.14, toes: fan(o.toes ?? 5, 52, r * 0.26, r * 0.19, r * (fore ? 0.62 : 0.4) * cl, 0.45, 0.3), toeAround: ta };
    case 'knuckle': return fore
      ? { pad: r * 0.78, h: r * 0.4, fwd: 0.3, nail: 'nail', lobe: 0.2, toes: fan(4, 34, r * 0.22, r * 0.27, r * 0.12, 0.2, 0.55), toeAround: ta }
      : legFoot('bear', false, r, o);
    case 'sprawl': return { pad: r * 0.42, h: r * 0.25, fwd: 0.2, nail: 'claw', lobe: 0.22, toes: fan(o.toes ?? 5, fore ? 70 : 64, r * 0.7, r * 0.12, r * 0.26 * cl, 0.5, 0.1), toeAround: ta, web: o.web };
    case 'leap': return fore
      ? { pad: r * 0.4, h: r * 0.25, fwd: 0.1, nail: 'nail', lobe: 0.25, toes: fan(4, 62, r * 0.65, r * 0.12, r * 0.06, 0.1, 0.05), toeAround: ta, web: o.web }
      : { pad: r * 0.42, h: r * 0.22, fwd: 0.2, nail: 'nail', lobe: 0.25, toes: fan(5, 42, r * 1.5, r * 0.11, r * 0.06, 0.1, 0.05), toeAround: ta, web: o.web ?? 0.7 };
    case 'bird': return { pad: r * 0.32, h: r * 0.22, fwd: 0.2, nail: 'claw', lobe: 0.2, toeAround: ta, toes: [{ a: -28, len: r * 1.0, r: r * 0.13, claw: r * 0.3 * cl, curl: 0.7 }, { a: 0, len: r * 1.25, r: r * 0.14, claw: r * 0.34 * cl, curl: 0.7 }, { a: 28, len: r * 1.0, r: r * 0.13, claw: r * 0.3 * cl, curl: 0.7 }, { a: 180, len: r * 0.45, r: r * 0.11, claw: r * 0.26 * cl, curl: 0.8 }] };
    case 'pillar': return { pad: r * 1.08, h: r * 0.42, fwd: 0.12, nail: 'nail', lobe: 0.2, toeAround: ta, toes: [-58, -28, 0, 28, 58].map((a, k) => ({ a, len: r * 0.08, r: r * (0.24 - Math.abs(k - 2) * 0.025), claw: r * (0.36 - Math.abs(k - 2) * 0.04), curl: 0.4, drop: 0.25 })) };
    case 'hoof': case 'stilt': default: return { pad: r * 0.3, h: r * 0.2, nail: 'hoof', toes: [], noPad: true, toeAround: ta };
  }
}
/** the height (m) of what stands at the sole: the hoof wall, the pad */
export const footHeight = (kind: LegKind, r: number) => (kind === 'hoof' ? r * 0.36 : kind === 'stilt' ? r * 0.28 : kind === 'paw' ? r * 0.32 : kind === 'bear' || kind === 'knuckle' ? r * 0.3 : kind === 'pillar' ? r * 0.42 : r * 0.25);
