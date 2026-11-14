// The gene lab's design rules: which body area a gene grows on (the carousel tabs), what may be grafted onto
// what (body plan, lineage, splicing), how many genes each category holds (the Deep Sequencer adds slots), the
// Growth Vat's size cap, and what a design needs before it can be filed as a prefab. Pure logic: the lab scene,
// its UI and the part icons all read it.
import { GENE, PLAN_LEGS, PLAN_LINEAGE, LINEAGE_NAMES, CAT_NAMES, compatible, type GeneCat, type GeneDef, type Plan, type Lineage } from '../life/genes';
import { nameFor, type Design } from '../life/design';
import { Rand, clamp } from '../core/rand';
import { isBio, isPlantGene } from '../life/genesBio';
import { binomial } from '../world/plantArt';
import { VEYR } from '../world/palette';
import type { Run } from '../game/run';

export type TabId = 'body' | 'works' | 'legs' | 'arms' | 'tail' | 'wings' | 'eyes' | 'senses' | 'jaw' | 'crown' | 'back' | 'hide' | 'organs';
export const TAB_ORDER: TabId[] = ['body', 'works', 'legs', 'arms', 'tail', 'wings', 'eyes', 'senses', 'jaw', 'crown', 'back', 'hide', 'organs'];

/** body regions painted onto the specimen's vertices (partPreview.ts writes them, the tank highlights them) */
export const REG = { none: 0, torso: 1, back: 2, head: 3, eyes: 4, crown: 5, jaw: 6, feelers: 7, legs: 8, arms: 9, tail: 10, wings: 11 } as const;
export type RegId = (typeof REG)[keyof typeof REG];
export const REG_NAME: Record<number, string> = { 1: 'TORSO', 2: 'BACK', 3: 'HEAD', 4: 'EYES', 5: 'HORNS', 6: 'MOUTH', 7: 'FEELERS', 8: 'LEGS', 9: 'FORELIMBS', 10: 'TAIL', 11: 'WINGS' };

export interface TabDef { name: string; short: string; icon: string; cat: GeneCat; regs: number[]; desc: string }
export const TABS: Record<TabId, TabDef> = {
  body: { name: 'BODY PLAN', short: 'PLAN', icon: 'cat-body', cat: 'body', regs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], desc: 'The frame everything else hangs on. Changing it re-grows the specimen; compatible genes carry over.' },
  works: { name: 'FUNCTION ORGANS', short: 'WORK', icon: 'cat-meta', cat: 'meta', regs: [1, 2], desc: 'What it DOES: dig, terraform, produce, change the land, haul, operate, guard, fight. Function organs have their own slots; control genes keep it obedient and contained.' },
  legs: { name: 'WALKING LEGS', short: 'LEGS', icon: 'cat-limb', cat: 'limb', regs: [8], desc: 'What it stands and runs on. One kind per body plan.' },
  arms: { name: 'FORELIMBS', short: 'ARMS', icon: 'cat-limb', cat: 'limb', regs: [9], desc: 'Claws, scythes, hands and shoulders: limbs that hold and strike.' },
  tail: { name: 'TAIL', short: 'TAIL', icon: 'cat-limb', cat: 'limb', regs: [10], desc: 'Balance, a weapon or an oar. One tail; a sting rides alongside.' },
  wings: { name: 'WINGS', short: 'WING', icon: 'cat-limb', cat: 'limb', regs: [11], desc: 'Flight, if the body stays light enough. One pair type.' },
  eyes: { name: 'EYES', short: 'EYES', icon: 'cat-sense', cat: 'sense', regs: [4], desc: 'How far it sees and what it notices.' },
  senses: { name: 'EARS & FEELERS', short: 'EARS', icon: 'cat-sense', cat: 'sense', regs: [7], desc: 'Antennae, ears, whiskers and stranger organs.' },
  jaw: { name: 'MOUTH', short: 'MOUTH', icon: 'cat-feed', cat: 'feed', regs: [6], desc: 'What it eats decides what it hunts. Every design needs one.' },
  crown: { name: 'HORNS & FRILLS', short: 'HORN', icon: 'cat-defense', cat: 'defense', regs: [5], desc: 'Weapons and displays grown from the skull.' },
  back: { name: 'BACK & ARMOUR', short: 'BACK', icon: 'cat-defense', cat: 'defense', regs: [2], desc: 'Shells, plates, spines and sails along the back.' },
  hide: { name: 'HIDE & COLOUR', short: 'HIDE', icon: 'cat-defense', cat: 'defense', regs: [1, 2], desc: 'Coats, skins and colours: warmth, camouflage, warnings.' },
  organs: { name: 'ORGANS', short: 'ORGAN', icon: 'cat-meta', cat: 'meta', regs: [1], desc: 'Metabolism and brood: how it burns food and how it breeds. Every design needs a way to reproduce.' },
};
/** clicking a region of the specimen opens these tabs (the first is shown) */
export const REG_TABS: Record<number, TabId[]> = {
  1: ['body', 'organs', 'hide', 'back'], 2: ['back', 'hide', 'body', 'organs'], 3: ['senses', 'eyes', 'crown', 'jaw', 'hide'], 4: ['eyes', 'senses', 'crown', 'jaw'],
  5: ['crown', 'eyes', 'senses', 'jaw'], 6: ['jaw', 'eyes', 'senses', 'crown'], 7: ['senses', 'eyes', 'crown', 'jaw'], 8: ['legs', 'arms'], 9: ['arms', 'legs'],
  10: ['tail', 'back'], 11: ['wings', 'arms'],
};

