// MASTERY: five engineering paths, each with three sub-specialties. Mastery XP is earned by doing the work of a path
// (farming, engineering creatures, building power, producing, building robots); every level is one mastery point
// for that path, spent on perks. Perks unlock capabilities and multipliers that the other systems read through
// mod(key) / add(key) / has(id). Specialising costs something: points are scarce (a path tops out at 10, one
// sub-specialty costs 8 to finish), and at level 3 the path asks for a FOCUS: the two other sub-specialties lose
// their tier 3 and 4 perks for good. Several capstones carry a stated drawback.
export type PathId = 'plant' | 'bio' | 'energy' | 'industry' | 'robotics';
export const PATHS: PathId[] = ['plant', 'bio', 'energy', 'industry', 'robotics'];
export type IconKey = string;

export interface PathDef { id: PathId; name: string; short: string; code: string; motto: string; earn: string[]; icon: IconKey }
export interface SubDef { id: string; path: PathId; name: string; icon: IconKey; blurb: string }
export interface Perk {
  id: string; path: PathId; sub: string; tier: 1 | 2 | 3 | 4; name: string; icon: IconKey;
  /** what it does, one line */
  desc: string;
  /** effect lines and stated drawbacks */
  plus: string[]; minus?: string[];
  /** mastery points */
  cost: number;
  /** multiplier deltas (mod(key) = 1 + sum) and flat bonuses (add(key) = sum) */
  mods?: Record<string, number>; adds?: Record<string, number>;
  /** capability ids, legacy skill ids, logic feature ids it switches on */
  grants?: string[];
}

export const PATH: Record<PathId, PathDef> = {
  plant: { id: 'plant', name: 'PLANT ENGINEERING', short: 'PLANT', code: 'PE', motto: 'Fields, forests and the air the colony breathes.', icon: 'sprout',
    earn: ['Harvest crops, fruit, fibre and resin', 'Graft and plant engineered flora', 'Build planters, sprinklers and spreaders', 'Scan new plant species'] },
  bio: { id: 'bio', name: 'BIO ENGINEERING', short: 'BIO', code: 'BE', motto: 'Workers bred, built and kept alive.', icon: 'dna',
    earn: ['Design and print creatures', 'Fit robotic parts on workers', 'Breed and heal the herd', 'Scan new species'] },
  energy: { id: 'energy', name: 'ENERGY ENGINEERING', short: 'ENERGY', code: 'EE', motto: 'Every machine runs on what you generate.', icon: 'bolt',
    earn: ['Build generators, reactors and poles', 'Keep the grid supplied', 'Burn biomass for power', 'Scan vents and lumen crystal'] },
  industry: { id: 'industry', name: 'FULL INDUSTRIAL', short: 'INDUSTRY', code: 'FI', motto: 'Ore in, parts out, at scale.', icon: 'gear',
    earn: ['Mine, smelt and assemble', 'Build extractors and production lines', 'Ship items to the research vessel', 'Scan ore deposits'] },
  robotics: { id: 'robotics', name: 'ROBOTICS', short: 'ROBOTICS', code: 'RB', motto: 'Arms, drones and the logic that drives them.', icon: 'arm',
    earn: ['Install upgrades with the Upgrader', 'Build drones and robot works', 'Wire the node map', 'Research logic nodes'] },
};

