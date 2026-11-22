// The main dock and the unlock graph (v7): the RESEARCH slot opens the skill tree; every slot stays locked until its
// node is learned (dock:<id>), and a newly learned slot plays its reveal (src/research/ui/reveal.ts) and lands in the
// dock. The dock is the UI CORE agent's (`game.dock` / `window.__dock`: register, lock, badge, setOn).
import type { Game } from '../game/game';
import type { Unlocks } from './progress';
import { anyG } from './util';
import { DOCK_IDS } from './unlocks';
import { revealDock } from './ui/reveal';
import { SkillTree, openTree } from './ui/tree';
import { pop } from '../ui/kit/juice';

interface Ctx { close?(after?: () => void): Promise<void> }
interface Dock { register(id: string, open: (ctx: Ctx) => unknown): void; lock?(id: string, on: boolean): void; badge?(id: string, n: number | string | null): void; setOn?(id: string, on: boolean): void; icon?(id: string): HTMLElement | null }
export function hookDock(g: Game, unlocks: Unlocks) {
  const G = anyG(g);
  let hooked: Dock | null = null;
  const locked = new Map<string, boolean>();
  const shown = new Set<string>();
  /** slots whose reveal has not played yet: they stay locked until it lands */
  const waiting = new Set<string>();
  const dock = (): Dock | null => G.dock ?? (window as unknown as { __dock?: Dock }).__dock ?? null;
  const apply = () => {
    const d = dock(); if (!d) return;
    if (d !== hooked) {
      hooked = d; locked.clear();
      d.register('research', (ctx: Ctx) => { if (!SkillTree.current) openTree(G, G.engine, ctx.close ? (after) => ctx.close!(after) : undefined); });
    }
    // a slot not learned yet is not there at all; one whose reveal is flying in keeps its place, unseen
    for (const id of DOCK_IDS) {
      const has = unlocks.has('dock:' + id), wait = waiting.has(id), on = !has || wait;
      const st = !has ? 'gone' : wait ? 'wait' : 'here';
      if (locked.get(id) !== on) { locked.set(id, on); try { d.lock?.(id, on); } catch (e) { console.error('dock lock', id, e); } }
      const el = d.icon?.(id) ?? (document.querySelector(`[data-dock="${id}"]`) as HTMLElement | null);
      if (el && el.dataset.u7 !== st) { el.dataset.u7 = st; el.style.display = st === 'gone' ? 'none' : ''; el.style.visibility = st === 'wait' ? 'hidden' : ''; if (st === 'here' && shown.has(id)) pop(el, 1.4); shown.add(id); }
    }
  };
  const reveal = (slot: string) => {
    waiting.add(slot); apply();
    void revealDock(slot, () => { waiting.delete(slot); apply(); try { dock()?.badge?.(slot, '!'); } catch { /* old dock */ } setTimeout(() => { try { dock()?.badge?.(slot, null); } catch { /* old dock */ } }, 6000); });
  };
  // learned outside the tree (a quest handed it over): the reveal plays now; inside the tree it waits for the close
  g.on('dock-unlock', (d: { slot: string }) => { if (!SkillTree.current) reveal(d.slot); else { waiting.add(d.slot); } });
  g.on('dock-reveal', (d: { slots: string[] }) => { for (const s of d.slots) reveal(s); });
  G.update$?.push(() => apply());
  apply();
  return { apply, reveal };
}
