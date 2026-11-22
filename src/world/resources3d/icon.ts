// Item icons rendered from the items' own 3D models (Limbophobia's method, in this game's house style). The model
// (a unit or a small pile) is posed at a clean three-quarter angle, framed tight and rendered at 4x in two raw
// passes: palette codes (every surface's ramp and step, from tiles painted at the icon's own texel density, so a
// texel is an icon pixel and nothing is mixed-resolution) and view normals with depth. Each icon pixel takes the
// majority code of its samples; then it is shaded the way a pixel artist shades: by moving along its own ramp
// (light from the upper left in four bands, glints on metal and glass, glow that never darkens), a strong lit lip
// on the silhouette's upper-left and a cool rim on its shadow side, crevice shade where one surface tucks under
// another, an ink line wherever a nearer part overlaps a farther one, stray single pixels cleaned up, and a bold
// black outline round the whole. Every colour is a master-palette colour; the outline is the world's line colour.
import * as THREE from 'three';
import { formOf } from './forms';
import { iconMesher } from './piles';
import { codeTex } from './paint';
import { keyCode, isSolid } from './mats';
import { rampOf, cRamp, cStep, cFlags, F_EMIT, F_GLOSS, F_METAL, F_GLASS, INK } from './codes';

const VERT_C = /* glsl */`
uniform float uS; varying vec2 vUv;
void main() { vUv = uv * uS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG_C = /* glsl */`
uniform sampler2D uMap; uniform vec4 uCode; uniform float uUse; varying vec2 vUv;
void main() { vec4 c = uUse > 0.5 ? texture2D(uMap, vUv) : uCode; gl_FragColor = vec4(c.rgb, 1.0); }`;
const VERT_N = /* glsl */`
uniform float uNear, uFar; varying vec3 vN; varying float vD;
void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = (-mv.z - uNear) / (uFar - uNear); gl_Position = projectionMatrix * mv; }`;
const FRAG_N = /* glsl */`
varying vec3 vN; varying float vD;
void main() { gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, clamp(vD, 0.0, 1.0)); }`;

const PPM_STEPS = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512];
const ppmStep = (p: number) => PPM_STEPS.reduce((a, b) => (Math.abs(b - p) < Math.abs(a - p) ? b : a));
const blank = new THREE.DataTexture(new Uint8Array(4), 1, 1);
blank.needsUpdate = true;

export interface IconOpts { size: number; ss?: number; yaw?: number; pitch?: number; n?: number; seed?: number; /** px of black outline */ line?: number }
export interface Icon { size: number; rgba: Uint8ClampedArray }

let rt: THREE.WebGLRenderTarget | null = null;
const L = new THREE.Vector3(-0.5, 0.68, 0.53).normalize(), Hv = new THREE.Vector3().addVectors(L, new THREE.Vector3(0, 0, 1)).normalize();

/** render one item's icon (RGBA, size x size) with a WebGL renderer */
export function renderIcon(r: THREE.WebGLRenderer, id: string, o: IconOpts): Icon {
  const f = formOf(id), size = o.size, SS = o.ss ?? 4, W = size * SS, line = o.line ?? 1;
  const M = iconMesher(id, o.n ?? f.icon?.n ?? 1, o.seed ?? f.icon?.seed ?? 2, f.icon?.as);
  const parts = M.build();
  const yaw = o.yaw ?? f.icon?.yaw ?? 0.62, pitch = o.pitch ?? f.icon?.pitch ?? 0.56;
  // the frame: every vertex posed, projected, bounds taken
  const rot = new THREE.Matrix4().makeRotationY(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, rad = 0;
  const bb = M.bounds(), ctr = bb.getCenter(new THREE.Vector3());
  for (const p of parts) { const pa = p.geo.attributes.position as THREE.BufferAttribute; for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).sub(ctr).applyMatrix4(rot); const sx = v.x, sy = v.y * cp - v.z * sp; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); rad = Math.max(rad, v.length()); } }
  const margin = line + 1, span = Math.max(x1 - x0, y1 - y0) * (size / (size - margin * 2)) + 1e-5;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, ppm = size / span, tp = ppmStep(ppm);
  const scene = new THREE.Scene(), pivot = new THREE.Group(); pivot.rotation.y = yaw; scene.add(pivot);
  const holder = new THREE.Group(); holder.position.copy(ctr).multiplyScalar(-1); pivot.add(holder);
  const dist = rad * 3 + 1, near = dist - rad * 1.05, far = dist + rad * 1.05;
  const cam = new THREE.OrthographicCamera(mx - span / 2, mx + span / 2, my + span / 2, my - span / 2, near, far);
  cam.position.set(0, sp * dist, cp * dist); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateProjectionMatrix();
  // shift the frame so the projection centre is the bounds' centre: lookAt(0) puts (0,0) at the middle of left..right
  const cMats: THREE.ShaderMaterial[] = [], meshes: THREE.Mesh[] = [];
  for (const p of parts) {
    let m: THREE.ShaderMaterial;
    if (isSolid(p.mat)) { const c = keyCode(p.mat); m = new THREE.ShaderMaterial({ vertexShader: VERT_C, fragmentShader: FRAG_C, uniforms: { uMap: { value: blank }, uCode: { value: new THREE.Vector4(cRamp(c) / 255, cStep(c) / 255, cFlags(c) / 255, 1) }, uUse: { value: 0 }, uS: { value: 1 } } }); }
    else { const t = codeTex(p.mat, tp); m = new THREE.ShaderMaterial({ vertexShader: VERT_C, fragmentShader: FRAG_C, uniforms: { uMap: { value: t }, uCode: { value: new THREE.Vector4() }, uUse: { value: 1 }, uS: { value: t.repeat.x } } }); }
    cMats.push(m);
    const mesh = new THREE.Mesh(p.geo, m); holder.add(mesh); meshes.push(mesh);
  }
  const nMat = new THREE.ShaderMaterial({ vertexShader: VERT_N, fragmentShader: FRAG_N, uniforms: { uNear: { value: near }, uFar: { value: far } } });
  if (!rt || rt.width !== W) { rt?.dispose(); rt = new THREE.WebGLRenderTarget(W, W, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, type: THREE.UnsignedByteType }); }
  const codeBuf = new Uint8Array(W * W * 4), nBuf = new Uint8Array(W * W * 4);
  const prevT = r.getRenderTarget(), prevC = new THREE.Color(); r.getClearColor(prevC); const prevA = r.getClearAlpha();
  const prevSM = r.shadowMap.enabled;
  try {
    r.shadowMap.enabled = false;
    r.setRenderTarget(rt); r.setClearColor(0x000000, 0);
    r.clear(true, true, true); r.render(scene, cam); r.readRenderTargetPixels(rt, 0, 0, W, W, codeBuf);
    for (const m of meshes) m.material = nMat;
    r.clear(true, true, true); r.render(scene, cam); r.readRenderTargetPixels(rt, 0, 0, W, W, nBuf);
  } finally {
    r.setRenderTarget(prevT); r.setClearColor(prevC, prevA); r.shadowMap.enabled = prevSM;
    for (const m of cMats) m.dispose(); nMat.dispose(); for (const p of parts) p.geo.dispose();
  }
  return { size, rgba: pixelPass(codeBuf, nBuf, W, size, SS, (far - near), ppm, line) };
}

/** the pixel pass: supersamples to codes, then ramp shading, rim light, ink lines and the outline */
function pixelPass(cb: Uint8Array, nb: Uint8Array, W: number, S: number, SS: number, depthRange: number, ppm: number, line: number): Uint8ClampedArray {
  const N = S * S, code = new Int32Array(N).fill(-1), nx = new Float32Array(N), ny = new Float32Array(N), nz = new Float32Array(N), dep = new Float32Array(N);
  const cnt = new Map<number, number>();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    cnt.clear(); let cov = 0, ax = 0, ay = 0, az = 0, dmin = 1;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      const k = (((S - 1 - y) * SS + j) * W + x * SS + i) * 4;
      if (cb[k + 3] < 128) continue;
      cov++; const c = (cb[k + 2] << 16) | (cb[k] << 8) | cb[k + 1];
      cnt.set(c, (cnt.get(c) ?? 0) + 1);
      ax += nb[k] / 127.5 - 1; ay += nb[k + 1] / 127.5 - 1; az += nb[k + 2] / 127.5 - 1; dmin = Math.min(dmin, nb[k + 3] / 255);
    }
    if (cov < SS * SS * 0.4) continue;
    let best = -1, bn = 0; for (const [c, n] of cnt) if (n > bn) { bn = n; best = c; }
    const p = y * S + x, l = Math.hypot(ax, ay, az) || 1;
    code[p] = best; nx[p] = ax / l; ny[p] = ay / l; nz[p] = az / l; dep[p] = dmin * depthRange;
  }
  // fill pin holes, drop lone pixels
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && code[y * S + x] >= 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = y * S + x, nbs = (op(x - 1, y) ? 1 : 0) + (op(x + 1, y) ? 1 : 0) + (op(x, y - 1) ? 1 : 0) + (op(x, y + 1) ? 1 : 0);
    if (code[p] < 0 && nbs >= 3) { const q = op(x - 1, y) ? p - 1 : op(x + 1, y) ? p + 1 : p - S; code[p] = code[q]; nx[p] = nx[q]; ny[p] = ny[q]; nz[p] = nz[q]; dep[p] = dep[q]; }
    else if (code[p] >= 0 && nbs === 0) code[p] = -1;
  }
  // ---- shade: step along the ramp
  const out = new Int32Array(N).fill(-1); // final 0xRRGGBB, -2 = ink
  const stepOf = new Int32Array(N);
  const edgeT = Math.max(0.012, 3.2 / ppm);
  const D = (x: number, y: number) => dep[y * S + x];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = y * S + x, c = code[p]; if (c < 0) continue;
    const rampId = (c >> 8) & 255, base = c & 255, fl = (c >> 16) & 255, R = rampOf(rampId), n = R.length;
    const d = nx[p] * L.x + ny[p] * L.y + nz[p] * L.z;
    let band = d >= 0.74 ? 1 : d >= 0.3 ? 0 : d >= -0.08 ? -1 : -2;
    if (fl & F_EMIT) band = Math.max(0, band) + 1;
    if (fl & (F_METAL | F_GLOSS | F_GLASS)) { const s = nx[p] * Hv.x + ny[p] * Hv.y + nz[p] * Hv.z; if (s > (fl & F_METAL ? 0.9 : 0.94)) band += 2; else if (fl & F_GLASS && s > 0.8) band += 1; }
    // crevices: a pixel well behind its neighbourhood sits in the shade of what is round it
    let near = 0, k2 = 0;
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, 1], [1, -1], [-1, 1]]) if (op(x + dx, y + dy)) { near += D(x + dx, y + dy); k2++; }
    if (k2 >= 6 && dep[p] - near / k2 > edgeT * 0.8) band -= 1;
    stepOf[p] = Math.max(0, Math.min(n - 1, base + band));
  }
  // ---- rim light on the silhouette, ink where a nearer part overlaps a farther one
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = y * S + x, c = code[p]; if (c < 0) continue;
    const R = rampOf((c >> 8) & 255), n = R.length; let st = stepOf[p];
    let ink = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { if (!op(x + dx, y + dy)) continue; if (dep[p] - D(x + dx, y + dy) > edgeT) { ink = true; break; } }
    if (ink) { out[p] = -2; continue; }
    const upEmpty = !op(x, y - 1), leftEmpty = !op(x - 1, y), rightEmpty = !op(x + 1, y), downEmpty = !op(x, y + 1);
    if ((upEmpty || leftEmpty) && (ny[p] * 0.7 - nx[p] * 0.6) > -0.15) st = Math.min(n - 1, Math.max(st + 2, n - 2));
    else if ((rightEmpty || downEmpty) && nx[p] > 0.25 && st < n - 2) st = st + 1;
    out[p] = R[st];
  }
  // ---- clean up lone pixels (a pixel unlike all four neighbours, which agree)
  const fin = out.slice();
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const p = y * S + x, c = out[p]; if (c < 0) continue;
    const a = out[p - 1], b = out[p + 1], u = out[p - S], d = out[p + S];
    if (a >= 0 && a === b && a === u && a === d && c !== a) fin[p] = a;
  }
  // ---- the outline: every empty pixel touching the shape (4-connected), a second ring for thicker lines
  const rgba = new Uint8ClampedArray(N * 4);
  const solid = (q: number) => fin[q] !== -1;
  const ring = new Uint8Array(N);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = y * S + x; if (solid(p)) continue;
    if ((x > 0 && solid(p - 1)) || (x < S - 1 && solid(p + 1)) || (y > 0 && solid(p - S)) || (y < S - 1 && solid(p + S))) ring[p] = 1;
  }
  if (line > 1) {
    const r2 = ring.slice();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const p = y * S + x; if (solid(p) || ring[p]) continue; if ((x > 0 && ring[p - 1]) || (x < S - 1 && ring[p + 1]) || (y > 0 && ring[p - S]) || (y < S - 1 && ring[p + S])) r2[p] = 1; }
    ring.set(r2);
  }
  for (let p = 0; p < N; p++) {
    const c = fin[p] === -2 || ring[p] ? INK : fin[p];
    if (c === -1 && !ring[p]) continue;
    rgba[p * 4] = (c >> 16) & 255; rgba[p * 4 + 1] = (c >> 8) & 255; rgba[p * 4 + 2] = c & 255; rgba[p * 4 + 3] = 255;
  }
  return rgba;
}
/** an icon as a data URL */
export function iconURL(ic: Icon, scale = 1): string {
  const c = document.createElement('canvas'); c.width = c.height = ic.size * scale;
  const x = c.getContext('2d')!;
  const t = document.createElement('canvas'); t.width = t.height = ic.size; t.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(ic.rgba), ic.size, ic.size), 0, 0);
  x.imageSmoothingEnabled = false; x.drawImage(t, 0, 0, ic.size * scale, ic.size * scale);
  return c.toDataURL();
}
