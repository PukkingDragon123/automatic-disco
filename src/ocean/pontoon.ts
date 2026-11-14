// Building at sea. The PONTOON is a floating deck on sealed drums, moored to the bed: laid on open water it acts as a
// foundation (machines, belts and pens stand on it as on a poured slab, and the sea floor under it is left alone).
// The NET PEN is a ring of floats with a net hung under it: it takes fish from the schools that swim by (protein to
// the stores), and so draws the stock down (fishery.ts). Both are registered in the factory's catalogue
// (registerBuilding) and the factory's placement is extended from here: floating things need open water, things on
// pontoons need no level ground.
import type { Ocean } from './ocean';
import { registerBuilding, FDEFS, footW, footD, type FKind } from '../factory/defs';
import type { MG } from '../factory/models';
import { L } from '../factory/tex';
import { Factory } from '../factory/factory';

const FLOAT = new Set<string>(['pontoon', 'netpen']);
let registered = false;
let active: Ocean | null = null;

function register() {
  if (registered) return; registered = true;
  registerBuilding({
    kind: 'pontoon', name: 'Pontoon', cat: 'logistics', w: 2, d: 2, h: 0.35, cost: { ore: 6, carbon: 8 }, power: 0, hp: 350,
    desc: 'A floating deck on sealed drums, moored to the sea floor. Lay it on open water and build on it: machines, belts and pens stand on pontoons as on a foundation.',
    input: 'none', output: 'none', solid: false, skill: 'works',
    hooks: {
      model: (m: MG) => {
        // drums under the deck, the deck of planks, a bollard at two corners
        for (const x of [-0.55, 0.55]) m.cyl([x, -0.05, 0], 0.21, 1.9, L.RUST, { axis: 'z', n: 8 });
        for (let i = 0; i < 6; i++) m.box([-0.84 + i * 0.336, 0.11, 0], [0.31, 0.08, 1.96], L.WOOD);
        for (const z of [-0.85, 0.85]) m.box([0, 0.06, z], [2.0, 0.06, 0.1], L.GUN);
        for (const [x, z] of [[-0.85, -0.85], [0.85, 0.85]]) m.cyl([x, 0.15, z], 0.06, 0.22, L.STEEL, { n: 6 });
      },
      placed: (b: any, f: any) => { b.cells((X: number, Z: number) => { const k = Z * f.N + X; if (f.grid[k] === b.id) f.grid[k] = 0; f.fgrid[k] = b.id; }); },
      removed: (b: any, f: any) => { b.cells((X: number, Z: number) => { const k = Z * f.N + X; if (f.fgrid[k] === b.id) f.fgrid[k] = 0; }); },
      inspect: () => '<div>AFLOAT · BUILD ON IT LIKE A FOUNDATION</div>',
    },
  });
  registerBuilding({
    kind: 'netpen', name: 'Net Pen', cat: 'eco', w: 3, d: 3, h: 0.9, cost: { ore: 12, carbon: 14 }, power: 0, hp: 400,
    desc: 'A ring of floats with a net hung beneath. Fish swimming by are taken and sent to the stores as protein: set it over open water where schools pass. It thins the stock; fish it too hard and the schools are gone.',
    input: 'none', output: 'none', solid: false, skill: 'works', buf: 30,
    hooks: {
      model: (m: MG) => {
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; m.cyl([Math.cos(a) * 1.25, 0.02, Math.sin(a) * 1.25], 0.17, 0.95, L.HAZARD, { axis: 'z', n: 6, rot: 0 }); }
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; m.cyl([Math.cos(a) * 1.3, 0.35, Math.sin(a) * 1.3], 0.05, 0.75, L.WOOD, { n: 5 }); }
        // the net: a mesh skirt hanging below the ring
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; m.box([Math.cos(a) * 1.15, -0.45, Math.sin(a) * 1.15], [0.95, 0.9, 0.03], L.GRILLE, { ry: -a + Math.PI / 2 }); }
        m.box([0, 0.12, 1.36], [0.5, 0.06, 0.2], L.WOOD);
      },
      tick: (b: any, dt: number, f: any) => {
        const s = (b.__np ??= { t: 2, n: 0 }), o = active, fs = o?.fishery;
        if (!o || !fs) { b.status = 'starved'; return; }
        s.t -= dt;
        if (s.t > 0) return;
        s.t = 5;
        const fish = fs.catchable(b.x, o.level - 1.2, b.z, 7);
        if (!fish) { b.status = 'starved'; return; }
        fs.remove(fish); fs.caught++; s.n++;
        f.add('protein', 1, b.x, b.z);
        b.status = 'working';
        o.ripple(b.x + (Math.random() - 0.5) * 2, b.z + (Math.random() - 0.5) * 2, 0.4);
      },
      inspect: (b: any) => `<div>FISH TAKEN: ${(b.__np?.n ?? 0)} · ${b.status === 'working' ? 'SCHOOLS PASSING' : 'NO FISH IN REACH'}</div>`,
    },
  });
}

