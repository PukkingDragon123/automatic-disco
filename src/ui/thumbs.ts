// Species portraits: render a species once in a neutral pose into a small target and keep it as a data URL.
import * as THREE from 'three';
import type { Species } from '../game/species';
import { makeInstance } from '../life/creatureMesh';
import { Animator } from '../life/anim';

let R: THREE.WebGLRenderer | null = null;
export function initThumbs(r: THREE.WebGLRenderer) { R = r; }
const cache = new Map<number, string>();
const SZ = 96;
let rt: THREE.WebGLRenderTarget | null = null;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(-2, 4, 3); scene.add(sun);
const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 100);

export function thumb(sp: Species): string {
  const hit = cache.get(sp.id); if (hit) return hit;
  if (!R) return '';
  rt ??= new THREE.WebGLRenderTarget(SZ, SZ, { type: THREE.UnsignedByteType });
  const { mesh, bones } = makeInstance(sp.model);
  const an = new Animator(sp.model.rig, bones, mesh);
  mesh.rotation.y = 0.75;
  scene.add(mesh);
  for (let i = 0; i < 3; i++) an.update(0.016, { speed: 0, turn: 0, state: 'idle', act: 0, lookYaw: 0.3, lookPitch: 0, ground: () => 0, air: 0 });
  mesh.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const r = Math.max(s.x, s.y, s.z) * 0.62 + 0.05;
  cam.position.set(c.x + r * 1.6, c.y + r * 1.1, c.z + r * 2.4);
  cam.lookAt(c);
  const prev = R.getRenderTarget();
  R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear();
  R.render(scene, cam);
  const px = new Uint8Array(SZ * SZ * 4);
  R.readRenderTargetPixels(rt, 0, 0, SZ, SZ, px);
  R.setRenderTarget(prev);
  scene.remove(mesh); (mesh.material as THREE.Material).dispose();
  const cv = document.createElement('canvas'); cv.width = SZ; cv.height = SZ;
  const g = cv.getContext('2d')!, img = g.createImageData(SZ, SZ);
  for (let y = 0; y < SZ; y++) for (let x = 0; x < SZ; x++) {
    const i = ((SZ - 1 - y) * SZ + x) * 4, o = (y * SZ + x) * 4;
    for (let k = 0; k < 3; k++) img.data[o + k] = Math.min(255, Math.pow(px[i + k] / 255, 1 / 2.2) * 255);
    img.data[o + 3] = px[i + 3] > 20 ? 255 : 0;
  }
  // 1 px dark outline around the silhouette
  const a = new Uint8Array(SZ * SZ); for (let i = 0; i < SZ * SZ; i++) a[i] = img.data[i * 4 + 3] ? 1 : 0;
  for (let y = 1; y < SZ - 1; y++) for (let x = 1; x < SZ - 1; x++) {
    const i = y * SZ + x; if (a[i]) continue;
    if (a[i - 1] || a[i + 1] || a[i - SZ] || a[i + SZ]) { img.data[i * 4] = 8; img.data[i * 4 + 1] = 8; img.data[i * 4 + 2] = 14; img.data[i * 4 + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  const url = cv.toDataURL();
  cache.set(sp.id, url);
  return url;
}
