// Resources in the world. When a worker (or anything else) puts an item into an open container (a crate, a soil pit,
// an ore bunker, an ammo bin) the item's own model is tossed in from the worker's hands, or dropped from above when
// nobody is near: it flies, tumbles, lands on the pile, bounces once (less for heavy things), squashes a little and
// puffs dust scaled by its weight (the UI kit's placeDust, in the item's own dust colour), with a few chips of it and
// the sound of its material; the container's load is held as it was until the item lands, so the pile grows at the
// moment it arrives. Construction sites show what has been delivered to them as real piles along their front edge
// (logs, planks, stone, ingots...), which shrink as the build uses them, and deliveries drop onto those piles too.
import * as THREE from 'three';
import type { Game } from '../../game/game';
import type { Storage } from '../../inv/storage';
import type { Container } from '../../inv/container';
import type { ContainerRender } from '../../inv/render';
import { itemDef, ITEMS, type ItemId } from '../../factory/items';
import { RAMPS } from '../../art/palette';
import { formOf } from './forms';
import { unitOf, pileGeo } from './piles';
import { meshesOf } from './mats';
import { landSfx } from './sound';
import { placeDustWorld, placeDust, bounceEl } from '../../ui/kit/juice';

const OPEN = new Set(['crate', 'st_pit', 'st_bunker', 'st_bin']);
/** how heavy a load reads (0 a seed .. 1 a beam): drives the dust, the bounce and the thud */
export const weightOf = (id: ItemId, n = 1) => Math.max(0, Math.min(1, Math.log10(1 + (itemDef(id).mass ?? 1) * Math.max(1, n)) / 2.3));
const G = 15;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

interface Drop {
  obj: THREE.Group; id: ItemId; w: number; s: number;
  from: THREE.Vector3; to: THREE.Vector3; T: number; t: number; v0y: number;
  phase: 0 | 1 | 2; vy: number; vx: number; vz: number; y: number; floor: number; hits: number; sq: number; sqT: number;
  spin: THREE.Vector3; rest: THREE.Quaternion; aud: number; onLand?: () => void; keep: boolean;
}
interface SitePile { g: THREE.Group; key: string; got: Record<string, number>; spot: Map<string, THREE.Vector3> }

export class ResourceWorld {
  readonly group = new THREE.Group();
  private drops: Drop[] = [];
  private busy = new Map<Container, number>();
  private sites = new Map<number, SitePile>();
  private siteT = 0;
  constructor(readonly g: Game, readonly st: Storage, readonly render: ContainerRender | null) {
    g.world.scene.add(this.group);
    st.on('stored', (d: { c: Container; item: ItemId; n: number }) => this.stored(d.c, d.item, d.n));
    g.update$.push((dt) => this.update(dt));
  }
  private camera(): THREE.Camera | null { return (this.g as unknown as { cam?: { cam?: THREE.Camera } }).cam?.cam ?? null; }
  private audible(x: number, z: number) { const a = (this.g as unknown as { audible?: (x: number, z: number) => number }).audible; return a ? a.call(this.g, x, z) : 1; }