export const SUBS: SubDef[] = [
  { id: 'agro', path: 'plant', name: 'AGRONOMY', icon: 'wheat', blurb: 'Crop yield, growth and harvest.' },
  { id: 'terra', path: 'plant', name: 'TERRAFORMING FLORA', icon: 'roots', blurb: 'Spread, soil and oxygen.' },
  { id: 'silva', path: 'plant', name: 'RESIN AND FIBRE', icon: 'resin', blurb: 'Trees as a material source.' },
  { id: 'gene', path: 'bio', name: 'GENE CRAFT', icon: 'dna', blurb: 'Better designs from the same genome.' },
  { id: 'cyborg', path: 'bio', name: 'CYBORG HUSBANDRY', icon: 'socket', blurb: 'Robotic parts on living workers.' },
  { id: 'medic', path: 'bio', name: 'PATHOLOGY', icon: 'cross', blurb: 'Disease, injury and recovery.' },
  { id: 'bioe', path: 'energy', name: 'BIO-ENERGY', icon: 'flame', blurb: 'Fuel from biomass.' },
  { id: 'reactor', path: 'energy', name: 'REACTOR', icon: 'core', blurb: 'Concentrated output, concentrated risk.' },
  { id: 'grid', path: 'energy', name: 'GRID', icon: 'pole', blurb: 'Distribution and storage.' },
  { id: 'extract', path: 'industry', name: 'EXTRACTION', icon: 'pick', blurb: 'Miners and deposits.' },
  { id: 'refine', path: 'industry', name: 'REFINING', icon: 'furnace', blurb: 'Smelting and alloys.' },
  { id: 'assembly', path: 'industry', name: 'ASSEMBLY', icon: 'gear', blurb: 'Parts, lines and throughput.' },
  { id: 'limbs', path: 'robotics', name: 'LIMBS', icon: 'arm', blurb: 'The pod\'s arms.' },
  { id: 'drones', path: 'robotics', name: 'DRONES', icon: 'drone', blurb: 'Flying hands.' },
  { id: 'logic', path: 'robotics', name: 'AUTOMATION', icon: 'nodes', blurb: 'The node map, deeper.' },
];
export const SUB: Record<string, SubDef> = Object.fromEntries(SUBS.map((s) => [s.id, s]));

/** level needed for each tier */
export const TIER_LV: Record<1 | 2 | 3 | 4, number> = { 1: 1, 2: 3, 3: 5, 4: 8 };
/** the level at which a path asks for its focus */
export const FOCUS_LV = 3;

const P = (id: string, sub: string, tier: 1 | 2 | 3 | 4, name: string, icon: IconKey, desc: string, plus: string[], o: Partial<Perk> = {}): Perk =>
  ({ id, path: SUB[sub].path, sub, tier, name, icon, desc, plus, cost: tier === 1 ? 1 : tier === 4 ? 3 : 2, ...o });

