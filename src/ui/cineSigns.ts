// The main menu's set pieces, floating in space: Unit 07's meteor (a faceted asteroid painted face by face, its
// fissures glowing, the golem's brass lens peeking out of the rock), a swarm of small rocks on tilted orbits and
// glittering dust; riveted cast-iron signs with stencilled lettering, hand-painted texel by texel, hanging on
// chains and tethered to the rock (they bob, swing on springs, light up and clank); an iron cog for the settings;
// nixie tubes; a pixel sun glare.
import * as THREE from 'three';
import { Pix, metal, rivet, dv, mixc, GM, BR, CR, RS, RD, INK } from './machine';
import { gbuf, F_HOVER, type GFlag } from '../gfx/gbuf';
import { glyph7 } from './machine';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const h3 = (x: number, y: number, z: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return v - Math.floor(v); };
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  return L(L(L(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), L(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v), L(L(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), L(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v), w);
}
const fbm = (x: number, y: number, z: number, o = 4) => { let s = 0, a = 0.5, t = 0; for (let i = 0; i < o; i++) { s += vnoise(x, y, z) * a; t += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s / t; };

function texOf(c: HTMLCanvasElement | Pix, repeat = false) {
  const t = new THREE.CanvasTexture(c instanceof Pix ? c.canvas() : c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ================================================================== the meteor
const ROCK = [0x16131b, 0x221d28, 0x2f2936, 0x3e3645, 0x504655, 0x655868, 0x7c6e7c, 0x968694];
export interface Meteor { group: THREE.Group; body: THREE.Mesh; lens: THREE.Group; pupil: THREE.Mesh; glow: { value: number }; t: { value: number }; anchor(i: number, out?: THREE.Vector3): THREE.Vector3; anchors: THREE.Vector3[] }
/** Unit 07's asteroid: every face painted its own rock tone, cracks of glowing teal facets, a brass lens */
export function makeMeteor(R = 1.7, seed = 7): Meteor {
  const g0 = new THREE.IcosahedronGeometry(R, 4).toNonIndexed();
  const pos = g0.attributes.position as THREE.BufferAttribute, v = new V3();
  const craters = Array.from({ length: 7 }, (_, i) => ({ c: new V3().randomDirection(), r: 0.22 + h3(i, seed, 1) * 0.3, d: 0.07 + h3(i, seed, 2) * 0.08 }));
  const shape = (p: THREE.Vector3) => {
    const n = p.clone().normalize();
    let r = 1 + (fbm(n.x * 1.4 + seed, n.y * 1.4, n.z * 1.4) - 0.5) * 0.42 + (fbm(n.x * 4 + 9, n.y * 4, n.z * 4, 3) - 0.5) * 0.1;
    for (const c of craters) { const d = n.distanceTo(c.c); if (d < c.r) { const k = d / c.r; r -= c.d * (1 - k * k) - (k > 0.75 ? c.d * 0.5 * (k - 0.75) * 4 * (1 - k) * 4 : 0); } }
    return n.multiplyScalar(R * r * (n.y < 0 ? 0.92 : 1));
  };
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const p = shape(v); pos.setXYZ(i, p.x, p.y, p.z); }
  g0.computeVertexNormals();
  // per-face paint: a tone from noise and slope, darker in craters; fissures are faces on a noise zero-line
  const col = new Float32Array(pos.count * 3), glow = new Float32Array(pos.count);
  const a = new V3(), b = new V3(), c = new V3(), ctr = new V3(), nrm = new V3();
  const C = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    a.fromBufferAttribute(pos, f); b.fromBufferAttribute(pos, f + 1); c.fromBufferAttribute(pos, f + 2);
    ctr.copy(a).add(b).add(c).divideScalar(3); nrm.copy(ctr).normalize();
    const rr = ctr.length() / R;
    const n1 = fbm(nrm.x * 3 + 2, nrm.y * 3, nrm.z * 3, 3), n2 = vnoise(nrm.x * 9, nrm.y * 9, nrm.z * 9);
    let k = 2.8 + (n1 - 0.5) * 5 + (rr - 1) * 9 + (n2 - 0.5) * 1.4;
    if (h3(f, seed, 3) < 0.05) k += 1.6;
    k = Math.max(0, Math.min(ROCK.length - 1, Math.round(k)));
    C.set(ROCK[k]);
    // lichen-grey and rust patches
    const rust = fbm(nrm.x * 2.2 + 30, nrm.y * 2.2, nrm.z * 2.2, 2);
    if (rust > 0.66) C.lerp(new THREE.Color(0x6a4030), 0.35);
    const crack = Math.abs(fbm(nrm.x * 2.6 + 50, nrm.y * 2.6, nrm.z * 2.6, 3) - 0.5);
    const crack2 = Math.abs(vnoise(nrm.x * 5 + 70, nrm.y * 5, nrm.z * 5) - 0.5);
    let gl = crack < 0.022 ? 1 : crack < 0.04 ? 0.45 : crack2 < 0.018 ? 0.7 : 0;
    if (gl > 0) C.set(gl > 0.6 ? 0x2a8c80 : 0x1d4a48);
    for (let j = 0; j < 3; j++) { col.set([C.r, C.g, C.b], (f + j) * 3); glow[f + j] = gl; }
  }
  g0.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g0.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  const uGlow = { value: 1 }, uT = { value: 0 };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = uGlow; sh.uniforms.uT = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow; varying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow; vOP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow, uT; varying float vGlow; varying vec3 vOP;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat pulse = 0.65 + 0.35 * sin(uT * 1.7 + vOP.x * 2.0 + vOP.y * 3.0);\ntotalEmissiveRadiance += vec3(0.25, 1.0, 0.85) * vGlow * uGlow * pulse * 1.6;');
  };
  m.customProgramCacheKey = () => 'menu-meteor';
  gbuf(m, 1);
  const body = new THREE.Mesh(g0, m); body.castShadow = true; body.receiveShadow = true;
  const group = new THREE.Group(); group.add(body);
  // the golem's lens, peeking out of the rock
  const lens = new THREE.Group();
  const brass = gbuf(new THREE.MeshPhongMaterial({ color: 0xb08a40, shininess: 70, specular: 0xffe0a0, flatShading: true }), 1);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.075, 6, 18), brass); lens.add(ring);
  for (let i = 0; i < 8; i++) { const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), brass); const an = (i / 8) * TAU; bolt.position.set(Math.cos(an) * 0.3, Math.sin(an) * 0.3, 0.06); lens.add(bolt); }
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.26, 20), gbuf(new THREE.MeshBasicMaterial({ color: 0x0a2a2c }), 1)); glass.position.z = -0.01; lens.add(glass);
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7affe0).multiplyScalar(1.6) }), 32)); pupil.position.z = 0.005; lens.add(pupil);
  const glint = new THREE.Mesh(new THREE.CircleGeometry(0.035, 6), gbuf(new THREE.MeshBasicMaterial({ color: 0xffffff }), 32)); glint.position.set(-0.07, 0.08, 0.01); pupil.add(glint);
  const ln = new V3(0.5, 0.25, 0.83).normalize();
  lens.position.copy(shape(ln.clone().multiplyScalar(R))).multiplyScalar(0.97); lens.lookAt(lens.position.clone().multiplyScalar(2));
  group.add(lens);
  // anchor bolts for the tethers, on the side that faces the signs
  const anchors: THREE.Vector3[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new V3(0.92, 0.75 - i * 0.3, 0.32 + (i % 2) * 0.12).normalize();
    const p = shape(d.clone().multiplyScalar(R)).multiplyScalar(0.98); anchors.push(p);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 5, 10), gbuf(new THREE.MeshPhongMaterial({ color: 0x5c646c, flatShading: true }), 1));
    eye.position.copy(p); eye.lookAt(p.clone().multiplyScalar(2)); group.add(eye);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 8), eye.material); plate.position.copy(p).multiplyScalar(0.995); plate.quaternion.setFromUnitVectors(new V3(0, 1, 0), p.clone().normalize()); group.add(plate);
  }
  return {
    group, body, lens, pupil, glow: uGlow, t: uT, anchors,
    anchor(i, out = new V3()) { return out.copy(anchors[i % anchors.length]).applyMatrix4(group.matrixWorld); },
  };
}

