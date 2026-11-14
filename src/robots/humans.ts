// Soldiers and crew of 1957, in atomic-age high-tech military kit: LIMBOPHOBIA's people (HumanRig, animated, with
// painted faces) under riveted olive-drab armour bolted to their joints. A sealed helmet with green-glowing visor
// lenses and a breathing grille on a gorget ring; a cuirass with the faction's marking and stencilled unit number;
// layered pauldrons; ribbed gauntlets; a backpack reactor with green phosphor tubes behind a cage, cooling fins and
// two armoured hoses down to the gorget; a webbing belt with pouches; knee and shin plates. Rifles carry their own
// valve stack glowing green. Variants: trooper, heavy (full power armour), engineer (a lamp helmet, a tool arm, a
// cutting torch), officer (peaked cap, greatcoat, breastplate, sidearm) and deck crew (jumpsuit, cap, headset).
// Liveries per faction (atlas.ts): U.S.P.C. olive with a white star, the expedition's cream and slate, Soviet
// grey-green with a red star, PRC dark green with a gold-rimmed star. Era hardware and markings only.
//
//   const h = militaryHuman('trooper', 'veyr');  scene.add(h.rig.root);  h.rig.update(dt, { speed });   (full control)
//   const o = buildMilitaryHuman('trooper', 'veyr');  scene.add(o);  o.userData.update(dt, { speed });  (an Object3D)
import * as THREE from 'three';
import { HumanRig, type Appearance, type Outfit } from '../limbo/entities/humanRig';
import { Researcher } from '../limbo/entities/researcher';
import { worldMaterial } from '../limbo/gfx/materials';
import { registerAllTextures } from '../limbo/gfx/textures/index';
import '../limbo/content/textures/materials';
import { RAMPS } from '../art/palette';
import { Kit } from './kit';
import { atlasFor, kitMaterial, kitUniforms, livery, liveryFor, type KitU, type LiveryId } from './atlas';
import { hash01 } from '../core/rand';

export type CrewVariant = 'trooper' | 'heavy' | 'engineer' | 'officer' | 'crew';
export interface MilitaryHuman {
  rig: HumanRig; variant: CrewVariant; liv: LiveryId;
  /** the held weapon (null for crew) and its muzzle */
  gun: THREE.Object3D | null; muzzle: THREE.Object3D | null;
  /** armour pieces by joint (debris on death) */
  armour: THREE.Mesh[];
  lamps: THREE.Object3D[];
  U: KitU; tris: number;
}
type J = 'hips' | 'spine' | 'chest' | 'neck' | 'head' | 'uarmL' | 'farmL' | 'handL' | 'uarmR' | 'farmR' | 'handR' | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR';

