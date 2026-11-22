// TROOPS · GROUND MARKS. Everything the orders draw on the ground, in one dynamic mesh rebuilt each frame (one draw):
// the selected units' rings at their feet (an ink band under a lit band, conforming to the terrain, a slow tick of
// dashes on the hovered and the box-previewed), the ORDER MARKERS (the order's glyph stamped on the ground, landing
// with a squash, two rings pulsing out from it, then a slow heartbeat while the order is live), the PATH LINES
// (dashes that run toward the goal along the unit's own route, through every queued waypoint) and the FORMATION
// preview while the right button drags. Pixel art on the ground: crisp texels, an ink outline, dithered fades (no
// soft alpha), written into the G-buffer with no outline flag.
import * as THREE from 'three';
import type { Game } from '../game/game';
import { glyph } from './art';

type G = Game & Record<string, any>;
const MAXQ = 9000;
const CELLS = ['move', 'attack', 'gather', 'build', 'repair', 'follow', 'guard', 'patrol', 'hold', 'amove', 'stop', 'dot'];
const AT = 8, CELL = 32;
export type MarkK = 'move' | 'amove' | 'attack' | 'gather' | 'build' | 'repair' | 'follow' | 'guard' | 'patrol' | 'hold' | 'stop';
export const MARK_COL: Record<string, number> = { move: 0xe8e0b0, amove: 0xff8a5a, attack: 0xff5a48, gather: 0xffc860, build: 0xffb050, repair: 0x8ad8ff, follow: 0xd8f0ff, guard: 0x9ad87a, patrol: 0x7ab8ff, hold: 0xd8c08a, stop: 0xd0d0d0 };
interface Mark { x: number; z: number; k: MarkK; t: number; life: number; big: boolean }

const VERT = /* glsl */`
attribute vec4 col; attribute float mode;
varying vec2 vUv; varying vec4 vCol; varying float vMode;
void main() {
  vUv = uv; vCol = col; vMode = mode;
  // pulled a little toward the eye: the marks read over grass and ground cover, still behind units and trees
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xyz -= normalize(mv.xyz) * 0.45;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
uniform sampler2D uAtlas;
varying vec2 vUv; varying vec4 vCol; varying float vMode;
float bay(vec2 p) {
  vec2 q = mod(floor(p), 4.0); float x = q.x, y = q.y;
  float v = mod(x, 2.0) * 2.0 + mod(y, 2.0) * 3.0 - mod(x, 2.0) * mod(y, 2.0) * 4.0;
  float w = floor(x / 2.0) * 2.0 + floor(y / 2.0) * 3.0 - floor(x / 2.0) * floor(y / 2.0) * 4.0;
  return (v * 4.0 + w + 0.5) / 16.0;
}
void main() {
  vec4 c = vCol;
  if (vMode > 0.5) { vec4 t = texture2D(uAtlas, vUv); if (t.a < 0.5) discard; c = vec4(t.rgb * vCol.rgb, vCol.a); }
  if (bay(gl_FragCoord.xy * 0.5) >= c.a) discard;
  gl_FragColor = vec4(c.rgb, 1.0);
  gNormal = vec4(0.5, 1.0, 0.5, 0.0);
}`;

export class Decals {
  readonly mesh: THREE.Mesh;
  private pos = new Float32Array(MAXQ * 4 * 3); private uv = new Float32Array(MAXQ * 4 * 2); private col = new Float32Array(MAXQ * 4 * 4); private mode = new Float32Array(MAXQ * 4);
  private n = 0;
  private marks: Mark[] = [];
  private geo = new THREE.BufferGeometry();
  private c = new THREE.Color();
  t = 0;
  constructor(readonly g: G) {
    const idx = new Uint32Array(MAXQ * 6);
    for (let i = 0; i < MAXQ; i++) { const v = i * 4, k = i * 6; idx[k] = v; idx[k + 1] = v + 2; idx[k + 2] = v + 1; idx[k + 3] = v + 1; idx[k + 4] = v + 2; idx[k + 5] = v + 3; }
    const geo = this.geo;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('mode', new THREE.BufferAttribute(this.mode, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uAtlas: { value: atlasTex() } }, depthWrite: false, depthTest: true, transparent: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.name = 'troopMarks';
    this.mesh.userData.noBlur = true; this.mesh.userData.bpSkip = true;
    g.world.scene.add(this.mesh);
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); (this.mesh.material as THREE.Material).dispose(); }
  /** an order landed here */
  mark(x: number, z: number, k: MarkK, big = true) { this.marks.push({ x, z, k, t: 0, life: big ? 1.6 : 1.1, big }); if (this.marks.length > 60) this.marks.shift(); }

