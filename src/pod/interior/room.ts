// THE RUINED POD, inside, as a CUTAWAY seen from the colony's own camera (v7: "make it top down, just like zoom in on
// it, same camera angle as a normal building, just darken the outside"). The pod's hull is sliced at the cabin floor
// (stage.ts / screen.ts) and this cabin stands in its place: an octagonal cabin in the hull's skin, the roof gone, the
// three walls nearest the camera cut low (the dollhouse view, like the ship hub), the two side walls at half height,
// the three far walls standing full: the pilot console under the cracked viewport, a curtain on a rail, a bank of
// lockers, a wall torn open to the gold foil with a quilted pad hanging off it by one corner, cable looms hanging off
// the wall tops. Every surface comes from the MATERIAL LIBRARY (src/gfx/mat) at its close-up HD density.
// NOTHING IS A BLOCK AND NOTHING IS FROZEN (v7: "no blocky lazy things ... the ruined things and debris should have
// physics ... the pod components break and explode in real time"): the insulation pads are quilted and puffy, the
// curtain and the hanging pad are cloth that sways in the vent's draught, the looms are ropes, every loose thing on the
// deck (the couch on its side, a fallen pad, boxes, cans, tools, papers, screws) is a rigid body that tumbles and settles,
// and the cabin keeps failing (breakage.ts): panels pop, the console bursts, a pipe vents steam, the lamp drops.
// Local frame: the cabin floor's centre is the origin, +z is the hatch side, and the camera looks from +z (toward -z).
import * as THREE from 'three';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import { matMaterial, matTex, type MatOpts } from '../../gfx/mat';
import { placeModel } from '../../ship/hub/models';
import { PodPhysics, Cloth, Rope, rigidFor, cushionGeo, quiltPanelGeo, boxCol } from './soft';
import { Breakage, type BreakRefs } from './breakage';

/** inner apothem, full wall height, hull skin radius, cabin floor above the pod's ground point */
export const R = 2.3, H = 2.2, HULL_R = 2.72, FLOOR_Y = 1.6;
const SEG = 8, CUT = 0.55, MID = 1.25;
const V = THREE.Vector3;
const hash = (a: number, b = 0, c = 0) => { let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

export interface Room {
  /** the cabin (local frame above), placed by the caller at the pod's floor */
  root: THREE.Group;
  fx: THREE.Group;
  floor: THREE.Mesh;
  /** where nothing may be built (the console, the lockers) */
  blocked: { x: number; z: number; r: number }[];
  phys: PodPhysics;
  breaks: Breakage;
  /** 0 calm .. 2 (an unhappy crew, a damaged hull): how soon things fail; set by the owner */
  stress: number;
  /** camera shake asked for by a failure (the owner decays it) */
  shake: number;
  update(dt: number, t: number): void;
  dispose(): void;
}
/** the height a wall segment stands at for the camera at local +z */
export function wallHeight(i: number) { const a = (i / SEG) * Math.PI * 2, d = Math.cos(a); return d > 0.35 ? CUT : d > -0.35 ? MID : H; }

const M = (name: string, o: MatOpts = {}) => matMaterial(name, { hd: 2, ...o });
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0], parent?: THREE.Object3D) {
  const o = new THREE.Mesh(geo, mat); o.position.set(...p); o.rotation.set(...r); o.castShadow = o.receiveShadow = true; parent?.add(o); return o;
}
/** a decal lying flat on the deck (or a wall) */
function decal(name: string, w: number, h: number, parent: THREE.Object3D, p: [number, number, number], r: [number, number, number] = [-Math.PI / 2, 0, 0], k = 0) {
  const m = M(name, { uv: 'uv', transparent: true }); m.polygonOffset = true; m.polygonOffsetFactor = -1 - k; m.polygonOffsetUnits = -1 - k;
  const o = mesh(new THREE.PlaneGeometry(w, h), m, p, r, parent); o.castShadow = false; o.renderOrder = 1 + k; return o;
}
/** segment i's frame: x along the wall, +z toward the room's centre, y up from the floor */
function wallFrame(parent: THREE.Object3D, i: number, inset = 0) {
  const a = (i / SEG) * Math.PI * 2, g = new THREE.Group();
  g.position.set(Math.sin(a) * (R - inset), 0, Math.cos(a) * (R - inset)); g.rotation.y = a + Math.PI; parent.add(g); g.updateMatrix(); return g;
}
/** a point in a wall frame, in the cabin frame */
const inFrame = (g: THREE.Object3D, x: number, y: number, z: number) => { g.updateMatrix(); return new V(x, y, z).applyMatrix4(g.matrix); };
/** the top of a cut wall: the section through the hull (skin, insulation, the inner pad) */
function capGeo(i: number, y: number) {
  const a0 = ((i - 0.5) / SEG) * Math.PI * 2, a1 = ((i + 0.5) / SEG) * Math.PI * 2, rc = R / Math.cos(Math.PI / SEG), N = 6;
  const pos: number[] = [], idx: number[] = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N, a = a0 + (a1 - a0) * t;
    const ix = Math.sin(a0) * rc + (Math.sin(a1) * rc - Math.sin(a0) * rc) * t, iz = Math.cos(a0) * rc + (Math.cos(a1) * rc - Math.cos(a0) * rc) * t;
    pos.push(ix, y, iz, Math.sin(a) * HULL_R, y, Math.cos(a) * HULL_R);
    if (k < N) { const b = k * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); g.computeVertexNormals();
  return g;
}

