// Factory items. Raw materials (ore, carbon, water, soil: the same four the golem gathers, plus the seams the
// factory opens: copper, coal and quartz, and fruit for the workers), refined parts and assemblies, fuel, research
// and ammunition. Each has a hand-drawn 16 px icon in the master palette: planes filled one ramp step each, light
// from the upper left, selective outline. The icons also go on the belts (iconArray: one texture layer per item).
import * as THREE from 'three';
import { Pix, KPix, poly, selout, RA, INKC, type Pt } from './paint';
import type { Res } from '../game/skills';
import { itemIcon as hiItemURL, hiItem, ITEM_ICON_NAMES } from '../ui/icons';

export type BaseItemId =
  | 'ore' | 'carbon' | 'water' | 'soil' | 'copper_ore' | 'coal' | 'crystal' | 'fruit'
  | 'iron_ingot' | 'copper_ingot' | 'steel_ingot' | 'glass' | 'concrete' | 'rubber' | 'plastic'
  | 'iron_plate' | 'iron_rod' | 'screw' | 'copper_wire' | 'cable' | 'steel_beam' | 'gear'
  | 'reinforced_plate' | 'rotor' | 'frame' | 'circuit' | 'vacuum_tube' | 'motor' | 'ammo'
  | 'servo' | 'control_unit' | 'heavy_frame' | 'reactor_core' | 'report' | 'tape' | 'steam'
  | 'iron_pellet' | 'silk' | 'resin' | 'bio_oil' | 'glass_bead' | 'protein' | 'algae_fuel' | 'dung' | 'herbicide';
