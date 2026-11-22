// THE RUINED POD, inside (v7: "broken and ruined; when you click it you zoom inside"). A cramped octagonal cabin under
// a low cone, every surface painted the Limbophobia way (tex.ts): quilted Beta-cloth pads, two torn away to the gold
// foil and the ribs, a slab of padding cracked and hanging off one corner, soot plumes off a burnt-out junction; cable
// looms dangling from the overhead and swaying, pipes along the ceiling, a dead pilot console with a cracked screen and
// a flickering one that still spits sparks, a swinging lamp, a red strobe, frost creeping round the cracked viewport
// where the cold gets in, lockers sprung open, the couch on its side, and the landing's debris everywhere.
// Lit and outlined by the game's post pipeline (an InteriorLight); a still scene: no motion smear (userData.noBlur).
import * as THREE from 'three';
import { InteriorLight } from '../../gfx/lights';
import { areaLit, gbuf, F_EMIT } from '../../gfx/gbuf';
import { placeModel } from '../../ship/hub/models';
import { pxTex, P, hash, bayer, mixHex } from '../../social/tex';
import { padTex, metalTex, deckTex, foilTex, loomTex, frostTex, sootTex, podMat } from './tex';

export const R = 2.0, H = 2.2, TOP = 2.75;
const SEG = 8;
const V = THREE.Vector3;

const screenTex = (seed: number, cracked = false) => pxTex('pod-screen' + seed + cracked, 48, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) p.set(x, y, mixHex(0x0b1210, 0x14261e, hash(x >> 1, y >> 1, seed) * 0.7));
  if (!cracked) { for (let x = 3; x < 45; x++) { const y = Math.round(16 + Math.sin(x * 0.4 + seed) * 6 * Math.sin(x * 0.1)); p.set(x, y, P.glowTeal[3]); p.set(x, y + 1, P.glowTeal[1]); } p.rect(3, 3, 10, 2, P.glowAmber[3]); p.rect(3, 27, 18, 2, P.glowTeal[2]); return; }
  const ix = 30, iy = 12;
  for (let k = 0; k < 9; k++) { const a = k * 0.7 + hash(k, seed) * 0.5, L = 8 + hash(k, seed, 2) * 22; for (let s = 0; s < L; s++) { const x = Math.round(ix + Math.cos(a) * s + Math.sin(s * 0.5) * 0.6), y = Math.round(iy + Math.sin(a) * s); p.set(x, y, s < 3 ? 0xffffff : 0x8aa0a0); } }
});
const outsideTex = () => pxTex('pod-outside', 96, 96, (p) => {
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const hz = 56 + Math.round(Math.sin(x * 0.11) * 5 + Math.sin(x * 0.31 + 1) * 2);
    if (y < hz) p.set(x, y, mixHex(0xbfe6f0, 0xfff0d0, (y / hz) * 0.9 + (hash(x >> 2, y >> 2, 4) - 0.5) * 0.06));
    else p.set(x, y, mixHex(0x7aa060, 0x3e5a34, (y - hz) / (96 - hz) + (hash(x >> 1, y >> 1, 3) - 0.5) * 0.25));
  }
  for (let x = 0; x < 96; x++) { const h = 50 + Math.round(Math.sin(x * 0.05 + 2) * 7); for (let y = h; y < 58; y++) p.set(x, y, mixHex(0x8aa8b0, 0x6a8a90, (y - h) / 10)); }
  p.disc(70, 22, 6, () => 0xfffbe8);
});
const glassTex = () => pxTex('pod-glass', 64, 64, (p) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, 0xffffff, 14);
  const ix = 40, iy = 22;
  for (let k = 0; k < 11; k++) { const a = k * 0.58 + hash(k, 3) * 0.4, L = 10 + hash(k, 4) * 40; for (let s = 2; s < L; s++) { const x = Math.round(ix + Math.cos(a) * s), y = Math.round(iy + Math.sin(a) * s + Math.sin(s * 0.3) * 0.8); p.set(x, y, 0xf4ffff, 220); if (s % 3 === 0) p.set(x + 1, y, 0x5a7070, 160); } }
  for (let r = 4; r < 16; r += 4) for (let a = 0; a < 6.28; a += 0.16) if (hash(Math.round(a * 10), r, 7) > 0.35) p.set(Math.round(ix + Math.cos(a) * r), Math.round(iy + Math.sin(a) * r), 0xe8ffff, 200);
  void bayer;
});

