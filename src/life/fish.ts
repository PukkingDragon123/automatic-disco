// Sea life for the ocean (src/ocean/*): eight alien kinds built from the anatomy library (src/life/anatomy): a cage
// body (fusiform, compressed, flattened into a disc or drawn out into a ribbon) with a jaw line, gill covers and eye
// sockets; rayed fins whose membranes thin to a translucent, scalloped rim (dithered alpha, pixel style); wet eyes;
// and each kind's own alien parts: doubled fin pairs, a third eye, stalked eyes, frilled gill fans, armour plates,
// lures, barbels, and photophores that glow (an emissive path in the material, brighter at night and in the deep).
// Painted on a small page in the master palette: drawn scale rows with lit edges, counter-shading, lateral lines,
// bars, spots, scars and barnacles. Swims by a vertex wave in the shader, no bones: side-to-side for fish,
// up-and-down for the whale-kind, rippling wings for the ray, a pulsing bell for the jelly; with an InstancedMesh each
// instance's position shifts the wave's phase, so a school never moves in step.
//   const m = buildFish('baitfish', seed);  new THREE.InstancedMesh(m.geo, m.mat, 200) or new THREE.Mesh(m.geo, m.mat)
//   each frame: m.uniforms.uTime.value = t; m.uniforms.uSwim.value = 0..1 effort.  Fish face +z; m.length in metres.
//   FISH_GLOW.sea.value = the sea surface's world y (photophores brighten with depth below it).
import * as THREE from 'three';
import { snapRGBA, type RampName } from '../art/palette';
import { gbuf } from '../gfx/gbuf';
import { daylight } from '../game/daylight';
import type { V3 } from './kit';
import { newCM, tube } from './cage';
import { Body, type Piece, type Chart } from './anatomy/core';
import { trunk, type Station } from './anatomy/trunk';
import { fin, stalk, bulbs, curve, sac } from './anatomy/append';
import { shell } from './anatomy/armour';
import { eyeball } from './anatomy/head';
import { Px, RP, h3, cl } from './anatomy/paint';
import { paintLook, type Look } from './anatomy/look';

export type FishKind = 'baitfish' | 'reeffish' | 'shark' | 'ray' | 'jelly' | 'eel' | 'armourfish' | 'leviathan';
export const FISH_KINDS: FishKind[] = ['baitfish', 'reeffish', 'shark', 'ray', 'jelly', 'eel', 'armourfish', 'leviathan'];
export interface FishModel { kind: FishKind; geo: THREE.BufferGeometry; mat: THREE.Material; length: number; uniforms: { uTime: { value: number }; uSwim: { value: number } } }
/** shared glow controls: night comes from the day cycle; set `sea` to the sea surface's world y for depth glow */
export const FISH_GLOW = { night: { get value() { return 1 - daylight.k; } }, sea: { value: -1e4 } };

type Paint = (c: Chart, p: Piece, b: Body) => void;
const W1: () => [number, number] = () => [0, 1];
/** texel alpha codes the fish shader reads: membranes are dithered below 0.88, photophores glow in 230..247 */
const A_GLOW = 238;

