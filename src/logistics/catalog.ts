// The build catalogue as the player sees it: ten category tabs (Techtonica-style), each building's place in them,
// and the colony buildings this system adds (processing stations for the real-item chains, habitat and decoration).
// Machines keep their FDEFS definitions (src/factory/defs.ts); this file only sorts and extends them.
import * as THREE from 'three';
import { FDEFS, FKINDS, registerBuilding, type FKind, type FDef } from '../factory/defs';
import type { MG } from '../factory/models';
import { L } from '../factory/tex';
import { lowpixModel } from '../ui/build/vignette';

export type BuildCat = 'extraction' | 'storage' | 'logistics' | 'processing' | 'power' | 'bio' | 'research' | 'defence' | 'habitat' | 'decor';
export interface CatDef { k: BuildCat; name: string; short: string; key: string }
export const BUILD_CATS: CatDef[] = [
  { k: 'extraction', name: 'Extraction', short: 'EXTRACT', key: 'F1' },
  { k: 'storage', name: 'Storage', short: 'STORAGE', key: 'F2' },
  { k: 'logistics', name: 'Logistics', short: 'LOGISTIC', key: 'F3' },
  { k: 'processing', name: 'Processing', short: 'PROCESS', key: 'F4' },
  { k: 'power', name: 'Power', short: 'POWER', key: 'F5' },
  { k: 'bio', name: 'Bio-engineering', short: 'BIO-ENG', key: 'F6' },
  { k: 'research', name: 'Research', short: 'RESEARCH', key: 'F7' },
  { k: 'defence', name: 'Defence', short: 'DEFENCE', key: 'F8' },
  { k: 'habitat', name: 'Habitat', short: 'HABITAT', key: 'F9' },
  { k: 'decor', name: 'Decoration', short: 'DECOR', key: 'F10' },
];
/** where the older catalogue sections land; single kinds that belong elsewhere are named */
const BY_KIND: Record<string, BuildCat> = {
  pipe: 'logistics', found: 'habitat', wall: 'defence', turret: 'defence', lab: 'research', robotfab: 'processing',
  barracks: 'habitat', depot: 'storage', dam: 'extraction', sluice: 'extraction', pump: 'extraction',
  sprinkler: 'bio', spreader: 'bio', sprayer: 'bio', planter: 'bio', trough: 'bio', pen: 'bio', breeder: 'bio', shed: 'bio',
  research_station: 'research', upgrader: 'research', grav_pole: 'power',
};
const BY_CAT: Record<string, BuildCat> = {
  extract: 'extraction', logistics: 'logistics', production: 'processing', power: 'power', storage: 'storage', eco: 'bio',
  bio: 'bio', special: 'processing', defence: 'defence', research: 'research', habitat: 'habitat', decor: 'decor',
  extraction: 'extraction', processing: 'processing', container: 'storage', containers: 'storage',
};
export function catOf(kind: FKind): BuildCat {
  const d = FDEFS[kind] as FDef & { bcat?: BuildCat };
  return d?.bcat ?? BY_KIND[kind] ?? BY_CAT[d?.cat ?? ''] ?? 'processing';
}
/** buildings in a tab, in catalogue order */
export const kindsIn = (c: BuildCat) => FKINDS.filter((k) => catOf(k) === c && !FDEFS[k]?.hidden);
declare module '../factory/defs' {
  interface FDef {
    /** the build-menu tab (else derived from cat) */
    bcat?: BuildCat;
    /** kept out of the build menu (internal pieces) */
    hidden?: boolean;
    /** worker-seconds of construction work once the materials are on site (else derived from cost and size) */
    work?: number;
    /** the factory-kit stand-in of a building whose world model is a .glb (ghosts, scaffolds, previews) */
    shape?: (m: MG) => void;
  }
}
/** the building's shape as the factory's geometry kit draws it (ghosts, scaffolds, previews): a lowpix building's
 *  stand-in model, else its own model; `key` keeps the two apart in the model cache */
export function shapeOf(kind: FKind): { key: string; hook?: (m: MG) => void } {
  const d = FDEFS[kind] as FDef & { shape?: (m: MG) => void };
  return d?.shape ? { key: kind + ':shape', hook: d.shape } : { key: kind, hook: d?.hooks?.model };
}
/** worker-seconds to raise a building once its materials are delivered */
export function workOf(d: FDef): number {
  if (d.work) return d.work;
  const n = Object.values(d.cost).reduce((s: number, v) => s + (v ?? 0), 0);
  return Math.round(Math.max(3, Math.min(90, 2 + n * 0.35 + d.w * d.d * 1.5)));
}

