// EMPIRE · the flow hook. flow.ts owns the planet, the run and the region game; it registers itself here so the
// empire can travel between settlements (build the next region's game behind a transition) and save the run.
import type { Game, GameOpts } from '../game/game';
import type { Planet, PRegion } from '../world/planet';
import type { Run } from '../game/run';

export interface EmpireHost {
  planet(): Planet | null;
  run(): Run | null;
  game(): Game | null;
  /** build the game of another region (drop: play the pod's descent onto pin; opts: extra game options) */
  visit(r: PRegion, o: { drop?: { pin: { x: number; z: number }; first: boolean }; opts?: Partial<GameOpts> }): void;
  /** write the run (planet, works, stores, progression, empire) to the save */
  save(): void;
}
let host: EmpireHost | null = null;
export function setEmpireHost(h: EmpireHost | null) { host = h; }
export function empireHost(): EmpireHost | null { return host; }

/** the run's empire data (plain JSON; flow.ts saves it with the run) */
export function empireData(run: Run | null): unknown { return run ? (run as unknown as { empire?: unknown }).empire ?? null : null; }

/**
 * flow.ts asks this before a landing from orbit: when the region already holds a settlement of the empire, the game
 * resumes it (its works, stores and pod) instead of dropping a second pod on it. Returns the game options, or null.
 */
export function settledLanding(run: Run | null, r: PRegion): Partial<GameOpts> | null {
  const d = empireData(run) as { settlements?: { region: number; pin: { x: number; z: number } | null; visited: boolean }[] } | null;
  const s = d?.settlements?.find((x) => x.region === r.id);
  if (!s || !s.visited) return null;
  return { landing: s.pin ?? undefined, resumeColony: true, descent: false };
}
