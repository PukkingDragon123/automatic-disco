// SHARED CONTRACT (several systems build against this file: keep ids, types and method names stable).
//
// Unit 07 starts as a dumb head: a floating rock skull with a lens and nothing else. Everything else, its own
// body included, is bought on the skill tree with the four raw materials it gathers (ore, carbon, water, soil)
// plus core cells (skill points) earned by advancing. The skill tree screen (ui/skillTree.ts) renders SKILLS;
// gameplay asks `skills.has(id)` before allowing an action, a body part or a power.
//
// Game events (emitted with game.emit(name, data); listened to with game.on(name, fn)) that systems rely on:
//   'gather'  { res: Res, amt: number, x, y, z }      a resource was collected
//   'skill'   { id: string }                           a skill was bought
//   'points'  { n: number, why: string }               core cells granted
//   'graft'   { x, z, kind: string }                   a plant was modified (claims territory)
//   'convert' { species: string }                      a creature was converted to the Veyr's side
//   'absorb'  { species: string, genes: string[] }     a creature's whole genome was absorbed
//   'prefab'  { kind: 'plant' | 'creature', name }     a plant or creature was saved as a prefab
//   'kill'    { species: string, by: 'punch' | 'rock' | 'ability' | 'ally' }
//   'throw'   { x, z }                                  the golem threw something
//   'hurt'    { amt: number }                           the golem took damage
//   'territory' { frac: number }                        territory fraction changed (0..1)
export type Res = 'ore' | 'carbon' | 'water' | 'soil';
export const RES: Res[] = ['ore', 'carbon', 'water', 'soil'];
export type Branch = 'chassis' | 'gravity' | 'harvest' | 'fabrication' | 'lab' | 'combat';
export const BRANCHES: Branch[] = ['chassis', 'harvest', 'gravity', 'combat', 'fabrication', 'lab'];

export interface SkillDef {
  id: string; branch: Branch; name: string; desc: string;
  /** resources and core cells it costs */
  cost: Partial<Record<Res, number>>; pts: number;
  /** skills that must be owned first */
  req: string[];
}
const S = (id: string, branch: Branch, name: string, desc: string, cost: Partial<Record<Res, number>>, pts: number, req: string[]): SkillDef => ({ id, branch, name, desc, cost, pts, req });

