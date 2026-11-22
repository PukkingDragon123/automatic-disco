// UI KIT · SCI-FI MECHANICAL HARDWARE (3D, drawn by model3d.ts with a black outline). Machined and anodised housings
// with exposed gear trains that mesh and turn, pistons, sliding clamp jaws, cable runs, glass lenses, status LEDs and
// light strips that glow and pulse. Every moving part is named and driven by an anim function from a small state object
// on root.userData (target angles, clamp and open amounts), so the HUD only sets a value and the hardware moves to it.
//   gearGeo(r, teeth, depth)                        a toothed gear (a hub hole, spokes cut)
//   mTurret(tools[4])  / animTurret                 the tool widget: a four-arm turret on a geared pedestal
//   mCradle(tool, owned) / animCradle               an arsenal mount: hex pad, clamp arms, LED, the tool over it
//   mBay(tool) / animBay                            a quick-slot docking bay: socket ring, four clamps, LED ring
//   mJig(tool) / animJig                            the bench: a turntable between two sliding clamp jaws on rails
//   mGearBox() / animGearBox                        a gear train in an open housing (decor that turns with a value)
//   mPiston() / animPiston                          a hydraulic piston (extends with a value)
import * as THREE from 'three';
import { toon } from './model3d';
import { tex } from './tex3d';
import { P } from './px';

const PI = Math.PI;
type V3 = [number, number, number];
type Build = () => THREE.Object3D | Promise<THREE.Object3D | null>;
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1, name = '') {
  const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(...s);
  if (name) m.name = name; parent.add(m); return m;
}
// anodised and machined finishes
const ANO = () => toon({ map: tex('gun', [3, 1]), color: 0x8fa6c8, metal: 0.55, gloss: 0.5 });          // blue-grey anodised
const ANO2 = () => toon({ map: tex('gun', [3, 1]), color: 0xb0b6c0, metal: 0.6, gloss: 0.4 });
const STEEL = () => toon({ map: tex('steel', [2, 1]), metal: 0.85, gloss: 0.4 });
const DARK = () => toon({ map: tex('darkSteel', [2, 1]), metal: 0.5 });
const BRASS = () => toon({ map: tex('brass', [2, 1]), metal: 0.9 });
const ORANGE = () => toon({ map: tex('orange', [2, 1]), gloss: 0.35 });
const RUB = () => toon({ map: tex('rubber', [2, 1]) });
const glow = (c: number, k = 1) => toon({ color: c, emissive: c, emissiveK: k * 0.6, light: 0.35 });
const cyl = (rt: number, rb: number, h: number, n = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sph = (r: number, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const tor = (r: number, t: number, rs = 6, ts = 24, arc = PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

const gearCache = new Map<string, THREE.BufferGeometry>();
/** a toothed gear lying in the XY plane (thickness along z), centred */
export function gearGeo(r: number, teeth: number, depth = 0.05, toothH = 0.18): THREE.BufferGeometry {
  const k = [r, teeth, depth, toothH].join('|'); const hit = gearCache.get(k); if (hit) return hit;
  const s = new THREE.Shape(), ri = r * (1 - toothH), N = teeth * 4;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * PI * 2, q = i % 4, rr = q === 1 || q === 2 ? r : ri;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.18, 0, PI * 2, true); s.holes.push(hole);
  // four spoke windows
  for (let j = 0; j < 4; j++) { const a0 = (j / 4) * PI * 2 + 0.3, w = new THREE.Path(); const r0 = r * 0.32, r1 = ri * 0.78; w.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0); w.absarc(0, 0, r1, a0, a0 + 0.95, false); w.lineTo(Math.cos(a0 + 0.95) * r0, Math.sin(a0 + 0.95) * r0); w.absarc(0, 0, r0, a0 + 0.95, a0, true); s.holes.push(w); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 }); g.translate(0, 0, -depth / 2);
  gearCache.set(k, g); return g;
}
/** an LED: a small domed lamp in a dark bezel */
function led(parent: THREE.Object3D, p: V3, col: number, name: string, r = 0.028, facing: V3 = [PI / 2, 0, 0]) {
  const g = new THREE.Group(); g.position.set(...p); g.rotation.set(...facing); parent.add(g);
  mesh(cyl(r * 1.5, r * 1.6, r * 0.8, 10), DARK(), g);
  const l = mesh(sph(r, 8, 6), glow(col, 1.2), g, [0, r * 0.4, 0], [0, 0, 0], 1, name);
  l.userData.col = col;
  return l;
}
/** put a (possibly async) tool model into a holder, fitted to a size */
/** put a (possibly async) model into a holder, fitted to a size (exported for scenes that swap what a holder carries) */
export function mountTool(holder: THREE.Object3D, build: Build | null, size: number) { mount(holder, build, size); }
function mount(holder: THREE.Object3D, build: Build | null, size: number) {
  if (!build) return;
  const place = (o: THREE.Object3D | null) => {
    if (!o) return;
    const b = new THREE.Box3().setFromObject(o), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
    const k = size / Math.max(0.001, s.x, s.y, s.z);
    const w = new THREE.Group(); w.add(o); o.position.set(-c.x, -c.y, -c.z); w.scale.setScalar(k);
    holder.add(w); holder.userData.dirty = true;
  };
  try { const r = build(); if (r && typeof (r as Promise<unknown>).then === 'function') void (r as Promise<THREE.Object3D | null>).then(place); else place(r as THREE.Object3D); } catch (e) { console.warn('mount', e); }
}
const ease = (cur: number, goal: number, dt: number, k = 8) => cur + (goal - cur) * Math.min(1, dt * k);
function stepDt(root: THREE.Object3D, t: number) { const last = (root.userData.lt as number) ?? t; root.userData.lt = t; return Math.min(0.1, Math.max(0, t - last)); }
function pulseLeds(root: THREE.Object3D, t: number, states: Record<string, 'on' | 'off' | 'pulse' | 'blink'>) {
  for (const [name, st] of Object.entries(states)) {
    const m = root.getObjectByName(name) as THREE.Mesh | undefined; if (!m) continue;
    const u = (m.material as THREE.ShaderMaterial).uniforms; if (!u?.uEmissive) continue;
    const c = new THREE.Color(m.userData.col ?? 0xffffff);
    const k = st === 'off' ? 0.02 : st === 'on' ? 0.75 : st === 'blink' ? (Math.floor(t * 3) % 2 ? 0.9 : 0.05) : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4));
    u.uEmissive.value.set(c.r * k, c.g * k, c.b * k);
  }
}
// each LED gets its own material (shared toon materials would pulse together)
function ownMat(m: THREE.Mesh) { m.material = (m.material as THREE.ShaderMaterial).clone(); (m.material as THREE.ShaderMaterial).uniforms.uEmissive.value = (m.material as THREE.ShaderMaterial).uniforms.uEmissive.value.clone(); }

