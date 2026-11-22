// THE RUINED POD, inside (v7: "broken and ruined; when you click it you zoom inside"). A cramped octagonal cabin four
// metres across under a low cone: quilted cream wall pads torn away to the ribs and the gold insulation, cables spilling
// out, a dead pilot console with a cracked screen that still spits sparks, a slumped ceiling lamp swinging on its
// cable, a red emergency strobe, a buckled deck plate, the couch on its side, boxes and an extinguisher where the
// landing threw them, and the round viewport, cracked, full of the planet's daylight.
// Painted at 32 px per metre in the palette ramps; every material writes the G-buffer, so the post pass outlines it.
import * as THREE from 'three';
import { InteriorLight } from '../../gfx/lights';
import { areaLit, gbuf, F_EMIT } from '../../gfx/gbuf';
import { placeModel } from '../../ship/hub/models';
import { pxTex, texMat, glowMat, P, at, hash, bayer, mixHex, INK } from '../../social/tex';

export const R = 2.25, H = 2.35, TOP = 3.0;
const SEG = 8;
const V = THREE.Vector3;

// ------------------------------------------------------------------ the surfaces
const padTex = () => pxTex('pod-pad', 64, 80, (p) => {
  for (let y = 0; y < 80; y++) for (let x = 0; x < 64; x++) {
    const cy = y % 20, cx = x % 32, dEdge = Math.min(cx, 31 - cx, cy, 19 - cy);
    let k = 4 + (dEdge < 2 ? -1 : dEdge > 6 ? 1 : 0) + (hash(x >> 1, y >> 1, 3) > 0.93 ? -1 : 0);
    if (cy === 0 || cx === 0) k = 1;
    p.set(x, y, at(P.bone, k));
  }
  // the orange program band and a stencil block
  for (let y = 52; y < 58; y++) for (let x = 0; x < 64; x++) p.set(x, y, at(P.rust, y === 52 ? 6 : y === 57 ? 3 : 5));
  for (let i = 0; i < 6; i++) p.rect(6 + i * 4, 62, 2, 4, P.steel[2]);
  // scuffs and grime toward the floor
  for (let y = 60; y < 80; y++) for (let x = 0; x < 64; x++) if (bayer(x, y) * 1.3 < (y - 60) / 40 * hash(x >> 2, 1, 9)) p.set(x, y, mixHex(p.get(x, y), 0x3a3024, 0.35));
});
const foilTex = () => pxTex('pod-foil', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const q = ((x >> 3) + (y >> 3)) & 1, d = Math.min(x % 8, y % 8); p.set(x, y, at(P.brass, 3 + (q ? 1 : 0) + (d === 0 ? -2 : d === 1 ? 1 : 0) + (hash(x, y, 2) > 0.9 ? 1 : 0))); } });
const ribTex = () => pxTex('pod-rib', 16, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.set(x, y, at(P.steel, 3 + (x < 2 ? 2 : x > 13 ? -1 : 0) + (y % 8 === 0 ? -1 : 0))); for (let y = 4; y < 32; y += 8) { p.set(8, y, P.steel[6]); p.set(9, y + 1, P.steel[1]); } });
const deckTex = () => pxTex('pod-deck', 64, 64, (p) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    // diamond tread: little raised bars alternating direction
    const cx = x % 8, cy = y % 8, odd = ((x >> 3) + (y >> 3)) & 1;
    const bar = odd ? Math.abs(cx - cy) < 1 && cx > 1 && cx < 7 : Math.abs(cx + cy - 7) < 1 && cx > 1 && cx < 7;
    let k = 2 + (bar ? 2 : 0) + (hash(x >> 2, y >> 2, 4) > 0.85 ? -1 : 0);
    if (x === 0 || y === 0) k = 0; if (x === 1 || y === 1) k = 4;
    p.set(x, y, at(P.steel, k));
  }
  for (const [x, y] of [[4, 4], [59, 4], [4, 59], [59, 59]]) { p.rect(x - 1, y - 1, 3, 3, P.steel[1]); p.set(x - 1, y - 1, P.steel[5]); }
});
const ceilTex = () => pxTex('pod-ceil', 64, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) p.set(x, y, at(P.steel, 2 + (x % 16 === 0 ? -1 : 0) + (y % 16 === 0 ? -1 : 0) + (hash(x >> 2, y >> 2, 8) > 0.9 ? 1 : 0))); });
const screenTex = (seed: number, cracked = false) => pxTex('pod-screen' + seed + cracked, 48, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 48; x++) p.set(x, y, mixHex(0x0b1210, 0x14261e, hash(x, y, seed) * 0.6));
  if (!cracked) { for (let x = 3; x < 45; x++) { const y = Math.round(16 + Math.sin(x * 0.4 + seed) * 6 * Math.sin(x * 0.1)); p.set(x, y, P.glowTeal[3]); } p.rect(3, 3, 10, 2, P.glowAmber[3]); return; }
  // a star of cracks from an impact point
  const ix = 30, iy = 12;
  for (let k = 0; k < 9; k++) { const a = k * 0.7 + hash(k, seed) * 0.5, L = 8 + hash(k, seed, 2) * 22; for (let s = 0; s < L; s++) { const x = Math.round(ix + Math.cos(a) * s + Math.sin(s * 0.5) * 0.6), y = Math.round(iy + Math.sin(a) * s); p.set(x, y, s < 3 ? 0xffffff : 0x8aa0a0); } }
  for (let r = 3; r < 9; r += 3) for (let a = 0; a < 6.28; a += 0.25) p.set(Math.round(ix + Math.cos(a) * r), Math.round(iy + Math.sin(a) * r * 0.8), 0x6a8080);
});
const outsideTex = () => pxTex('pod-outside', 96, 96, (p) => {
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
    const hz = 56 + Math.round(Math.sin(x * 0.11) * 5 + Math.sin(x * 0.31 + 1) * 2);
    if (y < hz) { const k = y / hz; p.set(x, y, mixHex(0xbfe6f0, 0xfff0d0, k * 0.9 + (bayer(x, y) - 0.5) * 0.08)); }
    else { const k = (y - hz) / (96 - hz); p.set(x, y, mixHex(0x7aa060, 0x3e5a34, k + (hash(x >> 1, y >> 1, 3) - 0.5) * 0.25)); }
  }
  // a far ridge and the sun
  for (let x = 0; x < 96; x++) { const h = 50 + Math.round(Math.sin(x * 0.05 + 2) * 7); for (let y = h; y < 58; y++) p.set(x, y, mixHex(0x8aa8b0, 0x6a8a90, (y - h) / 10)); }
  p.disc(70, 22, 6, () => 0xfffbe8);
});
const glassTex = () => pxTex('pod-glass', 64, 64, (p) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) p.set(x, y, 0xffffff, 18 + ((x + y * 2) % 23 < 2 ? 40 : 0));
  const ix = 40, iy = 22;
  for (let k = 0; k < 11; k++) { const a = k * 0.58 + hash(k, 3) * 0.4, L = 10 + hash(k, 4) * 40; for (let s = 2; s < L; s++) { const x = Math.round(ix + Math.cos(a) * s), y = Math.round(iy + Math.sin(a) * s + Math.sin(s * 0.3) * 0.8); p.set(x, y, 0xf4ffff, 220); if (s % 3 === 0) p.set(x + 1, y, 0x5a7070, 160); } }
  for (let r = 4; r < 16; r += 4) for (let a = 0; a < 6.28; a += 0.16) if (hash(Math.round(a * 10), r, 7) > 0.35) p.set(Math.round(ix + Math.cos(a) * r), Math.round(iy + Math.sin(a) * r), 0xe8ffff, 200);
});

