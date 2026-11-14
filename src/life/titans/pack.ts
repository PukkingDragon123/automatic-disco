// A titan model as plain arrays (for the build worker's reply and the IndexedDB cache), and back.
import * as THREE from 'three';
import type { Rig } from '../morph';

export interface TitanPayload {
  attrs: { name: string; array: ArrayBufferView; size: number }[];
  index: Uint32Array | Uint16Array;
  tex: Uint8Array; W: number; H: number;
  /** the rig patches the sculpt made: every bone's position, the lids' axes, the legs' poles */
  bones: number[]; lids: number[]; poles: number[];
  grove?: unknown;
}
export function packTitan(geo: THREE.BufferGeometry, tex: THREE.DataTexture, rig: Rig): TitanPayload {
  const attrs = Object.entries(geo.attributes).map(([name, a]) => ({ name, array: (a as THREE.BufferAttribute).array as ArrayBufferView, size: (a as THREE.BufferAttribute).itemSize }));
  const img = tex.image as { data: Uint8Array; width: number; height: number };
  return {
    attrs, index: geo.index!.array as Uint32Array | Uint16Array, tex: new Uint8Array(img.data), W: img.width, H: img.height,
    bones: rig.bones.flatMap((b) => b.pos), lids: rig.lids.flatMap((l) => l.axis), poles: rig.legs.flatMap((l) => l.pole ?? [0, 0, 0]),
    grove: geo.userData.grove,
  };
}
export const payloadBuffers = (p: TitanPayload): Transferable[] => [...new Set([...p.attrs.map((a) => a.array.buffer), p.index.buffer, p.tex.buffer])] as Transferable[];
export function unpackGeo(p: TitanPayload): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const a of p.attrs) {
    const arr = a.array as unknown as ArrayLike<number> & ArrayBufferView;
    g.setAttribute(a.name, a.name === 'skinIndex' ? new THREE.Uint16BufferAttribute(arr as unknown as Uint16Array, a.size) : new THREE.BufferAttribute(arr as unknown as Float32Array, a.size));
  }
  g.setIndex(new THREE.BufferAttribute(p.index, 1));
  g.computeBoundingSphere();
  if (p.grove) g.userData.grove = p.grove;
  return g;
}
export function unpackTex(p: TitanPayload): THREE.DataTexture {
  const tex = new THREE.DataTexture(p.tex, p.W, p.H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestMipmapNearestFilter; tex.generateMipmaps = true; tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  return tex;
}
/** apply the sculpt's rig patches to a rig built from the same design */
export function patchRig(rig: Rig, p: TitanPayload) {
  rig.bones.forEach((b, i) => { b.pos = [p.bones[i * 3], p.bones[i * 3 + 1], p.bones[i * 3 + 2]]; });
  rig.lids.forEach((l, i) => { l.axis = [p.lids[i * 3], p.lids[i * 3 + 1], p.lids[i * 3 + 2]]; });
  rig.legs.forEach((l, i) => { l.pole = [p.poles[i * 3], p.poles[i * 3 + 1], p.poles[i * 3 + 2]]; });
}
