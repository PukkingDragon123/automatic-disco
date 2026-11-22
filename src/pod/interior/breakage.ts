// LIVE BREAKAGE (v7, the user: "you can see the pod components break and explode in real time"). The ruin keeps
// failing while you are inside: a sparking access panel pops off the wall and clatters across the deck, the pilot
// console bursts (a flash, fragments flying, a column of smoke, its live screen dead), a pipe on the far wall splits and
// vents steam that blows the curtain and the hanging pad about, the caged work lamp tears loose and swings on its cable.
// Events come at random, sooner and more often when the crew is unhappy or the pod's hull is damaged; every piece they
// throw stays a physical body (soft.ts) that tumbles, settles and can be dragged or knocked about afterwards.
import * as THREE from 'three';
import { gbuf } from '../../gfx/gbuf';
import { matTex, matMaterial } from '../../gfx/mat';
import { uiSfx } from '../../ui/kit/sound';
import { Cluster, Rope, rigidFor, type PodPhysics } from './soft';

export type BreakKind = 'panel' | 'console' | 'pipe' | 'lamp';
export const BREAK_KINDS: BreakKind[] = ['panel', 'console', 'pipe', 'lamp'];
const V = THREE.Vector3;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** what of the cabin can fail (room.ts fills it) */
export interface BreakRefs {
  root: THREE.Group;
  phys: PodPhysics;
  /** a burst of sparks at a point (cabin frame) */
  sparks(at: THREE.Vector3, n: number): void;
  shake(a: number): void;
  panels: { obj: THREE.Mesh; n: THREE.Vector3; done?: boolean }[];
  console: { at: THREE.Vector3; n: THREE.Vector3; screen: THREE.MeshBasicMaterial; screenMesh: THREE.Mesh; done?: boolean };
  pipes: { at: THREE.Vector3; dir: THREE.Vector3; done?: boolean }[];
  lamp: { obj: THREE.Object3D; mount: THREE.Vector3; light: THREE.PointLight; done?: boolean };
}

/** smoke and steam: billboards of the library's fx_puff, rising, spreading, thinning */
class Puffs {
  private pool: { s: THREE.Sprite; m: THREE.SpriteMaterial; v: THREE.Vector3; life: number; t: number; s0: number; s1: number; a: number }[] = [];
  constructor(private parent: THREE.Object3D, private additive = false) {}
  emit(at: THREE.Vector3, v: THREE.Vector3, o: { color: number; s0: number; s1: number; life: number; a: number }) {
    let p = this.pool.find((q) => q.t >= q.life);
    if (!p) {
      if (this.pool.length >= 90) return;
      const m = gbuf(new THREE.SpriteMaterial({ map: matTex('fx_puff', { hd: 2 }), transparent: true, depthWrite: false, blending: this.additive ? THREE.AdditiveBlending : THREE.NormalBlending }), 0);
      const s = new THREE.Sprite(m); s.userData.noBlur = true; s.renderOrder = 3; this.parent.add(s);
      p = { s, m, v: new V(), life: 0, t: 0, s0: 0, s1: 0, a: 0 }; this.pool.push(p);
    }
    p.s.position.copy(at); p.v.copy(v); p.t = 0; p.life = o.life; p.s0 = o.s0; p.s1 = o.s1; p.a = o.a;
    p.m.color.setHex(o.color); p.m.rotation = Math.random() * 6.28; p.s.visible = true;
  }
  update(dt: number) {
    for (const p of this.pool) {
      if (p.t >= p.life) { p.s.visible = false; continue; }
      p.t += dt; const k = Math.min(1, p.t / p.life);
      p.v.multiplyScalar(Math.pow(this.additive ? 0.08 : 0.35, dt)); p.v.y += dt * (this.additive ? 0.8 : 0.25);
      p.s.position.addScaledVector(p.v, dt);
      p.s.scale.setScalar(p.s0 + (p.s1 - p.s0) * Math.sqrt(k));
      p.m.opacity = p.a * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
      p.m.rotation += dt * 0.3;
    }
  }
  dispose() { for (const p of this.pool) { p.s.removeFromParent(); p.m.dispose(); } }
}

export class Breakage {
  /** seconds to the next failure (at calm; stress shortens it) */
  timer = rnd(16, 26);
  private puffs: Puffs; private fire: Puffs;
  private jets: { at: THREE.Vector3; dir: THREE.Vector3; t: number; acc: number }[] = [];
  private smoke: { at: THREE.Vector3; t: number; acc: number }[] = [];
  private flashes: { l: THREE.PointLight; t: number; k: number }[] = [];
  /** the lamp's flicker once it has torn loose */
  lampLoose = false;
  constructor(readonly R: BreakRefs) { this.puffs = new Puffs(R.root); this.fire = new Puffs(R.root, true); }