interface Kit { L: number; body: Body; seed: number }
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** a fish body from stations along z (tail -z to snout +z): [z (x L), y centre (x L), half width, half height (x L), profile] */
function fishBody(k: Kit, st: [number, number, number, number, string | number[][]][], paint: Paint, o: { levels?: number; tween?: number; cols?: { j: number; a: number; b: number; s: number; ink?: boolean }[]; rings?: { at: number; s: number; ink?: boolean }[] } = {}) {
  const L = k.L;
  const stations: Station[] = st.map(([z, y, w, h, p]) => ({ c: [0, y * L, z * L], s: [Math.max(0.0005, w * L), Math.max(0.0005, h * L)], p }));
  return k.body.add(trunk({ name: 'body', stations, tween: o.tween ?? 0, capS: true, capE: true, levels: o.levels ?? 1, skin: W1, paint, cols: o.cols, rings: o.rings, k: 1.2 }));
}
/** a rayed fin from a base line: rays fan between two directions; `side` the fin's normal */
function rayFin(k: Kit, name: string, a: V3, b: V3, dA: V3, dB: V3, lens: number[], side: V3, paint: Paint, o: { th?: number; scallop?: number; droop?: number } = {}) {
  const n = lens.length, roots: V3[] = [], dirs: V3[] = [], sides: V3[] = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1); roots.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); dirs.push(nrm([dA[0] + (dB[0] - dA[0]) * t, dA[1] + (dB[1] - dA[1]) * t, dA[2] + (dB[2] - dA[2]) * t])); sides.push(side); }
  const th = (o.th ?? 0.012) * k.L;
  const f = k.body.add(fin({ name, roots, dirs, lens: lens.map((l) => l * k.L), side: sides, ray: th, web: th * 0.45, scallop: o.scallop ?? 0.16, steps: 3, droop: o.droop, levels: 0, skin: () => [0, 1], paint }));
  f.cut = true;
  return f;
}
/** paint a fin: rays dark and lit, the membrane between thinning to a translucent scalloped rim */
function finPaint(ramp: RampName, step: number, o: { rays?: number; alpha?: number; tip?: RampName; spots?: RampName; glowTip?: boolean } = {}): Paint {
  return (ch, _p, b) => {
    const px = new Px(ch, b), R = RP(ramp), T = RP(o.tip ?? ramp), n = o.rays ?? 6, cols = 4 * n - 2;
    px.lightK = 0.6;
    px.base((i, x, y) => {
      const u = (x + 0.5) / px.w, v = (y + 0.5) / px.h, c = u * cols, d = Math.abs(c / 2 - Math.round(c / 2)) * 2; // 0 on a ray .. 1 mid-web
      const ray = d < 0.28;
      px.put(i, v > 0.72 ? T : R, step + (ray ? (d < 0.12 ? 1 : -1) : 0) + (v < 0.15 ? -0.5 : 0));
      if (!ray) px.alpha[i] = Math.round(cl(255 - v * (255 - (o.alpha ?? 120)) * 1.15, o.alpha ?? 120, 250));
      if (o.spots && !ray && h3(Math.floor(c * 1.5), Math.floor(v * 7), 3) < 0.18 && v > 0.2 && v < 0.75) px.put(i, RP(o.spots), 3);
      if (o.glowTip && v > 0.9 && ray) { px.put(i, RP('glowTeal'), 3); px.alpha[i] = A_GLOW; }
      if (v > 0.965) px.put(i, R, 0); // the rim's dark edge
    });
    px.flush();
  };
}
/** eyes at (x, y, z) x L, both sides (or one median eye when x = 0) */
function eyes(k: Kit, at: V3, r: number, iris: RampName, pupil: 'slit' | 'bar' | 'round' | 'w' | 'pin' = 'round', fwd = 0.25) {
  for (const s of at[0] ? [-1, 1] : [1]) {
    const c: V3 = [s * at[0] * k.L, at[1] * k.L, at[2] * k.L];
    k.body.add(eyeball({ name: 'eye' + s + at[2], c, ax: nrm([at[0] ? s : 0, at[0] ? 0.1 : 1, fwd]), r: r * k.L, bone: 0, iris: RP(iris), pupil, irisA: 0.75, levels: 0, around: 10 }));
  }
}
/** scaled skin: counter-shaded back and belly, drawn scale rows, a lateral line, the gill cover's edge, marks */
function skinPaint(o: { back: [RampName, number]; belly: [RampName, number]; scale: number; kind?: 'shield' | 'pebble' | 'scute' | 'keel'; marks?: (px: Px, P: Float32Array, N: Float32Array, i: number) => void; photo?: (P: Float32Array, N: Float32Array, i: number) => boolean; photoRamp?: RampName; gill?: number; gills?: number; L: number; noScales?: boolean; pebbles?: number }): Paint {
  return (ch, _p, b) => {
    const px = new Px(ch, b), P = px.gb.P, N = px.gb.N, L = o.L;
    const look: Look = { ramp: o.back[0], step: o.back[1], belly: { ramp: o.belly[0], step: o.belly[1], below: -0.15 }, creases: 0.8, scales: o.noScales ? undefined : { size: o.scale * L, kind: o.kind ?? 'shield', flow: -1, ink: 1.6, lit: 1, shade: 0.8 }, pebbles: o.pebbles ? { size: o.pebbles * L, depth: 0.8 } : undefined, glints: { size: o.scale * L * 2, every: 0.35 } };
    paintLook(px, look);
    for (let i = 0; i < px.n; i++) {
      const z = P[i * 3 + 2] / L, y = P[i * 3 + 1] / L, ny = N[i * 3 + 1];
      // the lateral line: a row of dark pores along the flank
      if (Math.abs(ny) < 0.12 && Math.abs(ny) > 0.0 && z < 0.3 && z > -0.42 && (Math.floor(z * 60) & 1)) px.mark[i] -= 0.9;
      // the gill cover's edge and the slits behind it
      if (o.gill !== undefined && Math.abs(z - o.gill + y * 0.3) < 0.006 && ny > -0.6 && Math.abs(N[i * 3]) > 0.3) px.mark[i] -= 2;
      for (let g = 0; g < (o.gills ?? 0); g++) if (Math.abs(z - (o.gill ?? 0) + 0.035 + g * 0.022 + y * 0.25) < 0.004 && Math.abs(N[i * 3]) > 0.5) px.mark[i] -= 2.2;
      o.marks?.(px, P, N, i);
      if (o.photo?.(P, N, i)) { px.put(i, RP(o.photoRamp ?? 'glowTeal'), 3 + (h3(i, 1, 0) > 0.5 ? 1 : 0)); px.mark[i] = 0; px.alpha[i] = A_GLOW; }
    }
    px.flush();
  };
}
const solid = (ramp: RampName, step: number, o: Partial<Look> = {}): Paint => (ch, _p, b) => { const px = new Px(ch, b); paintLook(px, { ramp, step, creases: 0.7, ...o }); px.flush(); };
const glowPaint = (ramp: RampName = 'glowTeal'): Paint => (ch, _p, b) => { const px = new Px(ch, b); px.lightK = 0.2; px.base((i) => { px.put(i, RP(ramp), 3); px.alpha[i] = A_GLOW; }); px.flush(); };

