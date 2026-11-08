// Turns body segments into one rigidly-skinned BufferGeometry with a packed texture atlas layout (ported from
// the Gacha Garage people, src/people/mesh.js). Every prism face gets its own texel rectangle with an exact
// planar mapping (square texels, no affine warp); the head's front faces and the nose front share one 'face
// block' so the face is painted as a single image. Faces are packed inside the rig page's fixed regions
// (humanModel REG: HEAD, TORSO, ARM_L, ...) so the creator's part picking and the creatures that repaint a
// page region keep working. Painters receive, per texel, the rest-pose surface point.
import * as THREE from 'three';
import { REG, PAGE, type RegKey } from '../humanModel';
import type { Seg, Props, BoneKey } from './types';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Face {
  seg: Seg; kind: 'side' | 'top' | 'bot'; pts: number[][]; N: number[]; tris: number[];
  U: number[]; V: number[]; o: number[]; s0: number; s1: number; r0: number; r1: number;
  dens: number; rect: Rect; block?: boolean;
}
export interface Block { x: number; y: number; w: number; h: number; x0: number; y1: number; dens: number }

const PADF = 1;

type V3 = number[];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function ring(y: number, r: number[], ch: number): V3[] {
  const [cx, cz, hx, hz] = r;
  const c = ch * Math.min(hx, hz);
  if (c < 1e-5) return [[cx + hx, y, cz + hz], [cx - hx, y, cz + hz], [cx - hx, y, cz - hz], [cx + hx, y, cz - hz]];
  return [[cx + hx, y, cz + hz - c], [cx + hx - c, y, cz + hz], [cx - hx + c, y, cz + hz], [cx - hx, y, cz + hz - c],
    [cx - hx, y, cz - hz + c], [cx - hx + c, y, cz - hz], [cx + hx - c, y, cz - hz], [cx + hx, y, cz - hz + c]];
}

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _v = new THREE.Vector3();
/** Faces of one segment (rest pose) with their outward normal and an in-plane basis (U right, V up). */
function segFaces(s: Seg): Face[] {
  const B = ring(s.y0, s.b, s.ch), T = ring(s.y1, s.t, s.ch);
  if (s.rot) {
    _m.makeRotationFromEuler(_e.set(s.rot.e[0], s.rot.e[1], s.rot.e[2], 'XYZ'));
    for (const p of [...B, ...T]) {
      _v.set(p[0] - s.rot.p[0], p[1] - s.rot.p[1], p[2] - s.rot.p[2]).applyMatrix4(_m);
      p[0] = _v.x + s.rot.p[0]; p[1] = _v.y + s.rot.p[1]; p[2] = _v.z + s.rot.p[2];
    }
  }
  const avg = (P: V3[]) => { const c = [0, 0, 0]; for (const p of P) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; } return [c[0] / P.length, c[1] / P.length, c[2] / P.length]; };
  const cB = avg(B), cT = avg(T), c = [(cB[0] + cT[0]) / 2, (cB[1] + cT[1]) / 2, (cB[2] + cT[2]) / 2];
  const up = s.rot ? norm(sub(cT, cB)) : [0, 1, 0];
  const out: Face[] = [];
  const n = B.length;
  const mk = (kind: Face['kind'], pts: V3[], N: V3, tris: number[]): Face => ({ seg: s, kind, pts, N, tris, U: [0, 0, 0], V: [0, 0, 0], o: pts[0], s0: 0, s1: 0, r0: 0, r1: 0, dens: 1, rect: { x: 0, y: 0, w: 0, h: 0 } });
  for (let i = 0; i < n; i++) {
    const a = B[i], b = B[(i + 1) % n], tb = T[(i + 1) % n], ta = T[i];
    let N = norm(cross(sub(b, a), sub(ta, a)));
    const mid = [(a[0] + b[0] + ta[0] + tb[0]) / 4, (a[1] + b[1] + ta[1] + tb[1]) / 4, (a[2] + b[2] + ta[2] + tb[2]) / 4];
    let pts = [a, b, tb, ta];
    const rel = sub(mid, c); const ax = dot(rel, up); const radial = [rel[0] - up[0] * ax, rel[1] - up[1] * ax, rel[2] - up[2] * ax];
    if (dot(N, radial) < 0) { N = [-N[0], -N[1], -N[2]]; pts = [b, a, ta, tb]; }
    if (Math.hypot(...sub(a, b)) < 1e-6 && Math.hypot(...sub(ta, tb)) < 1e-6) continue;
    if (s.open !== undefined && N[2] > s.open) continue; // an open front
    out.push(mk('side', pts, N, [0, 1, 2, 0, 2, 3]));
  }
  const cap = (P: V3[], top: boolean) => {
    const N = top ? up : [-up[0], -up[1], -up[2]];
    const pts = top ? [...P] : [...P].reverse();
    const t: number[] = [];
    for (let i = 1; i < pts.length - 1; i++) t.push(0, i, i + 1);
    const w = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
    if (dot(w, N) < 0) for (let i = 0; i < t.length; i += 3) [t[i + 1], t[i + 2]] = [t[i + 2], t[i + 1]];
    out.push(mk(top ? 'top' : 'bot', pts, N, t));
  };
  if (s.open === undefined) {
    if (s.caps === 'both' || s.caps === 'top') cap(T, true);
    if (s.caps === 'both' || s.caps === 'bot') cap(B, false);
  }
  for (const f of out) {
    let V: V3;
    if (f.kind === 'side') { V = sub(f.pts[3], f.pts[0]); const k = dot(V, f.N); V = norm([V[0] - f.N[0] * k, V[1] - f.N[1] * k, V[2] - f.N[2] * k]); }
    else V = f.kind === 'top' ? [0, 0, -1] : [0, 0, 1];
    if (f.kind !== 'side' && s.rot) { const k = dot(V, f.N); V = norm([V[0] - f.N[0] * k, V[1] - f.N[1] * k, V[2] - f.N[2] * k]); }
    f.V = V; f.U = norm(cross(V, f.N));
    f.o = f.pts[0];
    let s0 = Infinity, s1 = -Infinity, r0 = Infinity, r1 = -Infinity;
    for (const p of f.pts) { const d = sub(p, f.o); const u = dot(d, f.U), v = dot(d, f.V); s0 = Math.min(s0, u); s1 = Math.max(s1, u); r0 = Math.min(r0, v); r1 = Math.max(r1, v); }
    f.s0 = s0; f.s1 = s1; f.r0 = r0; f.r1 = r1;
  }
  return out;
}

