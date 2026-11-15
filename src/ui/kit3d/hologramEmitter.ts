// kit3d hologram emitter: a floor-standing projector. A machined plinth, a concave dish with a glowing lens, copper
// coils round the core, three projector arms aimed at the focus, bolts and feed cables; above it a light shaft with
// drifting motes and a ring of light on the dish. Holograms are placed in `stage` (it lives in the FX scene).
//   const e = hologramEmitter({ r: 0.8 }); scene.add(e.base); fxScene.add(e.fx); e.stage.add(holo)
import * as THREE from 'three';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import { mat32, solid, worldUV, K3 } from './tex';
import { lightPillar, lightDust } from './holo';

export interface Emitter { base: THREE.Group; fx: THREE.Group; stage: THREE.Group; t: { value: number }; light: THREE.PointLight; color: THREE.Color; top: number; update(dt: number): void; surge(): void }

export function hologramEmitter(o: { r?: number; color?: number; shaft?: number } = {}): Emitter {
  const r = o.r ?? 0.8, color = new THREE.Color(o.color ?? K3.cyan), t = { value: 0 };
  const base = new THREE.Group(), fx = new THREE.Group(), stage = new THREE.Group();
  const panel = mat32(0x3b434a, 'panel'), gun = mat32(K3.gun, 'painted'), steel = mat32(K3.steel, 'brushed'), copper = mat32(0xb4683a, 'brushed'), dark = mat32(0x15181b, 'painted');
  const add = (m: THREE.Mesh, at: [number, number, number]) => { m.position.set(...at); m.castShadow = m.receiveShadow = true; base.add(m); return m; };
  // the plinth: a stepped ring with vents, a grated top
  add(new THREE.Mesh(worldUV(new THREE.CylinderGeometry(r * 1.32, r * 1.4, 0.12, 40)), gun), [0, 0.06, 0]);
  add(new THREE.Mesh(worldUV(new THREE.CylinderGeometry(r * 1.2, r * 1.26, 0.14, 40)), panel), [0, 0.19, 0]);
  add(new THREE.Mesh(worldUV(new THREE.CylinderGeometry(r * 1.205, r * 1.205, 0.05, 40, 1, true)), mat32(0x252b31, 'grille')), [0, 0.18, 0]);
  // the dish: a concave lathe in brushed steel
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const u = i / 10; prof.push(new THREE.Vector2(r * (0.25 + u * 0.9), 0.27 + u * u * 0.16)); }
  prof.push(new THREE.Vector2(r * 1.17, 0.45), new THREE.Vector2(r * 1.17, 0.4), new THREE.Vector2(r * 1.12, 0.27));
  add(new THREE.Mesh(worldUV(new THREE.LatheGeometry(prof, 48)), steel), [0, 0, 0]).material = steel;
  // the rim ring of light on the dish lip
  const rimM = gbuf(new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6) }), F_EMIT);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.15, 0.012, 6, 64), rimM); rim.rotation.x = Math.PI / 2; rim.position.y = 0.452; base.add(rim);
  // the core: a dark collar, copper coils, the lens
  add(new THREE.Mesh(worldUV(new THREE.CylinderGeometry(r * 0.27, r * 0.3, 0.14, 24)), dark), [0, 0.32, 0]);
  for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.TorusGeometry(r * (0.29 + k * 0.012), 0.014, 6, 32), copper); c.rotation.x = Math.PI / 2; c.position.y = 0.3 + k * 0.03; c.castShadow = true; base.add(c); }
  const lensM = gbuf(new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2) }), F_EMIT);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lensM); lens.position.y = 0.39; base.add(lens);
  // three projector arms, raked toward the focus
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6, arm = new THREE.Group(); arm.position.set(Math.cos(a) * r * 1.02, 0.44, Math.sin(a) * r * 1.02); arm.rotation.y = -a; base.add(arm);
    const post = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.06, 0.32, 0.07)), gun); post.position.y = 0.14; post.rotation.z = 0.35; post.castShadow = true; arm.add(post);
    const head = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.1, 0.07, 0.09)), steel); head.position.set(-0.07, 0.3, 0); head.rotation.z = 0.7; head.castShadow = true; arm.add(head);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 10), lensM); tip.rotation.z = Math.PI / 2 + 0.7; tip.position.set(-0.115, 0.27, 0); arm.add(tip);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6), solid(0xc0c8cc)); b.position.set(0.02, 0.02, 0.04); arm.add(b);
  }
  // bolts round the plinth
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.012, 6), solid(0xaab2b6)); b.position.set(Math.cos(a) * r * 1.3, 0.125, Math.sin(a) * r * 1.3); base.add(b); }
  // the light: a shaft from the lens, motes in it, a soft lamp on the room
  const top = o.shaft ?? 2.6;
  const shaft = lightPillar(r * 0.16, r * 0.95, top, color.getHex(), t, 0.16); shaft.mesh.position.y = 0.4; fx.add(shaft.mesh);
  const inner = lightPillar(r * 0.08, r * 0.3, top * 0.7, 0xffffff, t, 0.1); inner.mesh.position.y = 0.4; fx.add(inner.mesh);
  const dust = lightDust(220, r * 0.9, top, color.getHex(), t); dust.position.y = 0.4; fx.add(dust);
  stage.position.y = 0.55; fx.add(stage);
  const light = new THREE.PointLight(color.getHex(), 6, 6, 1.6); light.position.set(0, 0.9, 0); base.add(light);
  let surge = 0;
  return {
    base, fx, stage, t, light, color, top,
    update(dt) {
      t.value += dt; surge = Math.max(0, surge - dt * 1.6);
      const f = 0.92 + 0.08 * Math.sin(t.value * 23) * Math.sin(t.value * 5.1) + surge * 0.8;
      shaft.u.uK.value = 0.16 * f; inner.u.uK.value = 0.1 * f + surge * 0.3; light.intensity = 6 * f;
      rimM.color.copy(color).multiplyScalar(1.4 + 0.3 * Math.sin(t.value * 2) + surge);
    },
    surge() { surge = 1; },
  };
}
