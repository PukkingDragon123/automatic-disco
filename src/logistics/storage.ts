// The bridge to the inventory agent's containers (game.storage: containers, find, insert, remove, contents,
// canAccept). A building that is a container is read and filled through it; until that API is installed (or for a
// building it does not know) the factory's own stores are used: a storage building's `store`, a machine's buffers.
import type { Game } from '../game/game';
import type { FBuilding } from '../factory/factory';
import type { ItemId } from '../factory/items';

export interface Box {
  count(id: ItemId): number;
  items(): ItemId[];
  room(id: ItemId): number;
  take(id: ItemId, n: number): number;
  give(id: ItemId, n: number): number;
}
interface StorageAPI {
  hold?: unknown;
  containerOf?(b: unknown): unknown;
  insert?(c: unknown, id: ItemId, n: number): number;
  remove?(c: unknown, id: ItemId, n: number): number;
  contents?(c: unknown): { item: ItemId; n: number }[] | unknown;
  room?(c: unknown, id: ItemId): number;
  canAccept?(c: unknown, id: ItemId): boolean;
  count?(id: ItemId, c?: unknown): number;
  put?(id: ItemId, n: number, x?: number, z?: number, reach?: number): number;
}
export const storageAPI = (g: Game) => (g as unknown as { storage?: StorageAPI }).storage ?? null;

/** a container's contents as { id: n }, whatever shape the API returns */
function contentsOf(s: StorageAPI, c: unknown): Record<string, number> {
  let v: unknown;
  try { v = s.contents?.(c); } catch { return {}; }
  if (!v) return {};
  if (v instanceof Map) return Object.fromEntries([...v.entries()].map(([k, n]) => [String(k), Number(n) || 0]));
  if (Array.isArray(v)) {
    const o: Record<string, number> = {};
    for (const e of v as { id?: string; item?: string; n?: number; count?: number }[]) { const k = e?.item ?? e?.id; if (k) o[k] = (o[k] ?? 0) + (e.n ?? e.count ?? 1); }
    return o;
  }
  if (typeof v === 'object') return v as Record<string, number>;
  return {};
}
/** a Box over one of the inventory agent's containers */
export function boxOf(s: StorageAPI, c: unknown): Box {
  return {
    count: (id) => { try { return Math.floor(s.count ? s.count(id, c) : contentsOf(s, c)[id] ?? 0); } catch { return 0; } },
    items: () => Object.entries(contentsOf(s, c)).filter(([, n]) => n >= 1).map(([k]) => k),
    room: (id) => { try { return Math.max(0, Math.floor(s.room ? s.room(c, id) : s.canAccept?.(c, id) ? 99 : 0)); } catch { return 0; } },
    take: (id, n) => { try { return Math.max(0, Math.floor(s.remove?.(c, id, n) ?? 0)); } catch { return 0; } },
    give: (id, n) => { try { return Math.max(0, Math.floor(s.insert?.(c, id, n) ?? 0)); } catch { return 0; } },
  };
}

/** the container behind a building, as a Box, or null (use the building's own stores) */
export function storageOf(g: Game, b: FBuilding): Box | null {
  const s = storageAPI(g);
  if (!s?.containerOf) return null;
  let c: unknown = null;
  try { c = s.containerOf(b); } catch { c = null; }
  return c ? boxOf(s, c) : null;
}
/** the pod's hold as a Box (the inventory agent's), or null */
export function holdBox(g: Game): Box | null {
  const s = storageAPI(g);
  return s?.hold ? boxOf(s, s.hold) : null;
}