  // ------------------------------------------------------------------ the frame
  begin(dt: number) { this.n = 0; this.t += dt; for (const m of this.marks) m.t += dt; this.marks = this.marks.filter((m) => m.t < m.life); }
  end() {
    const g = this.geo;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true; (g.attributes.uv as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.col as THREE.BufferAttribute).needsUpdate = true; (g.attributes.mode as THREE.BufferAttribute).needsUpdate = true;
    g.setDrawRange(0, this.n * 6);
    this.mesh.visible = this.n > 0;
  }
  /** the fresh order markers (pulse rings + the glyph bouncing in) */
  drawMarks() {
    for (const m of this.marks) {
      const k = m.t / m.life, col = MARK_COL[m.k] ?? 0xffffff;
      // the glyph lands: drops in big, squashes, settles, fades out at the end
      const land = Math.min(1, m.t / 0.28), sq = land < 1 ? 1.7 - 0.7 * land : 1 + Math.sin(Math.min(1, (m.t - 0.28) / 0.22) * Math.PI) * 0.18;
      const a = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      const s = (m.big ? 1.15 : 0.8) * sq;
      this.glyph(m.x, m.z, s, m.k, col, a);
      // two pulse rings rolling out
      for (let i = 0; i < 2; i++) {
        const u = (m.t - i * 0.16) / 0.7; if (u < 0 || u > 1) continue;
        const r = 0.3 + u * (m.big ? 1.6 : 1.1);
        this.ring(m.x, m.z, r, 0.07 + (1 - u) * 0.07, col, (1 - u) * 0.95, 0, 0, true);
      }
    }
  }
  /** a persistent marker at an order's goal (small, beating slowly) */
  waypoint(x: number, z: number, k: MarkK, phase = 0, a = 0.85) {
    const col = MARK_COL[k] ?? 0xffffff, b = 0.5 + 0.5 * Math.sin(this.t * 4 + phase);
    this.glyph(x, z, 0.62 + b * 0.06, k, col, a);
    this.ring(x, z, 0.42 + b * 0.12, 0.05, col, a * (0.45 + b * 0.3), 0, 0, true);
  }

