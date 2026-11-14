// ANATOMY LIBRARY: the parts a vertebrate grows, seated on its finished trunk and skull (gridSurf), so they grow out
// of the skin: horns (a nose lance, brow horns, spiral ram horns), branching and palmate antlers, tusks, a bony skull
// crest, a helm and brow plates, rayed head fans, external gills, a nose leaf, barbels and a wattle; on the body a
// carapace of overlapping bands, shingled rows of horn plates, a tortoise shell, dorsal crests (a skin fin, a row of
// spikes, a bristle ridge), a sail on long spines, tail fins and a tail fan, a club, quills, spiracles; hair with
// geometry (a shaggy back, a mane and ruff, a belly fringe, a tail tuft, feathering, a fleece); and hand wings.
// Every part is data in the species recipe: { k: 'horn', at: 'nose', len: 1.6, ... }.
import type { RampName } from '../../art/palette';
import type { V3, Wt } from '../kit';
import { gridSurf, type Piece } from './core';
import { shell } from './armour';
import { horn, stalk, fin, sac, spine, bulbs, curve } from './append';
import { lookPaint, type Look } from './look';
import { eyeball } from './head';
import { locks, type LockSeat } from './locks';
import { Px, RP, h3 } from './paint';
import type { VCtx } from './vertebrate';
import { keratinPaint, coatSampler } from './coat';

type C2 = [RampName, number];
export type VPart =
  | { k: 'horn'; at: 'nose' | 'brow' | 'crown'; len: number; r: number; rise?: number; out?: number; back?: number; curl?: number; c?: C2 }
  | { k: 'ramHorns'; len: number; r: number; c?: C2 }
  | { k: 'antlers'; len: number; tines?: number; palm?: boolean; c?: C2 }
  | { k: 'tusks'; len: number; r: number; curl?: number; c?: C2 }
  | { k: 'skullCrest'; len: number; h: number; c: C2 }
  | { k: 'helm'; c: C2; rim?: C2; plates?: number }
  | { k: 'brow'; size: number; c: C2 }
  | { k: 'headFans'; size: number; c: C2; rays?: number; fwd?: boolean }
  | { k: 'gills'; size: number; c: C2; n?: number }
  | { k: 'noseleaf'; size: number; c?: C2 }
  | { k: 'barbels'; n: number; len: number; c?: C2 }
  | { k: 'wattle'; size: number; c?: C2 }
  | { k: 'frill'; size: number; c: C2; rays?: number }
  | { k: 'carapace'; t0: number; t1: number; bands: number; lift: number; spread: number; c: C2; rim?: C2; moss?: number; spikes?: number }
  | { k: 'plates'; t0: number; t1: number; rows: number; per?: number; spread: number; size: number; c: C2; keel?: boolean; tail?: boolean }
  | { k: 'shell'; c: C2; scute: C2; h: number }
  | { k: 'crest'; t0: number; t1: number; h: number; kind: 'fin' | 'spikes' | 'bristle'; c: C2 }
  | { k: 'sail'; t0: number; t1: number; h: number; c: C2; rays?: number }
  | { k: 'tailFin'; h: number; c: C2; below?: boolean }
  | { k: 'tailFan'; size: number; c: C2; rays?: number }
  | { k: 'club'; size: number; c: C2; spikes?: number }
  | { k: 'quills'; t0: number; t1: number; n: number; len: number; c: C2 }
  | { k: 'spiracles'; n: number; t0?: number; t1?: number; c?: C2 }
  | { k: 'shag'; t0: number; t1: number; len: number; density?: number; fringe?: number; flank?: number; col?: C2 }
  | { k: 'mane'; len: number; c?: C2; ruff?: number }
  | { k: 'tuft'; len: number; c?: C2 }
  | { k: 'feathering'; len: number; c?: C2 }
  | { k: 'fleece'; t0: number; t1: number; puff: number; c?: C2 }
  | { k: 'wings'; span: number; c: C2 }
  | { k: 'warts'; n: number; size: number; c?: C2 }
  | { k: 'eyeRows'; rows: number; c?: C2; r?: number }
  | { k: 'beak'; c: C2; hook?: number };

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** keratin, bone and plate looks */
const plateLook = (c: C2, o: { moss?: number; rim?: C2; lichen?: Look['lichen'] } = {}): Look => ({
  ramp: c[0], step: c[1], creases: 0.7, pebbles: { size: 0.03, depth: 0.5 }, lichen: o.lichen,
  mats: { 1: { ramp: (o.rim ?? c)[0], step: Math.max(0, (o.rim ?? c)[1] - 2) } },
});

/** the trunk's v at an arc length from the tail tip */
function vOfS(X: VCtx, s: number) {
  const F = X.F, cum = F.cum; let k = 0;
  while (k + 2 < cum.length && cum[k + 1] < s) k++;
  const f = Math.max(0, Math.min(1, (s - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k])));
  const Rt = X.tr.grids[0].v.length;
  return (X.tr.row(k) * (1 - f) + X.tr.row(k + 1) * f) / (Rt - 1);
}
/** t along the back: 0 the withers, 1 the rump (below 0 runs up the neck, past 1 down the tail) */
const vT = (X: VCtx, t: number) => vOfS(X, X.F.sNeck + (X.F.sRump - X.F.sNeck) * t);
const onTr = (X: VCtx, u: number, v: number) => gridSurf(X.tr.m, X.tr.grids[0], u, Math.max(0, Math.min(1, v)));
const onSk = (X: VCtx, j: number, s: 1 | -1, st: number) => gridSurf(X.sk.m, X.sk.grids[0], X.skCol(j, s), X.skRow(st));

export function growParts(X: VCtx) {
  for (const p of X.spec.parts) {
    const f = PARTS[p.k] as (X: VCtx, p: VPart) => void;
    if (f) f(X, p);
  }
}