  /** toss n of an item from a point to a point (world): it flies, tumbles, bounces and dusts by its weight */
  drop(id: ItemId, n: number, from: THREE.Vector3, to: THREE.Vector3, o: { scale?: number; onLand?: () => void; floor?: number; /** stay where it lands (a load put down on open ground) */ keep?: boolean } = {}) {
    const u = unitOf(id, Math.floor(Math.random() * 4), Math.floor(Math.random() * 3));
    const obj = meshesOf(u.M.build());
    const s = o.scale ?? 1, w = weightOf(id, n);
    obj.scale.setScalar(s); obj.position.copy(from);
    obj.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    this.group.add(obj);
    const dist = Math.hypot(to.x - from.x, to.z - from.z), T = 0.38 + Math.min(0.5, dist * 0.09) + Math.max(0, from.y - to.y) * 0.05;
    const spinK = (9 - w * 5) * (0.7 + Math.random() * 0.6);
    this.drops.push({
      obj, id, w, s, from: from.clone(), to: to.clone(), T, t: 0, v0y: (to.y - from.y + 0.5 * G * T * T) / T,
      phase: 0, vy: 0, vx: (to.x - from.x) / T, vz: (to.z - from.z) / T, y: from.y, floor: o.floor ?? to.y, hits: 0, sq: 0, sqT: 0,
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(spinK),
      rest: new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.25, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25)),
      aud: this.audible(to.x, to.z), onLand: o.onLand, keep: !!o.keep,
    });
  }
  /** something went into a container: if it is open and in view, the item drops onto its pile */
  private stored(c: Container, item: ItemId, n: number) {
    const b = c.b as unknown as { x: number; y: number; z: number; dead: boolean } | null;
    if (!b || b.dead || !OPEN.has(c.kind) || !ITEMS[item]) return;
    if (this.audible(b.x, b.z) < 0.12 || (this.busy.get(c) ?? 0) >= 2) return;
    const m = this.render?.modelOf(c); if (!m) return;
    const sp = m.spotOf(item), bay = m.bayOf();
    const local = sp ? _v.set(sp.x, sp.top, sp.z) : _v.set((bay.x0 + bay.x1) / 2, bay.y + bay.h * 0.3, (bay.z0 + bay.z1) / 2);
    m.root.updateMatrixWorld();
    const to = m.root.localToWorld(local.clone());
    const u = unitOf(item, 0), scale = sp?.s ?? Math.min(1, (Math.min(bay.x1 - bay.x0, bay.z1 - bay.z0) * 0.4) / Math.max(1e-3, u.size.x, u.size.z));
    const from = this.handsNear(to) ?? to.clone().add(_w.set((Math.random() - 0.5) * 0.4, 1.1 + u.size.y * scale, 0.25));
    m.hold(3200);
    this.busy.set(c, (this.busy.get(c) ?? 0) + 1);
    this.drop(item, n, from, to, { scale, onLand: () => { m.release(); this.busy.set(c, Math.max(0, (this.busy.get(c) ?? 1) - 1)); } });
  }
  /** the hands of the nearest worker within reach of a point (where a carried load is tossed from) */
  private handsNear(p: THREE.Vector3): THREE.Vector3 | null {
    const ws = (this.g.factory as unknown as { workers?: { list: { c: { x: number; y: number; z: number; dead: boolean; radius: number } }[] } } | undefined)?.workers?.list;
    let best: THREE.Vector3 | null = null, bd = 4.2;
    for (const w of ws ?? []) { const c = w.c; if (c.dead) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = new THREE.Vector3(c.x, c.y + 0.6 + c.radius * 1.4, c.z); } }
    return best;
  }

  update(dt: number) {
    dt = Math.min(dt, 1 / 20);
    for (let i = this.drops.length - 1; i >= 0; i--) if (this.step(this.drops[i], dt)) {
      const d = this.drops[i];
      if (d.keep) d.obj.scale.setScalar(d.s);
      else { d.obj.removeFromParent(); d.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
      d.onLand?.();
      this.drops.splice(i, 1);
    }
    this.siteT -= dt;
    if (this.siteT <= 0) { this.siteT = 0.25; this.syncSites(); }
  }
  /** advance one drop; true when it has come to rest */
  private step(d: Drop, dt: number): boolean {
    const o = d.obj;
    if (d.phase === 0) {
      d.t += dt;
      const t = Math.min(d.t, d.T);
      o.position.set(d.from.x + d.vx * t, d.from.y + d.v0y * t - 0.5 * G * t * t, d.from.z + d.vz * t);
      _q.setFromAxisAngle(_w.copy(d.spin).normalize(), d.spin.length() * dt); o.quaternion.premultiply(_q);
      if (d.t >= d.T) { d.vy = d.v0y - G * d.T; d.y = d.to.y; this.impact(d, 1); d.phase = 1; }
      return false;
    }
    // bounces: smaller each time, the tumble easing into a resting pose; a squash on each landing
    d.sqT += dt;
    const sq = d.sq * Math.max(0, 1 - d.sqT / 0.22) * Math.cos(d.sqT * 26);
    o.scale.set(d.s * (1 + sq * 0.55), d.s * (1 - sq), d.s * (1 + sq * 0.55));
    o.quaternion.slerp(d.rest, Math.min(1, dt * 10));
    if (d.phase === 1) {
      d.vy -= G * dt; d.y += d.vy * dt;
      o.position.x += d.vx * dt; o.position.z += d.vz * dt; d.vx *= Math.pow(0.02, dt); d.vz *= Math.pow(0.02, dt);
      if (d.y <= d.floor) { d.y = d.floor; this.impact(d, 2); if (Math.abs(d.vy) < 0.7 || d.hits > 2) { d.phase = 2; d.sqT = Math.min(d.sqT, 0.05); } }
      o.position.y = d.y;
      return false;
    }
    return d.sqT > 0.24;
  }
  private impact(d: Drop, k: number) {
    d.hits++;
    const first = d.hits === 1, w = d.w, f = formOf(d.id);
    const e = (0.34 - 0.22 * w) * (first ? 1 : 0.55);
    d.vy = Math.abs(d.vy) * e; d.vx *= first ? 0.22 : 0.4; d.vz *= first ? 0.22 : 0.4;
    d.sq = (0.12 + 0.22 * w) * (first ? 1 : 0.5); d.sqT = 0;
    if (!first && w < 0.35) return;
    const cam = this.camera(), p = d.obj.position;
    const dw = first ? w : w * 0.4;
    if (cam) placeDustWorld(p, cam, Math.max(0.08, dw), { ground: RAMPS[f.dust] as unknown as number[], sound: false, scale: this.dustScale(p, cam) * (first ? 1 : 0.6) });
    if (first) {
      landSfx(f.sound, w, d.aud);
      const fx = (this.g as unknown as { fx?: { burst(x: number, y: number, z: number, n: number, col: number, o: object): void } }).fx;
      fx?.burst(p.x, p.y + 0.05, p.z, Math.round(3 + w * 9), ITEMS[d.id]?.side ?? 0x8a7a60, { speed: 1.2 + w * 1.6, up: 1.4 + w * 1.2, size: 1.6 + w * 1.6, life: 0.45 + w * 0.3, grav: 9 });
    }
    void k;
  }
  /** the dust is painted in screen pixels: scale it with how big a metre is on screen at that point */
  private dustScale(p: THREE.Vector3, cam: THREE.Camera) {
    _v.copy(p).project(cam); _w.copy(p).add(new THREE.Vector3(0, 1, 0)).project(cam);
    const ppm = Math.abs(_w.y - _v.y) * 0.5 * innerHeight;
    return Math.max(0.3, Math.min(2.2, ppm / 55));
  }

  // ------------------------------------------------------------------ construction sites: delivered materials as piles
  private syncSites() {
    const list = (this.g.factory as unknown as { sites?: { list: { id: number; cx: number; cz: number; fw: number; fd: number; y: number; r: number; got: Record<string, number>; stage: string; work: number; workNeed: number }[] } } | undefined)?.sites?.list ?? [];
    const live = new Set<number>();
    for (const s of list) {
      live.add(s.id);
      const left = s.stage === 'build' ? Math.max(0, 1 - s.work / Math.max(1e-3, s.workNeed)) : 1;
      const ids = Object.keys(s.got).filter((k) => (s.got[k] ?? 0) >= 1 && ITEMS[k]).sort();
      const units = ids.map((k) => Math.max(0, Math.min(12, Math.ceil(Math.sqrt(s.got[k]) * 1.6 * left))));
      const key = ids.map((k, i) => `${k}:${units[i]}`).join(',');
      let sp = this.sites.get(s.id);
      if (sp && sp.key === key) { this.newArrivals(s, sp); continue; }
      const prevGot = sp?.got ?? {};
      if (sp) { sp.g.removeFromParent(); }
      const g = new THREE.Group(), spot = new Map<string, THREE.Vector3>();
      // along the site's front edge, outside its footprint, each pile on the ground there
      let x = s.cx + 0.2;
      ids.forEach((k, i) => {
        if (!units[i]) return;
        const parts = pileGeo(k, units[i], 1 + i), m = meshesOf(parts);
        const bb = new THREE.Box3(); for (const p of parts) bb.union(p.geo.boundingBox!);
        const sz = bb.getSize(new THREE.Vector3()), z = s.cz + s.fd + 0.25 + sz.z / 2;
        const gx = x + sz.x / 2, gy = this.groundY(gx, z, s.y);
        m.position.set(gx, gy, z); m.userData.shared = true;
        g.add(m); spot.set(k, new THREE.Vector3(gx, gy + sz.y, z));
        x += sz.x + 0.25;
      });
      this.group.add(g);
      sp = { g, key, got: { ...prevGot }, spot };
      this.sites.set(s.id, sp);
      this.newArrivals(s, sp);
    }
    for (const [id, sp] of this.sites) if (!live.has(id)) { sp.g.removeFromParent(); this.sites.delete(id); }
  }
  /** a delivery to a site: the item drops onto its pile from the worker's hands */
  private newArrivals(s: { got: Record<string, number> }, sp: SitePile) {
    for (const [k, n] of Object.entries(s.got)) {
      const before = sp.got[k] ?? 0;
      if ((n ?? 0) > before + 0.5) {
        const to = sp.spot.get(k);
        if (to && this.audible(to.x, to.z) > 0.12) { const from = this.handsNear(to) ?? to.clone().add(new THREE.Vector3(0, 1.2, 0.3)); this.drop(k, n - before, from, to.clone()); }
      }
      sp.got[k] = n ?? 0;
    }
  }
  private groundY(x: number, z: number, fb: number) {
    const w = this.g.world as unknown as { surfaceY?: (x: number, z: number) => number };
    try { return w.surfaceY ? w.surfaceY(x, z) : fb; } catch { return fb; }
  }
  dispose() { this.group.removeFromParent(); for (const d of this.drops) d.obj.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); this.drops = []; }
}

/** an item put down in a 2D grid window (the stores): the kit's dust puff at the drop point in the item's own dust,
 *  scaled by its weight, its landing sound, and a little bounce of the stack where it lands */
export function uiPlace(item: ItemId, n: number, x: number, y: number) {
  if (!ITEMS[item]) return;
  const w = weightOf(item, n), f = formOf(item);
  placeDust(x, y, Math.max(0.1, w), { layer: 'ui', ground: RAMPS[f.dust] as unknown as number[], sound: false, scale: 0.7 });
  landSfx(f.sound, w * 0.8, 0.75);
  requestAnimationFrame(() => requestAnimationFrame(() => { const el = document.elementFromPoint(x, y)?.closest('.inv-stack') as HTMLElement | null; if (el) bounceEl(el, w); }));
}
