// WELDER (tool 'weld', the repair torch), 1.4 m: a red FUEL CELL slung on clamps over a yellow torch body, its sight
// glass showing the fuel, a pressure gauge on its end cap, red and blue hoses to the regulator's two handwheels; a
// fan behind the rear grille and a stack of COOLING FINS round the neck; the gooseneck down to a copper NOZZLE whose
// tungsten electrode throws a crackling ARC (a jagged bolt regrown every frame, a flash) and a spray of SPARKS that
// arc down under gravity and fade; idle, a small blue pilot flame. Level 2: a second fuel cell and another fin stack.
// Level 3: a ceramic plasma shroud, a second electrode and a coolant line.
import * as THREE from 'three';
import { type Kit, R, PI, TAU, AX, cbox, box, lathe, cyl, ring, sphere, cone, prism, torus, setGlow, liveTex, glowTexMat } from './kit';
import type { ToolSpec } from './model';

export const WELD: ToolSpec = {
  id: 'weld', name: 'Welder',
  livery: { name: 'ochre', hull: R.ochre, hullStep: 5, accent: R.ruby, accentStep: 4, glow: R.sapphire },
  pose: { act: 1, heat: 0.7, t: 0.83 },
  icon: { yaw: 0.45, roll: 0.12 },
  build(k: Kit, root: THREE.Group) {
    const det = k.det, seg = det >= 2 ? 20 : det ? 16 : 12;
    // ---------------------------------------------------------------- the torch body, grip, rear fan
    const body = k.group(root, [-0.18, -0.04, 0]);
    k.mesh(cbox(0.46, 0.2, 0.2, 0.03), 'hull', body);
    k.mesh(cbox(0.47, 0.04, 0.21, 0.01), 'dark', body, [0, -0.08, 0]);
    k.mesh(box(0.006, 0.16, 0.004), 'ink', body, [0.06, 0.01, 0.101]);
    k.vent(body, 0.1, 0.07, [-0.12, 0.02, 0.102]);
    k.decal(body, { kind: 'stencil', text: 'WLD-4', ink: R.ochre[1] }, 0.17, 0.06, [0.14, 0.03, 0.102]);
    k.decal(body, { kind: 'flame' }, 0.05, 0.06, [0.0, 0.02, 0.102]);
    k.bolts(body, [[-0.2, 0.075, 0.102], [0.2, 0.075, 0.102], [-0.2, -0.05, 0.102], [0.2, -0.05, 0.102]], 0.008);
    const dio = [0, 1].map((i) => k.diode(body, [0.12 + i * 0.04, -0.035, 0.102], 'z', i ? R.sapphire[5] : R.malachite[5], 0.01));
    k.mesh(prism([[-0.05, 0], [0.06, 0], [0.04, -0.24], [-0.08, -0.24]], 0.08, 0.008), 'rubber', body, [-0.05, -0.1, 0]);
    for (let i = 0; i < 5; i++) k.mesh(box(0.11, 0.008, 0.084), 'ink', body, [-0.07, -0.14 - i * 0.035, 0], [0, 0, 0.1], { det: 1 });
    k.mesh(torus(0.06, 0.009, 6, 16, PI), 'frame', body, [0.03, -0.11, 0], [0, 0, PI]);
    const trig = k.mesh(cbox(0.02, 0.06, 0.03, 0.005), 'red', body, [0.04, -0.13, 0]);
    // the rear grille and its fan
    const rear = k.group(body, [-0.23, 0.0, 0], AX.nx);
    k.mesh(ring(0.08, 0.06, 0.02, seg, 0.004), 'frame', rear);
    k.mesh(cyl(0.061, 0.004, seg), 'ink', rear, [0, -0.004, 0]);
    const fan = k.group(rear, [0, 0.004, 0]);
    for (let i = 0; i < 6; i++) { const b = k.group(fan, [0, 0, 0], [0, (i / 6) * TAU, 0]); k.mesh(box(0.05, 0.004, 0.02), 'steel', b, [0.03, 0, 0], [0.5, 0, 0]); }
    for (let i = 0; i < 4; i++) k.mesh(box(0.13, 0.006, 0.006), 'frame', rear, [0, 0.012, 0], [0, (i / 4) * PI, 0], { det: 1 });
    k.callout('fan', 'FAN', rear);
    // ---------------------------------------------------------------- the fuel cell on its clamps, the sight glass, the gauge
    const cell = k.group(root, [-0.22, 0.2, 0], AX.x);
    k.mesh(lathe([[0, -0.27], [0.06, -0.27], [0.09, -0.25], [0.1, -0.22], [0.1, 0.22], [0.09, 0.25], [0.06, 0.27], [0, 0.27]], seg), 'accent', cell);
    for (const y of [-0.235, 0.235]) k.mesh(ring(0.102, 0.08, 0.022, seg, 0.004), 'frame', cell, [y < 0 ? 0 : 0, y, 0]);
    for (const y of [-0.13, 0.13]) { k.mesh(ring(0.106, 0.098, 0.03, seg), 'steel', cell, [0, y, 0]); }
    for (const x of [-0.35, -0.09]) k.mesh(prism([[-0.03, 0], [0.03, 0], [0.02, 0.07], [-0.02, 0.07]], 0.05), 'frame', root, [x, 0.06, 0]);
    // the sight glass: a slot down the side with the glowing fuel behind it
    const sight = k.group(root, [-0.22, 0.2, 0.09]);
    k.mesh(cbox(0.24, 0.05, 0.03, 0.008), 'frame', sight);
    k.mesh(box(0.22, 0.034, 0.02), 'ink', sight, [0, 0, 0.006]);
    const fuel = k.mesh(box(0.2, 0.026, 0.02), k.glow(3, 0.9, { color: R.glowTeal[3] }), sight, [-0.1, 0, 0.008]);
    fuel.geometry = box(0.2, 0.026, 0.02).clone().translate(0.1, 0, 0);
    k.mesh(box(0.22, 0.01, 0.022), k.paint('glass'), sight, [0, 0.008, 0.012]);
    for (let i = 0; i < 5; i++) k.mesh(box(0.003, 0.018, 0.024), 'ink', sight, [-0.08 + i * 0.04, -0.008, 0.012], [0, 0, 0], { det: 1 });
    k.callout('fuel', 'FUEL CELL', cell);
    // the pressure gauge on the end cap (a live dial)
    const gauge = k.group(root, [0.07, 0.2, 0], AX.x);
    k.mesh(cyl(0.055, 0.03, 18, 0.008), 'brass', gauge, [0, 0.015, 0]);
    const dial = liveTex(12, 12);
    k.mesh(cyl(0.046, 0.004, 18), k.ui ? k.paint('ceramic') : k.paint('ceramic'), gauge, [0, 0.031, 0]);
    const needle = k.group(gauge, [0, 0.036, 0]);
    k.mesh(box(0.006, 0.003, 0.04), 'red', needle, [0, 0, 0.016]);
    k.mesh(cyl(0.008, 0.006, 8), 'ink', needle);
    for (let i = 0; i < 7; i++) { const a = -2.2 + (i / 6) * 4.4; k.mesh(box(0.004, 0.003, 0.01), i > 4 ? 'red' : 'ink', gauge, [Math.sin(a) * 0.036, 0.034, Math.cos(a) * 0.036], [0, a, 0], { det: 1 }); }
    void dial;
    // the regulator block and its two handwheels, the hoses
    const reg = k.group(root, [0.1, 0.08, 0]);
    k.mesh(cbox(0.1, 0.08, 0.12, 0.012), 'brass', reg);
    const wheels: THREE.Group[] = [];
    for (const [s, col] of [[-1, 'red'], [1, 'accent2']] as [number, string][]) {
      const w = k.group(reg, [0, 0.0, s * 0.09], s < 0 ? AX.nz : AX.z);
      k.mesh(cyl(0.012, 0.04, 8), 'steel', w, [0, 0.0, 0]);
      const hw = k.group(w, [0, 0.025, 0]);
      k.mesh(torus(0.035, 0.008, 6, 16), col === 'red' ? 'red' : k.paint('paint:sapphire:4'), hw, [0, 0, 0], [PI / 2, 0, 0]);
      for (let i = 0; i < 3; i++) k.mesh(box(0.07, 0.006, 0.008), 'steel', hw, [0, 0, 0], [0, (i / 3) * PI, 0]);
      wheels.push(hw);
    }
    k.cable(root, [[0.1, 0.06, -0.14], [0.0, 0.0, -0.2], [-0.3, 0.02, -0.18], [-0.42, 0.14, -0.08]], 0.014, 'red');
    k.cable(root, [[0.1, 0.06, 0.14], [0.03, -0.02, 0.2], [-0.25, -0.06, 0.18], [-0.4, 0.06, 0.1]], 0.014, k.paint('paint:sapphire:3') as never);
    k.callout('valves', 'REGULATOR', reg);
    // ---------------------------------------------------------------- the neck: cooling fins, the gooseneck, the nozzle
    const neck = k.group(root, [0.05, -0.04, 0], AX.x);
    k.mesh(cyl(0.05, 0.28, seg, 0.006), 'frame', neck, [0, 0.14, 0]);
    k.fins(neck, 0.1, 0.05, 9, 0.18, [0, 0.17, 0]);
    k.callout('fins', 'COOLING FINS', neck);
    const goose = k.group(root, [0.34, -0.04, 0], [0, 0, -0.42]);
    k.mesh(torus(0.16, 0.035, 8, 12, 0.7), 'brass', goose, [0, -0.16, 0], [0, 0, PI / 2 - 0.7 + 0.42 * 0]);
    const nz = k.group(goose, [0.105, -0.04, 0], [0, 0, -0.62]);
    const nozzle = k.group(nz, [0, 0, 0], AX.x);
    const noz = k.mesh(lathe([[0, 0], [0.04, 0], [0.042, 0.04], [0.032, 0.12], [0.022, 0.15], [0.012, 0.15], [0.0, 0.14]], seg), glowTexMat('copper', R.rust[6], k.ui, { metal: 0.9 }), nozzle);
    k.mesh(ring(0.048, 0.035, 0.02, seg, 0.004), 'frame', nozzle, [0, 0.01, 0]);
    k.mesh(cyl(0.006, 0.05, 6), 'chrome', nozzle, [0, 0.16, 0]);
    const tip = new THREE.Vector3(0, 0.19, 0);
    k.callout('nozzle', 'NOZZLE + ARC', nozzle);
    // the arc: jagged segments regrown each frame, the flash, the pilot flame
    const arcG = k.group(nozzle, [0, 0, 0], [0, 0, 0], { name: 'arc' });
    const arcSeg: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) arcSeg.push(k.mesh(box(0.008, 1, 0.008), k.glow(5, 1.6, { color: 0xdff0ff }), arcG));
    const flash = k.mesh(sphere(0.016, 10, 8), k.glow(4, 1.5, { color: R.sapphire[6], body: R.sapphire[6] }), arcG, [0, 0.21, 0]);
    const pilot = k.group(nozzle, [0, 0.165, 0]);
    k.mesh(cone(0.012, 0.0, 0.06, 8), k.glow(5, 1.2, { color: R.sapphire[5] }), pilot, [0, 0.03, 0]);
    // the sparks (a pool)
    const sparks: { m: THREE.Mesh; v: THREE.Vector3; life: number; max: number }[] = [];
    const nS = det >= 1 ? 22 : 10;
    for (let i = 0; i < nS; i++) { const m = k.mesh(box(0.012, 0.012, 0.012), k.glow(4, 1.4, { color: i % 3 ? R.glowAmber[4] : 0xfff4dc }), root); m.visible = false; sparks.push({ m, v: new THREE.Vector3(), life: 0, max: 1 }); }
    // ---------------------------------------------------------------- level 2: the twin cell and another fin stack
    const cell2 = k.group(root, [-0.22, 0.17, -0.16], AX.x, { lvl: 2 });
    k.mesh(lathe([[0, -0.2], [0.045, -0.2], [0.065, -0.18], [0.065, 0.18], [0.045, 0.2], [0, 0.2]], seg), 'accent', cell2);
    for (const y of [-0.12, 0.12]) k.mesh(ring(0.07, 0.06, 0.024, seg), 'steel', cell2, [0, y, 0]);
    k.fins(neck, 0.085, 0.05, 5, 0.08, [0, 0.04, 0], [0, 0, 0], { lvl: 2 });
    // ---------------------------------------------------------------- level 3: the plasma shroud, the second electrode, a coolant line
    k.mesh(lathe([[0.046, 0.06], [0.06, 0.06], [0.06, 0.13], [0.05, 0.17], [0.036, 0.17], [0.046, 0.13]], seg), 'ceramic', nozzle, [0, 0, 0], [0, 0, 0], { lvl: 3 });
    k.mesh(cyl(0.004, 0.05, 6), 'chrome', nozzle, [0.02, 0.15, 0], [0, 0, 0.3], { lvl: 3 });
    k.cable(root, [[-0.05, -0.12, 0.08], [0.15, -0.14, 0.08], [0.34, -0.1, 0.06], [0.42, -0.16, 0.05]], 0.009, 'brass', { lvl: 3 });

    // ---------------------------------------------------------------- the working parts
    let fanA = 0, sAcc = 0, arcT = 0;
    const wp = new THREE.Vector3(), dir = new THREE.Vector3();
    const tmp = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    return (a) => {
      fanA += a.dt * (2 + a.act * 30 + a.heat * 6); fan.rotation.y = fanA;
      const on = a.act > 0.25;
      arcG.visible = on; pilot.visible = !on;
      pilot.scale.set(1, 0.8 + Math.abs(Math.sin(a.t * 27)) * 0.4, 1);
      // regrow the arc: a jagged line from the electrode tip out to the work point
      arcT -= a.dt;
      if (on && arcT <= 0) {
        arcT = 1 / 24;
        const n = arcSeg.length, len = 0.08 + Math.random() * 0.03;
        let px = 0, py = 0.185, pz = 0;
        for (let i = 0; i < n; i++) {
          const t1 = (i + 1) / n, nx = i === n - 1 ? 0 : (Math.random() - 0.5) * 0.035, nz2 = i === n - 1 ? 0 : (Math.random() - 0.5) * 0.035, ny = 0.185 + len * t1;
          const s = arcSeg[i]; tmp.set(nx - px, ny - py, nz2 - pz); const L = tmp.length();
          s.position.set((px + nx) / 2, (py + ny) / 2, (pz + nz2) / 2); s.scale.set(1, L, 1); s.quaternion.setFromUnitVectors(up, tmp.normalize());
          px = nx; py = ny; pz = nz2;
        }
        flash.position.set(0, 0.185 + len, 0);
        flash.scale.setScalar(0.7 + Math.random() * 0.5);
      }
      for (const s of arcSeg) setGlow(s, 1.2 + Math.random() * 0.8);
      setGlow(flash, 1 + Math.random());
      setGlow(noz, a.heat * 0.9);
      // spawn sparks at the work point, fly, fall, fade
      nozzle.updateWorldMatrix(true, false); root.updateWorldMatrix(true, false);
      wp.copy(tip).setY(0.185 + 0.09).applyMatrix4(nozzle.matrixWorld); root.worldToLocal(wp);
      dir.set(0, 1, 0).transformDirection(nozzle.matrixWorld);
      sAcc += a.dt * (on ? 60 * a.act : 0);
      for (const s of sparks) {
        if (s.life <= 0 && sAcc >= 1) {
          sAcc -= 1; s.life = s.max = 0.25 + Math.random() * 0.45; s.m.position.copy(wp); s.m.visible = true;
          s.v.set((Math.random() - 0.5) * 1.6, Math.random() * 1.4 + 0.2, (Math.random() - 0.5) * 1.6).addScaledVector(dir, -0.6);
        }
        if (s.life > 0) {
          s.life -= a.dt; s.v.y -= 4.5 * a.dt; s.m.position.addScaledVector(s.v, a.dt);
          const f = Math.max(0, s.life / s.max); s.m.scale.setScalar(0.5 + f * 0.8); setGlow(s.m, 0.4 + f * 1.4);
          if (s.life <= 0) s.m.visible = false;
        }
      }
      sAcc = Math.min(sAcc, 3);
      // fuel level, gauge, valves, trigger, lamps
      fuel.scale.x = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(a.t * 0.3)) - a.act * 0.04 * Math.abs(Math.sin(a.t * 12));
      setGlow(fuel, 0.6 + a.act * 0.5);
      needle.rotation.y = -1.6 + 0.8 + a.act * 1.6 + Math.sin(a.t * 17) * 0.05 * a.act + a.chg * 0.4;
      wheels[0].rotation.y = a.act * 0.8; wheels[1].rotation.y = -a.act * 0.6;
      trig.position.x = 0.04 - a.act * 0.012;
      setGlow(dio[0], 0.9); setGlow(dio[1], on ? 0.5 + Math.random() * 0.6 : 0.12);
    };
  },
};