// ------------------------------------------------------------------ models
type V3 = [number, number, number];
/** a gravel pad with a steel kerb, like the Corps machines stand on */
function pad(m: MG, w: number, d: number) {
  m.box([0, 0.04, 0], [w - 0.06, 0.08, d - 0.06], L.CONCRETE);
  for (const s of [-1, 1]) { m.box([0, 0.06, s * (d / 2 - 0.05)], [w - 0.04, 0.12, 0.08], L.STEEL); m.box([s * (w / 2 - 0.05), 0.06, 0], [0.08, 0.12, d - 0.04], L.STEEL); }
}
const lamp = (m: MG, c: V3) => m.lamp(c);
const MODELS: Record<string, (m: MG) => void> = {
  sawbench: (m) => {
    pad(m, 2, 2);
    for (const x of [-0.7, 0.7]) for (const z of [-0.55, 0.55]) m.box([x, 0.4, z], [0.12, 0.7, 0.12], L.WOOD);
    m.box([0, 0.8, 0], [1.7, 0.1, 1.3], L.WOOD);
    m.box([0, 0.86, 0], [1.72, 0.02, 0.08], L.STEEL);
    m.cyl([0.1, 1.05, 0], 0.32, 0.03, L.STEEL, { axis: 'z', n: 14 });
    m.box([0.1, 1.15, 0], [0.5, 0.18, 0.12], L.HAZARD);
    m.box([-0.5, 0.62, 0.0], [0.42, 0.32, 0.4], L.OLIVE);
    m.cyl([-0.5, 0.62, 0.24], 0.1, 0.06, L.GUN, { axis: 'z', n: 8 });
    for (let i = 0; i < 3; i++) m.cyl([-0.35 + i * 0.25, 0.2, -0.75], 0.1, 1.2, L.WOOD, { axis: 'x', n: 7 });
    for (let i = 0; i < 4; i++) m.box([0.55, 0.92 + i * 0.05, 0.42], [0.6, 0.04, 0.18], L.CREAM);
    lamp(m, [0.75, 1.0, -0.55]);
  },
  kiln: (m) => {
    pad(m, 2, 2);
    m.cyl([0, 0.55, 0], 0.85, 1.0, L.BRICK, { n: 10, r1: 0.7 });
    m.cyl([0, 1.25, 0], 0.7, 0.4, L.BRICK, { n: 10, r1: 0.35 });
    m.cyl([0.35, 1.9, -0.3], 0.13, 1.1, L.BRICK, { n: 6, r1: 0.11 });
    m.cyl([0.35, 2.48, -0.3], 0.16, 0.06, L.RUST, { n: 6 });
    m.box([0, 0.38, 0.8], [0.5, 0.5, 0.12], L.GUN);
    m.box([0, 0.38, 0.87], [0.36, 0.34, 0.02], L.GLASS, { glow: 1 });
    for (const y of [0.3, 0.8]) m.cyl([0, y, 0], 0.87, 0.05, L.RUST, { n: 10, open: true });
    for (let i = 0; i < 4; i++) m.box([-0.75, 0.15 + i * 0.12, 0.6 - (i % 2) * 0.1], [0.4, 0.1, 0.12], L.WOOD, { ry: 0.3 });
    lamp(m, [0.7, 0.9, 0.6]);
  },
  crusher: (m) => {
    pad(m, 2, 2);
    m.box([0, 0.55, 0], [1.4, 0.9, 1.2], L.OLIVE);
    m.box([0, 1.02, 0], [1.44, 0.05, 1.24], L.HAZARD);
    m.hopper([0, 1.45, -0.05], 0.7, 1.3, 0.8, L.STEEL);
    m.cyl([0.86, 0.75, 0], 0.5, 0.12, L.GUN, { axis: 'x', n: 12 });
    m.cyl([0.92, 0.75, 0], 0.12, 0.08, L.STEEL, { axis: 'x', n: 6 });
    m.box([0, 0.3, 0.75], [0.6, 0.25, 0.4], L.STEEL, { rx: -0.35 });
    m.box([-0.45, 0.6, 0.62], [0.3, 0.2, 0.02], L.CREAM);
    lamp(m, [-0.6, 1.15, 0.5]);
  },
  cropplot: (m) => {
    m.box([0, 0.03, 0], [2.94, 0.06, 2.94], L.CONCRETE);
    for (const z of [-0.95, 0, 0.95]) {
      m.box([0, 0.2, z], [2.7, 0.28, 0.78], L.WOOD);
      m.box([0, 0.35, z], [2.6, 0.04, 0.68], L.MOSS);
      for (let i = 0; i < 6; i++) { const x = -1.1 + i * 0.44; m.box([x, 0.48, z - 0.12], [0.06, 0.22, 0.06], L.MOSS, { rz: 0.2 }); m.box([x + 0.05, 0.46, z + 0.14], [0.05, 0.18, 0.05], L.MOSS, { rz: -0.25 }); }
    }
    m.cyl([1.3, 0.35, 1.35], 0.12, 0.7, L.COPPER, { n: 6 });
    m.box([1.3, 0.72, 1.1], [0.05, 0.05, 0.5], L.COPPER);
  },
  feedvat: (m) => {
    pad(m, 2, 2);
    m.cyl([0, 0.75, 0], 0.72, 1.3, L.STEEL, { n: 12 });
    for (const y of [0.3, 0.75, 1.2]) m.cyl([0, y, 0], 0.74, 0.05, L.GUN, { n: 12, open: true });
    m.cyl([0, 1.45, 0], 0.6, 0.12, L.GUN, { n: 12 });
    m.box([0, 1.7, 0], [0.3, 0.3, 0.3], L.OLIVE);
    m.cyl([0, 1.92, 0], 0.06, 0.2, L.STEEL, { n: 6 });
    m.box([0, 0.9, 0.72], [0.22, 0.6, 0.04], L.GLASS, { glow: 1 });
    m.cyl([-0.7, 0.4, 0.55], 0.08, 0.5, L.COPPER, { n: 6 });
    lamp(m, [0.6, 1.5, 0.5]);
  },
  bunkhouse: (m) => {
    m.box([0, 0.06, 0], [2.94, 0.12, 1.94], L.CONCRETE);
    m.box([0, 0.75, 0], [2.7, 1.3, 1.7], L.OLIVE);
    m.box([0, 1.48, 0], [2.86, 0.14, 1.86], L.GUN);
    m.box([0, 1.6, 0], [2.0, 0.12, 1.2], L.GUN);
    m.box([-0.75, 0.62, 0.86], [0.55, 0.95, 0.04], L.WOOD);
    for (const x of [0.25, 0.95]) { m.box([x, 0.95, 0.86], [0.45, 0.32, 0.03], L.GLASS, { glow: 1 }); m.box([x, 0.95, 0.85], [0.52, 0.4, 0.02], L.GUN); }
    m.box([1.2, 1.2, -0.86], [0.3, 0.3, 0.04], L.GRILLE);
    m.cyl([-1.1, 1.85, -0.5], 0.08, 0.6, L.STEEL, { n: 6 });
    lamp(m, [1.25, 1.35, 0.9]);
  },
  messhall: (m) => {
    m.box([0, 0.06, 0], [2.94, 0.12, 2.94], L.CONCRETE);
    m.box([0, 0.85, -0.3], [2.7, 1.5, 2.1], L.CREAM);
    m.box([0, 1.66, -0.3], [2.9, 0.12, 2.3], L.RED);
    m.cyl([0.8, 2.05, -0.8], 0.14, 0.7, L.STEEL, { n: 6 });
    m.box([0, 1.7, 1.1], [2.7, 0.06, 0.9], L.GUN);
    for (const x of [-1.25, 1.25]) m.box([x, 0.9, 1.45], [0.06, 1.6, 0.06], L.STEEL);
    m.box([0, 0.45, 1.05], [1.6, 0.06, 0.5], L.WOOD);
    for (const x of [-0.6, 0.6]) m.box([x, 0.22, 1.05], [0.08, 0.4, 0.08], L.WOOD);
    m.box([-0.6, 0.62, 0.77], [0.7, 1.0, 0.04], L.WOOD);
    m.box([0.6, 1.0, 0.77], [0.8, 0.4, 0.03], L.GLASS, { glow: 1 });
    lamp(m, [1.25, 1.5, 0.8]);
  },
  floodlight: (m) => {
    m.box([0, 0.08, 0], [0.7, 0.16, 0.7], L.CONCRETE);
    m.cyl([0, 1.6, 0], 0.07, 3.0, L.GUN, { n: 6 });
    m.box([0, 3.1, 0], [0.7, 0.1, 0.12], L.GUN);
    for (const x of [-0.25, 0.25]) { m.box([x, 3.25, 0.05], [0.26, 0.22, 0.18], L.OLIVE, { rx: 0.4 }); m.box([x, 3.24, 0.15], [0.2, 0.16, 0.02], L.LAMP, { glow: 1, rx: 0.4 }); }
    m.ladder(0, -0.1, 0.2, 2.9);
  },
  flagpole: (m) => {
    m.box([0, 0.08, 0], [0.6, 0.16, 0.6], L.CONCRETE);
    m.cyl([0, 1.9, 0], 0.04, 3.6, L.STEEL, { n: 6 });
    m.cyl([0, 3.74, 0], 0.07, 0.08, L.BRASS, { n: 6 });
    m.box([0.42, 3.35, 0], [0.8, 0.5, 0.02], L.CREAM);
    m.box([0.42, 3.35, 0.012], [0.8, 0.12, 0.01], L.TEAL);
  },
  fence: (m) => {
    for (const x of [-0.45, 0.45]) m.box([x, 0.5, 0], [0.08, 1.0, 0.08], L.WOOD);
    for (const y of [0.35, 0.75]) m.box([0, y, 0], [1.0, 0.08, 0.04], L.WOOD);
    m.box([0, 0.55, 0], [0.98, 0.02, 0.02], L.STEEL);
  },
  planterbox: (m) => {
    m.box([0, 0.25, 0], [0.9, 0.5, 0.9], L.WOOD);
    m.box([0, 0.48, 0], [0.8, 0.04, 0.8], L.MOSS);
    for (const [x, z, r] of [[-0.2, -0.15, 0.3], [0.15, 0.1, -0.2], [0.05, -0.25, 0.1], [-0.1, 0.22, -0.35]] as const) m.box([x, 0.72, z], [0.08, 0.5, 0.08], L.MOSS, { rz: r, rx: r * 0.6 });
  },
  signpost: (m) => {
    m.box([0, 0.06, 0], [0.4, 0.12, 0.4], L.CONCRETE);
    m.box([0, 1.0, 0], [0.08, 2.0, 0.08], L.GUN);
    m.box([0.25, 1.7, 0], [0.6, 0.22, 0.04], L.CREAM);
    m.box([-0.2, 1.38, 0], [0.5, 0.2, 0.04], L.HAZARD);
  },
  bench: (m) => {
    for (const x of [-0.75, 0.75]) m.box([x, 0.22, 0], [0.1, 0.44, 0.4], L.GUN);
    m.box([0, 0.46, 0], [1.8, 0.06, 0.42], L.WOOD);
    m.box([0, 0.75, -0.2], [1.8, 0.3, 0.05], L.WOOD, { rx: -0.15 });
  },
};

