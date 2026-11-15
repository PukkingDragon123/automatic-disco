// What the pod can build onto itself and around itself: arms on the hardpoints, drones on the pad, area structures on
// the ground, and pod limbs. Everything is costly (real parts out of the colony's stores). The logistics agent's
// build menu may list these through `colonyCatalog()`; placing goes through `colony.build(id, at?)`.
import type { ArmKind } from './arms';

export type CatId =
  | 'arm_manipulator' | 'arm_grabber' | 'arm_drill' | 'arm_welder' | 'arm_cannon' | 'arm_gravity'
  | 'drone_scout' | 'drone_carrier' | 'drone_repair'
  | 'st_gravpole' | 'st_relay' | 'st_lamp' | 'st_sensor'
  | 'limb_brace' | 'limb_mast';
export type CatKind = 'arm' | 'drone' | 'structure' | 'limb';
export interface CatEntry {
  id: CatId; kind: CatKind; name: string; desc: string; icon: string;
  /** parts out of the stores (item id -> count) */
  cost: Record<string, number>;
  /** seconds to fit or raise (crew on site halve it) */
  time: number;
  /** steady power draw once running (kW) */
  kw: number;
  arm?: ArmKind; drone?: 'scout' | 'carrier' | 'repair'; struct?: 'gravpole' | 'relay' | 'lamp' | 'sensor';
}
const E = (e: CatEntry) => e;
export const CATALOG: Record<CatId, CatEntry> = {
  arm_manipulator: E({ id: 'arm_manipulator', kind: 'arm', arm: 'manipulator', name: 'Manipulator Arm', icon: 't-claw', time: 40, kw: 1.5, desc: 'A second six-metre claw arm. Scanner, sampler and seed planter.', cost: { iron_plate: 30, servo: 6, circuit: 4, motor: 4 } }),
  arm_grabber: E({ id: 'arm_grabber', kind: 'arm', arm: 'grabber', name: 'Gravity Grabber Arm', icon: 't-grab', time: 55, kw: 2, desc: 'Lifts a creature or a boulder in a graviton field, swings it and throws it.', cost: { iron_plate: 30, servo: 6, circuit: 8, motor: 4, crystal: 6 } }),
  arm_drill: E({ id: 'arm_drill', kind: 'arm', arm: 'drill', name: 'Core Drill Arm', icon: 't-drill', time: 60, kw: 2, desc: 'Bores ore seams and rock in reach. Loud, hungry for power.', cost: { iron_plate: 30, steel_beam: 10, motor: 6, gear: 20 } }),
  arm_welder: E({ id: 'arm_welder', kind: 'arm', arm: 'welder', name: 'Welder Arm', icon: 't-weld', time: 45, kw: 1.5, desc: 'Arc-welds the pod, arms, drones and structures in reach back together.', cost: { iron_plate: 24, servo: 4, copper_wire: 30, circuit: 6 } }),
  arm_cannon: E({ id: 'arm_cannon', kind: 'arm', arm: 'cannon', name: 'Mass Driver Cannon', icon: 't-cannon', time: 90, kw: 2, desc: 'A coil-gun turret. Aimed over the barrel. Seventy metres, huge draw per shot.', cost: { steel_beam: 16, reinforced_plate: 12, motor: 6, circuit: 10, copper_wire: 40 } }),
  arm_gravity: E({ id: 'arm_gravity', kind: 'arm', arm: 'gravity', name: 'Gravity Projector', icon: 't-lift', time: 70, kw: 3, desc: 'Throws a lift field fourteen metres: floats creatures and loose things.', cost: { iron_plate: 20, circuit: 12, crystal: 12, servo: 4 } }),
  drone_scout: E({ id: 'drone_scout', kind: 'drone', drone: 'scout', name: 'Scout Drone', icon: 't-scout', time: 30, kw: 0, desc: 'Fast, light. A scanner and sampler that flies where the arms cannot reach.', cost: { iron_plate: 8, motor: 4, circuit: 4 } }),
  drone_carrier: E({ id: 'drone_carrier', kind: 'drone', drone: 'carrier', name: 'Carrier Drone', icon: 't-carrier', time: 45, kw: 0, desc: 'A winch hook under four ducted fans: carries items and small creatures home, plants seeds.', cost: { iron_plate: 16, motor: 6, circuit: 4, gear: 8 } }),
  drone_repair: E({ id: 'drone_repair', kind: 'drone', drone: 'repair', name: 'Repair Drone', icon: 't-repairdrone', time: 40, kw: 0, desc: 'A flying welder. Patches structures and machines anywhere in signal range.', cost: { iron_plate: 12, motor: 4, circuit: 6, copper_wire: 12 } }),
  st_gravpole: E({ id: 'st_gravpole', kind: 'structure', struct: 'gravpole', name: 'Gravitation Pole', icon: 't-pole', time: 80, kw: 4, desc: 'A field around the area: lifts, pushes away or pulls in everything inside six metres.', cost: { steel_beam: 8, circuit: 10, crystal: 10, copper_wire: 30 } }),
  st_relay: E({ id: 'st_relay', kind: 'structure', struct: 'relay', name: 'Relay Mast', icon: 't-relay', time: 35, kw: 2, desc: 'Carries the pod\'s control signal thirty metres further: drones and building reach.', cost: { iron_rod: 20, circuit: 4, copper_wire: 20 } }),
  st_lamp: E({ id: 'st_lamp', kind: 'structure', struct: 'lamp', name: 'Lamp Post', icon: 't-lamp', time: 15, kw: 0.6, desc: 'Floodlight on a pole. The crew work and sleep better; night things keep off.', cost: { iron_rod: 6, glass: 4, copper_wire: 6 } }),
  st_sensor: E({ id: 'st_sensor', kind: 'structure', struct: 'sensor', name: 'Sensor Mast', icon: 't-sensor', time: 40, kw: 3, desc: 'Radar and a camera head: sees twenty-eight metres and scans what walks past.', cost: { iron_rod: 12, circuit: 6, glass: 6 } }),
  limb_brace: E({ id: 'limb_brace', kind: 'limb', name: 'Bracing Limbs', icon: 't-brace', time: 60, kw: 0, desc: 'Four extra struts and armour skirts bolted to the hull: +60% pod integrity.', cost: { steel_beam: 12, reinforced_plate: 8, iron_plate: 20 } }),
  limb_mast: E({ id: 'limb_mast', kind: 'limb', name: 'Pod Sensor Boom', icon: 't-sensor', time: 40, kw: 2, desc: 'A telescoping sensor boom on the cupola: the pod sees twice as far.', cost: { iron_rod: 10, circuit: 6, glass: 4 } }),
};
export const CAT_ORDER: CatId[] = ['arm_manipulator', 'arm_grabber', 'arm_drill', 'arm_welder', 'arm_gravity', 'arm_cannon', 'drone_scout', 'drone_carrier', 'drone_repair', 'st_lamp', 'st_relay', 'st_sensor', 'st_gravpole', 'limb_brace', 'limb_mast'];
/** the pod's cargo at touchdown: enough for one or two choices, never everything */
export const STARTING_CARGO: Record<string, number> = { iron_plate: 40, iron_rod: 24, gear: 16, motor: 6, circuit: 10, servo: 4, copper_wire: 40, glass: 8, steel_beam: 4, crystal: 4, fruit: 30, water: 20 };
/** for other menus (the logistics build menu): every entry, in order */
export function colonyCatalog(): CatEntry[] { return CAT_ORDER.map((k) => CATALOG[k]); }