export const PERKS: Perk[] = [
  // ---------------------------------------------------------------- PLANT
  P('agro_furrow', 'agro', 1, 'Furrow Logic', 'sprout', 'Fields are laid in rows the planters can follow.', ['+15% crop yield'], { mods: { 'crop.yield': 0.15 } }),
  P('agro_drip', 'agro', 2, 'Drip Lines', 'drop', 'Sprinklers feed roots, not air.', ['+20% crop growth', 'Sprinklers reach 30% further'], { mods: { 'crop.growth': 0.2, 'sprinkler.reach': 0.3 } }),
  P('agro_mono', 'agro', 3, 'Monoculture', 'wheat', 'One crop per field, tuned to the soil.', ['+40% yield on single-crop fields'], { minus: ['Blight spreads twice as fast'], mods: { 'crop.yield': 0.4, 'blight.spread': 1 } }),
  P('agro_engine', 'agro', 4, 'Harvest Engine', 'harvester', 'Fields harvest and replant themselves.', ['Workers harvest and replant without orders', '+25% crop yield'], { minus: ['Crops drink 30% more water'], mods: { 'crop.yield': 0.25, 'crop.water': 0.3 }, grants: ['cap.autoharvest'] }),
  P('terra_bind', 'terra', 1, 'Soil Binders', 'roots', 'Engineered roots hold and enrich the ground.', ['Dug ground recovers fertility', '+10% flora spread'], { mods: { 'flora.spread': 0.1 }, grants: ['cap.soilbind'] }),
  P('terra_spore', 'terra', 2, 'Pioneer Spores', 'spore', 'Grafted plants seed outward on the wind.', ['+40% flora spread'], { mods: { 'flora.spread': 0.4 } }),
  P('terra_canopy', 'terra', 3, 'Oxygen Canopy', 'tree', 'Grafted plants are tuned to breathe for the colony.', ['+30% oxygen from plants'], { minus: ['Wild grazers are drawn to the canopy'], mods: { 'oxygen.out': 0.3, 'grazer.lure': 1 } }),
  P('terra_press', 'terra', 4, 'Biome Press', 'globe', 'The ground around the works turns to a biome you choose.', ['Convert the biome around the colony', '+20% crop growth everywhere'], { minus: ['Native species leave: bio scans pay 30% less'], mods: { 'crop.growth': 0.2, 'scan.bio': -0.3 }, grants: ['cap.biomepress'] }),
  P('silva_tap', 'silva', 1, 'Tapping', 'resin', 'Spiles and cups on every resin tree.', ['+25% resin and sap'], { mods: { 'resin.yield': 0.25 } }),
  P('silva_ret', 'silva', 2, 'Fibre Retting', 'fibre', 'Soaked stems split into long fibre.', ['+30% fibre and leaves'], { mods: { 'fibre.yield': 0.3 } }),
  P('silva_rotate', 'silva', 3, 'Timber Rotation', 'log', 'Felling follows a replanting rota.', ['Felled trees regrow in half the time', '+20% wood'], { mods: { 'tree.regrow': 1, 'wood.yield': 0.2 } }),
  P('silva_lumber', 'silva', 4, 'Living Lumber', 'sapling', 'Frames grown as trees instead of cut from them.', ['All wood costs 30% less'], { minus: ['Grown structures take double fire damage'], mods: { 'wood.cost': -0.3, 'fire.damage': 1 } }),
  // ---------------------------------------------------------------- BIO
  P('gene_clean', 'gene', 1, 'Clean Splice', 'dna', 'Fewer junk sequences per design.', ['+1 gene slot per design'], { adds: { 'gene.slots': 1 } }),
  P('gene_direct', 'gene', 2, 'Directed Mutation', 'flask', 'Mutations are nudged toward function.', ['Bred offspring keep useful functions', '+15% print speed'], { mods: { 'print.speed': 0.15 }, grants: ['cap.directedmut'] }),
  P('gene_vigour', 'gene', 3, 'Hybrid Vigour', 'heart', 'Crossed lines come out stronger.', ['+20% worker health and work speed'], { minus: ['+15% worker food upkeep'], mods: { 'worker.hp': 0.2, 'worker.speed': 0.2, 'worker.upkeep': 0.15 } }),
  P('gene_apex', 'gene', 4, 'Apex Template', 'claw', 'One design is raised to the limit of its genome.', ['Your newest design gets double strength'], { minus: ['Only one apex design at a time'], grants: ['cap.apex'] }),
  P('cyb_socket', 'cyborg', 1, 'Neural Socket', 'socket', 'A standard port behind the skull.', ['Workers take one more robotic part'], { adds: { 'worker.parts': 1 } }),
  P('cyb_damper', 'cyborg', 2, 'Pain Dampers', 'brain', 'Implants mute the ache of hard labour.', ['Fitted workers lose morale half as fast'], { mods: { 'worker.morale': 0.5 } }),
  P('cyb_servo', 'cyborg', 3, 'Servo Muscles', 'muscle', 'Actuators alongside living muscle.', ['Fitted workers carry 50% more', '+10% worker speed'], { mods: { 'worker.carry': 0.5, 'worker.speed': 0.1 } }),
  P('cyb_full', 'cyborg', 4, 'Full Conversion', 'chip', 'The body becomes a chassis.', ['Converted workers need no food'], { minus: ['They draw 2 MW each and cannot breed'], grants: ['cap.fullconvert'] }),
  P('med_triage', 'medic', 1, 'Field Triage', 'cross', 'Splints, sutures and a protocol.', ['Injured workers heal 50% faster'], { mods: { 'worker.heal': 0.5 } }),
  P('med_quar', 'medic', 2, 'Quarantine Protocol', 'shield', 'Isolation pens and early screening.', ['Disease spreads 50% slower', 'Outbreaks are flagged early'], { mods: { 'disease.resist': 0.5 } }),
  P('med_vax', 'medic', 3, 'Vaccine Vats', 'vial', 'Antibodies grown from the last outbreak.', ['Immune to a disease once it has struck'], { mods: { 'disease.resist': 0.5 }, grants: ['cap.vaccine'] }),
  P('med_regrow', 'medic', 4, 'Regrowth', 'regrow', 'A dead worker\'s genome is kept on file.', ['Regrow one dead worker per day'], { minus: ['Regrown workers start at zero morale'], grants: ['cap.regrow'] }),
  // ---------------------------------------------------------------- ENERGY
  P('bioe_digest', 'bioe', 1, 'Digester Tuning', 'flame', 'Bacteria cultures matched to the feedstock.', ['Bio-reactors burn 25% less fuel'], { mods: { 'fuel.burn': -0.25 } }),
  P('bioe_algae', 'bioe', 2, 'Algae Ponds', 'pond', 'Shallow ponds of oil-rich algae.', ['+20% bio-fuel output', 'Algae fuel recipes'], { mods: { 'biofuel.out': 0.2 }, grants: ['bt_reactor'] }),
  P('bioe_methane', 'bioe', 3, 'Methane Capture', 'bubbles', 'Domes over the dung pits.', ['Dung and carcasses become fuel automatically'], { grants: ['cap.methane'] }),
  P('bioe_battery', 'bioe', 4, 'Living Battery', 'battery', 'Electric organs grown in tanks.', ['+400 MJ grid storage'], { minus: ['The tanks must be fed protein'], adds: { 'grid.storage': 400 } }),
  P('rx_loop', 'reactor', 1, 'Hot Loop', 'steam', 'Superheated steam, tighter seals.', ['+15% steam generator output'], { mods: { 'power.out': 0.15 } }),
  P('rx_rods', 'reactor', 2, 'Moderator Rods', 'rods', 'Finer control of the pile.', ['+25% reactor output'], { mods: { 'reactor.out': 0.25 } }),
  P('rx_over', 'reactor', 3, 'Overclock', 'gauge', 'The safety margin, spent.', ['Reactors may run at 150%'], { minus: ['Reactor faults three times as likely'], mods: { 'reactor.out': 0.5, 'reactor.fault': 2 } }),
  P('rx_grav', 'reactor', 4, 'Gravium Core', 'core', 'A gravium lattice in the core.', ['+100% reactor output'], { minus: ['A meltdown flattens everything within 12 m'], mods: { 'reactor.out': 1, 'meltdown.radius': 1 } }),
  P('grid_copper', 'grid', 1, 'Copper Discipline', 'pole', 'Cleaner runs, fewer joins.', ['Power poles reach 30% further'], { mods: { 'pole.reach': 0.3 } }),
  P('grid_shed', 'grid', 2, 'Load Shedding', 'switch', 'Priorities on every breaker.', ['Short power stops low-priority machines first'], { grants: ['cap.loadshed'] }),
  P('grid_cap', 'grid', 3, 'Capacitor Banks', 'capacitor', 'Stored charge for nights and spikes.', ['+300 MJ grid storage', '-10% power draw'], { adds: { 'grid.storage': 300 }, mods: { 'power.draw': -0.1 } }),
  P('grid_wireless', 'grid', 4, 'Wireless Grid', 'arcs', 'Resonant transfer from the pod.', ['Machines within 20 m of the pod need no poles'], { minus: ['Storms drain stored charge'], grants: ['cap.wireless'] }),
  // ---------------------------------------------------------------- INDUSTRY
  P('ex_bits', 'extract', 1, 'Bit Sharpening', 'drill', 'A grinding rota for every bit.', ['+15% mining rate'], { mods: { 'mine.rate': 0.15 } }),
  P('ex_seam', 'extract', 2, 'Seam Reading', 'lens', 'Core samples before the first cut.', ['Deposits show richness', '+10% ore per seam'], { mods: { 'mine.yield': 0.1 }, grants: ['cap.seamread'] }),
  P('ex_strip', 'extract', 3, 'Strip Mining', 'pick', 'Take the whole face, not the vein.', ['+50% mining rate'], { minus: ['Mining scars kill nearby plants and anger herds'], mods: { 'mine.rate': 0.5, 'mine.scar': 1 } }),
  P('ex_deep', 'extract', 4, 'Deep Core', 'shaft', 'Shafts below the reach of surface miners.', ['Miners work rare-tier deposits', '+20% mining rate'], { mods: { 'mine.rate': 0.2 }, grants: ['bore', 'miner3'] }),
  P('rf_clean', 'refine', 1, 'Clean Burn', 'furnace', 'Better draught, less waste.', ['Smelters use 20% less fuel'], { mods: { 'smelt.fuel': -0.2 } }),
  P('rf_alloy', 'refine', 2, 'Alloy Tables', 'ingot', 'Mixtures written down and repeated.', ['Steel and alloy recipes', '+10% smelting speed'], { mods: { 'craft.speed': 0.1 }, grants: ['steam'] }),
  P('rf_slag', 'refine', 3, 'Slag Recovery', 'slag', 'Nothing leaves the furnace unused.', ['One smelt in five yields a free ingot'], { mods: { 'smelt.bonus': 0.2 } }),
  P('rf_blast', 'refine', 4, 'Blast Furnace Doctrine', 'blast', 'Heat as policy.', ['+60% smelting speed'], { minus: ['Heat and smog: worker morale -10%'], mods: { 'smelt.speed': 0.6, 'worker.morale': -0.1 } }),
  P('as_jigs', 'assembly', 1, 'Jigs and Fixtures', 'wrench', 'Every part held the same way every time.', ['+15% assembler speed'], { mods: { 'craft.speed': 0.15 } }),
  P('as_std', 'assembly', 2, 'Standard Parts', 'bolt', 'One bolt size, one beam length.', ['Buildings cost 10% less'], { mods: { 'build.cost': -0.1 } }),
  P('as_night', 'assembly', 3, 'Night Shift', 'moon', 'The lines never stop.', ['Machines run at full speed without operators'], { minus: ['+20% worker food upkeep'], mods: { 'worker.upkeep': 0.2 }, grants: ['cap.nightshift'] }),
  P('as_full', 'assembly', 4, 'Full Industrial', 'factory', 'The colony is a factory with a pod in it.', ['+30% all production'], { minus: ['Bio scans pay 25% less'], mods: { 'craft.speed': 0.3, 'mine.rate': 0.3, 'scan.bio': -0.25 } }),
  // ---------------------------------------------------------------- ROBOTICS
  P('lb_hydro', 'limbs', 1, 'Hydraulic Lines', 'piston', 'Higher pressure, shorter strokes.', ['Arms move 20% faster'], { mods: { 'arm.speed': 0.2 } }),
  P('lb_tele', 'limbs', 2, 'Telescoping', 'telescope', 'Nested sections in every boom.', ['Arms reach 30% further'], { mods: { 'arm.reach': 0.3 } }),
  P('lb_socket', 'limbs', 3, 'Extra Socket', 'armsocket', 'A new mount ring on the pod.', ['One more arm socket'], { adds: { 'arm.sockets': 1 } }),
  P('lb_hands', 'limbs', 4, 'Many Hands', 'arms', 'Each arm runs its own routine.', ['Arms work without being driven'], { minus: ['Arms draw 50% more power'], mods: { 'arm.power': 0.5 }, grants: ['cap.autoarms'] }),
  P('dr_gyro', 'drones', 1, 'Gyro Trim', 'drone', 'Balanced rotors, longer flights.', ['Drones fly 20% faster'], { mods: { 'drone.speed': 0.2 } }),
  P('dr_swarm', 'drones', 2, 'Swarm Link', 'swarm', 'Drones share one control channel.', ['+1 drone'], { adds: { 'drone.count': 1 } }),
  P('dr_work', 'drones', 3, 'Drone Workers', 'crate', 'Grippers and a cargo hook.', ['Drones haul and build like workers'], { grants: ['cap.dronework'] }),
  P('dr_hive', 'drones', 4, 'Hive Mind', 'hive', 'The swarm thinks as one.', ['+2 drones', 'Drones repair themselves'], { minus: ['Drones are grounded in storms'], adds: { 'drone.count': 2 }, grants: ['cap.droneheal'] }),
  P('lg_nodes', 'logic', 1, 'Node Literacy', 'nodes', 'Split and merge on the node map.', ['Splitter and merger nodes'], { grants: ['logic.split', 'logic.merge'] }),
  P('lg_gates', 'logic', 2, 'Sensors and Gates', 'sensor', 'Routes that look before they move.', ['Sensor and gate nodes', 'Route conditions'], { grants: ['logic.sensor', 'logic.gate', 'routes.conditions'] }),
  P('lg_tpl', 'logic', 3, 'Templates', 'template', 'Save a working layout, lay it again.', ['Node templates', 'Timer and counter nodes'], { grants: ['routes.templates', 'logic.timer', 'logic.counter'] }),
  P('lg_auto', 'logic', 4, 'Colony Autopilot', 'auto', 'The network repairs its own routes.', ['Workers re-route around broken nodes', '+15% worker speed on routes'], { minus: ['The node map overrides direct orders'], mods: { 'worker.speed': 0.15 }, grants: ['cap.autopilot', 'logic.buffer'] }),
];
export const PERK: Record<string, Perk> = Object.fromEntries(PERKS.map((p) => [p.id, p]));

