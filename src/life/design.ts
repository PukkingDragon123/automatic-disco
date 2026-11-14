// A design is a heritable body: plan, proportions, colours and genes. Stats follow from anatomy with a few hard
// biological rules (square-cube leg loading, tracheal size limit on exoskeletons, wing loading for flight).
import { GENE, PLAN_LEGS, PLAN_LINEAGE, ZERO_STATS, type Diet, type Lineage, type Plan, type Stats } from './genes';
import { Rand, clamp, lerp } from '../core/rand';
import { binomial } from '../world/plantArt';
import { mixHex, scaleHex } from '../limbo/gfx/pixel';
import type { Palette } from '../world/palette';
import { RAMPS, type RampName } from '../art/palette';

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
    const limit = d.genes.includes('wing_gossamer') || d.genes.includes('wing_scaled') ? 5 : 45;
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
/** species archetypes: every ecological role draws one of a few kinds (the studio also takes a kind as its role) */
export type Kind = 'mite' | 'crab' | 'beetle' | 'grazer' | 'boar' | 'elk' | 'ram' | 'tank' | 'tortoise' | 'bear' | 'sailback' | 'stalker' | 'monitor' | 'frillneck'
  | 'apex' | 'lion' | 'worm' | 'flyer' | 'moth' | 'snail' | 'frog' | 'newt';

const NOUNS: Record<Plan, string[]> = {
  hexapod: ['Shellmite', 'Skitter', 'Hopper', 'Borer', 'Mantid', 'Weevil', 'Lanternbug'], octopod: ['Weaver', 'Lurker', 'Spinner', 'Trapper'],
  quadruped: ['Grazer', 'Strider', 'Ox', 'Hound', 'Loper', 'Dome-back'], biped: ['Runner', 'Raptor', 'Sickleclaw', 'Highstep'],
  hexapodV: ['Sixfoot', 'Bulwark', 'Trundler'], serpent: ['Coiler', 'Loamworm', 'Ribbon', 'Gulper'], gastropod: ['Glider', 'Shellback', 'Crawlsnail'], hominid: ['Walker'],
};
/** body-shape genes name the animal before the plan does */
const GENE_NOUNS: [string, string[]][] = [
  ['carapace_crab', ['Crab', 'Pincher', 'Sidler', 'Clawback']], ['horn_beetle', ['Beetle', 'Scarab', 'Horncrawler', 'Rhinobug']], ['wing_scaled', ['Moth', 'Duskwing', 'Owlmoth', 'Silkmoth']],
  ['leg_leaping', ['Frog', 'Toad', 'Croaker', 'Puddlejack', 'Leaper']], ['shell_scute', ['Tortoise', 'Terrapin', 'Domeshell', 'Slowback']],
  ['leg_plantigrade', ['Bear', 'Bruin', 'Mauler', 'Ursid', 'Grizzle']], ['hump', ['Bear', 'Bruin', 'Ursid']], ['gills', ['Axolotl', 'Mudpuppy', 'Gillnewt']],
  ['sail', ['Sailback', 'Finback', 'Spinesail']], ['frill', ['Frillneck', 'Flarehead', 'Fanthroat']], ['mane', ['Lion', 'Ruffcat', 'Manecat', 'Sunstalker']],
  ['antlers_palm', ['Elk', 'Moose', 'Shovelhorn']], ['horns_ram', ['Ram', 'Ibex', 'Curlhorn', 'Butter']], ['tusks', ['Boar', 'Tusker', 'Rooter', 'Hog']],
];
const ADJ = ['Ember', 'Moss', 'Banded', 'Spotted', 'Dusk', 'Glass', 'Ochre', 'Tallow', 'Ash', 'Brine', 'Thorn', 'Velvet', 'Hollow', 'Rust', 'Pale', 'Bramble', 'Saffron', 'Cinder', 'Sorrel', 'Umber', 'Cobalt', 'Coral', 'Jade', 'Opal', 'Tiger', 'Lilac'];

