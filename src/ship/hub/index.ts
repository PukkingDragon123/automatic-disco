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
