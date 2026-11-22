// THE WORDS of build mode (V7 update "MORE TEXT, MORE CONTEXT": names, one-line descriptions, values with units, status
// lines that say what is happening, what is missing and what to do next). Every panel of the blueprint mode, the tray
// cards and the blueprint sheet take their text from here, so a building reads the same everywhere.
import type { Factory, FBuilding } from '../../factory/factory';
import { FDEFS, footW, footD, type FKind } from '../../factory/defs';
import { ITEMS, type ItemId } from '../../factory/items';
import { STATUS_NAME } from '../../factory/status';
import { workOf, catOf, BUILD_CATS, type BuildCat } from '../../logistics/catalog';
import { buildingLock, research } from '../../logistics/unlocks';
import { perMin, recipesAt, type Recipe } from '../../factory/recipes';
import { NODES, NODE } from '../../research/unlocks';

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
    return ['INPUT STARVED', lack.length ? `Waiting for ${lack.join(' and ')}: wire a route in or let haulers bring it.` : 'Waiting for its inputs.'];
  }
  if (st === 'blocked') {
    const full = rec ? Object.keys(rec.out).map(itemName) : [];
    return ['OUTPUT BLOCKED', `${full.join(' and ') || 'Its output'} has nowhere to go: give it a store or a route out.`];
  }
  if (st === 'working') return ['WORKING', rec ? `Making ${Object.keys(rec.out).map(itemName).join(' and ')}, ${Math.round(b.prog * 100)}% through this batch${g ? `; grid at ${Math.round(g.sat * 100)}%` : ''}.` : 'Running normally.'];
  if (st === 'offline') return ['OFFLINE', 'Not running.'];
  return [STATUS_NAME[st] ?? 'IDLE', d.station ? 'Ready: it starts as soon as its inputs arrive.' : d.store !== undefined ? 'Holding stock for the settlement.' : 'Standing by.'];
}

