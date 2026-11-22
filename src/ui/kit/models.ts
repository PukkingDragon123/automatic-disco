// UI KIT · MODELS. The detailed little 3D objects the HUD shows (drawn by model3d.ts with a black outline): the five
// dock icons (a blueprint sheet with its roll, pencil, rule and a nut; a brass-and-enamel microscope with a specimen
// slide and a flask; an olive soldier helmet with goggles, chin strap and a radio; a gene tank with a curled embryo in
// lit fluid; the research ship with its hab ring), the nine colony tools, the storage crate and its goods. Built from
// primitives with painted pixel textures (tex3d.ts), each part placed by hand.
//   DOCK_MODELS[id]()   TOOL_MODELS[toolId]()   mCrate()   mCustomTool(parts)
import * as THREE from 'three';
import { toon, type ToonOpts } from './model3d';
import { tex, blueprintTex, rollEndTex, pencilTex, rulerTex, helmetTex, hullTex, dialTex } from './tex3d';
import { P } from './px';

type V3 = [number, number, number];
const PI = Math.PI;
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent: THREE.Object3D, p: V3 = [0, 0, 0], r: V3 = [0, 0, 0], s: V3 | number = 1) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p); m.rotation.set(...r);
  if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(...s);
  parent.add(m);
  return m;
}
const T = (name: string, rep: [number, number] = [1, 1], o: ToonOpts = {}) => toon({ map: tex(name, rep), ...o });
const C = (color: number, o: ToonOpts = {}) => toon({ color, ...o });
const glow = (color: number, k = 1) => toon({ color, emissive: color, emissiveK: k * 0.55, light: 0.4 });
const cyl = (rt: number, rb: number, h: number, n = 16, open = false) => new THREE.CylinderGeometry(rt, rb, h, n, 1, open);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sph = (r: number, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const tor = (r: number, t: number, rs = 8, ts = 20, arc = PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);

// ================================================================== BUILD: the blueprint
export function mBlueprint(): THREE.Group {
  const g = new THREE.Group();
  // the sheet: flat, its back edge curling up and over into a loose roll
  const geo = new THREE.PlaneGeometry(1.3, 0.95, 1, 28); geo.rotateX(-PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute, zc = -0.18, rc = 0.11;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z < zc) { const s = zc - z, a = Math.min(s / rc, PI * 1.6); pos.setZ(i, zc - rc * Math.sin(a) - Math.max(0, s - rc * PI * 1.6) * 0); pos.setY(i, rc * (1 - Math.cos(a))); }
  }
  geo.computeVertexNormals();
  mesh(geo, toon({ map: blueprintTex(), side: THREE.DoubleSide, gloss: 0.05 }), g, [0, 0.005, 0.05]);
  // the second roll, lying across, a red band round it
  const roll = new THREE.Group(); g.add(roll); roll.position.set(0.18, 0.085, 0.3); roll.rotation.set(0, 0.42, 0);
  const rm = [toon({ map: tex('ochreWood', [1, 1]), color: 0x9fb8e0 }), toon({ map: rollEndTex() }), toon({ map: rollEndTex() })];
  rm[0] = toon({ map: blueprintTex(), color: 0xd8e4ff });
  mesh(cyl(0.08, 0.08, 0.98, 18), rm, roll, [0, 0, 0], [0, 0, PI / 2]);
  mesh(tor(0.083, 0.012, 6, 18), C(P.ruby[4], { gloss: 0.4 }), roll, [0.22, 0, 0], [0, PI / 2, 0]);
  mesh(tor(0.083, 0.012, 6, 18), C(P.ruby[4], { gloss: 0.4 }), roll, [-0.28, 0, 0], [0, PI / 2, 0]);
  // the pencil
  const pen = new THREE.Group(); g.add(pen); pen.position.set(-0.28, 0.03, 0.22); pen.rotation.set(0, -0.6, 0);
  mesh(cyl(0.028, 0.028, 0.5, 6), toon({ map: pencilTex() }), pen, [0, 0, 0], [0, 0, PI / 2]);
  mesh(cyl(0.028, 0.005, 0.09, 6), C(P.fur[5]), pen, [0.295, 0, 0], [0, 0, -PI / 2]);
  mesh(cyl(0.008, 0.001, 0.03, 6), C(P.ink[1]), pen, [0.345, 0, 0], [0, 0, -PI / 2]);
  mesh(cyl(0.03, 0.03, 0.05, 8), T('brass', [2, 1], { metal: 0.8 }), pen, [-0.27, 0, 0], [0, 0, PI / 2]);
  mesh(cyl(0.027, 0.027, 0.05, 8), C(P.coral[5]), pen, [-0.32, 0, 0], [0, 0, PI / 2]);
  // the steel rule
  const rule = mesh(box(0.9, 0.012, 0.075), [C(P.steel[3], { metal: 0.6 }), C(P.steel[3], { metal: 0.6 }), toon({ map: rulerTex(), metal: 0.5 }), C(P.steel[2]), C(P.steel[3]), C(P.steel[3])], g, [-0.05, 0.012, -0.1], [0, 0.08, 0]);
  void rule;
  // a hex nut and a bolt
  mesh(cyl(0.065, 0.065, 0.04, 6), T('steel', [1, 1], { metal: 0.8 }), g, [0.42, 0.025, -0.02], [0, 0.3, 0]);
  mesh(cyl(0.03, 0.03, 0.045, 12), C(P.ink[0]), g, [0.42, 0.03, -0.02]);
  const bolt = new THREE.Group(); g.add(bolt); bolt.position.set(0.48, 0.035, 0.12); bolt.rotation.set(0, -0.9, PI / 2);
  mesh(cyl(0.05, 0.05, 0.035, 6), T('steel', [1, 1], { metal: 0.8 }), bolt, [0, 0.12, 0]);
  mesh(cyl(0.024, 0.024, 0.22, 10), T('knurlSteel', [2, 3], { metal: 0.8 }), bolt, [0, 0, 0]);
  return g;
}

