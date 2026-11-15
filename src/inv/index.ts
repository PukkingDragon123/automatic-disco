// The inventory on a region: the container kinds in the works catalogue, game.storage, the containers drawn in the
// world, the grid windows, the crate HUD and the stores tutorial. game.ts calls installInventory(game) once, before
// the works are built (so containers coming back from a save attach to their grids).
import type { Game } from '../game/game';
import { registerContainers } from './buildings';
import { attachStorage, type Storage } from './storage';
import { ContainerRender } from './render';
import { invUI } from '../ui/crates/grid';
import { CrateHud } from '../ui/crates/hud';
import { StoresTutorial } from '../ui/crates/tutorial';

export interface Inventory { storage: Storage; render: ContainerRender; hud: CrateHud | null; tutorial: StoresTutorial | null; dispose(): void }
export function installInventory(g: Game, o: { hud?: boolean } = {}): Inventory {
  const gg = g as unknown as { inventory?: Inventory };
  if (gg.inventory) return gg.inventory;
  registerContainers();
  const storage = attachStorage(g);
  const render = new ContainerRender(g, storage);
  const ui = invUI(g)!;
  const hud = o.hud === false ? null : new CrateHud(g, storage, ui);
  const tutorial = hud ? new StoresTutorial(g, storage, ui, hud) : null;
  gg.inventory = { storage, render, hud, tutorial, dispose: () => { tutorial?.end(); hud?.dispose(); ui.dispose(); render.group.removeFromParent(); } };
  return gg.inventory;
}
export { registerContainers, attachStorage };
