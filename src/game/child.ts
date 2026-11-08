// The Veyr itself, hatched from the asteroid: not cute, not human. A gaunt wax-skinned torso with a ribcage under
// the skin, long knuckled arms, a swept-back skull with a glowing fissure, a lipless maw of needles, and where the
// legs should be a nest of tentacles rooted in the rock. It cannot walk: it moves the world with its mind (it lifts,
// sinks and shapes the ground, pulls with gravity) and edits genes. Sculpted with the creature kit (lofted, skinned,
// hand-painted page) and dressed by the player in the mirror pool (babyLook.ts, ui/babyEditor.ts).
import * as THREE from 'three';
import { makeRamp, mixHex } from '../limbo/gfx/pixel';
import { gbuf } from '../gfx/gbuf';
import { clamp, damp } from '../core/rand';
import type { Fx } from './fx';
import { SkinB, Page, type Region, sac, spline, ball, chainWeights, hash, gauss, addV, scl, norm, sub, lerpV, pageTexture, mixC, type V3, type Wt } from '../life/kit';
import { type BabyLook, loadLook } from './babyLook';

const TAU = Math.PI * 2;
const MAXT = 8;
const BONES: string[] = ['base', 'spine', 'chest', 'neck', 'head', 'jaw', 'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR', 'eyeL', 'eyeR', 'ftL', 'ftL2', 'ftR', 'ftR2'];
for (let i = 0; i < MAXT; i++) BONES.push(`t${i}a`, `t${i}b`, `t${i}c`);
const PARENT: Record<string, string> = { base: '', spine: 'base', chest: 'spine', neck: 'chest', head: 'neck', jaw: 'head', armL: 'chest', foreL: 'armL', handL: 'foreL', armR: 'chest', foreR: 'armR', handR: 'foreR', eyeL: 'head', eyeR: 'head', ftL: 'head', ftL2: 'ftL', ftR: 'head', ftR2: 'ftR' };
for (let i = 0; i < MAXT; i++) { PARENT[`t${i}a`] = 'spine'; PARENT[`t${i}b`] = `t${i}a`; PARENT[`t${i}c`] = `t${i}b`; }
const bi = (n: string) => { const i = BONES.indexOf(n); if (i < 0) throw new Error('bone ' + n); return i; };
const SIDES = [['L', 1], ['R', -1]] as const;

function interp(ts: number[], vs: number[], t: number) {
  if (t <= ts[0]) return vs[0];
  for (let i = 0; i + 1 < ts.length; i++) if (t <= ts[i + 1]) { const f = (t - ts[i]) / (ts[i + 1] - ts[i]); const s = f * f * (3 - 2 * f); return vs[i] + (vs[i + 1] - vs[i]) * s; }
  return vs[vs.length - 1];
}
const cosT = (n: number) => Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / (n - 1)));

// torso (seat -> neck); face (chin -> brow), relative to the head bone
const TT = [0, 0.08, 0.2, 0.35, 0.48, 0.6, 0.72, 0.84, 0.93, 1];
const TX = [0.1, 0.2, 0.235, 0.22, 0.17, 0.195, 0.235, 0.25, 0.2, 0.08], TZ = [0.09, 0.17, 0.2, 0.2, 0.15, 0.16, 0.18, 0.18, 0.14, 0.075];
const HS = 1.22; // the skull is too big for the body
const FT = [0, 0.1, 0.3, 0.5, 0.7, 0.86, 1], FX = [0.03, 0.065, 0.095, 0.115, 0.14, 0.15, 0.12].map((v) => v * HS), FZ = [0.03, 0.07, 0.1, 0.12, 0.13, 0.135, 0.12].map((v) => v * HS);
const T0 = 0.2, T1 = 1.0;
const HEAD: V3 = [0, 1.22, 0.06], FY0 = -0.15 * HS, FY1 = 0.16 * HS, FZ0 = 0.035 * HS;
const EYE_A = 0.42, EYE_T = 0.66;

function faceR(t: number): [number, number] { return [interp(FT, FX, t), interp(FT, FZ, t)]; }
function faceSurf(a: number, t: number, push = 0): V3 {
  const [rx, rz] = faceR(t);
  return [HEAD[0] + Math.sin(a) * (rx + push), HEAD[1] + FY0 + t * (FY1 - FY0), HEAD[2] + FZ0 + Math.cos(a) * (rz + push)];
}
const faceN = (a: number): V3 => norm([Math.sin(a), 0.05, Math.cos(a)]);

