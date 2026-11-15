// Construction. Placing a building lays a SITE, not a finished machine: the footprint is staked out, a scaffold goes
// up, the cost items are earmarked in the stores, and workers carry them over (from the pod, containers and storage)
// one load at a time; once everything is on site they build it over time, and the machine rises out of the
// scaffold. With no worker free the pod's crane does it, slowly. Belts, pipes, walls and floors are laid by the pod's
// arm directly (they are runs, not machines).
import * as THREE from 'three';
import type { Factory, FBuilding } from '../factory/factory';
import { FDEFS, footW, footD, type FKind, type FDef, type Cost } from '../factory/defs';
import { ITEMS, type ItemId } from '../factory/items';
import { modelFor, MG } from '../factory/models';
import { machineMaterial, L } from '../factory/tex';
import type { Worker } from '../factory/workers';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';
import { RAMPS } from '../art/palette';
import { workOf, shapeOf } from './catalog';
import { mod } from './unlocks';
import type { Logistics, Job, LNode } from './network';

export interface Site {
  id: number; kind: FKind; def: FDef; cx: number; cz: number; r: number; fw: number; fd: number; y: number;
  need: Cost; got: Partial<Record<ItemId, number>>; resv: Partial<Record<ItemId, number>>;
  work: number; workNeed: number; stage: 'supply' | 'build';
  /** last time a worker helped (the crane steps in after a while), builders on it now */
  help: number; builders: number; craneT: number;
  t0: number;
  mesh: THREE.Group; rise: THREE.Mesh;
}
let SEQ = 1;
const D2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export class Sites {
  list: Site[] = [];
  private mat = machineMaterial(1);
  private ghostMat = machineMaterial(0, { ghost: true });
  private crane: Site | null = null;
  constructor(readonly f: Factory, readonly L: Logistics) {}
  get g() { return this.f.g; }

  /** what the cost of a building is with the mastery discount */
  costOf(def: FDef): Cost {
    const k = mod(this.g, 'build.cost'), o: Cost = {};
    for (const [id, n] of Object.entries(def.cost)) o[id] = Math.max(1, Math.round((n ?? 0) * k));
    return o;
  }
  /** items promised to sites but not yet on them */
  reserved(id: ItemId) { let n = 0; for (const s of this.list) n += Math.max(0, (s.need[id] ?? 0) - (s.got[id] ?? 0)); return n; }
  avail(id: ItemId) { return Math.max(0, this.f.count(id) - this.reserved(id)); }
  costLack(c: Cost, k = 1): string | null {
    for (const [id, n] of Object.entries(c)) { const need = (n ?? 0) * k; if (need > 0 && this.avail(id) < need) return `Needs ${need} ${ITEMS[id]?.name ?? id} (${this.avail(id)} free)`; }
    return null;
  }
  /** why a site cannot go here (placement first, then the materials) */
  why(kind: FKind, cx: number, cz: number, r: number): string | null {
    const w = this.f.why(kind, cx, cz, r, true);
    if (w) return w;
    return this.costLack(this.costOf(FDEFS[kind]));
  }
  place(kind: FKind, cx: number, cz: number, r: number): Site | null {
    if (this.why(kind, cx, cz, r)) return null;
    const def = FDEFS[kind], fw = footW(def, r), fd = footD(def, r), f = this.f;
    const y = def.extract === 'water' ? f.g.region.water - 0.05 : f.levelFor(cx, cz, fw, fd);
    const s: Site = { id: SEQ++, kind, def, cx, cz, r, fw, fd, y, need: this.costOf(def), got: {}, resv: {}, work: 0, workNeed: workOf(def) / mod(this.g, 'build.speed'), stage: 'supply', help: f.time, builders: 0, craneT: 0, t0: f.time, mesh: new THREE.Group(), rise: new THREE.Mesh() };
    if (!Object.values(s.need).some((n) => (n ?? 0) > 0)) s.stage = 'build';
    // stake the footprint: nothing else may be laid over it
    const N = f.N;
    for (let j = 0; j < fd; j++) for (let i = 0; i < fw; i++) f.grid[(cz + j) * N + cx + i] = -s.id;
    this.dress(s);
    this.list.push(s);
    this.L.sync(true);
    f.g.emit('site', { kind, x: cx + fw / 2, z: cz + fd / 2, site: s });
    return s;
  }
  /** a saved site, back as it was (its materials were paid for when it was laid) */
  restore(kind: FKind, cx: number, cz: number, r: number, got: Site['got'], work: number): Site | null {
    if (!FDEFS[kind] || this.f.why(kind, cx, cz, r, true)) { for (const [id, n] of Object.entries(got)) if (n) this.f.put(id, n); return null; }
    const def = FDEFS[kind], fw = footW(def, r), fd = footD(def, r), f = this.f;
    const s: Site = { id: SEQ++, kind, def, cx, cz, r, fw, fd, y: def.extract === 'water' ? f.g.region.water - 0.05 : f.levelFor(cx, cz, fw, fd), need: this.costOf(def), got: { ...got }, resv: {}, work, workNeed: workOf(def) / mod(this.g, 'build.speed'), stage: 'supply', help: f.time, builders: 0, craneT: 0, t0: f.time, mesh: new THREE.Group(), rise: new THREE.Mesh() };
    if (Object.entries(s.need).every(([i, v]) => (s.got[i] ?? 0) >= (v ?? 0))) s.stage = 'build';
    for (let j = 0; j < fd; j++) for (let i = 0; i < fw; i++) f.grid[(cz + j) * f.N + cx + i] = -s.id;
    this.dress(s); this.list.push(s); this.L.sync(true);
    return s;
  }
  /** a free spot near a cell (templates) */
  placeNear(kind: FKind, cx: number, cz: number, r: number): Site | null {
    for (let k = 0; k < 9; k++) for (let dz = -k; dz <= k; dz++) for (let dx = -k; dx <= k; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== k) continue;
      if (!this.why(kind, cx + dx, cz + dz, r)) return this.place(kind, cx + dx, cz + dz, r);
    }
    return null;
  }
  /** the scaffold, the blueprint ghost and the machine body that rises as it is built */
  private dress(s: Site) {
    const def = s.def, w = s.fw, d = s.fd, h = Math.max(1, def.h) + 0.25;
    const m = new MG();
    const hw = w / 2 - 0.08, hd = d / 2 - 0.08;
    // corner standards, ledgers every 0.9 m, a brace on each face, boards on the top lift
    for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]] as const) { m.box([x, h / 2, z], [0.07, h, 0.07], L.STEEL); m.box([x, 0.03, z], [0.2, 0.06, 0.2], L.WOOD); }
    for (let y = 0.9; y < h; y += 0.9) { m.box([0, y, -hd], [w - 0.1, 0.05, 0.05], L.STEEL); m.box([0, y, hd], [w - 0.1, 0.05, 0.05], L.STEEL); m.box([-hw, y, 0], [0.05, 0.05, d - 0.1], L.STEEL); m.box([hw, y, 0], [0.05, 0.05, d - 0.1], L.STEEL); }
    const br = Math.atan2(Math.min(h, 1.8), w);
    m.box([0, Math.min(h, 1.8) / 2, -hd - 0.03], [Math.hypot(w, Math.min(h, 1.8)) * 0.92, 0.05, 0.04], L.STEEL, { rz: br });
    m.box([-hw - 0.03, Math.min(h, 1.8) / 2, 0], [0.04, 0.05, Math.hypot(d, Math.min(h, 1.8)) * 0.92], L.STEEL, { rx: -Math.atan2(Math.min(h, 1.8), d) });
    for (let i = 0; i < Math.max(2, Math.round(w * 2)); i++) m.box([-hw + 0.15 + i * ((w - 0.3) / Math.max(1, Math.round(w * 2) - 1)), h, -hd + 0.12], [0.22, 0.04, 0.3], L.WOOD);
    // stakes and a hazard tape line at the footprint edge
    m.box([0, 0.12, -d / 2 + 0.02], [w, 0.04, 0.02], L.HAZARD); m.box([0, 0.12, d / 2 - 0.02], [w, 0.04, 0.02], L.HAZARD);
    m.box([-w / 2 + 0.02, 0.12, 0], [0.02, 0.04, d], L.HAZARD); m.box([w / 2 - 0.02, 0.12, 0], [0.02, 0.04, d], L.HAZARD);
    const scaffold = new THREE.Mesh(m.geo(), this.mat);
    scaffold.castShadow = true;
    const sh = shapeOf(s.kind), model = modelFor(sh.key, def.model, sh.hook);
    const ghost = new THREE.Mesh(model.base, this.ghostMat); ghost.renderOrder = 4;
    const rise = new THREE.Mesh(model.base, this.mat); rise.scale.y = 0.02; rise.castShadow = true;
    s.rise = rise;
    s.mesh.add(scaffold, ghost, rise);
    s.mesh.position.set(s.cx + w / 2, s.y + 0.02, s.cz + d / 2);
    s.mesh.rotation.y = -s.r * Math.PI / 2;
    // the scaffold sits square to the world, not to the machine
    scaffold.rotation.y = s.r * Math.PI / 2;
    this.f.render.group.add(s.mesh);
  }
  /** the bill line an item pays: itself, or its material class (wood pays a 'carbon' cost) */
  needKey(s: Site, id: ItemId): ItemId {
    if (s.need[id] !== undefined) return id;
    const m = (ITEMS[id] as { mat?: string } | undefined)?.mat;
    return m && s.need[m] !== undefined ? m : id;
  }
  /** a load arrives: up to what is still needed */
  deliver(s: Site, item: ItemId, n: number): number {
    const id = this.needKey(s, item);
    const k = Math.max(0, Math.min(n, (s.need[id] ?? 0) - (s.got[id] ?? 0)));
    if (k <= 0) return 0;
    s.got[id] = (s.got[id] ?? 0) + k;
    s.help = this.f.time;
    if (Object.entries(s.need).every(([i, v]) => (s.got[i] ?? 0) >= (v ?? 0))) { s.stage = 'build'; sfx('click', 0.8, 0.5); }
    this.f.g.fx.burst(s.cx + s.fw / 2, s.y + 0.4, s.cz + s.fd / 2, 5, ITEMS[id]?.side ?? RAMPS.straw[4], { speed: 1, up: 1.2, size: 2.2, life: 0.4, grav: 6 });
    return k;
  }
  /** what still has to come (after loads already on the way) */
  outstanding(s: Site): [ItemId, number][] {
    return Object.entries(s.need).map(([id, n]) => [id, (n ?? 0) - (s.got[id] ?? 0) - (s.resv[id] ?? 0)] as [ItemId, number]).filter(([, n]) => n > 0);
  }
  /** a supply run or a build shift for a free worker */
  jobFor(w: Worker, cap: number): Job | null {
    const c = w.c, L = this.L;
    // oldest sites first, near ones preferred
    const order = [...this.list].sort((a, b) => (a.t0 - b.t0) * 0.05 + D2(c.x, c.z, a.cx, a.cz) - D2(c.x, c.z, b.cx, b.cz));
    for (const s of order) {
      const dst = L.node('site:' + s.id); if (!dst) continue;
      if (s.stage === 'build') {
        if (s.builders >= Math.max(1, Math.min(4, Math.round(s.fw * s.fd / 3)))) continue;
        s.builders++;
        return { chain: null, src: null, dst, item: '', n: 0, act: 'build', site: s, resv: 0 };
      }
      for (const [id, left] of this.outstanding(s)) {
        const src = this.sourceFor(id, s);
        if (!src) continue;
        // a material class ('carbon', 'soil'...) is paid with a real item of that class from the source
        const item = this.concrete(src, id);
        const n = Math.min(cap, left, L.stock(src, item));
        if (n < 1) continue;
        s.resv[id] = (s.resv[id] ?? 0) + n;
        return { chain: null, src, dst, item, n, act: 'carry', site: s, resv: n, need: id };
      }
    }
    return null;
  }
  /** the item a source hands over for a bill line: the id itself, or the most plentiful real item of its class */
  private concrete(src: LNode, id: ItemId): ItemId {
    const L = this.L;
    const cands = L.offers(src).filter((it) => it === id || (ITEMS[it] as { mat?: string } | undefined)?.mat === id);
    if (!cands.length) return id;
    return cands.sort((a, b) => L.stock(src, b) - L.stock(src, a))[0];
  }
  /** the nearest node holding an item: containers and storage first, the pod's stores last */
  private sourceFor(id: ItemId, s: Site): LNode | null {
    const L = this.L, x = s.cx + s.fw / 2, z = s.cz + s.fd / 2;
    let best: LNode | null = null, bd = 1e9;
    for (const n of L.nodes) {
      if (n.kind !== 'pod' && n.kind !== 'container') continue;
      if (L.stock(n, id) < 1) continue;
      const [nx, nz] = L.pos(n), d = D2(nx, nz, x, z) + (n.kind === 'pod' ? 6 : 0);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  /** a job on a site ended without delivering (abort) */
  release(j: Job) {
    const s = j.site; if (!s) return;
    const k = j.need ?? j.item;
    if (j.act === 'build') s.builders = Math.max(0, s.builders - 1);
    else if (k) s.resv[k] = Math.max(0, (s.resv[k] ?? 0) - j.n);
  }
  /** the worker's load is on the site (or part of it): the earmark ends */
  landed(j: Job, n: number) { const s = j.site, k = j.need ?? j.item; if (!s || !k) return; s.resv[k] = Math.max(0, (s.resv[k] ?? 0) - j.resv); void n; }
  /** a worker builds for dt seconds (true: finished) */
  work(s: Site, dt: number, k = 1): boolean {
    if (s.stage !== 'build' || !this.list.includes(s)) return true;
    s.work += dt * k;
    s.help = this.f.time;
    if (s.work >= s.workNeed) { this.finish(s); return true; }
    return false;
  }
  private finish(s: Site) {
    const f = this.f;
    this.drop(s);
    const b = f.place(s.kind, s.cx, s.cz, s.r, true);
    if (!b) { for (const [id, n] of Object.entries(s.got)) if (n) f.put(id, n); toast(`The site for <b>${s.def.name}</b> could not be finished: materials returned`, 'warn', 2400); this.L.sync(true); return; }
    b.rise = 0.6;
    f.g.fx.burst(b.x, b.y + 0.5, b.z, 16, RAMPS.straw[4], { speed: 1.8, up: 2.2, size: 3, life: 0.6, grav: 6 });
    sfx('build', 1, 0.7);
    toast(`<b>${s.def.name}</b> is complete`, 'good', 1800);
    this.L.siteDone(s, b);
    this.onDone?.(s, b);
  }
  onDone?: (s: Site, b: FBuilding) => void;
  /** take a site down: what was delivered goes back to the stores */
  cancel(s: Site) {
    if (!this.list.includes(s)) return;
    this.drop(s);
    for (const [id, n] of Object.entries(s.got)) if (n) this.f.put(id, n);
    for (const [w, j] of [...this.L.live]) if (j.site === s) this.L.abort(w);
    this.L.sync(true);
    sfx('crack', 1.3, 0.5);
  }
  private drop(s: Site) {
    const f = this.f, N = f.N;
    for (let j = 0; j < s.fd; j++) for (let i = 0; i < s.fw; i++) { const k = (s.cz + j) * N + s.cx + i; if (f.grid[k] === -s.id) f.grid[k] = 0; }
    s.mesh.removeFromParent();
    this.list = this.list.filter((x) => x !== s);
    if (this.crane === s) this.crane = null;
  }
  siteAt(x: number, z: number): Site | null {
    const k = this.f.grid[z * this.f.N + x];
    return k < 0 ? this.list.find((s) => s.id === -k) ?? null : null;
  }
  /** fraction done: materials are the first half, the work the second */
  progress(s: Site): number {
    const need = Object.values(s.need).reduce((a: number, b) => a + (b ?? 0), 0), got = Object.values(s.got).reduce((a: number, b) => a + (b ?? 0), 0);
    return (need ? 0.5 * got / need : 0.5) + 0.5 * Math.min(1, s.work / s.workNeed);
  }

  // ------------------------------------------------------------------ tick: the crane, the rising body
  update(dt: number) {
    const f = this.f, core = f.hive.core;
    for (const s of this.list) {
      const p = this.progress(s);
      s.rise.scale.y += (Math.max(0.02, s.stage === 'build' ? s.work / s.workNeed : 0.02) - s.rise.scale.y) * Math.min(1, dt * 4);
      void p;
    }
    if (dt <= 0 || !core) return;
    // the crane takes the oldest site nobody has touched for a while
    if (!this.crane || !this.list.includes(this.crane) || f.time - this.crane.help < 2) this.crane = this.list.filter((s) => f.time - s.help > 8).sort((a, b) => a.t0 - b.t0)[0] ?? null;
    const s = this.crane; if (!s) return;
    s.craneT -= dt;
    if (s.craneT > 0) return;
    const speed = mod(this.g, 'build.speed');
    const x = s.cx + s.fw / 2, z = s.cz + s.fd / 2;
    if (s.stage === 'supply') {
      s.craneT = 0.9 / speed;
      const lack = this.outstanding(s).find(([id]) => f.count(id) >= 1);
      if (!lack) return;
      if (!f.take(lack[0], 1)) return;
      s.got[lack[0]] = (s.got[lack[0]] ?? 0) + 1;
      f.g.fx.mote(core.x, core.y + 1.6, core.z, x, s.y + 0.6, z, ITEMS[lack[0]]?.side ?? RAMPS.straw[4], 5);
      if (Object.entries(s.need).every(([i, v]) => (s.got[i] ?? 0) >= (v ?? 0))) s.stage = 'build';
    } else {
      s.craneT = 0.25;
      if (Math.random() < 0.4) f.g.fx.burst(x, s.y + s.def.h * 0.6, z, 2, RAMPS.straw[5], { glow: true, speed: 1.5, up: 1, size: 2, life: 0.3 });
      // the crane builds at a third of a worker's pace; this.work keeps help fresh, so put it back
      const h = s.help; this.work(s, 0.25 * 0.35, 1); s.help = h;
    }
  }
}
