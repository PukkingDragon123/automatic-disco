// What can be built inside the ruined pod (v7): necessities, furniture and decor, each from real items, each raising
// the crew's HAPPINESS (src/pod/interior/home.ts). Real props are the hub's lowpix Poly Haven models (CC0); the rest
// are built here in painted pixel textures at 32 px per metre.
//   kind  'need' (bunk, heater, water filter, lamp) | 'furn' (chair, shelf, table) | 'decor' (plant, photo, radio ...)
//   top   a flat top other pieces can stand on (its height, m)
//   weight 0..1  the bounce and the dust when it lands
import * as THREE from 'three';
import { placeModel, preload } from '../../ship/hub/models';
import { canvasTex, hullTex, texMat, glowMat, pxTex, P, at, hash } from '../../social/tex';
import { toon } from '../../ui/kit/model3d';

export type DecorKind = 'need' | 'furn' | 'decor';
export interface DecorDef { id: string; name: string; kind: DecorKind; icon: string; cost: Record<string, number>; joy: number; weight: number; top?: number; r: number; max: number; build: () => THREE.Group; props?: string[] }

const mattress = () => pxTex('mattress', 32, 64, (p) => { for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) p.set(x, y, at(P.olive, 3 + ((y % 8) === 0 ? -1 : 0) + (x === 0 || x === 31 ? -1 : 0) + (hash(x >> 1, y >> 1, 5) > 0.9 ? 1 : 0))); });
const blanket = () => pxTex('blanket', 32, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, at(((x >> 3) + (y >> 3)) & 1 ? P.rust : P.clay, 3 + ((x + y) % 4 === 0 ? -1 : 0))); });
const rugTex = () => pxTex('rug', 64, 40, (p) => { for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) { const b = Math.min(x, y, 63 - x, 39 - y); const band = b < 3 ? P.ochre : b < 6 ? P.rust : (Math.abs((x - 32) / 32) + Math.abs((y - 20) / 20) < 0.5 ? P.ochre : P.sapphire); p.set(x, y, at(band, 3 + ((x + y) & 1 ? 0 : -1) * (b < 6 ? 0 : 1))); } });

/** a holder with a real prop in it (filled when the file arrives) */
function prop(id: string, s = 1, ry = 0, y = 0): THREE.Group { const g = new THREE.Group(); placeModel(g, id, { x: 0, y, z: 0, s, ry }); return g; }
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0]) { const o = new THREE.Mesh(geo, m); o.position.set(...p); o.rotation.set(...r); o.castShadow = o.receiveShadow = true; return o; }

