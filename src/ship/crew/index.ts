// The crew's public face (V6.md, CREW + INTRO). Everything another system needs from the crew goes through `crew`:
//
//   crew.member('mamani')                  -> the roster entry + { alive, death }
//   crew.buildModel('mamani', { scale })   -> a CrewModel (root, rig, update(dt, animInput), showProp, die) for the planet
//   crew.teammates()                       -> the two (alive) crew who ride the pod down
//   crew.kill('mamani', 'creature', { from, model }) -> ragdoll every live model of them, save the death, engrave the
//                                             plaque in the mess, lower the crew's mood for good, owe a moment of silence
//   crew.mood() / crew.on('death' | 'mood', fn) / crew.reset()
//   crew.life(hub)                         -> the CrewLife running on a ship hub (routines, bubbles, clicks)
import * as THREE from 'three';
import { ROSTER, CREW_IDS, TEAMMATES, SHIP_NAME, type CrewId, type CrewDef } from './roster';
import { buildCrewModel, type CrewModel } from './model';
import { crewState, onCrew, emitCrew, resetCrew, moodShift, crewDay, type Death } from './state';
import type { CrewLife, HubLike } from './life';

export type { CrewId, CrewDef, CrewModel, Death };
export { ROSTER, CREW_IDS, TEAMMATES, SHIP_NAME };

/** every model built through crew.buildModel that is still in a scene (kill() ragdolls them) */
const live = new Map<CrewId, Set<CrewModel>>();
const lives = new WeakMap<object, CrewLife>();
const ALIASES: Record<string, CrewId> = { scientist: 'solano', lead: 'solano', captain: 'quintero', mechanic: 'kowalczyk', patch: 'kowalczyk', pilot: 'castellanos', sparrow: 'castellanos', medic: 'baptiste', doctor: 'baptiste', botanist: 'mamani', xenobiologist: 'mamani', tupaq: 'mamani', quartermaster: 'araujo', cook: 'araujo', bene: 'araujo', security: 'kristiansen', ivalu: 'kristiansen' };
const idOf = (id: string): CrewId => ((CREW_IDS as string[]).includes(id) ? id as CrewId : ALIASES[id.toLowerCase()] ?? (id as CrewId));

export const crew = {
  ids: CREW_IDS,
  roster: ROSTER,
  ship: SHIP_NAME,
  /** a crew member: the roster entry (name, role, look, voice, lines, routine) plus whether they are alive */
  member(id: string): CrewDef & { alive: boolean; death: Death | null } {
    const k = idOf(id), d = ROSTER[k], st = crewState();
    return { ...d, alive: !st.dead[k], death: st.dead[k] ?? null };
  },
  alive(id: string) { return !crewState().dead[idOf(id)]; },
  /** the living crew */
  living(): CrewId[] { const st = crewState(); return CREW_IDS.filter((id) => !st.dead[id]); },
  /** the two who ride the pod down (the living ones of TEAMMATES) */
  teammates(): CrewId[] { const st = crewState(); return TEAMMATES.filter((id) => !st.dead[id]); },
  /**
   * A crew member's model for any scene (the planet's teammates): LIMBOPHOBIA's researcher rig with the crew
   * member's body, face, uniform and gear. scale multiplies their real height (1 = metres; the planet's game scale
   * may want 0.6 like robots/humans.ts). Call model.update(dt, { speed, action, full, wx, wz, wyaw, ground }) every frame.
   */
  buildModel(id: string, o: { scale?: number } = {}): CrewModel {
    const k = idOf(id);
    const m = buildCrewModel(k, o);
    let s = live.get(k); if (!s) live.set(k, (s = new Set()));
    s.add(m);
    const dispose = m.dispose;
    m.dispose = () => { s!.delete(m); dispose(); };
    if (crewState().dead[k]) m.die('', undefined, 0);
    return m;
  },
  /**
   * The scripted death (the story's call): every live model of them falls as a ragdoll (from: where the blow came
   * from, world space), the death is saved (how, ship day, where), the memorial plaque in the mess is engraved, the
   * crew's mood drops and its ceiling with it, a moment of silence is owed on the ship, and 'death' fires.
   */
  kill(id: string, how = 'unknown', o: { from?: THREE.Vector3; impulse?: number; where?: string; cause?: string; model?: CrewModel } = {}) {
    const k = idOf(id), st = crewState();
    if (st.dead[k]) return;
    const ms = new Set(live.get(k) ?? []); if (o.model) ms.add(o.model);
    for (const m of ms) m.die(how, o.from, o.impulse ?? 4);
    st.dead[k] = { how, day: st.day, where: o.where ?? 'the surface', cause: o.cause };
    st.moodCap = Math.max(0.35, st.moodCap - 0.12);
    st.mood = Math.max(0.1, st.mood - 0.35);
    st.silence = true;
    st.save();
    emitCrew('death', k, how);
    emitCrew('mood', st.mood);
  },
  /** 0 broken .. 1 high; drops with each death, recovers a little each ship day up to a ceiling that each death lowers */
  mood() { return crewState().mood; },
  moodShift,
  /** a ship day passes (the planet's day cycle can call this) */
  day: crewDay,
  on(ev: 'death' | 'mood', fn: (...a: unknown[]) => void) { return onCrew(ev, fn); },
  /** a new game: everyone alive again (keepIntro: the intro does not replay) */
  reset(keepIntro = true) { resetCrew(!keepIntro); },
  /** the crew life on a hub (made by the hub plugin; null before) */
  life(hub: HubLike): CrewLife | null { return lives.get(hub) ?? null; },
  /** register a hub's crew life (the hub plugin and the intro test do this) */
  _setLife(hub: HubLike, l: CrewLife) { lives.set(hub, l); },
};
export default crew;
