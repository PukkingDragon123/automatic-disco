// TEO'S CAMP: six years of living beside the wreck of the UNAA Pathfinder's cargo pod. A lean-to of patched canvas
// over salvaged hull plate, a ring of stones round a fire with an enamel pot on a tripod, a bedroll, crates and cans,
// his dead radio on an ammo box, a rain still made of a jerrycan and a funnel, and the half-buried, rust-streaked
// cargo pod section with its faded UNAA band. The real props are the hub's lowpix Poly Haven models (CC0).
import * as THREE from 'three';
import { placeModel } from '../ship/hub/models';
import { canvasTex, hullTex, stoneTex, barkTex, dirtTex, texMat, glowMat, pxTex, P, at, hash } from './tex';
import { gbuf } from '../gfx/gbuf';

export interface Camp { root: THREE.Group; fire: THREE.Vector3; seat: THREE.Vector3; bed: THREE.Vector3; update(dt: number, t: number): void; light: THREE.PointLight }
const V = THREE.Vector3;

/** the faded band on the wreck: UNAA orange with a stencilled number, half worn off */
const bandTex = () => pxTex('pathfinder-band', 64, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    const worn = hash(x >> 1, y >> 1, 11) < 0.18 + (x / 64) * 0.25;
    p.set(x, y, worn ? at(P.steel, 2 + (hash(x, y, 3) > 0.7 ? 1 : 0)) : at(P.rust, 4 + (y < 2 ? 1 : y > 29 ? -1 : 0) + (hash(x, y, 4) > 0.92 ? -1 : 0)));
  }
  // stencilled "03" (the Pathfinder's hull number), chunky blocks
  const D: Record<string, string[]> = { '0': ['###', '#.#', '#.#', '#.#', '###'], '3': ['###', '..#', '.##', '..#', '###'] };
  let ox = 22;
  for (const ch of '03') { D[ch].forEach((r, j) => [...r].forEach((c, i) => { if (c === '#') for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (hash(ox + i * 3 + a, j, 8) > 0.12) p.set(ox + i * 3 + a, 8 + j * 3 + b, at(P.bone, 5)); })); ox += 12; }
});