// ================================================================== RESEARCH: the microscope
export function mMicroscope(): THREE.Group {
  const g = new THREE.Group();
  const en = T('teal', [3, 1], { gloss: 0.45 }), brass = T('brass', [2, 1], { metal: 0.9 }), dark = T('gun', [2, 1], { metal: 0.4, gloss: 0.5 }), knurl = T('knurl', [2, 1], { metal: 0.9 });
  // the foot: a heavy enamel horseshoe on a steel plinth
  mesh(cyl(0.36, 0.4, 0.05, 24), T('darkSteel', [4, 1], { metal: 0.5 }), g, [0, 0.025, 0], [0, 0, 0], [1, 1, 0.78]);
  mesh(cyl(0.32, 0.35, 0.07, 24), en, g, [0, 0.085, -0.02], [0, 0, 0], [1, 1, 0.74]);
  // the pillar and the curved arm
  mesh(box(0.13, 0.26, 0.15), en, g, [0, 0.24, -0.17]);
  const arm = mesh(tor(0.24, 0.06, 8, 18, 1.95), en, g, [0, 0.4, -0.02], [0, PI / 2, 0]);
  void arm;
  // focus knobs (coarse brass, fine steel) on both sides of the pillar
  for (const s of [-1, 1]) {
    mesh(cyl(0.075, 0.075, 0.045, 16), [knurl, brass, brass], g, [s * 0.1, 0.3, -0.17], [0, 0, PI / 2]);
    mesh(cyl(0.04, 0.04, 0.03, 12), [T('knurlSteel', [1, 1], { metal: 0.8 }), C(P.steel[5], { metal: 0.8 }), C(P.steel[5])], g, [s * 0.14, 0.3, -0.17], [0, 0, PI / 2]);
  }
  // the stage with its clips, a slide with a stained sample
  mesh(box(0.38, 0.035, 0.3), T('rubber', [2, 2]), g, [0, 0.36, 0.08]);
  for (const s of [-1, 1]) mesh(box(0.025, 0.012, 0.12), C(P.steel[5], { metal: 0.9 }), g, [s * 0.09, 0.385, 0.06], [0, s * 0.2, 0]);
  mesh(box(0.22, 0.008, 0.075), [C(P.sky[4]), C(P.sky[4]), toon({ color: P.sky[5], gloss: 0.8 }), C(P.sky[3]), C(P.sky[4]), C(P.sky[4])], g, [0, 0.384, 0.08]);
  mesh(cyl(0.025, 0.025, 0.004, 10), C(P.plum[5]), g, [0.02, 0.39, 0.08]);
  // the lamp under the stage
  mesh(cyl(0.07, 0.075, 0.05, 14), dark, g, [0, 0.15, 0.08]);
  mesh(cyl(0.055, 0.055, 0.012, 14), toon({ map: tex('amberLens'), emissive: P.glowAmber[3], emissiveK: 0.5 }), g, [0, 0.18, 0.08]);
  // the tube, tipped toward the viewer: eyepiece, brass rings, the nosepiece and three objectives
  const tube = new THREE.Group(); g.add(tube); tube.position.set(0, 0.6, 0.09); tube.rotation.set(0.32, 0, 0);
  mesh(cyl(0.062, 0.062, 0.36, 16), dark, tube, [0, 0.02, 0]);
  mesh(cyl(0.07, 0.07, 0.03, 16), brass, tube, [0, -0.15, 0]);
  mesh(cyl(0.068, 0.068, 0.02, 16), brass, tube, [0, 0.12, 0]);
  mesh(cyl(0.046, 0.05, 0.13, 14), dark, tube, [0, 0.26, 0]);
  mesh(tor(0.046, 0.016, 6, 16), C(P.basalt[2]), tube, [0, 0.33, 0], [PI / 2, 0, 0]);
  mesh(cyl(0.035, 0.035, 0.005, 12), toon({ map: tex('lens'), emissive: P.glowTeal[2], emissiveK: 0.35 }), tube, [0, 0.33, 0]);
  const nose = new THREE.Group(); tube.add(nose); nose.position.set(0, -0.19, 0); nose.rotation.set(-0.32, 0, 0);
  mesh(cyl(0.085, 0.07, 0.05, 16), brass, nose, [0, 0, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.4, ob = new THREE.Group(); nose.add(ob); ob.rotation.set(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35);
    mesh(cyl(0.026, 0.02, 0.1, 10), i === 0 ? T('steel', [1, 1], { metal: 0.9 }) : brass, ob, [0, -0.07, 0]);
    mesh(cyl(0.028, 0.028, 0.012, 10), C(i === 0 ? P.ruby[4] : P.ochre[5]), ob, [0, -0.04, 0]);
  }
  // a round flask on the foot, half full of lit green
  const pts = [[0, 0], [0.1, 0.005], [0.15, 0.05], [0.16, 0.11], [0.13, 0.17], [0.07, 0.21], [0.045, 0.24], [0.045, 0.34], [0.055, 0.35], [0.05, 0.36]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(pts, 16), toon({ map: tex('flask', [2, 1]), emissive: P.glowTeal[1], emissiveK: 0.3, gloss: 0.9 }), g, [-0.25, 0.12, 0.17], [0, 0, 0], 0.62);
  mesh(cyl(0.032, 0.036, 0.04, 10), C(P.fur[4]), g, [-0.25, 0.345, 0.17]);
  return g;
}

// ================================================================== TROOPS: the helmet
export function mHelmet(): THREE.Group {
  const g = new THREE.Group();
  const ol = toon({ map: helmetTex(), gloss: 0.25 }), olD = T('olive', [4, 1], { gloss: 0.2, color: 0xd8d8c8 });
  mesh(new THREE.SphereGeometry(0.5, 28, 14, 0, PI * 2, 0, PI / 2), ol, g, [0, 0, 0], [0, PI * 0.25, 0], [1, 0.84, 1.08]);
  // the flared brim and its rolled steel edge
  const prof = [[0.495, 0.0], [0.54, -0.03], [0.6, -0.055], [0.62, -0.07], [0.6, -0.078], [0.5, -0.04]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(new THREE.LatheGeometry(prof, 28), olD, g, [0, 0, 0], [0, 0, 0], [1, 1, 1.08]);
  mesh(tor(0.615, 0.014, 6, 32), T('darkSteel', [8, 1], { metal: 0.7 }), g, [0, -0.074, 0], [PI / 2, 0, 0], [1, 1.08, 1]);
  // the goggle strap round the dome, the goggles on the front
  mesh(tor(0.465, 0.03, 6, 32), T('rubber', [8, 1]), g, [0, 0.17, 0], [PI / 2 + 0.05, 0, 0], [1, 1.08, 1]);
  for (const s of [-1, 1]) {
    const gg = new THREE.Group(); g.add(gg); gg.position.set(s * 0.12, 0.23, 0.46); gg.rotation.set(-0.35, s * 0.2, 0);
    mesh(cyl(0.1, 0.11, 0.07, 16), [T('rubber', [2, 1]), C(P.basalt[2]), C(P.basalt[2])], gg, [0, 0, 0], [PI / 2, 0, 0]);
    mesh(tor(0.085, 0.016, 6, 16), T('brass', [2, 1], { metal: 0.9 }), gg, [0, 0, 0.037]);
    mesh(cyl(0.078, 0.078, 0.01, 16), toon({ map: tex('amberLens'), emissive: P.glowAmber[2], emissiveK: 0.4, gloss: 1 }), gg, [0, 0, 0.038], [PI / 2, 0, 0]);
  }
  mesh(box(0.06, 0.04, 0.05), T('rubber', [1, 1]), g, [0, 0.24, 0.5], [-0.35, 0, 0]);
  // the chin strap hanging under, a brass buckle
  mesh(tor(0.36, 0.022, 5, 22, PI), toon({ map: tex('leather', [4, 1]) }), g, [0, -0.05, 0.04], [0.25, 0, PI]);
  mesh(box(0.07, 0.05, 0.03), T('brass', [1, 1], { metal: 0.9 }), g, [0, -0.405, 0.13], [0.25, 0, 0]);
  // a radio box clipped on the side, its whip antenna with a red tip lamp
  const rad = new THREE.Group(); g.add(rad); rad.position.set(0.5, 0.12, -0.12); rad.rotation.set(0, -0.5, -0.12);
  mesh(box(0.1, 0.17, 0.13), T('gun', [1, 1], { metal: 0.4 }), rad);
  mesh(box(0.012, 0.1, 0.09), C(P.steel[5], { metal: 0.8 }), rad, [0.056, 0, 0]);
  for (let i = 0; i < 3; i++) mesh(box(0.014, 0.008, 0.07), C(P.ink[0]), rad, [0.064, -0.03 + i * 0.03, 0]);
  mesh(cyl(0.006, 0.008, 0.52, 6), C(P.steel[2], { metal: 0.7 }), rad, [0.02, 0.33, -0.04], [-0.25, 0, -0.08]);
  mesh(sph(0.02, 8, 6), glow(P.ruby[5], 1.2), rad, [0.04, 0.585, -0.105]);
  return g;
}

// ================================================================== LAB: the gene tank
export function mGeneTank(): THREE.Group {
  const g = new THREE.Group();
  const st = T('steel', [5, 1], { metal: 0.7 }), dk = T('darkSteel', [5, 1], { metal: 0.6 }), brass = T('brass', [4, 1], { metal: 0.9 });
  // the base: steel drum, a hazard band, a brass collar, a dial and two lamps
  mesh(cyl(0.37, 0.41, 0.17, 24), st, g, [0, 0.085, 0]);
  mesh(cyl(0.412, 0.412, 0.04, 24, true), T('hazard', [6, 0.5]), g, [0, 0.03, 0]);
  mesh(cyl(0.34, 0.36, 0.05, 24), brass, g, [0, 0.195, 0]);
  mesh(cyl(0.065, 0.065, 0.025, 16), [C(P.steel[2]), toon({ map: dialTex() }), C(P.steel[2])], g, [0.12, 0.1, 0.36], [PI / 2, 0, 0]);
  mesh(sph(0.025, 8, 6), glow(P.malachite[5], 1.3), g, [-0.08, 0.12, 0.38]);
  mesh(sph(0.025, 8, 6), glow(P.ruby[4], 0.6), g, [-0.16, 0.12, 0.355]);
  // the creature inside: a curled embryo with a big head and a coiled tail
  const cr = new THREE.Group(); g.add(cr); cr.position.set(0, 0.56, 0); cr.name = 'embryo';
  const fl = toon({ color: P.flesh[4], emissive: P.coral[2], emissiveK: 0.4, gloss: 0.5 });
  mesh(sph(0.1, 14, 10), fl, cr, [0, 0, 0], [0, 0, 0.4], [1, 1.25, 0.95]);
  mesh(sph(0.085, 14, 10), fl, cr, [0.06, 0.14, 0.02]);
  mesh(sph(0.018, 6, 5), C(P.ink[0]), cr, [0.11, 0.16, 0.07]);
  mesh(tor(0.075, 0.032, 6, 14, PI * 1.4), fl, cr, [-0.03, -0.1, 0], [0, 0, 2.4]);
  mesh(cyl(0.012, 0.012, 0.22, 6), C(P.plum[4]), cr, [0.02, -0.25, 0], [0, 0, 0.15]);
  // bubbles (animated by the view)
  const bub = new THREE.Group(); bub.name = 'bubbles'; g.add(bub);
  for (let i = 0; i < 9; i++) mesh(sph(0.016 + (i % 3) * 0.006, 6, 5), glow(0xd8ffd8, 0.9), bub, [Math.cos(i * 2.4) * 0.2, 0.25 + ((i * 0.083) % 0.6), Math.sin(i * 2.4) * 0.2]);
  // the glass column of lit fluid (see-through: the embryo shows)
  mesh(cyl(0.3, 0.3, 0.72, 28, true), toon({ map: tex('fluid', [2, 1]), emissive: P.malachite[2], emissiveK: 0.55, opacity: 0.62, gloss: 1, rim: 0.4 }), g, [0, 0.58, 0]);
  // three steel struts holding the cap
  for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2 + 0.5; mesh(box(0.035, 0.74, 0.035), dk, g, [Math.cos(a) * 0.315, 0.58, Math.sin(a) * 0.315], [0, -a, 0]); }
  // the cap: a steel ring, a dome, a red valve wheel, pipes down the back
  mesh(cyl(0.34, 0.37, 0.09, 24), st, g, [0, 0.985, 0]);
  mesh(new THREE.SphereGeometry(0.26, 20, 8, 0, PI * 2, 0, PI / 2), dk, g, [0, 1.03, 0], [0, 0, 0], [1, 0.5, 1]);
  mesh(cyl(0.012, 0.012, 0.1, 6), C(P.steel[4], { metal: 0.8 }), g, [0, 1.19, 0]);
  mesh(tor(0.07, 0.013, 6, 18), C(P.ruby[4], { gloss: 0.5 }), g, [0, 1.24, 0], [PI / 2, 0, 0]);
  for (let i = 0; i < 4; i++) mesh(box(0.13, 0.01, 0.012), C(P.ruby[3]), g, [0, 1.24, 0], [0, (i * PI) / 4, 0]);
  const pipe = T('copper', [1, 4], { metal: 0.8 });
  mesh(tor(0.16, 0.032, 8, 14, PI / 2), pipe, g, [0, 0.86, -0.36], [0, PI / 2, 0]);
  mesh(cyl(0.032, 0.032, 0.66, 10), pipe, g, [0, 0.52, -0.52]);
  mesh(tor(0.12, 0.032, 8, 12, PI / 2), pipe, g, [0, 0.2, -0.4], [PI, PI / 2, 0]);
  for (const y of [0.35, 0.7]) mesh(cyl(0.045, 0.045, 0.03, 10), brass, g, [0, y, -0.52]);
  return g;
}
/** the gene tank's living parts (bubbles rise, the embryo turns and breathes) */
export function animGeneTank(root: THREE.Object3D, t: number) {
  const b = root.getObjectByName('bubbles'), e = root.getObjectByName('embryo');
  b?.children.forEach((m, i) => { m.position.y = 0.25 + ((t * (0.12 + (i % 3) * 0.04) + i * 0.083) % 0.66); });
  if (e) { e.rotation.y = Math.sin(t * 0.6) * 0.5; const s = 1 + Math.sin(t * 1.7) * 0.03; e.scale.setScalar(s); }
}

// ================================================================== SHIP: the research ship
export function mShip(): THREE.Group {
  const g = new THREE.Group();
  const hull = toon({ map: hullTex(), gloss: 0.5 }), st = T('steel', [3, 1], { metal: 0.7 }), dk = T('darkSteel', [3, 1], { metal: 0.6 }), wh = T('white', [2, 2], { gloss: 0.4 });
  // the fuselage
  mesh(new THREE.CapsuleGeometry(0.2, 0.95, 8, 18), hull, g, [0, 0, 0], [0, 0, PI / 2], [1, 1, 0.92]);
  // the cockpit canopy
  mesh(new THREE.SphereGeometry(0.15, 16, 8, 0, PI * 2, 0, PI / 2), toon({ map: tex('glass', [2, 1]), emissive: P.sky[1], emissiveK: 0.4, gloss: 1, rim: 0.3 }), g, [0.5, 0.1, 0], [0, 0, -0.35], [1.5, 0.75, 0.9]);
  // the engine block and three glowing nozzles
  mesh(cyl(0.21, 0.24, 0.24, 18), dk, g, [-0.66, 0, 0], [0, 0, PI / 2]);
  for (const [y, z] of [[0.07, 0.1], [0.07, -0.1], [-0.1, 0]]) {
    mesh(cyl(0.075, 0.095, 0.13, 14, true), st, g, [-0.82, y, z], [0, 0, PI / 2]);
    mesh(cyl(0.07, 0.07, 0.01, 14), glow(P.glowAmber[4], 1.6), g, [-0.87, y, z], [0, 0, PI / 2]);
  }
  // swept wings with orange tips and nav lights
  const wing = new THREE.Shape(); wing.moveTo(0, 0); wing.lineTo(0.42, 0); wing.lineTo(0.12, 0.5); wing.lineTo(-0.08, 0.5); wing.closePath();
  const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.03, bevelEnabled: false });
  for (const s of [-1, 1]) {
    const w = mesh(wg, wh, g, [-0.35, -0.05, s * 0.15], [s * PI / 2, 0, 0]);
    w.scale.set(1, 1, 1);
    mesh(box(0.2, 0.034, 0.07), T('orange', [1, 1]), g, [-0.32, -0.045, s * 0.63]);
    mesh(sph(0.022, 8, 6), glow(s > 0 ? P.malachite[5] : P.ruby[5], 1.3), g, [-0.22, -0.04, s * 0.665]);
  }
  // the tail fin
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(0.3, 0); fin.lineTo(0.05, 0.3); fin.lineTo(-0.06, 0.3); fin.closePath();
  mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.025, bevelEnabled: false }), wh, g, [-0.7, 0.15, -0.012]);
  mesh(box(0.1, 0.03, 0.03), T('orange', [1, 1]), g, [-0.72, 0.44, 0]);
  // the hab ring on four spokes with its modules
  const ring = new THREE.Group(); ring.name = 'ring'; g.add(ring); ring.position.set(-0.08, 0, 0);
  mesh(tor(0.4, 0.038, 8, 36), st, ring, [0, 0, 0], [0, PI / 2, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * PI * 2 + PI / 4;
    mesh(box(0.025, 0.38, 0.025), dk, ring, [0, Math.cos(a) * 0.2, Math.sin(a) * 0.2], [a, 0, 0]);
    mesh(box(0.1, 0.08, 0.1), wh, ring, [0, Math.cos(a + PI / 4) * 0.4, Math.sin(a + PI / 4) * 0.4], [a + PI / 4, 0, 0]);
    mesh(box(0.102, 0.012, 0.03), glow(P.glowAmber[3], 0.8), ring, [0, Math.cos(a + PI / 4) * 0.4, Math.sin(a + PI / 4) * 0.4], [a + PI / 4, 0, 0]);
  }
  // a dish on a mast, a beacon
  mesh(cyl(0.012, 0.012, 0.16, 6), dk, g, [0.12, 0.26, 0]);
  mesh(cyl(0.11, 0.015, 0.05, 14), wh, g, [0.12, 0.35, 0], [0.4, 0, 0.3]);
  mesh(sph(0.018, 6, 5), glow(0xffffff, 1), g, [0.2, 0.2, 0]);
  return g;
}
export function animShip(root: THREE.Object3D, t: number) { const r = root.getObjectByName('ring'); if (r) r.rotation.x = t * 0.6; }

