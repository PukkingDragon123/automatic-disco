// MIREWALKER (Paludigigas longicollis): a swamp titan, a body near forty metres long slung between four columns, a
// neck longer than the body rising to crop the fen canopy, a long tail held out level. Built from the anatomy
// library: a deep barrel arched high over the hips, a sagging belly, rib ridges down the flanks, a crest of sage
// osteoderms from the nape to the tail, three breathing slits each side at the root of the neck and a pale throat
// sac under it; a small long grazing skull with a bony nasal arch it trumpets through and a fringe of sensory
// barbels hanging from the lips; sauropod columns with a thumb claw on each forefoot and three sickle claws angled
// out on each hind foot; wet slate hide drawn in a net of wrinkles and pores, dark flank blotches, lichen crusts,
// long-healed rake scars, and the swamp's mud caked to the knees.
import type { V3 } from '../kit';
import type { Rig } from '../morph';
import type { Design } from '../design';
import { Body, gridSurf } from '../anatomy/core';
import { trunk, type Station } from '../anatomy/trunk';
import { limb, LIMB_TYPES } from '../anatomy/limb';
import { shell } from '../anatomy/armour';
import { skull, jaw, eyeball, eyelid, SKULLS, drawPits } from '../anatomy/head';
import { stalk, sac, curve } from '../anatomy/append';
import { crusts } from '../anatomy/growth';
import { lookPaint, paintLook, type Look } from '../anatomy/look';
import { Px, RP, h3 } from '../anatomy/paint';
import { titanCtx, between } from './common';

