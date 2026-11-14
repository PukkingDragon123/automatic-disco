// The main menu's centrepiece: the U.S.S. VANGUARD, the Corps' orbital carrier (built by deployShip.ts), seen
// whole and working. Its launch-bay doors stand open on the lit hangar, the radar turns, the strobe and running
// lights blink, the nozzles idle, and shuttles ply in and out of the bay: one inbound on a long curve, one
// outbound climbing away, one crossing far off. Also the hull's rough boxes, for things to bounce off.
import * as THREE from 'three';
import { buildCarrier, type Carrier } from './deployShip';
import { Bin, lit, lamp } from './deployKit';
import { RAMPS } from '../art/palette';

const V3 = THREE.Vector3;
/** ship-local boxes (centre, half size): the hull, the beak over the bay mouth, the island, the side tanks, the stern */
const HULL_BOXES: [number, number, number, number, number, number][] = [
  [0, -1.5, -11, 18.5, 17.5, 75], [0, 4, 78, 8, 6, 14], [11.5, 26, 6, 4.5, 12, 7],
  [-21.5, -6, -12, 4.4, 4.4, 50], [21.5, -6, -12, 4.4, 4.4, 50], [0, -1, -82, 15, 13, 6],
];

interface Shuttle { g: THREE.Group; path: THREE.CubicBezierCurve3; dur: number; t: number; wait: number; nav: THREE.MeshBasicMaterial[]; glow: THREE.MeshBasicMaterial; inbound: boolean }

/** a small 1950s orbital shuttle, about 8 m: a slab fuselage with a pyramid nose, swept wings, a fin, twin engines */
function shuttleMesh(bin: Bin) {
  const g = new THREE.Group();
  const hull = lit(bin, RAMPS.steel[4]), dark = lit(bin, RAMPS.steel[2]), stripe = lit(bin, RAMPS.olive[3]);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(bin.g(geo), m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; g.add(me); return me; };
  add(new THREE.BoxGeometry(2.4, 1.7, 5.6), hull, 0, 0, 0);
  add(new THREE.CylinderGeometry(0.15, 1.45, 2.6, 4), hull, 0, 0, 4.0, Math.PI / 2, 0, Math.PI / 4).scale.set(1.15, 1, 0.82);
  add(new THREE.BoxGeometry(1.5, 0.5, 1.4), lamp(bin, RAMPS.glowAmber[2], 1.2), 0, 0.85, 2.2);
  add(new THREE.BoxGeometry(2.46, 0.4, 5.62), stripe, 0, -0.2, 0);
  for (const s of [-1, 1]) {
    const w = add(new THREE.BoxGeometry(3.6, 0.22, 2.4), dark, s * 2.8, -0.45, -1.2, 0, s * 0.42, 0);
    w.scale.set(1, 1, 1);
    add(new THREE.CylinderGeometry(0.5, 0.62, 1.6, 6), dark, s * 0.75, -0.1, -3.2, Math.PI / 2);
  }
  add(new THREE.BoxGeometry(0.22, 1.9, 1.8), hull, 0, 1.5, -2.2, 0.25);
  const glow = lamp(bin, RAMPS.glowAmber[3], 2.2) as THREE.MeshBasicMaterial;
  for (const s of [-1, 1]) add(new THREE.CircleGeometry(0.44, 6), glow, s * 0.75, -0.1, -4.03, 0, Math.PI);
  const red = lamp(bin, RAMPS.stampRed[3], 2) as THREE.MeshBasicMaterial, grn = lamp(bin, RAMPS.glowTeal[3], 2) as THREE.MeshBasicMaterial;
  add(new THREE.BoxGeometry(0.3, 0.3, 0.3), red, -4.6, -0.45, -1.8); add(new THREE.BoxGeometry(0.3, 0.3, 0.3), grn, 4.6, -0.45, -1.8);
  return { g, glow, nav: [red, grn] };
}

