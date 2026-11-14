// Parts for the carrier, each built where it is needed and for a reason: railings and ladders where crew walk,
// floodlights on brackets where something needs lighting, RCS thruster quads at the corners that steer the ship,
// pipe runs with their clamps, louvred vents over the machinery spaces, dishes and whips on the masts, landing
// craft in their davits, containers on the racks, propellant spheres with their manifolds.
import * as THREE from 'three';
import { Builder, bendPath, TAU, type Skin, type V } from './geo';
import type { FxReg } from './fx';

export const V3 = THREE.Vector3;
export type SkinFn = (name: string, ppm?: number, bucket?: string) => Skin;

export interface Ctx {
  B: Builder;          // the hero detail (static)
  L: Builder;          // the low-detail stand-in (shown when the ship is small on screen)
  s: SkinFn;
  fx: FxReg;
}

/** a railing between two points at deck height y: stanchions every ~1.6 m, top and knee rails */
export function railing(B: Builder, s: Skin, a: V, b: V, h = 1.1) {
  const d = b.clone().sub(a), n = Math.max(1, Math.round(d.length() / 1.6));
  for (let i = 0; i <= n; i++) { const p = a.clone().addScaledVector(d, i / n); B.beam(s, p, p.clone().setY(p.y + h), 0.07); }
  B.beam(s, a.clone().setY(a.y + h), b.clone().setY(b.y + h), 0.06); B.beam(s, a.clone().setY(a.y + h * 0.55), b.clone().setY(b.y + h * 0.55), 0.045);
}
/** a ladder up a wall from y0 to y1 at (x, z), standing off along `out` (unit, horizontal) */
export function ladder(B: Builder, s: Skin, x: number, z: number, y0: number, y1: number, out: V) {
  const side = new V3(-out.z, 0, out.x).multiplyScalar(0.3), o = out.clone().multiplyScalar(0.25);
  for (const k of [-1, 1]) B.beam(s, new V3(x, y0, z).add(o).addScaledVector(side, k), new V3(x, y1 + 0.9, z).add(o).addScaledVector(side, k), 0.05);
  for (let y = y0 + 0.3; y < y1; y += 0.35) B.beam(s, new V3(x, y, z).add(o).addScaledVector(side, -1), new V3(x, y, z).add(o).addScaledVector(side, 1), 0.035);
  // standoff brackets
  for (let y = y0 + 1; y < y1; y += 3) for (const k of [-1, 1]) B.beam(s, new V3(x, y, z).addScaledVector(side, k), new V3(x, y, z).add(o).addScaledVector(side, k), 0.04);
}
/** a floodlight on a bracket: housing, lens (emissive), yoke; registers its beam and light pool with the fx */
export function flood(C: Ctx, at: V, aim: V, o: { len?: number; spread?: number; real?: boolean; pool?: { n: V; w: number; h: number; at?: V } ; k?: number } = {}) {
  const { B, s } = C;
  const dir = aim.clone().sub(at).normalize();
  B.beam(s('gunT', 32), at.clone().addScaledVector(dir, -0.2).setY(at.y - 0.9), at.clone().addScaledVector(dir, -0.2), 0.12);
  B.along(at, dir);
  B.cyl(s('gunT', 32), 0.42, 0.34, 0.9, 10, { cap: s('lensWhite', 1, 'm') });
  B.at(0, 0.47, 0); B.cyl(s('lensWhite', 1), 0.33, 0.33, 0.04, 10); B.pop();
  B.at(0, -0.3, 0); B.box(s('gunT', 32), 0.95, 0.12, 0.12); B.pop();
  B.pop();
  C.fx.floods.push({ p: at.clone().addScaledVector(dir, 0.5), dir, len: o.len ?? 18, spread: o.spread ?? 0.32, k: o.k ?? 1 });
  if (o.pool) C.fx.pools.push({ p: (o.pool.at ?? aim).clone(), n: o.pool.n.clone(), w: o.pool.w, h: o.pool.h, from: at.clone() });
}
/** an RCS thruster quad: a block with four nozzles, out along a face normal plus the three it can see */
export function rcs(B: Builder, s: SkinFn, at: V, out: V) {
  B.along(at, out);
  B.box(s('hullB', 16), 1.5, 1.2, 1.5, { bev: 0.12 });
  B.at(0, 0.62, 0); B.box(s('haz', 16), 1.3, 0.06, 1.3); B.pop();
  for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
    B.at(x * 0.8, 0.1, z * 0.8, z * Math.PI / 2, 0, -x * Math.PI / 2); B.cyl(s('gunT', 32), 0.12, 0.26, 0.5, 8, { caps: false }); B.pop();
  }
  B.at(0, 0.85, 0); B.cyl(s('gunT', 32), 0.12, 0.28, 0.5, 8, { caps: false }); B.pop();
  B.pop();
}
/** a pipe run with clamps every `every` m and flanges at the ends */
export function pipe(B: Builder, s: Skin, clampS: Skin, pts: V[], r: number, every = 3, bend = 0.8) {
  const path = bendPath(pts, bend, 3);
  B.tube(s, path, r, r > 0.4 ? 10 : 7);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], d = b.clone().sub(a), L = d.length(); d.normalize();
    for (let t = (every - acc % every); t < L - bend; t += every) { B.along(a.clone().addScaledVector(d, t), d); B.cyl(clampS, r * 1.35, r * 1.35, 0.18, 8); B.pop(); }
    acc += L;
  }
  for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]] as [V, V][]) { B.along(p, q.clone().sub(p)); B.cyl(clampS, r * 1.6, r * 1.6, 0.25, 8); B.pop(); }
}
/** a whip antenna with its base insulator */
export function whip(B: Builder, s: SkinFn, at: V, h: number, lean = new V3()) {
  B.at(at.x, at.y + 0.3, at.z); B.cyl(s('brassC', 4), 0.12, 0.18, 0.6, 6); B.pop();
  B.rod(s('steelC', 4), at.clone().setY(at.y + 0.5), at.clone().add(lean).setY(at.y + h), 0.04, 4);
}
/** a parabolic dish (concave toward local +y) with its feed horn on three struts */
export function dish(B: Builder, s: SkinFn, R: number, o: { feed?: boolean; ribs?: number } = {}) {
  const f = R * 0.55, prof: [number, number][] = [];
  for (let i = 0; i <= 6; i++) { const r = (i / 6) * R; prof.push([r, (r * r) / (4 * f)]); }
  B.lathe(s('steelC', 6), prof, 20, { flip: true });
  B.at(0, -0.12, 0); B.lathe(s('hullA', 16), prof, 20); B.pop();
  const rim = prof[prof.length - 1][1];
  // backing ribs and the hub
  B.at(0, -0.3, 0); B.cyl(s('gunT', 32), R * 0.18, R * 0.25, 0.6, 10); B.pop();
  const ribs = o.ribs ?? 6;
  for (let i = 0; i < ribs; i++) { const a = (i / ribs) * TAU; B.beam(s('gunT', 32), new V3(Math.cos(a) * R * 0.2, -0.25, Math.sin(a) * R * 0.2), new V3(Math.cos(a) * R, rim - 0.15, Math.sin(a) * R), 0.08); }
  if (o.feed !== false) {
    const fy = f * 0.95;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; B.beam(s('steelC', 6), new V3(Math.cos(a) * R * 0.85, rim * 0.9, Math.sin(a) * R * 0.85), new V3(0, fy, 0), 0.05); }
    B.at(0, fy, 0); B.cyl(s('brassC', 4), 0.18, 0.3, 0.5, 8); B.pop();
  }
}
/** a louvred vent box on a wall (front face = local +z) */
export function ventBox(B: Builder, s: SkinFn, w: number, h: number, kind = 0) {
  B.box(s('hullB', 16), w + 0.2, h + 0.2, 0.3, { bev: 0.06 });
  B.at(0, 0, 0.16); B.panel(s('vent' + kind, 1), w, h); B.pop();
}
/** a numbered hatch plate on a wall (front = local +z) */
export function hatch(B: Builder, s: SkinFn, n: number, size = 3) {
  B.box(s('hullB', 16), size + 0.3, size + 0.3, 0.2, { bev: 0.08 });
  B.at(0, 0, 0.11); B.panel(s('hatch' + n, 1), size, size); B.pop();
}
/** a decal (transparent lettering / roundel) on a surface: centre, outward normal, width (height from the art), up in the surface */
export function decal(B: Builder, s: SkinFn, name: string, at: V, n: V, w: number, up = new V3(0, 1, 0)) {
  const sk = s(name, 1, 'd'), aspect = sk.r[2] / sk.r[3];
  const z = n.clone().normalize(), x = up.clone().cross(z).normalize(), y = z.clone().cross(x);
  B.push(new THREE.Matrix4().makeBasis(x, y, z).setPosition(at.clone().addScaledVector(z, 0.04)));
  B.panel(sk, w, w / aspect);
  B.pop();
}

