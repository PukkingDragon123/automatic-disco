import { floorDef, wallDef, FloorDef, WallDef } from './defs';
import { Rng } from '../core/rng';
import type { Container } from '../items/container';

export const CHUNK = 16;

export type EdgeSide = 0 | 1; // 0 = north edge of tile, 1 = west edge of tile

export interface EdgeObj {
  kind: 'door' | 'window' | 'arch' | 'gate' | 'shutter';
  style: string;          // visual style key (door_wood, door_metal, window_house...)
  open: boolean;
  locked: boolean;
  keyId?: string;
  hp: number;
  maxHp: number;
  barricade: number;      // planks nailed (0..4) or metal sheet (5+)
  glass?: 'intact' | 'broken' | 'none';
  curtains?: 'open' | 'closed' | 'none';
  /** door swings into which side: 1 = toward +axis tile, -1 = toward -axis tile */
  swing?: 1 | -1;
  /** hinge on low or high end */
  hinge?: 0 | 1;
  portal?: string;        // portal id if this door leads to another zone
  anim?: number;          // 0..1 open amount (render only)
  barricadeSide?: 1 | -1; // which side planks were nailed from (1 = toward tile x,y)
  curtainSide?: 1 | -1;
  sign?: string;
}

export interface ObjState { [k: string]: any }

export interface TileObject {
  uid: number;
  key: string;
  x: number; y: number;   // anchor tile
  rot: 0 | 1 | 2 | 3;     // 90deg steps, 0 = facing +z (south)
  state: ObjState;
  inv?: Container | null;
  hp?: number;
  ox?: number; oz?: number; // fine offset (metres) inside tile
  tint?: number;
}

export interface LightSource {
  id: number;
  x: number; z: number; y: number;     // world position
  color: number;
  intensity: number;
  radius: number;                      // tiles
  kind: 'fluoro' | 'bulb' | 'sodium' | 'lamp' | 'neon' | 'sky' | 'screen' | 'fire' | 'emergency';
  circuit: number;                     // power circuit id (0 = always powered / battery)
  on: boolean;                         // switch state
  broken: boolean;
  flicker: number;                     // 0 = steady, >0 chance of flicker
  objUid?: number;                     // owning object
  /** runtime */
  level?: number;                      // current applied multiplier
  fp?: { idx: Int32Array; w: Float32Array } | null;
}

export interface Portal {
  id: string;
  x: number; y: number;                // trigger tile
  kind: 'door' | 'stairs_up' | 'stairs_down' | 'hole' | 'elevator' | 'vent' | 'walk' | 'loop' | 'ladder' | 'manhole';
  to: string;                          // target zone key
  tx: number; ty: number;              // target tile
  face?: number;                       // facing angle on arrival
  label?: string;
  locked?: string;                     // requirement id (mission flag / key item)
  /** loop portals shift the player seamlessly by an offset inside the same zone */
  loopDx?: number; loopDy?: number;
  hidden?: boolean;
  /** arrival anchor id in the target zone (zone.meta.anchors[id] = [x, y, face?]); defaults to this portal's id */
  anchor?: string;
}

export interface Room {
  id: number;
  name: string;
  type: string;
  x0: number; y0: number; x1: number; y1: number; // inclusive tile bounds (bounding box)
  circuit: number;
  outdoor?: boolean;
  lootMul?: number;
  temp?: number;
}

/** A floor decal (default), or with `vert` a wall decal: centre (x, floor + y, z), facing (cos rot, sin rot), w wide, d tall. */
export interface Decal { x: number; z: number; y?: number; w: number; d: number; rot: number; tex: string; tint?: number; alpha?: number; vert?: 1; }

export const TF = {
  OUTDOOR: 1, NOSPAWN: 2, ROOF: 4, CORRUPT: 8, SHIFT: 16, VENT: 32, SAFE: 64, FURROW: 128, BURNT: 256, NOBUILD: 512, STAIRS: 1024,
};

/**
 * A zone is one self-contained map of the simulation (a "level"). Tiles hold
 * floors, edge walls (north/west edges), wallpapers, rooms and flags; furniture
 * and props are TileObjects; doors and windows live on edges.
 */