interface Built { geo: THREE.BufferGeometry; tex: THREE.DataTexture; rest: V3[]; nt: number }
function buildChild(L: BabyLook): Built {
  const B = new SkinB(256, 256), page = new Page(256, 256);
  const reg = (n: string, w: number, h: number) => page.reg(n, w, h);
  const R = {
    TORSO: reg('TORSO', 100, 56), CRAN: reg('CRAN', 84, 44), FACE: reg('FACE', 64, 30), TENT: reg('TENT', 30, 72), ARM: reg('ARM', 22, 52),
    NECK: reg('NECK', 32, 18), HAND: reg('HAND', 22, 14), FING: reg('FING', 10, 18), JAW: reg('JAW', 24, 12), EYE: reg('EYE', 12, 12), TEETH: reg('TEETH', 6, 8), MOUTH: reg('MOUTH', 12, 10), GROW: reg('GROW', 16, 24), GLOW: reg('GLOW', 8, 8),
  };
  let g = 1;
  const rest: V3[] = BONES.map(() => [0, 0, 0]);
  const at = (n: string, p: V3) => { rest[bi(n)] = p; };
  at('spine', [0, 0.3, 0]); at('chest', [0, 0.72, 0]); at('neck', [0, 0.98, 0.02]); at('head', HEAD); at('jaw', addV(HEAD, [0, -0.07, 0.05]));
  const G = L.gaunt, gk = 1 - G * 0.12;
  // ---- torso: pelvis, a slack belly, a narrow waist, the ribcage pressing through, clavicles, shoulder blades, vertebrae
  const tt = cosT(20), tp = tt.map((t): V3 => [0, T0 + t * (T1 - T0), 0]);
  sac(B, R.TORSO, g++, tp, tt.map((t) => [interp(TT, TX, t) * gk, interp(TT, TZ, t)] as [number, number]),
    tt.map((t): Wt => (t < 0.42 ? [bi('spine'), 1] : t < 0.58 ? [bi('spine'), (0.58 - t) / 0.16, bi('chest'), (t - 0.42) / 0.16] : t > 0.95 ? [bi('chest'), 0.6, bi('neck'), 0.4] : [bi('chest'), 1])),
    {
      n: 30, up: [0, 0, 1], cap: 0.3,
      bump: (a, t) => {
        const aa = Math.abs(a);
        const rib = t > 0.52 && t < 0.88 && aa > 0.25 && aa < 2.5 ? (0.05 + 0.09 * G) * Math.max(0, Math.sin((t - 0.52 + 0.035 * aa) * TAU * 5)) * (1 - gauss(aa, 0, 0.2)) : 0;
        return rib + 0.07 * (1 - G) * gauss(a, 0, 0.7) * gauss(t, 0.3, 0.1) // slack belly
          + 0.09 * gauss(aa, Math.PI, 0.13) * Math.max(0, Math.sin(t * 74)) * (t > 0.12 && t < 0.96 ? 1 : 0) // vertebrae
          + 0.13 * gauss(aa, 2.45, 0.3) * gauss(t, 0.8, 0.07) // shoulder blades
          + 0.12 * gauss(aa, 0.85, 0.35) * gauss(t, 0.93, 0.025) // clavicles
          + 0.1 * gauss(aa, 1.05, 0.25) * gauss(t, 0.14, 0.05) // hip bones
          - 0.06 * G * gauss(aa, 1.5, 0.4) * gauss(t, 0.47, 0.06); // waist hollows
      },
    });
  // ---- neck: thin, corded
  const np: V3[] = cosT(9).map((t): V3 => [0, 0.92 + t * 0.34, 0.015 + t * 0.06]);
  sac(B, R.NECK, g++, np, np.map(() => [0.068 * gk, 0.064] as [number, number]), np.map((_, i): Wt => (i < 3 ? [bi('neck'), 0.6, bi('chest'), 0.4] : i > 6 ? [bi('head'), 0.6, bi('neck'), 0.4] : [bi('neck'), 1])),
    { n: 14, up: [0, 0, 1], start: false, end: false, bump: (a) => 0.22 * gauss(Math.abs(a), 0.55, 0.22) + 0.12 * gauss(Math.abs(a), Math.PI, 0.25) });
  // ---- face: narrow chin, hollow cheeks, high cheekbones, a heavy brow over deep sockets, no nose
  const ft = cosT(16), fp = ft.map((t): V3 => [HEAD[0], HEAD[1] + FY0 + t * (FY1 - FY0), HEAD[2] + FZ0]);
  sac(B, R.FACE, g++, fp, ft.map((t) => faceR(t)), ft.map((t): Wt => (t < 0.24 ? [bi('jaw'), 1] : t < 0.36 ? [bi('jaw'), (0.36 - t) / 0.12, bi('head'), (t - 0.24) / 0.12] : [bi('head'), 1])),
    {
      n: 30, up: [0, 0, 1], cap: 0.4,
      bump: (a, t) => {
        const aa = Math.abs(a);
        let b = 0.16 * gauss(aa, 1.05, 0.3) * gauss(t, 0.58, 0.08) - (0.06 + 0.12 * G) * gauss(aa, 0.95, 0.35) * gauss(t, 0.36, 0.09) + 0.12 * gauss(aa, 0.4, 0.3) * gauss(t, 0.86, 0.05);
        if (L.eyes === 'pair' || L.eyes === 'blind') b -= (L.eyes === 'blind' ? 0.08 : 0.2) * gauss(aa, EYE_A, 0.2) * gauss(t, EYE_T, 0.07);
        if (L.eyes === 'slit') b -= 0.14 * gauss(a, 0, 0.18) * gauss(t, 0.74, 0.1);
        if (L.maw === 'radial') b += 0.16 * gauss(a, 0, 0.45) * gauss(t, 0.16, 0.1);
        return b - 0.05 * gauss(a, 0, 0.1) * gauss(t, 0.45, 0.06);
      },
    });
  // ---- cranium: swept back with sulci; a crest ridge or a swollen bulb
  const cr: V3[] = L.skull === 'bulb'
    ? [[0, 0.02, 0.02], [0, 0.16, -0.02], [0, 0.25, -0.11], [0, 0.25, -0.22], [0, 0.18, -0.3]]
    : [[0, 0.02, 0.02], [0, 0.15, -0.04], [0, 0.23, -0.15], [0, 0.27, -0.29], [0, 0.26, -0.42], [0, 0.22, -0.52]];
  const crr = (L.skull === 'bulb' ? [0.13, 0.2, 0.235, 0.21, 0.08] : [0.13, 0.175, 0.19, 0.165, 0.115, 0.04]).map((v) => v * HS);
  const csp = spline(cr.map((p) => addV(HEAD, scl(p, HS))), 18), cts = cr.map((_, i) => i / (cr.length - 1));
  sac(B, R.CRAN, g++, csp.pts, csp.t.map((t) => { const r = interp(cts, crr, t); return [r, r * 0.93] as [number, number]; }), csp.pts.map((): Wt => [bi('head'), 1]),
    { n: 26, cap: 0.35, bump: (a, t) => 0.035 * Math.sin(a * 7 + Math.sin(t * 9) * 1.5) * Math.sin(Math.PI * t) + (L.skull === 'crest' ? 0.28 * gauss(a, 0, 0.12) * Math.sin(Math.PI * Math.min(1, t * 1.2)) : 0) - 0.05 * gauss(a, 0, 0.06) });
  // ---- eyes
  const eye = (a: number, t: number, r: [number, number, number], sunk: number, name: string) => {
    const n = faceN(a), c = addV(faceSurf(a, t), scl(n, -sunk));
    if (name) at(name, c);
    ball(B, R.EYE, g++, c, n, r, [bi(name || 'head'), 1], { n: 12, rings: 7 });
  };
  if (L.eyes === 'pair') for (const [sd, k] of SIDES) eye(k * EYE_A, EYE_T, [0.036, 0.03, 0.03], 0.036, 'eye' + sd);
  else if (L.eyes === 'cluster') {
    for (const [sd, k] of SIDES) eye(k * 0.36, 0.7, [0.026, 0.024, 0.02], 0.012, 'eye' + sd);
    for (const [a, t, r] of [[0.16, 0.8, 0.018], [0.58, 0.68, 0.02], [0.3, 0.86, 0.014], [0.68, 0.79, 0.015]]) for (const [, k] of SIDES) eye(k * a, t, [r, r, r * 0.8], 0.008, '');
  } else if (L.eyes === 'slit') { eye(0, 0.74, [0.024, 0.07, 0.03], 0.02, 'eyeL'); at('eyeR', rest[bi('eyeL')]); }
  else { at('eyeL', HEAD); at('eyeR', HEAD); }
  // ---- throat, teeth
  const jw: Wt = [bi('jaw'), 1], hw: Wt = [bi('head'), 1], hj: Wt = [bi('head'), 0.5, bi('jaw'), 0.5];
  sac(B, R.MOUTH, g++, [addV(HEAD, [0, -0.04, 0.0]), addV(HEAD, [0, -0.06, 0.08]), addV(HEAD, [0, -0.07, 0.13])], [[0.07, 0.04], [0.06, 0.035], [0.04, 0.025]], [hj, hj, hj], { n: 10 });
  const needle = (b0: V3, dir: V3, l: number, r: number, w: Wt) => sac(B, R.TEETH, g++, [b0, addV(b0, scl(dir, l * 0.5)), addV(b0, scl(dir, l))], [[r, r], [r * 0.6, r * 0.6], [0.0015, 0.0015]], [w, w, w], { n: 5 });
  const mt = 0.27;
  if (L.maw === 'needle') {
    for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 1.15; needle(faceSurf(a, mt + 0.02, -0.006), norm([Math.sin(a) * 0.2, -1, 0.25]), 0.035 + (i % 3 === 1 ? 0.02 : 0), 0.0065, hw); }
    for (let i = 0; i < 8; i++) { const a = (i / 7 - 0.5) * 1.0; needle(faceSurf(a, mt - 0.05, -0.008), norm([Math.sin(a) * 0.2, 1, 0.3]), 0.03, 0.006, jw); }
  } else if (L.maw === 'split') {
    for (const [, k] of SIDES) {
      const b0 = faceSurf(k * 0.5, 0.2, -0.01);
      const pts: V3[] = [b0, addV(b0, [k * 0.035, -0.04, 0.03]), addV(b0, [k * 0.02, -0.09, 0.05]), addV(b0, [-k * 0.02, -0.12, 0.05])];
      sac(B, R.JAW, g++, pts, [[0.026, 0.02], [0.022, 0.017], [0.014, 0.011], [0.002, 0.002]], [jw, jw, jw, jw], { n: 8, bump: (a, t) => 0.4 * Math.max(0, Math.sin(t * 18)) * gauss(a, (-k * Math.PI) / 2, 0.5) });
    }
    for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 1.1; needle(faceSurf(a, mt, -0.006), norm([Math.sin(a) * 0.3, -1, 0.3]), 0.03, 0.006, hw); }
  } else {
    const c = faceSurf(0, 0.16, 0.012);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, r0 = 0.042; needle(addV(c, [Math.cos(a) * r0, Math.sin(a) * r0 * 0.8, 0.005]), norm([-Math.cos(a), -Math.sin(a), -0.6]), 0.032, 0.006, Math.sin(a) < 0 ? jw : hw); }
  }
  // ---- arms: long and bony; four long knuckled fingers with dark nails
  for (const [sd, k] of SIDES) {
    const sh: V3 = [k * 0.215, 0.955, 0.0], el: V3 = [k * 0.37, 0.62, 0.02], wr: V3 = [k * 0.31, 0.43, 0.27];
    at('arm' + sd, sh); at('fore' + sd, el); at('hand' + sd, wr);
    const ctrl: V3[] = [addV(sh, [-k * 0.07, 0.02, 0]), sh, lerpV(sh, el, 0.5), el, lerpV(el, wr, 0.5), wr];
    const sp = spline(ctrl, 18), cts2 = [0, 0.15, 0.4, 0.6, 0.8, 1];
    const wts = chainWeights(sp.pts, [ctrl[0], sh, el, wr], [bi('chest'), bi('arm' + sd), bi('fore' + sd)], 0.05);
    sac(B, R.ARM, g++, sp.pts, sp.t.map((t) => { const r = interp(cts2, [0.04, 0.052, 0.04, 0.046, 0.034, 0.03], t) * (1 - G * 0.1); return [r, r] as [number, number]; }), wts,
      { n: 10, cap: 0.6, bump: (a, t) => 0.25 * gauss(t, 0.6, 0.04) * gauss(Math.abs(a), Math.PI, 0.9) + 0.1 * gauss(t, 0.97, 0.03) });
    const hw2: Wt = [bi('hand' + sd), 1], dir = norm(sub(wr, el)), side = norm([dir[2], 0, -dir[0]]);
    const palm = addV(wr, scl(dir, 0.04));
    ball(B, R.HAND, g++, palm, dir, [0.04, 0.022, 0.05], hw2, { n: 10, rings: 5 });
    for (let i = 0; i < 4; i++) {
      const thumb = i === 0, f = (i - 1.8) / 2.2;
      const b0 = thumb ? addV(palm, addV(scl(side, -k * 0.035), [0, 0.01, 0])) : addV(addV(palm, scl(dir, 0.035)), scl(side, f * 0.045));
      const fd = thumb ? norm(addV(scl(dir, 0.6), scl(side, -k * 0.6))) : norm(addV(dir, scl(side, f * 0.25)));
      const Lf = thumb ? 0.07 : 0.15 + (i === 2 ? 0.02 : 0);
      const pts: V3[] = [0, 0.33, 0.66, 1].map((s) => addV(addV(b0, scl(fd, s * Lf)), [0, -s * s * Lf * 0.6, 0]));
      sac(B, R.FING, g++, pts, [[0.011, 0.01], [0.009, 0.009], [0.008, 0.007], [0.004, 0.004]], [hw2, hw2, hw2, hw2], { n: 7, bump: (_a, t) => 0.35 * (gauss(t, 0.33, 0.04) + gauss(t, 0.66, 0.04)) });
    }
  }
  // ---- tentacles: rooted where legs should be, draped over the rim, curling at the tips
  const N = L.tentacles, Lk = 0.75 + L.reach * 0.65;
  for (let i = 0; i < MAXT; i++) {
    const th = ((i + 0.5) / N) * TAU + 0.2, d: V3 = [Math.sin(th), 0, Math.cos(th)], tg: V3 = [Math.cos(th), 0, -Math.sin(th)];
    const tw = i % 2 ? 1 : -1;
    const p0: V3 = addV([0, 0.26, 0], scl(d, 0.07)), p1 = addV(scl(d, 0.3 * Lk), [0, 0.13, 0]), p2 = addV(scl(d, 0.52 * Lk), [0, -0.02, 0]);
    const p3 = addV(scl(d, 0.72 * Lk), scl(tg, 0.07 * tw)), p4 = addV(addV(scl(d, 0.8 * Lk), [0, 0.1, 0]), scl(tg, 0.18 * tw));
    at(`t${i}a`, p0); at(`t${i}b`, lerpV(p1, p2, 0.5)); at(`t${i}c`, p3);
    if (i >= N) continue;
    const sp = spline([p0, p1, p2, p3, p4], 26);
    const wts = chainWeights(sp.pts, [p0, lerpV(p1, p2, 0.5), p3, p4], [bi(`t${i}a`), bi(`t${i}b`), bi(`t${i}c`)], 0.1);
    sac(B, R.TENT, g++, sp.pts, sp.t.map((t) => { const r = (0.078 - t * 0.066) * (t < 0.08 ? 0.8 + t * 2.5 : 1); return [r, r * 0.9] as [number, number]; }), wts,
      { n: 12, bump: (a, t) => -0.22 * gauss(Math.abs(a), Math.PI, 0.38) * (Math.sin(t * 52) > 0.35 && t > 0.15 ? 1 : 0) + 0.04 * Math.sin(t * 30 + a) });
  }
  // ---- growths
  for (const [sd, k] of SIDES) { at('ft' + sd, addV(HEAD, [k * 0.08, 0.06, -0.1])); at('ft' + sd + '2', addV(HEAD, [k * 0.12, -0.16, -0.22])); }
  if (L.growth === 'quills') {
    for (let i = 0; i < 12; i++) {
      const onSkull = i >= 7, bone = onSkull ? 'head' : i < 4 ? 'spine' : 'chest', w: Wt = [bi(bone), 1];
      const b0: V3 = onSkull ? addV(HEAD, [0, 0.21 + (i - 7) * 0.012, -0.08 - (i - 7) * 0.08]) : [0, T0 + 0.25 + i * 0.09, -interp(TT, TZ, 0.06 + i * 0.11) + 0.01];
      const dir = norm(onSkull ? [0, 0.8, -1] : [0, 0.5, -1]);
      sac(B, R.GROW, g++, [b0, addV(b0, scl(dir, 0.06)), addV(b0, scl(dir, onSkull ? 0.1 : 0.13))], [[0.016, 0.016], [0.01, 0.01], [0.0015, 0.0015]], [w, w, w], { n: 5 });
    }
  } else if (L.growth === 'fins') {
    for (const [, k] of SIDES) {
      const pts: V3[] = [], wd: number[] = [];
      for (let j = 0; j <= 7; j++) { const t = j / 7; pts.push([k * 0.02, T0 + 0.2 + t * 0.72, -interp(TT, TZ, 0.2 + t * 0.75) * 0.95]); wd.push(Math.sin(Math.PI * t) * 0.13 + 0.01); }
      const wt = pts.map((p): Wt => (p[1] < 0.6 ? [bi('spine'), 1] : [bi('chest'), 1]));
      for (let j = 0; j + 1 < pts.length; j++) {
        const o0 = addV(pts[j], [k * wd[j] * 0.7, 0, -wd[j]]), o1 = addV(pts[j + 1], [k * wd[j + 1] * 0.7, 0, -wd[j + 1]]);
        B.quad(pts[j], o0, o1, pts[j + 1], R.GROW, [0, j / 7, 1, (j + 1) / 7], [wt[j], wt[j], wt[j + 1], wt[j + 1]], true);
      }
    }
  } else if (L.growth === 'feelers') {
    for (const [sd, k] of SIDES) {
      const b0 = rest[bi('ft' + sd)];
      const ctrl: V3[] = [b0, addV(b0, [k * 0.08, -0.06, -0.08]), addV(b0, [k * 0.12, -0.22, -0.12]), addV(b0, [k * 0.1, -0.42, -0.08]), addV(b0, [k * 0.14, -0.55, 0.0])];
      at('ft' + sd + '2', ctrl[2]);
      const sp = spline(ctrl, 16);
      sac(B, R.GROW, g++, sp.pts, sp.t.map((t) => [0.016 * (1 - t * 0.8), 0.016 * (1 - t * 0.8)] as [number, number]), chainWeights(sp.pts, [b0, ctrl[2], ctrl[4]], [bi('ft' + sd), bi('ft' + sd + '2')], 0.05), { n: 6 });
    }
  }
  const geo = B.build();
  paintChild(L, R);
  page.finish();
  return { geo, tex: pageTexture(page), rest, nt: N };
}

