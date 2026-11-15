// A stand-alone entry for the progression test pages (src/research/test.html), so they do not depend on main.ts:
//   /src/research/test.html?test=mastery&tab=...   /src/research/test.html?test=event&id=...
import { Engine } from '../app/engine';
import { Input } from '../app/input';
import { setupUI } from '../ui/kit';
import { testProgression, testEvent, testLiveries, testEventStage } from './test';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const engine = new Engine(canvas), input = new Input(canvas), P = new URLSearchParams(location.search);
(window as any).__engine = engine;
setupUI();
if (P.get('test') === 'event') void testEvent(engine, input, P);
else if (P.get('test') === 'liveries') void testLiveries(engine);
else if (P.get('test') === 'stage') void testEventStage(engine, P);
else if (P.get('test') === 'factions') void import('../game/factions/test').then((m) => m.testFactions(engine, input, P));
else { testProgression(engine, P); engine.start(); }