const PARTS: { [K in VPart['k']]: (X: VCtx, p: Extract<VPart, { k: K }>) => void } = {
  // ------------------------------------------------------------------------------------------- head
  horn: (X, p) => {
    const c = p.c ?? X.spec.coat.horn ?? ['bone', 3], paint = keratinPaint(c[0], c[1], { rings: p.r * 0.5 });
    const hl = X.hl, hh = X.hh, iH = X.iH;
    const one = (s: 1 | -1 | 0) => {
      const sd = s === 0 ? 1 : s;
      const q = p.at === 'nose' ? onSk(X, 0, 1, 6.0) : p.at === 'brow' ? onSk(X, 1.2, sd as 1 | -1, 2.6) : onSk(X, 0.8, sd as 1 | -1, 1.4);
      const root = s === 0 ? q.p : q.p, n = q.n;
      const out = (p.out ?? (s === 0 ? 0 : 0.6)) * (s === 0 ? 0 : sd), rise = p.rise ?? 0.5, back = p.back ?? (p.at === 'nose' ? -0.9 : 0.2), L = p.len * hl;
      const d0 = nrm(add(add(scl(n, 0.6), [out, rise, -back]), [0, 0, 0]));
      const curl = p.curl ?? 0.3;
      const ctrl: V3[] = [sub(root, scl(n, p.r * hl * 0.6)), root, add(root, scl(d0, L * 0.35)), add(add(root, scl(d0, L * 0.7)), [0, L * curl * 0.15, -L * curl * 0.1 * Math.sign(back)]), add(add(root, scl(d0, L)), [0, L * curl * 0.4, -L * curl * 0.3 * Math.sign(back)])];
      const hp = X.body.add(horn({ name: 'horn' + (s + 1), ctrl, r0: p.r * hl, skin: () => [iH, 1], paint, rings: 1, k: 1.3 }));
      hp.reg = 5; hp.levels = 1;
      // a skin collar round its base
      const col = X.body.add(sac({ name: 'hcol' + (s + 1), at: root, n, r: [p.r * hl * 1.5, p.r * hl * 1.5, p.r * hl * 0.6], sink: 0.6, skin: () => [iH, 1], paint: X.sk.paint, levels: 0 }));
      col.reg = 3;
      void hh;
    };
    if (p.at === 'nose') one(0); else { one(-1); one(1); }
  },
  ramHorns: (X, p) => {
    const c = p.c ?? X.spec.coat.horn ?? ['bone', 3], paint = keratinPaint(c[0], c[1], { rings: p.r * X.hl * 0.25 });
    for (const s of [-1, 1] as const) {
      const q = onSk(X, 1.0, s, 1.6), R = p.len * X.hl * 0.42, c0 = q.p;
      // a spiral: up and back from the crown, round down behind the ear and forward under the eye
      const ctrl: V3[] = [];
      for (let k = 0; k <= 7; k++) {
        const t = k / 7, a = -0.4 + t * 4.4, r = R * (1 - t * 0.42);
        ctrl.push(add(c0, [s * (R * 0.15 + t * R * 0.7), Math.sin(a) * r + R * 0.25, -Math.cos(a) * r * 0.9 + R * 0.4]));
      }
      const hp = X.body.add(horn({ name: 'ram' + s, ctrl: [sub(c0, scl(q.n, p.r * X.hl * 0.5)), ...ctrl], r0: p.r * X.hl, skin: () => [X.iH, 1], paint, rings: 1, flat: 0.7, k: 1.3 }));
      hp.reg = 5;
    }
  },
  antlers: (X, p) => {
    const c = p.c ?? ['bone', 4], paint = keratinPaint(c[0], c[1], { rings: X.hl * 0.05 });
    const L = p.len * X.hl, nt = p.tines ?? 3;
    for (const s of [-1, 1] as const) {
      const q = onSk(X, 0.9, s, 1.9), b0 = q.p;
      // the beam: out and back, then up and forward
      const beam: V3[] = [sub(b0, scl(q.n, L * 0.03)), b0, add(b0, [s * L * 0.22, L * 0.18, -L * 0.18]), add(b0, [s * L * 0.42, L * 0.52, -L * 0.2]), add(b0, [s * L * 0.5, L * 0.9, L * 0.05])];
      X.body.add(horn({ name: 'beam' + s, ctrl: beam, r0: L * 0.045, skin: () => [X.iH, 1], paint, rings: 2, k: 1.2 })).reg = 5;
      const path = curve(beam, 12);
      if (p.palm) {
        // a palm: a flattened blade along the upper beam fringed with tines
        const n = nt + 2, roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
        for (let k = 0; k < n; k++) { const t = 0.45 + (k / (n - 1)) * 0.5, at = path[Math.min(path.length - 1, Math.round(t * (path.length - 1)))]; roots.push(at); dirs.push(nrm([s * 0.5, 0.4 + k * 0.1, 0.8 - k * 0.12])); lens.push(L * (0.22 + 0.1 * Math.sin((k / (n - 1)) * Math.PI))); side.push(nrm([0.3, -0.2, -s * 0.9])); }
        X.body.add(fin({ name: 'palm' + s, roots, dirs, lens, side, ray: L * 0.025, web: L * 0.018, scallop: 0.35, steps: 3, skin: () => [X.iH, 1], paint, levels: 0 })).reg = 5;
      } else for (let k = 0; k < nt; k++) {
        const t = 0.35 + (k / Math.max(1, nt - 1)) * 0.5, at = path[Math.round(t * (path.length - 1))], tl = L * (0.32 - k * 0.04);
        const d = nrm([s * 0.15, 0.55, 0.9 - k * 0.15]);
        X.body.add(horn({ name: 'tine' + s + k, ctrl: [at, add(at, scl(d, tl * 0.5)), add(add(at, scl(d, tl)), [0, tl * 0.2, 0])], r0: L * 0.03, skin: () => [X.iH, 1], paint, rings: 3, k: 1 })).reg = 5;
      }
    }
  },
  tusks: (X, p) => {
    const c = p.c ?? ['bone', 4], paint = keratinPaint(c[0], c[1], { rings: p.r * X.hl * 0.6 });
    for (const s of [-1, 1] as const) {
      const q = onSk(X, 4.6, s, 5.6), L = p.len * X.hl, r = p.r * X.hl;
      const d: V3 = nrm([s * 0.5, -0.2, 0.9]), cu = p.curl ?? 0.8;
      const ctrl: V3[] = [sub(q.p, scl(q.n, r * 1.5)), q.p, add(q.p, scl(d, L * 0.45)), add(add(q.p, scl(d, L * 0.8)), [0, L * 0.3 * cu, 0]), add(add(q.p, scl(d, L * 0.9)), [s * L * 0.05, L * 0.62 * cu, -L * 0.1 * cu])];
      const tp = X.body.add(stalk({ name: 'tusk' + s, path: curve(ctrl, 9), r: (t) => r * (1 - t * 0.85) + 0.002, around: 7, ringEvery: 2, skin: () => [X.iH, 1], paint, levels: 1, k: 1.3 }));
      tp.reg = 6;
    }
  },
  skullCrest: (X, p) => {
    // a bony blade along the midline of the skull, sweeping back past the occiput
    const n = 5, roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
    for (let k = 0; k < n; k++) { const st = 0.3 + (k / (n - 1)) * 3.2, q = onSk(X, 0, 1, st); roots.push(sub(q.p, scl(q.n, X.hh * 0.05))); dirs.push(nrm(add(q.n, [0, 0, -0.9 - (1 - k / (n - 1)) * 0.8]))); lens.push(p.len * X.hl * (0.25 + 0.75 * Math.sin(((k + 0.6) / n) * Math.PI)) * p.h * 1.6); side.push([1, 0, 0]); }
    X.body.add(fin({ name: 'skcrest', roots, dirs, lens, side, ray: X.hl * 0.025, web: X.hl * 0.016, scallop: 0.15, steps: 3, skin: () => [X.iH, 1], paint: finPaint(p.c, roots, dirs, lens, X.hl * 0.025), levels: 1 })).reg = 5;
  },
  helm: (X, p) => {
    // a helm of plates over the crown and brow, a ridged plate down the bridge
    const L = lookPaint(plateLook(p.c, { rim: p.rim }));
    const sv = X.skRow, plates: [number, number, number, number, number][] = [[0.38, 0.62, sv(0.3), sv(1.6), 0.16], [0.24, 0.4, sv(0.8), sv(2.4), 0.14], [0.6, 0.76, sv(0.8), sv(2.4), 0.14], [0.36, 0.64, sv(1.7), sv(3.2), 0.18], [0.4, 0.6, sv(3.2), sv(5.6), 0.12]];
    plates.forEach(([a0, a1, b0, b1, h], k) => X.body.add(shell({ name: 'helm' + k, host: X.sk, u: [a0, a1], v: [b0, b1], nu: 3, nv: 3, levels: 1, sink: X.hh * 0.05, rim: 2, ridges: [0.5], lift: (a, b) => X.hh * h * (0.45 + 0.55 * Math.sin(Math.PI * a)) * (0.6 + 0.4 * b), skin: () => [X.iH, 1], paint: L, k: 1.6 })).reg = 5);
  },
  brow: (X, p) => {
    const L = lookPaint(plateLook(p.c)), sv = X.skRow;
    for (const s of [-1, 1] as const) {
      const u0 = X.skCol(1.0, s), u1 = X.skCol(2.1, s), a = Math.min(u0, u1), b = Math.max(u0, u1);
      X.body.add(shell({ name: 'brow' + s, host: X.sk, u: [a, b], v: [sv(X.fam.seat!.eye[0] - 0.9), sv(X.fam.seat!.eye[0] - 0.1)], nu: 3, nv: 2, levels: 1, sink: X.hh * 0.04, rim: 2, lift: (aa, bb) => X.hh * 0.14 * p.size * Math.sin(Math.PI * aa) * (0.5 + 0.5 * bb), skin: () => [X.iH, 1], paint: L, k: 1.6 })).reg = 3;
    }
  },
  headFans: (X, p) => {
    // fans of bony rays with a membrane between, spreading from behind the jaw (or forward over the brow)
    for (const s of [-1, 1] as const) {
      const n = p.rays ?? 6, roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
      for (let k = 0; k < n; k++) {
        const f = k / (n - 1), q = onSk(X, 1.5 + f * 3.6, s, p.fwd ? 2.2 : 0.5 + f * 0.6);
        roots.push(sub(q.p, scl(q.n, X.hw * 0.05)));
        const a = (f - 0.5) * 2.2;
        dirs.push(nrm(p.fwd ? [s * 0.7, Math.cos(a) * 0.8 + 0.5, Math.sin(a) * 0.6 + 0.3] : [s * 0.75, Math.cos(a) * 0.9, -0.55 + Math.sin(a) * 0.4]));
        lens.push(p.size * X.hl * (0.55 + 0.45 * Math.sin(f * Math.PI)));
        side.push(nrm([0.2, -0.3 * s, s * 0.9]));
      }
      X.body.add(fin({ name: 'hfan' + s, roots, dirs, lens, side, ray: X.hl * 0.018, web: X.hl * 0.008, scallop: 0.28, steps: 4, droop: 0.15, skin: () => [X.iH, 1], paint: finPaint(p.c, roots, dirs, lens, X.hl * 0.018), levels: X.small ? 0 : 1 })).reg = 7;
    }
  },
  gills: (X, p) => {
    // three feathery gill stalks each side behind the head: a stalk fringed with filaments (a pinnate fin)
    const n = p.n ?? 3;
    for (const s of [-1, 1] as const) for (let k = 0; k < n; k++) {
      const q = onSk(X, 1.5 + k * 1.1, s, 0.6), L = p.size * X.hl * (0.85 - k * 0.12);
      const d = nrm([s * 0.8, 0.55 - k * 0.45, -0.7]);
      const path = curve([sub(q.p, scl(q.n, X.hw * 0.04)), add(q.p, scl(d, L * 0.4)), add(add(q.p, scl(d, L)), [0, -L * 0.12, -L * 0.1])], 6);
      X.body.add(stalk({ name: 'gill' + s + k, path, r: (t) => X.hw * 0.06 * (1 - t * 0.6), around: 5, skin: () => [X.iH, 1], paint: fleshFlat(p.c), levels: 0 })).reg = 7;
      const m = 6, roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
      for (let j = 0; j < m; j++) { const t = 0.2 + (j / (m - 1)) * 0.75, at = path[Math.round(t * (path.length - 1))]; roots.push(at); dirs.push(nrm(add([0, 1, 0], scl(d, 0.4)))); lens.push(L * 0.32 * (1 - t * 0.4)); side.push(nrm(crs(d, [0, 1, 0]))); }
      X.body.add(fin({ name: 'gfil' + s + k, roots, dirs, lens, side, ray: X.hl * 0.008, web: X.hl * 0.004, scallop: 0.5, steps: 2, skin: () => [X.iH, 1], paint: finPaint(p.c, roots, dirs, lens, X.hl * 0.008), levels: 0 })).reg = 7;
      X.body.add(fin({ name: 'gfil2' + s + k, roots, dirs: dirs.map((dd) => [dd[0], -dd[1], dd[2]]), lens, side, ray: X.hl * 0.008, web: X.hl * 0.004, scallop: 0.5, steps: 2, skin: () => [X.iH, 1], paint: finPaint(p.c, roots, dirs, lens, X.hl * 0.008), levels: 0 })).reg = 7;
    }
  },
  noseleaf: (X, p) => {
    // a spear of skin standing over the nostrils (aims the calls), ribbed
    const q = onSk(X, 0, 1, 6.6), L = X.hl * 0.32 * p.size;
    const roots: V3[] = [-1, -0.5, 0, 0.5, 1].map((k) => add(q.p, [k * X.hw * 0.16, 0, 0])), dirs = roots.map((_, k) => nrm([(k - 2) * 0.25, 1, -0.15])), lens = roots.map((_, k) => L * (1 - Math.abs(k - 2) * 0.32)), side = roots.map(() => [0, 0.2, 1] as V3);
    X.body.add(fin({ name: 'leaf', roots, dirs, lens, side, ray: X.hl * 0.015, web: X.hl * 0.012, scallop: 0.1, steps: 3, skin: () => [X.iH, 1], paint: fleshFlat(p.c ?? X.spec.coat.face?.nose ?? ['hide', 2]), levels: 0 })).reg = 3;
  },
  barbels: (X, p) => {
    for (let k = 0; k < p.n; k++) {
      const s = (k % 2 ? 1 : -1) as 1 | -1, j = k >> 1, q = onSk(X, 4.5, s, 7 - j * 0.6), L = p.len * X.hl * (1 - j * 0.12);
      X.body.add(stalk({ name: 'barb' + k, path: curve([q.p, add(q.p, [s * L * 0.15, -L * 0.45, L * 0.05]), add(q.p, [s * L * 0.22, -L, -L * 0.12])], 5), r: (t) => X.hw * 0.035 * (1 - t * 0.85), around: 5, skin: () => [j > 1 ? X.iJ : X.iH, 1], paint: fleshFlat(p.c ?? X.spec.coat.base), levels: 0 })).reg = 7;
    }
  },
  wattle: (X, p) => {
    const at = add(lerp(X.hinge, X.chin, 0.3), [0, -X.hh * 0.35, 0]);
    X.body.add(sac({ name: 'wattle', at, n: [0, -1, -0.2], up: [0, 0, 1], r: [X.hw * 0.18 * p.size, X.hh * 0.4 * p.size, X.hw * 0.12 * p.size], sink: 0.4, skin: () => [X.iH, 1], paint: fleshFlat(p.c ?? X.spec.coat.belly), levels: 1 })).reg = 6;
  },
  frill: (X, p) => {
    // a collar of skin on long bony struts round the back of the head, standing open
    const n = p.rays ?? 9;
    for (const s of [-1, 1] as const) {
      const roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
      for (let k = 0; k < n; k++) {
        const f = k / (n - 1), a = f * Math.PI * 0.95, q = onSk(X, Math.min(6, f * 6), s, 0.6);
        roots.push(q.p); dirs.push(nrm([s * Math.sin(a) * 0.9 + s * 0.25, Math.cos(a), -0.35])); lens.push(p.size * X.hl * (0.6 + 0.4 * Math.sin(f * Math.PI))); side.push([0, 0, 1]);
      }
      X.body.add(fin({ name: 'frill' + s, roots, dirs, lens, side, ray: X.hl * 0.02, web: X.hl * 0.01, scallop: 0.3, steps: 4, skin: () => [X.iH, 1], paint: finPaint(p.c, roots, dirs, lens, X.hl * 0.02), levels: X.small ? 0 : 1 })).reg = 7;
    }
  },
  eyeRows: (X, p) => {
    // more eyes in a row back along each side of the skull: lidless, smaller, fixed in their sockets
    const seat = X.fam.seat!, ES = X.spec.head.eyes, iris = RP((p.c ?? ES.iris)[0]);
    for (const s of [-1, 1] as const) for (let k = 1; k <= p.rows; k++) {
      const q = onSk(X, seat.eye[1] + 0.25 * k, s, seat.eye[0] - 0.55 * k), r = ES.r * X.hw * (p.r ?? 0.7) * (1 - k * 0.12);
      const ax = nrm(add(q.n, [0, 0.1, 0.25])), c = add(q.p, scl(q.n, -r * 0.4));
      const e = X.body.add(eyeball({ name: 'xeye' + s + k, c, ax, r, bone: X.iH, iris, pupil: ES.pupil === 'round' ? 'pin' : ES.pupil, irisA: 0.7, levels: 0, around: 8 }));
      e.reg = 4;
    }
  },
  beak: (X, p) => {
    // a horn sheath over the muzzle from the stop to the nose plane, hooked at the tip, and over the chin
    const sv = X.skRow, stop = X.fam.seat!.stop, L = lookPaint({ ramp: p.c[0], step: p.c[1], creases: 0.6, glints: { size: X.hw * 0.2, every: 0.5 }, pebbles: { size: X.hw * 0.05, depth: 0.4 } });
    X.body.add(shell({ name: 'beak', host: X.sk, u: [0.06, 0.94], v: [sv(stop + 0.4), 1.0], nu: 8, nv: 3, lift: (a, b) => X.hh * (0.03 + 0.08 * b * (p.hook ?? 1)), sink: X.hh * 0.03, curl: { b1: false }, rim: 2, skin: () => [X.iH, 1], paint: L, k: 1.6, levels: 1 })).reg = 6;
  },
  // ------------------------------------------------------------------------------------------- body armour
  carapace: (X, p) => {
    const lichen: Look['lichen'] = [];
    const L = lookPaint(plateLook(p.c, { rim: p.rim, lichen }));
    const v0 = vT(X, p.t1), v1 = vT(X, p.t0), nb = p.bands, stepV = (v1 - v0) / nb, ua = 0.5 - p.spread * 0.2, ub = 0.5 + p.spread * 0.2;
    for (let k = 0; k < nb; k++) {
      const hk = 0.65 + 0.35 * Math.sin(Math.PI * (k + 0.5) / nb), bv0 = v0 + stepV * k - stepV * 0.28, bv1 = v0 + stepV * (k + 1);
      X.body.add(shell({ name: 'band' + k, host: X.tr, u: [ua, ub], v: [bv0, bv1], nu: 10, nv: 3, sink: X.W * 0.03, rim: 2, ridges: [0.5], rings: [0.5],
        lift: (a, b) => { const x = Math.abs(a - 0.5) * 2, dome = Math.cos(Math.min(1, x) * Math.PI / 2) ** 0.5; return X.W * p.lift * 0.12 * (0.14 + 0.86 * hk * dome) * (1 + 0.45 * Math.pow(1 - b, 3)); },
        skin: X.spine, paint: L, k: 1.0, levels: 1 })).reg = 2;
      for (let s = 0; s < (p.spikes ?? 0); s++) {
        const a = 0.5 + (s - (p.spikes! - 1) / 2) * 0.12, q = onTr(X, a, bv0 + (bv1 - bv0) * 0.3), lift = X.W * p.lift * 0.12 * (0.35 + 0.65 * hk);
        X.body.add(spine({ levels: 0, around: 5, name: 'cspk' + k + s, at: add(q.p, scl(q.n, lift)), dir: nrm(add(q.n, [0, 0, -0.5])), len: X.W * 0.18 * hk, r: X.W * 0.04, skin: X.spine, paint: keratinPaint('bone', 3) })).reg = 2;
      }
    }
    if (p.moss) for (let k = 0; k < 18 * p.moss; k++) {
      const u = ua + 0.06 + h3(k, 21, X.seed) * (ub - ua - 0.12), v = v0 + h3(k, 23, X.seed) * (v1 - v0), q = onTr(X, u, v), lift = X.W * p.lift * 0.12 * 0.9;
      lichen.push({ c: add(q.p, scl(q.n, lift)), n: q.n, r: X.W * (0.05 + h3(k, 25, X.seed) * 0.08), ramp: k % 3 === 0 ? 'moss' : k % 3 === 1 ? 'sage' : 'ochre', cup: k % 2 ? 'moss' : 'ochre' });
    }
  },
  plates: (X, p) => {
    const L = lookPaint(plateLook(p.c));
    const v0 = vT(X, p.t1), v1 = vT(X, p.t0), rows = p.rows, per = p.per ?? 5, dv = (v1 - v0) / rows;
    for (let r = 0; r < rows; r++) {
      const v = v0 + dv * r, q0 = onTr(X, 0.5, v), girth = Math.hypot(q0.p[0], 0) + 1e-3;
      void girth;
      const n = Math.max(1, Math.round(per * (r % 2 ? 1 : 0.85))), span = p.spread * 0.18;
      for (let i = 0; i < n; i++) {
        const uc = 0.5 + (n === 1 ? 0 : ((i / (n - 1)) - 0.5) * 2 * span) + (r % 2 ? span / Math.max(1, n - 1) * 0.5 : 0), w = Math.max(0.012, (span * 2) / Math.max(1, n) * 0.62);
        X.body.add(shell({ name: 'pl' + r + '_' + i, host: X.tr, u: [uc - w, uc + w], v: [v, v + dv * 1.7], nu: 2, nv: 2, rim: 2, ridges: p.keel ? [0.5] : undefined, curl: { b0: true, b1: true },
          sink: X.W * 0.02, lift: (a, b) => X.W * p.size * 0.14 * (0.3 + 0.7 * b) * Math.cos((a - 0.5) * 2 * Math.PI / 2.4) ** 0.5, skin: X.spine, paint: L, levels: 0, k: 0.9 })).reg = 2;
      }
    }
  },
  shell: (X, p) => {
    // a tortoise's domed box: one shell over the back, a scalloped marginal rim, drawn scutes with growth rings
    const v0 = vT(X, 1.0), v1 = vT(X, -0.05);
    const scuteSize = X.W * 0.42;
    X.body.add(shell({ name: 'tshell', host: X.tr, u: [0.12, 0.88], v: [v0, v1], nu: 12, nv: 8, sink: X.W * 0.05, rim: 3, ridges: [0.5], lift: (a, b) => { const x = Math.abs(a - 0.5) * 2; return X.W * p.h * (0.3 + 0.7 * Math.cos(Math.min(1, x) * Math.PI / 2) ** 0.7) * (0.6 + 0.4 * Math.sin(Math.PI * b)); }, skin: X.spine, k: 1.1, levels: 1,
      paint: (ch, _p, b) => { const px = new Px(ch, b); px.base(() => [RP(p.c[0]), p.c[1]]); px.scales({ size: scuteSize, kind: 'pebble', len: 1, ink: 2.5, seed: X.seed }); px.folds([0, 1, 0], [0, 0, 0], scuteSize * 0.08, { depth: 0.5 }); px.spots(scuteSize * 0.5, RP(p.scute[0]), p.scute[1], { density: 0.7 }); px.creaseInk(0.6); px.flush(); } })).reg = 2;
  },
  // ------------------------------------------------------------------------------------------- dorsal ridges
  crest: (X, p) => {
    const v0 = vT(X, p.t1), v1 = vT(X, p.t0), n = Math.max(4, Math.round((v1 - v0) * 40));
    if (p.kind === 'spikes') {
      for (let k = 0; k < n; k++) { const v = v0 + ((k + 0.5) / n) * (v1 - v0), q = onTr(X, 0.5, v), hk = Math.sin(Math.PI * (k + 0.5) / n) * 0.6 + 0.4; X.body.add(spine({ levels: 0, around: 5, name: 'dsp' + k, at: sub(q.p, scl(q.n, X.W * 0.02)), dir: nrm(add(q.n, [0, 0, -0.6])), len: X.W * p.h * hk, r: X.W * p.h * 0.18 * hk, skin: X.spine, paint: keratinPaint(p.c[0], p.c[1]) })).reg = 2; }
      return;
    }
    if (p.kind === 'bristle') {
      const seats: LockSeat[] = [];
      for (let k = 0; k < n * 3; k++) { const v = v0 + (k / (n * 3)) * (v1 - v0), q = onTr(X, 0.5 + (h3(k, 1, X.seed) - 0.5) * 0.04, v); seats.push({ p: q.p, n: q.n, dir: nrm(add(q.n, [0, 0, -0.3])), len: X.W * p.h * (0.6 + 0.4 * Math.sin(Math.PI * k / (n * 3))), wid: X.W * 0.035, lift: 0.9, droop: 0.05, col: 0, w: X.spine(q.p) }); }
      const lp = locks({ name: 'bristle', seats, tiles: [RP(p.c[0])], steps: [p.c[1]], seed: X.seed }); if (lp) X.body.add(lp);
      return;
    }
    const roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
    for (let k = 0; k < n; k++) { const v = v0 + (k / (n - 1)) * (v1 - v0), q = onTr(X, 0.5, v); roots.push(sub(q.p, scl(q.n, X.W * 0.03))); dirs.push(nrm(add(q.n, [0, 0, -0.25]))); lens.push(X.W * p.h * (0.25 + 0.75 * Math.sin(Math.PI * k / (n - 1)) ** 0.6) * (1 + 0.15 * Math.sin(k * 2.3))); side.push([1, 0, 0]); }
    X.body.add(fin({ name: 'crest', roots, dirs, lens, side, ray: X.W * 0.012, web: X.W * 0.007, scallop: 0.32, steps: 3, skin: (pp) => X.spine(pp), paint: finPaint(p.c, roots, dirs, lens, X.W * 0.012), levels: X.small ? 0 : 1 })).reg = 2;
  },
  sail: (X, p) => {
    const v0 = vT(X, p.t1), v1 = vT(X, p.t0), n = p.rays ?? 12, roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
    for (let k = 0; k < n; k++) { const f = k / (n - 1), q = onTr(X, 0.5, v0 + f * (v1 - v0)); roots.push(sub(q.p, scl(q.n, X.W * 0.04))); dirs.push(nrm(add(q.n, [0, 0, (f - 0.5) * 0.3]))); lens.push(X.W * p.h * (0.15 + 0.85 * Math.sin(Math.PI * (0.08 + f * 0.84)) ** 0.8)); side.push([1, 0, 0]); }
    X.body.add(fin({ name: 'sail', roots, dirs, lens, side, ray: X.W * 0.02, web: X.W * 0.008, scallop: 0.18, steps: 5, skin: (pp) => X.spine(pp), paint: finPaint(p.c, roots, dirs, lens, X.W * 0.02), levels: 1 })).reg = 2;
  },
  tailFin: (X, p) => {
    const v0 = 0.02, v1 = vOfS(X, X.F.sRump * 0.92);
    for (const up of p.below ? [1, -1] : [1]) {
      const n = 10, roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
      for (let k = 0; k < n; k++) { const f = k / (n - 1), q = onTr(X, up > 0 ? 0.5 : 0.0, v0 + f * (v1 - v0)); roots.push(sub(q.p, scl(q.n, X.W * 0.02))); dirs.push(nrm(add(q.n, [0, 0, -0.5]))); lens.push(X.W * p.h * (up > 0 ? 1 : 0.6) * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, f * 1.25)) ** 0.7)); side.push([1, 0, 0]); }
      X.body.add(fin({ name: 'tfin' + up, roots, dirs, lens, side, ray: X.W * 0.01, web: X.W * 0.005, scallop: 0.2, steps: 3, skin: (pp) => X.spine(pp), paint: finPaint(p.c, roots, dirs, lens, X.W * 0.01), levels: 0 })).reg = 10;
    }
  },
  tailFan: (X, p) => {
    // a fan of rays spread at the tail tip, flicked as a signal
    const tip = X.F.pts[0], dir = nrm(sub(X.F.pts[0], X.F.pts[1])), n = p.rays ?? 9, roots: V3[] = [], dirs: V3[] = [], lens: number[] = [], side: V3[] = [];
    const L = X.W * p.size * 1.4;
    for (let k = 0; k < n; k++) { const f = k / (n - 1), a = (f - 0.5) * 2.2; roots.push(add(tip, scl(dir, -L * 0.18 * (1 - Math.abs(f - 0.5)))) ); dirs.push(nrm(add(scl(dir, Math.cos(a)), [0, Math.sin(a), 0]))); lens.push(L * (0.7 + 0.3 * Math.cos(a * 0.8))); side.push([1, 0, 0]); }
    const tb = X.rig.tail[X.rig.tail.length - 1] ?? X.rig.root;
    X.body.add(fin({ name: 'tfan', roots, dirs, lens, side, ray: X.W * 0.016, web: X.W * 0.007, scallop: 0.3, steps: 4, skin: () => [tb, 1], paint: finPaint(p.c, roots, dirs, lens, X.W * 0.016), levels: 1 })).reg = 10;
  },
  club: (X, p) => {
    const tip = X.F.pts[0], dir = nrm(sub(X.F.pts[0], X.F.pts[1])), tb = X.rig.tail[X.rig.tail.length - 1] ?? X.rig.root, R = X.W * p.size * 0.3;
    const L = lookPaint(plateLook(p.c));
    X.body.add(sac({ name: 'club', at: add(tip, scl(dir, -R * 0.4)), n: dir, up: [0, 1, 0], r: [R * 1.2, R, R * 1.1], sink: 0.4, skin: () => [tb, 1], paint: L, levels: 1 })).reg = 10;
    for (let k = 0; k < (p.spikes ?? 5); k++) { const a = (k / (p.spikes ?? 5)) * Math.PI * 2, d: V3 = nrm(add([Math.cos(a), Math.sin(a), 0], scl(dir, 0.3))); X.body.add(spine({ levels: 0, around: 5, name: 'clsp' + k, at: add(tip, scl(d, R * 0.9)), dir: d, len: R * 0.9, r: R * 0.25, skin: () => [tb, 1], paint: keratinPaint('bone', 3) })).reg = 10; }
  },
  quills: (X, p) => {
    const v0 = vT(X, p.t1), v1 = vT(X, p.t0);
    for (let k = 0; k < p.n; k++) {
      const u = 0.5 + (h3(k, 1, X.seed) - 0.5) * 0.55, v = v0 + h3(k, 2, X.seed) * (v1 - v0), q = onTr(X, u, v);
      const d = nrm(add(q.n, [0, 0, -1.2])), hp = X.body.add(spine({ levels: 0, around: 5, name: 'quill' + k, at: sub(q.p, scl(q.n, X.W * 0.02)), dir: d, len: X.W * p.len * (0.7 + 0.5 * h3(k, 3, X.seed)), r: X.W * 0.018, skin: X.spine, paint: keratinPaint(p.c[0], p.c[1]) }));
      hp.reg = 2; hp.levels = 0; hp.farSkip = true;
    }
  },
  spiracles: (X, p) => {
    const v0 = vT(X, p.t1 ?? 0.9), v1 = vT(X, p.t0 ?? 0.05), seats: { p: V3; n: V3; r: number; h?: number; cone?: boolean }[] = [];
    for (const u of [0.2, 0.8]) for (let k = 0; k < p.n; k++) { const q = onTr(X, u, v0 + ((k + 0.5) / p.n) * (v1 - v0)); seats.push({ p: sub(q.p, scl(q.n, X.W * 0.02)), n: q.n, r: X.W * 0.05, h: X.W * 0.04, cone: true }); }
    const c = p.c ?? X.spec.coat.belly;
    X.body.add(bulbs({ name: 'spir', seats, skin: X.spine, levels: 0, around: 8, paint: (ch, _pp, b) => { const px = new Px(ch, b), P = px.gb.P; px.base(() => [RP(c[0]), c[1]]); px.creaseInk(0.5); for (let i = 0; i < px.n; i++) { let near = 1e9; for (const s of seats) near = Math.min(near, Math.hypot(P[i * 3] - s.p[0] - s.n[0] * s.h!, P[i * 3 + 1] - s.p[1] - s.n[1] * s.h!, P[i * 3 + 2] - s.p[2] - s.n[2] * s.h!)); if (near < s0(seats)) { px.rampI[i] = px.ramp(RP('ink')); px.step[i] = 0; } } px.flush(); } })).reg = 1;
  },
  // ------------------------------------------------------------------------------------------- hair
  shag: (X, p) => {
    // long locks over the back and down the flanks, each in the colour of the coat at its root; a fringe under the belly
    const T = tileSet(X), seats: LockSeat[] = [], v0 = vT(X, p.t1), v1 = vT(X, p.t0), dens = p.density ?? 1;
    const rows = Math.max(3, Math.min(26, Math.round((v1 - v0) * 30 * dens))), L = p.len * X.W;
    for (let r = 0; r < rows; r++) {
      const v = v0 + ((r + 0.5) / rows) * (v1 - v0), across = Math.round(5 + (p.flank ?? 0.5) * 6);
      for (let i = 0; i < across; i++) {
        const fu = (i + (r % 2) * 0.5) / across, u = 0.5 + (fu - 0.5) * (0.3 + (p.flank ?? 0.5) * 0.36);
        const q = onTr(X, u + (h3(r, i, X.seed) - 0.5) * 0.02, v + (h3(i, r, X.seed) - 0.5) * 0.01);
        const back = nrm(sub(onTr(X, u, v - 0.02).p, q.p)), k = 0.7 + 0.6 * h3(r * 7, i, X.seed);
        seats.push({ p: q.p, n: q.n, dir: nrm(add(back, [0, -0.35, 0])), len: L * k, wid: L * k * 0.13, lift: 0.25, droop: 0.5, col: T.at(q.p, q.n, p.col), w: X.spine(q.p) });
      }
      // the fringe hanging under the belly line
      if (p.fringe) for (const u of [0.13, 0.87, 0.06, 0.94]) { const q = onTr(X, u + (h3(r, 9, X.seed) - 0.5) * 0.03, v), k = 0.8 + 0.4 * h3(r, 11, X.seed); seats.push({ p: q.p, n: q.n, dir: [0, -1, -0.25], len: L * p.fringe * k, wid: L * k * 0.12, lift: 0.1, droop: 0.1, col: T.at(q.p, q.n), w: X.spine(q.p) }); }
    }
    const lp = locks({ name: 'shag', seats, tiles: T.tiles, steps: T.steps, seed: X.seed }); if (lp) X.body.add(lp);
  },
  mane: (X, p) => {
    const c = p.c ?? X.spec.coat.back ?? X.spec.coat.base, seats: LockSeat[] = [], L = p.len * X.W;
    const v0 = vT(X, 0.15), v1 = 0.999;
    for (let r = 0; r < 12; r++) for (let i = 0; i < 8; i++) {
      const v = v0 + ((r + 0.5) / 12) * (v1 - v0), u = 0.5 + ((i + (r % 2) * 0.5) / 8 - 0.5) * 0.9, q = onTr(X, u, v);
      const back = nrm(sub(onTr(X, u, v - 0.02).p, q.p));
      seats.push({ p: q.p, n: q.n, dir: nrm(add(back, [0, -0.6, 0])), len: L * (0.7 + 0.6 * h3(r, i, X.seed)) * (1 - Math.abs(u - 0.5) * 0.6), wid: L * 0.2, lift: 0.45, droop: 0.45, col: 0, w: X.spine(q.p) });
    }
    // the ruff round the cheeks and throat
    if (p.ruff) for (const s of [-1, 1] as const) for (let k = 0; k < 10; k++) { const q = onSk(X, 2 + (k / 9) * 4, s, 0.7 + (k % 2) * 0.3); seats.push({ p: q.p, n: q.n, dir: nrm([s * 0.5, -0.6, -0.6]), len: L * p.ruff * (0.7 + 0.5 * h3(k, 3, X.seed)), wid: L * 0.18, lift: 0.4, droop: 0.3, col: 0, w: [X.iH, 1] }); }
    const lp = locks({ name: 'mane', seats, tiles: [RP(c[0])], steps: [c[1]], seed: X.seed + 1 }); if (lp) X.body.add(lp);
  },
  tuft: (X, p) => {
    const c = p.c ?? X.spec.coat.pattern?.c ?? X.spec.coat.base, seats: LockSeat[] = [], L = p.len * X.W, tb = X.rig.tail[X.rig.tail.length - 1] ?? X.rig.root;
    for (let k = 0; k < 14; k++) { const v = 0.01 + (k % 3) * 0.012, u = (k / 14), q = onTr(X, u, v), d = nrm(add(sub(X.F.pts[0], X.F.pts[1]), scl(q.n, 0.6))); seats.push({ p: q.p, n: q.n, dir: d, len: L * (0.7 + 0.5 * h3(k, 2, X.seed)), wid: L * 0.22, lift: 0.4, droop: 0.4, col: 0, w: [tb, 1] }); }
    const lp = locks({ name: 'tuft', seats, tiles: [RP(c[0])], steps: [c[1]], seed: X.seed + 2, reg: 10 }); if (lp) X.body.add(lp);
  },
  feathering: (X, p) => {
    const c = p.c ?? X.spec.coat.base, seats: LockSeat[] = [];
    for (const lg of X.legs) {
      const fr = lg.frame(0.86), wb = lg.lg.bones[lg.lg.bones.length - 2];
      for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2, n: V3 = nrm(add(scl(fr.out, Math.sin(a)), scl(fr.fwd, Math.cos(a)))); seats.push({ p: add(fr.c, scl(n, lg.r * 0.35)), n, dir: [0, -1, 0], len: p.len * lg.r * (0.8 + 0.4 * h3(k, 1, X.seed)), wid: lg.r * 0.25, lift: 0.3, droop: 0.2, col: 0, w: [wb, 1] }); }
    }
    const lp = locks({ name: 'feath', seats, tiles: [RP(c[0])], steps: [c[1]], seed: X.seed + 3, reg: 8 }); if (lp) X.body.add(lp);
  },
  fleece: (X, p) => {
    // a heavy fleece: overlapping balls of wool of uneven size over the back and flanks, each drawn as curly locks
    const c = p.c ?? X.spec.coat.base, v0 = vT(X, p.t1), v1 = vT(X, p.t0), n = Math.round((v1 - v0) * 70);
    const paint = (ch: import('./core').Chart, _p: Piece, b: import('./core').Body) => { const px = new Px(ch, b); px.base(() => [RP(c[0]), c[1]]); px.pelt({ len: X.W * 0.07, width: X.W * 0.05, mask: () => 1, tooth: 0.9, clump: 0.3, seed: X.seed }); px.pebbles(X.W * 0.06, { depth: 0.9 }); px.flush(); };
    (paint as unknown as { tone: import('./core').Tone }).tone = { ramp: RP(c[0]), step: c[1] };
    for (let k = 0; k < n; k++) {
      const u = 0.5 + (h3(k, 1, X.seed) - 0.5) * 0.78, v = v0 + h3(k, 2, X.seed) * (v1 - v0), q = onTr(X, u, v), z = 0.7 + 0.6 * h3(k, 3, X.seed), R = X.W * 0.16 * p.puff * z;
      X.body.add(sac({ name: 'wool' + k, at: sub(q.p, scl(q.n, R * 0.2)), n: q.n, up: [0, 0, 1], r: [R, R * 0.9, R * 0.6], sink: 0.35, skin: X.spine, paint, levels: 0 })).reg = 2;
    }
  },
  // ------------------------------------------------------------------------------------------- wings and skin
  wings: (X, p) => {
    // a hand wing: the arm to the wrist, four long fingers, the membrane between them and back to the flank
    for (const wi of X.rig.wings) {
      const s = Math.sign(X.rig.bones[wi].pos[0]) || 1, wb = X.rest[wi], span = X.L * p.span, T = X.T;
      const wrist = add(wb, [s * span * 0.42, span * 0.03, T * 0.05]);
      const tips: V3[] = [add(wb, [s * span * 0.98, -span * 0.02, -T * 0.05]), add(wb, [s * span * 0.86, -span * 0.04, -T * 0.42]), add(wb, [s * span * 0.62, -span * 0.05, -T * 0.68]), add(wb, [s * span * 0.32, -span * 0.04, -T * 0.82])];
      const w: Wt = [wi, 1], R = X.D.lt * 0.18;
      const bonePaint = fleshFlat(p.c);
      X.body.add(stalk({ name: 'arm' + s, path: curve([add(wb, [-s * R, 0, 0]), add(wb, [s * span * 0.2, span * 0.05, T * 0.12]), wrist], 6), r: (t) => R * (1.2 - t * 0.5), around: 6, skin: () => w, paint: bonePaint, levels: 0 })).reg = 11;
      tips.forEach((tp, k) => X.body.add(stalk({ name: 'fing' + s + k, path: curve([wrist, lerp(wrist, tp, 0.5), tp], 5), r: (t) => R * 0.55 * (1 - t * 0.8), around: 4, skin: () => w, paint: bonePaint, levels: 0 })).reg = 11);
      // the membrane: from the leading edge (arm, then the first finger) back to the flank, in rays to each fingertip
      const roots: V3[] = [add(wb, [s * span * 0.08, 0, 0]), lerp(wb, wrist, 0.5), wrist, wrist, wrist, add(wb, [s * span * 0.05, -span * 0.02, -T * 0.6])];
      const ends: V3[] = [wrist, tips[0], tips[1], tips[2], tips[3], add(wb, [s * span * 0.2, -span * 0.04, -T * 0.85])];
      const dirs = roots.map((r, k) => nrm(sub(ends[k], r))), lens = roots.map((r, k) => Math.hypot(...sub(ends[k], r)) || 1e-3), side = roots.map(() => [0, 1, 0] as V3);
      X.body.add(fin({ name: 'memb' + s, roots, dirs, lens, side, ray: R * 0.3, web: R * 0.12, scallop: 0.22, steps: 4, skin: () => w, paint: finPaint(p.c, roots, dirs, lens, R * 0.3), levels: 0 })).reg = 11;
    }
  },
  warts: (X, p) => {
    const seats: { p: V3; n: V3; r: number; h?: number }[] = [];
    for (let k = 0; k < p.n; k++) { const q = onTr(X, 0.5 + (h3(k, 1, X.seed) - 0.5) * 0.7, vT(X, -0.1 + h3(k, 2, X.seed) * 1.15)); if (q.n[1] < -0.2) continue; const r = X.W * p.size * (0.5 + h3(k, 3, X.seed) * 0.8); seats.push({ p: sub(q.p, scl(q.n, r * 0.3)), n: q.n, r, h: r * 0.6 }); }
    const c = p.c ?? X.spec.coat.base;
    X.body.add(bulbs({ name: 'warts', seats, skin: X.spine, levels: 0, around: 6, paint: lookPaint({ ramp: c[0], step: c[1], pebbles: { size: X.W * p.size * 0.4, depth: 0.7 }, glints: { size: X.W * 0.1, every: 0.5 } }) })).reg = 2;
  },
};
const s0 = (seats: { r: number }[]) => seats[0].r * 0.55;
/** the colours of a set of locks: the coat sampled at each root (so a lock over a stripe wears the stripe) */
function tileSet(X: VCtx, part: 'trunk' | 'head' = 'trunk') {
  const smp = coatSampler(X.C, part), tiles: number[][] = [], steps: number[] = [];
  return {
    tiles, steps,
    at(p: V3, n: V3, force?: C2): number {
      let R: number[], st: number;
      if (force) { R = RP(force[0]); st = force[1]; } else { smp.classify(p, n[1], n[0], n[2]); R = smp.R; st = Math.round(smp.st); }
      for (let k = 0; k < tiles.length; k++) if (tiles[k] === R && steps[k] === st) return k;
      tiles.push(R); steps.push(st); return tiles.length - 1;
    },
  };
}