export function nameFor(d: Design, r: Rand) {
  const g = (x: string) => d.genes.includes(x);
  const adj = g('leg_plantigrade') ? r.pick(['Grizzled', 'Cave', 'Ash', 'Umber', 'Honey', 'Silvertip', 'Great', 'Black', 'Russet', 'Hollow', 'Moss'])
    : g('osteoderms') ? 'Plated' : g('shaggy') && !g('leg_plantigrade') ? 'Shaggy' : g('horns') ? 'Horned' : g('antlers') ? 'Crowned' : g('quills') ? 'Quilled' : g('crest') && r.chance(0.5) ? 'Crested'
    : g('amphib_skin') && d.colors.pattern < 0x303030 && r.chance(0.6) ? 'Dart' : d.pattern === 'stripes' ? 'Striped' : d.pattern === 'spots' ? 'Spotted' : r.pick(ADJ);
  let nouns = NOUNS[d.plan];
  for (const [id, ns] of GENE_NOUNS) if (g(id)) { nouns = ns; break; }
  if (nouns === NOUNS.quadruped && g('leg_sprawl')) nouns = g('amphib_skin') ? ['Newt', 'Salamander', 'Eft', 'Olm'] : ['Monitor', 'Varan', 'Tegu', 'Skink'];
  return adj + ' ' + r.pick(nouns);
}

