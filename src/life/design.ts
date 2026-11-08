// A design is a heritable body: plan, proportions, colours and genes. Stats follow from anatomy with a few hard
// biological rules (square-cube leg loading, tracheal size limit on exoskeletons, wing loading for flight).
import { GENE, PLAN_LEGS, PLAN_LINEAGE, ZERO_STATS, type Diet, type Lineage, type Plan, type Stats } from './genes';
import { Rand, clamp, lerp } from '../core/rand';
import { binomial } from '../world/plantArt';
import { mixHex, scaleHex } from '../limbo/gfx/pixel';
import type { Palette } from '../world/palette';

export type Pattern = 'plain' | 'stripes' | 'spots' | 'bands' | 'mottled' | 'saddle' | 'rings';
export type Cover = 'chitin' | 'fur' | 'scales' | 'skin' | 'slime';
export interface Colors { base: number; belly: number; pattern: number; accent: number; eye: number }
export interface Design {
  name: string; latin: string;
  plan: Plan; lineage: Lineage;
  genes: string[];
  /** 0..1 sliders, read per plan by morph */
  size: number; len: number; girth: number; legLen: number; legThick: number; neck: number; head: number; tail: number;
  segs: number;
  colors: Colors; pattern: Pattern; patScale: number; cover: Cover;
  seed: number;
}

export interface Pheno {
  stats: Stats; diet: Diet; length: number; height: number;
  warnings: string[];
  /** biomass to grow one, seconds to grow */
  cost: number; buildTime: number;
  canFly: boolean;
}

/** body length range (m) per plan at size 0..1 */
export const PLAN_LEN: Record<Plan, [number, number]> = {
  hexapod: [0.22, 1.4], octopod: [0.25, 1.5], quadruped: [0.6, 4.2], biped: [0.9, 4.4], hexapodV: [1.2, 4.6], serpent: [1.2, 5.5], gastropod: [0.35, 1.8], hominid: [1.7, 1.9],
};

export function bodyLength(d: Design) {
  const [a, b] = PLAN_LEN[d.plan];
  let L = lerp(a, b, Math.pow(d.size, 1.3)) * lerp(0.85, 1.15, d.len);
  if (d.lineage === 'arthropod' && d.genes.includes('tracheal')) L *= 1.55;
  return L;
}

