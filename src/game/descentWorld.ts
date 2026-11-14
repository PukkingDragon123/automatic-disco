// The ground of a region, built once for the two places that show it from the air: the orbital close-up on the
// planet screen (where the drop zone is picked) and the controllable descent (where it is flown to). It is the real
// Region the game will generate: its heightfield faceted and painted from the world's palette (woods darkening the
// canopy, rivers and damp ground, ore and crystal), instanced trees and rock formations, lumen spires glinting,
// set in a stylised landscape that runs out to a curved horizon under a sky dome that knows its altitude. Plus the
// painted drop-zone marks and the landing assessment of a point. World frame: cell (rx, rz) at (rx - N/2, h, rz - N/2).
import * as THREE from 'three';
import type { Region } from '../world/region';
import type { Palette } from '../world/palette';
import { gbuf } from '../gfx/gbuf';
import { Bin, lit, mesh, rawMat, V3, TAU, sm, hash, type V } from '../ui/deployKit';
import { clamp, lerp } from '../core/rand';

/** the curvature of the stylised world (m) */
export const RP = 60000;
const _v = new V3(), _v2 = new V3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export interface World { R: Region; N: number; pal: Palette; bin: Bin; parent: THREE.Object3D; gH(x: number, z: number): number; regionMesh?: THREE.Mesh }
export function makeWorld(R: Region, pal: Palette, bin: Bin, parent: THREE.Object3D): World {
  const N = R.N;
  return { R, N, pal, bin, parent, gH: (x, z) => R.groundSmooth(x + N / 2, z + N / 2) };
}
/** everything on the ground: far landscape, the region, water */
export function buildGround(W: World) { buildFar(W); buildRegion(W); buildWater(W); return W; }