/** small rocks on tilted orbits around a centre, each tumbling */
export function makeRockSwarm(n = 16, rMin = 2.2, rMax = 3.1) {
  const group = new THREE.Group();
  const mat = gbuf(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 1);
  const rocks: { m: THREE.Mesh; r: number; a: number; sp: number; tilt: THREE.Quaternion; spin: THREE.Vector3; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const s = 0.06 + h3(i, 3, 1) * 0.16;
    const g = new THREE.IcosahedronGeometry(s, h3(i, 2, 2) < 0.5 ? 0 : 1).toNonIndexed();
    const p = g.attributes.position as THREE.BufferAttribute, v = new V3();
    for (let k = 0; k < p.count; k++) { v.fromBufferAttribute(p, k); v.multiplyScalar(0.75 + vnoise(v.x * 20 + i, v.y * 20, v.z * 20) * 0.5); p.setXYZ(k, v.x, v.y, v.z); }
    g.computeVertexNormals();
    const col = new Float32Array(p.count * 3), C = new THREE.Color();
    for (let k = 0; k < p.count; k += 3) { C.set(ROCK[2 + Math.floor(h3(i, k, 5) * 4)]); if (h3(i, k, 9) < 0.08) C.set(0x2a8c80); for (let j = 0; j < 3; j++) col.set([C.r, C.g, C.b], (k + j) * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, mat); m.castShadow = true; group.add(m);
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler((h3(i, 1, 7) - 0.5) * 1.1, h3(i, 4, 7) * TAU, (h3(i, 6, 7) - 0.5) * 0.9));
    rocks.push({ m, r: rMin + h3(i, 8, 8) * (rMax - rMin), a: h3(i, 9, 9) * TAU, sp: (0.12 + h3(i, 10, 10) * 0.22) * (h3(i, 11, 11) < 0.2 ? -1 : 1), tilt, spin: new V3(h3(i, 1, 1), h3(i, 2, 1), h3(i, 3, 1)).multiplyScalar(1.4), y: (h3(i, 12, 12) - 0.5) * 0.3 });
  }
  const tmp = new V3();
  return {
    group, rocks,
    /** pull: 0 free orbits .. 1 sucked into the centre */
    update(dt: number, pull = 0) {
      for (const k of rocks) {
        k.a += dt * k.sp * (1 + pull * 6);
        const r = k.r * (1 - pull * 0.85);
        tmp.set(Math.cos(k.a) * r, k.y, Math.sin(k.a) * r).applyQuaternion(k.tilt);
        k.m.position.copy(tmp);
        k.m.rotation.x += dt * k.spin.x; k.m.rotation.y += dt * k.spin.y; k.m.rotation.z += dt * k.spin.z;
        k.m.scale.setScalar(1 - pull * 0.7);
      }
    },
  };
}

