// Cyberware: the pure catalogue. Which slots a body has for hardware, which
// flesh each slot replaces, and every part with its upside, its downside and
// its numbers. No game state here, so the rig (src/entities/cyberGear.ts), the
// operating table (src/ui/surgery) and the rules (src/survival/cyber.ts) can
// all import it.
import type { BodyPart } from '../items/item';

export type CyberSlot = 'arm_l' | 'arm_r' | 'hand_l' | 'hand_r' | 'leg_l' | 'leg_r' | 'eyes' | 'jaw' | 'spine' | 'skin';
export type CyberKind = 'arm' | 'hand' | 'leg' | 'eyes' | 'jaw' | 'spine' | 'skin';
/** how the hardware looks (cyberGear.ts builds one family of meshes per style) */
export type CyberStyle = 'scrap' | 'servo' | 'piston' | 'vise' | 'tool' | 'coil' | 'lamp' | 'ledger' | 'trap' | 'gantry' | 'plate';

export const CYBER_SLOTS: CyberSlot[] = ['arm_l', 'arm_r', 'hand_l', 'hand_r', 'leg_l', 'leg_r', 'eyes', 'jaw', 'spine', 'skin'];
export const SLOT_KIND: Record<CyberSlot, CyberKind> = {
  arm_l: 'arm', arm_r: 'arm', hand_l: 'hand', hand_r: 'hand', leg_l: 'leg', leg_r: 'leg', eyes: 'eyes', jaw: 'jaw', spine: 'spine', skin: 'skin',
};
export const SLOT_NAME: Record<CyberSlot, string> = {
  arm_l: 'Left arm', arm_r: 'Right arm', hand_l: 'Left hand', hand_r: 'Right hand', leg_l: 'Left leg', leg_r: 'Right leg',
  eyes: 'Eyes', jaw: 'Jaw', spine: 'Spine', skin: 'Skin',
};
/** short code for the hologram tags */
export const SLOT_CODE: Record<CyberSlot, string> = {
  arm_l: 'L.ARM', arm_r: 'R.ARM', hand_l: 'L.HND', hand_r: 'R.HND', leg_l: 'L.LEG', leg_r: 'R.LEG', eyes: 'OPTIC', jaw: 'JAW', spine: 'SPINE', skin: 'DERM',
};
/** the flesh a slot replaces (an arm takes the hand with it) */
export const SLOT_COVERS: Record<CyberSlot, BodyPart[]> = {
  arm_l: ['uarm_l', 'farm_l', 'hand_l'], arm_r: ['uarm_r', 'farm_r', 'hand_r'], hand_l: ['hand_l'], hand_r: ['hand_r'],
  leg_l: ['thigh_l', 'shin_l', 'foot_l'], leg_r: ['thigh_r', 'shin_r', 'foot_r'], eyes: [], jaw: [], spine: [], skin: [],
};
/** slots that cannot hold hardware at the same time (a whole arm replaces the hand) */
export function slotConflicts(s: CyberSlot): CyberSlot[] {
  if (s === 'arm_l') return ['hand_l']; if (s === 'arm_r') return ['hand_r'];
  if (s === 'hand_l') return ['arm_l']; if (s === 'hand_r') return ['arm_r'];
  return [];
}

/** what a part does. Multipliers are deltas (attack 0.3 = +30%, move -0.05 = 5% slower, action -0.15 = 15% quicker). */
export interface CyberFx {
  attack?: number; move?: number; action?: number; aim?: number;
  /** + kg carrying capacity */
  carry?: number;
  /** clank radius (tiles) every few steps */
  noise?: number;
  /** battery drain, % of the cell per game hour (0 = unpowered hardware) */
  drain?: number;
  /** rust per soaked game hour (scrap rusts) */
  rust?: number;
  /** wounds on the rest of the body are this much less severe (dermal plating) */
  armor?: number;
  /** body heat lost per hour */
  cold?: number;
  /** fatigue added per hour */
  fatigue?: number;
  /** lucidity lost per hour */
  lucid?: number;
  /** shove / kick knock-back multiplier delta */
  kick?: number;
  /** existing traits the hardware behaves like (reuses their effects) */
  grants?: string[];
  /** traits the hardware cancels (a vice cannot have butterfingers) */
  revokes?: string[];
}

export interface CyberDef {
  key: string; name: string; kind: CyberKind; style: CyberStyle;
  /** maker's mark on the part (all invented) */
  maker: string;
  tier: number;
  good: string; bad: string; desc: string;
  fx: CyberFx;
  /** research node that opens it at the operating table (none: always available) */
  node?: string; cost?: number; requires?: string[];
  /** the boxed part as an item (found, crafted, installed in the field) */
  item: string;
  /** neon accent */
  glow: number;
  weight: number;
}

