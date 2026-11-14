// What a design DOES. Pure logic shared by the gene lab (the specimen record's FUNCTIONS block and the role
// planner) and the field runtime: each functional gene becomes a line with a rate per minute, scaled by the gene's
// level (absorbing it again raises it), the body that carries it (square-cube: big diggers move more ground, big
// gizzards grind more rock, glands care less about size) and the control genes (docile and sterile workers work
// harder). Upkeep comes from the phenotype's metabolism plus what each organ costs to run.
import { GENE } from '../life/genes';
import { BIO, type BioFn, type FnKind, type FnGroup } from '../life/genesBio';
import { pheno, type Design, type Pheno } from '../life/design';
import { clamp } from '../core/rand';

/** a job a creature can be given in the field */
export type Job = 'auto' | 'dig' | 'channel' | 'mound' | 'spring' | 'produce' | 'eco' | 'farm' | 'haul' | 'operate' | 'guard' | 'troop' | 'habitat' | 'idle';
export const JOB_NAME: Record<Job, string> = {
  auto: 'AUTO', dig: 'DIG PIT', channel: 'DIG CHANNEL', mound: 'RAISE GROUND', spring: 'OPEN SPRING', produce: 'PRODUCE', eco: 'TEND LAND',
  farm: 'PASTURE', haul: 'HAUL', operate: 'OPERATE', guard: 'GUARD POST', troop: 'TROOP', habitat: 'HABITAT', idle: 'STAND DOWN',
};
export const JOB_DESC: Record<Job, string> = {
  auto: 'Do its main work wherever it stands: produce, tend or dig around its home.',
  dig: 'Click the ground: it digs a pit there. The soil comes home; a pit below the water line floods.',
  channel: 'Click two points: it digs a channel between them, down below the water line so water runs in.',
  mound: 'Click the ground: it raises a mound there. Walls, ramps and dams that walkers must go round.',
  spring: 'Click near where water should be: it noses out the groundwater and opens a spring that keeps running.',
  produce: 'Click a place to work: a seam or boulder for gizzards, sand for silica crops, anywhere for glands.',
  eco: 'Click the land to change: flood it, bind its sand, pollinate it, clear its pests or its carcasses.',
  farm: 'Click a pasture: the herd grazes there and yields every cycle.',
  haul: 'Carries the piles of distant producers home to the stores.',
  operate: 'Click a machine or a vat: it works the levers and the machine runs faster.',
  guard: 'Click a post: it holds there, fights what comes near and raises the alarm.',
  troop: 'Takes troop orders like a robot squad: move, attack, guard, patrol.',
  habitat: 'Lives in the nearest engineered habitat: contained, breeding, producing faster.',
  idle: 'Drop the job and roam.',
};
/** which jobs need a place picked on the ground (and how many points) */
export const JOB_PICK: Partial<Record<Job, number>> = { dig: 1, channel: 2, mound: 1, spring: 1, produce: 1, eco: 1, farm: 1, operate: 1, guard: 1 };

export interface FnLine {
  gene: string; fn: BioFn; level: number;
  /** output per minute (items, or m3 of ground) */
  rate: number;
  /** "PASSES 4.2 IRON PELLETS/MIN" */
  label: string;
}
export interface Profile {
  fns: FnLine[];
  /** food (fruit-equivalents) and water per minute */
  food: number; water: number;
  /** work-rate multiplier from control genes */
  work: number;
  docile: boolean; sterile: boolean; locked: boolean; fast: boolean;
  jobs: Job[];
  /** the job it does best (the AUTO job) */
  main: Job;
}

/** item display names (factory catalogue when loaded; these are the fallbacks) */
const ITEM_NAME: Record<string, string> = {
  iron_pellet: 'IRON PELLETS', glass_bead: 'GLASS BEADS', silk: 'SILK', bio_oil: 'BIO-OIL', resin: 'RESIN', crystal: 'QUARTZ CRYSTAL', protein: 'PROTEIN',
  algae_fuel: 'ALGAE FUEL', fruit: 'FRUIT', ore: 'ORE', soil: 'SOIL', water: 'WATER', carbon: 'CARBON',
};
export const itemName = (id: string) => ITEM_NAME[id] ?? id.toUpperCase().replace(/_/g, ' ');

