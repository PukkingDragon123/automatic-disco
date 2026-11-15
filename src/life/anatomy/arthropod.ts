// ANATOMY LIBRARY: arthropods. Insects, spiders, crabs, beetles, moths and the rest from their rig (morph.ts
// arthropod) and genes: a thorax of sclerites (a pronotum shield over segment rings), a head capsule with compound
// eyes of drawn facets (or a spider's eight simple eyes), segmented antennae on their bones (filiform, clubbed or
// feathered), mandibles or venom chelicerae on their bones; an abdomen of overlapping tergite bands down the abdomen
// bones (a spider's swollen opisthosoma with its pattern and spinnerets); legs of real joints (coxa, femur, tibia,
// a chain of tarsal segments ending in paired claws) with spines down the tibiae; elytra, veined gossamer or scaled
// moth wings with eyespots on the wing bones; a crab's toothed carapace, stalked eyes and chelae; horns, a stinger,
// a lantern. Chitin is painted as hard pixel art: planar light on each plate, sutures and punctures, a dark outline
// at every joint, hard glints, bristles.
import type { RampName } from '../../art/palette';
import type { V3, Wt } from '../kit';
import type { Rig } from '../morph';
import type { Design } from '../design';
import { Body, gridSurf, chainSkin, type Piece, type Chart, type Tone } from './core';
import { trunk, type Station } from './trunk';
import { shell } from './armour';
import { stalk, fin, horn, sac, spine, curve } from './append';
import { eyeball } from './head';
import { Px, RP, cell3, h3 } from './paint';
import { rs, sh } from '../species/util';

type C2 = [RampName, number];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dst = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const T3 = (v: V3): [number, number, number] => [v[0], v[1], v[2]];

/** hard chitin: one ramp step per plate, planar light, sutures inked, punctures, hard glints, a darker step toward the
 *  joints of a segment (`along` gives 0..1 along the segment for a point), bristles on the legs */
export function chitinPaint(c: C2, o: { pits?: number; glint?: number; setae?: number; band?: C2; bandAt?: (p: V3) => number; light?: number } = {}) {
  const f = (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P;
    if (o.light !== undefined) px.lightK = o.light;
    const R = RP(c[0]), Rb = o.band ? RP(o.band[0]) : R, q: V3 = [0, 0, 0];
    px.base((i) => { if (!o.bandAt) return [R, c[1]]; q[0] = P[i * 3]; q[1] = P[i * 3 + 1]; q[2] = P[i * 3 + 2]; const k = o.bandAt(q); return k > 0 ? [Rb, o.band ? o.band[1] : c[1] - 1] : [R, c[1]]; });
    px.creaseInk(0.6, { dark: 2, lit: 1.2 });
    if (o.pits) px.pebbles(o.pits, { depth: 0.45, pores: 0.6 });
    if (o.setae) px.pelt({ len: o.setae, width: o.setae * 0.5, tooth: 0.2, clump: 0.05, strands: 0.5, flow: 1 });
    // the sheen: a hard highlight streak where each plate turns square to the light (lacquered chitin), a dark
    // reflected band just past it
    const N = px.gb.N, L = b.light, Hh = nrm([L[0], L[1] + 0.3, L[2] + 0.8]);
    for (let i = 0; i < px.n; i++) { const sp = N[i * 3] * Hh[0] + N[i * 3 + 1] * Hh[1] + N[i * 3 + 2] * Hh[2]; if (sp > 0.9) px.mark[i] += 1.6; else if (sp > 0.8) px.mark[i] += 0.7; else if (sp > 0.72 && sp < 0.76) px.mark[i] -= 0.6; }
    px.glints(RP('snow'), { every: o.glint ?? 0.7, size: (o.pits ?? 0.02) * 3 });
    px.flush();
  };
  (f as unknown as { tone: Tone }).tone = { ramp: RP(c[0]), step: c[1] };
  return f;
}
/** a glossy simple eye: a dark dome, a deep blue-black heart, a hard highlight cluster up toward the light and a soft
 *  reflected rim below (wet: the shader adds the sun's specular) */
