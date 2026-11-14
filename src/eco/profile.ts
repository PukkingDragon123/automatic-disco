// How a species lives: when it is awake, who it keeps company with, where it sleeps, how it hunts, what it eats
// besides its staple. Derived once per species from its ecological role, diet, body and genes (stable per species).
import type { Creature } from '../game/creature';
import type { World } from '../game/world';
import type { Role } from '../life/design';
import { hash01, clamp } from '../core/rand';

/** day (diurnal), night (nocturnal) or dusk (crepuscular: dawn and dusk) */
export type Sched = 'day' | 'night' | 'dusk';
export type Social = 'herd' | 'pack' | 'solo' | 'swarm';
export type Guild = 'grazer' | 'browser' | 'predator' | 'scavenger' | 'decomposer' | 'forager';

export interface Profile {
  role: Role | 'owned';
  guild: Guild;
  sched: Sched;
  social: Social;
  /** sleeps in a den or nest it keeps (else in the open, herds together) */
  den: boolean;
  /** lies in wait at drinking spots instead of stalking */
  ambush: boolean;
  territorial: boolean;
  /** eats fruit and spreads the seeds in its dung */
  fruit: boolean;
  /** rests in the shade at midday in hot country */
  shade: boolean;
  /** a herd keeps one awake while the rest sleep */
  sentry: boolean;
  /** how fast it dries out (snails and mites take water from the damp) */
  thirstK: number;
  /** how far it ranges from home (m) */
  range: number;
  /** herd spacing */
  spread: number;
}

const cache = new Map<number, Profile>();

/** the ecological role of a species' founding line ('owned' for designs) */
export function roleOf(w: World, c: Creature): Role | 'owned' {
  let s = c.sp;
  while (s.parent !== null) s = w.reg.get(s.parent);
  return w.roles.get(s.id) ?? 'owned';
}

export function profileOf(c: Creature, w: World): Profile {
  const hit = cache.get(c.sp.id);
  if (hit) return hit;
  const sp = c.sp, st = sp.pheno.stats, diet = sp.pheno.diet, role = roleOf(w, c);
  const h = (k: number) => hash01(sp.id * 7 + 3, sp.design.seed & 0xffff, k);
  const hot = w.region.biome.temp > 0.62;
  const glow = st.glow > 0 || sp.design.genes.some((g) => /glow|lumin|night|tapet/.test(g));
  let p: Profile;
  switch (role) {
    case 'grazer': p = base('grazer', 'day', 'herd', { sentry: true, shade: hot, range: 34, spread: 5 }); break;
    case 'tank': p = base('grazer', 'day', 'herd', { sentry: true, shade: hot, territorial: true, thirstK: 1.2, range: 30, spread: 6 }); break;
    case 'mite': p = base('forager', h(1) < 0.5 ? 'night' : 'dusk', 'swarm', { fruit: true, thirstK: 0.45, range: 18, spread: 3 }); break;
    case 'flyer': p = base('forager', 'day', 'swarm', { fruit: true, thirstK: 0.7, range: 40, spread: 4 }); break;
    case 'snail': p = base('decomposer', 'night', 'solo', { den: true, thirstK: 0.2, range: 14, spread: 3 }); break;
    case 'scavenger': p = base('scavenger', h(2) < 0.55 ? 'day' : 'dusk', 'solo', { den: true, range: 50, spread: 6 }); break;
    case 'stalker': p = base('predator', h(3) < 0.6 ? 'night' : 'dusk', 'pack', { den: true, territorial: true, ambush: st.swim > 0 || st.stealth > 0.32, range: 40, spread: 5 }); break;
    case 'apex': p = base('predator', 'dusk', 'solo', { den: true, territorial: true, range: 56, spread: 8 }); break;
    default: {
      // designs and anything unknown: read it off the body
      const carn = diet === 'carn', scav = diet === 'scav';
      p = base(carn ? 'predator' : scav ? 'scavenger' : 'grazer', carn ? 'dusk' : 'day', carn ? 'solo' : 'herd', { den: carn || scav, range: 30, spread: 5, sentry: !carn });
    }
  }
  if (glow && p.sched === 'day') p.sched = 'dusk';
  if (glow && p.guild !== 'grazer') p.sched = 'night';
  if (diet === 'omni' && p.guild === 'grazer') p.fruit = true;
  if (diet === 'carn' && p.guild === 'forager') p.guild = 'predator';
  if (diet === 'carn' && (role === 'snail')) p.guild = 'decomposer';
  if (sp.pheno.canFly) { p.shade = false; p.den = false; }
  // bats: out at night after fruit and moths, hung up asleep by day
  if (sp.pheno.canFly && (sp.design.beast === 'duskwing' || sp.design.genes.includes('wing_patagium'))) { p.sched = 'night'; p.fruit = true; p.social = 'swarm'; }
  if (st.swim > 0 && p.guild === 'predator') p.ambush = true;
  p.thirstK *= clamp(1 + (w.region.biome.temp - 0.55) * 0.8, 0.7, 1.4);
  cache.set(sp.id, p);
  return p;

  function base(guild: Guild, sched: Sched, social: Social, o: Partial<Profile>): Profile {
    return { role, guild, sched, social, den: false, ambush: false, territorial: false, fruit: false, shade: false, sentry: false, thirstK: 1, range: 30, spread: 5, ...o };
  }
}

// ------------------------------------------------------------------------------------------------ the clock
// world.day runs 0..1: 0 sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight.
/** how awake a schedule is at this time of day, 0 (asleep) .. 1 (fully active) */
export function activity(s: Sched, day: number): number {
  const d = ((day % 1) + 1) % 1;
  if (s === 'day') {
    // stirring just before sunrise, settling down after sunset
    const e = d > 0.85 ? d - 1 : d;
    return clamp(Math.min((e + 0.05) / 0.08, (0.53 - e) / 0.07), 0, 1);
  }
  if (s === 'night') { const e = d < 0.3 ? d + 1 : d; return clamp(Math.min((e - 0.47) / 0.07, (1.04 - e) / 0.07), 0, 1); }
  // dusk and dawn: the edges of the day, a little at night, little at noon
  const dawn = 1 - Math.min(1, Math.abs(((d + 0.5) % 1) - 0.5) / 0.12);
  const dusk = 1 - Math.min(1, Math.abs(d - 0.5) / 0.12);
  return clamp(Math.max(dawn, dusk) + (d > 0.5 ? 0.3 : 0.08), 0, 1);
}
/** the hottest hours (a short siesta in hot country) */
export function midday(day: number) { const d = ((day % 1) + 1) % 1; return d > 0.16 && d < 0.34; }
/** the last hours before sleep (a drink before bed) */
export function evening(s: Sched, day: number) {
  const d = ((day % 1) + 1) % 1;
  return s === 'day' ? d > 0.4 && d < 0.52 : s === 'night' ? d > 0.9 || d < 0.04 : d > 0.08 && d < 0.14;
}
/** the first hours after waking */
export function morning(s: Sched, day: number) {
  const d = ((day % 1) + 1) % 1;
  return s === 'day' ? d < 0.12 || d > 0.97 : s === 'night' ? d > 0.5 && d < 0.6 : d > 0.95 || d < 0.06 || (d > 0.46 && d < 0.54);
}
