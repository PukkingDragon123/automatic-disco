// The inventory on a region: the container kinds in the works catalogue, game.storage, the containers drawn in the
// world, the grid windows, the crate HUD and the stores tutorial. game.ts calls installInventory(game) once, before
// the works are built (so containers coming back from a save attach to their grids).
import type { Game } from '../game/game';
import { registerContainers } from './buildings';
import { attachStorage, type Storage } from './storage';
import { ContainerRender } from './render';
import { preloadContainerModels } from './models';
import { invUI } from '../ui/crates/grid';
import { CrateHud } from '../ui/crates/hud';
import { StoresTutorial } from '../ui/crates/tutorial';
import { ResourceWorld } from '../world/resources3d/world';

export interface Inventory { storage: Storage; render: ContainerRender; hud: CrateHud | null; tutorial: StoresTutorial | null; /** resources in the world: drops into containers, piles at sites (world/resources3d) */ resources: ResourceWorld; dispose(): void }
export function installInventory(g: Game, o: { hud?: boolean } = {}): Inventory {
  const gg = g as unknown as { inventory?: Inventory };
  if (gg.inventory) return gg.inventory;
  registerContainers();
  preloadContainerModels();
  const storage = attachStorage(g);
  const render = new ContainerRender(g, storage);
  const ui = invUI(g)!;
  const hud = o.hud === false ? null : new CrateHud(g, storage, ui);
  const tutorial = hud ? new StoresTutorial(g, storage, ui, hud) : null;
  const resources = new ResourceWorld(g, storage, render);
  gg.inventory = { storage, render, hud, tutorial, resources, dispose: () => { tutorial?.end(); hud?.dispose(); ui.dispose(); render.group.removeFromParent(); resources.dispose(); } };
  return gg.inventory;
}
export { registerContainers, attachStorage };
