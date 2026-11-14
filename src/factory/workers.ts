// Workers: creatures the golem has broken to the harness (converted, penned or bred) put to labour. Each wears a
// load harness and is given a job: HAUL (carry items between machines and stores where no belt runs), OPERATE
// (stand at a machine: it runs faster), MINE (dig a seam by hand and carry the load home), FORAGE (bring in fruit
// and husk carbon) or PEN (keep to a breeding pen). Big species carry more. They get hungry and must eat (fruit,
// protein or carbon from a worker pen or the stores); hungry workers slow down and sulk, and a miserable one slips
// its harness and runs wild. Robot worker units (src/robots) haul too, without the appetite.
import * as THREE from 'three';
import type { Factory, FBuilding } from './factory';
import type { Creature } from '../game/creature';
import { ITEMS, type ItemId } from './items';
import { isBelt } from './defs';
import { MG } from './models';
import { L } from './tex';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';
import { SKILL } from '../game/skills';
import { clamp } from '../core/rand';

export type Job = 'idle' | 'haul' | 'operate' | 'mine' | 'forage' | 'pen';
export const JOB_NAME: Record<Job, string> = { idle: 'UNASSIGNED', haul: 'HAULING', operate: 'OPERATING', mine: 'MINING', forage: 'FORAGING', pen: 'PENNED' };
export const JOB_SKILL: Partial<Record<Job, string>> = { haul: 'haul', operate: 'operate', pen: 'haul' };
type State = 'find' | 'toSrc' | 'toDst' | 'work' | 'eat' | 'rest' | 'wait';
export interface Worker {
  c: Creature; job: Job; state: State;
  target: FBuilding | null; seam: number;
  /** a fixed haul route (player-set); else hauling finds its own jobs */
  route: { from: FBuilding; to: FBuilding } | null;
  src: FBuilding | null; dst: FBuilding | null; want: ItemId | null; fromStores: boolean;
  carry: { id: ItemId; n: number } | null;
  hunger: number; mood: number; t: number; think: number; miser: number;
  plant: number; note: string;
}
interface FloraFruit { fruitNear?(x: number, z: number, r: number): { id: number; x: number; z: number } | number | null; eatFruit?(id: number): unknown }
/** who grows the fruit: the ecosystem (world.eco) or the flora itself, whichever has it */
function fruitSrc(f: Factory): FloraFruit {
  const eco = (f.g.world as unknown as { eco?: FloraFruit }).eco;
  if (eco?.fruitNear) return eco;
  return f.g.world.flora as unknown as FloraFruit;
}

