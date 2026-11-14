// Unit 07 at sea. Over open water its gravity coil holds it just above the waves (it rides the swell, spray off its
// field at speed); hold SHIFT to DIVE (deeper and faster with the coil fitted) and SPACE to come back up (at the surface
// Space dashes as ever). Under water the camera follows it down, the field drags harvest in: ore nodules and crystal
// clusters off the sea floor, carbon from the kelp, and small fish its intake can catch (protein). It goes nowhere it
// could not before on land; over the sea nothing but rock and the map's edge stops it. (Shift and Space, as in any
// flight: Ctrl would collide with the browser's own Ctrl+W.)
// (It hooks the Player from outside: the deep-water block is lifted over the sea, its height is set after it moves.)
import * as THREE from 'three';
import type { Ocean } from './ocean';
import type { Reef } from './reef';
import type { Fishery } from './fishery';
import { floatText } from '../ui/floatText';
import { sfx } from '../audio/audio';
import { clamp, damp, lerp } from '../core/rand';
import { toast } from '../ui/kit';

interface PlayerLike {
  x: number; y: number; z: number; vx: number; vz: number; yaw: number; started: boolean; alive: boolean; height: number;
  has(id: string): boolean; blocked(x: number, z: number): boolean;
}
const _v = new THREE.Vector3(), _q = new THREE.Vector3();

