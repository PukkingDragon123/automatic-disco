// The Corps' machine catalogue: every placeable thing, its footprint on the 1 m grid, what it costs (raw materials
// come out of the golem's hold, parts out of storage), the power it draws or makes, the skill that unlocks it, and
// which faces take input and give output. Local frame: +z is "forward" (the output face), +x is right.
import type { ItemId } from './items';
import type { Station } from './recipes';

export type FKind =
  | 'depot' | 'miner1' | 'miner2' | 'miner3' | 'pump' | 'excavator'
  | 'belt1' | 'belt2' | 'belt3' | 'splitter' | 'merger' | 'lift'
  | 'smelter' | 'foundry' | 'constructor' | 'assembler' | 'manufacturer' | 'refinery' | 'shed'
  | 'crate' | 'silo' | 'boiler' | 'steamgen' | 'reactor' | 'pole'
  | 'lab' | 'robotfab' | 'barracks' | 'turret' | 'wall' | 'found';
export type FCat = 'extract' | 'logistics' | 'production' | 'power' | 'storage' | 'special' | 'defence';
export const CATS: { k: FCat; name: string; no: string }[] = [
  { k: 'extract', name: 'Extraction', no: 'SEC. A' }, { k: 'logistics', name: 'Logistics', no: 'SEC. B' }, { k: 'production', name: 'Production', no: 'SEC. C' },
  { k: 'power', name: 'Power', no: 'SEC. D' }, { k: 'storage', name: 'Storage', no: 'SEC. E' }, { k: 'special', name: 'Works & Labour', no: 'SEC. F' }, { k: 'defence', name: 'Defence', no: 'SEC. G' },
];
export type Cost = Partial<Record<ItemId, number>>;
export interface FDef {
  kind: FKind; name: string; cat: FCat; desc: string; model: string;
  w: number; d: number; h: number;
  cost: Cost; skill?: string;
  /** MW: positive draws, negative makes (before fuel) */
  power: number;
  hp: number;
  /** machine kind for recipes */
  station?: Station;
  /** extractor: what it sits on */
  extract?: 'node' | 'water' | 'soil';
  /** extraction rate (items per second at 100%) */
  rate?: number;
  /** belt speed (cells per second) */
  belt?: number;
  /** input faces: 'back' (default for machines), 'all', 'none' */
  input?: 'back' | 'all' | 'none' | 'sides';
  /** output face */
  output?: 'front' | 'none' | 'split';
  /** buffer cap per item */
  buf?: number;
  /** storage capacity (items per slot) and slots */
  store?: number;
  /** solid to walkers (the golem) */
  solid?: boolean;
  /** an operator (worker) speeds it */
  operable?: boolean;
}
const D = (kind: FKind, name: string, cat: FCat, w: number, d: number, h: number, cost: Cost, power: number, hp: number, desc: string, x: Partial<FDef> = {}): FDef =>
  ({ kind, name, cat, w, d, h, cost, power, hp, desc, model: kind, input: 'back', output: 'front', buf: 20, solid: true, ...x });

