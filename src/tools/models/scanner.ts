// SCANNER (tool 'scanner'). A survey sensor head, 1.3 m: a teal enamel housing with panel seams, vents and a chase of
// BLINKING DIODES; on a geared turntable mast the ROTATING EMITTER DISH (a real parabolic shell with its feed horn on
// three struts) turns and nods; at the front, in a bolted yoke, the SWEEPING LENS swings side to side, a scan line
// running over its glass and its iris turning; a live readout screen scrolls the return; a whip antenna blinks.
// Level 2: a side sensor pod and a second antenna. Level 3: an emitter ring round the lens and a sub-reflector.
import * as THREE from 'three';
import { type Kit, R, PI, TAU, AX, cbox, box, lathe, cyl, ring, sphere, cone, prism, gear, liveTex, setGlow, glowMat, torus } from './kit';
import type { ToolSpec } from './model';

export const SCANNER: ToolSpec = {
  id: 'scanner', name: 'Scanner',
  livery: { name: 'teal', hull: R.teal, hullStep: 4, accent: R.bone, accentStep: 5, glow: R.glowTeal },
  pose: { act: 0.6, t: 1.1 },
  build(k: Kit, root: THREE.Group) {
    const det = k.det, seg = det >= 2 ? 22 : det ? 16 : 12;
    // ---------------------------------------------------------------- the housing
    const body = k.group(root, [0, 0, 0]);
    k.mesh(cbox(0.62, 0.3, 0.32, 0.035), 'hull', body);
    // seams: a vertical and a horizontal groove on the +Z face, the same on the top
    k.mesh(box(0.008, 0.26, 0.004), 'ink', body, [-0.08, 0, 0.161]);
    k.mesh(box(0.56, 0.006, 0.004), 'ink', body, [0, -0.07, 0.161]);
    k.mesh(box(0.008, 0.004, 0.28), 'ink', body, [0.12, 0.151, 0]);
    // the side panel: vents, the diode chase, the serial stencil, a barcode
    k.vent(body, 0.16, 0.08, [-0.19, 0.03, 0.162]);
    k.decal(body, { kind: 'stencil', text: 'SCN-3', ramp: R.bone }, 0.18, 0.06, [0.1, 0.04, 0.162]);
    k.decal(body, { kind: 'bar' }, 0.09, 0.035, [0.15, -0.105, 0.162]);
    const chase = [0, 1, 2, 3, 4].map((i) => k.diode(body, [-0.24 + i * 0.04, -0.105, 0.162], 'z', i === 4 ? R.ruby[5] : R.glowTeal[3], 0.011));
    k.bolts(body, [[-0.29, 0.13, 0.162], [0.29, 0.13, 0.162], [-0.29, -0.13, 0.162], [0.29, -0.13, 0.162]], 0.009);
    k.mesh(cbox(0.64, 0.05, 0.34, 0.012), 'frame', body, [0, -0.16, 0]);
    k.mesh(cbox(0.5, 0.04, 0.12, 0.01), 'dark', body, [0, -0.2, 0]);
    k.bolts(body, [[-0.22, -0.183, 0.05], [0.22, -0.183, 0.05], [-0.22, -0.183, -0.05], [0.22, -0.183, -0.05]], 0.01, 'y');
    // ---------------------------------------------------------------- the power pack at the rear, its handle
    const pack = k.group(root, [-0.39, 0.0, 0]);
    k.mesh(cbox(0.16, 0.26, 0.28, 0.025), 'hullDark', pack);
    for (let i = 0; i < 4; i++) k.mesh(box(0.17, 0.012, 0.29), 'frame', pack, [0, -0.09 + i * 0.06, 0]);
    k.decal(pack, { kind: 'bolt', ramp: R.ochre }, 0.06, 0.08, [-0.081, 0.0, 0], [0, -PI / 2, 0]);
    k.mesh(prism([[-0.12, 0], [-0.1, 0.1], [0.12, 0.1], [0.14, 0], [0.1, 0], [0.08, 0.065], [-0.08, 0.065], [-0.09, 0]], 0.036, 0.006), 'frame', root, [-0.28, 0.15, 0]);
    k.mesh(cyl(0.022, 0.16, 10), 'rubber', root, [-0.27, 0.232, 0], AX.x);
    k.cable(root, [[-0.44, -0.1, 0.12], [-0.5, -0.2, 0.16], [-0.38, -0.24, 0.17], [-0.22, -0.12, 0.165]], 0.013);
    // the readout screen on the slanted back
    const scr = liveTex(22, 13);
    const sg = k.group(root, [-0.2, 0.17, -0.02], [-0.6, 0, 0]);
    k.mesh(cbox(0.24, 0.16, 0.03, 0.008), 'frame', sg);
    k.mesh(new THREE.PlaneGeometry(0.2, 0.12), k.ui ? glowScreen(k, scr.t.ui) : new THREE.MeshBasicMaterial({ map: scr.t.world }), sg, [0, 0, 0.016]);
    k.callout('screen', 'READOUT', sg);
    // ---------------------------------------------------------------- the dish mast: a geared turntable, the yoke, the dish
    const mastBase = k.group(root, [0.02, 0.15, 0]);
    k.mesh(cyl(0.07, 0.03, seg, 0.008), 'frame', mastBase, [0, 0.015, 0]);
    const turn = k.group(mastBase, [0, 0.03, 0], [0, 0, 0], { name: 'turntable' });
    k.mesh(gear(0.068, 22, 0.022, { depth: 0.01, holes: 0 }), 'brass', turn, [0, 0.011, 0], [PI / 2, 0, 0]);
    k.mesh(cyl(0.03, 0.12, 12, 0.005), 'steel', turn, [0, 0.07, 0]);
    const drive = k.mesh(gear(0.026, 9, 0.02, { depth: 0.009, holes: 0 }), 'steel', mastBase, [0.092, 0.04, 0.0], [PI / 2, 0, 0]);
    k.mesh(cyl(0.022, 0.05, 10), 'dark', mastBase, [0.092, 0.0, 0]);
    const yoke = k.group(turn, [0, 0.13, 0]);
    for (const s of [-1, 1]) k.mesh(prism([[-0.03, 0], [0.03, 0], [0.02, 0.09], [-0.02, 0.09]], 0.018), 'frame', yoke, [0, 0, s * 0.06]);
    const tilt = k.group(yoke, [0, 0.07, 0], [0, 0, 0], { name: 'dish' });
    k.mesh(cyl(0.012, 0.15, 8), 'chrome', tilt, [0, 0, 0], AX.z);
    const dish = k.group(tilt, [0, 0.01, 0], [0, 0, -0.55]);
    const Rd = 0.19, f = 0.1, pts: [number, number][] = [[0, -0.014]];
    for (let i = 1; i <= 6; i++) { const r = (Rd * i) / 6; pts.push([r, (r * r) / (4 * f) - 0.014]); }
    pts.push([Rd + 0.008, (Rd * Rd) / (4 * f)]);
    for (let i = 6; i >= 0; i--) { const r = (Rd * i) / 6; pts.push([r, (r * r) / (4 * f)]); }
    k.mesh(lathe(pts, seg), 'white', dish);
    k.mesh(torus(Rd + 0.004, 0.009, 6, seg * 2), 'accent2', dish, [0, (Rd * Rd) / (4 * f), 0], [PI / 2, 0, 0]);
    k.mesh(cyl(0.035, 0.03, 12, 0.006), 'frame', dish, [0, 0.008, 0]);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; const st = k.group(dish, [Math.cos(a) * 0.13, 0.043, Math.sin(a) * 0.13]); st.lookAt(new THREE.Vector3(0, 0.12, 0)); k.mesh(cyl(0.006, 0.12, 6), 'steel', st, [0, 0, 0.055], AX.z); }
    const horn = k.mesh(cone(0.028, 0.012, 0.05, 10), 'frame', dish, [0, 0.11, 0]);
    const hornTip = k.mesh(sphere(0.014, 8, 6), k.glow(4, 1), dish, [0, 0.14, 0]);
    k.mesh(cone(0.03, 0.04, 0.012, 12), 'dark', dish, [0, 0.135, 0], [PI, 0, 0]);
    // the sub-reflector (level 3)
    k.mesh(lathe([[0, 0], [0.045, 0.008], [0.05, 0.014], [0, 0.006]], 12), 'chrome', dish, [0, 0.15, 0], [0, 0, 0], { lvl: 3 });
    k.cable(root, [[0.02, 0.18, -0.05], [-0.06, 0.25, -0.1], [-0.08, 0.18, -0.14]], 0.009, 'cable');
    k.callout('dish', 'EMITTER DISH', dish);
    void horn; void drive;
    // ---------------------------------------------------------------- the lens: a bolted yoke and the sweeping barrel
    const ly = k.group(root, [0.33, 0.0, 0]);
    for (const s of [-1, 1]) { k.mesh(prism([[-0.05, -0.13], [0.07, -0.08], [0.07, 0.08], [-0.05, 0.13]], 0.02, 0.005), 'frame', ly, [0, 0, s * 0.15]); k.mesh(cyl(0.03, 0.03, 12, 0.005), 'steel', ly, [0.03, 0, s * 0.165], AX.z); }
    k.mesh(cbox(0.05, 0.03, 0.32, 0.008), 'frame', ly, [-0.02, -0.12, 0]);
    const sweep = k.group(ly, [0.05, 0, 0], [0, 0, 0], { name: 'lens' });
    const barrel = k.group(sweep, [0, 0, 0], AX.x);
    k.mesh(lathe([[0, -0.08], [0.09, -0.08], [0.11, -0.06], [0.11, 0.02], [0.13, 0.04], [0.135, 0.1], [0.12, 0.11], [0.0, 0.11]], seg), 'hull2', barrel);
    k.mesh(ring(0.14, 0.12, 0.024, seg, 0.005), 'brass', barrel, [0, 0.1, 0]);
    k.mesh(ring(0.118, 0.1, 0.02, seg, 0.004), 'ink', barrel, [0, 0.11, 0]);
    const iris = k.group(barrel, [0, 0.113, 0], [0, 0, 0], { name: 'iris' });
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; k.mesh(box(0.05, 0.004, 0.02), 'frame', iris, [Math.cos(a) * 0.085, 0, Math.sin(a) * 0.085], [0, -a + 0.6, 0]); }
    const lensMat = k.glow(3, 0.7, { body: R.water[3] });
    k.mesh(lathe([[0, 0.1], [0.1, 0.1], [0.08, 0.125], [0.0, 0.135]], seg), lensMat, barrel);
    const scan = k.mesh(box(0.012, 0.004, 0.18), k.glow(4, 1.2, { color: 0xe8fff4 }), barrel, [0, 0.13, 0]);
    k.bolts(barrel, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i / 8) * TAU; return [Math.cos(a) * 0.125, 0.04, Math.sin(a) * 0.125] as [number, number, number]; }), 0.008, 'y');
    k.decal(root, { kind: 'warn' }, 0.055, 0.05, [0.31, 0.155, 0.1], [-PI / 2, 0, 0]);
    k.callout('lens', 'SWEEPING LENS', sweep);
    // ---------------------------------------------------------------- the whip antenna
    const ant = k.group(root, [-0.43, 0.13, -0.1]);
    k.mesh(cyl(0.02, 0.03, 10, 0.004), 'frame', ant);
    k.mesh(cone(0.007, 0.003, 0.42, 6), 'dark', ant, [0, 0.22, 0]);
    for (let i = 0; i < 3; i++) k.mesh(cyl(0.009, 0.01, 6), 'steel', ant, [0, 0.08 + i * 0.1, 0], [0, 0, 0], { det: 1 });
    const antTip = k.mesh(sphere(0.016, 8, 6), k.glow(3, 1, { color: R.ruby[5] }), ant, [0, 0.44, 0]);
    k.callout('diodes', 'DIODES', chase[2]);
    // ---------------------------------------------------------------- level 2: the side pod, a second antenna
    const pod = k.group(root, [0.1, 0.12, -0.2], [0, 0, 0], { lvl: 2 });
    k.mesh(box(0.06, 0.04, 0.05), 'frame', pod, [0, -0.02, 0.03]);
    k.mesh(lathe([[0, -0.08], [0.04, -0.08], [0.045, -0.06], [0.045, 0.05], [0.035, 0.07], [0, 0.07]], 12), 'hull', pod, [0, 0.02, 0], AX.x);
    const podLens = k.mesh(cyl(0.028, 0.01, 12), k.glow(3, 0.8), pod, [0.072, 0.02, 0], AX.x);
    const ant2 = k.group(root, [-0.43, 0.13, 0.1], [0, 0, 0], { lvl: 2 });
    k.mesh(cyl(0.016, 0.03, 8), 'frame', ant2);
    k.mesh(cone(0.006, 0.003, 0.3, 6), 'dark', ant2, [0, 0.16, 0]);
    // ---------------------------------------------------------------- level 3: the emitter ring round the lens
    const ringArr = k.group(barrel, [0, 0.06, 0], [0, 0, 0], { lvl: 3 });
    k.mesh(ring(0.17, 0.135, 0.02, seg, 0.004), 'frame', ringArr);
    const emit: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.26; k.mesh(cyl(0.016, 0.03, 8), 'steel', ringArr, [Math.cos(a) * 0.155, 0.02, Math.sin(a) * 0.155]); emit.push(k.mesh(sphere(0.011, 8, 6), k.glow(4, 0.6), ringArr, [Math.cos(a) * 0.155, 0.04, Math.sin(a) * 0.155])); }

    // ---------------------------------------------------------------- the working parts
    let az = 0, ir = 0, sw = 0, scrT = 0, waveOff = 0;
    const P = scr.px, wave: number[] = [];
    return (a) => {
      az += a.dt * (0.5 + a.act * 3.2 + a.chg * 1.4);
      turn.rotation.y = az; drive.rotation.z = -az * (22 / 9);
      tilt.rotation.z = Math.sin(a.t * 1.3) * 0.22 * (0.3 + a.act);
      sw += a.dt * (1.1 + a.act * 2.6);
      sweep.rotation.y = Math.sin(sw) * 0.34 * (0.35 + 0.65 * a.act);
      sweep.rotation.z = Math.sin(sw * 0.5) * 0.06 * a.act;
      ir += a.dt * (0.4 + a.act * 2); iris.rotation.y = ir;
      // the scan line runs over the glass, its width the chord at that height
      const yy = Math.sin(a.t * (2.2 + a.act * 4)) * 0.075, chord = 2 * Math.sqrt(Math.max(0, 0.085 * 0.085 - yy * yy));
      scan.position.set(yy, 0.137, 0); scan.scale.z = Math.max(0.05, chord / 0.18); scan.visible = a.act > 0.05 || a.chg > 0.1;
      setGlow(scan, 0.6 + a.act * 0.9);
      setGlow(lensMat as never, 0); (lensMat as THREE.Material) && setGlowOf(lensMat, 0.35 + a.act * 0.75 + Math.sin(a.t * 31) * 0.06 * a.act);
      setGlow(hornTip, 0.5 + 0.5 * Math.abs(Math.sin(a.t * (2 + a.act * 9))));
      // the diode chase (faster at work), the antenna's slow blink
      const ci = Math.floor(a.t * (3 + a.act * 9)) % 5;
      chase.forEach((d, i) => setGlow(d, i === 4 ? (a.chg > 0.3 ? (Math.sin(a.t * 8) > 0 ? 1 : 0.1) : 0.12) : i === ci ? 1.1 : 0.15));
      setGlow(antTip, (a.t % 1.2) < 0.15 ? 1.3 : 0.1);
      setGlow(podLens, 0.4 + a.act * 0.7);
      emit.forEach((e, i) => setGlow(e, 0.25 + a.act * (0.5 + 0.5 * Math.sin(a.t * 6 - i * 1.05))));
      // the readout: a scrolling return trace over a grid, spikes when it finds something
      scrT += a.dt; if (scrT > 1 / 15) {
        scrT = 0; waveOff++;
        const amp = 1.5 + a.act * 3.5;
        wave.push(Math.round(6 + Math.sin(waveOff * 0.6) * amp * 0.5 + (Math.random() - 0.5) * amp + (waveOff % 17 === 0 ? -4 * a.act : 0)));
        while (wave.length > 20) wave.shift();
        P.rect(0, 0, 22, 13, 0x0c1a16);
        for (let x = 0; x < 22; x += 5) P.vl(x, 0, 12, 0x13302a);
        P.hl(0, 21, 6, 0x13302a);
        wave.forEach((y, i) => { P.set(i + 1, Math.max(1, Math.min(11, y)), R.glowTeal[4]); P.set(i + 1, Math.max(1, Math.min(11, y)) + 1, R.glowTeal[1]); });
        P.rect(17, 1, 4, 2, a.act > 0.5 ? R.glowAmber[3] : R.glowTeal[1]);
        scr.push();
      }
    };
  },
};
function glowScreen(k: Kit, map: THREE.Texture): THREE.Material {
  const m = glowMat(0xffffff, 0.35, k.ui, {}) as THREE.ShaderMaterial;
  if (m.uniforms?.uMap) { m.uniforms.uMap.value = map; m.defines = { ...(m.defines ?? {}), USE_MAP: '' }; m.needsUpdate = true; }
  return m;
}
function setGlowOf(m: THREE.Material, k: number) { const sm = m as THREE.ShaderMaterial, g = m.userData.glow; if (!g) return; if (sm.uniforms?.uEmissive) (sm.uniforms.uEmissive.value as THREE.Vector3).set(g.r * k, g.g * k, g.b * k); else (m as THREE.MeshLambertMaterial).emissiveIntensity = k; }
