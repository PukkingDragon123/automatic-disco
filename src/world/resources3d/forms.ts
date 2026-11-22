// What every real item looks like in 3D: one model per item (2-4 variants for the common ones), each built from the
// low-poly kit at real size (metres, resting on y = 0, long things lying along x), its surfaces in the painted
// materials (paint.ts) or in single palette steps (`s:ramp:step:flags`). Each form also says how the item piles up
// (pile.ts), what sound and dust it makes when it lands, and what the icon shows (a unit or a small pile).
import * as THREE from 'three';
import type { RampName } from '../../art/palette';
import { Mesher, Rnd, type MatKey } from './mesh';
import { F_EMIT, F_GLOSS, F_METAL, F_GLASS } from './codes';

type V3 = [number, number, number];
/** a single palette step as a material */
export const S = (r: RampName | (string & {}), i: number, f = 0): MatKey => `s:${r}:${i}:${f}`;
const GL = F_GLOSS | F_GLASS, MT = F_METAL | F_GLOSS;
export type PileKind = 'logs' | 'boards' | 'chunks' | 'mound' | 'stack' | 'bales' | 'cans' | 'crates' | 'packs' | 'rack';
export type Sound = 'wood' | 'stone' | 'metal' | 'dirt' | 'glass' | 'soft' | 'liquid' | 'gravel';
export interface Form {
  /** build one unit of variant v at the origin */
  unit(M: Mesher, v: number, seed: number): void;
  variants: number;
  pile: PileKind;
  /** the mound's material for mound piles (and the heap under chunk piles of loose things) */
  heap?: MatKey;
  /** what the icon shows: n units piled (1 = the unit itself), a mound with n units on it */
  icon?: { n?: number; yaw?: number; pitch?: number; seed?: number; /** 'unit' one unit, 'heap' n units dropped in a heap, 'pile' the form's own pile of n */ as?: 'unit' | 'heap' | 'pile' };
  sound: Sound;
  /** dust colour ramp when it lands */
  dust: RampName;
  /** a fine loose load: its mound carries no clods */
  fine?: boolean;
}
const PI = Math.PI;

// ------------------------------------------------------------------ wood
const BARKS = ['bark', 'bark', 'barkPine', 'barkBirch'] as const;
/** a log along +x: lumpy bark (every ring of the trunk jittered), a bark rim round each sawn end, the end grain's
 *  growth rings and checks painted on it; optionally a sawn branch stub, a bend, an end sawn at a slant */
