// The research catalogue. Scanning gives DATA of four kinds; a Research Station turns data into TECH over time.
// A tech can open buildings (by kind, or through the legacy skill ids the factory's catalogue is gated on), recipes,
// node-map logic, or an Upgrader BLUEPRINT (a pod part, an arm type, a tool, a drone) that still has to be BUILT
// from real items at the Upgrader. Some techs also need a mastery level: you cannot research reactor physics
// without having run a grid.
import type { PathId } from './mastery';

export type DataKind = 'bio' | 'geo' | 'energy' | 'xeno';
export const DATA_KINDS: DataKind[] = ['bio', 'geo', 'energy', 'xeno'];
export const DATA_NAME: Record<DataKind, string> = { bio: 'BIO', geo: 'GEO', energy: 'ENERGY', xeno: 'XENO' };
export const DATA_FROM: Record<DataKind, string> = { bio: 'species and plants', geo: 'ores and rock', energy: 'vents, crystal and the grid', xeno: 'ruins and signals' };
export type TechKind = 'building' | 'recipe' | 'logic' | 'tool' | 'arm' | 'drone' | 'pod';
export const TECH_KINDS: { k: TechKind; name: string }[] = [
  { k: 'building', name: 'BUILDINGS' }, { k: 'recipe', name: 'RECIPES' }, { k: 'logic', name: 'LOGIC' },
  { k: 'tool', name: 'TOOLS' }, { k: 'arm', name: 'ARMS' }, { k: 'drone', name: 'DRONES' }, { k: 'pod', name: 'POD' },
];

export interface Tech {
  id: string; name: string; kind: TechKind; icon: string; desc: string;
  cost: Partial<Record<DataKind, number>>;
  /** seconds of station work at one station */
  time: number;
  needs?: string[];
  mastery?: [PathId, number];
  /** the path that gets XP when it completes */
  path: PathId;
  /** legacy skill ids and feature ids switched on */
  grants?: string[];
  buildings?: string[];
  recipes?: string[];
  /** Upgrader blueprint id */
  blueprint?: string;
  /** known from the start */
  start?: boolean;
}
const T = (id: string, name: string, kind: TechKind, icon: string, path: PathId, cost: Tech['cost'], time: number, desc: string, o: Partial<Tech> = {}): Tech =>
  ({ id, name, kind, icon, path, cost, time, desc, ...o });