export function pheno(d: Design): Pheno {
  const s = ZERO_STATS();
  const warnings: string[] = [];
  const L = bodyLength(d);
  const W = L * lerp(0.22, 0.42, d.girth) * (d.plan === 'serpent' ? 0.35 : 1);
  const H = W * (d.plan === 'gastropod' ? 0.8 : d.lineage === 'arthropod' ? 0.6 : 1.05);
  const fill = d.plan === 'serpent' ? 0.8 : 0.55;
  const mass = Math.max(0.3, 1000 * L * W * H * fill * (d.lineage === 'arthropod' ? 0.7 : 1));
  s.mass = mass;
  for (const id of d.genes) {
    const g = GENE[id]; if (!g?.fx) continue;
    for (const k in g.fx) (s as any)[k] += (g.fx as any)[k];
  }
  // diet from mouthparts
  const diets = d.genes.map((g) => GENE[g]?.diet).filter(Boolean) as Diet[];
  let diet: Diet = diets[0] ?? 'herb';
  if (diets.includes('carn') && diets.includes('herb')) diet = 'omni';
  if (d.genes.includes('scav_gut') && diet === 'herb') diet = 'scav';
  // limbs and locomotion
  const legGene = d.genes.find((g) => PLAN_LEGS[d.plan].includes(g));
  const legCount = { hexapod: 6, octopod: 8, quadruped: 4, biped: 2, hexapodV: 6, serpent: 0, gastropod: 0, hominid: 2 }[d.plan];
  const legLenM = L * lerp(0.25, 0.75, d.legLen) * (d.plan === 'biped' || d.plan === 'hominid' ? 1.3 : 1);
  if (!legGene && legCount > 0) warnings.push('No walking limbs: it can only drag itself.');
  let speed = s.speed * lerp(0.75, 1.3, d.legLen) * Math.pow(Math.max(0.3, L), 0.25);
  if (d.plan === 'serpent') speed = 1.6 + s.speed + L * 0.35;
  if (d.plan === 'gastropod') speed = 0.6 + s.speed * 0.6;
  // square-cube: leg cross-section must keep up with mass^(2/3)
  if (legCount > 0) {
    const thick = lerp(0.05, 0.16, d.legThick) * L * (d.lineage === 'arthropod' ? 0.55 : 1);
    const area = thick * thick * legCount;
    const need = Math.pow(mass, 2 / 3) * (d.lineage === 'arthropod' ? 0.00012 : 0.00018);
    const load = need / area;
    if (load > 1.15) { speed /= Math.min(3, load); s.stamina -= 10 * load; warnings.push(`Legs too thin for ${Math.round(mass)} kg: ${Math.round((1 - 1 / Math.min(3, load)) * 100)}% slower.`); }
    if (load < 0.45 && d.legThick > 0.7) { speed *= 0.9; warnings.push('Over-built legs: heavy and slow to swing.'); }
  }
  // exoskeletons do not scale: tracheae limit size
  if (d.lineage === 'arthropod' && L > 1.1 && !d.genes.includes('tracheal')) {
    const k = (L - 1.1) * 1.6;
    s.stamina -= 20 * k; speed *= 1 / (1 + k * 0.6);
    warnings.push('Tracheae cannot oxygenate a shell this large: it tires fast.');
  }
  // flight
  let canFly = false;
  if (s.fly > 0) {
    const limit = d.genes.includes('wing_gossamer') ? 5 : 45;
    if (mass <= limit) { canFly = true; speed = Math.max(speed, 3.5 + s.fly); }
    else warnings.push(`Too heavy to fly (${Math.round(mass)} kg; wings lift ${limit} kg).`);
  }
  s.speed = clamp(speed, 0.4, 13);
  s.hp = Math.round(15 + 9 * Math.pow(mass, 0.62) + s.hp);
  s.armor = clamp(s.armor, 0, 0.75);
  s.attack = Math.max(1, (1.5 + s.attack) * Math.pow(mass, 0.28) * 0.55);
  s.attackRate = clamp(0.7 + s.attackRate, 0.3, 2.4);
  s.reach = 0.25 + L * 0.28 + s.reach;
  s.sight = 7 + s.sight * lerp(0.8, 1.2, d.head);
  s.smell = 4 + s.smell;
  s.stealth = clamp(s.stealth + (1 - Math.min(1, L / 3)) * 0.2, 0, 0.9);
  const endo = d.genes.includes('endotherm') ? 1.6 : d.genes.includes('ectotherm') ? 0.7 : 1;
  s.upkeep = Math.max(0.005, 0.01 + Math.pow(mass, 0.75) * 0.004 * endo + s.upkeep * Math.pow(mass, 0.3));
  s.regen = Math.max(0.1, 0.4 + s.regen) * (endo > 1 ? 1.3 : 1);
  s.stamina = Math.max(10, 50 + s.stamina);
  s.litter = Math.max(1, Math.round(s.litter || 1));
  s.gestation = Math.max(12, (s.gestation || 40) * Math.pow(mass, 0.12));
  s.maturity = Math.max(12, (s.maturity || 50) * Math.pow(mass, 0.1));
  s.lifespan = 300 + Math.pow(mass, 0.25) * 140;
  s.poison = Math.max(0, s.poison); s.reflect = clamp(s.reflect, 0, 0.6);
  const cost = Math.round(8 + Math.pow(mass, 0.8) * 0.9 + d.genes.length * 3 + (canFly ? 15 : 0));
  return { stats: s, diet, length: L, height: H + legLenM, warnings, cost, buildTime: 6 + Math.sqrt(cost) * 2.2, canFly };
}

// ---------------------------------------------------------------- wild species
export type Role = 'mite' | 'grazer' | 'tank' | 'stalker' | 'apex' | 'scavenger' | 'flyer' | 'snail';
export const ROLE_DIET: Record<Role, Diet> = { mite: 'herb', grazer: 'herb', tank: 'herb', stalker: 'carn', apex: 'carn', scavenger: 'scav', flyer: 'herb', snail: 'herb' };

const NOUNS: Record<Plan, string[]> = {
  hexapod: ['Shellmite', 'Skitter', 'Hopper', 'Borer', 'Mantid', 'Weevil', 'Lanternbug'], octopod: ['Weaver', 'Lurker', 'Spinner', 'Trapper'],
  quadruped: ['Grazer', 'Strider', 'Boar', 'Ox', 'Hound', 'Loper', 'Dome-back'], biped: ['Runner', 'Raptor', 'Sickleclaw', 'Highstep'],
  hexapodV: ['Sixfoot', 'Bulwark', 'Trundler'], serpent: ['Coiler', 'Loamworm', 'Ribbon', 'Gulper'], gastropod: ['Glider', 'Shellback', 'Crawlsnail'], hominid: ['Walker'],
};
const ADJ = ['Ember', 'Moss', 'Banded', 'Spotted', 'Dusk', 'Glass', 'Ochre', 'Tallow', 'Ash', 'Brine', 'Thorn', 'Velvet', 'Hollow', 'Rust', 'Pale', 'Bramble', 'Saffron', 'Cinder', 'Sorrel', 'Umber'];

