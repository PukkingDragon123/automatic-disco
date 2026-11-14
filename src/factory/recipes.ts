// Recipes: what each kind of machine makes, from what, and how long one cycle takes (at 100% speed, no operator).
// Rates in the statistics sheet are computed from these (per minute = 60 / t * n).
import type { ItemId } from './items';

export type Station = 'smelter' | 'foundry' | 'constructor' | 'assembler' | 'manufacturer' | 'refinery' | 'shed' | 'boiler' | 'reactor' | 'lab' | 'robotfab';
export type Stack = Partial<Record<ItemId, number>>;
export interface Recipe {
  id: string; name: string; at: Station; in: Stack; out: Stack; t: number;
  /** skill node that unlocks it (else available with the machine) */
  skill?: string;
  /** a robot the robot foundry rolls out (instead of items) */
  robot?: string;
  /** research points a lab cycle yields */
  research?: number;
}
const R = (id: string, at: Station, name: string, inp: Stack, out: Stack, t: number, x: Partial<Recipe> = {}): Recipe => ({ id, at, name, in: inp, out, t, ...x });

export const RECIPES: Recipe[] = [
  // smelter
  R('iron_ingot', 'smelter', 'Iron Ingot', { ore: 1 }, { iron_ingot: 1 }, 2),
  R('copper_ingot', 'smelter', 'Copper Ingot', { copper_ore: 1 }, { copper_ingot: 1 }, 2),
  R('glass', 'smelter', 'Glass', { soil: 3 }, { glass: 1 }, 3),
  R('concrete_kiln', 'smelter', 'Concrete (kiln)', { soil: 2, carbon: 1 }, { concrete: 1 }, 3),
  // foundry
  R('steel_ingot', 'foundry', 'Steel Ingot', { ore: 2, coal: 2 }, { steel_ingot: 2 }, 4),
  R('steel_carbon', 'foundry', 'Steel (charcoal)', { iron_ingot: 2, carbon: 3 }, { steel_ingot: 2 }, 5),
  R('quartz_glass', 'foundry', 'Quartz Glass', { crystal: 1, soil: 2 }, { glass: 3 }, 4),
  // constructor
  R('iron_plate', 'constructor', 'Iron Plate', { iron_ingot: 3 }, { iron_plate: 2 }, 4),
  R('iron_rod', 'constructor', 'Iron Rod', { iron_ingot: 1 }, { iron_rod: 1 }, 2),
  R('screw', 'constructor', 'Screws', { iron_rod: 1 }, { screw: 4 }, 3),
  R('copper_wire', 'constructor', 'Copper Wire', { copper_ingot: 1 }, { copper_wire: 2 }, 2),
  R('cable', 'constructor', 'Cable', { copper_wire: 2 }, { cable: 1 }, 2),
  R('concrete', 'constructor', 'Concrete', { soil: 3 }, { concrete: 1 }, 3),
  R('steel_beam', 'constructor', 'Steel Beam', { steel_ingot: 3 }, { steel_beam: 1 }, 4),
  R('gear', 'constructor', 'Gear', { iron_plate: 1 }, { gear: 1 }, 3),
  // assembler
  R('reinforced_plate', 'assembler', 'Reinforced Plate', { iron_plate: 4, screw: 8 }, { reinforced_plate: 1 }, 8),
  R('rotor', 'assembler', 'Rotor', { iron_rod: 3, screw: 10 }, { rotor: 1 }, 8),
  R('frame', 'assembler', 'Modular Frame', { reinforced_plate: 2, iron_rod: 4 }, { frame: 1 }, 12),
  R('circuit', 'assembler', 'Circuit Board', { copper_wire: 2, plastic: 1 }, { circuit: 1 }, 6),
  R('vacuum_tube', 'assembler', 'Vacuum Tube', { glass: 1, copper_wire: 1 }, { vacuum_tube: 1 }, 4),
  R('motor', 'assembler', 'Motor', { rotor: 1, cable: 2 }, { motor: 1 }, 10),
  R('ammo', 'assembler', 'Ammunition', { copper_ingot: 1, coal: 1 }, { ammo: 6 }, 4),
  R('ammo_carbon', 'assembler', 'Ammunition (black powder)', { iron_plate: 1, carbon: 2 }, { ammo: 4 }, 4),
  R('report', 'assembler', 'Survey Report', { iron_plate: 2, copper_wire: 2 }, { report: 1 }, 6),
  // manufacturer
  R('servo', 'manufacturer', 'Servo', { motor: 1, gear: 2, circuit: 1 }, { servo: 1 }, 14),
  R('control_unit', 'manufacturer', 'Control Unit', { circuit: 2, vacuum_tube: 3, crystal: 1 }, { control_unit: 1 }, 18),
  R('heavy_frame', 'manufacturer', 'Heavy Frame', { frame: 2, steel_beam: 3, concrete: 6 }, { heavy_frame: 1 }, 20),
  R('reactor_core', 'manufacturer', 'Reactor Core', { crystal: 4, steel_beam: 2, circuit: 1 }, { reactor_core: 1 }, 24),
  R('tape', 'manufacturer', 'Data Tape', { circuit: 1, vacuum_tube: 1, plastic: 2 }, { tape: 1 }, 12),
  // refinery
  R('rubber', 'refinery', 'Rubber', { carbon: 2, water: 1 }, { rubber: 2 }, 4),
  R('plastic', 'refinery', 'Bakelite', { coal: 2, water: 1 }, { plastic: 2 }, 5),
  R('plastic_carbon', 'refinery', 'Bakelite (plant)', { carbon: 3, water: 2 }, { plastic: 1 }, 5),
  R('cable_rubber', 'refinery', 'Rubber Cable', { copper_wire: 1, rubber: 1 }, { cable: 2 }, 3),
  // grow shed
  R('fruit', 'shed', 'Fruit', { water: 1, soil: 1 }, { fruit: 2 }, 10),
  R('carbon_crop', 'shed', 'Fibre Crop', { water: 1 }, { carbon: 2 }, 8),
  // power
  R('burn_coal', 'boiler', 'Burn Coal', { coal: 1, water: 1 }, { steam: 4 }, 8),
  R('burn_carbon', 'boiler', 'Burn Carbon', { carbon: 1, water: 1 }, { steam: 2 }, 4),
  R('fission', 'reactor', 'Fission', { reactor_core: 1, water: 4 }, {}, 60),
  // research lab
  R('study_report', 'lab', 'Study Reports', { report: 1 }, {}, 10, { research: 1 }),
  R('study_tape', 'lab', 'Run Data Tapes', { tape: 1 }, {}, 12, { research: 4 }),
  // robot foundry: robot kinds come from the robots contract; the foundry calls spawnRobot when a cycle completes
  R('bot_scout', 'robotfab', 'Scout', { frame: 1, servo: 2, circuit: 1 }, {}, 30, { robot: 'scout' }),
  R('bot_worker', 'robotfab', 'Worker Bot', { frame: 1, motor: 1, rotor: 2 }, {}, 30, { robot: 'worker' }),
  R('bot_trooper', 'robotfab', 'Trooper', { frame: 2, servo: 2, control_unit: 1, ammo: 20 }, {}, 45, { robot: 'trooper' }),
  R('bot_heavy', 'robotfab', 'Heavy', { heavy_frame: 1, servo: 4, control_unit: 1, ammo: 30 }, {}, 70, { robot: 'heavy' }),
  R('bot_artillery', 'robotfab', 'Artillery', { heavy_frame: 1, steel_beam: 4, control_unit: 1, ammo: 40 }, {}, 80, { robot: 'artillery' }),
  R('bot_walker', 'robotfab', 'Walker', { heavy_frame: 2, servo: 6, control_unit: 2, reactor_core: 1 }, {}, 120, { robot: 'walker' }),
];
export const RECIPE: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const recipesAt = (s: Station) => RECIPES.filter((r) => r.at === s);
/** items per minute a recipe makes (or uses) of one item at speed 1 */
export const perMin = (r: Recipe, n: number) => (60 / r.t) * n;