// ================================================================== the tools
const steel = () => T('steel', [2, 1], { metal: 0.75 }), dark = () => T('darkSteel', [2, 1], { metal: 0.5 }), rub = () => T('rubber', [2, 1]);
function grip(g: THREE.Object3D, p: V3, r: V3 = [0, 0, 0]) {
  const h = new THREE.Group(); g.add(h); h.position.set(...p); h.rotation.set(...r);
  mesh(box(0.13, 0.34, 0.11), rub(), h, [0, -0.17, 0]);
  for (let i = 0; i < 4; i++) mesh(box(0.135, 0.018, 0.115), C(P.basalt[1]), h, [0, -0.07 - i * 0.07, 0]);
  mesh(box(0.05, 0.1, 0.03), T('orange', [1, 1]), h, [0.09, -0.06, 0], [0, 0, 0.3]);
  return h;
}
export function mScanner(): THREE.Group {
  const g = new THREE.Group();
  mesh(box(0.62, 0.26, 0.22), T('olive', [3, 1], { gloss: 0.3 }), g, [0.05, 0.36, 0]);
  mesh(box(0.5, 0.05, 0.2), dark(), g, [0.05, 0.515, 0]);
  grip(g, [-0.08, 0.24, 0], [0, 0, -0.15]);
  // the lens barrel and its glowing glass
  mesh(cyl(0.13, 0.15, 0.14, 18), steel(), g, [0.42, 0.36, 0], [0, 0, PI / 2]);
  mesh(tor(0.12, 0.02, 6, 18), T('brass', [2, 1], { metal: 0.9 }), g, [0.49, 0.36, 0], [0, PI / 2, 0]);
  mesh(cyl(0.11, 0.11, 0.01, 18), toon({ map: tex('lens'), emissive: P.glowTeal[3], emissiveK: 0.6, gloss: 1 }), g, [0.495, 0.36, 0], [0, 0, PI / 2]);
  // the screen on top, an antenna, a dial
  mesh(box(0.26, 0.012, 0.15), [C(P.ink[0]), C(P.ink[0]), toon({ map: tex('screen'), emissive: P.glowTeal[0], emissiveK: 0.6 }), C(P.ink[0]), C(P.ink[0]), C(P.ink[0])], g, [-0.02, 0.545, 0]);
  mesh(cyl(0.008, 0.01, 0.3, 6), dark(), g, [-0.18, 0.66, -0.06], [0, 0, 0.3]);
  mesh(sph(0.022, 8, 6), glow(P.ruby[5], 1), g, [-0.225, 0.81, -0.06]);
  mesh(cyl(0.04, 0.04, 0.03, 12), [T('knurl', [1, 1], { metal: 0.9 }), C(P.brass[5], { metal: 0.9 }), C(P.brass[3])], g, [0.2, 0.36, 0.125], [PI / 2, 0, 0]);
  return g;
}
export function mSampler(): THREE.Group {
  const g = new THREE.Group(); g.rotation.z = -0.6;
  // a big sampling syringe: steel barrel cage, glass with a red sample, plunger, finger rings, needle
  mesh(cyl(0.11, 0.11, 0.55, 16, true), toon({ map: tex('glass', [2, 1]), opacity: 0.7, gloss: 1, rim: 0.4 }), g, [0, 0.4, 0]);
  mesh(cyl(0.095, 0.095, 0.3, 14), toon({ color: P.ruby[4], emissive: P.ruby[2], emissiveK: 0.4, gloss: 0.6 }), g, [0, 0.27, 0]);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * PI * 2; mesh(box(0.02, 0.56, 0.02), steel(), g, [Math.cos(a) * 0.115, 0.4, Math.sin(a) * 0.115]); }
  for (const y of [0.12, 0.68]) mesh(cyl(0.13, 0.13, 0.04, 16), T('brass', [3, 1], { metal: 0.9 }), g, [0, y, 0]);
  mesh(cyl(0.025, 0.025, 0.36, 8), steel(), g, [0, 0.86, 0]);
  mesh(cyl(0.09, 0.09, 0.03, 14), rub(), g, [0, 1.04, 0]);
  for (const s of [-1, 1]) mesh(tor(0.05, 0.016, 6, 12), steel(), g, [s * 0.17, 0.7, 0], [PI / 2, 0, 0]);
  mesh(cyl(0.03, 0.01, 0.06, 8), steel(), g, [0, 0.07, 0]);
  mesh(cyl(0.008, 0.002, 0.26, 6), C(P.steel[5], { metal: 1 }), g, [0, -0.09, 0]);
  return g;
}
export function mSeeder(): THREE.Group {
  const g = new THREE.Group();
  // a seed gun: a barrel, a glass hopper of seeds on top, a pump grip
  mesh(cyl(0.07, 0.08, 0.7, 14), T('olive', [2, 1]), g, [0.1, 0.32, 0], [0, 0, PI / 2]);
  mesh(cyl(0.085, 0.06, 0.1, 14), steel(), g, [0.5, 0.32, 0], [0, 0, PI / 2]);
  mesh(cyl(0.16, 0.06, 0.24, 16, true), toon({ map: tex('glass', [2, 1]), opacity: 0.7, gloss: 1, side: THREE.DoubleSide }), g, [0.05, 0.53, 0]);
  const seeds = new THREE.Group(); g.add(seeds);
  for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 0.03 + (i % 4) * 0.025; mesh(sph(0.03, 6, 5), C(i % 3 ? P.moss[4] : P.fur[4], { gloss: 0.4 }), seeds, [0.05 + Math.cos(a) * r, 0.46 + (i % 5) * 0.025, Math.sin(a) * r], [i, i, 0], [1, 0.7, 1]); }
  mesh(tor(0.16, 0.016, 6, 18), T('brass', [2, 1], { metal: 0.9 }), g, [0.05, 0.65, 0], [PI / 2, 0, 0]);
  grip(g, [-0.12, 0.27, 0], [0, 0, -0.2]);
  mesh(box(0.16, 0.08, 0.12), rub(), g, [0.3, 0.25, 0]);
  return g;
}
export function mGrab(): THREE.Group {
  const g = new THREE.Group();
  // a three-finger gravity claw round a violet field core
  mesh(cyl(0.2, 0.22, 0.12, 18), T('orange', [3, 1]), g, [0, 0.62, 0]);
  mesh(cyl(0.09, 0.12, 0.2, 14), dark(), g, [0, 0.78, 0]);
  mesh(cyl(0.05, 0.05, 0.12, 10), steel(), g, [0, 0.92, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2, f = new THREE.Group(); g.add(f); f.position.set(Math.cos(a) * 0.17, 0.56, Math.sin(a) * 0.17); f.rotation.y = -a;
    mesh(box(0.06, 0.26, 0.06), steel(), f, [0.05, -0.1, 0], [0, 0, 0.45]);
    mesh(sph(0.04, 8, 6), dark(), f, [0, 0, 0]);
    mesh(box(0.055, 0.2, 0.055), T('orange', [1, 1]), f, [0.07, -0.33, 0], [0, 0, -0.35]);
    mesh(new THREE.ConeGeometry(0.03, 0.08, 6), steel(), f, [0.02, -0.46, 0], [0, 0, PI - 0.6]);
  }
  mesh(sph(0.09, 14, 10), glow(P.amethyst[5], 1.4), g, [0, 0.33, 0]);
  mesh(tor(0.15, 0.012, 6, 24), glow(P.amethyst[4], 1), g, [0, 0.33, 0], [PI / 2, 0, 0]);
  return g;
}
export function mDrill(): THREE.Group {
  const g = new THREE.Group(); g.rotation.z = -PI / 2 + 0.25;
  // a core drill: an orange motor housing with vents, a chuck, a spiralled bit
  mesh(cyl(0.16, 0.16, 0.42, 16), T('orange', [3, 1], { gloss: 0.35 }), g, [0, 0.7, 0]);
  for (let i = 0; i < 4; i++) mesh(cyl(0.165, 0.165, 0.018, 16), C(P.ink[1]), g, [0, 0.82 - i * 0.04, 0]);
  mesh(cyl(0.12, 0.16, 0.08, 16), dark(), g, [0, 0.95, 0]);
  mesh(cyl(0.1, 0.08, 0.12, 12), [T('knurlSteel', [2, 1], { metal: 0.9 }), C(P.steel[4]), C(P.steel[4])], g, [0, 0.44, 0]);
  const bit = new THREE.Group(); bit.name = 'bit'; g.add(bit);
  mesh(new THREE.ConeGeometry(0.075, 0.42, 12), T('steel', [1, 2], { metal: 1 }), bit, [0, 0.17, 0], [PI, 0, 0]);
  const pts: THREE.Vector3[] = []; for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * PI * 7, r = 0.078 * (1 - t * 0.85); pts.push(new THREE.Vector3(Math.cos(a) * r, 0.38 - t * 0.4, Math.sin(a) * r)); }
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.016, 5), C(P.steel[5], { metal: 1 }), bit);
  // side handle
  mesh(cyl(0.035, 0.035, 0.3, 8), rub(), g, [0.24, 0.66, 0], [0, 0, PI / 2]);
  return g;
}
export function animDrill(root: THREE.Object3D, t: number, hot: boolean) { const b = root.getObjectByName('bit'); if (b) b.rotation.y = hot ? t * 18 : t * 2; }
export function mWeld(): THREE.Group {
  const g = new THREE.Group(); g.rotation.z = -0.5;
  // a welding torch: rubber grip, two gas valves, a brass neck curving to the nozzle, a blue flame
  mesh(cyl(0.065, 0.06, 0.42, 12), rub(), g, [0, 0.25, 0]);
  for (let i = 0; i < 5; i++) mesh(cyl(0.068, 0.068, 0.015, 12), C(P.basalt[1]), g, [0, 0.1 + i * 0.07, 0]);
  mesh(cyl(0.07, 0.07, 0.06, 12), T('brass', [2, 1], { metal: 0.9 }), g, [0, 0.49, 0]);
  for (const [s, col] of [[-1, P.ruby[4]], [1, P.malachite[4]]] as [number, number][]) {
    mesh(cyl(0.02, 0.02, 0.1, 8), T('brass', [1, 1], { metal: 0.9 }), g, [s * 0.09, 0.5, 0], [0, 0, PI / 2]);
    mesh(cyl(0.045, 0.045, 0.025, 10), C(col, { gloss: 0.5 }), g, [s * 0.15, 0.5, 0], [0, 0, PI / 2]);
  }
  mesh(tor(0.14, 0.025, 8, 14, PI / 2), T('brass', [1, 2], { metal: 0.9 }), g, [0.14, 0.52, 0], [0, 0, PI / 2]);
  mesh(cyl(0.03, 0.045, 0.12, 10), T('copper', [1, 1], { metal: 0.9 }), g, [0.28, 0.6, 0], [0, 0, -PI / 2]);
  const fl = new THREE.Group(); fl.name = 'flame'; g.add(fl); fl.position.set(0.39, 0.6, 0); fl.rotation.z = -PI / 2;
  mesh(new THREE.ConeGeometry(0.035, 0.16, 8), glow(P.sapphire[5], 1.6), fl, [0, 0.08, 0]);
  mesh(new THREE.ConeGeometry(0.018, 0.08, 6), glow(0xe8f4ff, 1.5), fl, [0, 0.05, 0]);
  // the hose
  const pts = [new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(0.02, -0.08, 0.05), new THREE.Vector3(-0.1, -0.2, 0.1), new THREE.Vector3(-0.25, -0.22, 0.05)];
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.025, 6), T('cable', [1, 6]), g);
  return g;
}
export function animWeld(root: THREE.Object3D, t: number) { const f = root.getObjectByName('flame'); if (f) f.scale.setScalar(0.85 + Math.abs(Math.sin(t * 23)) * 0.3); }
export function mLift(): THREE.Group {
  const g = new THREE.Group();
  // a field emitter: a riveted base, three copper-wound coil posts, a glowing ring floating above
  mesh(cyl(0.34, 0.38, 0.1, 6), T('olive', [4, 1]), g, [0, 0.05, 0]);
  mesh(cyl(0.22, 0.26, 0.06, 18), dark(), g, [0, 0.13, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2 + 0.3;
    mesh(cyl(0.06, 0.06, 0.34, 10), T('coil', [2, 3], { metal: 0.8 }), g, [Math.cos(a) * 0.24, 0.3, Math.sin(a) * 0.24]);
    mesh(cyl(0.075, 0.075, 0.03, 10), steel(), g, [Math.cos(a) * 0.24, 0.48, Math.sin(a) * 0.24]);
    mesh(sph(0.03, 8, 6), glow(P.amethyst[5], 1.2), g, [Math.cos(a) * 0.24, 0.51, Math.sin(a) * 0.24]);
  }
  const ring = new THREE.Group(); ring.name = 'ring'; g.add(ring); ring.position.y = 0.68;
  mesh(tor(0.26, 0.03, 8, 32), glow(P.amethyst[4], 1.2), ring, [0, 0, 0], [PI / 2, 0, 0]);
  mesh(tor(0.2, 0.012, 6, 28), glow(P.amethyst[5], 1), ring, [0, 0, 0], [PI / 2, 0, 0]);
  mesh(new THREE.DodecahedronGeometry(0.08), T('stone', [1, 1]), g, [0, 0.82, 0]);
  return g;
}
export function animLift(root: THREE.Object3D, t: number) { const r = root.getObjectByName('ring'); if (r) { r.position.y = 0.68 + Math.sin(t * 2.2) * 0.03; r.rotation.y = t; } }
export function mCannon(): THREE.Group {
  const g = new THREE.Group(); g.rotation.y = 0.2;
  // a mass driver: a long barrel through four copper coil rings, a breech block, a stand
  mesh(cyl(0.08, 0.09, 1.05, 14), T('darkSteel', [2, 3], { metal: 0.7 }), g, [0.15, 0.42, 0], [0, 0, PI / 2 + 0.12]);
  for (let i = 0; i < 4; i++) mesh(tor(0.12, 0.04, 8, 18), T('coil', [3, 1], { metal: 0.85 }), g, [-0.08 + i * 0.17, 0.39 + i * 0.02, 0], [0, PI / 2, 0.12]);
  mesh(box(0.3, 0.24, 0.26), T('olive', [2, 1]), g, [-0.42, 0.36, 0], [0, 0, 0.12]);
  mesh(box(0.31, 0.04, 0.27), T('hazard', [2, 0.3]), g, [-0.42, 0.25, 0], [0, 0, 0.12]);
  mesh(cyl(0.1, 0.11, 0.06, 14), steel(), g, [0.66, 0.48, 0], [0, 0, PI / 2 + 0.12]);
  mesh(cyl(0.06, 0.06, 0.01, 14), glow(P.glowTeal[3], 1), g, [0.695, 0.485, 0], [0, 0, PI / 2 + 0.12]);
  mesh(cyl(0.05, 0.08, 0.26, 10), dark(), g, [-0.3, 0.13, 0]);
  mesh(cyl(0.2, 0.22, 0.05, 6), steel(), g, [-0.3, 0.02, 0]);
  return g;
}
export function mCarry(): THREE.Group {
  const g = new THREE.Group();
  // a winch: a drum of cable on a bracket, the cable down to a hazard-striped hook block and hook
  mesh(cyl(0.12, 0.12, 0.34, 16), [T('cable', [6, 2]), C(P.steel[3]), C(P.steel[3])], g, [0, 0.98, 0], [PI / 2, 0, 0]);
  for (const s of [-1, 1]) mesh(cyl(0.17, 0.17, 0.03, 16), T('orange', [3, 1]), g, [0, 0.98, s * 0.18], [PI / 2, 0, 0]);
  mesh(box(0.42, 0.06, 0.44), T('olive', [2, 2]), g, [0, 1.15, 0]);
  mesh(cyl(0.012, 0.012, 0.5, 6), C(P.steel[4], { metal: 0.8 }), g, [0.1, 0.65, 0]);
  mesh(box(0.14, 0.16, 0.1), T('hazard', [1, 1]), g, [0.1, 0.34, 0]);
  mesh(cyl(0.03, 0.03, 0.12, 8), steel(), g, [0.1, 0.2, 0]);
  mesh(tor(0.1, 0.035, 8, 16, PI * 1.35), T('steel', [3, 1], { metal: 0.9 }), g, [0.1, 0.05, 0], [0, 0, PI * 0.9]);
  mesh(new THREE.ConeGeometry(0.035, 0.07, 6), steel(), g, [0.02, 0.1, 0], [0, 0, 0.4]);
  return g;
}

// ================================================================== the storage crate and its goods
export function mCrate(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon({ map: tex('crate') }), edge = T('darkSteel', [1, 3], { metal: 0.6 });
  // an open crate: five planked walls, steel corner posts and bands
  mesh(box(0.9, 0.04, 0.7), T('wood', [3, 2]), g, [0, 0.02, 0]);
  mesh(box(0.9, 0.42, 0.04), wood, g, [0, 0.23, 0.33]);
  mesh(box(0.9, 0.42, 0.04), wood, g, [0, 0.23, -0.33]);
  mesh(box(0.04, 0.42, 0.62), wood, g, [0.43, 0.23, 0]);
  mesh(box(0.04, 0.42, 0.62), wood, g, [-0.43, 0.23, 0]);
  for (const x of [-0.44, 0.44]) for (const z of [-0.34, 0.34]) mesh(box(0.06, 0.46, 0.06), edge, g, [x, 0.23, z]);
  for (const y of [0.08, 0.38]) { mesh(box(0.92, 0.03, 0.72), T('darkSteel', [4, 1], { metal: 0.6 }), g, [0, y, 0]); }
  mesh(box(0.84, 0.03, 0.62), C(P.soil[1]), g, [0, 0.39, 0]);
  // the goods heaped inside: logs, ore, a lumen crystal, a gear
  const goods = new THREE.Group(); goods.name = 'goods'; g.add(goods);
  for (let i = 0; i < 3; i++) { const lg = new THREE.Group(); goods.add(lg); lg.position.set(-0.2 + i * 0.13, 0.46 + (i % 2) * 0.05, -0.08 + (i % 2) * 0.12); lg.rotation.set(0, 0.4 - i * 0.3, PI / 2); mesh(cyl(0.065, 0.065, 0.55, 10), [T('wood', [2, 1]), toon({ map: tex('ochreWood', [0.5, 0.5]) }), toon({ map: tex('ochreWood', [0.5, 0.5]) })], lg); }
  for (let i = 0; i < 4; i++) mesh(new THREE.DodecahedronGeometry(0.08 + (i % 2) * 0.02), T(i % 2 ? 'ore' : 'stone', [1, 1], { metal: i % 2 ? 0.4 : 0 }), goods, [0.15 + (i % 2) * 0.12, 0.47 + Math.floor(i / 2) * 0.06, 0.12 - i * 0.07], [i, i * 2, 0]);
  mesh(new THREE.OctahedronGeometry(0.1), toon({ color: P.glowTeal[3], emissive: P.glowTeal[2], emissiveK: 0.8, gloss: 1 }), goods, [0.3, 0.58, -0.12], [0.3, 0.5, 0.2], [0.8, 1.6, 0.8]);
  mesh(cyl(0.09, 0.09, 0.04, 10), T('brass', [2, 1], { metal: 0.9 }), goods, [-0.05, 0.6, 0.15], [0.9, 0, 0.3]);
  return g;
}

/** the dock's five models */
export const DOCK_MODELS: Record<'build' | 'research' | 'troops' | 'lab' | 'ship', () => THREE.Group> = { build: mBlueprint, research: mMicroscope, troops: mHelmet, lab: mGeneTank, ship: mShip };
export const DOCK_ANIM: Partial<Record<keyof typeof DOCK_MODELS, (r: THREE.Object3D, t: number, hot: boolean) => void>> = { lab: animGeneTank, ship: animShip };
/** the tools' models (src/colony/tools.ts ids) */
export const TOOL_MODELS: Record<string, () => THREE.Group> = { scanner: mScanner, sampler: mSampler, seeder: mSeeder, grab: mGrab, drill: mDrill, weld: mWeld, lift: mLift, cannon: mCannon, carry: mCarry };
export const TOOL_ANIM: Record<string, (r: THREE.Object3D, t: number, hot: boolean) => void> = { drill: animDrill, weld: animWeld, lift: animLift };

// ================================================================== custom tools: a model assembled from bench parts
export type PartSlot = 'head' | 'core' | 'grip' | 'mod';
/** build a custom tool from its parts' ids (src/ui/hud7/bench.ts names them) */
export function mCustomTool(parts: Partial<Record<PartSlot, string>>, only?: PartSlot): THREE.Group {
  const all = new THREE.Group(), g = new THREE.Group(); all.add(g);
  const core = parts.core ?? 'cell', head = parts.head ?? 'lens', gp = parts.grip ?? 'pistol', mod = parts.mod;
  if (only) { const keep = buildParts(g, { core, head, grip: gp, mod }); for (const [slot, objs] of Object.entries(keep)) if (slot !== only) for (const o of objs) o.removeFromParent(); return all; }
  buildParts(g, { core, head, grip: gp, mod });
  return all;
}
/** one part per slot on a custom tool: returns the objects each slot added (so a single part can be shown alone) */
function buildParts(g: THREE.Group, pr: { core: string; head: string; grip: string; mod?: string }): Record<PartSlot, THREE.Object3D[]> {
  const out: Record<PartSlot, THREE.Object3D[]> = { core: [], head: [], grip: [], mod: [] };
  const track = (slot: PartSlot, f: () => void) => { const before = new Set(g.children); f(); for (const c of g.children) if (!before.has(c)) out[slot].push(c); };
  const { core, head, grip: gp, mod } = pr;
  track('core', () => {
  // the core: the body every part fixes to
  if (core === 'cell') { mesh(cyl(0.13, 0.13, 0.46, 14), T('olive', [3, 1]), g, [0, 0.4, 0], [0, 0, PI / 2]); mesh(cyl(0.14, 0.14, 0.04, 14), glow(P.glowAmber[3], 0.8), g, [-0.12, 0.4, 0], [0, 0, PI / 2]); }
  else if (core === 'reactor') { mesh(box(0.46, 0.26, 0.24), T('darkSteel', [2, 1], { metal: 0.6 }), g, [0, 0.4, 0]); mesh(sph(0.09, 12, 8), glow(P.glowTeal[3], 1.3), g, [0, 0.4, 0.12]); mesh(tor(0.1, 0.02, 6, 16), T('brass', [2, 1], { metal: 0.9 }), g, [0, 0.4, 0.12]); }
  else { mesh(box(0.5, 0.2, 0.2), T('orange', [2, 1]), g, [0, 0.4, 0]); for (let i = 0; i < 4; i++) mesh(box(0.02, 0.21, 0.21), C(P.ink[1]), g, [-0.18 + i * 0.12, 0.4, 0]); }
  });
  // the head: what it does
  track('head', () => {
  const hg = new THREE.Group(); g.add(hg); hg.position.set(0.3, 0.4, 0);
  if (head === 'lens') { mesh(cyl(0.12, 0.14, 0.12, 16), steel(), hg, [0.04, 0, 0], [0, 0, PI / 2]); mesh(cyl(0.1, 0.1, 0.01, 16), toon({ map: tex('lens'), emissive: P.glowTeal[3], emissiveK: 0.6 }), hg, [0.105, 0, 0], [0, 0, PI / 2]); }
  else if (head === 'bit') { mesh(new THREE.ConeGeometry(0.08, 0.36, 12), T('steel', [1, 2], { metal: 1 }), hg, [0.2, 0, 0], [0, 0, -PI / 2]); mesh(cyl(0.1, 0.08, 0.08, 12), T('knurlSteel', [2, 1], { metal: 0.9 }), hg, [0.02, 0, 0], [0, 0, PI / 2]); }
  else if (head === 'claw') { for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2, f = new THREE.Group(); hg.add(f); f.rotation.x = a; mesh(box(0.22, 0.04, 0.04), T('orange', [1, 1]), f, [0.1, 0.07, 0], [0, 0, 0.4]); } mesh(sph(0.06, 10, 8), glow(P.amethyst[5], 1.2), hg, [0.08, 0, 0]); }
  else { mesh(cyl(0.03, 0.05, 0.16, 10), T('copper', [1, 1], { metal: 0.9 }), hg, [0.06, 0, 0], [0, 0, -PI / 2]); mesh(new THREE.ConeGeometry(0.04, 0.16, 8), glow(P.sapphire[5], 1.5), hg, [0.2, 0, 0], [0, 0, -PI / 2]); }
  });
  // the grip
  track('grip', () => {
  if (gp === 'pistol') grip(g, [-0.1, 0.3, 0], [0, 0, -0.2]);
  else if (gp === 'brace') { mesh(box(0.5, 0.08, 0.1), rub(), g, [-0.4, 0.35, 0], [0, 0, -0.15]); mesh(box(0.08, 0.22, 0.12), rub(), g, [-0.63, 0.3, 0]); grip(g, [-0.05, 0.3, 0], [0, 0, -0.15]); }
  else { mesh(cyl(0.035, 0.035, 0.5, 8), rub(), g, [0, 0.62, 0], [0, 0, PI / 2]); mesh(box(0.06, 0.2, 0.06), steel(), g, [-0.2, 0.52, 0]); mesh(box(0.06, 0.2, 0.06), steel(), g, [0.2, 0.52, 0]); }
  });
  // the mod: an extra bolted on top
  track('mod', () => {
  if (mod === 'scope') { mesh(cyl(0.05, 0.05, 0.3, 10), dark(), g, [0.05, 0.62, 0], [0, 0, PI / 2]); mesh(cyl(0.04, 0.04, 0.01, 10), toon({ map: tex('amberLens'), emissive: P.glowAmber[2], emissiveK: 0.5 }), g, [0.205, 0.62, 0], [0, 0, PI / 2]); }
  else if (mod === 'tank') { mesh(new THREE.CapsuleGeometry(0.07, 0.24, 4, 10), T('red', [2, 1]), g, [-0.02, 0.62, 0], [0, 0, PI / 2]); }
  else if (mod === 'antenna') { mesh(cyl(0.008, 0.01, 0.4, 6), dark(), g, [-0.1, 0.72, 0], [0, 0, 0.2]); mesh(sph(0.025, 8, 6), glow(P.ruby[5], 1.2), g, [-0.14, 0.92, 0]); }
  });
  return out;
}

