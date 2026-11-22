// ?test=hud7: the HUD v7 and the UI kit without the 3D world (a light page for visual QA on a slow machine).
//   &view=dock|kit|panels|tool|arsenal|bench|map|storage|hud   what to show (default hud: everything over a painted region)
//   &hover=build   a dock slot drawn hot      &tr=iris|shutter|dissolve|swoop&k=0.6   a transition frozen mid-frame
//   &open=1        the storage expanded       &seed=11&biome=meadow
import type { Engine } from '../../app/engine';
import type { Input } from '../../app/input';
import { installKitStyle } from '../kit/style';

export async function testHud7(_engine: Engine, _input: Input, P: URLSearchParams) {
  installKitStyle();
  document.body.style.background = '#1d2420';
  const view = P.get('view') ?? 'hud';
  if (view === 'panels') { await (await import('./panelSheet')).panelSheet(); return; }
  const { makeStandIn } = await import('./standin');
  const g = await makeStandIn(P);
  const { installHud7 } = await import('./index');
  if (view === 'kit') { (await import('./kitSheet')).kitSheet(); return; }
  const hud = installHud7(g, { only: view === 'hud' ? undefined : view });
  (window as unknown as { __hud7: unknown }).__hud7 = hud;
  if (P.get('hover')) setTimeout(() => { const el = hud.dock?.icon(P.get('hover') as never); el?.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })); }, 300);
  if (P.get('tr')) { const { holdTransition } = await import('../kit/transitions'); const el = hud.dock?.icon('research'); const r = el?.getBoundingClientRect(); setTimeout(() => holdTransition(P.get('tr') as never, Number(P.get('k') ?? 0.6), r ? { x: r.left + r.width / 2, y: r.top + 50 } : {}), 600); }
  if (view === 'arsenal') setTimeout(() => hud.tool?.openArsenal(), 400);
  if (view === 'bench') setTimeout(() => hud.tool?.openBench(), 400);
  if (view === 'map' || P.has('map')) setTimeout(() => hud.map?.open(true), 400);
  if (P.has('open')) setTimeout(() => hud.storage?.expand(true), 400);
}
