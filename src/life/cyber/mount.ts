// CYBORG WORKERS: the parts, modelled and fitted. Every body builder (vertebrate quadrupeds, bipeds and hexapods,
// serpents) hands over a CyCtx: where its back runs, a point on its body at any station and angle, its head, neck,
// legs and arms with their bones. Each fitted part is built from the hard-surface kit (hull.ts) against those
// anchors and skinned rigidly to the bones that carry it, so a hydraulic knee bends with the leg, a collar turns
// with the neck and a cargo rack rides the back. Livery by role: the hauler's machinery is ochre, the miner's rust
// orange, the farmer's olive, the builder's brass yellow, the operator's blue, the guard's slate and the scout's
// white; every part carries the program's stencils, serials and status lights.
import type { V3, Wt } from '../kit';
import type { Body, Chart, Piece } from '../anatomy/core';
import type { Rig } from '../morph';
import type { Design } from '../design';
import { stalk, curve } from '../anatomy/append';
import { Px, RP } from '../anatomy/paint';
import { Hull, MAT, V, frame, perp, hullPaint, type HullLook } from './hull';
import { CYBER, LIVERY } from './catalog';
import { workerProfile } from './roles';

const { add, sub, scl, dot, crs, nrm, len, lerp } = V;

export interface CyLeg { fore: boolean; side: 1 | -1; pair: number; bones: number[]; J: V3[]; r: number; rootT: number }
export interface CyCtx {
  d: Design; body: Body; rig: Rig; rest: V3[]; W: number; H: number; L: number; seed: number;
  /** skin weights of a point on the trunk (back-mounted parts ride these) */
  spine: (p: V3) => Wt;
  /** a point on the body surface at t along (0 the hips, 1 the shoulders) and angle a round (0 the top, +pi/2 the
   *  right flank, pi the belly), with its outward normal */
  at: (t: number, a: number) => { p: V3; n: V3 };
  head: { bone: number; c: V3; fwd: V3; up: V3; hw: number; hh: number; hl: number; eyes: V3[] };
  neck: { bone: number; c: V3; dir: V3; r: number } | null;
  chest: number; hips: number;
  legs: CyLeg[];
  arms: { side: 1 | -1; bone: number; A: V3; hand: V3 }[];
  serpent?: boolean;
}

const rubber = (body: Body) => {
  const f = (ch: Chart, _p: Piece, b: Body) => {
    const px = new Px(ch, b), R = RP('ink');
    px.base(() => [R, 2]);
    // ribbed hose: a dark groove every few centimetres along it
    for (let y = 0; y < px.h; y++) if (Math.floor(px.Y[y] / 0.03) % 3 === 0) for (let x = 0; x < px.w; x++) px.mark[y * px.w + x] -= 1;
    px.flush();
  };
  void body;
  return f;
};

