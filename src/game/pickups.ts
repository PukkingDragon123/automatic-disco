// Loose pickups scattered over a region: ore nuggets shed by rock formations and seams, carbon husks dropped under
// the plants, dew globes beaded on the damp-loving flora and clods of soil on bare ground. They glint and bob; when
// Unit 07 comes close its field pulls them in (from further away with the Lodestone Field) and they are credited
// on arrival. A thinned-out patch slowly fills in again, away from the golem.
import * as THREE from 'three';
import type { Hive } from './hive';
import type { Res } from './skills';
import { Rand } from '../core/rand';
import { gbuf } from '../gfx/gbuf';
import { B } from '../world/blockTex';

interface Pick { x: number; y: number; z: number; ph: number; s: number; fly: number; on: boolean }
interface Kind { res: Res; n: number; amt: number; col: number; emis: number; ek: number; geo: () => THREE.BufferGeometry }

/** a jittered low-poly lump */
function lump(r: number, detail: number, sy: number, seed: number) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute, rnd = new Rand(seed);
  const memo = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = memo.get(key); if (k === undefined) { k = rnd.range(0.72, 1.18); memo.set(key, k); }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * sy, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

export const PICK_KINDS: Kind[] = [
  { res: 'ore', n: 44, amt: 2, col: 0x6e6460, emis: 0xff8a3a, ek: 0.55, geo: () => lump(0.11, 0, 0.8, 3) },
  { res: 'carbon', n: 44, amt: 2, col: 0x2e241e, emis: 0xd8a868, ek: 0.28, geo: () => { const g = lump(0.1, 0, 0.45, 7); g.scale(1, 1, 1.7); return g; } },
  { res: 'water', n: 34, amt: 2, col: 0x8ae0ff, emis: 0x3aa8ff, ek: 0.9, geo: () => new THREE.SphereGeometry(0.085, 8, 6) },
  { res: 'soil', n: 44, amt: 2, col: 0x7a5636, emis: 0xc89058, ek: 0.12, geo: () => lump(0.12, 0, 0.6, 11) },
];
const MAX = 90;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();

export class Pickups {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private mats: THREE.MeshLambertMaterial[] = [];
  private list: Pick[][] = [];
  private r: Rand;
  private t = 0; private refill = 6;

  constructor(readonly hive: Hive, seed: number) {
    this.r = new Rand(seed ^ 0x5a17);
    for (const k of PICK_KINDS) {
      const m = new THREE.MeshLambertMaterial({ color: k.col, flatShading: true, emissive: new THREE.Color(k.emis), emissiveIntensity: k.ek });
      gbuf(m, 1);
      const im = new THREE.InstancedMesh(k.geo(), m, MAX);
      im.count = 0; im.frustumCulled = false; im.castShadow = true;
      this.meshes.push(im); this.mats.push(m); this.list.push([]);
      this.group.add(im);
    }
    hive.w.scene.add(this.group);
    // a few of everything around the crash site, so the first minute has something to do; the rest scattered
    const core = hive.core;
    PICK_KINDS.forEach((k, ki) => {
      if (core) for (let j = 0; j < 3; j++) { const a = this.r.range(0, Math.PI * 2), d = this.r.range(4.5, 9); this.spawnAt(ki, core.x + Math.cos(a) * d, core.z + Math.sin(a) * d); }
      for (let j = 0; j < k.n; j++) this.spawn(ki, null);
    });
  }

  count(k: number) { let n = 0; for (const p of this.list[k]) if (p.on) n++; return n; }

