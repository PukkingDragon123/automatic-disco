// HUD v7 (UI CORE): installs the main dock, the tool widget (arsenal + bench), the storage widget, the survey window and
// the full map, and the top-left corner, over the colony view; hides the old pieces they replace (the top bar's colony
// plate, vitals strip and time plate, the tool drum, the old minimap, the crate plate, and the logistics hotbar outside
// build mode). `?hud6` keeps the old HUD. Exposes `game.dock`, `game.map7`, `game.hud7`, `window.__dock`.
import type { Game } from '../../game/game';
import { Dock } from './dock';
import { Corner } from './corner';
import { StorageWidget } from './storage';
import { ToolWidget } from './toolWidget';
import { MiniMap, MapScreen } from './map';
import { onFrame } from '../kit/juice';
import { installKitStyle } from '../kit/style';

type G = Game & Record<string, any>;
export interface Hud7 {
  root: HTMLDivElement; dock: Dock | null; corner: Corner | null; storage: StorageWidget | null; tool: ToolWidget | null; mini: MiniMap | null; map: MapScreen | null;
  key(k: string): boolean; setVisible(on: boolean): void; dispose(): void;
  /** the game HUD calls this every frame it runs: without it (another screen on top) the HUD v7 hides */
  ping(): void;
}
export const HUD7_ON = typeof location === 'undefined' || !location.search.includes('hud6');

export function installHud7(game: Game, o: { only?: string } = {}): Hud7 {
  installKitStyle(); injectHideCSS();
  const g = game as G, want = (k: string) => !o.only || o.only === k || (o.only === 'arsenal' || o.only === 'bench' ? k === 'tool' : false) || (o.only === 'storage' && k === 'storage');
  const root = document.createElement('div'); root.className = 'h7-root';
  document.body.append(root);
  document.body.classList.add('h7');
  const dock = want('dock') ? new Dock(game) : null;
  const corner = want('corner') || !o.only ? new Corner(g) : null;
  const storage = want('storage') ? new StorageWidget(g) : null;
  const tool = want('tool') ? new ToolWidget(g) : null;
  const map = want('map') || !o.only ? new MapScreen(g) : null;
  const mini = (want('map') || !o.only) && map ? new MiniMap(g, (from) => map.open(true, from)) : null;
  for (const x of [dock, corner, storage, tool, mini]) if (x) root.append(x.el);
  if (dock) { g.dock = dock; (window as unknown as { __dock: Dock }).__dock = dock; }
  if (map) g.map7 = map;
  let alive = true, lastPing = -1;
  onFrame((dt) => {
    if (!alive) return false;
    const c = g.colony, pinged = lastPing < 0 || performance.now() - lastPing < 300;
    const show = pinged && (!c || (c.ready !== false && !c.fail$?.on && c.ctl?.k !== 'cannon'));
    root.style.display = show ? '' : 'none';
    if (!show) return true;
    corner?.update(dt); storage?.update(dt); tool?.update(dt);
    return true;
  });
  const hud: Hud7 = {
    root, dock, corner, storage, tool, mini, map,
    key(k: string) {
      if (k === 'm' && map) { const r = mini?.el.getBoundingClientRect(); map.open(!map.isOpen, r ? { x: r.left + r.width / 2, y: r.top + 140 } : undefined); return true; }
      return tool?.key(k) ?? false;
    },
    ping() { lastPing = performance.now(); },
    setVisible(on: boolean) { root.style.visibility = on ? '' : 'hidden'; },
    dispose() { alive = false; root.remove(); map?.el.remove(); document.body.classList.remove('h7'); if ((window as unknown as { __dock?: Dock }).__dock === dock) delete (window as unknown as { __dock?: Dock }).__dock; },
  };
  g.hud7 = hud;
  return hud;
}

let css = false;
function injectHideCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-root { position: fixed; inset: 0; z-index: 30; pointer-events: none; }
.h7-root > * { pointer-events: none; }
body.h7 .hud .cx-top, body.h7 .hud .cx-wheel, body.h7 .hud .cx-map, body.h7 .crate-hud { display: none !important; }
body.h7:not(.bp-on) .hb { display: none !important; }
body.cine-on .h7-root, body.cine-on .h7-map, body.cine-on .h7-ars, body.cine-on .h7-bench { visibility: hidden !important; }
body.h7 .hud .cx-alerts { top: 330px !important; }
body.h7 .hud .cx-sel { top: 96px !important; }
body.h7 .hud .cx-pausebar { display: none !important; }
body.h7 .hud .cx-ctl { top: 22px !important; }
body.h7 .hud .cx-count { top: 22px !important; }
`;
  document.head.append(s);
}
