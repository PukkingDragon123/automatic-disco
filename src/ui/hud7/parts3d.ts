// HUD v7 · BENCH PARTS IN 3D. Every custom-tool part is a real component of the TOOL MODELS agent's detailed tools
// (src/tools/models: buildToolModel + its named callouts): the scanner's emitter dish, the drill's spinning bit and
// gear train, the grab's claw fingers and pulsing core, the welder's nozzle + arc and fuel cell, the seeder's hopper,
// the winch's beacon... The part is the whole tool model with everything but that component hidden, so it keeps its
// working animation (the bit spins, the core pulses). Grips are built with the same tool-models kit and paints.
//   partModel(slot, id, lod)   -> THREE.Group (foot at y = 0, centred; userData.update(dt) drives it)
//   customModel(parts, lod)    -> THREE.Group, the assembled tool: core in the middle, head forward (+x), grip under,
//                                 mod on top; each part fitted to its place
//   partIcon(slot, id, size)   -> a cached outlined icon canvas (the kit renderer)
import * as THREE from 'three';
import { buildToolModel, type ToolModel } from '../../tools/models';
import { Kit, cbox, cyl, ring, AX, type Lod, type V3 } from '../../tools/models/kit';
import { snapshot, fitRoot } from '../kit/model3d';
import type { PartSlot } from '../kit/models';

/** part id -> [tool, callout key] */
const SRC: Record<string, [string, string]> = {
  lens: ['scanner', 'dish'], bit: ['drill', 'bit'], claw: ['grab', 'claws'], torch: ['weld', 'nozzle'],
  cell: ['weld', 'fuel'], reactor: ['grab', 'core'], motor: ['drill', 'gears'],
  scope: ['scanner', 'lens'], tank: ['seeder', 'hopper'], antenna: ['carry', 'beacon'],
};
const LIVERY = { hull: [0x1c2024, 0x2c3238, 0x404850, 0x5a646c, 0x78848c, 0x9aa6ac] as readonly number[], accent: [0x3a1a08, 0x6a3010, 0x9a4a18, 0xc8682a, 0xe8944a, 0xffc080] as readonly number[], glow: [0x0a2a2a, 0x1a6a6a, 0x30b0b0, 0x50e8e0, 0xa0fff8] as readonly number[], name: 'bench' };

