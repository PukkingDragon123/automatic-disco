// The U.S.P.C. orbital launch-control hangar the main menu lives in: an operator's console in the foreground
// (big physical controls on a slanted desk, an instrument hood with nixie tubes and CRTs), the hangar floor
// beyond with Unit 07 standing in its launch cradle on a rail, a gantry, girders and rotating alarm beacons,
// the archive wing (claimed worlds on display stands) along the right wall, and a huge window onto the target
// planet with a blast shutter the cradle fires through.
import * as THREE from 'three';
import { mat, glowMat, tex, box, cyl, tiledBox, panelTex, deckTex, hazardTex, labelTex, roundelTex, Screen2D, hoverFlag, Pix, GM, OL, BR, CU, CR, BK, RD, AM, PH, HZ, INK } from './cineKit';
import { glyph7, metal, rivet, text, textW } from './machine';
import type { GFlag } from '../gfx/gbuf';

const V3 = THREE.Vector3;

// ------------------------------------------------------------------ the interactive controls
export interface Control {
  id: string; label: string; key: string; tip: string;
  root: THREE.Object3D; hits: THREE.Object3D[]; flag: GFlag;
  lamp: THREE.MeshBasicMaterial | null; lampCol: number;
  /** 0..1 press animation, driven by the menu */
  anim: number; hover: number; enabled: boolean;
  pose(u: number): void;
}
const lampOff = (c: number) => new THREE.Color(c).multiplyScalar(0.18);
function lamp(parent: THREE.Object3D, x: number, z: number, col: number) {
  const bezel = cyl(0.03, 0.034, 0.025, mat({ color: 0xb08a40, phong: true }), 10, x, 0.012, z, parent);
  const m = glowMat(col); m.color.copy(lampOff(col));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.position.set(x, 0.024, z); parent.add(dome);
  void bezel; return m;
}
function plateOn(parent: THREE.Object3D, s: string, x: number, z: number, w: number, kind: 'cream' | 'brass' | 'red' | 'black' | 'dymo' = 'cream') {
  const t = labelTex(s, kind); const img = t.image as HTMLCanvasElement;
  const h = w * (img.height / img.width);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat({ map: t }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, z); parent.add(m);
  return m;
}
/** RESUME MISSION: a heavy throttle lever in a slotted quadrant */
function makeLever(): Control {
  const root = new THREE.Group(), flag = hoverFlag();
  const steel = mat({ color: 0x8a929a, phong: true, flag }), dark = mat({ map: panelTex('black', 16, 16, { rivets: false }), flag }), red = mat({ color: 0xc8301e, phong: true, flag, shininess: 80 });
  box(0.26, 0.04, 0.34, dark, 0, 0.02, 0, root);
  box(0.03, 0.045, 0.26, mat({ color: 0x0a0a0c }), 0, 0.03, 0, root);
  for (const sx of [-0.1, 0.1]) cyl(0.012, 0.012, 0.01, mat({ color: 0xb08a40, phong: true }), 6, sx, 0.045, -0.13, root);
  const piv = new THREE.Group(); piv.position.set(0, 0.04, 0); root.add(piv);
  const arm = cyl(0.016, 0.02, 0.36, steel, 8, 0, 0.18, 0, piv);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), red); knob.position.y = 0.38; piv.add(knob);
  const grip = cyl(0.03, 0.03, 0.05, mat({ color: 0x1a1612, flag }), 8, 0, 0.3, 0, piv);
  const lp = lamp(root, 0.1, 0.12, 0x6ae088);
  const c: Control = {
    id: 'continue', label: 'RESUME MISSION', key: 'C', tip: 'Back to the world you are taking.', root, hits: [arm, knob, grip, root.children[0]], flag, lamp: lp, lampCol: 0x6ae088,
    anim: 0, hover: 0, enabled: true,
    pose(u) { piv.rotation.x = -0.55 + u * 1.25; },
  };
  c.pose(0);
  plateOn(root, 'RESUME MISSION', 0, 0.24, 0.3, 'dymo');
  return c;
}
/** NEW WORLD: the launch button under a hinged, hazard-striped safety cover */
function makeLaunch(): Control {
  const root = new THREE.Group(), flag = hoverFlag();
  const housing = mat({ map: panelTex('gun', 16, 16, { rivets: false }), flag }), red = mat({ color: 0xd8321c, phong: true, shininess: 90, flag }), haz = mat({ map: hazardTex(), flag });
  box(0.34, 0.05, 0.34, housing, 0, 0.025, 0, root);
  const ring = cyl(0.12, 0.13, 0.03, mat({ color: 0x2a2a2c, flag }), 16, 0, 0.06, 0, root);
  const btnG = new THREE.Group(); root.add(btnG);
  const btn = cyl(0.095, 0.1, 0.05, red, 16, 0, 0.09, 0, btnG);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), red); cap.position.y = 0.105; cap.scale.y = 0.5; btnG.add(cap);
  // the cover, hinged along the back edge
  const hinge = new THREE.Group(); hinge.position.set(0, 0.05, -0.16); root.add(hinge);
  const lid = new THREE.Group(); hinge.add(lid);
  box(0.32, 0.012, 0.32, haz, 0, 0.115, 0.16, lid);
  box(0.012, 0.11, 0.32, haz, -0.155, 0.06, 0.16, lid); box(0.012, 0.11, 0.32, haz, 0.155, 0.06, 0.16, lid);
  box(0.32, 0.11, 0.012, haz, 0, 0.06, 0.315, lid);
  box(0.06, 0.03, 0.03, mat({ color: 0xb08a40, phong: true }), 0, 0.09, 0.33, lid);
  cyl(0.012, 0.012, 0.34, mat({ color: 0x8a929a, phong: true }), 6, 0, 0, 0, hinge).rotation.z = Math.PI / 2;
  const lp = lamp(root, -0.13, 0.2, 0xffa432), lp2 = lamp(root, 0.13, 0.2, 0xffa432);
  const c: Control = {
    id: 'new', label: 'LAUNCH · NEW WORLD', key: 'N', tip: 'Fire Unit 07 at a new world.', root, hits: [lid, ring, btn, cap, root.children[0]], flag, lamp: lp, lampCol: 0xffa432,
    anim: 0, hover: 0, enabled: true,
    pose(u) {
      const cov = Math.min(1, u / 0.55), push = u > 0.6 ? Math.sin(Math.min(1, (u - 0.6) / 0.4) * Math.PI) : 0;
      hinge.rotation.x = -cov * 1.95 - c.hover * 0.12 * (1 - cov);
      btnG.position.y = -push * 0.035;
      lp2.color.copy(u > 0.6 ? new THREE.Color(0xffa432) : lampOff(0xffa432));
    },
  };
  c.pose(0);
  plateOn(root, 'LAUNCH', 0, 0.27, 0.2, 'red');
  return c;
}
/** ARCHIVE: a big Bakelite rotary selector on a brass dial */
function makeKnob(): Control {
  const root = new THREE.Group(), flag = hoverFlag();
  const dialP = new Pix(32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 15.5, y - 15.5); if (d < 15.5) dialP.set(x, y, d > 14 ? BR[2] : BR[5 + ((x + y) % 3 === 0 ? 1 : 0)]); }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; for (let r = 11; r < 14; r++) dialP.set(15.5 + Math.cos(a) * r, 15.5 + Math.sin(a) * r, i % 3 === 0 ? INK : BR[1]); }
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24), [mat({ color: 0x7c581b, flag }), mat({ map: tex(dialP), flag }), mat({ color: 0x7c581b, flag })]);
  dial.position.y = 0.006; root.add(dial);
  const rot = new THREE.Group(); rot.position.y = 0.012; root.add(rot);
  const bk = mat({ color: 0x1c1a18, phong: true, shininess: 60, flag });
  const k1 = cyl(0.1, 0.11, 0.05, bk, 14, 0, 0.025, 0, rot);
  const k2 = cyl(0.075, 0.09, 0.045, bk, 14, 0, 0.07, 0, rot);
  const ridge = box(0.03, 0.035, 0.16, mat({ color: 0x2c2824, flag }), 0, 0.1, -0.02, rot);
  const pointer = box(0.012, 0.012, 0.06, glowMat(0xf0e0b0), 0, 0.118, -0.075, rot);
  const lp = lamp(root, 0.14, 0.14, 0x9fd0ff);
  const c: Control = {
    id: 'archive', label: 'ARCHIVE · CLAIMED WORLDS', key: 'A', tip: 'Walk the gallery of worlds claimed for Earth.', root, hits: [k1, k2, ridge, dial], flag, lamp: lp, lampCol: 0x9fd0ff,
    anim: 0, hover: 0, enabled: true,
    pose(u) { rot.rotation.y = -u * Math.PI / 2 - c.hover * 0.08; },
  };
  void pointer;
  plateOn(root, 'ARCHIVE', 0, 0.22, 0.2, 'cream');
  return c;
}
/** SEED CARD: a punch-card reader with a card standing in its slot */
function makeReader(): Control & { card: THREE.Object3D } {
  const root = new THREE.Group(), flag = hoverFlag();
  const body = mat({ map: panelTex('olive', 16, 16, { rivets: false }), flag });
  box(0.36, 0.09, 0.26, body, 0, 0.045, 0, root);
  box(0.3, 0.01, 0.025, mat({ color: 0x050505 }), 0, 0.091, -0.02, root);
  const cp = new Pix(48, 24);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 48; x++) cp.set(x, y, (x + y) % 7 === 0 ? CR[3] : CR[4]);
  cp.hl(0, 47, 0, CR[2]); for (let x = 3; x < 46; x += 3) for (let y = 4; y < 22; y += 3) if (((x * 7 + y * 13) % 5) < 2) cp.rect(x, y, 1, 2, 0x2a2418);
  text(cp, 'USPC', 2, 1, RD[4]); cp.set(47, 0, 0); cp.set(46, 0, 0); cp.set(47, 1, 0);
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.004), [mat({ color: 0xece4c6, flag }), mat({ color: 0xece4c6, flag }), mat({ color: 0xece4c6, flag }), mat({ color: 0xece4c6, flag }), mat({ map: tex(cp), flag }), mat({ map: tex(cp), flag })]);
  card.position.set(0, 0.13, -0.02); root.add(card);
  const lp = lamp(root, 0.15, 0.1, 0xffcd6e);
  const c = {
    id: 'seed', label: 'SEED CARD', key: 'S', tip: 'Punch a seed by hand and launch at that exact world.', root, hits: [card, root.children[0]], flag, lamp: lp, lampCol: 0xffcd6e,
    anim: 0, hover: 0, enabled: true, card,
    pose(u: number) { card.position.y = 0.13 + c.hover * 0.02 - u * 0.12; },
  };
  plateOn(root, 'SEED CARD', 0, 0.19, 0.2, 'dymo');
  return c;
}
/** ASSEMBLY BAY: a slate knife switch with a copper blade and a red handle */
function makeKnife(): Control {
  const root = new THREE.Group(), flag = hoverFlag();
  const slate = mat({ color: 0x24262a, flag }), cu = mat({ color: 0xc6793c, phong: true, shininess: 70, flag }), red = mat({ color: 0xb02a18, phong: true, flag });
  box(0.22, 0.03, 0.34, slate, 0, 0.015, 0, root);
  for (const z of [-0.11, 0.1]) { box(0.07, 0.05, 0.03, cu, -0.03, 0.05, z, root); box(0.07, 0.05, 0.03, cu, 0.03, 0.05, z, root); }
  const piv = new THREE.Group(); piv.position.set(0, 0.06, 0.1); root.add(piv);
  const blade = box(0.02, 0.012, 0.24, cu, 0, 0, -0.12, piv);
  const handle = cyl(0.022, 0.022, 0.09, red, 8, 0, 0, -0.27, piv); handle.rotation.x = Math.PI / 2;
  const lp = lamp(root, 0.09, -0.15, 0xff6c44);
  const c: Control = {
    id: 'assembly', label: 'ASSEMBLY BAY', key: 'B', tip: 'Refit Unit 07: paint, plating, lens and name.', root, hits: [blade, handle, root.children[0]], flag, lamp: lp, lampCol: 0xff6c44,
    anim: 0, hover: 0, enabled: true,
    pose(u) { piv.rotation.x = 1.15 - u * 1.15 - c.hover * 0.1; },
  };
  c.pose(0);
  plateOn(root, 'ASSEMBLY', 0, 0.22, 0.2, 'cream');
  return c;
}

