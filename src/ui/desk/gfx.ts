// The desk's own little renderer. Unit 07's cockpit console is a real 3D scene, drawn by a second WebGL context into
// a canvas whose backing store is at ART resolution (one texel per art pixel, 2-4 device pixels each, chosen so the
// desk is ~640 art px across on any screen) and shown with nearest-neighbour upscaling. A composite pass gives it the
// rest of the game's pixel-art finish: a coloured 1 px outline round every silhouette (lighter on the lit upper-left
// side: selective outlining), a dark line where one part passes in front of another, and every colour snapped to the
// master palette (art/palette.ts) through a 32^3 lookup. Materials light in four planar steps from the upper left,
// with a hard 1-3 px specular glint on glossy parts: no gradients, no smooth falloff.
import * as THREE from 'three';
import { snap } from '../../art/palette';
import type { Pix } from '../machine';

/** light from the upper left and a little in front, in view space */
export const LIGHT = new THREE.Vector3(-0.5, 0.72, 0.48).normalize();

// ------------------------------------------------------------------ materials
const VS = /* glsl */`
varying vec2 vUv; varying vec3 vN;
#ifdef USE_COLOR
varying vec3 vCol;
#endif
void main() {
  vUv = uv; vN = normalize(normalMatrix * normal);
#ifdef USE_COLOR
  vCol = color;
#endif
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FS = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
uniform sampler2D map; uniform vec3 uTint, uLight, uGlow;
uniform float uEmit, uHover, uAlpha, uSpec, uFlag, uFlat, uDim;
varying vec2 vUv; varying vec3 vN;
#ifdef USE_COLOR
varying vec3 vCol;
#endif
void main() {
  vec4 tx = texture2D(map, vUv);
  if (tx.a < 0.5) discard;
  vec3 c = tx.rgb * uTint;
#ifdef USE_COLOR
  c *= vCol;
#endif
  vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
  float d = dot(n, uLight);
  // four planar light steps (ART.md: one ramp step per plane, hard cluster edges)
  float l = d > 0.62 ? 1.12 : d > 0.22 ? 0.96 : d > -0.18 ? 0.8 : 0.64;
  l = mix(l, 1.0, uFlat) * (1.0 - uDim);
  vec3 col = c * l * (1.0 + uHover * 0.3) + c * uEmit + uGlow;
  // a hard specular glint where the surface turns toward the light
  vec3 h = normalize(uLight + vec3(0.0, 0.0, 1.0));
  col = mix(col, vec3(0.92, 0.9, 0.82), step(0.992, dot(n, h)) * uSpec);
#ifdef GLASS
  gl_FragColor = vec4(col * uAlpha * tx.a, uAlpha * tx.a);
  gNormal = vec4(0.0);
#else
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(n * 0.5 + 0.5, uFlag);
#endif
}`;

export interface MatOpts { map?: THREE.Texture; tint?: number; emit?: number; spec?: number; flat?: number; outline?: boolean; glass?: number; vcol?: boolean; side?: THREE.Side }
/** a desk material: a pixel-art texture lit in planar steps. `glass` makes it a premultiplied transparent layer. */
export function mat(o: MatOpts = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS,
    uniforms: {
      map: { value: o.map ?? WHITE() }, uTint: { value: new THREE.Color(o.tint ?? 0xffffff) }, uLight: { value: LIGHT },
      uGlow: { value: new THREE.Color(0) }, uEmit: { value: o.emit ?? 0 }, uHover: { value: 0 }, uAlpha: { value: o.glass ?? 1 },
      uSpec: { value: o.spec ?? 0 }, uFlag: { value: o.outline === false ? 0 : 1 }, uFlat: { value: o.flat ?? 0 }, uDim: { value: 0 },
    },
    vertexColors: !!o.vcol, side: o.side ?? THREE.FrontSide,
  });
  if (o.glass !== undefined) {
    m.defines = { GLASS: 1 }; m.transparent = true; m.depthWrite = false;
    m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  }
  return m;
}
export type DeskMat = ReturnType<typeof mat>;
let white: THREE.Texture | null = null;
function WHITE() { if (!white) { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 1, 1); white = tex(c); } return white; }