// ================================================================== the tool turret (the tool widget)
export interface TurretState { slot: number; locked: boolean; live: boolean; flash: number; rise: number; ang: number; goal: number; leds: boolean[] }
/** run the update(dt, t) of a provided model (and its children) mounted under a holder */
function driveTool(holder: THREE.Object3D | undefined, dt: number, t: number) {
  holder?.traverse((o) => { const up = o.userData?.update as ((dt: number, t: number) => void) | undefined; if (typeof up === 'function') { try { up(dt, t); } catch { /* its own */ } } });
}
/** the CURRENT tool large and alone on a turret head over a geared pedestal; a swap spins the head (driving the gear
 *  train and the piston) and the next tool rises out of the hub */
export function mTurret(tool: Build | null): THREE.Group {
  const g = new THREE.Group();
  // the pedestal: an anodised hexagonal base on a dark foot, a brass top ring, a light strip
  mesh(cyl(0.7, 0.76, 0.1, 6), DARK(), g, [0, 0.05, 0]);
  mesh(cyl(0.62, 0.7, 0.22, 6), ANO(), g, [0, 0.21, 0]);
  mesh(cyl(0.5, 0.56, 0.05, 28), BRASS(), g, [0, 0.345, 0]);
  const strip = mesh(tor(0.53, 0.018, 6, 40), glow(P.glowTeal[3], 1), g, [0, 0.33, 0], [PI / 2, 0, 0], 1, 'strip'); ownMat(strip); strip.userData.col = P.glowTeal[3];
  // the exposed gear train on the front face
  const train = new THREE.Group(); train.position.set(0, 0.2, 0.62); g.add(train);
  mesh(box(0.86, 0.3, 0.02), toon({ color: 0x14171c }), train, [0, 0, -0.012]);
  const gA = mesh(gearGeo(0.13, 14, 0.04), STEEL(), train, [-0.2, 0.01, 0.02], [0, 0, 0], 1, 'gearA');
  const gB = mesh(gearGeo(0.08, 9, 0.04), BRASS(), train, [0, 0.04, 0.02], [0, 0, 0], 1, 'gearB');
  const gC = mesh(gearGeo(0.1, 11, 0.04), STEEL(), train, [0.21, -0.02, 0.02], [0, 0, 0], 1, 'gearC');
  for (const m of [gA, gB, gC]) mesh(cyl(0.025, 0.025, 0.06, 8), BRASS(), m, [0, 0, 0.02], [PI / 2, 0, 0]);
  // slot LEDs (one per quick slot) and a power lamp
  for (let i = 0; i < 4; i++) { const l = led(g, [-0.45 + i * 0.07, 0.29, 0.5], P.malachite[5], 'led' + i, 0.022, [PI / 2 - 0.5, 0, 0]); ownMat(l); }
  { const l = led(g, [0.44, 0.29, 0.5], P.glowAmber[4], 'ledP', 0.03, [PI / 2 - 0.5, 0, 0]); ownMat(l); }
  // the piston on the right flank and a cable run up the back
  const pis = new THREE.Group(); pis.position.set(0.66, 0.16, 0.05); pis.rotation.z = -0.12; g.add(pis);
  mesh(cyl(0.05, 0.05, 0.26, 10), ORANGE(), pis, [0, 0.13, 0]);
  mesh(cyl(0.06, 0.06, 0.03, 10), DARK(), pis, [0, 0.27, 0]);
  mesh(cyl(0.022, 0.022, 0.3, 8), STEEL(), pis, [0, 0.3, 0], [0, 0, 0], 1, 'rod');
  const cab = [new THREE.Vector3(-0.5, 0.2, -0.45), new THREE.Vector3(-0.55, 0.42, -0.35), new THREE.Vector3(-0.3, 0.55, -0.18), new THREE.Vector3(-0.1, 0.5, -0.08)];
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cab), 20, 0.025, 6), RUB(), g);
  // the column and the turret head: a hub with four clamp jaws round the tool's mount, a status lens on a stalk
  mesh(cyl(0.13, 0.16, 0.2, 14), STEEL(), g, [0, 0.45, 0]);
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 0.58; g.add(head);
  mesh(cyl(0.3, 0.34, 0.12, 8), ANO2(), head);
  mesh(cyl(0.22, 0.26, 0.05, 16), DARK(), head, [0, 0.08, 0]);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + PI / 4; mesh(box(0.08, 0.14, 0.12), ORANGE(), head, [Math.cos(a) * 0.27, 0.1, Math.sin(a) * 0.27], [0, -a, 0]); }
  const stalk = new THREE.Group(); stalk.position.set(-0.3, 0.05, -0.12); head.add(stalk);
  mesh(cyl(0.015, 0.015, 0.26, 6), STEEL(), stalk, [0, 0.13, 0]);
  const lens = mesh(sph(0.045, 10, 8), toon({ color: P.glowAmber[3], emissive: P.glowAmber[2], emissiveK: 0.6, gloss: 1 }), stalk, [0, 0.28, 0], [0, 0, 0], 1, 'lens'); ownMat(lens); lens.userData.col = P.glowAmber[3];
  // the tool: large, alone, standing out of the hub (it rises in on a swap)
  const hold = new THREE.Group(); hold.name = 'tool'; hold.position.set(0, 0.62, 0); head.add(hold);
  mount(hold, tool, 1.45);
  g.userData.state = { slot: 0, locked: false, live: false, flash: 0, rise: 1, ang: 0, goal: 0, leds: [true, true, true, true] } as TurretState;
  return g;
}
export function animTurret(root: THREE.Object3D, t: number) {
  const dt = stepDt(root, t), base = root.children[0] ?? root, st = (base.userData.state ?? root.userData.state) as TurretState | undefined; if (!st) return;
  const head = root.getObjectByName('head'), hold = root.getObjectByName('tool'); if (!head) return;
  const a0 = st.ang; st.ang += (st.goal - st.ang) * Math.min(1, dt * 6); const da = st.ang - a0;
  head.rotation.y = st.ang;
  st.rise = Math.min(1, st.rise + dt * 2.4);
  if (hold) { const k = st.rise, e = 1 - (1 - k) * (1 - k); hold.position.y = 0.62 - (1 - e) * 0.55 + Math.sin(k * PI) * 0.06; hold.scale.setScalar(0.35 + 0.65 * e); hold.rotation.y = -st.ang + (1 - e) * 1.2; }
  driveTool(hold, dt, t);
  // the gear train meshes with the head; the piston pumps while it turns
  const gA = root.getObjectByName('gearA'), gB = root.getObjectByName('gearB'), gC = root.getObjectByName('gearC'), rod = root.getObjectByName('rod');
  base.userData.gear = ((base.userData.gear as number) ?? 0) + da * 3 + dt * 0.25;
  const gr = base.userData.gear as number;
  if (gA) gA.rotation.z = gr; if (gB) gB.rotation.z = -gr * (14 / 9) + 0.2; if (gC) gC.rotation.z = -gr * (14 / 11);
  base.userData.pump = ease((base.userData.pump as number) ?? 0, Math.min(1, Math.abs(st.goal - st.ang) * 1.5), dt, 6);
  if (rod) rod.position.y = 0.3 + (base.userData.pump as number) * 0.14;
  const leds: Record<string, 'on' | 'off' | 'pulse' | 'blink'> = {};
  for (let i = 0; i < 4; i++) leds['led' + i] = !st.leds[i] ? 'off' : i === st.slot ? (st.live ? 'blink' : 'on') : 'pulse';
  leds.ledP = Math.abs(st.goal - st.ang) > 0.02 || st.rise < 1 ? 'blink' : 'on';
  leds.strip = st.live ? 'on' : 'pulse';
  leds.lens = st.live ? 'blink' : st.locked ? 'off' : st.flash > performance.now() / 1000 ? 'on' : 'pulse';
  pulseLeds(root, t, leds);
}