// ------------------------------------------------------------------ sky
export const SKY_V = `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
export const SKY_F = `uniform vec3 uSun, uZen, uHor, uSpace, uSunCol; uniform float uAlt, uWhite, uDip;
varying vec3 vD;
float hs(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main(){
  vec3 d = normalize(vD);
  float h = d.y + uDip;
  float hc = clamp(h, 0.0, 1.0);
  vec3 low = mix(uZen, uHor, pow(1.0 - hc, 5.0));
  vec3 high = mix(uSpace, uHor * 1.1, pow(1.0 - hc, 40.0)) + uHor * 0.25 * pow(1.0 - hc, 9.0);
  vec3 col = mix(low, high, uAlt);
  if (h < 0.0) col = mix(uHor * 0.85, uHor * 0.55, clamp(-h * 3.0, 0.0, 1.0));
  float s = max(dot(d, uSun), 0.0);
  col += uSunCol * (pow(s, 1400.0) * 9.0 + pow(s, 60.0) * 0.35 + pow(s, 7.0) * 0.08 * (1.0 - uAlt * 0.6));
  if (uAlt > 0.05 && h > 0.0) { float st = step(0.9982, hs(floor(d * 380.0))); col += vec3(0.85, 0.85, 0.8) * st * uAlt * clamp(h * 5.0, 0.0, 1.0); }
  col = floor(col * 48.0) / 48.0;
  col = mix(col, vec3(0.82, 0.84, 0.86), uWhite);
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(0.0);
}`;
export interface Sky { mesh: THREE.Mesh; U: Record<string, THREE.IUniform> }
/** the sky dome (follow the camera with it): black space with stars high up, the palette's sky low down */
export function makeSky(W: World): Sky {
  const pal = W.pal;
  const U = {
    uSun: { value: new V3(-0.45, 0.42, -0.78).normalize() }, uZen: { value: new THREE.Color(pal.sky).lerp(new THREE.Color(0x44607a), 0.35) },
    uHor: { value: new THREE.Color(pal.horizon).lerp(new THREE.Color(0xc8d0d4), 0.25) }, uSpace: { value: new THREE.Color(0x03050a) },
    uSunCol: { value: new THREE.Color(pal.sun).lerp(new THREE.Color(0xfff0d8), 0.5) }, uAlt: { value: 1 }, uWhite: { value: 0 }, uDip: { value: 0 },
  };
  const m = mesh(W.bin, new THREE.SphereGeometry(30000, 32, 16), rawMat(W.bin, SKY_V, SKY_F, U, { side: THREE.BackSide, depthWrite: false }), W.parent, 0, 0, 0, false);
  m.renderOrder = -10; m.frustumCulled = false;
  return { mesh: m, U };
}
/** sky, fog and background for a camera at altitude alt (m above the region) */
export function skyAt(sky: Sky, scene: THREE.Scene, camY: number, alt: number, white = 0) {
  const altK = sm(250, 2200, alt);
  sky.U.uAlt.value = altK;
  sky.U.uDip.value = Math.sin(Math.sqrt((2 * Math.max(0, camY)) / RP));
  sky.U.uWhite.value = white;
  const fog = scene.fog as THREE.Fog;
  fog.color.copy(sky.U.uHor.value as THREE.Color).lerp(new THREE.Color(0xd4d8dc), white);
  fog.near = lerp(260 + alt * 0.5, 4, white); fog.far = lerp(5500 + alt * 5, 90, white);
  if (scene.background instanceof THREE.Color) scene.background.copy(fog.color).multiplyScalar(1 - altK * 0.9);
}

// ------------------------------------------------------------------ the ground
export function buildFar(W: World) {
  const R = W.R, N = W.N, pal = W.pal, bin = W.bin;
  const n = R.noise, G = 132, ext = 22000;
  const coord = (i: number) => { const u = (i / (G - 1)) * 2 - 1, a = Math.abs(u); return Math.sign(u) * (a < 0.08 ? (a / 0.08) * 70 : 70 + Math.pow((a - 0.08) / 0.92, 2.15) * (ext - 70)); };
  const pos = new Float32Array(G * G * 3), col = new Float32Array(G * G * 3);
  const bk = R.biome.key;
  const cA = new THREE.Color(bk === 'desert' ? pal.sand : bk === 'tundra' ? pal.snow : bk === 'ashland' ? pal.basalt : bk === 'savanna' ? pal.grassDry : bk === 'marsh' ? pal.mud : pal.grass);
  const cB = new THREE.Color(bk === 'desert' ? pal.clay : bk === 'tundra' ? pal.rock : bk === 'ashland' ? pal.rock : (pal.foliage[0] ?? pal.grass)).multiplyScalar(bk === 'jungle' ? 0.7 : 0.85);
  const cR = new THREE.Color(pal.rock), cS = new THREE.Color(pal.sand), cN = new THREE.Color(pal.snow);
  const amp = 6 + R.biome.rough * 60, c = new THREE.Color();
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const x = coord(i), z = coord(j), k = (j * G + i) * 3;
    const dIn = Math.max(Math.abs(x), Math.abs(z)) - N / 2;
    let y: number;
    const big = n.fbm2(x * 0.00045 + 31, z * 0.00045 - 7, 4), mid = n.fbm2(x * 0.004, z * 0.004, 3);
    const hFar = 4.2 + big * amp * 1.4 + mid * amp * 0.25 + Math.max(0, n.ridge2(x * 0.0008, z * 0.0008, 3) - 0.4) * amp * 2 * R.biome.rough;
    if (dIn < 0) y = W.gH(clamp(x, -N / 2 + 1, N / 2 - 1), clamp(z, -N / 2 + 1, N / 2 - 1)) - 2.5;
    else { const edge = W.gH(clamp(x, -N / 2 + 0.5, N / 2 - 0.5), clamp(z, -N / 2 + 0.5, N / 2 - 0.5)); y = lerp(edge - 0.3, hFar, sm(0, 220, dIn)); }
    const d2 = x * x + z * z; y -= d2 / (2 * RP);
    pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
    // colour: ground, woods, rock on the heights, sand at the shore, snow up high
    const h = y + d2 / (2 * RP);
    const f = n.fbm2(x * 0.0021 + 50, z * 0.0021, 3);
    c.copy(cA).lerp(cB, clamp((f + 0.1) * 2.2 * (bk === 'desert' ? 0.4 : 1), 0, 1));
    if (h < 5.2) c.lerp(cS, clamp((5.2 - h) / 1.4, 0, 1) * 0.8);
    if (h > 22) c.lerp(cR, clamp((h - 22) / 30, 0, 0.8));
    if (h > 60 && bk !== 'desert') c.lerp(cN, clamp((h - 60) / 40, 0, 0.9));
    c.multiplyScalar(0.92 + hash(i, j, 3) * 0.12);
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx: number[] = [];
  for (let j = 0; j < G - 1; j++) for (let i = 0; i < G - 1; i++) { const a = j * G + i, b = a + 1, cc = a + G, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = mesh(bin, g, lit(bin, 0xffffff, { vertexColors: true, flat: true, flag: 0 }), W.parent, 0, 0, 0, false);
  m.receiveShadow = true; m.frustumCulled = false;
}
function blockColor(W: World, b: number, x: number, z: number, out: THREE.Color) {
  const p = W.pal;
  const tbl = [p.grass, p.grassDry, p.soil, p.rock, p.sand, p.mud, p.clay, p.snow, p.basalt, p.ore, p.crystal, p.soil, p.rock, p.basalt];
  out.set(tbl[b] ?? p.grass);
  if (b === 11) out.lerp(new THREE.Color(p.grass), 0.4);
  if (b === 12) out.lerp(new THREE.Color(p.sand), 0.4);
  return out.multiplyScalar(0.9 + hash(x, z, 5) * 0.16);
}
export function buildRegion(W: World) {
  const R = W.R, N = W.N, bin = W.bin, pal = W.pal;
  // one vertex per cell centre, plus a skirt round the edge down into the far landscape
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color(), fol = new THREE.Color(pal.foliage[0] ?? pal.grass).multiplyScalar(0.62), wat = new THREE.Color(pal.water).lerp(new THREE.Color(0x2a4a5a), 0.3);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = z * N + x;
    let y = R.h[i];
    const ry = R.riverY[i];
    blockColor(W, R.b[i], x, z, c);
    const f = R.forest[i]; if (f > 0.2) c.lerp(fol, clamp((f - 0.2) * 1.1, 0, 0.75));
    if (ry > 0 && y < ry) { c.copy(wat); y = ry - 0.1; }
    if (R.damp[i] > 0.3) c.multiplyScalar(1 - (R.damp[i] - 0.3) * 0.25);
    pos.push(x + 0.5 - N / 2, y, z + 0.5 - N / 2); col.push(c.r, c.g, c.b);
  }
  for (let z = 0; z < N - 1; z++) for (let x = 0; x < N - 1; x++) { const a = z * N + x, b = a + 1, cc = a + N, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const m = mesh(bin, g, lit(bin, 0xffffff, { vertexColors: true, flat: true, flag: 1 }), W.parent, 0, 0, 0, false);
  m.receiveShadow = true; m.name = 'region-ground'; W.regionMesh = m;
  // woods: instanced conifers and broadleaf lumps where the forest is thick
  const trunk = new THREE.CylinderGeometry(0.12, 0.18, 1.2, 5); trunk.translate(0, 0.6, 0);
  const crownA = new THREE.ConeGeometry(1.1, 2.6, 6); crownA.translate(0, 2.3, 0);
  const crownB = new THREE.ConeGeometry(0.8, 1.8, 6); crownB.translate(0, 3.3, 0);
  const tg = mergeGeos([trunk, crownA, crownB]);
  [trunk, crownA, crownB].forEach((x) => x.dispose());
  const spots: [number, number, number][] = [];
  for (let z = 2; z < N - 2; z += 2) for (let x = 2; x < N - 2; x += 2) {
    const f = R.forest[z * N + x];
    if (f < 0.4 || hash(x, z, 11) > f || R.isWater(x + 0.5, z + 0.5) || R.isSolid(x + 0.5, z + 0.5)) continue;
    spots.push([x + 0.5 + (hash(x, z, 1) - 0.5) * 1.6, z + 0.5 + (hash(x, z, 2) - 0.5) * 1.6, 0.8 + hash(x, z, 3) * 0.9]);
    if (spots.length > 2200) break;
  }
  if (spots.length) {
    const im = new THREE.InstancedMesh(bin.g(tg), lit(bin, 0xffffff, { flat: true }), spots.length);
    const fc = pal.foliage.length ? pal.foliage : [pal.grass];
    spots.forEach(([x, z, s], i) => {
      _m.compose(_v.set(x - N / 2, R.groundSmooth(x, z) - 0.1, z - N / 2), _q.setFromAxisAngle(new V3(0, 1, 0), hash(x, z, 4) * TAU), _v2.set(s, s * (0.8 + hash(x, z, 6) * 0.5), s));
      im.setMatrixAt(i, _m);
      im.setColorAt(i, new THREE.Color(fc[Math.floor(hash(x, z, 7) * fc.length)]).multiplyScalar(0.7 + hash(x, z, 8) * 0.25));
    });
    im.castShadow = true; im.receiveShadow = true; W.parent.add(im);
  } else bin.g(tg);
  // rock formations as faceted boulders
  const rocks = R.rocks.filter((r) => r.kind !== 'pebble');
  if (rocks.length) {
    const rg = new THREE.DodecahedronGeometry(0.5, 0); rg.translate(0, 0.35, 0);
    const im = new THREE.InstancedMesh(bin.g(rg), lit(bin, 0xffffff, { flat: true }), rocks.length);
    const rc = [pal.rock, pal.sand, pal.basalt, pal.rock, 0x6a5038];
    rocks.forEach((r, i) => {
      _m.compose(_v.set(r.x - N / 2, r.y - 0.2, r.z - N / 2), _q.setFromEuler(new THREE.Euler(r.tilt * Math.cos(r.tiltDir), r.yaw, r.tilt * Math.sin(r.tiltDir))), _v2.set(r.sx, r.sy, r.sz));
      im.setMatrixAt(i, _m); im.setColorAt(i, new THREE.Color(rc[r.mat] ?? pal.rock).multiplyScalar(0.85 + hash(i, 1) * 0.2));
    });
    im.castShadow = true; im.receiveShadow = true; W.parent.add(im);
  }
  // lumen seams glint: small crystal spires
  const cr = R.deposits.filter((d) => d.kind === 'crystal');
  if (cr.length) {
    const sg = new THREE.ConeGeometry(0.25, 1.6, 5); sg.translate(0, 0.7, 0);
    const cm = bin.m(gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.crystal).multiplyScalar(1.6) }), 32));
    const im = new THREE.InstancedMesh(bin.g(sg), cm, cr.length * 6);
    let k = 0;
    for (const d of cr) for (let j = 0; j < 6; j++) {
      const a = (j / 6) * TAU + hash(d.x, j) * 0.8, rr = 0.6 + hash(d.z, j) * 1.8, x = d.x + Math.cos(a) * rr, z = d.z + Math.sin(a) * rr;
      _m.compose(_v.set(x - N / 2, R.groundSmooth(x, z) - 0.1, z - N / 2), _q.setFromEuler(new THREE.Euler((hash(j, 1) - 0.5) * 0.6, 0, (hash(j, 2) - 0.5) * 0.6)), _v2.setScalar(0.6 + hash(x, z) * 0.9));
      im.setMatrixAt(k++, _m);
    }
    W.parent.add(im);
  }
}
export function buildWater(W: World) {
  const pal = W.pal;
  const m = lit(W.bin, new THREE.Color(pal.water).lerp(new THREE.Color(0x234656), 0.45).getHex(), { phong: true, shininess: 90, flat: false, flag: 0 });
  (m as THREE.MeshPhongMaterial).specular = new THREE.Color(0x8a9aa0);
  const w = mesh(W.bin, new THREE.CircleGeometry(22000, 48), m, W.parent, 0, W.R.water - 0.08, 0, false);
  w.rotation.x = -Math.PI / 2; w.receiveShadow = true;
}

// ------------------------------------------------------------------ drop-zone marks
/** painted on the ground at a point: an 18 m dashed circle (on target), the 6 m red ring (bullseye), a cross */
export function dropMarks(W: World, L: V, o: { outer?: number; red?: number; paint?: number } = {}): THREE.Group {
  const bin = W.bin, g = new THREE.Group();
  const paint = o.paint ?? 0xe8e2d0, red = o.red ?? 0xd04a34;
  const ring = (r0: number, r1: number, col: number, dash = 0) => {
    const seg = 96, pos: number[] = [];
    for (let i = 0; i < seg; i++) {
      if (dash && i % 2) continue;
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const P = (a: number, r: number) => { const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r; return [x, W.gH(x, z) + 0.12, z]; };
      const A = P(a0, r0), B = P(a1, r0), C = P(a0, r1), D = P(a1, r1);
      pos.push(...A, ...C, ...B, ...B, ...C, ...D);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    mesh(bin, geo, bin.m(gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.4), side: THREE.DoubleSide }), 32)), g, 0, 0, 0, false);
  };
  const outer = o.outer ?? 18;
  ring(outer - 0.6, outer, paint, 1); ring(5.4, 6.2, red); ring(0, 0.9, paint);
  for (const a of [0, Math.PI / 2]) {
    const pos: number[] = [];
    for (let i = -1; i <= 1; i += 2) for (let k = 0; k < 6; k++) {
      const r0 = 1.6 + k * 0.6, r1 = r0 + 0.6, w = 0.25, ca = Math.cos(a), sa = Math.sin(a);
      const P = (r: number, s: number) => { const x = L.x + ca * r * i - sa * s, z = L.z + sa * r * i + ca * s; return [x, W.gH(x, z) + 0.12, z]; };
      const A = P(r0, -w), B = P(r1, -w), C = P(r0, w), D = P(r1, w);
      pos.push(...A, ...C, ...B, ...B, ...C, ...D);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    mesh(bin, geo, bin.m(gbuf(new THREE.MeshBasicMaterial({ color: new THREE.Color(paint).multiplyScalar(1.3), side: THREE.DoubleSide }), 32)), g, 0, 0, 0, false);
  }
  W.parent.add(g);
  return g;
}

// ------------------------------------------------------------------ is it good ground?
export interface LZInfo {
  x: number; z: number; ok: boolean; snapped: boolean; grid: string; elev: number; slope: number; ground: string;
  seam: { kind: 'ore' | 'crystal'; dist: number } | null; verdict: 'SUITABLE' | 'ROUGH' | 'NO LANDING'; note: string;
}
const LET = 'ABCDEFGH';
export const gridRef = (x: number, z: number) => `${LET[clamp(Math.floor(x / 16), 0, 7)]}-${clamp(Math.floor(z / 16), 0, 7) + 1}`;
const GROUND = ['grass', 'dry grass', 'bare soil', 'rock', 'sand', 'mud', 'clay', 'snow', 'basalt', 'ferrite', 'lumen crystal', 'leaf litter', 'gravel', 'impact glass'];
export function slopeAt(R: Region, x: number, z: number) {
  const a = R.groundSmooth(x - 1, z), b = R.groundSmooth(x + 1, z), c = R.groundSmooth(x, z - 1), d = R.groundSmooth(x, z + 1);
  return Math.hypot(b - a, d - c) / 2;
}
/** what the ground is like at a point (region coordinates), and whether a pod can come down there */
export function assessLZ(R: Region, x0: number, z0: number): LZInfo {
  let x = clamp(x0, 7, R.N - 7), z = clamp(z0, 7, R.N - 7), snapped = false, note = '';
  const water = R.isWater(x, z), solid = R.isSolid(x, z);
  if (water || solid) {
    const f = R.freeNear(x, z, 9);
    if (f) { x = f[0]; z = f[1]; snapped = true; note = water ? 'MOVED OFF THE WATER' : 'MOVED OFF THE ROCK'; }
  }
  const ok = !R.isWater(x, z) && !R.isSolid(x, z);
  const slope = slopeAt(R, x, z);
  let seam: LZInfo['seam'] = null;
  for (const d of R.deposits) { const dd = Math.hypot(d.x - x, d.z - z); if (!seam || dd < seam.dist) seam = { kind: d.kind, dist: dd }; }
  const verdict: LZInfo['verdict'] = !ok ? 'NO LANDING' : slope > 0.55 ? 'ROUGH' : 'SUITABLE';
  if (!note) note = !ok ? 'WATER OR ROCK ALL ROUND' : slope > 0.55 ? 'STEEP GROUND' : seam && seam.dist < 18 ? 'A SEAM WITHIN REACH' : 'GOOD OPEN GROUND';
  return { x, z, ok, snapped, grid: gridRef(x, z), elev: R.groundSmooth(x, z), slope, ground: GROUND[R.b[Math.floor(z) * R.N + Math.floor(x)]] ?? 'ground', seam, verdict, note };
}

/** merge plain geometries (position + normal + uv) into one */
export function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array as Float32Array, o * 3); nrm.set(g.attributes.normal.array as Float32Array, o * 3); o += g.attributes.position.count; }
  parts.forEach((g, i) => { if (g !== list[i]) g.dispose(); });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return out;
}
