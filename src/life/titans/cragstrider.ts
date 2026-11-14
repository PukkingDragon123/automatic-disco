// CRAGSTRIDER (Hexapodus montanus): a six-legged plated wanderer of this world's own spine-line, twenty-three
// metres of armour that never stops walking. Built from the anatomy library: a long low trunk under eight keeled
// basalt bands (each band's rear lip proud, banded in rust, crusted with ochre lichen and crowned with a row of
// blunt spikes), a row of nine ringed spiracle vents down each flank that roar as it breathes, a plated brute skull
// with an armoured brow, two rows of slit eyes and sensory pits down each side, hinged mandible plates either side
// of the mouth, six muscular legs with bony knees, tendons and plated shins, feet of three blunt crater-making
// claws, and a short armoured tail ending in a spiked club.
import type { V3 } from '../kit';
import type { Rig } from '../morph';
import type { Design } from '../design';
import { Body, gridSurf } from '../anatomy/core';
import { trunk, type Station } from '../anatomy/trunk';
import { limb, LIMB_TYPES } from '../anatomy/limb';
import { shell } from '../anatomy/armour';
import { skull, jaw, eyeball, eyelid, SKULLS, drawPits } from '../anatomy/head';
import { bulbs, spine, sac } from '../anatomy/append';
import { lookPaint, paintLook, type Look } from '../anatomy/look';
import { Px, RP, h3 } from '../anatomy/paint';
import { titanCtx, between } from './common';

