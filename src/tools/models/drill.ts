// CORE DRILL (tool 'drill'). An arm-mounted boring head, 1.9 m: a finned motor with a fan behind its rear grille,
// an open GEAR TRAIN on the gearbox face (18 : 11 : 7, really meshing) whose big gear's crank pin drives a PUMPING
// PISTON through a conrod and crosshead, a HEAT COIL wound round the drive sleeve between ceramic insulators and
// three tie rods (cold copper idle, glowing amber to orange under load), a knurled three-jaw chuck and a twin-fluted
// SPINNING BIT with carbide teeth. Level 2: side heat sinks, a brass chuck collar, a load gauge. Level 3: a coolant
// tank with its lines, a bit stabiliser ring, diamond tips that glow.
import * as THREE from 'three';
import { type Kit, R, PI, TAU, AX, cbox, box, lathe, cyl, ring, sphere, helix, helixTaper, cone, gearTrain, glowTexMat, setGlow, prism } from './kit';
import type { ToolSpec } from './model';

export const DRILL: ToolSpec = {
  id: 'drill', name: 'Core Drill',
  livery: { name: 'rust', hull: R.rust, hullStep: 4, accent: R.ochre, accentStep: 5, glow: R.glowAmber },
  pose: { act: 0.7, heat: 0.8, t: 0.9 },
  build(k: Kit, root: THREE.Group) {
    const det = k.det, seg = det >= 2 ? 22 : det ? 16 : 12;
    // ---------------------------------------------------------------- the motor (x -0.78 .. -0.22)
    const motor = k.group(root, [-0.5, 0, 0], AX.x);
    k.mesh(lathe([[0, -0.29], [0.1, -0.29], [0.13, -0.275], [0.15, -0.26], [0.155, -0.22], [0.165, -0.21], [0.165, 0.2], [0.15, 0.24], [0.135, 0.27], [0.0, 0.27]], seg), 'hull', motor);
    // the rear grille ring and the fan behind it
    k.mesh(ring(0.13, 0.095, 0.03, seg, 0.006), 'frame', motor, [0, -0.29, 0]);
    k.mesh(cyl(0.096, 0.006, seg), 'ink', motor, [0, -0.287, 0]);
    const fan = k.group(motor, [0, -0.3, 0], [0, 0, 0], { name: 'fan' });
    for (let i = 0; i < 5; i++) { const b = k.group(fan, [0, 0, 0], [0, (i / 5) * TAU, 0]); k.mesh(box(0.085, 0.006, 0.03), 'steel', b, [0.05, 0, 0], [0.5, 0, 0]); }
    k.mesh(cyl(0.025, 0.02, 10), 'dark', fan);
    for (let i = 0; i < 6; i++) k.mesh(box(0.19, 0.008, 0.008), 'frame', motor, [0, -0.31, 0], [0, (i / 6) * PI, 0], { det: 1 });
    // cooling ribs round the rear half
    for (let i = 0; i < 6; i++) k.mesh(ring(0.192, 0.16, 0.014, seg, 0.004), 'fin', motor, [0, -0.19 + i * 0.038, 0]);
    // a seam ring and a stencilled band at the front
    k.mesh(ring(0.168, 0.15, 0.01, seg), 'ink', motor, [0, 0.07, 0]);
    k.mesh(ring(0.17, 0.155, 0.05, seg), 'accent', motor, [0, 0.16, 0]);
    k.callout('fan', 'FAN', fan);
    // the flat side panel with vents and the serial stencil (+Z side)
    const side = k.group(root, [-0.5, 0.0, 0.158]);
    k.mesh(cbox(0.3, 0.17, 0.03, 0.008), 'hull2', side);
    k.vent(side, 0.13, 0.1, [-0.06, 0.0, 0.016]);
    k.decal(side, { kind: 'stencil', text: 'CD-7', ramp: R.bone }, 0.12, 0.08, [0.085, 0.03, 0.016]);
    k.decal(side, { kind: 'bar' }, 0.08, 0.04, [0.085, -0.045, 0.016]);
    k.bolts(side, [[-0.135, 0.07, 0.016], [0.135, 0.07, 0.016], [-0.135, -0.07, 0.016], [0.135, -0.07, 0.016]], 0.009);
    // the carry handle on top, a cable from the motor to the gearbox
    k.mesh(prism([[-0.2, 0], [-0.17, 0.11], [0.12, 0.11], [0.15, 0], [0.11, 0], [0.09, 0.075], [-0.14, 0.075], [-0.16, 0]], 0.04, 0.006), 'frame', root, [-0.52, 0.16, 0]);
    k.mesh(cyl(0.024, 0.2, 10), 'rubber', root, [-0.545, 0.252, 0], AX.x);
    for (let i = 0; i < 5; i++) k.mesh(ring(0.026, 0.02, 0.008, 10), 'ink', root, [-0.62 + i * 0.038, 0.252, 0], AX.x, { det: 1 });
    k.cable(root, [[-0.68, 0.12, -0.1], [-0.6, 0.23, -0.15], [-0.35, 0.24, -0.15], [-0.2, 0.15, -0.11]], 0.016);
    k.cable(root, [[-0.7, -0.08, -0.13], [-0.55, -0.2, -0.16], [-0.3, -0.19, -0.14], [-0.18, -0.12, -0.1]], 0.013, 'red');

    // ---------------------------------------------------------------- the gearbox (x -0.22 .. 0.14)
    const gb = k.group(root, [-0.04, 0.02, 0]);
    k.mesh(cbox(0.36, 0.4, 0.27, 0.025), 'hull', gb);
    k.mesh(cbox(0.3, 0.34, 0.012, 0.004), 'dark', gb, [0, 0, 0.138]);
    k.mesh(cbox(0.38, 0.04, 0.29, 0.01), 'frame', gb, [0, -0.185, 0]);
    k.mesh(cbox(0.38, 0.03, 0.29, 0.01), 'frame', gb, [0, 0.19, 0]);
    k.bolts(gb, [[-0.16, 0.17, 0.145], [0.16, 0.17, 0.145], [-0.16, -0.16, 0.145], [0.16, -0.16, 0.145], [-0.16, 0.005, 0.145], [0.16, 0.005, 0.145]], 0.011);
    k.decal(gb, { kind: 'chev', ramp: R.ochre }, 0.3, 0.05, [0, -0.185, 0.147]);
    k.decal(gb, { kind: 'label', text: 'RPM', ramp: R.bone }, 0.14, 0.07, [0.02, 0.207, 0.06], [-PI / 2, 0, 0]);
    // the gear train on the open face
    const gface = k.group(gb, [0, 0, 0.158]);
    const train = gearTrain(k, gface, [{ n: 18, at: [-0.055, 0.035], paint: 'brass' }, { n: 11, ang: -0.62, paint: 'steel' }, { n: 7, ang: 1.2, paint: 'chrome' }], { arc: 0.036, dep: 0.017, thick: 0.024 });
    for (const [x, y] of train.centres) { k.mesh(cyl(0.016, 0.05, 10, 0.004), 'chrome', gface, [x, y, 0.01], AX.z); k.mesh(cyl(0.008, 0.054, 6), 'ink', gface, [x, y, 0.012], AX.z, { det: 1 }); }
    k.callout('gears', 'GEAR TRAIN', train.gears[1]);
    // the crank pin on the big gear, the conrod, the crosshead, the piston rod and its cylinder
    const [gx, gy] = train.centres[0], rc = 0.052, L = 0.15;
    const crank = k.group(gface, [gx, gy, 0.016]);
    k.mesh(cyl(0.012, 0.04, 10), 'chrome', crank, [rc, 0, 0.008], AX.z);
    const rod = k.group(gface, [0, 0, 0.04]);
    k.mesh(cbox(0.03, L + 0.03, 0.014, 0.005), 'steel', rod, [0, L / 2, 0]);
    k.mesh(cyl(0.02, 0.018, 12), 'frame', rod, [0, 0, 0], AX.z); k.mesh(cyl(0.018, 0.018, 12), 'frame', rod, [0, L, 0], AX.z);
    const head = k.group(gface, [gx, 0, 0.04]);
    k.mesh(cbox(0.05, 0.035, 0.03, 0.006), 'dark', head);
    k.mesh(cyl(0.014, 0.22, 10), 'chrome', head, [0, 0.115, 0]);
    const pist = k.group(gb, [gx, 0.36, 0.198]);
    k.mesh(lathe([[0, -0.11], [0.03, -0.11], [0.04, -0.1], [0.04, 0.1], [0.032, 0.115], [0, 0.115]], 14), 'hullDark', pist);
    for (const y of [-0.085, 0.085]) k.mesh(ring(0.046, 0.038, 0.018, 14, 0.004), 'steel', pist, [0, y, 0]);
    k.mesh(prism([[-0.05, -0.04], [0.05, -0.04], [0.03, 0.02], [-0.03, 0.02]], 0.03), 'frame', gb, [gx, 0.205, 0.175]);
    k.cable(root, [[gx - 0.04, 0.53, 0.198], [gx - 0.1, 0.6, 0.12], [-0.3, 0.48, 0.05], [-0.4, 0.34, 0.03]], 0.012, 'rubber');
    k.callout('piston', 'PISTON', pist);
    // status diodes on the top edge
    const dio = [R.malachite[5], R.glowAmber[3], R.ruby[5]].map((c, i) => k.diode(gb, [-0.13 + i * 0.045, 0.205, 0.12], 'y', c, 0.012));

    // ---------------------------------------------------------------- the heat coil section (x 0.14 .. 0.46)
    const hc = k.group(root, [0.3, 0.02, 0], AX.x);
    k.mesh(cyl(0.062, 0.3, seg), 'dark', hc);
    const sleeve = k.mesh(cyl(0.064, 0.24, seg), k.glow(2, 0, { color: R.coral[4], body: R.basalt[2] }), hc);
    const coilMat = glowTexMat('coil', R.glowAmber[3], k.ui, { metal: 0.85 });
    const coil = k.mesh(helix(0.083, 0.22, 9, 0.0125, det), coilMat, hc, [0, 0, 0], [0, 0, 0], { name: 'coil' });
    for (const y of [-0.135, 0.135]) { k.mesh(ring(0.112, 0.06, 0.035, seg, 0.008), 'ceramic', hc, [y < 0 ? 0 : 0, y, 0]); k.mesh(ring(0.118, 0.105, 0.012, seg), 'frame', hc, [0, y + (y < 0 ? 0.02 : -0.02), 0]); }
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.5; k.mesh(cyl(0.009, 0.3, 8), 'steel', hc, [Math.cos(a) * 0.104, 0, Math.sin(a) * 0.104]); }
    k.decal(root, { kind: 'warn' }, 0.06, 0.055, [0.3, 0.155, 0.04], [-0.9, 0, 0]);
    k.callout('coil', 'HEAT COIL', coil);

    // ---------------------------------------------------------------- the chuck and the bit (x 0.46 .. 1.18)
    const spin = k.group(root, [0.46, 0.02, 0], AX.x, { name: 'spin' });
    k.mesh(ring(0.1, 0.05, 0.03, seg, 0.006), 'hazard', root, [0.47, 0.02, 0], AX.x);
    k.mesh(lathe([[0, 0], [0.09, 0], [0.095, 0.01], [0.095, 0.08], [0.075, 0.12], [0.05, 0.14], [0, 0.14]], seg), 'knurl', spin);
    for (let i = 0; i < 3; i++) { const j = k.group(spin, [0, 0.13, 0], [0, (i / 3) * TAU, 0]); k.mesh(cbox(0.03, 0.07, 0.03, 0.006), 'frame', j, [0.035, 0.02, 0]); }
    const bit = k.group(spin, [0, 0.14, 0]);
    k.mesh(cyl(0.032, 0.08, 12, 0.006), 'chrome', bit, [0, 0.04, 0]);
    k.mesh(cone(0.042, 0.012, 0.5, 12), 'steel', bit, [0, 0.33, 0]);
    k.mesh(helixTaper(0.05, 0.016, 0.48, 4.5, 0.014, det, 0), 'chrome', bit, [0, 0.33, 0]);
    k.mesh(helixTaper(0.05, 0.016, 0.48, 4.5, 0.014, det, PI), 'steel', bit, [0, 0.33, 0]);
    k.mesh(cone(0.02, 0.0, 0.07, 10), 'chrome', bit, [0, 0.615, 0]);
    const tips: THREE.Mesh[] = [], hullTooth = cbox(0.03, 0.022, 0.012, 0.004);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; tips.push(k.mesh(hullTooth, 'dark', bit, [Math.cos(a) * 0.024, 0.585, Math.sin(a) * 0.024], [0, -a, 0])); }
    k.callout('bit', 'SPINNING BIT', bit);

    // ---------------------------------------------------------------- the hardpoint mount under the gearbox
    const mount = k.group(root, [-0.06, -0.24, 0]);
    k.mesh(cbox(0.3, 0.05, 0.22, 0.01), 'frame', mount);
    k.mesh(prism([[-0.07, 0], [0.07, 0], [0.04, -0.09], [-0.04, -0.09]], 0.12), 'dark', mount, [0, -0.02, 0]);
    k.mesh(cyl(0.035, 0.16, 14, 0.006), 'steel', mount, [0, -0.08, 0], AX.z);
    k.bolts(mount, [[-0.12, 0.026, 0.08], [0.12, 0.026, 0.08], [-0.12, 0.026, -0.08], [0.12, 0.026, -0.08]], 0.011, 'y');

    // ---------------------------------------------------------------- level 2: heat sinks, the brass collar, a gauge
    for (const s of [-1, 1]) {
      const hs = k.group(root, [-0.45, -0.135, s * 0.15], [0, 0, 0], { lvl: 2 });
      k.mesh(cbox(0.24, 0.08, 0.03, 0.006), 'frame', hs);
      for (let i = 0; i < 7; i++) k.mesh(box(0.012, 0.1, 0.06), 'fin', hs, [-0.1 + i * 0.033, 0, s * 0.035]);
    }
    k.mesh(ring(0.108, 0.094, 0.03, seg, 0.006), 'brass', root, [0.54, 0.02, 0], AX.x, { lvl: 2 });
    const gauge = k.group(gb, [0.1, 0.1, 0.17], [0, 0, 0], { lvl: 2 });
    k.mesh(cyl(0.04, 0.025, 16, 0.006), 'brass', gauge, [0, 0, 0], AX.z);
    k.mesh(cyl(0.032, 0.004, 16), 'bone', gauge, [0, 0, 0.013], AX.z);
    const needle = k.group(gauge, [0, 0, 0.017]);
    k.mesh(box(0.004, 0.028, 0.003), 'red', needle, [0, 0.012, 0]);
    // ---------------------------------------------------------------- level 3: coolant tank, stabiliser ring, diamond tips
    const tank = k.group(root, [-0.5, 0.38, 0], AX.x, { lvl: 3 });
    k.mesh(lathe([[0, -0.15], [0.05, -0.15], [0.06, -0.13], [0.06, 0.13], [0.05, 0.15], [0, 0.15]], 14), 'glass', tank);
    const fluid = k.mesh(cyl(0.052, 0.22, 14), k.glow(3, 0.4, { color: R.sapphire[5], body: R.sapphire[3] }), tank);
    for (const y of [-0.15, 0.15]) k.mesh(cyl(0.066, 0.025, 14, 0.006), 'frame', tank, [0, y, 0]);
    for (const x of [-0.6, -0.4]) k.mesh(box(0.03, 0.09, 0.06), 'frame', root, [x, 0.31, 0], [0, 0, 0], { lvl: 3 });
    k.cable(root, [[-0.36, 0.39, 0.02], [-0.1, 0.44, 0.1], [0.2, 0.25, 0.12], [0.3, 0.13, 0.1]], 0.011, 'brass', { lvl: 3 });
    const stab = k.group(root, [0.88, 0.02, 0], AX.x, { lvl: 3 });
    k.mesh(ring(0.11, 0.085, 0.03, seg, 0.006), 'hull', stab);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.3; k.mesh(box(0.016, 0.32, 0.016), 'frame', stab, [Math.cos(a) * 0.1, -0.16, Math.sin(a) * 0.1]); }
    const diamonds: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + PI / 3; diamonds.push(k.mesh(new THREE.OctahedronGeometry(0.014), k.glow(3, 0.6, { color: R.sapphire[6], body: R.sapphire[5] }), bit, [Math.cos(a) * 0.022, 0.6, Math.sin(a) * 0.022], [0, 0, 0], { lvl: 3 })); }
    void sphere; void tips;

    // ---------------------------------------------------------------- the working parts
    let ph = 0, base = new THREE.Vector3().copy(root.position);
    return (a) => {
      const w = 0.7 + a.act * 24 + a.chg * 5 + (a.level - 1) * a.act * 4;
      ph += a.dt * w;
      spin.rotation.y = ph;
      fan.rotation.y = -ph * 1.4;
      train.turn(-ph / 3.2);
      // the crank drives the crosshead and the piston rod
      const big = train.gears[0], ca = big.rotation.z, px = gx + Math.cos(ca) * rc, py = gy + Math.sin(ca) * rc;
      crank.rotation.z = ca;
      const hy = py + Math.sqrt(Math.max(0, L * L - (px - gx) ** 2));
      rod.position.set(px, py, 0.04); rod.rotation.z = Math.atan2(hy - py, gx - px) - PI / 2;
      head.position.y = hy;
      // the heat coil glows with the work (copper, then amber, then orange-white)
      setGlow(coil, Math.max(0, a.heat - 0.12) * 1.25);
      setGlow(sleeve, Math.max(0, a.heat - 0.3) * 0.9);
      // diodes: power steady, load flickers, heat warns
      setGlow(dio[0], 0.9);
      setGlow(dio[1], a.act > 0.05 ? 0.4 + 0.6 * Math.abs(Math.sin(a.t * 17)) * a.act : 0.08);
      setGlow(dio[2], a.heat > 0.6 ? (Math.sin(a.t * 6) > 0 ? 1 : 0.1) : 0.06);
      needle.rotation.z = 1.1 - a.act * 2.0 - Math.sin(a.t * 23) * 0.06 * a.act;
      fluid.scale.y = 0.92 + Math.sin(a.t * 3) * 0.03;
      for (const d of diamonds) setGlow(d, 0.3 + a.act * 1.1);
      // the whole head chatters a little under load
      root.position.set(base.x + Math.sin(a.t * 91) * 0.003 * a.act, base.y + Math.sin(a.t * 73) * 0.003 * a.act, base.z);
    };
  },
};
