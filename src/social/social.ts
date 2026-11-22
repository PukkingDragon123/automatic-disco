// game.social: CLOSENESS with the people on the ground (v7). Teo Barrera (the stranded explorer, id 'guide') and the
// two teammates (crew ids 'kristiansen', 'mamani'). Closeness rises with gifts, help and quests (and a little with
// time spent near a cosy pod); its LEVEL (0..5) opens functions on the skill tree (src/research/unlocks.ts `close`).
//   closeness(id) 0..100    level(id) 0..5    add(id, n, why?)    on('level' | 'change', fn({ id, level, v, n, why }))
//   who(id) -> the person's display card { name, short, col }    likes(id, item) -> gift value 0..3
import { ITEMS } from '../factory/items';

export const LEVELS = [0, 10, 25, 45, 70, 100];
export interface Person { id: string; name: string; short: string; col: string; likes: string[]; loves: string[] }
export const PEOPLE: Record<string, Person> = {
  guide: { id: 'guide', name: 'Teo Barrera', short: 'TEO', col: '#f0b860', likes: ['water', 'glass', 'copper_wire', 'circuit', 'screw', 'tuber', 'mushroom'], loves: ['fruit', 'berries', 'meat', 'tea'] },
  kristiansen: { id: 'kristiansen', name: 'Ivalu Kristiansen', short: 'IVALU', col: '#9ab8d8', likes: ['iron_plate', 'iron_rod', 'gear', 'ammo', 'water'], loves: ['meat', 'steel_ingot'] },
  mamani: { id: 'mamani', name: 'Tupaq Mamani', short: 'TUPAQ', col: '#8ad890', likes: ['fruit', 'berries', 'leaves', 'fibre', 'tuber'], loves: ['plant_cutting', 'seed_flower', 'mushroom', 'spore_fern'] },
};
type Ev = 'level' | 'change';

export class Social {
  private v = new Map<string, number>();
  private fns: Record<string, ((d: any) => void)[]> = {};
  /** gone for good (a teammate who died): their bond stays where it was */
  readonly gone = new Set<string>();
  /** recent gains, newest last (the bond meter animates them) */
  readonly recent: { id: string; n: number; t: number; why: string }[] = [];
  on(ev: Ev, fn: (d: any) => void) { (this.fns[ev] ??= []).push(fn); return () => { const a = this.fns[ev]; const i = a?.indexOf(fn) ?? -1; if (i >= 0) a!.splice(i, 1); }; }
  private emit(ev: Ev, d: any) { for (const f of this.fns[ev] ?? []) { try { f(d); } catch (e) { console.error('social', ev, e); } } }
  closeness(id: string) { return this.v.get(id) ?? 0; }
  level(id: string) { const c = this.closeness(id); let l = 0; for (let i = 0; i < LEVELS.length; i++) if (c >= LEVELS[i]) l = i; return l; }
  /** 0..1 of the way through the current level */
  frac(id: string) { const c = this.closeness(id), l = this.level(id); if (l >= LEVELS.length - 1) return 1; return (c - LEVELS[l]) / (LEVELS[l + 1] - LEVELS[l]); }
  add(id: string, n: number, why = '') {
    if (!(Math.abs(n) > 0) || this.gone.has(id)) return;
    const before = this.level(id);
    const v = Math.max(0, Math.min(100, this.closeness(id) + n));
    this.v.set(id, v);
    this.recent.push({ id, n, t: performance.now(), why }); if (this.recent.length > 12) this.recent.shift();
    this.emit('change', { id, v, n, why });
    const after = this.level(id);
    if (after !== before) this.emit('level', { id, level: after, up: after > before });
  }
  who(id: string): Person { return PEOPLE[id] ?? { id, name: id, short: id.toUpperCase(), col: '#e8e0c8', likes: [], loves: [] }; }
  /** how much a person values an item as a gift: 0 none, 1 fine, 2 liked, 3 loved */
  likes(id: string, item: string) { const p = this.who(id); if (p.loves.includes(item)) return 3; if (p.likes.includes(item)) return 2; return ITEMS[item] ? 1 : 0; }
  toJSON() { return { v: [...this.v], gone: [...this.gone] }; }
  load(d: any) {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d.v)) for (const e of d.v) if (Array.isArray(e) && typeof e[0] === 'string') this.v.set(e[0], Math.max(0, Math.min(100, Number(e[1]) || 0)));
    if (Array.isArray(d.gone)) for (const g of d.gone) this.gone.add(String(g));
  }
}
