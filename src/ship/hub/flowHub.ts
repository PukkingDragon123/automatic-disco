// The hub as the game's front door and home base: builds the ShipHub for the flow with each room's function keys
// (the bridge's main monitor and BACK DOWN, the AI core's save...). Using a room unfolds its functions as the SHIP
// screen's panels over the cutaway (v7: src/ship/screen/hubPanel.ts); the bridge's MONITOR picks the world and the
// landing site, plays the short pod-drop cinematic (drop.ts) and hands the landing to the flow.
import * as THREE from 'three';
import type { Flow } from '../../flow';
import type { Game } from '../../game/game';
import { ShipHub, type HubOpts } from './hub';
import type { RoomAction } from './chrome';
import { csfx } from '../../ui/cineAudio';
import { toast } from '../../ui/kit';
import type { RoomId } from './layout';

export interface HubFlowOpts { fromPlanet?: boolean; game?: Game | null; hasSave?: boolean; inside?: boolean; isNewGame?: boolean; onNew?: () => void; onContinue?: () => void }

export function makeHub(flow: Flow, o: HubFlowOpts = {}): ShipHub {
  const engine = flow.engine;
  let hub: ShipHub;
  let hubUse: (id: RoomId) => boolean = () => false;
  const game = () => o.game ?? null;
  const use = (id: RoomId, label: string, k = 'U'): RoomAction => ({ id: 'use', label, key: k, primary: true, run: () => hub.useRoom(id) });
  const actions: HubOpts['actions'] = {
    bridge: [use('bridge', 'MAIN MONITOR', 'M'), ...(o.fromPlanet ? [{ id: 'down', label: 'BACK DOWN', key: 'B', run: () => { csfx('servo', 0.6); engine.pop(); } } as RoomAction] : [])],
    lab: [use('lab', 'GENE LAB', 'G')],
    medbay: [use('medbay', 'CREW HEALTH', 'H')],
    core: [use('core', 'UNIT 07 CORE', 'U'), { id: 'save', label: 'SAVE MISSION', key: 'S', disabled: () => (flow.run ? false : 'NO MISSION RUNNING'), run: () => save() }],
    quarters: [use('quarters', 'CREW + MORALE', 'C')],
    workshop: [use('workshop', 'POD ASSEMBLY', 'P'), { id: 'pod', label: 'INSPECT POD', key: 'I', run: () => inspect() }],
    mess: [use('mess', 'GALLEY STORES', 'G')],
    cargo: [use('cargo', 'SHIP STORES', 'S')],
    engineering: [use('engineering', 'POWER + SYSTEMS', 'P')],
  };
  const save = () => { if (!flow.run) return; flow.save(); csfx('chime', 0.5); toast('Mission saved to the core.', 'good', 2400); };
  const inspect = () => { hub.shot({ pos: new THREE.Vector3(-11.5, 3.6, -25.5), look: new THREE.Vector3(-6, 1.1, -19.8), fov: 30 }, 1.4); };
  // a room's functions: the SHIP screen's panels unfold over the hub (src/ship/screen/hubPanel.ts; no consoles, no
  // hologram). The bridge's MONITOR picks the world and the landing site and plays the pod drop itself.
  hubUse = (id: RoomId) => {
    if (!flow.run) flow.ensureRun();
    import('../screen/hubPanel').then((m) => m.openHubPanel(hub, id)).catch((e) => console.error('hub panel', e));
    return true;
  };
  hub = new ShipHub(engine, {
    hasSave: o.hasSave, inside: o.inside, fromPlanet: o.fromPlanet, isNewGame: o.isNewGame, actions,
    onNew: o.onNew, onContinue: o.onContinue,
  });
  hub.onUse((id) => hubUse(id));
  (hub as any).game = o.game ?? null;
  return hub;
}
