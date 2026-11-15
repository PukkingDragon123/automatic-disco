// The research vessel MERIDIAN (UNAA RV-07): the deck plan of the ship hub, as plain data (no scene needed).
// Frame: metres, ship-local = world. +z bow, +x starboard, +y up, deck floor at y = 0, walls WALL_H tall.
// The cutaway camera looks from port-aft-above, so a room's +x and +z walls stand full height (decorated) and its
// -x / -z walls are cut low (the dollhouse view). Rooms sit in two columns either side of a spine corridor, the
// bridge across the bow:
//
//          z 27  +---------- BRIDGE ----------+            (main monitor on the bow wall)
//          z 17  +-- MEDBAY --+ c +--- LAB ---+ z 17
//          z  9  +---  CORE --+ o |           + z  7
//          z  1  +-QUARTERS---+ r +--- MESS --+
//                |            | r |           + z -4
//          z -12 +-- WORKSHOP-+ i +-- CARGO --+ z -15
//                |  + HANGAR  | d +ENGINEERING+
//          z -27 +------------+---+-----------+
//               x -10      -1.4  1.4         10
import * as THREE from 'three';

export type RoomId = 'bridge' | 'lab' | 'workshop' | 'quarters' | 'mess' | 'medbay' | 'engineering' | 'cargo' | 'core';
export const ROOM_IDS: RoomId[] = ['bridge', 'lab', 'workshop', 'quarters', 'mess', 'medbay', 'engineering', 'cargo', 'core'];

export const WALL_H = 3.4;
/** how tall a cut (near-side) wall stands in the cutaway */
export const CUT_H = 1.05;
export const CORRIDOR = { x0: -1.4, x1: 1.4, z0: -27, z1: 17 };
export const SHIP_NAME = 'MERIDIAN';
export const SHIP_REG = 'UNAA RV-07';

export interface SpotDef { p: [number, number, number]; f: number }
export interface RoomDef {
  id: RoomId; name: string; short: string; deck: string; code: string;
  /** what the room is for, one line for the hover card */
  role: string;
  x0: number; x1: number; z0: number; z1: number;
  /** the room light: colour and strength (each room has its own mood) */
  light: number; lightK: number;
  spots: Record<string, SpotDef>;
  /** the room close-up: azimuth offset (radians, from the overview), elevation, field of view, distance scale */
  view?: { az?: number; el?: number; fov?: number; k?: number; look?: [number, number, number] };
}

const D = Math.PI / 2;
/** facing +z = 0, +x = PI/2, -z = PI, -x = -PI/2 */
export const FACE = { pz: 0, px: D, nz: Math.PI, nx: -D };