export interface MenuCarrier {
  group: THREE.Group; carrier: Carrier;
  /** the ship's frame and hull boxes, for the apple's bounces (world matrices, refreshed by update) */
  boxes: { half: THREE.Vector3; m: THREE.Matrix4; inv: THREE.Matrix4; c: THREE.Vector3 }[];
  update(dt: number, t: number): void;
  dispose(): void;
}
export function buildMenuCarrier(): MenuCarrier {
  const carrier = buildCarrier({ view: 'both' });
  const ship = carrier.ship, bin = new Bin();
  ship.setDoors(1); ship.setBeacons(false); ship.setSled(20); ship.setClamps(1);
  // fewer lights in every shader: the menu never shows the red bay beacons, the booth lamp or the deck fills
  ship.root.traverse((o) => {
    const l = o as THREE.Light; if (!l.isLight) return;
    if ((l as THREE.SpotLight).isSpotLight && (l.color.getHex() === 0xff2a14 || (l as THREE.SpotLight).distance <= 8)) l.visible = false;
    if ((l as THREE.PointLight).isPointLight) l.visible = false;
  });
  const group = carrier.group;
  // shuttle traffic (ship-local)
  const C = (a: number[], b: number[], c: number[], d: number[]) => new THREE.CubicBezierCurve3(new V3(...a), new V3(...b), new V3(...c), new V3(...d));
  const routes: [THREE.CubicBezierCurve3, number, number, boolean][] = [
    [C([-160, 60, 430], [-60, 20, 260], [0, -8.5, 150], [0, -9, 46]), 19, 0, true],
    [C([0, -9, 44], [0, -9, 120], [30, 2, 220], [170, 70, 420]), 17, 7, false],
    [C([-420, 95, 180], [-150, 85, 230], [150, 75, 260], [460, 60, 300]), 34, 3, false],
  ];
  const shuttles: Shuttle[] = routes.map(([path, dur, delay, inbound]) => {
    const s = shuttleMesh(bin); s.g.visible = false; ship.root.add(s.g);
    return { g: s.g, path, dur, t: -delay, wait: 0, nav: s.nav, glow: s.glow, inbound };
  });
  const boxes = HULL_BOXES.map(([x, y, z, hx, hy, hz]) => ({ half: new V3(hx, hy, hz), m: new THREE.Matrix4(), inv: new THREE.Matrix4(), c: new V3(x, y, z) }));
  const tan = new V3(), look = new V3(), mL = new THREE.Matrix4();
  return {
    group, carrier, boxes,
    update(dt, t) {
      carrier.update(dt);
      ship.root.updateMatrixWorld();
      for (const b of boxes) { b.m.copy(ship.root.matrixWorld).multiply(mL.makeTranslation(b.c.x, b.c.y, b.c.z)); b.inv.copy(b.m).invert(); }
      for (const s of shuttles) {
        s.t += dt;
        const u = s.t / s.dur;
        if (u < 0 || u > 1) { s.g.visible = false; if (u > 1) s.t = -(4 + Math.random() * 6); continue; }
        // ease in at the bay, out of it
        const e = s.inbound ? 1 - (1 - u) * (1 - u) * 0.35 - (1 - u) * 0.65 : u * u * 0.4 + u * 0.6;
        const k = Math.min(1, Math.max(0, e));
        s.path.getPoint(k, s.g.position); s.path.getTangent(k, tan);
        s.g.lookAt(ship.root.localToWorld(look.copy(s.g.position).add(tan)));
        s.g.visible = true;
        const blink = Math.sin(t * 6 + s.dur) > 0.6 ? 1 : 0.15;
        s.nav[0].color.setHex(RAMPS.stampRed[3]).multiplyScalar(2.4 * blink); s.nav[1].color.setHex(RAMPS.glowTeal[3]).multiplyScalar(2.4 * blink);
        s.glow.color.setHex(RAMPS.glowAmber[3]).multiplyScalar(1.6 + Math.sin(t * 40 + s.dur) * 0.3);
      }
    },
    dispose() { bin.dispose(); carrier.dispose(); },
  };
}
