// SAMPLER (tool 'sampler'), 1.4 m: a white enamel field-lab head with a ruby band. On top the SAMPLE CAROUSEL, a
// drum of eight glass vials (each its own sample colour, filling as it works) that indexes one vial per core; in the
// flank a round window onto the PERISTALTIC PUMP (a three-roller rotor walking round its squeezed hose); at the front
// the TELESCOPING CORE PROBE, two sleeves and a crowned needle that thrust out, spin as they bite and draw back; a
// suction hose from probe to pump to carousel; a readout of bars. Level 2: a second carousel tier. Level 3: a
// frosted cryo chamber with venting jets.
import * as THREE from 'three';
import { type Kit, R, PI, TAU, AX, cbox, box, lathe, cyl, ring, sphere, cone, prism, torus, setGlow, liveTex, clamp01 } from './kit';
import type { ToolSpec } from './model';

const ease = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const SAMPLER: ToolSpec = {
  id: 'sampler', name: 'Sampler',
  livery: { name: 'white', hull: R.snow, hullStep: 4, accent: R.ruby, accentStep: 4, glow: R.glowTeal },
  pose: { act: 0.8, t: 0.55 },
  build(k: Kit, root: THREE.Group) {
    const det = k.det, seg = det >= 2 ? 20 : det ? 16 : 12;
    // ---------------------------------------------------------------- the housing
    const body = k.group(root, [-0.15, 0, 0]);
    k.mesh(cbox(0.56, 0.28, 0.3, 0.04), 'hull', body);
    k.mesh(cbox(0.57, 0.05, 0.31, 0.012), 'accent', body, [0, 0.085, 0]);
    k.mesh(cbox(0.58, 0.04, 0.32, 0.01), 'frame', body, [0, -0.14, 0]);
    k.mesh(box(0.006, 0.2, 0.004), 'ink', body, [0.13, -0.02, 0.151]);
    k.decal(body, { kind: 'stencil', text: 'SMP-1', ink: R.ruby[3] }, 0.14, 0.06, [0.2, -0.04, 0.152]);
    k.decal(body, { kind: 'warn' }, 0.055, 0.05, [0.2, 0.03, 0.152]);
    k.bolts(body, [[-0.25, -0.1, 0.152], [0.25, -0.1, 0.152], [-0.25, 0.05, 0.152], [0.05, -0.1, 0.152]], 0.009);
    const dio = [0, 1, 2].map((i) => k.diode(body, [0.08 + i * 0.035, -0.105, 0.152], 'z', i === 2 ? R.ruby[5] : R.glowTeal[3], 0.01));
    // the pump window: a bolted bezel, the rotor and its rollers, the hose loop under glass
    const pump = k.group(body, [-0.1, -0.015, 0.152]);
    k.mesh(ring(0.11, 0.085, 0.024, seg, 0.006), 'frame', pump, [0, 0, 0], AX.z);
    k.mesh(cyl(0.086, 0.006, seg), 'ink', pump, [0, 0, -0.004], AX.z);
    k.boltRing(pump, 0.098, 6, 'z', 0.012, 0.007);
    k.mesh(torus(0.06, 0.012, 6, 18, PI * 1.5), 'rubber', pump, [0, 0, 0.004], [0, 0, PI * 0.75]);
    const rotor = k.group(pump, [0, 0, 0.006], [0, 0, 0], { name: 'rotor' });
    k.mesh(cyl(0.02, 0.016, 10), 'chrome', rotor, [0, 0, 0], AX.z);
    for (let i = 0; i < 3; i++) { const a2 = (i / 3) * TAU; k.mesh(box(0.05, 0.012, 0.008), 'steel', rotor, [Math.cos(a2) * 0.025, Math.sin(a2) * 0.025, 0], [0, 0, a2]); k.mesh(cyl(0.012, 0.018, 10), 'brass', rotor, [Math.cos(a2) * 0.05, Math.sin(a2) * 0.05, 0.002], AX.z); }
    k.mesh(cyl(0.088, 0.006, seg), k.paint('glass', { opacity: 0.35 }), pump, [0, 0, 0.016], AX.z, { det: 1 });
    k.callout('pump', 'PUMP', pump);
    // the readout of bars on the rear
    const scr = liveTex(14, 9);
    const sg = k.group(body, [-0.281, 0.02, 0], [0, -PI / 2, 0]);
    k.mesh(cbox(0.2, 0.14, 0.02, 0.006), 'frame', sg);
    const sm = k.glow(3, 0.4, { color: 0xffffff });
    if ((sm as THREE.ShaderMaterial).uniforms?.uMap) { (sm as THREE.ShaderMaterial).uniforms.uMap.value = scr.t.ui; (sm as THREE.ShaderMaterial).defines = { USE_MAP: '' }; sm.needsUpdate = true; } else (sm as THREE.MeshLambertMaterial).map = scr.t.world;
    k.mesh(new THREE.PlaneGeometry(0.16, 0.1), sm, sg, [0, 0, 0.011]);
    // ---------------------------------------------------------------- the sample carousel (one tier, a second at level 2)
    const carMount = k.group(root, [-0.17, 0.14, 0]);
    k.mesh(cyl(0.05, 0.03, 14, 0.006), 'frame', carMount, [0, 0.015, 0]);
    const car = k.group(carMount, [0, 0.03, 0], [0, 0, 0], { name: 'carousel' });
    k.mesh(cyl(0.022, 0.32, 10), 'chrome', car, [0, 0.16, 0]);
    const vialFill: THREE.Mesh[] = [];
    const cols = [R.ruby[4], R.malachite[4], R.amethyst[4], R.ochre[5], R.sapphire[5], R.coral[4], R.glowTeal[3], R.moss[5]];
    for (const [ty, lvl] of [[0, 1], [0.16, 2]] as [number, number][]) {
      const tier = k.group(car, [0, ty, 0], [0, lvl > 1 ? PI / 8 : 0, 0], lvl > 1 ? { lvl } : {});
      k.mesh(cyl(0.17, 0.02, 8, 0.005), 'hull2', tier, [0, 0.01, 0]);
      k.mesh(ring(0.17, 0.12, 0.02, 8, 0.004), 'frame', tier, [0, 0.13, 0]);
      for (let i = 0; i < 8; i++) {
        const a2 = (i / 8) * TAU, x = Math.cos(a2) * 0.135, z = Math.sin(a2) * 0.135;
        k.mesh(lathe([[0, 0.02], [0.022, 0.02], [0.022, 0.13], [0.016, 0.14], [0, 0.14]], 10), 'glass', tier, [x, 0, z]);
        const f = k.mesh(cyl(0.017, 0.1, 10), k.glow(3, 0.3, { color: cols[i], body: cols[i] }), tier, [x, 0.025, z]);
        f.geometry = cyl(0.017, 0.1, 10).clone().translate(0, 0.05, 0); if (lvl === 1) vialFill.push(f); else f.scale.y = 0.4 + (i % 3) * 0.2;
        k.mesh(cyl(0.02, 0.018, 10, 0.004), i % 2 ? 'red' : 'rubber', tier, [x, 0.15, z]);
      }
    }
    k.mesh(cyl(0.035, 0.03, 10, 0.006), 'brass', car, [0, 0.335, 0]);
    k.callout('carousel', 'SAMPLE CAROUSEL', car);
    // ---------------------------------------------------------------- the telescoping core probe
    const nose = k.group(root, [0.13, -0.02, 0], AX.x);
    k.mesh(lathe([[0, 0], [0.11, 0], [0.12, 0.02], [0.12, 0.06], [0.08, 0.12], [0.065, 0.14], [0, 0.14]], seg), 'hull', nose);
    k.mesh(ring(0.122, 0.11, 0.02, seg), 'accent', nose, [0, 0.04, 0]);
    const s1 = k.group(nose, [0, 0.1, 0], [0, 0, 0], { name: 'sleeve1' });
    k.mesh(cyl(0.05, 0.26, seg, 0.006), 'steel', s1, [0, 0.13, 0]);
    k.mesh(ring(0.056, 0.048, 0.02, seg), 'frame', s1, [0, 0.25, 0]);
    const s2 = k.group(s1, [0, 0.12, 0], [0, 0, 0], { name: 'sleeve2' });
    k.mesh(cyl(0.034, 0.26, seg, 0.004), 'chrome', s2, [0, 0.13, 0]);
    k.mesh(ring(0.04, 0.032, 0.016, seg), 'brass', s2, [0, 0.25, 0]);
    const needle = k.group(s2, [0, 0.14, 0], [0, 0, 0], { name: 'needle' });
    k.mesh(cyl(0.022, 0.24, 12), 'steel', needle, [0, 0.12, 0]);
    const crown = k.group(needle, [0, 0.24, 0]);
    k.mesh(ring(0.026, 0.016, 0.03, 12), 'chrome', crown, [0, 0.015, 0]);
    for (let i = 0; i < 6; i++) { const a2 = (i / 6) * TAU; k.mesh(cone(0.008, 0.0, 0.025, 4), 'chrome', crown, [Math.cos(a2) * 0.021, 0.042, Math.sin(a2) * 0.021]); }
    const coreGlow = k.mesh(cyl(0.014, 0.2, 8), k.glow(3, 0.2, { color: R.ruby[4] }), needle, [0, 0.13, 0]);
    k.callout('probe', 'CORE PROBE', needle);
    // the suction hose: probe -> pump -> carousel
    k.cable(root, [[0.2, 0.08, 0.09], [0.12, 0.13, 0.17], [-0.05, 0.08, 0.2], [-0.1, 0.06, 0.18]], 0.011, 'rubber');
    k.cable(root, [[-0.25, 0.08, 0.17], [-0.3, 0.2, 0.17], [-0.24, 0.27, 0.12], [-0.19, 0.26, 0.08]], 0.011, 'rubber');
    // a skid under it
    k.mesh(cbox(0.4, 0.04, 0.12, 0.01), 'dark', root, [-0.15, -0.18, 0]);
    k.bolts(root, [[-0.3, -0.158, 0.05], [0.0, -0.158, 0.05], [-0.3, -0.158, -0.05], [0.0, -0.158, -0.05]], 0.009, 'y');
    // ---------------------------------------------------------------- level 3: the cryo chamber and its vents
    const cryo = k.group(root, [-0.5, -0.0, 0], AX.x, { lvl: 3 });
    k.mesh(lathe([[0, -0.1], [0.08, -0.1], [0.1, -0.08], [0.1, 0.08], [0.08, 0.1], [0, 0.1]], seg), k.glow(2, 0.5, { color: R.sky[4], body: R.sky[5] }), cryo);
    for (const y of [-0.06, 0, 0.06]) k.mesh(ring(0.104, 0.095, 0.014, seg), 'frame', cryo, [0, y, 0]);
    const jets: THREE.Mesh[] = [];
    for (const s of [-1, 1]) jets.push(k.mesh(cone(0.03, 0.0, 0.12, 8), k.glow(4, 0.8, { color: R.snow[5], opacity: 0.6 }), cryo, [0, 0.0, s * 0.15], [s * PI / 2, 0, 0]));

    // ---------------------------------------------------------------- the working parts
    let cyc = 0, rot = 0, carA = 0, idx = 0, last = 0, scrT = 0;
    const bars = [3, 5, 2, 6];
    return (a) => {
      const T = 2.2 - (a.level - 1) * 0.25;
      if (a.act > 0.3) cyc += a.dt;
      const p = (cyc % T) / T;
      // thrust out (0..0.35), bite and spin (0.35..0.6), draw back (0.6..0.85), index the carousel (0.85..1)
      const ext = a.act > 0.3 ? (p < 0.35 ? ease(p / 0.35) : p < 0.6 ? 1 : p < 0.85 ? 1 - ease((p - 0.6) / 0.25) : 0) : 0.12 * a.chg;
      s1.position.y = 0.1 + ext * 0.12; s2.position.y = 0.12 + ext * 0.12; needle.position.y = 0.14 + ext * 0.1;
      rot += a.dt * (0.5 + (p > 0.3 && p < 0.62 && a.act > 0.3 ? 28 : a.act * 3)); needle.rotation.y = rot;
      setGlow(coreGlow, p > 0.4 && p < 0.9 && a.act > 0.3 ? 0.9 : 0.15);
      // the pump walks round while it draws
      rotor.rotation.z -= a.dt * (0.4 + a.act * (p > 0.35 && p < 0.9 ? 9 : 2));
      // the carousel indexes one vial per core; the filled vial rises
      const cyc0 = Math.floor(cyc / T);
      if (cyc0 !== last) { last = cyc0; idx++; }
      const ix = a.act > 0.3 && p > 0.85 ? ease((p - 0.85) / 0.15) : 0;
      carA += a.dt * (a.act > 0.3 ? 0 : 0.25 + a.chg);
      car.rotation.y = carA + (idx + ix) * (TAU / 8);
      vialFill.forEach((v, i) => { const own = (i + idx) % 8; v.scale.y = Math.max(0.05, own < 4 ? 0.25 + own * 0.18 : 0.1 + (own % 3) * 0.12); setGlow(v, 0.25 + (own === 0 ? a.act * 0.8 : 0)); });
      setGlow(dio[0], 0.9); setGlow(dio[1], a.act > 0.3 ? (Math.sin(a.t * 9) > 0 ? 1 : 0.2) : 0.15); setGlow(dio[2], ext > 0.9 ? 1.1 : 0.08);
      jets.forEach((j, i) => { j.visible = a.act > 0.3 && Math.sin(a.t * 2 + i * PI) > 0.4; j.scale.setScalar(0.7 + Math.random() * 0.5); });
      scrT += a.dt; if (scrT > 0.12) {
        scrT = 0; const P = scr.px; P.rect(0, 0, 14, 9, 0x0c1a16);
        bars.forEach((b, i) => { const v = Math.max(1, Math.min(7, Math.round(b + Math.sin(a.t * 3 + i) * 2 * (0.3 + a.act)))); P.rect(1 + i * 3, 8 - v, 2, v, i === 3 ? R.glowAmber[3] : R.glowTeal[3]); });
        scr.push();
      }
    };
  },
};
void sphere; void prism;
