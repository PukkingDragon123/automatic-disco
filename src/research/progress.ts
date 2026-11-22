// game.unlocks: what the player has learned (src/research/unlocks.ts is the graph). A node opens when its
// prerequisites are owned, its quest is done and the bond with its NPC is close enough; it is bought with
// knowledge (research data) and real items. Owning a node grants its feature ids; every gate in the game asks
// `game.unlocks.has(id)` (or the older `game.research.unlocked(id)`, which now asks here first).
//   has(feature)            a granted feature id (dock:research, cat:power, tool:drill, ship:lab, a building kind ...)
//   covers(feature)         some node grants it (else it is not gated here)
//   owns(node)              the node is bought
//   state(node)             'owned' | 'open' | 'poor' (requirements met, cannot pay) | 'locked'
//   reqs(node)              every requirement with its progress, for the skill tree's tags
//   unlock(node)            pay and own (returns '' or why not)
//   on('unlock' | 'change', fn)
import type { Game } from '../game/game';
import { NODES, NODE, type UnlockNode } from './unlocks';
import { DATA_KINDS, type DataKind } from './tech';
import { resolve, have, pay, anyG } from './util';
import { ITEMS } from '../factory/items';

export type NodeState = 'owned' | 'open' | 'poor' | 'locked';
export type Req =
  | { k: 'need'; id: string; ok: boolean }
  | { k: 'quest'; id: string; ok: boolean; n: number; of: number }
  | { k: 'close'; npc: string; ok: boolean; have: number; need: number }
  | { k: 'know'; kind: DataKind; ok: boolean; have: number; need: number }
  | { k: 'item'; id: string; ok: boolean; have: number; need: number };
type Ev = 'unlock' | 'change';
const ALL = typeof location !== 'undefined' && new URLSearchParams(location.search).has('unlockall');

export interface QuestLike { done(id: string): boolean; progress?(id: string): [number, number] }
export interface SocialLike { level(id: string): number }

export class Unlocks {
  private own = new Set<string>(NODES.filter((n) => n.start).map((n) => n.id));
  private feats = new Set<string>();
  private by = new Map<string, UnlockNode[]>();
  private fns: Record<string, ((d: any) => void)[]> = {};
  /** filled in by the installer: the quest log and the bonds */
  quests: QuestLike | null = null;
  social: SocialLike | null = null;
  /** the order nodes were bought in (the tree shows the newest; the story reads milestones) */
  history: { id: string; t: number }[] = [];
  constructor(readonly g: Game | null) {
    for (const n of NODES) for (const f of n.grants) { const a = this.by.get(f) ?? []; a.push(n); this.by.set(f, a); }
    if (ALL) for (const n of NODES) this.own.add(n.id);
    this.refeat();
  }
  on(ev: Ev, fn: (d: any) => void) { (this.fns[ev] ??= []).push(fn); return () => { const a = this.fns[ev]; const i = a?.indexOf(fn) ?? -1; if (i >= 0) a!.splice(i, 1); }; }
  private emit(ev: Ev, d: any) { for (const f of this.fns[ev] ?? []) { try { f(d); } catch (e) { console.error('unlocks', ev, e); } } }
  private refeat() { this.feats.clear(); for (const id of this.own) for (const f of NODE[id]?.grants ?? []) this.feats.add(f); }

  has(feature: string) { return ALL || this.feats.has(feature); }
  covers(feature: string) { return this.by.has(feature); }
  owns(id: string) { return this.own.has(id); }
  owned() { return [...this.own]; }
  /** the node that opens a feature (the cheapest one not owned yet) */
  nodeFor(feature: string): UnlockNode | null { const a = this.by.get(feature); return a?.find((n) => !this.own.has(n.id)) ?? a?.[0] ?? null; }
  /** one short line for a greyed tile: 'UNLOCK POWER' */
  lockLine(feature: string): string | null { if (this.has(feature)) return null; const n = this.nodeFor(feature); return n ? `UNLOCK ${n.name.toUpperCase()}` : null; }

