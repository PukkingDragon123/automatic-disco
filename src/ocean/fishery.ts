// The sea's animals and how they swim (the models are the fauna agent's, life/fish.ts; one InstancedMesh per kind, the
// swim is the models' own vertex wave). Baitfish school in the open water (boids: separation, alignment, cohesion,
// a wandering goal), keep off the bed, the surface and the shallows, scatter from splashes and the golem, and when a
// shark hunts them pull into a spinning bait ball while it makes its passes. Reef fish hover and dart round the coral
// heads; armoured fish graze the bed; eels lurk by the rocks; rays glide low over the sand; jellies drift and pulse,
// glowing in the dark; now and then a fish leaps clear of the water. A sea titan (the leviathan) cruises the deep off
// the islands and, once in a while, breaches: it rises, bursts from the sea, hangs, and falls back in a huge splash.
// Fish are a stock (eco): schools refill toward what the reef and the water can carry, poison and the red tide thin
// them, the golem's intake and the net pens take them (protein).
import * as THREE from 'three';
import type { Ocean } from './ocean';
import type { Reef } from './reef';
import { buildFish, type FishKind } from '../life/fish';
import { Rand, clamp } from '../core/rand';
import { RAMPS } from '../art/palette';

export interface Fish {
  kind: FishKind; x: number; y: number; z: number; vx: number; vy: number; vz: number;
  school: School | null; alive: boolean; s: number;
  /** leaping: time in the air (<0: in the water) */
  air: number;
  /** a lone animal's goal and timer */
  gx: number; gy: number; gz: number; gt: number;
  /** speed the animal cruises at, and its panic (0..1) */
  cruise: number; panic: number;
  /** predators: hunger and the school it hunts */
  hunger: number; prey: School | null; pass: number;
  /** titan: breaching state */
  breach: number;
}
export interface School { id: number; kind: FishKind; members: Fish[]; cx: number; cy: number; cz: number; gx: number; gy: number; gz: number; gt: number; ball: number; panic: number; cap: number; home: 'open' | 'reef' }

interface Kind { model: ReturnType<typeof buildFish> | null; mesh: THREE.InstancedMesh | null; list: Fish[]; cap: number; scale: number }