const EYES = new Set(['eye_compound', 'eye_camera', 'eye_binocular', 'eye_bulging', 'eye_spots', 'eye_stalks', 'hominid_eyes']);
const FEELERS = new Set(['antennae', 'ears', 'ears_round', 'whiskers', 'electro']);
const ARMS = new Set(['leg_raptorial', 'chela', 'tentacles', 'hands', 'hump']);
const TAILS = new Set(['tail_balance', 'tail_club', 'tail_fin', 'tail_brush', 'stinger']);
const WINGS = new Set(['wing_gossamer', 'wing_scaled', 'wing_patagium']);
const CROWN = new Set(['horns', 'antlers', 'horns_ram', 'antlers_palm', 'horn_beetle', 'frill']);
const BACK = new Set(['elytra', 'chitin_spines', 'osteoderms', 'quills', 'crest', 'sail', 'shell_scute', 'carapace_crab', 'shell']);
const HIDE = new Set(['fur', 'cryptic', 'shaggy', 'mane', 'aposematic', 'mucus', 'wattle', 'amphib_skin']);
export const WALK = new Set(Object.values(PLAN_LEGS).flat());

export function tabOf(id: string): TabId {
  const g = GENE[id];
  if (!g) return 'organs';
  if (g.cat === 'body') return 'body';
  if (isBio(id)) return 'works';
  if (WALK.has(id)) return 'legs';
  if (EYES.has(id)) return 'eyes';
  if (FEELERS.has(id)) return 'senses';
  if (ARMS.has(id)) return 'arms';
  if (TAILS.has(id)) return 'tail';
  if (WINGS.has(id)) return 'wings';
  if (CROWN.has(id)) return 'crown';
  if (BACK.has(id)) return 'back';
  if (HIDE.has(id)) return 'hide';
  switch (g.cat) { case 'feed': return 'jaw'; case 'sense': return 'senses'; case 'limb': return 'arms'; case 'defense': return 'back'; default: return 'organs'; }
}
/** genes of one exclusive group replace each other */
function group(id: string): string | null {
  if (WALK.has(id)) return 'walk';
  if (WINGS.has(id)) return 'wings';
  if (TAILS.has(id) && id !== 'stinger') return 'tail';
  return null;
}

const BASE_LIMITS: Record<GeneCat, number> = { body: 1, limb: 3, sense: 3, feed: 2, defense: 3, meta: 2, repro: 1 };

