// Rig -> textured skinned mesh. Each box face gets its own pixel island; texels are painted in object space so
// patterns run continuously across the body (countershading, stripes, spots, bands, fur strands, scales, chitin).
// One geometry + texture per species; each creature gets its own skeleton and a cheap material clone carrying
// per-instance effects (selection flags, hit flash, decay, moss overgrowth while digested, dissolve).
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex } from '../limbo/gfx/pixel';
import { Rand, clamp, hash01 } from '../core/rand';
import { Noise } from '../core/noise';
import { buildRig, type Rig, type Mat, type V3, type Box, type Card } from './morph';
import type { Design } from './design';
import { gbuf, type GFlag } from '../gfx/gbuf';
import { VEYR } from '../world/palette';

const R = (c: number, n = 7, s = 0.6, hs = 0.05) => makeRamp(c, n, { spread: s, hueShift: hs });
const ci = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : Math.round(v));
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x: number, y: number) => (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

interface Face { box: number; card: boolean; o: V3; ax: V3; ay: V3; n: V3; pw: number; ph: number; x: number; y: number }
export interface SpeciesModel {
  rig: Rig; geo: THREE.BufferGeometry; tex: THREE.DataTexture; inverses: THREE.Matrix4[];
  depthMat: THREE.MeshDepthMaterial; restWorld: V3[];
}

function rotV(v: V3, b: { rx?: number; ry?: number; rz?: number }): V3 {
  let [x, y, z] = v;
  if (b.rx) { const c = Math.cos(b.rx), s = Math.sin(b.rx); [y, z] = [y * c - z * s, y * s + z * c]; }
  if (b.ry) { const c = Math.cos(b.ry), s = Math.sin(b.ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
  if (b.rz) { const c = Math.cos(b.rz), s = Math.sin(b.rz); [x, y] = [x * c - y * s, x * s + y * c]; }
  return [x, y, z];
}

export function buildSpeciesModel(d: Design): SpeciesModel {
  const rig = buildRig(d);
  const restWorld: V3[] = rig.bones.map(() => [0, 0, 0]);
  rig.bones.forEach((bn, i) => { const p = bn.parent >= 0 ? restWorld[bn.parent] : [0, 0, 0] as V3; restWorld[i] = [p[0] + bn.pos[0], p[1] + bn.pos[1], p[2] + bn.pos[2]]; });
  // ---- faces with world-rest frames
  const faces: Face[] = [];
  let area = 0;
  const DIRS: [V3, V3, V3][] = [ // normal, axis u, axis v (v runs down the face)
    [[0, 0, 1], [1, 0, 0], [0, -1, 0]], [[0, 0, -1], [-1, 0, 0], [0, -1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, -1, 0]], [[-1, 0, 0], [0, 0, 1], [0, -1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
  ];
  rig.boxes.forEach((bx, bi) => {
    const bw = restWorld[bx.bone];
    const C: V3 = [bw[0] + bx.c[0], bw[1] + bx.c[1], bw[2] + bx.c[2]];
    const h: V3 = [bx.s[0] / 2, bx.s[1] / 2, bx.s[2] / 2];
    for (const [n, u, v] of DIRS) {
      const nn = rotV(n, bx), uu = rotV(u, bx), vv = rotV(v, bx);
      const eu = Math.abs(u[0]) * h[0] + Math.abs(u[1]) * h[1] + Math.abs(u[2]) * h[2];
      const ev = Math.abs(v[0]) * h[0] + Math.abs(v[1]) * h[1] + Math.abs(v[2]) * h[2];
      const en = Math.abs(n[0]) * h[0] + Math.abs(n[1]) * h[1] + Math.abs(n[2]) * h[2];
      const o: V3 = [C[0] + nn[0] * en - uu[0] * eu - vv[0] * ev, C[1] + nn[1] * en - uu[1] * eu - vv[1] * ev, C[2] + nn[2] * en - uu[2] * eu - vv[2] * ev];
      faces.push({ box: bi, card: false, o, ax: [uu[0] * eu * 2, uu[1] * eu * 2, uu[2] * eu * 2], ay: [vv[0] * ev * 2, vv[1] * ev * 2, vv[2] * ev * 2], n: nn, pw: eu * 2, ph: ev * 2, x: 0, y: 0 });
      area += eu * ev * 4;
    }
  });
  rig.cards.forEach((cd, ci2) => {
    const bw = restWorld[cd.bone];
    const C: V3 = [bw[0] + cd.c[0], bw[1] + cd.c[1], bw[2] + cd.c[2]];
    const o: V3 = [C[0] - cd.u[0] - cd.v[0], C[1] - cd.u[1] - cd.v[1], C[2] - cd.u[2] - cd.v[2]];
    const n = cross(cd.u, cd.v); const nl = Math.hypot(...n) || 1;
    faces.push({ box: ci2, card: true, o, ax: [cd.u[0] * 2, cd.u[1] * 2, cd.u[2] * 2], ay: [cd.v[0] * 2, cd.v[1] * 2, cd.v[2] * 2], n: [n[0] / nl, n[1] / nl, n[2] / nl], pw: Math.hypot(...cd.u) * 2, ph: Math.hypot(...cd.v) * 2, x: 0, y: 0 });
    area += Math.hypot(...cd.u) * Math.hypot(...cd.v) * 4;
  });
  // ---- density & packing (shelves)
  let D = 32, S = 128;
  const pack = (dens: number, size: number) => {
    let x = 0, y = 0, rowH = 0;
    const order = faces.map((_, i) => i).sort((a, b) => Math.ceil(faces[b].ph * dens) - Math.ceil(faces[a].ph * dens));
    for (const i of order) {
      const f = faces[i];
      const w = Math.max(1, Math.round(f.pw * dens)), h = Math.max(1, Math.round(f.ph * dens));
      if (w > size) return false;
      if (x + w > size) { x = 0; y += rowH; rowH = 0; }
      if (y + h > size) return false;
      f.x = x; f.y = y; (f as any).w = w; (f as any).h = h;
      x += w; rowH = Math.max(rowH, h);
    }
    return true;
  };
  for (;;) {
    if (area * D * D * 1.35 > S * S && S < 1024) { S *= 2; continue; }
    if (pack(D, S)) break;
    if (S < 1024) S *= 2; else if (D > 10) D -= 4; else break;
  }
  // ---- paint
  const pc = new PixelCanvas(S, S); pc.wrap = false; pc.clear();
  const P = painter(d, rig, restWorld);
  for (const f of faces) {
    const w = (f as any).w, h = (f as any).h;
    const mat: Mat = f.card ? rig.cards[f.box].mat : rig.boxes[f.box].mat;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const u = (i + 0.5) / w, v = (j + 0.5) / h;
      const p: V3 = [f.o[0] + f.ax[0] * u + f.ay[0] * v, f.o[1] + f.ax[1] * u + f.ay[1] * v, f.o[2] + f.ax[2] * u + f.ay[2] * v];
      const [c, a] = P(p, f.n, mat, i, j, w, h, f.x + i, f.y + j, f.card ? -1 : f.box);
      pc.set(f.x + i, f.y + j, c, a);
    }
  }
  // ---- geometry
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  const quad = (f: Face, bone: number, flip: boolean) => {
    const b0 = pos.length / 3, w = (f as any).w, h = (f as any).h;
    const cs: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const [u, v] of cs) {
      pos.push(f.o[0] + f.ax[0] * u + f.ay[0] * v, f.o[1] + f.ax[1] * u + f.ay[1] * v, f.o[2] + f.ax[2] * u + f.ay[2] * v);
      const n = flip ? [-f.n[0], -f.n[1], -f.n[2]] : f.n;
      nor.push(n[0], n[1], n[2]);
      uv.push((f.x + u * w) / S, (f.y + v * h) / S);
      si.push(bone, 0, 0, 0); sw.push(1, 0, 0, 0);
    }
    // faces: o, o+ax, o+ax+ay, o+ay ; outward winding for +n
    if (!flip) idx.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2); else idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  };
  for (const f of faces) {
    const bone = f.card ? rig.cards[f.box].bone : rig.boxes[f.box].bone;
    quad(f, bone, false);
    if (f.card) quad(f, bone, true);
  }
  // winding check: (ax x ay) should point along -n for the CCW order above; fix per face if needed
  fixWinding(pos, nor, idx);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geo.boundingSphere!.radius *= 1.6;
  const tex = new THREE.DataTexture(new Uint8Array(pc.data.buffer), S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.needsUpdate = true;
  const inverses = restWorld.map((p) => new THREE.Matrix4().makeTranslation(-p[0], -p[1], -p[2]));
  const depthMat = new THREE.MeshDepthMaterial({ map: tex, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  return { rig, geo, tex, inverses, depthMat, restWorld };
}

function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function fixWinding(pos: number[], nor: number[], idx: number[]) {
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const e1: V3 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2: V3 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const n = cross(e1, e2);
    if (n[0] * nor[a] + n[1] * nor[a + 1] + n[2] * nor[a + 2] < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  }
}

// --------------------------------------------------------------------------------------------- the painter
function painter(d: Design, rig: Rig, restWorld: V3[]) {
  const nz = new Noise(d.seed);
  const r = new Rand(d.seed ^ 0xab);
  const base = R(d.colors.base), belly = R(d.colors.belly, 7, 0.45), pat = R(d.colors.pattern), acc = R(d.colors.accent, 7, 0.6, 0.07);
  const horn = R(0xd8c49a, 7, 0.55), claw = R(0x4a3a34, 6, 0.5), teeth = R(0xf0ead8, 5, 0.3);
  const membrane = R(mixHex(d.colors.accent, 0xe8f0f0, 0.6), 6, 0.4);
  const L = rig.length;
  // body extents
  let zmin = 1e9, zmax = -1e9, ymin = 1e9, ymax = -1e9;
  for (const bx of rig.boxes) { const w = restWorld[bx.bone]; zmin = Math.min(zmin, w[2] + bx.c[2] - bx.s[2] / 2); zmax = Math.max(zmax, w[2] + bx.c[2] + bx.s[2] / 2); if (bx.mat === 'body' || bx.mat === 'belly') { ymin = Math.min(ymin, w[1] + bx.c[1] - bx.s[1] / 2); ymax = Math.max(ymax, w[1] + bx.c[1] + bx.s[1] / 2); } }
  const ymid = (ymin + ymax) / 2, yh = Math.max(0.05, (ymax - ymin) / 2);
  const f = (5 / L) * d.patScale;
  const pattern = (p: V3, n: V3, mat: Mat): number => {
    if (mat === 'belly' || n[1] < -0.6) return 0;
    const low = clamp((ymid - p[1]) / yh, -1, 1);
    const fadeLow = low > 0.35 ? 0 : 1;
    switch (d.pattern) {
      case 'stripes': return fadeLow * (Math.sin(p[2] * f * Math.PI * 2 + nz.n3(p[0] * 3, p[1] * 3, p[2] * 3) * 1.6) > 0.55 ? 1 : 0);
      case 'bands': return fadeLow * (((p[2] * f * 0.8) % 1 + 1) % 1 < 0.3 ? 1 : 0);
      case 'spots': { const v = nz.n3(p[0] * f * 1.4, p[1] * f * 1.4, p[2] * f * 1.4); return v > 0.5 ? 1 : v > 0.42 ? 0.5 : 0; }
      case 'mottled': return nz.fbm3(p[0] * f, p[1] * f, p[2] * f, 3) > 0.12 ? 0.6 : 0;
      case 'saddle': return p[1] > ymid + yh * 0.2 && Math.abs(p[2] - (zmin + zmax) / 2) < L * 0.28 ? 1 : 0;
      case 'rings': return mat === 'limb' && ((p[1] * f * 1.5 + p[2] * f) % 1 + 1) % 1 < 0.35 ? 1 : 0;
      default: return 0;
    }
  };
  // returns [hex, alpha]
  return (p: V3, n: V3, mat: Mat, i: number, j: number, w: number, h: number, ax: number, ay: number, box: number): [number, number] => {
    const edgeTop = j === 0, edgeBot = j === h - 1 && h > 2, edgeL = i === 0, edgeR = i === w - 1;
    const th = bay(ax, ay);
    const hs = hash01(ax, ay, d.seed);
    switch (mat) {
      case 'eye': {
        const out = Math.abs(n[1]) < 0.5;
        if (!out) return [0x101014, 255];
        const cx = (w - 1) / 2, cy = (h - 1) / 2;
        if (w <= 2 && h <= 2) return [i === 0 && j === 0 ? 0xffffff : d.colors.eye, 255];
        if (i === Math.floor(cx * 0.6) && j === Math.floor(cy * 0.6)) return [0xffffff, 255];
        const dd = Math.hypot(i - cx, j - cy);
        return [dd < Math.max(0.6, w * 0.18) ? 0x060608 : dd < w * 0.42 ? d.colors.eye : scaleHex(d.colors.eye, 0.55), 255];
      }
      case 'compound': {
        const hex = ((i + (j % 2)) % 2 === 0);
        const glint = j < h * 0.35 && i > w * 0.2 && i < w * 0.6;
        return [glint ? mixHex(d.colors.eye, 0xffffff, 0.6) : hex ? scaleHex(d.colors.eye, 0.85) : scaleHex(d.colors.eye, 0.4), 255];
      }
      case 'mouth': {
        const rr = Math.hypot(i - (w - 1) / 2, j - (h - 1) / 2) / (Math.min(w, h) / 2);
        return [rr > 0.85 ? pat[2] : rr > 0.62 ? (((Math.atan2(j - h / 2, i - w / 2) * 4) | 0) % 2 ? teeth[3] : 0x2a0a10) : 0x1a060a, 255];
      }
      case 'nose': return [n[2] > 0.5 && (i === 1 || i === w - 2) && j === Math.floor(h / 2) ? 0x050405 : 0x2a1e20, 255];
      case 'teeth': return [teeth[ci(3 + (edgeTop ? 1 : 0) - j / h * 1.5, 0, 4)], 255];
      case 'claw': return [claw[ci(2 + (edgeTop || edgeL ? 1.5 : 0) - (edgeBot ? 1 : 0) + hs * 0.8, 0, 5)], 255];
      case 'horn': {
        const along = clamp(p[1] / (rig.height + 0.01), 0, 1);
        const ridge = (j % 3 === 0) ? -0.8 : 0;
        return [horn[ci(1.8 + along * 3 + (n[0] < 0 ? 0.6 : -0.3) + ridge + (edgeTop ? 0.8 : 0), 0, 6)], 255];
      }
      case 'spike': return [horn[ci(2 + (1 - j / h) * 3 + (edgeL ? 1 : 0), 0, 6)], 255];
      case 'membrane': {
        const vein = i % 5 === 0 || j % 7 === 0 || (i + j) % 11 === 0;
        if (vein) return [scaleHex(membrane[2], 0.8), 255];
        return [membrane[ci(3 + hs * 1.5, 0, 5)], (ax + ay) % 2 === 0 ? 255 : 0];
      }
      case 'fur': {
        // strands hang along v (j); tips ragged and lighter
        const len = 0.62 + hash01(i, 7, d.seed + box) * 0.38 - (i % 3 === 1 ? 0.18 : 0);
        if (j / h > len) return [0, 0];
        const k = 2.6 + (j / h) * 2.2 + (hash01(i, j >> 1, d.seed) - 0.5) * 1.6;
        return [base[ci(k, 0, 6)], 255];
      }
      case 'lantern': {
        const sp = hash01(ax >> 1, ay >> 1, 9) > 0.8;
        return [sp ? acc[2] : acc[ci(4 + th * 2, 0, 6)], sp ? 255 : 205];
      }
      case 'shell': {
        if (rig.plan === 'gastropod') {
          const sw = Math.sin((p[1] * 9 + Math.atan2(p[2], p[1] + 0.01) * 3) * d.patScale) > 0.3;
          return [sw ? pat[ci(2.5 + th, 0, 6)] : acc[ci(2.6 + (n[1] > 0.5 ? 1.5 : 0) + (edgeTop ? 1 : 0) + (th - 0.5), 0, 6)], 255];
        }
        // beetle elytra: gloss band, mid seam, fine punctures
        const seam = Math.abs(p[0]) < 0.012;
        let k = 2.4 + (n[1] > 0.6 ? 0.8 : 0) + (edgeTop ? 1.4 : 0) - (edgeBot ? 1 : 0);
        if (n[1] > 0.6 && Math.abs(i - w * 0.3) < 1.2) k += 2;
        if ((i * 7 + j * 3) % 9 === 0) k -= 0.8;
        return [seam ? base[0] : (d.genes.includes('aposematic') ? (pattern(p, n, mat) ? pat : base) : base)[ci(k + (th - 0.5) * 0.6, 0, 6)], 255];
      }
      case 'plate': {
        // osteoderm rosettes: hex cells with dark gaps, domed lighter centres
        const q = 4.2, row = Math.floor(ay / q), col = Math.floor((ax + (row % 2) * q / 2) / q);
        const lx = ((ax + (row % 2) * q / 2) % q) / q - 0.5, ly = (ay % q) / q - 0.5;
        const dd = Math.hypot(lx, ly);
        if (dd > 0.43) return [pat[1], 255];
        const k = 3.4 - (lx + ly) * 2.4 - dd * 1.6 + (hash01(col, row, d.seed) - 0.5) * 1.2 + (n[1] > 0.5 ? 0.4 : 0);
        return [(pattern(p, n, mat) > 0.5 ? pat : base)[ci(k, 0, 6)], 255];
      }
    }
    // ---- skin-bearing materials: body, belly, head, limb, foot
    const low = clamp((ymid - p[1]) / yh, -1, 1);
    let bellyT = mat === 'belly' ? 1 : n[1] < -0.6 ? 0.95 : n[1] > 0.6 ? 0 : clamp((low - 0.05) * 1.4, 0, 1);
    if (mat === 'limb' || mat === 'foot') bellyT *= 0.4;
    let k = 3.2 + (n[1] > 0.6 ? 0.35 : n[1] < -0.6 ? -0.6 : 0);
    // pixel bevel: lit top-left edges, shadowed bottom edges (the polished-block look)
    if (edgeTop && Math.abs(n[1]) < 0.6) k += 1.0; else if (edgeBot) k -= 0.9;
    if (edgeL && Math.abs(n[1]) < 0.6 && w > 3) k += 0.35; else if (edgeR && w > 3) k -= 0.35;
    if (mat === 'foot') k -= 0.8;
    // cover texture
    switch (d.cover) {
      case 'fur': k += (hash01(ax, ay >> 1, d.seed) - 0.5) * 1.5 + ((ay + (ax * 7) % 3) % 4 === 0 ? -0.6 : 0); break;
      case 'scales': { const row = Math.floor(ay / 3), m = (ax + (row % 2) * 2) % 4; k += (ay % 3 === 0 ? 0.8 : ay % 3 === 2 ? -0.9 : 0) + (m === 0 ? -0.6 : 0); break; }
      case 'chitin': {
        const segLine = Math.abs(((p[2] * 6 / L) % 1 + 1) % 1 - 0.5) > 0.47 && mat !== 'limb';
        k += segLine ? -1.6 : 0;
        if (Math.abs(n[1]) < 0.6 && j < h * 0.22 && hs > 0.4) k += 1.3;
        k += (hs - 0.5) * 0.5;
        break;
      }
      case 'slime': k += (hash01(ax >> 1, ay >> 1, d.seed) > 0.93 ? 2.2 : 0) + nz.n3(p[0] * 6, p[1] * 6, p[2] * 6) * 0.6; break;
      default: k += nz.n3(p[0] * 9, p[1] * 9, p[2] * 9) * 0.5 + (hs > 0.97 ? -0.8 : 0);
    }
    const pv = pattern(p, n, mat);
    const useBelly = bellyT > th;
    const ramp = pv > th * 0.9 + 0.05 ? pat : useBelly ? belly : base;
    let c = ramp[ci(k + (th - 0.5) * 0.7, 0, 6)];
    if (d.genes.includes('cryptic') && !useBelly && hash01(ax >> 2, ay >> 2, 31) > 0.7) c = mixHex(c, pat[3], 0.5);
    return [c, 255];
  };
}

// --------------------------------------------------------------------------------------------- instances
export interface CreatureFx { flag: GFlag; flash: { value: number }; flashCol: { value: THREE.Color }; decay: { value: number }; moss: { value: number }; dissolve: { value: number }; glow: { value: number } }

export function makeInstance(m: SpeciesModel): { mesh: THREE.SkinnedMesh; bones: THREE.Bone[]; fx: CreatureFx } {
  const bones = m.rig.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; o.position.set(b.pos[0], b.pos[1], b.pos[2]); return o; });
  m.rig.bones.forEach((b, i) => { if (b.parent >= 0) bones[b.parent].add(bones[i]); });
  const fx: CreatureFx = { flag: { value: 1 }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) }, decay: { value: 0 }, moss: { value: 0 }, dissolve: { value: 0 }, glow: { value: 1 } };
  const mat = new THREE.MeshLambertMaterial({ map: m.tex, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFlash = fx.flash; sh.uniforms.uFlashCol = fx.flashCol; sh.uniforms.uDecay = fx.decay; sh.uniforms.uMossC = fx.moss; sh.uniforms.uDissolve = fx.dissolve; sh.uniforms.uGlowK = fx.glow;
    sh.uniforms.uMossA = { value: new THREE.Color(VEYR.mossDark) }; sh.uniforms.uMossB = { value: new THREE.Color(VEYR.moss) }; sh.uniforms.uMossL = { value: new THREE.Color(VEYR.mossLight) }; sh.uniforms.uVein = { value: new THREE.Color(VEYR.vein) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRest;
uniform float uFlash, uDecay, uMossC, uDissolve, uGlowK; uniform vec3 uFlashCol, uMossA, uMossB, uMossL, uVein;
float ch(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ch(i), ch(i + vec3(1,0,0)), f.x), mix(ch(i + vec3(0,1,0)), ch(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ch(i + vec3(0,0,1)), ch(i + vec3(1,0,1)), f.x), mix(ch(i + vec3(0,1,1)), ch(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 cpx = floor(vRest * 32.0);
float dissN = ch(cpx + 3.7);
if (dissN < uDissolve) discard;
float glowA = sampledDiffuseColor.a;
vec3 glowC = sampledDiffuseColor.rgb;
float lumC = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumC) * vec3(0.78, 0.7, 0.62), uDecay * 0.7) * (1.0 - uDecay * 0.35);
float mossM = 0.0;
if (uMossC > 0.0) {
  float mn = vn3(vRest * 7.0) * 0.6 + ch(cpx) * 0.4 + max(0.0, vRest.y) * 0.25;
  if (mn < uMossC * 1.15) {
    float t = ch(cpx + 1.3);
    diffuseColor.rgb = t < 0.33 ? uMossA : t < 0.8 ? uMossB : uMossL;
    mossM = 1.0;
  }
}`)
      .replace('#include <alphatest_fragment>', 'if (diffuseColor.a < 0.5) discard;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (glowA < 0.98) totalEmissiveRadiance += glowC * 1.6 * uGlowK * (1.0 - uDecay);
if (mossM > 0.5 && ch(cpx + 7.7) > 0.93) totalEmissiveRadiance += uVein * 1.4;
totalEmissiveRadiance += uFlashCol * uFlash * 0.9;`);
  };
  mat.customProgramCacheKey = () => 'oddworld-creature';
  gbuf(mat, fx.flag);
  const mesh = new THREE.SkinnedMesh(m.geo, mat);
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones, m.inverses), new THREE.Matrix4());
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.customDepthMaterial = m.depthMat;
  mesh.frustumCulled = true;
  return { mesh, bones, fx };
}
