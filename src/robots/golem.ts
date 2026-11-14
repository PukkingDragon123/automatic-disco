// Unit 07, the golem, as hardware: five hand-designed assemblies, one per stage, built from the machine kit.
//   0 drone       a faceted survey head: a lens barrel with an iris, a hood, side sensor pods on trunnion bosses,
//                 a dorsal fin and two stabilisers on root fairings, a gimballed thruster, an antenna mast
//   1 frame       the head on a turntable neck and yoke over a riveted boiler drum: a hinged reactor porthole,
//                 a nameplate and star plate, a meter bracket, pipes from flanged ports, a wiring loom on P-clamps,
//                 a back rack with a tube cage, a junction box and two short stacks, a hover emitter underneath
//   2 hauler      shoulder bearings bolted to the drum, box-section arms with elbow hinges, stick cylinders on
//                 clevis lugs, telescopic wrist rams and three-finger manipulators; a hydraulic reservoir on saddles
//                 with hoses to the shoulders; the gravity-coil skirt on a flange with hinged petals
//   3 war machine armour that follows the drum with a standing gap and bolts, pauldrons, floodlights on yokes,
//                 tall exhaust stacks with rain flaps, an ammo drum feeding a shoulder gun, a tool rack
//   4 colossus    a heavy armoured chest around a caged reactor, a cockpit head with a lens cluster and a
//                 rangefinder, layered plate, hips with a thruster skirt, digitigrade-free walking legs on hinges
//                 with knee and ankle cylinders
// Everything that moves is its own group; everything bolted to it is merged into that group's one mesh.
import * as THREE from 'three';
import { Kit, type V3 } from './kit';
import type { BabyLook } from '../game/babyLook';

const TAU = Math.PI * 2;
export type GStage = 0 | 1 | 2 | 3 | 4;
export interface GFinger { prox: THREE.Group; dist: THREE.Group; k: number; thumb: boolean }
export interface GPiston { from: THREE.Object3D; to: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; g: THREE.Group; rod: THREE.Group; lb: number; lr: number }
export interface GArm {
  id: 'armR' | 'armL'; root: THREE.Group; upper: THREE.Group; fore: THREE.Group; hand: THREE.Group; ram: number;
  fingers: GFinger[]; k: number; punch: number; spin: number; s: number;
}
export interface GLeg { k: number; hip: THREE.Group; thigh: THREE.Group; shin: THREE.Group; foot: THREE.Group; lt: number; ls: number; ph: number; plant: THREE.Vector3 }
export interface GRig {
  stage: GStage; model: THREE.Group; scaleK: number;
  body: THREE.Group | null; neck: THREE.Group | null; head: THREE.Group; jaw: THREE.Group;
  arms: GArm[]; legs: GLeg[]; pistons: GPiston[];
  iris: THREE.Group[]; fins: THREE.Group[]; petals: THREE.Group[]; flaps: THREE.Group[]; hatch: THREE.Group | null;
  dish: THREE.Group | null; bulb: THREE.Object3D | null; gun: THREE.Group | null;
  exhaust: THREE.Object3D[]; thrusters: THREE.Object3D[]; lamps: THREE.Object3D[]; mouth: THREE.Object3D;
  parts: Record<string, THREE.Object3D[]>; plates: THREE.Mesh[]; geos: THREE.BufferGeometry[];
  /** layout: where things sit in model space for the animator */
  L: { bodyY: number; headY: number; armY: number; armX: number; hover: number; hipY: number };
  tris: number;
}
export interface GSpec { look: BabyLook; stage: GStage; has: (id: string) => boolean }

/** the build stage from the chassis parts and skills */
export function stageOf(has: (id: string) => boolean): GStage {
  if (!has('torso')) return 0;
  if (has('colossus')) return 4;
  if (has('plating2') || has('reactor')) return 3;
  if (has('armR') || has('armL') || has('coil')) return 2;
  return 1;
}

const G = () => new THREE.Group();
function at(parent: THREE.Object3D, x = 0, y = 0, z = 0, name = '') { const g = G(); g.position.set(x, y, z); g.name = name; parent.add(g); return g; }

