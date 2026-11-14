// ANATOMY LIBRARY: growth on a body. Small trees rooted in a titan's back (a flared, buttressed trunk, two or three
// limbs, lumpy canopy masses), and crusts (lichen cups, barnacle cones, warts) scattered in clusters over a host.
import type { V3, Wt } from '../kit';
import { type Piece, type Chart, type Body, gridSurf } from './core';
import { stalk, sac, bulbs, curve } from './append';

type Paint = (c: Chart, p: Piece, b: Body) => void;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const hs = (a: number, b: number) => { let x = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul((b | 0) + 0x3c6ef372, 0x165667b1); x = Math.imul(x ^ (x >>> 15), 0x85ebca6b); x ^= x >>> 13; return (x >>> 0) / 4294967296; };

/** a small tree: trunk from `base` up along `up` (height h), buttress flare, limbs, canopy masses */
export function tree(o: { name: string; base: V3; up: V3; h: number; r: number; seed: number; skin: (p: V3) => Wt; bark: Paint; leaf: Paint; lean?: V3 }): Piece[] {
  const out: Piece[] = [], up = nrm(o.up), lean = o.lean ?? [0, 0, 0], r = o.r, S = o.seed;
  const top = add(add(o.base, scl(up, o.h)), scl(lean, o.h * 0.25));
  const ctrl: V3[] = [add(o.base, scl(up, -r * 1.5)), o.base, add(add(o.base, scl(up, o.h * 0.4)), scl(lean, o.h * 0.05)), add(add(o.base, scl(up, o.h * 0.75)), scl(lean, o.h * 0.15)), top];
  const path = curve(ctrl, 9);
  // the buttressed root flare: the section lobes out low down
  out.push(stalk({ name: o.name + 'tr', path, r: (t) => r * (1 - t * 0.6) * (t < 0.25 ? 1 + (0.25 - t) * 4 : 1), around: 8, sec: (a, t) => (t < 0.25 ? 1 + 0.35 * Math.max(0, Math.cos(a * 4 + S)) * (0.25 - t) * 4 : 1), skin: o.skin, paint: o.bark, levels: 1, capE: true }));
  const nb = 2 + Math.floor(hs(S, 1) * 2);
  for (let b = 0; b < nb; b++) {
    const a = (b / nb) * Math.PI * 2 + hs(S, b + 3) * 1.5, side: V3 = [Math.cos(a), 0, Math.sin(a)];
    const at = path[5 + (b % 3)], tip = add(add(at, scl(side, o.h * (0.3 + hs(S, b) * 0.2))), scl(up, o.h * (0.25 + hs(b, S) * 0.15)));
    out.push(stalk({ name: o.name + 'b' + b, path: curve([at, add(at, scl(add(side, up), o.h * 0.12)), tip], 5), r: (t) => r * 0.42 * (1 - t * 0.7), around: 6, skin: o.skin, paint: o.bark, levels: 1 }));
    out.push(sac({ name: o.name + 'c' + b, at: tip, n: nrm(add(up, scl(side, 0.4))), r: [o.h * (0.28 + hs(S, b + 9) * 0.1), o.h * (0.2 + hs(S, b + 7) * 0.06), o.h * 0.22], sink: 0.5, skin: o.skin, paint: o.leaf, levels: 1 }));
  }
  out.push(sac({ name: o.name + 'ct', at: add(top, scl(up, -o.h * 0.08)), n: up, r: [o.h * 0.34, o.h * 0.3, o.h * 0.28], sink: 0.45, skin: o.skin, paint: o.leaf, levels: 1 }));
  for (const p of out) p.noOcc = false;
  return out;
}

/** crust clusters over a host's grid patch: `n` clusters of `per` small cones or cups, seated by gridSurf */
export function crusts(o: { name: string; host: Piece; grid?: number; u: [number, number]; v: [number, number]; n: number; per: number; size: number; cone?: boolean; seed: number; skin: (p: V3) => Wt; paint: Paint; keep?: (p: V3, n: V3) => boolean }): Piece {
  const g = o.host.grids[o.grid ?? 0], seats: { p: V3; n: V3; r: number; h?: number; cone?: boolean }[] = [];
  for (let c = 0; c < o.n; c++) {
    const u = o.u[0] + (o.u[1] - o.u[0]) * hs(o.seed, c * 3), v = o.v[0] + (o.v[1] - o.v[0]) * hs(c * 5 + 1, o.seed);
    for (let k = 0; k < o.per; k++) {
      const du = (hs(c, k * 7 + o.seed) - 0.5) * 0.03, dv = (hs(k * 11, c + o.seed) - 0.5) * 0.03, q = gridSurf(o.host.m, g, u + du, v + dv);
      if (o.keep && !o.keep(q.p, q.n)) continue;
      const r = o.size * (0.5 + hs(k, c) * 0.7);
      seats.push({ p: add(q.p, scl(q.n, -r * 0.2)), n: q.n, r, h: r * (o.cone ? 1.2 : 0.7), cone: o.cone });
    }
  }
  return bulbs({ name: o.name, seats, skin: o.skin, paint: o.paint, levels: 1 });
}
