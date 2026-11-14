// Shared constants of the factory simulation (kept apart so the renderer and the forms can import them without a cycle).
export const TICK = 1 / 20;
export const SPACING = 1 / 3;
export type Status = 'idle' | 'working' | 'blocked' | 'starved' | 'nopower' | 'offline';
export const STATUS_COL: Record<Status, number> = { idle: 0x7b858e, working: 0x9cc5ae, blocked: 0xc9a464, starved: 0xa66d4d, nopower: 0xa2473a, offline: 0x3c3d3f };
export const STATUS_NAME: Record<Status, string> = { idle: 'IDLE', working: 'WORKING', blocked: 'OUTPUT BLOCKED', starved: 'INPUT STARVED', nopower: 'NO POWER', offline: 'OFFLINE' };
/** what pipes carry */
export const FLUIDS = new Set<string>(['water', 'bio_oil', 'algae_fuel', 'steam', 'herbicide']);