export class Dive {
  /** depth of the golem's top under the surface (0: riding the waves) */
  depth = 0;
  /** submerged (the whole body under water) */
  get under() { return this.depth > 0.25; }
  /** what the dive camera blends in (0 the RTS view .. 1 down with the golem) */
  private camK = 0;
  private hooked = false;
  private acc = { ore: 0, crystal: 0, carbon: 0, protein: 0 };
  private told = false; private beamT = 0;
  private beam: THREE.LineSegments;
  private beamP = new Float32Array(6 * 6);
  constructor(readonly o: Ocean, readonly reef: Reef | null, readonly fishery: Fishery | null) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.beamP, 3));
    const m = new THREE.LineBasicMaterial({ color: 0x95ccb0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
    this.beam = new THREE.LineSegments(g, m); this.beam.frustumCulled = false; this.beam.visible = false;
    o.g.world.fxScene.add(this.beam);
  }
  private get p(): PlayerLike | null { return (this.o.g.player as unknown as PlayerLike) ?? null; }
  /** the golem as the fish see it */
  golem(): { x: number; y: number; z: number; under: boolean } | null { const p = this.p; return p && p.started && p.alive ? { x: p.x, y: p.y + p.height * 0.5, z: p.z, under: this.under } : null; }
  private hook(p: PlayerLike) {
    if (this.hooked) return; this.hooked = true;
    const o = this.o, R = o.region, orig = p.blocked.bind(p);
    // over the sea only rock and the map's rim stop it
    p.blocked = (x: number, z: number) => {
      if (!o.isSea(x, z)) return orig(x, z);
      if (x < 1.2 || z < 1.2 || x > R.N - 1.2 || z > R.N - 1.2) return true;
      return R.isSolid(x, z);
    };
    // the camera's ground: the sea's surface, or the golem when it is down
    const cam = o.g.cam;
    cam.ground = (x, z) => (this.under && this.p ? this.p.y + 0.5 : Math.max(R.groundSmooth(x, z), R.water));
    const prev = o.g.cineCam;
    void prev;
  }
  update(dt: number, t: number) {
    const o = this.o, g = o.g, p = this.p;
    this.beam.visible = false;
    if (!p || !p.started || !p.alive) { this.depth = 0; this.camK = 0; return; }
    this.hook(p);
    const sea = o.isSea(p.x, p.z), inp = g.input, coil = p.has('coil');
    const surf = o.surfaceAt(p.x, p.z), water = o.depthAt(p.x, p.z);
    if (!sea) { this.depth = 0; }
    else {
      if (!this.told && water > 1.2) { this.told = true; toast('Over open water: hold <b>SHIFT</b> to dive, <b>SPACE</b> to surface. Down there the field draws in ore, crystal, kelp and fish.', 'info', 6000); }
      const rate = coil ? 3.4 : 2.2;
      if (inp.down('Shift') && !inp.down('e') && !g.harvest.blocking) this.depth += rate * dt;
      if (inp.down(' ') && this.depth > 0) this.depth -= rate * 1.4 * dt;
      // the sea floor (and any shallower ground it drifts over) lifts it
      const maxD = Math.max(0, water - p.height - 0.35);
      this.depth = clamp(this.depth, 0, maxD);
    }
    // its height: riding the waves, or down at depth; the Player set it to the flat sea's surface just now
    const want = this.depth > 0.02 ? surf - this.depth - p.height : sea ? surf + 0.04 : p.y;
    if (sea) {
      p.y = this.depth > 0.02 ? damp((this as unknown as { yC?: number }).yC ?? p.y, want, 5, dt) : want;
      (this as unknown as { yC?: number }).yC = p.y;
      g.child.root.position.y = p.y;
      // it rolls with the swell when it rides it
      if (this.depth < 0.05) { const [sx, sz] = o.swell.slope(p.x, p.z, o.time, water); g.child.lean.x += clamp(-sz, -0.3, 0.3) * 0.25; g.child.lean.y += clamp(sx, -0.3, 0.3) * 0.25; }
      // spray and a wake when it skims fast; bubbles when down
      const sp = Math.hypot(p.vx, p.vz);
      if (this.depth < 0.05 && sp > 1.5 && Math.random() < dt * sp * 3) g.fx.burst(p.x - p.vx * 0.08, surf + 0.05, p.z - p.vz * 0.08, 2, 0xd8f0f0, { speed: 0.8, up: 1.6, size: 2, life: 0.5, grav: 6 });
      if (this.under && Math.random() < dt * 4) g.fx.burst(p.x + (Math.random() - 0.5) * 0.4, p.y + p.height, p.z + (Math.random() - 0.5) * 0.4, 1, 0xc8e8e8, { speed: 0.2, up: 1.4, size: 2, life: 1.2, grav: -1.2 });
      // entering and leaving the water
      const wasUnder = (this as unknown as { wU?: boolean }).wU ?? false;
      if (wasUnder !== this.under) { o.ripple(p.x, p.z, 1); o.splash(p.x, p.z, 0.6); sfx(this.under ? 'squelch' : 'crack', 1.4, 0.4); this.fishery?.splash(p.x, p.z, 4, 0.6); }
      (this as unknown as { wU?: boolean }).wU = this.under;
    }
    this.camera(dt, p);
    if (this.under) this.harvest(dt, t, p);
    else if (sea && water > 0.6) this.fishing(dt, p, surf);
  }
  /** the dive camera: the RTS orbit lowered and pulled in on the golem, under the surface with it */
  private camera(dt: number, p: PlayerLike) {
    const g = this.o.g;
    const goal = this.under ? clamp((this.depth - 0.25) / 1.4, 0, 1) : 0;
    this.camK = damp(this.camK, goal, 3, dt);
    const mine = (g.cineCam as unknown as { __dive?: boolean } | null)?.__dive;
    if (this.camK < 0.01) { if (mine) g.cineCam = null; return; }
    if (g.cineCam && !mine) return; // a cutscene has the camera
    if (!mine) {
      const f = ((cam: THREE.PerspectiveCamera) => {
        const k = this.camK, rts = g.cam, pp = this.p; if (!pp) return;
        const pitch = lerp(rts.pitch(rts.dist), 0.42, k), D = lerp(rts.dist, clamp(rts.dist * 0.4, 5, 10), k);
        _q.set(pp.x, pp.y + pp.height * 0.6, pp.z);
        _v.set(_q.x + Math.sin(rts.yaw) * Math.cos(pitch) * D, _q.y + Math.sin(pitch) * D, _q.z + Math.cos(rts.yaw) * Math.cos(pitch) * D);
        cam.position.lerp(_v, k); cam.lookAt(_q.x, _q.y + 0.3 * (1 - k), _q.z); cam.updateMatrixWorld();
      }) as ((cam: THREE.PerspectiveCamera, dt: number) => void) & { __dive?: boolean };
      f.__dive = true; g.cineCam = f;
    }
    void p;
  }
  /** the field drags in what is near on the sea floor */
  private harvest(dt: number, t: number, p: PlayerLike) {
    const o = this.o, g = o.g, cy = p.y + p.height * 0.5;
    const node = this.reef?.nodeNear(p.x, cy, p.z, 2.6) ?? null;
    let at: THREE.Vector3 | null = null;
    if (node) {
      const rate = (node.kind === 'ore' ? 2.2 : 1.4) * (p.has('coil') ? 1.4 : 1);
      const got = this.reef!.take(node, rate * dt);
      this.credit(node.kind, got, p);
      at = new THREE.Vector3(node.x, node.y + 0.3, node.z);
      if (node.amount <= 0) toast(node.kind === 'ore' ? 'The nodule field is stripped bare.' : 'The crystal cluster is spent.', 'info', 2400);
    } else {
      const ki = this.reef?.kelpNear(p.x, cy, p.z, 1.6) ?? -1;
      if (ki >= 0) { const k = this.reef!.kelp[ki], got = this.reef!.cutKelp(ki, 1.3 * dt); this.credit('carbon', got, p); at = new THREE.Vector3(k.x, Math.min(cy, k.y + k.h * 0.5), k.z); }
      else this.fishing(dt, p, cy);
    }
    if (at) this.drawBeam(p, at, t);
    void g;
  }
  /** small fish swept into the intake as it moves through a school (protein) */
  private fishing(dt: number, p: PlayerLike, y: number) {
    const fs = this.fishery; if (!fs) return;
    const sp = Math.hypot(p.vx, p.vz);
    if (sp < 0.8 && !this.under) return;
    const f = fs.catchable(p.x, this.under ? y : y - 0.4, p.z, this.under ? 1.1 : 0.9);
    if (!f) return;
    fs.remove(f); fs.caught++;
    this.credit('protein', 1, p);
    this.o.g.fx.burst(f.x, f.y, f.z, 4, 0xc8e8e8, { speed: 0.6, up: 0.8, size: 2, life: 0.5, grav: -0.5 });
    void dt;
  }
  private credit(kind: 'ore' | 'crystal' | 'carbon' | 'protein', n: number, p: PlayerLike) {
    const a = this.acc; a[kind] += n;
    if (a[kind] < 1) return;
    const k = Math.floor(a[kind]); a[kind] -= k;
    const f = (this.o.g as unknown as { factory?: { put(id: string, n: number): number } }).factory;
    f?.put(kind, k);
    const label = kind === 'ore' ? 'ORE' : kind === 'crystal' ? 'CRYSTAL' : kind === 'carbon' ? 'CARBON' : 'PROTEIN';
    if ((this.beamT -= 1) <= 0 || kind === 'protein') { this.beamT = 2; floatText(this.o.g, p.x, p.y + p.height + 0.3, p.z, `+${k} ${label}`, kind === 'ore' || kind === 'carbon' ? kind : 'good', { life: 1.2 }); }
    if (Math.random() < 0.3) sfx('grow', 1.6, 0.2);
  }
  /** a few wavering lines of the field drawing the harvest in */
  private drawBeam(p: PlayerLike, at: THREE.Vector3, t: number) {
    const b = this.beamP, hx = p.x, hy = p.y + p.height * 0.55, hz = p.z;
    for (let i = 0; i < 6; i++) {
      const w = Math.sin(t * 9 + i * 2.1) * 0.25, k = i / 6;
      b.set([hx, hy, hz, at.x + w, at.y + Math.cos(t * 7 + i) * 0.2 + k * 0.1, at.z - w], i * 6);
    }
    (this.beam.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.beam.visible = true;
  }
  dispose() { this.beam.removeFromParent(); this.beam.geometry.dispose(); (this.beam.material as THREE.Material).dispose(); const g = this.o.g; if ((g.cineCam as unknown as { __dive?: boolean } | null)?.__dive) g.cineCam = null; }
}
