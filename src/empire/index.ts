// EMPIRE BUILDING (v7): grow from the pod into a planet-wide empire. One wiring line in game.ts
// (`installEmpire(this)`, at the end of the constructor) and the flow hook in flow.ts (host.ts).
//   game.empire / window.__empire         the Empire (empire.ts): settlements, links, routes, convoys, diplomacy
//   game.empireScreen / openEmpire(g)      the EMPIRE OVERVIEW (screen.ts), folded into the MAP: an EMPIRE icon
//                                          beside the survey window and on the full map's rail, and the O key
// Settlements: the crash site is the first; outposts come from settler convoys and pod drops (skill tree lane
// EMPIRE, nodes.ts). Unloaded settlements run on abstract rates; travel (travel.ts) rebuilds the other region's game.
import type { Game } from '../game/game';
import { makePlanet } from '../world/planet';
import { Empire } from './empire';
import { EmpireScreen } from './screen';
import { empireHost } from './host';
import { floatIcon, type FloatIcon } from '../ui/kit/floatIcon';
import { bindTip } from '../ui/kit/panel';
import { globeGlyph, glyphEl } from './glyphs';
export { Empire } from './empire';
export { setEmpireHost, settledLanding } from './host';

type G = Game & Record<string, any>;

export function installEmpire(game: Game): Empire | null {
  const g = game as G;
  try {
    const host = empireHost(), planet = host?.planet() ?? makePlanet(g.run.seed);
    let region = planet.regions.findIndex((r) => r.seed === g.opts.seed);
    if (region < 0) region = Math.max(0, planet.regions.findIndex((r) => r.biome === g.opts.biome));
    const e = new Empire(g, planet, g.run);
    g.empire = e; (window as unknown as { __empire: Empire }).__empire = e;
    // the settlement of this region: at once, or once the pod is down (a descent)
    let done = false;
    const go = () => { if (done) return; done = true; try { e.arrive(region); } catch (err) { console.error('empire arrive', err); } };
    if (g.descending) g.on('colony-ready', go); else go();
    g.update$.push((dt: number) => { try { e.update(dt); } catch (err) { console.error('empire', err); } });
    g.on('faction-eliminated', (d: { faction?: string }) => { if (d?.faction === 'soviet' || d?.faction === 'prc') e.eliminated(d.faction); });
    const scr = new EmpireScreen(e); g.empireScreen = scr;
    // the EMPIRE icons: beside the survey window and on the full map's rail
    const icons: FloatIcon[] = [];
    const open = (fi?: FloatIcon) => { const r = fi?.el.getBoundingClientRect(); for (const f of icons) f.setBadge(null); if (g.map7?.isOpen) g.map7.open(false); scr.open(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined); };
    const mk = () => { const fi: FloatIcon = floatIcon({ canvas: glyphEl(globeGlyph(2), 2), name: 'EMPIRE', nameSize: 16, sound: 'open', hint: 'O', onClick: () => open(fi) }); bindTip(fi.el, () => ({ title: 'EMPIRE', sub: `${e.d.settlements.length} settlement${e.d.settlements.length === 1 ? '' : 's'}`, desc: 'The planet map with your settlements, roads and rail, trade routes, the rival blocs\' ground, the empire\'s numbers and diplomacy.', hint: [['O', 'open']] })); icons.push(fi); return fi; };
    let tries = 0;
    const hook = () => {
      const mini = g.hud7?.mini?.el as HTMLElement | undefined, rail = g.map7?.el?.querySelector?.('.h7-map-rail') as HTMLElement | null;
      if ((!mini || !rail) && tries++ < 30) { requestAnimationFrame(hook); return; }
      injectCSS();
      if (mini && !mini.querySelector('.emp-mini-icon')) { const fi = mk(); fi.el.classList.add('emp-mini-icon'); mini.append(fi.el); }
      if (rail && !rail.querySelector('.emp-rail-icon')) { const fi = mk(); fi.el.classList.add('emp-rail-icon'); rail.prepend(fi.el); }
    };
    hook();
    e.on('tier', (x: { up: boolean }) => { if (x?.up) for (const f of icons) f.setBadge('!'); });
    e.on('log', () => { if (!scr.isOpen) for (const f of icons) f.setBadge('!'); });
    // O opens the overview (from the game view or from over the region map)
    const key = (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() !== 'o' || ev.ctrlKey || ev.metaKey || ev.altKey || scr.isOpen) return;
      if (g.engine.screen !== g || (window as unknown as { __game?: unknown }).__game !== g) return;
      const t = ev.target as HTMLElement | null; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const b = document.body.classList; if (b.contains('bp-on') || b.contains('trs-on') || b.contains('cine-on') || document.querySelector('.rt7, .sh7-screen, .lab7')) return;
      ev.preventDefault(); open(icons[0]);
    };
    addEventListener('keydown', key);
    const dispose = g.dispose.bind(g);
    g.dispose = () => { removeEventListener('keydown', key); scr.close(false); dispose(); };
    return e;
  } catch (err) { console.error('installEmpire', err); return null; }
}
/** open the empire overview of a game (QA, other screens) */
export function openEmpire(game: Game, from?: { x: number; y: number }) { (game as G).empireScreen?.open(from); }

let css = false;
function injectCSS() {
  if (css) return; css = true;
  const s = document.createElement('style');
  s.textContent = `
.h7-mini .emp-mini-icon { position: absolute !important; left: -50px; top: 26px; z-index: 2; pointer-events: auto; }
.h7-map-rail .emp-rail-icon { pointer-events: auto; }
`;
  document.head.append(s);
}
