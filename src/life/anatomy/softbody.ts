// ANATOMY LIBRARY: the soft-bodied plans. A SERPENT (morph.ts serpent: a chain of segment bones behind the head) is
// one tube down its bones: an annelid's ringed body (annuli inked round it, a swollen saddle, rows of chitin setae
// down the flanks, eye spots, a round maw lined with inward teeth) or, on a scaled serpent, keeled scales over the
// back and broad ventral scutes. A GASTROPOD (morph.ts gastropod) is a muscular foot with a flat rippled sole and a
// mantle skirt, a head with lower tentacles and two eyes on stalks that ride the stalk bones, and a coiled shell on
// the shell bone: a tube swept along a logarithmic spiral, ribbed with growth lines and banded along its whorls.
import type { V3, Wt } from '../kit';
import type { Rig } from '../morph';
import type { Design } from '../design';
import { Body, chainSkin, type Piece, type Chart, type Tone } from './core';
import { trunk, type Station } from './trunk';
import { stalk, spine, sac, curve } from './append';
import { eyeball } from './head';
import { Px, RP } from './paint';
import { rs, sh } from '../species/util';
import { drawNostrils } from './face';
import { growCyber } from '../cyber/mount';
import { CYBER } from '../cyber/catalog';

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function buildSerpent(d: Design, rig: Rig, rest: V3[]) {
  const D = rig.dims, W = D.W, L = rig.length, segs = rig.spine, n = segs.length, seed = (d.seed >>> 0) % 997, g = (x: string) => d.genes.includes(x);
  const fitted = (d.fit ?? []).filter((id) => CYBER[id]);
  const body = new Body(L > 3 || fitted.length ? 1024 : 512);
  body.seed = d.seed; body.levelCap = 1; body.quickLevels = 0;
  const scaled = d.cover === 'scales';
  const base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), acc = rs(d.colors.accent);
  const head = rest[rig.head], P = segs.map((i) => rest[i]);
  const tail = add(P[n - 1], [0, 0, -D.seg * 0.9]);
  const st: Station[] = [], cs: V3[] = [];
  const rOf = (i: number) => (i < n * 0.3 ? 1 : 1 - ((i - n * 0.3) / (n * 0.7)) * 0.65) * W * 0.5;
  st.push({ c: tail, s: [W * 0.1, W * 0.09], p: 'round' }); cs.push(tail);
  for (let i = n - 1; i >= 0; i--) { const r = rOf(i) * (g('setae') && Math.abs(i - Math.round(n * 0.3)) < 1 ? 1.18 : 1); st.push({ c: add(P[i], [0, -r * 0.04, 0]), s: [r * 1.06, r * 0.94], p: scaled ? 'flat' : 'round' }); cs.push(P[i]); }
  st.push({ c: add(head, [0, 0, -D.seg * 0.2]), s: [W * 0.56, W * 0.5], p: 'round' });
  st.push({ c: add(head, [0, 0, D.seg * 0.35]), s: [W * 0.48, W * 0.42], p: 'round' });
  st.push({ c: add(head, [0, -W * 0.02, D.seg * 0.62]), s: [W * 0.32, W * 0.28], p: 'round' });
  const skin = chainSkin([tail, ...[...P].reverse(), head, add(head, [0, 0, D.seg])], [segs[n - 1], ...[...segs].reverse(), rig.head], 0.35);
  const R = RP(base[0]), Rb = RP(belly[0]), Rp = RP(pat[0]);
  const paint = (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), Pp = px.gb.P, N = px.gb.N;
    px.base((i) => {
      const z = Pp[i * 3 + 2], ny = N[i * 3 + 1];
      if (ny < -0.55) return [Rb, belly[1]];
      const band = d.pattern === 'bands' || d.pattern === 'rings' ? Math.abs(((z / (W * 1.4)) % 1 + 1) % 1 - 0.5) < 0.16 : d.pattern === 'stripes' ? Math.abs(N[i * 3]) > 0.55 && Math.abs(N[i * 3]) < 0.8 : false;
      return band ? [Rp, pat[1]] : [R, base[1]];
    });
    if (scaled) { px.scales({ size: W * 0.14, kind: 'keel', flow: -1, mask: (i) => (N[i * 3 + 1] > -0.5 ? 1 : 0) }); px.scales({ size: W * 0.3, kind: 'scute', flow: -1, mask: (i) => (N[i * 3 + 1] < -0.55 ? 1 : 0) }); }
    else { px.folds([0, 0, 1], head, D.seg * 0.28, { depth: 0.9, wob: 0.15 }); px.pebbles(W * 0.08, { depth: 0.4, pores: 0.6 }); px.glints(RP('snow'), { every: 0.6, size: W * 0.15 }); }
    px.creaseInk(0.7);
    // eye spots and the maw
    const front = add(head, [0, 0, D.seg * 0.7]), spots = g('eye_spots') ? [-1, 1].map((s) => ({ c: add(head, [s * W * 0.3, W * 0.25, D.seg * 0.35]), r: W * 0.06, dir: [0, 0, 1] as V3, curl: 0 })) : [];
    drawNostrils(px, spots);
    for (let i = 0; i < px.n; i++) { const dz = front[2] - Pp[i * 3 + 2], dr = Math.hypot(Pp[i * 3] - front[0], Pp[i * 3 + 1] - front[1]); if (dz < D.seg * 0.25 && dr < W * 0.22) { px.rampI[i] = px.ramp(RP('flesh')); px.step[i] = dr < W * 0.12 ? 0 : 1; px.mark[i] = 0; } }
    px.flush();
  };
  (paint as unknown as { tone: Tone }).tone = { ramp: R, step: base[1], belly: { ramp: Rb, step: belly[1], below: -0.55 } };
  const tr = body.add(trunk({ name: 'body', stations: st, tween: 1, capS: true, capE: true, rings: scaled ? [] : st.map((_, k) => ({ at: k, s: 1.2, ink: true })).slice(1, -2), skin, paint, k: 1 }));
  tr.reg = 1;
  // the maw's teeth, a ring of inward hooks; setae down the flanks
  if (g('ring_maw')) { const c = add(head, [0, -W * 0.02, D.seg * 0.62]); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, at = add(c, [Math.cos(a) * W * 0.17, Math.sin(a) * W * 0.15, 0]); body.add(spine({ name: 'mt' + k, at, dir: nrm([-Math.cos(a), -Math.sin(a), 0.6]), len: W * 0.12, r: W * 0.025, skin: () => [rig.head, 1], paint: flat(['bone', 4]), levels: 0, around: 4 })).farSkip = true; } }
  if (g('setae')) for (let i = 0; i < n; i += 1) for (const s of [-1, 1]) for (const up of [0.2, -0.3]) { const r = rOf(i), at = add(P[i], [s * r * 0.95, up * r, 0]); body.add(spine({ name: 'set' + i + s + up, at, dir: nrm([s, up - 0.3, -0.4]), len: r * 0.55, r: r * 0.05, skin: () => [segs[i], 1], paint: flat(['ochre', 2]), levels: 0, around: 3 })).farSkip = true; }
  void acc; void seed; void sh; void lerp; void scl;
  // a cyborg worker's machinery: stations run from the tail (t 0) to the neck (t 1) down the segment bones
  if (fitted.length) {
    const ctr = (f: number): { c: V3; r: number; i: number } => { const i = Math.max(0, Math.min(n - 1, f)), i0 = Math.floor(i), i1 = Math.min(n - 1, i0 + 1), k = i - i0; return { c: lerp(P[i0], P[i1], k), r: rOf(i0) * (1 - k) + rOf(i1) * k, i: Math.round(i) }; };
    const at = (t: number, a: number) => {
      const q = ctr((1 - t) * (n - 1)), dir = nrm([Math.sin(a), Math.cos(a), 0]);
      return { p: add(add(q.c, [0, -q.r * 0.04, 0]), [dir[0] * q.r * 1.06, dir[1] * q.r * 0.94, 0]), n: dir };
    };
    growCyber({
      d, body, rig, rest, W, H: W, L, seed, spine: skin, at, chest: segs[0], hips: segs[n - 1], legs: [], arms: [], serpent: true,
      head: { bone: rig.head, c: head, fwd: [0, 0, 1], up: [0, 1, 0], hw: W * 0.5, hh: W * 0.45, hl: D.seg * 0.9, eyes: [] },
      neck: { bone: segs[0], c: lerp(P[0], head, 0.35), dir: nrm([head[0] - P[0][0], head[1] - P[0][1], head[2] - P[0][2]]), r: rOf(0) * 1.02 },
    });
  }
  const out = body.build({ den: 64, maxScale: 8, budget: 11600 });
  return { geo: out.geo, tex: out.tex, tris: out.tris, den: Math.round(body.den), fill: body.page.fill };
}

