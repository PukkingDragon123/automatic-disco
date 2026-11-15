// kit3d console desk: a curved control desk that wraps round the operator (its local origin is where the operator
// stands; the desk arcs out in front, along -z). A slanted work surface rising away from the operator, a rubber
// arm-rest edge, a fascia with vent grilles and a kick recess, a back lip with a brass trim where screens mount,
// machined end cheeks, panel seams, and cable bundles that run off the back to the floor. All 32 px/m textures.
//   const d = consoleDesk({ span: 1.9 }); scene.add(d.group);
//   d.place(angle, r01, lift) -> an Object3D on the work surface (x along the desk, y the surface normal, z toward
//   the operator); d.riser(angle) -> an Object3D on the back lip, facing the operator (for glassScreen)
import * as THREE from 'three';
import { mat32, solid, worldUV, K3 } from './tex';

export interface DeskOpts { span?: number; r0?: number; r1?: number; h0?: number; h1?: number; color?: number; cables?: number }
export interface Desk { group: THREE.Group; place(a: number, r01: number, lift?: number): THREE.Object3D; riser(a: number, tilt?: number): THREE.Object3D; r0: number; r1: number; h0: number; h1: number; span: number }

const out = (a: number) => new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
/** a curved strip between (rA, yA) and (rB, yB) from angle a0 to a1 */
function strip(rA: number, yA: number, rB: number, yB: number, a0: number, a1: number, n: number) {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n), d = out(a);
    pos.push(d.x * rA, yA, d.z * rA, d.x * rB, yB, d.z * rB);
    if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function mk(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, flip = false) {
  if (flip) { const ix = g.getIndex()!; const a = ix.array as unknown as number[]; for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; } ix.needsUpdate = true; g.computeVertexNormals(); }
  const me = new THREE.Mesh(worldUV(g), m); me.castShadow = me.receiveShadow = true; parent.add(me); return me;
}

