// What each ship room holds and what opens it (V7 PROGRESSION): a room is a feature `ship:<room>` and every function
// in it a `ship:fn:<fn>`, both learned on the skill tree (src/research/unlocks.ts). From the ship before any landing
// there is no game and everything stays open.
import type { RoomId } from '../hub/layout';

export type FnId = 'monitor' | 'orders' | 'core' | 'supply' | 'study' | 'heal' | 'crew' | 'pods' | 'power';
/** the hub's rooms against the graph's room features (the hub's workshop is the graph's hangar; the AI core comes with the link) */
export const ROOM_FEAT: Record<RoomId, string> = {
  bridge: 'ship:bridge', core: 'ship:bridge', lab: 'ship:lab', medbay: 'ship:medbay', quarters: 'ship:quarters',
  workshop: 'ship:hangar', mess: 'ship:mess', cargo: 'ship:cargo', engineering: 'ship:engineering',
};
export const ROOM_FNS: Record<RoomId, FnId[]> = {
  bridge: ['monitor', 'orders'], core: ['core'], lab: ['study'], medbay: ['heal'], quarters: ['crew'],
  workshop: ['pods'], mess: ['crew'], cargo: ['supply'], engineering: ['power'],
};
export const FN: Record<FnId, { name: string; icon: string; feat: string; desc?: string }> = {
  monitor: { name: 'MONITOR', icon: 'globe', feat: 'ship:fn:link' },
  orders: { name: 'ORDERS', icon: 'gauge', feat: 'ship:fn:quotas' },
  core: { name: 'UNIT 07', icon: 'chip', feat: 'ship:fn:link' },
  supply: { name: 'SUPPLY', icon: 'crate', feat: 'ship:fn:drops' },
  study: { name: 'STUDY', icon: 'flask', feat: 'ship:fn:study' },
  heal: { name: 'HEAL', icon: 'cross', feat: 'ship:fn:heal' },
  crew: { name: 'CREW', icon: 'heart', feat: 'ship:fn:morale' },
  pods: { name: 'PODS', icon: 'drone', feat: 'ship:fn:pods' },
  power: { name: 'POWER', icon: 'battery', feat: 'ship:fn:orbit' },
};
export const ROOM_ICON: Record<RoomId, string> = {
  bridge: 'telescope', core: 'chip', lab: 'flask', medbay: 'cross', quarters: 'heart', workshop: 'hive', mess: 'wheat', cargo: 'crate', engineering: 'core',
};
export const ROOM_SHORT: Record<RoomId, string> = {
  bridge: 'BRIDGE', core: 'AI CORE', lab: 'LAB', medbay: 'MEDBAY', quarters: 'QUARTERS', workshop: 'HANGAR', mess: 'MESS', cargo: 'CARGO', engineering: 'ENGINES',
};
type U = { has(f: string): boolean } | null | undefined;
const unl = (game: any): U => game?.unlocks ?? null;
/** a feature is open (no game, or no gate: open) */
export const open = (game: any, feat: string) => unl(game)?.has(feat) ?? true;
export const roomOpen = (game: any, id: RoomId) => open(game, ROOM_FEAT[id]);
export const fnOpen = (game: any, id: RoomId, f: FnId) => roomOpen(game, id) && open(game, FN[f].feat);

/** what each function does, one line */
export const FN_DESC: Record<FnId, string> = {
  monitor: 'Survey the system\'s worlds and choose where the next pod lands.',
  orders: 'The program\'s directives: what it wants sent up, by when, and what it pays.',
  core: 'UNIT 07\'s own core: save the empire and read the link\'s standing.',
  supply: 'Order a supply capsule from the ship\'s stores. It lands by the pod.',
  study: 'Send specimens up to the ship\'s lab. Each one becomes knowledge.',
  heal: 'Treat the teammates on the surface from the ship\'s medical stock.',
  crew: 'The eight people aboard: who they are, what they are doing, their morale.',
  pods: 'The pod\'s arms and drones, and the state of each.',
  power: 'Share the reactor\'s output between the decks. A starved deck dims.',
};
/** what each room is for, one line (the deck plan's own names) */
export const ROOM_PURPOSE: Record<RoomId, string> = {
  bridge: 'Command deck: the main monitor and the program\'s orders.',
  core: 'Where UNIT 07 runs: saves and the link to the planet.',
  lab: 'Ship lab: specimens from the surface are studied here.',
  medbay: 'Sickbay: triage, the bio-scanner and the medical stock.',
  quarters: 'Bunks and lockers for the crew of eight.',
  workshop: 'Hangar and workshop: the pod, its arms and its drones.',
  mess: 'Galley and mess: meals, coffee, the crew\'s morale.',
  cargo: 'Stores, spares and the supply capsules.',
  engineering: 'Fusion reactor, power bus and life support.',
};
export const ROOM_NAME: Record<RoomId, string> = {
  bridge: 'BRIDGE', core: 'AI CORE', lab: 'SHIP LAB', medbay: 'MEDBAY', quarters: 'QUARTERS', workshop: 'HANGAR', mess: 'MESS + GALLEY', cargo: 'CARGO HOLD', engineering: 'ENGINEERING',
};
