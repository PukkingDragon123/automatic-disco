// A container's load as real piles. Every container's load is a fill surface over its bay that rises with each
// stack's fill, slumps into its neighbours, rounds into a crown and falls away at the open edges, each patch painted
// in its item's own material (dirt, sand, crushed ore, coal, bark, timber, cast iron...). Loose loads (a soil pit, an
// ore bunker) carry chunks and clods on that surface; solid loads (a crate, an ammo bin) carry each stack's own pile on
// it (a log stack, a heap of ore, ingots in layers, cans in a row) fitted to the stack's cells, so a full crate shows
// its goods over the rim. Pile geometry is shared and cached (never dispose it); materials are the shared world
// materials for the owner's flag.
import * as THREE from 'three';
import type { GFlag } from '../../gfx/gbuf';
import { itemDef, type ItemId } from '../../factory/items';
import { formOf } from './forms';
import { pileGeo, unitOf, unitsFor } from './piles';
import { meshesOf, worldMat, isSolid } from './mats';
import { Rnd } from './mesh';

export interface Bay { x0: number; z0: number; x1: number; z1: number; y: number; h: number }
interface LoadC { id: number; kind: string; W: number; H: number; stacks: { item: ItemId; n: number; x: number; y: number; rot: 0 | 1 }[]; dims(item: ItemId, rot: 0 | 1): [number, number] }
/** where a stack's pile sits (container-local), its top, and the scale its units are shown at */
export interface Spot { x: number; z: number; y: number; top: number; s: number; w: number; d: number }

/** the textured material a mass of this item is painted in */
export function heapMatOf(id: ItemId): string {
  const f = formOf(id);
  if (f.heap) return f.heap;
  const u = unitOf(id, 0);
  let best = 'gravel', bn = 0;
  for (const [k, p] of u.M.parts) if (!isSolid(k) && p.p.length > bn) { bn = p.p.length; best = k; }
  if (bn === 0) for (const [k, p] of u.M.parts) if (p.p.length > bn) { bn = p.p.length; best = k; }
  return best;
}
const boundsOf = (parts: { geo: THREE.BufferGeometry }[]) => { const b = new THREE.Box3(); for (const p of parts) { if (!p.geo.boundingBox) p.geo.computeBoundingBox(); b.union(p.geo.boundingBox!); } return b; };
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildLoad(c: LoadC, B: Bay, flag: GFlag, loose: boolean, shadow = true): { group: THREE.Group; spots: Map<ItemId, Spot> } {
  const group = new THREE.Group();
  const spots = new Map<ItemId, Spot>();
  if (!c.stacks.length) return { group, spots };
  const cw = (B.x1 - B.x0) / c.W, cd = (B.z1 - B.z0) / c.H;
  const at = surface(c, B, flag, shadow, group, loose);
  if (loose) { chunks(c, B, flag, shadow, group, spots, cw, cd, at); return { group, spots }; }
  for (const s of c.stacks) {
    const [w, h] = c.dims(s.item, s.rot), k = Math.min(1, s.n / Math.max(1, itemDef(s.item).stack));
    const rw = w * cw, rd = h * cd, cx = B.x0 + (s.x + w / 2) * cw, cz = B.z0 + (s.y + h / 2) * cd;
    const n = unitsFor(s.item, k, w * h), seed = ((s.x * 7 + s.y * 13 + c.id * 3) % 5) + 1;
    const parts = pileGeo(s.item, n, seed), bb = boundsOf(parts), sz = bb.getSize(new THREE.Vector3());
    // turn the pile to lie along the region's long side, then shrink it to fit (never grow it)
    const turn = (sz.x > sz.z) !== (rw > rd);
    const fx = turn ? sz.z : sz.x, fz = turn ? sz.x : sz.z;
    const sc = Math.min(1, (rw * 0.98) / Math.max(1e-3, fx), (rd * 0.98) / Math.max(1e-3, fz), (B.h * 1.1) / Math.max(1e-3, sz.y));
    const g = meshesOf(parts, flag, shadow);
    g.userData.shared = true;
    const y = at(cx, cz) - sz.y * sc * 0.08;
    g.scale.setScalar(sc); g.rotation.y = (turn ? Math.PI / 2 : 0) + new Rnd(seed).r(-0.06, 0.06);
    g.position.set(cx, y, cz);
    group.add(g);
    spots.set(s.item, { x: cx, z: cz, y, top: y + sz.y * sc, s: sc, w: rw, d: rd });
  }
  return { group, spots };
}

