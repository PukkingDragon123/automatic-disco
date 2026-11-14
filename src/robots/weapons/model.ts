// A designed weapon as hardware: the frame's receiver and grip or mount, the power unit bolted to it, the barrel or
// emitter in front and the payload's magazine, tanks, hopper, quiver or glass gland jar. Built along +z from the
// receiver (the muzzle at the front), in a livery, with the machine kit; one mesh, a muzzle point, the lamps.
import * as THREE from 'three';
import { Kit } from '../kit';
import { atlasFor, kitMaterial, kitUniforms, livery, type KitU, type LiveryId } from '../atlas';
import type { WeaponDesign } from './parts';

export interface WeaponMesh { root: THREE.Group; muzzle: THREE.Object3D; length: number; U: KitU; tris: number }

const SIZE: Record<string, number> = { pistol: 0.55, rifle: 1, armmount: 0.9, cannon: 1.6, turret: 1.3 };

export function buildWeaponMesh(d: WeaponDesign, liv: LiveryId = 'uspc', mats?: THREE.Material[], U?: KitU): WeaponMesh {
  const root = new THREE.Group(); root.name = 'weapon:' + d.name;
  const body = new THREE.Group(); root.add(body);
  const uni = U ?? kitUniforms();
  const M = mats ?? [kitMaterial(atlasFor(livery(liv)), uni)];
  const k = new Kit(9);
  const S = SIZE[d.frame] ?? 1;
  k.on(body).push(0, 0, 0, 0, 0, 0, S);
  // ---- the frame: receiver from z = -0.1 to 0.12
  const rz0 = -0.1, rz1 = 0.12;
  switch (d.frame) {
    case 'pistol':
      k.box(0, 0, 0.01, 0.045, 0.06, 0.22, 'pa1', { ch: 0.008 });
      k.push(0, -0.05, -0.06, 0.35, 0, 0).box(0, -0.04, 0, 0.04, 0.1, 0.05, 'pb1', { ch: 0.01 }).pop();
      k.tube([[0, -0.03, 0.0], [0, -0.07, 0.01], [0, -0.07, 0.05], [0, -0.03, 0.06]], 0.005, 4, 'st0');
      break;
    case 'rifle':
      k.box(0, 0, 0.01, 0.05, 0.065, 0.24, 'pa1', { ch: 0.008 });
      k.push(0, -0.01, -0.12).prism(0, 0, 0, [[0, 0.03], [0, -0.04], [-0.24, -0.08], [-0.26, -0.02], [-0.24, 0.03]].map(([z, y]) => [y, z] as [number, number]), 0.04, 'pb1').pop();
      k.push(0, -0.05, -0.04, 0.35, 0, 0).box(0, -0.035, 0, 0.035, 0.08, 0.045, 'pb1', { ch: 0.008 }).pop();
      k.box(0, 0.04, 0.0, 0.03, 0.014, 0.12, 'st0');
      break;
    case 'armmount':
      for (const z of [-0.06, 0.04]) { k.torus(0, -0.05, z, 0.065, 0.012, 14, 4, 'st0', 'z'); k.bolt(0.07, -0.05, z, 0.008, 'x'); }
      k.box(0, 0.035, 0.0, 0.07, 0.07, 0.24, 'pa1', { ch: 0.01 });
      k.box(0.075, 0.0, -0.03, 0.06, 0.09, 0.1, 'pb0', { ch: 0.01 }); // the belt box
      k.tube([[0.06, 0.045, 0.0], [0.04, 0.07, 0.02], [0.02, 0.065, 0.04]], 0.012, 4, 'ammo');
      break;
    case 'cannon':
      for (const s of [-1, 1]) k.box(s * 0.07, -0.02, 0.0, 0.02, 0.1, 0.18, 'pa2', { ch: 0.006 });
      k.cyl(0, 0, 0, 0.022, 0.022, 0.18, 8, 'st1', { axis: 'x' });
      k.box(0, 0.0, -0.02, 0.1, 0.1, 0.2, 'pa1', { ch: 0.012 });
      k.lathe(0, 0, -0.12, [[0.045, 0], [0.05, 0.02], [0.03, 0.04]], 10, 'knurl', { axis: '-z' });
      k.box(0, -0.06, -0.02, 0.08, 0.02, 0.14, 'st0');
      break;
    case 'turret':
      k.cyl(0, -0.12, -0.02, 0.18, 0.18, 0.04, 16, 'st0');
      k.cyl(0, -0.095, -0.02, 0.16, 0.16, 0.012, 16, 'pa1');
      for (const s of [-1, 1]) k.box(s * 0.09, -0.04, -0.02, 0.02, 0.12, 0.12, 'pa1', { ch: 0.006 });
      k.box(0, 0.0, 0.0, 0.12, 0.08, 0.22, 'pa2', { ch: 0.012 });
      k.push(0, 0.02, 0.15, -0.15, 0, 0).cyl(0, 0, 0, 0.16, 0.17, 0.12, 10, 'pa0', { arc: Math.PI * 0.9, a0: Math.PI * 0.05, caps: false }).pop();
      for (let i = 0; i < 6; i++) k.bolt(Math.cos(i) * 0.15, -0.098, -0.02 + Math.sin(i) * 0.15, 0.008, 'y');
      break;
  }
  // ---- the power unit
  const lamp = (x: number, y: number, z: number) => { const o = new THREE.Object3D(); o.position.set(x * S, y * S, z * S); body.add(o); };
  switch (d.power) {
    case 'powder':
      if (d.payload === 'slugs' || d.payload === 'darts') {
        k.box(0, -0.075, 0.04, 0.035, d.payload === 'darts' ? 0.14 : 0.09, 0.05, 'pb0', { ch: 0.006 });
        k.push(0.0181, -0.075, 0.04, 0, Math.PI / 2, 0).decal(0, 0, 0, 0.04, 0.03, 'ammo').pop();
      } else k.cyl(0, -0.07, 0.04, 0.05, 0.05, 0.04, 12, 'pb0', { axis: 'x' });
      break;
    case 'electric':
      for (let i = 0; i < 4; i++) k.torus(0, 0, rz1 + 0.01 + i * 0.022, 0.034, 0.008, 12, 4, 'br', 'z');
      k.box(0, 0.06, 0.0, 0.06, 0.012, 0.14, 'st0');
      for (const z of [-0.04, 0.0, 0.04]) k.cyl(0, 0.072, z, 0.011, 0.011, 0.012, 8, 'br');
      for (const z of [-0.04, 0.0, 0.04]) { k.lathe(0, 0.078, z, [[0.008, 0], [0.009, 0.03], [0.006, 0.042], [0.001, 0.045]], 8, 'lamp', { wrap: false }); lamp(0, 0.1, z); }
      for (const [x, z] of [[-0.022, -0.06], [0.022, -0.06], [-0.022, 0.06], [0.022, 0.06]]) k.cyl(x, 0.1, z, 0.002, 0.002, 0.06, 4, 'st1');
      k.box(0, 0.13, 0, 0.05, 0.006, 0.13, 'st0');
      break;
    case 'steam':
      k.cyl(0, -0.08, 0.01, 0.04, 0.04, 0.16, 12, 'pa2', { axis: 'z' });
      for (const z of [-0.07, 0.09]) k.lathe(0, -0.08, z, [[0.04, 0], [0.03, 0.012 * Math.sign(z)], [0.001, 0.016 * Math.sign(z)]], 12, 'pa2', { axis: 'z' });
      k.push(0.04, -0.08, 0.02, 0, Math.PI / 2, 0).meter(0, 0, 0, 0.04, 0.03).pop();
      k.pipe([[0, -0.04, 0.06], [0, -0.02, 0.08], [0, -0.0, 0.1]], 0.007, 'br');
      k.cyl(-0.03, -0.045, -0.04, 0.008, 0.008, 0.03, 6, 'br');
      break;
    case 'gravity':
      for (let i = 0; i < 3; i++) k.torus(0, 0, rz1 + 0.015 + i * 0.03, 0.045 - i * 0.004, 0.011, 14, 5, 'br', 'z');
      k.box(0, 0.055, -0.02, 0.05, 0.03, 0.08, 'st0', { ch: 0.006 });
      k.push(0, 0.075, -0.02).lathe(0, 0, 0, [[0.012, 0], [0.016, 0.02], [0.006, 0.05], [0.001, 0.055]], 6, 'lens', { wrap: false }).pop();
      lamp(0, 0.1, -0.02);
      break;
    case 'atomic':
      k.lathe(0, 0.075, -0.03, [[0.035, -0.05], [0.042, -0.04], [0.042, 0.04], [0.035, 0.05], [0.001, 0.055]], 12, 'dk', { axis: 'z' });
      k.cyl(0, 0.075, -0.03, 0.044, 0.044, 0.02, 12, 'hz', { axis: 'z', caps: false });
      k.push(0, 0.075, 0.025).box(0, 0, 0, 0.03, 0.03, 0.006, 'st0', { f: { pz: 'lamp' } }).pop();
      lamp(0, 0.075, 0.03);
      for (const s of [-1, 1]) k.box(s * 0.025, 0.035, -0.03, 0.01, 0.03, 0.02, 'st0');
      break;
  }
  // ---- the barrel or emitter, from the receiver's front
  const bz = rz1 + (d.power === 'electric' ? 0.09 : d.power === 'gravity' ? 0.09 : 0);
  let len = 0.3;
  switch (d.barrel) {
    case 'rifled': len = d.frame === 'pistol' ? 0.1 : d.frame === 'cannon' ? 0.5 : 0.36; k.push(0, 0, bz).barrel(len, d.frame === 'cannon' ? 0.03 : 0.011, { jacket: d.frame !== 'pistol', brake: d.frame === 'cannon' }).pop(); break;
    case 'rail':
      len = 0.4;
      for (const y of [-0.016, 0.016]) k.box(0, y, bz + len / 2, 0.02, 0.008, len, 'br');
      for (let i = 0; i < 5; i++) { const z = bz + 0.04 + i * (len - 0.06) / 4; k.box(0, 0, z, 0.032, 0.05, 0.012, 'dk'); for (const x of [-1, 1]) k.cyl(x * 0.02, 0, z, 0.006, 0.006, 0.014, 6, 'glass', { axis: 'x' }); }
      k.box(0, 0, bz + len, 0.04, 0.05, 0.02, 'st0', { ch: 0.004 });
      break;
    case 'flame':
      len = 0.24;
      k.cyl(0, 0, bz + 0.08, 0.016, 0.014, 0.16, 8, 'st0', { axis: 'z' });
      k.lathe(0, 0, bz + 0.16, [[0.014, 0], [0.024, 0.05], [0.028, 0.08], [0.022, 0.08]], 10, 'soot', { axis: 'z' });
      k.box(0, -0.03, bz + 0.18, 0.012, 0.02, 0.04, 'br'); // the pilot light housing
      k.cyl(0, -0.03, bz + 0.2, 0.006, 0.006, 0.004, 6, 'lensB', { axis: 'z', wrap: false, capReg: 'lensB' });
      lamp(0, -0.03, bz + 0.21);
      break;
    case 'lens':
      len = 0.26;
      k.cyl(0, 0, bz + 0.06, 0.02, 0.02, 0.12, 8, 'st0', { axis: 'z' });
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; k.tube([[Math.cos(a) * 0.02, Math.sin(a) * 0.02, bz + 0.1], [Math.cos(a) * 0.055, Math.sin(a) * 0.055, bz + 0.2]], 0.004, 4, 'st1'); }
      k.torus(0, 0, bz + 0.2, 0.06, 0.012, 16, 5, 'br', 'z');
      k.lathe(0, 0, bz + 0.2, [[0.001, -0.01], [0.04, -0.006], [0.052, 0], [0.04, 0.006], [0.001, 0.012]], 12, 'lens', { axis: 'z', wrap: false });
      lamp(0, 0, bz + 0.22);
      break;
    case 'spore':
      len = 0.3;
      k.cyl(0, 0, bz + 0.13, 0.042, 0.042, 0.26, 12, 'pa0', { axis: 'z' });
      for (const z of [0.04, 0.12, 0.2]) k.cyl(0, 0, bz + z, 0.047, 0.047, 0.014, 12, 'st0', { axis: 'z' });
      k.lathe(0, 0, bz + 0.26, [[0.042, 0], [0.056, 0.03], [0.05, 0.035], [0.036, 0.004]], 12, 'pb0', { axis: 'z' });
      break;
  }
  // ---- the payload's container
  const bio: Record<string, string> = { venom: 'bioV', acid: 'bioA', spores: 'bioS', paralytic: 'bioP' };
  if (bio[d.payload]) {
    // a gland culture in a glass jar on a brass cradle, a feed line forward
    const jx = d.frame === 'turret' ? 0.11 : 0.07, jy = 0.0;
    k.cyl(jx, jy, -0.02, 0.034, 0.034, 0.012, 10, 'br', { axis: 'z' }); k.cyl(jx, jy, 0.1, 0.034, 0.034, 0.012, 10, 'br', { axis: 'z' });
    for (const a of [0.5, 2.6, 4.7]) k.cyl(jx + Math.cos(a) * 0.03, jy + Math.sin(a) * 0.03, 0.04, 0.003, 0.003, 0.12, 4, 'st1', { axis: 'z' });
    k.lathe(jx, jy, -0.012, [[0.022, 0], [0.028, 0.02], [0.028, 0.085], [0.02, 0.105]], 10, bio[d.payload], { axis: 'z' });
    k.box(jx * 0.5, jy, 0.11, jx, 0.012, 0.012, 'st0');
    k.tube([[jx, jy, 0.11], [jx * 0.6, jy + 0.01, 0.13], [0.0, 0.0, bz]], 0.006, 5, 'hose');
    lamp(jx, jy, 0.04);
  } else if (d.payload === 'napalm') {
    for (const s of [-1, 1]) { k.cyl(s * 0.035, -0.09, 0.0, 0.026, 0.026, 0.16, 10, 'pb0', { axis: 'z' }); k.cyl(s * 0.035, -0.09, 0.03, 0.028, 0.028, 0.014, 10, 'hz', { axis: 'z', caps: false }); k.lathe(s * 0.035, -0.09, 0.08, [[0.026, 0], [0.018, 0.012], [0.006, 0.02]], 10, 'pb0', { axis: 'z' }); }
    k.box(0, -0.06, 0.0, 0.08, 0.012, 0.1, 'st0');
    k.hose([0.035, -0.09, 0.1], [0, 0, 1], [0, -0.02, bz + 0.06], [0, 0.4, 1], 0.007, 'hose', { n: 6 });
  } else if (d.payload === 'rocks') {
    k.box(0.0, 0.07, -0.03, 0.08, 0.06, 0.1, 'pa2', { ch: 0.006, f: { py: 'rock' } });
  } else if (d.payload === 'spines') {
    k.box(0.05, 0.02, -0.03, 0.03, 0.06, 0.1, 'pb1', { ch: 0.004 });
    for (let i = 0; i < 5; i++) k.push(0.05, 0.05, -0.07 + i * 0.02, -0.4, 0, 0).cyl(0, 0.03, 0, 0.004, 0.0005, 0.07, 4, 'bioA').pop();
  }
  k.pop();
  const meshes = k.finish(M);
  void meshes;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, (bz + len + 0.01) * S); muzzle.name = 'muzzle'; body.add(muzzle);
  return { root, muzzle, length: (bz + len - rz0) * S, U: uni, tris: k.tris };
}
