// A container's load as real piles. Each stack lies where the grid window shows it: in an open crate or bin, the
// item's own pile (a log stack, a heap of ore, a row of cans) fitted to the stack's cells and growing with how full
// the stack is; in a pit or a bunker, loose loads slump into one landscape that rises with each stack's fill, each
// patch in its own material (dirt, sand, crushed ore, coal...), with chunks and clods sitting on it. Pile geometry
// is shared and cached (do not dispose it); materials are the shared world materials for the owner's flag.
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

/** the textured material a loose load of this item heaps in */
export function heapMatOf(id: ItemId): string {
  const f = formOf(id);
  if (f.heap) return f.heap;
  const u = unitOf(id, 0);
  let best = 'gravel', bn = 0;
  for (const [k, p] of u.M.parts) if (!isSolid(k) && p.p.length > bn) { bn = p.p.length; best = k; }
  return best;
}
const boundsOf = (parts: { geo: THREE.BufferGeometry }[]) => { const b = new THREE.Box3(); for (const p of parts) { if (!p.geo.boundingBox) p.geo.computeBoundingBox(); b.union(p.geo.boundingBox!); } return b; };

export function buildLoad(c: LoadC, B: Bay, flag: GFlag, loose: boolean, shadow = true): { group: THREE.Group; spots: Map<ItemId, Spot> } {
  const group = new THREE.Group(); group.userData.shared = true;
  const spots = new Map<ItemId, Spot>();
  if (!c.stacks.length) return { group, spots };
  const cw = (B.x1 - B.x0) / c.W, cd = (B.z1 - B.z0) / c.H;
  if (loose) return landscape(c, B, flag, shadow, group, spots, cw, cd);
  for (const s of c.stacks) {
    const [w, h] = c.dims(s.item, s.rot), k = Math.min(1, s.n / Math.max(1, itemDef(s.item).stack));
    const rw = w * cw, rd = h * cd, cx = B.x0 + (s.x + w / 2) * cw, cz = B.z0 + (s.y + h / 2) * cd;
    const n = unitsFor(s.item, k, w * h), seed = ((s.x * 7 + s.y * 13 + c.id * 3) % 5) + 1;
    const parts = pileGeo(s.item, n, seed), bb = boundsOf(parts), sz = bb.getSize(new THREE.Vector3());
    // turn the pile to lie along the region's long side, then shrink it to fit (never grow it)
    const turn = (sz.x > sz.z) !== (rw > rd);
    const fx = turn ? sz.z : sz.x, fz = turn ? sz.x : sz.z;
    const sc = Math.min(1, (rw * 0.96) / Math.max(1e-3, fx), (rd * 0.96) / Math.max(1e-3, fz), (B.h * 1.45) / Math.max(1e-3, sz.y));
    const g = meshesOf(parts, flag, shadow);
    g.userData.shared = true;
    g.scale.setScalar(sc); g.rotation.y = (turn ? Math.PI / 2 : 0) + (new Rnd(seed).r(-0.06, 0.06));
    g.position.set(cx, B.y, cz);
    group.add(g);
    spots.set(s.item, { x: cx, z: cz, y: B.y, top: B.y + sz.y * sc, s: sc, w: rw, d: rd });
  }
  return { group, spots };
}

