// Real-world props: Poly Haven CC0 models restyled with the lowpix converter ("painted": decimated, re-unwrapped,
// the source textures transferred and posterised into painterly value bands with cool shadows and warm lights),
// shipped as small .glb files beside this module (bundled as URLs; the single-file build inlines them). Each model
// is loaded once; placements take clones that share its geometry and a lit, gbuf'd material.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gbuf } from '../../gfx/gbuf';

// the pixel-hd restyles (lowpix --style pixel-hd: palette-quantised, outlined, 96 texels per metre) win over the
// older painted ones
const PX = import.meta.glob('./assets/px/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const byId = new Map<string, string>();
for (const [p, u] of Object.entries(PX)) byId.set(p.replace(/^.*\/(.*)\.glb$/, '$1'), u);
export const MODEL_IDS = [...byId.keys()];

interface Loaded { root: THREE.Object3D; size: THREE.Vector3 }
const cache = new Map<string, Promise<Loaded | null>>();
let loader: GLTFLoader | null = null;

function load(id: string): Promise<Loaded | null> {
  let p = cache.get(id);
  if (p) return p;
  const url = byId.get(id);
  if (!url) { p = Promise.resolve(null); cache.set(id, p); return p; }
  loader ??= new GLTFLoader();
  p = loader.loadAsync(url).then((gl) => {
    const root = gl.scene;
    root.traverse((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return;
      const src = m.material as THREE.MeshBasicMaterial;
      const map = src.map ?? null;
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapLinearFilter; map.needsUpdate = true; }
      const mat = new THREE.MeshLambertMaterial({ map, color: 0xffffff, side: src.side ?? THREE.FrontSide, alphaTest: src.alphaTest || 0, transparent: false });
      gbuf(mat, 1);
      m.material = mat; m.castShadow = true; m.receiveShadow = true;
      src.dispose();
    });
    const bb = new THREE.Box3().setFromObject(root), size = bb.getSize(new THREE.Vector3());
    return { root, size };
  }).catch((e) => { console.warn('hub model', id, e); return null; });
  cache.set(id, p);
  return p;
}
export function preload(ids: string[]) { return Promise.all(ids.map(load)); }

export interface ModelPlace { x: number; y?: number; z: number; ry?: number; rx?: number; rz?: number; s?: number; tint?: number }
/**
 * Place a model (async): returns its holder group right away (positioned), filled when the file arrives. The
 * model stands on y = 0 of the holder and faces +z (lowpix's convention). Unknown ids leave the holder empty.
 */
export function placeModel(parent: THREE.Object3D, id: string, o: ModelPlace, envMap?: THREE.Texture | null): THREE.Group {
  const g = new THREE.Group(); g.name = 'ph:' + id;
  g.position.set(o.x, o.y ?? 0, o.z); g.rotation.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0); g.scale.setScalar(o.s ?? 1);
  parent.add(g);
  load(id).then((l) => {
    if (!l || !g.parent) return;
    const c = l.root.clone(true);
    if (envMap || o.tint !== undefined) c.traverse((x) => {
      const m = x as THREE.Mesh; if (!m.isMesh) return;
      const mm = (m.material as THREE.MeshLambertMaterial);
      if (o.tint !== undefined) { const t = mm.clone(); t.color.setHex(o.tint); gbuf(t, 1); m.material = t; }
    });
    g.add(c);
  });
  return g;
}
export const hasModel = (id: string) => byId.has(id);
