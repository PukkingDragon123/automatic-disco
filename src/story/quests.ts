// game.quests: the quest log (data: questData.ts). Quests start from a chain (`next`) or when their `after`
// condition holds; their steps count game events; finishing pays knowledge, items, closeness and morale, and the
// giver says their line on the subtitle strip. The tracker (src/story/tracker.ts) shows the active ones.
//   active()            the running quests, newest first
//   done(id)            finished
//   progress(id)        [steps done, steps]
//   start(id)           offer a quest now (story beats, tests)
//   hit(kind, n?)       count a step kind from anywhere: quests.hit('decor:photo')
//   on('start' | 'step' | 'done', fn({ id, q }))
import type { Game } from '../game/game';
import { QUESTS, QUEST, type QuestDef } from './questData';
import { anyG, give, have } from '../research/util';
import { DATA_KINDS, type DataKind } from '../research/tech';

type Ev = 'start' | 'step' | 'done';
interface Live { id: string; n: number[]; t: number }

export class Quests {
  private live = new Map<string, Live>();
  private fin = new Set<string>();
  private fns: Record<string, ((d: any) => void)[]> = {};
  private lastJob = new Map<string, unknown>();
  /** the line-speaker (src/social): set by the installer */
  say: ((who: string, lines: string[]) => void) | null = null;
  constructor(readonly g: Game | null) {}
  on(ev: Ev, fn: (d: any) => void) { (this.fns[ev] ??= []).push(fn); return () => { const a = this.fns[ev]; const i = a?.indexOf(fn) ?? -1; if (i >= 0) a!.splice(i, 1); }; }
  private emit(ev: Ev, d: any) { for (const f of this.fns[ev] ?? []) { try { f(d); } catch (e) { console.error('quests', ev, e); } } anyG(this.g!)?.emit?.('quest', { ...d, phase: ev }); }

  active(): { q: QuestDef; n: number[] }[] { return [...this.live.values()].sort((a, b) => b.t - a.t).map((l) => ({ q: QUEST[l.id], n: l.n })); }
  isActive(id: string) { return this.live.has(id); }
  done(id: string) { return this.fin.has(id); }
  progress(id: string): [number, number] {
    const q = QUEST[id]; if (!q) return [0, 1];
    if (this.fin.has(id)) return [q.steps.length, q.steps.length];
    const l = this.live.get(id); if (!l) return [0, q.steps.length];
    return [q.steps.filter((s, i) => l.n[i] >= (s.n ?? 1)).length, q.steps.length];
  }
  start(id: string) {
    const q = QUEST[id]; if (!q || this.fin.has(id) || this.live.has(id)) return;
    this.live.set(id, { id, n: q.steps.map(() => 0), t: performance.now() + this.live.size });
    this.emit('start', { id, q });
    this.say?.(q.giver, q.start);
    this.poll(); // a step may already hold (data in hand, a bond already close)
  }
  /** count a step kind for every running quest that wants it */
  hit(kind: string, n = 1) {
    for (const l of [...this.live.values()]) {
      const q = QUEST[l.id]; let moved = false;
      q.steps.forEach((s, i) => {
        const need = s.n ?? 1;
        if (l.n[i] >= need) return;
        // a step before this one must be done first (steps run in order)
        if (q.steps.slice(0, i).some((p, j) => l.n[j] < (p.n ?? 1))) return;
        if (s.k === kind || (s.k === 'decor' && kind.startsWith('decor:')) || (s.k === 'build' && kind.startsWith('build:')) || (s.k === 'sample' && kind.startsWith('sample:'))) { l.n[i] = Math.min(need, l.n[i] + n); moved = true; }
      });
      if (moved) { this.emit('step', { id: l.id, q }); this.check(l); }
    }
  }
  /** steps that read a level rather than count an event */
  private set(kind: string, v: number) {
    for (const l of this.live.values()) {
      const q = QUEST[l.id]; let moved = false;
      q.steps.forEach((s, i) => { if (s.k === kind) { const nv = Math.min(s.n ?? 1, Math.floor(v)); if (nv !== l.n[i]) { l.n[i] = nv; moved = true; } } });
      if (moved) { this.emit('step', { id: l.id, q }); this.check(l); }
    }
  }
  private check(l: Live) {
    const q = QUEST[l.id];
    if (!q.steps.every((s, i) => l.n[i] >= (s.n ?? 1))) return;
    this.live.delete(l.id); this.fin.add(l.id);
    this.pay(q);
    this.say?.(q.giver, q.done);
    this.emit('done', { id: l.id, q });
    for (const n of q.next ?? []) this.start(n);
  }
  private pay(q: QuestDef) {
    const G = anyG(this.g!); if (!G) return;
    const r = q.reward;
    for (const k of DATA_KINDS) if (r.know?.[k]) G.research?.addData?.(k as DataKind, r.know[k]!, q.title);
    if (r.items && this.g) give(this.g, r.items);
    for (const id in r.close ?? {}) G.social?.add?.(id, r.close![id], 'quest');
    if (r.morale) { const C = G.colony; if (C) { for (const t of C.teammates ?? []) if (t.alive) t.morale = Math.min(100, t.morale + r.morale); if (C.vitals) C.vitals.morale = Math.min(100, C.vitals.morale + r.morale); } }
  }
  /** polled each second: levels, orders, offers */
  poll() {
    const G = anyG(this.g!); if (!G) return;
    const R = G.research;
    if (R) for (const k of DATA_KINDS) this.set('know:' + k, R.total?.[k] ?? 0);
    if (G.social) for (const id of ['guide', 'kristiansen', 'mamani']) this.set('close:' + id, G.social.level(id));
    // a teammate given an order by the player
    for (const t of G.colony?.teammates ?? []) {
      const j = t.job; if (j && j.player && this.lastJob.get(t.id) !== j) { this.lastJob.set(t.id, j); this.hit('order'); }
    }
    // offers that wait on a condition
    for (const q of QUESTS) {
      if (!q.after || this.fin.has(q.id) || this.live.has(q.id)) continue;
      const a = q.after;
      if (a.node && !G.unlocks?.owns?.(a.node)) continue;
      if (a.quest && !this.fin.has(a.quest)) continue;
      if (a.close && (G.social?.level?.(a.close[0]) ?? 0) < a.close[1]) continue;
      if (a.event && !G.director?.done?.has?.(a.event)) continue;
      // chained quests wait for their chain
      if (QUESTS.some((p) => p.next?.includes(q.id) && !this.fin.has(p.id))) continue;
      this.start(q.id);
    }
    void have;
  }
  toJSON() { return { live: [...this.live.values()], fin: [...this.fin] }; }
  load(d: any) {
    if (!d || typeof d !== 'object') return;
    for (const id of Array.isArray(d.fin) ? d.fin : []) if (QUEST[id]) this.fin.add(id);
    for (const l of Array.isArray(d.live) ? d.live : []) if (l && QUEST[l.id] && !this.fin.has(l.id)) this.live.set(l.id, { id: l.id, n: QUEST[l.id].steps.map((_, i) => Number(l.n?.[i]) || 0), t: Number(l.t) || 0 });
  }
  get started() { return this.fin.size > 0 || this.live.size > 0; }
}
