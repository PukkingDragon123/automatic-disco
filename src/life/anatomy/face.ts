// ANATOMY LIBRARY: the face. The working parts round a skull: the pupil (a flat plate on the cornea that rides its own
// bone, so the animator can dilate and pinch it), the outer ear (a cupped, tapering leaf of skin with real thickness,
// its hollow facing forward), the nose leather (a moist pad with its nostrils drawn in), teeth and tusks (keeled
// cones rooted in the gum), whiskers, the tongue (on the tongue bone, so it can shoot out), the inside of the mouth
// (a dark flesh lining that stretches between palate and jaw as it opens) and a throat sac on the throat bone.
import type { V3, Wt } from '../kit';
import { newCM, tube, sheetGrid, creaseRow, type Ring } from '../cage';
import type { Piece, Chart, Body } from './core';
import { stalk, sac, curve } from './append';
import { Px, RP, cl } from './paint';
import type { PupilKind } from './head';

const TAU = Math.PI * 2;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const crs = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
type Paint = (c: Chart, p: Piece, b: Body) => void;

/** the outline of a pupil in the cornea's tangent plane (x across, y up), unit size */
export function pupilOutline(kind: PupilKind): number[][] {
  switch (kind) {
    case 'slit': return [[0, 1], [0.2, 0.62], [0.26, 0], [0.2, -0.62], [0, -1], [-0.2, -0.62], [-0.26, 0], [-0.2, 0.62]];
    case 'bar': return [[1, 0.18], [0.82, 0.32], [-0.82, 0.32], [-1, 0.18], [-1, -0.18], [-0.82, -0.32], [0.82, -0.32], [1, -0.18]];
    case 'w': return [[0.9, 0.3], [0.4, -0.12], [0, 0.22], [-0.4, -0.12], [-0.9, 0.3], [-0.84, -0.06], [-0.4, -0.42], [0, -0.1], [0.4, -0.42], [0.84, -0.06]];
    default: return Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * TAU + 0.39), Math.sin((i / 8) * TAU + 0.39)]);
  }
}
/** the pupil plate: an ink polygon a hair above the cornea, on the pupil bone (seated at its centre by the caller) */
export function pupilDisc(o: { name: string; c: V3; ax: V3; r: number; kind: PupilKind; size: number; bone: number }): Piece {
  const m = newCM(), ax = nrm(o.ax), up0 = nrm(sub([0, 1, 0], scl(ax, ax[1]))), lt0 = nrm(crs(up0, ax));
  const sh = pupilOutline(o.kind), rp = o.r * o.size;
  const on = (x: number, y: number, k: number) => add(o.c, scl(nrm(add(ax, add(scl(lt0, (x * rp * k) / o.r), scl(up0, (y * rp * k) / o.r)))), o.r * 1.014));
  const rows = [sh.map(([x, y]) => on(x, y, 1)), sh.map(([x, y]) => on(x, y, 0.35))];
  const g = sheetGrid(m, rows, { tag: 0, out: () => ax, wrapCols: true, capE: true });
  return {
    name: o.name, m, grids: [g], levels: 0, noOcc: true, farSkip: true, reg: 4, skin: () => [o.bone, 1], k: 0.6,
    paint: (ch, _p, b) => { const px = new Px(ch, b); px.lightK = 0; px.base(() => [RP('ink'), 0]); px.flush({ eye: () => true }); },
  };
}

/** an outer ear: a cupped leaf of skin from a root buried in the skull out along `dir`, its hollow facing `face`;
 *  `wid` is the half width at its widest, the outline by `shape` (fractions of the length -> width), a fold of the rim */
