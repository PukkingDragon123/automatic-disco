// SEED PLANTER (tool 'seeder'), 1.3 m: a moss-green planter head. A glass HOPPER DOME full of seeds that tumble as it
// runs; a glass feed tube where an AUGER SCREW turns, carrying seeds down; a pneumatic tank with its gauge; at the
// front the INJECTOR: a POD MAGAZINE belt of seed pods that advances one pod per shot, a PISTON that drives the
// planting bit down and back, the bit spinning as it bores, and two soil probe prongs. Level 2: a second hopper.
// Level 3: a glowing fertiliser tank and its spray nozzle.
import * as THREE from 'three';
import { type Kit, R, PI, TAU, AX, cbox, box, lathe, cyl, ring, sphere, cone, prism, helix, helixTaper, torus, setGlow, clamp01 } from './kit';
import type { ToolSpec } from './model';

const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const SEEDER: ToolSpec = {
  id: 'seeder', name: 'Seed Planter',
  livery: { name: 'moss', hull: R.moss, hullStep: 3, accent: R.ochre, accentStep: 5, glow: R.malachite },
  pose: { act: 0.8, t: 0.4 },
  icon: { yaw: 0.6, roll: 0.05 },
  build(k: Kit, root: THREE.Group) {
    const det = k.det, seg = det >= 2 ? 20 : det ? 16 : 12;
    // ---------------------------------------------------------------- the body
    const body = k.group(root, [-0.12, 0, 0]);
    k.mesh(cbox(0.5, 0.26, 0.28, 0.04), 'hull', body);
    k.mesh(cbox(0.51, 0.045, 0.29, 0.012), 'accent', body, [0, -0.08, 0]);
    k.mesh(cbox(0.52, 0.03, 0.3, 0.008), 'frame', body, [0, 0.13, 0]);
    k.vent(body, 0.12, 0.07, [-0.14, 0.03, 0.141]);
    k.decal(body, { kind: 'stencil', text: 'SDR-5', ink: R.moss[1] }, 0.14, 0.06, [0.08, 0.035, 0.141]);
    k.bolts(body, [[-0.22, 0.1, 0.141], [0.22, 0.1, 0.141], [-0.22, -0.05, 0.141], [0.22, -0.05, 0.141]], 0.009);
    const dio = [0, 1].map((i) => k.diode(body, [0.0 + i * 0.04, -0.035, 0.141], 'z', i ? R.glowAmber[3] : R.malachite[5], 0.01));
    k.mesh(cbox(0.36, 0.04, 0.14, 0.01), 'dark', body, [-0.03, -0.15, 0]);
    // the pneumatic tank on the far side and its gauge
    const tank = k.group(body, [-0.04, -0.03, -0.18], AX.x);
    k.mesh(lathe([[0, -0.2], [0.04, -0.2], [0.065, -0.18], [0.065, 0.18], [0.04, 0.2], [0, 0.2]], seg), 'accent2', tank);
    for (const y of [-0.12, 0.12]) k.mesh(ring(0.07, 0.06, 0.02, seg), 'steel', tank, [0, y, 0]);
    const gauge = k.group(body, [-0.27, 0.05, 0.0], [0, -PI / 2, 0]);
    k.mesh(cyl(0.04, 0.02, 14, 0.005), 'brass', gauge, [0, 0, 0], AX.z);
    k.mesh(cyl(0.032, 0.004, 14), 'bone', gauge, [0, 0, 0.011], AX.z);
    const needle = k.group(gauge, [0, 0, 0.015]);
    k.mesh(box(0.004, 0.026, 0.003), 'red', needle, [0, 0.011, 0]);
    // ---------------------------------------------------------------- the hopper dome and its seeds
    const hop = k.group(root, [-0.2, 0.145, 0]);
    k.mesh(ring(0.15, 0.12, 0.03, seg, 0.006), 'frame', hop, [0, 0.015, 0]);
    const dome: [number, number][] = [[0, 0.03]]; for (let i = 0; i <= 6; i++) { const t = (i / 6) * (PI / 2); dome.push([Math.cos(t) * 0.135, 0.03 + Math.sin(t) * 0.15]); }
    dome[0] = [0.0, 0.03]; dome.splice(1, 0, [0.135, 0.03]);
    const domeGeo = lathe(dome.slice(1).concat([[0, 0.18]]), seg);
    const seeds = k.group(hop, [0, 0.03, 0], [0, 0, 0], { name: 'seeds' });
    const seedList: THREE.Mesh[] = [];
    const nSeed = det >= 1 ? 22 : 12;
    for (let i = 0; i < nSeed; i++) { const m = k.mesh(sphere(0.018, 6, 5), i % 4 ? (i % 3 ? 'paint:fur:5' as never : 'paint:ochre:5' as never) : ('paint:moss:5' as never), seeds); m.scale.set(1, 0.7, 0.8); seedList.push(m); }
    k.mesh(domeGeo, k.paint('glass', { opacity: 0.5, rim: 0.5 }), hop);
    for (let i = 0; i < 4; i++) { const an = (i / 4) * TAU + PI / 4; const rib = k.group(hop, [0, 0.03, 0], [0, -an, 0]); k.mesh(torus(0.137, 0.007, 4, 10, PI / 2), 'frame', rib, [0, 0, 0], [0, 0, 0]); }
    k.mesh(cyl(0.03, 0.03, 10, 0.006), 'brass', hop, [0, 0.19, 0]);
    k.callout('hopper', 'SEED HOPPER', hop);
    // ---------------------------------------------------------------- the feed tube and its auger
    const feed = k.group(root, [0.08, 0.13, 0], [0, 0, -1.0]);
    k.mesh(lathe([[0.042, -0.18], [0.046, -0.18], [0.046, 0.18], [0.042, 0.18], [0.042, -0.18]], 14), 'glass', feed);
    for (const y of [-0.17, 0.17]) k.mesh(ring(0.055, 0.044, 0.025, 14, 0.004), 'frame', feed, [0, y, 0]);
    const auger = k.group(feed, [0, 0, 0], [0, 0, 0], { name: 'auger' });
    k.mesh(cyl(0.01, 0.34, 8), 'chrome', auger);
    k.mesh(helix(0.026, 0.32, 6, 0.008, det), 'brass', auger);
    k.callout('auger', 'AUGER', feed);
    // ---------------------------------------------------------------- the injector at the front
    const inj = k.group(root, [0.25, -0.02, 0]);
    k.mesh(cbox(0.14, 0.3, 0.2, 0.025), 'hull2', inj, [0, 0.0, 0]);
    k.mesh(cbox(0.15, 0.04, 0.21, 0.008), 'accent', inj, [0, 0.12, 0]);
    k.bolts(inj, [[-0.05, 0.08, 0.101], [0.05, 0.08, 0.101], [-0.05, -0.1, 0.101], [0.05, -0.1, 0.101]], 0.008);
    // the piston: a cylinder above, its rod and the bit head plunging below
    const cylG = k.group(inj, [0.0, 0.22, 0]);
    k.mesh(lathe([[0, -0.08], [0.04, -0.08], [0.045, -0.07], [0.045, 0.08], [0.035, 0.095], [0, 0.095]], 14), 'steel', cylG);
    for (const y of [-0.05, 0.05]) k.mesh(ring(0.05, 0.044, 0.014, 14), 'frame', cylG, [0, y, 0]);
    k.cable(root, [[0.25, 0.3, 0.03], [0.2, 0.36, 0.1], [0.05, 0.3, 0.16], [-0.05, 0.1, 0.16]], 0.009, 'rubber');
    const plunger = k.group(inj, [0, 0, 0], [0, 0, 0], { name: 'plunger' });
    k.mesh(cyl(0.016, 0.42, 10), 'chrome', plunger, [0, 0.0, 0]);
    const bitHead = k.group(plunger, [0, -0.24, 0]);
    k.mesh(cyl(0.035, 0.04, 12, 0.006), 'frame', bitHead);
    const bit = k.group(bitHead, [0, -0.02, 0], [0, 0, 0], { name: 'bit' });
    k.mesh(cone(0.02, 0.004, 0.13, 10), 'steel', bit, [0, -0.065, 0], [PI, 0, 0]);
    k.mesh(helixTaper(0.022, 0.006, 0.12, 3, 0.006, det), 'chrome', bit, [0, -0.065, 0], [PI, 0, 0]);
    k.callout('piston', 'INJECTOR PISTON', cylG);
    // the pod magazine: a belt of pods feeding in from the side
    const mag = k.group(inj, [0.0, -0.05, 0.1]);
    k.mesh(cbox(0.06, 0.06, 0.24, 0.01), 'frame', mag, [0, 0, 0.1]);
    const pods: THREE.Group[] = [];
    for (let i = 0; i < 5; i++) { const pg = k.group(mag, [0, 0.0, 0.03 + i * 0.05]); k.mesh(lathe([[0, -0.03], [0.015, -0.028], [0.02, -0.01], [0.02, 0.012], [0.012, 0.03], [0, 0.034]], 10), 'paint:moss:5' as never, pg, [0, 0.0, 0], AX.z); k.mesh(ring(0.021, 0.018, 0.008, 10), 'brass', pg, [0, 0, 0], AX.z); pods.push(pg); }
    k.callout('pods', 'POD MAGAZINE', mag);
    // soil probe prongs
    for (const s of [-1, 1]) { k.mesh(box(0.016, 0.16, 0.016), 'steel', inj, [0.05, -0.22, s * 0.07]); k.mesh(cone(0.009, 0.0, 0.04, 6), 'chrome', inj, [0.05, -0.32, s * 0.07], [PI, 0, 0]); }
    // ---------------------------------------------------------------- level 2: a second hopper
    const hop2 = k.group(root, [-0.38, 0.11, 0.0], [0, 0, 0], { lvl: 2 });
    k.mesh(ring(0.1, 0.08, 0.025, seg, 0.005), 'frame', hop2, [0, 0.0, 0]);
    k.mesh(lathe([[0.09, 0.0], [0.09, 0.08], [0.06, 0.13], [0, 0.14]], seg), 'glass', hop2);
    for (let i = 0; i < 8; i++) { const a2 = i * 2.4, r = 0.02 + (i % 3) * 0.022; const m = k.mesh(sphere(0.016, 6, 5), 'paint:ochre:5' as never, hop2, [Math.cos(a2) * r, 0.02 + (i % 4) * 0.018, Math.sin(a2) * r]); m.scale.set(1, 0.7, 0.8); }
    // ---------------------------------------------------------------- level 3: fertiliser tank and its spray
    const fert = k.group(root, [-0.1, 0.02, 0.2], AX.x, { lvl: 3 });
    k.mesh(lathe([[0, -0.15], [0.05, -0.15], [0.055, -0.13], [0.055, 0.13], [0.05, 0.15], [0, 0.15]], seg), 'glass', fert);
    const fFluid = k.mesh(cyl(0.047, 0.24, seg), k.glow(3, 0.6, { color: R.malachite[5], body: R.malachite[4] }), fert);
    k.cable(root, [[0.05, 0.02, 0.2], [0.18, 0.0, 0.2], [0.3, -0.12, 0.13], [0.32, -0.2, 0.1]], 0.008, 'brass', { lvl: 3 });
    const mist: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) mist.push(k.mesh(sphere(0.012, 6, 5), k.glow(4, 0.8, { color: R.malachite[6] }), inj, [0.04, -0.2, 0.1], [0, 0, 0], { lvl: 3 }));

    // ---------------------------------------------------------------- the working parts
    let cyc = 0, aug = 0, bitA = 0, shots = 0, lastCy = 0;
    return (a) => {
      const T = 1.5 - (a.level - 1) * 0.15, on = a.act > 0.3;
      if (on) cyc += a.dt;
      const p = (cyc % T) / T;
      // the auger turns, the seeds tumble in the hopper
      aug += a.dt * (0.4 + a.act * 9); auger.rotation.y = -aug;
      seedList.forEach((m, i) => {
        const ph = i * 2.39996, r = 0.03 + ((i * 7) % 5) * 0.018, lift = on ? Math.abs(Math.sin(a.t * 6 + i)) * 0.05 * a.act : 0;
        const ang = ph + aug * 0.3 * (i % 2 ? 1 : -1);
        const top = 0.15 * Math.sqrt(Math.max(0, 1 - (r / 0.135) ** 2)) - 0.03; m.position.set(Math.cos(ang) * r, Math.min(top, 0.015 + (i % 5) * 0.022 + lift), Math.sin(ang) * r);
        m.rotation.set(ph + aug * 0.5, ph, 0);
      });
      // the shot: plunge (0.1..0.45), bore (0.45..0.6), return (0.6..0.85); a pod feeds at the top
      const down = on ? (p < 0.1 ? 0 : p < 0.45 ? ease((p - 0.1) / 0.35) : p < 0.6 ? 1 : p < 0.85 ? 1 - ease((p - 0.6) / 0.25) : 0) : 0;
      plunger.position.y = -down * 0.12;
      bitA += a.dt * (0.6 + (on && p > 0.3 && p < 0.65 ? 30 : a.act * 4)); bit.rotation.y = bitA;
      const cy = Math.floor(cyc / T); if (cy !== lastCy) { lastCy = cy; shots++; }
      const adv = on && p > 0.85 ? ease((p - 0.85) / 0.15) : 0;
      pods.forEach((pg, i) => { const slot = i - adv; pg.position.z = 0.03 + slot * 0.05; pg.visible = slot > -0.6; });
      needle.rotation.z = 0.9 - a.act * 0.8 - a.chg * 0.4 - (on && p > 0.1 && p < 0.45 ? 0.5 : 0);
      setGlow(dio[0], 0.9); setGlow(dio[1], on && down > 0.9 ? 1.2 : 0.15);
      setGlow(fFluid, 0.5 + 0.2 * Math.sin(a.t * 2));
      mist.forEach((m, i) => { const t2 = ((a.t * 1.6 + i * 0.25) % 1); m.visible = on; m.position.set(0.04 + t2 * 0.08, -0.22 - t2 * 0.1, 0.1 + (i - 1.5) * t2 * 0.05); m.scale.setScalar(0.6 + t2 * 1.4); setGlow(m, 1 - t2); });
      void shots;
    };
  },
};
void TAU; void prism;