/** build every fitted part onto the creature; returns the triangles added */
export function growCyber(c: CyCtx): number {
  const fit = new Set((c.d.fit ?? []).filter((id) => CYBER[id]));
  if (!fit.size) return 0;
  const prof = workerProfile(c.d), liv = LIVERY[prof.role];
  const look: HullLook = { paint: liv.paint, accent: liv.accent, frame: liv.frame, panel: c.W * 0.32, wear: 0.55, grime: 0.6, seed: c.seed };
  const serial = `07-${String(c.d.seed % 997).padStart(3, '0')}`;
  let tris = 0;
  const done = (h: Hull, skin: (p: V3) => Wt, k = 2.6) => { tris += h.tris; c.body.add(h.piece({ skin, paint: hullPaint(look, h.decals), k })); };
  const rig1 = (bone: number) => (): Wt => [bone, 1];
  const hose = (name: string, pts: V3[], r: number, skin: (p: V3) => Wt) => { const p = c.body.add(stalk({ name, path: curve(pts, 7), r: () => r, around: 4, skin, paint: rubber(c.body), levels: 0, capE: true, capS: true })); p.reg = 12; p.k = 1.4; tris += 6 * 4 * 2; };
  const anchors: { at: V3; skin: (p: V3) => Wt }[] = [];
  const s = c.W;
  // ------------------------------------------------------------------ the neural control collar
  if (fit.has('cy_collar') && c.neck) {
    const N = c.neck, h = new Hull('cy:cy_collar'), F = frame(N.dir, [0, 1, 0]);
    h.band(N.c, N.dir, N.r * 1.02, N.r * 0.62, N.r * 0.1, 8, MAT.frame, 0.04);
    h.band(N.c, N.dir, N.r * 1.1, N.r * 0.36, N.r * 0.1, 8, MAT.paint, 0.22);
    // the control module on the nape: a box with its lights, a stub aerial and the serial
    const up = nrm(sub([0, 1, 0], scl(N.dir, dot([0, 1, 0], N.dir)))), side = crs(N.dir, up), mc = add(N.c, scl(up, N.r * 1.28));
    h.box(mc, scl(side, N.r * 0.34), scl(up, N.r * 0.16), scl(N.dir, N.r * 0.3), [MAT.paint, MAT.paint, MAT.accent, MAT.frame, MAT.paint, MAT.paint]);
    h.box(add(mc, scl(up, N.r * 0.2)), scl(side, N.r * 0.2), scl(up, N.r * 0.05), scl(N.dir, N.r * 0.18), MAT.frame);
    h.cyl(add(mc, add(scl(up, N.r * 0.2), scl(side, N.r * 0.22))), add(mc, add(scl(up, N.r * 0.95), add(scl(side, N.r * 0.26), scl(N.dir, -N.r * 0.25)))), N.r * 0.03, 5, MAT.steel);
    h.decal({ kind: 'light', o: add(mc, add(scl(N.dir, N.r * 0.31), scl(side, -N.r * 0.14))), u: side, v: up, size: N.r * 0.07, col: 'green' });
    h.decal({ kind: 'light', o: add(mc, add(scl(N.dir, N.r * 0.31), scl(side, -N.r * 0.0))), u: side, v: up, size: N.r * 0.07, col: 'amber' });
    h.decal({ kind: 'text', o: add(mc, add(scl(side, N.r * 0.345), scl(up, 0))), u: scl(N.dir, -1), v: up, h: N.r * 0.12, text: 'NC-7', col: ['ink', 1] });
    void F;
    done(h, rig1(N.bone));
    // the electrode lead into the back of the skull
    hose('cy:cy_collar:lead', [add(mc, scl(N.dir, N.r * 0.3)), add(add(mc, scl(N.dir, N.r * 0.8)), scl(up, N.r * 0.3)), add(c.head.c, add(scl(c.head.fwd, -c.head.hl * 0.35), scl(c.head.up, c.head.hh * 0.25)))], N.r * 0.05, (p) => (dot(sub(p, N.c), N.dir) > N.r * 0.6 ? [c.head.bone, 1] : [N.bone, 1]));
    anchors.push({ at: mc, skin: rig1(N.bone) });
  }
  // ------------------------------------------------------------------ head: survey visor or sensor mast
  if (fit.has('cy_visor') || fit.has('cy_sensor')) {
    const Hd = c.head, h = new Hull('cy:' + (fit.has('cy_visor') ? 'cy_visor' : 'cy_sensor')), side = nrm(crs(Hd.up, Hd.fwd)), big = fit.has('cy_sensor');
    const eye = Hd.eyes.length ? scl(Hd.eyes.reduce((a, e) => add(a, e), [0, 0, 0] as V3), 1 / Hd.eyes.length) : add(Hd.c, add(scl(Hd.fwd, Hd.hl * 0.2), scl(Hd.up, Hd.hh * 0.2)));
    // the eyes' spread: the visor hugs the brow just outside them
    const ew = Hd.eyes.length ? Math.max(...Hd.eyes.map((e) => Math.abs(dot(sub(e, eye), side)))) * 1.12 + Hd.hw * 0.14 : Hd.hw * 0.8;
    // the visor: a strap of plates round the brow at eye height, a glass lens over each eye
    const hy = Hd.hh * 0.28, arc: V3[] = [];
    for (let k = 0; k <= 6; k++) { const a = -Math.PI * 0.6 + (k / 6) * Math.PI * 1.2; arc.push(add(eye, add(scl(side, Math.sin(a) * ew), scl(Hd.fwd, Math.cos(a) * Hd.hw * 0.32 - Hd.hw * 0.06)))); }
    for (let k = 0; k < 6; k++) h.beam(arc[k], arc[k + 1], hy, Hd.hw * 0.09, Hd.up, k === 2 || k === 3 ? MAT.paint : MAT.frame, 0.3);
    for (const sg of [-1, 1]) {
      const lc = add(add(eye, scl(side, sg * ew * 0.6)), scl(Hd.fwd, Hd.hw * 0.22)), n = nrm(add(Hd.fwd, scl(side, sg * 0.55)));
      const u = nrm(crs(Hd.up, n)), w = ew * 0.36, hh = hy * 0.6;
      h.slab([add(lc, add(scl(u, -w), scl(Hd.up, -hh))), add(lc, add(scl(u, w), scl(Hd.up, -hh))), add(lc, add(scl(u, w * 0.9), scl(Hd.up, hh))), add(lc, add(scl(u, -w * 0.9), scl(Hd.up, hh)))], n, Hd.hw * 0.05, MAT.glass, 0.1, MAT.frame);
    }
    // temple boxes over the ears and the sensor pod on the crown
    for (const sg of [-1, 1]) h.box(add(arc[sg < 0 ? 0 : 6], scl(Hd.fwd, -Hd.hw * 0.05)), scl(side, Hd.hw * 0.12), scl(Hd.up, hy * 0.75), scl(Hd.fwd, Hd.hw * 0.22), MAT.accent);
    const pod = add(Hd.c, add(scl(Hd.up, Hd.hh * (big ? 0.95 : 0.78)), scl(Hd.fwd, Hd.hl * 0.05)));
    h.box(pod, scl(side, Hd.hw * (big ? 0.42 : 0.28)), scl(Hd.up, Hd.hh * 0.16), scl(Hd.fwd, Hd.hl * (big ? 0.24 : 0.18)), [MAT.paint, MAT.paint, MAT.paint, MAT.frame, MAT.accent, MAT.paint]);
    h.cyl(add(pod, scl(Hd.fwd, Hd.hl * 0.12)), add(pod, scl(Hd.fwd, Hd.hl * 0.3)), Hd.hh * 0.1, 8, { side: MAT.frame, cap: MAT.glass });
    if (big) for (const sg of [-1, 1]) h.cyl(add(pod, add(scl(side, sg * Hd.hw * 0.3), scl(Hd.fwd, Hd.hl * 0.1))), add(pod, add(scl(side, sg * Hd.hw * 0.3), scl(Hd.fwd, Hd.hl * 0.34))), Hd.hh * 0.08, 8, { side: MAT.frame, cap: MAT.glass });
    // a radar fin and an aerial
    const fin = add(pod, add(scl(Hd.up, Hd.hh * 0.16), scl(Hd.fwd, -Hd.hl * 0.1)));
    if (big) h.slab([add(fin, scl(Hd.fwd, -Hd.hl * 0.18)), add(fin, scl(Hd.fwd, Hd.hl * 0.12)), add(fin, add(scl(Hd.fwd, -Hd.hl * 0.05), scl(Hd.up, Hd.hh * 0.45))), add(fin, add(scl(Hd.fwd, -Hd.hl * 0.2), scl(Hd.up, Hd.hh * 0.4)))], side, Hd.hw * 0.03, MAT.accent, 0.05);
    h.cyl(add(fin, scl(side, -Hd.hw * 0.15)), add(fin, add(scl(side, -Hd.hw * 0.2), add(scl(Hd.up, Hd.hh * (big ? 1.2 : 0.8)), scl(Hd.fwd, -Hd.hl * 0.25)))), Hd.hw * 0.018, 4, MAT.steel);
    h.decal({ kind: 'light', o: add(pod, add(scl(Hd.fwd, Hd.hl * (big ? 0.24 : 0.18)), scl(side, Hd.hw * 0.18))), u: side, v: Hd.up, size: Hd.hh * 0.05, col: 'red' });
    h.decal({ kind: 'text', o: add(pod, scl(side, Hd.hw * (big ? 0.42 : 0.28))), u: Hd.fwd, v: Hd.up, h: Hd.hh * 0.11, text: big ? 'SM-4' : 'SV-2', col: ['ink', 1] });
    done(h, rig1(Hd.bone), 3);
  }
  // ------------------------------------------------------------------ back rig: load harness and cargo frame, or a seed hopper
  const backPart = fit.has('cy_cargo') ? 'cy_cargo' : fit.has('cy_hopper') ? 'cy_hopper' : null;
  if (backPart) {
    const t0 = c.serpent ? 0.25 : 0.12, t1 = c.serpent ? 0.75 : 0.86;
    // straps round the barrel: a band of plates hugging the body at two stations
    const strap = new Hull('cy:' + backPart + ':straps');
    for (const t of [t0 + 0.12, t1 - 0.1]) {
      const ring: { p: V3; n: V3 }[] = [];
      for (let k = 0; k <= 10; k++) { const a = -Math.PI + (k / 10) * Math.PI * 2, q = c.at(t, a); ring.push({ p: add(q.p, scl(q.n, s * 0.025)), n: q.n }); }
      for (let k = 0; k < 10; k++) strap.beam(ring[k].p, ring[k + 1].p, s * 0.13, s * 0.03, ring[k].n, k === 4 || k === 5 ? MAT.accent : MAT.rubber, 0, 1, false);
      // buckles on the flanks
      for (const a of [-Math.PI / 2, Math.PI / 2]) { const q = c.at(t, a), u = nrm(crs(q.n, [0, 0, 1])); strap.box(add(q.p, scl(q.n, s * 0.05)), scl(u, s * 0.06), scl([0, 0, 1], s * 0.08), scl(q.n, s * 0.025), MAT.steel); }
    }
    done(strap, c.spine, 1.8);
    // the rack: posts up from the straps to two rails and cross members, crates or the hopper lashed on top
    const rack = new Hull('cy:' + backPart), top0 = c.at(t0 + 0.12, 0), top1 = c.at(t1 - 0.1, 0);
    const lift = s * (c.serpent ? 0.18 : 0.26), up0 = nrm(add(top0.n, [0, 1, 0])), up1 = nrm(add(top1.n, [0, 1, 0]));
    const along = nrm(sub(top1.p, top0.p)), side = nrm(crs(up0, along)), hw = s * (c.serpent ? 0.38 : 0.44);
    const R0 = add(top0.p, scl(up0, lift)), R1 = add(top1.p, scl(up1, lift));
    const e0 = sub(R0, scl(along, s * 0.12)), e1 = add(R1, scl(along, s * 0.12));
    for (const sg of [-1, 1]) {
      rack.beam(add(e0, scl(side, sg * hw)), add(e1, scl(side, sg * hw)), s * 0.05, s * 0.06, up0, MAT.frame, 0.25);
      for (const [T, U] of [[top0, up0], [top1, up1]] as const) { const q = c.at(T === top0 ? t0 + 0.12 : t1 - 0.1, sg * 0.75); rack.beam(add(q.p, scl(q.n, s * 0.03)), add(add(T.p, scl(U, lift)), scl(side, sg * hw)), s * 0.045, s * 0.045, along, MAT.frame, 0.2); }
    }
    for (let k = 0; k <= 3; k++) { const p = lerp(e0, e1, k / 3); rack.beam(add(p, scl(side, -hw)), add(p, scl(side, hw)), s * 0.045, s * 0.05, along, MAT.frame, 0.25); }
    const deck = lerp(R0, R1, 0.5), dl = len(sub(e1, e0));
    if (backPart === 'cy_cargo') {
      // two crates and a drum, strapped down
      const c1 = add(add(lerp(e0, e1, 0.3), scl(up0, s * 0.2)), scl(side, -hw * 0.45)), c2 = add(add(lerp(e0, e1, 0.33), scl(up0, s * 0.17)), scl(side, hw * 0.48));
      rack.box(c1, scl(side, hw * 0.5), scl(up0, s * 0.18), scl(along, dl * 0.22), [MAT.paint, MAT.paint, MAT.accent, MAT.frame, MAT.paint, MAT.paint]);
      rack.box(add(c1, scl(up0, s * 0.19)), scl(side, hw * 0.52), scl(up0, s * 0.02), scl(along, dl * 0.235), MAT.frame);
      rack.box(c2, scl(side, hw * 0.42), scl(up0, s * 0.15), scl(along, dl * 0.2), MAT.hazard);
      rack.decal({ kind: 'text', o: add(c1, scl(along, -dl * 0.22)), u: scl(side, -1), v: up0, h: s * 0.07, text: 'UNAA', col: ['ink', 1] });
      rack.decal({ kind: 'text', o: add(c1, scl(side, -hw * 0.5)), u: scl(along, -1), v: up0, h: s * 0.06, text: serial, col: ['ink', 1] });
      const dr = add(add(lerp(e0, e1, 0.75), scl(up0, s * 0.16)), scl(side, 0));
      rack.cyl(add(dr, scl(side, -hw * 0.8)), add(dr, scl(side, hw * 0.8)), s * 0.16, 10, { side: MAT.accent, cap: MAT.frame });
      for (const f of [-0.6, 0.6]) rack.cyl(add(dr, scl(side, hw * f - s * 0.015)), add(dr, scl(side, hw * f + s * 0.015)), s * 0.172, 10, MAT.frame);
      rack.decal({ kind: 'stripes', o: add(dr, scl(up0, s * 0.165)), u: side, v: along, w: hw * 1.2, h: s * 0.05 });
      // the tie-down straps over the load
      for (const f of [0.18, 0.42]) { const p = lerp(e0, e1, f); rack.beam(add(add(p, scl(side, -hw * 0.98)), scl(up0, s * 0.39)), add(add(p, scl(side, hw * 0.05)), scl(up0, s * 0.39)), s * 0.05, s * 0.012, along, MAT.accent, 0.1); }
    } else {
      // the hopper: a tapering bin with a lid, a pump and the rear spray boom on stays
      const hc = add(deck, scl(up0, s * 0.02));
      rack.extrude(hc, add(hc, scl(up0, s * 0.42)), [[hw * 0.7, dl * 0.32], [-hw * 0.7, dl * 0.32], [-hw * 0.7, -dl * 0.32], [hw * 0.7, -dl * 0.32]].map(([x, y]) => [x, y]), along, { side: MAT.paint, cap: MAT.frame }, 0.7, 1.15);
      rack.box(add(hc, scl(up0, s * 0.45)), scl(side, hw * 0.85), scl(up0, s * 0.03), scl(along, dl * 0.38), MAT.accent);
      rack.cyl(add(hc, add(scl(up0, s * 0.48), scl(along, dl * 0.2))), add(hc, add(scl(up0, s * 0.62), scl(along, dl * 0.2))), s * 0.06, 8, { side: MAT.frame, cap: MAT.steel });
      const boom = sub(e0, scl(along, s * 0.25));
      rack.beam(add(boom, scl(side, -hw * 1.9)), add(boom, scl(side, hw * 1.9)), s * 0.05, s * 0.05, up0, MAT.frame, 0.2);
      for (let k = -3; k <= 3; k++) rack.cyl(add(boom, scl(side, k * hw * 0.55)), add(add(boom, scl(side, k * hw * 0.55)), scl(up0, -s * 0.12)), s * 0.022, 5, MAT.brass);
      for (const sg of [-1, 1]) rack.beam(add(e0, scl(side, sg * hw)), add(boom, scl(side, sg * hw * 1.4)), s * 0.035, s * 0.035, up0, MAT.frame, 0.2);
      rack.decal({ kind: 'text', o: add(hc, add(scl(side, hw * 0.92), scl(up0, s * 0.22))), u: scl(along, -1), v: up0, h: s * 0.065, text: 'SEED', col: ['ink', 1] });
      rack.decal({ kind: 'stripes', o: add(boom, scl(up0, s * 0.026)), u: side, v: along, w: hw * 3.6, h: s * 0.04 });
    }
    rack.decal({ kind: 'light', o: add(e1, scl(up0, s * 0.031)), u: side, v: along, size: s * 0.03, col: 'amber' });
    const mid = lerp(top0.p, top1.p, 0.5), w = c.spine(mid);
    done(rack, () => w, 2.2);
    anchors.push({ at: R0, skin: () => w });
  }
  // ------------------------------------------------------------------ the power pack over the hips
  if (fit.has('cy_power')) {
    const t = c.serpent ? 0.8 : -0.02, q = c.at(t, 0), up = nrm(add(q.n, [0, 1.5, 0])), along = nrm(sub(c.at(t + 0.2, 0).p, q.p)), side = nrm(crs(up, along));
    const h = new Hull('cy:cy_power'), b0 = add(q.p, scl(up, s * 0.12)), hw = s * 0.32, hh = s * 0.14, hl = s * 0.22;
    h.box(b0, scl(side, hw), scl(up, hh), scl(along, hl), [MAT.paint, MAT.paint, MAT.paint, MAT.frame, MAT.accent, MAT.paint]);
    // cooling fins along the top, a gauge window, handles, the cable glands
    for (let k = -3; k <= 3; k++) h.box(add(b0, add(scl(up, hh + s * 0.03), scl(side, k * hw * 0.26))), scl(side, s * 0.012), scl(up, s * 0.03), scl(along, hl * 0.85), MAT.frame);
    for (const sg of [-1, 1]) h.beam(add(b0, add(scl(side, sg * hw * 1.02), add(scl(along, -hl * 0.6), scl(up, hh * 0.4)))), add(b0, add(scl(side, sg * hw * 1.02), add(scl(along, hl * 0.6), scl(up, hh * 0.4)))), s * 0.03, s * 0.03, up, MAT.steel, 0.3);
    h.box(add(b0, add(scl(along, hl * 1.02), scl(up, hh * 0.1))), scl(side, hw * 0.35), scl(up, hh * 0.45), scl(along, s * 0.01), MAT.glass);
    h.decal({ kind: 'text', o: add(b0, scl(side, hw)), u: along, v: up, h: hh * 0.38, text: 'FC-90', col: ['ink', 1] });
    h.decal({ kind: 'stripes', o: add(b0, add(scl(along, -hl), scl(up, -hh * 0.55))), u: scl(side, -1), v: up, w: hw * 1.8, h: hh * 0.3 });
    h.decal({ kind: 'light', o: add(b0, add(scl(along, -hl), scl(side, hw * 0.6))), u: scl(side, -1), v: up, size: s * 0.035, col: 'green' });
    h.decal({ kind: 'light', o: add(b0, add(scl(along, -hl), add(scl(side, hw * 0.6), scl(up, hh * 0.45)))), u: scl(side, -1), v: up, size: s * 0.035, col: 'green' });
    h.decal({ kind: 'light', o: add(b0, add(scl(along, -hl), add(scl(side, hw * 0.35), scl(up, hh * 0.45)))), u: scl(side, -1), v: up, size: s * 0.035, col: 'red' });
    const w = c.spine(q.p);
    done(h, () => w);
    // cables from the pack to every other fitted part
    const port = add(b0, add(scl(along, hl), scl(up, hh * 0.6)));
    anchors.forEach((a, k) => { const mid = lerp(port, a.at, 0.5), dropTo = c.serpent ? add(c.at(c.serpent ? 0.9 : 0.5, 0).p, scl(up, s * 0.08)) : add(mid, scl(up, s * 0.15)); hose('cy:cy_power:cable' + k, [port, lerp(mid, dropTo, 0.7), a.at], s * 0.022, (p) => (len(sub(p, port)) < len(sub(p, a.at)) ? w : a.skin(p))); });
    for (const lg of c.legs) if (fit.has(lg.fore ? 'cy_hydfore' : 'cy_hydhind') && lg.pair === (lg.fore ? 0 : lg.pair)) {
      const j0 = lg.J[0], sg = lg.side, cuff = add(j0, [sg * lg.r * 1.2, -lg.r * 0.4, 0]);
      hose('cy:cy_power:leg' + lg.pair + sg, [add(port, scl(side, sg * hw)), add(lerp(port, cuff, 0.5), [sg * s * 0.25, s * 0.1, 0]), cuff], s * 0.02, (p) => (p[1] > j0[1] + lg.r ? w : [lg.bones[0], 1]));
    }
  }
  // ------------------------------------------------------------------ armour plating: bolted plates over shoulders, flanks and haunches
  if (fit.has('cy_plating')) {
    const plates: [number, number, number, number, string][] = c.serpent
      ? [[0.15, 0.3, -1.6, 1.6, ''], [0.35, 0.5, -1.6, 1.6, '07'], [0.55, 0.7, -1.6, 1.6, ''], [0.75, 0.9, -1.6, 1.6, '']]
      : [[0.72, 1.0, 0.55, 1.5, '07'], [0.72, 1.0, -1.5, -0.55, '07'], [0.35, 0.66, 0.9, 1.55, ''], [0.35, 0.66, -1.55, -0.9, ''], [-0.08, 0.28, 0.5, 1.45, 'G'], [-0.08, 0.28, -1.45, -0.5, 'G']];
    plates.forEach(([ta, tb, aa, ab, tag], k) => {
      const h = new Hull('cy:cy_plating:' + k), na = 3, nb = 2, G: { p: V3; n: V3 }[][] = [];
      for (let i = 0; i <= nb; i++) { const row: { p: V3; n: V3 }[] = []; for (let j = 0; j <= na; j++) row.push(c.at(ta + (tb - ta) * (i / nb), aa + (ab - aa) * (j / na))); G.push(row); }
      for (let i = 0; i < nb; i++) for (let j = 0; j < na; j++) {
        const q = [G[i][j], G[i][j + 1], G[i + 1][j + 1], G[i + 1][j]], n = nrm(q.reduce((a, b) => add(a, b.n), [0, 0, 0] as V3));
        const pts = q.map((x) => add(x.p, scl(x.n, s * 0.015)));
        // keep the polygon counter-clockwise seen from outside
        const nn = nrm(crs(sub(pts[1], pts[0]), sub(pts[3], pts[0])));
        h.slab(dot(nn, n) > 0 ? pts : [...pts].reverse(), n, s * 0.035, (i + j + k) % 5 === 0 ? MAT.accent : MAT.paint, 0.08);
      }
      if (tag) { const m = c.at((ta + tb) / 2, (aa + ab) / 2), u = nrm(crs([0, 1, 0], m.n)), vv = nrm(crs(m.n, u)); h.decal({ kind: 'text', o: add(m.p, scl(m.n, s * 0.05)), u: scl(u, -1), v: scl(vv, -1), h: s * 0.09, text: tag === 'G' ? serial : tag, col: tag === 'G' ? ['ink', 1] : ['snow', 5] }); }
      const mid = c.at((ta + tb) / 2, (aa + ab) / 2).p, w = c.spine(mid);
      done(h, () => w, 1.6);
    });
  }
  // ------------------------------------------------------------------ hydraulic legs and digging claws
  for (const lg of c.legs) {
    const hyd = fit.has(lg.fore ? 'cy_hydfore' : 'cy_hydhind') && (lg.fore ? lg.pair === 0 : true);
    const dig = lg.fore && lg.pair === 0 && fit.has('cy_digclaw');
    if (hyd) tris += hydraulicLeg(c, lg, look, done);
    if (dig) tris += digClaw(c, lg, done, hyd);
  }
  // ------------------------------------------------------------------ the tool arm
  const tool = ['cy_drill', 'cy_saw', 'cy_welder', 'cy_gripper'].find((t) => fit.has(t));
  if (tool) toolArm(c, tool, done, serial);
  return tris;
}