/** everything the rules need to know about the player */
export interface LabCtx { run: Run; vaults: number; helix: () => number }
export const has = (c: LabCtx, skill: string) => !!c.run.skills?.has(skill);
/** cross-lineage grafting: the Gene Splicer opens everything but body plans; a Gene Vault and enough lineages do it the old way */
export function spliceLevel(c: LabCtx) { return Math.max(c.run.splice(c.vaults), has(c, 'splice') ? 2 : 0); }
/** genes per category (the Deep Sequencer adds one slot to every open category) */
export function limits(c: LabCtx): Record<GeneCat, number> {
  const seq = has(c, 'sequencer') ? 1 : 0;
  return { body: 1, limb: BASE_LIMITS.limb + seq, sense: BASE_LIMITS.sense + seq, feed: BASE_LIMITS.feed + seq, defense: BASE_LIMITS.defense + seq, meta: BASE_LIMITS.meta + seq, repro: 1 };
}
export function totalSlots(c: LabCtx) { const l = limits(c); return Object.values(l).reduce((a, b) => a + b, 0) + funcLimit(c); }
/** function organs (genesBio.ts) have slots of their own: two, plus the Deep Sequencer and the Bioworks Bureau */
export function funcLimit(c: LabCtx) { return 2 + (has(c, 'sequencer') ? 1 : 0) + (has(c, 'bt_works') ? 1 : 0); }
/** the size slider's ceiling: designs only grow to full size in a Growth Vat */
export const SIZE_CAP_NO_VAT = 0.62;
export function sizeCap(c: LabCtx) { return has(c, 'vat') ? 1 : SIZE_CAP_NO_VAT; }
export function cost(d: Design) { return 3 + Math.max(0, d.genes.length - 4); }

export const PLAN_NAME: Record<Plan, string> = { hexapod: 'Hexapod', octopod: 'Arachnid', quadruped: 'Quadruped', biped: 'Biped', hexapodV: 'Six-Limbed', serpent: 'Serpent', gastropod: 'Gastropod', hominid: 'Hominid' };

/** why a gene cannot go onto this design (null: it can) */
export function lockReason(c: LabCtx, d: Design, g: GeneDef): string | null {
  if (g.cat === 'body') return g.plan ? null : 'Not a body plan';
  if (isPlantGene(g.id)) return 'A plant gene: sow it into a prefab from the Bioworks ledger [J]';
  if (!compatible(g, d.lineage, spliceLevel(c))) {
    if (g.lineage === d.lineage) return 'Incompatible';
    return has(c, 'splice') || spliceLevel(c) > 0
      ? `${LINEAGE_NAMES[g.lineage]} ${CAT_NAMES[g.cat].toLowerCase()} will not take on a ${LINEAGE_NAMES[d.lineage].toLowerCase()} yet`
      : `${LINEAGE_NAMES[g.lineage]} gene: it needs the Gene Splicer to graft onto a ${LINEAGE_NAMES[d.lineage].toLowerCase()}`;
  }
  if (WALK.has(g.id) && !PLAN_LEGS[d.plan].includes(g.id)) return `Walking legs of another body plan (${PLAN_NAME[d.plan]} legs only)`;
  return null;
}

export interface Change { d: Design; dropped: string[]; msg?: string }
const clone = (d: Design): Design => JSON.parse(JSON.stringify(d));

/** put a gene on (body genes switch the plan); returns the new design and what had to make room */
export function install(c: LabCtx, d0: Design, id: string): Change {
  const g = GENE[id];
  if (!g) return { d: d0, dropped: [] };
  if (g.cat === 'body' && g.plan) return switchPlan(c, d0, g.plan);
  const d = clone(d0);
  if (d.genes.includes(id)) return { d, dropped: [] };
  const dropped: string[] = [];
  const grp = group(id);
  if (grp) for (const x of [...d.genes]) if (group(x) === grp) { d.genes = d.genes.filter((y) => y !== x); dropped.push(x); }
  const bio = isBio(id);
  const lim = bio ? funcLimit(c) : limits(c)[g.cat];
  const inCat = () => d.genes.filter((x) => (bio ? isBio(x) : GENE[x]?.cat === g.cat && !isBio(x)));
  while (inCat().length >= lim) {
    const list = inCat();
    const tab = tabOf(id);
    const drop = list.find((x) => tabOf(x) === tab && !WALK.has(x)) ?? list.find((x) => !WALK.has(x)) ?? list[0];
    d.genes = d.genes.filter((x) => x !== drop); dropped.push(drop);
  }
  d.genes.push(id);
  return { d, dropped, msg: dropped.length ? `${g.name} replaces ${dropped.map((x) => GENE[x]?.name ?? x).join(', ')}` : undefined };
}
export function remove(d0: Design, id: string): Change {
  const d = clone(d0);
  if (GENE[id]?.cat === 'body') return { d, dropped: [] };
  d.genes = d.genes.filter((x) => x !== id);
  return { d, dropped: [id] };
}

