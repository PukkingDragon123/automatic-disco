// Robot models: one hand-designed assembly per kind, in the livery of its faction, built from the machine kit.
// U.S.P.C. hardware is rounded pressed steel with rivets, brass and olive paint; Soviet hardware is angular, slab-
// sided, heavily riveted, grey-green with rust-red panels and a red star; Chinese hardware is sleek turned shells and
// fairings, dark green with khaki, a red star with a gold rim; the expedition's rover is cream and slate.
// Shared sub-assemblies keep the engineering consistent: legs hang from hip axles with knee cylinders on lugs, feet
// on ankle hinges; track units have a side frame, road wheels, a toothed sprocket and an idler inside a scrolling
// belt; guns sit in cradles on trunnions behind a mantlet. Every moving part is its own group for the animator.
import * as THREE from 'three';
import { Kit, makePiston, type Piston, type V3 } from './kit';
import { atlasFor, kitMaterial, kitUniforms, livery, type KitU, type LiveryId } from './atlas';

const TAU = Math.PI * 2;
export const ROBOT_KINDS = ['scout', 'worker', 'trooper', 'heavy', 'artillery', 'walker', 'sov_drone', 'sov_trooper', 'sov_tank', 'sov_titan', 'prc_scout', 'prc_trooper', 'prc_mech',
  'expedition_soldier', 'expedition_heavy', 'expedition_engineer', 'expedition_officer', 'expedition_crew', 'expedition_rover'] as const;
export type RobotKind = typeof ROBOT_KINDS[number];
export const HUMAN_KINDS: RobotKind[] = ['expedition_soldier', 'expedition_heavy', 'expedition_engineer', 'expedition_officer', 'expedition_crew'];

export interface LegRig { hip: THREE.Group; knee: THREE.Group; foot: THREE.Group; lt: number; ls: number; ph: number; bird: boolean; hipH: number; footH: number; side: number; splay: number }
export interface UnitModel {
  root: THREE.Group; body: THREE.Group; turret: THREE.Group | null; gun: THREE.Group | null; recoil: THREE.Group[];
  muzzles: THREE.Object3D[]; legs: LegRig[]; wheels: { g: THREE.Group; r: number; side: number }[]; rotors: THREE.Group[]; jaws: THREE.Group[];
  pistons: Piston[]; debris: THREE.Object3D[]; lamps: THREE.Object3D[]; exhaust: THREE.Object3D[];
  h: number; r: number; hover: number; tracks: boolean; tris: number; U: KitU; mats: THREE.Material[]; stride: number;
}

const G = (p: THREE.Object3D, x = 0, y = 0, z = 0, name = '') => { const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; p.add(g); return g; };

/** build the model for a kind in a livery */
export function buildModel(kind: RobotKind, liv: LiveryId): UnitModel {
  const at = atlasFor(livery(liv));
  const U = kitUniforms();
  const mats = [kitMaterial(at, U)];
  const root = new THREE.Group(); root.name = kind;
  const body = G(root, 0, 0, 0, 'body');
  const k = new Kit(2.4);
  const m: UnitModel = { root, body, turret: null, gun: null, recoil: [], muzzles: [], legs: [], wheels: [], rotors: [], jaws: [], pistons: [], debris: [], lamps: [], exhaust: [], h: 1, r: 0.4, hover: 0, tracks: false, tris: 0, U, mats, stride: 0.2 };
  const C = new Ctx(k, m, liv);
  (BUILD[kind] ?? BUILD.trooper)(C);
  k.finish(mats);
  m.tris = k.tris;
  return m;
}

