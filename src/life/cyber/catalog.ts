// CYBORG WORKERS: the robotic parts catalogue. The colony's workers are engineered creatures fitted with hardware:
// cybernetic limb replacements (hydraulic legs, digging claws, tool arms with a drill, a saw, a welder or a
// gripper), load harnesses and cargo frames, a seed hopper, a sensor visor, armour plating, a power pack with its
// cables, and the neural control collar that keeps the animal on task. Each part has a body SLOT, the body plans it
// fits, a cost in REAL items (src/factory/items.ts ids), and what it adds: carry capacity, speed, skills toward
// the seven worker roles, armour, upkeep (power and maintenance). Pure data: the sculptor (cyber/mount.ts), the role
// model (cyber/roles.ts) and the lab's fitting bay (ui/forge.ts) all read it.
import type { Plan } from '../genes';

/** where a part goes on the body (one part per slot; tool arms take the shoulder) */
export type Slot = 'head' | 'collar' | 'back' | 'power' | 'fore' | 'hind' | 'tool' | 'armour';
export const SLOT_ORDER: Slot[] = ['head', 'collar', 'tool', 'back', 'power', 'armour', 'fore', 'hind'];
export const SLOT_NAME: Record<Slot, string> = {
  head: 'SENSOR HEAD', collar: 'CONTROL COLLAR', back: 'BACK RIG', power: 'POWER PACK', fore: 'FORELIMBS', hind: 'HIND LIMBS', tool: 'TOOL ARM', armour: 'PLATING',
};
export const SLOT_DESC: Record<Slot, string> = {
  head: 'Sensors over the eyes: range, night vision, survey.',
  collar: 'The neural control collar: obedience, coordination, the colony link.',
  back: 'Harness and cargo frame, or a seed hopper: what it carries on its back.',
  power: 'A power cell for the machinery, cabled to every fitted part.',
  fore: 'Front limbs: hydraulic replacements or digging claws.',
  hind: 'Hind limbs: hydraulic replacements for load and stride.',
  tool: 'A boom arm on the shoulder (or in place of a biped\'s arms): drill, saw, welder, gripper.',
  armour: 'Bolted plating over the shoulders and flanks.',
};
/** the seven jobs a worker is built for */
export type Role = 'hauler' | 'miner' | 'farmer' | 'builder' | 'operator' | 'guard' | 'scout';
export const ROLES: Role[] = ['hauler', 'miner', 'farmer', 'builder', 'operator', 'guard', 'scout'];
export const ROLE_NAME: Record<Role, string> = { hauler: 'HAULER', miner: 'MINER', farmer: 'FARMER', builder: 'BUILDER', operator: 'OPERATOR', guard: 'GUARD', scout: 'SCOUT' };
export type Skill = 'haul' | 'dig' | 'farm' | 'build' | 'operate' | 'guard' | 'scout';
export const SKILLS: Skill[] = ['haul', 'dig', 'farm', 'build', 'operate', 'guard', 'scout'];
export const ROLE_SKILL: Record<Role, Skill> = { hauler: 'haul', miner: 'dig', farmer: 'farm', builder: 'build', operator: 'operate', guard: 'guard', scout: 'scout' };

/** the livery a worker's machinery is painted in, by role (a ramp and step of the master palette, an accent) */
export const LIVERY: Record<Role, { paint: [string, number]; accent: [string, number]; frame: [string, number] }> = {
  hauler: { paint: ['ochre', 4], accent: ['ink', 1], frame: ['slate', 2] },
  miner: { paint: ['rust', 4], accent: ['ochre', 5], frame: ['basalt', 2] },
  farmer: { paint: ['olive', 4], accent: ['straw', 5], frame: ['slate', 2] },
  builder: { paint: ['brass', 4], accent: ['ink', 1], frame: ['slate', 2] },
  operator: { paint: ['sky', 3], accent: ['snow', 5], frame: ['slate', 2] },
  guard: { paint: ['slate', 3], accent: ['ruby', 3], frame: ['basalt', 1] },
  scout: { paint: ['snow', 4], accent: ['teal', 4], frame: ['slate', 2] },
};