/** Skyline bottom-left packing of rectangles into W x H (offset by ox, oy); returns false on overflow. */
function pack(rects: Rect[], W: number, Hh: number, ox: number, oy: number): boolean {
  if (W <= 0 || Hh <= 0) return rects.length === 0;
  const sky = new Int16Array(W);
  const order = [...rects].sort((a, b) => b.h - a.h || b.w - a.w);
  for (const r of order) {
    if (r.w > W || r.h > Hh) return false;
    let bx = -1, by = 1e9;
    for (let x = 0; x + r.w <= W; x++) {
      const left = x === 0 || sky[x] !== sky[x - 1];
      const right = x + r.w === W || sky[x + r.w] !== sky[x + r.w - 1];
      if (!left && !right) continue;
      let y = 0;
      for (let i = x; i < x + r.w; i++) if (sky[i] > y) { y = sky[i]; if (y >= by) break; }
      if (y < by) { by = y; bx = x; }
    }
    if (bx < 0 || by + r.h > Hh) return false;
    r.x = ox + bx; r.y = oy + by;
    for (let i = bx; i < bx + r.w; i++) sky[i] = by + r.h;
  }
  return true;
}

/** regions that share one texel density (the skin should not change resolution from the torso to the arm) */
const BODY_REGS = new Set<RegKey>(['TORSO', 'ARM_L', 'ARM_R', 'LEG_L', 'LEG_R']);

export interface MeshOut { geometry: THREE.BufferGeometry; faces: Face[]; block: Block; tris: number }

/**
 * Build the skinned geometry. k: page scale (1 = 256 px page, 2 = the close-up 512 page).
 * boneIndex maps a segment's bone to the skeleton index.
 */