export class Zone {
  readonly key: string;
  readonly W: number; readonly H: number;
  name = '';
  seed: number;
  floor: Uint8Array;
  floorVar: Uint8Array;
  height: Int8Array;          // in 0.1m units
  wallN: Uint8Array;
  wallW: Uint8Array;
  paper: Uint8Array;          // wallpaper id for wall faces facing this tile
  room: Uint16Array;
  flags: Uint16Array;
  solid: Uint8Array;          // 0 free, 1 solid, 2 low (vaultable), 3 table (blocks walk, items on top)
  sight: Uint8Array;          // 1 = blocks sight (tall furniture)
  explored: Uint8Array;
  scent: Float32Array;        // decaying player scent for trackers
  edges = new Map<number, EdgeObj>();
  objects = new Map<number, TileObject>();
  tileObjs = new Map<number, TileObject[]>();
  lights: LightSource[] = [];
  portals: Portal[] = [];
  rooms: Room[] = [{ id: 0, name: 'Outside', type: 'none', x0: 0, y0: 0, x1: 0, y1: 0, circuit: 0 }];
  decals: Decal[] = [];
  dirtyChunks = new Set<number>();
  lightDirty = true;
  /** tiles whose wall/door/sight-blocking state changed (light footprints near them need recomputing) */
  lightDirtyTiles: [number, number][] = [];
  removedLights: LightSource[] = [];
  /** power state per circuit id */
  power = new Map<number, boolean>();
  /** extra power sources (running generators): is (x, z) inside a powered radius? */
  extPower: ((x: number, z: number) => boolean) | null = null;
  waterOn = true;
  /** environment */
  env = {
    ambient: 0x2a2618, ambientI: 0.6, fog: 0x2a2410, fogNear: 12, fogFar: 26, void: 0x060503, temp: 21,
    sky: false, sun: 0xffffff, sunI: 0, skyColor: 0x8fb8ff, grade: 'lobby', reverb: 'hall', ambience: 'hum', music: '',
    lightsCycle: false, weather: 'none' as string, outdoorAmbient: 0x8899aa, collapseResist: 0,
  };
  spawnTable: [string, number][] = [];
  creatureCap = 10;
  meta: Record<string, any> = {};
  mutators: { x: number; y: number; kind: string; data?: any }[] = [];
  lastSeen: Float32Array;     // game time each tile was last visible (for shifting geometry)

  constructor(key: string, W: number, H: number, seed: number) {
    this.key = key; this.W = W; this.H = H; this.seed = seed;
    const n = W * H;
    this.floor = new Uint8Array(n); this.floorVar = new Uint8Array(n); this.height = new Int8Array(n);
    this.wallN = new Uint8Array(n); this.wallW = new Uint8Array(n); this.paper = new Uint8Array(n);
    this.room = new Uint16Array(n); this.flags = new Uint16Array(n); this.solid = new Uint8Array(n);
    this.sight = new Uint8Array(n); this.explored = new Uint8Array(n); this.scent = new Float32Array(n);
    this.lastSeen = new Float32Array(n);
  }

  get chunksX() { return Math.ceil(this.W / CHUNK); }
  get chunksY() { return Math.ceil(this.H / CHUNK); }
  inb(x: number, y: number) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  idx(x: number, y: number) { return y * this.W + x; }
  edgeKey(x: number, y: number, side: EdgeSide) { return (y * this.W + x) * 2 + side; }
  chunkOf(x: number, y: number) { return Math.floor(y / CHUNK) * this.chunksX + Math.floor(x / CHUNK); }
  markDirty(x: number, y: number) {
    if (!this.inb(x, y)) return;
    this.dirtyChunks.add(this.chunkOf(x, y));
    // edges on chunk borders affect neighbours
    if (x % CHUNK === 0 && x > 0) this.dirtyChunks.add(this.chunkOf(x - 1, y));
    if (y % CHUNK === 0 && y > 0) this.dirtyChunks.add(this.chunkOf(x, y - 1));
  }

