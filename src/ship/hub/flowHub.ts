// The hub as the game's front door and home base: builds the ShipHub for the flow with each room's function keys
// (the bridge's main monitor and BACK DOWN, the lab's bio-engineering, the workshop's pod upgrades, the AI core's
// save, settings and title), runs the main monitor flow (galaxy scan -> planet -> landing site -> DEPLOY) and the
// short pod-drop cinematic, then hands the landing to the flow.
import * as THREE from 'three';
import type { Flow } from '../../flow';
import type { Game } from '../../game/game';
import type { PRegion } from '../../world/planet';
import type { Region } from '../../world/region';
import { ShipHub, type HubOpts } from './hub';
import type { RoomAction } from './chrome';
import { openMonitor } from './monitor';
import { podDrop } from './drop';
import { csfx } from '../../ui/cineAudio';
import { toast } from '../../ui/kit';

export interface HubFlowOpts { fromPlanet?: boolean; game?: Game | null; hasSave?: boolean; inside?: boolean; isNewGame?: boolean; onNew?: () => void; onContinue?: () => void }

export function makeHub(flow: Flow, o: HubFlowOpts = {}): ShipHub {
  const engine = flow.engine;
  let hub: ShipHub;
  const game = () => o.game ?? null;
  const needGame = () => (game() ? false : 'NEEDS A COLONY: DEPLOY FIRST');
  const actions: HubOpts['actions'] = {
    bridge: [
      { id: 'monitor', label: 'MAIN MONITOR', key: 'M', primary: true, run: () => monitor() },
      ...(o.fromPlanet ? [{ id: 'down', label: 'BACK DOWN', key: 'B', run: () => { csfx('servo', 0.6); engine.pop(); } } as RoomAction] : []),
    ],
    lab: [{ id: 'lab', label: 'BIO-ENGINEERING', key: 'B', primary: true, disabled: needGame, run: () => { const g = game(); if (g) import('../../ui/forge').then((m) => m.openLab(engine, g)); } }],
    workshop: [
      { id: 'upg', label: 'POD UPGRADES', key: 'U', primary: true, disabled: needGame, run: () => { const g = game(); if (g) import('../../research/index').then((m) => m.openTerminal(g, 'upgrader')).catch((e) => console.warn(e)); } },
      { id: 'pod', label: 'INSPECT POD', key: 'I', run: () => { hub.shot({ pos: new THREE.Vector3(-10.5, 3.4, -24.5), look: new THREE.Vector3(-6, 1.2, -19.8), fov: 32 }, 1.4); } },
    ],
    engineering: [{ id: 'prog', label: 'MASTERY + RESEARCH', key: 'R', primary: true, disabled: needGame, run: () => { const g = game(); if (g) import('../../research/index').then((m) => m.openTerminal(g, 'mastery')).catch((e) => console.warn(e)); } }],
    core: [
      { id: 'save', label: 'SAVE MISSION', key: 'S', primary: true, disabled: () => (flow.run ? false : 'NO MISSION RUNNING'), run: () => { flow.save(); csfx('chime', 0.5); toast('Mission saved to the core.', 'good', 2400); } },
      { id: 'settings', label: 'SETTINGS', key: 'O', run: () => hub.chrome.openSettings() },
      { id: 'title', label: 'TITLE SCREEN', key: 'T', disabled: () => (o.fromPlanet ? 'RETURN TO THE SURFACE FIRST' : false), run: () => { hub.outside(); } },
    ],
  };
  const monitor = () => {
    if (!flow.run) flow.ensureRun();
    openMonitor(engine, hub, flow, {
      onDeploy: (planetSeed: number, r: PRegion, lz: { x: number; z: number } | undefined, region: Region | undefined) => deploy(planetSeed, r, lz, region),
      fromPlanet: !!o.fromPlanet,
    });
  };
  const deploy = async (planetSeed: number, r: PRegion, lz?: { x: number; z: number }, region?: Region) => {
    flow.choosePlanet(planetSeed);
    const pin = lz ?? { x: region ? region.landing.x : 128, z: region ? region.landing.z : 128 };
    await podDrop(hub);
    flow.landAt(r, pin);
  };
  hub = new ShipHub(engine, {
    hasSave: o.hasSave, inside: o.inside, fromPlanet: o.fromPlanet, isNewGame: o.isNewGame, actions,
    onNew: o.onNew, onContinue: o.onContinue,
  });
  return hub;
}
