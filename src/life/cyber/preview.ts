// CYBORG WORKERS: a spinning preview of one robotic part for the lab's fitting cards. The part is built onto the
// specimen exactly as it will be fitted (so a hydraulic leg is sized to that animal's legs, a collar to its neck),
// but only the part's own pieces are charted, painted and emitted, then centred at unit radius.
import type * as THREE from 'three';
import type { SpeciesModel } from '../creatureMesh';
import { buildRig, type V3 } from '../morph';
import type { Design } from '../design';
import { Body } from '../anatomy/core';
import { isAnatomy, sculptAnatomy } from '../titans/builders';
import { partGeometry } from '../partPreview';
import { fitPart } from './catalog';

export function cyberPartModel(base: Design, id: string): { geo: THREE.BufferGeometry; tex: THREE.DataTexture } | null {
  const d: Design = { ...JSON.parse(JSON.stringify(base)), fit: fitPart(base.fit, id) };
  if (!isAnatomy(d)) return null;
  const rig = buildRig(d), rest: V3[] = rig.bones.map(() => [0, 0, 0]);
  rig.bones.forEach((b, i) => { const p = b.parent >= 0 ? rest[b.parent] : [0, 0, 0]; rest[i] = [p[0] + b.pos[0], p[1] + b.pos[1], p[2] + b.pos[2]]; });
  const pre = 'cy:' + id;
  Body.keepPiece = (pc) => pc.name.startsWith(pre);
  let o: ReturnType<typeof sculptAnatomy>;
  try { o = sculptAnatomy(d, rig, rest); } finally { Body.keepPiece = null; }
  const m = { geo: o.geo, tex: o.tex, rig, restWorld: rest } as unknown as SpeciesModel;
  const geo = partGeometry(m, { regions: [], whole: true });
  o.geo.dispose();
  return geo ? { geo, tex: o.tex } : null;
}