class Ctx {
  constructor(readonly k: Kit, readonly m: UnitModel, readonly liv: LiveryId) {}
  A(i: number) { return ['pa0', 'pa1', 'pa2'][((i % 3) + 3) % 3]; }
  B(i: number) { return ['pb0', 'pb1', 'pb2'][((i % 3) + 3) % 3]; }
  /** a mark plate (star) on a face of the current frame (facing +z) */
  mark(x: number, y: number, z: number, s: number, onB = false) { this.k.decal(x, y, z, s, s, onB ? 'markB' : 'mark'); return this; }
  serial(x: number, y: number, z: number, w: number, i = 0, onB = false) { this.k.decal(x, y, z, w, w * 0.125, (onB ? 'serB' : 'ser') + i); return this; }
  /** a leg hanging from a hip axle: thigh, knee hinge, shin, ankle hinge, foot; a knee cylinder on lugs */
  leg(parent: THREE.Object3D, x: number, y: number, z: number, o: { lt: number; ls: number; w: number; bird?: boolean; ph?: number; foot?: 'pad' | 'claw' | 'paw'; side?: number; paint?: number; hipH: number; splay?: number; angular?: boolean }): LegRig {
    const k = this.k, w = o.w, bird = !!o.bird, s = o.side ?? Math.sign(x || 1);
    const hip = G(parent, x, y, z, 'hip'), knee = G(hip, 0, -o.lt, 0, 'knee'), foot = G(knee, 0, -o.ls, 0, 'foot');
    if (o.splay) hip.rotation.z = o.splay;
    // the hip axle through a bearing block on the body side
    k.on(parent).push(x, y, z, 0, 0, o.splay ?? 0).cyl(-s * w * 0.55, 0, 0, w * 0.5, w * 0.5, w * 0.5, 10, 'st0', { axis: 'x' }).pop();
    k.on(hip);
    k.hinge(0, 0, 0, w * 1.2, w * 0.42, 3);
    if (o.angular) k.push(0, -o.lt / 2, 0, 0, Math.PI / 2, 0).prism(0, 0, 0, [[-w * 0.62, o.lt * 0.42], [w * 0.5, o.lt * 0.45], [w * 0.62, -o.lt * 0.2], [w * 0.4, -o.lt * 0.4], [-w * 0.5, -o.lt * 0.38]], w * 1.02, this.B(o.paint ?? 0)).pop();
    k.box(0, -o.lt / 2, 0, w * 0.8, o.lt - w * 0.3, w * 0.95, this.A(o.paint ?? 0), { ch: w * 0.14 });
    k.box(s * w * 0.42, -o.lt / 2, 0, w * 0.08, o.lt * 0.6, w * 0.7, this.A((o.paint ?? 0) + 1), { ch: w * 0.03 });
    k.bolt(s * w * 0.46, -o.lt * 0.3, w * 0.22, w * 0.07, s > 0 ? 'x' : '-x'); k.bolt(s * w * 0.46, -o.lt * 0.7, -w * 0.22, w * 0.07, s > 0 ? 'x' : '-x');
    k.push(0, -o.lt, 0).hinge(0, 0, 0, w * 1.1, w * 0.36, 3).pop();
    k.on(knee);
    k.cyl(0, -o.ls / 2, 0, w * 0.36, w * 0.3, o.ls - w * 0.3, 10, this.A((o.paint ?? 0) + 2));
    k.cyl(0, -o.ls * 0.25, 0, w * 0.42, w * 0.42, w * 0.18, 10, 'st0');
    k.push(0, -o.ls, 0).hinge(0, 0, 0, w * 0.9, w * 0.3, 2).pop();
    k.on(foot);
    const fH = w * 0.45;
    if (o.foot === 'claw') {
      for (const a of [-0.55, 0, 0.55]) k.push(0, -fH * 0.6, 0, 0, a, 0).box(0, 0, w * 0.55, w * 0.32, fH * 0.6, w * 1.1, 'st0', { ch: w * 0.06 }).prism(0, -fH * 0.1, w * 1.15, [[-w * 0.14, 0], [w * 0.14, 0], [0, -fH * 0.4]], w * 0.25, 'st1').pop();
      k.box(0, -fH * 0.6, -w * 0.4, w * 0.3, fH * 0.5, w * 0.7, 'st0', { ch: w * 0.05 });
    } else if (o.foot === 'paw') {
      k.box(0, -fH * 0.55, 0, w * 1.1, fH * 0.7, w * 1.1, 'pb0', { ch: w * 0.12 });
      k.box(0, -fH * 0.92, 0, w * 1.2, fH * 0.12, w * 1.2, 'tr');
    } else {
      k.box(0, -fH * 0.55, w * 0.2, w * 1.0, fH * 0.7, w * 1.8, 'pb0', { ch: w * 0.1 });
      k.box(0, -fH * 0.92, w * 0.2, w * 1.05, fH * 0.12, w * 1.85, 'tr');
      k.box(0, -fH * 0.4, w * 1.0, w * 0.9, fH * 0.4, w * 0.3, this.A(1), { ch: w * 0.06 });
    }
    // the knee cylinder: on the bend's outside, thigh lug to shin lug
    const fz = bird ? -1 : 1;
    k.on(hip).box(0, -o.lt * 0.22, fz * w * 0.6, w * 0.3, w * 0.35, w * 0.35, 'st0', { ch: w * 0.05 });
    k.on(knee).box(0, -o.ls * 0.32, fz * w * 0.42, w * 0.3, w * 0.35, w * 0.35, 'st0', { ch: w * 0.05 });
    makePiston(k, this.m.pistons, hip, [0, -o.lt * 0.22, fz * w * 0.78], knee, [0, -o.ls * 0.32, fz * w * 0.6], w * 0.16, o.lt * 0.55, o.ls * 0.5);
    const L: LegRig = { hip, knee, foot, lt: o.lt, ls: o.ls, ph: o.ph ?? 0, bird, hipH: o.hipH, footH: fH, side: s, splay: o.splay ?? 0 };
    this.m.legs.push(L);
    this.m.debris.push(knee);
    return L;
  }
  /** a track unit centred at x: side frame, road wheels, sprocket (rear), idler (front), return rollers, belt */
  track(parent: THREE.Object3D, x: number, len: number, h: number, w: number, o: { skirt?: string; wheels?: number } = {}) {
    const k = this.k, s = Math.sign(x), n = o.wheels ?? 4, rw = h * 0.27;
    k.on(parent);
    k.box(x, h * 0.45, 0, w * 0.35, h * 0.32, len * 0.78, 'dk', { ch: 0.01 });
    const z0 = -len / 2 + h * 0.42, z1 = len / 2 - h * 0.42, R = h * 0.4;
    const wheel = (z: number, y: number, r: number, teeth: boolean) => {
      const g = G(parent, x, y, z, 'wheel'); this.m.wheels.push({ g, r, side: s });
      k.on(g);
      k.cyl(0, 0, 0, r, r, w * 0.8, 10, 'rb', { axis: 'x', capReg: 'st0' });
      k.cyl(s * w * 0.42, 0, 0, r * 0.55, r * 0.55, 0.012, 8, 'st0', { axis: 'x' });
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; k.bolt(s * w * 0.45, Math.cos(a) * r * 0.32, Math.sin(a) * r * 0.32, r * 0.08, s > 0 ? 'x' : '-x'); }
      if (teeth) for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; k.push(0, Math.cos(a) * r, Math.sin(a) * r, a, 0, 0).box(0, r * 0.08, 0, w * 0.5, r * 0.2, r * 0.22, 'st0').pop(); }
      k.on(parent);
    };
    for (let i = 0; i < n; i++) wheel(z0 + ((i + 0.5) / n) * (z1 - z0), rw + 0.03, rw, false);
    wheel(z0 - h * 0.05, R + 0.02, R * 0.85, true); wheel(z1 + h * 0.05, R + 0.02, R * 0.8, false);
    for (const z of [-len * 0.15, len * 0.15]) { k.cyl(x, h * 0.86, z, h * 0.1, h * 0.1, w * 0.5, 8, 'st0', { axis: 'x' }); }
    // the belt: a loop round the end wheels, flat along the bottom and over the rollers
    const loop: [number, number][] = [];
    const cy = R + 0.02, t = 0.025;
    for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; loop.push([cy + Math.sin(a) * (R + t * 0.5), z1 + h * 0.05 + Math.cos(a) * (R + t * 0.5)]); }
    for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 + (i / 8) * Math.PI; loop.push([cy + Math.sin(a) * (R + t * 0.5), z0 - h * 0.05 + Math.cos(a) * (R + t * 0.5)]); }
    k.scroll = s > 0 ? 1 : 2;
    let dist = 0;
    for (let i = 0; i < loop.length; i++) {
      const [ya, za] = loop[i], [yb, zb] = loop[(i + 1) % loop.length];
      const l = Math.hypot(yb - ya, zb - za);
      const ny = -(zb - za) / l, nz = (yb - ya) / l; // outward (the loop runs clockwise seen from +x)
      const oy = ny * t * 0.5, oz = nz * t * 0.5, d = k.dens, v0 = dist * d * 1.6, v1 = (dist + l) * d * 1.6;
      const xa = x - w / 2, xb = x + w / 2;
      k.quad([xa, ya + oy, za + oz], [xb, ya + oy, za + oz], [xb, yb + oy, zb + oz], [xa, yb + oy, zb + oz], 'tr', [0, v0, w * d, v0, w * d, v1, 0, v1]);
      k.quad([xa, yb - oy, zb - oz], [xb, yb - oy, zb - oz], [xb, ya - oy, za - oz], [xa, ya - oy, za - oz], 'rb');
      k.quad([xb, ya + oy, za + oz], [xb, ya - oy, za - oz], [xb, yb - oy, zb - oz], [xb, yb + oy, zb + oz], 'tr', [0, v0, 0.1, v0, 0.1, v1, 0, v1]);
      k.quad([xa, ya + oy, za + oz], [xa, yb + oy, zb + oz], [xa, yb - oy, zb - oz], [xa, ya - oy, za - oz], 'tr', [0, v0, 0, v1, 0.1, v1, 0.1, v0]);
      dist += l;
    }
    k.scroll = 0;
    if (o.skirt) {
      k.box(x + s * (w * 0.5 + 0.012), h * 0.8, 0, 0.014, h * 0.38, len * 0.92, o.skirt, { ch: 0.004 });
      for (let i = 0; i < 4; i++) k.bolt(x + s * (w * 0.5 + 0.02), h * 0.9, -len * 0.38 + i * len * 0.253, 0.01, s > 0 ? 'x' : '-x');
    }
    this.m.tracks = true;
  }
  /** a gun barrel along +z from the origin of the current frame: a breech, a cooling jacket, a muzzle brake */
  barrel(len: number, r: number, o: { brake?: boolean; jacket?: boolean; twin?: number; regB?: string } = {}) {
    const k = this.k;
    k.cyl(0, 0, len * 0.08, r * 1.8, r * 1.8, len * 0.16, 10, 'dk', { axis: 'z' });
    if (o.jacket) { k.cyl(0, 0, len * 0.42, r * 1.55, r * 1.55, len * 0.5, 10, 'vent', { axis: 'z' }); k.cyl(0, 0, len * 0.17, r * 1.7, r * 1.7, len * 0.03, 10, 'st0', { axis: 'z' }); k.cyl(0, 0, len * 0.68, r * 1.7, r * 1.7, len * 0.03, 10, 'st0', { axis: 'z' }); }
    k.cyl(0, 0, len * 0.58, r, r * 0.92, len * 0.84, 10, o.regB ?? 'st0', { axis: 'z' });
    if (o.brake) { k.cyl(0, 0, len * 0.98, r * 1.5, r * 1.5, len * 0.08, 8, 'dk', { axis: 'z' }); for (const s of [-1, 1]) k.box(s * r * 1.5, 0, len * 0.98, r * 0.3, r * 1.6, len * 0.05, 'soot'); }
    else k.cyl(0, 0, len, r * 1.15, r * 1.15, len * 0.04, 8, 'dk', { axis: 'z' });
    return this;
  }
  /** a muzzle point at z in a group */
  muzzle(g: THREE.Object3D, x: number, y: number, z: number) { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); this.m.muzzles.push(o); return o; }
  lampAt(g: THREE.Object3D, x: number, y: number, z: number) { const o = new THREE.Object3D(); o.position.set(x, y, z); g.add(o); this.m.lamps.push(o); return o; }
  stack(g: THREE.Object3D, x: number, y: number, z: number, h: number, r: number) {
    const k = this.k; k.on(g);
    k.pipe([[x, y, z], [x, y + h, z]], r, 'soot', { collar: 'st0' });
    k.cyl(x, y + h * 0.4, z, r * 1.3, r * 1.3, r * 0.6, 8, 'st0');
    const o = new THREE.Object3D(); o.position.set(x, y + h + r, z); g.add(o); this.m.exhaust.push(o);
  }
  /** a whip antenna on a turned base with loading coils */
  antenna(g: THREE.Object3D, x: number, y: number, z: number, h: number) {
    const k = this.k; k.on(g);
    k.lathe(x, y, z, [[0.022, 0], [0.024, 0.02], [0.012, 0.035], [0.008, 0.05]], 8, 'st0');
    k.cyl(x, y + h / 2 + 0.04, z, 0.004, 0.006, h, 4, 'st1');
    k.cyl(x, y + 0.1, z, 0.012, 0.012, 0.02, 6, 'br');
  }
}

