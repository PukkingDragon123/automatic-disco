// A small modelling kit for the laboratory: boxes, cylinders, lathes, tubes, tori and decal quads, transformed by a
// matrix stack and merged per material into flat-shaded, non-indexed geometry. Surfaces are UV'd by projecting the
// world position on the face's dominant axis at each material's texel density (textures run on across faces like
// paint); decals take a rect of the decal sheet. Vertex colours tint.
import * as THREE from 'three';
import { gbuf } from '../gfx/gbuf';
import { decUV, type LabTex } from './labArt';

type V3 = [number, number, number];
interface Buf { p: number[]; n: number[]; uv: number[]; c: number[] }
/** [u0, vTop, u1, vBottom] */
export type UVR = [number, number, number, number];
export interface PO { col?: number; dec?: string | UVR; skip?: ('top' | 'bottom' | 'px' | 'nx' | 'pz' | 'nz')[]; faces?: Partial<Record<'top' | 'bottom' | 'px' | 'nx' | 'pz' | 'nz', string>> }

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
const _col = new THREE.Color();

export class Kit {
  private bufs = new Map<string, Buf>();
  private m = new THREE.Matrix4();
  private st: THREE.Matrix4[] = [];
  /** texture repeats per metre, per material (world-projected UVs) */
  static TS: Record<string, number> = { floor: 0.5, tile: 0.625, plaster: 0.8, concrete: 0.8, olive: 2.6, cream: 2.6, gun: 2.6, navy: 2.6, red: 2.6, haz: 2.2, brass: 4, copper: 8, rubber: 6, oak: 1.2, porcelain: 5, bulb: 4, bulbCyan: 4, decal: 1, glass: 1 };
  push() { this.st.push(this.m.clone()); return this; }
  pop() { this.m.copy(this.st.pop() ?? new THREE.Matrix4()); return this; }
  at(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) { this.m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1))); return this; }
  scl(x: number, y: number, z: number) { this.m.multiply(new THREE.Matrix4().makeScale(x, y, z)); return this; }
  private buf(mat: string) { let b = this.bufs.get(mat); if (!b) this.bufs.set(mat, b = { p: [], n: [], uv: [], c: [] }); return b; }

  /** one triangle; uvs given, or world-projected when omitted */
  tri(mat: string, a: V3, b: V3, c: V3, uv?: [number, number][], col = 0xffffff) {
    const B = this.buf(mat);
    _a.set(a[0], a[1], a[2]).applyMatrix4(this.m); _b.set(b[0], b[1], b[2]).applyMatrix4(this.m); _c.set(c[0], c[1], c[2]).applyMatrix4(this.m);
    _n.crossVectors(_e1.subVectors(_b, _a), _e2.subVectors(_c, _a));
    if (_n.lengthSq() < 1e-14) return this;
    _n.normalize();
    _col.set(col);
    const ts = Kit.TS[mat] ?? 2;
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    for (const [k, p] of [_a, _b, _c].entries()) {
      B.p.push(p.x, p.y, p.z); B.n.push(_n.x, _n.y, _n.z); B.c.push(_col.r, _col.g, _col.b);
      if (uv) B.uv.push(uv[k][0], uv[k][1]);
      else if (ax >= ay && ax >= az) B.uv.push(p.z * ts * Math.sign(_n.x || 1), -p.y * ts);
      else if (ay >= az) B.uv.push(p.x * ts, p.z * ts * Math.sign(_n.y || 1));
      else B.uv.push(-p.x * ts * Math.sign(_n.z || 1), -p.y * ts);
    }
    return this;
  }
  /** quad a b c d (counter-clockwise seen from the front); a decal maps a = bottom-left .. c = top-right */
  quad(mat: string, a: V3, b: V3, c: V3, d: V3, dec?: string | UVR, col = 0xffffff) {
    if (dec) {
      const [u0, v0, u1, v1] = typeof dec === 'string' ? decUV(dec, 0.25) : dec;
      this.tri(mat, a, b, c, [[u0, v1], [u1, v1], [u1, v0]], col); this.tri(mat, a, c, d, [[u0, v1], [u1, v0], [u0, v0]], col);
    } else { this.tri(mat, a, b, c, undefined, col); this.tri(mat, a, c, d, undefined, col); }
    return this;
  }
  /** box with its base centred at (x, y, z) */
  box(x: number, y: number, z: number, w: number, h: number, d: number, mat: string, o: PO = {}) {
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2, col = o.col ?? 0xffffff, sk = o.skip ?? [];
    const F = (k: 'top' | 'bottom' | 'px' | 'nx' | 'pz' | 'nz', a: V3, b: V3, c: V3, dd: V3) => {
      if (sk.includes(k)) return;
      const dm = o.faces?.[k];
      if (dm) this.quad('decal', a, b, c, dd, dm, col);
      else if (o.dec && k === 'pz') this.quad('decal', a, b, c, dd, o.dec, col);
      else this.quad(mat, a, b, c, dd, undefined, col);
    };
    F('pz', [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    F('nz', [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    F('px', [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    F('nx', [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    F('top', [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    F('bottom', [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    return this;
  }
  /** a box with chamfered vertical edges (faceted housings) */
  cbox(x: number, y: number, z: number, w: number, h: number, d: number, ch: number, mat: string, o: PO = {}) {
    const hw = w / 2, hd = d / 2, c = Math.min(ch, hw * 0.45, hd * 0.45), col = o.col ?? 0xffffff;
    const ring: [number, number][] = [[-hw + c, hd], [hw - c, hd], [hw, hd - c], [hw, -hd + c], [hw - c, -hd], [-hw + c, -hd], [-hw, -hd + c], [-hw, hd - c]];
    for (let i = 0; i < 8; i++) {
      const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % 8];
      if (i === 0 && o.dec) this.quad('decal', [x + ax, y, z + az], [x + bx, y, z + bz], [x + bx, y + h, z + bz], [x + ax, y + h, z + az], o.dec, col);
      else this.quad(mat, [x + ax, y, z + az], [x + bx, y, z + bz], [x + bx, y + h, z + bz], [x + ax, y + h, z + az], undefined, col);
    }
    for (let i = 1; i < 7; i++) { const a = ring[0], b = ring[i], cc = ring[i + 1]; this.tri(mat, [x + a[0], y + h, z + a[1]], [x + b[0], y + h, z + b[1]], [x + cc[0], y + h, z + cc[1]], undefined, col); this.tri(mat, [x + a[0], y, z + a[1]], [x + cc[0], y, z + cc[1]], [x + b[0], y, z + b[1]], undefined, col); }
    return this;
  }
  /** vertical cylinder / frustum, base at y */
  cyl(x: number, y: number, z: number, r: number, h: number, segs: number, mat: string, o: PO & { rTop?: number; caps?: boolean; capMat?: string; capDec?: string; a0?: number } = {}) {
    const rt = o.rTop ?? r, col = o.col ?? 0xffffff, a0 = o.a0 ?? 0;
    for (let i = 0; i < segs; i++) {
      const a = a0 + (i / segs) * Math.PI * 2, b = a0 + ((i + 1) / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      this.quad(mat, [x + sa * r, y, z + ca * r], [x + sb * r, y, z + cb * r], [x + sb * rt, y + h, z + cb * rt], [x + sa * rt, y + h, z + ca * rt], undefined, col);
      if (o.caps !== false) {
        const cm = o.capMat ?? mat;
        if (o.capDec) {
          const [u0, v0, u1, v1] = decUV(o.capDec, 0.25), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, ru = (u1 - u0) / 2, rv = (v1 - v0) / 2;
          this.tri('decal', [x, y + h, z], [x + sa * rt, y + h, z + ca * rt], [x + sb * rt, y + h, z + cb * rt], [[cu, cv], [cu + sa * ru, cv + ca * rv], [cu + sb * ru, cv + cb * rv]], col);
        } else if (rt > 0.001) this.tri(cm, [x, y + h, z], [x + sa * rt, y + h, z + ca * rt], [x + sb * rt, y + h, z + cb * rt], undefined, col);
        if (r > 0.001) this.tri(cm, [x, y, z], [x + sb * r, y, z + cb * r], [x + sa * r, y, z + ca * r], undefined, col);
      }
    }
    return this;
  }
  /** surface of revolution around y through (x, z): profile [radius, y] bottom to top */
  lathe(x: number, y: number, z: number, prof: [number, number][], segs: number, mat: string, o: PO = {}) {
    const col = o.col ?? 0xffffff;
    for (let j = 0; j + 1 < prof.length; j++) {
      const [r0, y0] = prof[j], [r1, y1] = prof[j + 1];
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2, b = ((i + 1) / segs) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
        if (r0 < 1e-4) this.tri(mat, [x, y + y0, z], [x + sb * r1, y + y1, z + cb * r1], [x + sa * r1, y + y1, z + ca * r1], undefined, col);
        else if (r1 < 1e-4) this.tri(mat, [x + sa * r0, y + y0, z + ca * r0], [x + sb * r0, y + y0, z + cb * r0], [x, y + y1, z], undefined, col);
        else this.quad(mat, [x + sa * r0, y + y0, z + ca * r0], [x + sb * r0, y + y0, z + cb * r0], [x + sb * r1, y + y1, z + cb * r1], [x + sa * r1, y + y1, z + ca * r1], undefined, col);
      }
    }
    return this;
  }
  /** a tube through points (cables, pipes) */
  tube(pts: V3[], r: number, segs: number, mat: string, o: PO & { closed?: boolean } = {}) {
    const col = o.col ?? 0xffffff;
    const P = pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const T = P.map((p, i) => new THREE.Vector3().subVectors(P[Math.min(P.length - 1, i + 1)], P[Math.max(0, i - 1)]).normalize());
    let nrm = new THREE.Vector3(0, 1, 0); if (Math.abs(T[0].y) > 0.9) nrm.set(1, 0, 0);
    const rings: THREE.Vector3[][] = [];
    for (let i = 0; i < P.length; i++) {
      nrm = nrm.clone().sub(T[i].clone().multiplyScalar(nrm.dot(T[i]))).normalize();
      const bi = new THREE.Vector3().crossVectors(T[i], nrm);
      const ring: THREE.Vector3[] = [];
      for (let k = 0; k < segs; k++) { const a = (k / segs) * Math.PI * 2; ring.push(P[i].clone().addScaledVector(nrm, Math.cos(a) * r).addScaledVector(bi, Math.sin(a) * r)); }
      rings.push(ring);
    }
    const v = (q: THREE.Vector3): V3 => [q.x, q.y, q.z];
    for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < segs; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % segs], c = rings[i + 1][(k + 1) % segs], d = rings[i + 1][k];
      this.quad(mat, v(a), v(b), v(c), v(d), undefined, col);
    }
    if (o.closed !== false) {
      const c0 = P[0], c1 = P[P.length - 1];
      for (let k = 0; k < segs; k++) { this.tri(mat, v(c0), v(rings[0][(k + 1) % segs]), v(rings[0][k]), undefined, col); const L = rings[rings.length - 1]; this.tri(mat, v(c1), v(L[k]), v(L[(k + 1) % segs]), undefined, col); }
    }
    return this;
  }
  /** a sagging cable between two points on the floor or in the air */
  cable(a: V3, b: V3, sag: number, r: number, mat = 'rubber', col = 0xffffff, n = 14) {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(Math.PI * t) * sag, a[2] + (b[2] - a[2]) * t]); }
    for (const p of pts) p[1] = Math.max(p[1], r);
    return this.tube(pts, r, 6, mat, { col });
  }
  /** torus around the y axis */
  torus(x: number, y: number, z: number, R: number, r: number, segs: number, tube: number, mat: string, o: PO = {}) {
    const col = o.col ?? 0xffffff;
    const pt = (i: number, k: number): V3 => { const a = (i / segs) * Math.PI * 2, b = (k / tube) * Math.PI * 2, rr = R + Math.cos(b) * r; return [x + Math.sin(a) * rr, y + Math.sin(b) * r, z + Math.cos(a) * rr]; };
    for (let i = 0; i < segs; i++) for (let k = 0; k < tube; k++) this.quad(mat, pt(i, k), pt(i + 1, k), pt(i + 1, k + 1), pt(i, k + 1), undefined, col);
    return this;
  }
  /** low-poly sphere */
  ball(x: number, y: number, z: number, r: number, mat: string, o: PO & { sy?: number; segs?: number } = {}) {
    const n = o.segs ?? 8, prof: [number, number][] = [];
    for (let j = 0; j <= n / 2; j++) { const a = -Math.PI / 2 + (j / (n / 2)) * Math.PI; prof.push([Math.cos(a) * r, Math.sin(a) * r * (o.sy ?? 1)]); }
    prof[0][0] = 0; prof[prof.length - 1][0] = 0;
    return this.lathe(x, y, z, prof, n, mat, o);
  }
  /** a decal panel facing +z (in the current frame), centred at (x, y) */
  panel(x: number, y: number, z: number, w: number, h: number, dec: string | UVR, col = 0xffffff) { return this.quad('decal', [x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z], dec, col); }

  get empty() { for (const b of this.bufs.values()) if (b.p.length) return false; return true; }
  /** one mesh per material */
  build(mats: Record<string, THREE.Material>, shadows = true): THREE.Group {
    const g = new THREE.Group();
    for (const [k, b] of this.bufs) {
      if (!b.p.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mats[k] ?? mats.olive);
      m.castShadow = shadows && k !== 'glass'; m.receiveShadow = true;
      m.name = 'lab:' + k;
      g.add(m);
    }
    return g;
  }
}

/**
 * The lab's lit material: flat-shaded Lambert over a painted texture, vertex-tinted; texels with alpha between 0.5
 * and 0.98 glow (read at full resolution so mip blends never light up), below 0.5 they are cut. Writes the G-buffer.
 */
export function labMaterial(map: THREE.Texture, key: string, o: { glowK?: number; uGlow?: { value: number }; side?: THREE.Side } = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, flatShading: true, side: o.side ?? THREE.FrontSide });
  const uGlow = o.uGlow ?? { value: o.glowK ?? 1.5 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLabGlow = uGlow;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLabGlow;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat glowA = textureLod(map, vMapUv, 0.0).a; vec3 glowC = sampledDiffuseColor.rgb;\nif (glowA < 0.5) discard;\ndiffuseColor.a = 1.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (glowA > 0.5 && glowA < 0.98) totalEmissiveRadiance += glowC * vColor.rgb * uLabGlow;');
  };
  m.customProgramCacheKey = () => 'lab-mat';
  gbuf(m, 1);
  void key;
  return m;
}
/** an emitter material: unlit, full bright (bulbs, lenses, coil glow); writes the emit flag so it blooms */
export function glowMaterial(col: number, k = 1): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k) });
  gbuf(m, 1 + 32);
  return m;
}
export function labMaterials(T: LabTex): Record<string, THREE.Material> {
  const out: Record<string, THREE.Material> = {};
  for (const k of ['floor', 'tile', 'plaster', 'concrete', 'olive', 'cream', 'gun', 'navy', 'red', 'haz', 'brass', 'copper', 'rubber', 'oak', 'porcelain', 'decal'] as const) out[k] = labMaterial(T[k], k, { side: k === 'decal' ? THREE.DoubleSide : THREE.FrontSide });
  out.bulb = glowMaterial(0xffd890, 2.2);
  out.bulbCyan = glowMaterial(0x7affe0, 2.2);
  out.bulbRed = glowMaterial(0xff4a2a, 2.0);
  out.bulbGreen = glowMaterial(0x6aff7a, 1.8);
  return out;
}
