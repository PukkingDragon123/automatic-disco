// THE UNLOCK GRAPH (v7: start from zero). Everything the player can do is learned here, one node at a time: the dock
// slots themselves (RESEARCH, BUILD, TROOPS, LAB, SHIP), every build category, every tool, the arms, drones and pod
// parts, the ship's rooms and functions. A node costs a mix of
//   KNOWLEDGE  research data (bio / geo / energy / xeno) from scanning and studying,
//   RESOURCES  real items out of the colony's stores ('a|b' = the first id that exists),
//   a QUEST    one that must be done first (src/story/quests.ts),
//   CLOSENESS  a bond level with an NPC (src/social: 'guide' is Teo Barrera, the teammates by crew id).
// Feature ids a node grants (game.unlocks.has(id) / game.research.unlocked(id) answer for all of them):
//   dock:<build|research|troops|lab|ship>      the main dock's slots
//   cat:<BuildCat>                             a build-menu category (src/logistics/catalog.ts)
//   tool:<ToolId>                              a pod tool (src/colony/tools.ts), tool:custom (the tool bench)
//   ship:<room>, ship:fn:<name>                a ship room and a ship function (the ship hub reads these)
//   <building kind>, <colony catalog id>       a building or a pod works entry (arm_grabber, drone_scout, st_relay ...)
//   tech:<id>                                  marks an old tech (src/research/tech.ts) known, for legacy gates
//   pod:<id>                                   pod interior features (pod:interior, pod:decor2 ...)
// `install` runs the Upgrader effect of a blueprint at once (an arm on a free hardpoint, a drone on the pad ...).
// Layout: `lane` is the row band of the lattice, `col` the column; `row` 0/1 splits a lane in two.
import type { DataKind } from './tech';
import { EMPIRE_NODES } from '../empire/nodes';

export type Lane = 'core' | 'build' | 'tools' | 'pod' | 'life' | 'ship' | 'empire';
export const LANES: { id: Lane; name: string; icon: string; col: number }[] = [
  { id: 'core', name: 'SETTLEMENT', icon: 'core', col: 0xe8b04a },
  { id: 'tools', name: 'TOOLS', icon: 'wrench', col: 0x7fd0e8 },
  { id: 'build', name: 'BUILD', icon: 'factory', col: 0xd89a5a },
  { id: 'pod', name: 'POD', icon: 'armsocket', col: 0xb8c0c8 },
  { id: 'life', name: 'LIFE', icon: 'dna', col: 0x8de08a },
  { id: 'ship', name: 'SHIP', icon: 'telescope', col: 0xa890ff },
  // v7 EMPIRE BUILDING (src/empire/nodes.ts): the planet survey, settler convoys, roads, trade, rail, diplomacy, drops
  { id: 'empire', name: 'EMPIRE', icon: 'globe', col: 0xe8c050 },
];
export type NpcId = 'guide' | 'kristiansen' | 'mamani' | string;

export interface UnlockNode {
  id: string; name: string; lane: Lane; col: number; row?: number;
  /** the 3D model key the lattice shows (src/research/ui/nodeModels.ts) */
  model: string;
  /** the flat icon (src/research/ui/icons.ts) for small places */
  icon: string;
  needs: string[];
  know?: Partial<Record<DataKind, number>>;
  items?: Record<string, number>;
  quest?: string;
  close?: [NpcId, number];
  grants: string[];
  install?: string[];
  start?: boolean;
  /** opens itself (no click) as soon as every requirement is met: the dock slots a quest or a bond hands over */
  auto?: boolean;
}
const N = (id: string, name: string, lane: Lane, col: number, model: string, icon: string, needs: string[], cost: Pick<UnlockNode, 'know' | 'items' | 'quest' | 'close'>, grants: string[], o: Partial<UnlockNode> = {}): UnlockNode =>
  ({ id, name, lane, col, model, icon, needs, ...cost, grants, ...o });