const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function mirewalker(d: Design, rig: Rig, rest: V3[]) {
  const X = titanCtx(d, rig, rest), D = X.D, W = D.W, H = D.H, T = D.T;
  const hips = X.at('hips'), chest = X.at('chest'), neck = X.at('neck'), head = X.at('head');
  const tails = rig.tail.map((i) => rest[i]), tl = tails[tails.length - 1], tp = tails[tails.length - 2];
  const tip: V3 = [0, tl[1] * 2 - tp[1] - 0.5, tl[2] * 2 - tp[2]];
  const body = new Body(2048);
  const seed = d.seed % 997;
  const pitsT: { c: V3; r: number; slit?: boolean }[] = [];
  const lichen: Look['lichen'] = [];
  // long-healed rake scars down the left flank and across the right thigh
  const scars: Look['scars'] = [];
  for (let k = 0; k < 3; k++) scars.push({ pts: [[-W * 0.5, chest[1] + H * 0.18 - k * 0.6, chest[2] - T * 0.28 - k * 0.9], [-W * 0.54, chest[1] - H * 0.05 - k * 0.6, chest[2] - T * 0.4 - k * 0.9], [-W * 0.5, chest[1] - H * 0.25 - k * 0.6, chest[2] - T * 0.5 - k * 0.9]], w: 0.14, ramp: 'stone' });
  scars.push({ pts: [[W * 0.46, hips[1] + 1, hips[2] + 1.5], [W * 0.5, hips[1] - 1.5, hips[2] + 0.2], [W * 0.44, hips[1] - 3.5, hips[2] - 0.6]], w: 0.2, ramp: 'stone' });
  const mudTop = (p: V3) => 4.6 + 0.9 * Math.sin(p[2] * 0.7 + p[0] * 1.1) + 0.4 * Math.sin(p[2] * 2.3);
  const hide = (extra?: Partial<Look>): Look => ({
    ramp: 'slate', step: 3, belly: { ramp: 'stone', step: 4, below: -0.5 },
    pebbles: { size: 0.44, pores: 0.45, depth: 1.1 }, creases: 0.7, lichen, scars,
    spots: { size: 2.6, ramp: 'slate', step: 2, density: 0.55, up: -0.35 },
    mud: { top: mudTop, ramp: 'soil', clump: 0.34 }, glints: { size: 0.6, every: 0.25 },
    ...extra,
  });
  // ---------------------------------------------------------------- trunk: tail tip, the arched back, the long neck
  // the neck arches: a bow up and back off the straight line from its root to the skull
  const nk = (t: number, dy = 0): V3 => between(neck, head, t, [0, dy + Math.sin(Math.PI * t) * H * 0.22, -Math.sin(Math.PI * t) * H * 0.12]);
  const st: Station[] = [
    { c: tip, s: [0.22, 0.26], p: 'ridge' },
    { c: tl, s: [0.75, 0.9], p: 'ridge' },
    { c: tails[2], s: [1.4, 1.65], p: 'ridge' },
    { c: tails[1], s: [2.3, 2.6], p: 'ridge' },
    { c: between(tails[0], tails[0], 0, [0, 0.4, 0]), s: [3.3, 3.8], p: 'ridge' },
    { c: between(hips, hips, 0, [0, H * 0.1, -T * 0.11]), s: [W * 0.36, H * 0.45], p: 'hips' },
    { c: between(hips, hips, 0, [0, H * 0.08, 0]), s: [W * 0.47, H * 0.56], p: 'hips' },
    { c: between(hips, chest, 0.33, [0, -H * 0.02, 0]), s: [W * 0.53, H * 0.62], p: 'sag' },
    { c: between(hips, chest, 0.68, [0, -H * 0.02, 0]), s: [W * 0.53, H * 0.6], p: 'barrel' },
    { c: between(chest, chest, 0, [0, H * 0.02, T * 0.02]), s: [W * 0.46, H * 0.55], p: 'shoulder' },
    { c: between(chest, neck, 0.72, [0, -H * 0.02, 0]), s: [W * 0.36, H * 0.42], p: 'neck' },
    { c: nk(0.12), s: [W * 0.27, H * 0.31], p: 'neck' },
    { c: nk(0.35), s: [W * 0.2, H * 0.23], p: 'neck' },
    { c: nk(0.6), s: [W * 0.155, H * 0.175], p: 'neck' },
    { c: nk(0.82), s: [W * 0.12, H * 0.135], p: 'neck' },
    { c: nk(0.93, -0.2), s: [W * 0.1, H * 0.11], p: 'neck' },
  ];
  const tr = body.add(trunk({
    name: 'trunk', stations: st, tween: 1, capS: true, capE: false, k: 0.9,
    rings: [{ at: 10, s: 1, ink: true }, { at: 12, s: 1, ink: true }],
    skin: X.spine,
    paint: (ch, p, b) => {
      const px = new Px(ch, b);
      paintLook(px, hide({ folds: { axis: norm([0, head[1] - neck[1], head[2] - neck[2]]), origin: neck, spacing: 0.55, depth: 1, near: (q) => (q[2] > chest[2] + T * 0.05 ? 1 : 0) } }));
      // rib ridges drawn down the barrel
      const P = px.gb.P, N = px.gb.N;
      for (let i = 0; i < px.n; i++) { const z = P[i * 3 + 2], y = P[i * 3 + 1]; if (z > hips[2] + T * 0.25 && z < chest[2] && Math.abs(N[i * 3]) > 0.55 && y > chest[1] - H * 0.4) { const f = ((z - chest[2]) / 1.35) % 1, ff = f < 0 ? f + 1 : f; if (ff < 0.1) px.mark[i] -= 1; else if (ff < 0.22) px.mark[i] += 0.6; } }
      drawPits(px, pitsT); px.flush();
    },
  }));
  body.finalize(tr);
  const Rt = tr.grids[0].v.length, rowV = (s: number) => tr.row(s) / (Rt - 1);
  // breathing slits at the root of the neck, three each side
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const q = gridSurf(tr.m, tr.grids[0], s > 0 ? 0.71 : 0.29, rowV(10) + 0.008 + k * 0.009); pitsT.push({ c: q.p, r: 0.42, slit: true }); }
  // ---------------------------------------------------------------- head
  const hl = D.hl * 1.15, hw = hl * 0.52, hh = hl * 0.5, iH = rig.head, iN = X.bi('neck'), iJ = rig.jaw;
  const faceLook: Look = { ramp: 'slate', step: 3, belly: { ramp: 'stone', step: 4, below: -0.5 }, pebbles: { size: 0.13, pores: 0.5 }, creases: 0.7, glints: { size: 0.3, every: 0.3 } };
  const pitsH: { c: V3; r: number; slit?: boolean }[] = [];
  const sk = body.add(skull({ name: 'skull', skull: SKULLS.grazer, at: head, hl, hw, hh, pitch: 0.18, bones: { head: iH, neck: iN }, k: 1.8,
    paint: (ch, p, b) => { const px = new Px(ch, b); paintLook(px, faceLook); drawPits(px, pitsH); px.flush(); } }));
  body.finalize(sk);
  const Rs = sk.grids[0].v.length, Cs = sk.grids[0].v[0].length, su = (j: number, s: 1 | -1) => sk.col(j, s) / Cs, sv = (s: number) => sk.row(s) / (Rs - 1);
  const hinge: V3 = [0, head[1] - hh * 0.32, head[2] - hl * 0.05], chin: V3 = [0, head[1] - hh * 0.6, head[2] + hl * 0.68];
  rig.bones[iJ].pos = [hinge[0] - head[0], hinge[1] - head[1], hinge[2] - head[2]]; rest[iJ] = hinge;
  body.add(jaw({ name: 'jaw', hinge, chin, w: hw * 0.36, h: hh * 0.22, bone: iJ, paint: lookPaint(faceLook) }));
  // the nasal arch: a bony crest over the bridge with the nostrils on top
  const archLook = lookPaint({ ramp: 'slate', step: 4, creases: 0.6, pebbles: { size: 0.1, depth: 0.6 }, mats: { 1: { ramp: 'slate', step: 2 } } });
  body.add(shell({ name: 'arch', host: sk, u: [0.4, 0.6], v: [sv(1) + 0.02, sv(5)], nu: 4, nv: 5, levels: 2, sink: 0.15, rim: 1.5, ridges: [0.5],
    lift: (a, b) => (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, b * 1.25))) * Math.sin(Math.PI * a) * hh * 0.42, skin: () => [iH, 1], paint: archLook, k: 1.6 }));
  { const q = gridSurf(sk.m, sk.grids[0], 0.5, sv(2) + 0.04); for (const s of [-1, 1]) pitsH.push({ c: [q.p[0] + s * 0.16, q.p[1] + hh * 0.33, q.p[2]], r: 0.11, slit: true }); }
  // eyes high on the sides, behind the arch
  rig.eyes.forEach((e, k) => {
    const s = (k === 0 ? -1 : 1) as 1 | -1, q = gridSurf(sk.m, sk.grids[0], su(2, s), sv(2) + 0.02);
    const er = hl * 0.07, ax: V3 = [q.n[0], q.n[1] * 0.4 + 0.1, q.n[2] + 0.3], c: V3 = [q.p[0] - q.n[0] * er * 0.4, q.p[1] - q.n[1] * er * 0.4, q.p[2] - q.n[2] * er * 0.4];
    rig.bones[e.bone].pos = [c[0] - head[0], c[1] - head[1], c[2] - head[2]]; rest[e.bone] = c; rig.bones[e.pupil].pos = [0, 0, 0]; rest[e.pupil] = c;
    body.add(eyeball({ name: 'eye' + k, c, ax, r: er, bone: e.bone, iris: RP('teal'), pupil: 'round', irisA: 0.78 }));
    const lid = rig.lids[k];
    if (lid) { rig.bones[lid.bone].pos = [c[0] - head[0], c[1] - head[1], c[2] - head[2]]; rest[lid.bone] = c; lid.axis = norm(cross([0, 1, 0], norm(ax)).map((v) => v * -s) as V3) as [number, number, number]; body.add(eyelid({ name: 'lid' + k, c, ax: norm(ax), r: er, bone: lid.bone, paint: lookPaint({ ...faceLook, pebbles: { size: 0.05 } }) })); }
  });
  // sensory barbels: a fringe hanging from the upper lip and the chin, swaying with the jaw
  const barbLook = lookPaint({ ramp: 'sage', step: 3, creases: 0.5, pebbles: { size: 0.05, depth: 0.6 }, glints: { size: 0.2, every: 0.4 } });
  for (let k = 0; k < 10; k++) {
    const s = k % 2 ? 1 : -1, j = k >> 1, onJaw = j >= 3;
    const b0: V3 = onJaw ? [s * hw * 0.12 * (j - 2), chin[1] - hh * 0.05, chin[2] - hl * 0.1 * (j - 3)] : [s * hw * (0.2 - j * 0.03), head[1] - hh * 0.38, head[2] + hl * (0.62 - j * 0.12)];
    const L = hl * (0.35 + h3(k, 1, seed) * 0.25), sway = (h3(k, 3, seed) - 0.5) * 0.4;
    body.add(stalk({ name: 'barb' + k, path: curve([b0, [b0[0] + s * L * 0.15, b0[1] - L * 0.45, b0[2] + L * 0.05], [b0[0] + s * L * (0.2 + sway * 0.3), b0[1] - L, b0[2] - L * 0.12]], 6), r: (t) => hl * 0.028 * (1 - t * 0.85), around: 6, levels: 1, skin: () => [onJaw ? iJ : iH, 1], paint: barbLook, k: 1.5 }));
  }
  // ---------------------------------------------------------------- the throat sac under the root of the neck
  { const q = gridSurf(tr.m, tr.grids[0], 0.0, rowV(11)); body.add(sac({ name: 'sac', at: q.p, n: norm([0, -1, 0.3]), up: [0, 0, 1], r: [W * 0.13, W * 0.17, W * 0.12], skin: X.spine, k: 1, paint: lookPaint({ ramp: 'stone', step: 5, light: 0.6, pebbles: { size: 0.3, depth: 0.7 }, folds: { axis: [0, 0, 1], origin: q.p, spacing: 0.5, depth: 0.8 }, glints: { size: 0.5, every: 0.3 } }) })); }
  // ---------------------------------------------------------------- legs: sauropod columns
  const clawPaint = lookPaint({ ramp: 'bone', step: 3, creases: 0.6, glints: { size: 0.25, every: 0.6 }, extra: (px) => px.folds([0, 1, 0], [0, 0, 0], 0.1, { depth: 0.4 }) });
  for (const lg of rig.legs) {
    const fore = lg.kind === 'fore', [i0, i1, i2] = lg.bones, s = lg.side;
    const r0 = fore ? 1.9 : 2.1;
    const toes = fore
      ? [{ a: -78, len: 0.75, r: 0.42, claw: 1.15, curl: 0.7, drop: 0.05 }, { a: -40, len: 0.1, r: 0.36, claw: 0.35, curl: 0.2, drop: 0.3 }, { a: -8, len: 0.1, r: 0.38, claw: 0.35, curl: 0.2, drop: 0.3 }, { a: 25, len: 0.1, r: 0.36, claw: 0.32, curl: 0.2, drop: 0.3 }, { a: 58, len: 0.08, r: 0.32, claw: 0.3, curl: 0.2, drop: 0.3 }]
      : [{ a: -30, len: 0.6, r: 0.5, claw: 1.0, curl: 0.75, drop: 0.1 }, { a: 5, len: 0.7, r: 0.52, claw: 1.1, curl: 0.75, drop: 0.1 }, { a: 40, len: 0.62, r: 0.48, claw: 0.95, curl: 0.75, drop: 0.1 }, { a: 72, len: 0.1, r: 0.34, claw: 0.3, curl: 0.2, drop: 0.3 }];
    const L = limb({
      name: 'leg' + lg.pair + (s > 0 ? 'r' : 'l'), side: s, hip: rest[i0], knee: rest[i1], sole: rest[i2],
      bones: { parent: fore ? X.bi('chest') : rig.root, up: i0, lo: i1, foot: i2, flex: lg.flex },
      rings: LIMB_TYPES.column(r0), foot: { pad: r0 * 1.08, h: 1.1, fwd: 0.1, nail: 'claw', lobe: 0.16, toes },
      paint: lookPaint(hide({ spots: undefined, folds: { axis: [0, 1, 0], origin: rest[i1], spacing: 0.5, depth: 0.9, near: (q) => Math.max(0, 1 - Math.abs(q[1] - rest[i1][1]) / 2.2) } })),
      clawPaint, k: 1,
    });
    body.add(L.skin); body.add(L.toes); body.add(L.claws);
  }
  // ---------------------------------------------------------------- the dorsal crest of osteoderms, nape to tail
  const plateLook = lookPaint({ ramp: 'sage', step: 3, creases: 0.6, pebbles: { size: 0.12, depth: 0.8 }, mats: { 1: { ramp: 'slate', step: 1 } }, lichen });
  const vA = rowV(2), vB = rowV(14), nP = 46;
  for (let k = 0; k < nP; k++) {
    const v = vA + ((vB - vA) * k) / nP, row = Math.max(0, Math.min(1, (v - rowV(5)) / (rowV(10) - rowV(5)))), big = 0.45 + 0.55 * Math.sin(Math.PI * row) + (v > rowV(10) ? -0.25 : 0);
    const wv = 0.024 + 0.02 * big, lift = 0.5 + 1.7 * Math.max(0.15, big);
    const sides = big > 0.6 ? [-1, 0, 1] : [0];
    for (const sd of sides) {
      const uc = 0.5 + sd * (0.045 + 0.01 * big), vv = v + (sd ? (vB - vA) / nP * 0.5 : 0);
      body.add(shell({ name: 'oste' + k + '_' + (sd + 1), host: tr, u: [uc - wv * (sd ? 0.7 : 1), uc + wv * (sd ? 0.7 : 1)], v: [vv, vv + (vB - vA) / nP * 1.15], nu: 3, nv: 3, levels: 1, sink: 0.3, rim: 2, ridges: [0.5],
        lift: (a, b) => lift * (sd ? 0.55 : 1) * (0.3 + 0.7 * Math.sin(Math.PI * a)) * (0.55 + 0.45 * b), skin: X.spine, paint: plateLook, k: 0.9 }));
    }
  }
  // lichen crusts and their cups over the back and flanks
  for (let k = 0; k < 80; k++) {
    const u = 0.18 + h3(k, 21, seed) * 0.64, v = 0.06 + h3(k, 23, seed) * 0.82, q = gridSurf(tr.m, tr.grids[0], u, v);
    if (q.n[1] < -0.25) continue;
    lichen.push({ c: q.p, n: q.n, r: 0.25 + h3(k, 25, seed) * 0.6, ramp: k % 3 === 0 ? 'bone' : k % 3 === 1 ? 'sage' : 'sand', cup: k % 2 ? 'ochre' : 'bone' });
  }
  body.add(crusts({ name: 'crust', host: tr, u: [0.2, 0.8], v: [0.1, 0.75], n: 24, per: 6, size: 0.14, cone: false, seed: seed + 5, skin: X.spine, keep: (_p, n) => n[1] > -0.2,
    paint: lookPaint({ ramp: 'bone', step: 3, creases: 0.5 }) }));
  const out = body.build({ den: 30 });
  if ((globalThis as any).__titanStats) console.log([...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ':' + v).join(' '));
  return { geo: out.geo, tex: out.tex, tris: out.tris, den: Math.round(body.den), fill: body.page.fill };
}
