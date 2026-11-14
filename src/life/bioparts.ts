// Visible anatomy for the functional (biotech) genes (genesBio.ts): every engineered producer shows what it does at
// a glance. Each gene's `part` grows one hand-modelled organ anchored on body landmarks that every body plan has (the
// back and belly along the spine where there is one, else the root, head, tail and feet bones), painted from the
// master palette with planar clusters, a lit edge and a glint on the wet or glassy ones.
import { RAMPS, type RampName } from '../art/palette';
import { type Region, sac, ball, blade, addV, scl, norm, cross, hash, type V3, type Wt } from './kit';
import { type Ctx } from './sculpt';
import { GENE } from './genes';

const RP = (n: RampName) => RAMPS[n] as unknown as number[];
/** a landmark: a point on the body, its outward normal, its skin weights */
interface Mark { p: V3; n: V3; w: Wt; s: number }
function anchors(S: Ctx) {
  const rig = S.rig, at = (i: number) => S.rest[i], sp = S.spine;
  const L = rig.length, W = rig.width;
  const along = (t: number, a: number): Mark => {
    if (sp) {
      const k = Math.max(0, Math.min(sp.pts.length - 1, Math.round(t * (sp.pts.length - 1)))), f = sp.fr[k];
      const n = norm(addV(scl(f.v, Math.cos(a)), scl(f.u, Math.sin(a))));
      return { p: addV(sp.pts[k], addV(scl(f.v, Math.cos(a) * sp.rv[k] * 0.95), scl(f.u, Math.sin(a) * sp.ru[k] * 0.95))), n, w: sp.w[k], s: (sp.ru[k] + sp.rv[k]) / 2 };
    }
    // plans without a spine loft: between the head and the last body segment
    const h = at(rig.head >= 0 ? rig.head : rig.root), b = rig.tail.length ? at(rig.tail[rig.tail.length - 1]) : at(rig.root);
    const p = [h[0] + (b[0] - h[0]) * t, h[1] + (b[1] - h[1]) * t, h[2] + (b[2] - h[2]) * t] as V3, n: V3 = [Math.sin(a), Math.cos(a), 0];
    return { p: addV(p, scl(n, W * 0.4)), n, w: [t < 0.4 ? rig.root : rig.tail[0] ?? rig.root, 1], s: W * 0.4 };
  };
  const head = rig.head >= 0 ? at(rig.head) : at(rig.root), hw = (rig.dims.hw ?? W * 0.6), hl = rig.dims.hl ?? L * 0.2;
  const feet = rig.legs.filter((l) => l.kind === 'fore' || l.pair === 0).map((l) => ({ p: at(l.bones[l.bones.length - 1]), w: [l.bones[l.bones.length - 1], 1] as Wt, s: l.side }));
  return { along, head, hw, hl, L, W, iH: rig.head >= 0 ? rig.head : rig.root, feet };
}
/** a region painted as one material: planar light-side / shade-side clusters, a lit edge, an optional glint */
function mat(S: Ctx, name: string, ramp: RampName, glint = false): Region {
  const r = S.fixed(name, 8, 8);
  if (!S.paints.some((p) => (p as any)[name])) {
    const p = () => {
      const R = RP(ramp);
      r.fill(R, (x, y) => { const c = Math.cos(r.th(x)); return (c > 0.45 ? 4 : c > -0.3 ? 3 : 2) + (y % 4 === 0 ? -1 : 0) + (c > 0.85 && y < r.h * 0.4 ? 1 : 0); });
      if (glint) for (let i = 0; i < 3; i++) r.set(r.X(-20 + i * 40), Math.floor(r.h * (0.3 + i * 0.2)), RAMPS.snow[5]);
    };
    (p as any)[name] = 1; S.paints.push(p);
  }
  return r;
}
const cone = (S: Ctx, reg: Region, base: V3, dir: V3, len: number, r: number, w: Wt, n = 6, sq = 2) => sac(S.B, reg, S.gid(), [base, addV(base, scl(dir, len * 0.5)), addV(base, scl(dir, len))], [[r, r], [r * 0.7, r * 0.7], [r * 0.08, r * 0.08]], [w, w, w], { n, sq });

