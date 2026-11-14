// ANATOMY LIBRARY: organs for the functional (biotech) genes (genesBio.ts). Each engineered producer shows what it
// does at a glance, as in bioparts.ts, but every organ is now a library piece seated on the finished body through
// its surface (gridSurf on the trunk round and along, on the skull, on the forefeet), so it grows out of the skin:
// crystal coral spires and resin blisters along the back, nitrogen nodules and glands on the flanks, a gut, an
// udder, fruit and dew leaves, pannier sacs, metal roots and spinnerets, a drill snout, sensor pits, a soldier's
// helm, a crop, digging claws and fine fingers. Painted in planar master-palette clusters with a glint on the glassy.
import type { RampName } from '../../art/palette';
import type { V3, Wt } from '../kit';
import { gridSurf, type Piece } from './core';
import { stalk, sac, bulbs, fin, curve } from './append';
import { lookPaint } from './look';
import { GENE } from '../genes';
import { h3 } from './paint';
import type { VCtx } from './vertebrate';

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** a material look per organ: one ramp, planar light, inked creases, a glint on glassy or wet ones */
const mat = (r: RampName, glint = false, step = 3) => lookPaint({ ramp: r, step, creases: 0.7, pebbles: { size: 0.02, depth: 0.4 }, glints: glint ? { size: 0.05, every: 0.6 } : undefined });

