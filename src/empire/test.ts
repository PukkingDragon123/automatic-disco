// EMPIRE · QA. `?test=empire` boots the real flow (a run, a planet, a landing on its gentlest land region, no
// descent) so travel between settlements rebuilds real region games. Params: &seed=n &unlockall
//   &found=n     found n outposts at once next to the first (QA: no convoy timer)   &road (roads between them, open)
//   &route       a trade route from the first to the second                         &open (the overview) &tab=<id>
//   &go=<i>      travel to settlement i after boot                                  &war / &pact (with the Concord)
// window.__empireQA: found(region?, how?), road(a, b, kind?), route(from, to, item, n), fast(seconds), go(i), open(tab?)
import type { Engine } from '../app/engine';
import type { Input } from '../app/input';
import type { Empire } from './empire';
import type { BlocId, LinkKind } from './types';
import { travelTo } from './travel';
import { km } from './geo';

type G = Record<string, any>;
const em = (): Empire | null => (window as unknown as { __empire?: Empire }).__empire ?? null;

export async function testEmpire(engine: Engine, input: Input, P: URLSearchParams) {
  const { Flow } = await import('../flow');
  (await import('../ui/kit')).setupUI();
  const f = new Flow(engine, input);
  (window as unknown as { __flow: unknown }).__flow = f;
  const seed = Number(P.get('seed') ?? 4242);
  f.startRun(seed); f.choosePlanet(seed);
  const p = f.planet!;
  const land = p.regions.filter((r) => !['ocean', 'reef', 'archipelago'].includes(r.biome)).sort((a, b) => a.danger - b.danger)[0];
  f.land(land);
  engine.start();
  installQA();
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await wait(1500);
  const e = em(); if (!e) return;
  const n = Number(P.get('found') ?? 0);
  for (let i = 0; i < n; i++) qa.found();
  if (P.has('road')) for (let i = 1; i < e.d.settlements.length; i++) qa.road(e.d.settlements[0].id, e.d.settlements[i].id, P.get('road') === 'rail' ? 'rail' : 'road');
  if (P.has('route') && e.d.settlements.length > 1) { qa.stock(e.d.settlements[0].id, { wood: 40, iron_plate: 20 }); qa.route(e.d.settlements[0].id, e.d.settlements[1].id, 'wood', 15); }
  if (P.has('war')) e.war('soviet');
  if (P.has('pact')) { e.bloc('prc').relation = 30; e.pact('prc'); }
  if (P.has('go')) { await wait(500); await qa.go(Number(P.get('go'))); }
  if (P.has('open')) { await wait(600); qa.open(P.get('tab') ?? undefined); }
}

const qa = {
  /** found an outpost at once in a region (default: the first unsettled region next to a settlement) */
  found(region?: number, how: 'convoy' | 'drop' = 'convoy') {
    const e = em(); if (!e) return null;
    if (region === undefined) {
      const near = new Set<number>(); for (const s of e.d.settlements) for (const n of e.adj[s.region] ?? []) near.add(n);
      region = [...near].find((r) => !e.settlementAt(r) && !e.sea(r)) ?? [...near].find((r) => !e.settlementAt(r));
    }
    if (region === undefined) return null;
    const src = e.d.settlements[0];
    e.d.convoys.push({ id: e.d.next++, kind: how === 'drop' ? 'drop' : 'settlers', from: src.id, to: -1, region, t: 0, dur: 0.01, cargo: { wood: 14, iron_plate: 4, berries: 10 }, settlers: [] });
    e.update(0.05);
    const s = e.settlementAt(region);
    if (s) { s.pop = Math.max(s.pop, 3); s.workers = 2; s.rates = { wood: 3.2, fibre: 1.4 }; }
    return s;
  },
  road(a: number, b: number, kind: LinkKind = 'road') {
    const e = em(); if (!e) return;
    const A = e.settlement(a), B = e.settlement(b); if (!A || !B) return;
    const old = e.linkOf(a, b); if (old) { old.kind = kind; old.built = 1; return; }
    e.d.links.push({ id: e.d.next++, a, b, kind, built: 1, km: km(e.planet, A.region, B.region), dur: 60 });
    e.changed();
  },
  stock(id: number, items: Record<string, number>) { const e = em(); const s = e?.settlement(id); if (e && s) for (const [k, n] of Object.entries(items)) e.deliver(s, k, n); },
  route(from: number, to: number, item: string, n: number) { const e = em(); if (!e) return ''; e.d.routes.push({ id: e.d.next++, from, to, item, amount: n, on: true, moved: 0, note: '', t: 1 }); e.changed(); return ''; },
  fast(sec: number) { const e = em(); if (!e) return; for (let t = 0; t < sec; t += 0.5) e.update(0.5); },
  bloc(b: BlocId, rel: number) { const e = em(); if (e) { e.bloc(b).relation = rel; e.changed(); } },
  async go(i: number) { const e = em(); const s = e?.d.settlements[i]; if (e && s) await travelTo(e, s, (e.g as G | null)?.empireScreen ?? null); },
  open(tab?: string) { const g = (window as unknown as { __game?: G }).__game; const scr = g?.empireScreen; scr?.open(); if (tab) setTimeout(() => (scr as G)?.setTab?.(tab), 500); },
};
function installQA() { (window as unknown as { __empireQA: typeof qa }).__empireQA = qa; }
