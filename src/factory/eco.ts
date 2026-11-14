// Land and water works: structures that engineer the ecosystem around the base. A sluice gate in a dam line holds
// water back and floods the hollow behind it (or lets it run and irrigates downstream), sprinklers water the ground,
// the spreader fertilises it, the sprayer poisons it, the seed planter sows saved plant prefabs on a grid, troughs
// bait herds in, capture pens shut wild creatures in and break them to the harness, breeding pens breed them.
// Each calls the ecosystem simulation (game.eco: irrigate, attract, repel, fertilise...) when it exists, and
// falls back to the region's own fertility and moisture fields when it does not.
import * as THREE from 'three';
import type { Factory, FBuilding } from './factory';
import type { Creature } from '../game/creature';
import { ITEMS, type ItemId } from './items';
import { gbuf } from '../gfx/gbuf';
import { RAMPS } from '../art/palette';
import { toast } from '../ui/kit';
import { sfx } from '../audio/audio';

/** the ecosystem agent's interface (all optional until it lands) */
export interface EcoAPI {
  irrigate?(x: number, z: number, r: number, amt?: number): void;
  attract?(x: number, z: number, kind: string, strength: number, ttl: number): void;
  repel?(x: number, z: number, kind: string, strength: number, ttl: number): void;
  fertilise?(x: number, z: number, r: number, amt?: number): void;
  fertilize?(x: number, z: number, r: number, amt?: number): void;
  poison?(x: number, z: number, r: number, amt?: number): void;
  flood?(x: number, z: number, level: number, cells: number[]): void;
  fertility?(x: number, z: number): number;
  moisture?(x: number, z: number): number;
}
type Eco = EcoAPI | undefined;
interface EcoState { t?: number; shut?: number; captive?: Creature | null; capT?: number; flood?: number[]; level?: number; mesh?: THREE.Mesh | null; old?: Float32Array; grid?: number; prefab?: string; breedT?: number; dungT?: number }
const S = (b: FBuilding) => b as unknown as EcoState & FBuilding;
const take = (b: FBuilding, ids: ItemId[], n = 1): ItemId | null => { for (const id of ids) { const h = b.inBuf.get(id) ?? 0; if (h >= n) { b.inBuf.set(id, h - n); return id; } } return null; };
const has = (b: FBuilding, ids: ItemId[]) => ids.some((id) => (b.inBuf.get(id) ?? 0) >= 1);
const FOOD: ItemId[] = ['fruit', 'protein', 'carbon'];

export function ecoOf(f: Factory): Eco { return (f.g as unknown as { eco?: EcoAPI }).eco; }
/** which items an eco structure takes */
export function ecoWants(b: FBuilding, id: ItemId): boolean {
  switch (b.kind) {
    case 'sprinkler': return id === 'water';
    case 'spreader': return id === 'dung' || id === 'carbon';
    case 'sprayer': return id === 'herbicide';
    case 'trough': case 'pen': case 'breeder': return (ITEMS[id]?.food ?? 0) > 0;
    default: return false;
  }
}
/** the fallback fields: nudge fertility / moisture over a disc of the region */
function field(f: Factory, arr: Float32Array, x: number, z: number, r: number, amt: number) {
  const N = f.N;
  for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    const X = Math.floor(x) + dx, Z = Math.floor(z) + dz; if (X < 0 || Z < 0 || X >= N || Z >= N) continue;
    const d = Math.hypot(dx, dz) / r; if (d > 1) continue;
    const k = Z * N + X; arr[k] = Math.max(0, Math.min(1, arr[k] + amt * (1 - d * 0.6)));
  }
}