export interface Room {
  scene: THREE.Scene; fx: THREE.Scene; light: InteriorLight;
  floor: THREE.Mesh;
  blocked: { x: number; z: number; r: number }[];
  update(dt: number, t: number): void;
  dispose(): void;
}
function m(geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0], parent?: THREE.Object3D) { const o = new THREE.Mesh(geo, mat); o.position.set(...p); o.rotation.set(...r); o.castShadow = o.receiveShadow = true; parent?.add(o); return o; }
/** a wall-relative frame: segment i of the octagon, x along the wall, z out of it toward the room */
function wallFrame(scene: THREE.Object3D, i: number, inset = 0) {
  const a = (i / SEG) * Math.PI * 2, n = new V(Math.sin(a), 0, Math.cos(a));
  const g = new THREE.Group(); g.position.set(n.x * (R - inset), 0, n.z * (R - inset)); g.rotation.y = a + Math.PI; scene.add(g); return g;
}

export function buildRoom(): Room {
  const scene = new THREE.Scene(), fx = new THREE.Scene();
  scene.background = new THREE.Color(0x07080a);
  scene.userData.motionBlur = 0;
  const light = new InteriorLight(scene);
  light.key = 0.12; light.ceilY = H + 0.3; light.ao = 1.35; light.haze = 1.2; light.contrast = 0.26;
  const pad = podMat(padTex({ seed: 3, torn: true }), { repeat: [1, 1.1] }), pad2 = podMat(padTex({ seed: 7, wear: 1.3 }), { repeat: [1, 1.1] });
  const padD = podMat(padTex({ seed: 9, wear: 1.2 }), { side: THREE.DoubleSide });
  const foil = podMat(foilTex(), { repeat: [2, 2] }), rib = podMat(metalTex({ seed: 5 }), { repeat: [0.5, 1] }), gun = podMat(metalTex({ seed: 11, base: 0x3d4247, rivets: false }));
  const deck = podMat(deckTex(), { repeat: [2, 2] }), ceil = podMat(padTex({ base: 0x5a5a52, seed: 13, wear: 0.6 }), { side: THREE.BackSide, repeat: [3, 1] });
  const loom = podMat(loomTex(), { repeat: [1, 4] }), frost = podMat(frostTex(), { transparent: true, side: THREE.DoubleSide }), soot = podMat(sootTex(), { transparent: true });
  const blocked: Room['blocked'] = [];
  const wallW = 2 * R * Math.tan(Math.PI / SEG);
  // ---- the deck
  const floor = m(new THREE.CircleGeometry(R + 0.05, SEG, Math.PI / SEG), deck, [0, 0, 0], [-Math.PI / 2, 0, 0], scene); floor.castShadow = false;
  // ---- the walls: quilted pads, two torn open to the foil and the ribs, a cracked slab hanging by one corner
  const torn = new Set([2, 6]);
  for (let i = 1; i < SEG; i++) {
    const g = wallFrame(scene, i);
    if (torn.has(i)) {
      m(new THREE.PlaneGeometry(wallW, H), foil, [0, H / 2, 0.08], [0, 0, 0], g);
      for (const x of [-wallW / 2 + 0.1, -0.05, wallW / 2 - 0.12]) m(new THREE.BoxGeometry(0.08, H, 0.1), rib, [x, H / 2, 0.04], [0, 0, 0], g);
      m(new THREE.PlaneGeometry(wallW, H * 0.28), pad2, [0, H * 0.86, 0], [0, 0, 0], g);
      // the cracked slab: one corner still screwed on, the rest swinging
      const slab = new THREE.Group(); slab.position.set(wallW / 2 - 0.12, H * 0.72, -0.05); g.add(slab);
      m(new THREE.BoxGeometry(wallW * 0.62, 1.05, 0.05), padD, [-wallW * 0.31, -0.52, 0], [0, 0, 0], slab);
      slab.rotation.set(0.12, 0.25, 0.42); slab.userData.swing = i;
      // a burnt-out junction behind it
      const sm = m(new THREE.PlaneGeometry(0.75, 1.0), soot, [-0.2, 1.1, -0.02], [0, 0, 0], g); sm.castShadow = false;
    } else {
      m(new THREE.PlaneGeometry(wallW, H), i % 2 ? pad : pad2, [0, H / 2, 0], [0, 0, 0], g);
    }
    // the ribs at the seams, a hand rail at chest height
    m(new THREE.BoxGeometry(0.12, H, 0.12), rib, [wallW / 2, H / 2, 0.02], [0, 0, 0], g);
    if (!torn.has(i) && i !== 4) m(new THREE.CylinderGeometry(0.025, 0.025, wallW * 0.8, 6), gun, [0, 1.15, -0.1], [0, 0, Math.PI / 2], g);
  }
  // soot on an intact wall too
  { const g = wallFrame(scene, 5, 0.01); const sm = m(new THREE.PlaneGeometry(0.6, 0.9), soot, [0.3, 0.75, -0.01], [0, 0, 0], g); sm.castShadow = false; }
  // ---- the low cone overhead: padded, a pipe run round it, lockers, cable looms hanging loose
  const cone = new THREE.Mesh(new THREE.ConeGeometry(R + 0.1, TOP - H + 0.3, SEG, 1, true, Math.PI / SEG), ceil);
  cone.position.y = H + (TOP - H + 0.3) / 2 - 0.15; scene.add(cone);
  for (let k = 0; k < 2; k++) {
    const pipe = new THREE.Mesh(new THREE.TorusGeometry(R - 0.22 - k * 0.12, 0.035 + k * 0.01, 6, 32), gun); pipe.rotation.x = Math.PI / 2; pipe.position.y = H - 0.06 - k * 0.07; scene.add(pipe);
  }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; m(new THREE.BoxGeometry(0.06, 0.16, 0.06), rib, [Math.sin(a) * (R - 0.25), H - 0.02, Math.cos(a) * (R - 0.25)], [0, a, 0], scene); }
  // lockers over the console side, one door sprung
  const lk = wallFrame(scene, 3, 0.2);
  m(new THREE.BoxGeometry(wallW * 0.9, 0.42, 0.34), gun, [0, H - 0.4, 0.08], [0, 0, 0], lk);
  const door = new THREE.Group(); door.position.set(-wallW * 0.45, H - 0.4, -0.1); lk.add(door);
  m(new THREE.BoxGeometry(wallW * 0.44, 0.38, 0.02), gun, [wallW * 0.22, 0, 0], [0, 0, 0], door); door.rotation.y = -1.1;
  const looms: { g: THREE.Group; ph: number }[] = [];
  const hang = (x: number, z: number, len: number, bend: number, ph: number) => {
    const g = new THREE.Group(); g.position.set(x, H - 0.02, z); scene.add(g);
    const pts = [new V(0, 0, 0), new V(bend * 0.3, -len * 0.35, 0.05), new V(bend * 0.7, -len * 0.75, -0.04), new V(bend, -len, 0.02)];
    m(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.03, 6), loom, [0, 0, 0], [0, 0, 0], g);
    // a frayed end: bare copper
    for (let k = 0; k < 3; k++) m(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4), gbuf(new THREE.MeshLambertMaterial({ color: 0xc87a3a }), 1), [bend + (k - 1) * 0.015, -len - 0.04, 0.02], [0.2 * (k - 1), 0, 0.3 * (k - 1)], g);
    looms.push({ g, ph });
  };
  hang(-0.7, 0.4, 0.95, 0.12, 0); hang(-0.55, 0.55, 0.6, -0.1, 1.3); hang(0.9, -0.5, 0.8, -0.15, 2.1); hang(0.2, -1.1, 0.5, 0.08, 3.4); hang(-1.1, -0.6, 1.1, 0.2, 4.2);
  // one loom slumped across the deck from the torn wall
  { const pts = [new V(-1.45, 1.6, 0.6), new V(-1.25, 0.6, 0.55), new V(-0.95, 0.03, 0.75), new V(-0.4, 0.03, 1.15), new V(0.2, 0.03, 1.4)]; m(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.035, 6), loom, [0, 0, 0], [0, 0, 0], scene); }
  // ---- the broken lamp swinging on its cable
  const lampG = new THREE.Group(); lampG.position.set(-0.25, TOP - 0.25, 0.15); scene.add(lampG);
  m(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 4), gbuf(new THREE.MeshLambertMaterial({ color: 0x1a1a1a }), 1), [0, -0.4, 0], [0, 0, 0], lampG);
  m(new THREE.CylinderGeometry(0.09, 0.2, 0.14, 10, 1, true), podMat(metalTex({ seed: 17, base: 0x5a5a48, rivets: false }), { side: THREE.DoubleSide }), [0, -0.85, 0], [0, 0, 0], lampG);
  const bulbM = gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.2, 1.0) }), F_EMIT);
  m(new THREE.SphereGeometry(0.05, 8, 6), bulbM, [0, -0.9, 0], [0, 0, 0], lampG);
  const lamp = new THREE.PointLight(0xffe8c0, 2.6, 5.5, 1.5); lamp.position.set(0, -0.95, 0); lampG.add(lamp);
  const ceilPanel = light.panel(0.4, H, 0.2, 0.5, 0.5, 0xbad8ff, 0.4, 5);
  // ---- the red emergency strobe
  const strobeM = gbuf(new THREE.MeshBasicMaterial({ color: 0xff3020 }), F_EMIT);
  m(new THREE.BoxGeometry(0.14, 0.07, 0.06), strobeM, [0.0, H - 0.12, -R + 0.15], [0, 0, 0], scene);
  const strobeGlow = light.glow(new V(0, H - 0.2, -R + 0.3), 0xff2a18, 1.2, 4);
  // ---- the viewport, cracked, frost creeping round it where the cold gets in
  const vpA = (5 / SEG) * Math.PI * 2, vn = new V(Math.sin(vpA), 0, Math.cos(vpA));
  const vp = new THREE.Group(); vp.position.set(vn.x * (R - 0.03), 1.35, vn.z * (R - 0.03)); vp.rotation.y = vpA + Math.PI; scene.add(vp);
  m(new THREE.TorusGeometry(0.4, 0.07, 6, 18), gun, [0, 0, -0.02], [0, 0, 0], vp);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; m(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 6), rib, [Math.cos(a) * 0.4, Math.sin(a) * 0.4, -0.08], [Math.PI / 2, 0, 0], vp); }
  const outside = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), gbuf(new THREE.MeshBasicMaterial({ map: outsideTex(), color: new THREE.Color(1.2, 1.2, 1.2) }), F_EMIT)); outside.position.z = 0.12; vp.add(outside);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), gbuf(new THREE.MeshBasicMaterial({ map: glassTex(), transparent: true, depthWrite: false }), 0)); vp.add(glass);
  for (const [x, y, s, r] of [[0.32, -0.28, 0.6, 0.4], [-0.38, 0.1, 0.45, 2], [0.1, 0.42, 0.35, 4]] as [number, number, number, number][]) { const f = m(new THREE.PlaneGeometry(s, s), frost, [x, y, -0.09], [0, 0, r], vp); f.castShadow = false; }
  { const f = m(new THREE.PlaneGeometry(0.9, 0.7), frost, [vn.x * (R - 0.5), 0.012, vn.z * (R - 0.5)], [-Math.PI / 2, 0, 1], scene); f.castShadow = false; }
  light.wall(new V(vn.x * (R - 0.15), 1.35, vn.z * (R - 0.15)), new V(-vn.x, 0, -vn.z), 0.7, 0.7, 0xfff0d8, 2.0, 4.5);
  // ---- the pilot console (wall 4): two screens, one cracked, one flickering, sparking from the torn panel
  const con = wallFrame(scene, 4, 0.4);
  const olive = podMat(metalTex({ seed: 21, base: 0x5a5e44 }));
  m(new THREE.BoxGeometry(1.4, 0.76, 0.55), olive, [0, 0.38, 0], [0, 0, 0], con);
  m(new THREE.BoxGeometry(1.4, 0.06, 0.5), gun, [0, 0.8, 0.05], [-0.35, 0, 0], con);
  m(new THREE.BoxGeometry(1.3, 0.48, 0.08), olive, [0, 1.22, -0.22], [0.2, 0, 0], con);
  const scrA = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), gbuf(new THREE.MeshBasicMaterial({ map: screenTex(1, true) }), F_EMIT)); scrA.position.set(-0.3, 1.23, -0.17); scrA.rotation.x = 0.2; con.add(scrA);
  const scrBm = gbuf(new THREE.MeshBasicMaterial({ map: screenTex(2) }), F_EMIT), scrB = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), scrBm); scrB.position.set(0.3, 1.23, -0.17); scrB.rotation.x = 0.2; con.add(scrB);
  // the torn access panel under the desk, hanging open on one hinge
  const flap = m(new THREE.BoxGeometry(0.42, 0.34, 0.02), olive, [0.45, 0.2, 0.3], [0.2, -0.9, 0.1], con); void flap;
  for (let k = 0; k < 10; k++) m(new THREE.BoxGeometry(0.06, 0.03, 0.05), k === 3 ? gbuf(new THREE.MeshBasicMaterial({ color: 0xc88a28 }), F_EMIT) : gbuf(new THREE.MeshLambertMaterial({ color: k % 3 ? 0x2a2a2a : 0xa03a2e }), 1), [-0.48 + k * 0.105, 0.84, 0.12], [-0.35, 0, 0], con);
  for (let k = 0; k < 4; k++) {
    const pts = [new V(0.35 + k * 0.05, 0.3, 0.25), new V(0.3 + k * 0.12, 0.12, 0.5), new V(0.2 + k * 0.25, 0.03, 0.85 + k * 0.1)];
    m(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.02, 5), loom, [0, 0, 0], [0, 0, 0], con);
  }
  const cA = (4 / SEG) * Math.PI * 2;
  blocked.push({ x: Math.sin(cA) * (R - 0.4), z: Math.cos(cA) * (R - 0.4), r: 0.8 });
  // ---- debris: the couch on its side, a fallen pad, boxes, an extinguisher, tools, cans, papers, screws
  const couch = new THREE.Group(); couch.position.set(1.25, 0, -0.75); couch.rotation.set(0, -0.9, 1.35); scene.add(couch);
  m(new THREE.BoxGeometry(0.58, 0.12, 1.2), podMat(padTex({ base: 0x3a3c3e, seed: 19, wear: 0.8 })), [0, 0.3, 0], [0, 0, 0], couch);
  m(new THREE.BoxGeometry(0.58, 0.66, 0.12), gun, [0, 0.58, -0.56], [0.3, 0, 0], couch);
  blocked.push({ x: 1.25, z: -0.75, r: 0.6 });
  m(new THREE.BoxGeometry(0.85, 0.04, 0.9), padD, [-1.15, 0.05, -0.4], [0.08, 0.6, 0.12], scene);
  blocked.push({ x: -1.15, z: -0.4, r: 0.5 });
  const P2 = (id: string, x: number, z: number, o: { y?: number; ry?: number; rx?: number; rz?: number; s?: number } = {}) => placeModel(scene, id, { x, z, y: o.y, ry: o.ry ?? 0, rx: o.rx, rz: o.rz, s: o.s ?? 1 });
  P2('cardboard_box_01', -1.35, 0.75, { ry: 0.7, rz: 0.15, s: 0.85 }); blocked.push({ x: -1.35, z: 0.75, r: 0.32 });
  P2('plastic_crate_01', -0.55, -1.5, { ry: 1.9 }); blocked.push({ x: -0.55, z: -1.5, r: 0.32 });
  P2('korean_fire_extinguisher_01', 0.6, -1.25, { y: 0.09, ry: 1.2, rz: Math.PI / 2 }); blocked.push({ x: 0.6, z: -1.25, r: 0.25 });
  P2('medical_box', 1.55, 0.55, { ry: -0.6 }); blocked.push({ x: 1.55, z: 0.55, r: 0.25 });
  P2('clipboard', -0.15, 0.95, { y: 0.01, ry: 2.4 });
  P2('russian_food_cans_01', 0.75, 1.05, { ry: 0.5, s: 0.9 });
  P2('office_notepads', 0.35, 0.6, { y: 0.01, ry: 1.1, s: 0.9 });
  P2('screwdriver', -0.6, 0.2, { y: 0.01, ry: 0.4 });
  P2('combination_wrench', 0.15, -0.55, { y: 0.01, ry: 2.2 });
  P2('pliers', -0.95, 1.2, { y: 0.01, ry: 3.6 });
  P2('medical_tape', 1.05, 0.25, { y: 0.01, ry: 0.2 });
  P2('circuit_board', -0.3, -0.85, { y: 0.01, ry: 0.9, rx: -0.05 });
  for (let k = 0; k < 6; k++) m(new THREE.BoxGeometry(0.12 + hash(k, 5) * 0.15, 0.012, 0.08 + hash(k, 6) * 0.12), k % 2 ? padD : gun, [(hash(k, 1) - 0.5) * 2.8, 0.01, (hash(k, 2) - 0.5) * 2.8], [0, hash(k, 3) * 3, 0], scene);
  for (let k = 0; k < 18; k++) m(new THREE.CylinderGeometry(0.01, 0.01, 0.028, 5), gbuf(new THREE.MeshLambertMaterial({ color: 0x8e9190 }), 1), [(hash(k, 1) - 0.5) * 3, 0.006, (hash(k, 2) - 0.5) * 3], [Math.PI / 2, hash(k, 3) * 3, 0], scene);
  // ---- sparks off the console's torn panel and the burnt junction
  const sparkSrc = [new V(Math.sin(cA) * (R - 0.75) + 0.2, 0.3, Math.cos(cA) * (R - 0.75)), new V(Math.sin((2 / SEG) * Math.PI * 2) * (R - 0.15), 1.6, Math.cos((2 / SEG) * Math.PI * 2) * (R - 0.15))];
  const sparkGlow = sparkSrc.map((p) => light.glow(p.clone(), 0x9ad8ff, 0, 2.2));
  const sparkM = gbuf(new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0);
  const sparks: { o: THREE.Mesh; v: THREE.Vector3; t: number }[] = [];
  const sparkGeo = new THREE.BoxGeometry(0.014, 0.014, 0.04);
  let nextSpark = 0.8;
  const swing = scene.children.filter((o) => o.type === 'Group');
  areaLit(scene, 0.25);
  // a still scene: the post pass smears nothing here
  scene.traverse((o) => { o.userData.noBlur = true; });
  return {
    scene, fx, light, floor, blocked,
    update(dt, t) {
      lampG.rotation.z = Math.sin(t * 0.9) * 0.07; lampG.rotation.x = Math.sin(t * 0.63) * 0.04;
      const fl = Math.sin(t * 31) > 0.93 || (t % 7.3 < 0.12) ? 0.15 : 1;
      lamp.intensity = 2.6 * fl; bulbM.color.setRGB(1.3 * fl, 1.2 * fl, 1.0 * fl);
      ceilPanel.intensity = 0.4 * fl;
      for (const L of looms) L.g.rotation.z = Math.sin(t * 0.7 + L.ph) * 0.05;
      const s = Math.sin(t * 3.2) > 0.6 ? 1 : 0.1;
      strobeM.color.setRGB(1.2 * s + 0.08, 0.14 * s, 0.08 * s); strobeGlow.intensity = 1.3 * s;
      // the live screen rolls and drops out
      (scrBm.map as THREE.Texture).offset.y = (t * 0.07) % 1; scrBm.color.setScalar(Math.sin(t * 13) > 0.95 || (t % 4.1) < 0.2 ? 0.15 : 0.9);
      nextSpark -= dt;
      if (nextSpark <= 0) {
        nextSpark = 1.4 + Math.random() * 3;
        const i = Math.random() < 0.65 ? 0 : 1, src = sparkSrc[i];
        sparkGlow[i].intensity = 2.4;
        for (let k = 0; k < 12; k++) { const o = new THREE.Mesh(sparkGeo, sparkM); o.position.copy(src); o.userData.noBlur = true; fx.add(o); sparks.push({ o, v: new V((Math.random() - 0.5) * 2.2, Math.random() * 1.6, (Math.random() - 0.5) * 2.2), t: 0.35 + Math.random() * 0.45 }); }
      }
      for (const g of sparkGlow) g.intensity = Math.max(0, g.intensity - dt * 9);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s2 = sparks[i]; s2.t -= dt; s2.v.y -= 6 * dt; s2.o.position.addScaledVector(s2.v, dt); s2.o.lookAt(s2.o.position.clone().add(s2.v));
        if (s2.o.position.y < 0.01) { s2.o.position.y = 0.01; s2.v.y *= -0.3; s2.v.x *= 0.6; s2.v.z *= 0.6; }
        if (s2.t <= 0) { s2.o.removeFromParent(); sparks.splice(i, 1); }
      }
      void swing;
    },
    dispose() { light.dispose(); scene.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); }); },
  };
}
