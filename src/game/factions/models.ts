// The enemy programmes' hardware, built from the kit (livery.ts): 1957 riveted steel, enamel paint, stencils.
// Structures: landers (the HQ), mining rigs, assembly halls, bunkers, artillery, watchtowers, radio masts, fuel
// depots, expedition tents. Placeholder robots (used until src/robots provides spawnRobot) are built here too.
// Each model is cached per faction + kind (+ base name for the serial on the lander).
import * as THREE from 'three';
import { Kit, LIVERY, atlas, textRect, type KitGeo, type V3 } from './livery';
import { RAMPS } from '../../art/palette';
import type { FactionId } from './plan';

export type SKind = 'lander' | 'miner' | 'factory' | 'bunker' | 'artillery' | 'tower' | 'mast' | 'depot' | 'tent';
export interface SModel {
  main: KitGeo;
  /** a part that turns (turret, searchlight, drill wheel, gun) */
  turn?: KitGeo; turnAt?: V3; turnAxis?: 'y' | 'x' | 'z';
  /** muzzle, local to the turning part (or the model) */
  muzzle?: V3;
  /** smoke stacks (local) */
  stacks?: V3[];
  height: number;
}
const CACHE = new Map<string, SModel>();
const ST = RAMPS.stone, SS = RAMPS.steel, SAND = RAMPS.sand;
const LAMPR = 0xc8705a, LAMPW = RAMPS.glowAmber[4];

export function structureModel(f: FactionId, kind: SKind, name = ''): SModel {
  const key = `${f}:${kind}:${kind === 'lander' ? name : ''}`;
  let m = CACHE.get(key);
  if (!m) CACHE.set(key, (m = build(f, kind, name)));
  return m;
}

function build(f: FactionId, kind: SKind, name: string): SModel {
  switch (kind) {
    case 'lander': return f === 'soviet' ? sovLander(name) : f === 'prc' ? prcLander(name) : expCapsule(name);
    case 'miner': return f === 'prc' ? prcMiner() : sovMiner(f);
    case 'factory': return f === 'prc' ? prcFactory() : sovFactory(f);
    case 'bunker': return bunker(f);
    case 'artillery': return artillery(f);
    case 'tower': return tower(f);
    case 'mast': return mast(f);
    case 'depot': return depot(f);
    case 'tent': return tent(f);
  }
}

// ------------------------------------------------------------------------------------------------ shared bits
function ladder(k: Kit, a: V3, b: V3, col: number, w = 0.32) {
  const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, px = (-dz / l) * w / 2, pz = (dx / l) * w / 2;
  k.rod([a[0] + px, a[1], a[2] + pz], [b[0] + px, b[1], b[2] + pz], 0.025, col, 4);
  k.rod([a[0] - px, a[1], a[2] - pz], [b[0] - px, b[1], b[2] - pz], 0.025, col, 4);
  const n = Math.max(2, Math.round((b[1] - a[1]) / 0.3));
  for (let i = 1; i < n; i++) { const t = i / n; const c: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; k.rod([c[0] + px, c[1], c[2] + pz], [c[0] - px, c[1], c[2] - pz], 0.018, col, 4); }
}
/** a lattice of four legs from ground to h, braced */
function lattice(k: Kit, cx: number, cz: number, rb: number, rt: number, h: number, col: number, bays = 4) {
  const c = (r: number, i: number, y: number): V3 => [cx + (i & 1 ? r : -r), y, cz + (i & 2 ? r : -r)];
  for (let i = 0; i < 4; i++) k.rod(c(rb, i, 0), c(rt, i, h), 0.045, col, 5);
  for (let b = 0; b < bays; b++) {
    const y0 = (b / bays) * h, y1 = ((b + 1) / bays) * h, r0 = rb + (rt - rb) * (b / bays), r1 = rb + (rt - rb) * ((b + 1) / bays);
    for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0]]) { k.rod(c(r0, i, y0), c(r1, j, y1), 0.022, col, 4); k.rod(c(r1, i, y1), c(r1, j, y1), 0.022, col, 4); }
  }
}
function sandbags(k: Kit, cx: number, cz: number, R: number, n: number, from = 0, to = Math.PI * 2, rows = 2) {
  for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) {
    const a = from + (to - from) * ((i + (r % 2) * 0.5) / n);
    k.box(0.5, 0.2, 0.3, [cx + Math.cos(a) * R, 0.1 + r * 0.19, cz + Math.sin(a) * R], SAND[2 + ((i + r) % 2)], [0, -a + Math.PI / 2 + (i % 3) * 0.05, 0]);
  }
}
function legPad(k: Kit, top: V3, foot: V3, col: number, pad: number) {
  k.rod(top, foot, 0.09, col, 6);
  k.cyl(0.42, 0.5, 0.1, [foot[0], 0.05, foot[2]], pad, 10);
  k.rod([top[0] * 0.55, top[1] - 0.5, top[2] * 0.55], [foot[0] * 0.85, foot[1] + 0.35, foot[2] * 0.85], 0.05, col, 5);
}

