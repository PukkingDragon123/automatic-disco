// Shared parts for the deployment sequence (deploy*.ts, game/descent.ts): a disposal bin that owns exactly what
// the sequence created (LIMBOPHOBIA's cached props, rigs and atlas materials are never freed from here), G-buffer
// materials, pixel-painted textures in the 1957 U.S. Planetary Corps idiom (riveted hull plate in haze grey,
// olive-drab enamel, diamond tread, hazard stripes, worn stencil paint, the star-and-bar roundel), lofted hull
// geometry, and fx-layer shader materials (premultiplied, so the post composite and bloom take them as they are).
import * as THREE from 'three';
import { gbuf, GN_DECL } from '../gfx/gbuf';
import { Pix, GM, OL, CR, RD, AM, INK, dv, mixc } from './machine';
import { clamp } from '../core/rand';

export const V3 = THREE.Vector3;
export type V = THREE.Vector3;
export const TAU = Math.PI * 2;
export const ease = {
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t: number) => 1 - (1 - t) * (1 - t),
  in: (t: number) => t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  smooth: (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); },
};
export const sm = (a: number, b: number, v: number) => ease.smooth((v - a) / (b - a));
const h2 = (x: number, y: number, s = 0) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

// ------------------------------------------------------------------ ownership
/** everything the deployment created: freed in one go when its scene ends */
export class Bin {
  private geos = new Set<THREE.BufferGeometry>(); private mats = new Set<THREE.Material>(); private texs = new Set<THREE.Texture>();
  private fns: (() => void)[] = [];
  g<T extends THREE.BufferGeometry>(g: T) { this.geos.add(g); return g; }
  m<T extends THREE.Material>(m: T) { this.mats.add(m); return m; }
  t<T extends THREE.Texture>(t: T) { this.texs.add(t); return t; }
  on(f: () => void) { this.fns.push(f); }
  /** take ownership of every geometry, material and map under obj (objects built per call: the globe, the golem) */
  adopt(obj: THREE.Object3D) {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) this.geos.add(m.geometry);
      const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
      for (const x of mats) {
        this.mats.add(x);
        for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap'] as const) { const t = (x as any)[k]; if (t && t.isTexture) this.texs.add(t); }
      }
    });
    return obj;
  }
  dispose() {
    for (const f of this.fns.splice(0)) { try { f(); } catch (e) { console.error('deploy dispose', e); } }
    this.geos.forEach((g) => g.dispose()); this.mats.forEach((m) => m.dispose()); this.texs.forEach((t) => t.dispose());
    this.geos.clear(); this.mats.clear(); this.texs.clear();
  }
}

// ------------------------------------------------------------------ materials
export interface LitOpts { map?: THREE.Texture | null; emissive?: number; emissiveMap?: THREE.Texture | null; flat?: boolean; phong?: boolean; shininess?: number; side?: THREE.Side; flag?: number; alphaTest?: number; vertexColors?: boolean; polyOffset?: number }
/** lit and outlined (flag 1), flat-shaded unless told otherwise */
export function lit(bin: Bin, color: number, o: LitOpts = {}): THREE.MeshLambertMaterial | THREE.MeshPhongMaterial {
  const base = { color, map: o.map ?? null, emissive: new THREE.Color(o.emissive ?? 0), emissiveMap: o.emissiveMap ?? null, flatShading: o.flat !== false, side: o.side ?? THREE.FrontSide, alphaTest: o.alphaTest ?? 0, vertexColors: !!o.vertexColors };
  const m = o.phong ? new THREE.MeshPhongMaterial({ ...base, shininess: o.shininess ?? 40, specular: new THREE.Color(0x4a4a46) }) : new THREE.MeshLambertMaterial(base);
  if (o.polyOffset) { m.polygonOffset = true; m.polygonOffsetFactor = -o.polyOffset; m.polygonOffsetUnits = -o.polyOffset * 2; }
  gbuf(m, o.flag ?? 1);
  return bin.m(m);
}
/** an unlit lamp / screen face: opaque, no outline, flagged as an emitter so bloom picks it up */
export function lamp(bin: Bin, color: number | THREE.Color, k = 1, map: THREE.Texture | null = null) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color as any).multiplyScalar(k), map });
  gbuf(m, 32);
  return bin.m(m);
}
/**
 * A blended shader material (premultiplied): 'add' glows, 'alpha' covers (smoke, cloud). It lives in the main scene:
 * the fragment source must end by writing gNormal = vec4(0.0), which leaves the G-buffer untouched under either
 * blend (the blend factors on that attachment come from its own zero alpha).
 */