export const NODES: UnlockNode[] = [
  // ---------------------------------------------------------------- COLONY: the pod's own mind and the dock
  N('boot', 'Crash Boot', 'core', 0, 'pod', 'core', [], {}, ['tool:scanner', 'pod:interior', 'cat:storage', 'arm_manipulator'], { start: true }),
  N('dock_research', 'Research', 'core', 1, 'dock_research', 'lens', ['boot'], { quest: 'q_look' }, ['dock:research'], { auto: true }),
  N('dock_build', 'Build', 'core', 2, 'dock_build', 'factory', ['dock_research'], { know: { geo: 4 }, items: { iron_plate: 4 }, close: ['guide', 1] }, ['dock:build', 'tech:field_works', 'cat:storage']),
  N('dock_troops', 'Troops', 'core', 3, 'dock_troops', 'arms', ['dock_build'], { quest: 'q_orders', close: ['kristiansen', 1] }, ['dock:troops']),
  N('dock_lab', 'Lab', 'core', 4, 'dock_lab', 'dna', ['dock_research'], { know: { bio: 14 }, items: { glass: 2, 'protein|fruit': 2 }, quest: 'q_life' }, ['dock:lab', 'tech:gene_lab', 'tech:labour']),
  N('dock_ship', 'Ship Link', 'core', 5, 'dock_ship', 'telescope', ['dock_build'], { items: { copper_wire: 10, circuit: 2 }, quest: 'q_relay', close: ['guide', 2] }, ['dock:ship', 'ship:bridge', 'ship:fn:link']),
  N('mission', 'Directives', 'core', 6, 'dish', 'gauge', ['dock_ship'], { know: { xeno: 4 } }, ['ship:fn:quotas', 'ship:fn:drops']),
  N('station', 'Field Lab', 'core', 7, 'station', 'flask', ['dock_lab'], { know: { bio: 10, geo: 6 }, items: { glass: 4, circuit: 2, iron_plate: 6 } }, ['research_station', 'cat:research', 'tech:research_station']),

  // ---------------------------------------------------------------- TOOLS: one at a time, each crucial
  N('tool_sampler', 'Sampler', 'tools', 1, 'tool_sampler', 'vial', ['dock_research'], { know: { bio: 4 }, items: { glass: 1 } }, ['tool:sampler']),
  N('tool_seeder', 'Seed Planter', 'tools', 2, 'tool_seeder', 'sprout', ['tool_sampler'], { know: { bio: 8 }, items: { 'fruit': 3 } }, ['tool:seeder', 'tech:agronomy']),
  N('tool_grab', 'Grabber Arm', 'tools', 3, 'arm_grapple', 'claw', ['tool_sampler', 'upgrader'], { know: { geo: 8, energy: 4 }, items: { servo: 2, crystal: 2 } }, ['tool:grab', 'arm_grabber', 'tech:bp_grapple']),
  N('tool_drill', 'Drill Arm', 'tools', 3, 'arm_drill', 'drill', ['upgrader'], { know: { geo: 12 }, items: { gear: 6, motor: 1 } }, ['tool:drill', 'arm_drill', 'tech:bp_drill'], { row: 1 }),
  N('tool_weld', 'Welder Arm', 'tools', 4, 'arm_welder', 'wrench', ['tool_drill'], { know: { energy: 10, geo: 6 }, items: { copper_wire: 8 } }, ['tool:weld', 'arm_welder', 'tech:bp_welder'], { row: 1 }),
  N('tool_lift', 'Lift Field', 'tools', 5, 'tool_tractor', 'arcs', ['tool_grab', 'cat_power'], { know: { energy: 16, xeno: 4 }, items: { crystal: 4, circuit: 2 } }, ['tool:lift', 'arm_gravity', 'tech:bp_tractor']),
  N('tool_cannon', 'Mass Driver', 'tools', 6, 'tool_cannon', 'blast', ['tool_lift', 'tool_weld'], { know: { energy: 24, geo: 16, xeno: 6 }, items: { steel_beam: 4, circuit: 4 } }, ['tool:cannon', 'arm_cannon', 'tech:bp_cannon']),
  N('tool_custom', 'Tool Bench', 'tools', 4, 'tool_bench', 'gear', ['tool_grab'], { know: { geo: 10, energy: 8 }, items: { gear: 4, iron_rod: 4 }, close: ['guide', 3] }, ['tool:custom']),
  N('tool_scan2', 'Deep Scanner', 'tools', 7, 'tool_scanner2', 'sensor', ['tool_custom'], { know: { geo: 14, xeno: 8 }, items: { crystal: 4, circuit: 3 } }, ['tool_scanner2', 'tech:bp_scanner2'], { install: ['tool_scanner2'] }),

  // ---------------------------------------------------------------- BUILD: the categories, one by one
  N('cat_extraction', 'Extraction', 'build', 3, 'b:miner', 'pick', ['dock_build'], { know: { geo: 8 }, items: { iron_plate: 4 } }, ['cat:extraction', 'tech:field_works']),
  N('cat_power', 'Power', 'build', 4, 'b:boiler', 'battery', ['cat_extraction'], { know: { energy: 8 }, items: { copper_wire: 6 }, quest: 'q_spark' }, ['cat:power']),
  N('cat_processing', 'Processing', 'build', 5, 'b:smelter', 'furnace', ['cat_power'], { know: { geo: 14, energy: 6 }, items: { iron_plate: 6, gear: 2 } }, ['cat:processing', 'tech:assembly']),
  N('cat_logistics', 'Logistics', 'build', 4, 'b:belt', 'belt', ['cat_extraction'], { know: { geo: 10 }, items: { iron_rod: 4 } }, ['cat:logistics', 'tech:logic_split'], { row: 1 }),
  N('cat_habitat', 'Habitat', 'build', 5, 'b:bunkhouse', 'shield', ['cat_logistics'], { know: { bio: 8, geo: 8 }, items: { iron_plate: 8 }, close: ['mamani', 2] }, ['cat:habitat'], { row: 1 }),
  N('cat_defence', 'Defence', 'build', 6, 'b:turret', 'gauge', ['cat_processing'], { know: { geo: 18, energy: 10 }, items: { steel_beam: 2, iron_plate: 8 }, close: ['kristiansen', 2] }, ['cat:defence', 'tech:turrets']),
  N('cat_decor', 'Decoration', 'build', 6, 'b:flagpole', 'pole', ['cat_habitat'], { know: { bio: 6 }, items: { iron_rod: 2 } }, ['cat:decor'], { row: 1 }),
  N('steam', 'Steam Power', 'build', 7, 'b:steamgen', 'steam', ['cat_processing'], { know: { energy: 20, geo: 12 }, items: { steel_beam: 2, iron_plate: 10 } }, ['tech:steam_power', 'tech:alloys']),

  // ---------------------------------------------------------------- POD: the hull, the Upgrader, arms and drones
  N('pod_lamp', 'Lamp Post', 'pod', 1, 'st_lamp', 'bolt', ['boot'], { know: { energy: 2 }, items: { glass: 1 } }, ['st_lamp'], { row: 1 }),
  N('upgrader', 'Upgrader', 'pod', 2, 'upgrader', 'wrench', ['dock_build'], { know: { geo: 8, energy: 4 }, items: { iron_plate: 6, gear: 4 } }, ['upgrader', 'tech:upgrader', 'cat:research']),
  N('pod_relay', 'Relay Mast', 'pod', 2, 'st_relay', 'nodes', ['pod_lamp'], { know: { energy: 6 }, items: { copper_wire: 4 }, close: ['guide', 1] }, ['st_relay'], { row: 1 }),
  N('drone_scout', 'Scout Drone', 'pod', 3, 'drone_scout', 'drone', ['upgrader'], { know: { energy: 8, geo: 6 }, items: { motor: 1, circuit: 2 } }, ['drone_scout', 'tech:bp_drone_scout']),
  N('drone_carrier', 'Carrier Drone', 'pod', 4, 'drone_hauler', 'crate', ['drone_scout'], { know: { energy: 12, geo: 10 }, items: { motor: 2, gear: 4 } }, ['drone_carrier', 'tool:carry', 'tech:bp_drone_hauler']),
  N('drone_repair', 'Repair Drone', 'pod', 5, 'drone_builder', 'cross', ['drone_carrier', 'tool_weld'], { know: { energy: 14, geo: 12 }, items: { motor: 2, circuit: 3 } }, ['drone_repair', 'tech:bp_drone_builder']),
  N('pod_plating', 'Hull Plating', 'pod', 3, 'pod_plating', 'shield', ['upgrader'], { know: { geo: 12 }, items: { iron_plate: 12 } }, ['tech:bp_plating', 'limb_brace'], { install: ['pod_plating'], row: 1 }),
  N('arm_socket', 'Arm Socket', 'pod', 4, 'arm_socket', 'armsocket', ['pod_plating'], { know: { geo: 14, energy: 8 }, items: { gear: 6, motor: 2 }, close: ['kristiansen', 2] }, ['tech:bp_socket'], { install: ['arm_socket'], row: 1 }),
  N('pod_sensor', 'Sensor Mast', 'pod', 5, 'st_sensor', 'lens', ['pod_relay', 'arm_socket'], { know: { geo: 8, xeno: 4 }, items: { glass: 4, circuit: 3 } }, ['st_sensor', 'limb_mast', 'tech:bp_sensor'], { row: 1 }),
  N('gravpole', 'Gravity Pole', 'pod', 6, 'st_gravpole', 'pole', ['tool_lift', 'pod_sensor'], { know: { energy: 18, xeno: 8 }, items: { crystal: 6, circuit: 4 } }, ['st_gravpole', 'tech:grav_pole']),
  N('pod_capacitor', 'Capacitor', 'pod', 6, 'pod_capacitor', 'capacitor', ['cat_power', 'pod_plating'], { know: { energy: 16 }, items: { copper_wire: 12, circuit: 2 } }, ['tech:bp_capacitor'], { install: ['pod_capacitor'], row: 1 }),

  // ---------------------------------------------------------------- LIFE: creatures, plants, the lab
  N('cat_bio', 'Bio-Eng', 'life', 5, 'b:planter', 'sapling', ['dock_lab', 'tool_seeder'], { know: { bio: 18 }, items: { 'fruit': 4, water: 4 } }, ['cat:bio', 'tech:agronomy']),
  N('labour', 'Labour Harness', 'life', 6, 'b:pen', 'socket', ['cat_bio'], { know: { bio: 20 }, items: { iron_plate: 6 }, close: ['mamani', 3] }, ['tech:labour']),
  N('bio_reactor', 'Bio-Reactor', 'life', 6, 'b:bt_reactor', 'flame', ['cat_bio', 'cat_power'], { know: { bio: 12, energy: 12 }, items: { iron_plate: 8, gear: 2 } }, ['tech:bio_reactor'], { row: 1 }),
  N('vats', 'Growth Vats', 'life', 7, 'b:bt_vat', 'vial', ['labour'], { know: { bio: 30, energy: 8 }, items: { glass: 6, circuit: 2 } }, ['tech:vats', 'tech:habitat']),

  // ---------------------------------------------------------------- SHIP: each room and function on its own
  N('ship_cargo', 'Cargo Bay', 'ship', 6, 'ship_cargo', 'crate', ['dock_ship'], { know: { geo: 6 }, items: { iron_plate: 4 } }, ['ship:cargo', 'ship:fn:drops']),
  N('ship_lab', 'Ship Lab', 'ship', 6, 'ship_lab', 'flask', ['dock_ship', 'dock_lab'], { know: { bio: 16, xeno: 4 } }, ['ship:lab', 'ship:fn:study'], { row: 1 }),
  N('ship_medbay', 'Medbay', 'ship', 7, 'ship_medbay', 'cross', ['ship_lab'], { know: { bio: 20 }, items: { glass: 2 }, close: ['mamani', 2] }, ['ship:medbay', 'ship:fn:heal'], { row: 1 }),
  N('ship_hangar', 'Hangar', 'ship', 7, 'ship_hangar', 'hive', ['ship_cargo', 'drone_scout'], { know: { energy: 16, geo: 10 }, items: { steel_beam: 2 } }, ['ship:hangar', 'ship:fn:pods', 'tech:bp_drone_bay'], { install: ['drone_bay'] }),
  N('ship_engine', 'Engineering', 'ship', 8, 'ship_engine', 'core', ['ship_hangar', 'steam'], { know: { energy: 30, xeno: 10 }, items: { circuit: 4 }, close: ['guide', 4] }, ['ship:engineering', 'ship:fn:orbit', 'tech:atomic']),
  N('ship_mess', 'Mess Hall', 'ship', 8, 'ship_mess', 'heart', ['ship_medbay'], { know: { bio: 12 }, items: { fruit: 6 }, close: ['mamani', 3] }, ['ship:mess', 'ship:quarters', 'ship:hydro', 'ship:gym', 'ship:fn:morale'], { row: 1 }),

  // ---------------------------------------------------------------- the deep end (everything the old research held)
  N('heavy', 'Heavy Industry', 'build', 8, 'b:manufacturer', 'factory', ['steam', 'cat_defence'], { know: { geo: 40, energy: 20 }, items: { steel_beam: 4, circuit: 6 } }, ['tech:miner2', 'tech:belts2', 'tech:chem', 'tech:manufacturer', 'tech:miner3', 'tech:belts3', 'tech:robot_foundry']),
  N('logic', 'Logic Nodes', 'tools', 8, 'logic', 'nodes', ['tool_scan2', 'cat_logistics'], { know: { energy: 20, geo: 10 } }, ['tech:logic_cond', 'tech:logic_buffer', 'tech:logic_gate', 'tech:logic_sensor', 'tech:templates']),
  N('pod_coolant', 'Coolant Loop', 'pod', 7, 'pod_coolant', 'drop', ['pod_capacitor'], { know: { energy: 18, geo: 8 }, items: { water: 10, iron_rod: 6 } }, ['tech:bp_coolant', 'tech:bp_repair', 'tech:bp_cutter'], { install: ['pod_coolant'], row: 1 }),
  N('arm_long', 'Long Boom', 'pod', 8, 'arm_long', 'telescope', ['gravpole', 'pod_coolant'], { know: { geo: 24, energy: 12 }, items: { steel_beam: 4, motor: 2 } }, ['tech:bp_long'], { install: ['arm_long'] }),
  N('force', 'Force Dome', 'life', 8, 'b:bt_field', 'shield', ['vats', 'bio_reactor'], { know: { energy: 24, xeno: 10 }, items: { crystal: 6 } }, ['tech:force_field', 'tech:biofuel', 'tech:silk']),
  N('rare', 'Rare Ores', 'core', 8, 'crystal', 'core', ['station', 'mission'], { know: { geo: 30, xeno: 14 } }, ['tech:lumen', 'tech:gravium']),
  ...EMPIRE_NODES,
];
export const NODE: Record<string, UnlockNode> = Object.fromEntries(NODES.map((n) => [n.id, n]));
/** grid size of the lattice */
export const COLS = Math.max(...NODES.map((n) => n.col)) + 1;

/** the dock slots, in dock order */
export const DOCK_IDS = ['build', 'research', 'troops', 'lab', 'ship'] as const;
export type DockId = typeof DOCK_IDS[number];