const lvlMul = (lv: number) => [1, 1, 1.6, 2.2][clamp(Math.round(lv), 1, 3)];
/** how the body scales a function (100 kg = 1) */
function bodyMul(kind: FnKind, ph: Pheno): number {
  const m = Math.max(0.3, ph.stats.mass) / 100;
  switch (kind) {
    case 'dig': case 'tunnel': case 'mound': return clamp(Math.pow(m, 0.38), 0.3, 2.6);
    case 'ore': case 'silica': case 'decompose': return clamp(Math.pow(m, 0.3), 0.35, 2.2);
    case 'milk': case 'oil': case 'fleece': return clamp(Math.pow(m, 0.28), 0.4, 2);
    case 'haul': return clamp(Math.pow(m, 0.45), 0.25, 3);
    case 'crystal': return clamp(0.6 + ph.length * 0.25, 0.6, 1.6);
    case 'silk': case 'pollinate': case 'pest': return clamp(1.1 - m * 0.1, 0.7, 1.2);
    default: return 1;
  }
}
const fmtRate = (r: number) => (r >= 10 ? r.toFixed(0) : r >= 1 ? r.toFixed(1) : r.toFixed(2));

/** the functions and upkeep of a design (levels: gene id -> level 1..3) */
export function profileOf(d: Design, level: (id: string) => number = () => 1, ph: Pheno = pheno(d)): Profile {
  const has = (id: string) => d.genes.includes(id);
  const docile = has('docility'), sterile = has('sterile'), locked = has('gene_lock'), fast = has('growth_accel');
  const work = (docile ? 1 + 0.25 * lvlMul(level('docility')) : 1) * (sterile ? 1.2 : 1);
  const fns: FnLine[] = [];
  let organ = 0;
  for (const id of d.genes) {
    const b = BIO[id]; if (!b || b.plant) continue;
    const fn = b.fn, lv = level(id);
    organ += fn.cost;
    if (fn.group === 'control') continue;
    const rate = fn.rate * lvlMul(lv) * bodyMul(fn.kind, ph) * (fn.group === 'war' ? 1 : work);
    fns.push({ gene: id, fn, level: lv, rate, label: labelFor(fn, rate) });
  }
  const st = ph.stats;
  const food = 0.25 + st.upkeep * 3 + organ;
  const water = 0.15 + st.upkeep * 1.4 + (fns.some((f) => f.fn.kind === 'silk' || f.fn.kind === 'milk' || f.fn.kind === 'oil') ? 0.3 : 0);
  const jobs = jobsFor(fns);
  return { fns, food, water, work, docile, sterile, locked, fast, jobs, main: mainJob(fns) };
}
export function labelFor(fn: BioFn, rate: number): string {
  const r = fmtRate(rate);
  switch (fn.kind) {
    case 'dig': case 'tunnel': case 'mound': return `${fn.verb} ${r} M³ OF GROUND/MIN`;
    case 'spring': return `${fn.verb} SPRINGS · ${fmtRate(rate * 4)} WATER/MIN EACH`;
    case 'haul': return `${fn.verb} ${r} ITEMS/MIN`;
    case 'operate': return 'OPERATES A MACHINE · +50% SPEED';
    case 'guard': return 'GUARDS A POST · RAISES THE ALARM';
    case 'soldier': return 'TAKES TROOP ORDERS · +30% DAMAGE';
    case 'wetland': return `${fn.verb} ${r} M² OF MARSH/MIN`;
    case 'binder': return `${fn.verb} ${r} M² OF SAND/MIN`;
    case 'pollinate': return `${fn.verb} ${r} PLANTS/MIN · ORCHARDS +50%`;
    case 'pest': return `${fn.verb} ${r} PESTS/MIN`;
    default: return `${fn.verb} ${r} ${fn.item ? itemName(fn.item) : fn.unit}/MIN`;
  }
}
function jobsFor(fns: FnLine[]): Job[] {
  const s = new Set<Job>(['auto']);
  for (const f of fns) {
    switch (f.fn.kind) {
      case 'dig': case 'tunnel': s.add('dig'); s.add('channel'); break;
      case 'mound': s.add('mound'); break;
      case 'spring': s.add('spring'); break;
      case 'milk': case 'fleece': s.add('farm'); s.add('produce'); break;
      case 'haul': s.add('haul'); break;
      case 'operate': s.add('operate'); break;
      case 'guard': s.add('guard'); break;
      case 'soldier': s.add('troop'); break;
      default: s.add(f.fn.group === 'eco' ? 'eco' : 'produce');
    }
  }
  // every engineered creature can stand a post, be a soldier and live in a habitat
  s.add('guard'); s.add('troop'); s.add('habitat'); s.add('idle');
  return [...s];
}
function mainJob(fns: FnLine[]): Job {
  const order: FnGroup[] = ['produce', 'dig', 'eco', 'labour', 'war'];
  for (const g of order) {
    const f = fns.find((x) => x.fn.group === g); if (!f) continue;
    switch (f.fn.kind) {
      case 'dig': case 'tunnel': return 'dig';
      case 'mound': return 'mound';
      case 'spring': return 'spring';
      case 'milk': case 'fleece': return 'farm';
      case 'haul': return 'haul';
      case 'operate': return 'operate';
      case 'guard': return 'guard';
      case 'soldier': return 'troop';
      default: return g === 'eco' ? 'eco' : 'produce';
    }
  }
  return 'idle';
}
/** the functions a job uses, best first */
export function fnsForJob(p: Profile, job: Job): FnLine[] {
  const k = (f: FnLine) => f.fn.kind;
  switch (job) {
    case 'dig': case 'channel': return p.fns.filter((f) => k(f) === 'dig' || k(f) === 'tunnel').sort((a, b) => b.rate - a.rate);
    case 'mound': return p.fns.filter((f) => k(f) === 'mound');
    case 'spring': return p.fns.filter((f) => k(f) === 'spring');
    case 'farm': return p.fns.filter((f) => k(f) === 'milk' || k(f) === 'fleece');
    case 'produce': case 'habitat': return p.fns.filter((f) => f.fn.group === 'produce');
    case 'eco': return p.fns.filter((f) => f.fn.group === 'eco');
    case 'haul': return p.fns.filter((f) => k(f) === 'haul');
    case 'operate': return p.fns.filter((f) => k(f) === 'operate');
    case 'guard': return p.fns.filter((f) => k(f) === 'guard');
    case 'troop': return p.fns.filter((f) => k(f) === 'soldier');
    default: return [];
  }
}
/** "UPKEEP 1.2 FRUIT · 0.5 WATER /MIN" */
export const upkeepLabel = (p: Profile) => `UPKEEP ${fmtRate(p.food)} FRUIT · ${fmtRate(p.water)} WATER /MIN`;

