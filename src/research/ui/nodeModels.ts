// The skill tree's 3D nodes: one small model of WHAT EACH NODE UNLOCKS, drawn in the UI kit's toon material with
// painted pixel textures (src/ui/kit/tex3d.ts) and inked by the kit's renderer (a black outline, contour lines, a rim).
//   b:<kind>        the factory's own building model (its texture layers turned into painted vertex colours)
//   arm_* drone_* pod_* tool_*   the Upgrader parts (src/research/ui/models.ts), re-dressed in steel and enamel
//   dock_*          the dock slot's own object (a lens over a flask, a blueprint roll, a helmet, a bottle, the ship)
//   st_* ship_* ... the pod's structures and the ship's rooms as compact props
import * as THREE from 'three';
import { toon } from '../../ui/kit/model3d';
import { tex, blueprintTex, rollEndTex, helmetTex, hullTex, dialTex } from '../../ui/kit/tex3d';
import { FDEFS } from '../../factory/defs';
import { modelFor } from '../../factory/models';
import { L } from '../../factory/tex';
import { blueprintModel } from './models';
import { DOCK_MODELS, TOOL_MODELS } from '../../ui/kit/models';

type V3 = [number, number, number];
const M = {
  steel: () => toon({ map: tex('steel'), metal: 0.6, gloss: 0.5 }),
  gun: () => toon({ map: tex('gun'), metal: 0.5, gloss: 0.4 }),
  brass: () => toon({ map: tex('brass'), metal: 0.8, gloss: 0.7 }),
  copper: () => toon({ map: tex('copper'), metal: 0.8, gloss: 0.6 }),
  enamel: () => toon({ map: tex('enamel') }),
  teal: () => toon({ map: tex('teal') }),
  olive: () => toon({ map: tex('olive') }),
  orange: () => toon({ map: tex('orange') }),
  red: () => toon({ map: tex('red') }),
  white: () => toon({ map: tex('white') }),
  rubber: () => toon({ map: tex('rubber'), gloss: 0.1 }),
  wood: () => toon({ map: tex('wood') }),
  glass: () => toon({ map: tex('glass'), gloss: 0.9, opacity: 0.85 }),
  lens: () => toon({ map: tex('lens'), emissive: 0x2a7a70, emissiveK: 0.5, gloss: 0.9 }),
  lamp: (c = 0xffc860) => toon({ color: c, emissive: c, emissiveK: 0.9 }),
  fluid: () => toon({ map: tex('flask'), emissive: 0x1a6a5a, emissiveK: 0.6, gloss: 0.8 }),
  hazard: () => toon({ map: tex('hazard') }),
  coil: () => toon({ map: tex('coil'), metal: 0.8 }),
  stone: () => toon({ map: tex('stone') }),
  crystal: () => toon({ color: 0x9ae0f0, emissive: 0x3aa0c0, emissiveK: 0.45, gloss: 0.9 }),
  blueprint: () => toon({ map: blueprintTex() }), rollEnd: () => toon({ map: rollEndTex() }), helmet: () => toon({ map: helmetTex() }), hull: () => toon({ map: hullTex() }), dial: () => toon({ map: dialTex() }),
};
type Mk = keyof typeof M;
const mat = (k: Mk | THREE.Material) => (typeof k === 'string' ? (M[k] as () => THREE.Material)() : k);
function box(g: THREE.Object3D, s: V3, p: V3, m: Mk | THREE.Material, r: V3 = [0, 0, 0]) { const o = new THREE.Mesh(new THREE.BoxGeometry(...s), mat(m)); o.position.set(...p); o.rotation.set(...r); g.add(o); return o; }
function cyl(g: THREE.Object3D, r0: number, r1: number, h: number, p: V3, m: Mk | THREE.Material, r: V3 = [0, 0, 0], n = 14) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, n), mat(m)); o.position.set(...p); o.rotation.set(...r); g.add(o); return o; }
function sph(g: THREE.Object3D, r: number, p: V3, m: Mk | THREE.Material, part = 1) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, Math.PI * part), mat(m)); o.position.set(...p); g.add(o); return o; }
function tor(g: THREE.Object3D, r: number, t: number, p: V3, m: Mk | THREE.Material, rot: V3 = [Math.PI / 2, 0, 0], arc = Math.PI * 2) { const o = new THREE.Mesh(new THREE.TorusGeometry(r, t, 6, 18, arc), mat(m)); o.position.set(...p); o.rotation.set(...rot); g.add(o); return o; }