  // ------------------------------------------------------------------ primitives
  private y(x: number, z: number) { const N = this.g.region.N; return this.g.world.surfaceY(Math.max(0, Math.min(N - 0.01, x)), Math.max(0, Math.min(N - 0.01, z))) + 0.05; }
  private quad(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number, col: number, a: number, uv?: [number, number, number, number], lift = 0, ys?: [number, number, number, number]) {
    if (this.n >= MAXQ) return;
    const i = this.n++, p = this.pos, o = i * 12;
    const pts = [[ax, az], [bx, bz], [cx, cz], [dx, dz]];
    for (let k = 0; k < 4; k++) { p[o + k * 3] = pts[k][0]; p[o + k * 3 + 1] = (ys ? ys[k] : this.y(pts[k][0], pts[k][1])) + lift; p[o + k * 3 + 2] = pts[k][1]; }
    const u = this.uv, ou = i * 8;
    if (uv) { u[ou] = uv[0]; u[ou + 1] = uv[1]; u[ou + 2] = uv[2]; u[ou + 3] = uv[1]; u[ou + 4] = uv[0]; u[ou + 5] = uv[3]; u[ou + 6] = uv[2]; u[ou + 7] = uv[3]; }
    this.c.setHex(col);
    const C = this.col, oc = i * 16;
    for (let k = 0; k < 4; k++) { C[oc + k * 4] = this.c.r; C[oc + k * 4 + 1] = this.c.g; C[oc + k * 4 + 2] = this.c.b; C[oc + k * 4 + 3] = a; }
    const M = this.mode, om = i * 4; const mv = uv ? 1 : 0; M[om] = M[om + 1] = M[om + 2] = M[om + 3] = mv;
  }
  /** a band round (x, z) at radius r, an ink band under it; dashes > 0 cuts it into that many turning dashes */
  ring(x: number, z: number, r: number, w: number, col: number, a = 1, dashes = 0, spin = 0, ink = true) {
    const n = Math.max(20, Math.min(56, Math.round(r * 26))), t = this.t * spin;
    const ys: number[] = [];
    for (let i = 0; i <= n; i++) { const an = (i / n) * Math.PI * 2; ys.push(this.y(x + Math.sin(an) * r, z + Math.cos(an) * r)); }
    const band = (r0: number, r1: number, c: number, al: number, lift: number) => {
      for (let i = 0; i < n; i++) {
        if (dashes > 0) { const f = ((i / n) * dashes + t) % 1; if (f > 0.55) continue; }
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
        this.quad(x + s0 * r0, z + c0 * r0, x + s1 * r0, z + c1 * r0, x + s0 * r1, z + c0 * r1, x + s1 * r1, z + c1 * r1, c, al, undefined, lift, [ys[i], ys[i + 1], ys[i], ys[i + 1]]);
      }
    };
    if (ink) band(r - w * 0.5 - 0.035, r + w * 0.5 + 0.035, 0x08090c, a, 0);
    band(r - w * 0.5, r + w * 0.5, col, a, 0.004);
  }
  /** a glyph stamped flat on the ground, upright toward the camera's view */
  glyph(x: number, z: number, s: number, k: string, col: number, a = 1) {
    const i = Math.max(0, CELLS.indexOf(k)), u0 = (i % AT) / AT, v0 = Math.floor(i / AT) / 2;
    const yaw = this.g.cam?.yaw ?? 0, cs = Math.cos(yaw), sn = Math.sin(yaw);
    // screen right on the ground = (cos yaw, -sin yaw); screen up (away from the camera) = (-sin yaw, -cos yaw)
    const rx = cs * s * 0.5, rz = -sn * s * 0.5, ux = -sn * s * 0.5, uz = -cs * s * 0.5;
    this.quad(x - rx + ux, z - rz + uz, x + rx + ux, z + rz + uz, x - rx - ux, z - rz - uz, x + rx - ux, z + rz - uz, mixW(col), a, [u0, 1 - v0, u0 + 1 / AT, 1 - v0 - 0.5], 0.01);
  }
  /** a dashed strip through points (draped), dashes running toward the end */
  path(pts: [number, number][], w: number, col: number, a = 0.9, speed = 1.6) {
    let along = -this.t * speed;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0); if (L < 0.05) continue;
      const nx = -(z1 - z0) / L, nz = (x1 - x0) / L, step = 0.45;
      for (let s = 0; s < L; s += step) {
        const e = Math.min(L, s + step), ph = ((along + s) % 1 + 1) % 1;
        if (ph > 0.55) continue;
        const ax = x0 + (x1 - x0) * (s / L), az = z0 + (z1 - z0) * (s / L), bx = x0 + (x1 - x0) * (e / L) * 0.98 + (x1 - x0) * 0.02 * (s / L), bz = z0 + (z1 - z0) * (e / L) * 0.98 + (z1 - z0) * 0.02 * (s / L);
        const wi = w + 0.07;
        this.quad(ax - nx * wi, az - nz * wi, bx - nx * wi, bz - nz * wi, ax + nx * wi, az + nz * wi, bx + nx * wi, bz + nz * wi, 0x08090c, a);
        this.quad(ax - nx * w, az - nz * w, bx - nx * w, bz - nz * w, ax + nx * w, az + nz * w, bx + nx * w, bz + nz * w, col, a, undefined, 0.004);
      }
      along += L;
    }
  }
  /** an arrow head on the ground pointing along `ang` (formation facing) */
  arrow(x: number, z: number, ang: number, s: number, col: number, a = 1) {
    const fx = Math.sin(ang), fz = Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang);
    const tip: [number, number] = [x + fx * s, z + fz * s], l: [number, number] = [x - fx * s * 0.2 - rx * s * 0.7, z - fz * s * 0.2 - rz * s * 0.7], r: [number, number] = [x - fx * s * 0.2 + rx * s * 0.7, z - fz * s * 0.2 + rz * s * 0.7];
    const w = 0.12;
    for (const [p, q] of [[l, tip], [r, tip]] as [[number, number], [number, number]][]) {
      const L = Math.hypot(q[0] - p[0], q[1] - p[1]), nx = -(q[1] - p[1]) / L, nz = (q[0] - p[0]) / L;
      this.quad(p[0] - nx * (w + 0.07), p[1] - nz * (w + 0.07), q[0] - nx * (w + 0.07), q[1] - nz * (w + 0.07), p[0] + nx * (w + 0.07), p[1] + nz * (w + 0.07), q[0] + nx * (w + 0.07), q[1] + nz * (w + 0.07), 0x08090c, a);
      this.quad(p[0] - nx * w, p[1] - nz * w, q[0] - nx * w, q[1] - nz * w, p[0] + nx * w, p[1] + nz * w, q[0] + nx * w, q[1] + nz * w, col, a, undefined, 0.004);
    }
  }
}
const mixW = (c: number) => c;

let atlas: THREE.Texture | null = null;
/** the ground glyphs: each order's glyph, lit and outlined, grown 2x with EPX, in an 8 x 2 atlas of 32 px cells */
function atlasTex(): THREE.Texture {
  if (atlas) return atlas;
  const cv = document.createElement('canvas'); cv.width = AT * CELL; cv.height = 2 * CELL;
  const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false;
  CELLS.forEach((k, i) => {
    const name = k === 'amove' ? 'attack' : k === 'dot' ? 'hold' : k;
    const p = glyph(name, [0xffffff, 0xffe0c0, 0x9a9a9a], 2), x = (i % AT) * CELL + Math.floor((CELL - p.w) / 2), y = Math.floor(i / AT) * CELL + Math.floor((CELL - p.h) / 2);
    c.drawImage(p.canvas(), x, y);
  });
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  atlas = t;
  return t;
}