export const ROOMS: Record<RoomId, RoomDef> = {
  bridge: {
    id: 'bridge', name: 'BRIDGE', short: 'BRG', deck: 'DECK 1 FWD', code: '01', role: 'Main monitor: scan the galaxy, choose a world, deploy',
    x0: -8, x1: 8, z0: 17, z1: 27, light: 0x9fc6d8, lightK: 1.0,
    spots: {
      door: { p: [0, 0, 17.5], f: FACE.pz }, center: { p: [0, 0, 21.5], f: FACE.pz },
      captain: { p: [0, 0.62, 19.4], f: FACE.pz }, helm: { p: [-1.7, 0.3, 23.1], f: FACE.pz }, nav: { p: [1.7, 0.3, 23.1], f: FACE.pz },
      comms: { p: [5.9, 0, 20.2], f: FACE.px }, monitor: { p: [0, 0.3, 25.4], f: FACE.nz },
    },
    view: { el: 0.7, fov: 28, k: 0.82, look: [0.4, 0.8, 22.4] },
  },
  lab: {
    id: 'lab', name: 'RESEARCH LAB', short: 'LAB', deck: 'DECK 1 STBD', code: '02', role: 'Bio-engineering: design and print engineered life',
    x0: 1.4, x1: 10, z0: 7, z1: 17, light: 0xc8f0d8, lightK: 1.0,
    spots: {
      door: { p: [1.9, 0, 12], f: FACE.px }, center: { p: [5.7, 0, 12], f: FACE.pz },
      bench: { p: [8.5, 0, 9.4], f: FACE.px }, scope: { p: [8.3, 0, 11.4], f: FACE.px }, tank: { p: [5.6, 0, 15.6], f: FACE.pz },
      terminal: { p: [3.2, 0, 15.9], f: FACE.pz }, hull_breach: { p: [9.96, 1.45, 13.9], f: FACE.nx }, apple_throw: { p: [5.9, 0, 13.9], f: FACE.px },
    },
  },
  medbay: {
    id: 'medbay', name: 'MEDBAY', short: 'MED', deck: 'DECK 1 PORT', code: '03', role: 'Crew health, triage and the bio-scanner',
    x0: -10, x1: -1.4, z0: 9, z1: 17, light: 0xe8f2f4, lightK: 1.0,
    spots: {
      door: { p: [-1.9, 0, 13], f: FACE.nx }, center: { p: [-5.7, 0, 13], f: FACE.pz },
      bed1: { p: [-2.45, 0.78, 10.7], f: FACE.nx }, bed2: { p: [-2.45, 0.78, 15.2], f: FACE.nx },
      doctor: { p: [-4.6, 0, 12.9], f: FACE.px }, scanner: { p: [-7.6, 0, 14.6], f: FACE.pz }, cabinet: { p: [-6.0, 0, 16.2], f: FACE.pz },
    },
  },
  core: {
    id: 'core', name: 'AI CORE', short: 'CORE', deck: 'DECK 1 PORT', code: '04', role: 'Unit 07: settings, save and load',
    x0: -10, x1: -1.4, z0: 1, z1: 9, light: 0x8fe0a8, lightK: 0.9,
    spots: {
      door: { p: [-1.9, 0, 5], f: FACE.nx }, center: { p: [-5.7, 0, 5], f: FACE.pz },
      core: { p: [-6.2, 0, 4.6], f: FACE.pz }, console: { p: [-3.6, 0, 7.4], f: FACE.pz }, racks: { p: [-2.6, 0, 3.0], f: FACE.px },
    },
  },
  quarters: {
    id: 'quarters', name: 'LIVING QUARTERS', short: 'QTR', deck: 'DECK 1 PORT', code: '05', role: 'Bunks and lockers for the crew of eight',
    x0: -10, x1: -1.4, z0: -12, z1: 1, light: 0xf2cf98, lightK: 0.95,
    spots: {
      door: { p: [-1.9, 0, -5.5], f: FACE.nx }, center: { p: [-5.7, 0, -5.5], f: FACE.pz },
      // the bunks stand along the corridor wall, head at the aft end (pos = head on the mattress, facing = toward the feet)
      bunk1: { p: [-2.0, 0.56, -11.55], f: FACE.pz }, bunk2: { p: [-2.0, 1.86, -11.55], f: FACE.pz },
      bunk3: { p: [-2.0, 0.56, -9.15], f: FACE.pz }, bunk4: { p: [-2.0, 1.86, -9.15], f: FACE.pz },
      bunk5: { p: [-2.0, 0.56, -4.15], f: FACE.pz }, bunk6: { p: [-2.0, 1.86, -4.15], f: FACE.pz },
      bunk7: { p: [-2.0, 0.56, -1.75], f: FACE.pz }, bunk8: { p: [-2.0, 1.86, -1.75], f: FACE.pz },
      locker1: { p: [-9.3, 0, 0.2], f: FACE.pz }, locker2: { p: [-8.75, 0, 0.2], f: FACE.pz }, locker3: { p: [-8.2, 0, 0.2], f: FACE.pz }, locker4: { p: [-7.65, 0, 0.2], f: FACE.pz },
      locker5: { p: [-7.1, 0, 0.2], f: FACE.pz }, locker6: { p: [-6.55, 0, 0.2], f: FACE.pz }, locker7: { p: [-6.0, 0, 0.2], f: FACE.pz }, locker8: { p: [-5.45, 0, 0.2], f: FACE.pz },
      table: { p: [-6.6, 0, -6.2], f: FACE.pz }, chair: { p: [-6.6, 0.46, -7.3], f: FACE.pz },
    },
  },
  workshop: {
    id: 'workshop', name: 'WORKSHOP + HANGAR', short: 'HGR', deck: 'DECK 1 AFT', code: '06', role: 'Build the capsule pod and its upgrades',
    x0: -10, x1: -1.4, z0: -27, z1: -12, light: 0xffe0b0, lightK: 1.05,
    spots: {
      door: { p: [-1.9, 0, -15.5], f: FACE.nx }, center: { p: [-5.7, 0, -19.5], f: FACE.pz },
      pod_cradle: { p: [-6.0, 0.35, -19.8], f: FACE.pz }, bay_hatch: { p: [-6.0, 0, -19.8], f: FACE.pz },
      workbench: { p: [-2.5, 0, -22.6], f: FACE.px }, toolwall: { p: [-2.4, 0, -25.4], f: FACE.px },
      welder: { p: [-4.2, 0, -17.0], f: FACE.nz }, crane: { p: [-6.0, 4.6, -19.8], f: FACE.pz },
    },
  },
  mess: {
    id: 'mess', name: 'MESS + GALLEY', short: 'MESS', deck: 'DECK 1 STBD', code: '07', role: 'Galley, coffee and the long table',
    x0: 1.4, x1: 10, z0: -4, z1: 7, light: 0xffd49a, lightK: 1.0,
    spots: {
      door: { p: [1.9, 0, 1.5], f: FACE.px }, center: { p: [5.2, 0, 1.5], f: FACE.pz },
      seat1: { p: [4.3, 0.47, 0.3], f: FACE.px }, seat2: { p: [4.3, 0.47, 1.5], f: FACE.px }, seat3: { p: [4.3, 0.47, 2.7], f: FACE.px },
      seat4: { p: [6.1, 0.47, 0.3], f: FACE.nx }, seat5: { p: [6.1, 0.47, 1.5], f: FACE.nx }, seat6: { p: [6.1, 0.47, 2.7], f: FACE.nx },
      galley: { p: [8.6, 0, -1.6], f: FACE.px }, counter: { p: [8.6, 0, 0.8], f: FACE.px }, coffee: { p: [8.6, 0, 3.4], f: FACE.px },
    },
  },
  cargo: {
    id: 'cargo', name: 'CARGO HOLD', short: 'CGO', deck: 'DECK 1 STBD', code: '08', role: 'Stores, spares and specimen crates',
    x0: 1.4, x1: 10, z0: -15, z1: -4, light: 0xd8d0b8, lightK: 0.9,
    spots: {
      door: { p: [1.9, 0, -9.5], f: FACE.px }, center: { p: [5.7, 0, -9.5], f: FACE.pz },
      shelves: { p: [8.3, 0, -9.0], f: FACE.px }, crates: { p: [5.0, 0, -12.6], f: FACE.pz }, loader: { p: [3.4, 0, -6.4], f: FACE.pz },
    },
  },
  engineering: {
    id: 'engineering', name: 'ENGINEERING', short: 'ENG', deck: 'DECK 1 AFT', code: '09', role: 'Fusion reactor, power and life support',
    x0: 1.4, x1: 10, z0: -27, z1: -15, light: 0xffb070, lightK: 1.0,
    spots: {
      door: { p: [1.9, 0, -18], f: FACE.px }, center: { p: [5.7, 0, -21], f: FACE.pz },
      reactor: { p: [6.2, 0, -21.6], f: FACE.pz }, console: { p: [4.2, 0, -16.0], f: FACE.pz }, valves: { p: [9.0, 0, -24.4], f: FACE.px },
      catwalk: { p: [3.7, 0, -21.6], f: FACE.px },
    },
  },
};