  floorAt(x: number, y: number): FloorDef | null { if (!this.inb(x, y)) return null; const f = this.floor[this.idx(x, y)]; return f ? floorDef(f) : null; }
  heightAt(x: number, y: number): number { return this.inb(x, y) ? this.height[this.idx(x, y)] * 0.1 : 0; }
  setFloor(x: number, y: number, id: number, h?: number) {
    if (!this.inb(x, y)) return;
    const i = this.idx(x, y);
    this.floor[i] = id;
    if (h !== undefined) this.height[i] = Math.round(h * 10);
    this.markDirty(x, y);
  }

  /** Wall def on the north edge of (x,y) */
  wallNAt(x: number, y: number): WallDef | null { if (!this.inb(x, y)) return null; const w = this.wallN[this.idx(x, y)]; return w ? wallDef(w) : null; }
  wallWAt(x: number, y: number): WallDef | null { if (!this.inb(x, y)) return null; const w = this.wallW[this.idx(x, y)]; return w ? wallDef(w) : null; }
  setWallN(x: number, y: number, id: number) { if (!this.inb(x, y)) return; this.wallN[this.idx(x, y)] = id; this.markDirty(x, y); this.markDirty(x, y - 1); this.lightDirtyTiles.push([x, y]); }
  setWallW(x: number, y: number, id: number) { if (!this.inb(x, y)) return; this.wallW[this.idx(x, y)] = id; this.markDirty(x, y); this.markDirty(x - 1, y); this.lightDirtyTiles.push([x, y]); }
  edge(x: number, y: number, side: EdgeSide): EdgeObj | undefined { return this.inb(x, y) ? this.edges.get(this.edgeKey(x, y, side)) : undefined; }
  setEdge(x: number, y: number, side: EdgeSide, e: EdgeObj | null) {
    const k = this.edgeKey(x, y, side);
    if (e) this.edges.set(k, e); else this.edges.delete(k);
    this.markDirty(x, y);
    if (side === 0) this.markDirty(x, y - 1); else this.markDirty(x - 1, y);
    this.lightDirtyTiles.push([x, y]);
  }
  /** door opened/closed, curtains etc: light & sight changed but geometry may not */
  edgeChanged(x: number, y: number, side: EdgeSide) {
    this.markDirty(x, y);
    if (side === 0) this.markDirty(x, y - 1); else this.markDirty(x - 1, y);
    this.lightDirtyTiles.push([x, y]);
  }

  /**
   * Is movement blocked crossing from (x,y) in direction (dx,dy) (one of 4)?
   * mode: 'walk' (doors closed block), 'sight', 'sound'
   */
  edgeBlocks(x: number, y: number, dx: number, dy: number, mode: 'walk' | 'sight' | 'light' | 'creature' = 'walk'): boolean {
    let ex = x, ey = y, side: EdgeSide;
    if (dx === 1) { ex = x + 1; side = 1; }
    else if (dx === -1) { side = 1; }
    else if (dy === 1) { ey = y + 1; side = 0; }
    else { side = 0; }
    if (!this.inb(ex, ey)) {
      // map borders: block walking out unless portal handles it
      return mode === 'walk' || mode === 'creature';
    }
    const i = this.idx(ex, ey);
    const wid = side === 0 ? this.wallN[i] : this.wallW[i];
    const e = this.edges.get(i * 2 + side);
    if (e) {
      if (e.kind === 'arch') return false;
      if (e.kind === 'window') {
        if (mode === 'sight' || mode === 'light') return e.curtains === 'closed' || e.barricade >= 3;
        return true; // must climb through
      }
      // door / gate / shutter
      if (e.open && e.barricade === 0) return false;
      if (mode === 'sight' || mode === 'light') return !e.open;
      return true;
    }
    if (!wid) return false;
    const w = wallDef(wid);
    if (mode === 'sight' || mode === 'light') return !w.seeThrough;
    return true;
  }

  /** Movement check between adjacent tiles including furniture solidity */
  canStep(x: number, y: number, dx: number, dy: number, creature = false): boolean {
    const nx = x + dx, ny = y + dy;
    if (!this.inb(nx, ny)) return false;
    if (dx !== 0 && dy !== 0) {
      // diagonal: both orthogonal paths must be clear
      return this.canStep(x, y, dx, 0, creature) && this.canStep(x + dx, y, 0, dy, creature) &&
        this.canStep(x, y, 0, dy, creature) && this.canStep(x, y + dy, dx, 0, creature);
    }
    if (this.edgeBlocks(x, y, dx, dy, creature ? 'creature' : 'walk')) return false;
    const i = this.idx(nx, ny);
    if (this.solid[i] === 1 || this.solid[i] === 3) return false;
    const f = this.floor[i];
    if (!f) return false;
    return true;
  }