/** item ids: the base set plus anything registered later (registerItem: the biotech producers add their own) */
export type ItemId = BaseItemId | (string & {});
export type ItemCat = 'raw' | 'bio' | 'refined' | 'part' | 'assembly' | 'advanced' | 'research' | 'internal';
export interface ItemDef {
  id: ItemId; name: string; cat: ItemCat; desc: string;
  /** colour of the crate sides on a belt */
  side: number;
  /** burn value in a boiler (seconds of steam), food value for a worker */
  fuel?: number; food?: number;
  /** maps to one of the golem's raw materials (run.res) */
  res?: Res;
}
const I = (id: ItemId, name: string, cat: ItemCat, side: number, desc: string, x: Partial<ItemDef> = {}): ItemDef => ({ id, name, cat, side, desc, ...x });
export const ITEMS: Record<ItemId, ItemDef> = {
  ore: I('ore', 'Ferrite Ore', 'raw', RA.rust[2], 'Rust-red ore from the ferrite seams. Smelts to iron.', { res: 'ore' }),
  carbon: I('carbon', 'Plant Carbon', 'raw', RA.ochre[2], 'Husk and stalk carbon. Burns in a boiler, feeds workers in a pinch, refines to rubber.', { res: 'carbon', fuel: 4, food: 0.5 }),
  water: I('water', 'Water (canned)', 'raw', RA.water[4], 'Pumped and sealed in Corps-issue cans.', { res: 'water' }),
  soil: I('soil', 'Soil', 'raw', RA.soil[3], 'Excavated earth: concrete, glass, and the grow sheds.', { res: 'soil' }),
  copper_ore: I('copper_ore', 'Copper Ore', 'raw', RA.teal[3], 'Green-veined rock from the copper seams.'),
  coal: I('coal', 'Coal', 'raw', RA.basalt[1], 'Black seam coal: boilers, steel and plastic.', { fuel: 8 }),
  crystal: I('crystal', 'Quartz Crystal', 'raw', RA.sky[3], 'Clear quartz from the crystal seams: oscillators and reactor cores.'),
  fruit: I('fruit', 'Fruit', 'raw', RA.coral[3], 'Ripe fruit from the plants and the grow sheds. What the workers like to eat.', { food: 1.5 }),
  iron_ingot: I('iron_ingot', 'Iron Ingot', 'refined', RA.steel[3], 'Cast iron, still warm.'),
  copper_ingot: I('copper_ingot', 'Copper Ingot', 'refined', RA.rust[4], 'Soft red copper.'),
  steel_ingot: I('steel_ingot', 'Steel Ingot', 'refined', RA.slate[3], 'Iron and coal in the foundry: hard steel.'),
  glass: I('glass', 'Glass', 'refined', RA.water[5], 'Soil silica melted clear.'),
  concrete: I('concrete', 'Concrete', 'refined', RA.stone[5], 'Soil, burned and set.'),
  rubber: I('rubber', 'Rubber', 'refined', RA.basalt[2], 'Plant carbon and water in the refinery.'),
  plastic: I('plastic', 'Bakelite', 'refined', RA.clay[2], 'Phenolic plastic: coal and water, cooked.'),
  iron_plate: I('iron_plate', 'Iron Plate', 'part', RA.steel[4], 'Rolled plate, punched for rivets.'),
  iron_rod: I('iron_rod', 'Iron Rod', 'part', RA.steel[3], 'Drawn rod stock.'),
  screw: I('screw', 'Screws', 'part', RA.steel[5], 'A box of machine screws.'),
  copper_wire: I('copper_wire', 'Copper Wire', 'part', RA.rust[4], 'Drawn wire on a wooden spool.'),
  cable: I('cable', 'Cable', 'part', RA.basalt[2], 'Rubber-sheathed wire. Power lines.'),
  steel_beam: I('steel_beam', 'Steel Beam', 'part', RA.slate[4], 'An I-beam.'),
  gear: I('gear', 'Gear', 'part', RA.steel[4], 'A cut spur gear.'),
  reinforced_plate: I('reinforced_plate', 'Reinforced Plate', 'assembly', RA.olive[4], 'Plate strapped and screwed double.'),
  rotor: I('rotor', 'Rotor', 'assembly', RA.rust[3], 'Rod, laminations and screws.'),
  frame: I('frame', 'Modular Frame', 'assembly', RA.steel[4], 'A welded truss: the skeleton of every machine.'),
  circuit: I('circuit', 'Circuit Board', 'assembly', RA.clay[3], 'Printed copper on Bakelite. Very modern.'),
  vacuum_tube: I('vacuum_tube', 'Vacuum Tube', 'assembly', RA.glowAmber[1], 'A glass valve with a hot filament.'),
  motor: I('motor', 'Motor', 'assembly', RA.olive[3], 'An enamelled electric motor.'),
  ammo: I('ammo', 'Ammunition', 'assembly', RA.brass[3], 'Brass cartridges for the turrets.'),
  servo: I('servo', 'Servo', 'advanced', RA.olive[4], 'Motor, gears and a feedback circuit: a robot joint.'),
  control_unit: I('control_unit', 'Control Unit', 'advanced', RA.olive[3], 'An analog computer in a box: a robot brain.'),
  heavy_frame: I('heavy_frame', 'Heavy Frame', 'advanced', RA.slate[3], 'Beams, frames and concrete ballast.'),
  reactor_core: I('reactor_core', 'Reactor Core', 'advanced', RA.glowTeal[1], 'A quartz-moderated fuel assembly. Handle with tongs.', { fuel: 300 }),
  report: I('report', 'Survey Report', 'research', RA.paper[4], 'Plates, wire and measurements, typed up. The research lab reads them.'),
  tape: I('tape', 'Data Tape', 'research', RA.ink[2], 'A reel of recorded analysis. Worth a lot to the lab.'),
  steam: I('steam', 'Steam', 'internal', RA.snow[4], 'Pressure from the boiler.'),
  // the living route: what engineered creatures and plants produce, and what the pens and sheds give
  iron_pellet: I('iron_pellet', 'Iron Pellets', 'bio', RA.rust[3], 'Rock eaten by ore-gizzard grazers and passed as clean iron pellets. Smelts faster than ore.'),
  silk: I('silk', 'Silk', 'bio', RA.straw[4], 'Spun from engineered glands. Insulation, rope, cable.'),
  resin: I('resin', 'Resin', 'bio', RA.ochre[4], 'Tapped from resin trees. Refines to Bakelite and rubber.'),
  bio_oil: I('bio_oil', 'Bio-Oil', 'bio', RA.ichor[3], 'Pressed from oil fruit and seed. Burns in a boiler; refines to plastic.', { fuel: 6 }),
  glass_bead: I('glass_bead', 'Glass Beads', 'bio', RA.water[5], 'Silica beads grown by crystal corals. Melts to glass.'),
  protein: I('protein', 'Protein', 'bio', RA.flesh[4], 'Milk and meal from the herds. Good food for workers.', { food: 2.5 }),
  algae_fuel: I('algae_fuel', 'Algae Fuel', 'bio', RA.ichor[2], 'Skimmed from biofuel ponds. A clean boiler fuel.', { fuel: 10 }),
  dung: I('dung', 'Dung', 'bio', RA.soil[2], 'From the pens and the herds. The fertiliser spreader wants it.'),
  herbicide: I('herbicide', 'Herbicide', 'refined', RA.ichor[4], 'A defoliant in drums: the sprayer kills plants and sickens creatures with it.'),
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const ITEM_INDEX: Record<ItemId, number> = Object.fromEntries(ITEM_IDS.map((k, i) => [k, i])) as Record<ItemId, number>;
/** add an item (another system's producers): its definition and, optionally, an icon painter on a 16 px Pix */
export function registerItem(def: ItemDef, icon?: (p: KPix) => void) {
  if (!ITEMS[def.id]) { ITEM_IDS.push(def.id); ITEM_INDEX[def.id] = ITEM_IDS.length - 1; }
  ITEMS[def.id] = def;
  if (icon) ICON[def.id] = icon;
  pixCache.delete(def.id); for (const k of [...urlCache.keys()]) if (k.startsWith(def.id + '@')) urlCache.delete(k);
  if (ARR) { ARR.dispose(); ARR = null; }
}
/** the raw materials that live in the golem's hold (run.res) */
export const RAW_RES: ItemId[] = ['ore', 'carbon', 'water', 'soil'];
export const isRes = (id: ItemId): id is Res => id === 'ore' || id === 'carbon' || id === 'water' || id === 'soil';

// ------------------------------------------------------------------ icons
/** the icon set in the target style lives in ui/icons.ts (hiItem); these 16-unit drawings, landing at 32 px with a
 *  coloured outline, are the fallback for anything it does not draw */
const S = 32;
const HI = new Set<string>(ITEM_ICON_NAMES);
const hasHi = (id: ItemId) => HI.has(id) || !ICON[id];
type Painter = (p: KPix) => void;
/** a fractured lump: angular facets, each one ramp step by how it faces the light */
function lump(p: KPix, R: number[], o: Pt[], cx: number, cy: number, base = 2) {
  // fan of facets from a point up-left of centre: facets facing up/left are lit
  const c: Pt = [cx - 1, cy - 1];
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    const mx = (a[0] + b[0]) / 2 - c[0], my = (a[1] + b[1]) / 2 - c[1];
    const lit = (-mx - my * 1.3) / (Math.hypot(mx, my) + 0.01);
    poly(p, [c, a, b], R[Math.max(0, Math.min(R.length - 1, Math.round(base + lit * 1.4)))]);
  }
}
function ingot(p: KPix, R: number[], mark = -1) {
  poly(p, [[5, 4], [12, 4], [13, 7], [4, 7]], R[5]);
  poly(p, [[4, 7], [13, 7], [15, 12], [2, 12]], R[3]);
  poly(p, [[13, 7], [12, 4], [14, 8], [15, 12]], R[2]);
  p.hl(5, 11, 4, R[6] ?? R[5]); p.hl(4, 12, 7, R[4]);
  if (mark >= 0) { p.hl(7, 9, 5, mark); p.set(8, 6, mark); }
  selout(p, R[1]);
}
const ICON: Partial<Record<ItemId, Painter>> = {
  iron_pellet: (p) => {
    const R = RA.rust;
    for (const [x, y, k] of [[3, 9, 4], [7, 6, 3], [9, 10, 4], [5, 12, 3], [11, 6, 2], [12, 11, 3]] as const) { poly(p, [[x, y], [x + 2, y - 1], [x + 3, y + 1], [x + 1, y + 2]], R[k]); p.set(x + 1, y, R[k + 2]); }
    selout(p, R[1]);
  },
  silk: (p) => {
    const R = RA.straw;
    poly(p, [[3, 5], [8, 2], [13, 5], [13, 11], [8, 14], [3, 11]], R[3]); poly(p, [[3, 5], [8, 2], [9, 3], [5, 7], [4, 11], [3, 11]], R[5]);
    for (let k = 0; k < 4; k++) p.line(4, 6 + k * 2, 12, 4 + k * 2, R[k % 2 ? 2 : 4]);
    p.line(12, 12, 15, 15, R[4]);
    selout(p, R[1]);
  },
  resin: (p) => {
    const R = RA.ochre;
    poly(p, [[7, 2], [10, 6], [12, 10], [10, 14], [5, 14], [3, 10], [5, 6]], R[4]); poly(p, [[7, 2], [5, 6], [3, 10], [5, 12], [6, 7]], R[6]);
    poly(p, [[10, 14], [12, 10], [11, 9], [8, 13]], R[2]); p.set(6, 8, 0xd6c79c);
    selout(p, R[1]);
  },
  bio_oil: (p) => {
    const R = RA.steel, O = RA.ichor;
    p.rect(4, 4, 8, 10, R[3]); p.rect(4, 4, 2, 10, R[5]); p.rect(10, 4, 2, 10, R[1]);
    p.rect(4, 7, 8, 4, O[3]); p.rect(4, 7, 2, 4, O[4]); p.rect(10, 7, 2, 4, O[1]);
    p.hl(5, 10, 3, R[4]); p.hl(4, 11, 6, R[2]); p.hl(4, 11, 11, R[2]); p.set(8, 2, R[5]);
    selout(p, R[1]);
  },
  glass_bead: (p) => {
    const R = RA.water;
    for (const [x, y] of [[3, 8], [7, 5], [10, 9], [6, 11], [11, 4]] as const) { poly(p, [[x, y + 1], [x + 1, y], [x + 3, y], [x + 4, y + 1], [x + 4, y + 2], [x + 3, y + 3], [x + 1, y + 3], [x, y + 2]], R[4]); p.set(x + 1, y + 1, R[6]); p.set(x + 3, y + 2, R[2]); }
    selout(p, R[1]);
  },
  protein: (p) => {
    const R = RA.paper, F = RA.flesh;
    p.rect(4, 5, 8, 9, R[4]); p.rect(4, 5, 2, 9, R[5]); p.rect(10, 5, 2, 9, R[2]);
    poly(p, [[4, 5], [6, 2], [10, 2], [12, 5]], R[3]); p.hl(6, 9, 2, R[5]);
    p.rect(5, 8, 6, 3, F[4]); p.hl(5, 10, 8, F[5]);
    selout(p, R[1]);
  },
  algae_fuel: (p) => {
    const R = RA.olive, A = RA.ichor;
    p.rect(3, 4, 10, 10, R[3]); p.rect(3, 4, 2, 10, R[4]); p.rect(11, 4, 2, 10, R[1]);
    p.hl(3, 12, 6, R[1]); p.hl(3, 12, 11, R[1]);
    p.rect(5, 7, 6, 3, A[3]); p.set(6, 8, A[4]); p.set(9, 8, A[2]);
    p.rect(9, 2, 3, 2, R[2]);
    selout(p, R[0]);
  },
  dung: (p) => {
    const R = RA.soil;
    lump(p, R, [[2, 13], [4, 9], [7, 8], [8, 5], [11, 6], [13, 9], [14, 13]], 8, 11, 2);
    p.set(6, 11, R[4]); p.set(10, 8, R[4]); p.set(9, 12, R[1]);
    selout(p, R[0]);
  },
  herbicide: (p) => {
    const R = RA.olive, Y = RA.glowAmber;
    p.rect(4, 3, 8, 11, R[4]); p.rect(4, 3, 2, 11, R[5]); p.rect(10, 3, 2, 11, R[2]);
    p.hl(4, 11, 5, R[1]); p.hl(4, 11, 12, R[1]);
    p.rect(6, 7, 4, 3, Y[3]); p.set(7, 8, RA.ink[1]); p.set(8, 8, RA.ink[1]);
    selout(p, R[1]);
  },
  ore: (p) => {
    lump(p, RA.stone, [[3, 6], [6, 3], [11, 3], [14, 7], [13, 12], [8, 14], [3, 12]], 8, 8, 3);
    for (const [x, y, k] of [[6, 6, 4], [7, 6, 5], [6, 7, 3], [10, 9, 4], [11, 9, 3], [10, 10, 2], [8, 11, 3], [11, 5, 4]] as const) p.set(x, y, RA.rust[k]);
    selout(p, RA.stone[1]);
  },
  copper_ore: (p) => {
    lump(p, RA.stone, [[2, 7], [5, 3], [10, 4], [14, 6], [14, 11], [9, 14], [4, 12]], 8, 8, 3);
    for (const [x, y, k] of [[5, 6, 4], [6, 6, 5], [6, 7, 3], [9, 9, 4], [10, 9, 5], [10, 10, 3], [11, 6, 4], [7, 11, 3]] as const) p.set(x, y, RA.teal[k]);
    p.set(12, 9, RA.rust[4]); p.set(4, 9, RA.rust[3]);
    selout(p, RA.stone[1]);
  },
  coal: (p) => {
    lump(p, RA.basalt, [[3, 8], [5, 4], [9, 2], [13, 5], [14, 10], [10, 14], [4, 13]], 8, 8, 2);
    p.set(6, 5, RA.slate[5]); p.set(7, 5, RA.slate[4]); p.set(11, 6, RA.slate[4]);
    selout(p, RA.basalt[0]);
  },
  crystal: (p) => {
    const C = RA.snow;
    poly(p, [[4, 13], [3, 7], [5, 4], [7, 7], [7, 13]], C[2]); poly(p, [[3, 7], [5, 4], [5, 13], [4, 13]], C[4]);
    poly(p, [[7, 14], [6, 5], [9, 1], [11, 5], [11, 14]], C[3]); poly(p, [[6, 5], [9, 1], [9, 14], [7, 14]], C[5]);
    poly(p, [[11, 14], [11, 8], [13, 6], [14, 9], [13, 14]], C[1]); poly(p, [[11, 8], [13, 6], [13, 14], [11, 14]], C[3]);
    p.vl(8, 4, 8, C[5]); p.set(9, 2, 0xe2e1d8);
    selout(p, C[0]);
  },
  carbon: (p) => {
    const R = RA.ochre;
    poly(p, [[2, 11], [8, 3], [11, 4], [6, 13]], R[3]); poly(p, [[2, 11], [8, 3], [9, 4], [4, 12]], R[5]);
    poly(p, [[6, 13], [12, 6], [14, 8], [9, 14]], R[2]); poly(p, [[6, 13], [12, 6], [13, 7], [8, 14]], R[4]);
    for (let k = 0; k < 4; k++) p.set(4 + k * 1, 10 - k * 2, R[1]);
    p.set(10, 10, R[1]); p.set(11, 9, R[1]);
    selout(p, R[0]);
  },
  water: (p) => {
    const R = RA.steel, W = RA.water;
    p.rect(4, 4, 8, 10, R[4]); p.rect(4, 4, 2, 10, R[5]); p.rect(10, 4, 2, 10, R[2]);
    p.hl(5, 10, 3, R[5]); p.hl(5, 10, 2, R[3]); p.set(9, 2, R[6]);
    p.rect(4, 7, 8, 4, W[4]); p.rect(4, 7, 2, 4, W[5]); p.rect(10, 7, 2, 4, W[2]);
    p.hl(4, 11, 6, R[2]); p.hl(4, 11, 11, R[2]); p.hl(5, 10, 14, R[2]);
    p.set(7, 8, W[6]); p.set(8, 9, W[6]);
    selout(p, R[1]);
  },
  soil: (p) => {
    const R = RA.soil;
    lump(p, R, [[1, 13], [4, 8], [7, 6], [10, 7], [14, 10], [15, 13]], 8, 11, 3);
    poly(p, [[5, 9], [7, 5], [9, 6], [8, 9]], R[5]);
    p.set(4, 12, R[1]); p.set(10, 11, R[1]); p.set(12, 12, R[2]); p.set(7, 11, R[6]);
    selout(p, R[1]);
  },
  fruit: (p) => {
    const R = RA.coral, L = RA.moss;
    poly(p, [[5, 6], [8, 4], [11, 5], [13, 8], [13, 11], [11, 14], [6, 14], [3, 11], [3, 8]], R[3]);
    poly(p, [[5, 6], [8, 4], [9, 5], [7, 8], [4, 10], [3, 8]], R[5]);
    poly(p, [[11, 14], [13, 11], [13, 8], [11, 12], [8, 14]], R[2]);
    p.set(6, 6, 0xc49580); p.vl(8, 2, 4, RA.fur[2]);
    poly(p, [[9, 3], [12, 1], [14, 2], [11, 4]], L[4]); p.set(12, 2, L[5]);
    selout(p, R[1]);
  },
  iron_ingot: (p) => ingot(p, RA.steel),
  copper_ingot: (p) => ingot(p, RA.rust),
  steel_ingot: (p) => ingot(p, RA.slate, RA.slate[1]),
  glass: (p) => {
    const R = RA.water;
    poly(p, [[2, 6], [9, 3], [14, 7], [7, 11]], R[5]); poly(p, [[2, 6], [7, 11], [7, 13], [2, 8]], R[3]); poly(p, [[7, 11], [14, 7], [14, 9], [7, 13]], R[2]);
    p.line(5, 6, 8, 5, 0xcfd2cc); p.line(8, 8, 11, 7, R[6]);
    selout(p, R[1]);
  },
  concrete: (p) => {
    const R = RA.stone;
    poly(p, [[2, 6], [8, 3], [14, 6], [8, 9]], R[6]); poly(p, [[2, 6], [8, 9], [8, 14], [2, 11]], R[4]); poly(p, [[8, 9], [14, 6], [14, 11], [8, 14]], R[3]);
    for (const [x, y, c] of [[5, 6, 4], [10, 5, 5], [4, 10, 2], [11, 10, 1], [6, 12, 3]] as const) p.set(x, y, R[c]);
    selout(p, R[1]);
  },
  rubber: (p) => {
    const R = RA.basalt;
    poly(p, [[2, 7], [8, 4], [14, 7], [8, 10]], R[4]); poly(p, [[2, 7], [8, 10], [8, 13], [2, 10]], R[2]); poly(p, [[8, 10], [14, 7], [14, 10], [8, 13]], R[1]);
    p.hl(6, 9, 6, R[5]); p.hl(7, 10, 7, R[3]);
    selout(p, R[0], RA.ink[0]);
  },
  plastic: (p) => {
    const R = RA.clay;
    for (let k = 0; k < 3; k++) { const y = 9 - k * 2; poly(p, [[2, y], [8, y - 3], [14, y], [8, y + 3]], R[4 - (k === 2 ? 0 : 1) + (k === 2 ? 1 : 0)]); p.line(2, y + 1, 8, y + 4, R[1]); p.line(8, y + 4, 14, y + 1, R[0]); }
    selout(p, R[1]);
  },
  iron_plate: (p) => {
    const R = RA.steel;
    poly(p, [[1, 8], [8, 4], [15, 8], [8, 12]], R[4]); poly(p, [[1, 8], [8, 12], [8, 13], [1, 9]], R[2]); poly(p, [[8, 12], [15, 8], [15, 9], [8, 13]], R[1]);
    poly(p, [[3, 8], [8, 5], [9, 6], [4, 9]], R[5]);
    for (const [x, y] of [[4, 8], [8, 6], [12, 8], [8, 10]]) p.set(x, y, R[1]);
    selout(p, R[1]);
  },
  iron_rod: (p) => {
    const R = RA.steel;
    for (const o of [0, 4]) { p.line(2 + o, 12, 11 + o, 3, R[4]); p.line(3 + o, 12, 12 + o, 3, R[2]); p.line(2 + o, 11, 10 + o, 3, R[5]); }
    selout(p, R[1]);
  },
  screw: (p) => {
    const R = RA.steel;
    for (const [ox, oy] of [[0, 0], [6, 3]] as const) {
      poly(p, [[2 + ox, 4 + oy], [6 + ox, 2 + oy], [7 + ox, 4 + oy], [3 + ox, 6 + oy]], R[5]);
      for (let k = 0; k < 5; k++) { p.set(5 + ox + k, 5 + oy + k, k % 2 ? R[2] : R[4]); p.set(4 + ox + k, 6 + oy + k, R[3]); }
      p.line(3 + ox, 3 + oy, 5 + ox, 2 + oy, R[1]);
    }
    selout(p, R[1]);
  },
  copper_wire: (p) => {
    const W = RA.ochre, C = RA.rust;
    poly(p, [[2, 4], [5, 2], [6, 13], [3, 14]], W[4]); poly(p, [[10, 4], [13, 2], [14, 13], [11, 14]], W[3]);
    for (let y = 4; y <= 12; y += 2) { p.line(5, y, 11, y - 1, C[5]); p.line(5, y + 1, 11, y, C[3]); }
    p.line(12, 6, 15, 9, C[4]);
    selout(p, W[1]);
  },
  cable: (p) => {
    const R = RA.basalt;
    for (let k = 0; k < 3; k++) { const y = 5 + k * 3; poly(p, [[2, y + 1], [7, y - 1], [14, y + 1], [9, y + 3]], R[3 - k % 2]); p.line(3, y + 1, 7, y, R[4]); }
    p.rect(13, 12, 2, 2, RA.rust[5]); p.set(15, 13, RA.rust[3]);
    selout(p, R[0]);
  },
  steel_beam: (p) => {
    const R = RA.slate;
    poly(p, [[1, 6], [11, 1], [14, 3], [4, 8]], R[5]); poly(p, [[6, 6], [11, 4], [11, 9], [6, 11]], R[2]);
    poly(p, [[1, 11], [11, 6], [14, 8], [4, 13]], R[4]); poly(p, [[4, 13], [14, 8], [14, 9], [4, 14]], R[1]); poly(p, [[4, 8], [14, 3], [14, 4], [4, 9]], R[2]);
    selout(p, R[0]);
  },
  gear: (p) => {
    const R = RA.steel, pts: Pt[] = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + 0.2, r = i % 2 ? 6.8 : 5; pts.push([8 + Math.cos(a) * r, 8 + Math.sin(a) * r * 0.86]); }
    poly(p, pts, R[3]);
    poly(p, pts.filter((_, i) => i >= 8 && i <= 13).concat([[8, 8]]), R[5]);
    poly(p, [[6, 6], [10, 6], [10, 10], [6, 10]], R[1]); p.set(6, 6, R[3]); p.set(10, 10, R[3]); p.set(7, 7, R[0]);
    selout(p, R[1]);
  },
  reinforced_plate: (p) => {
    const R = RA.olive, S2 = RA.steel;
    poly(p, [[1, 8], [8, 4], [15, 8], [8, 12]], R[4]); poly(p, [[1, 8], [8, 12], [8, 14], [1, 10]], R[2]); poly(p, [[8, 12], [15, 8], [15, 10], [8, 14]], R[1]);
    p.line(3, 9, 12, 5, S2[5]); p.line(4, 7, 13, 11, S2[5]); p.line(4, 10, 12, 6, S2[2]);
    for (const [x, y] of [[4, 8], [8, 6], [12, 8], [8, 10]]) p.set(x, y, S2[6]);
    selout(p, R[1]);
  },
  rotor: (p) => {
    const R = RA.rust, S2 = RA.steel;
    p.line(1, 12, 14, 3, S2[4]); p.line(2, 12, 15, 3, S2[2]);
    for (let k = 0; k < 4; k++) { const x = 5 + k * 2, y = 10 - k * 1.4; poly(p, [[x - 2, y - 2], [x + 1, y - 4], [x + 3, y + 1], [x, y + 3]], R[k % 2 ? 3 : 4]); p.line(x - 2, y - 2, x + 1, y - 4, R[5]); }
    selout(p, R[1]);
  },
  frame: (p) => {
    const R = RA.steel;
    const sq: Pt[] = [[2, 7], [8, 3], [14, 7], [8, 11]];
    for (let i = 0; i < 4; i++) { const a = sq[i], b = sq[(i + 1) % 4]; p.line(a[0], a[1], b[0], b[1], R[5]); p.line(a[0], a[1] + 3, b[0], b[1] + 3, R[3]); p.vl(a[0], a[1], a[1] + 3, R[4]); }
    p.line(2, 7, 14, 7, R[2]); p.line(8, 3, 8, 11, R[2]); p.line(4, 10, 8, 14, R[3]);
    selout(p, R[1]);
  },
  circuit: (p) => {
    const R = RA.clay, C = RA.rust;
    poly(p, [[1, 8], [8, 4], [15, 8], [8, 12]], R[3]); poly(p, [[1, 8], [8, 12], [8, 13], [1, 9]], R[1]); poly(p, [[8, 12], [15, 8], [15, 9], [8, 13]], R[0]);
    p.line(4, 8, 8, 6, C[5]); p.line(8, 6, 11, 8, C[5]); p.line(6, 9, 10, 7, C[4]); p.line(8, 10, 12, 8, C[5]);
    p.rect(7, 7, 2, 2, RA.basalt[2]); p.set(4, 8, C[6]); p.set(12, 8, C[6]);
    selout(p, R[0]);
  },
  vacuum_tube: (p) => {
    const G = RA.water, A = RA.glowAmber, B = RA.basalt;
    poly(p, [[5, 13], [5, 5], [6, 3], [8, 2], [10, 3], [11, 5], [11, 13]], G[4], 220);
    poly(p, [[5, 13], [5, 5], [6, 3], [7, 3], [6, 5], [6, 13]], G[6], 230);
    p.vl(8, 6, 11, A[4]); p.vl(9, 7, 10, A[3]); p.set(8, 5, A[3]); p.hl(7, 9, 12, B[3]);
    p.rect(5, 13, 7, 2, B[2]); p.hl(5, 11, 13, B[4]); p.set(6, 15, RA.brass[4]); p.set(10, 15, RA.brass[4]);
    selout(p, G[1]);
  },
  motor: (p) => {
    const R = RA.olive, S2 = RA.steel;
    poly(p, [[2, 6], [9, 3], [13, 5], [6, 9]], R[5]); poly(p, [[2, 6], [6, 9], [6, 13], [2, 10]], R[3]); poly(p, [[6, 9], [13, 5], [13, 9], [6, 13]], R[2]);
    for (let k = 0; k < 3; k++) p.line(7 + k * 2, 8 - k, 7 + k * 2, 12 - k, R[1]);
    p.line(13, 7, 15, 6, S2[5]); p.set(15, 7, S2[3]);
    poly(p, [[1, 12], [6, 15], [8, 14], [3, 11]], RA.basalt[2]);
    selout(p, R[1]);
  },
  ammo: (p) => {
    const B = RA.brass, C = RA.rust;
    for (const ox of [2, 6, 10]) {
      p.rect(ox, 6, 3, 8, B[3]); p.vl(ox, 6, 13, B[5]); p.vl(ox + 2, 6, 13, B[1]);
      poly(p, [[ox, 6], [ox + 1, 3], [ox + 2, 3], [ox + 3, 6]], C[4]); p.set(ox + 1, 4, C[5]);
      p.hl(ox, ox + 2, 13, B[2]);
    }
    selout(p, B[0]);
  },
  servo: (p) => {
    const R = RA.olive, S2 = RA.steel;
    poly(p, [[2, 7], [8, 4], [13, 6], [7, 9]], R[5]); poly(p, [[2, 7], [7, 9], [7, 14], [2, 12]], R[3]); poly(p, [[7, 9], [13, 6], [13, 11], [7, 14]], R[2]);
    p.rect(8, 3, 2, 3, S2[4]); poly(p, [[5, 2], [9, 1], [13, 3], [9, 4]], S2[5]); p.set(9, 2, S2[1]);
    p.set(4, 10, RA.stampRed[3]); p.set(10, 10, RA.glowAmber[3]);
    selout(p, R[1]);
  },
  control_unit: (p) => {
    const R = RA.olive, P = RA.glowTeal;
    poly(p, [[1, 5], [8, 2], [15, 5], [8, 8]], R[5]); poly(p, [[1, 5], [8, 8], [8, 15], [1, 12]], R[3]); poly(p, [[8, 8], [15, 5], [15, 12], [8, 15]], R[2]);
    poly(p, [[2, 7], [6, 9], [6, 12], [2, 10]], P[1]); p.set(3, 9, P[3]); p.set(4, 10, P[2]);
    p.set(10, 9, RA.brass[5]); p.set(13, 8, RA.brass[5]); p.set(11, 12, RA.stampRed[3]); p.set(13, 11, RA.glowAmber[3]);
    selout(p, R[1]);
  },
  heavy_frame: (p) => {
    const R = RA.slate;
    poly(p, [[1, 7], [8, 3], [15, 7], [8, 11]], R[4]); poly(p, [[1, 7], [8, 11], [8, 15], [1, 11]], R[2]); poly(p, [[8, 11], [15, 7], [15, 11], [8, 15]], R[1]);
    poly(p, [[4, 7], [8, 5], [12, 7], [8, 9]], R[1]);
    for (let k = 0; k < 4; k++) { p.set(2 + k * 2, 9 + k, k % 2 ? RA.ink[1] : RA.glowAmber[2]); p.set(3 + k * 2, 10 + k, k % 2 ? RA.glowAmber[2] : RA.ink[1]); }
    selout(p, R[0]);
  },
  reactor_core: (p) => {
    const S2 = RA.steel, G = RA.glowTeal;
    p.rect(5, 2, 6, 13, S2[3]); p.rect(5, 2, 2, 13, S2[5]); p.rect(10, 2, 1, 13, S2[1]);
    p.rect(6, 5, 4, 6, G[2]); p.vl(7, 5, 10, G[4]); p.set(7, 6, G[3]);
    p.hl(5, 10, 3, RA.glowAmber[3]); p.hl(5, 10, 13, RA.glowAmber[3]); p.set(6, 3, RA.ink[1]); p.set(8, 3, RA.ink[1]); p.set(10, 13, RA.ink[1]);
    selout(p, S2[1]);
  },
  report: (p) => {
    const R = RA.paper;
    poly(p, [[3, 2], [12, 2], [13, 14], [4, 14]], R[3]); poly(p, [[2, 3], [11, 3], [12, 15], [3, 15]], R[5]);
    for (let y = 5; y <= 12; y += 2) p.hl(4, 9 + (y % 4 ? 0 : 1), y, RA.ink[2]);
    poly(p, [[8, 10], [11, 9], [12, 12], [9, 13]], RA.stampRed[2], 200); p.set(10, 11, RA.stampRed[3]);
    p.set(3, 3, RA.steel[5]); p.set(4, 3, RA.steel[3]);
    selout(p, R[1]);
  },
  tape: (p) => {
    const R = RA.steel, T = RA.basalt;
    const oct: Pt[] = [[5, 2], [11, 2], [14, 5], [14, 11], [11, 14], [5, 14], [2, 11], [2, 5]];
    poly(p, oct, R[4]); poly(p, [[5, 2], [11, 2], [8, 8], [2, 5]], R[5]);
    poly(p, [[5, 4], [11, 4], [12, 6], [12, 10], [10, 12], [6, 12], [4, 10], [4, 6]], T[2]);
    p.rect(7, 7, 3, 3, R[5]); p.set(8, 8, T[0]); p.set(6, 5, T[4]); p.set(5, 6, T[3]);
    selout(p, R[1]);
  },
  steam: (p) => {
    const R = RA.snow;
    poly(p, [[3, 12], [4, 8], [7, 6], [10, 7], [13, 10], [12, 13], [7, 14]], R[3], 200); poly(p, [[6, 8], [8, 3], [11, 4], [10, 7]], R[4], 200);
    selout(p, -1, R[0]);
  },
};

