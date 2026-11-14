// The drop pod, "Mk. II Planetary Insertion Capsule": a riveted olive-drab cone that falls heat shield first, a
// charred ablative dish at the base, a hatch with a brass-ringed porthole (Unit 07's lens glows behind it), four
// swept fins with hazard tips round the chute housing at the top, RCS thruster quads on the shoulders, a ring of
// retro-rockets round the shield, a whip antenna, "07" in worn stencil. The parachute (cream and oxide-red gores)
// packs into the nose and blooms out on cue. Origin: centre of the heat shield; +y runs to the nose.
import * as THREE from 'three';
import { Bin, lit, lamp, mesh, box, cyl, fxMat, ptex, enamelPix, hazardPix, stencil, insignia, decal, V3, TAU, sm, type V } from './deployKit';
import { GM, OL, CR, Pix, dv } from './machine';
import { clamp } from '../core/rand';
import { gbuf } from '../gfx/gbuf';

const FLAME_V = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
/** a rocket flame on a cone (uv.y 0 at the nozzle .. 1 at the tip): white-hot core, orange to smoke-red, flicker */
const FLAME_F = `uniform float uT, uK; uniform vec3 uHot, uMid; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  float y = 1.0 - vUv.y;
  float fl = h(vec2(floor(vUv.x * 12.0), floor(uT * 24.0))) * 0.25;
  float a = pow(clamp(1.0 - y - fl * y, 0.0, 1.0), 1.6) * uK;
  float rim = pow(abs(dot(normalize(vN), normalize(vV))), 0.8);
  vec3 c = mix(uMid, uHot, pow(1.0 - y, 3.0)) * (0.6 + rim);
  a *= 0.35 + rim * 0.65;
  a = floor(a * 6.0) / 6.0;
  gl_FragColor = vec4(c * a, 0.0);
  gNormal = vec4(0.0);
}`;

export interface Chute { root: THREE.Group; canopy: THREE.Mesh; lines: THREE.LineSegments; open: number }
export interface Pod {
  root: THREE.Group;
  /** a child pivot for shake and sway (the pod's model hangs off it) */
  body: THREE.Group;
  hatch: THREE.Group;
  setHatch(u: number): void;
  /** heat-shield glow 0..1.5 (re-entry) */
  heat: { value: number };
  /** Unit 07's lens behind the porthole */
  lens: { value: number };
  /** retro-rocket flames (0 off .. 1 full) */
  setRetro(k: number, t: number): void;
  /** RCS ports in pod space: position and outward direction (thrust is opposite) */
  rcsPorts: { p: V; d: V }[];
  noseCap: THREE.Mesh;
  chute: Chute | null;
  addChute(): Chute;
  /** 0 packed .. 1 fully blown; the canopy breathes once open */
  setChute(u: number, t: number): void;
  porthole: V;
  update(dt: number, t: number): void;
}

const SHIELD_R = 1.12, BASE_R = 1.05, TOP_R = 0.5, CONE_H = 2.15, NOSE_H = 0.72;