function glossEye() {
  const f = (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), N = px.gb.N, L = b.light, Hh = nrm([L[0], L[1] + 0.3, L[2] + 0.8]);
    px.lightK = 0.3;
    px.base((i) => { const sp = N[i * 3] * Hh[0] + N[i * 3 + 1] * Hh[1] + N[i * 3 + 2] * Hh[2]; return sp > 0.93 ? [RP('snow'), 5] : sp > 0.82 ? [RP('sapphire'), 3] : N[i * 3 + 1] < -0.5 ? [RP('sapphire'), 2] : [RP('ink'), 1]; });
    px.flush({ eye: () => true });
  };
  (f as unknown as { tone: Tone }).tone = { ramp: RP('ink'), step: 1 };
  return f;
}
/** a compound eye: a dome of drawn hexagonal facets, each lit on its own upper side with a dark rim, a few glinting */
function compoundPaint(c: C2) {
  const f = (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, L = b.light, tpm = 1 / px.mpt, size = Math.max(px.mpt * 3.2, 0.004);
    // a glossy dome under the facets: a broad sheen toward the light, a reflected rim below
    const Hh = nrm([L[0], L[1] + 0.3, L[2] + 0.8]);
    px.base((i) => { const sp = N[i * 3] * Hh[0] + N[i * 3 + 1] * Hh[1] + N[i * 3 + 2] * Hh[2]; return [RP(sp > 0.8 ? 'sapphire' : c[0]), sp > 0.8 ? 2 : N[i * 3 + 1] < -0.55 ? c[1] + 1 : c[1]]; });
    for (let i = 0; i < px.n; i++) {
      const cc = cell3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], size, 5), gap = (cc.f2 - cc.f1) * tpm;
      const vx = P[i * 3] - cc.cx, vy = P[i * 3 + 1] - cc.cy, vz = P[i * 3 + 2] - cc.cz, face = (vx * L[0] + vy * L[1] + vz * L[2]) / (Math.hypot(vx, vy, vz) || 1);
      px.mark[i] = gap < 0.8 ? -1.8 : face > 0.3 ? 0.8 : face < -0.3 ? -0.6 : 0;
      const sp = N[i * 3] * L[0] + N[i * 3 + 1] * L[1] + N[i * 3 + 2] * L[2];
      if (sp > 0.8 && face > 0.4 && gap > 1.5 && (cc.id % 3) === 0) px.over[i] = RP('snow')[5];
    }
    px.flush({ eye: () => true });
  };
  (f as unknown as { tone: Tone }).tone = { ramp: RP(c[0]), step: c[1] };
  return f;
}

