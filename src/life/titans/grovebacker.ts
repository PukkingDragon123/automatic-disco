// GROVEBACKER (Silvidorsum colossus): a twenty-eight-metre armoured browser carrying a wood on its back. Built from
// the anatomy library: a barrel trunk with a sagging belly, a short wrinkled neck that draws back under the shell's
// nuchal hood, a heavy beaked browsing skull with small sunk eyes under a plated brow, elephantine pillar legs with
// tortoise scales down the fronts of the forelegs and five thick nails on each foot, a stubby ringed tail. The shell
// is seven overlapping bands of bone (each rear lip standing proud over the band behind it) with a scalloped skirt of
// marginal scutes; moss cushions fill the hollows on top, lichen rosettes and crust cups spread over the flanks, and
// a stand of small trees grips the crown with buttress roots. Mud is caked up the legs from the last wallow.
import { RAMPS } from '../../art/palette';
import type { V3, Wt } from '../kit';
import type { Rig } from '../morph';
import type { Design } from '../design';
import { Body, gridSurf, type Piece, type Chart } from '../anatomy/core';
import { trunk, type Station } from '../anatomy/trunk';
import { limb, LIMB_TYPES } from '../anatomy/limb';
import { shell } from '../anatomy/armour';
import { skull, jaw, eyeball, eyelid, SKULLS, drawPits } from '../anatomy/head';
import { horn } from '../anatomy/append';
import { tree, crusts } from '../anatomy/growth';
import { lookPaint, paintLook, type Look } from '../anatomy/look';
import { Px, RP, cell3, cl, h3 } from '../anatomy/paint';
import { titanCtx, between } from './common';

