// The ship hub's public face (see V6.md, SHIP): the hub screen and its API, the deck plan, and openShipHub, which
// the planet's SHIP AI LINK calls to go back up (flow.ts registers the opener).
export { ShipHub, onHub, currentHub, type HubRoom, type HubOpts, type HubMode } from './hub';
export { ROOMS, ROOM_IDS, roomAt, roomCam, overviewCam, SHIP_NAME, SHIP_REG, WALL_H, type RoomId } from './layout';
export type { RoomAction } from './chrome';
export type { Breach } from './breach';

let opener: ((fromPlanet: boolean) => void) | null = null;
/** flow.ts registers how the hub is opened (it owns the engine and the run) */
export function setShipHubOpener(fn: (fromPlanet: boolean) => void) { opener = fn; }
/** open the ship hub; from the planet (the SHIP AI LINK) it goes over the paused game and BACK DOWN returns */
export function openShipHub(fromPlanet = false) { if (opener) opener(fromPlanet); else console.warn('openShipHub: no opener registered (flow.ts)'); }

/** v7: what the bridge's MONITOR panel needs from the flow (the run's system, the world chosen, the landing) */
export interface ShipLander {
  /** the run's seed (the system's worlds come from it); starts a run when there is none */
  runSeed(): number;
  /** the world the run is on (null before the first landing) */
  planet(): import('../../world/planet').Planet | null;
  /** choose the world and land the pod in a region of it */
  land(planetSeed: number, r: import('../../world/planet').PRegion): void;
}
let lander: ShipLander | null = null;
/** flow.ts registers it */
export function setShipLander(l: ShipLander) { lander = l; }
export function shipLander(): ShipLander | null { return lander; }
