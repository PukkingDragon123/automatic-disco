// U.S.S. VANGUARD (CVS-01), the Planetary Corps' orbital carrier, in three.js: a 180 m riveted hull in haze grey
// with an armoured upper beak over the launch-bay mouth, an island tower (lit bridge windows, a turning radar
// dish, whip antennas, a strobe), side tanks strapped in bands, radiator fins round the reactor, five bell
// nozzles idling at the stern, floodlight masts throwing beams on the stencilled name, hull number, Corps line and
// the star-and-bar. Inside the bow, Launch Bay 2: a long hangar of ribbed olive walls and diamond tread, catwalks
// on both sides, a gantry crane on ceiling rails, the hazard-striped launch rail with its steam-piston sled and
// clamp arms, red rotating beacons, armoured clamshell doors at the end; deck crew in jersey colours, and up in
// the glassed control gallery the launch officer, his nixie countdown, the big red lever and the plotting table.
// Ship-local frame: +z bow, +y dorsal, metres. Exterior and interior keep separate light rigs (setView).
import * as THREE from 'three';
import { Bin, lit, lamp, mesh, box, cyl, tbox, beam, decal, loft, ptex, hullPix, enamelPix, treadPix, hazardPix, stencil, insignia, windowPix, fxMat, HAZE, V3, TAU, sm, hash, type V } from './deployKit';
import { makePod, type Pod } from './deployPod';
import { gbuf } from '../gfx/gbuf';
import { GM, OL, CR, AM, Pix, dv } from './machine';
import { Actor } from './cineCast';
import { Researcher } from '../limbo/entities/researcher';
import type { Appearance, Outfit } from '../limbo/entities/humanRig';
import { worldMaterial } from '../limbo/gfx/materials';
import { registerAllTextures } from '../limbo/gfx/textures/index';
import { objDef, objectGeometry } from '../limbo/world/objects';
import '../limbo/content/textures/materials';
import '../limbo/content/furniture/b_industrial';
import '../limbo/content/furniture/b_lab';
import '../limbo/content/furniture/zw_annex';

/** the bay, in ship-local metres */
export const BAY = { x0: -9, x1: 9, floor: -15, ceil: -2.5, z0: 6, z1: 63.6, cat: -9, railY: -14.3, podY: -13.05, podZ0: 15 };
/** the control gallery (booth) on the port catwalk */
export const BOOTH = { x0: -9, x1: -4.2, z0: 8, z1: 18.5, floor: -9, ceil: -5.6, table: new V3(-6.6, -9, 12.2), tableTop: -8.06 };

const CONE_V = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
/** a light beam in dusty air: brightest at the lamp, soft at the edges (view-facing), banded like the rest */
const CONE_F = `uniform vec3 uCol; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float fall = pow(vUv.y, 1.7);
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
  float a = fall * rim * uK;
  a = floor(a * 10.0) / 10.0;
  gl_FragColor = vec4(uCol * a, 0.0);
  gNormal = vec4(0.0);
}`;
/** a nozzle's idle glow: a hot throat fading out along the bell */
const NOZ_F = `uniform vec3 uCol; uniform float uK, uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  float a = pow(1.0 - vUv.y, 2.0) * uK * (0.85 + 0.15 * sin(uT * 31.0 + vUv.x * 40.0));
  gl_FragColor = vec4(uCol * a, 0.0);
  gNormal = vec4(0.0);
}`;

export interface Crew { a: Actor; role: string; home: V; post: V }
export interface Ship {
  root: THREE.Group;
  /** the system's sun (exterior key light, shadowed): point it with sun.position (direction toward the sun, ship-local) */
  sun: THREE.DirectionalLight;
  pod: Pod; sled: THREE.Group;
  /** slide the sled (and the pod in it) to z (ship-local) */
  setSled(z: number): void;
  /** clamp arms 0 open .. 1 locked */
  setClamps(u: number): void;
  /** gantry crane: bridge z, trolley x, hook drop (m below the trolley) */
  setCrane(z: number, x: number, drop: number): void;
  hook: THREE.Group;
  /** clamshell doors 0 shut .. 1 open */
  setDoors(u: number): void;
  setBeacons(on: boolean): void;
  setLever(u: number): void;
  setNixies(s: string): void;
  /** the launch officer and deck crew (empty / null when built without people) */
  crew: Crew[]; officer: Actor | null;
  /** 'ext': the sun, floodlights and the hull's own lamps; 'int': the hangar rig; 'both' (the launch, seen from outside) */
  setView(v: 'ext' | 'int' | 'both'): void;
  /** the planet-light pouring in through the open doors (0..1) */
  doorLight: THREE.DirectionalLight;
  update(dt: number, t: number): void;
  w(x: number, y: number, z: number, out?: V): V;
  dispose(): void;
}

// ------------------------------------------------------------------ crew looks
const APP = (o: Partial<Appearance> & Record<string, unknown>) => ({
  skin: 0xd9a47c, hair: 0x3a2618, hairStyle: 'short', face: 1, build: 'average', height: 1.0, bodyShape: 0.05, eyeColor: 0x4a5a6a,
  facialHair: 'none', freckles: 0.02, scars: 0, age: 0.3, jaw: 2, eyeShape: 1, brows: 1, nose: 2, mouth: 1, ears: 1, ...o,
}) as unknown as Appearance;
const JERSEY = { yellow: 0xa88c3a, red: 0x8a3a2e, blue: 0x3e566e, green: 0x4e6444, brown: 0x6a4e34 };
function deckOutfit(col: number, helmet: number): Outfit {
  return {
    torso: { tex: 'c_jumpsuit', color: col, sleeve: 'long' }, legs: { tex: 'c_slacks', color: 0x3a3c40 }, legsKind: 'pants',
    feet: { tex: 'c_shoes_boot', color: 0x2a2018 }, hands: { tex: 'c_gloves', color: 0x4a3a28 }, head: { tex: 'c_hardhat', color: helmet, hat: 'helmet' },
  };
}

// ------------------------------------------------------------------ textures
function bayWallPix() {
  const W = 128, H = 128, p = new Pix(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rib = x % 32;
    let v = 4.6 + (hash(x >> 4, y >> 5, 3) - 0.5) * 0.5 + (hash(x, y, 1) - 0.5) * 0.55;
    if (rib < 2) v -= 1.8; else if (rib < 4) v += 1.1; else if (rib > 29) v -= 0.6;
    if (y > H - 20) v -= 0.9 + (hash(x >> 1, y, 9) < 0.2 ? 0.8 : 0);
    if (y < 3) v += 0.8;
    p.set(x, y, dv(OL, v, x, y));
  }
  for (let x = 0; x < W; x += 32) for (let y = 6; y < H; y += 10) { p.set(x + 6, y, OL[8]); p.set(x + 7, y + 1, OL[1]); p.set(x + 25, y, OL[8]); p.set(x + 26, y + 1, OL[1]); }
  for (let x = 0; x < W; x++) { for (let y = H - 8; y < H - 4; y++) p.set(x, y, ((x + y) % 8) < 4 ? dv(AM, 4.8, x, y) : GM[1]); }
  return p;
}
function ceilPix() {
  const p = new Pix(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, dv(GM, 2.4 + (hash(x >> 3, y >> 3, 5) - 0.5) * 0.6 + (hash(x, y, 2) - 0.5) * 0.5 + (x % 16 < 1 || y % 16 < 1 ? -1 : 0), x, y));
  return p;
}
function tankPix() {
  const p = hullPix([0x3a3a32, 0x47473d, 0x545448, 0x626255, 0x707062, 0x7e7e6f, 0x8c8c7c, 0x9a9a8a, 0xa8a898, 0xb8b8a8], 21, 128, 64, 32);
  return p;
}
function radiatorPix() {
  const p = new Pix(32, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) p.set(x, y, dv(GM, (x % 4 === 0 ? 1.2 : 2.6) + (hash(x, y, 4) - 0.5) * 0.4 + (y % 16 === 0 ? -1 : 0), x, y));
  return p;
}

/** a numeral as a nixie tube shows it: the lit orange cathode with its halo, the unlit ones faint behind */
function nixieCanvas(ch: string) {
  const W = 40, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#120a06'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,70,40,0.25)'; g.lineWidth = 1;
  for (let x = 2; x < W; x += 4) { g.beginPath(); g.moveTo(x, 4); g.lineTo(x, H - 4); g.stroke(); }
  g.font = '48px VT'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(110,60,30,0.35)'; g.fillText('8', W / 2, H / 2 + 2);
  if (ch.trim()) {
    g.shadowColor = 'rgba(255,120,30,0.9)'; g.shadowBlur = 8; g.fillStyle = '#ffb060'; g.fillText(ch, W / 2, H / 2 + 2);
    g.shadowBlur = 0; g.fillStyle = '#ffe2b0'; g.fillText(ch, W / 2, H / 2 + 2);
  }
  return c;
}

