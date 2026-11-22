// EMPIRE · the data (plain JSON, saved with the run as `run.empire` by flow.ts) and the rules in numbers.
// One settlement per region of the planet. The live one is the region the game is playing; the others run on
// abstract rates (stock, production and consumption per minute, population, happiness) until the player comes back,
// when the change since the last visit is put into (or taken out of) the real stores.
export type Tier = 'outpost' | 'town' | 'city' | 'capital';
export type How = 'crash' | 'convoy' | 'drop';
export type BlocId = 'soviet' | 'prc';
export type LinkKind = 'road' | 'rail';
export type Treaty = 'none' | 'pact' | 'war';

export interface SettlementData {
  id: number;
  /** PRegion.id on the planet, and its seed (the works and stores are saved by seed) */
  region: number; seed: number;
  name: string;
  how: How;
  founded: number;
  /** the pod / field core in region metres (the next visit lands here) */
  pin: { x: number; z: number } | null;
  /** a game has been played here at least once (its works, stores and colony snapshot exist) */
  visited: boolean;
  tier: Tier;
  /** last known numbers (live: sampled; abstract: simulated) */
  pop: number; workers: number; crew: number; robots: number; buildings: number;
  happiness: number; food: number; power: { gen: number; draw: number };
  /** item stock in the settlement's own stores (not the pod hold, which travels with Unit 07) */
  stock: Record<string, number>;
  /** the stock when the settlement was last live: on the next visit stock - base is applied to the real stores */
  base: Record<string, number>;
  /** net items per minute (made - used) from the works when last live */
  rates: Record<string, number>;
  /** what is short right now (item ids, 'food', 'power', 'housing') */
  short: string[];
  /** creatures (species names) that came with a convoy and wait for the first visit to step out */
  arrivals: string[];
  garrison: number;
  /** abstract growth clock (s) */
  growT: number;
  /** the population when it was last live (growth since then becomes new workers on the next visit) */
  left?: number;
}
export interface LinkData { id: number; a: number; b: number; kind: LinkKind; built: number; km: number; dur: number }
export interface RouteData { id: number; from: number; to: number; item: string; amount: number; on: boolean; moved: number; note: string; t: number }
export interface ConvoyData {
  id: number; kind: 'settlers' | 'drop' | 'trade' | 'deal';
  /** settlement ids; -1 = the ship (drops) or a bloc (deals) */
  from: number; to: number;
  /** settlers and drops: the region being settled */
  region?: number;
  t: number; dur: number;
  cargo: Record<string, number>;
  settlers: string[];
  route?: number; bloc?: BlocId;
}
export interface DealData { give: string; giveN: number; get: string; getN: number; t: number; kept: number; missed: number }
export interface BlocData {
  id: BlocId;
  /** -100 (war footing) .. 100 (allied) */
  relation: number;
  treaty: Treaty;
  deal: DealData | null;
  /** regions where the player has cleared their base */
  cleared: number[];
  /** seconds to their next move (a raid at war, a proposal or a complaint otherwise) */
  moveT: number;
  since: number;
  gifts: number;
}
export interface LogLine { t: number; text: string; kind: 'good' | 'warn' | 'bad' | 'info' }
export interface EmpireData {
  v: 1;
  /** the empire clock: game seconds of play summed over every settlement */
  t: number;
  next: number;
  /** the seat of government (the settlement that can become the Capital) */
  seat: number;
  /** the settlement being played */
  live: number;
  settlements: SettlementData[];
  links: LinkData[];
  routes: RouteData[];
  convoys: ConvoyData[];
  blocs: BlocData[];
  /** UNAA credits (taxes, trade) */
  treasury: number;
  log: LogLine[];
}

