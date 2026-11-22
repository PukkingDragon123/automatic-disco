// Portraits for the subtitle strip and the bond meter: the person's own rig (never a drawn face), rendered once head
// and shoulders into a small target, cut to whole pixels at half resolution, lit from the upper left, with a 1 px ink
// outline round the silhouette (Limbophobia's rule: every face comes from HumanRig).
import * as THREE from 'three';
import { buildCrewModel } from '../ship/crew/model';
import type { CrewId } from '../ship/crew/roster';
import { registerGuide, GUIDE_ID } from './guide';

const cache = new Map<string, HTMLCanvasElement>();
let R: THREE.WebGLRenderer | null = null;
export function portraitRenderer(r: THREE.WebGLRenderer) { R = r; }
const SZ = 72, HALF = 36;
/** the person's head-and-shoulders portrait (HALF x HALF art px; show it at 2x or 3x) */
export function portrait(id: string): HTMLCanvasElement | null {
  const key = id; const hit = cache.get(key); if (hit) return hit;
  if (!R) return null;
  const crewId = (id === 'guide' ? GUIDE_ID : id) as CrewId;
  if (id === 'guide') registerGuide();
  let model;
  try { model = buildCrewModel(crewId, { scale: 1 }); } catch (e) { console.warn('portrait', id, e); return null; }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff2e0, 0x40362c, 2.4));
  const key1 = new THREE.DirectionalLight(0xfff0d8, 3.2); key1.position.set(-1.5, 2.2, 2.5); scene.add(key1);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 1.6); rim.position.set(2, 1, -2); scene.add(rim);
  scene.add(model.root);
  model.rig.setExpression('neutral');
  for (let i = 0; i < 4; i++) model.update(0.016, { speed: 0 } as never);
  model.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.root), top = box.max.y;
  const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
  const yaw = 0.42;
  cam.position.set(Math.sin(yaw) * 1.5, top - 0.2, Math.cos(yaw) * 1.5); cam.lookAt(0, top - 0.24, 0);
  const rt = new THREE.WebGLRenderTarget(SZ, SZ, { type: THREE.UnsignedByteType, colorSpace: THREE.SRGBColorSpace });
  const prev = R.getRenderTarget(), pc = new THREE.Color(); R.getClearColor(pc); const pa = R.getClearAlpha();
  R.setRenderTarget(rt); R.setClearColor(0x000000, 0); R.clear(); R.render(scene, cam);
  const px = new Uint8Array(SZ * SZ * 4); R.readRenderTargetPixels(rt, 0, 0, SZ, SZ, px);
  R.setRenderTarget(prev); R.setClearColor(pc, pa); rt.dispose();
  model.dispose();
  // down to whole art pixels (2x2 boxes), then the ink rim
  const cv = document.createElement('canvas'); cv.width = HALF; cv.height = HALF;
  const g = cv.getContext('2d')!, img = g.createImageData(HALF, HALF);
  for (let y = 0; y < HALF; y++) for (let x = 0; x < HALF; x++) {
    let r = 0, gg = 0, b = 0, a = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const k = ((SZ - 1 - (y * 2 + j)) * SZ + x * 2 + i) * 4; if (px[k + 3] > 30) { r += px[k]; gg += px[k + 1]; b += px[k + 2]; a++; } }
    const o = (y * HALF + x) * 4;
    if (a >= 2) { const q = (v: number) => Math.round(v / a / 12) * 12; img.data[o] = q(r); img.data[o + 1] = q(gg); img.data[o + 2] = q(b); img.data[o + 3] = 255; }
  }
  const al = (x: number, y: number) => x >= 0 && y >= 0 && x < HALF && y < HALF && img.data[(y * HALF + x) * 4 + 3] > 0;
  const rim1: number[] = [];
  for (let y = 0; y < HALF; y++) for (let x = 0; x < HALF; x++) if (!al(x, y) && (al(x + 1, y) || al(x - 1, y) || al(x, y + 1) || al(x, y - 1))) rim1.push(y * HALF + x);
  for (const i of rim1) { img.data[i * 4] = 8; img.data[i * 4 + 1] = 9; img.data[i * 4 + 2] = 12; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  cache.set(key, cv);
  return cv;
}