// ------------------------------------------------------------------------------------------------ painting
function paintChild(L: BabyLook, R: Record<string, Region>) {
  const SK = makeRamp(L.skin, 8, { spread: 0.5, hueShift: 0.05 }), BE = makeRamp(mixHex(L.belly, L.skin, 0.5), 8, { spread: 0.45, hueShift: 0.05 }), PA = makeRamp(L.patCol, 6, { spread: 0.4 });
  const VEIN = mixHex(L.skin, L.patCol, 0.65), DARK = mixHex(L.patCol, 0x08060a, 0.6);
  const skin = (r: Region, fn: (x: number, y: number, t: number, a: number) => { k: number; ramp?: number[] } | null, seed: number, veins = 1) => {
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const t = (y + 0.5) / r.h, a = r.th(x);
      let k = 3.8 + (r.fbm(x, y, 4, 3, seed) - 0.5) * 0.9 + (hash(x * 3, y * 5 + seed) - 0.5) * 0.25;
      let ramp = SK;
      if (L.pat === 'mottle' && r.fbm(x, y, 6, 2, seed + 4) > 0.6) ramp = PA;
      if (L.pat === 'spots' && r.fbm(x, y, 9, 1, seed + 9) > 0.66) ramp = PA;
      const o = fn(x, y, t, a);
      if (o) { k += o.k; if (o.ramp) ramp = o.ramp; }
      r.put(x, y, ramp, k, 0.5);
    }
    const nv = Math.round(((r.w * r.h) / 260) * veins * (L.pat === 'veins' ? 1.8 : 0.8));
    for (let i = 0; i < nv; i++) r.crack(hash(i, seed) * r.w, hash(i + 9, seed) * r.h, 6 + Math.floor(hash(i + 3, seed) * 16), hash(i + 1, seed) * 360, VEIN, seed * 7 + i, 0.45, 0.25);
  };
  const glowPx = (r: Region, x: number, y: number, t = 0.3) => { r.set(x, y, mixC(L.glow, 0xffffff, t)); r.alpha(x, y, 185); };
  const r_ = (t: number) => 0.15 * Math.sin(t * 9);
  // torso: pale front, shadows between the ribs, a navel scar, vertebrae
  skin(R.TORSO, (_x, _y, t, a) => {
    const aa = Math.abs(a);
    let k = (t - 0.5) * 0.6;
    let ramp: number[] | undefined;
    if (aa < 0.8 + (r_(t)) && t > 0.08 && t < 0.9) { ramp = BE; k -= 0.2; }
    if (t > 0.52 && t < 0.88 && aa > 0.25 && aa < 2.5 && Math.sin((t - 0.52 + 0.035 * aa) * TAU * 5) < -0.45) k -= 1.6 * (0.5 + L.gaunt);
    if (aa > 2.9 && Math.sin(t * 74) > 0.3) k += 0.8;
    if (L.pat === 'bands' && aa > 1.2 && Math.sin(t * 30) > 0.6) ramp = PA;
    return { k, ramp };
  }, 3);
  R.TORSO.set(R.TORSO.X(0), R.TORSO.h * 0.3, DARK); R.TORSO.set(R.TORSO.X(0), R.TORSO.h * 0.3 + 1, SK[2]);
  if (L.pat === 'veins') for (let i = 0; i < 5; i++) R.TORSO.crack(R.TORSO.X(0) + (hash(i, 4) - 0.5) * 20, R.TORSO.h * (0.55 + hash(i, 6) * 0.3), 14, 90 + (hash(i, 8) - 0.5) * 120, mixC(L.glow, L.skin, 0.4), 31 + i, 0.6, 0.3);
  skin(R.NECK, (_x, _y, _t, a) => ({ k: Math.abs(Math.abs(a) - 0.55) < 0.18 ? 0.6 : Math.abs(a) < 0.3 ? -0.5 : 0 }), 5);
  // face: sunken sockets, hollow cheeks, a lipless slit, nostril slits
  skin(R.FACE, (_x, _y, t, a) => {
    const aa = Math.abs(a);
    let k = 0;
    if (L.eyes === 'pair' || L.eyes === 'blind') { const d = Math.hypot((aa - EYE_A) / 0.3, (t - EYE_T) / 0.16); if (d < 1) k -= 2.6 * (1 - d * d) + 0.4; }
    if (L.eyes === 'slit') { const d = Math.hypot(a / 0.2, (t - 0.74) / 0.22); if (d < 1) k -= 2 * (1 - d); }
    k -= 1.1 * gauss(aa, 0.95, 0.3) * gauss(t, 0.36, 0.1) * (0.5 + L.gaunt);
    k += 0.8 * gauss(aa, 1.05, 0.25) * gauss(t, 0.6, 0.07);
    if (t < 0.22 && aa < 0.9) k -= 0.4;
    return { k };
  }, 7, 0.6);
  const F = R.FACE;
  if (L.maw !== 'radial') for (let x = 0; x < F.w; x++) { const a = F.th(x); if (Math.abs(a) < 0.62) { const y = Math.round(F.h * 0.27 + Math.abs(a) * 3); F.set(x, y, DARK); F.set(x, y + 1, mixC(SK[1], 0x8a2a3a, 0.4)); } }
  else for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) if (Math.hypot(F.th(x) / 0.36, ((y + 0.5) / F.h - 0.16) / 0.11) < 1) F.set(x, y, DARK);
  for (const k of [-1, 1]) { const nx = F.X(k * 4), ny = Math.round(F.h * 0.46); F.set(nx, ny, DARK); F.set(nx, ny + 1, DARK); }
  if (L.eyes === 'blind') for (const k of [-1, 1]) { const cx = F.X(k * EYE_A * 57.3), cy = Math.round(F.h * EYE_T); for (let i = -3; i <= 3; i++) glowPx(F, cx + i, cy + Math.round(Math.abs(i) * 0.3), 0.2); }
  // cranium: sulci, the glowing fissure over the crown, veins of light from it
  const C = R.CRAN;
  skin(C, (_x, _y, t, a) => ({ k: (Math.sin(a * 7 + Math.sin(t * 9) * 1.5) > 0.75 ? -0.9 : 0) + Math.cos(a) * 0.4 }), 11, 1.3);
  for (let y = 1; y < C.h - 2; y++) { const x = C.X(0) + Math.round(Math.sin(y * 0.7) * 0.8); C.set(x - 1, y, DARK); C.set(x + 1, y, DARK); glowPx(C, x, y, 0.45); }
  for (let i = 0; i < 6; i++) { let x = C.X(0), y = C.h * (0.15 + i * 0.13); const dir = i % 2 ? 1 : -1; for (let s = 0; s < 10; s++) { x += dir; y += hash(i, s) < 0.5 ? 1 : 0; glowPx(C, x, y, 0.15); } }
  // jaw, throat, teeth, eyes
  skin(R.JAW, () => ({ k: -0.2 }), 13, 0.3);
  R.MOUTH.fill(makeRamp(0x5a1a2a, 5, { spread: 0.5 }), (x, y) => 1.4 + Math.cos(R.MOUTH.th(x)) * 0.6 + (hash(x, y) - 0.5) * 0.6 - y / R.MOUTH.h);
  R.TEETH.fill(makeRamp(0xe8e0c8, 4, { spread: 0.4 }), (x, y) => 2 + (y / R.TEETH.h) * 1.5 + (hash(x, y) - 0.5) * 0.5);
  const E = R.EYE;
  for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) {
    const t = y / (E.h - 1), a = E.th(x);
    let c = mixC(0x050408, L.eye, 0.35);
    if (t > 0.7) c = mixC(L.eye, 0x000000, 0.25 - Math.cos(a) * 0.15);
    if (t > 0.86) c = L.eyes === 'slit' ? (Math.abs(Math.sin(a)) < 0.3 ? 0x020204 : mixC(L.glow, 0xffffff, 0.2)) : 0x020204;
    E.set(x, y, c);
    if (t > 0.7 && t <= 0.86 && L.eye !== 0x08080e) E.alpha(x, y, 210);
    if (L.eyes === 'slit' && t > 0.86 && Math.abs(Math.sin(a)) >= 0.3) E.alpha(x, y, 180);
  }
  E.set(E.X(-35), E.h - 2, 0xffffff);
  // arms, hands, fingers with dark nails
  skin(R.ARM, (_x, _y, t, a) => ({ k: (Math.abs(a) > 2.6 ? -0.4 : 0) + (Math.abs(t - 0.6) < 0.04 ? 0.7 : 0) - t * 0.4 }), 17, 1.2);
  skin(R.HAND, (_x, _y, _t, a) => ({ k: Math.abs(a) > 2.2 ? 0.4 : -0.2 }), 19, 0.5);
  const NAIL = makeRamp(DARK, 4, { spread: 0.6 });
  skin(R.FING, (_x, _y, t) => (t > 0.86 ? { k: -1.5, ramp: NAIL } : { k: Math.abs(t - 0.33) < 0.05 || Math.abs(t - 0.66) < 0.05 ? -0.9 : 0 }), 23, 0);
  // tentacles: skin above, a pale sucker-pocked underside, darker tips
  skin(R.TENT, (_x, _y, t, a) => {
    const aa = Math.abs(a);
    let k = -t * 1.2;
    let ramp: number[] | undefined;
    if (aa > 2.1) { ramp = BE; k += 0.2; if (aa > 2.6 && Math.sin(t * 52) > 0.35 && t > 0.15) k -= 1.8; }
    if (L.pat === 'bands' && aa < 2.1 && Math.sin(t * 40) > 0.55) ramp = PA;
    return { k, ramp };
  }, 29, 0.8);
  const GR = R.GROW;
  if (L.growth === 'fins') for (let y = 0; y < GR.h; y++) for (let x = 0; x < GR.w; x++) { GR.set(x, y, mixC(L.belly, L.glow, 0.25 + (x / GR.w) * 0.3 + (y % 4 === 0 ? 0.2 : 0))); if (x > GR.w * 0.6) GR.alpha(x, y, 225); }
  else GR.fill(makeRamp(mixHex(L.patCol, L.skin, 0.4), 6, { spread: 0.5 }), (x, y) => 1.6 + (y / GR.h) * 2 + Math.cos(GR.th(x)) * 0.5);
  for (let y = 0; y < R.GLOW.h; y++) for (let x = 0; x < R.GLOW.w; x++) glowPx(R.GLOW, x, y);
}