// ================================================================================================ the kinds
type Build = (c: Ctx) => void;
const BUILD: Record<string, Build> = {
  // ---------------------------------------------------------------------------------------------- U.S.P.C.
  /** a little two-legged survey walker: a turned sensor pod on bird legs, a light gun under its chin */
  scout(c) {
    const { k, m } = c; m.h = 0.62; m.r = 0.22; m.stride = 0.14;
    const hipY = 0.38;
    const hips = G(m.body, 0, hipY, 0, 'hips');
    k.on(hips);
    k.box(0, 0, 0, 0.16, 0.06, 0.1, 'pb0', { ch: 0.012 });
    k.cyl(0, 0.045, 0, 0.05, 0.06, 0.03, 10, 'st0');
    for (const s of [-1, 1]) c.leg(hips, s * 0.105, 0, 0, { lt: 0.18, ls: 0.2, w: 0.045, bird: true, foot: 'claw', ph: s > 0 ? 0 : Math.PI, hipH: hipY, side: s });
    const pod = G(hips, 0, 0.12, 0, 'pod'); m.turret = pod;
    k.on(pod);
    k.lathe(0, 0, 0, [[0.001, -0.17], [0.06, -0.165], [0.1, -0.13], [0.12, -0.06], [0.122, 0.04], [0.105, 0.11], [0.07, 0.15], [0.001, 0.165]], 12, 'pa0', { axis: 'z', regs: ['pa1', 'pa1', 'pa0', 'pa0', 'pa2', 'pa2', 'pas'] });
    k.cyl(0, 0, 0.0, 0.126, 0.126, 0.024, 16, 'br', { axis: 'z', caps: false });
    k.rivets([-0.126, 0.0, 0.0], [-0.126, 0.0, 0.0], 1, 0.005, '-x');
    // the lens barrel on the nose, a hood, a lamp, an aerial
    k.cyl(0, 0.02, 0.17, 0.045, 0.045, 0.06, 12, 'dk', { axis: 'z' });
    k.lathe(0, 0.02, 0.2, [[0.034, 0], [0.05, 0], [0.05, 0.012], [0.036, 0.012]], 12, 'br', { axis: 'z' });
    k.cyl(0, 0.02, 0.206, 0.034, 0.034, 0.004, 12, 'lens', { axis: 'z', wrap: false, capReg: 'lens' });
    k.push(0, 0.02, 0.18).cyl(0, 0, 0, 0.055, 0.058, 0.05, 8, 'pa1', { axis: 'z', arc: Math.PI, a0: 0, caps: false }).pop();
    for (const s of [-1, 1]) { k.push(s * 0.122, 0.0, 0.03, 0, 0, s * -Math.PI / 2).flange(0, 0, 0, 0.035, 0.008, 4, 'st0', 0.004).pop(); k.push(s * 0.13, 0, 0.03, 0, s * Math.PI / 2, 0).mark(0, 0, 0, 0.06).pop(); }
    k.push(0, -0.02, -0.168, 0, Math.PI, 0).decal(0, 0, 0, 0.12, 0.016, 'ser2').pop();
    c.antenna(pod, -0.05, 0.09, -0.06, 0.32);
    c.lampAt(pod, 0, 0.02, 0.21);
    // the chin gun on a pintle
    const gun = G(pod, 0, -0.1, 0.1, 'gun'); m.gun = gun; m.recoil.push(gun);
    k.on(pod).box(0, -0.07, 0.08, 0.03, 0.04, 0.04, 'st0', { ch: 0.006 });
    k.on(gun).box(0, 0, 0, 0.04, 0.035, 0.08, 'dk', { ch: 0.006 }).push(0, 0, 0.03).barrel(0.14, 0.007, { jacket: true }).pop();
    c.muzzle(gun, 0, 0, 0.18);
    m.debris.push(pod, gun);
  },
  /** a tracked loader: an engine chassis, an operator cab, a slewing boom with a two-jaw claw, a beacon */
  worker(c) {
    const { k, m } = c; m.h = 0.75; m.r = 0.36; m.stride = 0.3;
    for (const s of [-1, 1]) c.track(m.body, s * 0.2, 0.62, 0.2, 0.1, { skirt: c.A(1) });
    k.on(m.body);
    k.box(0, 0.27, 0, 0.32, 0.12, 0.58, 'pa0', { ch: 0.02 });
    k.box(0, 0.345, -0.16, 0.3, 0.03, 0.24, 'pb0', { ch: 0.008, f: { py: 'gr' } });
    k.push(0, 0.3, 0.291).box(0, 0, 0, 0.26, 0.06, 0.012, 'hz').pop();
    for (const s of [-1, 1]) k.push(s * 0.161, 0.27, 0.05, 0, s * Math.PI / 2, 0).mark(0, 0, 0, 0.08).pop();
    k.push(0.161, 0.27, -0.16, 0, Math.PI / 2, 0).decal(0, 0, 0, 0.18, 0.022, 'ser0').pop();
    c.stack(m.body, -0.11, 0.36, -0.24, 0.16, 0.018);
    // the cab: a riveted box, glass on three sides, a roof hatch, the beacon
    k.on(m.body);
    k.box(0.06, 0.45, -0.1, 0.18, 0.2, 0.2, 'pa1', { ch: 0.012, f: { pz: 'glass', px: 'glass' } });
    k.box(0.06, 0.56, -0.1, 0.2, 0.02, 0.22, 'pa2', { ch: 0.006 });
    k.push(0.06, 0.57, -0.12).hinge(0, 0, 0, 0.08, 0.008, 3).pop();
    k.cyl(0.12, 0.585, -0.16, 0.022, 0.026, 0.03, 8, 'st0');
    k.lathe(0.12, 0.6, -0.16, [[0.02, 0], [0.02, 0.03], [0.012, 0.04], [0.001, 0.042]], 8, 'lensB');
    c.lampAt(m.body, 0.12, 0.62, -0.16);
    // the slewing ring and the boom
    const sl = G(m.body, -0.06, 0.34, 0.12, 'slew'); m.turret = sl;
    k.on(m.body).cyl(-0.06, 0.34, 0.12, 0.08, 0.08, 0.02, 14, 'st0');
    k.on(sl);
    k.cyl(0, 0.02, 0, 0.07, 0.07, 0.03, 14, 'dk');
    for (const s of [-1, 1]) k.box(s * 0.04, 0.07, 0, 0.016, 0.08, 0.08, 'pa1', { ch: 0.004 });
    const boom = G(sl, 0, 0.09, 0, 'boom'); m.gun = boom;
    k.on(sl).hinge(0, 0.09, 0, 0.1, 0.016, 3);
    k.on(boom);
    k.push(0, 0, 0, -0.5, 0, 0);
    k.box(0, 0.0, 0.14, 0.05, 0.06, 0.3, c.A(2), { ch: 0.008 });
    k.box(0, 0.033, 0.14, 0.03, 0.006, 0.22, 'hz');
    k.pop();
    const wrist = G(boom, 0, -0.15, 0.25, 'wrist');
    k.on(boom).push(0, -0.15, 0.25).hinge(0, 0, 0, 0.07, 0.014, 3).pop();
    k.on(sl).box(0, 0.06, -0.035, 0.03, 0.03, 0.025, 'st0');
    k.on(boom).push(0, -0.08, 0.13, -0.5, 0, 0).box(0, -0.035, 0, 0.03, 0.02, 0.03, 'st0').pop();
    makePiston(k, m.pistons, sl, [0, 0.06, -0.05], boom, [0, -0.11, 0.1], 0.012, 0.1, 0.1);
    k.on(wrist);
    k.box(0, -0.03, 0, 0.08, 0.04, 0.05, 'pa0', { ch: 0.006 });
    for (const s of [-1, 1]) {
      const jaw = G(wrist, s * 0.03, -0.05, 0, 'jaw'); m.jaws.push(jaw); jaw.userData.s = s;
      k.on(wrist).push(s * 0.03, -0.05, 0).cyl(0, 0, 0, 0.01, 0.01, 0.05, 6, 'st1', { axis: 'z' }).pop();
      k.on(jaw).prism(0, 0, 0, [[-0.008, 0], [0.008, 0], [s * 0.02, -0.06], [s * 0.004, -0.1], [-s * 0.006, -0.08]].map(([a, b]) => [a, b] as [number, number]), 0.04, 'st0');
      k.box(s * 0.01, -0.085, 0, 0.012, 0.03, 0.044, 'hz');
    }
    m.debris.push(sl, boom, wrist);
  },
  /** the rifleman: a riveted biped with a helmet head and a rifle in place of its right forearm */
  trooper(c) {
    const { k, m } = c; m.h = 1.0; m.r = 0.25; m.stride = 0.17;
    const hipY = 0.5;
    const hips = G(m.body, 0, hipY, 0, 'hips');
    k.on(hips);
    k.box(0, 0, 0, 0.22, 0.08, 0.13, 'pb0', { ch: 0.015 });
    k.box(0, -0.03, 0.07, 0.12, 0.06, 0.02, c.A(1), { ch: 0.004 });
    for (const s of [-1, 1]) c.leg(hips, s * 0.09, -0.03, 0, { lt: 0.22, ls: 0.22, w: 0.06, foot: 'pad', ph: s > 0 ? 0 : Math.PI, hipH: hipY - 0.03, side: s });
    const torso = G(hips, 0, 0.06, 0, 'torso'); m.turret = torso;
    k.on(hips).cyl(0, 0.05, 0, 0.05, 0.055, 0.03, 10, 'st0');
    k.on(torso);
    // a pressed-steel chest with a riveted belly band, the star plate, the serial
    k.lathe(0, 0, 0, [[0.09, 0.0], [0.12, 0.05], [0.15, 0.17], [0.15, 0.24], [0.12, 0.29], [0.06, 0.31]], 10, 'pa0', { regs: ['pa1', 'pa0', 'pa0', 'pa2', 'pas'] });
    k.cyl(0, 0.06, 0, 0.128, 0.128, 0.03, 20, 'st0', { caps: false });
    k.push(0, 0.2, 0.145, -0.1, 0, 0).box(0, 0, 0, 0.12, 0.1, 0.012, 'pa1', { ch: 0.004 }).mark(0, 0, 0.006, 0.08).pop();
    k.push(0, 0.12, 0.143).decal(0, 0, 0, 0.14, 0.018, 'ser1').pop();
    k.box(0, 0.17, -0.14, 0.16, 0.18, 0.08, 'pa2', { ch: 0.012 }); // the radio pack
    k.box(0, 0.17, -0.181, 0.12, 0.1, 0.004, 'pa2', { f: { nz: 'gr' } });
    c.antenna(torso, 0.05, 0.26, -0.15, 0.4);
    // the head on a neck ring: a helmet with a visor slit
    k.cyl(0, 0.33, 0, 0.05, 0.055, 0.04, 10, 'st0');
    const head = G(torso, 0, 0.38, 0, 'head');
    k.on(head);
    k.lathe(0, 0, 0, [[0.07, -0.05], [0.085, -0.02], [0.088, 0.03], [0.07, 0.07], [0.035, 0.09], [0.001, 0.095]], 10, 'pa0', { regs: ['pa1', 'pa0', 'pa0', 'pas', 'pas'] });
    k.push(0, 0.005, 0.07, -0.05, 0, 0).box(0, 0, 0, 0.12, 0.028, 0.03, 'dk', { ch: 0.006, f: { pz: 'lamp' } }).pop();
    k.box(0, 0.04, 0.06, 0.15, 0.012, 0.06, 'pa1', { ch: 0.004 });
    c.lampAt(head, 0, 0.005, 0.09);
    // left arm hangs on a shoulder ball; the right forearm is the rifle
    const arm = (s: number) => {
      const sh = G(torso, s * 0.17, 0.25, 0, 'shoulder');
      k.on(torso).cyl(s * 0.155, 0.25, 0, 0.04, 0.04, 0.03, 10, 'st0', { axis: 'x' });
      k.on(sh);
      k.lathe(s * 0.02, 0, 0, [[0.03, -0.04], [0.05, -0.02], [0.052, 0.02], [0.03, 0.045]], 10, c.A(1));
      k.box(s * 0.02, -0.11, 0, 0.05, 0.16, 0.055, c.A(0), { ch: 0.01 });
      k.push(s * 0.02, -0.2, 0).hinge(0, 0, 0, 0.06, 0.02, 3).pop();
      const fo = G(sh, s * 0.02, -0.2, 0, 'fore');
      m.debris.push(sh);
      return { sh, fo };
    };
    const L = arm(1);
    k.on(L.fo).cyl(0, -0.08, 0, 0.026, 0.022, 0.14, 8, c.A(2));
    k.on(L.fo).box(0, -0.17, 0.01, 0.045, 0.05, 0.04, 'pb0', { ch: 0.008 });
    L.sh.rotation.x = -0.1; L.fo.rotation.x = -0.5;
    const R = arm(-1);
    m.gun = R.sh; m.recoil.push(R.fo);
    R.fo.rotation.x = -Math.PI / 2;
    k.on(R.fo);
    k.box(0, -0.03, 0, 0.05, 0.08, 0.05, 'pa1', { ch: 0.008 });
    k.push(0, -0.06, 0, Math.PI / 2, 0, 0);
    k.push(0, 0, 0, 0, 0, 0);
    k.box(0, 0, -0.0, 0.05, 0.05, 0.09, 'dk', { ch: 0.006 });
    k.push(0, 0, 0.04).barrel(0.3, 0.012, { jacket: true }).pop();
    k.cyl(0.0, -0.05, -0.0, 0.035, 0.035, 0.03, 12, 'pb0', { axis: 'x' }); // the drum
    k.pop(); k.pop();
    c.muzzle(R.fo, 0, -0.06 - 0.34, 0);
    m.debris.push(head, torso);
  },
  /** the tank-bot: a tracked hull with a robot torso for a turret, a cannon in a mantlet, a cupola head */
  heavy(c) {
    const { k, m } = c; m.h = 1.0; m.r = 0.45; m.stride = 0.35;
    for (const s of [-1, 1]) c.track(m.body, s * 0.27, 0.86, 0.24, 0.13, { skirt: c.A(2) });
    k.on(m.body);
    k.push(0, 0.33, 0, 0, -Math.PI / 2, 0).prism(0, 0, 0, [[-0.43, -0.08], [0.33, -0.08], [0.44, 0.02], [0.37, 0.1], [-0.41, 0.1]], 0.42, 'pa0', { capReg: 'pa1' }).pop();
    k.box(0, 0.44, -0.25, 0.3, 0.02, 0.22, 'pb0', { ch: 0.006, f: { py: 'gr' } });
    for (const s of [-1, 1]) k.push(s * 0.212, 0.34, 0.05, 0, s * Math.PI / 2, 0).mark(0, 0, 0, 0.1).pop();
    k.push(0, 0.39, 0.395, -0.85, 0, 0).decal(0, 0, 0, 0.26, 0.032, 'ser1').pop();
    for (const s of [-1, 1]) { k.lamp(s * 0.15, 0.4, 0.4, 0.028, 0.03, 'off', 'pa1', true); c.lampAt(m.body, s * 0.15, 0.4, 0.43); }
    c.stack(m.body, 0.16, 0.44, -0.36, 0.14, 0.022); c.stack(m.body, -0.16, 0.44, -0.36, 0.14, 0.022);
    // the turret ring and the torso turret
    k.cyl(0, 0.44, 0.02, 0.17, 0.17, 0.02, 16, 'st0');
    const tur = G(m.body, 0, 0.45, 0.02, 'turret'); m.turret = tur;
    k.on(tur);
    k.lathe(0, 0, 0, [[0.16, 0], [0.18, 0.06], [0.17, 0.16], [0.12, 0.22], [0.001, 0.23]], 10, 'pa0', { regs: ['pa1', 'pa0', 'pa2', 'pas'] });
    k.box(0, 0.08, -0.17, 0.22, 0.12, 0.08, 'pa2', { ch: 0.012 });
    k.push(0, 0.12, -0.21, 0, Math.PI, 0).decal(0, 0, 0, 0.2, 0.025, 'ser0').pop();
    // the cupola head with a lens and periscopes
    k.cyl(-0.07, 0.25, -0.03, 0.06, 0.065, 0.05, 10, 'pa1');
    k.push(-0.07, 0.25, 0.03).box(0, 0, 0, 0.05, 0.022, 0.02, 'dk', { f: { pz: 'lamp' } }).pop();
    k.push(-0.07, 0.276, -0.03).hinge(0, 0, 0, 0.1, 0.008, 3).pop();
    // the mantlet and gun on trunnions
    const gun = G(tur, 0, 0.1, 0.16, 'gun'); m.gun = gun;
    k.on(tur).box(0, 0.1, 0.15, 0.2, 0.1, 0.06, 'pa1', { ch: 0.01 });
    k.on(gun).cyl(0, 0, 0, 0.03, 0.03, 0.22, 8, 'st0', { axis: 'x' });
    const rec = G(gun, 0, 0, 0.03, 'recoil'); m.recoil.push(rec);
    k.on(rec).box(0, 0, 0.02, 0.1, 0.08, 0.06, 'dk', { ch: 0.01 }).push(0, 0, 0.03).barrel(0.5, 0.022, { brake: true }).pop();
    c.muzzle(rec, 0, 0, 0.57);
    // a coaxial MG
    k.on(rec).push(0.06, -0.02, 0.04).barrel(0.16, 0.006).pop();
    m.debris.push(tur, gun);
  },
  /** the mortar walker: four short legs under a gun platform, a heavy tube on a cradle, shell racks */
  artillery(c) {
    const { k, m } = c; m.h = 0.9; m.r = 0.42; m.stride = 0.14;
    const hipY = 0.32;
    const deck = G(m.body, 0, hipY, 0, 'deck');
    k.on(deck);
    k.box(0, 0.03, 0, 0.44, 0.1, 0.5, 'pa0', { ch: 0.02 });
    k.box(0, 0.09, 0, 0.36, 0.02, 0.42, 'pb0', { ch: 0.006 });
    for (const s of [-1, 1]) k.push(s * 0.221, 0.03, 0, 0, s * Math.PI / 2, 0).mark(-0.12, 0, 0, 0.07).decal(0.08, 0, 0, 0.16, 0.02, 'ser3').pop();
    let i = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      c.leg(deck, sx * 0.19, -0.02, sz * 0.18, { lt: 0.16, ls: 0.17, w: 0.05, foot: 'paw', ph: (i === 0 || i === 3) ? 0 : Math.PI, hipH: hipY - 0.02, side: sx, splay: sx * 0.25 });
      i++;
    }
    // the cradle and the tube
    const tr = G(deck, 0, 0.12, 0, 'traverse'); m.turret = tr;
    k.on(deck).cyl(0, 0.11, 0, 0.12, 0.12, 0.02, 14, 'st0');
    k.on(tr);
    for (const s of [-1, 1]) k.box(s * 0.08, 0.06, 0, 0.02, 0.12, 0.1, 'pa1', { ch: 0.005 });
    const gun = G(tr, 0, 0.1, 0, 'tube'); m.gun = gun; gun.userData.minPitch = 0.6;
    k.on(gun).cyl(0, 0, 0, 0.025, 0.025, 0.18, 8, 'st0', { axis: 'x' });
    const rec = G(gun, 0, 0, 0, 'recoil'); m.recoil.push(rec);
    k.on(rec);
    k.lathe(0, 0, -0.12, [[0.05, 0], [0.06, 0.04], [0.055, 0.1], [0.048, 0.5], [0.054, 0.52], [0.054, 0.55], [0.044, 0.55]], 12, 'pa2', { axis: 'z', regs: ['dk', 'dk', 'pa2', 'st0', 'st0', 'soot'] });
    k.cyl(0, 0, 0.12, 0.062, 0.062, 0.03, 12, 'st0', { axis: 'z' });
    c.muzzle(rec, 0, 0, 0.44);
    makePiston(k, m.pistons, tr, [0, 0.02, 0.07], gun, [0, -0.06, 0.12], 0.012, 0.08, 0.07);
    // shell racks on the deck's rear corners
    k.on(deck);
    for (const s of [-1, 1]) { k.box(s * 0.12, 0.12, -0.17, 0.12, 0.06, 0.08, 'st0', { ch: 0.006 }); for (let j = 0; j < 3; j++) k.lathe(s * 0.12 + (j - 1) * 0.035, 0.15, -0.17, [[0.014, 0], [0.014, 0.05], [0.008, 0.07], [0.001, 0.075]], 6, 'br'); }
    c.antenna(deck, 0.17, 0.1, -0.21, 0.35);
    m.debris.push(tr, rec);
  },
  /** the big quadruped: a hull on four long legs, a turret with twin cannons, a glazed cockpit, floodlights */
  walker(c) {
    const { k, m } = c; m.h = 2.0; m.r = 0.8; m.stride = 0.32;
    const hipY = 1.1;
    const hull = G(m.body, 0, hipY, 0, 'hull');
    k.on(hull);
    k.box(0, 0.1, 0, 0.8, 0.32, 1.1, 'pa0', { ch: 0.05 });
    k.box(0, -0.1, 0, 0.6, 0.12, 0.9, 'pb0', { ch: 0.03 });
    k.push(0, 0.16, 0.55, -0.5, 0, 0).box(0, 0, 0, 0.6, 0.2, 0.03, 'pa1', { ch: 0.01, f: { pz: 'glass' } }).pop();
    for (const s of [-1, 0, 1]) k.box(s * 0.15, 0.17, 0.57, 0.02, 0.2, 0.03, 'st0');
    for (const s of [-1, 1]) {
      k.push(s * 0.401, 0.1, 0.0, 0, s * Math.PI / 2, 0).mark(0.2, 0, 0, 0.18).decal(-0.18, 0.04, 0, 0.4, 0.05, 'ser0').pop();
      k.rivets([s * 0.401, 0.24, -0.5], [s * 0.401, 0.24, 0.5], 14, 0.008, s > 0 ? 'x' : '-x');
      k.lamp(s * 0.3, 0.02, 0.56, 0.05, 0.05, 'off', 'pa1', true); c.lampAt(hull, s * 0.3, 0.02, 0.62);
    }
    // ladder rungs up the hull's left flank
    for (let j = 0; j < 4; j++) k.box(0.41, -0.05 + j * 0.08, -0.35, 0.03, 0.012, 0.12, 'st1');
    let i = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      c.leg(hull, sx * 0.44, -0.05, sz * 0.4, { lt: 0.56, ls: 0.6, w: 0.13, foot: 'paw', ph: (i === 0 || i === 3) ? 0 : Math.PI, hipH: hipY - 0.05, side: sx, paint: i });
      i++;
    }
    c.stack(hull, 0.25, 0.26, -0.45, 0.35, 0.04); c.stack(hull, -0.25, 0.26, -0.45, 0.35, 0.04);
    k.on(hull).cyl(0, 0.27, -0.05, 0.28, 0.28, 0.03, 18, 'st0');
    const tur = G(hull, 0, 0.29, -0.05, 'turret'); m.turret = tur;
    k.on(tur);
    k.lathe(0, 0, 0, [[0.27, 0], [0.3, 0.08], [0.27, 0.2], [0.16, 0.27], [0.001, 0.28]], 12, 'pa0', { regs: ['pa1', 'pa0', 'pa2', 'pas'] });
    k.push(0, 0.1, -0.29, 0, Math.PI, 0).decal(0, 0, 0, 0.36, 0.045, 'ser2').pop();
    k.cyl(0.1, 0.3, -0.06, 0.07, 0.075, 0.06, 10, 'pa1'); k.push(0.1, 0.33, -0.06).hinge(0, 0, 0, 0.12, 0.01, 3).pop();
    c.antenna(tur, -0.15, 0.24, -0.15, 0.6);
    const gun = G(tur, 0, 0.13, 0.25, 'gun'); m.gun = gun;
    k.on(tur).box(0, 0.13, 0.24, 0.34, 0.16, 0.08, 'pa1', { ch: 0.02 });
    k.on(gun).cyl(0, 0, 0, 0.04, 0.04, 0.4, 8, 'st0', { axis: 'x' });
    for (const s of [-1, 1]) {
      const rec = G(gun, s * 0.1, 0, 0.04, 'recoil'); m.recoil.push(rec);
      k.on(rec).box(0, 0, 0.02, 0.1, 0.1, 0.08, 'dk', { ch: 0.01 }).push(0, 0, 0.05).barrel(0.7, 0.026, { brake: true }).pop();
      c.muzzle(rec, 0, 0, 0.8);
    }
    m.debris.push(tur, gun);
  },

  // ---------------------------------------------------------------------------------------------- Soviet
  /** a twin-rotor gun drone: a slab-sided pod, ducted rotors on outriggers, a drum-fed gun in the nose */
  sov_drone(c) {
    const { k, m } = c; m.h = 0.5; m.r = 0.4; m.hover = 1.25;
    const pod = G(m.body, 0, 0, 0, 'pod'); m.turret = pod;
    k.on(pod);
    k.push(0, 0, 0, 0, -Math.PI / 2, 0).prism(0, 0, 0, [[-0.26, -0.06], [0.18, -0.09], [0.28, -0.02], [0.22, 0.08], [-0.2, 0.1], [-0.28, 0.02]], 0.24, 'pa0', { capReg: 'pa1' }).pop();
    k.box(0, 0.11, -0.02, 0.18, 0.04, 0.3, 'pb0', { ch: 0.01 });
    for (const s of [-1, 1]) { k.push(s * 0.121, 0.0, -0.02, 0, s * Math.PI / 2, 0).mark(0.06, 0, 0, 0.09).decal(-0.12, -0.02, 0, 0.16, 0.02, 'ser0').pop(); k.rivets([s * 0.121, 0.07, -0.24], [s * 0.121, 0.07, 0.2], 9, 0.006, s > 0 ? 'x' : '-x'); k.rivets([s * 0.121, -0.06, -0.24], [s * 0.121, -0.07, 0.16], 9, 0.006, s > 0 ? 'x' : '-x'); }
    for (const s of [-1, 1]) {
      // outrigger beam, a bolted flange, the duct and the rotor
      k.on(pod);
      k.box(s * 0.24, 0.06, -0.04, 0.24, 0.04, 0.05, c.B(0), { ch: 0.008 });
      k.push(s * 0.13, 0.06, -0.04, 0, 0, s * -Math.PI / 2).flange(0, 0, 0, 0.04, 0.01, 4, 'st0', 0.005).pop();
      const nx = s * 0.4;
      k.torus(nx, 0.06, -0.04, 0.15, 0.022, 18, 5, c.B(1));
      for (let j = 0; j < 4; j++) { const a = (j / 4) * TAU + Math.PI / 4; k.box(nx + Math.cos(a) * 0.075, 0.05, -0.04 + Math.sin(a) * 0.075, 0.008, 0.008, 0.15, 'st0').push(0, 0, 0).pop(); }
      k.cyl(nx, 0.06, -0.04, 0.03, 0.03, 0.07, 8, 'dk');
      const rot = G(pod, nx, 0.09, -0.04, 'rotor'); rot.userData.dir = s; m.rotors.push(rot);
      k.on(rot);
      for (let j = 0; j < 3; j++) k.push(0, 0, 0, 0, (j / 3) * TAU, 0.12).box(0.07, 0, 0, 0.13, 0.006, 0.03, 'st1').pop();
      k.cyl(0, 0.01, 0, 0.016, 0.012, 0.02, 6, 'br');
      m.debris.push(rot);
    }
    const gun = G(pod, 0, -0.07, 0.2, 'gun'); m.gun = gun; m.recoil.push(gun);
    k.on(pod).box(0, -0.06, 0.18, 0.06, 0.04, 0.06, 'st0', { ch: 0.006 });
    k.on(gun).box(0, -0.01, 0, 0.05, 0.04, 0.07, 'dk', { ch: 0.006 }).cyl(0, -0.045, -0.01, 0.035, 0.035, 0.03, 12, 'pb1', { axis: 'x' }).push(0, 0, 0.03).barrel(0.16, 0.008, { jacket: true }).pop();
    c.muzzle(gun, 0, 0, 0.2);
    k.on(pod).lamp(0, 0.03, 0.27, 0.025, 0.03, 'red', 'pa1', false); c.lampAt(pod, 0, 0.03, 0.3);
  },
  /** the Soviet infantry machine: a slab chest with a sloped glacis, a periscope turret head, a drum gun and a claw */
  sov_trooper(c) {
    const { k, m } = c; m.h = 1.12; m.r = 0.3; m.stride = 0.16;
    const hipY = 0.52;
    const hips = G(m.body, 0, hipY, 0, 'hips');
    k.on(hips).box(0, 0, 0, 0.26, 0.09, 0.15, 'pb0', { ch: 0.006 });
    k.rivets([-0.12, 0.03, 0.076], [0.12, 0.03, 0.076], 8, 0.006, 'z');
    for (const s of [-1, 1]) c.leg(hips, s * 0.11, -0.03, 0, { lt: 0.22, ls: 0.24, w: 0.07, foot: 'pad', ph: s > 0 ? 0 : Math.PI, hipH: hipY - 0.03, side: s, angular: true });
    const torso = G(hips, 0, 0.06, 0, 'torso'); m.turret = torso;
    k.on(torso);
    k.push(0, 0.16, 0, 0, Math.PI / 2, 0).prism(0, 0, 0, [[-0.13, -0.14], [0.12, -0.14], [0.16, 0.0], [0.08, 0.16], [-0.12, 0.16]], 0.34, 'pa0', { capReg: 'pa2' }).pop();
    k.box(0, 0.31, -0.02, 0.36, 0.03, 0.22, 'pb0', { ch: 0.006 });
    k.push(0, 0.2, 0.137, -0.55, 0, 0).mark(0, 0, 0.0, 0.1).pop();
    k.push(0, 0.06, 0.122).decal(0, 0, 0, 0.2, 0.025, 'serB0').pop();
    for (const y of [0.04, 0.27]) k.rivets([-0.16, y, 0.125], [0.16, y, 0.125], 9, 0.006, 'z');
    for (const s of [-1, 1]) k.rivets([s * 0.171, 0.04, -0.1], [s * 0.171, 0.26, -0.1], 6, 0.006, s > 0 ? 'x' : '-x');
    c.stack(torso, -0.1, 0.3, -0.12, 0.18, 0.022);
    // the head turret with a periscope
    k.cyl(0, 0.33, 0, 0.07, 0.07, 0.02, 10, 'st0');
    const head = G(torso, 0, 0.35, 0, 'head');
    k.on(head).push(0, 0.04, 0, 0, Math.PI / 2, 0).prism(0, 0, 0, [[-0.08, -0.04], [0.07, -0.04], [0.09, 0.0], [0.05, 0.05], [-0.07, 0.05]], 0.13, 'pa1').pop();
    k.box(0.03, 0.1, 0.02, 0.03, 0.05, 0.03, 'dk', { f: { pz: 'red' } });
    k.box(-0.02, 0.04, 0.085, 0.07, 0.018, 0.01, 'dk', { f: { pz: 'red' } });
    c.lampAt(head, -0.02, 0.04, 0.1);
    // arms: shoulder blocks with drum gun (right), a three-prong claw (left)
    for (const s of [-1, 1]) {
      const sh = G(torso, s * 0.2, 0.24, 0, 'shoulder');
      k.on(torso).box(s * 0.175, 0.24, 0, 0.03, 0.08, 0.08, 'st0');
      k.on(sh).box(s * 0.03, 0, 0, 0.08, 0.1, 0.12, c.B(1), { ch: 0.008 }).rivets([s * 0.071, 0.03, -0.04], [s * 0.071, 0.03, 0.04], 3, 0.005, s > 0 ? 'x' : '-x');
      k.box(s * 0.03, -0.14, 0, 0.06, 0.18, 0.07, c.A(1), { ch: 0.008 });
      k.push(s * 0.03, -0.23, 0).hinge(0, 0, 0, 0.07, 0.022, 3).pop();
      const fo = G(sh, s * 0.03, -0.23, 0, 'fore');
      m.debris.push(sh);
      if (s < 0) {
        m.gun = sh; m.recoil.push(fo); fo.rotation.x = -Math.PI / 2;
        k.on(fo).box(0, -0.05, 0, 0.06, 0.1, 0.07, 'pa2', { ch: 0.008 });
        k.push(0, -0.09, 0, Math.PI / 2, 0, 0).cyl(0, -0.05, -0.0, 0.05, 0.05, 0.04, 12, 'pb1', { axis: 'x' }).box(0, 0, 0.0, 0.05, 0.05, 0.08, 'dk').push(0, 0, 0.04).barrel(0.3, 0.012, { jacket: true }).pop().pop();
        c.muzzle(fo, 0, -0.09 - 0.35, 0);
      } else {
        fo.rotation.x = -0.6;
        k.on(fo).box(0, -0.06, 0, 0.065, 0.12, 0.075, 'pa2', { ch: 0.008 });
        for (const a of [0, 2.1, 4.2]) { const j = G(fo, Math.cos(a) * 0.022, -0.13, Math.sin(a) * 0.022, 'jaw'); j.userData.s = Math.cos(a) > 0 ? 1 : -1; m.jaws.push(j); k.on(j).prism(0, 0, 0, [[-0.01, 0], [0.01, 0], [0.004, -0.09]], 0.02, 'st1'); }
      }
    }
    m.debris.push(head, torso);
  },
  /** the Soviet tank: a low slab hull with a sloped glacis, skirted tracks, a cast mushroom turret, a long gun */
  sov_tank(c) {
    const { k, m } = c; m.h = 0.85; m.r = 0.5; m.stride = 0.4;
    for (const s of [-1, 1]) c.track(m.body, s * 0.3, 1.0, 0.24, 0.14, { skirt: c.B(1), wheels: 5 });
    k.on(m.body);
    k.push(0, 0.32, 0, 0, -Math.PI / 2, 0).prism(0, 0, 0, [[-0.5, -0.07], [0.38, -0.08], [0.52, 0.02], [0.3, 0.09], [-0.48, 0.09]], 0.46, 'pa0', { capReg: 'pa1' }).pop();
    k.rivets([-0.2, 0.41, 0.29], [0.2, 0.41, 0.29], 8, 0.007, 'y');
    k.push(0, 0.36, 0.42, -1.1, 0, 0).decal(0, 0, 0, 0.3, 0.04, 'serB1').pop();
    k.box(0, 0.42, -0.36, 0.34, 0.02, 0.18, 'pb0', { f: { py: 'gr' } });
    for (const s of [-1, 1]) c.stack(m.body, s * 0.16, 0.42, -0.46, 0.08, 0.026);
    // fuel drums on the rear deck in straps
    for (const s of [-1, 1]) { k.cyl(s * 0.12, 0.47, -0.27, 0.045, 0.045, 0.16, 10, c.B(2), { axis: 'x' }); k.torus(s * 0.12, 0.47, -0.27, 0.048, 0.004, 10, 3, 'st0', 'x'); }
    k.cyl(0, 0.42, 0.06, 0.2, 0.2, 0.02, 16, 'st0');
    const tur = G(m.body, 0, 0.43, 0.06, 'turret'); m.turret = tur;
    k.on(tur);
    k.lathe(0, 0, 0, [[0.21, 0], [0.24, 0.04], [0.23, 0.1], [0.17, 0.16], [0.08, 0.19], [0.001, 0.195]], 10, 'pa0', { regs: ['pa1', 'pa0', 'pa2', 'pa2', 'pas'] });
    for (const s of [-1, 1]) k.push(Math.sin(s * 1.5) * 0.235, 0.08, Math.cos(s * 1.5) * 0.235, 0, s * 1.5, 0).mark(0, 0, 0, 0.11).pop();
    k.cyl(-0.08, 0.2, -0.05, 0.06, 0.06, 0.04, 10, 'pa1'); k.push(-0.08, 0.223, -0.05).hinge(0, 0, 0, 0.1, 0.008, 3).pop();
    k.box(0.1, 0.205, -0.02, 0.02, 0.02, 0.05, 'dk', { f: { pz: 'red' } });
    const gun = G(tur, 0, 0.08, 0.2, 'gun'); m.gun = gun;
    k.on(tur).push(0, 0.08, 0.19).lathe(0, 0, 0, [[0.09, -0.03], [0.1, 0.0], [0.08, 0.06], [0.04, 0.08]], 10, 'pa1', { axis: 'z' }).pop();
    const rec = G(gun, 0, 0, 0.05, 'recoil'); m.recoil.push(rec);
    k.on(gun).cyl(0, 0, 0, 0.03, 0.03, 0.24, 8, 'st0', { axis: 'x' });
    k.on(rec).barrel(0.72, 0.024, { brake: true, regB: c.A(0) });
    c.muzzle(rec, 0, 0, 0.76);
    m.debris.push(tur, gun);
  },
  /** the titan: a riveted tower on heavy legs, twin cannon arms, a searchlight, a smokestack */
  sov_titan(c) {
    const { k, m } = c; m.h = 2.5; m.r = 0.7; m.stride = 0.36;
    const hipY = 1.15;
    const hips = G(m.body, 0, hipY, 0, 'hips');
    k.on(hips).box(0, 0, 0, 0.6, 0.18, 0.36, 'pb0', { ch: 0.02 });
    k.rivets([-0.27, 0.06, 0.181], [0.27, 0.06, 0.181], 12, 0.01, 'z');
    for (const s of [-1, 1]) c.leg(hips, s * 0.27, -0.06, 0, { lt: 0.5, ls: 0.55, w: 0.16, foot: 'pad', ph: s > 0 ? 0 : Math.PI, hipH: hipY - 0.06, side: s, angular: true });
    const tower = G(hips, 0, 0.1, 0, 'tower'); m.turret = tower;
    k.on(tower);
    k.push(0, 0.35, 0, 0, Math.PI / 2, 0).prism(0, 0, 0, [[-0.3, -0.35], [0.26, -0.35], [0.34, -0.05], [0.2, 0.35], [-0.28, 0.35]], 0.7, 'pa0', { capReg: 'pa2' }).pop();
    k.box(0, 0.73, -0.02, 0.6, 0.06, 0.46, 'pb0', { ch: 0.01 });
    k.push(0, 0.4, 0.31, -0.35, 0, 0).mark(0, 0, 0.01, 0.24).pop();
    k.push(0, 0.08, 0.3).decal(0, 0, 0, 0.5, 0.06, 'serB2').pop();
    for (const y of [0.05, 0.7]) k.rivets([-0.32, y, 0.27], [0.32, y, 0.27], 14, 0.01, 'z');
    for (const s of [-1, 1]) for (const y of [0.1, 0.4, 0.66]) k.rivets([s * 0.351, y, -0.26], [s * 0.351, y, 0.24], 10, 0.01, s > 0 ? 'x' : '-x');
    c.stack(tower, 0.2, 0.76, -0.2, 0.5, 0.05); c.stack(tower, 0.05, 0.76, -0.22, 0.4, 0.04);
    // the command cupola with vision blocks and a searchlight on a yoke
    k.cyl(-0.12, 0.8, 0.05, 0.13, 0.14, 0.1, 10, 'pa1');
    for (let j = 0; j < 5; j++) { const a = (j / 5) * TAU; k.push(-0.12 + Math.sin(a) * 0.135, 0.82, 0.05 + Math.cos(a) * 0.135, 0, a, 0).box(0, 0, 0, 0.04, 0.02, 0.01, 'dk', { f: { pz: 'red' } }).pop(); }
    k.push(0.18, 0.79, 0.12).box(0, 0, 0, 0.14, 0.02, 0.1, 'st0').pop();
    k.push(0.18, 0.86, 0.14).lamp(0, 0, 0, 0.06, 0.07, 'lamp', 'pa1', true).pop();
    c.lampAt(tower, 0.18, 0.86, 0.22);
    for (const s of [-1, 1]) {
      const sh = G(tower, s * 0.44, 0.5, 0, 'shoulder');
      k.on(tower).push(s * 0.35, 0.5, 0, 0, 0, s * -Math.PI / 2).flange(0, 0, 0, 0.12, 0.02, 8, 'st0', 0.012).pop();
      k.on(sh).box(s * 0.04, 0, 0, 0.14, 0.24, 0.26, c.B(s > 0 ? 0 : 1), { ch: 0.02 });
      k.rivets([s * 0.111, 0.1, -0.11], [s * 0.111, 0.1, 0.11], 6, 0.009, s > 0 ? 'x' : '-x');
      const rec = G(sh, s * 0.04, -0.05, 0.12, 'recoil'); m.recoil.push(rec);
      k.on(rec).box(0, 0, 0, 0.12, 0.12, 0.12, 'dk', { ch: 0.01 }).push(0, 0, 0.05).barrel(0.75, 0.035, { brake: true, jacket: true }).pop();
      c.muzzle(rec, 0, 0, 0.82);
      m.debris.push(sh);
    }
    m.gun = tower.getObjectByName('shoulder') as THREE.Group;
    m.debris.push(tower);
  },

  // ---------------------------------------------------------------------------------------------- PRC
  /** a fast three-wheeled scout: a streamlined pod, a sprung front fork, a gun on a ring mount */
  prc_scout(c) {
    const { k, m } = c; m.h = 0.6; m.r = 0.32; m.stride = 0.3;
    k.on(m.body);
    k.lathe(0, 0.24, 0, [[0.001, -0.36], [0.06, -0.34], [0.12, -0.24], [0.14, -0.06], [0.13, 0.14], [0.09, 0.3], [0.03, 0.38], [0.001, 0.39]], 12, 'pa0', { axis: 'z', regs: ['pa1', 'pa1', 'pa0', 'pa0', 'pb0', 'pbs', 'pbs'] });
    k.cyl(0, 0.24, -0.04, 0.143, 0.143, 0.016, 16, 'st0', { axis: 'z', caps: false });
    for (const s of [-1, 1]) k.push(s * 0.141, 0.26, -0.12, 0, s * Math.PI / 2, 0).mark(0, 0, 0, 0.09).pop();
    k.push(0.14, 0.22, 0.08, 0, Math.PI / 2, 0).decal(0, 0, 0, 0.18, 0.022, 'ser0').pop();
    k.push(0, 0.3, 0.24, -0.9, 0, 0).box(0, 0, 0, 0.12, 0.08, 0.01, 'dk', { f: { pz: 'glass' } }).pop();
    // rear wheels on trailing arms, the front wheel in a fork
    for (const s of [-1, 1]) {
      k.box(s * 0.15, 0.16, -0.22, 0.03, 0.04, 0.12, 'st0', { ch: 0.006 });
      const w = G(m.body, s * 0.2, 0.11, -0.24, 'wheel'); m.wheels.push({ g: w, r: 0.11, side: s });
      k.on(w).cyl(0, 0, 0, 0.11, 0.11, 0.06, 12, 'rb', { axis: 'x', capReg: 'st0' }).cyl(s * 0.032, 0, 0, 0.06, 0.06, 0.008, 10, c.B(0), { axis: 'x' });
      for (let j = 0; j < 4; j++) { const a = (j / 4) * TAU; k.bolt(s * 0.036, Math.cos(a) * 0.03, Math.sin(a) * 0.03, 0.006, s > 0 ? 'x' : '-x'); }
      k.on(m.body);
    }
    for (const s of [-1, 1]) k.box(s * 0.045, 0.16, 0.3, 0.012, 0.12, 0.02, 'st0');
    const fw = G(m.body, 0, 0.09, 0.32, 'wheel'); m.wheels.push({ g: fw, r: 0.09, side: 1 });
    k.on(fw).cyl(0, 0, 0, 0.09, 0.09, 0.05, 12, 'rb', { axis: 'x', capReg: 'st0' }).cyl(0, 0, 0, 0.012, 0.012, 0.1, 6, 'st1', { axis: 'x' });
    // the gun on a ring mount atop the pod
    k.on(m.body).cyl(0, 0.38, -0.05, 0.07, 0.07, 0.02, 12, 'st0');
    const tur = G(m.body, 0, 0.39, -0.05, 'mount'); m.turret = tur;
    k.on(tur).lathe(0, 0, 0, [[0.06, 0], [0.065, 0.03], [0.04, 0.06], [0.001, 0.065]], 10, 'pb0');
    const gun = G(tur, 0, 0.04, 0.04, 'gun'); m.gun = gun; m.recoil.push(gun);
    k.on(gun).lathe(0, 0, -0.04, [[0.02, 0], [0.026, 0.02], [0.026, 0.08], [0.015, 0.1]], 8, 'pa1', { axis: 'z' }).push(0, 0, 0.05).barrel(0.2, 0.008).pop();
    c.muzzle(gun, 0, 0, 0.26);
    c.antenna(m.body, -0.07, 0.34, -0.25, 0.45);
    k.on(m.body).lamp(0, 0.2, 0.37, 0.03, 0.03, 'lensB', 'pa1', false); c.lampAt(m.body, 0, 0.2, 0.4);
    m.debris.push(tur, fw);
  },
  /** the PRC infantry machine: turned shell torso, a domed head with a long visor, a long rifle, a radio pack */
  prc_trooper(c) {
    const { k, m } = c; m.h = 1.05; m.r = 0.24; m.stride = 0.18;
    const hipY = 0.52;
    const hips = G(m.body, 0, hipY, 0, 'hips');
    k.on(hips).lathe(0, -0.04, 0, [[0.06, 0], [0.11, 0.02], [0.115, 0.06], [0.07, 0.09]], 12, 'pb0');
    for (const s of [-1, 1]) c.leg(hips, s * 0.085, -0.02, 0, { lt: 0.23, ls: 0.24, w: 0.055, foot: 'pad', ph: s > 0 ? 0 : Math.PI, hipH: hipY - 0.02, side: s, paint: 1 });
    const torso = G(hips, 0, 0.06, 0, 'torso'); m.turret = torso;
    k.on(torso);
    k.lathe(0, 0, 0, [[0.07, 0], [0.12, 0.06], [0.135, 0.16], [0.12, 0.27], [0.07, 0.31], [0.04, 0.32]], 14, 'pa0', { regs: ['pb0', 'pa0', 'pa0', 'pas', 'pas'] });
    k.cyl(0, 0.13, 0, 0.137, 0.137, 0.02, 20, 'pb1', { caps: false });
    k.push(0, 0.21, 0.125, -0.25, 0, 0).mark(0, 0, 0.0, 0.08).pop();
    k.push(0, 0.08, 0.126).decal(0, 0, 0, 0.16, 0.02, 'ser1').pop();
    k.lathe(0, 0.17, -0.15, [[0.001, -0.08], [0.05, -0.075], [0.06, 0.0], [0.05, 0.075], [0.001, 0.08]], 10, 'pb0', { axis: 'z' }); // the radio pod
    k.box(0, 0.17, -0.11, 0.05, 0.06, 0.03, 'st0');
    c.antenna(torso, 0.04, 0.24, -0.16, 0.5);
    k.cyl(0, 0.33, 0, 0.045, 0.05, 0.03, 10, 'st0');
    const head = G(torso, 0, 0.37, 0, 'head');
    k.on(head).lathe(0, 0, 0, [[0.06, -0.04], [0.078, -0.01], [0.078, 0.03], [0.06, 0.06], [0.03, 0.075], [0.001, 0.078]], 12, 'pa0', { regs: ['pb0', 'pa0', 'pas', 'pas', 'pas'] });
    k.push(0, 0.012, 0.0).cyl(0, 0, 0, 0.081, 0.081, 0.022, 16, 'dk', { arc: Math.PI * 0.9, a0: Math.PI * 0.05, caps: false }).pop();
    k.on(head).push(0, 0.012, 0.0).cyl(0, 0, 0, 0.079, 0.079, 0.012, 16, 'lensB', { arc: Math.PI * 0.7, a0: Math.PI * 0.15, caps: false, wrap: false }).pop();
    c.lampAt(head, 0, 0.012, 0.09);
    for (const s of [-1, 1]) {
      const sh = G(torso, s * 0.15, 0.24, 0, 'shoulder');
      k.on(torso).cyl(s * 0.135, 0.24, 0, 0.035, 0.035, 0.03, 10, 'st0', { axis: 'x' });
      k.on(sh).lathe(s * 0.015, 0, 0, [[0.025, -0.04], [0.042, -0.02], [0.044, 0.02], [0.025, 0.04]], 10, 'pa1');
      k.cyl(s * 0.015, -0.11, 0, 0.026, 0.022, 0.16, 10, c.A(0));
      k.push(s * 0.015, -0.2, 0).hinge(0, 0, 0, 0.05, 0.018, 3).pop();
      const fo = G(sh, s * 0.015, -0.2, 0, 'fore');
      k.on(fo).cyl(0, -0.08, 0, 0.022, 0.02, 0.14, 10, c.A(1));
      m.debris.push(sh);
      if (s < 0) { m.gun = sh; sh.rotation.x = -0.2; fo.rotation.x = -1.2; }
      else { sh.rotation.set(-0.9, 0, -0.3); fo.rotation.x = -0.9; }
    }
    // the long rifle carried across both hands (on the right arm's group)
    const rs = m.gun!.getObjectByName('fore') as THREE.Group;
    const rifle = G(rs, 0, -0.16, 0, 'rifle'); rifle.rotation.x = Math.PI / 2 - 0.0; m.recoil.push(rifle);
    k.on(rifle).box(0, 0, -0.06, 0.03, 0.05, 0.2, 'pb1', { ch: 0.006 }).box(0, -0.035, -0.03, 0.02, 0.05, 0.03, 'dk').push(0, 0.01, 0.04).barrel(0.42, 0.009, { regB: 'dk' }).pop();
    c.muzzle(rifle, 0, 0.01, 0.48);
    m.debris.push(head, torso);
  },
  /** the PRC mech: a turned hull on six legs, a rocket pod on a slewing mount, a sensor dome */
  prc_mech(c) {
    const { k, m } = c; m.h = 1.6; m.r = 0.8; m.stride = 0.22;
    const hipY = 0.85;
    const hull = G(m.body, 0, hipY, 0, 'hull');
    k.on(hull);
    k.lathe(0, 0, 0, [[0.001, -0.18], [0.2, -0.16], [0.36, -0.08], [0.4, 0.04], [0.34, 0.14], [0.2, 0.2], [0.001, 0.21]], 16, 'pa0', { regs: ['pb0', 'pb0', 'pa0', 'pa1', 'pas', 'pas'] });
    k.cyl(0, -0.02, 0, 0.405, 0.405, 0.03, 24, 'pb1', { caps: false });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6, side = Math.sin(a) > 0 ? 1 : -1;
      const hx = Math.sin(a) * 0.38, hz = Math.cos(a) * 0.38;
      const mount = G(hull, hx, -0.04, hz, 'legmount'); mount.rotation.y = a - Math.PI / 2 * side;
      k.on(hull).push(hx, -0.04, hz, 0, a, 0).box(0, 0, -0.01, 0.1, 0.1, 0.06, 'st0', { ch: 0.01 }).pop();
      c.leg(mount, 0, 0, 0, { lt: 0.45, ls: 0.55, w: 0.08, foot: 'claw', ph: i % 2 ? 0 : Math.PI, hipH: hipY - 0.04, side, splay: 0, bird: true, paint: i });
    }
    for (const s of [-1, 1]) k.push(s * 0.4, 0.05, 0.0, 0, s * Math.PI / 2, 0).mark(0, 0, 0.01, 0.14).pop();
    k.push(0, 0.03, 0.4).decal(0, 0, 0.004, 0.36, 0.045, 'ser2').pop();
    k.lamp(0, -0.02, 0.405, 0.05, 0.05, 'lensB', 'pa1', true); c.lampAt(hull, 0, -0.02, 0.46);
    const tur = G(hull, 0, 0.2, 0, 'mount'); m.turret = tur;
    k.on(hull).cyl(0, 0.2, 0, 0.14, 0.14, 0.02, 14, 'st0');
    k.on(tur).lathe(0, 0, 0, [[0.13, 0], [0.14, 0.05], [0.1, 0.1], [0.001, 0.11]], 12, 'pa1');
    k.lathe(-0.06, 0.1, -0.03, [[0.04, 0], [0.04, 0.03], [0.02, 0.055], [0.001, 0.06]], 10, 'glass');
    const gun = G(tur, 0, 0.1, 0.0, 'pod'); m.gun = gun; gun.userData.minPitch = 0.15;
    for (const s of [-1, 1]) k.on(tur).box(s * 0.13, 0.07, 0, 0.02, 0.1, 0.08, 'st0');
    k.on(gun).cyl(0, 0, 0, 0.02, 0.02, 0.28, 6, 'st0', { axis: 'x' });
    const rec = G(gun, 0, 0.0, 0, 'recoil'); m.recoil.push(rec);
    k.on(rec).box(0, 0, 0.06, 0.22, 0.12, 0.26, c.B(0), { ch: 0.02 });
    for (let j = 0; j < 6; j++) { const x = -0.07 + (j % 3) * 0.07, y = j < 3 ? 0.03 : -0.03; k.cyl(x, y, 0.19, 0.022, 0.022, 0.012, 8, 'soot', { axis: 'z' }); }
    k.push(0.111, 0, 0.06, 0, Math.PI / 2, 0).decal(0, 0, 0, 0.2, 0.025, 'serB3').pop();
    c.muzzle(rec, 0, 0, 0.2);
    m.debris.push(tur, rec);
  },

  // ---------------------------------------------------------------------------------------------- expedition
  /** the expedition rover: six wheels on rocker bogies, a cream body, a dish, a mast lamp and a light gun */
  expedition_rover(c) {
    const { k, m } = c; m.h = 0.9; m.r = 0.45; m.stride = 0.3;
    k.on(m.body);
    k.box(0, 0.36, 0, 0.44, 0.2, 0.8, 'pa0', { ch: 0.03 });
    k.box(0, 0.47, -0.08, 0.38, 0.04, 0.5, 'pb0', { ch: 0.01 });
    k.push(0, 0.42, 0.401, -0.3, 0, 0).box(0, 0, 0, 0.36, 0.1, 0.01, 'dk', { f: { pz: 'glass' } }).pop();
    for (const s of [-1, 1]) { k.push(s * 0.221, 0.36, 0, 0, s * Math.PI / 2, 0).mark(0.18, 0, 0, 0.1).decal(-0.1, 0.0, 0, 0.3, 0.036, 'ser0').pop(); }
    for (const s of [-1, 1]) {
      // the rocker beam on a pivot, three wheels
      const piv = G(m.body, s * 0.25, 0.26, 0, 'rocker');
      k.on(m.body).cyl(s * 0.235, 0.26, 0, 0.03, 0.03, 0.03, 8, 'st0', { axis: 'x' });
      k.on(piv).box(s * 0.02, -0.04, 0, 0.03, 0.04, 0.66, 'st0', { ch: 0.006 });
      for (const z of [-0.3, 0, 0.3]) {
        k.on(piv).box(s * 0.02, -0.09, z, 0.02, 0.08, 0.03, 'st0');
        const w = G(piv, s * 0.06, -0.15, z, 'wheel'); m.wheels.push({ g: w, r: 0.11, side: s });
        k.on(w).cyl(0, 0, 0, 0.11, 0.11, 0.07, 12, 'rb', { axis: 'x', capReg: 'st0' }).cyl(s * 0.036, 0, 0, 0.065, 0.065, 0.006, 10, c.B(0), { axis: 'x' });
        for (let j = 0; j < 5; j++) { const a = (j / 5) * TAU; k.bolt(s * 0.04, Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0.006, s > 0 ? 'x' : '-x'); }
      }
    }
    // the dish on a bracket, the mast lamp, a ring-mounted gun
    k.on(m.body).push(-0.1, 0.49, -0.25).cyl(0, 0.04, 0, 0.012, 0.012, 0.08, 6, 'st0').push(0, 0.1, 0, -0.6, 0, 0).lathe(0, 0, 0, [[0.006, 0], [0.05, 0.01], [0.1, 0.035], [0.12, 0.06], [0.11, 0.065], [0.05, 0.02], [0.006, 0.01]], 12, 'pas').cyl(0, 0.07, 0, 0.004, 0.004, 0.12, 4, 'st1').pop().pop();
    c.antenna(m.body, 0.15, 0.49, -0.32, 0.5);
    k.on(m.body).lamp(0.15, 0.62, -0.3, 0.03, 0.03, 'lamp', 'pa1', false); c.lampAt(m.body, 0.15, 0.62, -0.27);
    k.on(m.body).cyl(0.05, 0.49, 0.15, 0.08, 0.08, 0.02, 12, 'st0');
    const tur = G(m.body, 0.05, 0.5, 0.15, 'mount'); m.turret = tur;
    k.on(tur).box(0, 0.04, 0, 0.1, 0.06, 0.1, 'pa1', { ch: 0.01 });
    const gun = G(tur, 0, 0.06, 0.04, 'gun'); m.gun = gun; m.recoil.push(gun);
    k.on(gun).box(0, 0, 0, 0.04, 0.04, 0.08, 'dk').push(0, 0, 0.03).barrel(0.18, 0.007).pop();
    c.muzzle(gun, 0, 0, 0.22);
    m.debris.push(tur);
  },
};
export const modelTris = (m: UnitModel) => m.tris;
export type { V3 };