/** cumulative XP needed to reach each level (index = level) */
export const LV_XP = [0, 60, 160, 300, 480, 700, 980, 1300, 1680, 2120, 2600];
export const MAX_LV = 10;
export function levelFor(xp: number) { let l = 0; while (l < MAX_LV && xp >= LV_XP[l + 1]) l++; return l; }

export interface XpNote { path: PathId; n: number; why: string; t: number }
type Ev = 'level' | 'perk' | 'xp' | 'focus';

export class Mastery {
  private xpv: Record<PathId, number> = { plant: 0, bio: 0, energy: 0, industry: 0, robotics: 0 };
  private owned = new Set<string>();
  private foci: Partial<Record<PathId, string>> = {};
  /** recent XP, newest first (for the tree screen) */
  log: XpNote[] = [];
  private pend = new Map<string, XpNote>();
  private fns: Record<string, ((d: any) => void)[]> = {};
  private cacheM: Record<string, number> | null = null; private cacheA: Record<string, number> | null = null;
  /** game time source for the log */
  now: () => number = () => performance.now() / 1000;
  /** gain multiplier per path (specialising: set by perks/focus) */
  private boost: Partial<Record<PathId, number>> = {};

  on(ev: Ev, fn: (d: any) => void) { (this.fns[ev] ??= []).push(fn); return () => { const a = this.fns[ev]; const i = a?.indexOf(fn) ?? -1; if (i >= 0) a!.splice(i, 1); }; }
  private emit(ev: Ev, d: any) { for (const f of this.fns[ev] ?? []) { try { f(d); } catch (e) { console.error('mastery', ev, e); } } }

