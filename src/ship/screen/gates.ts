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
export const FN: Record<FnId, { name: string; icon: string; feat: string }> = {
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
