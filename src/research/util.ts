// Small shared helpers for the progression systems: real-item lookups that survive catalogue changes (the first id
// that exists wins), all-or-nothing takes from the colony's stores, and the game event plumbing.
import { ITEMS } from '../factory/items';
import type { Game } from '../game/game';

/** the first item id that exists in the catalogue (the inventory agent may rename or add items) */
export function pick(...ids: string[]): string { for (const id of ids) if (ITEMS[id]) return id; return ids[ids.length - 1]; }
export const itemName = (id: string) => ITEMS[id]?.name ?? id.replace(/_/g, ' ');
/** a cost written with alternatives: { 'iron_plate|metal_plate': 12 } -> { iron_plate: 12 } */
export function resolve(spec: Record<string, number>): Record<string, number> {
  const o: Record<string, number> = {};
  for (const k in spec) { const id = pick(...k.split('|')); o[id] = (o[id] ?? 0) + spec[k]; }
  return o;
}

interface Stores { count?(id: string): number; take?(id: string, n: number): boolean; put?(id: string, n: number): void; add?(id: string, n: number, x?: number, z?: number): void }
const stores = (g: Game) => (g as unknown as { factory?: Stores }).factory ?? null;
export function have(g: Game, id: string): number { try { return Math.floor(stores(g)?.count?.(id) ?? 0); } catch { return 0; } }
export function canPay(g: Game, cost: Record<string, number>) { for (const k in cost) if (have(g, k) < cost[k]) return false; return true; }
/** take every item or none */
export function pay(g: Game, cost: Record<string, number>): boolean {
  if (!canPay(g, cost)) return false;
  const f = stores(g); if (!f?.take) return false;
  const done: [string, number][] = [];
  for (const k in cost) { if (!cost[k]) continue; if (f.take(k, cost[k])) done.push([k, cost[k]]); else { for (const [id, n] of done) f.put?.(id, n); return false; } }
  return true;
}
export function give(g: Game, items: Record<string, number>, x?: number, z?: number) {
  const f = stores(g); if (!f) return;
  for (const k in items) { const n = Math.floor(items[k]); if (n <= 0) continue; try { if (f.add && x !== undefined) f.add(k, n, x, z); else f.put?.(k, n); } catch (e) { console.error('give', k, e); } }
}
/** game time in seconds (the world clock when there is one) */
export const gtime = (g: Game) => (g as unknown as { world?: { time?: number } }).world?.time ?? performance.now() / 1000;
export const anyG = (g: Game) => g as unknown as Record<string, any>;
export const fmtTime = (s: number) => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; };
