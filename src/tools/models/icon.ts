// TOOL MODELS · ICONS. A high-quality still of a tool for 2D uses: the model in the UI kit's toon look at a clean 3/4
// view, rendered 4x supersampled in colour and in normal + depth, then resolved to pixel art on the CPU: coverage-
// tested pixels, ink contours where a nearer part overlaps a farther one, a warm lit lip on the upper-left silhouette,
// a cool RIM LIGHT down the right and over the top, shade along the bottom, every colour snapped to the master
// palette, and a bold black outline. Cached per (id, size, level).
//   renderIcon(root, size, o) -> HTMLCanvasElement     (any Object3D)
//   toolIcon(id, size?, o?) / toolIconURL(id, size?, o?)  (index.ts builds the tool, then calls renderIcon)
import * as THREE from 'three';
import { PALETTE, RAMPS } from '../../art/palette';

export interface IconOpts { yaw?: number; pitch?: number; ss?: number; outline?: number; rim?: number; snap?: boolean; margin?: number }
let R: THREE.WebGLRenderer | null = null, dead = false;
let ndMat: THREE.ShaderMaterial | null = null;
function gl(): THREE.WebGLRenderer | null {
  if (R || dead) return R;
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    R.setPixelRatio(1); R.outputColorSpace = THREE.LinearSRGBColorSpace;
    cv.addEventListener('webglcontextlost', (e) => e.preventDefault());
    ndMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vN; void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n; gl_FragColor = vec4(n * 0.5 + 0.5, gl_FragCoord.z); }',
      side: THREE.DoubleSide,
    });
  } catch (e) { console.warn('tool icons: no WebGL', e); dead = true; R = null; }
  return R;
}
const ch = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const PAL = PALETTE.map(ch);
const snapCache = new Map<number, number>();
function snap(r: number, g: number, b: number): [number, number, number] {
  const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let i = snapCache.get(key);
  if (i === undefined) {
    let bd = Infinity; i = 0;
    for (let k = 0; k < PAL.length; k++) { const [R2, G2, B2] = PAL[k], rm = (r + R2) / 2, dr = r - R2, dg = g - G2, db = b - B2, d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db; if (d < bd) { bd = d; i = k; } }
    snapCache.set(key, i);
  }
  const p = PAL[i]; return [p[0], p[1], p[2]];
}
const INK = ch(0x08090c), RIM = ch(RAMPS.snow[5]), RIM2 = ch(RAMPS.sky[5]);