// ------------------------------------------------------------------------------------------------ landers
/** Soviet: a riveted octagonal service drum on four splayed legs, a spherical descent module, strapped fuel spheres */
function sovLander(name: string): SModel {
  const L = LIVERY.soviet, A = atlas('soviet', name), k = new Kit();
  // legs
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + (i * Math.PI) / 2; legPad(k, [Math.cos(a) * 1.7, 1.6, Math.sin(a) * 1.7], [Math.cos(a) * 3.1, 0.1, Math.sin(a) * 3.1], L.metal, L.dark); k.lamp(0.07, [Math.cos(a) * 3.1, 0.25, Math.sin(a) * 3.1], LAMPW); }
  // engine bells under the drum
  k.cone(0.75, 0.9, [0, 0.95, 0], L.dark, 12, [Math.PI, 0, 0]);
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; k.cone(0.3, 0.55, [Math.cos(a) * 1.1, 1.1, Math.sin(a) * 1.1], SS[2], 8, [Math.PI, 0, 0]); }
  // service drum
  const D8 = -Math.PI / 8; // drum faces centred on 0, 45, 90... degrees
  k.cyl(2.2, 2.2, 1.9, [0, 2.35, 0], L.hull, 8, [0, D8, 0]);
  k.cyl(2.28, 2.28, 0.14, [0, 1.42, 0], L.hull2, 8, [0, D8, 0]); k.cyl(2.28, 2.28, 0.14, [0, 3.28, 0], L.hull2, 8, [0, D8, 0]);
  k.rivetPoly(0, 1.6, 0, 2.2, 8, 5, SS[5], D8); k.rivetPoly(0, 3.12, 0, 2.2, 8, 5, SS[5], D8);
  for (let i = 0; i < 8; i++) { const a = D8 + (i * Math.PI) / 4; k.box(0.07, 1.75, 0.07, [Math.sin(a) * 2.2, 2.35, Math.cos(a) * 2.2], L.hull2, [0, a, 0]); }
  // fuel spheres strapped to the drum
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; k.ball(0.55, [Math.cos(a) * 2.45, 2.4, Math.sin(a) * 2.45], SS[4], 10); k.torus(0.56, 0.035, [Math.cos(a) * 2.45, 2.4, Math.sin(a) * 2.45], L.dark); }
  // descent sphere on a collar
  k.cyl(1.3, 1.7, 0.45, [0, 3.55, 0], L.hull2, 16);
  k.ball(1.65, [0, 4.85, 0], L.hull, 18);
  k.torus(1.66, 0.05, [0, 4.85, 0], L.hull2, [Math.PI / 2, 0, 0], 28);
  k.rivetRing(0, 4.85, 0, 1.66, 40, SS[5], 0.04);
  // portholes and the hatch (facing +Z)
  for (const a of [-0.6, 0.6]) { const x = Math.sin(a) * 1.6, z = Math.cos(a) * 1.6; k.cyl(0.2, 0.2, 0.08, [x, 5.25, z], SS[5], 12, [Math.PI / 2, 0, -a]); k.add(new THREE.CylinderGeometry(0.15, 0.15, 0.1, 12), L.glass, [x * 1.01, 5.25, z * 1.01], [Math.PI / 2, 0, -a]); }
  k.cyl(0.55, 0.55, 0.1, [0, 4.6, 1.64], SS[4], 14, [Math.PI / 2, 0, 0]); k.rivetRing(0, 4.6, 1.7, 0.48, 0, SS[5]);
  k.box(0.08, 0.3, 0.08, [0.45, 4.6, 1.7], SS[2]);
  // antennae and dish
  k.rod([0, 6.4, 0], [0, 7.6, 0], 0.05, SS[5]); k.lamp(0.09, [0, 7.65, 0], LAMPR);
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + 0.3; k.rod([Math.cos(a) * 0.9, 6.0, Math.sin(a) * 0.9], [Math.cos(a) * 2.6, 5.0, Math.sin(a) * 2.6], 0.02, SS[5], 4); }
  k.cyl(0.5, 0.08, 0.25, [1.0, 6.2, -0.4], SS[5], 14, [0.6, 0, 0.5]);
  // ladder up a leg to the hatch
  ladder(k, [0.2, 0, 3.2], [0.2, 3.3, 2.3], SS[5]);
  // livery: a red star on the sphere, the nation mark and the base name on the drum, danger band on the legs
  k.decal(A.star, 1.5, 1.5, [0, 5.3, 1.66], 0, -0.25);
  k.decal(A.star, 1.1, 1.1, [0, 5.0, -1.66], Math.PI, 0.15);
  for (let i = 0; i < 8; i++) {
    const f = i; // face f is centred at D8 + (f + 0.5) * 45 degrees = f * 45 degrees (0 faces +Z, toward Unit 07)
    if (i === 0) k.faceDecal(textRect(A, 0, true), 1.4, 0.32, 2.2, 8, f, 2.7, D8);
    else if (i % 2) k.faceDecal(textRect(A, 1, true), 1.4, 0.3, 2.2, 8, f, 2.7, D8);
    else if (i === 2 || i === 6) k.faceDecal(A.star, 0.8, 0.8, 2.2, 8, f, 2.45, D8);
    else k.faceDecal(textRect(A, 4, true), 1.4, 0.3, 2.2, 8, f, 2.7, D8);
    k.faceDecal(textRect(A, 3 + i, true), 0.9, 0.18, 2.2, 8, f, 1.95, D8);
  }
  return { main: k.build(), height: 7.7 };
}
/** PRC: a slimmer standing rocket body on three legs with fins, an ogive nose, red bands */
function prcLander(name: string): SModel {
  const L = LIVERY.prc, A = atlas('prc', name), k = new Kit();
  for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3 + Math.PI / 6; legPad(k, [Math.cos(a) * 1.1, 1.4, Math.sin(a) * 1.1], [Math.cos(a) * 2.5, 0.1, Math.sin(a) * 2.5], L.metal, L.dark); }
  k.cone(0.7, 0.7, [0, 0.85, 0], L.dark, 14, [Math.PI, 0, 0]);
  k.cyl(1.25, 1.35, 1.0, [0, 1.7, 0], L.hull2, 18);
  k.cyl(1.25, 1.25, 3.2, [0, 3.8, 0], L.hull, 20);
  k.cyl(1.27, 1.27, 0.28, [0, 2.5, 0], L.accent, 20); k.cyl(1.27, 1.27, 0.12, [0, 5.1, 0], L.accent, 20);
  k.add(new THREE.SphereGeometry(1.25, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), L.hull, [0, 5.4, 0], [0, 0, 0], [1, 1.6, 1]);
  k.cyl(0.08, 0.12, 0.6, [0, 7.6, 0], SS[5], 8); k.lamp(0.08, [0, 7.95, 0], LAMPR);
  // fins
  for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3 - Math.PI / 6; k.box(0.07, 1.6, 0.9, [Math.cos(a) * 1.55, 1.9, Math.sin(a) * 1.55], L.accent, [0, -a, 0.12 * 0]); }
  // panel seams, windows, hatch and a boarding ramp toward +Z
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; k.box(0.03, 3.1, 0.03, [Math.cos(a) * 1.255, 3.8, Math.sin(a) * 1.255], L.hull2, [0, -a, 0]); }
  for (const y of [4.6]) for (const a of [-0.5, 0, 0.5]) k.add(new THREE.CylinderGeometry(0.14, 0.14, 0.06, 12), L.glass, [Math.sin(a) * 1.25, y, Math.cos(a) * 1.25], [Math.PI / 2, 0, -a]);
  k.box(0.9, 1.4, 0.06, [0, 2.95, 1.25], SS[4]);
  k.box(0.8, 0.05, 2.0, [0, 1.25, 2.05], SS[4], [0.62, 0, 0]);
  for (let i = 0; i < 5; i++) k.box(0.8, 0.03, 0.04, [0, 0.55 + i * 0.32, 2.75 - i * 0.37], SS[2]);
  k.lampBox(0.2, 0.06, 0.04, [0, 3.75, 1.29], LAMPW);
  // livery: star, the nation mark, the base name
  k.decal(A.star, 1.0, 1.0, [0, 3.95, 1.26], 0);
  k.decal(textRect(A, 0), 1.1, 0.24, [0, 3.2, 1.26], 0);
  k.decal(A.star, 0.8, 0.8, [Math.sin(Math.PI * 0.75) * 1.26, 3.95, Math.cos(Math.PI * 0.75) * 1.26], Math.PI * 0.75);
  k.decal(textRect(A, 1), 1.1, 0.24, [Math.sin(-Math.PI * 0.75) * 1.26, 3.95, Math.cos(-Math.PI * 0.75) * 1.26], -Math.PI * 0.75);
  k.decal(textRect(A, 4), 0.8, 0.17, [Math.sin(Math.PI) * 1.26, 2.1, Math.cos(Math.PI) * 1.26], Math.PI);
  return { main: k.build(), height: 8 };
}
/** a private expedition's capsule: a bell on a tripod, safety bands, its chute spilled beside it */
function expCapsule(name: string): SModel {
  const L = LIVERY.expedition, A = atlas('expedition', name), k = new Kit();
  for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; legPad(k, [Math.cos(a) * 0.9, 0.9, Math.sin(a) * 0.9], [Math.cos(a) * 1.7, 0.1, Math.sin(a) * 1.7], L.metal, L.dark); }
  k.cyl(1.25, 1.3, 0.3, [0, 0.95, 0], SS[2], 18); // heat shield
  k.cyl(0.65, 1.2, 1.7, [0, 1.95, 0], L.hull, 18);
  k.cyl(0.66, 0.66, 0.5, [0, 3.05, 0], L.hull2, 14);
  k.cyl(0.67, 0.67, 0.12, [0, 2.55, 0], L.accent, 16); k.cyl(1.21, 1.21, 0.1, [0, 1.15, 0], L.accent, 18);
  k.rivetRing(0, 1.3, 0, 1.15, 26, SS[5], 0.035);
  k.box(0.55, 0.8, 0.06, [0, 1.9, 0.98], SS[4], [-0.28, 0, 0]);
  k.add(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), L.glass, [0.55, 2.2, 0.75], [Math.PI / 2 - 0.28, 0, -0.6]);
  k.rod([0, 3.3, 0], [0, 4.2, 0], 0.03, SS[5]); k.lamp(0.07, [0, 4.22, 0], LAMPW);
  // chute: a slumped canopy on the ground and its shroud lines
  k.add(new THREE.SphereGeometry(1.3, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), L.trim, [-2.6, 0, -1.4], [0.2, 0.4, 0.15], [1.3, 0.28, 1]);
  for (let i = 0; i < 4; i++) k.rod([-2.6 + Math.cos(i) * 1.2, 0.15, -1.4 + Math.sin(i) * 0.8], [0, 3.2, 0], 0.01, RAMPS.paper[2], 3);
  k.decal(A.star, 0.7, 0.7, [0, 2.1, 0.94], 0, -0.29);
  k.decal(textRect(A, 1), 1.0, 0.2, [0, 1.55, 1.08], 0, -0.29);
  k.decal(A.hazard, 0.5, 0.25, [Math.sin(2) * 0.95, 1.7, Math.cos(2) * 0.95], 2, -0.28);
  return { main: k.build(), height: 4.2 };
}