/** a few faces for the ranks (seeded): men and women, a spread of complexions */
function appearance(seed: number, helmet: boolean, o: Partial<Appearance> = {}): Appearance {
  const h = (i: number) => hash01(seed, i, 71);
  const skins = [0xf3d2b8, 0xe8b98f, 0xd39b6c, 0xb67a4c, 0x8d5634, 0x5e3a24], hairs = [0x1c1612, 0x3b2a1e, 0x6a4628, 0x9c7a46, 0xa8a49e];
  const fem = h(1) < 0.3;
  return {
    skin: skins[Math.floor(h(2) * skins.length)], hair: hairs[Math.floor(h(3) * hairs.length)],
    hairStyle: helmet ? 'buzz' : fem ? (h(4) < 0.5 ? 'bob' : 'ponytail') : (h(4) < 0.6 ? 'short' : 'buzz'),
    face: Math.floor(h(5) * 6), build: h(6) < 0.4 ? 'broad' : 'average', height: 0.97 + h(7) * 0.07, bodyShape: fem ? 0.85 : 0.1,
    eyeColor: [0x3a2a1a, 0x4a6a8a, 0x5a7a4a][Math.floor(h(8) * 3)], facialHair: !fem && h(9) < 0.25 ? 'moustache' : 'none', freckles: h(10) * 0.3, scars: h(11) < 0.2 ? 1 : 0, age: 0.2 + h(12) * 0.5,
    ...o,
  } as Appearance;
}
function outfit(v: CrewVariant, liv: LiveryId): Outfit {
  const L = livery(liv), A = RAMPS[L.a], B = RAMPS[L.b], ink = RAMPS.ink[2];
  const cloth = liv === 'exp' ? RAMPS.slate[3] : A[Math.min(3, A.length - 3)], cloth2 = liv === 'exp' ? RAMPS.slate[2] : A[2];
  const boots = { tex: 'c_shoes_boot', color: RAMPS.soil[1] };
  const gloves = { tex: 'c_gloves', color: RAMPS.fur[2] };
  switch (v) {
    case 'officer': return { torso: { tex: 'c_uniform', color: cloth, sleeve: 'long' }, torsoOuter: { tex: 'c_coat', color: cloth2, sleeve: 'long' }, legs: { tex: 'c_slacks', color: cloth2 }, legsKind: 'pants', feet: { tex: 'c_shoes_dress', color: ink, item: 'dress_shoes' }, hands: gloves, head: { tex: 'c_hat_cap', color: cloth2, hat: 'cap' } } as Outfit;
    case 'crew': return { torso: { tex: 'c_jumpsuit', color: liv === 'exp' ? RAMPS.sand[3] : B[Math.min(3, B.length - 3)] === RAMPS.steel[3] ? RAMPS.straw[2] : B[3], sleeve: 'long' }, legs: { tex: 'c_slacks', color: cloth2 }, legsKind: 'pants', feet: boots, hands: gloves, head: { tex: 'c_beanie', color: cloth2, hat: 'beanie' } } as Outfit;
    case 'engineer': return { torso: { tex: 'c_jumpsuit', color: liv === 'exp' ? RAMPS.sand[2] : RAMPS.straw[2], sleeve: 'long' }, legs: { tex: 'c_slacks', color: RAMPS.straw[1] }, legsKind: 'pants', feet: boots, hands: gloves } as Outfit;
    default: return { torso: { tex: 'c_uniform', color: cloth, sleeve: 'long' }, legs: { tex: 'c_slacks', color: cloth2 }, legsKind: 'pants', feet: boots, hands: gloves } as Outfit;
  }
}

/**
 * Build a soldier or crew member. `faction` is a game faction ('veyr', 'soviet', 'prc', 'expedition') or a livery id.
 * gestures: a Researcher rig (gesture(), lookAt(), say()) for scenes such as the operations room.
 */