export const FDEFS: Record<FKind, FDef> = {
  depot: D('depot', 'Core Uplink', 'storage', 2, 2, 1.4, { ore: 20, soil: 20 }, 0, 600, 'A receiving hopper wired to the core. Belts on any side feed it: raw materials go into Unit 07\'s hold, everything else into the central stores.', { input: 'all', output: 'none', skill: 'works' }),
  miner1: D('miner1', 'Miner Mk. I', 'extract', 2, 2, 2.6, { ore: 15, soil: 10 }, 5, 500, 'A drill tower for a ferrite, copper, coal or crystal seam. Set it over the seam; it puts out one load every two seconds.', { extract: 'node', rate: 0.5, input: 'none', skill: 'works', operable: true, model: 'miner' }),
  miner2: D('miner2', 'Miner Mk. II', 'extract', 2, 2, 3.0, { iron_plate: 20, frame: 2, concrete: 10 }, 12, 700, 'Twice the bit, twice the ore.', { extract: 'node', rate: 1, input: 'none', skill: 'miner2', operable: true, model: 'miner' }),
  miner3: D('miner3', 'Miner Mk. III', 'extract', 2, 2, 3.4, { steel_beam: 10, motor: 4, heavy_frame: 1 }, 30, 900, 'A tungsten-crowned deep bore. Four loads a second.', { extract: 'node', rate: 2, input: 'none', skill: 'miner3', operable: true, model: 'miner' }),
  pump: D('pump', 'Water Pump', 'extract', 2, 2, 2.2, { ore: 12, soil: 6 }, 4, 400, 'A nodding pump on open water. Seals what it draws into cans.', { extract: 'water', rate: 1, input: 'none', skill: 'works', operable: true }),
  excavator: D('excavator', 'Soil Excavator', 'extract', 2, 2, 2.0, { ore: 12, soil: 4 }, 5, 400, 'A bucket wheel that eats the ground it stands on (anywhere off rock and water).', { extract: 'soil', rate: 0.6, input: 'none', skill: 'works', operable: true }),

  belt1: D('belt1', 'Conveyor Mk. I', 'logistics', 1, 1, 0.4, { ore: 1 }, 0, 80, 'Drag to lay a run. 60 items a minute.', { belt: 1 / 3, input: 'all', solid: false, skill: 'works', model: 'belt' }),
  belt2: D('belt2', 'Conveyor Mk. II', 'logistics', 1, 1, 0.4, { iron_plate: 1, rubber: 1 }, 0, 120, '120 items a minute.', { belt: 2 / 3, input: 'all', solid: false, skill: 'belt2', model: 'belt' }),
  belt3: D('belt3', 'Conveyor Mk. III', 'logistics', 1, 1, 0.4, { steel_beam: 1, rubber: 1 }, 0, 160, '270 items a minute.', { belt: 1.5, input: 'all', solid: false, skill: 'belt3', model: 'belt' }),
  splitter: D('splitter', 'Splitter', 'logistics', 1, 1, 0.8, { ore: 4 }, 0, 150, 'Takes a belt in at the back and deals it out front, left and right in turn.', { input: 'back', output: 'split', solid: false, skill: 'works', buf: 2 }),
  merger: D('merger', 'Merger', 'logistics', 1, 1, 0.8, { ore: 4 }, 0, 150, 'Takes belts in on the back and both sides and puts them out front as one.', { input: 'sides', output: 'front', solid: false, skill: 'works', buf: 2 }),
  lift: D('lift', 'Conveyor Lift', 'logistics', 1, 1, 1.8, { iron_plate: 4, iron_rod: 2 }, 0, 200, 'A tower that carries a belt up and over whatever is in the way. Place two facing the same way, up to six apart: the first takes the belt in, the second puts it out.', { input: 'back', output: 'front', solid: false, skill: 'belt2', buf: 6 }),

  smelter: D('smelter', 'Smelter', 'production', 2, 2, 2.8, { ore: 12, soil: 20 }, 4, 600, 'A firebrick furnace. Ore to ingots; soil to glass.', { station: 'smelter', skill: 'works', operable: true }),
  foundry: D('foundry', 'Foundry', 'production', 3, 3, 3.2, { iron_plate: 16, concrete: 12 }, 16, 900, 'Two furnaces and a crucible: steel from ore and coal.', { station: 'foundry', skill: 'steam', operable: true }),
  constructor: D('constructor', 'Constructor', 'production', 2, 2, 2.2, { ore: 20, soil: 8 }, 4, 500, 'A press and a die: one input, one part. Plates, rods, screws, wire, concrete.', { station: 'constructor', skill: 'works', operable: true }),
  assembler: D('assembler', 'Assembler', 'production', 3, 3, 2.6, { iron_plate: 12, screw: 30, iron_rod: 8 }, 15, 800, 'Two arms on a bed: two inputs make one assembly.', { station: 'assembler', skill: 'assembler', operable: true }),
  manufacturer: D('manufacturer', 'Manufacturer', 'production', 4, 4, 3.6, { frame: 6, motor: 4, concrete: 20 }, 55, 1400, 'A whole shop under one roof: up to four inputs. Servos, control units, heavy frames, reactor cores.', { station: 'manufacturer', skill: 'manufacturer', operable: true }),
  refinery: D('refinery', 'Refinery', 'production', 3, 3, 3.6, { iron_plate: 20, concrete: 12, motor: 2 }, 30, 900, 'Tanks and a column: water and carbon into rubber and Bakelite.', { station: 'refinery', skill: 'chem', operable: true }),
  shed: D('shed', 'Grow Shed', 'production', 3, 3, 1.8, { soil: 20, glass: 6, ore: 8 }, 3, 400, 'A glasshouse of grafted fruiting plants. Water and soil in, fruit out: food for the workers.', { station: 'shed', skill: 'works', operable: true }),

  crate: D('crate', 'Storage Crate', 'storage', 1, 1, 1.0, { ore: 10, soil: 6 }, 0, 300, 'Holds what the belt brings (counted in your stores). Passes items on out the front when a belt waits there.', { store: 200, input: 'back', output: 'front', skill: 'works' }),
  silo: D('silo', 'Silo', 'storage', 2, 2, 4.0, { iron_plate: 20, concrete: 10 }, 0, 900, 'A tall tank for bulk stores.', { store: 1200, input: 'back', output: 'front', skill: 'assembler' }),

  boiler: D('boiler', 'Boiler', 'power', 2, 2, 2.6, { ore: 20, soil: 30 }, 0, 600, 'Burns coal or plant carbon with water. Its steam drives a Steam Generator set against its front.', { station: 'boiler', skill: 'steam', operable: true }),
  steamgen: D('steamgen', 'Steam Generator', 'power', 2, 3, 2.4, { iron_plate: 12, rotor: 2, cable: 6 }, -30, 700, 'A turbine and dynamo: 30 MW while a boiler behind it keeps it in steam.', { input: 'back', output: 'none', skill: 'steam' }),
  reactor: D('reactor', 'Atomic Pile', 'power', 3, 3, 4.2, { heavy_frame: 4, concrete: 40, control_unit: 2, steel_beam: 20 }, -250, 2400, 'Quartz-moderated fission. 250 MW from a reactor core and water.', { station: 'reactor', skill: 'atomic', output: 'none' }),
  pole: D('pole', 'Power Pole', 'power', 1, 1, 3.0, { ore: 4 }, 0, 120, 'Carries power. Links to poles within 10 m and powers machines within 7 m. The core feeds 20 MW to everything it reaches.', { input: 'none', output: 'none', solid: false, skill: 'works' }),

  lab: D('lab', 'Research Lab', 'special', 2, 2, 2.6, { iron_plate: 10, glass: 6, copper_wire: 10 }, 10, 600, 'Reads survey reports and data tapes. Every 12 points of research is a core cell for the skill tree.', { station: 'lab', skill: 'works', output: 'none', operable: true }),
  robotfab: D('robotfab', 'Robot Foundry', 'special', 4, 4, 3.4, { frame: 8, motor: 6, control_unit: 2, concrete: 30 }, 60, 2000, 'Builds the Corps\' robots from parts and rolls them out of the door.', { station: 'robotfab', skill: 'robotics', output: 'none', operable: true }),
  barracks: D('barracks', 'Worker Pen', 'special', 3, 3, 1.6, { ore: 15, soil: 25, carbon: 10 }, 1, 600, 'Pens, a trough and a lean-to. Workers sleep and eat here (feed it fruit or carbon); each pen keeps four more workers.', { input: 'all', output: 'none', skill: 'haul', store: 60, solid: false }),
  turret: D('turret', 'Turret', 'defence', 2, 2, 1.8, { iron_plate: 10, iron_rod: 6, ore: 10 }, 2, 900, 'Twin guns on a turntable. Feed it ammunition by belt or by hand; it fires on anything hostile within 14 m.', { skill: 'turret', output: 'none', buf: 60 }),
  wall: D('wall', 'Wall', 'defence', 1, 1, 1.4, { soil: 3, ore: 1 }, 0, 800, 'Poured concrete. Drag to lay a line.', { input: 'none', output: 'none', skill: 'works' }),
  found: D('found', 'Foundation', 'logistics', 2, 2, 0.3, { soil: 4 }, 0, 400, 'A poured slab: levels the ground. Drag to lay a floor.', { input: 'none', output: 'none', solid: false, skill: 'works' }),
};
export const FKINDS = Object.keys(FDEFS) as FKind[];
export const isBelt = (k: FKind) => k === 'belt1' || k === 'belt2' || k === 'belt3';
/** placement by dragging a line (belts, walls, foundations) */
export const isDrag = (k: FKind) => isBelt(k) || k === 'wall' || k === 'found';
export const DIRS: [number, number][] = [[0, 1], [-1, 0], [0, -1], [1, 0]];
/** rotation r turns local +z (forward) to DIRS[r]: 0 south (+z), 1 west, 2 north, 3 east */
export function rotXZ(lx: number, lz: number, r: number): [number, number] {
  switch (r & 3) { case 0: return [lx, lz]; case 1: return [-lz, lx]; case 2: return [-lx, -lz]; default: return [lz, -lx]; }
}
/** footprint size in grid cells for a rotation */
export const footW = (def: FDef, r: number) => (r & 1 ? def.d : def.w);
export const footD = (def: FDef, r: number) => (r & 1 ? def.w : def.d);
