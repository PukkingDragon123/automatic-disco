// Container kinds: what each storage building is, how big its grid is, which items it takes (by tag), whether it
// keeps perishables (a freezer only while powered), and its default paint and logo. Pure data (no three.js), shared
// by the storage model, the 3D models, the grid window and the crate HUD.
import type { ItemTag } from '../factory/items';
import type { Cost } from '../factory/defs';
import type { RampName } from '../art/palette';

export type ContainerKind = 'crate' | 'st_bin' | 'st_pit' | 'st_bunker' | 'st_freezer' | 'st_tank' | 'silo' | 'st_cabinet' | 'st_vault' | 'hold';
export interface KindInfo {
  kind: ContainerKind; name: string;
  /** stencil on the HUD tab (4-6 letters) */
  short: string; desc: string;
  /** grid cells */
  grid: [number, number];
  /** footprint on the works grid (cells) and height (m) */
  foot: [number, number]; h: number;
  accepts: ItemTag[];
  /** MW drawn (a freezer keeps nothing cold unpowered) */
  power: number;
  /** open-topped: the load shows over the rim */
  open: boolean;
  cost: Cost; skill?: string; hp: number;
  logo: LogoId; color: PaintId;
}
export type LogoId = 'unaa' | 'leaf' | 'gear' | 'drop' | 'flake' | 'pick' | 'seed' | 'flask' | 'bolt' | 'hazard' | 'paw' | 'star' | 'wheat' | 'atom' | 'cross' | 'arrow';
export type PaintId = 'olive' | 'amber' | 'red' | 'slate' | 'cream' | 'teal' | 'rust' | 'black';
/** paint colours a container can be given (the stencil and its band): muted enamels from the master ramps */
export const PAINTS: Record<PaintId, { name: string; ramp: RampName; base: number; dark: number; light: number }> = {
  olive: { name: 'Olive Drab', ramp: 'olive', base: 0x616436, dark: 0x35351e, light: 0x999b5f },
  amber: { name: 'Safety Amber', ramp: 'glowAmber', base: 0xb27d34, dark: 0x825722, light: 0xd7a856 },
  red: { name: 'Stamp Red', ramp: 'stampRed', base: 0x8c2920, dark: 0x672319, light: 0xb13c2b },
  slate: { name: 'Slate Blue', ramp: 'slate', base: 0x3f5362, dark: 0x212d38, light: 0x759090 },
  cream: { name: 'Stencil Cream', ramp: 'paper', base: 0xc1b59b, dark: 0x8f856e, light: 0xe5dbc3 },
  teal: { name: 'Corps Teal', ramp: 'teal', base: 0x407162, dark: 0x1e3c40, light: 0x8aae92 },
  rust: { name: 'Oxide', ramp: 'rust', base: 0x9f4621, dark: 0x4e2817, light: 0xde8f4e },
  black: { name: 'Bakelite', ramp: 'basalt', base: 0x3f3d3f, dark: 0x18181b, light: 0x6a645e },
};
export const PAINT_IDS = Object.keys(PAINTS) as PaintId[];

const K = (kind: ContainerKind, name: string, short: string, grid: [number, number], foot: [number, number], h: number, accepts: ItemTag[], cost: Cost, desc: string, x: Partial<KindInfo> = {}): KindInfo =>
  ({ kind, name, short, grid, foot, h, accepts, cost, desc, power: 0, open: false, hp: 400, logo: 'unaa', color: 'olive', skill: 'works', ...x });

