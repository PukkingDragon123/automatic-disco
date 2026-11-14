// Visual QA pages for this module's pieces: ?test=icons (the icon sheet), ?test=cine&scene=opening|contact|
// camp|beast|final (a cutscene played in a real region), ?test=menu (the launch-control menu without the flow).
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import { HI_ICON_NAMES, hiIcon, SKILL_ICON, RES_ICON } from './icons';
import { SKILLS } from '../game/skills';

export function testIcons(engine: Engine) {
  const P = new URLSearchParams(location.search);
  const sizes = (P.get('px') ?? '36,54').split(',').map(Number);
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;overflow:auto;background:#101418;color:#cfe8c8;font:14px VT,monospace;padding:12px;z-index:9;pointer-events:auto';
  document.body.appendChild(root);
  const section = (title: string, names: string[]) => {
    const h = document.createElement('div'); h.textContent = title; h.style.cssText = 'margin:8px 0 4px;color:#ffcd6e'; root.appendChild(h);
    const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px'; root.appendChild(row);
    for (const n of names) {
      const cell = document.createElement('div'); cell.style.cssText = 'display:flex;flex-direction:column;align-items:center;background:#1c2228;padding:4px;border:1px solid #2c3640;min-width:60px';
      for (const s of sizes) {
        const pc = hiIcon(n, s, { shadow: true }); if (!pc) continue;
        const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h; c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
        const z = Number(P.get('zoom') ?? (s <= 36 ? 2 : 1)); c.style.width = pc.w * z + 'px'; c.style.height = pc.h * z + 'px'; c.style.imageRendering = 'pixelated';
        cell.appendChild(c);
      }
      const l = document.createElement('div'); l.textContent = n; l.style.cssText = 'font-size:12px;color:#8fb08a'; cell.appendChild(l);
      row.appendChild(cell);
    }
  };
  const only = P.get('only');
  if (only) { section('ICONS', only.split(',')); return; }
  section('RESOURCES', Object.values(RES_ICON));
  section('SKILLS (by skill id)', SKILLS.map((s) => SKILL_ICON[s.id] ?? s.id));
  const rest = HI_ICON_NAMES.filter((n) => !Object.values(SKILL_ICON).includes(n) && !Object.values(RES_ICON).includes(n));
  section('HUD AND STORY', rest);
  void engine;
}

export async function testCine(engine: Engine, input: Input) {
  const P = new URLSearchParams(location.search);
  const { Game } = await import('../game/game');
  (await import('./kit')).setupUI();
  const g = new Game(engine, input, { seed: Number(P.get('seed') ?? 11), biome: (P.get('biome') ?? 'meadow') as any, story: true, regionName: 'Test Valley' });
  engine.setScreen(g);
  engine.start();
  (window as any).__cineTest = g;
  // fast-forward for headless captures: advance the game without drawing, yielding so the scene's awaits resolve
  (window as any).__ff = async (sec: number, step = 1 / 15) => {
    const scr = engine.screen as any, draw = scr.render; scr.render = () => {};
    try { for (let t = 0; t < sec; t += step) { engine.step(step, false); await new Promise((r) => setTimeout(r, 0)); } } finally { scr.render = draw; }
  };
  const scene = P.get('scene') ?? 'opening';
  const st = g.story; if (st) { st.auto = P.has('auto'); st.beat = scene === 'opening' || scene === 'contact' ? 'opening' : 'free'; }
  // let the region settle a moment, then play the scene directly (the story's own triggers are bypassed)
  if (!P.has('auto')) setTimeout(() => { void g.story?.playScene(scene as any, P.get('part') ?? undefined); }, Number(P.get('delay') ?? 400));
}

function ffHook(engine: Engine) {
  (window as any).__ff = async (sec: number, step = 1 / 15) => {
    const scr = engine.screen as any, draw = scr.render; scr.render = () => {};
    try { for (let t = 0; t < sec; t += step) { engine.step(step, false); await new Promise((r) => setTimeout(r, 0)); } } finally { scr.render = draw; }
  };
}
export async function testMenu(engine: Engine) {
  ffHook(engine);
  const { MenuScreen, AscendScreen } = await import('./menu');
  (await import('./kit')).setupUI();
  if (new URLSearchParams(location.search).has('ascend')) {
    const { makePlanet } = await import('../world/planet');
    const p = makePlanet(4242); p.regions.forEach((r, i) => { r.state = i % 3 ? 'veyr' : 'wild' as any; });
    engine.setScreen(new AscendScreen(p, 'Unit 07', () => console.log('ascend done')));
    engine.start();
    return;
  }
  engine.setScreen(new MenuScreen({
    hasSave: true, archive: [{ seed: 4242, name: 'Kessel Prime', date: '2026-11-01', species: 14, genes: ['legs4', 'jaws'], regions: 6 }, { seed: 77, name: 'Ottoline', date: '2026-11-05', species: 9, genes: [], regions: 5 }],
    onNew: (s) => console.log('onNew', s), onContinue: () => console.log('onContinue'), onLaunch: (e) => console.log('onLaunch', e.name), onMirror: (back) => { console.log('onMirror'); setTimeout(back, 500); },
  }));
  engine.start();
}
