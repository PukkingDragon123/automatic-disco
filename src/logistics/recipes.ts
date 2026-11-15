// Processing chains for the real items: wood to planks or charcoal, ore to crushed ore to ingots, soil and seed to
// crops, biomass to feedstock. The item catalogue belongs to the inventory agent (src/factory/items.ts); its ids are
// resolved here by name with aliases, and a recipe is registered only once every item it names exists. Call
// registerChains() again whenever new items appear (the build menu does on open).
import { ITEMS, type ItemId } from '../factory/items';
import { registerRecipe, RECIPE, type Recipe } from '../factory/recipes';

/** the names the inventory catalogue may use for each material (first that exists wins) */
const ALIAS: Record<string, string[]> = {
  wood: ['wood', 'log', 'logs', 'timber'],
  planks: ['planks', 'plank', 'lumber', 'boards'],
  charcoal: ['charcoal'],
  bark: ['bark'],
  sawdust: ['sawdust'],
  ore: ['iron_ore', 'ore', 'ferrite'],
  crushed: ['crushed_ore', 'crushed_iron', 'iron_crushed', 'ore_crushed'],
  copper_ore: ['copper_ore'],
  crushed_cu: ['crushed_copper', 'copper_crushed'],
  iron_ingot: ['iron_ingot', 'ingot'],
  copper_ingot: ['copper_ingot'],
  gravel: ['gravel'],
  sand: ['sand'],
  rocks: ['rocks', 'rock', 'stone', 'rock_granite'],
  rocks2: ['rock_limestone', 'rock_sandstone'],
  topsoil: ['topsoil'],
  compost: ['compost'],
  dung: ['dung'],
  peat: ['peat'],
  ash: ['ash'],
  tuber: ['tuber', 'crops', 'grain'],
  berries: ['berries'],
  seed_grass: ['seed_grass', 'seeds', 'seed'],
  seed_reed: ['seed_reed'],
  seed_shrub: ['seed_shrub'],
  sap: ['sap'],
  meat: ['meat'],
  bone: ['bone'],
  clay: ['clay'],
  brick: ['brick', 'bricks'],
  soil: ['soil', 'dirt'],
  seeds: ['seeds', 'seed', 'seed_grass'],
  crops: ['crops', 'crop', 'grain', 'wheat', 'tuber'],
  water: ['water'],
  fibre: ['fibre', 'fiber', 'plant_fibre'],
  leaves: ['leaves', 'leaf'],
  fruit: ['fruit'],
  biomass: ['biomass', 'carbon'],
  feedstock: ['feedstock', 'feed', 'nutrient_paste'],
  rope: ['rope'],
  resin: ['resin'],
  coal: ['coal'],
  glass: ['glass'],
  carbon: ['carbon'],
};
export function itemFor(name: string): ItemId | null {
  for (const id of ALIAS[name] ?? [name]) if (ITEMS[id]) return id;
  return null;
}
type Side = [string, number][];
interface Chain { id: string; at: string; name: string; in: Side; out: Side; t: number }
const C = (id: string, at: string, name: string, inp: Side, out: Side, t: number): Chain => ({ id, at, name, in: inp, out, t });
export const CHAINS: Chain[] = [
  // timber
  C('saw_planks', 'saw', 'Sawn Planks', [['wood', 1]], [['planks', 4]], 4),
  C('saw_planks_dust', 'saw', 'Planks and Sawdust', [['wood', 2]], [['planks', 6], ['sawdust', 2]], 7),
  C('kiln_charcoal', 'kiln', 'Charcoal', [['wood', 3]], [['charcoal', 2]], 12),
  C('kiln_charcoal_offcut', 'kiln', 'Charcoal (offcuts)', [['sawdust', 4]], [['charcoal', 1]], 8),
  C('kiln_brick', 'kiln', 'Fired Brick', [['clay', 2], ['charcoal', 1]], [['brick', 4]], 10),
  // ore
  C('crush_iron', 'crusher', 'Crushed Iron Ore', [['ore', 2]], [['crushed', 3]], 3),
  C('crush_copper', 'crusher', 'Crushed Copper Ore', [['copper_ore', 2]], [['crushed_cu', 3]], 3),
  C('crush_rocks', 'crusher', 'Gravel', [['rocks', 1]], [['gravel', 2]], 2),
  C('crush_gravel', 'crusher', 'Sand', [['gravel', 2]], [['sand', 3]], 3),
  C('smelt_crushed', 'smelter', 'Iron Ingot (crushed ore)', [['crushed', 2], ['charcoal', 1]], [['iron_ingot', 2]], 3),
  C('smelt_crushed_cu', 'smelter', 'Copper Ingot (crushed ore)', [['crushed_cu', 2]], [['copper_ingot', 2]], 3),
  C('smelt_charcoal', 'smelter', 'Iron Ingot (charcoal)', [['ore', 2], ['charcoal', 1]], [['iron_ingot', 2]], 4),
  C('smelt_sand_glass', 'smelter', 'Glass (sand)', [['sand', 3]], [['glass', 2]], 3),
  C('crush_rocks2', 'crusher', 'Gravel (soft stone)', [['rocks2', 1]], [['gravel', 3]], 2),
  C('kiln_ash', 'kiln', 'Potash', [['bark', 4]], [['ash', 2]], 8),
  // crops: soil (or rich topsoil), seed and water; a share of the seed comes back
  C('plot_crops', 'plot', 'Tubers', [['soil', 1], ['seed_grass', 1], ['water', 1]], [['tuber', 4], ['seed_grass', 1]], 24),
  C('plot_crops_rich', 'plot', 'Tubers (topsoil)', [['topsoil', 1], ['seed_grass', 1], ['water', 1]], [['tuber', 6], ['seed_grass', 2]], 20),
  C('plot_fibre', 'plot', 'Fibre Reeds', [['soil', 1], ['seed_reed', 1], ['water', 2]], [['fibre', 5], ['seed_reed', 1]], 20),
  C('plot_berries', 'plot', 'Berry Bushes', [['soil', 1], ['seed_shrub', 1], ['water', 2]], [['berries', 4], ['seed_shrub', 1]], 30),
  C('plot_fruit', 'plot', 'Fruit Bushes', [['soil', 1], ['seeds', 1], ['water', 2]], [['fruit', 4]], 30),
  C('saw_rope', 'saw', 'Twisted Rope', [['fibre', 4]], [['rope', 1]], 5),
  // biomass and feedstock
  C('vat_feed_biomass', 'vat', 'Feedstock (biomass)', [['biomass', 3], ['water', 1]], [['feedstock', 2]], 8),
  C('vat_feed_leaves', 'vat', 'Feedstock (leaves)', [['leaves', 6], ['water', 1]], [['feedstock', 1]], 8),
  C('vat_feed_crops', 'vat', 'Feedstock (crops)', [['crops', 3], ['water', 1]], [['feedstock', 3]], 10),
  C('vat_biomass_fruit', 'vat', 'Biomass (fruit pulp)', [['fruit', 2]], [['biomass', 2]], 5),
  C('vat_feed_meat', 'vat', 'Feedstock (meat and bone)', [['meat', 1], ['bone', 1], ['water', 1]], [['feedstock', 4]], 10),
  C('vat_compost', 'vat', 'Compost', [['leaves', 4], ['dung', 1]], [['compost', 3]], 12),
  C('vat_topsoil', 'vat', 'Topsoil (compost into dirt)', [['compost', 1], ['soil', 2]], [['topsoil', 3]], 8),
];

/** register every chain whose items exist (repeatable: new items enable more) */
export function registerChains(): number {
  let n = 0;
  for (const c of CHAINS) {
    const res = (s: Side) => { const o: Recipe['in'] = {}; for (const [k, v] of s) { const id = itemFor(k); if (!id) return null; o[id] = (o[id] ?? 0) + v; } return o; };
    const inp = res(c.in), out = res(c.out);
    if (!inp || !out) continue;
    const r: Recipe = { id: c.id, at: c.at, name: c.name, in: inp, out, t: c.t };
    const had = RECIPE[c.id];
    if (!had || JSON.stringify(had.in) !== JSON.stringify(r.in) || JSON.stringify(had.out) !== JSON.stringify(r.out)) registerRecipe(r);
    n++;
  }
  return n;
}
