// What came down: the U.S.P.C. drop pod is Unit 07's home, not an asteroid. It is the Veyr core's model (the core
// building keeps its role: hold, respawn point, HQ) and it sits where it landed, tipped over in a short scorched
// skid, hatch open, steaming. Nothing is cleared: the jungle stands all round it, only the plants right under the
// pod are pushed aside. Small fires burn where it hit (a few grass patches, the smouldering skid, the heat shield
// still smoking) with a flickering light, and burn out over a minute or two, leaving a charred patch and a few
// scorched plants. The parachute lies draped beside it.
import * as THREE from 'three';
import type { Game } from './game';
import { makePod, type Pod } from '../ui/deployPod';
import { Bin, lit, mesh, hash, TAU, V3, type V } from '../ui/deployKit';
import { gbuf } from '../gfx/gbuf';
import { vfx2d } from './vfx2d';

/** the landed pod as a model (for the core building): tipped `tilt` toward its yaw, sunk a little, hatch open */
export function makeCorePod(yaw = 0, tilt = 0.24): { group: THREE.Group; pod: Pod; bin: Bin } {
  const bin = new Bin();
  const pod = makePod(bin);
  const group = new THREE.Group(); group.name = 'core-pod';
  const holder = new THREE.Group(); holder.rotation.y = yaw; group.add(holder);
  pod.root.rotation.set(tilt, 0, 0.06); pod.root.position.set(0, -0.32, 0);
  holder.add(pod.root);
  pod.setHatch(1); pod.heat.value = 0; pod.lens.value = 1.2;
  pod.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  group.userData.pod = pod; group.userData.holder = holder;
  return { group, pod, bin };
}
/** point the landed pod along its skid (yaw: the direction it was travelling) */
export function aimCorePod(group: THREE.Object3D, yaw: number) { const h = group.userData.holder as THREE.Group | undefined; if (h) h.rotation.y = yaw; }