const pixCache = new Map<ItemId, Pix>(), urlCache = new Map<string, string>();
/** a 32 px RGBA icon (the texture-array layer for belt crates) */
export function itemPix(id: ItemId): Pix {
  let p = pixCache.get(id);
  if (!p) {
    if (hasHi(id)) { const pc = hiItem(id, S); p = new Pix(S, S); p.d.set(pc.data.subarray(0, S * S * 4)); }
    else { const k = new KPix(S / 16); ICON[id]!(k); p = k.p; }
    pixCache.set(id, p);
  }
  return p;
}
/** a data URL of an item's icon at px x px (the target-style drawing, else the fallback scaled by whole pixels) */
export function itemIcon(id: ItemId, px = chipPx()): string {
  if (hasHi(id)) return hiItemURL(id, px);
  const key = id + '@' + px; let u = urlCache.get(key);
  if (u) return u;
  const k = Math.max(1, Math.round(px / 16)), kp = new KPix(k); ICON[id]!(kp); u = kp.url();
  urlCache.set(key, u);
  return u;
}
/** chips are drawn at the device size they are shown at (16 CSS px per text scale step): no resampling */
let CHIP = 0;
export function chipPx() {
  if (!CHIP) { const tf = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tf')) || 1; CHIP = Math.max(16, Math.round(16 * tf * (devicePixelRatio || 1))); setTimeout(() => (CHIP = 0), 2000); }
  return CHIP;
}
/** inline HTML for an item chip (icon + count) */
export const itemChip = (id: ItemId, n?: number | string, cls = '') => `<span class="fc-chip ${cls}" title="${ITEMS[id]?.name ?? id}"><img src="${itemIcon(id)}">${n !== undefined ? `<b>${n}</b>` : ''}</span>`;

let ARR: THREE.DataArrayTexture | null = null;
/** every item icon as one layer of a texture array (belt crates sample their icon by item index) */
export function iconArray(): THREE.DataArrayTexture {
  if (ARR) return ARR;
  const n = ITEM_IDS.length, data = new Uint8Array(S * S * 4 * n);
  ITEM_IDS.forEach((id, k) => {
    const p = itemPix(id);
    // flip rows (texture origin bottom-left); empty pixels take the crate's side colour so edges read clean
    const sc = ITEMS[id].side;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const si = (y * S + x) * 4, di = k * S * S * 4 + ((S - 1 - y) * S + x) * 4;
      if (p.d[si + 3] > 0) { data[di] = p.d[si]; data[di + 1] = p.d[si + 1]; data[di + 2] = p.d[si + 2]; data[di + 3] = 255; }
      else { data[di] = (sc >> 16) & 255; data[di + 1] = (sc >> 8) & 255; data[di + 2] = sc & 255; data[di + 3] = 0; }
    }
  });
  const t = new THREE.DataArrayTexture(data, S, S, n);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  ARR = t;
  return t;
}
void INKC;