export const KIND_INFO: Record<ContainerKind, KindInfo> = {
  crate: K('crate', 'Wooden Crate', 'CRATE', [8, 4], [2, 1], 0.7, ['solid', 'seed', 'food'], { carbon: 8 },
    'Slatted timber, open at the top. Parts, wood, rocks, fruit: anything solid. Fruit still rots in it.', { open: true, logo: 'unaa', color: 'cream', hp: 300 }),
  st_bin: K('st_bin', 'Ammo Bin', 'BIN', [8, 5], [2, 1], 0.35, ['solid', 'bulk', 'ore', 'seed', 'food'], { ore: 16, carbon: 4 },
    'Two steel-strapped ammunition crates with the lids thrown back. Takes solids and bagged bulk: soil, ore, sand, gravel.', { logo: 'gear', color: 'olive', hp: 600 }),
  st_pit: K('st_pit', 'Soil Pit', 'PIT', [8, 4], [2, 1], 0.9, ['bulk'], { soil: 4, carbon: 6 },
    'A raised timber bed for loose earth: dirt, topsoil, clay, sand, gravel, compost, dung.', { open: true, logo: 'leaf', color: 'amber', hp: 500 }),
  st_bunker: K('st_bunker', 'Ore Bunker', 'BUNKER', [6, 6], [2, 2], 1.3, ['ore'], { ore: 10, soil: 12 },
    'Concrete barriers stood in a U, open at the front for the tipper. Ore, coal, rock and gravel by the tonne.', { open: true, logo: 'pick', color: 'rust', hp: 900 }),
  st_freezer: K('st_freezer', 'Cold Store', 'FREEZE', [6, 4], [2, 1], 2.0, ['cold', 'food', 'specimen', 'seed'], { ore: 20, copper_wire: 6, rubber: 2 },
    'An insulated cabinet with a compressor on its flank. Powered, nothing in it spoils: fruit, meat, tissue, eggs, embryos. Unpowered, it is just a box.', { power: 4, logo: 'flake', color: 'slate', hp: 500 }),
  st_tank: K('st_tank', 'Fluid Tank', 'TANK', [4, 4], [2, 2], 2.45, ['fluid'], { ore: 18, soil: 6 },
    'A standing pressure cylinder on a plinth. Water, brine, sap (it will not set in here), oils and fuels.', { logo: 'drop', color: 'teal', hp: 700 }),
  silo: K('silo', 'Grain Silo', 'SILO', [4, 8], [2, 2], 4.0, ['grain', 'bulk'], { iron_plate: 20, concrete: 10 },
    'A tall corrugated silo. Seed, feed, pellets, sand and gravel by the ton; feed and seed keep in the dry.', { logo: 'wheat', color: 'cream', hp: 900, skill: 'assembler' }),
  st_cabinet: K('st_cabinet', 'Specimen Cabinet', 'SPEC', [5, 6], [1, 1], 1.65, ['specimen', 'seed'], { ore: 10, glass: 4, carbon: 6 },
    'Drawers of fixative jars under open shelves. Samples, eggs and embryos keep in it indefinitely.', { power: 1, logo: 'flask', color: 'black', hp: 350 }),
  st_vault: K('st_vault', 'Seed Vault', 'VAULT', [6, 5], [2, 2], 1.6, ['seed'], { concrete: 10, ore: 12 },
    'A dry, sealed bunker for seed stock. While its dehumidifiers have power, seed keeps its viability forever.', { power: 2, logo: 'seed', color: 'teal', hp: 1000 }),
  hold: K('hold', 'Pod Hold', 'HOLD', [8, 5], [0, 0], 0, ['solid', 'bulk', 'ore', 'fluid', 'cold', 'specimen', 'seed', 'grain', 'food'], {},
    'Unit 07\'s own small hold, with a few cans for fluids. The arms unload it into containers in reach.', { logo: 'unaa', color: 'olive', hp: 0, skill: undefined }),
};
/** placeable container kinds, in the build menu's order */
export const CONTAINER_KINDS: ContainerKind[] = ['crate', 'st_bin', 'st_pit', 'st_bunker', 'st_tank', 'st_freezer', 'silo', 'st_cabinet', 'st_vault'];
export const isContainerKind = (k: string): k is ContainerKind => (KIND_INFO as Record<string, KindInfo>)[k] !== undefined && k !== 'hold';
export const LOGO_IDS: LogoId[] = ['unaa', 'leaf', 'gear', 'drop', 'flake', 'pick', 'seed', 'flask', 'bolt', 'hazard', 'paw', 'star', 'wheat', 'atom', 'cross', 'arrow'];
