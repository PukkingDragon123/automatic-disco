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
import { openTerminal } from './terminal';
import { shipState, saveShip, resetShip } from './shipState';
import type { RoomId } from './layout';

export interface HubFlowOpts { fromPlanet?: boolean; game?: Game | null; hasSave?: boolean; inside?: boolean; isNewGame?: boolean; onNew?: () => void; onContinue?: () => void }

export function makeHub(flow: Flow, o: HubFlowOpts = {}): ShipHub {
  const engine = flow.engine;
  let hub: ShipHub;
  let hubUse: (id: RoomId) => boolean = () => false;
  const game = () => o.game ?? null;
  const needGame = () => (game() ? false : 'NEEDS A COLONY: DEPLOY FIRST');
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
  const lab = () => {
    const g = game();
    if (g) { import('../../ui/forge').then((m) => m.openLab(engine, g)); return; }
    flow.ensureRun(); const run = flow.run!;
    import('../../ui/forge').then((m) => engine.push(new m.Forge(run, 0, () => run.helix, null, (res: any) => { engine.pop(); if (res) run.reg.add(res.design, 'veyr', res.parent, 'design', 0); }, { emit: () => {} })));
  };
  const assemble = () => {
    const st = shipState(); const k0 = st.pod; if (k0 >= 1) return;
    const crane = hub.interior.rooms.workshop.ctx.refs.crane; crane?.moveTo(-19.8); crane?.setHook(2.6);
    csfx('servo', 0.6); csfx('clamp', 0.5);
    let t = 0; const off = hub.onUpdate((dt) => { t += dt; const k = Math.min(1, k0 + (t / 4) * (1 - k0)); hub.podBuild(k); if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) csfx('relay', 0.3); if (k >= 1) { off(); st.pod = 1; saveShip(); crane?.moveTo(-25.2); crane?.setHook(3.1); csfx('chime', 0.5); } });
  };
  hubUse = (id: RoomId) => {
    if (id === 'bridge') { monitor(); return true; }
    openTerminal({ hub, actions: {
      monitor: () => monitor(), lab, save, inspect, assemble,
      load: () => { if (flow.loadSave()) { csfx('chime', 0.5); toast('Mission loaded from the core.', 'good', 2400); } else toast('No saved mission in the core.', 'warn', 2400); },
      newGame: () => { flow.startRun(Math.floor(Math.random() * 1e9)); resetShip(); hub.podBuild(shipState().pod); toast('New mission logged.', 'good', 2400); },
      title: () => hub.outside(),
      upgrades: () => { const g = game(); if (g) import('../../research/index').then((m) => m.openTerminal(g, 'upgrader')).catch((e) => console.warn(e)); else toast('The Upgrader is built on the surface.', 'warn', 2600); },
      hold: game() && (game() as any).storage?.hold ? () => { const g = game() as any; import('../../ui/crates/grid').then((m) => m.openInventory(g, g.storage.hold)).catch((e) => console.warn(e)); } : undefined,
    } }, id);
    return true;
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
  hub.onUse((id) => hubUse(id));
  (hub as any).game = o.game ?? null;
  return hub;
}