/** the fill surface: rises with each stack's fill, slumps, crowns, falls away at the edges; returns its height */
function surface(c: LoadC, B: Bay, flag: GFlag, shadow: boolean, group: THREE.Group, loose: boolean) {
  const RES = 4, NX = c.W * RES, NZ = c.H * RES;
  const cellH = new Float32Array(c.W * c.H), cellI = new Int32Array(c.W * c.H).fill(-1);
  c.stacks.forEach((s, si) => {
    const [w, h] = c.dims(s.item, s.rot), k = Math.min(1, s.n / Math.max(1, itemDef(s.item).stack));
    for (let y = s.y; y < s.y + h; y++) for (let x = s.x; x < s.x + w; x++) if (x < c.W && y < c.H) { cellH[y * c.W + x] = B.h * (loose ? 0.16 + 0.84 * k : 0.06 + 0.5 * k); cellI[y * c.W + x] = si; }
  });
  const hAt = (vx: number, vz: number) => cellH[Math.min(c.H - 1, Math.floor(vz / RES)) * c.W + Math.min(c.W - 1, Math.floor(vx / RES))];
  let field = new Float32Array((NX + 1) * (NZ + 1));
  for (let z = 0; z <= NZ; z++) for (let x = 0; x <= NX; x++) {
    let sum = 0, n = 0;
    for (const [dx, dz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= NX || Z >= NZ) continue; sum += hAt(X, Z); n++; }
    field[z * (NX + 1) + x] = n ? sum / n : 0;
  }
  for (let pass = 0; pass < 4; pass++) {
    const f2 = new Float32Array(field);
    for (let z = 0; z <= NZ; z++) for (let x = 0; x <= NX; x++) {
      let sum = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X > NX || Z > NZ) continue; sum += field[Z * (NX + 1) + X]; n++; }
      f2[z * (NX + 1) + x] = sum / n;
    }
    field = f2;
  }
  const rnd = new Rnd(c.id * 5 + 1), W = B.x1 - B.x0, D = B.z1 - B.z0;
  for (let z = 0; z <= NZ; z++) for (let x = 0; x <= NX; x++) {
    const u = x / NX, v = z / NZ, de = Math.min(u * W, (1 - u) * W, v * D, (1 - v) * D);
    const crown = 1 - Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
    field[z * (NX + 1) + x] *= (0.3 + 0.7 * sstep(0, 0.14, de)) * (0.84 + 0.16 * crown) * (0.94 + rnd.next() * 0.1);
  }
  const px = (vx: number) => B.x0 + (vx / NX) * W, pz = (vz: number) => B.z0 + (vz / NZ) * D;
  const fy = (vx: number, vz: number) => B.y + field[vz * (NX + 1) + vx];
  // triangles grouped by the material of the cell under them; planar UVs (metres) from each facet's own axis
  const byMat = new Map<string, number[]>();
  for (let vz = 0; vz < NZ; vz++) for (let vx = 0; vx < NX; vx++) {
    const ci = cellI[Math.floor(vz / RES) * c.W + Math.floor(vx / RES)];
    if (ci < 0 && !loose) continue;
    const mat = ci >= 0 ? heapMatOf(c.stacks[ci].item) : 'dirt';
    const a = [px(vx), fy(vx, vz), pz(vz)], b = [px(vx + 1), fy(vx + 1, vz), pz(vz)], cc = [px(vx + 1), fy(vx + 1, vz + 1), pz(vz + 1)], d = [px(vx), fy(vx, vz + 1), pz(vz + 1)];
    const arr = byMat.get(mat) ?? (byMat.set(mat, []).get(mat)!);
    if ((vx + vz) % 2) arr.push(...a, ...d, ...cc, ...a, ...cc, ...b); else arr.push(...a, ...d, ...b, ...b, ...d, ...cc);
  }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
  for (const [mat, P] of byMat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const uv: number[] = [];
    for (let i = 0; i < P.length; i += 9) {
      _a.fromArray(P, i); _b.fromArray(P, i + 3); _c.fromArray(P, i + 6); _n.subVectors(_b, _a).cross(_c.clone().sub(_a));
      const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
      for (const q of [_a, _b, _c]) uv.push(...(ay >= ax && ay >= az ? [q.x, q.z] : ax >= az ? [q.z, -q.y] : [q.x, -q.y]));
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, worldMat(mat, flag)); m.receiveShadow = true; m.castShadow = shadow;
    group.add(m);
  }
  return (x: number, z: number) => {
    const vx = Math.max(0, Math.min(NX, Math.round(((x - B.x0) / W) * NX))), vz = Math.max(0, Math.min(NZ, Math.round(((z - B.z0) / D) * NZ)));
    return fy(vx, vz);
  };
}

/** chunks on the crown of each loose stack: ore lumps, rocks, clods (fewer for fine earth) */
function chunks(c: LoadC, B: Bay, flag: GFlag, shadow: boolean, group: THREE.Group, spots: Map<ItemId, Spot>, cw: number, cd: number, at: (x: number, z: number) => number) {
  c.stacks.forEach((s, si) => {
    const [w, h] = c.dims(s.item, s.rot), k = Math.min(1, s.n / Math.max(1, itemDef(s.item).stack)), f = formOf(s.item);
    const x0 = B.x0 + s.x * cw, z0 = B.z0 + s.y * cd, rw = w * cw, rd = h * cd, cx = x0 + rw / 2, cz = z0 + rd / 2;
    const u0 = unitOf(s.item, 0);
    const sc = Math.min(1, (Math.min(rw, rd) * 0.42) / Math.max(1e-3, u0.size.x, u0.size.z));
    spots.set(s.item, { x: cx, z: cz, y: at(cx, cz), top: at(cx, cz), s: sc, w: rw, d: rd });
    const n = f.pile === 'mound' ? (f.fine ? Math.round(k) : Math.round(1 + k * 3)) : Math.round(1 + k * Math.min(6, w * h));
    const r = new Rnd(si * 31 + c.id);
    for (let i = 0; i < n; i++) {
      const x = x0 + rw * r.r(0.15, 0.85), z = z0 + rd * r.r(0.15, 0.85);
      const u = unitOf(s.item, i, i % 3), m = meshesOf(u.M.build(), flag, shadow);
      m.scale.setScalar(sc * (0.8 + r.next() * 0.3)); m.position.set(x, at(x, z) - u.size.y * sc * 0.3, z);
      m.rotation.set(r.r(-0.3, 0.3), r.r(0, Math.PI * 2), r.r(-0.3, 0.3));
      group.add(m);
    }
  });
}