/** the room under a deck point, or null (corridor, outside) */
export function roomAt(x: number, z: number): RoomId | null {
  for (const id of ROOM_IDS) { const r = ROOMS[id]; if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return id; }
  return null;
}

// ------------------------------------------------------------------ cameras
/** the overview looks from port-aft-above (azimuth measured from +z toward +x, so port-aft is about -1.9 rad) */
export const VIEW = { az: -1.9, el: 0.84, fov: 20 };
export function viewDir(az = VIEW.az, el = VIEW.el) { return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)); }

export interface CamPreset { pos: THREE.Vector3; look: THREE.Vector3; fov: number }
/** a room's close-up camera: the overview direction, closer, a touch lower, framing the room's floor and walls */
export function roomCam(id: RoomId): CamPreset {
  const r = ROOMS[id], v = r.view ?? {};
  const look = v.look ? new THREE.Vector3(...v.look) : new THREE.Vector3((r.x0 + r.x1) / 2 + 0.5, 0.8, (r.z0 + r.z1) / 2 + 0.2);
  const fov = v.fov ?? 30, el = v.el ?? 0.66, az = -2.15 + (v.az ?? 0);
  const size = Math.max(r.x1 - r.x0, (r.z1 - r.z0) * 0.85) * 0.6 + 1.4;
  const dist = (size / Math.tan(THREE.MathUtils.degToRad(fov) / 2)) * (v.k ?? 1) * 0.66;
  return { pos: look.clone().addScaledVector(viewDir(az, el), dist), look, fov };
}
/** the ship's extent (with the engines and the nose), for framing */
export const SHIP_BOX = new THREE.Box3(new THREE.Vector3(-11.2, -3.6, -37.5), new THREE.Vector3(11.2, 3.6, 32));
/** the whole cutaway, fitted to the frame (top strip and dock kept clear) */
export function overviewCam(aspect = 16 / 9, box = SHIP_BOX, dir = viewDir(), fov = VIEW.fov, margin = 1.06): CamPreset {
  const d = dir.clone().normalize(), up0 = new THREE.Vector3(0, 1, 0);
  const r = new THREE.Vector3().crossVectors(up0, d).normalize(), u = new THREE.Vector3().crossVectors(d, r).normalize();
  const c = box.getCenter(new THREE.Vector3());
  const ty = Math.tan(THREE.MathUtils.degToRad(fov) / 2), tx = ty * aspect;
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  // centre the projected extent, then back off until every corner is inside (perspective, so iterate)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of corners) { const q = p.clone().sub(c); x0 = Math.min(x0, q.dot(r)); x1 = Math.max(x1, q.dot(r)); y0 = Math.min(y0, q.dot(u)); y1 = Math.max(y1, q.dot(u)); }
  const look = c.clone().addScaledVector(r, (x0 + x1) / 2).addScaledVector(u, (y0 + y1) / 2);
  // the UI covers about 7% at the top and 11% at the bottom: shift the picture up a little, use 82% of the height
  const vy = 0.8;
  let dist = 10;
  for (const p of corners) {
    const q = p.clone().sub(look), depth = q.dot(d);
    dist = Math.max(dist, Math.abs(q.dot(r)) / tx * margin + depth, Math.abs(q.dot(u)) / (ty * vy) * margin + depth);
  }
  look.addScaledVector(u, -ty * dist * 0.04);
  return { pos: look.clone().addScaledVector(d, dist), look, fov };
}