// ================================================================================================ role planner
export type Role = 'producer' | 'digger' | 'troop' | 'worker' | 'terraformer' | 'farm';
export const ROLES: Role[] = ['producer', 'digger', 'terraformer', 'farm', 'worker', 'troop'];
export const ROLE_NAME: Record<Role, string> = { producer: 'PRODUCER', digger: 'DIGGER', troop: 'TROOP', worker: 'WORKER', terraformer: 'TERRAFORMER', farm: 'FARM HERD' };
interface RoleSpec { want: string[]; body: string[]; advice: string }
export const ROLE_SPEC: Record<Role, RoleSpec> = {
  producer: { want: ['ore_gizzard', 'silica_crop', 'silk_glands', 'oil_glands', 'crystal_coral', 'docility', 'sterile'], body: ['molars', 'radula', 'mandibles', 'ferment_gut', 'ectotherm', 'chloro_skin'], advice: 'Two producing organs, a herbivore mouth and a cheap metabolism. Mid-sized: big gizzards grind more, but eat more.' },
  digger: { want: ['dig_claws', 'tunnel_snout', 'water_finder', 'docility'], body: ['leg_plantigrade', 'hump', 'leg_pillar', 'fat_stores', 'molars'], advice: 'Heavy and thick-legged: ground moved scales with mass. Claws first, a snout for clay and roots.' },
  terraformer: { want: ['mound_glands', 'wetland_maker', 'soil_binder', 'water_finder', 'decomposer', 'dig_claws'], body: ['setae', 'mucus', 'tail_fin', 'scav_gut'], advice: 'Ecosystem changers: flood, bind, raise and enrich. Small and many beats big and few.' },
  farm: { want: ['milk_glands', 'fleece', 'docility', 'pollinator', 'pest_eater'], body: ['molars', 'ferment_gut', 'leg_hooved', 'live_birth', 'brood_care'], advice: 'A grazing herd: milk and fleece every cycle. Docile, herbivore, breeds in a habitat.' },
  worker: { want: ['hauler_back', 'operator_hands', 'docility', 'sterile'], body: ['leg_pillar', 'leg_hooved', 'hump', 'molars'], advice: 'Strong backs and fine hands: hauls far piles home and works machines and vats.' },
  troop: { want: ['soldier_caste', 'guard_instinct', 'growth_accel'], body: ['osteoderms', 'carapace_crab', 'horns', 'horns_ram', 'venom_fangs', 'stinger', 'quills', 'chela', 'carnassials', 'endotherm'], advice: 'The soldier switch, then armour and a weapon. Venom and thorns win long fights; plates win short ones.' },
};
export interface Suggestion { id: string; name: string; owned: boolean; installed: boolean; why: string; core: boolean }
/**
 * The genes the lab suggests for a role: functional organs first, then the body and combat genes that go with them.
 * `owned` asks the run; `fits` asks the lab rules (null when it can be grafted on).
 */