// ------------------------------------------------------------------ the catalogue's words (V7 "EMPIRE BUILDING": rich
// context on every building like Dragon City and Planet Zoo; user-facing words say settlement / empire, never colony)
/** older text in the game's data speaks of the colony: the build UI says settlement */
export const say = (s: string) => s.replace(/\bcolon(y|ies|ists?)\b/gi, (m, e: string) => {
  const w = /^ists?$/i.test(e) ? (e.length > 3 ? 'settlers' : 'settler') : /ies/i.test(e) ? 'settlements' : 'settlement';
  return m[0] === 'C' ? w[0].toUpperCase() + w.slice(1) : w;
});
/** what each catalogue tab holds, in one line */
export const CAT_DESC: Record<BuildCat, string> = {
  extraction: 'Drills, pumps and diggers that take raw materials out of the land.',
  storage: 'Bins, crates, silos and vaults: where the settlement keeps its goods.',
  logistics: 'Conveyors, pipes, splitters and mergers that move goods between buildings.',
  processing: 'Furnaces, presses and assemblers that turn raw materials into parts.',
  power: 'Generators, boilers, batteries and poles that make and carry power.',
  bio: 'Crops, livestock, water and soil care: food and living materials.',
  research: 'Labs and stations that turn survey data into new technology.',
  defence: 'Walls and turrets that hold the settlement against the wild and the rival blocs.',
  habitat: 'Homes, halls and foundations for the people of the settlement.',
  decor: 'Flags, lamps and finishing touches that lift morale.',
};
export const catName = (c: BuildCat) => BUILD_CATS.find((x) => x.k === c)?.name ?? c;
/** a building's tier, I..V: the most refined material in its bill (raw 1, refined 2, parts 3, assemblies 4, advanced 5) */
const TIER_OF_CAT: Record<string, number> = { raw: 1, bio: 1, refined: 2, part: 3, assembly: 4, advanced: 5, research: 3, internal: 1 };
export function tierOf(kind: FKind): number {
  const d = FDEFS[kind]; if (!d) return 1;
  let t = 1;
  for (const id of Object.keys(d.cost)) t = Math.max(t, TIER_OF_CAT[ITEMS[id]?.cat ?? 'raw'] ?? 1);
  return t;
}
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
/** how many stand in the settlement, and how many are staked as sites */
export function builtOf(f: Factory, kind: FKind): [number, number] {
  return [f.buildings.filter((b) => b.kind === kind && !b.dead).length, f.sites?.list.filter((s) => s.kind === kind).length ?? 0];
}
/** the whole bill's weight in items (for sorting by cost) */
export const billSum = (kind: FKind) => Object.values(FDEFS[kind]?.cost ?? {}).reduce((s: number, v) => s + (v ?? 0), 0);
/** where it may stand, in words ('' when anywhere on dry, level ground) */
export function siteRule(kind: FKind): string {
  const d = FDEFS[kind]; if (!d) return '';
  if (d.extract === 'node') return 'Must stand over an ore seam (the dashed rings on the map).';
  if (d.extract === 'water') return 'Must stand in open water: a lake or a river.';
  if (d.extract === 'soil') return 'Needs diggable soil: not on rock or water.';
  if (kind === 'found') return 'Can be laid on water or rough ground; other buildings stand on it.';
  if (kind === 'dam' || kind === 'sluice') return 'Built across water to hold or release it.';
  return 'Dry, fairly level ground, at least 3 m from the pod.';
}
/** upkeep rows [key, value]: power, workers, consumption per minute */
export function upkeep(kind: FKind): [string, string][] {
  const d = FDEFS[kind]; if (!d) return [];
  const out: [string, string][] = [];
  out.push(['Power', d.power > 0 ? `draws ${fmt(d.power)} MW` : d.power < 0 ? `none (it makes power)` : 'none']);
  out.push(['Workers', d.operable ? '1 operator (optional; it runs faster)' : d.station ? 'none: it runs by itself' : 'none']);
  const rs = d.station ? recipesAt(d.station) : [];
  if (rs.length) {
    const r = rs[0], ins = Object.entries(r.in).filter(([id]) => ITEMS[id]);
    if (ins.length) out.push(['Consumes', ins.map(([id, n]) => `${fmt(perMin(r, n ?? 0))} ${itemName(id)}`).join(', ') + ' per min' + (rs.length > 1 ? ' (first recipe)' : '')]);
  }
  out.push(['Hull', `${d.hp} HP`]);
  return out;
}
/** what it does: production and effects, one line each */
export function effects(kind: FKind): string[] {
  const d = FDEFS[kind]; if (!d) return [];
  const out: string[] = [];
  if (d.extract) {
    const where = d.extract === 'node' ? 'the seam under it' : d.extract === 'water' ? 'the water it stands in' : 'the ground under it';
    out.push(`Extracts ${fmt((d.rate ?? 0) * 60)} loads per min from ${where}.`);
  }
  if (d.station) {
    const rs = recipesAt(d.station);
    for (const r of rs.slice(0, 4)) out.push(say(recipeWords(r)) + '.');
    if (rs.length > 4) out.push(`... and ${rs.length - 4} more recipes.`);
  }
  if (d.power < 0) out.push(`Makes ${fmt(-d.power)} MW for the grid${d.station ? ' while it has fuel' : ''}.`);
  if (d.belt) out.push(`Moves ${fmt(d.belt * 180)} items per min along the run.`);
  if (d.store !== undefined) out.push(`Stores goods: up to ${d.store} of each item per slot.`);
  if (d.radius) out.push(`Works on everything within ${d.radius} m.`);
  if (d.output === 'split') out.push('Deals one input out to three sides in turn.');
  if (d.input === 'sides' && d.output === 'front') out.push('Joins up to three runs into one.');
  if (!out.length) out.push(oneLine(say(d.desc)));
  return out;
}
/** how it is unlocked: the skill-tree node(s) and the research that open it, owned or not */
export function unlockPath(f: Factory, kind: FKind): { ok: boolean; why: string; lines: string[] } {
  const g = f.g, l = buildingLock(g, kind), d = FDEFS[kind], cat = 'cat:' + catOf(kind);
  const lines: string[] = [];
  const un = (g as unknown as { unlocks?: { owns?(id: string): boolean } }).unlocks;
  const nodes = NODES.filter((n) => n.grants.includes(kind) || n.grants.includes(cat) || (!!d?.skill && n.grants.includes(d.skill)));
  for (const n of nodes.slice(0, 2)) {
    const own = !!un?.owns?.(n.id);
    lines.push(`${own ? 'Owned' : 'Unlock'} on the skill tree: ${n.name}${!own && n.needs.length ? ` (after ${n.needs.map((id) => NODE[id]?.name ?? id).join(', ')})` : ''}`);
  }
  const r = research(g) as unknown as { techFor?(id: string): { id: string; name: string } | null; done?: Set<string> } | null;
  const t = r?.techFor?.(kind);
  if (t) lines.push(`Research: ${t.name}${r?.done?.has(t.id) ? ' (done)' : ''}`);
  if (!lines.length) lines.push(l.ok ? 'Available from the start.' : 'Not yet known.');
  return { ok: l.ok, why: l.ok ? '' : lockWords(f, kind), lines };
}
