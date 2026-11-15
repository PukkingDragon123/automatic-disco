// The hull breach for the intro (the apple goes through the lab's starboard hull): the plate bursts outward in
// torn petals round a ragged hole onto stars, sparks spit from the torn edges, loose air streams out through it,
// the alarm strobes; then a patch plate is swung over the hole and welded (patch k: 0..1), and done() seals it.
import * as THREE from 'three';
import type { ShipHub } from './hub';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import { csfx } from '../../ui/cineAudio';

export interface Breach { pos: THREE.Vector3; normal: THREE.Vector3; patch(k: number): void; done(): void }

export function breachFx(hub: ShipHub): Breach {
  const ref = hub.interior.rooms.lab.ctx.refs.breach as { pos: THREE.Vector3; normal: THREE.Vector3 };
  const pos = ref.pos.clone(), n = ref.normal.clone();
  const g = new THREE.Group(); g.position.copy(pos); g.lookAt(pos.clone().add(n)); hub.scene.add(g);
  const own: (THREE.BufferGeometry | THREE.Material)[] = [];
  const M = (m: THREE.Material) => { own.push(m); return m; };
  const G = <T extends THREE.BufferGeometry>(x: T) => { own.push(x); return x; };
  // the hole: a ragged disc of deep space, slightly recessed
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = 0.16 * (0.75 + ((i * 37) % 7) / 14); pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)); }
  const hole = new THREE.Mesh(G(new THREE.ShapeGeometry(new THREE.Shape(pts))), M(gbuf(new THREE.MeshBasicMaterial({ color: 0x020308 }), F_EMIT)));
  hole.position.z = 0.012; g.add(hole);
  // torn petals bent outward (away from the room)
  const petalM = M(gbuf(new THREE.MeshStandardMaterial({ color: 0x9aa4a0, roughness: 0.4, metalness: 0.7, side: THREE.DoubleSide }), 1));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, p = new THREE.Mesh(G(new THREE.ConeGeometry(0.06, 0.16, 3)), petalM);
    p.position.set(Math.cos(a) * 0.16, Math.sin(a) * 0.16, -0.03); p.rotation.set(Math.PI / 2 + 0.6, 0, a - Math.PI / 2); g.add(p);
  }
  // sparks and venting air: two point clouds
  const N = 60, sp = new Float32Array(N * 3), sv = new Float32Array(N * 3), age = new Float32Array(N);
  const sg = G(new THREE.BufferGeometry()); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const sparkM = M(gbuf(new THREE.PointsMaterial({ color: new THREE.Color(0xffc070).multiplyScalar(3), size: 0.035, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0));
  const sparks = new THREE.Points(sg, sparkM); sparks.frustumCulled = false; hub.scene.add(sparks);
  const A = 90, ap = new Float32Array(A * 3), aa = new Float32Array(A);
  const ag = G(new THREE.BufferGeometry()); ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
  const airM = M(gbuf(new THREE.PointsMaterial({ color: 0xd8e8f0, size: 0.03, transparent: true, opacity: 0.55, depthWrite: false }), 0));
  const air = new THREE.Points(ag, airM); air.frustumCulled = false; hub.scene.add(air);
  for (let i = 0; i < N; i++) age[i] = Math.random() * 2;
  for (let i = 0; i < A; i++) aa[i] = Math.random();
  // the patch plate: swings in, the weld bead glows then cools
  const patch = new THREE.Mesh(G(new THREE.BoxGeometry(0.62, 0.62, 0.03)), M(gbuf(new THREE.MeshStandardMaterial({ color: 0x7a8480, roughness: 0.5, metalness: 0.6 }), 1)));
  patch.position.z = 0.03; patch.visible = false; g.add(patch);
  const weldM = gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(3) }), F_EMIT); own.push(weldM);
  const weld = new THREE.Mesh(G(new THREE.TorusGeometry(0.3, 0.012, 4, 4, Math.PI * 2)), weldM); weld.rotation.z = Math.PI / 4; weld.scale.set(1.4, 1.4, 1); weld.position.z = 0.046; weld.visible = false; g.add(weld);
  let venting = 1, pk = 0, sealed = false;
  hub.alarm(true); csfx('impact', 1); csfx('klaxon', 0.6);
  const w = new THREE.Vector3(), out = n.clone().negate();
  const off = hub.onUpdate((dt, t) => {
    for (let i = 0; i < N; i++) {
      age[i] += dt;
      if (age[i] > 0.6 + Math.random() * 0.4) {
        age[i] = 0;
        const a = Math.random() * Math.PI * 2;
        w.set(Math.cos(a) * 0.16, Math.sin(a) * 0.16, 0).applyQuaternion(g.quaternion).add(pos);
        sp[i * 3] = w.x; sp[i * 3 + 1] = w.y; sp[i * 3 + 2] = w.z;
        const v = n.clone().multiplyScalar(0.6 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6));
        sv[i * 3] = v.x; sv[i * 3 + 1] = v.y; sv[i * 3 + 2] = v.z;
      }
      sv[i * 3 + 1] -= 6 * dt;
      sp[i * 3] += sv[i * 3] * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += sv[i * 3 + 2] * dt;
    }
    sg.attributes.position.needsUpdate = true;
    sparkM.opacity = venting > 0 ? 1 : Math.max(0, sparkM.opacity - dt);
    // air drawn from the room toward the hole and out
    for (let i = 0; i < A; i++) {
      aa[i] += dt * 0.7 * (0.5 + venting);
      if (aa[i] > 1) aa[i] -= 1;
      const u = aa[i], a = i * 2.39, r = (1 - u) * 1.6;
      w.set(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.4, 0).applyQuaternion(g.quaternion).add(pos).addScaledVector(n, (1 - u) * 2.2).addScaledVector(out, u * 0.4);
      ap[i * 3] = w.x; ap[i * 3 + 1] = w.y; ap[i * 3 + 2] = w.z;
    }
    ag.attributes.position.needsUpdate = true;
    airM.opacity = 0.55 * venting;
    weldM.color.setHex(0xffa040).multiplyScalar(3 * Math.max(0, 1 - Math.abs(pk - 0.7) * 3) * (0.8 + Math.sin(t * 40) * 0.2));
    void t;
  });
  const b: Breach = {
    pos, normal: n,
    patch(k: number) {
      pk = k; patch.visible = k > 0; weld.visible = k > 0.4;
      patch.scale.setScalar(Math.min(1, 0.6 + k * 0.6)); patch.rotation.z = (1 - Math.min(1, k * 2)) * 0.6;
      venting = Math.max(0, 1 - k * 1.6);
    },
    done() {
      if (sealed) return; sealed = true;
      venting = 0; hub.alarm(false); off();
      sparks.removeFromParent(); air.removeFromParent();
      hole.visible = false; patch.visible = true; patch.scale.setScalar(1); patch.rotation.z = 0; weld.visible = false;
      hub.onUpdate(() => {}); // keep the patch where it is (the group stays in the scene)
    },
  };
  return b;
}