export function ecoStep(f: Factory, b: FBuilding, dt: number) {
  const s = S(b), g = f.g, eco = ecoOf(f), R = g.region, fx = g.fx;
  s.t = (s.t ?? 0) + dt;
  const rad = b.def.radius ?? 5;
  if (b.def.power > 0 && b.sat <= 0.01 && b.kind !== 'sluice') { b.status = 'nopower'; return; }
  if (!b.on && b.kind !== 'sluice') { b.status = 'offline'; return; }
  switch (b.kind) {
    case 'sluice': return sluice(f, b);
    case 'sprinkler': {
      if (!has(b, ['water'])) { b.status = 'starved'; return; }
      b.status = 'working'; b.running = true;
      if (s.t < 2) { if (Math.random() < dt * 14) spray(f, b, 0x9cb2a5, rad, 1.6); return; }
      s.t = 0; take(b, ['water']);
      if (eco?.irrigate) eco.irrigate(b.x, b.z, rad, 1); else { field(f, R.wet, b.x, b.z, rad, 0.05); field(f, R.damp, b.x, b.z, rad, 0.04); field(f, R.fert, b.x, b.z, rad, 0.01); }
      return;
    }
    case 'spreader': {
      if (!has(b, ['dung', 'carbon'])) { b.status = 'starved'; return; }
      b.status = 'working'; b.running = true;
      if (Math.random() < dt * 10) spray(f, b, RAMPS.soil[3], rad, 0.6);
      if (s.t < 4) return;
      s.t = 0; const used = take(b, ['dung', 'carbon']);
      const amt = used === 'dung' ? 0.06 : 0.03;
      const fz = eco?.fertilise ?? eco?.fertilize;
      if (fz) fz.call(eco, b.x, b.z, rad, amt); else field(f, R.fert, b.x, b.z, rad, amt);
      return;
    }
    case 'sprayer': {
      if (!has(b, ['herbicide'])) { b.status = 'starved'; return; }
      b.status = 'working'; b.running = true;
      if (Math.random() < dt * 12) spray(f, b, RAMPS.ichor[4], rad, 0.9);
      if (s.t < 3) return;
      s.t = 0; take(b, ['herbicide']);
      const fl = g.world.flora;
      fl.near(b.x, b.z, rad, (i) => { if (fl.bio[i] > 0.05) fl.eat(i, 0.18); });
      g.world.near(b.x, b.z, rad, (c) => { if (c.dead || c.faction === 'veyr') return; c.poison = Math.max(c.poison, 4); if (c.faction === 'wild' && c.mind !== 'attack') { c.mind = 'flee'; c.fleeT = 2; c.target = 0; } });
      eco?.poison?.(b.x, b.z, rad, 1); eco?.repel?.(b.x, b.z, 'all', 1, 8);
      if (!eco?.poison) field(f, R.fert, b.x, b.z, rad, -0.04);
      return;
    }
    case 'planter': return planter(f, b);
    case 'trough': {
      if (!has(b, FOOD)) { b.status = 'starved'; return; }
      b.status = 'working'; b.running = true;
      if (s.t < 3) return;
      s.t = 0; if (Math.random() < 0.3) take(b, FOOD);
      lure(f, b, rad);
      return;
    }
    case 'pen': return pen(f, b, dt);
    case 'breeder': return breeder(f, b, dt);
    default: b.status = 'idle';
  }
}
function spray(f: Factory, b: FBuilding, col: number, r: number, up: number) {
  const a = Math.random() * Math.PI * 2, d = Math.random() * r;
  f.g.fx.burst(b.x + Math.cos(a) * d * 0.3, b.y + 1.2, b.z + Math.sin(a) * d * 0.3, 1, col, { speed: r * 0.6, up, size: 2.2, life: 0.9, grav: 3 });
}
/** grazers wander in to the bait */
function lure(f: Factory, b: FBuilding, r: number) {
  const eco = ecoOf(f);
  if (eco?.attract) { eco.attract(b.x, b.z, 'grazer', 1, 8); return; }
  f.g.world.near(b.x, b.z, r, (c) => {
    if (c.dead || c.faction !== 'wild' || c.diet === 'carn' || c.mind === 'flee' || c.mind === 'attack') return;
    if (Math.random() < 0.3) { c.mind = 'wander'; c.goalX = b.x + (Math.random() - 0.5) * 1.5; c.goalZ = b.z + (Math.random() - 0.5) * 1.5; c.path = null; }
  });
}

