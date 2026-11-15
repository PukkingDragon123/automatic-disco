// What the player has learned. Buildings and logistics features unlock through the progression agent's RESEARCH and
// MASTERY (game.research / game.mastery, src/research/*) when those are installed; until then the old skill tree
// (run.skills) and the logistics discipline below stand in. Logistics is also LEARNED BY DOING: every item a route
// delivers is experience, and the logic nodes come one tier at a time (src/logistics/network.ts counts it).
import type { Game } from '../game/game';
import { FDEFS, type FKind } from '../factory/defs';
import { SKILL } from '../game/skills';

interface Research { unlocked?(id: string): boolean; has?(id: string): boolean; requirementOf?(id: string): string | null }
interface Mastery { has?(id: string): boolean; mod?(k: string): number; add?(k: string): number; level?(p: string): number }
export const research = (g: Game) => (g as unknown as { research?: Research }).research ?? null;
export const mastery = (g: Game) => (g as unknown as { mastery?: Mastery }).mastery ?? null;
/** a mastery multiplier (1 when mastery is not installed) */
export const mod = (g: Game, k: string) => { try { const v = mastery(g)?.mod?.(k); return typeof v === 'number' && v > 0 ? v : 1; } catch { return 1; } };
export const flat = (g: Game, k: string) => { try { const v = mastery(g)?.add?.(k); return typeof v === 'number' ? v : 0; } catch { return 0; } };

/** ?unlockall on the URL opens everything (screenshots, tests) */
const ALL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlockall');

export interface Lock { ok: boolean; why: string; by: 'research' | 'mastery' | 'skill' | 'discipline' | '' }

/** can this building be placed yet, and if not, the one short line that says what unlocks it */
export function buildingLock(g: Game, kind: FKind): Lock {
  if (ALL) return { ok: true, why: '', by: '' };
  const r = research(g), def = FDEFS[kind];
  if (r?.unlocked) {
    try {
      if (r.unlocked(kind)) return { ok: true, why: '', by: '' };
      const why = r.requirementOf?.(kind) ?? 'RESEARCH REQUIRED';
      return { ok: false, why: why.toUpperCase(), by: /LV|ENGINEERING|MASTERY/i.test(why) ? 'mastery' : 'research' };
    } catch { /* fall through to the skill tree */ }
  }
  if (!def?.skill || g.run.skills.has(def.skill)) return { ok: true, why: '', by: '' };
  return { ok: false, why: `SKILL: ${(SKILL[def.skill]?.name ?? def.skill).toUpperCase()}`, by: 'skill' };
}

/** logistics features, their discipline tier (items routed to learn them) and a plain description */
export const FEATURES: { id: string; name: string; tier: number; what: string }[] = [
  { id: 'routes.basic', name: 'Haul routes', tier: 0, what: 'Wire a source to a destination; workers carry it.' },
  { id: 'routes.conditions', name: 'Route conditions', tier: 1, what: 'Only move when the source is above, the target below, by day, with power.' },
  { id: 'logic.split', name: 'Splitter', tier: 2, what: 'Deal one supply out to several destinations by ratio.' },
  { id: 'logic.merge', name: 'Merger', tier: 2, what: 'Draw several sources into one destination in turn.' },
  { id: 'logic.buffer', name: 'Buffer', tier: 3, what: 'Fill a target to a high mark, refill only below a low mark.' },
  { id: 'logic.counter', name: 'Counter', tier: 3, what: 'Pass exactly N items, then close and raise a signal.' },
  { id: 'logic.gate', name: 'Gate', tier: 4, what: 'Pass only while its conditions or a signal hold.' },
  { id: 'logic.timer', name: 'Timer', tier: 4, what: 'Open for a set time in every cycle (shift work).' },
  { id: 'logic.sensor', name: 'Sensor', tier: 5, what: 'Read a store, a machine or the grid and raise a signal.' },
  { id: 'routes.templates', name: 'Chain templates', tier: 1, what: 'Save a working chain and lay it again elsewhere.' },
];
/** items a route network must deliver to reach each discipline tier */
export const TIER_XP = [0, 40, 160, 420, 900, 1800];
export const tierOf = (xp: number) => { let t = 0; for (let i = 0; i < TIER_XP.length; i++) if (xp >= TIER_XP[i]) t = i; return t; };

/** is a logistics feature open: research says so, or the discipline tier reached it (learned by doing) */
export function featureLock(g: Game, id: string, xp: number): Lock {
  const f = FEATURES.find((x) => x.id === id);
  if (ALL || !f || f.tier === 0) return { ok: true, why: '', by: '' };
  if (tierOf(xp) >= f.tier) return { ok: true, why: '', by: '' };
  const r = research(g);
  try { if (r?.unlocked?.(id)) return { ok: true, why: '', by: '' }; } catch { /* stub */ }
  const left = TIER_XP[f.tier] - xp;
  return { ok: false, why: `ROUTE ${left} MORE ITEMS`, by: 'discipline' };
}
