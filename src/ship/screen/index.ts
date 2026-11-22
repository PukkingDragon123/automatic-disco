// v7 SHIP + LAB screens: the dock's SHIP slot opens the ship screen (the MERIDIAN as a miniature in a frame, its
// rooms as hotspots, their functions as compact panels), the LAB slot opens the fitting bench (src/ui/lab7). Both
// are 2D painted UI framing one 3D element; both play the dock's transition in and out.
//   installShipScreens(game)   registers the two slots on the dock (as soon as the HUD has made it)
//   openShipScreen(game, o)    the ship screen anywhere (o.close plays the way out)
//   openHubPanel(hub, id)      a room's functions over the ship hub itself (the hub's rooms use this)
import type { Game } from '../../game/game';
import { ShipScreen, type ShipScreenOpts } from './screen';
import { portraitRenderer } from '../../social/portrait';
import { onFrame } from '../../ui/kit/juice';
import { uiSfx } from '../../ui/kit/sound';
export { ShipScreen } from './screen';
export { openHubPanel, HubPanel } from './hubPanel';

interface DockCtx { x: number; y: number; close(after?: () => void): Promise<void> }
interface DockLike { register(id: string, open: (ctx: DockCtx) => void | Promise<void>, o?: { transition?: string }): void }

export async function openShipScreen(game: any, o: Partial<ShipScreenOpts> = {}): Promise<ShipScreen | null> {
  if (ShipScreen.current) return ShipScreen.current;
  const eng = game?.engine ?? (window as unknown as { __engine?: { renderer: unknown } }).__engine;
  if (eng?.renderer) portraitRenderer(eng.renderer as never);
  const s = new ShipScreen({ game, ...o });
  await s.ready();
  s.enter();
  return s;
}

export function installShipScreens(game: Game) {
  const G = game as unknown as { dock?: DockLike; update$: ((dt: number) => void)[]; engine?: { renderer: unknown } };
  let hooked: DockLike | null = null;
  const hook = () => {
    const d = G.dock ?? (window as unknown as { __dock?: DockLike }).__dock ?? null;
    if (!d || d === hooked) return;
    hooked = d;
    const ok = (id: string) => (G as unknown as { unlocks?: { has(f: string): boolean } }).unlocks?.has('dock:' + id) ?? true;
    d.register('ship', async (ctx) => { if (!ok('ship')) { uiSfx('error', 0.5); return; } await openShipScreen(game, { close: (after) => ctx.close(after) }); }, { transition: 'iris' });
    d.register('lab', async (ctx) => { if (!ok('lab')) { uiSfx('error', 0.5); return; } const { openLabFit } = await import('../../ui/lab7/fit'); await openLabFit(game, { close: (after) => ctx.close(after) }); }, { transition: 'dissolve' });
  };
  G.update$.push(hook);
  // the HUD makes the dock a moment after the game: look for it every frame until it is there
  let tries = 0;
  onFrame(() => { hook(); return !hooked && ++tries < 600; });
  hook();
}