type Done = (h: Hull, skin: (p: V3) => Wt, k?: number) => void;

/** a hydraulic replacement leg on the leg's own bones: a socket cuff where the stump leaves the body, a boxed strut
 *  per segment, joint hubs with bolt rings, a piston across every joint (the barrel on the upper bone, the chrome
 *  rod on the lower: it telescopes as the joint works), and a padded steel foot with claws */
function hydraulicLeg(c: CyCtx, lg: CyLeg, look: HullLook, done: Done) {
  const J = lg.J, B = lg.bones, r = Math.max(lg.r, c.W * 0.07), sg = lg.side, n = J.length;
  const out: V3 = [sg, 0, 0], fwdOf = (a: V3, b: V3) => nrm(crs(out, sub(b, a)));
  void look;
  // the stump's cuff: a band where the leg leaves the body (rootT along the whole leg)
  const lens = J.slice(1).map((p, k) => len(sub(p, J[k]))), tot = lens.reduce((a, b) => a + b, 0);
  let rem = Math.max(0.04, lg.rootT) * tot, top = J[0];
  for (let k = 0; k < lens.length; k++) { if (rem <= lens[k]) { top = lerp(J[k], J[k + 1], rem / lens[k]); break; } rem -= lens[k]; }
  const segs: Hull[] = [];
  for (let k = 0; k + 1 < n; k++) {
    const a = J[k], b = J[k + 1], h = new Hull(`cy:${lg.fore ? 'cy_hydfore' : 'cy_hydhind'}:${lg.pair}${sg}:${k}`), dir = nrm(sub(b, a)), fw = fwdOf(a, b);
    const rk = r * (k === 0 ? 1 : k === 1 ? 0.8 : 0.65), start = k === 0 ? top : add(a, scl(dir, rk * 0.6)), end = sub(b, scl(dir, rk * 0.55));
    if (k === 0) h.band(top, dir, r * 1.05, r * 0.55, r * 0.2, 8, MAT.frame, 0.06);
    // the strut: twin side plates with the main box between
    h.beam(start, end, rk * 0.8, rk * 1.0, fw, { side: MAT.frame, cap: MAT.frame }, 0.25);
    for (const ss of [-1, 1]) h.beam(add(start, scl(out, ss * rk * 0.47)), add(end, scl(out, ss * rk * 0.47)), rk * 0.14, rk * 1.3, fw, { side: MAT.paint, cap: MAT.frame }, 0);
    // the hub at the lower joint: a fat disc on the side axis with a bolt ring and an accent cap
    const hubR = rk * 0.62;
    h.cyl(add(b, scl(out, -rk * 0.62)), add(b, scl(out, rk * 0.62)), hubR, 8, { side: MAT.frame, cap: MAT.steel }, hubR, fw);
    h.cyl(add(b, scl(out, rk * 0.62)), add(b, scl(out, rk * 0.72)), hubR * 0.55, 8, { side: MAT.frame, cap: MAT.accent }, hubR * 0.55, fw);
    // the piston: a barrel behind the strut on this bone, its chrome rod on the next
    const back = scl(fw, -rk * 0.75), p0 = add(lerp(a, b, 0.25), back), p1 = add(lerp(a, b, 0.78), back);
    h.cyl(p0, p1, rk * 0.2, 8, { side: MAT.frame, cap: MAT.steel });
    h.decal({ kind: 'text', o: add(lerp(start, end, 0.45), scl(out, rk * 0.46)), u: fw, v: scl(dir, -1), h: rk * 0.34, text: k === 0 ? 'HYD' : `${k + 1}`, col: ['ink', 1] });
    if (k === 0) h.decal({ kind: 'stripes', o: add(lerp(start, end, 0.12), scl(fw, rk * 0.56)), u: out, v: dir, w: rk * 0.9, h: rk * 0.3 });
    segs.push(h);
    done(h, () => [B[k], 1], 2.4);
    if (k + 2 <= n - 1 || k + 1 === n - 1) {
      // the rod rides the next bone
      const rod = new Hull(`cy:${lg.fore ? 'cy_hydfore' : 'cy_hydhind'}:rod${lg.pair}${sg}:${k}`), nb = k + 1 < B.length ? B[k + 1] : B[B.length - 1];
      const nx = k + 2 < n ? J[k + 2] : add(b, scl(dir, 0.3));
      rod.cyl(add(lerp(a, b, 0.6), back), add(lerp(b, nx, 0.25), scl(fwdOf(b, nx), -rk * 0.6)), rk * 0.1, 6, MAT.chrome);
      done(rod, () => [nb, 1], 2);
    }
  }
  // the foot: an ankle block, a rubber-soled pad and three short claws
  const sole = J[n - 1], foot = new Hull(`cy:${lg.fore ? 'cy_hydfore' : 'cy_hydhind'}:foot${lg.pair}${sg}`), fz: V3 = [0, 0, 1], side = out, fr = r * 0.9;
  foot.box(add(sole, [0, fr * 0.45, fr * 0.15]), scl(side, fr * 0.75), [0, fr * 0.3, 0], scl(fz, fr * 0.95), [MAT.frame, MAT.frame, MAT.paint, MAT.pad, MAT.paint, MAT.frame]);
  foot.box(add(sole, [0, fr * 0.08, fr * 0.2]), scl(side, fr * 0.85), [0, fr * 0.08, 0], scl(fz, fr * 1.1), MAT.pad);
  for (let k = -1; k <= 1; k++) foot.extrude(add(sole, [k * fr * 0.5, fr * 0.2, fr * 1.05]), add(sole, [k * fr * 0.55, fr * 0.04, fr * 1.55]), [[fr * 0.16, fr * 0.12], [-fr * 0.16, fr * 0.12], [-fr * 0.16, -fr * 0.12], [fr * 0.16, -fr * 0.12]], [0, 1, 0], MAT.steel, 1, 0.25);
  foot.decal({ kind: 'light', o: add(sole, [sg * fr * 0.76, fr * 0.5, fr * 0.3]), u: fz, v: [0, 1, 0], size: fr * 0.12, col: 'amber' });
  done(foot, () => [B[B.length - 1], 1], 2);
  return 0;
}

