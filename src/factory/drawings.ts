// Catalogue plates: each machine is rendered once from a three-quarter view and printed as a line engraving on the
// catalogue's paper: three inks by how much light the plane catches, hatching in the mid tone, a hard outline, the
// paper showing through. Kept as data URLs.
import * as THREE from 'three';
import { FDEFS, isBelt, type FKind } from './defs';
import { modelFor, beltGeo } from './models';
import { machineMaterial } from './tex';
import { RAMPS } from '../art/palette';

const W = 120, H = 84;
const cache = new Map<string, string>();
let rt: THREE.WebGLRenderTarget | null = null;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x403828, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 3.2); sun.position.set(-3, 5, 2); scene.add(sun);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
let mat: THREE.Material | null = null;
const P = RAMPS.paper, INK = RAMPS.ink;
const hexRGB = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

export function drawing(renderer: THREE.WebGLRenderer, kind: FKind): string {
  const hit = cache.get(kind); if (hit) return hit;
  rt ??= new THREE.WebGLRenderTarget(W * 2, H * 2, { type: THREE.UnsignedByteType });
  mat ??= machineMaterial(0);
  const def = FDEFS[kind];
  const geo = isBelt(kind) ? beltGeo('straight', kind === 'pipe') : modelFor(kind, def.model, def.hooks?.model).base;
  const parts = isBelt(kind) ? [] : modelFor(kind, def.model, def.hooks?.model).parts;
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geo, mat));
  for (const p of parts) { const m = new THREE.Mesh(p.geo, mat); m.position.set(...p.pivot); grp.add(m); }
  scene.add(grp);
  grp.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(grp), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const R = Math.max(s.x, s.y * 1.2, s.z) * 0.62 + 0.15;
  cam.left = -R * (W / H); cam.right = R * (W / H); cam.top = R; cam.bottom = -R; cam.updateProjectionMatrix();
  cam.position.set(c.x + 6, c.y + 4.5, c.z + 7); cam.lookAt(c);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, cam);
  const px = new Uint8Array(W * 2 * H * 2 * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, W * 2, H * 2, px);
  renderer.setRenderTarget(prev);
  scene.remove(grp);
  // downsample 2x2 -> 1 and print it
  const lum = new Float32Array(W * H), a = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let l = 0, n = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const k = (((H * 2 - 1) - (y * 2 + j)) * W * 2 + x * 2 + i) * 4; if (px[k + 3] > 30) { l += (px[k] * 0.3 + px[k + 1] * 0.59 + px[k + 2] * 0.11) / 255; n++; } }
    if (n >= 2) { a[y * W + x] = 1; lum[y * W + x] = Math.pow(l / n, 1 / 2.2); }
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!, img = g.createImageData(W, H);
  const put = (i: number, c: number) => { const [r, gg, b] = hexRGB(c); img.data[i * 4] = r; img.data[i * 4 + 1] = gg; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!a[i]) {
      // outline: paper next to the drawing gets ink
      if ((x > 0 && a[i - 1]) || (x < W - 1 && a[i + 1]) || (y > 0 && a[i - W]) || (y < H - 1 && a[i + W])) put(i, INK[1]);
      continue;
    }
    const l = lum[i];
    // edges inside the drawing: where the tone jumps, a fine line
    const e = x > 0 && a[i - 1] && Math.abs(lum[i - 1] - l) > 0.2 || y > 0 && a[i - W] && Math.abs(lum[i - W] - l) > 0.2;
    if (e) { put(i, INK[2]); continue; }
    if (l > 0.6) put(i, P[5]);
    else if (l > 0.42) put(i, (x + y) % 4 === 0 ? P[2] : P[5]);
    else if (l > 0.26) put(i, (x - y) % 3 === 0 ? INK[2] : (x + y) % 2 ? P[3] : P[4]);
    else put(i, (x + y) % 2 ? INK[2] : P[1]);
  }
  g.putImageData(img, 0, 0);
  const url = cv.toDataURL();
  cache.set(kind, url);
  return url;
}
