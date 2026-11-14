// Builds a titan's full model off the main thread: the rig, the sculpt (geometry and the painted page), and the
// rig's patches the sculpt makes (leaf bones seated on the eyes, lids and jaw hinge, lid axes, leg poles). Every
// array goes back as a transferable.
import { buildRig } from '../morph';
import type { Design } from '../design';
import type { V3 } from '../kit';
import { sculptTitan } from './builders';

self.onmessage = (e: MessageEvent<{ id: number; d: Design }>) => {
  const { id, d } = e.data;
  try {
    const rig = buildRig(d);
    const rest: V3[] = rig.bones.map(() => [0, 0, 0]);
    rig.bones.forEach((bn, i) => { const p = bn.parent >= 0 ? rest[bn.parent] : [0, 0, 0]; rest[i] = [p[0] + bn.pos[0], p[1] + bn.pos[1], p[2] + bn.pos[2]]; });
    const out = sculptTitan(d, rig, rest);
    const payload = packTitan(out.geo, out.tex, rig);
    (self as unknown as Worker).postMessage({ id, payload }, payloadBuffers(payload));
  } catch (err) { (self as unknown as Worker).postMessage({ id, error: String((err as Error)?.stack ?? err) }); }
};

import { packTitan, payloadBuffers } from './pack';