export const CYBER_PARTS: CyberDef[] = [
  // ---------------------------------------------------------------- the one you start with
  { key: 'scrap_arm', name: 'Scrapjack Arm', kind: 'arm', style: 'scrap', maker: 'BAY-3 SALVAGE', tier: 0, glow: 0xff8a2a, weight: 4.5,
    desc: 'Pipe, rebar, a car-jack piston and a vice for a hand, bolted to your shoulder by a machine that has done this before.',
    good: 'Melee hits 30% harder, +3 kg carrying, the vice never lets go of what it grips.',
    bad: 'Heavy: 5% slower. Clanks when you move. Rusts when wet and seizes up until oiled.',
    fx: { attack: 0.3, carry: 3, move: -0.05, noise: 7, rust: 1, kick: 0.2, revokes: ['butterfingers'] }, item: 'cy_scrap_arm' },
  // ---------------------------------------------------------------- researched (branch 'cyber')
  { key: 'scrap_leg', name: 'Scrapjack Leg', kind: 'leg', style: 'scrap', maker: 'BAY-3 SALVAGE', tier: 0, glow: 0xff8a2a, weight: 6,
    desc: 'A scaffold pole, a shock absorber off a delivery van and a boot welded to the end.',
    good: 'Never limps. Shoves and kicks land like a car door. +2 kg carrying.',
    bad: 'Every step clanks. 3% slower. Rusts when wet.',
    fx: { kick: 0.6, carry: 2, move: -0.03, noise: 9, rust: 1 }, node: 'cyber:scrap_leg', cost: 3, item: 'cy_scrap_leg' },
  { key: 'vise_hand', name: 'Vise-Grip Hand', kind: 'hand', style: 'vise', maker: 'GRIPWELL', tier: 1, glow: 0xffc23a, weight: 1.2,
    desc: 'A machinist\'s vice with knuckles. The jaws close on a thought and stay closed.',
    good: 'Never drops what it holds, even in a panic. Melee +15%.',
    bad: 'Numb: fine work takes 10% longer.',
    fx: { attack: 0.15, action: 0.1, revokes: ['butterfingers'] }, node: 'cyber:vise_hand', cost: 4, requires: ['cyber:scrap_leg'], item: 'cy_vise_hand' },
  { key: 'tool_hand', name: 'Multitool Hand', kind: 'hand', style: 'tool', maker: 'OKAPI TOOLWORKS', tier: 1, glow: 0x9aff6a, weight: 1,
    desc: 'Five fingers, and in each a driver, a blade, pliers, a probe and a torch.',
    good: 'Crafting, repairs and treatment go 20% faster.',
    bad: 'A weak fist: melee 15% weaker.',
    fx: { action: -0.2, attack: -0.15 }, node: 'cyber:tool_hand', cost: 5, requires: ['cyber:vise_hand'], item: 'cy_tool_hand' },
  { key: 'servo_arm', name: 'Halden Mk.II Servo Arm', kind: 'arm', style: 'servo', maker: 'HALDEN DYNAMICS', tier: 2, glow: 0xffa040, weight: 3,
    desc: 'A cream enamel servo limb with brass collars and a valve amplifier on the forearm that glows when it thinks.',
    good: 'Hands work 15% quicker and aim steadies 10%.',
    bad: 'Runs on its battery (4% an hour); flat, it hangs heavy and slow. Hums.',
    fx: { action: -0.15, aim: 0.1, drain: 4, noise: 4 }, node: 'cyber:servo_arm', cost: 8, requires: ['cyber:scrap_leg'], item: 'cy_servo_arm' },
  { key: 'piston_arm', name: 'Ram-Bore Piston Arm', kind: 'arm', style: 'piston', maker: 'KETTERING HEAVY', tier: 2, glow: 0xff3a3a, weight: 7,
    desc: 'Two hydraulic rams and a fist like an anvil. Built for demolition crews.',
    good: 'Melee hits 60% harder; furniture and doors come apart.',
    bad: 'No fine control: crafting and treatment take 30% longer. Very heavy, 7% slower. Leaks.',
    fx: { attack: 0.6, action: 0.3, move: -0.07, carry: 4, noise: 8, kick: 0.4 }, node: 'cyber:piston_arm', cost: 10, requires: ['cyber:servo_arm'], item: 'cy_piston_arm' },
  { key: 'coil_leg', name: 'Coil-Runner Leg', kind: 'leg', style: 'coil', maker: 'HALDEN DYNAMICS', tier: 2, glow: 0xffa040, weight: 3.5,
    desc: 'A sprung steel leaf on a clockwork knee, wound by every step. It wants to run.',
    good: 'Moves 12% faster and tires slower on the run.',
    bad: 'Drains its cell (5% an hour); flat, it drags. The spring twangs.',
    fx: { move: 0.12, drain: 5, noise: 5, grants: ['gym_rat'] }, node: 'cyber:coil_leg', cost: 9, requires: ['cyber:servo_arm'], item: 'cy_coil_leg' },
  { key: 'lamp_optic', name: 'Lamp-Eye Optic', kind: 'eyes', style: 'lamp', maker: 'NIGHTWARD', tier: 1, glow: 0xff2a4a, weight: 0.2,
    desc: 'Your eyes, swapped for a pair of red lamps that see what light they throw.',
    good: 'Sees further in the dark, with a wider view.',
    bad: 'The glow gives you away: things notice you from further off. Drains 1% an hour.',
    fx: { drain: 1, grants: ['eagle_eyed', 'smells_pizza'] }, node: 'cyber:lamp_optic', cost: 5, requires: ['cyber:scrap_leg'], item: 'cy_lamp_optic' },
  { key: 'ledger_optic', name: 'Appraiser Optic', kind: 'eyes', style: 'ledger', maker: 'MERIDIAN SURPLUS', tier: 2, glow: 0x7aff5a, weight: 0.2,
    desc: 'An Institute auditor\'s eye. It prices everything it looks at, including you.',
    good: 'Finds a little more in every container; knows what is worth hauling.',
    bad: 'Adverts behind the eyes: lucidity drains a little faster. 1% an hour.',
    fx: { drain: 1, lucid: 0.4, grants: ['lucky'] }, node: 'cyber:ledger_optic', cost: 7, requires: ['cyber:lamp_optic'], item: 'cy_ledger_optic' },
  { key: 'trap_jaw', name: 'Bear-Trap Jaw', kind: 'jaw', style: 'trap', maker: 'BAY-3 SALVAGE', tier: 1, glow: 0xff8a2a, weight: 0.8,
    desc: 'A sprung steel jaw riveted where yours was. It chews through anything.',
    good: 'Eats anything, raw or rotten, and rarely gets sick from it.',
    bad: 'Every word comes out mangled; people find you hard to be around (stress builds faster).',
    fx: { grants: ['iron_gut', 'worrier'] }, node: 'cyber:trap_jaw', cost: 6, requires: ['cyber:scrap_leg'], item: 'cy_trap_jaw' },
  { key: 'gantry_spine', name: 'Gantry Spine', kind: 'spine', style: 'gantry', maker: 'KETTERING HEAVY', tier: 2, glow: 0xffc23a, weight: 5,
    desc: 'A crane\'s backbone along yours: vertebrae of cast steel, cables to the hips and shoulders.',
    good: '+8 kg carrying. Heavy loads barely slow you.',
    bad: 'Aches: fatigue builds faster. Drains 3% an hour.',
    fx: { carry: 8, fatigue: 0.8, drain: 3 }, node: 'cyber:gantry_spine', cost: 10, requires: ['cyber:servo_arm'], item: 'cy_gantry_spine' },
  { key: 'plate_dermis', name: 'Plate Dermis', kind: 'skin', style: 'plate', maker: 'GRIPWELL', tier: 3, glow: 0xffd080, weight: 6,
    desc: 'Overlapping enamelled steel plates riveted into the skin of the chest, shoulders and thighs.',
    good: 'Wounds land 35% softer.',
    bad: 'Cold: loses body heat faster. Heavy, 4% slower.',
    fx: { armor: 0.35, cold: 0.25, move: -0.04 }, node: 'cyber:plate_dermis', cost: 12, requires: ['cyber:gantry_spine'], item: 'cy_plate_dermis' },
];

