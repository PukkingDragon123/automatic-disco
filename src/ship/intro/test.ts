// ?test=intro (or /src/ship/crew/qa.html?test=intro): the intro on the ship hub (the stand-in hub with &stub).
// &from=boot|gravity|patch|repair|pod|monitor starts at a beat; &auto plays the playable beats by itself.
import type { Engine } from '../../app/engine';
import type { Input } from '../../app/input';
import { hubForTest } from '../crew/stubHub';
import { CrewLife } from '../crew/life';
import { crew } from '../crew/index';
import { playIntro, type Beat, type IntroHub } from './intro';

export async function testIntro(engine: Engine, input: Input, P: URLSearchParams) {
  void input;
  const hub = await hubForTest(engine, P);
  // the hub plugin brings the crew aboard on the real hub; the stand-in needs its own
  let life = crew.life(hub);
  for (let i = 0; i < 40 && !life && !hub.stub; i++) { await new Promise((r) => setTimeout(r, 250)); life = crew.life(hub); }
  if (!life) { life = new CrewLife(hub, { hour: 10 }); crew._setLife(hub, life); }
  await new Promise((r) => setTimeout(r, Number(P.get('delay') ?? 300)));
  (window as unknown as { __intro: unknown }).__intro = { hub, life };
  void playIntro(hub as IntroHub, { life, from: (P.get('from') ?? undefined) as Beat | undefined, auto: P.has('auto'), onDone: (s) => console.log('[intro] done, skipped', s) });
}
