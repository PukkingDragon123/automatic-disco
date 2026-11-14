// U.S.S. VANGUARD's hull, hero quality (the main menu shows it up close; the deployment flies under it).
// Silhouette, bow to stern: an armoured beak over the launch-bay mouth; the forward hull with stacked hangar decks
// (striped hangar doors, railings, a deck crane, numbered hatches) and landing craft racked in cradles down its
// flanks; a hammerhead bridge tower (lit window bands, wing sponsons with floodlights) under a lattice antenna mast
// with a turning search dish, a radar bar and whips; then a long open truss spine carrying a pressure tube, cream
// propellant spheres in bands and four radiator fins; the reactor drum, sooted and scorched, with the main bell and
// verniers; and two outrigger engine nacelles on pylons. Plating is hand-painted pixel texture from the master
// palette (slate and steel plates, olive decks, cream tanks, stamp-red and brass accents, rivets, welds, grime and
// soot), stencilled name, hull number and the star-and-bar. Lit portholes, sequenced keel lights, nav lamps and a
// strobe, engines idling with a shimmering plume, and little maintenance drones going about their rounds.
// Static parts are merged into one mesh per material at the end. Ship-local frame: +z bow, +y dorsal, metres.
import * as THREE from 'three';
import { Bin, lit, lamp, mesh, box, cyl, tbox, beam, decal, loft, ptex, hullPix, hazardPix, stencil, insignia, windowPix, fxMat, mergeStatic, V3, TAU, hash, type V } from './deployKit';
import { RAMPS } from '../art/palette';
import { Pix, dv } from './machine';
import { gbuf } from '../gfx/gbuf';

/** the master palette's slate and steel as a 10-step plate ramp; olive and straw for the decks; bone for tanks */
export const HULL_RAMP = [...RAMPS.slate, RAMPS.steel[4], RAMPS.steel[5], RAMPS.steel[6], RAMPS.paper[2]];
export const OLIVE_RAMP = [...RAMPS.olive, RAMPS.straw[2], RAMPS.straw[3], RAMPS.straw[4], RAMPS.straw[5]];
const BONE_RAMP = [...RAMPS.bone, RAMPS.paper[3], RAMPS.paper[4], RAMPS.paper[5], RAMPS.snow[5]];