// ------------------------------------------------------------------------------------------------ mining rigs
function sovMiner(f: FactionId): SModel {
  const L = LIVERY[f], A = atlas(f), k = new Kit(), t = new Kit();
  lattice(k, 0, 0, 0.9, 0.18, 3.2, L.metal, 3);
  k.box(0.5, 0.25, 0.5, [0, 3.25, 0], SS[3]);
  k.cyl(0.07, 0.07, 3.0, [0, 1.5, 0], SS[5], 6); // drill string
  k.box(1.3, 0.85, 0.9, [1.2, 0.45, 0], L.hull, [0, 0, 0]); // motor house
  k.box(1.35, 0.1, 0.95, [1.2, 0.9, 0], L.hull2);
  k.cyl(0.08, 0.08, 0.7, [1.6, 1.2, 0.25], SS[2], 6);
  k.rivetRow([0.58, 0.8, 0.46], [1.82, 0.8, 0.46], 9, SS[5]);
  k.box(0.9, 0.6, 0.8, [-1.2, 0.45, 0.3], SS[3], [0, 0.1, 0]); // ore hopper
  k.box(1.0, 0.1, 0.9, [-1.2, 0.8, 0.3], SS[2], [0, 0.1, 0]);
  k.box(0.6, 0.05, 1.6, [-0.5, 0.55, 0.9], SS[2], [0.25, 0.3, 0]); // chute
  k.lamp(0.06, [0, 3.45, 0], LAMPR);
  k.decal(A.star, 0.55, 0.55, [1.2, 0.5, 0.455], 0);
  k.decal(textRect(A, 12, f === 'soviet'), 1.0, 0.2, [1.2, 0.5, -0.455], Math.PI);
  // the turning winch wheel at the crown
  t.torus(0.32, 0.05, [0, 0, 0], SS[4], [0, 0, 0], 14);
  for (let i = 0; i < 4; i++) t.box(0.6, 0.04, 0.04, [0, 0, 0], SS[4], [0, 0, (i * Math.PI) / 4]);
  return { main: k.build(), turn: t.build(), turnAt: [0, 3.55, 0], turnAxis: 'z', height: 3.6 };
}
/** PRC: a low bucket-wheel digger feeding a conveyor to a hopper */
function prcMiner(): SModel {
  const L = LIVERY.prc, A = atlas('prc'), k = new Kit(), t = new Kit();
  k.box(1.6, 0.7, 1.1, [0, 0.45, 0], L.hull);
  k.box(1.65, 0.12, 1.15, [0, 0.82, 0], L.accent);
  k.box(1.7, 0.3, 0.3, [0, 0.15, 0.55], L.dark); k.box(1.7, 0.3, 0.3, [0, 0.15, -0.55], L.dark);
  k.box(0.6, 0.5, 0.6, [-0.3, 1.1, 0], L.hull2);
  k.add(new THREE.BoxGeometry(0.45, 0.3, 0.05), L.glass, [-0.3, 1.15, 0.31]);
  k.rod([0.6, 0.8, 0], [1.8, 1.3, 0], 0.07, L.metal); k.rod([0.6, 0.6, 0.25], [1.8, 1.3, 0.2], 0.05, L.metal);
  k.box(2.2, 0.06, 0.5, [-1.5, 1.0, 0], SS[3], [0, 0, 0.4]); // conveyor
  for (let i = 0; i < 6; i++) k.box(0.05, 0.08, 0.5, [-0.6 - i * 0.33, 0.68 + i * 0.14, 0], SS[1], [0, 0, 0.4]);
  k.rod([-2.4, 0, 0.2], [-2.4, 1.4, 0.2], 0.04, L.metal); k.rod([-2.4, 0, -0.2], [-2.4, 1.4, -0.2], 0.04, L.metal);
  k.cone(0.55, 0.7, [-2.4, 1.6, 0], SS[3], 4, [Math.PI, Math.PI / 4, 0]);
  k.lamp(0.05, [-0.3, 1.4, 0.2], LAMPW);
  k.decal(A.star, 0.45, 0.45, [0.4, 0.5, 0.556], 0);
  k.decal(textRect(A, 9), 0.8, 0.17, [-0.3, 0.5, -0.556], Math.PI);
  // the bucket wheel
  t.torus(0.55, 0.06, [0, 0, 0], L.metal, [0, 0, 0], 16);
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; t.box(0.22, 0.18, 0.3, [Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0], SS[2], [0, 0, a]); }
  return { main: k.build(), turn: t.build(), turnAt: [1.85, 1.3, 0], turnAxis: 'z', height: 1.9 };
}

