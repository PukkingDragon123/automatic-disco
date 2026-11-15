// A standalone QA entry for the crew and the intro (/src/ship/crew/qa.html?test=crew|intro|unit07&...), so they can
// be checked even while the main entry is broken by work in progress elsewhere.
import { Engine } from '../../app/engine';
import { Input } from '../../app/input';
const canvas = document.getElementById('view') as HTMLCanvasElement;
const engine = new Engine(canvas);
const input = new Input(canvas);
const P = new URLSearchParams(location.search);
(window as unknown as { __engine: Engine }).__engine = engine;
// fast-forward for headless captures: advance the game without drawing (the scene's awaits resolve between steps)
(window as unknown as { __ff: (sec: number, step?: number) => Promise<number> }).__ff = async (sec: number, step = 1 / 20) => {
  const scr = engine.screen as unknown as { render: () => void } | null; if (!scr) return 0;
  const draw = scr.render; scr.render = () => {};
  let t = 0;
  try { for (; t < sec; t += step) { engine.step(step, false); await new Promise((r) => setTimeout(r, 0)); } } finally { scr.render = draw; }
  return t;
};
/** fast-forward until a JS condition holds (QA): __ffUntil("window.__introMark === 'patch:weld'", 60) */
(window as unknown as { __ffUntil: (cond: string, max?: number) => Promise<number> }).__ffUntil = async (cond: string, max = 60) => {
  const ff = (window as unknown as { __ff: (s: number) => Promise<number> }).__ff;
  let t = 0; const test = new Function('return (' + cond + ')') as () => boolean;
  while (t < max && !test()) t += await ff(0.25);
  return t;
};
(async () => {
  (await import('../../ui/kit')).setupUI();
  const t = P.get('test') ?? 'crew';
  if (t === 'intro') (await import('../intro/test')).testIntro(engine, input, P);
  else (await import('./test')).testCrew(engine, input, P);
})();