/** digging claws: a powered wrist housing on the forearm and three hardened scoop blades over the foot */
function digClaw(c: CyCtx, lg: CyLeg, done: Done, hyd: boolean) {
  const J = lg.J, B = lg.bones, n = J.length, r = Math.max(lg.r, c.W * 0.07) * 1.1, sg = lg.side, sole = J[n - 1], out: V3 = [sg, 0, 0];
  const h = new Hull(`cy:cy_digclaw:${lg.pair}${sg}`), wrist = lerp(J[n - 2], sole, hyd ? 0.82 : 0.7), dir = nrm(sub(sole, J[n - 2]));
  h.beam(wrist, add(sole, [0, r * 0.5, r * 0.3]), r * 1.2, r * 1.0, [0, 0, 1], { side: MAT.paint, cap: MAT.frame }, 0.3);
  h.cyl(add(wrist, scl(out, -r * 0.6)), add(wrist, scl(out, r * 0.6)), r * 0.45, 8, { side: MAT.frame, cap: MAT.accent }, r * 0.45, [0, 0, 1]);
  for (let k = -1; k <= 1; k++) {
    // a blade: three tapering segments curling down and back, a sharp steel edge
    const b0 = add(sole, [k * r * 0.42, r * 0.45, r * 0.65]), b1 = add(b0, [k * r * 0.12, -r * 0.05, r * 0.85]), b2 = add(b1, [k * r * 0.05, -r * 0.45, r * 0.35]), b3 = add(b2, [0, -r * 0.35, -r * 0.1]);
    h.beam(b0, b1, r * 0.3, r * 0.22, [0, 1, 0], MAT.paint, 0, 0.85);
    h.beam(b1, b2, r * 0.26, r * 0.18, [0, 1, 0], MAT.steel, 0, 0.75);
    h.extrude(b2, b3, [[r * 0.1, r * 0.07], [-r * 0.1, r * 0.07], [-r * 0.1, -r * 0.07], [r * 0.1, -r * 0.07]], [0, 0, 1], MAT.steel, 1, 0.15);
  }
  h.decal({ kind: 'stripes', o: add(lerp(wrist, sole, 0.4), [sg * r * 0.61, 0, 0]), u: [0, 0, 1], v: [0, 1, 0], w: r * 0.9, h: r * 0.25 });
  void dir;
  done(h, () => [B[B.length - 1], 1], 2.2);
  return 0;
}

