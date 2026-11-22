// A standalone dev entry for the resource QA pages (src/world/resources3d/res.html?sheet | ?zoo | ?bake | ?drop),
// so they open even while the main boot is being rewired; ?test=res in the main boot opens the same pages.
import { Engine } from '../../app/engine';
import { testRes } from './test';

const engine = new Engine(document.getElementById('view') as HTMLCanvasElement);
(window as unknown as { __engine: Engine }).__engine = engine;
void testRes(engine, new URLSearchParams(location.search));
