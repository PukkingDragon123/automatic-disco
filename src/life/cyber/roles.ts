// CYBORG WORKERS: what a fitted creature is good for. The role comes from the fittings and the genes stacked on the
// same body ("engineered to the max": function organs, senses, size and the hardware all add up), and with it the
// numbers the colony's logistics need: carry capacity (item units), walking speed, a skill per job (0..10), armour,
// sight, obedience, and its upkeep: food (biomass), rest, maintenance of the parts, power, and the morale it starts
// from. Pure logic over a Design: the node map and src/factory/workers.ts read workerProfile().
import { pheno, type Design } from '../design';
import { GENE } from '../genes';
import { BIO } from '../genesBio';
import { CYBER, ROLES, ROLE_NAME, ROLE_SKILL, SKILLS, type Role, type Skill } from './catalog';

export interface WorkerNeeds {
  /** biomass (food units) per minute of work */
  food: number;
  /** minutes of work before it must rest, and minutes of rest it then takes */
  work: number; rest: number;
  /** wear of the fitted parts per hour of work (0..1 of a full overhaul); 0 for an unfitted animal */
  maint: number;
  /** power the machinery draws per minute (negative: it carries its own cell) */
  power: number;
  /** morale it settles at when fed, rested and maintained (0..1) */
  morale: number;
}
export interface WorkerProfile {
  role: Role; roleName: string;
  /** 0..10 per job */
  skills: Record<Skill, number>;
  /** item units it carries at once */
  carry: number;
  /** walking speed, m/s */
  speed: number;
  armour: number; sight: number;
  /** obedience: 0 a wild animal, 1 a collared one that never strays */
  control: number;
  needs: WorkerNeeds;
  /** the fitted parts, the genes that count, readable tags ("HYDRAULIC LEGS", "DIGGER ORGANS") */
  parts: string[]; tags: string[];
  /** a one-line summary: "HAULER · 46 UNITS · 4.2 M/S" */
  line: string;
}

