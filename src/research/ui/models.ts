// The 3D models the R&D station projects: a tech's actual building (the factory's own model), or for blueprints,
// recipes and logic a compact model of the thing itself (an arm with its tool head, a drone, a pod part, a hand tool,
// a flask, a logic node). Every model is fitted to a unit footprint, base at y = 0, centred.
import * as THREE from 'three';
import { FDEFS } from '../../factory/defs';
import { modelFor } from '../../factory/models';
import { TECH, type Tech } from '../tech';

const M = new THREE.MeshBasicMaterial();
const box = (g: THREE.Group, s: [number, number, number], p: [number, number, number], r: [number, number, number] = [0, 0, 0]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(...s), M); m.position.set(...p); m.rotation.set(...r); g.add(m); return m; };
const cyl = (g: THREE.Group, r0: number, r1: number, h: number, p: [number, number, number], rot: [number, number, number] = [0, 0, 0], n = 16) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, n), M); m.position.set(...p); m.rotation.set(...rot); g.add(m); return m; };

/** the building kinds a tech opens */
export function buildingKinds(t: Tech): string[] {
  const out: string[] = [];
  for (const k in FDEFS) { const d = (FDEFS as Record<string, { kind: string; skill?: string }>)[k]; if (t.buildings?.includes(d.kind) || (d.skill && t.grants?.includes(d.skill))) out.push(d.kind); }
  return out;
}
function building(kind: string): THREE.Group | null {
  const def = (FDEFS as Record<string, any>)[kind]; if (!def) return null;
  try {
    const md = modelFor(kind, def.model, def.hooks?.model), g = new THREE.Group();
    g.add(new THREE.Mesh(md.base, M));
    for (const p of md.parts) { const m = new THREE.Mesh(p.geo, M); m.position.set(...p.pivot); g.add(m); }
    return g;
  } catch { return null; }
}
function arm(head: string, long = false): THREE.Group {
  const g = new THREE.Group(), L = long ? 1.5 : 1;
  cyl(g, 0.3, 0.36, 0.16, [0, 0.08, 0]); cyl(g, 0.12, 0.12, 0.2, [0, 0.26, 0], [Math.PI / 2, 0, 0]);
  box(g, [0.12, 0.7 * L, 0.14], [0.1 * L, 0.6 * L, 0], [0, 0, -0.3]);
  cyl(g, 0.09, 0.09, 0.18, [0.22 * L, 0.92 * L, 0], [Math.PI / 2, 0, 0]);
  box(g, [0.6 * L, 0.1, 0.12], [0.5 * L, 1.0 * L, 0], [0, 0, -0.25]);
  const hx = 0.8 * L, hy = 1.14 * L;
  if (head === 'grapple') for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; box(g, [0.04, 0.22, 0.04], [hx + Math.cos(a) * 0.08 + 0.08, hy - 0.08, Math.sin(a) * 0.08], [Math.sin(a) * 0.4, 0, -0.4 + Math.cos(a) * 0.4]); }
  else if (head === 'cutter') cyl(g, 0.16, 0.16, 0.03, [hx + 0.1, hy, 0], [Math.PI / 2, 0, 0], 24);
  else if (head === 'drill') { const c = cyl(g, 0.0, 0.08, 0.32, [hx + 0.2, hy - 0.06, 0], [0, 0, Math.PI / 2 + 0.25], 12); c.scale.set(1, 1, 1); }
  else if (head === 'welder') { cyl(g, 0.02, 0.05, 0.3, [hx + 0.18, hy - 0.05, 0], [0, 0, Math.PI / 2 + 0.3], 10); box(g, [0.1, 0.1, 0.1], [hx + 0.02, hy, 0]); }
  else box(g, [0.14, 0.14, 0.14], [hx + 0.05, hy, 0]);
  return g;
}
function drone(kind: string): THREE.Group {
  const g = new THREE.Group(), big = kind === 'hauler' || kind === 'bay';
  box(g, big ? [0.5, 0.18, 0.4] : [0.34, 0.12, 0.3], [0, 0.5, 0]);
  box(g, [0.2, 0.08, 0.18], [0, 0.6, 0]);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    box(g, [0.36, 0.04, 0.05], [x * 0.24, 0.52, z * 0.2], [0, Math.atan2(z, x) * -1, 0]);
    cyl(g, 0.17, 0.17, 0.012, [x * 0.38, 0.58, z * 0.34], [0, 0, 0], 20);
    cyl(g, 0.02, 0.02, 0.08, [x * 0.38, 0.54, z * 0.34]);
  }
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), M); lens.position.set(0, 0.42, 0.12); g.add(lens);
  if (big) box(g, [0.36, 0.2, 0.3], [0, 0.28, 0]);
  if (kind === 'builder') { box(g, [0.04, 0.26, 0.04], [0.1, 0.32, 0], [0, 0, 0.4]); box(g, [0.04, 0.26, 0.04], [-0.1, 0.32, 0], [0, 0, -0.4]); }
  if (kind === 'bay') { box(g, [0.9, 0.08, 0.7], [0, 0.04, 0]); for (const x of [-0.3, 0.3]) box(g, [0.06, 0.4, 0.06], [x, 0.24, -0.3]); }
  return g;
}
function pod(kind: string): THREE.Group {
  const g = new THREE.Group();
  cyl(g, 0.42, 0.5, 0.5, [0, 0.35, 0], [0, 0, 0], 12); const dome = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M); dome.position.y = 0.6; g.add(dome);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; box(g, [0.05, 0.4, 0.05], [Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.5], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]); }
  if (kind === 'plating') for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; box(g, [0.24, 0.42, 0.04], [Math.cos(a) * 0.53, 0.36, Math.sin(a) * 0.53], [0, -a + Math.PI / 2, 0]); }
  if (kind === 'capacitor') { const t = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.06, 8, 24), M); t.rotation.x = Math.PI / 2; t.position.y = 0.2; g.add(t); }
  if (kind === 'sensor') { cyl(g, 0.02, 0.02, 0.7, [0.15, 1.1, 0]); const d = cyl(g, 0.16, 0.04, 0.06, [0.15, 1.45, 0], [0.6, 0, 0]); void d; }
  if (kind === 'coolant') for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 20, Math.PI), M); t.position.y = 0.2 + k * 0.14; g.add(t); }
  return g;
}
function tool(kind: string): THREE.Group {
  const g = new THREE.Group();
  box(g, [0.5, 0.16, 0.14], [0, 0.6, 0]); box(g, [0.1, 0.3, 0.1], [-0.12, 0.42, 0], [0, 0, 0.25]);
  if (kind === 'scanner2') { cyl(g, 0.12, 0.06, 0.16, [0.32, 0.6, 0], [0, 0, Math.PI / 2]); cyl(g, 0.02, 0.02, 0.3, [0.05, 0.85, 0]); }
  else if (kind === 'tractor') { const d = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), M); d.rotation.z = -Math.PI / 2; d.position.set(0.42, 0.6, 0); g.add(d); for (const r of [0.1, 0.16]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.01, 4, 16), M); t.rotation.y = Math.PI / 2; t.position.set(0.5 + r, 0.6, 0); g.add(t); } }
  else if (kind === 'repair') { cyl(g, 0.03, 0.05, 0.3, [0.38, 0.62, 0], [0, 0, Math.PI / 2]); cyl(g, 0.08, 0.08, 0.26, [0, 0.82, 0], [Math.PI / 2, 0, 0]); }
  else if (kind === 'cannon') { cyl(g, 0.07, 0.08, 0.6, [0.48, 0.62, 0], [0, 0, Math.PI / 2]); for (let k = 0; k < 4; k++) cyl(g, 0.1, 0.1, 0.02, [0.3 + k * 0.08, 0.62, 0], [0, 0, Math.PI / 2]); }
  else cyl(g, 0.05, 0.05, 0.3, [0.36, 0.6, 0], [0, 0, Math.PI / 2]);
  return g;
}
function flask(): THREE.Group {
  const g = new THREE.Group(), prof = [[0, 0], [0.3, 0], [0.32, 0.05], [0.12, 0.45], [0.08, 0.5], [0.08, 0.7], [0.11, 0.72], [0, 0.72]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 20), M)); const c = box(g, [0.36, 0.3, 0.36], [0.45, 0.15, 0.1]); c.rotation.y = 0.4; return g;
}
function logic(): THREE.Group {
  const g = new THREE.Group(); box(g, [0.5, 0.3, 0.4], [0, 0.35, 0]); box(g, [0.56, 0.06, 0.46], [0, 0.18, 0]);
  for (const [x, z] of [[-0.35, 0], [0.35, 0.12], [0.35, -0.12]]) cyl(g, 0.06, 0.06, 0.14, [x, 0.36, z], [0, 0, Math.PI / 2], 10);
  for (let k = 0; k < 3; k++) box(g, [0.06, 0.03, 0.03], [-0.12 + k * 0.12, 0.52, 0.12]);
  return g;
}
/** the model of a blueprint (Upgrader part) by id */
export function blueprintModel(id: string): THREE.Group {
  const [t, k] = id.split('_');
  if (t === 'arm') return arm(k === 'socket' ? 'socket' : k, k === 'long');
  if (t === 'drone') return drone(k);
  if (t === 'pod') return pod(k);
  return tool(k);
}
/** the model a tech offer shows */
export function techModel(id: string): THREE.Group {
  const t = TECH[id];
  let g: THREE.Group | null = null;
  if (t?.blueprint) g = blueprintModel(t.blueprint);
  else if (t?.kind === 'building') { for (const k of buildingKinds(t)) { g = building(k); if (g) break; } }
  else if (t?.kind === 'recipe') g = flask();
  else if (t?.kind === 'logic') g = logic();
  return fit(g ?? logic());
}
/** scale into a unit footprint (1 m across, up to 1.25 m tall), base at y = 0, centred */
export function fit(g: THREE.Group, size = 1): THREE.Group {
  const b = new THREE.Box3().setFromObject(g), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const k = size / Math.max(s.x, s.z, s.y / 1.25, 0.01);
  const out = new THREE.Group(); g.position.set(-c.x, -b.min.y, -c.z); out.add(g); out.scale.setScalar(k); return out;
}
