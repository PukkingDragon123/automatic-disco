// Dev contact sheet for the creature sculptor (src/life/zoo.html): several species side by side under studio light,
// straight to the screen (no post pipeline), so sculpt and paint can be judged in one capture.
//   ?c=lion:4,bear:3,elk:2   kind:seed[:gene+gene] cells     &cols=3   &face=1 frames the heads   &yaw=0.9 &pitch=0.25 &dist=3
//   &mode=idle|move &spd=1.2   &t=2.4 seconds of animation before the capture   &lid=1 shuts the eyelids
import * as THREE from 'three';
import { wildDesign, type Kind } from './design';
import { buildSpeciesModel, makeInstance } from './creatureMesh';
import { Animator } from './anim';
import { planetPalette } from '../world/palette';

const P = new URLSearchParams(location.search);
const cells = (P.get('c') ?? 'lion:4,bear:3,elk:2,frog:5,monitor:3,boar:2').split(',');
const nCells = P.get('angles') === '1' ? 5 : cells.length;
const cols = Number(P.get('cols') ?? Math.min(3, nCells)), rows = Math.ceil(nCells / cols);
const yaw0 = Number(P.get('yaw') ?? 0.9), pitch = Number(P.get('pitch') ?? 0.25), dk = Number(P.get('dist') ?? 3), face = P.get('face') === '1';
const mode = (P.get('mode') ?? 'idle') as 'idle' | 'move', T = Number(P.get('t') ?? 2.4);
const cv = document.getElementById('c') as HTMLCanvasElement;
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
R.setSize(innerWidth, innerHeight); R.shadowMap.enabled = true; R.setScissorTest(true);
R.outputColorSpace = THREE.SRGBColorSpace;
const ANG = [[0.05, 0.12], [1.57, 0.1], [3.1, 0.12], [-0.8, 0.3], [0.6, 1.45]];
const angles = P.get('angles') === '1';
const shots = (P.get('lineup') === '1' || P.get('group') === '1' ? [] : angles ? ANG.map(() => cells[0]) : cells).map((spec, ci) => {
  const yaw = angles ? ANG[ci][0] : yaw0, pit = angles ? ANG[ci][1] : pitch;
  const [kind, seedS, genes] = spec.split(':');
  const seed = Number(seedS ?? 3);
  const d = wildDesign(kind as Kind, planetPalette(seed, 'amber'), seed * 100);
  if (genes) for (const g of genes.split('+')) if (!d.genes.includes(g)) d.genes.push(g);
  const t0 = performance.now(), m = buildSpeciesModel(d), ms = performance.now() - t0;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a363e);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x403828, 1.6));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-4, 7, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -4; sc.right = sc.top = 4; scene.add(key);
  const rim = new THREE.DirectionalLight(0x9affe8, 1.2); rim.position.set(4, 3, -5); scene.add(rim);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: 0x4a6a40 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const { mesh, bones } = makeInstance(m); scene.add(mesh);
  const an = new Animator(m.rig, bones, mesh);
  if (P.get('curl') === '1') an.curl(1);
  for (let t = 0; t < T; t += 1 / 30) an.update(1 / 30, { speed: mode === 'move' ? Number(P.get('spd') ?? 1.2) : 0, turn: 0, state: mode, act: 0, lookYaw: 0, lookPitch: 0, ground: () => 0, air: 0 });
  // &lid=0..1 forces the eyelids (checks that a blink closes the eye)
  if (P.has('lid')) for (const l of m.rig.lids) bones[l.bone].quaternion.setFromAxisAngle(new THREE.Vector3(...l.axis), Number(P.get('lid')) * 1.62);
  mesh.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.02, 100);
  const tgt = new THREE.Vector3(0, m.rig.height * 0.45, 0);
  let D = (Math.max(m.rig.length, m.rig.height) * 0.75 + 0.2) * dk;
  if (face && m.rig.head >= 0) { bones[m.rig.head].getWorldPosition(tgt); tgt.z += m.rig.dims.hl ? m.rig.dims.hl * 0.25 : 0; D = Math.max(m.rig.dims.hw ?? 0.2, 0.08) * 2.2 * dk; }
  cam.position.set(tgt.x + Math.sin(yaw) * Math.cos(pit) * D, tgt.y + Math.sin(pit) * D, tgt.z + Math.cos(yaw) * Math.cos(pit) * D);
  cam.lookAt(tgt);
  console.log(spec, d.name, 'tris', m.geo.index!.count / 3, 'build ms', ms.toFixed(0));
  return { scene, cam };
});
// &group=1: the listed species loose on a grass field, seen from a top-down three-quarter camera 30 m off (play scale)
if (P.get('group') === '1') {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a363e);
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x403828, 1.6));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-6, 12, 8); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -14; sc.right = sc.top = 14; scene.add(key);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x4a6a40 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  cells.forEach((spec, i) => {
    const [kind, seedS] = spec.split(':');
    const d = wildDesign(kind as Kind, planetPalette(Number(seedS ?? 3), 'amber'), Number(seedS ?? 3) * 100);
    const m = buildSpeciesModel(d), { mesh, bones } = makeInstance(m), an = new Animator(m.rig, bones, mesh);
    const a = i * 2.4, rr = 3 + i * 0.75; mesh.position.set(Math.cos(a) * rr, 0, Math.sin(a) * rr); mesh.rotation.y = i * 1.3;
    scene.add(mesh); mesh.updateMatrixWorld(true);
    for (let t = 0; t < 0.6; t += 1 / 30) an.update(1 / 30, { speed: 0, turn: 0, state: 'idle', act: 0, lookYaw: 0, lookPitch: 0, ground: () => 0, air: 0 });
  });
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.5, 300);
  cam.position.set(0, 30 * Math.sin(0.85), 30 * Math.cos(0.85)); cam.lookAt(0, 0, 0);
  R.setViewport(0, 0, innerWidth, innerHeight); R.setScissor(0, 0, innerWidth, innerHeight); R.render(scene, cam);
  throw new Error('group drawn');
}
// &lineup=1: every listed species in one row, side-on, with a 1.8 m human silhouette for scale (like a field-guide sheet)
if (P.get('lineup') === '1') {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8a9096);
  scene.add(new THREE.HemisphereLight(0xe8ecf0, 0x50483e, 1.7));
  const key = new THREE.DirectionalLight(0xfff4e8, 2.2); key.position.set(-3, 6, 8); scene.add(key);
  // two rows: the small half in front, the big half behind, each starting with the human for scale
  let x = 0, row = 0, top = 0;
  const half = Math.ceil(cells.length / 2), rowX: number[] = [];
  const ink = new THREE.MeshBasicMaterial({ color: 0x2c323c });
  const man = new THREE.Group();
  for (const [w, h, y] of [[0.36, 0.62, 1.15], [0.24, 0.26, 1.6], [0.13, 0.86, 0.43]] as [number, number, number][]) for (const sx of w === 0.13 ? [-0.09, 0.09] : [0]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), ink); m.position.set(sx, y, 0); man.add(m); }
  man.position.x = x; scene.add(man); x += 1.4;
  for (const [ci, spec] of cells.entries()) {
    if (ci === half) { rowX.push(x); x = 0; row = 1; const m2 = man.clone(); scene.add(m2); x += 1.4; }
    const [kind, seedS] = spec.split(':');
    const d = wildDesign(kind as Kind, planetPalette(Number(seedS ?? 3), 'amber'), Number(seedS ?? 3) * 100);
    const m = buildSpeciesModel(d), { mesh, bones } = makeInstance(m), an = new Animator(m.rig, bones, mesh);
    for (let t = 0; t < 0.5; t += 1 / 30) an.update(1 / 30, { speed: 0, turn: 0, state: 'idle', act: 0, lookYaw: 0, lookPitch: 0, ground: () => 0, air: 0 });
    mesh.rotation.y = -Math.PI / 2; mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh), wdt = box.max.x - box.min.x;
    mesh.position.x = x - box.min.x; scene.add(mesh); x += wdt + 0.6; top = Math.max(top, box.max.y - box.min.y);
    if (row === 1) { mesh.position.y = 0; }
    console.log(spec, d.name, 'L', m.rig.length.toFixed(2), 'tris', m.geo.index!.count / 3);
  }
  rowX.push(x);
  // render the two rows into the top and bottom halves of the sheet at one common scale
  const span = Math.max(...rowX), asp = innerWidth / (innerHeight / 2), hgt = Math.max(top * 1.15, span / asp);
  const cam = new THREE.OrthographicCamera(-0.5, -0.5 + hgt * asp, hgt - 0.3, -0.3, 0.1, 100); cam.position.set(0, 0, 30); cam.lookAt(0, 0, 0);
  const all = scene.children.filter((o) => (o as THREE.SkinnedMesh).isSkinnedMesh || o.type === 'Group');
  const rows2 = [all.slice(0, half + 1), all.slice(half + 1)];
  for (let rI = 0; rI < 2; rI++) {
    for (const o of all) o.visible = rows2[rI].includes(o);
    const y = rI === 0 ? innerHeight / 2 : 0;
    R.setViewport(0, y, innerWidth, innerHeight / 2); R.setScissor(0, y, innerWidth, innerHeight / 2); R.render(scene, cam);
  }
  (window as any).__done = true;
  throw new Error('lineup drawn');
}
const W = innerWidth / cols, H = innerHeight / rows;
shots.forEach((s, i) => {
  const x = (i % cols) * W, y = innerHeight - (Math.floor(i / cols) + 1) * H;
  s.cam.aspect = W / H; s.cam.updateProjectionMatrix();
  R.setViewport(x, y, W, H); R.setScissor(x, y, W, H); R.render(s.scene, s.cam);
});
(window as any).__done = true;