// ------------------------------------------------------------------------------------------------ assembly halls
function sovFactory(f: FactionId): SModel {
  const L = LIVERY[f], A = atlas(f), k = new Kit();
  k.box(4.6, 0.25, 3.6, [0, 0.12, 0], ST[3]); // slab
  k.box(4.2, 1.9, 3.2, [0, 1.15, 0], L.hull);
  k.add(new THREE.CylinderGeometry(1.6, 1.6, 4.2, 16, 1, false, 0, Math.PI), L.hull2, [0, 2.1, 0], [0, 0, Math.PI / 2], [0.42, 1, 1]);
  for (let i = 0; i < 6; i++) k.box(0.06, 0.06, 3.25, [-2.0 + i * 0.8, 2.1, 0], SS[2]); // ribs
  for (let i = 0; i < 6; i++) k.add(new THREE.TorusGeometry(1.61, 0.03, 3, 16, Math.PI), SS[2], [-2.0 + i * 0.8, 2.1, 0], [0, Math.PI / 2, 0], [1, 0.42, 1]);
  k.box(1.9, 1.5, 0.08, [0, 0.95, 1.62], L.dark); // the big door
  for (let i = 0; i < 5; i++) k.box(1.9, 0.03, 0.03, [0, 0.35 + i * 0.3, 1.67], SS[3]);
  k.box(2.1, 0.1, 0.2, [0, 1.75, 1.65], SS[3]);
  k.rivetRow([-2.1, 2.08, 1.62], [2.1, 2.08, 1.62], 20, SS[5]); k.rivetRow([-2.1, 0.22, 1.62], [2.1, 0.22, 1.62], 20, SS[5]);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.box(0.05, 0.35, 0.5, [s * 2.12, 1.3, -1 + i * 0.9], SS[1]); // vents
  for (const x of [-1.4, 1.5]) { k.cyl(0.22, 0.26, 2.4, [x, 3.0, -0.9], SS[3], 10); k.cyl(0.26, 0.26, 0.12, [x, 4.2, -0.9], SS[1], 10); }
  k.lampBox(0.4, 0.12, 0.05, [-1.4, 1.9, 1.66], LAMPW); k.lampBox(0.4, 0.12, 0.05, [1.4, 1.9, 1.66], LAMPW);
  k.decal(A.star, 0.9, 0.9, [0, 2.45, 1.0], 0, -0.6);
  k.decal(textRect(A, 13, true), 1.3, 0.27, [1.35, 1.25, 1.605], 0);
  k.decal(textRect(A, 0, true), 1.0, 0.22, [-1.35, 1.25, 1.605], 0);
  k.decal(textRect(A, 13, true), 1.5, 0.3, [2.105, 1.4, 0], Math.PI / 2);
  k.decal(A.hazard, 1.9, 0.18, [0, 0.12, 1.86], 0, -Math.PI / 2 + 0.01);
  return { main: k.build(), stacks: [[-1.4, 4.3, -0.9], [1.5, 4.3, -0.9]], height: 4.3 };
}
/** PRC: a long low hall with a sawtooth roof */
function prcFactory(): SModel {
  const L = LIVERY.prc, A = atlas('prc'), k = new Kit();
  k.box(5.2, 0.2, 3.0, [0, 0.1, 0], ST[4]);
  k.box(5.0, 1.4, 2.8, [0, 0.9, 0], L.hull);
  k.box(5.04, 0.16, 2.84, [0, 1.25, 0], L.accent);
  for (let i = 0; i < 4; i++) {
    const x = -1.9 + i * 1.25;
    k.box(1.25, 0.08, 1.5, [x, 1.9, 0.0], L.hull2, [0.55, 0, 0]);
    k.add(new THREE.BoxGeometry(1.15, 0.6, 0.04), L.glass, [x, 1.9, -0.68]);
    k.box(1.25, 0.65, 0.06, [x, 1.92, -0.71], SS[4], [0, 0, 0]);
  }
  k.box(5.0, 0.1, 2.8, [0, 1.62, 0], L.hull2);
  k.box(1.6, 1.1, 0.06, [-1.2, 0.75, 1.42], L.dark);
  k.box(1.6, 1.1, 0.06, [1.2, 0.75, 1.42], L.dark);
  k.cyl(0.18, 0.2, 1.8, [2.2, 2.4, -1.0], SS[3], 10);
  k.lampBox(0.3, 0.1, 0.04, [0, 1.15, 1.43], LAMPW);
  k.decal(A.star, 0.8, 0.8, [0, 0.85, 1.43], 0);
  k.decal(textRect(A, 12), 1.0, 0.22, [-1.2, 1.38, 1.46], 0);
  k.decal(textRect(A, 0), 0.9, 0.2, [1.2, 1.38, 1.46], 0);
  k.decal(A.star, 0.7, 0.7, [2.51, 0.8, 0], Math.PI / 2);
  return { main: k.build(), stacks: [[2.2, 3.35, -1.0]], height: 3.4 };
}