// ------------------------------------------------------------------ dam and sluice
function sluice(f: Factory, b: FBuilding) {
  const s = S(b);
  // closed (b.on false) holds the water back; open lets it run and irrigates downstream
  b.status = b.on ? 'working' : 'idle';
  if (!b.on && !s.flood) floodBehind(f, b);
  if (b.on && s.flood) drain(f, b);
  if (b.on && (s.t ?? 0) > 3) {
    s.t = 0;
    const [fx, fz] = b.fwd, x = b.x + fx * 4, z = b.z + fz * 4, eco = ecoOf(f);
    if (eco?.irrigate) eco.irrigate(x, z, b.def.radius ?? 9, 0.6); else { field(f, f.g.region.wet, x, z, 7, 0.03); field(f, f.g.region.fert, x, z, 7, 0.01); }
  }
}
/** fill the hollow behind a closed sluice up to the crest of its dam (bounded), and draw the new water */
function floodBehind(f: Factory, b: FBuilding) {
  const R = f.g.region, N = f.N, s = S(b);
  const level = b.y + 1.35, [fx, fz] = b.fwd;
  const sx = b.cx - fx, sz = b.cz - fz;
  const seen = new Uint8Array(N * N), out: number[] = [], q: number[] = [];
  const ok = (X: number, Z: number) => {
    if (X < 1 || Z < 1 || X >= N - 1 || Z >= N - 1) return false;
    if (Math.hypot(X - b.cx, Z - b.cz) > 14) return false;
    const k = Z * N + X, o = f.at(X, Z);
    if (o && (o.kind === 'dam' || o.kind === 'sluice' || o.kind === 'wall')) return false;
    return R.h[k] < level - 0.08;
  };
  if (!ok(sx, sz)) { s.flood = []; return; }
  q.push(sz * N + sx); seen[sz * N + sx] = 1;
  while (q.length && out.length < 420) {
    const k = q.shift()!; out.push(k);
    const X = k % N, Z = Math.floor(k / N);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = X + dx, nz = Z + dz, nk = nz * N + nx; if (!seen[nk] && ok(nx, nz)) { seen[nk] = 1; q.push(nk); } }
  }
  s.flood = out; s.level = level;
  const eco = ecoOf(f);
  if (eco?.flood) { eco.flood(b.x, b.z, level, out); return; }
  // the water rises in the hollow: the region counts it as river water (pumps can draw it), and a sheet of water is
  // drawn over it
  s.old = new Float32Array(out.length);
  out.forEach((k, i) => { s.old![i] = R.riverY[k]; R.riverY[k] = Math.max(R.riverY[k], level); });
  const pos: number[] = [];
  for (const k of out) { const X = k % N, Z = Math.floor(k / N), y = level - 0.12; pos.push(X, y, Z, X, y, Z + 1, X + 1, y, Z + 1, X, y, Z, X + 1, y, Z + 1, X + 1, y, Z); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const m = gbuf(new THREE.MeshLambertMaterial({ color: RAMPS.water[3], transparent: true, opacity: 0.72, emissive: new THREE.Color(RAMPS.water[1]), depthWrite: false }), 0);
  s.mesh = new THREE.Mesh(g, m); s.mesh.renderOrder = 2;
  f.render.group.add(s.mesh);
  if (out.length > 20) { toast(`The sluice closes: <b>${out.length} m&sup2;</b> of hollow floods behind the dam`, 'good', 2600); sfx('squelch', 0.5, 0.6); }
}
function drain(f: Factory, b: FBuilding) {
  const R = f.g.region, s = S(b);
  if (s.old && s.flood) s.flood.forEach((k, i) => { R.riverY[k] = s.old![i]; });
  if (s.mesh) { s.mesh.removeFromParent(); s.mesh.geometry.dispose(); (s.mesh.material as THREE.Material).dispose(); s.mesh = null; }
  s.flood = undefined; s.old = undefined;
}
/** a sluice is taken down: its reservoir drains */
export function ecoRemoved(f: Factory, b: FBuilding) {
  if (b.kind === 'sluice') drain(f, b);
  const s = S(b);
  if (s.captive && !s.captive.dead) { s.captive.order = null; s.captive = null; }
}

// ------------------------------------------------------------------ seed planter
function planter(f: Factory, b: FBuilding) {
  const s = S(b), h = f.hive, run = f.g.run;
  const pf = run.plants.find((p) => p.name === s.prefab) ?? run.plants[run.plants.length - 1];
  if (!pf) { b.status = 'idle'; b.note = 'NO PLANT PREFAB SAVED'; return; }
  s.prefab = pf.name;
  if ((s.t ?? 0) < 4 / Math.max(0.2, b.sat)) { if (b.status !== 'starved') b.status = 'working'; return; }
  s.t = 0;
  const r = b.def.radius ?? 7;
  // walk the 2 m grid outward from the planter: the first free point gets a seed
  const pts: [number, number][] = [];
  for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) { const d = Math.hypot(dx, dz); if (d <= r && d > 1.9) pts.push([b.x + dx, b.z + dz]); }
  pts.sort((a, c) => Math.hypot(a[0] - b.x, a[1] - b.z) - Math.hypot(c[0] - b.x, c[1] - b.z));
  s.grid = s.grid ?? 0;
  let why = 'FIELD FULL';
  for (let k = 0; k < pts.length; k++) {
    const [x, z] = pts[(s.grid + k) % pts.length];
    if (f.at(Math.floor(x), Math.floor(z))) continue;
    const w = h.whySow(pf, x, z);
    if (!w) { h.sow(pf, x, z); s.grid = (s.grid + k + 1) % pts.length; b.status = 'working'; b.note = ''; b.running = true; return; }
    if (w.startsWith('Needs')) { why = w.toUpperCase(); break; }
  }
  b.status = 'starved'; b.note = why; b.running = false;
}

