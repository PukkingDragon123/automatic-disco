// Weapon engineering (PILLARS.md, pillar 3): a weapon is a FRAME (pistol, rifle, cannon, arm mount, turret), a POWER
// unit (gunpowder, electric, steam, gravity coil, atomic), a BARREL or EMITTER (rifled, rail, flame nozzle, gravity
// lens, spore launcher) and an AMMO or PAYLOAD (slugs, rocks, rail darts, napalm, and biological payloads grown from
// absorbed genes: venom, acid sacs, spines, spores, paralytic toxin). Its numbers emerge from the parts: damage, rate,
// range, spread, heat, ammo cost, weight; incompatible choices are refused with the reason, the way the gene lab
// refuses an unviable body. Building one costs factory items (game.factory, when it exists).
import type { Weapon, WFx, ShotKind } from '../unit';
import { RAMPS } from '../../art/palette';

export type Slot = 'frame' | 'power' | 'barrel' | 'payload';
export const SLOTS: Slot[] = ['frame', 'power', 'barrel', 'payload'];
export const SLOT_NAME: Record<Slot, string> = { frame: 'FRAME', power: 'POWER UNIT', barrel: 'BARREL / EMITTER', payload: 'AMMUNITION / PAYLOAD' };
export type Cost = Partial<Record<string, number>>;
export interface Mods { dmg?: number; rate?: number; range?: number; spread?: number; heat?: number; ammo?: number; weight?: number; speed?: number; splash?: number }
export interface Part {
  id: string; slot: Slot; name: string; desc: string; cost: Cost;
  /** multipliers (frame values are the base) */
  m: Mods;
  /** what a hit does */
  fx?: WFx;
  /** delivery: overrides the frame's natural shot */
  shot?: ShotKind;
  /** absorbed genes that unlock it (any of) */
  genes?: string[];
  /** a ramp for the tracer / flame / cloud */
  col?: number;
  /** where it can be mounted: hand (held or arm), mount (shoulder / turret ring) */
  mount?: 'hand' | 'arm' | 'mount';
}