export class Workers {
  list: Worker[] = [];
  private reserved = new Map<string, number>();
  private harness: THREE.InstancedMesh;
  constructor(readonly f: Factory) {
    const g = f.g;
    // the harness: a yoke with two packs and a frame, drawn in the machines' own material
    const m = new MG();
    m.box([0, 0, 0], [0.9, 0.08, 0.18], L.WOOD);
    for (const s of [-1, 1]) { m.box([s * 0.4, -0.18, 0], [0.08, 0.36, 0.1], L.INK); m.box([s * 0.48, -0.1, -0.05], [0.18, 0.24, 0.3], L.OLIVE); }
    m.box([0, 0.06, -0.22], [0.12, 0.12, 0.4], L.GUN);
    m.box([0, 0.14, 0.16], [0.22, 0.06, 0.06], L.BRASS);
    this.harness = new THREE.InstancedMesh(m.geo(), f.render.mat, 64);
    const st = new THREE.InstancedBufferAttribute(new Float32Array(64 * 4), 4), bl = new THREE.InstancedBufferAttribute(new Float32Array(64), 1);
    this.harness.geometry.setAttribute('aState', st); this.harness.geometry.setAttribute('aBelt', bl);
    this.harness.count = 0; this.harness.frustumCulled = false; this.harness.castShadow = true;
    f.render.group.add(this.harness);
    // every creature brought over becomes a worker on the roster (unassigned ones still roam and claim ground)
    g.on('convert', () => this.sync());
    g.on('print', () => this.sync());
    // hungry workers drag their feet
    const w = g.world, mm = w.moveMul.bind(w);
    w.moveMul = (c: Creature) => { const k = mm(c); const wk = (c as unknown as { __wk?: Worker }).__wk; return wk && wk.job !== 'idle' ? k * (0.55 + 0.45 * clamp(wk.hunger / 0.3, 0, 1)) * (0.85 + 0.15 * wk.mood) * (wk.carry ? 0.9 : 1) : k; };
    this.sync();
  }
  /** the roster follows the hive's allies */
  sync() {
    const h = this.f.hive;
    for (const c of h.allies) if (!c.dead && !this.of(c)) this.enlist(c);
  }
  of(c: Creature): Worker | null { return (c as unknown as { __wk?: Worker }).__wk ?? null; }
  enlist(c: Creature): Worker {
    const had = this.of(c); if (had) return had;
    const w: Worker = { c, job: 'idle', state: 'find', target: null, seam: -1, route: null, src: null, dst: null, want: null, fromStores: false, carry: null, hunger: 1, mood: 0.8, t: 0, think: Math.random(), miser: 0, plant: -1, note: '' };
    (c as unknown as { __wk?: Worker }).__wk = w;
    this.list.push(w);
    return w;
  }
  /** how much it can carry: big species carry more */
  cap(c: Creature) { return clamp(Math.round(c.mass / 12), 2, 24); }
  whyJob(job: Job): string | null { const s = JOB_SKILL[job]; return s && !this.f.g.run.skills.has(s) ? `Needs ${SKILL[s]?.name ?? s}` : null; }
  assign(c: Creature, job: Job, target: FBuilding | null = null, seam = -1): string | null {
    const why = this.whyJob(job); if (why) return why;
    const w = this.enlist(c);
    this.release(c, true);
    // the biotech runtime's own field jobs give way to the harness (game.biotech)
    if (job !== 'idle') { const bt = (this.f.g as unknown as { biotech?: { assign?(c: Creature, job: string): unknown } }).biotech; try { bt?.assign?.(c, 'idle'); } catch { /* not ours */ } }
    w.job = job; w.target = target; w.seam = seam; w.state = 'find'; w.route = null; w.note = '';
    (c as unknown as { __job?: number }).__job = job === 'idle' ? 0 : 1;
    if (job === 'operate' && target) { if (target.operator && target.operator !== c) this.release(target.operator); target.operator = c; }
    c.order = null; c.path = null; c.mind = 'idle';
    sfx('call', c.size, 0.5);
    return null;
  }
  route(c: Creature, from: FBuilding, to: FBuilding) { const e = this.assign(c, 'haul'); if (e) return e; this.of(c)!.route = { from, to }; return null; }
  /** back to roaming (or just clear the job's hold on a machine) */
  release(c: Creature, keep = false) {
    const w = this.of(c); if (!w) return;
    for (const b of this.f.buildings) if (b.operator === c) b.operator = null;
    if (w.carry && !keep) { this.f.put(w.carry.id, w.carry.n); w.carry = null; }
    this.unreserve(w);
    if (!keep) { w.job = 'idle'; w.target = null; w.route = null; (c as unknown as { __job?: number }).__job = 0; c.order = null; }
  }
  operating(b: FBuilding) { const c = b.operator; const w = c ? this.of(c) : null; return !!w && w.job === 'operate' && w.target === b && w.state === 'work'; }
  moodOf(c: Creature) { return this.of(c)?.mood ?? 0.5; }
  get active() { return this.list.filter((w) => w.job !== 'idle' && !w.c.dead); }