/** a texture from a painted canvas or Pix: nearest, no mips, raw sRGB values (the whole pipeline stays in palette space) */
export function tex(src: HTMLCanvasElement | Pix, repeat = false): THREE.CanvasTexture {
  const c = src instanceof HTMLCanvasElement ? src : src.canvas();
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ------------------------------------------------------------------ geometry with UVs in art pixels
/** box-project UVs: each face takes the two world axes it spans, one texel per unit over a T-texel texture */
export function planarUV(g: THREE.BufferGeometry, T = 64, ox = 0, oy = 0) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let a: number, b: number;
    if (nx >= ny && nx >= nz) { a = p.getZ(i); b = p.getY(i); } else if (ny >= nz) { a = p.getX(i); b = p.getZ(i); } else { a = p.getX(i); b = p.getY(i); }
    uv[i * 2] = (a + ox) / T; uv[i * 2 + 1] = (b + oy) / T;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
/** flat facets: every triangle its own normal (planar pixel-art shading on low-poly rounds) */
export function facet(g: THREE.BufferGeometry) { const f = g.index ? g.toNonIndexed() : g; f.computeVertexNormals(); return f; }
export function box(w: number, h: number, d: number, T = 64) { return planarUV(facet(new THREE.BoxGeometry(w, h, d)), T); }
/** a cylinder along Y; UVs wrap round it in texel units (u = arc length / T) */
export function cyl(rt: number, rb: number, h: number, seg = 10, T = 64, cap = true) {
  const g = facet(new THREE.CylinderGeometry(rt, rb, h, seg, 1, !cap));
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), r = Math.max(rt, rb);
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getY(i)) > 0.9) { uv[i * 2] = (p.getX(i) + r) / T; uv[i * 2 + 1] = (p.getZ(i) + r) / T; continue; }
    const a = Math.atan2(p.getX(i), p.getZ(i));
    uv[i * 2] = ((a / (Math.PI * 2) + 0.5) * Math.PI * 2 * r) / T; uv[i * 2 + 1] = (p.getY(i) + h / 2) / T;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
/** a lathe from a profile [r, y] (bottom to top), faceted, UVs round and up in texels */
export function lathe(pts: [number, number][], seg = 10, T = 64) {
  const g = facet(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y)), seg));
  const p = g.attributes.position, uv = new Float32Array(p.count * 2), R = Math.max(...pts.map((q) => q[0]));
  for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getX(i), p.getZ(i)); uv[i * 2] = ((a / (Math.PI * 2) + 0.5) * Math.PI * 2 * R) / T; uv[i * 2 + 1] = p.getY(i) / T; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
/** a flat quad (decal) w x h facing +Z, UV 0..1 */
export function quad(w: number, h: number) { const g = new THREE.PlaneGeometry(w, h); return g; }
/** an extruded outline (x, y points), depth d along +Z, box UVs */
export function extrude(pts: [number, number][], d: number, T = 64) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = facet(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }));
  return planarUV(g, T);
}
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; }