export function militaryHuman(variant: CrewVariant, faction: string = 'veyr', o: { gestures?: boolean; seed?: number; name?: string; material?: THREE.Material; app?: Partial<Appearance> } = {}): MilitaryHuman {
  registerAllTextures();
  const liv: LiveryId = (['uspc', 'sov', 'prc', 'exp'] as string[]).includes(faction) ? faction as LiveryId : liveryFor(faction);
  const seed = o.seed ?? Math.floor(Math.random() * 1e6);
  const helmet = variant === 'trooper' || variant === 'heavy' || variant === 'engineer';
  const app = appearance(seed, helmet, { ...(variant === 'heavy' ? { build: 'broad' } : {}), ...o.app });
  const mat = o.material ?? worldMaterial({ noVis: true, noFog: true, noGrid: true });
  const rig: HumanRig = o.gestures ? new Researcher(app, mat) : new HumanRig(app, mat, { secondary: false });
  if (o.name) (rig as unknown as { ggOverrides: unknown }).ggOverrides = { badge: { col: [90, 96, 60], name: o.name } };
  rig.setOutfit(outfit(variant, liv));
  rig.skin.castShadow = true;
  const U = kitUniforms(), at = atlasFor(livery(liv)), mats = [kitMaterial(at, U)];
  const k = new Kit(6.5);
  const s = rig.s, j = rig.j as Record<J, THREE.Group>;
  const lamps: THREE.Object3D[] = [];
  const heavy = variant === 'heavy', light = variant === 'officer' || variant === 'crew';
  const S = (x: number) => x * s;
  const lampAt = (g: THREE.Object3D, x: number, y: number, z: number) => { const p = new THREE.Object3D(); p.position.set(x, y, z); g.add(p); lamps.push(p); };
  const B = heavy ? 1.18 : 1;

  // ---- the helmet: a sealed bell on a gorget, green visor lenses, a breathing grille, a crest, a stencil
  if (helmet) {
    k.on(j.head).push(0, S(0.085), S(0.015), 0, 0, 0, s * B * 0.98);
    k.lathe(0, 0, 0, [[0.12, -0.085], [0.136, -0.04], [0.142, 0.03], [0.124, 0.09], [0.08, 0.128], [0.001, 0.14]], 12, 'pa0', { regs: ['pa1', 'pa0', 'pa0', 'pas', 'pas'] });
    k.cyl(0, -0.012, 0, 0.144, 0.144, 0.018, 18, 'st0', { caps: false });
    k.box(0, 0.12, -0.01, 0.026, 0.04, 0.22, 'pa1', { ch: 0.006 }); // crest
    k.rivets([-0.143, -0.012, -0.06], [-0.143, -0.012, 0.06], 4, 0.005, '-x'); k.rivets([0.143, -0.012, -0.06], [0.143, -0.012, 0.06], 4, 0.005, 'x');
    if (variant === 'engineer') {
      // one big lens and a headlamp
      k.cyl(0, 0.0, 0.125, 0.05, 0.05, 0.05, 12, 'dk', { axis: 'z' }); k.lathe(0, 0.0, 0.15, [[0.04, 0], [0.056, 0], [0.056, 0.01], [0.042, 0.01]], 12, 'br', { axis: 'z' });
      k.cyl(0, 0.0, 0.152, 0.042, 0.042, 0.004, 12, 'lens', { axis: 'z', wrap: false, capReg: 'lens' });
      k.push(0.06, 0.09, 0.09, -0.4, 0.3, 0).lamp(0, 0, 0, 0.026, 0.03, 'lamp', 'pa1', false).pop();
    } else {
      k.box(0, 0.005, 0.118, 0.15, 0.06, 0.04, 'pa2', { ch: 0.01 });
      for (const x of [-0.04, 0.04]) {
        k.cyl(x, 0.008, 0.14, 0.024, 0.024, 0.02, 10, 'dk', { axis: 'z' });
        k.lathe(x, 0.008, 0.15, [[0.018, 0], [0.027, 0], [0.027, 0.008], [0.019, 0.008]], 10, 'br', { axis: 'z' });
        k.cyl(x, 0.008, 0.152, 0.019, 0.019, 0.004, 10, 'lens', { axis: 'z', wrap: false, capReg: 'lens' });
      }
    }
    // the breathing grille and its side canisters
    k.push(0, -0.055, 0.12, 0.3, 0, 0).box(0, 0, 0, 0.09, 0.05, 0.04, 'pa1', { ch: 0.008, f: { pz: 'gr' } }).pop();
    for (const x of [-1, 1]) k.cyl(x * 0.075, -0.06, 0.08, 0.022, 0.022, 0.05, 8, 'pb0', { axis: 'z' });
    k.push(0.143, 0.04, 0.0, 0, Math.PI / 2, 0).decal(0, 0, 0.002, 0.11, 0.03, 'num').pop();
    k.push(-0.13, 0.06, -0.05, 0, 0, 0.2).cyl(0, 0.08, 0, 0.003, 0.004, 0.16, 4, 'st1').cyl(0, 0.0, 0, 0.012, 0.014, 0.02, 6, 'st0').pop();
    k.pop();
    lampAt(j.head, 0, S(0.095), S(0.17));
  }
  // ---- the gorget and cuirass on the chest joint (the trunk), the marking, the unit number
  if (!light || variant === 'officer') {
    k.on(j.chest).push(0, 0, 0, 0, 0, 0, s * B);
    const w = variant === 'officer' ? 0.34 : 0.39, d = variant === 'officer' ? 0.25 : 0.28;
    k.box(0, 0.12, 0.02, w, variant === 'officer' ? 0.2 : 0.34, d, 'pa0', { ch: 0.04, f: { pz: 'pa2' } });
    k.box(0, 0.2, 0.15, w * 0.7, 0.12, 0.02, 'pa1', { ch: 0.006 });
    k.push(0, 0.2, 0.161).decal(-0.06, 0, 0, 0.09, 0.09, 'mark').decal(0.07, 0.0, 0, 0.1, 0.05, 'num').pop();
    k.rivets([-w * 0.45, -0.02, 0.165], [w * 0.45, -0.02, 0.165], 7, 0.006, 'z');
    if (variant !== 'officer') {
      k.lathe(0, 0.29, 0.0, [[0.13, 0], [0.14, 0.02], [0.12, 0.05], [0.1, 0.06]], 12, 'st0'); // gorget
      for (const x of [-1, 1]) k.push(x * 0.1, 0.32, -0.04).cyl(0, 0, 0, 0.018, 0.018, 0.03, 8, 'br').pop();
      k.push(0, 0.04, 0.162).decal(0, 0, 0, 0.26, 0.032, 'ser1').pop();
    }
    k.pop();
  }
  // ---- the backpack reactor: phosphor valves in a cage, fins, hoses to the gorget
  if (!light) {
    k.on(j.chest).push(0, 0, 0, 0, 0, 0, s * B);
    const pz = -0.2, ph = variant === 'engineer' ? 0.3 : 0.36;
    k.box(0, 0.13, pz, 0.3, ph, 0.14, 'pa1', { ch: 0.02 });
    k.box(0, 0.13, pz + 0.075, 0.24, ph * 0.8, 0.02, 'st0'); // the frame against the cuirass
    for (const x of [-1, 1]) for (let i = 0; i < 5; i++) k.box(x * 0.16, 0.0 + i * 0.05, pz, 0.02, 0.012, 0.12, 'st1');
    k.box(0, 0.13, pz - 0.075, 0.2, 0.18, 0.012, 'dk');
    k.on(j.chest, 0);
    for (let i = 0; i < 3; i++) {
      k.push(0, 0, 0, 0, 0, 0, s * B);
      const x = (i - 1) * 0.055;
      k.cyl(x, 0.07, pz - 0.085, 0.016, 0.016, 0.014, 8, 'br', { axis: 'z' });
      k.lathe(x, 0.08, pz - 0.09, [[0.012, 0], [0.014, 0.06], [0.01, 0.09], [0.001, 0.1]], 8, 'lamp', { wrap: false });
      k.pop();
      lampAt(j.chest, S(x * B), S(0.14 * B), S((pz - 0.1) * B));
    }
    k.push(0, 0, 0, 0, 0, 0, s * B);
    for (const x of [-0.1, 0, 0.1]) k.box(x, 0.13, pz - 0.105, 0.008, 0.2, 0.008, 'st1'); // the cage bars
    k.box(0, 0.24, pz - 0.105, 0.22, 0.012, 0.012, 'st1'); k.box(0, 0.02, pz - 0.105, 0.22, 0.012, 0.012, 'st1');
    k.push(0, 0.32, pz).cyl(0, 0, 0, 0.05, 0.05, 0.04, 10, 'pb0').pop();
    for (const x of [-1, 1]) k.hose([x * 0.12, 0.3, pz + 0.02], [0, 1, 0.4], [x * 0.1, 0.33, -0.04], [0, -0.3, 1], 0.014, 'hose', { n: 8 });
    k.push(0, 0.13, pz - 0.112, 0, Math.PI, 0).decal(0, -0.13, 0, 0.18, 0.024, 'ser2').pop();
    k.pop();
  }
  // ---- the belt with pouches and a buckle
  k.on(j.hips).push(0, 0, 0, 0, 0, 0, s * B);
  k.cyl(0, 0.04, 0, 0.165, 0.16, 0.05, 16, 'cv', { caps: false });
  k.box(0, 0.04, 0.165, 0.05, 0.04, 0.012, 'br', { ch: 0.004 });
  for (const a of [0.7, 1.2, -0.7, -1.2, 2.6]) k.push(Math.sin(a) * 0.17, 0.02, Math.cos(a) * 0.165, 0, a, 0).box(0, 0, 0.012, 0.06, 0.07, 0.035, 'felt', { ch: 0.008 }).pop();
  k.pop();
  // ---- pauldrons, sleeves, gauntlets
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 1 : -1;
    const ua = j[('uarm' + side) as J], fa = j[('farm' + side) as J];
    if (!(variant === 'crew')) {
      k.on(ua).push(0, 0, 0, 0, 0, 0, s * B);
      const n = heavy ? 3 : variant === 'officer' ? (side === 'L' ? 1 : 0) : 2;
      for (let i = 0; i < n; i++) k.push(x * 0.01, 0.03 - i * 0.045, 0, 0, 0, x * -0.25).cyl(0, 0, 0, 0.095 - i * 0.004, 0.11 - i * 0.004, 0.05, 10, i % 2 ? 'pa2' : 'pa1', { arc: Math.PI * 1.1, a0: -Math.PI * 0.05 + (x < 0 ? 0 : 0), caps: false }).pop();
      if (n) { k.bolt(x * 0.09, 0.03, 0.03, 0.007, x > 0 ? 'x' : '-x'); k.bolt(x * 0.09, 0.03, -0.03, 0.007, x > 0 ? 'x' : '-x'); }
      if (heavy) k.cyl(0, -0.16, 0, 0.062, 0.058, 0.16, 10, 'pa0', { caps: false });
      k.pop();
    }
    if (!light) {
      k.on(fa).push(0, 0, 0, 0, 0, 0, s * B);
      k.cyl(0, -0.13, 0, 0.058, 0.05, 0.2, 10, 'pa0', { caps: false });
      for (const y of [-0.05, -0.12, -0.19]) k.cyl(0, y, 0, 0.061, 0.061, 0.014, 10, 'st0', { caps: false });
      if (side === 'L') { k.box(x * 0.0, -0.1, 0.06, 0.06, 0.06, 0.03, 'pa2', { ch: 0.006 }); k.cyl(0, -0.09, 0.077, 0.01, 0.01, 0.006, 6, 'lamp', { axis: 'z', wrap: false, capReg: 'lamp' }); lampAt(fa, 0, S(-0.09 * B), S(0.085 * B)); }
      k.pop();
    }
  }
  // ---- legs: knee plates for everyone armed, full plate for the heavy
  if (!light) for (const side of ['L', 'R'] as const) {
    const th = j[('thigh' + side) as J], sh = j[('shin' + side) as J];
    k.on(sh).push(0, 0, 0, 0, 0, 0, s * B);
    k.lathe(0, 0.0, 0.07, [[0.001, -0.04], [0.05, -0.03], [0.06, 0.0], [0.05, 0.04], [0.001, 0.05]], 8, 'pa1', { axis: 'z' });
    if (heavy || variant === 'trooper') k.box(0, -0.2, 0.06, 0.1, 0.26, 0.03, 'pa0', { ch: 0.008 });
    k.pop();
    if (heavy) k.on(th).push(0, 0, 0, 0, 0, 0, s * B).box(0, -0.2, 0.07, 0.15, 0.28, 0.04, 'pa2', { ch: 0.01 }).rivets([-0.06, -0.08, 0.091], [0.06, -0.08, 0.091], 4, 0.006, 'z').pop();
  }
  // ---- the deck crew's headset; the engineer's tool arm
  if (variant === 'crew' || variant === 'officer') {
    k.on(j.head).push(0, S(0.105), 0, 0, 0, 0, s);
    if (variant === 'crew') {
      k.torus(0, 0, 0, 0.1, 0.009, 14, 4, 'dk', 'z');
      for (const x of [-1, 1]) k.cyl(x * 0.1, -0.02, 0, 0.04, 0.042, 0.04, 10, 'rb', { axis: 'x' });
      k.tube([[-0.11, -0.03, 0.02], [-0.09, -0.08, 0.08], [-0.03, -0.1, 0.11]], 0.005, 5, 'dk');
    }
    k.pop();
  }
  if (variant === 'engineer') {
    k.on(j.chest).push(0, 0, 0, 0, 0, 0, s);
    // a two-link tool arm off the pack, over the right shoulder, a welding head on its end
    k.box(-0.14, 0.3, -0.2, 0.05, 0.05, 0.06, 'st0', { ch: 0.006 });
    k.push(-0.14, 0.32, -0.2, -0.9, 0, 0.2).box(0, 0.12, 0, 0.03, 0.24, 0.035, 'pa2', { ch: 0.006 }).hinge(0, 0.24, 0, 0.05, 0.016, 3).push(0, 0.24, 0, 1.6, 0, 0).box(0, 0.09, 0, 0.026, 0.18, 0.03, 'pa1', { ch: 0.005 }).cyl(0, 0.2, 0, 0.018, 0.012, 0.05, 8, 'br').pop().pop();
    k.pop();
  }
  const armour = k.finish(mats);
  let tris = k.tris;
  // ---- the weapon
  let gun: THREE.Object3D | null = null, muzzle: THREE.Object3D | null = null;
  if (variant !== 'crew') {
    const g = new THREE.Group();
    const gk = new Kit(7);
    gk.on(g);
    if (variant === 'officer') {
      gk.box(0.0, 0, 0, 0.12, 0.03, 0.025, 'dk', { ch: 0.005 }); gk.box(-0.05, -0.04, 0, 0.03, 0.07, 0.022, 'pb0', { ch: 0.006 });
      gk.cyl(0.1, 0.005, 0, 0.008, 0.008, 0.1, 8, 'st0', { axis: 'x' });
      muzzle = new THREE.Object3D(); muzzle.position.set(0.15, 0.005, 0);
    } else if (variant === 'engineer') {
      // a cutting torch carbine: two tanks, a hose, a nozzle
      gk.box(0, 0, 0, 0.3, 0.04, 0.035, 'pa1', { ch: 0.006 });
      gk.cyl(0.05, -0.04, 0, 0.022, 0.022, 0.2, 10, 'pb0', { axis: 'x' });
      gk.cyl(0.25, 0.0, 0, 0.012, 0.018, 0.22, 8, 'br', { axis: 'x' });
      gk.cyl(0.36, 0.0, 0, 0.02, 0.014, 0.04, 8, 'dk', { axis: 'x' });
      gk.box(-0.07, -0.05, 0, 0.03, 0.08, 0.025, 'dk');
      muzzle = new THREE.Object3D(); muzzle.position.set(0.39, 0, 0);
    } else {
      // the rifle: a stock, the receiver with a cage of green valves on top, a drum, a jacketed barrel
      const L = heavy ? 1.35 : 1;
      gk.push(0, 0, 0, 0, 0, 0, L);
      gk.prism(-0.26, -0.02, 0, [[-0.13, -0.05], [0.0, -0.01], [0.0, 0.03], [-0.13, 0.02]], 0.035, 'pb1');
      gk.box(-0.04, 0, 0, 0.3, 0.06, 0.05, 'pa1', { ch: 0.008 });
      gk.box(-0.08, -0.06, 0, 0.03, 0.07, 0.03, 'dk', { ch: 0.004 });
      gk.cyl(0.03, -0.065, 0, 0.05, 0.05, 0.035, 12, 'pb0', { axis: 'z' });
      gk.cyl(0.24, 0.0, 0, 0.026, 0.026, 0.26, 10, 'vent', { axis: 'x' });
      gk.cyl(0.32, 0.0, 0, 0.012, 0.011, 0.42, 8, 'dk', { axis: 'x' });
      gk.cyl(0.53, 0.0, 0, 0.018, 0.018, 0.04, 8, 'st0', { axis: 'x' });
      gk.box(-0.04, 0.035, 0, 0.18, 0.01, 0.05, 'st0');
      for (const x of [-0.1, -0.04, 0.02]) { gk.cyl(x, 0.045, 0, 0.012, 0.012, 0.01, 8, 'br'); }
      for (const [x, z] of [[-0.13, -0.022], [-0.13, 0.022], [0.05, -0.022], [0.05, 0.022]]) gk.cyl(x, 0.075, z, 0.003, 0.003, 0.07, 4, 'st1');
      gk.box(-0.04, 0.11, 0, 0.2, 0.008, 0.05, 'st0');
      gk.pop();
      gk.on(g, 0);
      gk.push(0, 0, 0, 0, 0, 0, L);
      for (const x of [-0.1, -0.04, 0.02]) gk.lathe(x, 0.05, 0, [[0.009, 0], [0.01, 0.035], [0.007, 0.05], [0.001, 0.055]], 8, 'lamp', { wrap: false });
      gk.pop();
      muzzle = new THREE.Object3D(); muzzle.position.set(0.56 * L, 0, 0);
      for (const x of [-0.1, -0.04, 0.02]) lampAt(g, x * L, 0.08 * L, 0);
    }
    g.add(muzzle);
    const gm = gk.finish(mats);
    tris += gk.tris;
    g.scale.setScalar(s);
    rig.hold('R', g, 'along');
    gun = g;
    void gm;
  }
  return { rig, variant, liv, gun, muzzle, armour, lamps, U, tris };
}

/** the same as an Object3D (its rig root, at game scale 0.6 unless opts.scale): userData.human is the MilitaryHuman,
 *  userData.update(dt, animInput) animates it. Variants: trooper (or 'soldier'), heavy, engineer, officer, crew. */
export function buildMilitaryHuman(variant: string, faction: string = 'veyr', o: { gestures?: boolean; seed?: number; name?: string; scale?: number } = {}): THREE.Object3D {
  const v: CrewVariant = variant === 'soldier' ? 'trooper' : (['trooper', 'heavy', 'engineer', 'officer', 'crew'] as string[]).includes(variant) ? variant as CrewVariant : 'trooper';
  const h = militaryHuman(v, faction, o);
  const root = h.rig.root;
  root.scale.setScalar(o.scale ?? 0.6);
  root.userData.human = h;
  root.userData.update = (dt: number, inp?: object) => h.rig.update(dt, inp as never);
  return root;
}