export function grovebacker(d: Design, rig: Rig, rest: V3[]) {
  const X = titanCtx(d, rig, rest), D = X.D, W = D.W, H = D.H, T = D.T;
  const hips = X.at('hips'), chest = X.at('chest'), neck = X.at('neck'), head = X.at('head');
  const tails = rig.tail.map((i) => rest[i]), tl = tails[tails.length - 1], tp = tails[tails.length - 2];
  const tip: V3 = [0, tl[1] - 0.6, tl[2] * 1 + (tl[2] - tp[2]) * 0.9];
  const body = new Body(2048);
  body.seed = d.seed;
  const seed = d.seed % 997;
  // ---------------------------------------------------------------- the hide
  const lichenSites: Look['lichen'] = [];
  const scars: Look['scars'] = [
    { pts: [[W * 0.5, H * 0.92 + hips[1] - H * 0.5, hips[2] + T * 0.4], [W * 0.53, hips[1] - H * 0.15, hips[2] + T * 0.6], [W * 0.5, hips[1] - H * 0.32, hips[2] + T * 0.78]], w: 0.16, ramp: 'sand' },
  ];
  const hideLook = (extra?: Partial<Look>): Look => ({
    ramp: 'stone', step: 3, belly: { ramp: 'sand', step: 3, below: -0.55 },
    pebbles: { size: 0.36, pores: 0.35, depth: 1 }, creases: 0.75, lichen: lichenSites, scars,
    mud: { top: (p: V3) => 2.1 + 0.6 * Math.sin(p[2] * 0.9 + p[0] * 1.3), ramp: 'soil', clump: 0.28 },
    ...extra,
  });
  const skinPaint = lookPaint(hideLook());
  // ---------------------------------------------------------------- trunk: tail tip to the back of the skull
  const st: Station[] = [
    { c: tip, s: [0.32, 0.3], p: 'ridge' },
    { c: between(tl, tl, 0, [0, -0.2, 0]), s: [0.75, 0.72], p: 'ridge' },
    { c: tails[1], s: [1.25, 1.2], p: 'ridge' },
    { c: between(tails[0], hips, 0.1, [0, -0.2, 0]), s: [W * 0.21, H * 0.22], p: 'ridge' },
    { c: between(hips, hips, 0, [0, H * 0.02, -T * 0.13]), s: [W * 0.38, H * 0.42], p: 'hips' },
    { c: between(hips, hips, 0, [0, H * 0.0, 0]), s: [W * 0.55, H * 0.54], p: 'hips' },
    { c: between(hips, chest, 0.33, [0, -H * 0.06, 0]), s: [W * 0.54, H * 0.64], p: 'sag' },
    { c: between(hips, chest, 0.68, [0, -H * 0.04, 0]), s: [W * 0.54, H * 0.62], p: 'sag' },
    { c: between(chest, chest, 0, [0, H * 0.0, T * 0.03]), s: [W * 0.55, H * 0.56], p: 'shoulder' },
    { c: between(chest, neck, 0.62, [0, -H * 0.04, 0]), s: [W * 0.3, H * 0.32], p: 'neck', tw: [[8, 0, -0.08]] },
    { c: between(neck, head, 0.35, [0, -0.25, 0]), s: [W * 0.22, H * 0.23], p: 'neck' },
    { c: between(neck, head, 0.68, [0, -0.1, 0]), s: [W * 0.19, H * 0.21], p: 'neck' },
  ];
  const tr = body.add(trunk({
    name: 'trunk', stations: st, tween: [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1], capS: true, capE: false, k: 0.85,
    // neck folds and the shoulder's skin fold
    rings: [{ at: 9, s: 1, ink: true }, { at: 10, s: 1, ink: true }, { at: 11, s: 1, ink: true }],
    skin: X.spine, paint: lookPaint(hideLook({ folds: { axis: [0, 0.3, 0.95], origin: neck, spacing: 0.42, depth: 1, near: (p) => (p[2] > chest[2] + T * 0.08 ? 1 : 0) } })),
  }));
  body.finalize(tr);
  const Rt = tr.grids[0].v.length, rowV = (s: number) => tr.row(s) / (Rt - 1);
  // ---------------------------------------------------------------- head
  const hl = D.hl, hw = hl * 0.6, hh = hl * 0.62;
  const iH = rig.head, iN = X.bi('neck'), iJ = rig.jaw;
  const browLook: Look = { ramp: 'stone', step: 3, belly: { ramp: 'sand', step: 3, below: -0.55 }, pebbles: { size: 0.16, pores: 0.4 }, creases: 0.7 };
  const pits: { c: V3; r: number; slit?: boolean }[] = [];
  const sk = body.add(skull({ name: 'skull', skull: SKULLS.browser, at: head, hl, hw, hh, pitch: 0.12, bones: { head: iH, neck: iN }, k: 1.8,
    tw: [[2, 1, 0.04, 0.04], [3, 1, 0.06, 0.05]],
    paint: (ch, p, b) => { const px = new Px(ch, b); paintLook(px, browLook); drawPits(px, pits); px.flush(); } }));
  body.finalize(sk);
  const Rs = sk.grids[0].v.length, Cs = sk.grids[0].v[0].length, su = (j: number, side: 1 | -1) => sk.col(j, side) / Cs, sv = (s: number) => sk.row(s) / (Rs - 1);
  // the jaw: its bone moved to the hinge under the back of the cheek
  const hinge: V3 = [0, head[1] - hh * 0.3, head[2] - hl * 0.02], chin: V3 = [0, head[1] - hh * 0.5, head[2] + hl * 0.5];
  rig.bones[iJ].pos = [hinge[0] - head[0], hinge[1] - head[1], hinge[2] - head[2]]; rest[iJ] = hinge;
  body.add(jaw({ name: 'jaw', hinge, chin, w: hw * 0.42, h: hh * 0.26, bone: iJ, paint: lookPaint({ ...browLook, pebbles: { size: 0.12 } }) }));
  // the beak: a horn sheath over the muzzle and the chin
  const keratin: Look = { ramp: 'basalt', step: 3, creases: 0.5, glints: { size: 0.2, every: 0.5 }, pebbles: { size: 0.07, depth: 0.5 } };
  body.add(shell({ name: 'beak', host: sk, u: [0.08, 0.92], v: [sv(5) + 0.02, 1.0], nu: 8, nv: 3, lift: (a, b) => 0.04 + 0.1 * b, sink: 0.05, curl: { b1: false }, rim: 2, skin: () => [iH, 1], paint: lookPaint(keratin), k: 1.6 }));
  // scutes over the crown: two rows of thick plates, a brow shelf over each eye
  const scuteLook = lookPaint({ ramp: 'stone', step: 4, creases: 0.6, pebbles: { size: 0.09, depth: 0.5 }, lichen: [{ c: between(head, head, 0, [0, hh * 0.62, -hl * 0.12]), n: [0, 1, 0], r: 0.3, ramp: 'sage', cup: 'ochre' }] });
  const crown: [number, number, number, number][] = [[0.42, 0.58, sv(1), sv(2) + 0.02], [0.32, 0.44, sv(1) + 0.02, sv(2) + 0.04], [0.56, 0.68, sv(1) + 0.02, sv(2) + 0.04], [0.4, 0.6, sv(2) + 0.02, sv(3) + 0.03], [0.27, 0.4, sv(2) + 0.06, sv(3) + 0.05], [0.6, 0.73, sv(2) + 0.06, sv(3) + 0.05], [0.43, 0.57, sv(3) + 0.03, sv(4) + 0.02]];
  crown.forEach(([a0, a1, b0, b1], k) => body.add(shell({ name: 'crown' + k, host: sk, u: [a0, a1], v: [b0, b1], nu: 3, nv: 3, levels: 1, lift: (a, b) => 0.1 + 0.12 * Math.sin(Math.PI * a) * (0.6 + 0.4 * b), sink: 0.08, rim: 2, ridges: [0.5], skin: () => [iH, 1], paint: scuteLook, k: 1.6 })));
  // eyes: small, sunk under the brow; lids on the lid bones
  rig.eyes.forEach((e, k) => {
    const s = (k === 0 ? -1 : 1) as 1 | -1, q = gridSurf(sk.m, sk.grids[0], su(2, s) + 0.012 * s, sv(3) - 0.03);
    const er = hl * 0.085, ax: V3 = [q.n[0] * 0.85, q.n[1] * 0.5, q.n[2] + 0.4], c: V3 = [q.p[0] - q.n[0] * er * 0.45, q.p[1] - q.n[1] * er * 0.45, q.p[2] - q.n[2] * er * 0.45];
    rig.bones[e.bone].pos = [c[0] - head[0], c[1] - head[1], c[2] - head[2]]; rest[e.bone] = c;
    rig.bones[e.pupil].pos = [0, 0, 0]; rest[e.pupil] = c;
    body.add(eyeball({ name: 'eye' + k, c, ax, r: er, bone: e.bone, iris: RP('ochre'), pupil: 'bar', irisA: 0.7 }));
    const lid = rig.lids[k];
    if (lid) { rig.bones[lid.bone].pos = [c[0] - head[0], c[1] - head[1], c[2] - head[2]]; rest[lid.bone] = c; const axn = norm(ax); lid.axis = norm(cross([0, 1, 0], axn).map((v) => v * -s) as V3) as [number, number, number];
      body.add(eyelid({ name: 'lid' + k, c, ax: axn, r: er, bone: lid.bone, paint: lookPaint({ ...browLook, pebbles: { size: 0.05 } }) })); }
    // nostril-like sensory pits along the muzzle
    for (let n = 0; n < 3; n++) { const qq = gridSurf(sk.m, sk.grids[0], su(2, s) + 0.02 * s, sv(5) + n * 0.05); pits.push({ c: qq.p, r: 0.07 + n * 0.01 }); }
  });
  // ---------------------------------------------------------------- legs
  const nailPaint = lookPaint({ ramp: 'basalt', step: 3, creases: 0.55, glints: { size: 0.25, every: 0.6 }, extra: (px) => px.folds([0, 1, 0], [0, 0, 0], 0.08, { depth: 0.5 }) });
  for (const lg of rig.legs) {
    const fore = lg.kind === 'fore', [i0, i1, i2] = lg.bones, s = lg.side;
    const hip = rest[i0], knee = rest[i1], sole = rest[i2];
    const r0 = fore ? 1.7 : 1.8;
    const legLook = hideLook(fore ? {
      // big tortoise scales down the front of the forearm
      scales: { size: 0.62, kind: 'shield', flow: 1, mask: (i) => 0 * i },
    } : {});
    const L = limb({
      name: 'leg' + lg.pair + (s > 0 ? 'r' : 'l'), side: s, hip, knee, sole,
      bones: { parent: fore ? X.bi('chest') : rig.root, up: i0, lo: i1, foot: i2, flex: lg.flex },
      rings: LIMB_TYPES.pillar(r0),
      foot: { pad: r0 * 1.12, h: 0.85, fwd: 0.12, nail: 'nail', lobe: 0.2, toes: [-58, -28, 0, 28, 58].map((a, k) => ({ a, len: 0.12, r: 0.42 - Math.abs(k - 2) * 0.04, claw: 0.42, curl: 0.35, drop: 0.25 })) },
      paint: (ch, p, b) => {
        const px = new Px(ch, b);
        paintLook(px, legLook);
        if (fore) {
          // tortoise scales: big overlapping shields on the front of the forearm, small beads elsewhere
          const N = px.gb.N, P = px.gb.P;
          px.scales({ size: 0.62, kind: 'shield', flow: 1, mask: (i) => { const fz = N[i * 3 + 2], y = P[i * 3 + 1]; return fz > 0.25 && y < knee[1] + 1.5 && y > 1.0 ? cl((fz - 0.25) * 4, 0, 1) : 0; } });
        }
        px.flush();
      },
      clawPaint: nailPaint, k: 1,
    });
    body.add(L.skin); body.add(L.toes); body.add(L.claws);
  }
  // ---------------------------------------------------------------- the shell: seven bands, front bands over rear ones
  const v0 = rowV(4) - 0.01, v1 = (rowV(8) + rowV(9)) / 2, nb = 7, step = (v1 - v0) / nb;
  const rimLook: Look = { ramp: 'stone', step: 1, creases: 0.5, pebbles: { size: 0.12, aniso: [1, 0.4, 1], depth: 0.7 } };
  const shellLook: Look = { ramp: 'stone', step: 3, creases: 0.55, mats: { 1: rimLook }, extra: (px) => shellMarks(px, seed) };
  const bandSkin = (p: V3): Wt => X.spine(p);
  for (let k = 0; k < nb; k++) {
    const a0 = 0.205 + (k === nb - 1 ? 0.02 : 0), a1 = 0.795 - (k === nb - 1 ? 0.02 : 0);
    const bv0 = v0 + step * k - step * 0.22, bv1 = v0 + step * (k + 1);
    const hk = 0.55 + 0.45 * Math.sin(Math.PI * (k + 0.5) / nb);
    body.add(shell({
      name: 'band' + k, host: tr, u: [a0, a1], v: [bv0, bv1], nu: 12, nv: 3, sink: 0.4, rim: 2, ridges: [0.18, 0.5, 0.82], rings: [0.5],
      // the dome across, the rear lip standing proud over the band behind
      lift: (a, b) => { const x = Math.abs(a - 0.5) * 2, dome = Math.cos(Math.min(1, x) * Math.PI / 2) ** 0.55, hug = k === nb - 1 ? 1 - 0.7 * b * b : k === 0 ? 1 - 0.8 * (1 - b) ** 2 : 1; return ((0.35 + 1.25 * hk * dome) * (1 + 0.45 * Math.pow(1 - b, 3)) + (x > 0.8 ? -0.15 * (x - 0.8) * 5 : 0)) * hug; },
      skin: bandSkin, paint: lookPaint(shellLook), k: 1.05,
    }));
  }
  // marginal scutes: a scalloped skirt along each lower edge of the shell
  for (const side of [0, 1]) for (let k = 0; k < 11; k++) {
    const vv0 = v0 + ((v1 - v0) * k) / 11 - 0.004, vv1 = v0 + ((v1 - v0) * (k + 1)) / 11 + 0.004, u = side ? [0.775, 0.83] : [0.17, 0.225];
    body.add(shell({ name: 'scute' + side + '_' + k, host: tr, u: u as [number, number], v: [vv0, vv1], nu: 3, nv: 3, sink: 0.3, rim: 2, levels: 1,
      lift: (a, b) => 0.5 + 0.35 * Math.sin(Math.PI * b) * (side ? 1 - a : a) + 0.2 * (side ? a : 1 - a), skin: bandSkin, paint: lookPaint({ ...shellLook, extra: (px) => shellMarks(px, seed + 7, true) }), k: 1 }));
  }
  // ---------------------------------------------------------------- life on the back
  const bark = lookPaint({ ramp: 'soil', step: 3, pebbles: { size: 0.1, aniso: [1, 0.3, 1], depth: 1.2 }, creases: 0.6 });
  const leaf = lookPaint({ ramp: 'moss', step: 3, light: 1.2, scales: { size: 0.3, kind: 'pebble', flow: 1, lit: 1.2, ink: 1.6, shade: 1 }, extra: (px) => px.glints(RP('moss'), { size: 0.5, every: 0.3 }) });
  const nTrees = 9;
  for (let k = 0; k < nTrees; k++) {
    const v = v0 + (v1 - v0) * (0.12 + 0.76 * (k + 0.5) / nTrees), u = 0.5 + (h3(k, 3, seed) - 0.5) * 0.16;
    const band = Math.min(nb - 1, Math.floor((v - v0) / step)), hk = 0.55 + 0.45 * Math.sin(Math.PI * (band + 0.5) / nb);
    const q = gridSurf(tr.m, tr.grids[0], u, v), lift = 0.35 + 1.25 * hk;
    const base: V3 = [q.p[0] + q.n[0] * lift, q.p[1] + q.n[1] * lift, q.p[2] + q.n[2] * lift];
    for (const p of tree({ name: 'tree' + k, base, up: [q.n[0] * 0.3, 1, q.n[2] * 0.3], h: 2.4 + h3(k, 5, seed) * 2.2, r: 0.2 + h3(k, 7, seed) * 0.1, seed: seed + k * 17, skin: () => X.spine(base), bark, leaf, lean: [(h3(k, 9, seed) - 0.5), 0, (h3(k, 11, seed) - 0.5)] })) body.add(p);
  }
  // lichen rosettes and crust cups over the flanks, the shell rims and the legs
  for (let k = 0; k < 70; k++) {
    const u = 0.12 + h3(k, 21, seed) * 0.76, v = 0.08 + h3(k, 23, seed) * 0.8, q = gridSurf(tr.m, tr.grids[0], u, v);
    if (q.n[1] < -0.35) continue;
    lichenSites.push({ c: q.p, n: q.n, r: 0.18 + h3(k, 25, seed) * 0.45, ramp: k % 3 === 0 ? 'ochre' : k % 3 === 1 ? 'sage' : 'bone', cup: k % 2 ? 'rust' : 'ochre' });
  }
  body.add(crusts({ name: 'crust', host: tr, u: [0.16, 0.84], v: [0.12, 0.85], n: 22, per: 6, size: 0.1, cone: true, seed: seed + 3, skin: X.spine, keep: (_p, n) => n[1] > -0.3,
    paint: lookPaint({ ramp: 'bone', step: 3, creases: 0.5, glints: { size: 0.15, every: 0.4 } }) }));
  // swept brow horns, cheek flanges of bone, a hooked upper beak
  for (const s of [-1, 1] as const) {
    const q = gridSurf(sk.m, sk.grids[0], su(1, s), sv(2) + 0.02), b0: V3 = [q.p[0] - q.n[0] * 0.2, q.p[1] - q.n[1] * 0.2, q.p[2] - q.n[2] * 0.2];
    body.add(horn({ name: 'horn' + s, ctrl: [b0, [b0[0] + s * 0.45, b0[1] + 0.55, b0[2] - 0.35], [b0[0] + s * 0.9, b0[1] + 0.85, b0[2] - 1.1], [b0[0] + s * 1.05, b0[1] + 0.8, b0[2] - 1.7]], r0: 0.34, skin: () => [iH, 1], paint: nailPaint, k: 1.4 }));
    body.add(shell({ name: 'cheek' + s, host: sk, u: s > 0 ? [su(4, 1) - 0.06, su(2, 1) + 0.03] : [su(2, -1) - 0.03, su(4, -1) + 0.06], v: [sv(2) + 0.03, sv(4)], nu: 4, nv: 3, levels: 1, sink: 0.08, rim: 2, ridges: [0.5],
      lift: (a, b) => 0.08 + 0.16 * Math.sin(Math.PI * a) * (1 - b * 0.5), skin: () => [iH, 1], paint: scuteLook, k: 1.5 }));
  }
  body.add(horn({ name: 'hook', ctrl: [[0, head[1] + hh * 0.05, head[2] + hl * 0.42], [0, head[1] - hh * 0.05, head[2] + hl * 0.62], [0, head[1] - hh * 0.32, head[2] + hl * 0.7]], r0: hw * 0.18, skin: () => [iH, 1], paint: lookPaint(keratin), k: 1.5 }));
  const out = body.build({ den: 34, snap: undefined });
  if ((globalThis as any).__titanStats) console.log([...body.stats.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' '));
  return { geo: out.geo, tex: out.tex, tris: out.tris, den: Math.round(body.den), fill: body.page.fill };
}