export const TECHS: Tech[] = [
  // ---------------------------------------------------------------- known at landing
  T('field_works', 'Field Works', 'building', 'factory', 'industry', {}, 0, 'Miners, belts, smelters, constructors, storage, pumps, poles and walls.', { start: true, grants: ['works', 'drill', 'excavate', 'siphon', 'intake'], buildings: ['arm_manipulator', 'st_relay', 'st_lamp'] }),
  T('research_station', 'Research Station', 'building', 'lens', 'industry', {}, 0, 'Turns scanned data into technology. More stations research faster.', { start: true, buildings: ['research_station'] }),
  // ---------------------------------------------------------------- buildings
  T('upgrader', 'Upgrader', 'building', 'wrench', 'robotics', { geo: 8, energy: 4 }, 30, 'A gantry that builds and installs your own upgrades from real parts.', { buildings: ['upgrader'] }),
  T('steam_power', 'Steam Power', 'building', 'steam', 'energy', { energy: 14, geo: 8 }, 45, 'Boilers, steam generators and the foundry.', { grants: ['steam'] }),
  T('assembly', 'Assembly Lines', 'building', 'gear', 'industry', { geo: 16 }, 40, 'Two-input assemblers and silos.', { grants: ['assembler'] }),
  T('belts2', 'Conveyor Mk. II', 'building', 'belt', 'industry', { geo: 10, energy: 4 }, 30, 'Faster belts and conveyor lifts.', { grants: ['belt2'], needs: ['assembly'] }),
  T('miner2', 'Miner Mk. II', 'building', 'drill', 'industry', { geo: 20 }, 50, 'Twice the ore from every seam.', { grants: ['miner2'] }),
  T('agronomy', 'Seed Press', 'building', 'sprout', 'plant', { bio: 10 }, 35, 'Planters and the seed press: grow what you scanned.', { grants: ['sow', 'graft'] }),
  T('labour', 'Labour Harness', 'building', 'socket', 'bio', { bio: 14 }, 45, 'Worker pens, barracks, breeding pens and machine minders.', { grants: ['convert', 'haul', 'operate', 'command'] }),
  T('gene_lab', 'Gene Laboratory', 'building', 'dna', 'bio', { bio: 18 }, 50, 'Rebuild an absorbed species limb by limb and splice lines.', { grants: ['lab', 'splice', 'bt_works'], needs: ['labour'] }),
  T('bio_reactor', 'Bio-Reactor', 'building', 'flame', 'energy', { bio: 10, energy: 10 }, 45, 'Burn carcasses, dung and bio-oil for 25 MW.', { grants: ['bt_reactor', 'bt_works'] }),
  T('chem', 'Chemical Refinery', 'building', 'flask', 'industry', { geo: 12, bio: 8 }, 45, 'Rubber, plastic and herbicide; sprayers.', { grants: ['chem'], needs: ['assembly'] }),
  T('habitat', 'Engineered Habitat', 'building', 'tree', 'bio', { bio: 22, geo: 8 }, 60, 'A climate dome where engineered stock breeds and cannot escape.', { grants: ['bt_habitat', 'bt_lock'], needs: ['gene_lab'], mastery: ['bio', 2] }),
  T('vats', 'Growth Vats', 'building', 'vial', 'bio', { bio: 26, energy: 8 }, 70, 'Grow designs in glass, then clone the proven ones.', { grants: ['bt_vat', 'bt_clone', 'print', 'vat', 'sequencer'], needs: ['gene_lab'], mastery: ['bio', 3] }),
  T('manufacturer', 'Manufacturing Hall', 'building', 'factory', 'industry', { geo: 26, energy: 10 }, 75, 'Four-input manufacturers: servos, control units, heavy frames.', { grants: ['manufacturer'], needs: ['assembly'], mastery: ['industry', 2] }),
  T('miner3', 'Miner Mk. III', 'building', 'shaft', 'industry', { geo: 34, energy: 10 }, 90, 'Deep bores: four loads a second.', { grants: ['miner3', 'bore'], needs: ['miner2', 'steam_power'], mastery: ['industry', 4] }),
  T('belts3', 'Conveyor Mk. III', 'building', 'belt', 'industry', { geo: 22, energy: 8 }, 60, 'The fastest belts.', { grants: ['belt3'], needs: ['belts2'], mastery: ['industry', 3] }),
  T('atomic', 'Atomic Pile', 'building', 'core', 'energy', { energy: 40, geo: 20, xeno: 4 }, 120, 'A crystal-moderated reactor: 250 MW from a reactor core.', { grants: ['atomic'], needs: ['steam_power', 'manufacturer'], mastery: ['energy', 4] }),
  T('grav_pole', 'Gravity Pole', 'building', 'pole', 'robotics', { energy: 12, xeno: 6 }, 60, 'A field pylon: the pod\'s arms and drones work anywhere inside its ring.', { buildings: ['st_gravpole', 'grav_pole'], needs: ['upgrader'], mastery: ['energy', 2] }),
  T('force_field', 'Force-Field Barrier', 'building', 'shield', 'energy', { energy: 20, xeno: 8 }, 80, 'A mast that throws a lattice dome nothing hostile walks through.', { grants: ['bt_field', 'bt_dome'], needs: ['bio_reactor'], mastery: ['energy', 3] }),
  T('turrets', 'Gun Turrets', 'building', 'gauge', 'robotics', { geo: 14, energy: 6 }, 45, 'Twin-gun turrets fed with ammunition.', { grants: ['turret'], needs: ['assembly'] }),
  T('robot_foundry', 'Robot Foundry', 'building', 'arms', 'robotics', { geo: 30, energy: 20, xeno: 6 }, 110, 'Build robots from frames, servos and control units.', { grants: ['robotics'], needs: ['manufacturer'], mastery: ['robotics', 3] }),
  // ---------------------------------------------------------------- recipes
  T('lumen', 'Lumen Optics', 'recipe', 'lens', 'energy', { energy: 14, geo: 10, xeno: 4 }, 60, 'Grind lumen crystal into lenses and cells.', { grants: ['lumen'], needs: ['assembly'] }),
  T('gravium', 'Gravium Casting', 'recipe', 'core', 'industry', { geo: 18, xeno: 10 }, 80, 'Cast gravium plate and wind gravity coils.', { grants: ['gravity'], needs: ['steam_power'], mastery: ['industry', 2] }),
  T('alloys', 'Alloy Tables', 'recipe', 'ingot', 'industry', { geo: 14, energy: 6 }, 50, 'Steel beams and reinforced plate from the foundry.', { grants: ['steam'], recipes: ['steel_ingot', 'steel_beam', 'reinforced_plate'], needs: ['steam_power'] }),
  T('biofuel', 'Algae Fuel', 'recipe', 'pond', 'energy', { bio: 12, energy: 6 }, 45, 'Algae fuel and bio-oil for the reactors.', { recipes: ['algae_fuel', 'bio_oil'], needs: ['bio_reactor'] }),
  T('silk', 'Silk Glands', 'recipe', 'fibre', 'bio', { bio: 16 }, 50, 'Workers bred to spin fibre and silk.', { recipes: ['silk'], needs: ['labour'] }),
  // ---------------------------------------------------------------- logic
  T('logic_split', 'Splitters and Mergers', 'logic', 'nodes', 'robotics', { energy: 6, geo: 4 }, 30, 'Deal one supply out by ratio; draw several into one.', { grants: ['logic.split', 'logic.merge'] }),
  T('logic_cond', 'Route Conditions', 'logic', 'switch', 'robotics', { energy: 6 }, 30, 'Routes that move only above, below, by day, with power.', { grants: ['routes.conditions'] }),
  T('logic_buffer', 'Buffers and Counters', 'logic', 'capacitor', 'robotics', { energy: 10, geo: 6 }, 45, 'High and low marks; exact batches.', { grants: ['logic.buffer', 'logic.counter'], needs: ['logic_split'] }),
  T('logic_gate', 'Gates and Timers', 'logic', 'gauge', 'robotics', { energy: 12, xeno: 2 }, 50, 'Pass on a signal; shift work by the clock.', { grants: ['logic.gate', 'logic.timer'], needs: ['logic_cond'] }),
  T('logic_sensor', 'Sensors', 'logic', 'sensor', 'robotics', { energy: 14, xeno: 6 }, 60, 'Read a store, a machine or the grid and raise a signal.', { grants: ['logic.sensor'], needs: ['logic_gate'], mastery: ['robotics', 2] }),
  T('templates', 'Chain Templates', 'logic', 'template', 'robotics', { energy: 10, geo: 10 }, 45, 'Save a working chain and lay it down again.', { grants: ['routes.templates', 'blueprint'], needs: ['logic_split'] }),
  // ---------------------------------------------------------------- pod
  T('bp_plating', 'Pod Plating', 'pod', 'shield', 'industry', { geo: 12 }, 40, 'Blueprint: riveted armour over the pod shell.', { blueprint: 'pod_plating', buildings: ['limb_brace'], needs: ['upgrader'] }),
  T('bp_capacitor', 'Capacitor Ring', 'pod', 'capacitor', 'energy', { energy: 16 }, 45, 'Blueprint: more charge for arms, drones and tools.', { blueprint: 'pod_capacitor', needs: ['upgrader'] }),
  T('bp_sensor', 'Sensor Mast', 'pod', 'lens', 'robotics', { geo: 8, xeno: 4 }, 45, 'Blueprint: the scanner reaches 50% further.', { blueprint: 'pod_sensor', buildings: ['st_sensor', 'limb_mast'], needs: ['upgrader'] }),
  T('bp_coolant', 'Coolant Loop', 'pod', 'drop', 'energy', { energy: 18, geo: 8 }, 55, 'Blueprint: tools and cannon cool twice as fast.', { blueprint: 'pod_coolant', needs: ['bp_capacitor'] }),
  // ---------------------------------------------------------------- arms
  T('bp_socket', 'Arm Socket', 'arm', 'armsocket', 'robotics', { geo: 14, energy: 8 }, 60, 'Blueprint: a new mount ring for one more arm.', { blueprint: 'arm_socket', needs: ['upgrader'], mastery: ['robotics', 1] }),
  T('bp_grapple', 'Grapple Arm', 'arm', 'claw', 'robotics', { geo: 8, energy: 4 }, 40, 'Blueprint: lifts creatures, crates and boulders.', { blueprint: 'arm_grapple', buildings: ['arm_grabber'], needs: ['upgrader'] }),
  T('bp_cutter', 'Cutter Arm', 'arm', 'log', 'plant', { bio: 8, geo: 6 }, 40, 'Blueprint: fells trees and cuts fibre.', { blueprint: 'arm_cutter', needs: ['upgrader'] }),
  T('bp_drill', 'Drill Arm', 'arm', 'drill', 'industry', { geo: 14 }, 45, 'Blueprint: bores ore from seams in reach.', { blueprint: 'arm_drill', needs: ['upgrader'] }),
  T('bp_welder', 'Welder Arm', 'arm', 'wrench', 'robotics', { energy: 10, geo: 8 }, 50, 'Blueprint: repairs buildings and drones in reach.', { blueprint: 'arm_welder', needs: ['bp_grapple'] }),
  T('bp_long', 'Long Boom', 'arm', 'telescope', 'robotics', { geo: 18, energy: 10 }, 70, 'Blueprint: a boom twice as long as the standard arm.', { blueprint: 'arm_long', needs: ['bp_socket'], mastery: ['robotics', 3] }),
  // ---------------------------------------------------------------- tools
  T('bp_scanner2', 'Deep Scanner', 'tool', 'sensor', 'robotics', { geo: 10, xeno: 6 }, 50, 'Blueprint: the scan tool reads buried bodies and pays more data.', { blueprint: 'tool_scanner2', needs: ['upgrader'] }),
  T('bp_tractor', 'Tractor Beam', 'tool', 'arcs', 'energy', { energy: 16, xeno: 6 }, 60, 'Blueprint: pull items and creatures to the pod.', { blueprint: 'tool_tractor', buildings: ['arm_gravity'], needs: ['bp_capacitor'] }),
  T('bp_repair', 'Repair Spray', 'tool', 'cross', 'industry', { geo: 10, energy: 8 }, 50, 'Blueprint: patch buildings from the pod.', { blueprint: 'tool_repair', needs: ['upgrader'] }),
  T('bp_cannon', 'Field Cannon', 'tool', 'blast', 'robotics', { geo: 20, energy: 20, xeno: 6 }, 90, 'Blueprint: the pod\'s heavy gun.', { blueprint: 'tool_cannon', buildings: ['arm_cannon'], needs: ['bp_coolant'], mastery: ['robotics', 2] }),
  // ---------------------------------------------------------------- drones
  T('bp_drone_scout', 'Scout Drone', 'drone', 'drone', 'robotics', { energy: 8, geo: 6 }, 45, 'Blueprint: a fast flyer that scans what it passes.', { blueprint: 'drone_scout', needs: ['upgrader'] }),
  T('bp_drone_hauler', 'Hauler Drone', 'drone', 'crate', 'robotics', { energy: 12, geo: 10 }, 60, 'Blueprint: carries a crate between containers.', { blueprint: 'drone_hauler', buildings: ['drone_carrier'], needs: ['bp_drone_scout'] }),
  T('bp_drone_builder', 'Builder Drone', 'drone', 'wrench', 'robotics', { energy: 14, geo: 14 }, 70, 'Blueprint: works construction sites on its own.', { blueprint: 'drone_builder', buildings: ['drone_repair'], needs: ['bp_drone_hauler'], mastery: ['robotics', 2] }),
  T('bp_drone_bay', 'Drone Bay', 'drone', 'hive', 'robotics', { energy: 18, geo: 12, xeno: 4 }, 80, 'Blueprint: two more drone berths in the pod.', { blueprint: 'drone_bay', needs: ['bp_drone_scout'], mastery: ['robotics', 3] }),
];
export const TECH: Record<string, Tech> = Object.fromEntries(TECHS.map((t) => [t.id, t]));
