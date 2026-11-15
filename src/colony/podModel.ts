// The UNAA colony pod CP-07: the landed home base and the player's body on the planet. A squat twelve-metre-round
// lander (5.4 m across the hull, 7 m to the mast tip) standing on four shock-strut legs: a charred ablative skirt, the
// white plated hull with its orange program band, an equipment ring carrying six numbered ARM HARDPOINTS, the conic
// shoulder with RCS quads and floodlights, the glazed cupola, and the mast with the SHIP AI LINK dish. Around it:
// the hatch and its ramp, a ladder, oxygen and hydrazine tanks on straps, conduits on brackets, radiators, nav lights.
// Local frame: origin on the ground at the pod's centre, +z is the hatch side.
import * as THREE from 'three';
import { Kit, std, glow, hullRing, TAU, rand } from './kit';
import { hullSheet, machSheet, shieldSheet, foilSheet, hazardTex, radiatorSheet, decalSheet, decalUV, windowTex, COL } from './tex';
import { gbuf } from '../gfx/gbuf';

export interface Hardpoint { i: number; angle: number; y: number; r: number; cap: THREE.Object3D; mount: THREE.Object3D }
export interface PodModel {
  root: THREE.Group;
  hardpoints: Hardpoint[];
  /** the dish on the mast (turns slowly; points up while the ship link is open) */
  dish: THREE.Object3D;
  /** where the crew walk in and out (local) */
  door: THREE.Vector3; rampFoot: THREE.Vector3;
  update(t: number, dt: number, o?: { link?: boolean; alarm?: number; power?: number }): void;
  /** scorch and dents with damage (0 whole .. 1 wrecked) */
  setDamage(k: number): void;
}

export const POD_R = 2.7, BAND_Y = 3.15, HULL_TOP = 3.55;
const HP_ANG = [40, 95, 150, 210, 265, 320].map((d) => (d * Math.PI) / 180);

/** a strip of the decal sheet wrapped on a cylinder of radius r (angle a: centre, w x h metres, centre height y) */
function decalStrip(k: Kit, key: string, a: number, y: number, w: number, h: number, r: number, mat: THREE.Material) {
  const len = w / r, g = new THREE.CylinderGeometry(r, r, h, Math.max(4, Math.ceil(len * 16)), 1, true, a - len / 2, len);
  const [u0, v0, su, sv] = decalUV(key), uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * su, v0 + uv.getY(i) * sv);
  k.add(g, mat, { p: [0, y, 0] });
}
/** a flat decal quad facing +z in a local frame */
function decalQuad(k: Kit, key: string, w: number, h: number, mat: THREE.Material, t: { p: [number, number, number]; r?: [number, number, number] }) {
  const g = new THREE.PlaneGeometry(w, h), [u0, v0, su, sv] = decalUV(key), uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * su, v0 + uv.getY(i) * sv);
  k.add(g, mat, t);
}
/** polar to local xz */
const P = (a: number, r: number): [number, number] => [Math.sin(a) * r, Math.cos(a) * r];