export function buildMesh(segs: Seg[], P: Props, k: number, boneIndex: (b: BoneKey) => number): MeshOut {
  const faces: Face[] = [];
  for (const s of segs) for (const f of segFaces(s)) faces.push(f);
  const R = (key: RegKey): Rect => { const r = REG[key]; return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }; };
  // face block: everything front-facing on segments marked block:'face', planar-projected on x / y, as big as fits the head region
  const HR = R('HEAD');
  const dens = (HR.h - 2 * PADF - 1) / (P.crown - P.chin);
  const fw = Math.round(P.hw * 2 * dens) | 1; // odd width -> centre column
  const block: Block = { x: HR.x + PADF, y: HR.y + PADF, w: fw, h: Math.ceil((P.crown - P.chin) * dens) + 1, x0: -P.hw, y1: P.crown, dens: fw / (P.hw * 2) };
  const byReg = new Map<RegKey, Face[]>();
  for (const f of faces) {
    if (f.seg.block === 'face' && f.kind !== 'bot' && f.N[2] > 0.45) { f.block = true; continue; }
    let a = byReg.get(f.seg.reg); if (!a) byReg.set(f.seg.reg, a = []); a.push(f);
  }
  const sizeAt = (f: Face, scale: number) => {
    const m = f.seg.mat;
    f.dens = 300 * k * scale * (f.seg.dens || 1) * (m === 'head' || m === 'ear' || m === 'nose' ? 1.25 : 1) * (f.kind === 'side' ? 1 : 0.7);
    f.rect = { x: 0, y: 0, w: Math.max(1, Math.ceil((f.s1 - f.s0) * f.dens - 0.01)) + PADF * 2, h: Math.max(1, Math.ceil((f.r1 - f.r0) * f.dens - 0.01)) + PADF * 2 };
  };
  const area = (key: RegKey): Rect => key === 'HEAD' ? { x: HR.x + fw + PADF * 2 + 1, y: HR.y, w: HR.w - fw - PADF * 2 - 1, h: HR.h } : R(key);
  /** the largest scale (<= cap) at which a region's faces pack */
  const fit = (key: RegKey, list: Face[], cap: number): number => {
    const A = area(key);
    let tot = 0;
    for (const f of list) { sizeAt(f, 1); tot += f.rect.w * f.rect.h; }
    let scale = Math.min(cap, Math.sqrt((A.w * A.h * 0.9) / Math.max(1, tot)));
    for (let tries = 0; tries < 80; tries++) {
      for (const f of list) sizeAt(f, scale);
      if (pack(list.map((f) => f.rect), A.w, A.h, A.x, A.y)) return scale;
      scale *= 0.97;
    }
    return scale;
  };
  let body = 1.2;
  for (const [key, list] of byReg) if (BODY_REGS.has(key)) body = Math.min(body, fit(key, list, 1.2));
  for (const [key, list] of byReg) {
    const A = area(key);
    const sc = BODY_REGS.has(key) ? body : fit(key, list, key === 'NECK' || key.startsWith('HAND') || key.startsWith('FOOT') ? body * 1.25 : 1.6);
    let s = sc;
    for (let tries = 0; tries < 80; tries++) { for (const f of list) sizeAt(f, s); if (pack(list.map((f) => f.rect), A.w, A.h, A.x, A.y)) break; s *= 0.97; }
  }
  // geometry
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  const S = PAGE * k;
  const emit = (f: Face, inner: boolean) => {
    const base = pos.length / 3;
    const s = f.seg, bone = boneIndex(s.bone);
    const bb = s.blendBot ? boneIndex(s.blendBot) : -1, bt = s.blendTop ? boneIndex(s.blendTop) : -1;
    const c = inner ? 0.5 : 1;
    for (const p of f.pts) {
      let U: number, Vv: number;
      if (f.block) { U = block.x + (p[0] - block.x0) * block.dens; Vv = block.y + (block.y1 - p[1]) * block.dens; }
      else { const d = sub(p, f.o); U = f.rect.x + PADF + (dot(d, f.U) - f.s0) * f.dens; Vv = f.rect.y + PADF + (f.r1 - dot(d, f.V)) * f.dens; }
      pos.push(p[0], p[1], p[2]);
      if (inner) nrm.push(-f.N[0], -f.N[1], -f.N[2]); else nrm.push(f.N[0], f.N[1], f.N[2]);
      uv.push(U / S, 1 - Vv / S);
      col.push(c, c, c);
      if (bb >= 0 && Math.abs(p[1] - s.y0) < 1e-5) { si.push(bone, bb, 0, 0); sw.push(0.5, 0.5, 0, 0); }
      else if (bt >= 0 && Math.abs(p[1] - s.y1) < 1e-5) { si.push(bone, bt, 0, 0); sw.push(0.5, 0.5, 0, 0); }
      else { si.push(bone, 0, 0, 0); sw.push(1, 0, 0, 0); }
    }
    for (let i = 0; i < f.tris.length; i += 3) {
      if (inner) idx.push(base + f.tris[i], base + f.tris[i + 2], base + f.tris[i + 1]);
      else idx.push(base + f.tris[i], base + f.tris[i + 1], base + f.tris[i + 2]);
    }
  };
  for (const f of faces) { emit(f, false); if (f.seg.inner) emit(f, true); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // the world material samples through an atlas rect per vertex (the whole page here) and flips v
  const nv = pos.length / 3, atl = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) { atl[i * 4 + 2] = 1; atl[i * 4 + 3] = 1; }
  g.setAttribute('aAtlas', new THREE.BufferAttribute(atl, 4));
  g.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  return { geometry: g, faces: faces.filter((f) => !f.block), block, tris: idx.length / 3 };
}