/** the colony buildings the user's lowpix tool built (public/models/logistics/<kind>.glb from src/logistics/lowpix) */
export const LOWPIX_KINDS = new Set(['kiln', 'sawbench', 'crusher', 'feedvat', 'cropplot', 'bunkhouse', 'messhall']);
/** in the world a lowpix building is its .glb, set down when placed; the instanced factory model is an empty footing */
const glbHooks = (kind: string) => ({
  model: (m: MG) => { m.box([0, -3, 0], [0.01, 0.01, 0.01], L.CONCRETE); },
  placed: (b: { x: number; y: number; z: number; r: number; dead: boolean }, f: { render: { group: THREE.Object3D } }) => {
    const put = () => { if (b.dead) return; const g = lowpixModel(kind); if (!g) return; const o = g.clone(true); o.position.set(b.x, b.y, b.z); o.rotation.y = -b.r * Math.PI / 2; f.render.group.add(o); (b as unknown as { __lp?: THREE.Object3D }).__lp = o; };
    if (lowpixModel(kind, put)) put();
  },
  removed: (b: unknown) => { const o = (b as { __lp?: THREE.Object3D }).__lp; o?.removeFromParent(); },
});
const B = (kind: string, name: string, bcat: BuildCat, w: number, d: number, h: number, cost: FDef['cost'], power: number, desc: string, x: Partial<FDef> = {}) =>
  registerBuilding({ kind, name, bcat, cat: 'special', w, d, h, cost, power, hp: 400, desc, hooks: LOWPIX_KINDS.has(kind) ? glbHooks(kind) : { model: MODELS[kind] }, ...(LOWPIX_KINDS.has(kind) ? { shape: MODELS[kind] } : {}), ...x } as Partial<FDef> & Pick<FDef, 'kind' | 'name' | 'w' | 'd'>);