export function buildPod(): PodModel {
  const root = new THREE.Group(); root.name = 'unaa-pod';
  const hs = hullSheet(7), ms = machSheet(3), ss = shieldSheet(), rs = radiatorSheet();
  const M = {
    hull: std(0xffffff, { map: hs.map, bump: hs.bump, bumpScale: 2.2, rough: 0.58, metal: 0.12 }),
    mach: std(0xffffff, { map: ms.map, bump: ms.bump, bumpScale: 2, rough: 0.5, metal: 0.45 }),
    shield: std(0xffffff, { map: ss.map, bump: ss.bump, bumpScale: 3, rough: 0.92, metal: 0.05 }),
    foil: std(0xffffff, { map: foilSheet(), rough: 0.3, metal: 0.7 }),
    hazard: std(0xffffff, { map: hazardTex(), rough: 0.55, metal: 0.1 }),
    rad: std(0xffffff, { map: rs.map, bump: rs.bump, bumpScale: 1.5, rough: 0.45, metal: 0.4 }),
    steel: std(0x8d8f8a, { rough: 0.38, metal: 0.75 }),
    dark: std(0x2b2f33, { rough: 0.55, metal: 0.5 }),
    rubber: std(0x1d1e20, { rough: 0.9, metal: 0 }),
    orange: std(0xc8642c, { rough: 0.5, metal: 0.1 }),
    blue: std(0x2b5884, { rough: 0.5, metal: 0.1 }),
    white: std(0xdcd9cf, { rough: 0.55, metal: 0.1 }),
    chrome: std(0xb8bcbf, { rough: 0.22, metal: 0.9 }),
    brass: std(0xb08a3a, { rough: 0.35, metal: 0.8 }),
    glass: std(0x1a2a34, { rough: 0.08, metal: 0.6, map: windowTex(), emissive: 0xffffff, emissiveI: 0.55, emissiveMap: windowTex() }),
    decal: (() => { const m = std(0xffffff, { map: decalSheet(), rough: 0.6, metal: 0.05, alphaTest: 0.5 }); m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -4; return m; })(),
    lampW: glow(0xfff1d0, 2.4), lampR: glow(0xff3020, 2.2), lampG: glow(0x30ff70, 2.0), lampA: glow(0xffa030, 2.2),
  };
  // the hull's tiling: 8 x 4 m per sheet, an integer number of sheets round each ring
  hs.map.repeat.set(1, 1);
  const k = new Kit();
  const ring = (r0: number, y0: number, r1: number, y1: number, mat: THREE.Material, reps = 2, vOff = 0, seg = 40) => {
    const circ = TAU * (r0 + r1) / 2, n = Math.max(1, Math.round(circ / 8 * reps / 2) * 1);
    const g = hullRing(r0, y0, r1, y1, seg, n / circ, 0.25);
    if (vOff) { const uv = g.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) + vOff); }
    k.add(g, mat);
  };
  // ---- legs: four shock struts to dished foot pads
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, [fx, fz] = P(a, 3.75), [hx, hz] = P(a, 2.45), [kx, kz] = P(a, 3.35);
    k.rod([hx, 1.55, hz], [kx, 0.85, kz], 0.13, M.white, 10);           // upper strut
    k.rod([kx, 0.85, kz], [fx, 0.28, fz], 0.1, M.chrome, 10);           // piston
    k.rod([kx, 0.85, kz], [fx * 0.96, 0.6, fz * 0.96], 0.15, M.dark, 10); // cylinder
    const [sx, sz] = P(a + 0.32, 2.2), [tx, tz] = P(a - 0.32, 2.2);
    k.rod([sx, 1.0, sz], [kx, 0.85, kz], 0.06, M.steel, 6); k.rod([tx, 1.0, tz], [kx, 0.85, kz], 0.06, M.steel, 6); // drag braces
    k.sph(0.17, M.dark, { p: [kx, 0.85, kz] }, 10, 8);
    k.lathe([[0, 0.02], [0.55, 0.02], [0.62, 0.08], [0.58, 0.16], [0.22, 0.22], [0.12, 0.3], [0, 0.3]], M.mach, { p: [fx, 0, fz] }, 16);
    for (let b = 0; b < 6; b++) { const ba = (b / 6) * TAU; k.cyl(0.03, 0.03, 0.05, M.steel, { p: [fx + Math.sin(ba) * 0.42, 0.13, fz + Math.cos(ba) * 0.42] }, 6); }
    // hazard collar on the strut
    k.cyl(0.15, 0.15, 0.18, M.hazard, { p: [(hx + kx) / 2, 1.2, (hz + kz) / 2] }, 12);
  }
  // ---- heat shield skirt, base cap
  ring(2.05, 0.92, 2.66, 1.36, M.shield, 2);
  k.cyl(2.05, 2.05, 0.04, M.shield, { p: [0, 0.92, 0] }, 36);
  ring(2.66, 1.36, 2.74, 1.5, M.mach, 2);
  // ---- main hull (the hatch opening is covered by the door frame)
  ring(POD_R, 1.5, POD_R, HULL_TOP, M.hull, 2, 0.1);
  // equipment band (gap at the hatch)
  { const g = new THREE.CylinderGeometry(POD_R + 0.08, POD_R + 0.08, 0.38, 48, 1, true, 0.42, TAU - 0.84); const uv = g.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 0.2); k.add(g, M.mach, { p: [0, BAND_Y, 0] }); }
  for (const y of [BAND_Y - 0.2, BAND_Y + 0.2]) { const g = new THREE.TorusGeometry(POD_R + 0.08, 0.03, 6, 64, TAU - 0.84); k.add(g, M.steel, { p: [0, y, 0], r: [Math.PI / 2, 0, Math.PI / 2 + 0.42] }); }
  // shoulder, collar, cupola
  ring(POD_R, HULL_TOP, 2.02, 4.25, M.hull, 2, 0.6);
  ring(2.02, 4.25, 2.02, 4.37, M.mach, 2);
  k.lathe([[2.0, 0], [1.95, 0.04], [1.62, 0.06], [1.6, 0.42], [1.55, 0.5], [1.38, 0.72], [1.05, 0.92], [0.6, 1.02], [0, 1.05]], M.white, { p: [0, 4.37, 0] }, 40);
  // the cupola's window band
  { const g = new THREE.CylinderGeometry(1.615, 1.615, 0.3, 48, 1, true); const uv = g.getAttribute('uv') as THREE.BufferAttribute; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 6); k.add(g, M.glass, { p: [0, 4.6, 0] }); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU, [x, z] = P(a, 1.63); k.box(0.06, 0.34, 0.06, M.white, { p: [x, 4.6, z], r: [0, a, 0] }); }
  // foil-wrapped instrument bays on the shoulder
  for (const a of [Math.PI * 0.75, Math.PI * 1.25]) { const [x, z] = P(a, 2.42); k.box(0.9, 0.42, 0.5, M.foil, { p: [x, 3.85, z], r: [-0.45, a, 0] }); }
  // ---- the hatch: frame, door (open, slid up), the lit airlock beyond, the ramp
  {
    const z0 = POD_R - 0.02;
    k.box(1.5, 0.16, 0.36, M.mach, { p: [0, 3.68, z0 + 0.1] }); k.box(1.5, 0.12, 0.36, M.mach, { p: [0, 1.52, z0 + 0.1] });
    for (const s of [-1, 1]) { k.box(0.16, 2.2, 0.36, M.mach, { p: [s * 0.74, 2.6, z0 + 0.1] }); k.box(0.08, 2.0, 0.08, M.hazard, { p: [s * 0.86, 2.6, z0 + 0.22] }); }
    k.box(1.3, 2.0, 0.05, M.dark, { p: [0, 2.6, z0 - 0.12] });   // the airlock's inner wall
    k.box(1.3, 0.05, 0.4, M.steel, { p: [0, 1.6, z0 - 0.05] });
    k.box(1.32, 0.5, 0.12, M.white, { p: [0, 3.48, z0 + 0.2] });  // the door, slid up into its housing
    k.box(0.5, 0.08, 0.02, M.lampA, { p: [0, 3.78, z0 + 0.29] });
    // the ramp to the ground
    const rl = 2.3, ang = Math.atan2(1.55, rl);
    k.box(1.2, 0.08, Math.hypot(rl, 1.55), M.mach, { p: [0, 0.78, z0 + 0.25 + rl / 2], r: [ang, 0, 0] });
    for (let i = 0; i < 9; i++) { const t = (i + 0.5) / 9; k.box(1.1, 0.03, 0.05, M.hazard, { p: [0, 1.55 * (1 - t) + 0.05, z0 + 0.25 + rl * t], r: [ang, 0, 0] }); }
    for (const s of [-1, 1]) { k.rod([s * 0.62, 1.6 + 0.9, z0 + 0.3], [s * 0.62, 0.9, z0 + 0.25 + rl], 0.03, M.steel, 6); k.rod([s * 0.62, 1.6, z0 + 0.3], [s * 0.62, 2.5, z0 + 0.3], 0.03, M.steel, 6); k.rod([s * 0.62, 0.05, z0 + 0.25 + rl], [s * 0.62, 0.9, z0 + 0.25 + rl], 0.03, M.steel, 6); }
  }
  // ---- ladder up the side (to the shoulder and the mast)
  { const a = 0.36, r = POD_R + 0.18; for (const s of [-0.22, 0.22]) { const [x, z] = P(a + s / r, r); k.rod([x, 1.4, z], [x, 4.0, z], 0.025, M.steel, 6); }
    for (let y = 1.6; y < 4.0; y += 0.3) { const [x0, z0] = P(a - 0.22 / r, r), [x1, z1] = P(a + 0.22 / r, r); k.rod([x0, y, z0], [x1, y, z1], 0.02, M.steel, 5); } }
  // ---- tanks: oxygen (port) and hydrazine (starboard), horizontal on straps
  for (const [a, col, lab] of [[Math.PI / 2 + 0.1, M.white, 'o2'], [-Math.PI / 2 - 0.1, M.orange, 'fuel']] as [number, THREE.Material, string][]) {
    const [x, z] = P(a, POD_R + 0.42), rot = -a + Math.PI / 2;
    const tk = new Kit();
    tk.cyl(0.36, 0.36, 1.5, col, { r: [0, 0, Math.PI / 2] }, 20);
    tk.sph(0.36, col, { p: [0.75, 0, 0] }, 16, 10, TAU, 0, Math.PI); tk.sph(0.36, col, { p: [-0.75, 0, 0] }, 16, 10);
    for (const s of [-0.45, 0.45]) tk.tor(0.375, 0.025, M.dark, { p: [s, 0, 0], r: [0, Math.PI / 2, 0] }, 6, 24);
    tk.cyl(0.05, 0.05, 0.3, M.brass, { p: [0.95, 0.12, 0], r: [0, 0, Math.PI / 2] }, 8);
    const grp = tk.build('tank'); grp.position.set(x, 1.95, z); grp.rotation.y = rot; root.add(grp);
    decalQuad(k, lab, 0.8, 0.23, M.decal, { p: [Math.sin(a) * (POD_R + 0.79), 1.95, Math.cos(a) * (POD_R + 0.79)], r: [0, a, 0] });
    k.box(0.3, 0.3, 0.42, M.mach, { p: [Math.sin(a) * (POD_R + 0.12), 1.95, Math.cos(a) * (POD_R + 0.12)], r: [0, a, 0] });
  }
  // ---- conduits on brackets, junction boxes
  for (const [a, len, r] of [[0.75, 1.9, 0.05], [0.82, 1.9, 0.035], [-0.7, 1.7, 0.05], [2.5, 1.9, 0.045], [-2.6, 1.8, 0.05], [3.3, 1.5, 0.04]] as [number, number, number][]) {
    const [x, z] = P(a, POD_R + 0.09);
    k.cyl(r, r, len, M.steel, { p: [x, 1.6 + len / 2, z] }, 8);
    for (let y = 1.75; y < 1.6 + len; y += 0.45) k.box(0.12, 0.05, 0.1, M.dark, { p: [Math.sin(a) * (POD_R + 0.05), y, Math.cos(a) * (POD_R + 0.05)], r: [0, a, 0] });
  }
  for (const a of [1.15, -1.2, 2.2, -2.25, 2.9]) { const [x, z] = P(a, POD_R + 0.1); k.box(0.42, 0.3, 0.18, M.mach, { p: [x, 2.25 + rand(a) * 0.4, z], r: [0, a, 0] }); }
  // ---- radiators at the back
  for (const a of [Math.PI - 0.5, Math.PI + 0.5]) {
    const [x, z] = P(a, POD_R + 0.7);
    k.box(1.1, 1.7, 0.06, M.rad, { p: [x, 2.35, z], r: [0, a + Math.PI / 2, 0] });
    k.beam([Math.sin(a) * POD_R, 1.6, Math.cos(a) * POD_R], [x, 1.6, z], 0.08, 0.08, M.steel);
    k.beam([Math.sin(a) * POD_R, 3.1, Math.cos(a) * POD_R], [x, 3.1, z], 0.08, 0.08, M.steel);
  }
  // ---- RCS quads and floodlights on the shoulder
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2, [x, z] = P(a, 2.42);
    k.box(0.36, 0.32, 0.3, M.mach, { p: [x, 3.95, z], r: [-0.48, a, 0] });
    for (const [dx, dy] of [[0.18, 0], [-0.18, 0], [0, 0.17]]) { const [ox, oz] = P(a + Math.PI / 2, dx); k.cone(0.06, 0.12, M.dark, { p: [x + ox + Math.sin(a) * 0.17, 3.95 + dy, z + oz + Math.cos(a) * 0.17], r: [Math.PI / 2, 0, 0], q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(a) + ox * 3, dy * 2, Math.cos(a) + oz * 3).normalize()) }, 8); }
  }
  for (const a of [0.0, (2 * Math.PI) / 3, (-2 * Math.PI) / 3]) {
    const [x, z] = P(a + 0.55, 2.2);
    k.box(0.34, 0.2, 0.22, M.dark, { p: [x, 4.12, z], r: [-0.7, a + 0.55, 0] });
    k.box(0.28, 0.14, 0.02, M.lampW, { p: [x + Math.sin(a + 0.55) * 0.11, 4.08, z + Math.cos(a + 0.55) * 0.11], r: [-0.7, a + 0.55, 0] });
  }
  // ---- hardpoint flanges on the band (caps and mounts are separate objects)
  const hardpoints: Hardpoint[] = [];
  HP_ANG.forEach((a, i) => {
    const [x, z] = P(a, POD_R + 0.1);
    k.cyl(0.42, 0.42, 0.1, M.mach, { p: [x, BAND_Y, z], r: [Math.PI / 2, 0, 0], q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(a), 0, Math.cos(a))) }, 16);
    for (let b = 0; b < 8; b++) { const ba = (b / 8) * TAU, ox = Math.cos(ba) * 0.34, oy = Math.sin(ba) * 0.34, [tx, tz] = P(a + Math.PI / 2, ox); k.cyl(0.025, 0.025, 0.06, M.steel, { p: [x + tx + Math.sin(a) * 0.06, BAND_Y + oy, z + tz + Math.cos(a) * 0.06], q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.sin(a), 0, Math.cos(a))) }, 6); }
    decalStrip(k, 'n' + (i + 1), a, BAND_Y + 0.62, 0.34, 0.34, POD_R + 0.012, M.decal);
    // the blanking cap (hidden when an arm is fitted)
    const ck = new Kit();
    ck.cyl(0.3, 0.33, 0.12, M.white, { r: [Math.PI / 2, 0, 0] }, 16);
    ck.box(0.36, 0.06, 0.04, M.hazard, { p: [0, 0, 0.07] });
    const cap = ck.build('cap'); cap.position.set(Math.sin(a) * (POD_R + 0.2), BAND_Y, Math.cos(a) * (POD_R + 0.2)); cap.rotation.y = a; root.add(cap);
    const mount = new THREE.Group(); mount.position.set(Math.sin(a) * (POD_R + 0.16), BAND_Y, Math.cos(a) * (POD_R + 0.16)); mount.rotation.y = a; root.add(mount);
    hardpoints.push({ i, angle: a, y: BAND_Y, r: POD_R + 0.16, cap, mount });
  });
  // ---- decals: name, roundel, 07, UNAA, placards
  decalStrip(k, 'roundel', -0.55, 2.35, 1.15, 1.15, POD_R + 0.012, M.decal);
  decalStrip(k, 'big07', 0.62, 2.35, 1.0, 0.62, POD_R + 0.012, M.decal);
  decalStrip(k, 'name', Math.PI, 2.75, 3.6, 0.42, POD_R + 0.012, M.decal);
  decalStrip(k, 'flagstripe', Math.PI, 2.35, 1.4, 0.26, POD_R + 0.012, M.decal);
  decalStrip(k, 'grid', -2.0, 1.9, 0.5, 0.33, POD_R + 0.012, M.decal);
  decalStrip(k, 'hazardDia', 2.05, 2.0, 0.34, 0.34, POD_R + 0.012, M.decal);
  decalStrip(k, 'noStep', -1.75, 3.42, 0.6, 0.2, POD_R + 0.012, M.decal);
  decalStrip(k, 'warn', 1.5, 1.85, 0.36, 0.36, POD_R + 0.012, M.decal);
  decalStrip(k, 'unaa', 0, 4.48, 2.4, 0.42, 1.618, M.decal);
  decalQuad(k, 'link', 0.7, 0.22, M.decal, { p: [0, 3.92, POD_R + 0.2] });
  // ---- mast: the SHIP AI LINK dish, whips, beacon
  k.cyl(0.11, 0.16, 1.7, M.white, { p: [0, 6.15, 0] }, 12);
  for (const y of [5.6, 6.2, 6.8]) k.cyl(0.17, 0.17, 0.06, M.dark, { p: [0, y, 0] }, 12);
  for (const a of [0.6, 2.7, 4.6]) { const [x, z] = P(a, 0.9); k.rod([x, 5.35, z], [x * 0.4, 7.2, z * 0.4], 0.012, M.dark, 4); k.sph(0.025, M.dark, { p: [x * 0.4, 7.2, z * 0.4] }, 6, 4); }
  k.box(0.5, 0.3, 0.4, M.mach, { p: [0.95, 5.5, -0.6], r: [0, 0.6, 0] });
  const body = k.build('pod-body');
  root.add(body);
  // the dish on its own yoke (turns)
  const dish = new THREE.Group(); dish.position.set(0, 7.0, 0); root.add(dish);
  {
    const dk = new Kit();
    dk.box(0.5, 0.08, 0.16, M.dark, { p: [0, 0.04, 0] });
    for (const s of [-1, 1]) dk.box(0.05, 0.36, 0.14, M.dark, { p: [s * 0.24, 0.22, 0] });
    const pts: [number, number][] = []; for (let i = 0; i <= 8; i++) { const r = (i / 8) * 0.62; pts.push([r, r * r * 0.55]); } pts.push([0.62, 0.24]);
    dk.lathe(pts, M.white, { p: [0, 0.32, 0.05], r: [-1.1, 0, 0] }, 28);
    dk.rod([0, 0.36, 0.08], [0, 0.66, 0.42], 0.015, M.dark, 4); dk.sph(0.05, M.brass, { p: [0, 0.66, 0.42] }, 8, 6);
    dish.add(dk.build('dish'));
  }
  // nav lights and the strobe (their own meshes: they blink)
  const lamp = (mat: THREE.MeshBasicMaterial, x: number, y: number, z: number, r = 0.05) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat.clone()); gbuf(m.material as THREE.Material, 33); m.position.set(x, y, z); root.add(m); return m; };
  const navR = lamp(M.lampR, -POD_R - 0.1, 3.5, 0), navG = lamp(M.lampG, POD_R + 0.1, 3.5, 0), strobe = lamp(M.lampW, 0, 7.32, 0, 0.07);
  const beacons = [lamp(M.lampA, 0.9, 4.45, 1.3, 0.05), lamp(M.lampA, -0.9, 4.45, -1.3, 0.05)];
  const baseCols = [navR, navG, strobe, ...beacons].map((m) => (m.material as THREE.MeshBasicMaterial).color.clone());
  // a warm work light at the hatch (one real light; the rest are emissive)
  const hatchLight = new THREE.PointLight(0xffd8a0, 0, 9, 1.8); hatchLight.position.set(0, 3.2, POD_R + 1.2); root.add(hatchLight);
  const glassMat = M.glass;
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.castShadow === undefined) m.castShadow = true; });
  let dmg = 0;
  const pod: PodModel = {
    root, hardpoints, dish, door: new THREE.Vector3(0, 1.6, POD_R - 0.1), rampFoot: new THREE.Vector3(0, 0, POD_R + 2.7),
    update(t, dt, o = {}) {
      const link = !!o.link, alarm = o.alarm ?? 0, pw = o.power ?? 1;
      dish.rotation.y = link ? dish.rotation.y + (0 - dish.rotation.y) * Math.min(1, dt * 2) : dish.rotation.y + dt * 0.25;
      const blink = (period: number, on: number, ph = 0) => ((t + ph) % period) < on ? 1 : 0;
      (navR.material as THREE.MeshBasicMaterial).color.copy(baseCols[0]).multiplyScalar(0.25 + 0.75 * blink(1.6, 0.9));
      (navG.material as THREE.MeshBasicMaterial).color.copy(baseCols[1]).multiplyScalar(0.25 + 0.75 * blink(1.6, 0.9, 0.8));
      (strobe.material as THREE.MeshBasicMaterial).color.copy(baseCols[2]).multiplyScalar(blink(2.2, 0.08) ? 2.5 : 0.15);
      const al = alarm > 0 ? (blink(0.6, 0.3) ? 2.2 : 0.2) : 0.6 + 0.4 * Math.sin(t * 2);
      for (let i = 0; i < beacons.length; i++) (beacons[i].material as THREE.MeshBasicMaterial).color.copy(alarm > 0 ? new THREE.Color(0xff2a10) : baseCols[3 + i]).multiplyScalar(al);
      glassMat.emissiveIntensity = (0.35 + 0.25 * pw) * (alarm > 0 && blink(0.6, 0.3) ? 1.6 : 1);
      hatchLight.intensity = 3.2 * pw;
    },
    setDamage(kk) {
      if (Math.abs(kk - dmg) < 0.02) return; dmg = kk;
      (M.hull as THREE.MeshStandardMaterial).color.setRGB(1 - kk * 0.45, 1 - kk * 0.5, 1 - kk * 0.55);
    },
  };
  root.userData.pod = pod;
  return pod;
}
export { HP_ANG, COL };