export function pinna(o: { name: string; root: V3; dir: V3; face: V3; len: number; wid: number; cup?: number; thick?: number; shape?: number[]; bone: number; headBone: number; paint: Paint; k?: number; levels?: number; tipCurl?: number }): Piece {
  const m = newCM(), dir = nrm(o.dir), face0 = nrm(sub(o.face, scl(dir, dot(o.face, dir)))), side = nrm(crs(dir, face0));
  const shape = o.shape ?? [0.62, 0.92, 1.0, 0.86, 0.58, 0.26, 0.05];
  const n = shape.length, cup = o.cup ?? 0.9, th = o.thick ?? o.wid * 0.08;
  const rings: Ring[] = [];
  const A = 7;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), w = o.wid * shape[i];
    // the tip leans back over the head (curl), the hollow shallows toward the tip
    const curl = (o.tipCurl ?? 0.12) * t * t;
    const face = nrm(add(face0, scl(dir, -curl)));
    const c = add(add(o.root, scl(dir, o.len * t)), scl(face0, -o.len * curl * 0.5));
    const R = Math.max(w * 0.6, w / Math.max(0.3, Math.sin(cup * (1 - t * 0.4)))), al = Math.asin(Math.min(0.999, w / R));
    const pts: number[][] = [];
    // the hollow (front) arc from one edge to the other, then the back arc returning
    for (let k = 0; k < A; k++) { const ph = -al + (2 * al * k) / (A - 1); pts.push([Math.sin(ph) * R, R - Math.cos(ph) * R]); }
    for (let k = A - 1; k >= 0; k--) { const ph = -al + (2 * al * k) / (A - 1); pts.push([Math.sin(ph) * (R + th), R - Math.cos(ph) * (R + th) - th * 0.2]); }
    rings.push({ c, x: side, y: face, pts });
  }
  const g = tube(m, rings, { tag: 0, capE: true, capS: true });
  // the rim fold along both edges
  const C = rings[0].pts.length;
  for (const j of [0, A - 1]) for (let i = 0; i < n - 1; i++) { const a = g.v[i][j], b = g.v[i + 1][j]; const k = a < b ? a * 4194304 + b : b * 4194304 + a; m.sharp.set(k, 1); }
  void C;
  const L = o.len;
  return {
    name: o.name, m, grids: [g], levels: o.levels ?? 1, reg: 7, k: o.k ?? 1.3, paint: o.paint,
    skin: (p) => { const t = dot(sub(p, o.root), dir) / L; return t < 0.12 ? [o.bone, 0.5 + t * 4, o.headBone, 0.5 - t * 4] : [o.bone, 1]; },
  };
}
/** paint an ear: furred (or scaly) back, the hollow pale bare skin shading deep inside, a dark rim and tip, tufts of
 *  light hair combed in from the edges */
export function earPaint(o: { outer: (px: Px) => void; inner: number[]; dark: number[]; furred: boolean; face: V3; dir: V3; root: V3; len: number }): Paint {
  return (ch, _p, b) => { const px = new Px(ch, b); o.outer(px); drawEarHollow(px, o); px.flush(); };
}
/** the ear's hollow drawn over whatever coat its back wears */
export function drawEarHollow(px: Px, o: { inner: number[]; dark: number[]; furred: boolean; face: V3; dir: V3; root: V3; len: number }) {
  {
    const P = px.gb.P, N = px.gb.N;
    for (let i = 0; i < px.n; i++) {
      const n: V3 = [N[i * 3], N[i * 3 + 1], N[i * 3 + 2]], f = dot(n, o.face);
      const p: V3 = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], t = cl(dot(sub(p, o.root), o.dir) / o.len, 0, 1);
      if (f > 0.25) {
        // the hollow: shadowed toward the root, ribs of cartilage across it, hair tufts at the edges
        const ribs = Math.abs(((t * 9) % 1) - 0.5) < 0.12;
        px.rampI[i] = px.ramp(o.inner); px.step[i] = 2.6 - (t < 0.35 ? 1 : 0) - (ribs ? 0.6 : 0); px.mark[i] = 0;
        if (o.furred && f < 0.55 && ((i * 7) % 5) < 2) { px.rampI[i] = px.ramp(o.dark); px.step[i] = 4; }
      } else if (f > 0.05) { px.rampI[i] = px.ramp(o.dark); px.step[i] = 1; px.mark[i] = 0; }
      if (t > 0.86) px.mark[i] -= 1.2;
    }
  }
}

