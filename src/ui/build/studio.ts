// The planner's photo studio: every building rendered in full colour from a three-quarter view, under a key light,
// a cool fill and a rim, on its own small WebGL canvas (so the detail panel can turn the model without reading
// pixels back from the game's renderer). Tiles get cached stills; the detail panel gets a live turntable.
import * as THREE from 'three';
import { FDEFS, isBelt, type FKind } from '../../factory/defs';
import { modelFor, beltGeo } from '../../factory/models';
import { machineMaterial } from '../../factory/tex';

let R: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
let mat: THREE.Material | null = null;
const stills = new Map<string, string>();
const groups = new Map<string, { g: THREE.Group; c: THREE.Vector3; r: number }>();
let ok = true;

function init() {
  if (R || !ok) return R;
  try {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 192;
    R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    R.setPixelRatio(1);
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
    scene.add(new THREE.HemisphereLight(0xe6eef5, 0x3a3325, 1.6));
    const key = new THREE.DirectionalLight(0xfff1d8, 3.4); key.position.set(-4, 7, 5); scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb8d0, 0.9); fill.position.set(6, 2, 3); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xd8f0e0, 1.6); rim.position.set(2, 4, -7); scene.add(rim);
    mat = machineMaterial(1);
  } catch { ok = false; R = null; }
  return R;
}
function group(kind: FKind) {
  let e = groups.get(kind);
  if (e) return e;
  const def = FDEFS[kind];
  const g = new THREE.Group();
  if (isBelt(kind)) {
    for (let i = -1; i <= 1; i++) { const m = new THREE.Mesh(beltGeo('straight', kind === 'pipe'), mat!); m.position.z = i; g.add(m); }
  } else {
    const md = modelFor(kind, def.model, def.hooks?.model);
    g.add(new THREE.Mesh(md.base, mat!));
    for (const p of md.parts) { const m = new THREE.Mesh(p.geo, mat!); m.position.set(...p.pivot); g.add(m); }
  }
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  e = { g, c, r: Math.max(s.x, s.z, s.y * 1.15) * 0.5 + 0.12 };
  groups.set(kind, e);
  return e;
}
/** render a building into the studio canvas at w x h (css px times dpr), turned by `ang` */
function shoot(kind: FKind, w: number, h: number, ang: number): HTMLCanvasElement | null {
  const r = init(); if (!r || !FDEFS[kind]) return null;
  const e = group(kind);
  if (r.domElement.width !== w || r.domElement.height !== h) r.setSize(w, h, false);
  scene.add(e.g);
  e.g.rotation.y = ang;
  const d = e.r / Math.tan((cam.fov * Math.PI) / 360) * (w / h < 1.2 ? 1.25 : 1.08);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  cam.position.set(e.c.x + d * 0.62, e.c.y + d * 0.55, e.c.z + d * 0.78);
  cam.lookAt(e.c.x, e.c.y - e.r * 0.05, e.c.z);
  r.setClearColor(0x000000, 0); r.clear();
  r.render(scene, cam);
  scene.remove(e.g);
  return r.domElement;
}
/** a cached still (data URL) */
export function still(kind: FKind, w = 220, h = 150): string {
  const key = `${kind}|${w}x${h}`;
  const hit = stills.get(key); if (hit) return hit;
  const cv = shoot(kind, w, h, 0);
  if (!cv) return '';
  const url = cv.toDataURL('image/png');
  stills.set(key, url);
  return url;
}
export const hasStill = (kind: FKind, w = 220, h = 150) => stills.has(`${kind}|${w}x${h}`);
/** draw the turntable frame into a visible 2D canvas */
export function turntable(kind: FKind, into: HTMLCanvasElement, ang: number) {
  // rendered at twice the size and filtered down: clean edges without multisampling
  const cv = shoot(kind, into.width * 2, into.height * 2, ang);
  const g = into.getContext('2d'); if (!g) return;
  g.clearRect(0, 0, into.width, into.height);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  if (cv) g.drawImage(cv, 0, 0, into.width, into.height);
}
/** the same render as a phosphor silhouette (category keys): one green, lit planes lighter */
export function phosphor(kind: FKind, w: number, h: number, col: [number, number, number] = [127, 212, 138]): string {
  const key = `ph|${kind}|${w}x${h}|${col.join(',')}`;
  const hit = stills.get(key); if (hit) return hit;
  const cv = shoot(kind, w, h, 0); if (!cv) return '';
  const o = document.createElement('canvas'); o.width = w; o.height = h;
  const g = o.getContext('2d')!; g.drawImage(cv, 0, 0);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) { d[i + 3] = 0; continue; }
    const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    const k = l > 0.55 ? 1 : l > 0.32 ? 0.72 : l > 0.16 ? 0.48 : 0.3;
    d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
  }
  // a 1 px dark rim around the silhouette
  const a = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] ? 1 : 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!a[i] && (a[i - 1] || a[i + 1] || a[i - w] || a[i + w])) { d[i * 4] = 6; d[i * 4 + 1] = 14; d[i * 4 + 2] = 9; d[i * 4 + 3] = 255; } }
  g.putImageData(img, 0, 0);
  const url = o.toDataURL();
  stills.set(key, url);
  return url;
}
