// The event director. It watches the colony and, every few minutes of game time, rolls a random event weighted by
// the colony's state and the difficulty; then it plays the event's cinematic, pauses the colony for the decision,
// and applies the consequences. The scripted death of the two teammates waits for the first major milestone (the
// first quota met, three techs researched, or half an hour on the ground) and then takes priority over everything.
import type { Game } from '../game/game';
import { Stage } from './stage';
import { EVENTS, EVENT, type EventDef, type EvCtx } from './events';
import { FALLEN, killTeammates } from './fallen';
import { choose } from './choice';
import * as E from './effects';
import { anyG, gtime } from '../research/util';
import { toast } from '../ui/kit';

export class Director {
  difficulty = 1;
  /** colony morale 0..100: the colony's own vitals when the pod is down, else the director's estimate */
  private ownMorale = 62;
  get morale() { const v = anyG(this.g)?.colony?.vitals?.morale; return typeof v === 'number' ? v : this.ownMorale; }
  set morale(n: number) { this.ownMorale = n; }
  busy = false;
  /** game time of the next roll */
  next = 420;
  history: { id: string; t: number; choice: string }[] = [];
  done = new Set<string>();
  /** switch off random rolls (tests, the intro) */
  auto = true;
  private stage: Stage | null = null;
  private timers: { at: number; fn: () => void }[] = [];
  constructor(readonly g: Game) {
    const q = new URLSearchParams(location.search);
    if (q.has('noevents')) this.auto = false;
  }
  private now() { return gtime(this.g); }
  /** run fn after s seconds of game time */
  later(s: number, fn: () => void) { this.timers.push({ at: this.now() + s, fn }); }
  private get st() { return (this.stage ??= new Stage(this.g)); }

  /** has the colony reached its first major milestone (v7: the unlock graph's progress: the ship link, or ten
   *  things learned, or a met quota, or forty minutes on the ground) */
  milestone(): boolean {
    const G = anyG(this.g);
    const met = (G.mission?.quotas ?? []).some((q: any) => q.state === 'met');
    const learned = (G.unlocks?.history?.length ?? 0);
    return met || learned >= 10 || !!G.unlocks?.owns?.('dock_ship') || this.now() > 2400;
  }
  teammatesAlive(): boolean {
    const tms = anyG(this.g).colony?.teammates;
    if (Array.isArray(tms) && tms.length) return tms.some((t: any) => t && t.alive !== false && !t.dead);
    return !this.done.has('fallen');
  }
  tick(dt: number) {
    if (dt <= 0) return;
    const t = this.now();
    for (let i = this.timers.length - 1; i >= 0; i--) if (t >= this.timers[i].at) { const k = this.timers[i]; this.timers.splice(i, 1); try { k.fn(); } catch (e) { console.error('director timer', e); } }
    if (this.busy || !this.auto) return;
    // never on top of another scene (the landing, a colony cinematic) or an open decision
    if (document.body.classList.contains('cine-on') || document.querySelector('.evc')) return;
    // morale drifts toward what the colony's state supports
    const ws = E.workers(this.g).length;
    this.ownMorale += ((ws ? 55 : 60) - this.ownMorale) * dt * 0.002;
    if (!this.done.has('fallen') && t > 600 && this.milestone() && this.teammatesAlive()) { this.trigger('fallen'); return; }
    if (t < this.next) return;
    // v7: the first lessons come first: no random trouble until a few things are learned
    if ((anyG(this.g).unlocks?.history?.length ?? 99) < 4) { this.next = t + 60; return; }
    const D = { morale: this.morale, difficulty: this.difficulty, t };
    const pool = EVENTS.map((e) => ({ e, w: this.recent(e.id) ? 0 : Math.max(0, e.weight(this.g, D)) })).filter((p) => p.w > 0);
    this.next = t + (300 + Math.random() * 240) / this.difficulty;
    if (!pool.length) return;
    let r = Math.random() * pool.reduce((s, p) => s + p.w, 0);
    for (const p of pool) { r -= p.w; if (r <= 0) { void this.run(p.e); return; } }
  }
  private recent(id: string) { return this.history.slice(-2).some((h) => h.id === id); }
  /** play an event now (debug, scripted beats) */
  trigger(id: string) { const e = id === 'fallen' ? FALLEN : EVENT[id]; if (e && !this.busy) void this.run(e); }

  async run(e: EventDef) {
    if (this.busy) return;
    if (e.once && this.done.has(e.id)) return;
    this.busy = true;
    const g = this.g, G = anyG(g), st = this.st;
    const x: EvCtx = { g, st, at: st.pod(), data: {} };
    let weather = false;
    try {
      e.setup?.(x);
      weather = e.id === 'storm' || e.id === 'fallen';
      G.emit?.('story-event', { id: e.id, phase: 'start' });
      await st.play((c) => e.cine(c, x), e.id, e.id !== 'fallen');
      if (e.id === 'fallen') { killTeammates(g, x.data.ids ?? []); this.done.add('fallen'); }
      // the decision: the colony waits
      const was = G.paused; G.paused = true;
      document.body.classList.add('ev-on'); // the film grade holds through the decision
      const res = await choose({ kicker: e.kicker, title: e.title, brief: e.brief(x), options: e.options(x), stamp: e.id === 'fallen' ? 'THEIR LAST ORDERS' : undefined, still: st.still }, (o) => {
        const f = E.fx(g); const text = o.run(f);
        return { text, lines: f.out };
      });
      G.paused = was; document.body.classList.remove('ev-on');
      this.history.push({ id: e.id, t: this.now(), choice: res.key });
      G.emit?.('story-event', { id: e.id, choice: res.key, phase: 'end' });
      if (e.once) this.done.add(e.id);
    } catch (err) { console.error('event', e.id, err); }
    finally {
      if (weather) this.later(e.id === 'fallen' ? 40 : 150, () => G.climate?.force?.(null, null));
      this.busy = false;
      this.next = Math.max(this.next, this.now() + 240 / this.difficulty);
    }
  }
  toJSON() { return { morale: this.ownMorale, next: this.next, history: this.history, done: [...this.done], difficulty: this.difficulty }; }
  load(d: any) {
    if (!d || typeof d !== 'object') return;
    this.morale = Number(d.morale ?? 62); this.next = Number(d.next ?? 420); this.history = Array.isArray(d.history) ? d.history : [];
    this.done = new Set(Array.isArray(d.done) ? d.done : []); this.difficulty = Number(d.difficulty ?? 1);
  }
  note(s: string) { toast(s, 'story', 5000); }
}