/** the nose leather: a moist pad at the end of the muzzle (a flattened balloon) */
export function noseLeather(o: { name: string; c: V3; fwd: V3; up?: V3; w: number; h: number; d: number; bone: number; paint: Paint }): Piece {
  const p = sac({ name: o.name, at: o.c, n: o.fwd, up: o.up ?? [0, 1, 0], r: [o.w, o.h, o.d], sink: 0.45, skin: () => [o.bone, 1], paint: o.paint, levels: 1, k: 1.8 });
  p.reg = 3;
  return p;
}
/** nostrils, slits and pits drawn into any chart: dark commas with a lit lower lip */
export function drawNostrils(px: Px, sites: { c: V3; r: number; dir: V3; curl?: number }[]) {
  const P = px.gb.P;
  for (let i = 0; i < px.n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    for (const s of sites) {
      const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2];
      if (Math.abs(dx) > s.r * 2 || Math.abs(dy) > s.r * 2 || Math.abs(dz) > s.r * 2) continue;
      // a comma: an elongated pit along `dir` that hooks at its outer end
      const along = dx * s.dir[0] + dy * s.dir[1] + dz * s.dir[2], across = Math.hypot(dx - s.dir[0] * along, dy - s.dir[1] * along, dz - s.dir[2] * along);
      const hook = (s.curl ?? 0.3) * Math.max(0, along / s.r) ** 2 * s.r;
      const d = Math.max(Math.abs(along) / 1.0, (across - hook) * 2.2);
      if (d < s.r) { px.rampI[i] = px.ramp(RP('ink')); px.step[i] = d < s.r * 0.5 ? 0 : 1; px.mark[i] = 0; }
      else if (d < s.r * 1.45) px.mark[i] += dy < 0 ? 1.1 : -0.9;
    }
  }
}

/** a tooth, fang or tusk: a keeled cone rooted in the gum, curving through `ctrl` */
export function tooth(o: { name: string; ctrl: V3[]; r: number; bone: number; paint: Paint; around?: number; flat?: number }): Piece {
  const path = curve(o.ctrl, Math.max(3, o.ctrl.length + 1));
  const p = stalk({ name: o.name, path, r: (t) => o.r * Math.pow(1 - t * 0.96, 0.8) + o.r * 0.03, around: o.around ?? 6, sec: (a) => (Math.abs(Math.sin(a)) > 0.7 ? o.flat ?? 0.8 : 1), keel: true, skin: () => [o.bone, 1], paint: o.paint, levels: 0, k: 1.2 });
  p.reg = 6; p.farSkip = true; p.noOcc = true;
  return p;
}
/** a tusk: a long ringed ivory horn sweeping out and up from the upper jaw */
export function tusk(o: { name: string; root: V3; out: V3; len: number; r: number; curl: number; bone: number; paint: Paint }): Piece {
  const d = nrm(o.out), up: V3 = [0, 1, 0];
  const ctrl: V3[] = [sub(o.root, scl(d, o.r)), o.root, add(add(o.root, scl(d, o.len * 0.45)), scl(up, o.len * 0.05 * o.curl)), add(add(o.root, scl(d, o.len * 0.8)), scl(up, o.len * 0.3 * o.curl)), add(add(o.root, scl(d, o.len * 0.92)), scl(up, o.len * 0.62 * o.curl))];
  const p = stalk({ name: o.name, path: curve(ctrl, 9), r: (t) => o.r * (1 - t * 0.85) + 0.002, around: 7, ringEvery: 2, keel: false, skin: () => [o.bone, 1], paint: o.paint, levels: 1, k: 1.3 });
  p.reg = 6;
  return p;
}
/** whiskers: long thin tapering hairs fanned out from the muzzle pads (each a stalk with a drooping tip) */
export function whiskers(o: { name: string; roots: V3[]; dirs: V3[]; len: number; r: number; bone: number; paint: Paint }): Piece[] {
  return o.roots.map((root, i) => {
    const d = nrm(o.dirs[i]);
    const ctrl: V3[] = [root, add(root, scl(d, o.len * 0.4)), add(add(root, scl(d, o.len * 0.8)), [0, -o.len * 0.06, 0]), add(add(root, scl(d, o.len)), [0, -o.len * 0.16, 0])];
    const p = stalk({ name: o.name + i, path: curve(ctrl, 5), r: (t) => o.r * (1 - t * 0.8), around: 3, skin: () => [o.bone, 1], paint: o.paint, levels: 0, k: 0.4 });
    p.farSkip = true; p.noOcc = true; p.reg = 7;
    return p;
  });
}
/** the tongue: a flattened tapering muscle on the tongue bone, lying along the floor of the mouth (forked for a lizard) */
export function tongueP(o: { name: string; root: V3; tip: V3; w: number; bone: number; fork?: boolean; paint: Paint }): Piece {
  const n = 6, dir = nrm(sub(o.tip, o.root)), rings: Ring[] = [];
  const m = newCM(), side = nrm(crs([0, 1, 0], dir)), up = nrm(crs(dir, side));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), c = add(o.root, scl(sub(o.tip, o.root), t)), w = o.w * (t < 0.3 ? 1 : 1 - (t - 0.3) * (o.fork ? 0.9 : 0.6));
    rings.push({ c, x: side, y: up, pts: Array.from({ length: 6 }, (_, j) => { const q = (j / 6) * TAU; return [Math.sin(q) * w * (o.fork && t > 0.8 ? 1.4 : 1), Math.cos(q) * w * 0.35]; }) });
  }
  const g = tube(m, rings, { tag: 0, capE: true, capS: true });
  return { name: o.name, m, grids: [g], levels: 0, skin: () => [o.bone, 1], paint: o.paint, k: 0.8, farSkip: true, noOcc: true, reg: 6 };
}
/** the inside of the mouth: a dark lining from the throat to behind the lips, weighted half to the head and half to
 *  the jaw so it stretches as the mouth opens */