// ===================================================================================================== the kinds
const BUILD: Record<FishKind, (k: Kit) => { wave: 'side' | 'vert' | 'wing' | 'eel' | 'jelly' }> = {
  /** GLASSFIN SPRAT: a slim silver-teal sprat with two dorsal fins, two pairs of pectoral wings, a forked tail and a
   *  row of blue photophores down the belly that flash in the school */
  baitfish: (k) => {
    const L = k.L;
    fishBody(k, [[-0.5, 0, 0.012, 0.02, 'ridge'], [-0.4, 0, 0.03, 0.05, 'ridge'], [-0.2, 0.005, 0.055, 0.1, 'round'], [0.02, 0.008, 0.07, 0.125, 'round'], [0.22, 0.004, 0.065, 0.11, 'round'], [0.36, 0, 0.05, 0.08, 'round'], [0.47, -0.008, 0.026, 0.045, 'round']],
      skinPaint({ L, back: ['teal', 3], belly: ['snow', 4], scale: 0.035, gill: 0.3, gills: 0, photo: (P, N, i) => N[i * 3 + 1] < -0.55 && Math.abs((P[i * 3 + 2] / L * 30) % 1) < 0.18 && P[i * 3 + 2] / L > -0.35 && P[i * 3 + 2] / L < 0.25,
        marks: (px, P, N, i) => { if (Math.abs(N[i * 3 + 1] - 0.05) < 0.12) px.mark[i] += 1.2; /* the mirror stripe */ } }));
    const fp = finPaint('teal', 3, { rays: 6, alpha: 110, tip: 'snow' });
    rayFin(k, 'tailU', [0, 0.004 * L, -0.46 * L], [0, 0.02 * L, -0.4 * L], [0, 0.8, -1], [0, 0.25, -1], [0.24, 0.22, 0.17, 0.12, 0.08, 0.05], [1, 0, 0], fp);
    rayFin(k, 'tailD', [0, -0.004 * L, -0.46 * L], [0, -0.02 * L, -0.4 * L], [0, -0.8, -1], [0, -0.25, -1], [0.24, 0.22, 0.17, 0.12, 0.08, 0.05], [1, 0, 0], fp);
    rayFin(k, 'dors1', [0, 0.11 * L, 0.12 * L], [0, 0.12 * L, -0.02 * L], [0, 1, -0.5], [0, 0.7, -1], [0.13, 0.12, 0.09, 0.06, 0.04], [1, 0, 0], fp);
    rayFin(k, 'dors2', [0, 0.085 * L, -0.12 * L], [0, 0.06 * L, -0.24 * L], [0, 1, -0.8], [0, 0.6, -1], [0.08, 0.07, 0.05, 0.03], [1, 0, 0], fp);
    for (const s of [-1, 1]) for (const [z, y, len] of [[0.22, -0.02, 0.16], [0.08, -0.06, 0.11]]) rayFin(k, 'pec' + s + z, [s * 0.05 * L, y * L, z * L], [s * 0.055 * L, (y - 0.02) * L, (z - 0.04) * L], [s * 0.7, -0.3, -0.7], [s * 0.4, -0.5, -1], [len, len * 0.85, len * 0.6, len * 0.4], [0, 1, 0], fp);
    eyes(k, [0.045, 0.03, 0.36], 0.032, 'snow', 'round');
    return { wave: 'side' };
  },
  /** FRILLBACK: a deep coral reef fish with a tall rayed sail, a frilled gill fan behind each cheek, teal bars and
   *  spots, and a third, median eye on the brow */
  reeffish: (k) => {
    const L = k.L;
    fishBody(k, [[-0.5, 0, 0.015, 0.04, 'ridge'], [-0.38, 0, 0.035, 0.11, 'ridge'], [-0.18, 0.01, 0.07, 0.25, 'round'], [0.02, 0.02, 0.09, 0.31, 'round'], [0.2, 0.01, 0.085, 0.26, 'round'], [0.34, -0.01, 0.065, 0.17, 'round'], [0.46, -0.03, 0.03, 0.07, 'round']],
      skinPaint({ L, back: ['coral', 4], belly: ['bone', 4], scale: 0.05, gill: 0.28, marks: (px, P, N, i) => { const z = P[i * 3 + 2] / L; if (Math.abs(((z + 0.6) * 4.5) % 1 - 0.5) < 0.09 && N[i * 3 + 1] > -0.5) { px.put(i, RP('teal'), 3); } if (h3(Math.floor(P[i * 3 + 2] / L * 40), Math.floor(P[i * 3 + 1] / L * 40), 5) < 0.06) px.put(i, RP('teal'), 4); } }));
    const fp = finPaint('coral', 3, { rays: 8, alpha: 120, tip: 'teal', spots: 'teal' });
    rayFin(k, 'sail', [0, 0.31 * L, 0.14 * L], [0, 0.18 * L, -0.34 * L], [0, 1, 0.1], [0, 0.6, -1], [0.34, 0.38, 0.36, 0.3, 0.24, 0.17, 0.11, 0.06], [1, 0, 0], fp, { droop: 0.15 });
    rayFin(k, 'anal', [0, -0.26 * L, -0.02 * L], [0, -0.14 * L, -0.34 * L], [0, -1, -0.1], [0, -0.6, -1], [0.2, 0.22, 0.2, 0.15, 0.1, 0.06], [1, 0, 0], fp);
    rayFin(k, 'tail', [0, 0.04 * L, -0.47 * L], [0, -0.04 * L, -0.47 * L], [0, 0.6, -1], [0, -0.6, -1], [0.18, 0.21, 0.22, 0.21, 0.18], [1, 0, 0], fp, { scallop: 0.25 });
    const gp = finPaint('teal', 3, { rays: 7, alpha: 140, tip: 'coral' });
    for (const s of [-1, 1]) {
      rayFin(k, 'gillfan' + s, [s * 0.07 * L, 0.12 * L, 0.27 * L], [s * 0.07 * L, -0.12 * L, 0.26 * L], [s * 0.6, 0.8, -0.5], [s * 0.6, -0.8, -0.5], [0.1, 0.14, 0.16, 0.16, 0.14, 0.1, 0.07], [0, 0, 1], gp, { scallop: 0.3 });
      rayFin(k, 'pec' + s, [s * 0.085 * L, -0.02 * L, 0.18 * L], [s * 0.09 * L, -0.08 * L, 0.14 * L], [s * 0.8, 0, -0.6], [s * 0.5, -0.5, -0.8], [0.14, 0.13, 0.1, 0.07], [0, 1, 0], fp);
    }
    eyes(k, [0.06, 0.08, 0.34], 0.045, 'brass', 'round');
    eyes(k, [0, 0.21, 0.27], 0.03, 'glowTeal', 'pin', 0.6);
    return { wave: 'side' };
  },
  /** FOUR-EYED HOOKJAW: a slate predator with two pairs of eyes, seven gill slits, a hooked tall tail, two pairs of
   *  pectorals, and a glowing lateral line it signals with in the dark */
  shark: (k) => {
    const L = k.L;
    fishBody(k, [[-0.5, 0.01, 0.01, 0.018, 'ridge'], [-0.4, 0, 0.025, 0.04, 'ridge'], [-0.22, 0, 0.06, 0.08, 'ridge'], [0.0, 0, 0.1, 0.115, 'round'], [0.18, 0, 0.1, 0.11, 'round'], [0.32, 0, 0.08, 0.08, 'flat'], [0.43, -0.005, 0.05, 0.045, 'flat'], [0.5, -0.01, 0.02, 0.02, 'round']],
      skinPaint({ L, back: ['slate', 3], belly: ['snow', 3], scale: 0.012, kind: 'pebble', gill: 0.3, gills: 7, photo: (P, N, i) => Math.abs(N[i * 3 + 1] - 0.0) < 0.07 && Math.abs((P[i * 3 + 2] / L * 45) % 1) < 0.3 && P[i * 3 + 2] / L > -0.35 && P[i * 3 + 2] / L < 0.2,
        marks: (px, P, N, i) => { const z = P[i * 3 + 2] / L; if (z > 0.38 && N[i * 3 + 1] < -0.2 && N[i * 3 + 1] > -0.7 && Math.abs(N[i * 3]) > 0.4 && Math.floor(z * 120) % 2 === 0) { px.put(i, RP('bone'), 4); } } }));
    const fp = finPaint('slate', 3, { rays: 5, alpha: 160, tip: 'ink' });
    rayFin(k, 'dors', [0, 0.11 * L, 0.06 * L], [0, 0.09 * L, -0.08 * L], [0, 1, -0.3], [0, 0.4, -1], [0.17, 0.16, 0.12, 0.07, 0.04], [1, 0, 0], fp, { scallop: 0.05 });
    rayFin(k, 'dors2', [0, 0.05 * L, -0.26 * L], [0, 0.04 * L, -0.32 * L], [0, 1, -0.5], [0, 0.5, -1], [0.06, 0.05, 0.03], [1, 0, 0], fp);
    rayFin(k, 'tail', [0, 0.02 * L, -0.48 * L], [0, -0.01 * L, -0.46 * L], [0, 0.85, -0.6], [0, -0.7, -0.6], [0.26, 0.22, 0.14, 0.12, 0.14], [1, 0, 0], fp, { scallop: 0.05 });
    for (const s of [-1, 1]) for (const [z, len] of [[0.2, 0.2], [0.02, 0.12]]) rayFin(k, 'pec' + s + z, [s * 0.09 * L, -0.06 * L, z * L], [s * 0.08 * L, -0.07 * L, (z - 0.08) * L], [s * 1, -0.35, -0.3], [s * 0.6, -0.4, -1], [len, len * 0.8, len * 0.5, len * 0.3], [0, 1, 0], fp, { scallop: 0.05 });
    eyes(k, [0.06, 0.035, 0.4], 0.016, 'ochre', 'slit');
    eyes(k, [0.075, 0.02, 0.33], 0.012, 'ochre', 'slit');
    return { wave: 'side' };
  },
  /** VEIL RAY: a broad disc with rippling wing margins, eyes on short stalks, a spotted back, a whip tail ending in a
   *  glowing lure */
  ray: (k) => {
    const L = k.L, V = (deg: number, r: number, y: number): number[] => [Math.sin((deg * Math.PI) / 180) * r, y];
    void V;
    fishBody(k, [[-0.3, 0, 0.03, 0.02, 'flat'], [-0.18, 0, 0.3, 0.045, 'flat'], [-0.02, 0, 0.5, 0.06, 'flat'], [0.14, 0, 0.48, 0.055, 'flat'], [0.3, 0, 0.3, 0.045, 'flat'], [0.42, 0, 0.1, 0.03, 'flat'], [0.48, 0, 0.03, 0.015, 'flat']],
      skinPaint({ L, back: ['sand', 3], belly: ['bone', 5], scale: 0.03, kind: 'pebble', noScales: true, pebbles: 0.02, marks: (px, P, N, i) => { if (N[i * 3 + 1] > 0.3 && h3(Math.floor(P[i * 3] / L * 18), Math.floor(P[i * 3 + 2] / L * 18), 9) < 0.22) { const dx = (P[i * 3] / L * 18) % 1, dz = (P[i * 3 + 2] / L * 18) % 1; if (Math.hypot(dx - 0.5, dz - 0.5) < 0.3) px.put(i, RP('soil'), 2); } } }), { tween: 1 });
    // the whip tail and its lure
    const tail = curve([[0, 0, -0.26 * L], [0, 0.01 * L, -0.6 * L], [0, 0.03 * L, -0.95 * L]], 6);
    k.body.add(stalk({ name: 'whip', path: tail, r: (t) => L * 0.014 * (1 - t * 0.85), around: 5, levels: 0, skin: W1, paint: solid('sand', 2) }));
    k.body.add(bulbs({ name: 'lure', seats: [{ p: tail[tail.length - 1], n: [0, 0, -1], r: L * 0.018 }], skin: W1, paint: glowPaint('glowAmber'), levels: 1 }));
    for (const s of [-1, 1]) {
      const b0: V3 = [s * 0.06 * L, 0.03 * L, 0.3 * L], st = curve([b0, [s * 0.075 * L, 0.07 * L, 0.32 * L], [s * 0.09 * L, 0.1 * L, 0.34 * L]], 4);
      k.body.add(stalk({ name: 'stalk' + s, path: st, r: () => L * 0.012, around: 5, levels: 0, skin: W1, paint: solid('sand', 3) }));
      k.body.add(eyeball({ name: 'eye' + s, c: st[st.length - 1], ax: [s * 0.4, 0.5, 0.7], r: L * 0.018, bone: 0, iris: RP('ochre'), pupil: 'w', levels: 0, around: 10 }));
    }
    return { wave: 'wing' };
  },
  /** BELL JELLY: built separately (bell, frilled oral arms, tentacles, a glowing rim) */
  jelly: () => ({ wave: 'jelly' }),
  /** LANTERN EEL: a long olive ribbon with a continuous dorsal-to-anal fin, barbels, rows of glowing spots along its
   *  sides and a luminous lure dangling from the chin */
  eel: (k) => {
    const L = k.L, st: [number, number, number, number, string][] = [];
    for (let i = 0; i <= 10; i++) { const z = -0.5 + i / 10, w = i === 0 ? 0.004 : i === 10 ? 0.012 : 0.022 + 0.008 * Math.sin((i / 10) * Math.PI); st.push([z, 0, w, w * 1.25, i < 3 ? 'ridge' : 'round']); }
    fishBody(k, st, skinPaint({ L, back: ['olive', 2], belly: ['straw', 3], scale: 0.01, noScales: true, pebbles: 0.006, gill: 0.44, photo: (P, N, i) => Math.abs(Math.abs(N[i * 3 + 1]) - 0.35) < 0.12 && Math.abs((P[i * 3 + 2] / L * 26) % 1) < 0.2 && P[i * 3 + 2] / L < 0.4,
      marks: (px, P, N, i) => { if (N[i * 3 + 1] > 0 && Math.abs(((P[i * 3 + 2] / L) * 14 + N[i * 3] * 0.3) % 1) < 0.16) px.mark[i] -= 1; } }));
    const fp = finPaint('olive', 3, { rays: 9, alpha: 130, tip: 'brass' });
    const zs = [0.3, 0.15, 0.0, -0.15, -0.3, -0.45];
    rayFin(k, 'dors', [0, 0.026 * L, 0.32 * L], [0, 0.012 * L, -0.48 * L], [0, 1, -0.2], [0, 0.6, -1], [0.02, 0.03, 0.035, 0.035, 0.035, 0.035, 0.033, 0.03, 0.02], [1, 0, 0], fp, { scallop: 0.1 });
    rayFin(k, 'anal', [0, -0.026 * L, 0.0], [0, -0.012 * L, -0.48 * L], [0, -1, -0.2], [0, -0.6, -1], [0.025, 0.03, 0.03, 0.03, 0.028, 0.02], [1, 0, 0], fp, { scallop: 0.1 });
    void zs;
    const bp = solid('olive', 3, { pebbles: { size: L * 0.004, depth: 0.5 } });
    for (const s of [-1, 1]) k.body.add(stalk({ name: 'barb' + s, path: curve([[s * 0.008 * L, -0.008 * L, 0.48 * L], [s * 0.02 * L, -0.03 * L, 0.5 * L], [s * 0.03 * L, -0.06 * L, 0.48 * L]], 5), r: (t) => L * 0.003 * (1 - t * 0.8), around: 5, levels: 0, skin: W1, paint: bp }));
    const lure = curve([[0, -0.012 * L, 0.46 * L], [0, -0.05 * L, 0.49 * L], [0, -0.075 * L, 0.47 * L]], 5);
    k.body.add(stalk({ name: 'lure', path: lure, r: () => L * 0.0025, around: 5, levels: 0, skin: W1, paint: bp }));
    k.body.add(bulbs({ name: 'bulb', seats: [{ p: lure[lure.length - 1], n: [0, -1, 0], r: L * 0.009 }], skin: W1, paint: glowPaint('glowTeal'), levels: 1 }));
    eyes(k, [0.016, 0.012, 0.45], 0.008, 'brass', 'slit');
    return { wave: 'eel' };
  },
  /** PLATED GRUBBER: a bottom grubber armoured in rust plates, a bony head shield, a downturned mouth fringed with
   *  barbels, a spiny dorsal fan and rows of bony scutes down the flanks */
  armourfish: (k) => {
    const L = k.L;
    const bd = fishBody(k, [[-0.5, 0, 0.02, 0.025, 'ridge'], [-0.38, 0, 0.06, 0.055, 'ridge'], [-0.18, 0, 0.12, 0.09, 'flat'], [0.04, 0, 0.16, 0.1, 'flat'], [0.22, -0.005, 0.16, 0.09, 'flat'], [0.36, -0.015, 0.13, 0.065, 'flat'], [0.47, -0.03, 0.07, 0.035, 'flat']],
      skinPaint({ L, back: ['rust', 2], belly: ['sand', 4], scale: 0.07, kind: 'scute', gill: 0.24 }));
    k.body.finalize(bd);
    const plate: Look = { ramp: 'rust', step: 3, creases: 0.6, pebbles: { size: L * 0.015, depth: 0.7 }, mats: { 1: { ramp: 'rust', step: 1 } }, glints: { size: L * 0.03, every: 0.5 } };
    const pp: Paint = (ch, _p, b) => { const px = new Px(ch, b); paintLook(px, plate); px.flush(); };
    k.body.add(shell({ name: 'shield', host: bd, u: [0.2, 0.8], v: [0.62, 0.97], nu: 6, nv: 4, lift: (a, b) => L * 0.012 * (0.5 + Math.sin(Math.PI * a)) * (0.5 + b * 0.5), sink: L * 0.004, ridges: [0.3, 0.5, 0.7], rim: 2, levels: 1, skin: W1, paint: pp }));
    for (let r = 0; r < 5; r++) for (const s of [0, 1]) { const v = 0.12 + r * 0.1, u = s ? [0.6, 0.72] : [0.28, 0.4]; k.body.add(shell({ name: 'scute' + r + s, host: bd, u: u as [number, number], v: [v, v + 0.12], nu: 2, nv: 2, lift: (a) => L * 0.01 * (0.4 + Math.sin(Math.PI * a)), sink: L * 0.003, ridges: [0.5], rim: 2, levels: 1, skin: W1, paint: pp })); }
    const fp = finPaint('brass', 3, { rays: 7, alpha: 150, tip: 'rust' });
    rayFin(k, 'dors', [0, 0.1 * L, 0.18 * L], [0, 0.09 * L, -0.12 * L], [0, 1, 0.2], [0, 0.7, -0.8], [0.16, 0.18, 0.16, 0.13, 0.1, 0.07, 0.04], [1, 0, 0], fp, { scallop: 0.35 });
    rayFin(k, 'tail', [0, 0.02 * L, -0.47 * L], [0, -0.02 * L, -0.47 * L], [0, 0.5, -1], [0, -0.5, -1], [0.14, 0.16, 0.17, 0.16, 0.14], [1, 0, 0], fp, { scallop: 0.2 });
    for (const s of [-1, 1]) rayFin(k, 'pec' + s, [s * 0.15 * L, -0.05 * L, 0.24 * L], [s * 0.15 * L, -0.06 * L, 0.12 * L], [s * 1, -0.2, -0.2], [s * 0.7, -0.3, -0.8], [0.18, 0.16, 0.12, 0.08], [0, 1, 0], fp, { scallop: 0.3 });
    const bp = solid('sand', 3);
    for (let i = 0; i < 6; i++) { const s = i % 2 ? 1 : -1, j = i >> 1; k.body.add(stalk({ name: 'barb' + i, path: curve([[s * 0.03 * (j + 1) * L, -0.04 * L, 0.47 * L - j * 0.02 * L], [s * 0.04 * (j + 1) * L, -0.1 * L, 0.48 * L], [s * 0.05 * (j + 1) * L, -0.14 * L, 0.44 * L]], 4), r: (t) => L * 0.005 * (1 - t * 0.8), around: 5, levels: 0, skin: W1, paint: bp })); }
    eyes(k, [0.09, 0.05, 0.36], 0.026, 'brass', 'w');
    return { wave: 'side' };
  },
  /** DEEP LEVIATHAN: a thirty-metre whale-kind with two pairs of flippers, a broad fluke, a crest of low dorsal
   *  spines, a long mouth line over baleen, rows of glowing ventral photophores, barnacle crusts and old scars */
  leviathan: (k) => {
    const L = k.L;
    const bd = fishBody(k, [[-0.5, 0.0, 0.012, 0.01, 'ridge'], [-0.42, 0.005, 0.03, 0.025, 'ridge'], [-0.3, 0.01, 0.06, 0.055, 'ridge'], [-0.14, 0.012, 0.095, 0.09, 'round'], [0.02, 0.01, 0.115, 0.105, 'round'], [0.18, 0.0, 0.12, 0.112, 'round'], [0.32, -0.005, 0.11, 0.1, 'round'], [0.44, -0.01, 0.08, 0.075, 'flat'], [0.5, -0.012, 0.035, 0.04, 'flat']],
      skinPaint({ L, back: ['slate', 2], belly: ['stone', 4], scale: 0.02, noScales: true, pebbles: 0.012, gill: 0.4,
        photo: (P, N, i) => N[i * 3 + 1] < -0.6 && Math.abs((P[i * 3] / L * 40) % 1) < 0.25 && Math.abs((P[i * 3 + 2] / L * 40) % 1) < 0.25 && P[i * 3 + 2] / L > -0.25 && P[i * 3 + 2] / L < 0.3,
        marks: (px, P, N, i) => { const z = P[i * 3 + 2] / L; if (z > 0.38 && N[i * 3 + 1] < 0 && N[i * 3 + 1] > -0.55 && Math.abs(N[i * 3]) > 0.5 && Math.floor(z * 300) % 2 === 0) px.put(i, RP('bone'), 3); if (N[i * 3 + 1] < -0.4 && Math.abs(((z * 60) % 1)) < 0.08) px.mark[i] -= 1; } }), { levels: 1, tween: 1 });
    k.body.finalize(bd);
    k.body.add(shell({ name: 'crest', host: bd, u: [0.48, 0.52], v: [0.25, 0.7], nu: 2, nv: 6, lift: (a, b) => L * 0.012 * Math.sin(Math.PI * b) * (0.4 + 0.6 * Math.sin(Math.PI * a)), sink: L * 0.004, rim: 2, levels: 1, skin: W1, paint: solid('slate', 3) }));
    const fp = finPaint('slate', 2, { rays: 5, alpha: 200, tip: 'stone' });
    for (const s of [-1, 1]) for (const [z, len] of [[0.22, 0.16], [-0.08, 0.1]]) rayFin(k, 'flip' + s + z, [s * 0.1 * L, -0.06 * L, z * L], [s * 0.1 * L, -0.06 * L, (z - 0.06) * L], [s * 1, -0.45, -0.2], [s * 0.7, -0.5, -0.7], [len, len * 0.9, len * 0.7, len * 0.5, len * 0.3], [0, 1, 0], fp, { th: 0.008, scallop: 0.05 });
    for (const s of [-1, 1]) rayFin(k, 'fluke' + s, [0, 0, -0.47 * L], [s * 0.01 * L, 0, -0.42 * L], [s * 0.9, 0, -0.6], [s * 1, 0, -0.1], [0.18, 0.17, 0.13, 0.08], [0, 1, 0], fp, { th: 0.006, scallop: 0.05 });
    k.body.add(bulbs({ name: 'barn', seats: Array.from({ length: 44 }, (_, i) => { const z = (h3(i, 1, 7) - 0.5) * 0.7, a = (h3(i, 2, 7) - 0.5) * 2.4, r = 0.1 * L; return { p: [Math.sin(a) * r, Math.cos(a) * r, z * L] as V3, n: nrm([Math.sin(a), Math.cos(a), 0]), r: L * (0.004 + h3(i, 3, 7) * 0.004), cone: true }; }), skin: W1, levels: 0, paint: solid('bone', 3) }));
    eyes(k, [0.105, 0.0, 0.38], 0.008, 'ochre', 'round');
    return { wave: 'vert' };
  },
};