/** what a function organ's kind is worth toward the jobs */
const FN_SKILL: Record<string, Partial<Record<Skill, number>>> = {
  dig: { dig: 2.5 }, tunnel: { dig: 3 }, mound: { dig: 1.5, build: 1 }, spring: { dig: 1, farm: 1 },
  ore: { dig: 2 }, silica: { dig: 1.5 }, crystal: { dig: 1.5 },
  silk: { farm: 1.5 }, oil: { farm: 1.5 }, milk: { farm: 1.5 }, fleece: { farm: 1.5 }, resin: { farm: 1.2 }, metalroot: { farm: 1, dig: 0.5 }, algae: { farm: 1.5 }, fruit: { farm: 2 },
  nitro: { farm: 2 }, greener: { farm: 2 }, wetland: { farm: 1.5 }, binder: { farm: 1.5, build: 0.5 }, pollinate: { farm: 2.5 }, decompose: { farm: 1.5 }, pest: { farm: 1.5, scout: 0.5 },
  haul: { haul: 3 }, operate: { operate: 3 }, guard: { guard: 3 }, soldier: { guard: 3.5 },
};
/** plain genes that help a job */
const GENE_SKILL: Record<string, Partial<Record<Skill, number>>> = {
  eye_binocular: { scout: 0.8, guard: 0.4 }, eye_camera: { scout: 1 }, eye_compound: { scout: 0.6 }, eye_stalks: { scout: 0.5 }, ears: { scout: 0.6 }, ears_round: { scout: 0.5 }, antennae: { scout: 0.6 }, whiskers: { scout: 0.3 },
  horns: { guard: 1 }, horns_ram: { guard: 1 }, antlers: { guard: 0.8 }, horn_beetle: { guard: 1, dig: 0.5 }, tusks: { guard: 0.8, dig: 0.6 }, tail_club: { guard: 1 }, stinger: { guard: 1 },
  osteoderms: { guard: 0.8 }, shell: { guard: 0.8 }, carapace_crab: { guard: 0.8 }, quills: { guard: 0.6 },
  hands: { operate: 1.5, build: 1.2 }, chela: { dig: 0.8, operate: 0.6 }, leg_raptorial: { guard: 0.8 }, tentacles: { operate: 1 },
  hump: { haul: 1.2 }, leg_cursorial: { scout: 0.8 }, leg_padded: { haul: 0.5 }, leg_pillar: { haul: 1 }, wing_patagium: { scout: 1 }, wing_gossamer: { scout: 1 },
  molars: { farm: 0.3 }, digclaws: { dig: 1 },
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const cl = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function workerProfile(d: Design): WorkerProfile {
  const p = pheno(d), st = p.stats;
  const fit = (d.fit ?? []).filter((id) => CYBER[id]);
  const sk = Object.fromEntries(SKILLS.map((s) => [s, 0])) as Record<Skill, number>;
  const add = (o: Partial<Record<Skill, number>> | undefined, k = 1) => { if (o) for (const s in o) sk[s as Skill] += (o[s as Skill] ?? 0) * k; };
  // what the fitted hardware alone gives: the role follows the machinery first, the animal second
  const hw = Object.fromEntries(SKILLS.map((s) => [s, 0])) as Record<Skill, number>;
  const tags: string[] = [];
  // the body: big animals haul and guard, small fast ones scout
  const mass = Math.max(0.3, st.mass), big = Math.log10(mass + 1);
  sk.haul += cl(big - 1, 0, 2.2); sk.guard += cl(big - 1.2, 0, 1.6) + st.attack * 0.03; sk.scout += cl((st.speed - 3) * 0.35, 0, 1.6) + st.sight * 0.02;
  // genes: function organs by what they do, plain genes by what they help
  for (const id of d.genes) {
    const b = BIO[id];
    if (b) { add(FN_SKILL[b.fn.kind]); if (FN_SKILL[b.fn.kind]) tags.push(GENE[id]?.name.toUpperCase() ?? id); }
    else add(GENE_SKILL[id], 1);
  }
  // the hardware
  let carry = 2 + Math.pow(mass / 40, 0.67) * 3, speed = st.speed, armour = st.armor, sight = st.sight, control = 0, wear = 0, power = 0;
  for (const id of fit) {
    const c = CYBER[id];
    add(c.skills); for (const k in c.skills) hw[k as Skill] += c.skills[k as Skill] ?? 0; carry += c.carry ?? 0; speed += c.speed ?? 0; armour += c.armour ?? 0; sight += c.sight ?? 0; control += c.control ?? 0; wear += c.wear; power += c.power;
    tags.push(c.name.toUpperCase());
  }
  const docile = d.genes.some((g) => BIO[g]?.fn.kind === 'docile'), locked = d.genes.some((g) => BIO[g]?.fn.kind === 'lock');
  control = cl(control * 0.75 + (docile ? 0.35 : 0) + (locked ? 0.15 : 0), 0, 1);
  // a collar coordinates whatever else is fitted
  if (control > 0.5) for (const s of SKILLS) sk[s] *= 1.12;
  for (const s of SKILLS) sk[s] = r1(cl(sk[s], 0, 10));
  const score = (r: Role) => sk[ROLE_SKILL[r]] + hw[ROLE_SKILL[r]] * 0.6;
  const role = ROLES.reduce((a, b) => (score(b) > score(a) + 1e-6 ? b : a), 'hauler' as Role);
  carry = Math.round(carry * (sk.haul > 2 ? 1 + sk.haul * 0.05 : 1));
  speed = r1(Math.max(0.6, speed));
  const food = r1(cl(0.2 + st.upkeep * 1.5 + Math.sqrt(mass) * 0.03 + fit.length * 0.05, 0.1, 8));
  const strain = fit.length * 0.035;
  const needs: WorkerNeeds = {
    food, work: Math.round(cl(22 + st.stamina * 6 + control * 6, 12, 50)), rest: Math.round(cl(8 - st.stamina * 0.8, 3, 10)),
    maint: r1(wear), power: r1(power), morale: r1(cl(0.55 + control * 0.3 + (docile ? 0.1 : 0) - strain, 0.15, 0.95)),
  };
  return {
    role, roleName: ROLE_NAME[role], skills: sk, carry, speed, armour: r1(armour), sight: Math.round(sight), control: r1(control), needs,
    parts: fit, tags, line: `${ROLE_NAME[role]} · ${carry} UNITS · ${speed.toFixed(1)} M/S`,
  };
}