// ------------------------------------------------------------------------------------------------ defences
function bunker(f: FactionId): SModel {
  const L = LIVERY[f], A = atlas(f), k = new Kit(), t = new Kit();
  const B8 = -Math.PI / 8;
  k.cyl(1.3, 1.55, 1.0, [0, 0.5, 0], ST[4], 8, [0, B8, 0]);
  k.cyl(1.36, 1.36, 0.18, [0, 1.06, 0], ST[3], 8, [0, B8, 0]);
  for (let i = 1; i < 8; i += 2) { const a = (i * Math.PI) / 4; k.box(0.5, 0.09, 0.08, [Math.sin(a) * 1.3, 0.62, Math.cos(a) * 1.3], RAMPS.basalt[0], [-0.24, a, 0]); }
  sandbags(k, 0, 0, 1.85, 12, -0.6, Math.PI + 0.6, 2);
  k.faceDecal(A.star, 0.62, 0.62, 1.405, 8, 0, 0.55, B8, -0.245);
  k.faceDecal(textRect(A, 14, f !== 'prc'), 0.9, 0.18, 1.405, 8, 4, 0.55, B8, -0.245);
  // the turret: a riveted cupola with a machine gun
  t.cyl(0.55, 0.65, 0.45, [0, 0.22, 0], L.hull, 12); t.ball(0.55, [0, 0.45, 0], L.hull2, 12, true);
  t.rivetRing(0, 0.2, 0, 0.62, 16, SS[5], 0.035);
  t.box(0.32, 0.1, 0.05, [0, 0.4, 0.56], RAMPS.basalt[0]);
  t.cyl(0.04, 0.04, 0.9, [0, 0.35, 0.95], SS[1], 6, [Math.PI / 2, 0, 0]);
  t.cyl(0.07, 0.07, 0.25, [0, 0.35, 0.6], SS[2], 6, [Math.PI / 2, 0, 0]);
  return { main: k.build(), turn: t.build(), turnAt: [0, 1.15, 0], turnAxis: 'y', muzzle: [0, 0.35, 1.4], height: 2.1 };
}
function artillery(f: FactionId): SModel {
  const L = LIVERY[f], A = atlas(f), k = new Kit(), t = new Kit();
  sandbags(k, 0, 0, 2.0, 16, 0, Math.PI * 2 * 0.85, 3);
  k.cyl(1.0, 1.1, 0.2, [0, 0.1, 0], ST[3], 12);
  for (let i = 0; i < 3; i++) k.box(0.4, 0.3, 0.3, [-1.3 + i * 0.4, 0.15, -1.2], RAMPS.olive[2]); // shell crates
  k.cyl(0.06, 0.06, 0.3, [-1.3, 0.35, -0.9], RAMPS.brass[4], 6);
  k.decal(textRect(A, 15, f !== 'prc'), 0.6, 0.14, [-0.9, 0.16, -1.04], 0);
  // the gun on its carriage (turns as one)
  t.box(1.1, 0.25, 1.1, [0, 0.12, 0], L.hull2);
  t.box(0.9, 0.7, 0.08, [0, 0.55, 0.45], L.hull, [-0.2, 0, 0]); // shield
  t.box(0.12, 0.45, 0.9, [0.3, 0.45, -0.1], L.hull); t.box(0.12, 0.45, 0.9, [-0.3, 0.45, -0.1], L.hull);
  t.cyl(0.13, 0.16, 0.8, [0, 0.7, 0.0], SS[2], 10, [Math.PI / 2 - 0.5, 0, 0]);
  t.cyl(0.075, 0.09, 2.1, [0, 1.2, 0.95], SS[3], 10, [Math.PI / 2 - 0.5, 0, 0]);
  t.cyl(0.11, 0.11, 0.2, [0, 1.68, 1.85], SS[1], 10, [Math.PI / 2 - 0.5, 0, 0]);
  t.rod([0.4, 0.2, -0.4], [0.9, 0.05, -1.6], 0.05, L.hull2, 5); t.rod([-0.4, 0.2, -0.4], [-0.9, 0.05, -1.6], 0.05, L.hull2, 5);
  t.decal(A.star, 0.45, 0.45, [0, 0.65, 0.5], 0, -0.2);
  return { main: k.build(), turn: t.build(), turnAt: [0, 0.2, 0], turnAxis: 'y', muzzle: [0, 1.75, 1.95], height: 2.2 };
}
function tower(f: FactionId): SModel {
  const L = LIVERY[f], A = atlas(f), k = new Kit(), t = new Kit();
  lattice(k, 0, 0, 0.8, 0.5, 4.2, L.metal, 4);
  k.box(1.4, 0.1, 1.4, [0, 4.25, 0], SS[3]);
  k.box(1.3, 0.7, 1.3, [0, 4.65, 0], L.hull);
  k.box(1.2, 0.25, 1.32, [0, 4.8, 0], RAMPS.basalt[0]);
  k.cone(1.15, 0.5, [0, 5.25, 0], L.accent, 4, [0, Math.PI / 4, 0]);
  ladder(k, [0.4, 0, 0.82], [0.4, 4.2, 0.55], SS[5]);
  k.decal(A.star, 0.5, 0.5, [0, 4.6, 0.655], 0);
  k.decal(textRect(A, 14), 0.8, 0.16, [0, 4.35, -0.655], Math.PI);
  // searchlight and gun on the roof
  t.cyl(0.18, 0.22, 0.3, [0, 0.15, 0.0], SS[3], 10, [Math.PI / 2, 0, 0]);
  t.add(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 10), LAMPW, [0, 0.15, 0.17], [Math.PI / 2, 0, 0], [1, 1, 1], true);
  t.cyl(0.035, 0.035, 0.7, [0.25, 0.1, 0.35], SS[1], 6, [Math.PI / 2, 0, 0]);
  return { main: k.build(), turn: t.build(), turnAt: [0, 5.55, 0], turnAxis: 'y', muzzle: [0.25, 0.1, 0.75], height: 5.8 };
}
function mast(f: FactionId): SModel {
  const L = LIVERY[f], A = atlas(f), k = new Kit();
  lattice(k, 0, 0, 0.35, 0.08, 6.0, L.metal, 6);
  for (let i = 0; i < 6; i++) k.box(0.2, 0.25, 0.2, [0, 0.5 + i, 0], i % 2 ? L.accent : RAMPS.paper[4]);
  for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; k.rod([0, 5.0, 0], [Math.cos(a) * 3.0, 0, Math.sin(a) * 3.0], 0.01, SS[4], 3); k.box(0.15, 0.1, 0.15, [Math.cos(a) * 3.0, 0.05, Math.sin(a) * 3.0], SS[2]); }
  k.lamp(0.07, [0, 6.1, 0], LAMPR);
  k.box(1.1, 0.8, 0.8, [1.0, 0.4, 0.6], L.hull); k.box(1.2, 0.08, 0.9, [1.0, 0.82, 0.6], L.hull2);
  k.rod([0.6, 0.85, 0.6], [0.6, 1.5, 0.6], 0.015, SS[5], 3);
  k.decal(textRect(A, 7, f === 'soviet'), 0.8, 0.17, [1.0, 0.45, 1.005], 0);
  return { main: k.build(), height: 6.2 };
}
function depot(f: FactionId): SModel {
  const L = LIVERY[f], A = atlas(f), k = new Kit();
  k.box(3.0, 0.15, 2.0, [0, 0.07, 0], ST[3]);
  for (const z of [-0.5, 0.5]) {
    k.cyl(0.45, 0.45, 2.4, [0, 0.75, z], f === 'prc' ? L.hull2 : SS[4], 14, [0, 0, Math.PI / 2]);
    k.ball(0.45, [1.2, 0.75, z], f === 'prc' ? L.hull2 : SS[4], 10); k.ball(0.45, [-1.2, 0.75, z], f === 'prc' ? L.hull2 : SS[4], 10);
    for (const x of [-0.8, 0.8]) { k.box(0.12, 0.35, 0.9, [x, 0.25, z], L.dark); k.torus(0.46, 0.03, [x, 0.75, z], L.dark, [0, Math.PI / 2, 0], 14); }
    k.decal(textRect(A, 8, f === 'soviet'), 0.9, 0.2, [0, 0.8, z + (z > 0 ? 0.455 : -0.455)], z > 0 ? 0 : Math.PI);
  }
  k.rod([-1.4, 0.75, 0], [-1.4, 1.4, 0], 0.05, SS[2]); k.box(0.3, 0.08, 0.08, [-1.4, 1.4, 0], RAMPS.stampRed[2]);
  k.decal(A.hazard, 1.4, 0.15, [0, 0.16, 1.0], 0, -Math.PI / 2 + 0.01);
  return { main: k.build(), height: 1.6 };
}
function tent(f: FactionId): SModel {
  const L = LIVERY[f], A = atlas(f), k = new Kit();
  const tri = new THREE.CylinderGeometry(1.0, 1.0, 2.4, 3, 1);
  k.add(tri, L.hull2, [0, 0.5, 0], [0, 0, Math.PI / 2], [1, 1, 1]);
  k.box(0.04, 1.6, 0.04, [1.25, 0.8, 0], SS[2]); k.box(0.04, 1.6, 0.04, [-1.25, 0.8, 0], SS[2]);
  k.box(0.6, 0.4, 0.5, [1.8, 0.2, 0.6], RAMPS.olive[2]); k.box(0.5, 0.35, 0.45, [1.85, 0.57, 0.6], RAMPS.olive[3], [0, 0.3, 0]);
  k.cyl(0.25, 0.25, 0.55, [-1.8, 0.27, -0.5], RAMPS.olive[2], 10);
  k.lamp(0.06, [1.25, 1.62, 0], LAMPW);
  k.decal(textRect(A, 12), 0.8, 0.16, [1.84, 0.2, 0.851], 0);
  return { main: k.build(), height: 1.7 };
}