export function log(M: Mesher, o: { len: number; r: number; seed: number; bark?: MatKey; stub?: boolean; taper?: number; n?: number; bend?: number; cut?: number }) {
  const n = o.n ?? 10, bark = o.bark ?? 'bark', pine = bark === 'barkPine', birch = bark === 'barkBirch';
  const rim = pine ? S('m_barkP', 1) : birch ? S('m_birch', 2) : S('m_bark', 1);
  M.at([-o.len / 2, o.r, 0], [0, 0, -PI / 2], 1, () => {
    const { ring } = M.prism(bark, { n, r0: o.r * (1 + (o.taper ?? 0.06)), r1: o.r * (1 - (o.taper ?? 0.06)), len: o.len, rings: 4, jit: 0.085, seed: o.seed, cap0: null, cap1: null, bend: o.bend ?? 0, cut1: o.cut ?? 0 });
    disc(M, ring[0], [0.86], [rim, 'endgrain'], true);
    disc(M, ring[ring.length - 1], [0.86], [rim, 'endgrain'], false);
    if (o.stub) {
      // a sawn-off branch stub out of the side, with its own end grain
      const a = new Rnd(o.seed).r(0.4, 1.2);
      M.at([Math.cos(a) * o.r * 0.8, o.len * 0.62, Math.sin(a) * o.r * 0.8], [0, -a, -PI / 2 + 0.55], 1, () => {
        const st = M.prism(bark, { n: 7, r0: o.r * 0.34, r1: o.r * 0.27, len: o.r * 0.9, seed: o.seed + 3, cap0: null, cap1: null, jit: 0.06 });
        disc(M, st.ring[st.ring.length - 1], [0.8], [rim, 'endgrain'], false);
      });
    }
  });
}
/** the end of a prism filled in concentric bands, scaled in from its own rim (edges always meet) */
export function disc(M: Mesher, rim: V3[], scales: number[], mats: MatKey[], down: boolean) {
  const n = rim.length, cy = rim[0][1], cx = rim.reduce((s, p) => s + p[0], 0) / n, cz = rim.reduce((s, p) => s + p[2], 0) / n;
  const at = (i: number, k: number): V3 => [cx + (rim[i % n][0] - cx) * k, cy, cz + (rim[i % n][2] - cz) * k];
  const uv = (p: V3): [number, number] => [p[0], p[2]];
  const ks = [1, ...scales, 0];
  for (let b = 0; b + 1 < ks.length; b++) {
    const k0 = ks[b], k1 = ks[b + 1], m = mats[Math.min(b, mats.length - 1)];
    for (let i = 0; i < n; i++) {
      const a0 = at(i, k0), b0 = at(i + 1, k0), a1 = at(i, k1), b1 = at(i + 1, k1);
      if (down) { M.tri(m, a0, b0, b1, uv(a0), uv(b0), uv(b1)); if (k1 > 0) M.tri(m, a0, b1, a1, uv(a0), uv(b1), uv(a1)); }
      else { M.tri(m, b0, a0, b1, uv(b0), uv(a0), uv(b1)); if (k1 > 0) M.tri(m, a0, a1, b1, uv(a0), uv(a1), uv(b1)); }
    }
  }
}
/** a half log split lengthwise: bark round the back, the pale split face up */
export function splitLog(M: Mesher, o: { len: number; r: number; seed: number; bark: MatKey }) {
  const rnd = new Rnd(o.seed), pts: THREE.Vector3[] = [];
  for (const x of [-o.len / 2, o.len / 2]) for (let i = 0; i <= 6; i++) { const a = PI + (i / 6) * PI, k = 1 + rnd.r(-0.05, 0.05); pts.push(new THREE.Vector3(x + rnd.r(-0.02, 0.02), o.r + Math.sin(a) * o.r * k, Math.cos(a) * o.r * k)); }
  hullBy(M, pts, (n) => (n.y > 0.8 ? 'wood' : Math.abs(n.x) > 0.75 ? S('ochre', 4) : o.bark));
}
/** a convex hull, each face's material from its normal */
export function hullBy(M: Mesher, pts: THREE.Vector3[], pick: (n: THREE.Vector3) => MatKey) {
  const tmp = new Mesher(); tmp.hull('x', pts);
  const P = tmp.parts.get('x'); if (!P) return;
  const n = new THREE.Vector3();
  for (let i = 0; i < P.p.length; i += 9) {
    n.set(P.n[i], P.n[i + 1], P.n[i + 2]);
    const a: V3 = [P.p[i], P.p[i + 1], P.p[i + 2]], b: V3 = [P.p[i + 3], P.p[i + 4], P.p[i + 5]], c: V3 = [P.p[i + 6], P.p[i + 7], P.p[i + 8]];
    M.ptri(pick(n), a, b, c);
  }
}
/** a sawn board along x, end grain on its ends */
function board(M: Mesher, o: { len: number; w: number; t: number; seed: number; face?: MatKey }) {
  const x = o.len / 2, y = o.t, z = o.w / 2, c = Math.min(o.t * 0.3, 0.006), rnd = new Rnd(o.seed);
  const pts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sy of [0, 1]) for (const sz of [-1, 1]) {
    const xx = sx * (x - rnd.r(0, 0.01));
    pts.push(new THREE.Vector3(xx, sy * y, sz * (z - c)), new THREE.Vector3(xx, sy * (y - c) + (1 - sy) * c, sz * z));
  }
  hullBy(M, pts, (n) => (Math.abs(n.x) > 0.7 ? S('ochre', 3) : o.face ?? 'plank'));
}
// ------------------------------------------------------------------ stone and ore
/** a rock of a family: 0 rounded cobble, 1 angular block, 2 flat slab, 3 wedge */
export function stoneUnit(M: Mesher, mat: MatKey, r: number, seed: number, shape: number) {
  const s = shape % 4;
  if (s === 0) M.rock(mat, r, r * 0.72, r * 0.86, seed, { n: 24, jag: 0.14, flat: 0.25, chips: 2 });
  else if (s === 1) M.rock(mat, r * 1.05, r * 0.8, r * 0.8, seed, { n: 16, jag: 0.26, flat: 0.3, chips: 3 });
  else if (s === 2) M.rock(mat, r * 1.15, r * 0.42, r * 0.95, seed, { n: 18, jag: 0.2, flat: 0.15, chips: 2 });
  else M.rock(mat, r * 1.2, r * 0.7, r * 0.6, seed, { n: 14, jag: 0.3, flat: 0.35, chips: 3 });
}
/** a part built in its own mesher, rotated and scaled, then dropped so its lowest point rests on y = pos[1] */
export function rest(M: Mesher, build: (t: Mesher) => void, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], s = 1) {
  const t = new Mesher(); build(t);
  const r = new Mesher(); r.m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)).scale(new THREE.Vector3(s, s, s)); r.merge(t);
  const rb = r.bounds();
  M.at([pos[0], pos[1] - rb.min.y, pos[2]], [0, 0, 0], 1, () => M.merge(r));
}
/** crystals or nuggets of the ore's metal breaking out of a chunk's upper surface */
function oreBits(M: Mesher, mat: MatKey, r: number, seed: number, n: number) {
  const rnd = new Rnd(seed + 77);
  for (let i = 0; i < n; i++) {
    const a = rnd.r(0, PI * 2), d = r * rnd.r(0.15, 0.55), y = r * rnd.r(0.35, 0.55);
    M.at([Math.cos(a) * d, y, Math.sin(a) * d * 0.8], [rnd.r(-0.6, 0.6), rnd.r(0, PI), rnd.r(-0.6, 0.6)], 1, () => M.crystal(mat, r * rnd.r(0.08, 0.14), r * rnd.r(0.25, 0.45), { n: rnd.i(4, 6), seed: seed + i, tip: r * 0.12 }));
  }
}
/** a crystal point leaning out from p: radius r, length h */
function point(M: Mesher, mat: MatKey, p: V3, r: number, h: number, tilt: [number, number], seed: number, n = 6) {
  M.at(p, [tilt[0], 0, tilt[1]], 1, () => M.crystal(mat, r, h, { n, seed, tip: r * 1.7, base: 0.9 }));
}
/** a cluster of points on a little matrix stone */
function cluster(M: Mesher, gem: MatKey, matrix: MatKey, seed: number, o: { r?: number; n?: number; sides?: number } = {}) {
  const rnd = new Rnd(seed), R = o.r ?? 0.06;
  M.rock(matrix, R * 1.5, R * 0.55, R * 1.2, seed, { n: 10, jag: 0.25, flat: 0.4 });
  const k = o.n ?? 4;
  point(M, gem, [0, R * 0.15, 0], R * 0.42, R * 2.6, [rnd.r(-0.15, 0.15), rnd.r(-0.15, 0.15)], seed + 1, o.sides);
  for (let i = 1; i < k; i++) {
    const a = (i / (k - 1)) * PI * 2 + rnd.r(-0.4, 0.4), d = R * rnd.r(0.55, 0.9);
    point(M, gem, [Math.cos(a) * d, R * 0.1, Math.sin(a) * d * 0.8], R * rnd.r(0.22, 0.34), R * rnd.r(1.1, 1.9), [Math.sin(a) * 0.55, -Math.cos(a) * 0.55], seed + i * 7, o.sides);
  }
}
// ------------------------------------------------------------------ containers, packs
/** a stoppered glass vial: glass, the sample inside, a cork, a paper label */
function vial(M: Mesher, content: MatKey, o: { h?: number; r?: number; cap?: MatKey; fill?: number; glow?: boolean } = {}) {
  const h = o.h ?? 0.1, r = o.r ?? 0.017, f = o.fill ?? 0.6;
  M.lathe(S('water', 5, GL), [[0, 0], [r * 0.8, 0.002], [r, h * 0.08], [r, h * 0.85], [r * 0.85, h * 0.9]], { n: 10, smooth: true });
  M.at([0, h * 0.05, 0], [0, 0, 0], 1, () => M.lathe(content, [[0, 0], [r * 0.82, 0], [r * 0.84, h * 0.78 * f], [0, h * 0.8 * f]], { n: 10, smooth: true }));
  M.at([0, h * 0.84, 0], [0, 0, 0], 1, () => M.lathe(o.cap ?? S('ochre', 4), [[0, 0], [r * 0.95, 0], [r * 1.05, h * 0.22], [0, h * 0.22]], { n: 8 }));
  M.at([0, h * 0.32, r * 0.96], [0, 0, 0], 1, () => M.box(S('paper', 4), r * 1.3, h * 0.2, 0.002));
}
/** a tied cloth pouch or sack (lathed, slumped), its neck gathered and tied */
function sack(M: Mesher, body: MatKey, o: { h?: number; r?: number; tie?: MatKey; seed?: number; neck?: MatKey } = {}) {
  const h = o.h ?? 0.12, r = o.r ?? 0.07;
  M.lathe(body, [[0, 0], [r * 0.85, 0.002], [r, h * 0.25], [r * 0.95, h * 0.55], [r * 0.55, h * 0.78], [r * 0.28, h * 0.84]], { n: 9, jit: 0.07, seed: o.seed ?? 3, sq: 0.85 });
  M.at([0, h * 0.8, 0], [0, 0, 0], 1, () => M.prism(o.tie ?? S('straw', 2), { n: 7, r0: r * 0.3, len: h * 0.06, cap0: null, cap1: null }));
  M.at([0, h * 0.86, 0], [0, 0, 0], 1, () => M.lathe(o.neck ?? body, [[r * 0.26, 0], [r * 0.42, h * 0.14], [0, h * 0.15]], { n: 9 }));
}
/** a paper seed packet: a flat envelope, its flap folded over, a printed band in the plant's colour */
function packet(M: Mesher, band: MatKey, mark: MatKey) {
  const w = 0.09, h = 0.12, t = 0.012;
  M.at([0, t / 2, 0], [0, 0, 0], 1, () => M.box('paper', w, t, h, 0.003));
  M.at([0, t + 0.0005, -h * 0.18], [0, 0, 0], 1, () => M.box(band, w * 0.86, 0.001, h * 0.3));
  M.at([0, t + 0.001, -h * 0.18], [0, 0, 0], 1, () => M.card(mark, [[-0.012, 0.01], [0, -0.02], [0.012, 0.01], [0, 0.004]], {}));
  M.at([0, t + 0.0015, h * 0.36], [0, 0, 0], 1, () => M.card(S('paper', 3), [[-w / 2, -h * 0.12], [w / 2, -h * 0.12], [0, h * 0.12]], { back: S('paper', 2) }));
}
/** a steel jerrycan: chamfered body, pressed X, a handle and a spout cap; band in the fluid's colour */
function jerrycan(M: Mesher, paint: MatKey, band: MatKey) {
  const w = 0.17, h = 0.24, d = 0.34;
  M.at([0, h / 2, 0], [0, 0, 0], 1, () => M.box(paint, w, h, d, 0.018));
  M.at([w / 2 + 0.001, h * 0.48, 0], [0, 0, 0], 1, () => M.box(band, 0.004, h * 0.3, d * 0.62));
  M.at([-w / 2 - 0.001, h * 0.48, 0], [0, 0, 0], 1, () => M.box(band, 0.004, h * 0.3, d * 0.62));
  for (const z of [-0.07, 0, 0.07]) M.at([0, h + 0.022, z - 0.02], [0, 0, 0], 1, () => M.box(S('steel', 3, MT), 0.03, 0.04, 0.014));
  M.at([0, h + 0.044, -0.02], [0, 0, 0], 1, () => M.box(S('steel', 4, MT), 0.03, 0.012, 0.16));
  M.at([0, h, d * 0.36], [0.5, 0, 0], 1, () => M.prism(S('steel', 2, MT), { n: 8, r0: 0.024, len: 0.05, cap1: S('steel', 4, MT) }));
}
/** a ribbed steel drum: painted body, two rolling hoops, a bung */
function drum(M: Mesher, paint: MatKey, o: { h?: number; r?: number; band?: MatKey } = {}) {
  const h = o.h ?? 0.36, r = o.r ?? 0.13;
  M.lathe((j) => (j === 2 || j === 6 ? (o.band ?? paint) : paint), [[0, 0], [r * 0.96, 0], [r, h * 0.04], [r, h * 0.3], [r * 1.04, h * 0.32], [r, h * 0.34], [r, h * 0.66], [r * 1.04, h * 0.68], [r, h * 0.7], [r, h * 0.96], [r * 0.96, h], [0, h]], { n: 12, smooth: true });
  M.at([r * 0.5, h, 0], [0, 0, 0], 1, () => M.prism(S('steel', 5, MT), { n: 6, r0: r * 0.16, len: 0.012 }));
}
/** a glass bottle or carboy of a liquid */
function bottle(M: Mesher, liquid: MatKey, o: { h?: number; r?: number; cork?: MatKey; fill?: number } = {}) {
  const h = o.h ?? 0.3, r = o.r ?? 0.09, f = o.fill ?? 0.7;
  M.lathe(S('water', 5, GL), [[0, 0], [r * 0.9, 0.002], [r, h * 0.08], [r, h * 0.55], [r * 0.7, h * 0.72], [r * 0.32, h * 0.8], [r * 0.32, h * 0.92]], { n: 12, smooth: true });
  M.at([0, 0.004, 0], [0, 0, 0], 1, () => M.lathe(liquid, [[0, 0], [r * 0.9, 0], [r * 0.93, h * 0.55 * f], [r * 0.6, h * 0.66 * f], [0, h * 0.68 * f]], { n: 12, smooth: true }));
  M.at([0, h * 0.9, 0], [0, 0, 0], 1, () => M.lathe(o.cork ?? S('ochre', 4), [[0, 0], [r * 0.3, 0], [r * 0.36, h * 0.1], [0, h * 0.1]], { n: 8 }));
}
/** a wooden shipping crate (slats and corner posts), lidless when open */
export function crateBox(M: Mesher, w: number, h: number, d: number, open = false) {
  const t = 0.018, p = 0.035;
  M.at([0, t / 2, 0], [0, 0, 0], 1, () => M.box('crateWood', w, t, d));
  for (const [x, z, ww, dd] of [[0, d / 2 - t / 2, w, t], [0, -d / 2 + t / 2, w, t], [w / 2 - t / 2, 0, t, d], [-w / 2 + t / 2, 0, t, d]] as [number, number, number, number][]) {
    const slats = 3;
    for (let k = 0; k < slats; k++) { const sh = (h - t) / slats - 0.006; M.at([x, t + k * ((h - t) / slats) + sh / 2, z], [0, 0, 0], 1, () => M.box('crateWood', ww, sh, dd)); }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) M.at([sx * (w / 2 - p / 2), h / 2, sz * (d / 2 - p / 2)], [0, 0, 0], 1, () => M.box(S('ochre', 2), p, h, p, 0.004));
  if (!open) M.at([0, h + t / 2, 0], [0, 0, 0], 1, () => M.box('crateWood', w, t, d));
  // stencilled band on the front
  M.at([0, h * 0.55, d / 2 + 0.002], [0, 0, 0], 1, () => M.box(S('stampRed', 2), w * 0.3, h * 0.12, 0.002));
}
/** an ingot along x: a cast trapezoid, its top edges bevelled, the top face stamped, a little casting flash */
function ingot(M: Mesher, mat: MatKey, o: { l?: number; w?: number; h?: number; seed: number; stamp?: MatKey }) {
  const l = o.l ?? 0.2, w = o.w ?? 0.08, h = o.h ?? 0.05, i = 0.16, rnd = new Rnd(o.seed);
  const pts: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push(new THREE.Vector3(sx * l / 2 + sx * rnd.r(0, 0.003), 0, sz * w / 2 + sz * rnd.r(0, 0.002)));
    pts.push(new THREE.Vector3(sx * l / 2 * (1 - i * 0.8), h * 0.82, sz * w / 2 * (1 - i * 1.3)));
    pts.push(new THREE.Vector3(sx * l / 2 * (1 - i * 1.15) + rnd.r(-0.002, 0.002), h, sz * w / 2 * (1 - i * 2.2)));
  }
  M.hull(mat, pts);
  if (o.stamp) M.at([0, h + 0.0008, 0], [0, 0, 0], 1, () => M.box(o.stamp!, l * 0.28, 0.0016, w * 0.3));
}
/** a spur gear lying flat: hub, web and teeth */
function gear(M: Mesher, mat: MatKey, r: number, th: number, teeth: number) {
  M.lathe(mat, [[r * 0.22, 0], [r * 0.82, 0], [r * 0.82, th], [r * 0.22, th], [r * 0.22, 0]], { n: teeth });
  for (let i = 0; i < teeth; i++) { const a = (i / teeth) * PI * 2; M.at([Math.cos(a) * r * 0.88, th / 2, Math.sin(a) * r * 0.88], [0, -a, 0], 1, () => M.box(mat, r * 0.22, th, (PI * 2 * r / teeth) * 0.5, 0.002)); }
  M.at([0, 0, 0], [0, 0, 0], 1, () => M.prism(S('steel', 2, MT), { n: 8, r0: r * 0.22, len: th * 1.25, cap1: S('steel', 1) }));
}
/** a wooden spool wound with a material */
function spool(M: Mesher, wind: MatKey, r: number, h: number) {
  M.prism('wood', { n: 10, r0: r, len: h * 0.12, cap1: S('ochre', 5) });
  M.at([0, h * 0.12, 0], [0, 0, 0], 1, () => M.prism(wind, { n: 12, r0: r * 0.8, len: h * 0.76, cap0: null, cap1: null, smooth: true }));
  M.at([0, h * 0.88, 0], [0, 0, 0], 1, () => M.prism('wood', { n: 10, r0: r, len: h * 0.12, cap1: S('ochre', 5) }));
  M.at([0, h, 0], [0, 0, 0], 1, () => M.prism(S('fur', 1), { n: 8, r0: r * 0.2, len: 0.002 }));
}
/** a ring of tube (coils of cable or winding) */
function coil(M: Mesher, mat: MatKey, R: number, r: number, turns: number, rise: number) {
  const seg = 14 * turns;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / 14) * PI * 2, a1 = ((i + 1) / 14) * PI * 2, y0 = (i / seg) * rise, y1 = ((i + 1) / seg) * rise;
    const p0: V3 = [Math.cos(a0) * R, y0 + r, Math.sin(a0) * R], p1: V3 = [Math.cos(a1) * R, y1 + r, Math.sin(a1) * R];
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    // a short prism from p0 to p1
    const dir = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    M.with(new THREE.Matrix4().compose(new THREE.Vector3(...p0), q, new THREE.Vector3(1, 1, 1)), () => M.prism(mat, { n: 6, r0: r, len: len * 1.04, cap0: null, cap1: null, smooth: true, rot: 0 }));
  }
}
/** an open flat basket/punnet with small round things heaped in it */
function punnet(M: Mesher, berry: MatKey, seed: number) {
  const rnd = new Rnd(seed);
  M.lathe('burlap', [[0, 0], [0.07, 0], [0.085, 0.05], [0.08, 0.05], [0.065, 0.004], [0, 0.004]], { n: 10 });
  for (let i = 0; i < 14; i++) { const a = rnd.r(0, PI * 2), d = Math.sqrt(rnd.next()) * 0.06, y = 0.035 + (0.06 - d) * 0.35; M.at([Math.cos(a) * d, y, Math.sin(a) * d], [0, 0, 0], 1, () => M.lathe(berry, [[0, 0], [0.012, 0.003], [0.015, 0.013], [0.01, 0.024], [0, 0.026]], { n: 7, smooth: true })); }
}
/** a lathed round fruit with a stalk */
function fruitUnit(M: Mesher, skin: MatKey, r: number, seed: number, leaf: boolean) {
  const rnd = new Rnd(seed);
  M.lathe(skin, [[0, 0], [r * 0.5, r * 0.08], [r * 0.92, r * 0.5], [r, r * 0.95], [r * 0.85, r * 1.45], [r * 0.4, r * 1.72], [0, r * 1.62]], { n: 11, smooth: true, jit: 0.04, seed });
  M.at([0, r * 1.6, 0], [rnd.r(-0.3, 0.3), 0, rnd.r(-0.3, 0.3)], 1, () => M.prism(S('fur', 2), { n: 5, r0: r * 0.07, r1: r * 0.05, len: r * 0.45 }));
  if (leaf) M.at([0, r * 1.85, 0], [0, rnd.r(0, PI), -0.6], 1, () => M.card('leaf', [[0, 0], [r * 0.5, -r * 0.25], [r * 1.1, 0], [r * 0.5, r * 0.25]], { back: S('moss', 2), lift: (x) => Math.sin(x / r * 2) * r * 0.1 }));
}
/** a leaf card shaped like a pointed oval along +x */
function leafCard(M: Mesher, mat: MatKey, len: number, w: number, back: MatKey) {
  M.card(mat, [[0, 0], [len * 0.3, -w * 0.5], [len * 0.7, -w * 0.42], [len, 0], [len * 0.7, w * 0.42], [len * 0.3, w * 0.5]], { back, lift: (x, z) => (Math.abs(z) / w) * w * 0.35 - Math.sin((x / len) * PI) * len * 0.06 });
}