export function growOrgans(X: VCtx) {
  const parts = new Set(X.d.genes.map((g) => GENE[g]?.part).filter(Boolean) as string[]);
  if (!parts.size) return;
  const h = (k: string) => parts.has(k), W = X.W, seed = X.seed, add_ = (p: Piece, reg = 2) => { p.reg = reg; X.body.add(p); };
  // a point on the trunk: t along from the head (0) to the tail tip (1), a round from the top (+ toward +x)
  const vOf = (t: number) => { const s = (1 - t) * X.F.L, cum = X.F.cum; let k = 0; while (k + 2 < cum.length && cum[k + 1] < s) k++; const f = Math.max(0, Math.min(1, (s - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]))), R = X.tr.grids[0].v.length; return (X.tr.row(k) * (1 - f) + X.tr.row(k + 1) * f) / (R - 1); };
  const along = (t: number, a: number) => { const q = gridSurf(X.tr.m, X.tr.grids[0], 0.5 + a / (Math.PI * 2), Math.max(0, Math.min(1, vOf(t)))); return { p: q.p, n: q.n, w: X.spine(q.p) as Wt }; };
  const cone = (name: string, base: V3, dir: V3, len: number, r: number, w: Wt, paint: Piece['paint'], n = 6) => add_(stalk({ name, path: curve([add(base, scl(dir, -r)), base, add(base, scl(dir, len * 0.5)), add(base, scl(dir, len))], 4), r: (t) => r * (1 - t * 0.92) + 0.001, around: n, skin: () => w, paint, levels: 0 }));
  const blob = (name: string, p: V3, n: V3, r: [number, number, number], w: Wt, paint: Piece['paint'], sink = 0.35) => add_(sac({ name, at: p, n, up: [0, 0, 1], r, sink, skin: () => w, paint, levels: 0 }));
  // ---- along the back
  if (h('crystalcoral')) { const P = mat('glowTeal', true); for (let i = 0; i < 7; i++) { const m = along(0.3 + i * 0.07, i % 2 ? 0.35 : -0.35); for (let j = 0; j < 3; j++) cone('crys' + i + j, m.p, nrm(add(m.n, [(j - 1) * 0.4, 0, (j - 1) * 0.2])), W * (0.3 + ((i * 3 + j) % 4) * 0.08), W * 0.06, m.w, P, 5); } }
  if (h('algaemat')) { const P = mat('moss'); for (let i = 0; i < 5; i++) { const m = along(0.35 + i * 0.09, 0); blob('alga' + i, m.p, m.n, [W * 0.22, W * 0.18, W * 0.05], m.w, P, 0.5); } }
  if (h('resinbark')) { const P = mat('brass', true); for (let i = 0; i < 6; i++) for (const a of [-0.7, 0.7]) { const m = along(0.32 + i * 0.08, a); blob('res' + i + a, m.p, m.n, [W * 0.14, W * 0.1, W * 0.05], m.w, P, 0.4); } }
  if (h('nodules')) { const P = mat('rust'); const seats: { p: V3; n: V3; r: number }[] = []; for (let i = 0; i < 10; i++) { const m = along(0.3 + (i >> 1) * 0.1, i & 1 ? 1.4 : -1.4); seats.push({ p: m.p, n: m.n, r: W * 0.08 }); } add_(bulbs({ name: 'nod', seats, skin: X.spine, paint: P, levels: 0 })); }
  if (h('dewleaf')) { const P = mat('moss', true, 4); for (let i = 0; i < 6; i++) { const m = along(0.3 + i * 0.08, i % 2 ? 0.5 : -0.5), d = nrm(add(m.n, [0, 0.4, -0.6])), sd = nrm(crs(d, [0, 1, 0])); add_(fin({ name: 'dew' + i, roots: [m.p, m.p, m.p], dirs: [nrm(add(d, scl(sd, -0.4))), d, nrm(add(d, scl(sd, 0.4)))], lens: [W * 0.3, W * 0.55, W * 0.3], side: [m.n, m.n, m.n], ray: W * 0.01, web: W * 0.006, scallop: 0.1, steps: 2, skin: () => m.w, paint: P, levels: 0 })); } }
  if (h('fruitload')) { const P = mat('coral', true, 4); for (let i = 0; i < 6; i++) { const m = along(0.34 + (i >> 1) * 0.12, i & 1 ? 1.2 : -1.2); blob('fruit' + i, add(m.p, [0, -W * 0.08, 0]), [0, -1, 0], [W * 0.1, W * 0.1, W * 0.12], m.w, P, 0.2); } }
  if (h('pannierback')) { const P = mat('hide'); for (const a of [-1.45, 1.45]) { const m = along(0.45, a); blob('pan' + a, add(m.p, scl(m.n, W * 0.05)), m.n, [W * 0.24, W * 0.3, W * 0.16], m.w, P, 0.3); } }
  if (h('metalroot')) { const P = mat('steel', true); for (let i = 0; i < 5; i++) { const m = along(0.35 + i * 0.1, Math.PI); cone('root' + i, m.p, nrm([(i - 2) * 0.2, -1, 0.1]), W * 0.45, W * 0.05, m.w, P, 5); } }
  if (h('oilglands') || h('cementglands') || h('bindslime')) { const P = mat(h('oilglands') ? 'brass' : h('cementglands') ? 'stone' : 'teal', true); const seats: { p: V3; n: V3; r: number }[] = []; for (let i = 0; i < 4; i++) { const m = along(0.62 + i * 0.06, i % 2 ? 1.9 : -1.9); seats.push({ p: m.p, n: m.n, r: W * 0.08 }); } add_(bulbs({ name: 'gland', seats, skin: X.spine, paint: P, levels: 0 })); }
  if (h('hackles')) { const P = mat('fur'); for (let i = 0; i < 9; i++) { const m = along(0.12 + i * 0.03, 0); cone('hack' + i, m.p, nrm(add(m.n, [0, 0.2, -0.5])), W * 0.35, W * 0.03, m.w, P, 4); } }
  if (h('growthgland')) { const P = mat('flesh', true); for (const a of [-1.6, 1.6]) { const m = along(0.14, a); blob('grow' + a, m.p, m.n, [W * 0.14, W * 0.12, W * 0.1], m.w, P); } }
  if (h('rotgut')) { const m = along(0.48, Math.PI); blob('gut', m.p, m.n, [W * 0.38, W * 0.34, W * 0.24], m.w, mat('olive')); }
  if (h('udder')) { const P = mat('flesh'), m = along(0.62, Math.PI); blob('udder', m.p, m.n, [W * 0.22, W * 0.2, W * 0.18], m.w, P); for (let i = 0; i < 4; i++) cone('teat' + i, add(m.p, [((i & 1) - 0.5) * W * 0.18, -W * 0.16, ((i >> 1) - 0.5) * W * 0.16]), [0, -1, 0], W * 0.08, W * 0.03, m.w, P, 5); }
  if (h('fleece')) { const P = mat('bone', false, 4); for (let i = 0; i < 26; i++) { const j = (k: number) => h3(i, k + 61, seed), m = along(0.2 + j(1) * 0.62, (j(2) - 0.5) * 2.8), z = 0.75 + j(3) * 0.6; blob('fl' + i, m.p, m.n, [W * 0.15 * z, W * 0.13 * z, W * 0.09 * z], m.w, P, 0.4); } }
  const feet = X.legs.filter((l) => l.lg.kind === 'fore' && l.lg.pair === 0);
  if (h('pollenbrush')) { const P = mat('ochre'); for (const f of feet) { const fr = f.frame(0.85), w: Wt = [f.lg.bones[f.lg.bones.length - 2], 1]; for (let i = 0; i < 4; i++) cone('pol' + f.lg.side + i, add(fr.c, scl(fr.out, f.r * 0.4)), nrm(add(fr.out, [0, 0.3 - i * 0.2, -0.4])), W * 0.16, W * 0.03, w, P, 4); } }
  // ---- the tail end
  if (h('spinnerets') || h('damtail')) {
    const m = along(0.97, Math.PI);
    if (h('spinnerets')) { const P = mat('bone', true); for (let i = 0; i < 4; i++) cone('spin' + i, add(m.p, [((i & 1) - 0.5) * W * 0.1, 0, ((i >> 1) - 0.5) * W * 0.08]), nrm([((i & 1) - 0.5) * 0.4, -1, -0.5]), W * 0.12, W * 0.035, m.w, P, 5); }
    if (h('damtail')) { const t = along(0.96, 0), P = mat('soil'); add_(fin({ name: 'dam', roots: [t.p, t.p, t.p], dirs: [nrm([-0.5, 0, -1]), [0, 0, -1], nrm([0.5, 0, -1])], lens: [W * 0.7, W * 0.85, W * 0.7], side: [[0, 1, 0], [0, 1, 0], [0, 1, 0]], ray: W * 0.03, web: W * 0.02, scallop: 0.05, steps: 2, skin: () => t.w, paint: P, levels: 0 }), 10); }
  }
  // ---- the head
  const iH = X.iH, wh: Wt = [iH, 1], onSk = (j: number, s: 1 | -1, st: number) => gridSurf(X.sk.m, X.sk.grids[0], X.skCol(j, s), X.skRow(st));
  if (h('drillsnout')) { const q = onSk(0, 1, 7), n = nrm([0, 0, 1]); add_(stalk({ name: 'drill', path: curve([add(q.p, scl(n, -X.hl * 0.05)), add(q.p, scl(n, X.hl * 0.3)), add(q.p, scl(n, X.hl * 0.6))], 6), r: (t) => X.hw * 0.25 * (1 - t * 0.95) + 0.002, around: 8, ringEvery: 1, skin: () => wh, paint: mat('steel', true), levels: 0 }), 3); }
  if (h('pestnose') || h('dowsepits')) { const seats: { p: V3; n: V3; r: number }[] = []; for (let i = 0; i < 6; i++) { const q = onSk(1.4 + (i % 2) * 0.6, i % 4 < 2 ? 1 : -1, 4.6 + (i >> 1) * 0.5); seats.push({ p: add(q.p, scl(q.n, -X.hw * 0.02)), n: q.n, r: X.hw * 0.05 }); } add_(bulbs({ name: 'pits', seats, skin: () => wh, paint: mat('ink'), levels: 0 }), 3); }
  if (h('soldierhead')) { const q = onSk(0, 1, 1.6); add_(sac({ name: 'shelm', at: q.p, n: nrm(add(q.n, [0, 0, 0.6])), up: [0, 0, 1], r: [X.hw * 0.7, X.hl * 0.4, X.hh * 0.3], sink: 0.45, skin: () => wh, paint: mat('slate', true), levels: 1 }), 5); }
  if (h('oregizzard') || h('silicacrop')) { const c = add(X.hinge, [0, -X.hh * 0.45, -X.hl * 0.05]); add_(sac({ name: 'crop', at: c, n: [0, -1, 0.3], up: [0, 0, 1], r: [X.hw * 0.5, X.hw * 0.45, X.hw * 0.4], sink: 0.4, skin: () => wh, paint: mat(h('oregizzard') ? 'rust' : 'sand'), levels: 1 }), 6); }
  // ---- the forefeet
  if (h('digclaws')) { const P = mat('bone', true, 4); for (const f of feet) { const sole = X.rest[f.lg.bones[f.lg.bones.length - 1]], w: Wt = [f.lg.bones[f.lg.bones.length - 1], 1]; for (let i = 0; i < 3; i++) add_(stalk({ name: 'dig' + f.lg.side + i, path: curve([add(sole, [(i - 1) * f.r * 0.3, f.r * 0.3, f.r * 0.3]), add(sole, [(i - 1) * f.r * 0.34, f.r * 0.15, f.r * 0.9]), add(sole, [(i - 1) * f.r * 0.36, -f.r * 0.05, f.r * 1.3])], 5), r: (t) => f.r * 0.12 * (1 - t * 0.9) + 0.001, around: 5, keel: true, skin: () => w, paint: P, levels: 0 }), 8); } }
  if (h('finehands')) { const P = mat('hide', false, 4); for (const f of feet) { const sole = X.rest[f.lg.bones[f.lg.bones.length - 1]], w: Wt = [f.lg.bones[f.lg.bones.length - 1], 1]; for (let i = 0; i < 5; i++) cone('fing' + f.lg.side + i, add(sole, [(i - 2) * f.r * 0.18, f.r * 0.12, f.r * 0.25]), nrm([(i - 2) * 0.15, -0.1, 1]), f.r * 0.7, f.r * 0.07, w, P, 5); } }
}