/**
 * A Planetary Corps landing craft (PC class, ~12 m): a flat-bottomed lifting body, delta wings with tip fins,
 * a dorsal fin, twin rockets, a lit canopy band. Nose to local +z, belly down.
 */
export function craft(B: Builder, s: SkinFn, label: string) {
  const sk = s('olive', 16), dark = s('gunT', 32), red = s('redC', 8);
  const st = (z: number, hw: number, top: number, bot: number) => ({ z, pts: [[hw * 0.7, bot], [hw, bot + (top - bot) * 0.3], [hw * 0.85, top - (top - bot) * 0.15], [hw * 0.35, top], [-hw * 0.35, top], [-hw * 0.85, top - (top - bot) * 0.15], [-hw, bot + (top - bot) * 0.3], [-hw * 0.7, bot]] as [number, number][] });
  B.loft(sk, [st(-6, 1.5, 1.4, -1.0), st(-3.5, 2.0, 1.9, -1.2), st(1.5, 2.0, 1.8, -1.2), st(4.2, 1.5, 1.2, -1.0), st(6.0, 0.7, 0.5, -0.7), st(6.9, 0.2, 0.0, -0.4)]);
  // red band, canopy glazing
  B.at(0, 0.3, 0.5); B.box(red, 4.08, 3.0, 0.6, { skip: 'pyny' }); B.pop();
  for (const sx of [-1, 1]) { B.push(new THREE.Matrix4().makeRotationY(sx * Math.PI / 2 - sx * 0.18).setPosition(sx * 1.66, 1.15, 4.0)); B.panel(s('winA', 16), 2.0, 0.6, 0.12); B.pop(); }
  B.at(0, 1.4, 3.6, -0.75, 0, 0); B.panel(s('winBridge', 16), 1.6, 0.9, 0.1); B.pop();
  // delta wings with tip fins, twin rockets
  for (const sx of [-1, 1]) {
    const W = [[1.8, 1.2], [3.9, -3.6], [3.9, -5.4], [1.8, -5.6]];
    const top = W.map(([x, z]) => new V3(sx * x, -0.55, z)), bot = W.map(([x, z]) => new V3(sx * x, -0.85, z)), c = new V3(sx * 3.5, -0.7, -3);
    B.poly(sk, top, new V3(sx * 3.5, -10, -3)); B.poly(sk, bot, new V3(sx * 3.5, 10, -3));
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; B.poly(sk, [top[i], top[j], bot[j], bot[i]], c); }
    B.at(sx * 3.96, -0.6, -5.4, 0, -Math.PI / 2, 0); B.prism(sk, [[0, 0], [1.8, 0], [0.5, 1.4], [0, 1.4]], -0.06, 0.06); B.pop();
    B.at(sx * 0.8, 0, -6.3, -Math.PI / 2, 0, 0); B.cyl(dark, 0.36, 0.52, 0.9, 10, { caps: false }); B.pop();
    B.at(sx * 0.8, 0, -6.15, -Math.PI / 2, 0, 0); B.cyl(s('dark', 1), 0.4, 0.4, 0.05, 10); B.pop();
  }
  // dorsal fin
  B.at(0, 1.3, -5.6, 0, -Math.PI / 2, 0); B.prism(sk, [[0, 0], [3.2, 0], [0.6, 2.4], [0, 2.4]], -0.07, 0.07); B.pop();
  // top hatch and the name
  B.at(0, 1.92, -0.5); B.cyl(dark, 0.6, 0.6, 0.12, 10); B.pop();
  for (const sx of [-1, 1]) decal(B, s, 'tPC' + label, new V3(sx * 2.02, 0.4, -2.0), new V3(sx, 0, 0), 2.4);
}