  // ------------------------------------------------------------------ movement
  private go(w: Worker, x: number, z: number, reach = 0.9): boolean {
    const c = w.c, d = Math.hypot(c.x - x, c.z - z);
    if (d < reach + c.radius) { if (c.order?.kind !== 'hold') { c.order = { kind: 'hold', x: c.x, z: c.z }; c.path = null; } return true; }
    const o = c.order;
    if (!o || o.kind !== 'move' || Math.hypot(o.x - x, o.z - z) > 0.4) { c.order = { kind: 'move', x, z }; c.path = null; c.mind = 'order'; }
    return false;
  }
  /** a standing point beside a building (the nearest point outside its footprint) */
  private beside(b: FBuilding, c: Creature): [number, number] {
    const x0 = b.cx - 0.6 - c.radius * 0.5, x1 = b.cx + b.fw + 0.6 + c.radius * 0.5, z0 = b.cz - 0.6 - c.radius * 0.5, z1 = b.cz + b.fd + 0.6 + c.radius * 0.5;
    let x = clamp(c.x, x0, x1), z = clamp(c.z, z0, z1);
    if (x > x0 && x < x1 && z > z0 && z < z1) { const dl = [x - x0, x1 - x, z - z0, z1 - z], m = Math.min(...dl); if (m === dl[0]) x = x0; else if (m === dl[1]) x = x1; else if (m === dl[2]) z = z0; else z = z1; }
    return [x, z];
  }
  private goTo(w: Worker, b: FBuilding) { const [x, z] = this.beside(b, w.c); return this.go(w, x, z, 0.5); }
  private face(c: Creature, x: number, z: number) { c.yaw = Math.atan2(x - c.x, z - c.z); }
  private workAnim(w: Worker, dt: number) { w.t += dt; if (w.t > 1.3) { w.t = 0; if (w.c.atkAnim < 0) w.c.atkAnim = 0; } }

