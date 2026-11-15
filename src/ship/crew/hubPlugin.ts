// Loaded by the ship hub for every hub it makes (src/ship/hub/hub.ts imports src/ship/*/hubPlugin.ts): the crew
// comes aboard once the camera is inside (overview or a room), and on a new game the intro plays (once per profile).
import type { ShipHub } from '../hub/hub';
import { CrewLife } from './life';
import { crew } from './index';
import { crewState, resetCrew } from './state';
import type { IntroHub } from '../intro/intro';

export default function crewHubPlugin(hub: ShipHub) {
  const h = hub as unknown as IntroHub & { mode?: string; isNewGame?: boolean; onDispose?: (fn: () => void) => void };
  let life: CrewLife | null = null, started = false;
  const off = hub.onUpdate(() => {
    const inside = h.mode === 'overview' || h.mode === 'room' || h.mode === 'shot';
    if (!life && inside) {
      if (h.isNewGame) resetCrew(false);
      life = new CrewLife(h); crew._setLife(h, life);
    }
    if (life && !started && h.isNewGame && !crewState().intro && inside) {
      started = true;
      void import('../intro/intro').then((m) => m.playIntro(h, { life: life! }));
    }
  });
  h.onDispose?.(() => { off(); life?.dispose(); life = null; });
}
