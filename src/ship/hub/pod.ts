// The capsule pod in the workshop cradle: Unit 07's ride down and its body on the planet. A blunt UNAA lander
// about 2 m across: a dark ablative heat shield, a white panelled ogive with the orange program band, a smoked
// visor band with Unit 07's lens glowing behind it, a docking collar and whip antenna on top, RCS quads on the
// shoulders, three folded landing legs and four arm sockets. Built in stages for the intro (podBuild): the frame
// ribs, then the plating course by course, the glazing and shield, the legs and thrusters, then the lights.
import * as THREE from 'three';
import { Mats, Bin, box, cyl, lathe } from './kit';
import { labelTex } from './tex';
import { gbuf, F_EMIT } from '../../gfx/gbuf';

export interface HubPod { root: THREE.Group; set(k: number): void; k: number; lens: THREE.MeshBasicMaterial; update(dt: number, t: number): void }

export function buildPod(bin: Bin, M: Mats): HubPod {
  const root = new THREE.Group(); root.name = 'hub-pod';
  const white = M.get('pod.white', { color: 0xdedcd2, rough: 0.45, metal: 0.1 });
  const orange = M.get('pod.orange', { color: 0xd06a2c, rough: 0.5 });
  const dark = M.get('pod.dark', { color: 0x2a2c2e, rough: 0.6, metal: 0.3 });
  const shieldM = M.get('pod.shield', { color: 0x3a3430, rough: 0.9 });
  const frameM = M.get('pod.frame', { color: 0x6a7074, rough: 0.4, metal: 0.7 });
  const glass = M.get('pod.glass', { color: 0x203038, rough: 0.08, metal: 0.4, env: 1.4 });
  const lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7fe0a0).multiplyScalar(0) }); bin.m(lens);
  gbuf(lens, F_EMIT);
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const me = new THREE.Mesh(bin.g(g), m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; me.receiveShadow = true; parent.add(me); return me;
  };
  // the profile (radius, height) of the hull from the shield up to the collar
  const prof: [number, number][] = [[0.98, 0.32], [1.0, 0.5], [0.96, 0.9], [0.86, 1.3], [0.7, 1.68], [0.5, 1.98], [0.36, 2.12]];
  // stage 1: frame ribs and rings
  const frame = new THREE.Group(); root.add(frame);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (let k = 0; k < prof.length - 1; k++) {
      const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
      const len = Math.hypot(r1 - r0, y1 - y0), ang = Math.atan2(r1 - r0, y1 - y0);
      const g = new THREE.Group(); g.rotation.y = a; frame.add(g);
      add(g, box(0.05, len, 0.05), frameM, 0, (y0 + y1) / 2, (r0 + r1) / 2 - 0.03, ang, 0, 0);
    }
  }
  for (const [r, y] of prof) add(frame, new THREE.TorusGeometry(r - 0.03, 0.025, 4, 24), frameM, 0, y, 0, Math.PI / 2);
  // stage 2: plating, course by course (each course a lathe band of 8 panels with seams)
  const plates: THREE.Group[] = [];
  for (let k = 0; k < prof.length - 1; k++) {
    const course = new THREE.Group(); root.add(course); plates.push(course);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2 + 0.012, a1 = ((i + 1) / 8) * Math.PI * 2 - 0.012;
      const g = new THREE.LatheGeometry([new THREE.Vector2(prof[k][0], prof[k][1] + 0.008), new THREE.Vector2(prof[k + 1][0], prof[k + 1][1] - 0.008)], 4, a0, a1 - a0);
      g.computeVertexNormals();
      const m = k === 1 ? orange : k === 3 ? glass : white;
      add(course, g, m);
    }
  }
  // the visor band glows from behind (Unit 07's lens): an inner emissive ring
  const lensRing = add(root, new THREE.CylinderGeometry(0.82, 0.68, 0.36, 24, 1, true), lens, 0, 1.49, 0);
  lensRing.scale.setScalar(0.97);
  // stage 3: the heat shield and collar
  const shield = new THREE.Group(); root.add(shield);
  add(shield, lathe([[0, 0.12], [0.6, 0.14], [0.94, 0.2], [1.02, 0.3], [0.98, 0.34], [0, 0.34]], 32), shieldM);
  add(shield, cyl(0.36, 0.4, 0.14, 20), dark, 0, 2.19, 0);
  add(shield, new THREE.TorusGeometry(0.38, 0.03, 6, 20), frameM, 0, 2.26, 0, Math.PI / 2);
  // the UNAA band lettering on the orange course
  const lt = labelTex('UNAA  07', { size: 64, fg: 0xf0ece0 });
  const lm = M.get('pod.label', { map: lt, transparent: true, rough: 0.6, polyOffset: 1, flag: 0 });
  for (const a of [0.0, Math.PI]) { const g = new THREE.Group(); g.rotation.y = a; shield.add(g); add(g, new THREE.PlaneGeometry(0.9, 0.2), lm, 0, 0.7, 0.99, -0.05); }
  // stage 4: legs (folded), RCS quads, arm sockets, antenna
  const gear = new THREE.Group(); root.add(gear);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group(); g.rotation.y = (i / 3) * Math.PI * 2 + 0.5; gear.add(g);
    add(g, box(0.1, 0.9, 0.08, 0.02), frameM, 0, 0.6, 0.98, -0.25);
    add(g, box(0.06, 0.6, 0.06), dark, 0, 0.45, 1.12, 0.35);
    add(g, cyl(0.16, 0.2, 0.06, 12), dark, 0, 0.06, 1.24);
  }
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group(); g.rotation.y = (i / 4) * Math.PI * 2 + Math.PI / 4; gear.add(g);
    add(g, box(0.22, 0.22, 0.12, 0.03), dark, 0, 1.75, 0.68, -0.6);
    for (const [x, y] of [[0.11, 0], [-0.11, 0], [0, 0.11]]) add(g, cyl(0.025, 0.04, 0.08, 8), frameM, x, 1.75 + y, 0.76, Math.PI / 2 - 0.6);
    // arm socket: a ring with a folded stub arm
    const s = new THREE.Group(); s.rotation.y = Math.PI / 4; g.add(s);
    add(s, new THREE.TorusGeometry(0.14, 0.035, 6, 16), frameM, 0, 1.0, 0.96, 0, 0, 0);
    add(s, box(0.12, 0.42, 0.12, 0.03), dark, 0, 0.82, 1.02, 0.25);
  }
  add(gear, cyl(0.012, 0.008, 0.9, 5), frameM, 0.22, 2.7, 0.0);
  // stage 5: nav lights
  const navs: THREE.MeshBasicMaterial[] = [];
  for (const [col, a] of [[0xff4030, 0], [0x40ff70, Math.PI], [0xfff0d0, Math.PI / 2], [0xfff0d0, -Math.PI / 2]] as [number, number][]) {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0) }); bin.m(m); navs.push(m); (m as any).__col = col;
    gbuf(m, F_EMIT);
    add(gear, new THREE.SphereGeometry(0.04, 8, 6), m, Math.sin(a) * 0.98, 0.42, Math.cos(a) * 0.98);
  }
  const pod: HubPod = {
    root, k: 1, lens,
    set(k: number) {
      pod.k = k;
      frame.visible = k > 0.02;
      plates.forEach((p, i) => { const u = (k - 0.2) / 0.3 * plates.length - i; p.visible = u > 0; p.scale.setScalar(u > 0 ? Math.min(1, 0.9 + u * 0.1) : 1); });
      shield.visible = k > 0.55; gear.visible = k > 0.72;
      frame.visible = k > 0.02 && k < 0.6;
    },
    update(dt, t) {
      const on = pod.k >= 0.92 ? 1 : 0;
      lens.color.setHex(0x7fe0a0).multiplyScalar(on * (1.2 + Math.sin(t * 1.3) * 0.25));
      navs.forEach((m, i) => m.color.setHex((m as any).__col).multiplyScalar(on * (i < 2 ? (Math.sin(t * 3 + i) > 0.2 ? 2.6 : 0.2) : 1.6)));
    },
  };
  pod.set(1);
  return pod;
}
