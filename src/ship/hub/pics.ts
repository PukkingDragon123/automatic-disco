// The ship's real pictures: posters, prints and photos made from real imagery (NASA and Wikimedia public-domain
// photographs and paintings) and from renders of the game's own assets (the ship, the pod, the planet, the crew),
// composed offline as physical things (poster paper sun-faded at the top, folded in four, taped, a corner torn;
// photo prints with a white border) by the build script recorded in CREDITS.md. Files are named <name>_<W>x<H>.png.
// Shown nearest-filtered: they are prints in a pixel-art world.
import * as THREE from 'three';
import { gbuf } from '../../gfx/gbuf';

const FILES = import.meta.glob('./assets/pics/*.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const BY = new Map<string, { url: string; w: number; h: number }>();
for (const [k, url] of Object.entries(FILES)) {
  const m = /\/([a-z0-9_]+)_(\d+)x(\d+)\.png$/.exec(k);
  if (m) BY.set(m[1], { url, w: Number(m[2]), h: Number(m[3]) });
}
const TEX = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();
/** a picture by name: its texture (loading) and its aspect (w / h), or null if there is none */
export function pic(name: string): { tex: THREE.Texture; aspect: number } | null {
  const f = BY.get(name); if (!f) return null;
  let t = TEX.get(name);
  if (!t) {
    t = loader.load(f.url);
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
    TEX.set(name, t);
  }
  return { tex: t, aspect: f.w / f.h };
}
export const hasPic = (name: string) => BY.has(name);
export const picURL = (name: string) => BY.get(name)?.url ?? null;

/** a glass glint: a soft diagonal band of light (added over a framed print) */
let glintT: THREE.Texture | null = null;
export function glintMat() {
  if (!glintT) {
    const W = 32, d = new Uint8Array(W * W * 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const u = (x + y) / (2 * W), a = Math.max(0, 1 - Math.abs(u - 0.32) / 0.07) * 0.55 + Math.max(0, 1 - Math.abs(u - 0.45) / 0.025) * 0.35;
      const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(Math.min(1, a) * 255);
    }
    glintT = new THREE.DataTexture(d, W, W); glintT.needsUpdate = true; glintT.magFilter = THREE.LinearFilter;
  }
  const m = new THREE.MeshBasicMaterial({ map: glintT, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
  gbuf(m, 0);
  return m;
}
