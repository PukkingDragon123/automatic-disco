// MASS DRIVER (tool 'cannon'), a 2.7 m coil gun on a turret yoke: an olive breech housing with its sight, the
// SPINNING CAPACITOR DRUM (six glass cells with glowing cores) on its flank feeding thick cables to a copper bus bar,
// and the barrel: twin rails through a row of ACCELERATOR COILS to a slotted muzzle brake. Working, it runs a real
// cycle: the drum spins up and the coils light breech to muzzle, the slug fires (muzzle flash, the RECOILING BARREL
// kicks back on its slides and springs home), then the BREECH CYCLES (the bolt runs back, a fresh slug drops in, the
// bolt slams home) and the drum indexes one cell. Level 2: two more coils and a second drum. Level 3: a finned
// muzzle brake, shroud heat sinks and a targeting laser.
import * as THREE from 'three';
import { type Kit, R, PI, TAU, AX, cbox, box, lathe, cyl, ring, sphere, cone, prism, torus, setGlow, glowTexMat, clamp01 } from './kit';
import type { ToolSpec } from './model';

const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const CANNON: ToolSpec = {
  id: 'cannon', name: 'Mass Driver',
  livery: { name: 'olive', hull: R.olive, hullStep: 4, accent: R.stampRed, accentStep: 3, glow: R.glowTeal },
  pose: { act: 1, chg: 0.9, t: 0.3 },
  build(k: Kit, root: THREE.Group) {
    const det = k.det, seg = det >= 2 ? 20 : det ? 16 : 12;
    // ---------------------------------------------------------------- the turret base and the yoke
    const base = k.group(root, [-0.25, -0.52, 0]);
    k.mesh(lathe([[0, 0], [0.4, 0], [0.42, 0.02], [0.42, 0.07], [0.36, 0.1], [0, 0.1]], seg), 'frame', base);
    k.mesh(lathe([[0, 0.1], [0.32, 0.1], [0.32, 0.15], [0.28, 0.17], [0, 0.17]], seg), 'hull', base);
    k.boltRing(base, 0.38, 12, 'y', 0.1, 0.012);
    k.decal(base, { kind: 'hazard' }, 0.24, 0.05, [0, 0.05, 0.42], [0, 0, 0]);
    for (const s of [-1, 1]) {
      k.mesh(prism([[-0.2, 0], [0.2, 0], [0.12, 0.5], [-0.1, 0.56]], 0.05, 0.008), 'hull', base, [0, 0.16, s * 0.22]);
      k.mesh(cyl(0.075, 0.05, 16, 0.008), 'frame', base, [0, 0.52, s * 0.255], AX.z);
      k.mesh(cyl(0.045, 0.06, 12, 0.006), 'steel', base, [0, 0.52, s * 0.27], AX.z);
      k.bolts(base, [[-0.12, 0.3, s * 0.247], [0.1, 0.3, s * 0.247], [-0.05, 0.45, s * 0.247]], 0.011, s > 0 ? 'z' : '-z');
    }
    // the elevation ram from the base to the cradle
    const ram = k.group(base, [0.25, 0.17, 0]);
    k.mesh(cyl(0.035, 0.24, 12, 0.006), 'hullDark', ram, [0, 0.12, 0], [0, 0, 0.35]);
    k.mesh(cyl(0.018, 0.2, 10), 'chrome', ram, [-0.07, 0.3, 0], [0, 0, 0.35]);
    // ---------------------------------------------------------------- the cradle (elevated a little)
    const cradle = k.group(root, [-0.25, 0, 0], [0, 0, 0.1]);
    // the breech housing
    const br = k.group(cradle, [-0.12, 0, 0]);
    k.mesh(cbox(0.56, 0.3, 0.3, 0.035), 'hull', br);
    k.mesh(cbox(0.57, 0.05, 0.31, 0.01), 'accent', br, [0, -0.08, 0]);
    k.mesh(cbox(0.36, 0.06, 0.14, 0.01), 'ink', br, [0.04, 0.13, 0]);
    k.decal(br, { kind: 'stencil', text: 'MD-40', ink: R.bone[4] }, 0.2, 0.08, [-0.1, 0.04, 0.151]);
    k.decal(br, { kind: 'chev', ramp: R.ochre }, 0.3, 0.05, [0.08, -0.08, 0.157]);
    k.vent(br, 0.1, 0.08, [0.17, 0.04, 0.151]);
    k.bolts(br, [[-0.25, 0.12, 0.151], [0.25, 0.12, 0.151], [-0.25, -0.12, 0.151], [0.25, -0.12, 0.151]], 0.011);
    k.mesh(cbox(0.08, 0.26, 0.32, 0.015), 'frame', br, [-0.3, 0, 0]);
    k.boltRing(br, 0.09, 6, 'x', -0.341, 0.012, 'steel', 0.5);
    const dio = [R.malachite[5], R.glowAmber[3], R.ruby[5]].map((c, i) => k.diode(br, [-0.24 + i * 0.04, -0.03, 0.151], 'z', c, 0.011));
    // the bolt that cycles, its handle, the slug it chambers
    const bolt = k.group(br, [0.0, 0.13, 0], [0, 0, 0], { name: 'bolt' });
    k.mesh(cyl(0.04, 0.26, 14, 0.006), 'chrome', bolt, [0, 0, 0], AX.x);
    k.mesh(cbox(0.05, 0.05, 0.1, 0.008), 'frame', bolt, [-0.12, 0.02, 0]);
    const handle = k.group(bolt, [-0.12, 0.03, 0.05]);
    k.mesh(cyl(0.012, 0.12, 8), 'steel', handle, [0, 0, 0.06], AX.z);
    k.mesh(sphere(0.026, 10, 8), 'red', handle, [0, 0, 0.125]);
    const slug = k.group(br, [0.16, 0.13, 0], [0, 0, 0], { name: 'slug' });
    k.mesh(lathe([[0, -0.06], [0.03, -0.06], [0.033, -0.05], [0.033, 0.04], [0.02, 0.07], [0, 0.075]], 12), 'copper', slug, [0, 0, 0], AX.x);
    k.callout('breech', 'BREECH', bolt);
    // the sight
    const sight = k.group(br, [0.05, 0.2, -0.1]);
    k.mesh(cbox(0.08, 0.05, 0.05, 0.008), 'frame', sight, [0, -0.02, 0]);
    k.mesh(cyl(0.025, 0.2, 12, 0.004), 'dark', sight, [0.02, 0.03, 0], AX.x);
    k.mesh(cyl(0.019, 0.006, 12), k.glow(3, 0.5, { color: R.glowAmber[3] }), sight, [0.123, 0.03, 0], AX.x);
    // ---------------------------------------------------------------- the capacitor drums (behind the breech; a second over it at level 2)
    const drums: { g: THREE.Group; cells: THREE.Mesh[] }[] = [];
    k.mesh(cbox(0.48, 0.04, 0.16, 0.008), 'frame', cradle, [-0.63, -0.155, 0]);
    for (const [y, lvl] of [[0, 1], [0.27, 2]] as [number, number][]) {
      const mountG = k.group(cradle, [-0.64, y, 0], [0, 0, 0], lvl > 1 ? { lvl } : {});
      for (const x of [-0.19, 0.19]) { k.mesh(cbox(0.03, lvl > 1 ? 0.3 : 0.26, 0.1, 0.008), 'hull2', mountG, [x, lvl > 1 ? -0.1 : -0.03, 0]); k.mesh(cyl(0.028, 0.05, 10), 'steel', mountG, [x, 0, 0], AX.x); }
      const drum = k.group(mountG, [0, 0, 0], AX.x, { name: 'drum' });
      k.mesh(cyl(0.03, 0.36, 12), 'dark', drum);
      const cells: THREE.Mesh[] = [];
      for (const yy of [-0.15, 0.15]) { k.mesh(cyl(0.12, 0.022, 6, 0.004), 'hull2', drum, [0, yy, 0]); k.mesh(cyl(0.035, 0.03, 12), 'brass', drum, [0, yy + Math.sign(yy) * 0.02, 0]); }
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * TAU, x = Math.cos(an) * 0.08, z = Math.sin(an) * 0.08;
        k.mesh(lathe([[0, -0.13], [0.03, -0.13], [0.03, 0.13], [0, 0.13]], 10), 'glass', drum, [x, 0, z]);
        cells.push(k.mesh(cyl(0.016, 0.24, 8), k.glow(3, 0.4, { body: R.glowTeal[1] }), drum, [x, 0, z]));
        for (const yy of [-0.135, 0.135]) k.mesh(cyl(0.034, 0.02, 10, 0.004), 'copper', drum, [x, yy, z]);
      }
      drums.push({ g: drum, cells });
    }
    k.callout('drum', 'CAPACITOR DRUM', drums[0].g);
    // ---------------------------------------------------------------- the barrel (it recoils on the cradle's clamps)
    { const cl = k.group(cradle, [0.08, 0, 0], AX.x); k.mesh(ring(0.13, 0.095, 0.05, seg, 0.008), 'frame', cl); k.boltRing(cl, 0.112, 6, 'y', 0.026, 0.009); }
    const barrel = k.group(cradle, [0, 0, 0], [0, 0, 0], { name: 'barrel' });
    k.mesh(cyl(0.05, 1.9, seg), 'dark', barrel, [0.9, 0, 0], AX.x);
    for (const s of [-1, 1]) k.mesh(cbox(1.8, 0.035, 0.05, 0.008), 'frame', barrel, [0.95, s * 0.075, 0]);
    const coils: THREE.Mesh[] = [];
    const coilMat = () => glowTexMat('coil', R.glowTeal[4], k.ui, { metal: 0.85 });
    for (let i = 0; i < 6; i++) {
      const lvl = i < 4 ? 1 : 2, x = 0.36 + i * 0.2;
      const cg = k.group(barrel, [x + (i >= 4 ? 0.0 : 0), 0, 0], AX.x, lvl > 1 ? { lvl } : {});
      const cm = coilMat();
      k.mesh(cyl(0.064, 0.08, seg), 'dark', cg);
      for (let j = 0; j < 4; j++) k.mesh(torus(0.082, 0.019, 6, seg + 4), cm, cg, [0, -0.028 + j * 0.0187, 0], [PI / 2, 0, 0]);
      for (const y of [-0.047, 0.047]) k.mesh(ring(0.112, 0.05, 0.014, seg, 0.003), 'frame', cg, [0, y, 0]);
      const m = cg.children[1] as THREE.Mesh;
      coils.push(m);
    }
    for (let i = 0; i < 6; i++) k.mesh(cbox(0.03, 0.2, 0.17, 0.008), 'hull2', barrel, [0.46 + i * 0.2, 0, 0], [0, 0, 0], { det: 1 });
    k.mesh(cbox(1.2, 0.02, 0.03, 0.005), 'copper', barrel, [0.9, 0.115, 0]);
    k.callout('coils', 'ACCEL COILS', coils[2]);
    // the muzzle brake
    const muz = k.group(barrel, [1.86, 0, 0], AX.x);
    k.mesh(lathe([[0, -0.05], [0.09, -0.05], [0.1, -0.035], [0.1, 0.1], [0.085, 0.12], [0.03, 0.12], [0.03, 0.11], [0, 0.11]], seg), 'hull', muz);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) k.mesh(box(0.025, 0.03, 0.02), 'ink', muz, [s * 0.092, -0.01 + i * 0.04, 0], [0, 0, 0], { det: 1 });
    k.mesh(ring(0.104, 0.09, 0.02, seg), 'accent', muz, [0, 0.0, 0]);
    k.callout('muzzle', 'RECOILING BARREL', muz);
    const flash = k.group(muz, [0, 0.12, 0], [0, 0, 0], { name: 'flash' });
    const fl1 = k.mesh(cone(0.13, 0.0, 0.2, 10), k.glow(4, 1.6, { color: R.glowTeal[4] }), flash, [0, 0.1, 0]);
    const fl2 = k.mesh(new THREE.IcosahedronGeometry(0.1, 0), k.glow(4, 1.8, { color: 0xeafff4 }), flash, [0, 0.03, 0]);
    for (let i = 0; i < 4; i++) { const an = (i / 4) * TAU + PI / 4; k.mesh(cone(0.035, 0.0, 0.16, 6), k.glow(4, 1.4, { color: R.glowTeal[3] }), flash, [Math.cos(an) * 0.1, 0.02, Math.sin(an) * 0.1], [Math.sin(an) * 1.2, 0, -Math.cos(an) * 1.2]); }
    // thick power cables from the drum to the bus bar
    k.cable(cradle, [[-0.5, 0.09, 0.07], [-0.35, 0.22, 0.12], [-0.05, 0.22, 0.12], [0.25, 0.16, 0.06], [0.33, 0.12, 0.02]], 0.02, 'cable');
    k.cable(cradle, [[-0.5, -0.06, 0.1], [-0.3, -0.12, 0.17], [-0.05, -0.12, 0.17], [0.25, -0.1, 0.1], [0.33, -0.08, 0.04]], 0.016, 'red');
    // ---------------------------------------------------------------- level 3: the finned brake, the heat sinks, the laser
    const fins3 = k.group(muz, [0, 0.03, 0], [0, 0, 0], { lvl: 3 });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.mesh(box(0.05, 0.12, 0.012), 'fin', fins3, [Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12], [0, -a, 0]); }
    const hs = k.group(barrel, [0.85, 0.13, 0], [0, 0, 0], { lvl: 3 });
    for (let i = 0; i < 12; i++) k.mesh(box(0.015, 0.06, 0.12), 'fin', hs, [-0.5 + i * 0.09, 0.03, 0]);
    const laser = k.group(barrel, [1.7, -0.13, 0], [0, 0, 0], { lvl: 3 });
    k.mesh(cbox(0.14, 0.05, 0.05, 0.008), 'frame', laser);
    k.mesh(cyl(0.012, 0.02, 8), k.glow(3, 1, { color: R.ruby[5] }), laser, [0.075, 0, 0], AX.x);
    const beam = k.mesh(cyl(0.004, 0.7, 6), k.glow(3, 1.2, { color: R.ruby[5] }), laser, [0.43, 0, 0], AX.x);

    // ---------------------------------------------------------------- the firing cycle
    let ct = 0, drumA = 0, idx = 0, fired = false;
    return (a) => {
      const T = 1.8 - (a.level - 1) * 0.2, firing = a.act > 0.5;
      if (firing) ct += a.dt; else ct = Math.max(0, ct - a.dt * 2) % T;
      const p = firing ? (ct % T) / T : -1;
      // charge: the drum spins up and the coils light from breech to muzzle
      const chP = firing ? (p < 0.55 ? p / 0.55 : 0) : a.chg;
      const spin = firing ? (p < 0.55 ? 1 + chP * 14 : p < 0.62 ? 4 : 0.6) : 0.4 + a.chg * 11;
      drumA += a.dt * spin;
      // index one cell after each shot
      if (firing && p >= 0.62 && !fired) { fired = true; idx++; }
      if (firing && p < 0.55) fired = false;
      const ix = firing && p >= 0.62 && p < 0.75 ? ease((p - 0.62) / 0.13) : 1;
      for (const d of drums) d.g.rotation.y = drumA + (idx - 1 + ix) * (TAU / 6);
      drums.forEach((d) => d.cells.forEach((c, i) => setGlow(c, 0.25 + chP * 1.1 + (i === 0 ? 0.2 : 0) + (firing && p >= 0.55 && p < 0.6 ? -0.2 : 0))));
      coils.forEach((c, i) => {
        const on = clamp01(chP * (coils.length + 1) - i);
        const blast = firing && p >= 0.55 ? Math.max(0, 1 - (p - 0.55) * T * 3 - i * 0.08) : 0;
        setGlow(c, on * 0.9 + blast * 1.6);
      });
      // fire: the barrel kicks back on its clamps and springs home; the flash
      const tau = firing && p >= 0.55 ? (p - 0.55) * T : 9;
      barrel.position.x = -0.17 * Math.exp(-tau * 7) * Math.cos(Math.min(tau * 9, PI / 2) * 0) * (tau < 9 ? 1 : 0);
      const fk = tau < 0.12 ? 1 - tau / 0.12 : 0;
      flash.visible = fk > 0; flash.scale.set(0.6 + fk * 0.6, 0.4 + fk * 1.2, 0.6 + fk * 0.6);
      setGlow(fl1, 1 + fk); setGlow(fl2, 1.2 + fk);
      // the breech cycles: the bolt runs back, a slug drops in, the bolt slams home
      const back = firing ? (p < 0.62 ? 0 : p < 0.72 ? ease((p - 0.62) / 0.1) : p < 0.8 ? 1 : p < 0.88 ? 1 - ease((p - 0.8) / 0.08) : 0) : 0;
      bolt.position.x = -back * 0.17; handle.rotation.x = -back * 0.9;
      const drop = firing ? (p < 0.72 ? 0 : p < 0.8 ? ease((p - 0.72) / 0.08) : 1) : 1;
      slug.visible = firing ? p >= 0.7 && p < 0.9 : false; slug.position.set(0.12 - (1 - back) * 0.05, 0.13 + (1 - drop) * 0.14, 0);
      // lamps and the laser
      setGlow(dio[0], 0.9); setGlow(dio[1], chP > 0.05 ? 0.3 + chP : 0.1); setGlow(dio[2], fk > 0 || (firing && p > 0.5 && p < 0.56) ? 1.4 : 0.08);
      beam.visible = a.act > 0.2 || a.chg > 0.3; setGlow(beam, 0.8 + Math.random() * 0.3);
    };
  },
};
void torus;