/** the body plans the player owns */
export function ownedPlans(run: Run): Plan[] {
  const out: Plan[] = [];
  for (const id of run.genes.keys()) { const g = GENE[id]; if (g?.cat === 'body' && g.plan && !out.includes(g.plan)) out.push(g.plan); }
  return out;
}

/** a fresh design for a plan, made of the owned genes that fit it */
export function defaultsFor(run: Run, plan: Plan, seed = Date.now() & 0xffff): Design {
  const r = new Rand(seed);
  const lin = PLAN_LINEAGE[plan];
  const owned = [...run.genes.keys()].map((k) => GENE[k]).filter(Boolean);
  const body = owned.find((g) => g.cat === 'body' && g.plan === plan)?.id ?? Object.values(GENE).find((g) => g.plan === plan)!.id;
  const genes: string[] = [body];
  const legs = PLAN_LEGS[plan].find((l) => run.has(l)); if (legs) genes.push(legs);
  for (const cat of ['sense', 'feed', 'meta', 'repro'] as GeneCat[]) { const g = owned.find((x) => x.cat === cat && x.lineage === lin && !genes.includes(x.id)); if (g) genes.push(g.id); }
  const d: Design = {
    name: '', latin: binomial(r), plan, lineage: lin, genes, size: 0.3, len: 0.5, girth: 0.5, legLen: 0.5, legThick: 0.5, neck: 0.4, head: 0.5, tail: 0.4, segs: 3,
    colors: { base: 0x2f8f6e, belly: 0xb8e8c8, pattern: 0x0e3a30, accent: VEYR.vein, eye: 0x7affe0 }, pattern: 'stripes', patScale: 1,
    cover: lin === 'arthropod' ? 'chitin' : lin === 'vertebrate' ? 'scales' : lin === 'hominid' ? 'skin' : 'slime', seed: r.int(1, 1e6),
  };
  d.name = 'Veyr ' + nameFor(d, r).split(' ')[1];
  fixSegs(d);
  return d;
}

/** switch body plan, keeping colours, name, proportions and every gene that still fits */
export function switchPlan(c: LabCtx, d0: Design, plan: Plan): Change {
  if (d0.plan === plan) return { d: clone(d0), dropped: [] };
  const n = defaultsFor(c.run, plan, d0.seed & 0xffff);
  n.colors = { ...d0.colors }; n.pattern = d0.pattern; n.patScale = d0.patScale; n.name = d0.name || n.name; n.latin = d0.latin; n.seed = d0.seed;
  for (const k of ['size', 'len', 'girth', 'legLen', 'legThick', 'neck', 'head', 'tail'] as const) n[k] = d0[k];
  if (n.lineage !== d0.lineage) n.cover = n.lineage === 'arthropod' ? 'chitin' : n.lineage === 'vertebrate' ? (d0.cover === 'chitin' || d0.cover === 'slime' ? 'scales' : d0.cover) : n.lineage === 'hominid' ? 'skin' : 'slime';
  else n.cover = d0.cover;
  const dropped: string[] = [];
  let d = n;
  for (const id of d0.genes) {
    const g = GENE[id];
    if (!g || g.cat === 'body' || d.genes.includes(id)) continue;
    if (lockReason(c, d, g)) { dropped.push(id); continue; }
    const bio = isBio(id), lim = bio ? funcLimit(c) : limits(c)[g.cat];
    if (d.genes.filter((x) => (bio ? isBio(x) : GENE[x]?.cat === g.cat && !isBio(x))).length >= lim && !group(id)) { dropped.push(id); continue; }
    d = install(c, d, id).d;
  }
  fixSegs(d);
  return { d, dropped, msg: `Re-grown as a ${PLAN_NAME[plan].toLowerCase()}${dropped.length ? `; ${dropped.length} gene${dropped.length > 1 ? 's' : ''} would not carry over` : ''}` };
}

export function fixSegs(d: Design) { d.segs = d.plan === 'serpent' ? Math.round(7 + d.len * 6) : Math.round(2 + d.len * 2); }

