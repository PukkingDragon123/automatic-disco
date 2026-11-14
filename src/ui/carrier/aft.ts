// Aft of the forward hull: the neck fairing, then the open truss spine (longerons, frames, cross bracing) with
// the pressurised crawlway tube, propellant and coolant mains and cable trays running down it; the rotating
// habitat ring on its hub; the container racks under a travelling gantry; the propellant farm (cream spheres
// strutted off the truss, a manifold loop and valves at each station); the radiator wings; then the shadow
// shield, the sooted reactor drum with its coolant loops and catwalk, the thrust frame, the main bell and four
// verniers, and the two outrigger engine nacelles on their pylons.
import * as THREE from 'three';
import { Builder, TAU, type V } from './geo';
import { V3, railing, flood, rcs, pipe, ventBox, hatch, decal, container, tank, type Ctx } from './kit';
import { sec } from './fore';
import { NAV } from './fx';

export const SPINE = { z0: -56, z1: -129, yc: -1, hw: 5, hh: 5 };
export const EZ = { shield: -129, drum0: -133, drum1: -151, frame: -155, bell1: -168, nacZ: -146, nacX: 32, nacY: -3 };

export interface AftOut { ring: Builder; gantry: Builder; bells: [number, number, number, number, number][]; anchors: Record<string, V> }