  // ------------------------------------------------------------------ tick
  update(dt: number) {
    const f = this.f;
    if (dt > 0) for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i], c = w.c;
      if (c.dead || c.faction !== 'veyr') {
        if (!c.dead && c.faction !== 'veyr') (c as unknown as { __job?: number }).__job = 0;
        this.release(c); (c as unknown as { __wk?: Worker }).__wk = undefined; this.list.splice(i, 1); continue;
      }
      if (w.job === 'idle') { w.hunger = Math.min(1, w.hunger + dt / 200); w.mood = Math.min(1, w.mood + dt / 300); continue; }
      this.needs(w, dt);
      if (w.state === 'eat') { this.eat(w, dt); continue; }
      w.think -= dt;
      switch (w.job) {
        case 'haul': this.haul(w, dt); break;
        case 'operate': this.operate(w, dt); break;
        case 'mine': this.mine(w, dt); break;
        case 'forage': this.forage(w, dt); break;
        case 'pen': if (w.target && !w.target.dead) { if (this.go(w, w.target.x + ((c.id % 3) - 1) * 0.6, w.target.z + ((c.id % 2) - 0.5) * 0.8, 0.4)) w.state = 'work'; } else this.release(c); break;
      }
    }
    this.draw();
    if (dt > 0) this.botTick(dt);
  }
  /** hunger and mood; the animal's own appetite is kept out of it (we feed it) */
  private needs(w: Worker, dt: number) {
    const c = w.c, big = clamp(c.mass / 120, 0.5, 2);
    w.hunger = Math.max(0, w.hunger - (dt / 280) * (0.7 + 0.3 * big) * (w.state === 'work' || w.carry ? 1.25 : 1));
    c.energy = Math.max(c.energy, 0.55);
    if (w.hunger < 0.15) w.mood = Math.max(0, w.mood - dt / 90);
    else if (w.hunger > 0.5) w.mood = Math.min(1, w.mood + dt / 260);
    if (w.hunger < 0.3 && w.state !== 'eat' && !w.carry) { w.state = 'eat'; w.src = null; this.unreserve(w); }
    // a miserable worker slips its harness
    if (w.mood < 0.06) {
      w.miser += dt;
      if (w.miser > 15) this.escape(w);
    } else w.miser = 0;
  }
  private escape(w: Worker) {
    const c = w.c, h = this.f.hive;
    this.release(c);
    h.allies.delete(c);
    c.faction = 'wild'; c.fx.moss.value = 0; c.fx.flash.value = 0; c.order = null; c.mind = 'flee'; c.fleeT = 6; c.target = 0;
    (c as unknown as { __mk?: number }).__mk = 0;
    toast(`A starving <b>${c.sp.name}</b> slips its harness and runs wild`, 'warn', 3600);
    sfx('call', c.size, 0.8);
  }
  /** where a hungry worker can eat: a worker pen with food, the stores (fruit, protein, carbon), a fruiting plant */
  private eat(w: Worker, dt: number) {
    const f = this.f, c = w.c;
    if (!w.src || w.src.dead) {
      const pens = f.buildings.filter((b) => b.kind === 'barracks' && [...b.store.values()].some((n) => n >= 1)).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
      w.src = pens[0] ?? null;
      if (!w.src) {
        // the stores (eaten at the nearest uplink, or the core)
        const food = (['fruit', 'protein', 'carbon'] as ItemId[]).find((id) => f.count(id) >= 1);
        const dep = this.nearest(c.x, c.z, (b) => b.kind === 'depot');
        if (food && dep) { w.src = dep; w.fromStores = true; }
        else if (food && f.hive.core) {
          const core = f.hive.core;
          if (this.go(w, core.x + 1.6, core.z + 1.6, 0.6)) this.chew(w, food, dt);
          return;
        } else {
          // forage: fruit from the plants, if the flora grows any; else grazing on its own
          const fl = fruitSrc(f);
          const fr = fl.fruitNear?.(c.x, c.z, 16);
          if (fr !== null && fr !== undefined && fr !== -1) {
            const flo = f.g.world.flora, id = typeof fr === 'number' ? fr : fr.id, fx = typeof fr === 'number' ? flo.x[fr] : fr.x, fz = typeof fr === 'number' ? flo.z[fr] : fr.z;
            if (this.go(w, fx, fz, 0.5)) { fl.eatFruit?.(id); w.hunger = Math.min(1, w.hunger + 0.4); this.done(w); }
            return;
          }
          w.note = 'NO FOOD'; c.energy = Math.min(c.energy, 0.3); // let the animal graze on its own
          if (Math.random() < dt * 0.05) w.hunger = Math.min(1, w.hunger + 0.1);
          if (w.hunger > 0.5) this.done(w);
          return;
        }
      }
    }
    if (!this.goTo(w, w.src)) return;
    this.face(c, w.src.x, w.src.z);
    const id = w.fromStores ? (['fruit', 'protein', 'carbon'] as ItemId[]).find((k) => f.count(k) >= 1) : ([...w.src.store.entries()].find(([, n]) => n >= 1)?.[0] as ItemId | undefined);
    if (!id) { w.src = null; return; }
    this.chew(w, id, dt);
    if (w.src?.kind === 'barracks') w.mood = Math.min(1, w.mood + dt / 40);
  }
  private chew(w: Worker, id: ItemId, dt: number) {
    w.t += dt;
    this.workAnim(w, dt);
    if (w.t < 0.9 && w.hunger < 0.95) return;
    w.t = 0;
    const src = w.src;
    let ok = false;
    if (src && src.kind === 'barracks') { const n = src.store.get(id) ?? 0; if (n >= 1) { src.store.set(id, n - 1); ok = true; } }
    else ok = this.f.take(id, 1);
    if (ok) { w.hunger = Math.min(1, w.hunger + (ITEMS[id]?.food ?? 0.5) * 0.3); this.f.g.fx.burst(w.c.x, w.c.y + w.c.size * 0.4, w.c.z, 3, ITEMS[id].side, { speed: 0.6, up: 1, size: 2, life: 0.4, grav: 5 }); }
    if (w.hunger > 0.9 || !ok) this.done(w);
  }
  private done(w: Worker) { w.state = 'find'; w.src = null; w.fromStores = false; w.note = ''; }

  // ------------------------------------------------------------------ hauling
  private unreserve(w: Worker) { if (w.dst && w.want) { const k = w.dst.id + ':' + w.want; this.reserved.set(k, Math.max(0, (this.reserved.get(k) ?? 0) - 1)); } }
  private nearest(x: number, z: number, ok: (b: FBuilding) => boolean): FBuilding | null {
    let best: FBuilding | null = null, bd = 1e9;
    for (const b of this.f.buildings) if (ok(b)) { const d = Math.hypot(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  /** what a building has to give away: output buffers, extractors' loads, storage */
  private stock(b: FBuilding): Map<ItemId, number> { return b.def.store && b.kind !== 'barracks' ? b.store : b.outBuf; }
  /** pick a delivery: a building that wants an item another building (or the stores) holds */
  private plan(w: Worker): boolean {
    const p = this.pick(w.c.x, w.c.z, this.cap(w.c), w.route);
    if (!p) return false;
    w.src = p.src; w.dst = p.dst; w.want = p.id; w.fromStores = !!p.src && p.src.kind === 'depot';
    w.state = 'toSrc';
    return true;
  }
  /** the best delivery from a point for a carrier of this capacity (reserves it) */
  private pick(cx: number, cz: number, cap: number, route: Worker['route']): { src: FBuilding; dst: FBuilding; id: ItemId } | null {
    const f = this.f, c = { x: cx, z: cz };
    const w = { route };
    const cand: { src: FBuilding | null; dst: FBuilding; id: ItemId; score: number }[] = [];
    const dsts = w.route ? [w.route.to] : f.buildings.filter((b) => b.on && !isBelt(b.kind) && b.kind !== 'depot' && !(b.def.store && b.kind !== 'barracks'));
    const srcs = w.route ? [w.route.from] : f.buildings.filter((b) => this.stock(b).size > 0);
    for (const dst of dsts) {
      const pri = dst.priority === 2 ? 0.4 : dst.priority === 0 ? 2.5 : 1;
      for (const src of srcs) {
        if (src === dst) continue;
        for (const [id, n] of this.stock(src)) {
          if (n < 1 || id === 'steam') continue;
          const want = f.wants(dst, id) - (this.reserved.get(dst.id + ':' + id) ?? 0) * cap;
          if (want < 1) continue;
          cand.push({ src, dst, id, score: (Math.hypot(src.x - c.x, src.z - c.z) + Math.hypot(dst.x - src.x, dst.z - src.z)) * pri });
        }
      }
      // from the central stores, picked up at an uplink
      if (!w.route) {
        const dep = this.nearest(dst.x, dst.z, (b) => b.kind === 'depot');
        if (dep) for (const id of this.needs2(dst)) {
          if (f.count(id) < 1) continue;
          const want = f.wants(dst, id) - (this.reserved.get(dst.id + ':' + id) ?? 0) * cap;
          if (want < 1) continue;
          cand.push({ src: dep, dst, id, score: (Math.hypot(dep.x - c.x, dep.z - c.z) + Math.hypot(dst.x - dep.x, dst.z - dep.z)) * pri * 1.3 + 4 });
        }
      }
    }
    // and machines that are blocked with output and no belt: clear them into storage or the uplink
    if (!w.route) for (const src of f.buildings) {
      if (!(src.def.station || src.def.extract) || src.status !== 'blocked') continue;
      const store = this.nearest(src.x, src.z, (b) => b.kind === 'depot' || (b.def.store !== undefined && b.kind !== 'barracks' && b !== src));
      if (!store) continue;
      for (const [id, n] of src.outBuf) if (n >= 1 && id !== 'steam') cand.push({ src, dst: store, id, score: Math.hypot(src.x - c.x, src.z - c.z) + Math.hypot(store.x - src.x, store.z - src.z) + 6 });
    }
    if (!cand.length) return null;
    cand.sort((a, b) => a.score - b.score);
    const p = cand[0];
    const k = p.dst.id + ':' + p.id; this.reserved.set(k, (this.reserved.get(k) ?? 0) + 1);
    return { src: p.src!, dst: p.dst, id: p.id };
  }

  // ------------------------------------------------------------------ robot haulers (the Corps' worker bots)
  private bots = new Map<object, { src: FBuilding | null; dst: FBuilding | null; id: ItemId | null; carry: number; think: number; to: string }>();
  /** U.S.P.C. worker robots (src/robots) left without other orders haul like harnessed creatures, without the appetite */
  private botTick(dt: number) {
    const f = this.f, robots = (f.g as unknown as { robots?: { kind: string; faction: string; dead: boolean; x: number; z: number; y: number; ord: { k: string } | null; order(o: { k: string; x?: number; z?: number }): void }[] }).robots;
    if (!robots) return;
    for (const r of robots) {
      if (r.dead || r.faction !== 'veyr' || r.kind !== 'worker') { this.bots.delete(r); continue; }
      let b = this.bots.get(r);
      if (!b) { if (r.ord && r.ord.k !== 'move' && r.ord.k !== 'work') continue; b = { src: null, dst: null, id: null, carry: 0, think: 0, to: '' }; this.bots.set(r, b); }
      if (r.ord && r.ord.k !== 'move' && r.ord.k !== 'work') { this.bots.delete(r); continue; } // the player took it
      const go = (t: FBuilding) => { const key = t.id + ''; const d = Math.hypot(r.x - t.x, r.z - t.z); if (d < Math.max(t.fw, t.fd) / 2 + 1.3) return true; if (b!.to !== key) { b!.to = key; r.order({ k: 'move', x: t.x + (r.x > t.x ? 1 : -1) * (t.fw / 2 + 0.8), z: t.z }); } return false; };
      b.think -= dt;
      if (!b.dst || b.dst.dead) {
        if (b.carry > 0 && b.id) { f.put(b.id, b.carry); b.carry = 0; }
        if (b.think > 0) continue; b.think = 1.5;
        const p = this.pick(r.x, r.z, 10, null); if (!p) continue;
        b.src = p.src; b.dst = p.dst; b.id = p.id; b.to = '';
      }
      if (!b.carry) {
        const src = b.src!;
        if (src.dead) { b.dst = null; continue; }
        if (!go(src)) continue;
        const id = b.id!;
        let n = 0;
        if (src.kind === 'depot') { n = Math.min(10, f.count(id), Math.max(1, f.wants(b.dst!, id))); if (!f.take(id, n)) n = 0; }
        else { const st = this.stock(src), have = Math.floor(st.get(id) ?? 0); n = Math.min(10, have); if (n > 0) st.set(id, have - n); }
        const k = b.dst!.id + ':' + id; this.reserved.set(k, Math.max(0, (this.reserved.get(k) ?? 0) - 1));
        if (n <= 0) { b.dst = null; continue; }
        b.carry = n; b.to = '';
        continue;
      }
      if (!go(b.dst)) { f.render.extra.push({ x: r.x, y: r.y + 1.1, z: r.z, id: b.id!, yaw: 0 }); continue; }
      const got = f.give(b.dst, b.id!, b.carry);
      if (got < b.carry) f.put(b.id!, b.carry - got);
      b.carry = 0; b.dst = null; b.to = '';
    }
  }
  /** items a building could use */
  private needs2(b: FBuilding): ItemId[] {
    if (b.recipe) return Object.keys(b.recipe.in) as ItemId[];
    if (b.kind === 'turret') return ['ammo'];
    if (b.kind === 'barracks' || b.kind === 'trough' || b.kind === 'pen' || b.kind === 'breeder') return ['fruit', 'protein', 'carbon'];
    if (b.kind === 'sprinkler') return ['water'];
    if (b.kind === 'spreader') return ['dung', 'carbon'];
    if (b.kind === 'sprayer') return ['herbicide'];
    if (b.def.station === 'boiler') return ['coal', 'carbon', 'water', 'algae_fuel', 'bio_oil'];
    if (b.def.station === 'lab') return ['report', 'tape'];
    return [];
  }
  private haul(w: Worker, dt: number) {
    const f = this.f, c = w.c;
    if (w.state === 'find' || w.state === 'wait' || w.state === 'work') {
      if (w.carry) { w.state = 'toDst'; return; }
      if (w.think > 0) return;
      w.think = 1 + Math.random() * 0.5;
      if (!this.plan(w)) {
        w.state = 'wait'; w.note = 'NOTHING TO CARRY';
        // wait by the nearest pen or uplink
        const home = this.nearest(c.x, c.z, (b) => b.kind === 'barracks' || b.kind === 'depot');
        if (home) this.goTo(w, home);
      } else w.note = '';
      return;
    }
    if (w.state === 'toSrc') {
      const src = w.src;
      if (!src || src.dead || !w.dst || w.dst.dead) { this.unreserve(w); this.done(w); return; }
      if (!this.goTo(w, src)) return;
      this.face(c, src.x, src.z); this.workAnim(w, dt);
      const id = w.want!, cap = this.cap(c);
      let n = 0;
      if (src.kind === 'depot') { n = Math.min(cap, f.count(id), Math.max(1, f.wants(w.dst, id))); if (!f.take(id, n)) n = 0; }
      else { const st = this.stock(src), have = Math.floor(st.get(id) ?? 0); n = Math.min(cap, have, Math.max(1, f.wants(w.dst, id) || cap)); if (n > 0) st.set(id, have - n); }
      if (n <= 0) { this.unreserve(w); this.done(w); return; }
      w.carry = { id, n }; w.state = 'toDst';
      sfx('click', 0.6, f.g.audible(c.x, c.z) * 0.3);
      return;
    }
    if (w.state === 'toDst') {
      let dst = w.dst;
      if (!dst || dst.dead) dst = w.dst = this.nearest(c.x, c.z, (b) => b.kind === 'depot' || (b.def.store !== undefined && b.kind !== 'barracks'));
      if (!dst) { if (w.carry) { f.put(w.carry.id, w.carry.n); w.carry = null; } this.unreserve(w); this.done(w); return; }
      if (!this.goTo(w, dst)) return;
      this.face(c, dst.x, dst.z);
      if (w.carry) {
        const got = f.give(dst, w.carry.id, w.carry.n);
        w.carry.n -= got;
        if (w.carry.n > 0) {
          // what will not fit goes to the nearest store
          const st = this.nearest(c.x, c.z, (b) => b !== dst && (b.kind === 'depot' || (b.def.store !== undefined && b.kind !== 'barracks')));
          if (st && w.dst !== st) { this.unreserve(w); w.dst = st; w.want = null; return; }
          f.put(w.carry.id, w.carry.n);
        }
        w.carry = null;
      }
      this.unreserve(w); this.done(w);
      w.mood = Math.min(1, w.mood + 0.01);
    }
  }
  // ------------------------------------------------------------------ operating
  private operate(w: Worker, dt: number) {
    const b = w.target;
    if (!b || b.dead) { this.release(w.c); return; }
    if (b.operator !== w.c) b.operator = w.c;
    if (!this.goTo(w, b)) { w.state = 'find'; return; }
    w.state = 'work';
    this.face(w.c, b.x, b.z);
    if (b.status === 'working') this.workAnim(w, dt);
  }
  // ------------------------------------------------------------------ mining by hand
  private mine(w: Worker, dt: number) {
    const f = this.f, c = w.c, s = f.seams[w.seam];
    if (!s || s.amount <= 0) { w.note = 'SEAM WORKED OUT'; this.release(c); return; }
    if (w.carry && w.carry.n >= this.cap(c)) {
      const dst = this.nearest(c.x, c.z, (b) => b.kind === 'depot' || (b.def.store !== undefined && b.kind !== 'barracks'));
      if (dst) { if (!this.goTo(w, dst)) return; const got = f.give(dst, w.carry.id, w.carry.n); if (got < w.carry.n) f.put(w.carry.id, w.carry.n - got); }
      else { const core = f.hive.core; if (core && !this.go(w, core.x + 1.5, core.z - 1.5, 0.6)) return; f.put(w.carry.id, w.carry.n); }
      w.carry = null; w.state = 'find';
      return;
    }
    const a = (c.id * 1.7) % (Math.PI * 2), px = s.x + Math.cos(a) * (s.r + 0.3), pz = s.z + Math.sin(a) * (s.r + 0.3);
    if (!this.go(w, px, pz, 0.5)) return;
    w.state = 'work';
    this.face(c, s.x, s.z); this.workAnim(w, dt);
    const rate = 0.18 * clamp(c.mass / 60, 0.6, 2.2) * (0.6 + 0.4 * w.mood);
    w.carry ??= { id: s.item, n: 0 };
    const before = Math.floor(w.carry.n);
    w.carry.n += rate * dt; s.amount -= rate * dt;
    if (Math.floor(w.carry.n) > before) { f.g.fx.burst(s.x + (c.x - s.x) * 0.3, f.g.world.surfaceY(s.x, s.z) + 0.3, s.z + (c.z - s.z) * 0.3, 4, ITEMS[s.item].side, { speed: 1.4, up: 1.6, size: 2.2, life: 0.5, grav: 8 }); sfx('crack', 1.6, f.g.audible(c.x, c.z) * 0.2); }
    if (w.carry.n >= this.cap(c)) w.carry.n = this.cap(c);
  }
  // ------------------------------------------------------------------ foraging
  private forage(w: Worker, dt: number) {
    const f = this.f, c = w.c, fl = f.g.world.flora, ff = fruitSrc(f);
    const home = w.target ?? this.nearest(c.x, c.z, (b) => b.kind === 'barracks' || b.kind === 'depot');
    if (w.carry && w.carry.n >= this.cap(c)) {
      if (home) { if (!this.goTo(w, home)) return; const got = f.give(home, w.carry.id, w.carry.n); if (got < w.carry.n) f.put(w.carry.id, w.carry.n - got); }
      else f.put(w.carry.id, w.carry.n);
      w.carry = null; return;
    }
    const cx = home?.x ?? c.x, cz = home?.z ?? c.z;
    const fr = ff.fruitNear?.(cx, cz, 22);
    if (fr !== null && fr !== undefined && fr !== -1) {
      const id = typeof fr === 'number' ? fr : fr.id, x = typeof fr === 'number' ? fl.x[id] ?? c.x : fr.x, z = typeof fr === 'number' ? fl.z[id] ?? c.z : fr.z;
      if (!this.go(w, x, z, 0.5)) return;
      this.workAnim(w, dt); ff.eatFruit?.(id);
      w.carry = w.carry?.id === 'fruit' ? w.carry : { id: 'fruit', n: 0 }; w.carry.n += 1;
      return;
    }
    // no fruit: husk carbon from the plants around home
    if (w.plant < 0 || fl.bio[w.plant] < 0.3) {
      w.plant = -1; let bd = 1e9;
      fl.near(cx, cz, 18, (i, d2) => { if (fl.bio[i] > 0.6 && d2 < bd && !f.hive.isGrafted(i)) { bd = d2; w.plant = i; } });
      if (w.plant < 0) { w.note = 'NOTHING TO FORAGE'; return; }
    }
    if (!this.go(w, fl.x[w.plant], fl.z[w.plant], 0.6)) return;
    w.state = 'work'; this.workAnim(w, dt);
    w.t += 0; const got = fl.eat(w.plant, 0.12 * dt);
    w.carry = w.carry?.id === 'carbon' ? w.carry : { id: 'carbon', n: 0 }; w.carry.n += got * 1.4;
  }

  // ------------------------------------------------------------------ the harness and loads
  private draw() {
    const R = this.f.render, extra = R.extra; extra.length = 0;
    const act = this.list.filter((w) => w.job !== 'idle' && !w.c.dead && w.c.mesh.visible);
    if (act.length > this.harness.instanceMatrix.count) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    act.forEach((w, i) => {
      const c = w.c, top = c.y + c.air + c.sp.pheno.height * c.growth * 0.82, k = clamp(c.size * 0.55, 0.35, 1.6);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
      m.compose(v.set(c.x, top, c.z), q, s.set(k, k, k));
      this.harness.setMatrixAt(i, m);
      if (w.carry && w.carry.n >= 1) {
        const n = Math.min(3, 1 + Math.floor(w.carry.n / Math.max(1, this.cap(c) / 3)));
        for (let j = 0; j < n; j++) extra.push({ x: c.x - Math.sin(c.yaw) * 0.12 * k, y: top + 0.12 * k + j * 0.17, z: c.z - Math.cos(c.yaw) * 0.12 * k, id: w.carry.id, yaw: c.yaw + j * 0.4 });
      }
    });
    this.harness.count = act.length;
    this.harness.instanceMatrix.needsUpdate = true;
  }
}