/** every node. The skill tree UI owns layout, art and copy polish; these ids are relied on by gameplay. */
export const SKILLS: SkillDef[] = [
  // CHASSIS: build the body, part by part (the golem model shows exactly what is owned)
  S('head', 'chassis', 'Survey Head', 'A rock skull with a lens. It can hover, look and pull in loose grit.', {}, 0, []),
  S('torso', 'chassis', 'Core Housing', 'A boulder chest with a riveted plate and a porthole onto the reactor. Doubles storage.', { ore: 20, soil: 30 }, 1, ['head']),
  S('armR', 'chassis', 'Right Arm', 'Stones on pistons. Punch, grab, carry.', { ore: 25, soil: 15 }, 1, ['torso']),
  S('armL', 'chassis', 'Left Arm', 'A second arm: two-handed lifts and faster work.', { ore: 25, soil: 15 }, 1, ['armR']),
  S('coil', 'chassis', 'Gravity Coil', 'A copper coil under the chest: faster, steadier flight.', { ore: 30, water: 20 }, 1, ['torso']),
  S('plating1', 'chassis', 'Plate Steel I', 'Riveted plates: more hull.', { ore: 40 }, 1, ['torso']),
  S('plating2', 'chassis', 'Plate Steel II', 'Heavier plates: much more hull.', { ore: 80, carbon: 20 }, 1, ['plating1']),
  S('reactor', 'chassis', 'Reactor Bloom', 'The core burns hotter: more charge, faster recharge.', { water: 40, carbon: 40 }, 2, ['coil']),
  // HARVEST: how it gathers
  S('drill', 'harvest', 'Ore Drill', 'Bore into seams and boulders for ore.', { soil: 10 }, 1, ['head']),
  S('intake', 'harvest', 'Carbon Intake', 'Draw carbon out of dead plants and corpses.', { soil: 10 }, 1, ['head']),
  S('siphon', 'harvest', 'Water Siphon', 'Drink rivers and pools.', { ore: 10 }, 1, ['head']),
  S('excavate', 'harvest', 'Excavator', 'Scoop soil from the ground (leaves a pit).', { ore: 10 }, 1, ['head']),
  S('magnet', 'harvest', 'Lodestone Field', 'Loose pickups fly to you from further away.', { ore: 30 }, 1, ['drill']),
  S('tanks', 'harvest', 'Storage Tanks', 'Carry much more of everything.', { ore: 50, water: 20 }, 1, ['torso']),
  // GRAVITY: field powers (the ability wheel shows only owned ones)
  S('lift', 'gravity', 'Telekinesis', 'Lift a rock or a creature with the field.', { water: 15, ore: 15 }, 1, ['head']),
  S('slam', 'gravity', 'Gravity Slam', 'Crush the air over a point; everything there is slammed down.', { ore: 40, water: 30 }, 1, ['lift']),
  S('repulse', 'gravity', 'Repulse', 'Gravity inside out: everything nearby is flung away.', { ore: 40, water: 30 }, 1, ['lift']),
  S('well', 'gravity', 'Gravity Well', 'A point that drags everything in and grinds it.', { ore: 60, water: 50 }, 2, ['slam']),
  S('shape', 'gravity', 'Earthshape', 'Raise or sink the ground.', { soil: 40, water: 20 }, 1, ['lift']),
  S('storm', 'gravity', 'Rock Storm', 'Every loose stone around rises and rains down on a point.', { ore: 90, water: 60, carbon: 30 }, 3, ['well', 'boulder']),
  // COMBAT: real-time fighting
  S('punch', 'combat', 'Piston Punch', 'Hit things. Hard.', { ore: 10 }, 0, ['armR']),
  S('rock', 'combat', 'Rock Throw', 'Pick up a stone and throw it.', { ore: 10 }, 1, ['armR']),
  S('boulder', 'combat', 'Boulder Heave', 'Two hands: lift and hurl boulders.', { ore: 40, soil: 20 }, 1, ['rock', 'armL']),
  S('shrapnel', 'combat', 'Shrapnel', 'Thrown stones burst on impact.', { ore: 50 }, 1, ['rock']),
  S('frenzy', 'combat', 'Piston Frenzy', 'A flurry of punches.', { ore: 40, carbon: 20 }, 1, ['punch', 'armL']),
  S('plow', 'combat', 'Ground Plow', 'Fly through creatures and knock them flying.', { ore: 60, water: 20 }, 2, ['coil', 'punch']),
  // FABRICATION: territory, prefabs, allies
  S('graft', 'fabrication', 'Plant Graft', 'Modify a plant into Veyr growth. Grafted plants claim the ground around them.', { carbon: 15 }, 1, ['intake']),
  S('sow', 'fabrication', 'Seed Press', 'Absorb a plant to save it as a prefab, then plant copies.', { carbon: 25, water: 15 }, 1, ['graft']),
  S('convert', 'fabrication', 'Neural Graft', 'Rewire a beaten creature to fight for you. Converted creatures claim ground as they roam.', { carbon: 40, ore: 20 }, 2, ['graft', 'punch']),
  S('print', 'fabrication', 'Flesh Printer', 'Print living copies of creature prefabs.', { carbon: 60, water: 40 }, 2, ['convert', 'lab']),
  S('grove', 'fabrication', 'Grove Engine', 'Grafted plants spread by themselves, slowly.', { carbon: 60, water: 60, soil: 40 }, 2, ['sow']),
  // LAB: the gene lab
  S('lab', 'lab', 'Field Laboratory', 'A gene lab: put an absorbed species in the tank and rebuild it limb by limb.', { ore: 30, carbon: 30, water: 30 }, 1, ['intake']),
  S('splice', 'lab', 'Gene Splicer', 'Mix parts from different species in one design.', { carbon: 40, water: 30 }, 1, ['lab']),
  S('sequencer', 'lab', 'Deep Sequencer', 'More gene slots per design.', { carbon: 60, water: 40 }, 2, ['splice']),
  S('vat', 'lab', 'Growth Vat', 'Designs come out bigger and tougher.', { carbon: 80, water: 80 }, 2, ['sequencer']),
];
export const SKILL: Record<string, SkillDef> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

export class Skills {
  owned = new Set<string>(['head']);
  /** core cells to spend */
  points = 1;
  onChange?: (id: string) => void;
  onPoints?: (n: number, why: string) => void;
  has(id: string) { return this.owned.has(id); }
  /** why it can't be bought (null if it can) */
  why(id: string, res: Record<Res, number>): string | null {
    const s = SKILL[id];
    if (!s) return 'Unknown';
    if (this.owned.has(id)) return 'Owned';
    const miss = s.req.filter((r) => !this.owned.has(r));
    if (miss.length) return 'Needs ' + miss.map((r) => SKILL[r]?.name ?? r).join(', ');
    if (this.points < s.pts) return `Needs ${s.pts} core cell${s.pts > 1 ? 's' : ''}`;
    for (const k in s.cost) if ((res[k as Res] ?? 0) < (s.cost[k as Res] ?? 0)) return `Needs ${s.cost[k as Res]} ${k}`;
    return null;
  }
  buy(id: string, res: Record<Res, number>): boolean {
    if (this.why(id, res)) return false;
    const s = SKILL[id];
    for (const k in s.cost) res[k as Res] -= s.cost[k as Res] ?? 0;
    this.points -= s.pts; this.owned.add(id); this.onChange?.(id);
    return true;
  }
  grant(n: number, why: string) { this.points += n; this.onPoints?.(n, why); }
  toJSON() { return { owned: [...this.owned], points: this.points }; }
  load(d: { owned?: string[]; points?: number } | null | undefined) { if (!d) return; this.owned = new Set(['head', ...(d.owned ?? [])]); this.points = d.points ?? this.points; }
}