// ================================================================== the tool model hook (TOOL MODELS agent)
/**
 * The tools' 3D art can come from another module: `setToolModelProvider(fn)` with fn(id, { lod, animated }) returning
 * an Object3D (or a Promise of one, or null to fall back to the kit's own models above). The kit auto-registers
 * `buildToolModel` from src/tools/models/index.ts when that module exists. Provided models keep their maps and colours
 * but are drawn with the kit's toon material (banded light, black outline) so they sit in the UI; a model that
 * animates itself exposes `userData.update(dt, t)` (on its root or first child) and the views drive it.
 *   toolModel(id, lod)   -> a build function for ModelView / snapshot
 */
export type ToolLod = 'icon' | 'hud' | 'hero';
export type ToolModelFn = (id: string, o: { lod: ToolLod; animated: boolean }) => THREE.Object3D | null | Promise<THREE.Object3D | null>;
let provider: ToolModelFn | null = null;
export function setToolModelProvider(fn: ToolModelFn | null) { provider = fn; }
export function hasToolModelProvider() { return !!provider; }
/** give an outside model the kit's look: each mesh's material becomes a toon material with its map and colour */
export function toonify(root: THREE.Object3D): THREE.Object3D {
  root.traverse((n) => {
    const m = n as THREE.Mesh; if (!m.isMesh || !m.material) return;
    const conv = (mt: THREE.Material) => {
      const s = mt as THREE.MeshStandardMaterial & { emissiveIntensity?: number };
      if ((mt as THREE.ShaderMaterial).isShaderMaterial) return mt;
      const map = s.map ?? null; if (map) { map.magFilter = THREE.NearestFilter; map.minFilter = THREE.NearestFilter; map.needsUpdate = true; }
      const e = s.emissive && (s.emissive.r + s.emissive.g + s.emissive.b) > 0.02 ? s.emissive.getHex() : undefined;
      return toon({ map, color: s.color ? s.color.getHex() : 0xffffff, metal: s.metalness ?? 0, gloss: 1 - (s.roughness ?? 0.8), emissive: e, emissiveK: e !== undefined ? Math.min(1.5, (s.emissiveIntensity ?? 1) * 0.6) : 1, opacity: s.transparent ? Math.max(0.55, s.opacity) : 1, side: s.side, vcol: !!s.vertexColors });
    };
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
  });
  return root;
}
/** the build function for a tool's model (the provider's when there is one, else the kit's) */
export function toolModel(id: string, lod: ToolLod = 'hud'): () => THREE.Object3D | Promise<THREE.Object3D | null> {
  const own = TOOL_MODELS[id] ?? TOOL_MODELS.scanner;
  if (!provider) return own;
  const p = provider;
  return () => {
    try {
      const r = p(id, { lod, animated: lod !== 'icon' });
      if (r && typeof (r as Promise<unknown>).then === 'function') return (r as Promise<THREE.Object3D | null>).then((o) => (o ? toonify(o) : own())).catch(() => own());
      return r ? toonify(r as THREE.Object3D) : own();
    } catch (e) { console.warn('tool model provider', id, e); return own(); }
  };
}
// auto-register the TOOL MODELS agent's builder when its module exists (no import when it does not)
const toolMods = import.meta.glob('../../tools/models/index.ts');
for (const load of Object.values(toolMods)) void load().then((m) => { const f = (m as { buildToolModel?: ToolModelFn }).buildToolModel; if (typeof f === 'function' && !provider) setToolModelProvider(f); }).catch(() => {});
