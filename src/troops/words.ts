// TROOPS · WORDS. The text the troops UI explains itself with (V7.md "MORE TEXT, MORE CONTEXT"): what a target is,
// what a unit is doing in words (with the distance and the queue), morale in a word, the needs' labels, the stances,
// the orders and their keys, a selection's status line, and a shared detailed tooltip (a gunmetal plate from the kit,
// a title and lines of real values in Alagard).
import type { Troop, Target, TOrder, OrderK } from './units';
import type { OrderBook, Stance, Formation } from './orders';
import { bindTip, hideTip as kitHideTip } from '../ui/kit/panel';
type StatusKind = Parameters<typeof import('../ui/kit/panel').status>[1];

/** a target's name */
export function tname(t: Target | null | undefined): string {
  if (!t) return '';
  const r = t.ref;
  switch (t.kind) {
    case 'robot': return String(r.st?.name ?? r.kind ?? 'ROBOT').toUpperCase();
    case 'creature': return String(r.sp?.name ?? 'CREATURE').toUpperCase();
    case 'troop': return String((r as Troop).typeName ?? 'UNIT');
    case 'fbuilding': return String(r.def?.name ?? 'BUILDING').toUpperCase();
    case 'site': return String(r.def?.name ?? 'BUILDING').toUpperCase() + ' (SITE)';
    case 'struct': return String(r.name ?? r.kind ?? 'STRUCTURE').toUpperCase();
    case 'pod': return 'THE POD';
    case 'deposit': return String(r.item ?? r.ore ?? r.kind ?? 'MINERAL').toUpperCase().replace(/_/g, ' ') + ' SEAM';
    case 'flora': return 'PLANT';
    case 'faction': return String(r.kind ?? 'STRUCTURE').toUpperCase().replace(/_/g, ' ');
    default: return '';
  }
}
export const VERB: Record<OrderK, string> = { move: 'MOVING', amove: 'ATTACK-MOVING', attack: 'ATTACKING', gather: 'GATHERING', build: 'BUILDING', repair: 'REPAIRING', follow: 'FOLLOWING', guard: 'GUARDING', patrol: 'PATROLLING', hold: 'HOLDING POSITION', stop: 'STOPPED' };
export const ORDER_NAME: Record<OrderK, string> = { move: 'MOVE', amove: 'ATTACK-MOVE', attack: 'ATTACK', gather: 'GATHER', build: 'BUILD', repair: 'REPAIR', follow: 'FOLLOW', guard: 'GUARD', patrol: 'PATROL', hold: 'HOLD', stop: 'STOP' };
/** what a unit is doing, in words: the order, its target, how far, and what is queued after it */
export function orderText(book: OrderBook, t: Troop): string {
  const route = book.route(t), o = route[0];
  if (!o) return book.job(t);
  const s = book.stateOf(t);
  if (s.balkT > 0) return 'HESITATING (LOW MORALE)';
  let w = VERB[o.k];
  const nm = tname(o.tgt);
  if ((o.k === 'gather' || o.k === 'build') && (o.t ?? 0) > 2) { const own = t.ownJob(); if (/ING$/.test(own) && !/MOVING|ROAMING|STANDBY/.test(own)) w = own; }
  if (nm) w += (o.k === 'gather' || o.k === 'build' || o.k === 'repair' ? ': ' : ' ') + nm;
  else if (o.k === 'move' || o.k === 'amove') w += route.length > 1 ? ' TO WAYPOINT' : '';
  const p = o.tgt?.ref && typeof o.tgt.ref.x === 'number' ? o.tgt.ref : o;
  const d = Math.hypot(p.x - t.x, p.z - t.z);
  if (o.k !== 'hold' && o.k !== 'stop' && d > 1.5) w += ` · ${Math.round(d)} M`;
  if (route.length > 1) w += ` · +${route.length - 1} QUEUED`;
  return w;
}
export function moraleWord(m: number) { return m > 0.75 ? 'HIGH' : m > 0.5 ? 'STEADY' : m > 0.25 ? 'SHAKEN' : 'BROKEN'; }
/** the three needs' labels for a unit's kind */
export function needLabels(t: Troop): { food: string; rest: string; maint: string } {
  if (t.kind === 'robot' || t.kind === 'drone') return { food: t.kind === 'drone' ? 'BATTERY' : 'CHARGE', rest: 'REST', maint: 'CONDITION' };
  if (t.kind === 'crew') return { food: 'FOOD', rest: 'REST', maint: 'SUIT O2' };
  return { food: 'FOOD', rest: 'REST', maint: 'PARTS' };
}
export const KIND_WORD: Record<string, string> = { robot: 'CORPS ROBOT', worker: 'CYBORG WORKER', crew: 'TEAMMATE', drone: 'POD DRONE' };
export const KIND_PLURAL: Record<string, [string, string]> = { robot: ['ROBOT', 'ROBOTS'], worker: ['WORKER', 'WORKERS'], crew: ['CREW', 'CREW'], drone: ['DRONE', 'DRONES'] };
/** a short name for a unit's type (group labels) */
export function typeShort(t: Troop): string {
  if (t.kind === 'robot') return String(t.ref.kind).replace(/^(sov|prc|expedition)_/, '').toUpperCase();
  if (t.kind === 'drone') return String(t.ref.def?.short ?? t.ref.kind).toUpperCase();
  if (t.kind === 'crew') return 'CREW';
  return String(t.ref.sp?.name ?? 'WORKER').toUpperCase().slice(0, 10);
}
export const STANCE_INFO: Record<Stance, [string, string]> = {
  aggressive: ['AGGRESSIVE', 'CHASES AND FIGHTS ANY ENEMY IT SEES'],
  defensive: ['DEFENSIVE', 'FIGHTS WHAT COMES IN RANGE, KEEPS ITS POST'],
  passive: ['PASSIVE', 'NEVER OPENS FIRE ON ITS OWN; ONLY OBEYS ORDERS'],
};
export const FORM_INFO: Record<Formation, string> = { line: 'LINE: SIDE BY SIDE, FACING THE MARCH', wedge: 'WEDGE: A POINT UNIT, THE REST FANNED BEHIND', column: 'COLUMN: IN FILE, NARROW PASSAGES' };
export const KEY_INFO: Record<string, [string, string]> = {
  amove: ['ATTACK-MOVE  [A]', 'CLICK THE GROUND: THEY ADVANCE AND FIGHT ANYTHING ON THE WAY. CLICK AN ENEMY TO ATTACK IT.'],
  stop: ['STOP  [S]', 'DROP EVERY ORDER AND THE QUEUE; THEY STAND AND DEFEND THEMSELVES.'],
  hold: ['HOLD POSITION  [H]', 'STAY EXACTLY HERE; FIRE ONLY AT WHAT IS IN RANGE.'],
  patrol: ['PATROL  [P]', 'CLICK A POINT: THEY WALK BETWEEN HERE AND THERE, FIGHTING WHAT THEY MEET.'],
  line: ['LINE FORMATION  [F]', FORM_INFO.line], wedge: ['WEDGE FORMATION  [F]', FORM_INFO.wedge], column: ['COLUMN FORMATION  [F]', FORM_INFO.column],
};
export const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100) + '%';

// ------------------------------------------------------------------ the detailed tooltip (the kit's own: a dark panel)
/** a tooltip on an element through the kit's bindTip: the first line is the subtitle, the rest the description */
export function tip(el: HTMLElement, f: () => { title: string; lines: string[]; rows?: [string, string | number, string?][]; status?: [string, StatusKind?] }) {
  bindTip(el, () => { const d = f(); const ls = d.lines.filter(Boolean); return { title: d.title, sub: ls[0], desc: ls.slice(1).join('  ·  ') || undefined, rows: d.rows, status: d.status }; });
}
export function hideTip() { kitHideTip(); }
export type { TOrder };
