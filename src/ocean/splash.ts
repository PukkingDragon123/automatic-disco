// Things hitting the sea, and the drop pod that splashes down. A splashdown: a crown of water thrown up round the pod,
// a column bursting up the middle, a ring racing out and a field of foam, every fish for thirty metres scattering. The
// pod then floats, its flotation collar inflated, riding the swell (it heaves, pitches and rolls with the waves), a
// beacon blinking on its nose; the core rides inside it at the waterline, and the golem climbs out of the hatch and
// hovers off over the waves. (game.touchdown hands a wet landing here: descent.ts flies the pod down to the surface.)
import * as THREE from 'three';
import type { Ocean } from './ocean';
import { detailsOf } from '../game/details';
import { makePod, type Pod } from '../ui/deployPod';
import { Bin } from '../ui/deployKit';
import { sfx } from '../audio/audio';
import { gbuf } from '../gfx/gbuf';
import { RAMPS } from '../art/palette';
import { clamp, damp } from '../core/rand';

const WHITE = RAMPS.snow[5], FOAM = RAMPS.sky[5], SPRAY = RAMPS.sky[4];

export class Splashes {
  private bin = new Bin();
  pod: { root: THREE.Group; model: Pod; x: number; z: number; t: number; vy: number; y: number; falling: boolean; collar: THREE.Group; beacon: THREE.Mesh } | null = null;
  constructor(readonly o: Ocean) {}
  /** a ring on the water (s ~0.2 drip .. 1.5 a big entry) */
  ripple(x: number, z: number, s = 0.6) { detailsOf(this.o.g)?.ripple(x, z, s); }
  /** something hit the water (size ~ metres): the details' crown and drops, plus spray */
  splash(x: number, z: number, size = 0.5) {
    const g = this.o.g, y = this.o.surfaceAt(x, z);
    detailsOf(g)?.splash(x, z, Math.min(size, 2.5), { quiet: size < 0.4 });
    if (size > 0.8) g.fx.burst(x, y + 0.2, z, Math.round(8 + size * 10), WHITE, { speed: 1.5 + size, up: 3 + size * 2.5, size: 2 + Math.min(3, size), life: 0.9 + size * 0.2, grav: 9 });
  }
  /** a huge entry: crown, column, ring, foam (the splashdown, a breaching titan) */
  big(x: number, z: number, k = 1) {
    const o = this.o, g = o.g, y = o.surfaceAt(x, z);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; g.fx.spray(x + Math.cos(a) * 1.4 * k, y + 0.2, z + Math.sin(a) * 1.4 * k, Math.cos(a), 1.7, Math.sin(a), 3, i % 3 ? WHITE : FOAM, { speed: 7 + k * 3, cone: 0.25, size: 4 + k, life: 1.8, grav: 11, drag: 0.6 }); }
    g.fx.spray(x, y + 0.3, z, 0, 1, 0, Math.round(50 * k), WHITE, { speed: 14 * Math.sqrt(k), cone: 0.18, size: 4 + k, life: 2.2, grav: 10, drag: 0.4 });
    g.fx.burst(x, y + 0.5, z, Math.round(40 * k), SPRAY, { speed: 3, up: 2, size: 7 + k * 2, life: 2.6, grav: -0.4 });
    for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; g.fx.spray(x + Math.cos(a) * 2, y + 0.15, z + Math.sin(a) * 2, Math.cos(a), 0.12, Math.sin(a), 3, FOAM, { speed: 9 * k, cone: 0.3, size: 5, life: 1.6, grav: 2, drag: 1.4 }); }
    this.ripple(x, z, 1.5); setTimeout(() => this.ripple(x + 0.5, z - 0.4, 1.4), 220); setTimeout(() => this.ripple(x - 0.6, z + 0.3, 1.2), 520);
    detailsOf(g)?.splash(x, z, 2.5 * k, { drops: Math.round(30 * k) });
    o.fishery?.splash(x, z, 30 * k, 1);
    g.cam.shake(0.5 * k, 0.6);
    sfx('crack', 2.4, 0.8 * Math.min(1, k)); sfx('squelch', 0.5, 0.9); sfx('pulse', 0.5, 0.5);
  }
  /** the drop pod hits the water at (x, z) (game.touchdown); `delay`: show our floating pod after the descent hides its own */
  splashdown(x: number, z: number, delay = 1.9) {
    this.big(x, z, 1.6);
    this.spawnPod(x, z, false, delay);
  }
  /** a pod falling from `alt` metres onto the water (test pages) */
  dropPod(x: number, z: number, alt = 40) { this.spawnPod(x, z, true, 0, alt); }
  private spawnPod(x: number, z: number, falling: boolean, delay: number, alt = 0) {
    if (this.pod) { this.pod.root.removeFromParent(); }
    const model = makePod(this.bin), root = new THREE.Group();
    root.add(model.root); model.setHatch(0); model.root.scale.setScalar(0.85);
    // the flotation collar: eight inflated cells round the waist, safety amber with dark straps
    const collar = new THREE.Group();
    const cm = this.bin.m(gbuf(new THREE.MeshLambertMaterial({ color: RAMPS.ochre[4] }), 1)), sm = this.bin.m(gbuf(new THREE.MeshLambertMaterial({ color: RAMPS.ink[2] }), 1));
    const cg = this.bin.g(new THREE.CapsuleGeometry(0.26, 0.55, 3, 6)), sg = this.bin.g(new THREE.BoxGeometry(0.06, 0.58, 0.6));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, c = new THREE.Mesh(cg, cm);
      c.position.set(Math.cos(a) * 1.18, 0.55, Math.sin(a) * 1.18); c.rotation.set(Math.PI / 2, 0, -a + Math.PI / 2); c.castShadow = true; collar.add(c);
      const s = new THREE.Mesh(sg, sm); s.position.set(Math.cos(a + 0.39) * 1.2, 0.55, Math.sin(a + 0.39) * 1.2); s.rotation.y = -a - 0.39; collar.add(s);
    }
    collar.scale.setScalar(falling ? 0.01 : 1);
    root.add(collar);
    const beacon = new THREE.Mesh(this.bin.g(new THREE.OctahedronGeometry(0.12, 0)), this.bin.m(gbuf(new THREE.MeshBasicMaterial({ color: 0xffc070 }), 32)));
    beacon.position.set(0, 3.0, 0); root.add(beacon);
    root.visible = delay <= 0;
    this.o.g.world.scene.add(root);
    const y = this.o.level + (falling ? alt : -0.5);
    this.pod = { root, model, x, z, t: -delay, vy: falling ? -24 : 0, y, falling, collar, beacon };
    root.position.set(x, y, z);
  }
  update(dt: number, t: number) {
    const P = this.pod, o = this.o, g = o.g; if (!P) return;
    P.t += dt;
    if (P.t < 0) return;
    P.root.visible = true;
    const surf = o.surfaceAt(P.x, P.z);
    if (P.falling) {
      P.vy = Math.max(P.vy - 9.8 * dt, -30); P.y += P.vy * dt;
      if (P.y <= surf) { P.falling = false; P.vy = -6; this.big(P.x, P.z, 1.6); P.t = 0; }
    } else {
      // buoyancy: sinks in, overshoots, settles riding the swell
      const goal = surf - 0.55;
      P.vy += ((goal - P.y) * 14 - P.vy * 3.2) * dt; P.y += P.vy * dt;
      P.collar.scale.setScalar(damp(P.collar.scale.x, 1, 5, dt));
    }
    // the swell rolls it
    const [sx, sz] = o.swell.slope(P.x, P.z, o.time, o.depthAt(P.x, P.z));
    P.root.position.set(P.x, P.y, P.z);
    P.root.rotation.x = damp(P.root.rotation.x, clamp(sz * 0.9, -0.4, 0.4), 4, dt);
    P.root.rotation.z = damp(P.root.rotation.z, clamp(-sx * 0.9, -0.4, 0.4), 4, dt);
    (P.beacon.material as THREE.MeshBasicMaterial).color.setScalar(Math.sin(t * 5) > 0.7 ? 3 : 0.15);
    P.model.update?.(dt, t);
    // foam round the hull, rings off it now and then
    if (!P.falling && Math.random() < dt * 1.2) this.ripple(P.x + (Math.random() - 0.5), P.z + (Math.random() - 0.5), 0.35);
    // the core rides inside it at the waterline; the golem climbs out of the hatch
    const core = g.veyr.core;
    if (core && Math.hypot(core.x - P.x, core.z - P.z) < 2) {
      core.y = P.y + 0.1; core.mesh.position.y = core.y; core.mesh.visible = false;
      const cap = (g as unknown as { cap: THREE.Mesh | null }).cap; if (cap) { cap.position.y = core.y; cap.visible = false; }
      if (!g.player?.started) g.child.root.position.set(P.x, P.y + 1.15, P.z);
    }
    if (g.player?.started) P.model.setHatch(Math.min(1, P.model.root.userData.h = (P.model.root.userData.h ?? 0) + dt * 0.8));
  }
  dispose() { this.pod?.root.removeFromParent(); this.bin.dispose(); }
}
