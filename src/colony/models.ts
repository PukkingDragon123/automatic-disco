// Models made with the user's lowpix tool (tools/lowpix/*.json -> public/models/colony/*.glb): painted pixel-art
// atlases (nearest filtered), restyled into the game's lighting (Lambert over the painted light) and the G-buffer.
// `lowpixModel(name, o)` resolves to a fresh clone (null if the file is missing), scaled and centred as asked.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { gbuf, type GFlag } from '../gfx/gbuf';

const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Group | null>>();
function load(name: string) {
  let p = cache.get(name);
  if (!p) {
    p = new Promise((res) => loader.load(`${import.meta.env.BASE_URL ?? '/'}models/colony/${name}.glb`, (g) => res(g.scene as THREE.Group), undefined, (e) => { console.warn('lowpix model', name, e); res(null); }));
    cache.set(name, p);
  }
  return p;
}
export interface ModelOpts {
  /** scale so the model's x extent is this many metres (or its y extent with `height`) */
  width?: number; height?: number; scale?: number;
  /** 'center': bounding-box centre at the origin; 'ground': centred in x/z with its lowest point at y = 0 */
  origin?: 'center' | 'ground' | 'none';
  flag?: GFlag | number;
  /** a lit look (Lambert); false keeps it unlit (its painted light only) */
  lit?: boolean;
}
export async function lowpixModel(name: string, o: ModelOpts = {}): Promise<THREE.Group | null> {
  const src = await load(name); if (!src) return null;
  const root = src.clone(true);
  root.traverse((n) => {
    const m = n as THREE.Mesh; if (!m.isMesh) return;
    const old = m.material as THREE.MeshStandardMaterial;
    const map = old.map; if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestMipmapNearestFilter; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.needsUpdate = true; }
    const mat = o.lit === false ? new THREE.MeshBasicMaterial({ map, side: old.side, transparent: old.transparent, alphaTest: old.alphaTest || 0.5 })
      : new THREE.MeshLambertMaterial({ map, side: old.side, transparent: old.transparent, alphaTest: old.alphaTest || 0.5 });
    gbuf(mat, o.flag ?? 1);
    m.material = mat; m.castShadow = true; m.receiveShadow = true;
  });
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = o.scale ?? (o.width ? o.width / size.x : o.height ? o.height / size.y : 1);
  const holder = new THREE.Group(); holder.add(root);
  root.scale.setScalar(k);
  if (o.origin === 'center') root.position.set(-c.x * k, -c.y * k, -c.z * k);
  else if (o.origin === 'ground') root.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  return holder;
}
/** every node whose name starts with one of the prefixes (lowpix names nodes by part id; mirrors get `_mirror`) */
export function nodes(root: THREE.Object3D, ...prefix: string[]) { const out: THREE.Object3D[] = []; root.traverse((n) => { if (prefix.some((p) => n.name === p || n.name.startsWith(p + '_mirror') || n.name.startsWith(p + '_'))) out.push(n); }); return out; }