/** what stops it being filed (false: nothing) */
export function invalid(c: LabCtx, d: Design): string | false {
  if (!d.genes.some((g) => GENE[g]?.cat === 'body')) return 'No body plan';
  if (!d.genes.some((g) => GENE[g]?.cat === 'feed')) return 'It needs a mouth to feed';
  if (!d.genes.some((g) => GENE[g]?.cat === 'repro' && !isBio(g))) return 'It needs a way to reproduce';
  if (d.genes.some((g) => isPlantGene(g))) return 'Plant genes go onto plants';
  if (PLAN_LEGS[d.plan].length && !d.genes.some((g) => PLAN_LEGS[d.plan].includes(g))) return 'It needs legs to move';
  if (c.helix() < cost(d)) return `Needs ${cost(d)} helix`;
  if (!d.name.trim()) return 'Name it';
  return false;
}

/** sanitize a design loaded into the tank: genes the player does not own are kept (they came with it), the size is capped */
export function intoTank(c: LabCtx, d0: Design): { d: Design; capped: boolean } {
  const d = clone(d0);
  const cap = sizeCap(c);
  const capped = d.size > cap + 1e-3;
  d.size = clamp(d.size, 0, cap);
  fixSegs(d);
  return { d, capped };
}

/**
 * The donor design a part icon is grown from: this specimen with the gene grafted on when it fits (so the part is
 * shown at its proportions and in its colours), else the species it was absorbed from, else a plain body of its lineage.
 */
export function donorFor(c: LabCtx, base: Design, id: string): Design {
  const g = GENE[id];
  if (!g) return base;
  if (g.cat === 'body' && g.plan) return switchPlan(c, base, g.plan).d;
  if (!lockReason(c, base, g)) { const d = install(c, base, id).d; return d; }
  const from = c.run.genes.get(id)?.from;
  const sp = from ? c.run.reg.list.find((s) => s.name === from && s.design.genes.includes(id)) : undefined;
  if (sp) return clone(sp.design);
  const plan: Plan = WALK.has(id) ? (Object.keys(PLAN_LEGS) as Plan[]).find((p) => PLAN_LEGS[p].includes(id))! : ({ arthropod: 'hexapod', vertebrate: 'quadruped', annelid: 'serpent', mollusc: 'gastropod', hominid: 'hominid' } as Record<Lineage, Plan>)[g.lineage];
  const d = defaultsFor(c.run, plan, 77);
  d.colors = { ...base.colors };
  const body = Object.values(GENE).find((x) => x.plan === plan)!.id;
  d.genes = [body, ...(PLAN_LEGS[plan].length ? [PLAN_LEGS[plan].includes(id) ? id : PLAN_LEGS[plan][0]] : []), ...(PLAN_LEGS[plan].includes(id) ? [] : [id])];
  return d;
}

/** a short stat line for a gene card: "+5.0 SPD · +40 HP" */
export function fxLine(g: GeneDef, max = 3): string {
  const LBL: Record<string, string> = { hp: 'HP', armor: 'ARM', speed: 'SPD', attack: 'ATK', attackRate: 'RATE', reach: 'REACH', sight: 'SIGHT', smell: 'SMELL', stealth: 'STEALTH', upkeep: 'UPKEEP', regen: 'REGEN', stamina: 'STAM', poison: 'VENOM', reflect: 'THORNS', litter: 'BROOD', gestation: 'GEST', maturity: 'MATURE', cold: 'COLD', heat: 'HEAT', jump: 'JUMP', fly: 'FLIGHT', swim: 'SWIM', climb: 'CLIMB', glow: 'GLOW' };
  const pct = new Set(['armor', 'stealth', 'reflect']);
  const out: string[] = [];
  for (const [k, v] of Object.entries(g.fx ?? {})) {
    if (!v || !LBL[k]) continue;
    if (k === 'fly' || k === 'glow') { out.push(LBL[k]); continue; }
    const s = pct.has(k) ? `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` : `${v > 0 ? '+' : ''}${Math.abs(v) >= 10 ? Math.round(v) : +v.toFixed(2)}`;
    out.push(`${s} ${LBL[k]}`);
    if (out.length >= max) break;
  }
  if (g.diet) out.unshift(g.diet === 'carn' ? 'CARNIVORE' : g.diet === 'herb' ? 'HERBIVORE' : g.diet === 'scav' ? 'SCAVENGER' : 'OMNIVORE');
  return out.slice(0, max).join(' · ');
}