export function mouthLining(o: { name: string; back: V3; front: V3; w: number; h: number; head: number; jaw: number }): Piece {
  const m = newCM(), n = 4, dir = nrm(sub(o.front, o.back)), side = nrm(crs([0, 1, 0], dir)), up = nrm(crs(dir, side));
  const rings: Ring[] = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1), c = add(o.back, scl(sub(o.front, o.back), t)), k = 1 - t * 0.45; rings.push({ c, x: side, y: up, pts: Array.from({ length: 8 }, (_, j) => { const q = (j / 8) * TAU; return [Math.sin(q) * o.w * k, Math.cos(q) * o.h * k]; }) }); }
  const g = tube(m, rings, { tag: 0, capS: true, capE: true });
  creaseRow(m, g, 1, 1);
  const midY = (o.back[1] + o.front[1]) / 2;
  return {
    name: o.name, m, grids: [g], levels: 0, farSkip: true, noOcc: true, reg: 6, k: 0.5,
    skin: (p) => (p[1] > midY ? [o.head, 0.8, o.jaw, 0.2] : [o.jaw, 0.8, o.head, 0.2]),
    paint: (ch, _p, b) => { const px = new Px(ch, b), N = px.gb.N; px.lightK = 0.3; px.base((i) => [RP('flesh'), N[i * 3 + 1] < -0.2 ? 2 : 1]); px.folds([0, 0, 1], o.back, Math.max(0.004, o.w * 0.35), { depth: 0.6 }); px.flush(); },
  };
}
/** a vocal or display sac under the throat on the throat bone (it swells in croaks) */
export function throatSac(o: { name: string; at: V3; r: [number, number, number]; bone: number; paint: Paint }): Piece {
  const p = sac({ name: o.name, at: o.at, n: [0, -1, 0.35], up: [0, 0, 1], r: o.r, sink: 0.55, skin: () => [o.bone, 1], paint: o.paint, levels: 1, k: 1 });
  p.reg = 6;
  return p;
}
export type { Wt };
