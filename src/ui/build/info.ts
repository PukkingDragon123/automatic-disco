// THE WORDS of build mode (V7 update "MORE TEXT, MORE CONTEXT": names, one-line descriptions, values with units, status
// lines that say what is happening, what is missing and what to do next). Every panel of the blueprint mode, the tray
// cards and the blueprint sheet take their text from here, so a building reads the same everywhere.
import type { Factory, FBuilding } from '../../factory/factory';
import { FDEFS, footW, footD, type FKind } from '../../factory/defs';
import { ITEMS, type ItemId } from '../../factory/items';
import { STATUS_NAME } from '../../factory/status';
import { workOf } from '../../logistics/catalog';
import { buildingLock } from '../../logistics/unlocks';
import { perMin, type Recipe } from '../../factory/recipes';

export const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
export const fmt = (n: number) => (n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''));
/** an item's name ('Ferrite Ore') */
export const itemName = (id: ItemId) => ITEMS[id]?.name ?? id.replace(/_/g, ' ');
/** the first sentence of a description */
export const oneLine = (s: string) => { const m = /^(.*?[.!?])(\s|$)/.exec(s.trim()); return (m ? m[1] : s).trim(); };
/** a building's footprint in metres, as it stands turned r */
export const footprint = (kind: FKind, r = 0) => { const d = FDEFS[kind]; return `${footW(d, r)} x ${footD(d, r)} m`; };
export const FACING = ['south', 'west', 'north', 'east'];

export interface BillLine { id: ItemId; name: string; have: number; need: number; short: boolean }
/** the bill of a building, item by item, with what the stores can spare */
export function bill(f: Factory, kind: FKind, n = 1): BillLine[] {
  const d = FDEFS[kind]; if (!d) return [];
  const c = f.sites ? f.sites.costOf(d) : d.cost;
  return Object.entries(c).map(([id, v]) => { const have = Math.floor(f.sites ? f.sites.avail(id) : f.count(id)), need = (v ?? 0) * n; return { id, name: itemName(id), have, need, short: have < need }; });
}
/** what building it costs in words: '12 Ferrite Ore, 20 Dirt' */
export const billWords = (b: BillLine[]) => b.map((l) => `${l.need} ${l.name}`).join(', ');
/** the facts line under a building's name: build time, power, footprint */
export function facts(kind: FKind): string {
  const d = FDEFS[kind]; if (!d) return '';
  const p = d.power > 0 ? `draws ${d.power} MW` : d.power < 0 ? `makes ${-d.power} MW` : 'no power';
  return `Build ${Math.round(workOf(d))} s  ·  ${p}  ·  ${footprint(kind)}`;
}
/** a lock in words ('Locked: research Cold Chain') or '' */
export function lockWords(f: Factory, kind: FKind): string {
  const l = buildingLock(f.g, kind);
  if (l.ok) return '';
  const why = l.why.charAt(0) + l.why.slice(1).toLowerCase();
  return `Locked. ${l.by === 'research' ? 'Unlock on the skill tree: ' : l.by === 'mastery' ? 'Mastery: ' : l.by === 'skill' ? 'Needs ' : ''}${why}`;
}
/** the placement status of the building in hand, in words */
export function placeWords(why: string | null, n = 1): string {
  if (!why) return n > 1 ? `Ready: ${n} pieces fit here` : 'Ready to build here: click to stake the site';
  const w = why.replace(/\s*\(.*\)$/, '');
  const hint = /footing in water/i.test(why) ? 'lay a foundation first' : /steep/i.test(why) ? 'find flatter ground or lay a foundation' : /seam/i.test(why) ? 'set it over an ore seam (the dashed rings)' : /already here|rival/i.test(why) ? 'move it to clear ground' : /core/i.test(why) ? 'keep it 3 m from the pod' : /bounds/i.test(why) ? 'stay inside the region' : /Needs \d+/i.test(why) ? 'gather the materials first' : /open water/i.test(why) ? 'it must stand in a lake or river' : /soil/i.test(why) ? 'it needs diggable soil' : '';
  return `Blocked: ${w}${hint ? ` (${hint})` : ''}`;
}
/** a recipe in words: '1 Ferrite Ore -> 1 Iron Ingot, 2 s, 30 / min' */
export function recipeWords(r: Recipe): string {
  const side = (s: Recipe['in']) => Object.entries(s).filter(([id]) => ITEMS[id]).map(([id, n]) => `${n} ${itemName(id)}`).join(' + ');
  const out = Object.entries(r.out)[0];
  return `${side(r.in) || 'nothing'} into ${r.robot ? r.robot : side(r.out)}, ${r.t} s${out && !r.robot ? `, ${fmt(perMin(r, out[1] ?? 0))} per min` : ''}`;
}
/** what a placed building is doing, what it lacks and what to do: [headline, detail] */
export function statusWords(f: Factory, b: FBuilding): [string, string] {
  const d = b.def, st = b.status, rec = b.recipe;
  const g = f.gridOf(b);
  if (!b.on) return ['SWITCHED OFF', 'Paused by you: press RUN to start it again.'];
  if (st === 'nopower') return ['NO POWER', d.power > 0 ? `Needs ${d.power} MW: put a power pole within 7 m and keep the grid supplied.` : 'Not connected to the grid.'];
  if (st === 'starved') {
    const lack = rec ? Object.keys(rec.in).filter((id) => (b.inBuf.get(id) ?? 0) < (rec.in[id] ?? 0)).map(itemName) : [];
    return ['INPUT STARVED', lack.length ? `Waiting for ${lack.join(' and ')}: wire a route in, or let the haulers bring it.` : 'Waiting for its inputs.'];
  }
  if (st === 'blocked') {
    const full = rec ? Object.keys(rec.out).map(itemName) : [];
    return ['OUTPUT BLOCKED', `${full.join(' and ') || 'Its output'} has nowhere to go: give it a store or a route out.`];
  }
  if (st === 'working') return ['WORKING', rec ? `Making ${Object.keys(rec.out).map(itemName).join(' and ')}, ${Math.round(b.prog * 100)}% through this batch${g ? `; grid at ${Math.round(g.sat * 100)}%` : ''}.` : 'Running normally.'];
  if (st === 'offline') return ['OFFLINE', 'Not running.'];
  return [STATUS_NAME[st] ?? 'IDLE', d.station ? 'Ready: it starts as soon as its inputs arrive.' : d.store !== undefined ? 'Holding stock for the colony.' : 'Standing by.'];
}
