// The crew's lasting state, saved in localStorage ('oddworld.crew'): who has died (how, which day, where), the
// crew's mood (0 broken .. 1 high) and its ceiling (every death lowers it for good), a moment of silence owed, and
// the intro flag. Events: 'death' (id, how), 'mood' (mood).
import type { CrewId } from './roster';

export interface Death { how: string; day: number; where: string; cause?: string }
export interface CrewSave {
  dead: Partial<Record<CrewId, Death>>;
  /** 0..1 */
  mood: number;
  /** the ceiling mood recovers to (lowered by each death, for good) */
  moodCap: number;
  /** a moment of silence is owed (the crew gathers at the plaque next time they are seen) */
  silence: boolean;
  /** the intro has played (or was skipped) */
  intro: boolean;
  /** the ship day (advanced by the hub's clock and by the planet) */
  day: number;
  save(): void;
}
const KEY = 'oddworld.crew';
let S: CrewSave | null = null;
export function crewState(): CrewSave {
  if (S) return S;
  let d: Partial<CrewSave> = {};
  try { d = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { d = {}; }
  S = {
    dead: d.dead && typeof d.dead === 'object' ? d.dead : {}, mood: typeof d.mood === 'number' ? d.mood : 0.8, moodCap: typeof d.moodCap === 'number' ? d.moodCap : 0.85,
    silence: !!d.silence, intro: !!d.intro, day: typeof d.day === 'number' ? d.day : 1,
    save() { try { const { save: _s, ...rest } = S!; void _s; localStorage.setItem(KEY, JSON.stringify(rest)); } catch { /* storage off */ } },
  };
  return S;
}
/** a new game: everyone alive, spirits high (the intro flag is kept unless `intro` is true) */
export function resetCrew(intro = false) {
  const s = crewState(); s.dead = {}; s.mood = 0.8; s.moodCap = 0.85; s.silence = false; s.day = 1; if (intro) s.intro = false; s.save();
  emitCrew('mood', s.mood);
}

type Fn = (...a: unknown[]) => void;
const ev = new Map<string, Set<Fn>>();
export function onCrew(name: 'death' | 'mood', fn: Fn) { let s = ev.get(name); if (!s) ev.set(name, (s = new Set())); s.add(fn); return () => { s!.delete(fn); }; }
export function emitCrew(name: string, ...a: unknown[]) { for (const f of ev.get(name) ?? []) try { f(...a); } catch (e) { console.error('crew event', name, e); } }

/** nudge the mood (clamped to 0..cap); returns the new value */
export function moodShift(k: number) { const s = crewState(); s.mood = Math.max(0, Math.min(s.moodCap, s.mood + k)); s.save(); emitCrew('mood', s.mood); return s.mood; }
/** a day passes: the mood heals a little toward its ceiling */
export function crewDay() { const s = crewState(); s.day++; s.mood = Math.min(s.moodCap, s.mood + 0.04); s.save(); emitCrew('mood', s.mood); }