export function growBio(S: Ctx) {
  const parts = new Set(S.d.genes.map((g) => GENE[g]?.part).filter(Boolean) as string[]);
  if (!parts.size) return;
  const A = anchors(S), { along, head, hw, hl, W } = A, h = (k: string) => parts.has(k);
  // ---- along the back
  if (h('crystalcoral')) { const R = mat(S, 'BIO_CRYS', 'glowTeal', true); for (let i = 0; i < 7; i++) { const m = along(0.3 + i * 0.07, (i % 2 ? 0.35 : -0.35)); for (let j = 0; j < 3; j++) cone(S, R, m.p, norm(addV(m.n, [(j - 1) * 0.4, 0, (j - 1) * 0.2])), W * (0.3 + ((i * 3 + j) % 4) * 0.08), W * 0.06, m.w, 5, 2.6); } }
  if (h('algaemat')) { const R = mat(S, 'BIO_ALGA', 'moss'); for (let i = 0; i < 5; i++) { const m = along(0.35 + i * 0.09, 0); ball(S.B, R, S.gid(), m.p, m.n, [m.s * 0.7, m.s * 0.6, W * 0.05], m.w, { n: 8, rings: 3, sq: 2.6 }); } }
  if (h('resinbark')) { const R = mat(S, 'BIO_RES', 'brass', true); for (let i = 0; i < 6; i++) for (const a of [-0.7, 0.7]) { const m = along(0.32 + i * 0.08, a); ball(S.B, R, S.gid(), m.p, m.n, [W * 0.14, W * 0.1, W * 0.05], m.w, { n: 6, rings: 3, sq: 2.8 }); } }
  if (h('nodules')) { const R = mat(S, 'BIO_NOD', 'rust'); for (let i = 0; i < 8; i++) { const m = along(0.3 + (i >> 1) * 0.12, (i & 1 ? 1.4 : -1.4)); ball(S.B, R, S.gid(), m.p, m.n, [W * 0.09, W * 0.09, W * 0.07], m.w, { n: 8, rings: 4 }); } }
  if (h('dewleaf')) { const R = mat(S, 'BIO_LEAF', 'moss'); for (let i = 0; i < 6; i++) { const m = along(0.3 + i * 0.08, (i % 2 ? 0.5 : -0.5)), d = norm(addV(m.n, [0, 0.4, -0.6])); blade(S.B, R, [m.p, addV(m.p, scl(d, W * 0.3)), addV(m.p, scl(d, W * 0.55))], [W * 0.06, W * 0.14, W * 0.02], norm(cross(d, [0, 1, 0])), [m.w, m.w, m.w], { offset: -0.5 }); } }
  if (h('fruitload')) { const R = mat(S, 'BIO_FRUIT', 'coral', true); for (let i = 0; i < 6; i++) { const m = along(0.34 + (i >> 1) * 0.12, (i & 1 ? 1.2 : -1.2)); ball(S.B, R, S.gid(), addV(m.p, [0, -W * 0.08, 0]), [0, -1, 0], [W * 0.1, W * 0.1, W * 0.12], m.w, { n: 8, rings: 4 }); } }
  if (h('pannierback')) { const R = mat(S, 'BIO_PAN', 'hide'); for (const a of [-1.45, 1.45]) { const m = along(0.45, a); ball(S.B, R, S.gid(), addV(m.p, scl(m.n, W * 0.1)), m.n, [W * 0.24, W * 0.3, W * 0.16], m.w, { n: 8, rings: 3, sq: 3 }); } }
  if (h('metalroot')) { const R = mat(S, 'BIO_ROOT', 'steel', true); for (let i = 0; i < 5; i++) { const m = along(0.35 + i * 0.1, Math.PI); cone(S, R, m.p, norm([(i - 2) * 0.2, -1, 0.1]), W * 0.45, W * 0.05, m.w, 5); } }
  if (h('oilglands') || h('cementglands') || h('bindslime')) { const R = mat(S, 'BIO_GLAND', h('oilglands') ? 'brass' : h('cementglands') ? 'stone' : 'teal', true); for (let i = 0; i < 4; i++) { const m = along(0.62 + i * 0.06, (i % 2 ? 1.9 : -1.9)); ball(S.B, R, S.gid(), m.p, m.n, [W * 0.08, W * 0.07, W * 0.06], m.w, { n: 8, rings: 4 }); } }
  if (h('hackles')) { const R = mat(S, 'BIO_HACK', 'fur'); for (let i = 0; i < 9; i++) { const m = along(0.12 + i * 0.03, 0); cone(S, R, m.p, norm(addV(m.n, [0, 0.2, -0.5])), W * 0.35, W * 0.03, m.w, 4); } }
  if (h('growthgland')) { const R = mat(S, 'BIO_GROW', 'flesh', true); for (const a of [-1.6, 1.6]) { const m = along(0.14, a); ball(S.B, R, S.gid(), m.p, m.n, [W * 0.14, W * 0.12, W * 0.1], m.w, { n: 10, rings: 4 }); } }
  if (h('rotgut')) { const R = mat(S, 'BIO_GUT', 'olive'); const m = along(0.48, Math.PI); ball(S.B, R, S.gid(), m.p, m.n, [W * 0.38, W * 0.34, W * 0.24], m.w, { n: 12, rings: 5 }); }
  if (h('udder')) { const R = mat(S, 'BIO_UDD', 'flesh'); const m = along(0.62, Math.PI); ball(S.B, R, S.gid(), m.p, m.n, [W * 0.22, W * 0.2, W * 0.18], m.w, { n: 10, rings: 5 }); for (let i = 0; i < 4; i++) cone(S, R, addV(m.p, [((i & 1) - 0.5) * W * 0.18, -W * 0.16, ((i >> 1) - 0.5) * W * 0.16]), [0, -1, 0], W * 0.08, W * 0.03, m.w, 5); }
  // a heavy fleece: overlapping clumps of wool of uneven size scattered over the back and flanks, none in rows
  if (h('fleece')) { const R = mat(S, 'BIO_FLEECE', 'bone'); for (let i = 0; i < 30; i++) { const j = (k: number) => hash(i, k + 61), m = along(0.2 + j(1) * 0.62, (j(2) - 0.5) * 2.8), z = 0.75 + j(3) * 0.6; ball(S.B, R, S.gid(), m.p, m.n, [W * 0.15 * z, W * 0.13 * z, W * 0.09 * z], m.w, { n: 8, rings: 3 }); } }
  if (h('pollenbrush')) { const R = mat(S, 'BIO_POLL', 'ochre'); for (const f of A.feet) for (let i = 0; i < 4; i++) cone(S, R, addV(f.p, [f.s * W * 0.05, W * (0.15 + i * 0.06), 0]), norm([f.s, 0.3, -0.4]), W * 0.16, W * 0.03, f.w, 4); }
  // ---- tail end
  if (h('spinnerets') || h('damtail')) {
    const m = along(0.97, Math.PI);
    if (h('spinnerets')) { const R = mat(S, 'BIO_SPIN', 'bone', true); for (let i = 0; i < 4; i++) cone(S, R, addV(m.p, [((i & 1) - 0.5) * W * 0.1, 0, ((i >> 1) - 0.5) * W * 0.08]), norm([((i & 1) - 0.5) * 0.4, -1, -0.5]), W * 0.12, W * 0.035, m.w, 5); }
    if (h('damtail')) { const R = mat(S, 'BIO_DAM', 'soil'); const t = along(0.96, 0); blade(S.B, R, [t.p, addV(t.p, [0, 0, -W * 0.4]), addV(t.p, [0, 0, -W * 0.8])], [W * 0.3, W * 0.36, W * 0.2], [1, 0, 0], [t.w, t.w, t.w], { offset: -0.5 }); }
  }
  // ---- head
  const iH = A.iH, wh: Wt = [iH, 1], snout = addV(head, [0, 0, hl * 0.9]);
  if (h('drillsnout')) { const R = mat(S, 'BIO_DRILL', 'steel', true); sac(S.B, R, S.gid(), [snout, addV(snout, [0, 0, hl * 0.35]), addV(snout, [0, 0, hl * 0.7])], [[hw * 0.2, hw * 0.2], [hw * 0.12, hw * 0.12], [0.003, 0.003]], [wh, wh, wh], { n: 8, sq: 2, bump: (a, t) => 0.25 * Math.max(0, Math.sin(a * 2 + t * 30)) }); }
  if (h('pestnose') || h('dowsepits')) { const R = mat(S, 'BIO_PIT', 'ink'); for (let i = 0; i < 6; i++) ball(S.B, R, S.gid(), addV(head, [((i % 2) - 0.5) * hw * 0.5, hw * 0.12, hl * (0.55 + (i >> 1) * 0.1)]), [0, 1, 0.3], [hw * 0.04, hw * 0.03, hw * 0.02], wh, { n: 6, rings: 3 }); }
  if (h('soldierhead')) { const R = mat(S, 'BIO_HELM', 'slate', true); ball(S.B, R, S.gid(), addV(head, [0, hw * 0.35, hl * 0.2]), [0, 0.6, 1], [hw * 0.6, hw * 0.3, hl * 0.4], wh, { n: 12, rings: 5, sq: 2.6 }); }
  if (h('oregizzard') || h('silicacrop')) { const R = mat(S, 'BIO_CROP', h('oregizzard') ? 'rust' : 'sand'); ball(S.B, R, S.gid(), addV(head, [0, -hw * 0.5, -hl * 0.05]), [0, -1, 0.3], [hw * 0.4, hw * 0.34, hw * 0.36], wh, { n: 12, rings: 5 }); }
  // ---- forefeet
  if (h('digclaws')) { const R = mat(S, 'BIO_DIG', 'bone', true); for (const f of A.feet) for (let i = 0; i < 3; i++) blade(S.B, R, [addV(f.p, [(i - 1) * W * 0.07, W * 0.04, W * 0.08]), addV(f.p, [(i - 1) * W * 0.08, W * 0.0, W * 0.2]), addV(f.p, [(i - 1) * W * 0.08, -W * 0.03, W * 0.3])], [W * 0.05, W * 0.06, W * 0.02], [1, 0, 0], [f.w, f.w, f.w], { offset: -0.5 }); }
  if (h('finehands')) { const R = mat(S, 'BIO_HAND', 'hide'); for (const f of A.feet) for (let i = 0; i < 5; i++) cone(S, R, addV(f.p, [(i - 2) * W * 0.04, W * 0.03, W * 0.06]), norm([(i - 2) * 0.15, -0.1, 1]), W * 0.14, W * 0.018, f.w, 4); }
}
