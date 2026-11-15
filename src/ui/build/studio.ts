// The planner's photo studio: every building rendered in full colour from a three-quarter view, under a key light,
// a cool fill and a rim, with the game's own renderer into an off-screen target (no second WebGL context), then
// reduced to pixel art: shot at twice the size, filtered down, quantised to a few tones per channel with a dark rim
// so the render sits with the hand-painted hardware around it. Tiles get cached stills; the detail panel gets a
// turntable whose frames are shot one per tick and then replayed as images.
import * as THREE from 'three';
import { FDEFS, type FKind } from '../../factory/defs';
import { liveModel } from './vignette';

let R: THREE.WebGLRenderer | null = null;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 200);
const stills = new Map<string, string>();
const groups = new Map<string, { g: THREE.Group; c: THREE.Vector3; r: number }>();
const targets = new Map<string, THREE.WebGLRenderTarget>();

/** hand the studio the game's renderer (the factory UI does, once) */
export function initStudio(r: THREE.WebGLRenderer) {
  if (R) return;
  R = r;
  scene.add(new THREE.HemisphereLight(0xe6eef5, 0x3a3325, 1.5));
  const key = new THREE.DirectionalLight(0xfff1d8, 3.0); key.position.set(-4, 7, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fb8d0, 0.8); fill.position.set(6, 2, 3); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xd8f0e0, 1.4); rim.position.set(2, 4, -7); scene.add(rim);
}
function group(kind: FKind) {
  let e = groups.get(kind);
  if (e) return e;
  // the same live model the vignettes use (a lowpix .glb, a container with a load, or the factory's own model);
  // when a .glb arrives later the stills of that kind are shot again
  const lv = liveModel(kind, () => { groups.delete(kind); for (const k of [...stills.keys()]) if (k.startsWith(kind + '|') || k.startsWith('ph|' + kind + '|')) stills.delete(k); });
  const g = new THREE.Group(); g.add(lv.root);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  e = { g, c, r: Math.max(s.x, s.z, s.y * 1.15) * 0.5 + 0.12 };
  groups.set(kind, e);
  return e;
}
const _clear = new THREE.Color();
/** render a building at w x h, turned by `ang`, into a fresh 2D canvas (null when the studio is not set up) */
function shoot(kind: FKind, w: number, h: number, ang: number): HTMLCanvasElement | null {
  const r = R; if (!r || !FDEFS[kind]) return null;
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  const key = w + 'x' + h;
  let rt = targets.get(key);
  if (!rt) { rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType }); rt.texture.colorSpace = THREE.SRGBColorSpace; targets.set(key, rt); }
  const e = group(kind);
  scene.add(e.g);
  e.g.rotation.y = ang;
  const d = e.r / Math.tan((cam.fov * Math.PI) / 360) * (w / h < 1.2 ? 1.25 : 1.08);
  cam.aspect = w / h; cam.updateProjectionMatrix();
  cam.position.set(e.c.x + d * 0.62, e.c.y + d * 0.55, e.c.z + d * 0.78);
  cam.lookAt(e.c.x, e.c.y - e.r * 0.05, e.c.z);
  const prev = r.getRenderTarget(), pc = r.getClearColor(_clear).getHex(), pa = r.getClearAlpha();
  const px = new Uint8Array(w * h * 4);
  try {
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear();
    r.render(scene, cam);
    r.readRenderTargetPixels(rt, 0, 0, w, h, px);
  } catch { return null; } finally { r.setRenderTarget(prev); r.setClearColor(pc, pa); scene.remove(e.g); }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true })!, img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  g.putImageData(img, 0, 0);
  return cv;
}
/** the three passes the offline painter reads (colour, a flat id per mesh, view-space normals), as PNG data URLs.
 *  src/ui/build/craft/paint_buildings.py repaints them with lowpix's brush into the planner's illustrations. */