export function makePod(bin: Bin): Pod {
  const root = new THREE.Group(); root.name = 'drop-pod';
  const body = new THREE.Group(); root.add(body);
  // ---- skins
  const skinP = enamelPix(OL, 7, 64, 64);
  // a hazard band ring low on the cone and rivet rows on the panel joins
  for (let x = 0; x < 64; x++) { for (let y = 56; y < 62; y++) skinP.set(x, y, ((x + y) % 8) < 4 ? 0xb88a3a : GM[1]); }
  const skin = lit(bin, 0xffffff, { map: ptex(bin, skinP) });
  const steel = lit(bin, 0x8d8f8a, { phong: true, shininess: 60 });
  const dark = lit(bin, 0x2a2c2a);
  const brass = lit(bin, 0xa88a50, { phong: true, shininess: 70 });
  const heat = { value: 0 }, lens = { value: 1 };
  // the ablative shield: honeycomb cells, char streaks, glowing hot from the rim inward
  const sp = new Pix(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const cell = (x % 6 === 0 || (y + (Math.floor(x / 6) % 2) * 3) % 6 === 0) ? -1.2 : 0;
    sp.set(x, y, dv([0x0e0c0b, 0x18140f, 0x221c16, 0x2e261d, 0x3a3024, 0x4a3e2e], 2.6 + cell + Math.sin(x * 0.7 + y * 0.3) * 0.4, x, y));
  }
  // (custom hooks go on before gbuf(), which chains them and adds the G-buffer write)
  const shieldMat = bin.m(new THREE.MeshLambertMaterial({ color: 0xffffff, map: ptex(bin, sp), flatShading: true }));
  shieldMat.onBeforeCompile = (sh) => {
    sh.uniforms.uHeat = heat;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uHeat;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat hk = clamp(uHeat, 0.0, 1.6); totalEmissiveRadiance += mix(vec3(0.9, 0.18, 0.02), vec3(1.6, 0.85, 0.35), clamp(hk - 0.6, 0.0, 1.0)) * hk * (0.55 + 0.45 * diffuseColor.r * 6.0);');
  };
  shieldMat.customProgramCacheKey = () => 'deploy-shield';
  gbuf(shieldMat, 1);
  // ---- heat shield (a shallow cap) and its rim ring
  const cap = new THREE.SphereGeometry(SHIELD_R * 2.1, 28, 6, 0, TAU, Math.PI - 0.56, 0.56);
  cap.translate(0, SHIELD_R * 2.1 * Math.cos(0.56), 0);
  mesh(bin, cap, shieldMat, body, 0, 0.08, 0);
  cyl(bin, SHIELD_R, SHIELD_R, 0.14, steel, body, 0, 0.12, 0, 28);
  // ---- the cone, in 16 flat panels
  const coneG = new THREE.CylinderGeometry(TOP_R, BASE_R, CONE_H, 16, 1, true);
  const uv = coneG.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i) * 2.2);
  const cone = mesh(bin, coneG, skin, body, 0, 0.19 + CONE_H / 2, 0);
  cone.name = 'pod-cone';
  // panel join ribs
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2;
    const r0 = BASE_R + 0.015, r1 = TOP_R + 0.015;
    const p0 = new V3(Math.cos(a) * r0, 0.2, Math.sin(a) * r0), p1 = new V3(Math.cos(a) * r1, 0.19 + CONE_H, Math.sin(a) * r1);
    const len = p0.distanceTo(p1);
    const rib = box(bin, 0.035, len, 0.035, steel, body);
    rib.position.copy(p0).add(p1).multiplyScalar(0.5); rib.quaternion.setFromUnitVectors(new V3(0, 1, 0), p1.clone().sub(p0).normalize());
  }
  // shoulder ring and the nose (chute housing) with its cap
  cyl(bin, TOP_R + 0.05, TOP_R + 0.05, 0.12, steel, body, 0, 0.19 + CONE_H, 0, 20);
  cyl(bin, TOP_R * 0.92, TOP_R, NOSE_H, skin, body, 0, 0.19 + CONE_H + NOSE_H / 2, 0, 16);
  const noseCap = cyl(bin, TOP_R * 0.5, TOP_R * 0.92, 0.22, lit(bin, 0x8a2e24), body, 0, 0.19 + CONE_H + NOSE_H + 0.11, 0, 16);
  noseCap.name = 'pod-nosecap';
  const ant = cyl(bin, 0.012, 0.018, 0.9, steel, noseCap, 0.18, 0.5, 0, 5); ant.rotation.z = -0.15;
  // ---- fins: four swept plates round the nose, hazard-striped tips
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0); finShape.lineTo(0.62, -0.42); finShape.lineTo(0.66, -0.05); finShape.lineTo(0.22, 0.72); finShape.lineTo(0, 0.72); finShape.closePath();
  const finG = new THREE.ExtrudeGeometry(finShape, { depth: 0.045, bevelEnabled: false });
  finG.translate(0, 0, -0.0225);
  const hz = ptex(bin, hazardPix(32, 8, 8));
  const finMat = lit(bin, 0xffffff, { map: ptex(bin, enamelPix(OL, 9, 32, 32)) });
  const tipMat = lit(bin, 0xffffff, { map: hz });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const f = new THREE.Group(); f.rotation.y = -a; f.position.set(0, 0.19 + CONE_H - 0.15, 0); body.add(f);
    mesh(bin, finG.clone(), finMat, f, TOP_R - 0.02, 0, 0);
    const tip = box(bin, 0.08, 0.36, 0.05, tipMat, f, TOP_R + 0.63, -0.25, 0); tip.rotation.z = 0.1;
  }
  bin.g(finG);
  // ---- retro-rocket ring round the shield
  const retroFlames: THREE.Mesh[] = [];
  const flameU = { uT: { value: 0 }, uK: { value: 0 }, uHot: { value: new THREE.Color(2.4, 2.0, 1.5) }, uMid: { value: new THREE.Color(1.6, 0.5, 0.08) } };
  const flameMat = fxMat(bin, FLAME_V, FLAME_F, flameU, 'add', { side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.26;
    const x = Math.cos(a) * (BASE_R - 0.12), z = Math.sin(a) * (BASE_R - 0.12);
    const n = cyl(bin, 0.07, 0.11, 0.2, dark, body, x, 0.36, z, 10);
    n.rotation.z = Math.cos(a) * 0.35; n.rotation.x = -Math.sin(a) * 0.35;
    const fl = mesh(bin, new THREE.ConeGeometry(0.16, 1.6, 10, 1, true), flameMat, body, x * 1.12, -0.55, z * 1.12, false);
    fl.rotation.x = Math.PI; fl.visible = false; retroFlames.push(fl);
  }
  // ---- RCS quads on the shoulders (ports point out along four axes)
  const rcsPorts: { p: V; d: V }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const r = TOP_R + (BASE_R - TOP_R) * 0.3 + 0.06, y = 0.19 + CONE_H * 0.7;
    const q = box(bin, 0.16, 0.18, 0.16, steel, body, Math.cos(a) * r, y, Math.sin(a) * r); q.rotation.y = -a;
    for (const s of [-1, 1]) cyl(bin, 0.02, 0.035, 0.07, dark, q, 0.04, 0, s * 0.09, 6).rotation.x = Math.PI / 2;
    rcsPorts.push({ p: new V3(Math.cos(a) * (r + 0.1), y, Math.sin(a) * (r + 0.1)), d: new V3(Math.cos(a), 0, Math.sin(a)) });
  }
  // ---- the hatch: a curved panel on the -z side (facing the camera in the bay), hinged on its left edge
  const hatch = new THREE.Group();
  const hA0 = -Math.PI / 2 - 0.42, hA1 = -Math.PI / 2 + 0.42, hy0 = 0.55, hy1 = 1.75;
  const rAt = (y: number) => BASE_R + (TOP_R - BASE_R) * ((y - 0.19) / CONE_H) + 0.03;
  const hg = new THREE.BufferGeometry();
  {
    const pos: number[] = [], uvs: number[] = [], S = 6;
    for (let j = 0; j <= 1; j++) for (let i = 0; i <= S; i++) {
      const a = hA0 + (hA1 - hA0) * (i / S), y = j ? hy1 : hy0, r = rAt(y);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r); uvs.push(i / S, j);
    }
    const idx: number[] = [];
    for (let i = 0; i < S; i++) idx.push(i, i + 1, S + 1 + i, i + 1, S + 2 + i, S + 1 + i);
    hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); hg.setIndex(idx);
    hg.computeVertexNormals();
  }
  // hinge on the hA0 edge
  const hingeA = hA0, hx = Math.cos(hingeA) * rAt(1.15), hz2 = Math.sin(hingeA) * rAt(1.15);
  hatch.position.set(hx, 0, hz2);
  const hpm = lit(bin, 0xffffff, { map: ptex(bin, enamelPix(OL, 12, 32, 32)), side: THREE.DoubleSide });
  mesh(bin, hg, hpm, hatch, -hx, 0, -hz2);
  body.add(hatch);
  // hatch frame (a dark gasket) on the cone, and the dark interior behind it
  cyl(bin, 0.62, 0.86, 1.4, lit(bin, 0x161816, { side: THREE.BackSide }), body, 0, 1.15, 0, 14);
  // the porthole in the hatch: brass ring, dark glass, the lens glowing behind it
  const pa = -Math.PI / 2, py = 1.3, pr = rAt(py) + 0.02;
  const porthole = new V3(Math.cos(pa) * pr, py, Math.sin(pa) * pr);
  const ringG = new THREE.TorusGeometry(0.17, 0.035, 6, 20);
  const ring = mesh(bin, ringG, brass, hatch, porthole.x - hx, py, porthole.z - hz2);
  const tilt = Math.atan2(BASE_R - TOP_R, CONE_H);
  ring.rotation.set(-tilt, 0, 0);
  const lensMat = new THREE.MeshBasicMaterial({ color: 0x7affe0 });
  lensMat.onBeforeCompile = (sh) => {
    sh.uniforms.uLens = lens;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLens;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * (0.08 + uLens * 1.4), opacity );');
  };
  lensMat.customProgramCacheKey = () => 'deploy-lens';
  gbuf(lensMat, 32);
  bin.m(lensMat);
  // the glass: a dark disc with the lens (a small bright iris) set back behind it
  const glass = mesh(bin, new THREE.CircleGeometry(0.15, 16), lit(bin, 0x0c1414, { phong: true, shininess: 120 }), ring, 0, 0, -0.01, false);
  glass.rotation.y = Math.PI;
  const iris = mesh(bin, new THREE.CircleGeometry(0.055, 12), lensMat, ring, 0.02, -0.01, 0.06, false);
  iris.rotation.y = Math.PI;
  // stencils: "07", the insignia, the Corps line
  const s07 = stencil(bin, '07', { size: 30, color: CR[4], wear: 0.12, bridges: true });
  const conePt = (a: number, y: number) => new V3(Math.cos(a) * (rAt(y) + 0.005), y, Math.sin(a) * (rAt(y) + 0.005));
  const coneN = (a: number) => new V3(Math.cos(a), Math.sin(tilt), Math.sin(a)).normalize();
  decal(bin, s07, 0.62, body, conePt(Math.PI / 2, 1.2), coneN(Math.PI / 2), new V3(0, 1, 0));
  decal(bin, insignia(bin), 0.9, body, conePt(0.05, 1.05), coneN(0.05), new V3(0, 1, 0));
  decal(bin, insignia(bin), 0.9, body, conePt(Math.PI - 0.05, 1.05), coneN(Math.PI - 0.05), new V3(0, 1, 0));
  const corps = stencil(bin, 'U.S. PLANETARY CORPS', { size: 10, color: CR[3], wear: 0.06 });
  decal(bin, corps, 0.86, body, conePt(Math.PI / 2, 0.72), coneN(Math.PI / 2), new V3(0, 1, 0));
  const pull = stencil(bin, 'RESCUE', { size: 10, color: 0xb84a30, wear: 0.05 });
  decal(bin, pull, 0.4, body, conePt(-Math.PI / 2, 2.05), coneN(-Math.PI / 2), new V3(0, 1, 0));

  const pod: Pod = {
    root, body, hatch, heat, lens, rcsPorts, noseCap, chute: null, porthole,
    setHatch(u) { hatch.rotation.y = -sm(0, 1, u) * 1.9; },
    setRetro(k, t) {
      flameU.uK.value = k; flameU.uT.value = t;
      for (const f of retroFlames) { f.visible = k > 0.02; f.scale.set(1, 0.6 + k * 0.7 + Math.sin(t * 60 + f.id) * 0.08, 1); }
    },
    addChute() {
      if (pod.chute) return pod.chute;
      const g = new THREE.Group(); g.position.set(0, 0.19 + CONE_H + NOSE_H + 0.2, 0); body.add(g);
      // canopy: 12 gores, cream and oxide red, a scalloped skirt; drawn both sides
      const G = 12, R = 4.6, rows = 6;
      const pos: number[] = [], col: number[] = [];
      const cA = new THREE.Color(0xd8cfb8), cB = new THREE.Color(0x9a3a2a);
      for (let gi = 0; gi < G; gi++) {
        const a0 = (gi / G) * TAU, a1 = ((gi + 1) / G) * TAU, c = gi % 2 ? cB : cA;
        for (let r = 0; r < rows; r++) {
          const t0 = r / rows, t1 = (r + 1) / rows;
          const ring = (t: number, a: number) => {
            const el = (1 - t) * (Math.PI / 2) * 0.92;
            const bulge = 1 + Math.sin(((a - a0) / (a1 - a0)) * Math.PI) * 0.06 * t;
            return [Math.cos(a) * Math.cos(el) * R * bulge, Math.sin(el) * R * 0.62 + 6.2, Math.sin(a) * Math.cos(el) * R * bulge];
          };
          const p00 = ring(t0, a0), p01 = ring(t0, a1), p10 = ring(t1, a0), p11 = ring(t1, a1);
          // the skirt scallops up between the lines
          if (r === rows - 1) { const am = (a0 + a1) / 2; const pm = ring(t1, am); pm[1] += 0.35; pos.push(...p10, ...pm, ...p00, ...pm, ...p11, ...p01, ...p00, ...pm, ...p01); for (let k = 0; k < 9; k++) col.push(c.r, c.g, c.b); continue; }
          pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
          for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
        }
      }
      const cg = new THREE.BufferGeometry();
      cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      cg.computeVertexNormals();
      const cm = lit(bin, 0xffffff, { vertexColors: true, side: THREE.DoubleSide, flat: true });
      const canopy = mesh(bin, cg, cm, g, 0, 0, 0);
      // suspension lines from the skirt to the riser
      const lp: number[] = [];
      for (let gi = 0; gi < G; gi++) { const a = (gi / G) * TAU, el = 0.08 * (Math.PI / 2); lp.push(0, 0, 0, Math.cos(a) * Math.cos(el) * R, Math.sin(el) * R * 0.62 + 6.2, Math.sin(a) * Math.cos(el) * R); }
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      // the lines write the G-buffer too (thin: no outline flag)
      const lm = gbuf(new THREE.LineBasicMaterial({ color: 0x3a3830 }), 0);
      const lines = new THREE.LineSegments(bin.g(lg), bin.m(lm));
      g.add(lines);
      g.visible = false;
      pod.chute = { root: g, canopy, lines, open: 0 };
      return pod.chute;
    },
    setChute(u, t) {
      const c = pod.chute; if (!c) return;
      c.open = u;
      c.root.visible = u > 0.001;
      // a streamer first (long and thin), then the bloom with an overshoot, then breathing
      const bloom = sm(0.25, 1, u), over = Math.sin(clamp((u - 0.55) / 0.45, 0, 1) * Math.PI) * 0.12;
      const breathe = u >= 1 ? Math.sin(t * 2.3) * 0.04 : 0;
      const w = 0.08 + bloom * 0.92 + over + breathe;
      c.root.scale.set(w, 0.35 + sm(0, 0.4, u) * 0.65 - over * 0.5, w);
    },
    update(_dt, t) { flameU.uT.value = t; },
  };
  return pod;
}

/** the porthole's world position (for close-ups) */
export function portholeWorld(pod: Pod, out = new V3()) { return pod.body.localToWorld(out.copy(pod.porthole)); }