  xp(path: PathId) { return this.xpv[path] ?? 0; }
  level(path: PathId) { return levelFor(this.xp(path)); }
  /** progress to the next level, 0..1 */
  frac(path: PathId) { const l = this.level(path); if (l >= MAX_LV) return 1; const a = LV_XP[l], b = LV_XP[l + 1]; return (this.xp(path) - a) / (b - a); }
  /** points earned on a path (one per level) minus points spent there */
  points(path: PathId) { let spent = 0; for (const id of this.owned) { const p = PERK[id]; if (p?.path === path) spent += p.cost; } return this.level(path) - spent; }
  spent(path: PathId) { let s = 0; for (const id of this.owned) { const p = PERK[id]; if (p?.path === path) s += p.cost; } return s; }
  has(id: string) {
    if (this.owned.has(id)) return true;
    // a capability or feature id granted by an owned perk
    for (const o of this.owned) if (PERK[o]?.grants?.includes(id)) return true;
    return false;
  }
  perks() { return [...this.owned]; }
  focus(path: PathId) { return this.foci[path] ?? null; }
  /** a multiplier: 1 + the sum of owned perks' deltas for key */
  mod(key: string) { this.cacheM ??= this.sum('mods'); return 1 + (this.cacheM[key] ?? 0); }
  /** a flat bonus: the sum of owned perks' adds for key */
  add(key: string) { this.cacheA ??= this.sum('adds'); return this.cacheA[key] ?? 0; }
  private sum(f: 'mods' | 'adds') { const o: Record<string, number> = {}; for (const id of this.owned) { const m = PERK[id]?.[f]; if (m) for (const k in m) o[k] = (o[k] ?? 0) + m[k]; } return o; }