const P = (p: Part) => p;
export const PARTS: Part[] = [
  // ---- frames: the base numbers
  P({ id: 'pistol', slot: 'frame', name: 'Service Pistol Frame', desc: 'A pressed-steel grip and receiver. Light, quick, short.', cost: { iron_plate: 2, screw: 4 }, m: { dmg: 4, rate: 1.6, range: 6, spread: 0.05, heat: 0.6, ammo: 1, weight: 1.5, speed: 26 }, mount: 'hand' }),
  P({ id: 'rifle', slot: 'frame', name: 'Long Rifle Frame', desc: 'A stocked receiver for a long barrel. The Corps standard.', cost: { iron_plate: 4, iron_rod: 2, screw: 6 }, m: { dmg: 7, rate: 1.2, range: 10, spread: 0.03, heat: 0.8, ammo: 1, weight: 4, speed: 30 }, mount: 'hand' }),
  P({ id: 'cannon', slot: 'frame', name: 'Cannon Breech', desc: 'A screw breech and a recoil cradle. Slow, brutal, heavy.', cost: { steel_beam: 2, reinforced_plate: 2, gear: 4 }, m: { dmg: 24, rate: 0.35, range: 13, spread: 0.02, heat: 2.2, ammo: 3, weight: 14, speed: 22, splash: 1.5 }, shot: 'shell', mount: 'mount' }),
  P({ id: 'armmount', slot: 'frame', name: 'Forearm Mount', desc: 'A clamp-on receiver for a robot arm or the golem\'s forearm, fed from a belt box.', cost: { iron_plate: 4, gear: 2, servo: 1 }, m: { dmg: 8, rate: 1.6, range: 9, spread: 0.04, heat: 1, ammo: 1, weight: 6, speed: 28 }, mount: 'arm' }),
  P({ id: 'turret', slot: 'frame', name: 'Ring Turret', desc: 'A slewing ring with a gunner\'s cradle and twin feeds: sustained fire from a mount.', cost: { steel_beam: 3, gear: 6, motor: 1, circuit: 1 }, m: { dmg: 9, rate: 2.4, range: 12, spread: 0.035, heat: 1.2, ammo: 1, weight: 18, speed: 30 }, mount: 'mount' }),
  // ---- power
  P({ id: 'powder', slot: 'power', name: 'Gunpowder', desc: 'Brass cases and cordite. Reliable, smoky, cheap.', cost: { ammo: 2 }, m: {} }),
  P({ id: 'electric', slot: 'power', name: 'Electric Coil Gun', desc: 'Capacitors and a coil stack: faster cycling, little ammunition, a lot of heat.', cost: { copper_wire: 6, circuit: 1, vacuum_tube: 2 }, m: { rate: 1.3, ammo: 0.3, heat: 1.5, speed: 1.3, weight: 1.15 } }),
  P({ id: 'steam', slot: 'power', name: 'Steam Accumulator', desc: 'A little boiler and a pressure gauge. Harder hits, slower cycling, runs cool.', cost: { iron_plate: 4, iron_rod: 2, rubber: 1 }, m: { dmg: 1.2, rate: 0.8, heat: 0.6, weight: 1.3 } }),
  P({ id: 'gravity', slot: 'power', name: 'Gravity Coil', desc: 'A field coil like Unit 07\'s own: shots leave faster and punch through.', cost: { copper_wire: 8, crystal: 2, circuit: 1 }, m: { speed: 1.6, dmg: 1.1, heat: 1.2 }, fx: { pierce: 1 } }),
  P({ id: 'atomic', slot: 'power', name: 'Atomic Cell', desc: 'A shielded reactor slug in a lead can. Enormous power and enormous heat.', cost: { reactor_core: 1, steel_ingot: 4 }, m: { dmg: 1.7, rate: 1.1, heat: 2.5, weight: 1.4, ammo: 0.2 } }),
  // ---- barrels and emitters
  P({ id: 'rifled', slot: 'barrel', name: 'Rifled Barrel', desc: 'Lands and grooves and a cooling jacket: tighter, further.', cost: { iron_rod: 3, steel_ingot: 1 }, m: { spread: 0.4, range: 1.2 } }),
  P({ id: 'rail', slot: 'barrel', name: 'Rail Pair', desc: 'Two copper rails on insulators. Needs electric, gravity or atomic power: a dart at a terrible speed.', cost: { copper_ingot: 4, copper_wire: 4, glass: 2 }, m: { speed: 2.4, dmg: 1.25, range: 1.4, spread: 0.3, heat: 1.4 }, fx: { pierce: 2 }, shot: 'beam' }),
  P({ id: 'flame', slot: 'barrel', name: 'Flame Nozzle', desc: 'A pilot light and a nozzle. Short reach; everything in the cone burns.', cost: { iron_rod: 2, rubber: 2, copper_ingot: 1 }, m: { range: 0.38, rate: 4, dmg: 0.35, spread: 2, speed: 0.3 }, fx: { burn: 3 }, shot: 'flame', col: RAMPS.glowAmber[4] }),
  P({ id: 'lens', slot: 'barrel', name: 'Gravity Lens', desc: 'Ground crystal in a coil ring. Needs a gravity coil: a beam that crushes and drags them in.', cost: { crystal: 4, glass: 2, copper_wire: 4 }, m: { dmg: 0.7, rate: 1.2, range: 0.9 }, fx: { pull: 3, pierce: 1 }, shot: 'beam', col: RAMPS.glowTeal[3] }),
  P({ id: 'spore', slot: 'barrel', name: 'Spore Launcher', desc: 'A wide tube that lobs a pod. It bursts into a cloud that lingers over the ground.', cost: { iron_plate: 2, rubber: 2, resin: 2 }, m: { range: 1.1, rate: 0.5, dmg: 1.2, speed: 0.5, splash: 1 }, shot: 'cloud' }),
  // ---- ammunition and payloads
  P({ id: 'slugs', slot: 'payload', name: 'Steel Slugs', desc: 'Drawn steel, copper-banded. Nothing clever.', cost: { iron_pellet: 4 }, m: {} }),
  P({ id: 'rocks', slot: 'payload', name: 'Field Stone', desc: 'Whatever Unit 07 scooped up, tumbled to size. Free and it knocks them back.', cost: { ore: 4 }, m: { dmg: 0.8, spread: 1.4 }, fx: { knock: 2 } }),
  P({ id: 'darts', slot: 'payload', name: 'Rail Darts', desc: 'Finned tungsten darts: they go through one thing and into the next.', cost: { steel_ingot: 2 }, m: { dmg: 1.1, speed: 1.2 }, fx: { pierce: 1 } }),
  P({ id: 'napalm', slot: 'payload', name: 'Napalm', desc: 'Jellied fuel. It sticks and it burns.', cost: { bio_oil: 2, resin: 1 }, m: { dmg: 0.9, splash: 1.1 }, fx: { burn: 4 }, col: RAMPS.glowAmber[3] }),
  P({ id: 'venom', slot: 'payload', name: 'Venom Gland', desc: 'Cultured from an absorbed fang or sting: the wound keeps on hurting.', cost: { protein: 2 }, m: { dmg: 0.8 }, fx: { poison: 5 }, genes: ['venom_fangs', 'stinger'], col: RAMPS.ichor[4] }),
  P({ id: 'acid', slot: 'payload', name: 'Acid Sac', desc: 'A gut culture that eats steel: armour counts for less while it bubbles.', cost: { protein: 2, glass: 1 }, m: { dmg: 0.85 }, fx: { acid: 5 }, genes: ['scav_gut', 'ferment_gut', 'mucus'], col: RAMPS.moss[5] }),
  P({ id: 'spines', slot: 'payload', name: 'Spine Bundle', desc: 'Grown quills fired as a fan: several hits per shot at short range.', cost: { protein: 1, silk: 1 }, m: { dmg: 0.45, range: 0.8 }, fx: { frag: 5 }, genes: ['chitin_spines', 'quills', 'horns'], col: RAMPS.bone[4] }),
  P({ id: 'spores', slot: 'payload', name: 'Spore Pods', desc: 'Budding pods that burst into a choking cloud.', cost: { protein: 1, fruit: 2 }, m: { dmg: 0.9, splash: 1.3 }, fx: { poison: 3 }, genes: ['budding', 'spawn', 'chloro_skin'], col: RAMPS.moss[4] }),
  P({ id: 'paralytic', slot: 'payload', name: 'Paralytic Toxin', desc: 'From an electric or tentacled lineage: whatever it touches moves at half speed.', cost: { protein: 2, copper_wire: 1 }, m: { dmg: 0.6 }, fx: { slow: 4 }, genes: ['electro', 'tentacles'], col: RAMPS.violet[4] }),
];
export const PART: Record<string, Part> = Object.fromEntries(PARTS.map((p) => [p.id, p]));
export const partsOf = (s: Slot) => PARTS.filter((p) => p.slot === s);