let done = false;
/** add the colony buildings (once, before the catalogue is shown) */
export function registerColonyBuildings() {
  if (done) return; done = true;
  B('sawbench', 'Sawbench', 'processing', 2, 2, 1.4, { ore: 8, carbon: 10 }, 2, 'A bench saw on a cast frame. Logs in, sawn planks out; the offcuts go to the kiln.', { station: 'saw', operable: true, skill: 'works' });
  B('kiln', 'Charcoal Kiln', 'processing', 2, 2, 2.5, { soil: 20, ore: 4 }, 0, 'A brick dome that burns wood starved of air: charcoal for the smelters and the boilers.', { station: 'kiln', operable: true, skill: 'works' });
  B('crusher', 'Jaw Crusher', 'processing', 2, 2, 2.0, { ore: 14, iron_plate: 4 }, 6, 'Two jaws and a flywheel break raw ore to gravel-sized crushed ore. Crushed ore smelts faster and cleaner.', { station: 'crusher', operable: true, skill: 'works' });
  B('cropplot', 'Crop Plot', 'bio', 3, 3, 0.8, { soil: 24, carbon: 8 }, 0, 'Raised timber beds. Soil, seed and water in; a crop comes up on a cycle. Tended plots grow faster.', { station: 'plot', operable: true, solid: false, skill: 'works' });
  B('feedvat', 'Feedstock Vat', 'bio', 2, 2, 2.0, { iron_plate: 6, glass: 2, ore: 6 }, 3, 'A stirred, heated tank that digests biomass into feedstock: the nutrient paste the engineered creatures are grown and fed on.', { station: 'vat', operable: true, skill: 'works' });
  B('bunkhouse', 'Bunkhouse', 'habitat', 3, 2, 1.8, { ore: 12, carbon: 16, soil: 10 }, 1, 'Bunks, lockers and a stove. Each one houses four more workers; rested workers keep their mood.', { input: 'none', output: 'none', store: 0, skill: 'works', work: 20 });
  B('messhall', 'Mess Hall', 'habitat', 3, 3, 2.0, { ore: 16, carbon: 20, soil: 14 }, 2, 'A galley and long tables. Haul food in; hungry workers eat here and come back happier than from a trough.', { input: 'all', output: 'none', store: 80, skill: 'works', work: 26 });
  B('floodlight', 'Floodlight Mast', 'decor', 1, 1, 3.4, { ore: 4, copper_wire: 1 }, 1, 'Two lamps on a mast. Night shifts work faster in the light.', { input: 'none', output: 'none', solid: false, skill: 'works', work: 4 });
  B('flagpole', 'UNAA Flagpole', 'decor', 1, 1, 3.8, { ore: 3 }, 0, 'The program flag over the settlement.', { input: 'none', output: 'none', solid: false, skill: 'works', work: 3 });
  B('fence', 'Timber Fence', 'decor', 1, 1, 1.0, { carbon: 2 }, 0, 'Post-and-rail fencing. Drag to lay a run.', { input: 'none', output: 'none', skill: 'works', work: 1 });
  B('planterbox', 'Planter Box', 'decor', 1, 1, 0.9, { carbon: 3, soil: 4 }, 0, 'A box of hardy shrubs.', { input: 'none', output: 'none', solid: false, skill: 'works', work: 2 });
  B('signpost', 'Signpost', 'decor', 1, 1, 2.0, { ore: 1, carbon: 1 }, 0, 'A stencilled direction board.', { input: 'none', output: 'none', solid: false, skill: 'works', work: 1 });
  B('bench', 'Bench', 'decor', 2, 1, 0.9, { carbon: 4 }, 0, 'Somewhere for the crew to sit at shift change.', { input: 'none', output: 'none', solid: false, skill: 'works', work: 2 });
}