// ================================================================== the arsenal's cradle
export function mCradle(tool: Build | null, owned = true): THREE.Group {
  const g = new THREE.Group();
  mesh(cyl(0.42, 0.46, 0.08, 6), DARK(), g, [0, 0.04, 0]);
  mesh(cyl(0.36, 0.4, 0.06, 6), ANO(), g, [0, 0.11, 0]);
  const ring = mesh(tor(0.3, 0.014, 6, 30), glow(owned ? P.glowTeal[3] : P.ruby[3], 1), g, [0, 0.145, 0], [PI / 2, 0, 0], 1, 'ring'); ownMat(ring); ring.userData.col = owned ? P.glowTeal[3] : P.ruby[3];
  // two clamp arms rising from the pad, hinged at their feet
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.name = 'clamp' + (s < 0 ? 'L' : 'R'); arm.position.set(s * 0.3, 0.14, 0); g.add(arm);
    mesh(box(0.06, 0.34, 0.1), STEEL(), arm, [0, 0.17, 0]);
    mesh(box(0.12, 0.05, 0.12), ORANGE(), arm, [-s * 0.05, 0.34, 0]);
    mesh(cyl(0.035, 0.035, 0.12, 8), BRASS(), arm, [0, 0, 0], [PI / 2, 0, 0]);
  }
  const l = led(g, [0, 0.1, 0.4], owned ? P.malachite[5] : P.ruby[4], 'led', 0.03, [PI / 2 - 0.3, 0, 0]); ownMat(l);
  const hold = new THREE.Group(); hold.name = 'tool'; hold.position.y = 0.58; g.add(hold);
  mount(hold, tool, 0.9);
  g.userData.state = { open: 0, hot: false, owned };
  return g;
}
export function animCradle(root: THREE.Object3D, t: number, hot: boolean) {
  const dt = stepDt(root, t), s = (root.children[0]?.userData.state ?? root.userData.state) as { open: number; owned: boolean } | undefined; if (!s) return;
  s.open = ease(s.open, hot ? 1 : 0, dt, 6);
  const L = root.getObjectByName('clampL'), R = root.getObjectByName('clampR'), tool = root.getObjectByName('tool');
  if (L) L.rotation.z = 0.05 + s.open * 0.5; if (R) R.rotation.z = -0.05 - s.open * 0.5;
  if (tool) { tool.position.y = 0.58 + s.open * 0.08 + Math.sin(t * 2) * 0.01 * s.open; tool.rotation.y = s.open * Math.sin(t * 0.8) * 0.4; }
  pulseLeds(root, t, { led: s.owned ? (hot ? 'on' : 'pulse') : 'blink', ring: hot ? 'on' : 'pulse' });
}

