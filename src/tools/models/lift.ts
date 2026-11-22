// LIFT FIELD (tool 'lift'), a 1.2 m field emitter that floats loads: a hexagonal sapphire base whose slots show a
// FLYWHEEL spinning inside, three EMITTER PYLONS (copper-wound posts under glowing caps, lighting in a chase), two
// FIELD RINGS floating above them, turning against each other and bobbing on the field, and in the middle a
// LEVITATED ROCK drifting and tumbling slowly. Charging, the rings sink and spin up; working, they rise and the rock
// floats higher. Level 2: three short relay pylons between the tall ones. Level 3: a crown ring and a capacitor bank.
import * as THREE from 'three';
import { type Kit, R, PI, TAU, cbox, box, lathe, cyl, ring, sphere, cone, helix, torus, setGlow } from './kit';
import type { ToolSpec } from './model';

export const LIFT: ToolSpec = {
  id: 'lift', name: 'Lift Field',
  livery: { name: 'sapphire', hull: R.sapphire, hullStep: 3, accent: R.bone, accentStep: 5, glow: R.sapphire },
  pose: { act: 0.8, t: 0.9 },
  icon: { yaw: 0.3, pitch: 0.5 },
  build(k: Kit, root: THREE.Group) {
    const det = k.det, seg = det >= 2 ? 24 : det ? 18 : 12, G = R.sapphire;
    // ---------------------------------------------------------------- the base
    const base = k.group(root, [0, -0.4, 0]);
    k.mesh(lathe([[0, 0], [0.5, 0], [0.52, 0.02], [0.52, 0.08], [0.48, 0.11], [0, 0.11]], 6, { flat: true }), 'hull', base, [0, 0, 0], [0, PI / 6, 0]);
    k.mesh(lathe([[0, 0.11], [0.4, 0.11], [0.4, 0.14], [0.36, 0.16], [0, 0.16]], 6, { flat: true }), 'frame', base, [0, 0, 0], [0, PI / 6, 0]);
    k.mesh(lathe([[0, 0.0], [0.53, 0.0], [0.53, 0.025], [0, 0.025]], 6, { flat: true }), 'accent', base, [0, 0.04, 0], [0, PI / 6, 0]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.decal(base, { kind: i % 2 ? 'chev' : 'dots', ramp: R.ochre }, 0.22, 0.04, [Math.cos(a) * 0.455, 0.09, Math.sin(a) * 0.455], [0, -a + PI / 2, 0]); }
    k.boltRing(base, 0.44, 12, 'y', 0.11, 0.012);
    // the flywheel seen through six slots in the deck
    const fly = k.group(base, [0, 0.13, 0], [0, 0, 0], { name: 'flywheel' });
    k.mesh(cyl(0.16, 0.03, seg, 0.006), 'brass', fly);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.mesh(box(0.1, 0.034, 0.03), 'dark', fly, [Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], [0, -a, 0]); }
    k.mesh(cyl(0.12, 0.012, seg), 'ink', base, [0, 0.161, 0]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + PI / 6; k.mesh(box(0.18, 0.016, 0.03), 'frame', base, [Math.cos(a) * 0.09, 0.165, Math.sin(a) * 0.09], [0, -a, 0]); }
    k.callout('flywheel', 'FLYWHEEL', fly);
    const dio = [0, 1, 2].map((i) => k.diode(base, [Math.cos(PI / 2 + i * 0.12 - 0.12) * 0.5, 0.065, Math.sin(PI / 2 + i * 0.12 - 0.12) * 0.5], 'z', i ? G[5] : R.malachite[5], 0.011));
    // ---------------------------------------------------------------- the pylons
    const caps: THREE.Mesh[] = [];
    const pylon = (a: number, h: number, lvl: number) => {
      const p = k.group(base, [Math.cos(a) * 0.36, 0.16, Math.sin(a) * 0.36], [0, -a, 0], lvl > 1 ? { lvl } : {});
      k.mesh(lathe([[0, 0], [0.08, 0], [0.08, 0.04], [0.055, 0.07], [0, 0.07]], 12), 'frame', p);
      k.mesh(cyl(0.032, h, 12), 'dark', p, [0, 0.07 + h / 2, 0]);
      k.mesh(helix(0.045, h * 0.8, Math.round(h * 40), 0.008, det), 'coil', p, [0, 0.07 + h / 2, 0]);
      for (const y of [0.07 + h * 0.08, 0.07 + h * 0.92]) k.mesh(ring(0.058, 0.03, 0.02, 12, 0.004), 'hull2', p, [0, y, 0]);
      k.mesh(cone(0.06, 0.03, 0.04, 12), 'steel', p, [0, 0.09 + h, 0]);
      caps.push(k.mesh(sphere(0.035, 10, 8), k.glow(4, 1, { body: G[5] }), p, [0, 0.13 + h, 0]));
      return p;
    };
    for (let i = 0; i < 3; i++) pylon((i / 3) * TAU + PI / 2, 0.42, 1);
    for (let i = 0; i < 3; i++) pylon((i / 3) * TAU + PI / 2 + PI / 3, 0.22, 2);
    k.callout('pylons', 'EMITTER PYLONS', caps[0]);
    k.cable(base, [[0.36 * Math.cos(PI / 2), 0.2, 0.36 * Math.sin(PI / 2) + 0.06], [0.2, 0.2, 0.42], [-0.2, 0.2, 0.42], [0.36 * Math.cos(PI / 2 + TAU / 3) + 0.05, 0.2, 0.36 * Math.sin(PI / 2 + TAU / 3) + 0.05]], 0.012, 'cable');
    // ---------------------------------------------------------------- the floating rings and the load
    const rings: THREE.Group[] = [];
    for (const [r, t, y, lvl] of [[0.4, 0.024, 0.32, 1], [0.32, 0.018, 0.46, 1], [0.22, 0.014, 0.62, 3]] as [number, number, number, number][]) {
      const g = k.group(root, [0, y - 0.4, 0], [0, 0, 0], lvl > 1 ? { lvl } : {});
      k.mesh(torus(r, t, 8, det >= 2 ? 48 : 32), 'chrome', g, [0, 0, 0], [PI / 2, 0, 0]);
      k.mesh(torus(r, t * 0.5, 6, det >= 2 ? 48 : 32), k.glow(4, 0.8, { body: G[4] }), g, [0, -t * 0.9, 0], [PI / 2, 0, 0]);
      for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU; k.mesh(cbox(0.05, 0.03, 0.04, 0.006), j % 2 ? 'hull' : 'frame', g, [Math.cos(a) * r, 0, Math.sin(a) * r], [0, -a, 0]); }
      g.userData.y0 = y - 0.4; rings.push(g);
    }
    k.callout('rings', 'FIELD RINGS', rings[0]);
    const rock = k.group(root, [0, 0.05, 0], [0, 0, 0], { name: 'load' });
    k.mesh(new THREE.DodecahedronGeometry(0.11, 0), 'paint:stone:4' as never, rock, [0, 0, 0], [0.3, 0.2, 0]);
    k.mesh(new THREE.OctahedronGeometry(0.05), k.glow(3, 0.6, { color: R.glowTeal[3] }), rock, [0.06, 0.06, 0.05], [0.4, 0.3, 0.5]);
    k.mesh(new THREE.DodecahedronGeometry(0.06, 0), 'paint:stone:3' as never, rock, [-0.07, -0.05, -0.03], [0.6, 0.1, 0.4]);
    const dust: THREE.Mesh[] = [];
    for (let i = 0; i < (det ? 8 : 4); i++) dust.push(k.mesh(box(0.016, 0.016, 0.016), k.glow(4, 0.7, { body: G[5] }), root));
    k.callout('load', 'LEVITATED LOAD', rock);
    // ---------------------------------------------------------------- level 3: the capacitor bank on the deck
    const bank = k.group(base, [0, 0.11, -0.42], [0, 0, 0], { lvl: 3 });
    k.mesh(cbox(0.3, 0.08, 0.1, 0.01), 'frame', bank, [0, 0.04, 0]);
    const cells: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) { k.mesh(cyl(0.028, 0.12, 10, 0.004), 'glass', bank, [-0.105 + i * 0.07, 0.14, 0]); cells.push(k.mesh(cyl(0.02, 0.1, 10), k.glow(4, 0.6, { body: G[4] }), bank, [-0.105 + i * 0.07, 0.14, 0])); }

    // ---------------------------------------------------------------- the working parts
    let spin = 0, flyA = 0;
    const seeds = dust.map((_, i) => ({ a: i * 2.1, r: 0.12 + (i % 3) * 0.08, s: 0.4 + (i % 4) * 0.2 }));
    return (a) => {
      const sp = 0.4 + a.act * 1.6 + a.chg * 3.4;
      spin += a.dt * sp; flyA += a.dt * (1 + a.act * 14 + a.chg * 20); fly.rotation.y = flyA;
      const lift = a.act * 0.08 - a.chg * 0.05 * (1 - a.act);
      rings.forEach((g, i) => { g.rotation.y = spin * (i % 2 ? -1.3 : 1); g.position.y = g.userData.y0 + lift * (1 + i * 0.5) + Math.sin(a.t * 1.8 + i * 1.7) * 0.012; g.rotation.x = Math.sin(a.t * 0.9 + i) * 0.04; });
      rock.position.y = 0.0 + a.act * 0.16 + Math.sin(a.t * 1.4) * 0.025; rock.rotation.set(a.t * 0.23, a.t * 0.37, Math.sin(a.t * 0.5) * 0.3);
      caps.forEach((c, i) => setGlow(c, 0.4 + (a.act + a.chg) * 0.4 + 0.5 * Math.max(0, Math.sin(a.t * 5 - (i % 3) * 2.09)) * (0.4 + a.act)));
      rings.forEach((g) => setGlow(g.children[1] as THREE.Mesh, 0.5 + a.act * 0.6 + a.chg * 0.6));
      dust.forEach((m, i) => { const s = seeds[i], t2 = (a.t * s.s + i * 0.37) % 1; m.visible = a.act > 0.2 || a.chg > 0.2; m.position.set(Math.cos(s.a + a.t * 0.6) * s.r, -0.2 + t2 * 0.6, Math.sin(s.a + a.t * 0.6) * s.r); m.rotation.set(a.t * 2 + i, a.t * 3, 0); setGlow(m, (1 - t2) * 1.1); });
      cells.forEach((c, i) => { c.scale.y = 0.3 + 0.7 * Math.max(a.chg, 0.4 + 0.3 * Math.sin(a.t + i)); setGlow(c, 0.4 + a.chg); });
      setGlow(dio[0], 0.9); setGlow(dio[1], a.chg > 0.2 ? (Math.sin(a.t * 7) > 0 ? 1 : 0.2) : 0.15); setGlow(dio[2], a.act > 0.2 ? 1 : 0.1);
    };
  },
};