const LEN: Record<FishKind, number> = { baitfish: 0.18, reeffish: 0.35, shark: 3.2, ray: 1.6, jelly: 0.5, eel: 1.4, armourfish: 0.6, leviathan: 32 };
const PAGE: Record<FishKind, number> = { baitfish: 256, reeffish: 256, shark: 512, ray: 512, jelly: 256, eel: 256, armourfish: 256, leviathan: 1024 };

export function buildFish(kind: FishKind, seed = 1): FishModel {
  const L = LEN[kind], body = new Body(PAGE[kind]), k: Kit = { L, body, seed };
  body.seed = seed;
  const { wave } = kind === 'jelly' ? jelly(k) : BUILD[kind](k);
  const out = body.build({ den: 160 / L, maxScale: 1e6, occlusion: kind === 'leviathan' || kind === 'shark', snap: (d) => snapRGBA(d) });
  // fin membranes keep their translucency on the page
  out.geo.deleteAttribute('skinIndex'); out.geo.deleteAttribute('skinWeight');
  return finish(out.geo, out.tex, kind, L, wave);
}

/** BELL JELLY: a ribbed translucent bell with a glowing scalloped rim, four frilled oral arms and long tentacles */
function jelly(k: Kit) {
  const L = k.L, b = k.body;
  // the bell: a dome swept round its axis (rings of points from the crown down to the rim), ribbed
  const st: Station[] = [];
  const prof = [[0.02, 0.32], [0.14, 0.31], [0.24, 0.27], [0.3, 0.18], [0.33, 0.07], [0.34, -0.01], [0.3, -0.02], [0.2, 0.02]];
  prof.forEach(([r, y]) => st.push({ c: [0, y * L, 0], s: [r * L, r * L], p: Array.from({ length: 9 }, (_, j) => { const a = (j / 8) * Math.PI; return [Math.sin(a) * (1 + 0.06 * Math.cos(a * 8)), Math.cos(a)]; }) }));
  void st;
  const rings = prof.map(([r, y]) => ({ c: [0, y * L, 0] as V3, x: [1, 0, 0] as V3, y: [0, 0, 1] as V3, pts: Array.from({ length: 16 }, (_, j) => { const a = (j / 16) * Math.PI * 2, rib = 1 + 0.05 * (j % 2 ? -1 : 1); return [Math.cos(a) * r * L * rib, Math.sin(a) * r * L * rib]; }) }));
  const pc: Paint = (ch, _p, bb) => {
    const px = new Px(ch, bb), P = px.gb.P; px.lightK = 0.5;
    px.base((i, x) => { const y = P[i * 3 + 1] / L, rib = x % Math.max(2, Math.round(px.w / 16)) === 0; px.put(i, RP('violet'), (y > 0.25 ? 5 : 4) + (rib ? -1 : 0)); px.alpha[i] = y < 0.02 ? 200 : 150; if (y < 0.03 && y > -0.03 && rib) { px.put(i, RP('glowTeal'), 4); px.alpha[i] = A_GLOW; } if (Math.abs(y - 0.2) < 0.012) px.put(i, RP('violet'), 2); });
    px.flush();
  };
  const piece: Piece = { name: 'bell', m: newCM(), grids: [], levels: 1, skin: W1, paint: pc, k: 1.5, cut: true };
  piece.grids.push(tube(piece.m, rings, { tag: 0, capS: true, capE: false }));
  b.add(piece);
  // oral arms: frilled ribbons hanging from the bell's mouth
  const ap = finPaint('violet', 3, { rays: 5, alpha: 130, tip: 'plum', glowTip: true });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4, d: V3 = [Math.cos(a), 0, Math.sin(a)], side: V3 = [-Math.sin(a), 0, Math.cos(a)];
    rayFin(k, 'arm' + i, [d[0] * 0.04 * L, 0, d[2] * 0.04 * L], [d[0] * 0.06 * L, -0.5 * L, d[2] * 0.06 * L], [d[0], -0.3, d[2]], [d[0] * 0.6, -0.6, d[2] * 0.6], [0.09, 0.12, 0.13, 0.11, 0.07], side, ap, { th: 0.006, scallop: 0.4 });
  }
  const tp = solid('violet', 3, { light: 0.4 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 0.31 * L, len = L * (1.3 + h3(i, k.seed, 2) * 0.8);
    const path = curve([[Math.cos(a) * r, -0.01 * L, Math.sin(a) * r], [Math.cos(a) * r * 1.05, -len * 0.5, Math.sin(a) * r * 1.05], [Math.cos(a) * r * 0.9, -len, Math.sin(a) * r * 0.9]], 6);
    b.add(stalk({ name: 'ten' + i, path, r: (t) => L * 0.006 * (1 - t * 0.7), around: 4, levels: 0, skin: W1, paint: tp }));
  }
  b.add(sac({ name: 'gut', at: [0, 0.1 * L, 0], n: [0, -1, 0], r: [0.1 * L, 0.1 * L, 0.08 * L], skin: W1, paint: glowPaint('glowAmber'), levels: 1 }));
  return { wave: 'jelly' as const };
}