/** add the sea's buildings to the catalogue now (the factory may not exist yet); wire the placement when it does */
export function registerSeaWorks(o: Ocean) { register(); patchFactory(); active = o; }

/** extend the factory's placement rules (on the class, so a region's saved works are rebuilt afloat too): floating
 *  things on open water, the sea floor under them left alone; things on pontoons need no level ground */
let patched = false;
export function patchFactory() {
  if (patched) return; patched = true;
  const FP = Factory.prototype as unknown as { why: (...a: unknown[]) => string | null; place: (...a: unknown[]) => unknown };
  const why0 = FP.why, place0 = FP.place;
  const onPontoons = (f: any, cx: number, cz: number, w: number, d: number) => {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) { const fb = f.foundAt(cx + i, cz + j); if (!fb || fb.kind !== 'pontoon') return false; }
    return true;
  };
  FP.why = function (this: any, kind: FKind, cx: number, cz: number, r: number, free = false): string | null {
    const o = this.g?.ocean as Ocean | null, def = FDEFS[kind];
    if (!o || !def) return why0.call(this, kind, cx, cz, r, free);
    const R = o.region, N = R.N, w = footW(def, r), d = footD(def, r);
    if (FLOAT.has(kind)) {
      if (!free) { if (def.skill && !this.has(def.skill)) return 'Needs Field Works (skill tree)'; const lack = this.costLack(def.cost); if (lack) return lack; }
      if (cx < 2 || cz < 2 || cx + w > N - 2 || cz + d > N - 2) return 'Out of bounds';
      for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
        const X = cx + i, Z = cz + j, k = Z * N + X;
        if (this.grid[k] || this.fgrid[k]) return 'Something is already here';
        if (R.solid[k] === 1) return 'Rock in the way';
        if (!o.isSea(X + 0.5, Z + 0.5) || o.depthAt(X + 0.5, Z + 0.5) < 0.45) return 'Must float on open water';
      }
      return null;
    }
    const e = why0.call(this, kind, cx, cz, r, free);
    if (e && (e.startsWith('Ground too steep') || e.startsWith('No footing')) && onPontoons(this, cx, cz, w, d)) {
      if (def.extract === 'node' || def.extract === 'soil') return 'Cannot work the sea floor from a pontoon';
      return null;
    }
    return e;
  };
  FP.place = function (this: any, kind: FKind, cx: number, cz: number, r: number, free = false) {
    const o = this.g?.ocean as Ocean | null, def = FDEFS[kind];
    if (!o || !def) return place0.call(this, kind, cx, cz, r, free);
    const R = o.region, N = R.N, w = footW(def, r), d = footD(def, r);
    if (!FLOAT.has(kind) && !onPontoons(this, cx, cz, w, d)) return place0.call(this, kind, cx, cz, r, free);
    // afloat: the sea floor under it is left as it was
    const keep: [number, number, number][] = [];
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) { const X = cx + i, Z = cz + j; if (X >= 0 && Z >= 0 && X < N && Z < N) { const k = Z * N + X; keep.push([k, R.h[k], R.b[k]]); } }
    const b = place0.call(this, kind, cx, cz, r, free) as { y: number } | null;
    for (const [k, h, bl] of keep) { R.h[k] = h; R.b[k] = bl; }
    if (b && FLOAT.has(kind)) b.y = o.level + 0.02;
    return b;
  };
}