/** a conforming patch of char (alpha-cut, ragged edge) for the ground; local coordinates in metres */
function charDecal(bin: Bin, g: Game, cx: number, cz: number, dirX: number, dirZ: number) {
  const R = g.region, S = 64, c = document.createElement('canvas'); c.width = c.height = S;
  const x2 = c.getContext('2d')!, img = x2.createImageData(S, S);
  // a blot round the pod and a skid trail back along where it came from (texture: u along -dir, v across)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / (S - 1), v = y / (S - 1) - 0.5;
    const blot = Math.hypot((u - 0.82) * 2.2, v * 2.4), skid = u < 0.82 ? Math.abs(v) * (4.2 - u * 1.4) : 9;
    const n = hash(x >> 1, y >> 1, 3) * 0.35 + hash(x >> 3, y >> 3, 5) * 0.3;
    const a = Math.max(1 - blot / (0.58 + n * 0.3), 1 - skid / (0.75 + n * 0.5) - (0.82 - u) * 0.25);
    const o = (y * S + x) * 4, k = a > 0.75 ? 0 : 1;
    img.data[o] = 26 + k * 10; img.data[o + 1] = 22 + k * 8; img.data[o + 2] = 18 + k * 6;
    img.data[o + 3] = a > 0.05 ? Math.min(255, a * 360) : 0;
  }
  x2.putImageData(img, 0, 0);
  const tex = bin.t(new THREE.CanvasTexture(c)); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
  const m = bin.m(gbuf(new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }), 0));
  // a grid draped over the real ground: 11 m long (9 of skid behind the pod), 5 m wide
  const L = 11, W = 5, nu = 22, nv = 10, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const sx = -dirZ, sz = dirX;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv - 0.5, along = (u - 0.82) * L, across = v * W;
    const x = cx + dirX * along + sx * across, z = cz + dirZ * along + sz * across;
    pos.push(x, R.groundSmooth(Math.min(R.N - 0.5, Math.max(0.5, x)), Math.min(R.N - 0.5, Math.max(0.5, z))) + 0.06, z); uv.push(u, 1 - (v + 0.5));
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, cc = a + nu + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const me = mesh(bin, geo, m, g.world.scene, 0, 0, 0, false); me.receiveShadow = true; me.renderOrder = 1;
  return me;
}
/** the parachute where it fell: a flattened, wrinkled canopy in cream and oxide-red gores, lines toward the pod */
function drapedChute(bin: Bin, g: Game, x: number, z: number, toX: number, toZ: number) {
  const R = g.region, G = 12, rows = 4, Rad = 2.6, pos: number[] = [], col: number[] = [];
  const cA = new THREE.Color(0xd8cfb8), cB = new THREE.Color(0x9a3a2a);
  const gy = (px: number, pz: number) => R.groundSmooth(Math.min(R.N - 0.5, Math.max(0.5, px)), Math.min(R.N - 0.5, Math.max(0.5, pz)));
  for (let gi = 0; gi < G; gi++) {
    const a0 = (gi / G) * TAU, a1 = ((gi + 1) / G) * TAU, cc = gi % 2 ? cB : cA;
    for (let r = 0; r < rows; r++) {
      const P = (rr: number, a: number) => { const k = rr / rows, w = 1 + Math.sin(a * 5 + rr) * 0.12; const px = x + Math.cos(a) * Rad * k * w * 1.25, pz = z + Math.sin(a) * Rad * k * w * 0.85; return [px, gy(px, pz) + 0.1 + Math.sin(a * 3 + rr * 2) * 0.12 * k + (1 - k) * 0.3, pz]; };
      const p00 = P(r, a0), p01 = P(r, a1), p10 = P(r + 1, a0), p11 = P(r + 1, a1);
      pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01); for (let k = 0; k < 6; k++) col.push(cc.r, cc.g, cc.b);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  mesh(bin, geo, lit(bin, 0xffffff, { vertexColors: true, side: THREE.DoubleSide }), g.world.scene, 0, 0, 0, false).receiveShadow = true;
  const lp: number[] = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU, px = x + Math.cos(a) * Rad * 1.1, pz = z + Math.sin(a) * Rad * 0.8; lp.push(px, gy(px, pz) + 0.12, pz, toX, gy(toX, toZ) + 0.5, toZ); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(bin.g(lg), bin.m(gbuf(new THREE.LineBasicMaterial({ color: 0x3a3830 }), 0)));
  g.world.scene.add(lines);
}

interface Blaze { x: number; z: number; y: number; life: number; t: number; k: number }
/**
 * The crash site round the pod at (x, z) (region metres), skidding in direction (dirX, dirZ): char, scorch, small
 * contained fires that burn out, steam off the hull, the draped chute; the plants under the pod held aside for good.
 */
export function startCrashSite(g: Game, x: number, z: number, dirX: number, dirZ: number, o: { chute?: boolean } = {}) {
  const bin = new Bin(), R = g.region, F = g.world.flora;
  const dl = Math.hypot(dirX, dirZ) || 1; dirX /= dl; dirZ /= dl;
  const sx = -dirZ, sz = dirX;
  const gy = (px: number, pz: number) => R.groundSmooth(Math.min(R.N - 0.5, Math.max(0.5, px)), Math.min(R.N - 0.5, Math.max(0.5, pz)));
  charDecal(bin, g, x, z, dirX, dirZ);
  if (o.chute !== false) { const cx = x + dirX * 4.2 + sx * 2.4, cz = z + dirZ * 4.2 + sz * 2.4; drapedChute(bin, g, cx, cz, x, z); }
  // a few scorched plants along the skid and round the pod (darkened, not removed)
  F.near(x, z, 4.5, (i) => F.setTint(i, 0x2a2018, 0.55 + hash(i, 1) * 0.3));
  for (let k = 2; k <= 8; k += 3) F.near(x - dirX * k, z - dirZ * k, 1.8, (i) => F.setTint(i, 0x2a2018, 0.45));
  // the fires: under the shield, along the skid, two grass patches to the sides
  const blazes: Blaze[] = [];
  const add = (px: number, pz: number, life: number, k: number) => blazes.push({ x: px, z: pz, y: gy(px, pz), life, t: 0, k });
  add(x + dirX * 0.6, z + dirZ * 0.6, 95 + hash(x, z) * 30, 1);
  for (const [a, s] of [[2.5, 0.4], [5, -0.6], [7.5, 0.3]] as [number, number][]) add(x - dirX * a + sx * s, z - dirZ * a + sz * s, 45 + hash(a, x) * 40, 0.6);
  add(x + sx * 2.2 + dirX * 1.2, z + sz * 2.2 + dirZ * 1.2, 35 + hash(z, 3) * 30, 0.5);
  add(x - sx * 2.6 - dirX * 1.5, z - sz * 2.6 - dirZ * 1.5, 30 + hash(z, 7) * 30, 0.45);
  const light = new THREE.PointLight(0xff8a3a, 0, 16, 1.6); light.position.set(x, gy(x, z) + 1.2, z); g.world.scene.add(light);
  let t = 0, smokeT = 0, steamT = 0, done = false;
  const col = new THREE.Color();
  const tick = (sdt: number) => {
    const dt = Math.max(sdt, 1 / 60);
    t += dt;
    // the pod pushes the growth under it aside for as long as it stands there
    F.push(x, z, 2.2, 1);
    if (done) return;
    let heat = 0, hx = 0, hz = 0;
    for (const b of blazes) {
      b.t += dt;
      const life = Math.max(0, 1 - b.t / b.life), k = b.k * Math.min(1, b.t * 2) * Math.pow(life, 0.6);
      if (k <= 0.01) continue;
      heat += k; hx += b.x * k; hz += b.z * k;
      // flames: glowing tongues licking up, a spark now and then
      if (Math.random() < dt * 26 * k) {
        col.setRGB(1.6 + Math.random() * 0.5, 0.55 + Math.random() * 0.35, 0.12).multiplyScalar(1.1);
        g.fx.glow.emit(b.x + (Math.random() - 0.5) * 0.9 * b.k, b.y + 0.15, b.z + (Math.random() - 0.5) * 0.9 * b.k, (Math.random() - 0.5) * 0.3, 1.2 + Math.random() * 1.4, (Math.random() - 0.5) * 0.3, col, 1, 2.2 + Math.random() * 1.6 * b.k, 0.45 + Math.random() * 0.35, -0.6, 1.2);
      }
      if (Math.random() < dt * 1.5 * k) vfx2d.play('spark', b.x, b.y + 0.5, b.z, { scale: 0.5, ramp: 'glowAmber', emit: 1.6, vel: [(Math.random() - 0.5) * 1.5, 2.5, (Math.random() - 0.5) * 1.5], grav: 4 });
    }
    // smoke off the fires and the heat shield; steam off the hull for the first half minute
    smokeT -= dt; steamT -= dt;
    if (smokeT <= 0) {
      smokeT = 0.45 / Math.max(0.3, heat);
      const b = blazes[Math.floor(Math.random() * blazes.length)];
      if (b && b.t < b.life) vfx2d.play('smoke', b.x, b.y + 0.8, b.z, { scale: 1.4 + Math.random() * 1.2, ramp: 'stone', vel: [0.3, 1.1, 0.2], speed: 0.55 });
      if (t < 150) vfx2d.play('smoke', x + dirX * 0.8, gy(x, z) + 0.6, z + dirZ * 0.8, { scale: 1.8, ramp: 'basalt', vel: [0.2, 1.4, 0.1], speed: 0.5 });
    }
    if (steamT <= 0 && t < 30) { steamT = 0.35; vfx2d.play('smoke', x - dirX * 0.5, gy(x, z) + 2.4, z - dirZ * 0.5, { scale: 0.9, ramp: 'snow', vel: [0.2, 1.8, 0.1], speed: 0.8 }); }
    // the light flickers with the fire and dies with it
    light.intensity = heat > 0.02 ? (6 + Math.sin(t * 23) * 1.5 + Math.sin(t * 7.3) * 1.2 + Math.random() * 1.5) * Math.min(1.6, heat) : 0;
    if (heat > 0.02) light.position.set(hx / heat, gy(hx / heat, hz / heat) + 1.1, hz / heat);
    if (heat <= 0.02 && t > 5) { done = true; light.removeFromParent(); light.dispose(); }
  };
  g.update$.push(tick);
  return { bin, light, blazes, get burning() { return !done; } };
}
/** the skid direction a landed pod faces (for a plain game start without a descent) */
export function defaultSkid(x: number, z: number): V { const a = hash(Math.floor(x), Math.floor(z), 11) * TAU; return new V3(Math.cos(a), 0, Math.sin(a)); }
