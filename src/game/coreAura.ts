// The asteroid heart is a gravity well: its fissures burn and pulse, it lights the ground around it, rubble hangs
// in tilted orbits about it, a lens ring ripples on the ground, and motes of light spiral down into it. All of it
// swells with the field level and flares when the child pulls.
import * as THREE from 'three';
import type { Fx } from './fx';
import type { Building } from './buildings';
import { gbuf } from '../gfx/gbuf';
import { hash01 } from '../core/rand';

const N = 34;
export class CoreAura {
  readonly group = new THREE.Group();
  private rocks: THREE.InstancedMesh;
  private orbit: { r: number; y: number; a: number; sp: number; tilt: number; phase: number; s: number; rx: number; ry: number }[] = [];
  private light: THREE.PointLight;
  private lens: THREE.Mesh;
  private t = 0; private flare = 0;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private sc = new THREE.Vector3();
  constructor(readonly core: Building, readonly fx: Fx, readonly col: number) {
    const g = new THREE.IcosahedronGeometry(1, 0);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const k = 0.75 + hash01(Math.round(p.getX(i) * 9), Math.round(p.getY(i) * 9), Math.round(p.getZ(i) * 9)) * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); }
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a3442, flatShading: true, emissive: new THREE.Color(col), emissiveIntensity: 0.08 }); gbuf(mat, 1);
    this.rocks = new THREE.InstancedMesh(g, mat, N);
    this.rocks.castShadow = true;
    for (let i = 0; i < N; i++) this.orbit.push({ r: 1.3 + hash01(i, 1) * 1.5, y: 0.35 + hash01(i, 2) * 1.5, a: hash01(i, 3) * Math.PI * 2, sp: (0.12 + hash01(i, 4) * 0.2) * (hash01(i, 5) < 0.2 ? -1 : 1), tilt: (hash01(i, 6) - 0.5) * 0.7, phase: hash01(i, 7) * 6, s: 0.04 + hash01(i, 8) ** 2 * 0.12, rx: hash01(i, 9) * 3, ry: hash01(i, 10) * 3 });
    this.light = new THREE.PointLight(col, 0, 16, 1.6);
    this.light.position.set(core.x, core.y + 1.5, core.z);
    const lm = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.2), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }); gbuf(lm, 0);
    this.lens = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.78, 64), lm);
    this.lens.rotation.x = -Math.PI / 2; this.lens.position.set(core.x, core.y + 0.2, core.z);
    this.group.add(this.rocks, this.light, this.lens);
    core.U.uGlowMul.value = 2.2;
  }
  /** a pull: the well flares */
  pulse(k = 1) { this.flare = Math.max(this.flare, k); }
  update(dt: number, level: number) {
    this.t += dt; this.flare = Math.max(0, this.flare - dt * 1.4);
    const t = this.t, c = this.core, L = 0.6 + Math.min(6, level) * 0.12, f = this.flare;
    const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 1.3), 3);
    c.U.uGlowMul.value = 1.8 + beat * 1.2 + f * 2.5;
    this.light.intensity = (3 + beat * 2 + f * 8) * L;
    this.light.distance = 7 + L * 4;
    for (let i = 0; i < N; i++) {
      const o = this.orbit[i];
      o.a += dt * o.sp * (1 + f * 2.5);
      const r = o.r * (0.85 + L * 0.2) * (1 - f * 0.12);
      this.v.set(Math.cos(o.a) * r, o.y + Math.sin(o.a + o.phase) * o.tilt * r * 0.4 + Math.sin(t * 0.8 + o.phase) * 0.08 + f * 0.3, Math.sin(o.a) * r).add(new THREE.Vector3(c.x, c.y, c.z));
      this.q.setFromEuler(this.e.set(o.rx + t * 0.3 * o.sp * 4, o.ry + t * 0.25, 0));
      this.m.compose(this.v, this.q, this.sc.setScalar(o.s * (i < 10 + level * 4 ? 1 : 0)));
      this.rocks.setMatrixAt(i, this.m);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    (this.rocks.material as THREE.MeshLambertMaterial).emissiveIntensity = 0.08 + f * 0.6;
    const lr = 1 + ((t * 0.35) % 1) * 0.6;
    this.lens.scale.setScalar(lr * (0.85 + L * 0.2));
    (this.lens.material as THREE.MeshBasicMaterial).opacity = 0.32 * (1 - ((t * 0.35) % 1)) + f * 0.3;
    // motes of light spiralling down into the well
    if (Math.random() < dt * (6 + f * 30)) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3, y = c.y + 0.3 + Math.random() * 2;
      const sx = c.x + Math.cos(a) * r, sz = c.z + Math.sin(a) * r;
      this.fx.mote(sx, y, sz, c.x, c.y + 0.9, c.z, this.col, 2 + Math.random() * 2);
    }
  }
  dispose() { this.group.removeFromParent(); this.rocks.geometry.dispose(); }
}