/** render a model as an outlined pixel-art icon (size x size); the model is framed tight in the 3/4 view */
export function renderIcon(root: THREE.Object3D, size = 64, o: IconOpts = {}): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = out.height = size;
  const r = gl(); if (!r || !ndMat) return out;
  const ss = o.ss ?? 4, S = size * ss, ow = o.outline ?? (size >= 96 ? 2 : 1), margin = (o.margin ?? 2) + ow;
  const scene = new THREE.Scene(), pivot = new THREE.Group(); scene.add(pivot);
  const prevParent = root.parent; pivot.add(root);
  const yaw = o.yaw ?? -0.62, pitch = o.pitch ?? 0.42;
  pivot.rotation.set(0, yaw, 0); pivot.updateMatrixWorld(true);
  // the camera looks down the pitch; fit the visible parts tight on the view axes
  const fwd = new THREE.Vector3(0, -Math.sin(pitch), -Math.cos(pitch)), up = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch)), right = new THREE.Vector3(1, 0, 0);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const v = new THREE.Vector3();
  root.traverseVisible((n) => {
    const m = n as THREE.Mesh; if (!m.isMesh) return;
    const g = m.geometry; if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox!;
    for (let i = 0; i < 8; i++) { v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m.matrixWorld); const px = v.dot(right), py = v.dot(up), pz = v.dot(fwd); x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); z0 = Math.min(z0, pz); z1 = Math.max(z1, pz); }
  });
  if (!isFinite(x0)) { pivot.remove(root); prevParent?.add(root); return out; }
  const span = Math.max(x1 - x0, y1 - y0) * (size / (size - margin * 2)), cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
  const cam = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.01, 100);
  const dist = (z1 - z0) + 2;
  cam.position.copy(right.clone().multiplyScalar(cxm)).add(up.clone().multiplyScalar(cym)).add(fwd.clone().multiplyScalar(z0 - 1));
  cam.up.copy(up); cam.lookAt(cam.position.clone().add(fwd));
  cam.near = 0.5; cam.far = 1 + (z1 - z0) + 0.5; void dist;
  cam.updateProjectionMatrix();
  // colour, then normal + depth
  const rtC = new THREE.WebGLRenderTarget(S, S, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  let rtN = new THREE.WebGLRenderTarget(S, S, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  const col = new Uint8Array(S * S * 4); let nd: Float32Array | Uint8Array = new Float32Array(S * S * 4);
  r.setClearColor(0x000000, 0);
  r.setRenderTarget(rtC); r.clear(); r.render(scene, cam); r.readRenderTargetPixels(rtC, 0, 0, S, S, col);
  scene.overrideMaterial = ndMat;
  try { r.setRenderTarget(rtN); r.clear(); r.render(scene, cam); r.readRenderTargetPixels(rtN, 0, 0, S, S, nd as Float32Array); }
  catch { rtN.dispose(); rtN = new THREE.WebGLRenderTarget(S, S); nd = new Uint8Array(S * S * 4); r.setRenderTarget(rtN); r.clear(); r.render(scene, cam); r.readRenderTargetPixels(rtN, 0, 0, S, S, nd); }
  const ndK = nd instanceof Uint8Array ? 1 / 255 : 1;
  scene.overrideMaterial = null; r.setRenderTarget(null);
  rtC.dispose(); rtN.dispose();
  pivot.remove(root); prevParent?.add(root);
  // resolve the supersampled frame to pixels
  const N = size * size, A = new Uint8Array(N), C = new Float32Array(N * 3), Nn = new Float32Array(N * 3), D = new Float32Array(N).fill(1);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let n = 0, cr = 0, cg = 0, cb = 0, nx = 0, ny = 0, nz = 0, dmin = 1;
    for (let j = 0; j < ss; j++) for (let i = 0; i < ss; i++) {
      const sx = x * ss + i, sy = (size - 1 - y) * ss + (ss - 1 - j), k = (sy * S + sx) * 4;
      if (col[k + 3] < 128) continue;
      n++; cr += col[k]; cg += col[k + 1]; cb += col[k + 2];
      nx += nd[k] * ndK; ny += nd[k + 1] * ndK; nz += nd[k + 2] * ndK; dmin = Math.min(dmin, nd[k + 3] * ndK);
    }
    const p = y * size + x;
    if (n < ss * ss * 0.45) continue;
    A[p] = 1; C[p * 3] = cr / n; C[p * 3 + 1] = cg / n; C[p * 3 + 2] = cb / n;
    Nn[p * 3] = (nx / n) * 2 - 1; Nn[p * 3 + 1] = (ny / n) * 2 - 1; Nn[p * 3 + 2] = (nz / n) * 2 - 1; D[p] = dmin;
  }
  const img = new ImageData(size, size), d = img.data;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && A[y * size + x] === 1;
  const thr = 0.06, rimK = o.rim ?? 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = y * size + x; if (!A[p]) continue;
    let r0 = C[p * 3], g0 = C[p * 3 + 1], b0 = C[p * 3 + 2];
    // ink contours: a neighbour much nearer than this pixel
    let contour = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (op(X, Y) && D[Y * size + X] < D[p] - thr) { contour = true; break; } }
    const nX = Nn[p * 3], nY = Nn[p * 3 + 1];
    if (contour) { r0 = r0 * 0.14 + INK[0] * 0.86; g0 = g0 * 0.14 + INK[1] * 0.86; b0 = b0 * 0.14 + INK[2] * 0.86; }
    else {
      const eR = !op(x + 1, y) || !op(x + 1, y - 1), eT = !op(x, y - 1), eL = !op(x - 1, y), eB = !op(x, y + 1);
      const eR2 = size >= 96 && (!op(x + 2, y) || !op(x + 2, y - 2)), eT2 = size >= 96 && !op(x, y - 2);
      if ((eR || eR2) && nX > -0.25) { const k = (eR ? 0.62 : 0.34) * rimK, c = nY > 0.3 ? RIM2 : RIM; r0 += (c[0] - r0) * k; g0 += (c[1] - g0) * k; b0 += (c[2] - b0) * k; }
      else if ((eT || eT2) && nY > -0.2) { const k = (eT ? 0.42 : 0.2) * rimK, c = x > size * 0.5 ? RIM2 : RIM; r0 += (c[0] - r0) * k; g0 += (c[1] - g0) * k; b0 += (c[2] - b0) * k; }
      else if (eL) { r0 = r0 * 1.22 + 14; g0 = g0 * 1.18 + 10; b0 = b0 * 1.1 + 4; }
      else if (eB) { r0 *= 0.74; g0 *= 0.76; b0 *= 0.82; }
    }
    const [sr, sg, sb] = o.snap === false ? [r0, g0, b0] : snap(Math.min(255, r0), Math.min(255, g0), Math.min(255, b0));
    d[p * 4] = sr; d[p * 4 + 1] = sg; d[p * 4 + 2] = sb; d[p * 4 + 3] = 255;
  }
  // the outline, ow pixels thick (4-way, then 8-way for the outer ring)
  let mask = A.slice();
  for (let w = 0; w < ow; w++) {
    const next = mask.slice(), eight = w > 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = y * size + x; if (mask[p]) continue;
      let hit = false;
      for (let j = -1; j <= 1 && !hit; j++) for (let i = -1; i <= 1; i++) { if (!i && !j) continue; if (!eight && i && j) continue; const X = x + i, Y = y + j; if (X >= 0 && Y >= 0 && X < size && Y < size && mask[Y * size + X]) { hit = true; break; } }
      if (hit) { next[p] = 1; d[p * 4] = INK[0]; d[p * 4 + 1] = INK[1]; d[p * 4 + 2] = INK[2]; d[p * 4 + 3] = 255; }
    }
    mask = next;
  }
  out.getContext('2d')!.putImageData(img, 0, 0);
  return out;
}
/** release the icon renderer (after baking a set) */
export function disposeIconRenderer() { R?.dispose(); R?.forceContextLoss(); R = null; }

// the cache and the tool entry points are bound by index.ts (it owns the builder)
const cache = new Map<string, HTMLCanvasElement>();
let builder: ((id: string, level: number) => THREE.Object3D | null) | null = null;
export function bindIconBuilder(f: (id: string, level: number) => THREE.Object3D | null) { builder = f; }
/** a tool's icon (cached): size px square, level 1..3 shows its upgrades */
export function toolIcon(id: string, size = 64, o: IconOpts & { level?: number } = {}): HTMLCanvasElement | null {
  const key = `${id}|${size}|${o.level ?? 1}|${o.yaw ?? ''}|${o.pitch ?? ''}|${o.outline ?? ''}`;
  const hit = cache.get(key); if (hit) return hit;
  const m = builder?.(id, o.level ?? 1); if (!m) return null;
  const cv = renderIcon(m, size, o);
  cache.set(key, cv);
  return cv;
}
export const toolIconURL = (id: string, size = 64, o: IconOpts & { level?: number } = {}) => toolIcon(id, size, o)?.toDataURL() ?? '';