export interface CyberPart {
  id: string; name: string; slot: Slot;
  /** the body plans it fits (any if omitted) */
  plans?: Plan[];
  /** cost in real items */
  cost: Record<string, number>;
  /** what it adds */
  carry?: number; speed?: number; armour?: number; sight?: number;
  skills: Partial<Record<Skill, number>>;
  /** power draw (units per minute) and wear (maintenance per hour of work) */
  power: number; wear: number;
  /** obedience it gives (collars) */
  control?: number;
  desc: string;
}
const LEGGED: Plan[] = ['quadruped', 'biped', 'hexapodV'];
const P = (p: CyberPart) => p;
export const CYBER_PARTS: CyberPart[] = [
  P({ id: 'cy_visor', name: 'Survey Visor', slot: 'head', cost: { glass: 2, circuit: 2, copper_wire: 3 }, sight: 14, skills: { scout: 2, operate: 0.6 }, power: 0.4, wear: 0.1, desc: 'A sealed visor band over the eyes: rangefinder, thermal and night optics, a mast with a survey lens.' }),
  P({ id: 'cy_sensor', name: 'Sensor Mast Head', slot: 'head', cost: { circuit: 3, vacuum_tube: 2, glass: 1, iron_plate: 2 }, sight: 22, skills: { scout: 3, guard: 0.8 }, power: 0.8, wear: 0.2, desc: 'A full sensor head: twin lenses, a radar fin and an aerial on the skull. It sees over the treeline.' }),
  P({ id: 'cy_collar', name: 'Neural Control Collar', slot: 'collar', cost: { control_unit: 1, copper_wire: 4, iron_plate: 2 }, control: 1, skills: { operate: 1.2, haul: 0.3, build: 0.3 }, power: 0.3, wear: 0.05, desc: 'Electrodes into the brain stem and a control module: the animal stays on task and takes the colony\'s orders.' }),
  P({ id: 'cy_cargo', name: 'Load Harness & Cargo Frame', slot: 'back', plans: [...LEGGED, 'serpent'], cost: { steel_beam: 3, iron_rod: 4, rubber: 2, screw: 4 }, carry: 30, speed: -0.3, skills: { haul: 3 }, power: 0, wear: 0.15, desc: 'Padded straps round the barrel and a welded rack over the back, crates lashed on. It carries a load of goods.' }),
  P({ id: 'cy_hopper', name: 'Seed Hopper & Spray Boom', slot: 'back', plans: LEGGED, cost: { iron_plate: 4, rubber: 2, motor: 1, iron_rod: 2 }, carry: 8, skills: { farm: 3 }, power: 0.6, wear: 0.2, desc: 'A seed and water hopper with a rear boom: it sows, waters and sprays as it walks the rows.' }),
  P({ id: 'cy_power', name: 'Fuel-Cell Power Pack', slot: 'power', cost: { motor: 1, cable: 4, iron_plate: 3, circuit: 1 }, speed: 0.4, skills: { haul: 0.4, dig: 0.4, build: 0.4 }, power: -3, wear: 0.1, desc: 'A sealed cell over the hips with cooling fins and a gauge, cabled to every fitted part. Machinery runs harder.' }),
  P({ id: 'cy_hydfore', name: 'Hydraulic Forelegs', slot: 'fore', plans: LEGGED, cost: { servo: 2, steel_beam: 2, rubber: 2, iron_rod: 2 }, carry: 12, speed: 0.6, skills: { haul: 1, guard: 0.4 }, power: 0.8, wear: 0.35, desc: 'The forelegs replaced at the shoulder: steel struts, knee hubs, pistons and padded feet.' }),
  P({ id: 'cy_digclaw', name: 'Digging Claws', slot: 'fore', plans: LEGGED, cost: { steel_ingot: 3, servo: 1, iron_rod: 2 }, skills: { dig: 3, guard: 0.6 }, power: 0.4, wear: 0.4, desc: 'Hardened scoop claws over the forefeet on a powered wrist: it tears through soil and soft rock.' }),
  P({ id: 'cy_hydhind', name: 'Hydraulic Hind Legs', slot: 'hind', plans: LEGGED, cost: { servo: 2, steel_beam: 2, rubber: 2, iron_rod: 2 }, carry: 16, speed: 0.5, skills: { haul: 1.2 }, power: 0.8, wear: 0.35, desc: 'The hind legs replaced at the hip: load-rated struts with a hock piston and a broad foot.' }),
  P({ id: 'cy_drill', name: 'Rock Drill Arm', slot: 'tool', cost: { motor: 1, steel_ingot: 2, gear: 2, servo: 1 }, skills: { dig: 3.5 }, power: 1.2, wear: 0.5, desc: 'A boom arm on the shoulder with a fluted rock drill: seams, boulders and bedrock.' }),
  P({ id: 'cy_saw', name: 'Circular Saw Arm', slot: 'tool', cost: { motor: 1, steel_ingot: 1, gear: 2, servo: 1 }, skills: { build: 2, farm: 1.5 }, power: 1, wear: 0.4, desc: 'A guarded saw blade on a boom: timber, stalks and fibre crops.' }),
  P({ id: 'cy_welder', name: 'Welder Arm', slot: 'tool', cost: { circuit: 1, copper_wire: 4, servo: 1, glass: 1 }, skills: { build: 3.5, operate: 0.6 }, power: 1.4, wear: 0.3, desc: 'An arc torch on a boom with gas bottles: it builds and repairs machines and walls.' }),
  P({ id: 'cy_gripper', name: 'Gripper Arm', slot: 'tool', cost: { servo: 2, gear: 2, iron_rod: 2, circuit: 1 }, carry: 6, skills: { operate: 3, build: 1, haul: 0.8 }, power: 0.8, wear: 0.3, desc: 'A three-finger manipulator on a boom: it works levers, feeds machines and stacks crates.' }),
  P({ id: 'cy_plating', name: 'Armour Plating', slot: 'armour', cost: { reinforced_plate: 4, screw: 6 }, armour: 0.3, speed: -0.4, skills: { guard: 3 }, power: 0, wear: 0.1, desc: 'Bolted plates over the shoulders, flanks and haunches. It stands its ground.' }),
];
export const CYBER: Record<string, CyberPart> = Object.fromEntries(CYBER_PARTS.map((p) => [p.id, p]));
export const isCyber = (id: string) => id.startsWith('cy_') && !!CYBER[id];
/** the parts that fit a slot on a body plan */
export const partsFor = (slot: Slot, plan: Plan) => CYBER_PARTS.filter((p) => p.slot === slot && (!p.plans || p.plans.includes(plan)));
/** the slots a body plan offers */
export function slotsFor(plan: Plan): Slot[] {
  if (plan === 'serpent') return ['head', 'collar', 'tool', 'back', 'power', 'armour'];
  if (plan === 'hexapod' || plan === 'octopod' || plan === 'gastropod') return ['head', 'collar', 'back', 'power', 'armour'];
  return SLOT_ORDER;
}
/** fit a part (replacing whatever held its slot); returns the new fit list */
export function fitPart(fit: string[] | undefined, id: string): string[] {
  const p = CYBER[id]; if (!p) return [...(fit ?? [])];
  return [...(fit ?? []).filter((x) => CYBER[x]?.slot !== p.slot), id];
}
export const unfitPart = (fit: string[] | undefined, id: string) => (fit ?? []).filter((x) => x !== id);
/** the total cost of a fit list in real items */
export function fitCost(fit: string[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of fit ?? []) for (const [k, n] of Object.entries(CYBER[id]?.cost ?? {})) if (n > 0) out[k] = (out[k] ?? 0) + n;
  return out;
}
