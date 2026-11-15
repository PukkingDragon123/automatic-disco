// What a choice actually does to the colony: workers hurt or lost, machines struck or shut down, items spent or found,
// data, reputation, morale, rival behaviour. Every helper reports what really happened (an empty colony loses nothing),
// so the outcome line under a decision is the truth.
import type { Game } from '../game/game';
import { anyG, give, pay, canPay, have, itemName } from '../research/util';
import type { DataKind } from '../research/tech';
import { DATA_NAME } from '../research/tech';

export interface Fx { g: Game; out: string[] }
export const fx = (g: Game): Fx => ({ g, out: [] });
const G = (f: Fx) => anyG(f.g);
const shuffle = <T>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** the colony's workers (the pod agent's list when there is one, else every allied creature) */
export function workers(g: Game): any[] {
  const A = anyG(g), w = A.colony?.workers;
  if (Array.isArray(w) && w.length) return w.filter((c: any) => c && !c.dead);
  return (A.world?.creatures ?? []).filter((c: any) => !c.dead && c.faction === 'veyr');
}
export function buildings(g: Game, filter?: (b: any) => boolean): any[] {
  return (anyG(g).factory?.buildings ?? []).filter((b: any) => !b.dead && !/^belt|^pipe|^found|^wall/.test(b.kind) && (!filter || filter(b)));
}
export function killWorkers(f: Fx, n: number, how: string) {
  const ws = shuffle(workers(f.g)).slice(0, n);
  for (const c of ws) { c.dieCause = how; try { G(f).world.kill(c, null); } catch { c.dead = true; } }
  if (ws.length) f.out.push(`${ws.length} worker${ws.length > 1 ? 's' : ''} lost`);
  return ws.length;
}
export function hurtWorkers(f: Fx, frac: number, n = 99) {
  const ws = shuffle(workers(f.g)).slice(0, n);
  for (const c of ws) c.hp = Math.max(1, c.hp - (c.maxHp ?? c.hp) * frac);
  if (ws.length) f.out.push(`${ws.length} worker${ws.length > 1 ? 's' : ''} injured`);
  return ws.length;
}
export function damageBuildings(f: Fx, n: number, frac: number, filter?: (b: any) => boolean) {
  const bs = shuffle(buildings(f.g, filter)).slice(0, n);
  let lost = 0;
  for (const b of bs) { b.damage?.((b.maxHp ?? b.def?.hp ?? 500) * frac, 'event'); if (b.dead) lost++; }
  if (bs.length) f.out.push(`${bs.length} machine${bs.length > 1 ? 's' : ''} damaged${lost ? `, ${lost} destroyed` : ''}`);
  return bs.length;
}
/** switch machines off for a while (their own off-switch, restored after) */
export function shutdown(f: Fx, secs: number, filter?: (b: any) => boolean, label = 'machines') {
  const bs = buildings(f.g, filter).filter((b) => b.on !== false);
  for (const b of bs) b.on = false;
  const D = G(f).director; D?.later?.(secs, () => { for (const b of bs) if (!b.dead) b.on = true; });
  if (bs.length) f.out.push(`${bs.length} ${label} offline for ${Math.round(secs / 60 * 10) / 10} min`);
  return bs.length;
}
export function items(f: Fx, add: Record<string, number>) {
  give(f.g, add, G(f).veyr?.core?.x, G(f).veyr?.core?.z);
  const parts = Object.entries(add).filter(([, n]) => n > 0).map(([k, n]) => `+${Math.round(n)} ${itemName(k)}`);
  if (parts.length) f.out.push(parts.join(', '));
}
/** spend items if the stores have them all; returns false (and spends nothing) if not */
export function spend(f: Fx, cost: Record<string, number>) {
  if (!pay(f.g, cost)) return false;
  f.out.push(Object.entries(cost).map(([k, n]) => `-${n} ${itemName(k)}`).join(', '));
  return true;
}
export const affords = (g: Game, cost: Record<string, number>) => canPay(g, cost);
export const stock = (g: Game, id: string) => have(g, id);
export function data(f: Fx, kind: DataKind, n: number) {
  const R = G(f).research; if (!R) return;
  if (n >= 0) R.addData(kind, n, 'Event'); else R.data[kind] = Math.max(0, R.data[kind] + n);
  f.out.push(`${n >= 0 ? '+' : ''}${Math.round(n)} ${DATA_NAME[kind]} data`);
}
export function rep(f: Fx, n: number) {
  const M = G(f).mission; if (!M) return;
  M.rep = Math.max(0, Math.min(100, M.rep + n));
  f.out.push(`Reputation ${n >= 0 ? '+' : ''}${n}`);
}
export function morale(f: Fx, n: number) {
  const D = G(f).director; if (D) D.morale = Math.max(0, Math.min(100, D.morale + n));
  const V = G(f).colony?.vitals; if (V && typeof V.morale === 'number') V.morale = Math.max(0, Math.min(100, V.morale + n));
  f.out.push(`Morale ${n >= 0 ? '+' : ''}${n}`);
}
export function xp(f: Fx, path: string, n: number) { G(f).mastery?.gain?.(path, n, 'Decision'); }
/** rival waves sooner (positive s) or later (negative) */
export function rivals(f: Fx, s: number) {
  const ps = G(f).factions?.programmes ?? [];
  for (const p of ps) if (p.alive !== false && typeof p.waveT === 'number') p.waveT = Math.max(5, p.waveT - s);
  if (ps.length) f.out.push(s > 0 ? 'Rival raids come sooner' : 'Rival raids delayed');
}
export const pct = (k: number) => Math.random() < k;