export function passes(kind: FKind, w: number, h: number): { color: string; id: string; normal: string } | null {
  const e = group(kind);
  const meshes: THREE.Mesh[] = [];
  e.g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const keep = meshes.map((m) => m.material);
  const url = (cv: HTMLCanvasElement | null) => (cv ? cv.toDataURL('image/png') : '');
  const color = url(shoot(kind, w, h, 0));
  meshes.forEach((m, i) => { const c = new THREE.Color().setHSL(((i * 0.618034) % 1), 0.9, 0.3 + ((i * 7) % 5) * 0.1); m.material = new THREE.MeshBasicMaterial({ color: c }); });
  const id = url(shoot(kind, w, h, 0));
  meshes.forEach((m) => { m.material = new THREE.MeshNormalMaterial(); });
  const normal = url(shoot(kind, w, h, 0));
  meshes.forEach((m, i) => { (m.material as THREE.Material).dispose(); m.material = keep[i]; });
  return color ? { color, id, normal } : null;
}
/** halve a shot into pixel art: box-filter 2x2, a few tones per channel, hard alpha, a 1 px dark rim */
function pixelate(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const s = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w * 2, h * 2).data;
  const o = document.createElement('canvas'); o.width = w; o.height = h;
  const g = o.getContext('2d', { willReadFrequently: true })!, img = g.createImageData(w, h), d = img.data;
  const q = (v: number) => Math.round(Math.round((v / 255) * 15) * 17);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, gg = 0, b = 0, a = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const k = ((y * 2 + j) * w * 2 + x * 2 + i) * 4; if (s[k + 3] > 40) { r += s[k]; gg += s[k + 1]; b += s[k + 2]; a++; } }
    const k = (y * w + x) * 4;
    if (a >= 2) { d[k] = q(r / a); d[k + 1] = q(gg / a); d[k + 2] = q(b / a); d[k + 3] = 255; }
  }
  const al = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) al[i] = d[i * 4 + 3] ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (al[i]) continue;
    if ((x > 0 && al[i - 1]) || (x < w - 1 && al[i + 1]) || (y > 0 && al[i - w]) || (y < h - 1 && al[i + w])) { d[i * 4] = 8; d[i * 4 + 1] = 12; d[i * 4 + 2] = 10; d[i * 4 + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  return o;
}
/** a cached still (data URL) at w x h art pixels (shown at an integer scale) */
export function still(kind: FKind, w = 110, h = 70): string {
  const key = `${kind}|${w}x${h}`;
  const hit = stills.get(key); if (hit) return hit;
  const cv = shoot(kind, w * 2, h * 2, 0);
  if (!cv) return '';
  const url = pixelate(cv, w, h).toDataURL('image/png');
  stills.set(key, url);
  return url;
}
/** the detail turntable: frames are shot one per call until the turn is complete, then replayed */
const FRAMES = 36;
let reel: { kind: FKind; w: number; h: number; f: (HTMLCanvasElement | null)[] } | null = null;
export function turntable(kind: FKind, into: HTMLCanvasElement, ang: number) {
  const w = into.width, h = into.height;
  if (!reel || reel.kind !== kind || reel.w !== w || reel.h !== h) reel = { kind, w, h, f: new Array(FRAMES).fill(null) };
  const i = ((Math.round((ang / (Math.PI * 2)) * FRAMES) % FRAMES) + FRAMES) % FRAMES;
  if (!reel.f[i]) { const big = shoot(kind, w * 2, h * 2, (i / FRAMES) * Math.PI * 2); if (big) reel.f[i] = pixelate(big, w, h); }
  const fr = reel.f[i] ?? reel.f.find((x) => !!x) ?? null;
  const g = into.getContext('2d'); if (!g) return;
  g.clearRect(0, 0, w, h);
  if (fr) g.drawImage(fr, 0, 0);
}
/** the render as a phosphor silhouette (category keys, node cards): one green, lit planes lighter */
export function phosphor(kind: FKind, w: number, h: number, col: [number, number, number] = [127, 212, 138]): string {
  const key = `ph|${kind}|${w}x${h}|${col.join(',')}`;
  const hit = stills.get(key); if (hit) return hit;
  const big = shoot(kind, w * 2, h * 2, 0); if (!big) return '';
  const cv = pixelate(big, w, h);
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) { d[i + 3] = 0; continue; }
    if (d[i] === 8 && d[i + 1] === 12) { d[i] = 4; d[i + 1] = 12; d[i + 2] = 7; continue; }
    const l = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
    const k = l > 0.55 ? 1 : l > 0.32 ? 0.72 : l > 0.16 ? 0.48 : 0.3;
    d[i] = col[0] * k; d[i + 1] = col[1] * k; d[i + 2] = col[2] * k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const url = cv.toDataURL();
  stills.set(key, url);
  return url;
}