// ------------------------------------------------------------------ nixie tubes
const NIXIE: Record<string, THREE.CanvasTexture> = {};
function nixieTex(ch: string) {
  if (NIXIE[ch]) return NIXIE[ch];
  const W = 14, H = 20, p = new Pix(W, H);
  p.rect(0, 0, W, H, 0x0a0604);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) p.set(x, y, 0x1a0e08);
  const g = glyph7(ch);
  for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i]) {
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) p.set(2 + i * 2 + dx, 3 + j * 2 + dy, 0x5a1c04);
  }
  for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i]) { p.rect(2 + i * 2, 3 + j * 2, 2, 2, 0xff8a24); p.set(2 + i * 2, 3 + j * 2, 0xffd890); }
  const t = tex(p) as THREE.CanvasTexture; NIXIE[ch] = t; return t;
}
export class Nixies {
  readonly root = new THREE.Group();
  private mats: THREE.MeshBasicMaterial[] = []; private cur = '';
  constructor(n: number, w = 0.075) {
    const glass = mat({ color: 0x2a1a10, phong: true, shininess: 90 });
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * w;
      cyl(w * 0.42, w * 0.42, 0.14, glass, 10, x, 0.07, 0, this.root);
      cyl(w * 0.46, w * 0.5, 0.03, mat({ color: 0x1a1612 }), 10, x, 0.015, 0, this.root);
      const m = glowMat(0xffffff, { map: nixieTex(' ') }); this.mats.push(m);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.66, 0.1), m); face.position.set(x, 0.075, w * 0.43); this.root.add(face);
    }
  }
  set(s: string) {
    if (s === this.cur) return; this.cur = s;
    const n = this.mats.length, t = s.slice(-n).padStart(n, ' ');
    this.mats.forEach((m, i) => { m.map = nixieTex(t[i]); m.needsUpdate = true; });
  }
}