/** drawn bone: growth lines parallel to the band's rims, pits, a few cracks, moss cushions packed in the hollows on
 *  top, and lichen on the sides */
function shellMarks(px: Px, seed: number, scute = false) {
  const { w, h } = px, P = px.gb.P, N = px.gb.N, M = RP('moss');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, u = (x + 0.5) / w, v = (y + 0.5) / h;
    if (px.gb.M[i] === 2) { if (px.gb.N[i * 3 + 1] > 0.2) px.mark[i] += 0.8; continue; }
    // concentric growth lines: distance to the nearest rim in texels
    const dT = Math.min(u * w * (px.circ[y] / w) / px.mpt, (1 - u) * px.circ[y] / px.mpt, v * px.Y[h - 1] / px.mpt, (1 - v) * px.Y[h - 1] / px.mpt);
    if (dT > 3 && Math.round(dT) % (scute ? 6 : 9) === 0) px.mark[i] -= 0.9;
    else if (dT > 3 && Math.round(dT) % (scute ? 6 : 9) === 1) px.mark[i] += 0.5;
    if (dT < 1.5) px.mark[i] -= 1.4;
    // pits
    const c = cell3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], 0.22, seed + 1);
    if (c.f1 < 0.035 && (c.id % 3) === 0) px.mark[i] -= 1.3;
    // moss: cushions on faces turned up, ragged at the edge
    const up = N[i * 3 + 1], cm = cell3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], 0.3, seed + 5);
    if (!scute && up > 0.5 + (h3(cm.id, 2, seed) - 0.5) * 0.3 && dT > 2) {
      px.rampI[i] = px.ramp(M);
      const gap = (cm.f2 - cm.f1) / px.mpt;
      px.step[i] = 3 + (h3(cm.id, 5, seed) > 0.6 ? 1 : 0); px.mark[i] = gap < 1 ? -1.6 : gap < 2.2 ? 0.9 : 0;
      if (gap > 3 && (cm.id % 5) === 0 && ((x + y) % 3) === 0) px.mark[i] += 1.2; // spore stalks catching the light
    }
  }
  void RAMPS;
}
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export type { Piece, Chart };
