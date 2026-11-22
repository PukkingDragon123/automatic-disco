// TROOPS (troops agent): RTS human management for every unit the player commands, the unit cards, the barks and
// the TROOPS screen on the dock. One wiring line in the Game constructor: installTroops(game). Exposes `game.troops`
// (and `window.__troops` for QA):
//   troops.book    OrderBook (orders.ts): issue(k, troops, x, z, tgt?, queued?, face?), formation, squads, stateOf(t)
//   troops.rts     Rts (rts.ts): sel, select(list), groups, cmd('stop'|'hold'|'amove'|'patrol'), setFormation(f),
//                  context(mx, my, sel), orderAt(x, z) (the minimap's right-click), focus(list)
//   troops.cards   the bottom card panel; troops.barks the bark strip; troops.screen the TROOPS screen (open(ctx))
//   troops.list()  every unit (units.ts Troop adapters), troops.isSel(ref) for the old overlays
import type { Game } from '../game/game';
import { OrderBook } from './orders';
import { Decals } from './decals';
import { Rts } from './rts';
import { Cards } from './cards';
import { Barks } from './barks';
import { TroopsScreen, Foundry } from './screen';
import { WorkerTroop, type Troop } from './units';
import { uiSfx } from '../ui/kit/sound';
import { onFrame } from '../ui/kit/juice';
import { CYBER } from '../life/cyber/catalog';

type G = Game & Record<string, any>;
export interface TroopsApi { book: OrderBook; rts: Rts; cards: Cards; barks: Barks; screen: TroopsScreen; foundry: Foundry; list(): Troop[]; isSel(ref: unknown): boolean; orderAt(x: number, z: number): boolean; dispose(): void }

export function installTroops(game: Game): TroopsApi {
  const g = game as G;
  WorkerTroop.cyber = CYBER as Record<string, unknown> as Record<string, any>;
  const book = new OrderBook(g), decals = new Decals(g), rts = new Rts(g, book, decals);
  const cards = new Cards(g, rts, book), barks = new Barks(g, book), foundry = new Foundry(g), screen = new TroopsScreen(g, book, rts, foundry);
  rts.cv.classList.add('overlay2d');
  book.onOrder = (e) => { barks.ordered(e); cards.ordered(); };
  book.onEvent = (k, t, s) => barks.event(k, t, s);
  // the sim: the order book and the foundry queues run on sim time (paused = orders wait, as the colony's do)
  let alive = true;
  g.update$.push((dt: number) => {
    if (!alive) return;
    book.update(dt);
    rts.prune();
    if (dt > 0) foundry.tick();
    dockHook();
  });
  // the frame: ground marks and reactions go in just before the world is drawn, the 2D layer right after
  const r0 = g.render.bind(g);
  let lastT = -1, drawnAt = 0;
  // another screen over the game (the ship, the lab): the layers stand down until the colony is drawn again
  onFrame(() => { if (!alive) return false; const on = g.engine?.screen === g && (g as unknown as { act?: boolean }).act !== false && performance.now() - drawnAt < 20000; rts.cv.style.visibility = on ? '' : 'hidden'; barks.el.style.visibility = on ? '' : 'hidden'; return true; });
  g.render = (post: unknown, t: number) => {
    const dt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    drawnAt = performance.now();
    try { rts.frame(dt); barks.apply(); } catch (e) { console.error('troops frame', e); }
    try { r0(post as never, t); } finally { barks.restore(); }
    try { rts.overlay(); barks.frame(dt); } catch (e) { console.error('troops overlay', e); }
  };
  // the dock's TROOPS slot (blast shutters), gated by what has been learned
  let hooked: unknown = null;
  const dockHook = () => {
    const d = g.dock; if (!d || d === hooked) return;
    hooked = d;
    d.register('troops', (ctx: Parameters<TroopsScreen['open']>[0]) => {
      if (!(g.unlocks?.has?.('dock:troops') ?? true)) { uiSfx('error', 0.5); return; }
      screen.open(ctx);
    }, { transition: 'shutter' });
  };
  dockHook();
  const api: TroopsApi = {
    book, rts, cards, barks, screen, foundry,
    list: () => book.troops,
    isSel: (ref: unknown) => !!ref && !!(ref as { __troopSel?: number }).__troopSel && rts.sel.length > 0,
    orderAt: (x: number, z: number) => rts.orderAt(x, z),
    dispose() { alive = false; rts.dispose(); decals.dispose(); cards.el.remove(); barks.dispose(); g.render = r0; },
  };
  g.troops = api;
  (window as unknown as { __troops: TroopsApi }).__troops = api;
  const d0 = g.dispose.bind(g);
  g.dispose = () => { try { api.dispose(); } catch { /* gone */ } d0(); };
  return api;
}