  // ---------------- objects ----------------
  footprint(o: TileObject, def: { w?: number; d?: number }): [number, number][] {
    const w = def.w ?? 1, d = def.d ?? 1;
    const out: [number, number][] = [];
    const rw = o.rot % 2 === 0 ? w : d, rd = o.rot % 2 === 0 ? d : w;
    for (let j = 0; j < rd; j++) for (let i = 0; i < rw; i++) out.push([o.x + i, o.y + j]);
    return out;
  }

  objectsAt(x: number, y: number): TileObject[] { return this.tileObjs.get(this.idx(x, y)) || EMPTY; }

  /** registry hook set by objects module (avoids import cycle) */
  static objDef: (key: string) => any = () => null;

  addObject(o: TileObject) {
    this.objects.set(o.uid, o);
    const def = Zone.objDef(o.key);
    for (const [x, y] of this.footprint(o, def || {})) {
      if (!this.inb(x, y)) continue;
      const i = this.idx(x, y);
      let arr = this.tileObjs.get(i);
      if (!arr) { arr = []; this.tileObjs.set(i, arr); }
      arr.push(o);
      this.recomputeTile(x, y);
      this.markDirty(x, y);
    }
    if (def?.blocksSight) this.lightDirtyTiles.push([o.x, o.y]);
  }

  removeObject(o: TileObject) {
    if (!this.objects.has(o.uid)) return;
    this.objects.delete(o.uid);
    const def = Zone.objDef(o.key);
    for (const [x, y] of this.footprint(o, def || {})) {
      if (!this.inb(x, y)) continue;
      const i = this.idx(x, y);
      const arr = this.tileObjs.get(i);
      if (arr) { const k = arr.indexOf(o); if (k >= 0) arr.splice(k, 1); if (!arr.length) this.tileObjs.delete(i); }
      this.recomputeTile(x, y);
      this.markDirty(x, y);
    }
    this.lights = this.lights.filter((l) => { if (l.objUid === o.uid) { this.removedLights.push(l); return false; } return true; });
    if (def?.blocksSight) this.lightDirtyTiles.push([o.x, o.y]);
  }

  recomputeTile(x: number, y: number) {
    const i = this.idx(x, y);
    let solid = 0, sight = 0;
    for (const o of this.tileObjs.get(i) || EMPTY) {
      const d = Zone.objDef(o.key);
      if (!d) continue;
      if (o.state?.broken && d.brokenPassable) continue;
      const b = d.block ?? 'solid';
      if (b === 'solid') solid = 1;
      else if (b === 'table' && solid !== 1) solid = 3;
      else if (b === 'low' && solid === 0) solid = 2;
      if (d.blocksSight) sight = 1;
    }
    this.solid[i] = solid; this.sight[i] = sight;
  }

  // ---------------- lights / power ----------------
  circuitPowered(c: number): boolean {
    if (c === 0) return true;
    return this.power.get(c) ?? false;
  }
  setCircuit(c: number, on: boolean) {
    this.power.set(c, on);
  }

  roomAt(x: number, y: number): Room { return this.rooms[this.inb(x, y) ? this.room[this.idx(x, y)] : 0] || this.rooms[0]; }
  isOutdoor(x: number, y: number) { return this.inb(x, y) && (this.flags[this.idx(x, y)] & TF.OUTDOOR) !== 0; }

  /** random walkable tile */
  randomFloor(rng: Rng, pred?: (x: number, y: number) => boolean, tries = 400): [number, number] | null {
    for (let t = 0; t < tries; t++) {
      const x = rng.int(1, this.W - 2), y = rng.int(1, this.H - 2);
      const i = this.idx(x, y);
      if (!this.floor[i] || this.solid[i]) continue;
      const f = floorDef(this.floor[i]);
      if (f.water === 'deep') continue;
      if (pred && !pred(x, y)) continue;
      return [x, y];
    }
    return null;
  }
}

const EMPTY: TileObject[] = [];