interface KindSpec { plans: Plan[]; size: [number, number]; genes: (r: Rand, plan: Plan) => string[]; tune?: (d: Design, r: Rand, pal: Palette) => void }
const legFor = (r: Rand, plan: Plan, pref?: string[]) => { const opts = PLAN_LEGS[plan]; const p = pref?.filter((x) => opts.includes(x)); return r.pick(p && p.length ? p : opts); };
// Every creature colour is a step of a master-palette ramp (src/art/palette.ts): earth ramps for mammals, the muted
// moss, teal, coral, violet and plum for amphibians and the alien half of the fauna, ichor, olive, brass and steel for chitin.
const T = (n: RampName, i: number) => { const R = RAMPS[n] as readonly number[]; return R[Math.max(0, Math.min(R.length - 1, i))]; };
const EARTH: RampName[] = ['fur', 'hide', 'ochre', 'rust', 'clay', 'soil', 'straw'];
const ALIEN: RampName[] = ['teal', 'violet', 'plum', 'coral', 'moss', 'sage'];
/** the muted colourful half of the fauna (the other half wears earth) */
const VIVID = [T('teal', 3), T('teal', 4), T('violet', 3), T('violet', 4), T('plum', 3), T('plum', 4), T('coral', 3), T('coral', 4), T('moss', 4), T('moss', 5), T('sage', 4), T('rust', 4)];
const BEAR = [T('fur', 1), T('fur', 2), T('hide', 1), T('fur', 3), T('rust', 2), T('hide', 2), T('soil', 2), T('clay', 2)];
/** poison-frog warning colours: muted coral, teal, ochre, moss, worn with ink black */
const DART = [T('coral', 4), T('teal', 4), T('ochre', 5), T('moss', 5), T('violet', 4), T('rust', 5), T('sage', 4)];
const IRID = [T('teal', 3), T('violet', 3), T('plum', 3), T('olive', 3), T('ichor', 3), T('brass', 3), T('steel', 3)];
const INK = T('ink', 0);
const ACCENT = [T('coral', 4), T('teal', 4), T('brass', 4), T('ochre', 5), T('violet', 4), T('plum', 4), T('moss', 5), T('rust', 5)];
const EYES = [T('fur', 1), T('ochre', 4), T('brass', 4), T('ink', 1), T('teal', 4), T('straw', 3), T('coral', 4), T('sage', 4)];
const sl = (r: Rand, a: number, b: number) => r.range(a, b);
const KINDS: Record<Kind, KindSpec> = {
  // ---------------------------------------------------------------- arthropods
  mite: { plans: ['hexapod', 'hexapod', 'octopod'], size: [0.0, 0.18], genes: (r, p) => [p === 'octopod' ? 'exo_octopod' : 'exo_hexapod', legFor(r, p, ['leg_jointed']), 'eye_compound', r.chance(0.6) ? 'antennae' : 'eye_compound', r.chance(0.5) ? 'mandibles' : 'proboscis', r.chance(0.4) ? 'elytra' : 'chitin_spines', 'ectotherm', 'egg_clutch'] },
  crab: {
    plans: ['octopod'], size: [0.06, 0.26], genes: (r) => ['exo_octopod', 'leg_jointed', 'eye_compound', 'chela', 'carapace_crab', 'mandibles', 'rapid_molt', 'ectotherm', 'egg_clutch'],
    tune: (d, r) => { const n = r.pick(['coral', 'rust', 'plum', 'teal', 'clay', 'ochre'] as RampName[]), b = T(n, 4); d.colors.base = b; d.colors.pattern = r.chance(0.5) ? T(n, 2) : r.pick(VIVID); d.colors.belly = T('bone', 4); d.pattern = r.pick(['plain', 'spots', 'mottled'] as Pattern[]); d.girth = sl(r, 0.6, 0.95); d.legLen = sl(r, 0.45, 0.75); d.legThick = sl(r, 0.5, 0.68); },
  },
  beetle: {
    plans: ['hexapod'], size: [0.06, 0.22], genes: (r) => ['exo_hexapod', 'leg_jointed', 'eye_compound', 'antennae', 'mandibles', 'elytra', 'horn_beetle', r.chance(0.3) ? 'chitin_spines' : 'tracheal', 'ectotherm', 'egg_clutch'],
    tune: (d, r) => { const b = r.pick(IRID); d.colors.base = b; d.colors.accent = r.pick([T('brass', 5), T('coral', 4), T('teal', 5), T('ochre', 5)]); d.colors.pattern = T('ink', 1); d.colors.belly = T('olive', 1); d.pattern = r.pick(['plain', 'spots', 'bands'] as Pattern[]); d.girth = sl(r, 0.55, 0.9); d.legThick = sl(r, 0.5, 0.68); },
  },
  flyer: { plans: ['hexapod'], size: [0.0, 0.12], genes: (r) => ['exo_hexapod', 'leg_jointed', 'wing_gossamer', 'eye_compound', 'antennae', r.chance(0.5) ? 'proboscis' : 'mandibles', r.chance(0.5) ? 'biolum' : 'ectotherm', 'egg_clutch'] },
  moth: {
    plans: ['hexapod'], size: [0.0, 0.1], genes: (r) => ['exo_hexapod', 'leg_jointed', 'wing_scaled', 'eye_compound', 'antennae', 'proboscis', r.chance(0.35) ? 'biolum' : 'ectotherm', 'egg_clutch'],
    tune: (d, r) => {
      const vivid = r.chance(0.6), b = vivid ? r.pick([T('moss', 5), T('coral', 5), T('rust', 5), T('straw', 4), T('teal', 5), T('violet', 5)]) : r.pick([T('soil', 4), T('fur', 4), T('sand', 3), T('hide', 4)]);
      d.colors.base = b; d.colors.belly = T('bone', 4); d.colors.pattern = vivid ? r.pick([T('plum', 2), T('violet', 1), T('coral', 2), T('teal', 1)]) : T('soil', 2);
      d.colors.accent = r.pick([T('teal', 4), T('brass', 5), T('coral', 4), T('sage', 5), T('paper', 4)]); d.cover = 'fur'; d.pattern = r.pick(['bands', 'spots', 'mottled', 'stripes'] as Pattern[]); d.legLen = sl(r, 0.05, 0.3); d.legThick = sl(r, 0.4, 0.7);
    },
  },
  // ---------------------------------------------------------------- grazers
  grazer: { plans: ['quadruped', 'quadruped', 'hexapodV'], size: [0.15, 0.45], genes: (r, p) => [p === 'hexapodV' ? 'vert_hexapod' : 'vert_quadruped', legFor(r, p, ['leg_hooved', 'leg_cursorial', 'leg_padded']), 'eye_camera', r.chance(0.6) ? 'ears' : 'eye_camera', 'molars', r.chance(0.5) ? 'horns' : r.chance(0.5) ? 'antlers' : 'fur', r.chance(0.3) ? 'tail_brush' : r.chance(0.3) ? 'crest' : r.chance(0.25) ? 'wattle' : 'endotherm', 'endotherm', r.chance(0.5) ? 'ferment_gut' : 'fat_stores', r.chance(0.7) ? 'live_birth' : 'brood_care', 'tail_balance'] },
  boar: {
    plans: ['quadruped'], size: [0.2, 0.42], genes: (r) => ['vert_quadruped', 'leg_hooved', 'eye_camera', 'ears', 'tusks', 'molars', 'fur', 'crest', r.chance(0.5) ? 'shaggy' : 'fat_stores', 'endotherm', 'live_birth'],
    tune: (d, r) => {
      const alien = r.chance(0.35), b = alien ? r.pick([T('violet', 2), T('teal', 2), T('plum', 2), T('olive', 2)]) : r.pick([T('fur', 2), T('hide', 2), T('rust', 2), T('soil', 2)]);
      d.colors.base = b; d.colors.belly = T('hide', 4); d.colors.pattern = alien ? r.pick(VIVID) : T('fur', 1); d.pattern = r.pick(['plain', 'stripes', 'mottled', 'saddle'] as Pattern[]);
      d.cover = 'fur'; d.girth = sl(r, 0.65, 0.9); d.legLen = sl(r, 0.25, 0.45); d.neck = sl(r, 0.05, 0.25); d.head = sl(r, 0.6, 0.85); d.tail = sl(r, 0.1, 0.35); d.legThick = sl(r, 0.5, 0.7);
    },
  },
  elk: {
    plans: ['quadruped'], size: [0.3, 0.5], genes: (r) => ['vert_quadruped', 'leg_hooved', 'eye_camera', 'ears', 'molars', 'antlers_palm', 'shaggy', r.chance(0.6) ? 'wattle' : 'fat_stores', 'endotherm', 'ferment_gut', 'live_birth'],
    tune: (d, r) => {
      const alien = r.chance(0.3), b = alien ? r.pick([T('slate', 4), T('violet', 3), T('teal', 3)]) : r.pick([T('fur', 3), T('rust', 3), T('fur', 2), T('ochre', 3)]);
      d.colors.base = b; d.colors.belly = T('straw', 4); d.colors.pattern = alien ? r.pick(VIVID) : T('fur', 1); d.pattern = r.pick(['plain', 'saddle', 'plain'] as Pattern[]);
      d.cover = 'fur'; d.legLen = sl(r, 0.65, 0.85); d.neck = sl(r, 0.35, 0.6); d.head = sl(r, 0.55, 0.75); d.tail = sl(r, 0.0, 0.15); d.girth = sl(r, 0.45, 0.7);
    },
  },
  ram: {
    plans: ['quadruped'], size: [0.18, 0.38], genes: () => ['vert_quadruped', 'leg_hooved', 'eye_camera', 'molars', 'horns_ram', 'shaggy', 'endotherm', 'fat_stores', 'live_birth'],
    tune: (d, r) => {
      const alien = r.chance(0.4), b = alien ? r.pick([T('violet', 5), T('teal', 5), T('ochre', 5), T('plum', 5)]) : r.pick([T('bone', 4), T('soil', 4), T('fur', 2), T('sand', 4)]);
      d.colors.base = b; d.colors.belly = T('bone', 5); d.colors.pattern = alien ? r.pick(VIVID) : T('soil', 2); d.pattern = r.pick(['plain', 'saddle', 'mottled'] as Pattern[]);
      d.cover = 'fur'; d.girth = sl(r, 0.55, 0.85); d.legLen = sl(r, 0.4, 0.6); d.neck = sl(r, 0.2, 0.4); d.tail = sl(r, 0.0, 0.2);
    },
  },
  // ---------------------------------------------------------------- tanks
  tank: { plans: ['quadruped', 'hexapodV'], size: [0.5, 0.8], genes: (r, p) => [p === 'hexapodV' ? 'vert_hexapod' : 'vert_quadruped', legFor(r, p, ['leg_pillar']), 'eye_camera', 'molars', 'osteoderms', r.chance(0.5) ? 'tail_club' : 'horns', 'endotherm', 'fat_stores', 'live_birth'], tune: (d, r) => { d.legThick = sl(r, 0.7, 0.95); } },
  tortoise: {
    plans: ['quadruped'], size: [0.32, 0.58], genes: (r) => ['vert_quadruped', 'leg_pillar', 'eye_camera', 'molars', 'beak', 'shell_scute', 'fat_stores', 'ectotherm', 'brood_care'],
    tune: (d, r) => {
      const radiated = r.chance(0.45);
      d.colors.base = r.pick([T('olive', 3), T('soil', 3), T('olive', 2), T('stone', 3)]); d.colors.belly = T('straw', 3);
      d.colors.pattern = radiated ? r.pick([T('soil', 1), T('basalt', 2), T('fur', 1)]) : r.pick([T('ochre', 3), T('brass', 3), T('ochre', 4), T('olive', 4)]);
      d.colors.accent = radiated ? r.pick([T('ochre', 5), T('brass', 5), T('straw', 4), T('rust', 5)]) : r.pick([T('ochre', 4), T('brass', 4)]);
      d.cover = 'scales'; d.pattern = r.pick(['plain', 'mottled', 'stripes'] as Pattern[]); d.legLen = sl(r, 0.15, 0.35); d.legThick = sl(r, 0.55, 0.7); d.neck = sl(r, 0.35, 0.6); d.head = sl(r, 0.35, 0.55); d.tail = sl(r, 0, 0.15); d.girth = sl(r, 0.7, 0.95);
    },
  },
  bear: {
    plans: ['quadruped'], size: [0.4, 0.66], genes: () => ['vert_quadruped', 'leg_plantigrade', 'hump', 'eye_camera', 'ears_round', 'molars', 'carnassials', 'shaggy', 'fur', 'endotherm', 'fat_stores', 'live_birth'],
    tune: (d, r) => {
      const b = r.chance(0.08) ? T('bone', 4) : r.pick(BEAR);
      d.colors.base = b; d.colors.belly = r.chance(0.5) ? T('fur', 1) : T('fur', 3);
      d.colors.pattern = r.chance(0.6) ? T('fur', 4) : T('fur', 0); d.colors.eye = r.pick([T('fur', 1), T('rust', 2), T('ink', 1)]);
      d.pattern = r.pick(['plain', 'plain', 'mottled', 'saddle'] as Pattern[]); d.cover = 'fur';
      d.girth = sl(r, 0.62, 0.85); d.legThick = sl(r, 0.58, 0.7); d.legLen = sl(r, 0.3, 0.48); d.neck = sl(r, 0.15, 0.35); d.head = sl(r, 0.5, 0.72); d.tail = sl(r, 0, 0.12); d.len = sl(r, 0.4, 0.8);
    },
  },
  sailback: {
    plans: ['quadruped'], size: [0.45, 0.68], genes: (r) => ['vert_quadruped', 'leg_sprawl', 'eye_camera', 'molars', 'sail', r.chance(0.5) ? 'crest' : 'tail_balance', 'ectotherm', 'brood_care', 'tail_balance'],
    tune: (d, r) => { d.colors.accent = r.pick(VIVID); d.cover = 'scales'; d.pattern = r.pick(['bands', 'mottled', 'stripes', 'spots'] as Pattern[]); d.girth = sl(r, 0.6, 0.85); d.legThick = sl(r, 0.55, 0.7); d.tail = sl(r, 0.5, 0.9); d.neck = sl(r, 0.15, 0.35); },
  },
  // ---------------------------------------------------------------- hunters
  stalker: { plans: ['biped', 'octopod', 'hexapod', 'quadruped'], size: [0.1, 0.35], genes: (r, p) => p === 'octopod' ? ['exo_octopod', 'leg_jointed', 'eye_compound', 'venom_fangs', r.chance(0.5) ? 'aposematic' : 'chitin_spines', 'ectotherm', 'egg_clutch'] : p === 'hexapod' ? ['exo_hexapod', 'leg_jointed', 'eye_compound', 'antennae', 'mandibles', 'leg_raptorial', 'ectotherm', 'egg_clutch'] : [p === 'biped' ? 'vert_biped' : 'vert_quadruped', legFor(r, p, ['leg_cursorial', 'leg_padded']), 'eye_binocular', r.chance(0.5) ? 'ears' : 'electro', 'carnassials', 'tail_balance', r.chance(0.5) ? 'cryptic' : 'fur', r.chance(0.3) ? 'whiskers' : 'endotherm', 'endotherm', r.chance(0.6) ? 'brood_care' : 'live_birth'] },
  monitor: {
    plans: ['quadruped'], size: [0.15, 0.4], genes: (r) => ['vert_quadruped', 'leg_sprawl', 'eye_camera', 'tongue', 'carnassials', r.chance(0.5) ? 'crest' : 'cryptic', r.chance(0.4) ? 'wattle' : 'tail_balance', 'tail_balance', 'ectotherm', 'brood_care'],
    tune: (d, r) => {
      const vivid = r.chance(0.45); d.cover = 'scales';
      if (vivid) { d.colors.base = r.pick([T('moss', 4), T('teal', 4), T('sage', 4), T('violet', 4), T('olive', 4)]); d.colors.pattern = r.pick([INK, T('ochre', 5), T('bone', 5)]); }
      d.pattern = r.pick(['spots', 'bands', 'rings', 'mottled'] as Pattern[]); d.girth = sl(r, 0.3, 0.55); d.tail = sl(r, 0.65, 1); d.neck = sl(r, 0.45, 0.75); d.head = sl(r, 0.35, 0.55); d.len = sl(r, 0.5, 1);
    },
  },
  frillneck: {
    plans: ['biped'], size: [0.1, 0.32], genes: (r) => ['vert_biped', 'leg_cursorial', 'eye_binocular', 'frill', 'carnassials', r.chance(0.4) ? 'crest' : r.chance(0.5) ? 'wattle' : 'cryptic', 'tail_balance', 'ectotherm', 'brood_care'],
    tune: (d, r) => { d.colors.accent = r.pick(VIVID); d.colors.pattern = r.chance(0.5) ? r.pick(VIVID) : d.colors.pattern; d.cover = 'scales'; d.pattern = r.pick(['bands', 'stripes', 'spots'] as Pattern[]); d.neck = sl(r, 0.35, 0.6); },
  },
  apex: { plans: ['quadruped', 'biped'], size: [0.55, 0.85], genes: (r, p) => [p === 'biped' ? 'vert_biped' : 'vert_quadruped', legFor(r, p, ['leg_padded', 'leg_cursorial']), 'eye_binocular', 'ears', 'carnassials', 'tail_balance', r.chance(0.5) ? 'quills' : 'fur', r.chance(0.4) ? 'horns' : 'cryptic', r.chance(0.3) ? 'frill' : 'endotherm', 'endotherm', 'live_birth'], tune: (d, r) => { d.head = sl(r, 0.6, 0.9); d.legThick = sl(r, 0.55, 0.8); } },
  lion: {
    plans: ['quadruped'], size: [0.5, 0.75], genes: (r) => ['vert_quadruped', 'leg_padded', 'eye_binocular', 'ears_round', 'whiskers', 'carnassials', 'mane', 'fur', r.chance(0.35) ? 'tail_brush' : 'tail_balance', 'tail_balance', 'endotherm', 'live_birth'],
    tune: (d, r) => {
      const alien = r.chance(0.45);
      const b = alien ? r.pick([T('teal', 4), T('violet', 4), T('rust', 4), T('slate', 4), T('brass', 4)]) : r.pick([T('ochre', 4), T('ochre', 5), T('straw', 4), T('fur', 4)]);
      d.colors.base = b; d.colors.belly = T('bone', 5);
      d.colors.pattern = alien ? r.pick([INK, T('rust', 3), T('bone', 4), T('violet', 1)]) : r.pick([T('fur', 1), T('rust', 1), T('fur', 0), T('rust', 3)]);
      d.pattern = alien ? r.pick(['stripes', 'spots', 'plain'] as Pattern[]) : r.pick(['plain', 'plain', 'spots'] as Pattern[]); d.cover = 'fur';
      d.head = sl(r, 0.55, 0.75); d.legThick = sl(r, 0.62, 0.78); d.legLen = sl(r, 0.3, 0.46); d.neck = sl(r, 0.2, 0.4); d.tail = sl(r, 0.55, 0.8); d.girth = sl(r, 0.55, 0.75);
    },
  },
  worm: { plans: ['serpent'], size: [0.15, 0.55], genes: () => ['annelid_serpent', 'setae', 'eye_spots', 'ring_maw', 'mucus', 'scav_gut', 'budding'] },
  // ---------------------------------------------------------------- the damp places
  snail: { plans: ['gastropod'], size: [0.15, 0.5], genes: (r) => ['mollusc_gastropod', 'muscular_foot', 'eye_stalks', 'radula', 'shell', r.chance(0.4) ? 'chloro_skin' : 'scav_gut', 'egg_capsule'] },
  frog: {
    plans: ['quadruped'], size: [0.0, 0.14], genes: () => ['vert_quadruped', 'leg_leaping', 'eye_bulging', 'tongue', 'amphib_skin', 'spawn'],
    tune: (d, r) => {
      const dart = r.chance(0.55);
      if (dart) {
        const b = r.pick(DART); d.colors.base = b; d.colors.pattern = r.chance(0.75) ? INK : r.pick(DART.filter((x) => x !== b));
        d.colors.belly = r.chance(0.5) ? T('ink', 2) : T('bone', 4); d.colors.eye = INK;
        d.pattern = r.pick(['spots', 'mottled', 'bands', 'spots'] as Pattern[]); d.patScale = sl(r, 0.6, 1.1);
      } else {
        const b = r.pick([T('moss', 4), T('moss', 3), T('olive', 4), T('ochre', 3), T('sage', 3), T('soil', 4)]); d.colors.base = b; d.colors.pattern = T('moss', 1);
        d.colors.belly = r.pick([T('straw', 4), T('bone', 4), T('sand', 4)]); d.colors.eye = r.pick([T('brass', 4), T('ochre', 5), T('rust', 5)]); d.pattern = r.pick(['spots', 'mottled', 'saddle'] as Pattern[]);
      }
      d.colors.accent = r.pick([0xe8c030, 0xf06a5a, 0x2ab8b0]);
      d.cover = 'slime'; d.girth = sl(r, 0.6, 0.95); d.head = sl(r, 0.5, 0.8); d.legLen = sl(r, 0.5, 0.9); d.legThick = sl(r, 0.45, 0.7); d.tail = 0; d.neck = 0;
    },
  },
  newt: {
    plans: ['quadruped'], size: [0.02, 0.18], genes: (r) => { const ax = r.chance(0.35); return ['vert_quadruped', 'leg_sprawl', 'eye_camera', 'tongue', 'amphib_skin', 'tail_fin', ax ? 'gills' : r.chance(0.6) ? 'crest' : 'cryptic', 'spawn']; },
    tune: (d, r) => {
      const gills = d.genes.includes('gills');
      if (gills && r.chance(0.5)) { d.colors.base = r.pick([T('coral', 5), T('bone', 4), T('slate', 4), T('plum', 5)]); d.colors.belly = T('bone', 5); d.colors.pattern = T('plum', 3); d.colors.accent = r.pick([T('coral', 4), T('plum', 4), T('violet', 4)]); d.pattern = 'mottled'; }
      else {
        const eft = r.chance(0.3);
        d.colors.base = eft ? r.pick([T('rust', 5), T('coral', 4), T('ochre', 5)]) : r.pick([T('olive', 2), T('basalt', 3), T('soil', 3), T('moss', 2), T('slate', 2)]);
        d.colors.belly = r.pick([T('rust', 5), T('coral', 4), T('ochre', 5)]); d.colors.pattern = eft ? T('fur', 1) : r.pick([T('ochre', 5), T('straw', 4), INK, T('coral', 5)]);
        d.colors.accent = r.pick(VIVID); d.pattern = r.pick(['spots', 'spots', 'stripes', 'mottled'] as Pattern[]);
      }
      d.colors.eye = r.pick([INK, T('brass', 4)]);
      d.cover = 'slime'; d.girth = sl(r, 0.3, 0.55); d.legLen = sl(r, 0.3, 0.6); d.legThick = sl(r, 0.35, 0.6); d.tail = sl(r, 0.6, 0.95); d.neck = sl(r, 0.0, 0.2); d.head = sl(r, 0.35, 0.6); d.len = sl(r, 0.5, 1);
    },
  },
};
const ROLES: Record<Role, [Kind, number][]> = {
  mite: [['mite', 5], ['crab', 2.5], ['beetle', 2.5]],
  grazer: [['grazer', 4], ['boar', 2], ['elk', 2], ['ram', 2]],
  tank: [['tank', 3], ['tortoise', 3], ['bear', 3], ['sailback', 2]],
  stalker: [['stalker', 5], ['monitor', 2.5], ['frillneck', 2]],
  apex: [['apex', 3], ['bear', 3], ['lion', 3]],
  scavenger: [['worm', 1]],
  flyer: [['flyer', 3], ['moth', 3]],
  snail: [['snail', 3], ['frog', 4], ['newt', 3]],
};