// ------------------------------------------------------------------ the view
const QV = /* glsl */`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const QF = /* glsl */`
precision highp float;
uniform sampler2D tC, tN, tD, tLut;
uniform float uSnap, uEdge;
uniform ivec2 uSize;
vec3 lut(vec3 c) {
  vec3 q = floor(clamp(c, 0.0, 0.999) * 32.0);
  return texture2D(tLut, vec2((q.r + q.b * 32.0 + 0.5) / 1024.0, (q.g + 0.5) / 32.0)).rgb;
}
ivec2 cl(ivec2 p) { return clamp(p, ivec2(0), uSize - 1); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(tC, p, 0);
  ivec2 O[4] = ivec2[4](ivec2(1, 0), ivec2(0, -1), ivec2(-1, 0), ivec2(0, 1));
  if (c.a < 0.02) {
    // an empty pixel beside a solid outlined part: the outline, in the darkest step of that part's own colour;
    // lighter where the part's lit upper-left edge is (selective outline)
    for (int i = 0; i < 4; i++) {
      ivec2 q = cl(p + O[i]);
      vec4 nc = texelFetch(tC, q, 0), nn = texelFetch(tN, q, 0);
      if (nc.a > 0.9 && nn.a > 0.5) {
        float k = i < 2 ? 0.5 : 0.26;
        vec3 o = lut(nc.rgb * k);
        gl_FragColor = vec4(o, 1.0); return;
      }
    }
    gl_FragColor = vec4(0.0); return;
  }
  vec3 col = c.rgb / c.a;
  vec4 n = texelFetch(tN, p, 0);
  if (n.a > 0.5) {
    float d = texelFetch(tD, p, 0).r;
    vec3 nv = n.xyz * 2.0 - 1.0;
    for (int i = 0; i < 4; i++) {
      ivec2 q = cl(p + O[i]);
      vec4 nn = texelFetch(tN, q, 0);
      if (nn.a < 0.5) continue;
      float nd = texelFetch(tD, q, 0).r;
      // a part passing in front: this pixel sits just behind its edge
      if (d - nd > uEdge) { col *= i < 2 ? 0.55 : 0.36; break; }
      // a sharp crease between planes of one part: a soft interior line on the far plane
      if (abs(d - nd) < uEdge && dot(nv, nn.xyz * 2.0 - 1.0) < 0.35 && d > nd) { col *= 0.78; break; }
    }
  }
  if (uSnap > 0.5) col = lut(col);
  gl_FragColor = vec4(col * c.a, c.a);
}`;
let lutTex: THREE.DataTexture | null = null;
function paletteLUT() {
  if (lutTex) return lutTex;
  const d = new Uint8Array(1024 * 32 * 4);
  for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) for (let r = 0; r < 32; r++) {
    const c = snap(((r * 8 + 4) << 16) | ((g * 8 + 4) << 8) | (b * 8 + 4)), i = (g * 1024 + b * 32 + r) * 4;
    d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = 255;
  }
  lutTex = new THREE.DataTexture(d, 1024, 32, THREE.RGBAFormat);
  lutTex.magFilter = lutTex.minFilter = THREE.NearestFilter; lutTex.colorSpace = THREE.NoColorSpace; lutTex.needsUpdate = true;
  return lutTex;
}

/** desk-space units are art pixels: the orthographic frustum is exactly the backing store */
export class DeskView {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  private rt: THREE.WebGLRenderTarget;
  private comp: THREE.ShaderMaterial; private cs = new THREE.Scene(); private co = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** device pixels per art pixel */
  k = 2; W = 640; H = 360; dpr = 1;
  /** the camera's pitch (radians down from horizontal) */
  pitch = 0.62;
  ok = true;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'desk3d';
    parent.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: false, premultipliedAlpha: true, stencil: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    const dt = new THREE.DepthTexture(4, 4, THREE.FloatType);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { count: 2, type: THREE.UnsignedByteType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: dt });
    this.comp = new THREE.ShaderMaterial({
      vertexShader: QV, fragmentShader: QF, depthTest: false, depthWrite: false, transparent: false,
      uniforms: { tC: { value: this.rt.textures[0] }, tN: { value: this.rt.textures[1] }, tD: { value: dt }, tLut: { value: paletteLUT() }, uSnap: { value: 1 }, uEdge: { value: 6 / 4000 }, uSize: { value: new THREE.Vector2(4, 4) } },
    });
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const q = new THREE.Mesh(tri, this.comp); q.frustumCulled = false; this.cs.add(q);
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.ok = true; });
  }
  /** pick the art-pixel size for the screen and size everything to it; returns true when it changed */
  resize(): boolean {
    const dpr = devicePixelRatio || 1, dw = Math.round(innerWidth * dpr), dh = Math.round(innerHeight * dpr);
    const k = Math.max(1, Math.round(dw / 660));
    const W = Math.ceil(dw / k), H = Math.ceil(dh / k);
    if (k === this.k && W === this.W && H === this.H && dpr === this.dpr) return false;
    this.k = k; this.W = W; this.H = H; this.dpr = dpr;
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = (W * k) / dpr + 'px'; this.canvas.style.height = (H * k) / dpr + 'px';
    this.rt.setSize(W, H);
    (this.comp.uniforms.uSize.value as THREE.Vector2).set(W, H);
    const c = this.cam; c.left = -W / 2; c.right = W / 2; c.top = H; c.bottom = 0; c.updateProjectionMatrix();
    this.aim();
    return true;
  }
  /** the camera looks down at `pitch`; desk-space origin lands on the bottom centre of the screen */
  aim() {
    const c = this.cam, p = this.pitch;
    c.position.set(0, Math.sin(p) * 2000, Math.cos(p) * 2000);
    c.up.set(0, 1, 0); c.lookAt(0, 0, 0); c.updateMatrixWorld();
  }
  /** screen (CSS px, from the top left) -> normalised device coords for the raycaster */
  ndc(x: number, y: number, out: THREE.Vector2) {
    const r = this.canvas.getBoundingClientRect();
    return out.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }
  /** a desk-space point -> CSS px on the page */
  toScreen(v: THREE.Vector3, out = new THREE.Vector2()) {
    const p = v.clone().project(this.cam), r = this.canvas.getBoundingClientRect();
    return out.set(r.left + (p.x * 0.5 + 0.5) * r.width, r.top + (-p.y * 0.5 + 0.5) * r.height);
  }
  render() {
    if (!this.ok) return;
    const r = this.renderer;
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.clear(true, true, false);
    r.render(this.scene, this.cam);
    r.setRenderTarget(null); r.setClearColor(0x000000, 0); r.clear(true, true, false);
    r.render(this.cs, this.co);
  }
  dispose() { this.rt.dispose(); this.renderer.dispose(); this.canvas.remove(); }
}
