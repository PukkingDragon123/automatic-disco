// THE SKILL TREE entry (K, the RESEARCH dock slot). v7: the R&D station and the tabbed program pages are gone; this
// opens the research lattice (src/research/ui/tree.ts), a 2D textured screen with outlined 3D nodes. The old entry
// points (openSkillTree, the tab ids) keep working for every caller.
import type { Engine } from '../app/engine';
import type { Mastery, PathId } from '../research/mastery';
import type { Research } from '../research/research';
import type { Upgrades } from '../research/upgrades';
import type { Mission } from '../research/mission';
import { SkillTree, openTree } from '../research/ui/tree';
import { uiSfx } from './kit/sound';

export type TabId = 'mastery' | 'research' | 'upgrader' | 'mission';
/** what the tree reads: the game (or a stand-in with the same fields) */
export interface SkillHost { mastery?: Mastery; research?: Research; upgrades?: Upgrades; mission?: Mission; emit?(ev: string, d?: any): void; [k: string]: any }

/** open the tree over a game (idempotent; a second call closes it) */
export function openSkillTree(engine: Engine, host: SkillHost, _tab?: TabId, _path?: PathId) {
  if (SkillTree.current) { SkillTree.current.close(); return null; }
  // the RESEARCH slot has to be learned first
  if (host.unlocks && !host.unlocks.has('dock:research')) { uiSfx('error', 0.7); return null; }
  return openTree(host, engine);
}

// ------------------------------------------------------------------ ?test=skills (alias of ?test=mastery)
export function testSkills(engine: Engine, P: URLSearchParams) { void import('../research/test').then((m) => m.testProgression(engine, P)); }
