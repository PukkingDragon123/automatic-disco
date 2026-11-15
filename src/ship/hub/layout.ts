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
/** the deck: two columns of small, packed rooms either side of the spine corridor, the bridge across the bow */
export const CORRIDOR = { x0: -1.2, x1: 1.2, z0: -14, z1: 12 };
/** the outer hull walls (their room-side faces sit a quarter metre inside) */
export const HULL_X = 7.2;
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
    id: 'bridge', name: 'BRIDGE', short: 'BRG', deck: 'DECK 1 FWD', code: '01', role: 'Main monitor: scan, choose a world, deploy',
    x0: -6, x1: 6, z0: 12, z1: 18.5, light: 0x9fc6d8, lightK: 1.0,
    spots: {
      door: { p: [0, 0, 12.4], f: FACE.pz }, center: { p: [0, 0, 15], f: FACE.pz },
      captain: { p: [0, 0.62, 13.9], f: FACE.pz }, helm: { p: [-1.5, 0.3, 16.5], f: FACE.pz }, nav: { p: [1.5, 0.3, 16.5], f: FACE.pz },
      comms: { p: [4.5, 0, 13.6], f: FACE.px }, monitor: { p: [0, 0, 17.1], f: FACE.nz },
    },
    view: { el: 0.72, fov: 30, k: 0.95, look: [0.3, 0.9, 15.3] },
  },
  lab: {
    id: 'lab', name: 'RESEARCH LAB', short: 'LAB', deck: 'DECK 1 STBD', code: '02', role: 'Bio-engineering: design and print engineered life',
    x0: 1.2, x1: 7.2, z0: 6, z1: 12, light: 0xc8f0d8, lightK: 1.0,
    spots: {
      door: { p: [1.6, 0, 8.6], f: FACE.px }, center: { p: [4.0, 0, 9.0], f: FACE.pz },
      bench: { p: [5.9, 0, 7.6], f: FACE.px }, scope: { p: [5.9, 0, 9.0], f: FACE.px }, tank: { p: [3.6, 0, 10.6], f: FACE.pz },
      terminal: { p: [2.4, 0, 6.9], f: FACE.nz }, hull_breach: { p: [6.95, 1.45, 10.7], f: FACE.nx }, apple_throw: { p: [4.4, 0, 10.7], f: FACE.px },
    },
  },
  medbay: {
    id: 'medbay', name: 'MEDBAY', short: 'MED', deck: 'DECK 1 PORT', code: '03', role: 'Crew health, triage and the bio-scanner',
    x0: -7.2, x1: -1.2, z0: 7, z1: 12, light: 0xe8f2f4, lightK: 1.0,
    spots: {
      door: { p: [-1.6, 0, 9.5], f: FACE.nx }, center: { p: [-4.0, 0, 9.5], f: FACE.pz },
      bed1: { p: [-1.65, 0.78, 7.9], f: FACE.nx }, bed2: { p: [-1.65, 0.78, 11.1], f: FACE.nx },
      doctor: { p: [-3.9, 0, 9.5], f: FACE.px }, scanner: { p: [-4.7, 0, 8.6], f: FACE.nx }, cabinet: { p: [-5.2, 0, 11.3], f: FACE.pz },
    },
  },
  core: {
    id: 'core', name: 'AI CORE', short: 'CORE', deck: 'DECK 1 PORT', code: '04', role: 'Unit 07: settings, save and load',
    x0: -7.2, x1: -1.2, z0: 2, z1: 7, light: 0x8fe0a8, lightK: 0.9,
    spots: {
      door: { p: [-1.6, 0, 4.5], f: FACE.nx }, center: { p: [-4.4, 0, 4.5], f: FACE.pz },
      core: { p: [-4.6, 0, 4.5], f: FACE.pz }, console: { p: [-4.7, 0, 5.8], f: FACE.pz }, racks: { p: [-2.6, 0, 3.0], f: FACE.px },
    },
  },
  quarters: {
    id: 'quarters', name: 'LIVING QUARTERS', short: 'QTR', deck: 'DECK 1 PORT', code: '05', role: 'Bunks and lockers for the crew of eight',
    x0: -7.2, x1: -1.2, z0: -6, z1: 2, light: 0xf2cf98, lightK: 0.95,
    spots: {
      door: { p: [-1.6, 0, 0.6], f: FACE.nx }, center: { p: [-4.3, 0, -2.4], f: FACE.pz },
      // two bunk units along the corridor wall (head aft), two along the bow wall (head to port); pos = head on the mattress
      bunk1: { p: [-1.75, 0.56, -5.7], f: FACE.pz }, bunk2: { p: [-1.75, 1.86, -5.7], f: FACE.pz },
      bunk3: { p: [-1.75, 0.56, -3.5], f: FACE.pz }, bunk4: { p: [-1.75, 1.86, -3.5], f: FACE.pz },
      bunk5: { p: [-6.75, 0.56, 1.47], f: FACE.px }, bunk6: { p: [-6.75, 1.86, 1.47], f: FACE.px },
      bunk7: { p: [-4.55, 0.56, 1.47], f: FACE.px }, bunk8: { p: [-4.55, 1.86, 1.47], f: FACE.px },
      locker1: { p: [-6.2, 0, -5.45], f: FACE.nx }, locker2: { p: [-6.2, 0, -4.95], f: FACE.nx }, locker3: { p: [-6.2, 0, -4.45], f: FACE.nx }, locker4: { p: [-6.2, 0, -3.95], f: FACE.nx },
      locker5: { p: [-6.2, 0, -3.45], f: FACE.nx }, locker6: { p: [-6.2, 0, -2.95], f: FACE.nx }, locker7: { p: [-6.2, 0, -2.45], f: FACE.nx }, locker8: { p: [-6.2, 0, -1.95], f: FACE.nx },
      table: { p: [-4.1, 0, -2.6], f: FACE.pz }, chair: { p: [-4.1, 0.46, -3.4], f: FACE.pz },
    },
  },
  workshop: {
    id: 'workshop', name: 'WORKSHOP + HANGAR', short: 'HGR', deck: 'DECK 1 AFT', code: '06', role: 'Build the capsule pod and its upgrades',
    x0: -7.2, x1: -1.2, z0: -14, z1: -6, light: 0xffe0b0, lightK: 1.05,
    spots: {
      door: { p: [-1.6, 0, -7.4], f: FACE.nx }, center: { p: [-4.2, 0, -10], f: FACE.pz },
      pod_cradle: { p: [-4.4, 0.35, -10.4], f: FACE.pz }, bay_hatch: { p: [-4.4, 0, -10.4], f: FACE.pz },
      workbench: { p: [-2.1, 0, -12.6], f: FACE.px }, toolwall: { p: [-2.1, 0, -13.4], f: FACE.px },
      welder: { p: [-2.6, 0, -8.6], f: FACE.nz }, crane: { p: [-4.4, 4.0, -10.4], f: FACE.pz },
    },
  },
  mess: {
    id: 'mess', name: 'MESS + GALLEY', short: 'MESS', deck: 'DECK 1 STBD', code: '07', role: 'Galley, coffee and the long table',
    x0: 1.2, x1: 7.2, z0: 0, z1: 6, light: 0xffd49a, lightK: 1.0,
    spots: {
      door: { p: [1.6, 0, 0.8], f: FACE.px }, center: { p: [3.8, 0, 3.0], f: FACE.pz },
      seat1: { p: [2.95, 0.47, 2.2], f: FACE.px }, seat2: { p: [2.95, 0.47, 3.0], f: FACE.px }, seat3: { p: [2.95, 0.47, 3.8], f: FACE.px },
      seat4: { p: [4.65, 0.47, 2.2], f: FACE.nx }, seat5: { p: [4.65, 0.47, 3.0], f: FACE.nx }, seat6: { p: [4.65, 0.47, 3.8], f: FACE.nx },
      galley: { p: [5.9, 0, 1.5], f: FACE.px }, counter: { p: [5.9, 0, 2.9], f: FACE.px }, coffee: { p: [5.9, 0, 4.3], f: FACE.px },
    },
  },
  cargo: {
    id: 'cargo', name: 'CARGO HOLD', short: 'CGO', deck: 'DECK 1 STBD', code: '08', role: 'Stores, spares and specimen crates',
    x0: 1.2, x1: 7.2, z0: -6, z1: 0, light: 0xd8d0b8, lightK: 0.9,
    spots: {
      door: { p: [1.6, 0, -3.0], f: FACE.px }, center: { p: [3.8, 0, -3.0], f: FACE.pz },
      shelves: { p: [5.5, 0, -3.0], f: FACE.px }, crates: { p: [3.4, 0, -5.0], f: FACE.pz }, loader: { p: [2.3, 0, -1.2], f: FACE.pz },
    },
  },
  engineering: {
    id: 'engineering', name: 'ENGINEERING', short: 'ENG', deck: 'DECK 1 AFT', code: '09', role: 'Fusion reactor, power and life support',
    x0: 1.2, x1: 7.2, z0: -14, z1: -6, light: 0xffb070, lightK: 1.0,
    spots: {
      door: { p: [1.6, 0, -8.6], f: FACE.px }, center: { p: [4.0, 0, -10], f: FACE.pz },
      reactor: { p: [4.1, 0, -10.4], f: FACE.pz }, console: { p: [3.0, 0, -7.3], f: FACE.pz }, valves: { p: [6.0, 0, -12.4], f: FACE.px },
      catwalk: { p: [2.0, 0, -10.4], f: FACE.px },
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
export const SHIP_BOX = new THREE.Box3(new THREE.Vector3(-8.0, -3.0, -23.5), new THREE.Vector3(8.0, 3.6, 21.5));
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

// ------------------------------------------------------------------ the key props (click one to use the room)
export type Box6 = [number, number, number, number, number, number];
export const KEYS: Record<RoomId, { label: string; boxes: Box6[] }> = {
  bridge: { label: 'HOLO TABLE · SCAN', boxes: [[-0.9, 0, 14.6, 0.9, 2.2, 16.4]] },
  lab: { label: 'SPECIMEN TANKS · GENE LAB', boxes: [[2.4, 0, 11.0, 5.7, 2.7, 12.0]] },
  medbay: { label: 'MED BEDS · CREW HEALTH', boxes: [[-3.5, 0, 7.4, -1.3, 1.2, 8.4], [-3.5, 0, 10.6, -1.3, 1.2, 11.6]] },
  core: { label: 'AI CORE · UNIT 07', boxes: [[-5.6, 0, 3.5, -3.6, 3.4, 5.5]] },
  quarters: { label: 'BUNKS · CREW + MORALE', boxes: [[-2.3, 0, -6.0, -1.3, 2.5, -3.8], [-2.3, 0, -3.7, -1.3, 2.5, -1.5], [-7.0, 0, 1.0, -2.7, 2.5, 2.0]] },
  workshop: { label: 'POD CRADLE · ASSEMBLY', boxes: [[-6.0, 0, -12.0, -2.8, 2.6, -8.8]] },
  mess: { label: 'GALLEY · STORES', boxes: [[6.2, 0, 0.2, 7.0, 2.3, 3.9]] },
  cargo: { label: 'CARGO RACKS · STORES', boxes: [[6.0, 0, -5.9, 7.0, 3.0, -0.2]] },
  engineering: { label: 'REACTOR · POWER BUS', boxes: [[2.6, 0, -11.9, 5.6, 3.8, -8.9]] },
};