// ------------------------------------------------------------------ the forms
const RK = (mat: MatKey, r: number, o: Partial<Form> = {}): Form => ({ unit: (M, v, sd) => stoneUnit(M, mat, r * (0.85 + (v % 3) * 0.12), sd, v), variants: 4, pile: 'chunks', icon: { n: 3 }, sound: 'stone', dust: 'stone', ...o });
const HEAP = (heap: MatKey, clod: (M: Mesher, v: number, sd: number) => void, o: Partial<Form> = {}): Form => ({ unit: clod, variants: 3, pile: 'mound', heap, sound: 'dirt', dust: 'soil', ...o, icon: { n: 3, as: 'pile', ...o.icon } });
const clod = (mat: MatKey, r: number) => (M: Mesher, v: number, sd: number) => M.rock(mat, r * (1 + v * 0.15), r * 0.7, r * 0.9, sd, { n: 11, jag: 0.28, flat: 0.3 });
const pebble = (mats: MatKey[], r: number) => (M: Mesher, v: number, sd: number) => M.rock(mats[v % mats.length], r * (0.8 + (v % 3) * 0.2), r * 0.6, r * 0.8, sd, { n: 10, jag: 0.15, flat: 0.3 });
const VIAL = (content: MatKey, o: Parameters<typeof vial>[2] = {}): Form => ({ unit: (M) => vial(M, content, o), variants: 1, pile: 'rack', icon: { n: 1, pitch: 0.42 }, sound: 'glass', dust: 'snow' });
const POUCH = (body: MatKey, tie?: MatKey): Form => ({ unit: (M, v, sd) => sack(M, body, { seed: sd, tie, h: 0.12 + v * 0.015 }), variants: 2, pile: 'bales', icon: { n: 1 }, sound: 'soft', dust: 'sand' });
const CAN = (build: (M: Mesher, v: number) => void, dust: RampName = 'stone', sound: Sound = 'metal'): Form => ({ unit: (M, v) => build(M, v), variants: 1, pile: 'cans', icon: { n: 1 }, sound, dust });
const PART = (build: (M: Mesher, v: number, sd: number) => void, pile: PileKind = 'packs', o: Partial<Form> = {}): Form => ({ unit: build, variants: 1, pile, icon: { n: 1 }, sound: 'metal', dust: 'stone', ...o });
const INGOT = (mat: MatKey, stamp: MatKey): Form => ({ unit: (M, v, sd) => ingot(M, mat, { seed: sd, stamp: v === 1 ? stamp : undefined, l: 0.2 + (v === 2 ? 0.02 : 0) }), variants: 3, pile: 'stack', icon: { n: 3 }, sound: 'metal', dust: 'stone' });
const ORE = (mat: MatKey, heap: MatKey, r = 0.1, o: Partial<Form> = {}, bit?: MatKey): Form => ({ unit: (M, v, sd) => { stoneUnit(M, mat, r * (0.85 + (v % 3) * 0.1), sd, v === 2 ? 3 : v); if (bit) oreBits(M, bit, r * (0.85 + (v % 3) * 0.1), sd, 2 + v); }, variants: 3, pile: 'mound', heap, icon: { n: 3 }, sound: 'gravel', dust: 'stone', ...o });