export interface WeaponDesign { id: string; name: string; frame: string; power: string; barrel: string; payload: string }
export interface WStats {
  dmg: number; rate: number; range: number; spread: number; heat: number; ammo: number; weight: number; speed: number; splash: number; dps: number;
  shot: ShotKind; fx: WFx; col: number; mount: 'hand' | 'arm' | 'mount';
}

/** why a combination will not work (null: it will) */
export function refuse(d: WeaponDesign, genes?: (id: string) => boolean): string | null {
  const f = PART[d.frame], p = PART[d.power], b = PART[d.barrel], a = PART[d.payload];
  if (!f || !p || !b || !a) return 'A part is missing from the drawing.';
  if (b.id === 'rail' && !['electric', 'gravity', 'atomic'].includes(p.id)) return 'A rail pair needs an electric, gravity or atomic power unit.';
  if (b.id === 'lens' && p.id !== 'gravity' && p.id !== 'atomic') return 'A gravity lens needs a gravity coil (or an atomic cell) behind it.';
  if (b.id === 'flame' && !['napalm', 'venom', 'acid', 'spores', 'paralytic'].includes(a.id)) return 'A flame nozzle needs a liquid payload: napalm or a gland culture.';
  if (b.id === 'spore' && !['spores', 'venom', 'acid', 'paralytic', 'napalm'].includes(a.id)) return 'A spore launcher throws pods: give it spores, a gland culture or napalm.';
  if ((a.id === 'napalm' || a.id === 'spores') && (b.id === 'rifled' || b.id === 'rail')) return `${a.name} cannot be fired down a ${b.name.toLowerCase()}.`;
  if (b.id === 'flame' && f.id === 'cannon') return 'A cannon breech cannot feed a flame nozzle.';
  if (a.genes && genes && !a.genes.some(genes)) return `${a.name} needs an absorbed gene: ${a.genes.join(' or ').replace(/_/g, ' ')}.`;
  return null;
}
/** the numbers that emerge from the parts */
export function weaponStats(d: WeaponDesign): WStats {
  const f = PART[d.frame] ?? PART.rifle, ps = [PART[d.power], PART[d.barrel], PART[d.payload]].filter(Boolean) as Part[];
  const b = f.m;
  let dmg = b.dmg ?? 5, rate = b.rate ?? 1, range = b.range ?? 8, spread = b.spread ?? 0.04, heat = b.heat ?? 1, ammo = b.ammo ?? 1, weight = b.weight ?? 3, speed = b.speed ?? 28, splash = b.splash ?? 0;
  const fx: WFx = { ...(f.fx ?? {}) };
  let shot: ShotKind = f.shot ?? 'bullet', col = RAMPS.glowAmber[4];
  for (const p of ps) {
    const m = p.m;
    dmg *= m.dmg ?? 1; rate *= m.rate ?? 1; range *= m.range ?? 1; spread *= m.spread ?? 1; heat *= m.heat ?? 1; ammo *= m.ammo ?? 1; weight *= m.weight ?? 1; speed *= m.speed ?? 1;
    if (m.splash) splash = Math.max(splash, (splash || 1) * m.splash);
    for (const [k, v] of Object.entries(p.fx ?? {}) as [keyof WFx, number][]) fx[k] = (fx[k] ?? 0) + v;
    if (p.shot) shot = p.shot;
    if (p.col !== undefined) col = p.col;
  }
  // a cannon keeps its shell unless the emitter turns it into a beam, a flame or a pod
  if (f.id === 'cannon' && shot === 'bullet') shot = 'shell';
  if (shot === 'shell' && !splash) splash = 1.2;
  if (shot === 'cloud' && !splash) splash = 1.6;
  if (shot === 'beam') speed = 0;
  if (PART[d.power]?.id === 'gravity' && shot === 'beam') col = RAMPS.glowTeal[3];
  if (PART[d.power]?.id === 'atomic' && shot !== 'flame' && !PART[d.payload]?.col) col = RAMPS.glowTeal[4];
  const frags = fx.frag ?? 1;
  const dps = dmg * rate * Math.max(1, frags * 0.8) + (fx.burn ?? 0) * 1.2 + (fx.poison ?? 0) * 0.8;
  return { dmg, rate, range, spread, heat, ammo, weight, speed, splash, dps, shot, fx, col, mount: f.mount ?? 'hand' };
}
/** a RobotUnit / mount weapon from a design */
export function toWeapon(d: WeaponDesign): Weapon {
  const s = weaponStats(d);
  return { range: s.range, cd: 1 / Math.max(0.05, s.rate), dmg: s.dmg, shot: s.shot, speed: Math.max(6, s.speed), spread: s.spread, splash: s.splash || undefined, fx: s.fx, col: s.col, burst: s.shot === 'bullet' && s.rate > 2 ? 2 : undefined };
}
/** what it costs to build: the parts' bills added up */
export function weaponCost(d: WeaponDesign): Cost {
  const c: Cost = {};
  for (const id of [d.frame, d.power, d.barrel, d.payload]) for (const [k, v] of Object.entries(PART[id]?.cost ?? {})) c[k] = (c[k] ?? 0) + (v ?? 0);
  return c;
}
let NID = 1;
export function newDesign(o: Partial<WeaponDesign> = {}): WeaponDesign {
  return { id: 'w' + Date.now().toString(36) + (NID++), name: 'MARK ' + (NID + 1), frame: 'rifle', power: 'powder', barrel: 'rifled', payload: 'slugs', ...o };
}
/** a few starting drawings */
export const STOCK: WeaponDesign[] = [
  { id: 'stock-m1', name: 'CORPS RIFLE M1', frame: 'rifle', power: 'powder', barrel: 'rifled', payload: 'slugs' },
  { id: 'stock-t3', name: 'BURNER T-3', frame: 'armmount', power: 'steam', barrel: 'flame', payload: 'napalm' },
  { id: 'stock-r9', name: 'RAIL CARBINE R-9', frame: 'rifle', power: 'electric', barrel: 'rail', payload: 'darts' },
  { id: 'stock-g1', name: 'GRAVITON G-1', frame: 'turret', power: 'gravity', barrel: 'lens', payload: 'rocks' },
  { id: 'stock-c2', name: 'FIELD GUN C-2', frame: 'cannon', power: 'powder', barrel: 'rifled', payload: 'slugs' },
];
