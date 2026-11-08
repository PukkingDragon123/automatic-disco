import type { Item } from './item';
import { itemWeight } from './item';

/**
 * Any place items can live: a character's main inventory, a backpack, a
 * desk drawer, a fridge, a car trunk, the floor tile under you.
 */
export class Container {
  uid: number;
  name: string;
  kind: string;
  capacity: number;
  items: Item[] = [];
  /** fraction of weight removed for items inside (bags) */
  reduction = 0;
  /** loot table key; generated lazily on first look */
  loot?: string;
  lootDone = false;
  locked = false;
  /** owner: object uid / item uid / player id / 'floor:x,y' */
  owner = '';
  /** keeps food fresh when powered */
  cooling?: 'fridge' | 'freezer';
  heating?: boolean;

  /**
   * Backpack-grid hooks, installed by src/items/grid.ts: `placer` gives an
   * item added without a valid cell a spot (first fit, or none = overflow),
   * `fitter` answers "is there room" by cells (and a bag's weight rating).
   */
  static placer: ((c: Container, it: Item) => void) | null = null;
  static fitter: ((c: Container, it: Item) => boolean) | null = null;

  constructor(uid: number, name: string, kind: string, capacity: number) {
    this.uid = uid; this.name = name; this.kind = kind; this.capacity = capacity;
  }

  contentWeight(): number { let w = 0; for (const it of this.items) w += itemWeight(it); return w; }
  /** weight as carried (after bag reduction) */
  carriedWeight(): number { return this.contentWeight() * (1 - this.reduction); }
  hasRoom(it: Item): boolean {
    if (Container.fitter) return Container.fitter(this, it);
    return this.contentWeight() + itemWeight(it) <= this.capacity + 1e-6;
  }
  add(it: Item) {
    if (Container.placer) { try { Container.placer(this, it); } catch (e) { console.warn('grid place', e); } }
    this.items.push(it); it.parent = this.uid;
  }
  remove(it: Item) { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); }
  find(pred: (it: Item) => boolean): Item | undefined {
    for (const it of this.items) { if (pred(it)) return it; if (it.inv) { const r = it.inv.find(pred); if (r) return r; } }
    return undefined;
  }
  all(out: Item[] = []): Item[] { for (const it of this.items) { out.push(it); if (it.inv) it.inv.all(out); } return out; }
}