export function buildRoom(): Room {
  const root = new THREE.Group(); root.name = 'pod-cabin';
  const fx = new THREE.Group();
  const blocked: Room['blocked'] = [];
  const wallW = 2 * R * Math.tan(Math.PI / SEG);
  const phys = new PodPhysics(R, root);
  // ---- the library's materials (HD x2: the camera sits a few metres off)
  const quilt = M('quilt_insulation'), quiltG = M('quilt_insulation_grey'), foil = M('foil_gold');
  const section = M('quilt_insulation_grey', { color: 0x9a9890 }), rib = M('metal_anodised_grey'), gun = M('metal_dark'), deckM = M('deck_plate');
  const olive = M('enamel_olive'), machined = M('metal_machined'), lockerM = M('p_locker'), rubber = M('rubber_seal');
  const leather = M('leather_black'), pipe = M('q_pipe_paint'), panelM = M('panel_anodised_grey');
  const cableM = (len: number) => M('ix_cable', { uv: 'uv', repeat: [1, Math.max(2, len / 0.12)] });
  // ---- the deck
  const floor = mesh(new THREE.CircleGeometry(R / Math.cos(Math.PI / SEG) + 0.02, SEG, Math.PI / SEG), deckM, [0, 0, 0], [-Math.PI / 2, 0, 0], root);
  floor.castShadow = false;
  { const g = wallFrame(root, 0, -0.1); mesh(new THREE.BoxGeometry(1.1, 0.04, 0.7), machined, [0, 0.02, -0.05], [0, 0, 0], g); }
  // ---- the walls: quilted pads (their cushions bulge where the texture paints them), the hull skin, the cut section
  let torn: THREE.Group | null = null;
  for (let i = 0; i < SEG; i++) {
    const h = wallHeight(i), g = wallFrame(root, i);
    if (i === 5) {
      torn = g;
      mesh(new THREE.PlaneGeometry(wallW, h).translate(0, h / 2, 0), foil, [0, 0, -0.1], [0, 0, 0], g);
      for (const x of [-wallW / 2 + 0.16, -0.05, wallW / 2 - 0.18]) mesh(new THREE.BoxGeometry(0.08, h, 0.12), rib, [x, h / 2, -0.06], [0, 0, 0], g);
      const top = mesh(quiltPanelGeo(wallW, h * 0.24), quiltG, [0, h * 0.76, 0], [0, 0, 0], g); top.castShadow = false;
      mesh(new THREE.BoxGeometry(0.32, 0.26, 0.1), gun, [-0.3, 1.0, -0.02], [0, 0, 0], g);
      decal('hd_soot', 0.62, 1.24, g, [-0.3, 1.5, 0.04], [0, 0, 0], 0);
      decal('dmg_burn', 0.4, 0.4, g, [-0.3, 1.0, 0.035], [0, 0, 0], 1);
    } else {
      mesh(quiltPanelGeo(wallW, h), i % 2 ? quilt : quiltG, [0, 0, 0], [0, 0, 0], g);
    }
    const a0 = ((i - 0.5) / SEG) * Math.PI * 2, arc = (Math.PI * 2) / SEG;
    const skin = new THREE.CylinderGeometry(HULL_R, HULL_R, h, 6, 1, true, a0, arc).translate(0, h / 2, 0);
    mesh(skin, M('panel_hull_white', { uv: 'uv', repeat: [(HULL_R * arc) / 2, h / 2] }), [0, 0, 0], [0, 0, 0], root);
    const cap = mesh(capGeo(i, h), section, [0, 0, 0], [0, 0, 0], root); cap.castShadow = false;
    const hr = Math.max(h, wallHeight((i + 1) % SEG));
    mesh(new THREE.BoxGeometry(0.12, hr + 0.03, 0.12), rib, [wallW / 2, hr / 2, 0.02], [0, 0, 0], g);
    if (h === H && i !== 5 && i !== 4) mesh(new THREE.CylinderGeometry(0.025, 0.025, wallW * 0.8, 8), machined, [0, 1.05, 0.1], [0, 0, Math.PI / 2], g);
  }
  { const g = wallFrame(root, 0); for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.14, CUT + 0.06, 0.66), machined, [s * 0.66, (CUT + 0.06) / 2, -0.28], [0, 0, 0], g);
    mesh(new THREE.BoxGeometry(1.2, CUT + 0.02, 0.05), panelM, [0, (CUT + 0.02) / 2, 0.02], [0, 0, 0], g); }
  // the pad torn off the wall, hanging by its top corner: cloth, swaying in the vent's draught
  if (torn) {
    const W = 0.56, Hh = 0.86, nx = 7, ny = 10, pin = new V(wallW / 2 - 0.16, H * 0.76 - 0.02, 0.07);
    const hung = new Cloth(nx, ny, (i, j) => inFrame(torn!, pin.x - (nx - 1 - i) * (W / (nx - 1)) * 0.9 - j * 0.035, pin.y - j * (Hh / (ny - 1)) * 0.92, pin.z + 0.02),
      M('quilt_insulation', { uv: 'uv', repeat: [W / 2, Hh / 2], side: THREE.DoubleSide }), { pin: (i, j) => j === 0 && i >= nx - 2, uv: (i, j) => [i / (nx - 1), 1 - j / (ny - 1)] });
    phys.add(hung);
  }
  // ---- the back wall (4): the pilot console under the cracked viewport and a curtain on a rail
  const con = wallFrame(root, 4, 0.36);
  mesh(new THREE.BoxGeometry(1.4, 0.76, 0.55), olive, [0, 0.38, 0], [0, 0, 0], con);
  mesh(new THREE.BoxGeometry(1.42, 0.06, 0.52), machined, [0, 0.8, 0.05], [-0.32, 0, 0], con);
  mesh(new THREE.BoxGeometry(1.3, 0.46, 0.08), olive, [0, 1.2, -0.24], [0.18, 0, 0], con);
  const scrA = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.3), gbuf(new THREE.MeshBasicMaterial({ map: matTex('screen_off', { hd: 2 }), color: new THREE.Color(0.7, 0.75, 0.75) }), F_EMIT));
  scrA.position.set(-0.3, 1.21, -0.19); scrA.rotation.x = 0.18; con.add(scrA);
  decal('dmg_crack_glass', 0.46, 0.3, scrA, [0, 0, 0.004], [0, 0, 0], 2);
  const scrBm = gbuf(new THREE.MeshBasicMaterial({ map: matTex('q_term_screen', { hd: 2 }).clone(), color: new THREE.Color(1.1, 1.15, 1.1) }), F_EMIT);
  scrBm.map!.needsUpdate = true;
  const scrB = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.02), scrBm); scrB.position.set(0.3, 1.21, -0.19); scrB.rotation.x = 0.18; con.add(scrB);
  const keyM = [rubber, gbuf(new THREE.MeshBasicMaterial({ color: 0xd89a30 }), F_EMIT), M('enamel_red')];
  for (let k = 0; k < 10; k++) mesh(new THREE.BoxGeometry(0.07, 0.03, 0.05), keyM[k === 3 ? 1 : k % 4 === 0 ? 2 : 0], [-0.5 + k * 0.11, 0.84, 0.12], [-0.32, 0, 0], con);
  mesh(new THREE.BoxGeometry(0.42, 0.34, 0.02), olive, [0.46, 0.2, 0.31], [0.2, -0.9, 0.1], con);
  // wires spilling out of the torn access panel onto the deck: ropes
  for (let k = 0; k < 3; k++) {
    const pts = [inFrame(con, 0.36 + k * 0.05, 0.32, 0.26), inFrame(con, 0.34 + k * 0.1, 0.12, 0.46), inFrame(con, 0.26 + k * 0.2, 0.025, 0.66 + k * 0.06)];
    const c3 = new THREE.CatmullRomCurve3(pts), L = c3.getLength();
    phys.add(new Rope(c3.getSpacedPoints(7), 0.016, cableM(L)));
  }
  blocked.push({ x: 0, z: -(R - 0.36), r: 0.85 });
  phys.statics.push(boxCol(inFrame(con, 0, 0.72, -0.04), new V(0.71, 0.72, 0.3), new THREE.Quaternion().setFromEuler(con.rotation), 'console'));
  const vp = wallFrame(root, 4, 0.02); vp.position.y = 1.7;
  mesh(new THREE.TorusGeometry(0.36, 0.065, 8, 24), machined, [0, 0, 0.02], [0, 0, 0], vp);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 6), rib, [Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0.08], [Math.PI / 2, 0, 0], vp); }
  const outside = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.88, 0.95) }), F_EMIT)); outside.position.z = -0.03; vp.add(outside);
  decal('decal_glass', 0.68, 0.68, vp, [0, 0, 0.005], [0, 0, 0.4], 1);
  decal('decal_frost', 0.5, 0.5, vp, [0.3, -0.26, 0.06], [0, 0, 0.4], 2); decal('decal_frost', 0.4, 0.4, vp, [-0.34, 0.12, 0.06], [0, 0, 2], 2);
  {
    const back = wallFrame(root, 4, 0.1);
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.05, 6), machined, [-0.5, 2.1, 0], [0, 0, Math.PI / 2], back);
    const W = 0.7, Hh = 0.78, nx = 9, ny = 10, x0 = -0.98;
    const curtain = new Cloth(nx, ny, (i, j) => inFrame(back, x0 + i * (W / (nx - 1)) * (j === 0 ? 0.82 : 1), 2.08 - j * (Hh / (ny - 1)), 0.02 + (i % 2) * 0.03),
      M('curtain', { uv: 'uv', repeat: [W / 0.5, Hh / 1], side: THREE.DoubleSide }), { pin: (i, j) => j === 0 && i % 2 === 0, uv: (i, j) => [i / (nx - 1), 1 - j / (ny - 1)] });
    phys.add(curtain);
  }
  // ---- the back-right wall (3): a bank of lockers, one door sprung; the vent above them blows across the far walls
  const lk = wallFrame(root, 3, 0.24);
  mesh(new THREE.BoxGeometry(1.24, 1.84, 0.44), lockerM, [0, 0.92, 0], [0, 0, 0], lk);
  const door = new THREE.Group(); door.position.set(0.31, 0.92, 0.23); lk.add(door);
  mesh(new THREE.BoxGeometry(0.3, 1.76, 0.02), lockerM, [-0.15, 0, 0], [0, 0, 0], door); door.rotation.y = 1.05;
  blocked.push({ x: Math.sin((3 / SEG) * Math.PI * 2) * (R - 0.24), z: Math.cos((3 / SEG) * Math.PI * 2) * (R - 0.24), r: 0.62 });
  phys.statics.push(boxCol(inFrame(lk, 0, 0.92, 0), new V(0.63, 0.93, 0.23), new THREE.Quaternion().setFromEuler(lk.rotation), 'lockers'));
  {
    const vg = wallFrame(root, 3, 0.01);
    mesh(new THREE.PlaneGeometry(0.46, 0.24), M('q_vent_wall', { uv: 'uv' }), [-0.1, 2.0, 0.02], [0, 0, 0], vg).castShadow = false;
    const vp0 = inFrame(vg, -0.1, 2.0, 0.08), target = new V(-0.6, 1.6, -1.7);
    phys.winds.push({ p: vp0, dir: target.sub(vp0).normalize(), r: 0.7, k: 9, gust: 0.9 });
  }
  // ---- a pipe run along the far walls' tops (where one can burst), the red emergency strobe
  const pipes: BreakRefs['pipes'] = [];
  for (let i = 3; i <= 5; i++) {
    const g = wallFrame(root, i, 0.14);
    mesh(new THREE.CylinderGeometry(0.045, 0.045, wallW + 0.05, 10), pipe, [0, H - 0.16, 0], [0, 0, Math.PI / 2], g);
    mesh(new THREE.CylinderGeometry(0.03, 0.03, wallW + 0.05, 8), gun, [0, H - 0.3, 0.03], [0, 0, Math.PI / 2], g);
    const at = inFrame(g, i === 4 ? -0.35 : 0.3, H - 0.16, 0.05), into = inFrame(g, 0, 0, 1).sub(inFrame(g, 0, 0, 0)).normalize();
    pipes.push({ at, dir: into.add(new V(0, -0.35, 0)).normalize() });
  }
  const strobeM = gbuf(new THREE.MeshBasicMaterial({ color: 0xff3020 }), F_EMIT);
  { const g = wallFrame(root, 4, 0.12); mesh(new THREE.BoxGeometry(0.16, 0.08, 0.08), strobeM, [0.62, H - 0.05, 0], [0, 0, 0], g); }
  const strobe = new THREE.PointLight(0xff2a18, 0, 5, 1.6); strobe.position.copy(new V(0.62, H - 0.2, -(R - 0.4))); root.add(strobe);
  // a caged work lamp on the torn wall's rib, still burning (it can tear loose and swing on its cable)
  const lampG = wallFrame(root, 5, 0.18); lampG.position.y = 1.86;
  mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 10, 1, true), M('metal_painted_green', { side: THREE.DoubleSide }), [0, 0, 0], [0.5, 0, 0], lampG);
  const bulbM = gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.25, 1.0) }), F_EMIT);
  mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbM, [0, -0.04, 0.05], [0, 0, 0], lampG);
  const lamp = new THREE.PointLight(0xffd8a8, 3.2, 6, 1.4); lamp.position.set(0, -0.1, 0.2); lampG.add(lamp);
  const lampMount = lampG.position.clone().add(new V(0, 0.1, 0));
  // ---- access panels on the walls (they can pop): a dark recess and a wire behind each
  const panels: BreakRefs['panels'] = [];
  for (const [i, x, y] of [[6, -0.25, 0.66], [4, 0.82, 1.02], [2, 0.3, 0.78]] as [number, number, number][]) {
    const g = wallFrame(root, i, 0.0);
    mesh(new THREE.PlaneGeometry(0.3, 0.24), gun, [x, y, 0.04], [0, 0, 0], g).castShadow = false;
    const p = mesh(cushionGeo(0.34, 0.28, 0.03, { round: 0.15, puff: 0.03 }), panelM, [x, y, 0.07], [0, 0, 0], g);
    panels.push({ obj: p, n: inFrame(g, 0, 0, 1).sub(inFrame(g, 0, 0, 0)).normalize() });
  }
  // ---- cable looms hanging off the far walls' tops (ropes), one slumped across the deck from the torn wall
  const hang = (i: number, x: number, len: number, bend: number) => {
    const w = wallFrame(root, i, 0.2), top = inFrame(w, x, H - 0.05, 0), pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) pts.push(top.clone().add(inFrame(w, bend * (k / 10), -len * (k / 10), 0.06 * (k / 10)).sub(inFrame(w, 0, 0, 0))));
    phys.add(new Rope(pts, 0.03, cableM(len)));
  };
  hang(3, 0.55, 0.9, 0.12); hang(4, -0.15, 0.55, -0.1); hang(5, 0.35, 1.1, 0.2);
  { const c3 = new THREE.CatmullRomCurve3([new V(-1.35, 1.6, -1.1), new V(-1.15, 0.5, -0.95), new V(-0.95, 0.04, -1.05), new V(-0.55, 0.04, -1.2), new V(-0.2, 0.04, -1.35)]);
    phys.add(new Rope(c3.getSpacedPoints(16), 0.034, cableM(c3.getLength()))); }
  // ---- the landing's debris: every loose thing is a rigid body; the couch on its side, a fallen pad, boxes, cans, tools
  const couch = new THREE.Group(); couch.position.set(-1.5, 0.31, -0.45); couch.rotation.set(0, 0.55, Math.PI / 2); root.add(couch);
  mesh(cushionGeo(0.58, 0.16, 1.1, { round: 0.35, puff: 0.22 }), leather, [0, 0.3, 0], [0, 0, 0], couch);
  mesh(cushionGeo(0.58, 0.62, 0.14, { round: 0.3, puff: 0.12 }), leather, [0, 0.56, -0.5], [0.3, 0, 0], couch);
  mesh(new THREE.BoxGeometry(0.5, 0.06, 1.0), gun, [0, 0.2, 0], [0, 0, 0], couch);
  const bodies: THREE.Object3D[] = [couch];
  const pad = mesh(cushionGeo(0.8, 0.07, 0.86, { round: 0.3, puff: 0.3 }), quilt, [-0.95, 0.05, -1.2], [0.04, 0.5, 0.06], root); bodies.push(pad);
  const pending: { g: THREE.Group; mass: number }[] = [];
  const P2 = (id: string, x: number, z: number, mass: number, o: { y?: number; ry?: number; rx?: number; rz?: number; s?: number } = {}) => pending.push({ g: placeModel(root, id, { x, z, y: o.y, ry: o.ry ?? 0, rx: o.rx, rz: o.rz, s: o.s ?? 1 }), mass });
  P2('cardboard_box_01', 1.85, -0.8, 2.5, { ry: 0.7, s: 0.85 });
  P2('plastic_crate_01', -1.85, -0.05, 3, { ry: 1.9 });
  P2('korean_fire_extinguisher_01', -1.6, 1.55, 6, { y: 0.09, ry: 0.4, rz: Math.PI / 2 });
  P2('medical_box', 0.9, -1.38, 1.5, { ry: -0.6 });
  P2('clipboard', -0.55, -1.0, 0.3, { y: 0.01, ry: 2.4 });
  P2('russian_food_cans_01', 1.95, -0.35, 1.2, { ry: 0.5, s: 0.9 });
  P2('office_notepads', -0.2, -0.75, 0.3, { y: 0.01, ry: 1.1, s: 0.9 });
  P2('screwdriver', 0.6, -0.8, 0.2, { y: 0.01, ry: 0.4 });
  P2('combination_wrench', -1.1, 0.95, 0.4, { y: 0.01, ry: 2.2 });
  P2('pliers', 1.15, 1.1, 0.3, { y: 0.01, ry: 3.6 });
  P2('circuit_board', 0.3, -1.25, 0.2, { y: 0.02, ry: 0.9 });
  // papers, scraps of panelling, screws
  for (let k = 0; k < 7; k++) {
    const a = hash(k, 1) * Math.PI * 2, r = 0.9 + hash(k, 2) * 0.8, x = Math.sin(a) * r, z = -Math.abs(Math.cos(a) * r) * 0.9;
    const m = mesh(new THREE.BoxGeometry(0.1 + hash(k, 5) * 0.12, 0.008, 0.07 + hash(k, 6) * 0.1), k % 2 ? M('paper') : gun, [x, 0.03 + k * 0.004, z], [0, hash(k, 3) * 3, 0], root);
    m.castShadow = false; m.userData.mass = k % 2 ? 0.05 : 0.6; bodies.push(m);
  }
  const screwM = M('metal_machined');
  for (let k = 0; k < 8; k++) { const m = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.035, 6), screwM, [(hash(k, 7) - 0.5) * 2.6, 0.02, -0.2 - hash(k, 8) * 1.2], [Math.PI / 2, hash(k, 9) * 3, 0], root); m.userData.mass = 0.03; bodies.push(m); }
  root.updateMatrixWorld(true);
  for (const o of bodies) { const b = rigidFor(o, root, { mass: o === couch ? 22 : o === pad ? 3 : o.userData.mass }); if (b) phys.add(b); }
  // grime, scorch, dust and the crew's boot prints on the deck
  decal('decal_scorch', 1.1, 1.1, root, [-0.95, 0.004, -1.0], [-Math.PI / 2, 0, 0.6], 0);
  decal('zw_debris', 0.9, 0.9, root, [0.55, 0.005, -1.05], [-Math.PI / 2, 0, 1.1], 1);
  decal('zw_debris', 0.8, 0.8, root, [-1.25, 0.005, 0.15], [-Math.PI / 2, 0, 2.6], 1);
  decal('dbr_dust', 1.2, 1.2, root, [1.2, 0.006, -0.55], [-Math.PI / 2, 0, 0.3], 2);
  decal('decal_stain_water', 1.0, 1.0, root, [0.35, 0.004, -1.45], [-Math.PI / 2, 0, 0], 0);
  decal('decal_frost', 0.9, 0.7, root, [0.1, 0.007, -1.6], [-Math.PI / 2, 0, 1], 3);
  decal('decal_footprints', 0.9, 1.6, root, [0.15, 0.005, 0.95], [-Math.PI / 2, 0, 0.15], 1);
  // ---- sparks: off the console's torn panel and the burnt junction now and then, and from every failure
  const sparkSrc = [new V(0.35, 0.3, -(R - 0.72)), new V(Math.sin((5 / SEG) * Math.PI * 2) * (R - 0.15) + 0.1, 1.0, Math.cos((5 / SEG) * Math.PI * 2) * (R - 0.15))];
  const sparkGlow = sparkSrc.map((p) => { const l = new THREE.PointLight(0x9ad8ff, 0, 2.2, 2); l.position.copy(p); root.add(l); return l; });
  const sparkM = gbuf(new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 0);
  const sparks: { o: THREE.Mesh; v: THREE.Vector3; t: number }[] = [];
  const sparkGeo = new THREE.BoxGeometry(0.014, 0.014, 0.04);
  const sparksAt = (at: THREE.Vector3, n: number) => {
    const w = root.localToWorld(at.clone());
    for (let k = 0; k < n; k++) { const o = new THREE.Mesh(sparkGeo, sparkM); o.position.copy(w); o.userData.noBlur = true; fx.add(o); sparks.push({ o, v: new V((Math.random() - 0.5) * 2.6, Math.random() * 2, (Math.random() - 0.5) * 2.6), t: 0.35 + Math.random() * 0.5 }); }
  };
  let nextSpark = 0.8;
  root.traverse((o) => { o.userData.noBlur = true; });
  const room: Room = {
    root, fx, floor, blocked, phys, stress: 0, shake: 0,
    breaks: null as unknown as Breakage,
    update(dt, t) {
      // the rigid bodies for the props whose models have arrived
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i]; if (!p.g.parent) { pending.splice(i, 1); continue; }
        if (!p.g.children.length) continue;
        pending.splice(i, 1);
        p.g.traverse((o) => { o.userData.noBlur = true; });
        const b = rigidFor(p.g, root, { mass: p.mass }); if (b) phys.add(b);
      }
      if (!room.breaks.lampLoose) { const fl = Math.sin(t * 31) > 0.93 || (t % 7.3 < 0.12) ? 0.2 : 1; lamp.intensity = 3.2 * fl; bulbM.color.setRGB(1.4 * fl, 1.25 * fl, 1.0 * fl); }
      const s = Math.sin(t * 3.2) > 0.6 ? 1 : 0.1;
      strobeM.color.setRGB(1.3 * s + 0.08, 0.14 * s, 0.08 * s); strobe.intensity = 2.2 * s;
      if (!room.breaks.R.console.done) { (scrBm.map as THREE.Texture).offset.y = (t * 0.07) % 1; scrBm.color.setScalar(Math.sin(t * 13) > 0.95 || (t % 4.1) < 0.2 ? 0.15 : 1.1); }
      nextSpark -= dt;
      if (nextSpark <= 0) { nextSpark = 1.4 + Math.random() * 3; const i = Math.random() < 0.65 ? 0 : 1; sparkGlow[i].intensity = 2.4; sparksAt(sparkSrc[i], 12); }
      for (const g of sparkGlow) g.intensity = Math.max(0, g.intensity - dt * 9);
      const floorW = root.position.y;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s2 = sparks[i]; s2.t -= dt; s2.v.y -= 6 * dt; s2.o.position.addScaledVector(s2.v, dt); s2.o.lookAt(s2.o.position.clone().add(s2.v));
        if (s2.o.position.y < floorW + 0.01) { s2.o.position.y = floorW + 0.01; s2.v.y *= -0.3; s2.v.x *= 0.6; s2.v.z *= 0.6; }
        if (s2.t <= 0) { s2.o.removeFromParent(); sparks.splice(i, 1); }
      }
      phys.step(dt);
      room.breaks.update(dt, room.stress, t);
    },
    dispose() {
      room.breaks.dispose(); phys.dispose();
      root.removeFromParent(); fx.removeFromParent();
      root.traverse((o) => { (o as THREE.Mesh).geometry?.dispose?.(); });
    },
  };
  room.breaks = new Breakage({
    root, phys, sparks: sparksAt, shake: (a) => { room.shake = Math.max(room.shake, a); },
    panels, pipes,
    console: { at: inFrame(con, 0.3, 1.21, -0.12), n: inFrame(con, 0, 0, 1).sub(inFrame(con, 0, 0, 0)).normalize(), screen: scrBm, screenMesh: scrB },
    lamp: { obj: lampG, mount: lampMount, light: lamp },
  });
  // let the loose things settle where they fell
  phys.settle(1.2);
  return room;
}