export function buildGolem(S: GSpec, mats: THREE.Material[]): GRig {
  const L = S.look, st = S.stage, has = S.has;
  const bb = 0.94 + L.bulk * 0.14;
  const k = new Kit(st === 4 ? 3.4 : 4.4);
  const model = G();
  const parts: Record<string, THREE.Object3D[]> = {};
  const plates: THREE.Mesh[] = [];
  const plateKits: { g: THREE.Group; k: Kit }[] = [];
  const wrap = (id: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const w = at(parent, x, y, z, 'part:' + id); (parts[id] ??= []).push(w); return w; };
  const pistons: GPiston[] = [];
  const iris: THREE.Group[] = [], fins: THREE.Group[] = [], petals: THREE.Group[] = [], flaps: THREE.Group[] = [];
  const exhaust: THREE.Object3D[] = [], thrusters: THREE.Object3D[] = [], lamps: THREE.Object3D[] = [];
  const A = (i: number) => ['pa0', 'pa1', 'pa2'][i % 3], B = (i: number) => ['pb0', 'pb1', 'pb2'][i % 3];
  const big = st === 4;
  const SK = big ? 1.32 : 1;
  model.scale.setScalar(SK);
  const Lay = big ? { bodyY: 0.86, headY: 1.28, armY: 1.0, armX: 0.42 * bb, hover: 0.0, hipY: 0.5 } : st === 0 ? { bodyY: 0.5, headY: 0.36, armY: 0.64, armX: 0.3 * bb, hover: 0.2, hipY: 0 } : { bodyY: 0.5, headY: 0.86, armY: 0.64, armX: 0.3 * bb, hover: 0.42, hipY: 0 };
  // pistons: a barrel on a clevis in one bone, a chrome rod to a lug in another; the animator keeps them aimed
  const piston = (from: THREE.Object3D, a: V3, to: THREE.Object3D, b: V3, r: number, lb: number, lr: number) => {
    const g = at(from, ...a), rod = at(g);
    k.on(g);
    k.cyl(0, lb / 2, 0, r, r, lb, 8, 'hose', { wrap: true });
    k.cyl(0, lb - r * 0.25, 0, r * 1.18, r * 1.18, r * 0.5, 8, 'st0');
    k.cyl(0, r * 0.3, 0, r * 1.1, r * 1.1, r * 0.6, 8, 'st0');
    k.push(0, 0, 0, 0, 0, 0).clevis(r * 1.2, r * 0.9, r * 1.2).pop();
    // a hose port near the top of the barrel
    k.cyl(r * 1.05, lb * 0.8, 0, r * 0.35, r * 0.35, r * 0.6, 6, 'br', { axis: 'x' });
    k.on(rod);
    k.cyl(0, -lr / 2, 0, r * 0.55, r * 0.55, lr, 8, 'st1');
    k.push(0, 0, 0, Math.PI, 0, 0).clevis(r * 1.1, r * 0.8, r * 1.0).pop();
    pistons.push({ from, to, a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), g, rod, lb, lr });
  };

  // ================================================================================================ the head
  const headParent = G();
  const head = G();
  const jaw = G();
  const hr = 0.15; // shell radius
  const mouth = new THREE.Object3D();
  let dish: THREE.Group | null = null, bulb: THREE.Object3D | null = null;
  const buildHead = (cockpit: boolean) => {
    k.on(head);
    // the shell: an upper dome in paint, a lower bowl in steel, a riveted brass equator belt
    const seg = 12;
    k.lathe(0, 0, 0, [[hr, 0.012], [hr * 0.97, 0.045], [hr * 0.86, 0.085], [hr * 0.64, 0.118], [hr * 0.34, 0.138], [0.001, 0.145]], seg, 'pas', { a0: Math.PI / 2, regs: ['pa0', 'pa0', 'pa1', 'pa1', 'pas'] });
    k.lathe(0, 0, 0, [[0.001, -0.135], [hr * 0.38, -0.128], [hr * 0.7, -0.105], [hr * 0.92, -0.065], [hr, -0.012]], seg, 'pb0', { a0: Math.PI / 2 });
    k.cyl(0, 0, 0, hr + 0.006, hr + 0.006, 0.026, seg * 2, 'br', { a0: Math.PI / 2 });
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; if (Math.abs(Math.sin(a)) > 0.93 && Math.cos(a) > 0) continue; k.push(Math.sin(a) * (hr + 0.0065), 0, Math.cos(a) * (hr + 0.0065), 0, a, 0).rivets([0, 0.007, 0], [0, -0.007, 0], 2, 0.0035, 'z').pop(); }
    // the lens barrel(s), sunk into the shell on a bolted mounting ring
    const lens = (lx: number, ly: number, r: number, main: boolean) => {
      k.cyl(lx, ly, hr - 0.02, r + 0.018, r + 0.018, 0.05, 12, 'st0', { axis: 'z', caps: 'top' });
      k.push(0, 0, hr + 0.004).boltCircle(lx, ly, 0, r + 0.011, 8, 0.0045).pop();
      k.cyl(lx, ly, hr + 0.033, r, r, 0.05, 12, 'dk', { axis: 'z', caps: false });
      k.cyl(lx, ly, hr + 0.035, r + 0.004, r + 0.004, 0.014, 16, 'knurl', { axis: 'z', caps: false });
      k.lathe(lx, ly, hr + 0.058, [[r * 0.8, 0], [r + 0.006, 0], [r + 0.006, 0.012], [r * 0.86, 0.012], [r * 0.8, 0]], 12, 'br', { axis: 'z' });
      if (main) { // a hood over the top half
        k.push(lx, ly, hr + 0.04).cyl(0, 0, 0.01, r + 0.012, r + 0.016, 0.055, 8, 'pa1', { axis: 'z', arc: Math.PI, a0: 0, caps: false }).pop();
      }
    };
    const lensGlass = (lx: number, ly: number, r: number) => {
      k.on(head, 1);
      k.cyl(lx, ly, hr + 0.054, r * 0.96, r * 0.96, 0.006, 14, 'lens', { axis: 'z', wrap: false, capReg: 'lens' });
      k.on(head);
    };
    const irisAt = (lx: number, ly: number, r: number) => {
      const ir = at(head, lx, ly, hr + 0.06, 'iris');
      // six blades, each pivoting on a pin at the rim; closed, their tips meet in the middle
      for (let i = 0; i < 6; i++) {
        const th = (i / 6) * TAU, rr = r * 0.97;
        const b = at(ir, Math.cos(th) * rr, Math.sin(th) * rr, i * 0.0005); b.rotation.z = th + Math.PI; b.userData.base = th + Math.PI;
        k.on(b);
        const w = r * 0.34;
        k.prism(0, 0, 0, [[0, -w * 0.5], [rr * 0.55, -w * 0.62], [rr * 1.04, -w * 0.08], [rr * 1.0, w * 0.5], [rr * 0.45, w * 0.7], [0, w * 0.55]], 0.0022, 'dk');
        k.cyl(0, 0, 0.0016, 0.0035, 0.0035, 0.002, 6, 'st1', { axis: 'z' });
        iris.push(b);
      }
    };
    if (L.head === 'twin') {
      for (const s of [-1, 1]) { lens(s * 0.058, 0.0, 0.04, false); lensGlass(s * 0.058, 0, 0.04); irisAt(s * 0.058, 0, 0.04); }
      k.box(0, 0.052, hr + 0.01, 0.17, 0.014, 0.06, 'pa1', { ch: 0.004 }); // brow
    } else {
      lens(0, 0.004, 0.062, true); lensGlass(0, 0.004, 0.062); irisAt(0, 0.004, 0.062);
      if (L.head === 'visor') { // a slatted sun visor on two hinge arms
        k.box(0, 0.085, hr + 0.065, 0.16, 0.012, 0.05, 'pa2', { ch: 0.003 });
        for (const s of [-1, 1]) { k.box(s * 0.078, 0.07, hr + 0.035, 0.008, 0.03, 0.05, 'st0'); k.bolt(s * 0.083, 0.062, hr + 0.025, 0.006, s > 0 ? 'x' : '-x'); }
      }
    }
    // the jaw: an intake grille door hinged under the lens
    jaw.position.set(0, -0.07, hr - 0.025); head.add(jaw);
    k.on(head).push(0, -0.07, hr - 0.025).hinge(0, 0, 0, 0.09, 0.008, 3).pop();
    k.on(jaw);
    k.box(0, -0.022, 0.012, 0.1, 0.04, 0.012, 'pa0', { ch: 0.003, f: { pz: 'gr' } });
    k.rivets([-0.044, -0.036, 0.019], [0.044, -0.036, 0.019], 5, 0.003, 'z');
    mouth.position.set(0, -0.025, 0.03); jaw.add(mouth);
    k.on(head);
    // side sensor pods on trunnion bosses (the yoke holds the head by these)
    for (const s of [-1, 1]) {
      k.cyl(s * (hr + 0.004), 0, 0, 0.034, 0.034, 0.03, 10, 'st0', { axis: 'x' });
      k.cyl(s * (hr + 0.026), 0, 0, 0.026, 0.03, 0.016, 10, 'pa1', { axis: 'x' });
      k.cyl(s * (hr + 0.036), 0, 0, 0.012, 0.012, 0.01, 6, 'st1', { axis: 'x' });
      // a small grille on the pod's front
      k.box(s * (hr + 0.024), 0, 0.03, 0.016, 0.026, 0.006, 'pa1', { f: { pz: 'gr' } });
    }
    // a carrying handle on two bosses, a red tally lamp, a nameplate over the hood
    k.lathe(0.07, 0.12, -0.04, [[0.012, -0.01], [0.012, 0.012], [0.008, 0.016]], 6, 'st0');
    k.lathe(-0.07, 0.12, -0.04, [[0.012, -0.01], [0.012, 0.012], [0.008, 0.016]], 6, 'st0');
    k.tube([[-0.07, 0.132, -0.04], [-0.066, 0.165, -0.045], [0.066, 0.165, -0.045], [0.07, 0.132, -0.04]], 0.007, 6, 'st1');
    k.push(-0.09, 0.095, 0.08, -0.6, -0.5, 0).cyl(0, 0, 0, 0.011, 0.011, 0.012, 8, 'st0', { axis: 'z' }).pop();
    k.on(head, 1).push(-0.09, 0.095, 0.08, -0.6, -0.5, 0).cyl(0, 0, 0.007, 0.008, 0.008, 0.004, 8, 'red', { axis: 'z', wrap: false, capReg: 'red' }).pop().on(head);
    k.push(0.07, 0.085, 0.112, -0.5, 0.4, 0).box(0, 0, 0, 0.06, 0.02, 0.005, 'pas').decal(0, 0, 0.0025, 0.056, 0.016, 'ser2').rivets([-0.026, 0, 0.003], [0.026, 0, 0.003], 2, 0.0025, 'z').pop();
    // the dorsal fin on its root fairing
    const finD = at(head, 0, 0.1, -0.09, 'fin'); finD.rotation.x = 0.35; fins.push(finD);
    k.on(head).push(0, 0.1, -0.09, 0.35, 0, 0).box(0, 0.004, 0, 0.018, 0.016, 0.06, 'pa0', { ch: 0.005 }).bolt(0.009, 0.004, 0.018, 0.004, 'x').bolt(0.009, 0.004, -0.018, 0.004, 'x').pop();
    k.on(finD).push(0, 0.012, 0, 0, Math.PI / 2, 0).prism(0, 0, 0, [[-0.03, 0], [0.032, 0], [0.05, 0.075], [0.03, 0.08]], 0.006, 'pa2').pop();
    k.on(finD).push(0, 0.012, 0).hinge(0, 0, 0, 0.012, 0.004, 1).pop();
    // the thruster: a bell on a gimbal ring, low on the back, and two vernier nozzles
    const th = at(head, 0, -0.06, -hr + 0.01, 'thruster'); th.rotation.x = -0.75;
    k.on(head).push(0, -0.06, -hr + 0.01, -0.75 + Math.PI, 0, 0).flange(0, 0, -0.02, 0.05, 0.012, 6, 'st0', 0.005).pop();
    k.on(th).push(0, 0, 0, Math.PI / 2, 0, 0);
    k.lathe(0, 0, 0, [[0.022, -0.01], [0.026, -0.03], [0.034, -0.05], [0.046, -0.075], [0.05, -0.08], [0.04, -0.08], [0.03, -0.055], [0.018, -0.03]], 10, 'dk');
    k.torus(0, -0.022, 0, 0.032, 0.005, 10, 4, 'br');
    k.pop();
    const thTip = new THREE.Object3D(); thTip.position.set(0, -0.085, 0); th.add(thTip); thTip.rotation.x = 0; thrusters.push(thTip);
    k.on(th, 1).push(0, 0, 0, Math.PI / 2, 0, 0).cyl(0, -0.075, 0, 0.034, 0.034, 0.004, 10, 'lamp', { wrap: false, capReg: 'lamp' }).pop();
    if (st === 0) for (const s of [-1, 1]) {
      // stabilisers: swept fins on root fairings low on the sides, each on a hinge
      const f = at(head, s * 0.11, -0.055, -0.07, 'fin'); f.rotation.set(0.2, s * 0.5, s * -0.7); fins.push(f);
      k.on(head).push(s * 0.11, -0.055, -0.07, 0.2, s * 0.5, s * -0.7).box(0, 0.006, 0, 0.022, 0.02, 0.05, 'pa0', { ch: 0.005 }).pop();
      k.on(f).push(0, 0.014, 0).hinge(0, 0, 0, 0.016, 0.004, 1).pop();
      k.on(f).push(0, 0.016, 0, 0, Math.PI / 2, 0).prism(0, 0, 0, [[-0.024, 0], [0.026, 0], [0.042, 0.055], [0.022, 0.06]], 0.005, 'pa1').pop();
      // vernier jets
      k.on(head).push(s * 0.12, -0.03, -0.09, 0, s * 0.9, 0).lathe(0, 0, 0, [[0.008, 0], [0.012, -0.015], [0.016, -0.025]], 6, 'dk', { axis: 'z' }).pop();
    }
    // what sits on top (the look's choice), on a turned mount with a cable to the shell
    k.on(head);
    if (L.top === 'antenna') {
      k.push(0.06, 0.12, -0.03, 0, 0, -0.25);
      k.lathe(0, 0, 0, [[0.016, -0.016], [0.018, 0], [0.012, 0.012], [0.006, 0.02]], 8, 'st0');
      k.cyl(0, 0.12, 0, 0.0032, 0.0045, 0.2, 5, 'st1');
      for (let i = 0; i < 2; i++) k.cyl(0, 0.05 + i * 0.05, 0, 0.009, 0.009, 0.016, 8, 'br');
      k.pop();
      const b = new THREE.Object3D(); b.position.set(0.06 + Math.sin(0.25) * 0.225, 0.12 + Math.cos(0.25) * 0.225, -0.03); head.add(b); bulb = b;
      k.on(head, 1).push(0.06, 0.12, -0.03, 0, 0, -0.25).cyl(0, 0.228, 0, 0.011, 0.011, 0.016, 8, 'red', { wrap: false, capReg: 'red' }).pop().on(head);
      k.cable([0.05, 0.105, -0.02], [0.02, 0.13, -0.07], 0.004, 0.003);
    } else if (L.top === 'tubes') {
      k.box(0, 0.13, -0.035, 0.1, 0.02, 0.05, 'pa1', { ch: 0.004 });
      for (const s of [-1, 0, 1]) { k.cyl(s * 0.03, 0.15, -0.035, 0.012, 0.012, 0.012, 8, 'br'); k.on(head, 1).lathe(s * 0.03, 0.156, -0.035, [[0.009, 0], [0.01, 0.03], [0.007, 0.042], [0.001, 0.046]], 8, 'lamp', { wrap: false }).on(head); }
      for (const s of [-1, 1]) k.tube([[s * 0.05, 0.14, -0.06], [s * 0.05, 0.2, -0.06], [s * 0.05, 0.2, -0.01], [s * 0.05, 0.14, -0.01]], 0.003, 4, 'st1');
    } else if (L.top === 'dish') {
      const dg = at(head, 0, 0.13, -0.04, 'dish'); dish = dg;
      k.lathe(0, 0.13, -0.04, [[0.02, -0.01], [0.02, 0.006], [0.012, 0.012]], 8, 'st0');
      k.on(dg);
      k.cyl(0, 0.02, 0, 0.007, 0.007, 0.03, 6, 'st1');
      k.push(0, 0.05, 0, -0.9, 0, 0);
      k.lathe(0, 0, 0, [[0.006, -0.004], [0.03, 0.004], [0.055, 0.016], [0.07, 0.03], [0.066, 0.034], [0.05, 0.022], [0.028, 0.012], [0.006, 0.006]], 10, 'pas');
      k.cyl(0, 0.04, 0, 0.003, 0.003, 0.07, 4, 'st1'); k.cyl(0, 0.075, 0, 0.008, 0.006, 0.012, 6, 'br');
      k.pop(); k.on(head);
    } else {
      k.box(0, 0.13, -0.035, 0.07, 0.02, 0.05, 'br', { ch: 0.004 });
      for (let i = 0; i < 3; i++) { k.on(head, 1).push(-0.022 + i * 0.022, 0.15, -0.035, 0.1 * (i - 1), 0, (i - 1) * 0.25).lathe(0, 0, 0, [[0.008, 0], [0.01, 0.03 + i * 0.01], [0.001, 0.05 + i * 0.012]], 6, 'lamp', { wrap: false }).pop().on(head); }
      k.box(0, 0.152, -0.035, 0.08, 0.008, 0.012, 'st0'); k.bolt(-0.036, 0.152, -0.029, 0.004, 'z'); k.bolt(0.036, 0.152, -0.029, 0.004, 'z');
    }
    if (cockpit) buildCockpit();
  };
  // the colossus head: the survey head inside an armoured cockpit with a lens cluster and a rangefinder
  const buildCockpit = () => {
    k.on(head);
    // a cradle frame around the shell: two side cheeks, a crown plate, a chin plate
    for (const s of [-1, 1]) {
      k.push(s * 0.205, 0.005, -0.01, 0, Math.PI / 2, 0);
      k.prism(0, 0, 0, [[-0.15, -0.11], [0.15, -0.1], [0.17, 0.03], [0.1, 0.13], [-0.13, 0.135], [-0.16, 0.0]], 0.028, 'pa0', { capReg: A(s > 0 ? 1 : 2) });
      k.rivets([-0.12, 0.1, 0.016], [0.08, 0.11, 0.016], 6, 0.004, 'z');
      k.rivets([-0.13, -0.085, 0.016], [0.12, -0.08, 0.016], 7, 0.004, 'z');
      k.pop();
      // trunnion caps through the cheeks
      k.cyl(s * 0.225, 0, 0, 0.04, 0.04, 0.02, 10, 'st0', { axis: 'x' });
      k.push(s * 0.236, 0, 0, 0, 0, s * Math.PI / 2).boltCircle(0, 0, 0, 0.028, 6, 0.005).pop();
    }
    k.box(0, 0.14, -0.01, 0.38, 0.028, 0.29, 'pa1', { ch: 0.01 });
    k.box(0, 0.162, -0.04, 0.3, 0.018, 0.2, 'pa2', { ch: 0.006 });
    k.rivets([-0.17, 0.155, 0.12], [0.17, 0.155, 0.12], 9, 0.004, 'y');
    k.box(0, -0.125, 0.02, 0.36, 0.024, 0.26, 'pb0', { ch: 0.008 });
    // the cockpit glass: a slanted bay above the main lens, framed and barred
    k.push(0, 0.085, 0.16, -0.45, 0, 0);
    k.box(0, 0, 0, 0.3, 0.075, 0.02, 'pa0', { ch: 0.005, f: { pz: 'glass' } });
    for (const s of [-1, 0, 1]) k.box(s * 0.075, 0, 0.012, 0.01, 0.075, 0.008, 'st0');
    k.box(0, 0.04, 0.012, 0.31, 0.01, 0.01, 'st0'); k.box(0, -0.04, 0.012, 0.31, 0.01, 0.01, 'st0');
    k.pop();
    // the lens cluster: four secondary lenses around the main one
    for (const [lx, ly, r] of [[-0.13, 0.0, 0.03], [0.13, 0.0, 0.03], [-0.11, -0.07, 0.022], [0.11, -0.07, 0.022]] as const) {
      k.on(head);
      k.cyl(lx, ly, 0.16, r + 0.01, r + 0.012, 0.05, 10, 'dk', { axis: 'z' });
      k.lathe(lx, ly, 0.185, [[r * 0.8, 0], [r + 0.008, 0], [r + 0.008, 0.01], [r * 0.8, 0.01]], 10, 'br', { axis: 'z' });
      k.on(head, 1).cyl(lx, ly, 0.186, r * 0.85, r * 0.85, 0.004, 10, lx > 0 && ly < 0 ? 'lensB' : 'lens', { axis: 'z', wrap: false }).on(head);
    }
    // a rangefinder bar across the crown, its two end windows
    k.cyl(0, 0.2, -0.02, 0.022, 0.022, 0.46, 10, 'pa0', { axis: 'x' });
    for (const s of [-1, 1]) { k.cyl(s * 0.232, 0.2, -0.02, 0.028, 0.028, 0.02, 10, 'st0', { axis: 'x' }); k.box(s * 0.215, 0.2, 0.002, 0.03, 0.03, 0.012, 'st0', { f: { pz: 'glass' } }); }
    for (const s of [-1, 1]) { k.box(s * 0.12, 0.176, -0.02, 0.03, 0.03, 0.03, 'st0', { ch: 0.006 }); k.bolt(s * 0.12, 0.176, -0.004, 0.006, 'z'); }
    // stencil on the crown's flank
    k.push(0.22, 0.06, 0, 0, Math.PI / 2, 0).decal(-0.04, 0.0, 0.016, 0.16, 0.022, 'ser0').pop();
    // the antenna mast at the back right
    k.push(-0.16, 0.14, -0.12).cyl(0, 0.02, 0, 0.018, 0.022, 0.04, 8, 'st0').cyl(0, 0.2, 0, 0.004, 0.006, 0.34, 5, 'st1').cyl(0, 0.1, 0, 0.01, 0.01, 0.012, 6, 'br').cyl(0, 0.2, 0, 0.01, 0.01, 0.012, 6, 'br').pop();
  };

  // ================================================================================================ stage 0
  if (st === 0) {
    headParent.position.set(0, Lay.headY, 0); model.add(headParent);
    const w = wrap('head', headParent);
    w.add(head);
    buildHead(false);
    const out = finishAll();
    return out;
  }

  // ================================================================================================ the body
  const body = at(model, 0, Lay.bodyY, 0, 'body');
  const bodyW = wrap('torso', model); bodyW.add(body);
  const R = big ? 0.235 * bb : 0.19 * bb; // drum radius
  const dTop = big ? 0.15 : 0.11, dBot = big ? -0.16 : -0.13;
  const capTop = dTop + (big ? 0.09 : 0.065), capBot = dBot - (big ? 0.1 : 0.08);
  k.on(body);
  // the drum and its domed heads (a boiler), the seams riveted
  k.lathe(0, 0, 0, [[0.001, capBot], [R * 0.45, capBot + 0.006], [R * 0.75, capBot + 0.025], [R * 0.93, dBot - 0.025], [R, dBot]], 14, 'pb0', { a0: Math.PI / 2 });
  k.lathe(0, 0, 0, [[R, dBot], [R, (dBot + dTop) / 2], [R, dTop]], 14, 'pa0', { a0: Math.PI / 2, regs: ['pa1', 'pa0'] });
  k.lathe(0, 0, 0, [[R, dTop], [R * 0.93, dTop + 0.025], [R * 0.72, capTop - 0.018], [R * 0.4, capTop - 0.004], [0.001, capTop]], 14, 'pa2', { a0: Math.PI / 2, regs: ['pa2', 'pa2', 'pas', 'pas'] });
  for (const y of [dBot, dTop]) for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; k.push(Math.sin(a) * R, y, Math.cos(a) * R, 0, a, 0).rivets([0, 0, 0.001], [0, 0, 0.001], 1, 0.0055, 'z').pop(); }
  for (let i = 0; i < 6; i++) { const y = dBot + ((i + 0.5) / 6) * (dTop - dBot); k.push(0, y, -R, 0, Math.PI, 0).rivets([0, 0, 0.001], [0, 0, 0.001], 1, 0.0055, 'z').pop(); }
  // a steel strap round the waist with its tension block at the back
  k.cyl(0, dBot + 0.04, 0, R + 0.006, R + 0.006, 0.026, 28, 'st0', { a0: Math.PI / 2, caps: false });
  k.box(0, dBot + 0.04, -R - 0.014, 0.05, 0.034, 0.02, 'st0', { ch: 0.004 }); k.bolt(-0.014, dBot + 0.04, -R - 0.024, 0.006, '-z'); k.bolt(0.014, dBot + 0.04, -R - 0.024, 0.006, '-z');
  // the porthole: a bolted frame sunk into the drum, a hinged glass ring and a latch dog
  const py = big ? -0.02 : -0.025, pr = big ? 0.1 : 0.068, reactor = has('reactor');
  k.push(0, py, R - 0.02);
  k.cyl(0, 0, 0.02, pr + 0.022, pr + 0.022, 0.04, 14, 'st0', { axis: 'z', caps: 'top' });
  k.boltCircle(0, 0, 0.04, pr + 0.012, 12, 0.006);
  k.lathe(0, 0, 0.04, [[pr * 0.86, 0], [pr + 0.004, 0], [pr + 0.004, 0.016], [pr * 0.9, 0.018], [pr * 0.86, 0]], 14, 'br', { axis: 'z' });
  k.push(-pr - 0.016, 0, 0.05, 0, 0, Math.PI / 2).hinge(0, 0, 0, 0.06, 0.009, 3).pop();
  k.box(pr + 0.02, 0, 0.05, 0.026, 0.02, 0.016, 'st0', { ch: 0.004 }); k.bolt(pr + 0.02, 0, 0.058, 0.006, 'z');
  if (reactor || big) { // a cage over the glass, the reactor burning hotter
    for (const s of [-0.5, 0, 0.5]) k.tube([[s * pr * 1.6, -pr * 0.95, 0.055], [s * pr * 1.4, -pr * 0.6, 0.075], [s * pr * 1.4, pr * 0.6, 0.075], [s * pr * 1.6, pr * 0.95, 0.055]], 0.006, 5, 'st1');
    k.cyl(0, 0, 0.078, 0.02, 0.02, 0.012, 8, 'st0', { axis: 'z' });
  }
  k.pop();
  k.on(body, 1).push(0, py, R - 0.02).cyl(0, 0, 0.046, pr * 0.88, pr * 0.88, 0.006, 14, 'lamp', { axis: 'z', wrap: false, capReg: 'lamp' }).pop();
  k.on(body);
  // a riveted nameplate over the porthole; the star plate at the left breast; meters at the right
  const onDrum = (a: number, y: number, f: () => void) => { k.push(Math.sin(a) * R, y, Math.cos(a) * R, 0, a, 0); f(); k.pop(); };
  onDrum(0, dTop - 0.022, () => { k.box(0, 0, 0.005, 0.16 * (big ? 1.3 : 1), 0.03, 0.012, 'pas', { ch: 0.003 }); k.decal(0, 0, 0.011, 0.15 * (big ? 1.3 : 1), 0.022, 'ser0'); k.rivets([-0.076, 0, 0.012], [0.076, 0, 0.012], 2, 0.004, 'z'); });
  onDrum(0.98, -0.01, () => { k.box(0, 0, 0.004, 0.075, 0.075, 0.01, 'pa0', { ch: 0.003 }); k.decal(0, 0, 0.009, 0.07, 0.07, 'mark'); for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.bolt(x * 0.032, y * 0.032, 0.009, 0.004, 'z'); });
  onDrum(-0.98, -0.01, () => {
    k.box(0, 0, 0.006, 0.07, 0.11, 0.012, 'pb1', { ch: 0.003 }); for (const y of [-0.045, 0.045]) for (const x of [-0.028, 0.028]) k.bolt(x, y, 0.012, 0.004, 'z');
    k.meter(0, 0.022, 0.012, 0.05, 0.034); k.meter(0, -0.024, 0.012, 0.05, 0.034);
  });
  // the neck: a flanged turntable on the top head; the neck group turns on it
  k.push(0, capTop - 0.008, 0, -Math.PI / 2, 0, 0).flange(0, 0, 0, 0.07, 0.014, 8, 'st0', 0.006).pop();
  // flanged ports on the top head with pipes running back to the rack
  const rackZ = -R - 0.03;
  for (const s of [-1, 1]) {
    const px = s * R * 0.55, pyy = dTop + 0.032, pz = R * 0.1;
    k.push(px, pyy, pz, -0.55, 0, s * 0.35).flange(0, 0, -0.01, 0.022, 0.008, 4, 'st0', 0.0035).pop();
    k.pipe([[px, pyy + 0.008, pz + 0.004], [px * 1.05, pyy + 0.05, pz - 0.02], [px * 1.08, pyy + 0.06, -R * 0.6], [px * 1.08, pyy - 0.0, rackZ - 0.02]], 0.011, 'st0', { collar: 'br' });
  }
  // the wiring loom: a junction box on the right flank, three cloth cables round to the back, held by P-clamps
  onDrum(-1.45, -0.03, () => { k.box(0, 0, 0.018, 0.06, 0.07, 0.036, 'pa1', { ch: 0.005 }); k.box(0, 0.032, 0.03, 0.058, 0.008, 0.03, 'pa2'); for (const s of [-1, 1]) k.bolt(s * 0.022, -0.022, 0.036, 0.004, 'z'); });
  for (let c = 0; c < 3; c++) {
    const pts: V3[] = [];
    for (let i = 0; i <= 10; i++) { const a = -1.45 - 0.08 - (i / 10) * 1.45, y = -0.06 - c * 0.012 - Math.sin((i / 10) * Math.PI) * 0.03; pts.push([Math.sin(a) * (R + 0.012 + c * 0.006), y, Math.cos(a) * (R + 0.012 + c * 0.006)]); }
    k.tube(pts, 0.0055, 5, c === 1 ? 'hose' : 'cab');
  }
  onDrum(-3.0, -0.085, () => { k.box(0, 0, 0.016, 0.05, 0.05, 0.03, 'pa2', { ch: 0.004 }); k.bolt(-0.016, 0.016, 0.031, 0.004, 'z'); k.bolt(0.016, 0.016, 0.031, 0.004, 'z'); });
  for (const a of [-1.9, -2.4]) onDrum(a, -0.07 - Math.sin(((-1.53 - a) / 1.45) * Math.PI) * 0.03, () => { k.box(0, 0, 0.022, 0.012, 0.05, 0.016, 'st0'); k.bolt(0, 0.018, 0.03, 0.004, 'z'); });
  // the back rack: a spine plate on two brackets, a caged vacuum-tube bank on it
  const rackW = 0.18, rackY0 = -0.08, rackY1 = big ? 0.16 : 0.13;
  for (const s of [-1, 1]) { const bx = s * rackW * 0.36, zs = -Math.sqrt(R * R - bx * bx) + 0.006; k.box(bx, (rackY0 + rackY1) / 2, (zs + rackZ) / 2, 0.024, rackY1 - rackY0 - 0.02, zs - rackZ, 'st0', { ch: 0.004 }); k.bolt(bx + s * 0.012, rackY1 - 0.03, (zs + rackZ) / 2, 0.005, s > 0 ? 'x' : '-x'); k.bolt(bx + s * 0.012, rackY0 + 0.03, (zs + rackZ) / 2, 0.005, s > 0 ? 'x' : '-x'); }
  k.box(0, (rackY0 + rackY1) / 2, rackZ - 0.008, rackW, rackY1 - rackY0, 0.016, 'dk', { ch: 0.004 });
  k.rivets([-rackW * 0.42, rackY1 - 0.012, rackZ - 0.017], [rackW * 0.42, rackY1 - 0.012, rackZ - 0.017], 6, 0.004, '-z');
  k.rivets([-rackW * 0.42, rackY0 + 0.012, rackZ - 0.017], [rackW * 0.42, rackY0 + 0.012, rackZ - 0.017], 6, 0.004, '-z');
  const cy = 0.025, cz = rackZ - 0.016 - 0.036;
  k.box(0, cy - 0.04, cz, 0.12, 0.014, 0.072, 'st0', { ch: 0.004 });
  k.box(0, cy - 0.04, rackZ - 0.02, 0.1, 0.03, 0.01, 'st0'); // the shelf's back flange on the plate
  for (const sx of [-1, 0, 1]) k.cyl(sx * 0.036, cy - 0.027, cz, 0.014, 0.014, 0.014, 8, 'br');
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.cyl(sx * 0.055, cy + 0.015, cz + sz * 0.032, 0.003, 0.003, 0.098, 4, 'st1');
  k.box(0, cy + 0.066, cz, 0.12, 0.008, 0.072, 'st0');
  k.on(body, 1);
  for (const sx of [-1, 0, 1]) k.lathe(sx * 0.036, cy - 0.02, cz, [[0.011, 0], [0.012, 0.05], [0.008, 0.066], [0.001, 0.07]], 8, 'lamp', { wrap: false });
  k.on(body);
  k.push(0, cy - 0.06, rackZ - 0.017, 0, Math.PI, 0).decal(0, 0, 0, 0.12, 0.016, 'ser1').pop();
  // exhaust stacks either side of the rack: an elbow out of a flanged port in the drum, two clamp bands
  const tall = st >= 3;
  const stackH = big ? 0.42 : tall ? 0.3 : 0.12;
  const sr = tall ? 0.018 : 0.014;
  for (const s of [-1, 1]) {
    const sx = s * (rackW / 2 + sr + 0.008), sz = rackZ - 0.006, y0 = -0.05;
    const dz = -Math.sqrt(Math.max(0.0001, R * R - sx * sx));
    k.push(sx, y0, dz, 0, Math.PI, 0).flange(0, 0, -0.004, sr * 1.9, 0.008, 4, 'st0', 0.004).pop();
    k.pipe([[sx, y0, dz - 0.004], [sx, y0, sz], [sx, y0 + 0.04, sz], [sx, y0 + 0.04 + stackH, sz]], sr, 'soot', { collar: 'st0', ends: false });
    for (const t of [0.35, 0.75]) { const yy = y0 + 0.04 + stackH * t; if (yy > rackY1 - 0.01) continue; k.cyl(sx, yy, sz, sr * 1.3, sr * 1.3, 0.012, 8, 'st0'); k.box((sx + s * -sr) - s * 0.004, yy, sz, 0.012, 0.012, 0.012, 'st0'); }
    k.cyl(sx, y0 + 0.04 + stackH, sz, sr * 1.25, sr * 1.25, 0.014, 8, 'st0');
    const tip = new THREE.Object3D(); tip.position.set(sx, y0 + 0.06 + stackH, sz); body.add(tip); exhaust.push(tip);
    if (tall) { // a rain flap hinged on the lip
      const fl = at(body, sx, y0 + 0.048 + stackH, sz - sr * 1.25, 'flap'); flaps.push(fl);
      k.on(fl).cyl(0, 0.001, sr * 1.25, sr * 1.3, sr * 1.3, 0.004, 10, 'st0').hinge(0, 0, 0, sr * 1.2, 0.004, 1).on(body);
    }
  }
  // underneath: the hover emitter (or the coil skirt, built with the coil)
  if (!has('coil') && !big) {
    k.push(0, capBot, 0, Math.PI, 0, 0);
    k.lathe(0, 0, 0, [[0.06, -0.004], [0.11, 0.012], [0.12, 0.03], [0.1, 0.042], [0.05, 0.046], [0.02, 0.05]], 12, 'dk');
    k.pop();
    k.on(body, 1).torus(0, capBot - 0.038, 0, 0.075, 0.008, 14, 4, 'lamp').on(body);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; k.push(Math.sin(a) * 0.08, capBot - 0.03, Math.cos(a) * 0.08, 0, a, 0).box(0, 0, 0, 0.008, 0.03, 0.05, 'st0', { ch: 0.002 }).pop(); }
  }
  // blanking covers on the flanks where no arm is mounted yet
  const shoulderY = Lay.armY - Lay.bodyY;
  for (const s of [-1, 1]) {
    const id = s < 0 ? 'armR' : 'armL';
    if (has(id)) continue;
    k.push(s * R, shoulderY, 0, 0, 0, s < 0 ? Math.PI / 2 : -Math.PI / 2).flange(0, 0, -0.012, 0.06, 0.014, 6, 'pa1', 0.006).pop();
  }

  // ================================================================================================ the neck and head
  const neck = at(body, 0, capTop, 0, 'neck');
  k.on(neck);
  k.cyl(0, 0.01, 0, 0.06, 0.064, 0.02, 12, 'st0');
  k.cyl(0, 0.032, 0, 0.026, 0.03, 0.04, 8, 'pb1');
  // the yoke: a bar under the head and two cheeks up to the trunnions
  const yokeW = (big ? 0.205 : hr) + 0.05, hY = Lay.headY - Lay.bodyY - capTop;
  k.box(0, 0.03, 0, yokeW * 2 + 0.02, 0.022, 0.05, 'pa0', { ch: 0.006 });
  for (const s of [-1, 1]) {
    k.push(s * yokeW, 0.03, 0).prism(0, 0, 0, [[-0.012, 0], [0.012, 0], [0.012, hY - 0.03 + 0.03], [-0.012, hY - 0.03 + 0.03]], 0.05, 'pa0').pop();
    k.push(s * yokeW, hY, 0, 0, 0, s * Math.PI / 2).cyl(0, 0, 0, 0.022, 0.022, 0.03, 8, 'st0', { axis: 'y' }).pop();
    k.bolt(s * (yokeW + 0.015), hY, 0, 0.008, s > 0 ? 'x' : '-x');
    // a cable from the yoke into the drum top
    k.cable([s * yokeW * 0.8, 0.02, -0.02], [s * 0.05, -0.012, -0.06], 0.008, 0.004);
  }
  head.position.set(0, hY, 0); neck.add(head);
  const headW = wrap('head', neck); headW.add(head); head.position.set(0, hY, 0);
  if (big) head.scale.setScalar(1.0);
  buildHead(big);

  // ================================================================================================ arms
  const arms: GArm[] = [];
  const armS = big ? 1.35 : 1;
  for (const s of [-1, 1]) {
    const id = s < 0 ? 'armR' : 'armL';
    if (!has(id)) continue;
    const ax = Lay.armX;
    // the shoulder bearing on the drum (body): a mounting plate conforming to the drum, a turned housing
    k.on(body);
    k.push(s * R, shoulderY, 0, 0, 0, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    k.box(0, -0.004, 0, 0.13 * armS, 0.02, 0.13 * armS, 'pb0', { ch: 0.006 });
    for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.bolt(bx * 0.05 * armS, 0.006, bz * 0.05 * armS, 0.006, 'y');
    k.cyl(0, (ax - R) / 2, 0, 0.055 * armS, 0.06 * armS, ax - R - 0.012, 12, 'st0');
    k.pop();
    const w = wrap(id, body, s * ax, shoulderY, 0);
    const root = at(w, 0, 0, 0, 'root');
    k.on(root);
    // the shoulder hub (turns with the arm), a lug for the stick cylinder, the upper arm's mounting cheeks
    k.cyl(s * 0.018 * armS, 0, 0, 0.058 * armS, 0.058 * armS, 0.036 * armS, 12, 'pa0', { axis: 'x', capReg: 'pa1' });
    k.push(s * 0.037 * armS, 0, 0, 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2).boltCircle(0, 0, 0, 0.042 * armS, 8, 0.005 * armS).pop();
    const upper = at(root, s * 0.02 * armS, -0.02 * armS, 0, 'upper');
    k.on(upper);
    const uL = 0.17 * armS;
    // a box-section boom with a capping plate and a lightening slot
    k.box(0, -uL / 2, 0, 0.05 * armS, uL, 0.06 * armS, A(s > 0 ? 0 : 1), { ch: 0.008 * armS });
    k.box(s * 0.027 * armS, -uL / 2, 0, 0.006, uL * 0.7, 0.04 * armS, 'pas', { ch: 0.002 });
    k.rivets([s * 0.031 * armS, -uL * 0.2, 0.016 * armS], [s * 0.031 * armS, -uL * 0.8, 0.016 * armS], 4, 0.004, s > 0 ? 'x' : '-x');
    k.rivets([s * 0.031 * armS, -uL * 0.2, -0.016 * armS], [s * 0.031 * armS, -uL * 0.8, -0.016 * armS], 4, 0.004, s > 0 ? 'x' : '-x');
    // the elbow knuckles
    k.push(0, -uL, 0).hinge(0, 0, 0, 0.07 * armS, 0.02 * armS, 3).pop();
    const fore = at(upper, 0, -uL, 0, 'fore');
    k.on(fore);
    const fL = 0.16 * armS;
    // the forearm housing: a turned cylinder with a valve block and a flanged end the ram runs out of
    k.box(0, -0.012 * armS, 0, 0.044 * armS, 0.04 * armS, 0.05 * armS, 'pa1', { ch: 0.006 });
    k.cyl(0, -fL / 2 - 0.01, 0, 0.042 * armS, 0.04 * armS, fL - 0.02, 12, A(s > 0 ? 2 : 0), { caps: false });
    k.cyl(0, -fL + 0.004, 0, 0.05 * armS, 0.05 * armS, 0.016 * armS, 12, 'st0');
    k.push(0, -fL + 0.012, 0, Math.PI / 2, 0, 0).boltCircle(0, 0, 0, 0.04 * armS, 6, 0.0045 * armS).pop();
    k.cyl(0, -fL * 0.25, 0, 0.046 * armS, 0.046 * armS, 0.012, 12, 'st0');
    k.box(s * 0.045 * armS, -fL * 0.45, 0.0, 0.02 * armS, 0.05 * armS, 0.04 * armS, 'st0', { ch: 0.004 });
    k.bolt(s * 0.055 * armS, -fL * 0.45 + 0.016, 0.012, 0.0045, s > 0 ? 'x' : '-x'); k.bolt(s * 0.055 * armS, -fL * 0.45 - 0.016, -0.012, 0.0045, s > 0 ? 'x' : '-x');
    // the hand on its telescopic ram
    const hand = at(fore, 0, -fL - 0.03 * armS, 0, 'hand');
    k.on(hand);
    k.cyl(0, 0.05 * armS, 0, 0.02 * armS, 0.02 * armS, 0.12 * armS, 10, 'st1', { caps: false });
    k.cyl(0, 0.0, 0, 0.04 * armS, 0.036 * armS, 0.028 * armS, 12, 'st0');
    k.cyl(0, -0.02 * armS, 0, 0.044 * armS, 0.044 * armS, 0.012 * armS, 16, 'knurl', { caps: false });
    const fingers: GFinger[] = [];
    if (L.arms === 'hammers') {
      // a sledge head across the wrist, a thumb clamp to hold things
      k.box(0, -0.06 * armS, 0, 0.13 * armS, 0.06 * armS, 0.065 * armS, 'hz', { ch: 0.008, f: { px: 'st1', nx: 'st1' } });
      for (const e of [-1, 1]) { k.cyl(e * 0.072 * armS, -0.06 * armS, 0, 0.034 * armS, 0.034 * armS, 0.016 * armS, 8, 'st1', { axis: 'x' }); }
      k.box(0, -0.028 * armS, 0, 0.05 * armS, 0.016 * armS, 0.05 * armS, 'st0'); for (const e of [-1, 1]) k.bolt(e * 0.018 * armS, -0.028 * armS, 0.026 * armS, 0.005, 'z');
    } else {
      // the palm block; two fingers in front, an opposed thumb behind, each on a knuckle axle
      k.box(0, -0.045 * armS, 0, 0.07 * armS, 0.05 * armS, 0.06 * armS, 'pa0', { ch: 0.008 });
      k.box(0, -0.045 * armS, 0.031 * armS, 0.05 * armS, 0.03 * armS, 0.004, 'pas', { f: { pz: 'gr' } });
      const claw = L.arms === 'claws';
      const fl = (claw ? 0.06 : 0.042) * armS, fr = 0.012 * armS;
      for (const [fx, fz, thumb] of [[-0.022, 0.024, false], [0.022, 0.024, false], [0, -0.026, true]] as const) {
        const prox = at(hand, fx * armS, -0.07 * armS, fz * armS, 'finger');
        k.on(hand).push(fx * armS, -0.07 * armS, fz * armS).hinge(0, 0, 0, 0.024 * armS, 0.009 * armS, 2).pop();
        k.on(prox);
        k.box(0, -fl / 2, 0, fr * 1.7, fl, fr * 1.8, 'pa1', { ch: fr * 0.3 });
        k.box(0, -fl / 2, (thumb ? -1 : 1) * fr * 0.95, fr * 1.2, fl * 0.7, fr * 0.2, 'st1');
        const dist = at(prox, 0, -fl, 0, 'tip');
        k.on(prox).push(0, -fl, 0).cyl(0, 0, 0, fr * 0.7, fr * 0.7, fr * 2, 6, 'st1', { axis: 'x' }).pop();
        k.on(dist);
        if (claw) k.prism(0, 0, 0, [[-fr * 0.8, 0], [fr * 0.8, 0], [fr * 0.3, -fl * 1.1], [(thumb ? 1 : -1) * fr * 0.2, -fl * 1.2]], fr * 1.4, 'st1');
        else { k.box(0, -fl * 0.4, 0, fr * 1.6, fl * 0.8, fr * 1.7, 'pa2', { ch: fr * 0.3 }); k.box(0, -fl * 0.82, (thumb ? -1 : 1) * fr * 0.2, fr * 1.4, fl * 0.12, fr * 1.4, 'rb'); }
        fingers.push({ prox, dist, k: thumb ? -1 : 1, thumb });
      }
    }
    // the stick cylinder: from a lug on the upper boom's back to a lug behind the elbow on the forearm
    k.on(upper).push(0, -0.03 * armS, -0.038 * armS).box(0, 0, 0, 0.026 * armS, 0.03 * armS, 0.018 * armS, 'st0', { ch: 0.003 }).pop();
    k.on(fore).push(0, -0.03 * armS, -0.045 * armS).box(0, 0, 0, 0.026 * armS, 0.03 * armS, 0.04 * armS, 'st0', { ch: 0.003 }).pop();
    piston(upper, [0, -0.03 * armS, -0.05 * armS], fore, [0, -0.03 * armS, -0.062 * armS], 0.012 * armS, 0.09 * armS, 0.1 * armS);
    // the shoulder's rotary actuator: a motor can on the hub with a gear cover and a cable to the drum
    k.on(root);
    k.cyl(s * 0.018 * armS, 0.064 * armS, -0.01, 0.022 * armS, 0.022 * armS, 0.03 * armS, 10, 'pb1');
    k.box(s * 0.018 * armS, 0.05 * armS, 0.02 * armS, 0.03 * armS, 0.02 * armS, 0.04 * armS, 'st0', { ch: 0.004 });
    k.bolt(s * 0.018 * armS, 0.082 * armS, -0.01, 0.005, 'y');
    // a hose along the boom from the shoulder to the forearm valve block, clipped at mid-boom
    k.on(upper);
    k.hose([-s * 0.026 * armS, -0.02, 0.012 * armS], [0, -1, 0], [-s * 0.032 * armS, -uL + 0.012, 0.03 * armS], [0, -1, 0.3], 0.006 * armS, 'hose', { n: 6 });
    k.box(-s * 0.031 * armS, -uL * 0.5, 0.012 * armS, 0.014 * armS, 0.012, 0.016 * armS, 'st0');
    k.on(fore).hose([-s * 0.03 * armS, 0.01, 0.03 * armS], [0, -1, 0], [s * 0.045 * armS, -fL * 0.38, 0.02 * armS], [s, -0.3, 0], 0.006 * armS, 'hose', { n: 6 });
    // plating on the arm (plate skills): pauldron, boom plate, forearm guard
    if (has('plating1')) plateOn('plating1', root, (pk) => {
      pk.push(s * 0.02 * armS, 0.04 * armS, 0, 0, 0, s * -0.5);
      pk.box(0, 0, 0, 0.1 * armS, 0.022 * armS, 0.13 * armS, 'pa1', { ch: 0.006 });
      pk.box(s * 0.045 * armS, -0.03 * armS, 0, 0.018 * armS, 0.05 * armS, 0.12 * armS, 'pa2', { ch: 0.004 });
      for (const z of [-0.045, 0.045]) pk.bolt(0, 0.011 * armS, z * armS, 0.006, 'y');
      pk.pop();
    });
    if (has('plating2') || st >= 3) plateOn('plating2', fore, (pk) => {
      pk.push(s * 0.052 * armS, -fL * 0.55, 0);
      pk.box(0, 0, 0, 0.012 * armS, fL * 0.7, 0.085 * armS, 'pa0', { ch: 0.003 });
      for (const y of [-1, 1]) for (const z of [-1, 1]) pk.bolt(s * 0.006 * armS, y * fL * 0.28, z * 0.032 * armS, 0.005, s > 0 ? 'x' : '-x');
      pk.pop();
      // the stencil runs down the guard
      pk.push(s * 0.059 * armS, -fL * 0.55, 0, 0, s * Math.PI / 2, Math.PI / 2).decal(0, 0, 0, fL * 0.6, 0.016 * armS, 'ser3').pop();
    });
    if (has('plating3')) plateOn('plating3', upper, (pk) => {
      pk.push(s * 0.034 * armS, -uL * 0.45, 0);
      pk.box(0, 0, 0, 0.01 * armS, uL * 0.62, 0.07 * armS, 'hz', { ch: 0.003 });
      for (const y of [-1, 1]) pk.bolt(s * 0.005, y * uL * 0.25, 0, 0.005, s > 0 ? 'x' : '-x');
      pk.pop();
    });
    arms.push({ id, root, upper, fore, hand, ram: -fL - 0.03 * armS, fingers, k: s, punch: -1, spin: 0, s: armS });
  }

  // ================================================================================================ the coil skirt
  const legs: GLeg[] = [];
  if (has('coil') && !big) {
    const cw = wrap('coil', body, 0, capBot, 0);
    const coil = at(cw, 0, 0, 0, 'coil');
    k.on(coil);
    k.push(0, 0.002, 0, Math.PI, 0, 0).flange(0, 0, 0, 0.08, 0.014, 8, 'st0', 0.006).pop();
    k.cyl(0, -0.07, 0, 0.05, 0.05, 0.12, 12, 'dk');
    for (let i = 0; i < 4; i++) k.torus(0, -0.03 - i * 0.026, 0, 0.068 - i * 0.004, 0.012, 16, 5, 'br');
    k.cyl(0, -0.14, 0, 0.07, 0.05, 0.02, 12, 'st0');
    // a hanger ring under the drum on six brackets, six petals hinged off it
    k.cyl(0, 0.0, 0, 0.15, 0.15, 0.012, 18, 'st0', { caps: false });
    k.cyl(0, 0.0, 0, 0.138, 0.138, 0.012, 18, 'st0', { caps: false });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      k.push(Math.sin(a) * 0.12, 0.03, Math.cos(a) * 0.12, 0, a, 0).box(0, 0, 0, 0.012, 0.05, 0.04, 'st0', { ch: 0.003 }).bolt(0.006, 0.012, 0, 0.004, 'x').pop();
      const p = at(coil, Math.sin(a) * 0.15, -0.006, Math.cos(a) * 0.15, 'petal'); p.rotation.y = a; petals.push(p);
      k.on(p).hinge(0, 0, 0, 0.05, 0.007, 2);
      k.push(0, 0, 0, -0.35, 0, 0).prism(0, -0.075, 0.006, [[-0.04, 0.07], [0.04, 0.07], [0.032, -0.07], [-0.032, -0.07]], 0.008, A(i)).pop();
      k.push(0, 0, 0, -0.35, 0, 0).rivets([-0.026, -0.03, 0.012], [0.026, -0.03, 0.012], 3, 0.003, 'z').pop();
      k.on(coil);
    }
    k.on(coil, 1).torus(0, -0.152, 0, 0.045, 0.008, 14, 4, 'lamp');
    const tip = new THREE.Object3D(); tip.position.set(0, -0.16, 0); coil.add(tip); thrusters.push(tip);
  }

  // ================================================================================================ stage 2+: reservoir
  if (st >= 2 && !big) {
    k.on(body);
    const ry = -0.118, rz = -R - 0.06;
    // the hydraulic reservoir lying under the rack on two saddles strapped to it, a filler cap, hoses to the shoulders
    for (const s of [-1, 1]) { k.box(s * 0.06, ry + 0.0, -R - 0.0275, 0.02, 0.05, 0.085, 'st0', { ch: 0.004 }); k.torus(s * 0.06, ry, rz, 0.033, 0.004, 12, 3, 'st0', 'x'); }
    k.cyl(0, ry, rz, 0.03, 0.03, 0.2, 12, 'pb1', { axis: 'x', caps: false });
    for (const s of [-1, 1]) k.lathe(s * 0.1, ry, rz, [[0.03, 0], [0.026, 0.012], [0.012, 0.02], [0.001, 0.022]], 12, 'pb1', { axis: s > 0 ? 'x' : '-x' });
    k.cyl(0.0, ry - 0.033, rz, 0.01, 0.01, 0.01, 6, 'br');
    for (const a of arms) {
      const s = a.k;
      k.hose([s * 0.121, ry, rz], [s, 0, 0], [s * (R + 0.05), shoulderY - 0.01, -0.064], [0, 0.1, 1], 0.007, 'hose', { n: 12 });
    }
  }

  // ================================================================================================ plating on the body
  if (has('plating1')) {
    for (const s of [-1, 1]) plateOn('plating1', body, (pk) => {
      // flank plates curved round the drum on standoffs: three facets with a consistent gap
      const a0 = s * Math.PI / 2;
      for (let f = -1; f <= 1; f++) {
        const a = a0 + f * 0.32;
        pk.push(Math.sin(a) * (R + 0.018), -0.03, Math.cos(a) * (R + 0.018), 0, a, 0);
        pk.box(0, 0, 0, R * 0.33, 0.15, 0.012, A(f + 1), { ch: 0.003 });
        pk.bolt(0, 0.06, 0.006, 0.0045, 'z'); pk.bolt(0, -0.06, 0.006, 0.0045, 'z');
        pk.pop();
      }
    });
  }
  if (has('plating2') || st >= 3) {
    plateOn('plating2', body, (pk) => {
      // the breastplate: three facets following the drum above the porthole, a standing gap, bolts at each corner
      for (let f = -1; f <= 1; f++) {
        const a = f * 0.4, rr = R * 0.93 + 0.012;
        pk.push(Math.sin(a) * rr, dTop + 0.035, Math.cos(a) * rr, -0.55, a, 0);
        pk.box(0, 0, 0, R * 0.38, big ? 0.12 : 0.085, 0.014, f === 0 ? 'pa2' : A(f + 3), { ch: 0.004 });
        for (const [bx, by] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pk.bolt(bx * R * 0.15, by * (big ? 0.045 : 0.03), 0.007, 0.0045, 'z');
        if (f === 0) pk.decal(0, 0.0, 0.007, R * 0.3, (big ? 0.07 : 0.05), 'num');
        pk.pop();
      }
    });
    plateOn('plating2', body, (pk) => {
      // a back plate behind the rack's top, the serial stencilled across it
      pk.push(0, 0.02, -R - 0.018, 0, Math.PI, 0);
      pk.box(0, 0, 0, R * 1.1, 0.06, 0.012, 'pa1', { ch: 0.003 });
      pk.decal(0, 0, 0.006, R * 0.95, 0.024, 'ser3');
      for (const s of [-1, 1]) pk.bolt(s * R * 0.5, 0, 0.006, 0.005, 'z');
      pk.pop();
    });
  }
  if (has('plating3')) {
    plateOn('plating3', body, (pk) => {
      // a hardened gorget round the neck flange, hazard-edged
      pk.lathe(0, 0, 0, [[R * 0.95, dTop + 0.03], [R * 0.86, dTop + 0.06], [R * 0.5, capTop + 0.004], [R * 0.48, capTop - 0.006]], 12, 'pa0', { regs: ['hz', 'pa0', 'pa0'] });
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; pk.push(Math.sin(a) * R * 0.7, dTop + 0.066, Math.cos(a) * R * 0.7, 0, a, 0).bolt(0, 0, 0, 0.005, 'y').pop(); }
    });
    for (const s of [-1, 1]) plateOn('plating3', body, (pk) => {
      pk.push(s * (R + 0.022), dBot + 0.01, 0.02, 0, 0, s * 0.18);
      pk.box(0, 0, 0, 0.014, 0.08, R * 1.1, 'hz', { ch: 0.003 });
      for (const z of [-1, 1]) pk.bolt(s * 0.007, 0, z * R * 0.4, 0.005, s > 0 ? 'x' : '-x');
      pk.pop();
    });
  }
  if (has('plating1')) plateOn('plating1', head, (pk) => {
    // a crown plate on the head shell
    pk.push(0, 0.125, -0.02, -0.12, 0, 0);
    pk.box(0, 0, 0, 0.14, 0.012, 0.13, 'pa1', { ch: 0.004 });
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pk.bolt(x * 0.055, 0.006, z * 0.05, 0.004, 'y');
    pk.pop();
  });

  // ================================================================================================ stage 3: war machine kit
  let gun: THREE.Group | null = null;
  if (st >= 3) {
    const w3 = wrap('stage3', body);
    const g3 = at(w3);
    k.on(g3);
    // floodlights on the top head, either side of the breastplate, each on a bracket and a trunnion yoke
    for (const s of [-1, 1]) {
      const a = s * 0.86, rr = R * 0.86, fx = Math.sin(a) * rr, fz = Math.cos(a) * rr, fy = dTop + 0.015;
      k.push(fx, fy, fz, 0, a, 0);
      k.box(0, 0.0, 0.0, 0.04, 0.012, 0.05, 'st0', { ch: 0.003 });
      k.bolt(-0.012, 0.006, 0.0, 0.004, 'y'); k.bolt(0.012, 0.006, 0.0, 0.004, 'y');
      for (const e of [-1, 1]) k.box(e * 0.033, 0.03, 0.01, 0.006, 0.05, 0.014, 'st0');
      k.cyl(0, 0.04, 0.01, 0.004, 0.004, 0.072, 6, 'st1', { axis: 'x' });
      k.lamp(0, 0.04, 0.03, 0.026, 0.036, 'off', 'pa1', true);
      k.pop();
      k.on(g3, 1).push(fx, fy, fz, 0, a, 0).cyl(0, 0.04, 0.034, 0.02, 0.02, 0.004, 10, 'lamp', { axis: 'z', wrap: false, capReg: 'lamp' }).pop().on(g3);
      const lp = new THREE.Object3D(); lp.position.set(fx + Math.sin(a) * 0.05, fy + 0.04, fz + Math.cos(a) * 0.05); g3.add(lp); lamps.push(lp);
    }
    // the gun on the left shoulder housing: a cradle, a box magazine and its feed chute, twin barrels in a jacket
    const gx = Lay.armX - 0.055, gy = shoulderY + 0.064, gz = 0.0;
    k.push(gx, gy - 0.016, gz).box(0, 0, 0, 0.05, 0.022, 0.07, 'st0', { ch: 0.004 }).bolt(-0.018, 0.011, 0.026, 0.004, 'y').bolt(0.018, 0.011, -0.026, 0.004, 'y').pop();
    gun = at(g3, gx, gy, gz, 'gun');
    k.on(gun);
    k.box(0, 0.016, -0.01, 0.046, 0.036, 0.1, 'pa2', { ch: 0.006 });
    k.hinge(0, 0.0, 0, 0.044, 0.007, 3);
    k.cyl(0, 0.018, 0.075, 0.02, 0.02, 0.1, 10, 'vent', { axis: 'z' });
    for (const e of [-1, 1]) k.cyl(e * 0.008, 0.018, 0.15, 0.0055, 0.0055, 0.06, 6, 'dk', { axis: 'z' });
    k.cyl(0, 0.018, 0.125, 0.023, 0.023, 0.01, 10, 'st0', { axis: 'z' });
    // a top-fed box magazine over the receiver, its feed lips and a latch
    k.box(0.0, 0.058, -0.03, 0.036, 0.044, 0.05, 'pb0', { ch: 0.004 }); k.push(0, 0, 0, 0, Math.PI / 2, 0).decal(0.03, 0.058, 0.019, 0.04, 0.03, 'ammo').pop();
    k.box(0.0, 0.036, -0.03, 0.03, 0.006, 0.034, 'st0'); k.box(0.0, 0.058, -0.057, 0.012, 0.016, 0.006, 'st1');
    const muz = new THREE.Object3D(); muz.position.set(0, 0.018, 0.185); gun.add(muz); muz.name = 'muzzle';
    // a tool rack on the right side of the back: a drill bit and a pick in clips bolted to the drum
    k.on(g3);
    for (const e of [-1, 1]) k.push(Math.sin(-2.35) * R, e * 0.05 - 0.02, Math.cos(-2.35) * R, 0, -2.35, 0).box(0, 0, 0.012, 0.05, 0.012, 0.024, 'st0').bolt(0, 0, 0.024, 0.004, 'z').pop();
    k.push(Math.sin(-2.35) * (R + 0.034), -0.02, Math.cos(-2.35) * (R + 0.034), 0, -2.35, 0);
    k.lathe(-0.012, 0, 0, [[0.011, -0.09], [0.013, -0.06], [0.013, 0.04], [0.006, 0.09], [0.001, 0.1]], 8, 'st1');
    k.box(0.016, 0, 0, 0.008, 0.16, 0.008, 'cv'); k.box(0.016, 0.08, 0, 0.05, 0.01, 0.01, 'st1');
    k.pop();
  }

  // ================================================================================================ stage 4: hips, skirt, legs
  if (big) {
    const w4 = wrap('stage4', model);
    const hips = at(w4, 0, Lay.hipY, 0, 'hips');
    k.on(hips);
    // the pelvis box under the drum, flanged to it; the thruster skirt round it
    k.box(0, 0.0, 0, 0.36, 0.11, 0.24, 'pb0', { ch: 0.02 });
    k.box(0, 0.06, 0, 0.3, 0.02, 0.2, 'st0', { ch: 0.006 });
    k.rivets([-0.16, -0.045, 0.121], [0.16, -0.045, 0.121], 9, 0.005, 'z');
    const gapY = Lay.bodyY + capBot - Lay.hipY;
    k.cyl(0, (0.07 + gapY) / 2, 0, 0.1, 0.1, gapY - 0.07 + 0.01, 12, 'dk');
    k.push(0, 0.07, 0, -Math.PI / 2, 0, 0).flange(0, 0, 0, 0.13, 0.012, 10, 'st0', 0.007).pop();
    for (const a of [-0.55, 0, 0.55, Math.PI - 0.55, Math.PI, Math.PI + 0.55]) {
      k.push(Math.sin(a) * 0.2, 0.0, Math.cos(a) * 0.145, -0.15, a, 0);
      k.box(0, -0.04, 0, 0.12, 0.11, 0.014, A(Math.round(a * 3)), { ch: 0.004 });
      k.bolt(-0.04, 0.0, 0.007, 0.005, 'z'); k.bolt(0.04, 0.0, 0.007, 0.005, 'z');
      k.lathe(0, -0.1, -0.025, [[0.016, 0.02], [0.022, 0.0], [0.03, -0.03]], 8, 'dk');
      k.pop();
    }
    for (const s of [-1, 1]) {
      const hip = at(hips, s * 0.15, -0.02, 0, 'hip');
      k.on(hips).push(s * 0.15, -0.02, 0).cyl(s * 0.03, 0, 0, 0.06, 0.06, 0.05, 12, 'st0', { axis: 'x' }).pop();
      const thigh = at(hip, 0, 0, 0, 'thigh');
      const lt = 0.26, ls = 0.26;
      k.on(thigh);
      k.cyl(s * 0.07, 0, 0, 0.065, 0.065, 0.05, 12, 'pa0', { axis: 'x' });
      k.box(s * 0.07, -lt / 2, 0, 0.08, lt, 0.1, A(s > 0 ? 1 : 2), { ch: 0.012 });
      k.box(s * 0.07, -lt / 2, 0.056, 0.06, lt * 0.7, 0.012, 'pa2', { ch: 0.003 });
      for (const y of [-0.3, -0.7]) for (const x of [-1, 1]) k.bolt(s * 0.07 + x * 0.022, -lt * (y < -0.5 ? 0.8 : 0.25), 0.062, 0.005, 'z');
      k.push(s * 0.07, -lt, 0).hinge(0, 0, 0, 0.11, 0.032, 3).pop();
      const shin = at(thigh, s * 0.07, -lt, 0, 'shin');
      k.on(shin);
      k.cyl(0, -ls / 2, 0, 0.055, 0.045, ls - 0.03, 12, A(s > 0 ? 0 : 1));
      k.box(0, -0.02, 0.05, 0.1, 0.07, 0.03, 'pa2', { ch: 0.01 }); // knee cap
      for (const x of [-1, 1]) k.bolt(x * 0.035, -0.02, 0.066, 0.005, 'z');
      k.cyl(0, -ls * 0.35, 0, 0.06, 0.06, 0.014, 12, 'st0');
      k.push(0, -ls, 0).hinge(0, 0, 0, 0.09, 0.024, 3).pop();
      k.push(0, -ls * 0.55, 0.058, 0, 0, 0).decal(0, 0, 0, 0.06, 0.06, 'mark').pop();
      const foot = at(shin, 0, -ls, 0, 'foot');
      k.on(foot);
      k.box(0, -0.045, 0.03, 0.13, 0.04, 0.22, 'pb0', { ch: 0.01 });
      for (const x of [-1, 0, 1]) k.box(x * 0.045, -0.055, 0.15, 0.036, 0.03, 0.05, 'pa1', { ch: 0.006 });
      k.box(0, -0.045, -0.1, 0.09, 0.04, 0.05, 'pa1', { ch: 0.008 });
      k.box(0, -0.068, 0.03, 0.14, 0.008, 0.25, 'tr');
      k.box(0, -0.02, 0.0, 0.07, 0.04, 0.08, 'st0', { ch: 0.006 });
      // knee and ankle cylinders
      k.on(thigh).push(s * 0.07, -lt * 0.25, -0.055).box(0, 0, 0, 0.03, 0.03, 0.02, 'st0').pop();
      k.on(shin).push(0, -ls * 0.3, -0.05).box(0, 0, 0, 0.03, 0.03, 0.02, 'st0').pop();
      piston(thigh, [s * 0.07, -lt * 0.25, -0.066], shin, [0, -ls * 0.3, -0.062], 0.018, 0.14, 0.12);
      k.on(shin).push(0, -ls * 0.55, -0.05).box(0, 0, 0, 0.026, 0.026, 0.02, 'st0').pop();
      piston(shin, [0, -ls * 0.55, -0.06], foot, [0, -0.02, -0.11], 0.014, 0.08, 0.07);
      legs.push({ k: s, hip, thigh, shin, foot, lt, ls, ph: s > 0 ? 0 : Math.PI, plant: new THREE.Vector3() });
    }
    // extra layered armour on the big chest: shoulders of plate over the drum top, a heavy belly plate
    k.on(body);
    for (const s of [-1, 1]) {
      k.push(s * R * 0.75, dTop + 0.02, 0, 0, 0, s * -0.4);
      k.box(0, 0, 0, R * 0.7, 0.025, R * 1.5, 'pa1', { ch: 0.006 });
      k.box(0, 0.02, 0, R * 0.55, 0.02, R * 1.3, 'pa2', { ch: 0.005 });
      for (const z of [-1, 0, 1]) k.bolt(0, 0.03, z * R * 0.55, 0.006, 'y');
      k.pop();
    }
    // coolant pipes from the reactor ring round to radiators on the back
    for (const s of [-1, 1]) {
      k.pipe([[s * (pr + 0.02), py - pr * 0.6, R + 0.02], [s * (R + 0.03), py - pr * 0.7, R * 0.6], [s * (R + 0.035), py - pr * 0.7, -R * 0.5], [s * R * 0.6, py - 0.04, rackZ - 0.02]], 0.014, 'st0');
      k.push(s * R * 0.62, -0.02, rackZ - 0.06);
      for (let i = 0; i < 6; i++) k.box(0, -0.06 + i * 0.018, 0, 0.09, 0.006, 0.05, 'st1');
      k.box(0, -0.015, 0, 0.1, 0.12, 0.012, 'dk');
      k.pop();
    }
  }

  return finishAll();

  // ------------------------------------------------------------------------------------------------ assembly
  /** a plate bolted to a bone; it is its own mesh (it dents and flies in on its own) */
  function plateOn(id: string, parent: THREE.Object3D, f: (pk: Kit) => void) {
    const g = at(parent, 0, 0, 0, 'plate:' + id);
    const pk = new Kit(k.dens);
    pk.on(g); f(pk);
    plateKits.push({ g, k: pk });
    (parts[id] ??= []).push(g);
  }
  function finishAll(): GRig {
    const meshes = k.finish(mats);
    let tris = k.tris;
    for (const p of plateKits) { const m = p.k.finish(mats); tris += p.k.tris; for (const x of m) plates.push(x); }
    const geos = [...meshes, ...plates].map((m) => m.geometry);
    return {
      stage: st, model, scaleK: SK,
      body: st === 0 ? null : model.getObjectByName('body') as THREE.Group, neck: st === 0 ? null : model.getObjectByName('neck') as THREE.Group,
      head, jaw, arms: (st === 0 ? [] : arms), legs: (st === 0 ? [] : legs), pistons, iris, fins, petals, flaps, hatch: null,
      dish, bulb, gun: st === 0 ? null : gunRef(), exhaust, thrusters, lamps, mouth, parts, plates, geos, L: Lay, tris,
    };
  }
  function gunRef() { return (model.getObjectByName('gun') as THREE.Group) ?? null; }
}