export function nameFor(d: Design, r: Rand) {
  const adj = d.genes.includes('osteoderms') ? 'Plated' : d.genes.includes('horns') ? 'Horned' : d.genes.includes('antlers') ? 'Crowned' : d.genes.includes('quills') ? 'Quilled' : d.pattern === 'stripes' ? 'Striped' : d.pattern === 'spots' ? 'Spotted' : r.pick(ADJ);
  return adj + ' ' + r.pick(NOUNS[d.plan]);
}

interface RoleSpec { plans: Plan[]; size: [number, number]; genes: (r: Rand, plan: Plan) => string[] }
const legFor = (r: Rand, plan: Plan, pref?: string[]) => { const opts = PLAN_LEGS[plan]; const p = pref?.filter((x) => opts.includes(x)); return r.pick(p && p.length ? p : opts); };
const ROLES: Record<Role, RoleSpec> = {
  mite: { plans: ['hexapod', 'hexapod', 'octopod'], size: [0.0, 0.18], genes: (r, p) => [p === 'octopod' ? 'exo_octopod' : 'exo_hexapod', legFor(r, p, ['leg_jointed']), 'eye_compound', r.chance(0.6) ? 'antennae' : 'eye_compound', r.chance(0.5) ? 'mandibles' : 'proboscis', r.chance(0.4) ? 'elytra' : 'chitin_spines', 'ectotherm', 'egg_clutch'] },
  grazer: { plans: ['quadruped', 'quadruped', 'hexapodV'], size: [0.15, 0.45], genes: (r, p) => [p === 'hexapodV' ? 'vert_hexapod' : 'vert_quadruped', legFor(r, p, ['leg_hooved', 'leg_cursorial', 'leg_padded']), 'eye_camera', r.chance(0.6) ? 'ears' : 'eye_camera', 'molars', r.chance(0.5) ? 'horns' : r.chance(0.5) ? 'antlers' : 'fur', 'endotherm', r.chance(0.5) ? 'ferment_gut' : 'fat_stores', r.chance(0.7) ? 'live_birth' : 'brood_care', 'tail_balance'] },
  tank: { plans: ['quadruped', 'hexapodV'], size: [0.5, 0.8], genes: (r, p) => [p === 'hexapodV' ? 'vert_hexapod' : 'vert_quadruped', legFor(r, p, ['leg_pillar']), 'eye_camera', 'molars', 'osteoderms', r.chance(0.5) ? 'tail_club' : 'horns', 'endotherm', 'fat_stores', 'live_birth'] },
  stalker: { plans: ['biped', 'octopod', 'hexapod', 'quadruped'], size: [0.1, 0.35], genes: (r, p) => p === 'octopod' ? ['exo_octopod', 'leg_jointed', 'eye_compound', 'venom_fangs', r.chance(0.5) ? 'aposematic' : 'chitin_spines', 'ectotherm', 'egg_clutch'] : p === 'hexapod' ? ['exo_hexapod', 'leg_jointed', 'eye_compound', 'antennae', 'mandibles', 'leg_raptorial', 'ectotherm', 'egg_clutch'] : [p === 'biped' ? 'vert_biped' : 'vert_quadruped', legFor(r, p, ['leg_cursorial', 'leg_padded']), 'eye_binocular', r.chance(0.5) ? 'ears' : 'electro', 'carnassials', 'tail_balance', r.chance(0.5) ? 'cryptic' : 'fur', 'endotherm', r.chance(0.6) ? 'brood_care' : 'live_birth'] },
  apex: { plans: ['quadruped', 'biped'], size: [0.55, 0.85], genes: (r, p) => [p === 'biped' ? 'vert_biped' : 'vert_quadruped', legFor(r, p, ['leg_padded', 'leg_cursorial']), 'eye_binocular', 'ears', 'carnassials', 'tail_balance', r.chance(0.5) ? 'quills' : 'fur', r.chance(0.4) ? 'horns' : 'cryptic', 'endotherm', 'live_birth'] },
  scavenger: { plans: ['serpent'], size: [0.15, 0.55], genes: () => ['annelid_serpent', 'setae', 'eye_spots', 'ring_maw', 'mucus', 'scav_gut', 'budding'] },
  flyer: { plans: ['hexapod'], size: [0.0, 0.12], genes: (r) => ['exo_hexapod', 'leg_jointed', 'wing_gossamer', 'eye_compound', 'antennae', r.chance(0.5) ? 'proboscis' : 'mandibles', r.chance(0.5) ? 'biolum' : 'ectotherm', 'egg_clutch'] },
  snail: { plans: ['gastropod'], size: [0.15, 0.5], genes: (r) => ['mollusc_gastropod', 'muscular_foot', 'eye_stalks', 'radula', 'shell', r.chance(0.4) ? 'chloro_skin' : 'scav_gut', 'egg_capsule'] },
};