  // ---------------------------------------------------------------- requirements
  private know(): Record<DataKind, number> { return anyG(this.g!)?.research?.data ?? { bio: 0, geo: 0, energy: 0, xeno: 0 }; }
  cost(n: UnlockNode) { return resolve(n.items ?? {}); }
  reqs(id: string): Req[] {
    const n = NODE[id]; if (!n) return [];
    const out: Req[] = [];
    for (const r of n.needs) out.push({ k: 'need', id: r, ok: this.own.has(r) });
    if (n.quest) { const p = this.quests?.progress?.(n.quest) ?? [0, 1]; out.push({ k: 'quest', id: n.quest, ok: this.quests?.done(n.quest) ?? false, n: p[0], of: p[1] }); }
    if (n.close) { const h = this.social?.level(n.close[0]) ?? 0; out.push({ k: 'close', npc: n.close[0], ok: h >= n.close[1], have: h, need: n.close[1] }); }
    const K = this.know();
    for (const k of DATA_KINDS) { const need = n.know?.[k] ?? 0; if (need > 0) out.push({ k: 'know', kind: k, ok: K[k] >= need, have: Math.floor(K[k]), need }); }
    const c = this.cost(n);
    for (const it in c) { if (!ITEMS[it]) continue; const h = this.g ? have(this.g, it) : 0; out.push({ k: 'item', id: it, ok: h >= c[it], have: h, need: c[it] }); }
    return out;
  }
  state(id: string): NodeState {
    if (this.own.has(id)) return 'owned';
    const rs = this.reqs(id);
    if (rs.some((r) => !r.ok && (r.k === 'need' || r.k === 'quest' || r.k === 'close'))) return 'locked';
    return rs.every((r) => r.ok) ? 'open' : 'poor';
  }
  /** why not, in one short line ('' = it can be bought) */
  why(id: string): string {
    const n = NODE[id]; if (!n) return 'UNKNOWN';
    if (this.own.has(id)) return 'OWNED';
    const r = this.reqs(id).find((x) => !x.ok);
    if (!r) return '';
    if (r.k === 'need') return 'NEEDS ' + (NODE[r.id]?.name ?? r.id).toUpperCase();
    if (r.k === 'quest') return 'QUEST';
    if (r.k === 'close') return 'BOND';
    if (r.k === 'know') return `${r.need - r.have} ${r.kind.toUpperCase()}`;
    return `${r.need - r.have} ${(ITEMS[r.id]?.name ?? r.id).toUpperCase()}`;
  }

  // ---------------------------------------------------------------- buying
  unlock(id: string, free = false): string {
    const n = NODE[id]; if (!n) return 'UNKNOWN';
    if (this.own.has(id)) return 'OWNED';
    if (!free) {
      const w = this.why(id); if (w) return w;
      if (this.g && !pay(this.g, this.cost(n))) return 'ITEMS';
      const R = anyG(this.g!)?.research;
      if (R) for (const k of DATA_KINDS) R.data[k] = Math.max(0, R.data[k] - (n.know?.[k] ?? 0));
    }
    this.own.add(id); this.refeat();
    this.history.push({ id, t: anyG(this.g!)?.world?.time ?? 0 });
    this.apply(n, true);
    this.emit('unlock', { id, node: n });
    this.emit('change', { id });
    anyG(this.g!)?.emit?.('unlock', { id, node: n, grants: n.grants });
    for (const f of n.grants) if (f.startsWith('dock:')) anyG(this.g!)?.emit?.('dock-unlock', { slot: f.slice(5), node: n });
    return '';
  }
  /** what owning a node does to the other systems */
  private apply(n: UnlockNode, fresh: boolean) {
    const G = anyG(this.g!); if (!G) return;
    for (const f of n.grants) if (f.startsWith('tech:')) { try { G.research?.complete?.(f.slice(5), true); } catch (e) { console.error('unlock tech', f, e); } }
    if (fresh) for (const b of n.install ?? []) { try { G.upgrades?.install?.(b); } catch (e) { console.error('unlock install', b, e); } }
    if (fresh) this.toolSlots();
  }
  /** the pod's tool drum holds only learned tools; a newly learned tool drops into the first empty socket */
  toolSlots() {
    const C = anyG(this.g!)?.colony; const S = C?.slots?.slots as { tool: string | null; level: number; unit: string | null }[] | undefined;
    if (!S || ALL) return;
    for (const s of S) if (s.tool && !this.has('tool:' + s.tool)) { s.tool = null; s.unit = null; }
    const ORDER = ['scanner', 'sampler', 'seeder', 'grab', 'drill', 'weld', 'lift', 'cannon', 'carry'];
    for (const t of ORDER) {
      if (!this.has('tool:' + t) || S.some((s) => s.tool === t)) continue;
      const free = S.find((s) => !s.tool && s.level > 0);
      if (free) { free.tool = t; free.unit = null; }
    }
  }
  /** nodes that open themselves (a dock slot a quest or a bond hands over) */
  tick() { for (const n of NODES) if (n.auto && !this.own.has(n.id) && this.state(n.id) === 'open') this.unlock(n.id); }

  toJSON() { return { own: [...this.own], history: this.history }; }
  load(d: any) {
    if (!d || typeof d !== 'object') return;
    for (const id of Array.isArray(d.own) ? d.own : []) if (NODE[id]) this.own.add(id);
    if (Array.isArray(d.history)) this.history = d.history.filter((h: any) => h && NODE[h.id]);
    this.refeat();
    for (const id of this.own) this.apply(NODE[id], false);
  }
}