// ------------------------------------------------------------------ capture and breeding pens
function pen(f: Factory, b: FBuilding, dt: number) {
  const s = S(b), w = f.g.world, h = f.hive;
  const c = s.captive;
  if (c && (c.dead || c.faction === 'veyr')) { s.captive = null; s.shut = 0; }
  if (s.captive) {
    const cc = s.captive;
    // keep it inside; it paces and butts the gate
    const dx = cc.x - b.x, dz = cc.z - b.z, d = Math.hypot(dx, dz);
    if (d > 1.1) { cc.x = b.x + (dx / d) * 1.1; cc.z = b.z + (dz / d) * 1.1; }
    cc.order = { kind: 'hold', x: b.x, z: b.z }; cc.fleeT = 0;
    s.capT = (s.capT ?? 0) + dt;
    b.status = 'working';
    if (s.capT > 8) {
      const why = h.whyConvert(cc);
      if (!why) { cc.order = null; h.convert(cc); f.workers.enlist(cc); toast(`The pen breaks a <b>${cc.sp.name}</b> to the harness: a new worker`, 'good', 3000); s.captive = null; s.shut = 0; }
      else { b.note = why.toUpperCase(); if (Math.random() < dt * 0.3 && h.allyCount() < h.allyCap() && !f.g.run.skills.has('convert')) b.note = 'NEEDS NEURAL GRAFT'; }
    }
    return;
  }
  s.shut = 0;
  if (has(b, FOOD)) { if ((s.t ?? 0) > 4) { s.t = 0; lure(f, b, 16); if (Math.random() < 0.25) take(b, FOOD); } b.status = 'idle'; }
  else b.status = 'starved';
  // anything wild and small enough that walks in is shut in
  w.near(b.x, b.z, b.def.radius ?? 1.6, (cr) => {
    if (s.captive || cr.dead || cr.faction !== 'wild' || cr.radius > 1.3 || cr.boss) return;
    s.captive = cr; s.capT = 0; s.shut = 1; cr.order = { kind: 'hold', x: b.x, z: b.z }; cr.target = 0; cr.mind = 'idle';
    f.g.fx.burst(b.x, b.y + 1.2, b.z + b.fd / 2, 12, RAMPS.ochre[4], { speed: 1.5, up: 1.5, size: 2.5, life: 0.5, grav: 6 });
    sfx('hit', 0.8, f.g.audible(b.x, b.z) * 0.7); sfx('call', cr.size, 0.5);
  });
}
function breeder(f: Factory, b: FBuilding, dt: number) {
  const s = S(b), w = f.g.world, h = f.hive;
  // its creatures: allies inside the fence
  const inside: Creature[] = [];
  w.near(b.x, b.z, b.def.radius ?? 2.2, (c) => { if (!c.dead && c.faction === 'veyr') inside.push(c); });
  // dung from everyone, milk (protein) from a pair, a calf now and then when fed
  s.dungT = (s.dungT ?? 0) + dt * inside.length;
  if (s.dungT > 20) { s.dungT = 0; if ((b.outBuf.get('dung') ?? 0) < 30) b.outBuf.set('dung', (b.outBuf.get('dung') ?? 0) + 1); }
  const bySp = new Map<number, Creature[]>();
  for (const c of inside) { const l = bySp.get(c.sp.id) ?? []; l.push(c); bySp.set(c.sp.id, l); }
  const pair = [...bySp.values()].find((l) => l.length >= 2 && l.filter((c) => c.mature).length >= 2);
  if (!pair) { b.status = inside.length ? 'idle' : 'starved'; b.note = inside.length ? 'NEEDS A PAIR OF ONE KIND' : 'NO ANIMALS PENNED'; s.breedT = 0; return; }
  b.status = 'working'; b.note = '';
  s.breedT = (s.breedT ?? 0) + dt;
  if (Math.floor(s.breedT / 30) !== Math.floor((s.breedT - dt) / 30) && (b.outBuf.get('protein') ?? 0) < 30) b.outBuf.set('protein', (b.outBuf.get('protein') ?? 0) + 1);
  if (s.breedT < 60) return;
  if (h.allyCount() >= h.allyCap()) { b.note = 'NO ROOM FOR MORE (BUILD WORKER PENS)'; return; }
  let fed = 0; for (const id of FOOD) fed += b.inBuf.get(id) ?? 0;
  if (fed < 4) { b.status = 'starved'; b.note = 'FEED IT (4 FOOD A LITTER)'; return; }
  for (let k = 0; k < 4; k++) take(b, FOOD);
  s.breedT = 0;
  const kid = w.spawn(pair[0].sp, 'veyr', b.x + (Math.random() - 0.5), b.z + (Math.random() - 0.5), true);
  if (kid) { h.adopt(kid); f.g.fx.burst(kid.x, kid.y + 0.4, kid.z, 14, RAMPS.glowTeal[3], { glow: true, speed: 1, up: 1.6, size: 2.2, life: 0.8 }); sfx('birth', 1, 0.6); toast(`A <b>${pair[0].sp.name}</b> is born in the breeding pen`, 'good', 2400); }
}