function coverFor(lineage: Lineage, genes: string[], r: Rand): Cover {
  if (lineage === 'arthropod') return 'chitin';
  if (lineage === 'annelid' || lineage === 'mollusc') return 'slime';
  if (lineage === 'hominid') return 'skin';
  if (genes.includes('amphib_skin')) return 'slime';
  if (genes.includes('fur') || genes.includes('cryptic') || genes.includes('shaggy') || genes.includes('mane')) return 'fur';
  if (genes.includes('osteoderms') || genes.includes('shell_scute') || genes.includes('leg_sprawl')) return 'scales';
  return r.chance(0.55) ? 'fur' : r.chance(0.5) ? 'scales' : 'skin';
}

/** a wild species for an ecological role (or a named kind), coloured from the planet */
export function wildDesign(role: Role | Kind, pal: Palette, seed: number): Design {
  const r = new Rand(seed);
  const kind: Kind = role in ROLES ? r.weighted(ROLES[role as Role]) : (role as Kind) in KINDS ? (role as Kind) : 'grazer';
  const spec = KINDS[kind];
  const plan = r.pick(spec.plans);
  const genes = [...new Set(spec.genes(r, plan))];
  const lineage = PLAN_LINEAGE[plan];
  const hunter = role === 'apex' || role === 'stalker' || kind === 'stalker' || kind === 'apex';
  // every colour is a master-palette step: half the fauna wears earth (hunters the darker steps), half the muted alien
  // ramps; bellies are the lighter steps of the same ramp, patterns the darker ones, another ramp or ink
  const vivid = r.chance(0.5), bn: RampName = vivid ? r.pick(lineage === 'arthropod' ? ['ichor', 'olive', 'brass', 'steel', 'teal', 'violet'] as RampName[] : ALIEN) : r.pick(EARTH);
  const bi = hunter ? r.int(2, 3) : r.int(2, 4), base = T(bn, bi);
  const warn = genes.includes('aposematic');
  const pr = r.next();
  const colors: Colors = {
    base: warn ? r.pick(DART) : base,
    belly: r.chance(0.2) ? r.pick([T('bone', 4), T('straw', 4), T('sand', 4)]) : T(bn, bi + r.int(2, 3)),
    pattern: warn ? INK : pr < 0.45 ? r.pick(VIVID) : pr < 0.6 ? T('ink', 1) : T(bn, bi - r.int(1, 2)),
    accent: r.pick(ACCENT),
    eye: r.pick(EYES),
  };
  void pal;
  const d: Design = {
    name: '', latin: binomial(r), plan, lineage, genes,
    size: r.range(spec.size[0], spec.size[1]), len: r.next(), girth: r.range(0.25, 0.8), legLen: r.range(0.3, 0.8), legThick: r.range(0.35, 0.7),
    neck: r.next(), head: r.range(0.3, 0.8), tail: r.next(), segs: plan === 'serpent' ? r.int(8, 13) : r.int(2, 4),
    colors, pattern: warn ? 'bands' : r.pick(['plain', 'stripes', 'spots', 'bands', 'mottled', 'saddle', 'rings', 'stripes', 'spots'] as Pattern[]), patScale: r.range(0.6, 1.6),
    cover: coverFor(lineage, genes, r), seed,
  };
  spec.tune?.(d, r, pal);
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