const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export function cragstrider(d: Design, rig: Rig, rest: V3[]) {
  const X = titanCtx(d, rig, rest), D = X.D, W = D.W, H = D.H, T = D.T;
  const hips = X.at('hips'), chest = X.at('chest'), neck = X.at('neck'), head = X.at('head');
  const tails = rig.tail.map((i) => rest[i]), tl = tails[tails.length - 1], tp = tails[tails.length - 2];
  const tip: V3 = [0, tl[1] * 2 - tp[1], tl[2] * 2 - tp[2]];
  const body = new Body(2048);
  const seed = d.seed % 997;
  const lichen: Look['lichen'] = [], pitsT: { c: V3; r: number; slit?: boolean }[] = [];
  // old wounds: claw rakes down both flanks below the bands, a long gash over the shoulder
  const scars: Look['scars'] = [];
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) scars.push({ pts: [[s * W * 0.5, hips[1] - H * 0.12 - k * 0.45, hips[2] + T * 0.35 + k * 0.5], [s * W * 0.55, hips[1] - H * 0.3 - k * 0.45, hips[2] + T * 0.48 + k * 0.5], [s * W * 0.5, hips[1] - H * 0.46 - k * 0.45, hips[2] + T * 0.58 + k * 0.5]], w: 0.12, ramp: 'bone' });
  scars.push({ pts: [[W * 0.35, chest[1] + H * 0.2, chest[2] + 0.5], [W * 0.5, chest[1] - H * 0.1, chest[2] - 0.3], [W * 0.46, chest[1] - H * 0.4, chest[2] - 1.2]], w: 0.18, ramp: 'bone' });
  const hide = (extra?: Partial<Look>): Look => ({
    ramp: 'hide', step: 3, belly: { ramp: 'stone', step: 4, below: -0.5, scales: { size: 0.7, kind: 'scute', flow: 1, ink: 1.8 } },
    pebbles: { size: 0.3, pores: 0.4 }, creases: 0.7, lichen, scars,
    mud: { top: (p: V3) => 1.4 + 0.5 * Math.sin(p[2] * 1.3 + p[0]), ramp: 'clay', clump: 0.25 },
    ...extra,
  });
  // ---------------------------------------------------------------- trunk
  const st: Station[] = [
    { c: tip, s: [0.45, 0.42], p: 'ridge' },
    { c: tl, s: [0.75, 0.7], p: 'ridge' },
    { c: tails[1], s: [1.15, 1.1], p: 'ridge' },
    { c: between(tails[0], hips, 0.2), s: [W * 0.24, H * 0.26], p: 'ridge' },
    { c: between(hips, hips, 0, [0, H * 0.04, -T * 0.08]), s: [W * 0.42, H * 0.44], p: 'hips' },
    { c: between(hips, chest, 0.0, [0, -H * 0.02, 0]), s: [W * 0.54, H * 0.58], p: 'flat' },
    { c: between(hips, chest, 0.33, [0, -H * 0.06, 0]), s: [W * 0.56, H * 0.64], p: 'sag' },
    { c: between(hips, chest, 0.66, [0, -H * 0.06, 0]), s: [W * 0.56, H * 0.64], p: 'sag' },
    { c: between(chest, chest, 0, [0, -H * 0.02, T * 0.02]), s: [W * 0.54, H * 0.6], p: 'shoulder' },
    { c: between(chest, neck, 0.55, [0, -H * 0.02, 0]), s: [W * 0.36, H * 0.4], p: 'neck' },
    { c: between(neck, head, 0.4, [0, -0.2, 0]), s: [W * 0.28, H * 0.3], p: 'neck' },
  ];
  const tr = body.add(trunk({
    name: 'trunk', stations: st, tween: 1, capS: true, capE: false, k: 0.85, skin: X.spine,
    rings: [{ at: 9, s: 1, ink: true }],
    paint: (ch, p, b) => { const px = new Px(ch, b); paintLook(px, hide({ folds: { axis: [0, 0.2, 1], origin: neck, spacing: 0.32, near: (q) => (q[2] > chest[2] + T * 0.05 ? 1 : 0) } })); drawPits(px, pitsT); px.flush(); },
  }));
  body.finalize(tr);
  const Rt = tr.grids[0].v.length, rowV = (s: number) => tr.row(s) / (Rt - 1);
  // ---------------------------------------------------------------- the carapace: eight keeled bands with spikes
  const plate: Look = { ramp: 'basalt', step: 3, creases: 0.6, lichen, mats: { 1: { ramp: 'basalt', step: 1, pebbles: { size: 0.1, aniso: [1, 0.35, 1], depth: 0.6 } } },
    extra: (px) => { // rust bands along each plate's rear third, pits, chips
      const P = px.gb.P;
      for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) { const i = y * px.w + x; if (px.gb.M[i] !== 1) continue; const v = (y + 0.5) / px.h; if (v < 0.32) { px.rampI[i] = px.ramp(RP('rust')); px.step[i] = 2 + (v < 0.12 ? 1 : 0); } if (Math.abs(v - 0.34) * px.Y[px.h - 1] / px.mpt < 0.8) px.mark[i] -= 1.2; void P; }
      px.pebbles(0.16, { depth: 0.7, mask: (i) => (px.gb.M[i] === 1 ? 1 : 0) });
    } };
  const v0 = rowV(3), v1 = rowV(9) + 0.01, nb = 8, stepV = (v1 - v0) / nb;
  const spikeLook = lookPaint({ ramp: 'bone', step: 3, creases: 0.6, glints: { size: 0.2, every: 0.5 } });
  for (let k = 0; k < nb; k++) {
    const hk = 0.6 + 0.4 * Math.sin(Math.PI * (k + 0.5) / nb), bv0 = v0 + stepV * k - stepV * 0.25, bv1 = v0 + stepV * (k + 1);
    body.add(shell({ name: 'band' + k, host: tr, u: [0.17, 0.83], v: [bv0, bv1], nu: 12, nv: 3, sink: 0.3, rim: 2, ridges: [0.2, 0.5, 0.8], rings: [0.45],
      lift: (a, b) => { const x = Math.abs(a - 0.5) * 2, dome = Math.cos(Math.min(1, x) * Math.PI / 2) ** 0.5; return (0.3 + 0.75 * hk * dome + (x < 0.12 ? 0.25 * hk : 0)) * (1 + 0.6 * Math.pow(1 - b, 3)); },
      skin: X.spine, paint: lookPaint(plate), k: 1.05 }));
    // a row of blunt spikes on the band's keel and shoulders
    for (const a of [0.3, 0.5, 0.7]) {
      const q = gridSurf(tr.m, tr.grids[0], a, bv0 + (bv1 - bv0) * 0.25), lift = 0.3 + 0.75 * hk + (a === 0.5 ? 0.25 * hk : 0) - 0.25;
      const at: V3 = [q.p[0] + q.n[0] * lift, q.p[1] + q.n[1] * lift, q.p[2] + q.n[2] * lift];
      body.add(spine({ name: 'spk' + k + a, at, dir: norm([q.n[0], q.n[1], q.n[2] - 0.55]), len: (a === 0.5 ? 2.4 : 1.5) * hk, r: (a === 0.5 ? 0.48 : 0.36) * hk, skin: X.spine, paint: spikeLook, k: 1.2 }));
    }
  }
  // spiracles: nine ringed vents down each flank under the band rims
  const seats: { p: V3; n: V3; r: number; h?: number; cone?: boolean }[] = [];
  for (const s of [0.14, 0.86]) for (let k = 0; k < 9; k++) {
    const q = gridSurf(tr.m, tr.grids[0], s, rowV(4) + ((rowV(8) - rowV(4)) * (k + 0.5)) / 9);
    seats.push({ p: [q.p[0] - q.n[0] * 0.15, q.p[1] - q.n[1] * 0.15, q.p[2] - q.n[2] * 0.15], n: q.n, r: 0.38, h: 0.42, cone: true });
    pitsT.push({ c: q.p, r: 0.24 });
  }
  body.add(bulbs({ name: 'spir', seats, skin: X.spine, levels: 1, around: 8, paint: lookPaint({ ramp: 'hide', step: 2, creases: 0.5, pebbles: { size: 0.06, depth: 0.5 }, extra: (px) => { const P = px.gb.P; for (let i = 0; i < px.n; i++) { let near = 1e9; for (const s of seats) near = Math.min(near, Math.hypot(P[i * 3] - s.p[0] - s.n[0] * 0.45, P[i * 3 + 1] - s.p[1] - s.n[1] * 0.45, P[i * 3 + 2] - s.p[2] - s.n[2] * 0.45)); if (near < 0.2) { px.rampI[i] = px.ramp(RP('ink')); px.step[i] = 0; } } } }), k: 1.2 }));
  // ---------------------------------------------------------------- head
  const hl = D.hl, hw = hl * 0.66, hh = hl * 0.56, iH = rig.head, iN = X.bi('neck'), iJ = rig.jaw;
  const faceLook: Look = { ramp: 'hide', step: 3, belly: { ramp: 'stone', step: 4, below: -0.55 }, pebbles: { size: 0.1, pores: 0.4 }, creases: 0.7 };
  const pitsH: { c: V3; r: number; slit?: boolean; glow?: number[] }[] = [];
  const sk = body.add(skull({ name: 'skull', skull: SKULLS.brute, at: head, hl, hw, hh, pitch: 0.2, bones: { head: iH, neck: iN }, k: 1.8,
    paint: (ch, p, b) => { const px = new Px(ch, b); paintLook(px, faceLook); drawPits(px, pitsH); px.flush(); } }));
  body.finalize(sk);
  const Rs = sk.grids[0].v.length, Cs = sk.grids[0].v[0].length, su = (j: number, s: 1 | -1) => sk.col(j, s) / Cs, sv = (s: number) => sk.row(s) / (Rs - 1);
  const hinge: V3 = [0, head[1] - hh * 0.28, head[2] - hl * 0.08], chin: V3 = [0, head[1] - hh * 0.5, head[2] + hl * 0.5];
  rig.bones[iJ].pos = [hinge[0] - head[0], hinge[1] - head[1], hinge[2] - head[2]]; rest[iJ] = hinge;
  body.add(jaw({ name: 'jaw', hinge, chin, w: hw * 0.46, h: hh * 0.3, bone: iJ, paint: lookPaint(faceLook) }));
  // the armoured brow: a helm of basalt over the crown and brow shelf, and its forward horn bosses
  const scute = lookPaint(plate);
  const crown: [number, number, number, number, number][] = [[0.42, 0.58, sv(0) + 0.03, sv(1) + 0.03, 0.2], [0.3, 0.43, sv(0) + 0.06, sv(1) + 0.06, 0.18], [0.57, 0.7, sv(0) + 0.06, sv(1) + 0.06, 0.18],
    [0.4, 0.6, sv(1) + 0.02, sv(2) + 0.04, 0.26], [0.26, 0.41, sv(1) + 0.05, sv(2) + 0.06, 0.24], [0.59, 0.74, sv(1) + 0.05, sv(2) + 0.06, 0.24],
    [0.36, 0.5, sv(2) + 0.03, sv(3) + 0.05, 0.34], [0.5, 0.64, sv(2) + 0.03, sv(3) + 0.05, 0.34], [0.24, 0.37, sv(2) + 0.06, sv(3) + 0.04, 0.4], [0.63, 0.76, sv(2) + 0.06, sv(3) + 0.04, 0.4]];
  crown.forEach(([a0, a1, b0, b1, h], k) => body.add(shell({ name: 'crown' + k, host: sk, u: [a0, a1], v: [b0, b1], nu: 3, nv: 3, levels: 1, sink: 0.1, rim: 2, ridges: [0.5],
    lift: (a, b) => h * (0.45 + 0.55 * Math.sin(Math.PI * a)) * (0.6 + 0.4 * b), skin: () => [iH, 1], paint: scute, k: 1.6 })));
  // mandible plates: two hinged blades of bone either side of the mouth, on the jaw
  for (const s of [-1, 1] as const) {
    const q = gridSurf(sk.m, sk.grids[0], su(5, s), sv(5));
    const b0: V3 = [q.p[0] + s * 0.1, q.p[1] - hh * 0.05, q.p[2] - hl * 0.25];
    body.add(spine({ name: 'mand' + s, at: b0, dir: norm([s * 0.18, -0.35, 1]), len: hl * 0.62, r: hl * 0.09, skin: () => [iJ, 1], paint: spikeLook, k: 1.4 }));
  }
  // two rows of slit eyes down each side and the sensory pits under them
  const eyeR = hl * 0.05;
  rig.eyes.forEach((e, k) => {
    const s = (k === 0 ? -1 : 1) as 1 | -1, q = gridSurf(sk.m, sk.grids[0], su(2, s), sv(3) + 0.02);
    const ax: V3 = [q.n[0], q.n[1] * 0.4, q.n[2] + 0.35], c: V3 = [q.p[0] - q.n[0] * eyeR * 0.35, q.p[1] - q.n[1] * eyeR * 0.35, q.p[2] - q.n[2] * eyeR * 0.35];
    rig.bones[e.bone].pos = [c[0] - head[0], c[1] - head[1], c[2] - head[2]]; rest[e.bone] = c; rig.bones[e.pupil].pos = [0, 0, 0]; rest[e.pupil] = c;
    body.add(eyeball({ name: 'eye' + k, c, ax, r: eyeR * 1.4, bone: e.bone, iris: RP('ochre'), pupil: 'bar', irisA: 0.75 }));
    const lid = rig.lids[k];
    if (lid) { rig.bones[lid.bone].pos = [c[0] - head[0], c[1] - head[1], c[2] - head[2]]; rest[lid.bone] = c; lid.axis = norm(cross([0, 1, 0], norm(ax)).map((v) => v * -s) as V3) as [number, number, number]; body.add(eyelid({ name: 'lid' + k, c, ax: norm(ax), r: eyeR * 1.4, bone: lid.bone, paint: lookPaint({ ...faceLook, pebbles: { size: 0.04 } }) })); }
    // the second row and the back eyes: small lidless slit eyes in sockets, glinting ochre
    for (let r = 0; r < 3; r++) { const qq = gridSurf(sk.m, sk.grids[0], su(2, s) - s * 0.02 * (r + 1), sv(3) - 0.06 - r * 0.07); pitsH.push({ c: qq.p, r: eyeR * 0.85, slit: true, glow: RP('ochre') }); }
    for (let r = 0; r < 4; r++) { const qq = gridSurf(sk.m, sk.grids[0], su(3, s), sv(4) + r * 0.05); pitsH.push({ c: qq.p, r: eyeR * 0.45 }); }
  });
  // ---------------------------------------------------------------- legs: six striders with plated shins and three blunt claws
  const clawLook = lookPaint({ ramp: 'basalt', step: 3, creases: 0.6, glints: { size: 0.25, every: 0.5 }, extra: (px) => px.folds([0, 1, 0], [0, 0, 0], 0.09, { depth: 0.5 }) });
  for (const lg of rig.legs) {
    const [i0, i1, i2] = lg.bones, s = lg.side, r0 = lg.pair === 0 ? 1.55 : 1.6;
    const L = limb({
      name: 'leg' + lg.pair + (s > 0 ? 'r' : 'l'), side: s, hip: rest[i0], knee: rest[i1], sole: rest[i2],
      bones: { parent: lg.pair === 0 ? X.bi('chest') : rig.root, up: i0, lo: i1, foot: i2, flex: lg.flex },
      rings: LIMB_TYPES.strider(r0), foot: { pad: r0 * 0.95, h: 0.7, fwd: 0.18, nail: 'claw', lobe: 0.22, toes: [-38, 0, 38].map((a, k) => ({ a, len: 0.5, r: 0.44, claw: k === 1 ? 1.35 : 1.1, curl: 0.5, drop: 0.2 })) },
      paint: (ch, p, b) => {
        const px = new Px(ch, b); paintLook(px, hide());
        // plated shins: rows of keeled scutes down the front of the lower leg and over the knee
        const N = px.gb.N, P = px.gb.P, ky = rest[i1][1];
        px.scales({ size: 0.55, kind: 'keel', flow: 1, mask: (i) => (N[i * 3 + 2] > 0.2 && P[i * 3 + 1] < ky + 1.6 && P[i * 3 + 1] > 1.2 ? 1 : 0) });
        px.flush();
      },
      clawPaint: clawLook, k: 1,
    });
    body.add(L.skin); body.add(L.toes); body.add(L.claws);
  }
  // ---------------------------------------------------------------- the tail club
  { const c: V3 = [tip[0], tip[1], tip[2] + 0.3]; body.add(sac({ name: 'club', at: c, n: [0, 0, -1], up: [0, 1, 0], r: [1.1, 0.9, 1.0], sink: 0.3, skin: () => [rig.tail[rig.tail.length - 1], 1], paint: lookPaint(plate), k: 1.2 }));
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, dir: V3 = [Math.cos(a), Math.sin(a), -0.6]; body.add(spine({ name: 'cspk' + k, at: [c[0] + Math.cos(a) * 0.8, c[1] + Math.sin(a) * 0.65, c[2] - 1.0], dir, len: 0.9, r: 0.24, skin: () => [rig.tail[rig.tail.length - 1], 1], paint: spikeLook, k: 1.2 })); } }
  // ochre lichen over the plates and the flanks
  for (let k = 0; k < 70; k++) {
    const u = 0.2 + h3(k, 21, seed) * 0.6, v = 0.15 + h3(k, 23, seed) * 0.7, q = gridSurf(tr.m, tr.grids[0], u, v), lift = 0.6 + 0.6 * Math.cos((u - 0.5) * 3);
    lichen.push({ c: [q.p[0] + q.n[0] * lift, q.p[1] + q.n[1] * lift, q.p[2] + q.n[2] * lift], n: q.n, r: 0.25 + h3(k, 25, seed) * 0.45, ramp: k % 3 ? 'ochre' : 'straw', cup: 'rust' });
  }
  const out = body.build({ den: 34 });
  if ((globalThis as any).__titanStats) console.log([...body.stats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k + ':' + v).join(' '));
  return { geo: out.geo, tex: out.tex, tris: out.tris, den: Math.round(body.den), fill: body.page.fill };
}