const CONE_V = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const BEAM_F = `uniform vec3 uCol; uniform float uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ float a = pow(vUv.y, 1.7) * pow(abs(dot(normalize(vN), normalize(vV))), 2.2) * uK; a = floor(a * 10.0) / 10.0; gl_FragColor = vec4(uCol * a, 0.0); gNormal = vec4(0.0); }`;
const NOZ_F = `uniform vec3 uCol; uniform float uK, uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ float a = pow(1.0 - vUv.y, 2.0) * uK * (0.85 + 0.15 * sin(uT * 31.0 + vUv.x * 40.0)); gl_FragColor = vec4(uCol * a, 0.0); gNormal = vec4(0.0); }`;
/** the exhaust plume: a blue-white core out of the throat going amber, its edges wavering in the heat */
const PLUME_V = `uniform float uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vec3 p = position; float k = 1.0 - uv.y;
  p.x += sin(uT * 13.0 + p.y * 0.9) * 0.18 * k * length(p.xz); p.z += cos(uT * 11.0 + p.y * 1.1) * 0.18 * k * length(p.xz);
  vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
const PLUME_F = `uniform float uT, uK; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
void main(){
  float y = vUv.y; // 1 at the throat, 0 at the tail
  float n = vn(vec2(vUv.x * 14.0, y * 9.0 + uT * 7.0)) * 0.6 + vn(vec2(vUv.x * 31.0, y * 21.0 + uT * 13.0)) * 0.4;
  float rim = abs(dot(normalize(vN), normalize(vV)));
  float a = pow(y, 2.4) * smoothstep(0.35, 0.8, n + y * 0.4) * pow(rim, 2.0) * uK;
  vec3 core = vec3(1.1, 1.3, 1.6), hot = vec3(1.6, 0.8, 0.28);
  vec3 c = mix(hot, core, smoothstep(0.55, 0.95, y) * rim);
  a = floor(a * 7.0) / 7.0;
  gl_FragColor = vec4(c * a, 0.0);
  gNormal = vec4(0.0);
}`;

/** soot over the plates: heavier toward one edge, streaked, burnt through to bare steel in places */
function scorchPix() {
  const p = hullPix(HULL_RAMP, 13, 256, 256, 48);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const streak = hash(x >> 2, 0, 7) * 0.5 + hash(x, y >> 3, 9) * 0.25;
    const k = Math.max(0.32, 1 - (y / 256) * 0.75 - streak * 0.35);
    p.shade(x, y, k);
  }
  return p;
}
function radPix() {
  const p = new Pix(32, 64), R = RAMPS.slate;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) p.set(x, y, dv(R, (x % 4 === 0 ? 1 : 2.6) + (hash(x, y, 4) - 0.5) * 0.5 + (y % 16 === 0 ? -1 : 0), x, y));
  for (let y = 0; y < 64; y += 16) for (let x = 1; x < 32; x += 4) p.set(x, y + 1, RAMPS.brass[3]);
  return p;
}
function portPix(lit: boolean) {
  const p = new Pix(16, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 3.5);
    p.set(x, y, d < 3.2 ? (d > 2.3 ? RAMPS.brass[3] : lit ? (y < 3 ? RAMPS.glowAmber[4] : RAMPS.glowAmber[3]) : RAMPS.ink[1]) : dv(HULL_RAMP, 4 + hash(x, y, 31) * 0.5, x, y));
  }
  return p;
}

export interface Hull {
  sun: THREE.DirectionalLight;
  /** the exterior lights (the ship's view switch turns them on and off) */
  lights: THREE.Light[];
  update(t: number, dt: number): void;
}

export function buildHull(bin: Bin, root: THREE.Group, ext: THREE.Group): Hull {
  const lights: THREE.Light[] = [];
  const keep = new Set<THREE.Object3D>();
  // ---- materials (shared, so the merge collapses the hull to a few dozen draw calls)
  const hull = lit(bin, 0xffffff, { map: ptex(bin, hullPix(HULL_RAMP, 3, 256, 256, 48)) });
  const hullB = lit(bin, 0xd0d4d4, { map: ptex(bin, hullPix(HULL_RAMP, 8, 256, 256, 48)) });
  const scorch = lit(bin, 0xffffff, { map: ptex(bin, scorchPix()) });
  const deck = lit(bin, 0xffffff, { map: ptex(bin, hullPix(OLIVE_RAMP, 5, 128, 128, 32)) });
  const tankM = lit(bin, 0xffffff, { map: ptex(bin, hullPix(BONE_RAMP, 21, 128, 64, 32)) });
  const radM = lit(bin, 0xffffff, { map: ptex(bin, radPix()) });
  const steel = lit(bin, RAMPS.steel[5], { phong: true, shininess: 50 });
  const gun = lit(bin, RAMPS.steel[3]);
  const dark = lit(bin, RAMPS.steel[1]);
  const red = lit(bin, RAMPS.stampRed[3]);
  const brass = lit(bin, RAMPS.brass[4], { phong: true, shininess: 60 });
  const olive = lit(bin, RAMPS.olive[3]);
  const haz = lit(bin, 0xffffff, { map: ptex(bin, hazardPix(32, 8, 8)) });
  const bellM = lit(bin, RAMPS.steel[2], { side: THREE.DoubleSide, phong: true, shininess: 30 });
  const winT = ptex(bin, windowPix(8, 2)); winT.wrapS = THREE.RepeatWrapping;
  const winM = lit(bin, 0xffffff, { map: winT, emissiveMap: winT, emissive: RAMPS.glowAmber[3] });
  const portT = ptex(bin, portPix(true));
  const portM = lit(bin, 0xffffff, { map: portT, emissiveMap: portT, emissive: RAMPS.glowAmber[2], polyOffset: 1 });
  const portD = lit(bin, 0xffffff, { map: ptex(bin, portPix(false)), polyOffset: 1 });
  const beamU = { uCol: { value: new THREE.Color(0xffe0b0) }, uK: { value: 0.2 } };
  const beamM = fxMat(bin, CONE_V, BEAM_F, beamU, 'add', { side: THREE.DoubleSide });
  const nozU = { uCol: { value: new THREE.Color(1.6, 0.62, 0.2) }, uK: { value: 0.7 }, uT: { value: 0 } };
  const nozM = fxMat(bin, CONE_V, NOZ_F, nozU, 'add', { side: THREE.BackSide });
  const plumeU = { uT: { value: 0 }, uK: { value: 0.5 } };
  const plumeM = fxMat(bin, PLUME_V, PLUME_F, plumeU, 'add', { side: THREE.DoubleSide });
  const nameT = stencil(bin, 'U.S.S. VANGUARD', { size: 20, color: RAMPS.paper[5], wear: 0.06 });
  const numT = stencil(bin, 'CVS-01', { size: 30, color: RAMPS.paper[5], wear: 0.1, bridges: true });
  const ins = insignia(bin);

  // ---- small builders
  const strip = (m: THREE.Material, x: number, y: number, z0: number, z1: number, h: number, side: number, rep: number) => {
    const len = z1 - z0, pl = mesh(bin, new THREE.PlaneGeometry(len, h), m, ext, x, y, (z0 + z1) / 2, false);
    pl.rotation.y = side * Math.PI / 2;
    const u = pl.geometry.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * (len / rep));
    return pl;
  };
  /** a railing along a deck edge: posts every 2.5 m, a top and a mid rail */
  const railing = (a: V, b: V) => {
    const d = b.clone().sub(a), n = Math.max(1, Math.round(d.length() / 2.5));
    for (let i = 0; i <= n; i++) { const p = a.clone().addScaledVector(d, i / n); box(bin, 0.1, 1.1, 0.1, steel, ext, p.x, p.y + 0.55, p.z); }
    beam(bin, a.clone().setY(a.y + 1.1), b.clone().setY(b.y + 1.1), 0.05, steel, ext); beam(bin, a.clone().setY(a.y + 0.6), b.clone().setY(b.y + 0.6), 0.04, steel, ext);
  };
  /** a ladder up a face (x/z normal), from y0 to y1 */
  const ladder = (x: number, z: number, y0: number, y1: number, along: 'x' | 'z') => {
    for (const s of [-0.3, 0.3]) beam(bin, new V3(x + (along === 'x' ? s : 0), y0, z + (along === 'z' ? s : 0)), new V3(x + (along === 'x' ? s : 0), y1, z + (along === 'z' ? s : 0)), 0.04, steel, ext);
    for (let y = y0 + 0.3; y < y1; y += 0.42) box(bin, along === 'x' ? 0.6 : 0.05, 0.05, along === 'z' ? 0.6 : 0.05, steel, ext, x, y, z);
  };
  /** louvred vents in a bank */
  const vents = (x: number, y: number, z: number, n: number, along: 'x' | 'z', out: 'x' | 'y' | 'z') => {
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * 1.6;
      const g = box(bin, out === 'x' ? 0.4 : along === 'x' ? 1.3 : 0.9, out === 'y' ? 0.4 : 0.9, out === 'z' ? 0.4 : along === 'z' ? 1.3 : 0.9, dark, ext, x + (along === 'x' ? o : 0), y, z + (along === 'z' ? o : 0));
      for (let k = -1; k <= 1; k++) box(bin, out === 'x' ? 0.1 : along === 'x' ? 1.2 : 0.8, 0.08, out === 'z' ? 0.1 : along === 'z' ? 1.2 : 0.8, gun, ext, g.position.x + (out === 'x' ? Math.sign(x) * 0.22 : 0), y + k * 0.25 + (out === 'y' ? 0.22 : 0), g.position.z + (out === 'z' ? Math.sign(z) * 0.22 : 0));
    }
  };
  const floods: THREE.Object3D[] = [];
  const flood = (p: V, aim: V, len: number) => {
    const g = new THREE.Group(); g.position.copy(p); ext.add(g); g.lookAt(aim);
    box(bin, 1.1, 0.8, 0.9, dark, g, 0, 0, 0);
    mesh(bin, new THREE.CircleGeometry(0.36, 12), lamp(bin, 0xffe8c0, 2.6), g, 0, 0, 0.46, false);
    const bm = mesh(bin, new THREE.ConeGeometry(len * 0.3, len * 1.4, 24, 1, true), beamM, g, 0, 0, len * 0.7 + 0.5, false); bm.rotation.x = -Math.PI / 2;
    floods.push(g);
  };

  // ================================================================ forward hull (holds Launch Bay 2)
  mesh(bin, loft([[-46, 16, 10, -8.5, 0.5], [-40, 18, 10, -8.5, 0.5], [44, 18, 10, -8.5, 0.5], [58, 15.5, 9.5, -8.8, 0.6], [64, 14.2, 9.2, -8.8, 0.62]], 1 / 32, false), hullB, ext);
  mesh(bin, loft([[-46.2, 16, 10, -8.5, 0.5], [-46, 16, 10, -8.5, 0.5]], 1 / 32), hullB, ext);
  mesh(bin, loft([[-48, 12, 7, 7.5, 0.4], [34, 13.5, 7, 7.5, 0.4], [62, 10, 5.5, 6.5, 0.6], [78, 6, 3.6, 5, 0.7], [92, 2.2, 1.6, 3.5, 0.8]], 1 / 32), hull, ext);
  // armour belts down the flanks, and their rivet seams
  for (const s of [-1, 1]) { tbox(bin, 1.2, 6, 92, hull, 1 / 8, ext, s * 18.5, -9.5, 2); box(bin, 1.3, 0.25, 92, gun, ext, s * 18.55, -6.4, 2); box(bin, 1.3, 0.25, 92, gun, ext, s * 18.55, -12.6, 2); }
  // the bay mouth frame and its hazard border
  const mz = 63.9;
  tbox(bin, 10.2, 18.4, 1.2, hullB, 1 / 8, ext, -14.2, -8.8, mz); tbox(bin, 10.2, 18.4, 1.2, hullB, 1 / 8, ext, 14.2, -8.8, mz);
  tbox(bin, 18.2, 3.4, 1.2, hullB, 1 / 8, ext, 0, -0.9, mz); tbox(bin, 18.2, 3.8, 1.2, hullB, 1 / 8, ext, 0, -16.6, mz);
  for (const [w, h, x, y] of [[19.6, 0.7, 0, -2.25], [19.6, 0.7, 0, -14.75], [0.7, 12.5, -9.45, -8.5], [0.7, 12.5, 9.45, -8.5]] as [number, number, number, number][]) tbox(bin, w, h, 0.3, haz, 1, ext, x, y, mz + 0.62).castShadow = false;
  decal(bin, stencil(bin, 'DANGER - LAUNCH BAY - KEEP CLEAR', { size: 10, color: RAMPS.stampRed[3], wear: 0.05 }), 16, ext, new V3(0, -0.5, mz + 0.62), new V3(0, 0, 1));
  // the beak's searchlight
  const sl = new THREE.Group(); sl.position.set(0, 3.9, 91.4); ext.add(sl);
  cyl(bin, 0.7, 0.9, 1.2, dark, sl, 0, 0, 0, 12).rotation.x = Math.PI / 2;
  mesh(bin, new THREE.CircleGeometry(0.62, 14), lamp(bin, 0xfff0d0, 3), sl, 0, 0, 0.61, false);
  mesh(bin, new THREE.ConeGeometry(9, 70, 24, 1, true), fxMat(bin, CONE_V, BEAM_F, { uCol: { value: new THREE.Color(0xfff0d0) }, uK: { value: 0.14 } }, 'add', { side: THREE.DoubleSide }), sl, 0, 0, 35.6, false).rotation.x = -Math.PI / 2;
  // portholes in rows, conduits with flanges, RCS quads
  for (const s of [-1, 1]) {
    strip(portM, s * 13.53, 10.6, -46, 28, 0.9, s, 1.8); strip(portD, s * 13.53, 4.2, -40, 20, 0.9, s, 1.8); strip(portM, s * 13.53, 7.4, -30, 8, 0.9, s, 1.8);
    strip(portM, s * 19.12, -7.8, -36, 40, 0.9, s, 1.8);
    for (const [y, r] of [[-1.2, 0.42], [-2.4, 0.28], [-15, 0.36]] as [number, number][]) {
      cyl(bin, r, r, 104, s < 0 ? lit(bin, RAMPS.rust[3]) : lit(bin, RAMPS.sage[3]), ext, s * 18.35, y, 5, 8).rotation.x = Math.PI / 2;
      for (let z = -44; z <= 56; z += 8) cyl(bin, r * 1.5, r * 1.5, 0.3, gun, ext, s * 18.35, y, z, 8).rotation.x = Math.PI / 2;
    }
    vents(s * 19.15, -9.5, -20, 4, 'z', 'x');
  }
  for (const [x, y, z] of [[-13.6, 12, 58], [13.6, 12, 58], [-12.6, 12, -46], [12.6, 12, -46], [-18.2, -16, 56], [18.2, -16, 56], [-16.2, -16, -44], [16.2, -16, -44]] as [number, number, number][]) {
    const q = box(bin, 1.6, 1.6, 1.6, gun, ext, x, y, z);
    for (const [dx, dy, dz] of [[Math.sign(x), 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, z > 0 ? 1 : -1]] as [number, number, number][]) { const n = cyl(bin, 0.18, 0.32, 0.5, dark, q, dx * 0.95, dy * 0.95, dz * 0.95, 8); n.quaternion.setFromUnitVectors(new V3(0, 1, 0), new V3(dx, dy, dz)); }
  }
  // the belly: keel spine and ribs, hatches, stencils, sensor blister, the sequenced keel lights
  tbox(bin, 4.4, 1.6, 108, hullB, 1 / 8, ext, 0, -19.2, 6);
  for (let z = -42; z <= 58; z += 6) box(bin, 7, 0.9, 0.7, gun, ext, 0, -18.8, z);
  for (const s of [-1, 1]) for (const z of [-26, 6, 34]) {
    tbox(bin, 7.2, 0.25, 9.2, dark, 1, ext, s * 9.5, -18.55, z);
    for (const [w, d, dx, dz] of [[7.6, 0.4, 0, 4.8], [7.6, 0.4, 0, -4.8], [0.4, 9.6, 3.8, 0], [0.4, 9.6, -3.8, 0]] as [number, number, number, number][]) box(bin, w, 0.3, d, haz, ext, s * 9.5 + dx, -18.6, z + dz).castShadow = false;
  }
  decal(bin, stencil(bin, 'U.S.P.C.', { size: 30, color: RAMPS.paper[5], wear: 0.1, bridges: true }), 22, ext, new V3(0, -18.52, -12), new V3(0, -1, 0), new V3(0, 0, 1));
  for (const s of [-1, 1]) decal(bin, ins, 16, ext, new V3(s * 9.5, -18.52, 20), new V3(0, -1, 0), new V3(0, 0, 1));
  mesh(bin, new THREE.SphereGeometry(2.4, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2), lit(bin, RAMPS.steel[2], { phong: true, shininess: 70 }), ext, 0, -20, -36);
  const chase: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 18; i++) { const m = bin.m(gbuf(new THREE.MeshBasicMaterial({ color: 0x401a10 }), 32)); const c = mesh(bin, new THREE.SphereGeometry(0.32, 6, 4), m, ext, 0, -20.05, -44 + i * 6, false); keep.add(c); chase.push(m); }
  // stencils on the flanks: the name, the hull number on the beak, the Corps line, the insignia
  for (const s of [-1, 1]) {
    decal(bin, nameT, 30, ext, new V3(s * 19.12, -4.0, 22), new V3(s, 0, 0));
    decal(bin, numT, 13, ext, new V3(s * 11.7, 6.2, 70), new V3(s, 0, 0.18).normalize());
    decal(bin, stencil(bin, 'UNITED STATES PLANETARY CORPS', { size: 10, color: RAMPS.paper[4], wear: 0.05 }), 40, ext, new V3(s * 13.52, 12.6, -12), new V3(s, 0, 0));
    decal(bin, ins, 12, ext, new V3(s * 19.12, -11.0, -30), new V3(s, 0, 0));
  }

  // ================================================================ stacked hangar decks (dorsal, forward)
  tbox(bin, 26, 5, 46, deck, 1 / 8, ext, 0, 17, 36);
  tbox(bin, 18, 4, 28, deck, 1 / 8, ext, 0, 21.5, 38);
  tbox(bin, 12, 2.4, 14, hull, 1 / 8, ext, 0, 24.7, 40);
  for (const s of [-1, 1]) {
    for (const z of [24, 46]) {
      tbox(bin, 0.3, 3.6, 12, dark, 1, ext, s * 13.08, 16.8, z);
      for (let k = -5; k <= 5; k += 1.25) box(bin, 0.35, 3.4, 0.12, gun, ext, s * 13.12, 16.8, z + k);
      for (const [h, d, dy, dz] of [[0.4, 12.8, 2.0, 0], [0.4, 12.8, -2.0, 0], [4.4, 0.4, 0, 6.2], [4.4, 0.4, 0, -6.2]] as [number, number, number, number][]) box(bin, 0.36, h, d, haz, ext, s * 13.1, 16.8 + dy, z + dz).castShadow = false;
      decal(bin, stencil(bin, String(z === 24 ? (s < 0 ? 3 : 4) : (s < 0 ? 5 : 6)), { size: 30, color: RAMPS.paper[4], wear: 0.15, bridges: true }), 2.2, ext, new V3(s * 13.3, 16.8, z + 7.4), new V3(s, 0, 0));
    }
    strip(winM, s * 9.02, 22.2, 26, 50, 1.0, s, 6);
    railing(new V3(s * 12.6, 19.5, 14), new V3(s * 12.6, 19.5, 58));
    railing(new V3(s * 8.6, 23.5, 25), new V3(s * 8.6, 23.5, 51));
    ladder(s * 9.15, 26, 19.5, 23.5, 'z');
    for (let z = 16; z <= 56; z += 8) mesh(bin, new THREE.SphereGeometry(0.2, 6, 4), lamp(bin, s < 0 ? RAMPS.coral[5] : RAMPS.glowTeal[3], 1.4), ext, s * 12.4, 19.6, z, false);
  }
  tbox(bin, 26.4, 0.3, 0.6, haz, 1, ext, 0, 19.5, 58.9);
  decal(bin, stencil(bin, '2', { size: 30, color: RAMPS.paper[4], wear: 0.2, bridges: true }), 5, ext, new V3(-6, 19.52, 50), new V3(0, 1, 0), new V3(0, 0, 1));
  decal(bin, stencil(bin, '1', { size: 30, color: RAMPS.paper[4], wear: 0.2, bridges: true }), 5, ext, new V3(6, 19.52, 50), new V3(0, 1, 0), new V3(0, 0, 1));
  // the deck crane on the upper tier
  const crane = new THREE.Group(); crane.position.set(5, 23.5, 30); ext.add(crane);
  cyl(bin, 1.2, 1.5, 1.6, olive, crane, 0, 0.8, 0, 12); box(bin, 2, 2, 2.6, lit(bin, RAMPS.ochre[4]), crane, 0, 2.4, 0);
  beam(bin, new V3(0, 3, 0), new V3(-2, 13, 9), 0.35, lit(bin, RAMPS.ochre[4]), crane);
  beam(bin, new V3(-2, 13, 9), new V3(-2, 7, 9.2), 0.04, dark, crane);
  box(bin, 0.8, 0.6, 0.8, dark, crane, -2, 6.8, 9.2);

  // ================================================================ landing craft in cradles down the flanks
  for (const s of [-1, 1]) for (const z of [4, 16, 28]) {
    const g = new THREE.Group(); g.position.set(s * 21.6, -3.2, z); ext.add(g);
    for (const dz of [-1.6, 1.6]) { beam(bin, new V3(-s * 2.3, 0.6, dz), new V3(0, -1.2, dz), 0.18, gun, g); beam(bin, new V3(-s * 2.3, -2.2, dz), new V3(0, -1.2, dz), 0.18, gun, g); }
    const body = cyl(bin, 1.45, 1.45, 5.2, olive, g, 0, 0, 0, 14); body.rotation.x = Math.PI / 2;
    const nose = cyl(bin, 0.2, 1.45, 2.4, olive, g, 0, 0, 3.8, 14); nose.rotation.x = Math.PI / 2;
    cyl(bin, 1.5, 1.5, 0.5, red, g, 0, 0, 1.6, 14).rotation.x = Math.PI / 2;
    cyl(bin, 0.9, 1.3, 0.8, dark, g, 0, 0, -3.0, 12).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4; const f = box(bin, 0.12, 1.4, 1.6, olive, g, Math.cos(a) * 1.9, Math.sin(a) * 1.9, -2.2); f.rotation.z = a - Math.PI / 2; }
    mesh(bin, new THREE.CircleGeometry(0.3, 10), lamp(bin, RAMPS.glowAmber[3], 1.2), g, s * 1.46, 0.4, 0.8, false).rotation.y = s * Math.PI / 2;
  }

  // ================================================================ the hammerhead bridge tower and its antenna mast
  const TZ = -16;
  tbox(bin, 8, 22, 11, hull, 1 / 8, ext, 0, 25.5, TZ);
  for (let y = 18; y < 35; y += 4) box(bin, 8.4, 0.3, 11.4, gun, ext, 0, y, TZ);
  ladder(0, TZ + 5.65, 14.5, 36.5, 'x');
  for (const s of [-1, 1]) strip(portM, s * 4.02, 30, TZ - 4, TZ + 4, 0.9, s, 1.8);
  tbox(bin, 46, 6.2, 11, hull, 1 / 8, ext, 0, 39.6, TZ);
  tbox(bin, 46.4, 0.5, 11.4, dark, 1, ext, 0, 42.9, TZ);
  tbox(bin, 46.4, 0.4, 11.4, gun, 1, ext, 0, 36.6, TZ);
  for (const sz of [-1, 1]) { const w = mesh(bin, new THREE.PlaneGeometry(42, 1.8), winM, ext, 0, 40.3, TZ + sz * 5.53, false); w.rotation.y = sz > 0 ? 0 : Math.PI; const u = w.geometry.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < u.count; i++) u.setX(i, u.getX(i) * 7); }
  for (const s of [-1, 1]) {
    tbox(bin, 4.4, 4.4, 13, hullB, 1 / 8, ext, s * 25.2, 39, TZ);
    beam(bin, new V3(s * 3.8, 30, TZ), new V3(s * 20, 36.6, TZ), 0.5, gun, ext);
    flood(new V3(s * 25.2, 36.4, TZ + 6.6), new V3(s * 14, 19, 18), 24);
    decal(bin, stencil(bin, '01', { size: 30, color: RAMPS.paper[5], wear: 0.1, bridges: true }), 3.2, ext, new V3(s * 27.42, 39, TZ), new V3(s, 0, 0));
    railing(new V3(s * 22.5, 43.1, TZ - 5.2), new V3(s * 22.5, 43.1, TZ + 5.2));
  }
  railing(new V3(-22.5, 43.1, TZ + 5.4), new V3(22.5, 43.1, TZ + 5.4));
  // the lattice mast with its search dish, two fixed dishes, a radar bar and whips
  const legs = [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]];
  for (const [x, z] of legs) beam(bin, new V3(x * 1.6, 43, TZ + z * 1.6), new V3(x * 0.5, 68, TZ + z * 0.5), 0.14, steel, ext);
  for (let y = 45; y < 67; y += 3.2) {
    const k = 1.6 - ((y - 43) / 25) * 1.1;
    for (let i = 0; i < 4; i++) { const [x0, z0] = legs[i], [x1, z1] = legs[(i + 1) % 4]; beam(bin, new V3(x0 * k, y, TZ + z0 * k), new V3(x1 * (k - 0.07), y + 3.2, TZ + z1 * (k - 0.07)), 0.06, steel, ext); }
  }
  const dish = new THREE.Group(); dish.position.set(0, 52, TZ); ext.add(dish); keep.add(dish);
  const dg = new THREE.SphereGeometry(4.4, 18, 6, 0, TAU, 0, 0.9); dg.translate(0, -4.4 * Math.cos(0.9) - 0.2, 0);
  mesh(bin, dg, lit(bin, RAMPS.steel[5], { side: THREE.DoubleSide }), dish, 0, 0, 2.2).rotation.x = Math.PI / 2 + 0.35;
  beam(bin, new V3(0, 0, 0), new V3(0, 1.4, 4.6), 0.12, steel, dish); box(bin, 0.6, 0.6, 0.9, brass, dish, 0, 1.6, 4.8);
  for (const s of [-1, 1]) {
    const d2 = new THREE.SphereGeometry(2.2, 14, 5, 0, TAU, 0, 0.9); d2.translate(0, -2.2 * Math.cos(0.9) - 0.1, 0);
    const m2 = mesh(bin, d2, lit(bin, RAMPS.steel[5], { side: THREE.DoubleSide }), ext, s * 3.4, 46.5, TZ); m2.rotation.set(0.4, 0, -s * 1.1);
  }
  const radar = new THREE.Group(); radar.position.set(0, 68.2, TZ); ext.add(radar); keep.add(radar);
  box(bin, 11, 0.5, 0.7, gun, radar, 0, 0, 0); for (let x = -5; x <= 5; x += 1) box(bin, 0.12, 0.9, 0.8, steel, radar, x, 0.5, 0);
  for (const [x, z, h] of [[-1, -1, 9], [1, 0.8, 12], [0.8, -1, 7]] as [number, number, number][]) cyl(bin, 0.06, 0.1, h, steel, ext, x, 68 + h / 2, TZ + z, 5);
  const strobeM = lamp(bin, 0xffffff, 3);
  keep.add(mesh(bin, new THREE.SphereGeometry(0.4, 8, 6), strobeM, ext, 1, 80.5, TZ + 0.8, false));

  // ================================================================ the spine: truss, pressure tube, tanks, radiators
  const Z0 = -46, Z1 = -122;
  const lon = [[-5, -6], [5, -6], [5, 4], [-5, 4]];
  for (const [x, y] of lon) box(bin, 0.8, 0.8, Z0 - Z1, gun, ext, x, y, (Z0 + Z1) / 2);
  for (let z = Z0; z > Z1; z -= 8) {
    for (let i = 0; i < 4; i++) { const [x0, y0] = lon[i], [x1, y1] = lon[(i + 1) % 4]; beam(bin, new V3(x0, y0, z), new V3(x1, y1, z - 8), 0.22, gun, ext); box(bin, Math.abs(x1 - x0) + 0.6, Math.abs(y1 - y0) + 0.6, 0.5, gun, ext, (x0 + x1) / 2, (y0 + y1) / 2, z); }
  }
  cyl(bin, 3.2, 3.2, Z0 - Z1, hull, ext, 0, -1, (Z0 + Z1) / 2, 18).rotation.x = Math.PI / 2;
  for (let z = Z0 - 4; z > Z1; z -= 6) cyl(bin, 3.4, 3.4, 0.6, gun, ext, 0, -1, z, 18).rotation.x = Math.PI / 2;
  for (const [x, y, c] of [[-2.4, 3.6, RAMPS.rust[3]], [2.6, 3.4, RAMPS.sage[3]], [0, -5.4, RAMPS.steel[4]]] as [number, number, number][]) cyl(bin, 0.35, 0.35, Z0 - Z1, lit(bin, c), ext, x, y, (Z0 + Z1) / 2, 8).rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) for (const z of [-58, -76, -94]) {
    mesh(bin, new THREE.SphereGeometry(5.4, 20, 14), tankM, ext, s * 10, -1, z);
    cyl(bin, 5.5, 5.5, 0.8, red, ext, s * 10, -1, z, 20);
    beam(bin, new V3(s * 5, -1, z), new V3(s * 6, -1, z), 1.0, gun, ext);
    if (z === -76) decal(bin, stencil(bin, s < 0 ? 'LOX' : 'N2O4', { size: 20, color: RAMPS.ink[1], wear: 0.1 }), 4, ext, new V3(s * 15.2, -1, z), new V3(s, 0, 0));
  }
  for (const s of [-1, 1]) for (const z of [-66, -88, -108]) {
    beam(bin, new V3(s * 5, 2, z), new V3(s * 18, 2, z), 0.4, gun, ext);
    const fin = tbox(bin, 26, 0.3, 14, radM, 1 / 8, ext, s * 30, 2.4, z);
    fin.rotation.z = s * 0.08;
    box(bin, 26.4, 0.5, 0.5, brass, ext, s * 30, 2.4, z + 7);
  }
  flood(new V3(-6, 6.5, -50), new V3(-10, -1, -76), 20); flood(new V3(6, 6.5, -50), new V3(10, -1, -76), 20);
  decal(bin, stencil(bin, 'VANGUARD', { size: 20, color: RAMPS.paper[5], wear: 0.08 }), 14, ext, new V3(0, 9, -48.05), new V3(0, 0, -1));

  // ================================================================ the engine section: reactor drum, bells, nacelles
  const EZ = -132;
  const drum = cyl(bin, 11, 12, 18, scorch, ext, 0, -1, EZ, 28); drum.rotation.x = -Math.PI / 2;
  for (const z of [EZ + 8, EZ + 3, EZ - 3, EZ - 8]) cyl(bin, 12.3, 12.3, 0.8, dark, ext, 0, -1, z, 28).rotation.x = Math.PI / 2;
  cyl(bin, 12.35, 12.35, 1.2, haz, ext, 0, -1, EZ + 6, 28).rotation.x = Math.PI / 2;
  cyl(bin, 10.5, 11, 1, dark, ext, 0, -1, EZ + 9.4, 28).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; box(bin, 1.2, 1.2, 14, gun, ext, Math.cos(a) * 12.4, -1 + Math.sin(a) * 12.4, EZ).rotation.z = a; }
  decal(bin, ins, 10, ext, new V3(-12.42, -1, EZ), new V3(-1, 0, 0)); decal(bin, ins, 10, ext, new V3(12.42, -1, EZ), new V3(1, 0, 0));
  const bells: [number, number, number, number][] = [[0, -1, EZ - 9, 7], [-7, 5.5, EZ - 9, 2.6], [7, 5.5, EZ - 9, 2.6], [-7, -7.5, EZ - 9, 2.6], [7, -7.5, EZ - 9, 2.6]];
  // the outrigger nacelles on their pylons
  for (const s of [-1, 1]) {
    const nx = s * 31, ny = -3;
    tbox(bin, 18, 2.4, 8, hull, 1 / 8, ext, s * 21, ny, EZ + 2).rotation.z = s * -0.05;
    beam(bin, new V3(s * 11, 6, EZ + 6), new V3(nx, ny + 4, EZ + 10), 0.5, gun, ext);
    const nb = cyl(bin, 4.6, 4.6, 30, hull, ext, nx, ny, EZ + 4, 20); nb.rotation.x = Math.PI / 2;
    cyl(bin, 4.7, 4.7, 1.4, red, ext, nx, ny, EZ + 14, 20).rotation.x = Math.PI / 2;
    cyl(bin, 4.7, 4.7, 7, scorch, ext, nx, ny, EZ - 8.6, 20).rotation.x = Math.PI / 2;
    const intake = cyl(bin, 2.4, 4.6, 5, dark, ext, nx, ny, EZ + 21.5, 20); intake.rotation.x = Math.PI / 2;
    cyl(bin, 1.2, 1.2, 1, steel, ext, nx, ny, EZ + 24, 12).rotation.x = Math.PI / 2;
    for (let a = 0; a < 6; a++) { const t = (a / 6) * TAU; box(bin, 0.4, 0.4, 26, gun, ext, nx + Math.cos(t) * 4.75, ny + Math.sin(t) * 4.75, EZ + 4).rotation.z = t; }
    decal(bin, stencil(bin, 'U.S.P.C.', { size: 20, color: RAMPS.paper[5], wear: 0.1 }), 6, ext, new V3(nx + s * 4.65, ny, EZ + 6), new V3(s, 0, 0));
    vents(nx + s * 4.7, ny + 2.4, EZ - 2, 3, 'z', 'x');
    bells.push([nx, ny, EZ - 12, 3.8]);
  }
  for (const [x, y, z, r] of bells) {
    const b = mesh(bin, new THREE.CylinderGeometry(r * 0.45, r, r * 1.5, 22, 1, true), bellM, ext, x, y, z - r * 0.75); b.rotation.x = Math.PI / 2;
    const gl = mesh(bin, new THREE.CylinderGeometry(r * 0.42, r * 0.95, r * 1.45, 22, 1, true), nozM, ext, x, y, z - r * 0.72, false); gl.rotation.x = Math.PI / 2;
    const pl = mesh(bin, new THREE.CylinderGeometry(r * 0.8, r * 0.25, r * 4, 20, 6, true), plumeM, ext, x, y, z - r * 1.5 - r * 2, false);
    pl.rotation.x = Math.PI / 2; keep.add(pl);
    cyl(bin, r * 0.5, r * 0.5, 1.2, steel, ext, x, y, z + 0.5, 12).rotation.x = Math.PI / 2;
  }
  // nav lamps: red to port, green to starboard, on the nacelle noses and the hangar deck edges
  const navR = lamp(bin, 0xff3020, 2.2), navG = lamp(bin, 0x40ff80, 2.0);
  for (const [m, x, y, z] of [[navR, -35.7, -3, EZ + 14], [navG, 35.7, -3, EZ + 14], [navR, -19.3, -0.5, 44], [navG, 19.3, -0.5, 44], [navR, -27.5, 41, TZ], [navG, 27.5, 41, TZ]] as [THREE.Material, number, number, number][]) keep.add(mesh(bin, new THREE.SphereGeometry(0.42, 8, 6), m, ext, x, y, z, false));

  // ================================================================ maintenance drones on their rounds
  const drones: { g: THREE.Group; lampM: THREE.MeshBasicMaterial; f: (t: number, out: V) => V; ph: number }[] = [];
  const droneBody = lit(bin, RAMPS.ochre[4], { phong: true, shininess: 40 });
  const mkDrone = (f: (t: number, out: V) => V, ph: number) => {
    const g = new THREE.Group(); ext.add(g); keep.add(g);
    mesh(bin, new THREE.SphereGeometry(0.55, 10, 8), droneBody, g, 0, 0, 0);
    for (const s of [-1, 1]) { box(bin, 1.4, 0.12, 0.12, gun, g, s * 0.7, 0, 0); cyl(bin, 0.28, 0.28, 0.1, dark, g, s * 1.4, 0.06, 0, 10); }
    box(bin, 0.3, 0.3, 0.4, dark, g, 0, -0.5, 0.2);
    const lampM = bin.m(gbuf(new THREE.MeshBasicMaterial({ color: 0x3a2a10 }), 32));
    mesh(bin, new THREE.SphereGeometry(0.18, 6, 4), lampM, g, 0, 0.55, 0, false);
    mesh(bin, new THREE.CircleGeometry(0.2, 8), lamp(bin, RAMPS.glowTeal[3], 1.6), g, 0, 0, 0.56, false);
    drones.push({ g, lampM, f, ph });
  };
  mkDrone((t, o) => o.set(Math.cos(t * 0.21) * 30, 44 + Math.sin(t * 0.4) * 2, TZ + Math.sin(t * 0.21) * 9), 0);
  mkDrone((t, o) => o.set(-21, -6 + Math.sin(t * 0.3) * 4, 10 + Math.sin(t * 0.13) * 30), 1.3);
  mkDrone((t, o) => o.set(31 + Math.cos(t * 0.35) * 7.5, -3 + Math.sin(t * 0.35) * 7.5, EZ + 4 + Math.sin(t * 0.11) * 12), 2.1);
  mkDrone((t, o) => o.set(Math.sin(t * 0.17) * 10, 28 + Math.sin(t * 0.5), 36 + Math.cos(t * 0.17) * 18), 3.7);
  mkDrone((t, o) => o.set(12 + Math.sin(t * 0.25) * 2, 4 + Math.sin(t * 0.33) * 4, -70 + Math.cos(t * 0.19) * 20), 5.2);

  // ---- the exterior light rig: the sun (shadows over the whole ship), the planet's bounce, floods on the name
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2); sun.castShadow = true; sun.position.set(-0.8, 0.38, -0.46).normalize().multiplyScalar(260);
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -160; sc.right = sc.top = 160; sc.near = 10; sc.far = 560; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
  root.add(sun, sun.target); lights.push(sun);
  const bounce = new THREE.HemisphereLight(0x3a4656, 0x98b0cc, 1.5); root.add(bounce); lights.push(bounce);
  for (const s of [-1, 1]) { const f = new THREE.SpotLight(0xffd8a0, 260, 70, 0.55, 0.6, 1.6); f.position.set(s * 14, 19, 52); f.target.position.set(s * 19, -4, 24); root.add(f, f.target); lights.push(f); }
  const engineGlow = new THREE.PointLight(0xffa060, 120, 80, 1.6); engineGlow.position.set(0, -1, EZ - 22); root.add(engineGlow); lights.push(engineGlow);
  flood(new V3(-14, 20, 52), new V3(-19, -4, 24), 26); flood(new V3(14, 20, 52), new V3(19, -4, 24), 26);

  // ---- merge everything static (one mesh per material)
  mergeStatic(bin, ext, keep);

  return {
    sun, lights,
    update(t, dt) {
      void dt;
      dish.rotation.y = t * 0.5; radar.rotation.y = -t * 1.3;
      strobeM.color.setScalar(Math.sin(t * 5.3) > 0.93 ? 3 : 0.06);
      const blink = Math.sin(t * 2.4) > 0.2 ? 2.2 : 0.15;
      navR.color.setRGB(blink, 0.12 * blink, 0.08 * blink); navG.color.setRGB(0.25 * blink, blink, 0.5 * blink);
      nozU.uT.value = t; plumeU.uT.value = t;
      engineGlow.intensity = 110 + Math.sin(t * 17) * 8 + Math.sin(t * 5.3) * 6;
      const head = (t * 14) % (chase.length + 8);
      chase.forEach((m, i) => { const d = head - i; const k = d >= 0 && d < 3 ? 1 - d / 3 : 0; m.color.setRGB(0.25 + k * 2.6, 0.08 + k * 1.2, 0.05 + k * 0.5); });
      const p = new V3(), q = new V3();
      for (const d of drones) {
        d.f(t + d.ph * 10, p); d.f(t + d.ph * 10 + 0.3, q);
        d.g.position.copy(p); d.g.lookAt(root.localToWorld(q.clone())); d.g.rotation.z += Math.sin(t * 1.7 + d.ph) * 0.1;
        d.lampM.color.setRGB(...((Math.sin(t * 3 + d.ph * 2) > 0.6 ? [2.4, 1.5, 0.4] : [0.25, 0.15, 0.05]) as [number, number, number]));
      }
    },
  };
}