// ------------------------------------------------------------------ factory buildings (texture layers -> painted colours)
const LAYER_COL: Record<number, number> = {
  [L.OLIVE]: 0x6a6e44, [L.GUN]: 0x3e4448, [L.STEEL]: 0x8a9196, [L.HAZARD]: 0xd8a830, [L.GRILLE]: 0x2c3034, [L.BRICK]: 0x9a5a3a, [L.CONCRETE]: 0x9a958a,
  [L.BELT]: 0x2a2a2a, [L.COPPER]: 0xc07a44, [L.GLASS]: 0x7ac0d0, [L.RUST]: 0x9a5030, [L.CREAM]: 0xd8ccb0, [L.RED]: 0xb03a2e, [L.WOOD]: 0x8a6440,
  [L.LAMP]: 0xffd070, [L.TEAL]: 0x3a8a80, [L.TREAD]: 0x2a2826, [L.COAL]: 0x2a2826, [L.CUORE]: 0x5a9a7a, [L.MOSS]: 0x5a7a3a, [L.INK]: 0x101214, [L.BRASS]: 0xc09a48,
};
function paintLayers(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone(), lay = g.getAttribute('aLayer') as THREE.BufferAttribute | undefined, n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { const l = lay ? Math.round(lay.getX(i)) : L.STEEL; c.setHex(LAYER_COL[l] ?? 0xd8ccb0, THREE.LinearSRGBColorSpace); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
export function buildingModel(kind: string): THREE.Group | null {
  const def = (FDEFS as Record<string, any>)[kind]; if (!def) return null;
  try {
    const md = modelFor(kind, def.model, def.hooks?.model), g = new THREE.Group(), m = toon({ vcol: true, gloss: 0.3 });
    g.add(new THREE.Mesh(paintLayers(md.base), m));
    for (const p of md.parts) { const o = new THREE.Mesh(paintLayers(p.geo), m); o.position.set(...(p.pivot as V3)); g.add(o); }
    return g;
  } catch { return null; }
}
/** the upgrader parts, re-dressed: the placeholder material swapped for steel, enamel and rubber by size */
function dressed(id: string): THREE.Group {
  const g = blueprintModel(id);
  let k = 0;
  g.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const s = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3()); const big = Math.max(s.x, s.y, s.z); m.material = mat(big > 0.45 ? (id.startsWith('drone') ? 'white' : 'orange') : k++ % 3 === 0 ? 'rubber' : 'steel'); });
  return g;
}

