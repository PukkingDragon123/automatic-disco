// Dev check sheet for the titans and the sea life (src/life/titans/check.html):
//   ?group=1   the three titans side by side, a 1.8 m human at the Grovebacker's forefoot, and a close panel on the human
//   ?fish=1    every sea-life kind large on dark water, mid-swim, membranes and photophores visible
import * as THREE from 'three';
import { beastDesign } from '../bestiary';
import { buildSpeciesModel, makeInstance } from '../creatureMesh';
import { Animator } from '../anim';
import { buildFish, FISH_KINDS } from '../fish';
import { TITAN_BUILD } from './async';

const P = new URLSearchParams(location.search);
const cv = document.getElementById('c') as HTMLCanvasElement;
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: false });
R.setSize(innerWidth, innerHeight); R.shadowMap.enabled = true; R.setScissorTest(true); R.outputColorSpace = THREE.SRGBColorSpace;
const lightUp = (scene: THREE.Scene, span: number) => {
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x403828, 1.5));
  const key = new THREE.DirectionalLight(0xfff0dc, 2.6); key.position.set(-span * 0.5, span, span * 0.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -span; sc.right = sc.top = span; sc.far = span * 4; scene.add(key);
};
function human() {
  const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0xd8c8a8 });
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); };
  add(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8), 0, 1.22); add(new THREE.SphereGeometry(0.12, 8, 6), 0, 1.68);
  for (const s of [-1, 1]) { add(new THREE.CapsuleGeometry(0.075, 0.72, 4, 6), s * 0.1, 0.45); add(new THREE.CapsuleGeometry(0.055, 0.55, 4, 6), s * 0.27, 1.17); }
  return g;
}
if (P.get('group') === '1') {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8a9aa6);
  lightUp(scene, 70);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0x5a6a48 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const ids = ['grovebacker', 'mirewalker', 'cragstrider'], xs = [-52, 8, 58];
  let gbFoot = new THREE.Vector3();
  ids.forEach((id, i) => {
    const m = buildSpeciesModel(beastDesign(id, 300 + i)), { mesh, bones } = makeInstance(m), an = new Animator(m.rig, bones, mesh);
    mesh.position.set(xs[i], 0, i === 1 ? -14 : 0); mesh.rotation.y = i === 0 ? 0.7 : i === 1 ? Math.PI / 2 + 0.2 : -0.6; scene.add(mesh); mesh.updateMatrixWorld(true);
    for (let t = 0; t < 1.2; t += 1 / 30) an.update(1 / 30, { speed: 0, turn: 0, state: 'idle', act: 0, lookYaw: 0, lookPitch: 0, ground: () => 0, air: 0 });
    mesh.updateMatrixWorld(true);
    if (i === 0) { const lg = m.rig.legs.find((l) => l.kind === 'fore' && l.side > 0)!; bones[lg.bones[lg.bones.length - 1]].getWorldPosition(gbFoot); }
    console.log(id, 'tris', m.geo.index!.count / 3, 'L', m.rig.length.toFixed(1), 'H', m.rig.height.toFixed(1));
  });
  const man = human(); man.position.set(gbFoot.x + 1.5, 0, gbFoot.z + 5); man.rotation.y = 0.4; scene.add(man);
  const W = innerWidth, H = innerHeight;
  const cam = new THREE.PerspectiveCamera(34, W / (H * 0.68), 1, 900); cam.position.set(4, 40, 175); cam.lookAt(4, 15, 0);
  R.setViewport(0, H * 0.32, W, H * 0.68); R.setScissor(0, H * 0.32, W, H * 0.68); R.render(scene, cam);
  // the close panel: the human beside the Grovebacker's forefoot
  const c2 = new THREE.PerspectiveCamera(30, W / (H * 0.32), 0.3, 400); c2.position.set(man.position.x + 4, 3.2, man.position.z + 18); c2.lookAt(man.position.x - 1, 2.6, man.position.z - 2);
  R.setViewport(0, 0, W, H * 0.32); R.setScissor(0, 0, W, H * 0.32); R.render(scene, c2);
  (window as any).__done = true;
}
if (P.get('fish') === '1') {
  const cn = 4, rn = 2, cw = innerWidth / cn, ch = innerHeight / rn, T = Number(P.get('t') ?? 1.1);
  FISH_KINDS.forEach((k, i) => {
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x14303a);
    scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x10202a, 1.2)); const key = new THREE.DirectionalLight(0xfff0dc, 1.8); key.position.set(-3, 6, 4); scene.add(key);
    const m = buildFish(k, 3), mesh = new THREE.Mesh(m.geo, m.mat); m.uniforms.uTime.value = T; m.uniforms.uSwim.value = 0.6; mesh.rotation.y = -Math.PI / 2 + 0.5; scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh), c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()).length();
    const cam = new THREE.PerspectiveCamera(28, cw / ch, 0.01, 800); cam.position.set(c.x + sz * 0.25, c.y + sz * 0.32, c.z + sz * 1.35); cam.lookAt(c);
    const x = (i % cn) * cw, y = innerHeight - (Math.floor(i / cn) + 1) * ch;
    R.setViewport(x, y, cw, ch); R.setScissor(x, y, cw, ch); R.render(scene, cam);
    console.log(k, 'tris', m.geo.index!.count / 3);
  });
  (window as any).__done = true;
}

// ?upgrade=<id>: the async path. The placeholder renders at once (left), the worker's full model lands later (right);
// a second build of the same species shows the IndexedDB cache hit
if (P.get('upgrade')) {
  TITAN_BUILD.mode = 'async';
  const id = P.get('upgrade')!, W = innerWidth, H = innerHeight;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a363e); lightUp(scene, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x4a6a40 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const t0 = performance.now(), m = buildSpeciesModel(beastDesign(id, 300)), tPh = performance.now() - t0;
  const { mesh, bones } = makeInstance(m), an = new Animator(m.rig, bones, mesh); mesh.rotation.y = 0.8; scene.add(mesh);
  const step = () => { for (let t = 0; t < 0.5; t += 1 / 30) an.update(1 / 30, { speed: 0, turn: 0, state: 'idle', act: 0, lookYaw: 0, lookPitch: 0, ground: () => 0, air: 0 }); mesh.updateMatrixWorld(true); };
  const cam = new THREE.PerspectiveCamera(32, (W / 2) / H, 0.5, 600); cam.position.set(55, 32, 55); cam.lookAt(0, 9, 0);
  step(); R.setViewport(0, 0, W / 2, H); R.setScissor(0, 0, W / 2, H); R.render(scene, cam);
  console.log('placeholder ms', tPh.toFixed(0), 'tris', m.geo.index!.count / 3);
  const wait = setInterval(() => {
    if (!(m as unknown as { ready?: boolean }).ready) return;
    clearInterval(wait);
    console.log('upgraded after ms', (performance.now() - t0).toFixed(0), 'tris', m.geo.index!.count / 3);
    step(); R.setViewport(W / 2, 0, W / 2, H); R.setScissor(W / 2, 0, W / 2, H); R.render(scene, cam);
    // the same species again: served from IndexedDB
    const t1 = performance.now(), m2 = buildSpeciesModel(beastDesign(id, 300));
    const w2 = setInterval(() => { if ((m2 as unknown as { ready?: boolean }).ready) { clearInterval(w2); console.log('second build ready after ms', (performance.now() - t1).toFixed(0)); (window as any).__done = true; } }, 50);
  }, 100);
}