export function consoleDesk(o: DeskOpts = {}): Desk {
  const span = o.span ?? 1.9, r0 = o.r0 ?? 0.78, r1 = o.r1 ?? 1.55, h0 = o.h0 ?? 0.9, h1 = o.h1 ?? 1.03, a0 = -span / 2, a1 = span / 2, N = 40;
  const g = new THREE.Group();
  const top = mat32(o.color ?? K3.desk, 'panel'), body = mat32(K3.gun, 'painted'), dark = mat32(0x1d2126, 'painted'), grille = mat32(0x2a3036, 'grille');
  const steel = mat32(K3.steel, 'brushed'), rubber = mat32(K3.rubber, 'rubber'), brass = mat32(K3.brass, 'brushed');
  // the work surface, slanted up and away
  mk(strip(r0 + 0.07, h0, r1 - 0.05, h1, a0, a1, N), top, g, true);
  // the arm-rest: a rubber roll along the operator's edge
  const pts: THREE.Vector3[] = []; for (let i = 0; i <= N; i++) { const d = out(a0 + (a1 - a0) * (i / N)); pts.push(new THREE.Vector3(d.x * (r0 + 0.04), h0 - 0.01, d.z * (r0 + 0.04))); }
  const rest = new THREE.Mesh(worldUV(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, 0.05, 8)), rubber); rest.castShadow = rest.receiveShadow = true; g.add(rest);
  // the fascia: upper panel, a vent band, the kick recess and its shelf
  mk(strip(r0, h0 - 0.05, r0, 0.62, a0, a1, N), body, g);
  mk(strip(r0 + 0.005, 0.6, r0 + 0.005, 0.44, a0, a1, N), grille, g);
  mk(strip(r0, 0.44, r0, 0.36, a0, a1, N), body, g);
  mk(strip(r0, 0.36, r0 + 0.2, 0.36, a0, a1, N), dark, g, true);
  mk(strip(r0 + 0.2, 0.36, r0 + 0.2, 0.0, a0, a1, N), dark, g);
  // the back lip with a brass trim, and the back panel
  mk(strip(r1 - 0.05, h1, r1 - 0.05, h1 + 0.09, a0, a1, N), body, g, true);
  mk(strip(r1 - 0.05, h1 + 0.09, r1 + 0.03, h1 + 0.09, a0, a1, N), steel, g, true);
  mk(strip(r1 + 0.03, h1 + 0.09, r1 + 0.03, h1 + 0.065, a0, a1, N), brass, g, true);
  mk(strip(r1 + 0.03, h1 + 0.065, r1 + 0.03, 0.0, a0, a1, N), body, g, true);
  // panel seams across the work surface
  for (let k = 1; k < 8; k++) {
    const a = a0 + (a1 - a0) * (k / 8), d = out(a), rm = (r0 + r1) / 2 + 0.01;
    const s = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.012, 0.012, r1 - r0 - 0.12)), solid(0x14171a));
    s.position.set(d.x * rm, (h0 + h1) / 2 + 0.004, d.z * rm); s.rotation.order = 'YXZ'; s.rotation.y = -a; s.rotation.x = Math.atan2(h1 - h0, r1 - r0); g.add(s);
  }
  // machined end cheeks
  const prof = new THREE.Shape([new THREE.Vector2(r0 + 0.2, 0), new THREE.Vector2(r1 + 0.05, 0), new THREE.Vector2(r1 + 0.05, h1 + 0.1), new THREE.Vector2(r0 - 0.02, h0 + 0.03), new THREE.Vector2(r0 - 0.02, 0.36), new THREE.Vector2(r0 + 0.2, 0.36)]);
  for (const [a, s] of [[a0, -1], [a1, 1]] as const) {
    const eg = new THREE.ExtrudeGeometry(prof, { depth: 0.05, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 });
    // the shape lies in (x = radius, y = height); turn it so x runs outward at angle a
    const me = new THREE.Mesh(worldUV(eg), body); me.castShadow = me.receiveShadow = true;
    const holder = new THREE.Group(); holder.rotation.y = -a + Math.PI / 2; me.rotation.y = 0; me.position.z = s > 0 ? -0.05 : 0;
    // the extrusion's x axis is the outward direction once the holder turns: outward at angle a is (sin a, 0, -cos a)
    holder.add(me); g.add(holder);
    // bolts on the cheek
    for (const [rr, yy] of [[r0 + 0.1, 0.2], [r1 - 0.05, 0.2], [r1 - 0.05, h1 - 0.1], [r0 + 0.05, h0 - 0.12]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 6), solid(0xb8c0c4)); b.rotation.x = Math.PI / 2;
      b.position.set(rr, yy, s > 0 ? 0.016 : -0.016); holder.add(b);
    }
  }
  // cable bundles off the back, down to the floor and away toward the room's centre
  const cmats = [rubber, mat32(0x8a2a22, 'rubber'), mat32(0xb08a28, 'rubber'), rubber];
  for (let k = 0; k < (o.cables ?? 4); k++) {
    const a = a0 + 0.25 + (span - 0.5) * (k / Math.max(1, (o.cables ?? 4) - 1)), d = out(a), r = r1 + 0.05;
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(d.x * (r - 0.04), h1 - 0.15, d.z * (r - 0.04)), new THREE.Vector3(d.x * (r + 0.12), h1 - 0.35, d.z * (r + 0.12)),
      new THREE.Vector3(d.x * (r + 0.22), 0.05, d.z * (r + 0.22)), new THREE.Vector3(d.x * (r + 0.9 + k * 0.1), 0.035, d.z * (r + 0.9 + k * 0.1)),
    ]);
    const cm = new THREE.Mesh(worldUV(new THREE.TubeGeometry(c, 24, 0.022 + (k % 2) * 0.01, 6)), cmats[k % cmats.length]); cm.castShadow = cm.receiveShadow = true; g.add(cm);
  }
  const tilt = Math.atan2(h1 - h0, r1 - r0);
  const place = (a: number, r01: number, lift = 0) => {
    const d = out(a), r = r0 + 0.07 + (r1 - 0.05 - r0 - 0.07) * r01, y = h0 + (h1 - h0) * r01;
    const t = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), n = new THREE.Vector3(0, Math.cos(tilt), 0).addScaledVector(d, -Math.sin(tilt)).normalize();
    const b = new THREE.Vector3().crossVectors(t, n).normalize();
    const ob = new THREE.Object3D(); ob.position.set(d.x * r, y, d.z * r).addScaledVector(n, lift);
    ob.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t, n, b)); g.add(ob); return ob;
  };
  const riser = (a: number, back = 0.22) => {
    const d = out(a), r = r1 - 0.02;
    const ob = new THREE.Object3D(); ob.position.set(d.x * r, h1 + 0.09, d.z * r);
    ob.rotation.order = 'YXZ'; ob.rotation.y = -a; ob.rotation.x = -back; g.add(ob); return ob;
  };
  return { group: g, place, riser, r0, r1, h0, h1, span };
}