/** a 12 m freight container (along local z) with corner castings */
export function container(B: Builder, s: SkinFn, kind: 'contOlive' | 'contRust' | 'contBlue', len = 12) {
  B.box(s(kind, 16), 2.6, 2.6, len, { bev: 0.05, top: s('hullB', 16) });
  for (const x of [-1.25, 1.25]) for (const y of [-1.25, 1.25]) for (const z of [-len / 2 + 0.15, len / 2 - 0.15]) { B.at(x, y, z); B.box(s('gunT', 32), 0.3, 0.3, 0.3); B.pop(); }
}
/** a spherical propellant tank with its girth ring, top valve and bottom outlet */
export function tank(B: Builder, s: SkinFn, r: number) {
  B.sphere(s('tank', 16), r, 18, 12);
  B.at(0, 0, 0); B.cyl(s('gunT', 32), r * 1.02, r * 1.02, 0.5, 18, { caps: false }); B.pop();
  B.at(0, r + 0.2, 0); B.cyl(s('gunT', 32), 0.5, 0.6, 0.6, 8); B.pop();
  B.at(0, r + 0.6, 0); B.cyl(s('redC', 8), 0.3, 0.3, 0.3, 8); B.pop();
  B.at(0, -r - 0.3, 0); B.cyl(s('gunT', 32), 0.7, 0.5, 0.8, 8); B.pop();
}