export interface Room {
  scene: THREE.Scene; fx: THREE.Scene; light: InteriorLight;
  /** the meshes a piece can stand on (the deck, then whatever is placed) */
  floor: THREE.Mesh;
  /** occupied spots on the deck (debris) */
  blocked: { x: number; z: number; r: number }[];
  update(dt: number, t: number): void;
  dispose(): void;
}
function m(geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0], parent?: THREE.Object3D) { const o = new THREE.Mesh(geo, mat); o.position.set(...p); o.rotation.set(...r); o.castShadow = o.receiveShadow = true; parent?.add(o); return o; }

export function buildRoom(): Room {
  const scene = new THREE.Scene(), fx = new THREE.Scene();
  scene.background = new THREE.Color(0x07080a);
  const light = new InteriorLight(scene);
  light.key = 0.13; light.ceilY = H + 0.3; light.ao = 1.3; light.haze = 1.4; light.contrast = 0.26;
  const pad = texMat(padTex()), foil = texMat(foilTex()), rib = texMat(ribTex()), deck = texMat(deckTex()), ceil = texMat(ceilTex(), 0xffffff, { side: THREE.DoubleSide });
  const blocked: Room['blocked'] = [];
  // ---- the deck
  const floor = m(new THREE.CircleGeometry(R + 0.05, SEG, Math.PI / SEG), deck, [0, 0, 0], [-Math.PI / 2, 0, 0], scene);
  (deck.map as THREE.Texture).repeat.set(2.2, 2.2); floor.castShadow = false;
  // a buckled plate, lifted at one edge
  m(new THREE.BoxGeometry(0.9, 0.03, 0.7), texMat(deckTex()), [0.9, 0.1, 0.7], [0.0, 0.4, 0.22], scene);
  blocked.push({ x: 0.9, z: 0.7, r: 0.5 });
  // ---- the walls: eight segments leaning in, three of them torn open
  const wallW = 2 * R * Math.tan(Math.PI / SEG);
  const torn = new Set([2, 5]);
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2, n = new V(Math.sin(a), 0, Math.cos(a));
    const g = new THREE.Group(); g.position.set(n.x * R, 0, n.z * R); g.rotation.y = a + Math.PI; scene.add(g);
    if (i === 0) continue; // the front wall (behind the camera) stays open: the hatch side
    if (torn.has(i)) {
      // the ribs and the gold insulation behind, a pad hanging off by one corner
      m(new THREE.PlaneGeometry(wallW, H), foil, [0, H / 2, 0.06], [0, 0, 0], g);
      for (const x of [-wallW / 2 + 0.08, 0, wallW / 2 - 0.08]) m(new THREE.BoxGeometry(0.1, H, 0.12), rib, [x, H / 2, 0.02], [0, 0, 0], g);
      const hang = m(new THREE.PlaneGeometry(wallW * 0.5, 0.9), pad, [-0.3, 0.55, -0.12], [0.3, 0.2, 0.55], g); (hang.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
      m(new THREE.PlaneGeometry(wallW, H * 0.3), pad, [0, H * 0.85, 0], [0, 0, 0], g);
    } else m(new THREE.PlaneGeometry(wallW, H), pad, [0, H / 2, 0], [0, 0, 0], g);
    // the ribs between segments
    m(new THREE.BoxGeometry(0.12, H, 0.14), rib, [wallW / 2, H / 2, 0.02], [0, 0, 0], g);
  }
  // ---- the low cone overhead and its broken light
  const cone = new THREE.Mesh(new THREE.ConeGeometry(R + 0.1, TOP - H + 0.3, SEG, 1, true, Math.PI / SEG), ceil);
  cone.position.y = H + (TOP - H + 0.3) / 2 - 0.15; cone.rotation.x = 0; scene.add(cone);
  (cone.material as THREE.MeshLambertMaterial).side = THREE.BackSide;
  const lampG = new THREE.Group(); lampG.position.set(-0.3, TOP - 0.2, 0.1); scene.add(lampG);
  m(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 4), texMat(null, 0x1a1a1a), [0, -0.45, 0], [0, 0, 0], lampG);
  const shade = m(new THREE.CylinderGeometry(0.1, 0.24, 0.16, 10, 1, true), texMat(null, 0x6a6a58, { side: THREE.DoubleSide }), [0, -0.95, 0], [0, 0, 0], lampG);
  const bulb = m(new THREE.SphereGeometry(0.06, 8, 6), glowMat(0xfff0c8, 1.6), [0, -1.0, 0], [0, 0, 0], lampG);
  const lamp = new THREE.PointLight(0xffe8c0, 3.2, 6.5, 1.5); lamp.position.set(0, -1.05, 0); lampG.add(lamp);
  const ceilPanel = light.panel(0.4, H, 0.2, 0.6, 0.6, 0xbad8ff, 0.5, 6);
  // ---- the red emergency strobe
  const strobeM = glowMat(0xff3020, 1.8);
  const strobe = m(new THREE.BoxGeometry(0.16, 0.08, 0.06), strobeM, [0, H - 0.1, -R + 0.12], [0, 0, 0], scene);
  const strobeGlow = light.glow(new V(0, H - 0.2, -R + 0.3), 0xff2a18, 1.4, 4.5);
  // ---- the viewport: a round port in the back-left wall, the planet's day behind cracked glass
  const vpA = (3 / SEG) * Math.PI * 2, vn = new V(Math.sin(vpA), 0, Math.cos(vpA));
  const vp = new THREE.Group(); vp.position.set(vn.x * (R - 0.02), 1.45, vn.z * (R - 0.02)); vp.rotation.y = vpA + Math.PI; scene.add(vp);
  m(new THREE.TorusGeometry(0.46, 0.07, 6, 18), texMat(null, 0x8a9094), [0, 0, -0.02], [0, 0, 0], vp);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; m(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 6), texMat(null, 0xb1b2aa), [Math.cos(a) * 0.46, Math.sin(a) * 0.46, -0.08], [Math.PI / 2, 0, 0], vp); }
  const outside = new THREE.Mesh(new THREE.CircleGeometry(0.44, 24), gbuf(new THREE.MeshBasicMaterial({ map: outsideTex(), color: new THREE.Color(1.6, 1.6, 1.6) }), F_EMIT)); outside.position.z = 0.12; vp.add(outside);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.44, 24), gbuf(new THREE.MeshBasicMaterial({ map: glassTex(), transparent: true, depthWrite: false }), 0)); glass.position.z = 0.0; vp.add(glass);
  light.wall(new V(vn.x * (R - 0.15), 1.45, vn.z * (R - 0.15)), new V(-vn.x, 0, -vn.z), 0.8, 0.8, 0xfff0d8, 2.4, 5);
  // ---- the pilot console (wall 4, straight ahead): a slanted desk, two dead screens, one cracked, sparking
  const cA = (4 / SEG) * Math.PI * 2, cn = new V(Math.sin(cA), 0, Math.cos(cA));
  const con = new THREE.Group(); con.position.set(cn.x * (R - 0.45), 0, cn.z * (R - 0.45)); con.rotation.y = cA + Math.PI; scene.add(con);
  const olive = texMat(pxTex('pod-olive', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, at(P.olive, 3 + (hash(x >> 2, y >> 1, 5) > 0.9 ? 1 : 0) + (x === 0 || y === 0 ? -1 : 0))); }));
  con.add(m(new THREE.BoxGeometry(1.5, 0.78, 0.6), olive, [0, 0.39, 0]));
  con.add(m(new THREE.BoxGeometry(1.5, 0.06, 0.55), texMat(null, 0x2a2f32), [0, 0.82, 0.05], [-0.35, 0, 0]));
  con.add(m(new THREE.BoxGeometry(1.4, 0.5, 0.08), olive, [0, 1.25, -0.25], [0.2, 0, 0]));
  const scrA = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), gbuf(new THREE.MeshBasicMaterial({ map: screenTex(1, true) }), F_EMIT)); scrA.position.set(-0.33, 1.26, -0.2); scrA.rotation.x = 0.2; con.add(scrA);
  const scrBm = gbuf(new THREE.MeshBasicMaterial({ map: screenTex(2) }), F_EMIT), scrB = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32), scrBm); scrB.position.set(0.33, 1.26, -0.2); scrB.rotation.x = 0.2; con.add(scrB);
  for (let k = 0; k < 10; k++) con.add(m(new THREE.BoxGeometry(0.07, 0.03, 0.06), k === 3 ? glowMat(0xffb030, 1.4) : texMat(null, k % 3 ? 0x2a2a2a : 0xb03a2e), [-0.5 + k * 0.11, 0.86, 0.12], [-0.35, 0, 0]));
  // the console's cables torn out of the panel and onto the deck
  const cableM = texMat(null, 0x1c1c1c);
  for (let k = 0; k < 4; k++) {
    const pts = [new V(-0.6 + k * 0.12, 0.6, 0.3), new V(-0.7 + k * 0.2, 0.25, 0.55), new V(-0.9 + k * 0.3, 0.03, 0.95 + k * 0.1), new V(-1.1 + k * 0.35, 0.03, 1.3 + k * 0.15)];
    con.add(m(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.022, 5), k === 1 ? texMat(null, 0xb84a2a) : cableM, [0, 0, 0]));
  }
  blocked.push({ x: cn.x * (R - 0.45), z: cn.z * (R - 0.45), r: 0.9 });
  // ---- debris
  const fallenPad = m(new THREE.BoxGeometry(0.9, 0.04, 1.1), pad, [-1.15, 0.05, -0.55], [0.08, 0.6, 0.12], scene); void fallenPad;
  blocked.push({ x: -1.15, z: -0.55, r: 0.55 });
  const couch = new THREE.Group(); couch.position.set(1.25, 0, -0.9); couch.rotation.set(0, -0.8, 1.35); scene.add(couch);
  m(new THREE.BoxGeometry(0.62, 0.12, 1.3), texMat(pxTex('pod-couch', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, at(P.basalt, 2 + (y % 8 === 0 ? -1 : 0) + (x % 16 === 0 ? -1 : 0))); })), [0, 0.3, 0], [0, 0, 0], couch);
  m(new THREE.BoxGeometry(0.62, 0.7, 0.12), texMat(null, 0x3a3e40), [0, 0.6, -0.6], [0.3, 0, 0], couch);
  blocked.push({ x: 1.35, z: -0.9, r: 0.65 });
  placeModel(scene, 'cardboard_box_01', { x: -1.5, z: 0.6, ry: 0.7, rz: 0.15, s: 0.9 });
  placeModel(scene, 'plastic_crate_01', { x: -0.6, z: -1.65, ry: 1.9, s: 1 });
  placeModel(scene, 'korean_fire_extinguisher_01', { x: 0.55, y: 0.09, z: -1.3, ry: 1.2, rz: Math.PI / 2, s: 1 });
  placeModel(scene, 'clipboard', { x: -0.2, y: 0.01, z: 0.9, ry: 2.4, rx: 0, s: 1 });
  placeModel(scene, 'medical_box', { x: 1.75, y: 0, z: 0.6, ry: -0.6, s: 1 });
  blocked.push({ x: -1.5, z: 0.6, r: 0.35 }, { x: -0.6, z: -1.65, r: 0.35 }, { x: 0.55, z: -1.3, r: 0.3 }, { x: 1.75, z: 0.6, r: 0.3 });
  for (let k = 0; k < 14; k++) m(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 5), texMat(null, 0x8e9190), [(hash(k, 1) - 0.5) * 3, 0.006, (hash(k, 2) - 0.5) * 3], [Math.PI / 2, hash(k, 3) * 3, 0], scene);
  // ---- sparks (the console's torn panel and a dead wall junction)
  const sparkSrc = [new V(cn.x * (R - 0.8) - 0.3, 0.6, cn.z * (R - 0.8)), new V(Math.sin((2 / SEG) * Math.PI * 2) * (R - 0.15), 1.7, Math.cos((2 / SEG) * Math.PI * 2) * (R - 0.15))];
  const sparkGlow = sparkSrc.map((p) => light.glow(p.clone(), 0x9ad8ff, 0, 2.5));
  const sparkM = new THREE.MeshBasicMaterial({ color: 0xfff4c8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  gbuf(sparkM, 0);
  const sparks: { o: THREE.Mesh; v: THREE.Vector3; t: number }[] = [];
  const sparkGeo = new THREE.BoxGeometry(0.018, 0.018, 0.05);
  let nextSpark = 0.8;
  areaLit(scene, 0.25);
  return {
    scene, fx, light, floor, blocked,
    update(dt, t) {
      // the lamp swings a little, flickers like a bad contact
      lampG.rotation.z = Math.sin(t * 0.9) * 0.08; lampG.rotation.x = Math.sin(t * 0.63) * 0.05;
      const fl = Math.sin(t * 31) > 0.93 || (t % 7.3 < 0.12) ? 0.15 : 1;
      lamp.intensity = 3.0 * fl; (bulb.material as THREE.MeshBasicMaterial).color.setScalar(1.6 * fl);
      ceilPanel.intensity = 0.45 * fl;
      // the strobe
      const s = (Math.sin(t * 3.2) > 0.6 ? 1 : 0.08);
      strobeM.color.setRGB(1.8 * s + 0.1, 0.18 * s, 0.1 * s); strobeGlow.intensity = 1.6 * s;
      // the second screen rolls
      (scrBm.map as THREE.Texture).offset.y = (t * 0.07) % 1; scrBm.color.setScalar(Math.sin(t * 13) > 0.97 ? 0.3 : 1);
      // sparks: bursts every few seconds
      nextSpark -= dt;
      if (nextSpark <= 0) {
        nextSpark = 1.2 + Math.random() * 3;
        const i = Math.random() < 0.65 ? 0 : 1, src = sparkSrc[i];
        sparkGlow[i].intensity = 3;
        for (let k = 0; k < 14; k++) { const o = new THREE.Mesh(sparkGeo, sparkM); o.position.copy(src); fx.add(o); sparks.push({ o, v: new V((Math.random() - 0.5) * 2.4, Math.random() * 1.8, (Math.random() - 0.5) * 2.4), t: 0.4 + Math.random() * 0.5 }); }
      }
      for (const g of sparkGlow) g.intensity = Math.max(0, g.intensity - dt * 9);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s2 = sparks[i]; s2.t -= dt; s2.v.y -= 6 * dt; s2.o.position.addScaledVector(s2.v, dt); s2.o.lookAt(s2.o.position.clone().add(s2.v));
        if (s2.o.position.y < 0.01) { s2.o.position.y = 0.01; s2.v.y *= -0.3; s2.v.x *= 0.6; s2.v.z *= 0.6; }
        if (s2.t <= 0) { s2.o.removeFromParent(); sparks.splice(i, 1); }
      }
      void shade; void strobe; void INK;
    },
    dispose() { light.dispose(); scene.traverse((o) => { const mm = o as THREE.Mesh; mm.geometry?.dispose?.(); }); },
  };
}