// ------------------------------------------------------------------ the rules in numbers
export const TIERS: Tier[] = ['outpost', 'town', 'city', 'capital'];
export const TIER_NAME: Record<Tier, string> = { outpost: 'Outpost', town: 'Town', city: 'City', capital: 'Capital' };
/** what a tier needs (population, buildings) and what it gives (tax per head per minute, abstract output bonus) */
export const TIER_RULE: Record<Tier, { pop: number; bld: number; tax: number; out: number; desc: string }> = {
  outpost: { pop: 0, bld: 0, tax: 0.4, out: 1, desc: 'A pod or field core with a handful of hands. Gathers what the land gives and little more.' },
  town: { pop: 6, bld: 8, tax: 0.6, out: 1.1, desc: 'A working settlement: steady output, a real tax base, worth a road.' },
  city: { pop: 14, bld: 20, tax: 0.9, out: 1.2, desc: 'An industrial city. Needs the City Charter. Pays well and runs its works harder.' },
  capital: { pop: 24, bld: 35, tax: 1.2, out: 1.3, desc: 'The seat of the empire grown into a capital: the best output and the highest taxes.' },
};
/** convoys and trains: speed (km per game second), trip period (s), load per trip */
export const LINK_RULE: Record<LinkKind, { name: string; speed: number; period: number; load: number; buildPer: number; cost: Record<string, number>; desc: string }> = {
  road: { name: 'Road', speed: 14, period: 60, load: 20, buildPer: 26, cost: { 'gravel|rock_granite|rock_basalt|rock_sandstone|rock_limestone|sand': 4, 'plank|wood': 3 }, desc: 'A graded track with markers and fords. Convoys of carrier crawlers, slow and small.' },
  rail: { name: 'Rail', speed: 40, period: 25, load: 60, buildPer: 16, cost: { 'iron_rod': 4, 'steel_beam|iron_plate': 2 }, desc: 'A mag-rail on pylons. Trains are fast and carry three times as much.' },
};
/** the price of a settler convoy and of a pod drop from the ship */
export const CONVOY_COST: Record<string, number> = { 'iron_plate': 6, 'plank|wood': 10, 'circuit|copper_wire': 1 };
export const CONVOY_FOOD = 12; // meals of food sent with the settlers
export const DROP_COST = { credits: 120, standing: 10 };
export const DROP_ITEMS: Record<string, number> = { 'iron_plate': 8, 'circuit': 2 };
/** km on the planet (the regions are points on a sphere of this radius) */
export const PLANET_KM = 2400;
/** meals a head eats per minute (abstract settlements) */
export const MEALS_PER_HEAD = 0.25;

export const BLOC_NAME: Record<BlocId, string> = { soviet: 'Eurasian Concord', prc: 'Pacific Consortium' };
export const BLOC_SHORT: Record<BlocId, string> = { soviet: 'Concord', prc: 'Consortium' };
export const BLOC_COL: Record<BlocId | 'you', number> = { soviet: 0xd0703a, prc: 0x5fb0a4, you: 0xe8c050 };
export const BLOC_DESC: Record<BlocId, string> = {
  soviet: 'A disciplined bloc that works to a directive: graphite hulls, signal-orange bands, heavy armour and artillery. Slow to warm, slow to forget.',
  prc: 'A corporate bloc that counts everything: ceramic-white hulls, teal bands, fast raiders. Trades readily, breaks deals when it pays.',
};
/** the goods each bloc offers in a trade deal and what it wants for them */
export const BLOC_TRADE: Record<BlocId, { give: string; giveN: number; get: string; getN: number }[]> = {
  soviet: [{ give: 'steel_beam|iron_plate', giveN: 2, get: 'berries|fruit|tuber|protein', getN: 6 }, { give: 'coal', giveN: 8, get: 'plank|wood', getN: 8 }],
  prc: [{ give: 'circuit', giveN: 2, get: 'crystal|amethyst|malachite', getN: 2 }, { give: 'copper_wire', giveN: 6, get: 'fruit|berries|protein', getN: 6 }],
};
export const DEAL_PERIOD = 120;
export const GIFT_CR = 40;
export const PEACE_CR = 80;

export const relationWord = (r: number) => r <= -60 ? 'Hostile' : r <= -25 ? 'Cold' : r < -5 ? 'Wary' : r <= 15 ? 'Neutral' : r <= 40 ? 'Cordial' : r <= 70 ? 'Friendly' : 'Allied';
export const TREATY_WORD: Record<Treaty, string> = { none: 'No treaty', pact: 'Non-aggression pact', war: 'At war' };