  /** XP for doing a path's work (small amounts are pooled so the log stays readable) */
  gain(path: PathId, n: number, why = '') {
    if (!(n > 0) || !PATH[path]) return;
    n *= this.boost[path] ?? 1;
    // specialisation: a focused path learns 15% faster, unfocused paths learn normally
    if (this.foci[path]) n *= 1.15;
    const before = this.level(path);
    this.xpv[path] += n;
    const key = path + '|' + why, t = this.now();
    const p = this.pend.get(key);
    if (p && t - p.t < 8) p.n += n; else { const e = { path, n, why, t }; this.pend.set(key, e); this.log.unshift(e); if (this.log.length > 40) this.log.length = 40; }
    this.emit('xp', { path, n, why });
    const after = this.level(path);
    if (after > before) this.emit('level', { path, level: after });
  }
  /** why a perk can't be taken now (null: it can) */
  why(id: string): string | null {
    const p = PERK[id]; if (!p) return 'Unknown';
    if (this.owned.has(id)) return 'Installed';
    const lv = this.level(p.path), need = TIER_LV[p.tier];
    if (lv < need) return `Needs ${PATH[p.path].short} level ${need}`;
    const f = this.foci[p.path];
    if (p.tier >= 3 && f && f !== p.sub) return `Locked: focus is ${SUB[f].name}`;
    if (p.tier >= 3 && !f) return `Choose a focus first`;
    if (p.tier > 1) { const prev = PERKS.find((q) => q.sub === p.sub && q.tier === p.tier - 1); if (prev && !this.owned.has(prev.id)) return `Needs ${prev.name}`; }
    if (this.points(p.path) < p.cost) return `Needs ${p.cost} point${p.cost > 1 ? 's' : ''}`;
    return null;
  }
  take(id: string) {
    if (this.why(id)) return false;
    this.owned.add(id); this.cacheM = this.cacheA = null;
    this.emit('perk', { id, perk: PERK[id] });
    return true;
  }
  /** focus can be chosen once per path, from level FOCUS_LV */
  canFocus(path: PathId) { return !this.foci[path] && this.level(path) >= FOCUS_LV; }
  setFocus(path: PathId, sub: string) {
    if (!this.canFocus(path) || SUB[sub]?.path !== path) return false;
    this.foci[path] = sub; this.emit('focus', { path, sub });
    return true;
  }
  /** debug / tests */
  setXp(path: PathId, xp: number) { this.xpv[path] = xp; }
  grantPerk(id: string) { if (PERK[id]) { this.owned.add(id); this.cacheM = this.cacheA = null; } }
  toJSON() { return { xp: { ...this.xpv }, perks: [...this.owned], foci: { ...this.foci } }; }
  load(d: any) {
    if (!d || typeof d !== 'object') return;
    for (const p of PATHS) this.xpv[p] = Math.max(0, Number(d.xp?.[p]) || 0);
    this.owned = new Set((Array.isArray(d.perks) ? d.perks : []).filter((x: string) => PERK[x]));
    this.foci = {}; for (const p of PATHS) if (SUB[d.foci?.[p]]?.path === p) this.foci[p] = d.foci[p];
    this.cacheM = this.cacheA = null;
  }
}