/** the tool arm: a turret on the shoulder (or the biped's own arm bones), a boom, an elbow hub with its piston, a
 *  forearm boom and the tool: a fluted rock drill, a guarded saw blade, an arc welder with its gas bottles, or a
 *  three-finger gripper */
function toolArm(c: CyCtx, tool: string, done: Done, serial: string) {
  const s = c.W, arms = c.arms.length ? c.arms : null;
  const build = (name: string, base: V3, elbow: V3, wrist: V3, bone: number, side: number) => {
    const h = new Hull(name), r = s * (c.serpent ? 0.1 : arms ? 0.1 : 0.1), up: V3 = [0, 1, 0];
    const d1 = nrm(sub(elbow, base)), d2 = nrm(sub(wrist, elbow)), axis = nrm(crs(d1, d2).every((x) => Math.abs(x) < 1e-4) ? [side, 0, 0] : crs(d1, d2));
    if (!arms && !c.serpent) {
      // the turret on the shoulder
      h.cyl(sub(base, [0, r * 1.6, 0]), add(base, [0, r * 0.2, 0]), r * 1.5, 8, { side: MAT.frame, cap: MAT.paint }, r * 1.3);
      h.cyl(sub(base, [0, r * 0.75, 0]), sub(base, [0, r * 0.35, 0]), r * 1.62, 8, MAT.accent, r * 1.55);
    }
    h.cyl(add(base, scl(axis, -r * 0.9)), add(base, scl(axis, r * 0.9)), r * 0.9, 8, { side: MAT.frame, cap: MAT.steel }, r * 0.9, d1);
    h.beam(add(base, scl(d1, r * 0.6)), sub(elbow, scl(d1, r * 0.6)), r * 1.1, r * 1.4, axis, { side: MAT.paint, cap: MAT.frame }, 0.25, 0.85);
    h.cyl(add(elbow, scl(axis, -r * 0.8)), add(elbow, scl(axis, r * 0.8)), r * 0.75, 8, { side: MAT.frame, cap: MAT.accent }, r * 0.75, d2);
    h.beam(add(elbow, scl(d2, r * 0.5)), sub(wrist, scl(d2, r * 0.3)), r * 0.85, r * 1.0, axis, { side: MAT.paint, cap: MAT.frame }, 0.25, 0.9);
    // the elbow piston and a hose along the boom
    const pb = add(lerp(base, elbow, 0.3), scl(crs(axis, d1), r * 0.9)), pe = add(lerp(elbow, wrist, 0.25), scl(crs(axis, d2), r * 0.7));
    h.cyl(pb, lerp(pb, pe, 0.55), r * 0.24, 8, { side: MAT.frame, cap: MAT.steel });
    h.cyl(lerp(pb, pe, 0.5), pe, r * 0.12, 6, MAT.chrome);
    h.decal({ kind: 'text', o: add(lerp(base, elbow, 0.5), scl(axis, r * 0.56)), u: d1, v: nrm(crs(d1, axis)), h: r * 0.45, text: serial, col: ['ink', 1] });
    h.decal({ kind: 'stripes', o: add(lerp(elbow, wrist, 0.5), scl(axis, r * 0.43)), u: d2, v: nrm(crs(d2, axis)), w: r * 1.6, h: r * 0.35 });
    // the tool at the wrist
    const tf = frame(d2, up), tw = add(wrist, scl(d2, r * 0.2));
    h.cyl(sub(tw, scl(d2, r * 0.3)), add(tw, scl(d2, r * 0.5)), r * 0.7, 8, { side: MAT.frame, cap: MAT.steel }, r * 0.75);
    if (tool === 'cy_drill') {
      // motor housing, chuck, and a fluted bit as twisted frustum steps
      h.cyl(add(tw, scl(d2, r * 0.5)), add(tw, scl(d2, r * 1.6)), r * 0.85, 10, { side: MAT.paint, cap: MAT.frame }, r * 0.8);
      h.cyl(add(tw, scl(d2, r * 0.95)), add(tw, scl(d2, r * 1.25)), r * 0.92, 10, MAT.frame);
      h.cyl(add(tw, scl(d2, r * 1.6)), add(tw, scl(d2, r * 2.0)), r * 0.5, 8, MAT.brass, r * 0.42);
      for (let k = 0; k < 4; k++) h.cyl(add(tw, scl(d2, r * (2.0 + k * 0.75))), add(tw, scl(d2, r * (2.0 + (k + 1) * 0.75))), r * (0.48 - k * 0.11), 6, MAT.steel, r * Math.max(0.02, 0.4 - k * 0.12), tf.y, 0.5 + k * 0.33);
      h.decal({ kind: 'light', o: add(tw, add(scl(d2, r * 1.0), scl(tf.y, r * 0.82))), u: d2, v: tf.x, size: r * 0.18, col: 'red' });
    } else if (tool === 'cy_saw') {
      const hub = add(tw, scl(d2, r * 1.2)), blade = tf.x;
      h.cyl(add(hub, scl(blade, -r * 0.3)), add(hub, scl(blade, r * 0.3)), r * 0.45, 8, { side: MAT.frame, cap: MAT.brass }, r * 0.45, d2);
      h.cyl(add(hub, scl(blade, -r * 0.05)), add(hub, scl(blade, r * 0.05)), r * 2.0, 14, MAT.steel, r * 2.0, d2);
      for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2, rd = add(scl(d2, Math.cos(a)), scl(tf.y, Math.sin(a))), tg = add(scl(d2, -Math.sin(a)), scl(tf.y, Math.cos(a))); const p = add(hub, scl(rd, r * 2.0)); h.extrude(p, add(p, add(scl(rd, r * 0.22), scl(tg, r * 0.12))), [[r * 0.06, r * 0.04], [-r * 0.06, r * 0.04], [-r * 0.06, -r * 0.04], [r * 0.06, -r * 0.04]], blade, MAT.steel, 1, 0.2); }
      // the guard over the top half
      for (let k = 0; k < 5; k++) { const a0 = Math.PI * (0.05 + k * 0.18), a1 = Math.PI * (0.05 + (k + 1) * 0.18), P = (a: number, rr: number) => add(hub, add(scl(d2, Math.cos(a) * rr), scl(tf.y, Math.sin(a) * rr))); h.beam(add(P(a0, r * 2.25), scl(blade, r * 0.18)), add(P(a1, r * 2.25), scl(blade, r * 0.18)), r * 0.42, r * 0.06, blade, k === 2 ? MAT.hazard : MAT.paint, 0.2); }
    } else if (tool === 'cy_welder') {
      // two gas bottles on the boom, the torch neck and its glowing tip, a little blast shield
      for (const k of [-1, 1]) { const bb = add(lerp(elbow, wrist, 0.45), add(scl(axis, k * r * 0.9), scl(crs(axis, d2), -r * 0.2))); h.cyl(sub(bb, scl(d2, r * 0.9)), add(bb, scl(d2, r * 0.9)), r * 0.32, 8, { side: k < 0 ? MAT.accent : MAT.brass, cap: MAT.steel }); }
      const tip = add(tw, scl(d2, r * 2.4));
      h.cyl(add(tw, scl(d2, r * 0.5)), tip, r * 0.3, 8, MAT.frame, r * 0.18);
      h.cyl(tip, add(tip, scl(d2, r * 0.4)), r * 0.18, 8, { side: MAT.brass, cap: MAT.light }, r * 0.1);
      h.slab([add(tw, add(scl(tf.x, -r * 0.9), scl(tf.y, r * 0.4))), add(tw, add(scl(tf.x, r * 0.9), scl(tf.y, r * 0.4))), add(tw, add(scl(tf.x, r * 0.9), scl(tf.y, r * 1.4))), add(tw, add(scl(tf.x, -r * 0.9), scl(tf.y, r * 1.4)))], d2, r * 0.08, MAT.glass, 0.08, MAT.frame);
    } else {
      // the gripper: three fingers of two phalanges, knuckle hubs, rubber pads
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.3, rd = add(scl(tf.x, Math.cos(a)), scl(tf.y, Math.sin(a)));
        const f0 = add(tw, add(scl(d2, r * 0.5), scl(rd, r * 0.5))), f1 = add(f0, add(scl(d2, r * 1.1), scl(rd, r * 0.35))), f2 = add(f1, add(scl(d2, r * 0.9), scl(rd, -r * 0.45)));
        h.beam(f0, f1, r * 0.35, r * 0.3, rd, MAT.paint, 0.25);
        h.cyl(add(f1, scl(crs(d2, rd), -r * 0.2)), add(f1, scl(crs(d2, rd), r * 0.2)), r * 0.18, 8, MAT.frame, r * 0.18, d2);
        h.beam(f1, f2, r * 0.3, r * 0.25, rd, MAT.frame, 0.25, 0.7);
        h.box(add(f2, scl(rd, -r * 0.1)), scl(crs(d2, rd), r * 0.14), scl(rd, r * 0.05), scl(d2, r * 0.2), MAT.pad);
      }
    }
    done(h, () => [bone, 1], 2.6);
  };
  if (arms) {
    // a biped: the arm itself is the machine
    for (const a of arms) { const elbow = add(lerp(a.A, a.hand, 0.48), [a.side * s * 0.04, -s * 0.05, -s * 0.08]); build(`cy:${tool}:${a.side}`, a.A, elbow, a.hand, a.bone, a.side); }
  } else if (c.serpent) {
    const Hd = c.head, base = add(Hd.c, scl(Hd.fwd, Hd.hl * 0.25));
    build(`cy:${tool}`, base, add(base, scl(Hd.fwd, Hd.hl * 0.35)), add(base, add(scl(Hd.fwd, Hd.hl * 0.7), scl(Hd.up, -Hd.hh * 0.05))), Hd.bone, 1);
  } else {
    // a boom on the right shoulder like an excavator's: up and forward to the elbow, then forward and down, the
    // tool held out ahead of the forelegs beside the head
    const sh = c.at(1.0, 0.7), base = add(sh.p, scl(sh.n, s * 0.1));
    const elbow = add(base, [s * 0.16, s * 0.42, s * 0.5]), wrist = add(elbow, [s * 0.06, -s * 0.36, s * 0.62]);
    build(`cy:${tool}`, base, elbow, wrist, c.chest, 1);
  }
  void perp;
}
