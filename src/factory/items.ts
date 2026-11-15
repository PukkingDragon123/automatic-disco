// Real items. Nothing here is a currency: every item is a physical thing with a size on the grid (cells), a stack
// limit per cell, a mass, the containers that will take it (tags) and, for living or wet things, a shelf life
// (fruit rots unless frozen, specimens spoil outside a freezer or a specimen cabinet, sap sets to resin out of a tank,
// seeds lose their viability outside a vault). Groups: bio (wood, bark, leaves, fibre, fruit, biomass, flesh),
// seeds (by plant family), specimens (samples, eggs), earth (dirt, topsoil, clay, sand, gravel, rocks by family),
// minerals and ores (the geology's seams, crystals), fluids, refined goods and parts.
// The old four raw materials stay as ids: `ore` is Ferrite Ore, `soil` is Dirt, `water` is Water and `carbon` is
// Biomass, and every item carries the old material CLASS it pays (`mat`): a build cost in carbon is paid by any
// carbon-class item (wood, leaves, bark, fibre...), one in soil by any earth (dirt, topsoil, clay, sand, gravel...).
// Each item has a hand-drawn icon in the master palette (ui/icons.ts hiItem; the new set lives in inv/itemArt.ts).
import * as THREE from 'three';
import { Pix, KPix, poly, selout, RA, INKC, type Pt } from './paint';
import type { Res } from '../game/skills';
import { itemIcon as hiItemURL, hiItem, hasItemArt } from '../ui/icons';
import { installItemArt } from '../inv/itemArt';
import { SPRITES, SPRITE_PAL, SPRITE_SIZE } from '../inv/itemSprites';

export type BaseItemId =
  | 'ore' | 'carbon' | 'water' | 'soil' | 'copper_ore' | 'coal' | 'crystal' | 'fruit'
  | 'iron_ingot' | 'copper_ingot' | 'steel_ingot' | 'glass' | 'concrete' | 'rubber' | 'plastic'
  | 'iron_plate' | 'iron_rod' | 'screw' | 'copper_wire' | 'cable' | 'steel_beam' | 'gear'
  | 'reinforced_plate' | 'rotor' | 'frame' | 'circuit' | 'vacuum_tube' | 'motor' | 'ammo'
  | 'servo' | 'control_unit' | 'heavy_frame' | 'reactor_core' | 'report' | 'tape' | 'steam'
  | 'iron_pellet' | 'silk' | 'resin' | 'bio_oil' | 'glass_bead' | 'protein' | 'algae_fuel' | 'dung' | 'herbicide'
  // the real-item catalogue (v6)
  | 'wood' | 'bark' | 'leaves' | 'fibre' | 'berries' | 'tuber' | 'kelp' | 'mushroom' | 'meat' | 'hide' | 'bone'
  | 'seed_grass' | 'seed_reed' | 'spore_fern' | 'seed_shrub' | 'seed_tree' | 'seed_cone' | 'seed_palm' | 'spore_fungus'
  | 'seed_bulb' | 'seed_cactus' | 'seed_crystal' | 'seed_flower' | 'seed_trap'
  | 'tissue' | 'blood_sample' | 'egg' | 'embryo' | 'plant_cutting' | 'venom_gland'
  | 'topsoil' | 'clay' | 'sand' | 'gravel' | 'peat' | 'compost' | 'ash'
  | 'rock_granite' | 'rock_basalt' | 'rock_limestone' | 'rock_sandstone' | 'rock_slate' | 'rock_obsidian'
  | 'malachite' | 'amethyst' | 'ruby' | 'salt' | 'saltpetre'
  | 'brine' | 'sap'
  | 'plank' | 'charcoal' | 'brick' | 'feed' | 'crushed_ore';
