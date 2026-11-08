// Static definitions for floors and walls. Ids are stable (saved in zone data).

export type StepSound = 'carpet' | 'wetcarpet' | 'tile' | 'concrete' | 'grass' | 'wood' | 'water' | 'metal' | 'dirt' | 'gravel' | 'linoleum' | 'deep';

export interface FloorDef {
  id: number;
  key: string;
  name: string;
  tex: string[];           // variants
  sound: StepSound;
  walkable?: boolean;      // default true
  outdoor?: boolean;
  farmable?: boolean;
  diggable?: boolean;      // can be dug into soil
  flammable?: number;      // 0..1 spread chance multiplier
  water?: 'shallow' | 'deep';
  tainted?: boolean;       // water source quality
  slow?: number;           // movement multiplier
  friction?: number;
  forage?: string;         // forage table key
  wet?: number;            // wetness applied per second while standing (0..1)
  cold?: number;           // temperature modifier
  rotate?: boolean;        // allow random 90deg uv rotation
  side?: string;           // texture for vertical step faces (ledges, banks); default: the floor's own
}

export interface WallDef {
  id: number;
  key: string;
  name: string;
  tex: string;             // default face texture (used when tile has no wallpaper)
  top: string;             // top cap texture
  height?: number;         // default WALL_H
  thick?: number;          // default 0.12
  hp: number;              // for sledgehammering / damage
  seeThrough?: boolean;    // fences, railings, glass walls
  low?: boolean;           // vaultable low wall / fence
  sound?: 'drywall' | 'concrete' | 'wood' | 'metal' | 'glass';
  noWallpaper?: boolean;   // ignore room wallpaper (exterior materials)
  glass?: boolean;
  alpha?: boolean;         // texture has transparent pixels (chain-link, railings)
}

export const WALL_H = 2.7;
export const TILE = 1;

const floors: FloorDef[] = [];
const floorByKey = new Map<string, FloorDef>();
export function defFloor(d: Omit<FloorDef, 'id'>) { const f = { ...d, id: floors.length + 1 } as FloorDef; floors.push(f); floorByKey.set(f.key, f); return f; }
export const FLOORS = floors;
export const floorDef = (id: number) => floors[id - 1];
export const floorId = (key: string) => { const f = floorByKey.get(key); if (!f) throw new Error('unknown floor ' + key); return f.id; };

const walls: WallDef[] = [];
const wallByKey = new Map<string, WallDef>();
export function defWall(d: Omit<WallDef, 'id'>) { const w = { ...d, id: walls.length + 1 } as WallDef; walls.push(w); wallByKey.set(w.key, w); return w; }
export const WALLS = walls;
export const wallDef = (id: number) => walls[id - 1];
export const wallId = (key: string) => { const w = wallByKey.get(key); if (!w) throw new Error('unknown wall ' + key); return w.id; };

/** Wallpapers: textures applied to wall faces that face into a tile */
const wallpapers: string[] = [''];
const wallpaperIdx = new Map<string, number>();
export function wallpaperId(tex: string): number {
  let i = wallpaperIdx.get(tex);
  if (i === undefined) { i = wallpapers.length; wallpapers.push(tex); wallpaperIdx.set(tex, i); }
  return i;
}
export const wallpaperTex = (id: number) => wallpapers[id];