// ================================================================== a quick-slot docking bay
export function mBay(tool: Build | null): THREE.Group {
  const g = new THREE.Group();
  mesh(cyl(0.5, 0.55, 0.12, 8), DARK(), g, [0, 0.06, 0]);
  mesh(cyl(0.44, 0.48, 0.08, 24), ANO2(), g, [0, 0.16, 0]);
  mesh(cyl(0.34, 0.34, 0.09, 24, true), toon({ color: 0x0d1014 }), g, [0, 0.16, 0]);
  const ring = mesh(tor(0.38, 0.02, 6, 32), glow(P.glowAmber[3], 1), g, [0, 0.205, 0], [PI / 2, 0, 0], 1, 'ring'); ownMat(ring); ring.userData.col = P.glowAmber[3];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2 + PI / 4, c = new THREE.Group(); c.name = 'jaw' + i; c.position.set(Math.cos(a) * 0.44, 0.2, Math.sin(a) * 0.44); c.rotation.y = -a; g.add(c); mesh(box(0.12, 0.14, 0.08), ORANGE(), c, [0, 0.06, 0]); mesh(box(0.13, 0.03, 0.09), DARK(), c, [0, 0.14, 0]); }
  const hold = new THREE.Group(); hold.name = 'tool'; hold.position.y = 0.55; g.add(hold);
  mount(hold, tool, 0.9);
  g.userData.state = { cur: false, drop: 0 };
  return g;
}
export function animBay(root: THREE.Object3D, t: number, hot: boolean) {
  const dt = stepDt(root, t), s = (root.children[0]?.userData.state ?? root.userData.state) as { cur: boolean; drop: number } | undefined; if (!s) return;
  s.drop = ease(s.drop, hot ? 1 : 0, dt, 7);
  for (let i = 0; i < 4; i++) { const j = root.getObjectByName('jaw' + i); if (j) j.position.y = 0.2 + s.drop * 0.06; }
  pulseLeds(root, t, { ring: s.cur ? 'on' : hot ? 'pulse' : 'off' });
}