  private spawnAt(k: number, x: number, z: number) {
    const R = this.hive.w.region;
    if (x < 2 || z < 2 || x > R.N - 2 || z > R.N - 2 || R.isSolid(x, z) || R.isWater(x, z)) return false;
    const l = this.list[k];
    let p = l.find((q) => !q.on);
    if (!p) { if (l.length >= MAX) return false; p = { x: 0, y: 0, z: 0, ph: 0, s: 1, fly: 0, on: false }; l.push(p); }
    p.x = x; p.z = z; p.y = this.hive.w.surfaceY(x, z) + 0.08; p.ph = this.r.range(0, 6.28); p.s = this.r.range(0.8, 1.25); p.fly = 0; p.on = true;
    return true;
  }
  /** a fitting spot for a kind (ore by the rocks, carbon by plants, dew by damp-loving plants, soil on bare ground) */
  private spawn(k: number, avoid: THREE.Vector3 | null) {
    const w = this.hive.w, R = w.region, fl = w.flora, r = this.r, res = PICK_KINDS[k].res;
    for (let t = 0; t < 30; t++) {
      let x = 0, z = 0;
      if (res === 'ore') {
        const rocks = R.rocks.filter((p) => p.kind !== 'pebble' && p.kind !== 'log' && p.kind !== 'stump');
        const useSeam = R.deposits.length && (r.chance(0.35) || !rocks.length);
        if (useSeam) { const d = r.pick(R.deposits); const a = r.range(0, 6.28), dd = d.r + r.range(0.3, 2.2); x = d.x + Math.cos(a) * dd; z = d.z + Math.sin(a) * dd; }
        else if (rocks.length) { const p = r.pick(rocks); const a = r.range(0, 6.28), dd = Math.max(p.sx, p.sz) + r.range(0.4, 2.2); x = p.x + Math.cos(a) * dd; z = p.z + Math.sin(a) * dd; }
        else { x = r.range(4, R.N - 4); z = r.range(4, R.N - 4); }
      } else if ((res === 'carbon' || res === 'water') && fl.n) {
        let i = r.int(0, fl.n - 1);
        if (res === 'water') for (let q = 0; q < 12; q++) { const sp = fl.species[fl.sp[i]]; if (sp.shore || sp.glow || sp.wetMin > 0.42) break; i = r.int(0, fl.n - 1); }
        if (fl.bio[i] <= 0.05) continue;
        const a = r.range(0, 6.28), dd = r.range(0.35, 1.3); x = fl.x[i] + Math.cos(a) * dd; z = fl.z[i] + Math.sin(a) * dd;
      } else {
        x = r.range(4, R.N - 4); z = r.range(4, R.N - 4);
        const b = R.b[Math.floor(z) * R.N + Math.floor(x)];
        if (t < 20 && b !== B.SOIL && b !== B.DRY && b !== B.MUD && b !== B.GRAVEL && b !== B.CLAY && b !== B.SAND) continue;
      }
      if (avoid && (x - avoid.x) ** 2 + (z - avoid.z) ** 2 < 14 * 14) continue;
      if (this.spawnAt(k, x, z)) return true;
    }
    return false;
  }

  /** golem: where Unit 07 is (null while it is not about); reach: pull radius */
  update(dt: number, golem: THREE.Vector3 | null, reach: number) {
    this.t += dt;
    const h = this.hive, t = this.t;
    // pulse the glints
    PICK_KINDS.forEach((k, i) => { this.mats[i].emissiveIntensity = k.ek * (0.75 + 0.35 * Math.sin(t * 2.4 + i * 1.7)); });
    for (let k = 0; k < PICK_KINDS.length; k++) {
      const K = PICK_KINDS[k], im = this.meshes[k], full = h.full(K.res);
      let n = 0;
      for (const p of this.list[k]) {
        if (!p.on) continue;
        if (golem) {
          const dx = golem.x - p.x, dy = golem.y + 0.45 - p.y, dz = golem.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (p.fly > 0) {
            p.fly += dt;
            const sp = Math.min(d, (2.5 + p.fly * 16) * dt);
            p.x += (dx / d) * sp; p.y += (dy / d) * sp + Math.sin(p.fly * 9) * dt * 0.6; p.z += (dz / d) * sp;
            if (d < 0.4) { p.on = false; h.gather(K.res, K.amt, p.x, p.y, p.z, true); continue; }
            if (p.fly > 3.5) p.fly = 0; // lost the pull: it drops where it is
          } else if (!full && d < reach) { p.fly = 0.001; h.fx.burst(p.x, p.y + 0.05, p.z, 3, K.emis, { glow: true, speed: 0.6, up: 1, size: 2, life: 0.4, grav: 0 }); }
          else if (p.y > h.w.surfaceY(p.x, p.z) + 0.2) p.y = Math.max(h.w.surfaceY(p.x, p.z) + 0.08, p.y - dt * 3);
        }
        const bob = p.fly > 0 ? 0 : Math.sin(t * 2 + p.ph) * 0.035 + 0.04;
        const sc = p.s * (p.fly > 0 ? Math.max(0.35, 1 - p.fly * 0.4) : 1);
        _q.setFromEuler(_e.set(p.ph, t * (0.6 + (p.ph % 1)) + p.ph, p.ph * 0.5));
        _m.compose(_p.set(p.x, p.y + bob, p.z), _q, _s.setScalar(sc));
        im.setMatrixAt(n++, _m);
        // an occasional glint
        if (p.fly <= 0 && Math.random() < dt * 0.25) h.fx.glow.emit(p.x, p.y + 0.12, p.z, 0, 0.25, 0, _c.set(K.emis).multiplyScalar(1.8), 1, 2.2, 0.5, 0, 1);
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
    }
    // slowly refill what was picked, away from the golem
    this.refill -= dt;
    if (this.refill <= 0) {
      this.refill = 5;
      for (let k = 0; k < PICK_KINDS.length; k++) if (this.count(k) < PICK_KINDS[k].n * 0.6) this.spawn(k, golem);
    }
  }
  dispose() { this.group.removeFromParent(); for (const m of this.meshes) m.geometry.dispose(); for (const m of this.mats) m.dispose(); }
}