/** item ids: the base set plus anything registered later (registerItem: the biotech producers add their own) */
export type ItemId = BaseItemId | (string & {});
export type ItemCat = 'raw' | 'bio' | 'refined' | 'part' | 'assembly' | 'advanced' | 'research' | 'internal';
/** the inventory's categories (filter chips, sort by type) */
export type ItemGroup = 'bio' | 'seed' | 'specimen' | 'earth' | 'mineral' | 'fluid' | 'refined' | 'part';
export const ITEM_GROUPS: { k: ItemGroup; name: string }[] = [
  { k: 'bio', name: 'Bio' }, { k: 'seed', name: 'Seeds' }, { k: 'specimen', name: 'Specimens' }, { k: 'earth', name: 'Earth' },
  { k: 'mineral', name: 'Minerals' }, { k: 'fluid', name: 'Fluids' }, { k: 'refined', name: 'Refined' }, { k: 'part', name: 'Parts' },
];
/** what a container must offer to take an item (a container takes an item when they share a tag) */
export type ItemTag = 'solid' | 'bulk' | 'ore' | 'fluid' | 'cold' | 'specimen' | 'seed' | 'grain' | 'food';
export interface Perish {
  /** in-game days from fresh to spoiled outside safe storage */
  days: number;
  /** what it turns into when spoiled (gone if unset) */
  into?: ItemId;
  /** container kinds where it keeps (no decay; a freezer only while powered) */
  safe: string[];
}
export interface ItemDef {
  id: ItemId; name: string; cat: ItemCat; desc: string;
  /** colour of the crate sides on a belt */
  side: number;
  /** burn value in a boiler (seconds of steam), food value for a worker */
  fuel?: number; food?: number;
  /** maps to one of the golem's raw materials (run.res) */
  res?: Res;
  // ---- the real-item fields (filled for every item by complete(); optional so other systems can register freely)
  group?: ItemGroup;
  /** footprint on a container grid, cells [w, h] */
  size?: [number, number];
  /** how many share one footprint */
  stack?: number;
  /** kg each */
  mass?: number;
  /** trade value (sort by value, quotas) */
  value?: number;
  tags?: ItemTag[];
  perish?: Perish;
  /** the old material class this item pays */
  mat?: Res;
}
const I = (id: ItemId, name: string, cat: ItemCat, side: number, desc: string, x: Partial<ItemDef> = {}): ItemDef => ({ id, name, cat, side, desc, ...x });
const FRZ = ['st_freezer'], SPEC = ['st_freezer', 'st_cabinet'], SEEDS = ['st_vault', 'st_freezer', 'silo'];
export const ITEMS: Record<ItemId, ItemDef> = {
  ore: I('ore', 'Ferrite Ore', 'raw', RA.rust[2], 'Rust-red iron ore from the ferrite seams. Smelts to iron.', { res: 'ore', mat: 'ore', group: 'mineral', tags: ['ore', 'solid'], stack: 25, mass: 4, value: 2 }),
  carbon: I('carbon', 'Biomass', 'raw', RA.ochre[2], 'Chopped stalk, husk and pulp, baled tight. Burns in a boiler, feeds workers in a pinch, refines to rubber.', { res: 'carbon', mat: 'carbon', fuel: 4, food: 0.5, group: 'bio', tags: ['solid', 'bulk', 'grain'], stack: 30, mass: 2, value: 1 }),
  water: I('water', 'Water', 'raw', RA.water[4], 'Clean water, drawn and sealed. Kept in a tank (the pod carries a few cans).', { res: 'water', mat: 'water', group: 'fluid', tags: ['fluid'], stack: 25, mass: 1, value: 1 }),
  soil: I('soil', 'Dirt', 'raw', RA.soil[3], 'Plain excavated earth. Wants a pit or a bin: concrete, bricks, glass and the grow sheds.', { res: 'soil', mat: 'soil', group: 'earth', tags: ['bulk'], stack: 50, mass: 3, value: 0.5 }),
  copper_ore: I('copper_ore', 'Copper Ore', 'raw', RA.teal[3], 'Green-veined rock from the copper seams.', { group: 'mineral', tags: ['ore', 'solid'], stack: 25, mass: 4, value: 3 }),
  coal: I('coal', 'Coal', 'raw', RA.basalt[1], 'Black seam coal: boilers, steel and plastic.', { fuel: 8, group: 'mineral', tags: ['ore', 'solid', 'bulk'], stack: 30, mass: 2, value: 2 }),
  crystal: I('crystal', 'Quartz Crystal', 'raw', RA.sky[3], 'Clear quartz from the crystal seams: oscillators and reactor cores.', { group: 'mineral', tags: ['ore', 'solid'], stack: 12, mass: 1, value: 8 }),
  fruit: I('fruit', 'Fruit', 'raw', RA.coral[3], 'Ripe fruit from the plants and the grow sheds. What the workers like to eat. Rots in three days unless frozen.', { food: 1.5, group: 'bio', tags: ['food', 'cold', 'solid'], stack: 20, mass: 0.3, value: 2, perish: { days: 3, into: 'compost', safe: FRZ } }),
  iron_ingot: I('iron_ingot', 'Iron Ingot', 'refined', RA.steel[3], 'Cast iron, still warm.', { stack: 30, mass: 5, value: 5 }),
  copper_ingot: I('copper_ingot', 'Copper Ingot', 'refined', RA.rust[4], 'Soft red copper.', { stack: 30, mass: 5, value: 6 }),
  steel_ingot: I('steel_ingot', 'Steel Ingot', 'refined', RA.slate[3], 'Iron and coal in the foundry: hard steel.', { stack: 30, mass: 5, value: 10 }),
  glass: I('glass', 'Glass', 'refined', RA.water[5], 'Soil silica melted clear.', { stack: 20, mass: 2, value: 4 }),
  concrete: I('concrete', 'Concrete', 'refined', RA.stone[5], 'Soil, burned and set.', { stack: 20, mass: 10, value: 3 }),
  rubber: I('rubber', 'Rubber', 'refined', RA.basalt[2], 'Plant carbon and water in the refinery.', { stack: 30, mass: 1, value: 4 }),
  plastic: I('plastic', 'Bakelite', 'refined', RA.clay[2], 'Phenolic plastic: coal and water, cooked.', { stack: 30, mass: 1, value: 5 }),
  iron_plate: I('iron_plate', 'Iron Plate', 'part', RA.steel[4], 'Rolled plate, punched for rivets.', { stack: 40, mass: 3, value: 6 }),
  iron_rod: I('iron_rod', 'Iron Rod', 'part', RA.steel[3], 'Drawn rod stock.', { stack: 40, mass: 2, value: 5 }),
  screw: I('screw', 'Screws', 'part', RA.steel[5], 'A box of machine screws.', { stack: 200, mass: 0.02, value: 0.5 }),
  copper_wire: I('copper_wire', 'Copper Wire', 'part', RA.rust[4], 'Drawn wire on a wooden spool.', { stack: 50, mass: 0.5, value: 3 }),
  cable: I('cable', 'Cable', 'part', RA.basalt[2], 'Rubber-sheathed wire. Power lines.', { stack: 40, mass: 1, value: 8 }),
  steel_beam: I('steel_beam', 'Steel Beam', 'part', RA.slate[4], 'An I-beam.', { size: [1, 2], stack: 10, mass: 40, value: 30 }),
  gear: I('gear', 'Gear', 'part', RA.steel[4], 'A cut spur gear.', { stack: 40, mass: 1, value: 6 }),
  reinforced_plate: I('reinforced_plate', 'Reinforced Plate', 'assembly', RA.olive[4], 'Plate strapped and screwed double.', { size: [2, 1], stack: 10, mass: 12, value: 40 }),
  rotor: I('rotor', 'Rotor', 'assembly', RA.rust[3], 'Rod, laminations and screws.', { size: [2, 1], stack: 10, mass: 8, value: 45 }),
  frame: I('frame', 'Modular Frame', 'assembly', RA.steel[4], 'A welded truss: the skeleton of every machine.', { size: [2, 2], stack: 5, mass: 30, value: 90 }),
  circuit: I('circuit', 'Circuit Board', 'assembly', RA.clay[3], 'Printed copper on Bakelite. Very modern.', { stack: 20, mass: 0.4, value: 60 }),
  vacuum_tube: I('vacuum_tube', 'Vacuum Tube', 'assembly', RA.glowAmber[1], 'A glass valve with a hot filament.', { stack: 20, mass: 0.2, value: 25 }),
  motor: I('motor', 'Motor', 'assembly', RA.olive[3], 'An enamelled electric motor.', { size: [2, 1], stack: 4, mass: 25, value: 120 }),
  ammo: I('ammo', 'Ammunition', 'assembly', RA.brass[3], 'Brass cartridges for the turrets.', { stack: 100, mass: 0.1, value: 2 }),
  servo: I('servo', 'Servo', 'advanced', RA.olive[4], 'Motor, gears and a feedback circuit: a robot joint.', { stack: 8, mass: 6, value: 200 }),
  control_unit: I('control_unit', 'Control Unit', 'advanced', RA.olive[3], 'An analog computer in a box: a robot brain.', { size: [2, 1], stack: 4, mass: 8, value: 350 }),
  heavy_frame: I('heavy_frame', 'Heavy Frame', 'advanced', RA.slate[3], 'Beams, frames and concrete ballast.', { size: [2, 2], stack: 2, mass: 220, value: 500 }),
  reactor_core: I('reactor_core', 'Reactor Core', 'advanced', RA.glowTeal[1], 'A quartz-moderated fuel assembly. Handle with tongs.', { fuel: 300, size: [1, 2], stack: 1, mass: 60, value: 900 }),
  report: I('report', 'Survey Report', 'research', RA.paper[4], 'Plates, wire and measurements, typed up. The research lab reads them.', { stack: 20, mass: 0.2, value: 30 }),
  tape: I('tape', 'Data Tape', 'research', RA.ink[2], 'A reel of recorded analysis. Worth a lot to the lab.', { stack: 10, mass: 0.5, value: 80 }),
  steam: I('steam', 'Steam', 'internal', RA.snow[4], 'Pressure from the boiler.', { group: 'fluid', tags: [], stack: 1, mass: 0, value: 0 }),
  // the living route: what engineered creatures and plants produce, and what the pens and sheds give
  iron_pellet: I('iron_pellet', 'Iron Pellets', 'bio', RA.rust[3], 'Rock eaten by ore-gizzard grazers and passed as clean iron pellets. Smelts faster than ore.', { group: 'mineral', tags: ['ore', 'solid', 'grain'], stack: 40, mass: 1, value: 3 }),
  silk: I('silk', 'Silk', 'bio', RA.straw[4], 'Spun from engineered glands. Insulation, rope, cable.', { stack: 30, mass: 0.2, value: 6 }),
  resin: I('resin', 'Resin', 'bio', RA.ochre[4], 'Hard amber resin, set from tapped sap. Refines to Bakelite and rubber.', { stack: 30, mass: 0.5, value: 3 }),
  bio_oil: I('bio_oil', 'Bio-Oil', 'bio', RA.ichor[3], 'Pressed from oil fruit and seed. Burns in a boiler; refines to plastic. Kept in a tank.', { fuel: 6, group: 'fluid', tags: ['fluid'], stack: 40, mass: 0.9, value: 4 }),
  glass_bead: I('glass_bead', 'Glass Beads', 'bio', RA.water[5], 'Silica beads grown by crystal corals. Melts to glass.', { group: 'mineral', tags: ['solid', 'grain'], stack: 60, mass: 0.1, value: 2 }),
  protein: I('protein', 'Protein', 'bio', RA.flesh[4], 'Milk and meal from the herds. Good food for workers. Spoils in three days unless frozen.', { food: 2.5, tags: ['food', 'cold', 'solid'], stack: 20, mass: 1, value: 4, perish: { days: 3, into: 'compost', safe: FRZ } }),
  algae_fuel: I('algae_fuel', 'Algae Fuel', 'bio', RA.ichor[2], 'Skimmed from biofuel ponds. A clean boiler fuel. Kept in a tank.', { fuel: 10, group: 'fluid', tags: ['fluid'], stack: 40, mass: 0.9, value: 5 }),
  dung: I('dung', 'Dung', 'bio', RA.soil[2], 'From the pens and the herds. The fertiliser spreader wants it.', { tags: ['bulk'], stack: 40, mass: 1, value: 0.5 }),
  herbicide: I('herbicide', 'Herbicide', 'refined', RA.ichor[4], 'A defoliant in drums: the sprayer kills plants and sickens creatures with it.', { stack: 10, mass: 20, value: 12 }),

  // ---------------------------------------------------------------- bio: what plants and creatures give
  wood: I('wood', 'Log Wood', 'bio', RA.fur[3], 'Split trunk wood with the bark on. Planks, charcoal, frames; burns long.', { mat: 'carbon', fuel: 10, size: [1, 2], stack: 8, mass: 12, value: 3, tags: ['solid'] }),
  bark: I('bark', 'Bark', 'bio', RA.fur[2], 'Stripped bark slabs: tannin, roof shingle, a slow fuel.', { mat: 'carbon', fuel: 4, stack: 30, mass: 0.8, value: 1, tags: ['solid', 'bulk'] }),
  leaves: I('leaves', 'Leaves', 'bio', RA.moss[3], 'Cut foliage. Compost, feed, mulch for the fields.', { mat: 'carbon', food: 0.3, stack: 40, mass: 0.2, value: 0.5, tags: ['solid', 'bulk'] }),
  fibre: I('fibre', 'Plant Fibre', 'bio', RA.straw[3], 'Stem and leaf fibre, retted and combed: rope, sacking, insulation.', { mat: 'carbon', stack: 40, mass: 0.3, value: 1.5, tags: ['solid'] }),
  berries: I('berries', 'Berries', 'bio', RA.plum[3], 'A punnet of shrub berries. Sweet; spoils in two days unless frozen.', { food: 1, stack: 20, mass: 0.2, value: 2, tags: ['food', 'cold', 'solid'], perish: { days: 2, into: 'compost', safe: FRZ } }),
  tuber: I('tuber', 'Tubers', 'bio', RA.clay[3], 'Starchy roots dug from bulb plants. Keeps a week; workers eat them.', { food: 2, stack: 16, mass: 0.6, value: 2, tags: ['food', 'cold', 'solid'], perish: { days: 8, into: 'compost', safe: FRZ } }),
  kelp: I('kelp', 'Kelp', 'bio', RA.teal[2], 'Long fronds cut from the reef. Dries to biomass in four days.', { mat: 'carbon', food: 0.6, size: [1, 2], stack: 20, mass: 0.6, value: 1.5, tags: ['solid', 'cold', 'food'], perish: { days: 4, into: 'carbon', safe: FRZ } }),
  mushroom: I('mushroom', 'Mushrooms', 'bio', RA.hide[4], 'Fungus caps from the damp ground. Food or culture stock; spoils in three days.', { food: 1, stack: 20, mass: 0.2, value: 2.5, tags: ['food', 'cold', 'solid'], perish: { days: 3, into: 'compost', safe: FRZ } }),
  meat: I('meat', 'Raw Meat', 'bio', RA.flesh[3], 'Butchered from a carcass. Rich worker food; rots in a day and a half without a freezer.', { food: 4, size: [2, 1], stack: 6, mass: 3, value: 5, tags: ['food', 'cold', 'solid'], perish: { days: 1.5, into: 'compost', safe: FRZ } }),
  hide: I('hide', 'Hide', 'bio', RA.hide[3], 'A scraped creature hide: leather straps, gaskets, harness.', { size: [2, 2], stack: 4, mass: 4, value: 8, tags: ['solid'] }),
  bone: I('bone', 'Bone', 'bio', RA.bone[4], 'Clean bone: meal, glue, carved fittings, phosphate for the soil.', { size: [1, 2], stack: 10, mass: 1, value: 2, tags: ['solid'] }),

  // ---------------------------------------------------------------- seeds by plant family
  seed_grass: I('seed_grass', 'Grass Seed', 'bio', RA.straw[4], 'Threshed seed heads of the tussock grasses. Sow for pasture and fibre.', { group: 'seed', stack: 60, mass: 0.02, value: 2, tags: ['seed', 'grain', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  seed_reed: I('seed_reed', 'Reed Seed', 'bio', RA.sand[3], 'Fluffy reed and lily seed. Sow at the water\'s edge.', { group: 'seed', stack: 60, mass: 0.02, value: 2, tags: ['seed', 'grain', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  spore_fern: I('spore_fern', 'Fern Spores', 'bio', RA.sage[3], 'Spore dust tapped from fern fronds into a paper twist.', { group: 'seed', stack: 80, mass: 0.01, value: 2.5, tags: ['seed', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  seed_shrub: I('seed_shrub', 'Shrub Pips', 'bio', RA.plum[2], 'Hard pips from shrub berries. Sow for hedges and berry bushes.', { group: 'seed', stack: 60, mass: 0.02, value: 2.5, tags: ['seed', 'grain', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  seed_tree: I('seed_tree', 'Tree Nuts', 'bio', RA.fur[4], 'Winged nuts from the broadleaf trees. Sow a wood lot: timber in a season.', { group: 'seed', stack: 30, mass: 0.05, value: 4, tags: ['seed', 'grain', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  seed_cone: I('seed_cone', 'Seed Cones', 'bio', RA.fur[3], 'Resinous cones from the spike trees. Each sheds a dozen seeds.', { group: 'seed', stack: 20, mass: 0.1, value: 4, tags: ['seed', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  seed_palm: I('seed_palm', 'Palm Nuts', 'bio', RA.ochre[3], 'Fibrous palm nuts. Sow on warm ground; oil and fibre.', { group: 'seed', stack: 12, mass: 0.4, value: 4, tags: ['seed', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  spore_fungus: I('spore_fungus', 'Fungal Spores', 'bio', RA.violet[4], 'A spore print scraped into a sealed vial. Inoculate logs and beds.', { group: 'seed', stack: 40, mass: 0.01, value: 3, tags: ['seed', 'specimen', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS.concat('st_cabinet') } }),
  seed_bulb: I('seed_bulb', 'Bulbs', 'bio', RA.clay[4], 'Dormant bulbs lifted from the ground. Plant out for tubers.', { group: 'seed', stack: 16, mass: 0.1, value: 3, tags: ['seed', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  seed_cactus: I('seed_cactus', 'Barrel Seed', 'bio', RA.sage[2], 'Black seed from the barrel plants. Sows on dry, poor ground.', { group: 'seed', stack: 60, mass: 0.01, value: 3, tags: ['seed', 'grain', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  seed_crystal: I('seed_crystal', 'Crystal Seed', 'bio', RA.amethyst[4], 'A faceted alien seed from the crystalbloom. Grows only on mineral ground.', { group: 'seed', stack: 10, mass: 0.05, value: 12, tags: ['seed', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  seed_flower: I('seed_flower', 'Flower Seed', 'bio', RA.coral[4], 'Seed from the meadow blooms. Pollinators follow where it is sown.', { group: 'seed', stack: 60, mass: 0.01, value: 2.5, tags: ['seed', 'grain', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),
  seed_trap: I('seed_trap', 'Trap-Plant Pods', 'bio', RA.ichor[3], 'Seed pods of the snap-traps and pitchers. Pest control that grows.', { group: 'seed', stack: 20, mass: 0.05, value: 5, tags: ['seed', 'solid'], perish: { days: 20, into: 'carbon', safe: SEEDS } }),

  // ---------------------------------------------------------------- specimens: the lab's raw material
  tissue: I('tissue', 'Tissue Sample', 'bio', RA.flesh[4], 'A biopsy in a stoppered tube. The gene lab reads it; spoils in a day outside a freezer or a specimen cabinet.', { group: 'specimen', stack: 10, mass: 0.1, value: 15, tags: ['specimen', 'cold'], perish: { days: 1, safe: SPEC } }),
  blood_sample: I('blood_sample', 'Blood Sample', 'bio', RA.blood[3], 'Drawn blood, citrated. Immunity and diet markers; spoils in a day and a half.', { group: 'specimen', stack: 10, mass: 0.1, value: 12, tags: ['specimen', 'cold'], perish: { days: 1.5, safe: SPEC } }),
  egg: I('egg', 'Creature Egg', 'bio', RA.bone[3], 'A laid egg, still warm. Hatch it in a vat or keep it frozen; spoils in two days.', { group: 'specimen', stack: 4, mass: 0.8, value: 40, tags: ['specimen', 'cold', 'food'], food: 1.5, perish: { days: 2, safe: SPEC } }),
  embryo: I('embryo', 'Embryo Vial', 'bio', RA.glowTeal[2], 'An embryo in nutrient gel. The print vats grow a creature from it; dies in under a day unwarded.', { group: 'specimen', stack: 6, mass: 0.1, value: 60, tags: ['specimen', 'cold'], perish: { days: 0.8, safe: SPEC } }),
  plant_cutting: I('plant_cutting', 'Plant Cutting', 'bio', RA.moss[4], 'A rooted cutting in a jar of water. Clone a plant you cannot seed; wilts in two days.', { group: 'specimen', stack: 6, mass: 0.2, value: 10, tags: ['specimen', 'cold'], perish: { days: 2, into: 'leaves', safe: SPEC } }),
  venom_gland: I('venom_gland', 'Venom Gland', 'bio', RA.ichor[2], 'A venom sac, ligated. Weapon payloads and antivenom; spoils in two days.', { group: 'specimen', stack: 6, mass: 0.2, value: 35, tags: ['specimen', 'cold'], perish: { days: 2, safe: SPEC } }),

  // ---------------------------------------------------------------- earth
  topsoil: I('topsoil', 'Topsoil', 'raw', RA.soil[2], 'Dark crumbly topsoil with roots in it. The best ground for fields and grow sheds.', { mat: 'soil', group: 'earth', tags: ['bulk'], stack: 50, mass: 3, value: 1.5 }),
  clay: I('clay', 'Clay', 'raw', RA.clay[3], 'Stiff river clay. Bricks, kilns, ceramic insulators.', { mat: 'soil', group: 'earth', tags: ['bulk'], stack: 40, mass: 4, value: 1 }),
  sand: I('sand', 'Sand', 'raw', RA.sand[4], 'Washed sand: glass, concrete, moulds.', { mat: 'soil', group: 'earth', tags: ['bulk', 'grain'], stack: 50, mass: 3, value: 0.8 }),
  gravel: I('gravel', 'Gravel', 'raw', RA.stone[4], 'Broken stone. Concrete aggregate, roads, drainage.', { mat: 'soil', group: 'earth', tags: ['bulk', 'grain', 'ore'], stack: 50, mass: 4, value: 0.8 }),
  peat: I('peat', 'Peat', 'raw', RA.soil[1], 'Cut marsh peat, half rotted plants. Dries into a smoky fuel.', { mat: 'carbon', fuel: 6, group: 'earth', tags: ['bulk'], stack: 30, mass: 2, value: 1 }),
  compost: I('compost', 'Compost', 'raw', RA.soil[2], 'Rotted leaves, fruit and dung. Turns poor ground fertile.', { mat: 'soil', group: 'earth', tags: ['bulk'], stack: 40, mass: 2, value: 1 }),
  ash: I('ash', 'Ash', 'raw', RA.stone[3], 'Grey ash from the burns and the ash country. Potash for the fields, lye for soap.', { group: 'earth', tags: ['bulk', 'grain'], stack: 50, mass: 1, value: 0.6 }),
  rock_granite: I('rock_granite', 'Granite', 'raw', RA.stone[4], 'Speckled igneous rock: hard building stone, crushed for gravel.', { group: 'earth', tags: ['solid', 'ore'], stack: 12, mass: 8, value: 1.5 }),
  rock_basalt: I('rock_basalt', 'Basalt', 'raw', RA.basalt[3], 'Dense black lava rock. Rock wool, paving, furnace lining.', { group: 'earth', tags: ['solid', 'ore'], stack: 12, mass: 9, value: 1.5 }),
  rock_limestone: I('rock_limestone', 'Limestone', 'raw', RA.bone[3], 'Pale sedimentary stone full of tiny shells. Burns to lime for concrete.', { group: 'earth', tags: ['solid', 'ore'], stack: 12, mass: 7, value: 2 }),
  rock_sandstone: I('rock_sandstone', 'Sandstone', 'raw', RA.sand[3], 'Layered, warm-coloured sandstone. Easy to cut; crushes back to sand.', { group: 'earth', tags: ['solid', 'ore'], stack: 12, mass: 7, value: 1.2 }),
  rock_slate: I('rock_slate', 'Slate', 'raw', RA.slate[3], 'Blue-grey slate that splits into sheets. Roofing, benches, tablets.', { group: 'earth', tags: ['solid', 'ore'], stack: 12, mass: 7, value: 1.5 }),
  rock_obsidian: I('rock_obsidian', 'Obsidian', 'raw', RA.ink[2], 'Volcanic glass with a razor edge. Blades, lenses, scalpels.', { group: 'earth', tags: ['solid', 'ore'], stack: 12, mass: 5, value: 6 }),

  // ---------------------------------------------------------------- minerals and crystals
  malachite: I('malachite', 'Malachite', 'raw', RA.malachite[3], 'Banded green copper carbonate. A rich copper source and a pigment.', { group: 'mineral', tags: ['ore', 'solid'], stack: 12, mass: 3, value: 10 }),
  amethyst: I('amethyst', 'Amethyst', 'raw', RA.amethyst[3], 'Violet quartz from geodes. Optics and resonators.', { group: 'mineral', tags: ['ore', 'solid'], stack: 10, mass: 0.5, value: 18 }),
  ruby: I('ruby', 'Corundum', 'raw', RA.ruby[3], 'Red corundum, the second-hardest thing there is. Bearings, abrasives, laser rods.', { group: 'mineral', tags: ['ore', 'solid'], stack: 10, mass: 0.3, value: 30 }),
  salt: I('salt', 'Rock Salt', 'raw', RA.snow[4], 'Halite from the dry lakes or boiled out of brine. Preserves meat; chlorine.', { group: 'mineral', tags: ['bulk', 'grain', 'solid'], stack: 50, mass: 1, value: 1.5 }),
  saltpetre: I('saltpetre', 'Saltpetre', 'raw', RA.paper[4], 'Nitre crust from caves and dung heaps. Blasting powder and fertiliser.', { group: 'mineral', tags: ['bulk', 'grain', 'solid'], stack: 40, mass: 1, value: 4 }),

  // ---------------------------------------------------------------- fluids
  brine: I('brine', 'Brine', 'raw', RA.water[3], 'Sea water. Boil it for salt; desalinate it for water.', { group: 'fluid', tags: ['fluid'], stack: 25, mass: 1, value: 0.5 }),
  sap: I('sap', 'Tree Sap', 'bio', RA.ochre[5], 'Fresh sap tapped from the resin trees. Sets to resin in five days outside a tank.', { group: 'fluid', tags: ['fluid'], stack: 40, mass: 1, value: 2, perish: { days: 5, into: 'resin', safe: ['st_tank'] } }),

  // ---------------------------------------------------------------- refined goods
  plank: I('plank', 'Timber Planks', 'refined', RA.ochre[3], 'Sawn planks: crates, scaffold, floors.', { size: [1, 2], stack: 20, mass: 4, value: 4, tags: ['solid'] }),
  charcoal: I('charcoal', 'Charcoal', 'refined', RA.basalt[2], 'Wood charred in a clamp. A hot, clean fuel; the smelter likes it.', { fuel: 12, stack: 40, mass: 0.5, value: 3, tags: ['solid', 'bulk'] }),
  brick: I('brick', 'Fired Brick', 'refined', RA.clay[4], 'Clay fired hard. Furnaces, chimneys, walls.', { stack: 40, mass: 3, value: 2, tags: ['solid'] }),
  feed: I('feed', 'Feedstock', 'refined', RA.straw[2], 'Pressed pellets of biomass and meal. Keeps; workers and herds eat it.', { food: 2, stack: 40, mass: 1, value: 3, tags: ['grain', 'food', 'solid'], perish: { days: 12, into: 'compost', safe: ['st_freezer', 'silo'] } }),
  crushed_ore: I('crushed_ore', 'Crushed Ferrite', 'refined', RA.iron[3], 'Ferrite ore crushed and washed. Smelts at half again the yield.', { group: 'mineral', tags: ['bulk', 'ore', 'grain'], stack: 40, mass: 3, value: 3 }),
};
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
export const ITEM_INDEX: Record<ItemId, number> = Object.fromEntries(ITEM_IDS.map((k, i) => [k, i])) as Record<ItemId, number>;

// ---------------------------------------------------------------- the real-item fields, defaulted by category
const CAT_GROUP: Record<ItemCat, ItemGroup> = { raw: 'mineral', bio: 'bio', refined: 'refined', part: 'part', assembly: 'part', advanced: 'part', research: 'part', internal: 'part' };
const CAT_STACK: Record<ItemCat, number> = { raw: 20, bio: 20, refined: 30, part: 40, assembly: 20, advanced: 6, research: 20, internal: 1 };
const CAT_VALUE: Record<ItemCat, number> = { raw: 3, bio: 2, refined: 6, part: 8, assembly: 50, advanced: 300, research: 40, internal: 0 };
/** the geology's items (registered from world/geo/items.ts) get real-item fields here */
const GEO_META: Record<string, Partial<ItemDef>> = {
  gold_ore: { group: 'mineral', tags: ['ore', 'solid'], stack: 20, mass: 4, value: 12 },
  sulphur: { group: 'mineral', tags: ['ore', 'solid', 'bulk'], stack: 30, mass: 1, value: 4 },
  lumen_crystal: { group: 'mineral', tags: ['ore', 'solid'], stack: 8, mass: 0.5, value: 40 },
  gravium: { group: 'mineral', tags: ['ore', 'solid'], stack: 8, mass: 0.1, value: 60 },
  gold_ingot: { stack: 30, mass: 6, value: 40 },
  acid: { group: 'fluid', tags: ['fluid', 'solid'], stack: 10, mass: 2, value: 10 },
  powder: { stack: 30, mass: 0.5, value: 8 },
  gold_leaf: { stack: 60, mass: 0.05, value: 20 },
  lumen_lens: { stack: 12, mass: 0.3, value: 90 },
  grav_plate: { size: [2, 1], stack: 6, mass: 1, value: 160 },
  precision_circuit: { stack: 12, mass: 0.4, value: 180 },
  lumen_cell: { stack: 6, mass: 2, value: 400 },
  grav_coil: { size: [1, 2], stack: 2, mass: 10, value: 700 },
};
/** fill an item's real-item fields from its category (idempotent) */
function complete(d: ItemDef): ItemDef {
  const geo = GEO_META[d.id];
  if (geo) for (const [k, v] of Object.entries(geo)) if ((d as unknown as Record<string, unknown>)[k] === undefined) (d as unknown as Record<string, unknown>)[k] = v;
  d.group ??= CAT_GROUP[d.cat] ?? 'part';
  d.size ??= [1, 1];
  d.stack ??= CAT_STACK[d.cat] ?? 20;
  d.mass ??= 1;
  d.value ??= CAT_VALUE[d.cat] ?? 2;
  d.tags ??= d.group === 'fluid' ? ['fluid'] : d.group === 'mineral' ? ['ore', 'solid'] : d.group === 'earth' ? ['bulk'] : ['solid'];
  return d;
}
for (const id of ITEM_IDS) complete(ITEMS[id]);
/** an item's definition with every real-item field filled (unknown ids get a placeholder crate) */
export function itemDef(id: ItemId): Required<Pick<ItemDef, 'group' | 'size' | 'stack' | 'mass' | 'value' | 'tags'>> & ItemDef {
  const d = ITEMS[id] ?? complete(I(id, id, 'part', RA.steel[3], ''));
  return d as Required<Pick<ItemDef, 'group' | 'size' | 'stack' | 'mass' | 'value' | 'tags'>> & ItemDef;
}
export const itemSize = (id: ItemId): [number, number] => itemDef(id).size;
export const itemStack = (id: ItemId): number => itemDef(id).stack;
/** items that pay an old material class, cheapest first (what a cost in carbon or soil spends) */
export function matItems(res: Res): ItemId[] {
  return ITEM_IDS.filter((k) => ITEMS[k].mat === res).sort((a, b) => (ITEMS[a].value ?? 0) - (ITEMS[b].value ?? 0) || (a === res ? -1 : b === res ? 1 : 0));
}
/** add an item (another system's producers): its definition and, optionally, an icon painter on a 16 px Pix */
export function registerItem(def: ItemDef, icon?: (p: KPix) => void) {
  if (!ITEMS[def.id]) { ITEM_IDS.push(def.id); ITEM_INDEX[def.id] = ITEM_IDS.length - 1; }
  ITEMS[def.id] = complete(def);
  if (icon) ICON[def.id] = icon;
  pixCache.delete(def.id); for (const k of [...urlCache.keys()]) if (k.startsWith(def.id + '@')) urlCache.delete(k);
  if (ARR) { ARR.dispose(); ARR = null; }
}
/** the raw materials that live in the golem's hold (run.res) */
export const RAW_RES: ItemId[] = ['ore', 'carbon', 'water', 'soil'];
export const isRes = (id: ItemId): id is Res => id === 'ore' || id === 'carbon' || id === 'water' || id === 'soil';
installItemArt();

// ------------------------------------------------------------------ icons
/** the icon set in the target style lives in ui/icons.ts (hiItem); these 16-unit drawings, landing at 32 px with a
 *  coloured outline, are the fallback for anything it does not draw */
const S = 32;
const hasHi = (id: ItemId) => hasItemArt(id) || !ICON[id];
type Painter = (p: KPix) => void;
/** a fractured lump: angular facets, each one ramp step by how it faces the light */
function lump(p: KPix, R: number[], o: Pt[], cx: number, cy: number, base = 2) {
  // fan of facets from a point up-left of centre: facets facing up/left are lit
  const c: Pt = [cx - 1, cy - 1];
  for (let i = 0; i < o.length; i++) {
    const a = o[i], b = o[(i + 1) % o.length];
    const mx = (a[0] + b[0]) / 2 - c[0], my = (a[1] + b[1]) / 2 - c[1];
    const lit = (-mx - my * 1.3) / (Math.hypot(mx, my) + 0.01);
    poly(p, [c, a, b], R[Math.max(0, Math.min(R.length - 1, Math.round(base + lit * 1.4)))]);
  }
}
function ingot(p: KPix, R: number[], mark = -1) {
  poly(p, [[5, 4], [12, 4], [13, 7], [4, 7]], R[5]);
  poly(p, [[4, 7], [13, 7], [15, 12], [2, 12]], R[3]);
  poly(p, [[13, 7], [12, 4], [14, 8], [15, 12]], R[2]);
  p.hl(5, 11, 4, R[6] ?? R[5]); p.hl(4, 12, 7, R[4]);
  if (mark >= 0) { p.hl(7, 9, 5, mark); p.set(8, 6, mark); }
  selout(p, R[1]);
}
const ICON: Partial<Record<ItemId, Painter>> = {
  iron_pellet: (p) => {
    const R = RA.rust;
    for (const [x, y, k] of [[3, 9, 4], [7, 6, 3], [9, 10, 4], [5, 12, 3], [11, 6, 2], [12, 11, 3]] as const) { poly(p, [[x, y], [x + 2, y - 1], [x + 3, y + 1], [x + 1, y + 2]], R[k]); p.set(x + 1, y, R[k + 2]); }
    selout(p, R[1]);
  },
  silk: (p) => {
    const R = RA.straw;
    poly(p, [[3, 5], [8, 2], [13, 5], [13, 11], [8, 14], [3, 11]], R[3]); poly(p, [[3, 5], [8, 2], [9, 3], [5, 7], [4, 11], [3, 11]], R[5]);
    for (let k = 0; k < 4; k++) p.line(4, 6 + k * 2, 12, 4 + k * 2, R[k % 2 ? 2 : 4]);
    p.line(12, 12, 15, 15, R[4]);
    selout(p, R[1]);
  },
  resin: (p) => {
    const R = RA.ochre;
    poly(p, [[7, 2], [10, 6], [12, 10], [10, 14], [5, 14], [3, 10], [5, 6]], R[4]); poly(p, [[7, 2], [5, 6], [3, 10], [5, 12], [6, 7]], R[6]);
    poly(p, [[10, 14], [12, 10], [11, 9], [8, 13]], R[2]); p.set(6, 8, 0xd6c79c);
    selout(p, R[1]);
  },
  bio_oil: (p) => {
    const R = RA.steel, O = RA.ichor;
    p.rect(4, 4, 8, 10, R[3]); p.rect(4, 4, 2, 10, R[5]); p.rect(10, 4, 2, 10, R[1]);
    p.rect(4, 7, 8, 4, O[3]); p.rect(4, 7, 2, 4, O[4]); p.rect(10, 7, 2, 4, O[1]);
    p.hl(5, 10, 3, R[4]); p.hl(4, 11, 6, R[2]); p.hl(4, 11, 11, R[2]); p.set(8, 2, R[5]);
    selout(p, R[1]);
  },
  glass_bead: (p) => {
    const R = RA.water;
    for (const [x, y] of [[3, 8], [7, 5], [10, 9], [6, 11], [11, 4]] as const) { poly(p, [[x, y + 1], [x + 1, y], [x + 3, y], [x + 4, y + 1], [x + 4, y + 2], [x + 3, y + 3], [x + 1, y + 3], [x, y + 2]], R[4]); p.set(x + 1, y + 1, R[6]); p.set(x + 3, y + 2, R[2]); }
    selout(p, R[1]);
  },
  protein: (p) => {
    const R = RA.paper, F = RA.flesh;
    p.rect(4, 5, 8, 9, R[4]); p.rect(4, 5, 2, 9, R[5]); p.rect(10, 5, 2, 9, R[2]);
    poly(p, [[4, 5], [6, 2], [10, 2], [12, 5]], R[3]); p.hl(6, 9, 2, R[5]);
    p.rect(5, 8, 6, 3, F[4]); p.hl(5, 10, 8, F[5]);
    selout(p, R[1]);
  },
  algae_fuel: (p) => {
    const R = RA.olive, A = RA.ichor;
    p.rect(3, 4, 10, 10, R[3]); p.rect(3, 4, 2, 10, R[4]); p.rect(11, 4, 2, 10, R[1]);
    p.hl(3, 12, 6, R[1]); p.hl(3, 12, 11, R[1]);
    p.rect(5, 7, 6, 3, A[3]); p.set(6, 8, A[4]); p.set(9, 8, A[2]);
    p.rect(9, 2, 3, 2, R[2]);
    selout(p, R[0]);
  },
  dung: (p) => {
    const R = RA.soil;
    lump(p, R, [[2, 13], [4, 9], [7, 8], [8, 5], [11, 6], [13, 9], [14, 13]], 8, 11, 2);
    p.set(6, 11, R[4]); p.set(10, 8, R[4]); p.set(9, 12, R[1]);
    selout(p, R[0]);
  },
  herbicide: (p) => {
    const R = RA.olive, Y = RA.glowAmber;
    p.rect(4, 3, 8, 11, R[4]); p.rect(4, 3, 2, 11, R[5]); p.rect(10, 3, 2, 11, R[2]);
    p.hl(4, 11, 5, R[1]); p.hl(4, 11, 12, R[1]);
    p.rect(6, 7, 4, 3, Y[3]); p.set(7, 8, RA.ink[1]); p.set(8, 8, RA.ink[1]);
    selout(p, R[1]);
  },
  ore: (p) => {
    lump(p, RA.stone, [[3, 6], [6, 3], [11, 3], [14, 7], [13, 12], [8, 14], [3, 12]], 8, 8, 3);
    for (const [x, y, k] of [[6, 6, 4], [7, 6, 5], [6, 7, 3], [10, 9, 4], [11, 9, 3], [10, 10, 2], [8, 11, 3], [11, 5, 4]] as const) p.set(x, y, RA.rust[k]);
    selout(p, RA.stone[1]);
  },
  copper_ore: (p) => {
    lump(p, RA.stone, [[2, 7], [5, 3], [10, 4], [14, 6], [14, 11], [9, 14], [4, 12]], 8, 8, 3);
    for (const [x, y, k] of [[5, 6, 4], [6, 6, 5], [6, 7, 3], [9, 9, 4], [10, 9, 5], [10, 10, 3], [11, 6, 4], [7, 11, 3]] as const) p.set(x, y, RA.teal[k]);
    p.set(12, 9, RA.rust[4]); p.set(4, 9, RA.rust[3]);
    selout(p, RA.stone[1]);
  },
  coal: (p) => {
    lump(p, RA.basalt, [[3, 8], [5, 4], [9, 2], [13, 5], [14, 10], [10, 14], [4, 13]], 8, 8, 2);
    p.set(6, 5, RA.slate[5]); p.set(7, 5, RA.slate[4]); p.set(11, 6, RA.slate[4]);
    selout(p, RA.basalt[0]);
  },
  crystal: (p) => {
    const C = RA.snow;
    poly(p, [[4, 13], [3, 7], [5, 4], [7, 7], [7, 13]], C[2]); poly(p, [[3, 7], [5, 4], [5, 13], [4, 13]], C[4]);
    poly(p, [[7, 14], [6, 5], [9, 1], [11, 5], [11, 14]], C[3]); poly(p, [[6, 5], [9, 1], [9, 14], [7, 14]], C[5]);
    poly(p, [[11, 14], [11, 8], [13, 6], [14, 9], [13, 14]], C[1]); poly(p, [[11, 8], [13, 6], [13, 14], [11, 14]], C[3]);
    p.vl(8, 4, 8, C[5]); p.set(9, 2, 0xe2e1d8);
    selout(p, C[0]);
  },
  carbon: (p) => {
    const R = RA.ochre;
    poly(p, [[2, 11], [8, 3], [11, 4], [6, 13]], R[3]); poly(p, [[2, 11], [8, 3], [9, 4], [4, 12]], R[5]);
    poly(p, [[6, 13], [12, 6], [14, 8], [9, 14]], R[2]); poly(p, [[6, 13], [12, 6], [13, 7], [8, 14]], R[4]);
    for (let k = 0; k < 4; k++) p.set(4 + k * 1, 10 - k * 2, R[1]);
    p.set(10, 10, R[1]); p.set(11, 9, R[1]);
    selout(p, R[0]);
  },
  water: (p) => {
    const R = RA.steel, W = RA.water;
    p.rect(4, 4, 8, 10, R[4]); p.rect(4, 4, 2, 10, R[5]); p.rect(10, 4, 2, 10, R[2]);
    p.hl(5, 10, 3, R[5]); p.hl(5, 10, 2, R[3]); p.set(9, 2, R[6]);
    p.rect(4, 7, 8, 4, W[4]); p.rect(4, 7, 2, 4, W[5]); p.rect(10, 7, 2, 4, W[2]);
    p.hl(4, 11, 6, R[2]); p.hl(4, 11, 11, R[2]); p.hl(5, 10, 14, R[2]);
    p.set(7, 8, W[6]); p.set(8, 9, W[6]);
    selout(p, R[1]);
  },
  soil: (p) => {
    const R = RA.soil;
    lump(p, R, [[1, 13], [4, 8], [7, 6], [10, 7], [14, 10], [15, 13]], 8, 11, 3);
    poly(p, [[5, 9], [7, 5], [9, 6], [8, 9]], R[5]);
    p.set(4, 12, R[1]); p.set(10, 11, R[1]); p.set(12, 12, R[2]); p.set(7, 11, R[6]);
    selout(p, R[1]);
  },
  fruit: (p) => {
    const R = RA.coral, L = RA.moss;
    poly(p, [[5, 6], [8, 4], [11, 5], [13, 8], [13, 11], [11, 14], [6, 14], [3, 11], [3, 8]], R[3]);
    poly(p, [[5, 6], [8, 4], [9, 5], [7, 8], [4, 10], [3, 8]], R[5]);
    poly(p, [[11, 14], [13, 11], [13, 8], [11, 12], [8, 14]], R[2]);
    p.set(6, 6, 0xc49580); p.vl(8, 2, 4, RA.fur[2]);
    poly(p, [[9, 3], [12, 1], [14, 2], [11, 4]], L[4]); p.set(12, 2, L[5]);
    selout(p, R[1]);
  },
  iron_ingot: (p) => ingot(p, RA.steel),
  copper_ingot: (p) => ingot(p, RA.rust),
  steel_ingot: (p) => ingot(p, RA.slate, RA.slate[1]),
  glass: (p) => {
    const R = RA.water;
    poly(p, [[2, 6], [9, 3], [14, 7], [7, 11]], R[5]); poly(p, [[2, 6], [7, 11], [7, 13], [2, 8]], R[3]); poly(p, [[7, 11], [14, 7], [14, 9], [7, 13]], R[2]);
    p.line(5, 6, 8, 5, 0xcfd2cc); p.line(8, 8, 11, 7, R[6]);
    selout(p, R[1]);
  },
  concrete: (p) => {
    const R = RA.stone;
    poly(p, [[2, 6], [8, 3], [14, 6], [8, 9]], R[6]); poly(p, [[2, 6], [8, 9], [8, 14], [2, 11]], R[4]); poly(p, [[8, 9], [14, 6], [14, 11], [8, 14]], R[3]);
    for (const [x, y, c] of [[5, 6, 4], [10, 5, 5], [4, 10, 2], [11, 10, 1], [6, 12, 3]] as const) p.set(x, y, R[c]);
    selout(p, R[1]);
  },
  rubber: (p) => {
    const R = RA.basalt;
    poly(p, [[2, 7], [8, 4], [14, 7], [8, 10]], R[4]); poly(p, [[2, 7], [8, 10], [8, 13], [2, 10]], R[2]); poly(p, [[8, 10], [14, 7], [14, 10], [8, 13]], R[1]);
    p.hl(6, 9, 6, R[5]); p.hl(7, 10, 7, R[3]);
    selout(p, R[0], RA.ink[0]);
  },
  plastic: (p) => {
    const R = RA.clay;
    for (let k = 0; k < 3; k++) { const y = 9 - k * 2; poly(p, [[2, y], [8, y - 3], [14, y], [8, y + 3]], R[4 - (k === 2 ? 0 : 1) + (k === 2 ? 1 : 0)]); p.line(2, y + 1, 8, y + 4, R[1]); p.line(8, y + 4, 14, y + 1, R[0]); }
    selout(p, R[1]);
  },
  iron_plate: (p) => {
    const R = RA.steel;
    poly(p, [[1, 8], [8, 4], [15, 8], [8, 12]], R[4]); poly(p, [[1, 8], [8, 12], [8, 13], [1, 9]], R[2]); poly(p, [[8, 12], [15, 8], [15, 9], [8, 13]], R[1]);
    poly(p, [[3, 8], [8, 5], [9, 6], [4, 9]], R[5]);
    for (const [x, y] of [[4, 8], [8, 6], [12, 8], [8, 10]]) p.set(x, y, R[1]);
    selout(p, R[1]);
  },
  iron_rod: (p) => {
    const R = RA.steel;
    for (const o of [0, 4]) { p.line(2 + o, 12, 11 + o, 3, R[4]); p.line(3 + o, 12, 12 + o, 3, R[2]); p.line(2 + o, 11, 10 + o, 3, R[5]); }
    selout(p, R[1]);
  },
  screw: (p) => {
    const R = RA.steel;
    for (const [ox, oy] of [[0, 0], [6, 3]] as const) {
      poly(p, [[2 + ox, 4 + oy], [6 + ox, 2 + oy], [7 + ox, 4 + oy], [3 + ox, 6 + oy]], R[5]);
      for (let k = 0; k < 5; k++) { p.set(5 + ox + k, 5 + oy + k, k % 2 ? R[2] : R[4]); p.set(4 + ox + k, 6 + oy + k, R[3]); }
      p.line(3 + ox, 3 + oy, 5 + ox, 2 + oy, R[1]);
    }
    selout(p, R[1]);
  },
  copper_wire: (p) => {
    const W = RA.ochre, C = RA.rust;
    poly(p, [[2, 4], [5, 2], [6, 13], [3, 14]], W[4]); poly(p, [[10, 4], [13, 2], [14, 13], [11, 14]], W[3]);
    for (let y = 4; y <= 12; y += 2) { p.line(5, y, 11, y - 1, C[5]); p.line(5, y + 1, 11, y, C[3]); }
    p.line(12, 6, 15, 9, C[4]);
    selout(p, W[1]);
  },
  cable: (p) => {
    const R = RA.basalt;
    for (let k = 0; k < 3; k++) { const y = 5 + k * 3; poly(p, [[2, y + 1], [7, y - 1], [14, y + 1], [9, y + 3]], R[3 - k % 2]); p.line(3, y + 1, 7, y, R[4]); }
    p.rect(13, 12, 2, 2, RA.rust[5]); p.set(15, 13, RA.rust[3]);
    selout(p, R[0]);
  },
  steel_beam: (p) => {
    const R = RA.slate;
    poly(p, [[1, 6], [11, 1], [14, 3], [4, 8]], R[5]); poly(p, [[6, 6], [11, 4], [11, 9], [6, 11]], R[2]);
    poly(p, [[1, 11], [11, 6], [14, 8], [4, 13]], R[4]); poly(p, [[4, 13], [14, 8], [14, 9], [4, 14]], R[1]); poly(p, [[4, 8], [14, 3], [14, 4], [4, 9]], R[2]);
    selout(p, R[0]);
  },
  gear: (p) => {
    const R = RA.steel, pts: Pt[] = [];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + 0.2, r = i % 2 ? 6.8 : 5; pts.push([8 + Math.cos(a) * r, 8 + Math.sin(a) * r * 0.86]); }
    poly(p, pts, R[3]);
    poly(p, pts.filter((_, i) => i >= 8 && i <= 13).concat([[8, 8]]), R[5]);
    poly(p, [[6, 6], [10, 6], [10, 10], [6, 10]], R[1]); p.set(6, 6, R[3]); p.set(10, 10, R[3]); p.set(7, 7, R[0]);
    selout(p, R[1]);
  },
  reinforced_plate: (p) => {
    const R = RA.olive, S2 = RA.steel;
    poly(p, [[1, 8], [8, 4], [15, 8], [8, 12]], R[4]); poly(p, [[1, 8], [8, 12], [8, 14], [1, 10]], R[2]); poly(p, [[8, 12], [15, 8], [15, 10], [8, 14]], R[1]);
    p.line(3, 9, 12, 5, S2[5]); p.line(4, 7, 13, 11, S2[5]); p.line(4, 10, 12, 6, S2[2]);
    for (const [x, y] of [[4, 8], [8, 6], [12, 8], [8, 10]]) p.set(x, y, S2[6]);
    selout(p, R[1]);
  },
  rotor: (p) => {
    const R = RA.rust, S2 = RA.steel;
    p.line(1, 12, 14, 3, S2[4]); p.line(2, 12, 15, 3, S2[2]);
    for (let k = 0; k < 4; k++) { const x = 5 + k * 2, y = 10 - k * 1.4; poly(p, [[x - 2, y - 2], [x + 1, y - 4], [x + 3, y + 1], [x, y + 3]], R[k % 2 ? 3 : 4]); p.line(x - 2, y - 2, x + 1, y - 4, R[5]); }
    selout(p, R[1]);
  },
  frame: (p) => {
    const R = RA.steel;
    const sq: Pt[] = [[2, 7], [8, 3], [14, 7], [8, 11]];
    for (let i = 0; i < 4; i++) { const a = sq[i], b = sq[(i + 1) % 4]; p.line(a[0], a[1], b[0], b[1], R[5]); p.line(a[0], a[1] + 3, b[0], b[1] + 3, R[3]); p.vl(a[0], a[1], a[1] + 3, R[4]); }
    p.line(2, 7, 14, 7, R[2]); p.line(8, 3, 8, 11, R[2]); p.line(4, 10, 8, 14, R[3]);
    selout(p, R[1]);
  },
  circuit: (p) => {
    const R = RA.clay, C = RA.rust;
    poly(p, [[1, 8], [8, 4], [15, 8], [8, 12]], R[3]); poly(p, [[1, 8], [8, 12], [8, 13], [1, 9]], R[1]); poly(p, [[8, 12], [15, 8], [15, 9], [8, 13]], R[0]);
    p.line(4, 8, 8, 6, C[5]); p.line(8, 6, 11, 8, C[5]); p.line(6, 9, 10, 7, C[4]); p.line(8, 10, 12, 8, C[5]);
    p.rect(7, 7, 2, 2, RA.basalt[2]); p.set(4, 8, C[6]); p.set(12, 8, C[6]);
    selout(p, R[0]);
  },
  vacuum_tube: (p) => {
    const G = RA.water, A = RA.glowAmber, B = RA.basalt;
    poly(p, [[5, 13], [5, 5], [6, 3], [8, 2], [10, 3], [11, 5], [11, 13]], G[4], 220);
    poly(p, [[5, 13], [5, 5], [6, 3], [7, 3], [6, 5], [6, 13]], G[6], 230);
    p.vl(8, 6, 11, A[4]); p.vl(9, 7, 10, A[3]); p.set(8, 5, A[3]); p.hl(7, 9, 12, B[3]);
    p.rect(5, 13, 7, 2, B[2]); p.hl(5, 11, 13, B[4]); p.set(6, 15, RA.brass[4]); p.set(10, 15, RA.brass[4]);
    selout(p, G[1]);
  },
  motor: (p) => {
    const R = RA.olive, S2 = RA.steel;
    poly(p, [[2, 6], [9, 3], [13, 5], [6, 9]], R[5]); poly(p, [[2, 6], [6, 9], [6, 13], [2, 10]], R[3]); poly(p, [[6, 9], [13, 5], [13, 9], [6, 13]], R[2]);
    for (let k = 0; k < 3; k++) p.line(7 + k * 2, 8 - k, 7 + k * 2, 12 - k, R[1]);
    p.line(13, 7, 15, 6, S2[5]); p.set(15, 7, S2[3]);
    poly(p, [[1, 12], [6, 15], [8, 14], [3, 11]], RA.basalt[2]);
    selout(p, R[1]);
  },
  ammo: (p) => {
    const B = RA.brass, C = RA.rust;
    for (const ox of [2, 6, 10]) {
      p.rect(ox, 6, 3, 8, B[3]); p.vl(ox, 6, 13, B[5]); p.vl(ox + 2, 6, 13, B[1]);
      poly(p, [[ox, 6], [ox + 1, 3], [ox + 2, 3], [ox + 3, 6]], C[4]); p.set(ox + 1, 4, C[5]);
      p.hl(ox, ox + 2, 13, B[2]);
    }
    selout(p, B[0]);
  },
  servo: (p) => {
    const R = RA.olive, S2 = RA.steel;
    poly(p, [[2, 7], [8, 4], [13, 6], [7, 9]], R[5]); poly(p, [[2, 7], [7, 9], [7, 14], [2, 12]], R[3]); poly(p, [[7, 9], [13, 6], [13, 11], [7, 14]], R[2]);
    p.rect(8, 3, 2, 3, S2[4]); poly(p, [[5, 2], [9, 1], [13, 3], [9, 4]], S2[5]); p.set(9, 2, S2[1]);
    p.set(4, 10, RA.stampRed[3]); p.set(10, 10, RA.glowAmber[3]);
    selout(p, R[1]);
  },
  control_unit: (p) => {
    const R = RA.olive, P = RA.glowTeal;
    poly(p, [[1, 5], [8, 2], [15, 5], [8, 8]], R[5]); poly(p, [[1, 5], [8, 8], [8, 15], [1, 12]], R[3]); poly(p, [[8, 8], [15, 5], [15, 12], [8, 15]], R[2]);
    poly(p, [[2, 7], [6, 9], [6, 12], [2, 10]], P[1]); p.set(3, 9, P[3]); p.set(4, 10, P[2]);
    p.set(10, 9, RA.brass[5]); p.set(13, 8, RA.brass[5]); p.set(11, 12, RA.stampRed[3]); p.set(13, 11, RA.glowAmber[3]);
    selout(p, R[1]);
  },
  heavy_frame: (p) => {
    const R = RA.slate;
    poly(p, [[1, 7], [8, 3], [15, 7], [8, 11]], R[4]); poly(p, [[1, 7], [8, 11], [8, 15], [1, 11]], R[2]); poly(p, [[8, 11], [15, 7], [15, 11], [8, 15]], R[1]);
    poly(p, [[4, 7], [8, 5], [12, 7], [8, 9]], R[1]);
    for (let k = 0; k < 4; k++) { p.set(2 + k * 2, 9 + k, k % 2 ? RA.ink[1] : RA.glowAmber[2]); p.set(3 + k * 2, 10 + k, k % 2 ? RA.glowAmber[2] : RA.ink[1]); }
    selout(p, R[0]);
  },
  reactor_core: (p) => {
    const S2 = RA.steel, G = RA.glowTeal;
    p.rect(5, 2, 6, 13, S2[3]); p.rect(5, 2, 2, 13, S2[5]); p.rect(10, 2, 1, 13, S2[1]);
    p.rect(6, 5, 4, 6, G[2]); p.vl(7, 5, 10, G[4]); p.set(7, 6, G[3]);
    p.hl(5, 10, 3, RA.glowAmber[3]); p.hl(5, 10, 13, RA.glowAmber[3]); p.set(6, 3, RA.ink[1]); p.set(8, 3, RA.ink[1]); p.set(10, 13, RA.ink[1]);
    selout(p, S2[1]);
  },
  report: (p) => {
    const R = RA.paper;
    poly(p, [[3, 2], [12, 2], [13, 14], [4, 14]], R[3]); poly(p, [[2, 3], [11, 3], [12, 15], [3, 15]], R[5]);
    for (let y = 5; y <= 12; y += 2) p.hl(4, 9 + (y % 4 ? 0 : 1), y, RA.ink[2]);
    poly(p, [[8, 10], [11, 9], [12, 12], [9, 13]], RA.stampRed[2], 200); p.set(10, 11, RA.stampRed[3]);
    p.set(3, 3, RA.steel[5]); p.set(4, 3, RA.steel[3]);
    selout(p, R[1]);
  },
  tape: (p) => {
    const R = RA.steel, T = RA.basalt;
    const oct: Pt[] = [[5, 2], [11, 2], [14, 5], [14, 11], [11, 14], [5, 14], [2, 11], [2, 5]];
    poly(p, oct, R[4]); poly(p, [[5, 2], [11, 2], [8, 8], [2, 5]], R[5]);
    poly(p, [[5, 4], [11, 4], [12, 6], [12, 10], [10, 12], [6, 12], [4, 10], [4, 6]], T[2]);
    p.rect(7, 7, 3, 3, R[5]); p.set(8, 8, T[0]); p.set(6, 5, T[4]); p.set(5, 6, T[3]);
    selout(p, R[1]);
  },
  steam: (p) => {
    const R = RA.snow;
    poly(p, [[3, 12], [4, 8], [7, 6], [10, 7], [13, 10], [12, 13], [7, 14]], R[3], 200); poly(p, [[6, 8], [8, 3], [11, 4], [10, 7]], R[4], 200);
    selout(p, -1, R[0]);
  },
};

const pixCache = new Map<ItemId, Pix>(), urlCache = new Map<string, string>();
/** the lowpix sprite of an item (32 x 32, palette-snapped; inv/itemSprites.ts), decoded once */
const spriteCache = new Map<ItemId, Pix | null>();
function sprite(id: ItemId): Pix | null {
  let p = spriteCache.get(id);
  if (p !== undefined) return p;
  const b = SPRITES[id];
  p = null;
  if (b && SPRITE_SIZE === S) {
    const raw = atob(b); p = new Pix(S, S);
    for (let i = 0; i < raw.length; i++) {
      const k = raw.charCodeAt(i); if (k === 255) continue;
      const c = SPRITE_PAL[k], j = i * 4; p.d[j] = (c >> 16) & 255; p.d[j + 1] = (c >> 8) & 255; p.d[j + 2] = c & 255; p.d[j + 3] = 255;
    }
  }
  spriteCache.set(id, p);
  return p;
}
export const hasSprite = (id: ItemId) => !!SPRITES[id];
/** a 32 px RGBA icon (the texture-array layer for belt crates): the lowpix sprite, else the painted icon */
export function itemPix(id: ItemId): Pix {
  let p = pixCache.get(id);
  if (!p) {
    const sp = sprite(id);
    if (sp) p = sp;
    else if (hasHi(id)) { const pc = hiItem(id, S); p = new Pix(S, S); p.d.set(pc.data.subarray(0, S * S * 4)); }
    else { const k = new KPix(S / 16); ICON[id]!(k); p = k.p; }
    pixCache.set(id, p);
  }
  return p;
}
/** a data URL of an item's icon: its 32 px sprite blown up by the whole number nearest px / 32 (show it at any
 *  whole multiple of 32 with image-rendering: pixelated), else the painted icon at px */
export function itemIcon(id: ItemId, px = chipPx()): string {
  const sp = sprite(id);
  if (sp) {
    const k = Math.max(1, Math.round(px / S)), key = id + '#' + k;
    let u = urlCache.get(key);
    if (!u) {
      const c = document.createElement('canvas'); c.width = c.height = S * k;
      const x = c.getContext('2d')!; const img = new ImageData(new Uint8ClampedArray(sp.d), S, S);
      if (k === 1) x.putImageData(img, 0, 0);
      else { const t = document.createElement('canvas'); t.width = t.height = S; t.getContext('2d')!.putImageData(img, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, S * k, S * k); }
      u = c.toDataURL(); urlCache.set(key, u);
    }
    return u;
  }
  if (hasHi(id)) return hiItemURL(id, px);
  const key = id + '@' + px; let u = urlCache.get(key);
  if (u) return u;
  const k = Math.max(1, Math.round(px / 16)), kp = new KPix(k); ICON[id]!(kp); u = kp.url();
  urlCache.set(key, u);
  return u;
}
/** chips are drawn at the device size they are shown at (16 CSS px per text scale step): no resampling */
let CHIP = 0;
export function chipPx() {
  if (!CHIP) { const tf = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tf')) || 1; CHIP = Math.max(16, Math.round(16 * tf * (devicePixelRatio || 1))); setTimeout(() => (CHIP = 0), 2000); }
  return CHIP;
}
/** inline HTML for an item chip (icon + count) */
export const itemChip = (id: ItemId, n?: number | string, cls = '') => `<span class="fc-chip ${cls}" title="${ITEMS[id]?.name ?? id}"><img src="${itemIcon(id)}">${n !== undefined ? `<b>${n}</b>` : ''}</span>`;

let ARR: THREE.DataArrayTexture | null = null;
/** every item icon as one layer of a texture array (belt crates sample their icon by item index) */
export function iconArray(): THREE.DataArrayTexture {
  if (ARR) return ARR;
  const n = ITEM_IDS.length, data = new Uint8Array(S * S * 4 * n);
  ITEM_IDS.forEach((id, k) => {
    const p = itemPix(id);
    // flip rows (texture origin bottom-left); empty pixels take the crate's side colour so edges read clean
    const sc = ITEMS[id].side;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const si = (y * S + x) * 4, di = k * S * S * 4 + ((S - 1 - y) * S + x) * 4;
      if (p.d[si + 3] > 0) { data[di] = p.d[si]; data[di + 1] = p.d[si + 1]; data[di + 2] = p.d[si + 2]; data[di + 3] = 255; }
      else { data[di] = (sc >> 16) & 255; data[di + 1] = (sc >> 8) & 255; data[di + 2] = sc & 255; data[di + 3] = 0; }
    }
  });
  const t = new THREE.DataArrayTexture(data, S, S, n);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  ARR = t;
  return t;
}
void INKC;