  /** stress 0 (a happy crew, a whole hull) .. 2 (miserable, wrecked) */
  update(dt: number, stress: number, t: number) {
    this.timer -= dt * (0.45 + stress * 1.4);
    if (this.timer <= 0) { this.timer = rnd(28, 68); const k = this.pick(); if (k) this.trigger(k); }
    for (let i = this.jets.length - 1; i >= 0; i--) {
      const j = this.jets[i]; j.t -= dt; j.acc += dt;
      while (j.acc > 0.045) { j.acc -= 0.045; this.puffs.emit(j.at, j.dir.clone().multiplyScalar(rnd(2.2, 3.4)).add(new V(rnd(-0.3, 0.3), rnd(-0.1, 0.3), rnd(-0.3, 0.3))), { color: 0xeef4f6, s0: 0.08, s1: 0.75, life: rnd(0.9, 1.5), a: 0.85 * Math.min(1, j.t / 1.5) }); }
      if (j.t <= 0) this.jets.splice(i, 1);
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i]; s.t -= dt; s.acc += dt;
      while (s.acc > 0.16) { s.acc -= 0.16; this.puffs.emit(s.at, new V(rnd(-0.08, 0.08), rnd(0.25, 0.45), rnd(-0.08, 0.08)), { color: 0x2a2624, s0: 0.12, s1: 0.7, life: rnd(2.2, 3.4), a: 0.7 * Math.min(1, s.t / 3) }); }
      if (s.t <= 0) this.smoke.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t -= dt; f.l.intensity = f.k * Math.max(0, f.t / 0.6) * (0.7 + Math.random() * 0.3); if (f.t <= 0) { f.l.removeFromParent(); this.flashes.splice(i, 1); } }
    if (this.lampLoose) { const L = this.R.lamp.light; L.intensity = Math.sin(t * 23) > 0.7 || Math.sin(t * 3.1) > 0.92 ? 0.3 : 2.6; }
    this.puffs.update(dt); this.fire.update(dt);
  }
  /** a failure that has not happened yet (panels and pipes can go more than once) */
  pick(): BreakKind | null {
    const R = this.R, can: BreakKind[] = [];
    if (R.panels.some((p) => !p.done)) can.push('panel', 'panel');
    if (!R.console.done) can.push('console');
    if (R.pipes.some((p) => !p.done)) can.push('pipe');
    if (!R.lamp.done) can.push('lamp');
    return can.length ? can[Math.floor(Math.random() * can.length)] : null;
  }
  trigger(kind: BreakKind): boolean {
    const R = this.R, phys = R.phys;
    if (kind === 'panel') {
      const p = R.panels.find((q) => !q.done); if (!p) return false; p.done = true;
      const at = R.root.worldToLocal(p.obj.getWorldPosition(new V()));
      const body = rigidFor(p.obj, R.root, { mass: 1.6 }); if (!body) return false;
      phys.add(body);
      const v = p.n.clone().multiplyScalar(rnd(2.4, 3.4)).add(new V(rnd(-0.6, 0.6), rnd(1.2, 2.2), rnd(-0.6, 0.6)));
      body.kick(v, 1 / 60, (i) => 1 + (i & 1 ? 0.5 : -0.4) + (i & 2 ? 0.3 : -0.2));
      R.sparks(at, 18); this.flash(at, 0x9ad8ff, 4);
      for (let k = 0; k < 4; k++) this.puffs.emit(at, p.n.clone().multiplyScalar(rnd(0.3, 0.8)), { color: 0x3a3430, s0: 0.1, s1: 0.45, life: rnd(1.2, 2), a: 0.6 });
      uiSfx('metal', 0.8, rnd(0.9, 1.1)); uiSfx('clunk', 0.6);
      R.shake(0.04);
      return true;
    }
    if (kind === 'console') {
      const c = R.console; if (c.done) return false; c.done = true;
      const at = c.at.clone();
      // the live screen goes dark and is thrown out of its bezel
      c.screen.color.setRGB(0.04, 0.05, 0.05); c.screen.needsUpdate = true;
      const sb = rigidFor(c.screenMesh, R.root, { mass: 0.8 }); if (sb) { phys.add(sb); sb.kick(c.n.clone().multiplyScalar(2.6).add(new V(0, 2.2, 0)), 1 / 60, (i) => 1 + (i & 1 ? 0.4 : -0.3)); }
      // fragments of its casing, keys and glass, a few still glowing hot
      const mats = [matMaterial('enamel_olive', { hd: 2 }), matMaterial('metal_machined', { hd: 2 }), matMaterial('glass_dark', { hd: 2 }), matMaterial('rubber_seal', { hd: 2 }), matMaterial('metal_dark', { hd: 2, emissive: 0xff5a18, emissiveIntensity: 0.9 })];
      for (let k = 0; k < 16; k++) {
        const s = rnd(0.06, 0.2), m = new THREE.Mesh(new THREE.BoxGeometry(s, rnd(0.015, 0.05), s * rnd(0.5, 1.2)), mats[k % mats.length]);
        m.position.copy(at).add(new V(rnd(-0.25, 0.25), rnd(-0.1, 0.15), rnd(-0.05, 0.05))); m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
        m.castShadow = m.receiveShadow = true; m.userData.noBlur = true; R.root.add(m);
        const b = rigidFor(m, R.root, { mass: rnd(0.08, 0.4) }); if (!b) continue; phys.add(b);
        const dir = c.n.clone().multiplyScalar(rnd(1.5, 4.2)).add(new V(rnd(-2, 2), rnd(1.2, 3.6), rnd(-1.4, 1.4)));
        b.kick(dir, 1 / 60, (i) => 1 + (i & 1 ? 0.6 : -0.5) + (i & 4 ? 0.3 : -0.3));
      }
      phys.impulse(at, 1.8, 2.6, 0.5);
      R.sparks(at, 48); this.flash(at, 0xffa050, 14);
      // the fireball: a quick additive bloom of flame, then the smoke rolling out of it
      for (let k = 0; k < 12; k++) this.fire.emit(at.clone().add(new V(rnd(-0.12, 0.12), rnd(-0.06, 0.12), rnd(-0.05, 0.08))), c.n.clone().multiplyScalar(rnd(1.2, 3)).add(new V(rnd(-1.4, 1.4), rnd(0.2, 1.6), rnd(-1.2, 1.2))), { color: k % 3 ? 0xffa040 : 0xffe0a0, s0: 0.25, s1: rnd(0.7, 1.2), life: rnd(0.35, 0.7), a: 1 });
      for (let k = 0; k < 18; k++) this.puffs.emit(at.clone().add(new V(rnd(-0.15, 0.15), rnd(-0.05, 0.1), 0)), c.n.clone().multiplyScalar(rnd(0.4, 1.6)).add(new V(rnd(-0.7, 0.7), rnd(0.2, 1.1), rnd(-0.7, 0.7))), { color: k % 3 ? 0x5a4c40 : 0x8a7a68, s0: 0.2, s1: rnd(0.8, 1.4), life: rnd(1.8, 3.2), a: 0.9 });
      this.smoke.push({ at: at.clone().add(new V(0, 0.1, 0)), t: 9, acc: 0 });
      uiSfx('thudHeavy', 1, 0.8); uiSfx('glass', 0.8); uiSfx('metal', 0.7, 0.8);
      R.shake(0.12);
      return true;
    }
    if (kind === 'pipe') {
      const p = R.pipes.find((q) => !q.done); if (!p) return false; p.done = true;
      this.jets.push({ at: p.at.clone(), dir: p.dir.clone(), t: 7, acc: 0 });
      phys.winds.push({ p: p.at.clone(), dir: p.dir.clone(), r: 0.9, k: 70, gust: 0.7, ttl: 7 });
      phys.wakeNear(p.at, 3);
      // a split clamp flies off the pipe
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), matMaterial('metal_dark', { hd: 2 }));
      m.position.copy(p.at); m.castShadow = true; m.userData.noBlur = true; R.root.add(m);
      const b = rigidFor(m, R.root, { mass: 0.3 }); if (b) { phys.add(b); b.kick(p.dir.clone().multiplyScalar(3).add(new V(0, 1.5, 0)), 1 / 60, (i) => 1 + (i & 1 ? 0.5 : -0.5)); }
      R.sparks(p.at, 6);
      uiSfx('scratch', 0.8, 0.6); uiSfx('swishIn', 0.7, 0.5); uiSfx('metal', 0.5, 1.3);
      R.shake(0.03);
      return true;
    }
    if (kind === 'lamp') {
      const L = R.lamp; if (L.done) return false; L.done = true;
      const end = R.root.worldToLocal(L.obj.getWorldPosition(new V()));
      R.root.attach(L.obj);
      const pts: THREE.Vector3[] = []; for (let i = 0; i <= 9; i++) pts.push(L.mount.clone().lerp(end, i / 9));
      // a cable longer than the gap: the lamp drops until it snaps taut, then swings
      const rope = new Rope(pts, 0.009, matMaterial('ix_cable', { hd: 2, uv: 'uv', repeat: [1, 8] }), { endMass: 2.5, seg: 0.11 });
      rope.endObj = L.obj; rope.endUp.set(0, 1, 0);
      phys.add(rope);
      rope.kick(new V(rnd(-1, 1), 0.4, rnd(0.6, 1.4)), 1 / 60, (i) => i / rope.n);
      this.lampLoose = true;
      R.sparks(L.mount, 12);
      uiSfx('clunk', 0.7); uiSfx('chain', 0.8); uiSfx('creak', 0.5);
      return true;
    }
    return false;
  }
  private flash(at: THREE.Vector3, col: number, k: number) { const l = new THREE.PointLight(col, k, 5, 1.6); l.position.copy(at); this.R.root.add(l); this.flashes.push({ l, t: 0.6, k }); }
  dispose() { this.puffs.dispose(); this.fire.dispose(); for (const f of this.flashes) f.l.removeFromParent(); }
}
void Cluster;