// ---------------- floors ----------------
defFloor({ key: 'carpet_yellow', name: 'Damp Carpet', tex: ['carpet_yellow', 'carpet_yellow_b', 'carpet_yellow_c'], sound: 'carpet', flammable: 0.4, rotate: true });
defFloor({ key: 'carpet_wet', name: 'Soaked Carpet', tex: ['carpet_wet'], sound: 'wetcarpet', flammable: 0.05, wet: 0.002, rotate: true });
defFloor({ key: 'carpet_office', name: 'Office Carpet', tex: ['carpet_office'], sound: 'carpet', flammable: 0.6 });
defFloor({ key: 'carpet_red', name: 'Red Carpet', tex: ['carpet_red'], sound: 'carpet', flammable: 0.6 });
defFloor({ key: 'carpet_hotel', name: 'Patterned Carpet', tex: ['carpet_hotel'], sound: 'carpet', flammable: 0.6 });
defFloor({ key: 'tile_pool', name: 'Pool Tiles', tex: ['tile_pool'], sound: 'tile', cold: -2, side: 'wall_pool' });
defFloor({ key: 'tile_pool_blue', name: 'Blue Pool Tiles', tex: ['tile_pool_blue'], sound: 'tile', cold: -2, side: 'wall_pool' });
defFloor({ key: 'water_shallow', name: 'Shallow Water', tex: ['tile_pool_blue'], sound: 'water', water: 'shallow', tainted: true, slow: 0.7, wet: 0.02, cold: -4 });
defFloor({ key: 'water_deep', name: 'Deep Water', tex: ['tile_pool_deep'], sound: 'deep', water: 'deep', tainted: true, slow: 0.45, wet: 0.2, cold: -6 });
defFloor({ key: 'linoleum', name: 'Linoleum', tex: ['linoleum'], sound: 'linoleum' });
defFloor({ key: 'linoleum_green', name: 'Hospital Linoleum', tex: ['linoleum_green'], sound: 'linoleum' });
defFloor({ key: 'linoleum_school', name: 'Speckled Tile', tex: ['linoleum_school'], sound: 'linoleum' });
defFloor({ key: 'checker', name: 'Checkered Tile', tex: ['checker'], sound: 'tile' });
defFloor({ key: 'terrazzo', name: 'Terrazzo', tex: ['terrazzo'], sound: 'tile' });
defFloor({ key: 'concrete', name: 'Concrete', tex: ['concrete', 'concrete_b'], sound: 'concrete', rotate: true });
defFloor({ key: 'concrete_wet', name: 'Wet Concrete', tex: ['concrete_wet'], sound: 'water', wet: 0.004, rotate: true });
defFloor({ key: 'asphalt', name: 'Asphalt', tex: ['asphalt'], sound: 'gravel', outdoor: true, rotate: true });
defFloor({ key: 'grass', name: 'Grass', tex: ['grass', 'grass_b', 'grass_c'], sound: 'grass', outdoor: true, diggable: true, forage: 'grass', flammable: 0.3, rotate: true , side: 'dirt' });
defFloor({ key: 'grass_dream', name: 'Soft Grass', tex: ['grass_dream', 'grass_dream_b'], sound: 'grass', outdoor: true, diggable: true, forage: 'dream', flammable: 0.2, rotate: true , side: 'dirt' });
defFloor({ key: 'dirt', name: 'Dirt', tex: ['dirt'], sound: 'dirt', outdoor: true, diggable: true, forage: 'dirt', rotate: true });
defFloor({ key: 'soil', name: 'Tilled Soil', tex: ['soil'], sound: 'dirt', outdoor: true, farmable: true });
defFloor({ key: 'sidewalk', name: 'Sidewalk', tex: ['sidewalk'], sound: 'concrete', outdoor: true });
defFloor({ key: 'wood', name: 'Hardwood', tex: ['wood_floor'], sound: 'wood', flammable: 0.8 });
defFloor({ key: 'wood_gym', name: 'Gym Floor', tex: ['wood_gym'], sound: 'wood', flammable: 0.8 });
defFloor({ key: 'tile_kitchen', name: 'Kitchen Tile', tex: ['tile_kitchen'], sound: 'tile' });
defFloor({ key: 'tile_white', name: 'White Tile', tex: ['tile_white'], sound: 'tile' });
defFloor({ key: 'grate', name: 'Metal Grating', tex: ['grate'], sound: 'metal' });
defFloor({ key: 'lab', name: 'Lab Floor', tex: ['lab_floor'], sound: 'linoleum' });
defFloor({ key: 'server', name: 'Raised Floor', tex: ['server_floor'], sound: 'metal' });
defFloor({ key: 'void', name: 'Static', tex: ['void_floor'], sound: 'metal', cold: -10 });
defFloor({ key: 'glitch', name: 'Corrupted', tex: ['missing_tex', 'glitch_floor'], sound: 'metal' });
defFloor({ key: 'sand', name: 'Sand', tex: ['sand'], sound: 'dirt', outdoor: true, diggable: true });
defFloor({ key: 'gravel', name: 'Gravel', tex: ['gravel'], sound: 'gravel', outdoor: true });
defFloor({ key: 'rubber', name: 'Rubber Matting', tex: ['rubber_mat'], sound: 'carpet' });
defFloor({ key: 'parking', name: 'Garage Concrete', tex: ['concrete_garage'], sound: 'concrete', rotate: true });
defFloor({ key: 'carpet_kids', name: 'Playroom Carpet', tex: ['carpet_kids'], sound: 'carpet', flammable: 0.6 });

