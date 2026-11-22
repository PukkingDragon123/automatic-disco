// game.podHome: what has been built inside the pod and the HAPPINESS it makes (0..100). Happiness lifts every
// crew member's morale target (up to +22), warms the teammates to each other and to UNIT 07 (src/social), and the
// necessities work: the heater keeps the night off, the water filter fills a can now and then, the radio hums the
// Pathfinder's old frequency (Teo comes closer).
//   placed: { id, x, z, y, rot }[]   happiness()   count(id)   add(p) / remove(i)   on('change', fn)
import type { Game } from '../../game/game';
import { DECOR_BY } from './decor';
import { anyG, give } from '../../research/util';

export interface Placed { id: string; x: number; z: number; y: number; rot: number }
export class PodHome {
  placed: Placed[] = [];
  private fns: ((d: any) => void)[] = [];
  private t = 0;
  constructor(readonly g: Game) {}
  on(_ev: 'change', fn: (d: any) => void) { this.fns.push(fn); }
  private emit(d: any) { for (const f of this.fns) { try { f(d); } catch (e) { console.error('podHome', e); } } }
  count(id: string) { return this.placed.filter((p) => p.id === id).length; }
  /** 0..100: each piece adds its joy, repeats of the same piece count for less, the ruin itself is grim */
  happiness() {
    const seen = new Map<string, number>(); let h = 0;
    for (const p of this.placed) { const d = DECOR_BY[p.id]; if (!d) continue; const n = seen.get(p.id) ?? 0; seen.set(p.id, n + 1); h += d.joy * Math.pow(0.55, n); }
    // the basics together are worth more than apart
    const needs = ['bunk', 'heater', 'filter', 'lamp'].filter((k) => seen.has(k)).length;
    h += needs >= 4 ? 10 : needs >= 2 ? 4 : 0;
    return Math.max(0, Math.min(100, Math.round(h)));
  }
  add(p: Placed) { this.placed.push(p); this.emit({ add: p }); anyG(this.g).emit?.('decor', { id: p.id }); }
  remove(i: number) { const p = this.placed.splice(i, 1)[0]; if (p) this.emit({ remove: p }); return p; }
  moved() { this.emit({ moved: true }); }
  /** the necessities at work (game seconds) */
  tick(dt: number) {
    if (dt <= 0) return;
    this.t += dt;
    if (this.t < 40) return;
    this.t = 0;
    const G = anyG(this.g);
    if (this.count('filter')) give(this.g, { water: this.count('filter') });
    if (this.count('radio')) G.social?.add?.('guide', 0.6, 'radio');
  }
  /** wired once: the morale target takes the pod's happiness into account */
  hook() {
    const C = anyG(this.g).colony; const V = C?.vitals; if (!V || V.__home) return;
    V.__home = true;
    const base = V.moraleTarget.bind(V);
    V.moraleTarget = (tm: unknown) => {
      let m = base(tm) + this.happiness() * 0.22;
      // the heater and the lamps matter most at night
      const night = 1 - (C.daylight?.() ?? 1);
      m += night * (Math.min(2, this.count('heater')) * 3 + Math.min(2, this.count('lamp')) * 1.5);
      return Math.max(0, Math.min(100, m));
    };
  }
  toJSON() { return { placed: this.placed }; }
  load(d: any) { if (d && Array.isArray(d.placed)) this.placed = d.placed.filter((p: any) => p && DECOR_BY[p.id] && Number.isFinite(p.x)).map((p: any) => ({ id: p.id, x: +p.x, z: +p.z, y: +p.y || 0, rot: +p.rot || 0 })); }
}