const BY_KEY = new Map(CYBER_PARTS.map((d) => [d.key, d]));
const BY_ITEM = new Map(CYBER_PARTS.map((d) => [d.item, d]));
export const cyberDef = (k: string | undefined | null) => (k ? BY_KEY.get(k) : undefined);
export const cyberDefByItem = (k: string) => BY_ITEM.get(k);
export const partsFor = (slot: CyberSlot) => CYBER_PARTS.filter((d) => d.kind === SLOT_KIND[slot]);
export const sideOf = (slot: CyberSlot): 'l' | 'r' | '' => (slot.endsWith('_l') ? 'l' : slot.endsWith('_r') ? 'r' : '');

/** the flesh body parts replaced by a loadout ({slot: part key}) */
export function coveredParts(load: Partial<Record<string, string>> | undefined | null): BodyPart[] {
  if (!load) return [];
  const out: BodyPart[] = [];
  for (const [slot, k] of Object.entries(load)) if (k && SLOT_COVERS[slot as CyberSlot]) out.push(...SLOT_COVERS[slot as CyberSlot]);
  return out;
}
/** which slot's hardware a flesh body part is (or undefined when it is flesh) */
export function slotCovering(load: Partial<Record<string, unknown>> | undefined | null, part: string): CyberSlot | undefined {
  if (!load) return undefined;
  for (const s of CYBER_SLOTS) if (load[s] && (SLOT_COVERS[s] as string[]).includes(part)) return s;
  return undefined;
}