function visBox(root: THREE.Object3D): THREE.Box3 {
  const b = new THREE.Box3(), tmp = new THREE.Box3(); root.updateMatrixWorld(true);
  root.traverseVisible((o) => { const m = o as THREE.Mesh; if (!m.isMesh || !m.geometry) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); tmp.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld); b.union(tmp); });
  return b;
}
/** keep only `keep` (and its ancestors / descendants) visible under root */
function isolate(root: THREE.Object3D, keep: THREE.Object3D) {
  const path = new Set<THREE.Object3D>(); for (let p: THREE.Object3D | null = keep; p; p = p.parent) path.add(p);
  const walk = (o: THREE.Object3D) => { for (const c of o.children) { if (c === keep) continue; if (path.has(c)) walk(c); else c.visible = false; } };
  walk(root);
}
/** the component: climb from the callout object to the largest ancestor that is still a part, not the tool */
function component(m: ToolModel, key: string): THREE.Object3D | null {
  const c = m.callouts.find((x) => x.key === key); if (!c) return null;
  m.updateMatrixWorld(true);
  const whole = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()).length();
  let o = c.obj;
  while (o.parent && o.parent !== m && o.parent !== m.root) {
    const s = new THREE.Box3().setFromObject(o.parent).getSize(new THREE.Vector3()).length();
    if (s > whole * 0.55) break;
    o = o.parent;
  }
  return o;
}
/** a grip from the tool-models kit: knurled rubber, a trigger guard, bolts, a cable */
function gripModel(id: string, lod: Lod): THREE.Group {
  const k = new Kit(lod, LIVERY as never), g = new THREE.Group();
  if (id === 'pistol') {
    k.mesh(cbox(0.06, 0.2, 0.07, 0.012), 'rubber', g, [0, 0.1, 0], [0, 0, -0.22]);
    for (let i = 0; i < 4; i++) k.mesh(cbox(0.064, 0.012, 0.074, 0.003), 'knurl', g, [-0.01 + i * 0.012 * Math.sin(0.22), 0.05 + i * 0.04, 0], [0, 0, -0.22]);
    k.mesh(cbox(0.12, 0.03, 0.08, 0.008), 'frame', g, [0.03, 0.21, 0]);
    k.mesh(ring(0.045, 0.035, 0.02, 16), 'steel', g, [0.07, 0.15, 0], AX.z);
    k.mesh(cbox(0.012, 0.04, 0.02, 0.003), 'accent', g, [0.065, 0.16, 0], [0, 0, 0.3]);
    k.bolts(g, [[0.0, 0.21, 0.042], [0.06, 0.21, 0.042]] as V3[], 0.008);
  } else if (id === 'brace') {
    k.mesh(cbox(0.36, 0.05, 0.08, 0.01), 'frame', g, [-0.12, 0.2, 0]);
    k.mesh(cbox(0.06, 0.16, 0.09, 0.012), 'rubber', g, [-0.3, 0.12, 0]);
    k.mesh(cbox(0.05, 0.16, 0.06, 0.01), 'rubber', g, [0.02, 0.1, 0], [0, 0, -0.18]);
    k.mesh(cyl(0.02, 0.1, 10), 'steel', g, [-0.16, 0.2, 0.05], AX.x);
    k.bolts(g, [[-0.25, 0.2, 0.042], [-0.05, 0.2, 0.042], [-0.3, 0.16, 0.047]] as V3[], 0.009);
    k.cable(g, [[-0.3, 0.05, 0], [-0.2, 0.0, 0.03], [-0.05, 0.04, 0.02]] as V3[], 0.01);
  } else {
    k.mesh(cyl(0.028, 0.34, 12), 'rubber', g, [0, 0.26, 0], AX.x);
    for (const x of [-0.12, -0.04, 0.04, 0.12]) k.mesh(ring(0.031, 0.026, 0.012, 12), 'knurl', g, [x, 0.26, 0], AX.x);
    for (const x of [-0.17, 0.17]) { k.mesh(cbox(0.03, 0.2, 0.05, 0.008), 'frame', g, [x, 0.13, 0]); k.bolts(g, [[x, 0.05, 0.027]] as V3[], 0.008); }
    k.mesh(cbox(0.4, 0.03, 0.06, 0.008), 'steel', g, [0, 0.02, 0]);
  }
  return g;
}
/** one part, centred on its footprint, foot at y = 0 */
export function partModel(slot: PartSlot, id: string, lod: Lod = 'hud'): THREE.Group | null {
  if (slot === 'mod' && id === 'none') return null;
  let obj: THREE.Object3D | null = null, spin = 0;
  if (slot === 'grip') obj = gripModel(id, lod);
  else {
    const src = SRC[id]; if (!src) return null;
    const m = buildToolModel(src[0], { lod, animated: true }); if (!m) return null;
    const c = component(m, src[1]); if (!c) return null;
    isolate(m, c);
    // re-centre the visible component (the model keeps its own transforms so its animation still drives it)
    const b = visBox(m), ctr = b.getCenter(new THREE.Vector3()), holder = new THREE.Group();
    m.position.sub(ctr); m.position.y += (b.max.y - b.min.y) / 2;
    holder.add(m); holder.userData.update = (dt: number) => m.update(dt, 'active'); holder.userData.size = b.getSize(new THREE.Vector3());
    obj = holder; spin = 0;
  }
  const g = new THREE.Group(); g.add(obj); g.userData.slot = slot; g.userData.part = id; g.userData.spin = spin;
  if (obj.userData.update) g.userData.update = obj.userData.update;
  if (!obj.userData.size) { const b = visBox(obj); obj.position.y -= b.min.y; obj.userData.size = b.getSize(new THREE.Vector3()); }
  g.userData.size = obj.userData.size;
  return g;
}
/** scale a part so its largest side is `s` */
function fitTo(p: THREE.Group, s: number) { const sz = p.userData.size as THREE.Vector3; const k = s / Math.max(0.001, sz.x, sz.y, sz.z); p.scale.setScalar(k); return k; }
/** the assembled custom tool (one group per slot, named 'part:<slot>') */
export function customModel(parts: Partial<Record<PartSlot, string>>, lod: Lod = 'hud', o: { only?: PartSlot } = {}): THREE.Group {
  const root = new THREE.Group(), ups: ((dt: number) => void)[] = [];
  const place: Record<PartSlot, { s: number; p: V3; r: V3 }> = {
    core: { s: 0.42, p: [0, 0.34, 0], r: [0, 0, 0] },
    head: { s: 0.34, p: [0.36, 0.34, 0], r: [0, 0, 0] },
    grip: { s: 0.34, p: [-0.06, 0.0, 0], r: [0, 0, 0] },
    mod: { s: 0.26, p: [0.02, 0.58, 0], r: [0, 0, 0] },
  };
  for (const slot of ['core', 'head', 'grip', 'mod'] as PartSlot[]) {
    if (o.only && o.only !== slot) continue;
    const id = parts[slot]; if (!id) continue;
    const p = partModel(slot, id, lod); if (!p) continue;
    const pl = place[slot]; fitTo(p, pl.s);
    const holder = new THREE.Group(); holder.name = 'part:' + slot; holder.position.set(...pl.p); holder.rotation.set(...pl.r);
    if (slot !== 'grip') p.position.y -= ((p.userData.size as THREE.Vector3).y * p.scale.y) / 2;
    holder.add(p); root.add(holder);
    if (p.userData.update) ups.push(p.userData.update as (dt: number) => void);
  }
  root.userData.update = (dt: number) => { for (const u of ups) u(dt); };
  return root;
}
/** a part's icon, outlined, from the kit's renderer (cached) */
export function partIcon(slot: PartSlot, id: string, size = 40): HTMLCanvasElement | null {
  return snapshot(`part3d|${slot}|${id}|${size}`, () => { const p = partModel(slot, id, 'hud'); return p ? fitRoot(p) : new THREE.Group(); }, size, size, { pitch: 0.42, yaw: -0.6, zoom: 1.05, ink: 1 });
}