const D = (d: DecorDef) => d;
export const DECOR: DecorDef[] = [
  D({ id: 'bunk', name: 'Bunk', kind: 'need', icon: 'bunk', cost: { iron_rod: 4, iron_plate: 2 }, joy: 16, weight: 0.75, top: 0.5, r: 1.0, max: 2, build: () => {
    const g = new THREE.Group(), steel = texMat(hullTex(P.steel, 7));
    for (const x of [-0.42, 0.42]) for (const z of [-0.95, 0.95]) g.add(mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), steel, [x, 0.25, z]));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.06, 2.0), steel, [0, 0.36, 0]));
    g.add(mesh(new THREE.BoxGeometry(0.84, 0.12, 1.9), texMat(mattress()), [0, 0.45, 0]));
    g.add(mesh(new THREE.BoxGeometry(0.86, 0.05, 1.1), texMat(blanket()), [0, 0.53, 0.35]));
    g.add(prop('throw_pillows_01', 0.7, 0, 0.5).translateZ(-0.7));
    return g; } }),
  D({ id: 'heater', name: 'Heater', kind: 'need', icon: 'flame', cost: { copper_wire: 4, iron_plate: 2 }, joy: 10, weight: 0.55, r: 0.45, max: 2, build: () => {
    const g = new THREE.Group(), steel = texMat(hullTex(P.rust, 8));
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.6, 0.25), steel, [0, 0.32, 0]));
    for (let k = 0; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(0.42, 0.04, 0.02), glowMat(0xff6a20, 1.8), [0, 0.18 + k * 0.1, 0.13]));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 6), texMat(null, 0x222222), [0.22, 0.66, 0]));
    const l = new THREE.PointLight(0xff7a30, 1.2, 2.6, 1.8); l.position.set(0, 0.4, 0.3); g.add(l);
    return g; } }),
  D({ id: 'filter', name: 'Water Filter', kind: 'need', icon: 'drop', cost: { glass: 1, iron_rod: 2 }, joy: 8, weight: 0.5, r: 0.4, max: 1, build: () => {
    const g = prop('plastic_container', 1); const t = new THREE.Group(); t.add(g);
    t.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.45, 10), texMat(null, 0x8ac8d8), [0, 0.85, 0]));
    t.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), texMat(hullTex(P.copper, 9)), [0.16, 0.6, 0], [0, 0, 0.3]));
    return t; } }),
  D({ id: 'lamp', name: 'Lamp', kind: 'need', icon: 'bolt', cost: { glass: 1, copper_wire: 2 }, joy: 8, weight: 0.3, r: 0.3, max: 3, build: () => {
    const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.2, 6), texMat(hullTex(P.steel, 3)), [0, 0.6, 0]));
    g.add(prop('industrial_wall_lamp', 0.8, Math.PI, 1.05));
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 10), texMat(hullTex(P.steel, 4)), [0, 0.02, 0]));
    const l = new THREE.PointLight(0xffd8a0, 2.2, 4.5, 1.6); l.position.set(0, 1.15, 0.15); g.add(l);
    return g; } }),
  D({ id: 'plant', name: 'Plant', kind: 'decor', icon: 'sapling', cost: { fruit: 2, water: 1 }, joy: 10, weight: 0.35, r: 0.3, max: 4, build: () => prop('potted_plant_01', 1) }),
  D({ id: 'photo', name: 'Photo', kind: 'decor', icon: 'photo', cost: { glass: 1 }, joy: 6, weight: 0.12, r: 0.15, max: 3, build: () => prop('standing_picture_frame_01', 1.4) }),
  D({ id: 'radio', name: 'Radio', kind: 'decor', icon: 'sensor', cost: { circuit: 1, copper_wire: 2 }, joy: 8, weight: 0.3, r: 0.25, max: 1, build: () => prop('vintage_radio_transceiver', 1) }),
  D({ id: 'kettle', name: 'Kettle', kind: 'decor', icon: 'drop', cost: { iron_plate: 1, water: 2 }, joy: 6, weight: 0.25, r: 0.2, max: 1, build: () => { const g = new THREE.Group(); g.add(prop('vintage_electric_kettle', 1)); g.add(prop('tea_set_01', 0.8).translateX(0.25)); return g; } }),
  D({ id: 'chair', name: 'Armchair', kind: 'furn', icon: 'socket', cost: { iron_rod: 2, iron_plate: 2 }, joy: 8, weight: 0.6, r: 0.5, max: 2, build: () => prop('modern_arm_chair_01', 1) }),
  D({ id: 'shelf', name: 'Shelf', kind: 'furn', icon: 'crate', cost: { iron_rod: 4 }, joy: 4, weight: 0.6, top: 0.92, r: 0.5, max: 2, build: () => prop('steel_frame_shelves_01', 0.8) }),
  D({ id: 'table', name: 'Crate Table', kind: 'furn', icon: 'crate', cost: { iron_plate: 2 }, joy: 3, weight: 0.65, top: 0.42, r: 0.5, max: 3, build: () => prop('old_military_crate', 1.1) }),
  D({ id: 'rug', name: 'Rug', kind: 'decor', icon: 'fibre', cost: { 'fibre|leaves': 3 }, joy: 6, weight: 0.05, r: 0.8, max: 1, build: () => { const g = new THREE.Group(); const m = mesh(new THREE.BoxGeometry(1.6, 0.015, 1.0), texMat(rugTex()), [0, 0.008, 0]); m.castShadow = false; g.add(m); return g; } }),
  D({ id: 'clock', name: 'Clock', kind: 'decor', icon: 'gauge', cost: { gear: 1, glass: 1 }, joy: 4, weight: 0.12, r: 0.15, max: 1, build: () => prop('alarm_clock_01', 1.5) }),
  D({ id: 'blanket', name: 'Bedroll', kind: 'need', icon: 'bunk', cost: { 'fibre|fruit': 2 }, joy: 5, weight: 0.15, r: 0.6, max: 2, build: () => { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(0.7, 0.1, 1.7), texMat(canvasTex(P.clay, 9)), [0, 0.05, 0])); g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.7, 8), texMat(blanket()), [0, 0.14, -0.7], [0, 0, Math.PI / 2])); return g; } }),
];
export const DECOR_BY: Record<string, DecorDef> = Object.fromEntries(DECOR.map((d) => [d.id, d]));
export const PROP_IDS = ['throw_pillows_01', 'plastic_container', 'industrial_wall_lamp', 'potted_plant_01', 'standing_picture_frame_01', 'vintage_radio_transceiver', 'vintage_electric_kettle', 'tea_set_01', 'modern_arm_chair_01', 'steel_frame_shelves_01', 'old_military_crate', 'alarm_clock_01'];
export const preloadDecor = () => preload(PROP_IDS);

/** the same piece for the UI (the kit's toon material, so the kit renderer inks it): waits for its props to arrive */
export async function decorToon(id: string): Promise<THREE.Object3D | null> {
  const d = DECOR_BY[id]; if (!d) return null;
  await preloadDecor();
  const g = d.build();
  // the props fill on a microtask after their file resolves
  for (let i = 0; i < 20; i++) { let empty = false; g.traverse((o) => { if (o.name.startsWith('ph:') && !o.children.length) empty = true; }); if (!empty) break; await new Promise((r) => setTimeout(r, 30)); }
  g.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const src = m.material as THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
    const isGlow = (src as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    m.material = toon({ map: (src as THREE.MeshLambertMaterial).map ?? null, color: src.color?.getHex?.() ?? 0xffffff, emissive: isGlow ? src.color.getHex() : undefined, emissiveK: isGlow ? 0.6 : undefined });
  });
  g.traverse((o) => { if ((o as THREE.Light).isLight) o.visible = false; });
  return g;
}