function coverFor(lineage: Lineage, genes: string[], r: Rand): Cover {
  if (lineage === 'arthropod') return 'chitin';
  if (lineage === 'annelid' || lineage === 'mollusc') return 'slime';
  if (lineage === 'hominid') return 'skin';
  if (genes.includes('fur') || genes.includes('cryptic')) return 'fur';
  if (genes.includes('osteoderms')) return 'scales';
  return r.chance(0.55) ? 'fur' : r.chance(0.5) ? 'scales' : 'skin';
}

/** a wild species for an ecological role, coloured from the planet */
export function wildDesign(role: Role, pal: Palette, seed: number): Design {
  const r = new Rand(seed);
  const spec = ROLES[role];
  const plan = r.pick(spec.plans);
  const genes = [...new Set(spec.genes(r, plan))];
  const lineage = PLAN_LINEAGE[plan];
  const base = role === 'apex' || role === 'stalker'
    ? mixHex(r.pick([pal.soil, pal.rock, pal.basalt, pal.clay]), r.pick(pal.foliage), r.range(0.1, 0.3))
    : r.chance(0.5) ? mixHex(pal.grassDry, r.pick([pal.soil, pal.clay, pal.sand]), r.range(0.2, 0.7)) : mixHex(r.pick(pal.foliage), pal.soil, r.range(0.3, 0.6));
  const warn = genes.includes('aposematic');
  const colors: Colors = {
    base: warn ? r.pick([0xd8b030, 0xd84a30, 0x30a8d8]) : base,
    belly: mixHex(base, 0xf0e4c8, r.range(0.35, 0.65)),
    pattern: warn ? 0x141018 : r.chance(0.3) ? r.pick(pal.bloom) : scaleHex(base, r.range(0.45, 0.7)),
    accent: r.pick([...pal.bloom, pal.crystal]),
    eye: r.pick([0x101010, 0xe8c040, 0xd84020, 0x40c8e8, 0xf0f0e0, 0x80e040]),
  };
  const d: Design = {
    name: '', latin: binomial(r), plan, lineage, genes,
    size: r.range(spec.size[0], spec.size[1]), len: r.next(), girth: r.range(0.25, 0.8), legLen: r.range(0.3, 0.8), legThick: r.range(0.35, 0.7),
    neck: r.next(), head: r.range(0.3, 0.8), tail: r.next(), segs: plan === 'serpent' ? r.int(8, 13) : r.int(2, 4),
    colors, pattern: warn ? 'bands' : r.pick(['plain', 'stripes', 'spots', 'bands', 'mottled', 'saddle', 'rings'] as Pattern[]), patScale: r.range(0.6, 1.6),
    cover: coverFor(lineage, genes, r), seed,
  };
  if (role === 'tank') d.legThick = r.range(0.7, 0.95);
  if (role === 'apex') { d.head = r.range(0.6, 0.9); d.legThick = r.range(0.55, 0.8); }
  d.name = nameFor(d, r);
  return d;
}

/** small heritable drift (offspring, subspecies) */
export function mutate(d: Design, r: Rand, k = 0.06): Design {
  const j = (v: number) => clamp(v + r.gauss() * k, 0, 1);
  const c = (v: number) => mixHex(v, r.chance(0.5) ? 0xffffff : 0x000000, Math.abs(r.gauss()) * k * 0.5);
  return {
    ...d, genes: [...d.genes], seed: (d.seed * 31 + r.int(1, 1e6)) >>> 0,
    size: j(d.size), len: j(d.len), girth: j(d.girth), legLen: j(d.legLen), legThick: j(d.legThick), neck: j(d.neck), head: j(d.head), tail: j(d.tail),
    colors: { base: c(d.colors.base), belly: c(d.colors.belly), pattern: c(d.colors.pattern), accent: d.colors.accent, eye: d.colors.eye },
    patScale: clamp(d.patScale + r.gauss() * k * 2, 0.4, 2),
  };
}

/** how different two designs are (0 same .. ~1+ distinct): drives speciation */
export function divergence(a: Design, b: Design): number {
  const keys: (keyof Design)[] = ['size', 'len', 'girth', 'legLen', 'legThick', 'neck', 'head', 'tail'];
  let s = 0; for (const k of keys) s += Math.abs((a[k] as number) - (b[k] as number));
  const ga = new Set(a.genes), gb = new Set(b.genes);
  let diff = 0; for (const g of ga) if (!gb.has(g)) diff++; for (const g of gb) if (!ga.has(g)) diff++;
  return s / keys.length * 2 + diff * 0.25 + (a.plan !== b.plan ? 2 : 0);
}