// ------------------------------------------------------------------------------------------------ placeholder robots
export interface UModel { base: KitGeo | null; top: KitGeo; topY: number; muzzle: V3; height: number; hover: number; legs: boolean }
const UCACHE = new Map<string, UModel>();
export function unitModel(kind: string, f: FactionId): UModel {
  const key = kind + ':' + f;
  let m = UCACHE.get(key);
  if (!m) UCACHE.set(key, (m = buildUnit(kind, f)));
  return m;
}
function buildUnit(kind: string, f: FactionId): UModel {
  const L = LIVERY[f], A = atlas(f), b = new Kit(), t = new Kit();
  const pale = f !== 'prc';
  if (kind === 'sov_drone') {
    // a polished survey sphere with four swept whip antennas and a gun pod
    t.ball(0.3, [0, 0, 0], SS[5], 12);
    t.torus(0.31, 0.025, [0, 0, 0], L.hull2, [Math.PI / 2, 0, 0], 16);
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; t.rod([Math.cos(a) * 0.22, 0.05, Math.sin(a) * 0.22 - 0.1], [Math.cos(a) * 0.5, 0.25, Math.sin(a) * 0.4 - 0.9], 0.012, SS[5], 3); }
    t.cyl(0.035, 0.035, 0.5, [0, -0.22, 0.25], SS[1], 6, [Math.PI / 2, 0, 0]);
    t.lamp(0.05, [0, 0.05, 0.28], LAMPR);
    t.decal(A.star, 0.22, 0.22, [0.29, 0.02, 0], Math.PI / 2);
    return { base: null, top: t.build(), topY: 0, muzzle: [0, -0.22, 0.52], height: 0.6, hover: 1.4, legs: false };
  }
  if (kind === 'sov_tank' || kind === 'prc_scout') {
    const big = kind === 'sov_tank';
    const W = big ? 1.3 : 0.9, Lh = big ? 2.2 : 1.3;
    b.box(W * 0.8, 0.4, Lh, [0, 0.45, 0], L.hull2);
    b.box(W * 0.75, 0.2, Lh * 0.5, [0, 0.62, Lh * 0.2], L.hull, [-0.25, 0, 0]);
    if (big) {
      for (const s of [-1, 1]) { b.box(0.3, 0.42, Lh * 1.02, [s * W * 0.5, 0.25, 0], L.dark); for (let i = 0; i < 5; i++) b.cyl(0.17, 0.17, 0.32, [s * W * 0.5, 0.2, -Lh * 0.4 + i * Lh * 0.2], SS[3], 8, [0, 0, Math.PI / 2]); }
      b.rivetRow([-W * 0.4, 0.66, -Lh / 2], [-W * 0.4, 0.66, Lh / 2], 10, SS[5]); b.rivetRow([W * 0.4, 0.66, -Lh / 2], [W * 0.4, 0.66, Lh / 2], 10, SS[5]);
      b.decal(textRect(A, 7, pale), 0.7, 0.15, [W * 0.4 + 0.01, 0.45, 0], Math.PI / 2);
      t.cyl(0.5, 0.58, 0.38, [0, 0.19, -0.1], L.hull, 8, [0, -Math.PI / 8, 0]); t.ball(0.48, [0, 0.38, -0.1], L.hull2, 10, true, [0, 0, 0]);
      t.cyl(0.07, 0.08, 1.7, [0, 0.3, 0.95], SS[2], 8, [Math.PI / 2, 0, 0]); t.cyl(0.1, 0.1, 0.18, [0, 0.3, 1.78], SS[1], 8, [Math.PI / 2, 0, 0]);
      t.cyl(0.1, 0.1, 0.12, [0.2, 0.6, -0.2], SS[3], 8);
      t.faceDecal(A.star, 0.34, 0.34, 0.54, 8, 6, 0.19, -Math.PI / 8, -0.2, 0, -0.1); t.faceDecal(A.star, 0.34, 0.34, 0.54, 8, 2, 0.19, -Math.PI / 8, -0.2, 0, -0.1);
      return { base: b.build(), top: t.build(), topY: 0.66, muzzle: [0, 0.3, 1.9], height: 1.4, hover: 0, legs: false };
    }
    // PRC scout: a light three-wheeled car with a pintle gun
    for (const [x, z] of [[-0.5, -0.45], [0.5, -0.45], [0, 0.55]] as [number, number][]) b.cyl(0.24, 0.24, 0.16, [x, 0.24, z], L.dark, 10, [0, 0, Math.PI / 2]);
    b.box(0.9, 0.05, 1.0, [0, 0.68, 0], L.accent);
    b.decal(A.star, 0.3, 0.3, [0, 0.62, Lh / 2 + 0.01], 0);
    t.cyl(0.18, 0.2, 0.2, [0, 0.1, -0.1], L.hull, 8);
    t.cyl(0.03, 0.03, 0.7, [0, 0.22, 0.25], SS[1], 6, [Math.PI / 2, 0, 0]);
    t.box(0.3, 0.2, 0.04, [0, 0.3, 0.05], SS[3]);
    return { base: b.build(), top: t.build(), topY: 0.7, muzzle: [0, 0.22, 0.6], height: 1.0, hover: 0, legs: false };
  }
  if (kind === 'sov_titan') {
    // a heavy riveted walker: drum torso, dome, twin shoulder guns, stacks
    for (const s of [-1, 1]) {
      b.box(0.55, 1.2, 0.65, [s * 0.75, 1.9, 0], L.hull2); b.box(0.5, 1.3, 0.55, [s * 0.75, 0.75, 0.15], L.hull, [0.1, 0, 0]);
      b.box(0.8, 0.22, 1.1, [s * 0.75, 0.11, 0.2], L.dark);
      b.cyl(0.3, 0.3, 0.6, [s * 0.75, 1.35, 0.05], SS[3], 10, [0, 0, Math.PI / 2]);
    }
    b.box(1.6, 0.35, 0.9, [0, 2.45, 0], SS[2]);
    t.cyl(1.0, 1.05, 1.3, [0, 0.65, 0], L.hull, 10, [0, -Math.PI / 10, 0]);
    t.ball(0.95, [0, 1.3, 0], L.hull2, 14, true);
    t.rivetRing(0, 0.1, 0, 1.04, 30, SS[5], 0.06); t.rivetRing(0, 1.25, 0, 1.0, 30, SS[5], 0.06);
    t.box(0.7, 0.18, 0.1, [0, 1.15, 0.96], L.glass);
    t.lampBox(0.5, 0.06, 0.04, [0, 1.15, 1.0], LAMPR);
    for (const s of [-1, 1]) {
      t.box(0.5, 0.55, 0.9, [s * 1.25, 1.0, 0.1], L.hull2);
      t.cyl(0.09, 0.1, 1.7, [s * 1.25, 1.05, 1.2], SS[2], 8, [Math.PI / 2, 0, 0]);
      t.cyl(0.13, 0.13, 0.2, [s * 1.25, 1.05, 2.05], SS[1], 8, [Math.PI / 2, 0, 0]);
      t.cyl(0.12, 0.14, 0.9, [s * 0.5, 1.9, -0.6], SS[2], 8);
    }
    t.faceDecal(A.star, 0.7, 0.7, 1.03, 10, 0, 0.6, -Math.PI / 10);
    t.faceDecal(textRect(A, 9, pale), 0.9, 0.2, 1.03, 10, 5, 0.6, -Math.PI / 10);
    return { base: b.build(), top: t.build(), topY: 2.6, muzzle: [1.25, 1.05, 2.15], height: 4.6, hover: 0, legs: true };
  }
  if (kind === 'prc_mech') {
    // a mid-weight walker: reverse-jointed legs, a boxy cab, two rocket pods
    for (const s of [-1, 1]) {
      b.box(0.3, 0.9, 0.35, [s * 0.5, 1.4, -0.1], L.hull2, [-0.4, 0, 0]);
      b.box(0.25, 0.9, 0.3, [s * 0.5, 0.6, -0.05], L.hull, [0.45, 0, 0]);
      b.box(0.45, 0.14, 0.7, [s * 0.5, 0.07, 0.05], L.dark);
    }
    t.box(1.2, 0.8, 1.1, [0, 0.4, 0], L.hull);
    t.box(1.22, 0.12, 1.12, [0, 0.45, 0], L.accent);
    t.add(new THREE.BoxGeometry(0.7, 0.22, 0.05), L.glass, [0, 0.6, 0.56]);
    for (const s of [-1, 1]) {
      t.box(0.4, 0.45, 0.7, [s * 0.85, 0.6, 0.05], L.hull2);
      for (let i = 0; i < 4; i++) t.lamp(0.045, [s * 0.85 + ((i % 2) - 0.5) * 0.18, 0.6 + (Math.floor(i / 2) - 0.5) * 0.18, 0.41], RAMPS.basalt[1]);
    }
    t.decal(A.star, 0.45, 0.45, [0, 0.3, 0.555], 0);
    t.decal(textRect(A, 10), 0.8, 0.16, [0.605, 0.3, 0], Math.PI / 2);
    return { base: b.build(), top: t.build(), topY: 1.85, muzzle: [0.85, 0.6, 0.45], height: 2.7, hover: 0, legs: true };
  }
  if (kind.startsWith('expedition')) {
    // stand-in field soldier in green powered armour (src/robots' buildMilitaryHuman replaces it when present)
    const g = RAMPS.olive, eng = kind.includes('engineer');
    for (const s of [-1, 1]) { b.box(0.17, 0.75, 0.2, [s * 0.12, 0.42, 0], g[3]); b.box(0.19, 0.12, 0.28, [s * 0.12, 0.06, 0.04], g[1]); }
    t.box(0.48, 0.55, 0.3, [0, 0.3, 0], g[4]); t.box(0.5, 0.12, 0.32, [0, 0.05, 0], g[2]);
    t.box(0.4, 0.45, 0.22, [0, 0.33, -0.25], eng ? RAMPS.glowAmber[2] : g[2]);
    for (const s of [-1, 1]) t.box(0.14, 0.48, 0.16, [s * 0.32, 0.3, 0.06], g[3], [-0.5, 0, 0]);
    t.ball(0.17, [0, 0.75, 0], g[4], 10); t.box(0.26, 0.07, 0.05, [0, 0.76, 0.15], RAMPS.glowTeal[2]);
    t.box(0.06, 0.06, 0.6, [0.18, 0.35, 0.35], SS[1]);
    if (eng) t.rod([0.12, 0.6, -0.3], [0.12, 1.3, -0.35], 0.012, SS[5], 3);
    return { base: b.build(), top: t.build(), topY: 0.8, muzzle: [0.18, 0.35, 0.65], height: 1.75, hover: 0, legs: true };
  }
  // troopers: a riveted biped (Soviet: boxy; PRC: slimmer with a domed visor head)
  const prc = kind.startsWith('prc');
  for (const s of [-1, 1]) {
    b.box(prc ? 0.16 : 0.22, 0.48, prc ? 0.2 : 0.26, [s * 0.17, 0.68, 0], L.hull2);
    b.box(prc ? 0.14 : 0.2, 0.46, prc ? 0.18 : 0.24, [s * 0.17, 0.25, 0.04], L.hull);
    b.box(prc ? 0.2 : 0.26, 0.08, 0.34, [s * 0.17, 0.04, 0.06], L.dark);
  }
  b.box(0.5, 0.14, 0.3, [0, 0.92, 0], SS[2]);
  t.box(prc ? 0.48 : 0.6, 0.55, prc ? 0.32 : 0.42, [0, 0.3, 0], L.hull);
  if (!prc) { t.rivetRow([-0.28, 0.55, 0.215], [0.28, 0.55, 0.215], 6, SS[5], 0.035); t.box(0.62, 0.08, 0.44, [0, 0.03, 0], L.hull2); }
  else t.box(0.5, 0.07, 0.34, [0, 0.42, 0], L.accent);
  if (prc) { t.ball(0.17, [0, 0.72, 0], L.hull2, 10, true); t.cyl(0.17, 0.17, 0.12, [0, 0.66, 0], L.hull2, 10); t.lampBox(0.24, 0.04, 0.03, [0, 0.7, 0.165], LAMPW); }
  else { t.cyl(0.17, 0.2, 0.26, [0, 0.72, 0], L.hull2, 8); t.lamp(0.05, [0, 0.74, 0.19], LAMPR); t.rod([0.12, 0.85, -0.05], [0.18, 1.25, -0.12], 0.01, SS[5], 3); }
  for (const s of [-1, 1]) t.box(0.13, 0.46, 0.15, [s * (prc ? 0.32 : 0.38), 0.25, 0.05], L.hull2, [-0.35, 0, 0]);
  t.box(0.08, 0.1, 0.75, [0.3, 0.2, 0.35], SS[1]); t.cyl(0.03, 0.03, 0.3, [0.3, 0.22, 0.85], SS[1], 6, [Math.PI / 2, 0, 0]);
  t.decal(A.star, 0.26, 0.26, [-0.1, 0.38, (prc ? 0.16 : 0.21) + 0.01], 0);
  return { base: b.build(), top: t.build(), topY: 0.95, muzzle: [0.3, 0.22, 1.0], height: 1.75, hover: 0, legs: true };
}
