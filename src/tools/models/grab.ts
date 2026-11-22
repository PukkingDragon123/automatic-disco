// GRAVITY GRAB (tool 'grab', the grab-and-throw field projector), 1.4 m: a white enamel projector body with an
// amethyst band, vents and a CAPACITOR BANK of three glass cells whose violet charge rises and falls; an emitter neck
// round which three FLOATING COILS orbit and bob, held off it by the field; at the front three articulated claw
// fingers round the PULSING CORE, caged by three gyroscopic FIELD RINGS turning on their own axes (counter-rotating,
// faster as it charges). The fingers spread idle, close on a load, flex while charging.
// Level 2: an outer field ring and stabiliser fins. Level 3: three more floating coils and twin accelerator rails.
import * as THREE from 'three';
import { type Kit, R, PI, TAU, AX, cbox, box, lathe, cyl, ring, sphere, helix, prism, torus, setGlow } from './kit';
import type { ToolSpec } from './model';

export const GRAB: ToolSpec = {
  id: 'grab', name: 'Gravity Grab',
  livery: { name: 'white', hull: R.snow, hullStep: 4, accent: R.amethyst, accentStep: 3, glow: R.amethyst },
  pose: { act: 0.4, chg: 0.8, t: 0.7 },
  icon: { yaw: 0.5, roll: 0.32 },
  build(k: Kit, root: THREE.Group) {
    const det = k.det, seg = det >= 2 ? 22 : det ? 16 : 12, G = R.amethyst;
    // ---------------------------------------------------------------- the projector body
    const body = k.group(root, [-0.36, 0, 0]);
    k.mesh(cbox(0.46, 0.28, 0.28, 0.04), 'hull', body);
    k.mesh(cbox(0.08, 0.29, 0.29, 0.02), 'accent', body, [0.1, 0, 0]);
    k.mesh(box(0.006, 0.24, 0.004), 'ink', body, [-0.08, 0, 0.141]);
    k.vent(body, 0.12, 0.09, [-0.15, 0.02, 0.142]);
    k.decal(body, { kind: 'stencil', text: 'GRV-2', ink: R.amethyst[2] }, 0.17, 0.06, [-0.13, -0.075, 0.142]);
    k.decal(body, { kind: 'rad' }, 0.06, 0.06, [0.0, 0.04, 0.142]);
    k.bolts(body, [[-0.2, 0.12, 0.142], [0.2, 0.12, 0.142], [-0.2, -0.12, 0.142], [0.2, -0.12, 0.142]], 0.009);
    const dio = [0, 1, 2].map((i) => k.diode(body, [-0.19 + i * 0.035, -0.045, 0.142], 'z', i ? G[5] : R.malachite[5], 0.01));
    // the grip / mount under it
    k.mesh(prism([[-0.06, 0], [0.06, 0], [0.03, -0.22], [-0.07, -0.22]], 0.09, 0.008), 'rubber', body, [-0.02, -0.14, 0]);
    for (let i = 0; i < 4; i++) k.mesh(box(0.11, 0.01, 0.094), 'ink', body, [-0.025, -0.18 - i * 0.04, 0], [0, 0, 0.12], { det: 1 });
    k.mesh(prism([[0.06, 0], [0.12, -0.02], [0.1, -0.12], [0.04, -0.12], [0.07, -0.04]], 0.03), 'frame', body, [0, -0.14, 0]);
    // the capacitor bank on top: three glass cells in a frame, their charge rising
    const bank = k.group(body, [-0.05, 0.14, 0]);
    k.mesh(cbox(0.3, 0.03, 0.2, 0.008), 'frame', bank, [0, 0.015, 0]);
    const fills: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const x = -0.09 + i * 0.09, cg = k.group(bank, [x, 0.1, 0]);
      k.mesh(lathe([[0, -0.07], [0.034, -0.07], [0.034, 0.07], [0, 0.07]], 12), 'glass', cg);
      const f = k.mesh(cyl(0.026, 0.12, 12), k.glow(4, 1, { body: G[4] }), cg, [0, -0.06, 0]);
      f.geometry = cyl(0.026, 0.12, 12).clone().translate(0, 0.06, 0); fills.push(f);
      for (const y of [-0.075, 0.075]) k.mesh(cyl(0.04, 0.016, 12, 0.004), 'copper', cg, [0, y, 0]);
    }
    k.mesh(cbox(0.3, 0.02, 0.05, 0.005), 'frame', bank, [0, 0.19, 0]);
    k.callout('bank', 'CAPACITORS', bank);
    k.cable(root, [[-0.32, 0.36, 0.06], [-0.2, 0.38, 0.12], [-0.08, 0.2, 0.1], [-0.12, 0.1, 0.08]], 0.011, 'copper');
    // ---------------------------------------------------------------- the emitter neck and its floating coils
    const neck = k.group(root, [-0.12, 0, 0], AX.x);
    k.mesh(lathe([[0, 0], [0.11, 0], [0.11, 0.04], [0.075, 0.08], [0.06, 0.3], [0.09, 0.34], [0.09, 0.37], [0, 0.37]], seg), 'frame', neck);
    for (const y of [0.12, 0.2, 0.28]) k.mesh(ring(0.072, 0.06, 0.014, seg), 'steel', neck, [0, y, 0]);
    const orbit = k.group(root, [0.06, 0, 0], [0, 0, 0], { name: 'coils' });
    const coils: THREE.Group[] = [];
    const nCoil = 6;
    for (let i = 0; i < nCoil; i++) {
      const lvl = i < 3 ? 1 : 3, c = k.group(orbit, [0, 0, 0], [(i / 3) * TAU + (i >= 3 ? PI / 3 : 0), 0, 0], lvl > 1 ? { lvl } : {});
      const cc = k.group(c, [i >= 3 ? 0.09 : 0, 0.14, 0], AX.x);
      k.mesh(cyl(0.016, 0.12, 8), 'dark', cc);
      k.mesh(helix(0.026, 0.1, 7, 0.0075, det), 'coil', cc);
      for (const y of [-0.058, 0.058]) k.mesh(cyl(0.032, 0.012, 10, 0.003), 'hull', cc, [0, y, 0]);
      const nub = k.mesh(sphere(0.01, 6, 5), k.glow(4, 1), cc, [0, 0.07, 0]);
      cc.userData.nub = nub;
      coils.push(cc);
    }
    k.callout('coils', 'FLOATING COILS', coils[0]);
    // ---------------------------------------------------------------- the emitter head: collar, claw fingers, core, rings
    const head = k.group(root, [0.28, 0, 0]);
    k.mesh(ring(0.13, 0.07, 0.05, seg, 0.01), 'hull', head, [0, 0, 0], AX.x);
    k.mesh(ring(0.135, 0.12, 0.016, seg), 'accent', head, [0.02, 0, 0], AX.x);
    k.boltRing(head, 0.105, 8, 'x', 0.027, 0.008);
    const fingers: { k1: THREE.Group; k2: THREE.Group }[] = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + PI / 2, f = k.group(head, [0.02, 0, 0], [a, 0, 0]);
      const k1 = k.group(f, [0.0, 0.115, 0]);
      k.mesh(cyl(0.022, 0.05, 10), 'steel', k1, [0, 0, 0], AX.z);
      k.mesh(cbox(0.16, 0.04, 0.04, 0.01), 'hull', k1, [0.08, 0, 0]);
      k.mesh(box(0.1, 0.012, 0.042), 'accent', k1, [0.08, 0.02, 0]);
      const k2 = k.group(k1, [0.16, 0, 0]);
      k.mesh(cyl(0.018, 0.045, 10), 'steel', k2, [0, 0, 0], AX.z);
      k.mesh(prism([[0, -0.018], [0.11, -0.01], [0.13, -0.035], [0.1, 0.012], [0, 0.018]], 0.034, 0.005), 'frame', k2);
      k.mesh(sphere(0.008, 6, 5), k.glow(4, 0.8), k2, [0.11, -0.006, 0.018]);
      fingers.push({ k1, k2 });
    }
    k.callout('claws', 'CLAW FINGERS', fingers[0].k2);
    const core = k.group(head, [0.2, 0, 0], [0, 0, 0], { name: 'core' });
    const coreMesh = k.mesh(sphere(0.048, 14, 10), k.glow(4, 1.2, { color: G[5], body: G[4] }), core);
    k.mesh(new THREE.IcosahedronGeometry(0.06, 0), k.glow(3, 0.5, { color: G[3], body: G[2], opacity: 0.5 }), core, [0, 0, 0], [0, 0, 0], { det: 1 });
    k.callout('core', 'PULSING CORE', core);
    const rings: THREE.Group[] = [];
    const ringDef: [number, number, number][] = [[0.085, 0.008, 1], [0.11, 0.007, 1], [0.135, 0.007, 2]];
    ringDef.forEach(([r, t, lvl], i) => {
      const g0 = k.group(core, [0, 0, 0], [i * 0.9, i * 0.6, 0], lvl > 1 ? { lvl } : {});
      const g = k.group(g0, [0, 0, 0]);
      k.mesh(torus(r, t, 6, det >= 2 ? 40 : 28), 'chrome', g, [0, 0, 0], [PI / 2, 0, 0]);
      for (let j = 0; j < 4; j++) { const a = (j / 4) * TAU; k.mesh(cbox(0.022, 0.016, 0.022, 0.004), 'frame', g, [Math.cos(a) * r, 0, Math.sin(a) * r], [0, -a, 0]); k.mesh(sphere(0.008, 6, 5), k.glow(4, 1), g, [Math.cos(a) * r, 0.011, Math.sin(a) * r]); }
      rings.push(g);
    });
    k.callout('rings', 'FIELD RINGS', rings[1]);
    // ---------------------------------------------------------------- level 2: stabiliser fins
    for (const s of [-1, 1]) k.mesh(prism([[0, 0], [0.18, 0], [0.12, 0.09], [0.02, 0.09]], 0.018, 0.004), 'accent', body, [-0.1, 0.0, s * 0.14], [s * PI / 2, 0, 0], { lvl: 2 });
    // ---------------------------------------------------------------- level 3: the accelerator rails
    const rails: THREE.Mesh[] = [];
    for (const s of [-1, 1]) { const rg = k.group(root, [0.06, s * 0.105, 0], [0, 0, 0], { lvl: 3 }); k.mesh(cbox(0.4, 0.024, 0.04, 0.006), 'frame', rg); rails.push(k.mesh(box(0.36, 0.008, 0.042), k.glow(4, 0.6), rg, [0, s * 0.012, 0])); for (const x of [-0.16, 0.16]) k.mesh(box(0.02, 0.05, 0.03), 'dark', rg, [x, -s * 0.03, 0]); }

    // ---------------------------------------------------------------- the working parts
    let orb = 0;
    const rs = [0, 0, 0];
    return (a) => {
      const sp = 0.6 + a.act * 2.2 + a.chg * 4.5;
      orb += a.dt * sp * 0.6; orbit.rotation.x = orb;
      coils.forEach((c, i) => { c.position.y = 0.14 + Math.sin(a.t * 2.4 + i * 1.7) * 0.012 * (1 + a.chg); c.rotation.y = Math.sin(a.t * 1.5 + i) * 0.15; setGlow(c.userData.nub as THREE.Mesh, 0.4 + a.chg * 0.8 + 0.3 * Math.sin(a.t * 5 + i)); });
      rs[0] += a.dt * sp * 1.6; rs[1] -= a.dt * sp * 1.25; rs[2] += a.dt * sp * 0.9;
      rings[0].rotation.y = rs[0]; rings[1].rotation.y = rs[1]; rings[2].rotation.y = rs[2];
      rings[0].parent!.rotation.z = Math.sin(a.t * 0.7) * 0.3; rings[1].parent!.rotation.x = 0.9 + Math.sin(a.t * 0.5) * 0.4;
      const beat = 0.5 + 0.5 * Math.sin(a.t * (3 + a.chg * 7 + a.act * 4));
      core.scale.setScalar(0.88 + beat * 0.16 + a.chg * 0.1);
      setGlow(coreMesh, 0.6 + beat * 0.6 + a.chg * 0.6);
      // fingers: spread idle, close on the load, quiver while charging
      const close = a.act * 0.55 - a.chg * 0.1, q = Math.sin(a.t * 19) * 0.04 * a.chg;
      for (const f of fingers) { f.k1.rotation.z = 0.5 - close + q; f.k2.rotation.z = -0.95 - close * 0.6 - q; }
      fills.forEach((f, i) => { f.scale.y = Math.max(0.06, Math.min(1, 0.25 + a.chg * 0.7 + Math.sin(a.t * 3 + i * 2) * 0.05 - a.act * 0.25 * (0.5 + 0.5 * Math.sin(a.t * 9 + i)))); setGlow(f, 0.5 + a.chg * 0.7); });
      setGlow(dio[0], 0.9); setGlow(dio[1], a.chg > 0.2 ? 0.3 + 0.7 * beat : 0.1); setGlow(dio[2], a.act > 0.2 ? 1 : 0.1);
      rails.forEach((r, i) => setGlow(r, 0.3 + a.act * (0.6 + 0.4 * Math.sin(a.t * 14 + i * PI))));
    };
  },
};
