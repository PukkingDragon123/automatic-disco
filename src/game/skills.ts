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
//
// Pacing (start: 0 of everything, 1 core cell, the head only). The head pulls in loose grit (ore and soil), so
// the four harvest tools cost only grit and no cells: the first minutes are gather -> tool -> gather more. The
// first core cell goes into the body (Core Housing). Per-resource costs stay <= 40 for nodes that need only the
// head and <= 120 until Storage Tanks; the late tiers and the capstones (Colossus Frame, Rock Storm, Field
// Refinery, Clone Bank) cost several hundred of each and most of the tree's ~70 core cells, a few hours of play
// carried across regions.
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
  S('head', 'chassis', 'Survey Head', 'A rock skull with a brass survey lens. It hovers, looks, and pulls loose grit (ore and soil) into itself. Everything else is built from here.', {}, 0, []),
  S('torso', 'chassis', 'Core Housing', 'A boulder chest with a riveted plate and a porthole onto the reactor. The body everything bolts to. Doubles storage.', { ore: 20, soil: 30 }, 1, ['head']),
  S('armR', 'chassis', 'Right Arm', 'Stones on hydraulic pistons. Punch, grab and carry.', { ore: 35, soil: 20 }, 1, ['torso']),
  S('armL', 'chassis', 'Left Arm', 'A second arm: two-handed lifts, boulders, and faster work.', { ore: 60, soil: 40 }, 1, ['armR']),
  S('coil', 'chassis', 'Gravity Coil', 'A copper coil under the chest that rides the field: faster, steadier flight.', { ore: 50, water: 40 }, 1, ['torso']),
  S('reactor', 'chassis', 'Reactor Bloom', 'The core burns hotter behind its porthole: more charge, faster recharge.', { water: 110, carbon: 110 }, 2, ['coil']),
  S('plating1', 'chassis', 'Plate Steel I', 'Riveted Corps plate over the rock: more hull.', { ore: 70, soil: 20 }, 1, ['torso']),
  S('plating2', 'chassis', 'Plate Steel II', 'Heavier, overlapped plates: much more hull.', { ore: 160, carbon: 60 }, 2, ['plating1']),
  S('plating3', 'chassis', 'Plate Steel III', 'Hardened armour with hazard-striped edges: blows that land do half the damage.', { ore: 320, carbon: 140, soil: 80 }, 3, ['plating2']),
  S('colossus', 'chassis', 'Colossus Frame', 'Unit 07 grows to its full design height. Twice the hull, twice the lifting strength, and the ground shakes where it lands.', { ore: 600, soil: 450, water: 300, carbon: 300 }, 5, ['armL', 'reactor', 'plating3']),
  // HARVEST: how it gathers
  S('drill', 'harvest', 'Ore Drill', 'A bit on the lens mount: bore into seams and boulders for ore.', { soil: 10 }, 0, ['head']),
  S('excavate', 'harvest', 'Excavator', 'Scoop soil from the ground (leaves a pit).', { ore: 10 }, 0, ['head']),
  S('siphon', 'harvest', 'Water Siphon', 'A hose and a hand pump: drink rivers and pools.', { ore: 8, soil: 6 }, 0, ['head']),
  S('intake', 'harvest', 'Carbon Intake', 'A furnace mouth that draws carbon out of dead plants and corpses.', { soil: 8, ore: 6 }, 0, ['head']),
  S('magnet', 'harvest', 'Lodestone Field', 'Loose pickups fly to you from much further away.', { ore: 45, soil: 15 }, 1, ['drill']),
  S('tanks', 'harvest', 'Storage Tanks', 'Riveted tanks on the back: carry much more of everything.', { ore: 80, water: 40, soil: 30 }, 1, ['torso']),
  S('bore', 'harvest', 'Deep Bore', 'Tungsten bits and a bigger scoop: drilling and digging go three times as fast and reach buried seams.', { ore: 140, soil: 90, carbon: 30 }, 2, ['drill', 'excavate']),
  S('refinery', 'harvest', 'Field Refinery', 'A crucible in the chest smelts everything you pick up: +50% from all gathering.', { ore: 260, water: 160, carbon: 160 }, 3, ['tanks', 'bore']),
  // GRAVITY: field powers (the ability wheel shows only owned ones)
  S('lift', 'gravity', 'Telekinesis', 'Lift a rock or a creature with the field and carry it.', { water: 20, ore: 15 }, 1, ['head']),
  S('slam', 'gravity', 'Gravity Slam', 'Crush the air over a point: everything there is slammed down.', { ore: 70, water: 50 }, 1, ['lift']),
  S('repulse', 'gravity', 'Repulse', 'Gravity inside out: everything nearby is flung away.', { ore: 70, water: 50 }, 1, ['lift']),
  S('shape', 'gravity', 'Earthshape', 'Raise or sink the ground: walls, ramps, pits.', { soil: 80, water: 40 }, 1, ['lift']),
  S('well', 'gravity', 'Gravity Well', 'A point that drags everything in and grinds it.', { ore: 150, water: 130, carbon: 30 }, 2, ['slam']),
  S('storm', 'gravity', 'Rock Storm', 'Every loose stone around rises and rains down on a point.', { ore: 300, water: 220, carbon: 100 }, 3, ['well', 'boulder']),
  S('amp', 'gravity', 'Field Amplifier', 'A tube-driven booster on the reactor: every field power reaches 50% further and costs a quarter less charge.', { water: 260, carbon: 180, ore: 120 }, 3, ['well', 'reactor']),
  // COMBAT: real-time fighting
  S('punch', 'combat', 'Piston Punch', 'Hit things. Hard.', { ore: 10 }, 0, ['armR']),
  S('rock', 'combat', 'Rock Throw', 'Pick up a stone and throw it.', { ore: 20 }, 1, ['armR']),
  S('shrapnel', 'combat', 'Shrapnel', 'Thrown stones burst on impact.', { ore: 100, carbon: 30 }, 1, ['rock']),
  S('boulder', 'combat', 'Boulder Heave', 'Two hands: lift and hurl boulders.', { ore: 80, soil: 50 }, 1, ['rock', 'armL']),
  S('frenzy', 'combat', 'Piston Frenzy', 'Both pistons at once: a flurry of punches.', { ore: 90, carbon: 50 }, 2, ['punch', 'armL']),
  S('plow', 'combat', 'Ground Plow', 'Fly through creatures low and fast and knock them flying.', { ore: 120, water: 60 }, 2, ['coil', 'punch']),
  S('servo', 'combat', 'Servo Pistons', 'Regulated high-pressure hydraulics: every punch and throw hits 50% harder.', { ore: 240, carbon: 120, water: 60 }, 3, ['frenzy', 'plating2']),
  // FABRICATION: territory, prefabs, allies
  S('graft', 'fabrication', 'Plant Graft', 'Modify a plant into Veyr growth. Grafted plants claim the ground around them.', { carbon: 20 }, 1, ['intake']),
  S('sow', 'fabrication', 'Seed Press', 'Absorb a plant to save it as a prefab, then plant copies.', { carbon: 40, water: 25 }, 1, ['graft']),
  S('grove', 'fabrication', 'Grove Engine', 'Grafted plants spread by themselves, slowly.', { carbon: 140, water: 140, soil: 90 }, 2, ['sow']),
  S('convert', 'fabrication', 'Neural Graft', 'Rewire a beaten creature to fight for you. Converted creatures claim ground as they roam.', { carbon: 80, ore: 40 }, 2, ['graft', 'punch']),
  S('command', 'fabrication', 'Pack Relay', 'A radio relay in the skull: converted creatures answer orders, rally to you and fight harder near you.', { carbon: 180, water: 80, ore: 80 }, 2, ['convert']),
  S('print', 'fabrication', 'Flesh Printer', 'Print living copies of creature prefabs.', { carbon: 170, water: 110 }, 3, ['convert', 'lab']),
  // LAB: the gene lab
  S('lab', 'lab', 'Field Laboratory', 'A gene lab: put an absorbed species in the tank and rebuild it limb by limb.', { ore: 40, carbon: 40, water: 40 }, 1, ['intake']),
  S('splice', 'lab', 'Gene Splicer', 'Mix parts from different species in one design.', { carbon: 80, water: 60 }, 1, ['lab']),
  S('sequencer', 'lab', 'Deep Sequencer', 'Reel-to-reel gene tape: more gene slots per design.', { carbon: 140, water: 100 }, 2, ['splice']),
  S('vat', 'lab', 'Growth Vat', 'Designs come out bigger and tougher.', { carbon: 240, water: 240 }, 3, ['sequencer']),
  S('cloner', 'lab', 'Clone Bank', 'Twin tanks on one line: printed and grown creatures come out in pairs.', { carbon: 320, water: 260, ore: 120 }, 3, ['vat', 'print']),
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