// ------------------------------------------------------------------ the room
export interface Room {
  controls: Control[]; reader: Control & { card: THREE.Object3D };
  nixies: Nixies; crt: Screen2D[];
  cradle: THREE.Group; golemAt: THREE.Vector3; railEnd: THREE.Vector3;
  shutters: [THREE.Object3D, THREE.Object3D];
  beacons: { head: THREE.Object3D; light: THREE.SpotLight; mat: THREE.MeshBasicMaterial }[];
  alarm: THREE.PointLight; roomLights: THREE.Light[];
  stands: { root: THREE.Object3D; top: THREE.Vector3; plate: THREE.Mesh; hit: THREE.Object3D; flag: GFlag }[];
  plaque: THREE.Mesh;
  clamps: THREE.Object3D[];
}
export function buildRoom(scene: THREE.Scene, nStands: number): Room {
  // ---- light
  const hemi = new THREE.HemisphereLight(0x7a90b8, 0x2a2018, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xd8e8ff, 2.4); sun.position.set(-6, 9, -22); sun.target.position.set(0, 0, -2);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 50; sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  const warm: THREE.Light[] = [];
  for (const [x, z] of [[-2.6, -3.5], [1.2, -5.2], [4.4, -2.5]]) { const l = new THREE.PointLight(0xffd8a0, 9, 9, 1.6); l.position.set(x, 4.6, z); scene.add(l); warm.push(l); }
  const desk = new THREE.PointLight(0xffb060, 4, 4.2, 1.3); desk.position.set(0, 2.0, 2.4); scene.add(desk); warm.push(desk);
  const alarm = new THREE.PointLight(0xff2a14, 0, 18, 1.2); alarm.position.set(0, 4, -2); scene.add(alarm);
  // ---- floor, walls, ceiling
  const floor = tiledBox(16, 0.2, 18, mat({ map: deckTex() }), 0.5); floor.position.set(0, -0.1, -3); scene.add(floor);
  const wallM = mat({ map: panelTex('gun', 32, 32, { seed: 5 }) }), oliveM = mat({ map: panelTex('olive', 32, 32, { seed: 9 }) });
  const wall = (w: number, h: number, d: number, x: number, y: number, z: number, m = wallM) => { const b = tiledBox(w, h, d, m, 0.6); b.position.set(x, y, z); scene.add(b); return b; };
  // back wall around the window opening (x -6..6, y 0.6..7.1)
  wall(2.4, 9, 0.5, -7.2, 4.5, -9.6); wall(2.4, 9, 0.5, 7.2, 4.5, -9.6);
  wall(12, 1.9, 0.5, 0, 8.05, -9.6); wall(12, 0.6, 0.5, 0, 0.3, -9.6, oliveM);
  wall(0.5, 9, 18, -8, 4.5, -1, oliveM); wall(0.5, 9, 18, 8, 4.5, -1, oliveM);
  wall(16, 0.4, 18, 0, 9.2, -1);
  // window frame and mullions
  const frameM = mat({ map: panelTex('gun', 16, 16, { seed: 13 }), phong: true });
  for (const [w, h, x, y] of [[12.6, 0.45, 0, 7.15], [12.6, 0.45, 0, 0.6], [0.45, 6.6, -6.1, 3.85], [0.45, 6.6, 6.1, 3.85], [0.28, 6.4, -2.2, 3.85], [0.28, 6.4, 2.2, 3.85], [12, 0.24, 0, 4.4]] as [number, number, number, number][]) box(w, h, 0.6, frameM, x, y, -9.35, scene);
  for (let x = -6; x <= 6; x += 1.5) { box(0.08, 0.08, 0.1, mat({ color: 0xb08a40, phong: true }), x, 7.38, -9.02, scene); box(0.08, 0.08, 0.1, mat({ color: 0xb08a40, phong: true }), x, 0.84, -9.02, scene); }
  // the blast shutter over the centre lower pane (slides apart before launch)
  const shM = mat({ map: hazardTex() }), shB = mat({ map: panelTex('gun', 32, 32, { seed: 17 }) });
  const shutter = (sx: number) => { const g = new THREE.Group(); box(2.1, 3.6, 0.18, shB, 0, 0, 0, g); box(2.1, 0.3, 0.2, shM, 0, -1.65, 0.01, g); box(0.25, 3.6, 0.2, shM, -sx * 0.95, 0, 0.01, g); g.position.set(sx * 1.05, 2.6, -9.25); scene.add(g); return g; };
  const shutters: [THREE.Object3D, THREE.Object3D] = [shutter(-1), shutter(1)];
  // ceiling girders and hanging lamps
  const girM = mat({ color: 0x3a3f46 });
  for (let z = 1; z > -10; z -= 2.6) { box(15.5, 0.35, 0.25, girM, 0, 8.6, z, scene); }
  for (const x of [-4, 0, 4]) box(0.25, 0.3, 18, girM, x, 8.3, -1, scene);
  for (const l of warm.slice(0, 3)) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.4, 10, 1, true), mat({ color: 0x4a5236, side: THREE.DoubleSide })); cone.position.set(l.position.x, l.position.y + 0.25, l.position.z); scene.add(cone); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMat(0xfff0c8)); bulb.position.copy(l.position).setY(l.position.y + 0.08); scene.add(bulb); cyl(0.015, 0.015, 3.6, girM, 4, l.position.x, l.position.y + 2.2, l.position.z, scene); }
  // wall dressing: the Corps roundel, pipes, a stencil
  const rd = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat({ map: roundelTex() })); (rd.material as THREE.MeshLambertMaterial).alphaTest = 0.5; rd.position.set(-7.74, 4.6, -3.5); rd.rotation.y = Math.PI / 2; scene.add(rd);
  for (let i = 0; i < 3; i++) { const p = cyl(0.09, 0.09, 18, mat({ color: [0xa85a29, 0x5c646c, 0x8a3a1c][i], phong: true }), 8, -7.6, 1.3 + i * 0.3, -1, scene); p.rotation.x = Math.PI / 2; }
  const st = new Pix(64, 10); st.rect(0, 0, 64, 10, OL[3]); text(st, 'LAUNCH CONTROL 4', 2, 3, CR[4]);
  const stM = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), mat({ map: tex(st) })); stM.position.set(-7.74, 6.4, -3.5); stM.rotation.y = Math.PI / 2; scene.add(stM);
  // ---- the rail, the cradle, the gantry
  const golemAt = new V3(0.8, 0.42, -3.7);
  const railM = mat({ color: 0x9aa2a8, phong: true, shininess: 60 }), slpM = mat({ color: 0x2a2620 });
  for (const sx of [-0.45, 0.45]) { const r = box(0.1, 0.12, 9, railM, golemAt.x + sx, 0.06, -6.3, scene); void r; }
  for (let z = -2.2; z > -10.5; z -= 0.6) box(1.3, 0.05, 0.16, slpM, golemAt.x, 0.025, z, scene);
  for (const sx of [-0.85, 0.85]) { const hz = box(0.12, 0.02, 9, mat({ map: hazardTex() }), golemAt.x + sx, 0.011, -6.3, scene); hz.receiveShadow = true; }
  const cradle = new THREE.Group(); cradle.position.set(golemAt.x, 0, golemAt.z); scene.add(cradle);
  box(1.1, 0.22, 1.4, mat({ map: panelTex('olive', 16, 16) }), 0, 0.2, 0, cradle);
  box(1.12, 0.05, 1.42, mat({ map: hazardTex() }), 0, 0.33, 0, cradle);
  const clamps: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(sx * 0.62, 0.3, 0); cradle.add(g);
    box(0.12, 1.3, 0.22, mat({ color: 0x5c646c, phong: true }), 0, 0.65, 0, g);
    const jaw = box(0.3, 0.14, 0.26, mat({ color: 0xb08a40, phong: true }), -sx * 0.12, 1.15, 0, g); void jaw;
    const piston = cyl(0.035, 0.035, 0.6, railM, 6, sx * 0.05, 0.35, 0.16, g); piston.rotation.z = sx * 0.4;
    clamps.push(g);
  }
  // gantry tower beside the cradle
  const gm = mat({ color: 0x4e593a }), gm2 = mat({ color: 0x77825a });
  const gx = golemAt.x + 2.0, gz = golemAt.z - 0.4;
  for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) box(0.12, 5.4, 0.12, gm, gx + dx, 2.7, gz + dz, scene);
  for (const y of [1.2, 2.6, 4.0, 5.3]) { box(1.2, 0.1, 1.2, gm2, gx, y, gz, scene); for (const dz of [-0.5, 0.5]) { const d = box(0.06, 1.55, 0.06, gm, gx, y - 0.7, gz + dz, scene); d.rotation.x = 0.7; } }
  const arm = box(1.9, 0.14, 0.18, gm, gx - 0.95, 4.0, gz + 0.4, scene); void arm;
  for (const [hx, c] of [[-1.2, 0xa85a29], [-1.55, 0x2a2a2c]] as [number, number][]) { const h = cyl(0.04, 0.04, 2.2, mat({ color: c }), 6, gx + hx, 2.9, gz + 0.4, scene); h.rotation.z = 0.12; }
  const railEnd = new V3(golemAt.x, 0.5, -10.5);
  // ---- beacons
  const beacons: Room['beacons'] = [];
  for (const [x, z] of [[-7.6, -1.5], [7.6, -1.5], [-5.6, -9.2], [5.6, -9.2]]) {
    const base = cyl(0.14, 0.16, 0.12, mat({ color: 0x2a2a2c }), 10, x, 6.0, z, scene); void base;
    const m = glowMat(0xffa432); m.color.copy(lampOff(0xffa432));
    const domeM = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m); domeM.position.set(x, 6.06, z); scene.add(domeM);
    const head = new THREE.Group(); head.position.set(x, 6.15, z); scene.add(head);
    const light = new THREE.SpotLight(0xffa020, 0, 16, 0.5, 0.4, 1.2); light.target.position.set(4, -1.5, 0); head.add(light, light.target);
    beacons.push({ head, light, mat: m });
  }
  // ---- the console
  const deskM = mat({ map: panelTex('olive', 32, 32, { seed: 21 }) });
  const deskBody = tiledBox(5.8, 0.95, 0.9, deskM, 1.2); deskBody.position.set(0, 0.475, 1.85); scene.add(deskBody);
  const deck = new THREE.Group(); deck.position.set(0, 0.98, 1.68); deck.rotation.x = 0.5; scene.add(deck);
  const top = tiledBox(5.8, 0.06, 0.82, mat({ map: panelTex('gun', 32, 32, { seed: 23 }) }), 1.4); top.position.set(0, -0.03, 0.08); deck.add(top);
  box(5.82, 0.04, 0.04, mat({ color: 0xb08a40, phong: true }), 0, 0.0, 0.5, deck);
  // the hood behind the desk: CRTs and nixies
  const hood = tiledBox(5.8, 0.46, 0.3, mat({ map: panelTex('olive', 32, 32, { seed: 27 }) }), 1.2); hood.position.set(0, 1.17, 1.33); hood.rotation.x = -0.3; scene.add(hood);
  const hoodFace = new THREE.Group(); hoodFace.position.set(0, 1.17, 1.49); hoodFace.rotation.x = -0.3; scene.add(hoodFace);
  const crt: Screen2D[] = [];
  for (const [x, w] of [[-2.15, 0.9], [2.15, 0.9]] as [number, number][]) {
    const s = new Screen2D(96, 64); crt.push(s);
    box(w + 0.08, 0.42, 0.06, mat({ color: 0x1a1816 }), x, 0, -0.01, hoodFace);
    const sc2 = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, w * 0.43), glowMat(0xffffff, { map: s.t })); sc2.position.set(x, 0, 0.025); hoodFace.add(sc2);
  }
  const nix = new Nixies(6); nix.root.position.set(0, -0.08, 0.02); nix.root.rotation.x = Math.PI / 2 - 0.18 - Math.PI / 2; hoodFace.add(nix.root);
  nix.root.rotation.x = 0; nix.root.position.set(0, -0.12, 0.04);
  const nixPlate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.077), mat({ map: labelTex('T-MINUS', 'brass') })); nixPlate.position.set(0, 0.15, 0.03); hoodFace.add(nixPlate);
  // meters on the hood
  for (const x of [-1.15, -0.65, 0.65, 1.15]) {
    const mp = new Pix(20, 16); mp.rect(0, 0, 20, 16, CR[4]); for (let i = 0; i < 9; i++) { const a = Math.PI * (1.15 + i * 0.0875); mp.set(10 + Math.cos(a) * 8, 14 + Math.sin(a) * 8, INK); } mp.rect(15, 4, 3, 2, RD[4]); mp.line(10, 14, 10 + Math.cos(-0.9 - x) * 8, 14 + Math.sin(-0.9 - x) * 8, RD[3]);
    box(0.24, 0.2, 0.05, mat({ color: 0x1a1816 }), x, 0.02, 0, hoodFace);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), mat({ map: tex(mp) })); f.position.set(x, 0.02, 0.027); hoodFace.add(f);
  }
  // the controls on the desk
  const controls: Control[] = [];
  const reader = makeReader();
  const layout: [Control, number][] = [[makeLever(), -1.95], [makeKnob(), -0.95], [makeLaunch(), 0.1], [reader, 1.1], [makeKnife(), 2.0]];
  for (const [c, x] of layout) { c.root.position.set(x, 0, 0.02); c.root.scale.setScalar(1.3); deck.add(c.root); controls.push(c); }
  // small dressing on the desk: toggles, a microphone, a coffee mug
  for (let i = 0; i < 6; i++) { const t = cyl(0.008, 0.008, 0.06, mat({ color: 0xc0c4c8, phong: true }), 5, -2.65 + i * 0.07, 0.03, -0.25, deck); t.rotation.x = i % 2 ? 0.4 : -0.4; }
  const mug = cyl(0.045, 0.04, 0.1, mat({ color: 0xe8e0c8 }), 10, 2.6, 0.05, 0.1, deck); void mug;
  const mic = cyl(0.01, 0.01, 0.3, mat({ color: 0x3a3a3a }), 5, 1.55, 0.15, -0.2, deck); mic.rotation.x = -0.4;
  const micH = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat({ color: 0x8a929a, phong: true })); micH.position.set(1.55, 0.29, -0.27); deck.add(micH);
  // ---- the archive wing: worlds on display stands along the right wall
  const stands: Room['stands'] = [];
  const brassM = mat({ color: 0xb08a40, phong: true, shininess: 50 });
  for (let i = 0; i < nStands; i++) {
    const flag = hoverFlag();
    const root = new THREE.Group(); root.position.set(5.6, 0, 0.2 - i * 1.9); scene.add(root);
    cyl(0.42, 0.5, 0.12, mat({ color: 0x2a2620, flag }), 12, 0, 0.06, 0, root);
    const col = cyl(0.22, 0.28, 1.0, mat({ map: panelTex('olive', 16, 16, { rivets: false }), flag }), 10, 0, 0.62, 0, root);
    cyl(0.34, 0.3, 0.08, mat({ color: 0xb08a40, phong: true, flag }), 12, 0, 1.15, 0, root);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 4, 24), brassM); ring.position.y = 1.6; ring.rotation.x = Math.PI / 2; root.add(ring);
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; const p = cyl(0.012, 0.012, 0.45, brassM, 4, Math.cos(a) * 0.42, 1.38, Math.sin(a) * 0.42, root); void p; }
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.09), mat({ map: labelTex('AWAITING CLAIM', 'brass') }));
    plate.position.set(-0.24, 0.78, 0); plate.rotation.y = -Math.PI / 2; plate.rotation.x = 0; root.add(plate);
    const spot = new THREE.SpotLight(0xd8f0ff, 3, 4, 0.5, 0.6, 1.4); spot.position.set(-0.3, 3.2, 0); spot.target.position.set(0, 1.5, 0); root.add(spot, spot.target);
    stands.push({ root, top: new V3(5.6, 1.62, 0.2 - i * 1.9), plate, hit: col, flag });
  }
  // the brass ODDWORLD plaque over the window (its lettering is painted once the font loads)
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1), mat({ color: 0x5c3f13 }));
  plaque.position.set(0, 7.75, -9.0); scene.add(plaque);
  box(4.6, 1.25, 0.06, mat({ map: panelTex('brass', 16, 16) }), 0, 7.75, -9.05, scene);
  void metal; void rivet; void textW; void CU; void BK; void AM; void PH; void HZ; void GM; void BR;
  return { controls, reader, nixies: nix, crt, cradle, golemAt, railEnd, shutters, beacons, alarm, roomLights: warm, stands, plaque, clamps };
}
