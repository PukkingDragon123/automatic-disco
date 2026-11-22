// WINCH HOOK (tool 'carry'), the carrier drone's 1.3 m winch: a hazard-trimmed ochre frame bolted under the drone, an
// electric motor driving a GEARED CABLE DRUM through an open pair of spur gears (with a brake disc and caliper), the
// cable paying out through a roller FAIRLEAD to the HOOK BLOCK, whose SHEAVE turns as the cable runs and whose hook
// SWINGS on its swivel; a rotating amber BEACON on top warns while it lifts. Working, the hook lowers and hoists in a
// cycle. Level 2: a second drum and line. Level 3: a magnetic grapple plate under the hook that glows when it grips.
import * as THREE from 'three';
import { type Kit, R, PI, TAU, AX, cbox, box, lathe, cyl, ring, sphere, cone, prism, torus, gearTrain, setGlow, clamp01 } from './kit';
import type { ToolSpec } from './model';

const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const CARRY: ToolSpec = {
  id: 'carry', name: 'Winch Hook',
  livery: { name: 'ochre', hull: R.ochre, hullStep: 4, accent: R.steel, accentStep: 2, glow: R.glowAmber },
  pose: { act: 0.7, t: 1.6 },
  build(k: Kit, root: THREE.Group) {
    const det = k.det, seg = det >= 2 ? 20 : det ? 16 : 12;
    // ---------------------------------------------------------------- the frame under the drone
    const top = k.group(root, [0, 0.5, 0]);
    k.mesh(cbox(0.7, 0.06, 0.4, 0.012), 'frame', top, [0, 0.03, 0]);
    k.bolts(top, [[-0.32, 0.062, 0.17], [0.32, 0.062, 0.17], [-0.32, 0.062, -0.17], [0.32, 0.062, -0.17], [0, 0.062, 0.17], [0, 0.062, -0.17]], 0.012, 'y');
    for (const s of [-1, 1]) {
      k.mesh(prism([[-0.3, 0], [0.3, 0], [0.22, -0.32], [-0.22, -0.32]], 0.04, 0.008), 'hull', top, [0, 0, s * 0.18]);
      k.decal(top, { kind: 'hazard' }, 0.42, 0.06, [0, -0.04, s * 0.201], s > 0 ? [0, 0, 0] : [0, PI, 0]);
      k.mesh(prism([[-0.12, -0.14], [0.12, -0.14], [0.1, -0.24], [-0.1, -0.24]], 0.012), 'ink', top, [0, 0, s * 0.2]);
    }
    k.decal(top, { kind: 'stencil', text: 'WH-2', ink: R.ochre[1] }, 0.14, 0.06, [-0.16, -0.12, 0.201]);
    const dio = [0, 1].map((i) => k.diode(top, [0.15 + i * 0.04, -0.12, 0.201], 'z', i ? R.ruby[5] : R.malachite[5], 0.01));
    // ---------------------------------------------------------------- the motor, gears, brake and the drum
    const motor = k.group(root, [0.0, 0.3, 0], AX.z);
    const drum = k.group(motor, [0, 0, 0], [0, 0, 0], { name: 'drum' });
    k.mesh(cyl(0.085, 0.3, seg), 'cable', drum);
    for (let i = 0; i < (det ? 8 : 4); i++) k.mesh(ring(0.089, 0.08, 0.012, seg), 'dark', drum, [0, -0.13 + i * 0.037, 0], [0, 0, 0], { det: 1 });
    for (const y of [-0.16, 0.16]) k.mesh(cyl(0.13, 0.02, seg, 0.004), 'accent', drum, [0, y, 0]);
    k.callout('drum', 'CABLE DRUM', drum);
    // the motor on the -Z end, the spur gears on the +Z end
    const mot = k.group(motor, [0.12, -0.24, 0]);
    k.mesh(lathe([[0, -0.12], [0.05, -0.12], [0.065, -0.1], [0.065, 0.1], [0.05, 0.12], [0, 0.12]], 14), 'hull2', mot);
    for (let i = 0; i < 5; i++) k.mesh(ring(0.075, 0.064, 0.012, 14), 'fin', mot, [0, -0.08 + i * 0.04, 0]);
    k.cable(root, [[0.12, 0.43, -0.28], [0.18, 0.48, -0.2], [0.26, 0.5, -0.1]], 0.011, 'cable');
    const gface = k.group(root, [0, 0.3, 0.2]);
    const train = gearTrain(k, gface, [{ n: 9, at: [0.12, 0.0], paint: 'chrome' }, { n: 20, ang: PI, paint: 'brass' }], { arc: 0.036, dep: 0.016, thick: 0.022 });
    k.mesh(cyl(0.02, 0.05, 10), 'steel', gface, [train.centres[1][0], train.centres[1][1], 0.012], AX.z);
    k.callout('gears', 'SPUR GEARS', train.gears[1]);
    const brake = k.group(root, [0, 0.3, -0.19], AX.z);
    k.mesh(cyl(0.09, 0.012, seg), 'steel', brake);
    k.mesh(cbox(0.05, 0.04, 0.06, 0.008), 'red', root, [0.07, 0.37, -0.19]);
    // ---------------------------------------------------------------- the fairlead and the cable
    const fair = k.group(root, [0, 0.14, 0]);
    k.mesh(cbox(0.2, 0.05, 0.14, 0.01), 'frame', fair);
    const rollers: THREE.Mesh[] = [];
    for (const s of [-1, 1]) rollers.push(k.mesh(cyl(0.018, 0.12, 10), 'chrome', fair, [s * 0.025, 0.0, 0], AX.z));
    const line = k.mesh(cyl(0.009, 1, 6), 'cable', root, [0.0, 0, 0]);
    // ---------------------------------------------------------------- the hook block, sheave and hook
    const block = k.group(root, [0, -0.3, 0], [0, 0, 0], { name: 'block' });
    k.mesh(cbox(0.16, 0.2, 0.09, 0.02), 'hazard', block, [0, 0, 0]);
    for (const s of [-1, 1]) k.mesh(cbox(0.17, 0.21, 0.012, 0.004), 'hull', block, [0, 0, s * 0.05]);
    const sheave = k.group(block, [0, 0.05, 0], [0, 0, 0], { name: 'sheave' });
    k.mesh(gearLike(k), 'steel', sheave, [0, 0, 0], AX.z);
    for (let i = 0; i < 4; i++) k.mesh(box(0.012, 0.09, 0.03), 'dark', sheave, [0, 0, 0], [0, 0, (i / 4) * PI]);
    k.mesh(cyl(0.016, 0.13, 10), 'chrome', block, [0, 0.05, 0], AX.z);
    k.bolts(block, [[-0.06, -0.07, 0.057], [0.06, -0.07, 0.057], [-0.06, 0.08, 0.057], [0.06, 0.08, 0.057]], 0.008);
    const swivel = k.group(block, [0, -0.11, 0], [0, 0, 0], { name: 'hook' });
    k.mesh(cyl(0.022, 0.05, 10, 0.004), 'steel', swivel, [0, -0.02, 0]);
    k.mesh(cyl(0.014, 0.08, 8), 'chrome', swivel, [0, -0.08, 0]);
    k.mesh(torus(0.065, 0.022, 8, 18, PI * 1.45), 'frame', swivel, [0.0, -0.18, 0], [0, 0, PI * 0.62]);
    k.mesh(cone(0.022, 0.006, 0.05, 8), 'frame', swivel, [0.06, -0.16, 0], [0, 0, -0.5]);
    k.mesh(box(0.012, 0.045, 0.012), 'red', swivel, [-0.04, -0.13, 0], [0, 0, 0.7]);
    k.callout('hook', 'HOOK + SHEAVE', block);
    // ---------------------------------------------------------------- the beacon on top
    const bea = k.group(root, [0.22, 0.56, 0.0]);
    k.mesh(cyl(0.045, 0.03, 12, 0.006), 'frame', bea, [0, 0.015, 0]);
    k.mesh(lathe([[0.04, 0.03], [0.04, 0.1], [0.03, 0.12], [0, 0.125]], 12), k.glow(3, 0.4, { color: R.glowAmber[3], body: R.glowAmber[2], opacity: 0.75 }), bea);
    const refl = k.group(bea, [0, 0.07, 0], [0, 0, 0], { name: 'beacon' });
    k.mesh(box(0.05, 0.06, 0.006), 'chrome', refl);
    const bulb = k.mesh(sphere(0.016, 8, 6), k.glow(4, 1.2, { color: 0xffe9b0 }), refl, [0, 0, 0.012]);
    const beam = k.mesh(cone(0.012, 0.05, 0.12, 8), k.glow(4, 1.0, { color: R.glowAmber[4], opacity: 0.55 }), refl, [0, 0, 0.08], AX.z);
    k.callout('beacon', 'BEACON', bea);
    // ---------------------------------------------------------------- level 2: a second drum and line
    const d2 = k.group(root, [-0.2, 0.3, 0], AX.z, { lvl: 2 });
    const drum2 = k.group(d2, [0, 0, 0]);
    k.mesh(cyl(0.06, 0.24, seg), 'cable', drum2);
    for (const y of [-0.13, 0.13]) k.mesh(cyl(0.09, 0.016, seg, 0.004), 'accent', drum2, [0, y, 0]);
    const line2 = k.mesh(cyl(0.007, 1, 6), 'cable', root, [-0.2, 0, 0], [0, 0, 0], { lvl: 2 });
    const tag = k.group(root, [-0.2, -0.1, 0], [0, 0, 0], { lvl: 2 });
    k.mesh(cbox(0.08, 0.05, 0.08, 0.01), 'hazard', tag); k.mesh(torus(0.03, 0.01, 6, 12, PI * 1.4), 'frame', tag, [0, -0.06, 0], [0, 0, PI * 0.8]);
    // ---------------------------------------------------------------- level 3: the magnetic grapple
    const mag = k.group(swivel, [0, -0.3, 0], [0, 0, 0], { lvl: 3 });
    k.mesh(cyl(0.12, 0.04, seg, 0.008), 'hull', mag);
    k.mesh(ring(0.1, 0.06, 0.044, seg), 'coil', mag);
    const magGlow = k.mesh(cyl(0.058, 0.046, seg), k.glow(3, 0.5, { color: R.glowAmber[4] }), mag);
    for (const s of [-1, 1]) k.mesh(cyl(0.006, 0.12, 6), 'steel', mag, [s * 0.04, 0.08, 0], [0, 0, s * 0.3]);

    // ---------------------------------------------------------------- the working parts
    let cyc = 0, beaA = 0, sw = 0, prevDrop = 0;
    const upV = new THREE.Vector3(0, 1, 0);
    return (a) => {
      const T = 3.2, on = a.act > 0.3;
      if (on) cyc += a.dt;
      const p = (cyc % T) / T;
      // lower (0..0.4), hold (0.4..0.55), hoist (0.55..0.95)
      const drop = on ? (p < 0.4 ? ease(p / 0.4) : p < 0.55 ? 1 : p < 0.95 ? 1 - ease((p - 0.55) / 0.4) : 0) : 0.15 * Math.sin(a.t * 0.5) ** 2;
      const dy = drop * 0.42, v = (drop - prevDrop) / Math.max(1e-4, a.dt); prevDrop = drop;
      const dA = dy / 0.085;
      drum.rotation.y = dA; drum2.rotation.y = dA * 1.4; train.turn(-dA * (20 / 9));
      rollers.forEach((r, i) => { r.rotation.y = dA * (i ? 3 : -3); });
      block.position.y = -0.3 - dy;
      sheave.rotation.z = -dA * 1.6;
      // the line from the fairlead to the block
      const y0 = 0.115, y1 = block.position.y + 0.05, L = y0 - y1;
      line.position.set(0, (y0 + y1) / 2, 0); line.scale.set(1, L, 1);
      line2.position.set(-0.2, (0.22 + y1 + 0.2) / 2, 0); line2.scale.set(1, Math.max(0.05, 0.22 - (y1 + 0.2)), 1);
      tag.position.y = y1 + 0.2 - 0.05;
      // the hook swings on its swivel (a pendulum kicked by the line's speed)
      sw += a.dt; swivel.rotation.z = Math.sin(sw * 2.6) * (0.06 + Math.min(0.25, Math.abs(v) * 0.08)); swivel.rotation.y = Math.sin(sw * 0.7) * 0.4;
      // the beacon turns while it lifts
      beaA += a.dt * (on ? 7 : 1.2); refl.rotation.y = beaA;
      setGlow(bulb, on ? 1.4 : 0.4); setGlow(beam, on ? 1 : 0.25); beam.visible = on || a.chg > 0.2;
      setGlow(magGlow, on && p > 0.35 && p < 0.95 ? 1.2 : 0.2 + a.chg * 0.6);
      setGlow(dio[0], 0.9); setGlow(dio[1], on ? (Math.sin(a.t * 6) > 0 ? 1 : 0.15) : 0.1);
      void upV;
    };
  },
};
function gearLike(_k: Kit) { return lathe([[0, -0.03], [0.06, -0.03], [0.07, -0.02], [0.055, 0], [0.07, 0.02], [0.06, 0.03], [0, 0.03]], 18); }
void sphere;
