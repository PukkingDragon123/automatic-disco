// kit3d rotary selector: a knurled knob on an engraved dial plate with a lit position lamp per detent. set(i) turns
// it with a mechanical overshoot and settle; the lamp of the chosen position lights.
//   const k = rotaryKnob({ labels: ['PLANT', 'BIO', ...] }); anchor.add(k.group); k.set(2)
import * as THREE from 'three';
import { gbuf, F_EMIT } from '../../gfx/gbuf';
import { mat32, solid, worldUV, canvasTex, K3 } from './tex';

export interface RotaryKnob { group: THREE.Group; hit: THREE.Mesh; value: number; set(i: number): void; update(dt: number): void; angleOf(i: number): number }

export function rotaryKnob(o: { r?: number; labels: string[]; arc?: number; lit?: number }): RotaryKnob {
  const r = o.r ?? 0.055, n = o.labels.length, arc = o.arc ?? Math.PI * 1.25, R = r * 2.4;
  const group = new THREE.Group();
  const angleOf = (i: number) => (n > 1 ? -arc / 2 + arc * (i / (n - 1)) : 0);
  // the dial plate with its engraved labels
  const plate = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(R, R * 1.04, 0.012, 48)), mat32(0x23282d, 'brushed')); plate.position.y = 0.006; plate.receiveShadow = true; group.add(plate);
  const S = 256, { g, tex } = canvasTex(S, S);
  g.clearRect(0, 0, S, S); g.font = "11px 'Body', monospace"; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const a = angleOf(i), x = S / 2 + Math.sin(a) * S * 0.39, y = S / 2 - Math.cos(a) * S * 0.39;
    g.fillStyle = '#c9d2d6'; g.fillText(o.labels[i], Math.round(x), Math.round(y));
    const tx = S / 2 + Math.sin(a) * S * 0.29, ty = S / 2 - Math.cos(a) * S * 0.29; g.fillStyle = '#8a949a'; g.fillRect(Math.round(tx) - 1, Math.round(ty) - 1, 3, 3);
  }
  tex.needsUpdate = true;
  const face = new THREE.Mesh(new THREE.CircleGeometry(R * 1.02, 48), gbuf(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }), 0));
  face.rotation.x = -Math.PI / 2; face.position.y = 0.0125; group.add(face);
  // the position lamps
  const off = solid(0x30363b), lamps: THREE.Mesh[] = [];
  const onM = gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(o.lit ?? K3.amber).multiplyScalar(2) }), F_EMIT);
  for (let i = 0; i < n; i++) {
    const a = angleOf(i), l = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.006, 0.01), off);
    l.position.set(Math.sin(a) * R * 0.62, 0.015, -Math.cos(a) * R * 0.62); group.add(l); lamps.push(l);
  }
  // the knob: a knurled skirt, a brushed cap, a lit pointer
  const knob = new THREE.Group(); knob.position.y = 0.012; group.add(knob);
  const skirt = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(r, r * 1.08, 0.05, 32)), mat32(0x1c1f23, 'rubber')); skirt.position.y = 0.025; skirt.castShadow = true; knob.add(skirt);
  for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2, b = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.044, 0.006), solid(0x2a2f34)); b.position.set(Math.cos(a) * r * 1.02, 0.025, Math.sin(a) * r * 1.02); b.rotation.y = -a; knob.add(b); }
  const capM = mat32(K3.steel, 'brushed');
  const cap = new THREE.Mesh(worldUV(new THREE.CylinderGeometry(r * 0.86, r * 0.9, 0.012, 32)), capM); cap.position.y = 0.056; cap.castShadow = true; knob.add(cap);
  const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, r * 0.8), onM); ptr.position.set(0, 0.063, -r * 0.42); knob.add(ptr);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.08, 16), new THREE.MeshBasicMaterial()); hit.position.y = 0.04; hit.visible = false; group.add(hit);
  let ang = angleOf(0), vel = 0, target = ang;
  const k: RotaryKnob = {
    group, hit, value: 0, angleOf,
    set(i) { i = Math.max(0, Math.min(n - 1, i)); k.value = i; target = angleOf(i); lamps.forEach((l, j) => (l.material = j === i ? onM : off)); },
    update(dt) {
      // a damped spring: it overshoots a little and settles into the detent
      vel += ((target - ang) * 160 - vel * 16) * Math.min(dt, 1 / 30); ang += vel * Math.min(dt, 1 / 30);
      knob.rotation.y = -ang;
    },
  };
  k.set(0); ang = target;
  return k;
}