function finish(geo: THREE.BufferGeometry, tex: THREE.DataTexture, kind: FishKind, L: number, wave: 'side' | 'vert' | 'wing' | 'eel' | 'jelly'): FishModel {
  const jellyK = kind === 'jelly';
  const uniforms = { uTime: { value: 0 }, uSwim: { value: 0.5 } };
  const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, transparent: false, alphaTest: 0 });
  const amp = wave === 'eel' ? 0.12 : wave === 'vert' ? 0.06 : wave === 'wing' ? 0.08 : 0.07;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uSwim = uniforms.uSwim; sh.uniforms.uNight = FISH_GLOW.night; sh.uniforms.uSea = FISH_GLOW.sea;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uSwim;\nvarying float vFishY;').replace('#include <begin_vertex>', `#include <begin_vertex>
float ph = 0.0;
#ifdef USE_INSTANCING
ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9;
#endif
float L = ${L.toFixed(4)}, zf = clamp((L * 0.5 - position.z) / L, 0.0, 1.0), sp = 3.0 + uSwim * 7.0;
${jellyK ? `float pulse = 0.5 + 0.5 * sin(uTime * 2.4 + ph); transformed.xz *= 1.0 + pulse * 0.12 * smoothstep(-0.1 * L, 0.15 * L, position.y); transformed.x += sin(position.y / L * 9.0 - uTime * 2.4 + ph) * 0.06 * L * smoothstep(0.0, -0.8 * L, position.y);`
    : wave === 'vert' ? `transformed.y += sin(position.z / L * 6.0 - uTime * sp * 0.4 + ph) * ${amp} * L * zf * zf;`
    : wave === 'wing' ? `transformed.y += sin(position.z / L * 7.0 - uTime * sp * 0.6 + ph) * ${amp} * L * abs(position.x) / L * 2.0;`
    : `transformed.x += sin(position.z / L * ${wave === 'eel' ? '14.0' : '7.0'} - uTime * sp + ph) * ${amp} * L * (${wave === 'eel' ? 'zf + 0.2' : 'zf * zf'});`}
#ifdef USE_INSTANCING
vFishY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
#else
vFishY = (modelMatrix * vec4(transformed, 1.0)).y;
#endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight, uSea;\nvarying float vFishY;')
      .replace('#include <alphatest_fragment>', `float fishA = textureLod(map, vMapUv, 0.0).a;
// membranes: dithered translucency (pixel-style screen door), never blended, so instancing needs no sorting
if (fishA < 0.88) { vec2 q = mod(floor(gl_FragCoord.xy), 4.0); float th = (mod(q.x + q.y * 2.0, 4.0) * 4.0 + mod(q.y + q.x * 3.0, 4.0) + 0.5) / 16.0; if (fishA < th) discard; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// photophores: brighter at night and in the deep
if (fishA > 0.9 && fishA < 0.97) totalEmissiveRadiance += diffuseColor.rgb * (0.7 + 1.6 * uNight + 1.4 * clamp((uSea - vFishY) / 40.0, 0.0, 1.0));`);
  };
  mat.customProgramCacheKey = () => 'oddworld-fish2-' + kind;
  gbuf(mat, 1);
  return { kind, geo, mat, length: L, uniforms };
}
