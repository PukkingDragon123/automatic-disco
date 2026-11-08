import type { Container } from './container';
import type { ModelBuilder } from '../gfx/modelBuilder';

export type ItemCat =
  | 'food' | 'drink' | 'medical' | 'weapon' | 'tool' | 'clothing' | 'bag' | 'material' | 'electronics'
  | 'literature' | 'misc' | 'ammo' | 'key' | 'seed' | 'fuel' | 'light' | 'container' | 'lore' | 'trap' | 'corpse' | 'anomaly';

export type BodyPart =
  | 'head' | 'neck' | 'torso_u' | 'torso_l' | 'groin'
  | 'uarm_l' | 'uarm_r' | 'farm_l' | 'farm_r' | 'hand_l' | 'hand_r'
  | 'thigh_l' | 'thigh_r' | 'shin_l' | 'shin_r' | 'foot_l' | 'foot_r';

export const BODY_PARTS: BodyPart[] = ['head', 'neck', 'torso_u', 'torso_l', 'groin', 'uarm_l', 'uarm_r', 'farm_l', 'farm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'];

export type FluidType = 'water' | 'tainted' | 'almond' | 'gasoline' | 'bleach' | 'juice' | 'soda' | 'alcohol' | 'milk' | 'coolant' | 'static';

export interface FoodProps {
  hunger: number;            // hunger reduced (0..100 scale) for the whole item
  thirst?: number;           // thirst reduced (negative = makes you thirsty)
  calories: number;
  unhappy?: number;          // + makes unhappy, - cheers
  boredom?: number;
  stress?: number;
  fresh?: number;            // days fresh (undefined = never spoils)
  rot?: number;              // days until rotten
  cookable?: boolean;
  raw?: boolean;             // dangerous until cooked
  cookMins?: number;         // in-game minutes to cook
  canned?: boolean;          // sealed: needs a can opener (or knife/smash) to open
  openedInto?: string;
  poison?: number;           // 0..1 food poisoning severity
  alcohol?: number;
  lucidity?: number;
  ingredient?: 'veg' | 'meat' | 'fish' | 'fruit' | 'grain' | 'sauce' | 'spice' | 'dairy' | 'sweet' | 'egg' | 'weird';
  frozenOk?: boolean;
  /** cooked variant names */
  cookedName?: string;
  /** when eaten leaves this item behind (empty can, wrapper) */
  leaves?: string;
  pills?: boolean;
}

export interface WeaponProps {
  kind: 'blunt' | 'blade' | 'spear' | 'axe' | 'firearm' | 'thrown' | 'unarmed';
  dmg: [number, number];
  range: number;
  speed: number;             // attacks per second
  endurance: number;         // endurance cost per swing
  crit: number;
  knock: number;
  durability: number;
  twoHanded?: boolean;
  noise: number;             // tiles
  ammo?: string;
  mag?: number;
  reload?: number;           // seconds
  spread?: number;           // radians
  multiHit?: number;
  pierce?: boolean;
  fire?: boolean;            // molotov
}

export interface ClothingProps {
  slot: string;
  covers: BodyPart[];
  insulation: number;        // 0..1
  wind: number;              // 0..1
  bite: number;              // 0..100 protection
  scratch: number;
  water: number;             // 0..1 water resistance
  look: { part: 'torso' | 'legs' | 'feet' | 'head' | 'hands' | 'face' | 'back' | 'eyes'; tex: string; color: number; sleeve?: 'none' | 'short' | 'long'; hat?: string };
  rip?: string;              // item produced when ripped (bandage material)
  ripCount?: number;
  speed?: number;            // movement multiplier
}

export interface MedicalProps {
  type: 'bandage' | 'disinfect' | 'pill' | 'splint' | 'suture' | 'tweezers' | 'antibiotic' | 'painkiller' | 'sedative' | 'checksum' | 'antidepressant' | 'vitamins' | 'cold' | 'adrenaline';
  power?: number;
  sterile?: boolean;
}

export interface LightProps { range: number; intensity: number; color: number; drainPerHour: number; cone?: number; candle?: boolean; }

export interface BagProps { capacity: number; reduction: number; slot: 'back' | 'hand' | 'belt' | 'hip' }

