// ?test=hud7: a stand-in game for the HUD v7 (a real Region, real Storage and ToolSlots, a stubbed colony), with the
// region painted full screen behind it as a backdrop. No 3D world, so the page stays light.
import type { Game } from '../../game/game';
import { Region, BIOMES, type BiomeKey } from '../../world/region';
import { planetPalette } from '../../world/palette';
import { ToolSlots } from '../../colony/tools';
import { paintTerrain, paintFog } from './mapPaint';

export async function makeStandIn(P: URLSearchParams): Promise<Game> {
  const seed = Number(P.get('seed') ?? 11), biome = (P.get('biome') ?? 'meadow') as BiomeKey;
  const pal = planetPalette(seed, P.get('pal') ?? undefined);
  const region = new Region(seed, BIOMES[biome], pal);
  const N = region.N, L = region.landing;
  const seen = new Uint8Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { const d = Math.hypot(x - L.x, z - L.z), d2 = Math.hypot(x - L.x - 42, z - L.z + 20); if (d < 46 || d2 < 22) seen[z * N + x] = 1; }
  const { Run } = await import('../../game/run');
  const { Storage } = await import('../../inv/storage');
  (await import('../../world/geo/items')).registerGeoItems();
  const handlers: Record<string, ((d: unknown) => void)[]> = {};
  const fg: Record<string, any> = {
    run: new Run(seed), opts: { seed, hooks: {} }, update$: [] as ((dt: number) => void)[], region, pal,
    world: { creatures: [], day: Number(P.get('day') ?? 0.32) }, vision: { seen },
    fx: { mote() {}, burst() {} }, veyr: { core: { x: 0, y: 0, z: 0 } },
    factory: { buildings: [{ id: 1, x: L.x + 9, z: L.z - 6, dead: false, def: { name: 'Sawbench' } }, { id: 2, x: L.x - 8, z: L.z + 7, dead: false, def: { name: 'Crop Plot' } }] },
    factions: { structures: [{ id: 1, x: L.x + 50, z: L.z - 22, dead: false, faction: 'Eurasian Concord' }] },
    paused: false, speed: 1,
    cam: { lookAt() {}, ray: null },
    on(ev: string, f: (d: unknown) => void) { (handlers[ev] ??= []).push(f); },
    emit(ev: string, d?: unknown) { for (const f of handlers[ev] ?? []) f(d); },
  };
  fg.run.flags['inv.tut'] = 1;
  const g = fg as unknown as Game;
  // the stores: the hold and a few containers, stocked
  const st = new Storage(g); fg.storage = st;
  const stock: [string, [string, number][]][] = [
    ['crate', [['wood', 34], ['fruit', 18], ['rock_granite', 9], ['gear', 14], ['bark', 22], ['berries', 8], ['iron_plate', 30]]],
    ['st_bunker', [['ore', 120], ['coal', 40], ['copper_ore', 60], ['gravel', 100]]],
    ['st_pit', [['soil', 140], ['clay', 60], ['sand', 70]]],
  ];
  stock.forEach(([k, items], i) => { const b = { id: 9000 + i, kind: k, x: L.x + 4 + i * 3, z: L.z + 3, cx: 0, cz: 0, dead: false, sat: 1, on: true, plug: null, store: new Map(), def: { power: 0 }, y: 0, r: 0, rise: 1 }; const c = st.attach(b as never); for (const [id, n] of items) c.insert(id, n); });
  st.hold.stacks = [];
  for (const [id, n] of [['ore', 40], ['carbon', 30], ['wood', 8], ['leaves', 30], ['water', 20], ['soil', 50], ['seed_grass', 12]] as [string, number][]) st.hold.insert(id, n);
  // the colony, stubbed
  const lvl = (P.get('vitals') ?? 'warn') as 'ok' | 'warn' | 'crit';
  const colony: Record<string, any> = {
    g, pod: { x: L.x, z: L.z, y: region.heightAt(L.x, L.z) }, controlRadius: 30, sol: 3, ready: true, fail$: { on: false }, ctl: { k: 'rts' }, sel: null,
    arms: [{ id: 1, kind: 'manipulator', hp: 10, name: 'MANIPULATOR' }, { id: 2, kind: 'drill', hp: 10, name: 'DRILL ARM' }, { id: 3, kind: 'grabber', hp: 10, name: 'GRABBER' }],
    drones: [{ id: 1, kind: 'scout', hp: 10, name: 'SCOUT 1', x: L.x + 20, z: L.z - 12 }, { id: 2, kind: 'carrier', hp: 10, name: 'CARRIER 1', x: L.x - 14, z: L.z - 6 }],
    structures: [{ id: 1, kind: 'relay', done: true, name: 'RELAY MAST', x: L.x + 26, z: L.z + 18 }],
    teammates: [{ id: 'mamani', name: 'Mamani', alive: true, x: L.x + 5, z: L.z + 9 }, { id: 'kristiansen', name: 'Kristiansen', alive: true, x: L.x - 6, z: L.z + 4 }],
    vitals: {
      battery: lvl === 'crit' ? 6 : 46, batteryCap: 120, gen: 3, draw: 5.5, o2: lvl === 'ok' ? 88 : lvl === 'warn' ? 31 : 9,
      levels: { power: lvl === 'crit' ? 'crit' : 'ok', oxygen: lvl, food: 'ok', integrity: 'ok', health: 'ok', morale: 'ok' },
      timers: { oxygen: lvl === 'ok' ? null : 312, power: lvl === 'crit' ? 95 : null },
      value(id: string) { return id === 'power' ? this.battery / this.batteryCap : id === 'oxygen' ? this.o2 / 100 : 0.8; },
    },
    togglePause() { fg.paused = !fg.paused; }, setSpeed(n: number) { fg.speed = n; fg.paused = false; },
    release() { colony.slots.active = -1; },
    useSlot(i: number) { const s = colony.slots.slots[i]; if (!s || s.level <= 0) return 'Slot locked: upgrade it with the Upgrader'; if (!s.tool) return 'Empty slot: assign a tool'; if (!colony.slots.unitOf(i)) return 'No unit can run it: build one'; colony.slots.active = colony.slots.active === i ? -1 : i; return ''; },
    alerts: [],
  };
  colony.slots = new ToolSlots(colony as never);
  colony.slots.slots[3].tool = 'drill';
  fg.colony = colony;
  // the backdrop: the region painted full screen (scaled up whole pixels), the fog over it
  if (P.get('view') !== 'kit') {
    const bg = document.createElement('canvas'); bg.className = 'h7-test-bg';
    const t = paintTerrain(region, pal, 2), f = paintFog(region, seen, 2);
    const W = Math.ceil(innerWidth / 4), H = Math.ceil(innerHeight / 4);
    bg.width = W; bg.height = H;
    const c = bg.getContext('2d')!; c.imageSmoothingEnabled = false;
    const ox = Math.round(W / 2 - L.x * 2), oy = Math.round(H / 2 - L.z * 2);
    c.drawImage(t.px.canvas(), ox, oy); c.drawImage(f.canvas(), ox, oy);
    bg.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;image-rendering:pixelated;z-index:0;filter:saturate(.9) brightness(.92)';
    document.body.append(bg);
  }
  return g;
}