export const FORMS: Record<string, Form> = {
  // ---- wood and plants
  wood: { unit: (M, v, sd) => log(M, { len: [0.92, 0.86, 0.8, 0.74][v], r: [0.13, 0.15, 0.115, 0.105][v], seed: sd, stub: v === 1, bark: BARKS[v], bend: [0, 0.02, 0.035, 0.015][v], cut: [0, 0, 0.5, 0.7][v], taper: [0.06, 0.08, 0.1, 0.05][v] }), variants: 4, pile: 'logs', icon: { n: 3, seed: 3 }, sound: 'wood', dust: 'fur' },
  plank: { unit: (M, v, sd) => board(M, { len: v === 2 ? 0.7 : 1, w: 0.15 + (v === 1 ? 0.03 : 0), t: 0.035, seed: sd, face: v === 2 ? 'wood' : 'plank' }), variants: 3, pile: 'boards', icon: { n: 6, as: 'pile', pitch: 0.6, yaw: 1.0 }, sound: 'wood', dust: 'ochre' },
  bark: { unit: (M, v, sd) => { const rnd = new Rnd(sd), a0 = rnd.r(0.7, 0.95), L = 0.32 + v * 0.05, R = 0.16; const pts: THREE.Vector3[] = []; for (const x of [-L / 2, L / 2]) for (let i = 0; i <= 5; i++) { const a = -a0 + (i / 5) * 2 * a0; for (const rr of [R, R - 0.022]) pts.push(new THREE.Vector3(x + rnd.r(-0.02, 0.02), Math.cos(a) * rr - R + 0.03, Math.sin(a) * rr)); } bark2(M, pts, v === 2 ? 'barkPine' : 'bark'); }, variants: 3, pile: 'chunks', icon: { n: 2 }, sound: 'wood', dust: 'fur' },
  leaves: { unit: (M, v, sd) => { const rnd = new Rnd(sd); M.at([-0.12, 0.02, 0], [0, 0, -PI / 2 + 0.08], 1, () => M.prism(S('fur', 2), { n: 5, r0: 0.007, r1: 0.004, len: 0.26 })); for (let i = 0; i < 6 + v; i++) { const t = i / (6 + v); M.at([-0.12 + t * 0.24, 0.025 + rnd.r(0, 0.01), 0], [rnd.r(-0.3, 0.3), (i % 2 ? 1 : -1) * rnd.r(0.6, 1.1), 0], 1, () => leafCard(M, 'leaf', 0.09 + rnd.r(0, 0.03), 0.045, S('moss', 2))); } }, variants: 2, pile: 'mound', heap: 'leafLitter', icon: { n: 1, pitch: 0.9 }, sound: 'soft', dust: 'moss' },
  fibre: { unit: (M, v, sd) => { const r = new Rnd(sd); for (let i = 0; i < 11; i++) { const a = (i / 11) * PI * 2 + r.r(-0.2, 0.2), rr = i < 3 ? 0.012 : 0.03 + r.r(0, 0.012); M.at([-0.15 + r.r(-0.02, 0.02), 0.045 + Math.sin(a) * rr, Math.cos(a) * rr], [r.r(-0.05, 0.05), r.r(-0.05, 0.05), -PI / 2 + r.r(-0.03, 0.03)], 1, () => M.prism(S('straw', [2, 3, 4, 3][i % 4]), { n: 4, r0: 0.015, r1: 0.011, len: 0.3, rings: 2, bend: r.r(-0.02, 0.02), seed: sd + i, tip1: 0.02 })); } for (const x of [-0.05, 0.05]) M.at([x, 0.045, 0], [0, 0, -PI / 2], 1, () => M.prism(S('fur', 2), { n: 9, r0: 0.05, len: 0.022 })); void v; }, variants: 2, pile: 'bales', icon: { n: 3, as: 'heap', pitch: 0.62 }, sound: 'soft', dust: 'straw' },
  resin: { unit: (M, v, sd) => M.rock(S('rust', 3, GL), 0.04 + v * 0.008, 0.032, 0.035, sd, { n: 12, jag: 0.2, flat: 0.3, top: S('ochre', 3, GL) }), variants: 3, pile: 'chunks', icon: { n: 3 }, sound: 'stone', dust: 'ochre' },
  fruit: { unit: (M, v, sd) => fruitUnit(M, v === 1 ? S('plum', 4) : S('coral', 4), 0.04, sd, v !== 2), variants: 3, pile: 'chunks', icon: { n: 3 }, sound: 'soft', dust: 'coral' },
  berries: { unit: (M, v, sd) => punnet(M, S('plum', 3), sd), variants: 1, pile: 'packs', icon: { n: 1 }, sound: 'soft', dust: 'plum' },
  tuber: { unit: (M, v, sd) => M.rock(S('clay', 4), 0.07 + v * 0.01, 0.04, 0.045, sd, { n: 16, jag: 0.12, flat: 0.2 }), variants: 3, pile: 'chunks', icon: { n: 3 }, sound: 'dirt', dust: 'soil' },
  kelp: { unit: (M, v, sd) => { const rnd = new Rnd(sd); for (let i = 0; i < 3; i++) M.at([rnd.r(-0.05, 0.05), 0.01 + i * 0.008, rnd.r(-0.04, 0.04)], [0, rnd.r(-0.5, 0.5), 0], 1, () => leafCard(M, S('teal', 3), 0.36, 0.07, S('teal', 2))); void v; }, variants: 2, pile: 'mound', heap: 'leafLitter', icon: { n: 1, pitch: 0.95 }, sound: 'soft', dust: 'teal' },
  mushroom: { unit: (M, v, sd) => { const rnd = new Rnd(sd); for (let i = 0; i < 3; i++) { const h = 0.05 + rnd.r(0, 0.03), r = 0.03 + rnd.r(0, 0.015), x = (i - 1) * 0.035, z = rnd.r(-0.02, 0.02); M.at([x, 0, z], [rnd.r(-0.2, 0.2), 0, rnd.r(-0.25, 0.25)], 1, () => { M.prism(S('bone', 4), { n: 6, r0: r * 0.3, r1: r * 0.24, len: h }); M.at([0, h * 0.9, 0], [0, 0, 0], 1, () => M.lathe(S('hide', 4), [[r * 0.25, 0], [r, r * 0.1], [r * 0.85, r * 0.6], [0, r * 0.8]], { n: 9, smooth: true })); }); } void v; }, variants: 2, pile: 'chunks', icon: { n: 1 }, sound: 'soft', dust: 'hide' },
  meat: { unit: (M, v, sd) => { M.rock(S('flesh', 3), 0.15, 0.05, 0.1, sd, { n: 14, jag: 0.12, flat: 0.5, top: S('flesh', 4) }); M.at([0.02, 0.035, 0.07], [0, 0, 0], 1, () => M.rock(S('bone', 5), 0.1, 0.02, 0.025, sd + 2, { n: 10, jag: 0.1 })); M.at([0.15, 0.03, 0], [0, 0, PI / 2], 1, () => M.lathe(S('bone', 4), [[0.014, 0], [0.016, 0.04], [0.026, 0.06], [0, 0.065]], { n: 7 })); void v; }, variants: 1, pile: 'stack', icon: { n: 1 }, sound: 'soft', dust: 'flesh' },
  hide: { unit: (M, v, sd) => M.at([-0.2, 0.06, 0], [0, 0, -PI / 2], 1, () => { M.prism('hide', { n: 9, r0: 0.06, len: 0.4, jit: 0.08, seed: sd, cap0: S('hide', 2), cap1: S('hide', 2), smooth: true }); for (const y of [0.1, 0.3]) M.at([0, y, 0], [0, 0, 0], 1, () => M.prism(S('fur', 1), { n: 9, r0: 0.063, len: 0.015, cap0: null, cap1: null })); void v; }), variants: 1, pile: 'logs', icon: { n: 1 }, sound: 'soft', dust: 'hide' },
  bone: { unit: (M, v, sd) => M.at([-0.18, 0.025, 0], [0, 0, -PI / 2], 1, () => M.lathe(S('bone', 4), [[0, 0], [0.025, 0.005], [0.03, 0.03], [0.014, 0.07], [0.012, 0.29], [0.026, 0.33], [0.03, 0.35], [0, 0.36]], { n: 8, smooth: true, jit: 0.06, seed: sd + v })), variants: 2, pile: 'logs', icon: { n: 2 }, sound: 'wood', dust: 'bone' },
  carbon: { unit: (M, v, sd) => { M.at([0, 0.13, 0], [0, 0, 0], 1, () => M.box('straw', 0.42, 0.26, 0.3, 0.025, { jit: 0.08, seed: sd })); for (const x of [-0.11, 0.11]) M.at([x, 0.13, 0], [0, 0, 0], 1, () => M.box(S('fur', 2), 0.014, 0.268, 0.308)); void v; }, variants: 2, pile: 'bales', icon: { n: 1 }, sound: 'soft', dust: 'straw' },
  silk: { unit: (M) => spool(M, S('bone', 5, F_GLOSS), 0.045, 0.075), variants: 1, pile: 'packs', icon: { n: 1 }, sound: 'soft', dust: 'straw' },
  dung: HEAP('dung', clod('dung', 0.05), { dust: 'soil', fine: true }),
  iron_pellet: ORE(S('rust', 3), 'crushed', 0.025, { unit: (M, v, sd) => M.lathe(v % 2 ? S('rust', 3) : S('iron', 3), [[0, 0], [0.014, 0.003], [0.019, 0.013], [0.014, 0.024], [0, 0.027]], { n: 7, jit: 0.12, seed: sd + v }), icon: { n: 7, as: 'heap' } }),
  glass_bead: { unit: (M, v, sd) => M.lathe(S('water', 5, GL), [[0, 0], [0.01, 0.002], [0.014, 0.012], [0.01, 0.022], [0, 0.024]], { n: 8, smooth: true, seed: sd + v }), variants: 1, pile: 'chunks', icon: { n: 5 }, sound: 'glass', dust: 'snow' },
  protein: CAN((M) => { M.lathe((j) => (j === 2 ? S('paper', 4) : j === 3 ? S('flesh', 3) : S('steel', 4, MT)), [[0, 0], [0.05, 0], [0.052, 0.01], [0.052, 0.03], [0.052, 0.075], [0.052, 0.1], [0.052, 0.12], [0.048, 0.125], [0, 0.125]], { n: 12 }); }, 'paper'),
  bio_oil: CAN((M) => drum(M, S('ichor', 3), { band: S('ichor', 1) }), 'ichor'),
  algae_fuel: CAN((M) => drum(M, S('olive', 3), { band: S('ichor', 4) }), 'olive'),
  herbicide: CAN((M) => drum(M, S('olive', 4), { band: S('glowAmber', 3) }), 'olive'),
  // ---- seeds
  seed_grass: { unit: (M, v, sd) => { const rnd = new Rnd(sd); for (let i = 0; i < 9; i++) M.at([-0.15, 0.016 + (i % 3) * 0.01, (Math.floor(i / 3) - 1) * 0.016 + rnd.r(-0.004, 0.004)], [rnd.r(-0.08, 0.08), (Math.floor(i / 3) - 1) * 0.12 + rnd.r(-0.05, 0.05), -PI / 2], 1, () => { M.prism(S('straw', 3), { n: 4, r0: 0.006, len: 0.2 }); M.at([0, 0.2, 0], [0, 0, 0], 1, () => M.prism(S('straw', 5), { n: 6, r0: 0.014, r1: 0.011, len: 0.08, tip1: 0.02, rings: 2, jit: 0.15, seed: sd + i })); }); M.at([-0.06, 0.026, 0], [0, 0, -PI / 2], 1, () => M.prism(S('stampRed', 2), { n: 8, r0: 0.032, len: 0.02 })); void v; }, variants: 1, pile: 'bales', icon: { n: 1 }, sound: 'soft', dust: 'straw' },
  seed_reed: { unit: (M, v, sd) => M.at([-0.15, 0.03, 0], [0, 0, -PI / 2], 1, () => { M.prism(S('sage', 3), { n: 5, r0: 0.007, len: 0.32 }); M.at([0, 0.12, 0], [0, 0, 0], 1, () => M.prism(S('fur', 2), { n: 9, r0: 0.026, len: 0.13, tip0: 0.012, tip1: 0.012, smooth: true, seed: sd + v, rings: 2, jit: 0.06 })); }), variants: 1, pile: 'bales', icon: { n: 2 }, sound: 'soft', dust: 'fur' },
  spore_fern: { unit: (M) => packet(M, S('sage', 3), S('sage', 5)), variants: 1, pile: 'packs', icon: { n: 1, pitch: 0.8 }, sound: 'soft', dust: 'sage' },
  seed_shrub: POUCH(S('plum', 3)),
  seed_tree: { unit: (M, v, sd) => { for (const s of [-1, 1]) M.at([0, 0.012, 0], [0, s > 0 ? 0.35 : PI - 0.35, 0], 1, () => { M.rock(S('fur', 3), 0.016, 0.012, 0.014, sd + s, { n: 12, jag: 0.08 }); M.card(S('ochre', 5), [[0.008, -0.01], [0.04, -0.022], [0.085, -0.016], [0.095, 0.004], [0.05, 0.012], [0.008, 0.01]], { back: S('ochre', 4), lift: (x) => x * 0.12 }); M.at([0.01, 0.0015, -0.004], [0, -0.12, 0], 1, () => M.box(S('fur', 4), 0.08, 0.002, 0.003)); }); void v; }, variants: 1, pile: 'chunks', icon: { n: 1 }, sound: 'soft', dust: 'fur' },
  seed_cone: { unit: (M, v, sd) => M.at([0, 0.035, 0], [0, 0, -PI / 2 + 0.1], 1, () => M.lathe(S('fur', 3), [[0, -0.01], [0.022, 0], [0.034, 0.012], [0.028, 0.02], [0.038, 0.032], [0.03, 0.042], [0.036, 0.055], [0.026, 0.064], [0.028, 0.075], [0.016, 0.085], [0, 0.095]], { n: 9, jit: 0.08, seed: sd + v })), variants: 2, pile: 'chunks', icon: { n: 2 }, sound: 'wood', dust: 'fur' },
  seed_palm: { unit: (M, v, sd) => { M.rock('fibre', 0.06, 0.055, 0.055, sd, { n: 16, jag: 0.08, flat: 0.15 }); M.at([0.045, 0.06, 0], [0, 0, 0.8], 1, () => { for (const z of [-0.012, 0, 0.012]) M.at([0, 0, z], [0, 0, 0], 1, () => M.prism(S('fur', 1), { n: 5, r0: 0.005, len: 0.004 })); }); void v; }, variants: 1, pile: 'chunks', icon: { n: 2 }, sound: 'wood', dust: 'ochre' },
  spore_fungus: VIAL(S('violet', 4)),
  seed_bulb: { unit: (M, v, sd) => { M.lathe(S('clay', 4), [[0, 0], [0.02, 0.003], [0.035, 0.02], [0.033, 0.04], [0.016, 0.06], [0.004, 0.075], [0, 0.078]], { n: 9, smooth: true, jit: 0.06, seed: sd }); M.at([0, 0.072, 0], [0.2, 0, 0.1], 1, () => M.prism(S('moss', 4), { n: 5, r0: 0.004, len: 0.035, tip1: 0.006 })); for (let i = 0; i < 4; i++) M.at([0, 0.004, 0], [0, i * 1.5, 1.3], 1, () => M.prism(S('straw', 4), { n: 3, r0: 0.0015, len: 0.02 })); void v; }, variants: 1, pile: 'chunks', icon: { n: 2 }, sound: 'soft', dust: 'clay' },
  seed_cactus: POUCH(S('sage', 3)),
  seed_crystal: { unit: (M, v, sd) => M.at([0, 0.002, 0], [0.3, 0, 0.4], 1, () => M.crystal(S('amethyst', 4, GL), 0.016, 0.05, { n: 5, tip: 0.02, seed: sd + v, base: 0.5 })), variants: 1, pile: 'chunks', icon: { n: 2 }, sound: 'glass', dust: 'amethyst' },
  seed_flower: POUCH(S('coral', 3)),
  seed_trap: { unit: (M, v, sd) => { M.at([0, 0.025, 0], [0, 0, -PI / 2], 1, () => M.lathe(S('ichor', 3), [[0, -0.04], [0.02, -0.025], [0.026, 0], [0.02, 0.025], [0, 0.04]], { n: 8, smooth: true, seed: sd + v })); for (let i = 0; i < 6; i++) M.at([-0.03 + i * 0.012, 0.045, 0], [0, 0, (i % 2 ? 0.3 : -0.3)], 1, () => M.prism(S('bone', 4), { n: 3, r0: 0.003, len: 0.012, tip1: 0.004 })); }, variants: 1, pile: 'chunks', icon: { n: 2 }, sound: 'soft', dust: 'ichor' },
  // ---- specimens
  tissue: VIAL(S('flesh', 4)),
  blood_sample: VIAL(S('blood', 3), { cap: S('stampRed', 3) }),
  egg: { unit: (M, v, sd) => M.lathe('egg', [[0, 0], [0.025, 0.006], [0.036, 0.03], [0.032, 0.06], [0.018, 0.08], [0, 0.086]], { n: 11, smooth: true, seed: sd + v }), variants: 1, pile: 'rack', icon: { n: 1 }, sound: 'soft', dust: 'bone' },
  embryo: VIAL(S('glowTeal', 2, F_EMIT), { r: 0.02, h: 0.11 }),
  plant_cutting: { unit: (M) => { bottle(M, S('water', 4, GL), { h: 0.12, r: 0.035, fill: 0.6, cork: S('ochre', 4) }); M.at([0, 0.03, 0], [0.1, 0, 0.12], 1, () => M.prism(S('moss', 3), { n: 4, r0: 0.003, len: 0.13 })); M.at([0.005, 0.15, 0], [0, 0.5, -0.4], 1, () => leafCard(M, 'leaf', 0.05, 0.025, S('moss', 2))); M.at([-0.005, 0.13, 0], [0, 2.4, -0.5], 1, () => leafCard(M, 'leaf', 0.045, 0.022, S('moss', 2))); }, variants: 1, pile: 'rack', icon: { n: 1 }, sound: 'glass', dust: 'moss' },
  venom_gland: { unit: (M, v, sd) => { M.lathe(S('ichor', 2), [[0, 0], [0.025, 0.005], [0.034, 0.025], [0.026, 0.05], [0.01, 0.06], [0.008, 0.07]], { n: 9, smooth: true, jit: 0.08, seed: sd + v }); M.at([0, 0.058, 0], [0, 0, 0], 1, () => M.prism(S('bone', 5), { n: 6, r0: 0.01, len: 0.006, cap0: null })); }, variants: 1, pile: 'rack', icon: { n: 1 }, sound: 'soft', dust: 'ichor' },
  // ---- earth
  soil: HEAP('dirt', clod('dirt', 0.06), { fine: true }),
  topsoil: HEAP('topsoil', clod('topsoil', 0.06), { fine: true }),
  clay: HEAP('clay', (M, v, sd) => M.at([0, 0.04, 0], [0, (v - 1) * 0.4, 0], 1, () => M.box('clay', 0.16, 0.08, 0.11, 0.015, { jit: 0.12, seed: sd })), { dust: 'clay' }),
  sand: HEAP('sand', clod('sand', 0.04), { dust: 'sand', sound: 'gravel', fine: true }),
  gravel: HEAP('gravel', pebble(['granite', 'sandstone', 'slate'], 0.03), { dust: 'stone', sound: 'gravel', icon: { n: 4 } }),
  peat: { unit: (M, v, sd) => M.at([0, 0.045, 0], [0, 0, 0], 1, () => M.box('peat', 0.24, 0.09, 0.12, 0.012, { jit: 0.1, seed: sd + v })), variants: 2, pile: 'stack', icon: { n: 3 }, sound: 'dirt', dust: 'soil' },
  compost: HEAP('compost', clod('compost', 0.05), { fine: true }),
  ash: HEAP('ash', clod('ash', 0.04), { dust: 'stone', fine: true }),
  rock_granite: RK('granite', 0.12),
  rock_basalt: RK('basalt', 0.12, { dust: 'basalt' }),
  rock_limestone: RK('limestone', 0.12, { dust: 'bone' }),
  rock_sandstone: RK('sandstone', 0.12, { dust: 'sand' }),
  rock_slate: { unit: (M, v, sd) => M.rock('slate', 0.16 + v * 0.02, 0.022, 0.12, sd, { n: 10, jag: 0.12, flat: 0.1 }), variants: 3, pile: 'boards', icon: { n: 3 }, sound: 'stone', dust: 'slate' },
  rock_obsidian: { unit: (M, v, sd) => { M.at([0, 0, 0], [0, 0, 0.4 + v * 0.2], 1, () => M.crystal('obsidian', 0.05, 0.16, { n: 5, tip: 0.07, seed: sd, base: 1.3 })); }, variants: 3, pile: 'chunks', icon: { n: 3 }, sound: 'glass', dust: 'basalt' },
  // ---- ores and minerals
  ore: ORE('ferrite', 'ferrite', 0.1, { dust: 'rust' }, S('m_iron', 5, MT)),
  copper_ore: ORE('copperOre', 'copperOre', 0.1, { dust: 'stone' }, S('m_cumetal', 5, MT)),
  coal: ORE('coal', 'coal', 0.09, { unit: (M, v, sd) => M.rock('coal', 0.09 + v * 0.01, 0.07, 0.08, sd, { n: 8, jag: 0.25, flat: 0.35 }), dust: 'basalt' }),
  gold_ore: ORE('goldOre', 'goldOre', 0.09, { dust: 'quartz' }, S('m_gold', 6, MT)),
  sulphur: ORE('sulphur', 'sulphur', 0.08, { dust: 'straw', unit: (M, v, sd) => { M.rock('sulphur', 0.08 + v * 0.01, 0.05, 0.07, sd, { n: 13, jag: 0.22, flat: 0.3 }); const r = new Rnd(sd); for (let i = 0; i < 3; i++) point(M, S('straw', 5, F_GLOSS), [r.r(-0.04, 0.04), 0.03, r.r(-0.03, 0.03)], 0.01, 0.035, [r.r(-0.5, 0.5), r.r(-0.5, 0.5)], sd + i, 4); } }),
  crystal: { unit: (M, v, sd) => cluster(M, S('quartz', 5, GL), 'granite', sd, { n: 3 + v }), variants: 3, pile: 'chunks', icon: { n: 1 }, sound: 'glass', dust: 'quartz' },
  lumen_crystal: { unit: (M, v, sd) => cluster(M, S('glowTeal', 3, F_EMIT | GL), 'basalt', sd, { n: 4 + v, sides: 5 }), variants: 2, pile: 'chunks', icon: { n: 1 }, sound: 'glass', dust: 'teal' },
  gravium: { unit: (M, v, sd) => stoneUnit(M, 'gravium', 0.08, sd, v), variants: 3, pile: 'chunks', icon: { n: 3 }, sound: 'stone', dust: 'violet' },
  malachite: { unit: (M, v, sd) => M.rock('malachite', 0.07, 0.05, 0.06, sd + v, { n: 18, jag: 0.1, flat: 0.3 }), variants: 2, pile: 'chunks', icon: { n: 2 }, sound: 'stone', dust: 'malachite' },
  amethyst: { unit: (M, v, sd) => cluster(M, S('amethyst', 4, GL), 'basalt', sd + v, { n: 5, r: 0.055 }), variants: 2, pile: 'chunks', icon: { n: 1 }, sound: 'glass', dust: 'amethyst' },
  ruby: { unit: (M, v, sd) => { const r = new Rnd(sd); for (let i = 0; i < 2; i++) M.at([i * 0.04 - 0.02, 0, r.r(-0.02, 0.02)], [0, r.r(0, PI), 0], 1, () => M.prism(S('ruby', 4, GL), { n: 6, r0: 0.022, len: 0.03, cap1: S('ruby', 5, GL), seed: sd + i })); void v; }, variants: 1, pile: 'chunks', icon: { n: 1 }, sound: 'glass', dust: 'ruby' },
  salt: HEAP('salt', (M, v, sd) => M.at([0, 0.015, 0], [0, v, 0], 1, () => M.box(S('snow', 4), 0.03, 0.03, 0.03, 0.003, { jit: 0.1, seed: sd })), { dust: 'snow', sound: 'gravel', icon: { n: 4 } }),
  saltpetre: RK('saltpetre', 0.06, { dust: 'paper' }),
  crushed_ore: HEAP('crushed', pebble([S('rust', 3), S('iron', 3)], 0.02), { dust: 'rust', sound: 'gravel', icon: { n: 4 } }),
  // ---- fluids
  water: CAN((M) => jerrycan(M, S('steel', 4, MT), S('water', 4)), 'water'),
  brine: CAN((M) => bottle(M, S('teal', 3, GL), { h: 0.32, r: 0.1 }), 'teal', 'glass'),
  sap: CAN((M) => { M.lathe((j) => (j === 1 || j === 4 ? S('steel', 3, MT) : 'wood'), [[0, 0], [0.1, 0], [0.104, 0.03], [0.108, 0.05], [0.115, 0.16], [0.118, 0.18], [0.12, 0.2]], { n: 12 }); M.at([0, 0.17, 0], [0, 0, 0], 1, () => M.prism(S('ochre', 5, F_GLOSS), { n: 12, r0: 0.11, len: 0.004, cap0: null })); }, 'ochre', 'liquid'),
  // ---- refined
  iron_ingot: INGOT('iron', S('steel', 1)),
  copper_ingot: INGOT('copper', S('copper', 2)),
  steel_ingot: INGOT(S('slate', 4, MT), S('slate', 2)),
  gold_ingot: INGOT('gold', S('gold', 2)),
  glass: { unit: (M, v, sd) => { for (let i = 0; i < 3; i++) M.at([i * 0.014, 0.007 + i * 0.016, -i * 0.018], [0, i * 0.05, 0], 1, () => M.box(S('water', 5, GL), 0.3, 0.014, 0.22, 0, { side: S('water', 3, GL) })); void v; void sd; }, variants: 1, pile: 'boards', icon: { n: 1, pitch: 0.62 }, sound: 'glass', dust: 'snow' },
  concrete: { unit: (M, v, sd) => M.at([0, 0.07, 0], [0, 0, 0], 1, () => M.box('concrete', 0.28, 0.14, 0.18, 0.01, { jit: 0.04, seed: sd + v })), variants: 2, pile: 'stack', icon: { n: 3 }, sound: 'stone', dust: 'stone' },
  rubber: { unit: (M, v, sd) => M.at([-0.12, 0.06, 0], [0, 0, -PI / 2], 1, () => { M.prism('rubber', { n: 10, r0: 0.06, len: 0.24, cap0: S('basalt', 3), cap1: S('basalt', 3), smooth: true, seed: sd + v }); }), variants: 1, pile: 'logs', icon: { n: 2 }, sound: 'soft', dust: 'basalt' },
  plastic: { unit: (M, v, sd) => M.at([0, 0.02, 0], [0, 0, 0], 1, () => M.box('bakelite', 0.22, 0.04, 0.16, 0.008, { seed: sd + v })), variants: 1, pile: 'stack', icon: { n: 3 }, sound: 'soft', dust: 'clay' },
  charcoal: { unit: (M, v, sd) => M.at([0, 0.03, 0], [0, (v - 1) * 0.6, 0], 1, () => { const r = new Rnd(sd); const pts: THREE.Vector3[] = []; for (const x of [-0.07, 0.07]) for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; pts.push(new THREE.Vector3(x + r.r(-0.015, 0.015), Math.sin(a) * 0.03, Math.cos(a) * 0.035)); } hullBy(M, pts, (n) => (Math.abs(n.x) > 0.7 ? S('basalt', 2) : 'charcoal')); }), variants: 3, pile: 'mound', heap: 'charcoal', icon: { n: 3 }, sound: 'wood', dust: 'basalt' },
  brick: { unit: (M, v, sd) => M.at([0, 0.035, 0], [0, 0, 0], 1, () => M.box('brick', 0.22, 0.07, 0.105, 0.005, { jit: 0.03, seed: sd + v })), variants: 2, pile: 'stack', icon: { n: 3 }, sound: 'stone', dust: 'clay' },
  feed: { unit: (M, v, sd) => sack(M, 'burlap', { h: 0.3, r: 0.13, seed: sd + v, tie: S('stampRed', 2) }), variants: 2, pile: 'bales', icon: { n: 1 }, sound: 'soft', dust: 'straw' },
  // ---- parts
  iron_plate: PART((M) => { M.at([0, 0.006, 0], [0, 0, 0], 1, () => M.box('steel', 0.3, 0.012, 0.2, 0.002)); for (const [x, z] of [[-0.12, -0.08], [0.12, -0.08], [-0.12, 0.08], [0.12, 0.08]]) M.at([x, 0.0125, z], [0, 0, 0], 1, () => M.prism(S('steel', 1), { n: 6, r0: 0.008, len: 0.001 })); }, 'boards', { icon: { n: 3, as: 'pile', pitch: 0.62 } }),
  iron_rod: PART((M, v, sd) => { const r = new Rnd(sd); const at: [number, number][] = [[-1, 0], [0, 0], [1, 0], [-0.5, 0.87], [0.5, 0.87]]; for (const [zz, yy] of at) M.at([-0.16 + r.r(-0.012, 0.012), 0.016 + yy * 0.031, zz * 0.033], [0, 0, -PI / 2], 1, () => M.prism('steel', { n: 7, r0: 0.016, len: 0.32, cap0: S('steel', 2), cap1: S('steel', 2) })); for (const x of [-0.09, 0.09]) M.at([x, 0.03, 0], [0, 0, 0], 1, () => M.box(S('rust', 3), 0.014, 0.075, 0.105, 0.01)); }, 'logs'),
  screw: PART((M, v, sd) => { const r = new Rnd(sd); for (let i = 0; i < 3; i++) M.at([r.r(-0.004, 0.004), 0.006 + (i === 2 ? 0.009 : 0), (i === 2 ? 0 : i - 0.5) * 0.02], [0, (i - 1) * 0.5 + r.r(-0.1, 0.1), -PI / 2], 1, () => { M.lathe(S('steel', 4, MT), [[0, 0], [0.004, 0.002], [0.0045, 0.005], [0.0035, 0.008], [0.0045, 0.011], [0.0035, 0.014], [0.0045, 0.017], [0.0035, 0.02], [0.004, 0.032], [0, 0.034]], { n: 6 }); M.at([0, 0.032, 0], [0, 0, 0], 1, () => M.prism(S('steel', 5, MT), { n: 6, r0: 0.009, len: 0.006 })); }); }, 'packs'),
  copper_wire: PART((M) => spool(M, 'copper', 0.05, 0.08)),
  cable: PART((M) => { coil(M, S('basalt', 2), 0.07, 0.009, 3, 0.03); M.at([0.07, 0.03, 0], [0, 0, -1.2], 1, () => M.prism(S('copper', 5, MT), { n: 5, r0: 0.004, len: 0.03 })); }),
  steel_beam: PART((M) => { const L = 0.6; M.at([0, 0.006, 0], [0, 0, 0], 1, () => M.box('steel', L, 0.012, 0.09)); M.at([0, 0.06, 0], [0, 0, 0], 1, () => M.box('steel', L, 0.1, 0.012)); M.at([0, 0.114, 0], [0, 0, 0], 1, () => M.box('steel', L, 0.012, 0.09)); }, 'boards'),
  gear: PART((M) => gear(M, 'steel', 0.07, 0.025, 14)),
  reinforced_plate: PART((M) => { M.at([0, 0.008, 0], [0, 0, 0], 1, () => M.box('olive', 0.32, 0.016, 0.22, 0.003)); M.at([0, 0.024, 0], [0, 0, 0], 1, () => M.box('olive', 0.3, 0.016, 0.2, 0.003)); for (const x of [-0.08, 0.08]) M.at([x, 0.034, 0], [0, 0, 0], 1, () => M.box('steel', 0.03, 0.006, 0.23)); for (const x of [-0.08, 0.08]) for (const z of [-0.07, 0.07]) M.at([x, 0.037, z], [0, 0, 0], 1, () => M.prism(S('steel', 5, MT), { n: 6, r0: 0.007, len: 0.005 })); }, 'boards'),
  rotor: PART((M) => M.at([-0.15, 0.05, 0], [0, 0, -PI / 2], 1, () => { M.prism('steel', { n: 8, r0: 0.012, len: 0.3 }); for (let i = 0; i < 8; i++) M.at([0, 0.08 + i * 0.018, 0], [0, i * 0.2, 0], 1, () => M.prism(i % 2 ? 'copper' : S('rust', 3), { n: 10, r0: 0.05, len: 0.015 })); }), 'crates'),
  frame: PART((M) => { const s = 0.3, t = 0.02; for (const y of [t / 2, s - t / 2]) for (const [x, z, w, d] of [[0, -s / 2, s, t], [0, s / 2, s, t], [-s / 2, 0, t, s], [s / 2, 0, t, s]] as [number, number, number, number][]) M.at([x, y, z], [0, 0, 0], 1, () => M.box('steel', w, t, d)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) M.at([sx * s / 2, s / 2, sz * s / 2], [0, 0, 0], 1, () => M.box('steel', t, s, t)); for (const sz of [-1, 1]) M.at([0, s / 2, sz * s / 2], [0, 0, PI / 4], 1, () => M.box(S('steel', 3, MT), s * 1.3, t * 0.6, t * 0.6)); }, 'crates'),
  circuit: PART((M) => { M.at([0, 0.004, 0], [0, 0, 0], 1, () => M.box('board', 0.16, 0.008, 0.11, 0, { top: 'board', side: S('teal', 1) })); for (const [x, z, w, d] of [[-0.03, -0.01, 0.04, 0.03], [0.04, 0.02, 0.025, 0.025], [0.03, -0.03, 0.02, 0.012]] as [number, number, number, number][]) M.at([x, 0.013, z], [0, 0, 0], 1, () => M.box(S('basalt', 1), w, 0.01, d, 0.002)); for (const x of [-0.06, -0.05]) M.at([x, 0.008, 0.035], [0, 0, 0], 1, () => M.prism(S('sapphire', 3), { n: 7, r0: 0.006, len: 0.016, cap1: S('steel', 5) })); }),
  vacuum_tube: PART((M) => { M.prism(S('basalt', 1), { n: 10, r0: 0.024, len: 0.025 }); M.at([0, 0.025, 0], [0, 0, 0], 1, () => M.lathe(S('water', 6, GL), [[0.022, 0], [0.024, 0.04], [0.022, 0.07], [0.012, 0.085], [0, 0.088]], { n: 10, smooth: true })); M.at([0, 0.04, 0], [0, 0, 0], 1, () => M.box(S('glowAmber', 4, F_EMIT), 0.016, 0.03, 0.006)); for (const a of [0, 2.1, 4.2]) M.at([Math.cos(a) * 0.012, -0.012, Math.sin(a) * 0.012], [0, 0, 0], 1, () => M.prism(S('brass', 5, MT), { n: 4, r0: 0.002, len: 0.012 })); }, 'packs'),
  motor: PART((M) => { M.at([-0.12, 0.09, 0], [0, 0, -PI / 2], 1, () => { M.prism('olive', { n: 12, r0: 0.08, len: 0.22, smooth: true, cap0: S('steel', 3), cap1: S('steel', 3) }); for (let i = 0; i < 5; i++) M.at([0, 0.03 + i * 0.04, 0], [0, 0, 0], 1, () => M.prism(S('olive', 2), { n: 12, r0: 0.085, len: 0.012, cap0: null, cap1: null })); M.at([0, 0.22, 0], [0, 0, 0], 1, () => M.prism(S('steel', 5, MT), { n: 8, r0: 0.012, len: 0.06 })); }); M.at([0, 0.008, 0], [0, 0, 0], 1, () => M.box(S('steel', 2), 0.2, 0.016, 0.16)); M.at([0, 0.17, 0], [0, 0, 0], 1, () => M.box(S('olive', 2), 0.06, 0.04, 0.05, 0.004)); }, 'crates'),
  ammo: PART((M, v, sd) => { for (let i = 0; i < 3; i++) M.at([(i - 1) * 0.006, 0.007, (i - 1) * 0.016], [0, 0, -PI / 2], 1, () => M.at([0, -0.03, 0], [0, 0, 0], 1, () => { M.lathe(S('brass', 4, MT), [[0, 0], [0.007, 0], [0.007, 0.042], [0.005, 0.048]], { n: 8 }); M.at([0, 0.046, 0], [0, 0, 0], 1, () => M.lathe(S('copper', 4, MT), [[0.005, 0], [0.005, 0.01], [0.002, 0.02], [0, 0.022]], { n: 8, smooth: true })); })); void v; void sd; }),
  servo: PART((M) => { M.at([0, 0.045, 0], [0, 0, 0], 1, () => M.box('olive', 0.12, 0.09, 0.07, 0.006)); M.at([0.03, 0.09, 0], [0, 0, 0], 1, () => M.prism(S('steel', 3, MT), { n: 10, r0: 0.02, len: 0.012 })); M.at([0.03, 0.102, 0], [0, 0.4, 0], 1, () => M.box(S('steel', 5, MT), 0.08, 0.008, 0.016, 0.003)); M.at([-0.06, 0.03, 0], [0, 0, PI / 2], 1, () => M.prism(S('stampRed', 3), { n: 5, r0: 0.004, len: 0.04 })); }, 'crates'),
  control_unit: PART((M) => { M.at([0, 0.07, 0], [0, 0, 0], 1, () => M.box('olive', 0.22, 0.14, 0.14, 0.008)); M.at([-0.04, 0.08, 0.071], [0, 0, 0], 1, () => M.box(S('glowTeal', 2, F_EMIT), 0.09, 0.06, 0.003)); for (const [x, y] of [[0.06, 0.1], [0.06, 0.05]]) M.at([x, y, 0.07], [PI / 2, 0, 0], 1, () => M.prism(S('basalt', 1), { n: 8, r0: 0.013, len: 0.014, cap1: S('brass', 5, MT) })); M.at([-0.04, 0.03, 0.071], [0, 0, 0], 1, () => M.box(S('stampRed', 3), 0.02, 0.012, 0.004)); }, 'crates'),
  heavy_frame: PART((M) => { const s = 0.36, t = 0.03; for (const y of [t / 2, s - t / 2]) for (const [x, z, w, d] of [[0, -s / 2, s, t], [0, s / 2, s, t], [-s / 2, 0, t, s], [s / 2, 0, t, s]] as [number, number, number, number][]) M.at([x, y, z], [0, 0, 0], 1, () => M.box(S('slate', 3, MT), w, t, d)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) M.at([sx * s / 2, s / 2, sz * s / 2], [0, 0, 0], 1, () => M.box(S('slate', 3, MT), t, s, t)); M.at([0, 0.08, 0], [0, 0, 0], 1, () => M.box('concrete', s * 0.8, 0.12, s * 0.8, 0.01)); for (const sz of [-1, 1]) M.at([0, 0.03, sz * (s / 2 + 0.002)], [0, 0, 0], 1, () => M.box(S('glowAmber', 3), s * 0.9, 0.025, 0.004)); }, 'crates'),
  reactor_core: PART((M) => { M.prism(S('steel', 3, MT), { n: 10, r0: 0.07, len: 0.04 }); M.at([0, 0.04, 0], [0, 0, 0], 1, () => M.prism(S('glowTeal', 3, F_EMIT), { n: 10, r0: 0.055, len: 0.22, smooth: true })); for (let i = 0; i < 4; i++) M.at([0, 0.06 + i * 0.055, 0], [0, 0, 0], 1, () => M.prism(S('steel', 4, MT), { n: 10, r0: 0.06, len: 0.012, cap0: null, cap1: null })); M.at([0, 0.26, 0], [0, 0, 0], 1, () => M.prism(S('steel', 3, MT), { n: 10, r0: 0.07, len: 0.04, cap1: S('glowAmber', 3) })); }, 'crates'),
  report: PART((M) => { for (let i = 0; i < 3; i++) M.at([i * 0.004, 0.002 + i * 0.003, i * 0.005], [0, (i - 1) * 0.06, 0], 1, () => M.box('paper', 0.21, 0.003, 0.29)); M.at([0.02, 0.012, -0.145], [0, 0, 0], 1, () => M.box(S('steel', 5, MT), 0.04, 0.006, 0.03)); for (let k = 0; k < 4; k++) M.at([-0.02, 0.0115, -0.08 + k * 0.03], [0, 0, 0], 1, () => M.box(S('ink', 1), 0.12 - (k % 2) * 0.03, 0.0005, 0.006)); }, 'stack'),
  tape: PART((M) => { M.prism(S('steel', 4, MT), { n: 12, r0: 0.08, len: 0.006 }); M.at([0, 0.006, 0], [0, 0, 0], 1, () => M.prism(S('basalt', 1, F_GLOSS), { n: 14, r0: 0.065, len: 0.016, smooth: true, cap1: S('basalt', 2, F_GLOSS) })); M.at([0, 0.022, 0], [0, 0, 0], 1, () => M.prism(S('steel', 4, MT), { n: 12, r0: 0.08, len: 0.006, cap1: S('steel', 5, MT) })); M.at([0, 0.028, 0], [0, 0, 0], 1, () => M.prism(S('steel', 1), { n: 8, r0: 0.015, len: 0.001 })); }),
  // ---- the geology's items
  acid: CAN((M) => { bottle(M, S('straw', 4, GL), { h: 0.24, r: 0.08, cork: S('basalt', 2) }); M.at([0, 0.1, 0.081], [0, 0, 0], 1, () => M.box(S('glowAmber', 3), 0.06, 0.05, 0.002)); }, 'straw', 'glass'),
  powder: CAN((M) => { M.lathe((j) => (j === 1 || j === 5 ? S('steel', 2, MT) : 'wood'), [[0, 0], [0.1, 0], [0.11, 0.04], [0.115, 0.06], [0.12, 0.13], [0.115, 0.2], [0.11, 0.22], [0.1, 0.26], [0, 0.26]], { n: 12 }); M.at([0, 0.26, 0], [0.3, 0, 0.2], 1, () => M.prism(S('straw', 3), { n: 4, r0: 0.004, len: 0.06 })); }, 'basalt', 'wood'),
  gold_leaf: PART((M) => { M.at([0, 0.002, 0], [0, 0, 0], 1, () => M.box(S('paper', 2), 0.12, 0.004, 0.08)); for (let i = 0; i < 6; i++) M.at([-0.045 + i * 0.018, 0.0045, 0], [0, 0, 0], 1, () => M.box('gold', 0.012, 0.002, 0.05, 0.001)); }),
  lumen_lens: PART((M) => { M.lathe(S('brass', 4, MT), [[0.04, 0], [0.05, 0], [0.05, 0.018], [0.04, 0.018], [0.04, 0]], { n: 12 }); M.at([0, 0.002, 0], [0, 0, 0], 1, () => M.lathe(S('glowTeal', 3, F_EMIT | GL), [[0, 0], [0.04, 0], [0.04, 0.012], [0.02, 0.02], [0, 0.022]], { n: 12, smooth: true })); }),
  grav_plate: PART((M) => { M.at([0, 0.008, 0], [0, 0, 0], 1, () => M.box('steel', 0.3, 0.016, 0.16, 0.003)); for (const z of [-0.04, 0, 0.04]) M.at([0, 0.0165, z], [0, 0, 0], 1, () => M.box(S('amethyst', 5, F_EMIT), 0.25, 0.002, 0.01)); }, 'boards'),
  precision_circuit: PART((M) => { M.at([0, 0.004, 0], [0, 0, 0], 1, () => M.box('board', 0.16, 0.008, 0.11, 0, { top: 'board', side: S('teal', 1) })); M.at([0, 0.013, 0], [0, 0, 0], 1, () => M.box(S('basalt', 1), 0.05, 0.01, 0.05, 0.002)); for (let i = 0; i < 8; i++) M.at([-0.07 + i * 0.02, 0.0085, 0.05], [0, 0, 0], 1, () => M.box('gold', 0.012, 0.001, 0.012)); }),
  lumen_cell: PART((M) => { M.prism(S('steel', 3, MT), { n: 8, r0: 0.05, len: 0.03 }); M.at([0, 0.03, 0], [0, 0, 0], 1, () => M.prism(S('water', 5, GL), { n: 8, r0: 0.045, len: 0.1, cap0: null, cap1: null })); M.at([0, 0.035, 0], [0, 0, 0], 1, () => M.crystal(S('glowTeal', 4, F_EMIT), 0.022, 0.08, { n: 5 })); M.at([0, 0.13, 0], [0, 0, 0], 1, () => M.prism(S('steel', 3, MT), { n: 8, r0: 0.05, len: 0.03, cap1: S('brass', 4, MT) })); }, 'crates'),
  grav_coil: PART((M) => { M.prism(S('violet', 2), { n: 10, r0: 0.03, len: 0.2, cap1: S('amethyst', 5, F_EMIT) }); coil(M, 'copper', 0.042, 0.008, 6, 0.16); }, 'crates'),
};
function bark2(M: Mesher, pts: THREE.Vector3[], bark: MatKey) { hullBy(M, pts, (n) => (n.y > 0.55 ? bark : n.y < -0.55 ? 'wood' : S('m_bark', 1))); }
/** a fallback for items without a form: a small shipping crate */
export const CRATE_FORM: Form = { unit: (M) => crateBox(M, 0.24, 0.18, 0.2, false), variants: 1, pile: 'crates', icon: { n: 1 }, sound: 'wood', dust: 'ochre' };
export function formOf(id: string): Form { return FORMS[id] ?? CRATE_FORM; }