/** loose loads: one slumped landscape over the bay, each patch in its item's material, chunks lying on it */
function landscape(c: LoadC, B: Bay, flag: GFlag, shadow: boolean, group: THREE.Group, spots: Map<ItemId, Spot>, cw: number, cd: number) {
  const RES = 4, NX = c.W * RES, NZ = c.H * RES;
  const cellH = new Float32Array(c.W * c.H), cellI = new Int32Array(c.W * c.H).fill(-1);
  c.stacks.forEach((s, si) => {
    const [w, h] = c.dims(s.item, s.rot), k = Math.min(1, s.n / Math.max(1, itemDef(s.item).stack));
    for (let y = s.y; y < s.y + h; y++) for (let x = s.x; x < s.x + w; x++) if (x < c.W && y < c.H) { cellH[y * c.W + x] = B.h * (0.16 + 0.84 * k); cellI[y * c.W + x] = si; }
  });
  const hAt = (vx: number, vz: number) => cellH[Math.min(c.H - 1, Math.floor(vz / RES)) * c.W + Math.min(c.W - 1, Math.floor(vx / RES))];
  let field = new Float32Array((NX + 1) * (NZ + 1));
  for (let z = 0; z <= NZ; z++) for (let x = 0; x <= NX; x++) {
    let sum = 0, n = 0;
    for (const [dx, dz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= NX || Z >= NZ) continue; sum += hAt(X, Z); n++; }
    field[z * (NX + 1) + x] = n ? sum / n : 0;
  }
  // slump: neighbouring piles run into each other; the walls hold the edge up a little
  for (let pass = 0; pass < 3; pass++) {
    const f2 = new Float32Array(field);
    for (let z = 0; z <= NZ; z++) for (let x = 0; x <= NX; x++) {
      let sum = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X > NX || Z > NZ) continue; sum += field[Z * (NX + 1) + X]; n++; }
      f2[z * (NX + 1) + x] = sum / n;
    }
    field = f2;
  }
  const rnd = new Rnd(c.id * 5 + 1);
  for (let i = 0; i < field.length; i++) field[i] *= 0.93 + rnd.next() * 0.12;
  const px = (vx: number) => B.x0 + (vx / NX) * (B.x1 - B.x0), pz = (vz: number) => B.z0 + (vz / NZ) * (B.z1 - B.z0);
  const fy = (vx: number, vz: number) => B.y + field[vz * (NX + 1) + vx];
  // triangles grouped by the material of the cell under them (flat facets, UVs in metres)
  const byMat = new Map<string, number[]>();
  for (let vz = 0; vz < NZ; vz++) for (let vx = 0; vx < NX; vx++) {
    const ci = cellI[Math.floor(vz / RES) * c.W + Math.floor(vx / RES)];
    const mat = ci >= 0 ? heapMatOf(c.stacks[ci].item) : 'dirt';
    const a = [px(vx), fy(vx, vz), pz(vz)], b = [px(vx + 1), fy(vx + 1, vz), pz(vz)], cc = [px(vx + 1), fy(vx + 1, vz + 1), pz(vz + 1)], d = [px(vx), fy(vx, vz + 1), pz(vz + 1)];
    const arr = byMat.get(mat) ?? (byMat.set(mat, []).get(mat)!);
    if ((vx + vz) % 2) arr.push(...a, ...d, ...cc, ...a, ...cc, ...b); else arr.push(...a, ...d, ...b, ...b, ...d, ...cc);
  }
  for (const [mat, P] of byMat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const uv: number[] = []; for (let i = 0; i < P.length; i += 3) uv.push(P[i], P[i + 2]);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, worldMat(mat, flag)); m.receiveShadow = true; m.castShadow = shadow;
    group.add(m);
  }
  group.userData.shared = false;
  // chunks on the crown of each stack: ore lumps, rocks, clods (fewer for fine earth)
  c.stacks.forEach((s, si) => {
    const [w, h] = c.dims(s.item, s.rot), k = Math.min(1, s.n / Math.max(1, itemDef(s.item).stack)), f = formOf(s.item);
    const x0 = s.x * RES, z0 = s.y * RES, x1 = Math.min(NX, (s.x + w) * RES), z1 = Math.min(NZ, (s.y + h) * RES);
    const cvx = Math.round((x0 + x1) / 2), cvz = Math.round((z0 + z1) / 2);
    const u0 = unitOf(s.item, 0), rw = w * cw, rd = h * cd;
    const sc = Math.min(1, (Math.min(rw, rd) * 0.42) / Math.max(1e-3, u0.size.x, u0.size.z));
    spots.set(s.item, { x: px(cvx), z: pz(cvz), y: fy(cvx, cvz), top: fy(cvx, cvz), s: sc, w: rw, d: rd });
    const n = f.pile === 'mound' ? (f.heap === 'dirt' || f.heap === 'sand' || f.heap === 'clay' ? Math.round(k * 2) : Math.round(1 + k * 3)) : Math.round(1 + k * Math.min(6, w * h));
    const r = new Rnd(si * 31 + c.id);
    for (let i = 0; i < n; i++) {
      const vx = Math.round(x0 + 1 + r.next() * Math.max(0, x1 - x0 - 2)), vz = Math.round(z0 + 1 + r.next() * Math.max(0, z1 - z0 - 2));
      const u = unitOf(s.item, i, i % 3), m = meshesOf(u.M.build(), flag, shadow);
      m.scale.setScalar(sc * (0.8 + r.next() * 0.3)); m.position.set(px(vx), fy(vx, vz) - u.size.y * sc * 0.3, pz(vz));
      m.rotation.set(r.r(-0.3, 0.3), r.r(0, Math.PI * 2), r.r(-0.3, 0.3));
      group.add(m);
    }
  });
  return { group, spots };
}