// ------------------------------------------------------------------ the build
export function buildShip(bin: Bin, parent: THREE.Object3D, opts: { people?: boolean } = {}): Ship {
  registerAllTextures();
  const root = new THREE.Group(); root.name = 'uss-vanguard'; parent.add(root);
  const ext = new THREE.Group(); ext.name = 'exterior'; root.add(ext);
  const bay = new THREE.Group(); bay.name = 'bay'; root.add(bay);
  const extLights: THREE.Light[] = [], intLights: THREE.Light[] = [];
  const keep: { rig: Researcher }[] = [];

  // ---- materials
  const hull = lit(bin, 0xffffff, { map: ptex(bin, hullPix(HAZE, 3, 256, 256, 48)) });
  const hullDark = lit(bin, 0xb8bcbc, { map: ptex(bin, hullPix(HAZE, 8, 256, 256, 48)) });
  const steel = lit(bin, 0x8d8f8a, { phong: true, shininess: 50 });
  const gun = lit(bin, 0x4b4e50);
  const darkGun = lit(bin, 0x232527);
  const black = lit(bin, 0x141516);
  const olive = lit(bin, 0xffffff, { map: ptex(bin, enamelPix(OL, 4, 64, 64)) });
  const hz = ptex(bin, hazardPix(32, 8, 8));
  const haz = lit(bin, 0xffffff, { map: hz });
  const tread = lit(bin, 0xffffff, { map: ptex(bin, treadPix(11, 64)) });
  const wall = lit(bin, 0xffffff, { map: ptex(bin, bayWallPix()) });
  const ceil = lit(bin, 0xffffff, { map: ptex(bin, ceilPix()) });
  const tankM = lit(bin, 0xffffff, { map: ptex(bin, tankPix()) });
  const radM = lit(bin, 0xffffff, { map: ptex(bin, radiatorPix()) });
  const winT = ptex(bin, windowPix(8, 2));
  const winM = lit(bin, 0xffffff, { map: winT, emissiveMap: winT, emissive: 0xc8a070 });
  const coneU = (c: number, k: number) => ({ uCol: { value: new THREE.Color(c) }, uK: { value: k } });

  // ================================================================ EXTERIOR
  // lower hull (round the bay), upper hull and the beak over the bay mouth, the stern block
  const lower = mesh(bin, loft([[-74, 15, 9.5, -8.5, 0.5], [-60, 18, 10, -8.5, 0.5], [44, 18, 10, -8.5, 0.5], [58, 15.5, 9.5, -8.8, 0.6], [64, 14.2, 9.2, -8.8, 0.62]], 1 / 32, false), hullDark, ext);
  lower.name = 'hull-lower';
  mesh(bin, loft([[-76, 13.5, 7, 7.5, 0.4], [34, 13.5, 7, 7.5, 0.4], [62, 10, 5.5, 6.5, 0.6], [78, 6, 3.6, 5, 0.7], [92, 2.2, 1.6, 3.5, 0.8]], 1 / 32), hull, ext).name = 'hull-upper';
  // the back cap of the lower hull (the bay mouth end stays open: a frame round it)
  mesh(bin, loft([[-74.2, 15, 9.5, -8.5, 0.5], [-74, 15, 9.5, -8.5, 0.5]], 1 / 32), hullDark, ext);
  // bay mouth frame (front face at z = 64) and its hazard border
  const mz = 63.9;
  tbox(bin, 10.2, 18.4, 1.2, hullDark, 1 / 8, ext, -14.2 + 5.1 - 4.9, -8.8, mz);
  tbox(bin, 10.2, 18.4, 1.2, hullDark, 1 / 8, ext, 14.2 - 5.1 + 4.9, -8.8, mz);
  tbox(bin, 18.2, 3.4, 1.2, hullDark, 1 / 8, ext, 0, -0.9, mz);
  tbox(bin, 18.2, 3.8, 1.2, hullDark, 1 / 8, ext, 0, -16.6, mz);
  const hb = (w: number, h: number, x: number, y: number) => { const m = tbox(bin, w, h, 0.3, haz, 1, ext, x, y, mz + 0.62); m.castShadow = false; };
  hb(19.6, 0.7, 0, -2.25); hb(19.6, 0.7, 0, -14.75); hb(0.7, 12.5, -9.45, -8.5); hb(0.7, 12.5, 9.45, -8.5);
  // stern: engine block and five bell nozzles, idling
  tbox(bin, 30, 26, 10, hullDark, 1 / 8, ext, 0, -1, -80);
  const nozU = { uCol: { value: new THREE.Color(1.6, 0.6, 0.18) }, uK: { value: 0.6 }, uT: { value: 0 } };
  const nozMat = fxMat(bin, CONE_V, NOZ_F, nozU, 'add', { side: THREE.BackSide });
  for (const [x, y, r] of [[0, -1, 5.2], [-9.5, 6.5, 3.4], [9.5, 6.5, 3.4], [-9.5, -8.5, 3.4], [9.5, -8.5, 3.4]] as [number, number, number][]) {
    const bell = mesh(bin, new THREE.CylinderGeometry(r * 0.45, r, r * 1.5, 20, 1, true), lit(bin, 0x3a3532, { side: THREE.DoubleSide, phong: true, shininess: 30 }), ext, x, y, -85 - r * 0.75);
    bell.rotation.x = Math.PI / 2;
    const glow = mesh(bin, new THREE.CylinderGeometry(r * 0.42, r * 0.95, r * 1.45, 20, 1, true), nozMat, ext, x, y, -85 - r * 0.72, false);
    glow.rotation.x = Math.PI / 2;
    cyl(bin, r * 0.5, r * 0.5, 1.2, steel, ext, x, y, -85.5).rotation.x = Math.PI / 2;
  }
  // side tanks with strap bands and hazard collars
  for (const s of [-1, 1]) {
    const tank = mesh(bin, new THREE.CylinderGeometry(4.2, 4.2, 92, 24, 1), tankM, ext, s * 21.5, -6, -12);
    tank.rotation.x = Math.PI / 2;
    const tu = (tank.geometry.attributes.uv as THREE.BufferAttribute); for (let i = 0; i < tu.count; i++) tu.setXY(i, tu.getX(i) * 0.82, tu.getY(i) * 2.9);
    for (const cz of [-58, 34]) { const cap = mesh(bin, new THREE.SphereGeometry(4.2, 24, 10, 0, TAU, 0, Math.PI / 2), tankM, ext, s * 21.5, -6, cz); cap.rotation.x = cz > 0 ? Math.PI / 2 : -Math.PI / 2; }
    for (let z = -50; z <= 26; z += 9.5) { const band = cyl(bin, 4.35, 4.35, 0.6, gun, ext, s * 21.5, -6, z, 24); band.rotation.x = Math.PI / 2; }
    for (const z of [-55, 31]) { const c = cyl(bin, 4.32, 4.32, 1.4, haz, ext, s * 21.5, -6, z, 24); c.rotation.x = Math.PI / 2; }
    // struts to the hull
    for (let z = -46; z <= 20; z += 22) { beam(bin, new V3(s * 18, -4, z), new V3(s * 17.6, -6, z), 0.5, gun, ext); box(bin, 3.2, 1, 1.4, gun, ext, s * 19, -5, z); }
    decal(bin, stencil(bin, s < 0 ? 'LOX' : 'HYDRAZINE', { size: 20, color: CR[4], wear: 0.1 }), s < 0 ? 4 : 9, ext, new V3(s * 25.75, -5, 5), new V3(s, 0, 0), new V3(0, 1, 0));
  }
  // radiator fins round the reactor, mid-ship
  for (const s of [-1, 1]) for (const z of [-40, -18]) {
    const fin = tbox(bin, 22, 0.35, 16, radM, 1 / 8, ext, s * 25, 9, z);
    fin.rotation.z = s * 0.18;
    beam(bin, new V3(s * 13, 9, z - 6), new V3(s * 22, 10.5, z - 6), 0.35, gun, ext); beam(bin, new V3(s * 13, 9, z + 6), new V3(s * 22, 10.5, z + 6), 0.35, gun, ext);
  }
  tbox(bin, 12, 4, 30, hullDark, 1 / 8, ext, 0, 16, -30); // reactor housing
  for (let z = -42; z <= -18; z += 4) box(bin, 12.6, 0.5, 0.5, gun, ext, 0, 18.2, z);
  // the island tower (starboard), bridge windows, mast, radar dish, antennas, strobe
  const isl = new THREE.Group(); isl.position.set(8.5, 14.5, 8); ext.add(isl);
  tbox(bin, 7, 9, 18, hull, 1 / 8, isl, 0, 4.5, 0);
  tbox(bin, 6.2, 4, 12, hull, 1 / 8, isl, 0, 11, 1.5);
  tbox(bin, 6.6, 0.4, 12.6, darkGun, 1, isl, 0, 13.2, 1.5);
  for (const [w, x, z, ry] of [[12, 3.12, 1.5, Math.PI / 2], [12, -3.12, 1.5, -Math.PI / 2], [6, 0, 7.52, 0]] as [number, number, number, number][]) {
    const win = mesh(bin, new THREE.PlaneGeometry(w, 1.2), winM, isl, x, 11.4, z, false); win.rotation.y = ry;
    const wu = win.geometry.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < wu.count; i++) wu.setX(i, wu.getX(i) * (w / 6));
  }
  winT.wrapS = THREE.RepeatWrapping;
  cyl(bin, 0.5, 0.7, 10, steel, isl, 0, 18, 1);
  const dish = new THREE.Group(); dish.position.set(0, 23, 1); isl.add(dish);
  const dishG = new THREE.SphereGeometry(3.2, 16, 6, 0, TAU, 0, 0.9); dishG.translate(0, -3.2 * Math.cos(0.9) - 0.2, 0);
  const dm = mesh(bin, dishG, lit(bin, 0x9a9c98, { side: THREE.DoubleSide }), dish, 0, 0, 0); dm.rotation.x = Math.PI / 2 + 0.3;
  box(bin, 0.3, 0.3, 2.4, steel, dish, 0, 0, 1.0);
  for (const [x, h] of [[-2.2, 7], [2.4, 9], [-1.2, 11]] as [number, number][]) cyl(bin, 0.06, 0.12, h, steel, isl, x, 13.4 + h / 2, -5.2, 5);
  const strobeM = lamp(bin, 0xffffff, 3);
  const strobe = mesh(bin, new THREE.SphereGeometry(0.35, 8, 6), strobeM, isl, -1.2, 24.5, -5.2, false);
  decal(bin, stencil(bin, '01', { size: 30, color: CR[4], wear: 0.1, bridges: true }), 5.2, isl, new V3(3.52, 4.5, 4.2), new V3(1, 0, 0), new V3(0, 1, 0));
  decal(bin, stencil(bin, '01', { size: 30, color: CR[4], wear: 0.1, bridges: true }), 5.2, isl, new V3(-3.52, 4.5, 4.2), new V3(-1, 0, 0), new V3(0, 1, 0));
  // deck: a gantry crane over cargo hatches, containers, rails
  for (const z of [36, 54]) { beam(bin, new V3(-12, 14.5, z), new V3(-10, 24, z), 0.45, gun, ext); beam(bin, new V3(12, 14.5, z), new V3(10, 24, z), 0.45, gun, ext); }
  box(bin, 21.2, 1.2, 1.2, gun, ext, 0, 24, 36); box(bin, 21.2, 1.2, 1.2, gun, ext, 0, 24, 54);
  box(bin, 1.2, 1.2, 19.2, gun, ext, -10, 24.6, 45); box(bin, 1.2, 1.2, 19.2, gun, ext, 10, 24.6, 45);
  box(bin, 4, 2.2, 3, lit(bin, 0xa88c3a), ext, 3, 25.6, 45);
  for (const [x, z, c] of [[-6, 30, 0x5a5e4a], [-6, 33.2, 0x6a5038], [4, 58, 0x4a5a66]] as [number, number, number][]) tbox(bin, 6, 2.6, 2.8, lit(bin, c, { map: ptex(bin, enamelPix(OL, z, 32, 32)) }), 1 / 3, ext, x, 15.8, z);
  tbox(bin, 18, 0.3, 14, darkGun, 1 / 2, ext, 0, 14.6, 45);
  // stencils: name, hull number, the Corps line, insignia, the bay warning
  const nameT = stencil(bin, 'U.S.S. VANGUARD', { size: 20, color: CR[4], wear: 0.06 });
  const numT = stencil(bin, 'CVS-01', { size: 30, color: CR[4], wear: 0.1, bridges: true });
  const corpsT = stencil(bin, 'UNITED STATES PLANETARY CORPS', { size: 10, color: CR[3], wear: 0.05 });
  const ins = insignia(bin);
  for (const s of [-1, 1]) {
    const side = new V3(s, 0, 0), up = new V3(0, 1, 0);
    decal(bin, nameT, 30, ext, new V3(s * 18.02, -4.8, 26), side, up);
    decal(bin, numT, 13, ext, new V3(s * 11.7, 6.2, 70), new V3(s, 0, 0.18).normalize(), up);
    decal(bin, corpsT, 44, ext, new V3(s * 13.52, 9.5, -14), side, up);
    decal(bin, ins, 14, ext, new V3(s * 18.02, -10.5, -30), side, up);
  }
  decal(bin, ins, 12, ext, new V3(0, 14.52, -58), new V3(0, 1, 0), new V3(0, 0, 1));
  decal(bin, stencil(bin, 'DANGER - LAUNCH BAY - KEEP CLEAR', { size: 10, color: 0xb8402e, wear: 0.05 }), 16, ext, new V3(0, -0.5, mz + 0.62), new V3(0, 0, 1), new V3(0, 1, 0));
  // the belly: a keel spine with ribs, cargo hatches with hazard borders, stencils, a sensor blister, and a run of
  // sequenced chase lights along the keel pointing the way to the bay mouth
  tbox(bin, 4.4, 1.6, 132, hullDark, 1 / 8, ext, 0, -19.2, -6);
  for (let z = -70; z <= 58; z += 6) box(bin, 7, 0.9, 0.7, gun, ext, 0, -18.8, z);
  for (const s of [-1, 1]) for (const z of [-46, -26, 6]) {
    tbox(bin, 7.2, 0.25, 9.2, darkGun, 1, ext, s * 9.5, -18.55, z);
    for (const [w, d, dx, dz] of [[7.6, 0.4, 0, 4.8], [7.6, 0.4, 0, -4.8], [0.4, 9.6, 3.8, 0], [0.4, 9.6, -3.8, 0]] as [number, number, number, number][]) box(bin, w, 0.3, d, haz, ext, s * 9.5 + dx, -18.6, z + dz).castShadow = false;
  }
  const bellyT = stencil(bin, 'U.S.P.C.', { size: 30, color: CR[4], wear: 0.1, bridges: true });
  decal(bin, bellyT, 22, ext, new V3(0, -18.52, -14), new V3(0, -1, 0), new V3(0, 0, 1));
  decal(bin, ins, 16, ext, new V3(9.5, -18.52, 32), new V3(0, -1, 0), new V3(0, 0, 1));
  decal(bin, ins, 16, ext, new V3(-9.5, -18.52, 32), new V3(0, -1, 0), new V3(0, 0, 1));
  mesh(bin, new THREE.SphereGeometry(2.4, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2), lit(bin, 0x3a3d40, { phong: true, shininess: 70 }), ext, 0, -20, -52);
  const chase: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 22; i++) {
    const m = bin.m(gbuf(new THREE.MeshBasicMaterial({ color: 0x401a10 }), 32));
    mesh(bin, new THREE.SphereGeometry(0.32, 6, 4), m, ext, 0, -20.05, -66 + i * 6, false);
    chase.push(m);
  }
  // ---- hero detail (the menu shows the ship up close): lit portholes in rows along the upper hull, conduits with
  // flanges down the lower hull, RCS quads at the corners, a docking collar, sensor domes, deck lamps and lines,
  // the bow searchlight, coolant runs from the reactor to the stern, and the ship's name across the stern
  const portP = new Pix(16, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) portP.set(x, y, dv(HAZE, 4 + hash(x, y, 31) * 0.5, x, y));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 3.5); if (d < 3.2) portP.set(x, y, d > 2.3 ? 0x8a7a50 : y < 3 ? 0xf0d8a0 : 0xd8a860); }
  const portT = ptex(bin, portP);
  const portDarkP = new Pix(16, 8); for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 3.5); portDarkP.set(x, y, d < 3.2 ? (d > 2.3 ? 0x8a7a50 : 0x1a2024) : dv(HAZE, 4 + hash(x, y, 31) * 0.5, x, y)); }
  const portM = lit(bin, 0xffffff, { map: portT, emissiveMap: portT, emissive: 0x9a7a48, polyOffset: 1 });
  const portDM = lit(bin, 0xffffff, { map: ptex(bin, portDarkP), polyOffset: 1 });
  for (const s of [-1, 1]) for (const [y, z0, z1, m] of [[10.6, -70, 28, portM], [4.2, -64, 20, portDM], [7.4, -40, 8, portM]] as [number, number, number, THREE.Material][]) {
    const len = z1 - z0, pl = mesh(bin, new THREE.PlaneGeometry(len, 0.9), m, ext, s * 13.53, y, (z0 + z1) / 2, false);
    pl.rotation.y = s * Math.PI / 2;
    const u = pl.geometry.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * (len / 1.8));
  }
  for (const s of [-1, 1]) for (const [y, r] of [[-1.2, 0.42], [-2.4, 0.28], [-13.5, 0.36]] as [number, number][]) {
    const c = cyl(bin, r, r, 126, s < 0 ? lit(bin, 0x5a4636) : lit(bin, 0x4a5644), ext, s * 18.35, y, -6, 8); c.rotation.x = Math.PI / 2;
    for (let z = -66; z <= 54; z += 8) { const f = cyl(bin, r * 1.5, r * 1.5, 0.3, gun, ext, s * 18.35, y, z, 8); f.rotation.x = Math.PI / 2; }
  }
  for (const [x, y, z] of [[-13.6, 12, 58], [13.6, 12, 58], [-13.6, 12, -72], [13.6, 12, -72], [-18.2, -16, 56], [18.2, -16, 56], [-15.2, -16, -70], [15.2, -16, -70]] as [number, number, number][]) {
    const q = box(bin, 1.6, 1.6, 1.6, gun, ext, x, y, z);
    for (const [dx, dy, dz] of [[Math.sign(x), 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, z > 0 ? 1 : -1]] as [number, number, number][]) {
      const n = cyl(bin, 0.18, 0.32, 0.5, darkGun, q, dx * 0.95, dy * 0.95, dz * 0.95, 8);
      n.quaternion.setFromUnitVectors(new V3(0, 1, 0), new V3(dx, dy, dz));
    }
  }
  const dock = cyl(bin, 2.4, 2.4, 1.6, steel, ext, 14.3, 4.8, -50, 20); dock.rotation.z = Math.PI / 2;
  const dockR = cyl(bin, 2.7, 2.7, 0.5, haz, ext, 15.1, 4.8, -50, 20); dockR.rotation.z = Math.PI / 2;
  mesh(bin, new THREE.CircleGeometry(1.7, 20), darkGun, ext, 15.36, 4.8, -50, false).rotation.y = Math.PI / 2;
  for (const [x, z] of [[-8, -64], [8, -64], [-9, 26]] as [number, number][]) { cyl(bin, 0.4, 0.6, 1.4, gun, ext, x, 15.2, z, 8); mesh(bin, new THREE.SphereGeometry(1.5, 16, 10), lit(bin, 0xc8c4b8, { phong: true, shininess: 30 }), ext, x, 16.8, z); }
  for (const s of [-1, 1]) {
    const line = box(bin, 0.35, 0.05, 98, lit(bin, 0xa88c3a), ext, s * 4.5, 14.52, -20); line.castShadow = false;
    for (let z = -70; z <= 30; z += 10) mesh(bin, new THREE.SphereGeometry(0.22, 6, 4), lamp(bin, s < 0 ? 0xff6040 : 0x70ffa0, 1.2), ext, s * 12.6, 14.6, z, false);
  }
  const sl = new THREE.Group(); sl.position.set(0, 3.9, 91.4); ext.add(sl);
  cyl(bin, 0.7, 0.9, 1.2, darkGun, sl, 0, 0, 0, 12).rotation.x = Math.PI / 2;
  mesh(bin, new THREE.CircleGeometry(0.62, 14), lamp(bin, 0xfff0d0, 3), sl, 0, 0, 0.61, false);
  const slBeam = mesh(bin, new THREE.ConeGeometry(9, 70, 24, 1, true), fxMat(bin, CONE_V, CONE_F, coneU(0xfff0d0, 0.16), 'add', { side: THREE.DoubleSide }), sl, 0, 0, 35.6, false);
  slBeam.rotation.x = -Math.PI / 2;
  for (const s of [-1, 1]) for (const y of [2, 6]) { const p = cyl(bin, 0.5, 0.5, 34, lit(bin, 0x6a5a44), ext, s * 6, 14.9 + y * 0.1, -58, 8); p.rotation.x = Math.PI / 2; void y; }
  decal(bin, stencil(bin, 'VANGUARD', { size: 20, color: CR[4], wear: 0.08 }), 14, ext, new V3(0, 11.5, -76.05), new V3(0, 0, -1), new V3(0, 1, 0));
  // floodlight masts and their beams, the hull's running lights
  const floods: { head: THREE.Object3D; beam: THREE.Mesh }[] = [];
  const beamMat = fxMat(bin, CONE_V, CONE_F, coneU(0xffe0b0, 0.22), 'add', { side: THREE.DoubleSide });
  const floodAt = (p: V, aim: V, len: number) => {
    const g = new THREE.Group(); g.position.copy(p); ext.add(g);
    g.lookAt(root.localToWorld(aim.clone()));
    cyl(bin, 0.12, 0.16, 3, steel, ext, p.x, p.y - 1.5, p.z, 6);
    const head = box(bin, 1.1, 0.8, 0.9, darkGun, g, 0, 0, 0);
    mesh(bin, new THREE.CircleGeometry(0.36, 12), lamp(bin, 0xffe8c0, 2.6), g, 0, 0, 0.46, false);
    const bm = mesh(bin, new THREE.ConeGeometry(len * 0.3, len * 1.4, 24, 1, true), beamMat, g, 0, 0, len * 0.7 + 0.5, false);
    bm.rotation.x = -Math.PI / 2;
    floods.push({ head, beam: bm });
  };
  floodAt(new V3(-14, 16.5, 52), new V3(-18, -6, 30), 30);
  floodAt(new V3(14, 16.5, 52), new V3(18, -6, 30), 30);
  floodAt(new V3(-14, 16.5, -6), new V3(-13.5, 9.5, -22), 22);
  floodAt(new V3(6, 16.5, 28), new V3(8.5, 20, 8), 18);
  const navR = mesh(bin, new THREE.SphereGeometry(0.4, 8, 6), lamp(bin, 0xff3020, 2.2), ext, -18.3, -0.5, 44, false);
  const navG = mesh(bin, new THREE.SphereGeometry(0.4, 8, 6), lamp(bin, 0x40ff80, 2.0), ext, 18.3, -0.5, 44, false);
  // exterior light rig: the system's sun, the planet's bounce from below, two floods on the name
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2); sun.castShadow = true; sun.position.set(-0.8, 0.38, -0.46).normalize().multiplyScalar(220);
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -110; sc.right = sc.top = 110; sc.near = 10; sc.far = 420; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
  root.add(sun, sun.target); extLights.push(sun);
  // planet-shine from below (the belly reads in it), starlight above
  const bounce = new THREE.HemisphereLight(0x3a4656, 0x98b0cc, 1.5); root.add(bounce); extLights.push(bounce);
  for (const s of [-1, 1]) {
    const f = new THREE.SpotLight(0xffd8a0, 260, 70, 0.55, 0.6, 1.6); f.position.set(s * 14, 16, 52); f.target.position.set(s * 18, -6, 28);
    root.add(f, f.target); extLights.push(f);
  }

  // ================================================================ LAUNCH BAY 2
  const B = BAY, BL = B.z1 - B.z0, BW = B.x1 - B.x0, BH = B.ceil - B.floor;
  const zc = (B.z0 + B.z1) / 2;
  // floor, walls, ceiling, back wall (the front is the doors)
  const floor = tbox(bin, BW, 0.4, BL, tread, 0.25, bay, 0, B.floor - 0.2, zc); floor.castShadow = false;
  for (const s of [-1, 1]) { const wm = tbox(bin, 0.4, BH, BL, wall, 1 / 8, bay, s * (BW / 2 + 0.2), B.floor + BH / 2, zc); wm.castShadow = false; }
  const cm = tbox(bin, BW, 0.4, BL, ceil, 0.25, bay, 0, B.ceil + 0.2, zc); cm.castShadow = false;
  tbox(bin, BW, BH, 0.4, wall, 1 / 8, bay, 0, B.floor + BH / 2, B.z0 - 0.2).castShadow = false;
  // the walls' frames (I-beams every 4 m) and ceiling girders
  for (let z = B.z0 + 3; z < B.z1 - 1; z += 4) {
    for (const s of [-1, 1]) { box(bin, 0.5, BH, 0.35, gun, bay, s * (BW / 2 - 0.25), B.floor + BH / 2, z).castShadow = false; box(bin, 0.12, BH, 0.8, gun, bay, s * (BW / 2 - 0.5), B.floor + BH / 2, z).castShadow = false; }
    box(bin, BW, 0.7, 0.3, gun, bay, 0, B.ceil - 0.35, z).castShadow = false;
  }
  // pipes along the walls
  for (const [s, y, r] of [[-1, -4.0, 0.22], [-1, -4.6, 0.14], [1, -4.1, 0.28], [1, -11.5, 0.18]] as [number, number, number][]) {
    const p = cyl(bin, r, r, BL - 1, lit(bin, s < 0 ? 0x6a4e34 : 0x5a6a54), bay, s * (BW / 2 - 0.95), y, zc, 8); p.rotation.x = Math.PI / 2; p.castShadow = false;
  }
  // catwalks (grating, rails, brackets) both sides; stairs at the back on the starboard side
  const grate = lit(bin, 0x5a5d5a, { map: ptex(bin, treadPix(19, 32)) });
  for (const s of [-1, 1]) {
    const w = 2.2, cx = s * (BW / 2 - w / 2);
    const z0 = s < 0 ? BOOTH.z1 : B.z0, len = B.z1 - 1 - z0;
    tbox(bin, w, 0.15, len, grate, 0.5, bay, cx, B.cat - 0.075, z0 + len / 2);
    const rx = s * (BW / 2 - w);
    box(bin, 0.07, 0.07, len, steel, bay, rx, B.cat + 1.05, z0 + len / 2); box(bin, 0.05, 0.05, len, steel, bay, rx, B.cat + 0.55, z0 + len / 2);
    for (let z = z0 + 0.6; z < z0 + len; z += 2) { box(bin, 0.06, 1.1, 0.06, steel, bay, rx, B.cat + 0.5, z); beam(bin, new V3(rx, B.cat - 0.1, z), new V3(s * (BW / 2 - 0.1), B.cat - 1.4, z), 0.06, gun, bay); }
    box(bin, 0.04, 0.16, len, haz, bay, rx, B.cat + 0.02, z0 + len / 2);
  }
  // stairs up to the starboard catwalk at the back
  for (let i = 0; i < 14; i++) box(bin, 1.2, 0.08, 0.32, grate, bay, 5.6, B.floor + 0.43 * (i + 1), B.z0 + 1.0 + i * 0.34);
  beam(bin, new V3(5.0, B.floor, B.z0 + 0.9), new V3(5.0, B.cat, B.z0 + 5.8), 0.06, steel, bay); beam(bin, new V3(6.2, B.floor, B.z0 + 0.9), new V3(6.2, B.cat, B.z0 + 5.8), 0.06, steel, bay);
  // the floor: safety lines either side of the rail, the "keep clear" zone, the bay number
  for (const s of [-1, 1]) { const l = box(bin, 0.22, 0.02, BL - 3, lit(bin, 0xb89a3a), bay, s * 3.4, B.floor + 0.012, zc + 1.5); l.castShadow = false; }
  decal(bin, stencil(bin, 'KEEP CLEAR - 40 G', { size: 10, color: 0xb89a3a, wear: 0.15 }), 4.4, bay, new V3(-5.4, B.floor + 0.01, 30), new V3(0, 1, 0), new V3(1, 0, 0));
  decal(bin, stencil(bin, '2', { size: 30, color: CR[3], wear: 0.2, bridges: true }), 3.4, bay, new V3(5.5, B.floor + 0.01, 46), new V3(0, 1, 0), new V3(0, 0, 1));
  decal(bin, stencil(bin, 'LAUNCH BAY 2', { size: 20, color: CR[4], wear: 0.06 }), 11, bay, new V3(0, -6.2, B.z0 + 0.01), new V3(0, 0, 1), new V3(0, 1, 0));
  decal(bin, insignia(bin), 6, bay, new V3(0, -4, B.z0 + 0.01), new V3(0, 0, 1), new V3(0, 1, 0));
  decal(bin, stencil(bin, 'NO SMOKING', { size: 10, color: 0xb8402e, wear: 0.05, bg: CR[3] }), 2.2, bay, new V3(B.x1 - 0.01, -11.2, 24), new V3(-1, 0, 0), new V3(0, 1, 0));
  decal(bin, stencil(bin, 'FR 112', { size: 10, color: CR[3], wear: 0.1 }), 1.4, bay, new V3(B.x1 - 0.01, -6.6, 37), new V3(-1, 0, 0), new V3(0, 1, 0));
  decal(bin, stencil(bin, 'FR 120', { size: 10, color: CR[3], wear: 0.1 }), 1.4, bay, new V3(B.x1 - 0.01, -6.6, 53), new V3(-1, 0, 0), new V3(0, 1, 0));
  decal(bin, stencil(bin, 'VACUUM BEYOND DOORS', { size: 10, color: 0xb8402e, wear: 0.06 }), 6, bay, new V3(B.x0 + 0.01, -11.6, 56), new V3(1, 0, 0), new V3(0, 1, 0));
  // the rail: two I-beam rails on a raised bed, hazard covers, buffer stops at the back
  tbox(bin, 2.6, 0.3, BL - 6, darkGun, 1, bay, 0, B.floor + 0.15, zc + 3).castShadow = false;
  for (const s of [-1, 1]) {
    box(bin, 0.24, 0.42, BL - 6, steel, bay, s * 0.75, B.floor + 0.51, zc + 3);
    box(bin, 0.3, 0.42, BL - 6, haz, bay, s * 1.42, B.floor + 0.3, zc + 3);
  }
  box(bin, 2.8, 1.4, 0.8, haz, bay, 0, B.floor + 0.7, B.z0 + 3.2);
  // steam pistons along the bed: little vent stacks every 6 m
  const vents: V[] = [];
  for (let z = B.podZ0 + 4; z < B.z1 - 3; z += 6) { for (const s of [-1, 1]) { cyl(bin, 0.12, 0.16, 0.5, gun, bay, s * 1.9, B.floor + 0.25, z, 6); vents.push(new V3(s * 1.9, B.floor + 0.55, z)); } }
  // the sled (carriage) with clamp arms; the pod lies in it, shield to the doors, hatch up
  const sled = new THREE.Group(); sled.position.set(0, 0, B.podZ0); bay.add(sled);
  tbox(bin, 2.2, 0.5, 4.2, olive, 1 / 2, sled, 0, B.floor + 0.95, 0);
  for (const s of [-1, 1]) for (const z of [-1.5, 1.5]) cyl(bin, 0.22, 0.22, 0.3, darkGun, sled, s * 0.75, B.floor + 0.72, z, 10).rotation.z = Math.PI / 2;
  box(bin, 1.8, 0.6, 3.4, gun, sled, 0, B.floor + 1.45, 0);
  const clamps: THREE.Group[] = [];
  for (const s of [-1, 1]) for (const z of [-1.0, 1.0]) {
    const c = new THREE.Group(); c.position.set(s * 1.0, B.floor + 1.55, z); sled.add(c);
    box(bin, 0.22, 1.5, 0.4, haz, c, 0, 0.75, 0);
    box(bin, 0.5, 0.22, 0.42, gun, c, -s * 0.18, 1.45, 0);
    c.userData.s = s; clamps.push(c);
  }
  const pod = makePod(bin);
  pod.root.position.set(0, B.podY, 1.7);
  pod.root.rotation.set(-Math.PI / 2, Math.PI, 0);
  sled.add(pod.root);
  // the gantry crane: rails on the ceiling, the bridge, a trolley with a cab, the hook block on cables
  for (const s of [-1, 1]) box(bin, 0.4, 0.5, BL - 2, steel, bay, s * 7.2, B.ceil - 1.0, zc);
  const bridge = new THREE.Group(); bridge.position.set(0, B.ceil - 1.6, 20); bay.add(bridge);
  box(bin, 15, 0.9, 0.8, lit(bin, 0xa88c3a), bridge, 0, 0, 0);
  const bh = stencil(bin, '10 TON', { size: 10, color: GM[1], wear: 0.05 }); decal(bin, bh, 1.6, bridge, new V3(0, 0, 0.41), new V3(0, 0, 1));
  const trolley = new THREE.Group(); bridge.add(trolley);
  box(bin, 1.6, 0.8, 1.4, gun, trolley, 0, -0.75, 0);
  box(bin, 1.0, 1.1, 1.0, lit(bin, 0x5a5e4a), trolley, 0.9, -1.0, 0.6);
  const cableM = lit(bin, 0x1a1a1a);
  const cables = [new THREE.Mesh(bin.g(new THREE.BoxGeometry(0.04, 1, 0.04)), cableM), new THREE.Mesh(bin.g(new THREE.BoxGeometry(0.04, 1, 0.04)), cableM)];
  cables.forEach((c, i) => { c.position.set(i ? 0.18 : -0.18, -1.15, 0); trolley.add(c); });
  const hook = new THREE.Group(); trolley.add(hook);
  box(bin, 0.55, 0.45, 0.35, lit(bin, 0xa88c3a), hook, 0, 0, 0);
  const hk = new THREE.Mesh(bin.g(new THREE.TorusGeometry(0.16, 0.05, 6, 12, Math.PI * 1.4)), steel); hk.position.set(0, -0.4, 0); hook.add(hk);
  // a sling cage for Unit 07: four straps to a ring
  const sling = new THREE.Group(); sling.position.set(0, -0.55, 0); hook.add(sling);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; beam(bin, new V3(0, 0, 0), new V3(Math.cos(a) * 0.45, -0.8, Math.sin(a) * 0.45), 0.025, lit(bin, 0x6a5a3a), sling); }
  const slingRing = new THREE.Mesh(bin.g(new THREE.TorusGeometry(0.46, 0.04, 5, 16)), lit(bin, 0x6a5a3a)); slingRing.rotation.x = Math.PI / 2; slingRing.position.y = -0.8; sling.add(slingRing);
  // red rotating beacons on the walls, catwalk level, and one over the doors
  const beacons: { g: THREE.Group; light: THREE.SpotLight; lamp: THREE.MeshBasicMaterial; beams: THREE.Mesh[] }[] = [];
  const bm2 = fxMat(bin, CONE_V, CONE_F, coneU(0xff3020, 0.0), 'add', { side: THREE.DoubleSide });
  const beaconAt = (p: V, out: V) => {
    const g = new THREE.Group(); g.position.copy(p); bay.add(g);
    box(bin, 0.5, 0.25, 0.5, darkGun, bay, p.x - out.x * 0.1, p.y - 0.3, p.z - out.z * 0.1);
    const lm = bin.m(gbuf(new THREE.MeshBasicMaterial({ color: 0x401010 }), 32));
    mesh(bin, new THREE.SphereGeometry(0.28, 10, 8), lm, g, 0, 0, 0, false);
    const spin = new THREE.Group(); g.add(spin);
    const light = new THREE.SpotLight(0xff2a14, 0, 26, 0.32, 0.5, 1.2); light.position.set(0, 0, 0); light.target.position.set(1, -0.25, 0);
    spin.add(light, light.target); intLights.push(light);
    const bms: THREE.Mesh[] = [];
    for (const d of [1, -1]) { const b = mesh(bin, new THREE.ConeGeometry(1.3, 7, 12, 1, true), bm2, spin, d * 3.6, -0.4, 0, false); b.rotation.z = d * Math.PI / 2; bms.push(b); }
    beacons.push({ g: spin, light, lamp: lm, beams: bms });
  };
  beaconAt(new V3(B.x1 - 0.6, B.cat + 1.9, 26), new V3(-1, 0, 0));
  beaconAt(new V3(B.x0 + 0.6, B.cat + 1.9, 34), new V3(1, 0, 0));
  beaconAt(new V3(B.x1 - 0.6, B.cat + 1.9, 50), new V3(-1, 0, 0));
  beaconAt(new V3(0, B.ceil - 0.6, B.z1 - 1.5), new V3(0, 0, -1));
  // the clamshell doors: an upper and a lower leaf, ribbed inside, hazard teeth where they meet
  const doors: THREE.Group[] = [];
  for (const s of [1, -1]) {
    const hinge = new THREE.Group(); hinge.position.set(0, s > 0 ? B.ceil : B.floor, B.z1 + 0.3); bay.add(hinge);
    const leaf = new THREE.Group(); leaf.position.set(0, -s * (BH / 4), 0); hinge.add(leaf);
    tbox(bin, BW + 0.6, BH / 2, 0.8, hullDark, 1 / 8, leaf, 0, 0, 0);
    tbox(bin, BW, BH / 2 - 0.6, 0.3, wall, 1 / 8, leaf, 0, 0, -0.55);
    for (let x = -7.5; x <= 7.5; x += 2.5) box(bin, 0.3, BH / 2 - 0.8, 0.5, gun, leaf, x, 0, -0.85);
    tbox(bin, BW, 0.5, 0.95, haz, 1, leaf, 0, -s * (BH / 4 - 0.25), 0);
    if (s > 0) decal(bin, stencil(bin, 'DANGER  VACUUM', { size: 10, color: 0xb8402e, wear: 0.08, bg: CR[3] }), 4, leaf, new V3(0, -0.6, -1.11), new V3(0, 0, -1), new V3(0, 1, 0));
    doors.push(hinge);
  }
  // work clutter on the floor: LIMBOPHOBIA's industrial props (atlas material, cached geometry: never freed here)
  const wm = worldMaterial({ noVis: true, noFog: true, noGrid: true });
  const prop = (key: string, x: number, y: number, z: number, rot = 0, s = 1) => {
    const d = objDef(key); if (!d) return null;
    const geo = objectGeometry(d, { uid: 0, key, x: 0, y: 0, rot: 0, state: {} } as any); if (!geo) return null;
    const m = new THREE.Mesh(geo, wm); m.position.set(x, y, z); m.rotation.y = rot; m.scale.setScalar(s); m.castShadow = true; m.receiveShadow = true; bay.add(m);
    return m;
  };
  const F = B.floor;
  prop('tool_chest', 7.6, F, 22, -Math.PI / 2); prop('workbench', 7.9, F, 30, -Math.PI / 2); prop('electrical_cabinet', 8.6, F, 41, -Math.PI / 2);
  prop('transformer', 7.8, F, 45, -Math.PI / 2); prop('barrel_oil', 7.6, F, 36); prop('barrel_oil', 8.2, F, 36.7, 1); prop('barrel_oil', 7.7, F, 37.5, 2);
  prop('pallet_boxes', -7.4, F, 28, 0.3); prop('crate_wood', -7.8, F, 32.5, 0.1); prop('crate_wood', -7.5, F, 33.6, 0.5); prop('generator', -7.2, F, 40, Math.PI / 2);
  prop('zw_cable_drum', -6.6, F, 44, 0.4); prop('zw_hard_case', -7.6, F, 23.4, 0.2); prop('zw_floodlight', -5.8, F, 21, 0.6); prop('zw_floodlight', 5.6, F, 54, -2.4);
  prop('fuse_panel_big', 8.75, F, 50, -Math.PI / 2); prop('shelf_metal', 8.4, F, 26, -Math.PI / 2); prop('hazard_barrier', 4.4, F, 58.8, 0); prop('hazard_barrier', -4.4, F, 58.8, 0);
  prop('pipes_cluster', -8.8, F + 1.2, 48, Math.PI / 2);
  // hanging work lamps under the girders (lamp heads glow, the hangar's key light is one shadowed spot)
  for (const z of [16, 28, 40, 52]) for (const x of [-4.5, 4.5]) {
    cyl(bin, 0.02, 0.02, 1.4, black, bay, x, B.ceil - 1.4, z, 4);
    mesh(bin, new THREE.ConeGeometry(0.55, 0.45, 12, 1, true), lit(bin, 0x3a4a3a, { side: THREE.DoubleSide }), bay, x, B.ceil - 2.2, z);
    mesh(bin, new THREE.CircleGeometry(0.4, 12), lamp(bin, 0xffe0a8, 2.2), bay, x, B.ceil - 2.42, z, false).rotation.x = Math.PI / 2;
  }
  const key = new THREE.SpotLight(0xffe2b0, 110, 60, 0.95, 0.5, 1.5); key.position.set(1.5, B.ceil - 1.2, 19); key.target.position.set(0, B.floor, 16);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.04; (key.shadow.camera as THREE.PerspectiveCamera).near = 1; (key.shadow.camera as THREE.PerspectiveCamera).far = 40;
  bay.add(key, key.target); intLights.push(key);
  const key2 = new THREE.SpotLight(0xffd8a0, 80, 50, 0.9, 0.6, 1.5); key2.position.set(0, B.ceil - 1.2, 46); key2.target.position.set(0, B.floor, 52); bay.add(key2, key2.target); intLights.push(key2);
  const fill = new THREE.HemisphereLight(0x8090a0, 0x2a2620, 1.35); bay.add(fill); intLights.push(fill);
  for (const z of [12, 34]) { const pl = new THREE.PointLight(0xffc890, 26, 24, 1.6); pl.position.set(0, -6, z); bay.add(pl); intLights.push(pl); }
  const doorLight = new THREE.DirectionalLight(0xa8c4e8, 0); doorLight.position.set(0, -6, 120); doorLight.target.position.set(0, -12, 20); bay.add(doorLight, doorLight.target); intLights.push(doorLight);

  // ---- the control gallery: a box on the port catwalk, slanted windows on the bay side, console, table
  const K = BOOTH, KW = K.x1 - K.x0, KL = K.z1 - K.z0, KH = K.ceil - K.floor;
  const booth = new THREE.Group(); bay.add(booth);
  tbox(bin, KW, 0.3, KL, lit(bin, 0x4a3a2c, { map: ptex(bin, treadPix(23, 32)) }), 0.5, booth, (K.x0 + K.x1) / 2, K.floor - 0.15, (K.z0 + K.z1) / 2);
  tbox(bin, KW + 0.4, 0.3, KL + 0.4, olive, 1 / 2, booth, (K.x0 + K.x1) / 2, K.ceil + 0.15, (K.z0 + K.z1) / 2);
  tbox(bin, KW + 0.4, 1.1, KL + 0.4, olive, 1 / 2, booth, (K.x0 + K.x1) / 2, K.floor - 0.55, (K.z0 + K.z1) / 2);
  tbox(bin, 0.3, KH, KL, wall, 1 / 8, booth, K.x0 + 0.15, (K.floor + K.ceil) / 2, (K.z0 + K.z1) / 2);
  tbox(bin, KW, KH, 0.3, wall, 1 / 8, booth, (K.x0 + K.x1) / 2, (K.floor + K.ceil) / 2, K.z0 + 0.15);
  // the bay side: a waist-high wall, mullions, a sill; the end toward the doors the same
  tbox(bin, 0.3, 1.0, KL, olive, 1 / 2, booth, K.x1, K.floor + 0.5, (K.z0 + K.z1) / 2);
  for (let z = K.z0 + 0.15; z <= K.z1; z += KL / 4) box(bin, 0.16, KH - 1, 0.16, darkGun, booth, K.x1, K.floor + 1 + (KH - 1) / 2, z);
  tbox(bin, KW, 1.0, 0.3, olive, 1 / 2, booth, (K.x0 + K.x1) / 2, K.floor + 0.5, K.z1);
  for (let x = K.x0 + 0.15; x <= K.x1; x += KW / 3) box(bin, 0.16, KH - 1, 0.16, darkGun, booth, x, K.floor + 1 + (KH - 1) / 2, K.z1);
  box(bin, 0.5, 0.08, KL, steel, booth, K.x1 - 0.1, K.floor + 1.02, (K.z0 + K.z1) / 2);
  mesh(bin, new THREE.PlaneGeometry(KW * 0.9, 0.5), winM, booth, (K.x0 + K.x1) / 2, K.ceil - 0.35, K.z0 + 0.31, false);
  // props in the gallery: radio desk, tape banks, a bank of monitors
  const bprop = (key: string, x: number, z: number, rot: number) => { const m = prop(key, x, K.floor, z, rot); if (m) { bay.remove(m); booth.add(m); } return m; };
  bprop('radio_console', -8.2, 9.4, Math.PI / 2); bprop('tape_mainframe', -8.3, 15.9, Math.PI / 2); bprop('crt_bank', -6.6, 8.5, 0);
  // the launch console at the end window: slanted desk, dials, the nixie pair, the lever, a guarded button
  const con = new THREE.Group(); con.position.set(-6.4, K.floor, 17.6); con.rotation.y = Math.PI; booth.add(con);
  tbox(bin, 2.6, 0.95, 0.8, olive, 1 / 2, con, 0, 0.475, 0);
  const desk = tbox(bin, 2.6, 0.08, 0.7, lit(bin, 0x3a3d40), 1, con, 0, 1.0, -0.05); desk.rotation.x = -0.35;
  const dialM = lamp(bin, 0xd8c8a0, 0.9);
  for (let i = 0; i < 5; i++) { const d = cyl(bin, 0.08, 0.08, 0.03, dialM, con, -1.0 + i * 0.32, 1.06, 0.02, 14); d.rotation.x = Math.PI / 2 - 0.35 + Math.PI / 2; }
  for (let i = 0; i < 8; i++) box(bin, 0.03, 0.06, 0.03, steel, con, -1.1 + i * 0.12, 1.08, -0.2);
  const nixT: THREE.CanvasTexture[] = [], nixM: THREE.MeshBasicMaterial[] = [];
  const nixG = new THREE.Group(); nixG.position.set(0.15, 1.12, -0.25); con.add(nixG);
  for (let i = 0; i < 2; i++) {
    const t = new THREE.CanvasTexture(nixieCanvas(' ')); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; bin.t(t); nixT.push(t);
    const m = bin.m(gbuf(new THREE.MeshBasicMaterial({ map: t }), 32)); nixM.push(m);
    cyl(bin, 0.075, 0.075, 0.26, lit(bin, 0x2a1a10, { phong: true, shininess: 100 }), nixG, -0.09 + i * 0.18, 0.13, 0, 12);
    mesh(bin, new THREE.PlaneGeometry(0.11, 0.18), m, nixG, -0.09 + i * 0.18, 0.13, 0.077, false);
    cyl(bin, 0.085, 0.09, 0.04, black, nixG, -0.09 + i * 0.18, 0.0, 0, 12);
  }
  let nixCur = '';
  const lever = new THREE.Group(); lever.position.set(0.95, 1.05, -0.05); con.add(lever);
  box(bin, 0.2, 0.08, 0.3, darkGun, con, 0.95, 1.03, -0.05);
  box(bin, 0.05, 0.6, 0.05, steel, lever, 0, 0.3, 0);
  mesh(bin, new THREE.SphereGeometry(0.07, 10, 8), lit(bin, 0x9a2a1e, { phong: true, shininess: 80 }), lever, 0, 0.62, 0);
  lever.rotation.x = 0.5;
  box(bin, 0.18, 0.12, 0.18, lit(bin, 0xa88c3a), con, -1.05, 1.1, -0.15);
  // the plotting table: a brass-railed wooden frame round a backlit glass
  const T = K.table;
  const table = new THREE.Group(); table.position.copy(T); booth.add(table);
  tbox(bin, 2.5, 0.08, 1.8, lit(bin, 0x5a3a24, { phong: true, shininess: 30 }), 1, table, 0, 0.92, 0);
  for (const [x, z] of [[-1.15, -0.8], [1.15, -0.8], [-1.15, 0.8], [1.15, 0.8]] as [number, number][]) box(bin, 0.1, 0.9, 0.1, lit(bin, 0x4a2e1c), table, x, 0.45, z);
  tbox(bin, 2.3, 0.6, 1.6, lit(bin, 0x3a2a1c), 1, table, 0, 0.55, 0);
  for (const s of [-1, 1]) { box(bin, 2.52, 0.035, 0.035, lit(bin, 0xa88a50, { phong: true, shininess: 80 }), table, 0, 0.98, s * 0.91); box(bin, 0.035, 0.035, 1.84, lit(bin, 0xa88a50, { phong: true, shininess: 80 }), table, s * 1.26, 0.98, 0); }
  // the plotting glass: a dim phosphor plot of the drop corridor glowing under the glass
  const plot = new Pix(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const d = Math.hypot(x - 32, y - 32); plot.set(x, y, x % 8 === 0 || y % 8 === 0 ? 0x24402e : Math.abs(d - 22) < 0.7 || Math.abs(d - 12) < 0.6 ? 0x3e6a4a : (Math.abs(x - 32) < 0.6 && y < 32) ? 0x5a8a64 : 0x101a14); }
  mesh(bin, new THREE.PlaneGeometry(1.5, 1.5), lamp(bin, 0xffffff, 0.9, ptex(bin, plot, false)), table, -0.3, 0.965, 0, false).rotation.x = -Math.PI / 2;
  // a ruler, a grease pencil, the coffee mug that left its ring on the chart
  box(bin, 0.06, 0.012, 1.2, lit(bin, 0xc8b88a), table, 0.75, 0.972, 0.1).rotation.y = 0.12;
  cyl(bin, 0.008, 0.008, 0.16, lit(bin, 0x9a2a1e), table, 0.9, 0.975, -0.45, 6).rotation.z = Math.PI / 2;
  cyl(bin, 0.045, 0.04, 0.1, lit(bin, 0xd8d0c0, { phong: true }), table, 0.98, 1.01, 0.62, 12);
  const lampOver = new THREE.SpotLight(0xffe6c0, 6, 6, 0.9, 0.5, 1.6); lampOver.position.set(T.x, K.ceil - 0.2, T.z); lampOver.target.position.set(T.x, T.y, T.z); booth.add(lampOver, lampOver.target); intLights.push(lampOver);
  mesh(bin, new THREE.ConeGeometry(0.35, 0.3, 14, 1, true), lit(bin, 0x3a4a3a, { side: THREE.DoubleSide }), booth, T.x, K.ceil - 0.25, T.z);

  // ---- people: the launch officer in the gallery, the deck crew round the sled
  const mkRig = (app: Appearance, outfit: Outfit, badge: string, bcol: [number, number, number]) => {
    const r = new Researcher(app, wm);
    (r as any).ggOverrides = { badge: { col: bcol, name: badge } };
    r.setOutfit(outfit); r.skin.castShadow = true; r.setExpression('neutral');
    keep.push({ rig: r });
    return r;
  };
  const people = opts.people !== false;
  const officerRig = !people ? null : mkRig(APP({ skin: 0xd9a47c, hair: 0x5a4636, hairStyle: 'short', facialHair: 'moustache', age: 0.55, jaw: 3, build: 'average', height: 1.03 }), {
    torso: { tex: 'c_uniform', color: 0x7a6c4e, sleeve: 'long' }, legs: { tex: 'c_slacks', color: 0x6a5e44 }, legsKind: 'pants',
    feet: { tex: 'c_shoes_dress', color: 0x1e1a16 }, head: { tex: 'c_hat_cap', color: 0x5a5440, hat: 'cap' },
  }, 'Cdr. Okafor', [120, 100, 60]);
  const boothGround = () => K.floor, deckGround = () => B.floor;
  const officer = officerRig ? new Actor(officerRig, boothGround, bay) : null;
  officer?.place(T.x + 0.2, T.z - 1.3, 0);
  const crew: Crew[] = [];
  const mkCrew = (role: string, app: Appearance, col: number, helm: number, name: string, home: V, post: V) => {
    if (!people) return;
    const r = mkRig(app, deckOutfit(col, helm), name, [90, 110, 60]);
    const a = new Actor(r, deckGround, bay); a.place(home.x, home.z, Math.atan2(-home.x, 0));
    crew.push({ a, role, home: home.clone(), post: post.clone() });
  };
  mkCrew('chief', APP({ skin: 0x8d5634, hair: 0x1c1612, hairStyle: 'buzz', build: 'broad', jaw: 3, nose: 3, age: 0.42 }), JERSEY.yellow, 0xa88c3a, 'CPO Hale', new V3(2.6, 0, 19.5), new V3(5.8, 0, 22));
  mkCrew('clamp', APP({ skin: 0xe0b48c, hair: 0x8a5a2a, hairStyle: 'short', freckles: 0.2, age: 0.2, face: 3 }), JERSEY.red, 0x8a3a2e, 'AN Dutch', new V3(-1.8, 0, 14.2), new V3(-6.2, 0, 18));
  mkCrew('clamp', APP({ skin: 0xc8946a, hair: 0x2a1c12, hairStyle: 'short', facialHair: 'stubble', age: 0.28, face: 2 }), JERSEY.red, 0x8a3a2e, 'AN Ruiz', new V3(1.8, 0, 16.4), new V3(6.2, 0, 26));
  mkCrew('console', APP({ skin: 0x6e4428, hair: 0x14100c, hairStyle: 'buzz', age: 0.35, face: 4, build: 'slim' }), JERSEY.blue, 0x3e566e, 'PO Banks', new V3(7.4, 0, 33.5), new V3(7.4, 0, 33.5));
  mkCrew('green', APP({ skin: 0xe8c09a, hair: 0xb89a6a, hairStyle: 'short', age: 0.18, face: 0 }), JERSEY.green, 0x4e6444, 'AN Moss', new V3(-5.6, 0, 26), new V3(-6.4, 0, 30));

  // ---- the light rigs
  let view: 'ext' | 'int' | 'both' = 'ext';
  const setView = (v: 'ext' | 'int' | 'both') => {
    view = v;
    for (const l of extLights) l.visible = v !== 'int';
    for (const l of intLights) l.visible = v !== 'ext';
    sun.castShadow = v !== 'int'; key.castShadow = v === 'int';
    for (const c of [...crew.map((c) => c.a), ...(officer ? [officer] : [])]) c.rig.root.visible = v !== 'ext' || doorU > 0.3;
  };
  let beaconOn = false, doorU = 0;
  const w = (x: number, y: number, z: number, out = new V3()) => root.localToWorld(out.set(x, y, z));
  const ship: Ship = {
    root, sun, pod, sled, hook, crew, officer, doorLight,
    setSled(z) { sled.position.z = z; },
    setClamps(u) { for (const c of clamps) c.rotation.z = (c.userData.s as number) * (1 - sm(0, 1, u)) * 0.9; },
    setCrane(z, x, drop) {
      bridge.position.z = z; trolley.position.x = x;
      hook.position.y = -1.4 - drop;
      for (const c of cables) { c.scale.y = drop + 0.3; c.position.y = -1.15 - (drop + 0.3) / 2; }
    },
    setDoors(u) { doorU = u; const e = sm(0, 1, u); doors[0].rotation.x = -e * 1.45; doors[1].rotation.x = e * 1.45; doorLight.intensity = e * 2.6; },
    setBeacons(on) { beaconOn = on; for (const b of beacons) { b.light.intensity = on ? 28 : 0; b.lamp.color.set(on ? 0xff3a20 : 0x401010).multiplyScalar(on ? 2.4 : 1); } (bm2 as THREE.ShaderMaterial).uniforms.uK.value = on ? 0.5 : 0; },
    setLever(u) { lever.rotation.x = 0.5 - sm(0, 1, u) * 1.0; },
    setNixies(s) {
      if (s === nixCur) return; nixCur = s;
      const t = s.padStart(2, ' ').slice(-2);
      for (let i = 0; i < 2; i++) { const img = nixieCanvas(t[i]); (nixT[i].image as HTMLCanvasElement).getContext('2d')!.drawImage(img, 0, 0); nixT[i].needsUpdate = true; }
    },
    setView,
    update(dt, t) {
      dish.rotation.y = t * 0.6;
      strobeM.color.setScalar(Math.sin(t * 5.3) > 0.93 ? 3 : 0.06);
      const blink = Math.sin(t * 2.4) > 0.2 ? 2.2 : 0.15;
      (navR.material as THREE.MeshBasicMaterial).color.setRGB(blink, 0.12 * blink, 0.08 * blink);
      (navG.material as THREE.MeshBasicMaterial).color.setRGB(0.25 * blink, blink, 0.5 * blink);
      nozU.uT.value = t;
      // the keel lights run toward the bow, again and again
      const head = ((t * 14) % (chase.length + 8));
      chase.forEach((m, i) => { const d = head - i; const k = d >= 0 && d < 3 ? 1 - d / 3 : 0; m.color.setRGB(0.25 + k * 2.6, 0.08 + k * 1.2, 0.05 + k * 0.5); });
      if (beaconOn) for (const [i, b] of beacons.entries()) b.g.rotation.y = t * 4.2 + i * 1.3;
      pod.update(dt, t);
      if (view !== 'ext' || doorU > 0.3) { officer?.update(dt); for (const c of crew) c.a.update(dt); }
    },
    w,
    dispose() { for (const k of keep) { k.rig.root.removeFromParent(); k.rig.dispose(); } root.removeFromParent(); },
  };
  void floods; void vents;
  setView('ext');
  ship.setNixies('  ');
  ship.setCrane(20, 0, 2);
  ship.setClamps(0);
  return ship;
}
/** the steam vents along the rail bed (ship-local), for the launch puffs */
export function railVents(): V[] {
  const out: V[] = [];
  for (let z = BAY.podZ0 + 4; z < BAY.z1 - 3; z += 6) for (const s of [-1, 1]) out.push(new V3(s * 1.9, BAY.floor + 0.55, z));
  return out;
}

/** The carrier on its own, for any screen (the main menu's centrepiece): it owns everything it creates and frees it
 *  on dispose. people: build the launch officer and deck crew (off by default: they are only seen inside the bay).
 *  Point the light with carrier.ship.sun.position (ship-local direction toward the sun x 220). */
export interface Carrier { group: THREE.Group; ship: Ship; update(dt: number): void; dispose(): void }
export function buildCarrier(opts: { people?: boolean; view?: 'ext' | 'int' | 'both' } = {}): Carrier {
  const bin = new Bin(), group = new THREE.Group(); group.name = 'uss-vanguard-carrier';
  const ship = buildShip(bin, group, { people: opts.people ?? false });
  ship.setView(opts.view ?? 'ext');
  let t = 0;
  return {
    group, ship,
    update(dt) { t += dt; ship.update(dt, t); },
    dispose() { ship.dispose(); bin.dispose(); group.removeFromParent(); },
  };
}