export function suggest(role: Role, d: Design, owned: (id: string) => boolean, fits: (id: string) => string | null, source: (id: string) => string): Suggestion[] {
  const spec = ROLE_SPEC[role];
  const out: Suggestion[] = [];
  const add = (id: string, core: boolean) => {
    if (!GENE[id] || out.some((s) => s.id === id)) return;
    const own = owned(id), inst = d.genes.includes(id), f = own ? fits(id) : null;
    out.push({ id, name: GENE[id].name, owned: own, installed: inst, core, why: inst ? 'GRAFTED' : !own ? source(id) : f ? f : 'READY TO GRAFT' });
  };
  for (const id of spec.want) add(id, true);
  for (const g of d.genes) for (const l of BIO[g]?.links ?? []) add(l, false);
  for (const id of spec.body) add(id, false);
  // installed first, then ready, then owned-but-locked, then unknown
  const rank = (s: Suggestion) => (s.installed ? 0 : s.owned && s.why === 'READY TO GRAFT' ? 1 : s.owned ? 2 : 3) + (s.core ? 0 : 0.5);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, 9);
}
/** how well a design fills a role, 0..1 (the planner's needle) */
export function roleScore(role: Role, d: Design): number {
  const spec = ROLE_SPEC[role];
  const core = spec.want.filter((g) => d.genes.includes(g)).length, body = spec.body.filter((g) => d.genes.includes(g)).length;
  const p = profileOf(d);
  const want = role === 'troop' ? (d.genes.includes('soldier_caste') ? 0.45 : 0) : Math.min(0.55, p.fns.filter((f) => ROLE_SPEC[role].want.includes(f.gene)).length * 0.3);
  return clamp(want + core * 0.08 + body * 0.08, 0, 1);
}
/** where a functional gene comes from, for the planner's "absorb ..." hints */
export function sourceNote(id: string): string {
  const b = BIO[id]; if (!b) return 'Absorb more creatures';
  if (b.skill && !b.src.marker.length) return 'Research it';
  return b.src.note.replace(/\.$/, '').toUpperCase();
}