export function buildCamp(ground: (x: number, z: number) => number, x: number, z: number, yaw: number): Camp {
  const root = new THREE.Group(); root.name = 'guide-camp';
  root.position.set(x, ground(x, z), z); root.rotation.y = yaw;
  const L = (lx: number, lz: number) => { const p = new V(lx, 0, lz).applyAxisAngle(new V(0, 1, 0), yaw); return ground(x + p.x, z + p.z) - root.position.y; };
  const add = (m: THREE.Object3D, lx: number, lz: number, ly = 0) => { m.position.set(lx, L(lx, lz) + ly, lz); root.add(m); m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return m; };
  const steel = texMat(hullTex(P.steel, 2)), rusty = texMat(hullTex(P.iron ?? P.steel, 3)), band = texMat(bandTex());
  // ---- the trampled floor
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4.2, 18), texMat(dirtTex(2)));
  floor.rotation.x = -Math.PI / 2; (floor.material as THREE.MeshLambertMaterial).map!.repeat.set(4, 4);
  add(floor, 0.2, 0.2, 0.03); floor.castShadow = false;
  // ---- the wreck: a section of the Pathfinder's cargo pod, half sunk, its end torn open
  const wreck = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 3.6, 14, 1, true, 0, Math.PI * 1.55), steel);
  shell.material = steel; (shell.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
  shell.rotation.z = Math.PI / 2; wreck.add(shell);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.09, 6, 16), rusty); ring.rotation.y = Math.PI / 2; ring.position.x = 1.7; wreck.add(ring);
  const ring2 = ring.clone(); ring2.position.x = -0.4; wreck.add(ring2);
  const bandM = new THREE.Mesh(new THREE.CylinderGeometry(1.53, 1.53, 0.7, 14, 1, true, 0.3, 1.6), band); bandM.material = band; (band as THREE.MeshLambertMaterial).side = THREE.DoubleSide; bandM.rotation.z = Math.PI / 2; bandM.position.x = 0.7; wreck.add(bandM);
  for (let k = 0; k < 6; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 2.9), rusty); const a = 0.4 + k * 0.42; rib.position.set(-1.2 + (k % 3) * 1.1, Math.cos(a) * 1.4, Math.sin(a) * 1.4); rib.rotation.x = -a; wreck.add(rib); }
  wreck.rotation.set(0.12, 0.5, 0.18); add(wreck, -3.4, -2.6, -0.55);
  // torn plates in the dirt
  for (let k = 0; k < 4; k++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.7 + hash(k, 1) * 0.6, 0.04, 0.5 + hash(k, 2) * 0.4), k % 2 ? steel : rusty); pl.rotation.set(hash(k, 3) * 0.5, hash(k, 4) * 3, hash(k, 5) * 0.4); add(pl, -1.6 - k * 0.5, -3.8 + k * 0.6, 0.05); }
  // ---- the lean-to: two poles, a ridge, a patched canvas sheet down to the ground, guy ropes
  const pole = (lx: number, lz: number, h: number) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 6), texMat(barkTex(3))); add(m, lx, lz, h / 2); return m; };
  pole(1.6, -1.4, 1.9); pole(-0.4, -1.4, 1.9);
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 6), texMat(barkTex(4))); ridge.rotation.z = Math.PI / 2; add(ridge, 0.6, -1.4, 1.88);
  const tarpGeo = new THREE.PlaneGeometry(2.4, 2.3, 4, 4);
  const pos = tarpGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) + 1.2) * 2.6) * 0.04 - Math.abs(pos.getY(i)) * 0.03);
  tarpGeo.computeVertexNormals();
  const tarp = new THREE.Mesh(tarpGeo, texMat(canvasTex(P.olive, 4), 0xffffff, { side: THREE.DoubleSide }));
  tarp.rotation.set(-Math.PI / 2 + 0.95, 0, 0); add(tarp, 0.6, -2.15, 0.95);
  // ---- the bedroll under it
  const bed = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 1.9), texMat(canvasTex(P.clay, 5))); bed.rotation.y = Math.PI / 2; add(bed, 0.6, -2.1, 0.07);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.75, 8), texMat(canvasTex(P.rust, 6))); roll.rotation.z = Math.PI / 2; roll.rotation.y = Math.PI / 2; add(roll, -0.3, -2.1, 0.18);
  // ---- the fire: a ring of stones, crossed logs, flames that flicker, an enamel pot on a tripod
  const fire = new V(1.4, 0, 1.1);
  const stoneM = texMat(stoneTex(2));
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + hash(k, 7) * 0.05, 0), stoneM); s.scale.y = 0.7; s.rotation.set(k, k * 2, 0); add(s, fire.x + Math.cos(a) * 0.48, fire.z + Math.sin(a) * 0.48, 0.07); }
  for (let k = 0; k < 4; k++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.75, 6), texMat(barkTex(5))); lg.rotation.set(Math.PI / 2 - 0.25, (k / 4) * Math.PI * 2, 0); add(lg, fire.x, fire.z, 0.14); }
  const flames: THREE.Mesh[] = [];
  const flameM = [glowMat(0xffa030, 2.2), glowMat(0xffd070, 2.6), glowMat(0xff6020, 1.8)];
  for (let k = 0; k < 5; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.11 + (k % 2) * 0.05, 0.5, 5), flameM[k % 3]); f.castShadow = false; root.add(f); f.position.set(fire.x + Math.cos(k * 2.4) * 0.12, L(fire.x, fire.z) + 0.3, fire.z + Math.sin(k * 2.4) * 0.12); flames.push(f); }
  const embers = new THREE.Mesh(new THREE.CircleGeometry(0.3, 8), glowMat(0xff5018, 1.4)); embers.rotation.x = -Math.PI / 2; add(embers, fire.x, fire.z, 0.05); embers.castShadow = false;
  const tri = new THREE.Group();
  for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.25, 5), texMat(barkTex(6))); const a = (k / 3) * Math.PI * 2; leg.position.set(Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3); leg.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); tri.add(leg); }
  add(tri, fire.x, fire.z);
  placeModel(root, 'pot_enamel_01', { x: fire.x, y: L(fire.x, fire.z) + 0.55, z: fire.z, s: 0.9 });
  const light = new THREE.PointLight(0xff9a48, 6, 9, 1.6); light.position.set(fire.x, L(fire.x, fire.z) + 0.6, fire.z); root.add(light);
  // ---- the seat: a log by the fire facing the pod side
  const seatLog = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 1.1, 7), texMat(barkTex(7))); seatLog.rotation.z = Math.PI / 2; seatLog.rotation.y = 0.4; add(seatLog, fire.x - 0.15, fire.z - 0.95, 0.17);
  const seat = new V(fire.x - 0.15, 0, fire.z - 0.85);
  // ---- stores: crates, cans, the radio, the rain still, boots by the bed
  placeModel(root, 'old_military_crate', { x: -0.9, y: L(-0.9, 0.3), z: 0.3, ry: 0.4, s: 1 });
  placeModel(root, 'vintage_radio_transceiver', { x: -0.9, y: L(-0.9, 0.3) + 0.42, z: 0.3, ry: 0.9, s: 0.8 });
  placeModel(root, 'metal_jerrycan', { x: -1.5, y: L(-1.5, 1.2), z: 1.2, ry: -0.6, s: 1 });
  placeModel(root, 'russian_food_cans_01', { x: 0.4, y: L(0.4, 1.7), z: 1.7, ry: 0.3, s: 1 });
  placeModel(root, 'propane_tank', { x: 2.5, y: L(2.5, -1.2), z: -1.2, ry: 0.2, s: 0.9 });
  placeModel(root, 'rubber_boots', { x: 1.5, y: L(1.5, -2.6), z: -2.6, ry: 1.2, s: 1 });
  placeModel(root, 'cardboard_box_01', { x: -1.7, y: L(-1.7, -0.6), z: -0.6, ry: 0.8, s: 0.9 });
  placeModel(root, 'tea_set_01', { x: 2.2, y: L(2.2, 0.6), z: 0.6, ry: -0.5, s: 0.8 });
  placeModel(root, 'metal_toolbox', { x: -0.2, y: L(-0.2, 1.9), z: 1.9, ry: 1.9, s: 1 });
  // the rain still: a funnel of hull sheet over a jerrycan
  const funnel = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.4, 8, 1, true), steel); funnel.rotation.x = Math.PI; (funnel.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide;
  add(funnel, -1.5, 1.2, 0.95);
  // ---- a salvaged mast with a dead dish, lashed together
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 3.4, 6), steel); add(mast, -2.6, 0.9, 1.7);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 4, 0, Math.PI * 2, 0, 1.0), rusty); (dish.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide; dish.rotation.x = 2.2; add(dish, -2.6, 0.75, 3.2);
  const rag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.32, 3, 1), texMat(canvasTex(P.rust, 8), 0xffffff, { side: THREE.DoubleSide })); add(rag, -2.35, 0.9, 3.0);
  gbuf(rag.material as THREE.Material, 1);
  let smokeT = 0;
  return {
    root, fire, seat, bed: new V(0.6, 0, -2.1), light,
    update(dt, t) {
      flames.forEach((f, k) => { const s = 0.75 + Math.sin(t * (9 + k * 2.3) + k) * 0.2 + Math.sin(t * 23 + k * 5) * 0.08; f.scale.set(s * 0.9, s * (1.1 + Math.sin(t * 6 + k) * 0.25), s * 0.9); f.rotation.y = t * (1 + k * 0.3); });
      light.intensity = 5 + Math.sin(t * 11) * 0.8 + Math.sin(t * 27) * 0.5;
      rag.rotation.y = Math.sin(t * 2.1) * 0.35; rag.rotation.x = Math.sin(t * 3.3) * 0.12;
      smokeT -= dt; void smokeT;
    },
  };
}