// ---------------- walls ----------------
defWall({ key: 'drywall', name: 'Wall', tex: 'wall_yellow', top: 'wall_top', hp: 300, sound: 'drywall' });
defWall({ key: 'concrete', name: 'Concrete Wall', tex: 'wall_concrete', top: 'wall_top_concrete', hp: 2000, sound: 'concrete' });
defWall({ key: 'cinder', name: 'Cinder Block Wall', tex: 'wall_cinder', top: 'wall_top_concrete', hp: 1500, sound: 'concrete' });
defWall({ key: 'brick', name: 'Brick Wall', tex: 'wall_brick', top: 'wall_top_concrete', hp: 1500, sound: 'concrete', noWallpaper: false });
defWall({ key: 'siding', name: 'House Siding', tex: 'wall_siding', top: 'wall_top', hp: 500, sound: 'wood' });
defWall({ key: 'tile', name: 'Tiled Wall', tex: 'wall_pool', top: 'wall_top_white', hp: 1500, sound: 'concrete' });
defWall({ key: 'cubicle', name: 'Cubicle Partition', tex: 'cubicle_fabric', top: 'cubicle_top', height: 1.45, thick: 0.08, hp: 80, sound: 'drywall', low: false, noWallpaper: true });
defWall({ key: 'fence_wood', name: 'Wooden Fence', tex: 'fence_wood', top: 'wood_light', height: 1.2, thick: 0.08, hp: 120, low: true, sound: 'wood', noWallpaper: true });
defWall({ key: 'fence_chain', name: 'Chain-link Fence', tex: 'fence_chain', top: 'metal_grey', height: 1.9, thick: 0.05, hp: 200, seeThrough: true, sound: 'metal', noWallpaper: true, alpha: true });
defWall({ key: 'railing', name: 'Railing', tex: 'railing', top: 'metal_grey', height: 1.0, thick: 0.06, hp: 300, seeThrough: true, low: true, sound: 'metal', noWallpaper: true, alpha: true });
defWall({ key: 'glass', name: 'Glass Wall', tex: 'glass_wall', top: 'metal_grey', hp: 60, seeThrough: true, sound: 'glass', noWallpaper: true, glass: true });
defWall({ key: 'lab', name: 'Lab Panel Wall', tex: 'wall_lab', top: 'wall_top_white', hp: 2500, sound: 'metal' });
defWall({ key: 'server', name: 'Server Wall', tex: 'wall_server', top: 'wall_top_concrete', hp: 2500, sound: 'metal' });
defWall({ key: 'hedge', name: 'Hedge', tex: 'hedge', top: 'hedge_top', height: 1.8, thick: 0.5, hp: 200, sound: 'wood', noWallpaper: true });
defWall({ key: 'glitch', name: 'Corrupted Wall', tex: 'missing_tex', top: 'missing_tex', hp: 99999, sound: 'metal', noWallpaper: true });
defWall({ key: 'wood_built', name: 'Wooden Wall', tex: 'wall_planks', top: 'wood_dark', hp: 400, sound: 'wood', noWallpaper: true });
defWall({ key: 'low_concrete', name: 'Low Wall', tex: 'wall_concrete', top: 'wall_top_concrete', height: 0.9, thick: 0.2, hp: 1500, low: true, sound: 'concrete', noWallpaper: true });
defWall({ key: 'shelf_wall', name: 'Shelving', tex: 'shelf_side', top: 'metal_grey', height: 2.1, thick: 0.5, hp: 400, sound: 'metal', noWallpaper: true });
