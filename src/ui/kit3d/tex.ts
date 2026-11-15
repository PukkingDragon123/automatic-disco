// kit3d textures and materials: clean, stylised pixel textures at 32 texels per metre (a 64 px tile is 2 m), nearest
// filtered, and Lambert materials that write the G-buffer. `worldUV(geo)` re-maps a geometry's UVs by planar
// projection on its dominant axis so every surface keeps the same texel density, whatever its size.
import * as THREE from 'three';
import { gbuf, F_EMIT } from '../../gfx/gbuf';

export type TexKind = 'brushed' | 'painted' | 'rubber' | 'panel' | 'grille' | 'grate' | 'plastic' | 'wood';
const TILE = 64; // px per 2 m
const TEX = new Map<string, THREE.CanvasTexture>();

function rng(seed: number) { let s = seed % 2147483647 || 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
/** a 32 px/m stylised tile of `kind` in tones of `color` */
export function tex32(color: number, kind: TexKind): THREE.CanvasTexture {
  const key = kind + ':' + color; let t = TEX.get(key); if (t) return t;
  const cv = document.createElement('canvas'); cv.width = cv.height = TILE; const g = cv.getContext('2d')!;
  const base = new THREE.Color(color), tone = (k: number) => '#' + base.clone().multiplyScalar(k).getHexString();
  const r = rng(13 + (color % 1000) * 7 + kind.length * 101), N = TILE;
  const px = (x: number, y: number, w: number, h: number, k: number) => { g.fillStyle = tone(k); g.fillRect(x, y, w, h); };
  px(0, 0, N, N, 1);
  if (kind === 'brushed' || kind === 'plastic') {
    for (let y = 0; y < N; y++) { let x = Math.floor(r() * 8); while (x < N) { const L = 4 + Math.floor(r() * 16); if (r() < (kind === 'plastic' ? 0.12 : 0.3)) px(x, y, L, 1, r() < 0.6 ? 1.07 : 0.94); x += L + 2 + Math.floor(r() * 8); } }
  } else if (kind === 'painted') {
    for (let i = 0; i < 26; i++) px(Math.floor(r() * N), Math.floor(r() * N), 1 + Math.floor(r() * 3), 1, r() < 0.5 ? 0.92 : 1.06);
    for (let i = 0; i < 5; i++) { const x = Math.floor(r() * N), y = Math.floor(r() * N); px(x, y, 2, 1, 0.75); px(x + 1, y + 1, 1, 1, 0.8); }
  } else if (kind === 'rubber') {
    for (let y = 0; y < N; y += 2) for (let x = (y / 2) % 2 ? 1 : 0; x < N; x += 4) px(x, y, 1, 1, 0.82);
  } else if (kind === 'panel') {
    for (let y = 0; y < N; y++) { let x = Math.floor(r() * 8); while (x < N) { const L = 6 + Math.floor(r() * 18); if (r() < 0.22) px(x, y, L, 1, 1.05); x += L + 3; } }
    // panel seams every 0.5 m, screw heads at the corners
    for (const s of [0, 16, 32, 48]) { px(0, s, N, 1, 0.62); px(0, s + 1, N, 1, 1.18); px(s, 0, 1, N, 0.62); px(s + 1, 0, 1, N, 1.18); }
    for (const a of [3, 19, 35, 51]) for (const b of [3, 12, 19, 28, 35, 44, 51, 60]) { if ((b - 3) % 16 && (b - 12) % 16) continue; px(a, b, 2, 2, 1.3); px(a + 1, b + 1, 1, 1, 0.7); }
  } else if (kind === 'grille') {
    for (let y = 0; y < N; y += 3) { px(0, y, N, 1, 0.35); px(0, y + 1, N, 1, 1.15); }
  } else if (kind === 'grate') {
    for (let y = 0; y < N; y += 4) for (let x = 0; x < N; x += 4) { px(x, y, 3, 3, 0.45); px(x, y, 3, 1, 0.3); }
  } else if (kind === 'wood') {
    for (let y = 0; y < N; y++) { let x = Math.floor(r() * 8); while (x < N) { const L = 4 + Math.floor(r() * 22); if (r() < 0.42) px(x, y, L, 1, r() < 0.7 ? 0.86 : 1.12); x += L + 2 + Math.floor(r() * 8); } }
  }
  t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; TEX.set(key, t); return t;
}

const MATS = new Map<string, THREE.Material>();
/** a textured, flat-shaded Lambert that writes the G-buffer (use with `worldUV` geometry) */
export function mat32(color: number, kind: TexKind, o: { emissive?: number; flag?: number } = {}): THREE.MeshLambertMaterial {
  const key = color + kind + (o.emissive ?? 0) + ':' + (o.flag ?? 1);
  let m = MATS.get(key) as THREE.MeshLambertMaterial | undefined; if (m) return m;
  m = gbuf(new THREE.MeshLambertMaterial({ map: tex32(color, kind), emissive: o.emissive ?? 0, flatShading: true }), o.flag ?? 1);
  MATS.set(key, m); return m;
}
/** a plain coloured Lambert (lit) or an emitter (unlit, flagged for bloom) */
export function solid(color: number, o: { emit?: boolean; transparent?: boolean; opacity?: number } = {}) {
  const key = 'solid' + color + (o.emit ? 'e' : '') + (o.opacity ?? 1);
  let m = MATS.get(key); if (m) return m;
  m = o.emit ? gbuf(new THREE.MeshBasicMaterial({ color, transparent: !!o.transparent, opacity: o.opacity ?? 1 }), o.transparent ? 0 : F_EMIT)
    : gbuf(new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: !!o.transparent, opacity: o.opacity ?? 1 }), o.transparent ? 0 : 1);
  MATS.set(key, m); return m;
}
/** planar UVs in metres / 2 (one tile per 2 m = 32 px/m), projected on each face's dominant axis */
export function worldUV<T extends THREE.BufferGeometry>(geo: T, scale = 0.5): T {
  const g = geo.index ? geo.toNonIndexed() as unknown as T : geo;
  g.computeVertexNormals();
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
/** a mesh of `geo` (world-UV'd) in `mat`, at `at`, casting and receiving shadows */
export function part(geo: THREE.BufferGeometry, mat: THREE.Material, at?: [number, number, number], parent?: THREE.Object3D, rot?: [number, number, number]) {
  const m = new THREE.Mesh(worldUV(geo), mat); if (at) m.position.set(...at); if (rot) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true; parent?.add(m); return m;
}
/** a canvas texture for labels and screens (nearest filtered, sRGB) */
export function canvasTex(w: number, h: number) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return { cv, g, tex: t };
}
/** shared palette for the kit (machined steel, gunmetal, painted desk, rubber, brass, glow colours) */
export const K3 = {
  steel: 0x8e969c, steelDark: 0x4a5258, gun: 0x2c3238, desk: 0x3a4148, deskLight: 0x59626b, rubber: 0x1b1d20, brass: 0xb8913e,
  cyan: 0x5fe8ff, amber: 0xffb347, green: 0x7dff9a, red: 0xff5a4a, white: 0xeef4f6,
};