export interface ItemDef {
  key: string;
  name: string;
  desc?: string;
  cat: ItemCat;
  weight: number;            // kg
  tags?: string[];
  model?: (mb: ModelBuilder) => void;
  /** tint colour for model/icon variations */
  tint?: number;
  food?: FoodProps;
  weapon?: WeaponProps;
  clothing?: ClothingProps;
  bag?: BagProps;
  medical?: MedicalProps;
  light?: LightProps;
  fluidCap?: number;         // litres
  fluids?: FluidType[];      // which fluids it can hold (default water-like)
  startFluid?: [FluidType, number];
  uses?: number;             // drainable uses (thread, tape, battery %)
  durability?: number;       // tool condition max (uses)
  literature?: { skill?: string; mult?: number; minLevel?: number; recipes?: string[]; boredom?: number; unhappy?: number; stress?: number; pages?: number; text?: string };
  lore?: string;             // lore entry id
  burn?: number;             // hours of fuel in fire
  seed?: string;             // crop key
  place?: string;            // object key created when placed
  /** salvage value in scrip (the debt currency); unset = derived by the debt system */
  value?: number;
  /** backpack-grid footprint in cells [w, h]; unset = derived by the inventory grid */
  grid?: [number, number];
  rare?: boolean;
  battery?: boolean;         // uses batteries
  radio?: { channels: number; range: number; twoWay?: boolean };
  ammoCount?: number;        // items in box
  heavy?: boolean;           // must be carried in hands (furniture etc.)
  noStack?: boolean;
  anomaly?: string;
  spawnCond?: number;        // [0..1] typical condition range min
}

export interface Item {
  uid: number;
  key: string;
  cond: number;              // 0..1 condition / durability
  age: number;               // in-game hours since creation (freshness)
  cooked?: number;           // 0..1 cooking progress (>=1 cooked, >=1.6 burnt)
  uses?: number;             // remaining fraction 0..1 (drainables)
  fluid?: { type: FluidType; amount: number } | null;
  inv?: Container | null;
  parent?: number;
  name?: string;
  wet?: number;
  bloody?: number;
  frozen?: number;           // 0..1
  ammo?: number;             // loaded rounds
  data?: Record<string, any>;
  eaten?: number;            // fraction already consumed
  opened?: boolean;
  /** grid placement inside its container (cell x, y; rot 1 = turned 90 degrees; gz = layer and rot 2..5 = orientations in the iron cube, src/items/grid.ts) */
  gx?: number;
  gy?: number;
  gz?: number;
  rot?: 0 | 1 | 2 | 3 | 4 | 5;
}

const REG = new Map<string, ItemDef>();
export function defItem(d: ItemDef): ItemDef { REG.set(d.key, d); return d; }
export function itemDef(key: string): ItemDef {
  const d = REG.get(key);
  if (!d) {
    const fallback: ItemDef = { key, name: key, cat: 'misc', weight: 0.2 };
    REG.set(key, fallback);
    console.warn('unknown item', key);
    return fallback;
  }
  return d;
}
export function hasItemDef(key: string) { return REG.has(key); }
export function allItemDefs(): ItemDef[] { return [...REG.values()]; }

export function itemWeight(it: Item): number {
  const d = itemDef(it.key);
  let w = it.data?.weight ?? d.weight;
  if (d.food && it.eaten) w *= Math.max(0.1, 1 - it.eaten);
  if (d.fluidCap && it.fluid) w += it.fluid.amount; // 1 L = 1 kg
  if (it.inv) w += it.inv.carriedWeight();
  if (it.wet) w *= 1 + it.wet * 0.3;
  return w;
}

export function itemName(it: Item): string {
  const d = itemDef(it.key);
  let n = it.name || d.name;
  if (d.food) {
    if (it.cooked !== undefined && it.cooked >= 1.6) n = 'Burnt ' + n;
    else if (it.cooked !== undefined && it.cooked >= 1) n = d.food.cookedName || 'Cooked ' + n;
    else if (d.food.raw) n = 'Raw ' + n;
    if (it.eaten && it.eaten > 0) n += ` (${Math.round((1 - it.eaten) * 100)}%)`;
  }
  if (d.fluidCap) {
    if (it.fluid && it.fluid.amount > 0.001) n += ` [${fluidName(it.fluid.type)} ${it.fluid.amount.toFixed(1)}L]`;
    else n += ' (Empty)';
  }
  return n;
}

export function fluidName(t: FluidType): string {
  return ({ water: 'Water', tainted: 'Tainted Water', almond: 'Bluecap', gasoline: 'Gasoline', bleach: 'Bleach', juice: 'Juice', soda: 'Soda', alcohol: 'Liquor', milk: 'Milk', coolant: 'Coolant', static: 'Liquid Static' } as Record<FluidType, string>)[t] || t;
}

/** freshness state from age in hours */
export function freshness(it: Item): 'fresh' | 'stale' | 'rotten' | 'none' {
  const f = itemDef(it.key).food;
  if (!f || f.fresh === undefined) return 'none';
  const days = it.age / 24;
  if (days < f.fresh) return 'fresh';
  if (days < (f.rot ?? f.fresh * 2)) return 'stale';
  return 'rotten';
}
