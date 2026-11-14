// Dev contact sheet for the creature sculptor (src/life/zoo.html): several species side by side under studio light,
// straight to the screen (no post pipeline), so sculpt and paint can be judged in one capture.
//   ?c=lion:4,bear:3,elk:2   kind:seed[:gene+gene] cells     &cols=3   &face=1 frames the heads   &yaw=0.9 &pitch=0.25 &dist=3
//   &mode=idle|move   &t=2.4 seconds of animation before the capture
import * as THREE from 'three';
import { wildDesign, type Kind } from './design';
import { buildSpeciesModel, makeInstance } from './creatureMesh';
import { Animator } from './anim';
import { planetPalette } from '../world/palette';

const P = new URLSearchParams(location.search);
const cells = (P.get('c') ?? 'lion:4,bear:3,elk:2,frog:5,monitor:3,boar:2').split(',');
const cols = Number(P.get('cols') ?? Math.min(3, cells.length)), rows = Math.ceil(cells.length / cols);
const yaw0 = Number(P.get('yaw') ?? 0.9), pitch = Number(P.get('pitch') ?? 0.25), dk = Number(P.get('dist') ?? 3), face = P.get('face') === '1';
const mode = (P.get('mode') ?? 'idle') as 'idle' | 'move', T = Number(P.get('t') ?? 2.4);
const cv = document.getElementById('c') as HTMLCanvasElement;
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
R.setSize(innerWidth, innerHeight); R.shadowMap.enabled = true; R.setScissorTest(true);
R.outputColorSpace = THREE.SRGBColorSpace;
const shots = cells.map((spec) => {
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
  for (let t = 0; t < T; t += 1 / 30) an.update(1 / 30, { speed: mode === 'move' ? 1.2 : 0, turn: 0, state: mode, act: 0, lookYaw: 0, lookPitch: 0, ground: () => 0, air: 0 });
  mesh.updateMatrixWorld(true);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.02, 100);
  const tgt = new THREE.Vector3(0, m.rig.height * 0.45, 0);
  let D = (Math.max(m.rig.length, m.rig.height) * 0.75 + 0.2) * dk;
  if (face && m.rig.head >= 0) { bones[m.rig.head].getWorldPosition(tgt); tgt.z += m.rig.dims.hl ? m.rig.dims.hl * 0.25 : 0; D = Math.max(m.rig.dims.hw ?? 0.2, 0.08) * 2.2 * dk; }
  cam.position.set(tgt.x + Math.sin(yaw0) * Math.cos(pitch) * D, tgt.y + Math.sin(pitch) * D, tgt.z + Math.cos(yaw0) * Math.cos(pitch) * D);
  cam.lookAt(tgt);
  console.log(spec, d.name, 'tris', m.geo.index!.count / 3, 'build ms', ms.toFixed(0));
  return { scene, cam };
});
const W = innerWidth / cols, H = innerHeight / rows;
shots.forEach((s, i) => {
  const x = (i % cols) * W, y = innerHeight - (Math.floor(i / cols) + 1) * H;
  s.cam.aspect = W / H; s.cam.updateProjectionMatrix();
  R.setViewport(x, y, W, H); R.setScissor(x, y, W, H); R.render(s.scene, s.cam);
});
(window as any).__done = true;