// ------------------------------------------------------------------------------------------------ the child
export class VeyrChild {
  readonly root = new THREE.Group();
  private rig = new THREE.Group();
  private mesh: THREE.SkinnedMesh | null = null;
  private bones: THREE.Bone[] = [];
  private mat: THREE.MeshLambertMaterial;
  private glowU = { value: 0.3 };
  private built: Built | null = null;
  private rocks: THREE.Mesh[] = [];
  private t = 0; private blinkT = 3; private castT = 0; private castAt = new THREE.Vector3();
  private waveT = 0; private twitchT = 4; private twitch = 0; private twitchDir = 1;
  hatch = 0; // 0 sealed .. 1 out and awake
  look = new THREE.Vector3();
  private lookYaw = 0; private lookPitch = 0;
  private look_: BabyLook;
  constructor(readonly fx: Fx, scale = 1.25, look?: BabyLook) {
    this.look_ = look ?? loadLook();
    this.mat = new THREE.MeshLambertMaterial({ side: THREE.FrontSide });
    const glowU = this.glowU;
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlowK = glowU;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlowK;')
        .replace('#include <map_fragment>', '#include <map_fragment>\nfloat glowA = sampledDiffuseColor.a; vec3 glowC = sampledDiffuseColor.rgb; diffuseColor.a = 1.0;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA < 0.98) totalEmissiveRadiance += glowC * uGlowK;');
    };
    this.mat.customProgramCacheKey = () => 'veyr-child';
    gbuf(this.mat, 1);
    this.root.add(this.rig);
    // the ground it has lifted: stones turning slowly above its skull
    const rm = new THREE.MeshLambertMaterial({ color: 0x4a4058, flatShading: true, emissive: new THREE.Color(0x7affe0), emissiveIntensity: 0.05 });
    gbuf(rm, 1);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.IcosahedronGeometry(1, 0); g.scale(1, 0.72, 0.86);
      const m = new THREE.Mesh(g, rm); const s = 0.05 + hash(i, 3) * 0.06; m.scale.setScalar(s);
      m.userData = { s0: s, a: (i / 7) * TAU, r: 0.55 + hash(i, 5) * 0.4, y: 1.85 + hash(i, 7) * 0.35, sp: 0.2 + hash(i, 9) * 0.2, rot: new THREE.Vector3(hash(i, 1), hash(i, 2), hash(i, 4)) };
      m.castShadow = true; this.rocks.push(m); this.root.add(m);
    }
    this.setLook(this.look_);
    this.root.scale.setScalar(scale);
    this.root.visible = false;
  }
  /** rebuild the sculpt for a new look */
  setLook(L: BabyLook) {
    this.look_ = { ...L };
    if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.built?.tex.dispose(); }
    const b = buildChild(this.look_);
    this.built = b;
    const bones = BONES.map((n) => { const o = new THREE.Bone(); o.name = n; return o; });
    BONES.forEach((n, i) => {
      const p = PARENT[n], rp = p ? b.rest[bi(p)] : [0, 0, 0];
      bones[i].position.set(b.rest[i][0] - rp[0], b.rest[i][1] - rp[1], b.rest[i][2] - rp[2]);
      if (p) bones[bi(p)].add(bones[i]);
    });
    this.mat.map = b.tex; this.mat.needsUpdate = true;
    const mesh = new THREE.SkinnedMesh(b.geo, this.mat);
    mesh.add(bones[0]);
    mesh.bind(new THREE.Skeleton(bones, b.rest.map((p) => new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]))), new THREE.Matrix4());
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.mesh = mesh; this.bones = bones;
    this.rig.add(mesh);
    (this.rocks[0].material as THREE.MeshLambertMaterial).emissive.set(this.look_.glow);
  }
  get lookData() { return this.look_; }
  private B(n: string) { return this.bones[bi(n)]; }
  /** reach toward a point in the world, skull alight */
  cast(at: THREE.Vector3) { this.castT = 1.1; this.castAt.copy(at); }
  /** one hand lifts, fingers opening (story beats, the mirror) */
  wave() { this.waveT = 2.4; }
  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const h = this.hatch, t = this.t;
    this.root.visible = h > 0.05;
    if (!this.mesh) return;
    const rise = clamp((h - 0.1) / 0.6, 0, 1);
    this.rig.position.y = (1 - rise) * -1.6;
    // breath swells the ribcage; the spine sways
    const br = 1 + Math.sin(t * 1.3) * 0.035;
    this.B('chest').scale.set(br, 1, br);
    this.B('chest').rotation.set(0.2 + Math.sin(t * 0.5) * 0.02, 0, 0);
    this.B('spine').rotation.set(0.12 + Math.sin(t * 0.5) * 0.03, Math.sin(t * 0.37) * 0.05, Math.sin(t * 0.7) * 0.025);
    // look, with an unsettling head tilt and sudden twitches
    this.twitchT -= dt;
    if (this.twitchT < 0) { this.twitchT = 3 + Math.random() * 6; this.twitch = 1; this.twitchDir = Math.random() < 0.5 ? -1 : 1; }
    this.twitch = Math.max(0, this.twitch - dt * 0.6);
    const tw = this.twitch > 0.85 ? (1 - this.twitch) / 0.15 : this.twitch / 0.85;
    const target = this.castT > 0 ? this.castAt : this.look;
    this.root.updateMatrixWorld();
    const lp = this.root.worldToLocal(target.clone());
    const wantYaw = clamp(Math.atan2(lp.x, lp.z), -1.1, 1.1), wantPitch = clamp(-Math.atan2(lp.y - 1.2, Math.hypot(lp.x, lp.z)) * 0.6, -0.4, 0.35);
    this.lookYaw = damp(this.lookYaw, wantYaw, 3.5, dt); this.lookPitch = damp(this.lookPitch, wantPitch, 3.5, dt);
    const c = Math.min(1, this.castT * 3);
    this.B('neck').rotation.set(-0.3 + this.lookPitch * 0.4 - c * 0.15, this.lookYaw * 0.35, 0);
    this.B('head').rotation.set(this.lookPitch * 0.6 - c * 0.25, this.lookYaw * 0.65, 0.22 + Math.sin(t * 0.31) * 0.08 + tw * 0.45 * this.twitchDir);
    this.B('jaw').rotation.set(0.04 + Math.max(0, Math.sin(t * 0.9)) * 0.04 + c * 0.45 + tw * 0.15, 0, 0);
    // blink: slow, rare
    this.blinkT -= dt;
    let lid = 0;
    if (this.blinkT < 0.3) lid = Math.sin(clamp(this.blinkT / 0.3, 0, 1) * Math.PI);
    if (this.blinkT <= 0) this.blinkT = 4 + Math.random() * 6;
    if (h < 0.8) lid = 1 - clamp((h - 0.6) / 0.2, 0, 1);
    const open = Math.max(0.06, 1 - lid);
    this.B('eyeL').scale.set(1, open, 1); this.B('eyeR').scale.set(1, open, 1);
    // arms: rest, reach (cast), or one slow raised hand
    this.castT = Math.max(0, this.castT - dt);
    this.waveT = Math.max(0, this.waveT - dt);
    const wv = Math.min(1, this.waveT * 1.5) * (1 - c);
    for (const [sd, k] of SIDES) {
      const up = sd === 'L' ? wv : 0;
      this.B('arm' + sd).rotation.set(-c * 1.5 - up * 1.2 + Math.sin(t * 0.8 + k) * 0.04, k * c * 0.15, k * (c * 0.25 + up * 0.5));
      this.B('fore' + sd).rotation.set(-c * 0.3 - up * 0.6, 0, k * up * 0.3);
      this.B('hand' + sd).rotation.set(c * 0.5 + up * 0.4 + Math.sin(t * 6.3 + k) * 0.03 * (1 + c * 4), k * Math.sin(t * 1.7) * 0.1, 0);
    }
    // tentacles writhe, lift and coil when it casts
    const N = this.built!.nt;
    for (let i = 0; i < N; i++) {
      const ph = i * 1.7, sp = 0.6 + c * 2.5;
      this.B(`t${i}a`).rotation.set(Math.sin(t * sp * 0.7 + ph) * 0.06 - c * 0.12, Math.sin(t * sp * 0.5 + ph) * 0.12, 0);
      this.B(`t${i}b`).rotation.set(Math.sin(t * sp + ph + 1) * 0.12 - c * 0.25, Math.sin(t * sp * 0.8 + ph) * 0.18, 0);
      this.B(`t${i}c`).rotation.set(Math.sin(t * sp * 1.3 + ph + 2) * 0.25 - c * 0.4, Math.sin(t * sp * 1.1 + ph + 1) * 0.3, 0);
    }
    for (const sd of ['L', 'R']) { this.B('ft' + sd).rotation.set(Math.sin(t * 0.9) * 0.1, 0, Math.sin(t * 0.7 + (sd === 'L' ? 0 : 2)) * 0.12); this.B('ft' + sd + '2').rotation.set(Math.sin(t * 1.3) * 0.2, 0, 0); }
    this.glowU.value = 0.4 + c * 2.2 + Math.max(0, Math.sin(t * 1.3)) * 0.25 + (h > 0.7 && h < 1 ? (1 - h) * 6 : 0);
    if (c > 0.3 && Math.random() < dt * 30) {
      const p = new THREE.Vector3(0, 0, 0.12);
      this.B(Math.random() < 0.5 ? 'handL' : 'handR').localToWorld(p);
      const g = new THREE.Color(this.look_.glow).multiplyScalar(2.2);
      this.fx.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6, g, 1, 2.5, 0.6, -0.3, 1);
    }
    // the lifted stones
    const vis = clamp((h - 0.65) / 0.3, 0, 1);
    for (const r of this.rocks) {
      const u = r.userData; u.a += dt * (u.sp + c * 2.4);
      r.visible = vis > 0.01;
      r.position.set(Math.cos(u.a) * u.r * (1 + c * 0.9), u.y + Math.sin(t * 1.3 + u.a * 2) * 0.06 - c * 0.5, Math.sin(u.a) * u.r * (1 + c * 0.9));
      r.rotation.x += dt * u.rot.x * (1 + c * 4); r.rotation.y += dt * u.rot.y * (1 + c * 4);
      r.scale.setScalar(u.s0 * vis);
    }
    (this.rocks[0].material as THREE.MeshLambertMaterial).emissiveIntensity = 0.06 + c * 0.8;
    void cam;
  }
  /** world position of the head (for beams) */
  headPos(out = new THREE.Vector3()) { out.set(0, 0.16, -0.06); return this.B('head').localToWorld(out); }
}