export function buildAft(C: Ctx): AftOut {
  const { B, L, s } = C, fx = C.fx;
  const hullA = s('hullA'), hullB = s('hullB'), truss = s('truss', 32), gun = s('gunC', 8), steel = s('steelC', 8), haz = s('haz', 16);
  const yc = SPINE.yc;

  // ================================================================ the neck fairing from the hull to the truss
  const neck = [{ z: -50, pts: sec(13, 9, -16, 3, 4) }, { z: -54, pts: sec(10, 6.5, -10, 2.6, 3) }, { z: -58, pts: sec(7.2, 4.8, -6.8, 1.6, 1.6) }];
  B.loft(hullA, neck, { caps: false }); L.loft(hullA, neck, { caps: false });
  B.poly(hullB, sec(7.2, 4.8, -6.8, 1.6, 1.6).map(([x, y]) => new V3(x, y, -58)), new V3(0, -1, -50));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) rcs(B, s, new V3(sx * 7.6, sy > 0 ? 5.6 : -7.6, -55), new V3(sx, sy, -0.2).normalize());

  // ================================================================ the truss spine
  const z0 = SPINE.z0, z1 = SPINE.z1, hw = SPINE.hw, top = yc + 5, bot = yc - 5;
  const cor: [number, number][] = [[-hw, bot], [hw, bot], [hw, top], [-hw, top]];
  for (const [x, y] of cor) { B.boxAt(truss, x - 0.45, y - 0.45, z1, x + 0.45, y + 0.45, z0, { bev: 0.1 }); L.boxAt(truss, x - 0.45, y - 0.45, z1, x + 0.45, y + 0.45, z0); }
  const bay = 6;
  for (let z = z0 - 1; z > z1; z -= bay) {
    for (let i = 0; i < 4; i++) {
      const [xa, ya] = cor[i], [xb, yb] = cor[(i + 1) % 4];
      B.beam(truss, new V3(xa, ya, z), new V3(xb, yb, z), 0.5);
      if (z - bay > z1) {
        B.beam(steel, new V3(xa, ya, z), new V3(xb, yb, z - bay), 0.16);
        B.beam(steel, new V3(xb, yb, z), new V3(xa, ya, z - bay), 0.16);
      }
      B.at(xa, ya, z); B.box(gun, 1.3, 1.3, 0.9, { bev: 0.15 }); B.pop();
    }
  }
  // crawlway tube with flanges and a porthole line, mains, cable trays
  B.in(0, yc, (z0 + z1) / 2, Math.PI / 2, 0, 0, () => B.cyl(hullA, 2.3, 2.3, z0 - z1, 16, { caps: false }));
  L.in(0, yc, (z0 + z1) / 2, Math.PI / 2, 0, 0, () => L.cyl(hullA, 2.3, 2.3, z0 - z1, 8, { caps: false }));
  for (let z = z0 - 4; z > z1; z -= 6) B.in(0, yc, z, Math.PI / 2, 0, 0, () => B.cyl(gun, 2.55, 2.55, 0.5, 16));
  for (const sx of [-1, 1]) B.in(sx * 2.32, yc + 0.4, (z0 + z1) / 2 + 8, 0, sx * Math.PI / 2, 0, () => B.panel(s('port', 16), 40, 0.7, 40 * 16 / 64));
  for (const sx of [-1, 1]) {
    pipe(B, s('pipeRed', 32), gun, [new V3(sx * 3.1, yc + 3.1, z0 + 2), new V3(sx * 3.1, yc + 3.1, z1 - 1)], 0.5, 3);
    pipe(B, s('pipeBrass', 32), gun, [new V3(sx * 3.3, yc - 3.4, z0 + 2), new V3(sx * 3.3, yc - 3.4, z1 - 1)], 0.42, 3);
    B.boxAt(s('gunC', 8), sx * 1.4 - 0.35, top + 0.45, z1, sx * 1.4 + 0.35, top + 0.75, z0, { bev: 0.05 });
  }
  // floodlights on the truss: one onto the hab hub, two onto the propellant farm
  flood(C, new V3(-hw - 0.6, top + 0.8, -60), new V3(-6, yc + 3, -66), { len: 10, spread: 0.32 });
  flood(C, new V3(hw + 0.6, top + 0.8, -94), new V3(9, yc + 8, -101), { len: 12, spread: 0.3 });
  flood(C, new V3(-hw - 0.6, bot - 0.8, -94), new V3(-9, yc - 8, -101), { len: 12, spread: 0.3 });
  for (const z of [-62, -96, -122]) for (const sx of [-1, 1]) fx.halos.push({ p: new V3(sx * (hw + 0.6), top + 0.6, z), col: NAV.warm, size: 0.8, mode: 0, ph: 0 });
  decal(B, s, 'tProp', new V3(-hw - 0.47, yc, -108), new V3(-1, 0, 0), 9);
  decal(B, s, 'tProp', new V3(hw + 0.47, yc, -108), new V3(1, 0, 0), 9);

  // ================================================================ the habitat ring: hub (static), ring and spokes (rotating)
  const HZ = -68;
  B.in(0, yc, HZ, Math.PI / 2, 0, 0, () => { B.cyl(hullA, 4.4, 4.4, 8, 18); for (const y of [-3.6, 3.6]) { B.at(0, y, 0); B.cyl(gun, 4.75, 4.75, 0.7, 18); B.pop(); } B.at(0, 4.3, 0); B.cyl(haz, 4.5, 4.5, 0.5, 18, { caps: false }); B.pop(); });
  L.in(0, yc, HZ, Math.PI / 2, 0, 0, () => L.cyl(hullA, 4.4, 4.4, 8, 10));
  const ring = new Builder();
  {
    const r = ring, R0 = 18.6, N = 20, dA = TAU / N, chord = 2 * R0 * Math.sin(dA / 2) + 0.15;
    for (let i = 0; i < N; i++) {
      const a = i * dA;
      r.push(new THREE.Matrix4().makeRotationZ(a).setPosition(0, 0, 0));
      r.at(R0, 0, 0, 0, 0, 0);
      r.box(s('olive', 16), 3.6, chord, 5.2, { bev: 0.25, side: s('olive', 16) });
      r.at(1.82, 0, 0, 0, Math.PI / 2, Math.PI / 2); r.panel(s('winHab', 16), 4.4, 1.2, 4.4 * 16 / 128); r.pop();
      for (const sz of [-1, 1]) { r.at(0.3, 0, sz * 2.62, 0, sz > 0 ? 0 : Math.PI, Math.PI / 2); r.panel(s('port', 16), chord - 1.2, 0.8, (chord - 1.2) * 16 / 64); r.pop(); }
      r.pop();
      // joint collar between segments
      r.push(new THREE.Matrix4().makeRotationZ(a + dA / 2)); r.at(R0, 0, 0); r.box(s('hullB', 16), 4.1, 0.9, 5.8, { bev: 0.15 }); r.pop(); r.pop();
      r.pop();
    }
    for (let k = 0; k < 4; k++) {
      const a = k * TAU / 4 + TAU / 8, d = new V3(Math.cos(a), Math.sin(a), 0);
      r.tube(s('hullA', 16), [d.clone().multiplyScalar(4.9), d.clone().multiplyScalar(16.9)], 1.1, 10);
      for (const t of [6.5, 11, 15.5]) { r.push(new THREE.Matrix4().makeRotationZ(a - Math.PI / 2).setPosition(d.x * t, d.y * t, 0)); r.cyl(gun, 1.3, 1.3, 0.4, 10); r.pop(); }
      const side = new V3(-d.y, d.x, 0).multiplyScalar(1.3);
      r.beam(steel, d.clone().multiplyScalar(5).add(side), d.clone().multiplyScalar(16.8).add(side), 0.08);
    }
    r.at(0, 0, 0, Math.PI / 2, 0, 0); r.cyl(gun, 4.9, 4.9, 3.0, 18); r.pop();
    for (const a of [0.3, 2.2, 4.0]) { r.push(new THREE.Matrix4().makeRotationZ(a)); decal(r, s, 'tHab', new V3(R0 - 1.1, 0, 2.66), new V3(0, 0, 1), 5, new V3(1, 0, 0)); r.pop(); }
  }
  L.in(0, yc, HZ, 0, 0, 0, () => { for (let i = 0; i < 10; i++) { L.push(new THREE.Matrix4().makeRotationZ(i * TAU / 10)); L.at(18.6, 0, 0); L.box(s('olive', 16), 3.6, 11.8, 5.2); L.pop(); L.pop(); } });

  // ================================================================ container racks under a travelling gantry
  const RZ0 = -76, RZ1 = -92;
  {
    const kinds = ['contOlive', 'contRust', 'contBlue'] as const;
    const put = (x: number, y: number, z: number, k: number) => { B.at(x, y, z); container(B, s, kinds[k % 3]); B.pop(); };
    put(-1.4, top + 1.95, -83, 0); put(1.4, top + 1.95, -85, 1); put(0, top + 4.55, -84.5, 2);
    put(-1.4, bot - 1.95, -84, 2); put(1.4, bot - 1.95, -83.2, 0);
    for (const sx of [-1, 1]) put(sx * (hw + 2.0), yc, -84 + sx * 0.8, sx > 0 ? 1 : 2);
    L.boxAt(s('contOlive'), -2.8, top + 0.65, -91, 2.8, top + 5.8, -77); L.boxAt(s('contBlue'), -2.8, bot - 3.3, -90, 2.8, bot - 0.6, -78);
    // rack beams the containers sit on
    for (const z of [RZ0 - 1, RZ1 + 1]) { B.beam(gun, new V3(-3, top + 0.55, z), new V3(3, top + 0.55, z), 0.3); B.beam(gun, new V3(-3, bot - 0.55, z), new V3(3, bot - 0.55, z), 0.3); }
    // gantry rails on posts
    for (const sx of [-1, 1]) {
      B.beam(s('ochreC', 8), new V3(sx * 3.6, top + 7.9, RZ0 + 1), new V3(sx * 3.6, top + 7.9, RZ1 - 1), 0.35);
      for (const z of [RZ0 + 1, RZ1 - 1]) B.beam(gun, new V3(sx * 3.6, top + 0.45, z), new V3(sx * 3.6, top + 7.8, z), 0.3);
    }
  }
  const gantry = new Builder();
  {
    const g = gantry, och = s('ochreC', 8);
    g.box(och, 8.0, 0.6, 0.9, { bev: 0.08 });
    for (const sx of [-1, 1]) { g.at(sx * 3.6, -0.5, 0); g.box(s('gunC', 8), 0.6, 0.5, 1.6, { bev: 0.06 }); g.pop(); }
    g.at(0.8, -0.6, 0); g.box(s('gunC', 8), 1.2, 0.6, 1.1, { bev: 0.08 }); g.pop();
    g.rod(s('rubber', 1), new V3(0.8, -0.9, 0), new V3(0.8, -2.0, 0), 0.03, 4);
    g.at(0.8, -2.2, 0); g.box(s('gunC', 8), 0.5, 0.4, 0.5); g.pop();
  }

  // ================================================================ the propellant farm: two stations of four spheres
  for (const tz of [-101, -113]) {
    for (const [ox, oy] of [[-9, 9], [9, 9], [-9, -9], [9, -9]] as [number, number][]) {
      const cx = ox, cy = yc + oy, up = oy > 0;
      B.at(cx, cy, tz, up ? 0 : Math.PI, 0, 0); tank(B, s, 5); B.pop();
      L.at(cx, cy, tz); L.sphere(s('tank'), 5, 10, 6); L.pop();
      // struts from the truss corner and the frame to the girth ring
      const corner = new V3(Math.sign(ox) * hw, Math.sign(oy) * 5 + yc, tz);
      for (const dz of [-2.5, 2.5]) B.beam(gun, corner.clone().setZ(tz + dz), new V3(cx - Math.sign(ox) * 4.5, cy, tz + dz * 0.8), 0.3);
      // outlet down to the manifold loop
      const outlet = new V3(cx, cy - Math.sign(oy) * 5.6, tz);
      pipe(B, s('pipeRed', 32), gun, [outlet, new V3(cx, yc + Math.sign(oy) * 2.6, tz), new V3(Math.sign(ox) * 6.6, yc + Math.sign(oy) * 2.6, tz)], 0.35, 2, 0.5);
    }
    // manifold loop round the truss and its valves
    const m = 6.6, loop = [new V3(-m, yc - m, tz), new V3(m, yc - m, tz), new V3(m, yc + m, tz), new V3(-m, yc + m, tz), new V3(-m, yc - m, tz)];
    pipe(B, s('pipeRed', 32), gun, loop, 0.38, 3, 1.0);
    for (const [x, y] of [[-m, yc], [m, yc]] as [number, number][]) {
      B.at(x, y, tz); B.box(s('redC', 8), 1.1, 1.1, 1.1, { bev: 0.12 }); B.at(Math.sign(x) * 0.8, 0, 0, 0, 0, Math.PI / 2); B.cyl(steel, 0.08, 0.08, 0.6, 6); B.at(0, 0.35, 0); B.cyl(s('brassC', 4), 0.45, 0.45, 0.08, 10); B.pop(); B.pop(); B.pop();
      B.beam(gun, new V3(x, y, tz), new V3(Math.sign(x) * hw, y, tz), 0.15);
    }
  }
  fx.vents.push({ p: new V3(-6.6, yc + 6.6, -107), dir: new V3(-0.6, 1, 0), period: 15, ph: 3, size: 1.8 });

  // ================================================================ radiator wings
  for (const sx of [-1, 1]) {
    const rz0 = -116.5, rz1 = -128.5, y = yc;
    pipe(B, s('pipeBrass', 32), gun, [new V3(sx * (hw + 0.4), y + 0.6, rz0), new V3(sx * 46.5, y + 0.6, rz0)], 0.55, 4);
    pipe(B, s('pipeBrass', 32), gun, [new V3(sx * (hw + 0.4), y + 0.6, rz1), new V3(sx * 46.5, y + 0.6, rz1)], 0.55, 4);
    for (const [x0, x1] of [[6.5, 19], [19.6, 32.4], [33, 46]]) {
      B.boxAt(s('radiator', 16), sx * x0, y - 0.13, rz1 + 0.5, sx * x1, y + 0.13, rz0 - 0.5, { side: gun });
      B.boxAt(gun, sx * x0, y - 0.2, rz0 - 0.7, sx * x1, y + 0.2, rz0 - 0.4);
      B.boxAt(gun, sx * x0, y - 0.2, rz1 + 0.4, sx * x1, y + 0.2, rz1 + 0.7);
      L.boxAt(s('radiator', 16), sx * x0, y - 0.13, rz1 + 0.5, sx * x1, y + 0.13, rz0 - 0.5);
    }
    for (const x of [19.3, 32.7]) B.beam(steel, new V3(sx * x, y + 0.6, rz0), new V3(sx * x, y + 0.6, rz1), 0.12);
    B.beam(gun, new V3(sx * hw, top, -118), new V3(sx * 20, y + 0.4, -122), 0.25);
    B.beam(gun, new V3(sx * hw, bot, -118), new V3(sx * 20, y - 0.4, -122), 0.25);
    fx.halos.push({ p: new V3(sx * 46.8, y + 0.9, rz0), col: sx < 0 ? NAV.red : NAV.green, size: 1.6, mode: 1, ph: 2.2 });
    fx.halos.push({ p: new V3(sx * 46.8, y + 0.9, rz1), col: NAV.white, size: 1.4, mode: 2, ph: sx > 0 ? 0.5 : 0 });
  }

  // ================================================================ shadow shield
  {
    const prof: [number, number][] = [[3.0, 0], [11.6, 0], [12.6, -0.9], [12.6, -3.0], [11.8, -3.9], [9.6, -3.9]];
    B.in(0, yc, EZ.shield, -Math.PI / 2, 0, 0, () => { B.lathe(hullB, prof.map(([r, y]) => [r, -y]), 28); });
    B.in(0, yc, EZ.shield, Math.PI / 2, 0, 0, () => { B.cyl(hullB, 11.6, 11.6, 0.05, 28); });
    L.in(0, yc, EZ.shield - 2, Math.PI / 2, 0, 0, () => L.cyl(hullB, 12.6, 12.6, 4, 12));
    B.in(0, yc, EZ.shield - 1.9, Math.PI / 2, 0, 0, () => B.cyl(haz, 12.65, 12.65, 0.9, 28, { caps: false }));
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; B.in(Math.cos(a) * 10.6, yc + Math.sin(a) * 10.6, EZ.shield + 0.15, 0, 0, 0, () => B.box(gun, 0.5, 0.5, 0.3)); }
    decal(B, s, 'tReactor', new V3(0, yc + 8.2, EZ.shield + 0.02), new V3(0, 0, 1), 11);
    decal(B, s, 'tRad', new V3(0, yc - 8.2, EZ.shield + 0.02), new V3(0, 0, 1), 8);
    for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + TAU / 8; rcs(B, s, new V3(Math.cos(a) * 12.4, yc + Math.sin(a) * 12.4, EZ.shield - 2), new V3(Math.cos(a), Math.sin(a), 0)); }
  }

  // ================================================================ the reactor drum: sooted, ringed, coolant loops, a catwalk
  const dz0 = EZ.drum0, dz1 = EZ.drum1, dl = dz0 - dz1, dzc = (dz0 + dz1) / 2;
  B.in(0, yc, dzc, Math.PI / 2, 0, 0, () => B.cyl(s('scorch', 16), 9.6, 9.6, dl, 24, { caps: false, v0: 0.002, vlen: 0.996 }));
  L.in(0, yc, dzc, Math.PI / 2, 0, 0, () => L.cyl(s('scorch', 16), 9.6, 9.6, dl, 10, { caps: false, v0: 0.002, vlen: 0.996 }));
  for (const z of [dz0 - 1.2, dz0 - 6, dz0 - 11, dz1 + 1.2]) B.in(0, yc, z, Math.PI / 2, 0, 0, () => B.cyl(gun, 10.0, 10.0, 0.7, 24));
  for (let k = 0; k < 6; k++) {
    const a = k * TAU / 6 + 0.25, c = Math.cos(a), sn = Math.sin(a);
    pipe(B, s('pipeBrass', 32), gun, [new V3(c * 10.4, yc + sn * 10.4, dz1 + 2.5), new V3(c * 10.4, yc + sn * 10.4, dz0 - 2), new V3(c * 11.5, yc + sn * 11.5, dz0 + 0.5), new V3(c * 11.5, yc + sn * 11.5, EZ.shield + 0.6)], 0.38, 3, 0.8);
  }
  // coolant mains forward to the radiator headers
  for (const sx of [-1, 1]) pipe(B, s('pipeBrass', 32), gun, [new V3(sx * 9.8, yc + 1.5, dz0 - 3), new V3(sx * 13.6, yc + 1.5, dz0 - 3), new V3(sx * 13.6, yc + 0.6, -128.5), new V3(sx * 13.6, yc + 0.6, -116.5)], 0.5, 3, 1.2);
  // catwalk round the drum
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * TAU, c = Math.cos(a), sn = Math.sin(a);
    B.push(new THREE.Matrix4().makeRotationZ(a).setPosition(c * 10.9, yc + sn * 10.9, dz0 - 8.5)); B.box(s('grate', 32), 0.12, 2.75, 1.6); B.pop();
    B.beam(steel, new V3(c * 10.2, yc + sn * 10.2, dz0 - 8.5), new V3(c * 10.95, yc + sn * 10.95, dz0 - 8.5), 0.06);
    B.beam(steel, new V3(c * 10.95, yc + sn * 10.95, dz0 - 7.7), new V3(c * 12.0, yc + sn * 12.0, dz0 - 7.7), 0.04);
  }
  for (const z of [dz0 - 7.75, dz0 - 9.25]) for (let k = 0; k < 24; k++) {
    const a0 = (k / 24) * TAU, a1 = ((k + 1) / 24) * TAU;
    B.beam(steel, new V3(Math.cos(a0) * 12.0, yc + Math.sin(a0) * 12.0, z), new V3(Math.cos(a1) * 12.0, yc + Math.sin(a1) * 12.0, z), 0.04);
  }
  const onDrum = (a: number, z: number, r: number, f: () => void) => { B.push(new THREE.Matrix4().makeRotationZ(a).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)).setPosition(Math.cos(a) * r, yc + Math.sin(a) * r, z)); f(); B.pop(); };
  for (const sx of [-1, 1]) {
    const a0 = sx < 0 ? Math.PI : 0;
    decal(B, s, 'insignia', new V3(sx * 9.62, yc, dzc + 4), new V3(sx, 0, 0), 7);
    onDrum(a0 - sx * 0.45, dzc - 3, 9.7, () => hatch(B, s, sx < 0 ? 4 : 5, 2.2));
    onDrum(a0 + sx * 0.7, dz0 - 3.5, 9.75, () => ventBox(B, s, 2.0, 1.2, 2));
    const va = a0 + sx * 0.7;
    fx.vents.push({ p: new V3(Math.cos(va) * 10.4, yc + Math.sin(va) * 10.4, dz0 - 3.5), dir: new V3(Math.cos(va), Math.sin(va), 0), period: 7 + sx, ph: sx > 0 ? 1 : 4.5, size: 2.4 });
  }
  decal(B, s, 'tBlast', new V3(0, yc + 9.62, dz1 + 2.5), new V3(0, 1, 0), 8, new V3(0, 0, 1));

  // ================================================================ thrust frame, main bell, verniers
  const fz = EZ.frame;
  B.at(0, yc, (dz1 + fz) / 2); B.prism(hullB, Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * TAU + TAU / 16; return [Math.cos(a) * 9.4, Math.sin(a) * 9.4] as [number, number]; }), -(dz1 - fz) / 2, (dz1 - fz) / 2); B.pop();
  L.at(0, yc, (dz1 + fz) / 2); L.prism(hullB, Array.from({ length: 8 }, (_, k) => { const a = (k / 8) * TAU + TAU / 16; return [Math.cos(a) * 9.4, Math.sin(a) * 9.4] as [number, number]; }), -(dz1 - fz) / 2, (dz1 - fz) / 2); L.pop();
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + TAU / 16; B.beam(gun, new V3(Math.cos(a) * 8.2, yc + Math.sin(a) * 8.2, fz), new V3(Math.cos(a) * 3.2, yc + Math.sin(a) * 3.2, fz - 3.2), 0.35); }
  const bells: [number, number, number, number, number][] = [];
  const bell = (x: number, y: number, z: number, r0: number, r1: number, len: number, lod: boolean) => {
    const prof: [number, number][] = []; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([r0 + (r1 - r0) * Math.pow(t, 0.62), t * len]); }
    B.in(x, y, z, -Math.PI / 2, 0, 0, () => {
      B.lathe(s('nozzle', 16), prof, 24, { fit: true });
      B.lathe(s('nozIn', 16), prof.map(([r, yy]) => [r * 0.94, yy]), 24, { fit: true, flip: true });
      B.at(0, -0.35, 0); B.cyl(gun, r0 * 1.25, r0 * 1.25, 0.8, 16); B.pop();
      B.at(0, len - 0.25, 0); B.cyl(s('dark', 1), r1 * 1.02, r1 * 1.03, 0.5, 24, { caps: false }); B.pop();
      B.at(0, 0.06, 0); B.cyl(s('lensAmber', 1), r0 * 0.95, r0 * 0.95, 0.04, 16); B.pop();
    });
    if (lod) L.in(x, y, z - len / 2, -Math.PI / 2, 0, 0, () => L.cyl(s('nozzle', 16), r0, r1, len, 10, { caps: false }));
    bells.push([x, y, z, r1, len]);
  };
  bell(0, yc, fz - 0.8, 2.8, 7.4, 13, true);
  for (let k = 0; k < 4; k++) {
    const a = k * TAU / 4 + TAU / 8, x = Math.cos(a) * 9.0, y = yc + Math.sin(a) * 9.0;
    bell(x, y, fz - 0.4, 1.0, 2.3, 4.6, false);
  }
  // gimbal actuators on the main bell
  for (let k = 0; k < 4; k++) { const a = k * TAU / 4; B.beam(s('brassC', 4), new V3(Math.cos(a) * 6.6, yc + Math.sin(a) * 6.6, fz), new V3(Math.cos(a) * 4.0, yc + Math.sin(a) * 4.0, fz - 4.5), 0.28); }

  // ================================================================ outrigger nacelles on pylons
  for (const sx of [-1, 1]) {
    const nx = sx * EZ.nacX, ny = EZ.nacY, nz = EZ.nacZ;
    // the pylon: a thick wing from the drum to the nacelle, coolant pipes along it
    const pyl: [number, number][] = [[-134, 0.8], [-136.5, 1.5], [-146, 1.5], [-149.5, 0.5], [-149.5, -0.5], [-146, -1.5], [-136.5, -1.5], [-134, -0.8]];
    B.push(new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(0, 1, 0), new V3(1, 0, 0)).setPosition(0, (yc + ny) / 2 - 0.5, 0));
    B.prism(hullB, pyl, sx < 0 ? -28 : 9.2, sx < 0 ? -9.2 : 28);
    B.pop();
    L.push(new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(0, 1, 0), new V3(1, 0, 0)).setPosition(0, (yc + ny) / 2 - 0.5, 0)); L.prism(hullB, pyl, sx < 0 ? -28 : 9.2, sx < 0 ? -9.2 : 28); L.pop();
    pipe(B, s('pipeBrass', 32), gun, [new V3(sx * 9.8, -0.6, -139), new V3(sx * 28, -0.6, -139)], 0.35, 3);
    pipe(B, s('pipeRed', 32), gun, [new V3(sx * 9.8, -0.6, -143.5), new V3(sx * 28, -0.6, -143.5)], 0.3, 3);
    railing(B, steel, new V3(sx * 11, -1.0, -136.9), new V3(sx * 27, -1.0, -136.9));
    // the nacelle body: domed nose with a red band, plated barrel, finned tail, its bell
    const prof: [number, number][] = [[0.01, 0], [2.4, 0.5], [3.7, 1.6], [4.4, 3.2], [4.7, 5.2], [4.7, 20], [4.4, 23], [3.8, 25]];
    B.in(nx, ny, -129.5, -Math.PI / 2, 0, 0, () => {
      B.lathe(hullA, prof.slice(0, 5), 20);
      B.at(0, 12.6, 0); B.cyl(hullB, 4.7, 4.7, 14.8, 20, { caps: false }); B.pop();
      B.at(0, 5.6, 0); B.cyl(s('redC', 8), 4.75, 4.75, 0.9, 20, { caps: false }); B.pop();
      B.lathe(s('scorch', 16), prof.slice(5).reverse(), 20, { fit: true, flip: true });
      B.at(0, 25, 0); B.cyl(gun, 3.8, 3.8, 0.1, 20); B.pop();
      for (const y of [8, 12.5, 17]) { B.at(0, y, 0); B.cyl(gun, 4.85, 4.85, 0.45, 20); B.pop(); }
      for (let k = 0; k < 6; k++) { const a = k * TAU / 6; B.at(Math.cos(a) * 4.6, 22.5, Math.sin(a) * 4.6, 0, -a, 0); B.box(hullB, 2.2, 3.4, 0.25, { bev: 0.05 }); B.pop(); }
    });
    L.in(nx, ny, -141, -Math.PI / 2, 0, 0, () => L.cyl(hullB, 4.7, 4.0, 24, 10));
    bell(nx, ny, -154.5, 2.1, 3.7, 6.5, true);
    decal(B, s, 'tUSPC', new V3(nx + sx * 4.72, ny + 0.5, nz + 6), new V3(sx, 0, 0), 7);
    B.in(nx + sx * 4.7, ny - 2.0, nz - 1, 0, sx * Math.PI / 2, 0, () => ventBox(B, s, 2.4, 1.0, 0));
    // running lights on the outboard side, strobes at the tails
    fx.halos.push({ p: new V3(nx + sx * 5.0, ny + 2.2, -134), col: sx < 0 ? NAV.red : NAV.green, size: 2.0, mode: 1, ph: 0.6 });
    B.in(nx + sx * 4.6, ny + 2.2, -134, 0, 0, Math.PI / 2, () => B.cyl(s(sx < 0 ? 'lensRed' : 'lensGreen', 1), 0.35, 0.35, 0.8, 8));
    fx.halos.push({ p: new V3(nx, ny + 4.9, -152), col: NAV.white, size: 2.0, mode: 2, ph: sx > 0 ? 0.25 : 0.75 });
    flood(C, new V3(sx * 10.2, 1.0, -135), new V3(nx, ny + 2, -140), { len: 16, spread: 0.22 });
  }
  return { ring, gantry, bells, anchors: { ring: new V3(0, yc, HZ), gantry: new V3(0, top + 7.4, -84), engine: new V3(0, yc, -170) } };
}