export function buildGastropod(d: Design, rig: Rig, rest: V3[]) {
  const D = rig.dims, W = D.W, H = D.H, L = rig.length, g = (x: string) => d.genes.includes(x);
  const body = new Body(L > 1.2 ? 1024 : 512);
  body.seed = d.seed; body.levelCap = 1; body.quickLevels = 0;
  const base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), acc = rs(d.colors.accent);
  const iF = rig.root, iH = rig.head, foot = rest[iF], head = rest[iH];
  // ---- the foot: a long tapering muscle on a flat sole, the back raised, a mantle skirt under the shell
  const st: Station[] = [];
  const zt = foot[2] - L * 0.52, zh = foot[2] + L * 0.42, y0 = foot[1] - H * 0.5;
  for (let k = 0; k <= 8; k++) { const f = k / 8, w = W * 0.5 * (f < 0.1 ? 0.25 + f * 6 : f < 0.8 ? 0.85 + 0.15 * Math.sin(Math.PI * f) : 1 - (f - 0.8) * 2.2), h = H * (0.38 + 0.25 * Math.sin(Math.PI * Math.min(1, f * 1.15))) * (f > 0.8 ? 1.1 : 1); st.push({ c: [0, y0 + h, zt + (zh - zt) * f], s: [Math.max(W * 0.08, w), h], p: [[0, 1], [0.44, 0.96], [0.8, 0.8], [0.97, 0.45], [1.04, 0.05], [1.0, -0.55], [0.86, -0.92], [0.45, -1], [0, -1]] }); }
  const skin = chainSkin([[0, foot[1], zt], foot, head, [0, head[1], zh + L * 0.1]], [iF, iF, iH], 0.4);
  const wetSkin = (c: [import('../../art/palette').RampName, number]) => {
    const f = (ch: Chart, _p: Piece, b: Body) => {
      const px = new Px(ch, b), N = px.gb.N;
      px.base((i) => (N[i * 3 + 1] < -0.6 ? [RP(belly[0]), belly[1]] : [RP(c[0]), c[1]]));
      px.pebbles(W * 0.07, { depth: 1.0, pores: 0.4 });
      px.folds([1, 0, 0], foot, W * 0.06, { depth: 0.5, mask: (i) => (N[i * 3 + 1] < -0.6 ? 1 : 0) });
      px.creaseInk(0.7);
      px.glints(RP('snow'), { every: 0.6, size: W * 0.1 });
      if (g('chloro_skin')) px.spots(W * 0.12, RP('moss'), 4, { density: 0.5 });
      px.flush();
    };
    (f as unknown as { tone: Tone }).tone = { ramp: RP(c[0]), step: c[1], belly: { ramp: RP(belly[0]), step: belly[1], below: -0.6 } };
    return f;
  };
  const ft = body.add(trunk({ name: 'foot', stations: st, tween: 1, capS: true, capE: true, rings: [{ at: 7, s: 1, ink: true }], skin, paint: wetSkin(base), k: 1 }));
  ft.reg = 1;
  // ---- the head: two lower tentacles, two eye stalks on their bones
  const hc: V3 = [0, head[1] - H * 0.1, zh];
  for (const s of [-1, 1] as const) {
    const b0 = add(hc, [s * W * 0.18, -H * 0.12, 0]);
    body.add(stalk({ name: 'tent' + s, path: curve([b0, add(b0, [s * W * 0.12, -H * 0.05, L * 0.08]), add(b0, [s * W * 0.2, -H * 0.12, L * 0.13])], 5), r: (t) => W * 0.05 * (1 - t * 0.5), around: 6, skin: () => [iH, 1], paint: wetSkin(sh(base, 1)), levels: 0 })).reg = 7;
  }
  for (const si of rig.stalks) {
    const s = Math.sign(rig.bones[si].pos[0]) || 1, p0 = rest[si], sl = L * 0.32, tip = add(p0, [s * sl * 0.24, sl * 0.95, sl * 0.24]);
    body.add(stalk({ name: 'estalk' + s, path: curve([add(p0, [0, -H * 0.1, 0]), lerp(p0, tip, 0.5), tip], 6), r: (t) => W * 0.045 * (1 - t * 0.35), around: 6, ringEvery: 2, skin: () => [si, 1], paint: wetSkin(sh(base, 1)), levels: 0 })).reg = 4;
    body.add(eyeball({ name: 'eye' + s, c: add(tip, [0, W * 0.02, 0]), ax: nrm([s * 0.5, 0.3, 1]), r: W * 0.075, bone: si, iris: RP('ink'), pupil: 'pin', irisA: 0.9, levels: 0, around: 8 })).reg = 4;
  }
  // ---- the shell: a tube swept on a logarithmic spiral round a lateral axis, aperture down and forward
  if (rig.tail.length && g('shell')) {
    const ib = rig.tail[0], sc = rest[ib], S = L * 0.48;
    const turns = 2.6, steps = 26, pts: V3[] = [], rad: number[] = [];
    const c0: V3 = add(sc, [0, S * 0.42, -S * 0.08]);
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, a = -turns * Math.PI * 2 * (1 - t) - 0.3, rr = S * 0.5 * Math.exp(-2.1 * (1 - t)), tw = S * 0.18 * (1 - t) * 0.9;
      pts.push(add(c0, [tw * 0.6 - S * 0.04, Math.sin(a) * rr, Math.cos(a) * rr * 0.95]));
      rad.push(S * 0.3 * Math.exp(-2.1 * (1 - t)) + S * 0.01);
    }
    const shellPaint = (ch: Chart, _p: Piece, b: Body) => {
      const px = new Px(ch, b), Pp = px.gb.P;
      // bands along the whorls (by the chart's u, round the tube), growth lines across them (by v)
      px.base((i) => { const x = i % px.w, u = (x + 0.5) / px.w, band = Math.abs(((u * 3 + 0.2) % 1) - 0.5) < 0.12; return band ? [RP(pat[0]), pat[1]] : [RP(acc[0]), Math.min(RP(acc[0]).length - 1, acc[1] + 1)]; });
      px.folds([0, 0, 1], c0, S * 0.025, { depth: 0.7, wob: 0.5 });
      for (let i = 0; i < px.n; i++) { const y = Math.floor(i / px.w); if (y % 9 === 0) px.mark[i] -= 1.2; void Pp; }
      px.creaseInk(0.6);
      px.glints(RP('snow'), { every: 0.5, size: S * 0.05 });
      px.flush();
    };
    (shellPaint as unknown as { tone: Tone }).tone = { ramp: RP(acc[0]), step: acc[1] + 1 };
    const sp = body.add(stalk({ name: 'shell', path: pts, r: (t) => rad[Math.round(t * steps)], around: 12, sec: (a) => 1 + 0.06 * Math.cos(a * 2), ringEvery: 3, capS: true, capE: false, skin: () => [ib, 1] as Wt, paint: shellPaint, levels: 1, k: 1.3 }));
    sp.reg = 2;
    // the lip of the aperture
    body.add(sac({ name: 'lip', at: pts[steps], n: nrm([0, -0.6, 0.6]), up: [1, 0, 0], r: [rad[steps] * 1.05, rad[steps] * 1.05, rad[steps] * 0.15], sink: 0.5, skin: () => [ib, 1], paint: shellPaint, levels: 0 })).reg = 2;
  }
  const out = body.build({ den: 64, maxScale: 8, budget: 11600 });
  return { geo: out.geo, tex: out.tex, tris: out.tris, den: Math.round(body.den), fill: body.page.fill };
}

const flat = (c: [import('../../art/palette').RampName, number]) => { const f = (ch: Chart, _p: Piece, b: Body) => { const px = new Px(ch, b); px.base(() => [RP(c[0]), c[1]]); px.creaseInk(0.6); px.flush(); }; (f as unknown as { tone: Tone }).tone = { ramp: RP(c[0]), step: c[1] }; return f; };
