// THE PROGRAM (K) is now the R&D STATION: one 3D room (src/research/ui/station.ts) where research, mastery, the
// Upgrader and the mission meet at one console. This module keeps the old entry points (openSkillTree, the tab ids)
// so every caller still works: 'research' and 'mission' open RESEARCH, 'mastery' MASTERY, 'upgrader' UPGRADE.
import type { Engine } from '../app/engine';
import type { Mastery, PathId } from '../research/mastery';
import type { Research } from '../research/research';
import type { Upgrades } from '../research/upgrades';
import type { Mission } from '../research/mission';
import { RDStation, type Mode } from '../research/ui/station';

export type TabId = 'mastery' | 'research' | 'upgrader' | 'mission';
/** what the station reads: the game (or a stand-in with the same fields) */
export interface SkillHost { mastery?: Mastery; research?: Research; upgrades?: Upgrades; mission?: Mission; emit?(ev: string, d?: any): void; [k: string]: any }
const MODE: Record<TabId, Mode> = { mastery: 'mastery', research: 'research', upgrader: 'upgrade', mission: 'research' };

/** open the station over a game (idempotent); a tab picks the mode */
export function openSkillTree(engine: Engine, host: SkillHost, tab?: TabId, path?: PathId) {
  if (RDStation.current) { if (tab) RDStation.current.setMode(MODE[tab]); return RDStation.current; }
  const s = new RDStation(host, engine, { mode: tab ? MODE[tab] : undefined, path, close: () => { if (engine.screen === s) engine.pop(); else s.dispose(); } });
  engine.push(s);
  return s;
}

// ------------------------------------------------------------------ ?test=skills (alias of ?test=mastery)
export function testSkills(engine: Engine, P: URLSearchParams) { void import('../research/test').then((m) => m.testProgression(engine, P)); }