const _o = new THREE.Object3D(), _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class Fishery {
  readonly group = new THREE.Group();
  readonly fish: Fish[] = [];
  readonly schools: School[] = [];
  private kinds = new Map<FishKind, Kind>();
  private r: Rand;
  private disturb: { x: number; z: number; r: number; t: number; k: number }[] = [];
  /** fish taken (protein) and lost (to predators, red tide, poison) since the start: for the survey */
  caught = 0; eaten = 0; died = 0;
  private sid = 1;
  private jellyMat: THREE.MeshLambertMaterial | null = null;
  constructor(readonly ocean: Ocean, readonly reef: Reef | null) {
    this.group.name = 'fishery';
    const R = ocean.region;
    this.r = new Rand(R.seed ^ 0xf15);
    const oce = R.oceanic, sea = this.seaCells();
    // small fish drawn a little larger than life so they read as pixel art at play zoom
    const scale = (k: FishKind) => (k === 'leviathan' ? 0.75 : k === 'shark' ? 0.85 : k === 'baitfish' ? 1.7 : k === 'reeffish' ? 1.3 : 1);
    const caps: Partial<Record<FishKind, number>> = oce
      ? { baitfish: 220, reeffish: 70, armourfish: 14, eel: 5, ray: 6, jelly: 26, shark: 2, leviathan: 1 }
      : { baitfish: sea > 1500 ? 70 : 0, reeffish: 0, armourfish: sea > 1500 ? 4 : 0, eel: 0, ray: sea > 2500 ? 2 : 0, jelly: 0, shark: 0, leviathan: 0 };
    for (const [k, cap] of Object.entries(caps) as [FishKind, number][]) {
      if (!cap) continue;
      let model: ReturnType<typeof buildFish> | null = null;
      try { model = buildFish(k, R.seed + k.length * 31); } catch (e) { console.warn('ocean: no model for', k, e); }
      if (!model) continue;
      if (k === 'jelly') {
        // drawn opaque (so they are seen through the sea's surface), lit from within at night
        const m = model.mat as THREE.MeshLambertMaterial;
        m.transparent = false; m.opacity = 1; m.depthWrite = true; m.emissive = new THREE.Color(RAMPS.glowTeal[2]); m.emissiveIntensity = 0;
        this.jellyMat = m;
      }
      const mesh = new THREE.InstancedMesh(model.geo, model.mat, cap);
      mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = k === 'leviathan' || k === 'shark' || k === 'ray'; mesh.name = 'fish-' + k;
      this.group.add(mesh);
      this.kinds.set(k, { model, mesh, list: [], cap, scale: scale(k) });
    }
    this.populate();
  }
  private seaCells() { const R = this.ocean.region; let n = 0; for (let i = 0; i < R.h.length; i++) if (R.h[i] < R.water - 1) n++; return n; }
  /** a random point of open sea at least `d` deep (and at most `dMax`), or null */
  private spot(d: number, dMax = 99, nearX?: number, nearZ?: number, rad = 20): [number, number] | null {
    const R = this.ocean.region, r = this.r, o = this.ocean;
    for (let t = 0; t < 80; t++) {
      const x = nearX !== undefined ? nearX + r.range(-rad, rad) : r.range(4, R.N - 4), z = nearZ !== undefined ? nearZ! + r.range(-rad, rad) : r.range(4, R.N - 4);
      const dd = o.depthAt(x, z);
      if (dd >= d && dd <= dMax && x > 1 && z > 1 && x < R.N - 1 && z < R.N - 1) return [x, z];
    }
    return null;
  }
  private add(kind: FishKind, x: number, y: number, z: number, school: School | null): Fish | null {
    const K = this.kinds.get(kind); if (!K || K.list.length >= K.cap) return null;
    const a = this.r.range(0, Math.PI * 2);
    const f: Fish = { kind, x, y, z, vx: Math.cos(a) * 0.5, vy: 0, vz: Math.sin(a) * 0.5, school, alive: true, s: K.scale * this.r.range(0.85, 1.15), air: -1, gx: x, gy: y, gz: z, gt: 0, cruise: 0, panic: 0, hunger: this.r.range(0, 0.6), prey: null, pass: 0, breach: 0 };
    f.cruise = ({ baitfish: 1.6, reeffish: 0.9, armourfish: 0.5, eel: 0.7, ray: 0.9, jelly: 0.12, shark: 2.4, leviathan: 3.2 } as Record<FishKind, number>)[kind] ?? 1;
    K.list.push(f); this.fish.push(f); school?.members.push(f);
    return f;
  }
  private newSchool(kind: FishKind, x: number, z: number, n: number, home: School['home']): School {
    const o = this.ocean, y = o.level - Math.min(o.depthAt(x, z) * 0.5, 4);
    const S: School = { id: this.sid++, kind, members: [], cx: x, cy: y, cz: z, gx: x, gy: y, gz: z, gt: 0, ball: 0, panic: 0, cap: n, home };
    this.schools.push(S);
    for (let i = 0; i < n; i++) this.add(kind, x + this.r.range(-1.5, 1.5), y + this.r.range(-0.6, 0.6), z + this.r.range(-1.5, 1.5), S);
    return S;
  }
  private populate() {
    const R = this.ocean.region, o = this.ocean, r = this.r;
    const bait = this.kinds.get('baitfish');
    if (bait) for (let k = 0, n = Math.min(4, Math.floor(bait.cap / 50)) || 1; k < n; k++) { const p = this.spot(2.5); if (p) this.newSchool('baitfish', p[0], p[1], Math.min(55, Math.floor(bait.cap / Math.max(1, n))), 'open'); }
    const reefK = this.kinds.get('reeffish'), coral = this.reef?.coral ?? [];
    if (reefK && coral.length) for (let k = 0; k < 7; k++) { const c = coral[r.int(0, coral.length - 1)]; this.newSchool('reeffish', c[0], c[1], r.int(6, 11), 'reef'); }
    const lone = (kind: FishKind, n: number, dmin: number, dmax: number, yk: (bed: number, surf: number) => number) => {
      for (let i = 0; i < n; i++) { const p = this.spot(dmin, dmax); if (!p) continue; const bed = o.bedAt(p[0], p[1]); this.add(kind, p[0], yk(bed, o.level), p[1], null); }
    };
    lone('armourfish', this.kinds.get('armourfish')?.cap ?? 0, 1.2, 10, (b) => b + 0.3);
    lone('eel', this.kinds.get('eel')?.cap ?? 0, 1.5, 12, (b) => b + 0.25);
    lone('ray', this.kinds.get('ray')?.cap ?? 0, 1.0, 7, (b) => b + 0.35);
    lone('jelly', this.kinds.get('jelly')?.cap ?? 0, 3, 99, (b, s) => s - r.range(0.8, Math.min(6, s - b - 0.6)));
    lone('shark', this.kinds.get('shark')?.cap ?? 0, 4, 99, (b, s) => (b + s) / 2);
    const lev = this.kinds.get('leviathan');
    if (lev) { const a = r.range(0, Math.PI * 2); this.add('leviathan', R.N / 2 + Math.cos(a) * R.N * 0.75, o.level - 9, R.N / 2 + Math.sin(a) * R.N * 0.75, null); }
  }

  /** something hit the water at (x, z): fish within r flee (k 0..1 how hard) */
  splash(x: number, z: number, r: number, k = 1) { this.disturb.push({ x, z, r, t: 1.5, k }); }
  /** kill a fish (caught, eaten, poisoned) */
  remove(f: Fish) {
    if (!f.alive) return; f.alive = false;
    const K = this.kinds.get(f.kind)!; K.list.splice(K.list.indexOf(f), 1);
    this.fish.splice(this.fish.indexOf(f), 1);
    const S = f.school;
    if (S) {
      S.members.splice(S.members.indexOf(f), 1);
      // the ecosystem's field notes hear of a school thinned out or gone
      if (S.members.length === Math.floor(S.cap * 0.3)) this.note('crash', `A SCHOOL OF ${f.kind === 'reeffish' ? 'REEF FISH' : 'BAITFISH'} IS THINNING OUT`, S.cx, S.cz);
      if (!S.members.length) this.note('extinct', `A SCHOOL OF ${f.kind === 'reeffish' ? 'REEF FISH' : 'BAITFISH'} IS FISHED OUT`, S.cx, S.cz);
    }
  }
  private note(kind: string, text: string, x: number, z: number) {
    const eco = (this.ocean.g as unknown as { world: { eco?: { note?(k: string, t: string, x: number, z: number): void } } }).world.eco;
    try { eco?.note?.(kind, text, x, z); } catch { /* the eco may not take notes */ }
  }
  /** a fish the golem's intake can take: the nearest small fish within r (3D) */
  catchable(x: number, y: number, z: number, r: number): Fish | null {
    let best: Fish | null = null, bd = r * r;
    for (const f of this.fish) { if (f.kind !== 'baitfish' && f.kind !== 'reeffish' && f.kind !== 'armourfish') continue; const d = (f.x - x) ** 2 + (f.y - y) ** 2 + (f.z - z) ** 2; if (d < bd) { bd = d; best = f; } }
    return best;
  }
  /** how many of each kind live now */
  census() { const c: Partial<Record<FishKind, number>> = {}; for (const [k, K] of this.kinds) c[k] = K.list.length; return c; }

  // ------------------------------------------------------------------------------------------------ tick
  private respawnT = 0;
  update(dt: number, t: number, golem: { x: number; y: number; z: number; under: boolean } | null, night: number, storm: number, red: number) {
    if (dt <= 0) { this.draw(t, 0); return; }
    const o = this.ocean;
    for (const d of this.disturb) d.t -= dt;
    this.disturb = this.disturb.filter((d) => d.t > 0);
    // the schools: centroid, goal, panic, the bait ball under a hunting predator
    for (const S of this.schools) {
      const m = S.members; if (!m.length) continue;
      let cx = 0, cy = 0, cz = 0; for (const f of m) { cx += f.x; cy += f.y; cz += f.z; }
      S.cx = cx / m.length; S.cy = cy / m.length; S.cz = cz / m.length;
      S.gt -= dt;
      if (S.gt <= 0 || Math.hypot(S.gx - S.cx, S.gz - S.cz) < 2) {
        S.gt = this.r.range(8, 18);
        const p = S.home === 'reef' && this.reef?.coral.length ? (() => { const c = this.reef!.coral[this.r.int(0, this.reef!.coral.length - 1)]; return Math.hypot(c[0] - S.cx, c[1] - S.cz) < 25 ? [c[0], c[1]] as [number, number] : null; })() : this.spot(2.5 + storm * 2, 99, S.cx, S.cz, 22);
        if (p) { S.gx = p[0]; S.gz = p[1]; const bed = o.bedAt(p[0], p[1]); S.gy = S.home === 'reef' ? bed + 0.7 : Math.max(bed + 1, o.level - this.r.range(1, 3.5) - storm * 2.5); }
      }
      S.panic = Math.max(0, S.panic - dt * 0.4);
      const hunted = this.fish.some((f) => f.kind === 'shark' && f.prey === S && (f.x - S.cx) ** 2 + (f.z - S.cz) ** 2 < 100);
      S.ball = clamp(S.ball + (hunted ? dt * 0.8 : -dt * 0.3), 0, 1);
    }
    for (const f of this.fish) this.swim(f, dt, t, golem, storm);
    // the stock: schools refill toward what the water carries; poison and the red tide take their toll
    if ((this.respawnT -= dt) <= 0) {
      this.respawnT = 3;
      const eco = (this.ocean.g as unknown as { world: { eco?: { poisonAt?(x: number, z: number): number } } }).world.eco;
      for (const S of this.schools) {
        if (!S.members.length) { continue; }
        const pois = eco?.poisonAt?.(S.cx, S.cz) ?? 0;
        if ((pois > 0.3 || red > 0.5) && this.r.chance(0.12 + pois * 0.3)) { const f = S.members[S.members.length - 1]; this.remove(f); this.died++; }
        else if (S.members.length < S.cap && this.r.chance(0.35 * (1 - pois))) { const f0 = S.members[0]; this.add(S.kind, f0.x + this.r.range(-0.5, 0.5), f0.y, f0.z + this.r.range(-0.5, 0.5), S); }
      }
      // a school fished out returns from off the map after a while
      const bait = this.kinds.get('baitfish');
      if (bait && bait.list.length < bait.cap * 0.25 && this.r.chance(0.08)) { const p = this.spot(3); if (p) this.newSchool('baitfish', p[0], p[1], 20, 'open'); }
      this.schools.splice(0, this.schools.length, ...this.schools.filter((S) => S.members.length || S.gt > -60));
    }
    if (this.jellyMat) this.jellyMat.emissiveIntensity = night * 1.6;
    this.draw(t, storm);
  }
  private swim(f: Fish, dt: number, t: number, golem: { x: number; y: number; z: number; under: boolean } | null, storm: number) {
    const o = this.ocean, R = o.region, r = this.r;
    if (f.air >= 0) {
      // a leap: a ballistic arc, a splash at the way out and the way in
      f.air += dt; f.vy -= 9.8 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const sy = o.surfaceAt(f.x, f.z);
      if (f.y < sy && f.vy < 0) { f.air = -1; o.ripple(f.x, f.z, 0.5 * f.s); o.splash(f.x, f.z, 0.25); }
      return;
    }
    const bed = o.bedAt(f.x, f.z), surf = o.surfaceAt(f.x, f.z);
    let ax = 0, ay = 0, az = 0;
    let want = f.cruise;
    // goal seeking: schools follow their goal, loners wander theirs
    const S = f.school;
    if (f.kind === 'leviathan') { this.titan(f, dt, t); return; }
    if (S) {
      ax += (S.gx - S.cx) * 0.06; az += (S.gz - S.cz) * 0.06; ay += (S.gy - S.cy) * 0.2;
      // boids within the school
      let sx = 0, sy2 = 0, sz = 0, axx = 0, ayy = 0, azz = 0, cxx = 0, cyy = 0, czz = 0, n = 0;
      const sep = f.kind === 'baitfish' ? 0.35 : 0.6, view = f.kind === 'baitfish' ? 2.2 : 3;
      for (const g of S.members) {
        if (g === f) continue;
        const dx = g.x - f.x, dy = g.y - f.y, dz = g.z - f.z, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > view * view) continue;
        n++; axx += g.vx; ayy += g.vy; azz += g.vz; cxx += dx; cyy += dy; czz += dz;
        if (d2 < sep * sep) { const k = (sep * sep - d2) / (sep * sep); sx -= dx * k * 6; sy2 -= dy * k * 6; sz -= dz * k * 6; }
      }
      if (n) { ax += (axx / n - f.vx) * 1.2 + cxx / n * 0.8 + sx; ay += (ayy / n - f.vy) * 1.2 + cyy / n * 0.8 + sy2; az += (azz / n - f.vz) * 1.2 + czz / n * 0.8 + sz; }
      // the bait ball: tight, spinning round its centre
      if (S.ball > 0.05) {
        const dx = f.x - S.cx, dz = f.z - S.cz, d = Math.hypot(dx, dz) || 1, rad = 1.2 + S.members.length * 0.012;
        ax += (-dx / d) * (d - rad) * 2 * S.ball + (-dz / d) * 2.5 * S.ball; az += (-dz / d) * (d - rad) * 2 * S.ball + (dx / d) * 2.5 * S.ball;
        ay += (S.cy - f.y) * 1.5 * S.ball; want *= 1 + S.ball;
      }
      if (S.home === 'reef') { want *= 0.6 + 0.4 * Math.sin(t * 0.7 + f.x); }
    } else {
      f.gt -= dt;
      if (f.gt <= 0 || (f.gx - f.x) ** 2 + (f.gz - f.z) ** 2 < 1) {
        f.gt = r.range(5, 14);
        const deep = f.kind === 'shark' ? 4 : f.kind === 'jelly' ? 3 : 1;
        const p = this.spot(deep, f.kind === 'ray' ? 7 : 99, f.x, f.z, f.kind === 'jelly' ? 6 : 18);
        if (p) { const b2 = o.bedAt(p[0], p[1]); f.gx = p[0]; f.gz = p[1]; f.gy = f.kind === 'ray' || f.kind === 'armourfish' || f.kind === 'eel' ? b2 + 0.3 : f.kind === 'jelly' ? Math.max(b2 + 1, o.level - r.range(0.6, 4)) : (b2 + o.level) / 2; }
      }
      const dx = f.gx - f.x, dy = f.gy - f.y, dz = f.gz - f.z, d = Math.hypot(dx, dz) || 1;
      ax += (dx / d) * 1.2; az += (dz / d) * 1.2; ay += dy * 0.6;
      if (f.kind === 'jelly') { ax *= 0.15; az *= 0.15; ay = Math.sin(t * 2.4 + f.x) * 0.3 + dy * 0.2; }
      if (f.kind === 'shark') this.hunt(f, dt);
    }
    // threats: splashes, the golem in the water, sharks for the small fish
    let flee = 0;
    for (const d of this.disturb) { const dx = f.x - d.x, dz = f.z - d.z, dd = Math.hypot(dx, dz); if (dd < d.r) { const k = (1 - dd / d.r) * d.k * 6; ax += (dx / (dd || 1)) * k; az += (dz / (dd || 1)) * k; ay -= k * 0.4; flee = Math.max(flee, k); } }
    if (golem && f.kind !== 'shark' && f.kind !== 'jelly') {
      const dx = f.x - golem.x, dy = f.y - golem.y, dz = f.z - golem.z, dd = Math.hypot(dx, dy, dz), rr = golem.under ? 4.5 : 2.5;
      if (dd < rr) { const k = (1 - dd / rr) * 7; ax += (dx / dd) * k; ay += (dy / dd) * k * 0.5; az += (dz / dd) * k; flee = Math.max(flee, k * 0.5); }
    }
    if (f.kind === 'baitfish' || f.kind === 'reeffish') for (const p of this.kinds.get('shark')?.list ?? []) {
      const dx = f.x - p.x, dz = f.z - p.z, dd = Math.hypot(dx, dz);
      if (dd < 3.5) { const k = (1 - dd / 3.5) * 9; ax += (dx / (dd || 1)) * k; az += (dz / (dd || 1)) * k; flee = Math.max(flee, k * 0.4); }
    }
    if (flee > 0 && S) S.panic = Math.max(S.panic, Math.min(1, flee));
    f.panic = Math.max(flee, f.panic - dt);
    // stay in the water: off the bed, under the surface, out of the shallows (storms push them deeper)
    const floor = bed + (f.kind === 'ray' || f.kind === 'armourfish' || f.kind === 'eel' ? 0.15 : 0.45), ceil = surf - (f.kind === 'jelly' ? 0.35 : 0.3) - storm * (f.kind === 'jelly' ? 0 : 1.2);
    if (f.y < floor + 0.4) ay += (floor + 0.4 - f.y) * 6;
    if (f.y > ceil - 0.2) ay -= (f.y - ceil + 0.2) * 6;
    const sd = o.shore.at(f.x, f.z);
    if (sd < 2.5 || o.depthAt(f.x + f.vx * 0.5, f.z + f.vz * 0.5) < 0.6) { const [tx, tz] = o.shore.toShore(f.x, f.z); ax -= tx * 5; az -= tz * 5; }
    if (f.x < 2 || f.z < 2 || f.x > R.N - 2 || f.z > R.N - 2) { ax += (R.N / 2 - f.x) * 0.2; az += (R.N / 2 - f.z) * 0.2; }
    // integrate toward the cruising speed, faster in a panic
    want *= 1 + f.panic * 1.8;
    f.vx += ax * dt; f.vy += ay * dt; f.vz += az * dt;
    const sp = Math.hypot(f.vx, f.vy, f.vz) || 1e-3, k = want / sp;
    const fk = 1 - Math.exp(-dt * (f.kind === 'jelly' ? 0.6 : 2.2));
    f.vx += (f.vx * k - f.vx) * fk; f.vy += (f.vy * k - f.vy) * fk * 0.6; f.vz += (f.vz * k - f.vz) * fk;
    f.vy = clamp(f.vy, -want * 0.6, want * 0.6);
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    f.y = clamp(f.y, floor, Math.max(floor, ceil));
    // a leap: a fish near the surface, now and then (more in a panic)
    if ((f.kind === 'baitfish' || f.kind === 'reeffish') && f.y > ceil - 0.8 && r.chance(dt * (0.004 + f.panic * 0.03))) {
      const h = Math.hypot(f.vx, f.vz) || 1; f.air = 0; f.vy = r.range(3.2, 4.6); f.vx = (f.vx / h) * 2.6; f.vz = (f.vz / h) * 2.6; f.y = surf; o.ripple(f.x, f.z, 0.4);
    }
  }
  /** a shark: patrols; hungry, it picks a school, circles it into a ball and makes passes through it */
  private hunt(f: Fish, dt: number) {
    const red = this.ocean.wx.red;
    f.hunger = Math.min(1, f.hunger + dt * (0.012 + red * 0.04));
    if (!f.prey && f.hunger > 0.55) {
      let best: School | null = null, bd = 30 * 30;
      for (const S of this.schools) { if (S.kind !== 'baitfish' && S.kind !== 'reeffish' || !S.members.length) continue; const d = (S.cx - f.x) ** 2 + (S.cz - f.z) ** 2; if (d < bd) { bd = d; best = S; } }
      f.prey = best;
    }
    const S = f.prey;
    if (!S || !S.members.length) { f.prey = null; return; }
    // circle, then cut through
    f.pass -= dt;
    const dx = S.cx - f.x, dz = S.cz - f.z, d = Math.hypot(dx, dz) || 1;
    if (f.pass > 0) { f.gx = S.cx + (-dz / d) * 4; f.gz = S.cz + (dx / d) * 4; f.cruise = 2.6 + red; }
    else { f.gx = S.cx + (dx / d) * 4; f.gz = S.cz + (dz / d) * 4; f.cruise = 4.2 + red * 1.5; if (d < 1.2) f.pass = this.r.range(3, 6); }
    f.gy = S.cy; f.gt = 1;
    // a bite
    for (const g of S.members) if ((g.x - f.x) ** 2 + (g.y - f.y) ** 2 + (g.z - f.z) ** 2 < 0.5 * 0.5) { this.remove(g); this.eaten++; f.hunger -= 0.12; if (f.hunger < 0.15) { f.prey = null; f.cruise = 2.4; } break; }
  }
  /** the sea titan: cruising the deep, mostly off the islands; now and then it breaches */
  private titan(f: Fish, dt: number, t: number) {
    const o = this.ocean, R = o.region, r = this.r;
    if (f.breach > 0) {
      // the breach: a surge up and out, a hang, the fall and the splash
      f.breach += dt;
      if (f.breach < 2.0) { f.vy = Math.min(f.vy + dt * 8, 8.5); }
      else f.vy -= 9.8 * dt;
      f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
      const sy = o.surfaceAt(f.x, f.z);
      if (f.y > sy && !(f as { out?: boolean }).out) { (f as { out?: boolean }).out = true; o.splash(f.x, f.z, 3); o.ripple(f.x, f.z, 1.5); }
      if (f.y < sy && f.vy < 0 && (f as { out?: boolean }).out) { (f as { out?: boolean }).out = false; f.breach = 0; o.splash(f.x, f.z, 5); o.ripple(f.x, f.z, 1.5); o.ripple(f.x + 3, f.z, 1.2); o.ripple(f.x - 3, f.z + 2, 1.2); o.titanSplash(f.x, f.z); this.splash(f.x, f.z, 22, 1); f.vy = -3; }
      return;
    }
    f.gt -= dt;
    if (f.gt <= 0) {
      f.gt = r.range(14, 30);
      // a long loop round the region, in the deep water and off the map
      const a = Math.atan2(f.z - R.N / 2, f.x - R.N / 2) + r.range(0.4, 0.9), rad = r.range(R.N * 0.45, R.N * 0.9);
      f.gx = R.N / 2 + Math.cos(a) * rad; f.gz = R.N / 2 + Math.sin(a) * rad;
    }
    const bed = o.bedAt(f.x, f.z), want = Math.max(bed + 3, o.level - 7 - Math.sin(t * 0.05) * 2);
    const dx = f.gx - f.x, dz = f.gz - f.z, d = Math.hypot(dx, dz) || 1;
    const k = 1 - Math.exp(-dt * 0.25);
    f.vx += ((dx / d) * f.cruise - f.vx) * k; f.vz += ((dz / d) * f.cruise - f.vz) * k; f.vy += ((want - f.y) * 0.3 - f.vy) * k;
    // the shallows turn it
    if (o.depthAt(f.x + f.vx * 4, f.z + f.vz * 4) < 8) { f.vx -= (f.x - R.N / 2) * -0.01; f.vz -= (f.z - R.N / 2) * -0.01; f.gx = R.N / 2 + (f.x - R.N / 2) * 1.6; f.gz = R.N / 2 + (f.z - R.N / 2) * 1.6; }
    f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
    // in deep water, once in a while (more in the bloodtide's migration): the breach
    const deep = o.depthAt(f.x, f.z) > 12 || f.x < 0 || f.z < 0 || f.x > R.N || f.z > R.N;
    if (deep && r.chance(dt * (0.012 + o.wx.red * 0.03 + this.breachSoon))) { f.breach = 0.001; f.vy = 2; this.breachSoon = 0; }
  }
  /** test hook: raise the chance the titan breaches soon */
  breachSoon = 0;
  /** the instances: position, heading and pitch from the velocity */
  private draw(t: number, storm: number) {
    for (const [, K] of this.kinds) {
      const m = K.mesh, M = K.model; if (!m || !M) continue;
      let i = 0, eff = 0;
      for (const f of K.list) {
        if (i >= K.cap) break;
        const sp = Math.hypot(f.vx, f.vz), yaw = Math.atan2(f.vx, f.vz);
        const pitch = f.kind === 'jelly' ? 0 : -Math.atan2(f.vy, Math.max(0.05, sp)) * (f.kind === 'leviathan' && f.breach > 0 ? 1 : 0.7);
        _e.set(pitch, yaw, f.kind === 'ray' ? Math.sin(t * 0.8 + f.x) * 0.15 : 0);
        _o.position.set(f.x, f.y, f.z); _o.quaternion.setFromEuler(_e); _o.scale.setScalar(f.s); _o.updateMatrix();
        m.setMatrixAt(i++, _o.matrix);
        eff += Math.min(1, Math.hypot(sp, f.vy) / (f.cruise * 1.6));
      }
      m.count = i; m.instanceMatrix.needsUpdate = true;
      M.uniforms.uTime.value = t; M.uniforms.uSwim.value = clamp(i ? eff / i : 0.4, 0.15, 1) * (1 + storm * 0.2);
    }
  }
  dispose() { this.group.removeFromParent(); for (const [, K] of this.kinds) { K.mesh?.dispose(); K.model?.geo.dispose(); (K.model?.mat as THREE.Material | undefined)?.dispose(); } }
}