// ================================================================== the bench's jig
export function mJig(tool: Build | null): THREE.Group {
  const g = new THREE.Group();
  // the bed: a dark machined slab with two rails and a hazard edge
  mesh(box(1.9, 0.12, 0.9), DARK(), g, [0, 0.06, 0]);
  mesh(box(1.92, 0.03, 0.06), toon({ map: tex('hazard', [6, 0.4]) }), g, [0, 0.1, 0.43]);
  for (const z of [-0.2, 0.2]) mesh(cyl(0.035, 0.035, 1.7, 10), STEEL(), g, [0, 0.16, z], [0, 0, PI / 2]);
  // the turntable
  const tt = new THREE.Group(); tt.name = 'table'; tt.position.y = 0.14; g.add(tt);
  mesh(cyl(0.38, 0.4, 0.06, 32), ANO(), tt, [0, 0.03, 0]);
  const ring = mesh(tor(0.39, 0.015, 6, 40), glow(P.glowTeal[3], 1), tt, [0, 0.05, 0], [PI / 2, 0, 0], 1, 'ring'); ownMat(ring); ring.userData.col = P.glowTeal[3];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; mesh(box(0.06, 0.02, 0.12), BRASS(), tt, [Math.cos(a) * 0.3, 0.07, Math.sin(a) * 0.3], [0, -a, 0]); }
  // the two clamp jaws on their carriages (slide in along x)
  for (const s of [-1, 1]) {
    const j = new THREE.Group(); j.name = 'jaw' + (s < 0 ? 'L' : 'R'); j.position.set(s * 0.72, 0.16, 0); g.add(j);
    mesh(box(0.22, 0.12, 0.6), ANO2(), j, [0, 0.06, 0]);
    mesh(box(0.08, 0.36, 0.5), ORANGE(), j, [-s * 0.08, 0.3, 0]);
    mesh(box(0.03, 0.3, 0.44), RUB(), j, [-s * 0.135, 0.3, 0]);
    // a lead screw and a gear on the carriage
    mesh(cyl(0.025, 0.025, 0.5, 8), STEEL(), j, [s * 0.2, 0.06, 0.32], [0, 0, PI / 2]);
    const gr = mesh(gearGeo(0.1, 12, 0.04), BRASS(), j, [s * 0.05, 0.12, 0.33], [0, 0, 0], 1, 'gear' + (s < 0 ? 'L' : 'R'));
    mesh(cyl(0.02, 0.02, 0.06, 8), STEEL(), gr, [0, 0, 0.02], [PI / 2, 0, 0]);
    const l = led(j, [0, 0.14, 0.3], P.malachite[5], 'led' + (s < 0 ? 'L' : 'R'), 0.028, [PI / 2 - 0.4, 0, 0]); ownMat(l);
  }
  const hold = new THREE.Group(); hold.name = 'tool'; hold.position.y = 0.58; tt.add(hold);
  mount(hold, tool, 0.8);
  g.userData.state = { clamp: 1, spin: 0, flash: 0 };
  return g;
}
export function animJig(root: THREE.Object3D, t: number, hot: boolean) {
  const dt = stepDt(root, t), s = (root.children[0]?.userData.state ?? root.userData.state) as { clamp: number; spin: number; flash: number; c?: number } | undefined; if (!s) return;
  s.c = ease(s.c ?? 0, s.clamp, dt, 7);
  const L = root.getObjectByName('jawL'), R = root.getObjectByName('jawR'), tt = root.getObjectByName('table');
  const x = 0.86 - s.c * 0.24;
  if (L) L.position.x = -x; if (R) R.position.x = x;
  const gl = root.getObjectByName('gearL'), gr = root.getObjectByName('gearR');
  if (gl) gl.rotation.z = -x * 14; if (gr) gr.rotation.z = x * 14;
  s.spin += dt * (hot ? 1.2 : 0.35);
  if (tt) tt.rotation.y = s.spin;
  const locked = s.c > 0.9;
  pulseLeds(root, t, { ledL: locked ? 'on' : 'blink', ledR: locked ? 'on' : 'blink', ring: s.flash > performance.now() / 1000 ? 'on' : 'pulse' });
}

