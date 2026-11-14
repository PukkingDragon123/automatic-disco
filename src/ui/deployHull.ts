// U.S.S. VANGUARD (CVS-01), the hero hull: the U.S. Planetary Corps' 1957 orbital carrier, 260 m bow to nozzles.
// Built from parts in src/ui/carrier/: the forward hull round Launch Bay 2 with its mouth frame, apron and brow
// (fore.ts), the hangar decks, hammerhead bridge, lattice mast and aft deckhouse up top, landing craft in davit
// bays down the flanks; then the truss spine with the rotating habitat ring, container racks under a gantry, the
// propellant farm and radiator wings, the shadow shield, reactor drum, bells and outrigger nacelles (aft.ts).
// Everything static goes straight into one geometry per material (no per-part meshes, no merge pass) and is
// textured from one hand-painted pixel atlas (atlas.ts) through gbuf'd atlas materials (mat.ts); a low-detail
// stand-in takes over when the ship is small on screen (THREE.LOD). Alive: running lights, strobes and the keel
// chase in one blinking point cloud, steam venting now and then, floodlight beams and the pools they throw, the
// radar, dishes, hab ring, crane and gantry turning, drones and a tug about their rounds, the engines idling.
// Ship-local frame: +z bow, +y dorsal, metres. buildHull's signature is what deployShip.ts plugs in.
import * as THREE from 'three';
import { Bin, fxMat } from './deployKit';
import { RAMPS } from '../art/palette';
import { Builder } from './carrier/geo';
import { paintAtlas, makeSkins } from './carrier/atlas';
import { AW, AH } from './carrier/paint';
import { atlasTextures, atlasMat } from './carrier/mat';
import { newFx, buildFx, NAV, NOZ_F, PLUME_V, PLUME_F } from './carrier/fx';
import { buildFore } from './carrier/fore';
import { buildAft } from './carrier/aft';
import { craft, type Ctx } from './carrier/kit';

/** the master palette's slate and steel as a 10-step plate ramp (the bay doors still paint with it) */
export const HULL_RAMP = [...RAMPS.slate, RAMPS.steel[4], RAMPS.steel[5], RAMPS.steel[6], RAMPS.paper[2]];
export const OLIVE_RAMP = [...RAMPS.olive, RAMPS.straw[2], RAMPS.straw[3], RAMPS.straw[4], RAMPS.straw[5]];

/** ship-local boxes (centre xyz, half size xyz) that rough out the hull, for things that bounce off it */
export const CARRIER_BOXES: [number, number, number, number, number, number][] = [
  [0, -4.5, 10, 18.5, 18.5, 56], [0, 5, 80, 12, 7, 16], [0, 26, 22, 24, 10, 8.5], [0, 16, 47, 13, 5, 15], [0, -1, -92, 8, 8, 38],
  [0, -1, -68, 21, 21, 3], [0, -1, -142, 12.5, 12.5, 14], [-32, -3, -145, 5, 5, 16], [32, -3, -145, 5, 5, 16], [0, -1, -122, 46, 1, 7],
];

const CONE_V = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;

export interface Hull {
  sun: THREE.DirectionalLight;
  /** the exterior lights (the ship's view switch turns them on and off) */
  lights: THREE.Light[];
  update(t: number, dt: number): void;
}

/** distance (m) beyond which the low-detail stand-in replaces the hero hull */
export const CARRIER_LOD_DIST = 1100;

