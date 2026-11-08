// The player's profile on this browser: things unlocked across runs (occupations,
// traits, cosmetic extras) and a few lifetime stats. It outlives saves and deaths.
import { bus } from '../core/events';

export interface Profile { v: 1; unlocked: string[]; stats: Record<string, number>; }

const KEY = 'noclip.profile';
let cache: Profile | null = null;

export function profile(): Profile {
  if (cache) return cache;
  let p: Profile | null = null;
  try { const s = localStorage.getItem(KEY); if (s) p = JSON.parse(s); } catch { /* storage blocked: in-memory only */ }
  cache = p && p.v === 1 ? { v: 1, unlocked: p.unlocked || [], stats: p.stats || {} } : { v: 1, unlocked: [], stats: {} };
  return cache;
}
function persist() { dirty = false; try { localStorage.setItem(KEY, JSON.stringify(profile())); } catch { /* ignore */ } }

/** Unlock ids are namespaced: 'job:<occupationKey>', 'trait:<traitKey>', anything else is free-form. */
export function isUnlocked(id: string): boolean { return profile().unlocked.includes(id); }

/** Returns true the first time; emits bus 'unlocked' (id) so the UI can celebrate it. */
export function unlock(id: string): boolean {
  const p = profile();
  if (p.unlocked.includes(id)) return false;
  p.unlocked.push(id);
  persist();
  bus.emit('unlocked', id);
  return true;
}

export function addStat(key: string, n = 1) { const p = profile(); p.stats[key] = (p.stats[key] || 0) + n; persist(); }
export function stat(key: string) { return profile().stats[key] || 0; }

// ---------------------------------------------------------------- buffered stats
// Continuous counters (seconds sneaking, metres driven, hours outdoors) change
// every frame; they are accumulated in memory and written at most every few
// seconds (and when the page is hidden) instead of on every call.
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** add to a stat without writing storage immediately */
export function bumpStat(key: string, n: number) {
  if (!n) return;
  const p = profile();
  p.stats[key] = (p.stats[key] || 0) + n;
  dirty = true;
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; if (dirty) persist(); }, 8000);
}
/** raise a stat to at least v (records, e.g. longest run) */
export function maxStat(key: string, v: number) {
  const p = profile();
  if ((p.stats[key] || 0) >= v) return;
  p.stats[key] = v;
  dirty = true;
  if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; if (dirty) persist(); }, 8000);
}
export function flushStats() { if (dirty) persist(); }
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', flushStats);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushStats(); });
}

/** every unlock id earned so far (optionally only one namespace, e.g. 'job:') */
export function unlockedIds(prefix = ''): string[] { return profile().unlocked.filter((u) => u.startsWith(prefix)); }

/** dev/testing helper */
export function resetProfile() { cache = { v: 1, unlocked: [], stats: {} }; persist(); }