/** glittering dust: a cloud of points that twinkle and drift, now and then flashing into a four-point star */
export function makeSparkles(n = 220, R = 4.2) {
  const p = new Float32Array(n * 3), ph = new Float32Array(n), sz = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = new V3().randomDirection().multiplyScalar(R * Math.cbrt(Math.random())); p.set([v.x, v.y * 0.6, v.z], i * 3); ph[i] = Math.random() * 100; sz[i] = Math.random() < 0.12 ? 3 : Math.random() < 0.4 ? 2 : 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1)); g.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
  const uT = { value: 0 };
  const m = new THREE.ShaderMaterial({
    uniforms: { uT }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float ph; attribute float sz; uniform float uT; varying float vA; varying float vS;
void main(){ vec3 q = position; q.y += sin(uT * 0.3 + ph) * 0.08; q.x += cos(uT * 0.21 + ph * 1.3) * 0.06;
  float tw = pow(max(0.0, sin(uT * (0.7 + fract(ph) * 1.6) + ph)), 6.0);
  vA = 0.25 + tw * 0.95; vS = sz + (sz > 2.5 ? tw * 4.0 : tw * 1.0);
  gl_PointSize = floor(vS + 0.5); gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0); }`,
    fragmentShader: `layout(location = 1) out highp vec4 gNormal; varying float vA; varying float vS;
void main(){ vec2 c = floor(gl_PointCoord * vS) - floor(vS * 0.5); float cross = (abs(c.x) < 0.5 || abs(c.y) < 0.5) ? 1.0 : 0.0; if (vS > 3.5 && cross < 0.5) discard;
  gl_FragColor = vec4(vec3(0.75, 1.0, 0.95) * vA, vA); gNormal = vec4(0.0); }`,
  });
  (m as any).__gb = true;
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  return { points: pts, update(t: number) { uT.value = t; } };
}

// ================================================================== cast iron, painted
/** a weathered iron plate: rolled steel, seams, rivets that bleed rust, chipped edges; w x h texels */
export function ironPlate(w: number, h: number, seed: number, o: { rivetStep?: number; holes?: boolean; tone?: number[] } = {}) {
  const p = new Pix(w, h), R = o.tone ?? GM;
  metal(p, 0, 0, w, h, R, { seed, grime: 0.9, scratches: 1.2, base: R.length * 0.42, rough: 0.8 });
  // bevel
  for (let x = 0; x < w; x++) { p.set(x, 0, INK); p.set(x, h - 1, INK); p.set(x, 1, R[R.length - 2]); p.set(x, 2, R[R.length - 3]); p.set(x, h - 2, R[1]); p.set(x, h - 3, R[2]); }
  for (let y = 0; y < h; y++) { p.set(0, y, INK); p.set(w - 1, y, INK); p.set(1, y, R[R.length - 2]); p.set(w - 2, y, R[1]); }
  for (const [x, y] of [[0, 0], [1, 0], [0, 1], [w - 1, 0], [w - 2, 0], [w - 1, 1], [0, h - 1], [1, h - 1], [0, h - 2], [w - 1, h - 1], [w - 2, h - 1], [w - 1, h - 2]]) p.set(x, y, 0, 0);
  // a recessed inner frame line
  for (let x = 6; x < w - 6; x++) { p.set(x, 6, R[1], 180); p.set(x, h - 7, R[R.length - 3], 160); }
  for (let y = 6; y < h - 6; y++) { p.set(6, y, R[1], 180); p.set(w - 7, y, R[R.length - 3], 160); }
  // rust: streaks running down from the rivets, blooms in the corners
  const step = o.rivetStep ?? 22;
  const rivets: [number, number][] = [];
  for (let x = 12; x <= w - 12; x += step) { rivets.push([x, 3]); rivets.push([x, h - 4]); }
  for (let y = 3 + step; y < h - 4; y += step) { rivets.push([3, y]); rivets.push([w - 4, y]); }
  for (const [x, y] of rivets) {
    const len = 4 + Math.floor(h3(x, y, seed) * 14);
    for (let k = 1; k < len; k++) { const a = 200 - k * (180 / len); p.set(x + (h3(x, k, seed) < 0.3 ? 1 : 0), y + k + 1, RS[Math.min(RS.length - 1, 1 + (k % 3))], a); }
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = h3(Math.floor(x / 3), Math.floor(y / 3), seed + 4), e = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (e < 9 && n < 0.18 + (9 - e) * 0.02 && h3(x, y, seed + 7) < 0.55) p.set(x, y, RS[1 + Math.floor(h3(x, y, seed) * 3)], 150);
  }
  for (const [x, y] of rivets) rivet(p, x, y, GM);
  if (o.holes) for (const x of [Math.round(w * 0.12), Math.round(w * 0.88)]) { p.disc(x, 6, 3.2, INK); p.disc(x, 6, 2, 0x050505); p.set(x - 2, 4, R[R.length - 1]); }
  return p;
}
/** text in one of the pixel faces, thresholded to hard pixels: a boolean mask */
function textMask(s: string, font: string, size: number): { m: Uint8Array; w: number; h: number } {
  const c = document.createElement('canvas').getContext('2d')!;
  c.font = `${size}px ${font}`;
  const w = Math.ceil(c.measureText(s).width) + 4, h = Math.ceil(size * 1.3) + 4;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!; g.font = `${size}px ${font}`; g.textBaseline = 'alphabetic'; g.fillStyle = '#fff';
  g.fillText(s, 2, Math.round(size * 1.0) + 1);
  const d = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = d[i * 4 + 3] > 120 ? 1 : 0;
  return { m, w, h };
}
export interface SignArt { map: THREE.Texture; emissive: THREE.Texture; back: THREE.Texture }
/** a cast-iron sign: stencilled lettering in chipped cream paint with a cast shadow; the emissive mask lights it */
export function signArt(label: string, w: number, h: number, seed: number, o: { font?: string; size?: number; paint?: number; sub?: string } = {}): SignArt {
  const p = ironPlate(w, h, seed, { holes: true });
  const back = ironPlate(w, h, seed + 13, { holes: true });
  const em = new Pix(w, h); em.rect(0, 0, w, h, 0x000000);
  const font = o.font ?? 'Superwide', paint = o.paint ?? CR[4];
  const unit = font === 'VT' ? 14 : font === 'Silk' ? 11 : font === 'Jersey' ? 13 : 10;
  let size = o.size ?? unit * 3, T = textMask(label, font, size);
  while ((T.w > w * 0.84 || T.h > h * 0.8) && size > unit) { size -= unit; T = textMask(label, font, size); }
  const sub = o.sub ? textMask(o.sub, 'VT', 14) : null;
  const ox = Math.round((w - T.w) / 2), oy = Math.round((h - T.h) / 2) + (sub ? -6 : 1);
  const put = (M: { m: Uint8Array; w: number; h: number }, x0: number, y0: number, col: number, chip: number) => {
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (M.m[y * M.w + x] && !(y + 1 < M.h && M.m[(y + 1) * M.w + x])) p.set(x0 + x, y0 + y + 1, INK, 200);
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) {
      if (!M.m[y * M.w + x]) continue;
      const X = x0 + x, Y = y0 + y;
      if (h3(X >> 1, Y >> 1, seed + 21) < chip) continue; // chipped paint shows the iron
      const lit = y === 0 || !M.m[(y - 1) * M.w + x];
      p.set(X, Y, lit ? mixc(col, 0xffffff, 0.25) : h3(X, Y, seed) < 0.12 ? mixc(col, 0x6a5a40, 0.4) : col);
      em.set(X, Y, 0xffffff);
    }
  };
  put(T, ox, oy, paint, 0.07);
  if (sub) put(sub, Math.round((w - sub.w) / 2), oy + T.h - 2, CR[2], 0.04);
  return { map: texOf(p), emissive: texOf(em), back: texOf(back) };
}

// ------------------------------------------------------------------ chains
/** a chain of torus links between two points, sagging a little; update(a, b) re-lays it */
export class Chain {
  readonly group = new THREE.Group();
  private links: THREE.Mesh[] = [];
  constructor(readonly n: number, readonly link = 0.075, mat?: THREE.Material) {
    const g = new THREE.TorusGeometry(link * 0.5, link * 0.16, 4, 8);
    g.scale(1, 1.6, 1);
    const m = mat ?? gbuf(new THREE.MeshPhongMaterial({ color: 0x5c646c, shininess: 30, flatShading: true }), 1);
    for (let i = 0; i < n; i++) { const l = new THREE.Mesh(g, m); l.castShadow = true; this.group.add(l); this.links.push(l); }
  }
  private _p = new V3(); private _q = new V3(); private _d = new V3(); private _u = new V3(0, 1, 0); private _qq = new THREE.Quaternion(); private _r = new THREE.Quaternion();
  update(a: THREE.Vector3, b: THREE.Vector3, sag = 0.12) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, t2 = (i + 1) / n;
      const at = (u: number, out: THREE.Vector3) => out.lerpVectors(a, b, u).setY(out.y - Math.sin(u * Math.PI) * sag);
      at(t, this._p); at(Math.min(1, t2), this._q);
      this._d.subVectors(this._q, this._p); if (this._d.lengthSq() < 1e-8) this._d.set(0, -1, 0);
      const l = this.links[i];
      l.position.copy(this._p);
      this._qq.setFromUnitVectors(this._u, this._d.normalize());
      this._r.setFromAxisAngle(this._u, i % 2 ? Math.PI / 2 : 0);
      l.quaternion.copy(this._qq).multiply(this._r);
    }
  }
}

// ------------------------------------------------------------------ a hanging iron sign
export interface Sign {
  id: string; label: string; key: string; tip: string;
  root: THREE.Group; plate: THREE.Mesh; flag: GFlag; lampMat: THREE.MeshBasicMaterial; mat: THREE.MeshLambertMaterial;
  w: number; h: number;
  rest: THREE.Vector3; pos: THREE.Vector3; vel: THREE.Vector3; ang: number; angV: number; tilt: number; tiltV: number; phase: number;
  hover: number; lit: number; enabled: boolean; gone: number;
  chains: Chain[]; hangFrom: (() => THREE.Vector3)[];
  eye(i: number, out?: THREE.Vector3): THREE.Vector3;
}
export function makeSign(id: string, label: string, w: number, h: number, seed: number, o: { sub?: string; size?: number; font?: string; key?: string; tip?: string } = {}): Sign {
  const tw = Math.round(w * 110), th = Math.round(h * 110);
  const art = signArt(label, tw, th, seed, { sub: o.sub, size: o.size, font: o.font });
  const flag: GFlag = { value: 1 };
  const mat = new THREE.MeshLambertMaterial({ map: art.map, emissiveMap: art.emissive, emissive: new THREE.Color(0xffc060), emissiveIntensity: 0, transparent: false, alphaTest: 0.5 }); gbuf(mat, flag);
  const backM = new THREE.MeshLambertMaterial({ map: art.back, alphaTest: 0.5 }); gbuf(backM, flag);
  const edge = gbuf(new THREE.MeshLambertMaterial({ color: 0x2a2e33 }), flag);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07), [edge, edge, edge, edge, mat, backM]);
  plate.castShadow = true; plate.receiveShadow = true;
  const root = new THREE.Group(); root.add(plate);
  // eye bolts at the top corners, a caged lamp in the middle that comes on with the hover
  const eyeM = gbuf(new THREE.MeshPhongMaterial({ color: 0x6a7076, flatShading: true }), flag);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 5, 10), eyeM); e.position.set(sx * w * 0.38, h / 2 + 0.035, 0); e.rotation.y = Math.PI / 2; root.add(e); }
  const lampMat = gbuf(new THREE.MeshBasicMaterial({ color: 0x3a2a14 }), 32);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), lampMat); lamp.position.set(0, h / 2 + 0.05, 0.04); root.add(lamp);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.06, 6, 1, true), gbuf(new THREE.MeshLambertMaterial({ color: 0x1a1c1e, wireframe: true }), 1)); cage.position.copy(lamp.position); root.add(cage);
  const s: Sign = {
    id, label, key: o.key ?? '', tip: o.tip ?? '', root, plate, flag, lampMat, mat, w, h,
    rest: new V3(), pos: new V3(), vel: new V3(), ang: 0, angV: 0, tilt: 0, tiltV: 0, phase: h3(seed, 1, 2) * TAU,
    hover: 0, lit: 0, enabled: true, gone: 0, chains: [], hangFrom: [],
    eye(i, out = new V3()) { return root.localToWorld(out.set((i ? 1 : -1) * w * 0.38, h / 2 + 0.06, 0)); },
  };
  return s;
}
/** spring physics for a sign: settle to rest, bob, swing; hovering pulls it toward the camera and lights it */
export function stepSign(s: Sign, dt: number, t: number) {
  const target = s.rest.clone();
  target.y += Math.sin(t * 0.55 + s.phase) * 0.05;
  target.z += s.hover * 0.28;
  target.x += s.gone * 7;
  target.y += s.gone * 1.5;
  const k = 7, c = 3.1;
  s.vel.addScaledVector(target.clone().sub(s.pos), k * dt).multiplyScalar(Math.exp(-c * dt));
  s.pos.addScaledVector(s.vel, dt);
  // the swing: a pendulum about the top edge, nudged by the sideways velocity
  s.angV += (-12 * s.ang - s.vel.x * 0.9 + Math.sin(t * 0.8 + s.phase) * 0.08) * dt; s.angV *= Math.exp(-1.6 * dt); s.ang += s.angV * dt;
  s.tiltV += (-10 * s.tilt + s.vel.z * 0.6 - s.hover * 0.6) * dt; s.tiltV *= Math.exp(-2 * dt); s.tilt += s.tiltV * dt;
  s.root.position.copy(s.pos);
  s.root.rotation.set(s.tilt * 0.6, Math.sin(t * 0.4 + s.phase) * 0.05, s.ang);
  s.lit += ((s.hover > 0.5 ? 1 : 0) - s.lit) * Math.min(1, dt * 10);
  s.mat.emissiveIntensity = s.lit * 1.1 + (s.enabled ? 0 : 0);
  s.lampMat.color.set(s.lit > 0.05 ? new THREE.Color(0xffd080).multiplyScalar(0.4 + s.lit * 1.6) : new THREE.Color(0x3a2a14));
  s.flag.value = s.hover > 0.5 ? 1 + F_HOVER : 1;
}
/** a clank: kick the sign back and set it swinging */
export function kickSign(s: Sign, k = 1) { s.vel.z -= 2.2 * k; s.vel.x += (Math.random() - 0.5) * 1.2 * k; s.angV += (Math.random() < 0.5 ? -1 : 1) * 2.6 * k; s.tiltV += 3 * k; }

// ------------------------------------------------------------------ the settings cog
/** an iron cog, extruded, with a painted face; spins */
export function makeGear(R = 0.55, teeth = 12) {
  const sh = new THREE.Shape();
  const Ri = R * 0.8, Rt = R;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * TAU, a1 = a0 + TAU / teeth;
    const pts: [number, number][] = [[Ri, a0], [Ri, a0 + 0.12 * (a1 - a0)], [Rt, a0 + 0.24 * (a1 - a0)], [Rt, a0 + 0.56 * (a1 - a0)], [Ri, a0 + 0.68 * (a1 - a0)]];
    pts.forEach(([r, a], k) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0 && k === 0) sh.moveTo(x, y); else sh.lineTo(x, y); });
  }
  sh.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, R * 0.26, 0, TAU, true); sh.holes.push(hole);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3, hp = new THREE.Path(); hp.absarc(Math.cos(a) * R * 0.53, Math.sin(a) * R * 0.53, R * 0.11, 0, TAU, true); sh.holes.push(hp); }
  const g = new THREE.ExtrudeGeometry(sh, { depth: R * 0.22, bevelEnabled: true, bevelSize: R * 0.03, bevelThickness: R * 0.03, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -R * 0.11);
  const face = ironPlate(64, 64, 41, { rivetStep: 100 });
  const t = texOf(face, true); t.repeat.set(1 / (2 * R), 1 / (2 * R)); t.offset.set(0.5, 0.5);
  const flag: GFlag = { value: 1 };
  const mat = gbuf(new THREE.MeshPhongMaterial({ map: t, color: 0xb0b4b8, shininess: 40, specular: 0x444444, flatShading: true }), flag);
  const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.34, 10), gbuf(new THREE.MeshPhongMaterial({ color: 0xb08a40, shininess: 70, flatShading: true }), flag));
  hub.rotation.x = Math.PI / 2; mesh.add(hub);
  return { mesh, flag };
}

// ------------------------------------------------------------------ nixie tubes (for the launch countdown)
const NIX = new Map<string, THREE.Texture>();
function nixieTex(ch: string) {
  let t = NIX.get(ch); if (t) return t;
  const W = 14, H = 20, p = new Pix(W, H);
  p.rect(0, 0, W, H, 0x0a0604);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) p.set(x, y, 0x1a0e08);
  const g = glyph7(ch);
  for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i]) for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) p.set(2 + i * 2 + dx, 3 + j * 2 + dy, 0x5a1c04);
  for (let j = 0; j < g.length; j++) for (let i = 0; i < g[j].length; i++) if (g[j][i]) { p.rect(2 + i * 2, 3 + j * 2, 2, 2, 0xff8a24); p.set(2 + i * 2, 3 + j * 2, 0xffd890); }
  t = texOf(p); NIX.set(ch, t); return t;
}
export class Nixies {
  readonly root = new THREE.Group();
  private mats: THREE.MeshBasicMaterial[] = []; private cur = '';
  constructor(n: number, w = 0.075) {
    const glass = gbuf(new THREE.MeshPhongMaterial({ color: 0x2a1a10, shininess: 90 }), 1), base = gbuf(new THREE.MeshLambertMaterial({ color: 0x1a1612 }), 1);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * w;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.42, 0.14, 10), glass); c.position.set(x, 0.07, 0); this.root.add(c);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.46, w * 0.5, 0.03, 10), base); b.position.set(x, 0.015, 0); this.root.add(b);
      const m = gbuf(new THREE.MeshBasicMaterial({ map: nixieTex(' ') }), 32); this.mats.push(m);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.66, 0.1), m); face.position.set(x, 0.075, w * 0.43); this.root.add(face);
    }
  }
  set(s: string) { if (s === this.cur) return; this.cur = s; const n = this.mats.length, t = s.slice(-n).padStart(n, ' '); this.mats.forEach((m, i) => { m.map = nixieTex(t[i]); m.needsUpdate = true; }); }
}

// ------------------------------------------------------------------ the sun
/** a pixel sun: a hard white disc with banded glow rings, a billboard */
export function makeSunGlare(size = 14) {
  const S = 96, p = new Pix(S, S), c = (S - 1) / 2;
  const B = [0x000000, 0x1a1408, 0x3a2c12, 0x6a5020, 0xa8843a, 0xe8c070, 0xfff0c8, 0xffffff];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - c, y - c) / c; if (d > 1) continue;
    const v = Math.pow(1 - d, 2.4) * (B.length - 1) * 1.15;
    const ray = Math.pow(Math.abs(Math.cos(Math.atan2(y - c, x - c) * 3)), 40) * (1 - d) * 3;
    p.set(x, y, dv(B, v + ray, x, y));
  }
  const t = texOf(p);
  const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }); gbuf(m, 0);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
  return mesh;
}
/** a painted iron plate as a data URL (DOM panels): w x h art pixels, shown at an integer scale */
const urlMemo = new Map<string, string>();
export function ironURL(w: number, h: number, seed = 5) { const k = `${w}x${h}:${seed}`; let u = urlMemo.get(k); if (!u) urlMemo.set(k, (u = ironPlate(w, h, seed, { rivetStep: 26 }).url())); return u; }
export { BR, RD };