export function buildHull(bin: Bin, root: THREE.Group, ext: THREE.Group): Hull {
  const lights: THREE.Light[] = [];
  // ---- the atlas and its materials (one texture pair for the whole ship)
  const A = paintAtlas();
  const T = atlasTextures(bin, A.d, A.e, AW, AH);
  const emisK = { value: 1.8 };
  const mats: Record<string, THREE.Material> = {
    m: atlasMat(bin, T, { emisK }),
    d: atlasMat(bin, T, { decal: true, emisK, flag: 0 }),
  };
  const s = makeSkins(A.regs);
  const C: Ctx = { B: new Builder(), L: new Builder(), s, fx: newFx() };
  const F = buildFore(C), Af = buildAft(C);

  const meshes = (b: Builder, parent: THREE.Object3D, shadow = true) => {
    for (const [k, g] of b.geometries()) {
      const m = new THREE.Mesh(bin.g(g), mats[k] ?? mats.m);
      m.castShadow = shadow && k !== 'd'; m.receiveShadow = true; m.name = 'carrier-' + k;
      parent.add(m);
    }
  };
  const lod = new THREE.LOD(); lod.name = 'carrier-lod'; ext.add(lod);
  const hi = new THREE.Group(), lo = new THREE.Group(); hi.name = 'carrier-hi'; lo.name = 'carrier-lo';
  meshes(C.B, hi); meshes(C.L, lo);
  lod.addLevel(hi, 0); lod.addLevel(lo, CARRIER_LOD_DIST);

  // ---- the moving parts (each its own little mesh set, sharing the atlas material)
  const part = (b: Builder, at: THREE.Vector3, parent: THREE.Object3D = hi) => { const g = new THREE.Group(); g.position.copy(at); meshes(b, g); parent.add(g); return g; };
  const radar = part(F.radar, F.anchors.radar), dishS = part(F.dishS, F.anchors.dishS);
  const dishL = part(F.dishL, F.anchors.dishL), dishR = part(F.dishR, F.anchors.dishR);
  const crane = part(F.crane, F.anchors.crane);
  const ringG = part(Af.ring, Af.anchors.ring), gantry = part(Af.gantry, Af.anchors.gantry);
  dishR.rotation.y = Math.PI;

  // ---- drones (instanced) and the tug, with their own lamps in a moving point cloud
  const droneB = new Builder();
  {
    const d = droneB;
    d.sphere(s('ochreC', 8), 0.55, 10, 6, { fit: false });
    for (const sx of [-1, 1]) { d.beam(s('gunC', 8), new THREE.Vector3(0, 0, 0), new THREE.Vector3(sx * 1.3, 0.1, 0), 0.08); d.at(sx * 1.35, 0.12, 0); d.cyl(s('rubber', 1), 0.35, 0.35, 0.06, 10); d.pop(); }
    d.at(0, -0.45, 0.25); d.box(s('gunC', 8), 0.35, 0.3, 0.45); d.pop();
    d.at(0, 0, 0.56, Math.PI / 2, 0, 0); d.cyl(s('lensWhite', 1), 0.16, 0.16, 0.05, 8); d.pop();
  }
  const NDR = 6;
  const droneGeo = droneB.geometries().get('m')!;
  const drones = new THREE.InstancedMesh(bin.g(droneGeo), mats.m, NDR); drones.castShadow = true; drones.frustumCulled = false; hi.add(drones);
  const tugB = new Builder(); craft(tugB, s, '1');
  const tug = new THREE.Group(); meshes(tugB, tug); tug.scale.setScalar(0.62); hi.add(tug);
  const droneF: ((t: number, o: THREE.Vector3) => THREE.Vector3)[] = [
    (t, o) => o.set(Math.cos(t * 0.19) * 30, 44 + Math.sin(t * 0.37) * 2.5, 22 + Math.sin(t * 0.19) * 10),
    (t, o) => o.set(-24.5 + Math.sin(t * 0.23) * 1.5, -6 + Math.sin(t * 0.31) * 5, 10 + Math.sin(t * 0.11) * 34),
    (t, o) => o.set(Math.cos(t * 0.27) * 22, -1 + Math.sin(t * 0.27) * 22, -73 + Math.sin(t * 0.13) * 3),
    (t, o) => o.set(12 + Math.sin(t * 0.21) * 3, 4 + Math.sin(t * 0.29) * 8, -104 + Math.cos(t * 0.17) * 14),
    (t, o) => o.set(Math.sin(t * 0.15) * 9, -26 + Math.sin(t * 0.4) * 1.5, 20 + Math.cos(t * 0.15) * 30),
    (t, o) => o.set(31 + Math.cos(t * 0.33) * 7, -3 + Math.sin(t * 0.33) * 7, -140 + Math.sin(t * 0.09) * 10),
  ];
  // the tug's round: hangar roof -> over the bridge -> down the spine to the racks, a pause at each end
  const tugPath = new THREE.CatmullRomCurve3([new THREE.Vector3(-4, 24.5, 52), new THREE.Vector3(-14, 30, 40), new THREE.Vector3(-30, 36, 10), new THREE.Vector3(-26, 26, -40), new THREE.Vector3(-14, 16, -70), new THREE.Vector3(-6, 13.5, -84)]);
  const movers = new THREE.BufferGeometry();
  const mPos = new Float32Array((NDR + 2) * 3), mCol = new Float32Array((NDR + 2) * 3), mInf = new Float32Array((NDR + 2) * 3);
  for (let i = 0; i < NDR; i++) { mCol.set(i % 2 ? NAV.amber : NAV.white, i * 3); mInf.set([0.7, 1, i * 1.7], i * 3); }
  mCol.set(NAV.red, NDR * 3); mInf.set([1.0, 1, 0.4], NDR * 3); mCol.set(NAV.amber, NDR * 3 + 3); mInf.set([1.8, 0, 0], NDR * 3 + 3);
  movers.setAttribute('position', new THREE.BufferAttribute(mPos, 3)); movers.setAttribute('aCol', new THREE.BufferAttribute(mCol, 3)); movers.setAttribute('aInfo', new THREE.BufferAttribute(mInf, 3));

  // ---- fx: lights, steam, beams, pools (static clouds), then the movers' lamps share the halo shader
  const FX = buildFx(bin, C.fx); ext.add(FX.group);
  {
    const halo = FX.group.children.find((o) => (o as THREE.Points).isPoints) as THREE.Points | undefined;
    if (halo) { const p = new THREE.Points(bin.g(movers), halo.material); p.frustumCulled = false; p.renderOrder = 3; p.onBeforeRender = halo.onBeforeRender; ext.add(p); }
  }

  // ---- the engines: throat glow inside each bell, the shimmering exhaust, a warm point light
  const nozU = { uCol: { value: new THREE.Color(1.6, 0.62, 0.2) }, uK: { value: 0.8 }, uT: { value: 0 } };
  const nozM = fxMat(bin, CONE_V, NOZ_F, nozU, 'add', { side: THREE.BackSide });
  const plumeU = { uT: { value: 0 }, uK: { value: 0.5 } };
  const plumeM = fxMat(bin, PLUME_V, PLUME_F, plumeU, 'add', { side: THREE.DoubleSide });
  for (const [x, y, z, r1, len] of Af.bells) {
    const r0 = r1 * 0.4;
    const gl = new THREE.Mesh(bin.g(new THREE.CylinderGeometry(r0 * 0.9, r1 * 0.9, len * 0.95, 22, 1, true)), nozM);
    gl.rotation.x = Math.PI / 2; gl.position.set(x, y, z - len * 0.5); gl.renderOrder = 2; ext.add(gl);
    const pl = new THREE.Mesh(bin.g(new THREE.CylinderGeometry(r1 * 0.85, r1 * 0.3, r1 * 4.5, 20, 6, true)), plumeM);
    pl.rotation.x = Math.PI / 2; pl.position.set(x, y, z - len - r1 * 2.25); pl.renderOrder = 2; ext.add(pl);
  }
  const engineGlow = new THREE.PointLight(0xffa060, 120, 90, 1.6); engineGlow.position.copy(Af.anchors.engine); root.add(engineGlow); lights.push(engineGlow);

  // ---- the exterior light rig: the sun (shadows over the whole ship), the planet's bounce, a few real floods
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2); sun.castShadow = true; sun.position.set(-0.8, 0.38, -0.46).normalize().multiplyScalar(260);
  sun.shadow.mapSize.set(2048, 2048); const sc = sun.shadow.camera as THREE.OrthographicCamera; sc.left = sc.bottom = -170; sc.right = sc.top = 170; sc.near = 10; sc.far = 600; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
  root.add(sun, sun.target); lights.push(sun);
  const bounce = new THREE.HemisphereLight(0x3a4656, 0x98b0cc, 1.5); root.add(bounce); lights.push(bounce);
  const spot = (p: THREE.Vector3, at: THREE.Vector3, k: number, dist: number, ang: number) => { const l = new THREE.SpotLight(0xffd8a0, k, dist, ang, 0.6, 1.6); l.position.copy(p); l.target.position.copy(at); root.add(l, l.target); lights.push(l); };
  for (const sx of [-1, 1]) spot(new THREE.Vector3(sx * 12.2, 18.9, 58), new THREE.Vector3(sx * 18.2, 4.6, 46), 260, 60, 0.5);
  spot(new THREE.Vector3(-26.8, 37.5, 28.4), new THREE.Vector3(-7, 22.2, 50), 220, 60, 0.42);
  spot(new THREE.Vector3(5.6, 4.8, -94), new THREE.Vector3(9, 8, -101), 160, 40, 0.6);

  const p = new THREE.Vector3(), q = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  const look = new THREE.Matrix4();
  return {
    sun, lights,
    update(t, dt) {
      void dt;
      FX.update(t);
      radar.rotation.y = -t * 1.25;
      dishS.rotation.y = Math.sin(t * 0.21) * 1.35;
      dishL.rotation.set(Math.sin(t * 0.13) * 0.18, 0.5 + Math.sin(t * 0.07) * 0.6, 0);
      dishR.rotation.set(Math.sin(t * 0.11 + 1) * 0.18, Math.PI - 0.5 + Math.sin(t * 0.06 + 2) * 0.6, 0);
      crane.rotation.y = -0.6 + Math.sin(t * 0.09) * 0.9;
      ringG.rotation.z = t * 0.055;
      gantry.position.z = -84 + Math.sin(t * 0.12) * 6.5;
      nozU.uT.value = t; plumeU.uT.value = t;
      engineGlow.intensity = 110 + Math.sin(t * 17) * 8 + Math.sin(t * 5.3) * 6;
      // drones: face along their path, bank a little
      for (let i = 0; i < NDR; i++) {
        droneF[i](t + i * 13, p); droneF[i](t + i * 13 + 0.4, q);
        look.lookAt(q, p, up); Q.setFromRotationMatrix(look);
        drones.setMatrixAt(i, M4.compose(p, Q, S1));
        mPos.set([p.x, p.y + 0.7, p.z], i * 3);
      }
      drones.instanceMatrix.needsUpdate = true;
      // the tug: out and back with a pause at each end
      const cyc = (t * 0.022) % 2, u = cyc < 1 ? cyc : 2 - cyc, e = Math.min(1, Math.max(0, (u - 0.08) / 0.84)), k = e * e * (3 - 2 * e);
      tugPath.getPoint(k, p); tugPath.getPoint(Math.min(1, Math.max(0, k + (cyc < 1 ? 0.01 : -0.01))), q);
      tug.position.copy(p); if (p.distanceToSquared(q) > 1e-6) tug.lookAt(root.localToWorld(q.clone()));
      mPos.set([p.x - 1.5, p.y + 0.4, p.z], NDR * 3);
      q.set(0, 0, -4.5).applyQuaternion(tug.quaternion).add(p); mPos.set([q.x, q.y, q.z], NDR * 3 + 3);
      mInf[NDR * 3 + 3] = k > 0.01 && k < 0.99 ? 1.8 : 0.5;
      (movers.attributes.position as THREE.BufferAttribute).needsUpdate = true; (movers.attributes.aInfo as THREE.BufferAttribute).needsUpdate = true;
    },
  };
}