// ================================================================== decor: a gear train, a piston
export function mGearBox(): THREE.Group {
  const g = new THREE.Group();
  mesh(box(0.9, 1.1, 0.12), DARK(), g, [0, 0.55, -0.08]);
  mesh(box(0.96, 0.06, 0.2), ANO(), g, [0, 1.1, 0]); mesh(box(0.96, 0.06, 0.2), ANO(), g, [0, 0.02, 0]);
  const gears: [number, number, number, number, string][] = [[0.22, 18, -0.14, 0.78, 'g0'], [0.13, 11, 0.2, 0.9, 'g1'], [0.18, 15, 0.16, 0.46, 'g2'], [0.11, 9, -0.2, 0.3, 'g3']];
  for (const [r, n, x, y, name] of gears) { const m = mesh(gearGeo(r, n, 0.05), name === 'g1' || name === 'g3' ? BRASS() : STEEL(), g, [x, y, 0.02], [0, 0, 0], 1, name); mesh(cyl(0.03, 0.03, 0.08, 8), BRASS(), m, [0, 0, 0.03], [PI / 2, 0, 0]); }
  const l = led(g, [0.32, 0.16, 0.0], P.glowAmber[4], 'led', 0.03, [PI / 2, 0, 0]); ownMat(l);
  g.userData.state = { v: 0 };
  return g;
}
export function animGearBox(root: THREE.Object3D, t: number) {
  const s = (root.children[0]?.userData.state ?? root.userData.state) as { v: number } | undefined; if (!s) return;
  const a = s.v + t * 0.2, set = (n: string, k: number) => { const o = root.getObjectByName(n); if (o) o.rotation.z = a * k; };
  set('g0', 1); set('g1', -18 / 11); set('g2', -18 / 15); set('g3', 18 / 9);
  pulseLeds(root, t, { led: 'pulse' });
}
export function mPiston(): THREE.Group {
  const g = new THREE.Group();
  mesh(cyl(0.12, 0.14, 0.12, 10), DARK(), g, [0, 0.06, 0]);
  mesh(cyl(0.09, 0.09, 0.7, 12), ORANGE(), g, [0, 0.47, 0]);
  mesh(cyl(0.1, 0.1, 0.05, 12), DARK(), g, [0, 0.84, 0]);
  const rod = new THREE.Group(); rod.name = 'rod'; g.add(rod);
  mesh(cyl(0.04, 0.04, 0.8, 10), STEEL(), rod, [0, 1.0, 0]);
  mesh(cyl(0.1, 0.1, 0.1, 10), DARK(), rod, [0, 1.42, 0]);
  g.userData.state = { v: 0 };
  return g;
}
export function animPiston(root: THREE.Object3D) {
  const s = (root.children[0]?.userData.state ?? root.userData.state) as { v: number } | undefined; if (!s) return;
  const r = root.getObjectByName('rod'); if (r) r.position.y = -0.55 + s.v * 0.55;
}