/** a flat fleshy part (gill stalks, finger bones, barbels): one ramp step, creases inked */
function fleshFlat(c: C2) {
  const f = (ch: import('./core').Chart, _p: Piece, b: import('./core').Body) => { const px = new Px(ch, b); px.base(() => [RP(c[0]), c[1]]); px.creaseInk(0.6); px.glints(RP('snow'), { every: 0.3, size: 0.05 }); px.flush(); };
  (f as unknown as { tone: import('./core').Tone }).tone = { ramp: RP(c[0]), step: c[1] };
  return f;
}
/** a fin, frill or membrane: dark bony rays, a lighter membrane between them with veins, a darker scalloped rim */
export function finPaint(c: C2, roots: V3[], dirs: V3[], lens: number[], ray: number) {
  const f = (ch: import('./core').Chart, _p: Piece, b: import('./core').Body) => {
    const px = new Px(ch, b), P = px.gb.P;
    px.lightK = 0.6;
    px.base((i) => {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let best = 1e9, bt = 0;
      for (let k = 0; k < roots.length; k++) {
        const r = roots[k], d = dirs[k], t = Math.max(0, Math.min(lens[k], (x - r[0]) * d[0] + (y - r[1]) * d[1] + (z - r[2]) * d[2]));
        const dd = Math.hypot(x - r[0] - d[0] * t, y - r[1] - d[1] * t, z - r[2] - d[2] * t);
        if (dd < best) { best = dd; bt = t / lens[k]; }
      }
      const onRay = best < ray * 1.6;
      return [RP(c[0]), c[1] + (onRay ? -1.2 : 0.4) + (bt > 0.9 ? -0.8 : 0) - (bt < 0.15 ? 0.5 : 0)];
    });
    px.creaseInk(0.8);
    px.flush();
  };
  (f as unknown as { tone: import('./core').Tone }).tone = { ramp: RP(c[0]), step: c[1] };
  return f;
}
export type { Wt };