// ------------------------------------------------------------------ the bespoke props
const B: Record<string, () => THREE.Group> = {
  pod: () => { const g = new THREE.Group(); cyl(g, 0.42, 0.5, 0.5, [0, 0.35, 0], 'white', [0, 0, 0], 12); sph(g, 0.42, [0, 0.6, 0], 'white', 0.5); cyl(g, 0.15, 0.15, 0.05, [0, 1.0, 0], 'lens'); box(g, [0.3, 0.08, 0.04], [0, 0.42, 0.46], 'orange'); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; box(g, [0.06, 0.42, 0.06], [Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.5], 'steel', [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]); } return g; },
  dock_research: () => { const g = new THREE.Group(); const prof = [[0, 0], [0.3, 0], [0.32, 0.05], [0.12, 0.45], [0.08, 0.5], [0.08, 0.72], [0.11, 0.74], [0, 0.74]].map(([x, y]) => new THREE.Vector2(x, y)); const f = new THREE.Mesh(new THREE.LatheGeometry(prof, 18), M.glass()); g.add(f); const liq = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.02], [0.28, 0.02], [0.29, 0.06], [0.18, 0.3], [0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)), 18), M.fluid()); g.add(liq); cyl(g, 0.1, 0.1, 0.06, [0, 0.77, 0], 'rubber'); tor(g, 0.22, 0.04, [0.34, 0.62, 0.2], 'brass', [0.4, 0.6, 0]); cyl(g, 0.2, 0.2, 0.02, [0.34, 0.62, 0.2], 'lens', [Math.PI / 2 + 0.4, 0.6, 0]); box(g, [0.06, 0.4, 0.06], [0.52, 0.32, 0.32], 'wood', [0.4, 0.6, -0.5]); return g; },
  dock_build: () => { const g = new THREE.Group(); cyl(g, 0.16, 0.16, 1.0, [0, 0.16, 0], 'blueprint', [0, 0, Math.PI / 2], 16); cyl(g, 0.161, 0.161, 0.02, [0.5, 0.16, 0], 'rollEnd', [0, 0, Math.PI / 2], 16); box(g, [0.7, 0.012, 0.5], [0.05, 0.006, 0.32], 'blueprint'); box(g, [0.08, 0.5, 0.08], [-0.25, 0.42, -0.1], 'wood', [0.3, 0, 0.6]); box(g, [0.36, 0.14, 0.14], [-0.4, 0.66, -0.18], 'steel', [0.3, 0, 0.6]); return g; },
  dock_troops: () => { const g = new THREE.Group(); sph(g, 0.42, [0, 0.12, 0], 'helmet', 0.5); tor(g, 0.43, 0.04, [0, 0.12, 0], 'olive'); box(g, [0.5, 0.06, 0.06], [0, 0.2, 0.4], 'rubber'); box(g, [0.14, 0.1, 0.04], [0, 0.42, 0.36], 'lamp'); return g; },
  dock_lab: () => { const g = new THREE.Group(); cyl(g, 0.22, 0.22, 0.7, [0, 0.45, 0], 'glass', [0, 0, 0], 16); cyl(g, 0.2, 0.2, 0.5, [0, 0.38, 0], 'fluid'); cyl(g, 0.26, 0.28, 0.12, [0, 0.06, 0], 'brass'); cyl(g, 0.26, 0.24, 0.1, [0, 0.85, 0], 'brass'); for (let k = 0; k < 6; k++) sph(g, 0.03 + (k % 2) * 0.02, [Math.sin(k * 2) * 0.1, 0.2 + k * 0.08, Math.cos(k * 2) * 0.1], 'lamp'); return g; },
  dock_ship: () => { const g = new THREE.Group(); const body = cyl(g, 0.2, 0.26, 1.2, [0, 0.3, 0], 'hull', [0, 0, Math.PI / 2], 12); void body; sph(g, 0.2, [0.6, 0.3, 0], 'hull', 1); box(g, [0.5, 0.04, 0.9], [-0.2, 0.3, 0], 'white'); cyl(g, 0.12, 0.08, 0.25, [-0.7, 0.3, 0], 'gun', [0, 0, Math.PI / 2]); cyl(g, 0.09, 0.09, 0.02, [-0.83, 0.3, 0], 'lamp', [0, 0, Math.PI / 2]); box(g, [0.1, 0.08, 0.3], [0.45, 0.42, 0], 'glass'); return g; },
  dish: () => { const g = new THREE.Group(); cyl(g, 0.04, 0.06, 0.8, [0, 0.4, 0], 'steel'); sph(g, 0.4, [0, 0.95, 0.12], 'white', 0.35).rotation.x = -1.1; cyl(g, 0.02, 0.02, 0.3, [0, 1.0, 0.3], 'steel', [1.1, 0, 0]); box(g, [0.3, 0.2, 0.2], [0, 0.1, 0], 'olive'); return g; },
  station: () => { const g = new THREE.Group(); box(g, [0.9, 0.5, 0.4], [0, 0.25, 0], 'olive'); box(g, [0.86, 0.06, 0.3], [0, 0.55, 0.06], 'gun', [-0.4, 0, 0]); for (let k = -1; k <= 1; k++) box(g, [0.22, 0.14, 0.02], [k * 0.28, 0.6, 0.2], 'lens', [-0.4, 0, 0]); cyl(g, 0.12, 0.12, 0.5, [0.32, 0.8, -0.1], 'glass'); cyl(g, 0.1, 0.1, 0.35, [0.32, 0.75, -0.1], 'fluid'); return g; },
  tool_sampler: () => { const g = new THREE.Group(); cyl(g, 0.06, 0.06, 0.6, [0, 0.4, 0], 'steel', [0, 0, 0.3]); cyl(g, 0.12, 0.12, 0.3, [0.1, 0.75, 0], 'glass', [0, 0, 0.3]); cyl(g, 0.1, 0.1, 0.2, [0.1, 0.72, 0], 'fluid', [0, 0, 0.3]); cyl(g, 0.02, 0.005, 0.2, [-0.1, 0.05, 0], 'steel', [0, 0, 0.3]); box(g, [0.18, 0.12, 0.12], [0.05, 0.28, 0], 'orange', [0, 0, 0.3]); return g; },
  tool_seeder: () => { const g = new THREE.Group(); cyl(g, 0.25, 0.12, 0.4, [0, 0.5, 0], 'olive'); cyl(g, 0.04, 0.02, 0.3, [0, 0.15, 0], 'steel'); for (let k = 0; k < 5; k++) sph(g, 0.06, [Math.cos(k) * 0.12, 0.72 + (k % 2) * 0.04, Math.sin(k) * 0.12], 'wood'); return g; },
  tool_bench: () => { const g = new THREE.Group(); box(g, [1, 0.08, 0.5], [0, 0.5, 0], 'wood'); for (const x of [-0.44, 0.44]) for (const z of [-0.2, 0.2]) box(g, [0.06, 0.5, 0.06], [x, 0.25, z], 'steel'); box(g, [0.2, 0.14, 0.14], [-0.3, 0.6, 0], 'red'); cyl(g, 0.05, 0.05, 0.4, [0.2, 0.58, 0], 'steel', [0, 0, Math.PI / 2]); box(g, [0.12, 0.12, 0.12], [0.38, 0.6, 0], 'brass'); return g; },
  st_lamp: () => { const g = new THREE.Group(); cyl(g, 0.03, 0.05, 1.2, [0, 0.6, 0], 'steel'); box(g, [0.3, 0.12, 0.2], [0.1, 1.2, 0], 'orange'); box(g, [0.24, 0.02, 0.16], [0.1, 1.13, 0], 'lamp'); cyl(g, 0.2, 0.24, 0.06, [0, 0.03, 0], 'gun'); return g; },
  st_relay: () => { const g = new THREE.Group(); for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(g, [0.04, 1.3, 0.04], [x * 0.15, 0.65, z * 0.15], 'steel', [z * 0.06, 0, -x * 0.06]); for (let k = 0; k < 4; k++) box(g, [0.3, 0.03, 0.3], [0, 0.2 + k * 0.32, 0], 'gun'); sph(g, 0.22, [0, 1.3, 0.1], 'white', 0.4).rotation.x = -1.2; sph(g, 0.04, [0, 1.42, 0], 'lamp'); box(g, [0.18, 0.24, 0.1], [0, 0.18, 0.2], 'olive'); return g; },
  st_sensor: () => { const g = new THREE.Group(); cyl(g, 0.05, 0.07, 1.1, [0, 0.55, 0], 'steel'); box(g, [0.5, 0.2, 0.06], [0, 1.15, 0], 'gun'); box(g, [0.46, 0.14, 0.02], [0, 1.15, 0.04], 'dial'); cyl(g, 0.08, 0.08, 0.1, [0, 0.95, 0.08], 'lens', [Math.PI / 2, 0, 0]); return g; },
  st_gravpole: () => { const g = new THREE.Group(); cyl(g, 0.08, 0.1, 1.3, [0, 0.65, 0], 'gun'); for (let k = 0; k < 3; k++) tor(g, 0.16, 0.03, [0, 0.5 + k * 0.3, 0], 'coil'); sph(g, 0.14, [0, 1.38, 0], 'crystal'); cyl(g, 0.3, 0.34, 0.08, [0, 0.04, 0], 'hazard'); return g; },
  upgrader: () => { const g = new THREE.Group(); box(g, [1, 0.12, 0.6], [0, 0.06, 0], 'gun'); for (const x of [-0.44, 0.44]) box(g, [0.08, 0.9, 0.08], [x, 0.55, 0], 'orange'); box(g, [1, 0.1, 0.1], [0, 1.0, 0], 'orange'); box(g, [0.14, 0.2, 0.14], [0.1, 0.85, 0], 'steel'); cyl(g, 0.02, 0.02, 0.25, [0.1, 0.65, 0], 'steel'); box(g, [0.4, 0.14, 0.3], [-0.05, 0.2, 0], 'hazard'); return g; },
  ship_cargo: () => { const g = new THREE.Group(); box(g, [0.6, 0.45, 0.45], [-0.15, 0.22, 0], 'olive'); box(g, [0.4, 0.3, 0.35], [0.4, 0.15, 0.05], 'orange'); box(g, [0.3, 0.2, 0.3], [0.32, 0.4, 0.05], 'wood'); return g; },
  ship_lab: () => { const g = new THREE.Group(); box(g, [0.9, 0.08, 0.4], [0, 0.5, 0], 'white'); box(g, [0.8, 0.5, 0.35], [0, 0.25, 0], 'gun'); for (let k = 0; k < 3; k++) { cyl(g, 0.06, 0.06, 0.24, [-0.25 + k * 0.25, 0.66, 0], 'glass'); cyl(g, 0.05, 0.05, 0.14, [-0.25 + k * 0.25, 0.62, 0], 'fluid'); } return g; },
  ship_medbay: () => { const g = new THREE.Group(); box(g, [1, 0.12, 0.42], [0, 0.45, 0], 'white'); for (const x of [-0.42, 0.42]) box(g, [0.06, 0.45, 0.06], [x, 0.22, 0], 'steel'); box(g, [0.26, 0.08, 0.04], [0, 0.6, 0.18], 'red'); box(g, [0.08, 0.26, 0.04], [0, 0.6, 0.18], 'red'); return g; },
  ship_hangar: () => { const g = new THREE.Group(); box(g, [1.0, 0.06, 0.8], [0, 0.03, 0], 'hazard'); for (const x of [-0.45, 0.45]) box(g, [0.06, 0.7, 0.8], [x, 0.38, 0], 'gun'); box(g, [1, 0.06, 0.8], [0, 0.74, 0], 'gun'); const d = dressed('drone_scout'); d.scale.setScalar(0.5); d.position.set(0, 0.1, 0); g.add(d); return g; },
  ship_engine: () => { const g = new THREE.Group(); cyl(g, 0.35, 0.4, 0.6, [0, 0.4, 0], 'gun', [0, 0, 0], 12); cyl(g, 0.3, 0.3, 0.02, [0, 0.71, 0], 'lamp'); for (let k = 0; k < 4; k++) tor(g, 0.4, 0.04, [0, 0.2 + k * 0.14, 0], 'copper'); return g; },
  ship_mess: () => { const g = new THREE.Group(); box(g, [0.9, 0.06, 0.5], [0, 0.45, 0], 'wood'); for (const x of [-0.38, 0.38]) box(g, [0.06, 0.45, 0.4], [x, 0.22, 0], 'steel'); cyl(g, 0.12, 0.1, 0.12, [-0.15, 0.54, 0], 'enamel'); cyl(g, 0.06, 0.05, 0.1, [0.2, 0.53, 0.05], 'white'); return g; },
  logic: () => { const g = new THREE.Group(); box(g, [0.6, 0.3, 0.45], [0, 0.3, 0], 'gun'); box(g, [0.66, 0.06, 0.5], [0, 0.12, 0], 'steel'); for (const [x, z] of [[-0.38, 0], [0.38, 0.12], [0.38, -0.12]]) cyl(g, 0.07, 0.07, 0.14, [x, 0.3, z], 'brass', [0, 0, Math.PI / 2], 10); for (let k = 0; k < 3; k++) box(g, [0.07, 0.04, 0.04], [-0.14 + k * 0.14, 0.47, 0.14], 'lamp'); return g; },
  crystal: () => { const g = new THREE.Group(); cyl(g, 0.4, 0.5, 0.2, [0, 0.1, 0], 'stone', [0, 0, 0], 7); for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + (k % 2) * 0.06, 0), M.crystal()); c.scale.y = 2.2; c.position.set(Math.cos(k * 1.3) * 0.18, 0.35 + (k % 2) * 0.08, Math.sin(k * 1.3) * 0.18); c.rotation.z = Math.cos(k) * 0.4; g.add(c); } return g; },
};
const ALIAS: Record<string, string> = { arm_grapple: 'arm_grapple', arm_drill: 'arm_drill', arm_welder: 'arm_welder', tool_tractor: 'tool_tractor', tool_cannon: 'tool_cannon', tool_scanner2: 'tool_scanner2', drone_scout: 'drone_scout', drone_hauler: 'drone_hauler', drone_builder: 'drone_builder', pod_plating: 'pod_plating', pod_capacitor: 'pod_capacitor', pod_coolant: 'pod_coolant', arm_socket: 'arm_socket', arm_long: 'arm_long' };
/** a node's model (a fresh object; geometry is cheap, materials are shared) */
export function nodeModel(key: string): THREE.Object3D {
  try {
    if (key.startsWith('b:')) { const g = buildingModel(key.slice(2)); if (g) return g; }
    const KIT: Record<string, () => THREE.Group> = { dock_research: DOCK_MODELS.research, dock_build: DOCK_MODELS.build, dock_troops: DOCK_MODELS.troops, dock_lab: DOCK_MODELS.lab, dock_ship: DOCK_MODELS.ship, tool_sampler: TOOL_MODELS.sampler, tool_seeder: TOOL_MODELS.seeder, arm_grapple: TOOL_MODELS.grab, arm_drill: TOOL_MODELS.drill, arm_welder: TOOL_MODELS.weld, tool_tractor: TOOL_MODELS.lift, tool_cannon: TOOL_MODELS.cannon, drone_hauler: TOOL_MODELS.carry, scanner: TOOL_MODELS.scanner };
    if (KIT[key]) { const m = KIT[key](); if (m) return m; }
    if (B[key]) return B[key]();
    if (ALIAS[key]) return dressed(ALIAS[key]);
  } catch (e) { console.warn('node model', key, e); }
  return B.logic();
}
