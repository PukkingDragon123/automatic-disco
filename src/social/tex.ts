// Small pixel textures for the people and places the social layer adds (the guide's camp, the pod interior): painted
// with the UI kit's Px primitives at 32 px per metre (V6: clean, stylised, palette ramps), nearest-filtered, and
// materials that write the G-buffer so the post pipeline outlines and lights them like everything else.
import * as THREE from 'three';
import { Px, P, hash, bayer, at, INK, mixHex, type Ramp } from '../ui/kit/px';
import { gbuf, F_EMIT } from '../gfx/gbuf';

export { Px, P, hash, bayer, at, INK, mixHex };
const cache = new Map<string, THREE.CanvasTexture>();
/** a texture painted once per key: w x h texels, repeat (rx, ry) */
export function pxTex(key: string, w: number, h: number, paint: (p: Px) => void, rx = 1, ry = 1): THREE.CanvasTexture {
  let t = cache.get(key);
  if (!t) {
    const p = new Px(w, h); paint(p);
    t = new THREE.CanvasTexture(p.canvas());
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
    cache.set(key, t);
  }
  if (rx !== 1 || ry !== 1) { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; }
  return t;
}
/** a lit material over a texture (outlined by the post pass) */
export function texMat(map: THREE.Texture | null, color = 0xffffff, o: { side?: THREE.Side; emit?: boolean; flag?: number } = {}) {
  const m = new THREE.MeshLambertMaterial({ map, color, side: o.side ?? THREE.FrontSide });
  return gbuf(m, o.flag ?? 1);
}
export function glowMat(color: number, k = 1.6) { return gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) }), F_EMIT); }
/** fill a buffer with a ramp-tone field: f(x, y) -> ramp step */
export function field(p: Px, r: Ramp, f: (x: number, y: number) => number) { for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.set(x, y, at(r, Math.round(f(x, y)))); }

// ------------------------------------------------------------------ the common surfaces
/** woven canvas (tarps, bedrolls): a twill weave, sun-bleached streaks, a few patches and stitches */
export const canvasTex = (tint: Ramp = P.olive, seed = 1) => pxTex('canvas' + seed + tint[3], 64, 64, (p) => {
  field(p, tint, (x, y) => 3 + (((x + y) & 3) === 0 ? -1 : 0) + ((x & 1) && (y & 1) ? 1 : 0) + (hash(x >> 3, y, seed) > 0.85 ? 1 : 0) - (hash(x, y >> 4, seed + 1) > 0.9 ? 1 : 0));
  // a patch with a stitched border
  const px = 8 + Math.floor(hash(seed, 2) * 30), py = 10 + Math.floor(hash(seed, 3) * 30);
  for (let j = 0; j < 14; j++) for (let i = 0; i < 18; i++) p.set(px + i, py + j, at(P.clay, 2 + ((i + j) & 1) + (hash(i, j, 9) > 0.8 ? 1 : 0)));
  for (let i = 0; i < 18; i += 2) { p.set(px + i, py, at(P.bone, 5)); p.set(px + i, py + 13, at(P.bone, 5)); }
  for (let j = 0; j < 14; j += 2) { p.set(px, py + j, at(P.bone, 5)); p.set(px + 17, py + j, at(P.bone, 5)); }
});
/** worn hull plate with seams, rivets and streaks of rust (wreckage, the pod's walls) */
export const hullTex = (base: Ramp = P.steel, seed = 1, paint = -1) => pxTex('hull' + seed + base[2] + paint, 64, 64, (p) => {
  field(p, base, (x, y) => 3 + (hash(Math.floor(x / 9), y, seed) > 0.86 ? 1 : 0) + (bayer(x, y) * (y / 64) > 0.6 ? -1 : 0));
  if (paint >= 0) for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (y > 20 && y < 34 && hash(x >> 1, y >> 1, seed + 5) > 0.08) p.set(x, y, mixHex(paint, 0, (y === 21 ? -0.2 : y === 33 ? 0.35 : 0) + (hash(x, y, 3) > 0.9 ? 0.2 : 0)));
  for (let x = 0; x < 64; x++) { p.set(x, 0, at(base, 0)); p.set(x, 1, at(base, 5)); }
  for (let y = 0; y < 64; y++) { p.set(0, y, at(base, 0)); p.set(1, y, at(base, 5)); }
  for (let x = 6; x < 64; x += 10) { p.set(x, 5, at(base, 6)); p.set(x + 1, 6, at(base, 1)); p.set(x, 58, at(base, 6)); p.set(x + 1, 59, at(base, 1)); }
  // rust streaks running down from the rivets
  for (let k = 0; k < 6; k++) { const x = Math.floor(hash(k, seed, 7) * 60) + 2, L = 6 + Math.floor(hash(k, seed, 8) * 20); for (let y = 7; y < 7 + L; y++) if (hash(x, y, 2) > 0.3) p.set(x, y, at(P.rust, 2 + (y < 10 ? 1 : 0))); }
});
/** rough stone */
export const stoneTex = (seed = 1) => pxTex('stone' + seed, 32, 32, (p) => field(p, P.stone, (x, y) => 3 + (hash(x >> 1, y >> 1, seed) > 0.7 ? 1 : 0) - (hash(x >> 2, y >> 2, seed + 1) > 0.75 ? 1 : 0) + (bayer(x, y) > 0.9 ? 1 : 0)));
/** bark and end grain */
export const barkTex = (seed = 1) => pxTex('bark' + seed, 32, 32, (p) => field(p, P.soil, (x, y) => 2 + ((x + Math.floor(Math.sin(y * 0.4 + seed) * 1.5)) % 5 === 0 ? -1 : 0) + (hash(x, y >> 2, seed) > 0.8 ? 1 : 0)));
/** packed dirt (the camp floor, the scorched skid) */
export const dirtTex = (seed = 1) => pxTex('dirt' + seed, 64, 64, (p) => field(p, P.soil, (x, y) => 3 + (hash(x >> 1, y >> 1, seed) > 0.75 ? 1 : 0) - (hash(x >> 2, y >> 2, seed + 4) > 0.8 ? 1 : 0) + (hash(x, y, 9) > 0.97 ? 2 : 0)));
void INK;