export function buildArthropod(d: Design, rig: Rig, rest: V3[]) {
  const g = (x: string) => d.genes.includes(x), D = rig.dims, W = D.W, H = D.H, L = rig.length, seed = (d.seed >>> 0) % 997;
  const spider = !!D.spider, crab = !!D.crab, thL = D.thL, hl = D.hl, hw = D.hw, lt = D.lt;
  const body = new Body(L > 1.2 ? 1024 : 512);
  body.seed = d.seed; body.levelCap = 1; body.quickLevels = 0;
  const iR = rig.root, iH = rig.head, root = rest[iR], head = rest[iH];
  const base = rs(d.colors.base), belly = rs(d.colors.belly), pat = rs(d.colors.pattern), acc = rs(d.colors.accent);
  const warn = g('aposematic');
  const plate = chitinPaint(warn ? acc : base, { pits: W * 0.02, glint: 0.6 }), dark = chitinPaint(sh(base, -1), { pits: W * 0.02 }), under = chitinPaint(belly, { pits: W * 0.025, glint: 0.3 });
  // ---------------------------------------------------------------- the thorax: segment rings under a pronotum shield
  const tH = H * (spider ? 0.42 : crab ? 0.42 : 0.48), tW = W * (spider ? 0.48 : crab ? 0.42 : 0.4);
  const thSt: Station[] = [];
  const zb = root[2] - thL * 0.55, zf = root[2] + thL * 0.5;
  for (let k = 0; k <= 4; k++) { const f = k / 4, bulge = Math.sin(Math.PI * (0.15 + f * 0.7)); thSt.push({ c: [0, root[1] + tH * 0.05, zb + (zf - zb) * f], s: [tW * (0.65 + 0.35 * bulge), tH * (0.6 + 0.4 * bulge)], p: crab ? 'flat' : 'barrel' }); }
  const th = body.add(trunk({ name: 'thorax', stations: thSt, tween: 1, capS: true, capE: true, rings: [{ at: 1, s: 1.5, ink: true }, { at: 2, s: 1.5, ink: true }, { at: 3, s: 1.5, ink: true }], skin: () => [iR, 1], paint: plate, k: 1.2 }));
  th.reg = 1;
  body.finalize(th);
  if (!crab) body.add(shell({ name: 'pronotum', host: th, u: [0.22, 0.78], v: [0.45, 1.0], nu: 6, nv: 3, sink: tH * 0.05, rim: 2, ridges: [0.5], curl: { b1: false }, lift: (a, b) => tH * (0.08 + 0.1 * Math.sin(Math.PI * a)) * (0.7 + 0.3 * b), skin: () => [iR, 1], paint: plate, k: 1.2, levels: 1 })).reg = 2;
  // ---------------------------------------------------------------- the abdomen down its bones
  const abd = rig.tail.map((i) => rest[i]), n = abd.length;
  if (n) {
    const aw = W * (spider ? 1.25 : crab ? 0.9 : 1.02) * 0.5, ah = H * (spider ? 1.35 : 1.05) * 0.5, seg = D.seg;
    const pts: V3[] = [];
    const st: Station[] = [];
    // from the waist (petiole) back to the tip
    const start = add(abd[0], [0, spider ? H * 0.1 : 0, seg * 0.1]);
    const end = add(abd[n - 1], [0, spider ? H * 0.1 : -H * 0.05, -seg * (spider ? 1.05 : 1.0)]);
    const K = spider ? 6 : Math.max(5, n * 3);
    for (let k = 0; k <= K; k++) {
      const f = k / K, c = lerp(start, end, f);
      const prof = spider ? Math.sin(Math.PI * Math.min(1, 0.08 + f * 0.95)) ** 0.7 : (f < 0.15 ? 0.6 + f * 2.6 : 1 - (f - 0.15) * 0.62);
      st.push({ c: add(c, [0, spider ? ah * 0.2 * Math.sin(Math.PI * f) : 0, 0]), s: [aw * Math.max(0.12, prof) * (crab ? 1.0 : 1), ah * Math.max(0.12, prof) * (crab ? 0.5 : 1)], p: spider ? 'round' : 'barrel' });
      pts.push(c);
    }
    const abSkin = chainSkin([add(start, [0, 0, seg]), ...abd, end], [iR, ...rig.tail], 0.3);
    const rings = spider ? [] : st.map((_, k) => ({ at: k, s: 1.5, ink: true })).filter((_, k) => k % 1 === 0 && k > 0 && k < K);
    const patR = RP(pat[0]);
    const abPaint = spider
      ? (ch: Chart, p: Piece, b: Body) => { const px = new Px(ch, b), P = px.gb.P; px.base((i) => { const x = P[i * 3], y = P[i * 3 + 1] - start[1], z = P[i * 3 + 2] - start[2]; const chev = Math.abs(((-z / (seg * 0.35)) + Math.abs(x) / (aw * 0.5)) % 1 - 0.5) < 0.15 && y > ah * 0.2 && Math.abs(x) < aw * 0.5; return chev ? [patR, pat[1]] : [RP((warn ? acc : base)[0]), (warn ? acc : base)[1]]; }); px.pelt({ len: W * 0.04, width: W * 0.02, tooth: 0.5, clump: 0.2, flow: -1 }); px.glints(RP('snow'), { every: 0.4, size: W * 0.06 }); px.flush(); }
      : chitinPaint(warn ? acc : base, { pits: W * 0.02, band: d.pattern === 'bands' || warn ? (warn ? ['ink', 1] : pat) : undefined, bandAt: (q) => (Math.abs((((start[2] - q[2]) / (Math.max(1e-3, dst(start, end)) / K)) % 1)) < 0.4 ? 1 : 0) });
    const ab = body.add(trunk({ name: 'abdomen', stations: st, tween: spider ? 1 : 0, capS: true, capE: true, rings, skin: abSkin, paint: abPaint, k: 1.0 }));
    ab.reg = 2;
    body.finalize(ab);
    // tergite bands shingled down the back (not on a spider's soft abdomen)
    if (!spider && !g('elytra')) for (let k = 1; k < K; k++) {
      const v0 = k / K - 0.5 / K, v1 = (k + 1) / K;
      body.add(shell({ name: 'terg' + k, host: ab, u: [0.2, 0.8], v: [Math.max(0, v0), Math.min(1, v1 + 0.02)], nu: 4, nv: 2, sink: ah * 0.04, rim: 2, curl: { b0: false }, lift: (a, bb) => ah * 0.07 * Math.sin(Math.PI * a) * (0.6 + 0.4 * bb), skin: abSkin, paint: plate, k: 1, levels: 0 })).reg = 2;
    }
    if (spider) for (let k = 0; k < 3; k++) body.add(spine({ name: 'spinn' + k, at: lerp(end, start, 0.04), dir: nrm([(k - 1) * 0.4, -0.5, -1]), len: W * 0.08, r: W * 0.025, skin: () => [rig.tail[n - 1], 1], paint: dark, levels: 0, around: 5 })).reg = 10;
    if (g('stinger')) { const tb = rig.tail[n - 1]; body.add(lvl0(horn({ name: 'sting', ctrl: [lerp(end, start, 0.05), add(end, [0, H * 0.1, -seg * 0.25]), add(end, [0, H * 0.35, -seg * 0.3]), add(end, [0, H * 0.45, -seg * 0.05])], r0: lt * 0.7, skin: () => [tb, 1], paint: chitinPaint(['ink', 2], { glint: 0.9 }), rings: 3 }))).reg = 10; }
    if (g('biolum')) { const tb = rig.tail[n - 1], q = gridSurf(ab.m, ab.grids[0], 0.0, 0.2); body.add(sac({ name: 'lantern', at: q.p, n: q.n, up: [0, 0, 1], r: [aw * 0.55, aw * 0.5, ah * 0.2], sink: 0.5, skin: () => [tb, 1], levels: 0, paint: (ch, p, b) => { const px = new Px(ch, b); px.base(() => [RP('glowTeal'), 3]); px.flush({ glow: () => true }); } })).reg = 2; }
    if (g('elytra')) for (const s of [-1, 1]) {
      // the elytra: two hardened forewings closed over the abdomen, domed, striate, meeting at the midline suture
      body.add(shell({ name: 'elytron' + s, host: ab, u: s < 0 ? [0.12, 0.5] : [0.5, 0.88], v: [0.06, 1.0], nu: 5, nv: 6, sink: ah * 0.04, rim: 2, ridges: [0.25, 0.5, 0.75], curl: { b1: true }, lift: (a, bb) => ah * (0.08 + 0.1 * Math.sin(Math.PI * (s < 0 ? a * 0.5 + 0.5 : a * 0.5))) * (0.5 + 0.5 * Math.sin(Math.PI * Math.min(1, bb * 1.2))), skin: abSkin, paint: chitinPaint(warn ? acc : base, { pits: W * 0.018, glint: 0.9, band: d.pattern === 'spots' ? pat : undefined, bandAt: d.pattern === 'spots' ? (q) => (h3(Math.floor(q[0] / (W * 0.18)), Math.floor(q[2] / (W * 0.18)), seed) < 0.25 ? 1 : 0) : undefined }), k: 1.3, levels: 1 })).reg = 2;
    }
  }
  // ---------------------------------------------------------------- the head capsule
  const capL = hl * (spider ? 0.55 : 1), capW = hw * (spider ? 0.48 : 0.46), capH = H * (spider ? 0.3 : 0.34);
  const hSt: Station[] = [];
  const hz0 = head[2] - capL * 0.05, hz1 = head[2] + capL * 0.95;
  for (let k = 0; k <= 4; k++) { const f = k / 4, bulge = Math.sin(Math.PI * (0.2 + f * 0.7)); hSt.push({ c: [0, head[1] + capH * (0.1 - f * 0.25), hz0 + (hz1 - hz0) * f], s: [capW * (0.6 + 0.4 * bulge), capH * (0.6 + 0.4 * bulge)], p: 'round' }); }
  if (!crab) { const hp = body.add(trunk({ name: 'headcap', stations: hSt, tween: 1, capS: true, capE: true, rings: [{ at: 3, s: 1, ink: true }], skin: () => [iH, 1], paint: plate, k: 1.6 })); hp.reg = 3; body.finalize(hp); }
  // eyes: compound domes on the head's sides, a spider's eight simple eyes, a crab's on stalks
  const eyeC: C2 = ['ink', 2];
  if (spider) {
    const sites: [number, number, number][] = [[0.18, 0.5, 0.16], [0.34, 0.44, 0.1], [0.12, 0.72, 0.1], [0.4, 0.62, 0.08]];
    for (const s of [-1, 1]) sites.forEach(([x, y, r], k) => { const e = body.add(eyeball({ name: 'se' + s + k, c: [s * capW * x * 1.4, head[1] + capH * y, hz1 - capL * 0.12 - k * capL * 0.05], ax: nrm([s * x, 0.4, 1]), r: capW * r, bone: iH, iris: RP('ink'), pupil: 'pin', irisA: 0.95, levels: 0, around: 8 })); e.reg = 4; e.paint = glossEye(); });
    // the pedipalps: short leg-like feelers either side of the fangs, three ringed segments ending in a swollen tip
    for (const s of [-1, 1] as const) {
      const b0: V3 = [s * capW * 0.55, head[1] - capH * 0.35, hz1 - capL * 0.1], j1 = add(b0, [s * capW * 0.25, capH * 0.35, capL * 0.35]), j2 = add(j1, [s * capW * 0.05, -capH * 0.2, capL * 0.35]), tip = add(j2, [-s * capW * 0.05, -capH * 0.5, capL * 0.15]);
      body.add(stalk({ name: 'palp' + s, path: curve([b0, j1, j2, tip], 8), r: (t) => lt * 0.42 * (t > 0.8 ? 1.5 : 1 - t * 0.2), around: 6, ringEvery: 2, skin: () => [iH, 1], paint: chitinPaint(sh(base, -1), { pits: W * 0.02, glint: 0.8, setae: lt * 0.8 }), levels: 0 })).reg = 7;
    }
  } else if (crab) {
    for (const s of [-1, 1] as const) {
      const b0: V3 = [s * W * 0.16, root[1] + tH * 0.6, zf], tip = add(b0, [s * W * 0.08, H * 0.38, W * 0.05]);
      body.add(stalk({ name: 'estalk' + s, path: curve([b0, lerp(b0, tip, 0.5), tip], 4), r: () => lt * 0.4, around: 6, skin: () => [iH, 1], paint: plate, levels: 0 })).reg = 4;
      body.add(eyeball({ name: 'ceye' + s, c: tip, ax: nrm([s, 0.6, 0.6]), r: lt * 0.8, bone: iH, iris: RP('ink'), pupil: 'pin', irisA: 1.2, levels: 1, around: 8 })).paint = compoundPaint(eyeC);
    }
  } else if (g('eye_compound')) {
    for (const s of [-1, 1] as const) {
      const c: V3 = [s * capW * 0.78, head[1] + capH * 0.12, head[2] + capL * 0.55], r = capW * (g('wing_gossamer') ? 0.62 : 0.48);
      const e = body.add(eyeball({ name: 'ceye' + s, c, ax: nrm([s, 0.15, 0.35]), r, bone: iH, iris: RP('ink'), pupil: 'pin', irisA: 1.4, levels: 1, around: 10 }));
      e.paint = compoundPaint(sh(warn ? acc : base, -2)); e.reg = 4;
    }
  }
  // antennae on their bones: a scape and a ringed flagellum; feathered for moths, clubbed for beetles
  for (let k = 0; k + 1 < rig.antennae.length; k += 2) {
    const a0 = rig.antennae[k], a1 = rig.antennae[k + 1], p0 = rest[a0], p1 = rest[a1], s = Math.sign(rig.bones[a0].pos[0]) || 1;
    const dir = nrm(sub(p1, p0)), al = dst(p0, p1) * 1.6, tip = add(p1, add(scl(dir, al * 0.7), [s * al * 0.1, -al * 0.05, al * 0.05]));
    body.add(stalk({ name: 'scape' + s, path: curve([sub(p0, scl(dir, lt * 0.2)), lerp(p0, p1, 0.5), p1], 4), r: (t) => lt * 0.32 * (1 - t * 0.3), around: 5, ringEvery: 1, skin: () => [a0, 1], paint: dark, levels: 0 })).reg = 7;
    const path = curve([p1, lerp(p1, tip, 0.5), tip], 8);
    const club = g('horn_beetle') || g('elytra');
    body.add(stalk({ name: 'flag' + s, path, r: (t) => lt * 0.22 * (club && t > 0.75 ? 1.9 : 1 - t * 0.5), around: 5, ringEvery: 1, skin: () => [a1, 1], paint: dark, levels: 0 })).reg = 7;
    if (g('wing_scaled')) { const roots = path.slice(1, -1), dirs = roots.map(() => nrm([s * 0.3, 0.2, 0.9])); body.add(fin({ name: 'pect' + s, roots, dirs, lens: roots.map((_, i) => lt * 1.4 * (1 - i / roots.length * 0.6)), side: roots.map(() => [0, 1, 0] as V3), ray: lt * 0.08, web: lt * 0.03, scallop: 0.5, steps: 2, skin: () => [a1, 1], paint: dark, levels: 0 })).reg = 7; }
  }
  // mouthparts on the mandible bones
  for (const mi of rig.mandibles) {
    const nm = rig.bones[mi].name, p = rest[mi], s = Math.sign(rig.bones[mi].pos[0]) || 1;
    if (nm.startsWith('mand')) {
      if (g('venom_fangs')) {
        body.add(stalk({ name: 'chel' + s, path: curve([add(p, [0, H * 0.05, -hl * 0.05]), add(p, [0, -H * 0.02, hl * 0.1]), add(p, [0, -H * 0.1, hl * 0.12])], 4), r: () => capW * 0.28, around: 6, skin: () => [mi, 1], paint: plate, levels: 0 })).reg = 6;
        body.add(lvl0(horn({ name: 'fang' + s, ctrl: [add(p, [0, -H * 0.08, hl * 0.12]), add(p, [-s * capW * 0.1, -H * 0.2, hl * 0.12]), add(p, [-s * capW * 0.18, -H * 0.28, hl * 0.04])], r0: capW * 0.08, skin: () => [mi, 1], paint: chitinPaint(['ink', 1], { glint: 0.9 }), rings: 3 }))).reg = 6;
      } else {
        // a curved toothed blade closing sideways
        const ctrl: V3[] = [add(p, [s * capW * 0.05, 0, -hl * 0.06]), add(p, [s * capW * 0.12, 0, hl * 0.16]), add(p, [0, -H * 0.02, hl * 0.32]), add(p, [-s * capW * 0.25, -H * 0.03, hl * 0.38])];
        body.add(lvl0(horn({ name: 'mand' + s, ctrl, r0: capW * 0.13, flat: 0.55, rings: 1, skin: () => [mi, 1], paint: chitinPaint(sh(base, -2), { glint: 0.8 }) }))).reg = 6;
      }
    }
  }
  if (g('proboscis')) { const b0: V3 = [0, head[1] - capH * 0.6, hz1 - capL * 0.1]; const pts: V3[] = []; for (let k = 0; k <= 8; k++) { const a = k * 0.8; pts.push(add(b0, [0, -capH * 0.3 * (1 - Math.cos(a)) * (1 - k / 12), capL * 0.2 * Math.sin(a) * (1 - k / 12)])); } body.add(stalk({ name: 'prob', path: pts, r: () => lt * 0.2, around: 5, skin: () => [iH, 1], paint: dark, levels: 0 })).reg = 6; }
  if (g('horn_beetle')) {
    body.add(horn({ name: 'bhorn', ctrl: [[0, head[1] + capH * 0.3, hz1 - capL * 0.3], [0, head[1] + capH * 0.9, hz1 + capL * 0.1], [0, head[1] + capH * 2.0, hz1 + capL * 0.25], [0, head[1] + capH * 2.6, hz1 + capL * 0.05]], r0: capW * 0.32, flat: 0.8, skin: () => [iH, 1], paint: chitinPaint(sh(base, -1), { glint: 0.9 }), rings: 3 })).reg = 5;
    body.add(horn({ name: 'thorn', ctrl: [[0, root[1] + tH * 0.8, zf - thL * 0.3], [0, root[1] + tH * 1.5, zf], [0, root[1] + tH * 1.9, zf + thL * 0.35]], r0: tW * 0.25, flat: 0.8, skin: () => [iR, 1], paint: chitinPaint(sh(base, -1), { glint: 0.9 }), rings: 3 })).reg = 5;
  }
  if (g('chitin_spines')) for (let k = 0; k < 6; k++) { const s = k % 2 ? 1 : -1, q = gridSurf(th.m, th.grids[0], 0.5 + s * 0.12, 0.2 + (k >> 1) * 0.3); body.add(spine({ name: 'tsp' + k, at: q.p, dir: nrm(add(q.n, [0, 0.4, -0.3])), len: H * 0.35, r: lt * 0.5, skin: () => [iR, 1], paint: dark, levels: 0, around: 5 })).reg = 2; }
  // ---------------------------------------------------------------- the crab's carapace: a broad toothed shield
  if (crab) {
    body.add(shell({ name: 'carapace', host: th, u: [0.08, 0.92], v: [0.0, 1.0], nu: 10, nv: 5, sink: tH * 0.1, rim: 3, ridges: [0.5], rings: [0.5],
      lift: (a, bb) => { const x = Math.abs(a - 0.5) * 2, teeth = (Math.abs(Math.sin(a * Math.PI * 7)) * 0.25) * (x > 0.6 ? 1 : 0); return tH * (0.2 + 0.4 * Math.cos(Math.min(1, x) * Math.PI / 2) ** 0.6 + teeth) * (0.7 + 0.3 * Math.sin(Math.PI * bb)); },
      skin: () => [iR, 1], paint: chitinPaint(base, { pits: W * 0.015, glint: 0.6, band: pat, bandAt: (q) => (d.pattern === 'spots' && h3(Math.floor(q[0] / (W * 0.08)), Math.floor(q[2] / (W * 0.08)), seed) < 0.2 ? 1 : 0) }), k: 1.3, levels: 1 })).reg = 2;
  }
  // ---------------------------------------------------------------- legs of real joints
  for (const lg of rig.legs) {
    const [iF, iT, iTa] = lg.bones, s = lg.side, cox = rest[rig.bones[iF].parent >= 0 ? rig.bones[iF].parent : iF];
    const hip = rest[iF], knee = rest[iT], ft = rest[iTa], l1 = dst(hip, knee), l2 = dst(knee, ft);
    const r0 = lt * (crab ? 0.34 : 0.4) * (lg.pair === (spider ? 3 : 2) && g('leg_saltatorial') ? 2.2 : 1);
    const legPaint = chitinPaint(lg.pair % 2 && d.pattern === 'rings' ? pat : base, { pits: lt * 0.3, glint: 0.7, setae: lt * 0.9, band: sh(base, -1), bandAt: (q) => { const y = q[1]; return Math.abs(y - knee[1]) < lt * 0.6 || Math.abs(y - hip[1]) < lt * 0.5 ? 1 : 0; } });
    // the coxa: a stout segment from the body wall
    body.add(stalk({ name: 'coxa' + lg.pair + s, path: curve([add(cox, [-s * lt * 0.6, lt * 0.3, 0]), add(cox, [s * lt * 0.1, -lt * 0.2, 0]), add(hip, [0, -lt * 0.4, 0])], 4), r: () => r0 * 1.25, around: 6, skin: () => [iR, 1], paint: legPaint, levels: 0 })).reg = 8;
    // femur: thick, keeled; tibia: slender with a row of spines behind; the joints knobbed and inked
    const femur = stalk({ name: 'fem' + lg.pair + s, path: curve([hip, lerp(hip, knee, 0.5), knee], 5), r: (t) => r0 * (1.15 - t * 0.25) * (t > 0.9 ? 1.1 : 1), around: 6, sec: (a) => (Math.abs(Math.cos(a)) > 0.8 ? 1.12 : 1), ringEvery: 4, skin: (q) => (q[1] < knee[1] + lt * 0.3 ? [iT, 0.5, iF, 0.5] : [iF, 1]), paint: legPaint, levels: 0 });
    femur.reg = 8; body.add(femur);
    const tibia = stalk({ name: 'tib' + lg.pair + s, path: curve([knee, lerp(knee, ft, 0.5), add(ft, [0, lt * 0.4, 0])], 5), r: (t) => r0 * (0.85 - t * 0.3), around: 6, ringEvery: 4, skin: () => [iT, 1], paint: legPaint, levels: 0 });
    tibia.reg = 8; body.add(tibia);
    for (let k = 0; k < 3; k++) { const at = lerp(knee, ft, 0.3 + k * 0.2); body.add(spine({ name: 'tsp' + lg.pair + s + k, at: add(at, [0, 0, -r0 * 0.6]), dir: nrm([s * 0.3, -0.4, -1]), len: r0 * 1.4, r: r0 * 0.18, skin: () => [iT, 1], paint: dark, levels: 0, around: 4 })).farSkip = true; }
    // the tarsus: a chain of small segments along the ground, outward, ending in two claws
    const zdir = (lg.pair - (spider ? 1.5 : 1)) * 0.5, out = nrm([s, -0.15, -zdir * 0.6]), tl = l2 * 0.32;
    const tpts: V3[] = []; for (let k = 0; k <= 4; k++) tpts.push(add(add(ft, scl(out, tl * k / 4)), [0, lt * 0.3 * (1 - k / 4), 0]));
    body.add(stalk({ name: 'tars' + lg.pair + s, path: tpts, r: (t) => r0 * 0.5 * (1 - t * 0.4), around: 5, ringEvery: 1, skin: () => [iTa, 1], paint: legPaint, levels: 0 })).reg = 8;
    for (const c of [-1, 1]) body.add(lvl0(horn({ name: 'tclaw' + lg.pair + s + c, ctrl: [tpts[4], add(tpts[4], add(scl(out, r0 * 0.6), [0, 0, c * r0 * 0.3])), add(tpts[4], add(scl(out, r0 * 0.8), [0, -r0 * 0.6, c * r0 * 0.4]))], r0: r0 * 0.18, skin: () => [iTa, 1], paint: dark, rings: 9 }))).farSkip = true;
    void l1;
  }
  // a crab's chelae and an insect's raptorial or pincer forelegs ride the mandible list's leg bones
  for (const mi of rig.mandibles) {
    const nm = rig.bones[mi].name; if (nm.startsWith('mand')) continue;
    const p = rest[mi], s = Math.sign(rig.bones[mi].pos[0]) || 1, fl = D.legLen * (crab ? 0.8 : 0.5), w: Wt = [mi, 1];
    const arm: V3[] = [add(p, [-s * lt, lt * 0.5, -lt]), add(p, [s * fl * 0.12, fl * 0.12, fl * 0.2]), add(p, [s * fl * 0.08, fl * 0.15, fl * 0.5])];
    body.add(stalk({ name: 'arm' + s, path: curve(arm, 6), r: (t) => lt * (crab ? 1.4 : 1.0) * (1 - t * 0.2), around: 6, ringEvery: 2, skin: () => w, paint: plate, levels: 0 })).reg = 9;
    const hand = arm[2];
    if (crab || g('chela')) {
      // the claw: a swollen palm, a fixed finger and the movable dactyl, toothed on their inner edges
      const pw = lt * (crab ? 3.0 : 2.0);
      body.add(stalk({ name: 'palm' + s, path: curve([add(hand, [0, 0, -pw * 0.2]), add(hand, [0, 0, pw * 0.4]), add(hand, [0, -pw * 0.05, pw * 0.95])], 6), r: (t) => pw * (0.4 + 0.2 * Math.sin(Math.PI * Math.min(1, t * 1.15))), around: 8, sec: (a) => (Math.abs(Math.sin(a)) > 0.7 ? 0.5 : 1) * (Math.abs(Math.cos(a)) > 0.8 ? 1.12 : 1), keel: true, ringEvery: 2, capS: true, skin: () => w, paint: chitinPaint(acc, { glint: 0.9, pits: lt * 0.35, band: sh(acc, -2), bandAt: (q) => q[2] - (hand[2] + pw * 0.72) }), levels: 1 })).reg = 9;
      const tip0 = add(hand, [0, -pw * 0.1, pw * 1.6]);
      body.add(lvl0(horn({ name: 'finger' + s, ctrl: [add(hand, [0, -pw * 0.2, pw * 0.7]), add(hand, [0, -pw * 0.3, pw * 1.6]), add(tip0, [-s * pw * 0.1, pw * 0.05, pw * 0.6])], r0: pw * 0.28, flat: 0.6, skin: () => w, paint: chitinPaint(sh(acc, -2), { glint: 0.9, band: ['ink', 2], bandAt: (q) => q[2] - (tip0[2] + pw * 0.3) }), rings: 9 }))).reg = 9;
      body.add(lvl0(horn({ name: 'dactyl' + s, ctrl: [add(hand, [0, pw * 0.3, pw * 0.7]), add(hand, [0, pw * 0.45, pw * 1.5]), add(tip0, [-s * pw * 0.1, pw * 0.15, pw * 0.65])], r0: pw * 0.25, flat: 0.6, skin: () => w, paint: chitinPaint(sh(acc, -2), { glint: 0.9, band: ['ink', 2], bandAt: (q) => q[2] - (tip0[2] + pw * 0.3) }), rings: 9 }))).reg = 9;
    } else {
      // a raptorial scythe: a spined femur and a folded tibia hooked at its tip
      body.add(lvl0(horn({ name: 'scythe' + s, ctrl: [hand, add(hand, [0, -fl * 0.2, fl * 0.2]), add(hand, [0, -fl * 0.45, fl * 0.1]), add(hand, [0, -fl * 0.5, -fl * 0.08])], r0: lt * 0.8, flat: 0.5, skin: () => w, paint: dark, rings: 2 }))).reg = 9;
      for (let k = 0; k < 4; k++) body.add(spine({ name: 'ssp' + s + k, at: add(hand, [0, -fl * 0.1 * k, fl * 0.18 - k * fl * 0.02]), dir: nrm([0, -0.6, -1]), len: lt * 1.1, r: lt * 0.2, skin: () => w, paint: dark, levels: 0, around: 4 })).farSkip = true;
    }
  }
  // ---------------------------------------------------------------- wings on the wing bones
  const scaled = g('wing_scaled');
  for (const wi of rig.wings) {
    const p = rest[wi], s = Math.sign(rig.bones[wi].pos[0]) || 1, k = Number(rig.bones[wi].name.slice(-1)) || 0, wl = L * (scaled ? 0.6 : 0.8) * (k ? 0.85 : 1), ww = W * (scaled ? 1.4 : 0.5) * (k ? 0.85 : 1);
    const roots: V3[] = [p, add(p, [s * W * 0.02, 0, -W * 0.05]), add(p, [s * W * 0.03, 0, -W * 0.1])];
    const tips: V3[] = scaled ? [add(p, [s * ww, H * 0.05, -wl * 0.2]), add(p, [s * ww * 0.9, H * 0.03, -wl * 0.65]), add(p, [s * ww * 0.35, 0, -wl * 0.95])] : [add(p, [s * ww * 0.6, H * 0.05, -wl * 0.9]), add(p, [s * ww * 0.8, H * 0.04, -wl * 0.75]), add(p, [s * ww * 0.3, H * 0.02, -wl])];
    const n2 = 6, R2: V3[] = [], Dd: V3[] = [], Ls: number[] = [];
    for (let j = 0; j < n2; j++) { const f = j / (n2 - 1), r = lerp(roots[0], roots[2], f), tp = f < 0.5 ? lerp(tips[0], tips[1], f * 2) : lerp(tips[1], tips[2], (f - 0.5) * 2); R2.push(r); Dd.push(nrm(sub(tp, r))); Ls.push(dst(tp, r)); }
    const wingC = scaled ? (k ? sh(base, -1) : base) : (['quartz', 4] as C2);
    const wp = (ch: Chart, _p: Piece, b: Body) => {
      const px = new Px(ch, b), P = px.gb.P; px.lightK = 0.4;
      px.base((i) => {
        const x = Math.abs(P[i * 3] - p[0]) / ww, z = (p[2] - P[i * 3 + 2]) / wl;
        if (!scaled) { const vein = Math.abs(((x * 7 + z * 2) % 1) - 0.5) < 0.06 || Math.abs(((z * 9) % 1) - 0.5) < 0.05; return [RP(vein ? 'ink' : 'quartz'), vein ? 1 : 4]; }
        // a moth's wing: bands, a dark margin, an eyespot staring back
        const ex = x - 0.55, ez = z - (k ? 0.45 : 0.35), er = Math.hypot(ex * 1.2, ez);
        if (er < 0.16) return er < 0.07 ? [RP('ink'), 1] : er < 0.11 ? [RP(acc[0]), acc[1]] : [RP('ink'), 2];
        if (x > 0.88 || z > 0.92) return [RP(pat[0]), Math.max(0, pat[1] - 1)];
        if (Math.abs(((x + z * 0.6) * 4) % 1 - 0.5) < 0.12) return [RP(pat[0]), pat[1]];
        return [RP(wingC[0]), wingC[1]];
      });
      if (scaled) px.pelt({ len: W * 0.03, width: W * 0.025, tooth: 0.4, clump: 0.15, flow: 1 });
      px.flush();
    };
    (wp as unknown as { tone: Tone }).tone = { ramp: RP(wingC[0]), step: wingC[1] };
    const wpc = body.add(fin({ name: 'wing' + s + k, roots: R2, dirs: Dd, lens: Ls, side: R2.map(() => [0, 1, 0] as V3), ray: lt * 0.12, web: lt * 0.05, scallop: scaled ? 0.12 : 0.05, steps: 3, skin: () => [wi, 1], paint: wp, levels: 0 }));
    wpc.reg = 11;
  }
  const out = body.build({ den: 64, maxScale: 8, budget: 11600 });
  return { geo: out.geo, tex: out.tex, tris: out.tris, den: Math.round(body.den), fill: body.page.fill };
}
export { T3 };
/** a small part at cage level (claws, fangs, mandibles: their silhouette needs no smoothing) */
function lvl0<P extends Piece>(p: P): P { p.levels = 0; return p; }