export function fxMat(bin: Bin, vert: string, frag: string, uniforms: Record<string, THREE.IUniform>, mode: 'add' | 'alpha', o: { side?: THREE.Side; depthTest?: boolean } = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: GN_DECL + frag, uniforms, transparent: true, depthWrite: false, depthTest: o.depthTest !== false, side: o.side ?? THREE.FrontSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: mode === 'add' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: mode === 'add' ? THREE.ZeroFactor : THREE.OneFactor, blendDstAlpha: mode === 'add' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
  });
  (m as any).__gb = true;
  return bin.m(m);
}
/** a main-scene shader material (writes gNormal as told by the fragment source, which must include GN_DECL) */
export function rawMat(bin: Bin, vert: string, frag: string, uniforms: Record<string, THREE.IUniform>, o: Partial<THREE.ShaderMaterialParameters> = {}) {
  const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: GN_DECL + frag, uniforms, ...o });
  (m as any).__gb = true;
  return bin.m(m);
}

// ------------------------------------------------------------------ meshes
export function mesh(bin: Bin, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], parent?: THREE.Object3D, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(bin.g(geo), mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; parent?.add(m); return m;
}
export function box(bin: Bin, w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], parent?: THREE.Object3D, x = 0, y = 0, z = 0) {
  return mesh(bin, new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
}
export function cyl(bin: Bin, rt: number, rb: number, h: number, mat: THREE.Material | THREE.Material[], parent?: THREE.Object3D, x = 0, y = 0, z = 0, seg = 16) {
  return mesh(bin, new THREE.CylinderGeometry(rt, rb, h, seg), mat, parent, x, y, z);
}
/** a box whose faces repeat a texture at a fixed texel density (repeats per world unit) */
export function tbox(bin: Bin, w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], density: number, parent?: THREE.Object3D, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute, nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const px = pos.getX(i) + x, py = pos.getY(i) + y, pz = pos.getZ(i) + z;
    if (nx > 0.5) uv.setXY(i, pz * density, py * density); else if (ny > 0.5) uv.setXY(i, px * density, pz * density); else uv.setXY(i, px * density, py * density);
  }
  return mesh(bin, g, mat, parent, x, y, z);
}
/** a beam between two points (truss members, cables, rails) */
export function beam(bin: Bin, a: V, b: V, r: number, mat: THREE.Material, parent?: THREE.Object3D, square = true) {
  const len = a.distanceTo(b);
  const g = square ? new THREE.BoxGeometry(r * 2, len, r * 2) : new THREE.CylinderGeometry(r, r, len, 6);
  const m = mesh(bin, g, mat, parent);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
/** a flat decal (stencil paint) lying on a surface: centre, outward normal, up direction in the surface, width */
export function decal(bin: Bin, t: { tex: THREE.Texture; aspect: number }, w: number, parent: THREE.Object3D, at: V, normal: V, up = new V3(0, 1, 0), color = 0xffffff) {
  const m = lit(bin, color, { map: t.tex, alphaTest: 0.5, polyOffset: 2, flat: true });
  const me = mesh(bin, new THREE.PlaneGeometry(w, w / t.aspect), m, parent, at.x, at.y, at.z, false);
  const z = normal.clone().normalize(), x = up.clone().cross(z).normalize(), y = z.clone().cross(x);
  me.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  me.position.addScaledVector(z, 0.02);
  return me;
}
/**
 * A hull lofted through stations along z: each station is (z, half width, half height, y centre, chamfer 0..1).
 * The cross-section is a chamfered rectangle; u runs round the perimeter and v along z, both in world units
 * times density, so a tiling plate texture keeps one texel size everywhere.
 */
export function loft(stations: [number, number, number, number, number][], density: number, caps = true): THREE.BufferGeometry {
  const ring = (hw: number, hh: number, c: number) => {
    const cx = hw * c * 0.5, cy = hh * c * 0.5;
    return [[hw, -hh + cy], [hw, hh - cy], [hw - cx, hh], [-hw + cx, hh], [-hw, hh - cy], [-hw, -hh + cy], [-hw + cx, -hh], [hw - cx, -hh]] as [number, number][];
  };
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = 8;
  for (let s = 0; s < stations.length; s++) {
    const [z, hw, hh, yc, c] = stations[s];
    const r = ring(hw, hh, c);
    let u = 0;
    for (let i = 0; i <= P; i++) {
      const p = r[i % P];
      if (i > 0) { const q = r[i - 1]; u += Math.hypot(p[0] - q[0], p[1] - q[1]); }
      pos.push(p[0], p[1] + yc, z); uv.push(u * density, z * density);
    }
  }
  for (let s = 0; s < stations.length - 1; s++) for (let i = 0; i < P; i++) {
    const a = s * (P + 1) + i, b = a + 1, c = a + P + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g = g.toNonIndexed();
  if (caps) {
    // flat end caps (fan) at the first and last station
    const extra: number[] = [], euv: number[] = [];
    for (const [s, flip] of [[0, true], [stations.length - 1, false]] as [number, boolean][]) {
      const [z, hw, hh, yc, c] = stations[s];
      const r = ring(hw, hh, c);
      for (let i = 0; i < P; i++) {
        const a = r[i], b = r[(i + 1) % P];
        const tri = flip ? [[0, 0], b, a] : [[0, 0], a, b];
        for (const p of tri) { extra.push(p[0], p[1] + yc, z); euv.push(p[0] * density, (p[1] + yc) * density); }
      }
    }
    const pa = g.attributes.position.array as Float32Array, ua = g.attributes.uv.array as Float32Array;
    const np = new Float32Array(pa.length + extra.length); np.set(pa); np.set(extra, pa.length);
    const nu = new Float32Array(ua.length + euv.length); nu.set(ua); nu.set(euv, ua.length);
    g.setAttribute('position', new THREE.BufferAttribute(np, 3)); g.setAttribute('uv', new THREE.BufferAttribute(nu, 2));
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ textures
/** a pixel texture: crisp up close (nearest), filtered with mipmaps when small, so hulls don't shimmer */
export function ptex(bin: Bin, p: Pix | HTMLCanvasElement, repeat = true, mips = true) {
  const c = p instanceof Pix ? p.canvas() : p;
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter; t.generateMipmaps = mips;
  t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return bin.t(t);
}
/** U.S. Navy haze grey, deck grey and a darker keel grey (muted, a breath of olive) */
export const HAZE = [0x22262a, 0x2c3135, 0x363c40, 0x41474b, 0x4c5256, 0x585e61, 0x656a6c, 0x737877, 0x838781, 0x989a92];
export const OLIVE = OL;

/**
 * Riveted hull plating, 128 px tile: courses of plates of uneven length, each plate its own tone, lapped seams with
 * a highlight under them, rivet lines along every seam, weld runs, rain-free grime streaking down from the seams
 * (exhaust soot in space) and a few chips to bare steel.
 */
export function hullPix(R: number[] = HAZE, seed = 3, W = 128, H = 128, course = 32) {
  const p = new Pix(W, H);
  const rows = Math.round(H / course);
  for (let r = 0; r < rows; r++) {
    const y0 = r * course;
    let x = Math.floor(h2(r, 1, seed) * 40);
    const cuts: number[] = [];
    while (x < W + 60) { cuts.push(x); x += 26 + Math.floor(h2(x, r, seed) * 34); }
    for (let c = 0; c < cuts.length - 1; c++) {
      const xa = cuts[c], xb = cuts[c + 1], tone = 4.2 + (h2(c, r, seed + 2) - 0.5) * 1.6;
      for (let yy = 0; yy < course; yy++) for (let xx = xa; xx < xb; xx++) {
        const X = ((xx % W) + W) % W, Y = y0 + yy;
        const streak = (h2(X, 0, seed + 5) < 0.18 ? (yy / course) * 0.9 : 0) * (h2(X >> 2, r, seed) < 0.5 ? 1 : 0.4);
        const v = tone + (h2(X, Y, seed) - 0.5) * 0.7 - streak + (yy < 2 ? 0.8 : 0) - (yy > course - 3 ? 0.6 : 0);
        p.set(X, Y, dv(R, v, X, Y));
      }
      // vertical butt seam with a rivet column
      const sx = ((xb % W) + W) % W;
      for (let yy = 0; yy < course; yy++) { p.set(sx, y0 + yy, R[1]); p.set((sx + 1) % W, y0 + yy, R[6]); }
      for (let yy = 3; yy < course - 2; yy += 4) { p.set((sx + 3) % W, y0 + yy, R[8]); p.set((sx + 4) % W, y0 + yy + 1, R[2]); p.set((sx - 2 + W) % W, y0 + yy, R[8]); p.set((sx - 1 + W) % W, y0 + yy + 1, R[2]); }
    }
    // the lap seam along the course and its rivet rows
    for (let xx = 0; xx < W; xx++) { p.set(xx, y0, R[0]); p.set(xx, y0 + 1, R[7]); }
    for (let xx = 2; xx < W; xx += 4) { p.set(xx, y0 + 4, R[8]); p.set(xx + 1, y0 + 5, R[2]); p.set(xx, y0 + course - 4, R[8]); p.set(xx + 1, y0 + course - 3, R[2]); }
    // a weld run and a chip or two
    if (h2(r, 9, seed) < 0.6) { const wy = y0 + 10 + Math.floor(h2(r, 3, seed) * 12); for (let xx = 0; xx < W; xx++) if (h2(xx >> 3, r, seed) < 0.4) p.set(xx, wy, xx % 2 ? R[3] : R[6]); }
    for (let k = 0; k < 2; k++) {
      const cx = Math.floor(h2(r, k + 20, seed) * W), cy = y0 + 6 + Math.floor(h2(k, r + 20, seed) * (course - 12)), rr = 1.5 + h2(k, r, seed) * 2;
      for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) if (xx * xx + yy * yy * 1.4 < rr * rr) p.set((cx + xx + W) % W, cy + yy, xx + yy < 0 ? GM[8] : GM[7]);
    }
  }
  return p;
}
/** olive-drab enamel on a pressed steel panel (pod skin, crates, consoles) */
export function enamelPix(R: number[] = OL, seed = 4, W = 64, H = 64) {
  const p = new Pix(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = 5 + (h2(x >> 3, y >> 3, seed) - 0.5) * 0.5 + (h2(x, y, seed) - 0.5) * 0.6 - (y / H) * 0.5;
    p.set(x, y, dv(R, v, x, y));
  }
  for (let x = 0; x < W; x++) { p.set(x, 0, R[2]); p.set(x, 1, R[7]); p.set(x, H - 1, R[1]); }
  for (let y = 0; y < H; y++) { p.set(0, y, R[2]); p.set(1, y, R[7]); p.set(W - 1, y, R[1]); }
  for (const [x, y] of [[4, 4], [W - 5, 4], [4, H - 5], [W - 5, H - 5], [W >> 1, 4], [W >> 1, H - 5]]) { p.set(x, y, R[8]); p.set(x + 1, y + 1, R[1]); }
  // knocks to bare steel at an edge
  for (let k = 0; k < 3; k++) { const cx = Math.floor(h2(k, 7, seed) * W), cy = h2(k, 8, seed) < 0.5 ? 2 : H - 3; for (let i = -2; i <= 2; i++) p.set(cx + i, cy + (Math.abs(i) > 1 ? 0 : h2(i, k, seed) < 0.5 ? 1 : 0), GM[7 + (i & 1)]); }
  return p;
}
/** diamond tread deck plate with weld seams */
export function treadPix(seed = 11, W = 64) {
  const p = new Pix(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) p.set(x, y, dv(GM, 3.6 + (h2(x >> 2, y >> 2, seed) - 0.5) * 0.8 + (h2(x, y, seed) - 0.5) * 0.5, x, y));
  for (let y = 2; y < W; y += 6) for (let x = (y / 6) % 2 ? 1 : 4; x < W; x += 6) { p.set(x, y, GM[6]); p.set(x + 1, y + 1, GM[2]); p.set(x + 1, y, GM[7]); }
  for (let x = 0; x < W; x++) { p.set(x, 0, GM[1]); p.set(x, 1, GM[5]); }
  for (let y = 0; y < W; y++) { p.set(0, y, GM[1]); p.set(1, y, GM[5]); }
  // tyre scuffs and oil
  for (let k = 0; k < 2; k++) { const cx = h2(k, 1, seed) * W, cy = h2(k, 2, seed) * W; for (let y = -6; y <= 6; y++) for (let x = -8; x <= 8; x++) if (x * x / 64 + y * y / 36 < 1 && h2(x, y, k) < 0.6) p.shade(Math.floor(cx + x) & (W - 1), Math.floor(cy + y) & (W - 1), 0.72); }
  return p;
}
/** hazard stripes (muted safety amber on black), diagonal */
export function hazardPix(W = 32, H = 8, period = 8) {
  const p = new Pix(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const on = ((x + y) % period) < period / 2;
    const wear = h2(x, y, 9) < 0.07;
    p.set(x, y, wear ? GM[7] : on ? dv(AM, 5.2 + (h2(x, y, 3) - 0.5) * 0.8, x, y) : dv(GM, 1.4 + h2(x, y, 4) * 0.6, x, y));
  }
  return p;
}
/**
 * Stencil paint from a pixel font at native size, thresholded hard, with stencil bridges cut through the strokes
 * and worn patches where the paint has flaked. Transparent background (for decals).
 */
export function stencil(bin: Bin, s: string, o: { font?: string; size?: number; color?: number; wear?: number; bridges?: boolean; pad?: number; bg?: number } = {}) {
  const size = o.size ?? 20, font = o.font ?? 'Superwide', pad = o.pad ?? 2;
  const m = document.createElement('canvas').getContext('2d')!; m.font = `${size}px ${font}`;
  const w = Math.ceil(m.measureText(s).width) + pad * 2, h = Math.ceil(size * 1.15) + pad * 2;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.font = `${size}px ${font}`; g.textBaseline = 'top'; g.fillStyle = '#fff'; g.fillText(s, pad, pad + 1);
  const id = g.getImageData(0, 0, w, h);
  const out = new Pix(w, h), col = o.color ?? CR[4], wear = o.wear ?? 0.08;
  if (o.bg !== undefined) out.rect(0, 0, w, h, o.bg);
  const bridgeY = Math.floor(pad + size * 0.55);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (id.data[(y * w + x) * 4 + 3] < 120) continue;
    if (o.bridges && y === bridgeY && h2(x >> 2, 1, 3) < 0.5) continue;
    const flake = h2(x >> 1, y >> 1, 17) < wear && h2(x >> 3, y >> 2, 5) < 0.5;
    if (flake) continue;
    out.set(x, y, mixc(col, 0x000000, h2(x, y, 2) * 0.12));
  }
  return { tex: ptex(bin, out, false, true), aspect: w / h, w, h };
}
/** the national insignia, star and bars, worn: navy disc, white star, white bars with a red stripe */
export function insignia(bin: Bin) {
  const W = 96, H = 40, p = new Pix(W, H), cx = W / 2 - 0.5, cy = H / 2 - 0.5, R = 18.5;
  const navy = 0x1c2a4a, white = CR[4], red = mixc(RD[5], 0x5a554c, 0.25);
  // the bars
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inBar = Math.abs(y - cy) < 8.5 && Math.abs(x - cx) < 46;
    if (inBar) p.set(x, y, Math.abs(y - cy) < 8.5 && Math.abs(y - cy) > 6.5 ? navy : Math.abs(y - cy) < 2.5 ? red : white);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, y - cy); if (d < R) p.set(x, y, d > R - 1.5 ? INK : navy);
  }
  const star: number[] = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * TAU, r = i % 2 ? 6.6 : 17; star.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let ins = false;
    for (let i = 0, j = star.length - 2; i < star.length; j = i, i += 2) { const xi = star[i], yi = star[i + 1], xj = star[j], yj = star[j + 1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; }
    if (ins) p.set(x, y, white);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (p.a(x, y) && h2(x >> 1, y >> 1, 41) < 0.06) p.clear(x, y);
  return { tex: ptex(bin, p, false, true), aspect: W / H, w: W, h: H };
}
/** lit window strips for the island and the control gallery: warm lamps, a few dark, blinds half down */
export function windowPix(cols = 8, seed = 2) {
  const W = cols * 8, H = 8, p = new Pix(W, H);
  for (let i = 0; i < cols; i++) {
    const on = h2(i, 0, seed) > 0.22, blind = Math.floor(h2(i, 1, seed) * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < 8; x++) {
      const X = i * 8 + x;
      if (x === 0 || y === 0 || y === H - 1) { p.set(X, y, GM[2]); continue; }
      p.set(X, y, !on ? GM[1] : y <= blind ? mixc(AM[5], 0x202020, 0.45) : mixc(AM[7], 0xffffff, 0.15 * (1 - y / H)));
    }
  }
  return p;
}
/** a deterministic 0..1 hash for scattering details by hand-chosen rules */
export const hash = h2;

/**
 * Merge every static mesh under root into one mesh per material (position, normal, uv), in root's space. Meshes
 * under an object in keep (anything that animates) are left alone, as are instanced, skinned, vertex-coloured and
 * multi-material meshes. Cuts hundreds of draw calls to a few dozen.
 */
export function mergeStatic(bin: Bin, root: THREE.Object3D, keep: Set<THREE.Object3D>) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), M = new THREE.Matrix4();
  const groups = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean; recv: boolean; order: number }>();
  const victims: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as any).isInstancedMesh || (m as any).isSkinnedMesh || Array.isArray(m.material) || !m.visible) return;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (keep.has(p)) return;
    const mat = m.material as THREE.Material;
    if ((mat as any).vertexColors) return;
    const src = m.geometry;
    if (!src.attributes.uv || !src.attributes.normal || !src.attributes.position) return;
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    g.applyMatrix4(M.multiplyMatrices(inv, m.matrixWorld));
    let e = groups.get(mat); if (!e) groups.set(mat, (e = { geos: [], cast: false, recv: false, order: m.renderOrder }));
    e.geos.push(g); e.cast ||= m.castShadow; e.recv ||= m.receiveShadow;
    victims.push(m);
  });
  for (const v of victims) { v.removeFromParent(); v.geometry.dispose(); }
  for (const [mat, e] of groups) {
    let n = 0; for (const g of e.geos) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of e.geos) { pos.set(g.attributes.position.array as Float32Array, o * 3); nrm.set(g.attributes.normal.array as Float32Array, o * 3); uv.set(g.attributes.uv.array as Float32Array, o * 2); o += g.attributes.position.count; g.dispose(); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    const me = new THREE.Mesh(bin.g(out), mat); me.castShadow = e.cast; me.receiveShadow = e.recv; me.renderOrder = e.order; me.name = 'merged';
    root.add(me);
  }
  return { meshes: groups.size, merged: victims.length };
}
